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
 * HISTORY: this began as Phases 1-2 of the server-migration plan
 * (transport and serving only). Since 2026-10-22 every data domain lives
 * on the server and the app runs only as this web app
 * (meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md): doGet() writes the
 * server's data into the page as window.__LH_BOOT__ (Data.gs
 * lhBootData_/lhInjectBootData_), and the page saves each change back
 * through google.script.run. lhApiCall_() below is the google.script.run entry point
 * the same-origin client (callGAS() in
 * leader-hub/src/10-command-engine-ai-and-widgets.html) now calls instead
 * of fetch()ing EmailBridge.gs's doPost() URL — same action dispatch table
 * (_lhDispatchAction_() in EmailBridge.gs), same underlying functions,
 * just a same-origin RPC instead of a cross-origin POST. doPost() itself
 * is untouched and still answers external JSON callers directly.
 *
 * ONE-TIME SETUP for a fresh deployment: Project Settings → Script
 * Properties → add OWNER_EMAIL = the Google account this deployment
 * belongs to. Until that's set, doGet() fails closed for everyone,
 * including the person who deployed it — by design, same as
 * TEACHER_EMAIL's fail-closed behavior in cas-ccps/00_SharedConfig.js.
 *
 * doGet() also carries one exception to "serve HTML, always": a
 * `?api=horizon` request routes to EmailBridge.gs's
 * emailBridgeGetHorizonItems_() instead. It was the fetch() endpoint for
 * the standalone file, which had no google.script.run; that file is
 * retired (2026-10-22) and nothing in the app calls this branch now:
 * EMAIL_BRIDGE.poll() (leader-hub/src/12-...-brag.html) calls
 * lhGetHorizonItems_() below through google.script.run. The branch stays
 * for any external GET caller. Only GAS allows one doGet() per project,
 * which is why merging EmailBridge.gs's project into this one needed this
 * explicit routing.
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
  // ?diag=1 / ?diag=probe[&parts=N] — Diagnostics.gs. Owner-gated there.
  if (e && e.parameter && e.parameter.diag) {
    return lhDiagnosticResponse_(e);
  }
  const cfg = getConfig_();
  if (!_isAuthorizedOwner_(cfg)) {
    return HtmlService.createHtmlOutput(
      '<p>Not authorized. This LeaderHub deployment is configured for a single ' +
      'owner — sign in with that Google account. (First-time deploy? Set the ' +
      '<code>OWNER_EMAIL</code> Script Property under Project Settings.)</p>'
    ).setTitle('LeaderHub');
  }
  // The server's copy of every domain goes into the page (Data.gs's
  // lhBootData_), so the app never reads browser storage (no browser
  // storage, Phase 3, 2026-10-22). If the read fails, the page says so and
  // refuses to save, rather than starting empty and overwriting the server.
  let boot;
  try {
    boot = lhBootData_();
  } catch (err) {
    boot = { ok: false, error: String((err && err.message) || err) };
  }
  const html = HtmlService.createHtmlOutputFromFile('student-leader-hub').getContent();
  return HtmlService.createHtmlOutput(lhInjectBootData_(html, boot))
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

// ── What the browser actually calls ─────────────────────────────────────────
// google.script.run only exposes functions whose names don't end in "_", so
// every call the page made to the "_" functions above and in Config.gs,
// Data.gs and SCR.gs failed in the browser before reaching the server:
// settings, data, SCR scores, the AI/email bridge and the horizon list never
// synced (confirmed live with ?diag=1, 2026-09-28). These are the public
// names the page calls instead. Each one is owner-only: anything public here
// can be called by any signed-in domain user from any page this script
// serves, including the "not authorized" page, so the check has to live in
// the function itself, not just in doGet(). The "_" versions stay as the
// implementations, and the tests exercise them directly.

function _lhRequireOwner_() {
  if (!_isAuthorizedOwner_(getConfig_())) {
    throw new Error('Not authorized: LeaderHub is owner-only (OWNER_EMAIL).');
  }
}

// Refuses a call from anyone but the account the script runs as, and lets a
// trigger through (it has no signed-in user, or the owner). For a public
// function a trigger runs, where _lhRequireOwner_ would refuse the trigger.
// The web app runs as the owner with domain access, so any district account
// can call a public function from a page it serves (KOS Audit Docket IV).
function requireScriptOwner_() {
  let active = '', effective = '';
  try { active = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { active = ''; }
  try { effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { effective = ''; }
  if (active && effective && active !== effective) throw new Error('Not authorized.');
}

function lhApiCall(action, payload) { _lhRequireOwner_(); return lhApiCall_(action, payload); }
function lhOrgSyncCall(bridgeUrl, action, payload) { _lhRequireOwner_(); return lhOrgSyncCall_(bridgeUrl, action, payload); }
function lhGetHorizonItems() { _lhRequireOwner_(); return lhGetHorizonItems_(); }
function lhGetAllConfig() { _lhRequireOwner_(); return lhGetAllConfig_(); }
function lhSaveConfig(key, value) { _lhRequireOwner_(); return lhSaveConfig_(key, value); }
function lhPushData(body) { _lhRequireOwner_(); return lhPushData_(body); }
function lhPullData(body) { _lhRequireOwner_(); return lhPullData_(body); }
// lhGetScrScores: no public entry point since 2026-10-22; the page gets the
// scores with the boot data (Data.gs's lhBootData_).
function lhSaveScrScores(changes) { _lhRequireOwner_(); return lhSaveScrScores_(changes); }
