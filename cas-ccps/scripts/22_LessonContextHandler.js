// =============================================================================
// FILE: 22_LessonContextHandler.js
// BOUND TO: Central Ledger spreadsheet AND the Teacher Dashboard standalone
//   web app — Script 07's submitLessonContext() calls onLessonContextSubmit_()
//   below directly, so this file (and its Script 26 dependency) must be
//   physically present in the Teacher Dashboard project too, not just
//   Central Ledger. See tools/gas-lint/project-map.json's
//   cas-ccps:teacher-dashboard entry.
// PURPOSE: Handles Lesson Context submissions routed from Script 07's
//          submitLessonContext() server function. Validates input, writes
//          to LessonContext tab, calls Script 26 directly to log alignment.
//
// ENTRY POINT:
//   onLessonContextSubmit_(payload) — called by Script 07's submitLessonContext()
//   payload shape: {
//     teacherEmail, teacherName,       // injected by S07 from Script Properties
//     lessonDate, periodOrClass,
//     learningObjective, activityDescription,
//     priorLessonConnection, keyVocabulary,
//     competencyIds                    // comma-separated string
//   }
//
// RETURNS:
//   { success: true,  lessonId, frameDocUrl }   // frameDocUrl is null if
//                                                // frame generation was
//                                                // skipped or deferred —
//                                                // see below
//   { success: false, error: "human-readable message" }
//
// TRIGGERS:
//   None — called synchronously by S07. S26 is called directly at end of
//   successful write, then S27 (27_LessonFrameGenerator.js's
//   generateLessonFrame_()) is called directly right after, only if S26
//   succeeded. Both are synchronous, deterministic compiles — no queue, no
//   AI call — see 27_LessonFrameGenerator.js's own header for why. A safety-
//   net time trigger (every 5 min) on runAlignmentLogBackfill_() catches any
//   RECEIVED rows S26 missed; there is no equivalent backfill for S27 — a
//   deferred frame generation just means frameDocUrl stays null for that
//   submission and 07_TeacherDashboard.js's client silently skips opening
//   a doc (see the "S27 hook" comment there).
//
// CONFIG KEYS (read from _CONFIG / Script Properties via getConfig_()):
//   CENTRAL_LEDGER_SS_ID   — already required by all scripts
//   M2_ENABLED             — "true" to activate Module 2 handlers
//   CURRENT_TERM           — term string, e.g. "2025-26 S2"
//
// TAB NAMES (via cfg.tabs):
//   cfg.tabs.lessonContext       — "LessonContext"
//   cfg.tabs.competencyRegistry  — "CompetencyRegistry"
//
// =============================================================================

// LessonContext column indices (0-based) — matches schema defined in schema doc.
// Column order is canonical: scripts write by index, not by name search,
// for performance. If columns are reordered, update these constants.
const LC_LESSON_ID              = 0;
const LC_TEACHER_EMAIL          = 1;
const LC_SUBMITTED_AT           = 2;
const LC_LESSON_DATE            = 3;
const LC_PERIOD_OR_CLASS        = 4;
const LC_ACTIVITY_DESCRIPTION   = 5;
const LC_LEARNING_OBJECTIVE     = 6;
const LC_KEY_VOCABULARY         = 7;
const LC_PRIOR_LESSON_CONNECTION = 8;
const LC_COMPETENCY_IDS         = 9;
const LC_STATUS                 = 10;
const LC_ALIGNMENT_LOGGED_AT    = 11;
const LC_ERROR_NOTES            = 12;
const LC_TERM                   = 13;

// Column 14 — 24_WarmUpBridge.js's warm_up_generated (QUEUED/DELIVERED
// status string). Reserved here, not written by this file, so nothing else
// ever claims this index. FOUND AND FIXED during the Script 27 build's own
// aftermath: LC_FRAME_DOC_ID was originally also assigned 14 — a genuine
// column collision with this pre-existing column, since 24_WarmUpBridge.js
// hardcodes LC24_WARM_UP_GENERATED = 14 / 25_WarmUpWriter.js hardcodes
// LC25_WARM_UP_GENERATED = 14 as read/write targets, independent of
// whatever _ensureFrameColumns_ below happened to write there. The frame
// columns were moved to 15-17 to resolve it; see HISTORY.md.
const LC_WARM_UP_GENERATED       = 14;

