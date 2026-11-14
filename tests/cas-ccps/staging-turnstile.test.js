'use strict';
// Regression tests for 06_StagingPipeline_Turnstile.js, the per-teacher
// lanes that release STAGING_PIPELINE rows to Flow 2. Since 2026-11-14 a
// teacher has FLOW2_PARALLEL_LANES rows IN_PROCESS at once (default 3): on
// 11-13, with Flow 2 not answering, one lane timed 14 submissions out one
// after another. Each row still times out on its own after 12 minutes, the
// oldest is released first, and 1 is the old one-at-a-time behavior.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const MIN = 60 * 1000;

function load(lanes, headers) {
  const env = loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '06_StagingPipeline_Turnstile.js')],
    ['runStagingTurnstile', 'turnstileLanes_', 'TURNSTILE_DEFAULT_LANES', 'SHARED_CONFIG_KEYS'],
  );
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  if (lanes !== undefined) props.setProperty('FLOW2_PARALLEL_LANES', String(lanes));
  const sheet = ss.insertSheet('STAGING_PIPELINE');
  sheet.appendRow(headers || ['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  return Object.assign(env, { ss, sheet });
}

function row(sheet, { teacher = 'a@school.test', status = 'PENDING_INFERENCE', at = new Date(Date.now() - 2 * MIN), file } = {}) {
  sheet.appendRow([at, String(sheet.getLastRow() + 1), file || 'file-' + sheet.getLastRow(), 'CFG', teacher, status]);
}

const statuses = (sheet) => sheet.getRange(2, 6, sheet.getLastRow() - 1, 1).getValues().map((r) => r[0]);

test('turnstile: by default three of a teacher\'s rows are IN_PROCESS at once, oldest first', () => {
  const { exported, sheet } = load();
  for (let i = 0; i < 5; i++) row(sheet);
  exported.runStagingTurnstile();
  assert.deepEqual(statuses(sheet), ['IN_PROCESS', 'IN_PROCESS', 'IN_PROCESS', 'PENDING_INFERENCE', 'PENDING_INFERENCE']);
  exported.runStagingTurnstile();
  assert.deepEqual(statuses(sheet).filter((s) => s === 'IN_PROCESS').length, 3, 'no fourth while three are in flight');
});

test('turnstile: rows already in flight count against the lanes; each teacher has their own', () => {
  const { exported, sheet } = load(2);
  row(sheet, { status: 'IN_PROCESS', at: new Date(Date.now() - 3 * MIN) });
  row(sheet);
  row(sheet);
  row(sheet, { teacher: 'b@school.test' });
  row(sheet, { teacher: 'b@school.test' });
  row(sheet, { teacher: 'b@school.test' });
  exported.runStagingTurnstile();
  assert.deepEqual(statuses(sheet), ['IN_PROCESS', 'IN_PROCESS', 'PENDING_INFERENCE',
    'IN_PROCESS', 'IN_PROCESS', 'PENDING_INFERENCE']);
});

test('turnstile: FLOW2_PARALLEL_LANES = 1 is the old one at a time', () => {
  const { exported, sheet } = load(1);
  row(sheet);
  row(sheet);
  row(sheet, { teacher: 'b@school.test' });
  exported.runStagingTurnstile();
  assert.deepEqual(statuses(sheet), ['IN_PROCESS', 'PENDING_INFERENCE', 'IN_PROCESS']);
  exported.runStagingTurnstile();
  assert.deepEqual(statuses(sheet), ['IN_PROCESS', 'PENDING_INFERENCE', 'IN_PROCESS']);
});

test('turnstile: each row times out on its own after 12 minutes, and its lane is refilled at once', () => {
  const { exported, sheet } = load(2);
  row(sheet, { status: 'IN_PROCESS', at: new Date(Date.now() - 13 * MIN) });
  row(sheet, { status: 'IN_PROCESS', at: new Date(Date.now() - 5 * MIN) });
  row(sheet);
  row(sheet);
  exported.runStagingTurnstile();
  assert.deepEqual(statuses(sheet), ['ERROR_TIMEOUT', 'IN_PROCESS', 'IN_PROCESS', 'PENDING_INFERENCE']);
  const releasedAt = new Date(sheet.getRange(4, 1).getValue()).getTime();
  assert.ok(Date.now() - releasedAt < MIN, 'a released row is stamped now, arming its own timer');
});

test('turnstile: a row in flight with no timestamp holds no lane', () => {
  const { exported, sheet } = load(1);
  row(sheet, { status: 'IN_PROCESS', at: '' });
  row(sheet);
  exported.runStagingTurnstile();
  assert.deepEqual(statuses(sheet), ['IN_PROCESS', 'IN_PROCESS']);
});

test('turnstile: the lanes setting from the _CONFIG tab, capped at 10; a bad value is the default', () => {
  assert.ok(load().exported.SHARED_CONFIG_KEYS.includes('FLOW2_PARALLEL_LANES'), 'one _CONFIG row reaches every project');
  assert.equal(load().exported.turnstileLanes_(), 3);
  assert.equal(load(5).exported.turnstileLanes_(), 5);
  assert.equal(load(50).exported.turnstileLanes_(), 10);
  for (const bad of ['0', '-2', '2.5', 'three']) {
    assert.equal(load(bad).exported.turnstileLanes_(), 3, bad);
  }
});

test('turnstile: without a TeacherEmail column it stays the single global lane, whatever the setting', () => {
  const { exported, sheet } = load(3, ['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'Status']);
  sheet.appendRow([new Date(), '2', 'f1', 'CFG', 'PENDING_INFERENCE']);
  sheet.appendRow([new Date(), '3', 'f2', 'CFG', 'PENDING_INFERENCE']);
  exported.runStagingTurnstile();
  assert.deepEqual(sheet.getRange(2, 5, 2, 1).getValues().map((r) => r[0]), ['IN_PROCESS', 'PENDING_INFERENCE']);
});
