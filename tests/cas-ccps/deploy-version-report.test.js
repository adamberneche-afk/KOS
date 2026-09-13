'use strict';
// Regression tests for cas-ccps's deploy-drift self-report (process-
// hardening sprint Phase 3b — meta/PROCESS_HARDENING_SPRINT.md).
//
// Unlike kos-personal/leader-hub (one project each, one reporting
// function each), 00_SharedConfig.js is pasted into every cas-ccps
// project in this rollout, so the actual UrlFetchApp/token logic lives
// ONCE there (_reportDeployVersion_(projectName, sha)) — each project
// gets only a tiny marker+wrapper file supplying its own real
// project-map.json key and its own independently-stamped SHA. These
// tests cover the shared logic once, then loop over all 7 marker files
// to confirm each one is wired to the right project name — the one thing
// that's easy to typo when 7 files are this similar to each other.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const SHARED_CONFIG = path.join(SCRIPTS, '00_SharedConfig.js');

// One entry per marker file — must match tools/deploy-drift/stamp.js's
// MARKER_FILES and tools/gas-lint/project-map.json exactly.
const MARKER_FILES = [
  { file: '43_DeployVersionMarker_CentralLedger.js', project: 'cas-ccps:central-ledger' },
  { file: '44_DeployVersionMarker_UnifiedManual.js', project: 'cas-ccps:unified-manual' },
  { file: '45_DeployVersionMarker_MasterStudentTemplate.js', project: 'cas-ccps:master-student-template' },
  { file: '46_DeployVersionMarker_RubricResponseSheet.js', project: 'cas-ccps:rubric-response-sheet' },
  { file: '47_DeployVersionMarker_TeacherMatrixSheet.js', project: 'cas-ccps:teacher-matrix-sheet' },
  { file: '48_DeployVersionMarker_TeacherDashboard.js', project: 'cas-ccps:teacher-dashboard' },
  { file: '49_DeployVersionMarker_StudentDashboard.js', project: 'cas-ccps:student-dashboard' },
];

// ── shared implementation, tested once ───────────────────────────────────

function loadShared(overrides = {}) {
  return loadGasFiles([SHARED_CONFIG], ['_reportDeployVersion_'], overrides);
}

test('_reportDeployVersion_: no token configured — no-ops, returns false, never calls UrlFetchApp', () => {
  let called = false;
  const { exported } = loadShared({
    UrlFetchApp: { fetch: () => { called = true; return { getResponseCode: () => 204 }; } },
  });
  const result = exported._reportDeployVersion_('cas-ccps:central-ledger', 'a'.repeat(40));
  assert.equal(result, false);
  assert.equal(called, false);
});

test('_reportDeployVersion_: token configured — POSTs a repository_dispatch payload with the given project and sha', () => {
  let capturedUrl, capturedOpts;
  const { exported, sandbox } = loadShared({
    UrlFetchApp: {
      fetch: (url, opts) => {
        capturedUrl = url;
        capturedOpts = opts;
        return { getResponseCode: () => 204, getContentText: () => '' };
      },
    },
  });
  sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'test-token-123');

  const sha = 'b'.repeat(40);
  const result = exported._reportDeployVersion_('cas-ccps:teacher-dashboard', sha);
  assert.equal(result, true);

  assert.equal(capturedUrl, 'https://api.github.com/repos/adamberneche-afk/KOS/dispatches');
  assert.equal(capturedOpts.method, 'post');
  assert.equal(capturedOpts.headers.Authorization, 'Bearer test-token-123');
  assert.ok(capturedOpts.headers['User-Agent']);

  const body = JSON.parse(capturedOpts.payload);
  assert.equal(body.event_type, 'gas-version-report');
  assert.equal(body.client_payload.project, 'cas-ccps:teacher-dashboard');
  assert.equal(body.client_payload.sha, sha);
  assert.ok(body.client_payload.reportedAt);
});

test('_reportDeployVersion_: a non-204 response is treated as failure, returns false', () => {
  const { exported, sandbox } = loadShared({
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 401, getContentText: () => 'Bad credentials' }) },
  });
  sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'bad-token');
  assert.equal(exported._reportDeployVersion_('cas-ccps:central-ledger', 'c'.repeat(40)), false);
});

test('_reportDeployVersion_: UrlFetchApp throwing is caught, never propagates, returns false', () => {
  const { exported, sandbox } = loadShared({
    UrlFetchApp: { fetch: () => { throw new Error('network down'); } },
  });
  sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'tok');
  assert.doesNotThrow(() => {
    assert.equal(exported._reportDeployVersion_('cas-ccps:central-ledger', 'd'.repeat(40)), false);
  });
});

// ── each project's marker+wrapper file ───────────────────────────────────

for (const { file, project } of MARKER_FILES) {
  test(`${file}: reportDeployVersion() reports exactly "${project}" and its own DEPLOY_VERSION_SHA`, () => {
    let capturedPayload;
    const { exported, sandbox } = loadGasFiles(
      [SHARED_CONFIG, path.join(SCRIPTS, file)],
      ['reportDeployVersion', 'installDeployVersionReportTrigger', 'DEPLOY_VERSION_SHA'],
      { UrlFetchApp: { fetch: (url, opts) => { capturedPayload = JSON.parse(opts.payload); return { getResponseCode: () => 204 }; } } }
    );
    sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'tok');

    assert.equal(exported.reportDeployVersion(), true);
    assert.equal(capturedPayload.client_payload.project, project);
    assert.equal(capturedPayload.client_payload.sha, exported.DEPLOY_VERSION_SHA);
    assert.match(exported.DEPLOY_VERSION_SHA, /^[0-9a-f]{40}$/);
  });

  test(`${file}: installDeployVersionReportTrigger() creates exactly one 6-hourly trigger, idempotently`, () => {
    const { exported, sandbox } = loadGasFiles(
      [SHARED_CONFIG, path.join(SCRIPTS, file)],
      ['installDeployVersionReportTrigger']
    );
    exported.installDeployVersionReportTrigger();
    exported.installDeployVersionReportTrigger();
    const triggers = sandbox.ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'reportDeployVersion');
    assert.equal(triggers.length, 1);
  });
}

test('every marker file targets a distinct, real project-map.json key', () => {
  const projectMap = require('../../tools/gas-lint/project-map.json');
  const seen = new Set();
  for (const { project } of MARKER_FILES) {
    assert.ok(projectMap[project], `"${project}" should be a real project-map.json key`);
    assert.ok(!seen.has(project), `"${project}" is duplicated across marker files`);
    seen.add(project);
  }
});
