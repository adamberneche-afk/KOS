'use strict';
// Regression tests for the Script 33 (syncArtifactCompetencies) fixes a
// third-party review's finding led to:
//
// 1. runWarmUpEvaluation() (25_WarmUpWriter.js) now checks the
//    M2_STAGE1B_LAST_RUN cron-health stamp syncArtifactCompetencies()
//    (33_ArtifactCompetencyBridge.js) already wrote on every run — nothing
//    ever checked it before, so a silently-broken 3:05am trigger would
//    have left every student profile quietly reverted to class-level-only
//    coverage with no signal anywhere.
// 2. 28_Module2Setup.js's setup wizard installed that trigger, but in its
//    own project (cas-ccps:unified-manual), where syncArtifactCompetencies
//    doesn't exist. Since 2026-10-20 it installs no trigger; it names the
//    Central Ledger installers, and removeMisplacedTriggers() clears the
//    triggers it made before.
//
// Loaded together with 22_LessonContextHandler.js/23_StudentProfileManager.js
// for the same shared-project reasons as warmup-extra-credit-recheck.test.js
// (25_WarmUpWriter.js and 33_ArtifactCompetencyBridge.js are both bound to
// cas-ccps:central-ledger — see tools/gas-lint/project-map.json). Script 28
// is bound to a different project (cas-ccps:unified-manual) and is tested
// separately below.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');

function loadCentralLedger() {
  return loadGasFiles([
    path.join(SCRIPTS, '00_SharedConfig.js'),
    path.join(SCRIPTS, '04_Form2_TurnInGate.js'),
    path.join(SCRIPTS, '22_LessonContextHandler.js'),
    path.join(SCRIPTS, '23_StudentProfileManager.js'),
    path.join(SCRIPTS, '25_WarmUpWriter.js'),
    path.join(SCRIPTS, '33_ArtifactCompetencyBridge.js'),
    path.join(SCRIPTS, '54_StudentAssignments.js'),
  ], ['runWarmUpEvaluation', 'syncArtifactCompetencies']);
}

function setUpFixture(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  props.setProperty('ADMIN_NOTIFY_EMAIL', 'admin@ccpsnet.net');

  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  const wr = ss.insertSheet('WarmUpRegistry');
  wr.appendRow([
    'warmup_id', 'queue_id', 'lesson_id', 'lesson_date', 'student_email',
    'student_name', 'teacher_email', 'doc_id', 'doc_url', 'generated_at',
    'total_score', 'extra_credit', 'term', 'extra_credit_checked',
  ]);

  return { ss };
}

test('syncArtifactCompetencies() stamps M2_STAGE1B_LAST_RUN with a NO_* status when it stops early', () => {
  const { exported, sandbox } = loadCentralLedger();
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  // No TEACHER_MATRIX_SS_ID set — syncArtifactCompetencies() stops before
  // any real work. Since 2026-10-19 a stop still stamps the stage, with a
  // NO_* status naming why, so the overnight check (34c) reports the reason
  // instead of "no run recorded".
  ss.insertSheet('Ledger').appendRow(['header']);
  ss.insertSheet('STAGING_PIPELINE').appendRow(['StudentFileID', 'Status']);
  ss.insertSheet('StudentProfiles').appendRow(['header']);

  exported.syncArtifactCompetencies();
  assert.ok(props.getProperty('M2_STAGE1B_LAST_RUN'), 'a stop is stamped');
  assert.equal(props.getProperty('M2_STAGE1B_STATUS'), 'NO_MATRIX_ID');
});

test('runWarmUpEvaluation() alerts when M2_STAGE1B_LAST_RUN is stale', () => {
  const { exported, sandbox } = loadCentralLedger();
  const fx = setUpFixture(sandbox);
  const props = sandbox.PropertiesService.getScriptProperties();

  const staleTime = new Date(Date.now() - 60 * 60 * 1000); // 60 min ago (> 15 min threshold)
  props.setProperty('M2_STAGE1B_LAST_RUN', staleTime.toISOString());

  exported.runWarmUpEvaluation();

  const sent = sandbox.MailApp.getSentMessages();
  const stage1bAlert = sent.find((m) => /Script 33/.test(m.subject));
  assert.ok(stage1bAlert, 'a stale M2_STAGE1B_LAST_RUN must trigger a cron-health alert mentioning Script 33');
  assert.equal(stage1bAlert.to, 'admin@ccpsnet.net');
});

