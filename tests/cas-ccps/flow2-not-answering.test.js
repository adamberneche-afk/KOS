'use strict';
// Flow 2 not answering: one email to the admin (03, 2026-11-14). On 11-13
// Studio's Flow 2 stopped answering for a day and the only sign was a
// timeout email per submission, to teachers. Now: lane timeouts in a row
// with no Flow 2 answer in between (counted when backprop closes each
// ERROR_TIMEOUT row) email ADMIN_NOTIFY_EMAIL once at two; nothing more
// until the harvest (37) sees Flow 2 answer again, which clears it. One
// isolated timeout sends nothing. Counts and times only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const S = (f) => path.join(SCRIPTS, f);

function load(adminEmail = 'admin@school.test') {
  const env = loadGasFiles(
    ['00_SharedConfig.js', '00c_CentralLedgerShared.js', '00d_TeacherDashboardShared.js', '00e_StudentDashboardShared.js', '63_DocHeader.js', '03_QueueBridge.js', '04_Form2_TurnInGate.js',
      '15b_StudioFlowPrompts_Flow2_Revised.js', '15c_Flow2DirectEvaluationService.js', '32_CompetencyRubricImporter.js', '37_FlowInputBuilder.js', '43_DeployVersionMarker_CentralLedger.js',
      '68_LessonParts.js', '40_FlowPrompts.js', '54_StudentAssignments.js'].map(S),
    ['backPropagateCompletions', 'harvestFlowInputResults', 'flow2NoteTimeout_', 'flow2NoteAnswered_',
      'flow2AlertState_', 'FI', 'FI_HEADERS'],
  );
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  if (adminEmail) props.setProperty('ADMIN_NOTIFY_EMAIL', adminEmail);
  return Object.assign(env, { ss, props });
}

const adminMail = (env) => env.sandbox.MailApp.getSentMessages().filter((m) => /isn't answering/.test(m.subject));

// Staging rows the lane timed out, their queue rows still STAGED: backprop
// closes each once (and emails its teacher).
function timedOut(env, n) {
  const queue = env.ss.getSheetByName('ReviewQueue') || env.ss.insertSheet('ReviewQueue');
  if (!queue.getLastRow()) queue.appendRow(['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'StudentText', 'Status', 'ResultRef']);
  const staging = env.ss.getSheetByName('STAGING_PIPELINE') || env.ss.insertSheet('STAGING_PIPELINE');
  if (!staging.getLastRow()) staging.appendRow(['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  if (!env.ss.getSheetByName('Ledger')) env.ss.insertSheet('Ledger').appendRow(new Array(23).fill('header'));
  for (let i = 0; i < n; i++) {
    const fileId = env.sandbox.DocumentApp.create('doc').getId();
    queue.appendRow(['', 's@school.test', fileId, 'VDOE-' + i, '', 'STAGED', '']);
    staging.appendRow([new Date(), String(queue.getLastRow()), fileId, 'VDOE-' + i, 'teacher@school.test', 'ERROR_TIMEOUT']);
  }
  env.exported.backPropagateCompletions();
}

// One FlowInput row Studio answered, for the harvest.
function answered(env, configId = 'VDOE-ANS') {
  const fi = env.ss.getSheetByName('FlowInput') || env.ss.insertSheet('FlowInput');
  if (!fi.getLastRow()) fi.appendRow(env.exported.FI_HEADERS);
  const row = new Array(env.exported.FI_HEADERS.length).fill('');
  row[env.exported.FI.STUDENT_FILE_ID] = 'file-ans';
  row[env.exported.FI.CONFIG_ID] = configId;
  row[env.exported.FI.READY_STATUS] = 'EVALUATED';
  row[env.exported.FI.GEMINI_FULL_OUTPUT] = 'Feedback.\n[SYSTEM: APPROVED]';
  fi.appendRow(row);
  env.exported.harvestFlowInputResults();
}

test('two timeouts in a row email the admin once, counts only, with the [CAS] prefix', () => {
  const env = load();
  timedOut(env, 1);
  assert.equal(adminMail(env).length, 0, 'one isolated timeout sends nothing');
  timedOut(env, 1);
  const mail = adminMail(env);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, 'admin@school.test');
  assert.match(mail[0].subject, /^\[CAS\] Flow 2 isn't answering — Studio may be down$/);
  assert.match(mail[0].body, /2 submission checks in a row timed out since \d{4}-\d\d-\d\d \d\d:\d\d/);
  assert.match(mail[0].body, /Last time Flow 2 answered: none recorded/);
  assert.match(mail[0].body, /Reset Stuck Pipeline Row/);
  assert.match(mail[0].body, /restarted by itself, up to\s+twice/);
  assert.doesNotMatch(mail[0].body, /VDOE-|teacher@|s@school/, 'no IDs or addresses');

  timedOut(env, 3);
  assert.equal(adminMail(env).length, 1, 'not again while Flow 2 stays silent');
  assert.equal(env.exported.flow2AlertState_().streak, 5);
});

test('a Flow 2 answer clears the streak and the latch; the next two timeouts alert again', () => {
  const env = load();
  timedOut(env, 2);
  assert.equal(adminMail(env).length, 1);
  answered(env);
  const st = env.exported.flow2AlertState_();
  assert.equal(st.streak, 0);
  assert.equal(st.alertedAt, 0);
  assert.ok(Date.now() - st.lastAnswerAt < 60000);

  timedOut(env, 1);
  assert.equal(adminMail(env).length, 1, 'one timeout after an answer is not two in a row');
  timedOut(env, 1);
  assert.equal(adminMail(env).length, 2);
  assert.match(adminMail(env)[1].body, /Last time Flow 2 answered: \d{4}-\d\d-\d\d \d\d:\d\d/);
});

test('timeouts with an answer between them never alert', () => {
  const env = load();
  timedOut(env, 1);
  answered(env);
  timedOut(env, 1);
  answered(env);
  timedOut(env, 1);
  assert.equal(adminMail(env).length, 0);
});

test('a canary or fixture answer is not Flow 2 answering', () => {
  const env = load();
  timedOut(env, 1);
  answered(env, 'VDOE-CANARY-123');
  timedOut(env, 1);
  assert.equal(adminMail(env).length, 1);
});

test('no ADMIN_NOTIFY_EMAIL: no email and no latch, the streak still counted', () => {
  const env = load('');
  timedOut(env, 2);
  assert.equal(adminMail(env).length, 0);
  const st = env.exported.flow2AlertState_();
  assert.equal(st.streak, 2);
  assert.equal(st.alertedAt, 0);
});

test('a timeout already closed is not counted again', () => {
  const env = load();
  timedOut(env, 1);
  env.exported.backPropagateCompletions();
  env.exported.backPropagateCompletions();
  assert.equal(env.exported.flow2AlertState_().streak, 1);
  assert.equal(adminMail(env).length, 0);
});
