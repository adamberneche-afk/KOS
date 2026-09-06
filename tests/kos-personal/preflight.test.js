'use strict';
// Regression tests for kos-personal/15_Preflight.gs — the "is the
// structure sound?" check meta/FLOW_DOCTRINE.md rule 9's table had marked
// "—" for kos-personal. Modeled on cas-ccps's runFlowPreflightCheck() /
// leader-hub's runLeaderHubPreflight(), adapted to the one fact kos-personal
// has that neither of those does: a single KOS_TRIGGER_HANDLERS list this
// session added specifically because the two functions that used to each
// keep their own copy had already drifted (see trigger-management.test.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '12_StudioReturnHarvest.gs'), // SR_SHEET
  path.join(KP, '13_StudioInputBuilder.gs'),  // CI_CURATOR_TAB / CI_CLASSIFY_TAB
  path.join(KP, '15_Preflight.gs'),
];

const EXPOSE = [
  'runKosPersonalPreflight', 'setupAllTriggers', 'teardownAllTriggers',
  'KOS_TRIGGER_HANDLERS', 'CFG', 'SR_SHEET', 'CI_CURATOR_TAB', 'CI_CLASSIFY_TAB',
  '_getSystemAsset', '_getOrCreateSheet',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

// Same sandbox limitation trigger-management.test.js documents: the
// trigger-builder mock doesn't implement .forSpreadsheet()/.onChange()/
// .onEdit(), so these two never actually install here even after
// setupAllTriggers() runs. Excluded from the "everything installed"
// assertions for that reason, not because the preflight check is wrong to
// flag them.
const SANDBOX_UNSUPPORTED = ['sensor3_externalTelemetry', 'onGovernanceEdit'];

function installableHandlers(exported) {
  return exported.KOS_TRIGGER_HANDLERS.filter((h) => SANDBOX_UNSUPPORTED.indexOf(h) === -1);
}

function indexSpreadsheet(exported, sandbox) {
  const props = sandbox.PropertiesService.getScriptProperties();
  const existing = props.getProperty('INDEX_ID');
  if (existing) return sandbox.SpreadsheetApp.openById(existing);
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());
  return ss;
}

function findResult(results, label) {
  return results.find((r) => r.label === label);
}

test('runKosPersonalPreflight: cannot resolve the index spreadsheet — one failure, not a thrown error', () => {
  const { exported } = load();
  // No INDEX_ID property set, and no Drive asset named BRAIN_TRUST_INDEX —
  // _getSystemAsset() throws. The function must catch that itself rather
  // than propagate it, same as any other trigger-driven entry point here.
  const result = exported.runKosPersonalPreflight();
  assert.equal(result.total, 1);
  assert.equal(result.failed, 1);
  assert.match(result.results[0].detail, /deployFullSystem/);
});

test('runKosPersonalPreflight: a freshly-deployed, fully-populated system passes every installable check', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  const ss = indexSpreadsheet(exported, sandbox);

  // Self-healing tabs at their real width, via the same helper production
  // code uses — not hand-built headers.
  exported._getOrCreateSheet(ss, exported.CFG.STAGING_SHEET);
  exported._getOrCreateSheet(ss, exported.SR_SHEET);
  exported._getOrCreateSheet(ss, exported.CI_CURATOR_TAB);
  exported._getOrCreateSheet(ss, exported.CI_CLASSIFY_TAB);

  exported.setupAllTriggers();
  sandbox.PropertiesService.getScriptProperties().setProperty('KOS_ADMIN_EMAIL', 'admin@example.com');

  const result = exported.runKosPersonalPreflight();
  const failedLabels = result.results.filter((r) => !r.ok).map((r) => r.label);
  const expectedFailures = SANDBOX_UNSUPPORTED.map((h) => 'Trigger: ' + h);
  assert.deepEqual(failedLabels.sort(), expectedFailures.sort(),
    'only the two sandbox-unsupported triggers should fail: ' + JSON.stringify(failedLabels));
});

test('runKosPersonalPreflight: an unbuilt tab is not created yet, and is not a failure', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  // Nothing else set up — CuratorInput etc. do not exist yet.
  const result = exported.runKosPersonalPreflight();
  const check = findResult(result.results, 'Tab: ' + exported.CI_CURATOR_TAB);
  assert.ok(check);
  assert.equal(check.ok, true);
  assert.match(check.detail, /not created yet/i);
});

test('runKosPersonalPreflight: a tab present but narrower than its column map is a failure', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  const ss = indexSpreadsheet(exported, sandbox);

  // Simulate a hand-created / pre-13_StudioInputBuilder.gs tab: present,
  // but only 3 columns wide instead of the real 6.
  const narrow = ss.insertSheet(exported.CI_CURATOR_TAB);
  narrow.appendRow(['Timestamp', 'Payload_UID', 'Payload_Type']);

  const result = exported.runKosPersonalPreflight();
  const check = findResult(result.results, 'Tab: ' + exported.CI_CURATOR_TAB);
  assert.equal(check.ok, false);
  assert.match(check.detail, /writes nowhere/);
  assert.equal(result.failed >= 1, true);
});

test('runKosPersonalPreflight: a trigger that was never installed is reported by name', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.setupAllTriggers();
  // Remove one specific trigger to simulate the exact drift this session
  // found — a handler present in the list but missing from the project.
  sandbox.ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'harvestStudioReturns')
    .forEach((t) => sandbox.ScriptApp.deleteTrigger(t));

  const result = exported.runKosPersonalPreflight();
  const check = findResult(result.results, 'Trigger: harvestStudioReturns');
  assert.equal(check.ok, false);
  assert.match(check.detail, /Not installed/);
});

test('runKosPersonalPreflight: a trigger installed twice is a failure, not a silent double-run', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.setupAllTriggers();
  sandbox.ScriptApp.newTrigger('harvestStudioReturns').timeBased().everyMinutes(5).create();

  const result = exported.runKosPersonalPreflight();
  const check = findResult(result.results, 'Trigger: harvestStudioReturns');
  assert.equal(check.ok, false);
  assert.match(check.detail, /2 copies installed/);
});

test('runKosPersonalPreflight: KOS_ADMIN_EMAIL is soft — unset does not fail the run', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  const result = exported.runKosPersonalPreflight();
  const check = findResult(result.results, 'Script property: KOS_ADMIN_EMAIL');
  assert.equal(check.ok, true);
  assert.match(check.detail, /nowhere to send/);
});

test('runKosPersonalPreflight: writes a Preflight tab with one row per check', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  const ss = indexSpreadsheet(exported, sandbox);
  const result = exported.runKosPersonalPreflight();

  const sheet = ss.getSheetByName('Preflight');
  assert.ok(sheet, 'Preflight tab was created');
  const rows = sheet.getDataRange().getValues();
  assert.deepEqual(rows[0], ['Check', 'Status', 'Detail']);
  assert.equal(rows[1][0], 'Last run');
  assert.equal(rows.length - 2, result.total, 'one report row per check, after the header and Last run rows');
});

test('runKosPersonalPreflight: re-running rewrites the Preflight tab rather than appending', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  const ss = indexSpreadsheet(exported, sandbox);
  exported.runKosPersonalPreflight();
  const result = exported.runKosPersonalPreflight();

  const rows = ss.getSheetByName('Preflight').getDataRange().getValues();
  assert.equal(rows.length - 2, result.total);
});
