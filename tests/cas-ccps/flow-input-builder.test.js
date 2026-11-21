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
const DOC_HEADER_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '63_DocHeader.js');
const QUEUE_BRIDGE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '03_QueueBridge.js');
const TURNIN_GATE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '04_Form2_TurnInGate.js');
const FLOW2_PROMPT_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '15b_StudioFlowPrompts_Flow2_Revised.js');
const SERVICE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '15c_Flow2DirectEvaluationService.js');
const BUILDER_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '37_FlowInputBuilder.js');
const PARTS_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '68_LessonParts.js');
const ASSIGNMENTS_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '54_StudentAssignments.js');
const PROMPTS_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '40_FlowPrompts.js');

function load(extraGlobals) {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '32_CompetencyRubricImporter.js'), DOC_HEADER_PATH, QUEUE_BRIDGE_PATH, TURNIN_GATE_PATH, FLOW2_PROMPT_PATH, SERVICE_PATH, BUILDER_PATH, PARTS_PATH, PROMPTS_PATH,
      ASSIGNMENTS_PATH],
    [
      'buildFlowInputRows', 'harvestFlowInputResults', 'FI', 'FI_HEADERS', 'FI_TAB_NAME',
      'STG_STATUS', 'STG_STUDENT_FILE_ID', 'STG_CONFIG_ID', 'STG_TEACHER_EMAIL',
      'LEDGER', '_fiCheckPlausibility_', '_fiDistinguishingWords_', 'recordStudentAssignment_',
      '_fiInsertEvaluation_', 'responseZoneBounds_', 'flow2HeldTwiceLine_',
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

// TeacherMatrix columns per 00's TM —
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
  const row = new Array(22).fill('');
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
  // c2: a competency ID Sheets stored as a date (2026-11-18): read back as its
  // ID, never as String() of the Date ("Tue Jul 01 8177 …").
  matrixSs.getSheetByName('TeacherMatrix').appendRow(teacherMatrixRow({ configId: 'VDOE-ABC-2026', c1: 'COMP-1', c2: new Date(8177, 6, 1) }));

  exported.buildFlowInputRows();

  const fi = ledgerSs.getSheetByName('FlowInput').getDataRange().getValues();
  assert.equal(fi.length, 2, 'header + one built row');
  assert.equal(fi[1][exported.FI.MILESTONE_2_COMPETENCY_ID], '8177-7', 'a date cell in the TeacherMatrix comes out as its ID');
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

// Flow 2's Studio starter never fired on an appended row in 40 days, and
// fired at once when ReadyStatus was retyped (2026-10-19). So the row goes
// in with a blank status and READY follows as its own edit; a row an
// earlier run left blank is set READY on the next run.
test('buildFlowInputRows: READY is written as an edit after the row is appended, and a blank row is healed', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  const doc = sandbox.DocumentApp.create('Student Doc');
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId: doc.getId(), configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' }));
  ledgerSs.getSheetByName('Ledger').appendRow(ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026',
    fileId: doc.getId(), teacherEmail: 'teacher@example.com' }, exported));
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  setUpTeacherMatrix(sandbox, 'matrix-ss-1').getSheetByName('TeacherMatrix')
    .appendRow(teacherMatrixRow({ configId: 'VDOE-ABC-2026', c1: 'COMP-1' }));

  // Watch what status each FlowInput row is appended with.
  const appended = [];
  const sheetProto = Object.getPrototypeOf(ledgerSs.insertSheet('probe'));
  const realAppend = sheetProto.appendRow;
  sheetProto.appendRow = function (row) {
    if (this.getName() === 'FlowInput' && this.getLastRow() > 0) appended.push(row[exported.FI.READY_STATUS]);
    return realAppend.call(this, row);
  };
  try {
  exported.buildFlowInputRows();
  const fi = ledgerSs.getSheetByName('FlowInput');
  assert.deepEqual(appended, [''], 'appended with a blank status');
  assert.equal(fi.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'READY', 'then set READY');

  // A run that stopped between the two writes leaves a blank row: the next run sets it.
  fi.getRange(2, exported.FI.READY_STATUS + 1).setValue('');
  exported.buildFlowInputRows();
  assert.equal(fi.getLastRow(), 2, 'not rebuilt');
  assert.equal(fi.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'READY');
  } finally {
    sheetProto.appendRow = realAppend;
  }
});

