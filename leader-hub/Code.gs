/**
 * LeaderHub — Web App entry point
 *
 * Deploy as: Web App → Execute as Me → Access: Anyone in your domain
 * (leader-hub/appsscript.json's existing webapp block already matches this
 * — no manifest change needed to add HTML serving).
 *
 * doGet() serves the real hub UI — leader-hub/student-leader-hub.html, the
 * file tools/leaderhub-build/build.js already assembles from
 * leader-hub/src/*.html and commits as one complete, valid, standalone
 * document. This file makes zero changes to that build process or to the
 * assembled file itself: HtmlService.createHtmlOutputFromFile() serves it
 * exactly as clasp pushes it (an .html file named "student-leader-hub" is
 * registered under that same name, extension dropped, by Apps Script).
 *
 * Access is gated to a single owner — Session.getActiveUser().getEmail()
 * compared against the OWNER_EMAIL Script Property — the same fail-closed
 * shape cas-ccps/teacher-dashboard's _isAuthorizedTeacher_() uses (see
 * cas-ccps/scripts/00_SharedConfig.js / 07_TeacherDashboard.js). leader-hub
 * has no second legitimate viewer role the way teacher-dashboard has a
 * student "My Context" view — every domain here is one person's own
 * operational data, so there is nothing to branch doGet() toward besides
 * "the owner" or "not authorized." A colleague forking this repo deploys
 * their own copy of this project and sets their own OWNER_EMAIL — no
 * multi-tenant logic needed, matching how Organization Sync (EmailBridge.gs)
 * already treats a co-advisor as a second, wholly separate deployment.
 *
 * THIS COVERS PHASES 1-2 of the server-migration plan (transport/serving
 * only — no data domain has moved off localStorage yet, zero behavior
 * change to any feature's data). doGet() serves the existing, unmodified
 * assembled HTML. lhApiCall_() below is the google.script.run entry point
 * the same-origin client (callGAS() in
 * leader-hub/src/10-command-engine-ai-and-widgets.html) now calls instead
 * of fetch()ing EmailBridge.gs's doPost() URL — same action dispatch table
 * (_lhDispatchAction_() in EmailBridge.gs), same underlying functions,
 * just a same-origin RPC instead of a cross-origin POST. doPost() itself
 * is untouched and still answers external JSON callers directly. Later
 * phases move individual data domains onto server-side storage one at a
 * time. See the migration plan for the full sequence.
 *
 * ONE-TIME SETUP for a fresh deployment: Project Settings → Script
 * Properties → add OWNER_EMAIL = the Google account this deployment
 * belongs to. Until that's set, doGet() fails closed for everyone,
 * including the person who deployed it — by design, same as
 * TEACHER_EMAIL's fail-closed behavior in cas-ccps/00_SharedConfig.js.
 *
 * doGet() also carries one permanent exception to "serve HTML, always": a
 * `?api=horizon` request routes to EmailBridge.gs's
 * emailBridgeGetHorizonItems_() instead. This isn't a transitional shim —
 * leader-hub/student-leader-hub.html keeps working as a fully local file
 * indefinitely (no forced cutover, per the migration plan's deployment-
 * safety section), and a local file has no google.script.run available to
 * it at all, so EMAIL_BRIDGE.poll() (leader-hub/src/12-...-brag.html)
 * still needs a real fetch()-able GET endpoint for that mode. Only GAS
 * allows one doGet() per project, so merging EmailBridge.gs's project
 * into this one required exactly this kind of explicit routing rather
 * than a second doGet(). When served by this deployed web app, poll()
 * instead calls lhGetHorizonItems_() below via google.script.run and
 * never hits this branch at all.
 *
 * NOTE for implementation follow-up: once this is actually deployed and
 * opened, check the browser console for CSP violations — the assembled
 * file's <meta> CSP (leader-hub/src/00-shell-head.html) was written for a
 * page opened from a local file:// / plain https:// origin, not Apps
 * Script's sandboxed *.googleusercontent.com serving origin. This can't be
 * fully verified without a live deployment; flagged here rather than
 * guessed at.
 */

function getConfig_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  return {
    ownerEmail: p.OWNER_EMAIL || '',
  };
}

function _isAuthorizedOwner_(cfg) {
  const viewer = Session.getActiveUser().getEmail();
  return !!(viewer && cfg.ownerEmail && viewer.toLowerCase() === cfg.ownerEmail.toLowerCase());
}

function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'horizon') {
    return emailBridgeGetHorizonItems_(e);
  }
  const cfg = getConfig_();
  if (!_isAuthorizedOwner_(cfg)) {
    return HtmlService.createHtmlOutput(
      '<p>Not authorized. This LeaderHub deployment is configured for a single ' +
      'owner — sign in with that Google account. (First-time deploy? Set the ' +
      '<code>OWNER_EMAIL</code> Script Property under Project Settings.)</p>'
    ).setTitle('LeaderHub');
  }
  return HtmlService.createHtmlOutputFromFile('student-leader-hub')
    .setTitle('LeaderHub — CCPS Command Center')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── google.script.run entry points (Phase 2) ────────────────────────────────
// Both of these are plain functions returning a JSON-serializable object
// directly — NOT wrapped in ContentService/jsonResponse_() like doPost()'s
// response, which google.script.run would choke on (it expects the raw
// return value, not an HtmlService/ContentService output object).

// Same-origin replacement for EMAIL_BRIDGE.poll()'s old `?api=horizon`
// fetch() — same underlying result shape (_horizonItemsResult_() in
// EmailBridge.gs), reached via RPC instead of a URL fetch.
function lhGetHorizonItems_() {
  return _horizonItemsResult_();
}

// Same-origin replacement for callGAS()'s old fetch()-to-doPost() call —
// one action dispatch table (_lhDispatchAction_() in EmailBridge.gs)
// shared with doPost(), so the two transports can never drift apart.
function lhApiCall_(action, payload) {
  try {
    return _lhDispatchAction_(action || '', payload || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
