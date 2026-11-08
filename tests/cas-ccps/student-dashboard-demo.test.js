'use strict';
// The Student Dashboard's demo mode (operator's decisions, 2026-11-07): a
// teacher opens the page as a made-up student ("Demo Student", 0000000) on
// their real lessons, from "View as a student" on the Teacher Dashboard or
// a bookmarked ?demo=1. Anyone else gets their own page, the demo page
// makes one server call (getDemoDashboardData), and nothing is saved.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');
const demoLessons = require('../../tools/cas-ccps/build-dashboard-demo-lessons.js');
const ALLOW = require('../../tools/gas-lint/webapp-public-allow.json');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const SD = ['00_SharedConfig.js', '00b_ScriptOwnerGuard.js', '13_StudentDashboard.js', '13b_StudentDashboardDemoLessons.js',
  '63_DocHeader.js', '71_TurnInCodes.js', '71b_TurnInStudent.js'].map((f) => path.join(SCRIPTS, f));
const OWNER = 'teacher@ccpsnet.net';
const KID = 'kid@ccpsnet.net';

// Any touch of these services from the demo path fails the test.
function tripwire(name, touched) {
  return new Proxy({}, { get(_, k) { touched.push(name + '.' + String(k)); return () => { throw new Error(name + ' touched'); }; } });
}

