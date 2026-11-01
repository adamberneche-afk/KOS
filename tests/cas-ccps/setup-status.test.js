'use strict';
// 35's showSetupStatus(): one read-only list of what is on in the Central
// Ledger: each expected trigger, the Ledger cycle's jobs, the switches and
// the weekly runs' tabs. Built 2026-10-27 after 29's and 30's weekly runs
// were found never to have been installed.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

function load() {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('35_FlowPreflightAndCanary.js'), S('58_LessonRollout.js'), S('23_StudentProfileManager.js'), S('64_LedgerCycle.js')],
    ['showSetupStatus']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  return Object.assign(env, { ss, props });
}

test('a trigger that is missing says OFF and names its installer; one installed says on', () => {
  const env = load();
  ['updateAllStudentProfiles', 'runWarmUpEvaluation', 'buildWarmUpQueues', 'runLessonRollout']
    .forEach((fn) => env.sandbox.ScriptApp.newTrigger(fn).timeBased().create());
  const r = env.exported.showSetupStatus();
  const line = (re) => r.lines.find((l) => re.test(l));
  assert.match(line(/runLessonRollout/), /^\s+on /);
  assert.match(line(/runWeeklyStudentAggregation_/), /OFF .*run setupStudentContextDocs\(\)/);
  assert.match(line(/Ledger cycle/), /OFF .*run installLedgerCycle\(\)/);
  assert.ok(r.missing.includes('setupCompetencySuggestions()'));
  assert.ok(!r.missing.includes('installWarmUpTriggers()'));
  assert.match(r.lines[r.lines.length - 1], /^TO TURN ON: /);
});

test('a job run by the Ledger cycle reads "in the cycle"; an unknown trigger is listed', () => {
  const env = load();
  env.sandbox.ScriptApp.newTrigger('runLedgerCycle').timeBased().create();
  env.sandbox.ScriptApp.newTrigger('someOldHandler').timeBased().create();
  env.props.setProperty('LEDGER_CYCLE_JOBS', JSON.stringify(['bridgeQueue']));
  const r = env.exported.showSetupStatus();
  assert.ok(r.lines.some((l) => /on\s+bridgeQueue: in the cycle/.test(l)));
  assert.ok(r.lines.some((l) => /Other triggers: someOldHandler/.test(l)));
});

// 10-29 handoff: a pending catch-up showed under "Other triggers".
test('the rollout catch-up is named: pending with today\'s count, or none, and never "missing"', () => {
  const env = load();
  const r0 = env.exported.showSetupStatus();
  assert.ok(r0.lines.some((l) => /none\s+Lessons: rollout catch-up \(runLessonRolloutCatchUp\), one-off, 0 of at most 12 today; scheduled only/.test(l)));
  assert.ok(!r0.missing.some((m) => /CatchUp/.test(m)));
  env.sandbox.ScriptApp.newTrigger('runLessonRolloutCatchUp').timeBased().create();
  const d = new Date();
  const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  env.props.setProperty('ROLLOUT_CATCHUP', JSON.stringify({ day: ymd, count: 3 }));
  const r = env.exported.showSetupStatus();
  assert.ok(r.lines.some((l) => /pending\s+Lessons: rollout catch-up .*3 of at most 12 today$/.test(l)));
  assert.ok(!r.lines.some((l) => /Other triggers: .*runLessonRolloutCatchUp/.test(l)));
});

test('switches show their value or what unset means; secrets only say set or not set', () => {
  const env = load();
  env.props.setProperty('M2_ENABLED', 'true');
  env.props.setProperty('DIRECT_GEMINI_API_KEY', 'sk-secret-value');
  env.props.setProperty('CAS_CHAT_WEBHOOK_URL', 'https://chat.example/hook');
  const r = env.exported.showSetupStatus();
  const text = r.lines.join('\n');
  assert.match(text, /M2_ENABLED = true/);
  assert.match(text, /CAS_WATCHDOG_DRY_RUN = \(unset\) → dry run/);
  assert.match(text, /DIRECT_GEMINI_API_KEY: set/);
  assert.match(text, /GEMINI_API_KEY: not set/);
  assert.doesNotMatch(text, /sk-secret-value|chat\.example/);
  assert.match(text, /StudentDocRegistry: MISSING/);
});
