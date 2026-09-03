'use strict';
// Regression tests for gas-lint's Check D — the client→server cross-reference
// that verifies every `google.script.run.foo()` has a real top-level `foo` in
// the same Apps Script project.
//
// WHY THESE EXIST: Check D was silently vacuous. It scanned raw source with a
// per-LINE regex, and every real client call in this repo is written in a
// shape that defeats one or both halves of that:
//
//   - leader-hub and both cas-ccps dashboards write multi-line chains
//     (`google.script.run` / `.withSuccessHandler(...)` / `.fn(...)`), so a
//     per-line regex sees no call at all. 19 real call sites, invisible.
//   - kos-personal's eight .gs files carry
//     `*   google.script.run.withSuccessHandler(fn).executeBootstrap()`
//     inside doc comments. Those eight were the ONLY names the check ever
//     found — it was cross-referencing its own documentation and reporting
//     success.
//
// So the two stripping requirements below are load-bearing in OPPOSITE
// directions, and a future "simplification" that drops either one puts the
// check back to verifying nothing:
//
//   comments blanked  — or doc-comment examples masquerade as call sites
//   strings KEPT      — or cas-ccps's dashboards, which serve client code
//                       from template literals inside .js, lose every call
//
// The check itself isn't called directly (it walks the whole repo);
// findGoogleScriptRunCalls() is the pure unit.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findGoogleScriptRunCalls, findTopLevelDecls } = require('../../tools/gas-lint/check.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const PROJECT_MAP = require('../../tools/gas-lint/project-map.json');

const names = (src) => findGoogleScriptRunCalls('x/y.js', src).calls.map((c) => c.name);

// ── the two stripping requirements ───────────────────────────────────────────

test('a call inside a doc comment is NOT a call site', () => {
  // The exact shape from kos-personal/1_Config_And_Deploy.gs:434.
  const src = '/**\n *   google.script.run.withSuccessHandler(fn).executeBootstrap()\n */\nfunction f() {}\n';
  assert.deepEqual(names(src), []);
});

test('a call inside a // comment is NOT a call site', () => {
  assert.deepEqual(names('// google.script.run.withSuccessHandler(fn).oldName()\n'), []);
});

test('a call inside a template literal IS a call site', () => {
  // cas-ccps's dashboards serve their client JS this way. Blanking string
  // contents would delete the repo's largest client surface.
  const src = 'function page() {\n  return `<script>\n    google.script.run\n' +
              '      .withSuccessHandler(render)\n      .getDashboardData();\n  <\\/script>`;\n}\n';
  assert.deepEqual(names(src), ['getDashboardData']);
});

// ── chain walking ────────────────────────────────────────────────────────────

test('a single-line chain resolves', () => {
  assert.deepEqual(
    names('google.script.run.withSuccessHandler(ok).withFailureHandler(bad).doThing();'),
    ['doThing']);
});

test('a chain broken across lines resolves — the whole reason this exists', () => {
  const src = [
    'google.script.run',
    '  .withSuccessHandler(resolve)',
    '  .withFailureHandler(err => reject(new Error((err && err.message) || String(err))))',
    '  .lhPullData_({ domain });',
  ].join('\n');
  assert.deepEqual(names(src), ['lhPullData_']);
});

test('nested parens in a handler do not swallow the call', () => {
  // The leader-hub shape that motivated balanced-paren skipping rather than
  // a `[^)]*` regex: three closing parens before the real link.
  const src = 'google.script.run\n  .withFailureHandler(err => console.warn(fmt((err && err.message))))\n  .lhSaveConfig_(key, value);';
  assert.deepEqual(names(src), ['lhSaveConfig_']);
});

test('the reported line is the chain head, so a finding points at the call', () => {
  const src = 'var a = 1;\nvar b = 2;\ngoogle.script.run\n  .withSuccessHandler(ok)\n  .doThing();';
  assert.deepEqual(findGoogleScriptRunCalls('x/y.js', src).calls, [{ name: 'doThing', line: 3 }]);
});

test('with* handlers are never mistaken for the server function', () => {
  const src = 'google.script.run.withUserObject(this).withSuccessHandler(ok).withLogger(l).realOne();';
  assert.deepEqual(names(src), ['realOne']);
});

