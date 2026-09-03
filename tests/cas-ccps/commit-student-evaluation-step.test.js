'use strict';
// Regression tests for cas-ccps/studio-steps/CommitStudentEvaluationStep.gs —
// Flow 2's Step 3b (relay/split) + Step 5b (CompetencyEvidence write) +
// the formatted feedback block for Step 5.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'CommitStudentEvaluationStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, STEP_PATH], exposeNames);
}

const APPROVED_OUTPUT = [
  '1. OVERALL ASSESSMENT\nMeets the DOD.\n',
  '[SYSTEM: APPROVED]',
  '[SUGGESTED_SCORE: 3]',
  '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]',
].join('\n');

// ── splitGeminiOutput_ ───────────────────────────────────────────────────

test('splitGeminiOutput_: removes the [MILESTONE_OUTCOMES: ...] line and parses it', () => {
  const { exported } = load(['splitGeminiOutput_']);
  const result = exported.splitGeminiOutput_(APPROVED_OUTPUT);
  assert.ok(!result.studentFacingReport.includes('MILESTONE_OUTCOMES'));
  assert.ok(result.studentFacingReport.includes('[SYSTEM: APPROVED]'));
  assert.deepEqual(result.outcomesParsed, { '1': 'MET', '2': 'MET', '3': 'MET', '4': 'MET' });
});

test('splitGeminiOutput_: missing the outcomes line falls back to the full original text, outcomesParsed null', () => {
  const { exported } = load(['splitGeminiOutput_']);
  const text = '[SYSTEM: APPROVED]\nNo machine-readable line here.';
  const result = exported.splitGeminiOutput_(text);
  assert.equal(result.studentFacingReport, text);
  assert.equal(result.outcomesParsed, null);
});

test('splitGeminiOutput_: malformed JSON inside the outcomes line still strips the line, outcomesParsed null', () => {
  const { exported } = load(['splitGeminiOutput_']);
  const text = '[SYSTEM: APPROVED]\n[MILESTONE_OUTCOMES: {not valid json}]';
  const result = exported.splitGeminiOutput_(text);
  assert.ok(!result.studentFacingReport.includes('MILESTONE_OUTCOMES'));
  assert.equal(result.outcomesParsed, null);
});

test('splitGeminiOutput_: an out-of-vocabulary outcome value becomes null for that milestone only', () => {
  const { exported } = load(['splitGeminiOutput_']);
  const text = '[MILESTONE_OUTCOMES: {"1":"MET","2":"kinda","3":"MET","4":"MET"}]';
  const result = exported.splitGeminiOutput_(text);
  assert.equal(result.outcomesParsed['1'], 'MET');
  assert.equal(result.outcomesParsed['2'], null);
});

// ── formatFeedbackBlock_ ─────────────────────────────────────────────────

test('formatFeedbackBlock_: uses the real U+2500 box-drawing markers, not an ASCII "--" transliteration', () => {
  const { exported } = load(['formatFeedbackBlock_']);
  const block = exported.formatFeedbackBlock_('report text');
  assert.match(block, /── EVALUATION .+ ──/);
  assert.match(block, /── END EVALUATION ──/);
  assert.ok(!block.includes('-- EVALUATION'), 'must not contain the ASCII transliteration');
  assert.ok(!block.includes('-- END EVALUATION --'), 'must not contain the ASCII transliteration');
});

test('formatFeedbackBlock_: an approved report gets the "MEETS THE STANDARD" result line', () => {
  const { exported } = load(['formatFeedbackBlock_']);
  const block = exported.formatFeedbackBlock_('[SYSTEM: APPROVED]\nGreat work.');
  assert.match(block, /RESULT: YOUR WORK MEETS THE STANDARD/);
});

test('formatFeedbackBlock_: a revision-required report gets the "REVISIONS REQUIRED" result line', () => {
  const { exported } = load(['formatFeedbackBlock_']);
  const block = exported.formatFeedbackBlock_('[SYSTEM: REVISION_REQUIRED]\nNeeds work.');
  assert.match(block, /RESULT: REVISIONS REQUIRED/);
});

// ── writeCompetencyEvidence_ ─────────────────────────────────────────────