// Columns 15-17 — 27_LessonFrameGenerator.js. Added self-healing (see
// _ensureFrameColumns_ below) rather than only in createModule2Tabs_()'s
// initial header write, so a deployment created before this feature existed
// gets these columns on first use instead of needing a migration step —
// same convention as _ensureTurnInReviewColumns_() (07_TeacherDashboard.js)
// and _ensureScrDecisionLogArchiveColumn_() (30_SCRSuggestionEngine.js).
const LC_FRAME_DOC_ID            = 15;
const LC_FRAME_DOC_URL           = 16;
const LC_FRAME_GENERATED_AT      = 17;

// LessonContext status values
const LC_STATUS_RECEIVED          = "RECEIVED";
const LC_STATUS_ALIGNMENT_LOGGED  = "ALIGNMENT_LOGGED";
// FRAME_GENERATED — closes the gap between what CAS_M2_Schema.html's status
// lifecycle table has always described (RECEIVED → ALIGNMENT_LOGGED →
// FRAME_GENERATED) and what this file actually implemented before Script 27
// existed (only RECEIVED/ALIGNMENT_LOGGED/SUPERSEDED/ERROR). That same doc
// also mentions a PUBLISHED status; no mechanism for it exists anywhere in
// this repo, so it stays undocumented rather than invented here.
const LC_STATUS_FRAME_GENERATED   = "FRAME_GENERATED";
const LC_STATUS_SUPERSEDED        = "SUPERSEDED";
const LC_STATUS_ERROR             = "ERROR";

// ---------------------------------------------------------------------------
// _ensureFrameColumns_
// Idempotent header add for columns 16-18 (1-based) — frame_doc_id,
// frame_doc_url, frame_generated_at. Deliberately starts one column past
// LC_WARM_UP_GENERATED (column 15, 1-based) rather than adjacent to `term`,
// so this function can never clobber 24_WarmUpBridge.js's warm_up_generated
// header even on a deployment where that column hasn't been added yet.
// Safe to call on every generateLessonFrame_() invocation; a no-op once the
// headers exist.
// ---------------------------------------------------------------------------
function _ensureFrameColumns_(lcSheet) {
  const headers = ["frame_doc_id", "frame_doc_url", "frame_generated_at"];
  const startCol = LC_FRAME_DOC_ID + 1; // 16, 1-based
  headers.forEach((name, i) => {
    const cell = lcSheet.getRange(1, startCol + i);
    if (String(cell.getValue()).trim() !== name) {
      cell.setValue(name);
    }
  });
}

