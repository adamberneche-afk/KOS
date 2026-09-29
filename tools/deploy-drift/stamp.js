#!/usr/bin/env node
// =============================================================================
// deploy-drift/stamp — writes tools/deploy-drift/expected-marker.js's own
// computed SHA for a project into that project's marker file
// (kos-personal/18_DeployVersionMarker.gs, for example) — never bare
// `git rev-parse HEAD`, which silently disagrees with expected-marker.js
// the moment any commit unrelated to this project lands in between (see
// the inline comment on the expected-marker.js call below for the
// incident that caught this). This guarantees stamp.js and the drift
// check can never disagree about what "current" means for a project.
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
const { expectedMarkerForProject, MARKER_FILES } = require('./expected-marker.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// One entry per project that self-reports, shared with expected-marker.js
// (see there).

function stamp(projectName) {
  const config = MARKER_FILES[projectName];
  if (!config) {
    throw new Error(
      `No marker file configured for "${projectName}" in tools/deploy-drift/stamp.js's ` +
      `MARKER_FILES — known: ${Object.keys(MARKER_FILES).join(', ')}`
    );
  }

  // Bug fixed 2026-09-14 (caught live during the Phase 3b rollout, before
  // it ever reached a push): this used to stamp `git rev-parse HEAD`
  // unconditionally. That's only correct if nothing unrelated to this
  // project has been committed since its last real change — true right
  // after "commit the code change, immediately stamp" but false the
  // moment any other commit lands first (exactly what happened here:
  // leader-hub:app's marker got re-stamped with a HEAD that was 3
  // cas-ccps-only commits past leader-hub's actual last change, which
  // would have made expected-marker.js disagree with the very value this
  // tool just wrote). Delegating to expected-marker.js's own computation
  // means stamp.js and the drift check can never disagree about what
  // "current" means for a project, however much unrelated history has
  // landed in between.
  const expected = expectedMarkerForProject(projectName);
  if (!expected.sha) {
    throw new Error(`expected-marker.js found no commit for "${projectName}" — nothing to stamp.`);
  }
  const sha = expected.sha;
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
      console.log(`Stamped ${result.file} with ${result.sha} (expected-marker.js's computed SHA for "${result.project}").`);
      console.log('Commit ONLY this file now, as its own commit, before pushing.');
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { stamp, MARKER_FILES };
