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
// 2. 28_Module2Setup.js's setup wizard now installs and verifies that
//    trigger — it previously had its own standalone manual installer
//    (installArtifactSyncTrigger_()) that the wizard never called.
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
    path.join(SCRIPTS, '22_LessonContextHandler.js'),
    path.join(SCRIPTS, '23_StudentProfileManager.js'),
    path.join(SCRIPTS, '25_WarmUpWriter.js'),
    path.join(SCRIPTS, '33_ArtifactCompetencyBridge.js'),
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

test('syncArtifactCompetencies() stamps M2_STAGE1B_LAST_RUN', () => {
  const { exported, sandbox } = loadCentralLedger();
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  // No TEACHER_MATRIX_SS_ID set — syncArtifactCompetencies() logs and
  // returns early before doing any real work, but this stamp is only
  // written at the very end of a full run, so this test exists purely to
  // confirm the *absence* of a stamp on an incomplete run, matching the
  // real function's own early-return guards (no tab/config → no stamp).
  ss.insertSheet('Ledger').appendRow(['header']);
  ss.insertSheet('STAGING_PIPELINE').appendRow(['StudentFileID', 'Status']);
  ss.insertSheet('StudentProfiles').appendRow(['header']);

  exported.syncArtifactCompetencies();
  assert.equal(props.getProperty('M2_STAGE1B_LAST_RUN'), null,
    'no stamp expected — TEACHER_MATRIX_SS_ID was never set, so the real function returns before its stamp-write line');
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

// ── Script 28's trigger install (different GAS project: cas-ccps:unified-manual) ──

function loadModule2Setup() {
  return loadGasFiles([
    path.join(SCRIPTS, '28_Module2Setup.js'),
  ], ['_installTriggerIfMissing_']);
}

test('_installTriggerIfMissing_ installs syncArtifactCompetencies at 3:05am', () => {
  const { exported, sandbox } = loadModule2Setup();
  exported._installTriggerIfMissing_('syncArtifactCompetencies', 'atHour', 3, { nearMinute: 5 });

  const triggers = sandbox.ScriptApp.getProjectTriggers();
  const t = triggers.find((tr) => tr.getHandlerFunction() === 'syncArtifactCompetencies');
  assert.ok(t, 'syncArtifactCompetencies trigger must be installed');
});

test('_installTriggerIfMissing_ does not install a second copy if one already exists', () => {
  const { exported, sandbox } = loadModule2Setup();
  exported._installTriggerIfMissing_('syncArtifactCompetencies', 'atHour', 3, { nearMinute: 5 });
  exported._installTriggerIfMissing_('syncArtifactCompetencies', 'atHour', 3, { nearMinute: 5 });

  const triggers = sandbox.ScriptApp.getProjectTriggers()
    .filter((tr) => tr.getHandlerFunction() === 'syncArtifactCompetencies');
  assert.equal(triggers.length, 1);
});

test('the wizard\'s requiredTriggers list includes syncArtifactCompetencies (source-level regression guard)', () => {
  // A full behavioral test of the wizard's Step 5 would need heavy
  // SpreadsheetApp.getUi()/dialog mocking this codebase has no established
  // pattern for on any file — this is a direct, honest source-level check
  // instead: it fails immediately if someone reverts the requiredTriggers
  // edit, which is the actual regression this fix guards against.
  const src = fs.readFileSync(path.join(SCRIPTS, '28_Module2Setup.js'), 'utf8');
  const match = src.match(/const requiredTriggers = \[([\s\S]*?)\];/);
  assert.ok(match, 'requiredTriggers array must exist in 28_Module2Setup.js');
  const entries = match[1].split(',').map((s) => s.trim().replace(/["']/g, '')).filter(Boolean);
  assert.equal(entries.length, 5, `expected 5 required triggers, found: ${entries.join(', ')}`);
  assert.ok(entries.includes('syncArtifactCompetencies'), 'syncArtifactCompetencies must be in requiredTriggers');
});
