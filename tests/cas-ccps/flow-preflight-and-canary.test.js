'use strict';
// Regression tests for 35_FlowPreflightAndCanary.js — the structural
// preflight check and Flow 1 end-to-end canary. Loaded together with
// 00_SharedConfig.js (getConfig_), same GAS project
// (cas-ccps:central-ledger, see tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const SERVICE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '35_FlowPreflightAndCanary.js');

function load(exposeNames) {
  return loadGasFiles([SHARED_CONFIG_PATH, SERVICE_PATH], exposeNames);
}

function setUpConfig(sandbox, adminSs) {
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', adminSs.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', 'fake-ledger-ss');
}

// ── _pfCheckTab_ ─────────────────────────────────────────────────────────

test('_pfCheckTab_: a tab with at least the expected column count passes', () => {
  const { exported, sandbox } = load(['_pfCheckTab_']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  const sheet = ss.insertSheet('RubricQueue');
  sheet.appendRow(new Array(10).fill('header'));
  const result = exported._pfCheckTab_(ss, 'RubricQueue', 10);
  assert.equal(result.ok, true);
});

test('_pfCheckTab_: a missing tab fails with a clear detail', () => {
  const { exported, sandbox } = load(['_pfCheckTab_']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  const result = exported._pfCheckTab_(ss, 'RubricQueue', 10);
  assert.equal(result.ok, false);
  assert.match(result.detail, /does not exist/);
});

test('_pfCheckTab_: a tab with fewer columns than expected fails, naming the actual count', () => {
  const { exported, sandbox } = load(['_pfCheckTab_']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  const sheet = ss.insertSheet('WarmUpRegistry');
  sheet.appendRow(new Array(3).fill('header'));
  const result = exported._pfCheckTab_(ss, 'WarmUpRegistry', 12);
  assert.equal(result.ok, false);
  assert.match(result.detail, /Only 3 column/);
});

// ── _pfCheckScriptProperty_ ──────────────────────────────────────────────

test('_pfCheckScriptProperty_: a missing required property fails', () => {
  const { exported } = load(['_pfCheckScriptProperty_']);
  const result = exported._pfCheckScriptProperty_('SOME_REQUIRED_KEY', true);
  assert.equal(result.ok, false);
});

test('_pfCheckScriptProperty_: a missing OPTIONAL property still reports ok:true', () => {
  const { exported } = load(['_pfCheckScriptProperty_']);
  const result = exported._pfCheckScriptProperty_('CAS_CHAT_WEBHOOK_URL', false);
  assert.equal(result.ok, true);
  assert.match(result.detail, /Not set/);
});

test('_pfCheckScriptProperty_: a configured property passes regardless of required', () => {
  const { exported, sandbox } = load(['_pfCheckScriptProperty_']);
  sandbox.PropertiesService.getScriptProperties().setProperty('CAS_CHAT_WEBHOOK_URL', 'https://chat.example/webhook');
  const result = exported._pfCheckScriptProperty_('CAS_CHAT_WEBHOOK_URL', false);
  assert.equal(result.ok, true);
  assert.equal(result.detail, 'Configured.');
});

// ── runFlowPreflightCheck ────────────────────────────────────────────────

function makeFullyPassingAdminSs(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Admin');
  ss.insertSheet('RubricQueue').appendRow(new Array(10).fill('h'));
  ss.insertSheet('STAGING_PIPELINE').appendRow(new Array(6).fill('h'));
  ss.insertSheet('WarmUpQueue').appendRow(new Array(21).fill('h'));
  ss.insertSheet('WarmUpRegistry').appendRow(new Array(12).fill('h'));
  ss.insertSheet('CompetencyEvidence').appendRow(new Array(8).fill('h'));
  ss.insertSheet('Ledger').appendRow(new Array(19).fill('h'));
  ss.insertSheet('MatrixRegistry').appendRow(new Array(4).fill('h'));
  return ss;
}

test('runFlowPreflightCheck: every tab present and wide enough, no CAS_CHAT_WEBHOOK_URL set -- 7 of 8 pass (webhook is optional)', () => {
  const { exported, sandbox } = load(['runFlowPreflightCheck']);
  const ss = makeFullyPassingAdminSs(sandbox);
  setUpConfig(sandbox, ss);

  const result = exported.runFlowPreflightCheck();
  assert.equal(result.total, 8); // 7 tabs + 1 script property (ADMIN_SS_ID's own dead check is gone)
  assert.equal(result.failed, 0);
});

test('runFlowPreflightCheck: the dead ADMIN_SS_ID check is gone -- exactly 8 checks run, never 9', () => {
  const { exported, sandbox } = load(['runFlowPreflightCheck']);
  const ss = makeFullyPassingAdminSs(sandbox);
  setUpConfig(sandbox, ss);
  const result = exported.runFlowPreflightCheck();
  assert.ok(!result.results.some((r) => r.label.includes('ADMIN_SS_ID')));
});

test('runFlowPreflightCheck: a missing CompetencyEvidence tab is a real, reported failure (true positive, not a bug)', () => {
  const { exported, sandbox } = load(['runFlowPreflightCheck']);
  const ss = makeFullyPassingAdminSs(sandbox);
  // Remove the one this test is about, keep everything else passing.
  ss.sheets = ss.sheets.filter((s) => s.getName() !== 'CompetencyEvidence');
  setUpConfig(sandbox, ss);

  const result = exported.runFlowPreflightCheck();
  assert.equal(result.failed, 1);
  const failure = result.results.find((r) => r.label === 'Tab: CompetencyEvidence');
  assert.equal(failure.ok, false);
});

test('runFlowPreflightCheck: writes a Preflight report tab with one row per check', () => {
  const { exported, sandbox } = load(['runFlowPreflightCheck']);
  const ss = makeFullyPassingAdminSs(sandbox);
  setUpConfig(sandbox, ss);
  exported.runFlowPreflightCheck();
  const report = ss.getSheetByName('Preflight');
  assert.ok(report);
  // header row + "Last run" row + 8 check rows
  assert.equal(report.getLastRow(), 10);
});

test('runFlowPreflightCheckNow: alerts a clean pass/fail summary', () => {
  const { exported, sandbox } = load(['runFlowPreflightCheckNow']);
  const ss = makeFullyPassingAdminSs(sandbox);
  setUpConfig(sandbox, ss);
  exported.runFlowPreflightCheckNow();
  const calls = sandbox.SpreadsheetApp.getUi()._calls;
  assert.equal(calls.length, 1);
  assert.match(calls[0].message, /All 8 preflight checks passed/);
});

// ── runFlow1Canary ───────────────────────────────────────────────────────

function setUpCanary(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Admin');
  const sheet = ss.insertSheet('RubricQueue');
  sheet.appendRow(new Array(10).fill('header'));
  setUpConfig(sandbox, ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CAS_CANARY_TEST_MATRIX_SS_ID', 'fake-matrix-ss');
  return { ss, sheet };
}

test('runFlow1Canary: refuses to run without CAS_CANARY_TEST_MATRIX_SS_ID configured', () => {
  const { exported, sandbox } = load(['runFlow1Canary']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  ss.insertSheet('RubricQueue').appendRow(new Array(10).fill('header'));
  setUpConfig(sandbox, ss);
  const result = exported.runFlow1Canary();
  assert.equal(result.ok, false);
  assert.match(result.detail, /CAS_CANARY_TEST_MATRIX_SS_ID/);
});

test('runFlow1Canary: refuses to run without a RubricQueue tab', () => {
  const { exported, sandbox } = load(['runFlow1Canary']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CAS_CANARY_TEST_MATRIX_SS_ID', 'fake-matrix-ss');
  const result = exported.runFlow1Canary();
  assert.equal(result.ok, false);
  assert.match(result.detail, /RubricQueue tab not found/);
});

test('runFlow1Canary: appends the synthetic row -- never overwrites an existing row already in the sheet', () => {
  const { exported, sandbox } = load(['runFlow1Canary']);
  const { sheet } = setUpCanary(sandbox);
  const preExisting = new Array(10).fill('pre-existing real row');
  sheet.appendRow(preExisting); // row 2 -- a real submission already in the queue

  const result = exported.runFlow1Canary(); // times out (no status ever set) -- fine, this test is about placement
  assert.equal(result.rowNum, 3, 'the synthetic row must append after existing rows, not overwrite one');
  assert.deepEqual(sheet.getRange(2, 1, 1, 10).getValues()[0], preExisting, 'row 2 must be completely untouched');
});

test('runFlow1Canary: times out after 12 attempts and reports FAIL with the row number, without throwing', () => {
  const { exported, sandbox } = load(['runFlow1Canary']);
  const { sheet } = setUpCanary(sandbox);
  const result = exported.runFlow1Canary();
  assert.equal(result.ok, false);
  assert.match(result.detail, /after 3 minutes/);
  assert.equal(result.rowNum, sheet.getLastRow());
});

test('runFlow1Canary: PASS when the row reaches COMPLETE within the polling window', () => {
  const { exported, sandbox } = load(['runFlow1Canary']);
  const { sheet } = setUpCanary(sandbox);

  // Utilities.sleep() is a no-op in this harness, so the poll loop spins
  // through all 12 attempts near-instantly. Patch it here to flip the
  // row to COMPLETE on the 3rd call, simulating Flow 1 finishing partway
  // through the polling window.
  let sleepCalls = 0;
  const rowNum = sheet.getLastRow() + 1; // matches the row appendRow is about to create
  sandbox.Utilities.sleep = function () {
    sleepCalls++;
    if (sleepCalls === 3) {
      sheet.getRange(rowNum, 10).setValue('COMPLETE');
    }
  };

  const result = exported.runFlow1Canary();
  assert.equal(result.ok, true);
  assert.equal(result.finalStatus, 'COMPLETE');
  assert.equal(sleepCalls, 3);
});

test('runFlow1Canary: FAIL (not timeout) when the row reaches EXTRACTION_ERROR', () => {
  const { exported, sandbox } = load(['runFlow1Canary']);
  const { sheet } = setUpCanary(sandbox);

  let sleepCalls = 0;
  const rowNum = sheet.getLastRow() + 1;
  sandbox.Utilities.sleep = function () {
    sleepCalls++;
    if (sleepCalls === 1) sheet.getRange(rowNum, 10).setValue('EXTRACTION_ERROR');
  };

  const result = exported.runFlow1Canary();
  assert.equal(result.ok, false);
  assert.equal(result.finalStatus, 'EXTRACTION_ERROR');
});

test('runFlow1CanaryNow: alerts PASS/FAIL with the underlying detail text', () => {
  const { exported, sandbox } = load(['runFlow1CanaryNow']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  // No RubricQueue tab -- fast, deterministic FAIL path, no polling.
  exported.runFlow1CanaryNow();
  const calls = sandbox.SpreadsheetApp.getUi()._calls;
  assert.equal(calls.length, 1);
  assert.match(calls[0].message, /^❌ FAIL:/);
});

// ── cleanUpFlow1Canary ───────────────────────────────────────────────────

test('cleanUpFlow1Canary: clears the row\'s contents in place -- row count (and every row number below it) stays stable', () => {
  const { exported, sandbox } = load(['cleanUpFlow1Canary']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  const sheet = ss.insertSheet('RubricQueue');
  setUpConfig(sandbox, ss);
  sheet.appendRow(new Array(10).fill('header'));
  const canaryRow = new Array(10).fill('');
  canaryRow[1] = 'canary-test@example.invalid';
  sheet.appendRow(canaryRow);
  sheet.appendRow(['real', 'teacher@example.com', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x']); // row 3, must stay row 3

  const lastRowBefore = sheet.getLastRow();
  exported.cleanUpFlow1Canary(2);

  assert.equal(sheet.getLastRow(), lastRowBefore, 'row count must not shrink -- no row was deleted');
  assert.equal(sheet.getRange(2, 2).getValue(), '', 'the canary row itself is now blank');
  // The real row below it must be completely untouched -- this is
  // exactly what deleteRow() would have broken (it would have shifted
  // this row up to position 2).
  assert.equal(sheet.getRange(3, 2).getValue(), 'teacher@example.com');
});

test('cleanUpFlow1Canary: refuses to clear a row that doesn\'t look like a canary row', () => {
  const { exported, sandbox } = load(['cleanUpFlow1Canary']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  const sheet = ss.insertSheet('RubricQueue');
  setUpConfig(sandbox, ss);
  sheet.appendRow(new Array(10).fill('header'));
  sheet.appendRow(['real', 'teacher@example.com', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x']);

  assert.throws(() => exported.cleanUpFlow1Canary(2), /does not look like a canary row/);
  // Untouched -- the refusal must happen before any write.
  assert.equal(sheet.getRange(2, 2).getValue(), 'teacher@example.com');
});
