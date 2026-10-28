'use strict';
// The overnight check (34c_OvernightHealth.js): the 3 a.m. stage stamps,
// today's and tomorrow's warm-ups, Studio jobs with no return, failed
// returns, the all-clear line, and the once-a-day email. Counts only.
//
// All files below are bound to cas-ccps:central-ledger
// (tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
// 34c's setup checks reach 38, 40, 41 and 57, and those reach the rest
// (the retention schedule names every record's tab and columns).
const FILES = ['00_SharedConfig.js', '34c_OvernightHealth.js', '43_DeployVersionMarker_CentralLedger.js', '64_LedgerCycle.js',
  '03_QueueBridge.js', '10_AdminRecoveryPanel.js', '15b_StudioFlowPrompts_Flow2_Revised.js', '23_StudentProfileManager.js',
  '25_WarmUpWriter.js', '29_StudentContextAggregator.js', '30_SCRSuggestionEngine.js', '34_QueueWatchdog.js',
  '36_WeeklyParentReport.js', '37_FlowInputBuilder.js', '68_LessonParts.js', '38_LedgerSchemaGuard.js', '40_FlowPrompts.js',
  '41_WarmUpFlowBridge.js', '54_StudentAssignments.js', '57_RetentionSchedule.js'].map(S);

// Monday 2026-10-19, 6:00 a.m. in the harness's America/New_York.
const NOW = new Date('2026-10-19T10:00:00Z');
const HOURS = (h) => new Date(NOW.getTime() - h * 3600 * 1000);
const STAGES = ['M2_STAGE1_LAST_RUN', 'M2_STAGE1B_LAST_RUN', 'M2_STAGE2_LAST_RUN', 'M2_STAGE3_LAST_RUN'];
const WQ_HEADER = ['queue_id', 'lesson_id', 'student_email', 'student_name', 'google_id', 'lesson_date',
  'lesson_context_snapshot', 'student_profile_snapshot', 'status'];