test('several chains in one file all resolve', () => {
  const src = 'google.script.run.withSuccessHandler(a).one();\n\ngoogle.script.run\n  .two();\n';
  assert.deepEqual(names(src).sort(), ['one', 'two']);
});

// ── dynamic dispatch ─────────────────────────────────────────────────────────

test('an aliased bridge reports as unresolved rather than as covered', () => {
  // kos-personal/8_WebApp_UI.html's real shape: the name arrives at runtime
  // via callServer('executeBootstrap', ...), so no static pass can check it.
  // Claiming coverage here is worse than reporting the gap.
  const src = 'const gsr = (typeof google !== "undefined" && google.script)\n  ? google.script.run : null;\n' +
              'const runner = gsr.withSuccessHandler(onOk);\nrunner[fn].apply(runner, args || []);\n';
  const r = findGoogleScriptRunCalls('x/y.html', src);
  assert.deepEqual(r.calls, []);
  assert.equal(r.unresolved.length, 1);
});

test('a truthiness guard is unresolved too, which is why the warning is per-file', () => {
  // Check D only warns for a file where NOTHING resolved. leader-hub's HTML
  // is full of these guards alongside 8 chains that do resolve, and warning
  // on each guard there would be pure noise.
  const r = findGoogleScriptRunCalls('x/y.html',
    'if (!(typeof google !== "undefined" && google.script && google.script.run)) return;');
  assert.deepEqual(r.calls, []);
  assert.equal(r.unresolved.length, 1);
});

test('a property read with no call is not a call site', () => {
  const r = findGoogleScriptRunCalls('x/y.js', 'const has = google.script.run.something;');
  assert.deepEqual(r.calls, []);
});

// ── against the real repo ────────────────────────────────────────────────────

test('every real client call in the repo resolves to a declared server function', () => {
  // The assertion Check D is supposed to make, made here against real files
  // so a rename on either side fails a test and not only a lint run.
  let totalCalls = 0;
  Object.entries(PROJECT_MAP).forEach(([projectName, def]) => {
    if (projectName.startsWith('_')) return;
    const files = (def.files || []).concat(def.html || []);
    const declared = new Set();
    files.filter((f) => !f.endsWith('.html')).forEach((f) => {
      if (fs.existsSync(path.join(REPO_ROOT, f))) {
        findTopLevelDecls(f).forEach((d) => declared.add(d.name));
      }
    });
    files.forEach((relPath) => {
      const abs = path.join(REPO_ROOT, relPath);
      if (!fs.existsSync(abs)) return;
      findGoogleScriptRunCalls(relPath, fs.readFileSync(abs, 'utf8')).calls.forEach((c) => {
        totalCalls++;
        assert.ok(declared.has(c.name),
          `${relPath}:${c.line} calls google.script.run.${c.name}() but project "${projectName}" declares no such top-level function`);
      });
    });
  });
  // Guards against the failure mode that made this check worthless: passing
  // because it found nothing. If a refactor drops the count, that is the
  // regression, not a cleanup.
  assert.ok(totalCalls >= 19,
    `expected at least 19 resolvable client calls repo-wide, found ${totalCalls} — Check D has gone blind again`);
});

test('the cas-ccps teacher dashboard specifically is covered', () => {
  // 10 calls in template literals in a .js file — zero of which the old
  // per-line raw-text scan could see.
  const rel = 'cas-ccps/scripts/07_TeacherDashboard.js';
  const found = findGoogleScriptRunCalls(rel, fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
  assert.ok(found.calls.length >= 10, `expected >=10 calls, found ${found.calls.length}`);
  assert.ok(found.calls.some((c) => c.name === 'getDashboardData'));
});

test('leader-hub\'s multi-line chains are covered', () => {
  const rel = 'leader-hub/student-leader-hub.html';
  const found = findGoogleScriptRunCalls(rel, fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
  const got = [...new Set(found.calls.map((c) => c.name))].sort();
  assert.deepEqual(got, ['lhApiCall_', 'lhGetAllConfig_', 'lhGetHorizonItems_', 'lhGetScrScores_',
                         'lhPullData_', 'lhPushData_', 'lhSaveConfig_', 'lhSaveScrScores_']);
});
