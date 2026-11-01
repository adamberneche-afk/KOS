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
// WHERE EACH VALUE COMES FROM (first match wins):
//   1. This project's Script Properties — unchanged, so anything set there
//      today keeps working and still overrides everything below.
//   2. The Central Ledger ID, when no property names it, from the
//      spreadsheet this project is attached to. Its _CONFIG tab either
//      marks it as the Ledger itself (SYSTEM_ROLE = CENTRAL_LEDGER), or, on
//      a teacher's cloned sheet, carries CENTRAL_LEDGER_SS_ID (written by
//      the setup wizard via 19_ClonedSheetConfig.js). ADMIN_SS_ID defaults
//      to the Ledger ID: every installer and the setup wizard set the two
//      to the same spreadsheet.
//   3. District-wide settings (SHARED_CONFIG_KEYS, below) from the Central
//      Ledger's own _CONFIG tab — one place instead of one property per
//      project. seedLedgerConfigTab() creates it; showConfigSources() says
//      where each value came from.
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
//   RUBRIC_FORM_URL, INTAKE_FORM_URL, CONFIRM_REVIEW_FORM_URL
//   CONFIRM_REVIEW_FORM_ID, RUBRIC_QUEUE_TAB
//   CONFIRM_ENTRY_DRAFT_ID ... CONFIRM_ENTRY_DOD
// =============================================================================

// The shadow matrix's two numbers (23 builds it, 25 emails on it). Constants
// here, not in each file (dead-ends audit 2026-10-29): 23 and 25 used to
// hard-code the same values beside config fields nothing read. Not read
// through getConfig_(), which reads every Script Property: 23 uses them per
// student.
const SHADOW_MATRIX_CONFIDENCE_THRESHOLD = 0.75; // a unit's archetype "locks"; the teacher's digest
const SHADOW_MATRIX_DECAY_FACTOR = 0.85;         // KOS-derived cross-unit decay

function getConfig_() {
  const p = _resolveConfigValues_().values;

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
    studentEmailDomain:   p.STUDENT_EMAIL_DOMAIN     || SCHOOL_DEFAULTS.STUDENT_EMAIL_DOMAIN,

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
    // PARKED (D16, 2026-11-01): this is not a live switch. Nothing in the
    // pipeline reads it; it only lets runFlow2DirectGemini_() (15c) run when
    // called from the editor. Flow 2 always runs in Studio. Not listed by
    // showSetupStatus() since then.
    evaluationMode:       p.EVALUATION_MODE         || "STUDIO",

    // ── AI-feedback promise gate (external UX audit) ─────────────────────
    // 01_StudentDoc_ContainerScript.js used to tell every student "your
    // feedback will appear within 1-3 minutes" unconditionally, even
    // though the live/default evaluation path (evaluationMode "STUDIO")
    // has no working AI behind it until Flow 2 is actually built in
    // Studio — a promise the system had no way to keep and no way to
    // retract. Defaults false (today's real state for every deployment
    // that hasn't built Flow 2 yet); set AI_FLOWS_LIVE = "true" as a
    // Script Property once Flow 2 is genuinely live, to restore the
    // original copy.
    aiFlowsLive:          String(p.AI_FLOWS_LIVE).toLowerCase() === "true",

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
    rubricQueueTab:       p.RUBRIC_QUEUE_TAB         || "RubricQueue",

    // ── Teacher forms ──
    rubricFormUrl:        p.RUBRIC_FORM_URL           || "",
    confirmFormId:        p.CONFIRM_REVIEW_FORM_ID   || "",
    confirmFormUrl:       p.CONFIRM_REVIEW_FORM_URL  || "",
    intakeFormUrl:        p.INTAKE_FORM_URL           || "",

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

    // ── Shared tab names (consistent across all projects) ──
    tabs: {
      ledger:          "Ledger",
      reviewQueue:     "ReviewQueue",
      stagingPipeline: "STAGING_PIPELINE",
      rubricQueue:     "RubricQueue",      // Central Studio Flow 1 trigger tab
      teacherMatrix:   "TeacherMatrix",
      draftUnits:      "DraftUnits",
      matrixRegistry:  "MatrixRegistry",   // Teacher Matrix SS ID lookup for Script 02
      flowInput:       "FlowInput",        // Script 37's materialized Flow 2 input row
      evaluationLog:   "EvaluationLog",    // Script 37: one row per Flow 2 result, times and outcome only
      reflectionLog:   "ReflectionLog",    // Script 13: the student's process reflection, one row per answer
      // Student Dashboard (13) appends one row (timestamp, error code, nothing
      // else) here each time Submit for Feedback fails for a system-side
      // reason; the CAS attention signal (34b) counts them. Created on the
      // first failure, so a missing tab means no failures, not a problem.
      submitFailures:  "SubmitFailures",

      // ── M2 Lightweight (merged from 00_SharedConfig_M2_ADDENDUM_v2.js) ──
      lessonContext:      "LessonContext",
      competencyRegistry: "CompetencyRegistry",
      alignmentLog:       "AlignmentLog",
      reportRegistry:     "ReportRegistry",

      // ── M2 Full / Warm-Ups (merged from 00_SharedConfig_M2_ADDENDUM_v2.js) ──
      studentProfiles:    "StudentProfiles",
      warmUpQueue:        "WarmUpQueue",
      warmUpRegistry:     "WarmUpRegistry",
      warmUpTextBox:      "WarmUpTextBox",
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
      scrDecisionLog:     "SCRDecisionLog",

      // ── Flow 2's evidence tab (15c_Flow2DirectEvaluationService.js's
      // writeCompetencyEvidenceFromFlow2_, this project's own
      // installSCRTrigger_ in 30_SCRSuggestionEngine.js) — same
      // "documented but never added" situation as scrSuggestions/
      // scrDecisionLog above: every existing reference in THIS project
      // already falls back to this exact literal name via
      // `|| "CompetencyEvidence"`, so adding it is a no-op for current
      // behavior. cas-ccps/studio-steps/CommitStudentEvaluationStep.gs
      // is a separate GAS project with no access to this file or
      // getConfig_() — it hardcodes the same literal name directly, by
      // necessity, not via this config key.
      competencyEvidence: "CompetencyEvidence",

      // ── 36_WeeklyParentReport.js ──
      // One row per student per week: what was prepared, and when the
      // teacher copied it (with the copied text, since 2026-10-28). Since
      // D1 (2026-10-23) the teacher sends each report from their own
      // account, so recipient_address is left blank: the app never knows who
      // it went to. Rows from before then can hold an address, which the
      // Family Mail Sentinel (60) still reads to recognise a parent.
      parentReportLog:    "ParentReportLog"
    }
  };
}

// =============================================================================
// CONFIG RESOLUTION — Script Properties, then the attached sheet, then the
// Central Ledger's _CONFIG tab (see this file's header for the order).
// =============================================================================

// The only keys the Ledger's shared _CONFIG tab may supply: district-wide
// values that are the same for every project. Per-teacher values and
// secrets are deliberately absent. TEACHER_EMAIL is the Teacher
// Dashboard's access gate (_isAuthorizedTeacher_), so a shared tab
// supplying it would authorize that one address on every dashboard that
// hadn't set its own. TEACHER_DASHBOARD_URL is per teacher too: each
// teacher gets their own deployment. M2_ENABLED is left out because seven
// files read it straight from Script Properties; supplied only here, it
// would switch Module 2 on for getConfig_() and off for all of them.
//
// Only getConfig_() reads this tab. Code that calls getProperty() directly
// still needs the property: the Unified Manual's setup wizard and
// installer (where these values originate), and student docs (01), which
// run as the student and can't open the Ledger anyway.
const SHARED_CONFIG_KEYS = [
  "ADMIN_ROOT_FOLDER_ID",
  "ADMIN_NOTIFY_EMAIL",
  "STUDENT_DASHBOARD_URL",
  "STUDENT_EMAIL_DOMAIN",
  // The school (packaging step 1): read through schoolProfile_().
  "SCHOOL_COURSES",
  "STUDENT_ID_PATTERN",
  // The SCR retry's two thresholds: read through scrRetryThresholds_().
  "SCR_RETRY_MIN_MET",
  "SCR_RETRY_LINKED_PER_MISS",
  "STUDENT_MAIL_DOMAIN",
  "STAFF_MAIL_DOMAIN",
  "EARLY_RELEASE_DAYS",
  "SCHOOL_DAYS_OFF",
  "BELL_SCHEDULE",
  "LEADER_HUB_OAUTH_CLIENT_ID",
  "MASTER_STUDENT_TEMPLATE_ID",
  "MASTER_RUBRIC_RESPONSE_SS_ID",
  "MASTER_TEACHER_MATRIX_SS_ID",
  // Research-pivot feature flags (meta/PRD_CAS_RESEARCH_PIVOT.md). Here so
  // one _CONFIG row reaches every project; read through pivotFlagFor_().
  "PIVOT_ARCHETYPE_LOCK",
  // When each marking period ends; read through currentTerm_().
  "MARKING_PERIOD_ENDS",
  // Activity, delay and other days called as they come ("2026-11-05=DELAY,
  // ..."); read through bellScheduleFor_() (2026-10-28).
  "SCHEDULE_DAYS",
  // Where Flow 2 feedback goes; read through feedbackAsCommentFor_().
  "FEEDBACK_AS_COMMENT",
  // Warm-ups answered on the Student Dashboard; read through
  // warmUpTextBoxFor_().
  "WARMUP_TEXT_BOX",
  // The nightly lesson rollout's switch (58); read through pivotFlagFor_().
  // Missing until 2026-10-22, so a _CONFIG row was ignored though the docs
  // said it worked there (UX audit, fix-first 6).
  "ROLLOUT_AUTO_APPLY",
  // The process reflection on Submit (13); read through pivotFlagFor_().
  "REFLECTION_ON_SUBMIT",
  // Friday's parent report rows prepared ahead (36); read through
  // _pivotValueOn_, per course.
  "PARENT_REPORT_PREP"
];

