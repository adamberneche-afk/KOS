'use strict';
// 30b_SCRRetryRemediation.js's confirmRetryImprovement_() used to trust the
// teacherEmail it was given, like recordDecision_() in 30. It now applies
// the same rule 3 check (_scrDecisionRefusal_) before reading any evidence.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');

function load(signedInAs) {
  const loaded = loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '30_SCRSuggestionEngine.js'),
      path.join(SCRIPTS, '30b_SCRRetryRemediation.js')],
    ['confirmRetryImprovement_'],
    {
      Session: {
        getActiveUser() { return { getEmail() { return signedInAs; } }; },
        getEffectiveUser() { return { getEmail() { return 'admin@ccpsnet.net'; } }; },
        getScriptTimeZone() { return 'America/New_York'; },
      },
    });
  const { sandbox } = loaded;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CURRENT_TERM', '2025-26');
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('header'));
  const row = new Array(23).fill('');
  row[0] = '2025-09-15'; row[1] = 'student@ccpsnet.net'; row[2] = 'CFG-T';
  row[8] = 'teacher@ccpsnet.net'; row[18] = '2025-26';
  ledger.appendRow(row);
  return loaded;
}

test('confirmRetryImprovement_: refuses a teacher name that is not the signed-in user', () => {
  const { exported } = load('someone@ccpsnet.net');
  const res = exported.confirmRetryImprovement_('student@ccpsnet.net', 'CAS-M5-1', 'teacher@ccpsnet.net');
  assert.equal(res.success, false);
  assert.match(res.error, /signed-in teacher/);
});

test('confirmRetryImprovement_: refuses a signed-in teacher who does not have the student', () => {
  const { exported } = load('someone@ccpsnet.net');
  const res = exported.confirmRetryImprovement_('student@ccpsnet.net', 'CAS-M5-1', 'someone@ccpsnet.net');
  assert.equal(res.success, false);
  assert.match(res.error, /whose assignments produced/);
});

test('confirmRetryImprovement_: the assigning teacher gets past the check to the retry itself', () => {
  const { exported } = load('teacher@ccpsnet.net');
  const res = exported.confirmRetryImprovement_('student@ccpsnet.net', 'CAS-M5-1', 'teacher@ccpsnet.net');
  // No retry data is set up, so it stops at the retry step, not the ownership check.
  assert.doesNotMatch(String(res.error), /signed-in teacher|whose assignments produced/);
});
