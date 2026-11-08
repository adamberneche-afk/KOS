'use strict';
// flowMeasures_ (69b, 2026-11-08): every CAS Studio flow per week from its
// own tabs, Studio's runs per day against STUDIO_DAILY_RUN_LIMIT, and the
// overnight email's second line. Counts, rates and minutes only; what a
// flow doesn't record is "—", never 0.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '03_QueueBridge.js', '34_QueueWatchdog.js', '37_FlowInputBuilder.js',
  '41_WarmUpFlowBridge.js', '71_TurnInCodes.js', '72_TurnInCheckFlow.js', '69_EvaluationHealth.js',
  '69b_FlowMeasures.js'].map(S);
const EXPOSE = ['reportEvaluationHealth', 'evaluationHealth_', 'FM_HEADERS', 'FI', 'EVAL_LOG_HEADERS', 'WFB_RETURN_HEADERS',
  'WFB_FLOW3_HEADERS', 'TIC_INPUT_HEADERS', 'TIC_RETURN_HEADERS', 'TURN_IN_CHECK_HEADERS', 'TCHK',
  'TURN_IN_CODE_HEADERS', 'TCODE', 'EH_D8_FAILURE_BAR', 'WD_RUBRIC_QUEUE_COLUMNS'];

// Wednesday 2026-10-28, noon local; the week of Monday 2026-10-26.
const NOW = new Date(2026, 9, 28, 12, 0, 0);
const AT = (d, h, m) => new Date(2026, 9, d, h === undefined ? 10 : h, m || 0, 0);
const MINS_AGO = (n) => new Date(NOW.getTime() - n * 60000);

function base() {
  const env = loadGasFiles(FILES, EXPOSE);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  return Object.assign(env, { ss, props });
}