// System text a student response must not contain (P0-03,
// meta/PRD_CAS_RESEARCH_PIVOT.md). Studio's Flow 2 pastes the doc's response
// zone straight into its prompt with no escaping step (15b's security note),
// so a pasted feedback stamp or a submission delimiter would reach Gemini as
// if it were the system's own. Feedback blocks show "[SYSTEM: …]" to the
// student by design, which makes pasting one back the likely way in.
// Matched case-insensitively, with loose spacing.
const SYSTEM_TEXT_PATTERNS = [
  /<<<\s*(END_)?STUDENT_SUBMISSION\s*>>>/i,
  /\[\s*SYSTEM\s*:/i,
  /\[\s*SUGGESTED_SCORE/i,
  /\[\s*MILESTONE_OUTCOMES/i,
  /<<<\s*(END_)?PROCESS_REFLECTION\s*>>>/i,
  /<<<\s*(END_)?EARLIER_PARTS\s*>>>/i,
  // The evaluator's tertiary-evidence line (#216); 37 parses the last one
  // it wrote, and a student's copy must never reach it (Docket IV).
  /\[\s*ALSO_SHOWN/i,
];

// The first system-text token in `text` (for example "[SYSTEM:"), or "".
function findSystemText_(text) {
  const s = String(text === undefined || text === null ? "" : text);
  for (let i = 0; i < SYSTEM_TEXT_PATTERNS.length; i++) {
    const m = s.match(SYSTEM_TEXT_PATTERNS[i]);
    if (m) return m[0];
  }
  return "";
}

// Claims a run slot: true, and the Script Property `key` set to now + ms,
// when no other run holds it; false when one does. The read and the write
// happen under the script lock, so two runs that start together can't both
// see the slot free (KOS Audit Docket IV, Low: the rollout's and the Ledger
// cycle's guards were a plain check-then-set). The lock is held only for
// that, not for the run: the jobs a run calls take their own locks. A run
// that can't get the lock in 5 seconds treats the slot as taken.
function claimRunSlot_(key, ms) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return false;
  try {
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    if (Number(props.getProperty(key) || 0) > now) return false;
    props.setProperty(key, String(now + ms));
    return true;
  } finally {
    lock.releaseLock();
  }
}

// The same text with every system-text token replaced, for a student's
// words that reach a model prompt after the submit-time check has run: a
// warm-up answer (Flow 4), an earlier part re-read from a doc the student
// can still edit (Flow 2). Checking only at submit left those paths open
// (KOS Audit Docket IV, 2026-10-31). Words around a token are kept.
function neutralizeSystemText_(text) {
  let s = String(text === undefined || text === null ? "" : text);
  for (let i = 0; i < SYSTEM_TEXT_PATTERNS.length; i++) {
    s = s.replace(new RegExp(SYSTEM_TEXT_PATTERNS[i].source, "gi"), "(system text removed)");
  }
  return s;
}

// Whether a research-pivot flag is on for a course. Values: blank or "off"
// (default), "all", or a course code ("8175" / "8177") to enable one course
// first. With no courseCode, only "all" turns a flag on, so a course-wide
// action (a digest email, say) never runs while one course is still trialling
// the feature. Read fresh on each call: Script Property first, then the
// Ledger's _CONFIG tab (SHARED_CONFIG_KEYS).
function pivotFlagFor_(flagName, courseCode) {
  let raw;
  try {
    raw = _resolveConfigValues_().values[flagName];
  } catch (e) {
    return false; // unconfigured project: every pivot feature stays off
  }
  return _pivotValueOn_(raw, courseCode);
}

// A value can also list courses ("8175,8177"), as the Teacher Dashboard's
// ⚙ Settings writes it (2026-10-27): on for each one listed.
function _pivotValueOn_(raw, courseCode) {
  const value = String(raw === undefined || raw === null ? "" : raw).trim().toLowerCase();
  if (value === "" || value === "off") return false;
  if (value === "all") return true;
  const course = String(courseCode === undefined || courseCode === null ? "" : courseCode)
    .trim().toLowerCase();
  return course !== "" && value.split(",").some(function (c) { return c.trim() === course; });
}

// The settings the Teacher Dashboard's ⚙ Settings panel changes (07's
// TD_SETTINGS, plus the marking period end dates). The Central Ledger's
// nightly signal names any of them set as a Script Property there (34c),
// since that would override the panel without it knowing.
const DASHBOARD_SETTING_KEYS = ["FEEDBACK_AS_COMMENT", "WARMUP_TEXT_BOX", "ROLLOUT_AUTO_APPLY",
  "REFLECTION_ON_SUBMIT", "PIVOT_ARCHETYPE_LOCK", "PARENT_REPORT_PREP", "MARKING_PERIOD_ENDS", "SCHEDULE_DAYS"];

// Whether a submission's Flow 2 feedback goes on the student's doc as a
// comment instead of into its feedback zone (FEEDBACK_AS_COMMENT, read like
// a pivot flag: blank/"off", "all", or one course code). On, the harvest
// (37) posts a comment, 03 adds nothing to the doc, and intake (02) builds
// new docs without a feedback zone, so the doc holds only the assignment and
// the student's work.
//
// A student's ConfigID is a workspace ID ("VDOE-XXXXXX-2026", 02), which
// carries no course, so the course comes from a course name: the caller's
// (intake, before the Ledger row exists) or the Ledger row's class, subject
// or course name (ledgerRowCourseCode_). The Ledger is read only for a
// one-course value; "off" and "all" need no course. A lesson's ConfigID
// ("CAS-8175-L06") names its course directly.
function feedbackAsCommentFor_(configId, courseName) {
  return feedbackAsCommentChecker_()(configId, courseName);
}

// The same test with the flag read once (and the Ledger at most once), for
// a loop over many assignments.
function feedbackAsCommentChecker_() {
  let raw = "";
  try {
    raw = _resolveConfigValues_().values.FEEDBACK_AS_COMMENT;
  } catch (e) {
    raw = ""; // unconfigured project: feedback stays in the doc
  }
  const value = String(raw === undefined || raw === null ? "" : raw).trim().toLowerCase();
  let byConfigId = null;
  return function (configId, courseName) {
    if (value === "" || value === "off" || value === "all") return _pivotValueOn_(raw, null);
    const id = String(configId || "").trim();
    const m = id.match(/^CAS-([A-Za-z0-9]+)-/);
    let code = m && schoolCourseCodes_().indexOf(m[1]) !== -1 ? m[1] : warmUpCourseCode_(courseName);
    if (!code && id) {
      if (!byConfigId) byConfigId = _ledgerCourseCodes_();
      code = byConfigId[id] || "";
    }
    return _pivotValueOn_(raw, code);
  };
}

// "8175", "8177" or "" for a Ledger row, from the first of its class,
// subject and course names that names a course. Roster enrollment (52)
// writes the Canvas course name to all three.
function ledgerRowCourseCode_(row) {
  const cols = [LEDGER.CLASS_NAME, LEDGER.SUBJECT, LEDGER.COURSE_NAME];
  for (let i = 0; i < cols.length; i++) {
    const code = warmUpCourseCode_(row[cols[i]]);
    if (code) return code;
  }
  return "";
}

// ConfigID → course code for every Ledger row. An unreadable Ledger gives
// {}, so a one-course value keeps feedback in the doc, and says so.
function _ledgerCourseCodes_() {
  const out = {};
  try {
    const cfg = getConfig_();
    const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
    if (!sheet || sheet.getLastRow() < 2) return out;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, LEDGER.COURSE_NAME + 1).getValues().forEach(function (row) {
      const id = String(row[LEDGER.CONFIG_ID] || "").trim();
      const code = ledgerRowCourseCode_(row);
      if (id && code) out[id] = code;
    });
  } catch (e) {
    Logger.log("[FEEDBACK_AS_COMMENT] Ledger unreadable, feedback stays in the doc: " + e.message);
  }
  return out;
}

// Whether a course's warm-ups are answered in a text box on the Student
// Dashboard instead of in a doc (WARMUP_TEXT_BOX, read like a pivot flag).
// On, Flow 3's harvest (41) writes the warm-up to the WarmUpTextBox tab and
// makes no doc; the dashboard (13) saves the answer and the extra-credit
// reply there; the nightly scoring (25) reads them from it. A warm-up keeps
// the form it was delivered in if the flag changes later.
function warmUpTextBoxFor_(courseName) {
  return pivotFlagFor_("WARMUP_TEXT_BOX", warmUpCourseCode_(courseName));
}

// A configured course's code, or "", from a course name (schoolCourseOf_;
// the one rule 24's courseCodeFromName_ and 51's _cybCourseCode_ share).
function warmUpCourseCode_(courseName) {
  return schoolCourseOf_(courseName);
}

// =============================================================================
// THE SCHOOL: what used to be written into the code (packaging step 1,
// 2026-11-01; meta/PLAN_2026-11.md, "No hardcoded school")
// =============================================================================
// Each value comes from configuration (a Script Property, or the Central
// Ledger's _CONFIG tab: SHARED_CONFIG_KEYS), with today's school as the
// default, so an install that sets none of them behaves exactly as before.
//
//   SCHOOL_COURSES       "8175=marketing,8177=management": each course's
//                        code, and a word that also names it in a course
//                        name. The first that a name matches wins.
//   STUDENT_EMAIL_DOMAIN "ccpsnet.net": students' account domain.
//   STUDENT_ID_PATTERN   "\\d{7}": a student account's part before the @, as
//                        a regular expression (seven digits).
//   STUDENT_MAIL_DOMAIN  "student.ccpsnet.net": the domain students' mail
//                        comes from (the Family Mail Sentinel, 60).
//   STAFF_MAIL_DOMAIN    "ccpsnet.net": the district's staff mail (60).
//   EARLY_RELEASE_DAYS   the 2026-27 early-release dates, "yyyy-MM-dd,...".
//   SCHOOL_DAYS_OFF      "" : weekdays without school, "yyyy-MM-dd,...". A
//                        part held by a failed check (68) skips them.
//   BELL_SCHEDULE        JSON: { "classMinutes": { name: [minutes per
//                        block] }, "labels": { name: label }, "rotation":
//                        [{ "until": "yyyy-MM-dd" or "", "byDay": [name for
//                        Sunday ... Saturday] }] }. Each part left out keeps
//                        its default (Clover Hill's 2026-27 schedule, below).
//
// What stays course-specific on purpose: the lesson and unit data (53b, 55b,
// generated per course), the pacing guide's objective_8175 / _8177 columns
// (31, 23, 28: that sheet's schema, until the course builder replaces it),
// and the two courses' expected registry counts (51). The Unified Manual's
// library ID lives in the manifests, and comes from the install registry
// (packaging step 3).
const SCHOOL_DEFAULTS = {
  SCHOOL_COURSES: "8175=marketing,8177=management",
  STUDENT_EMAIL_DOMAIN: "ccpsnet.net",
  STUDENT_ID_PATTERN: "\\d{7}",
  STUDENT_MAIL_DOMAIN: "student.ccpsnet.net",
  STAFF_MAIL_DOMAIN: "ccpsnet.net",
  EARLY_RELEASE_DAYS: "2026-10-30,2026-11-13,2027-01-22,2027-02-05,2027-04-23,2027-06-03,2027-06-04",
  SCHOOL_DAYS_OFF: "",
};

// The school as configured, read once per run. `values` (tests, or a caller
// holding resolved config) skips the read and the cache. A value that doesn't
// parse falls back to its default, and says so in the log.
let _schoolProfileCache_ = null;
function schoolProfile_(values) {
  if (!values && _schoolProfileCache_) return _schoolProfileCache_;
  let v = values;
  if (!v) {
    try { v = _resolveConfigValues_().values; } catch (e) { v = {}; }
  }
  const get = function (k) {
    const x = v[k];
    return x === undefined || x === null || String(x).trim() === "" ? SCHOOL_DEFAULTS[k] : String(x).trim();
  };
  const out = {
    courses: _schoolCourses_(get("SCHOOL_COURSES")),
    studentEmailDomain: get("STUDENT_EMAIL_DOMAIN").replace(/^@/, "").toLowerCase(),
    studentIdPattern: _schoolIdPattern_(get("STUDENT_ID_PATTERN")),
    studentMailDomain: get("STUDENT_MAIL_DOMAIN").replace(/^@/, "").toLowerCase(),
    staffMailDomain: get("STAFF_MAIL_DOMAIN").replace(/^@/, "").toLowerCase(),
    earlyReleaseDays: _schoolDates_(get("EARLY_RELEASE_DAYS")),
    daysOff: _schoolDates_(get("SCHOOL_DAYS_OFF") || ""),
    bell: _schoolBell_(v.BELL_SCHEDULE),
  };
  if (!values) _schoolProfileCache_ = out;
  return out;
}

// "8175=marketing,8177=management" → [{ code, word }]. A code is letters and
// digits; the word is optional. None valid → the default.
function _schoolCourses_(raw) {
  const out = [];
  String(raw || "").split(",").forEach(function (pair) {
    const m = /^\s*([A-Za-z0-9]+)\s*(?:=\s*(.*?))?\s*$/.exec(pair);
    if (m && !out.some(function (c) { return c.code === m[1]; })) out.push({ code: m[1], word: m[2] || "" });
  });
  if (out.length) return out;
  Logger.log("[SCHOOL] SCHOOL_COURSES names no course; using the default.");
  return raw === SCHOOL_DEFAULTS.SCHOOL_COURSES ? [] : _schoolCourses_(SCHOOL_DEFAULTS.SCHOOL_COURSES);
}

// The student-ID expression's source, or the default's if it won't compile.
function _schoolIdPattern_(raw) {
  try { new RegExp("^(?:" + raw + ")$"); return raw; } catch (e) {
    Logger.log("[SCHOOL] STUDENT_ID_PATTERN is not a valid expression; using the default.");
    return SCHOOL_DEFAULTS.STUDENT_ID_PATTERN;
  }
}

// "yyyy-MM-dd,..." → the whole dates in it.
function _schoolDates_(raw) {
  return String(raw || "").split(",").map(function (d) { return d.trim(); })
    .filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); });
}

// BELL_SCHEDULE over the defaults, part by part.
function _schoolBell_(raw) {
  const bell = { classMinutes: BELL_DEFAULT_CLASS_MINUTES, labels: BELL_DEFAULT_LABELS, rotation: BELL_DEFAULT_ROTATION };
  if (raw === undefined || raw === null || String(raw).trim() === "") return bell;
  let o;
  try { o = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) {
    Logger.log("[SCHOOL] BELL_SCHEDULE is not valid JSON; using the default.");
    return bell;
  }
  const cm = o && o.classMinutes;
  if (cm && typeof cm === "object" && Object.keys(cm).length &&
      Object.keys(cm).every(function (k) { return Array.isArray(cm[k]) && cm[k].length && cm[k].every(function (n) { return typeof n === "number" && n >= 0; }); })) {
    bell.classMinutes = cm;
  } else if (cm) Logger.log("[SCHOOL] BELL_SCHEDULE.classMinutes is not { name: [minutes, ...] }; using the default.");
  if (o && o.labels && typeof o.labels === "object") bell.labels = o.labels;
  const rot = o && o.rotation;
  if (Array.isArray(rot) && rot.length && rot.every(function (r) {
    return r && Array.isArray(r.byDay) && r.byDay.length === 7 && r.byDay.every(function (n) { return bell.classMinutes[n]; }) &&
      (!r.until || /^\d{4}-\d{2}-\d{2}$/.test(r.until));
  })) {
    bell.rotation = rot;
  } else if (rot) Logger.log("[SCHOOL] BELL_SCHEDULE.rotation is not [{ until, byDay: [7 schedule names] }]; using the default.");
  return bell;
}

// The configured course codes, in order: ["8175", "8177"] by default.
function schoolCourseCodes_() {
  return schoolProfile_().courses.map(function (c) { return c.code; });
}

// The configured course a name names (its code in the name, or its word,
// any case), or "".
function schoolCourseOf_(courseName) {
  const name = String(courseName || "");
  if (!name) return "";
  const courses = schoolProfile_().courses;
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (name.indexOf(c.code) !== -1) return c.code;
    if (c.word && name.toLowerCase().indexOf(c.word.toLowerCase()) !== -1) return c.code;
  }
  return "";
}

// A bare student ID (no @): /^(?:STUDENT_ID_PATTERN)$/. The whole account
// is 29's _studentIdPattern_(), the ID then "@" and STUDENT_EMAIL_DOMAIN.
function studentIdRegex_() {
  return new RegExp("^(?:" + schoolProfile_().studentIdPattern + ")$");
}

// How messages describe a student account's ID: "7 digits" for the default
// pattern, otherwise "the school's student ID".
function studentIdDescription_() {
  return schoolProfile_().studentIdPattern === SCHOOL_DEFAULTS.STUDENT_ID_PATTERN ? "7 digits" : "the school's student ID";
}

// A school day: a weekday that isn't in SCHOOL_DAYS_OFF.
function isSchoolDay_(ymd) {
  const day = String(ymd || "").slice(0, 10);
  const p = day.split("-").map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return dow !== 0 && dow !== 6 && schoolProfile_().daysOff.indexOf(day) === -1;
}

// WarmUpTextBox: one row per warm-up delivered to the dashboard, keyed by
// WarmUpQueue's queue_id. WarmUpQueue itself stays 21 columns (see 41's
// header). Student writing lives here and, once scored, in WarmUpQueue's
// response_text, as it already did for doc warm-ups.
const WTB_HEADERS = ["queue_id", "lesson_date", "bridge_text", "warmup_text",
  "response_text", "submitted_at", "reply_text", "replied_at"];
const WTB = { QUEUE_ID: 0, LESSON_DATE: 1, BRIDGE: 2, WARMUP: 3,
  RESPONSE: 4, SUBMITTED_AT: 5, REPLY: 6, REPLIED_AT: 7 };

