'use strict';
// Regression tests for tools/deploy-drift/stamp.js — writes the current
// git HEAD SHA into a GAS project's marker file, as its own separate
// commit-to-be (see kos-personal/18_DeployVersionMarker.gs's header for
// why this has to be a separate step from the code change it follows).
//
// Runs against real temp files (not the repo's own marker file) so it
// never touches this checkout's actual, currently-stamped state.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const STAMP_PATH = require.resolve('../../tools/deploy-drift/stamp.js');

// stamp.js resolves REPO_ROOT from its own file location and reads
// MARKER_FILES paths relative to that root — so exercising it against a
// throwaway project requires monkeying with its exported MARKER_FILES map
// directly rather than faking a whole repo layout. `stamp()` itself takes
// no repo-root parameter, so these tests add a temp entry pointing at a
// real file under REPO_ROOT/tools/deploy-drift/ (cleaned up after).
const { stamp, MARKER_FILES } = require(STAMP_PATH);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

test('stamp: replaces the 40-hex-char constant value with current HEAD, leaves everything else untouched', () => {
  const relPath = 'tools/deploy-drift/__test_marker_fixture.gs';
  const absPath = path.join(REPO_ROOT, relPath);
  fs.writeFileSync(absPath, "// a header comment\nconst FIXTURE_SHA = '0000000000000000000000000000000000000000'; // trailing comment\n");
  MARKER_FILES.__test_project = { file: relPath, constant: 'FIXTURE_SHA' };

  try {
    const expectedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const result = stamp('__test_project');
    assert.equal(result.sha, expectedSha);

    const updated = fs.readFileSync(absPath, 'utf8');
    assert.match(updated, new RegExp(`const FIXTURE_SHA = '${expectedSha}';`));
    assert.match(updated, /\/\/ a header comment/);
    assert.match(updated, /\/\/ trailing comment/);
  } finally {
    fs.unlinkSync(absPath);
    delete MARKER_FILES.__test_project;
  }
});

test('stamp: throws for a project with no configured marker file, writes nothing', () => {
  assert.throws(() => stamp('not-a-configured-project'), /No marker file configured/);
});

test('stamp: throws if the constant name/format in the file doesn\'t match — never silently no-ops', () => {
  const relPath = 'tools/deploy-drift/__test_marker_fixture2.gs';
  const absPath = path.join(REPO_ROOT, relPath);
  fs.writeFileSync(absPath, "const WRONG_NAME = '0000000000000000000000000000000000000000';\n");
  MARKER_FILES.__test_project2 = { file: relPath, constant: 'FIXTURE_SHA' };

  try {
    assert.throws(() => stamp('__test_project2'), /Could not find/);
  } finally {
    fs.unlinkSync(absPath);
    delete MARKER_FILES.__test_project2;
  }
});

test('MARKER_FILES: kos-personal is wired to its real marker file and constant name', () => {
  assert.deepEqual(MARKER_FILES['kos-personal'], {
    file: 'kos-personal/18_DeployVersionMarker.gs',
    constant: 'KOS_DEPLOY_VERSION_SHA',
  });
});
