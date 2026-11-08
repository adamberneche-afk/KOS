'use strict';
// The Student and Teacher Dashboards, 2026-10-22. The operator: the UI
// should be easy to read, and system jargon needs either help tools or
// words a user understands. These pin the fix: no text colour that fails
// WCAG AA on the dashboards' light backgrounds, no text under 12px, plain
// words for scales, statuses and term codes, and a Terms panel on each.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
function pages() {
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('13_StudentDashboard.js'), S('71_TurnInCodes.js'), S('71b_TurnInStudent.js'), S('07_TeacherDashboard.js')],
    ['buildStudentDashboardHtml_', 'buildDashboardHtml_', 'CLIENT_WORDS_JS', 'CAS_STUDENT_TERMS', 'CAS_TEACHER_TERMS']);
  return { student: exported.buildStudentDashboardHtml_(), teacher: exported.buildDashboardHtml_(), exported };
}

// The light-theme shades that fail 4.5:1 as text on white or their tints.
const FAILING_TEXT = ['#1a73e8', '#1e8e3e', '#d93025', '#9334e6', '#e37400'];

test('neither dashboard uses a text colour that fails contrast, or text under 12px', () => {
  const { student, teacher } = pages();
  for (const [name, html] of Object.entries({ student, teacher })) {
    for (const c of FAILING_TEXT) {
      assert.ok(!new RegExp('(?<![-\\w])color:\\s*' + c, 'i').test(html), name + ' uses ' + c + ' as a text colour');
    }
    // White text on the old #1a73e8 blue is 4.5:1 exactly; fills moved to #1967d2.
    assert.ok(!/background:\s*#1a73e8/i.test(html), name + ' still fills with #1a73e8');
    const small = [...html.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1]) < 12);
    assert.deepEqual(small.map((m) => m[0]), [], name);
  }
});

test('term codes, SCR ratings and suggested scores are shown in words', () => {
  const { exported } = pages();
  const ctx = {};
  vm.runInNewContext(exported.CLIENT_WORDS_JS + '\nthis.f = { termLabel, scrLabel, scoreLabel };', ctx);
  assert.equal(ctx.f.termLabel('2627_MP1'), 'Marking period 1, 2026–27');
  assert.equal(ctx.f.termLabel('2025-26'), '2025-26', 'an older code is shown as it is');
  assert.equal(ctx.f.scrLabel(1), '1 — Can teach others');
  assert.equal(ctx.f.scrLabel(5), '5 — Cannot perform');
  assert.equal(ctx.f.scoreLabel(4), '4 — Exceptional');
});

