'use strict';
// The Unified Manual's "Open Admin Health Check" showed an empty link:
// CENTRAL_LEDGER_SS_URL was read and never written (dead-ends audit
// 2026-10-29, #9). Setup writes it now, and a manual set up before then
// builds the link from the Ledger's ID.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

// The harness's DocumentApp has no getUi(); its SpreadsheetApp's UI mock
// records alerts the same way, so the manual's alerts land there.
function load() {
  const loaded = loadGasFiles([S('00_SharedConfig.js'), S('16_UnifiedManualSetup.js')],
    ['persistAdminProperties_', 'openAdminHealthCheck', 'centralLedgerUrl_']);
  const ui = loaded.sandbox.SpreadsheetApp.getUi();
  loaded.sandbox.DocumentApp.getUi = () => ui;
  return loaded;
}

test('setup writes the Central Ledger link beside its ID', () => {
  const { exported, sandbox } = load();
  exported.persistAdminProperties_({ ledgerSsId: 'ledger123', assignmentsFolderId: 'f',
    masterRubricSsId: 'r', masterMatrixSsId: 'm' }, 'admin@ccpsnet.net', 'Org');
  const props = sandbox.PropertiesService.getScriptProperties();
  assert.equal(props.getProperty('CENTRAL_LEDGER_SS_URL'), 'https://docs.google.com/spreadsheets/d/ledger123/edit');
  assert.equal(props.getProperty('CENTRAL_LEDGER_SS_ID'), 'ledger123');
});

test('Open Admin Health Check: a manual with only the ID still gets the link', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', 'old456');
  exported.openAdminHealthCheck();
  const calls = sandbox.DocumentApp.getUi()._calls;
  assert.match(calls[calls.length - 1].message, /https:\/\/docs\.google\.com\/spreadsheets\/d\/old456\/edit/);
});

test('Open Admin Health Check: neither set says so, rather than an empty link', () => {
  const { exported, sandbox } = load();
  exported.openAdminHealthCheck();
  const calls = sandbox.DocumentApp.getUi()._calls;
  assert.match(calls[calls.length - 1].message, /Not configured/);
  assert.equal(exported.centralLedgerUrl_('  '), '');
});
