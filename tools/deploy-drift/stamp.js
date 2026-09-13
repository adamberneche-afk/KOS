#!/usr/bin/env node
// =============================================================================
// deploy-drift/stamp — writes the current HEAD SHA into a GAS project's
// marker file (kos-personal/18_DeployVersionMarker.gs, for example), so
// that project's next self-report matches what
// tools/deploy-drift/expected-marker.js will compute.
//
// Run this AFTER committing a real code change, as its own SEPARATE commit
// — never combined with the functional change, and never hand-edited. See
// kos-personal/18_DeployVersionMarker.gs's own header comment for why the
// two have to be separate commits.
//
// Usage: node tools/deploy-drift/stamp.js <projectName>
// Exits non-zero (and writes nothing) if the project has no configured
// marker file — not every project needs one yet, only those wired into
// the self-report mechanism (see tools/deploy-drift/README.md).
// =============================================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// One entry per project that self-reports. `constant` must match the name
// declared in `file` exactly, or the regex replace below silently does
// nothing and this tool would report success without changing anything —
// checked explicitly, not assumed.
const MARKER_FILES = {
  'kos-personal': { file: 'kos-personal/18_DeployVersionMarker.gs', constant: 'KOS_DEPLOY_VERSION_SHA' },
  'leader-hub:app': { file: 'leader-hub/DeployVersionMarker.gs', constant: 'LH_DEPLOY_VERSION_SHA' },
  // The 7 cas-ccps entries below all use the same constant name
  // (DEPLOY_VERSION_SHA) — safe because each marker file is scoped to
  // exactly one project in project-map.json and none of the 7 ever
  // shares a GAS global scope with another (Check A's collision check
  // only cares about files that share a project).
  'cas-ccps:central-ledger': { file: 'cas-ccps/scripts/43_DeployVersionMarker_CentralLedger.js', constant: 'DEPLOY_VERSION_SHA' },
  'cas-ccps:unified-manual': { file: 'cas-ccps/scripts/44_DeployVersionMarker_UnifiedManual.js', constant: 'DEPLOY_VERSION_SHA' },
  'cas-ccps:master-student-template': { file: 'cas-ccps/scripts/45_DeployVersionMarker_MasterStudentTemplate.js', constant: 'DEPLOY_VERSION_SHA' },
  'cas-ccps:rubric-response-sheet': { file: 'cas-ccps/scripts/46_DeployVersionMarker_RubricResponseSheet.js', constant: 'DEPLOY_VERSION_SHA' },
  'cas-ccps:teacher-matrix-sheet': { file: 'cas-ccps/scripts/47_DeployVersionMarker_TeacherMatrixSheet.js', constant: 'DEPLOY_VERSION_SHA' },
  'cas-ccps:teacher-dashboard': { file: 'cas-ccps/scripts/48_DeployVersionMarker_TeacherDashboard.js', constant: 'DEPLOY_VERSION_SHA' },
  'cas-ccps:student-dashboard': { file: 'cas-ccps/scripts/49_DeployVersionMarker_StudentDashboard.js', constant: 'DEPLOY_VERSION_SHA' },
};

function currentHeadSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function stamp(projectName) {
  const config = MARKER_FILES[projectName];
  if (!config) {
    throw new Error(
      `No marker file configured for "${projectName}" in tools/deploy-drift/stamp.js's ` +
      `MARKER_FILES — known: ${Object.keys(MARKER_FILES).join(', ')}`
    );
  }

  const sha = currentHeadSha();
  const filePath = path.join(REPO_ROOT, config.file);
  const src = fs.readFileSync(filePath, 'utf8');
  const re = new RegExp(`(const\\s+${config.constant}\\s*=\\s*)'[0-9a-f]{40}'`);
  if (!re.test(src)) {
    throw new Error(`Could not find "const ${config.constant} = '<40-hex-chars>'" in ${config.file} — check the constant name/format haven't drifted.`);
  }
  const updated = src.replace(re, `$1'${sha}'`);
  fs.writeFileSync(filePath, updated);
  return { project: projectName, file: config.file, sha };
}

if (require.main === module) {
  const projectName = process.argv[2];
  if (!projectName) {
    console.error('Usage: node tools/deploy-drift/stamp.js <projectName>');
    process.exitCode = 1;
  } else {
    try {
      const result = stamp(projectName);
      console.log(`Stamped ${result.file} with HEAD (${result.sha}).`);
      console.log('Commit ONLY this file now, as its own commit, before pushing.');
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { stamp, MARKER_FILES };
