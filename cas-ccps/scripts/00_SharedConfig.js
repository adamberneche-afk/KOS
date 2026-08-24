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

    // ── Evaluation escape hatch (external product review, Finding 3,
    // "this quarter") — same CFG.INFERENCE_MODE pattern kos-personal
    // already uses (1_Config_And_Deploy.gs), scaled down: cas-ccps has no
    // separate managed-inference-service, so the opt-in path here is a
    // direct Gemini API call (15c_Flow2DirectEvaluationService.js)
    // instead of a whole second deployment. Default "STUDIO" is today's
    // unchanged behavior — Flow 2 (Student Evaluation) runs as a native
    // Google Workspace Studio Flow, no code path in this repo calls it.
    // Set EVALUATION_MODE = "DIRECT_GEMINI" as a Script Property, plus a
    // DIRECT_GEMINI_API_KEY Script Property, to make Flow 2's evaluation
    // logic testable/runnable without a live Studio Flow — see
    // 15c_Flow2DirectEvaluationService.js's own header comment and
    // cas-ccps/README.md's Finding 3 writeup.
    evaluationMode:       p.EVALUATION_MODE         || "STUDIO",

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

// =============================================================================
// LEDGER — column indices (0-based) for the "Ledger" tab (cfg.tabs.ledger),
// canonical order per registerLedger_() (02_Form1_IntakeAndWorkspaceGenerator.js).
//
// External product review, Finding 8: 13_StudentDashboard.js's
// getStudentDashboardData() already builds one lookup this way correctly
// (stagingHeaders.indexOf("StudentFileID")) sitting right next to a dozen
// hardcoded row[N] literals reading this exact tab in the same function —
// a real header-shift (a column inserted/reordered on the live Ledger)
// would silently corrupt every one of those, with no error, just wrong
// data rendered to a student or teacher. This constant object is the
// same SCRS/SCRDL-style fix 30_SCRSuggestionEngine.js already uses for
// its own tabs (see that file's column-index comments) — matched to
// 13_StudentDashboard.js and 07_TeacherDashboard.js, the two files with
// this exact pattern: several hardcoded Ledger indices read together to
// build one dashboard-facing object.
//
// TURN_IN_SUGGESTED_SCORE (column 19) is NOT written by registerLedger_
// above — 07_TeacherDashboard.js's _ensureTurnInReviewColumns_() adds it
// self-healing, on first use, to an already-deployed Ledger that predates
// it (same pattern as 30_SCRSuggestionEngine.js's
// _ensureScrDecisionLogArchiveColumn_). Reading it is still safe via this
// same LEDGER constant even before that column exists — row[19] on a
// shorter row is simply undefined, same as today.
// =============================================================================
const LEDGER = {
  TIMESTAMP:              0,
  GOOGLE_ID:              1,   // student's Google account / district email
  CONFIG_ID:              2,
  FILE_ID:                3,
  STUDENT_NAME:           4,
  BLOCK:                  5,
  CLASS_NAME:             6,
  TEACHER_NAME:           7,
  TEACHER_EMAIL:          8,
  SUBJECT:                9,
  COURSE_NAME:            10,
  PERIOD:                 11,
  STATUS:                 12,
  SUBMISSION_TS:          13,
  NOTES:                  14,
  LAST_EVAL:              15,
  ADMIN_FILE_URL:         16,
  STUDENT_FILE_URL:       17,
  ACADEMIC_YEAR:          18,
  // Added self-healing by 07_TeacherDashboard.js's
  // _ensureTurnInReviewColumns_() (sheet.getRange(1, 20, 1, 4)) — absent on
  // a Ledger created before that feature existed, in which case row[N] for
  // any of these four is simply undefined, same as today.
  TURN_IN_SUGGESTED_SCORE:  19,
  TURN_IN_FINAL_SCORE:      20,
  TURN_IN_SCORE_DECIDED_BY: 21,
  TURN_IN_SCORE_DECIDED_AT: 22,
};

