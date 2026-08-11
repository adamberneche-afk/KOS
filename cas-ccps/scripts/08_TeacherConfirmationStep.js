// =============================================================================
// FILE: 08_TeacherConfirmationStep.js
// BOUND TO: Teacher Matrix spreadsheet (same project as Script 05 or standalone)
// PURPOSE: Polls TeacherMatrix for new DRAFT rows written by Studio Flow 1.
//          Sends teacher a pre-filled confirmation form email.
//          On teacher confirmation, promotes DRAFT → LIVE.
//          No longer called inline from Script 05 — Studio writes the DRAFT,
//          this script detects and acts on it.
//
// MODULE 5 ADDITIONS (marked ── M5 ──) — renumbered from "Module 3" during
// reconciliation decision 6; see cas-ccps/README.md for the full table:
//   - 4 new TeacherMatrix columns: MILESTONE_1_COMPETENCY_ID..4
//   - 4 new DraftUnits columns: same, mirrored for audit/debug visibility
//   - 4 new Confirmation Form fields read in onTeacherConfirmSubmit()
//   - 4 new pre-fill entries in buildPrefilledUrl_() — BUT these are
//     intentionally left BLANK on pre-fill (see note at that function).
//   All existing M1/M2 behavior is unchanged. This file follows the same
//   additive pattern as Module 2 and Module 4 — no existing field is
//   renamed, removed, or repurposed.
//
// M6 ADDITION (marked ── M6 ──) — Known Gaps #2 (lesson_unit_id), fixed
// per Round 2 reconciliation decision C1. One more column, appended after
// the four M5 competency columns, same append-only convention:
//   - 1 new TeacherMatrix column: LESSON_UNIT_ID
//   - 1 new DraftUnits column: same
//   - 1 new Confirmation Form field ("Lesson Unit" dropdown), added by
//     16_UnifiedManualSetup_M6_ADDENDUM.js and 19_ClonedSheetConfig_M6_ADDENDUM.js
//     — these two files remain unmerged patch addenda on top of their base
//     files, same convention already used for M5 (see those files' own
//     headers). This file (08) is the one file in the M5/M6 lineage where
//     addenda ARE merged directly, matching how the M5 merge was already done here.
//   - 1 new pre-fill entry in buildPrefilledUrl_(), also left BLANK —
//     which unit a milestone belongs to is a teacher call, same reasoning
//     as the M5 competency fields.
//   "Module 6" here is a file-naming label only (matching the
//   "_M6_ADDENDUM" suffix convention), not a new pedagogical module —
//   there is no CAS_Module6_Documentation and none is planned.
//
// FIXED THIS VERSION:
//   TM08 — missing comma after COURSE_NAME: 14, and COURSE_NAME was
//   declared out of column order (listed first, indexed last). Both
//   are corrected below. This was a real defect in the prior version
//   of this file — confirmed against the pasted source, not assumed.
//
// TRIGGERS:
//   pollForNewDrafts     — Time-driven, every 2 minutes
//   onTeacherConfirmSubmit — onFormSubmit on Confirmation Form response sheet
// =============================================================================

// ---------------------------------------------------------------------------
// CONFIGURATION — reads from _CONFIG tab on this sheet (Script 19)
// Script Properties don't clone with makeCopy(). Script 16 writes a _CONFIG
// tab to this sheet at creation time. getSheetConfig_() reads from there.
//
// ── M5 ── Script 16 must be extended to discover and write four new
// properties: confirmEntryComp1, confirmEntryComp2, confirmEntryComp3,
// confirmEntryComp4 — the entry IDs for the four new competency dropdown
// questions on the Confirmation Form. This file reads those properties
// defensively (see buildPrefilledUrl_) and degrades gracefully if they
// are not yet set, but the new competency fields will not pre-fill or
// validate correctly until Script 16's discovery logic is extended.
// This is the one open dependency for Module 5's confirmation-step
// integration — tracked here, not silently assumed.
// ---------------------------------------------------------------------------
function getConfig_08() {
  return getSheetConfig_(); // defined in 19_ClonedSheetConfig.js
}

