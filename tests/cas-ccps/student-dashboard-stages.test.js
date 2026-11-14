'use strict';
// Where the work is (2026-11-14, the operator's "Build 1-4", item 3): a
// waiting card's stage line (Submitted → In line → Being checked →
// Feedback ready) with only the times the sheets hold, "usually about N min"
// only from FlowMeasures' measured Flow 2 median, and "Try again" on a check
// that timed out: the student's own row only, only at ERROR_TIMEOUT, once
// per 10 minutes per card (server-enforced), through the admin's re-queue
// (the staging row back to PENDING_INFERENCE), never a new queue or staging
// row, so 37 builds no duplicate FlowInput row.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');
const ALLOW = require('../../tools/gas-lint/webapp-public-allow.json');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const SD = ['00_SharedConfig.js', '00b_ScriptOwnerGuard.js', '13_StudentDashboard.js', '13b_StudentDashboardDemoLessons.js',
  '13c_StudentDashboardLessons.js', '13d_StudentDashboardReview.js', '63_DocHeader.js', '71_TurnInCodes.js',
  '71b_TurnInStudent.js'].map(S);
const AMY = 'amy@ccpsnet.net';
const BO = 'bo@ccpsnet.net';
const MIN = 60 * 1000;

function session(viewer) {
  return {
    getActiveUser() { return { getEmail() { return viewer; } }; },
    getEffectiveUser() { return { getEmail() { return 'admin@ccpsnet.net'; } }; },
    getScriptTimeZone() { return 'America/New_York'; },
  };
}

// A Ledger with Amy's and Bo's rows; staging and queue as given.
// ss: share another sandbox's spreadsheet (the Central Ledger's).
function dash(viewer, opts = {}) {
  const env = loadGasFiles(SD, ['getStudentDashboardData', 'getMyWaitingStatus', 'retryMyCheck', 'LEDGER',
    'buildStudentDashboardHtml_'], { Session: session(viewer) });
  const { sandbox, exported: x } = env;
  let ss = opts.ss;
  if (ss) sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  else ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  return Object.assign(env, { ss, props, x });
}

