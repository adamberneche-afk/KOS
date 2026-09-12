'use strict';
// Regression tests for gas-lint's Check M — every doGet()/doPost() needs a
// visible caller-identity check somewhere reachable from it.
//
// WHY THESE EXIST: the real repo has exactly one instance of each of the
// four cases the check has to tell apart (see check.js's Check M comment
// for the full reasoning: kos-personal, cas-ccps/07_TeacherDashboard.js,
// cas-ccps/13_StudentDashboard.js, leader-hub/EmailBridge.gs+Code.gs).
// These tests pin the asymmetric doGet-vs-doPost behavior with synthetic,
// minimal fixtures so a future edit can't quietly change which of those
// four real files starts getting flagged (or stops).
//
// evaluateWebAppAuthForProject() is the pure unit — it takes already-
// stripped source, not real file paths, so no repo I/O is involved here.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateWebAppAuthForProject,
  findFunctionBody,
  AUTH_CALL_RE,
  stripCommentsAndStrings,
} = require('../../tools/gas-lint/check.js');

// Build a { path, stripped } fixture the way the real checker would, so
// these tests exercise the same comment/string stripping as production.
function file(path, src) {
  return { path, stripped: stripCommentsAndStrings(src) };
}

test('findFunctionBody: extracts a brace-balanced body, ignores nested braces', () => {
  const src = 'function doGet(e) {\n  if (x) { return 1; }\n  return 2;\n}\nfunction other() {}\n';
  const body = findFunctionBody(stripCommentsAndStrings(src), 'doGet');
  assert.ok(body.startsWith('{'));
  assert.ok(body.trim().endsWith('}'));
  assert.ok(!/function other/.test(body));
});

test('findFunctionBody: returns null when the function is not declared', () => {
  const body = findFunctionBody(stripCommentsAndStrings('function doPost(e) {}\n'), 'doGet');
  assert.equal(body, null);
});

test('AUTH_CALL_RE: matches Session.getActiveUser(), *Auth*/*Verify*/*Token*/*Secret* helper calls, and e.parameter.secret', () => {
  assert.ok(AUTH_CALL_RE.test('Session.getActiveUser().getEmail()'));
  assert.ok(AUTH_CALL_RE.test('_isAuthorizedOwner_()'));
  assert.ok(AUTH_CALL_RE.test('_isAuthorizedWebhookCall_(e)'));
  assert.ok(AUTH_CALL_RE.test('_verifyLeaderHubToken_(body.idToken, cfg)'));
  assert.ok(AUTH_CALL_RE.test('e.parameter.secret'));
  assert.ok(!AUTH_CALL_RE.test('doGet(e) { return html_; }'));
});

// ── the four real-repo shapes ────────────────────────────────────────────

test('direct check in doGet() and doPost() own bodies: no findings (kos-personal shape)', () => {
  const f = file('p.gs', [
    'function doGet(e) {',
    '  if (!_isAuthorizedOwner_()) return denied_();',
    '  return real_();',
    '}',
    'function doPost(e) {',
    '  if (!_isAuthorizedWebhookCall_(e)) return denied_();',
    '  return real_();',
    '}',
  ].join('\n'));
  assert.deepEqual(evaluateWebAppAuthForProject([f]), []);
});

test('doGet() with no direct check but a check elsewhere in the project: silent (cas-ccps/13_StudentDashboard.js shape)', () => {
  const f = file('dashboard.js', [
    'function doGet() {',
    '  return HtmlService.createHtmlOutput(shell_());',
    '}',
    'function getStudentDashboardData() {',
    '  const email = Session.getActiveUser().getEmail();',
    '  return real_(email);',
    '}',
  ].join('\n'));
  assert.deepEqual(evaluateWebAppAuthForProject([f]), []);
});

test('doPost() with no direct check but a check elsewhere in the project: warn, not error (leader-hub/EmailBridge.gs shape)', () => {
  const files = [
    file('EmailBridge.gs', [
      'function doPost(e) {',
      '  return jsonResponse_(dispatch_(e));',
      '}',
    ].join('\n')),
    file('Code.gs', [
      'function _isAuthorizedOwner_(cfg) {',
      '  return Session.getActiveUser().getEmail() === cfg.ownerEmail;',
      '}',
      'function doGet(e) {',
      '  if (!_isAuthorizedOwner_(getConfig_())) return denied_();',
      '  return shell_();',
      '}',
    ].join('\n')),
  ];
  const findings = evaluateWebAppAuthForProject(files);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].handler, 'doPost');
  assert.equal(findings[0].severity, 'warn');
  assert.equal(findings[0].file, 'EmailBridge.gs');
});

test('doGet() and doPost() with no check anywhere in the project: error (the original kos-personal bug)', () => {
  const f = file('p.gs', [
    'function doGet(e) {',
    '  return shell_();',
    '}',
    'function doPost(e) {',
    '  return real_(JSON.parse(e.postData.contents));',
    '}',
  ].join('\n'));
  const findings = evaluateWebAppAuthForProject([f]);
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((x) => x.handler).sort(), ['doGet', 'doPost']);
  findings.forEach((x) => assert.equal(x.severity, 'error'));
});

test('a project with neither handler: no findings', () => {
  const f = file('helpers.gs', 'function helper_() { return 1; }\n');
  assert.deepEqual(evaluateWebAppAuthForProject([f]), []);
});

test('a check pattern inside a comment does not count (stripping is real)', () => {
  const f = file('p.gs', [
    '// Session.getActiveUser() used to be checked here, no longer is',
    'function doGet(e) {',
    '  return shell_();',
    '}',
  ].join('\n'));
  const findings = evaluateWebAppAuthForProject([f]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'error');
});
