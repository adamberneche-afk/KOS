'use strict';
// Regression tests for 38_LedgerSchemaGuard.js — detecting and safely
// repairing positional drift in the Ledger tab's columns.
//
// The two cases that matter, and that look identical from the header row
// alone (see that file's own header for the full reasoning):
//   A. A helper column inserted BEFORE any registerLedger_ write — rows
//      hold canonical values in canonical slots, only headers shifted.
//      Deleting the column realigns everything. REPAIRABLE.
//   B. Rows written positionally by registerLedger_ AFTER the insert —
//      the inserted column holds real field data. Deleting it would
//      destroy a field. MUST REFUSE.
//
// Loaded together with 00_SharedConfig.js because this file uses its
// LEDGER constant (same GAS project, cas-ccps:central-ledger — see
// tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const GUARD_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '38_LedgerSchemaGuard.js');

function load() {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, GUARD_PATH],
    [
      'checkLedgerSchema', 'repairLedgerSchema', 'repairLedgerSchemaDryRun',
      'LEDGER_CANONICAL_HEADERS', 'LEDGER', 'LEDGER_MIN_CANONICAL_WIDTH',
    ],
  );
}

function setUp(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  return ss;
}

// A well-formed row in canonical field order, 19 wide — the same shape
// registerLedger_ (02_Form1_IntakeAndWorkspaceGenerator.js) appends.
function canonicalRow(sandbox, overrides = {}) {
  const row = new Array(19).fill('');
  row[0] = overrides.timestamp !== undefined ? overrides.timestamp : new sandbox.Date();
  row[1] = 'student@example.com';
  row[2] = 'VDOE-ABC123-2026';
  row[3] = '1QwbL4ci4bAEqQPT1MtLZfaHD11PoTe-GbX01cBnagCk';
  row[4] = 'Test Student';
  row[5] = 'A';
  row[6] = 'Marketing';
  row[7] = 'Adam Berneche';
  row[8] = 'teacher@ccpsnet.net';
  row[9] = 'CTE';
  row[10] = 'Sports Marketing';
  row[11] = '1';
  row[12] = 'ACTIVE';
  row[16] = 'https://docs.google.com/document/d/1QwbL4ci4bAEqQPT1MtLZfaHD11PoTe-GbX01cBnagCk/edit';
  row[18] = '2025-26 S1';
  return row;
}

// ── Clean schema ─────────────────────────────────────────────────────────────

test('checkLedgerSchema: a canonical 19-column Ledger reports ok', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  sheet.appendRow(exported.LEDGER_CANONICAL_HEADERS.slice(0, 19));
  sheet.appendRow(canonicalRow(sandbox));

  const result = exported.checkLedgerSchema();
  assert.equal(result.ok, true);
  assert.equal(result.width, 19);
});

test('checkLedgerSchema: a canonical 23-column Ledger (turn-in columns self-healed in) also reports ok', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  sheet.appendRow(exported.LEDGER_CANONICAL_HEADERS.slice());
  const row = canonicalRow(sandbox).concat(['', '', '', '']);
  sheet.appendRow(row);

  const result = exported.checkLedgerSchema();
  assert.equal(result.ok, true);
  assert.equal(result.width, 23);
});

// ── Case A: header-only shift, safe to repair ────────────────────────────────

test('checkLedgerSchema: detects a single inserted column and names it', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  // "FileURL" spliced in at index 4 — the real incident.
  const headers = exported.LEDGER_CANONICAL_HEADERS.slice(0, 19);
  headers.splice(4, 0, 'FileURL');
  sheet.appendRow(headers);

  const row = canonicalRow(sandbox);
  row.splice(4, 0, 'https://docs.google.com/document/d/1QwbL4ci4bAEqQPT1MtLZfaHD11PoTe-GbX01cBnagCk/edit');
  sheet.appendRow(row);

  const result = exported.checkLedgerSchema();
  assert.equal(result.ok, false);
  assert.equal(result.extraIndex, 4);
  assert.equal(result.extraHeader, 'FileURL');
  assert.equal(result.extraColumnLetter, 'E');
  assert.equal(result.repairable, true, 'values sit in the shifted slots, so removal realigns them');
});

test('repairLedgerSchema: deletes the drifted column, restores canonical alignment, and backs the tab up first', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  const headers = exported.LEDGER_CANONICAL_HEADERS.slice(0, 19);
  headers.splice(4, 0, 'FileURL');
  sheet.appendRow(headers);
  const row = canonicalRow(sandbox);
  row.splice(4, 0, 'https://docs.google.com/document/d/1QwbL4ci4bAEqQPT1MtLZfaHD11PoTe-GbX01cBnagCk/edit');
  sheet.appendRow(row);

  const result = exported.repairLedgerSchema();
  assert.equal(result.ok, true, 'schema is canonical after the repair');

  // The load-bearing assertion: TeacherEmail reads an email again, not a name.
  const repaired = sheet.getDataRange().getValues();
  assert.equal(repaired[0][exported.LEDGER.TEACHER_EMAIL], 'TeacherEmail');
  assert.equal(repaired[1][exported.LEDGER.TEACHER_EMAIL], 'teacher@ccpsnet.net');
  assert.equal(repaired[1][exported.LEDGER.TEACHER_NAME], 'Adam Berneche');
  assert.equal(repaired[1][exported.LEDGER.STUDENT_NAME], 'Test Student');

  const backup = ss.getSheets().find((s) => s.getName().indexOf('Ledger_BACKUP_') === 0);
  assert.ok(backup, 'a timestamped backup tab exists');
  assert.equal(backup.getDataRange().getValues()[0][4], 'FileURL',
    'the backup preserves the pre-repair state, drifted column included');
});

