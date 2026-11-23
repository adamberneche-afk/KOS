// =============================================================================
// FILE: 07_TeacherDashboard.js
// STANDALONE APPS SCRIPT PROJECT — deployed as Web App
// PURPOSE: The Teacher Dashboard web app: the teacher's own students from the Ledger, and the teacher's lesson and review tools.
//          Teacher-facing dashboard. Reads from the central Ledger,
//          filtered to show only students assigned to the requesting teacher.
//          Also provides the Lesson Context submission form (modal) and
//          the submitLessonContext() handler called by it.
//          All IDs from getConfig_() / Script Properties.
// DEPLOY:  Execute as: Me · Access: Anyone in organization
//
// MODULE 2 ADDITIONS (marked ── M2 ──):
//   submitLessonContext()    — server-side handler called by modal form
//   getCompetencies()        — returns filtered competency list for dropdown
//   Lesson Context modal markup — inlined directly inside buildDashboardHtml_()
//   All existing functions unchanged.
//
// MODULE 4 ADDITIONS (marked ── M4 ──, merged in from
// 07_TeacherDashboard_M4_ADDENDUM.js — see cas-ccps/scripts/archived/ for
// the original addendum file):
//   getMyStudentContext()      — student-facing, own-data-only
//   getStudentContextRoster()  — teacher-facing, full roster
//   "My Context" nav tab + #student-context-view container + client JS
//
// ACCESS MODEL — read this before touching any server function below:
//   This dashboard is deployed "Execute as: Me" (the teacher), which means
//   every server function here runs with the TEACHER's permissions
//   regardless of who opened the URL — and "Access" is "Anyone in
//   organization," not "teacher only," because Module 4 added the first
//   STUDENT-facing surface to this same dashboard (My Context). That
//   combination means every exported function MUST gate on caller
//   identity itself; nothing about the deployment does it for you.
//   _isAuthorizedTeacher_() below is that gate — every function that
//   returns or accepts data scoped to "the teacher" calls it first and
//   fails closed (returns an error, not partial data) if the caller isn't
//   the configured teacher. getMyStudentContext() is the one exception by
//   design: it's intentionally open to any signed-in user, because it
//   scopes itself to the CALLER's own identity (Session.getActiveUser()),
//   never the teacher's.
// =============================================================================

// ---------------------------------------------------------------------------
// _isAuthorizedTeacher_ — true only if the active session belongs to the
// teacher this dashboard is configured for (cfg.teacherEmail, a Script
// Property set during deployment — see cas-ccps/docs/SETUP_GUIDE.md
// Step 10). Fails closed: an unset/blank teacherEmail can never match a
// real signed-in caller, so a misconfigured deployment denies everyone
// instead of silently granting access.
// ---------------------------------------------------------------------------
// runLeaderHubConnectionCheck
//
// Separates the causes of "leader-hub can't reach cas-ccps" — the last
// deployment surface in this repo with no diagnostic of its own.
//
// WHY THIS IS NOT A FIXTURE. Every other flow in this repo has a queue, so a
// fixture row gives it something to latch onto. D1 has no queue: leader-hub's
// browser POSTs an OAuth ID token and gets JSON back synchronously. There is
// nothing to seed. What there IS, is four independent failure causes that all
// surface as the same opaque error in leader-hub's UI:
//
//   1. LEADER_HUB_OAUTH_CLIENT_ID is unset on this deployment
//   2. TEACHER_EMAIL is unset or does not match the signed-in teacher
//   3. the token is fine but the underlying tabs are empty, so every action
//      returns an empty payload that reads as a failure
//   4. the deployment URL leader-hub is configured with is stale
//
// This checks 1, 2 and 3 from inside the script, where they are all knowable,
// and says explicitly that it cannot check 4. The three action handlers are
// called directly with this deployment's own teacher email, deliberately
// bypassing _verifyLeaderHubToken_ — that is the whole point: if real data
// comes back here, the data side is sound and the failure is the token, the
// consent, or the URL.
//
// Read-only. Returns nothing student-identifying: the roster check reports
// only a COUNT, never a name or an email, because this runs from a Run
// dropdown and its output lands in an execution log (FERPA — see
// docs/FERPA_DATA_MAP.md's entry on this endpoint being the first to return
// student PII).
// ---------------------------------------------------------------------------
function runLeaderHubConnectionCheck() {
  requireScriptOwner_();
  const cfg = getConfig_();
  const checks = [];
  function record(name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail || "" }); }

  record("LEADER_HUB_OAUTH_CLIENT_ID is set", !!cfg.leaderHubOauthClientId,
    cfg.leaderHubOauthClientId
      ? "Configured."
      : "Unset, so doPost rejects every request before it reaches an action. " +
        "See docs/LEADERHUB_CONNECTION_SETUP.md — it is registered once for the " +
        "whole district, not per teacher.");

  record("TEACHER_EMAIL is set", !!cfg.teacherEmail,
    cfg.teacherEmail
      ? "This deployment answers only for " + cfg.teacherEmail + "."
      : "Unset. _verifyLeaderHubToken_ fails closed on a blank teacherEmail, so every " +
        "request is rejected no matter whose token arrives.");

  // The three actions, called with this deployment's own email so the answer
  // is about the DATA rather than about authorization.
  const email = String(cfg.teacherEmail || "").toLowerCase();

  let pacing;
  try { pacing = _apiGetPacingGuide_(); } catch (err) { pacing = { success: false, message: err.message }; }
  record("getPacingGuide returns data", _lhcHasRows_(pacing),
    _lhcDescribe_(pacing, "pacing unit") +
    " Curriculum data, no student PII — the safest of the three to test with.");

  let registry;
  try { registry = _apiGetCompetencyRegistry_(cfg, email); }
  catch (err) { registry = { success: false, message: err.message }; }
  record("getCompetencyRegistry returns data", _lhcHasRows_(registry),
    _lhcDescribe_(registry, "course"));

  let roster;
  try { roster = _apiGetRoster_(cfg, email); }
  catch (err) { roster = { success: false, message: err.message }; }
  // Count only. This action is the first of the three to return student name,
  // email and period, and this output goes to an execution log.
  record("getRoster returns data", _lhcHasRows_(roster),
    _lhcDescribe_(roster, "student") +
    " Reported as a count only — this action returns student PII and this log is not a " +
    "place for it.");

  const passed = checks.filter(function (c) { return c.ok; }).length;
  Logger.log("[LeaderHubCheck] " + passed + "/" + checks.length + " passed");
  checks.forEach(function (c) {
    Logger.log("[LeaderHubCheck]   " + (c.ok ? "PASS" : "FAIL") + "  " + c.name +
      (c.detail ? " — " + c.detail : ""));
  });

  if (passed === checks.length) {
    Logger.log("[LeaderHubCheck] The data side and both properties are sound, so a failure " +
      "in leader-hub is one of: the ID token (wrong Google account signed in), consent not " +
      "granted, or the /exec URL leader-hub is configured with pointing at an older " +
      "deployment. THAT LAST ONE CANNOT BE CHECKED FROM HERE — a redeploy issues a new URL " +
      "unless you deploy over the existing version, and nothing in this script can see what " +
      "leader-hub has stored. Re-copy the URL from Deploy → Manage deployments.");
  } else {
    Logger.log("[LeaderHubCheck] Fix the failures above before looking at leader-hub — every " +
      "one of them surfaces there as the same opaque error.");
  }

  return { passed: passed, total: checks.length, checks: checks };
}

// A handler result counts as data if it succeeded AND carries at least one
// row. "Succeeded but empty" is its own diagnosis: the token gate is fine and
// the tab is empty, which reads to leader-hub exactly like a rejection.
function _lhcHasRows_(result) {
  if (!result || result.success === false) return false;
  return _lhcCount_(result) > 0;
}

function _lhcCount_(result) {
  if (!result || typeof result !== "object") return 0;
  const keys = Object.keys(result);
  for (let i = 0; i < keys.length; i++) {
    if (Array.isArray(result[keys[i]])) return result[keys[i]].length;
  }
  // Nothing at the top level, so look one object down. getCompetencyRegistry
  // wraps its payload as data.courses where the other two return units and
  // students directly, and a top-level-only search reported a registry of
  // 245 competencies as "0 rows — the source tab is empty".
  for (let i = 0; i < keys.length; i++) {
    const value = result[keys[i]];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const n = _lhcCount_(value);
      if (n > 0) return n;
    }
  }
  return 0;
}

function _lhcDescribe_(result, noun) {
  if (!result) return "Handler returned nothing at all.";
  if (result.success === false) {
    return "Handler failed: " + String(result.message || "no message").replace(/\.+$/, "") + ".";
  }
  const n = _lhcCount_(result);
  if (n === 0) {
    return "Handler succeeded but returned 0 " + noun + "s — the source tab is empty. " +
      "leader-hub cannot tell an empty payload from a rejection, so this looks like a " +
      "broken connection from that end.";
  }
  return n + " " + noun + (n === 1 ? "" : "s") + " returned.";
}

// ---------------------------------------------------------------------------
function _isAuthorizedTeacher_(cfg) {
  const viewerEmail = Session.getActiveUser().getEmail();
  return !!(viewerEmail && cfg.teacherEmail &&
    viewerEmail.toLowerCase() === cfg.teacherEmail.toLowerCase());
}

// FIXED (Say/Do Ledger cas-ccps finding #9): doGet() used to build and
// send the exact same teacher-shaped HTML (dashboard stats, Lesson
// Context modal, "+ New Lesson" button, term filter — none of it
// meaningful or reachable for a student) to every caller, and relied on
// the CLIENT discovering after the fact, via a failed server call, that
// it should fall back to a different view. The identity check now
// happens here, before any HTML is built, so a non-teacher caller never
// has teacher-shaped markup built for them at all — just the small,
// focused page their own role actually needs.
function doGet() {
  const cfg  = getConfig_();
  const html = _isAuthorizedTeacher_(cfg) ? buildDashboardHtml_(cfg) : buildMyContextHtml_();
  return HtmlService
    .createHtmlOutput(html)
    .setTitle("Assignment Dashboard")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =============================================================================
// LEADER-HUB JSON API (D1 — shared-core merge, Say/Do Ledger, Addendum 24)
// =============================================================================
//
// leader-hub's SCR grading grid and Pacing Calendar becoming live clients of
// this project's pacing-guide/competency-registry data, instead of leader-hub
// keeping its own frozen local copy. The identity model here is deliberately
// NOT Session.getActiveUser()/_isAuthorizedTeacher_() — this project deploys
// "Execute as: Me," so Session.getActiveUser() inside doPost() always
// resolves to the deploying teacher regardless of who actually made the HTTP
// request; it cannot distinguish a genuine leader-hub caller from anyone else
// who reaches this endpoint. Real caller identity comes from a Google
// Identity Services ID token leader-hub obtains client-side (its own "Sign In
// With Google" button — see student-leader-hub.html), verified HERE,
// server-side, via UrlFetchApp against Google's own tokeninfo endpoint —
// checking the token's email matches this exact deployment's configured
// teacher, its audience matches leader-hub's registered OAuth Client ID (so a
// token issued to some other app can't be replayed here), and it hasn't
// expired. This requires its own web-app deployment, separate from the one
// this doGet() serves the human-facing dashboard from — see
// docs/LEADERHUB_CONNECTION_SETUP.md for why and how to create it; a
// Domain-restricted deployment's edge-level sign-in gate would otherwise
// block leader-hub's cross-origin POST before this code ever ran.
//
// Only read endpoints are implemented so far (pacing guide, competency
// registry). SCR read+write is a deliberately separate, later phase — it
// needs cross-project access to 30_SCRSuggestionEngine.js (bound to
// central-ledger, not this project) plus real per-teacher scoping and
// caller-ownership checks that engine doesn't have today, and leader-hub's
// own SCR roster still has no student-email field to match against. Not
// silently scoped out — flagged here and in the plan file for when that
// groundwork is ready.

/**
 * Verifies a Google ID token against this deployment's configured teacher
 * and leader-hub's registered OAuth Client ID. Real UrlFetchApp round trip
 * to Google's own tokeninfo endpoint — never trusts a client-side decode.
 *
 * @param {string} idToken  Raw ID token JWT from leader-hub's GIS sign-in.
 * @param {Object} cfg      getConfig_() result.
 * @returns {Object} { ok: true, email } | { ok: false, message }
 */
function _verifyLeaderHubToken_(idToken, cfg) {
  if (!idToken) {
    return { ok: false, message: "Missing ID token." };
  }
  if (!cfg.leaderHubOauthClientId) {
    return { ok: false, message: "LEADER_HUB_OAUTH_CLIENT_ID not configured on this deployment. See docs/LEADERHUB_CONNECTION_SETUP.md." };
  }

  let info;
  try {
    const resp = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) {
      return { ok: false, message: "Token verification failed (Google returned HTTP " + resp.getResponseCode() + ") — sign in again." };
    }
    info = JSON.parse(resp.getContentText());
  } catch (e) {
    return { ok: false, message: "Token verification error: " + e.message };
  }

  if (String(info.aud || "") !== cfg.leaderHubOauthClientId) {
    return { ok: false, message: "Token audience mismatch — this token wasn't issued to the expected app." };
  }
  if (String(info.email_verified) !== "true") {
    return { ok: false, message: "Token's email is not verified." };
  }
  const email = String(info.email || "").trim().toLowerCase();
  if (!cfg.teacherEmail || email !== cfg.teacherEmail.toLowerCase()) {
    return { ok: false, message: "Signed-in Google account doesn't match the teacher this dashboard is configured for." };
  }
  const exp = parseInt(info.exp, 10);
  if (!exp || Date.now() / 1000 > exp) {
    return { ok: false, message: "Token expired — sign in again." };
  }

  return { ok: true, email: email };
}

/**
 * JSON API entry point for leader-hub. Every action requires a verified
 * ID token in the request body (see _verifyLeaderHubToken_ above) — there
 * is no unauthenticated action.
 *
 * Expected POST body (JSON, sent as text/plain to avoid a CORS preflight
 * Apps Script can't answer — same convention leader-hub's own EmailBridge.gs
 * already uses):
 *   { idToken: "<Google ID token>", action: "getPacingGuide" | "getCompetencyRegistry" | "getRoster" }
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {TextOutput} JSON response, always HTTP 200 (success/failure is
 *   in the body — ContentService doesn't support custom status codes).
 */
function doPost(e) {
  const out = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      out.setContent(JSON.stringify({ success: false, message: "Empty request body." }));
      return out;
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      out.setContent(JSON.stringify({ success: false, message: "Invalid JSON body: " + parseErr.message }));
      return out;
    }

    const cfg  = getConfig_();
    const auth = _verifyLeaderHubToken_(body.idToken, cfg);
    if (!auth.ok) {
      out.setContent(JSON.stringify({ success: false, message: auth.message }));
      return out;
    }

    const action = body.action || "";
    let result;
    if (action === "getPacingGuide") {
      result = _apiGetPacingGuide_();
    } else if (action === "getCompetencyRegistry") {
      result = _apiGetCompetencyRegistry_(cfg, auth.email);
    } else if (action === "getRoster") {
      result = _apiGetRoster_(cfg, auth.email);
    } else {
      result = { success: false, message: "Unknown action: " + action };
    }

    out.setContent(JSON.stringify(result));
    return out;

  } catch (err) {
    Logger.log("[doPost] " + err.message + "\n" + err.stack);
    out.setContent(JSON.stringify({ success: false, message: "Server error: " + err.message }));
    return out;
  }
}