// ---------------------------------------------------------------------------
// onOpen — self-registers time-driven triggers on first open of the cloned
// Teacher Matrix sheet. This fires in the context of THIS sheet's script
// project, solving the cross-project trigger limitation.
// Safe to run multiple times — checks for existing triggers before creating.
// ---------------------------------------------------------------------------
function onOpen() {
  registerTriggersIfNeeded_();
}

function registerTriggersIfNeeded_() {
  const existing = ScriptApp.getProjectTriggers();
  const hasPoll = existing.some(t => t.getHandlerFunction() === "pollForNewDrafts");
  const hasStale = existing.some(t => t.getHandlerFunction() === "abandonStaleDrafts");

  if (!hasPoll) {
    ScriptApp.newTrigger("pollForNewDrafts")
      .timeBased()
      .everyMinutes(2)
      .create();
    Logger.log("[08] pollForNewDrafts trigger registered.");
  }
  if (!hasStale) {
    ScriptApp.newTrigger("abandonStaleDrafts")
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(7)
      .create();
    Logger.log("[08] abandonStaleDrafts trigger registered.");
  }
}

// ---------------------------------------------------------------------------
// TeacherMatrix column indices (0-based)
//
// FIXED: missing comma after COURSE_NAME restored. COURSE_NAME moved to
// its correct position at the end of the object (index 14) to match its
// actual column position — it was previously declared first in the
// object literal despite being the last column, which made the object
// harder to audit at a glance. Functionally this reordering changes
// nothing (object key order doesn't affect index values), but it removes
// a real readability trap that likely caused the original comma error.
//
// ── M5 ── four new columns appended at indices 15–18, after the
// pre-existing 0–14 range. Appending rather than inserting mid-object
// avoids renumbering any existing column — no existing read/write in
// this file or any other script needs to change its index references.
// ---------------------------------------------------------------------------
const TM08 = {
  CONFIG_ID: 0,
  UNIT_NAME: 1,
  TIER: 2,
  PERSONA: 3,
  MILESTONE_1: 4,
  MILESTONE_2: 5,
  MILESTONE_3: 6,
  MILESTONE_4: 7,
  DOD: 8,
  INSTRUCTOR_EMAIL: 9,
  CREATED: 10,
  STATUS: 11,               // DRAFT | REVIEW_SENT | LIVE | ARCHIVED
  PROMPT_TEMPLATE_ID: 12,
  SUBJECT: 13,
  COURSE_NAME: 14,
  // ── M5 ──
  MILESTONE_1_COMPETENCY_ID: 15,
  MILESTONE_2_COMPETENCY_ID: 16,
  MILESTONE_3_COMPETENCY_ID: 17,
  MILESTONE_4_COMPETENCY_ID: 18,
  // ── M6 ── appended after the four M5 columns, same append-only pattern
  LESSON_UNIT_ID: 19,
};

// ---------------------------------------------------------------------------
// DraftUnits column indices (0-based)
//
// ── M5 ── same four-column addition, appended after the existing 0–13
// range, mirroring TeacherMatrix's shape. DraftUnits carries this data
// through the AWAITING_REVIEW state for audit/debugging purposes even
// though the authoritative copy ends up in TeacherMatrix once CONFIRMED.
// ---------------------------------------------------------------------------
const DU08 = {
  DRAFT_ID: 0,
  CONFIG_ID: 1,
  INSTRUCTOR: 2,
  INSTRUCTOR_NAME: 3,
  TIER: 4,
  UNIT_NAME: 5,
  PERSONA: 6,
  MILESTONE_1: 7,
  MILESTONE_2: 8,
  MILESTONE_3: 9,
  MILESTONE_4: 10,
  DOD: 11,
  CREATED: 12,
  STATUS: 13,               // AWAITING_REVIEW | CONFIRMED | ABANDONED
  // ── M5 ──
  MILESTONE_1_COMPETENCY_ID: 14,
  MILESTONE_2_COMPETENCY_ID: 15,
  MILESTONE_3_COMPETENCY_ID: 16,
  MILESTONE_4_COMPETENCY_ID: 17,
  // ── M6 ── appended after the four M5 columns, same append-only pattern
  LESSON_UNIT_ID: 18,
};

