'use strict';
// Regression tests for reactivateArchivedTerm() (10_AdminRecoveryPanel.js,
// KOS/CAS roadmap synthesis 2.2 — "explicit archive/hibernate state"). The
// genuinely missing half of archiveCompletedTerm(): until this, nothing in
// cas-ccps had a way back from ARCHIVED at all — archiveCompletedTerm()'s
// own confirm dialog says so explicitly ("This cannot be undone
// automatically — contact your admin to restore"). This is that restore
// path. Fixture/harness conventions match tests/cas-ccps/ledger-retention.test.js.
//
// Since 2026-10-12 both take a school year ("2526" or "2025-26"), not a
// term: a term is one marking period ("2526_MP1") of a year-long course
// (tests/cas-ccps/term-marking-periods.test.js). Older terms still count
// toward their school year.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const ADMIN_PANEL_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '10_AdminRecoveryPanel.js');

function load() {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, ADMIN_PANEL_PATH],
    ['reactivateArchivedTerm', 'archiveCompletedTerm', 'LEDGER'],
  );
}

function ledgerRow(LEDGER, { status, term }) {
  const row = new Array(23).fill('');
  row[LEDGER.STATUS] = status;
  row[LEDGER.ACADEMIC_YEAR] = term;
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

// Scripts a prompt()/alert() pair that answers "OK" with the given text,
// then "Yes" to the follow-up confirm — same shape a human clicking
// through both dialogs produces. makeUiMock's alert() default (Button.OK)
// would otherwise read as "No" on the YES_NO confirm.
function scriptUi(sandbox, responseText) {
  const ui = sandbox.SpreadsheetApp.getUi();
  ui.prompt = () => ({ getSelectedButton: () => ui.Button.OK, getResponseText: () => responseText });
  ui.alert = () => ui.Button.YES;
  return ui;
}

test('reactivateArchivedTerm: sets a school year\'s ARCHIVED rows back to ACTIVE, any term in it', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { status: 'ARCHIVED', term: '2025-26 S1' },
    { status: 'ARCHIVED', term: '2526_MP3' },
  ]);
  scriptUi(sandbox, '2526');

  exported.reactivateArchivedTerm();

  const rows = ledger.getRange(2, 1, 2, 23).getValues();
  rows.forEach((row) => assert.equal(row[exported.LEDGER.STATUS], 'ACTIVE'));
});

test('reactivateArchivedTerm: leaves a different school year\'s ARCHIVED rows untouched', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { status: 'ARCHIVED', term: '2025-26 S1' },
    { status: 'ARCHIVED', term: '2024-25 S2' },
  ]);
  scriptUi(sandbox, '2025-26');

  exported.reactivateArchivedTerm();

  const rows = ledger.getRange(2, 1, 2, 23).getValues();
  assert.equal(rows[0][exported.LEDGER.STATUS], 'ACTIVE');
  assert.equal(rows[1][exported.LEDGER.STATUS], 'ARCHIVED'); // different school year, untouched
});

test('reactivateArchivedTerm: leaves a non-ARCHIVED row in the matching school year untouched', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { status: 'COMPLIANT', term: '2025-26 S1' },
  ]);
  scriptUi(sandbox, '2526');

  exported.reactivateArchivedTerm();

  const row = ledger.getRange(2, 1, 1, 23).getValues()[0];
  assert.equal(row[exported.LEDGER.STATUS], 'COMPLIANT'); // was never archived, stays as-is
});

test('archiveCompletedTerm then reactivateArchivedTerm: a full round trip lands on ACTIVE, not the original status', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { status: 'COMPLIANT', term: '2025-26 S1' },
  ]);

  scriptUi(sandbox, '2526');
  exported.archiveCompletedTerm();
  assert.equal(ledger.getRange(2, exported.LEDGER.STATUS + 1).getValue(), 'ARCHIVED');

  scriptUi(sandbox, '2526');
  exported.reactivateArchivedTerm();
  // Documented, deliberate simplification: the original COMPLIANT/ACTIVE/
  // COMPLETE distinction is not recoverable through the round trip.
  assert.equal(ledger.getRange(2, exported.LEDGER.STATUS + 1).getValue(), 'ACTIVE');
});

test('archiveCompletedTerm: a single marking period is refused, and nothing is archived', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox, exported.LEDGER, [
    { status: 'COMPLIANT', term: '2526_MP1' },
  ]);
  const said = [];
  const ui = scriptUi(sandbox, '2526_MP1');
  ui.alert = (msg) => { said.push(String(msg)); return ui.Button.YES; };

  exported.archiveCompletedTerm();

  assert.equal(ledger.getRange(2, exported.LEDGER.STATUS + 1).getValue(), 'COMPLIANT');
  assert.ok(said.some((m) => /one marking period/.test(m)), said.join(' | '));
});
