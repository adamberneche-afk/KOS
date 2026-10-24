'use strict';
// The Student Dashboard's Warm-ups card (13_StudentDashboard.js): the last
// warm-up, open until the end of the student's next class day (its
// feedback and an extra-credit reply, or a late answer scored without
// either), and the current warm-up, answered in a text box when it was delivered to
// the dashboard (WARMUP_TEXT_BOX, a WarmUpTextBox row) or opened as a doc.
// Saving checks the signed-in student owns the warm-up and that it is open.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const ME = 'student@ccpsnet.net';

let n = 0;
function wqRow({ googleId = ME, date, status, docId = '', extraCredit = '', feedback = '', scores = null }) {
  const row = new Array(21).fill('');
  row[0] = 'WQ-' + (++n);
  row[4] = googleId;
  row[5] = date;
  row[6] = JSON.stringify({ course_name: 'Sports Marketing' });
  row[8] = status;
  row[9] = docId;
  row[15] = extraCredit;
  row[17] = feedback;
  if (scores) [row[12], row[13], row[14], row[16]] = scores; // length, grammar, engagement, total
  return row;
}

// rows: [{ wq, tb? }] where tb is { warmup, response, submittedAt, reply }.
function load(rows, viewer = ME) {
  const { exported, sandbox } = loadGasFiles(
    [S('00_SharedConfig.js'), S('13_StudentDashboard.js')],
    ['getStudentWarmUps_', 'resolveWarmUpStatus_', 'buildStudentDashboardHtml_', 'submitWarmUpAnswer', 'submitWarmUpReply'],
    { Session: { getActiveUser: () => ({ getEmail: () => viewer }), getScriptTimeZone: () => 'America/New_York' } });
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  const tb = ss.insertSheet('WarmUpTextBox');
  tb.appendRow(['queue_id', 'lesson_date', 'bridge_text', 'warmup_text', 'response_text', 'submitted_at', 'reply_text', 'replied_at']);
  rows.forEach((r) => {
    wq.appendRow(r.wq);
    if (r.tb) tb.appendRow([r.wq[0], r.wq[5], r.tb.bridge || '', r.tb.warmup || 'Warm-up text', r.tb.response || '', r.tb.submittedAt || '', r.tb.reply || '', '']);
  });
  return { exported, ss, wq, tb };
}

const CFG = { tabs: { warmUpQueue: 'WarmUpQueue', warmUpTextBox: 'WarmUpTextBox' } };
// Wed Oct 21, noon in New York.
const NOW = new Date('2026-10-21T16:00:00Z');

test('the card shows the last warm-up and the current one, for the signed-in student', () => {
  const { exported, ss } = load([
    { wq: wqRow({ date: '2026-10-19', status: 'SCORED', extraCredit: 1, feedback: 'Old feedback' }), tb: {} },
    { wq: wqRow({ date: '2026-10-20', status: 'SCORED', feedback: 'Good connection to the 4 Ps.' }), tb: { response: 'My answer' } },
    { wq: wqRow({ date: '2026-10-21', status: 'DELIVERED' }), tb: { warmup: 'Why pay $5 for water?', bridge: 'Yesterday you said…' } },
    { wq: wqRow({ date: '2026-10-22', status: 'DELIVERED' }), tb: {} },
    { wq: wqRow({ googleId: 'other@ccpsnet.net', date: '2026-10-21', status: 'DELIVERED' }), tb: { warmup: 'not mine' } },
    { wq: wqRow({ date: '2026-10-21', status: 'PENDING' }) }, // not delivered: no doc, no text box
  ]);
  const wu = exported.getStudentWarmUps_(ss, CFG, ME, NOW);
  assert.equal(wu.previous.dateLabel, 'Tue, Oct 20');
  assert.equal(wu.previous.feedback, 'Good connection to the 4 Ps.');
  assert.equal(wu.previous.extraCredit.open, true);
  assert.equal(wu.previous.extraCredit.canReply, true);
  assert.equal(wu.previous.extraCredit.byLabel, 'Wed, Oct 21', 'open until the end of the next class day');
  assert.equal(wu.current.dateLabel, 'Wed, Oct 21');
  assert.equal(wu.current.isToday, true);
  assert.equal(wu.current.textBox, true);
  assert.equal(wu.current.warmup, 'Why pay $5 for water?');
  assert.equal(wu.current.bridge, 'Yesterday you said…');
  assert.equal(wu.current.canAnswer, true);
  assert.ok(!JSON.stringify(wu).includes('not mine'));
  assert.ok(!JSON.stringify(wu).includes('Old feedback'), 'an older warm-up already credited is not listed');
});