function load() {
  const env = base();
  const { ss, exported: x } = env;

  // Flow 1: one COMPLETE, one timed out by the watchdog, one past 30 min, one just sent.
  const rq = ss.insertSheet('RubricQueue');
  rq.appendRow(['Timestamp', 'TeacherEmail', 'TeacherName', 'Subject', 'CourseName', 'Tier', 'RubricText',
    'PromptTemplateID', 'TeacherMatrixSsId', 'Status']);
  const q = (at, status) => rq.appendRow([at, 't@x', 'T', 's', 'c', '1', 'RUBRIC SECRET TEXT', 'p', 'm', status]);
  q(AT(26), 'COMPLETE'); q(AT(27), 'STUDIO_TIMEOUT'); q(AT(26, 11), 'PENDING_EXTRACTION'); q(MINS_AGO(10), 'PENDING_EXTRACTION');

  // Flow 2: FlowInput rows, and the harvest's EvaluationLog rows.
  const fi = ss.insertSheet('FlowInput');
  fi.appendRow(new Array(x.FI.PROMPT_TEXT + 1).fill('h'));
  const f = (at, file, config, status) => {
    const r = new Array(x.FI.PROMPT_TEXT + 1).fill('');
    r[x.FI.TIMESTAMP] = at; r[x.FI.STUDENT_FILE_ID] = file; r[x.FI.CONFIG_ID] = config; r[x.FI.READY_STATUS] = status;
    r[x.FI.STUDENT_EMAIL] = 'student@ccpsnet.net';
    fi.appendRow(r);
  };
  f(AT(26), 'file-a', 'CFG-A', 'HARVESTED');
  f(AT(27), 'file-b', 'CFG-B', 'ERROR_EMPTY_OUTPUT');
  f(AT(27, 9), 'file-c', 'CFG-A', 'READY'); // past the lane's 30 minutes
  f(MINS_AGO(5), 'file-d', 'CFG-A', 'READY');
  f(AT(27, 11), 'file-e', 'CFG-A', 'EVALUATED');
  f(AT(27, 12), 'file-f', 'CFG-A', ''); // built, not sent
  f(AT(27, 13), 'file-g', 'VDOE-FIXTURE-F2', 'HARVESTED'); // a run, not a job
  const log = ss.insertSheet('EvaluationLog');
  log.appendRow(x.EVAL_LOG_HEADERS);
  log.appendRow([AT(26, 10, 7), 'CFG-A', 'file-a', 1, 'PASSED', '', 9, '']);
  log.appendRow([AT(27, 10, 12), 'CFG-B', 'file-b', '', 'ERROR_EMPTY_OUTPUT', '', '', '']);

  // Flows 3 and 4: input rows and WarmUpFlowReturn.
  const f3 = ss.insertSheet('Flow3Input');
  f3.appendRow(x.WFB_FLOW3_HEADERS);
  const i3 = (at, id, status) => f3.appendRow([at, id, status]);
  i3(AT(26, 8), 'Q1', 'CONSUMED');
  i3(AT(26, 8), 'Q2', 'RETRIED'); i3(AT(26, 9), 'Q2', 'RETRIED'); i3(AT(26, 10), 'Q2', 'CONSUMED');
  i3(AT(27, 8), 'Q3', 'CONSUMED');
  i3(AT(27, 8), 'Q4', 'READY');
  i3(MINS_AGO(10), 'Q5', 'READY');
  i3(AT(27, 8), 'Q6', 'RETRIED'); i3(AT(27, 9), 'Q6', 'RETRIED'); i3(AT(27, 10), 'Q6', 'READY');
  i3(AT(27, 8), 'WUQ-CANARY-1', 'READY');
  i3(AT(12, 8), 'Q8', 'CONSUMED'); // a week whose returns are gone
  const f4 = ss.insertSheet('Flow4Input');
  f4.appendRow(['Timestamp', 'QueueID', 'Status']);
  f4.appendRow([AT(26, 8), 'Q1', 'CONSUMED']);
  const f5 = ss.insertSheet('Flow5Input');
  f5.appendRow(['Timestamp', 'QueueID', 'Status']);
  f5.appendRow([AT(27, 8), 'Q9', 'READY']);
  const ret = ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(x.WFB_RETURN_HEADERS);
  ret.appendRow([AT(26, 8, 6), 3, 'Q1', 'a warm-up', 'HARVESTED', 1, '']);
  ret.appendRow([AT(26, 11), 3, 'Q2', '', 'HARVESTED', 0, 'ANCHOR_FALLBACK: no return from Studio after 2 retries']);
  ret.appendRow([AT(27, 8, 10), 3, 'Q3', 'Here is the prompt', 'HARVESTED', 1, 'ANCHOR_FALLBACK: NOT_A_WARMUP']);
  ret.appendRow([AT(27, 8, 4), 3, 'Q4', 'x', 'FAILED', 3, 'SUSPECT_FABRICATION']);
  ret.appendRow([AT(26, 8, 20), 4, 'Q1', '{"score":3}', 'HARVESTED', 1, '']);

  // Flow 6: TurnInChecks, its input and return rows, and the codes.
  const tc = ss.insertSheet('TurnInChecks');
  tc.appendRow(x.TURN_IN_CHECK_HEADERS);
  const chk = (id, at, who, status) => {
    const r = new Array(x.TURN_IN_CHECK_HEADERS.length).fill('');
    r[x.TCHK.CHECK_ID] = id; r[x.TCHK.SUBMITTED_AT] = at.toISOString(); r[x.TCHK.GOOGLE_ID] = who;
    r[x.TCHK.STUDENT_CONFIG_ID] = 'WS-' + who; r[x.TCHK.STATUS] = status; r[x.TCHK.ANSWER] = 'my answer words';
    tc.appendRow(r);
  };
  chk('TIC-1', AT(26, 9), 's1@x', 'ADDRESSES');
  chk('TIC-2', AT(26, 10), 's2@x', 'NOT_YET');
  chk('TIC-3', AT(26, 11), 's3@x', 'CHECK_FAILED');
  chk('TIC-4', AT(27, 9), 's4@x', 'CHECK_FAILED');
  chk('TIC-5', MINS_AGO(5), 's5@x', 'PENDING_CHECK');
  chk('TIC-6', MINS_AGO(5), 's6@x', 'PENDING_CHECK'); // not sent yet
  chk('TIC-7', AT(12, 9), 's7@x', 'ADDRESSES'); // its rows are pruned
  const tin = ss.insertSheet('TurnInCheckInput');
  tin.appendRow(x.TIC_INPUT_HEADERS);
  const ti = (at, id, status, n) => tin.appendRow([at, id, status, n, '(removed after the check)']);
  ti(AT(26, 9), 'TIC-1', 'CONSUMED', 1);
  ti(AT(26, 10), 'TIC-2', 'RETRIED', 1); ti(AT(26, 10, 10), 'TIC-2', 'CONSUMED', 2);
  ti(AT(26, 11), 'TIC-3', 'FAILED', 1);
  ti(AT(27, 9), 'TIC-4', 'RETRIED', 1); ti(AT(27, 9, 10), 'TIC-4', 'RETRIED', 2); ti(AT(27, 9, 20), 'TIC-4', 'FAILED', 3);
  ti(MINS_AGO(4), 'TIC-5', 'READY', 1);
  ti(AT(27, 14), 'TIC-FIXTURE-20261027', 'CONSUMED', 1);
  const tr = ss.insertSheet('TurnInCheckReturn');
  tr.appendRow(x.TIC_RETURN_HEADERS);
  tr.appendRow([AT(26, 9, 3), 'TIC-1', 'VERDICT: ADDRESSES\nREASON: ok', 'APPLIED', '', AT(26, 9, 4)]);
  tr.appendRow([AT(26, 10, 15), 'TIC-2', 'VERDICT: NOT_YET\nREASON: ok', 'APPLIED', '', AT(26, 10, 16)]);
  tr.appendRow([AT(26, 11, 2), 'TIC-3', 'nonsense', 'SET_ASIDE', 'GARBLED: SHAPE', AT(26, 11, 3)]);
  const codes = ss.insertSheet('TurnInCodes');
  codes.appendRow(x.TURN_IN_CODE_HEADERS);
  const code = (at, how) => {
    const r = new Array(x.TURN_IN_CODE_HEADERS.length).fill('');
    r[x.TCODE.CODE] = 'CAS-8177-L05-AAAA-BBBB'; r[x.TCODE.ISSUED_AT] = at.toISOString(); r[x.TCODE.HOW] = how;
    codes.appendRow(r);
  };
  code(AT(26, 9, 4), 'CHECK'); code(AT(27), 'CHECK'); code(AT(27, 15), 'GRANT');
  return env;
}

