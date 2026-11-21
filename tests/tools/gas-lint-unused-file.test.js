'use strict';
// gas-lint's unused-file check (CLAUDE.md "Keeping debt down": retiring is
// deleting): a deployed file nothing in its project uses is an error.

const test = require('node:test');
const assert = require('node:assert/strict');
const { findUnusedFiles } = require('../../tools/gas-lint/check.js');

test('a file of comments only, or whose private names nothing calls, is unused', () => {
  const out = findUnusedFiles([
    { file: 'p/17_Doc.js', code: '// architecture notes only\n' },
    { file: 'p/20_Dead.js', code: 'function helper_() { return 1; }\nconst X_ = 2;\n' },
    { file: 'p/30_Live.js', code: 'function main() { return 3; }\n' },
  ]);
  assert.deepEqual(out.map((u) => u.file), ['p/17_Doc.js', 'p/20_Dead.js']);
});

test('a public function, a call from another file, a trigger name in a string, or a page script counts as a use', () => {
  assert.deepEqual(findUnusedFiles([
    { file: 'p/a.js', code: 'function helper_() {}\n' },
    { file: 'p/b.js', code: 'function run() { helper_(); }\n' },
    { file: 'p/c.js', code: 'function nightly_() {}\n' },
    { file: 'p/d.js', code: 'function install() { ScriptApp.newTrigger("nightly_"); }\n' },
    { file: 'p/e.js', code: 'const PAGE_ONLY_ = 1;\n' },
    { file: 'p/page.html', code: 'var x = PAGE_ONLY_;\n' },
  ]), []);
});

test('the repo has no unused deployed file (17_MasterStudentTemplate.js was the one)', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..', '..');
  const decls = require('../../tools/lib/declarations.js');
  const map = require('../../tools/gas-lint/project-map.json');
  for (const [name, def] of Object.entries(map)) {
    if (name.startsWith('_')) continue;
    const sources = (def.files || []).concat(def.html || []).filter((f) => fs.existsSync(path.join(ROOT, f))).map((f) => {
      const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return { file: f, code: f.endsWith('.html') ? decls.scriptText(raw, f) : raw };
    });
    assert.deepEqual(findUnusedFiles(sources), [], name);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'cas-ccps', 'scripts', '17_MasterStudentTemplate.js')));
});

test('a name with $ in it is matched as itself, not as a regex', () => {
  assert.deepEqual(findUnusedFiles([
    { file: 'p/a.js', code: 'function $wrap_() {}\n' },
    { file: 'p/b.js', code: 'function run() { $wrap_(); }\n' },
  ]), []);
  assert.deepEqual(findUnusedFiles([
    { file: 'p/a.js', code: 'function a$b_() {}\n' },
    { file: 'p/b.js', code: 'function run() { ab_(); }\n' },
  ]).map((u) => u.file), ['p/a.js']);
});