// ---------------------------------------------------------------------------
// pollForNewDrafts — time-driven trigger, every 2 minutes
// Scans TeacherMatrix for STATUS = DRAFT rows that haven't had a
// confirmation email sent yet, sends the pre-filled review email,
// marks them REVIEW_SENT so they aren't re-processed
// ---------------------------------------------------------------------------
function pollForNewDrafts() {
  const cfg = getConfig_08();
  // Use getActiveSpreadsheet() — Script 08 is bound to the Teacher Matrix sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const matrix = ss.getSheetByName("TeacherMatrix");
  const drafts = ss.getSheetByName("DraftUnits");
  if (!matrix || !drafts) throw new Error("TeacherMatrix or DraftUnits tab not found.");

  // LOCKED: this trigger fires every 2 minutes, but the STATUS flip to
  // REVIEW_SENT (below) only happens *after* drafts.appendRow() and the
  // network-bound sendReviewEmail_() call for every DRAFT row in this same
  // pass. A run that's still working through a slow/rate-limited email send
  // can still be inside this loop when the next scheduled run starts — that
  // second run reads its own fresh matrixData snapshot, still sees the same
  // row as STATUS === "DRAFT" (the first run hasn't reached the setValue()
  // yet), and reprocesses it: a duplicate confirmation email plus a second
  // DraftUnits row sharing the same deterministic draftId ("DRAFT-" +
  // configId), which onTeacherConfirmSubmit()'s promotion lookup would then
  // find sitting orphaned once the first copy is confirmed. Same fix already
  // applied to 03_QueueBridge.js's bridgeQueue() and
  // 26_CompetencyAlignmentLog.js's logAlignmentForLesson_() for the
  // identical race shape; standing down (rather than blocking indefinitely)
  // matches that precedent.
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[DRAFT] Parallel run congestion — standing down.");
    return;
  }

  try {
  const matrixData = matrix.getDataRange().getValues();

  for (let i = 1; i < matrixData.length; i++) {
    const row = matrixData[i];
    const status = String(row[TM08.STATUS]).trim();
    if (status !== "DRAFT") continue;

    const configId = String(row[TM08.CONFIG_ID]).trim();
    const instructorEmail = String(row[TM08.INSTRUCTOR_EMAIL]).trim();
    const instructorName = cfg.teacherName || instructorEmail;

    const config = {
      unitName: String(row[TM08.UNIT_NAME]).trim(),
      tier: String(row[TM08.TIER]).trim(),
      persona: String(row[TM08.PERSONA]).trim(),
      milestone1: String(row[TM08.MILESTONE_1]).trim(),
      milestone2: String(row[TM08.MILESTONE_2]).trim(),
      milestone3: String(row[TM08.MILESTONE_3]).trim(),
      milestone4: String(row[TM08.MILESTONE_4]).trim(),
      definitionOfDone: String(row[TM08.DOD]).trim(),
      subject: String(row[TM08.SUBJECT]).trim(),
      courseName: String(row[TM08.COURSE_NAME]).trim(),
    };

    // Register in DraftUnits tab for confirmation tracking
    const draftId = "DRAFT-" + configId;
    // ── M5 ── competency IDs do not exist yet at this point — Flow 1
    // (rubric extraction) has no knowledge of competencies, by design
    // (see architectural decision: competency tagging happens at human
    // confirmation, never via AI inference on compliance-relevant data).
    // These four slots are written blank here and filled in only when
    // onTeacherConfirmSubmit() runs.
    drafts.appendRow([
      draftId,
      configId,
      instructorEmail,
      instructorName,
      config.tier,
      config.unitName,
      config.persona,
      config.milestone1,
      config.milestone2,
      config.milestone3,
      config.milestone4,
      config.definitionOfDone,
      new Date(),
      "AWAITING_REVIEW",
      // ── M5 ── blank on creation, populated at confirmation
      "", "", "", "",
      // ── M6 ── same — blank until the teacher picks a lesson unit
      "",
    ]);

    // Build pre-filled confirmation form URL
    const reviewUrl = buildPrefilledUrl_(cfg.confirmFormId, draftId, config);

    // Send teacher the review email
    sendReviewEmail_(instructorEmail, instructorName, configId, config, reviewUrl);

    // Mark TeacherMatrix row as REVIEW_SENT — prevents re-processing
    matrix.getRange(i + 1, TM08.STATUS + 1).setValue("REVIEW_SENT");

    Logger.log(
      "[DRAFT] Review email sent — " + instructorEmail +
      " | ConfigID: " + configId +
      " | Unit: " + config.unitName
    );
  }
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// onTeacherConfirmSubmit — trigger bound to Confirmation Form response sheet
// Fires when teacher submits their reviewed/corrected extraction
// Promotes the draft to LIVE in TeacherMatrix
//
// ── M5 ── now also reads four new named fields — the teacher's chosen
// competency_id for each of the 4 milestones. These fields are REQUIRED
// on the live form (every milestone must map to exactly one competency —
// confirmed design decision, no unmapped milestones permitted). If the
// form enforces required-field validation correctly, these values should
// never arrive blank; this function still defensively defaults to ""
// rather than throwing, consistent with every other field read here.
// ---------------------------------------------------------------------------
function onTeacherConfirmSubmit(e) {
  const r = e.namedValues;
  const cfg = getConfig_08();

  // DISAMBIGUATION — exit if this is not a confirmation form submission
  // Confirmation responses always contain "Draft ID"; other submissions do not
  if (!r["Draft ID"]) {
    Logger.log("onTeacherConfirmSubmit: not a confirmation submission — skipping.");
    return;
  }

  // Validate the ConfirmationResponses tab exists (defensive check)
  const ss = SpreadsheetApp.openById(cfg.teacherMatrixSsId);
  if (!ss.getSheetByName("ConfirmationResponses")) {
    Logger.log("onTeacherConfirmSubmit: ConfirmationResponses tab not found — " +
      "the confirmation form may not be linked correctly.");
    return;
  }

  const draftId = r["Draft ID"]?.[0]?.trim() || "";
  const unitName = r["Assignment Name"]?.[0]?.trim() || "";
  const persona = r["AI Coach Persona"]?.[0]?.trim() || "";
  const milestone1 = r["Milestone 1"]?.[0]?.trim() || "";
  const milestone2 = r["Milestone 2"]?.[0]?.trim() || "";
  const milestone3 = r["Milestone 3"]?.[0]?.trim() || "";
  const milestone4 = r["Milestone 4"]?.[0]?.trim() || "";
  const dod = r["Passing Standard"]?.[0]?.trim() || "";
  const confirmEmail = r["Email Address"]?.[0]?.trim() || "";

  // ── M5 ── the four new competency-tagging fields. Field names here
  // must match exactly whatever labels are used when the four new
  // Dropdown questions are added to the live Confirmation Form (Piece 2a
  // — a manual Forms-UI edit, tracked separately from this script).
  const milestone1CompetencyId = r["Competency — Milestone 1"]?.[0]?.trim() || "";
  const milestone2CompetencyId = r["Competency — Milestone 2"]?.[0]?.trim() || "";
  const milestone3CompetencyId = r["Competency — Milestone 3"]?.[0]?.trim() || "";
  const milestone4CompetencyId = r["Competency — Milestone 4"]?.[0]?.trim() || "";

  // ── M6 ── the lesson-unit tagging field, added by
  // 16_UnifiedManualSetup_M6_ADDENDUM.js. Same storage shape as the four
  // competency fields above — the raw "lesson_unit_id — lesson_unit_name"
  // dropdown label is stored as-is, not split into id/name, matching how
  // the M5 competency fields already do it.
  const lessonUnitId = r["Lesson Unit"]?.[0]?.trim() || "";

  if (!draftId || !unitName) {
    Logger.log("[CONFIRM] Rejected — missing Draft ID or Unit Name.");
    return;
  }

  // ── M5 ── soft validation — log if any competency field arrived blank.
  // Not a hard reject: the form's own required-field setting is the
  // primary enforcement. This is a second line of defense, matching the
  // "defensive, non-fatal logging" pattern used throughout this codebase
  // (e.g. Script 22's competency ID validation, Script 29's GoogleID
  // format check) rather than introducing a new throw-on-invalid path.
  const missingCompetencyFields = [
    !milestone1CompetencyId && "Milestone 1",
    !milestone2CompetencyId && "Milestone 2",
    !milestone3CompetencyId && "Milestone 3",
    !milestone4CompetencyId && "Milestone 4",
  ].filter(Boolean);
  if (missingCompetencyFields.length > 0) {
    Logger.log("[CONFIRM] WARNING — draft " + draftId +
      " confirmed with missing competency mapping for: " +
      missingCompetencyFields.join(", ") +
      ". Evidence from this assignment will not be attributable to a " +
      "competency for the affected milestone(s) until corrected.");
  }
  // ── M6 ── same soft-validation treatment for the lesson unit field.
  if (!lessonUnitId) {
    Logger.log("[CONFIRM] WARNING — draft " + draftId +
      " confirmed with no lesson unit selected. This assignment will not " +
      "be attributable to a pacing-guide unit until corrected.");
  }

  const drafts = ss.getSheetByName("DraftUnits");
  const matrix = ss.getSheetByName("TeacherMatrix");
  const data = drafts.getDataRange().getValues();

  // Find the draft row
  let draftRow = null;
  let draftRowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][DU08.DRAFT_ID]).trim() === draftId) {
      draftRow = data[i];
      draftRowIndex = i + 1;
      break;
    }
  }

  if (!draftRow) {
    Logger.log("[CONFIRM] Draft ID not found: " + draftId);
    return;
  }
  if (String(draftRow[DU08.STATUS]).trim() !== "AWAITING_REVIEW") {
    Logger.log("[CONFIRM] Draft " + draftId + " already processed — ignoring duplicate.");
    return;
  }

  const configId = String(draftRow[DU08.CONFIG_ID]).trim();
  const email = confirmEmail || String(draftRow[DU08.INSTRUCTOR]).trim();
  const name = String(draftRow[DU08.INSTRUCTOR_NAME]).trim();

  // Update the TeacherMatrix row with confirmed (possibly edited) values
  // Find the matrix row by ConfigID
  const matrixData = matrix.getDataRange().getValues();
  for (let i = 1; i < matrixData.length; i++) {
    if (String(matrixData[i][TM08.CONFIG_ID]).trim() === configId) {
      const rowNum = i + 1;
      matrix.getRange(rowNum, TM08.UNIT_NAME + 1).setValue(unitName);
      matrix.getRange(rowNum, TM08.PERSONA + 1).setValue(persona);
      matrix.getRange(rowNum, TM08.MILESTONE_1 + 1).setValue(milestone1);
      matrix.getRange(rowNum, TM08.MILESTONE_2 + 1).setValue(milestone2);
      matrix.getRange(rowNum, TM08.MILESTONE_3 + 1).setValue(milestone3);
      matrix.getRange(rowNum, TM08.MILESTONE_4 + 1).setValue(milestone4);
      matrix.getRange(rowNum, TM08.DOD + 1).setValue(dod);
      matrix.getRange(rowNum, TM08.STATUS + 1).setValue("LIVE");
      // ── M5 ──
      matrix.getRange(rowNum, TM08.MILESTONE_1_COMPETENCY_ID + 1).setValue(milestone1CompetencyId);
      matrix.getRange(rowNum, TM08.MILESTONE_2_COMPETENCY_ID + 1).setValue(milestone2CompetencyId);
      matrix.getRange(rowNum, TM08.MILESTONE_3_COMPETENCY_ID + 1).setValue(milestone3CompetencyId);
      matrix.getRange(rowNum, TM08.MILESTONE_4_COMPETENCY_ID + 1).setValue(milestone4CompetencyId);
      // ── M6 ──
      matrix.getRange(rowNum, TM08.LESSON_UNIT_ID + 1).setValue(lessonUnitId);
      break;
    }
  }

  // Mark draft as CONFIRMED
  drafts.getRange(draftRowIndex, DU08.STATUS + 1).setValue("CONFIRMED");
  // ── M5 ── persist the confirmed competency mapping on the draft row too,
  // for audit visibility even after the matrix row has moved on
  drafts.getRange(draftRowIndex, DU08.MILESTONE_1_COMPETENCY_ID + 1).setValue(milestone1CompetencyId);
  drafts.getRange(draftRowIndex, DU08.MILESTONE_2_COMPETENCY_ID + 1).setValue(milestone2CompetencyId);
  drafts.getRange(draftRowIndex, DU08.MILESTONE_3_COMPETENCY_ID + 1).setValue(milestone3CompetencyId);
  drafts.getRange(draftRowIndex, DU08.MILESTONE_4_COMPETENCY_ID + 1).setValue(milestone4CompetencyId);
  // ── M6 ──
  drafts.getRange(draftRowIndex, DU08.LESSON_UNIT_ID + 1).setValue(lessonUnitId);

  // Notify teacher — plain language
  sendActivationEmail_(email, name, configId, unitName);

  Logger.log(
    "[CONFIRM] Unit activated — " + email +
    " | ConfigID: " + configId +
    " | Unit: " + unitName
  );
}

