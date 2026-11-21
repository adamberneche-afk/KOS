'use strict';
// Every check CI's gas-lint workflow runs, in the same order, from one
// command (structure audit 4.9, 2026-11-21): `npm run check`. `--fast`
// (`npm run check:fast`) leaves out the test suite and the coverage check
// that reads it, the two slow steps. Not here: actionlint, which CI
// downloads, and the docs-check, which compares a PR with its base.
//
// Each step runs to the end even when an earlier one failed, so one run
// shows everything; the exit code is 1 if any step failed.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FAST = process.argv.includes('--fast');
const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kos-coverage-'));

const STEPS = [
  ['gas-lint', ['node', 'tools/gas-lint/check.js']],
  ['doc-currency', ['node', 'tools/doc-currency/check.js']],
  ['setup guide reference', ['node', 'tools/setup-guide/build.js', '--check']],
  ['archive catalog and indexes', ['node', 'tools/archive/build.js', '--check']],
  ['student data scan', ['node', 'tools/student-data-scan/check.js']],
  ['release check', ['node', 'tools/release-check/check.js']],
  ['clasp-sync build', ['node', 'tools/clasp-sync/sync.js']],
  ['tests', ['npm', 'test'], { NODE_V8_COVERAGE: coverageDir }, 'slow'],
  ['scheduled handlers with no coverage', ['node', 'tools/coverage-gaps/check.js', '--coverage-dir', coverageDir], {}, 'slow'],
  ['student-leader-hub.html scripts', ['node', 'tools/html-lint/check.js', 'leader-hub/student-leader-hub.html']],
];

const results = [];
for (const [name, cmd, env, slow] of STEPS) {
  if (FAST && slow) continue;
  const start = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
    env: Object.assign({}, process.env, env || {}), maxBuffer: 64 * 1024 * 1024,
  });
  const ok = r.status === 0;
  results.push({ name, ok, secs: Math.round((Date.now() - start) / 100) / 10 });
  if (!ok) {
    console.log('\n── ' + name + ' failed (' + cmd.join(' ') + ') ──');
    console.log(String((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-40).join('\n'));
  }
}
fs.rmSync(coverageDir, { recursive: true, force: true });

console.log('');
results.forEach((r) => console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.name + '  (' + r.secs + ' s)'));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? '\n' + failed + ' step(s) failed.' : '\nAll ' + results.length + ' steps passed' + (FAST ? ' (fast: no tests).' : '.'));
process.exit(failed ? 1 : 0);