test('buildFlowInputRows: a real student\'s workspace ID finds its assignment through StudentAssignments', () => {
  // The Ledger and staging carry the student's own workspace ID (VDOE-…);
  // the TeacherMatrix row is the assignment's (CAS-…). Looking the matrix up
  // by the student's ID never matched for a real student (only the canary,
  // which uses one ID for both).
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  const studentFileId = sandbox.DocumentApp.create('Student Doc').getId();
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId, configId: 'VDOE-STU-2026', teacherEmail: 'teacher@example.com' }));
  ledgerSs.getSheetByName('Ledger').appendRow(ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-STU-2026',
    fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported));
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  setUpTeacherMatrix(sandbox, 'matrix-ss-1').getSheetByName('TeacherMatrix')
    .appendRow(teacherMatrixRow({ configId: 'CAS-S1-U1-8175', unitName: 'S1-U1 Industry Overview', c1: '8175-44' }));
  exported.recordStudentAssignment_(ledgerSs, 'VDOE-STU-2026', 'student@example.com', 'CAS-S1-U1-8175');

  exported.buildFlowInputRows();

  const fi = ledgerSs.getSheetByName('FlowInput').getDataRange().getValues();
  assert.equal(fi.length, 2, 'header + one built row');
  assert.equal(fi[1][exported.FI.CONFIG_ID], 'VDOE-STU-2026', 'the row still carries the student\'s own ID');
  assert.equal(fi[1][exported.FI.UNIT_NAME], 'S1-U1 Industry Overview');
  assert.equal(fi[1][exported.FI.MILESTONE_1_COMPETENCY_ID], '8175-44');
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
  doc.getBody().setText('[No feedback yet. Use the panel to run a check.]');

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
    // Every milestone MET: an untiered APPROVED needs that (2026-11-15).
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]';
  const fiSheet = ledgerSs.getSheetByName('FlowInput');
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(geminiOutput);
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');

  exported.harvestFlowInputResults();

  const docText = doc.getBody().getText();
  assert.ok(docText.indexOf('Result: ✅ Passed.') !== -1, 'feedback block landed in the doc');
  assert.ok(docText.indexOf('Great work overall') !== -1, 'the actual report text is present');
  assert.ok(docText.indexOf('[MILESTONE_OUTCOMES:') === -1, 'the machine-readable line must never reach the student');
  assert.ok(docText.indexOf('[SUGGESTED_SCORE: 4]') !== -1, 'the suggested-score line must survive — 04_Form2_TurnInGate.js reads it at turn-in time');
  // Each evaluation carries its own next steps: a passing one suggests
  // turning in on Canvas and still offers another check.
  assert.ok(docText.indexOf('WHAT TO DO NEXT') !== -1, 'the block carries its next steps');
  assert.ok(docText.indexOf('Turn it in on Canvas') !== -1);
  assert.ok(/Submit for Feedback\s+again/.test(docText));
  assert.ok(docText.indexOf('Turn-In Form') === -1 && docText.indexOf('AI Evaluation Panel') === -1,
    'no pointer to the form students never got or the menu that does not run for them');
  assert.ok(docText.indexOf('WHAT TO DO NEXT') < docText.indexOf('── END EVALUATION ──'),
    'the next steps sit inside the block, before its END marker');

  const evidence = ledgerSs.getSheetByName('CompetencyEvidence').getDataRange().getValues();
  assert.equal(evidence.length, 5, 'header + 4 milestones — all 4 have both a competency ID and a valid outcome');

  assert.equal(staging.getRange(2, exported.STG_STATUS + 1).getValue(), 'COMPLETE');
  assert.equal(fiSheet.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'HARVESTED');

  // The result reaches the Ledger for the Teacher Dashboard.
  const ledgerRowValues = ledgerSs.getSheetByName('Ledger').getRange(2, 1, 1, 27).getValues()[0];
  assert.equal(ledgerRowValues[exported.LEDGER.CHECK_COUNT], 1);
  assert.equal(ledgerRowValues[exported.LEDGER.LAST_RESULT], 'PASSED');
  assert.equal(Object.prototype.toString.call(ledgerRowValues[exported.LEDGER.FIRST_PASSED_AT]), '[object Date]');
  assert.equal(ledgerRowValues[exported.LEDGER.LAST_SUGGESTED_SCORE], 4);
});

// ── where the evaluation lands in the student's doc ──────────────────

const RESPONSE_MARKER_LINE = '── YOUR RESPONSE BEGINS HERE ──';
const STUDENT_WORDS = 'My plan is to practice active listening and ask for feedback every week.';

// A doc laid out the way 02's intake builds it: feedback zone near the top
// (placeholder + dashboard link), the assignment, the response zone, and the
// hidden system block last.
function layOutStudentDoc(doc) {
  const body = doc.getBody();
  body.setText('── FEEDBACK ──');
  body.appendParagraph("[No feedback yet. When you're ready, open your assignment dashboard (link below).]");
  body.appendParagraph('Your assignment dashboard: https://example.test/exec — bookmark this.');
  const end = body.appendParagraph('── END FEEDBACK ──');
  end.setAttributes({ FONT_SIZE: 11, FOREGROUND_COLOR: '#000000' });
  body.appendParagraph('');
  body.appendParagraph('Assignment: write a skill development plan.');
  body.appendParagraph(RESPONSE_MARKER_LINE + '\n');
  body.appendParagraph(STUDENT_WORDS);
  const sys = body.appendParagraph('[CONFIG_ID: VDOE-ABC-2026]\nDo not modify or delete this section.');
  sys.setAttributes({ FONT_SIZE: 1, FOREGROUND_COLOR: '#ffffff' });
  return body;
}

function harvestOneEvaluation(geminiOutput, opts = {}) {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  if (opts.feedbackAsComment) {
    sandbox.PropertiesService.getScriptProperties().setProperty('FEEDBACK_AS_COMMENT', opts.feedbackAsComment);
  }
  const configId = opts.configId || 'VDOE-ABC-2026';
  const comments = [];
  sandbox.Drive = { Comments: { create(resource, fileId, params) {
    if (opts.commentFails) throw new Error('Comments API unavailable');
    comments.push({ resource, fileId, params });
    return { id: 'c' + comments.length };
  } } };
  const doc = sandbox.DocumentApp.create('Student Doc');
  const studentFileId = doc.getId();
  layOutStudentDoc(doc);
  if (opts.withHeader) doc.addHeader().appendParagraph('Feedback: submitted, being checked.');
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId, configId: configId, teacherEmail: 'teacher@example.com' }));
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: configId, fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported));
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  setUpTeacherMatrix(sandbox, 'matrix-ss-1').getSheetByName('TeacherMatrix').appendRow(
    teacherMatrixRow({ configId: configId, c1: 'COMP-1', c2: 'COMP-2', c3: 'COMP-3', c4: 'COMP-4' }));
  exported.buildFlowInputRows();
  const fiSheet = ledgerSs.getSheetByName('FlowInput');
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(geminiOutput);
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');
  exported.harvestFlowInputResults();
  return { exported, sandbox, doc, body: doc.getBody(), text: doc.getBody().getText(), comments, ledgerSs };
}

const APPROVED_OUTPUT =
  'Great work overall.\n[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 4]\n' +
  '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]';
const REVISION_OUTPUT =
  'Needs work on milestone 4.\n[SYSTEM: REVISION_REQUIRED]\n' +
  '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"NOT_MET"}]';

test('harvestFlowInputResults: the evaluation lands inside the feedback zone, in the zone\'s formatting, above the assignment', () => {
  const { text, body } = harvestOneEvaluation(APPROVED_OUTPUT);
  const at = (needle) => text.indexOf(needle);
  assert.ok(at('── FEEDBACK ──') < at('── EVALUATION'), 'after the zone opens');
  assert.ok(at('── END EVALUATION ──') < at('── END FEEDBACK ──'), 'before the zone closes');
  assert.ok(at('── END FEEDBACK ──') < at('Assignment: write'), 'above the assignment');
  assert.ok(at('── END FEEDBACK ──') < at(RESPONSE_MARKER_LINE), 'above the response zone');
  assert.ok(at(RESPONSE_MARKER_LINE) < at('[CONFIG_ID:'), 'the hidden system block stays last');
  const block = body.paragraphs.find((p) => p.getText().indexOf('── EVALUATION') !== -1);
  assert.deepEqual(block.getAttributes(), { FONT_SIZE: 11, FOREGROUND_COLOR: '#000000' },
    'not the 1-point white text of the system block it used to inherit');
});

