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
    'openTurnInForAssignment', 'grantTurnInCode', 'DASH_LESSON_INFO'], { Session: session });
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

// ── Card information and the header (F16 items 6 and 7) ────────────────────

test('every card: the name in sentence case, its lesson number chip, the part under it, one line on the task; no period line', () => {
  const env = setUp();
  const data = env.data();
  const byId = Object.fromEntries(data.assignments.map((a) => [a.configId, a]));
  assert.equal(byId['W-L07'].lessonNo, 'L07');
  assert.equal(byId['W-BIZ'].lessonNo, 'L01', '8177 by its place in the teaching order');
  assert.equal(byId['W-BIZ'].taskLine, 'The Corporate Scouting Report');
  assert.equal(byId['W-CUSTOM-A'].lessonNo, '', 'a teacher\'s own task has no chip');
  const { ctx } = page(env.exported);
  assert.equal(ctx.sentenceCase('L01 EVOLUTION OF MARKETING (FROM TRADE TO TIKTOK)'), 'L01 evolution of marketing (from trade to TikTok)');
  assert.equal(ctx.sentenceCase('CHHS BRAND AUDIT (INTERNAL ANALYSIS)'), 'CHHS brand audit (internal analysis)');
  assert.equal(ctx.sentenceCase('The Business of the Game'), 'The Business of the Game', 'mixed case is left alone');
  const named = Object.assign({}, byId['W-L07'], { unitName: 'L07 ETHICAL DILEMMAS DISCUSSION' });
  const h = ctx.cardHtml(named);
  assert.match(h, /<div class="unit-name"><span class="lesson-chip">L07<\/span>Ethical dilemmas discussion<\/div>/);
  assert.match(h, /<div class="task-line">Ethical Dilemmas in the Workplace<\/div>/);
  assert.doesNotMatch(h, /card-meta|Period 1/, 'the block header already says the period');
  const part = Object.assign({}, named, { part: { lesson: 'X', n: 2, count: 3, lessonName: 'L07 ETHICAL DILEMMAS DISCUSSION', title: 'The Debate' } });
  assert.match(ctx.cardHtml(part), /Ethical dilemmas discussion<\/div><div class="part-sub">Part 2 of 3: The Debate<\/div>/);
  const dn = ctx.doNextHtml([Object.assign({}, part, { statusClass: 'NEEDS_ACTION' })]);
  assert.match(dn, /<span class="lesson-chip">L07<\/span><a [^>]*>Ethical dilemmas discussion<\/a><span class="dn-meta">Part 2 of 3 · 8175 Sports Entertainment and Event Marketing<\/span>/);
});

test('the first screen is the work: Do next first, the competency counts after the classes', () => {
  const env = setUp();
  const data = env.data();
  data.competencies = [{ course: '8175', className: C8175, done: 3, total: 113 }];
  const { html } = page(env.exported, data);
  assert.ok(html.indexOf('class="do-next"') < html.indexOf('class="group-header"'));
  assert.ok(html.indexOf('class="competency-strip"') > html.lastIndexOf('class="card '), 'the strip is below the cards');
  assert.ok(html.indexOf('class="do-next"') < 600, 'the next action is at the top of the page');
});

