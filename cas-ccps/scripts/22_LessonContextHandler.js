// =============================================================================
// FILE: 22_LessonContextHandler.js
// BOUND TO: Central Ledger spreadsheet
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
//   { success: true,  lessonId, frameDocUrl: null }
//   { success: false, error: "human-readable message" }
//
// TRIGGERS:
//   None — called synchronously by S07. S26 is called directly at end of
//   successful write. A safety-net time trigger (every 5 min) on
//   runAlignmentLogBackfill_() catches any RECEIVED rows S26 missed.
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

// LessonContext status values
const LC_STATUS_RECEIVED          = "RECEIVED";
const LC_STATUS_ALIGNMENT_LOGGED  = "ALIGNMENT_LOGGED";
const LC_STATUS_SUPERSEDED        = "SUPERSEDED";
const LC_STATUS_ERROR             = "ERROR";

// ---------------------------------------------------------------------------
// onLessonContextSubmit_ — primary entry point
// Called by Script 07's submitLessonContext() server function.
// ---------------------------------------------------------------------------
function onLessonContextSubmit_(payload) {
  const cfg = getConfig_();

  // ── Guard: Module 2 enabled check ────────────────────────────────────────
  const m2Enabled = PropertiesService.getScriptProperties()
    .getProperty("M2_ENABLED");
  if (m2Enabled && m2Enabled.toLowerCase() === "false") {
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
  try {
    const alignResult = logAlignmentForLesson_(lessonId);
    if (!alignResult.success) {
      // Alignment logging failed — row is written and RECEIVED, safety-net
      // trigger will retry. Not a user-facing error.
      Logger.log("[S22] S26 call failed for " + lessonId + ": " + alignResult.error);
      writeErrorNote_(lcSheet, lessonId, "Alignment logging deferred: " + alignResult.error);
    }
  } catch (err) {
    // Non-fatal — row is written, backfill trigger will catch it
    Logger.log("[S22] S26 threw: " + err.message);
    writeErrorNote_(lcSheet, lessonId, "Alignment logging deferred: " + err.message);
  }

  // ── Return success ────────────────────────────────────────────────────────
  // frameDocUrl is null until Script 27 is built.
  // When S27 ships, it populates this field and S07's client opens the doc.
  return {
    success:     true,
    lessonId:    lessonId,
    frameDocUrl: null  // ── S27 hook: populate when Lesson Frame Generator exists ──
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
// supersedeDuplicates_
// Marks any existing RECEIVED rows for the same teacher+date+period slot
// as SUPERSEDED. Called before writing the new row.
// ---------------------------------------------------------------------------
function supersedeDuplicates_(lcSheet, teacherEmail, lessonDate, periodOrClass) {
  const data = lcSheet.getDataRange().getValues();
  const period = (periodOrClass || "").trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const rowEmail  = String(data[i][LC_TEACHER_EMAIL]).trim().toLowerCase();
    const rowDate   = String(data[i][LC_LESSON_DATE]).trim();
    const rowPeriod = String(data[i][LC_PERIOD_OR_CLASS]).trim().toLowerCase();
    const rowStatus = String(data[i][LC_STATUS]).trim();

    if (
      rowEmail  === teacherEmail.toLowerCase() &&
      rowDate   === lessonDate &&
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
// Format: LES-YYYYMMDD-XXXX (4 hex chars)
// Matches the ID pattern established in the schema doc.
// ---------------------------------------------------------------------------
function generateLessonId_() {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  const hex  = Math.floor(Math.random() * 0xffff)
    .toString(16).toUpperCase().padStart(4, "0");
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

  // LessonContext
  _createTabIfMissing_(ss, cfg.tabs.lessonContext, [
    "lesson_id", "teacher_email", "submitted_at", "lesson_date",
    "period_or_class", "activity_description", "learning_objective",
    "key_vocabulary", "prior_lesson_connection", "competency_ids",
    "status", "alignment_logged_at", "error_notes", "term"
  ]);

  // CompetencyRegistry
  _createTabIfMissing_(ss, cfg.tabs.competencyRegistry, [
    "competency_id", "competency_text", "subject", "grade_band",
    "strand", "teacher_email", "active"
  ]);

  // AlignmentLog
  _createTabIfMissing_(ss, cfg.tabs.alignmentLog, [
    "log_id", "lesson_id", "logged_at", "lesson_date",
    "teacher_email", "learning_objective", "competency_id",
    "competency_text", "strand"
  ]);

  // ReportRegistry — append-only record of every generated alignment report
  _createTabIfMissing_(ss, cfg.tabs.reportRegistry, [
    "report_id", "generated_at", "term", "teacher_email",
    "doc_id", "doc_url", "report_type"
  ]);

  Logger.log("[S22] Module 2 tab creation complete.");
}

function _createTabIfMissing_(ss, tabName, headers) {
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
  Logger.log("[S22] Created tab: " + tabName);
}
