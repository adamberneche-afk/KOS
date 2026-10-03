'use strict';
// The flat projects (kos-personal, leader-hub) push with a .claspignore
// that ignores everything ("**/**") and lets files back in one by one
// ("!name"). A source file added to the project but not to that list is
// never pushed, and since clasp push mirrors local to remote, it is also
// deleted from the live project if it was there (DEPLOYMENT_GUIDE.md's
// Round 24 banner). 21_VectorMatrixRepair.gs shipped without an entry on
// 2026-10-03; nothing caught it. This test holds each .claspignore to the
// files tools/gas-lint/project-map.json declares for that project.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'gas-lint', 'project-map.json'), 'utf8'));

function allowList(dir) {
  return fs.readFileSync(path.join(ROOT, dir, '.claspignore'), 'utf8')
    .split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l.startsWith('!')).map((l) => l.slice(1));
}

const projects = Object.keys(MAP)
  .filter((k) => !k.startsWith('_') && MAP[k] && MAP[k].manifest)
  .map((k) => ({ key: k, dir: path.dirname(MAP[k].manifest), entry: MAP[k] }))
  .filter((p) => fs.existsSync(path.join(ROOT, p.dir, '.claspignore')));

test('there is at least one .claspignore project to check', () => {
  assert.ok(projects.length >= 2, 'expected kos-personal and leader-hub');
});

for (const p of projects) {
  test(p.key + ': every source file the project declares is let back in by its .claspignore', () => {
    const allowed = new Set(allowList(p.dir));
    const declared = [p.entry.manifest].concat(p.entry.files || [], p.entry.html || [])
      .filter((f) => path.dirname(f) === p.dir)
      .map((f) => path.basename(f));
    const missing = declared.filter((f) => !allowed.has(f));
    assert.deepEqual(missing, [],
      'add "!' + (missing[0] || '') + '" (and the rest) to ' + p.dir + '/.claspignore, or clasp push leaves them out');
  });
}
