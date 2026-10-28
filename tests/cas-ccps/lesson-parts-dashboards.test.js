'use strict';
// Lessons in parts on the dashboards (Phase 3c, 68): the Teacher Dashboard
// (07) shows one row per student for the lesson, on the student's furthest
// open part, with the parts before it and an unlock for the next; the
// Student Dashboard (13) shows the open parts together, "Part 2 of 5", and
// a line for each locked part saying what opens it.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const TEACHER = 'teacher@example.com'; // the sandbox's default signed-in user
const LESSON = 'CAS-8177-MARKET-RESEARCH-SURVEY-DESIGN';
const TITLES = ['The Target Market', 'Build the Survey', 'Why These Questions Work', 'Spot the Bias', 'Beyond the Survey'];
const PROJECT_FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:teacher-dashboard'].files
  .map(f => path.join(__dirname, '..', '..', f));

// Two students in the Market Research lesson: Amy has Parts 1 and 2 open,
// Bo has none yet (the lesson isn't released). Cy has a whole lesson.
// open: { name: number of parts open }.
function setUp(sandbox, L, open) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['StudentConfigID', 'GoogleID', 'AssignmentConfigID', 'RecordedAt']);
  const row = (name, sid, unit, status) => {
    const r = new Array(27).fill('');
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = name + '@ccpsnet.net'; r[L.CONFIG_ID] = sid;
    r[L.FILE_ID] = 'f-' + sid; r[L.STUDENT_NAME] = name; r[L.TEACHER_EMAIL] = TEACHER;
    r[L.COURSE_NAME] = unit; r[L.CLASS_NAME] = '8177 Sports Entertainment'; r[L.BLOCK] = '3';
    r[L.PERIOD] = '3'; r[L.STATUS] = status;
    return r;
  };
  Object.keys(open).forEach(name => {
    TITLES.forEach((t, i) => {
      const sid = 'VDOE-' + name + '-' + (i + 1);
      ledger.appendRow(row(name, sid, 'Venue Market Research & Survey Design — Part ' + (i + 1) + ': ' + t,
        i < open[name] ? 'ACTIVE' : 'SCHEDULED'));
      sa.appendRow([sid, '', LESSON + '-P' + (i + 1), '']);
    });
  });
  ledger.appendRow(row('Cy', 'VDOE-CY', 'Lesson 06', 'ACTIVE'));
  sa.appendRow(['VDOE-CY', '', 'CAS-8177-L06', '']);
  const ls = ss.insertSheet('LessonSchedule');
  ls.appendRow(['course', 'lesson_key', 'lesson', 'start_date', 'config_id', 'notes']);
  ls.appendRow(['8177', '8177-market-research-survey-design', 'Venue Market Research', '2026-11-02', LESSON, '']);
  ls.appendRow(['8177', '8177-L06', 'Lesson 06', '2026-10-01', 'CAS-8177-L06', '']);
  return ss;
}

test('Teacher Dashboard: one row per student for a lesson in parts, on the furthest open part', () => {
  const { exported, sandbox } = loadGasFiles(PROJECT_FILES, ['getDashboardData', 'LEDGER']);
  setUp(sandbox, exported.LEDGER, { Amy: 2, Bo: 0 });
  const data = exported.getDashboardData('ALL');
  const by = Object.fromEntries(data.students.map(s => [s.name, s]));
  assert.equal(data.students.length, 3, 'Amy, Bo and Cy: one row each');

  assert.equal(by.Amy.assignmentId, LESSON, 'counted under the whole lesson');
  assert.equal(by.Amy.assignmentName, 'Venue Market Research');
  assert.deepEqual(by.Amy.part, { n: 2, count: 5, title: 'Build the Survey' });
  assert.equal(by.Amy.configId, 'VDOE-Amy-2');
  assert.deepEqual(by.Amy.parts.map(p => [p.n, p.open]), [[1, true], [2, true], [3, false], [4, false], [5, false]]);
  assert.ok(by.Amy.parts[0].docUrl.includes('f-VDOE-Amy-1'));
  assert.equal(by.Amy.parts[2].docUrl, null, 'a locked part has no link');
  assert.deepEqual(by.Amy.nextPart, { n: 3, title: 'Why These Questions Work' });

  assert.equal(by.Bo.part.n, 1, 'nothing open yet: Part 1 stands for the lesson');
  assert.equal(by.Bo.nextPart, null, 'no unlock before the release');

  assert.equal(by.Cy.part, null, 'a whole lesson is unchanged');
  assert.equal(by.Cy.parts, undefined);
});

