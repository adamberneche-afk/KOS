'use strict';
// Tests for the CAS attention signal (34b_CasAttentionSignal.js) and the
// 2026-10-12 STAGING_PIPELINE gaps it was built alongside: an IN_PROCESS row
// with no timestamp held its teacher's lane forever (06) and the health
// check called it healthy (10); a Studio-residue status was counted nowhere.
//
// All files below are bound to cas-ccps:central-ledger
// (tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [
  '00_SharedConfig.js', '06_StagingPipeline_Turnstile.js', '10_AdminRecoveryPanel.js',
  '22_LessonContextHandler.js', '23_StudentProfileManager.js', '30_SCRSuggestionEngine.js', '30b_SCRRetryRemediation.js',
  '34_QueueWatchdog.js', '34b_CasAttentionSignal.js', '36_WeeklyParentReport.js',
  '50_StudentDataAccess.js',
].map(S);

function load() {
  const env = loadGasFiles(FILES, [
    'runQueueWatchdog', 'writeCasSignal_', 'runStagingTurnstile',
    '_stagingPipelineHealthChecks_', 'getConfig_', 'retryCandidates_',
  ]);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  return Object.assign(env, { ss, props });
}

const STAGING_HEADERS = ['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status'];
function staging(ss, rows) {
  const sh = ss.insertSheet('STAGING_PIPELINE');
  sh.appendRow(STAGING_HEADERS);
  rows.forEach((r) => sh.appendRow(r));
  return sh;
}
function stRow(ts, fileId, status, teacher) {
  return [ts, 'ref', fileId, 'CFG', teacher || 't@x.net', status];
}

// email, comp, suggested, met, notMet, partial, status, computedAt, confirmedRating
function scrRow(email, comp, status, suggested, confirmed) {
  return [email, comp, suggested === undefined ? '' : suggested, 0, 0, 0, status, '', confirmed === undefined ? '' : confirmed, '', ''];
}
function suggestions(ss, rows) {
  const sh = ss.insertSheet('SCRSuggestions');
  sh.appendRow(['StudentEmail', 'CompetencyID', 'SuggestedRating', 'Met', 'NotMet', 'Partial', 'Status',
    'LastComputedAt', 'ConfirmedRating', 'ConfirmedAt', 'ConfirmedBy']);
  rows.forEach((r) => sh.appendRow(r));
  return sh;
}

function signalText(env) {
  const id = env.props.getProperty('CAS_SIGNAL_DOC_ID');
  assert.ok(id, 'the signal doc ID is stored');
  return env.sandbox.DocumentApp.openById(id).getBody().getText();
}

const okWatchdog = (over) => Object.assign({ dryRun: false, error: null, results: {
  rubricQueue: { watched: 0, timedOut: 0, unknown: 0 },
  stagingPipeline: { watched: 0, timedOut: 0, unknown: 0 },
  warmUpQueue: { watched: 0, timedOut: 0, unknown: 0 },
} }, over || {});

// ── The signal doc ──

test('writeCasSignal_: creates the doc once, then rewrites the same doc', () => {
  const env = load();
  staging(env.ss, []);
  suggestions(env.ss, []);
  env.exported.writeCasSignal_(okWatchdog());
  const id = env.props.getProperty('CAS_SIGNAL_DOC_ID');
  env.exported.writeCasSignal_(okWatchdog());
  assert.equal(env.props.getProperty('CAS_SIGNAL_DOC_ID'), id);
  const text = signalText(env);
  assert.match(text, /^KOS_CAS_SIGNAL\n/);
  assert.match(text, /Generated at: \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(America\/New_York\)/);
  assert.match(text, /1\. STUDENTS & FAMILIES\nNothing waiting on you\./);
  assert.match(text, /2\. ADMIN\nNothing needs attention\./);
});

test('writeCasSignal_: students first, counts only, no identifiers in the doc', () => {
  const env = load();
  const now = new Date();
  staging(env.ss, [
    stRow(now, 'FILE-AAA', 'PENDING_INFERENCE'),
    stRow(now, 'FILE-AAA', 'IN_PROCESS'), // same student doc: one student waiting
    stRow(now, 'FILE-BBB', 'PENDING_INFERENCE'),
    stRow(now, 'FILE-CCC', 'ERROR_TIMEOUT'),
    stRow(now, 'FILE-DDD', 'COMPLETE'),
  ]);
  suggestions(env.ss, [
    scrRow('ann@student.net', 'C1', 'SUGGESTED', 3),
    scrRow('ann@student.net', 'C2', 'SUGGESTED', 2),
    scrRow('bo@student.net', 'C1', 'CONFIRMED', '', 2),
    scrRow('cy@student.net', 'C1', 'OVERRIDDEN', '', 4),
    scrRow('di@student.net', 'C1', 'INSUFFICIENT_EVIDENCE'),
  ]);
  env.sandbox.checkRetryEligibility_ = () => ({ eligible: false });

  env.exported.writeCasSignal_(okWatchdog());
  const text = signalText(env);
  assert.match(text, /- Submissions waiting on feedback: 2/);
  assert.match(text, /- Submissions whose evaluation failed or timed out: 1/);
  assert.match(text, /- SCR suggestions awaiting your confirm: 2 \(1 student\)/);
  // ann (suggested 3) and cy (confirmed 4); bo is at 2, 1 is the highest.
  assert.match(text, /- Students not yet at SCR 2: 2 \(no count from yesterday yet\)/);
  assert.ok(text.indexOf('1. STUDENTS') < text.indexOf('2. ADMIN'));
  for (const id of ['FILE-', '@student.net', 'C1', 'CFG', 't@x.net']) {
    assert.ok(!text.includes(id), 'the doc must not carry ' + id);
  }
});