test('the dashboards no longer show the jargon the audit found', () => {
  const { student, teacher } = pages();
  for (const gone of ['All Terms', 'Last evaluation:', 'Queued for evaluation', 'Flagged ⚠ — see your teacher']) {
    assert.ok(!student.includes(gone), 'student: ' + gone);
  }
  for (const gone of ['🎓 SCR Reviews', '/5</b>', "'/5</strong>", '" evaluation history"', '" with warm-up responses"', 'All Terms',
    '5 is reserved for your own judgment']) {
    assert.ok(!teacher.includes(gone), 'teacher: ' + gone);
  }
  assert.match(teacher, /const BADGE_WORDS = \{ queued: "Waiting to be checked", active: "Being checked now",/);
  assert.match(teacher, /esc\(BADGE_WORDS\[s\.statusClass\] \|\| s\.status\)/, 'the roster badge prints the words, not the code');
});

test('each dashboard has a Terms panel that explains its words', () => {
  const { student, teacher, exported } = pages();
  for (const [html, list] of [[student, exported.CAS_STUDENT_TERMS], [teacher, exported.CAS_TEACHER_TERMS]]) {
    assert.match(html, /<dialog id="cas-terms"[^>]*aria-labelledby="cas-terms-title"/);
    assert.match(html, /id="cas-terms-btn"[^>]*onclick="casOpenTerms\(\)"/);
    assert.ok(list.length >= 12);
    for (const [term, meaning] of list) {
      assert.ok(html.includes('<dt>' + term.replace(/&/g, '&amp;') + '</dt>'), 'missing ' + term);
      assert.ok(meaning.length > 20, term);
    }
  }
  const scr = exported.CAS_TEACHER_TERMS.find((t) => /SCR/.test(t[0]))[1];
  assert.match(scr, /1 is the highest/);
  assert.match(scr, /5 Cannot perform/);
  const words = exported.CAS_STUDENT_TERMS.map((t) => t[0]);
  for (const w of ['Submit for Feedback', 'Waiting for feedback', 'Passed ✓', 'Couldn’t be checked', 'Comments', 'Extra credit']) {
    assert.ok(words.includes(w), w);
  }
});

// The doc's own Feedback menu (01) uses the dashboard's words for each stage.
test('the doc menu\'s status pop-up uses the dashboard\'s words, never a raw status code', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('01_StudentDoc_ContainerScript.js')],
    ['buildStatusMessage_', 'termLabel_']);
  const base = { unitCode: 'Unit 1', teacherName: 'T', term: exported.termLabel_('2627_MP1'), lastEval: 'Oct 22, 2026 9:00 AM' };
  assert.equal(base.term, 'Marking period 1, 2026–27');
  const say = (status, extra) => exported.buildStatusMessage_({ ...base, status, ...extra }, 'CFG');
  assert.match(say('ACTIVE'), /Not submitted yet[\s\S]*Feedback → Submit for Feedback/);
  assert.match(say('COMPLETE', { lastResult: 'PASSED' }), /Passed\. Your feedback is ready/);
  assert.match(say('COMPLETE', { lastResult: 'NEEDS_REVISION' }), /Revise, then submit again/);
  assert.match(say('PENDING_TEACHER_REVIEW'), /waiting for your teacher/);
  assert.match(say('COMPLIANT'), /your teacher confirmed it/);
  assert.match(say('ERROR_TIMEOUT'), /Couldn't be checked/);
  for (const status of ['ACTIVE', 'COMPLETE', 'PENDING_TEACHER_REVIEW', 'COMPLIANT', 'ERROR_TIMEOUT', 'WEIRD']) {
    const text = say(status);
    assert.doesNotMatch(text, /AI Evaluation Panel|Run Assignment Check|Status: |2627_MP1|evaluat/i, status);
  }
});

// A lesson's *emphasis* reaches the student's doc as italics (02), not asterisks.
test('the doc shows a lesson\'s *emphasis* in italics, without the asterisks', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('02_Form1_IntakeAndWorkspaceGenerator.js')], ['_docItalicSpans_']);
  const md = exported._docItalicSpans_('Explain *why* it worked and what comes *next*.');
  assert.equal(md.text, 'Explain why it worked and what comes next.');
  assert.deepEqual(JSON.parse(JSON.stringify(md.spans)), [[8, 10], [37, 40]]);
  assert.deepEqual(JSON.parse(JSON.stringify(exported._docItalicSpans_('No stars here').spans)), []);
});

// UX audit fix-first 2 (2026-10-22): after a successful Submit the card
// shows "Waiting for feedback…" with Submit gone, instead of re-rendering
// the old "Not started yet" card with Submit still active.
test('after a successful Submit, the card says it is waiting and Submit is gone', () => {
  const { student } = pages();
  // submitWork asks for the reflection questions first (2026-10-24); with
  // none, it submits and submitDone updates the card.
  const start = student.indexOf('function submitWork(btn)');
  const end = student.indexOf('// NEW (finding #7)', start);
  assert.ok(start > 0 && end > start);
  const card = { fileId: 'f1', configId: 'C1', displayStatus: 'Not started yet', statusClass: 'NOT_STARTED', canSubmit: true, submittedAt: null };
  const other = { fileId: 'f2', configId: 'C2', displayStatus: 'Not started yet', statusClass: 'NOT_STARTED', canSubmit: true };
  let handler;
  const runner = {
    withSuccessHandler(fn) { handler = fn; return runner; },
    withFailureHandler() { return runner; },
    getSubmitReflection() { handler({ ok: true, questions: [] }); },
    submitMyWork() { handler({ ok: true, aiFlowsLive: true, feedbackInComments: true }); },
  };
  // scriptRun() is the page's google.script.run (or, on the demo page, its stubs).
  const ctx = { google: { script: { run: runner } }, scriptRun: () => runner, _submitMsgs: {}, _dashCache: {}, _reflect: {}, renders: 0,
    _lastDashData: { assignments: [card, other] } };
  ctx.render = () => { ctx.renders++; };
  vm.runInNewContext(student.slice(start, end), ctx);
  const btn = { attrs: { 'data-file': 'f1', 'data-config': 'C1' }, getAttribute(k) { return this.attrs[k]; } };
  ctx.submitWork(btn);
  assert.equal(card.displayStatus, 'Waiting for feedback…');
  assert.equal(card.canSubmit, false);
  assert.equal(card.submittedAt, 'just now');
  assert.equal(other.canSubmit, true, 'only the submitted card changes');
  assert.equal(ctx.renders, 1);
  assert.match(ctx._submitMsgs.f1.text, /Comments/);
});