// ---------------------------------------------------------------------------
// buildPrefilledUrl_ — constructs pre-filled Google Form URL
// Replace ENTRY_* values with actual entry IDs from your Confirmation Form
// Get entry IDs: open the form in browser → Inspect → find input name="entry.XXXXXXXXX"
//
// ── M5 ── four new entries appended for the competency dropdowns.
// IMPORTANT — these are intentionally NOT given a pre-fill value. Unlike
// the milestone text fields (which Flow 1 already extracted and which
// genuinely have a value to pre-fill), the competency mapping does not
// exist yet at the moment this URL is built — that is precisely the
// decision being requested of the teacher on this form. Pre-filling
// would mean guessing, which is the exact AI-inference-on-compliance-data
// risk this design was built to avoid. These four entries are included
// in the `entries` array with an empty string so the dropdown opens
// blank, ready for the teacher's selection, every time.
//
// These four entries read from cfg.confirmEntryComp1..4, which do not
// yet exist as Script Properties — Script 16's setup wizard needs to be
// extended to discover and write them (see note on getConfig_08 above).
// Until that extension exists, the existing `.filter(([key]) => key)`
// line below will correctly and silently omit these four entries from
// the URL rather than erroring — this file already degrades gracefully
// for any entry whose ID hasn't been configured yet, the same as it
// already does for any of the original eight.
// ---------------------------------------------------------------------------
function buildPrefilledUrl_(formId, draftId, config) {
  const cfg = getConfig_08();
  // Entry IDs read from _CONFIG tab (written by Script 16 setup wizard)
  const base = "https://docs.google.com/forms/d/" + formId + "/viewform?usp=pp_url";

  const entries = [
    [cfg.confirmEntryDraftId, draftId],
    [cfg.confirmEntryUnitName, config.unitName],
    [cfg.confirmEntryPersona, config.persona],
    [cfg.confirmEntryM1, config.milestone1],
    [cfg.confirmEntryM2, config.milestone2],
    [cfg.confirmEntryM3, config.milestone3],
    [cfg.confirmEntryM4, config.milestone4],
    [cfg.confirmEntryDod, config.definitionOfDone],
    // ── M3 — intentionally blank values, see note above ──
    [cfg.confirmEntryComp1, ""],
    [cfg.confirmEntryComp2, ""],
    [cfg.confirmEntryComp3, ""],
    [cfg.confirmEntryComp4, ""],
    // ── M6 — same reasoning: which pacing-guide unit a milestone belongs
    // to is the teacher's call, not inferred, so this is left blank too.
    // Reads from cfg.confirmEntryLessonUnit, added by
    // 19_ClonedSheetConfig_M6_ADDENDUM.js — degrades gracefully (omitted
    // from the URL) until that addendum's key is configured, same as
    // every other entry here.
    [cfg.confirmEntryLessonUnit, ""],
  ];

  const params = entries
    .filter(([key]) => key) // Skip any entries whose IDs haven't been set yet
    .map(([key, val]) => key + "=" + encodeURIComponent(String(val)))
    .join("&");

  return base + "&" + params;
}

