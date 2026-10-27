'use strict';
// Syntax-checks the client-side JavaScript the Teacher Dashboard actually
// serves to a browser.
//
// leader-hub's single-file app has had this coverage since tools/html-lint
// landed, because its markup is a real .html file a linter can read.
// 07_TeacherDashboard.js's markup is a JS template literal instead, so the
// same class of bug — a stray quote or bracket in 72KB of inline
// <script> — was invisible to every check in the repo. Reading the source
// as text doesn't work either: the template contains \${...} escapes that
// emit a literal ${...}, and a ${CLIENT_ESC_JS} interpolation that only
// resolves when the template is evaluated.
//
// So this evaluates the template through the GAS sandbox to get the real
// HTML, then parses each inline block. A GAS syntax error in that block
// doesn't fail the server function that emits it — it fails silently in
// the teacher's browser, leaving a dashboard whose buttons do nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');

function renderDashboard() {
  const { exported } = loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '07_TeacherDashboard.js')],
    ['buildDashboardHtml_', 'buildMyContextHtml_'],
  );
  return exported;
}

test('the teacher dashboard renders HTML with at least one inline script', () => {
  const html = renderDashboard().buildDashboardHtml_();
  assert.ok(html.length > 1000, 'expected a substantial HTML document');
  assert.ok(extractInlineScripts(html).length >= 1);
});

test('every inline <script> the teacher dashboard serves parses as valid JS', () => {
  const html = renderDashboard().buildDashboardHtml_();
  extractInlineScripts(html).forEach((code, i) => {
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: `dashboard-inline-${i}.js` }),
      `inline <script> block ${i} is not valid JavaScript`,
    );
  });
});

test('every inline <script> the student My Context page serves parses as valid JS', () => {
  // A student who isn't the authorized teacher gets this page instead
  // (doGet branches on _isAuthorizedTeacher_), so it needs the same check.
  const html = renderDashboard().buildMyContextHtml_();
  extractInlineScripts(html).forEach((code, i) => {
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: `mycontext-inline-${i}.js` }),
      `inline <script> block ${i} is not valid JavaScript`,
    );
  });
});

test('the parent-report controls reach server functions that exist', () => {
  // gas-lint's google.script.run check already covers this statically; this
  // asserts the two calls are actually present in the shipped markup, so
  // deleting a button without deleting its handler (or vice versa) shows up
  // as a test failure rather than a dead control.
  const html = renderDashboard().buildDashboardHtml_();
  assert.match(html, /getWeeklyParentReports\(\)/);
  assert.match(html, /teacherCopiedParentReport\(/);
  assert.match(html, /data-pr-copy="text"/);
  assert.match(html, /id="parent-report-btn"/);
  // D1 (2026-10-23): KOS writes the report and the teacher sends it.
  assert.doesNotMatch(html, /teacherSendWeeklyParentReport/);
});

// ── esc() / safeDocUrl() — FIXED by a third-party review's finding ─────────
// esc() only escaped &/</> and was used in HTML-attribute and inline-JS
// contexts; docUrl was interpolated into href="..." with no escaping or
// scheme check at all. Runs the real served inline script in a vm context
// so esc/safeDocUrl are the actual functions shipped to a browser, not a
// reimplementation of them here.

// A permissive stand-in for `document`/`window`/`google` — anything
// property-accessed or called on it returns another instance of itself, so
// arbitrary DOM/`google.script.run` chains used by top-level init code
// (document.getElementById(...).addEventListener(...), etc.) don't throw.
// This test only needs esc()/safeDocUrl() to be defined via function
// hoisting once the script finishes running — it doesn't need any of that
// init code to actually do anything.
function makeDomStub() {
  const fn = () => makeDomStub();
  return new Proxy(fn, {
    get(target, prop) {
      if (prop === 'then') return undefined; // not thenable
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'toString' || prop === 'valueOf') return () => '';
      return makeDomStub();
    },
    set() { return true; },
  });
}

function runInlineScriptContext(code) {
  const context = vm.createContext({
    document: makeDomStub(), window: makeDomStub(), google: makeDomStub(), console,
  });
  new vm.Script(code, { filename: 'dashboard-inline-under-test.js' }).runInContext(context);
  return context;
}

