'use strict';
// 37_FlowInputBuilder.js's recordEvaluationResult_() puts each evaluation's
// result on the student's Ledger row, so the Teacher Dashboard can tell
// "never checked" from "checked, not passing yet" from "passed".

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');

function load() {
  const loaded = loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '37_FlowInputBuilder.js')],
    ['recordEvaluationResult_', '_ensureEvaluationResultColumns_', 'LEDGER', 'LEDGER_LATER_HEADERS']);
  const sheet = loaded.sandbox.SpreadsheetApp.create('Central Ledger').insertSheet('Ledger');
  const headers = new Array(19).fill('h');
  sheet.appendRow(headers);
  const row = new Array(19).fill('');
  row[2] = 'VDOE-1'; row[3] = 'file-1'; row[12] = 'ACTIVE';
  sheet.appendRow(row);
  return Object.assign({ sheet }, loaded);
}

const cells = (exported, sheet) => {
  const r = sheet.getRange(2, 1, 1, 27).getValues()[0];
  return { count: r[exported.LEDGER.CHECK_COUNT], result: r[exported.LEDGER.LAST_RESULT],
    firstPassed: r[exported.LEDGER.FIRST_PASSED_AT], score: r[exported.LEDGER.LAST_SUGGESTED_SCORE] };
};

test('recordEvaluationResult_: revise, pass, revise — counts every check and keeps when it first passed', () => {
  const { exported, sheet } = load();
  exported.recordEvaluationResult_(sheet, 'file-1', 'VDOE-1', 'REVISION_REQUIRED', null);
  let c = cells(exported, sheet);
  assert.deepEqual([c.count, c.result, c.firstPassed, c.score], [1, 'NEEDS_REVISION', '', '']);

  exported.recordEvaluationResult_(sheet, 'file-1', 'VDOE-1', 'APPROVED', 3);
  c = cells(exported, sheet);
  assert.equal(c.count, 2);
  assert.equal(c.result, 'PASSED');
  assert.equal(Object.prototype.toString.call(c.firstPassed), '[object Date]');
  assert.equal(c.score, 3);
  const passedAt = c.firstPassed;

  exported.recordEvaluationResult_(sheet, 'file-1', 'VDOE-1', 'REVISION_REQUIRED', null);
  c = cells(exported, sheet);
  assert.deepEqual([c.count, c.result, c.firstPassed, c.score], [3, 'NEEDS_REVISION', passedAt, '']);
});

test('recordEvaluationResult_: another row is untouched, and the headers are filled in', () => {
  const { exported, sheet } = load();
  exported.recordEvaluationResult_(sheet, 'file-other', 'VDOE-1', 'APPROVED', 4);
  assert.equal(cells(exported, sheet).count, '');
  exported.recordEvaluationResult_(sheet, 'file-1', 'VDOE-1', 'APPROVED', 4);
  assert.deepEqual(sheet.getRange(1, 20, 1, 8).getValues()[0], exported.LEDGER_LATER_HEADERS);
});

test('_ensureEvaluationResultColumns_: keeps headers already there, fills only the blanks', () => {
  const { exported, sheet } = load();
  sheet.getRange(1, 20, 1, 4).setValues([['SuggestedScore', 'FinalScore', 'ScoreDecidedBy', 'ScoreDecidedAt']]);
  sheet.getRange(1, 25).setValue('LastResult');
  exported._ensureEvaluationResultColumns_(sheet);
  assert.deepEqual(sheet.getRange(1, 20, 1, 8).getValues()[0], exported.LEDGER_LATER_HEADERS);
});
