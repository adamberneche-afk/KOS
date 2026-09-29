'use strict';
// gas-lint's unmapped-file check. project-map.json is what tools/clasp-sync
// pushes and what every other gas-lint check scans, so a new script file
// nobody added to it is never deployed and never linted.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findUnmappedFiles, listDeployableSourceFiles } = require('../../tools/gas-lint/check.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const PROJECT_MAP = require('../../tools/gas-lint/project-map.json');

const MAP = {
  _comment: 'x',
  'a:one': { files: ['a/1.gs'], html: ['a/ui.html'] },
  'a:two': { files: ['a/1.gs', 'a/2.gs'] },
  _excluded_not_deployed_scripts: ['a/old.gs'],
};

test('findUnmappedFiles: a file in no project and not excluded is reported', () => {
  assert.deepEqual(
    findUnmappedFiles(['a/1.gs', 'a/2.gs', 'a/ui.html', 'a/old.gs', 'a/new.gs'], MAP),
    ['a/new.gs']);
});

test('findUnmappedFiles: html counts as mapped, and _-prefixed keys are not projects', () => {
  assert.deepEqual(findUnmappedFiles(['a/ui.html'], MAP), []);
  assert.deepEqual(findUnmappedFiles(['a/x.gs'], { _note: { files: ['a/x.gs'] } }), ['a/x.gs']);
});

test('every deployable source file in the repo is mapped or excluded', () => {
  assert.deepEqual(findUnmappedFiles(listDeployableSourceFiles(), PROJECT_MAP), []);
});

test('listDeployableSourceFiles covers the folders clasp-sync deploys from', () => {
  const files = listDeployableSourceFiles();
  for (const expected of [
    'cas-ccps/scripts/00_SharedConfig.js',
    'kos-personal/10_Turnstile.gs',
    'kos-personal/8_WebApp_UI.html',
    'kos-personal/studio-steps/StepsShared.gs',
    'leader-hub/Code.gs',
  ]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, expected)), expected + ' should exist');
    assert.ok(files.includes(expected), expected + ' should be scanned');
  }
});
