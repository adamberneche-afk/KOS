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

// ── More places the fakes used to be looser than Apps Script ───────────────

test('getLastRow ignores rows whose cells were cleared, and appendRow writes after the last real row', () => {
  const s = sheet();
  s.appendRow(['h']); s.appendRow(['a']); s.appendRow(['b']);
  s.getRange(3, 1).setValue('');
  assert.equal(s.getLastRow(), 2);
  s.getRange(2, 1, 1, 1).clearContent();
  assert.equal(s.getLastRow(), 1);
  s.appendRow(['c']);
  assert.equal(s.getLastRow(), 2);
  assert.deepEqual(s.getDataRange().getValues(), [['h'], ['c']]);
  // An all-blank row is not content, so it doesn't move the next append.
  s.appendRow(['', '']);
  s.appendRow(['d']);
  assert.equal(s.getRange(3, 1).getValue(), 'd');
});

test('getLastColumn is the last column with content', () => {
  const s = sheet();
  s.appendRow(['a', 'b', '']);
  assert.equal(s.getLastColumn(), 2);
  s.getRange(1, 2).setValue('');
  assert.equal(s.getLastColumn(), 1);
});

test('insertSheet refuses a duplicate name and names an unnamed sheet', () => {
  const { sandbox } = loadGasFiles([], []);
  const ss = sandbox.SpreadsheetApp.create('x');
  ss.insertSheet('Tab');
  assert.throws(() => ss.insertSheet('Tab'), /A sheet with the name "Tab" already exists/);
  const unnamed = ss.insertSheet().getName();
  assert.match(unnamed, /^Sheet\d+$/);
  assert.equal(ss.getSheets().filter((t) => t.getName() === unnamed).length, 1);
});

test('a new doc body is one empty paragraph, like real Docs', () => {
  const { sandbox } = loadGasFiles([], []);
  const body = sandbox.DocumentApp.create('d').getBody();
  assert.equal(body.getNumChildren(), 1);
  assert.equal(body.getText(), '');
  body.appendParagraph('x');
  assert.equal(body.getText(), '\nx');
  body.clear();
  assert.equal(body.getNumChildren(), 1);
});

test('Utilities.formatDate applies the time zone it is given', () => {
  const { sandbox } = loadGasFiles([], []);
  const f = sandbox.Utilities.formatDate;
  const d = new Date('2026-03-04T02:30:00Z');
  assert.equal(f(d, 'UTC', 'yyyy-MM-dd HH:mm'), '2026-03-04 02:30');
  assert.equal(f(d, 'America/New_York', 'yyyy-MM-dd HH:mm'), '2026-03-03 21:30');
  assert.equal(f(d, 'America/New_York', 'MMM d, yyyy h:mm a'), 'Mar 3, 2026 9:30 PM');
  assert.throws(() => f(d, 'UTC', 'yyyy-QQ'), /unsupported format token "QQ"/);
  assert.throws(() => f(d, 'Not/AZone', 'yyyy'), /invalid time zone/);
});

test('each loaded file runs under its own filename, sharing one global scope', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-sandbox-'));
  const a = path.join(dir, 'a.gs'), b = path.join(dir, 'b.gs');
  fs.writeFileSync(a, 'const SHARED = 2;\nfunction whereA() { return new Error().stack; }\n');
  fs.writeFileSync(b, 'function useShared() { return SHARED * 3; }\n');
  const { exported } = loadGasFiles([a, b], ['useShared', 'whereA']);
  assert.equal(exported.useShared(), 6, 'a later file sees an earlier file\'s top-level const');
  assert.match(exported.whereA(), /a\.gs:2/, 'code in a.gs is credited to a.gs, not to the last file');
  fs.rmSync(dir, { recursive: true, force: true });
});
