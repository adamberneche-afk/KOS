'use strict';
// The repo root, the files git tracks, and the Apps Script project map, for
// every tool (structure audit 3.9, 2026-11-21: 29 tool files defined ROOT,
// five wrapped `git ls-files`, eight read the project map). New tools take
// them from here; older ones were moved where they were touched.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_MAP_PATH = path.join(ROOT, 'tools', 'gas-lint', 'project-map.json');

// Repo-relative paths of every tracked file, '/'-separated. Throws when git
// is missing or this isn't a checkout; each caller decides what to do then.
function trackedFiles(cwd) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: cwd || ROOT, maxBuffer: 1 << 30 })
    .toString().split('\0').filter(Boolean);
}

// tools/gas-lint/project-map.json: which files share one Apps Script project.
// Read fresh each call (a test may rewrite it), so callers keep their own copy.
function projectMap() {
  return JSON.parse(fs.readFileSync(PROJECT_MAP_PATH, 'utf8'));
}

module.exports = { ROOT, PROJECT_MAP_PATH, trackedFiles, projectMap };