// UX audit fix-first 4 (2026-10-22): failures are worded as the system's,
// the student isn't told to report what the teacher already knows, and the
// teacher's row says why and what to do.
test('a failed or timed-out check reads as the system\'s problem, with a next step for the teacher', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('13_StudentDashboard.js'), S('71_TurnInCodes.js'), S('71b_TurnInStudent.js'), S('07_TeacherDashboard.js')],
    ['resolveStudentStatus_', '_tdFlagReason_']);
  assert.match(exported.resolveStudentStatus_('ERROR_TIMEOUT'), /Taking longer than usual.*your teacher knows/);
  assert.match(exported.resolveStudentStatus_('ERROR_EVALUATION'), /your teacher knows\. You can submit again/);
  assert.match(exported.resolveStudentStatus_('ERROR_OTHER'), /tell your teacher/);
  assert.match(exported._tdFlagReason_('ERROR_TIMEOUT'), /didn't finish in time\. Next:/);
  assert.match(exported._tdFlagReason_('ERROR_EVALUATION'), /ask the student to submit again/);
  assert.match(exported._tdFlagReason_('ERROR_X'), /Next: tell your system admin/);
});

// UX audit fix-first 11 (2026-10-22): the doc's task drops the Canvas text's
// title line and its "Submission:" part, which contradicts CAS.
test('the doc shows the task without the Canvas title line or the Submission part', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('02_Form1_IntakeAndWorkspaceGenerator.js')], ['_docStudentTask_']);
  const task = 'Title: Assignment: Brand Analysis\n\nDescription:\n\nDo it well.\n\nWhat your work needs to show:\n\n- A\n\nSubmission:\n\nSubmit your responses as a Text Entry.';
  assert.equal(exported._docStudentTask_(task), 'Description:\n\nDo it well.\n\nWhat your work needs to show:\n\n- A');
  assert.equal(exported._docStudentTask_('Just the task.'), 'Just the task.');
  // Since 2026-10-28 the task opens with its title line alone; an 8175 project's too.
  assert.equal(exported._docStudentTask_('Assignment: Brand Analysis\n\nDescription:\n\nDo it.'), 'Description:\n\nDo it.');
  assert.equal(exported._docStudentTask_('Project: The Album Drop\n\nDescription:\n\nDo it.'), 'Description:\n\nDo it.');
  assert.equal(exported._docStudentTask_('Do it.\n\nProject: a later line stays.'), 'Do it.\n\nProject: a later line stays.');
});

test('the Teacher Dashboard has one "+ New lesson" (📅 Lessons drafts one); the header logs today\'s lesson', () => {
  const { teacher } = pages();
  assert.ok(teacher.includes(">+ Log today's lesson</button>"));
  assert.ok(!teacher.includes('>+ New Lesson</button>'));
});

// ── The Student Dashboard's cards (2026-11-07) ──────────────────────────
// A short pill with the rest of the status on its own line, one filled
// button chosen by the status, no "Not checked yet" while the work is being
// checked, a "Do next" list of the cards that need the student, and a
// "Not yet:" line from the last check's evidence on a card to revise.

