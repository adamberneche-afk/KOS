'use strict';
// One failure, one ERROR_LOG row. processIntakePayload() and
// processVectorClassificationPayload() log their own failures and return an
// ERROR result; processInferenceQueue() then logged the same failure again
// (2 rows, or 3 on the intake parse path, which also logged before
// rethrowing). And a Registrar row whose stored JSON failed to parse at
// translation stayed READY_FOR_TRANSLATION, so every 10-minute run logged
// another row, indefinitely.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');

function errorRows(ss) {
  const s = ss.getSheetByName('ERROR_LOG');
  return s && s.getLastRow() > 1 ? s.getRange(2, 1, s.getLastRow() - 1, 3).getValues() : [];
}

test('an intake failure inside processInferenceQueue writes one ERROR_LOG row', () => {
  const { exported, sandbox } = loadGasFiles(
    ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '4_Vector_Router.gs', '12_StudioReturnHarvest.gs',
      '20_VectorClassifySessions.gs', '3_Queue_Processor.gs'].map((f) => path.join(KP, f)),
    ['processInferenceQueue', '_getOrCreateSheet']);
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('INDEX_ID', ss.getId());
  props.setProperty('IDENTITY_KEY', 'k');
  props.setProperty('CORE_THESIS_VERIFIED', 'true');
  // No ID_CURRENT_STATE / ID_PIVOTS_AND_LESSONS: intake fails on its pointers.
  exported._getOrCreateSheet(ss, 'STAGING_PIPELINE');
  exported._getOrCreateSheet(ss, 'STUDIO_RETURN');
  const doc = sandbox.DocumentApp.create('d');
  ss.getSheetByName('STAGING_PIPELINE').appendRow(['t', 'LOG-1_CH01', 'SESSION_LOG', 'u', doc.getId(), 'FLOW_COMPLETE', 0]);
  ss.getSheetByName('STUDIO_RETURN').appendRow(['t', 'LOG-1_CH01', 'SESSION_LOG',
    JSON.stringify({ session_summary: 's', session_metadata: {} }), '', 'HARVESTED', 1, '']);

  exported.processInferenceQueue();

  const status = ss.getSheetByName('STAGING_PIPELINE').getRange(2, 6).getValue();
  assert.match(String(status), /^INTAKE_ERROR/);
  const rows = errorRows(ss);
  assert.equal(rows.length, 1, 'got: ' + rows.map((r) => r[1]).join(' | '));
});

test('a Registrar translation parse failure bounces the row instead of failing every run', () => {
  const { exported, sandbox } = loadGasFiles(
    ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '11_Registrar_CogRelay.gs'].map((f) => path.join(KP, f)),
    ['_translateAndRouteRegistrarRow']);
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
  const ledger = ss.insertSheet('REGISTRAR_LEDGER');
  ledger.appendRow(['File_ID', 'File_Name', 'State', 'Cog1', 'Cog2', 'Translation', 'Attempt', 'Error', 'In', 'Out']);
  const row = ['f1', 'file.txt', 'READY_FOR_TRANSLATION', '{not json', '{}', '', 0, '', '', ''];
  ledger.appendRow(row);

  sandbox.__exported._translateAndRouteRegistrarRow(ledger, 2, row);

  assert.equal(ledger.getRange(2, 3).getValue(), 'PENDING_VALIDATION_2');
  assert.equal(ledger.getRange(2, 7).getValue(), 1, 'counts toward the retry limit');
  assert.equal(errorRows(ss).length, 1);
});
