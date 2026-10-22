'use strict';
// "Clear Entire Staging Pipeline" (10_AdminRecoveryPanel.js), UX audit
// fix-first 7 (2026-10-22): it used to delete every row and promise the
// ReviewQueue rows would be re-staged, but the bridge (03) stages only
// PENDING rows and these were STAGED, so the students stayed "being
// checked" for good. It now previews what it will delete and puts each
// unfinished submission back in line.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

function setup(answer) {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('10_AdminRecoveryPanel.js')], ['clearStagingPipeline']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const staging = ss.insertSheet('STAGING_PIPELINE');
  staging.appendRow(['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  staging.appendRow([new Date(), 2, 'f1', 'C1', 't@x', 'IN_PROCESS']);
  staging.appendRow([new Date(), 3, 'f2', 'C2', 't@x', 'COMPLETE']);
  staging.appendRow([new Date(), 4, 'f3', 'C3', 't@x', 'PENDING_INFERENCE']);
  const queue = ss.insertSheet('ReviewQueue');
  queue.appendRow(['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'x', 'Status']);
  queue.appendRow([new Date(), 'a', 'f1', 'C1', '', 'STAGED']);
  queue.appendRow([new Date(), 'b', 'f2', 'C2', '', 'COMPLETE']);
  queue.appendRow([new Date(), 'c', 'f3', 'C3', '', 'STAGED']);
  const ui = env.sandbox.SpreadsheetApp.getUi();
  const seen = [];
  ui.alert = (...args) => { seen.push(args.length > 1 ? args[1] : args[0]); return args[2] === 'YES_NO' ? answer : 'OK'; };
  return { env, staging, queue, seen };
}

test('it previews the rows by status and puts unfinished submissions back in line', () => {
  const { env, staging, queue, seen } = setup('YES');
  env.exported.clearStagingPipeline();
  assert.match(seen[0], /deletes all 3 staging row\(s\)/);
  assert.match(seen[0], /IN_PROCESS: 1[\s\S]*COMPLETE: 1[\s\S]*PENDING_INFERENCE: 1/);
  assert.match(seen[0], /2 submission\(s\) not finished yet will be put back in line/);
  assert.equal(staging.getLastRow(), 1, 'staging is empty');
  assert.deepEqual([2, 3, 4].map((r) => queue.getRange(r, 6).getValue()), ['PENDING', 'COMPLETE', 'PENDING']);
  assert.match(seen[1], /2 submission\(s\) put back in line/);
});

test('saying No changes nothing', () => {
  const { env, staging, queue } = setup('NO');
  env.exported.clearStagingPipeline();
  assert.equal(staging.getLastRow(), 4);
  assert.deepEqual([2, 3, 4].map((r) => queue.getRange(r, 6).getValue()), ['STAGED', 'COMPLETE', 'STAGED']);
});
