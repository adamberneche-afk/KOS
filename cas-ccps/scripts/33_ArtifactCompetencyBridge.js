// =============================================================================
// FILE: 33_ArtifactCompetencyBridge.js  (renumbered from 31 during
//       reconciliation — Module 2's own numbering collided with the
//       already-pushed Module 4/5 scripts 29/30/30b; Module 2 moved to
//       31/32/33 per repo reconciliation decision 1 (see cas-ccps/README.md).
// BOUND TO: Central Ledger spreadsheet (same project as the other
//          Module 2 scripts: 22, 22b, 23, 24, 26, 28, 31, 32)
// PURPOSE: Connects Module 1 work artifacts to Module 2 competency tracking.
//          When a student completes an assignment, their competency coverage
//          is updated in StudentProfiles based on the competency IDs tagged
//          on that assignment's Teacher Matrix row.
//
// THE ARTIFACT-BASED EVIDENCE MODEL:
//   Completion of a work artifact = demonstrated competency exposure.
//   This is stronger than attendance: a present-but-disengaged student
//   has no artifact; an absent student who completed makeup work has one.
//   The artifact is the evidence of learning, not the chair being warm.
//
// HOW IT WORKS:
//   1. Teacher tags competency IDs on each assignment in the Teacher Matrix
//      (new column: competency_ids — same picker as Lesson Context modal)
//   2. When STAGING_PIPELINE status = COMPLETE for a student's assignment,
//      this script reads the competency IDs from the Teacher Matrix row
//      and calls Script 23's profile update to record coverage for that student
//   3. Script 23's getStudentProfileSnapshot_() now returns per-student
//      competency coverage rather than class-level coverage
//
// ENTRY POINTS:
//   syncArtifactCompetencies()    — called by 3am cron (Stage 1.5, after S23)
//   addCompetencyIdsColumn_()     — run once to extend Teacher Matrix tab
//   validateArtifactSync()        — run manually to verify sync integrity
//
// CRON SEQUENCE (updated):
//   3:00am — Script 23: updateAllStudentProfiles() — class-level baseline
//   3:05am — Script 33: syncArtifactCompetencies() — per-student artifact layer
//   3:15am — Script 25: runWarmUpEvaluation()
//   3:30am — Script 24: buildWarmUpQueues()
//   6:00am — Studio Flow 3: warm-up generation
//
// TEACHER MATRIX EXTENSION:
//   New column added at position 16 (index 15): competency_ids
//   Format: comma-separated competency ID strings
//   Example: "8177-47,8177-52,8177-53"
//   Added via addCompetencyIdsColumn_() — safe to run once
//   Populated by teacher via the Teacher Dashboard competency picker
//   (same UI as Lesson Context — no new interface needed)
//
// STUDENTPROFILES CHANGE:
//   competencies_addressed shifts from class-level (same for all students)
//   to per-student (only competencies where the student has a COMPLETE artifact)
//   Class-level addressed set (from AlignmentLog) becomes the ceiling —
//   the artifact set is the floor. A student's actual coverage is the
//   intersection of: what was taught (AlignmentLog) AND what they completed
//   (STAGING_PIPELINE + Teacher Matrix competency_ids).
//
// =============================================================================

// ── Teacher Matrix column indices (0-based) — from Script 16 ─────────────────
const TM_CONFIG_ID         = 0;
const TM_UNIT_NAME         = 1;
const TM_TIER              = 2;
const TM_PERSONA           = 3;
const TM_MILESTONE_1       = 4;
const TM_MILESTONE_2       = 5;
const TM_MILESTONE_3       = 6;
const TM_MILESTONE_4       = 7;
const TM_DEFINITION_DONE   = 8;
const TM_INSTRUCTOR_EMAIL  = 9;
const TM_CREATED           = 10;
const TM_STATUS            = 11;
const TM_PROMPT_TEMPLATE   = 12;
const TM_SUBJECT           = 13;
const TM_COURSE_NAME       = 14;
const TM_COMPETENCY_IDS    = 15; // NEW — added by addCompetencyIdsColumn_()

// ── Ledger column indices (0-based) — from Module 1 ──────────────────────────
const LD33_GOOGLE_ID      = 1;
const LD33_CONFIG_ID      = 2;
const LD33_FILE_ID        = 3;
const LD33_STUDENT_NAME   = 4;
const LD33_TEACHER_EMAIL  = 8;
const LD33_PERIOD         = 11;
const LD33_STATUS         = 12;
const LD33_TERM           = 18;

// ── STAGING_PIPELINE column indices (0-based) — from Module 1 ────────────────
// Resolved dynamically by header name — stored here for documentation
// "StudentFileID" | "ConfigID" | "Status" | "Timestamp"

