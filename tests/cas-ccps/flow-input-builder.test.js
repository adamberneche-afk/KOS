'use strict';
// Regression tests for 37_FlowInputBuilder.js — Flow 2's native-Studio
// redesign. Native Studio's "Get sheet contents" step can only target a
// spreadsheet through a fixed picker, never a variable, and Flow 2's
// TeacherMatrix hop is inherently per-teacher (a different spreadsheet
// per teacher) — something native Studio structurally cannot express.
// buildFlowInputRows() resolves that lookup chain in Apps Script instead
// and materializes one flat, literal row on the Central Ledger
// spreadsheet; harvestFlowInputResults() applies Studio's Gemini result
// back once it's written.
//
// Loaded together with 00_SharedConfig.js (getConfig_/LEDGER),
// 03_QueueBridge.js (STG_* column constants), 04_Form2_TurnInGate.js
// (scanCompliance_/extractSuggestedScore_, used by 15c's
// _parseFlow2Response_), 15b_StudioFlowPrompts_Flow2_Revised.js
// (FLOW_2_SYSTEM_PROMPT, referenced by 15c), and
// 15c_Flow2DirectEvaluationService.js (_parseFlow2Response_,
// writeCompetencyEvidenceFromFlow2_, reused directly rather than
// duplicated) — all bound to the same GAS project
// (cas-ccps:central-ledger, see tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const QUEUE_BRIDGE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '03_QueueBridge.js');
const TURNIN_GATE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '04_Form2_TurnInGate.js');
const FLOW2_PROMPT_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '15b_StudioFlowPrompts_Flow2_Revised.js');
const SERVICE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '15c_Flow2DirectEvaluationService.js');
const BUILDER_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '37_FlowInputBuilder.js');

function load(extraGlobals) {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, QUEUE_BRIDGE_PATH, TURNIN_GATE_PATH, FLOW2_PROMPT_PATH, SERVICE_PATH, BUILDER_PATH],
    [
      'buildFlowInputRows', 'harvestFlowInputResults', 'FI', 'FI_HEADERS', 'FI_TAB_NAME',
      'STG_STATUS', 'STG_STUDENT_FILE_ID', 'STG_CONFIG_ID', 'STG_TEACHER_EMAIL',
      'LEDGER',
    ],
    extraGlobals,
  );
}

function setUpConfig(sandbox, ledgerSs) {
  // ADMIN_SS_ID === CENTRAL_LEDGER_SS_ID here on purpose — the standard
  // setup wizard (16_UnifiedManualSetup.js) writes both properties to
  // the same spreadsheet ID; this file's own header note relies on that
  // being the normal case, not a special test simplification.
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', ledgerSs.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ledgerSs.getId());
}

function setUpCentralLedger(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  ss.insertSheet('STAGING_PIPELINE').appendRow(
    ['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']
  );
  ss.insertSheet('Ledger').appendRow(new Array(19).fill('header'));
  ss.insertSheet('MatrixRegistry').appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  return ss;
}

// A Teacher Matrix is always a SEPARATE spreadsheet from the Central
// Ledger (one per teacher) — registered under its own ID, exactly the
// dynamic-target case native Studio's "Get sheet contents" cannot reach.
function setUpTeacherMatrix(sandbox, matrixSsId) {
  const ss = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(matrixSsId, ss);
  ss.insertSheet('TeacherMatrix').appendRow(new Array(20).fill('header'));
  return ss;
}

function stagingRow({ studentFileId, configId, teacherEmail, status = 'IN_PROCESS' }) {
  return [new Date(), '2', studentFileId, configId, teacherEmail, status];
}

// Ledger columns per LEDGER (00_SharedConfig.js) — built by field name,
// not hardcoded index, so this test survives a column reorder.
function ledgerRow({ googleId, configId, fileId, teacherEmail }, exported) {
  const row = new Array(19).fill('');
  row[exported.LEDGER.GOOGLE_ID] = googleId;
  row[exported.LEDGER.CONFIG_ID] = configId;
  row[exported.LEDGER.FILE_ID] = fileId;
  row[exported.LEDGER.TEACHER_EMAIL] = teacherEmail;
  return row;
}

