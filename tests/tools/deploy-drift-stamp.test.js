'use strict';
// Regression tests for tools/deploy-drift/stamp.js — writes
// expected-marker.js's own computed SHA for a project into that
// project's marker file, as its own separate commit-to-be (see
// kos-personal/18_DeployVersionMarker.gs's header for why this has to be
// a separate step from the code change it follows).
//
// Runs against real temp files (not the repo's own marker file) so it
// never touches this checkout's actual, currently-stamped state.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STAMP_PATH = require.resolve('../../tools/deploy-drift/stamp.js');

// stamp.js resolves REPO_ROOT from its own file location and reads
// MARKER_FILES paths relative to that root — so exercising it against a
// throwaway project requires monkeying with its exported MARKER_FILES map
// directly rather than faking a whole repo layout. `stamp()` itself takes
// no repo-root parameter, so these tests add a temp entry pointing at a
// real file under REPO_ROOT/tools/deploy-drift/ (cleaned up after).
//
// stamp() now delegates to expected-marker.js, which requires a REAL
// project-map.json key (it computes "last commit touching this project's
// files") — so these tests piggyback on 'kos-personal', a project that
// already exists in project-map.json, temporarily redirecting its
// MARKER_FILES entry at a throwaway fixture file instead of a made-up
// project name. This deliberately does NOT assume `git rev-parse HEAD`
// is the expected value — that assumption is exactly the bug this file
// regression-tests against (see stamp.js's own comment on the fix).
const { stamp, MARKER_FILES } = require(STAMP_PATH);
const { expectedMarkerForProject } = require('../../tools/deploy-drift/expected-marker.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..');

test('stamp: replaces the 40-hex-char constant value with expected-marker.js\'s computed SHA, leaves everything else untouched', () => {
  const relPath = 'tools/deploy-drift/__test_marker_fixture.gs';
  const absPath = path.join(REPO_ROOT, relPath);
  fs.writeFileSync(absPath, "// a header comment\nconst FIXTURE_SHA = '0000000000000000000000000000000000000000'; // trailing comment\n");
  const original = MARKER_FILES['kos-personal'];
  MARKER_FILES['kos-personal'] = { file: relPath, constant: 'FIXTURE_SHA' };

  try {
    const expectedSha = expectedMarkerForProject('kos-personal').sha;
    const result = stamp('kos-personal');
    assert.equal(result.sha, expectedSha);

    const updated = fs.readFileSync(absPath, 'utf8');
    assert.match(updated, new RegExp(`const FIXTURE_SHA = '${expectedSha}';`));
    assert.match(updated, /\/\/ a header comment/);
    assert.match(updated, /\/\/ trailing comment/);
  } finally {
    fs.unlinkSync(absPath);
    MARKER_FILES['kos-personal'] = original;
  }
});

test('stamp: throws for a project with no configured marker file, writes nothing', () => {
  assert.throws(() => stamp('not-a-configured-project'), /No marker file configured/);
});

test('stamp: throws for a project name expected-marker.js doesn\'t recognize, writes nothing', () => {
  // A MARKER_FILES entry could exist for a project-map.json key that gets
  // renamed/removed later — stamp() must fail loudly, not fall back to
  // some other SHA.
  const relPath = 'tools/deploy-drift/__test_marker_fixture4.gs';
  MARKER_FILES.__test_project_unknown_to_map = { file: relPath, constant: 'FIXTURE_SHA' };
  try {
    assert.throws(() => stamp('__test_project_unknown_to_map'), /Unknown project/);
  } finally {
    delete MARKER_FILES.__test_project_unknown_to_map;
  }
});

test('stamp: throws if the constant name/format in the file doesn\'t match — never silently no-ops', () => {
  const relPath = 'tools/deploy-drift/__test_marker_fixture2.gs';
  const absPath = path.join(REPO_ROOT, relPath);
  fs.writeFileSync(absPath, "const WRONG_NAME = '0000000000000000000000000000000000000000';\n");
  const original = MARKER_FILES['kos-personal'];
  MARKER_FILES['kos-personal'] = { file: relPath, constant: 'FIXTURE_SHA' };

  try {
    assert.throws(() => stamp('kos-personal'), /Could not find/);
  } finally {
    fs.unlinkSync(absPath);
    MARKER_FILES['kos-personal'] = original;
  }
});

test('MARKER_FILES: kos-personal is wired to its real marker file and constant name', () => {
  assert.deepEqual(MARKER_FILES['kos-personal'], {
    file: 'kos-personal/18_DeployVersionMarker.gs',
    constant: 'KOS_DEPLOY_VERSION_SHA',
  });
});