/**
 * Returns the full pacing guide (every unit, not just "today's anchor") —
 * getAllUnits_() already exists in 31_PacingGuideManager.js (shared with
 * this project per project-map.json) but was never client-exposed before.
 */
function _apiGetPacingGuide_() {
  try {
    const units = getAllUnits_(); // 31_PacingGuideManager.js
    return { success: true, units: units };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Wraps _getCompetenciesForEmail_() (extracted from getCompetencies() below)
 * for the OAuth-token-verified caller — auth.email (already verified by
 * doPost()'s caller against cfg.teacherEmail) is passed through rather than
 * re-deriving it, so this function has no gate of its own to get wrong.
 */
function _apiGetCompetencyRegistry_(cfg, email) {
  try {
    const result = _getCompetenciesForEmail_(cfg, email);
    // _getCompetenciesForEmail_ reports a missing tab or zero visible rows as
    // { error } rather than throwing (getCompetencies() hands that straight to
    // the dashboard UI). Wrapped as-is, that went out as success:true with
    // the error buried under data — a caller checking success saw a healthy
    // response with no courses in it.
    if (result.error) return { success: false, message: result.error };
    return { success: true, data: result };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Student-email-linking fix (Say/Do Ledger, Addendum 26 — "one source of
 * truth for both systems"). leader-hub's SCR grading grid has never had a
 * student-email field; cas-ccps's Ledger is the one place a student's real
 * email is captured (Form 1 intake, column "GoogleID" — misleadingly named,
 * holds the actual email address everywhere it's used). This is the first
 * doPost() action that returns student PII (name+email+period), unlike
 * getPacingGuide/getCompetencyRegistry — see LEADERHUB_CONNECTION_SETUP.md
 * and FERPA_DATA_MAP.md, both updated alongside this.
 *
 * auth.email is the OAuth-token-verified caller (already checked by
 * doPost() above) — passed straight through, never re-derived, same
 * pattern _apiGetCompetencyRegistry_ already uses.
 */
function _apiGetRoster_(cfg, email) {
  try {
    return { success: true, students: _getRosterForEmail_(cfg, email) };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Builds this teacher's student roster from the Ledger directly — NOT a
 * reuse of exportToWorkbookGrid_() (30_SCRSuggestionEngine.js: different
 * GAS project, cas-ccps:central-ledger, not callable from this project's
 * doPost(); also loops every teacher's students with no per-teacher filter,
 * unsafe to reuse verbatim) and NOT a reuse of getAllStudentDocsForTeacher_()
 * (29_StudentContextAggregator.js: same project as this file, but joins
 * through StudentDocRegistry — under-reports any student who doesn't yet
 * have a Module-4 context doc). Same Ledger-join *pattern* both of those
 * already use (LEDGER.GOOGLE_ID/STUDENT_NAME/CLASS_NAME/TEACHER_EMAIL,
 * 00_SharedConfig.js — see getDashboardData() below), but a fresh,
 * correctly-scoped implementation.
 *
 * `className` is included for display context only — Form 1's "Course
 * Name" field is free text with no enum/validation at capture time, so it
 * cannot be reliably cross-referenced against leader-hub's own "8175"/
 * "8177" course codes. `period` (LEDGER.PERIOD, also free text — Form 1's
 * help text is literally "e.g. 3") is included as a secondary
 * disambiguation signal for leader-hub's name-matching, not a hard join
 * key — the two systems use different period vocabularies ("3" here vs.
 * "3rd Odd" there).
 */
function _getRosterForEmail_(cfg, teacherEmail) {
  const ss     = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet  = ss.getSheetByName(cfg.tabs.ledger);
  const data   = sheet ? sheet.getDataRange().getValues() : [];
  const wanted = String(teacherEmail || "").trim().toLowerCase();

  const byEmail = new Map(); // dedup — a student can have multiple Ledger rows (one per assignment)
  const year = _currentSchoolYear_();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() !== wanted) continue;
    // Access policy: a teacher's students are this school year's only.
    if (!_isCurrentSchoolYearRow_(row, year)) continue;
    const email = String(row[LEDGER.GOOGLE_ID] || "").trim();
    if (!email || byEmail.has(email.toLowerCase())) continue;
    byEmail.set(email.toLowerCase(), {
      name:      String(row[LEDGER.STUDENT_NAME] || "").trim(),
      email:     email,
      className: String(row[LEDGER.CLASS_NAME] || "").trim(),
      period:    String(row[LEDGER.PERIOD] || "").trim(),
    });
  }

  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// getDashboardData — called client-side via google.script.run
// Filters Ledger to the requesting teacher's email and optionally by term
// ---------------------------------------------------------------------------
function getDashboardData(termFilter) {
  const cfg = getConfig_();
  const teacherEmail = cfg.teacherEmail;

  if (!_isAuthorizedTeacher_(cfg)) {
    Logger.log("[S07] getDashboardData denied — caller was " +
      _tdWhoForLog_(Session.getActiveUser().getEmail()) + ", expected " + teacherEmail);
    return { error: "This dashboard is only available to the teacher it's configured for." };
  }

  // No filter means the whole current school year, not CURRENT_TERM: a term
  // is a marking period ("2627_MP1", 00) and courses run all year, so a
  // student registered in MP1 must still show in MP2. (The client's first
  // call sends "" for exactly this default.)
  const activeTerm = termFilter || "ALL";

  const ss          = SpreadsheetApp.openById(cfg.ledgerSsId);
  const ledger      = ss.getSheetByName(cfg.tabs.ledger);
  const staging     = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const ledgerData  = ledger.getDataRange().getValues();
  const stagingData = staging ? staging.getDataRange().getValues() : [];

  // Build pipeline status lookup by FileID
  const pipelineStatus  = {};
  const stagingHeaders  = stagingData[0] ? stagingData[0].map(h => String(h).trim()) : [];
  const spFileIdx       = stagingHeaders.indexOf("StudentFileID");
  const spStatusIdx     = stagingHeaders.indexOf("Status");
  for (let i = 1; i < stagingData.length; i++) {
    const fid = spFileIdx   !== -1 ? String(stagingData[i][spFileIdx]).trim()   : "";
    const st  = spStatusIdx !== -1 ? String(stagingData[i][spStatusIdx]).trim() : "";
    if (fid) pipelineStatus[fid] = st;
  }

  let students    = [];
  const unitMap   = {};
  const allTerms  = new Set();
  const year      = _currentSchoolYear_();
  const lessonCtx = _tdLessonContext_(ss);

  for (let i = 1; i < ledgerData.length; i++) {
    const row = ledgerData[i];
    if (String(row[LEDGER.TEACHER_EMAIL]).toLowerCase() !== teacherEmail.toLowerCase()) continue;
    if (!row[LEDGER.GOOGLE_ID]) continue;
    // Access policy: only this school year's work is visible, whatever term
    // the client asks for ("ALL" means every term of this year).
    if (!_isCurrentSchoolYearRow_(row, year)) continue;

    const rowTerm    = String(row[LEDGER.ACADEMIC_YEAR] || "").trim();
    const ledgerStatus = String(row[LEDGER.STATUS]).trim();

    if (rowTerm) allTerms.add(rowTerm);
    if (ledgerStatus === "ARCHIVED") continue;
    if (activeTerm !== "ALL" && rowTerm && rowTerm !== activeTerm) continue;

    const fileId       = String(row[LEDGER.FILE_ID]).trim();
    const unitCode     = String(row[LEDGER.COURSE_NAME]).trim();
    const displayStatus = resolveDisplay_(ledgerStatus, pipelineStatus[fileId]);
    const statusClass  = resolveClass_(displayStatus);

    // Say/Do Ledger cas-ccps finding #1: LEDGER.TURN_IN_SUGGESTED_SCORE
    // (column 20, index 19) — may not exist yet on a Ledger where no
    // submission has ever gone through markPendingReview_() (which self-heals
    // the column via _ensureTurnInReviewColumns_), so this can genuinely be
    // undefined here, not just an empty string.
    const suggestedScoreRaw = row[LEDGER.TURN_IN_SUGGESTED_SCORE];
    const suggestedScore = (suggestedScoreRaw === undefined || suggestedScoreRaw === "")
      ? null : Number(suggestedScoreRaw);

    const studentConfigId = String(row[LEDGER.CONFIG_ID]).trim();
    // A part of a lesson (68) counts under its lesson: it is in LessonSchedule
    // as the whole lesson, and its rows fold into one per student below.
    const partInfo        = partOfConfigId_(lessonCtx.assignmentOf[studentConfigId]);
    const assignmentId    = partInfo ? partInfo.lessonConfigId : (lessonCtx.assignmentOf[studentConfigId] || "");
    const lesson          = lessonCtx.lessons[assignmentId];
    const lastResult      = String(row[LEDGER.LAST_RESULT] || "").trim();
    const scoreRaw        = row[LEDGER.LAST_SUGGESTED_SCORE];

    students.push({
      // The lesson this workspace is for (StudentAssignments → LessonSchedule).
      // A workspace from before StudentAssignments falls back to its course.
      assignmentId:   assignmentId,
      assignmentName: lesson ? lesson.name
        : partInfo ? String(partInfo.part.a.unitName).split(" — Part ")[0]
        : (assignmentId || unitCode || "Unassigned"),
      part:           partInfo ? { n: partInfo.n, count: partInfo.count, title: partInfo.part.a.partTitle } : null,
      isCurrentLesson: !!assignmentId && lessonCtx.current.has(assignmentId),
      // Each evaluation's result (37's recordEvaluationResult_).
      evalState:       _tdEvalState_(lastResult, row[LEDGER.FIRST_PASSED_AT]),
      checkCount:      Number(row[LEDGER.CHECK_COUNT]) || 0,
      firstPassedAt:   row[LEDGER.FIRST_PASSED_AT] ? formatDate_(row[LEDGER.FIRST_PASSED_AT]) : null,
      lastSuggestedScore: (scoreRaw === undefined || scoreRaw === "") ? null : Number(scoreRaw),
      name:        String(row[LEDGER.STUDENT_NAME]).trim()  || "—",
      googleId:    String(row[LEDGER.GOOGLE_ID]).trim(),
      block:       String(row[LEDGER.BLOCK]).trim(),
      className:   String(row[LEDGER.CLASS_NAME]).trim(),
      period:      String(row[LEDGER.PERIOD]).trim(),
      // The course filter's key (ledgerRowCourseCode_, 00): "8175", "8177"
      // or "" when no name on the row names a course.
      courseCode:  ledgerRowCourseCode_(row),
      subject:     String(row[LEDGER.SUBJECT]).trim(),
      unitCode:    unitCode,
      configId:    String(row[LEDGER.CONFIG_ID]).trim(),
      status:      displayStatus,
      statusClass: statusClass,
      // For foldPartRows_ (68): a part held by a failed check is flagged.
      ledgerStatus: ledgerStatus,
      submittedAtMs: row[LEDGER.SUBMISSION_TS] ? sheetTimestampMs_(row[LEDGER.SUBMISSION_TS]) : 0,
      lastEval:    row[LEDGER.LAST_EVAL] ? formatDate_(row[LEDGER.LAST_EVAL]) : "Never",
      submittedAt: row[LEDGER.SUBMISSION_TS] ? formatDate_(row[LEDGER.SUBMISSION_TS]) : "—",
      flagReason:  statusClass === "flagged" ? _tdFlagReason_(ledgerStatus) : "",
      suggestedScore: suggestedScore,
      // A form, Slides or Sheets part's copy (Phase 4a/4c/4d) links to the file: its Ledger URL says so (00).
      docUrl:      workFileUrl_(fileId, workFileTypeOfUrl_(row[LEDGER.ADMIN_FILE_URL])),
      workType:    workFileTypeOfUrl_(row[LEDGER.ADMIN_FILE_URL])
    });

    if (!unitMap[unitCode]) unitMap[unitCode] = { total:0, compliant:0, pending:0, flagged:0 };
    unitMap[unitCode].total++;
    // These three buckets must exactly partition every statusClass so the
    // unit header's displayed sum always matches `total` — the previous
    // version only recognized "QUEUED"/"EVALUATING NOW" as pending, so
    // "NOT STARTED" and "EVALUATED" rows (both real, common states) fell
    // into no bucket at all and the numbers silently didn't add up.
    if (statusClass === "compliant")    unitMap[unitCode].compliant++;
    else if (statusClass === "flagged") unitMap[unitCode].flagged++;
    else                                 unitMap[unitCode].pending++;
  }

  // One row per student for a lesson in parts (68), not one per part.
  students = foldPartRows_(students);
  students.sort((a, b) => {
    if (a.statusClass === "flagged" && b.statusClass !== "flagged") return -1;
    if (b.statusClass === "flagged" && a.statusClass !== "flagged") return 1;
    if (a.unitCode < b.unitCode) return -1;
    if (a.unitCode > b.unitCode) return 1;
    return a.name.localeCompare(b.name);
  });

  // ── M2 warm-up readiness indicator ──────────────────────────────────────
  // Reads StudentProfiles to build the dashboard readiness panel.
  // Shows: students with eval history / warm-up history / shadow confidence.
  // buildShadowMatrixSummary_() is defined in Script 23 (same project).
  let warmUpReadiness = null;
  const m2Enabled = PropertiesService.getScriptProperties().getProperty("M2_ENABLED");
  if (m2Enabled === "true") {
    try {
      warmUpReadiness = buildShadowMatrixSummary_(ss, cfg);
    } catch(e) {
      Logger.log("[S07] Could not build warm-up readiness: " + e.message);
    }
  }

  return {
    students:       students,
    // Every lesson on the schedule a student here belongs to, current first.
    lessons:        _tdLessonList_(lessonCtx, students),
    unitSummary:    unitMap,
    teacherEmail:   teacherEmail,
    activeTerm:     activeTerm,
    availableTerms: [...allTerms].sort().reverse(),
    generatedAt:    formatDate_(new Date()),
    warmUpReadiness: warmUpReadiness,  // null if M2 not enabled
    m2Enabled:      m2Enabled === "true"
  };
}

// ── WHO IS WAITING, AND IS THE CHECKER ANSWERING (2026-11-14) ──────────────
// The operator's "Build 1-4", item 4. A strip at the top of the dashboard:
// "n students waiting over TD_WAIT_OVER_MIN minutes", each listed (this
// teacher's own students only, as the dashboard already lists them) with a
// "Give a code" link to the Turn-in codes panel's existing grant; and a
// light per checker that turns red when it has work but no verdict has come
// back for TD_SILENT_MIN minutes:
//   Flow 2 (feedback)   work: STAGING_PIPELINE rows IN_PROCESS (06 stamps
//                       each when it releases it); verdict: the newest
//                       EvaluationLog row (37's harvest writes one per
//                       answer it sees, whatever its result: the same
//                       signal 03's FLOW2_ALERT_STATE resets on, #427)
//                       Also (2026-11-15) the answers 37 found copied
//                       into another submission's row this week
//                       (Flow2Duplicates), which turn the light red.
//   Flow 6 (turn-in)    work: TurnInChecks rows PENDING_CHECK; verdict: the
//                       newest DecidedAt of an ADDRESSES or NOT_YET row
// Red needs both: the oldest work is TD_SILENT_MIN old and nothing came
// back in that time, so a quiet hour followed by one new submission isn't
// red. Fixture and canary rows (39, 35, 72) are left out of both.
// Why sheet reads and not 03's FLOW2_ALERT_STATE or 72's
// checkTurnInCheckFlowLiveness(): those live in the Central Ledger's
// project, whose Script Properties and functions this project can't
// reach; these are the same facts they are built from. One read each of
// the Ledger, STAGING_PIPELINE, ReviewQueue, TurnInChecks and the last
// TD_EVAL_TAIL rows of EvaluationLog (and Flow2Duplicates' last TD_DUP_TAIL
// rows, when the tab exists); the page asks once a minute while it
// is in view. Owner-guarded (_isAuthorizedTeacher_); logs nothing about
// students.
const TD_WAIT_OVER_MIN = 10;
const TD_SILENT_MIN = 10;
const TD_EVAL_TAIL = 200;
const TD_WAIT_TIMED_OUT_HOURS = 24; // a stopped check still waiting, if submitted this recently
const TD_SYNTHETIC_RE = /(^|-)(FIXTURE|CANARY)(-|$)/i;
// Flow 2 writing one answer into several rows of a doc (2026-11-15): the
// Ledger's harvest (37) adds a row (dates only) to this tab each time it
// finds one; the Flow 2 light says so for TD_DUP_DAYS. 37's TABS.flow2Duplicates and
// FI_DUP_WINDOW_DAYS; this project can't read those, so the same values.
const TD_DUP_DAYS = 7;
const TD_DUP_TAIL = 50;

function getWaitingStrip() {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  try {
    return Object.assign({ success: true }, _tdWaitingStrip_(cfg, new Date()));
  } catch (e) {
    Logger.log("[S07] getWaitingStrip failed: " + e.message);
    return { success: false, error: "Couldn't read the queue." };
  }
}

function _tdWaitingStrip_(cfg, now) {
  const t = now.getTime();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const teacher = String(cfg.teacherEmail || "").trim().toLowerCase();
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  const rows = ledger && ledger.getLastRow() > 1 ? ledger.getDataRange().getValues() : [];
  const mine = {};   // fileId -> the Ledger row
  const byConfig = {}; // student ConfigID -> the Ledger row
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[LEDGER.TEACHER_EMAIL]).trim().toLowerCase() !== teacher || !r[LEDGER.GOOGLE_ID]) continue;
    const st = String(r[LEDGER.STATUS]).trim();
    if (st === "ARCHIVED" || st === "SCHEDULED") continue;
    mine[String(r[LEDGER.FILE_ID]).trim()] = r;
    byConfig[String(r[LEDGER.CONFIG_ID]).trim()] = r;
  }

  // STAGING_PIPELINE: each file's latest row, and Flow 2's work.
  const lastStage = {};
  const flow2 = { work: 0, oldestAt: 0, lastVerdictAt: 0 };
  const stg = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const stgAll = stg && stg.getLastRow() > 1 ? stg.getDataRange().getValues() : [];
  const sh = stgAll.length ? stgAll[0].map(function (x) { return String(x).trim(); }) : [];
  const col = { at: sh.indexOf("Timestamp"), config: sh.indexOf("ConfigID"), file: sh.indexOf("StudentFileID"),
    status: sh.indexOf("Status") };
  stgAll.slice(1).forEach(function (r) {
    if (col.file === -1 || col.status === -1) return;
    const fid = String(r[col.file] || "").trim();
    const st = String(r[col.status] || "").trim();
    const at = col.at !== -1 ? sheetTimestampMs_(r[col.at]) || 0 : 0;
    if (fid) lastStage[fid] = { st: st, at: at };
    if (st === "IN_PROCESS" && !TD_SYNTHETIC_RE.test(String(col.config !== -1 ? r[col.config] : ""))) {
      flow2.work++;
      if (at && (!flow2.oldestAt || at < flow2.oldestAt)) flow2.oldestAt = at;
    }
  });
  // ReviewQueue: submitted, not yet taken by the bridge.
  const queued = {};
  let queue = [], queueUnreadable = false;
  try {
    const adminSs = cfg.adminSsId && cfg.adminSsId !== cfg.ledgerSsId ? SpreadsheetApp.openById(cfg.adminSsId) : ss;
    queue = _tdTabRows_(adminSs, cfg.tabs.reviewQueue);
  } catch (e) { queueUnreadable = true; }
  queue.forEach(function (r) {
    const st = String(r[5] || "").trim();
    if (st === "PENDING" || st === "STAGED") queued[String(r[2] || "").trim()] = true;
  });
  // EvaluationLog: the newest answers.
  const log = ss.getSheetByName(TABS.evaluationLog);
  if (log && log.getLastRow() > 1) {
    const n = Math.min(TD_EVAL_TAIL, log.getLastRow() - 1);
    log.getRange(log.getLastRow() - n + 1, 1, n, 2).getValues().forEach(function (r) {
      if (TD_SYNTHETIC_RE.test(String(r[1] || ""))) return;
      const at = sheetTimestampMs_(r[0]) || 0;
      if (at > flow2.lastVerdictAt) flow2.lastVerdictAt = at;
    });
  }

  // Flow2Duplicates: copies found this week (one small read of its tail).
  const dupTab = ss.getSheetByName(TABS.flow2Duplicates);
  if (dupTab && dupTab.getLastRow() > 1) {
    const n = Math.min(TD_DUP_TAIL, dupTab.getLastRow() - 1);
    flow2.duplicates = dupTab.getRange(dupTab.getLastRow() - n + 1, 1, n, 1).getValues().filter(function (r) {
      const at = sheetTimestampMs_(r[0]);
      return !isNaN(at) && t - at <= TD_DUP_DAYS * 86400000;
    }).length;
  }

  const waiting = [];
  Object.keys(mine).forEach(function (fid) {
    const r = mine[fid];
    const stage = lastStage[fid];
    const inFlight = stage && (stage.st === "IN_PROCESS" || stage.st === "PENDING_INFERENCE");
    const sub = sheetTimestampMs_(r[LEDGER.SUBMISSION_TS]) || 0;
    const stopped = String(r[LEDGER.STATUS]).trim() === "ERROR_TIMEOUT" && !inFlight && !queued[fid] &&
      sub && t - sub < TD_WAIT_TIMED_OUT_HOURS * 3600000;
    if (!inFlight && !queued[fid] && !stopped) return;
    const since = sub || (stage && stage.at) || 0;
    if (!since) return;
    waiting.push(_tdWaitEntry_(r, "feedback", since, t, stopped));
  });

  // TurnInChecks: answers waiting for Flow 6, and its newest verdict.
  const flow6 = { work: 0, oldestAt: 0, lastVerdictAt: 0 };
  _tdTabRows_(ss, TURN_IN_CHECKS_TAB, TURN_IN_CHECK_HEADERS.length).forEach(function (r) {
    if (TD_SYNTHETIC_RE.test(String(r[TCHK.CHECK_ID] || "") + " " + String(r[TCHK.STUDENT_CONFIG_ID] || ""))) return;
    const st = String(r[TCHK.STATUS] || "").trim();
    const at = sheetTimestampMs_(r[TCHK.SUBMITTED_AT]) || 0;
    if (st === TURN_IN_PENDING) {
      flow6.work++;
      if (at && (!flow6.oldestAt || at < flow6.oldestAt)) flow6.oldestAt = at;
      const row = byConfig[String(r[TCHK.STUDENT_CONFIG_ID] || "").trim()];
      if (row && at) waiting.push(_tdWaitEntry_(row, "turnIn", at, t, false));
    } else if (st === TURN_IN_ADDRESSES || st === TURN_IN_NOT_YET) {
      const d = sheetTimestampMs_(r[TCHK.DECIDED_AT]) || 0;
      if (d > flow6.lastVerdictAt) flow6.lastVerdictAt = d;
    }
  });

  const over = waiting.filter(function (w) { return w.minutes >= TD_WAIT_OVER_MIN; })
    .sort(function (a, b) { return b.minutes - a.minutes; });
  return {
    overMin: TD_WAIT_OVER_MIN,
    silentMin: TD_SILENT_MIN,
    waitingCount: waiting.length,
    over: over, queueUnreadable: queueUnreadable,
    health: { flow2: _tdHealthLight_(flow2, t), flow6: _tdHealthLight_(flow6, t) },
    checkedAt: formatDate_(now)
  };
}

function _tdTabRows_(ss, name, width) {
  const sheet = name ? ss.getSheetByName(name) : null;
  if (!sheet || sheet.getLastRow() < 2) return [];
  return width ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues()
    : sheet.getDataRange().getValues().slice(1);
}

function _tdWaitEntry_(row, kind, since, t, stopped) {
  return {
    name: String(row[LEDGER.STUDENT_NAME] || "").trim() || "—",
    googleId: String(row[LEDGER.GOOGLE_ID] || "").trim().toLowerCase(),
    configId: String(row[LEDGER.CONFIG_ID] || "").trim(),
    assignment: String(row[LEDGER.COURSE_NAME] || "").trim(),
    period: String(row[LEDGER.PERIOD] || "").trim(),
    kind: kind,
    stopped: !!stopped,
    minutes: Math.max(0, Math.floor((t - since) / 60000))
  };
}

// { state: "idle" | "ok" | "red", work, oldestMin, lastVerdictMin }.
function _tdHealthLight_(f, t) {
  const oldestMin = f.oldestAt ? Math.floor((t - f.oldestAt) / 60000) : null;
  const lastVerdictMin = f.lastVerdictAt ? Math.floor((t - f.lastVerdictAt) / 60000) : null;
  let state = "ok";
  if (!f.work) state = "idle";
  else if (oldestMin !== null && oldestMin >= TD_SILENT_MIN &&
    (lastVerdictMin === null || lastVerdictMin >= TD_SILENT_MIN)) state = "red";
  return { state: state, work: f.work, oldestMin: oldestMin, lastVerdictMin: lastVerdictMin,
    duplicates: f.duplicates || 0 };
}

// ── TURN-IN REVIEW (Say/Do Ledger cas-ccps finding #1) ──────────────────────
// The teacher's own confirm/override decision on a PENDING_TEACHER_REVIEW
// submission — this is what finally makes the auto-approval terminal,
// closing the North Star violation the finding was about ("the turn-in gate
// auto-approves silently, and the only override lives outside the teacher's
// own dashboard"). Mirrors the SCR confirm/override below (_recordScrDecision_)
// exactly, per the decision's own instruction to reuse that pattern — freeze the row on decision, reject
// re-deciding an already-decided row, restrict overrides to a valid 1-5
// integer. This writes into the same Ledger tab as SCRSuggestions/
// SCRDecisionLog live alongside, but is a separate, Ledger-row-keyed
// decision (turn-in scores), not a write into Module 5's own
// competency-SCR bookkeeping.
//
// CROSS-PROJECT NOTE: this logic lives here, not in 04_Form2_TurnInGate.js
// (which writes the PENDING_TEACHER_REVIEW half of the lifecycle) — that
// file is bound to cas-ccps:central-ledger, a DIFFERENT Apps Script project
// from this standalone web app (cas-ccps:teacher-dashboard), with no shared
// runtime (see tools/gas-lint/project-map.json). Both projects independently
// call _ensureTurnInReviewColumns_ so either one can self-heal a Ledger
// created before this feature existed, regardless of which project touches
// it first.
function _ensureTurnInReviewColumns_(sheet) {
  const headerRange = sheet.getRange(1, LEDGER.TURN_IN_SUGGESTED_SCORE + 1, 1, 4);
  const existing     = headerRange.getValues()[0];
  const want = LEDGER_HEADERS.slice(LEDGER.TURN_IN_SUGGESTED_SCORE, LEDGER.TURN_IN_SCORE_DECIDED_AT + 1);
  if (existing[0] !== want[0]) headerRange.setValues([want]);
}

function _recordTurnInDecision_(cfg, configId, teacherEmail, overrideScore, decisionType) {
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  _ensureTurnInReviewColumns_(sheet);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][LEDGER.CONFIG_ID]).trim() !== configId) continue;

    // The Ledger is shared across every teacher, so a ConfigID alone could
    // finalize another teacher's student's score. Same ownership rule as
    // _recordScrDecision_(); fails closed on a blank teacherEmail.
    const rowTeacher = String(data[i][LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase();
    if (!teacherEmail || rowTeacher !== String(teacherEmail).trim().toLowerCase()) {
      return { success: false, error: "This submission is not in your classes." };
    }

    const currentStatus = String(data[i][LEDGER.STATUS]).trim();
    if (currentStatus !== "PENDING_TEACHER_REVIEW") {
      return { success: false, error: "This submission is not awaiting review (current status: " + currentStatus + ")." };
    }

    const rowSuggested = data[i][LEDGER.TURN_IN_SUGGESTED_SCORE];
    const suggestedScore = (rowSuggested === "" || rowSuggested === undefined) ? null : Number(rowSuggested);
    if (decisionType === "CONFIRMED" && suggestedScore === null) {
      return { success: false, error: "No suggested score to confirm — use Override to assign a score directly." };
    }

    const finalScore = decisionType === "CONFIRMED" ? suggestedScore : Number(overrideScore);
    if (!Number.isInteger(finalScore) || finalScore < 1 || finalScore > 5) {
      return { success: false, error: "Score must be an integer from 1 to 5." };
    }

    const rowIndex = i + 1;
    sheet.getRange(rowIndex, LEDGER.STATUS + 1).setValue("COMPLIANT"); // terminal — same status every other health check/report already expects
    sheet.getRange(rowIndex, LEDGER.NOTES + 1).setValue(
      "Reviewed by teacher — final score " + finalScore + "/5 (" + decisionType.toLowerCase() + ")."
    );
    sheet.getRange(rowIndex, LEDGER.TURN_IN_FINAL_SCORE + 1).setValue(finalScore);
    sheet.getRange(rowIndex, LEDGER.TURN_IN_SCORE_DECIDED_BY + 1).setValue(teacherEmail);
    sheet.getRange(rowIndex, LEDGER.TURN_IN_SCORE_DECIDED_AT + 1).setValue(new Date());
    SpreadsheetApp.flush();

    return { success: true, finalScore: finalScore };
  }

  return { success: false, error: "No ledger row found with ConfigID: " + configId };
}

// Exposed entry points, called via google.script.run from the Pending
// Review modal's client JS below. Both gate on _isAuthorizedTeacher_ before
// touching anything, matching every other exported function in this file
// (see the ACCESS MODEL note at the top of this file).
function teacherConfirmTurnInScore(configId) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _recordTurnInDecision_(cfg, configId, cfg.teacherEmail, null, "CONFIRMED");
}

function teacherOverrideTurnInScore(configId, score) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _recordTurnInDecision_(cfg, configId, cfg.teacherEmail, score, "OVERRIDDEN");
}

// ── SCR REVIEW (Open Items #4 — Module 5 competency SCR confirm/override) ──
// The teacher's own confirm/override decision on an AI-suggested Module 5
// competency rating (SCRSuggestions, computed weekly by
// 30_SCRSuggestionEngine.js's runWeeklySCRSuggestionUpdate_()). Until this,
// nothing anywhere actually called that file's confirm/override/query
// functions except tests (deleted 2026-11-07), because they lived in
// cas-ccps:central-ledger — a DIFFERENT Apps Script
// project from this standalone dashboard (cas-ccps:teacher-dashboard, see
// tools/gas-lint/project-map.json) — with no shared runtime. This section
// reimplements the same confirm/override/query logic natively in THIS
// project, following that file's locked rules exactly (freeze on decision,
// reject re-deciding, ratings 1 and 5 reserved for a teacher's own
// judgment, never auto-suggested) — the same relationship
// teacherConfirmTurnInScore/teacherOverrideTurnInScore above already have
// to 04_Form2_TurnInGate.js's turn-in gate logic, one project over.
//
// DASHBOARD_SCRS below is a deliberate, minimal duplicate of
// 30_SCRSuggestionEngine.js's own SCRS column map. That file's header
// explains why SCRS never moved to 00_SharedConfig.js (unlike SCRDL,
// which did): nothing outside central-ledger had any business reading
// SCRSuggestions, an AI-values-nobody-has-acted-on-yet tab, so a
// dashboard-project file referencing it would fail loudly at load rather
// than quietly render an unreviewed rating. This dashboard is now a real,
// teacher-scoped consumer of that data, so it needs its own copy of the
// schema — named distinctly (not "SCRS") so nobody mistakes this for a
// shared constant if the two files are ever read side by side. Column
// order must stay byte-identical to Script 30's SCRS — covered by
// tests/cas-ccps/teacher-dashboard-scr-review.test.js's schema-compat check.
const DASHBOARD_SCRS = {
  STUDENT_EMAIL: 0,
  COMPETENCY_ID: 1,
  SUGGESTED_RATING: 2,
  MET_COUNT: 3,
  NOT_MET_COUNT: 4,
  PARTIAL_COUNT: 5,
  STATUS: 6,
  LAST_COMPUTED_AT: 7,
  CONFIRMED_RATING: 8,
  CONFIRMED_AT: 9,
  CONFIRMED_BY: 10,
};

// ---------------------------------------------------------------------------
// getScrReviewQueue — called client-side via google.script.run. Returns
// every NON-FROZEN SCRSuggestions row (status SUGGESTED or
// INSUFFICIENT_EVIDENCE) for students on THIS teacher's own roster.
// Unlike 30_SCRSuggestionEngine.js's old getSCRDashboardData_() (deleted
// 2026-11-07: uncalled, and despite its comment it never scoped to "the
// calling teacher's students"), this one actually
// joins against the Ledger via _getRosterForEmail_ (already used above for
// the leader-hub API) to enforce that scoping for real.
// ---------------------------------------------------------------------------
// _scrPairKey_/_scrOwnership_/_scrIsMine_ live in 00_SharedConfig.js, so
// 30_SCRSuggestionEngine.js's writers in the central-ledger project apply
// the same rule 3 check.

function getScrReviewQueue() {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };

  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const suggestionsSheet = ss.getSheetByName(TABS.scrSuggestions);
  if (!suggestionsSheet) return { success: true, suggestions: [] };

  const roster   = _getRosterForEmail_(cfg, cfg.teacherEmail);
  const myEmails = new Set(roster.map(function (s) { return s.email.toLowerCase(); }));
  const nameByEmail = {};
  roster.forEach(function (s) { nameByEmail[s.email.toLowerCase()] = s.name; });

  const registrySheet = ss.getSheetByName(cfg.tabs.competencyRegistry);
  const compTextMap   = getCompetencyTextMap_(registrySheet);

  const ownership = _scrOwnership_(cfg, cfg.teacherEmail);
  const data = suggestionsSheet.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row   = data[i];
    const email = String(row[DASHBOARD_SCRS.STUDENT_EMAIL]).trim();
    const compId = String(row[DASHBOARD_SCRS.COMPETENCY_ID]).trim();
    // Only ratings built from this teacher's own assignments (rule 3).
    if (!_scrIsMine_(ownership, myEmails, email, compId)) continue;

    const status = String(row[DASHBOARD_SCRS.STATUS]).trim();
    if (status !== "SUGGESTED" && status !== "INSUFFICIENT_EVIDENCE") continue;

    results.push({
      studentEmail:    email,
      studentName:     nameByEmail[email.toLowerCase()] || email,
      competencyId:    compId,
      competencyText:  compTextMap[compId] || "(text not found in registry)",
      suggestedRating: row[DASHBOARD_SCRS.SUGGESTED_RATING] === "" ? null : Number(row[DASHBOARD_SCRS.SUGGESTED_RATING]),
      metCount:        Number(row[DASHBOARD_SCRS.MET_COUNT]) || 0,
      notMetCount:     Number(row[DASHBOARD_SCRS.NOT_MET_COUNT]) || 0,
      partialCount:    Number(row[DASHBOARD_SCRS.PARTIAL_COUNT]) || 0,
      status:          status,
    });
  }

  results.sort(function (a, b) {
    return a.studentName.localeCompare(b.studentName) || a.competencyId.localeCompare(b.competencyId);
  });

  // Re-ratings ready to confirm (the SCR retry, D15): eligible, and the
  // evidence gives a better rating. Fails alone; the queue still shows.
  let retries = [];
  try {
    retries = _tdRetryRows_(cfg, ss).filter(function (r) { return r.eligible && r.improved; });
  } catch (e) {
    Logger.log("[S07] getScrReviewQueue retries failed: " + e.message);
  }
  return { success: true, suggestions: results, retries: retries, generatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// _generateScrDecisionId_ — same "SCD-" + yyyyMMdd + "-" + 4-hex-char shape
// SCRDecisionLog has always used. 30_SCRSuggestionEngine.js's own
// generateDecisionId_() went with its uncalled confirm/override (2026-11-07),
// so the dashboard is the only writer that mints one now.
// ---------------------------------------------------------------------------
function _generateScrDecisionId_() {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  const hex  = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return "SCD-" + yyyy + mm + dd + "-" + hex;
}

// ---------------------------------------------------------------------------
// _recordScrDecision_ — shared logic for confirm and override (freeze on
// decision, reject re-deciding, evidence-snapshot denormalization), plus a
// real roster-ownership check, since this project is reachable by exactly
// one teacher's deployment but reads a Ledger shared across every teacher.
// (30_SCRSuggestionEngine.js's uncalled recordDecision_() was deleted
// 2026-11-07; this is the only SCR confirm/override.)
// ---------------------------------------------------------------------------
function _recordScrDecision_(cfg, studentEmail, competencyId, overrideRating, decisionType) {
  const roster   = _getRosterForEmail_(cfg, cfg.teacherEmail);
  const myEmails = new Set(roster.map(function (s) { return s.email.toLowerCase(); }));
  if (!myEmails.has(String(studentEmail || "").toLowerCase())) {
    return { success: false, error: "This student is not on your roster." };
  }
  // Rule 3: only the teacher whose assignments produced this competency's
  // evidence rates it, not every teacher who has the student.
  if (!_scrIsMine_(_scrOwnership_(cfg, cfg.teacherEmail), myEmails, studentEmail, competencyId)) {
    return { success: false, error: "This competency's evidence comes from another teacher's assignments." };
  }

  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const suggestionsSheet = ss.getSheetByName(TABS.scrSuggestions);
  const decisionLogSheet = ss.getSheetByName(TABS.scrDecisionLog);
  if (!suggestionsSheet || !decisionLogSheet) {
    return { success: false, error: "SCRSuggestions or SCRDecisionLog tab not found." };
  }

  const data = suggestionsSheet.getDataRange().getValues();
  let rowIndex = -1;
  let row = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][DASHBOARD_SCRS.STUDENT_EMAIL]).trim().toLowerCase() === studentEmail.toLowerCase() &&
        String(data[i][DASHBOARD_SCRS.COMPETENCY_ID]).trim() === competencyId) {
      rowIndex = i + 1;
      row = data[i];
      break;
    }
  }
  if (!row) {
    return { success: false, error: "No suggestion row found for " + studentEmail + " / " + competencyId + "." };
  }

  const currentStatus = String(row[DASHBOARD_SCRS.STATUS]).trim();
  if (currentStatus === "CONFIRMED" || currentStatus === "OVERRIDDEN") {
    return { success: false, error: "This competency has already been decided (" + currentStatus + ")." };
  }

  const suggestedRating = row[DASHBOARD_SCRS.SUGGESTED_RATING] === "" ? null : Number(row[DASHBOARD_SCRS.SUGGESTED_RATING]);

  if (decisionType === "CONFIRMED" && suggestedRating === null) {
    return { success: false, error: "Cannot confirm — there is no suggestion to confirm (status is INSUFFICIENT_EVIDENCE). Use an override instead." };
  }

  const finalRating = decisionType === "CONFIRMED" ? suggestedRating : Number(overrideRating);
  if (decisionType === "OVERRIDDEN" && (!Number.isInteger(finalRating) || finalRating < 1 || finalRating > 5)) {
    return { success: false, error: "Rating must be an integer from 1 to 5." };
  }

  const now = new Date();
  suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.STATUS + 1).setValue(decisionType);
  suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.CONFIRMED_RATING + 1).setValue(finalRating);
  suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.CONFIRMED_AT + 1).setValue(now);
  suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.CONFIRMED_BY + 1).setValue(cfg.teacherEmail);

  const evidenceSnapshot = "MET:" + row[DASHBOARD_SCRS.MET_COUNT] +
    " NOT_MET:" + row[DASHBOARD_SCRS.NOT_MET_COUNT] +
    " PARTIALLY_MET:" + row[DASHBOARD_SCRS.PARTIAL_COUNT];

  decisionLogSheet.appendRow([
    _generateScrDecisionId_(),
    studentEmail,
    competencyId,
    suggestedRating === null ? "" : suggestedRating,
    finalRating,
    decisionType,
    now,
    cfg.teacherEmail,
    evidenceSnapshot,
    "", // archive_status — blank until _archiveExpiredScrDecisions_() (Script 30) ages it out
  ]);

  SpreadsheetApp.flush();
  Logger.log("[S07] SCR decision recorded — " + decisionType + " | " + competencyId +
    " | final rating: " + finalRating);

  return { success: true, finalRating: finalRating, decisionType: decisionType };
}