// TeacherMatrix columns per FI_TM_COLUMNS_ (37_FlowInputBuilder.js) —
// same shape as CommitRubricDraftStep.gs's TM_COLUMNS_.
function teacherMatrixRow({
  configId, unitName = 'Unit', tier = 'Tier 1', persona = 'Coach',
  m1 = 'M1', m2 = 'M2', m3 = 'M3', m4 = 'M4', dod = 'DoD',
  c1 = '', c2 = '', c3 = '', c4 = '',
}) {
  const row = new Array(20).fill('');
  row[0] = configId; row[1] = unitName; row[2] = tier; row[3] = persona;
  row[4] = m1; row[5] = m2; row[6] = m3; row[7] = m4; row[8] = dod;
  row[15] = c1; row[16] = c2; row[17] = c3; row[18] = c4;
  return row;
}

function flowInputRow(exported, overrides = {}) {
  const row = new Array(21).fill('');
  row[exported.FI.STUDENT_FILE_ID] = overrides.studentFileId || 'file-1';
  row[exported.FI.CONFIG_ID] = overrides.configId || 'VDOE-1';
  row[exported.FI.STAGING_ROW_REF] = overrides.stagingRowRef || 2;
  row[exported.FI.STUDENT_EMAIL] = overrides.studentEmail || 'student@example.com';
  row[exported.FI.READY_STATUS] = overrides.readyStatus || 'EVALUATED';
  row[exported.FI.GEMINI_FULL_OUTPUT] = overrides.geminiFullOutput || '';
  return row;
}

// ── buildFlowInputRows ───────────────────────────────────────────────────────

test('buildFlowInputRows: resolves the full 3-hop chain into one flat FlowInput row', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);

  const doc = sandbox.DocumentApp.create('Student Doc');
  const studentFileId = doc.getId();

  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' })
  );
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported)
  );
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  const matrixSs = setUpTeacherMatrix(sandbox, 'matrix-ss-1');
  matrixSs.getSheetByName('TeacherMatrix').appendRow(teacherMatrixRow({ configId: 'VDOE-ABC-2026', c1: 'COMP-1' }));

  exported.buildFlowInputRows();

  const fi = ledgerSs.getSheetByName('FlowInput').getDataRange().getValues();
  assert.equal(fi.length, 2, 'header + one built row');
  const row = fi[1];
  assert.equal(row[exported.FI.STUDENT_FILE_ID], studentFileId);
  assert.equal(row[exported.FI.CONFIG_ID], 'VDOE-ABC-2026');
  assert.equal(row[exported.FI.TEACHER_EMAIL], 'teacher@example.com');
  assert.equal(row[exported.FI.STUDENT_EMAIL], 'student@example.com');
  assert.equal(row[exported.FI.STUDENT_DOC_URL], 'https://docs.google.com/document/d/' + studentFileId + '/edit');
  assert.equal(row[exported.FI.UNIT_NAME], 'Unit');
  assert.equal(row[exported.FI.MILESTONE_1_COMPETENCY_ID], 'COMP-1');
  assert.equal(row[exported.FI.READY_STATUS], 'READY');
  assert.equal(row[exported.FI.GEMINI_FULL_OUTPUT], '');
});

test('buildFlowInputRows: running twice on the same STAGING_PIPELINE row does not duplicate', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);

  const doc = sandbox.DocumentApp.create('Student Doc');
  const studentFileId = doc.getId();
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' })
  );
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported)
  );
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  const matrixSs = setUpTeacherMatrix(sandbox, 'matrix-ss-1');
  matrixSs.getSheetByName('TeacherMatrix').appendRow(teacherMatrixRow({ configId: 'VDOE-ABC-2026' }));

  exported.buildFlowInputRows();
  exported.buildFlowInputRows();

  const fi = ledgerSs.getSheetByName('FlowInput').getDataRange().getValues();
  assert.equal(fi.length, 2, 'still just header + one row after a second run');
});

