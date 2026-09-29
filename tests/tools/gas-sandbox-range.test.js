'use strict';
// The harness's fake Sheets ranges behave like real ones. A mock that is
// more forgiving than Apps Script hides the bugs it exists to catch: this
// one used to accept a 0-row range and return [], so a missing
// `getLastRow() <= 1` guard passed every test and threw in production.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('../harness/gas-sandbox');

function sheet() {
  const { sandbox } = loadGasFiles([], []);
  return sandbox.SpreadsheetApp.create('x').insertSheet('S');
}

test('getRange refuses the ranges real Sheets refuses', () => {
  const s = sheet();
  assert.throws(() => s.getRange(2, 1, 0, 3), /number of rows in the range must be at least 1/);
  assert.throws(() => s.getRange(1, 1, 1, 0), /number of columns in the range must be at least 1/);
  assert.throws(() => s.getRange(0, 1), /starting row of the range is too small/);
  assert.throws(() => s.getRange(1, 0), /starting column of the range is too small/);
  // The classic empty-tab bug: getLastRow() is 0, so lastRow - 1 is -1.
  assert.throws(() => s.getRange(2, 1, s.getLastRow() - 1, 3));
});

test('setValues refuses data whose shape does not match the range', () => {
  const s = sheet();
  assert.throws(() => s.getRange(1, 1, 2, 2).setValues([[1, 2]]), /number of rows in the data/);
  assert.throws(() => s.getRange(1, 1, 1, 2).setValues([[1, 2, 3]]), /number of columns in the data/);
  s.getRange(1, 1, 1, 2).setValues([[1, 2]]);
  assert.deepEqual(s.getRange(1, 1, 1, 2).getValues(), [[1, 2]]);
});

test('an empty sheet\'s data range is A1, as in real Sheets', () => {
  assert.deepEqual(sheet().getDataRange().getValues(), [['']]);
});

test('A1 notation: cells, blocks, whole rows and whole columns', () => {
  const s = sheet();
  s.appendRow(['a', 'b', 'c']);
  s.appendRow(['d', 'e', 'f']);
  assert.equal(s.getRange('B2').getValue(), 'e');
  assert.deepEqual(s.getRange('A1:B2').getValues(), [['a', 'b'], ['d', 'e']]);
  assert.deepEqual(s.getRange('1:1').getValues(), [['a', 'b', 'c']]);
  assert.deepEqual(s.getRange('C:C').getValues(), [['c'], ['f']]);
});