function firstContextWith(html, names) {
  const blocks = extractInlineScripts(html);
  for (const code of blocks) {
    const context = runInlineScriptContext(code);
    if (names.every((n) => typeof context[n] === 'function')) return context;
  }
  throw new Error(`no inline script block defined all of: ${names.join(', ')}`);
}

test('esc() escapes quotes as well as &/</> in the served dashboard', () => {
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['esc']);
  assert.equal(context.esc('&'), '&amp;');
  assert.equal(context.esc('<'), '&lt;');
  assert.equal(context.esc('>'), '&gt;');
  assert.equal(context.esc('"'), '&quot;');
  assert.equal(context.esc("'"), '&#39;');
});

test('safeDocUrl() allowlists only real Google Docs/Drive URLs in the served dashboard', () => {
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['safeDocUrl']);
  assert.equal(context.safeDocUrl('javascript:alert(1)'), '');
  assert.equal(context.safeDocUrl('http://docs.google.com/document/d/abc/edit'), '', 'must reject non-https');
  assert.equal(context.safeDocUrl('https://evil.example.com/docs.google.com/'), '', 'must anchor at the start, not just contain the host');
  assert.equal(
    context.safeDocUrl('https://docs.google.com/document/d/abc123/edit'),
    'https://docs.google.com/document/d/abc123/edit',
  );
  assert.equal(
    context.safeDocUrl('https://drive.google.com/file/d/xyz789/view'),
    'https://drive.google.com/file/d/xyz789/view',
  );
});

// A student name comes from Form 1, so it's student-controlled. jsAttr()
// puts it inside onclick="f('...')": check the value survives the browser's
// entity decoding and the JS parser intact, and can't break out.
test('jsAttr() round-trips hostile names through a real onclick handler', () => {
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['jsAttr']);
  const names = [
    "O'Brien \"Ace\"",
    "\\');alert(1)//",
    'trailing backslash \\',
    '</script><img src=x onerror=alert(1)>',
    'two\nlines',
  ];
  names.forEach((name) => {
    const attr = "f('" + context.jsAttr(name) + "')";
    assert.ok(!/["<>]/.test(attr), 'nothing that can end the attribute or open a tag: ' + attr);
    // What the browser hands the JS parser after decoding the attribute.
    const decoded = attr.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const seen = [];
    vm.runInNewContext(decoded, { f: (v) => seen.push(v), alert: () => seen.push('ALERT') });
    assert.deepEqual(seen, [name]);
  });
});

test('the dashboard\'s onclick buttons use jsAttr() for names and ids', () => {
  const src = require('fs').readFileSync(path.join(SCRIPTS, '07_TeacherDashboard.js'), 'utf8');
  ['wrIdSafe', 'wrNameSafe', 'rvConfigSafe', 'rvNameSafe'].forEach((v) => {
    assert.match(src, new RegExp('const ' + v + '\\s*=\\s*jsAttr\\('), v);
  });
});

// The warm-up readiness strip's numbers filter the roster. wrButton() wires
// a click only on a <button>, and until 2026-10-22 the markup used spans, so
// no number could be clicked (walk-through finding 7).
test('the warm-up readiness numbers are buttons, and a click filters the roster', () => {
  const html = renderDashboard().buildDashboardHtml_();
  for (const id of ['wr-eval', 'wr-warmup', 'wr-confidence', 'wr-locked']) {
    assert.match(html, new RegExp('<button type="button" class="wr-stat" id="' + id + '">'), id);
  }
  const context = firstContextWith(html, ['renderWarmUpReadiness', 'applyWrFilter']);
  const els = {};
  context.document = { getElementById: (id) => (els[id] = els[id] || { id, tagName: 'BUTTON', style: {} }) };
  const applied = [];
  context.applyWrFilter = (bucket) => applied.push(bucket);
  context.renderWarmUpReadiness({ currentUnit: 'L06', total: 20, withEvalHistory: 5, withWarmUpHistory: 3,
    withShadowConfidence: 0, locked: 2 });
  assert.equal(els['wr-eval'].textContent, '5 of 20 students have had work checked');
  ['wr-eval', 'wr-warmup', 'wr-locked'].forEach((id) => els[id].onclick());
  assert.deepEqual(applied, ['eval', 'warmup', 'locked']);
  assert.equal(els['wr-confidence'].style.display, 'none', 'a zero count is hidden');
  assert.equal(els['wr-confidence'].onclick, null);
});

// The 💬 Feedback panel says what the setting is now (finding 1).
test('the Feedback panel shows the live FEEDBACK_AS_COMMENT setting', () => {
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['renderFeedbackPlacement']);
  const body = { innerHTML: '' };
  context.document = { getElementById: () => body };
  const shown = (value) => {
    context.renderFeedbackPlacement({ success: true, value, overriddenHere: false,
      courses: [{ code: '8175', asComment: value !== 'off' }, { code: '8177', asComment: value === 'all' }] });
    return body.innerHTML;
  };
  assert.match(shown('off'), /Now:<\/strong> in the document, for every course/);
  assert.match(shown('all'), /Now:<\/strong> as a comment, for every course/);
  assert.match(shown('8175'), /Now:<\/strong> as a comment for 8175 only; in the document for the others/);
  assert.match(body.innerHTML, /<legend[^>]*>8175<\/legend>/);
  assert.doesNotMatch(body.innerHTML, /No courses with assignments yet/);
});

