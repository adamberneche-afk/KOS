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
// 00's per-project shares (structure audit 4.6): load with 00, as 00 held them.
const SHARED_CONFIG_PARTS = [path.join(SCRIPTS, '00c_CentralLedgerShared.js'), path.join(SCRIPTS, '00d_TeacherDashboardShared.js'), path.join(SCRIPTS, '00e_StudentDashboardShared.js')];

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
  { file: '62_DeployVersionMarker_FamilySentinel.js', project: 'cas-ccps:family-sentinel' },
];

// ── shared implementation, tested once ───────────────────────────────────

function loadShared(overrides = {}) {
  return loadGasFiles([SHARED_CONFIG, ...SHARED_CONFIG_PARTS], ['_reportDeployVersion_'], overrides);
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
      [SHARED_CONFIG, ...SHARED_CONFIG_PARTS, path.join(SCRIPTS, '00b_ScriptOwnerGuard.js'), path.join(SCRIPTS, file)],
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
      [SHARED_CONFIG, ...SHARED_CONFIG_PARTS, path.join(SCRIPTS, '00b_ScriptOwnerGuard.js'), path.join(SCRIPTS, file)],
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

// ── the permission check (2026-11-19) ────────────────────────────────────
// The Student Dashboard's Slides scope was in its manifest but not granted;
// running reportDeployVersion brought no prompt, and a student's Submit
// failed SLIDES_UNREADABLE. reportDeployVersion now tries each scope and
// fails, after reporting, naming any the account can't use.

const SCOPE_PREFIX = 'https://www.googleapis.com/auth/';

test('DEPLOY_PROJECT_SCOPES is every project\'s manifest oauthScopes, the marker projects included', () => {
  const projectMap = require('../../tools/gas-lint/project-map.json');
  const { exported } = loadGasFiles([SHARED_CONFIG, ...SHARED_CONFIG_PARTS], ['DEPLOY_PROJECT_SCOPES', 'DEPLOY_SCOPE_PROBES']);
  const table = JSON.parse(JSON.stringify(exported.DEPLOY_PROJECT_SCOPES));
  const withManifest = Object.keys(projectMap).filter((k) => !k.startsWith('_') && projectMap[k].manifest);
  assert.deepEqual(Object.keys(table).sort(), withManifest.sort());
  MARKER_FILES.forEach(({ project }) => assert.ok(table[project], project));
  for (const project of withManifest) {
    const manifest = require(path.join(__dirname, '..', '..', projectMap[project].manifest));
    assert.deepEqual(table[project].slice().sort(), manifest.oauthScopes.map((s) => s.replace(SCOPE_PREFIX, '')).sort(),
      project + ': run node tools/flow-harness-sync/sync-deploy-report.js');
  }
  // Every probed scope is one some project lists.
  const listed = new Set([].concat(...Object.values(table)));
  Object.keys(exported.DEPLOY_SCOPE_PROBES).forEach((s) => assert.ok(listed.has(s), s));
});

function loadStudentDashboardMarker(overrides) {
  const sent = [];
  const env = loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '00c_CentralLedgerShared.js'), path.join(SCRIPTS, '00d_TeacherDashboardShared.js'), path.join(SCRIPTS, '00e_StudentDashboardShared.js'), path.join(SCRIPTS, '00b_ScriptOwnerGuard.js'),
      path.join(SCRIPTS, '49_DeployVersionMarker_StudentDashboard.js')],
    ['reportDeployVersion', '_deployPermissionGaps_'],
    Object.assign({ UrlFetchApp: { fetch: (url, opts) => { sent.push(JSON.parse(opts.payload)); return { getResponseCode: () => 204 }; } } },
      overrides || {})
  );
  env.sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'tok');
  return Object.assign(env, { sent });
}

test('a scope the account hasn\'t granted: the version is still reported, then the run fails naming it and the fix', () => {
  const denied = (svc, fn) => () => {
    throw new Error('You do not have permission to call ' + svc + '.' + fn + '. Required permissions: ' + SCOPE_PREFIX + 'presentations');
  };
  const env = loadStudentDashboardMarker({ SlidesApp: { openById: denied('SlidesApp', 'openById') } });
  assert.deepEqual(JSON.parse(JSON.stringify(env.exported._deployPermissionGaps_('cas-ccps:student-dashboard'))),
    ['presentations (SlidesApp)']);
  assert.throws(() => env.exported.reportDeployVersion(),
    /student-dashboard is missing a permission: presentations \(SlidesApp\)\..*Project OAuth Scopes.*myaccount\.google\.com\/connections/);
  assert.equal(env.sent.length >= 1, true, 'reported before failing');
  assert.equal(env.sent[env.sent.length - 1].client_payload.project, 'cas-ccps:student-dashboard');
});

test('a granted scope whose probe file doesn\'t exist ("not found", "permission to access the document") is not a gap', () => {
  const env = loadStudentDashboardMarker({
    SlidesApp: { openById: () => { throw new Error('Requested entity was not found.'); } },
    SpreadsheetApp: { openById: () => { throw new Error('You do not have permission to access the requested document.'); } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(env.exported._deployPermissionGaps_('cas-ccps:student-dashboard'))), []);
  assert.equal(env.exported.reportDeployVersion(), true);
});