test('harvestFlowInputResults: a revision block above the real marker never changes what is read as the student\'s response', () => {
  // The revision next steps used to quote the response marker line. Now that
  // the block sits above the real marker, a quote would be the first match
  // every extractor finds and pull the assignment into the "response".
  for (const output of [REVISION_OUTPUT, APPROVED_OUTPUT]) {
    const { exported, text } = harvestOneEvaluation(output);
    assert.equal(text.split(RESPONSE_MARKER_LINE).length - 1, 1, 'the marker line appears exactly once');
    const zone = exported.responseZoneBounds_(text);
    assert.equal(text.substring(zone.from, zone.to).trim(), STUDENT_WORDS);
  }
});

test('_fiInsertEvaluation_: later evaluations stack below earlier ones, still inside the zone', () => {
  const { exported, sandbox } = load();
  const doc = sandbox.DocumentApp.create('Student Doc');
  const body = layOutStudentDoc(doc);
  exported._fiInsertEvaluation_(body, '── EVALUATION first ──\nA\n── END EVALUATION ──');
  exported._fiInsertEvaluation_(body, '── EVALUATION second ──\nB\n── END EVALUATION ──');
  const text = body.getText();
  assert.ok(text.indexOf('first') < text.indexOf('second'));
  assert.ok(text.indexOf('second') < text.indexOf('── END FEEDBACK ──'));
});

test('_fiInsertEvaluation_: a doc with no end-of-feedback line gets the block appended, as before', () => {
  const { exported, sandbox } = load();
  const doc = sandbox.DocumentApp.create('Old Doc');
  const body = doc.getBody();
  body.setText('Some older doc layout');
  exported._fiInsertEvaluation_(body, '── EVALUATION x ──\nA\n── END EVALUATION ──');
  assert.ok(body.getText().endsWith('── END EVALUATION ──'));
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

// ── PromptText: the @trigger.PromptText chip ─────────────────────────────────

test('buildFlowInputRows: writes the Flow 2 prompt pre-substituted, leaving only {{STUDENT_TEXT}}', () => {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);

  const doc = sandbox.DocumentApp.create('Student Doc');
  const studentFileId = doc.getId();
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' }));
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported));
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  const matrixSs = setUpTeacherMatrix(sandbox, 'matrix-ss-1');
  matrixSs.getSheetByName('TeacherMatrix').appendRow(teacherMatrixRow({
    configId: 'VDOE-ABC-2026', unitName: 'Campaign Pitch', tier: 'Advanced',
    persona: 'Strict Coach', m1: 'Milestone one text', dod: 'Definition text' }));

  exported.buildFlowInputRows();

  const row = ledgerSs.getSheetByName('FlowInput').getDataRange().getValues()[1];
  const prompt = String(row[exported.FI.PROMPT_TEXT]);

  assert.ok(prompt.length > 500, 'the prompt should be the real substituted template');
  // Every rubric value resolved...
  assert.ok(prompt.indexOf('Campaign Pitch') !== -1);
  assert.ok(prompt.indexOf('Advanced') !== -1);
  assert.ok(prompt.indexOf('Strict Coach') !== -1);
  assert.ok(prompt.indexOf('Milestone one text') !== -1);
  assert.ok(prompt.indexOf('Definition text') !== -1);
  assert.equal(prompt.indexOf('{{UNIT_NAME}}'), -1, 'no unsubstituted rubric placeholders remain');
  assert.equal(prompt.indexOf('{{PERSONA}}'), -1);
  assert.equal(prompt.indexOf('{{DOD}}'), -1);
  // ...except this one, deliberately. Pre-substituting it would mean reading
  // the student's Doc and writing their writing into the central Ledger —
  // the FERPA regression docs/FERPA_DATA_MAP.md's pointer design avoids.
  assert.ok(prompt.indexOf('{{STUDENT_TEXT}}') !== -1,
    '{{STUDENT_TEXT}} must survive for Studio to map the extracted response into');
});

// ── _fiCheckPlausibility_ — the FERPA-safe backstop against kos-personal's ──
// Round 17 failure mode (a model returning well-formed output without ever
// reading its source material). Unlike kos-personal's _srCheckGroundedness_,
// this never opens the student's Doc — only self-reported non-access
// phrases and engagement with the row's own (non-student) rubric content.

function plausibilityRow(exported, overrides = {}) {
  const row = new Array(22).fill('');
  row[exported.FI.UNIT_NAME] = overrides.unitName || '';
  row[exported.FI.TIER] = overrides.tier || '';
  row[exported.FI.PERSONA] = overrides.persona || '';
  row[exported.FI.MILESTONE_1] = overrides.m1 || '';
  return row;
}

test('_fiCheckPlausibility_: a self-reported non-access phrase is caught directly', () => {
  const { exported } = load();
  const row = plausibilityRow(exported, { persona: 'Skeptical Investor' });
  const result = exported._fiCheckPlausibility_(
    'I do not have access to the document, but here is a plausible-sounding evaluation anyway.',
    row);
  assert.equal(result.ok, false);
  assert.match(result.reason, /non-access phrase/);
});

test('_fiCheckPlausibility_: also catches phrases this system did not have before the phrase-list consolidation', () => {
  // Redundancy review B1 / flow-harness proposal Phase 0: before
  // shared/flow-harness/plausibility-phrases.json unified the three
  // systems' phrase lists, this one only caught cas-ccps's own
  // independently-tuned wording — "insufficient context" was leader-hub's
  // phrase, and this file had no way to catch it. Now it does.
  const { exported } = load();
  const row = plausibilityRow(exported, { persona: 'Skeptical Investor' });
  const result = exported._fiCheckPlausibility_(
    'I have insufficient context to evaluate this properly, but here is my attempt anyway.', row);
  assert.equal(result.ok, false);
  assert.match(result.reason, /non-access phrase/);
});

