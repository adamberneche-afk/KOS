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

// ── The setup checklist (packaging step 2, 2026-11-08) ──────────────────────
// showSetupStatus() ends with one OK/MISSING line per thing the setup guide's
// steps leave in the Central Ledger, each with the guide's step number.

const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const GUIDE = fs.readFileSync(path.join(ROOT, 'cas-ccps', 'docs', 'SETUP_GUIDE.md'), 'utf8');

const checklistLines = (r) => {
  const i = r.lines.findIndex((l) => /^SETUP CHECKLIST/.test(l));
  return r.lines.slice(i + 1, r.lines.length - 1);
};

function addTab(env, name, headers, rows) {
  const sh = env.ss.insertSheet(name);
  sh.appendRow(headers);
  (rows || []).forEach((r) => sh.appendRow(r));
  return sh;
}

test('a fresh Ledger: every checklist line is MISSING with its step and fix, and TO TURN ON stays last', () => {
  const env = load();
  const r = env.exported.showSetupStatus();
  const lines = checklistLines(r);
  assert.ok(lines.length > 20);
  assert.ok(lines.some((l) => /^\s+MISSING \[2\] Tab Ledger: run the Unified Manual's setup wizard/.test(l)));
  assert.ok(lines.some((l) => /^\s+MISSING \[6\] M2_ENABLED = true here: /.test(l)));
  assert.ok(lines.some((l) => /^\s+MISSING \[7\] Job bridgeQueue: add a time trigger .*Triggers panel/.test(l)));
  assert.ok(lines.some((l) => /^\s+MISSING \[8\] Flow 2 has answered \(0 rows\)/.test(l)));
  assert.ok(lines.some((l) => /^\s+MISSING \[10\] Ledger has a student's row/.test(l)));
  // The Ledger ID resolves (the test sets it), so that one line is OK.
  assert.ok(lines.some((l) => /^\s+OK\s+\[4\] CENTRAL_LEDGER_SS_ID resolves/.test(l)));
  assert.ok(lines.some((l) => /Not checked from this project: \[1\]/.test(l)));
  assert.match(r.lines[r.lines.length - 1], /^TO TURN ON: /);
  assert.ok(r.checklist.every((c) => Number.isInteger(c.step) && c.step >= 1 && c.step <= 10));
  // Flow 6's lines appear only when turn-in codes are on.
  assert.ok(!lines.some((l) => /Flow 6/.test(l)));
});

test('a set-up Ledger: every checklist line is OK, and no value of an ID, address or URL is printed', () => {
  const env = load();
  const sb = env.sandbox;
  const S = env.props;
  S.setProperty('TEACHER_EMAIL', 'teacher@example.invalid');
  S.setProperty('TEACHER_NAME', 'Test Teacher');
  S.setProperty('TEACHER_DASHBOARD_URL', 'https://example.invalid/td/exec');
  S.setProperty('STUDENT_DASHBOARD_URL', 'https://example.invalid/sd/exec');
  S.setProperty('ADMIN_ROOT_FOLDER_ID', 'folder-id-value');
  S.setProperty('ADMIN_NOTIFY_EMAIL', 'admin@example.invalid');
  S.setProperty('MARKING_PERIOD_ENDS', '2627_MP1=2026-10-30');
  S.setProperty('M2_ENABLED', 'true');
  S.setProperty('ROLLOUT_AUTO_APPLY', 'all');
  S.setProperty('TURN_IN_CODE_COURSES', 'all');
  ['Ledger', 'ReviewQueue', 'STAGING_PIPELINE', 'RubricQueue', 'MatrixRegistry', '_CONFIG', 'LessonContext',
    'CompetencyRegistry', 'AlignmentLog', 'StudentProfiles', 'WarmUpQueue', 'ClassSchedule', 'PacingGuide',
    'CompetencyRubrics', 'FlowPrompts', 'FlowBuildSpec', 'LessonSchedule', 'CanvasSectionMap', 'TurnInCheckReturn']
    .forEach((t) => addTab(env, t, ['h1', 'h2'], [['a', 'b']]));
  addTab(env, 'FlowInput', ['StagingRowRef', 'ReadyStatus', 'GeminiFullOutput'],
    [['FIXTURE', 'EVALUATED', 'ok'], ['STAGING!5', 'EVALUATED', 'feedback']]);
  addTab(env, 'WarmUpFlowReturn', ['Timestamp', 'Flow', 'QueueID'], [['t', 3, 'q1'], ['t', 4, 'q2']]);
  addTab(env, 'Preflight', ['Check', 'Status', 'Detail'], [['Last run', 'now', ''], ['Tab: Ledger', 'OK', '']]);
  ['runLedgerCycle', 'runLessonRollout', 'updateAllStudentProfiles', 'runWarmUpEvaluation', 'buildWarmUpQueues',
    'buildUpcomingLessons', 'runWeeklyStudentAggregation_', 'runWeeklySCRSuggestionUpdate_', 'syncArtifactCompetencies',
    'reportDeployVersion', 'autoHealthAlert']
    .forEach((fn) => sb.ScriptApp.newTrigger(fn).timeBased().create());
  S.setProperty('LEDGER_CYCLE_JOBS', JSON.stringify(['bridgeQueue', 'runStagingTurnstile', 'backPropagateCompletions',
    'buildFlowInputRows', 'harvestFlowInputResults', 'buildWarmUpFlowInputs', 'harvestWarmUpFlowReturns',
    'registerDeliveredWarmUps', 'runQueueWatchdog', 'runTurnInCheckFlow']));
  const r = env.exported.showSetupStatus();
  const missingLines = checklistLines(r).filter((l) => /MISSING/.test(l));
  assert.deepEqual(missingLines, []);
  const text = r.lines.join('\n');
  assert.match(text, /OK\s+\[8\] Flow 2 has answered \(2 rows\)/);
  assert.match(text, /OK\s+\[10\] A submission has had Flow 2 feedback \(1\)/);
  assert.match(text, /OK\s+\[8\] Flow 6 returns in TurnInCheckReturn \(1\)/);
  assert.doesNotMatch(text, /example\.invalid|folder-id-value/);
  assert.match(r.lines[r.lines.length - 1], /^Every expected trigger is installed\.$/);
});

test('a Preflight with a FAIL line, or a tab with no rows, is MISSING', () => {
  const env = load();
  addTab(env, 'Preflight', ['Check', 'Status', 'Detail'], [['Last run', 'now', ''], ['Tab: Ledger', 'FAIL', 'x'], ['Tab: X', 'OK', '']]);
  addTab(env, 'LessonSchedule', ['lesson', 'start_date'], []);
  const lines = checklistLines(env.exported.showSetupStatus());
  assert.ok(lines.some((l) => /MISSING \[7\] Preflight passed: 1 FAIL line/.test(l)));
  assert.ok(lines.some((l) => /MISSING \[9\] Tab LessonSchedule has rows: run seedLessonSchedule\(\)/.test(l)));
});

test('the checklist\'s step numbers are the guide\'s: each has a "## Step n" heading', () => {
  const env = load();
  const steps = new Set(env.exported.showSetupStatus().checklist.map((c) => c.step));
  const src = fs.readFileSync(S('35_FlowPreflightAndCanary.js'), 'utf8');
  const notHere = /const SETUP_CHECKLIST_NOT_HERE = \[([\s\S]*?)\];/.exec(src)[1];
  (notHere.match(/step: (\d+)/g) || []).forEach((m) => steps.add(Number(m.slice(6))));
  const headings = new Set((GUIDE.match(/^## Step (\d+)\b/gm) || []).map((h) => Number(h.slice(8))));
  steps.forEach((n) => assert.ok(headings.has(n), 'SETUP_GUIDE.md has no "## Step ' + n + '"'));
  assert.ok(headings.has(7) && /installLedgerCycle\(\)/.test(GUIDE));
});

test('the checklist\'s tab names are the ones the code that makes each tab uses', () => {
  const src = (f) => fs.readFileSync(S(f), 'utf8');
  const esc = (v) => v.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const pins = [
    ['40_FlowPrompts.js', 'FLOW_PROMPT_TAB', 'FlowPrompts'],
    ['42_FlowBuildSpec.js', 'FBS_TAB', 'FlowBuildSpec'],
    ['55_LessonSchedule.js', 'LS_TAB', 'LessonSchedule'],
    ['52_CanvasRosterImport.js', 'CRI_SECTION_MAP_TAB', 'CanvasSectionMap'],
    ['00_SharedConfig.js', 'CONFIG_TAB_NAME', '_CONFIG'],
    ['41_WarmUpFlowBridge.js', 'WFB_RETURN_TAB', 'WarmUpFlowReturn'],
    ['72_TurnInCheckFlow.js', 'TIC_RETURN_TAB', 'TurnInCheckReturn'],
  ];
  pins.forEach(([f, name, value]) => {
    assert.match(src(f), new RegExp('const ' + esc(name) + '\\s*=\\s*"' + esc(value) + '"'), f + ' ' + name);
  });
  // FlowInput's two headers the checklist reads.
  assert.match(src('37_FlowInputBuilder.js'), /"StagingRowRef"/);
  assert.match(src('37_FlowInputBuilder.js'), /"GeminiFullOutput"/);
  // getConfig_().tabs names.
  const shared = src('00_SharedConfig.js');
  ['Ledger', 'ReviewQueue', 'STAGING_PIPELINE', 'RubricQueue', 'MatrixRegistry', 'LessonContext', 'CompetencyRegistry',
    'AlignmentLog', 'StudentProfiles', 'WarmUpQueue', 'ClassSchedule', 'PacingGuide', 'CompetencyRubrics']
    .forEach((t) => assert.match(shared, new RegExp(':\\s*"' + esc(t) + '"'), t));
});
