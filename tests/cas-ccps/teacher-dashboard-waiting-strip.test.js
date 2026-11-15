'use strict';
// The Teacher Dashboard's waiting strip (2026-11-14, the operator's "Build
// 1-4", item 4): "n students waiting over 10 minutes", each of this
// teacher's own students listed with "Give a code" (the Turn-in codes
// panel's existing grant), and a light per checker (Flow 2, Flow 6) that is
// red when it has work but no verdict came back for 10 minutes. Pins: only
// the configured teacher gets it; other teachers' students never appear;
// fixture and canary rows don't count; the light is red only when the
// oldest work and the silence are both 10 minutes old; the page asks once a
// minute only while in view.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');
const ALLOW = require('../../tools/gas-lint/webapp-public-allow.json');

const TEACHER = 'teacher@example.com'; // the sandbox's default signed-in user
const PROJECT_FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:teacher-dashboard'].files
  .map((f) => path.join(__dirname, '..', '..', f));
const MIN = 60 * 1000;

function load(viewer) {
  const extra = viewer === undefined ? {} : { Session: {
    getActiveUser() { return { getEmail() { return viewer; } }; },
    getEffectiveUser() { return { getEmail() { return TEACHER; } }; },
    getScriptTimeZone() { return 'America/New_York'; } } };
  const env = loadGasFiles(PROJECT_FILES, ['getWaitingStrip', 'buildDashboardHtml_', 'LEDGER', 'TURN_IN_CHECK_HEADERS',
    'TCHK'], extra);
  const { sandbox, exported: x } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const now = Date.now();
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const row = (name, configId, status, submittedMinAgo, teacher) => {
    const r = new Array(27).fill('');
    r[x.LEDGER.TIMESTAMP] = new Date(); r[x.LEDGER.GOOGLE_ID] = name.toLowerCase() + '@ccpsnet.net';
    r[x.LEDGER.CONFIG_ID] = configId; r[x.LEDGER.FILE_ID] = 'f-' + configId; r[x.LEDGER.STUDENT_NAME] = name;
    r[x.LEDGER.TEACHER_EMAIL] = teacher || TEACHER; r[x.LEDGER.STATUS] = status; r[x.LEDGER.PERIOD] = '3';
    r[x.LEDGER.COURSE_NAME] = 'Lesson ' + configId;
    r[x.LEDGER.SUBMISSION_TS] = submittedMinAgo === null ? '' : new Date(now - submittedMinAgo * MIN);
    ledger.appendRow(r);
  };
  row('Amy', 'A1', 'ACTIVE', 14);            // being checked, 14 min since Submit
  row('Bo', 'B1', 'ACTIVE', 3);              // in ReviewQueue, 3 min
  row('Cy', 'C1', 'ERROR_TIMEOUT', 40);      // stopped today
  row('Di', 'D1', 'COMPLETE', 30);           // done: not waiting
  row('Ed', 'E1', 'ACTIVE', 50, 'other@example.com'); // another teacher's student
  row('Fa', 'F1', 'COMPLETE', 90);           // a turn-in answer waiting
  const staging = ss.insertSheet('STAGING_PIPELINE');
  staging.appendRow(['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  staging.appendRow([new Date(now - 12 * MIN), '2', 'f-A1', 'A1', TEACHER, 'IN_PROCESS']);
  staging.appendRow([new Date(now - 30 * MIN), '4', 'f-C1', 'C1', TEACHER, 'ERROR_TIMEOUT']);
  staging.appendRow([new Date(now - 45 * MIN), '5', 'f-E1', 'E1', 'other@example.com', 'IN_PROCESS']);
  staging.appendRow([new Date(now - 90 * MIN), '6', 'f-FIX', 'VDOE-FIXTURE-1', TEACHER, 'IN_PROCESS']);
  const queue = ss.insertSheet('ReviewQueue');
  queue.appendRow(['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'Text', 'Status', 'x']);
  queue.appendRow([new Date(), 'bo@ccpsnet.net', 'f-B1', 'B1', '', 'PENDING', '']);
  const log = ss.insertSheet('EvaluationLog');
  log.appendRow(['EvaluatedAt', 'ConfigID', 'StudentFileID', 'Attempt', 'Result', 'SubmittedAt', 'WaitMinutes', 'SuggestedScore']);
  log.appendRow([new Date(now - 25 * MIN), 'D1', 'f-D1', 1, 'PASSED', '', 5, '']);
  log.appendRow([new Date(now - 1 * MIN), 'CAS-CANARY-1', 'f-x', 1, 'PASSED', '', 1, '']); // a canary: not a verdict
  const checks = ss.insertSheet('TurnInChecks');
  checks.appendRow(x.TURN_IN_CHECK_HEADERS);
  const chk = (configId, status, submittedMinAgo, decidedMinAgo) => {
    const r = new Array(x.TURN_IN_CHECK_HEADERS.length).fill('');
    r[x.TCHK.CHECK_ID] = 'TIC-' + configId; r[x.TCHK.STUDENT_CONFIG_ID] = configId; r[x.TCHK.STATUS] = status;
    r[x.TCHK.SUBMITTED_AT] = new Date(now - submittedMinAgo * MIN).toISOString();
    r[x.TCHK.DECIDED_AT] = decidedMinAgo === undefined ? '' : new Date(now - decidedMinAgo * MIN).toISOString();
    checks.appendRow(r);
  };
  chk('F1', 'PENDING_CHECK', 12);
  chk('D1', 'ADDRESSES', 60, 3);
  return Object.assign(env, { ss, props, staging, log, checks, now });
}

const plain = (v) => JSON.parse(JSON.stringify(v));

test('the strip: this teacher\'s students waiting over 10 minutes, longest first, with the checkers\' lights', () => {
  const env = load();
  const d = plain(env.exported.getWaitingStrip());
  assert.equal(d.success, true);
  assert.equal(d.overMin, 10);
  assert.deepEqual(d.over.map((w) => [w.name, w.kind, w.stopped, w.minutes]),
    [['Cy', 'feedback', true, 40], ['Amy', 'feedback', false, 14], ['Fa', 'turnIn', false, 12]]);
  assert.equal(d.waitingCount, 4, 'Bo waits 3 minutes: counted, not over');
  assert.ok(!JSON.stringify(d).includes('Ed'), 'another teacher\'s student never appears');
  assert.deepEqual(d.over[1], { name: 'Amy', googleId: 'amy@ccpsnet.net', configId: 'A1', assignment: 'Lesson A1',
    period: '3', kind: 'feedback', stopped: false, minutes: 14 });
  // Flow 2: work 12 (and 45) minutes old, the last real verdict 25 minutes ago
  // (the canary's a minute ago doesn't count): red. Flow 6: a verdict 3 minutes ago: ok.
  assert.equal(d.health.flow2.state, 'red');
  assert.equal(d.health.flow2.work, 2, 'every teacher\'s rows: Flow 2 is shared; the fixture\'s is left out');
  assert.equal(d.health.flow2.lastVerdictMin, 25);
  assert.equal(d.health.flow6.state, 'ok');
  assert.equal(d.health.flow6.lastVerdictMin, 3);
});

test('a light is red only when the oldest work and the silence are both 10 minutes old', () => {
  const recent = load();
  recent.log.appendRow([new Date(recent.now - 4 * MIN), 'X1', 'f-X1', 1, 'NEEDS_REVISION', '', 3, '']);
  assert.equal(plain(recent.exported.getWaitingStrip()).health.flow2.state, 'ok', 'a verdict 4 minutes ago');

  const fresh = load();
  fresh.staging.getRange(2, 6).setValue('COMPLETE');
  fresh.staging.getRange(4, 6).setValue('COMPLETE');
  fresh.staging.appendRow([new Date(fresh.now - 2 * MIN), '7', 'f-Z', 'Z1', TEACHER, 'IN_PROCESS']);
  assert.equal(plain(fresh.exported.getWaitingStrip()).health.flow2.state, 'ok',
    'a quiet hour, then one new check: not red until it has waited 10 minutes');

  const idle = load();
  [2, 4, 5].forEach((r) => idle.staging.getRange(r, 6).setValue('COMPLETE'));
  idle.checks.getRange(2, idle.exported.TCHK.STATUS + 1).setValue('NOT_YET');
  const h = plain(idle.exported.getWaitingStrip()).health;
  assert.equal(h.flow2.state, 'idle');
  assert.equal(h.flow6.state, 'idle');

  const quiet6 = load();
  quiet6.checks.getRange(3, quiet6.exported.TCHK.DECIDED_AT + 1).setValue(new Date(quiet6.now - 30 * MIN).toISOString());
  assert.equal(plain(quiet6.exported.getWaitingStrip()).health.flow6.state, 'red');
});

test('only the configured teacher gets the strip; it isn\'t on the public allowlist', () => {
  const env = load('student@ccpsnet.net');
  assert.deepEqual(plain(env.exported.getWaitingStrip()), { success: false, error: 'Not authorized.' });
  assert.equal(Object.prototype.hasOwnProperty.call(ALLOW['cas-ccps:teacher-dashboard'], 'getWaitingStrip'), false);
});

// ── The page ───────────────────────────────────────────────────────────────

function page(env) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', textContent: '', value: '', hidden: true,
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, addEventListener() {}, focus() {},
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, querySelectorAll: () => [], querySelector: () => null,
    contains() { return false; } });
  const calls = [];
  let timers = [];
  let now = 0;
  const listeners = {};
  const run = new Proxy({}, {
    get(_, name) {
      if (name === 'withSuccessHandler' || name === 'withFailureHandler') {
        return function (f) { const r = Object.create(this); r['_' + name] = f; return r; };
      }
      return function (...args) { calls.push({ name, args, ok: this._withSuccessHandler, fail: this._withFailureHandler }); };
    },
  });
  const document = { getElementById: el, querySelectorAll: () => [], querySelector: () => null, createElement: () => el('x'),
    body: el('body'), visibilityState: 'visible', activeElement: null,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); } };
  const ctx = { document, google: { script: { run } }, console, navigator: {}, location: {},
    setTimeout(fn, ms) { const t = { at: now + ms, fn }; timers.push(t); return t; },
    clearTimeout(t) { timers = timers.filter((x) => x !== t); }, setInterval() {}, addEventListener() {},
    scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(env.exported.buildDashboardHtml_({})).forEach((code) => {
    try { vm.runInContext(code, ctx); } catch (e) { /* page wiring that needs a real DOM */ }
  });
  const advance = (ms) => {
    const until = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.fn();
    }
    now = until;
  };
  const strips = () => calls.filter((c) => c.name === 'getWaitingStrip');
  const fire = (type) => (listeners[type] || []).forEach((f) => f());
  return { ctx, els, calls, strips, advance, fire, document };
}

