'use strict';
// Regression tests for the automatic Ledger retention archival added in
// 10_AdminRecoveryPanel.js (external product review, Finding 6 / "this
// quarter" scaling fix — extends 30_SCRSuggestionEngine.js's
// SCR_RETENTION_YEARS pattern to the Ledger tab). Deliberately reuses the
// Ledger's own existing "ARCHIVED" status value (the same one
// archiveCompletedTerm() already writes and 13_StudentDashboard.js already
// skips), rather than a second, parallel archive-flag column.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const ADMIN_PANEL_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '10_AdminRecoveryPanel.js');

function load() {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, ADMIN_PANEL_PATH],
    ['_ledgerRetentionYears_', '_archiveExpiredLedgerRows_', '_countLedgerRowsPastRetentionUnarchived_', 'LEDGER'],
  );
}

// Ledger row layout: only the columns this logic actually touches
// (LEDGER.TIMESTAMP=0, LEDGER.STATUS=12) need real values — everything
// else is left blank, matching this codebase's own tolerance for sparse
// rows (String(row[n] || "")).
function ledgerRow(LEDGER, { timestamp, status }) {
  const row = new Array(23).fill('');
  row[LEDGER.TIMESTAMP] = timestamp;
  row[LEDGER.STATUS] = status;
  return row;
}

function setUpFixture(sandbox, LEDGER, rows) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('header'));
  rows.forEach((r) => ledger.appendRow(ledgerRow(LEDGER, r)));
  return { ss, ledger };
}

function yearsAgo(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
}

test('_ledgerRetentionYears_: defaults to 5 when unset, same unconfirmed default as SCR_RETENTION_YEARS', () => {
  const { exported } = load();
  assert.equal(exported._ledgerRetentionYears_(), 5);
});

test('_ledgerRetentionYears_: an explicitly configured value overrides the default', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('LEDGER_RETENTION_YEARS', '7');
  assert.equal(exported._ledgerRetentionYears_(), 7);
});

test('_ledgerRetentionYears_: a garbage or non-positive property value falls back to the default', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('LEDGER_RETENTION_YEARS', 'not-a-number');
  assert.equal(exported._ledgerRetentionYears_(), 5);
  sandbox.PropertiesService.getScriptProperties().setProperty('LEDGER_RETENTION_YEARS', '-3');
  assert.equal(exported._ledgerRetentionYears_(), 5);
});

test('_archiveExpiredLedgerRows_: archives an old COMPLIANT/ACTIVE/COMPLETE row past retention', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { timestamp: yearsAgo(6), status: 'COMPLIANT' },
    { timestamp: yearsAgo(6), status: 'ACTIVE' },
    { timestamp: yearsAgo(6), status: 'COMPLETE' },
  ]);

  const result = exported._archiveExpiredLedgerRows_();
  assert.equal(result.archived, 3);
  assert.equal(result.checked, 3);

  const rows = ledger.getRange(2, 1, 3, 23).getValues();
  rows.forEach((row) => assert.equal(row[exported.LEDGER.STATUS], 'ARCHIVED'));
});

test('_archiveExpiredLedgerRows_: leaves a recent row (within the retention window) untouched', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { timestamp: yearsAgo(1), status: 'COMPLIANT' },
  ]);

  const result = exported._archiveExpiredLedgerRows_();
  assert.equal(result.archived, 0);

  const row = ledger.getRange(2, 1, 1, 23).getValues()[0];
  assert.equal(row[exported.LEDGER.STATUS], 'COMPLIANT');
});

test('_archiveExpiredLedgerRows_: never touches an ERROR-prefixed row, even if very old — left for admin review', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { timestamp: yearsAgo(10), status: 'ERROR_TIMEOUT' },
  ]);

  const result = exported._archiveExpiredLedgerRows_();
  assert.equal(result.archived, 0);

  const row = ledger.getRange(2, 1, 1, 23).getValues()[0];
  assert.equal(row[exported.LEDGER.STATUS], 'ERROR_TIMEOUT');
});

test('_archiveExpiredLedgerRows_: an already-ARCHIVED row is left alone (not re-processed)', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { timestamp: yearsAgo(10), status: 'ARCHIVED' },
  ]);

  const result = exported._archiveExpiredLedgerRows_();
  assert.equal(result.archived, 0);

  const row = ledger.getRange(2, 1, 1, 23).getValues()[0];
  assert.equal(row[exported.LEDGER.STATUS], 'ARCHIVED');
});

test('_archiveExpiredLedgerRows_: a blank Timestamp is skipped, never treated as ageless-and-archivable', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { timestamp: '', status: 'ACTIVE' },
  ]);

  const result = exported._archiveExpiredLedgerRows_();
  assert.equal(result.archived, 0);

  const row = ledger.getRange(2, 1, 1, 23).getValues()[0];
  assert.equal(row[exported.LEDGER.STATUS], 'ACTIVE');
});

test('_archiveExpiredLedgerRows_: a missing Ledger tab returns zeros rather than throwing', () => {
  const { exported, sandbox } = load();
  sandbox.SpreadsheetApp.create('Central Ledger no tab'); // registered but never opened by getConfig_
  const ss = sandbox.SpreadsheetApp.create('Empty Ledger SS');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  assert.deepEqual(exported._archiveExpiredLedgerRows_(), { archived: 0, checked: 0 });
});

test('_countLedgerRowsPastRetentionUnarchived_: mirrors _archiveExpiredLedgerRows_ as a read-only check', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox, exported.LEDGER, [
    { timestamp: yearsAgo(6), status: 'COMPLIANT' },
    { timestamp: yearsAgo(1), status: 'COMPLIANT' },
  ]);

  // Before archival runs, exactly one row is past retention and unarchived.
  assert.equal(exported._countLedgerRowsPastRetentionUnarchived_(), 1);

  // After archival runs, the count drops to zero — same "genuine signal,
  // not a tautology" relationship this function's own comment documents
  // for its SCRDecisionLog counterpart.
  exported._archiveExpiredLedgerRows_();
  assert.equal(exported._countLedgerRowsPastRetentionUnarchived_(), 0);
});