function warmUpTextBoxSheet_(ss) {
  let sheet = ss.getSheetByName(getConfig_().tabs.warmUpTextBox);
  if (!sheet) {
    sheet = ss.insertSheet(getConfig_().tabs.warmUpTextBox);
    sheet.getRange(1, 1, 1, WTB_HEADERS.length).setValues([WTB_HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.getRange("B:B").setNumberFormat("@"); // lesson_date stays YYYY-MM-DD text
  }
  return sheet;
}

// queue_id -> { sheetRow, row } ({} when the tab doesn't exist yet).
function readWarmUpTextBox_(ss) {
  const out = {};
  const sheet = ss.getSheetByName(getConfig_().tabs.warmUpTextBox);
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, WTB_HEADERS.length).getValues().forEach(function (row, i) {
    const id = String(row[WTB.QUEUE_ID] || "").trim();
    if (id) out[id] = { sheetRow: i + 2, row: row };
  });
  return out;
}

// WarmUpQueue's timing columns (2026-10-23), after 34's archive_status (21):
// when the warm-up was delivered (41, on DELIVERED) and when the student
// last answered it (25, at the nightly scoring: the text box's save time, or
// the doc's last edit). So delivery-to-answer time is kept, not just the
// score. Headers fill themselves in on first use, archive_status's too if
// it's still blank, so the header row has no gap.
const WQ_TIMING = { DELIVERED_AT: 22, ANSWERED_AT: 23 };
const WQ_TIMING_HEADERS = ["archive_status", "delivered_at", "answered_at"];

function stampWarmUpTiming_(wqSheet, sheetRow, col, when) {
  const head = wqSheet.getRange(1, 22, 1, WQ_TIMING_HEADERS.length);
  const have = head.getValues()[0];
  if (have.some(function (h, i) { return String(h).trim() !== WQ_TIMING_HEADERS[i]; })) {
    head.setValues([WQ_TIMING_HEADERS.map(function (h, i) { return String(have[i] || "").trim() || h; })]);
  }
  const cell = wqSheet.getRange(sheetRow, col + 1);
  if (String(cell.getValue()).trim() === "" || col === WQ_TIMING.ANSWERED_AT) cell.setValue(when);
}

// Text a student or a model wrote, made safe to setValue: a leading = + - @
// would otherwise be read as a formula. The apostrophe isn't stored.
function sheetSafeText_(s) {
  const t = String(s === undefined || s === null ? "" : s);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

// A timestamp cell as milliseconds, or NaN. Apps Script writes a Date, but a
// Studio flow writes "Now." as text, "October 20, 2026 at 3:29 AM EDT" (or
// "at 4 AM EDT"), which new Date() can't parse (found 2026-10-21: the
// overnight email's 24 hours never ended for a Studio return row).
const SHEET_TS_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SHEET_TS_ZONES = { EDT: -4, EST: -5, CDT: -5, CST: -6, MDT: -6, MST: -7, PDT: -7, PST: -8, UTC: 0, GMT: 0 };
function sheetTimestampMs_(value) {
  const direct = new Date(value).getTime();
  if (!isNaN(direct)) return direct;
  const m = /^([a-z]+)\.? (\d{1,2}), (\d{4})(?: at)? (\d{1,2})(?::(\d{2}))?(?::(\d{2}))? ?([ap]m) ([a-z]{3})$/i
    .exec(String(value || "").trim());
  if (!m) return NaN;
  const month = SHEET_TS_MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  const zone = SHEET_TS_ZONES[m[8].toUpperCase()];
  const hour = Number(m[4]) % 12 + (m[7].toLowerCase() === "pm" ? 12 : 0);
  if (month < 0 || zone === undefined || Number(m[4]) > 12) return NaN;
  return Date.UTC(Number(m[3]), month, Number(m[2]), hour - zone, Number(m[5] || 0), Number(m[6] || 0));
}

// Same Key | Value tab 19_ClonedSheetConfig.js already writes into each
// teacher's cloned sheets. On the Ledger, a SYSTEM_ROLE row marks it.
const CONFIG_TAB_NAME   = "_CONFIG";
const LEDGER_ROLE_KEY   = "SYSTEM_ROLE";
const LEDGER_ROLE_VALUE = "CENTRAL_LEDGER";

// Edits to the Ledger's _CONFIG tab reach each project within this long.
const SHARED_CONFIG_CACHE_TTL_SECONDS = 10 * 60;
const SHARED_CONFIG_CACHE_PREFIX      = "cas_shared_config_v1:";

// One read per execution at most; getConfig_() is called many times per run.
let _sharedConfigMemo_ = null;

// Returns { values, sources }: every Script Property plus the resolved
// fallbacks, and for each fallback key where it came from.
function _resolveConfigValues_() {
  const props  = PropertiesService.getScriptProperties().getProperties();
  const values = {};
  const sources = {};
  Object.keys(props).forEach(function (k) {
    // A blank property is unset. The setup wizard writes "" placeholders
    // (MASTER_STUDENT_TEMPLATE_ID, the dashboard URLs), and those must not
    // hide a real value further down.
    if (props[k] !== "" && props[k] !== null && props[k] !== undefined) {
      values[k] = props[k];
      sources[k] = "Script Property";
    }
  });

  if (!values.CENTRAL_LEDGER_SS_ID) {
    const fromSheet = _ledgerIdFromAttachedSheet_();
    if (fromSheet) {
      values.CENTRAL_LEDGER_SS_ID = fromSheet.id;
      sources.CENTRAL_LEDGER_SS_ID = fromSheet.source;
    }
  }
  if (!values.CENTRAL_LEDGER_SS_ID) {
    throw new Error(
      "Script Properties not configured. Missing: CENTRAL_LEDGER_SS_ID\n" +
      "Run the Teacher Manual setup wizard, set CENTRAL_LEDGER_SS_ID in Script Properties, " +
      "or contact your system administrator."
    );
  }
  if (!values.ADMIN_SS_ID) {
    values.ADMIN_SS_ID = values.CENTRAL_LEDGER_SS_ID;
    sources.ADMIN_SS_ID = "same as CENTRAL_LEDGER_SS_ID";
  }

  if (SHARED_CONFIG_KEYS.some(function (k) { return !values[k]; })) {
    const shared = _readSharedConfig_(values.CENTRAL_LEDGER_SS_ID);
    SHARED_CONFIG_KEYS.forEach(function (k) {
      if (!values[k] && shared[k]) {
        values[k] = shared[k];
        sources[k] = "Central Ledger _CONFIG tab";
      }
    });
  }
  return { values: values, sources: sources };
}

// Key -> value from a spreadsheet's _CONFIG tab; {} when there isn't one.
function _readConfigTab_(ss) {
  const sheet = ss.getSheetByName(CONFIG_TAB_NAME);
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 0; i < rows.length; i++) {
    const key = String(rows[i][0] === undefined ? "" : rows[i][0]).trim();
    const val = String(rows[i][1] === undefined ? "" : rows[i][1]).trim();
    if (key && key !== "Key" && val) map[key] = val;
  }
  return map;
}

// { id, source } for the Ledger, from the spreadsheet this project is
// attached to, or null. Web apps, Doc-bound projects and simple triggers
// have no attached spreadsheet (or can't read one), which is fine: they
// fall through to the Script Property.
function _ledgerIdFromAttachedSheet_() {
  try {
    if (typeof SpreadsheetApp.getActiveSpreadsheet !== "function") return null;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return null;
    const tab = _readConfigTab_(ss);
    // The Ledger itself: getId() is always right, even in a copy made for
    // testing, where a stored ID would still point at the original.
    if (tab[LEDGER_ROLE_KEY] === LEDGER_ROLE_VALUE) {
      return { id: ss.getId(), source: "this spreadsheet (marked CENTRAL_LEDGER)" };
    }
    if (tab.CENTRAL_LEDGER_SS_ID) {
      return { id: tab.CENTRAL_LEDGER_SS_ID, source: "attached sheet's _CONFIG tab" };
    }
  } catch (e) { /* no attached spreadsheet — fall through */ }
  return null;
}

// SHARED_CONFIG_KEYS values from the Ledger's _CONFIG tab. A successful
// read is cached for the whole project. A failed one (a simple trigger,
// which can't open other files; a wrong Ledger ID) is not cached beyond
// this execution: remembering it would hide the values from the next
// fully authorized run by the same person, and anyone who uses
// getConfig_() can already open the Ledger (the Student Dashboard reads it
// as the student).
function _readSharedConfig_(ledgerId) {
  if (_sharedConfigMemo_ && _sharedConfigMemo_.id === ledgerId) return _sharedConfigMemo_.values;
  const cacheKey = SHARED_CONFIG_CACHE_PREFIX + ledgerId;
  let values = null;

  try {
    const hit = CacheService.getScriptCache().get(cacheKey);
    if (hit) values = JSON.parse(hit);
  } catch (e) { /* cache unavailable — read the tab */ }

  if (!values) {
    try {
      const tab = _readConfigTab_(SpreadsheetApp.openById(ledgerId));
      values = {};
      SHARED_CONFIG_KEYS.forEach(function (k) { if (tab[k]) values[k] = tab[k]; });
      try {
        CacheService.getScriptCache().put(cacheKey, JSON.stringify(values), SHARED_CONFIG_CACHE_TTL_SECONDS);
      } catch (e) { /* uncached is only slower */ }
    } catch (e) {
      values = {};
    }
  }

  _sharedConfigMemo_ = { id: ledgerId, values: values };
  return values;
}

// Run once from the Apps Script editor of a project whose Script
// Properties hold the district-wide values (the Unified Manual's, where
// the setup wizard writes them, or central-ledger's). Creates the Central
// Ledger's _CONFIG tab if needed, marks it SYSTEM_ROLE = CENTRAL_LEDGER,
// and copies in each SHARED_CONFIG_KEYS value this project has that the
// tab doesn't. It never overwrites or deletes a row: a value that differs
// from the tab is logged as a conflict for you to settle by hand. Safe to
// run from several projects to fill different gaps.
function seedLedgerConfigTab() {
  // 00b is only in the projects that serve a web app beyond the owner.
  if (typeof requireScriptOwner_ === "function") requireScriptOwner_();
  const resolved = _resolveConfigValues_();
  const ledgerId = resolved.values.CENTRAL_LEDGER_SS_ID;
  const props    = PropertiesService.getScriptProperties().getProperties();
  const ss       = SpreadsheetApp.openById(ledgerId);
  // Marking the wrong spreadsheet CENTRAL_LEDGER would make every project
  // attached to it treat it as the Ledger.
  if (!ss.getSheetByName("Ledger")) {
    throw new Error("Spreadsheet " + ledgerId + " has no Ledger tab, so it isn't the Central " +
      "Ledger. Check this project's CENTRAL_LEDGER_SS_ID before seeding.");
  }

  let sheet = ss.getSheetByName(CONFIG_TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_TAB_NAME);
    sheet.appendRow(["Key", "Value"]);
    try {
      const protection = sheet.protect();
      protection.setDescription("District-wide cas-ccps settings — read by every project's getConfig_()");
      protection.setWarningOnly(true);
    } catch (e) { /* protection is best effort */ }
  }

  const existing = _readConfigTab_(ss);
  const added = [];
  const conflicts = [];
  if (existing[LEDGER_ROLE_KEY] !== LEDGER_ROLE_VALUE) {
    if (existing[LEDGER_ROLE_KEY]) {
      conflicts.push(LEDGER_ROLE_KEY + ": tab says \"" + existing[LEDGER_ROLE_KEY] + "\"");
    } else {
      sheet.appendRow([LEDGER_ROLE_KEY, LEDGER_ROLE_VALUE]);
      added.push(LEDGER_ROLE_KEY);
    }
  }
  SHARED_CONFIG_KEYS.forEach(function (k) {
    const mine = String(props[k] || "").trim();
    if (!mine) return;
    if (!existing[k]) {
      sheet.appendRow([k, mine]);
      added.push(k);
    } else if (existing[k] !== mine) {
      conflicts.push(k + ": tab has \"" + existing[k] + "\", this project has \"" + mine + "\"");
    }
  });

  try { CacheService.getScriptCache().remove(SHARED_CONFIG_CACHE_PREFIX + ledgerId); } catch (e) { /* ignore */ }
  _sharedConfigMemo_ = null;

  Logger.log("[CONFIG] Ledger _CONFIG tab: added " + (added.length ? added.join(", ") : "nothing") + ".");
  if (conflicts.length) {
    Logger.log("[CONFIG] Left as they are, settle by hand:\n  " + conflicts.join("\n  "));
  }
  return { ledgerId: ledgerId, added: added, conflicts: conflicts };
}

// Sets one SHARED_CONFIG_KEYS value in the Ledger's _CONFIG tab, replacing
// the row if there is one, and clears this project's cache so the change
// shows here at once (other projects see it within the cache TTL). For
// settings a dashboard control changes, such as FEEDBACK_AS_COMMENT; callers
// check who may change it.
function setSharedConfigValue_(key, value) {
  if (SHARED_CONFIG_KEYS.indexOf(key) === -1) throw new Error(key + " is not a shared setting.");
  const ledgerId = _resolveConfigValues_().values.CENTRAL_LEDGER_SS_ID;
  const ss = SpreadsheetApp.openById(ledgerId);
  let sheet = ss.getSheetByName(CONFIG_TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_TAB_NAME);
    sheet.appendRow(["Key", "Value"]);
  }
  const rows = sheet.getDataRange().getValues();
  let written = false;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== key) continue;
    sheet.getRange(i + 1, 2).setValue(value);
    written = true;
    break;
  }
  if (!written) sheet.appendRow([key, value]);
  try { CacheService.getScriptCache().remove(SHARED_CONFIG_CACHE_PREFIX + ledgerId); } catch (e) { /* ignore */ }
  _sharedConfigMemo_ = null;
}

// The config as the Ledger's _CONFIG tab has it now, not this project's
// cached copy (up to 10 minutes old): for a read-modify-write of a shared
// setting, under the caller's lock (07's ⚙ Settings, Docket IV).
function freshConfigValues_() {
  const ledgerId = _resolveConfigValues_().values.CENTRAL_LEDGER_SS_ID;
  if (ledgerId) {
    try { CacheService.getScriptCache().remove(SHARED_CONFIG_CACHE_PREFIX + ledgerId); } catch (e) { /* ignore */ }
  }
  _sharedConfigMemo_ = null;
  return _resolveConfigValues_().values;
}