test('repairLedgerSchema: repairs a header-only drift on a Ledger with no data rows at all', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  const headers = exported.LEDGER_CANONICAL_HEADERS.slice(0, 19);
  headers.splice(4, 0, 'FileURL');
  sheet.appendRow(headers);

  const result = exported.repairLedgerSchema();
  assert.equal(result.ok, true);
  assert.equal(sheet.getDataRange().getValues()[0][exported.LEDGER.STUDENT_NAME], 'StudentName');
});

// ── Case B: real data in the drifted column — must refuse ────────────────────

test('repairLedgerSchema: REFUSES when rows were written positionally after the insert, and changes nothing', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  const headers = exported.LEDGER_CANONICAL_HEADERS.slice(0, 19);
  headers.splice(4, 0, 'FileURL');
  sheet.appendRow(headers);

  // registerLedger_ appended 19 canonical values into A..S, ignoring the
  // inserted header entirely — so column E holds StudentName, and every
  // later field sits one slot LEFT of where the headers claim.
  sheet.appendRow(canonicalRow(sandbox));

  const before = sheet.getDataRange().getValues();
  const result = exported.repairLedgerSchema();

  assert.equal(result.repairable, false);
  assert.ok(result.rowProblems.length >= 1, 'the offending row is named');
  assert.equal(result.rowProblems[0].row, 2);
  assert.deepEqual(sheet.getDataRange().getValues(), before, 'nothing was changed');
  assert.ok(!ss.getSheets().some((s) => s.getName().indexOf('Ledger_BACKUP_') === 0),
    'no backup tab is created when the repair is refused');
});

// ── Drift it cannot safely reason about ──────────────────────────────────────

test('checkLedgerSchema: two inserted columns are reported as needing a human, never guessed at', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  const headers = exported.LEDGER_CANONICAL_HEADERS.slice(0, 19);
  headers.splice(4, 0, 'FileURL');
  headers.splice(9, 0, 'ExtraNotes');
  sheet.appendRow(headers);

  const result = exported.checkLedgerSchema();
  assert.equal(result.ok, false);
  assert.equal(result.repairable, false);
  assert.equal(result.extraHeader, undefined);
  assert.match(result.detail, /no single-column removal restores it/);
});

test('checkLedgerSchema: a renamed column is reported, not silently repaired', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  const headers = exported.LEDGER_CANONICAL_HEADERS.slice(0, 19);
  headers[8] = 'Teacher Email'; // space added
  sheet.appendRow(headers);

  const result = exported.checkLedgerSchema();
  assert.equal(result.ok, false);
  assert.equal(result.repairable, false);
});

test('repairLedgerSchemaDryRun: reports a repairable drift without touching the sheet', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  const headers = exported.LEDGER_CANONICAL_HEADERS.slice(0, 19);
  headers.splice(4, 0, 'FileURL');
  sheet.appendRow(headers);
  const row = canonicalRow(sandbox);
  row.splice(4, 0, 'https://docs.google.com/document/d/1QwbL4ci4bAEqQPT1MtLZfaHD11PoTe-GbX01cBnagCk/edit');
  sheet.appendRow(row);

  const before = sheet.getDataRange().getValues();
  const result = exported.repairLedgerSchemaDryRun();

  assert.equal(result.repairable, true);
  assert.deepEqual(sheet.getDataRange().getValues(), before, 'a dry run changes nothing');
  assert.ok(!ss.getSheets().some((s) => s.getName().indexOf('Ledger_BACKUP_') === 0));
});

// ── Robustness ───────────────────────────────────────────────────────────────

test('checkLedgerSchema: a trailing stray value past the real headers does not read as drift', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  // A blank 24th header cell, the shape a since-deleted far-right value
  // leaves behind — getLastColumn() stays inflated forever after.
  sheet.appendRow(exported.LEDGER_CANONICAL_HEADERS.concat(['']));

  const result = exported.checkLedgerSchema();
  assert.equal(result.ok, true, 'trailing blank headers are trimmed before comparison');
});

test('checkLedgerSchema: blank optional fields never read as corruption', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const sheet = ss.insertSheet('Ledger');
  const headers = exported.LEDGER_CANONICAL_HEADERS.slice(0, 19);
  headers.splice(4, 0, 'FileURL');
  sheet.appendRow(headers);

  // registerLedger_ writes "" into SubmissionTS/Notes/LastEval/StudentFileURL
  // at registration time; an unregistered-yet row is mostly blank.
  const row = new Array(20).fill('');
  row[0] = new sandbox.Date();
  row[1] = 'student@example.com';
  row[2] = 'VDOE-ABC123-2026';
  row[3] = '1QwbL4ci4bAEqQPT1MtLZfaHD11PoTe-GbX01cBnagCk';
  row[4] = 'https://docs.google.com/document/d/1QwbL4ci4bAEqQPT1MtLZfaHD11PoTe-GbX01cBnagCk/edit';
  row[9] = 'teacher@ccpsnet.net'; // TeacherEmail in its shifted slot
  sheet.appendRow(row);

  const result = exported.checkLedgerSchema();
  assert.equal(result.repairable, true);
});

test('checkLedgerSchema: a missing Ledger tab is reported, not thrown', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  assert.doesNotThrow(() => {
    const result = exported.checkLedgerSchema();
    assert.equal(result.ok, false);
    assert.match(result.detail, /not found/);
  });
});
