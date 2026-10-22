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
