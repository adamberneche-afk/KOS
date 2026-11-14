'use strict';
// The Student Dashboard's navigation (F16, approved 2026-11-14): the
// current marking period only, the default order the order the lessons were
// assigned, from a small generated lookup (13c) instead of the 2 MB 55b.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');
const lookup = require('../../tools/cas-ccps/build-dashboard-lessons.js');

const ROOT = path.join(__dirname, '..', '..');
const SD_FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:student-dashboard'].files
  .map((f) => path.join(ROOT, f));
const ME = 'amy@ccpsnet.net';
const TEACHER = 'teacher@ccpsnet.net';
const C8175 = '8175 Sports Entertainment and Event Marketing';
const C8177 = '8177 Sports Entertainment and Event Management';
const plain = (v) => JSON.parse(JSON.stringify(v));

test('the lessons lookup (13c) is current with 55b and STUDENT_CRITERIA.json, and small', () => {
  assert.equal(fs.readFileSync(lookup.TARGET_PATH, 'utf8'), lookup.expected(),
    'run: node tools/cas-ccps/build-dashboard-lessons.js');
  assert.ok(fs.statSync(lookup.TARGET_PATH).size < 100 * 1024, 'stays small');
  const files = require('../../tools/gas-lint/project-map.json')['cas-ccps:student-dashboard'].files;
  assert.ok(files.includes('cas-ccps/scripts/13c_StudentDashboardLessons.js'));
  assert.ok(!files.some((f) => /55b_/.test(f)), 'the 2 MB lesson data stays out');
  assert.equal(lookup.taskTitle('Assignment: The Pizza Break-Even Challenge\nmore'), 'The Pizza Break-Even Challenge');
});

// A Ledger in MP2 (MP1 over): rows in both terms, one with no term, a
// teacher's own task, and a lesson the teacher reopened past MP1.
function setUp(opts = {}) {
  const session = {
    getActiveUser: () => ({ getEmail: () => opts.viewer || ME }),
    getEffectiveUser: () => ({ getEmail: () => TEACHER }),
    getScriptTimeZone: () => 'America/New_York',
  };
  const env = loadGasFiles(SD_FILES, ['getStudentDashboardData', 'buildStudentDashboardHtml_', 'LEDGER', 'getDemoDashboardData',
    'openTurnInForAssignment', 'grantTurnInCode'], { Session: session });
  const { exported, sandbox } = env;
  const L = exported.LEDGER;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  props.setProperty('MARKING_PERIOD_ENDS', '2627_MP1=2020-01-01,2627_MP2=2099-12-31');
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['StudentConfigID', 'GoogleID', 'AssignmentConfigID', 'RecordedAt']);
  let t = Date.parse('2026-11-01T10:00:00');
  const row = (id, assignment, cls, term, status, lastResult) => {
    const r = new Array(27).fill('');
    r[L.TIMESTAMP] = new Date(t += 60000); r[L.GOOGLE_ID] = ME; r[L.CONFIG_ID] = id; r[L.FILE_ID] = 'f-' + id;
    r[L.STUDENT_NAME] = 'Amy'; r[L.TEACHER_EMAIL] = TEACHER; r[L.TEACHER_NAME] = 'Teacher';
    r[L.COURSE_NAME] = 'Lesson ' + id; r[L.CLASS_NAME] = cls; r[L.BLOCK] = cls === C8175 ? '1' : '3';
    r[L.PERIOD] = r[L.BLOCK]; r[L.STATUS] = status || 'ACTIVE'; r[L.LAST_RESULT] = lastResult || '';
    r[L.ACADEMIC_YEAR] = term;
    ledger.appendRow(r);
    if (assignment) sa.appendRow([id, ME, assignment, new Date()]);
  };
  // Assigned in this order, which is not the teaching order.
  row('W-CUSTOM-B', 'CAS-8175-MY-OWN-TASK', C8175, '2627_MP2');
  row('W-L07', 'CAS-8175-L07', C8175, '2627_MP2', 'COMPLETE', 'NEEDS_REVISION');
  row('W-CUSTOM-A', '', C8175, '');
  row('W-L03', 'CAS-8175-L03', C8175, '2627_MP2', 'COMPLETE', 'PASSED');
  row('W-L05', 'CAS-8175-L05', C8175, '2026-27');
  row('W-OLD', 'CAS-8175-L01', C8175, '2627_MP1', 'COMPLETE', 'NEEDS_REVISION');
  row('W-HYPE', 'CAS-8177-THE-HYPE-MACHINE', C8177, '2627_MP2');
  row('W-BIZ', 'CAS-8177-THE-BUSINESS-OF-THE-GAME', C8177, '2627_MP2');
  row('W-REOPEN', 'CAS-8177-THE-4-PS-OF-THE-FAN-EXPERIENCE', C8177, '2627_MP1', 'COMPLETE', 'NEEDS_REVISION');
  if (opts.reopen !== false) {
    const ov = ss.insertSheet('TurnInOverrides');
    ov.appendRow(['AssignmentKey', 'OpenedBy', 'OpenedAt', 'Reason', 'Until', 'ClosedAt', 'ClosedReason']);
    ov.appendRow(['CAS-8177-THE-4-PS-OF-THE-FAN-EXPERIENCE', TEACHER, new Date().toISOString(), 'ran over the break', '', '', '']);
  }
  return Object.assign(env, { ss, L, data: () => plain(exported.getStudentDashboardData()) });
}