// Exposed entry points, called via google.script.run from the SCR Review
// modal's client JS below. Both gate on _isAuthorizedTeacher_ first,
// matching every other exported function in this file (see the ACCESS
// MODEL note at the top of this file).
function teacherConfirmScrRating(studentEmail, competencyId) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _recordScrDecision_(cfg, studentEmail, competencyId, null, "CONFIRMED");
}

function teacherOverrideScrRating(studentEmail, competencyId, rating) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _recordScrDecision_(cfg, studentEmail, competencyId, rating, "OVERRIDDEN");
}

// ── Competencies no lesson measures (Q26, the operator, 2026-11-20) ──────────
// Student organization (DECA) and work-based learning (00's
// COMPETENCIES_OUTSIDE_LESSONS): no lesson names them, so there is no
// evidence and no suggestion to confirm. The teacher rates them directly on
// the student's page, 1 to 5, and may change the rating later: each rating
// is a new SCRDecisionLog row (OVERRIDDEN, snapshot "OUTSIDE_LESSONS: DECA"
// or "…: WBL"; the newest counts, readLatestScrRatings_), and the
// SCRSuggestions row is created or updated as decided, so the weekly
// suggestion run leaves it alone. Only a student on this teacher's roster,
// in a course the competency belongs to.
function teacherRateOutsideCompetency(studentEmail, competencyId, rating) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _recordOutsideRating_(cfg, studentEmail, competencyId, rating);
}

