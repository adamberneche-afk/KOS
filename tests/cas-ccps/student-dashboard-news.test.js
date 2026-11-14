'use strict';
// The Student Dashboard checks for news (2026-11-14, the operator's "Build
// 1-4", item 2): while a card waits (in line, being checked, or a turn-in
// answer being checked) the page asks getMyWaitingStatus about those cards
// only, every 20 to 40 seconds while it is in view, and stops when nothing
// waits. Pins: the callable answers only for the caller's own rows (the
// submit path's three-way match) and reads no more than the Ledger and the
// shared, cached queue state; the page polls only while visible and while
// something waits, backs off on errors and stops at a cap; a finished card
// is loaded once and re-rendered, with a polite banner, a changed title
// until the page is used, and a scroll unless the student is typing; the
// demo answers from its stubs; the turn-in code is large with a Copy button.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');
const ALLOW = require('../../tools/gas-lint/webapp-public-allow.json');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '00b_ScriptOwnerGuard.js', '13_StudentDashboard.js', '13b_StudentDashboardDemoLessons.js',
  '13c_StudentDashboardLessons.js', '13d_StudentDashboardReview.js', '63_DocHeader.js', '71_TurnInCodes.js',
  '71b_TurnInStudent.js'].map(S);
const AMY = 'amy@ccpsnet.net';
const BO = 'bo@ccpsnet.net';

// ── The callable ───────────────────────────────────────────────────────────

