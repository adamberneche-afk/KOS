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
//   STUDENT_EMAIL_DOMAIN  — district student-account domain (Script 29's
//                           ID validation); defaults to "ccpsnet.net" if unset
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
    // Was hardcoded directly into 29_StudentContextAggregator.js's ID
    // validation regex — a district domain change would have silently
    // dropped every student from that module. Defaults to the same value
    // so behavior is unchanged unless a project sets STUDENT_EMAIL_DOMAIN.
    studentEmailDomain:   p.STUDENT_EMAIL_DOMAIN     || "ccpsnet.net",

    // ── leader-hub OAuth connection (D1 — shared-core merge, Addendum 24) ──
    // The Google OAuth Client ID leader-hub's "Sign In With Google" button
    // is registered under. Same real value across every teacher's Teacher
    // Dashboard deployment (leader-hub is one app, not one per teacher) —
    // still a per-deployment Script Property, not hardcoded here, since
    // this shared config file has no reliable single place to hardcode a
    // real value into and 00_SharedConfig.js's own stated purpose is
    // reading everything from Script Properties. Set once per teacher
    // deployment during setup; see docs/LEADERHUB_CONNECTION_SETUP.md.
    // Empty means the leader-hub JSON API (doPost) fails closed — no
    // token can ever verify against an empty expected audience.
    leaderHubOauthClientId: p.LEADER_HUB_OAUTH_CLIENT_ID || "",

    // ── Teacher identity (written by the setup wizard, 16_UnifiedManualSetup.js, during teacher registration) ──
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

    // ── Module 2 (merged from 00_SharedConfig_M2_ADDENDUM_v2.js —
    // see cas-ccps/scripts/archived/ for the original) ──
    // Default is "false" — explicit opt-in required per installation. Set
    // M2_ENABLED = true in Script Properties to activate. A cloned ledger
    // without this property skips all M2 handlers.
    m2Enabled:                       p.M2_ENABLED || "false",
    shadowMatrixConfidenceThreshold: 0.75,  // threshold for email interrupt
    shadowMatrixDecayFactor:         0.85,  // KOS-derived cross-unit decay

    // ── Shared tab names (consistent across all projects) ──
    tabs: {
      ledger:          "Ledger",
      reviewQueue:     "ReviewQueue",
      stagingPipeline: "STAGING_PIPELINE",
      rubricQueue:     "RubricQueue",      // Central Studio Flow 1 trigger tab
      teacherMatrix:   "TeacherMatrix",
      draftUnits:      "DraftUnits",
      matrixRegistry:  "MatrixRegistry",   // Teacher Matrix SS ID lookup for Script 02

      // ── M2 Lightweight (merged from 00_SharedConfig_M2_ADDENDUM_v2.js) ──
      lessonContext:      "LessonContext",
      competencyRegistry: "CompetencyRegistry",
      alignmentLog:       "AlignmentLog",
      reportRegistry:     "ReportRegistry",

      // ── M2 Full / Warm-Ups (merged from 00_SharedConfig_M2_ADDENDUM_v2.js) ──
      studentProfiles:    "StudentProfiles",
      warmUpQueue:        "WarmUpQueue",
      warmUpRegistry:     "WarmUpRegistry",
      classSchedule:      "ClassSchedule",
      pacingGuide:        "PacingGuide",
      competencyRubrics:  "CompetencyRubrics",

      // ── M4 (merged from 00_SharedConfig_M4_ADDENDUM.js) ──
      studentDocRegistry: "StudentDocRegistry",
      warmUpResponses:    "WarmUpResponses",

      // ── Module 5 (30_SCRSuggestionEngine.js) — documented as expected by
      // that file's own architectural notes but never actually added here
      // until now; every existing reference already falls back to these
      // exact same literal names via `|| "SCRSuggestions"`/`|| "SCRDecisionLog"`,
      // so adding them is a no-op for current behavior, just makes the
      // fallback unnecessary going forward.
      scrSuggestions:     "SCRSuggestions",
      scrDecisionLog:     "SCRDecisionLog"
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
// ([TeacherName]_RubricQueue) created by 16_UnifiedManualSetup.js (the setup
// wizard) at teacher-registration time is retained as an audit
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

// =============================================================================
// CLIENT_ESC_JS — exact source of the client-side esc() HTML-escaping
// helper, shared verbatim by every dashboard's inline <script> block so
// the three copies (07_TeacherDashboard.js's buildDashboardHtml_() and
// buildMyContextHtml_(), and 13_StudentDashboard.js's
// buildStudentDashboardHtml_()) can never drift out of sync again — see
// meta/CODEBASE_REVIEW.md's P2 finding #5 (the two functions once
// disagreed on newline handling; a prior audit fixed the divergence, but
// three independent hardcoded copies meant nothing stopped it recurring).
// Interpolate as `${CLIENT_ESC_JS}` inside a template literal's own
// <script> block — this file is already on every cas-ccps GAS project's
// file list ("INCLUDE IN: Every Apps Script project in this system",
// above), so no clasp/manifest change is needed to reach any of them.
// =============================================================================
const CLIENT_ESC_JS = `function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}`;
// rubricQueue: "RubricQueue"  ← included in getConfig_() above