// ── StudentProfiles column indices — from Script 23 ──────────────────────────
const SP33_STUDENT_EMAIL          = 0;
const SP33_TEACHER_EMAIL          = 3;
const SP33_COMPETENCIES_ADDRESSED = 5; // per-student after this script runs

// ---------------------------------------------------------------------------
// syncArtifactCompetencies — primary entry point
// Called at 3:05am after Script 23's class-level baseline pass.
// Reads STAGING_PIPELINE for COMPLETE assignments, joins to Teacher Matrix
// to get competency IDs, and writes per-student competency coverage to
// StudentProfiles — overlaying the class-level set with artifact evidence.
//
// Result: competencies_addressed in StudentProfiles becomes the set of
// competencies for which each student has a COMPLETE work artifact.
// Students who completed fewer assignments have narrower coverage.
// Students who completed makeup work get credit for those competencies.
// ---------------------------------------------------------------------------
function syncArtifactCompetencies() {
  const cfg = getConfig_();

  // FIXED: unified to strict opt-in (`=== "true"`) — see
  // 22_LessonContextHandler.js's onLessonContextSubmit_() for the full
  // rationale.
  const m2Enabled = PropertiesService.getScriptProperties()
    .getProperty("M2_ENABLED");
  if (m2Enabled !== "true") {
    Logger.log("[S33] M2_ENABLED is not \"true\" — skipping artifact sync.");
    return;
  }

  const teacherEmail = cfg.teacherEmail;
  const currentTerm  = PropertiesService.getScriptProperties()
    .getProperty("CURRENT_TERM") || "";

  Logger.log("[S33] Starting artifact competency sync | Teacher: " + teacherEmail);

  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);

  // ── Load required tabs ─────────────────────────────────────────────────────
  const ledgerSheet  = ss.getSheetByName(cfg.tabs.ledger);
  const stagingSheet = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const spSheet      = ss.getSheetByName(cfg.tabs.studentProfiles);

  if (!ledgerSheet)  { Logger.log("[S33] Ledger tab not found.");          return; }
  if (!stagingSheet) { Logger.log("[S33] STAGING_PIPELINE tab not found."); return; }
  if (!spSheet)      { Logger.log("[S33] StudentProfiles tab not found.");  return; }

  // Load Teacher Matrix from teacher's own spreadsheet (not on Central Ledger)
  const matrixSsId = PropertiesService.getScriptProperties()
    .getProperty("TEACHER_MATRIX_SS_ID");
  if (!matrixSsId) {
    Logger.log("[S33] TEACHER_MATRIX_SS_ID not set — cannot read competency tags.");
    return;
  }

  let matrixData;
  try {
    const matrixSs    = SpreadsheetApp.openById(matrixSsId);
    const matrixSheet = matrixSs.getSheetByName("TeacherMatrix");
    if (!matrixSheet) {
      Logger.log("[S33] TeacherMatrix sheet not found in matrix spreadsheet.");
      return;
    }
    matrixData = matrixSheet.getDataRange().getValues();
  } catch(e) {
    Logger.log("[S33] Cannot open Teacher Matrix: " + e.message);
    return;
  }

  // ── Build configId → competency_ids map from Teacher Matrix ───────────────
  // Only include rows that have the competency_ids column populated
  const configToCompIds = {};
  for (let i = 1; i < matrixData.length; i++) {
    const row      = matrixData[i];
    const configId = String(row[TM_CONFIG_ID]      || "").trim();
    const compIds  = String(row[TM_COMPETENCY_IDS] || "").trim();
    if (!configId || !compIds) continue;
    const ids = compIds.split(",").map(id => id.trim()).filter(Boolean);
    if (ids.length > 0) configToCompIds[configId] = ids;
  }

  const taggedAssignments = Object.keys(configToCompIds).length;
  Logger.log("[S33] Assignments with competency tags: " + taggedAssignments);

  if (taggedAssignments === 0) {
    Logger.log("[S33] No competency tags found on Teacher Matrix — " +
               "run addCompetencyIdsColumn_() and tag assignments first.");
    return;
  }

  // ── Load Ledger — build student→fileId and fileId→configId maps ───────────
  const ledgerData = ledgerSheet.getDataRange().getValues();
  const fileToStudent  = {}; // fileId → { email, period }
  const fileToConfigId = {}; // fileId → configId

  for (let i = 1; i < ledgerData.length; i++) {
    const row      = ledgerData[i];
    const tEmail   = String(row[LD33_TEACHER_EMAIL] || "").trim().toLowerCase();
    const status   = String(row[LD33_STATUS]        || "").trim();
    const term     = String(row[LD33_TERM]          || "").trim();
    const email    = String(row[LD33_GOOGLE_ID]     || "").trim().toLowerCase();
    const fileId   = String(row[LD33_FILE_ID]       || "").trim();
    const configId = String(row[LD33_CONFIG_ID]     || "").trim();
    const period   = String(row[LD33_PERIOD]        || "").trim();

    if (tEmail !== teacherEmail.toLowerCase()) continue;
    if (status === "ARCHIVED") continue;
    if (currentTerm && term && term !== currentTerm) continue;
    if (!fileId || !email) continue;

    fileToStudent[fileId]  = { email, period };
    fileToConfigId[fileId] = configId;
  }

  // ── Load STAGING_PIPELINE — find COMPLETE rows ────────────────────────────
  const stagingData = stagingSheet.getDataRange().getValues();
  const stagingHeaders = stagingData[0].map(h => String(h).trim());
  const sFileIdx   = stagingHeaders.indexOf("StudentFileID");
  const sStatusIdx = stagingHeaders.indexOf("Status");

  if (sFileIdx === -1 || sStatusIdx === -1) {
    Logger.log("[S33] STAGING_PIPELINE missing expected headers.");
    return;
  }

  // Build per-student competency coverage from completed artifacts
  // { studentEmail: Set of competency IDs }
  const studentCompetencies = {};

  for (let i = 1; i < stagingData.length; i++) {
    const row    = stagingData[i];
    const status = String(row[sStatusIdx] || "").trim();
    const fileId = String(row[sFileIdx]   || "").trim();

    if (status !== "COMPLETE") continue;
    if (!fileId || !fileToStudent[fileId]) continue;

    const studentEmail = fileToStudent[fileId].email;
    const configId     = fileToConfigId[fileId] || "";
    const compIds      = configToCompIds[configId] || [];

    if (compIds.length === 0) continue; // assignment not tagged — skip

    if (!studentCompetencies[studentEmail]) {
      studentCompetencies[studentEmail] = new Set();
    }
    for (const id of compIds) {
      studentCompetencies[studentEmail].add(id);
    }
  }

  Logger.log("[S33] Students with artifact competency coverage: " +
             Object.keys(studentCompetencies).length);

  // ── Update StudentProfiles — write per-student competency coverage ─────────
  // Reads existing profiles, updates competencies_addressed for each student
  // that has artifact evidence. Students with no COMPLETE artifacts retain
  // the class-level baseline written by Script 23 at 3:00am.
  const spData = spSheet.getDataRange().getValues();
  let updated = 0;

  for (let i = 1; i < spData.length; i++) {
    const rowEmail   = String(spData[i][SP33_STUDENT_EMAIL]  || "").trim().toLowerCase();
    const rowTeacher = String(spData[i][SP33_TEACHER_EMAIL]  || "").trim().toLowerCase();

    if (rowTeacher !== teacherEmail.toLowerCase()) continue;
    if (rowEmail === teacherEmail.toLowerCase()) continue; // skip teacher row

    const artifactCompIds = studentCompetencies[rowEmail];
    if (!artifactCompIds || artifactCompIds.size === 0) continue;

    // Merge: union of class-level addressed (from S23) and artifact-evidenced
    // Artifact evidence is strictly additive — never removes class-level coverage.
    let existingAddressed = [];
    try {
      existingAddressed = JSON.parse(spData[i][SP33_COMPETENCIES_ADDRESSED] || "[]");
    } catch(e) { existingAddressed = []; }

    const merged = new Set([...existingAddressed, ...artifactCompIds]);
    const mergedArray = [...merged].sort();

    // Update the competencies_addressed cell in place
    spSheet.getRange(i + 1, SP33_COMPETENCIES_ADDRESSED + 1)
      .setValue(JSON.stringify(mergedArray));

    updated++;
  }

  // ── Write health stamp ─────────────────────────────────────────────────────
  PropertiesService.getScriptProperties().setProperties({
    "M2_STAGE1B_LAST_RUN": new Date().toISOString(),
    "M2_STAGE1B_STATUS":   "OK_" + updated
  });

  Logger.log("[S33] Artifact sync complete. Profiles updated: " + updated);
}

