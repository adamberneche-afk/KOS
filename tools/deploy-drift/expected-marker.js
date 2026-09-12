#!/usr/bin/env node
// =============================================================================
// deploy-drift/expected-marker — "what should a GAS project's self-reported
// version marker say right now, according to git?"
//
// This is the git-side half of Phase 3 (meta/PROCESS_HARDENING_SPRINT.md).
// It needs no network access and no credential of any kind — everything it
// answers comes from this repo's own commit history. The other half (a GAS
// project pushing its own live marker to this repo via `repository_dispatch`)
// lives in the project's own code, not here; `.github/workflows/deploy-drift.yml`
// is what calls this script to check what that report SHOULD have said.
//
// "The marker" is the full commit SHA of the most recent commit that touched
// ANY file in the project's `project-map.json` entry — deliberately the full
// 40-char SHA, not an abbreviated one: git's abbreviation length isn't fixed
// (it grows as a repo needs more characters to stay unique), so two correct
// computations of "the same commit" could print different-length short SHAs
// depending on when/where they run. The full SHA has no such ambiguity; a
// short form is fine for a human-readable message, never for the actual
// equality check.
//
// Usage:
//   node tools/deploy-drift/expected-marker.js <projectName>   → JSON on stdout
//   node tools/deploy-drift/expected-marker.js --list          → every known project name
// Exit code 1 on an unknown project name or a git error.
// =============================================================================

const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_MAP = require('../gas-lint/project-map.json');

// A project's self-reported marker constant necessarily lives in its own
// dedicated file, excluded here — a commit can't embed its own SHA (the
// SHA is a hash of the commit's content), so the marker is stamped in a
// SEPARATE commit, after the fact, by `stamp.js`. If this file's own edits
// counted toward "what commit does git expect," the marker would always
// be exactly one commit stale by construction. See
// kos-personal/18_DeployVersionMarker.gs's own header for the full
// reasoning, and stamp.js for the tool that writes it.
//
// The excluded file still belongs in project-map.json's normal file list
// (Check A/coverage-gaps/every other gas-lint check should still know it's
// part of the project's live scope) — this is a second, narrower
// exclusion that applies only to this one script's own "what does git
// expect" computation, not to the project's file manifest in general.
const MARKER_FILE_EXCLUSIONS = {
  'kos-personal': ['kos-personal/18_DeployVersionMarker.gs'],
  'leader-hub:app': ['leader-hub/DeployVersionMarker.gs'],
};

function knownProjectNames() {
  return Object.keys(PROJECT_MAP).filter((k) => !k.startsWith('_'));
}

function filesForProject(projectName) {
  const def = PROJECT_MAP[projectName];
  if (!def) return null;
  // The manifest and the html file(s) are as much "this project's live
  // surface" as its .gs/.js files — a manifest-only OAuth scope change or an
  // HTML-only edit is still a real change that needs pushing, so both are
  // in scope for "what commit last touched this project."
  const files = [...(def.files || []), ...(def.html || [])];
  if (def.manifest) files.push(def.manifest);
  return files;
}

// Runs `git log -1` with every one of the project's files as a pathspec —
// this returns the single most recent commit that touched ANY of them, not
// just the first file, which is exactly "when did this project's live
// surface last change." Excludes MARKER_FILE_EXCLUSIONS entries — see their
// comment above for why.
function expectedMarkerForProject(projectName) {
  const allFiles = filesForProject(projectName);
  if (!allFiles) {
    throw new Error(
      `Unknown project "${projectName}" — not a key in tools/gas-lint/project-map.json. ` +
      `Known projects: ${knownProjectNames().join(', ')}`
    );
  }
  const excluded = new Set(MARKER_FILE_EXCLUSIONS[projectName] || []);
  const files = allFiles.filter((f) => !excluded.has(f));
  const existing = files.filter((f) => {
    try { execFileSync('git', ['cat-file', '-e', `HEAD:${f}`], { cwd: REPO_ROOT }); return true; }
    catch (e) { return false; }
  });
  if (!existing.length) {
    return { project: projectName, sha: null, committedAt: null, subject: null, files };
  }

  const out = execFileSync(
    'git',
    ['log', '-1', '--format=%H%x1f%cI%x1f%s', '--', ...existing],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).trim();

  if (!out) {
    // Tracked, but never committed on this branch's reachable history —
    // shouldn't happen for real project files, but fail informatively
    // rather than silently returning a made-up marker.
    return { project: projectName, sha: null, committedAt: null, subject: null, files: existing };
  }

  const [sha, committedAt, subject] = out.split('\x1f');
  return { project: projectName, sha, committedAt, subject, files: existing };
}

module.exports = { expectedMarkerForProject, filesForProject, knownProjectNames };

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg || arg === '--help' || arg === '-h') {
    console.error('Usage: node tools/deploy-drift/expected-marker.js <projectName> | --list');
    process.exit(1);
  }
  if (arg === '--list') {
    console.log(JSON.stringify(knownProjectNames(), null, 2));
    process.exit(0);
  }
  try {
    const result = expectedMarkerForProject(arg);
    console.log(JSON.stringify(result, null, 2));
    if (!result.sha) process.exit(1);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