// ---------------------------------------------------------------------------
// onLessonContextSubmit_ — primary entry point
// Called by Script 07's submitLessonContext() server function.
// ---------------------------------------------------------------------------
function onLessonContextSubmit_(payload) {
  const cfg = getConfig_();

  // ── Guard: Module 2 enabled check ────────────────────────────────────────
  // FIXED: was opt-out (`=== "false"`, so an unset/blank property let Module 2
  // run) — the only backend guard out of step with 07_TeacherDashboard.js's
  // strict opt-in (`m2Enabled === "true"`), which decides whether the "+ New
  // Lesson" button (the sole path that calls this handler) even renders. An
  // installation that never explicitly set M2_ENABLED could reach this
  // handler with a hidden UI on every other Module 2 surface. Unified to the
  // same strict opt-in check used everywhere else in Module 2.
  const m2Enabled = PropertiesService.getScriptProperties()
    .getProperty("M2_ENABLED");
  if (m2Enabled !== "true") {
    return { success: false, error: "Module 2 is not enabled on this installation." };
  }

  // ── Tab availability check ────────────────────────────────────────────────
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const lcSheet = ss.getSheetByName(cfg.tabs.lessonContext);
  if (!lcSheet) {
    Logger.log("[S22] LessonContext tab not found.");
    return {
      success: false,
      error:   "LessonContext tab not found. Run the Module 2 setup wizard first."
    };
  }

  // ── Validate payload ──────────────────────────────────────────────────────
  const validation = validateLessonPayload_(payload, cfg, ss);
  if (!validation.valid) {
    Logger.log("[S22] Validation failed: " + validation.error);
    return { success: false, error: validation.error };
  }

  // ── Resolve term ──────────────────────────────────────────────────────────
  const currentTerm = PropertiesService.getScriptProperties()
    .getProperty("CURRENT_TERM") || "";

  // ── Deduplication: supersede existing RECEIVED row for same slot ──────────
  // Same teacher + date + period = same lesson slot. If resubmitting,
  // mark the old row SUPERSEDED before writing the new one.
  supersedeDuplicates_(lcSheet, payload.teacherEmail, payload.lessonDate, payload.periodOrClass);

  // ── Generate lesson ID ────────────────────────────────────────────────────
  const lessonId = generateLessonId_();

  // ── Build row ─────────────────────────────────────────────────────────────
  // Row length must match column count defined by LC_ constants above (14 cols).
  const row = new Array(14).fill("");
  row[LC_LESSON_ID]               = lessonId;
  row[LC_TEACHER_EMAIL]           = payload.teacherEmail;
  row[LC_SUBMITTED_AT]            = new Date();
  row[LC_LESSON_DATE]             = payload.lessonDate;       // "YYYY-MM-DD" string
  row[LC_PERIOD_OR_CLASS]         = payload.periodOrClass     || "";
  row[LC_ACTIVITY_DESCRIPTION]    = payload.activityDescription;
  row[LC_LEARNING_OBJECTIVE]      = payload.learningObjective;
  row[LC_KEY_VOCABULARY]          = payload.keyVocabulary     || "";
  row[LC_PRIOR_LESSON_CONNECTION] = payload.priorLessonConnection || "";
  row[LC_COMPETENCY_IDS]          = validation.normalizedCompetencyIds; // trimmed, validated
  row[LC_STATUS]                  = LC_STATUS_RECEIVED;
  row[LC_ALIGNMENT_LOGGED_AT]     = "";
  row[LC_ERROR_NOTES]             = "";
  row[LC_TERM]                    = currentTerm;

  // ── Write to LessonContext tab ────────────────────────────────────────────
  try {
    lcSheet.appendRow(row);
    Logger.log("[S22] LessonContext row written — LessonID: " + lessonId +
               " | Teacher: " + payload.teacherEmail +
               " | Date: " + payload.lessonDate);
  } catch (err) {
    Logger.log("[S22] appendRow error: " + err.message);
    return { success: false, error: "Could not write lesson record. Please try again." };
  }

  // ── Call Script 26 directly ───────────────────────────────────────────────
  // S26 reads LessonContext rows with status=RECEIVED and alignment_logged_at=""
  // and writes AlignmentLog rows. Calling directly (not via queue) because
  // the lightweight build has no concurrency pressure here.
  let frameDocUrl = null;
  try {
    const alignResult = logAlignmentForLesson_(lessonId);
    if (!alignResult.success) {
      // Alignment logging failed — row is written and RECEIVED, safety-net
      // trigger will retry. Not a user-facing error. Frame generation is
      // skipped this submission — it reads the row's competency alignment,
      // which S26 hasn't written yet — rather than attempted against a row
      // still in RECEIVED. There is no backfill trigger for S27; a deferred
      // frame just means frameDocUrl stays null this time.
      Logger.log("[S22] S26 call failed for " + lessonId + ": " + alignResult.error);
      writeErrorNote_(lcSheet, lessonId, "Alignment logging deferred: " + alignResult.error);
    } else {
      // ── Call Script 27 directly ─────────────────────────────────────────
      // Synchronous, deterministic compile — see 27_LessonFrameGenerator.js's
      // own header for why this isn't an async/queued flow. A failure here
      // must never fail the lesson submission itself: the row is already
      // written and alignment-logged either way, so this is wrapped exactly
      // like the S26 call above.
      try {
        const frameResult = generateLessonFrame_(lessonId);
        if (frameResult && frameResult.success && frameResult.docUrl) {
          frameDocUrl = frameResult.docUrl;
        } else if (frameResult && !frameResult.success) {
          Logger.log("[S22] S27 call failed for " + lessonId + ": " + frameResult.error);
          writeErrorNote_(lcSheet, lessonId, "Lesson frame generation deferred: " + frameResult.error);
        }
        // frameResult.skipped (e.g. row already FRAME_GENERATED by a prior
        // call) is not an error — same "not an error, already processed"
        // idiom S26 itself uses — so no note is written for that case.
      } catch (frameErr) {
        Logger.log("[S22] S27 threw: " + frameErr.message);
        writeErrorNote_(lcSheet, lessonId, "Lesson frame generation deferred: " + frameErr.message);
      }
    }
  } catch (err) {
    // Non-fatal — row is written, backfill trigger will catch it
    Logger.log("[S22] S26 threw: " + err.message);
    writeErrorNote_(lcSheet, lessonId, "Alignment logging deferred: " + err.message);
  }

  // ── Return success ────────────────────────────────────────────────────────
  return {
    success:     true,
    lessonId:    lessonId,
    frameDocUrl: frameDocUrl  // populated above when S27 succeeded this run
  };
}