function page(exported, data) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', textContent: '', options: [],
    setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } });
  const ctx = {
    document: { getElementById: el, addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(exported.buildStudentDashboardHtml_()).forEach((code) => vm.runInContext(code, ctx));
  if (data) ctx.render(data);
  return { ctx, els, html: els.main.innerHTML };
}

test('current term only: another marking period is off the page; no term code, or a reopened assignment, stays', () => {
  const data = setUp().data();
  const ids = data.assignments.map((a) => a.configId);
  assert.ok(!ids.includes('W-OLD'), 'the MP1 row is gone');
  assert.ok(ids.includes('W-CUSTOM-A'), 'a row with no term shows');
  assert.ok(ids.includes('W-L05'), 'a school-year value is not a marking period: it shows');
  const reopened = data.assignments.find((a) => a.configId === 'W-REOPEN');
  assert.ok(reopened, 'the teacher opened its assignment past MP1');
  assert.equal(reopened.openPastTerm, true);
  assert.equal(data.closedTermRows, 1);
  assert.equal(data.term, '2627_MP2');
  assert.equal(data.termLabel, 'Marking period 2, 2026–27');
  const closed = setUp({ reopen: false }).data();
  assert.ok(!closed.assignments.some((a) => a.configId === 'W-REOPEN'), 'no override: closed');
});

test('a closed-term card whose code the teacher granted the student stays on the page', () => {
  const env = setUp({ reopen: false });
  const codes = env.ss.insertSheet('TurnInCodes');
  codes.appendRow(['Code', 'GoogleID', 'AssignmentID', 'StudentConfigID', 'Course', 'Lesson', 'IssuedAt', 'How', 'GrantReason']);
  codes.appendRow(['CAS-8175-L01-AAAA-AAAA', ME, 'CAS-8175-L01', 'W-OLD', '8175', '01', new Date(), 'GRANT', 'absent']);
  const old = env.data().assignments.find((a) => a.configId === 'W-OLD');
  assert.ok(old && old.openPastTerm);
});

test('the page has no term selector and names the marking period; the start of a term is a plain message', () => {
  const env = setUp();
  const html = env.exported.buildStudentDashboardHtml_();
  assert.doesNotMatch(html, /id="term-filter"|Whole school year/);
  const { html: main } = page(env.exported, env.data());
  assert.match(main, /<p class="term-line">Marking period 2, 2026–27<\/p>/);
  assert.match(main, /Your teacher kept this open after its marking period ended\./);
  const empty = page(env.exported, { googleId: ME, assignments: [], term: '2627_MP2', termLabel: 'Marking period 2, 2026–27',
    emptyReason: 'Nothing is assigned yet in Marking period 2, 2026–27.' }).html;
  assert.match(empty, /Nothing is assigned yet in Marking period 2/);
});

test('default order: within each class, the lessons in teaching order, then the teacher\'s own tasks as assigned', () => {
  const data = setUp().data();
  const order = data.assignments.map((a) => a.configId);
  assert.deepEqual(order.filter((id) => !/HYPE|BIZ|REOPEN/.test(id)),
    ['W-L03', 'W-L05', 'W-L07', 'W-CUSTOM-B', 'W-CUSTOM-A'], 'L03, L05, L07, then the own tasks by when they were assigned');
  assert.deepEqual(order.filter((id) => /HYPE|BIZ|REOPEN/.test(id)), ['W-BIZ', 'W-REOPEN', 'W-HYPE'],
    '8177 by its teaching order, which its names do not carry');
  const byId = Object.fromEntries(data.assignments.map((a) => [a.configId, a]));
  assert.equal(byId['W-L07'].seq, 7);
  assert.equal(byId['W-CUSTOM-B'].seq, null);
  assert.equal(byId['W-BIZ'].lessonKey, '8177-the-business-of-the-game');
});

test('the page renders the cards in that order, with "Do next" above them all', () => {
  const env = setUp();
  const { html } = page(env.exported, env.data());
  const at = (s) => html.indexOf(s);
  assert.ok(at('class="do-next"') !== -1 && at('class="do-next"') < at('class="group-header"'), 'Do next first');
  const cards = html.slice(at('class="group-header"'));
  const c = (s) => cards.indexOf(s);
  assert.ok(c('Lesson W-L03') < c('Lesson W-L05') && c('Lesson W-L05') < c('Lesson W-L07') &&
    c('Lesson W-L07') < c('Lesson W-CUSTOM-B') && c('Lesson W-CUSTOM-B') < c('Lesson W-CUSTOM-A'));
  const doNext = html.slice(at('class="do-next"'), at('</section>'));
  assert.match(doNext, /Lesson W-L07/, 'the card to revise is in Do next');
});

test('demo mode: a card from a closed term never shows; the reopened one does, and every card is this term\'s', () => {
  const env = setUp({ viewer: TEACHER });
  const d = plain(env.exported.getDemoDashboardData());
  const cards = d.dashboard.assignments;
  assert.ok(d.dashboard.term && /_MP\d$/.test(d.dashboard.term));
  assert.ok(cards.every((a) => a.term === d.dashboard.term || a.openPastTerm), 'no closed-term card');
  assert.equal(cards.filter((a) => a.openPastTerm).length, 1, 'one reopened card');
  const lessons = cards.filter((a) => !a.part && /^8175/.test(a.lessonKey || '')).map((a) => a.seq);
  assert.ok(!lessons.includes(2), 'the closed one (8175\'s second lesson) is off the page');
  assert.deepEqual(lessons, lessons.slice().sort((x, y) => x - y), 'assigned order');
  const { html } = page(env.exported, d.dashboard);
  assert.match(html, /Your teacher kept this open after its marking period ended\./);
});
