'use strict';
// The Teacher Dashboard's lesson schedule panel (07, 2026-10-21):
// getLessonSchedule() shows the LessonSchedule tab by course with each
// lesson's status and the last RolloutLog run; setLessonStartDate() changes
// one start date, refuses an edit made over a newer sheet value, and asks to
// be confirmed before a change the nightly rollout acts on soon.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [S('00_SharedConfig.js'), S('07_TeacherDashboard.js')];
const EXPOSE = ['getLessonSchedule', 'setLessonStartDate', 'setLessonHold'];
const TEACHER = 'teacher@example.com'; // the sandbox's default Session user

// "Today" as the dashboard sees it (America/New_York), and days from it.
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
const day = (n) => ymd(new Date(Date.now() + n * 86400000));

const HEADERS = ['course', 'lesson_key', 'lesson', 'start_date', 'config_id', 'notes'];

function setUp(opts) {
  const o = opts || {};
  const env = loadGasFiles(FILES, EXPOSE);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', o.teacher || TEACHER);
  const ls = ss.insertSheet('LessonSchedule');
  ls.appendRow(HEADERS);
  (o.rows || []).forEach((r) => ls.appendRow(r));
  return Object.assign(env, { ss, ls });
}

function rows() {
  return [
    ['8175', '8175-L01', 'Lesson 01', day(-20), 'CAS-8175-L01', ''],
    ['8175', '8175-L02', 'Lesson 02', day(-3), 'CAS-8175-L02', ''],
    ['8175', '8175-L03', 'Lesson 03', day(1), 'CAS-8175-L03', ''],
    ['8175', '8175-L04', 'Lesson 04', day(30), 'CAS-8175-L04', ''],
    ['8175', '8175-L05', 'Lesson 05', '', 'CAS-8175-L05', ''],
    ['8177', '8177-intro', 'Intro', day(-10), 'CAS-8177-INTRO', ''],
    ['8177', '8177-next', 'Next', day(-15), 'CAS-8177-NEXT', ''],
  ];
}

const startOf = (env, key) => {
  const r = env.ls.getDataRange().getValues().find((x) => x[1] === key);
  return r[3];
};

test('only the configured teacher can read or change the schedule', () => {
  const env = setUp({ teacher: 'someone.else@example.com', rows: rows() });
  assert.deepEqual(env.exported.getLessonSchedule(), { success: false, error: 'Not authorized.' });
  assert.equal(env.exported.setLessonStartDate('8175-L04', day(40), day(30), true).success, false);
  assert.equal(startOf(env, '8175-L04'), day(30));
});

test('the schedule by course: status, warnings, and the last rollout run only', () => {
  const env = setUp({ rows: rows() });
  const log = env.ss.insertSheet('RolloutLog');
  log.appendRow(['Timestamp', 'Mode', 'Course', 'Lesson', 'Step', 'Count', 'Detail']);
  const old = new Date(Date.now() - 2 * 86400000);
  const last = new Date(Date.now() - 3600000);
  log.appendRow([old, 'SHADOW', '8175', 'CAS-8175-L03', 'SEED', 1, 'would add']);
  log.appendRow([last, 'APPLY', '8175', 'CAS-8175-L03', 'SEED', 1, 'added to the TeacherMatrix as LIVE']);
  log.appendRow([last, 'APPLY', '8175', 'CAS-8175-L03', 'ENROLL', 24, 'made 24 docs']);
  log.appendRow([last, 'APPLY', '8175', 'CAS-8175-L03', 'PROBLEM', 2, 'enrollment failed: 2 no account']);
  log.appendRow([last, 'SHADOW', '8177', 'CAS-8177-INTRO', 'RELEASE', 0, 'would share and open']);

  const out = env.exported.getLessonSchedule();
  assert.equal(out.success, true);
  assert.equal(out.today, day(0));
  assert.deepEqual(out.courses.map((c) => c.code), ['8175', '8177']);
  const [m, g] = out.courses;
  assert.deepEqual(m.lessons.map((l) => l.status), ['taught', 'current', 'upcoming', 'upcoming', 'undated']);
  assert.equal(m.current, '8175-L02');
  assert.equal(m.rolloutMode, 'APPLY');
  assert.equal(g.rolloutMode, 'SHADOW');
  const l3 = m.lessons[2].rollout;
  assert.deepEqual(l3.steps.map((s) => [s.step, s.count]), [['SEED', 1], ['ENROLL', 24]], 'the older run is left out');
  assert.deepEqual(l3.problems, ['enrollment failed: 2 no account']);
  assert.equal(m.lessons[3].rollout, null);
  // 8177: the second lesson starts before the first, so the first is current.
  assert.equal(g.current, '8177-intro');
  assert.match(g.lessons[1].warnings[0], /starts before a lesson listed above it/);
});

