'use strict';
// Regression test for tools/leaderhub-build/build.js — the automated
// version of its own --check mode, run as part of npm test so CI catches
// drift between leader-hub/src/*.html and the committed
// leader-hub/student-leader-hub.html the moment it happens, not just
// whenever someone remembers to run --check by hand.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'tools', 'leaderhub-build', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

test('every fragment listed in manifest.json actually exists', () => {
  manifest.fragments.forEach((relPath) => {
    const absPath = path.join(REPO_ROOT, relPath);
    assert.ok(fs.existsSync(absPath), `manifest.json lists ${relPath} but that file does not exist`);
  });
});

test('leader-hub/src/*.html on disk exactly matches manifest.json\'s fragment list (no orphan/unlisted fragment files)', () => {
  const srcDir = path.join(REPO_ROOT, 'leader-hub', 'src');
  const onDisk = fs.readdirSync(srcDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => `leader-hub/src/${f}`)
    .sort();
  const listed = [...manifest.fragments].sort();
  assert.deepEqual(onDisk, listed, 'a fragment file exists that manifest.json does not list, or vice versa');
});

test('concatenating the fragments in manifest order reproduces the committed assembled file byte-for-byte', () => {
  const assembled = manifest.fragments
    .map((relPath) => fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8'))
    .join('');
  const committed = fs.readFileSync(path.join(REPO_ROOT, manifest.output), 'utf8');
  assert.equal(
    assembled, committed,
    'leader-hub/student-leader-hub.html was hand-edited directly, or a fragment changed without ' +
    'rebuilding — run `node tools/leaderhub-build/build.js` and commit the regenerated output.',
  );
});

test('every fragment is non-empty (a genuinely empty fragment would signal a bad split, not a real section)', () => {
  manifest.fragments.forEach((relPath) => {
    const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
    assert.ok(content.length > 0, `${relPath} is empty`);
  });
});