test('_fiCheckPlausibility_: output referencing the rubric passes', () => {
  const { exported } = load();
  const row = plausibilityRow(exported, { unitName: 'Campaign Pitch Deck', persona: 'Skeptical Investor' });
  const result = exported._fiCheckPlausibility_(
    'As the Skeptical Investor persona, your Campaign Pitch Deck milestone was strong.', row);
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('_fiCheckPlausibility_: output sharing none of a specific rubric is caught', () => {
  const { exported } = load();
  const row = plausibilityRow(exported, {
    unitName: 'Campaign Pitch Deck', persona: 'Skeptical Investor',
    m1: 'Articulate a compelling value proposition',
  });
  const result = exported._fiCheckPlausibility_(
    'Great work overall! Keep it up and continue practicing your skills.', row);
  assert.equal(result.ok, false);
  assert.match(result.reason, /shares none of this row.s rubric content/);
});

test('_fiCheckPlausibility_: generic short rubric fields produce nothing to check, so any output passes', () => {
  const { exported } = load();
  // The same defaults teacherMatrixRow()'s fixture rows use elsewhere in
  // this file ('Unit', 'Tier 1', 'Coach', 'M1') — all under the 6-char
  // distinguishing-word floor, so there is nothing to check output against.
  // This is why every EARLIER test in this file (built from those short
  // defaults) still passes unaffected by this gate.
  const row = plausibilityRow(exported, { unitName: 'Unit', tier: 'Tier 1', persona: 'Coach' });
  const result = exported._fiCheckPlausibility_('Totally unrelated text about something else.', row);
  assert.equal(result.ok, true, JSON.stringify(result));
});

// ── The same gate, wired into harvestFlowInputResults() end to end ──────────

function setUpFlow2Scenario(sandbox, exported, rubricOverrides) {
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);

  const doc = sandbox.DocumentApp.create('Student Doc');
  const studentFileId = doc.getId();
  doc.getBody().setText('[No feedback yet. Use the panel to run a check.]');

  const staging = ledgerSs.getSheetByName('STAGING_PIPELINE');
  staging.appendRow(stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' }));
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported));
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  const matrixSs = setUpTeacherMatrix(sandbox, 'matrix-ss-1');
  matrixSs.getSheetByName('TeacherMatrix').appendRow(teacherMatrixRow(Object.assign({
    configId: 'VDOE-ABC-2026', unitName: 'Campaign Pitch Deck', tier: 'Advanced',
    persona: 'Skeptical Investor', m1: 'Articulate a compelling value proposition', c1: 'COMP-1',
  }, rubricOverrides)));

  exported.buildFlowInputRows();
  return { ledgerSs, staging, doc, studentFileId };
}

test('harvestFlowInputResults: a fabricated evaluation is caught before it reaches the student doc or CompetencyEvidence', () => {
  const { exported, sandbox } = load();
  const { ledgerSs, staging, doc } = setUpFlow2Scenario(sandbox, exported);

  // Well-formed, schema-passing — the same shape kos-personal's Round 17
  // incident produced — but never engages with any of this row's rubric.
  const fabricated = 'Great work overall! Keep it up and continue practicing your skills.\n' +
    '[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 4]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]';
  const fiSheet = ledgerSs.getSheetByName('FlowInput');
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(fabricated);
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');

  exported.harvestFlowInputResults();

  assert.equal(fiSheet.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'ERROR_SUSPECT_FABRICATION');
  assert.equal(doc.getBody().getText(), '[No feedback yet. Use the panel to run a check.]',
    'the student doc must not be touched');
  const evidenceSheet = ledgerSs.getSheetByName('CompetencyEvidence');
  assert.ok(!evidenceSheet || evidenceSheet.getLastRow() === 0, 'no evidence written for a suspect row');
  // Marked failed, never COMPLETE (2026-10-22): 03 then closes it and tells
  // the teacher, instead of it timing out as "didn't finish in time".
  assert.equal(staging.getRange(2, exported.STG_STATUS + 1).getValue(), 'ERROR_EVALUATION',
    'the staging row is marked failed, not COMPLETE');
});

test('harvestFlowInputResults: a self-reported non-access phrase in the output is caught the same way', () => {
  const { exported, sandbox } = load();
  const { ledgerSs, staging, doc } = setUpFlow2Scenario(sandbox, exported);

  const fabricated = 'I do not have access to the document, but based on typical patterns this looks solid.\n' +
    '[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 3]\n[MILESTONE_OUTCOMES: {"1":"MET"}]';
  const fiSheet = ledgerSs.getSheetByName('FlowInput');
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(fabricated);
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');

  exported.harvestFlowInputResults();

  assert.equal(fiSheet.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'ERROR_SUSPECT_FABRICATION');
  assert.equal(doc.getBody().getText(), '[No feedback yet. Use the panel to run a check.]');
  assert.equal(staging.getRange(2, exported.STG_STATUS + 1).getValue(), 'ERROR_EVALUATION');
});

test('harvestFlowInputResults: a grounded evaluation referencing real rubric content is still applied normally', () => {
  const { exported, sandbox } = load();
  const { ledgerSs, staging, doc } = setUpFlow2Scenario(sandbox, exported);

  const grounded = 'Your Campaign Pitch Deck as the Skeptical Investor persona needs a stronger value proposition.\n' +
    '[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 4]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]';
  const fiSheet = ledgerSs.getSheetByName('FlowInput');
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(grounded);
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');

  exported.harvestFlowInputResults();

  assert.equal(fiSheet.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'HARVESTED');
  assert.ok(doc.getBody().getText().indexOf('Campaign Pitch Deck') !== -1);
  assert.equal(staging.getRange(2, exported.STG_STATUS + 1).getValue(), 'COMPLETE');
});

// ── An errored evaluation blocks only its own submission ──────────────────
// An ERROR_* FlowInput row used to take its StudentFileID|ConfigID key for
// good, so every later submission of that doc was skipped, timed out in the
// lane, and never got feedback. Now a staging row stamped after the errored
// FlowInput row is a new submission and gets a fresh row, while the same
// submission (even reset by an admin) is never rebuilt.

function setUpErroredScenario(sandbox, exported, stagedAt, erroredAt, errorStatus) {
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  const studentFileId = sandbox.DocumentApp.create('Student Doc').getId();
  const staging = stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' });
  staging[0] = stagedAt;
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(staging);
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported)
  );
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  setUpTeacherMatrix(sandbox, 'matrix-ss-1').getSheetByName('TeacherMatrix')
    .appendRow(teacherMatrixRow({ configId: 'VDOE-ABC-2026' }));
  const fiSheet = ledgerSs.insertSheet('FlowInput');
  fiSheet.appendRow(exported.FI_HEADERS);
  const errored = flowInputRow(exported, { studentFileId, configId: 'VDOE-ABC-2026', readyStatus: errorStatus });
  errored[exported.FI.TIMESTAMP] = erroredAt;
  fiSheet.appendRow(errored);
  return fiSheet;
}