test('runWarmUpEvaluation() does not alert when M2_STAGE1B_LAST_RUN is fresh', () => {
  const { exported, sandbox } = loadCentralLedger();
  const fx = setUpFixture(sandbox);
  const props = sandbox.PropertiesService.getScriptProperties();

  props.setProperty('M2_STAGE1B_LAST_RUN', new Date().toISOString());

  exported.runWarmUpEvaluation();

  const sent = sandbox.MailApp.getSentMessages();
  assert.ok(!sent.some((m) => /Script 33/.test(m.subject)), 'a fresh stamp must not trigger an alert');
});

// 2026-10-20: the sync had never credited a student. A Ledger row's ConfigID
// is the student's workspace ID ("VDOE-..."), which it looked up in
// TeacherMatrix (keyed by assignment ID) without going through
// StudentAssignments; and it read column 15 as "competency_ids", which on
// the live matrix is Milestone1CompetencyId.
const TM_HEADERS = ['ConfigID', 'UnitName', 'Tier', 'Persona', 'Milestone1', 'Milestone2',
  'Milestone3', 'Milestone4', 'DefinitionOfDone', 'InstructorEmail', 'Created', 'Status',
  'PromptTemplateID', 'Subject', 'CourseName', 'Milestone1CompetencyId', 'Milestone2CompetencyId',
  'Milestone3CompetencyId', 'Milestone4CompetencyId', 'LessonUnitId'];