// ---------------------------------------------------------------------------
// sendReviewEmail_
//
// ── M5 ── one new paragraph added to the email body, telling the teacher
// to also tag each milestone with a competency before submitting. No
// structural change to the function — same MailApp.sendEmail call shape.
// ---------------------------------------------------------------------------
function sendReviewEmail_(email, name, configId, config, reviewUrl) {
  MailApp.sendEmail(
    email,
    "Please Review Your Assignment Setup — " + config.unitName,
    "Hello " + name + ",\n\n" +
    "Your assignment rubric has been processed. Before it goes live for students,\n" +
    "please take 2 minutes to review what the system extracted.\n\n" +
    "------------------------------------\n" +
    "WHAT THE SYSTEM EXTRACTED:\n" +
    "------------------------------------\n\n" +
    "Assignment Name: " + config.unitName + "\n\n" +
    "AI Coach Persona:\n" + config.persona + "\n\n" +
    "Milestone 1:\n" + config.milestone1 + "\n\n" +
    "Milestone 2:\n" + config.milestone2 + "\n\n" +
    "Milestone 3:\n" + config.milestone3 + "\n\n" +
    "Milestone 4:\n" + config.milestone4 + "\n\n" +
    "Passing Standard (hidden from students):\n" + config.definitionOfDone + "\n\n" +
    "------------------------------------\n\n" +
    "NEW — for each milestone, you'll also select the Student Competency\n" +
    "Record (SCR) competency it addresses. This is required for all four\n" +
    "milestones — pick the closest match if a milestone covers more than one.\n" +
    "This selection is never guessed by the system; it's always your call.\n\n" +
    "You'll also pick which pacing-guide lesson unit this assignment belongs\n" +
    "to — also always your call, never guessed.\n\n" +
    "Looks right? Click below to confirm.\n" +
    "Need to change something? The form is pre-filled — just edit and submit.\n\n" +
    "REVIEW AND CONFIRM:\n" + reviewUrl + "\n\n" +
    "Assignment ID: " + configId + "\n\n" +
    "— Assignment System"
  );
}