function fixture(env) {
  const { ss, x } = env;
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const row = (who, configId, status, submitted) => {
    const r = new Array(27).fill('');
    r[x.LEDGER.TIMESTAMP] = new Date(); r[x.LEDGER.GOOGLE_ID] = who; r[x.LEDGER.CONFIG_ID] = configId;
    r[x.LEDGER.FILE_ID] = 'f-' + configId; r[x.LEDGER.STATUS] = status;
    r[x.LEDGER.SUBMISSION_TS] = submitted || '';
    ledger.appendRow(r);
  };
  const now = Date.now();
  row(AMY, 'A1', 'ACTIVE', new Date(now - 6 * MIN));   // in line, staged
  row(AMY, 'A2', 'ACTIVE', new Date(now - 9 * MIN));   // being checked
  row(AMY, 'A3', 'ACTIVE', new Date(now - 1 * MIN));   // in ReviewQueue, not yet bridged
  row(AMY, 'A4', 'ERROR_TIMEOUT', new Date(now - 30 * MIN));
  row(BO, 'B4', 'ERROR_TIMEOUT', new Date(now - 30 * MIN));
  const staging = ss.insertSheet('STAGING_PIPELINE');
  staging.appendRow(['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  staging.appendRow([new Date(now - 5 * MIN), '2', 'f-A1', 'A1', 't@x', 'PENDING_INFERENCE']);
  staging.appendRow([new Date(now - 4 * MIN), '3', 'f-A2', 'A2', 't@x', 'IN_PROCESS']);
  staging.appendRow([new Date(now - 18 * MIN), '5', 'f-A4', 'A4', 't@x', 'ERROR_TIMEOUT']);
  staging.appendRow([new Date(now - 18 * MIN), '6', 'f-B4', 'B4', 't@x', 'ERROR_TIMEOUT']);
  const queue = ss.insertSheet('ReviewQueue');
  queue.appendRow(['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'Text', 'Status', 'x']);
  queue.appendRow([new Date(), AMY, 'f-A1', 'A1', '', 'STAGED', '']);
  queue.appendRow([new Date(), AMY, 'f-A2', 'A2', '', 'STAGED', '']);
  queue.appendRow([new Date(), AMY, 'f-A3', 'A3', '', 'PENDING', '']);
  queue.appendRow([new Date(), AMY, 'f-A4', 'A4', '', 'ERROR_TIMEOUT', '']);
  queue.appendRow([new Date(), BO, 'f-B4', 'B4', '', 'ERROR_TIMEOUT', '']);
  return { staging, queue, ledger };
}

function flowMeasures(ss, rows) {
  const fm = ss.insertSheet('FlowMeasures');
  fm.appendRow(['WeekOf', 'Flow', 'Kind', 'Sent', 'Runs', 'Retries', 'Returned', 'Applied', 'SetAside', 'NeverReturned',
    'Waiting', 'FailureRate', 'WaitMedianMin']);
  rows.forEach((r) => fm.appendRow([r[0], r[1], 'reliability', r[2], '', '', '', '', '', '', '', '', r[3]]));
}

test('the stage line: Submitted, then In line or Being checked, with the times the sheets hold', () => {
  const env = dash(AMY);
  fixture(env);
  const by = Object.fromEntries(env.x.getStudentDashboardData().assignments.map((a) => [a.configId, a]));
  const a1 = by.A1.stages, a2 = by.A2.stages, a3 = by.A3.stages;
  assert.equal(a1.current, 'IN_LINE');
  assert.match(a1.submitted, /^\d{1,2}:\d\d [AP]M$/, 'today: the time only');
  assert.match(a1.inLine, /^\d{1,2}:\d\d [AP]M$/, 'the bridge\'s stamp');
  assert.equal(a1.checking, '');
  assert.equal(a2.current, 'CHECKING');
  assert.match(a2.checking, /^\d{1,2}:\d\d [AP]M$/, 'the turnstile\'s stamp');
  assert.ok(Date.now() - a2.since >= 4 * MIN - 1000 && Date.now() - a2.since < 5 * MIN);
  assert.equal(a3.current, 'IN_LINE');
  assert.equal(a3.inLine, '', 'in ReviewQueue, not yet bridged: in line, with no time to show');
  assert.equal(a2.usualMin, null, 'no FlowMeasures: no estimate');
  assert.equal(by.A4.stages, null, 'not waiting: no stage line');
  assert.equal(by.A4.canRetry, true);
  assert.equal(by.A1.canRetry, false);
});

test('"usually about N min" only from a measured Flow 2 week with enough checks, on Being checked only', () => {
  const env = dash(AMY);
  fixture(env);
  flowMeasures(env.ss, [['2026-11-09', 'Flow 2 evaluation', 12, 4.4], ['2026-11-02', 'Flow 2 evaluation', 40, 9],
    ['2026-11-09', 'Flow 3 warm-up', 50, 2]]);
  const by = Object.fromEntries(env.x.getStudentDashboardData().assignments.map((a) => [a.configId, a]));
  assert.equal(by.A2.stages.usualMin, 4, 'the latest week\'s median, rounded');
  assert.equal(by.A1.stages.usualMin, null, 'In line has no measure, so no estimate');

  const thin = dash(AMY);
  fixture(thin);
  flowMeasures(thin.ss, [['2026-11-09', 'Flow 2 evaluation', 3, 4], ['2026-11-02', 'Flow 2 evaluation', 8, '—']]);
  const t = Object.fromEntries(thin.x.getStudentDashboardData().assignments.map((a) => [a.configId, a]));
  assert.equal(t.A2.stages.usualMin, null, 'too few checks, or "—": no estimate');
});

test('the check for news carries the stage line too', () => {
  const env = dash(AMY);
  fixture(env);
  const c = env.x.getMyWaitingStatus([{ fileId: 'f-A2', configId: 'A2' }]).cards[0];
  assert.equal(c.stages.current, 'CHECKING');
  assert.match(c.stages.checking, /^\d{1,2}:\d\d [AP]M$/);
});

test('Try again: the student\'s own timed-out row goes back in line, in place, once per 10 minutes', () => {
  const env = dash(AMY);
  const { staging, queue } = fixture(env);
  const stagingRows = staging.getLastRow(), queueRows = queue.getLastRow();
  const r = JSON.parse(JSON.stringify(env.x.retryMyCheck('f-A4', 'A4')));
  assert.equal(r.ok, true);
  assert.equal(r.card.waiting, true);
  assert.equal(r.card.statusPill, 'Waiting for feedback');
  assert.equal(staging.getRange(4, 6).getValue(), 'PENDING_INFERENCE', 'the staging row, back in line');
  assert.equal(staging.getLastRow(), stagingRows, 'no new staging row');
  assert.equal(queue.getLastRow(), queueRows, 'no new ReviewQueue row');
  assert.equal(queue.getRange(5, 6).getValue(), 'ERROR_TIMEOUT', 'the queue row is left for 03\'s late-answer path');
  const stamp = env.props.getProperty('DASH_RETRY_AT');
  assert.doesNotMatch(stamp, /@|f-A4|A4/, 'the rate limit keeps a hash, never the account or the file');

  // Back in line: no second retry while it waits.
  assert.equal(env.x.retryMyCheck('f-A4', 'A4').error, 'ALREADY_QUEUED');
  // Timed out again within 10 minutes: refused by the server, with the wait.
  staging.getRange(4, 6).setValue('ERROR_TIMEOUT');
  const soon = env.x.retryMyCheck('f-A4', 'A4');
  assert.equal(soon.error, 'TOO_SOON');
  assert.equal(soon.waitMin, 10);
  assert.equal(staging.getRange(4, 6).getValue(), 'ERROR_TIMEOUT', 'nothing changed');
  // Ten minutes later it may.
  const state = JSON.parse(stamp);
  Object.keys(state).forEach((k) => { state[k] -= 10 * MIN + 1000; });
  env.props.setProperty('DASH_RETRY_AT', JSON.stringify(state));
  assert.equal(env.x.retryMyCheck('f-A4', 'A4').ok, true);
});

test('Try again refuses anyone else\'s row, a row that didn\'t time out, and no account', () => {
  const env = dash(AMY);
  const { staging } = fixture(env);
  assert.equal(env.x.retryMyCheck('f-B4', 'B4').error, 'NOT_REGISTERED', 'Bo\'s row');
  assert.equal(env.x.retryMyCheck('f-A4', 'B4').error, 'NOT_REGISTERED', 'a mismatched pair');
  assert.equal(env.x.retryMyCheck('f-A2', 'A2').error, 'NOT_TIMED_OUT', 'still being checked');
  assert.equal(env.x.retryMyCheck('', 'A4').error, 'BAD_REQUEST');
  assert.equal(staging.getRange(5, 6).getValue(), 'ERROR_TIMEOUT', 'Bo\'s row untouched');
  const none = dash('');
  fixture(none);
  assert.equal(none.x.retryMyCheck('f-A4', 'A4').error, 'NO_USER');
  // A late answer already landed on the staging row: nothing to retry.
  const late = dash(AMY);
  const f = fixture(late);
  f.staging.getRange(4, 6).setValue('COMPLETE');
  assert.equal(late.x.retryMyCheck('f-A4', 'A4').error, 'NOT_TIMED_OUT');
  assert.match(ALLOW['cas-ccps:student-dashboard'].retryMyCheck, /caller's own/);
});

// ── 37 builds no duplicate FlowInput row after a Try again ────────────────

const LEDGER_FILES = ['00_SharedConfig.js', '63_DocHeader.js', '03_QueueBridge.js', '04_Form2_TurnInGate.js',
  '15b_StudioFlowPrompts_Flow2_Revised.js', '15c_Flow2DirectEvaluationService.js', '37_FlowInputBuilder.js',
  '68_LessonParts.js', '40_FlowPrompts.js', '54_StudentAssignments.js', '55b_LessonAssignmentData.js',
  '06_StagingPipeline_Turnstile.js'].map(S);

test('after Try again the turnstile releases the row and 37 restarts the same FlowInput row, never a second', () => {
  const led = loadGasFiles(LEDGER_FILES, ['buildFlowInputRows', 'runStagingTurnstile', 'FI', 'FI_HEADERS', 'LEDGER']);
  const ss = led.sandbox.SpreadsheetApp.create('Central Ledger');
  led.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const lp = led.sandbox.PropertiesService.getScriptProperties();
  lp.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  lp.setProperty('ADMIN_SS_ID', ss.getId());
  const env = dash(AMY, { ss });
  fixture(env);
  ss.insertSheet('MatrixRegistry').appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  // A4's FlowInput row: READY, built 17 minutes ago, restarted once 5 minutes ago (not yet stale).
  const fi = ss.insertSheet('FlowInput');
  fi.appendRow(led.exported.FI_HEADERS);
  const row = new Array(led.exported.FI_HEADERS.length).fill('');
  row[led.exported.FI.TIMESTAMP] = new Date(Date.now() - 17 * MIN);
  row[led.exported.FI.STUDENT_FILE_ID] = 'f-A4';
  row[led.exported.FI.CONFIG_ID] = 'A4';
  row[led.exported.FI.STAGING_ROW_REF] = 4;
  row[led.exported.FI.PROMPT_TEXT] = 'prompt';
  row[led.exported.FI.READY_STATUS] = 'READY';
  row[led.exported.FI.REARMS] = 1;
  row[led.exported.FI.ARMED_AT] = new Date(Date.now() - 5 * MIN);
  fi.appendRow(row);

  assert.equal(env.x.retryMyCheck('f-A4', 'A4').ok, true);
  led.exported.runStagingTurnstile();
  assert.equal(ss.getSheetByName('STAGING_PIPELINE').getRange(4, 6).getValue(), 'IN_PROCESS', 'released and stamped');
  led.exported.buildFlowInputRows();
  led.exported.buildFlowInputRows();
  assert.equal(fi.getLastRow(), 2, 'the same FlowInput row, not a second');
  assert.equal(fi.getRange(2, led.exported.FI.READY_STATUS + 1).getValue(), 'READY', 'restarted: a fresh Studio run');
  assert.equal(fi.getRange(2, led.exported.FI.REARMS + 1).getValue(), 0, 'its count starts again, as for an admin re-queue');
});

// ── The page ───────────────────────────────────────────────────────────────

function page(env) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', textContent: '', value: '', options: [],
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, classList: { add() {}, remove() {} },
    scrollIntoView() {}, focus() {} });
  const calls = [];
  const run = new Proxy({}, {
    get(_, name) {
      if (name === 'withSuccessHandler' || name === 'withFailureHandler') {
        return function (f) { const r = Object.create(this); r['_' + name] = f; return r; };
      }
      return function (...args) { calls.push({ name, args, ok: this._withSuccessHandler }); };
    },
  });
  const ctx = {
    document: { getElementById: el, querySelectorAll: () => [], createElement: () => el('x'), addEventListener() {},
      visibilityState: 'visible', title: 't' },
    google: { script: { run } }, console, navigator: {}, setTimeout() {}, clearTimeout() {}, setInterval() {},
    scrollTo() {}, addEventListener() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(env.x.buildStudentDashboardHtml_({ demo: false })).forEach((code) => vm.runInContext(code, ctx));
  return { ctx, els, calls };
}

test('the page: the stage line on a waiting card, Try again as the one filled button on a stopped one', () => {
  const env = dash(AMY);
  fixture(env);
  flowMeasures(env.ss, [['2026-11-09', 'Flow 2 evaluation', 12, 4]]);
  const data = JSON.parse(JSON.stringify(env.x.getStudentDashboardData()));
  const by = Object.fromEntries(data.assignments.map((a) => [a.configId, a]));
  const { ctx, calls } = page(env);
  const a2 = ctx.cardHtml(by.A2);
  assert.match(a2, /<ol class="stages" aria-label="Where your work is">/);
  assert.match(a2, /<li class="done">✓ Submitted<span class="st-time">\d{1,2}:\d\d [AP]M<\/span><\/li>/);
  assert.match(a2, /<li class="done">✓ In line<\/li>/);
  assert.match(a2, /<li class="now" aria-current="step">Being checked<span class="st-time">\d{1,2}:\d\d [AP]M<\/span><\/li>/);
  assert.match(a2, /<li>Feedback ready<\/li>/);
  assert.doesNotMatch(a2, /Check again/, 'not slow yet');
  // Waiting with the usual time, before its own time is stamped.
  const noStamp = Object.assign({}, by.A2, { stages: Object.assign({}, by.A2.stages, { checking: '' }) });
  assert.match(ctx.cardHtml(noStamp), /Being checked<span class="st-time">usually about 4 min<\/span>/);
  // Slow: Check again, a status check only.
  const slow = Object.assign({}, by.A2, { stages: Object.assign({}, by.A2.stages, { since: Date.now() - 9 * MIN }) });
  assert.match(ctx.cardHtml(slow), /Taking a while\. Your work is saved\. <button[^>]*onclick="checkAgain\(this\)">Check again/);

  const a4 = ctx.cardHtml(by.A4);
  assert.match(a4, />Check stopped ⚠</);
  assert.match(a4, /Press Try again to put it back in line/);
  const filled = [...a4.matchAll(/class="act act-primary[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(filled, ['Try again'], 'Try again is the one filled button');
  assert.doesNotMatch(a4, /your teacher knows/);

  // Pressing it: through scriptRun, then the card waits again.
  vm.runInContext('_lastDashData = ' + JSON.stringify(data), ctx);
  ctx.retryCheck({ getAttribute: (k) => ({ 'data-file': 'f-A4', 'data-config': 'A4' })[k], textContent: '' });
  const call = calls.find((c) => c.name === 'retryMyCheck');
  assert.deepEqual(call.args, ['f-A4', 'A4']);
  call.ok(JSON.parse(JSON.stringify(env.x.retryMyCheck('f-A4', 'A4'))));
  const card = vm.runInContext('_lastDashData.assignments.find(a => a.configId === "A4")', ctx);
  assert.equal(card.waiting, true);
  assert.equal(card.statusPill, 'Waiting for feedback');
  assert.match(vm.runInContext('_submitMsgs["f-A4"].text', ctx), /^Back in line/);
  ctx.retryDone('f-A4', 'A4', { ok: false, error: 'TOO_SOON', waitMin: 7 });
  assert.match(vm.runInContext('_submitMsgs["f-A4"].text', ctx), /try again in 7 min/);
});