for (const errorStatus of ['ERROR_SUSPECT_FABRICATION', 'ERROR_EMPTY_OUTPUT', 'ERROR_HARVEST_FAILED']) {
  test('buildFlowInputRows: a resubmission after ' + errorStatus + ' gets a fresh FlowInput row', () => {
    const { exported, sandbox } = load();
    const fiSheet = setUpErroredScenario(sandbox, exported,
      '2026-03-04T10:30:00Z', '2026-03-04T10:00:00Z', errorStatus);

    exported.buildFlowInputRows();

    const rows = fiSheet.getDataRange().getValues().slice(1);
    assert.equal(rows.length, 2);
    assert.equal(rows[1][exported.FI.READY_STATUS], 'READY');
  });
}

test('buildFlowInputRows: the submission that errored is never rebuilt, so a suspect row cannot loop', () => {
  const { exported, sandbox } = load();
  // Staged before the FlowInput row was built: the same submission, e.g.
  // an admin reset its ERROR_TIMEOUT staging row back into the lane.
  const fiSheet = setUpErroredScenario(sandbox, exported,
    '2026-03-04T09:55:00Z', '2026-03-04T10:00:00Z', 'ERROR_SUSPECT_FABRICATION');

  exported.buildFlowInputRows();
  exported.buildFlowInputRows();

  assert.equal(fiSheet.getLastRow(), 2, 'header + the errored row only');
});

// FEEDBACK_AS_COMMENT (00): the feedback goes on the doc as a comment and the
// doc itself is left as it was.
test('harvestFlowInputResults: with FEEDBACK_AS_COMMENT on for the course, the feedback is a comment and the doc is untouched', () => {
  const before = (() => { const { sandbox } = load(); const d = sandbox.DocumentApp.create('x'); layOutStudentDoc(d); return d.getBody().getText(); })();
  const { text, comments, exported, ledgerSs } = harvestOneEvaluation(REVISION_OUTPUT,
    { feedbackAsComment: '8175', configId: 'CAS-8175-L06' });
  assert.equal(text, before, 'nothing is written into the doc');
  assert.equal(comments.length, 1);
  const content = comments[0].resource.content;
  assert.match(content, /Result: ✏️ Revise, then submit again\./);
  assert.match(content, /Needs work on milestone 4\./);
  assert.match(content, /What to do next/, 'the next steps ride in the comment');
  // It reads in a narrow panel: no divider lines, and Resolve explained.
  assert.doesNotMatch(content, /────/);
  assert.match(content, /Resolving this comment only hides it/);
  assert.ok(!content.includes('[MILESTONE_OUTCOMES:'), 'the machine-readable line is stripped');
  assert.ok(!content.includes('── EVALUATION'), 'no doc-search markers in a comment');
  const fi = ledgerSs.getSheetByName('FlowInput');
  assert.equal(fi.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'HARVESTED');
});

test('harvestFlowInputResults: the doc header\'s feedback line takes the result and its color', () => {
  let { doc } = harvestOneEvaluation(REVISION_OUTPUT,
    { feedbackAsComment: 'all', configId: 'CAS-8175-L06', withHeader: true });
  let line = doc.getHeader().getChild(1);
  assert.match(line.getText(), /^Feedback: ✏️ Revise, then submit again .*Read the comment on this doc first/);
  assert.equal(line.color, '#b06000');
  // 2026-11-17: the words open the comment itself (Docs hides an unanchored
  // comment behind its Comments button).
  assert.deepEqual(line.links, [{ text: 'the comment on this doc', url: 'https://docs.google.com/document/d/' + doc.getId() + '/edit?disco=c1' }]);
  ({ doc } = harvestOneEvaluation(APPROVED_OUTPUT, { configId: 'CAS-8175-L06', withHeader: true }));
  line = doc.getHeader().getChild(1);
  assert.match(line.getText(), /^Feedback: ✅ Passed .*See the Feedback section below/);
  assert.equal(line.color, '#137333');
  assert.deepEqual(line.links, [], 'feedback in the doc: nothing to link');
});

test('harvestFlowInputResults: FEEDBACK_AS_COMMENT for one course leaves the other course in the doc', () => {
  const { text, comments } = harvestOneEvaluation(APPROVED_OUTPUT,
    { feedbackAsComment: '8175', configId: 'CAS-8177-L06' });
  assert.equal(comments.length, 0);
  assert.ok(text.includes('── EVALUATION'));
});

test('harvestFlowInputResults: if the comment cannot be posted, the feedback goes in the doc instead', () => {
  const { text, comments } = harvestOneEvaluation(APPROVED_OUTPUT,
    { feedbackAsComment: 'all', configId: 'CAS-8175-L06', commentFails: true });
  assert.equal(comments.length, 0);
  assert.ok(text.includes('Result: ✅ Passed.'), 'the student still gets feedback');
});

// ── Competency tiers (2026-10-20) ────────────────────────────────────────────
// A tiered Definition of Done: the primary must be MET and the rest at least
// PARTIALLY_MET; tertiary competencies the work showed (ALSO_SHOWN) become
// MET evidence and never count against the student; the ALSO_SHOWN line
// never reaches the student.

const TIERED_DOD = [
  'PRIMARY COMPETENCY (Milestone 1; must be MET)', '- COMP-1 Primary.', '',
  'SECONDARY COMPETENCIES (must be at least PARTIALLY MET)', '- COMP-2 Secondary.', '',
  'TERTIARY COMPETENCIES (never required; name any the work clearly shows under ALSO SHOWN)',
  '- 8175-40 Marketing mix.', '- 8175-66 Pricing factors.', '',
  'PASSING RULE: APPROVED when Milestone 1 (the primary competency) is MET and Milestones 2, 3 and 4 are each MET or PARTIALLY MET. Tertiary competencies never affect the result.',
].join('\n');

