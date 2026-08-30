'use strict';
// Syntax-checks the client-side JavaScript the Teacher Dashboard actually
// serves to a browser.
//
// leader-hub's single-file app has had this coverage since tools/html-lint
// landed, because its markup is a real .html file a linter can read.
// 07_TeacherDashboard.js's markup is a JS template literal instead, so the
// same class of bug — a stray quote or bracket in 72KB of inline
// <script> — was invisible to every check in the repo. Reading the source
// as text doesn't work either: the template contains \${...} escapes that
// emit a literal ${...}, and a ${CLIENT_ESC_JS} interpolation that only
// resolves when the template is evaluated.
//
// So this evaluates the template through the GAS sandbox to get the real
// HTML, then parses each inline block. A GAS syntax error in that block
// doesn't fail the server function that emits it — it fails silently in
// the teacher's browser, leaving a dashboard whose buttons do nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');

function renderDashboard() {
  const { exported } = loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '07_TeacherDashboard.js')],
    ['buildDashboardHtml_', 'buildMyContextHtml_'],
  );
  return exported;
}

test('the teacher dashboard renders HTML with at least one inline script', () => {
  const html = renderDashboard().buildDashboardHtml_();
  assert.ok(html.length > 1000, 'expected a substantial HTML document');
  assert.ok(extractInlineScripts(html).length >= 1);
});

test('every inline <script> the teacher dashboard serves parses as valid JS', () => {
  const html = renderDashboard().buildDashboardHtml_();
  extractInlineScripts(html).forEach((code, i) => {
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: `dashboard-inline-${i}.js` }),
      `inline <script> block ${i} is not valid JavaScript`,
    );
  });
});

test('every inline <script> the student My Context page serves parses as valid JS', () => {
  // A student who isn't the authorized teacher gets this page instead
  // (doGet branches on _isAuthorizedTeacher_), so it needs the same check.
  const html = renderDashboard().buildMyContextHtml_();
  extractInlineScripts(html).forEach((code, i) => {
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: `mycontext-inline-${i}.js` }),
      `inline <script> block ${i} is not valid JavaScript`,
    );
  });
});

test('the parent-report controls reach server functions that exist', () => {
  // gas-lint's google.script.run check already covers this statically; this
  // asserts the two calls are actually present in the shipped markup, so
  // deleting a button without deleting its handler (or vice versa) shows up
  // as a test failure rather than a dead control.
  const html = renderDashboard().buildDashboardHtml_();
  assert.match(html, /getWeeklyParentReports\(\)/);
  assert.match(html, /teacherSendWeeklyParentReport\(/);
  assert.match(html, /id="parent-report-btn"/);
});