function syncFixture(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const matrix = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.SpreadsheetApp._registry.set(matrix.getId(), matrix);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  props.setProperty('TEACHER_MATRIX_SS_ID', matrix.getId());

  const tm = matrix.insertSheet('TeacherMatrix');
  tm.appendRow(TM_HEADERS);
  const tmRow = (id, comps) => {
    const r = new Array(TM_HEADERS.length).fill('');
    r[0] = id; r[11] = 'LIVE';
    comps.forEach((c, i) => { r[15 + i] = c; });
    tm.appendRow(r);
  };
  tmRow('CAS-8175-L06', ['8175-20', '8175-112', '8175-21', '']);
  tmRow('CAS-S1-U1-8177', ['8177-39, 8177-40', '8177-41', '', '']);

  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(19).fill('header'));
  const ledgerRow = (account, wsId, fileId) => {
    const r = new Array(19).fill('');
    r[1] = account; r[2] = wsId; r[3] = fileId; r[8] = 'teacher@ccpsnet.net'; r[12] = 'ACTIVE';
    ledger.appendRow(r);
  };
  ledgerRow('a@student.test', 'VDOE-AAAAAA-2026', 'FILE-A');
  ledgerRow('b@student.test', 'VDOE-BBBBBB-2026', 'FILE-B');
  ledgerRow('c@student.test', 'VDOE-CCCCCC-2026', 'FILE-C');

  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['StudentConfigID', 'GoogleID', 'AssignmentConfigID']);
  sa.appendRow(['VDOE-AAAAAA-2026', 'a@student.test', 'CAS-8175-L06']);
  sa.appendRow(['VDOE-BBBBBB-2026', 'b@student.test', 'CAS-S1-U1-8177']);
  sa.appendRow(['VDOE-CCCCCC-2026', 'c@student.test', 'CAS-8175-L06']);

  const staging = ss.insertSheet('STAGING_PIPELINE');
  staging.appendRow(['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  staging.appendRow([new Date(), 2, 'FILE-A', 'VDOE-AAAAAA-2026', 'teacher@ccpsnet.net', 'COMPLETE']);
  staging.appendRow([new Date(), 3, 'FILE-B', 'VDOE-BBBBBB-2026', 'teacher@ccpsnet.net', 'COMPLETE']);
  staging.appendRow([new Date(), 4, 'FILE-C', 'VDOE-CCCCCC-2026', 'teacher@ccpsnet.net', 'IN_PROCESS']);

  const sp = ss.insertSheet('StudentProfiles');
  sp.appendRow(['student_email', 'x', 'y', 'teacher_email', 'z', 'competencies_addressed']);
  ['a@student.test', 'b@student.test', 'c@student.test'].forEach((e) =>
    sp.appendRow([e, '', '', 'teacher@ccpsnet.net', '', JSON.stringify(['8175-1'])]));
  return { ss, sp, props };
}

test('syncArtifactCompetencies credits a COMPLETE submission through its assignment, with every milestone\'s competencies', () => {
  const { exported, sandbox } = loadCentralLedger();
  const fx = syncFixture(sandbox);
  exported.syncArtifactCompetencies();

  const covered = (row) => JSON.parse(fx.sp.getRange(row, 6).getValue());
  assert.deepEqual(covered(2), ['8175-1', '8175-112', '8175-20', '8175-21']);
  assert.deepEqual(covered(3), ['8175-1', '8177-39', '8177-40', '8177-41'],
    'a comma-separated milestone cell gives each ID');
  assert.deepEqual(covered(4), ['8175-1'], 'a submission not COMPLETE adds nothing');
  assert.equal(fx.props.getProperty('M2_STAGE1B_STATUS'), 'OK_2');
});

test('syncArtifactCompetencies still reads an older matrix\'s competency_ids column', () => {
  const { exported, sandbox } = loadCentralLedger();
  const fx = syncFixture(sandbox);
  const matrix = sandbox.SpreadsheetApp.openById(fx.props.getProperty('TEACHER_MATRIX_SS_ID'));
  const tm = matrix.getSheetByName('TeacherMatrix');
  const old = TM_HEADERS.slice(0, 15).concat(['competency_ids']);
  tm.getRange(1, 1, 1, TM_HEADERS.length).setValues([old.concat(new Array(TM_HEADERS.length - old.length).fill(''))]);
  tm.getRange(2, 16, 2, 4).setValues([['8175-20,8175-21', '', '', ''], ['', '', '', '']]);

  exported.syncArtifactCompetencies();
  assert.deepEqual(JSON.parse(fx.sp.getRange(2, 6).getValue()), ['8175-1', '8175-20', '8175-21']);
  assert.equal(fx.props.getProperty('M2_STAGE1B_STATUS'), 'OK_1');
});

// ── Script 28: no triggers in its own project (cas-ccps:unified-manual) ──

function loadModule2Setup() {
  return loadGasFiles([
    path.join(SCRIPTS, '28_Module2Setup.js'),
  ], ['previewMisplacedTriggers', 'removeMisplacedTriggers']);
}

test('the wizard installs no trigger in its own project and names the Central Ledger installers', () => {
  const src = fs.readFileSync(path.join(SCRIPTS, '28_Module2Setup.js'), 'utf8');
  assert.doesNotMatch(src, /newTrigger\(/, 'a trigger made in the Unified Manual project cannot run a Ledger function');
  ['installAlignmentBackfillTrigger()', 'installWarmUpTriggers()', 'installArtifactSyncTrigger()',
    'installLedgerCycle()'].forEach((fn) => assert.ok(src.includes(fn), fn + ' must be named'));
});

test('removeMisplacedTriggers removes only the Ledger triggers this project can\'t run; a preview removes none', () => {
  const { exported, sandbox } = loadModule2Setup();
  ['syncArtifactCompetencies', 'registerDeliveredWarmUps', 'installDeployVersionReport']
    .forEach((fn) => sandbox.ScriptApp.newTrigger(fn).timeBased().everyMinutes(5).create());
  const handlers = () => sandbox.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());

  const preview = exported.previewMisplacedTriggers();
  assert.deepEqual(preview.found, ['syncArtifactCompetencies', 'registerDeliveredWarmUps']);
  assert.equal(handlers().length, 3, 'a preview changes nothing');

  assert.equal(exported.removeMisplacedTriggers().removed, 2);
  assert.deepEqual(handlers(), ['installDeployVersionReport'], 'a trigger not on the list is kept');
  assert.equal(exported.removeMisplacedTriggers().removed, 0, 'a second run removes nothing');
});