test('buildFlowInputRows: ConfigID alone is NOT enough — two students sharing one ConfigID each get their own correct StudentEmail', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);

  const docA = sandbox.DocumentApp.create('Doc A');
  const docB = sandbox.DocumentApp.create('Doc B');

  const staging = ledgerSs.getSheetByName('STAGING_PIPELINE');
  staging.appendRow(stagingRow({ studentFileId: docA.getId(), configId: 'VDOE-SHARED', teacherEmail: 'teacher@example.com' }));
  staging.appendRow(stagingRow({ studentFileId: docB.getId(), configId: 'VDOE-SHARED', teacherEmail: 'teacher@example.com' }));

  const ledgerSheet = ledgerSs.getSheetByName('Ledger');
  ledgerSheet.appendRow(ledgerRow({ googleId: 'alice@example.com', configId: 'VDOE-SHARED', fileId: docA.getId(), teacherEmail: 'teacher@example.com' }, exported));
  ledgerSheet.appendRow(ledgerRow({ googleId: 'bob@example.com', configId: 'VDOE-SHARED', fileId: docB.getId(), teacherEmail: 'teacher@example.com' }, exported));
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  const matrixSs = setUpTeacherMatrix(sandbox, 'matrix-ss-1');
  matrixSs.getSheetByName('TeacherMatrix').appendRow(teacherMatrixRow({ configId: 'VDOE-SHARED' }));

  exported.buildFlowInputRows();

  const fi = ledgerSs.getSheetByName('FlowInput').getDataRange().getValues();
  assert.equal(fi.length, 3, 'header + two independent rows');
  const emails = [fi[1][exported.FI.STUDENT_EMAIL], fi[2][exported.FI.STUDENT_EMAIL]].sort();
  assert.deepEqual(emails, ['alice@example.com', 'bob@example.com']);
});

test('buildFlowInputRows: no matching Ledger row — skips silently, does not throw, safe to retry next cycle', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId: 'missing-file', configId: 'VDOE-XXX', teacherEmail: 'teacher@example.com' })
  );

  assert.doesNotThrow(() => exported.buildFlowInputRows());
  const fi = ledgerSs.getSheetByName('FlowInput').getDataRange().getValues();
  assert.equal(fi.length, 1, 'only the header row — nothing built');
});

test('buildFlowInputRows: no MatrixRegistry entry for the teacher — skips silently, does not throw', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);

  const doc = sandbox.DocumentApp.create('Student Doc');
  const studentFileId = doc.getId();
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'nobody@example.com' })
  );
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: studentFileId, teacherEmail: 'nobody@example.com' }, exported)
  );
  // MatrixRegistry left empty — no row for nobody@example.com.

  assert.doesNotThrow(() => exported.buildFlowInputRows());
  const fi = ledgerSs.getSheetByName('FlowInput').getDataRange().getValues();
  assert.equal(fi.length, 1);
});

test('buildFlowInputRows: only IN_PROCESS rows are considered — PENDING_INFERENCE is left for the turnstile', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  const doc = sandbox.DocumentApp.create('Student Doc');
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId: doc.getId(), configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com', status: 'PENDING_INFERENCE' })
  );

  exported.buildFlowInputRows();
  const fi = ledgerSs.getSheetByName('FlowInput').getDataRange().getValues();
  assert.equal(fi.length, 1, 'a row not yet released by the per-teacher turnstile must not be built early');
});

// ── harvestFlowInputResults ──────────────────────────────────────────────────