const ME = 'amy@ccpsnet.net';
function studentData() {
  const session = {
    getActiveUser() { return { getEmail() { return ME; } }; },
    getEffectiveUser() { return { getEmail() { return 'admin@ccpsnet.net'; } }; },
    getScriptTimeZone() { return 'America/New_York'; },
  };
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('13_StudentDashboard.js'), S('71_TurnInCodes.js'), S('71b_TurnInStudent.js')],
    ['getStudentDashboardData', 'buildStudentDashboardHtml_', 'LEDGER'], { Session: session });
  const L = exported.LEDGER;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const row = (id, unit, status, block, lastResult, lastEval) => {
    const r = new Array(27).fill('');
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = ME; r[L.CONFIG_ID] = id; r[L.FILE_ID] = 'f-' + id;
    r[L.STUDENT_NAME] = 'Amy'; r[L.COURSE_NAME] = unit; r[L.CLASS_NAME] = '8175 Sports Marketing';
    r[L.BLOCK] = block; r[L.PERIOD] = block; r[L.STATUS] = status;
    r[L.LAST_RESULT] = lastResult || ''; r[L.LAST_EVAL] = lastEval || '';
    ledger.appendRow(r);
  };
  row('A1', 'Lesson 01 Revenue', 'COMPLETE', '1', 'PASSED', new Date('2026-10-20T10:00:00'));
  row('A2', 'Lesson 02 Sponsors', 'ACTIVE', '1');
  row('A3', 'Lesson 03 SWOT', 'COMPLETE', '3', 'NEEDS_REVISION', new Date('2026-10-21T10:00:00'));
  row('A4', 'Lesson 04 Pricing', 'ACTIVE', '3');
  // A4 is being checked right now.
  const sp = ss.insertSheet('STAGING_PIPELINE');
  sp.appendRow(['StudentFileID', 'Status']);
  sp.appendRow(['f-A4', 'IN_PROCESS']);
  // A3's checks: the first (Oct 19) missed milestone 2; the last (Oct 21)
  // met the primary (milestone 1) and missed milestone 2 again.
  const ev = ss.insertSheet('CompetencyEvidence');
  ev.appendRow(['evidence_id', 'student_email', 'competency_id', 'milestone_text', 'outcome', 'config_id',
    'evaluated_at', 'student_file_id', 'archive_status']);
  const e = (comp, text, outcome, at) => ev.appendRow(['e', ME, comp, text, outcome, 'A3', new Date(at), 'f-A3', '']);
  e('8175-30', '8175-30 Explain two revenue streams.', 'NOT_MET', '2026-10-19T10:00:00');
  e('8175-30', '8175-30 Explain two revenue streams.', 'MET', '2026-10-21T10:00:00');
  e('8175-31', '8175-31 Compare two sponsors by cost.', 'PARTIALLY_MET', '2026-10-21T10:00:00');
  const data = JSON.parse(JSON.stringify(exported.getStudentDashboardData('')));
  return { exported, data, by: Object.fromEntries(data.assignments.map(a => [a.configId, a])) };
}