// ---------------------------------------------------------------------------
// addCompetencyIdsColumn_
// Adds the competency_ids column to the TeacherMatrix sheet.
// Run once manually from Script Editor.
// Safe to re-run — checks for existing column before adding.
//
// After running this, the teacher can tag competency IDs on each assignment
// via the Teacher Dashboard's existing competency picker (same UI as
// Lesson Context). Script 07 needs a minor update to expose the picker
// in the assignment creation/review flow (see teacherMatrixCompetencyHook_).
// ---------------------------------------------------------------------------
function addCompetencyIdsColumn_() {
  const matrixSsId = PropertiesService.getScriptProperties()
    .getProperty("TEACHER_MATRIX_SS_ID");

  if (!matrixSsId) {
    Logger.log("[S33] TEACHER_MATRIX_SS_ID not set.");
    return;
  }

  const matrixSs    = SpreadsheetApp.openById(matrixSsId);
  const matrixSheet = matrixSs.getSheetByName("TeacherMatrix");

  if (!matrixSheet) {
    Logger.log("[S33] TeacherMatrix sheet not found.");
    return;
  }

  const headers = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn())
    .getValues()[0];

  if (headers.includes("competency_ids")) {
    Logger.log("[S33] competency_ids column already exists at position " +
               (headers.indexOf("competency_ids") + 1) + ".");
    return;
  }

  // Extend DraftUnits sheet too if it exists (same matrix spreadsheet)
  const draftSheet = matrixSs.getSheetByName("DraftUnits");

  const newCol = matrixSheet.getLastColumn() + 1;
  matrixSheet.getRange(1, newCol)
    .setValue("competency_ids")
    .setFontWeight("bold")
    .setBackground("#f3f3f3");

  if (draftSheet) {
    const draftLastCol = draftSheet.getLastColumn() + 1;
    draftSheet.getRange(1, draftLastCol)
      .setValue("competency_ids")
      .setFontWeight("bold")
      .setBackground("#f3f3f3");
    Logger.log("[S33] competency_ids column added to DraftUnits at position " +
               draftLastCol + ".");
  }

  Logger.log("[S33] competency_ids column added to TeacherMatrix at position " +
             newCol + ".");
  Logger.log("[S33] Format: comma-separated competency IDs e.g. '8177-47,8177-52'");
  Logger.log("[S33] Populate via Teacher Dashboard competency picker " +
             "or enter directly in the column.");
}

