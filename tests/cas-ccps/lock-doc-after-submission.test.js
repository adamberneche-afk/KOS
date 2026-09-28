'use strict';
// Student-data access policy, rule 2 (only the student edits, and only
// before submission) and rule 3 (feedback comes from the assigning
// teacher): cas-ccps/scripts/04_Form2_TurnInGate.js's _lockDocAfterSubmission_().

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

function fileWith(sandbox, perms) {
  const doc = sandbox.DocumentApp.create('Unit 1 — Alice');
  const file = sandbox.DriveApp.getFileById(doc.getId());
  (perms.editors || []).forEach((e) => file.addEditor(e));
  (perms.commenters || []).forEach((e) => file.addCommenter(e));
  return file;
}

test('_lockDocAfterSubmission_: every editor becomes a viewer, the assigning teacher a commenter', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('04_Form2_TurnInGate.js')], ['_lockDocAfterSubmission_']);
  const file = fileWith(sandbox, { editors: ['1234567@ccpsnet.net', 'Teacher@ccpsnet.net'] });

  const res = exported._lockDocAfterSubmission_(file.getId(), 'teacher@ccpsnet.net');

  assert.deepEqual(res.failed, []);
  assert.equal(file._access('1234567@ccpsnet.net'), 'viewer');
  assert.equal(file._access('teacher@ccpsnet.net'), 'commenter');
  assert.equal(file.getEditors().length, 0, 'no one edits a submitted doc');
});

test('_lockDocAfterSubmission_: an unopenable file is reported, never thrown', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('04_Form2_TurnInGate.js')], ['_lockDocAfterSubmission_']);
  const res = exported._lockDocAfterSubmission_('no-such-file', 'teacher@ccpsnet.net');
  assert.equal(res.failed.length, 1);
});

test('_lockSubmittedDoc_ (04_Form2_TurnInGate.js): a passing turn-in locks that row\'s doc for its assigning teacher', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('04_Form2_TurnInGate.js')],
    ['_lockSubmittedDoc_', 'getConfig_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const file = fileWith(sandbox, { editors: ['1234567@ccpsnet.net'] });
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('h'));
  const row = new Array(23).fill('');
  row[1] = '1234567@ccpsnet.net'; row[3] = file.getId(); row[8] = 'teacher@ccpsnet.net';
  row[12] = 'PENDING_TEACHER_REVIEW';
  ledger.appendRow(row);

  exported._lockSubmittedDoc_(exported.getConfig_(), { rowIndex: 2 });

  assert.equal(file._access('1234567@ccpsnet.net'), 'viewer');
  assert.equal(file._access('teacher@ccpsnet.net'), 'commenter');
});
