'use strict';
// After an evaluation comes back (03_QueueBridge.js's backPropagateCompletions):
// - the Ledger row moves to COMPLETE, so the Student Dashboard says
//   "Evaluated — feedback ready" instead of "Not started yet";
// - the next steps point at the dashboard (the doc's menu doesn't run for
//   student accounts) and at Canvas, where students turn in.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');

function load() {
  return loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '03_QueueBridge.js')],
    ['markLedgerEvaluated_', 'buildNextStepsText_', 'processCompletedEvaluation_']);
}

function ledgerWith(sandbox, statuses) {
  const sheet = sandbox.SpreadsheetApp.create('Central Ledger').insertSheet('Ledger');
  sheet.appendRow(new Array(23).fill('header'));
  statuses.forEach((status, i) => {
    const row = new Array(23).fill('');
    row[1] = 'student' + i + '@ccpsnet.net'; row[2] = 'VDOE-' + i; row[3] = 'file-' + i; row[12] = status;
    sheet.appendRow(row);
  });
  return sheet;
}

test('markLedgerEvaluated_: a not-yet-evaluated row becomes COMPLETE', () => {
  const { exported, sandbox } = load();
  for (const status of ['ACTIVE', 'PENDING', 'STAGED', 'ERROR_TIMEOUT', 'COMPLETE']) {
    const sheet = ledgerWith(sandbox, [status]);
    exported.markLedgerEvaluated_(sheet, 'file-0', 'VDOE-0');
    assert.equal(sheet.getRange(2, 13).getValue(), 'COMPLETE', status);
  }
});

test('markLedgerEvaluated_: turned-in and archived rows keep their status; other rows are untouched', () => {
  const { exported, sandbox } = load();
  const sheet = ledgerWith(sandbox, ['PENDING_TEACHER_REVIEW', 'COMPLIANT', 'ARCHIVED', 'ACTIVE']);
  ['file-0', 'file-1', 'file-2'].forEach((f, i) => exported.markLedgerEvaluated_(sheet, f, 'VDOE-' + i));
  assert.deepEqual([2, 3, 4, 5].map(r => sheet.getRange(r, 13).getValue()),
    ['PENDING_TEACHER_REVIEW', 'COMPLIANT', 'ARCHIVED', 'ACTIVE']);
});

test('buildNextStepsText_: passing suggests Canvas and another check; revising points at the dashboard', () => {
  const { exported } = load();
  const pass = exported.buildNextStepsText_('APPROVED');
  assert.match(pass, /Turn it in on Canvas/);
  assert.match(pass, /Start Assignment → Website URL/);
  assert.match(pass, /Submit for Feedback again/);
  const revise = exported.buildNextStepsText_('REVISION_REQUIRED');
  assert.match(revise, /click Submit for Feedback/);
  for (const text of [pass, revise]) {
    assert.doesNotMatch(text, /Turn-In Form|AI Evaluation Panel|Run Assignment Check/);
  }
});

test('processCompletedEvaluation_: a block that already carries next steps gets no second copy', () => {
  const { exported, sandbox } = load();
  const doc = sandbox.DocumentApp.create('Student doc');
  // Paragraph by paragraph, as 02 stamps the doc and 37 appends the block.
  doc.getBody().appendParagraph('[No feedback yet. When you are ready, submit.]');
  doc.getBody().appendParagraph('── EVALUATION 2026-10-14 ──\n✏️  RESULT: REVISIONS REQUIRED\n' +
    exported.buildNextStepsText_('REVISION_REQUIRED') + '\n── END EVALUATION ──');
  exported.processCompletedEvaluation_(doc.getId(), 'VDOE-0');
  const text = sandbox.DocumentApp.openById(doc.getId()).getBody().getText();
  assert.equal(text.split('WHAT TO DO NEXT').length - 1, 1);
});