// Run from the Apps Script editor after editing the Ledger's _CONFIG tab
// to use the new values in this project now, instead of within 10 minutes.
// Each project caches separately, so this clears only the project it runs
// in: run it in each one that needs the change straight away. Then reports
// the fresh values, same as showConfigSources().
function refreshSharedConfig() {
  // 00b is only in the projects that serve a web app beyond the owner.
  if (typeof requireScriptOwner_ === "function") requireScriptOwner_();
  const props = PropertiesService.getScriptProperties().getProperties();
  let ledgerId = props.CENTRAL_LEDGER_SS_ID || "";
  if (!ledgerId) {
    const fromSheet = _ledgerIdFromAttachedSheet_();
    ledgerId = fromSheet ? fromSheet.id : "";
  }
  if (ledgerId) {
    try { CacheService.getScriptCache().remove(SHARED_CONFIG_CACHE_PREFIX + ledgerId); } catch (e) { /* ignore */ }
  }
  _sharedConfigMemo_ = null;
  Logger.log("[CONFIG] Shared settings cache cleared for this project.");
  return showConfigSources();
}

// Run from the Apps Script editor to see where each setting came from
// before deleting a Script Property the tab now covers. Values are only
// file IDs, URLs and addresses; no secret is ever a SHARED_CONFIG_KEYS entry.
function showConfigSources() {
  // 00b is only in the projects that serve a web app beyond the owner.
  if (typeof requireScriptOwner_ === "function") requireScriptOwner_();
  const resolved = _resolveConfigValues_();
  const keys = ["CENTRAL_LEDGER_SS_ID", "ADMIN_SS_ID"].concat(SHARED_CONFIG_KEYS);
  const report = {};
  keys.forEach(function (k) {
    report[k] = {
      value:  resolved.values[k] || "",
      source: resolved.sources[k] || "not set (default applies)"
    };
    Logger.log("[CONFIG] " + k + " = " + (report[k].value || "(blank)") + "  <- " + report[k].source);
  });
  return report;
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
// School year — student-data access policy, rule 1: student data is visible
// only during the current school year. Years are "2025-26" style. A term is
// the school year plus the marking period, "2627_MP1" (MP 1-4; the
// teacher's format since 2026-10-12), whose year is 2026-27; older terms
// like "2025-26 S1" give the part before the space. The current year is
// CURRENT_TERM's (the admin's own setting) when it has either shape, else
// the one today falls in, starting in August. A Ledger row's year is its
// AcademicYear term's, else the one its timestamp falls in.
//
// The marking period only labels a row. Courses run all year, so the
// dashboards show the whole current year by default, and a term is
// archived a whole year at a time (10's archiveCompletedTerm).
// =============================================================================
const SCHOOL_YEAR_RE_ = /^\d{4}-\d{2}$/;
const MP_TERM_RE_ = /^(\d{2})(\d{2})_MP([1-4])$/;

function _schoolYearForDate_(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  const start = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return start + "-" + String((start + 1) % 100).padStart(2, "0");
}

// Retention is counted in whole school years: a record is kept N years
// after the end of the school year it belongs to (the same August start
// as _schoolYearForDate_). Returns the first day of the oldest school year
// still kept; a record dated before it is past retention. With N = 5 on
// 2026-10-13 that is 2021-08-01: 2020-21 and earlier are past.
function _retentionCutoff_(years, now) {
  const date = now ? new Date(now) : new Date();
  const lastEndedYear = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(lastEndedYear - years, 7, 1);
}

function _schoolYearOfTerm_(term) {
  const prefix = String(term || "").trim().split(/\s+/)[0];
  const mp = MP_TERM_RE_.exec(prefix);
  // The two halves must be consecutive years: "2627" is 2026-27.
  if (mp) return (Number(mp[1]) + 1) % 100 === Number(mp[2]) ? "20" + mp[1] + "-" + mp[2] : "";
  return SCHOOL_YEAR_RE_.test(prefix) ? prefix : "";
}

function _currentSchoolYear_(now) {
  return _schoolYearOfTerm_(currentTerm_(now)) || _schoolYearForDate_(now || new Date());
}

// ---------------------------------------------------------------------------
// The current term rolls over by date (decision #41, 2026-10-19). A
// marking period runs through its last day, so the day after one ends
// belongs to the next ("2627_MP1" through Oct 30, "2627_MP2" from Oct 31).
// The table is MARKING_PERIOD_ENDS ("2627_MP1=2026-10-30,2627_MP2=..."),
// a Script Property or a row of the Ledger's _CONFIG tab, else the
// district calendar below. CURRENT_TERM (setCurrentTerm(), 10) names the
// school year and the dates pick its marking period; a CURRENT_TERM in
// another school year, or a date the table doesn't cover (summer), uses
// CURRENT_TERM as set. Add next year's four ends before August.
// ---------------------------------------------------------------------------
const DEFAULT_MARKING_PERIOD_ENDS =
  "2627_MP1=2026-10-30,2627_MP2=2027-01-22,2627_MP3=2027-03-25,2627_MP4=2027-06-04";

function _markingPeriodEnds_(raw) {
  return String(raw || "").split(",")
    .map(function (pair) {
      const kv = pair.split("=");
      return { term: String(kv[0] || "").trim().toUpperCase(), end: String(kv[1] || "").trim() };
    })
    .filter(function (p) { return MP_TERM_RE_.test(p.term) && /^\d{4}-\d{2}-\d{2}$/.test(p.end); })
    .sort(function (a, b) { return a.end < b.end ? -1 : a.end > b.end ? 1 : 0; });
}

function _termForDate_(table, ymd) {
  for (let i = 0; i < table.length; i++) {
    if (ymd <= table[i].end) return table[i].term;
  }
  return "";
}

function currentTerm_(now) {
  const props = PropertiesService.getScriptProperties();
  let raw = props.getProperty("MARKING_PERIOD_ENDS");
  if (!raw) {
    try { raw = _resolveConfigValues_().values.MARKING_PERIOD_ENDS; } catch (e) { raw = ""; }
  }
  let table = _markingPeriodEnds_(raw);
  if (!table.length) table = _markingPeriodEnds_(DEFAULT_MARKING_PERIOD_ENDS);
  const date = now ? new Date(now) : new Date();
  const set = String(props.getProperty("CURRENT_TERM") || "").trim();
  // Before the table's first school year starts (August), it doesn't apply.
  const firstYear = _schoolYearOfTerm_(table[0].term);
  if (firstYear && _schoolYearForDate_(date) < firstYear) return set;
  // The district's time zone, fixed (Session needs a scope two projects lack).
  const byDate = _termForDate_(table, Utilities.formatDate(date, "America/New_York", "yyyy-MM-dd"));
  // CURRENT_TERM names the school year; the dates pick the marking period in
  // it. A CURRENT_TERM in another school year was set on purpose and wins.
  if (!byDate || (set && _schoolYearOfTerm_(set) && _schoolYearOfTerm_(set) !== _schoolYearOfTerm_(byDate))) return set;
  return byDate;
}

// Whether a row's term is in the current term's school year. Courses run all
// year, so a student enrolled in MP1 is still enrolled in MP2: the marking
// period only labels the row. Terms with no readable year compare exactly;
// a blank on either side matches, as before.
function sameSchoolYearTerm_(rowTerm, currentTerm) {
  const a = String(rowTerm || "").trim();
  const b = String(currentTerm || "").trim();
  if (!a || !b) return true;
  const ya = _schoolYearOfTerm_(a);
  const yb = _schoolYearOfTerm_(b);
  return ya && yb ? ya === yb : a === b;
}

function _rowSchoolYear_(row) {
  return _schoolYearOfTerm_(row[LEDGER.ACADEMIC_YEAR]) || _schoolYearForDate_(row[LEDGER.TIMESTAMP]);
}

function _isCurrentSchoolYearRow_(row, currentYear) {
  return _rowSchoolYear_(row) === (currentYear || _currentSchoolYear_());
}

// ---------------------------------------------------------------------------
// _scrOwnership_ — student-data access policy, rule 3: only the teacher who
// assigned the work rates it. A competency rating is built from
// CompetencyEvidence rows, and each carries the config_id of the Ledger
// row (the assignment) it came from, which names the assigning teacher. A
// student+competency pair is this teacher's when any of its evidence comes
// from their own assignment this school year.
//
// Evidence written before config_id existed can't be traced; for a pair
// with no traceable evidence at all, the current-year roster decides, as it
// did before this check.
//
// Returns { owned: Set<pairKey>, traced: Set<pairKey> }; pairKey is
// lowercased student email + "|" + competency id.
// ---------------------------------------------------------------------------
function _scrPairKey_(email, competencyId) {
  return String(email || "").trim().toLowerCase() + "|" + String(competencyId || "").trim();
}

function _scrOwnership_(cfg, teacherEmail) {
  const out = { owned: new Set(), traced: new Set() };
  const teacher = String(teacherEmail || "").trim().toLowerCase();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);

  const year = _currentSchoolYear_();
  const teacherByConfig = {};
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (ledger && ledger.getLastRow() > 1) {
    ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER.ACADEMIC_YEAR + 1).getValues().forEach(function (row) {
      const configId = String(row[LEDGER.CONFIG_ID] || "").trim();
      if (!configId || !_isCurrentSchoolYearRow_(row, year)) return;
      teacherByConfig[configId] = String(row[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase();
    });
  }

  const evidence = ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence");
  if (!evidence || evidence.getLastRow() < 2) return out;
  const data = evidence.getDataRange().getValues();
  const h = data[0].map(function (x) { return String(x).trim(); });
  const iEmail = h.indexOf("student_email"), iComp = h.indexOf("competency_id");
  const iConfig = h.indexOf("config_id"), iArchive = h.indexOf("archive_status");
  if (iEmail === -1 || iComp === -1 || iConfig === -1) return out;
  for (let i = 1; i < data.length; i++) {
    if (iArchive !== -1 && String(data[i][iArchive] || "").trim() !== "") continue;
    const configId = String(data[i][iConfig] || "").trim();
    if (!configId) continue;
    const key = _scrPairKey_(data[i][iEmail], data[i][iComp]);
    out.traced.add(key);
    if (teacher && teacherByConfig[configId] === teacher) out.owned.add(key);
  }
  return out;
}

function _scrIsMine_(ownership, rosterEmails, email, competencyId) {
  const key = _scrPairKey_(email, competencyId);
  if (ownership.traced.has(key)) return ownership.owned.has(key);
  return rosterEmails.has(String(email || "").trim().toLowerCase());
}

// _scrTeacherMayDecide_ — rule 3 for a writer that has no teacher-dashboard
// roster at hand (30_SCRSuggestionEngine.js, 30b_SCRRetryRemediation.js in
// the central-ledger project). The fallback roster is every student the
// teacher is TEACHER_EMAIL for on a current-year Ledger row.
function _scrTeacherMayDecide_(cfg, teacherEmail, studentEmail, competencyId) {
  const teacher = String(teacherEmail || "").trim().toLowerCase();
  if (!teacher) return false;
  const roster = new Set();
  const ledger = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
  if (ledger && ledger.getLastRow() > 1) {
    const year = _currentSchoolYear_();
    ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER.ACADEMIC_YEAR + 1).getValues().forEach(function (row) {
      if (!_isCurrentSchoolYearRow_(row, year)) return;
      if (String(row[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() !== teacher) return;
      roster.add(String(row[LEDGER.GOOGLE_ID] || "").trim().toLowerCase());
    });
  }
  return _scrIsMine_(_scrOwnership_(cfg, teacher), roster, studentEmail, competencyId);
}


// =============================================================================
// THE SCR RULE AND THE SCR RETRY (moved here 2026-11-01, D15)
// =============================================================================
// The rule (30_SCRSuggestionEngine.js's header): a suggested rating is the
// average of a student's three best pieces of evidence for a competency, one
// piece per assignment at its best outcome. Here, not in 30, because the SCR
// retry runs it in the central-ledger project (30b, the attention signal's
// count in 34b) and on both dashboards (07's student page, 13's
// Competencies tab).

const VALID_OUTCOMES = ["MET", "PARTIALLY_MET", "NOT_MET"];
const EVIDENCE_THRESHOLD = 3; // pieces needed for a suggestion, and how many are averaged
// SCR rating each best outcome contributes to the average.
const OUTCOME_SCR_SCORE = { MET: 2, PARTIALLY_MET: 3, NOT_MET: 4 };

// ---------------------------------------------------------------------------
// One piece of evidence per assignment. Shared by 30's weekly suggestion
// run and the SCR retry below (both dashboards and 30b).
//
// evidenceAssignmentKey_: the assignment a CompetencyEvidence row came from,
// its config_id (the student's workspace for that assignment), else its
// student_file_id. A row with neither, written before those columns
// existed, is its own piece.
// ---------------------------------------------------------------------------
function evidenceAssignmentKey_(row, iConfigId, iFileId, rowIndex) {
  const configId = iConfigId !== -1 ? String(row[iConfigId] || "").trim() : "";
  if (configId) return "config:" + configId;
  const fileId = iFileId !== -1 ? String(row[iFileId] || "").trim() : "";
  if (fileId) return "file:" + fileId;
  return "row:" + rowIndex;
}

// Keeps the better of an assignment's outcomes: MET over PARTIALLY_MET over
// NOT_MET.
function keepBestOutcome_(byAssignment, assignmentKey, outcome) {
  const current = byAssignment.get(assignmentKey);
  if (!current || OUTCOME_SCR_SCORE[outcome] < OUTCOME_SCR_SCORE[current]) {
    byAssignment.set(assignmentKey, outcome);
  }
}

function countOutcomes_(byAssignment) {
  const counts = { metCount: 0, notMetCount: 0, partialCount: 0 };
  for (const outcome of byAssignment.values()) {
    if (outcome === "MET") counts.metCount++;
    else if (outcome === "NOT_MET") counts.notMetCount++;
    else if (outcome === "PARTIALLY_MET") counts.partialCount++;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// computeSuggestion_ — THE RULE (header): the average of the 3 best pieces.
// Input: { metCount, notMetCount, partialCount }, counted in pieces
// Output: { suggestedRating: 2|3|4|null, status: string }
// ---------------------------------------------------------------------------
function computeSuggestion_(counts) {
  const totalCount = counts.metCount + counts.notMetCount + counts.partialCount;

  if (totalCount < EVIDENCE_THRESHOLD) {
    return { suggestedRating: null, status: "INSUFFICIENT_EVIDENCE" };
  }
  // The best pieces are the METs, then the PARTIALLY_METs, then the NOT_METs.
  let left = EVIDENCE_THRESHOLD;
  let sum = 0;
  [["MET", counts.metCount], ["PARTIALLY_MET", counts.partialCount], ["NOT_MET", counts.notMetCount]]
    .forEach(([outcome, n]) => {
      const take = Math.min(n, left);
      sum += take * OUTCOME_SCR_SCORE[outcome];
      left -= take;
    });
  // sum is a whole number from 6 to 12, so the average is a third at worst
  // and never lands on .5: Math.round is nearest-rating rounding.
  return { suggestedRating: Math.round(sum / EVIDENCE_THRESHOLD), status: "SUGGESTED" };
}


// ---------------------------------------------------------------------------
// The SCR retry (30b's rule, built 2026-11-01 for D15). A competency the
// teacher rated 3 or 4 can be re-rated once the student has shown enough
// since: 5 or more pieces MET across the primary and its linked secondary
// competencies, and 2 secondary pieces MET for every primary piece NOT_MET.
// The re-rating is the rule's rating from all the primary's evidence, and
// it counts only when it is better (a lower number) than the current one.
// The teacher confirms it; the old rating stays in SCRDecisionLog.
//
// Primary and secondary come from each assignment's milestones (the
// operator's decision, 2026-11-01): milestone 1's competency is the
// assignment's primary, milestones 2 and 3 its secondaries, as every
// assignment's definition of done says. A competency's linked secondaries
// are the secondaries of every assignment where it is the primary. This
// replaced 30b's LessonPrimarySecondary tab and an evidence_role column,
// neither of which was ever made or written.
// ---------------------------------------------------------------------------
const SCR_RETRY_MIN_MET = 5;
const SCR_RETRY_LINKED_PER_MISS = 2;

// The two thresholds as configured (2026-11-01): SCR_RETRY_MIN_MET (pieces
// MET across the competency and its linked ones) and
// SCR_RETRY_LINKED_PER_MISS (linked pieces MET for each primary piece not
// met), shared keys like the school's, so the teacher can tune them from the
// Ledger's _CONFIG tab after previewScrRetryThresholds() (30b) shows how
// they play out. Each must be a whole number from 1 to 20; anything else
// keeps its default (5, 2). `values` for tests.
function scrRetryThresholds_(values) {
  let v = values;
  if (!v) {
    try { v = _resolveConfigValues_().values; } catch (e) { v = {}; }
  }
  const pick = function (key, dflt) {
    const n = Number(String(v[key] === undefined || v[key] === null ? "" : v[key]).trim());
    return Number.isInteger(n) && n >= 1 && n <= 20 ? n : dflt;
  };
  return { minMet: pick("SCR_RETRY_MIN_MET", SCR_RETRY_MIN_MET),
    linkedPerMiss: pick("SCR_RETRY_LINKED_PER_MISS", SCR_RETRY_LINKED_PER_MISS) };
}

// { byConfig: { configId: { primary, secondaries[] } }, linked: { primary:
// [secondary ids] } } from StudentAssignments (a student's workspace ->
// its assignment) and every TeacherMatrix in MatrixRegistry (columns as
// reflectionMatrixRow_ reads them). A matrix that can't be opened is left
// out, so its evidence counts as it did before roles existed.
function scrRetryRoles_(ss, cfg) {
  const out = { byConfig: {}, linked: {} };
  const byAssignment = {};
  const reg = ss.getSheetByName(cfg.tabs.matrixRegistry);
  const seen = {};
  if (reg && reg.getLastRow() > 1) {
    reg.getDataRange().getValues().slice(1).forEach(function (r) {
      const id = String(r[2] || "").trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      try {
        const tm = SpreadsheetApp.openById(id).getSheetByName(cfg.tabs.teacherMatrix || "TeacherMatrix");
        if (!tm || tm.getLastRow() < 2) return;
        tm.getDataRange().getValues().slice(1).forEach(function (row) {
          const assignmentId = String(row[0] || "").trim();
          const primary = String(row[15] || "").trim();
          if (!assignmentId || !primary) return;
          const secondaries = [row[16], row[17]].map(function (x) { return String(x || "").trim(); })
            .filter(function (x) { return x && x !== primary; });
          byAssignment[assignmentId] = { primary: primary, secondaries: secondaries };
          const list = out.linked[primary] = out.linked[primary] || [];
          secondaries.forEach(function (x) { if (list.indexOf(x) === -1) list.push(x); });
        });
      } catch (e) {
        Logger.log("[SCR retry] A TeacherMatrix could not be read: " + e.message);
      }
    });
  }
  Object.keys(byAssignment).forEach(function (a) { out.byConfig[a] = byAssignment[a]; });
  const sa = ss.getSheetByName("StudentAssignments"); // 54's tab
  if (sa && sa.getLastRow() > 1) {
    sa.getRange(2, 1, sa.getLastRow() - 1, 3).getValues().forEach(function (r) {
      const configId = String(r[0] || "").trim(), assignmentId = String(r[2] || "").trim();
      if (configId && byAssignment[assignmentId]) out.byConfig[configId] = byAssignment[assignmentId];
    });
  }
  return out;
}

// Active CompetencyEvidence rows with a valid outcome, as { email (lower
// case), comp, outcome, configId, key } (key: evidenceAssignmentKey_).
// onlyEmail keeps one student's.
function scrRetryEvidence_(ss, cfg, onlyEmail) {
  const sheet = ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const h = data[0].map(function (x) { return String(x).trim(); });
  const iEmail = h.indexOf("student_email"), iComp = h.indexOf("competency_id"), iOut = h.indexOf("outcome");
  const iConfig = h.indexOf("config_id"), iFile = h.indexOf("student_file_id"), iArch = h.indexOf("archive_status");
  if (iEmail === -1 || iComp === -1 || iOut === -1) return [];
  const only = onlyEmail ? String(onlyEmail).trim().toLowerCase() : "";
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (iArch !== -1 && String(r[iArch] || "").trim()) continue;
    const email = String(r[iEmail] || "").trim().toLowerCase();
    if (!email || (only && email !== only)) continue;
    const outcome = String(r[iOut] || "").trim();
    if (VALID_OUTCOMES.indexOf(outcome) === -1) continue;
    rows.push({ email: email, comp: String(r[iComp] || "").trim(), outcome: outcome,
      configId: iConfig === -1 ? "" : String(r[iConfig] || "").trim(), key: evidenceAssignmentKey_(r, iConfig, iFile, i) });
  }
  return rows;
}

// Everything a retry check reads, read once: { roles, evidence }.
function scrRetryContext_(ss, cfg, onlyEmail) {
  return { roles: scrRetryRoles_(ss, cfg), evidence: scrRetryEvidence_(ss, cfg, onlyEmail),
    thresholds: scrRetryThresholds_() };
}

// One student and one competency, with the rating that stands now:
//   { applies: false } when the rating isn't 3 or 4 (a retry can't help);
//   else { applies, eligible, improved, currentRating, newRating, primary,
//   secondary, all (counts), secondaryIds, needMet, needSecondary,
//   needPrimaryMet, reason }.
// Eligibility counts by role: primary pieces are this competency's evidence
// from assignments where it is the primary; secondary pieces are its linked
// competencies' evidence from assignments where they are secondaries.
// newRating is the rule's rating from ALL of this competency's evidence,
// whatever its role, exactly as 30's weekly run rates it (the operator,
// 2026-11-01: "all of it"), or null with too few pieces.
// needMet: more MET pieces (primary or secondary) for the 5; needSecondary:
// more secondary MET pieces for the 2-to-1; needPrimaryMet: more MET pieces
// on this competency before newRating beats the current rating.
// A row whose assignment has no known milestones counts as primary evidence
// for its own competency, as rows did before roles existed.
function scrRetryStatus_(ctx, studentEmail, competencyId, currentRating) {
  const rating = Number(currentRating);
  if (rating !== 3 && rating !== 4) return { applies: false };
  const email = String(studentEmail || "").trim().toLowerCase();
  const p = String(competencyId || "").trim();
  const secondaryIds = (ctx.roles.linked[p] || []).slice();
  const prim = new Map(), sec = new Map(), every = new Map();
  ctx.evidence.forEach(function (e) {
    if (e.email !== email) return;
    if (e.comp === p) keepBestOutcome_(every, e.key, e.outcome);
    const role = ctx.roles.byConfig[e.configId];
    if (e.comp === p && (!role || role.primary === p)) {
      keepBestOutcome_(prim, e.key, e.outcome);
    } else if (role && secondaryIds.indexOf(e.comp) !== -1 && role.secondaries.indexOf(e.comp) !== -1) {
      keepBestOutcome_(sec, e.comp + "|||" + e.key, e.outcome);
    }
  });
  const primary = countOutcomes_(prim), secondary = countOutcomes_(sec), all = countOutcomes_(every);
  const totalMet = primary.metCount + secondary.metCount;
  const th = ctx.thresholds || { minMet: SCR_RETRY_MIN_MET, linkedPerMiss: SCR_RETRY_LINKED_PER_MISS };
  const needMet = Math.max(0, th.minMet - totalMet);
  const needSecondary = Math.max(0, th.linkedPerMiss * primary.notMetCount - secondary.metCount);
  const eligible = secondaryIds.length > 0 && needMet === 0 && needSecondary === 0;
  const newRating = computeSuggestion_(all).suggestedRating;
  let needPrimaryMet = 0;
  while (needPrimaryMet < EVIDENCE_THRESHOLD + 1) {
    const r = computeSuggestion_({ metCount: all.metCount + needPrimaryMet,
      notMetCount: all.notMetCount, partialCount: all.partialCount }).suggestedRating;
    if (r !== null && r < rating) break;
    needPrimaryMet++;
  }
  const improved = newRating !== null && newRating < rating;
  let reason;
  if (!secondaryIds.length) reason = "No assignment names this competency as its primary with secondaries, so there is nothing to retry through.";
  else if (eligible && improved) reason = "Ready: the evidence now gives " + newRating + " (rated " + rating + ").";
  else if (eligible) reason = "Eligible, but its evidence still gives " + (newRating === null ? "no rating" : newRating) + ".";
  else reason = "Not yet: " + [needMet ? needMet + " more MET (this competency or a linked one)" : "",
    needSecondary ? needSecondary + " more MET on a linked competency" : ""].filter(Boolean).join("; ") + ".";
  return { applies: true, eligible: eligible, improved: improved, currentRating: rating, newRating: newRating,
    primary: primary, secondary: secondary, all: all, secondaryIds: secondaryIds, totalMet: totalMet,
    needMet: needMet, needSecondary: needSecondary, needPrimaryMet: needPrimaryMet, reason: reason };
}

// The permanent record of a confirmed retry: one SCRDecisionLog row,
// RETRY_IMPROVED, the old rating named in its snapshot. The caller has
// checked the teacher and re-run scrRetryStatus_ under the script lock, and
// updates SCRSuggestions with its own column map (SCRS stays in 30).
function scrAppendRetryDecision_(decisionLogSheet, decisionId, studentEmail, competencyId, status, teacherEmail, now) {
  const snapshot = "MET:" + status.all.metCount + " NOT_MET:" + status.all.notMetCount +
    " PARTIALLY_MET:" + status.all.partialCount + " (retry -- previous official rating: " + status.currentRating +
    "; secondary MET:" + status.secondary.metCount + ")";
  decisionLogSheet.appendRow([decisionId, studentEmail, competencyId, status.newRating, status.newRating,
    "RETRY_IMPROVED", now, teacherEmail, snapshot, ""]);
}

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
// FIXED: used to only escape &/</>. A third-party review found esc() used
// in HTML-attribute contexts (value="${esc(c.id)}") and inline-JS contexts
// (onchange="onCompetencyChange('${esc(course.code)}')") with no quote
// escaping at all — a teacher-entered course name containing an apostrophe
// (e.g. "Coach's Period") broke the page today, and a crafted " or ' could
// break out of an attribute. Escapes & first so the newly-added entities
// for "/' are never themselves double-escaped.
const CLIENT_ESC_JS = `function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function jsAttr(s) {
  // For a value inside a single-quoted JS string inside a double-quoted HTML
  // attribute: onclick="f('\${jsAttr(x)}')". JS-escape first (backslash
  // before quote, so a trailing backslash can't swallow the closing quote),
  // then esc() for the attribute. The browser decodes the entities before
  // the JS parser runs, which leaves exactly the JS escapes.
  return esc(String(s||"").replace(/\\\\/g,"\\\\\\\\").replace(/'/g,"\\\\'").replace(/\\n/g,"\\\\n").replace(/\\r/g,"\\\\r"));
}`;

// =============================================================================
// CLIENT_SAFE_DOC_URL_JS — shared client-side docUrl allowlist validator,
// same sharing rationale as CLIENT_ESC_JS above. FIXED: docUrl was
// interpolated directly into href="${s.docUrl}" at several sites in
// 07_TeacherDashboard.js and 13_StudentDashboard.js with no escaping OR
// scheme validation — esc()'s quote-escaping alone doesn't stop a
// javascript: URI in an href. docUrl is server-built from a real Drive/Doc
// file ID (never raw user input) but passes through a stored Sheets cell
// first, which is a real tampering surface a spreadsheet editor can reach.
// Interpolate as `${CLIENT_SAFE_DOC_URL_JS}` the same way as CLIENT_ESC_JS.
// =============================================================================
const CLIENT_SAFE_DOC_URL_JS = `function safeDocUrl(u) {
  var s = String(u||"");
  return /^https:\\/\\/(docs|drive)\\.google\\.com\\//.test(s) ? s : "";
}`;

// =============================================================================
// Plain words for the dashboards (2026-10-22, the operator: "a lot of system
// jargon and terms that the user doesn't know"). One place for the scales
// and labels both dashboards show, and the Terms panel each one opens.
// Server values (Ledger statuses, ConfigIDs, term codes) never change; only
// what a person reads.
// =============================================================================
// =============================================================================
// STUDENT CONTEXT DOCS (29 writes them, weekly)
// =============================================================================
// StudentDocRegistry column indices (0-based) — canonical order
const SDR_STUDENT_EMAIL = 0;
const SDR_STUDENT_NAME = 1;
const SDR_DOC_ID = 2;
const SDR_DOC_URL = 3;
const SDR_CREATED_AT = 4;
const SDR_LAST_UPDATED_AT = 5;
const SDR_LAST_RUN_HAD_CONTENT = 6;

// A student's doc from StudentDocRegistry: { docId, docUrl, lastUpdatedAt }
// or null.
function studentContextDocFor_(ss, cfg, email) {
  const sheet = ss.getSheetByName(cfg.tabs.studentDocRegistry || "StudentDocRegistry");
  if (!sheet || sheet.getLastRow() < 2) return null;
  const want = String(email || "").trim().toLowerCase();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SDR_STUDENT_EMAIL]).trim().toLowerCase() !== want) continue;
    return { docId: String(data[i][SDR_DOC_ID]).trim(), docUrl: String(data[i][SDR_DOC_URL]).trim(),
      lastUpdatedAt: data[i][SDR_LAST_UPDATED_AT] || null };
  }
  return null;
}

