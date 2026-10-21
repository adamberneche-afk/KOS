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
const EXPOSE = ['getLessonSchedule', 'setLessonStartDate'];
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
  const uses = [...html.matchAll(/-backdrop"\)\.classList\.(add|remove)\("(\w+)"\)/g)].map((m) => m[2]);
  assert.ok(uses.length >= 6);
  assert.deepEqual([...new Set(uses)], ['open']);
  assert.match(html, /id="lesson-schedule-btn" onclick="openLessonScheduleModal\(\)"/);
});
