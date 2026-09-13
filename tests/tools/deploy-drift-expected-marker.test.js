'use strict';
// Regression tests for tools/deploy-drift/expected-marker.js — the git-side
// half of Phase 3 (meta/PROCESS_HARDENING_SPRINT.md): "what should a GAS
// project's self-reported version marker say right now?"
//
// These run against this repo's REAL commit history rather than a synthetic
// fixture — the function's only job is to correctly wrap `git log`, so the
// most direct check is computing the same thing independently (a second,
// simpler `git log` call in the test itself) and asserting they agree.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  expectedMarkerForProject,
  filesForProject,
  knownProjectNames,
} = require('../../tools/deploy-drift/expected-marker.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const FULL_SHA_RE = /^[0-9a-f]{40}$/;

test('knownProjectNames: real project keys, no "_"-prefixed meta entries', () => {
  const names = knownProjectNames();
  assert.ok(names.includes('kos-personal'));
  assert.ok(names.includes('leader-hub:app'));
  assert.ok(names.includes('cas-ccps:student-dashboard'));
  names.forEach((n) => assert.ok(!n.startsWith('_'), `"${n}" should not be a meta key`));
});

test('filesForProject: includes .gs files, the manifest, and any html', () => {
  const files = filesForProject('kos-personal');
  assert.ok(files.includes('kos-personal/7_WebApp.gs'));
  assert.ok(files.includes('kos-personal/appsscript.json'));
  assert.ok(files.includes('kos-personal/8_WebApp_UI.html'));
});

test('filesForProject: null for an unknown project', () => {
  assert.equal(filesForProject('not-a-real-project'), null);
});

test('expectedMarkerForProject: throws with a helpful message for an unknown project', () => {
  assert.throws(
    () => expectedMarkerForProject('not-a-real-project'),
    /Unknown project "not-a-real-project"/
  );
});

test('expectedMarkerForProject: returns a full 40-char SHA, not an abbreviated one', () => {
  const result = expectedMarkerForProject('kos-personal');
  assert.match(result.sha, FULL_SHA_RE);
});

test('expectedMarkerForProject: agrees with an independently-run git log over the same files', () => {
  // Deliberately a project with NO entry in MARKER_FILE_EXCLUSIONS
  // (cas-ccps:teacher-dashboard, not kos-personal or leader-hub:app) — this
  // test's whole point is confirming a plain, unmodified git log agrees
  // with the function, which isn't true by design for a project whose own
  // marker-stamp commit is the most recent one touching its files. See the
  // dedicated "excludes the marker file itself" test below for that case.
  const files = filesForProject('cas-ccps:teacher-dashboard');
  const expected = execFileSync(
    'git',
    ['log', '-1', '--format=%H', '--', ...files],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).trim();

  const result = expectedMarkerForProject('cas-ccps:teacher-dashboard');
  assert.equal(result.sha, expected);
});

test('expectedMarkerForProject: picks the most recent commit across MULTIPLE files, not just the first one', () => {
  // cas-ccps:central-ledger has 27 files with different edit histories —
  // if this only looked at files[0] it would report a stale SHA whenever a
  // later file in the list was the one most recently touched.
  const files = filesForProject('cas-ccps:central-ledger');
  const expected = execFileSync(
    'git',
    ['log', '-1', '--format=%H', '--', ...files],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).trim();

  const result = expectedMarkerForProject('cas-ccps:central-ledger');
  assert.equal(result.sha, expected);
  assert.ok(result.committedAt, 'expected an ISO commit timestamp');
});

test('expectedMarkerForProject: excludes the marker file itself from its own "what does git expect" computation', () => {
  // kos-personal/18_DeployVersionMarker.gs is in project-map.json's normal
  // file list (filesForProject includes it — every other check should
  // still know it's part of the project) but MUST be excluded from THIS
  // computation specifically, or the marker would always be exactly one
  // commit behind itself by construction — see that file's own header.
  const allFiles = filesForProject('kos-personal');
  assert.ok(allFiles.includes('kos-personal/18_DeployVersionMarker.gs'), 'sanity: should be a normal project file');

  const result = expectedMarkerForProject('kos-personal');
  assert.ok(!result.files.includes('kos-personal/18_DeployVersionMarker.gs'));
});

test('expectedMarkerForProject: same exclusion for leader-hub:app\'s own marker file', () => {
  const allFiles = filesForProject('leader-hub:app');
  assert.ok(allFiles.includes('leader-hub/DeployVersionMarker.gs'), 'sanity: should be a normal project file');

  const result = expectedMarkerForProject('leader-hub:app');
  assert.ok(!result.files.includes('leader-hub/DeployVersionMarker.gs'));
});

test('every known project resolves to a real, non-empty file list with at least one commit', () => {
  for (const name of knownProjectNames()) {
    const result = expectedMarkerForProject(name);
    assert.match(result.sha, FULL_SHA_RE, `${name} should have a resolvable SHA`);
  }
});