// =============================================================================
// COMPETENCY COMPLETION — n of the course's competencies, per student
// =============================================================================
// A competency counts as done once the teacher's latest confirmed rating
// for it (SCRDecisionLog) is SCR_COMPLETED_MAX_RATING or better: 1 is the
// highest, so 1–3, "Limited supervision" or better (decided 2026-10-27).
// The total is every active competency in the course (CompetencyRegistry),
// 113 for 8175 and 108 for 8177. Shown on the Teacher Dashboard's student
// page and Student Context list, and on the Student Dashboard.
const SCR_COMPLETED_MAX_RATING = 3;

// The latest confirmed rating per student and competency. Archived rows are
// left out: past the retention window a row is restricted pending
// disposition. decidedBy keeps one teacher's decisions only (a teacher sees
// their own; a student sees every teacher's).
// Map: email (lower case) -> [{ competencyId, rating, decidedAt }].
function readLatestScrRatings_(ss, cfg, decidedBy) {
  const onlyBy = decidedBy ? String(decidedBy).trim().toLowerCase() : "";
  const sheet = ss.getSheetByName(cfg.tabs.scrDecisionLog);
  const byStudent = new Map();
  if (!sheet || sheet.getLastRow() < 2) return byStudent;

  // One past SCRDL's highest index — the decision log's own width, NOT
  // ParentReportLog's. Bounded rather than getDataRange() for the reason
  // LEDGER_COL_COUNT documents: one stray far-right value can widen a
  // sheet's used range permanently.
  const SCRDL_COL_COUNT = SCRDL.ARCHIVE_STATUS + 1;
  const data = sheet.getRange(1, 1, sheet.getLastRow(), SCRDL_COL_COUNT).getValues();

  // Keyed by email + U+0000 + competencyId — a separator neither an email
  // address nor a competency ID can contain, so two different (email,
  // competency) pairs cannot collide into one key.
  const latest = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[SCRDL.STUDENT_EMAIL] || "").trim().toLowerCase();
    const compId = String(row[SCRDL.COMPETENCY_ID] || "").trim();
    if (!email || !compId) continue;

    if (String(row[SCRDL.ARCHIVE_STATUS] || "").trim() !== "") continue;
    if (onlyBy && String(row[SCRDL.DECIDED_BY] || "").trim().toLowerCase() !== onlyBy) continue;

    const rating = row[SCRDL.FINAL_RATING];
    if (rating === "" || rating === null || rating === undefined) continue;

    const decidedAt = Object.prototype.toString.call(row[SCRDL.DECIDED_AT]) === "[object Date]" ? row[SCRDL.DECIDED_AT] : null;
    const key = email + "\u0000" + compId;
    const prior = latest.get(key);
    // No decidedAt sorts oldest, so a row with a real timestamp always wins
    // over one missing it rather than depending on sheet order.
    if (!prior || (decidedAt && (!prior.decidedAt || decidedAt > prior.decidedAt))) {
      latest.set(key, { email: email, competencyId: compId, rating: rating, decidedAt: decidedAt });
    }
  }

  for (const entry of latest.values()) {
    if (!byStudent.has(entry.email)) byStudent.set(entry.email, []);
    byStudent.get(entry.email).push({
      competencyId: entry.competencyId,
      rating: entry.rating,
      decidedAt: entry.decidedAt,
    });
  }
  for (const list of byStudent.values()) {
    list.sort((a, b) => String(a.competencyId).localeCompare(String(b.competencyId)));
  }
  return byStudent;
}