test('harvestFlowInputResults: writes feedback to the doc, CompetencyEvidence rows, marks STAGING_PIPELINE and FlowInput terminal', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);

  const doc = sandbox.DocumentApp.create('Student Doc');
  const studentFileId = doc.getId();
  doc.getBody().appendParagraph('[No feedback yet. Use the panel to run a check.]');

  const staging = ledgerSs.getSheetByName('STAGING_PIPELINE');
  staging.appendRow(stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' }));

  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported)
  );
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  const matrixSs = setUpTeacherMatrix(sandbox, 'matrix-ss-1');
  matrixSs.getSheetByName('TeacherMatrix').appendRow(
    teacherMatrixRow({ configId: 'VDOE-ABC-2026', c1: 'COMP-1', c2: 'COMP-2', c3: 'COMP-3', c4: 'COMP-4' })
  );

  exported.buildFlowInputRows();

  // Simulate Studio's own Step 3 (Ask Gemini) + Step 4 (Update row)
  // writing the raw evaluation back into this same FlowInput row.
  const geminiOutput =
    'Great work overall. Here is your detailed feedback.\n' +
    '[SYSTEM: APPROVED]\n' +
    '[SUGGESTED_SCORE: 4]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"PARTIALLY_MET","4":"NOT_MET"}]';
  const fiSheet = ledgerSs.getSheetByName('FlowInput');
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(geminiOutput);
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');

  exported.harvestFlowInputResults();

  const docText = doc.getBody().getText();
  assert.ok(docText.indexOf('YOUR WORK MEETS THE STANDARD') !== -1, 'feedback block landed in the doc');
  assert.ok(docText.indexOf('Great work overall') !== -1, 'the actual report text is present');
  assert.ok(docText.indexOf('[MILESTONE_OUTCOMES:') === -1, 'the machine-readable line must never reach the student');
  assert.ok(docText.indexOf('[SUGGESTED_SCORE: 4]') !== -1, 'the suggested-score line must survive — 04_Form2_TurnInGate.js reads it at turn-in time');

  const evidence = ledgerSs.getSheetByName('CompetencyEvidence').getDataRange().getValues();
  assert.equal(evidence.length, 5, 'header + 4 milestones — all 4 have both a competency ID and a valid outcome');

  assert.equal(staging.getRange(2, exported.STG_STATUS + 1).getValue(), 'COMPLETE');
  assert.equal(fiSheet.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'HARVESTED');
});

test('harvestFlowInputResults: skips a milestone with no competency ID rather than guessing', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);

  const doc = sandbox.DocumentApp.create('Student Doc');
  const studentFileId = doc.getId();
  const staging = ledgerSs.getSheetByName('STAGING_PIPELINE');
  staging.appendRow(stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' }));
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported)
  );
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  const matrixSs = setUpTeacherMatrix(sandbox, 'matrix-ss-1');
  // Pre-Module-5 assignment: no competency IDs assigned at all.
  matrixSs.getSheetByName('TeacherMatrix').appendRow(teacherMatrixRow({ configId: 'VDOE-ABC-2026' }));

  exported.buildFlowInputRows();

  const geminiOutput =
    'Solid draft.\n[SYSTEM: APPROVED]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]';
  const fiSheet = ledgerSs.getSheetByName('FlowInput');
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(geminiOutput);
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');

  exported.harvestFlowInputResults();

  const evidenceSheet = ledgerSs.getSheetByName('CompetencyEvidence');
  assert.ok(!evidenceSheet || evidenceSheet.getLastRow() === 0,
    'no competency IDs to attach evidence to — zero rows written, not zero-guessed');
  // The rest of harvest must still complete even with zero evidence written.
  assert.equal(fiSheet.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'HARVESTED');
  assert.equal(staging.getRange(2, exported.STG_STATUS + 1).getValue(), 'COMPLETE');
});

test('harvestFlowInputResults: EVALUATED row with empty output is marked ERROR_EMPTY_OUTPUT, not silently skipped or harvested', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  const fiSheet = ledgerSs.insertSheet('FlowInput');
  fiSheet.appendRow(exported.FI_HEADERS);
  fiSheet.appendRow(flowInputRow(exported, { geminiFullOutput: '' }));

  exported.harvestFlowInputResults();

  assert.equal(fiSheet.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'ERROR_EMPTY_OUTPUT');
});

test('harvestFlowInputResults: only EVALUATED rows are touched — READY and HARVESTED rows are left alone', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  const fiSheet = ledgerSs.insertSheet('FlowInput');
  fiSheet.appendRow(exported.FI_HEADERS);
  fiSheet.appendRow(flowInputRow(exported, { readyStatus: 'READY', studentFileId: 'file-ready' }));
  fiSheet.appendRow(flowInputRow(exported, { readyStatus: 'HARVESTED', studentFileId: 'file-done' }));

  assert.doesNotThrow(() => exported.harvestFlowInputResults());
  assert.equal(fiSheet.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'READY');
  assert.equal(fiSheet.getRange(3, exported.FI.READY_STATUS + 1).getValue(), 'HARVESTED');
});
