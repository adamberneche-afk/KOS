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
  const env = loadGasFiles([S('00_SharedConfig.js'), S('35_FlowPreflightAndCanary.js'), S('58_LessonRollout.js'), S('23_StudentProfileManager.js'), S('64_LedgerCycle.js'),
    S('32_CompetencyRubricImporter.js'), S('37_FlowInputBuilder.js'), S('39b_Flow2Provenance.js'), S('39_FlowFixtures.js')],
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

// 2026-11-14: each cycle job's run time, and the cycle's share of the day.
test('a cycle job\'s line has its cadence and run time; the cycle\'s day and the schedule follow', () => {
  const env = load();
  env.sandbox.ScriptApp.newTrigger('runLedgerCycle').timeBased().create();
  env.props.setProperty('LEDGER_CYCLE_JOBS', JSON.stringify(['harvestFlowInputResults']));
  const day = env.sandbox.Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  env.props.setProperty('LEDGER_CYCLE_TIMING', JSON.stringify({
    harvestFlowInputResults: { last: 1500, avg: 1800, max: 4000, day, runs: 30, total: 54000, deferred: 2 },
    _cycle: { last: 6000, avg: 5000, max: 9000, day, runs: 30, total: 180000, deferred: 0, deferredCycles: 2, busy: 1 },
  }));
  const r = env.exported.showSetupStatus();
  assert.ok(r.lines.some((l) => /on\s+harvestFlowInputResults: in the cycle, every 1 min \(last 1\.5 s, usually 1\.8 s; today 30 run\(s\), 54 s in all, slowest 4 s, put off 2 time\(s\) by the budget\)/.test(l)));
  assert.ok(r.lines.some((l) => /Ledger cycle today: 30 run\(s\), 3 min of trigger time \(0\.8% of the 6 h/.test(l)));
  assert.ok(r.lines.some((l) => /2 cycle\(s\) ran out of time and put jobs off; 1 minute\(s\) skipped/.test(l)));
  assert.ok(r.lines.some((l) => /^\s+Schedule: up to 5 min/.test(l)));
  // 2026-11-15: the day at this rate (before a cycle with checks, the
  // cycle's usual 5 s × 1,440 = 2 h, 33%), how the checks decide, and the
  // optional onChange probe, which is never "missing".
  assert.ok(r.lines.some((l) => /^\s+At this rate: about 2 h a day \(33% of the 6 h\) on a school day/.test(l)));
  assert.ok(r.lines.some((l) => /^\s+Checks: on\. .*Every 15 min the cycle runs every due job without checks/.test(l)));
  assert.ok(r.lines.some((l) => /^\s+off\s+onChange probe \(onLedgerChangeProbe\), optional/.test(l)));
  assert.ok(!r.missing.some((m) => /Probe/.test(m)));
  assert.ok(checklistLines(r).some((l) => /^\s+OPTIONAL \[7\] onChange probe/.test(l)));
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
  assert.ok(lines.some((l) => /^\s+MISSING \[7\] Job bridgeQueue: run installIntakeTriggers\(\), then installLedgerCycle\(\)/.test(l)));
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
    ['52_CanvasRosterImport.js', 'CRI_SECTION_MAP_TAB', 'CanvasSectionMap'],
    ['72_TurnInCheckFlow.js', 'TIC_RETURN_TAB', 'TurnInCheckReturn'],
  ];
  pins.forEach(([f, name, value]) => {
    assert.match(src(f), new RegExp('const ' + esc(name) + '\\s*=\\s*"' + esc(value) + '"'), f + ' ' + name);
  });
  // FlowInput's two headers the checklist reads.
  assert.match(src('37_FlowInputBuilder.js'), /"StagingRowRef"/);
  assert.match(src('37_FlowInputBuilder.js'), /"GeminiFullOutput"/);
  // 00's TABS (getConfig_().tabs), where LessonSchedule, WarmUpFlowReturn and
  // _CONFIG moved from their own files' constants on 2026-11-21.
  const shared = src('00_SharedConfig.js');
  ['Ledger', 'ReviewQueue', 'STAGING_PIPELINE', 'RubricQueue', 'MatrixRegistry', 'LessonContext', 'CompetencyRegistry',
    'AlignmentLog', 'StudentProfiles', 'WarmUpQueue', 'ClassSchedule', 'PacingGuide', 'CompetencyRubrics',
    'LessonSchedule', 'WarmUpFlowReturn', '_CONFIG']
    .forEach((t) => assert.match(shared, new RegExp(':\\s*"' + esc(t) + '"'), t));
});

// 2026-11-15: the Ledger cycle's settings say where each came from; a Flow 2
// answer copied into another row this week is a WARN naming the Studio fix;
// a Flow 2 fixture row left in FlowInput names removeFlow2Fixture().
test('cycle settings with their source, the duplicate-write WARN and the leftover fixture row', () => {
  const env = load();
  // The clock pinned: Monday 2026-11-16, 10:00 in New York.
  const NOW = Date.UTC(2026, 10, 16, 15, 0, 0);
  const RealDate = env.sandbox.Date;
  env.sandbox.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(NOW); }
    static now() { return NOW; }
    static [Symbol.hasInstance](x) { return x instanceof RealDate || (x && typeof x.getTime === 'function'); }
  };
  env.props.setProperty('LEDGER_CYCLE_GATES', 'off');
  const cfg = env.ss.insertSheet('_CONFIG');
  cfg.appendRow(['Key', 'Value']);
  cfg.appendRow(['LEDGER_CYCLE_EVERY', '{"harvestFlowInputResults": 5}']);
  const dup = env.ss.insertSheet('Flow2Duplicates');
  dup.appendRow(['DetectedAt', 'EarlierBuiltAt', 'NewerBuiltAt', 'EarlierStatus']);
  dup.appendRow([new Date(NOW - 60 * 60 * 1000), '', '', 'EVALUATED']);
  const fi = env.ss.insertSheet('FlowInput');
  fi.appendRow(['Timestamp', 'StagingRowRef']);
  fi.appendRow([new Date(NOW), 'FIXTURE']);
  const lines = env.exported.showSetupStatus().lines;
  assert.ok(lines.includes('  LEDGER_CYCLE_EVERY = {"harvestFlowInputResults": 5}  <- Central Ledger _CONFIG tab'));
  assert.ok(lines.includes('  LEDGER_CYCLE_GATES = off  <- Script Property'));
  assert.ok(lines.includes('  LEDGER_CYCLE_QUIET = (unset: the default)'));
  const warn = lines.filter((l) => /^ {2}WARN Flow 2 wrote one answer/.test(l));
  assert.equal(warn.length, 1);
  assert.match(warn[0], /Update row step .* StagingRowRef \(column B\)/);
  assert.ok(lines.some((l) => /NOTE FlowInput still has 1 Flow 2 fixture row\(s\).*removeFlow2Fixture\(\)/.test(l)));
});