// One past the highest LEDGER index above — the Ledger's real, schema-known
// column count, TURN_IN_* columns included. External product review,
// Finding 6 ("this quarter" scaling fix): every getDataRange() call reads
// however wide the sheet's used range happens to be, which for the Ledger
// specifically means re-deriving the same known-fixed 23-column width from
// live sheet state on every single call, forever, and is vulnerable to the
// well-known GAS gotcha where one stray far-right value (ever entered, even
// by accident, even since deleted) can make getDataRange() report a wider
// range than the real schema forever after. getRange(1, 1, lastRow,
// LEDGER_COL_COUNT) reads exactly the columns this schema actually defines,
// no more, no less — used by the handful of call sites (10_AdminRecoveryPanel.js,
// 29_StudentContextAggregator.js, 30_SCRSuggestionEngine.js) that read the
// whole Ledger tab rather than a header-driven dynamic column set.
const LEDGER_COL_COUNT = 23;

// =============================================================================
// getCompetencyTextMap_ — CacheService layer over CompetencyRegistry
// (external product review, Finding 6, "this quarter" scaling fix).
//
// CompetencyRegistry maps competency_id -> competency_text: imported once
// at setup (22b_CompetencyRegistryImporter.js) and re-imported only on a
// deliberate admin action — read constantly (every SCR dashboard load,
// every warm-up bridge call, every alignment log write) but changes rarely.
// 30_SCRSuggestionEngine.js's getSCRDashboardData_() and
// getStudentScrStandingForCompetencies_() used to each independently
// getDataRange() + build this same map from scratch on every call. This
// wraps that identical block once, backed by Apps Script's own
// CacheService (a real cross-execution cache with a TTL, unlike a
// module-level variable, which resets every fresh execution) — a cache
// hit costs nothing beyond a JSON.parse of a small cached string, no
// sheet read at all.
//
// Cache key/TTL are process-wide (CacheService.getScriptCache(), not
// getUserCache()) — CompetencyRegistry isn't per-user data, every caller
// in every project should see the same map. 6-hour TTL: long enough that
// a busy day of dashboard loads costs at most one real read per 6 hours,
// short enough that a deliberate re-import (rare, admin-only) is visible
// well within the same day rather than needing a manual cache-bust step.
// Falls back to a direct, uncached read on any CacheService error (e.g.
// a value that happens to exceed CacheService's 100KB-per-key cap) rather
// than ever throwing — same fail-open-to-slow-path discipline as this
// file's own PropertiesService-backed caches elsewhere in this repo
// (31_PacingGuideManager.js's per-unit pacing cache).
// =============================================================================
const COMPETENCY_REGISTRY_CACHE_KEY = "competency_registry_text_map_v1";
const COMPETENCY_REGISTRY_CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

function getCompetencyTextMap_(registrySheet) {
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    const cached = cache.get(COMPETENCY_REGISTRY_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    // CacheService unavailable or the cached value was corrupt/unparsable
    // — fall through to a fresh read rather than failing the caller.
  }

  const compTextMap = {};
  if (registrySheet) {
    const regData = registrySheet.getDataRange().getValues();
    const regHeaders = regData[0] ? regData[0].map(h => String(h).trim()) : [];
    const iId = regHeaders.indexOf("competency_id");
    const iText = regHeaders.indexOf("competency_text");
    if (iId !== -1 && iText !== -1) {
      for (let i = 1; i < regData.length; i++) {
        compTextMap[String(regData[i][iId]).trim()] = String(regData[i][iText]).trim();
      }
    }
  }

  if (cache) {
    try {
      cache.put(COMPETENCY_REGISTRY_CACHE_KEY, JSON.stringify(compTextMap), COMPETENCY_REGISTRY_CACHE_TTL_SECONDS);
    } catch (e) {
      // Value too large for CacheService's 100KB-per-key cap, or some other
      // put() failure — non-fatal. The map we just built is still returned
      // to this caller; the next caller just pays for another fresh read.
    }
  }

  return compTextMap;
}