// ---------------------------------------------------------------------------
// installArtifactSyncTrigger_
// Installs the 3:05am nightly trigger for syncArtifactCompetencies.
// Run once from Script Editor. Safe to re-run.
// ---------------------------------------------------------------------------
function installArtifactSyncTrigger_() {
  const existing = ScriptApp.getProjectTriggers()
    .map(t => t.getHandlerFunction());

  if (existing.includes("syncArtifactCompetencies")) {
    Logger.log("[S33] syncArtifactCompetencies trigger already installed.");
    return;
  }

  ScriptApp.newTrigger("syncArtifactCompetencies")
    .timeBased()
    .atHour(3)
    .nearMinute(5)
    .everyDays(1)
    .create();

  Logger.log("[S33] Trigger installed: syncArtifactCompetencies at 3:05am daily.");
  Logger.log("[S33] Full 3am cron sequence:");
  Logger.log("[S33]   3:00am — Script 23 (class-level profile baseline)");
  Logger.log("[S33]   3:05am — Script 33 (per-student artifact overlay)");
  Logger.log("[S33]   3:15am — Script 25 (warm-up evaluation)");
  Logger.log("[S33]   3:30am — Script 24 (queue builder)");
}

// ---------------------------------------------------------------------------
// validateArtifactSync
// Run manually to inspect the state of artifact-based competency coverage.
// Compares class-level coverage (from AlignmentLog) to artifact-evidenced
// coverage (from STAGING_PIPELINE + Teacher Matrix tags) per student.
// ---------------------------------------------------------------------------
function validateArtifactSync() {
  const cfg          = getConfig_();
  const ss           = SpreadsheetApp.openById(cfg.ledgerSsId);
  const teacherEmail = cfg.teacherEmail;

  const spSheet = ss.getSheetByName(cfg.tabs.studentProfiles);
  if (!spSheet) { Logger.log("[VALIDATE] StudentProfiles not found."); return; }

  const alSheet = ss.getSheetByName(cfg.tabs.alignmentLog);
  const classCompIds = new Set();
  if (alSheet) {
    const alData = alSheet.getDataRange().getValues();
    for (let i = 1; i < alData.length; i++) {
      const tEmail = String(alData[i][4] || "").trim().toLowerCase();
      const compId = String(alData[i][6] || "").trim();
      if (tEmail === teacherEmail.toLowerCase() && compId) classCompIds.add(compId);
    }
  }

  const spData = spSheet.getDataRange().getValues();
  const teacherLower = teacherEmail.toLowerCase();

  let total = 0, withArtifact = 0, belowClass = 0;
  const studentStats = [];

  for (let i = 1; i < spData.length; i++) {
    const rowEmail   = String(spData[i][SP33_STUDENT_EMAIL]  || "").trim().toLowerCase();
    const rowTeacher = String(spData[i][SP33_TEACHER_EMAIL]  || "").trim().toLowerCase();
    if (rowTeacher !== teacherLower || rowEmail === teacherLower) continue;

    total++;
    let studentCompIds = [];
    try { studentCompIds = JSON.parse(spData[i][SP33_COMPETENCIES_ADDRESSED] || "[]"); }
    catch(e) {}

    const studentSet = new Set(studentCompIds);
    const hasArtifact = studentSet.size > 0;
    const isBelowClass = [...classCompIds].some(id => !studentSet.has(id));

    if (hasArtifact) withArtifact++;
    if (isBelowClass && hasArtifact) belowClass++;

    studentStats.push({
      email:      rowEmail,
      coverage:   studentSet.size,
      classTotal: classCompIds.size
    });
  }

  Logger.log("[VALIDATE] Artifact Competency Sync:");
  Logger.log("[VALIDATE]   Total students:              " + total);
  Logger.log("[VALIDATE]   Class-level competencies:    " + classCompIds.size);
  Logger.log("[VALIDATE]   With artifact coverage:      " + withArtifact);
  Logger.log("[VALIDATE]   Below class ceiling:         " + belowClass +
             " (expected — not every student completes every assignment)");

  // Log per-student coverage gaps
  const sorted = studentStats.sort((a, b) => a.coverage - b.coverage);
  Logger.log("[VALIDATE]   Coverage range: " +
             (sorted[0] ? sorted[0].coverage : 0) + " – " +
             (sorted[sorted.length-1] ? sorted[sorted.length-1].coverage : 0) +
             " of " + classCompIds.size + " class-level competencies");

  if (withArtifact === 0) {
    Logger.log("[VALIDATE] ⚠ No artifact coverage found.");
    Logger.log("[VALIDATE]   Check: Teacher Matrix has competency_ids column populated?");
    Logger.log("[VALIDATE]   Check: STAGING_PIPELINE has COMPLETE rows for this teacher?");
  } else {
    Logger.log("[VALIDATE] ✓ Artifact sync appears healthy.");
  }
}

