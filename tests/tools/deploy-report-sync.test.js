'use strict';
// tools/flow-harness-sync/sync-deploy-report.js (structure audit 3.8): one
// deploy-version report, copied into cas-ccps, kos-personal and leader-hub.
// Every copy matches the canonical file, and each system's report now checks
// its permissions (only cas-ccps did before).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sync = require('../../tools/flow-harness-sync/sync-deploy-report.js');
const { loadGasFiles } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');

test('every copy of the deploy-version report matches the canonical file', () => {
  assert.deepEqual(Object.keys(sync.computeUpdates()), [], 'run node tools/flow-harness-sync/sync-deploy-report.js');
});

test('each copy appears once, and no target keeps a second report of its own', () => {
  for (const rel of sync.TARGETS) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(text.split(sync.BEGIN).length, 2, rel);
    const outside = text.slice(0, text.indexOf(sync.BEGIN)) + text.slice(text.indexOf(sync.END));
    assert.doesNotMatch(outside, /UrlFetchApp\.fetch\('https:\/\/api\.github\.com\/repos\/[^']+\/dispatches'/, rel + ' sends a report outside the block');
    assert.doesNotMatch(outside, /ScriptApp\.newTrigger\('reportDeployVersion'\)\.timeBased\(\)\.everyHours/, rel + ' installs the trigger outside the block');
  }
});

test('no cas-ccps marker file installs its trigger by hand', () => {
  const dir = path.join(ROOT, 'cas-ccps', 'scripts');
  fs.readdirSync(dir).filter((f) => /_DeployVersionMarker_/.test(f)).forEach((f) => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.match(text, /_installDeployVersionReportTrigger_\(\);/, f);
    assert.doesNotMatch(text, /ScriptApp\.newTrigger/, f);
  });
});

const DENIED = (svc) => () => { throw new Error('You do not have permission to call ' + svc + '.openById'); };

test('kos-personal: a scope not granted is reported, then the run fails naming it', () => {
  const sent = [];
  const env = loadGasFiles(
    ['kos-personal/1_Config_And_Deploy.gs', 'kos-personal/18_DeployVersionMarker.gs', 'kos-personal/17_DeployVersionReport.gs'].map((f) => path.join(ROOT, f)),
    ['reportDeployVersion'],
    { UrlFetchApp: { fetch: (u, o) => { sent.push(JSON.parse(o.payload)); return { getResponseCode: () => 204 }; } },
      DocumentApp: { openById: DENIED('DocumentApp') } });
  env.sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'tok');
  assert.throws(() => env.exported.reportDeployVersion(), /kos-personal is missing a permission: documents \(DocumentApp\)/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].client_payload.project, 'kos-personal');
});

test('leader-hub: a scope not granted is reported, then the run fails naming it', () => {
  const sent = [];
  const files = ['leader-hub/DeployVersionMarker.gs', 'leader-hub/DeployVersionReport.gs'].map((f) => path.join(ROOT, f));
  const env = loadGasFiles(files, ['reportDeployVersion'],
    { UrlFetchApp: { fetch: (u, o) => { sent.push(JSON.parse(o.payload)); return { getResponseCode: () => 204 }; } },
      SpreadsheetApp: { openById: DENIED('SpreadsheetApp') },
      requireScriptOwner_: () => {} });
  env.sandbox.PropertiesService.getScriptProperties().setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'tok');
  assert.throws(() => env.exported.reportDeployVersion(), /leader-hub:app is missing a permission: spreadsheets \(SpreadsheetApp\)/);
  assert.equal(sent[0].client_payload.project, 'leader-hub:app');
});