function studentPage(exported) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', options: [], setAttribute() {}, appendChild() {},
    classList: { add() {}, remove() {} } });
  const ctx = {
    document: { getElementById: el, addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const { extractInlineScripts } = require('../../tools/html-lint/check.js');
  extractInlineScripts(exported.buildStudentDashboardHtml_()).forEach(code => vm.runInContext(code, ctx));
  return { ctx, els };
}

test('Student Dashboard: a short pill, with the rest of the status on its own line', () => {
  const { by } = studentData();
  assert.deepEqual([by.A1.statusPill, by.A2.statusPill, by.A3.statusPill, by.A4.statusPill],
    ['Passed ✓', 'Not started', 'Revise', 'Being checked']);
  assert.equal(by.A1.statusNote, 'Feedback is ready: check your document');
  assert.equal(by.A3.statusNote, 'Revise, then submit again: check your document');
  assert.equal(by.A2.statusNote, '', 'the pill says it all');
  assert.equal(by.A4.statusNote, '');
  assert.match(by.A3.displayStatus, /^Feedback ready — revise/, 'displayStatus is unchanged for the doc menu');
  const { exported } = studentData();
  const words = exported.buildStudentDashboardHtml_();
  for (const pill of ['Not started', 'Being checked', 'Revise', 'Turned in', 'Done ✓', 'Taking longer', 'Not yet', 'Do next']) {
    assert.ok(words.includes('<dt>' + pill + '</dt>'), 'the Terms panel explains ' + pill);
  }
  assert.doesNotMatch(words, /max-width:55%/, 'no right-aligned pill squeezing the title');
});

test('Student Dashboard: one filled button per card, chosen by its status', () => {
  const { exported, by } = studentData();
  const { ctx } = studentPage(exported);
  const filled = (a) => {
    const h = ctx.cardHtml(a);
    const m = [...h.matchAll(/<(?:a|button)[^>]*class="act act-primary[^"]*"[^>]*>([^<]*)</g)];
    assert.equal(m.length, 1, 'exactly one primary on ' + a.configId);
    assert.equal((h.match(/act-secondary/g) || []).length, (h.match(/class="act /g) || []).length - 1);
    return m[0][1].trim();
  };
  assert.equal(filled(by.A2), 'Open My Document ↗', 'not started: open the doc');
  assert.equal(filled(by.A4), 'Open My Document ↗', 'being checked: open the doc');
  assert.equal(filled(by.A3), 'Submit for Feedback', 'to revise: submit');
  assert.equal(filled(by.A1), 'View feedback ↗', 'passed: view the feedback');
  assert.ok(ctx.cardHtml(by.A3).indexOf('Submit for Feedback') < ctx.cardHtml(by.A3).indexOf('Open My Document'),
    'the primary comes first');
  assert.match(ctx.cardHtml(by.A2), /<button type="button" class="act act-secondary"[^>]*>Submit for Feedback/,
    'Submit stays a real button');
  assert.equal(filled(Object.assign({}, by.A3, { canSubmit: false })), 'Open My Document ↗',
    'Submit can\'t be pressed: the doc is the primary');
});

test('Student Dashboard: no "Not checked yet" while the work is being checked', () => {
  const { exported, by } = studentData();
  const { ctx } = studentPage(exported);
  assert.equal(ctx.evalLine(by.A4), '');
  assert.doesNotMatch(ctx.cardHtml(by.A4), /Not checked yet|eval-line/);
  assert.equal(ctx.evalLine(by.A2), '', 'nor before it was started');
  const failed = Object.assign({}, by.A2, { status: 'ERROR_EVALUATION', statusClass: 'ISSUE', statusPill: 'Couldn’t be checked ⚠',
    statusNote: 'Your teacher knows. You can submit again', lastEval: '' });
  assert.equal(ctx.evalLine(failed), '', 'nor on a check that failed: its own line says what happened');
  assert.doesNotMatch(ctx.cardHtml(failed), /Not checked yet|eval-line/);
  assert.equal(ctx.evalLine(Object.assign({}, failed, { status: 'ERROR_TIMEOUT', statusPill: 'Taking longer ⚠' })), '');
  assert.match(ctx.evalLine(by.A3), /^Last checked: Oct 21, 2026/);
  assert.equal(ctx.evalLine({ statusClass: 'IN_PROGRESS', statusPill: 'Waiting for feedback', lastEval: '' }), 'Not checked yet');
});

test('Student Dashboard: "Do next" lists the cards that need the student, only when there are any', () => {
  const { exported, data, by } = studentData();
  const { ctx, els } = studentPage(exported);
  ctx.render(data);
  const h = els.main.innerHTML;
  assert.match(h, /<section class="do-next" aria-labelledby="do-next-h"><h2 id="do-next-h">Do next<\/h2><ul><li><a href="#card-A3"[^>]*>Lesson 03 SWOT<\/a><span class="pill pill-NEEDS_ACTION">Revise<\/span><\/li><\/ul><\/section>/);
  assert.ok(h.indexOf('class="do-next"') < h.indexOf('class="group-header"'), 'above the classes');
  assert.ok(h.includes('id="card-A3" tabindex="-1"'), 'the link\'s target');
  assert.equal((h.match(/class="group-header"/g) || []).length, 2, 'grouping stays below');
  assert.equal(ctx.doNextHtml([by.A1, by.A2, by.A4]), '', 'nothing needs the student: no band');
  assert.equal(ctx.doNextHtml([Object.assign({}, by.A4, { statusClass: 'ISSUE', status: 'ERROR_TIMEOUT' })]), '',
    'a timeout is not the student\'s to do');
});

test('Student Dashboard: a card to revise says what the last check didn\'t find yet', () => {
  const { exported, by } = studentData();
  assert.equal(by.A3.notYet, 'Compare two sponsors by cost', 'the last check\'s first milestone not met');
  assert.equal(by.A1.notYet, '');
  assert.equal(by.A2.notYet, '');
  const { ctx } = studentPage(exported);
  assert.match(ctx.cardHtml(by.A3), /<div class="next-step"><b>Not yet:<\/b> Compare two sponsors by cost<\/div>/);
  assert.doesNotMatch(ctx.cardHtml(Object.assign({}, by.A3, { statusClass: 'IN_PROGRESS' })), /Not yet:/,
    'gone once it is resubmitted');
});

test('touch screens get 44px targets; the teacher\'s student names are at least 24px', () => {
  const { student, teacher } = pages();
  assert.match(student, /@media \(pointer: coarse\)\{\s*button,select,\.act\{min-height:44px !important\}/);
  assert.match(teacher, /@media \(pointer: coarse\)\{header button,header select\{min-height:44px !important\}\}/);
  assert.match(teacher, /\.name-link\{[^}]*padding:4px 2px;margin:-4px -2px;min-height:24px/);
});