function load(viewer, opts = {}) {
  const touched = [];
  const globals = {
    Session: { getActiveUser: () => ({ getEmail: () => viewer }), getEffectiveUser: () => ({ getEmail: () => OWNER }),
      getScriptTimeZone: () => 'America/New_York' },
    HtmlService: { createHtmlOutput: (html) => ({ html, setTitle(t) { this.title = t; return this; },
      setXFrameOptionsMode() { return this; } }), XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' } },
  };
  for (const s of ['SpreadsheetApp', 'DocumentApp', 'DriveApp', 'MailApp', 'UrlFetchApp', 'LockService']) {
    globals[s] = tripwire(s, touched);
  }
  const env = loadGasFiles(SD, ['getDemoDashboardData', 'doGet', 'buildStudentDashboardHtml_', 'DASH_DEMO_LESSONS', 'DASH_DEMO_PARTS_LESSON'], globals);
  if (opts.teacherEmail) env.sandbox.PropertiesService.getScriptProperties().setProperty('TEACHER_EMAIL', opts.teacherEmail);
  return Object.assign(env, { touched });
}

const pillsOf = (d) => d.dashboard.assignments.map((a) => a.statusPill);

test('the demo lessons file is up to date with 55b and the competency registry', () => {
  assert.equal(fs.readFileSync(demoLessons.TARGET_PATH, 'utf8'), demoLessons.expected(),
    'run: node tools/cas-ccps/build-dashboard-demo-lessons.js');
});

test('the teacher gets the fixture: both courses, every card state, the real lessons', () => {
  const { exported, touched } = load(OWNER);
  const d = JSON.parse(JSON.stringify(exported.getDemoDashboardData()));
  assert.equal(d.error, undefined);
  assert.equal(d.dashboard.googleId, 'demo', 'the header shows "demo", no address');
  assert.deepEqual(d.student, { name: 'Demo Student', id: '0000000', account: 'demo' });
  for (const pill of ['Not started', 'Being checked', 'Revise', 'Couldn’t be checked ⚠', 'Passed ✓', 'Turned in']) {
    assert.ok(pillsOf(d).includes(pill), 'a card that is ' + pill);
  }
  const lessons = exported.DASH_DEMO_LESSONS;
  assert.deepEqual(lessons.map((c) => c.code), ['8175', '8177']);
  const courses = new Set(d.dashboard.assignments.map((a) => a.className));
  assert.equal(courses.size, 2);
  // Each card is one of the teacher's lessons, by its real title.
  const titles = new Set(lessons.flatMap((c) => c.lessons.map((l) => l.unitName))
    .concat(exported.DASH_DEMO_PARTS_LESSON.parts.map((p) => p.unitName)));
  d.dashboard.assignments.forEach((a) => assert.ok(titles.has(a.unitName), a.unitName));
  d.dashboard.assignments.filter((a) => a.statusPill === 'Revise')
    .forEach((a) => assert.ok(a.notYet.length > 10, 'a card to revise says what is not met yet'));
  d.dashboard.assignments.forEach((a) => {
    assert.equal(a.docUrl, null, 'no document behind any card');
    assert.equal(a.teacherEmail, '');
    assert.equal(a.studentName, 'Demo Student');
  });
  assert.ok(d.dashboard.warmUps.current && d.dashboard.warmUps.previous);
  assert.equal(d.tabs.competencies.success, true);
  assert.ok(d.tabs.competencies.courses.every((c) => c.areas.length > 0));
  assert.ok(d.tabs.warmups.warmUps.length >= 3);
  assert.ok(d.tabs.context.context.weeks.length >= 1);
  assert.doesNotMatch(JSON.stringify(d), /@|docs\.google\.com/, 'no address and no document link anywhere');
  assert.deepEqual(touched, [], 'the demo opens no sheet, doc or file, and sends nothing');
});

test('a teacher named by this project\'s TEACHER_EMAIL gets the fixture too', () => {
  const { exported } = load('colleague@ccpsnet.net', { teacherEmail: 'colleague@ccpsnet.net' });
  assert.ok(exported.getDemoDashboardData().dashboard);
});

test('anyone else gets no fixture: a refusal from the server, their own page from ?demo=1', () => {
  for (const [viewer, opts] of [[KID, {}], [KID, { teacherEmail: 'colleague@ccpsnet.net' }], ['', {}]]) {
    const { exported, sandbox, touched } = load(viewer, opts);
    const d = exported.getDemoDashboardData();
    assert.ok(d.error, 'refused for ' + (viewer || 'no address'));
    assert.equal(d.dashboard, undefined);
    assert.equal(d.assignments, undefined);
    const page = sandbox.doGet({ parameter: { demo: '1' } });
    assert.match(page.html, /const DEMO = false;/);
    assert.doesNotMatch(page.html, /Demo: a made-up student/);
    assert.equal(page.title, 'My Assignments');
    assert.deepEqual(touched, []);
  }
});

test('the teacher\'s ?demo=1 is the demo page; without it, the normal page', () => {
  const { sandbox } = load(OWNER);
  const demo = sandbox.doGet({ parameter: { demo: '1' } });
  assert.match(demo.html, /const DEMO = true;/);
  assert.match(demo.html, />Demo: a made-up student\. Nothing here is saved\.</);
  assert.equal(demo.title, 'My Assignments (demo)');
  const plain = sandbox.doGet({ parameter: {} });
  assert.match(plain.html, /const DEMO = false;/);
  assert.match(sandbox.doGet(undefined).html, /const DEMO = false;/);
});

test('getDemoDashboardData is owner-checked, so it is not on the public allowlist', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(ALLOW['cas-ccps:student-dashboard'], 'getDemoDashboardData'), false);
  const src = fs.readFileSync(path.join(SCRIPTS, '13_StudentDashboard.js'), 'utf8');
  assert.match(src, /function _dashDemoAllowed_\(\) \{[\s\S]*?requireScriptOwner_\(\)/);
});

// ── The page itself, with a fake DOM and timers ────────────────────────────

function demoPage(fixture, demo = true) {
  const { exported } = load(OWNER);
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', textContent: '', value: 'ALL', options: [],
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, classList: { add() {}, remove() {} } });
  const calls = [];
  let timers = [];
  let now = 0;
  const run = new Proxy({}, {
    get(_, name) {
      if (name === 'withSuccessHandler' || name === 'withFailureHandler') {
        return function (f) { const r = Object.create(this); r['_' + name] = f; return r; };
      }
      return function (...args) {
        calls.push(name);
        const ok = this._withSuccessHandler;
        if (name === 'getDemoDashboardData' && ok) ok(JSON.parse(JSON.stringify(fixture)));
      };
    },
  });
  const ctx = {
    document: { getElementById: el, addEventListener() {}, querySelectorAll: () => [], createElement: () => el('x') },
    google: { script: { run } },
    console, navigator: {},
    setTimeout(fn, ms) { timers.push({ at: now + (ms || 0), fn }); }, setInterval() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(exported.buildStudentDashboardHtml_({ demo })).forEach((code) => vm.runInContext(code, ctx));
  // Runs the timers due in the next ms, in time order, each at its own time.
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
  // The page's own variables (let/const aren't properties of the context).
  const page = (expr) => vm.runInContext(expr, ctx);
  return { ctx, els, calls, advance, page };
}

