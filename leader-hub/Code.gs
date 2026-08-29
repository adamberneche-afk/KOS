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
 * THIS IS PHASE 1 of the server-migration plan (scaffolding only): doGet()
 * serves the existing, unmodified assembled HTML, and every data domain in
 * it is still 100% localStorage — zero behavior change to any feature.
 * EmailBridge.gs's doPost() JSON API is completely untouched by this file.
 * Phase 2 moves its actions onto google.script.run for the now-same-origin
 * client; later phases move individual data domains onto server-side
 * storage one at a time. See the migration plan for the full sequence.
 *
 * ONE-TIME SETUP for a fresh deployment: Project Settings → Script
 * Properties → add OWNER_EMAIL = the Google account this deployment
 * belongs to. Until that's set, doGet() fails closed for everyone,
 * including the person who deployed it — by design, same as
 * TEACHER_EMAIL's fail-closed behavior in cas-ccps/00_SharedConfig.js.
 *
 * doGet() also carries one temporary exception to "serve HTML, always":
 * a `?api=horizon` request is routed to EmailBridge.gs's
 * emailBridgeGetHorizonItems_() instead — this is the exact GET request
 * EMAIL_BRIDGE.poll() (leader-hub/src/12-...-brag.html) already makes
 * against the deployed URL today. Only GAS allows one doGet() per
 * project, so merging EmailBridge.gs's project into this one required
 * either breaking that already-shipped, working poll or preserving it
 * this way; Phase 2 of the migration plan retires this branch once
 * poll() calls scanHorizonLabel_()/markConsumed_() via google.script.run
 * directly instead of fetch()ing this URL.
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
