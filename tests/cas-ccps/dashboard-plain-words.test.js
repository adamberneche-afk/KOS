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
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('13_StudentDashboard.js'), S('07_TeacherDashboard.js')],
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
  const start = student.indexOf('function submitWork(btn)');
  const end = student.indexOf('\n}\n', start) + 2;
  assert.ok(start > 0 && end > start);
  const card = { fileId: 'f1', configId: 'C1', displayStatus: 'Not started yet', statusClass: 'NOT_STARTED', canSubmit: true, submittedAt: null };
  const other = { fileId: 'f2', configId: 'C2', displayStatus: 'Not started yet', statusClass: 'NOT_STARTED', canSubmit: true };
  let handler;
  const runner = {
    withSuccessHandler(fn) { handler = fn; return runner; },
    withFailureHandler() { return runner; },
    submitMyWork() { handler({ ok: true, aiFlowsLive: true, feedbackInComments: true }); },
  };
  const ctx = { google: { script: { run: runner } }, _submitMsgs: {}, _dashCache: {}, renders: 0,
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
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('13_StudentDashboard.js'), S('07_TeacherDashboard.js')],
    ['resolveStudentStatus_', '_tdFlagReason_']);
  assert.match(exported.resolveStudentStatus_('ERROR_TIMEOUT'), /Taking longer than usual.*your teacher knows/);
  assert.match(exported.resolveStudentStatus_('ERROR_EVALUATION'), /your teacher knows\. You can submit again/);
  assert.match(exported.resolveStudentStatus_('ERROR_OTHER'), /tell your teacher/);
  assert.match(exported._tdFlagReason_('ERROR_TIMEOUT'), /didn't finish in time\. Next:/);
  assert.match(exported._tdFlagReason_('ERROR_EVALUATION'), /ask the student to submit again/);
  assert.match(exported._tdFlagReason_('ERROR_X'), /Next: tell your system admin/);
});