function harvestTiered(geminiOutput) {
  const { exported, sandbox } = load();
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  const doc = sandbox.DocumentApp.create('Student Doc');
  const studentFileId = doc.getId();
  doc.getBody().setText('[No feedback yet. Use the panel to run a check.]');
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(
    stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' }));
  ledgerSs.getSheetByName('Ledger').appendRow(ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026',
    fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported));
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  setUpTeacherMatrix(sandbox, 'matrix-ss-1').getSheetByName('TeacherMatrix').appendRow(
    teacherMatrixRow({ configId: 'VDOE-ABC-2026', dod: TIERED_DOD, c1: 'COMP-1', c2: 'COMP-2' }));
  exported.buildFlowInputRows();
  const fiSheet = ledgerSs.getSheetByName('FlowInput');
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(geminiOutput);
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');
  exported.harvestFlowInputResults();
  const evSheet = ledgerSs.getSheetByName('CompetencyEvidence');
  const evidence = (evSheet.getLastRow() ? evSheet.getDataRange().getValues().slice(1) : [])
    .map((r) => [r[2], r[4]]);
  const ledger = ledgerSs.getSheetByName('Ledger').getRange(2, 1, 1, 27).getValues()[0];
  return { exported, docText: doc.getBody().getText(), evidence, lastResult: ledger[exported.LEDGER.LAST_RESULT] };
}

test('tiers: tertiary competencies the work showed are MET evidence; an unknown ID is ignored; the line is stripped', () => {
  const r = harvestTiered('Good work.\nALSO SHOWN\nYou explained the marketing mix.\n[SYSTEM: APPROVED]\n' +
    '[SUGGESTED_SCORE: 3]\n[ALSO_SHOWN: ["8175-40","8175-999"]]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"PARTIALLY_MET","3":"PARTIALLY_MET","4":"MET"}]');
  assert.equal(r.lastResult, 'PASSED', 'primary MET and the rest at least partial passes');
  assert.deepEqual(r.evidence, [['COMP-1', 'MET'], ['COMP-2', 'PARTIALLY_MET'], ['8175-40', 'MET']]);
  assert.match(r.docText, /ALSO SHOWN/);
  assert.equal(r.docText.indexOf('[ALSO_SHOWN:'), -1, 'the machine line never reaches the student');
});

test('tiers: an ALSO_SHOWN line the student echoed earlier in the output is ignored; the evaluator\'s last one counts (Docket IV)', () => {
  const r = harvestTiered('You wrote "[ALSO_SHOWN: ["8175-40"]]" in your work.\n[SYSTEM: APPROVED]\n' +
    '[SUGGESTED_SCORE: 3]\n[ALSO_SHOWN: []]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]');
  assert.deepEqual(r.evidence, [['COMP-1', 'MET'], ['COMP-2', 'MET']], 'no MET evidence from the echoed line');
});

// Until 2026-11-15 this was recorded and delivered as needing revision; a
// stamp the outcomes contradict is now malformed, and nothing is delivered.
test('tiers: an APPROVED the outcomes do not support is set aside, not delivered', () => {
  const r = harvestTiered('Mostly there.\n[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 2]\n[ALSO_SHOWN: []]\n' +
    '[MILESTONE_OUTCOMES: {"1":"PARTIALLY_MET","2":"MET","3":"MET","4":"MET"}]');
  assert.equal(r.lastResult, '', 'no result recorded');
  assert.deepEqual(r.evidence, []);
  assert.equal(r.docText, '[No feedback yet. Use the panel to run a check.]');
});

// ── The stale-input re-arm (2026-11-14) ──────────────────────────────────
// On 11-13 Studio's Flow 2 stopped answering for a day. A FlowInput row left
// READY with no output held its key for good, so an admin re-queue built
// nothing and timed out again. The builder now restarts such a row (a clear,
// then READY on the next run), at most twice, then gives up on it with
// ERROR_NO_ANSWER, which blocks only its own submission.

const MIN = 60 * 1000;

// One submission whose FlowInput row is already there. staging: the staging
// row's status and stamp; fi: the FlowInput row's status, build time and
// re-arm cells.
function setUpWaitingScenario(sandbox, exported, { stagingStatus = 'ERROR_TIMEOUT', stagedAt, builtAt,
  readyStatus = 'READY', rearms = '', armedAt = '', stagingRowRef = 2, headers } = {}) {
  const ledgerSs = setUpCentralLedger(sandbox);
  setUpConfig(sandbox, ledgerSs);
  const studentFileId = sandbox.DocumentApp.create('Student Doc').getId();
  const staging = stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com',
    status: stagingStatus });
  staging[0] = stagedAt || new Date(Date.now() - 20 * MIN);
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(staging);
  ledgerSs.getSheetByName('Ledger').appendRow(
    ledgerRow({ googleId: 'student@example.com', configId: 'VDOE-ABC-2026', fileId: studentFileId, teacherEmail: 'teacher@example.com' }, exported));
  ledgerSs.getSheetByName('MatrixRegistry').appendRow(['Ms. Smith', 'teacher@example.com', 'matrix-ss-1', new Date()]);
  setUpTeacherMatrix(sandbox, 'matrix-ss-1').getSheetByName('TeacherMatrix')
    .appendRow(teacherMatrixRow({ configId: 'VDOE-ABC-2026' }));
  const fiSheet = ledgerSs.insertSheet('FlowInput');
  fiSheet.appendRow(headers || exported.FI_HEADERS);
  const row = flowInputRow(exported, { studentFileId, configId: 'VDOE-ABC-2026', readyStatus, stagingRowRef });
  row[exported.FI.TIMESTAMP] = builtAt || new Date(Date.now() - 13 * MIN);
  row[exported.FI.PROMPT_TEXT] = 'prompt';
  row.push(rearms, armedAt);
  fiSheet.appendRow(row);
  return { ledgerSs, fiSheet, studentFileId };
}

const fiCell = (fiSheet, exported, col) => fiSheet.getRange(2, exported.FI[col] + 1).getValue();

test('re-arm: a READY row unanswered past the lane timeout is cleared, then set READY on the next run', () => {
  const { exported, sandbox } = load();
  const { fiSheet } = setUpWaitingScenario(sandbox, exported);

  exported.buildFlowInputRows();
  assert.equal(fiSheet.getLastRow(), 2, 'no new row');
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), '', 'cleared: the first of the two edits');
  assert.equal(fiCell(fiSheet, exported, 'REARMS'), 1);
  const armedAt = fiCell(fiSheet, exported, 'ARMED_AT');
  assert.ok(Date.now() - new Date(armedAt).getTime() < MIN, 'ArmedAt is now');

  exported.buildFlowInputRows();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'READY', 'set READY again: the edit that starts Studio');
  exported.buildFlowInputRows();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'READY', 'not restarted again until another 12 minutes pass');
  assert.equal(fiCell(fiSheet, exported, 'REARMS'), 1);
});