function _recordOutsideRating_(cfg, studentEmail, competencyId, rating) {
  const email = String(studentEmail || "").trim().toLowerCase();
  const compId = String(competencyId || "").trim();
  const r = Number(rating);
  const kind = competencyOutsideLessons_(compId);
  if (!kind) return { success: false, error: "Only a competency no lesson measures is rated here." };
  if (!Number.isInteger(r) || r < 1 || r > 5) return { success: false, error: "Rating must be an integer from 1 to 5." };
  const roster = _getRosterForEmail_(cfg, cfg.teacherEmail);
  if (!roster.some(function (s) { return String(s.email || "").trim().toLowerCase() === email; })) {
    return { success: false, error: "This student is not on your roster." };
  }
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const courses = _tdStudentCourses_(ss, cfg)[email] || [];
  if (courses.indexOf(compId.split("-")[0]) === -1) {
    return { success: false, error: "This student isn't in your " + compId.split("-")[0] + " class this year." };
  }
  const suggestionsSheet = ss.getSheetByName(TABS.scrSuggestions);
  const decisionLogSheet = ss.getSheetByName(TABS.scrDecisionLog);
  if (!suggestionsSheet || !decisionLogSheet) {
    return { success: false, error: "SCRSuggestions or SCRDecisionLog tab not found." };
  }
  const now = new Date();
  const data = suggestionsSheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][DASHBOARD_SCRS.STUDENT_EMAIL]).trim().toLowerCase() === email &&
        String(data[i][DASHBOARD_SCRS.COMPETENCY_ID]).trim() === compId) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) {
    const row = new Array(DASHBOARD_SCRS.CONFIRMED_BY + 1).fill("");
    row[DASHBOARD_SCRS.STUDENT_EMAIL] = email;
    row[DASHBOARD_SCRS.COMPETENCY_ID] = compId;
    row[DASHBOARD_SCRS.MET_COUNT] = 0;
    row[DASHBOARD_SCRS.NOT_MET_COUNT] = 0;
    row[DASHBOARD_SCRS.PARTIAL_COUNT] = 0;
    row[DASHBOARD_SCRS.STATUS] = "OVERRIDDEN";
    row[DASHBOARD_SCRS.LAST_COMPUTED_AT] = now;
    row[DASHBOARD_SCRS.CONFIRMED_RATING] = r;
    row[DASHBOARD_SCRS.CONFIRMED_AT] = now;
    row[DASHBOARD_SCRS.CONFIRMED_BY] = cfg.teacherEmail;
    suggestionsSheet.appendRow(row);
  } else {
    suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.STATUS + 1).setValue("OVERRIDDEN");
    suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.CONFIRMED_RATING + 1).setValue(r);
    suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.CONFIRMED_AT + 1).setValue(now);
    suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.CONFIRMED_BY + 1).setValue(cfg.teacherEmail);
  }
  decisionLogSheet.appendRow([_generateScrDecisionId_(), email, compId, "", r, "OVERRIDDEN", now,
    cfg.teacherEmail, "OUTSIDE_LESSONS: " + kind, ""]);
  SpreadsheetApp.flush();
  return { success: true, rating: r };
}

// The student's competencies no lesson measures, in this teacher's courses
// for them: [{ id, text, kind, label, rating }] (rating null until rated).
function _tdOutsideCompetencies_(ss, cfg, email, courses) {
  const texts = getCompetencyTextMap_(ss.getSheetByName(TABS.competencyRegistry));
  const rated = {};
  (readLatestScrRatings_(ss, cfg, cfg.teacherEmail).get(email) || []).forEach(function (x) { rated[x.competencyId] = Number(x.rating); });
  return Object.keys(COMPETENCIES_OUTSIDE_LESSONS).filter(function (id) {
    return courses.indexOf(id.split("-")[0]) !== -1;
  }).map(function (id) {
    const kind = COMPETENCIES_OUTSIDE_LESSONS[id];
    return { id: id, text: texts[id] || "", kind: kind, label: OUTSIDE_LESSONS_LABEL[kind], rating: rated[id] || null };
  });
}