const rowsBy = (env, rows) => Object.fromEntries(rows.map((r) =>
  [r[0] + ' ' + r[1].split(' ').slice(0, 2).join(' '), Object.fromEntries(env.exported.FM_HEADERS.map((h, i) => [h, r[i]]))]));

test('Flow 1: sent, returned, never returned past the watchdog\'s 30 minutes; applied and wait not recorded', () => {
  const env = load();
  const m = rowsBy(env, env.exported.evaluationHealth_({ now: NOW }).flowRows)['2026-10-26 Flow 1'];
  assert.equal(m.Sent, 4);
  assert.equal(m.Runs, 4);
  assert.equal(m.Returned, 1);
  assert.equal(m.NeverReturned, 2, 'STUDIO_TIMEOUT, and one PENDING past 30 minutes');
  assert.equal(m.Waiting, 1);
  assert.equal(m.Applied, '—', 'Studio writes the TeacherMatrix itself');
  assert.equal(m.SetAside, '—');
  assert.equal(m.WaitMedianMin, '—', 'no return time is kept: unknown, not zero');
  assert.equal(m.Retries, '', 'no retry path');
  assert.equal(m.FailureRate, 0.5);
});

test('Flow 2: per FlowInput row, with the wait to the harvest; fixtures and unsent rows are not jobs', () => {
  const env = load();
  const m = rowsBy(env, env.exported.evaluationHealth_({ now: NOW }).flowRows)['2026-10-26 Flow 2'];
  assert.equal(m.Sent, 5);
  assert.equal(m.Returned, 3);
  assert.equal(m.Applied, 1);
  assert.equal(m.SetAside, 1, 'ERROR_EMPTY_OUTPUT');
  assert.equal(m.NeverReturned, 1, 'READY past 30 minutes');
  assert.equal(m.Waiting, 2, 'READY within 30 minutes, and EVALUATED waiting on the harvest');
  assert.equal(m.FailureRate, 0.4);
  assert.equal(m.WaitMedianMin, 7);
  assert.equal(m.WaitSlowestTenthMin, 12);
  assert.equal(m.WaitFrom, 'sent to harvested');
  assert.match(m.Note, /return isn't stamped/);
});

test('Flow 3: retries, the teacher\'s-question fallback, set aside, never returned, the wait', () => {
  const env = load();
  const rows = rowsBy(env, env.exported.evaluationHealth_({ now: NOW }).flowRows);
  const m = rows['2026-10-26 Flow 3'];
  assert.equal(m.Sent, 6, 'the canary is a run, not a job');
  assert.equal(m.Runs, 10);
  assert.equal(m.Retries, 4);
  assert.equal(m.Returned, 3);
  assert.equal(m.Applied, 1);
  assert.equal(m.SetAside, 2, 'junk output sent as the anchor, and a FAILED harvest');
  assert.equal(m.NeverReturned, 2, 'the no-return fallback, and retries run out');
  assert.equal(m.Waiting, 1);
  assert.equal(m.Fallback, 2, 'warm-ups that went out as the teacher\'s own question');
  assert.equal(m.FailureRate, 0.667);
  assert.equal(m.WaitMedianMin, 6);
  assert.equal(m.WaitSlowestTenthMin, 10);
  assert.equal(rows['2026-10-26 Flow 4'].Applied, 1);
  assert.equal(rows['2026-10-26 Flow 4'].WaitMedianMin, 20);
  // Two weeks back, the harvested returns are deleted: sends only.
  const old = rows['2026-10-12 Flow 3'];
  assert.equal(old.Sent, 1);
  assert.equal(old.Runs, 1);
  ['Returned', 'Applied', 'SetAside', 'NeverReturned', 'Fallback', 'WaitMedianMin', 'FailureRate'].forEach((h) =>
    assert.equal(old[h], '—', h + ' is unknown, not zero'));
});

test('Flow 6: engagement counts, verdicts, codes by check and by grant; the screen is not recorded', () => {
  const env = load();
  const rows = rowsBy(env, env.exported.evaluationHealth_({ now: NOW }).flowRows);
  const m = rows['2026-10-26 Flow 6'];
  assert.equal(m.Kind, 'engagement (not learning evidence)');
  assert.equal(m.Sent, 5, 'the answer not sent yet and the fixture are not counted');
  assert.equal(m.Runs, 8);
  assert.equal(m.Retries, 3);
  assert.equal(m.Returned, 3);
  assert.equal(m.Applied, 2);
  assert.equal(m.Addresses, 1);
  assert.equal(m.NotYet, 1);
  assert.equal(m.CheckFailed, 2);
  assert.equal(m.SetAside, 1, 'garbled, then CHECK_FAILED');
  assert.equal(m.NeverReturned, 1);
  assert.equal(m.Waiting, 1);
  assert.equal(m.FailureRate, 0.4);
  assert.equal(m.CodesByCheck, 2);
  assert.equal(m.CodesByGrant, 1);
  assert.equal(m.Screened, '—', 'refused in the Student Dashboard\'s project, never written');
  assert.equal(m.WaitMedianMin, 3);
  const old = rows['2026-10-12 Flow 6'];
  assert.equal(old.Sent, 1);
  assert.equal(old.Applied, 1, 'TurnInChecks is the record, kept');
  assert.equal(old.Runs, '—', 'its input rows are deleted after 14 days');
  assert.equal(old.NeverReturned, '—');
});

test('Studio runs per day: every input row, fixtures included, the last 14 days', () => {
  const env = load();
  const { runs } = env.exported.evaluationHealth_({ now: NOW });
  assert.equal(runs.days.length, 14);
  assert.equal(runs.days[13].day, '2026-10-28');
  const day = (d) => runs.days.find((x) => x.day === d).runs;
  // 10-27: RubricQueue 1, FlowInput 4 (b, c, e, the fixture), Flow3Input 6, Flow5Input 1, TurnInCheckInput 4.
  assert.equal(day('2026-10-27'), 16);
  assert.equal(runs.busiest.day, '2026-10-27');
  assert.equal(runs.days.some((x) => x.day === '2026-10-12'), false, 'older than 14 days');
  assert.equal(runs.limit, null);
});

function runsOnly(limit) {
  const env = base();
  if (limit !== undefined) env.props.setProperty('STUDIO_DAILY_RUN_LIMIT', limit);
  const f3 = env.ss.insertSheet('Flow3Input');
  f3.appendRow(['Timestamp', 'QueueID', 'Status']);
  for (let i = 0; i < 9; i++) f3.appendRow([AT(27, 8, i), 'R' + i, 'CONSUMED']);
  f3.appendRow([AT(20), 'R10', 'CONSUMED']);
  f3.appendRow([AT(8), 'R11', 'CONSUMED']);
  return env.exported.evaluationHealth_({ now: NOW });
}

test('the limit unset: said so, never guessed', () => {
  const out = runsOnly();
  assert.match(out.flowLine, /Studio runs \(CAS flows\), last 14 days: busiest 2026-10-27 with 9; limit not set — set STUDIO_DAILY_RUN_LIMIT from Workspace Studio's quota\./);
  assert.match(runsOnly('lots').flowLine, /STUDIO_DAILY_RUN_LIMIT is not a whole number/);
});

test('a day at 80% of the limit warns in the email line; under it, the share', () => {
  const warned = runsOnly('10');
  assert.match(warned.flowLine, /WARNING: 1 day at 80% or more of Studio's daily limit, latest 2026-10-27 \(9 of 10\)\./);
  const fine = runsOnly('20');
  assert.doesNotMatch(fine.flowLine, /WARNING/);
  assert.match(fine.flowLine, /busiest 2026-10-27 with 9 of a 20 daily limit \(45%\)\./);
});

test('the email\'s second line: flows over the bar or with jobs never returned, Flow 6 as engagement', () => {
  const env = load();
  const out = env.exported.evaluationHealth_({ now: NOW });
  assert.equal(out.flowLine,
    'Other flows this week: Flow 1 2 of 4 never returned (50%); ' +
    'Flow 3 2 of 6 never returned, 2 set aside (66.7%), 2 sent as the teacher\'s own question; ' +
    'Flow 6 1 of 5 never returned, 1 set aside (40%); ' +
    'Flow 6 engagement (not learning evidence): 5 answers checked, 1 addresses, 1 not yet, 2 check failed. ' +
    'Studio runs (CAS flows), last 14 days: busiest 2026-10-27 with 16; limit not set — set STUDIO_DAILY_RUN_LIMIT from Workspace Studio\'s quota.');
  assert.equal(out.flowLine.split('\n').length, 1, 'one line');
  assert.match(out.line, /^Flow 2, week of 2026-10-26: /, 'Flow 2 keeps its own line');
  assert.match(out.line, /D8's bar is under 5%/);
  assert.equal(env.exported.EH_D8_FAILURE_BAR, 0.05, 'D8\'s bar unchanged');
});

test('a quiet week: one short line', () => {
  const out = base().exported.evaluationHealth_({ now: NOW });
  assert.equal(out.flowLine, 'Other flows this week: no other flow over 1 in 20 failed or left a job unreturned. ' +
    'Studio runs (CAS flows), last 14 days: none; limit not set — set STUDIO_DAILY_RUN_LIMIT from Workspace Studio\'s quota.');
  assert.deepEqual(out.flowRows, []);
});

test('reportEvaluationHealth rewrites FlowMeasures, and nothing identifying leaves the tabs or the lines', () => {
  const env = load();
  const logged = [];
  env.sandbox.Logger.log = (m) => { logged.push(String(m)); };
  const out = env.exported.reportEvaluationHealth();
  const tab = env.ss.getSheetByName('FlowMeasures').getDataRange().getValues();
  assert.deepEqual(tab[0], env.exported.FM_HEADERS);
  assert.equal(tab.length, out.flowRows.length + 1);
  env.exported.reportEvaluationHealth();
  assert.equal(env.ss.getSheetByName('FlowMeasures').getDataRange().getValues().length, tab.length, 'rewritten, not appended');
  assert.ok(logged.some((l) => /Flow=Flow 6 turn-in check Kind=engagement/.test(l)), 'the per-flow table is logged');
  assert.ok(logged.some((l) => /Studio runs per day \(CAS flows\): .*2026-10-27=16/.test(l)));
  const text = JSON.stringify(tab) + out.line + out.flowLine + logged.join('\n');
  assert.doesNotMatch(text, /file-|CFG-|Q\d|TIC-|WUQ-|VDOE-|@|my answer|CAS-8177|SECRET|a warm-up/);
});
