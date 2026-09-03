'use strict';
// Regression tests for 35_FlowPreflightAndCanary.js's runFlow2Canary() /
// cleanUpFlow2Canary() — the self-provisioning canary for the Apps Script
// half of Flow 2.
//
// What's actually worth asserting here, given the canary is itself a test:
//   1. It PASSES against a correctly-behaving deployment (so a real FAIL
//      means something, rather than the canary being broken).
//   2. It FAILS, at the right named stage, when the pipeline is broken —
//      a canary that can't fail is worthless. Exercised by breaking a
//      lookup hop the builder depends on.
//   3. Its safety properties hold: QueueRowRef is the non-numeric
//      'CANARY' marker that makes backPropagateCompletions() skip the
//      row on every path (see runFlow2Canary()'s own header — that's
//      load-bearing, not cosmetic), and cleanup refuses non-canary rows.
//
// Loaded with the whole central-ledger chain the canary drives:
// 00_SharedConfig.js (getConfig_/LEDGER), 03_QueueBridge.js (STG_*),
// 04_Form2_TurnInGate.js + 15b + 15c (_parseFlow2Response_ and
// writeCompetencyEvidenceFromFlow2_), 37_FlowInputBuilder.js (FI,
// buildFlowInputRows, harvestFlowInputResults) and the canary itself —
// all one GAS project, see tools/gas-lint/project-map.json.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [
  S('00_SharedConfig.js'), S('03_QueueBridge.js'), S('04_Form2_TurnInGate.js'),
  S('15b_StudioFlowPrompts_Flow2_Revised.js'), S('15c_Flow2DirectEvaluationService.js'),
  S('37_FlowInputBuilder.js'), S('35_FlowPreflightAndCanary.js'),
];

function load() {
  return loadGasFiles(FILES, [
    'runFlow2Canary', 'cleanUpFlow2Canary',
    'FI', 'LEDGER', 'STG_CONFIG_ID', 'STG_STATUS', 'STG_QUEUE_ROW_REF',
  ]);
}

function setUp(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  ss.insertSheet('STAGING_PIPELINE').appendRow(
    ['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  ss.insertSheet('Ledger').appendRow(new Array(19).fill('header'));
  ss.insertSheet('MatrixRegistry').appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  return ss;
}

// The canary creates its scratch TeacherMatrix with SpreadsheetApp.create(),
// which in this harness does NOT self-register for openById() — the real API
// does. Bridge that so the canary's own later openById() call resolves, the
// same way tests/cas-ccps/read-instructor-config-step.test.js registers its
// fixtures by hand.
function autoRegisterCreatedSpreadsheets(sandbox) {
  const realCreate = sandbox.SpreadsheetApp.create;
  sandbox.SpreadsheetApp.create = function (name) {
    const ss = realCreate.call(sandbox.SpreadsheetApp, name);
    sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
    return ss;
  };
}

// ── The happy path ───────────────────────────────────────────────────────────

test('runFlow2Canary: passes end to end against a correctly-behaving deployment', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  autoRegisterCreatedSpreadsheets(sandbox);

  const result = exported.runFlow2Canary();

  assert.equal(result.ok, true, 'canary should pass — stages: ' + JSON.stringify(result.stages));
  assert.match(result.configId, /^VDOE-CANARY-\d+-[0-9A-F]{6}$/);
  assert.ok(result.stages.length >= 7, 'every stage is recorded, not just the verdict');
  assert.ok(result.stages.every((s) => s.ok));
});

test('runFlow2Canary: verifies the resolved FlowInput row, not just that a row exists', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  autoRegisterCreatedSpreadsheets(sandbox);

  const result = exported.runFlow2Canary();
  assert.equal(result.ok, true);

  const fi = ss.getSheetByName('FlowInput').getDataRange().getValues();
  const row = fi.find((r) => String(r[exported.FI.CONFIG_ID]).trim() === result.configId);
  assert.ok(row);
  assert.equal(row[exported.FI.STUDENT_EMAIL], 'canary-student@example.invalid');
  // Plus-addressed per run, so two runs don't shadow each other in
  // MatrixRegistry — see runFlow2Canary()'s comment on teacherEmail.
  assert.match(String(row[exported.FI.TEACHER_EMAIL]), /^canary-test\+\d+-[0-9A-F]{6}@example\.invalid$/);
  assert.equal(row[exported.FI.MILESTONE_1_COMPETENCY_ID], 'CANARY-COMP-1');
  assert.equal(row[exported.FI.READY_STATUS], 'HARVESTED', 'terminal by the end of the run');
});

test('runFlow2Canary: writes exactly four CompetencyEvidence rows with the parsed outcomes', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  autoRegisterCreatedSpreadsheets(sandbox);

  const result = exported.runFlow2Canary();
  assert.equal(result.ok, true);

  const evidence = ss.getSheetByName('CompetencyEvidence').getDataRange().getValues()
    .filter((r) => String(r[5]).trim() === result.configId);
  assert.equal(evidence.length, 4);
  assert.deepEqual(
    evidence.map((r) => String(r[4]).trim()).sort(),
    ['MET', 'MET', 'NOT_MET', 'PARTIALLY_MET'],
  );
});

// ── The safety property that keeps synthetic data out of real processing ─────