// ---------------------------------------------------------------------------
// validateLessonPayload_
// Returns { valid: true, normalizedCompetencyIds: "ID1,ID2" }
//      or { valid: false, error: "human-readable" }
// ---------------------------------------------------------------------------
function validateLessonPayload_(payload, cfg, ss) {
  // ── Required fields ───────────────────────────────────────────────────────
  if (!payload.teacherEmail || !payload.teacherEmail.trim()) {
    return { valid: false, error: "Teacher identity could not be determined. Contact your administrator." };
  }
  if (!payload.lessonDate || !payload.lessonDate.trim()) {
    return { valid: false, error: "Lesson date is required." };
  }
  if (!payload.learningObjective || !payload.learningObjective.trim()) {
    return { valid: false, error: "Learning objective is required." };
  }
  if (!payload.activityDescription || !payload.activityDescription.trim()) {
    return { valid: false, error: "Activity description is required." };
  }
  if (!payload.competencyIds || !payload.competencyIds.trim()) {
    return { valid: false, error: "At least one competency must be selected." };
  }

  // ── Date validation ───────────────────────────────────────────────────────
  const dateObj = new Date(payload.lessonDate + "T00:00:00");
  if (isNaN(dateObj.getTime())) {
    return { valid: false, error: "Lesson date is not a valid date." };
  }
  // Warn if date is more than 30 days in the past — likely a mistake
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (dateObj < thirtyDaysAgo) {
    return { valid: false, error: "Lesson date is more than 30 days in the past. Please check the date." };
  }
  // Symmetric guard for the other direction — only the past-date case was
  // checked before, so a fat-fingered year (e.g. 2027 instead of 2026) was
  // silently accepted with no warning either client- or server-side.
  const sevenDaysAhead = new Date();
  sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
  if (dateObj > sevenDaysAhead) {
    return { valid: false, error: "Lesson date is more than 7 days in the future. Please check the date." };
  }

  // ── Competency ID validation ──────────────────────────────────────────────
  const rawIds = payload.competencyIds.split(",").map(id => id.trim()).filter(Boolean);
  if (rawIds.length === 0) {
    return { valid: false, error: "At least one competency must be selected." };
  }

  const compResult = validateCompetencyIds_(rawIds, cfg, ss);
  if (!compResult.valid) return compResult;

  return {
    valid:                   true,
    normalizedCompetencyIds: compResult.normalizedIds
  };
}