test('a doc warm-up opens its doc; feedback still shows on the card', () => {
  const { exported, ss } = load([
    { wq: wqRow({ date: '2026-10-20', status: 'SCORED', docId: 'doc-1', feedback: 'Nice.' }) },
    { wq: wqRow({ date: '2026-10-21', status: 'DELIVERED', docId: 'doc-2' }) },
  ]);
  const wu = exported.getStudentWarmUps_(ss, CFG, ME, NOW);
  assert.equal(wu.current.textBox, false);
  assert.equal(wu.current.docUrl, 'https://docs.google.com/document/d/doc-2/edit');
  assert.equal(wu.current.canAnswer, false);
  assert.equal(wu.previous.feedback, 'Nice.');
  assert.equal(wu.previous.extraCredit.open, true);
  assert.equal(wu.previous.extraCredit.canReply, false, 'a doc warm-up is replied to in the doc');
});

test('extra credit: closed once credited or after the window', () => {
  let { exported, ss } = load([{ wq: wqRow({ date: '2026-10-20', status: 'SCORED', extraCredit: 1 }), tb: {} }]);
  let ec = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.extraCredit;
  assert.deepEqual([ec.credited, ec.open], [true, false]);
  ({ exported, ss } = load([{ wq: wqRow({ date: '2026-10-13', status: 'SCORED' }), tb: {} }]));
  ec = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.extraCredit;
  assert.equal(ec.open, false);
});

test('with no later class queued, the last warm-up stays open through day + 6, the last day 25 credits (finding 4)', () => {
  let { exported, ss } = load([{ wq: wqRow({ date: '2026-10-15', status: 'SCORED' }), tb: {} }]);
  let ec = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.extraCredit;
  assert.deepEqual([ec.open, ec.byLabel], [true, 'Wed, Oct 21']);
  ({ exported, ss } = load([{ wq: wqRow({ date: '2026-10-14', status: 'SCORED' }), tb: {} }]));
  ec = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.extraCredit;
  assert.equal(ec.open, false, 'day + 7: 25 has already made its last check');
});

test('the score shows with the feedback: out of 10, its parts, extra credit on top', () => {
  let { exported, ss } = load([{ wq: wqRow({ date: '2026-10-20', status: 'SCORED', scores: [5, 1, 2, 8] }), tb: {} }]);
  assert.deepEqual(exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.score,
    { points: 8, max: 10, lengthMax: 6, grammarMax: 1, engagementMax: 3, length: 5, grammar: 1, engagement: 2, extra: 0 });
  ({ exported, ss } = load([{ wq: wqRow({ date: '2026-10-20', status: 'SCORED', extraCredit: 1, scores: [5, 1, 2, 9] }), tb: {} }]));
  const sc = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.score;
  assert.deepEqual([sc.points, sc.extra], [8, 1]);
  ({ exported, ss } = load([{ wq: wqRow({ date: '2026-10-20', status: 'PENDING_EVAL' }), tb: {} }]));
  assert.equal(exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.score, null, 'no score before it is checked');
});

test('no warm-ups is no card', () => {
  const { exported, ss } = load([]);
  assert.deepEqual(exported.getStudentWarmUps_(ss, CFG, ME, NOW), { current: null, previous: null });
});