function load(opts) {
  const env = loadGasFiles(FILES, ['overnightHealth_', 'overnightMaybeMail_', 'syncFlowPromptsToSheet',
    'LEDGER_CANONICAL_HEADERS']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  props.setProperty('ADMIN_NOTIFY_EMAIL', 'admin@ccpsnet.net');
  STAGES.forEach((k) => props.setProperty(k, HOURS(3).toISOString()));
  const wq = opts && opts.noQueue ? null : ss.insertSheet('WarmUpQueue');
  if (wq) wq.appendRow(WQ_HEADER);
  // A healthy install for the setup checks: the Ledger's canonical header
  // row and the FlowPrompts tab in sync with the code.
  ss.insertSheet('Ledger').appendRow(env.exported.LEDGER_CANONICAL_HEADERS.slice());
  env.exported.syncFlowPromptsToSheet();
  if (!(opts && opts.noContextTrigger)) {
    env.sandbox.ScriptApp.newTrigger('runWeeklyStudentAggregation_').timeBased().everyDays(7).create();
    env.sandbox.ScriptApp.newTrigger('runWeeklySCRSuggestionUpdate_').timeBased().everyDays(7).create();
  }
  return Object.assign(env, { ss, props, wq });
}

function warmUp(env, id, date, status) {
  env.wq.appendRow([id, 'LES-1', 's@ccpsnet.net', 'Sam', 's@ccpsnet.net', date, '{}', '{}', status]);
}

test('all clear: every stage ran and today\'s warm-ups are delivered, so one good-news line', () => {
  const env = load();
  warmUp(env, 'Q1', '2026-10-19', 'DELIVERED');
  warmUp(env, 'Q2', '2026-10-19', 'DELIVERED');
  warmUp(env, 'Q3', '2026-10-20', 'PENDING');
  const h = env.exported.overnightHealth_(NOW);
  assert.deepEqual(h.problems, []);
  assert.match(h.allClear, /all four 3 a\.m\. stages ran/);
  assert.match(h.allClear, /Today's warm-ups: 2 of 2 delivered/);
  assert.match(h.allClear, /Tomorrow's: 1 built, 0 delivered so far/);
});

test('each problem gets its own line, and there is no all-clear', () => {
  const env = load();
  env.props.setProperty('M2_STAGE1B_LAST_RUN', HOURS(30).toISOString());
  env.props.deleteProperty('M2_STAGE3_LAST_RUN');
  env.props.setProperty('M2_STAGE2_STATUS', 'ERRORS_2');
  warmUp(env, 'Q1', '2026-10-19', 'DELIVERED');
  warmUp(env, 'Q2', '2026-10-19', 'ERROR');
  warmUp(env, 'Q3', '2026-10-19', 'PENDING');
  warmUp(env, 'Q4', '2026-10-16', 'PENDING_EVAL');
  const f3 = env.ss.insertSheet('Flow3Input');
  f3.appendRow(['Timestamp', 'QueueID', 'Status']);
  f3.appendRow([HOURS(2), 'Q3', 'READY']);            // no return after 2 h: stalled
  f3.appendRow([HOURS(2), 'Q2', 'READY']);            // returned (and failed): not stalled
  f3.appendRow([new Date(NOW.getTime() - 60000), 'Q5', 'READY']); // a minute old: not yet
  const ret = env.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  ret.appendRow([HOURS(2), 3, 'Q2', 'text', 'FAILED', 3, 'FOLDER_PATH_FIELDS_MISSING']);
  ret.appendRow([HOURS(48), 3, 'Q9', 'text', 'FAILED', 3, 'old']);
  const fi = env.ss.insertSheet('FlowInput');
  fi.appendRow(['Timestamp', 'StagingRowRef', 'ReadyStatus']);
  fi.appendRow([HOURS(1), 'r1', 'READY']);
  fi.appendRow([HOURS(1), 'r2', 'EVALUATED']);

  const p = env.exported.overnightHealth_(NOW).problems.join('\n');
  assert.match(p, /3:05 artifact sync \(33\): didn't run last night/);
  assert.match(p, /3:30 warm-up queue build \(24\): no run recorded/);
  assert.match(p, /3:15 warm-up scoring \(25\): ran with status ERRORS_2/);
  assert.match(p, /Today's warm-ups that failed to deliver \(ERROR\): 1 of 3/);
  assert.match(p, /Today's warm-ups not delivered yet: 1 of 3/);
  assert.match(p, /still waiting on scoring \(Flow 4\): 1/);
  assert.match(p, /Studio Flow 3: 1 job\(s\) with no return/);
  assert.match(p, /Studio Flow 2: 1 job\(s\) with no return after 15 minutes \(check the Flow's run history in Studio\)/);
  assert.doesNotMatch(p, /bug 4/, 'bug 4 is resolved: Flow 2 starts itself');
  assert.match(p, /Flow 3 returns that failed or need attention in the last 24 hours: 1/);
  assert.equal(env.exported.overnightHealth_(NOW).allClear, '');
  assert.doesNotMatch(p, /Q\d|s@ccpsnet|Sam/, 'counts only');
});

// Studio writes WarmUpFlowReturn's Timestamp as text (found 2026-10-21):
// new Date() can't read it, so every fallback since the tab began counted as
// "the last 24 hours" (25 in the email, 11 from the night before).
test('a Studio return row\'s text timestamp ages out of the 24 hours', () => {
  const env = load();
  const ret = env.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  // NOW is 2026-10-19 06:00 EDT.
  ret.appendRow(['October 19, 2026 at 3:29 AM EDT', 3, 'Q1', 'text', 'HARVESTED', 1, 'ANCHOR_FALLBACK: is a list']);
  ret.appendRow(['October 19, 2026 at 4 AM EDT', 3, 'Q2', 'text', 'HARVESTED', 1, 'ANCHOR_FALLBACK: is a list']);
  ret.appendRow(['October 18, 2026 at 3:29 AM EDT', 3, 'Q3', 'text', 'HARVESTED', 1, 'ANCHOR_FALLBACK: is a list']);
  ret.appendRow(['October 17, 2026 at 3:29 AM EDT', 3, 'Q4', 'text', 'FAILED', 3, 'old']);
  const p = env.exported.overnightHealth_(NOW).problems.join('\n');
  assert.match(p, /teacher's own question in the last 24 hours: 2 /);
  assert.doesNotMatch(p, /returns that failed/);
});

test('sheetTimestampMs_ reads a Date, an ISO string and Studio\'s text; anything else is NaN', () => {
  const ts = loadGasFiles([S('00_SharedConfig.js')], ['sheetTimestampMs_']).exported.sheetTimestampMs_;
  assert.equal(ts(new Date('2026-10-20T07:29:00Z')), Date.parse('2026-10-20T07:29:00Z'));
  assert.equal(ts('2026-10-20T07:29:00Z'), Date.parse('2026-10-20T07:29:00Z'));
  assert.equal(ts('October 20, 2026 at 3:29 AM EDT'), Date.parse('2026-10-20T07:29:00Z'));
  assert.equal(ts('October 20, 2026 at 4 AM EDT'), Date.parse('2026-10-20T08:00:00Z'));
  assert.equal(ts('November 2, 2026 at 12:05 PM EST'), Date.parse('2026-11-02T17:05:00Z'));
  assert.equal(ts('December 31, 2026 at 12:30 AM EST'), Date.parse('2026-12-31T05:30:00Z'));
  assert.ok(Number.isNaN(ts('')));
  assert.ok(Number.isNaN(ts('October 20, 2026 at 3:29 AM XYZ')));
  assert.ok(Number.isNaN(ts('Smarch 20, 2026 at 3:29 AM EDT')));
});

test('a quiet weekend morning is still all clear; Module 2 off says so', () => {
  const env = load();
  assert.match(env.exported.overnightHealth_(NOW).allClear, /No warm-ups today\. None built for tomorrow\./);
  env.props.setProperty('M2_ENABLED', 'false');
  assert.match(env.exported.overnightHealth_(NOW).problems[0], /Module 2 is off/);
});

test('an unreadable WarmUpQueue is never all clear', () => {
  const env = load({ noQueue: true });
  const h = env.exported.overnightHealth_(NOW);
  assert.match(h.problems.join('\n'), /Warm-up counts: unavailable/);
  assert.equal(h.allClear, '');
});

test('the email goes once a day, not before 5 a.m., with the deployment and the same lines', () => {
  const env = load();
  const sent = () => env.sandbox.MailApp.getSentMessages();
  const h = { problems: ['Today\'s warm-ups not delivered yet: 3 of 81'], allClear: '' };
  assert.equal(env.exported.overnightMaybeMail_(h, new Date('2026-10-19T08:30:00Z')), false, '4:30 a.m.: too early');
  assert.equal(env.exported.overnightMaybeMail_(h, NOW), true);
  assert.equal(env.exported.overnightMaybeMail_(h, new Date(NOW.getTime() + 600000)), false, 'once a day');
  assert.equal(sent().length, 1);
  assert.equal(sent()[0].to, 'admin@ccpsnet.net');
  assert.equal(sent()[0].subject, 'CAS overnight 2026-10-19: 1 problem (teacher@ccpsnet.net)');
  assert.match(sent()[0].body, /version marker [0-9a-f]{7}, teacher teacher@ccpsnet\.net/);
  assert.match(sent()[0].body, /- Today's warm-ups not delivered yet: 3 of 81/);
  env.exported.overnightMaybeMail_({ problems: [], allClear: 'All clear: ok.' }, new Date('2026-10-20T10:00:00Z'));
  assert.match(sent()[1].subject, /2026-10-20: all clear/);
  assert.match(sent()[1].body, /All clear: ok\./);
});

// UX audit fix-first 5 (2026-10-22): a Ledger cycle job still failing is a problem line.
test('a Ledger cycle job still failing is named, and there is no all-clear', () => {
  const env = load();
  warmUp(env, 'Q1', '2026-10-19', 'DELIVERED');
  env.props.setProperty('LEDGER_CYCLE_ERRORS', JSON.stringify({
    bridgeQueue: { streak: 12, since: NOW.getTime() - 12 * 60000, day: '2026-10-19', dayCount: 12 },
    harvestFlowInputResults: { streak: 0, since: 0, day: '2026-10-19', dayCount: 2 },
  }));
  const h = env.exported.overnightHealth_(NOW);
  assert.deepEqual(h.problems.filter((p) => /Ledger job/.test(p)),
    ["Ledger job bridgeQueue: failing, 12 runs in a row (Executions in the Central Ledger's Apps Script project shows the errors)"]);
  assert.equal(h.allClear, '');
});

// The setup checks once run by hand (2026-10-23, from the 10-22 friction map
// review): the Ledger's column order, FlowPrompts against the code, the last
// day's Studio returns in the right columns, and retention date columns.

function loadSetup(opts) {
  const env = loadGasFiles(FILES, ['overnightHealth_', 'syncFlowPromptsToSheet', 'LEDGER_CANONICAL_HEADERS']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  STAGES.forEach((k) => props.setProperty(k, HOURS(3).toISOString()));
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(WQ_HEADER);
  const ledger = opts && opts.noLedger ? null : ss.insertSheet('Ledger');
  if (ledger) ledger.appendRow(env.exported.LEDGER_CANONICAL_HEADERS.slice());
  env.exported.syncFlowPromptsToSheet();
  return Object.assign(env, { ss, props, wq, ledger });
}

const setupLines = (h) => h.problems.filter((p) => /Ledger columns|Flow prompts|wrong columns|Retention records/.test(p));

test('setup checks: a healthy Ledger, prompts in sync and well-bound returns add nothing', () => {
  const env = loadSetup();
  env.wq.appendRow(['Q1', 'LES-1', 's@ccpsnet.net', 'Sam', 's@ccpsnet.net', '2026-10-19', '{}', '{}', 'DELIVERED']);
  const ret = env.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  ret.appendRow([HOURS(2), 3, 'Q1', 'A warm-up question about pricing.', 'HARVESTED', 1, '']);
  assert.deepEqual(setupLines(env.exported.overnightHealth_(NOW)), []);
});

test('setup checks: a shifted Ledger column, a drifted prompt and a shifted return are each one line', () => {
  const env = loadSetup();
  const headers = env.exported.LEDGER_CANONICAL_HEADERS.slice();
  headers.splice(4, 0, 'FileURL');
  env.ledger.getRange(1, 1, 1, headers.length).setValues([headers]);
  const fp = env.ss.getSheetByName('FlowPrompts');
  fp.getRange(2, 1, 1, fp.getLastColumn()).setValues([fp.getRange(2, 1, 1, fp.getLastColumn()).getValues()[0]
    .map((v, i) => (i === 0 ? v : (String(v).length > 40 ? 'edited by hand' : v)))]);
  env.wq.appendRow(['Q1', 'LES-1', 's@ccpsnet.net', 'Sam', 's@ccpsnet.net', '2026-10-19', '{}', '{}', 'DELIVERED']);
  const ret = env.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  ret.appendRow([HOURS(2), '', 3, 'Q1', 'A warm-up question about pricing.', '', '']); // one column right
  ret.appendRow([HOURS(48), '', 3, 'Q1', 'old', '', '']);                               // outside the 24 hours

  const h = env.exported.overnightHealth_(NOW);
  const lines = setupLines(h).join('\n');
  assert.match(lines, /Ledger columns out of order: column 5 is "FileURL", expected "StudentName"/);
  assert.match(lines, /Flow prompts on the FlowPrompts tab: 1 differ from the code, 0 missing/);
  assert.match(lines, /Studio returns in the wrong columns \(last 24 hours\): 1 of 1 WarmUpFlowReturn rows/);
  assert.equal(h.allClear, '');
  assert.doesNotMatch(lines, /Q1|s@ccpsnet|Sam/, 'counts and header names only');
});

// ⚙ Settings (2026-10-27): a Script Property in the Central Ledger would
// override the Teacher Dashboard's switch there without the panel knowing.
test('setup checks: a ⚙ Settings key set as a Central Ledger Script Property is one line, naming it', () => {
  const env = loadSetup();
  env.props.setProperty('ROLLOUT_AUTO_APPLY', '8175');
  env.props.setProperty('WARMUP_TEXT_BOX', '');
  const lines = env.exported.overnightHealth_(NOW).problems.filter((p) => /Settings set as Script Properties/.test(p));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /override the Teacher Dashboard's ⚙ Settings here: ROLLOUT_AUTO_APPLY\. Set each in ⚙ Settings/);
  assert.doesNotMatch(lines[0], /8175|WARMUP_TEXT_BOX/, 'names only, and a blank property is unset');
});

test('setup checks: no weekly Student Context or competency trigger is a line each, naming the setup function', () => {
  const env = load({ noContextTrigger: true });
  const lines = env.exported.overnightHealth_(NOW).problems.filter((p) => /Student Context|Competency suggestions/.test(p));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /no trigger, so no doc is made or updated\. Run setupStudentContextDocs\(\)/);
  assert.match(lines[1], /no new suggestion\. Run setupCompetencySuggestions\(\)/);
});

test('setup checks run at most every 6 hours; in between, the last lines are reused', () => {
  const env = loadSetup();
  const headers = env.exported.LEDGER_CANONICAL_HEADERS.slice();
  headers.splice(4, 0, 'FileURL');
  env.ledger.getRange(1, 1, 1, headers.length).setValues([headers]);
  assert.equal(setupLines(env.exported.overnightHealth_(NOW)).length, 1);
  env.ledger.deleteColumn(5);
  assert.equal(setupLines(env.exported.overnightHealth_(new Date(NOW.getTime() + 3600 * 1000))).length, 1, 'cached');
  assert.equal(setupLines(env.exported.overnightHealth_(new Date(NOW.getTime() + 7 * 3600 * 1000))).length, 0, 'rechecked');
});

test('a setup check that throws says unavailable and blocks the all-clear', () => {
  const env = loadSetup({ noLedger: true });
  const h = env.exported.overnightHealth_(NOW);
  assert.ok(h.problems.includes('Ledger columns: unavailable (no Ledger tab)'), JSON.stringify(h.problems));
  assert.equal(h.allClear, '');
});