// Active competencies per course from the CompetencyRegistry tab, by the
// course in each competency_id ("8175-14"): { "8175": 113, ... }. {} with
// no tab, so a counter shows its count with no total.
function competencyCourseTotals_(ss, cfg) {
  const sheet = ss.getSheetByName(cfg.tabs.competencyRegistry || "CompetencyRegistry");
  const totals = {};
  if (!sheet || sheet.getLastRow() < 2) return totals;
  const data = sheet.getDataRange().getValues();
  const head = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const idCol = head.indexOf("competency_id");
  const activeCol = head.indexOf("active");
  if (idCol === -1) return totals;
  const seen = {};
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idCol] || "").trim();
    if (!id || seen[id]) continue;
    if (activeCol !== -1 && String(data[i][activeCol]).trim().toUpperCase() === "FALSE") continue;
    seen[id] = true;
    const course = id.split("-")[0];
    totals[course] = (totals[course] || 0) + 1;
  }
  return totals;
}

// [{ course, done, total }] for the given courses (sorted), from one
// student's latest ratings (readLatestScrRatings_). A rating in a course
// not listed is left out.
function competencyCompletionFor_(ratings, totals, courses) {
  const out = {};
  (courses || []).forEach(function (c) { out[c] = { course: c, done: 0, total: totals[c] || 0 }; });
  (ratings || []).forEach(function (r) {
    const course = String(r.competencyId).split("-")[0];
    const n = Number(r.rating);
    if (out[course] && n >= 1 && n <= SCR_COMPLETED_MAX_RATING) out[course].done++;
  });
  return Object.keys(out).sort().map(function (c) { return out[c]; });
}

// The Virginia CTE Student Competency Record scale: 1 is the HIGHEST.
const SCR_RATING_LABELS = { 1: "Can teach others", 2: "Without supervision",
  3: "Limited supervision", 4: "With supervision", 5: "Cannot perform" };
// Flow 2's suggested score on a passing check (15b): 4 is the highest; it
// only ever suggests 2, 3 or 4.
const FLOW2_SCORE_LABELS = { 2: "Adequate", 3: "Solid", 4: "Exceptional" };

// Client copies of the above, plus termLabel() ("2627_MP1" -> "Marking
// period 1, 2026-27"). Interpolate as `${CLIENT_WORDS_JS}` in a dashboard's
// <script>, like CLIENT_ESC_JS.
// The server's copy of termLabel, for text built in Apps Script.
function termLabel_(t) {
  const m = /^(\d{2})(\d{2})_MP(\d)$/.exec(String(t || "").trim());
  return m ? "Marking period " + m[3] + ", 20" + m[1] + "\u2013" + m[2] : String(t || "").trim();
}

const CLIENT_WORDS_JS =
  "var SCR_RATING_LABELS = " + JSON.stringify(SCR_RATING_LABELS) + ";\n" +
  "var FLOW2_SCORE_LABELS = " + JSON.stringify(FLOW2_SCORE_LABELS) + ";\n" +
  "function termLabel(t) {\n" +
  "  var m = /^(\\d{2})(\\d{2})_MP(\\d)$/.exec(String(t || ''));\n" +
  "  return m ? 'Marking period ' + m[3] + ', 20' + m[1] + '\\u2013' + m[2] : String(t || '');\n" +
  "}\n" +
  "function scrLabel(n) { return SCR_RATING_LABELS[n] ? n + ' \\u2014 ' + SCR_RATING_LABELS[n] : String(n); }\n" +
  "function scoreLabel(n) { return FLOW2_SCORE_LABELS[n] ? n + ' \\u2014 ' + FLOW2_SCORE_LABELS[n] : String(n); }\n";

// What each dashboard's Terms panel explains: [word on screen, meaning].
const CAS_STUDENT_TERMS = [
  ["Competencies done", "Competencies in your course that your teacher has rated you able to do with limited supervision or better (1 to 3 on the state's 5-point scale), out of every competency in the course."],
  ["Competency rating", "Your teacher's rating of a competency on Virginia's 1 to 5 scale, where 1 is the highest: 1 Can teach others, 2 Without supervision, 3 Limited supervision, 4 With supervision, 5 Cannot perform. “Not rated yet” until your teacher decides."],
  ["Evidence", "What a checked piece of your work showed for a competency: Shown, Partly shown or Not shown yet. Each assignment counts once, at its best result, so an early draft doesn't count against you."],
  ["My Context", "What the system has gathered about your work, week by week: your checked assignments and your warm-up answers. The same document your teacher sees."],
  ["Submit for Feedback", "Sends what you wrote under “Your response” to be checked. Press it when you’re ready; you can submit again after you revise."],
  ["Waiting for feedback", "Your work is in line to be checked. Nothing to do yet; check back in a few minutes."],
  ["Being checked now", "Your work is being read right now."],
  ["Passed ✓", "Your work meets the standard for this assignment. You can still improve it and submit again."],
  ["Feedback ready — revise", "Read the feedback, change your work, then press Submit for Feedback again."],
  ["Couldn’t be checked", "Something went wrong on our side, not with your work. Tell your teacher."],
  ["Comments", "Your feedback appears as a comment on your document. Open the document and click the Comments button (top right). Resolving a comment doesn’t delete it."],
  ["Last submitted", "When you last pressed Submit for Feedback on this assignment."],
  ["Last checked", "When your work was last checked and given feedback."],
  ["Warm-up", "A short question at the start of class. Type your answer here and save it before the end of the day. Missed one? You can answer it late until the end of your next class day, for points but no feedback or extra credit."],
  ["Extra credit", "After a warm-up is checked, reply to its feedback in at least 10 words by the date shown (the end of your next class day) for an extra point."],
  ["Marking period", "Part of the school year. Use the menu at the top to see one marking period or the whole year."],
  ["Block and period", "When your class meets. 3-Odd and 3-Even are the two halves of period 3 that meet on alternate days."],
  ["My Info", "What the system has on file for you: your name, class, period and teacher. Tell your teacher if something is wrong."]
];
const CAS_TEACHER_TERMS = [
  ["Competencies done", "For each course, the competencies you have rated 1 to 3 (limited supervision or better) in Competency ratings, out of every competency in the course (the CompetencyRegistry tab). Only your own confirmed ratings count."],
  ["Check", "One AI evaluation of a submission against the assignment’s criteria (Flow 2). A student can be checked many times."],
  ["Passed / Not passing yet", "Whether the latest check met the assignment’s criteria. “Passed before” means an earlier check passed and the latest needs revision."],
  ["Waiting to be checked", "Submitted and in line for its check."],
  ["Being checked now", "The check is running."],
  ["Couldn’t be checked", "The check failed or timed out, not the student’s work. The timeout email says what to do."],
  ["AI’s suggested score", "On a passing check, the AI suggests 2 (Adequate), 3 (Solid) or 4 (Exceptional). Higher is better. It never suggests 1 or 5."],
  ["Competency rating (SCR)", "The Virginia CTE Student Competency Record, 1 to 5, where 1 is the highest: 1 Can teach others, 2 Without supervision, 3 Limited supervision, 4 With supervision, 5 Cannot perform. The AI suggests 2 to 4 once there are 3 pieces of evidence; 1 and 5 are yours alone."],
  ["Competency tiers", "Each assignment’s competencies are primary (must be shown to pass), secondary or tertiary (credited when shown)."],
  ["Warm-up readiness", "How much the system knows about each student, from checks and warm-up answers. Click a number to see those students."],
  ["Personalized learning profile", "The system’s growing guess of what kind of warm-up works for a student; “ready for fully personalized feedback” means it’s confident."],
  ["Student Context", "One document per student that gathers their lessons, checks and warm-ups, updated weekly."],
  ["Current lesson", "The lesson whose start date in 📅 Lessons is the latest on or before today, per course."],
  ["Rollout", "The nightly job that makes and shares each lesson’s student documents from its start date (2 days ahead)."],
  ["Feedback as a comment", "Where a student’s feedback goes: a comment on the document, or written into it. Set per course in ⚙ Settings."],
  ["⚙ Settings", "Turns each feature on or off per course (feedback as a comment, warm-ups on the Student Dashboard, the nightly lesson rollout, the reflection on Submit, the warm-up style lock, parent reports ready on Fridays) and sets the marking period end dates. Changes wait for Save changes, closing with unsaved changes asks first, and each saved change is kept in the SettingsLog tab."],
  ["3-Odd / 3-Even", "The two halves of period 3, which meet on alternate (odd or even) calendar dates."],
  ["Marking period", "A term code like 2627_MP1 is marking period 1 of 2026–27."]
];