test('writeCasSignal_: an unreadable count says unavailable, never all clear', () => {
  const env = load(); // no STAGING_PIPELINE, no SCRSuggestions tab
  env.exported.writeCasSignal_(okWatchdog());
  const text = signalText(env);
  assert.match(text, /Submissions waiting on feedback: unavailable/);
  assert.match(text, /SCR counts: unavailable/);
  assert.ok(!text.includes('Nothing waiting on you.'));
});

test('writeCasSignal_: admin lines for dry run, timeouts, unknown statuses, no-timestamp rows and a failed watchdog', () => {
  const env = load();
  staging(env.ss, [stRow('', 'FILE-X', 'IN_PROCESS')]);
  suggestions(env.ss, []);
  const wd = okWatchdog({ dryRun: true });
  wd.results.stagingPipeline.unknown = 1;
  wd.results.warmUpQueue.timedOut = 2;
  env.exported.writeCasSignal_(wd);
  let text = signalText(env);
  assert.match(text, /- Queue watchdog: DRY RUN/);
  assert.match(text, /- Queue rows that would have timed out this run: 2/);
  assert.match(text, /- Queue rows with an unknown status \(check for Studio residue\): 1/);
  assert.match(text, /- Queue rows in flight with no timestamp \(they never time out\): 1/);

  env.exported.writeCasSignal_({ dryRun: false, results: null, error: 'boom' });
  text = signalText(env);
  assert.match(text, /- Queue watchdog: the last run failed \(boom\)/);
});

test('writeCasSignal_: a failing FERPA check is an admin line', () => {
  const env = load();
  staging(env.ss, []);
  suggestions(env.ss, []);
  env.props.setProperty('GEMINI_API_KEY', 'x');
  env.exported.writeCasSignal_(okWatchdog());
  assert.match(signalText(env), /- FERPA checks failing: 1/);
});

test('writeCasSignal_: "since yesterday" compares against the end of the previous day', () => {
  const env = load();
  staging(env.ss, []);
  const sh = suggestions(env.ss, [scrRow('a@s.net', 'C1', 'SUGGESTED', 3)]);
  env.sandbox.checkRetryEligibility_ = () => ({ eligible: false });

  env.exported.writeCasSignal_(okWatchdog(), new Date('2026-10-12T15:00:00Z'));
  sh.appendRow(scrRow('b@s.net', 'C1', 'SUGGESTED', 4));
  sh.appendRow(scrRow('c@s.net', 'C1', 'SUGGESTED', 4));
  // Next day, past the hourly SCR cache.
  env.exported.writeCasSignal_(okWatchdog(), new Date('2026-10-13T15:00:00Z'));
  assert.match(signalText(env), /Students not yet at SCR 2: 3 \(\+2 since yesterday\)/);
});

test('writeCasSignal_: SCR counts are cached for an hour', () => {
  const env = load();
  staging(env.ss, []);
  const sh = suggestions(env.ss, [scrRow('a@s.net', 'C1', 'SUGGESTED', 3)]);
  env.sandbox.checkRetryEligibility_ = () => ({ eligible: false });
  env.exported.writeCasSignal_(okWatchdog(), new Date('2026-10-12T15:00:00Z'));
  sh.appendRow(scrRow('b@s.net', 'C1', 'SUGGESTED', 3));
  env.exported.writeCasSignal_(okWatchdog(), new Date('2026-10-12T15:30:00Z'));
  assert.match(signalText(env), /awaiting your confirm: 1 /);
  env.exported.writeCasSignal_(okWatchdog(), new Date('2026-10-12T16:05:00Z'));
  assert.match(signalText(env), /awaiting your confirm: 2 /);
});