test('a date Sheets stored as a Date reads as YYYY-MM-DD; text that is no date is flagged', () => {
  const r = rows();
  r[3][3] = new Date(2030, 0, 15);
  r[4][3] = 'next week';
  const env = setUp({ rows: r });
  const m = env.exported.getLessonSchedule().courses[0];
  assert.equal(m.lessons[3].start, '2030-01-15');
  assert.equal(m.lessons[4].start, '');
  assert.equal(m.lessons[4].status, 'undated');
  assert.match(m.lessons[4].warnings[0], /can't be read/);
});

test('a date outside the rollout window is saved as text at once', () => {
  const env = setUp({ rows: rows() });
  const out = env.exported.setLessonStartDate('8175-L04', day(45), day(30));
  assert.equal(out.success, true);
  assert.equal(startOf(env, '8175-L04'), day(45));
  assert.equal(out.courses[0].lessons[3].start, day(45));
});

test('a date the rollout acts on soon asks first, and writes only once confirmed', () => {
  const env = setUp({ rows: rows() });
  const ask = env.exported.setLessonStartDate('8175-L04', day(1), day(30));
  assert.equal(ask.success, false);
  assert.match(ask.confirm, /Change Lesson 04 from .* to .*\? Note: tonight's rollout will plan/);
  assert.equal(startOf(env, '8175-L04'), day(30), 'nothing written before the confirm');
  const ok = env.exported.setLessonStartDate('8175-L04', day(1), day(30), true);
  assert.equal(ok.success, true);
  assert.equal(startOf(env, '8175-L04'), day(1));
});

test('clearing the current lesson and a past date both ask first', () => {
  const env = setUp({ rows: rows() });
  assert.match(env.exported.setLessonStartDate('8175-L02', '', day(-3)).confirm,
    /lesson the course is on now; clearing its date makes the previous lesson current again/);
  assert.match(env.exported.setLessonStartDate('8175-L05', day(-1), '').confirm, /in the past/);
});

test('Hold and Release: the release cell, its header on an old tab, and the date warning', () => {
  const env = setUp({ rows: rows() });
  assert.equal(env.exported.getLessonSchedule().courses[0].lessons[2].hold, false, 'no column: nothing held');
  const out = env.exported.setLessonHold('8175-L03', true);
  assert.equal(out.success, true);
  assert.equal(env.ls.getRange(1, 7).getValue(), 'release');
  assert.equal(env.ls.getRange(4, 7).getValue(), 'HOLD');
  assert.deepEqual(out.courses[0].lessons.map((l) => l.hold), [false, false, true, false, false]);
  assert.match(env.exported.setLessonStartDate('8175-L03', day(2), day(1)).confirm, /held from the rollout/);
  env.exported.setLessonHold('8175-L03', false);
  assert.equal(env.ls.getRange(4, 7).getValue(), '');
  assert.match(env.exported.setLessonHold('8175-L99', true).error, /No lesson 8175-L99/);
});

test('only the configured teacher can hold a lesson', () => {
  const env = setUp({ teacher: 'someone.else@example.com', rows: rows() });
  assert.deepEqual(env.exported.setLessonHold('8175-L03', true), { success: false, error: 'Not authorized.' });
});

test('an edit over a newer sheet value, or a date that does not exist, is refused', () => {
  const env = setUp({ rows: rows() });
  const stale = env.exported.setLessonStartDate('8175-L04', day(50), day(29), true);
  assert.equal(stale.success, false);
  assert.match(stale.error, /changed in the sheet since the panel loaded/);
  assert.ok(stale.courses, 'the refusal carries the current schedule');
  assert.equal(startOf(env, '8175-L04'), day(30));
  assert.match(env.exported.setLessonStartDate('8175-L04', '2026-02-30', day(30), true).error, /Not a date/);
  assert.match(env.exported.setLessonStartDate('8175-L99', day(50), '', true).error, /No lesson 8175-L99/);
});

// 2026-10-21: the 💬 Feedback and ✉ Parent Reports modals added the class
// "show", but the dashboard's CSS opens a backdrop on ".open", so neither
// ever appeared. Every backdrop is opened and closed with "open".
test('every modal backdrop opens and closes with the "open" class the CSS uses', () => {
  const { exported } = loadGasFiles(FILES, ['buildDashboardHtml_']);
  const html = exported.buildDashboardHtml_();
  assert.match(html, /\.modal-backdrop\.open\{display:flex/);
  const uses = [...html.matchAll(/(?:-backdrop"\)|backdrop)\.classList\.(add|remove)\("(\w+)"\)/g)].map((m) => m[2]);
  assert.ok(uses.length >= 6);
  assert.deepEqual([...new Set(uses)], ['open']);
  // 2026-10-22: the six panels open and close through one helper.
  for (const id of ['profile', 'score-review', 'settings', 'lesson-schedule', 'parent-report', 'scr-review']) {
    assert.match(html, new RegExp('_openPanel\\("' + id + '-modal-backdrop"'), id);
    assert.match(html, new RegExp('_closePanel\\("' + id + '-modal-backdrop"\\)'), id);
  }
  assert.match(html, /id="lesson-schedule-btn" onclick="openLessonScheduleModal\(\)"/);
});

// ── The panel's client code, run against a small fake page (2026-10-22) ────
// UX audit fix-first 9 and 10: a date saves on blur or Enter once it is a
// whole date, and the lesson editor keeps its form on a failed save and asks
// before discarding unsaved edits.
const vm = require('vm');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

function fakePage() {
  const els = {};
  const listeners = {};
  const doc = {
    activeElement: null,
    getElementById: (id) => els[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => fakeEl('x' + Math.random()),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
  };
  function fakeEl(id, extra) {
    const classes = new Set();
    const el = Object.assign({
      id, style: {}, value: '', innerHTML: '', textContent: '', options: [], attrs: {},
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      addEventListener() {}, appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [],
      matches: () => false, focus() { doc.activeElement = this; }, closest: () => null,
    }, extra || {});
    els[id] = el;
    return el;
  }
  doc.body = fakeEl('body');
  // google.script.run: each server call is recorded with its handlers.
  const calls = [];
  const chain = (h) => new Proxy({}, {
    get: (_, name) => {
      if (name === 'withSuccessHandler') return (f) => { h.ok = f; return chain(h); };
      if (name === 'withFailureHandler') return (f) => { h.fail = f; return chain(h); };
      return (...args) => { calls.push({ name, args, ok: h.ok, fail: h.fail }); };
    },
  });
  const confirms = [];
  const win = { confirmAnswer: true, confirm: (q) => { confirms.push(q); return win.confirmAnswer; }, open() {}, addEventListener() {} };
  const { exported } = loadGasFiles(FILES, ['buildDashboardHtml_']);
  const code = extractInlineScripts(exported.buildDashboardHtml_()).find((c) => c.includes('function renderLessonSchedule'));
  const store = {};
  const ctx = vm.createContext({
    document: doc, window: win, console, setTimeout, clearTimeout, Intl, Date,
    google: { script: { get run() { return chain({}); } } },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  ['lesson-schedule-modal-backdrop', 'lesson-schedule-modal-body', 'main', 'loading', 'term-filter',
    'discard-confirm-backdrop', 'modal-backdrop'].forEach((id) => fakeEl(id));
  new vm.Script(code).runInContext(ctx);
  calls.length = 0;
  const fire = (type, e) => (listeners[type] || []).forEach((fn) => fn(e));
  return { ctx, doc, els, fakeEl, calls, confirms, win, fire, store };
}

const SCHEDULE = {
  success: true, leadDays: 3, rolloutRunAt: '', today: '2026-10-22',
  courses: [{ code: '8175', rolloutMode: 'APPLY', lessons: [
    { key: '8175-L04', lesson: 'Lesson 04', status: 'upcoming', start: '2026-11-20', warnings: [], rollout: null },
    { key: '8175-L05', lesson: 'Lesson 05', status: 'upcoming', start: '2026-12-01', warnings: [], rollout: null },
  ] }],
};
const schedule = () => JSON.parse(JSON.stringify(SCHEDULE));

function dateBox(page, key, value) {
  const box = page.fakeEl('ls-' + key, {
    value, attrs: { 'data-ls-key': key },
    matches: (sel) => sel.includes('input[data-ls-key]'),
  });
  page.fakeEl('ls-' + key + '-msg');
  return box;
}

test('📅 Lessons: a date box has no onchange save, and the panel says it saves on Enter or leaving the box', () => {
  const page = fakePage();
  page.ctx.renderLessonSchedule(schedule());
  const body = page.els['lesson-schedule-modal-body'].innerHTML;
  assert.doesNotMatch(body, /onchange="saveLessonStartDate/);
  assert.match(body, /<input type="date" id="ls-8175-L04" value="2026-11-20" data-ls-key="8175-L04"/);
  assert.match(body, /press Enter or leave the box/);
});

test('📅 Lessons: a half-typed date is not saved; a whole date saves once on Enter or blur', () => {
  const page = fakePage();
  page.ctx.renderLessonSchedule(schedule());
  const box = dateBox(page, '8175-L04', '');
  // Mid-typing, a browser reports "" or a year still being typed.
  page.fire('focusout', { target: box, relatedTarget: null });
  box.value = '0202-11-05';
  page.fire('focusout', { target: box, relatedTarget: null });
  assert.equal(page.calls.filter((c) => c.name === 'setLessonStartDate').length, 0, 'nothing is sent for an incomplete date');
  assert.match(page.els['ls-8175-L04-msg'].textContent, /Not saved: type the whole date/);

  box.value = '2026-11-05';
  page.fire('keydown', { key: 'Enter', target: box, preventDefault() {} });
  page.fire('focusout', { target: box, relatedTarget: null });
  const saves = page.calls.filter((c) => c.name === 'setLessonStartDate');
  assert.equal(saves.length, 1, 'Enter then blur saves once');
  assert.deepEqual([...saves[0].args.slice(0, 3)], ['8175-L04', '2026-11-05', '2026-11-20']);
});

test('📅 Lessons: a save that lands while another date box has focus waits, then re-renders', () => {
  const page = fakePage();
  page.ctx.renderLessonSchedule(schedule());
  const box = dateBox(page, '8175-L04', '2026-11-05');
  page.fire('focusout', { target: box, relatedTarget: null });
  const save = page.calls.find((c) => c.name === 'setLessonStartDate');
  const other = dateBox(page, '8175-L05', '2026-12-01');
  other.focus();
  const before = page.els['lesson-schedule-modal-body'].innerHTML;
  const after = schedule();
  after.courses[0].lessons[0].start = '2026-11-05';
  save.ok(after);
  assert.equal(page.els['lesson-schedule-modal-body'].innerHTML, before, 'no re-render while typing in another box');
  assert.equal(page.els['ls-8175-L04-msg'].textContent, 'Saved ✓');
  page.fire('focusout', { target: other, relatedTarget: null });
  assert.match(page.els['lesson-schedule-modal-body'].innerHTML, /id="ls-8175-L04" value="2026-11-05"/);
});

test('📅 Lessons: Hold and Release buttons; holding a started lesson asks first', () => {
  const page = fakePage();
  const data = schedule();
  data.courses[0].lessons[1].hold = true;
  page.ctx.renderLessonSchedule(data);
  const body = page.els['lesson-schedule-modal-body'].innerHTML;
  assert.match(body, /data-ld="hold" data-key="8175-L04"[^>]*>Hold<\/button>/);
  assert.match(body, /data-ld="hold" data-key="8175-L05"[^>]*>Release<\/button>/);
  assert.match(body, /Held: no student docs/);
  page.fakeEl('ls-8175-L04-msg');
  page.ctx._ldAction({ getAttribute: (k) => (k === 'data-ld' ? 'hold' : '8175-L04') });
  const call = page.calls.find((c) => c.name === 'setLessonHold');
  assert.deepEqual([...call.args], ['8175-L04', true]);
  assert.equal(page.confirms.length, 0, 'an upcoming lesson does not ask');
  call.ok({ success: false, error: 'Locked' });
  assert.match(page.els['ls-8175-L04-msg'].textContent, /Not changed: Locked/);

  const started = schedule();
  started.courses[0].lessons[0].status = 'current';
  page.ctx.renderLessonSchedule(started);
  page.calls.length = 0;
  page.win.confirmAnswer = false;
  page.ctx._ldAction({ getAttribute: (k) => (k === 'data-ld' ? 'hold' : '8175-L04') });
  assert.match(page.confirms[0], /Docs students already have stay shared/);
  assert.equal(page.calls.length, 0, 'declined: nothing sent');
});

test('📅 Lessons: a failed date save says so in the row and leaves the table', () => {
  const page = fakePage();
  page.ctx.renderLessonSchedule(schedule());
  const box = dateBox(page, '8175-L04', '2026-11-05');
  page.fire('focusout', { target: box, relatedTarget: null });
  const before = page.els['lesson-schedule-modal-body'].innerHTML;
  page.calls.find((c) => c.name === 'setLessonStartDate').fail({ message: 'Service unavailable' });
  assert.equal(page.els['lesson-schedule-modal-body'].innerHTML, before);
  assert.match(page.els['ls-8175-L04-msg'].textContent, /Not saved: Service unavailable/);
});

const EDITOR = {
  success: true, isNew: false,
  lesson: { key: '8175-L04', title: 'Lesson 04', course: '8175', source: 'lesson data',
    current: { promptText: 'Old task', warmupAnchor: 'Anchor', objective: 'Obj', vocabulary: '',
      competencyIds: ['T1'], primary: 'T1', secondary: [], tertiary: [] } },
  catalog: [], catalogAvailable: true, uncovered: [], draft: null,
  labels: { promptText: 'Student task', warmupAnchor: 'Warm-up anchor', objective: 'Objective', vocabulary: 'Vocabulary' },
};

function openEditor(page) {
  page.ctx.openLessonScheduleModal();
  page.ctx.renderLessonEditor(JSON.parse(JSON.stringify(EDITOR)));
  ['promptText', 'warmupAnchor', 'objective', 'vocabulary', 'reason'].forEach((k) => page.fakeEl('ld-' + k));
  page.els['ld-promptText'].value = 'Old task';
  page.els['ld-warmupAnchor'].value = 'Anchor';
  page.els['ld-objective'].value = 'Obj';
  page.calls.length = 0;
}
const act = (name) => ({ getAttribute: () => name });

test('lesson editor: a failed save keeps the typed form and says it was not saved', () => {
  const page = fakePage();
  openEditor(page);
  page.els['ld-promptText'].value = 'A new task I typed';
  page.els['ld-reason'].value = 'Clearer wording';
  page.ctx._ldAction(act('save'));
  page.calls.find((c) => c.name === 'saveLessonDraft').fail({ message: 'Timed out' });
  const body = page.els['lesson-schedule-modal-body'].innerHTML;
  assert.doesNotMatch(body, /Could not load/);
  assert.match(body, /Not saved: Timed out\. Your changes are still here/);
  assert.match(body, /A new task I typed<\/textarea>/);
  assert.match(body, /Clearer wording<\/textarea>/);
  // A refusal from the server keeps the form too.
  page.ctx._ldAction(act('save'));
  page.calls.filter((c) => c.name === 'saveLessonDraft').pop().ok({ success: false, error: 'Reason is required.' });
  assert.match(page.els['lesson-schedule-modal-body'].innerHTML, /A new task I typed<\/textarea>/);
});

test('lesson editor: a lesson that cannot be opened says why, with a way back', () => {
  const page = fakePage();
  page.ctx.openLessonEditor('8175-L04');
  page.calls.find((c) => c.name === 'getLessonEditor').fail({ message: 'Quota' });
  const body = page.els['lesson-schedule-modal-body'].innerHTML;
  assert.match(body, /Could not open the lesson: Quota/);
  assert.match(body, /data-ld="back">← Back to the schedule/);
});

test('lesson editor: ← Back and × ask before discarding unsaved edits, and not when nothing changed', () => {
  const page = fakePage();
  openEditor(page);
  const backdrop = page.els['lesson-schedule-modal-backdrop'];
  page.ctx._ldAction(act('back'));
  assert.equal(page.confirms.length, 0, 'no question when nothing changed');
  assert.ok(page.calls.some((c) => c.name === 'getLessonSchedule'));

  openEditor(page);
  page.els['ld-objective'].value = 'A better objective';
  page.win.confirmAnswer = false;
  page.ctx._ldAction(act('back'));
  page.ctx.closeLessonScheduleModal();
  assert.equal(page.confirms.length, 2);
  assert.match(page.confirms[0], /Discard your unsaved changes/);
  assert.equal(page.calls.some((c) => c.name === 'getLessonSchedule'), false, 'Back stayed put');
  assert.ok(backdrop.classList.contains('open'), '× stayed open');

  page.win.confirmAnswer = true;
  page.ctx.closeLessonScheduleModal();
  assert.equal(backdrop.classList.contains('open'), false);
});

test('lesson editor: after a successful save, leaving does not ask', () => {
  const page = fakePage();
  openEditor(page);
  page.els['ld-objective'].value = 'Saved objective';
  page.els['ld-reason'].value = 'Why';
  page.ctx._ldAction(act('save'));
  const fields = Object.assign({}, EDITOR.lesson.current, { objective: 'Saved objective' });
  page.calls.find((c) => c.name === 'saveLessonDraft').ok({ success: true,
    draft: { draftId: 'LD-1', status: 'DRAFT', canEdit: true, canSubmit: true, fields, reason: 'Why', issues: [] } });
  page.ctx.closeLessonScheduleModal();
  assert.equal(page.confirms.length, 0);
});

test('one panel helper: Escape closes the top panel and puts focus back; 📅 Lessons still asks first', () => {
  const page = fakePage();
  ['parent-report-modal-backdrop', 'parent-report-modal-body'].forEach((id) => page.fakeEl(id));
  const opener = page.fakeEl('parent-report-btn');
  opener.focus();
  page.ctx.openParentReportModal();
  assert.ok(page.els['parent-report-modal-backdrop'].classList.contains('open'));
  page.fire('keydown', { key: 'Escape', target: page.doc.body });
  assert.equal(page.els['parent-report-modal-backdrop'].classList.contains('open'), false);
  assert.equal(page.doc.activeElement, opener, 'focus is back on the button that opened it');

  openEditor(page);
  page.els['ld-objective'].value = 'Unsaved';
  page.win.confirmAnswer = false;
  page.fire('keydown', { key: 'Escape', target: page.doc.body });
  assert.match(page.confirms[0], /Discard your unsaved changes/);
  assert.ok(page.els['lesson-schedule-modal-backdrop'].classList.contains('open'));
});
