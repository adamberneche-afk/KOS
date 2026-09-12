'use strict';
// Regression tests for leader-hub/DeployVersionReport.gs — self-reporting
// this project's live version to the KOS repo via a repository_dispatch
// call (see that file's own header and tools/deploy-drift/README.md for
// the full mechanism/why). Identical shape to
// tests/kos-personal/deploy-version-report.test.js — kos-personal's own
// version of this same test — since the reporting logic is the same
// pattern in both projects.
//
// reportDeployVersion() is meant to become a ScriptApp.newTrigger()-
// registered handler (via installDeployVersionReportTrigger(), run once
// manually — this project has no bulk trigger installer), so
// tools/coverage-gaps/check.js expects real coverage of it — this is
// that coverage, not an allowlist entry.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const FILES = [
  path.join(LH, 'DeployVersionMarker.gs'),
  path.join(LH, 'DeployVersionReport.gs'),
];
const EXPOSE = ['reportDeployVersion', 'installDeployVersionReportTrigger', 'LH_DEPLOY_VERSION_SHA'];

function load(overrides = {}) {
  return loadGasFiles(FILES, EXPOSE, overrides);
}

test('reportDeployVersion: no token configured — no-ops, returns false, never calls UrlFetchApp', () => {
  let called = false;
  const { exported } = load({
    UrlFetchApp: { fetch: () => { called = true; return { getResponseCode: () => 204 }; } },
  });
  const result = exported.reportDeployVersion();
  assert.equal(result, false);
  assert.equal(called, false);
});

test('reportDeployVersion: token configured — POSTs a repository_dispatch payload naming leader-hub:app and its marker sha', () => {
  let capturedUrl, capturedOpts;
  const { exported, sandbox } = load({
    UrlFetchApp: {
      fetch: (url, opts) => {
        capturedUrl = url;
        capturedOpts = opts;
        return { getResponseCode: () => 204, getContentText: () => '' };
      },
    },
  });
  sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'test-token-123');

  const result = exported.reportDeployVersion();
  assert.equal(result, true);

  assert.equal(capturedUrl, 'https://api.github.com/repos/adamberneche-afk/KOS/dispatches');
  assert.equal(capturedOpts.method, 'post');
  assert.equal(capturedOpts.headers.Authorization, 'Bearer test-token-123');
  assert.ok(capturedOpts.headers['User-Agent']);

  const body = JSON.parse(capturedOpts.payload);
  assert.equal(body.event_type, 'gas-version-report');
  // Must exactly match this project's key in tools/gas-lint/project-map.json
  // — check.js rejects anything that isn't a real, known project name.
  assert.equal(body.client_payload.project, 'leader-hub:app');
  assert.match(body.client_payload.sha, /^[0-9a-f]{40}$/);
  assert.ok(body.client_payload.reportedAt);
});

test('reportDeployVersion: reports LH_DEPLOY_VERSION_SHA specifically, not some other value', () => {
  let capturedPayload;
  const { exported, sandbox } = load({
    UrlFetchApp: {
      fetch: (url, opts) => { capturedPayload = JSON.parse(opts.payload); return { getResponseCode: () => 204 }; },
    },
  });
  sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'tok');
  exported.reportDeployVersion();
  assert.equal(capturedPayload.client_payload.sha, exported.LH_DEPLOY_VERSION_SHA);
});

test('reportDeployVersion: a non-204 response is treated as failure, returns false', () => {
  const { exported, sandbox } = load({
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 401, getContentText: () => 'Bad credentials' }) },
  });
  sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'bad-token');
  assert.equal(exported.reportDeployVersion(), false);
});

test('reportDeployVersion: UrlFetchApp throwing is caught, never propagates, returns false', () => {
  const { exported, sandbox } = load({
    UrlFetchApp: { fetch: () => { throw new Error('network down'); } },
  });
  sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'tok');
  assert.doesNotThrow(() => {
    assert.equal(exported.reportDeployVersion(), false);
  });
});

// ── installDeployVersionReportTrigger ────────────────────────────────────

test('installDeployVersionReportTrigger: creates a 6-hourly trigger for reportDeployVersion', () => {
  const { exported, sandbox } = load();
  exported.installDeployVersionReportTrigger();
  const triggers = sandbox.ScriptApp.getProjectTriggers();
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].getHandlerFunction(), 'reportDeployVersion');
});

test('installDeployVersionReportTrigger: idempotent — re-running never leaves duplicate triggers', () => {
  const { exported, sandbox } = load();
  exported.installDeployVersionReportTrigger();
  exported.installDeployVersionReportTrigger();
  exported.installDeployVersionReportTrigger();
  const triggers = sandbox.ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'reportDeployVersion');
  assert.equal(triggers.length, 1);
});