test('runFlow2Canary: the staging row carries the non-numeric CANARY ref that makes backPropagateCompletions skip it', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  autoRegisterCreatedSpreadsheets(sandbox);

  const result = exported.runFlow2Canary();
  assert.equal(result.ok, true);

  const staging = ss.getSheetByName('STAGING_PIPELINE').getDataRange().getValues();
  const row = staging.find((r) => String(r[exported.STG_CONFIG_ID]).trim() === result.configId);
  assert.ok(row);
  assert.equal(row[exported.STG_QUEUE_ROW_REF], 'CANARY');
  // The actual guard both backPropagateCompletions() branches apply. If this
  // ever parses to a usable row number, the canary could close a real
  // ReviewQueue row and mail the fake .invalid address.
  assert.ok(Number.isNaN(parseInt(row[exported.STG_QUEUE_ROW_REF], 10)));
  assert.equal(row[exported.STG_STATUS], 'COMPLETE');
});

// ── A canary that cannot fail is worthless ───────────────────────────────────

test('runFlow2Canary: FAILS at the builder stage when a lookup hop is broken, naming the stage', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  autoRegisterCreatedSpreadsheets(sandbox);

  // Break the MatrixRegistry hop specifically: swallow the canary's own
  // appendRow to that tab, so the teacher never resolves to a matrix.
  const registry = ss.getSheetByName('MatrixRegistry');
  registry.appendRow = function () { return registry; };

  const result = exported.runFlow2Canary();

  assert.equal(result.ok, false);
  const failed = result.stages.filter((s) => !s.ok);
  assert.equal(failed.length, 1, 'reports the first real failure, not a cascade');
  assert.match(failed[0].label, /materialized a FlowInput row/);
  assert.match(failed[0].detail, /checkLedgerSchema/,
    'points at the most likely real-world cause rather than just saying "failed"');
});

test('runFlow2Canary: FAILS when the harvest leaves the staging row unfinished', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  autoRegisterCreatedSpreadsheets(sandbox);

  // Make the STAGING_PIPELINE status write a no-op, so harvest can't
  // complete the row. Everything upstream still succeeds.
  const staging = ss.getSheetByName('STAGING_PIPELINE');
  const realGetRange = staging.getRange.bind(staging);
  staging.getRange = function (row, col, numRows, numCols) {
    const range = realGetRange(row, col, numRows, numCols);
    if (row > 1 && col === exported.STG_STATUS + 1) {
      range.setValue = function () { return range; };
    }
    return range;
  };

  const result = exported.runFlow2Canary();

  assert.equal(result.ok, false);
  const failed = result.stages.filter((s) => !s.ok);
  assert.match(failed[failed.length - 1].label, /STAGING_PIPELINE row marked COMPLETE/);
});

// ── Cleanup ──────────────────────────────────────────────────────────────────

test('cleanUpFlow2Canary: clears every seeded row for one configId and leaves real rows alone', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  autoRegisterCreatedSpreadsheets(sandbox);

  // A real row that must survive cleanup untouched.
  const realLedgerRow = new Array(19).fill('');
  realLedgerRow[exported.LEDGER.CONFIG_ID] = 'VDOE-REAL01-2026';
  realLedgerRow[exported.LEDGER.GOOGLE_ID] = 'realstudent@ccpsnet.net';
  ss.getSheetByName('Ledger').appendRow(realLedgerRow);

  const result = exported.runFlow2Canary();
  assert.equal(result.ok, true);

  const cleanup = exported.cleanUpFlow2Canary(result.configId);
  assert.ok(cleanup.cleared >= 4, 'staging + ledger + flowinput + registry at minimum');

  const stillCanary = (tab, keyIdx) => ss.getSheetByName(tab).getDataRange().getValues()
    .some((r) => String(r[keyIdx]).trim() === result.configId);
  assert.equal(stillCanary('STAGING_PIPELINE', exported.STG_CONFIG_ID), false);
  assert.equal(stillCanary('Ledger', exported.LEDGER.CONFIG_ID), false);
  assert.equal(stillCanary('FlowInput', exported.FI.CONFIG_ID), false);
  assert.equal(stillCanary('CompetencyEvidence', 5), false);

  const realSurvives = ss.getSheetByName('Ledger').getDataRange().getValues()
    .some((r) => String(r[exported.LEDGER.GOOGLE_ID]).trim() === 'realstudent@ccpsnet.net');
  assert.ok(realSurvives, 'cleanup must never touch a non-canary row');
});

test('cleanUpFlow2Canary: with no argument, clears leftovers from every canary run', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  autoRegisterCreatedSpreadsheets(sandbox);

  const first = exported.runFlow2Canary();
  const second = exported.runFlow2Canary();
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.configId, second.configId);

  exported.cleanUpFlow2Canary();

  const anyCanaryLeft = ss.getSheetByName('Ledger').getDataRange().getValues()
    .some((r) => String(r[exported.LEDGER.CONFIG_ID]).indexOf('VDOE-CANARY-') === 0);
  assert.equal(anyCanaryLeft, false);
});

test('cleanUpFlow2Canary: clears the MatrixRegistry row only for the fake .invalid teacher', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  autoRegisterCreatedSpreadsheets(sandbox);
  const registry = ss.getSheetByName('MatrixRegistry');
  registry.appendRow(['Real Teacher', 'real@ccpsnet.net', 'real-matrix-ss', new Date()]);

  const result = exported.runFlow2Canary();
  assert.equal(result.ok, true);
  exported.cleanUpFlow2Canary(result.configId);

  const rows = registry.getDataRange().getValues();
  assert.ok(rows.some((r) => String(r[1]).trim() === 'real@ccpsnet.net'),
    'the real teacher registration survives');
  assert.equal(rows.some((r) => String(r[1]).trim().indexOf('canary-test') === 0), false);
});