// ── The SCR retry (D15, 2026-11-01) ──────────────────────────────────────────
// A competency this teacher rated 3 or 4 can be re-rated once the student's
// evidence since unlocks it (00's scrRetryStatus_, the rule 30b documents).
// The student's page lists each one with what it needs; SCR Review lists the
// ready ones; teacherConfirmScrRetry records a re-rating. Only ratings built
// from this teacher's assignments (rule 3), as everywhere else here.

// [{ studentEmail, studentName, competencyId, competencyText, currentRating,
// eligible, improved, newRating, reason, needMet, needSecondary,
// needPrimaryMet, secondaryIds }] for this teacher's decided ratings of 3
// or 4; onlyEmail narrows to one student.
function _tdRetryRows_(cfg, ss, onlyEmail) {
  const suggestionsSheet = ss.getSheetByName(TABS.scrSuggestions);
  if (!suggestionsSheet || suggestionsSheet.getLastRow() < 2) return [];
  const only = onlyEmail ? String(onlyEmail).trim().toLowerCase() : "";
  const roster = _getRosterForEmail_(cfg, cfg.teacherEmail);
  const myEmails = new Set(roster.map(function (s) { return s.email.toLowerCase(); }));
  const nameByEmail = {};
  roster.forEach(function (s) { nameByEmail[s.email.toLowerCase()] = s.name; });
  const ownership = _scrOwnership_(cfg, cfg.teacherEmail);
  const pairs = [];
  suggestionsSheet.getDataRange().getValues().slice(1).forEach(function (row) {
    const email = String(row[DASHBOARD_SCRS.STUDENT_EMAIL]).trim();
    const compId = String(row[DASHBOARD_SCRS.COMPETENCY_ID]).trim();
    if (!email || !compId || (only && email.toLowerCase() !== only)) return;
    const status = String(row[DASHBOARD_SCRS.STATUS]).trim();
    if (status !== "CONFIRMED" && status !== "OVERRIDDEN") return;
    const rating = Number(row[DASHBOARD_SCRS.CONFIRMED_RATING]);
    if (rating !== 3 && rating !== 4) return;
    if (!myEmails.has(email.toLowerCase()) || !_scrIsMine_(ownership, myEmails, email, compId)) return;
    pairs.push({ email: email, compId: compId, rating: rating });
  });
  if (!pairs.length) return [];
  const ctx = scrRetryContext_(ss, cfg, only);
  const texts = getCompetencyTextMap_(ss.getSheetByName(cfg.tabs.competencyRegistry));
  return pairs.map(function (p) {
    const st = scrRetryStatus_(ctx, p.email, p.compId, p.rating);
    return {
      studentEmail: p.email, studentName: nameByEmail[p.email.toLowerCase()] || p.email,
      competencyId: p.compId, competencyText: texts[p.compId] || "",
      currentRating: p.rating, eligible: st.eligible, improved: st.improved, newRating: st.newRating,
      reason: st.reason, needMet: st.needMet, needSecondary: st.needSecondary, needPrimaryMet: st.needPrimaryMet,
      secondaryIds: st.secondaryIds,
    };
  }).sort(function (a, b) {
    return a.studentName.localeCompare(b.studentName) || a.competencyId.localeCompare(b.competencyId);
  });
}

// The re-rating, from the student's page or SCR Review. Checked again under
// the script lock: the student on this teacher's roster, the rating theirs
// (rule 3), still 3 or 4, eligible, and the evidence's rating better. Then
// SCRSuggestions' current rating is updated and a RETRY_IMPROVED row
// appended to SCRDecisionLog; the original decision row stays.
function teacherConfirmScrRetry(studentEmail, competencyId) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  const email = String(studentEmail || "").trim();
  const compId = String(competencyId || "").trim();
  if (!email || !compId) return { success: false, error: "No student or competency given." };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "Another change is being saved. Try again in a moment." };
  try {
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const row = _tdRetryRows_(cfg, ss, email).filter(function (r) { return r.competencyId === compId; })[0];
    if (!row) return { success: false, error: "No rating of 3 or 4 of yours for this student and competency." };
    if (!row.eligible) return { success: false, error: row.reason };
    if (!row.improved) return { success: false, error: "The evidence does not give a better rating than " + row.currentRating + " yet." };
    const suggestionsSheet = ss.getSheetByName(TABS.scrSuggestions);
    const decisionLogSheet = ss.getSheetByName(TABS.scrDecisionLog);
    if (!decisionLogSheet) return { success: false, error: "SCRDecisionLog tab not found." };
    const data = suggestionsSheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][DASHBOARD_SCRS.STUDENT_EMAIL]).trim().toLowerCase() === email.toLowerCase() &&
          String(data[i][DASHBOARD_SCRS.COMPETENCY_ID]).trim() === compId) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) return { success: false, error: "SCRSuggestions row not found." };
    const now = new Date();
    suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.CONFIRMED_RATING + 1).setValue(row.newRating);
    suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.CONFIRMED_AT + 1).setValue(now);
    suggestionsSheet.getRange(rowIndex, DASHBOARD_SCRS.CONFIRMED_BY + 1).setValue(cfg.teacherEmail);
    const ctx = scrRetryContext_(ss, cfg, email);
    scrAppendRetryDecision_(decisionLogSheet, _generateScrDecisionId_(), email, compId,
      scrRetryStatus_(ctx, email, compId, row.currentRating), cfg.teacherEmail, now);
    SpreadsheetApp.flush();
    Logger.log("[S07] SCR retry recorded -- " + compId + " | " + row.currentRating + " -> " + row.newRating);
    return { success: true, previousRating: row.currentRating, newRating: row.newRating };
  } finally {
    lock.releaseLock();
  }
}

// ── Weekly parent reports (36_WeeklyParentReport.js) ────────────────────────
// Two more google.script.run entry points, same _isAuthorizedTeacher_ gate as
// everything else exported from this file.
//
// D1 (2026-10-23): KOS writes each report; the teacher copies it here and
// emails it from their own account to the guardians they know. Nothing in
// this file sends it. teacherCopiedParentReport() records that a report was
// copied (ParentReportLog), so the panel shows which ones went home.

function getWeeklyParentReports() {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  try {
    const generated = generateWeeklyParentReports();
    return {
      success: true,
      weekStart: generated.weekStart ? Utilities.formatDate(
        generated.weekStart, Session.getScriptTimeZone(), "MMMM d, yyyy") : "",
      weekEnd: generated.weekEnd ? Utilities.formatDate(
        generated.weekEnd, Session.getScriptTimeZone(), "MMMM d, yyyy") : "",
      excludedStudentCount: generated.excludedStudentCount,
      reports: (function () {
        const copied = _parentReportsCopiedThisWeek_(cfg, generated.weekStart);
        return generated.reports.map(function (r) { return _tdParentReportView_(r, copied); });
      })(),
    };
  } catch (e) {
    Logger.log("[S07] getWeeklyParentReports failed: " + e.message);
    return { success: false, error: e.message };
  }
}

function _tdParentReportView_(r, copied) {
  const at = copied[String(r.studentEmail).toLowerCase()];
  return {
    studentEmail: r.studentEmail,
    studentName: r.studentName,
    confirmedCount: r.confirmedCount,
    pendingCount: r.pendingCount,
    itemCount: r.thisWeek.length,
    openCount: r.thisWeek.filter(function (i) { return i.open; }).length,
    progressCount: r.progress.length,
    // The exact text the teacher copies, so they review what the
    // family will read rather than a summary of it.
    subject: weeklyParentReportSubject_(r),
    preview: renderWeeklyParentReportText_(r),
    copiedAt: at ? Utilities.formatDate(at, Session.getScriptTimeZone(), "MMM d, h:mm a") : "",
  };
}

// One student's page (2026-10-27, archive/2026-27-Q1/meta/SPRINT_DASHBOARD_2026-11.md, PR 2):
// this week's parent report and the student's context doc (29) by week,
// newest first. The same teacher gate and roster scope as the panels it
// narrows: the report comes only for this teacher's students (36), the doc
// only through getAllStudentDocsForTeacher_ (29). Each half fails alone.
function getStudentDetail(studentEmail) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  const email = String(studentEmail || "").trim().toLowerCase();
  if (!email) return { success: false, error: "No student chosen." };
  const tz = Session.getScriptTimeZone();
  const out = { success: true, studentEmail: email, report: null, context: null, competencies: [], pastReports: [], retries: [] };
  try {
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const courses = _tdStudentCourses_(ss, cfg)[email] || [];
    out.competencies = competencyCompletionFor_(
      readLatestScrRatings_(ss, cfg, cfg.teacherEmail).get(email), competencyCourseTotals_(ss, cfg), courses);
    out.outside = _tdOutsideCompetencies_(ss, cfg, email, courses);
  } catch (e) {
    Logger.log("[S07] getStudentDetail competencies failed: " + e.message);
  }
  // This teacher's ratings of 3 or 4 for the student and where each
  // stands for a retry (D15).
  try {
    out.retries = _tdRetryRows_(cfg, SpreadsheetApp.openById(cfg.ledgerSsId), email);
    out.retryThresholds = scrRetryThresholds_();
  } catch (e) {
    Logger.log("[S07] getStudentDetail retries failed: " + e.message);
    out.retriesError = "Re-ratings could not be checked: " + e.message;
  }
  try {
    const generated = generateWeeklyParentReports(undefined, email);
    if (generated.weekStart) {
      out.weekStart = Utilities.formatDate(generated.weekStart, tz, "MMMM d, yyyy");
      out.weekEnd = Utilities.formatDate(generated.weekEnd, tz, "MMMM d, yyyy");
    }
    const r = generated.reports[0];
    if (r) out.report = _tdParentReportView_(r, _parentReportsCopiedThisWeek_(cfg, generated.weekStart));
  } catch (e) {
    Logger.log("[S07] getStudentDetail report failed: " + e.message);
    out.reportError = "The parent report could not be built: " + e.message;
  }
  // Past weeks' reports, as copied (36 keeps the text since 2026-10-28).
  try {
    const fmt = function (d) { return d instanceof Date ? Utilities.formatDate(d, tz, "MMMM d, yyyy") : ""; };
    const thisWeek = _weekWindow_(new Date()).start;
    out.pastReports = _parentReportsPastFor_(cfg, email, thisWeek).map(function (p) {
      return { weekStart: fmt(p.weekStart), weekEnd: fmt(p.weekEnd),
        copiedAt: p.copiedAt instanceof Date ? Utilities.formatDate(p.copiedAt, tz, "MMM d, h:mm a") : "",
        subject: p.subject, text: p.text };
    });
  } catch (e) {
    Logger.log("[S07] getStudentDetail past reports failed: " + e.message);
    out.pastReports = [];
  }
  try {
    const doc = getAllStudentDocsForTeacher_(cfg.teacherEmail)
      .filter(function (d) { return d.email.toLowerCase() === email; })[0];
    const ids = doc ? getStudentDocForViewer_(email) : null;
    if (doc && ids && ids.docId) {
      out.context = {
        docUrl: doc.docUrl,
        lastUpdatedAt: doc.lastUpdatedAt ? formatDate_(doc.lastUpdatedAt) : "Never",
        weeks: _tdContextWeeks_(ids.docId),
      };
    }
  } catch (e) {
    Logger.log("[S07] getStudentDetail context failed: " + e.message);
    out.contextError = "The Student Context doc could not be read: " + e.message;
  }
  return out;
}

// email (lower case) -> this teacher's course codes for that student this
// school year, from the Ledger rows (ledgerRowCourseCode_, 00).
function _tdStudentCourses_(ss, cfg) {
  const out = {};
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const teacher = String(cfg.teacherEmail || "").trim().toLowerCase();
  const year = _currentSchoolYear_();
  sheet.getRange(2, 1, sheet.getLastRow() - 1, LEDGER_COL_COUNT).getValues().forEach(function (row) {
    const email = String(row[LEDGER.GOOGLE_ID] || "").trim().toLowerCase();
    if (!email || String(row[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() !== teacher) return;
    if (!_isCurrentSchoolYearRow_(row, year)) return;
    const code = ledgerRowCourseCode_(row);
    if (!code) return;
    const list = out[email] = out[email] || [];
    if (list.indexOf(code) === -1) list.push(code);
  });
  Object.keys(out).forEach(function (k) { out[k].sort(); });
  return out;
}

// A Student Context doc's weeks, newest first. 13's _dashContextWeeks_ is
// its twin for the Student Dashboard (00 can't hold it: every project loads
// 00, and not all of them may open Docs); a test keeps the two the same. each "Week of <date>" Heading 2
// (29's appendWeeklySection_) starts one; its Heading 3 sections and lines
// follow as items. Anything before the first week is left out. bookmark:
// the week's bookmark id, for a link straight to it ("" for none).
const TD_CONTEXT_MAX_WEEKS = 60;
function _tdContextWeeks_(docId) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  // Each week's bookmark (29), by its heading's text: the link to that week.
  const marks = {};
  doc.getBookmarks().forEach(function (b) {
    let el = b.getPosition().getElement();
    if (el.getType() === DocumentApp.ElementType.TEXT) el = el.getParent();
    if (el.getType() !== DocumentApp.ElementType.PARAGRAPH) return;
    const label = String(el.asParagraph().getText() || "").trim();
    if (label.indexOf("Week of ") === 0 && !marks[label]) marks[label] = b.getId();
  });
  const weeks = [];
  let week = null;
  for (let i = 0; i < body.getNumChildren(); i++) {
    const el = body.getChild(i);
    const type = el.getType();
    let p = null;
    if (type === DocumentApp.ElementType.PARAGRAPH) p = el.asParagraph();
    else if (type === DocumentApp.ElementType.LIST_ITEM) p = el.asListItem();
    if (!p) continue;
    const text = String(p.getText() || "").trim();
    const heading = p.getHeading();
    if (heading === DocumentApp.ParagraphHeading.HEADING2 && text.indexOf("Week of ") === 0) {
      week = { label: text, bookmark: marks[text] || "", items: [] };
      weeks.push(week);
      continue;
    }
    if (!week || !text) continue;
    // A list item (weeks from 2026-11-19 on: an assignment, a part nested
    // under its lesson) carries its level; a paragraph has none.
    const item = { text: text, heading: heading === DocumentApp.ParagraphHeading.HEADING3 };
    if (type === DocumentApp.ElementType.LIST_ITEM) item.level = p.getNestingLevel ? p.getNestingLevel() : 0;
    week.items.push(item);
  }
  return weeks.reverse().slice(0, TD_CONTEXT_MAX_WEEKS);
}

// subject and text: what the page put on the clipboard, kept in
// ParentReportLog so the student's page can show it in later weeks.
function teacherCopiedParentReport(studentEmail, subject, text) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return recordParentReportCopied(studentEmail, undefined, { subject: subject, text: text });
}

