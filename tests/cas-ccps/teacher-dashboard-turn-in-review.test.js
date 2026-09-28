'use strict';
// Regression tests for cas-ccps/scripts/07_TeacherDashboard.js's turn-in
// score confirm/override. The Ledger is shared across every teacher, and
// _recordTurnInDecision_() used to match on ConfigID alone, so any teacher's
// dashboard could finalize another teacher's student's score. It now checks
// the row's TEACHER_EMAIL, as the SCR review already did.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [S('00_SharedConfig.js'), S('07_TeacherDashboard.js')];
const TEACHER = 'teacher@example.com'; // the sandbox's default Session user
const OTHER_TEACHER = 'other.teacher@example.com';

function setUp(rowTeacher) {
  const { exported, sandbox } = loadGasFiles(FILES, ['teacherConfirmTurnInScore', 'teacherOverrideTurnInScore']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill(''));
  const row = new Array(23).fill('');
  row[1] = 'student@ccpsnet.net';
  row[2] = 'CFG-1';
  row[8] = rowTeacher;
  row[12] = 'PENDING_TEACHER_REVIEW';
  row[19] = 3;
  ledger.appendRow(row);
  return { exported, ledger };
}

test('teacherConfirmTurnInScore: a teacher can confirm their own student\'s score', () => {
  const { exported, ledger } = setUp(TEACHER);
  const r = exported.teacherConfirmTurnInScore('CFG-1');
  assert.equal(r.success, true, JSON.stringify(r));
  assert.notEqual(ledger.rows[1][12], 'PENDING_TEACHER_REVIEW');
});

test('teacherConfirmTurnInScore / teacherOverrideTurnInScore: another teacher\'s student is refused', () => {
  const { exported, ledger } = setUp(OTHER_TEACHER);
  assert.equal(exported.teacherConfirmTurnInScore('CFG-1').success, false);
  assert.equal(exported.teacherOverrideTurnInScore('CFG-1', 5).success, false);
  assert.equal(ledger.rows[1][12], 'PENDING_TEACHER_REVIEW', 'nothing is written');
  assert.equal(ledger.rows[1][20], '');
});
