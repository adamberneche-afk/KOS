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

// ── esc() / safeDocUrl() — FIXED by a third-party review's finding ─────────
// esc() only escaped &/</> and was used in HTML-attribute and inline-JS
// contexts; docUrl was interpolated into href="..." with no escaping or
// scheme check at all. Runs the real served inline script in a vm context
// so esc/safeDocUrl are the actual functions shipped to a browser, not a
// reimplementation of them here.

// A permissive stand-in for `document`/`window`/`google` — anything
// property-accessed or called on it returns another instance of itself, so
// arbitrary DOM/`google.script.run` chains used by top-level init code
// (document.getElementById(...).addEventListener(...), etc.) don't throw.
// This test only needs esc()/safeDocUrl() to be defined via function
// hoisting once the script finishes running — it doesn't need any of that
// init code to actually do anything.
function makeDomStub() {
  const fn = () => makeDomStub();
  return new Proxy(fn, {
    get(target, prop) {
      if (prop === 'then') return undefined; // not thenable
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'toString' || prop === 'valueOf') return () => '';
      return makeDomStub();
    },
    set() { return true; },
  });
}

function runInlineScriptContext(code) {
  const context = vm.createContext({
    document: makeDomStub(), window: makeDomStub(), google: makeDomStub(), console,
  });
  new vm.Script(code, { filename: 'dashboard-inline-under-test.js' }).runInContext(context);
  return context;
}

function firstContextWith(html, names) {
  const blocks = extractInlineScripts(html);
  for (const code of blocks) {
    const context = runInlineScriptContext(code);
    if (names.every((n) => typeof context[n] === 'function')) return context;
  }
  throw new Error(`no inline script block defined all of: ${names.join(', ')}`);
}

test('esc() escapes quotes as well as &/</> in the served dashboard', () => {
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['esc']);
  assert.equal(context.esc('&'), '&amp;');
  assert.equal(context.esc('<'), '&lt;');
  assert.equal(context.esc('>'), '&gt;');
  assert.equal(context.esc('"'), '&quot;');
  assert.equal(context.esc("'"), '&#39;');
});

test('safeDocUrl() allowlists only real Google Docs/Drive URLs in the served dashboard', () => {
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['safeDocUrl']);
  assert.equal(context.safeDocUrl('javascript:alert(1)'), '');
  assert.equal(context.safeDocUrl('http://docs.google.com/document/d/abc/edit'), '', 'must reject non-https');
  assert.equal(context.safeDocUrl('https://evil.example.com/docs.google.com/'), '', 'must anchor at the start, not just contain the host');
  assert.equal(
    context.safeDocUrl('https://docs.google.com/document/d/abc123/edit'),
    'https://docs.google.com/document/d/abc123/edit',
  );
  assert.equal(
    context.safeDocUrl('https://drive.google.com/file/d/xyz789/view'),
    'https://drive.google.com/file/d/xyz789/view',
  );
});

test('esc()-then-&#39; round-trips a name with both " and \' safely into an onclick attribute', () => {
  // Regression test for the exact interaction the esc()-quote-escaping fix
  // created: wrNameSafe/rvNameSafe in 07_TeacherDashboard.js used to do
  // esc(name).replace(/'/g,"\\\\'") — once esc() itself started escaping
  // ' to &#39;, that .replace() found no raw ' left to match and became a
  // silent no-op, leaving &#39; in the onclick attribute. The browser
  // decodes &#39; back to ' before the inline-JS parser sees it, which
  // would break the string boundary for any name containing an apostrophe.
  // Both sites were changed to target &#39; instead — this test runs that
  // exact expression through the real served esc() and confirms the
  // result is safe to drop into a single-quoted onclick string.
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['esc']);

  const name = `O'Brien "Ace"`;
  const nameSafe = context.esc(name).replace(/&#39;/g, "\\\\'");

  assert.ok(!/&#39;/.test(nameSafe), 'no bare &#39; must remain — it must have been converted to \\\'');
  assert.ok(!/(?<!\\)'/.test(nameSafe), 'no unescaped raw \' may remain — it would close the JS string early');

  // Round-trip: what a browser would actually hand the inline-JS parser
  // after (1) decoding the &quot;-wrapped HTML attribute and (2) parsing
  // the resulting single-quoted JS string literal.
  const htmlDecoded = nameSafe.replace(/&quot;/g, '"');
  const jsUnescaped = htmlDecoded.replace(/\\\\'/g, "'");
  assert.equal(jsUnescaped, name, 'must round-trip back to the original name');
});