function server(viewer) {
  const session = {
    getActiveUser() { return { getEmail() { return viewer; } }; },
    getEffectiveUser() { return { getEmail() { return 'admin@ccpsnet.net'; } }; },
    getScriptTimeZone() { return 'America/New_York'; },
  };
  const env = loadGasFiles(FILES, ['getMyWaitingStatus', 'getStudentDashboardData', 'LEDGER', 'TURN_IN_CODE_HEADERS', 'TURN_IN_CHECK_HEADERS', 'TCODE',
    'TCHK'], { Session: session });
  const { sandbox, exported: x } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const row = (who, configId, status, lastResult) => {
    const r = new Array(27).fill('');
    r[x.LEDGER.TIMESTAMP] = new Date(); r[x.LEDGER.GOOGLE_ID] = who; r[x.LEDGER.CONFIG_ID] = configId; r[x.LEDGER.FILE_ID] = 'f-' + configId;
    r[x.LEDGER.STATUS] = status; r[x.LEDGER.LAST_RESULT] = lastResult || '';
    ledger.appendRow(r);
  };
  row(AMY, 'A1', 'ACTIVE'); row(AMY, 'A2', 'ACTIVE'); row(AMY, 'A3', 'COMPLETE', 'NEEDS_REVISION');
  row(BO, 'B1', 'ACTIVE');
  const staging = ss.insertSheet('STAGING_PIPELINE');
  staging.appendRow(['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  staging.appendRow([new Date(), '2', 'f-A1', 'A1', 't@x', 'IN_PROCESS']);
  staging.appendRow([new Date(), '3', 'f-B1', 'B1', 't@x', 'IN_PROCESS']);
  const queue = ss.insertSheet('ReviewQueue');
  queue.appendRow(['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'Text', 'Status', 'x']);
  queue.appendRow([new Date(), AMY, 'f-A2', 'A2', '', 'PENDING', '']);
  return Object.assign(env, { ss, props, staging, ledger });
}

const ask = (ids, extra) => ids.map((id) => Object.assign({ fileId: 'f-' + id, configId: id }, extra || {}));

test('getMyWaitingStatus answers only for the caller\'s own cards, as the submit path matches them', () => {
  const env = server(AMY);
  const res = JSON.parse(JSON.stringify(env.exported.getMyWaitingStatus(
    ask(['A1', 'A2', 'A3', 'B1']).concat([{ fileId: 'f-A1', configId: 'A2' }, { fileId: 'f-B1', configId: 'A1' }]))));
  assert.equal(res.ok, true);
  assert.deepEqual(res.cards.map((c) => c.configId), ['A1', 'A2', 'A3'], 'Bo\'s card, and mismatched pairs, are left out');
  const by = Object.fromEntries(res.cards.map((c) => [c.configId, c]));
  assert.equal(by.A1.waiting, true);
  assert.equal(by.A1.statusPill, 'Being checked');
  assert.equal(by.A2.waiting, true);
  assert.equal(by.A2.statusPill, 'Waiting for feedback');
  assert.equal(by.A2.canSubmit, false);
  assert.equal(by.A3.waiting, false);
  assert.equal(by.A3.statusPill, 'Revise');
  assert.doesNotMatch(JSON.stringify(res), /bo@|B1/, 'nothing about anyone else');
});

test('no account, nothing asked, or junk: refused or empty; at most 20 cards are read', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(server('').exported.getMyWaitingStatus(ask(['A1'])))), { ok: false, error: 'NO_USER' });
  const env = server(AMY);
  assert.deepEqual(JSON.parse(JSON.stringify(env.exported.getMyWaitingStatus(null))), { ok: true, cards: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(env.exported.getMyWaitingStatus([{ fileId: 'f-A1' }, 'x', 7]))), { ok: true, cards: [] });
  const many = ask(new Array(25).fill('Z')).concat(ask(['A1']));
  assert.deepEqual(env.exported.getMyWaitingStatus(many).cards, [], 'the 26th card is past the cap');
});

test('the shared queue state is read once and kept briefly; the Ledger is read fresh each time', () => {
  const env = server(AMY);
  env.exported.getMyWaitingStatus(ask(['A1']));
  // The staging row finishes and the Ledger says so.
  env.staging.getRange(2, 6).setValue('COMPLETE');
  env.ledger.getRange(2, env.exported.LEDGER.STATUS + 1).setValue('COMPLETE');
  env.ledger.getRange(2, env.exported.LEDGER.LAST_RESULT + 1).setValue('PASSED');
  let card = env.exported.getMyWaitingStatus(ask(['A1'])).cards[0];
  assert.equal(card.waiting, true, 'the cached snapshot still has it in process, so the pill waits a few seconds more');
  env.sandbox.CacheService.getScriptCache().remove('dashWaitSnapshot');
  card = env.exported.getMyWaitingStatus(ask(['A1'])).cards[0];
  assert.equal(card.waiting, false);
  assert.equal(card.statusPill, 'Passed ✓');
  assert.doesNotMatch(env.sandbox.CacheService.getScriptCache().get('dashWaitSnapshot'), /@/, 'no account in the cache');
});

test('a turn-in answer being checked: its code once issued, else still checking, else CHANGED', () => {
  const env = server(AMY);
  env.props.setProperty('TURN_IN_CODE_COURSES', 'all');
  const x = env.exported;
  const checks = env.ss.insertSheet('TurnInChecks');
  checks.appendRow(x.TURN_IN_CHECK_HEADERS);
  const chk = new Array(x.TURN_IN_CHECK_HEADERS.length).fill('');
  chk[x.TCHK.GOOGLE_ID] = AMY; chk[x.TCHK.STUDENT_CONFIG_ID] = 'A3'; chk[x.TCHK.STATUS] = 'PENDING_CHECK';
  checks.appendRow(chk);
  assert.deepEqual(JSON.parse(JSON.stringify(x.getMyWaitingStatus(ask(['A3'], { turnIn: true })).cards[0].turnIn)), { state: 'PENDING_CHECK' });
  const codes = env.ss.insertSheet('TurnInCodes');
  codes.appendRow(x.TURN_IN_CODE_HEADERS);
  const code = new Array(x.TURN_IN_CODE_HEADERS.length).fill('');
  code[x.TCODE.CODE] = 'CAS-8177-L05-7Q4K-M2XA'; code[x.TCODE.GOOGLE_ID] = AMY; code[x.TCODE.ASSIGNMENT_ID] = 'A3';
  codes.appendRow(code);
  assert.deepEqual(JSON.parse(JSON.stringify(x.getMyWaitingStatus(ask(['A3'], { turnIn: true })).cards[0].turnIn)),
    { state: 'READY', code: 'CAS-8177-L05-7Q4K-M2XA' });
  codes.deleteRows(2, 1);
  checks.getRange(2, x.TCHK.STATUS + 1).setValue('NOT_YET');
  assert.equal(x.getMyWaitingStatus(ask(['A3'], { turnIn: true })).cards[0].turnIn.state, 'CHANGED');
});

test('getMyWaitingStatus is on the public allowlist with the reason it is safe', () => {
  assert.match(ALLOW['cas-ccps:student-dashboard'].getMyWaitingStatus, /caller's own/);
});

test('getStudentDashboardData marks each card waiting or not', () => {
  const env = server(AMY);
  const d = env.exported.getStudentDashboardData();
  assert.deepEqual(Object.fromEntries(d.assignments.map((a) => [a.configId, a.waiting])), { A1: true, A2: true, A3: false });
});

// ── The page ───────────────────────────────────────────────────────────────

function card(id, extra) {
  return Object.assign({ configId: id, fileId: 'f-' + id, unitName: 'Lesson ' + id, folderLabel: '3 - 8177 - T',
    statusClass: 'IN_PROGRESS', statusPill: 'Waiting for feedback', displayStatus: 'Waiting for feedback…', statusNote: '',
    status: 'ACTIVE', canSubmit: false, waiting: true, lastEval: '', milestones: [] }, extra || {});
}

function dashboard(cards) {
  return { googleId: AMY, assignments: cards, lockedParts: [], warmUps: {}, competencies: [], newRegistrations: [],
    term: '', termLabel: '', generatedAt: 'now' };
}

// A fake page: elements by id, timers on a clock, the visibility and the
// focused element set by the test, and every server call held until the
// test answers it.
function page(first, opts = {}) {
  const { exported } = loadGasFiles(FILES, ['buildStudentDashboardHtml_']);
  const els = {};
  const scrolled = [];
  const el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', textContent: '', value: '', options: [],
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, classList: { add() {}, remove() {} },
    scrollIntoView() { scrolled.push(id); }, focus() {} });
  const calls = [];
  let timers = [];
  let now = 0;
  const listeners = {};
  const run = new Proxy({}, {
    get(_, name) {
      if (name === 'withSuccessHandler' || name === 'withFailureHandler') {
        return function (f) { const r = Object.create(this); r['_' + name] = f; return r; };
      }
      return function (...args) {
        calls.push({ name, args: JSON.parse(JSON.stringify(args)), ok: this._withSuccessHandler, fail: this._withFailureHandler });
      };
    },
  });
  const document = {
    getElementById: el, querySelectorAll: () => [], createElement: () => el('x'),
    visibilityState: 'visible', title: 'My Assignments', activeElement: null,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const ctx = {
    document, google: { script: { run } }, console, navigator: {}, Math: Object.create(Math),
    setTimeout(fn, ms) { const t = { at: now + (ms || 0), fn, ms }; timers.push(t); return t; },
    clearTimeout(t) { timers = timers.filter((x) => x !== t); }, setInterval() {},
    scrollTo() {}, scrollY: 0,
    addEventListener(type, fn) { (listeners['window:' + type] = listeners['window:' + type] || []).push(fn); },
  };
  ctx.Math.random = () => (opts.random === undefined ? 0.5 : opts.random);
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(exported.buildStudentDashboardHtml_({ demo: false })).forEach((code) => vm.runInContext(code, ctx));
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
  const fire = (type) => (listeners[type] || []).forEach((f) => f());
  const pending = (name) => calls.filter((c) => c.name === name && !c.done);
  const answer = (name, value) => { const c = pending(name)[0]; c.done = true; c.ok(JSON.parse(JSON.stringify(value))); };
  const failCall = (name) => { const c = pending(name)[0]; c.done = true; c.fail(new Error('network')); };
  const p = (expr) => vm.runInContext(expr, ctx);
  // The first load (the page asks for it as it opens).
  answer('getStudentDashboardData', first);
  advance(500);
  return { ctx, els, calls, advance, fire, pending, answer, failCall, p, document, scrolled, timers: () => timers };
}

const polls = (pg) => pg.calls.filter((c) => c.name === 'getMyWaitingStatus');

test('the page asks about its waiting cards only, 20 to 40 seconds apart, and stops when nothing waits', () => {
  const pg = page(dashboard([card('A1'), card('A2', { waiting: false, statusClass: 'DONE', statusPill: 'Passed ✓' })]));
  pg.advance(29000);
  assert.equal(polls(pg).length, 0, 'not before the delay (20 s + half the 20 s jitter)');
  pg.advance(1000);
  assert.equal(polls(pg).length, 1);
  assert.deepEqual(polls(pg)[0].args[0], [{ fileId: 'f-A1', configId: 'A1', turnIn: false }], 'only the waiting card');
  // Still waiting, now being checked: the pill moves on, and the page asks again.
  pg.answer('getMyWaitingStatus', { ok: true, cards: [Object.assign(card('A1'), { statusPill: 'Being checked', displayStatus: 'Being checked now…' })] });
  assert.match(pg.els.main.innerHTML, />Being checked</);
  pg.advance(30000);
  assert.equal(polls(pg).length, 2);
  // Done: the dashboard once, the card re-rendered, the news said.
  pg.answer('getMyWaitingStatus', { ok: true, cards: [card('A1', { waiting: false, statusClass: 'NEEDS_ACTION', statusPill: 'Revise' })] });
  assert.equal(pg.pending('getStudentDashboardData').length, 1, 'one full load for the finished card');
  pg.answer('getStudentDashboardData', dashboard([card('A1', { waiting: false, statusClass: 'NEEDS_ACTION', statusPill: 'Revise',
    notYet: 'Name the target market.', canSubmit: true }), card('A2', { waiting: false, statusPill: 'SHOULD NOT REPLACE' })]));
  assert.match(pg.els.main.innerHTML, /<b>Not yet:<\/b> Name the target market\./);
  assert.doesNotMatch(pg.els.main.innerHTML, /SHOULD NOT REPLACE/, 'only the finished card is taken from the load');
  assert.equal(pg.els['news-banner'].textContent, 'Feedback is ready: Lesson A1.');
  assert.equal(pg.els['news-banner'].style.display, 'block');
  assert.equal(pg.document.title, '(1) Feedback ready · My Assignments');
  assert.equal(pg.scrolled.length, 1, 'the card is scrolled into view');
  // Nothing waits now: no more calls, however long the page stays open.
  pg.advance(30 * 60 * 1000);
  assert.equal(polls(pg).length, 2);
  assert.equal(pg.p('_poll.stopped'), 'nothing waits');
  // The title goes back once the student is on the page.
  pg.fire('window:focus');
  assert.equal(pg.document.title, 'My Assignments');
});

test('a hidden tab is never polled; showing it again starts the checks again', () => {
  const pg = page(dashboard([card('A1')]));
  pg.document.visibilityState = 'hidden';
  pg.fire('visibilitychange');
  pg.advance(10 * 60 * 1000);
  assert.equal(polls(pg).length, 0, 'no call while hidden');
  assert.equal(pg.p('_poll.stopped'), 'hidden');
  pg.document.visibilityState = 'visible';
  pg.fire('visibilitychange');
  pg.advance(30000);
  assert.equal(polls(pg).length, 1);
  // Hidden while a check is scheduled: it is cancelled.
  pg.answer('getMyWaitingStatus', { ok: true, cards: [card('A1')] });
  pg.document.visibilityState = 'hidden';
  pg.fire('visibilitychange');
  pg.advance(10 * 60 * 1000);
  assert.equal(polls(pg).length, 1);
});

test('a failed check backs off, doubling the wait; the checks stop at the cap with a note', () => {
  const pg = page(dashboard([card('A1')]));
  pg.advance(30000);
  pg.failCall('getMyWaitingStatus');
  pg.advance(59000);
  assert.equal(polls(pg).length, 1, 'the next check waits twice as long');
  pg.advance(1000);
  assert.equal(polls(pg).length, 2);
  pg.answer('getMyWaitingStatus', { ok: false, error: 'SERVER_ERROR' });
  pg.advance(119000);
  assert.equal(polls(pg).length, 2);
  pg.advance(1000);
  assert.equal(polls(pg).length, 3);
  // Answers that keep it waiting, up to the cap.
  for (let i = 0; i < 100; i++) {
    if (pg.pending('getMyWaitingStatus').length) pg.answer('getMyWaitingStatus', { ok: true, cards: [card('A1')] });
    pg.advance(30000);
  }
  assert.equal(polls(pg).length, pg.p('POLL_MAX_PER_VISIT'));
  assert.equal(pg.p('_poll.stopped'), 'cap');
  assert.match(pg.els['news-banner'].textContent, /stopped checking for news\. Press Refresh/);
});

test('news while the student types: the banner and title, but the page doesn\'t move', () => {
  const pg = page(dashboard([card('A1')]));
  pg.document.activeElement = { tagName: 'TEXTAREA', id: 'wu-a', getAttribute() { return null; } };
  pg.advance(30000);
  pg.answer('getMyWaitingStatus', { ok: true, cards: [card('A1', { waiting: false, statusClass: 'DONE', statusPill: 'Passed ✓' })] });
  pg.answer('getStudentDashboardData', dashboard([card('A1', { waiting: false, statusClass: 'DONE', statusPill: 'Passed ✓' })]));
  assert.equal(pg.els['news-banner'].textContent, 'Feedback is ready: Lesson A1.');
  assert.deepEqual(pg.scrolled, [], 'no scroll while typing');
  // The full load failing still ends the wait, from the check's own answer.
  const pg2 = page(dashboard([card('A1')]));
  pg2.advance(30000);
  pg2.answer('getMyWaitingStatus', { ok: true, cards: [card('A1', { waiting: false, statusClass: 'DONE', statusPill: 'Passed ✓' })] });
  pg2.failCall('getStudentDashboardData');
  assert.match(pg2.els.main.innerHTML, />Passed ✓</);
  pg2.advance(30 * 60 * 1000);
  assert.equal(polls(pg2).length, 1, 'nothing waits any more');
});

test('a turn-in answer being checked: the code appears in place, large, with Copy', () => {
  const pg = page(dashboard([card('A1', { waiting: false, statusClass: 'DONE', statusPill: 'Passed ✓',
    turnIn: { state: 'PENDING_CHECK' } })]));
  assert.match(pg.els.main.innerHTML, /This page checks for you and shows your code here/);
  pg.advance(30000);
  assert.deepEqual(polls(pg)[0].args[0], [{ fileId: 'f-A1', configId: 'A1', turnIn: true }]);
  pg.answer('getMyWaitingStatus', { ok: true, cards: [card('A1', { waiting: false, statusClass: 'DONE', statusPill: 'Passed ✓',
    turnIn: { state: 'READY', code: 'CAS-8177-L05-7Q4K-M2XA' } })] });
  assert.equal(pg.pending('getStudentDashboardData').length, 0, 'the code needs no full load');
  assert.match(pg.els.main.innerHTML, /class="ti-code"[^>]*value="CAS-8177-L05-7Q4K-M2XA"/);
  assert.match(pg.els.main.innerHTML, /class="act act-secondary ti-copy"[^>]*>Copy<\/button>/);
  assert.equal(pg.els['news-banner'].textContent, 'Your turn-in code is ready: Lesson A1.');
  assert.equal(pg.document.title, '(1) Ready · My Assignments');
  pg.advance(30 * 60 * 1000);
  assert.equal(polls(pg).length, 1);
});

test('the page stores nothing in the browser and calls the server only through scriptRun', () => {
  const { exported } = loadGasFiles(FILES, ['buildStudentDashboardHtml_']);
  const html = exported.buildStudentDashboardHtml_({ demo: false });
  const js = extractInlineScripts(html).join('\n');
  const news = js.slice(js.indexOf('Checking for news'), js.indexOf('function _clearNewsTitle'));
  assert.ok(news.length > 1000);
  assert.doesNotMatch(news, /localStorage|sessionStorage|indexedDB|google\.script\.run/);
  assert.match(html, /id="news-banner" class="main news-banner" role="status" aria-live="polite"/);
});
