'use strict';
// gas-lint's syntax check: a deployed .js/.gs file that doesn't parse fails
// the build (found 2026-11-22: a lost quote in 34b passed gas-lint and every
// fast check; only the test suite caught it).

const test = require('node:test');
const assert = require('node:assert/strict');
const { findSyntaxErrors } = require('../../tools/gas-lint/check.js');

test('a file that does not parse is named, with its line', () => {
  const out = findSyntaxErrors([
    { file: 'p/ok.js', code: 'function a() {\n  return `x ${1}`;\n}\n' },
    { file: 'p/bad.js', code: 'function b() {\n  return "open\n    (no code issued)";\n}\n' },
    { file: 'p/also.gs', code: 'const x = ;\n' },
  ]);
  assert.deepEqual(out.map((e) => e.file), ['p/bad.js', 'p/also.gs']);
  assert.ok(out.every((e) => e.line > 0 && e.message), JSON.stringify(out));
});

test('modern syntax Apps Script V8 accepts parses', () => {
  assert.deepEqual(findSyntaxErrors([{ file: 'p/v8.js',
    code: 'const f = (a = 1, ...r) => ({ a, ...r });\nclass C { #x = 1; get x() { return this.#x; } }\nconst y = a?.b ?? 2;\n' }]), []);
});

test('every deployed file in the repo parses', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..', '..');
  const map = require('../../tools/gas-lint/project-map.json');
  const files = new Set();
  Object.entries(map).forEach(([name, def]) => {
    if (!name.startsWith('_')) (def.files || []).filter((f) => /\.(js|gs)$/.test(f)).forEach((f) => files.add(f));
  });
  const sources = [...files].filter((f) => fs.existsSync(path.join(ROOT, f)))
    .map((f) => ({ file: f, code: fs.readFileSync(path.join(ROOT, f), 'utf8') }));
  assert.ok(sources.length > 100);
  assert.deepEqual(findSyntaxErrors(sources), []);
});