// ---------------------------------------------------------------------------
// validateCompetencyIds_
// Checks each ID against the CompetencyRegistry. All IDs must exist and
// have active=TRUE (or no active column). Returns the normalized ID string.
// ---------------------------------------------------------------------------
function validateCompetencyIds_(ids, cfg, ss) {
  const regSheet = ss.getSheetByName(cfg.tabs.competencyRegistry);
  if (!regSheet) {
    // Registry missing — can't validate. Log and pass through rather than
    // blocking the teacher. Error surfaced in admin health check.
    Logger.log("[S22] CompetencyRegistry not found — skipping ID validation.");
    return { valid: true, normalizedIds: ids.join(",") };
  }

  const data    = regSheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iId     = headers.indexOf("competency_id");
  const iActive = headers.indexOf("active");

  if (iId === -1) {
    Logger.log("[S22] CompetencyRegistry missing competency_id column — skipping validation.");
    return { valid: true, normalizedIds: ids.join(",") };
  }

  // Build active ID set
  const activeIds = new Set();
  for (let i = 1; i < data.length; i++) {
    const rowId     = String(data[i][iId]).trim();
    const rowActive = iActive === -1 ? true :
      String(data[i][iActive]).trim().toUpperCase() !== "FALSE";
    if (rowId && rowActive) activeIds.add(rowId);
  }

  const unknown = ids.filter(id => !activeIds.has(id));
  if (unknown.length > 0) {
    return {
      valid: false,
      error: "Unknown or inactive competency ID" +
             (unknown.length > 1 ? "s" : "") + ": " + unknown.join(", ") +
             ". Check the CompetencyRegistry tab."
    };
  }

  return { valid: true, normalizedIds: ids.join(",") };
}

// ---------------------------------------------------------------------------
// _normalizeLessonDateCell_ — the lesson_date column is written as a plain
// "YYYY-MM-DD" string, but Sheets auto-detects ISO-formatted date strings
// written via appendRow()/setValues() and silently stores them as a real
// Date value instead (no tab-creation path ever forces this column to text
// format). String(dateCell) on a Date object produces something like
// "Thu Jan 15 2026 00:00:00 GMT-0500…", which never equals a plain
// "2026-01-15" comparison string — this used to make supersedeDuplicates_()
// (here) and findLesson_() (24_WarmUpBridge.js) silently fail to match rows
// whose date cell had been coerced, breaking dedup and the nightly warm-up
// queue with no visible error. Normalizing both sides to a canonical
// YYYY-MM-DD string, regardless of the cell's actual stored type, fixes
// this for both already-coerced (existing) rows and any future ones.
// Shared with 24_WarmUpBridge.js's findLesson_().
function _normalizeLessonDateCell_(value) {
  if (value instanceof Date) return formatDateYMD_(value);
  return String(value || "").trim();
}

// ---------------------------------------------------------------------------
// supersedeDuplicates_
// Marks any existing RECEIVED rows for the same teacher+date+period slot
// as SUPERSEDED. Called before writing the new row.
// ---------------------------------------------------------------------------
function supersedeDuplicates_(lcSheet, teacherEmail, lessonDate, periodOrClass) {
  const data = lcSheet.getDataRange().getValues();
  const period = (periodOrClass || "").trim().toLowerCase();
  const targetDate = _normalizeLessonDateCell_(lessonDate);

  for (let i = 1; i < data.length; i++) {
    const rowEmail  = String(data[i][LC_TEACHER_EMAIL]).trim().toLowerCase();
    const rowDate   = _normalizeLessonDateCell_(data[i][LC_LESSON_DATE]);
    const rowPeriod = String(data[i][LC_PERIOD_OR_CLASS]).trim().toLowerCase();
    const rowStatus = String(data[i][LC_STATUS]).trim();

    if (
      rowEmail  === teacherEmail.toLowerCase() &&
      rowDate   === targetDate &&
      rowPeriod === period &&
      rowStatus === LC_STATUS_RECEIVED
    ) {
      // +1 for 1-based row index, +1 for header row
      lcSheet.getRange(i + 1, LC_STATUS + 1).setValue(LC_STATUS_SUPERSEDED);
      Logger.log("[S22] Superseded row " + (i + 1) + " — LessonID: " + data[i][LC_LESSON_ID]);
    }
  }
}

