'use strict';
// Regression tests for cas-ccps/studio-steps/CommitRubricDraftStep.gs —
// Flow 1's Step 3 (rubric-extraction JSON -> TeacherMatrix DRAFT row).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'CommitRubricDraftStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, STEP_PATH], exposeNames);
}

const VALID_RUBRIC = {
  unitName: 'The Business of the Game',
  persona: 'Strict Coach',
  milestone1: 'Identify the target market',
  milestone2: 'Build a pricing strategy',
  milestone3: 'Draft the pitch',
  milestone4: 'Present findings',
  definitionOfDone: 'All four milestones addressed with evidence.',
};

function makeCommitEvent(overrides = {}) {
  return makeStudioEvent({
    geminiJsonOutput: JSON.stringify(VALID_RUBRIC),
    teacherMatrixSsId: 'ss-1',
    teacherEmail: 'teacher@example.com',
    promptTemplateId: 'tmpl-1',
    subject: 'Business',
    courseName: 'Marketing 101',
    tier: 'Advanced',
    ...overrides,
  });
}

test('onCommitRubricDraftExecute: valid rubric JSON writes a DRAFT row and returns a ConfigID', () => {
  const { exported, sandbox } = load(['onCommitRubricDraftExecute']);
  const ss = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  ss.insertSheet('TeacherMatrix');

  const result = exported.onCommitRubricDraftExecute(makeCommitEvent({ teacherMatrixSsId: ss.getId() }));

  assert.equal(result.variables.status.stringValues[0], 'DRAFT_WRITTEN');
  assert.match(result.variables.configId.stringValues[0], /^VDOE-[A-Z0-9]{8}-\d{4}$/);
  assert.equal(result.variables.errorDetail.stringValues[0], '');

  const sheet = ss.getSheetByName('TeacherMatrix');
  const row = sheet.getRange(1, 1, 1, 20).getValues()[0];
  assert.equal(row[1], 'The Business of the Game'); // UNIT_NAME
  assert.equal(row[11], 'DRAFT'); // STATUS
  assert.equal(row[13], 'Business'); // SUBJECT
  assert.equal(row[14], 'Marketing 101'); // COURSE_NAME
  // M5/M6 columns (15-19) stay blank on a fresh DRAFT row.
  for (let i = 15; i < 20; i++) assert.equal(row[i], '');
});

test('onCommitRubricDraftExecute: fence-wrapped Gemini JSON (```json ... ```) is still accepted', () => {
  const { exported, sandbox } = load(['onCommitRubricDraftExecute']);
  const ss = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  ss.insertSheet('TeacherMatrix');

  const fenced = '```json\n' + JSON.stringify(VALID_RUBRIC) + '\n```';
  const result = exported.onCommitRubricDraftExecute(
    makeCommitEvent({ teacherMatrixSsId: ss.getId(), geminiJsonOutput: fenced })
  );
  assert.equal(result.variables.status.stringValues[0], 'DRAFT_WRITTEN');
});

test('onCommitRubricDraftExecute: missing required rubric field fails validation, writes nothing', () => {
  const { exported, sandbox } = load(['onCommitRubricDraftExecute']);
  const ss = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  ss.insertSheet('TeacherMatrix');

  const badRubric = { ...VALID_RUBRIC, milestone4: '' };
  const result = exported.onCommitRubricDraftExecute(
    makeCommitEvent({ teacherMatrixSsId: ss.getId(), geminiJsonOutput: JSON.stringify(badRubric) })
  );

  assert.equal(result.variables.status.stringValues[0], 'VALIDATION_FAILED');
  assert.match(result.variables.errorDetail.stringValues[0], /milestone4/);
  assert.equal(result.variables.configId.stringValues[0], '');
  assert.equal(ss.getSheetByName('TeacherMatrix').getLastRow(), 0);
});

test('onCommitRubricDraftExecute: malformed JSON returns VALIDATION_FAILED, never throws', () => {
  const { exported, sandbox } = load(['onCommitRubricDraftExecute']);
  const ss = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  ss.insertSheet('TeacherMatrix');

  const result = exported.onCommitRubricDraftExecute(
    makeCommitEvent({ teacherMatrixSsId: ss.getId(), geminiJsonOutput: 'not json at all' })
  );
  assert.equal(result.variables.status.stringValues[0], 'VALIDATION_FAILED');
});

test('onCommitRubricDraftExecute: an unmapped required input never throws uncaught (fails closed)', () => {
  const { exported, sandbox } = load(['onCommitRubricDraftExecute']);
  const ss = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  ss.insertSheet('TeacherMatrix');

  // geminiJsonOutput left entirely unmapped (null) -- before inStr_/the
  // outer try/catch, this would have thrown a raw TypeError instead of
  // returning a status.
  const result = exported.onCommitRubricDraftExecute(
    makeCommitEvent({ teacherMatrixSsId: ss.getId(), geminiJsonOutput: null })
  );
  assert.equal(result.variables.status.stringValues[0], 'VALIDATION_FAILED');
});

test('onCommitRubricDraftExecute: a Teacher Matrix with no "TeacherMatrix" tab reports the write failure, not a crash', () => {
  const { exported, sandbox } = load(['onCommitRubricDraftExecute']);
  const ss = sandbox.SpreadsheetApp.create('Teacher Matrix — no tab');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  // Deliberately not calling ss.insertSheet('TeacherMatrix').

  const result = exported.onCommitRubricDraftExecute(makeCommitEvent({ teacherMatrixSsId: ss.getId() }));
  assert.equal(result.variables.status.stringValues[0], 'VALIDATION_FAILED');
  assert.match(result.variables.errorDetail.stringValues[0], /Could not write to Teacher Matrix/);
});