// ── M2 ──────────────────────────────────────────────────────────────────────
// getCompetencies — discovers all courses for this teacher from the registry,
// returns competencies grouped by course, sorted by task number within each.
//
// Course discovery: a row belongs to this teacher if:
//   (a) teacher_email matches this teacher's email, OR
//   (b) teacher_email is blank (shared row available to all teachers)
// All unique subject values across matching rows become course tabs.
//
// Returns:
//   { courses: [{ code, name, competencies: [{ id, taskNum, text, strand }] }] }
//   courses sorted by code (8175 before 8177 etc.)
//   competencies within each course sorted by taskNum ascending
// ── M2 ──────────────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------
// ⚙ Settings (2026-10-27, archive/2026-27-Q1/meta/SPRINT_DASHBOARD_2026-11.md, PR 3): the
// features turned on per course, and the marking period end dates. Each is
// one row in the Central Ledger's _CONFIG tab (DASHBOARD_SETTING_KEYS, 00),
// which reaches the Central Ledger and the Student Dashboard within the
// shared-config cache time and this project at once. A switch's value is
// "off", "all", or the courses it is on for ("8175" or "8175,8177" once a
// third course exists); every known course on is written "all", which is
// what course-wide actions (the archetype lock's email) need. A Script
// Property of the same name in a project overrides the tab there: this
// panel says when this project has one, and the Central Ledger's nightly
// signal says when it does (34c). Each change is a SettingsLog row.
// Replaced 💬 Feedback (FEEDBACK_AS_COMMENT only).
// ---------------------------------------------------------------------------
const TD_SETTINGS = [
  { key: "FEEDBACK_AS_COMMENT", label: "Feedback as a comment",
    on: "A checked submission's feedback goes on the student's document as a comment. New documents are made without a feedback section.",
    off: "Feedback goes into the document, in its feedback section." },
  { key: "WARMUP_TEXT_BOX", label: "Warm-ups on the Student Dashboard",
    on: "Students answer warm-ups in a text box on their dashboard.",
    off: "Each warm-up is a Google Doc in the student's folder." },
  { key: "ROLLOUT_AUTO_APPLY", label: "Nightly lesson rollout",
    on: "Each night the rollout makes the next lesson's student documents and shares them the night before the lesson starts.",
    off: "The rollout only records what it would do (📅 Lessons shows each run). Documents are made by hand." },
  { key: "REFLECTION_ON_SUBMIT", label: "Reflection on Submit",
    on: "Submit for Feedback asks one or two short questions about how the student worked. The answers go with the work to be checked.",
    off: "Submit for Feedback sends the work straight away." },
  { key: "PIVOT_ARCHETYPE_LOCK", label: "Warm-up style lock (research)",
    on: "Once the system is confident which warm-up style works for a student, it keeps using it. The email about students reaching that point goes out only when every course is on.",
    off: "The warm-up style keeps being chosen fresh each time." },
  { key: "PARENT_REPORT_PREP", label: "Parent reports ready on Fridays",
    on: "Each Friday at 5 a.m. the week's parent reports for this course's students are logged in ParentReportLog as ready, not yet copied. Nothing is sent.",
    off: "A report is built when you open ✉ Parent Reports, and only the ones you copy are logged." },
];
const TD_SETTINGS_LOG_TAB = "SettingsLog";
const TD_SETTINGS_LOG_HEADERS = ["Timestamp", "ChangedBy", "Setting", "From", "To"];

function getSettings() {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _tdSettings_(cfg);
}

// A change to a shared setting reads the _CONFIG tab and writes it back:
// two saves at once (two tabs, or two teachers on one Ledger) could each
// write over the other's change. The read and the write run under the
// script lock, from the tab itself rather than a cached copy (Docket IV,
// Low). These settings are per course, so they apply to every teacher of
// that course on the Ledger. Returns an error result, or null when done.
function _tdWithSettingsLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "Settings are being saved elsewhere. Try again in a moment." };
  try {
    fn();
    return null;
  } finally {
    lock.releaseLock();
  }
}

// A setting's next stored value: `raw` with each course in `changes`
// ({ code: true|false }) turned on or off. Courses on now are the known
// ones the value turns on, plus any course code it lists that has no
// assignments yet (kept, not dropped). "all" when every known course is on
// and nothing else is listed; "off" when none is.
function _tdSettingValue_(raw, courses, changes) {
  const listed = raw.toLowerCase() === "all" || raw.toLowerCase() === "off" ? [] :
    raw.split(",").map(function (c) { return c.trim(); }).filter(Boolean);
  const onNow = courses.filter(function (c) { return _pivotValueOn_(raw, c); });
  listed.forEach(function (c) { if (onNow.indexOf(c) === -1) onNow.push(c); });
  let next = onNow;
  Object.keys(changes).forEach(function (code) {
    next = next.filter(function (c) { return c !== code; });
    if (changes[code]) next.push(code);
  });
  next.sort();
  return !next.length ? "off"
    : courses.every(function (c) { return next.indexOf(c) !== -1; }) && next.length === courses.length ? "all"
    : next.join(",");
}

// The panel's one Save (2026-10-27): every switch changed since the panel
// opened ([{ key, code, on }]), the marking period dates and the activity
// and delay days ([{ date, schedule }]; each null when unchanged).
// Everything is checked before anything is written, so an unknown course
// or a broken date saves nothing. One _CONFIG row and one SettingsLog row
// per setting, however many of its courses changed.
function saveSettings(changes, ends, days) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  const courses = _tdKnownCourses_(cfg);
  const byKey = {};
  const list = changes || [];
  for (let i = 0; i < list.length; i++) {
    const key = String((list[i] && list[i].key) || "");
    const code = String((list[i] && list[i].code) || "").trim();
    if (!TD_SETTINGS.some(function (d) { return d.key === key; })) return { success: false, error: "Unknown setting: " + key };
    if (courses.indexOf(code) === -1) return { success: false, error: "Unknown course: " + code };
    (byKey[key] = byKey[key] || {})[code] = !!list[i].on;
  }
  let mp = null;
  if (ends) {
    mp = _tdMarkingPeriodValue_(ends);
    if (mp.error) return { success: false, error: mp.error };
  }
  let sd = null;
  if (days) {
    sd = _tdScheduleDaysValue_(days);
    if (sd.error) return { success: false, error: sd.error };
  }
  const locked = _tdWithSettingsLock_(function () {
    const resolved = freshConfigValues_();
    Object.keys(byKey).forEach(function (key) {
      const raw = String(resolved[key] || "").trim();
      const value = _tdSettingValue_(raw, courses, byKey[key]);
      _tdWriteSetting_(cfg, key, raw || "off", value);
      if (key === "PARENT_REPORT_PREP") _tdSyncParentReportPrepTrigger_(value !== "off");
    });
    if (mp) {
      const raw = String(resolved.MARKING_PERIOD_ENDS || "").trim();
      _tdWriteSetting_(cfg, "MARKING_PERIOD_ENDS", raw || "(the district calendar)", mp.value);
    }
    if (sd) {
      const raw = String(resolved.SCHEDULE_DAYS || "").trim();
      _tdWriteSetting_(cfg, "SCHEDULE_DAYS", raw || "(none)", sd.value || "(none)");
    }
  });
  if (locked) return locked;
  return _tdSettings_(cfg);
}

// The schedules a day can be set to in ⚙ Settings, in the order offered:
// these first when the school's bell schedule has them, then its others.
const TD_SCHEDULE_DAY_ORDER = ["ACTIVITY", "DELAY", "EARLY_RELEASE", "A", "B"];
function _tdScheduleDayChoices_() {
  const names = Object.keys(bellClassMinutes_());
  return TD_SCHEDULE_DAY_ORDER.filter(function (n) { return names.indexOf(n) !== -1; })
    .concat(names.filter(function (n) { return TD_SCHEDULE_DAY_ORDER.indexOf(n) === -1; }));
}

// [{ date, schedule }] -> { value: "2026-11-05=DELAY,..." } (dates in
// order; "(none)" is stored as no days) or { error }.
function _tdScheduleDaysValue_(days) {
  const seen = {};
  const list = [];
  for (let i = 0; i < days.length; i++) {
    const date = String((days[i] && days[i].date) || "").trim();
    const sched = String((days[i] && days[i].schedule) || "").trim().toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Each activity or delay day needs a whole date (yyyy-mm-dd)." };
    if (_tdScheduleDayChoices_().indexOf(sched) === -1) return { error: "Choose a schedule for " + date + "." };
    if (seen[date]) return { error: date + " is listed twice." };
    seen[date] = true;
    list.push(date + "=" + sched);
  }
  list.sort();
  return { value: list.join(",") };
}

// Parent reports ready on Fridays: its Friday 5 a.m. job lives in this
// project (36 is here, with this teacher's TEACHER_EMAIL), installed when
// the setting turns on for any course and removed when it is off for all.
// The job reads the setting itself, so a course turned off is skipped
// without touching the trigger. A failure is logged; the setting is saved.
function _tdSyncParentReportPrepTrigger_(on) {
  try {
    const mine = ScriptApp.getProjectTriggers()
      .filter(function (t) { return t.getHandlerFunction() === "runWeeklyParentReportPrep"; });
    if (on && !mine.length) installWeeklyParentReportTrigger();
    if (!on) mine.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  } catch (e) {
    Logger.log("[Dashboard] The Friday parent report job could not be " + (on ? "added" : "removed") + ": " + e.message);
  }
}

// [{ term, end }] -> { value: "2627_MP1=2026-10-30,..." } or { error }.
function _tdMarkingPeriodValue_(ends) {
  const list = (ends || []).map(function (e) {
    return String((e && e.term) || "").trim().toUpperCase() + "=" + String((e && e.end) || "").trim();
  });
  const table = _markingPeriodEnds_(list.join(","));
  if (!list.length || table.length !== list.length) {
    return { error: "Each marking period needs a whole date (yyyy-mm-dd)." };
  }
  for (let i = 1; i < table.length; i++) {
    if (table[i].end === table[i - 1].end) return { error: "Two marking periods end on the same day." };
  }
  return { value: table.map(function (t) { return t.term + "=" + t.end; }).join(",") };
}

function _tdWriteSetting_(cfg, key, from, to) {
  if (String(from) === String(to)) return;
  setSharedConfigValue_(key, to);
  Logger.log("[Dashboard] " + key + " set to " + to + ".");
  try {
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    let log = ss.getSheetByName(TD_SETTINGS_LOG_TAB);
    if (!log) {
      log = ss.insertSheet(TD_SETTINGS_LOG_TAB);
      log.appendRow(TD_SETTINGS_LOG_HEADERS);
    }
    log.appendRow([new Date(), String(Session.getActiveUser().getEmail() || cfg.teacherEmail), key, from, to]);
  } catch (e) {
    Logger.log("[Dashboard] SettingsLog not written: " + e.message);
  }
}

// Courses come from the Ledger rows' class, subject or course names
// (ledgerRowCourseCode_, 00): a row's ConfigID is the student's workspace
// ID and names no course. A new course shows up once it has assignments.
function _tdKnownCourses_(cfg) {
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
  const codes = {};
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, LEDGER.COURSE_NAME + 1).getValues().forEach(function (r) {
      const code = ledgerRowCourseCode_(r);
      if (code) codes[code] = true;
    });
  }
  return Object.keys(codes).sort();
}

function _tdSettings_(cfg) {
  const resolved = _resolveConfigValues_();
  const courses = _tdKnownCourses_(cfg);
  const mpRaw = String(resolved.values.MARKING_PERIOD_ENDS || "").trim();
  let table = _markingPeriodEnds_(mpRaw);
  const mpDefault = !table.length;
  if (mpDefault) table = _markingPeriodEnds_(DEFAULT_MARKING_PERIOD_ENDS);
  const sdMap = bellScheduleDays_(resolved.values.SCHEDULE_DAYS);
  let log = [];
  try {
    const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(TD_SETTINGS_LOG_TAB);
    if (sheet && sheet.getLastRow() > 1) {
      const first = Math.max(2, sheet.getLastRow() - 7);
      log = sheet.getRange(first, 1, sheet.getLastRow() - first + 1, TD_SETTINGS_LOG_HEADERS.length).getValues()
        .reverse().map(function (r) {
          return { at: r[0] instanceof Date ? formatDate_(r[0]) : String(r[0]), key: String(r[2]), from: String(r[3]), to: String(r[4]) };
        });
    }
  } catch (e) { log = []; }
  return {
    success: true,
    courses: courses,
    settings: TD_SETTINGS.map(function (d) {
      const raw = String(resolved.values[d.key] || "").trim();
      return {
        key: d.key, label: d.label, on: d.on, off: d.off,
        value: raw || "off",
        overriddenHere: resolved.sources[d.key] === "Script Property",
        courses: courses.map(function (c) { return { code: c, on: _pivotValueOn_(raw, c) }; }),
      };
    }),
    markingPeriods: {
      ends: table.map(function (t) { return { term: t.term, end: t.end }; }),
      isDefault: mpDefault,
      overriddenHere: resolved.sources.MARKING_PERIOD_ENDS === "Script Property",
    },
    scheduleDays: {
      days: Object.keys(sdMap).sort().map(function (d) { return { date: d, schedule: sdMap[d] }; }),
      choices: _tdScheduleDayChoices_().map(function (c) { return { code: c, label: bellScheduleLabel_(c) }; }),
      overriddenHere: resolved.sources.SCHEDULE_DAYS === "Script Property",
    },
    log: log,
  };
}

// ---------------------------------------------------------------------------
// Lesson schedule (2026-10-21). The LessonSchedule tab (55, Central Ledger)
// holds one row per lesson in teaching order and the start date the teacher
// gives it; a lesson runs until the next one starts. Everything downstream
// reads that tab: which lesson is current (31), the warm-up seeds (24, 55)
// and the nightly rollout (58), which seeds, enrolls and shares a lesson's
// docs from its date. This panel shows the tab by course with what the last
// rollout run did for each lesson, and changes one start date at a time.
//
// A date is not passive: with ROLLOUT_AUTO_APPLY on for a course, a lesson
// starting within TD_ROLLOUT_LEAD_DAYS gets its docs made that night, and
// shared the night before it starts. So a change that lands inside that
// window, in the past, or on the current lesson asks to be confirmed first.
// Whether a course's rollout acts is read from its last RolloutLog run (the
// flag may be a Central Ledger Script Property this project can't see).
// Teacher-level data only; RolloutLog rows are counts and reasons.
// ---------------------------------------------------------------------------
const TD_LS = { COURSE: 0, KEY: 1, LESSON: 2, START: 3, CONFIG_ID: 4, NOTES: 5, RELEASE: 6 };
// 58's ROLLOUT_LEAD_DAYS, which lives in the Central Ledger project.
const TD_ROLLOUT_LEAD_DAYS = 2;

// The lesson's teacher doc (66): made the first time, and its Class status
// refreshed after. Returns { success, created, docUrl } or { success: false, error }.
function openLessonDoc(key) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  try {
    return makeOrRefreshLessonDoc_(String(key || "").trim());
  } catch (e) {
    return { success: false, error: "The lesson doc could not be made: " + e.message };
  }
}

