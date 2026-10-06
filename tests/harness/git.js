'use strict';
// Some tools read this repo's git history (deploy-drift's expected marker,
// the notebook-codebase file list). A zip of main has no .git, so tests
// that need history skip there with a reason instead of failing. CI always
// has a checkout, so they always run there.

const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');

function hasGitHistory() {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return path.resolve(top) === path.resolve(REPO_ROOT);
  } catch (e) {
    return false;
  }
}

const HAS_GIT = hasGitHistory();
const NEEDS_GIT = { skip: HAS_GIT ? false : 'needs git history; this copy has no .git (a zip of main?)' };

module.exports = { HAS_GIT, NEEDS_GIT };