// ---------------------------------------------------------------------------
// writeErrorNote_ — updates error_notes on the row matching lessonId
// Used when S26 call fails after a successful write. Non-fatal.
// ---------------------------------------------------------------------------
function writeErrorNote_(lcSheet, lessonId, note) {
  try {
    const data = lcSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][LC_LESSON_ID]).trim() === lessonId) {
        lcSheet.getRange(i + 1, LC_ERROR_NOTES + 1).setValue(note);
        return;
      }
    }
  } catch (e) {
    Logger.log("[S22] writeErrorNote_ failed: " + e.message);
  }
}

// ---------------------------------------------------------------------------
// generateLessonId_
// Format: LES-YYYYMMDD-XXXXXX (6 hex chars, getUuid()-derived)
//
// FIXED: used to be Math.floor(Math.random() * 0xffff) — only 65,536
// possible values/day with no uniqueness check against existing rows. Now
// matches the Utilities.getUuid()-derived pattern
// 15c_Flow2DirectEvaluationService.js's _generateEvidenceId_() already
// established for exactly this reason (24_WarmUpBridge.js's
// generateQueueId_() got the identical fix).
// ---------------------------------------------------------------------------
function generateLessonId_() {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  const hex  = Utilities.getUuid().replace(/-/g, "").substring(0, 6).toUpperCase();
  return "LES-" + yyyy + mm + dd + "-" + hex;
}

// ---------------------------------------------------------------------------
// runAlignmentLogBackfill_
// Time-trigger safety net — runs every 5 minutes.
// Picks up any RECEIVED rows where alignment_logged_at is empty,
// i.e. rows where the direct S26 call in onLessonContextSubmit_ failed.
// Install via Script 22's self-registering trigger setup (below).
// ---------------------------------------------------------------------------
function runAlignmentLogBackfill_() {
  const cfg    = getConfig_();
  const ss     = SpreadsheetApp.openById(cfg.ledgerSsId);
  const lcSheet = ss.getSheetByName(cfg.tabs.lessonContext);
  if (!lcSheet) return;

  const data = lcSheet.getDataRange().getValues();
  let processed = 0;

  for (let i = 1; i < data.length; i++) {
    const status      = String(data[i][LC_STATUS]).trim();
    const loggedAt    = String(data[i][LC_ALIGNMENT_LOGGED_AT]).trim();

    if (status !== LC_STATUS_RECEIVED || loggedAt !== "") continue;

    const lessonId = String(data[i][LC_LESSON_ID]).trim();
    if (!lessonId) continue;

    try {
      const result = logAlignmentForLesson_(lessonId);
      if (result.success) {
        processed++;
        Logger.log("[S22 BACKFILL] Processed " + lessonId);
      } else {
        Logger.log("[S22 BACKFILL] S26 returned failure for " + lessonId + ": " + result.error);
      }
    } catch (err) {
      Logger.log("[S22 BACKFILL] Error for " + lessonId + ": " + err.message);
    }
  }

  if (processed > 0) {
    Logger.log("[S22 BACKFILL] Processed " + processed + " deferred lesson(s).");
  }
}

