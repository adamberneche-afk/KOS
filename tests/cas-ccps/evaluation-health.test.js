'use strict';
// reportEvaluationHealth (69, 2026-11-01): the numbers D8 waits on, per
// course and week, from EvaluationLog, STAGING_PIPELINE, the Ledger and
// WarmUpQueue. Counts, rates and minutes only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '03_QueueBridge.js', '37_FlowInputBuilder.js', '69_EvaluationHealth.js'].map(S);

// Wednesday 2026-10-28, noon local; the week of Monday 2026-10-26.
const NOW = new Date(2026, 9, 28, 12, 0, 0);
const DAY = (d, h) => new Date(2026, 9, d, h || 10, 0, 0);

function load() {
  const env = loadGasFiles(FILES, ['reportEvaluationHealth', 'evaluationHealth_', 'LEDGER', 'LEDGER_COL_COUNT',
    'EH_HEADERS', 'EVAL_LOG_HEADERS', 'WQ_TIMING']);
  const { sandbox, exported: x } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());

  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(x.LEDGER_COL_COUNT).fill('h'));
  const lrow = (configId, className) => {
    const r = new Array(x.LEDGER_COL_COUNT).fill('');
    r[x.LEDGER.CONFIG_ID] = configId; r[x.LEDGER.CLASS_NAME] = className;
    ledger.appendRow(r);
  };
  lrow('M1', '8175 Sports Marketing'); lrow('M2', '8175 Sports Marketing'); lrow('B1', '8177 Business Management');

  const log = ss.insertSheet('EvaluationLog');
  log.appendRow(x.EVAL_LOG_HEADERS);
  const ev = (at, configId, file, result, wait) => log.appendRow([at, configId, file, 1, result, '', wait === undefined ? '' : wait, '']);
  // This week, 8175: two students, one with three drafts.
  ev(DAY(26), 'M1', 'f1', 'NEEDS_REVISION', 4);
  ev(DAY(27), 'M1', 'f1', 'NEEDS_REVISION', 6);
  ev(DAY(27), 'M1', 'f1', 'PASSED', 20);
  ev(DAY(27), 'M2', 'f2', 'PASSED', 3);
  ev(DAY(27), 'M2', 'f2', 'ERROR_EMPTY_OUTPUT');
  ev(DAY(27), 'M2', 'f2', 'ERROR_STRANGE');
  // This week, 8177.
  ev(DAY(26), 'B1', 'f3', 'PASSED', 5);
  // Last week, and too old to count.
  ev(DAY(21), 'M1', 'f9', 'ERROR_HARVEST_FAILED');
  ev(new Date(2026, 6, 1), 'M1', 'f9', 'PASSED', 1);

  const staging = ss.insertSheet('STAGING_PIPELINE');
  staging.appendRow(['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  staging.appendRow([DAY(27), 2, 'f4', 'M1', 't', 'ERROR_TIMEOUT']);
  staging.appendRow([DAY(27), 3, 'f5', 'M1', 't', 'COMPLETE']);

  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(x.WQ_TIMING.ANSWERED_AT + 1).fill('h'));
  const w = (lesson, delivered, answered) => {
    const r = new Array(x.WQ_TIMING.ANSWERED_AT + 1).fill('');
    r[1] = lesson; r[x.WQ_TIMING.DELIVERED_AT] = delivered; r[x.WQ_TIMING.ANSWERED_AT] = answered || '';
    wq.appendRow(r);
  };
  w('8175 Sports Marketing L05', DAY(26, 8), DAY(26, 9));
  w('8175 Sports Marketing L05', DAY(26, 8));
  w('8175 Sports Marketing L06', DAY(27, 8), DAY(27, 8));
  return Object.assign(env, { ss });
}

const byKey = (env, rows) => Object.fromEntries(rows.map((r) =>
  [r[0] + ' ' + r[1], Object.fromEntries(env.exported.EH_HEADERS.map((h, i) => [h, r[i]]))]));

test('per course and week: results by kind, never returned, failure rate, waits, drafts, warm-ups', () => {
  const env = load();
  const out = env.exported.evaluationHealth_({ now: NOW });
  const m = byKey(env, out.rows);
  const mk = m['2026-10-26 8175'];
  assert.equal(mk.Checks, 7, '6 results and 1 never returned');
  assert.equal(mk.Passed, 2);
  assert.equal(mk.NeedsRevision, 2);
  assert.equal(mk.ErrorEmptyOutput, 1);
  assert.equal(mk.ErrorOther, 1);
  assert.equal(mk.NeverReturned, 1, 'the COMPLETE row is not counted');
  assert.equal(mk.FailureRate, 0.429);
  assert.equal(mk.WaitMedianMin, 4);
  assert.equal(mk.WaitSlowestTenthMin, 20);
  assert.equal(mk.StudentLessons, 2);
  assert.equal(mk.DraftsPerStudentLesson, 2);
  assert.equal(mk.MostDrafts, 3);
  assert.equal(mk.WarmUpsDelivered, 3);
  assert.equal(mk.WarmUpsAnswered, 2);
  assert.equal(mk.WarmUpAnswerRate, 0.667);
  assert.equal(m['2026-10-26 8177'].Checks, 1);
  assert.equal(m['2026-10-19 8175'].ErrorHarvestFailed, 1);
  assert.equal(Object.keys(m).some((k) => k.startsWith('2026-07')), false, 'older than eight weeks');
  assert.deepEqual(out.rows.map((r) => r[0]), ['2026-10-26', '2026-10-26', '2026-10-19'], 'newest week first');
});

test('the email line: this week across courses, against D8\'s bar, no identifiers', () => {
  const env = load();
  const { line } = env.exported.evaluationHealth_({ now: NOW });
  assert.equal(line, 'Flow 2, week of 2026-10-26: 8 checks, 2 failed and 1 never returned (37.5%; D8\'s bar is under 5%); ' +
    'feedback in 5 min median, 20 at the slowest tenth; 1.7 drafts per student per lesson; warm-ups answered 2 of 3. ' +
    'The Measures tab has the weeks by course.');
  assert.doesNotMatch(line, /f\d|M1|B1/);
});

test('reportEvaluationHealth rewrites the Measures tab, headers and all', () => {
  const env = load();
  env.exported.reportEvaluationHealth();
  const tab = env.ss.getSheetByName('Measures').getDataRange().getValues();
  assert.deepEqual(tab[0], env.exported.EH_HEADERS);
  env.exported.reportEvaluationHealth();
  assert.equal(env.ss.getSheetByName('Measures').getDataRange().getValues().length, tab.length, 'rewritten, not appended');
});
