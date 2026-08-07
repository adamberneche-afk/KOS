// =============================================================================
// FILE: 00_SharedConfig.js
// INCLUDE IN: Every Apps Script project in this system
// PURPOSE: Single getConfig_() function that reads all IDs from Script Properties
//          written by the Teacher Manual Setup Script (14).
//          Replaces all PASTE_..._HERE hardcoded constants across the codebase.
//
// USAGE:
//   const cfg = getConfig_();
//   const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);
//
// ADMIN-ONLY PROPERTIES (set manually before distributing teacher manuals):
//   ADMIN_ROOT_FOLDER_ID  — admin Assignments root folder
//   CENTRAL_LEDGER_SS_ID  — Distribution Ledger + Queue spreadsheet
//   ADMIN_SS_ID           — Admin Queue/Staging spreadsheet
//   ADMIN_NOTIFY_EMAIL    — admin alert email address
//   TEACHER_DASHBOARD_URL — deployed URL of Script 07 web app
//   STUDENT_DASHBOARD_URL — deployed URL of Script 13 web app
//
// TEACHER PROPERTIES (written automatically by Setup Script 16 — UnifiedManualSetup):
//   TEACHER_NAME, TEACHER_EMAIL, TEACHER_SUBJECT
//   TEACHER_MATRIX_SS_ID, TEACHER_FOLDER_ID
//   RUBRIC_FORM_URL, INTAKE_FORM_URL, TURNIN_FORM_URL, CONFIRM_REVIEW_FORM_URL
//   CONFIRM_REVIEW_FORM_ID, RUBRIC_QUEUE_TAB
//   CONFIRM_ENTRY_DRAFT_ID ... CONFIRM_ENTRY_DOD
// =============================================================================

function getConfig_() {
  const p = PropertiesService.getScriptProperties().getProperties();

  // Validate the minimum required properties are present
  const required = ["ADMIN_SS_ID", "CENTRAL_LEDGER_SS_ID"];
  const missing  = required.filter(key => !p[key]);
  if (missing.length > 0) {
    throw new Error(
      "Script Properties not configured. Missing: " + missing.join(", ") + "\n" +
      "Run the Teacher Manual setup wizard or contact your system administrator."
    );
  }

  return {
    // ── Admin-level (set by admin before distributing manuals) ──
    adminRootFolderId:    p.ADMIN_ROOT_FOLDER_ID    || "",
    ledgerSsId:           p.CENTRAL_LEDGER_SS_ID    || "",
    adminSsId:            p.ADMIN_SS_ID             || "",
    adminNotifyEmail:     p.ADMIN_NOTIFY_EMAIL       || "",
    teacherDashboardUrl:  p.TEACHER_DASHBOARD_URL    || "",
    studentDashboardUrl:  p.STUDENT_DASHBOARD_URL    || "",

    // ── Teacher identity (written by Setup Script 14) ──
    teacherName:          p.TEACHER_NAME             || "",
    teacherEmail:         p.TEACHER_EMAIL            || "",
    teacherSubject:       p.TEACHER_SUBJECT          || "",
    teacherFolderId:      p.TEACHER_FOLDER_ID        || "",
    teacherFolderUrl:     p.TEACHER_FOLDER_URL       || "",

    // ── Teacher spreadsheets ──
    teacherMatrixSsId:    p.TEACHER_MATRIX_SS_ID     || "",
    rubricResponseSsId:   p.RUBRIC_RESPONSE_SS_ID    || "",
    confirmResponseSsId:  p.CONFIRM_RESPONSE_SS_ID   || "",
    turninResponseSsId:   p.TURNIN_RESPONSE_SS_ID    || "",
    rubricQueueTab:       p.RUBRIC_QUEUE_TAB         || "RubricQueue",

    // ── Teacher forms ──
    rubricFormUrl:        p.RUBRIC_FORM_URL           || "",
    confirmFormId:        p.CONFIRM_REVIEW_FORM_ID   || "",
    confirmFormUrl:       p.CONFIRM_REVIEW_FORM_URL  || "",
    intakeFormUrl:        p.INTAKE_FORM_URL           || "",
    turninFormUrl:        p.TURNIN_FORM_URL           || "",

    // ── Confirmation form entry IDs (for pre-fill URLs) ──
    confirmEntryDraftId:  p.CONFIRM_ENTRY_DRAFT_ID   || "",
    confirmEntryUnitName: p.CONFIRM_ENTRY_UNIT_NAME  || "",
    confirmEntryPersona:  p.CONFIRM_ENTRY_PERSONA    || "",
    confirmEntryM1:       p.CONFIRM_ENTRY_MILESTONE_1|| "",
    confirmEntryM2:       p.CONFIRM_ENTRY_MILESTONE_2|| "",
    confirmEntryM3:       p.CONFIRM_ENTRY_MILESTONE_3|| "",
    confirmEntryM4:       p.CONFIRM_ENTRY_MILESTONE_4|| "",
    confirmEntryDod:      p.CONFIRM_ENTRY_DOD        || "",

    // ── Master template IDs ──
    masterStudentTemplateId: p.MASTER_STUDENT_TEMPLATE_ID || "",
    masterRubricSsId:        p.MASTER_RUBRIC_RESPONSE_SS_ID || "",
    masterMatrixSsId:        p.MASTER_TEACHER_MATRIX_SS_ID  || "",

    // ── Shared tab names (consistent across all projects) ──
    tabs: {
      ledger:          "Ledger",
      reviewQueue:     "ReviewQueue",
      stagingPipeline: "STAGING_PIPELINE",
      rubricQueue:     "RubricQueue",      // Central Studio Flow 1 trigger tab
      teacherMatrix:   "TeacherMatrix",
      draftUnits:      "DraftUnits",
      matrixRegistry:  "MatrixRegistry"   // Teacher Matrix SS ID lookup for Script 02
    }
  };
}

// =============================================================================
// RUBRICQUEUE ARCHITECTURE NOTE
// =============================================================================
// Studio Flow 1 cannot dynamically select a tab by pattern match. To give
// Flow 1 a stable, single trigger point, all teacher rubric submissions are
// funneled through one normalized tab: "RubricQueue" on the central admin
// spreadsheet. Script 05 writes to this tab. The per-teacher queue tab
// ([TeacherName]_RubricQueue) created by Script 14 is retained as an audit
// log — Script 05 writes to BOTH: the central RubricQueue (for Studio) and
// the teacher's personal tab (for their own records).
//
// RubricQueue tab includes a TeacherMatrixSsId column so Studio Flow 1
// knows which Teacher Matrix to write the DRAFT row to.
//
// CENTRAL RUBRICQUEUE HEADERS:
// Timestamp | TeacherEmail | TeacherName | Subject | CourseName | Tier |
// RubricText | PromptTemplateID | TeacherMatrixSsId | Status
//
// This tab must be created manually in the central admin spreadsheet.
// Add to the tab names map below:
// =============================================================================

// Extend tabs map with RubricQueue (add this line to getConfig_() tabs object)
// rubricQueue: "RubricQueue"  ← included in getConfig_() above
