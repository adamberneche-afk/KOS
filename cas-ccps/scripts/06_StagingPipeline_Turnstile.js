// =============================================================================
// FILE: 06_StagingPipeline_Turnstile.js
// BOUND TO: Central Ledger spreadsheet (same project as Scripts 03 + 10)
// PURPOSE: Per-teacher lane turnstile. Each teacher's evaluation queue is
//          independent — one teacher's in-flight evaluation does not block
//          other teachers' students.
//
//          Parallel lanes (2026-11-14): up to FLOW2_PARALLEL_LANES rows per
//          teacher are IN_PROCESS at once (default 3; 1 is the old one at a
//          time). On 11-13, with Studio's Flow 2 not answering, one lane
//          timed 14 submissions out one after another, about 12.5 minutes
//          apart; and on a normal day a class submitting together waited in
//          single file. Each row still times out on its own, oldest first.
//          The ceiling (TURNSTILE_MAX_LANES) is there because Studio drops
//          runs when many rows change at once (41, 2026-10-18).
//
//          Stale detection: rows stuck IN_PROCESS for more than 12 minutes
//          are auto-demoted to ERROR_TIMEOUT, freeing that teacher's lane
//          without admin intervention.
//
//          A row IN_PROCESS with no readable timestamp can't age, so it
//          would hold its teacher's lane forever (seen live 2026-10-12: a
//          hand-added test row). It no longer holds the lane; it's left as
//          it is and reported by the health check (10), the queue watchdog
//          (34) and the CAS attention signal (34b).
//
// STAGING_PIPELINE SCHEMA (0-based):
//   0: Timestamp | 1: QueueRowRef | 2: StudentFileID | 3: ConfigID
//   4: TeacherEmail | 5: Status
//   (TeacherEmail added by Script 03 bridgeQueue at staging time)
//
// TRIGGER: Time-driven — every 1 minute → runStagingTurnstile
// =============================================================================

const TURNSTILE_LANES_KEY = "FLOW2_PARALLEL_LANES";
const TURNSTILE_DEFAULT_LANES = 3;
const TURNSTILE_MAX_LANES = 10;
// A row IN_PROCESS longer than this is timed out (PASS 1 below).
const TURNSTILE_STALE_MS = 12 * 60 * 1000;

// How many rows each teacher may have IN_PROCESS at once: the
// FLOW2_PARALLEL_LANES setting (a Script Property, or the Central Ledger's
// _CONFIG tab), a whole number from 1 to TURNSTILE_MAX_LANES. Unset,
// unreadable or not a whole number: the default, and the log says why.
function turnstileLanes_() {
  let raw = "";
  try {
    raw = String(_resolveConfigValues_().values[TURNSTILE_LANES_KEY] || "").trim();
  } catch (e) {
    raw = "";
  }
  if (!raw) return TURNSTILE_DEFAULT_LANES;
  const n = Number(raw);
  if (!(n >= 1) || Math.floor(n) !== n) {
    Logger.log("[TURNSTILE] " + TURNSTILE_LANES_KEY + " = \"" + raw.slice(0, 20) +
               "\" is not a whole number of 1 or more — using " + TURNSTILE_DEFAULT_LANES + ".");
    return TURNSTILE_DEFAULT_LANES;
  }
  return Math.min(n, TURNSTILE_MAX_LANES);
}

