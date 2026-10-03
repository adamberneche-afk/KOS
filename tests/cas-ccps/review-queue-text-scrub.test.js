'use strict';
// cas-ccps/scripts/50_StudentDataAccess.js — ReviewQueue's StudentText
// column. The Student Dashboard used to copy each submission's whole
// response there; nothing read it. Pins: the preview counts and changes
// nothing; the apply empties only that column and keeps every row and
// status; and the health check (10_AdminRecoveryPanel.js) flags rows that
// still hold text.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [S('00_SharedConfig.js'), S('29_StudentContextAggregator.js'), S('50_StudentDataAccess.js')];

function setup(rows) {
  const { exported, sandbox } = loadGasFiles(FILES,
    ['previewReviewQueueTextScrub', 'applyReviewQueueTextScrub', '_countReviewQueueRowsWithText_']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  const queue = ss.insertSheet('ReviewQueue');
  queue.appendRow(['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'StudentText', 'Status', 'ResultRef']);
  (rows || []).forEach((r) => queue.appendRow(r));
  return { exported, queue };
}

const ROWS = [
  ['t1', '1111111@ccpsnet.net', 'f1', 'C1', 'Alice\'s whole essay', 'COMPLETE', '2'],
  ['t2', '2222222@ccpsnet.net', 'f2', 'C2', '', 'PENDING', ''],
  ['t3', '3333333@ccpsnet.net', 'f3', 'C3', 'Cara\'s response', 'STAGED', '4'],
];

test('the preview counts rows holding writing and changes nothing', () => {
  const { exported, queue } = setup(ROWS);
  const r = exported.previewReviewQueueTextScrub();
  assert.equal(r.rowsWithText, 2);
  assert.equal(r.cleared, 0);
  assert.match(r.message, /^DRY RUN: 2/);
  assert.equal(queue.getDataRange().getValues()[1][4], 'Alice\'s whole essay');
});

test('the apply empties only the StudentText column; rows and statuses stay', () => {
  const { exported, queue } = setup(ROWS);
  const r = exported.applyReviewQueueTextScrub();
  assert.equal(r.cleared, 2);
  const data = queue.getDataRange().getValues();
  assert.equal(data.length, 4);
  assert.deepEqual(data.slice(1).map((row) => row[4]), ['', '', '']);
  assert.deepEqual(data.slice(1).map((row) => row[5]), ['COMPLETE', 'PENDING', 'STAGED']);
  assert.deepEqual(data.slice(1).map((row) => row[1]), ROWS.map((row) => row[1]));
  assert.equal(exported._countReviewQueueRowsWithText_(), 0);
});

test('an empty or missing ReviewQueue is nothing to do', () => {
  assert.equal(setup([]).exported.applyReviewQueueTextScrub().cleared, 0);
  const { exported, queue } = setup([]);
  queue.setName('Renamed');
  assert.equal(exported._countReviewQueueRowsWithText_(), 0);
});

// A doc made before the 01 change appends its writing to ReviewQueue itself,
// from its own menu, so the bridge empties the column on every run too.
test('bridgeQueue: stages a PENDING row and empties any student text in the queue', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('03_QueueBridge.js')], ['bridgeQueue']);
  const ss = sandbox.SpreadsheetApp.create('Admin');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('h'));
  const queue = ss.insertSheet('ReviewQueue');
  queue.appendRow(['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'StudentText', 'Status', 'ResultRef']);
  queue.appendRow(['t1', '1111111@ccpsnet.net', 'f1', 'C1', 'An old doc\'s essay', 'PENDING', '']);
  queue.appendRow(['t2', '2222222@ccpsnet.net', 'f2', 'C2', 'Earlier essay', 'COMPLETE', '']);
  const staging = ss.insertSheet('STAGING_PIPELINE');
  staging.appendRow(['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);

  exported.bridgeQueue();

  const rows = queue.getDataRange().getValues().slice(1);
  assert.deepEqual(rows.map((r) => r[4]), ['', '']);
  assert.deepEqual(rows.map((r) => r[5]), ['STAGED', 'COMPLETE']);
  assert.equal(staging.getLastRow(), 2, 'the PENDING row was still staged');
});