// Roster rendering (walk-through findings 3b, 16 and 18, 2026-10-22).
function renderedRoster(students, lessonView) {
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['render', 'setLessonView', 'backToDashboard']);
  const els = {};
  const el = (id) => (els[id] = els[id] || {
    id, style: {}, value: 'ALL', innerHTML: '', options: [], classList: { add() {}, remove() {} },
    appendChild() {}, querySelectorAll: () => [], setAttribute() {}, addEventListener() {},
  });
  context.document = { getElementById: el, createElement: () => el('x' + Math.random()),
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: el('body') };
  const data = { students, lessons: [{ id: 'L06', name: 'L06', current: true }], activeTerm: 'ALL', availableTerms: [] };
  context.render(data);
  if (lessonView) context.setLessonView(lessonView);
  return { main: els.main.innerHTML, context, els };
}

const rosterStudent = (o) => Object.assign({
  name: 'A Student', googleId: 'a@example.invalid', period: '1', block: '1', subject: 'Marketing',
  assignmentId: 'L06', assignmentName: 'L06', isCurrentLesson: true, evalState: 'NOT_CHECKED', statusClass: 'not-started',
  status: 'Not started', checkCount: 0, lastEval: 'Never', submittedAt: '—', docUrl: null,
}, o);

test('a roster row shows when the work was submitted', () => {
  const { main } = renderedRoster([
    rosterStudent({ submittedAt: 'Oct 21, 2026 9:05 AM' }),
    rosterStudent({ name: 'B Student', googleId: 'b@example.invalid' }),
  ]);
  assert.match(main, /No checks yet · submitted Oct 21, 2026 9:05 AM/);
  assert.equal((main.match(/· submitted /g) || []).length, 1, 'no "submitted —" for work never submitted');
});

test('"All assignments" counts assignments in its first card and says how many students', () => {
  const two = [rosterStudent({}), rosterStudent({ assignmentId: 'L05', assignmentName: 'L05', isCurrentLesson: false })];
  assert.match(renderedRoster(two).main, /<div class="count">1<\/div><div class="label">Students<\/div>/);
  assert.match(renderedRoster(two, 'ALL').main, /<div class="count">2<\/div><div class="label">Assignments · 1 student<\/div>/);
});

test('Student Context has a way back to the roster without a reload', () => {
  const html = renderDashboard().buildDashboardHtml_();
  assert.match(html, /id="context-tab-btn" onclick="showStudentContext\(\)">Student Context</);
  const { context, els } = renderedRoster([rosterStudent({})]);
  context.renderTeacherRoster({ generatedAt: 'now', roster: [] });
  assert.match(els['student-context-view'].innerHTML, /onclick="backToDashboard\(\)"[^>]*>← Back to dashboard</);
  els['student-context-view'].style.display = 'block';
  els.main.style.display = 'none';
  let reloaded = false;
  context.loadData = () => { reloaded = true; };
  context.backToDashboard();
  assert.equal(els['student-context-view'].style.display, 'none');
  assert.equal(els.main.style.display, 'block');
  assert.equal(reloaded, false);
});