function fixture() {
  return JSON.parse(JSON.stringify(load(OWNER).exported.getDemoDashboardData()));
}

test('the demo page calls only getDemoDashboardData, whatever is pressed', () => {
  const { ctx, els, calls, advance } = demoPage(fixture());
  advance(1000);
  assert.deepEqual(calls, ['getDemoDashboardData']);
  assert.equal(els['account-label'].textContent, 'demo');
  const main = els.main.innerHTML;
  assert.match(main, /Do next/);
  assert.match(main, /<b>Not yet:<\/b>/);
  for (const pill of ['Not started', 'Being checked', 'Revise', 'Couldn’t be checked ⚠', 'Passed ✓', 'Turned in']) {
    assert.ok(main.includes('>' + pill + '<'), 'the page shows ' + pill);
  }
  assert.doesNotMatch(main, /href="https:/, 'no card links anywhere real');
  // The record tabs, Refresh, a warm-up save, My Info: all from the stubs.
  for (const tab of ['competencies', 'warmups', 'context']) { ctx.showTab(tab); advance(1000); }
  assert.match(els['panel-competencies'].innerHTML, /competencies done/);
  assert.match(els['panel-warmups'].innerHTML, /wu-feedback/);
  assert.match(els['panel-context'].innerHTML, /Week of /);
  ctx.refreshAll(); advance(1000);
  ctx.saveWarmUp({ getAttribute: (k) => ({ 'data-kind': 'answer', 'data-queue': 'DEMO-WU-4' })[k], textContent: 'Save answer' });
  advance(1000);
  ctx.toggleMyInfo();
  assert.match(els['my-info-panel'].innerHTML, /Demo Student/);
  assert.match(els['my-info-panel'].innerHTML, /0000000/);
  assert.doesNotMatch(els['my-info-panel'].innerHTML, /mailto:/);
  assert.deepEqual(calls, ['getDemoDashboardData'], 'no other server function was called');
});

test('Submit for Feedback walks the card through the reflection, being checked, then revise', () => {
  const { ctx, els, calls, advance, page } = demoPage(fixture());
  advance(1000);
  const card = page('_demoData').dashboard.assignments.find((a) => a.statusPill === 'Not started' && a.workType !== 'form');
  const btn = { attrs: { 'data-file': card.fileId, 'data-config': card.configId }, getAttribute(k) { return this.attrs[k]; } };
  ctx.submitWork(btn);
  advance(500);
  const r = page('_reflect')[card.fileId];
  assert.ok(r && r.questions.length >= 1, 'the reflection question is asked');
  assert.match(els.main.innerHTML, /Before you submit/);
  r.answers = r.questions.map(() => 'I compared each era and wrote one sentence for every era on the slides.');
  ctx.sendReflection(btn);
  advance(500);
  assert.equal(card.statusPill, 'Waiting for feedback');
  advance(1500);
  assert.equal(card.statusPill, 'Being checked');
  assert.equal(card.canSubmit, false);
  advance(3000);
  assert.equal(card.statusPill, 'Revise');
  assert.equal(card.statusClass, 'NEEDS_ACTION');
  assert.ok(card.notYet.length > 10);
  assert.match(els.main.innerHTML, /<b>Not yet:<\/b>/);
  assert.deepEqual(calls, ['getDemoDashboardData']);
});

test('Open My Document opens nothing: it says what the real page does', () => {
  const { ctx, els, advance, page } = demoPage(fixture());
  advance(1000);
  const card = page('_demoData').dashboard.assignments[0];
  assert.match(els.main.innerHTML, /onclick="demoOpenDoc\(this\)"/);
  ctx.demoOpenDoc({ getAttribute: () => card.fileId });
  assert.match(els.main.innerHTML, /In the real dashboard this opens the student&#39;s document\.|In the real dashboard this opens the student's document\./);
});

// Phase 4a/4b: the demo has a lesson in parts with a form part, so a teacher
// sees what a student sees: "Open your form", and a Submit that answers with
// a sample of the form reader's exact checks (Phase 4b). The demo has no
// form: nothing is read, and no server function is called.
test('the demo shows a form part: Open your form, a working Submit with a sample "Not yet", the later parts locked', () => {
  const f = fixture();
  const form = f.dashboard.assignments.filter((a) => a.workType === 'form');
  assert.equal(form.length, 1, 'one form part');
  assert.equal(form[0].canSubmit, true, 'Submit is on for a form part (Phase 4b)');
  assert.equal(form[0].part.n, 2);
  assert.match(form[0].unitName, /Build the Survey/);
  assert.ok(form[0].demoFormNotYet.length >= 2);
  assert.ok(f.dashboard.assignments.some((a) => a.part && a.part.n === 1 && a.workType === 'doc' && a.statusPill === 'Passed ✓'));
  assert.deepEqual(f.dashboard.lockedParts.map((l) => l.n), [3, 4, 5]);
  const { ctx, els, calls, advance } = demoPage(f);
  advance(1000);
  const main = els.main.innerHTML;
  assert.match(main, />Open your form</);
  assert.match(main, new RegExp('data-file="' + form[0].fileId + '"[^>]*onclick="submitWork\\(this\\)">Submit for Feedback'));
  assert.match(main, /class="form-note">Submit for Feedback reads your form&#39;s questions and settings|class="form-note">Submit for Feedback reads your form's questions and settings/);
  assert.doesNotMatch(main, /Checking forms comes next week/);
  assert.match(main, /2 of 5 parts open/);
  assert.match(main, /🔒 Part 3 of 5/);
  ctx.demoOpenDoc({ getAttribute: () => form[0].fileId });
  assert.match(els.main.innerHTML, /own copy of the form/);
  const btn = { attrs: { 'data-file': form[0].fileId, 'data-config': form[0].configId }, getAttribute(k) { return this.attrs[k]; } };
  ctx.submitWork(btn);
  advance(500);
  const h = els.main.innerHTML;
  assert.match(h, /Not yet\. Fix this in your form, then submit again:/);
  assert.match(h, /• Your form has 2 questions\. It needs at least 3\./);
  assert.match(h, /• Your form collects email addresses\./);
  assert.deepEqual(calls, ['getDemoDashboardData'], 'the demo reads no form');
});

test('the real page never asks for the demo fixture', () => {
  const { calls, advance } = demoPage(fixture(), false);
  advance(1000);
  assert.deepEqual(calls, ['getStudentDashboardData']);
});

test('the Teacher Dashboard has "View as a student", opening the Student Dashboard with ?demo=1', () => {
  const { exported } = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '07_TeacherDashboard.js')],
    ['buildDashboardHtml_', 'studentDemoUrl_']);
  const url = 'https://script.google.com/a/macros/example.net/s/AKfyDEMO_url-1/exec';
  const html = exported.buildDashboardHtml_({ studentDashboardUrl: url });
  // An item of the header's More ▾ menu since 2026-11-08; the same link.
  assert.ok(html.includes('<a id="demo-student-btn" role="menuitem" tabindex="-1" href="' + url + '?demo=1" target="_blank" rel="noopener"'));
  assert.match(html, /<span aria-hidden="true">👁<\/span> View as a student<\/a>/);
  const unset = exported.buildDashboardHtml_({ studentDashboardUrl: '' });
  assert.match(unset, /<button id="demo-student-btn"[^>]*STUDENT_DASHBOARD_URL/);
  assert.equal(exported.studentDemoUrl_({ studentDashboardUrl: 'javascript:alert(1)' }), '');
  assert.equal(exported.studentDemoUrl_({ studentDashboardUrl: 'https://script.google.com/x" onmouseover="y' }), '');
});