test('re-arm: a row cleared by hand long after it was built is set READY once, not restarted on the next run', () => {
  // 11-15: the operator cleared rows built 11-12/13. The left-blank path set
  // them READY without an ArmedAt, so the next run read the old Timestamp
  // and restarted them while Studio was still answering.
  const { exported, sandbox } = load();
  const { fiSheet } = setUpWaitingScenario(sandbox, exported, { builtAt: new Date(Date.now() - 2 * 24 * 60 * MIN) });
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('');

  exported.buildFlowInputRows();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'READY');
  assert.ok(Date.now() - new Date(fiCell(fiSheet, exported, 'ARMED_AT')).getTime() < MIN, 'ArmedAt is this READY');
  assert.equal(fiCell(fiSheet, exported, 'REARMS'), '', 'not counted as a restart');

  exported.buildFlowInputRows();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'READY', 'left alone until 12 minutes after this READY');
  assert.equal(fiCell(fiSheet, exported, 'REARMS'), '');
});

test('re-arm: a READY row younger than the lane timeout, or one with output, is left alone', () => {
  const { exported, sandbox } = load();
  const young = setUpWaitingScenario(sandbox, exported, { stagingStatus: 'IN_PROCESS', builtAt: new Date(Date.now() - 5 * MIN) });
  exported.buildFlowInputRows();
  assert.equal(fiCell(young.fiSheet, exported, 'READY_STATUS'), 'READY');
  assert.equal(fiCell(young.fiSheet, exported, 'REARMS'), '');

  const loaded = load();
  const answered = setUpWaitingScenario(loaded.sandbox, loaded.exported);
  answered.fiSheet.getRange(2, loaded.exported.FI.GEMINI_FULL_OUTPUT + 1).setValue('an answer, status not yet written');
  loaded.exported.buildFlowInputRows();
  assert.equal(fiCell(answered.fiSheet, loaded.exported, 'READY_STATUS'), 'READY');
});

test('re-arm: the fixture row (StagingRowRef FIXTURE) stays READY however old', () => {
  const { exported, sandbox } = load();
  const { fiSheet } = setUpWaitingScenario(sandbox, exported, { stagingRowRef: 'FIXTURE', builtAt: new Date(Date.now() - 600 * MIN) });
  exported.buildFlowInputRows();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'READY');
});

test('re-arm: the second restart is counted, and after two the row is ERROR_NO_ANSWER', () => {
  const { exported, sandbox } = load();
  const once = setUpWaitingScenario(sandbox, exported, { rearms: 1, armedAt: new Date(Date.now() - 13 * MIN) });
  exported.buildFlowInputRows();
  assert.equal(fiCell(once.fiSheet, exported, 'REARMS'), 2);
  assert.equal(fiCell(once.fiSheet, exported, 'READY_STATUS'), '');

  const loaded = load();
  const twice = setUpWaitingScenario(loaded.sandbox, loaded.exported,
    { rearms: 2, armedAt: new Date(Date.now() - 13 * MIN) });
  loaded.exported.buildFlowInputRows();
  assert.equal(fiCell(twice.fiSheet, loaded.exported, 'READY_STATUS'), 'ERROR_NO_ANSWER');
  assert.equal(fiCell(twice.fiSheet, loaded.exported, 'REARMS'), 2, 'not counted again');
  assert.equal(twice.fiSheet.getLastRow(), 2, 'its own submission is not rebuilt');
});

test('re-arm: after ERROR_NO_ANSWER an admin re-queue builds a fresh row, which gets a run', () => {
  const { exported, sandbox } = load();
  const { fiSheet, ledgerSs } = setUpWaitingScenario(sandbox, exported,
    { rearms: 2, armedAt: new Date(Date.now() - 13 * MIN), builtAt: new Date(Date.now() - 40 * MIN) });
  exported.buildFlowInputRows();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'ERROR_NO_ANSWER');

  // 10's reset puts the staging row back in line; the turnstile (06) releases
  // it and stamps it now.
  const staging = ledgerSs.getSheetByName('STAGING_PIPELINE');
  staging.getRange(2, exported.STG_STATUS + 1).setValue('IN_PROCESS');
  staging.getRange(2, 1).setValue(new Date());
  exported.buildFlowInputRows();

  assert.equal(fiSheet.getLastRow(), 3, 'a fresh FlowInput row');
  assert.equal(fiSheet.getRange(3, exported.FI.READY_STATUS + 1).getValue(), 'READY');
});

test('re-arm: an admin re-queue while the row is still READY restarts that row at once, its count from zero', () => {
  const { exported, sandbox } = load();
  // Not yet stale (5 minutes since its last restart), but its submission is
  // back in the lane: an IN_PROCESS staging row stamped after that, at row 3.
  const { fiSheet, ledgerSs, studentFileId } = setUpWaitingScenario(sandbox, exported,
    { rearms: 1, armedAt: new Date(Date.now() - 5 * MIN), builtAt: new Date(Date.now() - 30 * MIN) });
  const requeued = stagingRow({ studentFileId, configId: 'VDOE-ABC-2026', teacherEmail: 'teacher@example.com' });
  requeued[0] = new Date(Date.now() - MIN);
  ledgerSs.getSheetByName('STAGING_PIPELINE').appendRow(requeued);

  exported.buildFlowInputRows();
  assert.equal(fiSheet.getLastRow(), 2, 'the same row, not a second one');
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), '');
  assert.equal(fiCell(fiSheet, exported, 'REARMS'), 0);
  assert.equal(fiCell(fiSheet, exported, 'STAGING_ROW_REF'), 3, 'the harvest completes the re-queued staging row');
  exported.buildFlowInputRows();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'READY');
  assert.equal(fiCell(fiSheet, exported, 'REARMS'), 0, 'not restarted twice for one re-queue');
});

test('re-arm: an IN_PROCESS staging row older than the FlowInput row is its own release, not a re-queue', () => {
  const { exported, sandbox } = load();
  const { fiSheet } = setUpWaitingScenario(sandbox, exported, { stagingStatus: 'IN_PROCESS',
    stagedAt: new Date(Date.now() - 6 * MIN), builtAt: new Date(Date.now() - 5 * MIN) });
  exported.buildFlowInputRows();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'READY');
  assert.equal(fiCell(fiSheet, exported, 'REARMS'), '');
});