test('the page: asks at once, then once a minute while in view; the strip lists and links to the grant', () => {
  const env = load();
  const pg = page(env);
  assert.equal(pg.strips().length, 1, 'asked as the page opens');
  pg.strips()[0].ok(plain(env.exported.getWaitingStrip()));
  const h = pg.els['wait-strip'].innerHTML;
  assert.equal(pg.els['wait-strip'].hidden, false);
  assert.match(h, /<b>3 students waiting over 10 minutes<\/b>/);
  assert.match(h, /aria-expanded="false" aria-controls="ws-list"/);
  assert.match(h, /<ul id="ws-list" hidden>/);
  assert.match(h, /Cy · Period 3 · Lesson C1 · 40 min \(check stopped\)<button type="button" data-ws="0" onclick="waitGrant\(this\)">Give a code/);
  assert.match(h, /ws-light ws-red[^>]*><span class="ws-dot" aria-hidden="true"><\/span>Feedback \(Flow 2\): 2 waiting, no answer for 25 min/);
  assert.match(h, /ws-light ws-ok[^>]*>.*Turn-in check \(Flow 6\): 1 being checked/);
  assert.match(pg.els['wait-strip-live'].textContent, /^Feedback checks have work but no answer for 10 minutes/);

  // Give a code: the panel's grant tab, this student and assignment chosen.
  pg.ctx.waitGrant({ getAttribute: () => '1' });
  assert.equal(vm.runInContext('_ticTab', pg.ctx), 'grant');
  assert.deepEqual(plain(vm.runInContext('_ticG', pg.ctx)), { student: 'amy@ccpsnet.net', item: 'A1', reason: '', code: '', msg: null });
  assert.ok(pg.calls.some((c) => c.name === 'getTurnInPanelData'), 'the panel loads');

  pg.advance(60 * 1000);
  assert.equal(pg.strips().length, 2, 'a minute later');
  pg.strips()[1].fail(new Error('network'));
  pg.advance(119 * 1000);
  assert.equal(pg.strips().length, 2, 'after a failure, twice as long');
  pg.advance(1000);
  assert.equal(pg.strips().length, 3);

  // Hidden: nothing scheduled, nothing asked; shown again: asked at once.
  pg.strips()[2].ok(plain(env.exported.getWaitingStrip()));
  pg.document.visibilityState = 'hidden';
  pg.fire('visibilitychange');
  pg.advance(30 * 60 * 1000);
  assert.equal(pg.strips().length, 3);
  pg.document.visibilityState = 'visible';
  pg.fire('visibilitychange');
  assert.equal(pg.strips().length, 4);
});

// 2026-11-15: an answer the Ledger's harvest (37) found copied into another
// submission's row this week shows on the Flow 2 light, read from the
// Flow2Duplicates tab (dates only), since this project can't call 37.
test('the Flow 2 light says when an answer was copied into another submission this week', () => {
  const env = load();
  assert.equal(plain(env.exported.getWaitingStrip()).health.flow2.duplicates, 0, 'no tab: nothing to say');
  const tab = env.ss.insertSheet('Flow2Duplicates');
  tab.appendRow(['DetectedAt', 'EarlierBuiltAt', 'NewerBuiltAt', 'EarlierStatus']);
  tab.appendRow([new Date(env.now - 9 * 24 * 60 * MIN), '', '', 'HARVESTED']); // older than a week
  tab.appendRow([new Date(env.now - 60 * MIN), new Date(env.now - 120 * MIN), new Date(env.now - 61 * MIN), 'EVALUATED']);
  assert.equal(plain(env.exported.getWaitingStrip()).health.flow2.duplicates, 1);
  const html = env.exported.buildDashboardHtml_();
  assert.match(html, /match on StagingRowRef/);
});