test('the header: Refresh in view, My Info and the terms in an accessible More menu', () => {
  const env = setUp();
  const html = env.exported.buildStudentDashboardHtml_();
  const header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
  assert.match(header, /<button id="more-btn"[^>]*aria-haspopup="menu" aria-expanded="false" aria-controls="more-menu">/);
  assert.match(header, /<div id="more-menu" role="menu" aria-labelledby="more-btn" hidden>/);
  assert.match(header, /<button id="my-info-btn" type="button" role="menuitem" tabindex="-1" onclick="toggleMyInfo\(\)"/);
  assert.match(header, /<button id="cas-terms-btn" type="button" role="menuitem" tabindex="-1" onclick="casOpenTerms\(\)"/);
  assert.match(header, /id="account-label"/);
  assert.doesNotMatch(header, /<select/);

  // Keyboard: ArrowDown opens on the first item, arrows move, Escape closes
  // and puts focus back on More.
  const listeners = {};
  const focus = { el: null };
  const mk = (id, extra) => Object.assign({ id, style: {}, innerHTML: '', textContent: '', hidden: id === 'more-menu', attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    addEventListener(t, f) { (listeners[id + ':' + t] = listeners[id + ':' + t] || []).push(f); },
    focus() { focus.el = this; }, contains: () => false, classList: { add() {}, remove() {} } }, extra);
  const els = {};
  const items = [mk('my-info-btn'), mk('cas-terms-btn')];
  items.forEach((i) => { els[i.id] = i; });
  els['more-btn'] = mk('more-btn', { attrs: { 'aria-expanded': 'false' } });
  els['more-menu'] = mk('more-menu', { querySelectorAll: () => items });
  els['hdr-more'] = mk('hdr-more');
  const doc = { getElementById: (id) => els[id] || (els[id] = mk(id)), addEventListener() {}, querySelectorAll: () => [] };
  Object.defineProperty(doc, 'activeElement', { get: () => focus.el });
  const ctx = { document: doc, google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(html).forEach((code) => vm.runInContext(code, ctx));
  const key = (id, k) => listeners[id + ':keydown'].forEach((f) => f({ key: k, preventDefault() {} }));
  key('more-btn', 'ArrowDown');
  assert.equal(els['more-menu'].hidden, false);
  assert.equal(els['more-btn'].attrs['aria-expanded'], 'true');
  assert.equal(focus.el.id, 'my-info-btn');
  key('more-menu', 'ArrowDown');
  assert.equal(focus.el.id, 'cas-terms-btn');
  assert.equal(items[1].attrs.tabindex, '0');
  key('more-menu', 'Escape');
  assert.equal(els['more-menu'].hidden, true);
  assert.equal(focus.el.id, 'more-btn');
});

// ── One card per lesson, and its milestone marks (F16 items 4 and 5) ───────

function evidenceTab(ss, rows) {
  const ev = ss.insertSheet('CompetencyEvidence');
  ev.appendRow(['evidence_id', 'student_email', 'competency_id', 'milestone_text', 'outcome', 'config_id',
    'evaluated_at', 'student_file_id', 'archive_status']);
  rows.forEach(([file, comp, outcome, at, archived]) => ev.appendRow(['e', ME, comp, comp + ' text', outcome, file,
    new Date(at), 'f-' + file, archived || '']));
}

test('milestone marks: up to three, primary first, in the student\'s words; the best check counts; Not checked yet before one', () => {
  const env = setUp();
  // L07's measured milestones, primary first, from 13c.
  const [c1, c2, c3] = env.exported.DASH_LESSON_INFO['8175-L07'].iCan.map((m) => m.id);
  const l03 = env.exported.DASH_LESSON_INFO['8175-L03'].iCan[0].id;
  evidenceTab(env.ss, [
    ['W-L07', c1, 'NOT_MET', '2026-11-02T10:00:00'],
    ['W-L07', c1, 'MET', '2026-11-05T10:00:00'],
    ['W-L07', c2, 'PARTIALLY_MET', '2026-11-05T10:00:00'],
    ['W-L07', c3, 'MET', '2026-11-05T10:00:00', 'ARCHIVED'],
    ['W-L03', l03, 'NOT_MET', '2026-11-05T10:00:00'],
  ]);
  const by = Object.fromEntries(env.data().assignments.map((a) => [a.configId, a]));
  const ms = by['W-L07'].milestones;
  assert.ok(ms.length >= 1 && ms.length <= 3);
  assert.ok(ms.every((m) => /^I can /.test(m.text)), 'the student\'s own words');
  const mark = Object.fromEntries(ms.map((m) => [m.id, m.mark]));
  assert.equal(ms[0].id, c1, 'the primary first');
  assert.equal(mark[c1], 'Shown', 'the best check counts');
  assert.equal(mark[c2], 'Partly shown');
  assert.equal(mark[c3], 'Not checked yet', 'archived evidence does not count');
  assert.equal(by['W-L03'].milestones[0].mark, 'Not shown yet');
  assert.ok(by['W-L05'].milestones.every((m) => m.mark === 'Not checked yet'), 'nothing checked yet');
  assert.deepEqual(by['W-CUSTOM-A'].milestones, [], 'a teacher\'s own task has none');
  const { ctx } = page(env.exported);
  const h = ctx.marksHtml(by['W-L07']);
  assert.match(h, /<ul class="marks" aria-label="What this lesson checks"><li><span class="mark mark-MET">Shown<\/span>I can /);
  assert.doesNotMatch(h, /\d+ of \d+|%|score|total|target/i, 'no totals, scores or targets');
  // While the check runs (2026-11-15): one caption, no tag on each line.
  const checking = ctx.marksHtml(Object.assign({}, by['W-L05'], { statusPill: 'Being checked' }));
  assert.match(checking, /^<div class="marks-cap">Checking these now<\/div>/);
  assert.doesNotMatch(checking, /class="mark |Being checked|Not checked yet/);
  // A lesson in parts: the caption says the marks cover every part so far.
  assert.match(ctx.marksHtml(by['W-L05'], true), /<div class="marks-cap">What this lesson checks, across its parts so far<\/div>/);
});

// A lesson in parts (2026-11-19): a card on Part 6 said "Shown" for what
// Parts 1-5 had shown, and read as if Part 6 had been checked. Each mark now
// says which part showed it; "Not shown yet" and a lesson not in parts don't.
test('a lesson in parts: each mark says which part showed it', () => {
  const { exported } = loadGasFiles(SD_FILES, ['_dashBestOutcomes_', '_dashAddMilestoneMarks_', 'DASH_LESSON_INFO',
    'buildStudentDashboardHtml_']);
  const info = exported.DASH_LESSON_INFO['8175-L07'];
  const [c1, c2, c3] = info.iCan.map((m) => m.id);
  const part = (n, file) => ({ lessonKey: '8175-L07', fileId: file, part: { n, count: 6 } });
  const cards = [part(1, 'f1'), part(2, 'f2'), part(4, 'f4'), part(6, 'f6')];
  const rows = [['student_file_id', 'competency_id', 'outcome', 'archive_status'],
    ['f1', c1, 'PARTIALLY_MET', ''], ['f2', c1, 'MET', ''], ['f4', c1, 'MET', ''],
    ['f1', c2, 'PARTIALLY_MET', ''], ['f2', c2, 'NOT_MET', ''],
    ['f4', c3, 'NOT_MET', ''], ['f2', c3, 'NOT_MET', '']];
  const best = JSON.parse(JSON.stringify(exported._dashBestOutcomes_(rows, cards)));
  assert.deepEqual(best['8175-L07'][c1], { outcome: 'MET', parts: [2, 4] }, 'the best, from each part that reached it');
  assert.deepEqual(best['8175-L07'][c2], { outcome: 'PARTIALLY_MET', parts: [1] });
  exported._dashAddMilestoneMarks_(cards, best);
  const where = Object.fromEntries(cards[3].milestones.map((m) => [m.id, [m.mark, m.where]]));
  assert.deepEqual(where[c1], ['Shown', 'in Parts 2 and 4']);
  if (where[c2]) assert.deepEqual(where[c2], ['Partly shown', 'in Part 1']);
  if (where[c3]) assert.deepEqual(where[c3], ['Not shown yet', ''], 'not shown in any part: no part named');
  const { ctx } = page(exported);
  const h = ctx.marksHtml(cards[3], true);
  assert.match(h, /<span class="mark mark-MET">Shown in Parts 2 and 4<\/span>I can /);
  assert.doesNotMatch(ctx.marksHtml(cards[3], false), /in Part/, 'only on a lesson-in-parts card');
  // A lesson not in parts: no part to name.
  const whole = [{ lessonKey: '8175-L07', fileId: 'w1' }];
  exported._dashAddMilestoneMarks_(whole, exported._dashBestOutcomes_([rows[0], ['w1', c1, 'MET', '']], whole));
  assert.equal(whole[0].milestones[0].where, '');
});

function partsSetUp() {
  const env = setUp();
  const L = env.L;
  const ledger = env.ss.getSheetByName('Ledger');
  const sa = env.ss.getSheetByName('StudentAssignments');
  const statuses = [['COMPLETE', 'PASSED'], ['COMPLETE', 'NEEDS_REVISION'], ['ACTIVE', ''], ['SCHEDULED', '']];
  statuses.forEach(([st, res], i) => {
    const r = new Array(27).fill('');
    const id = 'W-HYPE-P' + (i + 1);
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = ME; r[L.CONFIG_ID] = id; r[L.FILE_ID] = 'f-' + id; r[L.STUDENT_NAME] = 'Amy';
    r[L.TEACHER_EMAIL] = TEACHER; r[L.TEACHER_NAME] = 'Teacher'; r[L.COURSE_NAME] = 'The Hype Machine — Part ' + (i + 1) + ': Step ' + (i + 1);
    r[L.CLASS_NAME] = C8177; r[L.BLOCK] = '3'; r[L.PERIOD] = '3'; r[L.STATUS] = st; r[L.LAST_RESULT] = res; r[L.ACADEMIC_YEAR] = '2627_MP2';
    ledger.appendRow(r);
    sa.appendRow([id, ME, 'CAS-8177-THE-HYPE-MACHINE-P' + (i + 1), new Date()]);
  });
  return env;
}

test('one card per lesson: the part to work on now, a stepper, one next action, the other parts on a button', () => {
  const env = partsSetUp();
  const data = env.data();
  const p = page(env.exported, data);
  const h = p.html;
  assert.equal((h.match(/class="card [A-Z_]+ lesson-card"/g) || []).length, 1, 'one lesson card for the lesson in parts');
  const lesson = h.slice(h.indexOf('lesson-card'), h.indexOf('class="parts-list"'));
  assert.match(lesson, /<div class="part-sub">Part 2 of 4: Step 2<\/div>/, 'Part 2 needs revising: it is the one to work on');
  assert.match(lesson, /aria-label="Parts: 1 of 4 done">(<button[^>]*>[●◉○]<\/button>){4}<\/span>1 of 4 parts done/);
  assert.deepEqual((lesson.match(/>([●◉○])<\/button>/g) || []).map((x) => x[1]), ['●', '◉', '○', '○']);
  // The label names the part it describes (2026-11-15): the marks cover every part so far.
  assert.match(lesson, /<div class="pill pill-[A-Z_]+">Part 2: [^<]+<\/div>/);
  assert.equal((lesson.match(/act-primary/g) || []).length, 1, 'one next action');
  assert.match(lesson, /🔒 Part 4 (opens when Part 3 meets its goal(: \u201c[^\u201d]+\u201d)?, or when your teacher opens it|is waiting on Part 3, which hasn\u2019t been submitted)\./);
  assert.match(h, /<div class="parts-list" id="parts-CAS-8177-THE-HYPE-MACHINE" role="region"[^>]*hidden>/);
  // Tap: the other parts show, the button says so, and focus stays on it.
  const btn = { getAttribute: () => 'CAS-8177-THE-HYPE-MACHINE' };
  p.ctx.toggleParts(btn);
  assert.match(p.els.main.innerHTML, /aria-expanded="true"[^>]*>Hide the other parts<\/button><div class="parts-list"[^>]*>(?!.*hidden)/);
  p.ctx.toggleParts(btn);
  assert.match(p.els.main.innerHTML, /parts-list"[^>]*hidden>/);
  // A dot shows that part in the card (2026-11-16): Part 1's, then back to Part 2.
  p.ctx.showPart({ getAttribute: (k) => (k === 'data-lesson' ? 'CAS-8177-THE-HYPE-MACHINE' : '1'), className: 'dot' });
  let main = p.els.main.innerHTML;
  main = main.slice(main.indexOf('lesson-card'), main.indexOf('class="parts-list"'));
  assert.match(main, /<div class="part-sub">Part 1 of 4: Step 1<\/div>/, 'Part 1 is shown');
  assert.match(main, /data-n="1" aria-label="Part 1 of 4: Step 1, done, shown" aria-current="true"/);
  // A locked dot opens "All parts" (where its line says what opens it); the shown part stays.
  p.ctx.showPart({ getAttribute: (k) => (k === 'data-lesson' ? 'CAS-8177-THE-HYPE-MACHINE' : '4'), className: 'dot dot-locked' });
  assert.match(p.els.main.innerHTML, /aria-expanded="true"/);
  assert.match(p.els.main.innerHTML, /<div class="part-sub">Part 1 of 4: Step 1<\/div>/);
  p.ctx.showPart({ getAttribute: (k) => (k === 'data-lesson' ? 'CAS-8177-THE-HYPE-MACHINE' : '2'), className: 'dot' });
  p.ctx.toggleParts(btn);
  // Do next to a part under "All parts" opens them first.
  p.ctx.goToCard('card-W-HYPE-P1');
  assert.match(p.els.main.innerHTML, /aria-expanded="true"/);
});

test('after a re-render (a submit, a refresh) focus stays where it was, or on its card', () => {
  const env = setUp();
  const data = env.data();
  const p = page(env.exported);
  const focused = [];
  const elFor = (id) => ({ id, getAttribute: () => null, focus() { focused.push(id); } });
  const doc = p.ctx.document;
  const getById = doc.getElementById;
  let active = { id: 'sub-card-W-L07', getAttribute: (k) => (k === 'data-file' ? 'f-W-L07' : null) };
  Object.defineProperty(doc, 'activeElement', { get: () => active, configurable: true });
  doc.getElementById = (id) => (id === 'sub-card-W-L07' || id === 'card-W-L07' ? elFor(id) : getById(id));
  p.ctx.render(data);
  assert.deepEqual(focused, ['sub-card-W-L07'], 'the same button');
  // The reflection form's button is gone after the submit: its card.
  active = { id: '', getAttribute: (k) => (k === 'data-file' ? 'f-W-L07' : null) };
  focused.length = 0;
  p.ctx.render(data);
  assert.deepEqual(focused, ['card-W-L07']);
});

test('demo mode: the lesson cards have their marks and the lesson in parts its stepper', () => {
  const env = setUp({ viewer: TEACHER });
  const d = plain(env.exported.getDemoDashboardData());
  const marks = d.dashboard.assignments.flatMap((a) => (a.milestones || []).map((m) => m.mark));
  for (const w of ['Shown', 'Not shown yet', 'Not checked yet']) assert.ok(marks.includes(w), 'a mark: ' + w);
  const { html } = page(env.exported, d.dashboard);
  assert.match(html, /class="stepper"/);
  assert.match(html, /class="marks"/);
});

// ── Sort and filters (F16 item 3) ──────────────────────────────────────────

test('sort: Assigned order by default; Needs attention first, Recently checked and Not yet shown first on request', () => {
  const env = setUp();
  evidenceTab(env.ss, [['W-L03', env.exported.DASH_LESSON_INFO['8175-L03'].iCan[0].id, 'NOT_MET', '2026-11-05T10:00:00']]);
  const data = env.data();
  data.assignments.find((a) => a.configId === 'W-L05').lastEvalAt = Date.parse('2026-11-10T10:00:00');
  data.assignments.find((a) => a.configId === 'W-CUSTOM-B').lastEvalAt = Date.parse('2026-11-08T10:00:00');
  const p = page(env.exported, data);
  const order = () => {
    const h = p.els.main.innerHTML;
    const cards = h.slice(h.indexOf('class="group-header"'));
    return ['W-L03', 'W-L05', 'W-L07', 'W-CUSTOM-B', 'W-CUSTOM-A'].sort((x, y) => cards.indexOf('id="card-' + x + '"') - cards.indexOf('id="card-' + y + '"'));
  };
  assert.match(p.els.main.innerHTML, /<select id="sort-sel" onchange="setSort\(this.value\)"><option value="assigned" selected>Assigned order<\/option>/);
  assert.deepEqual(order(), ['W-L03', 'W-L05', 'W-L07', 'W-CUSTOM-B', 'W-CUSTOM-A'], 'assigned order');
  p.ctx.setSort('attention');
  assert.equal(order()[0], 'W-L07', 'the card to revise first');
  assert.match(p.els.main.innerHTML, /<option value="attention" selected>/);
  p.ctx.setSort('recent');
  assert.deepEqual(order().slice(0, 2), ['W-L05', 'W-CUSTOM-B'], 'the latest check first');
  p.ctx.setSort('notshown');
  assert.equal(order()[0], 'W-L03', 'the primary milestone not shown yet first');
  // Kept for the visit: a refresh's render keeps it.
  p.ctx.render(data);
  assert.match(p.els.main.innerHTML, /<option value="notshown" selected>/);
  p.ctx.setSort('nonsense');
  assert.match(p.els.main.innerHTML, /<option value="notshown" selected>/, 'an unknown sort changes nothing');
  // A new visit (a new page) starts at Assigned order.
  assert.match(page(env.exported, data).html, /<option value="assigned" selected>/);
});

test('filter chips: toggle buttons; any number on; a lesson in parts by the part on its card; Do next unchanged', () => {
  const env = partsSetUp();
  const data = env.data();
  const p = page(env.exported, data);
  const html = () => p.els.main.innerHTML;
  const cardsPart = () => html().slice(html().indexOf('class="list-controls"'));
  assert.match(html(), /<div class="chips" role="group" aria-label="Show only"><button type="button" class="chip" id="chip-NEEDS_ACTION" data-filter="NEEDS_ACTION" aria-pressed="false"/);
  const chip = (f) => ({ getAttribute: () => f });
  p.ctx.toggleFilter(chip('DONE'));
  assert.match(html(), /id="chip-DONE" data-filter="DONE" aria-pressed="true"/);
  assert.ok(cardsPart().includes('id="card-W-L03"'), 'the passed lesson');
  assert.ok(!cardsPart().includes('id="card-W-L05"'), 'not started: hidden');
  assert.ok(!cardsPart().includes('lesson-card'), 'the lesson in parts is on Part 2, to revise');
  p.ctx.toggleFilter(chip('NEEDS_ACTION'));
  assert.ok(cardsPart().includes('lesson-card') && cardsPart().includes('id="card-W-L07"'));
  assert.match(html(), /class="do-next"/, 'Do next still lists everything that needs the student');
  p.ctx.toggleFilter(chip('DONE'));
  p.ctx.toggleFilter(chip('NEEDS_ACTION'));
  p.ctx.toggleFilter(chip('IN_PROGRESS'));
  assert.match(html(), /Nothing here with these filters\. <button type="button" class="chip" onclick="clearFilters\(\)">Show all<\/button>/);
  p.ctx.clearFilters();
  assert.ok(cardsPart().includes('id="card-W-L05"'));
});

// "Show me around" (2026-11-17): in More always; by itself on a student's
// first visit only (the server keeps a hash of each account that has seen
// it, never in the browser), never in the teacher's demo; a step whose part
// isn't on the page is left out.
function tourPage(demo) {
  const env = setUp();
  const html = env.exported.buildStudentDashboardHtml_({ demo });
  const started = [], calls = [];
  const els = {};
  const ctx = {
    document: { getElementById: (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', textContent: '', className: '', options: [],
      setAttribute() {}, getAttribute() { return null; }, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} }, focus() {} }),
      addEventListener() {}, querySelectorAll: () => [], querySelector: (s) => (s === '.dash-tabs' ? {} : null),
      createElement: () => ({}) },
    google: { script: { run: new Proxy({}, { get: (t, name) => function () { calls.push(String(name)); return this; } }) } },
    console, setTimeout: (f, ms) => { if (ms === 600) f(); }, setInterval() {}, navigator: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(html).forEach((code) => vm.runInContext(code, ctx));
  ctx.__started = started;
  vm.runInContext('var __realStart = startTour; startTour = function () { __started.push(1); };', ctx);
  calls.length = 0;
  return { html, ctx, started, calls, env };
}

test('Show me around: in More; starts by itself on a student\'s first visit only, remembered on the server', () => {
  const { html, ctx, started } = tourPage(false);
  assert.match(html, /<button id="tour-btn" type="button" role="menuitem" tabindex="-1" aria-haspopup="dialog">.*Show me around<\/button>/);
  ctx.tourMaybeStart({ assignments: [], tourSeen: false });
  assert.equal(started.length, 0, 'no cards yet: wait');
  ctx.tourMaybeStart({ assignments: [{}], tourSeen: false });
  assert.equal(started.length, 1, 'first visit with cards: it starts');
  ctx.tourMaybeStart({ assignments: [{}], tourSeen: false });
  assert.equal(started.length, 1, 'once per page load');
  const seen = tourPage(false);
  seen.ctx.tourMaybeStart({ assignments: [{}], tourSeen: true });
  assert.equal(seen.started.length, 0, 'seen: only from More');
  const unknown = tourPage(false);
  unknown.ctx.tourMaybeStart({ assignments: [{}] });
  assert.equal(unknown.started.length, 0, 'no answer from the server: wait to be asked');
  const demo = tourPage(true);
  demo.ctx.tourMaybeStart({ assignments: [{}], tourSeen: false });
  assert.equal(demo.started.length, 0, 'the teacher\'s demo waits to be asked');
});

test('Show me around: the server keeps a hash per account that has seen it, never the account', () => {
  const env = setUp();
  const { sandbox } = env;
  const { exported } = loadGasFiles(SD_FILES, ['markMyTourSeen', 'dashTourSeen_'], {
    Session: { getActiveUser: () => ({ getEmail: () => ME }), getEffectiveUser: () => ({ getEmail: () => TEACHER }), getScriptTimeZone: () => 'America/New_York' },
    PropertiesService: sandbox.PropertiesService,
  });
  assert.equal(exported.dashTourSeen_(ME), false);
  assert.equal(exported.markMyTourSeen().ok, true);
  assert.equal(exported.dashTourSeen_(ME), true);
  assert.equal(exported.dashTourSeen_('ME@ccpsnet.net'.replace('ME', 'amy')), true, 'case doesn\'t matter');
  assert.equal(exported.dashTourSeen_('ben@ccpsnet.net'), false, 'another student hasn\'t');
  exported.markMyTourSeen();
  const stored = sandbox.PropertiesService.getScriptProperties().getProperty('DASH_TOUR_SEEN');
  assert.equal(stored.split(',').length, 1, 'once per account');
  assert.doesNotMatch(stored, /@|amy/, 'a hash, never the account');
});

test('Show me around: the steps, in plain words, skip a part that isn\'t on the page', () => {
  const { ctx } = tourPage(false);
  const steps = ctx._tourSteps();
  assert.deepEqual(plain(steps.map((s) => s.title)), ['Welcome to your dashboard', 'Your record', 'Start here', 'Open your work',
    'A Slides part', 'Send it for feedback', 'Read your feedback', 'Inside your document', 'Earn your turn-in code', 'Turn it in on Canvas',
    'Come back any time']);
  // The page's own filter (startTour): a step for some pages (when), and a
  // part not on the page (el) left out unless the step can stand centered.
  const shownWith = (data) => {
    ctx._lastDashData = data;
    vm.runInContext('_lastDashData = this._lastDashData;', ctx);
    return plain(ctx._tourSteps().filter((s) => (!s.when || s.when()) && (!s.el || s.center || s.el())).map((s) => s.title));
  };
  assert.deepEqual(shownWith({ assignments: [{}] }), ['Welcome to your dashboard', 'Your record', 'Inside your document'],
    'only the tabs are on this stub page; turn-in codes off: no turn-in steps');
  assert.deepEqual(shownWith({ assignments: [{}, { turnInOn: true }] }), ['Welcome to your dashboard', 'Your record',
    'Inside your document', 'Earn your turn-in code', 'Turn it in on Canvas'],
    'turn-in codes on for a card, before any question shows: both steps, centered');
  assert.deepEqual(shownWith({ assignments: [{}, { workType: 'slides' }] }), ['Welcome to your dashboard', 'Your record',
    'A Slides part', 'Inside your document'], 'a Slides part on the page: its step, centered when its button is not found');
  assert.match(steps.find((s) => s.title === 'A Slides part').text, /Submit checks it first/);
  const canvas = steps.find((s) => s.title === 'Turn it in on Canvas');
  assert.match(canvas.text, /In Canvas, open the same assignment, paste the code in the text box, and submit/);
  assert.match(canvas.art, /aria-label="The code on your dashboard, pasted into the assignment in Canvas"/);
  assert.match(steps.find((s) => s.title === 'Inside your document').text, /click Comments at the top right/);
  assert.match(steps.find((s) => s.title === 'Inside your document').text, /outline on the left/);
  assert.match(steps.find((s) => s.title === 'Inside your document').art, /<svg[^>]*role="img"[^>]*aria-label="A Google Doc: Comments at the top right, the outline on the left"/);
  steps.forEach((s) => assert.ok(s.text.split(/\s+/).length <= 45, 'short: ' + s.title));
});