test('re-arm: a FlowInput tab from before the new columns gets their headers', () => {
  const { exported, sandbox } = load();
  const old = exported.FI_HEADERS.slice(0, exported.FI.PROMPT_TEXT + 1);
  const { fiSheet } = setUpWaitingScenario(sandbox, exported, { headers: old });
  exported.buildFlowInputRows();
  const header = fiSheet.getRange(1, 1, 1, fiSheet.getLastColumn()).getValues()[0];
  assert.deepEqual(header.slice(-2), ['ReArms', 'ArmedAt']);
  assert.equal(header.length, exported.FI_HEADERS.length);
});

test('re-arm: a late answer still completes its staging row after the lane timed it out, even renumbered', () => {
  const { exported, sandbox } = load();
  // StagingRowRef 9 no longer points at it (an admin clear renumbered the tab).
  const { fiSheet, ledgerSs } = setUpWaitingScenario(sandbox, exported, { stagingRowRef: 9, readyStatus: 'EVALUATED' });
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(APPROVED_OUTPUT);
  exported.harvestFlowInputResults();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'HARVESTED');
  assert.equal(ledgerSs.getSheetByName('STAGING_PIPELINE').getRange(2, exported.STG_STATUS + 1).getValue(), 'COMPLETE',
    '03 then finishes the queue and Ledger rows');
});

test('re-arm: a restarted row answered twice is applied once', () => {
  const { exported, sandbox } = load();
  const { fiSheet, ledgerSs, studentFileId } = setUpWaitingScenario(sandbox, exported,
    { readyStatus: 'EVALUATED', rearms: 1, armedAt: new Date(Date.now() - 2 * MIN) });
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(APPROVED_OUTPUT);
  exported.harvestFlowInputResults();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'HARVESTED');
  const doc = sandbox.DocumentApp.openById(studentFileId);
  const once = doc.getBody().getText();
  assert.match(once, /Great work overall/);
  const logRows = () => ledgerSs.getSheetByName('EvaluationLog').getLastRow();
  const logged = logRows();

  // The restarted run answers too: Studio writes EVALUATED over HARVESTED.
  fiSheet.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(REVISION_OUTPUT);
  fiSheet.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');
  exported.harvestFlowInputResults();
  assert.equal(fiCell(fiSheet, exported, 'READY_STATUS'), 'HARVESTED');
  assert.equal(doc.getBody().getText(), once, 'no second feedback block');
  assert.equal(logRows(), logged, 'no second EvaluationLog row');
});

// 2026-11-17 (proposed after the 11-15 re-grade, the operator's yes): one
// submission, one delivery. A Studio test run that sets a delivered row back
// to EVALUATED with a new answer must not post a second comment, change the
// Ledger or the evidence; a real resubmission still gets its feedback.
test('harvest: a submission already delivered is never delivered again; the overnight email counts it', () => {
  const env = harvestOneEvaluation(REVISION_OUTPUT, { feedbackAsComment: 'all', configId: 'CAS-8175-L06' });
  const { exported, sandbox, comments, ledgerSs } = env;
  const fi = ledgerSs.getSheetByName('FlowInput');
  const evLog = () => ledgerSs.getSheetByName('EvaluationLog').getLastRow();
  const evidence = () => ledgerSs.getSheetByName('CompetencyEvidence').getLastRow();
  assert.equal(comments.length, 1);
  const logBefore = evLog(), evidenceBefore = evidence();

  // A test run re-grades the delivered row.
  fi.getRange(2, exported.FI.GEMINI_FULL_OUTPUT + 1).setValue(APPROVED_OUTPUT);
  fi.getRange(2, exported.FI.READY_STATUS + 1).setValue('EVALUATED');
  exported.harvestFlowInputResults();
  assert.equal(comments.length, 1, 'no second comment');
  assert.equal(fi.getRange(2, exported.FI.READY_STATUS + 1).getValue(), 'HARVESTED');
  assert.equal(evLog(), logBefore, 'no second result logged');
  assert.equal(evidence(), evidenceBefore, 'no second evidence');
  const held = JSON.parse(sandbox.PropertiesService.getScriptProperties().getProperty('FI_HELD_TWICE'));
  assert.equal(held.count, 1);
  assert.match(exported.flow2HeldTwiceLine_(new Date()), /^Flow 2 answered 1 submission\(s\) again on .* None was delivered twice/);
  assert.equal(exported.flow2HeldTwiceLine_(new Date(Date.now() + 3 * 86400000)), '', 'an old count is not news');

  // A resubmission is a new row, built after the delivered result: delivered.
  const later = fi.getRange(2, 1, 1, exported.FI_HEADERS.length).getValues()[0].slice();
  later[exported.FI.TIMESTAMP] = new Date(Date.now() + 60000);
  later[exported.FI.READY_STATUS] = 'EVALUATED';
  later[exported.FI.GEMINI_FULL_OUTPUT] = APPROVED_OUTPUT;
  fi.appendRow(later);
  exported.harvestFlowInputResults();
  assert.equal(comments.length, 2, 'the new submission gets its feedback');
  assert.equal(fi.getRange(3, exported.FI.READY_STATUS + 1).getValue(), 'HARVESTED');
});

// 2026-11-17 (UX audit item 4): a Passed result's revisions are optional,
// and its heading says so; a Revise result's stay required.
test('harvest: on a pass the revisions read "To make it stronger (optional)", in the comment and in the doc', () => {
  const body = (stamp, outcomes) => 'Overall, clear work.\n\n3. REQUIRED REVISIONS\n- Add one real example.\n' +
    '[SYSTEM: ' + stamp + ']\n[MILESTONE_OUTCOMES: ' + outcomes + ']';
  const passed = body('APPROVED', '{"1":"MET","2":"MET","3":"MET","4":"MET"}');
  const revise = body('REVISION_REQUIRED', '{"1":"MET","2":"MET","3":"MET","4":"NOT_MET"}');
  const c = harvestOneEvaluation(passed, { feedbackAsComment: 'all', configId: 'CAS-8175-L06' }).comments[0].resource.content;
  assert.match(c, /\nTO MAKE IT STRONGER \(optional\)\n- Add one real example\./);
  assert.doesNotMatch(c, /REQUIRED REVISIONS/);
  const r = harvestOneEvaluation(revise, { feedbackAsComment: 'all', configId: 'CAS-8175-L06' }).comments[0].resource.content;
  assert.match(r, /\nREQUIRED REVISIONS\n- Add one real example\./, 'a Revise keeps it');
  const doc = harvestOneEvaluation(passed).text;
  assert.match(doc, /3\. TO MAKE IT STRONGER \(optional\)\n- Add one real example\./, 'in the doc, its number kept');
});
