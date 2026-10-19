'use strict';
// The Student Dashboard's Warm-ups card (13_StudentDashboard.js): the last
// warm-up's feedback with its extra-credit reply while that window is open,
// and the current warm-up, answered in a text box when it was delivered to
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

// rows: [{ wq, tb? }] where tb is { warmup, response, reply }.
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
    if (r.tb) tb.appendRow([r.wq[0], r.wq[5], r.tb.bridge || '', r.tb.warmup || 'Warm-up text', r.tb.response || '', '', r.tb.reply || '', '']);
  });
  return { exported, ss, wq, tb };
}

const CFG = { tabs: { warmUpQueue: 'WarmUpQueue', warmUpTextBox: 'WarmUpTextBox' } };
// Wed Oct 21, noon in New York.
const NOW = new Date('2026-10-21T16:00:00Z');

test('the card shows only the last warm-up and the current one, for the signed-in student', () => {
  const { exported, ss } = load([
    { wq: wqRow({ date: '2026-10-19', status: 'SCORED', feedback: 'Old feedback' }), tb: {} },
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
  assert.equal(wu.previous.extraCredit.byLabel, 'Tue, Oct 27');
  assert.equal(wu.current.dateLabel, 'Wed, Oct 21');
  assert.equal(wu.current.isToday, true);
  assert.equal(wu.current.textBox, true);
  assert.equal(wu.current.warmup, 'Why pay $5 for water?');
  assert.equal(wu.current.bridge, 'Yesterday you said…');
  assert.equal(wu.current.canAnswer, true);
  assert.ok(!JSON.stringify(wu).includes('not mine'));
  assert.ok(!JSON.stringify(wu).includes('Old feedback'));
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

test('extra credit: closed once credited or after 7 days', () => {
  let { exported, ss } = load([{ wq: wqRow({ date: '2026-10-20', status: 'SCORED', extraCredit: 1 }), tb: {} }]);
  let ec = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.extraCredit;
  assert.deepEqual([ec.credited, ec.open], [true, false]);
  ({ exported, ss } = load([{ wq: wqRow({ date: '2026-10-13', status: 'SCORED' }), tb: {} }]));
  ec = exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.extraCredit;
  assert.equal(ec.open, false);
});

test('the score shows with the feedback: out of 10, its parts, extra credit on top', () => {
  let { exported, ss } = load([{ wq: wqRow({ date: '2026-10-20', status: 'SCORED', scores: [5, 1, 2, 8] }), tb: {} }]);
  assert.deepEqual(exported.getStudentWarmUps_(ss, CFG, ME, NOW).previous.score,
    { points: 8, max: 10, length: 5, grammar: 1, engagement: 2, extra: 0 });
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

test('submitWarmUpReply: only while the extra-credit window is open', () => {
  const d = (k) => new Date(Date.now() - k * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { exported, tb } = load([
    { wq: wqRow({ date: d(1), status: 'SCORED' }), tb: {} },
    { wq: wqRow({ date: d(1), status: 'SCORED', extraCredit: 1 }), tb: {} },
    { wq: wqRow({ date: d(1), status: 'PENDING_EVAL' }), tb: {} },
  ]);
  const [open, credited, unscored] = [n - 2, n - 1, n].map((i) => 'WQ-' + i);
  assert.equal(exported.submitWarmUpReply(open, 'I agree because fans pay for the experience.').ok, true);
  assert.equal(tb.getRange(2, 7).getValue(), 'I agree because fans pay for the experience.');
  assert.match(exported.submitWarmUpReply(credited, 'more').error, /closed/);
  assert.match(exported.submitWarmUpReply(unscored, 'more').error, /closed/);
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