test('submitWarmUpAnswer: saves the student\'s own open warm-up, and refuses others', () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { exported, tb } = load([
    { wq: wqRow({ date: today, status: 'DELIVERED' }), tb: {} },
    { wq: wqRow({ date: '2020-01-01', status: 'DELIVERED' }), tb: {} },
    { wq: wqRow({ date: today, status: 'DELIVERED', docId: 'doc-x' }) },
  ]);
  const [mine, old, docOne] = [n - 2, n - 1, n].map((i) => 'WQ-' + i);
  assert.equal(exported.submitWarmUpAnswer(mine, '  ').ok, false);
  const res = exported.submitWarmUpAnswer(mine, '=SUM(A1) is how I would total it');
  assert.equal(res.ok, true);
  const saved = tb.getRange(2, 5).getValue();
  assert.ok(String(saved).endsWith('=SUM(A1) is how I would total it') && !String(saved).startsWith('='),
    'a leading = is not stored as a formula');
  assert.match(exported.submitWarmUpAnswer(old, 'late').error, /closed/);
  assert.match(exported.submitWarmUpAnswer(docOne, 'x').error, /wasn't found/);
  const other = load([{ wq: wqRow({ date: today, status: 'DELIVERED' }), tb: {} }], 'other@ccpsnet.net');
  assert.match(other.exported.submitWarmUpAnswer('WQ-' + n, 'hi').error, /wasn't found/);
});

test('the last warm-up closes at the end of the next class day, queued or delivered', () => {
  // Oct 19's next class is Oct 20 (queued, never delivered): closed on Oct 21.
  const { exported, ss } = load([
    { wq: wqRow({ date: '2026-10-19', status: 'SCORED', feedback: 'Feedback' }), tb: {} },
    { wq: wqRow({ date: '2026-10-20', status: 'PENDING' }) },
  ]);
  const prev = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous;
  assert.equal(prev.dateLabel, 'Mon, Oct 19');
  assert.equal(prev.extraCredit.open, false);
  assert.equal(prev.feedback, 'Feedback', 'feedback stays readable after the window');
});

test('only the last warm-up is offered: an older one never is (finding 5, by the 10-24 rule)', () => {
  const { exported, ss } = load([
    { wq: wqRow({ date: '2026-10-17', status: 'SCORED', feedback: 'Oct 17 feedback' }), tb: {} },
    { wq: wqRow({ date: '2026-10-19', status: 'SCORED', feedback: 'Oct 19 feedback' }), tb: {} },
  ]);
  const wu = exported.getStudentWarmUps_(ss, CFG, ME, NOW);
  assert.deepEqual(Object.keys(wu).sort(), ['current', 'previous']);
  assert.equal(wu.previous.feedback, 'Oct 19 feedback');
  assert.equal(wu.previous.extraCredit.open, true);
  assert.ok(!JSON.stringify(wu).includes('Oct 17'));
});

test('a later day\'s warm-up opens on its day: shown, not answerable (finding 9)', () => {
  const { exported, ss } = load([{ wq: wqRow({ date: '2026-10-22', status: 'DELIVERED' }), tb: {} }]);
  const cur = exported.getStudentWarmUps_(ss, CFG, ME, NOW).current;
  assert.equal(cur.displayStatus, 'Opens Thu, Oct 22');
  assert.equal(cur.canAnswer, false);
  const today = load([{ wq: wqRow({ date: '2026-10-21', status: 'DELIVERED' }), tb: {} }]);
  const t = today.exported.getStudentWarmUps_(today.ss, CFG, ME, NOW).current;
  assert.deepEqual([t.displayStatus, t.canAnswer, t.openUntil], ['Ready — answer today', true, 'the day']);
});

test('missed last class: answerable late until the end of this class day, no feedback, no extra credit', () => {
  const { exported, ss } = load([
    { wq: wqRow({ date: '2026-10-19', status: 'INCOMPLETE' }), tb: { warmup: 'Missed question' } },
    { wq: wqRow({ date: '2026-10-21', status: 'DELIVERED' }), tb: {} },
  ]);
  const prev = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous;
  assert.equal(prev.displayStatus, 'Not answered — you can still answer it');
  assert.deepEqual([prev.canAnswer, prev.late, prev.openUntil, prev.warmup], [true, true, 'Wed', 'Missed question']);
  assert.equal(prev.extraCredit.open, false);

  const after = load([
    { wq: wqRow({ date: '2026-10-19', status: 'INCOMPLETE' }), tb: {} },
    { wq: wqRow({ date: '2026-10-20', status: 'SCORED' }), tb: {} },
  ]);
  const p2 = after.exported.getStudentWarmUps_(after.ss, CFG, ME, NOW).previous;
  assert.equal(p2.dateLabel, 'Tue, Oct 20', 'a newer class replaces it');
});

test('a late answer reads as such, and once scored shows its score without feedback or extra credit', () => {
  let { exported, ss } = load([{ wq: wqRow({ date: '2026-10-19', status: 'INCOMPLETE' }),
    tb: { response: 'My late answer', submittedAt: new Date('2026-10-21T15:00:00Z') } }]);
  let prev = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous;
  assert.equal(prev.displayStatus, 'Answered late — checked overnight');
  assert.equal(prev.canAnswer, true, 'can still be changed until the window closes');

  ({ exported, ss } = load([{ wq: wqRow({ date: '2026-10-19', status: 'SCORED', feedback: 'Hidden', scores: [5, 1, 2, 8] }),
    tb: { response: 'My late answer', submittedAt: new Date('2026-10-20T15:00:00Z') } }]));
  prev = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous;
  assert.equal(prev.displayStatus, 'Checked — answered late, so no feedback');
  assert.deepEqual([prev.feedback, prev.extraCredit.open, prev.extraCredit.canReply, prev.score.points], ['', false, false, 8]);
});

test('a past warm-up left blank reads "Not answered" once it can no longer be answered (finding 15)', () => {
  const { exported, ss } = load([
    { wq: wqRow({ date: '2026-10-19', status: 'DELIVERED' }), tb: {} },
    { wq: wqRow({ date: '2026-10-20', status: 'PENDING' }) },
  ]);
  assert.equal(exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.displayStatus, 'Not answered');
  const answered = load([{ wq: wqRow({ date: '2026-10-20', status: 'DELIVERED' }),
    tb: { response: 'I answered', submittedAt: new Date('2026-10-20T15:00:00Z') } }]);
  assert.equal(answered.exported.getStudentWarmUps_(answered.ss, CFG, ME, NOW).previous.displayStatus, 'Waiting to be checked');
  const doc = load([{ wq: wqRow({ date: '2026-10-20', status: 'DELIVERED', docId: 'doc-1' }) }]);
  assert.equal(doc.exported.getStudentWarmUps_(doc.ss, CFG, ME, NOW).previous.displayStatus, 'Waiting to be checked',
    'a doc warm-up\'s text is not read here, so it is not called unanswered');
});

test('submitWarmUpReply: only on the last warm-up, scored on time, while its window is open', () => {
  const d = (k) => new Date(Date.now() - k * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const one = (wq, tbx) => load([{ wq, tb: tbx || {} }]);
  let fx = one(wqRow({ date: d(1), status: 'SCORED' }));
  assert.equal(fx.exported.submitWarmUpReply('WQ-' + n, 'I agree because fans pay for the experience.').ok, true);
  assert.equal(fx.tb.getRange(2, 7).getValue(), 'I agree because fans pay for the experience.');
  fx = one(wqRow({ date: d(1), status: 'SCORED', extraCredit: 1 }));
  assert.match(fx.exported.submitWarmUpReply('WQ-' + n, 'more').error, /closed/);
  fx = one(wqRow({ date: d(1), status: 'PENDING_EVAL' }));
  assert.match(fx.exported.submitWarmUpReply('WQ-' + n, 'more').error, /closed/);
  fx = one(wqRow({ date: d(1), status: 'SCORED' }), { submittedAt: new Date() });
  assert.match(fx.exported.submitWarmUpReply('WQ-' + n, 'more').error, /closed/, 'a late answer earns no extra credit');
  fx = load([{ wq: wqRow({ date: d(3), status: 'SCORED' }), tb: {} }, { wq: wqRow({ date: d(1), status: 'SCORED' }), tb: {} }]);
  assert.match(fx.exported.submitWarmUpReply('WQ-' + (n - 1), 'more').error, /closed/, 'an older warm-up is closed');
});

test('submitWarmUpAnswer: a missed warm-up takes a late answer until the window closes', () => {
  const d = (k) => new Date(Date.now() - k * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  let fx = load([{ wq: wqRow({ date: d(2), status: 'INCOMPLETE' }), tb: {} }, { wq: wqRow({ date: d(0), status: 'DELIVERED' }), tb: {} }]);
  assert.equal(fx.exported.submitWarmUpAnswer('WQ-' + (n - 1), 'My late answer about pricing').ok, true);
  assert.equal(fx.tb.getRange(2, 5).getValue(), 'My late answer about pricing');
  fx = load([{ wq: wqRow({ date: d(3), status: 'INCOMPLETE' }), tb: {} }, { wq: wqRow({ date: d(1), status: 'SCORED' }), tb: {} }]);
  assert.match(fx.exported.submitWarmUpAnswer('WQ-' + (n - 1), 'too late').error, /closed/);
});

test('resolveWarmUpStatus_: feedback is "below" for a text box, "in your doc" for a doc', () => {
  const { exported } = load([]);
  assert.match(exported.resolveWarmUpStatus_('SCORED', '2026-10-20', '2026-10-21', true).displayStatus, /below/);
  assert.match(exported.resolveWarmUpStatus_('SCORED', '2026-10-20', '2026-10-21', false).displayStatus, /in your doc/);
  assert.equal(exported.resolveWarmUpStatus_('DELIVERED', '2026-10-21', '2026-10-21', true).statusClass, 'NEEDS_ACTION');
});

test('every inline <script> the student dashboard serves parses as valid JS', () => {
  const html = load([]).exported.buildStudentDashboardHtml_();
  assert.ok(html.includes('function renderWarmUps(') && html.includes('function saveWarmUp('));
  extractInlineScripts(html).forEach((code, i) => {
    assert.doesNotThrow(() => new vm.Script(code, { filename: `student-dashboard-inline-${i}.js` }));
  });
});

test('a NOT_MEETING warm-up is not shown: the card falls back to the next one', () => {
  const { exported, ss } = load([
    { wq: wqRow({ date: '2026-10-21', status: 'NOT_MEETING' }), tb: { warmup: 'Off day' } },
    { wq: wqRow({ date: '2026-10-22', status: 'DELIVERED' }), tb: { warmup: 'Meeting day' } },
  ]);
  const w = exported.getStudentWarmUps_(ss, CFG, ME, NOW);
  assert.equal(w.current.warmup, 'Meeting day');
});

// The page itself: its inline script run with a bare document, so what a
// function renders can be read back (walk-through findings 10, 11, 12, 13).
function page() {
  const html = load([]).exported.buildStudentDashboardHtml_();
  const els = {};
  const el = () => ({ style: {}, innerHTML: '', setAttribute() {}, classList: { add() {}, remove() {} } });
  const ctx = {
    document: { getElementById: (id) => els[id] || (els[id] = el()), addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(html).forEach((code) => vm.runInContext(code, ctx));
  return { ctx, els };
}

test('Last warm-up: the score shows each part out of its maximum; the question and answer are there, collapsed', () => {
  const { exported, ss } = load([{ wq: wqRow({ date: '2026-10-20', status: 'SCORED', feedback: 'Name a price.', scores: [3, 1, 2, 6] }),
    tb: { warmup: 'Why pay $5 for water?', response: 'Because it is the only water.', submittedAt: new Date('2026-10-20T15:00:00Z') } }]);
  const prev = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous;
  const h = page().ctx._wuPrevious(prev);
  assert.match(h, /Length 3\/6 · Grammar 1\/1 · Engagement 2\/3 \(30\+ words for full length\)/);
  assert.match(h, /<details class="wu-recall"><summary>Show the question and your answer<\/summary>/);
  assert.ok(h.includes('Why pay $5 for water?') && h.includes('Because it is the only water.'));
  assert.ok(h.indexOf('wu-recall') < h.indexOf('wu-score'), 'above the score');
  assert.ok(!h.includes('<details open'), 'collapsed by default');
});

test('My Info: one card per class, period and teacher, not one per assignment', () => {
  const { ctx, els } = page();
  const a = { studentName: 'Sam', className: 'Sports Marketing', period: '3-Odd', teacherName: 'Ms. Teacher' };
  ctx.renderMyInfo({ assignments: [a, Object.assign({}, a), Object.assign({}, a, { className: 'Business Law' })] });
  assert.equal((els['my-info-panel'].innerHTML.match(/class="info-card"/g) || []).length, 2);
});

test('the "just registered" banner: one line per class the server lists, none without', () => {
  const { ctx, els } = page();
  ctx.renderNewRegistrationBanner({ newRegistrations: [{ className: 'Sports Marketing', teacherName: 'Ms. Teacher', registeredAt: 'Oct 21' }] });
  assert.equal((els['new-registration-banner'].innerHTML.match(/new-reg-notice/g) || []).length, 1);
  ctx.renderNewRegistrationBanner({ assignments: [{ className: 'x', isNewRegistration: true }] });
  assert.equal(els['new-registration-banner'].style.display, 'none');
});