test('Teacher Dashboard: the row says "Part 2 of 5" with the earlier parts and an unlock button', () => {
  const { exported, sandbox } = loadGasFiles(PROJECT_FILES, ['getDashboardData', 'buildDashboardHtml_', 'LEDGER']);
  setUp(sandbox, exported.LEDGER, { Amy: 2 });
  const amy = exported.getDashboardData('ALL').students.find(s => s.name === 'Amy');
  const ctx = {
    document: { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }), addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {}, location: {}, localStorage: { getItem() { return null; }, setItem() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(exported.buildDashboardHtml_()).forEach(code => { try { vm.runInContext(code, ctx); } catch (e) { /* page wiring needs a real DOM */ } });
  const h = ctx.partLine(amy);
  assert.match(h, /<b>Part 2 of 5<\/b>: Build the Survey/);
  assert.match(h, /f-VDOE-Amy-1[^>]*>Part 1 ↗/);
  assert.match(h, /data-unlock-part="VDOE-Amy-2"[^>]*>Open Part 3 now<\/button>/);
  assert.ok(!ctx.partLine(Object.assign({}, amy, { nextPart: null })).includes('Open Part'));
});

function studentLoad(viewer) {
  const session = {
    getActiveUser() { return { getEmail() { return viewer; } }; },
    getEffectiveUser() { return { getEmail() { return 'admin@ccpsnet.net'; } }; },
    getScriptTimeZone() { return 'America/New_York'; },
  };
  return loadGasFiles([S('00_SharedConfig.js'), S('13_StudentDashboard.js')],
    ['getStudentDashboardData', 'buildStudentDashboardHtml_', 'LEDGER'], { Session: session });
}

test('Student Dashboard: open parts carry "Part n of 5"; locked parts are listed, not shown as cards', () => {
  const { exported, sandbox } = studentLoad('Amy@ccpsnet.net');
  setUp(sandbox, exported.LEDGER, { Amy: 2 });
  const data = exported.getStudentDashboardData('');
  assert.deepEqual(data.assignments.map(a => a.part && a.part.n).sort(), [1, 2]);
  const p2 = data.assignments.find(a => a.part && a.part.n === 2).part;
  assert.deepEqual(p2, { lessonName: 'Venue Market Research & Survey Design', title: 'Build the Survey',
    lesson: LESSON, n: 2, count: 5 });
  assert.deepEqual(data.lockedParts.map(l => [l.n, l.title]),
    [[3, 'Why These Questions Work'], [4, 'Spot the Bias'], [5, 'Beyond the Survey']]);
});

test('Student Dashboard: a lesson with no part open yet shows nothing', () => {
  const { exported, sandbox } = studentLoad('Bo@ccpsnet.net');
  setUp(sandbox, exported.LEDGER, { Bo: 0 });
  const data = exported.getStudentDashboardData('');
  assert.equal(data.assignments.length, 0);
  assert.deepEqual(data.lockedParts, []);
});

test('Student Dashboard: the parts render together, in order, with what opens each locked one', () => {
  const { exported, sandbox } = studentLoad('Amy@ccpsnet.net');
  setUp(sandbox, exported.LEDGER, { Amy: 2 });
  const data = exported.getStudentDashboardData('');
  const els = {};
  const el = () => ({ style: {}, innerHTML: '', options: [], setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } });
  const ctx = {
    document: { getElementById: (id) => els[id] || (els[id] = el()), addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(exported.buildStudentDashboardHtml_()).forEach(code => vm.runInContext(code, ctx));
  ctx.render(JSON.parse(JSON.stringify(data)));
  const h = els.main.innerHTML;
  assert.match(h, /Venue Market Research &amp; Survey Design <span>2 of 5 parts open<\/span>/);
  const i1 = h.indexOf('Part 1 of 5: The Target Market'), i2 = h.indexOf('Part 2 of 5: Build the Survey'),
    i3 = h.indexOf('🔒 Part 3 of 5: Why These Questions Work');
  assert.ok(i1 !== -1 && i1 < i2 && i2 < i3, 'Part 1, Part 2, then the locked Part 3');
  assert.ok(h.includes('Why These Questions Work<div>Opens when the check finds Part 2 meets its main goal, or when your teacher opens it.'));
  assert.equal((h.match(/class="part-locked"/g) || []).length, 3);
});