function _casHtml_(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The Terms panel: a native <dialog> (Escape closes it; focus stays inside
// while it's open), its styles and two functions, casOpenTerms() and
// casCloseTerms(). A dashboard puts this in its <body> and a button that
// calls casOpenTerms() in its header.
function casTermsPanelHtml_(title, intro, entries) {
  return '<dialog id="cas-terms" class="cas-terms" aria-labelledby="cas-terms-title">' +
    '<div class="cas-terms-head"><h2 id="cas-terms-title">' + _casHtml_(title) + '</h2>' +
    '<button type="button" onclick="casCloseTerms()">Close</button></div>' +
    (intro ? '<p class="cas-terms-intro">' + _casHtml_(intro) + '</p>' : '') +
    '<dl>' + entries.map(function (e) {
      return '<div class="cas-terms-item"><dt>' + _casHtml_(e[0]) + '</dt><dd>' + _casHtml_(e[1]) + '</dd></div>';
    }).join('') + '</dl></dialog>' +
    '<style>' +
    '.cas-terms{width:min(520px,calc(100vw - 24px));max-height:85vh;margin:auto;border:1px solid #dadce0;border-radius:10px;padding:18px;color:#202124}' +
    '.cas-terms::backdrop{background:rgba(32,33,36,.55)}' +
    '.cas-terms-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}' +
    '.cas-terms-head h2{font-size:17px;margin:0}' +
    '.cas-terms-head button{background:#fff;border:1px solid #5f6368;color:#202124;border-radius:6px;padding:6px 14px;font-size:14px;cursor:pointer}' +
    '.cas-terms-intro{font-size:14px;color:#3c4043;margin:0 0 10px}' +
    '.cas-terms dl{margin:0}.cas-terms-item{padding:9px 0;border-top:1px solid #e8eaed}' +
    '.cas-terms dt{font-size:14px;font-weight:600}.cas-terms dd{margin:2px 0 0;font-size:14px;color:#3c4043;line-height:1.5}' +
    '</style>' +
    '<script>' +
    'function casOpenTerms(){var d=document.getElementById("cas-terms");if(!d)return;if(d.showModal)d.showModal();else d.setAttribute("open","");}' +
    'function casCloseTerms(){var d=document.getElementById("cas-terms");if(!d)return;if(d.open&&d.close)d.close();else d.removeAttribute("open");' +
    'var b=document.getElementById("cas-terms-btn");if(b)b.focus();}' +
    '</script>';
}
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
  // Each Flow 2 evaluation's result, written by 37_FlowInputBuilder.js's
  // harvest (recordEvaluationResult_) and read by the Teacher Dashboard.
  // Headers come from _ensureEvaluationResultColumns_() below; absent on a
  // Ledger no evaluation has reached yet, read as undefined like the four above.
  CHECK_COUNT:            23,  // evaluations returned
  LAST_RESULT:            24,  // PASSED | NEEDS_REVISION
  FIRST_PASSED_AT:        25,  // when an evaluation first passed; never cleared
  LAST_SUGGESTED_SCORE:   26,  // Flow 2's [SUGGESTED_SCORE: N] on the latest check, "" if none
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
const LEDGER_COL_COUNT = 27;

// Headers for the columns after AcademicYear, which a Ledger only gets on
// first use: the turn-in review's four (07/04's _ensureTurnInReviewColumns_)
// and the evaluation result's four. Fills blank header cells only, and the
// turn-in ones too, so 38_LedgerSchemaGuard.js never sees a gap in the middle.
const LEDGER_LATER_HEADERS = [
  "SuggestedScore", "FinalScore", "ScoreDecidedBy", "ScoreDecidedAt",
  "CheckCount", "LastResult", "FirstPassedAt", "LastSuggestedScore",
];

function _ensureEvaluationResultColumns_(sheet) {
  const first = LEDGER.TURN_IN_SUGGESTED_SCORE + 1;
  const range = sheet.getRange(1, first, 1, LEDGER_LATER_HEADERS.length);
  const have = range.getValues()[0];
  if (have.every((h, i) => String(h).trim() === LEDGER_LATER_HEADERS[i])) return;
  range.setValues([LEDGER_LATER_HEADERS.map((h, i) => String(have[i] || "").trim() || h)]);
}

// =============================================================================
// SCRDecisionLog column indices (0-based) — canonical order
//
// Moved here from 30_SCRSuggestionEngine.js, which is bound only to
// cas-ccps:central-ledger. 36_WeeklyParentReport.js runs in BOTH that
// project and cas-ccps:teacher-dashboard and needs these indices, and this
// file is the one thing present in every project — the same reason LEDGER
// above lives here rather than in 07_TeacherDashboard.js.
//
// Append-only. One row per confirm/override action ever taken. This is the
// actual legally-retained record — see the 8VAC20-120-120 retention
// requirement noted in the original SCR specification.
//
// Say/Do Ledger cas-ccps Extension 3: rows are still never deleted
// automatically (see _archiveExpiredScrDecisions_() in Script 30) —
// ARCHIVE_STATUS only marks a row "restricted, pending disposition review"
// once it's past the configured retention window. Actual permanent deletion
// always requires an explicit human decision, never a script.
//
// Note what is NOT here: SCRSuggestions' own column map (SCRS) stays in
// Script 30 on purpose. SCRDecisionLog holds decisions a teacher actually
// made; SCRSuggestions holds AI values nobody has acted on yet. Only the
// former is safe to surface outside this codebase's teacher-facing
// surfaces, and keeping the two maps in different scopes makes that
// distinction structural instead of a convention someone has to remember.
// =============================================================================
const SCRDL = {
  DECISION_ID: 0,
  STUDENT_EMAIL: 1,
  COMPETENCY_ID: 2,
  SUGGESTED_RATING: 3,       // what the system proposed (blank if teacher
                             // entered cold, with no suggestion shown)
  FINAL_RATING: 4,           // what the teacher actually decided — 1-5
  DECISION_TYPE: 5,          // CONFIRMED | OVERRIDDEN
  DECIDED_AT: 6,
  DECIDED_BY: 7,             // teacher email
  EVIDENCE_SNAPSHOT: 8,      // met/notMet/partial counts at decision time,
                             // denormalized for audit — same rationale as
                             // AlignmentLog's denormalized competency_text
  ARCHIVE_STATUS: 9,         // "" = active; "ARCHIVED — pending disposition
                             // review" once past SCR_RETENTION_YEARS
};

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

// =============================================================================
// Deploy-drift self-report (process-hardening sprint Phase 3b —
// meta/PROCESS_HARDENING_SPRINT.md). One shared implementation here since
// 00_SharedConfig.js is already pasted into every cas-ccps project in
// scope for this — each project's own small, project-specific marker
// file (e.g. cas-ccps/scripts/CentralLedgerDeployVersion.js) supplies its
// real tools/gas-lint/project-map.json key and its own stamped SHA, then
// calls this. See kos-personal/17_DeployVersionReport.gs and
// leader-hub/DeployVersionReport.gs — the two already-live reference
// implementations this mirrors — and tools/deploy-drift/README.md for
// the full mechanism, why this pushes instead of being polled, and the
// threat model behind the GitHub token this reads.
//
// ONE-TIME SETUP per project: Script Properties → add
// DEPLOY_DRIFT_GITHUB_TOKEN (a fine-grained GitHub PAT scoped to only
// adamberneche-afk/KOS, minimum permission the "Create a repository
// dispatch event" API needs — never a broad classic repo-scope token,
// never Contents/workflow-editing permission beyond that). Until it's
// set, this logs and returns false — fails closed to a no-op, not open.
function _reportDeployVersion_(projectName, sha) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty('DEPLOY_DRIFT_GITHUB_TOKEN');
    if (!token) {
      console.log('[DeployVersionReport] No DEPLOY_DRIFT_GITHUB_TOKEN configured for ' + projectName + ' — skipping (not an error; this project just isn\'t wired into deploy-drift yet).');
      return false;
    }

    const payload = {
      event_type: 'gas-version-report',
      client_payload: {
        // Must exactly match this project's key in tools/gas-lint/project-map.json.
        project: projectName,
        sha: sha,
        reportedAt: new Date().toISOString(),
      },
    };

    const resp = UrlFetchApp.fetch('https://api.github.com/repos/adamberneche-afk/KOS/dispatches', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': projectName + '-deploy-version-report',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = resp.getResponseCode();
    if (code !== 204) {
      console.error('[DeployVersionReport] Unexpected response ' + code + ' for ' + projectName + ': ' + resp.getContentText());
      return false;
    }
    console.log('[DeployVersionReport] Reported ' + projectName + ' @ ' + sha + ' successfully.');
    return true;
  } catch (e) {
    console.error('[DeployVersionReport] Failed to report ' + projectName + ': ' + e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// The process reflection on Submit (meta/STUDENT_WORK_PLAN_2026-10.md,
// Phase 1, decided 2026-10-24)
//
// With REFLECTION_ON_SUBMIT on for a course (blank/"off", "all", or a course
// code, as pivotFlagFor_ reads it), Submit for Feedback on the Student
// Dashboard (13) first asks one or two short questions about how the student
// worked. The answers go to the Central Ledger's ReflectionLog tab, one row
// per answer: the raw data for the student's context. Flow 2 reads the
// latest submission's answers in its prompt (37), and the student gets them
// back as a comment on their doc, for reference only (37).
//
// The questions come from fixed frames, chosen here in code, not by a model:
// the same inputs always give the same questions, so the teacher can see why
// a student got one and a test can pin it. An Evidence question names one of
// the assignment's competencies (milestones 1 to 3, primary first, then
// rotating); it is asked on every Submit when the assignment has any. A
// first Submit adds one Approach or Choice question. No frame is asked twice
// of the same student for the same assignment while an unused one is left.
// The feedback reflection (a resubmission after Revise) is Phase 2 and not
// built: a resubmission gets an Evidence question only.
// ---------------------------------------------------------------------------
const REFLECTION_MIN_WORDS = 10;

const REFLECTION_FRAMES = [
  { id: "E1", kind: "EVIDENCE", text: "Where in your work do you show this: \u201c{criterion}\u201d? Point to the sentence or part." },
  { id: "E2", kind: "EVIDENCE", text: "Look at this one: \u201c{criterion}\u201d. What in your work shows it, and what would make it stronger?" },
  { id: "E3", kind: "EVIDENCE", text: "If your teacher read only one part of your work to check \u201c{criterion}\u201d, which part should it be? Why?" },
  { id: "A1", kind: "APPROACH", text: "What did you do first in this assignment, and why start there?" },
  { id: "A2", kind: "APPROACH", text: "What did you leave out or cut, and why?" },
  { id: "A3", kind: "APPROACH", text: "What did you look back at in the lesson while you worked, and what did it help with?" },
  { id: "C1", kind: "CHOICE",   text: "What was the hardest choice in this assignment, and what did you pick?" },
  { id: "C2", kind: "CHOICE",   text: "What would someone who disagrees with your work say? What would you tell them?" },
  { id: "C3", kind: "CHOICE",   text: "What other way could you have done this? Why didn't you?" },
  // Phase 2 (meta/STUDENT_WORK_PLAN_2026-10.md, Appendix A, approved
  // 2026-10-24): a resubmission after the primary wasn't met.
  { id: "F1", kind: "FEEDBACK", text: "The feedback says your work doesn't show this yet: \u201c{criterion}\u201d. What are you changing, and why will that fix it?" },
  { id: "F2", kind: "FEEDBACK", text: "What part of the feedback do you agree with most, and what are you doing about it?" },
  { id: "F3", kind: "FEEDBACK", text: "Is there anything in the feedback you disagree with? Say what, and what you're doing about the rest." }
];

const REFLECTION_LOG_HEADERS = ["SubmittedAt", "GoogleID", "ConfigID", "StudentFileID", "Kind",
  "FrameID", "CompetencyID", "Question", "Answer"];
const RL = { SUBMITTED_AT: 0, GOOGLE_ID: 1, CONFIG_ID: 2, FILE_ID: 3, KIND: 4,
  FRAME_ID: 5, COMPETENCY_ID: 6, QUESTION: 7, ANSWER: 8 };

function reflectionWordCount_(text) {
  return String(text || "").split(/\s+/).filter(function (w) { return /[A-Za-z0-9]/.test(w); }).length;
}

// A milestone line ("8177-83 Develop a market research project.") as the
// words a student reads: the competency ID and the closing period dropped.
function reflectionCriterionText_(milestone) {
  return String(milestone || "").trim().replace(/^\d{4}-\d+[a-z]?\s+/i, "").replace(/\.\s*$/, "").trim();
}

// The assignment's competencies from its TeacherMatrix row, primary first:
// [{ id, text }] for milestones 1 to 3 that carry a competency ID. The text
// is the student's own "I can" objective for it (approved 2026-10-24, the
// row's StudentObjectives), or the competency's title where there is none.
function reflectionCriteria_(matrixRow) {
  const out = [];
  if (!matrixRow) return out;
  const objectives = matrixRow.objectives || {};
  [1, 2, 3].forEach(function (n) {
    const id = String(matrixRow["milestone" + n + "CompetencyId"] || "").trim();
    const text = reflectionCriterionText_(objectives[id] || matrixRow["milestone" + n]);
    if (id && text) out.push({ id: id, text: text });
  });
  return out;
}

// A small, stable number from a string, so which Approach or Choice frame a
// first Submit gets varies by assignment but never between two calls.
function _reflectionHash_(s) {
  let h = 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100003;
  return h;
}

// The questions for this Submit. criteria: reflectionCriteria_(); prior:
// this student's earlier ReflectionLog rows for this assignment, as
// [{ frameId, kind, competencyId, submittedAt }]; key: the assignment's
// ConfigID (seeds the variety); shortfall: reflectionShortfall_(), the
// primary criterion when the last check found it not met yet, else null.
// Returns [{ frameId, kind, competencyId, question }], one or two of them:
// an Evidence question every time, plus an Approach or Choice question on a
// first Submit, or a Feedback question on a resubmission with a shortfall.
function chooseReflectionQuestions_(criteria, prior, key, shortfall) {
  criteria = criteria || [];
  prior = prior || [];
  const used = {};
  const submits = {};
  let evidenceAsked = 0;
  prior.forEach(function (p) {
    used[p.frameId] = (used[p.frameId] || 0) + 1;
    submits[String(p.submittedAt)] = true;
    if (p.kind === "EVIDENCE") evidenceAsked++;
  });
  const firstSubmit = Object.keys(submits).length === 0;
  const seed = _reflectionHash_(key);
  const pick = function (kind, offset) {
    const frames = REFLECTION_FRAMES.filter(function (f) { return f.kind === kind; });
    const start = (seed + offset) % frames.length;
    let best = null;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[(start + i) % frames.length];
      if (!best || (used[f.id] || 0) < (used[best.id] || 0)) best = f;
    }
    return best;
  };
  const out = [];
  if (criteria.length) {
    const c = criteria[evidenceAsked % criteria.length];
    const f = pick("EVIDENCE", evidenceAsked);
    out.push({ frameId: f.id, kind: f.kind, competencyId: c.id, question: f.text.replace("{criterion}", c.text) });
  }
  if (!firstSubmit && shortfall && criteria.length) {
    // F1 first (it names what fell short), then the least answered, in order.
    const f = REFLECTION_FRAMES.filter(function (x) { return x.kind === "FEEDBACK"; })
      .reduce(function (b, x) { return (used[x.id] || 0) < (used[b.id] || 0) ? x : b; });
    out.push({ frameId: f.id, kind: f.kind, competencyId: shortfall.id,
               question: f.text.replace("{criterion}", shortfall.text) });
    return out;
  }
  if (firstSubmit || !criteria.length) {
    const kinds = seed % 2 === 0 ? ["APPROACH", "CHOICE"] : ["CHOICE", "APPROACH"];
    const wanted = criteria.length ? 1 : 2;
    for (let k = 0; k < wanted; k++) {
      const f = pick(kinds[k], 0);
      out.push({ frameId: f.id, kind: f.kind, competencyId: "", question: f.text });
    }
  }
  return out;
}

// The primary criterion ({ id, text }) when this student file's last check
// found it not met yet (MET is the only outcome that isn't a shortfall), or
// null: no check yet, the primary met, or the evidence unreadable. Read from
// CompetencyEvidence by header; the latest evaluated_at is the last check.
function reflectionShortfall_(ss, cfg, fileId, criteria) {
  if (!criteria || !criteria.length) return null;
  const sheet = ss.getSheetByName((cfg.tabs && cfg.tabs.competencyEvidence) || "CompetencyEvidence");
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getDataRange().getValues();
  const h = rows[0].map(function (x) { return String(x).trim(); });
  const iFile = h.indexOf("student_file_id"), iComp = h.indexOf("competency_id"),
    iOut = h.indexOf("outcome"), iAt = h.indexOf("evaluated_at"), iArch = h.indexOf("archive_status");
  if (iFile === -1 || iComp === -1 || iOut === -1 || iAt === -1) return null;
  const mine = rows.slice(1).filter(function (r) {
    return String(r[iFile]).trim() === fileId && (iArch === -1 || !String(r[iArch]).trim());
  });
  if (!mine.length) return null;
  const latest = Math.max.apply(null, mine.map(function (r) { return sheetTimestampMs_(r[iAt]) || 0; }));
  const primary = criteria[0];
  const last = mine.filter(function (r) {
    return (sheetTimestampMs_(r[iAt]) || 0) === latest && String(r[iComp]).trim() === primary.id;
  })[0];
  if (!last) return null;
  return String(last[iOut]).trim().toUpperCase() === "MET" ? null : primary;
}

// The TeacherMatrix row a student's workspace belongs to, read the way 37
// does (StudentAssignments, then MatrixRegistry by the teacher's email):
// { milestone1..3, milestone1CompetencyId..3 } or null. Here, not in 37,
// because the Student Dashboard project holds only 00, 13, 49 and 63.
function reflectionMatrixRow_(cfg, studentConfigId, teacherEmail) {
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  let assignmentId = studentConfigId;
  const sa = ss.getSheetByName("StudentAssignments"); // 54's tab
  if (sa && sa.getLastRow() > 1) {
    sa.getRange(2, 1, sa.getLastRow() - 1, 3).getValues().forEach(function (r) {
      if (String(r[0] || "").trim() === studentConfigId && String(r[2] || "").trim()) {
        assignmentId = String(r[2]).trim();
      }
    });
  }
  const reg = ss.getSheetByName(cfg.tabs.matrixRegistry);
  if (!reg) return null;
  const lower = String(teacherEmail || "").trim().toLowerCase();
  const regRow = reg.getDataRange().getValues().slice(1).filter(function (r) {
    return String(r[1] || "").trim().toLowerCase() === lower && String(r[2] || "").trim();
  })[0];
  if (!regRow) return null;
  const tm = SpreadsheetApp.openById(String(regRow[2]).trim()).getSheetByName(cfg.tabs.teacherMatrix || "TeacherMatrix");
  if (!tm) return null;
  // TeacherMatrix columns: 37's FI_TM_COLUMNS_ (milestones 4-7, IDs 15-18),
  // and 53's StudentObjectives (20).
  const row = tm.getDataRange().getValues().slice(1).filter(function (r) {
    return String(r[0] || "").trim() === assignmentId;
  })[0];
  if (!row) return null;
  const at = function (n) { return String(row[n] || "").trim(); };
  let objectives = {};
  try { objectives = at(20) ? JSON.parse(at(20)) : {}; } catch (e) { objectives = {}; }
  return { milestone1: at(4), milestone2: at(5), milestone3: at(6),
           milestone1CompetencyId: at(15), milestone2CompetencyId: at(16), milestone3CompetencyId: at(17),
           objectives: objectives };
}

// This student's earlier answers for one workspace (ConfigID + doc), as
// chooseReflectionQuestions_ takes them. A missing tab is no answers.
function readReflections_(ss, cfg, configId, fileId) {
  const sheet = ss.getSheetByName((cfg.tabs && cfg.tabs.reflectionLog) || "ReflectionLog");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, REFLECTION_LOG_HEADERS.length).getValues()
    .filter(function (r) {
      return String(r[RL.CONFIG_ID]).trim() === configId && String(r[RL.FILE_ID]).trim() === fileId;
    })
    .map(function (r) {
      return { submittedAt: sheetTimestampMs_(r[RL.SUBMITTED_AT]), kind: String(r[RL.KIND]).trim(),
               frameId: String(r[RL.FRAME_ID]).trim(), competencyId: String(r[RL.COMPETENCY_ID]).trim(),
               question: String(r[RL.QUESTION]), answer: String(r[RL.ANSWER]) };
    });
}

// Appends one Submit's answers. Written as plain text, so an answer that
// starts with "=" stays words and never becomes a formula.
function appendReflections_(ss, cfg, rows) {
  if (!rows.length) return;
  const name = (cfg.tabs && cfg.tabs.reflectionLog) || "ReflectionLog";
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, REFLECTION_LOG_HEADERS.length).setValues([REFLECTION_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }
  const at = sheet.getLastRow() + 1;
  sheet.getRange(at, 2, rows.length, REFLECTION_LOG_HEADERS.length - 1).setNumberFormat("@");
  sheet.getRange(at, 1, rows.length, REFLECTION_LOG_HEADERS.length).setValues(rows);
}

// =============================================================================
// CLOVER HILL'S BELL SCHEDULE AND THE LESSON ITINERARY (2026-10-27)
// =============================================================================
// From the school's 2026-27 bell schedule page (meta/SPRINT_LESSON_DOCS_2026-11.md,
// checked against the operator's PDF; leader-hub holds the same in its own
// copy). Class minutes per block, 1st to 4th; 3rd block is shown minus its
// lunch wave. Here because the lesson doc and the agenda deck are made in
// the Central Ledger (the nightly rollout) and the Teacher Dashboard (its
// button) alike. Pure data and arithmetic: no service is called.
// The defaults; read the school's through bellClassMinutes_() and
// bellScheduleLabels_() (BELL_SCHEDULE, "THE SCHOOL" above).
const BELL_DEFAULT_CLASS_MINUTES = {
  A:             [50, 100, 100, 100],
  B:             [45, 90, 95, 90],
  ACTIVITY:      [40, 80, 79, 90],
  DELAY:         [30, 65, 75, 65],
  EARLY_RELEASE: [30, 55, 55, 55],
};
const BELL_DEFAULT_LABELS = {
  A: "Schedule A", B: "Schedule B", ACTIVITY: "Activity schedule",
  DELAY: "2-hour delay", EARLY_RELEASE: "3-hour early release",
};
// A every day to Sept. 4; Mon/Tue A and Wed-Fri B to Nov. 20; from Nov. 23,
// Mon/Tue/Fri A and Wed/Thu B. Each entry runs until its date (inclusive);
// the last has none. byDay is Sunday to Saturday. (The early-release dates
// are SCHOOL_DEFAULTS.EARLY_RELEASE_DAYS.)
const BELL_DEFAULT_ROTATION = [
  { until: "2026-09-04", byDay: ["A", "A", "A", "A", "A", "A", "A"] },
  { until: "2026-11-20", byDay: ["B", "A", "A", "B", "B", "B", "B"] },
  { until: "", byDay: ["A", "A", "A", "B", "B", "A", "A"] },
];

// The school's bell schedules: { name: [class minutes per block] }.
function bellClassMinutes_() { return schoolProfile_().bell.classMinutes; }
// { name: label } for the same schedules; a name without one shows itself.
function bellScheduleLabels_() { return schoolProfile_().bell.labels; }
function bellScheduleLabel_(name) { return bellScheduleLabels_()[name] || String(name || ""); }
// The schedules the rotation runs on ordinary days, in first-use order
// (["A", "B"] by default): the lesson doc's itinerary has a column for each.
function bellRegularSchedules_() {
  const out = [];
  schoolProfile_().bell.rotation.forEach(function (r) {
    r.byDay.forEach(function (n) { if (out.indexOf(n) === -1) out.push(n); });
  });
  return out;
}

// The days called as they come (an activity day, a delay), from ⚙ Settings
// (SCHEDULE_DAYS, "2026-11-05=DELAY,2026-11-12=ACTIVITY"): { ymd: schedule }.
// A day must be a whole date and the schedule one of bellClassMinutes_()'s; any
// other entry is skipped.
function bellScheduleDays_(raw) {
  const out = {};
  String(raw || "").split(",").forEach(function (pair) {
    const m = /^\s*(\d{4}-\d{2}-\d{2})\s*=\s*([A-Z_]+)\s*$/.exec(pair.toUpperCase());
    if (m && bellClassMinutes_()[m[2]]) out[m[1]] = m[2];
  });
  return out;
}

// SCHEDULE_DAYS as saved, read once per run (the lesson doc and agenda ask
// for every day and period); {} where no config can be read.
let _bellSavedDaysCache_ = null;
function bellSavedDays_() {
  if (_bellSavedDaysCache_) return _bellSavedDaysCache_;
  let raw = "";
  try { raw = _resolveConfigValues_().values.SCHEDULE_DAYS || ""; } catch (e) { raw = ""; }
  _bellSavedDaysCache_ = bellScheduleDays_(raw);
  return _bellSavedDaysCache_;
}

// Which schedule a school day ("yyyy-MM-dd") runs. `overrides` is
// { "2026-11-05": "DELAY", ... } for the days called as they come (an
// activity day, a delay); left out, the days saved in ⚙ Settings are used.
// Otherwise an early-release day (EARLY_RELEASE_DAYS) runs EARLY_RELEASE,
// and any other day its rotation entry's schedule for that weekday
// (BELL_SCHEDULE's rotation; BELL_DEFAULT_ROTATION).
function bellScheduleFor_(ymd, overrides) {
  const day = String(ymd || "").slice(0, 10);
  const o = overrides === undefined ? bellSavedDays_() : (overrides || {});
  const minutes = bellClassMinutes_();
  if (o[day] && minutes[o[day]]) return o[day];
  const school = schoolProfile_();
  if (minutes.EARLY_RELEASE && school.earlyReleaseDays.indexOf(day) !== -1) return "EARLY_RELEASE";
  const p = day.split("-").map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  const rot = school.bell.rotation;
  for (let i = 0; i < rot.length; i++) {
    if (!rot[i].until || day <= rot[i].until) return rot[i].byDay[dow];
  }
  return rot[rot.length - 1].byDay[dow];
}

// A period's block: its leading number ("1" → 1st, "3-Odd" → 3rd), or 0
// when it names none (or more blocks than the bell schedule has).
function bellBlockOf_(period) {
  const n = parseInt(String(period || "").trim(), 10);
  const minutes = bellClassMinutes_();
  const blocks = Math.max.apply(null, Object.keys(minutes).map(function (k) { return minutes[k].length; }));
  return n >= 1 && n <= blocks ? n : 0;
}

// Class minutes for a period on a day, or 0 when the period names no block.
function classMinutesFor_(ymd, period, overrides) {
  const block = bellBlockOf_(period);
  return block ? (bellClassMinutes_()[bellScheduleFor_(ymd, overrides)][block - 1] || 0) : 0;
}

// What the class is doing in each itinerary block (55b's plan modes).
const ITINERARY_MODES = {
  warmup:  "✏️ Warm-up",
  devices: "💻 Chromebooks out",
  listen:  "🎧 Listening",
  discuss: "💬 Discussion",
  write:   "✏️ Writing",
};

// One day of a lesson's plan (55b: [{ title, minutes, mode, detail, fixed }])
// fitted to `minutes` of class. Fixed blocks (the warm-up, a checkout slip)
// keep their minutes. A block with no minutes (8175's task) takes what is
// left after the others; with none, every other block is scaled to fit.
// Rounded to 5, at least 5 each; the longest block absorbs the rounding.
// Returns copies with `minutes` set; the plan is not changed.
function itineraryFor_(blocks, minutes) {
  const out = (blocks || []).map(function (b) { return Object.assign({}, b); });
  if (!out.length || !(minutes > 0)) return out;
  const round5 = function (n) { return Math.max(5, Math.round(n / 5) * 5); };
  const fixed = out.filter(function (b) { return b.fixed; });
  const flex = out.filter(function (b) { return !b.fixed; });
  const left = Math.max(0, minutes - fixed.reduce(function (n, b) { return n + (b.minutes || 0); }, 0));
  const timed = flex.filter(function (b) { return b.minutes > 0; });
  const open = flex.filter(function (b) { return !(b.minutes > 0); });
  const given = timed.reduce(function (n, b) { return n + b.minutes; }, 0);
  if (open.length) {
    const room = Math.max(0, left - 10 * open.length);
    const scale = given > room && given ? room / given : 1;
    timed.forEach(function (b) { b.minutes = round5(b.minutes * scale); });
    const rest = left - timed.reduce(function (n, b) { return n + b.minutes; }, 0);
    open.forEach(function (b) { b.minutes = round5(rest / open.length); });
  } else if (given) {
    timed.forEach(function (b) { b.minutes = round5(b.minutes * left / given); });
  }
  const total = out.reduce(function (n, b) { return n + (b.minutes || 0); }, 0);
  if (flex.length && total !== minutes) {
    const longest = flex.reduce(function (m, b) { return b.minutes > m.minutes ? b : m; }, flex[0]);
    longest.minutes = Math.max(5, longest.minutes + minutes - total);
  }
  return out;
}
