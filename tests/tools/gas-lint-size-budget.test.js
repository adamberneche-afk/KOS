'use strict';
// gas-lint's size-budget check (CLAUDE.md "Keeping debt down", 2026-11-21): a
// ratchet on deployed source files, string literals and READMEs.

const test = require('node:test');
const assert = require('node:assert/strict');
const { sizeOverages, longestLiteralLines } = require('../../tools/gas-lint/check.js');
const cfg = require('../../tools/gas-lint/size-budgets.json');

const B = { file: 5, literal: 3, readme: 4 };
const lines = (n) => Array.from({ length: n }, (_, i) => '// ' + i).join('\n');

test('longestLiteralLines measures strings and templates, not code', () => {
  assert.equal(longestLiteralLines('const a = `x\ny\nz`;\nconst b = "q";'), 3);
  assert.equal(longestLiteralLines('function f() {\n  return 1;\n}\n'), 0);
});

test('a file, a literal and a README are each held to their own budget', () => {
  const over = sizeOverages([
    { path: 'x/a.js', text: lines(6) },
    { path: 'x/b.js', text: 'const t = `1\n2\n3\n4`;' },
    { path: 'x/README.md', text: lines(5) },
    { path: 'x/ok.js', text: lines(5) },
  ], B);
  assert.deepEqual(over.map((o) => [o.key, o.kind, o.lines]), [
    ['x/a.js', 'file', 6], ['x/b.js#literal', 'literal', 4], ['x/README.md', 'readme', 5]]);
});

test('a README is not held to the file budget, and a LeaderHub fragment is not lexed for literals', () => {
  assert.deepEqual(sizeOverages([{ path: 'README.md', text: lines(4) }], B), []);
  assert.deepEqual(sizeOverages([{ path: 'leader-hub/src/01-x.html', text: 'let s = `a\nb\nc\nd`' }], B), []);
});

test('the budgets are the agreed ones, and every listed overage records its size and why', () => {
  assert.deepEqual(cfg.budgets, { file: 1500, literal: 100, readme: 250 });
  Object.entries(cfg.over).forEach(([k, v]) => {
    assert.ok(Number.isInteger(v.lines) && v.lines > 0, k);
    assert.ok(String(v.why || '').length > 20, k);
  });
});
