'use strict';
// gas-lint's Check M2 (web-app-public-function): in a web app that runs as
// its owner with access wider than MYSELF, every public function needs an
// owner or teacher check, or an allowlist entry saying why anyone may call
// it (KOS Audit Docket IV, High, 2026-10-31). Synthetic sources only.

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePublicFunctionGates, stripCommentsAndStrings, DECL_RE } = require('../../tools/gas-lint/check.js');

function file(path, src) {
  const stripped = stripCommentsAndStrings(src);
  const decls = [];
  stripped.split('\n').forEach((line, i) => {
    const m = line.match(DECL_RE);
    if (m && m[1]) decls.push({ name: m[1], line: i + 1 });
  });
  return { path, stripped, decls };
}
const names = (r) => r.ungated.map((u) => u.name).sort();

test('a public function with no check is flagged; private ones and doGet are not', () => {
  const r = evaluatePublicFunctionGates([file('a.js', `
function doGet() { return 1; }
function recordThing(x) { return write_(x); }
function write_(x) { return x; }
`)], {});
  assert.deepEqual(names(r), ['recordThing']);
});

test('a direct owner or teacher check passes', () => {
  const r = evaluatePublicFunctionGates([file('a.js', `
function a() { requireScriptOwner_(); return 1; }
function b() { if (!_isAuthorizedTeacher_(cfg)) return null; return 2; }
function c() { _lhRequireOwner_(); }
`)], {});
  assert.deepEqual(names(r), []);
});

test('a check reached through private helpers (up to three hops, across files) passes', () => {
  const r = evaluatePublicFunctionGates([
    file('a.js', 'function save(x) { return one_(x); }\nfunction deep(x) { return h1_(x); }'),
    file('b.js', 'function one_(x) { requireScriptOwner_(); return x; }\n' +
      'function h1_(x) { return h2_(x); }\nfunction h2_(x) { return h3_(x); }\nfunction h3_(x) { return h4_(x); }\n' +
      'function h4_(x) { requireScriptOwner_(); }'),
  ], {});
  assert.deepEqual(names(r), ['deep'], 'four hops is too deep to count');
});

test('reading the caller\'s address is not a check', () => {
  const r = evaluatePublicFunctionGates([file('a.js',
    'function stamp() { const who = Session.getActiveUser().getEmail(); return who; }')], {});
  assert.deepEqual(names(r), ['stamp']);
});

test('an allowlisted function passes; an entry for a function that no longer exists is reported stale', () => {
  const r = evaluatePublicFunctionGates([file('a.js', 'function getMine() { return 1; }')],
    { getMine: 'the caller\'s own row', gone: 'removed' });
  assert.deepEqual(names(r), []);
  assert.deepEqual(r.staleAllow, ['gone']);
});

test('a client function inside an HTML template string is not a server function', () => {
  const r = evaluatePublicFunctionGates([file('a.js',
    'function page_() { return `<script>\nfunction clientOnly() { go(); }\n</script>`; }')], {});
  assert.deepEqual(names(r), []);
});