function runStagingTurnstile() {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[TURNSTILE] Parallel block congestion — standing down.");
    return;
  }

  try {
    const cfg   = getConfig_();
    const ss    = SpreadsheetApp.openById(cfg.adminSsId);
    const sheet = ss.getSheetByName(cfg.tabs.stagingPipeline);

    if (!sheet) throw new Error("STAGING_PIPELINE tab not found.");

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      Logger.log("[TURNSTILE] Pipeline empty.");
      return;
    }

    const headers        = data[0].map(h => String(h).trim());
    const statusIdx      = headers.indexOf("Status");
    const teacherIdx     = headers.indexOf("TeacherEmail");
    const timestampIdx   = headers.indexOf("Timestamp");

    if (statusIdx === -1) {
      throw new Error("Status column not found in STAGING_PIPELINE.");
    }

    // If TeacherEmail column is missing (pre-migration schema), fall back to
    // single-lane mode so existing deployments don't break on upgrade
    const multiLane = (teacherIdx !== -1 && timestampIdx !== -1);
    if (!multiLane) {
      Logger.log("[TURNSTILE] TeacherEmail column not found — running single-lane mode. " +
                 "Re-deploy Script 03 to enable per-teacher lanes.");
      runSingleLaneTurnstile_(sheet, data, statusIdx);
      return;
    }

    const now                = Date.now();
    const STALE_THRESHOLD_MS = TURNSTILE_STALE_MS; // 12 minutes, per row
    const lanes              = turnstileLanes_();

    const busyByTeacher       = {}; // teacher -> rows legitimately in flight
    const pendingByTeacher    = {};

    // ── PASS 1: evaluate lane health, auto-clear timed-out lanes ─────────────
    for (let i = 1; i < data.length; i++) {
      const status   = String(data[i][statusIdx]).trim();
      const teacher  = String(data[i][teacherIdx]).trim() || "UNKNOWN";
      const rowTime  = timestampIdx !== -1
        ? new Date(data[i][timestampIdx]).getTime() : NaN;

      if (status === "IN_PROCESS") {
        const elapsed = now - rowTime;
        if (timestampIdx !== -1 && isNaN(rowTime)) {
          // (No Timestamp column at all is a different fault: every row
          // would look like this, so the lane stays held as before.)
          Logger.log("[TURNSTILE] Row " + (i + 1) + " is IN_PROCESS with no timestamp — " +
                     "not holding the lane for it. See the System Health Check.");
        } else if (elapsed > STALE_THRESHOLD_MS) {
          // Lane timed out — demote and free it
          sheet.getRange(i + 1, statusIdx + 1).setValue("ERROR_TIMEOUT");
          Logger.log("[TURNSTILE] Stale lane cleared — Row " + (i + 1) +
                     " | Teacher: " + teacher +
                     " | Elapsed: " + Math.round(elapsed / 60000) + " min");
          // Not counted as busy — its lane is now free
        } else {
          busyByTeacher[teacher] = (busyByTeacher[teacher] || 0) + 1; // Legitimately in-flight
        }
      }

      if (status === "PENDING_INFERENCE") {
        if (!pendingByTeacher[teacher]) pendingByTeacher[teacher] = [];
        pendingByTeacher[teacher].push(i + 1); // 1-based row number
      }
    }

    // ── PASS 2: fill each teacher's free lanes, FIFO ─────────────────────────
    let released = 0;
    for (const teacher in pendingByTeacher) {
      const free = lanes - (busyByTeacher[teacher] || 0);
      if (free <= 0) continue; // Every lane legitimately busy — skip

      // FIFO — oldest first
      pendingByTeacher[teacher].slice(0, free).forEach(function (targetRow) {
        sheet.getRange(targetRow, statusIdx + 1).setValue("IN_PROCESS");
        sheet.getRange(targetRow, timestampIdx + 1).setValue(new Date()); // Arm its stale timer
        Logger.log("[TURNSTILE] Released → Row " + targetRow +
                   " | Teacher: " + teacher);
        released++;
      });
    }

    if (released > 0) {
      SpreadsheetApp.flush();
      Logger.log("[TURNSTILE] " + released + " row(s) released this cycle (up to " + lanes +
                 " per teacher).");
    } else {
      Logger.log("[TURNSTILE] No open lanes with pending rows.");
    }

  } catch (err) {
    Logger.log("[TURNSTILE] Critical failure: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// The Ledger cycle's check (64's LC_GATES, 2026-11-15): the turnstile has
// work when a row is PENDING_INFERENCE, or IN_PROCESS long enough to time
// out (a minute early, so a check never comes late). An IN_PROCESS row with
// no readable timestamp is only logged by the job, so it isn't work. Reads
// STAGING_PIPELINE's header and rows (six columns, shared with the other
// checks). Keep in step with runStagingTurnstile above.
// ---------------------------------------------------------------------------
function turnstileHasWork_(ctx) {
  const tab = ctx.cfg().tabs.stagingPipeline;
  const rows = ctx.rows("admin", tab, 1, 0);
  if (rows === null) return true; // no tab: the job throws and logs it
  if (!rows.length) return false;  // "Pipeline empty."
  const head = ctx.header("admin", tab);
  const statusIdx = head.indexOf("Status");
  const teacherIdx = head.indexOf("TeacherEmail");
  const timestampIdx = head.indexOf("Timestamp");
  if (statusIdx === -1) return true;
  const multiLane = teacherIdx !== -1 && timestampIdx !== -1;
  const now = Date.now();
  return rows.some(function (r) {
    const st = String(r[statusIdx]).trim();
    if (st === "PENDING_INFERENCE") return true;
    if (st !== "IN_PROCESS" || !multiLane) return false;
    const at = new Date(r[timestampIdx]).getTime();
    return !isNaN(at) && now - at > TURNSTILE_STALE_MS - 60 * 1000;
  });
}

// ---------------------------------------------------------------------------
// runSingleLaneTurnstile_ — fallback for pre-migration schema
// Preserves original behavior if TeacherEmail column not yet added: one row
// in flight across every teacher, whatever FLOW2_PARALLEL_LANES says.
// ---------------------------------------------------------------------------
function runSingleLaneTurnstile_(sheet, data, statusIdx) {
  const busy = data.some(
    (row, i) => i > 0 && String(row[statusIdx]).trim() === "IN_PROCESS"
  );
  if (busy) {
    Logger.log("[TURNSTILE] Single-lane: system busy.");
    return;
  }
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][statusIdx]).trim() === "PENDING_INFERENCE") {
      sheet.getRange(i + 1, statusIdx + 1).setValue("IN_PROCESS");
      SpreadsheetApp.flush();
      Logger.log("[TURNSTILE] Single-lane: Row " + (i + 1) + " → IN_PROCESS.");
      return;
    }
  }
  Logger.log("[TURNSTILE] Single-lane: queue clear.");
}

// =============================================================================
// MIGRATION NOTE — Existing Deployments
// =============================================================================
// If you deployed before this update, your STAGING_PIPELINE tab has 5 columns:
//   Timestamp | QueueRowRef | StudentFileID | ConfigID | Status
//
// The new schema has 6 columns:
//   Timestamp | QueueRowRef | StudentFileID | ConfigID | TeacherEmail | Status
//
// Script 06 detects the missing TeacherEmail column and falls back to
// single-lane mode automatically — your system will NOT break.
//
// To upgrade to per-teacher lanes:
//   1. Open the Central Ledger Spreadsheet
//   2. Go to the STAGING_PIPELINE tab
//   3. Make sure the tab is empty (wait for any active evaluations to finish)
//   4. Insert a new column E — name it "TeacherEmail"
//   5. Move the "Status" header from column E to column F
//   6. Replace Script 03 with the updated version
//
// After that, Script 03's bridgeQueue will populate TeacherEmail on all new
// rows and Script 06 will automatically switch to per-teacher lane mode.
// =============================================================================