// ---------------------------------------------------------------------------
// sendActivationEmail_ — unchanged
// ---------------------------------------------------------------------------
function sendActivationEmail_(email, name, configId, unitName) {
  MailApp.sendEmail(
    email,
    "Your Assignment Is Now Live — " + unitName,
    "Hello " + name + ",\n\n" +
    "\"" + unitName + "\" is now live in the system.\n\n" +
    "Students can be registered using the Student Intake Form.\n" +
    "Monitor progress from your Assignment Dashboard.\n\n" +
    "Assignment reference code: " + configId + "\n\n" +
    "— Assignment System"
  );
}

// ---------------------------------------------------------------------------
// abandonStaleDrafts — weekly trigger — marks 7-day-old unconfirmed drafts ABANDONED
// Unchanged.
// ---------------------------------------------------------------------------
function abandonStaleDrafts() {
  const cfg = getConfig_08();
  const ss = SpreadsheetApp.openById(cfg.teacherMatrixSsId);
  const drafts = ss.getSheetByName("DraftUnits");
  const data = drafts.getDataRange().getValues();
  const cutoff = 7 * 24 * 60 * 60 * 1000;
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][DU08.STATUS]).trim() !== "AWAITING_REVIEW") continue;
    const age = now - new Date(data[i][DU08.CREATED]);
    if (age > cutoff) {
      drafts.getRange(i + 1, DU08.STATUS + 1).setValue("ABANDONED");
      Logger.log("[CONFIRM] Abandoned stale draft: " + data[i][DU08.DRAFT_ID]);
    }
  }
}