// ---------------------------------------------------------------------------
// getStudentCompetenciesFromArtifacts_
//
// CORRECTED — this comment used to claim "called by Script 23's
// getStudentProfileSnapshot_() to get the artifact-evidenced competency set
// for a specific student." That was never true; a third-party review found
// it. This function has no callers anywhere in the repo — it's dead code.
//
// The real mechanism getStudentProfileSnapshot_() actually relies on is
// cron-ordering, not a call into this function: syncArtifactCompetencies()
// (this file, 3:05am) directly overwrites the same StudentProfiles
// competencies_addressed cell that getStudentProfileSnapshot_()
// (23_StudentProfileManager.js) reads straight off the sheet — a merge of
// class-level coverage (written by Script 23 at 3:00am) with artifact
// evidence — a few minutes before that read next happens (3:15am eval,
// 3:30am queue build). It works, but as an undocumented side effect of
// trigger scheduling, not the documented interface this comment described.
// If syncArtifactCompetencies()'s trigger ever silently stopped firing,
// every profile would quietly revert to class-level-only coverage with no
// signal — closed by the M2_STAGE1B_LAST_RUN cron-health check
// runWarmUpEvaluation() now performs (25_WarmUpWriter.js), and by
// registering this trigger in Script 28's setup wizard, which never
// installed it before.
//
// This function is kept as-is (unused) rather than deleted or wired in —
// rewiring the real mechanism into an explicit function call is a genuine
// design change outside the scope of a comment correction.
//
// Returns: Set of competency IDs evidenced by completed artifacts, or null
//          if artifact sync hasn't run yet (falls back to class-level set).
// ---------------------------------------------------------------------------
function getStudentCompetenciesFromArtifacts_(ss, cfg, studentEmail) {
  const spSheet = ss.getSheetByName(cfg.tabs.studentProfiles);
  if (!spSheet) return null;

  const data  = spSheet.getDataRange().getValues();
  const email = studentEmail.toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][SP33_STUDENT_EMAIL] || "").trim().toLowerCase();
    if (rowEmail !== email) continue;

    try {
      const ids = JSON.parse(data[i][SP33_COMPETENCIES_ADDRESSED] || "[]");
      return new Set(ids);
    } catch(e) { return null; }
  }
  return null;
}