test('writeCasSignal_: retry scan runs once a day and counts only students new since yesterday', () => {
  const env = load();
  staging(env.ss, []);
  suggestions(env.ss, [
    scrRow('a@s.net', 'C1', 'CONFIRMED', '', 3),
    scrRow('b@s.net', 'C1', 'OVERRIDDEN', '', 4),
    scrRow('c@s.net', 'C1', 'CONFIRMED', '', 2), // not a retry candidate
  ]);
  let eligible = new Set(['a@s.net']);
  let calls = 0;
  env.sandbox.checkRetryEligibility_ = (email) => { calls++; return { eligible: eligible.has(email) }; };

  env.exported.writeCasSignal_(okWatchdog(), new Date('2026-10-12T15:00:00Z'));
  assert.match(signalText(env), /newly eligible for a retry: 1 \(first scan/);
  assert.equal(calls, 2);
  env.exported.writeCasSignal_(okWatchdog(), new Date('2026-10-12T17:00:00Z'));
  assert.equal(calls, 2, 'no second scan the same day');

  eligible = new Set(['a@s.net', 'b@s.net']);
  env.exported.writeCasSignal_(okWatchdog(), new Date('2026-10-13T15:00:00Z'));
  assert.match(signalText(env), /newly eligible for a retry: 1\n/);
  const state = env.props.getProperty('CAS_SIGNAL_STATE');
  assert.ok(!state.includes('@'), 'no emails kept between runs');
});

test('retryCandidates_: teacher-decided ratings of 3 or 4 only', () => {
  const env = load();
  const rows = [['h'],
    scrRow('a', 'C1', 'CONFIRMED', '', 3), scrRow('b', 'C1', 'OVERRIDDEN', '', 4),
    scrRow('c', 'C1', 'CONFIRMED', '', 2), scrRow('d', 'C1', 'SUGGESTED', 3)];
  assert.deepEqual(env.exported.retryCandidates_(rows).map((c) => c.studentEmail), ['a', 'b']);
});

test('runQueueWatchdog: writes the signal, and still writes it when the run fails', () => {
  const env = load();
  staging(env.ss, []);
  suggestions(env.ss, []);
  env.exported.runQueueWatchdog();
  assert.match(signalText(env), /- Queue watchdog: DRY RUN/);

  env.props.setProperty('ADMIN_SS_ID', 'missing-ss');
  env.exported.runQueueWatchdog();
  assert.match(signalText(env), /- Queue watchdog: the last run failed/);
});

test('runQueueWatchdog: a fully blank row is not an unknown status', () => {
  const env = load();
  staging(env.ss, [['', '', '', '', '', '']]);
  suggestions(env.ss, []);
  env.props.setProperty('CAS_WATCHDOG_DRY_RUN', 'false');
  env.exported.runQueueWatchdog();
  assert.ok(!signalText(env).includes('unknown status'));
});

// ── 06: a no-timestamp IN_PROCESS row no longer holds the lane ──

test('runStagingTurnstile: an IN_PROCESS row with no timestamp does not hold the teacher lane', () => {
  const env = load();
  const sh = staging(env.ss, [
    stRow('', 'FILE-TEST', 'IN_PROCESS', 't@x.net'),
    stRow(new Date(), 'FILE-REAL', 'PENDING_INFERENCE', 't@x.net'),
  ]);
  env.exported.runStagingTurnstile();
  assert.equal(sh.getRange(3, 6).getValue(), 'IN_PROCESS', 'the queued row is promoted');
  assert.equal(sh.getRange(2, 6).getValue(), 'IN_PROCESS', 'the no-timestamp row is left as it is');
});

test('runStagingTurnstile: a timed IN_PROCESS row still holds the lane', () => {
  const env = load();
  const sh = staging(env.ss, [
    stRow(new Date(), 'FILE-A', 'IN_PROCESS', 't@x.net'),
    stRow(new Date(), 'FILE-B', 'PENDING_INFERENCE', 't@x.net'),
  ]);
  env.exported.runStagingTurnstile();
  assert.equal(sh.getRange(3, 6).getValue(), 'PENDING_INFERENCE');
});

// ── 10: health check sees no-timestamp rows and Studio residue ──

test('_stagingPipelineHealthChecks_: no-timestamp rows are stuck; unknown statuses are listed; blank rows skipped', () => {
  const env = load();
  staging(env.ss, [
    stRow('', 'FILE-1', 'IN_PROCESS'),
    stRow('', 'FILE-2', 'PENDING_INFERENCE'),
    stRow(new Date(), 'FILE-3', '{{Step 3.Status}}'),
    ['', '', '', '', '', ''],
    stRow(new Date(), 'FILE-4', 'COMPLETE'),
  ]);
  const cfg = env.exported.getConfig_();
  const r = env.exported._stagingPipelineHealthChecks_(env.ss, cfg);
  assert.equal(r.inProcessStuckRows.length, 1);
  assert.match(r.inProcessStuckRows[0], /no timestamp/);
  assert.equal(r.pendingStuckRows.length, 1);
  assert.match(r.pendingStuckRows[0], /no timestamp/);
  assert.deepEqual(r.unknownStatusRows, ['Row 4 — status "{{Step 3.Status}}"']);
});