// The course's agenda deck (67) for today, or the next class day when today
// isn't one; remade when it exists. Returns { success, deckUrl, date } or
// { success: false, error }.
function openAgendaDeck(code) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  try {
    const c = String(code || "").trim();
    const today = ymd_(new Date(), Session.getScriptTimeZone());
    let res = makeAgendaDeck_(c, today);
    if (!res.success) {
      const next = nextAgendaDay_(c, today);
      if (next) res = makeAgendaDeck_(c, next);
    }
    return res;
  } catch (e) {
    return { success: false, error: "The agenda could not be made: " + e.message };
  }
}

// The teacher's unlock for a lesson in parts (68): the student's next
// locked part, shared now. Teacher-gated, and only for the teacher's own
// student.
function unlockStudentPart(studentConfigId) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  try {
    return unlockNextPart_(cfg, studentConfigId, cfg.teacherEmail);
  } catch (e) {
    return { success: false, error: "The part could not be unlocked: " + e.message };
  }
}

function getLessonSchedule() {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _tdLessonSchedule_(cfg, new Date());
}

/**
 * Sets (or, with "", clears) one lesson's start date. `expected` is the date
 * the panel showed, so an edit made in the sheet meanwhile isn't overwritten.
 * Without `confirmed`, a change that the rollout acts on soon returns
 * { success: false, confirm: "…" } and writes nothing.
 */
function setLessonStartDate(lessonKey, dateStr, expected, confirmed) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  const key = String(lessonKey || "").trim();
  const date = String(dateStr || "").trim();
  if (date && !_tdIsRealYmd_(date)) return { success: false, error: "Not a date: " + date + " (use YYYY-MM-DD)." };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, error: "Another change is being saved; try again." };
  }
  try {
    const now = new Date();
    const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(TABS.lessonSchedule);
    if (!sheet || sheet.getLastRow() < 2) return { success: false, error: "No LessonSchedule tab on the Central Ledger." };
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, TD_LS.NOTES + 1).getValues();
    const i = rows.findIndex(function (r) { return String(r[TD_LS.KEY]).trim() === key; });
    if (i === -1) return { success: false, error: "No lesson " + key + " in LessonSchedule." };
    const tz = Session.getScriptTimeZone();
    const current = _tdLsDate_(rows[i][TD_LS.START], tz);
    if (current !== String(expected || "").trim()) {
      const out = _tdLessonSchedule_(cfg, now);
      out.success = false;
      out.error = "This date was changed in the sheet since the panel loaded (now " + (current || "blank") +
        "). The panel shows the current dates.";
      return out;
    }
    if (current === date) return _tdLessonSchedule_(cfg, now);

    if (!confirmed) {
      const course = String(rows[i][TD_LS.COURSE]).trim();
      const schedule = _tdLessonSchedule_(cfg, now);
      const c = schedule.courses.find(function (x) { return x.code === course; });
      const lesson = c ? c.lessons.find(function (l) { return l.key === key; }) : null;
      const why = _tdScheduleChangeWarning_(schedule.today, current, date, lesson, c);
      if (why) return { success: false, confirm: why };
    }
    sheet.getRange(i + 2, TD_LS.START + 1).setNumberFormat("@").setValue(date);
    SpreadsheetApp.flush();
    Logger.log("[Dashboard] LessonSchedule " + key + ": start " + (current || "blank") + " -> " + (date || "blank") + ".");
    return _tdLessonSchedule_(cfg, now);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Holds a lesson back from the nightly rollout (hold true: "HOLD" in its
 * LessonSchedule release cell, 55) or lets it go again (""). Held, the
 * rollout makes and shares no student doc for it; docs already shared stay
 * shared. Adds the release header to a tab made before it existed.
 */
function setLessonHold(lessonKey, hold) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  const key = String(lessonKey || "").trim();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, error: "Another change is being saved; try again." };
  }
  try {
    const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(TABS.lessonSchedule);
    if (!sheet || sheet.getLastRow() < 2) return { success: false, error: "No LessonSchedule tab on the Central Ledger." };
    const keys = sheet.getRange(2, TD_LS.KEY + 1, sheet.getLastRow() - 1, 1).getValues();
    const i = keys.findIndex(function (r) { return String(r[0]).trim() === key; });
    if (i === -1) return { success: false, error: "No lesson " + key + " in LessonSchedule." };
    if (String(sheet.getRange(1, TD_LS.RELEASE + 1).getValue()).trim() !== "release") {
      sheet.getRange(1, TD_LS.RELEASE + 1).setValue("release").setFontWeight("bold");
    }
    sheet.getRange(i + 2, TD_LS.RELEASE + 1).setValue(hold ? "HOLD" : "");
    SpreadsheetApp.flush();
    Logger.log("[Dashboard] LessonSchedule " + key + ": " + (hold ? "held from" : "released to") + " the nightly rollout.");
    return _tdLessonSchedule_(cfg, new Date());
  } finally {
    lock.releaseLock();
  }
}

// Why a change needs a second look, or "" when it doesn't.
function _tdScheduleChangeWarning_(today, from, to, lesson, course) {
  const soon = _tdAddDaysYmd_(today, TD_ROLLOUT_LEAD_DAYS);
  const acts = course && course.rolloutMode === "APPLY";
  const reasons = [];
  if (lesson && lesson.status === "current") {
    reasons.push("this is the lesson the course is on now; " +
      (to ? "moving its date can change which lesson is current" : "clearing its date makes the previous lesson current again"));
  }
  if (to && to < today) reasons.push("the new date is in the past, so the lesson becomes current at once (if it is the latest dated)");
  else if (to && to <= soon && lesson && lesson.hold) {
    reasons.push("the lesson is held from the rollout, so no student docs are made until you release it");
  } else if (to && to <= soon) {
    reasons.push(acts
      ? "tonight's rollout will make and share this lesson's student docs (the course's rollout is on)"
      : "tonight's rollout will plan this lesson's docs (shadow only; nothing is made while the rollout is off)");
  }
  if (!to && from) reasons.push("a lesson with no date is never current and the rollout skips it");
  return reasons.length ? "Change " + (lesson ? lesson.lesson : "this lesson") + " from " + (from || "no date") +
    " to " + (to || "no date") + "? Note: " + reasons.join("; ") + "." : "";
}

function _tdLessonSchedule_(cfg, now) {
  const tz = Session.getScriptTimeZone();
  const today = ymd_(now, tz);
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(TABS.lessonSchedule);
  if (!sheet) return { success: false, error: "No LessonSchedule tab on the Central Ledger (seedLessonSchedule, 55, makes it)." };
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, TD_LS.RELEASE + 1).getValues() : [];
  // A tab made before the release column (55) holds nothing.
  const hasRelease = String(sheet.getRange(1, TD_LS.RELEASE + 1).getValue()).trim().toLowerCase() === "release";
  const rollout = _tdLastRollout_(ss);
  // Each lesson's teacher doc (66's LessonDocs), when made.
  const docs = {};
  const ldocs = ss.getSheetByName("LessonDocs");
  if (ldocs && ldocs.getLastRow() > 1) {
    ldocs.getRange(2, 1, ldocs.getLastRow() - 1, 3).getValues().forEach(function (r) {
      if (String(r[0]).trim() && String(r[2]).trim()) docs[String(r[0]).trim()] = String(r[2]).trim();
    });
  }
  const byCourse = {};
  const order = [];
  rows.forEach(function (r) {
    const code = String(r[TD_LS.COURSE]).trim();
    const key = String(r[TD_LS.KEY]).trim();
    if (!code || !key) return;
    if (!byCourse[code]) { byCourse[code] = []; order.push(code); }
    const configId = String(r[TD_LS.CONFIG_ID] || "").trim();
    const raw = r[TD_LS.START];
    const start = _tdLsDate_(raw, tz);
    byCourse[code].push({
      key: key, lesson: String(r[TD_LS.LESSON] || key), configId: configId,
      start: _tdIsRealYmd_(start) ? start : "", unreadable: start !== "" && !_tdIsRealYmd_(start),
      notes: String(r[TD_LS.NOTES] || ""),
      hold: hasRelease && String(r[TD_LS.RELEASE] || "").trim().toUpperCase() === "HOLD",
      docUrl: docs[key] || "",
      rollout: (rollout.byLesson[key.toUpperCase()] || rollout.byLesson[configId.toUpperCase()] || null),
    });
  });
  const courses = order.sort().map(function (code) {
    const lessons = byCourse[code];
    // The current lesson: the latest start on or before today (55's rule).
    let current = null;
    lessons.forEach(function (l) {
      if (l.start && l.start <= today && (!current || l.start >= current.start)) current = l;
    });
    let lastDated = "";
    const seen = {};
    lessons.forEach(function (l) {
      l.status = !l.start ? "undated" : l === current ? "current" : l.start > today ? "upcoming" : "taught";
      l.warnings = [];
      if (l.unreadable) l.warnings.push("the date in the sheet can't be read; it counts as no date");
      if (l.start && lastDated && l.start < lastDated) l.warnings.push("starts before a lesson listed above it");
      if (l.start && seen[l.start]) l.warnings.push("same start date as " + seen[l.start] + "; only one of them runs");
      if (l.start) { seen[l.start] = l.lesson; if (l.start > lastDated) lastDated = l.start; }
    });
    const mode = rollout.modeByCourse[code] || "";
    return { code: code, lessons: lessons, rolloutMode: mode, current: current ? current.key : "" };
  });
  return {
    success: true, today: today, leadDays: TD_ROLLOUT_LEAD_DAYS,
    rolloutRunAt: rollout.at ? Utilities.formatDate(rollout.at, tz, "EEE MMM d, h:mm a") : "",
    courses: courses,
  };
}

// The last rollout run's rows (the rows sharing its newest timestamp's
// minute), by lesson, and each course's mode in it.
function _tdLastRollout_(ss) {
  const out = { at: null, byLesson: {}, modeByCourse: {} };
  const sheet = ss.getSheetByName(TABS.rolloutLog);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const n = Math.min(sheet.getLastRow() - 1, 500);
  const rows = sheet.getRange(sheet.getLastRow() - n + 1, 1, n, 7).getValues();
  let newest = 0;
  rows.forEach(function (r) {
    const t = sheetTimestampMs_(r[0]);
    if (!isNaN(t) && t > newest) newest = t;
  });
  if (!newest) return out;
  out.at = new Date(newest);
  rows.forEach(function (r) {
    const t = sheetTimestampMs_(r[0]);
    if (isNaN(t) || newest - t > 10 * 60 * 1000) return;
    const mode = String(r[1]).trim(), course = String(r[2]).trim(), lesson = String(r[3]).trim().toUpperCase();
    const step = String(r[4]).trim();
    if (course && course !== "-" && (mode === "APPLY" || mode === "SHADOW")) out.modeByCourse[course] = mode;
    if (!lesson || lesson === "-") return;
    const entry = out.byLesson[lesson] || (out.byLesson[lesson] = { mode: mode, steps: [], problems: [], continues: [] });
    if (step === "PROBLEM") entry.problems.push(String(r[6] || "").trim());
    // 58's CONTINUES (2026-11-08): the time budget stopped a step; not a problem.
    else if (step === "CONTINUES") entry.continues.push(String(r[6] || "").trim());
    else entry.steps.push({ step: step, count: Number(r[5]) || 0, detail: String(r[6] || "").trim() });
  });
  return out;
}

// A LessonSchedule start cell as "YYYY-MM-DD", or the text it holds.
// Sheets stores a date typed by hand as a Date (22's note).
function _tdLsDate_(value, tz) {
  if (value instanceof Date || Object.prototype.toString.call(value) === "[object Date]") {
    return isNaN(value.getTime()) ? "" : ymd_(value, tz);
  }
  return String(value === undefined || value === null ? "" : value).trim();
}

function _tdIsRealYmd_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function _tdAddDaysYmd_(ymd, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

function getCompetencies() {
  const cfg   = getConfig_();
  const email = cfg.teacherEmail || "";

  if (!_isAuthorizedTeacher_(cfg)) {
    Logger.log("[M2] getCompetencies denied — caller was " +
      _tdWhoForLog_(Session.getActiveUser().getEmail()) + ", expected " + email);
    return { error: "This dashboard is only available to the teacher it's configured for." };
  }

  return _getCompetenciesForEmail_(cfg, email);
}

// Core logic extracted from getCompetencies() so a second caller can reuse
// it with a different identity gate — doPost()'s OAuth-token-verified
// leader-hub API (D1, Addendum 24) calls this directly, since
// Session.getActiveUser() reflects the deploying teacher regardless of who
// actually made the HTTP request (this project deploys "Execute as: Me"),
// making it useless for distinguishing a genuine leader-hub caller from
// anyone else who reaches this endpoint — _verifyLeaderHubToken_() is
// doPost()'s real gate, applied before this function is ever reached.
function _getCompetenciesForEmail_(cfg, email) {
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.competencyRegistry);

  if (!sheet) {
    Logger.log("[M2] CompetencyRegistry tab not found.");
    return { error: "CompetencyRegistry tab not found. Run Module 2 setup." };
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());

  // Column indices — resolved by name, not position
  const iId      = headers.indexOf("competency_id");
  const iText    = headers.indexOf("competency_text");
  const iSubject = headers.indexOf("subject");
  const iStrand  = headers.indexOf("strand");
  const iEmail   = headers.indexOf("teacher_email");
  const iActive  = headers.indexOf("active");

  if (iId === -1 || iText === -1) {
    return { error: "CompetencyRegistry missing required columns (competency_id, competency_text)." };
  }

  // ── Pass 1: collect all rows visible to this teacher ─────────────────────
  // A row is visible if: teacher_email matches OR teacher_email is blank.
  // Rows scoped to a different teacher are excluded.
  const visibleRows = [];
  for (let i = 1; i < data.length; i++) {
    const row      = data[i];
    const active   = iActive === -1 ? true
      : String(row[iActive]).trim().toUpperCase() !== "FALSE";
    if (!active) continue;

    const rowEmail = iEmail !== -1 ? String(row[iEmail]).trim() : "";
    const isShared = !rowEmail;
    const isOwned  = rowEmail.toLowerCase() === email.toLowerCase();
    if (!isShared && !isOwned) continue;

    const compId  = String(row[iId]).trim();
    const subject = iSubject !== -1 ? String(row[iSubject]).trim() : "";
    if (!compId) continue;

    // Extract task number from ID for sort — format is "COURSECODE-N"
    // e.g. "8177-15" → taskNum 15. Falls back to 9999 if unparseable.
    const dashIdx = compId.lastIndexOf("-");
    const taskNum = dashIdx !== -1
      ? parseInt(compId.substring(dashIdx + 1), 10) || 9999
      : 9999;

    // Extract course code — everything before the last dash
    const courseCode = dashIdx !== -1 ? compId.substring(0, dashIdx) : compId;

    visibleRows.push({
      id:         compId,
      courseCode: courseCode,
      subject:    subject,
      taskNum:    taskNum,
      text:       String(row[iText]).trim(),
      strand:     iStrand !== -1 ? String(row[iStrand]).trim() : "",
    });
  }

  if (visibleRows.length === 0) {
    return { error: "No competencies found. Check the CompetencyRegistry tab." };
  }

  // ── Pass 2: group by course, sort by taskNum within each ─────────────────
  // courseMap: { courseCode: { name, competencies[] } }
  const courseMap = {};
  for (const comp of visibleRows) {
    const code = comp.courseCode;
    if (!courseMap[code]) {
      courseMap[code] = {
        code:          code,
        name:          comp.subject || code,  // subject column as display name
        competencies:  []
      };
    }
    courseMap[code].competencies.push({
      id:          comp.id,
      taskNum:     comp.taskNum,
      text:        comp.text,
      strand:      comp.strand
    });
  }

  // Sort competencies within each course by taskNum ascending
  for (const code of Object.keys(courseMap)) {
    courseMap[code].competencies.sort((a, b) => a.taskNum - b.taskNum);
  }

  // Sort courses by code ascending (8175 before 8177)
  const courses = Object.values(courseMap)
    .sort((a, b) => a.code.localeCompare(b.code));

  Logger.log("[M2] getCompetencies: " + courses.length + " course(s), " +
    visibleRows.length + " total competencies for " + email);

  return { courses: courses };
}