// ---------------------------------------------------------------------------
// installModule2Triggers_
// Run once manually from the Script Editor to install the backfill trigger.
// Safe to re-run — checks for existing trigger before installing.
// Also confirms required tabs exist and logs their status.
// ---------------------------------------------------------------------------
function installModule2Triggers_() {
  // Check for existing backfill trigger
  const existing = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runAlignmentLogBackfill_");

  if (existing.length === 0) {
    ScriptApp.newTrigger("runAlignmentLogBackfill_")
      .timeBased()
      .everyMinutes(5)
      .create();
    Logger.log("[S22] Backfill trigger installed: runAlignmentLogBackfill_ every 5 min.");
  } else {
    Logger.log("[S22] Backfill trigger already installed — skipping.");
  }

  // Health check: verify required tabs exist
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);
  const requiredTabs = [
    cfg.tabs.lessonContext,
    cfg.tabs.competencyRegistry,
    cfg.tabs.alignmentLog,
    cfg.tabs.reportRegistry
  ];
  requiredTabs.forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    Logger.log("[S22] Tab '" + tabName + "': " + (sheet ? "FOUND" : "MISSING — run setup wizard"));
  });

  Logger.log("[S22] Module 2 trigger install complete.");
}

// ---------------------------------------------------------------------------
// createModule2Tabs_
// Run once manually if Script 28 (setup wizard extension) doesn't yet exist.
// Creates LessonContext, CompetencyRegistry, and AlignmentLog tabs with
// correct headers. Safe to re-run — skips tabs that already exist.
// ---------------------------------------------------------------------------
function createModule2Tabs_() {
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);

  // LessonContext — lesson_date (col 4) forced to text format: Sheets
  // otherwise silently auto-detects the "YYYY-MM-DD" strings this column
  // is written with and stores them as real Date values instead, which
  // broke supersedeDuplicates_()/findLesson_()'s string comparisons (see
  // _normalizeLessonDateCell_ below — that fix handles rows written before
  // this format existed; this prevents new rows from needing it at all).
  // "warm_up_generated" (col 15) is included here for fresh installs so it
  // never needs 24_WarmUpBridge.js's manual createLessonContextWarmUpColumn_()
  // migration at all — and so the frame columns that follow it can never
  // land in its slot. See LC_WARM_UP_GENERATED's own comment above for why
  // that matters.
  _createTabIfMissing_(ss, cfg.tabs.lessonContext, [
    "lesson_id", "teacher_email", "submitted_at", "lesson_date",
    "period_or_class", "activity_description", "learning_objective",
    "key_vocabulary", "prior_lesson_connection", "competency_ids",
    "status", "alignment_logged_at", "error_notes", "term",
    "warm_up_generated",
    "frame_doc_id", "frame_doc_url", "frame_generated_at"
  ], [4]);

  // CompetencyRegistry
  _createTabIfMissing_(ss, cfg.tabs.competencyRegistry, [
    "competency_id", "competency_text", "subject", "grade_band",
    "strand", "teacher_email", "active"
  ]);

  // AlignmentLog — same lesson_date risk, same fix (col 4).
  _createTabIfMissing_(ss, cfg.tabs.alignmentLog, [
    "log_id", "lesson_id", "logged_at", "lesson_date",
    "teacher_email", "learning_objective", "competency_id",
    "competency_text", "strand"
  ], [4]);

  // ReportRegistry — append-only record of every generated alignment report
  _createTabIfMissing_(ss, cfg.tabs.reportRegistry, [
    "report_id", "generated_at", "term", "teacher_email",
    "doc_id", "doc_url", "report_type"
  ]);

  Logger.log("[S22] Module 2 tab creation complete.");
}

// textColumns: optional array of 1-based column indices to force to plain
// text format, so ISO-date-shaped strings written into them later never
// get silently auto-converted to a real Date value by Sheets.
function _createTabIfMissing_(ss, tabName, headers, textColumns) {
  if (ss.getSheetByName(tabName)) {
    Logger.log("[S22] Tab '" + tabName + "' already exists — skipping.");
    return;
  }
  const sheet = ss.insertSheet(tabName);
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  (textColumns || []).forEach(col => {
    sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  });
  Logger.log("[S22] Created tab: " + tabName);
}
