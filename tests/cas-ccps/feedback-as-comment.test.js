'use strict';
// FEEDBACK_AS_COMMENT (00_SharedConfig.js): Flow 2 feedback goes on the
// student's doc as a comment instead of into the doc, so the doc holds only
// the assignment and the student's work. Off by default. The harvest side
// (37) is covered in flow-input-builder.test.js; this file covers the flag,
// the doc intake builds (02), backprop's post-processing (03) and the
// Student Dashboard's wording (13).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

// The flag is read through getConfig_'s resolution, which needs a Ledger.
function setFlag(sandbox, value) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  if (value !== undefined) props.setProperty('FEEDBACK_AS_COMMENT', value);
}

test('feedbackAsCommentFor_: off by default, "all" for every course, or one course by code', () => {
  const cases = [
    [undefined, 'CAS-8175-L06', false],
    ['off', 'CAS-8175-L06', false],
    ['all', 'CAS-8175-L06', true],
    ['all', 'VDOE-ABC123-2026', true],
    ['8175', 'CAS-8175-L06', true],
    ['8175', 'CAS-8177-L06', false],
    // An older ConfigID carries no course, so only "all" reaches it.
    ['8175', 'VDOE-ABC123-2026', false],
  ];
  for (const [flag, configId, expected] of cases) {
    const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js')], ['feedbackAsCommentFor_']);
    setFlag(sandbox, flag);
    assert.equal(exported.feedbackAsCommentFor_(configId), expected, flag + ' / ' + configId);
  }
});

function stamp(flag, configId) {
  const { exported, sandbox } = loadGasFiles(
    [S('00_SharedConfig.js'), S('02_Form1_IntakeAndWorkspaceGenerator.js')], ['stampDocument_']);
  setFlag(sandbox, flag);
  const doc = sandbox.DocumentApp.create('Lesson 06 — student');
  exported.stampDocument_(doc.getId(), configId, 'A Student', 'B2', 'Sports Marketing', 'Teacher',
    '3', 'L06 SKILL DEVELOPMENT PLAN', 'Write your plan.', 'ledger-id', 'admin-id', 'https://example.test/exec');
  return sandbox.DocumentApp.openById(doc.getId()).getBody().getText();
}

test('stampDocument_: with the flag on, a new doc has no feedback zone but keeps its header and dashboard link', () => {
  const text = stamp('all', 'CAS-8175-L06');
  for (const gone of ['📊 FEEDBACK', '── FEEDBACK ──', '[No feedback yet.', '── END FEEDBACK ──']) {
    assert.ok(!text.includes(gone), gone + ' should be gone');
  }
  for (const kept of ['Student: A Student', 'Assignment: L06 SKILL DEVELOPMENT PLAN',
    'Your assignment dashboard: https://example.test/exec', '── YOUR RESPONSE BEGINS HERE ──',
    '[CONFIG_ID: CAS-8175-L06]']) {
    assert.ok(text.includes(kept), kept + ' should stay');
  }
});

test('stampDocument_: with the flag off, the feedback zone is built as before', () => {
  const text = stamp(undefined, 'CAS-8175-L06');
  const at = (s) => text.indexOf(s);
  assert.ok(at('── FEEDBACK ──') !== -1 && at('── FEEDBACK ──') < at('[No feedback yet.'));
  assert.ok(at('[No feedback yet.') < at('── END FEEDBACK ──'));
  assert.ok(at('── END FEEDBACK ──') < at('── YOUR RESPONSE BEGINS HERE ──'));
  assert.ok(text.includes('Your feedback will appear here.'), 'not "at the end of this document"');
});

test('processCompletedEvaluation_: with the flag on, nothing is added to the doc', () => {
  const { exported, sandbox } = loadGasFiles(
    [S('00_SharedConfig.js'), S('03_QueueBridge.js')], ['processCompletedEvaluation_']);
  setFlag(sandbox, '8175');
  const doc = sandbox.DocumentApp.create('Student doc');
  doc.getBody().setText('Assignment\n── YOUR RESPONSE BEGINS HERE ──\nMy plan.\n[CONFIG_ID: CAS-8175-L06]');
  const before = doc.getBody().getText();
  exported.processCompletedEvaluation_(doc.getId(), 'CAS-8175-L06');
  assert.equal(sandbox.DocumentApp.openById(doc.getId()).getBody().getText(), before);
});

test('resolveStudentStatus_: an evaluated assignment points to Comments only when feedback is a comment', () => {
  const { exported } = loadGasFiles(
    [S('00_SharedConfig.js'), S('13_StudentDashboard.js')], ['resolveStudentStatus_']);
  assert.equal(exported.resolveStudentStatus_('COMPLETE', undefined, true),
    'Evaluated — feedback ready: open your document and click Comments');
  assert.equal(exported.resolveStudentStatus_('COMPLETE', undefined, false),
    'Evaluated — feedback ready, check your document');
});
