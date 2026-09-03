'use strict';
// Regression tests for cas-ccps/studio-steps/ExtractWarmUpPromptTextStep.gs —
// Flow 4's input-preparation step. Its extraction markers must stay
// byte-identical to CreateWarmUpDocStep.gs's own Zone 1 markers (both
// use the real U+2500 box-drawing character, not an ASCII hyphen —
// see the Studio-steps review's note on why that distinction matters).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'ExtractWarmUpPromptTextStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, STEP_PATH], exposeNames);
}

test('onExtractWarmUpPromptTextExecute: extracts exactly the text between the real Zone 1 markers', () => {
  const { exported } = load(['onExtractWarmUpPromptTextExecute']);
  const docText =
    'Warm-Up — March 2, 2026 — Alice\n' +
    '── WARM-UP PROMPT ──\n' +
    'What is the market for this product?\n' +
    '── END PROMPT ──\n\n' +
    '── YOUR RESPONSE ──\n' +
    'My answer here.';
  const result = exported.onExtractWarmUpPromptTextExecute(makeStudioEvent({ rawDocText: docText }));
  assert.equal(result.variables.extractStatus.stringValues[0], 'OK');
  assert.equal(result.variables.promptText.stringValues[0], 'What is the market for this product?');
});

test('onExtractWarmUpPromptTextExecute: markers built by CreateWarmUpDocStep.gs round-trip through this step', () => {
  const createStepPath = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'CreateWarmUpDocStep.gs');
  const { loadGasFiles: load2, FakeDriveFolder } = require('../harness/gas-sandbox');
  const { exported: createExported, sandbox } = load2([SHARED_PATH, createStepPath], ['onCreateWarmUpDocExecute']);

  const ledgerSs = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ledgerSs.getId(), ledgerSs);
  const wq = ledgerSs.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  const row = new Array(21).fill(''); row[0] = 'Q1';
  wq.appendRow(row);
  sandbox.DriveApp._registerFolder(new FakeDriveFolder('Admin Root', 'admin-root'));

  createExported.onCreateWarmUpDocExecute(makeStudioEvent({
    ledgerSsId: ledgerSs.getId(), queueId: 'Q1',
    lessonContextSnapshotJson: JSON.stringify({ admin_root_folder_id: 'admin-root', course_name: 'C', teacher_name: 'T', period: '1' }),
    studentGoogleId: 's@example.com', studentName: 'Student', firstName: 'Student',
    lessonDate: '2026-03-02', generatedPromptText: 'THE PROMPT TEXT', bridgeOutput: '',
  }));

  const docId = wq.getRange(2, 1, 1, 21).getValues()[0][9];
  const rawDocText = sandbox.DocumentApp._docs.get(docId).getBody().getText();

  const { exported: extractExported } = load(['onExtractWarmUpPromptTextExecute']);
  const result = extractExported.onExtractWarmUpPromptTextExecute(makeStudioEvent({ rawDocText }));
  assert.equal(result.variables.extractStatus.stringValues[0], 'OK');
  assert.equal(result.variables.promptText.stringValues[0], 'THE PROMPT TEXT');
});

test('onExtractWarmUpPromptTextExecute: an ASCII "--" transliteration of the markers does NOT match (must be the real U+2500 character)', () => {
  const { exported } = load(['onExtractWarmUpPromptTextExecute']);
  const docText = '-- WARM-UP PROMPT --\nsome text\n-- END PROMPT --';
  const result = exported.onExtractWarmUpPromptTextExecute(makeStudioEvent({ rawDocText: docText }));
  assert.equal(result.variables.extractStatus.stringValues[0], 'PROMPT_MARKERS_NOT_FOUND');
});

test('onExtractWarmUpPromptTextExecute: missing markers -> PROMPT_MARKERS_NOT_FOUND, promptText empty', () => {
  const { exported } = load(['onExtractWarmUpPromptTextExecute']);
  const result = exported.onExtractWarmUpPromptTextExecute(makeStudioEvent({ rawDocText: 'no markers here' }));
  assert.equal(result.variables.extractStatus.stringValues[0], 'PROMPT_MARKERS_NOT_FOUND');
  assert.equal(result.variables.promptText.stringValues[0], '');
});

test('onExtractWarmUpPromptTextExecute: an unmapped input never throws uncaught (fails closed)', () => {
  const { exported } = load(['onExtractWarmUpPromptTextExecute']);
  const result = exported.onExtractWarmUpPromptTextExecute(makeStudioEvent({ rawDocText: null }));
  assert.equal(result.variables.extractStatus.stringValues[0], 'PROMPT_MARKERS_NOT_FOUND');
});