// ── Course, period and student filters (2026-10-27) ─────────────────────
const filterRoster3 = () => [
  rosterStudent({ name: 'Amy', googleId: 'amy@example.invalid', courseCode: '8175', className: '8175 Sports Marketing', period: '1' }),
  rosterStudent({ name: 'Amy', googleId: 'amy@example.invalid', courseCode: '8175', className: '8175 Sports Marketing', period: '1',
    assignmentId: 'L05', assignmentName: 'L05', isCurrentLesson: false, evalState: 'PASSED', statusClass: 'compliant' }),
  rosterStudent({ name: 'Bo', googleId: 'bo@example.invalid', courseCode: '8175', className: '8175 Sports Marketing', period: '3' }),
  rosterStudent({ name: 'Cy', googleId: 'cy@example.invalid', courseCode: '8177', className: '8177 Sports Management', period: '2',
    assignmentId: 'M01', assignmentName: 'M01' }),
];
const names = (main) => [...main.matchAll(/<div class="student-name">(?:<button[^>]*>)?([^<]+)</g)].map((m) => m[1]);
const options = (main, id) => {
  const sel = new RegExp('<select id="' + id + '"[^>]*>(.*?)</select>').exec(main)[1];
  return [...sel.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
};

test('the roster filters list each course, then its periods, then their students', () => {
  const { main, context, els } = renderedRoster(filterRoster3(), 'ALL');
  assert.deepEqual(options(main, 'course-filter'), ['', '8175', '8177']);
  assert.match(main, /<option value="8175">8175 Sports Marketing<\/option>/);
  assert.deepEqual(options(main, 'period-filter'), ['', '1', '2', '3']);
  assert.match(main, /<option value="amy@example.invalid">Amy \(Period 1\)<\/option>/);
  assert.doesNotMatch(main, /Clear filters/, 'nothing to clear yet');

  context.setCourseFilter('8175');
  let after = els.main.innerHTML;
  assert.deepEqual(options(after, 'period-filter'), ['', '1', '3']);
  assert.deepEqual(options(after, 'student-filter'), ['', 'amy@example.invalid', 'bo@example.invalid']);
  assert.deepEqual(names(after).sort(), ['Amy', 'Bo']);
  assert.match(after, /onclick="clearRosterFilters\(\)">Clear filters</);
  assert.doesNotMatch(after, /<option value="M01"/, 'the lesson picker lists only the course\'s lessons');

  context.setPeriodFilter('3');
  after = els.main.innerHTML;
  assert.deepEqual(options(after, 'student-filter'), ['', 'bo@example.invalid']);
  assert.deepEqual(names(after), ['Bo']);

  context.clearRosterFilters();
  assert.deepEqual(names(els.main.innerHTML).sort(), ['Amy', 'Bo', 'Cy'], 'every course\'s current lesson again');
});

test('choosing one student shows all their assignments, and a wider filter change resets it', () => {
  const { context, els } = renderedRoster(filterRoster3());
  context.setStudentFilter('amy@example.invalid');
  const main = els.main.innerHTML;
  assert.deepEqual(names(main), ['Amy', 'Amy'], 'both assignments, not only the current lesson');
  assert.match(main, /<div class="count">2<\/div><div class="label">Assignments · 1 student<\/div>/);
  assert.match(main, /<option value="amy@example.invalid" selected>/);
  context.setCourseFilter('8177');
  assert.deepEqual(names(els.main.innerHTML), ['Cy']);
  assert.doesNotMatch(els.main.innerHTML, /<option value="amy@example.invalid"/);
});

test('a refresh that no longer has the filtered student drops the filter', () => {
  const { context, els } = renderedRoster(filterRoster3());
  context.setStudentFilter('bo@example.invalid');
  const data = { students: filterRoster3().filter((s) => s.name !== 'Bo'),
    lessons: [{ id: 'L06', name: 'L06', current: true }], activeTerm: 'ALL', availableTerms: [] };
  context.render(data);
  assert.deepEqual(names(els.main.innerHTML).sort(), ['Amy', 'Cy'], 'back to the current lesson, unfiltered');
});

test('the warm-up readiness numbers count only the filtered students', () => {
  const { context } = renderedRoster(filterRoster3());
  const r = { total: 3, withEvalHistory: 2, withWarmUpHistory: 3, withShadowConfidence: 0, locked: 1,
    withEvalEmails: ['amy@example.invalid', 'cy@example.invalid'], withWarmupEmails: ['AMY@example.invalid', 'bo@example.invalid', 'cy@example.invalid'],
    withConfEmails: [], lockedEmails: ['cy@example.invalid'] };
  assert.equal(context.scopedReadiness(r, filterRoster3()), r, 'no filter: the server\'s numbers as they are');
  context.setCourseFilter('8175');
  const scoped = context.scopedReadiness(r, context.filterRoster(filterRoster3()));
  assert.deepEqual([scoped.total, scoped.withEvalHistory, scoped.withWarmUpHistory, scoped.locked], [2, 1, 2, 0]);
});

// ── One student's page (2026-10-27, sprint PR 2) ─────────────────────────
function runStub(calls) {
  const run = {
    withSuccessHandler(cb) { calls.success = cb; return run; },
    withFailureHandler(cb) { calls.failure = cb; return run; },
    getStudentDetail(key) { calls.keys.push(key); },
  };
  return run;
}
const detail = () => ({
  success: true, studentEmail: 'amy@example.invalid', weekStart: 'October 26, 2026', weekEnd: 'October 30, 2026',
  report: { studentEmail: 'amy@example.invalid', studentName: 'Amy', itemCount: 2, openCount: 0, progressCount: 1,
    subject: 'Amy this week', preview: 'Dear family, Amy finished L06.', copiedAt: '' },
  context: { docUrl: 'https://docs.google.com/document/d/abc/edit', lastUpdatedAt: 'Oct 26',
    weeks: [{ label: 'Week of October 26, 2026', items: [{ text: 'Warm-Up Reflections', heading: true }, { text: 'Tickets.', heading: false }] },
      { label: 'Week of October 19, 2026', items: [{ text: 'Completed Assignments', heading: true }] }] },
});

test('a name in the list opens that student\'s page: report and Student Context by week', () => {
  const { main, context, els } = renderedRoster(filterRoster3());
  assert.match(main, /<button type="button" class="name-link" data-student="amy@example.invalid"[^>]*>Amy<\/button>/);
  const calls = { keys: [] };
  context.google = { script: { run: runStub(calls) } };
  context.openStudent('AMY@example.invalid');
  assert.deepEqual(calls.keys, ['amy@example.invalid']);
  let page = els.main.innerHTML;
  assert.match(page, /<section id="student-panel"/);
  assert.match(page, /Loading this student's parent report and Student Context/);
  assert.doesNotMatch(page, /data-student="amy@example.invalid"/, 'no link to the page already open');

  calls.success(detail());
  const panel = () => els['student-panel'].innerHTML;
  assert.match(panel(), /This week's parent report/);
  assert.match(panel(), /data-pr-copy="text" data-pr-i="student"/);
  assert.match(panel(), /Dear family, Amy finished L06\./);
  assert.match(panel(), /<strong>Week of October 26, 2026<\/strong>/);
  assert.match(panel(), /\(1 of 2\)/);
  assert.match(panel(), /aria-label="Newer week"[^>]*>|disabled aria-label="Newer week"/);
  assert.match(panel(), /href="https:\/\/docs\.google\.com\/document\/d\/abc\/edit"[^>]*>Open the doc ↗/);
  assert.match(panel(), /<p class="ctx-h">Warm-Up Reflections<\/p><p>Tickets\.<\/p>/);

  context.stepContextWeek(1);
  assert.match(panel(), /<strong>Week of October 19, 2026<\/strong>/);
  assert.match(panel(), /\(2 of 2\)/);
  assert.match(panel(), /Open the doc ↗/, 'the doc link on every week');
  context.stepContextWeek(1);
  assert.match(panel(), /\(2 of 2\)/, 'no week past the oldest');

  // A re-render (a refresh, a filter click) doesn't fetch again.
  context.render({ students: filterRoster3(), lessons: [{ id: 'L06', name: 'L06', current: true }],
    activeTerm: 'ALL', availableTerms: [] });
  assert.equal(calls.keys.length, 1);
});

test('a student with no report or doc says so, and a failed load says why', () => {
  const { context, els } = renderedRoster(filterRoster3());
  const calls = { keys: [] };
  context.google = { script: { run: runStub(calls) } };
  context.openStudent('bo@example.invalid');
  calls.success({ success: true, studentEmail: 'bo@example.invalid', report: null, context: null });
  assert.match(els['student-panel'].innerHTML, /No report for this student this week/);
  assert.match(els['student-panel'].innerHTML, /No Student Context doc yet/);
  context.openStudent('cy@example.invalid');
  calls.failure({ message: 'Exceeded maximum execution time' });
  assert.match(els['student-panel'].innerHTML, /Could not load: Exceeded maximum execution time/);
});

test('✉ Parent Reports and Student Context narrow by course and student', () => {
  const { context, els } = renderedRoster(filterRoster3());
  const reports = ['amy', 'bo', 'cy'].map((n) => ({ studentEmail: n + '@example.invalid', studentName: n.toUpperCase(),
    itemCount: 1, openCount: 0, progressCount: 0, subject: 's', preview: 'p', copiedAt: '' }));
  const body = { innerHTML: '' };
  const realGet = context.document.getElementById;
  context.document.getElementById = (id) => (id === 'parent-report-modal-body' ? body : realGet(id));
  context.renderParentReportModal({ success: true, weekStart: 'Oct 26', weekEnd: 'Oct 30', reports });
  assert.equal((body.innerHTML.match(/data-pr-copy="text"/g) || []).length, 3);
  context.setPrCourse('8177');
  assert.equal((body.innerHTML.match(/data-pr-copy="text"/g) || []).length, 1);
  assert.match(body.innerHTML, /data-pr-i="2"/, 'a card keeps its index for Copy');
  context.setPrCourse('8175');
  context.setPrStudent('bo@example.invalid');
  assert.match(body.innerHTML, /font-size:14px">BO</);
  assert.doesNotMatch(body.innerHTML, /font-size:14px">AMY</, 'only the chosen student\'s card');

  context.renderTeacherRoster({ generatedAt: 'now', roster: reports.map((r) => ({ name: r.studentName,
    email: r.studentEmail, docUrl: null, lastUpdatedAt: 'Oct 26', hasRecentActivity: true })) });
  const view = () => els['student-context-view'].innerHTML;
  assert.equal((view().match(/By week →/g) || []).length, 3);
  context.setScCourse('8177');
  assert.equal((view().match(/By week →/g) || []).length, 1);
  assert.match(view(), /data-student="cy@example.invalid"/);
});

// ── Teacher Dashboard polish (2026-10-22, UX audit order-of-work item 6) ───
test('rows that need the teacher come first in each lesson section', () => {
  const { main } = renderedRoster([
    rosterStudent({ name: 'A Early', googleId: 'a@example.invalid', period: '1' }),
    rosterStudent({ name: 'Z Review', googleId: 'z@example.invalid', period: '4', statusClass: 'pending-review', status: 'PENDING_TEACHER_REVIEW' }),
    rosterStudent({ name: 'B Middle', googleId: 'b@example.invalid', period: '2' }),
    rosterStudent({ name: 'Y Flagged', googleId: 'y@example.invalid', period: '3', statusClass: 'flagged', status: 'ERROR_TIMEOUT' }),
  ]);
  const order = [...main.matchAll(/<div class="student-name">(?:<button[^>]*>)?([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(order, ['Y Flagged', 'Z Review', 'A Early', 'B Middle']);
});

function scrContext() {
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['renderScrReviewModal', 'toggleScrShowAll']);
  const body = { innerHTML: '' };
  context.document = { getElementById: () => body };
  return { context, body };
}

const scrItem = (o) => Object.assign({ studentEmail: 's@example.invalid', studentName: 'A Student',
  competencyId: 'C1', competencyText: 'A task', suggestedRating: 3, metCount: 2, notMetCount: 0, partialCount: 0 }, o);

test('the SCR queue shows rows with a suggestion by default, the rest behind a toggle, and zeros as 0', () => {
  const { context, body } = scrContext();
  context.renderScrReviewModal({ success: true, suggestions: [
    scrItem({}),
    scrItem({ competencyId: 'C2', suggestedRating: null, metCount: 0, notMetCount: 0, partialCount: 1 }),
    scrItem({ competencyId: 'C3', suggestedRating: null, metCount: 0, notMetCount: 0, partialCount: 0 }),
  ] });
  assert.match(body.innerHTML, /1 competency waiting on your review\. 2 more have too little evidence for a suggestion yet\./);
  assert.match(body.innerHTML, /Evidence so far: 2 met, 0 not met, 0 partially met\./);
  assert.equal((body.innerHTML.match(/id="scr-override-/g) || []).length, 1);
  assert.match(body.innerHTML, />Show them</);
  context.toggleScrShowAll();
  assert.equal((body.innerHTML.match(/id="scr-override-/g) || []).length, 3);
  assert.match(body.innerHTML, /id="scr-override-2"/, 'rows keep their queue index');
  assert.match(body.innerHTML, /Evidence so far: 0 met, 0 not met, 1 partially met\./);
  assert.match(body.innerHTML, />Hide them</);
});

test('the SCR queue with only too-little-evidence rows says nothing is waiting', () => {
  const { context, body } = scrContext();
  context.renderScrReviewModal({ success: true, suggestions: [scrItem({ suggestedRating: null })] });
  assert.match(body.innerHTML, /No competency ratings are waiting on your review right now\. 1 more has too little evidence/);
  assert.doesNotMatch(body.innerHTML, /id="scr-override-/);
});

// The operator, 2026-10-22: nothing is stored in the browser. Parent
// Reports used to remember each address in localStorage, keyed by the
// student's email.
test('✉ Parent Reports stores nothing in the browser, and neither dashboard uses browser storage', () => {
  const html = renderDashboard().buildDashboardHtml_();
  const context = firstContextWith(html, ['renderParentReportModal', 'copyParentReport']);
  const touched = [];
  const trap = { getItem(k) { touched.push(k); return null; }, setItem(k) { touched.push(k); }, removeItem(k) { touched.push(k); } };
  context.localStorage = trap;
  context.sessionStorage = trap;
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, style: {}, value: '', innerHTML: '', textContent: '', focus() {}, select() {} });
  context.document = { getElementById: el, execCommand: () => true };
  context.navigator = {};
  let recorded = null;
  let done = null;
  const chain = { withSuccessHandler: (f) => { done = f; return chain; }, withFailureHandler: () => chain,
    teacherCopiedParentReport(email) { recorded = email; } };
  context.google = { script: { run: chain } };
  context.showToast = () => {};
  const data = { success: true, weekStart: 'Oct 19', weekEnd: 'Oct 25', excludedStudentCount: 0, reports: [
    { studentEmail: 's@example.invalid', studentName: 'A Student', subject: 'Weekly progress for A, week of October 19',
      itemCount: 0, openCount: 0, progressCount: 0, preview: 'text', copiedAt: '' },
  ] };
  context.renderParentReportModal(data);
  const body = els['parent-report-modal-body'].innerHTML;
  assert.match(body, /0 items this week · 0 competencies rated/, 'zeros print as 0');
  assert.match(body, /KOS does not send it/);
  assert.doesNotMatch(body, /type="email"|pr-addr-/, 'no address field: the teacher sends from their own account');
  el('pr-text-0').value = 'text';
  context.copyParentReport(0, 'subject');
  assert.equal(recorded, null, 'copying the subject does not record the report as copied');
  context.copyParentReport(0, 'text');
  assert.equal(recorded, 's@example.invalid');
  assert.match(els['pr-msg-0'].textContent, /Paste it into an email to A's family/);
  done({ success: true, copiedAt: 'Oct 23, 9:00 AM' });
  assert.match(els['pr-msg-0'].textContent, /Recorded as copied Oct 23, 9:00 AM/);
  assert.deepEqual(touched, []);
  const { exported } = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '13_StudentDashboard.js')], ['buildStudentDashboardHtml_']);
  for (const page of [html, exported.buildStudentDashboardHtml_()]) {
    assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB/);
  }
});
