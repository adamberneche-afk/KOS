'use strict';
// Regression tests for cas-ccps/studio-steps/ReadInstructorConfigStep.gs —
// Flow 2's Step 2 (Ledger -> MatrixRegistry -> TeacherMatrix 3-hop
// lookup). Loaded together with CommitRubricDraftStep.gs (same GAS
// project/global scope) since this step reuses that file's TM_COLUMNS_
// rather than redeclaring its own copy.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');
const COMMIT_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'CommitRubricDraftStep.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'ReadInstructorConfigStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, COMMIT_PATH, STEP_PATH], exposeNames);
}

// Ledger columns (see LEDGER_COLUMNS_): TIMESTAMP,GOOGLE_ID,CONFIG_ID,FILE_ID,
// STUDENT_NAME,BLOCK,CLASS_NAME,TEACHER_NAME,TEACHER_EMAIL,SUBJECT,
// COURSE_NAME,PERIOD,STATUS,SUBMISSION_TS,NOTES,LAST_EVAL,ADMIN_FILE_URL,
// STUDENT_FILE_URL,ACADEMIC_YEAR
function ledgerRow({ googleId, configId, fileId, teacherEmail }) {
  const row = new Array(19).fill('');
  row[1] = googleId; row[2] = configId; row[3] = fileId; row[8] = teacherEmail;
  return row;
}

// TeacherMatrix columns (see TM_COLUMNS_ in CommitRubricDraftStep.gs).
function teacherMatrixRow({ configId, unitName = 'U', tier = 'Advanced', persona = 'P' }) {
  const row = new Array(20).fill('');
  row[0] = configId; row[1] = unitName; row[2] = tier; row[3] = persona;
  row[4] = 'M1'; row[5] = 'M2'; row[6] = 'M3'; row[7] = 'M4'; row[8] = 'DOD';
  return row;
}

function setUpSpreadsheet(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  ss.insertSheet('Ledger').appendRow(new Array(19).fill('header'));
  ss.insertSheet('MatrixRegistry').appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  return ss;
}

// Every sheet these steps read skips row 0 as a header (see e.g.
// findLedgerRow_/findTeacherMatrixRow_'s own `for (var i = 1; ...)`) —
// this helper registers a Teacher Matrix spreadsheet with that header
// row already in place, so a test appending real data rows after it
// doesn't lose its first row to that convention.
function setUpTeacherMatrix(sandbox, matrixSsId) {
  const matrixSs = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(matrixSsId, matrixSs);
  matrixSs.insertSheet('TeacherMatrix').appendRow(new Array(20).fill('header'));
  return matrixSs;
}

test('onReadInstructorConfigExecute: full 3-hop lookup resolves student, teacher, milestones', () => {
  const { exported, sandbox } = load(['onReadInstructorConfigExecute']);
  const ledgerSs = setUpSpreadsheet(sandbox);
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: 'file-1', teacherEmail: 'teacher@example.com' })
  );
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);

  const matrixSs = setUpTeacherMatrix(sandbox, 'matrix-ss-1');
  matrixSs.getSheetByName('TeacherMatrix').appendRow(teacherMatrixRow({ configId: 'VDOE-ABC-2026' }));

  const event = makeStudioEvent({ ledgerSsId: ledgerSs.getId(), configId: 'VDOE-ABC-2026', studentFileId: 'file-1' });
  const result = exported.onReadInstructorConfigExecute(event);

  assert.equal(result.variables.lookupStatus.stringValues[0], 'OK');
  assert.equal(result.variables.studentEmail.stringValues[0], 'student@example.com');
  assert.equal(result.variables.teacherEmail.stringValues[0], 'teacher@example.com');
  assert.equal(result.variables.unitName.stringValues[0], 'U');
  assert.equal(result.variables.milestone1Text.stringValues[0], 'M1');
});

test('onReadInstructorConfigExecute: ConfigID alone is NOT enough — a second student with the same ConfigID and a different FileID does not match the first student\'s row', () => {
  const { exported, sandbox } = load(['onReadInstructorConfigExecute']);
  const ledgerSs = setUpSpreadsheet(sandbox);
  // Two students sharing one rubric ConfigID -- the normal case, per this
  // step's own header note on why FileID must be part of the match.
  const ledgerSheet = ledgerSs.getSheetByName('Ledger');
  ledgerSheet.appendRow(ledgerRow({ googleId: 'alice@example.com', configId: 'VDOE-SHARED', fileId: 'file-alice', teacherEmail: 'teacher@example.com' }));
  ledgerSheet.appendRow(ledgerRow({ googleId: 'bob@example.com', configId: 'VDOE-SHARED', fileId: 'file-bob', teacherEmail: 'teacher@example.com' }));
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  const matrixSs = setUpTeacherMatrix(sandbox, 'matrix-ss-1');
  matrixSs.getSheetByName('TeacherMatrix').appendRow(teacherMatrixRow({ configId: 'VDOE-SHARED' }));

  const event = makeStudioEvent({ ledgerSsId: ledgerSs.getId(), configId: 'VDOE-SHARED', studentFileId: 'file-bob' });
  const result = exported.onReadInstructorConfigExecute(event);

  // Bob's own row, not Alice's (a ConfigID-only match would silently
  // return whichever row appears first -- Alice's).
  assert.equal(result.variables.studentEmail.stringValues[0], 'bob@example.com');
});

test('onReadInstructorConfigExecute: no matching Ledger row -> LEDGER_ROW_NOT_FOUND, all fields empty', () => {
  const { exported, sandbox } = load(['onReadInstructorConfigExecute']);
  const ledgerSs = setUpSpreadsheet(sandbox);

  const event = makeStudioEvent({ ledgerSsId: ledgerSs.getId(), configId: 'nope', studentFileId: 'nope' });
  const result = exported.onReadInstructorConfigExecute(event);

  assert.equal(result.variables.lookupStatus.stringValues[0], 'LEDGER_ROW_NOT_FOUND');
  assert.equal(result.variables.studentEmail.stringValues[0], '');
});

test('onReadInstructorConfigExecute: Ledger row found but no MatrixRegistry entry -> MATRIX_REGISTRY_ROW_NOT_FOUND', () => {
  const { exported, sandbox } = load(['onReadInstructorConfigExecute']);
  const ledgerSs = setUpSpreadsheet(sandbox);
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC', fileId: 'file-1', teacherEmail: 'nobody@example.com' })
  );

  const event = makeStudioEvent({ ledgerSsId: ledgerSs.getId(), configId: 'VDOE-ABC', studentFileId: 'file-1' });
  const result = exported.onReadInstructorConfigExecute(event);
  assert.equal(result.variables.lookupStatus.stringValues[0], 'MATRIX_REGISTRY_ROW_NOT_FOUND');
});

test('onReadInstructorConfigExecute: an unmapped input never throws uncaught (fails closed)', () => {
  const { exported, sandbox } = load(['onReadInstructorConfigExecute']);
  const ledgerSs = setUpSpreadsheet(sandbox);
  const event = makeStudioEvent({ ledgerSsId: ledgerSs.getId(), configId: null, studentFileId: null });
  const result = exported.onReadInstructorConfigExecute(event);
  assert.equal(result.variables.lookupStatus.stringValues[0], 'LEDGER_ROW_NOT_FOUND');
});
