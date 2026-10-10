'use strict';
// Student-data access policy, rule 2 (only the student edits, and only
// before submission) and rule 3 (feedback comes from the assigning
// teacher): cas-ccps/scripts/04_Form2_TurnInGate.js's _lockDocAfterSubmission_(),
// and the retired Turn-In Form's dispatcher path (P0-04).

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

// P0-04: the Turn-In Form is retired. _lockSubmittedDoc_() and the handler
// that called it are gone from 04; the helper above stays for 25's warm-ups.
// A Form 2 submission reaching the dispatcher must change nothing.
test('dispatchFormSubmit: a Turn-In Form submission is ignored by the only handler left', () => {
  // The whole central-ledger project, as GAS loads it.
  const files = require('../../tools/gas-lint/project-map.json')['cas-ccps:central-ledger'].files
    .map((f) => path.join(__dirname, '..', '..', f));
  const { exported, sandbox } = loadGasFiles(files, ['dispatchFormSubmit']);
  assert.equal(typeof sandbox.onTurnInSubmit, 'undefined', 'the turn-in handler is gone');
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(['h']);
  const logs = [];
  sandbox.Logger.log = (m) => logs.push(String(m));
  const fileId = 'abcdefghijklmnopqrstuvwxyz0123';
  exported.dispatchFormSubmit({ namedValues: {
    'Your Google Account': ['1234567@ccpsnet.net'],
    'Assignment Document Link': ['https://docs.google.com/document/d/' + fileId + '/edit'],
  } });
  assert.equal(ledger.getLastRow(), 1, 'nothing is written to the Ledger');
  assert.ok(!logs.some((l) => /handler error/.test(l)), logs.join('\n'));
});

test('the setup wizard no longer creates or advertises a Turn-In Form', () => {
  const src = require('fs').readFileSync(S('16_UnifiedManualSetup.js'), 'utf8');
  assert.doesNotMatch(src, /Assignment Turn-In"/, 'no form is created');
  assert.doesNotMatch(src, /TURNIN_FORM_URL\s*:|turninFormUrl\s*:|Turn-In Form",|Turn-In Form:\\n/,
    'no property, summary link or alert line points at one');
});
