// =============================================================================
// FILE: 06_StagingPipeline_Turnstile.js
// BOUND TO: Central Ledger spreadsheet (same project as Scripts 03 + 10)
// PURPOSE: Per-teacher lane turnstile. Each teacher's evaluation queue is
//          independent — one teacher's in-flight evaluation does not block
//          other teachers' students.
//
//          Stale detection: rows stuck IN_PROCESS for more than 12 minutes
//          are auto-demoted to ERROR_TIMEOUT, freeing that teacher's lane
//          without admin intervention.
//
// STAGING_PIPELINE SCHEMA (0-based):
//   0: Timestamp | 1: QueueRowRef | 2: StudentFileID | 3: ConfigID
//   4: TeacherEmail | 5: Status
//   (TeacherEmail added by Script 03 bridgeQueue at staging time)
//
// TRIGGER: Time-driven — every 1 minute → runStagingTurnstile
// =============================================================================

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
    const STALE_THRESHOLD_MS = 12 * 60 * 1000; // 12 minutes

    const busyLanes           = new Set();
    const pendingByTeacher    = {};

    // ── PASS 1: evaluate lane health, auto-clear timed-out lanes ─────────────
    for (let i = 1; i < data.length; i++) {
      const status   = String(data[i][statusIdx]).trim();
      const teacher  = String(data[i][teacherIdx]).trim() || "UNKNOWN";
      const rowTime  = timestampIdx !== -1
        ? new Date(data[i][timestampIdx]).getTime() : NaN;

      if (status === "IN_PROCESS") {
        const elapsed = now - rowTime;
        if (!isNaN(rowTime) && elapsed > STALE_THRESHOLD_MS) {
          // Lane timed out — demote and free it
          sheet.getRange(i + 1, statusIdx + 1).setValue("ERROR_TIMEOUT");
          Logger.log("[TURNSTILE] Stale lane cleared — Row " + (i + 1) +
                     " | Teacher: " + teacher +
                     " | Elapsed: " + Math.round(elapsed / 60000) + " min");
          // Do NOT add to busyLanes — lane is now free
        } else {
          busyLanes.add(teacher); // Legitimately in-flight
        }
      }

      if (status === "PENDING_INFERENCE") {
        if (!pendingByTeacher[teacher]) pendingByTeacher[teacher] = [];
        pendingByTeacher[teacher].push(i + 1); // 1-based row number
      }
    }

    // ── PASS 2: release one FIFO row per open teacher lane ───────────────────
    let released = 0;
    for (const teacher in pendingByTeacher) {
      if (busyLanes.has(teacher)) continue; // Legitimately busy — skip

      const targetRow = pendingByTeacher[teacher][0]; // FIFO — oldest first
      sheet.getRange(targetRow, statusIdx + 1).setValue("IN_PROCESS");
      sheet.getRange(targetRow, timestampIdx + 1).setValue(new Date()); // Arm stale timer
      Logger.log("[TURNSTILE] Released → Row " + targetRow +
                 " | Teacher: " + teacher);
      released++;
    }

    if (released > 0) {
      SpreadsheetApp.flush();
      Logger.log("[TURNSTILE] " + released + " lane(s) released this cycle.");
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
// runSingleLaneTurnstile_ — fallback for pre-migration schema
// Preserves original behavior if TeacherEmail column not yet added
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