function makeCompetencyIds(overrides = {}) {
  return { '1': 'CAS-M5-1', '2': 'CAS-M5-2', '3': 'CAS-M5-3', '4': 'CAS-M5-4', ...overrides };
}
function makeMilestoneTexts() {
  return { '1': 'M1 text', '2': 'M2 text', '3': 'M3 text', '4': 'M4 text' };
}
function makeOutcomes(overrides = {}) {
  return { '1': 'MET', '2': 'NOT_MET', '3': 'PARTIALLY_MET', '4': 'MET', ...overrides };
}

test('writeCompetencyEvidence_: writes 8-column rows, creating the CompetencyEvidence tab if it does not exist yet', () => {
  const { exported, sandbox } = load(['writeCompetencyEvidence_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  // Deliberately NOT calling ss.insertSheet('CompetencyEvidence') -- this
  // is the confirmed gap this step's own tab-creation fix closes.

  const result = exported.writeCompetencyEvidence_(
    ss.getId(), 'VDOE-ABC-2026', 'student@example.com', 'file-1',
    makeCompetencyIds(), makeMilestoneTexts(), makeOutcomes()
  );
  assert.deepEqual(result, { written: 4, skipped: 0 });

  const sheet = ss.getSheetByName('CompetencyEvidence');
  assert.ok(sheet, 'tab must be auto-created');
  assert.deepEqual(sheet.getRange(1, 1, 1, 8).getValues()[0], [
    'evidence_id', 'student_email', 'competency_id', 'milestone_text',
    'outcome', 'config_id', 'evaluated_at', 'student_file_id',
  ]);
  const rows = sheet.getRange(2, 1, 4, 8).getValues();
  assert.deepEqual(rows.map((r) => [r[1], r[2], r[3], r[4], r[5], r[7]]), [
    ['student@example.com', 'CAS-M5-1', 'M1 text', 'MET', 'VDOE-ABC-2026', 'file-1'],
    ['student@example.com', 'CAS-M5-2', 'M2 text', 'NOT_MET', 'VDOE-ABC-2026', 'file-1'],
    ['student@example.com', 'CAS-M5-3', 'M3 text', 'PARTIALLY_MET', 'VDOE-ABC-2026', 'file-1'],
    ['student@example.com', 'CAS-M5-4', 'M4 text', 'MET', 'VDOE-ABC-2026', 'file-1'],
  ]);
  rows.forEach((r) => assert.match(r[0], /^EVD-\d{8}-[A-Z0-9]{6}$/));
  // Built inside the vm sandbox's own realm -- instanceof Date against the
  // host's Date would false-negative; Object.prototype.toString is the
  // cross-realm-safe check.
  rows.forEach((r) => assert.equal(Object.prototype.toString.call(r[6]), '[object Date]'));
});

test('writeCompetencyEvidence_: reuses an existing CompetencyEvidence tab and appends after its current rows', () => {
  const { exported, sandbox } = load(['writeCompetencyEvidence_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const sheet = ss.insertSheet('CompetencyEvidence');
  sheet.appendRow(['evidence_id', 'student_email', 'competency_id', 'milestone_text', 'outcome', 'config_id', 'evaluated_at', 'student_file_id']);
  sheet.appendRow(['EVD-EXISTING', 'other@example.com', 'CAS-OLD', 'text', 'MET', 'CFG-OLD', new Date(), 'file-old']);

  const result = exported.writeCompetencyEvidence_(
    ss.getId(), 'VDOE-ABC-2026', 'student@example.com', 'file-1',
    { '1': 'CAS-M5-1', '2': '', '3': '', '4': '' }, { '1': 'M1 text' }, { '1': 'MET' }
  );
  assert.deepEqual(result, { written: 1, skipped: 3 });
  assert.equal(sheet.getLastRow(), 3); // header + existing row + 1 new row
  assert.equal(sheet.getRange(3, 2).getValue(), 'student@example.com');
});

test('writeCompetencyEvidence_: skips a milestone with a blank competency ID (pre-Module-5 assignment)', () => {
  const { exported, sandbox } = load(['writeCompetencyEvidence_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);

  const result = exported.writeCompetencyEvidence_(
    ss.getId(), 'VDOE-ABC-2026', 'student@example.com', 'file-1',
    makeCompetencyIds({ '2': '', '4': '' }), makeMilestoneTexts(), makeOutcomes()
  );
  assert.deepEqual(result, { written: 2, skipped: 2 });
});

test('writeCompetencyEvidence_: skips a milestone with no valid outcome (parse failure)', () => {
  const { exported, sandbox } = load(['writeCompetencyEvidence_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);

  const result = exported.writeCompetencyEvidence_(
    ss.getId(), 'VDOE-ABC-2026', 'student@example.com', 'file-1',
    makeCompetencyIds(), makeMilestoneTexts(), null // outcomesParsed === null, the parse-failure case
  );
  assert.deepEqual(result, { written: 0, skipped: 4 });
});

// ── onCommitStudentEvaluationExecute — end-to-end ────────────────────────

test('onCommitStudentEvaluationExecute: full run writes evidence and returns a ready-to-insert feedback block', () => {
  const { exported, sandbox } = load(['onCommitStudentEvaluationExecute']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);

  const event = makeStudioEvent({
    geminiFullOutput: APPROVED_OUTPUT,
    ledgerSsId: ss.getId(), configId: 'VDOE-ABC-2026',
    studentEmail: 'student@example.com', studentFileId: 'file-1',
    milestone1CompetencyId: 'CAS-M5-1', milestone2CompetencyId: 'CAS-M5-2',
    milestone3CompetencyId: 'CAS-M5-3', milestone4CompetencyId: 'CAS-M5-4',
    milestone1Text: 'M1', milestone2Text: 'M2', milestone3Text: 'M3', milestone4Text: 'M4',
  });
  const result = exported.onCommitStudentEvaluationExecute(event);

  assert.equal(result.variables.parseStatus.stringValues[0], 'OK');
  assert.equal(result.variables.evidenceWritten.intValues[0], 4);
  assert.equal(result.variables.evidenceSkipped.intValues[0], 0);
  assert.match(result.variables.formattedFeedbackBlock.stringValues[0], /── EVALUATION .+ ──/);
  assert.ok(!result.variables.formattedFeedbackBlock.stringValues[0].includes('MILESTONE_OUTCOMES'));
  assert.equal(ss.getSheetByName('CompetencyEvidence').getLastRow(), 5); // header + 4 rows
});

test('onCommitStudentEvaluationExecute: a malformed outcomes line still returns the feedback block (Step 5 is never blocked)', () => {
  const { exported, sandbox } = load(['onCommitStudentEvaluationExecute']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);

  const event = makeStudioEvent({
    geminiFullOutput: '[SYSTEM: APPROVED]\nNo machine-readable line here.',
    ledgerSsId: ss.getId(), configId: 'VDOE-ABC-2026',
    studentEmail: 'student@example.com', studentFileId: 'file-1',
    milestone1CompetencyId: 'CAS-M5-1', milestone2CompetencyId: '', milestone3CompetencyId: '', milestone4CompetencyId: '',
    milestone1Text: 'M1', milestone2Text: '', milestone3Text: '', milestone4Text: '',
  });
  const result = exported.onCommitStudentEvaluationExecute(event);
  assert.equal(result.variables.parseStatus.stringValues[0], 'MILESTONE_OUTCOMES_PARSE_FAILED');
  assert.equal(result.variables.evidenceWritten.intValues[0], 0);
  assert.match(result.variables.formattedFeedbackBlock.stringValues[0], /RESULT: YOUR WORK MEETS THE STANDARD/);
});

test('onCommitStudentEvaluationExecute: an unmapped required input never throws uncaught (fails closed, Step 6 can still run)', () => {
  const { exported, sandbox } = load(['onCommitStudentEvaluationExecute']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);

  const event = makeStudioEvent({
    geminiFullOutput: null, ledgerSsId: ss.getId(), configId: 'VDOE-ABC-2026',
    studentEmail: 'student@example.com', studentFileId: 'file-1',
    milestone1CompetencyId: null, milestone2CompetencyId: null,
    milestone3CompetencyId: null, milestone4CompetencyId: null,
    milestone1Text: null, milestone2Text: null, milestone3Text: null, milestone4Text: null,
  });
  const result = exported.onCommitStudentEvaluationExecute(event);
  // Never throws -- returns a normal output with all fields present.
  assert.ok(result.variables.formattedFeedbackBlock);
  assert.ok(result.variables.parseStatus);
});
