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
// forms: the part numbers made as form copies (Phase 4a): the Ledger row's
// AdminFileURL is the form's /forms/d/ link, as intake (02) writes it.
function setUp(sandbox, L, open, forms, decks, sheets) {
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
      const r = row(name, sid, 'Venue Market Research & Survey Design — Part ' + (i + 1) + ': ' + t,
        i < open[name] ? 'ACTIVE' : 'SCHEDULED');
      r[L.ADMIN_FILE_URL] = (forms || []).includes(i + 1)
        ? 'https://docs.google.com/forms/d/f-' + sid + '/edit'
        : (decks || []).includes(i + 1) ? 'https://docs.google.com/presentation/d/f-' + sid + '/edit'
        : (sheets || []).includes(i + 1) ? 'https://docs.google.com/spreadsheets/d/f-' + sid + '/edit'
        : 'https://docs.google.com/document/d/f-' + sid + '/edit';
      ledger.appendRow(r);
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
  return loadGasFiles([S('00_SharedConfig.js'), S('13_StudentDashboard.js'), S('63_DocHeader.js'), S('71_TurnInCodes.js'), S('71b_TurnInStudent.js'), S('75_FormReader.js'), S('77_SlidesReader.js'), S('78_SheetReader.js')],
    ['getStudentDashboardData', 'buildStudentDashboardHtml_', 'submitMyWork', 'getSubmitReflection', 'LEDGER'], { Session: session });
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

// ── Phase 4a: a form part on both dashboards ────────────────────────────────

function studentPage(exported, data) {
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
  return els.main.innerHTML;
}

test('Student Dashboard: a form part says "Open your form", links to the form, and its Submit is on (Phase 4b)', () => {
  const { exported, sandbox } = studentLoad('Amy@ccpsnet.net');
  const ss = setUp(sandbox, exported.LEDGER, { Amy: 2 }, [2]);
  const fs = ss.insertSheet('FormSnapshots');
  fs.appendRow(['MadeAt', 'StudentConfigID', 'FormFileID', 'SnapshotDocID', 'PartConfigID', 'FormChecks', 'LastWrittenAt']);
  fs.appendRow([new Date(), 'VDOE-Amy-2', 'f-VDOE-Amy-2', 'snap-Amy-2', LESSON + '-P2', '{}', '']);
  const data = exported.getStudentDashboardData('');
  const p1 = data.assignments.find(a => a.part && a.part.n === 1);
  const p2 = data.assignments.find(a => a.part && a.part.n === 2);
  assert.equal(p1.workType, 'doc');
  assert.equal(p1.docUrl, 'https://docs.google.com/document/d/f-VDOE-Amy-1/edit');
  assert.equal(p1.canSubmit, true);
  assert.equal(p1.feedbackUrl, null);
  assert.equal(p2.workType, 'form');
  assert.equal(p2.docUrl, 'https://docs.google.com/forms/d/f-VDOE-Amy-2/edit');
  assert.equal(p2.canSubmit, true, 'the reader checks a form at Submit');
  assert.equal(p2.feedbackUrl, 'https://docs.google.com/document/d/snap-Amy-2/edit', 'its snapshot doc');
  const h = studentPage(exported, data);
  const card2 = h.slice(h.indexOf('Part 2 of 5: Build the Survey'), h.indexOf('🔒 Part 3'));
  assert.match(card2, /href="https:\/\/docs\.google\.com\/forms\/d\/f-VDOE-Amy-2\/edit"[^>]*class="act act-primary">Open your form ↗<\/a>/);
  assert.match(card2, /data-file="f-VDOE-Amy-2" data-config="VDOE-Amy-2" onclick="submitWork\(this\)">Submit for Feedback<\/button>/);
  assert.match(card2, /<div class="form-note">Submit for Feedback reads your form(&#39;|')s questions and settings \(never anyone(&#39;|')s answers\)/);
  assert.match(card2, /<a href="https:\/\/docs\.google\.com\/document\/d\/snap-Amy-2\/edit" target="_blank">Your form(&#39;|')s feedback page ↗<\/a>/);
  assert.doesNotMatch(card2, /Checking forms comes next week|disabled/);
  assert.doesNotMatch(card2, /Open My Document/);
  const card1 = h.slice(h.indexOf('Part 1 of 5: The Target Market'), h.indexOf('Part 2 of 5: Build the Survey'));
  assert.match(card1, />Open My Document ↗</);
  assert.match(card1, /onclick="submitWork\(this\)">Submit for Feedback/);
  assert.doesNotMatch(card1, /feedback page/);
});

test('Teacher Dashboard: a form part says so on its row and links to the form', () => {
  const { exported, sandbox } = loadGasFiles(PROJECT_FILES, ['getDashboardData', 'buildDashboardHtml_', 'LEDGER']);
  setUp(sandbox, exported.LEDGER, { Amy: 3 }, [2]);
  const amy = exported.getDashboardData('ALL').students.find(s => s.name === 'Amy');
  assert.equal(amy.parts[1].workType, 'form');
  assert.equal(amy.parts[1].docUrl, 'https://docs.google.com/forms/d/f-VDOE-Amy-2/edit');
  const ctx = {
    document: { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }), addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {}, location: {}, localStorage: { getItem() { return null; }, setItem() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(exported.buildDashboardHtml_()).forEach(code => { try { vm.runInContext(code, ctx); } catch (e) { /* page wiring needs a real DOM */ } });
  assert.match(ctx.partLine(amy), /forms\/d\/f-VDOE-Amy-2\/edit"[^>]*>Part 2 \(form\) ↗/);
  const onForm = Object.assign({}, amy, { part: { n: 2, count: 5, title: 'Build the Survey' }, workType: 'form' });
  assert.match(ctx.partLine(onForm), /<b>Part 2 of 5<\/b>: Build the Survey <span class="part-type"[^>]*>· Google Form<\/span>/);
  assert.doesNotMatch(ctx.partLine(amy), /Google Form<\/span>/, 'a doc part says nothing new');
});

// Phase 4c: a Slides part, the same way.
test('Teacher Dashboard: a Slides part says so on its row and links to the deck', () => {
  const { exported, sandbox } = loadGasFiles(PROJECT_FILES, ['getDashboardData', 'buildDashboardHtml_', 'LEDGER']);
  setUp(sandbox, exported.LEDGER, { Amy: 3 }, [], [2]);
  const amy = exported.getDashboardData('ALL').students.find(s => s.name === 'Amy');
  assert.equal(amy.parts[1].workType, 'slides');
  assert.equal(amy.parts[1].docUrl, 'https://docs.google.com/presentation/d/f-VDOE-Amy-2/edit');
  const ctx = {
    document: { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }), addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {}, location: {}, localStorage: { getItem() { return null; }, setItem() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(exported.buildDashboardHtml_()).forEach(code => { try { vm.runInContext(code, ctx); } catch (e) { /* page wiring needs a real DOM */ } });
  assert.match(ctx.partLine(amy), /presentation\/d\/f-VDOE-Amy-2\/edit"[^>]*>Part 2 \(slides\) ↗/);
  const onDeck = Object.assign({}, amy, { part: { n: 2, count: 5, title: 'The Pitch' }, workType: 'slides' });
  assert.match(ctx.partLine(onDeck), /<b>Part 2 of 5<\/b>: The Pitch <span class="part-type"[^>]*>· Google Slides<\/span>/);
});

// Phase 4d: a Sheets part, the same way.
test('Teacher Dashboard: a Sheets part says so on its row and links to the sheet', () => {
  const { exported, sandbox } = loadGasFiles(PROJECT_FILES, ['getDashboardData', 'buildDashboardHtml_', 'LEDGER']);
  setUp(sandbox, exported.LEDGER, { Amy: 3 }, [], [], [2]);
  const amy = exported.getDashboardData('ALL').students.find(s => s.name === 'Amy');
  assert.equal(amy.parts[1].workType, 'sheet');
  assert.equal(amy.parts[1].docUrl, 'https://docs.google.com/spreadsheets/d/f-VDOE-Amy-2/edit');
  const ctx = {
    document: { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }), addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {}, location: {}, localStorage: { getItem() { return null; }, setItem() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(exported.buildDashboardHtml_()).forEach(code => { try { vm.runInContext(code, ctx); } catch (e) { /* page wiring needs a real DOM */ } });
  assert.match(ctx.partLine(amy), /spreadsheets\/d\/f-VDOE-Amy-2\/edit"[^>]*>Part 2 \(sheet\) ↗/);
  const onSheet = Object.assign({}, amy, { part: { n: 2, count: 5, title: 'The Inventory Update' }, workType: 'sheet' });
  assert.match(ctx.partLine(onSheet), /<span class="part-type"[^>]*>· Google Sheets<\/span>/);
});

// ── A part's card and its "Do next" line name the assignment ────────────────

test('Student Dashboard: a part card and its "Do next" line name the assignment', () => {
  const { exported, sandbox } = studentLoad('Amy@ccpsnet.net');
  setUp(sandbox, exported.LEDGER, { Amy: 2 });
  const data = exported.getStudentDashboardData('');
  const part = data.assignments.find(a => a.part);
  assert.ok(part, 'the fixture has a part card');
  part.statusClass = 'NEEDS_ACTION';
  const html = studentPage(exported, data);
  const name = 'Venue Market Research &amp; Survey Design \u2014 Part ';
  assert.ok(html.includes(name), 'the card says which assignment the part belongs to');
  const doNext = html.slice(html.indexOf('class="do-next"'));
  assert.ok(doNext.includes(name), 'the "Do next" strip says it too');
});

// 2026-11-14 (live): the roster import (52) writes the Canvas course name to
// the Ledger's CourseName column, so every card read "Sports Entertainment
// and Event Management". The name now comes from the teacher's TeacherMatrix,
// through StudentAssignments; the Ledger's column is only the fallback.
test('Student Dashboard: cards take the assignment name from the TeacherMatrix, not the Ledger\'s course name', () => {
  const { exported, sandbox } = studentLoad('Amy@ccpsnet.net');
  const L = exported.LEDGER;
  const ss = setUp(sandbox, L, { Amy: 2 });
  // As the roster import writes it: the course name in CourseName.
  const ledger = ss.getSheetByName('Ledger');
  const rows = ledger.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) ledger.getRange(i + 1, L.COURSE_NAME + 1).setValue('Sports Entertainment and Event Management');
  const tmSs = sandbox.SpreadsheetApp.create('Teacher Matrix');
  const tm = tmSs.insertSheet('TeacherMatrix');
  tm.appendRow(['ConfigID', 'UnitName']);
  TITLES.forEach((t, i) => tm.appendRow([LESSON + '-P' + (i + 1), 'Venue Market Research & Survey Design — Part ' + (i + 1) + ': ' + t]));
  const reg = ss.insertSheet('MatrixRegistry');
  reg.appendRow(['Timestamp', 'TeacherEmail', 'TeacherMatrixSsId']);
  reg.appendRow([new Date(), TEACHER, tmSs.getId()]);

  const data = exported.getStudentDashboardData('');
  const parts = data.assignments.filter(a => a.part);
  assert.equal(parts.length, 2);
  parts.forEach((a) => {
    assert.equal(a.part.lessonName, 'Venue Market Research & Survey Design');
    assert.match(a.unitName, /^Venue Market Research & Survey Design — Part \d: /);
  });
  assert.deepEqual(parts.map(a => a.part.title).sort(), ['Build the Survey', 'The Target Market']);

  // No TeacherMatrix row for an assignment: the Ledger's name, as before.
  const bare = studentLoad('Amy@ccpsnet.net');
  setUp(bare.sandbox, bare.exported.LEDGER, { Amy: 1 });
  assert.match(bare.exported.getStudentDashboardData('').assignments.find(a => a.part).unitName, /^Venue Market Research/);
});