// ── M2 ──────────────────────────────────────────────────────────────────────
// submitLessonContext — server-side handler for the modal form submit.
// Validates input, delegates to Script 22 handler, returns result to client.
//
// Params (from client):
//   payload {
//     lessonDate, periodOrClass, activityDescription,
//     learningObjective, keyVocabulary, priorLessonConnection,
//     competencyIds   // comma-separated string
//   }
//
// Returns:
//   { success: true,  lessonId: "LES-...", frameDocUrl: null }  — on success
//   { success: false, error: "human-readable message" }          — on failure
// ── M2 ──────────────────────────────────────────────────────────────────────
function submitLessonContext(payload) {
  try {
    const cfg = getConfig_();

    if (!_isAuthorizedTeacher_(cfg)) {
      Logger.log("[M2] submitLessonContext denied — caller was " +
        _tdWhoForLog_(Session.getActiveUser().getEmail()) + ", expected " + cfg.teacherEmail);
      return { success: false, error: "This dashboard is only available to the teacher it's configured for." };
    }

    // Attach teacher identity from Script Properties — not from client payload
    payload.teacherEmail = cfg.teacherEmail;
    payload.teacherName  = cfg.teacherName;

    // Delegate to Script 22
    const result = onLessonContextSubmit_(payload);
    return result;

  } catch (err) {
    Logger.log("[M2] submitLessonContext error: " + err.message);
    return { success: false, error: "Submission failed: " + err.message };
  }
}

// ── M4 ────────────────────────────────────────────────────────────────────
// getMyStudentContext — student-facing. Returns ONLY the calling user's
// own doc info. Identity is taken from the active session, never from a
// client-supplied parameter — a student cannot pass someone else's email
// and see their data. Deliberately NOT gated by _isAuthorizedTeacher_ —
// this function's whole point is to serve non-teacher callers, scoped to
// their own identity.
// ── M4 ────────────────────────────────────────────────────────────────────
function getMyStudentContext() {
  const viewerEmail = Session.getActiveUser().getEmail();
  if (!viewerEmail) {
    return { error: "Could not determine your identity. Make sure you're signed in with your school account." };
  }

  const docInfo = getStudentDocForViewer_(viewerEmail); // from Script 29
  if (!docInfo) {
    return {
      hasContent: false,
      viewerEmail: viewerEmail,
      message: "No context recorded yet. This updates weekly — check back after your first graded assignment or warm-up response."
    };
  }

  return {
    hasContent: true,
    viewerEmail: viewerEmail,
    docUrl: docInfo.docUrl,
    lastUpdatedAt: docInfo.lastUpdatedAt ? formatDate_(docInfo.lastUpdatedAt) : "Not yet updated"
  };
}

// ── M4 ────────────────────────────────────────────────────────────────────
// getStudentContextRoster — teacher-facing. Returns the full student
// roster with doc links. Gated: only returns data if the active session's
// email matches cfg.teacherEmail. Anyone else gets an error, not a
// truncated or empty list — the distinction matters for debugging vs.
// security, and this is a security boundary.
// ── M4 ────────────────────────────────────────────────────────────────────
function getStudentContextRoster() {
  const cfg = getConfig_();

  if (!_isAuthorizedTeacher_(cfg)) {
    Logger.log("[M4] getStudentContextRoster denied — caller was " +
      _tdWhoForLog_(Session.getActiveUser().getEmail()) + ", expected " + cfg.teacherEmail);
    return { error: "This view is only available to the teacher." };
  }

  const roster = getAllStudentDocsForTeacher_(cfg.teacherEmail); // from Script 29, scoped to this teacher only
  // Competencies done per course (00, 2026-10-27); the list still loads
  // without them.
  let courses = {}, ratings = new Map(), totals = {};
  try {
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    courses = _tdStudentCourses_(ss, cfg);
    ratings = readLatestScrRatings_(ss, cfg, cfg.teacherEmail);
    totals = competencyCourseTotals_(ss, cfg);
  } catch (e) {
    Logger.log("[M4] competency counts failed: " + e.message);
  }
  return {
    roster: roster.map(r => ({
      competencies: competencyCompletionFor_(ratings.get(String(r.email).toLowerCase()), totals,
        courses[String(r.email).toLowerCase()] || []),
      name: r.name,
      email: r.email,
      docUrl: r.docUrl,
      lastUpdatedAt: r.lastUpdatedAt ? formatDate_(r.lastUpdatedAt) : "Never",
      hasRecentActivity: r.lastRunHadContent
    })),
    generatedAt: formatDate_(new Date())
  };
}

// ---------------------------------------------------------------------------
// getStudentShadowProfile — NEW (Say/Do Ledger cas-ccps finding #13).
// Client-callable wrapper around Script 23's getStudentShadowProfile_() —
// the destination for the warm-up readiness panel's "ready for
// personalized feedback" students once clicked. Same identity gate every
// other per-teacher server function on this dashboard uses.
// ---------------------------------------------------------------------------
function getStudentShadowProfile(studentEmail) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) {
    return { error: "This view is only available to the teacher this dashboard is configured for." };
  }
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const profile = getStudentShadowProfile_(ss, cfg, studentEmail); // Script 23
  return profile || { error: "No profile data found for this student yet." };
}

// ---------------------------------------------------------------------------
// Existing helper functions — unchanged
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// The four states a student's work can be in for the teacher, from the
// Ledger's evaluation result columns:
//   NOT_CHECKED    no evaluation has come back
//   NOT_PASSING    checked, never passed
//   PASSED         the latest check passed
//   PASSED_BEFORE  passed once, the latest check needs revision
// ---------------------------------------------------------------------------
function _tdEvalState_(lastResult, firstPassedAt) {
  if (lastResult === "PASSED") return "PASSED";
  if (lastResult === "NEEDS_REVISION") return firstPassedAt ? "PASSED_BEFORE" : "NOT_PASSING";
  return "NOT_CHECKED";
}

// Which lesson each student workspace is for, and which lessons are on now.
// Reads two central-ledger tabs directly: StudentAssignments (written by
// 54_StudentAssignments.js) and LessonSchedule (55_LessonSchedule.js), neither
// of which is in this project. A course's current lesson is the one with the
// latest start_date on or before today, the same rule 55 uses.
// Returns { assignmentOf: {studentConfigId: assignmentId},
//           lessons: {assignmentId: {name, course, start}}, current: Set }.
function _tdLessonContext_(ss) {
  const out = { assignmentOf: {}, lessons: {}, current: new Set() };
  try {
    const sa = ss.getSheetByName(TABS.studentAssignments);
    if (sa && sa.getLastRow() > 1) {
      sa.getRange(2, 1, sa.getLastRow() - 1, 3).getValues().forEach(r => {
        const sid = String(r[0] || "").trim(), aid = String(r[2] || "").trim();
        if (sid && aid) out.assignmentOf[sid] = aid;
      });
    }
    const ls = ss.getSheetByName(TABS.lessonSchedule);
    if (ls && ls.getLastRow() > 1) {
      const rows = ls.getDataRange().getValues();
      const h = rows[0].map(x => String(x).trim());
      const iCourse = h.indexOf("course"), iLesson = h.indexOf("lesson"),
        iStart = h.indexOf("start_date"), iId = h.indexOf("config_id");
      if (iCourse !== -1 && iLesson !== -1 && iStart !== -1 && iId !== -1) {
        const today = ymd_(new Date(), Session.getScriptTimeZone());
        const latestByCourse = {};
        rows.slice(1).forEach(r => {
          const id = String(r[iId] || "").trim();
          if (!id) return;
          const start = _normalizeLessonDateCell_(r[iStart]);
          const course = String(r[iCourse] || "").trim();
          out.lessons[id] = { name: String(r[iLesson] || "").trim() || id, course: course,
            start: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : "" };
          if (out.lessons[id].start && out.lessons[id].start <= today &&
              (!latestByCourse[course] || out.lessons[id].start > out.lessons[latestByCourse[course]].start)) {
            latestByCourse[course] = id;
          }
        });
        Object.keys(latestByCourse).forEach(c => out.current.add(latestByCourse[c]));
      }
    }
  } catch (e) {
    Logger.log("[S07] Lesson context not read: " + e.message);
  }
  return out;
}

// The lessons the dashboard's lesson picker offers: those this teacher's
// students belong to, current ones first, then newest first.
function _tdLessonList_(lessonCtx, students) {
  const seen = {};
  students.forEach(s => {
    if (!s.assignmentId || seen[s.assignmentId]) return;
    const l = lessonCtx.lessons[s.assignmentId] || {};
    seen[s.assignmentId] = { id: s.assignmentId, name: s.assignmentName, course: l.course || "",
      start: l.start || "", current: lessonCtx.current.has(s.assignmentId) };
  });
  return Object.keys(seen).map(k => seen[k]).sort((a, b) =>
    (b.current - a.current) || (a.start < b.start ? 1 : a.start > b.start ? -1 : 0) || a.name.localeCompare(b.name));
}

function resolveDisplay_(ledger, pipeline) {
  if (pipeline === "IN_PROCESS")        return "EVALUATING NOW";
  if (pipeline === "PENDING_INFERENCE") return "QUEUED";
  switch (ledger) {
    case "ACTIVE":    return "NOT STARTED";
    // Made ahead by the nightly rollout (58); shared the night before.
    case "SCHEDULED": return "SCHEDULED";
    case "STAGED":    return "QUEUED";
    case "COMPLETE":  return "EVALUATED";
    // NEW (Say/Do Ledger cas-ccps finding #1): a genuine-complete submission
    // no longer lands directly on COMPLIANT — it stops here first, awaiting
    // the teacher's own confirm/override.
    case "PENDING_TEACHER_REVIEW": return "PENDING REVIEW";
    case "COMPLIANT": return "COMPLIANT ✓";
    default:          return ledger.startsWith("ERROR") ? "FLAGGED ⚠" : (ledger || "UNKNOWN");
  }
}

// Why a row is "Couldn't be checked ⚠", and the next step (2026-10-22, UX
// audit fix-first 4): the row used to say FLAGGED with no reason.
function _tdFlagReason_(ledgerStatus) {
  if (ledgerStatus === "ERROR_TIMEOUT") {
    return "The check didn't finish in time. Next: follow the steps in the \"Feedback didn't finish\" email.";
  }
  if (ledgerStatus === "ERROR_EVALUATION") {
    return "The check ran, but its result couldn't be used. Next: ask the student to submit again.";
  }
  return "Something went wrong on the system's side. Next: tell your system admin (code " + ledgerStatus + ").";
}

// How a denial log names the caller (2026-10-22): a student who opens the
// dashboard is "a student account" (7 digits @ the school domain), never
// their address; a staff address is kept, so the operator knows who tried.
function _tdWhoForLog_(email) {
  const e = String(email || "").trim();
  if (!e) return "unknown";
  return e.indexOf("@") > 0 && studentIdRegex_().test(e.split("@")[0]) ? "a student account" : e;
}

function resolveClass_(display) {
  if (display === "COMPLIANT ✓")    return "compliant";
  if (display === "EVALUATING NOW") return "active";
  if (display === "QUEUED")         return "queued";
  if (display === "EVALUATED")      return "evaluated";
  if (display === "NOT STARTED")    return "not-started";
  if (display === "PENDING REVIEW") return "pending-review";
  if (display.includes("FLAGGED"))  return "flagged";
  return "unknown";
}

function formatDate_(d) {
  try {
    if (!(d instanceof Date)) d = new Date(d);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMM d, yyyy h:mm a");
  } catch (e) { return String(d); }
}

// ---------------------------------------------------------------------------
// buildDashboardHtml_ — self-contained single-page UI
// ---------------------------------------------------------------------------
// The Student Dashboard in demo mode (13's "Demo mode", 2026-11-07): its
// one deployment URL (STUDENT_DASHBOARD_URL, a _CONFIG row) with ?demo=1.
// "" when the URL is unset or isn't an Apps Script web app's.
function studentDemoUrl_(cfg) {
  const url = String((cfg && cfg.studentDashboardUrl) || "").trim();
  if (!/^https:\/\/script\.google\.com\/[A-Za-z0-9\/_.~-]+$/.test(url)) return "";
  return url + "?demo=1";
}

function buildDashboardHtml_(cfg) {
  let demoUrl = "";
  try { demoUrl = studentDemoUrl_(cfg || getConfig_()); } catch (e) { demoUrl = ""; }
  return renderPageTemplate_("07_TeacherDashboardPage", {
    demoMenuItem: demoUrl
            ? '<a id="demo-student-btn" role="menuitem" tabindex="-1" href="' + demoUrl + '" target="_blank" rel="noopener" title="The Student Dashboard with a made-up student, on your lessons. Nothing is saved."><span aria-hidden="true">👁</span> View as a student</a>'
            : '<button id="demo-student-btn" type="button" role="menuitem" tabindex="-1" onclick="alert(\'The Student Dashboard URL is not set. Set STUDENT_DASHBOARD_URL (a _CONFIG row in the Central Ledger), then reload.\')"><span aria-hidden="true">👁</span> View as a student</button>',
    CLIENT_ESC_JS: CLIENT_ESC_JS,
    CLIENT_SAFE_DOC_URL_JS: CLIENT_SAFE_DOC_URL_JS,
    CLIENT_WORDS_JS: CLIENT_WORDS_JS,
    warmUpPointsPanel: warmUpPointsPanelHtml_(),
    termsPanel: casTermsPanelHtml_("Terms used on this dashboard", "What each word and number means. The sheets and Studio flows use the system's own names (Flow 2, SCRSuggestions, LessonSchedule).", CAS_TEACHER_TERMS),
  });
}

// ---------------------------------------------------------------------------
// buildMyContextHtml_ — NEW (Say/Do Ledger cas-ccps finding #9). A small,
// self-contained page for a non-teacher caller (a student). Deliberately
// shares no markup/CSS/JS with buildDashboardHtml_() above — no dashboard
// stats, no Lesson Context modal, no term filter, no "+ New Lesson"
// button, none of it meaningful to this audience. Calls getMyStudentContext()
// directly on load; that function scopes itself to the caller's own
// identity (Session.getActiveUser()), never the teacher's, so there's no
// identity ambiguity here to resolve client-side the way the old shared
// template needed to.
// ---------------------------------------------------------------------------
function buildMyContextHtml_() {
  return renderPageTemplate_("07_MyContextPage", {
    CLIENT_ESC_JS: CLIENT_ESC_JS,
    CLIENT_SAFE_DOC_URL_JS: CLIENT_SAFE_DOC_URL_JS,
  });
}
