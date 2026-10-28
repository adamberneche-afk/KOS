'use strict';
// 66's teacher doc, one per lesson (meta/SPRINT_LESSON_DOCS_2026-11.md): made
// once with the plan, an itinerary per day with minutes for each of the
// course's blocks on A and B, look-fors, each day it runs and a class status
// snapshot; a second call refreshes only the status. The lesson builder's
// rows make no per-period Lesson Frame any more.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const TEACHER = 'teacher@ccpsnet.net';

function load() {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('22_LessonContextHandler.js'), S('26_CompetencyAlignmentLog.js'),
    S('23_StudentProfileManager.js'), S('27_LessonFrameGenerator.js'), S('32_CompetencyRubricImporter.js'), S('55b_LessonAssignmentData.js'), S('66_LessonDoc.js')],
  ['makeOrRefreshLessonDoc_', 'onLessonContextSubmit_'],
  { Session: { getScriptTimeZone: () => 'America/New_York', getActiveUser: () => ({ getEmail: () => TEACHER }) } });
  const { sandbox } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const ls = ss.insertSheet('LessonSchedule');
  ls.appendRow(['course', 'lesson_key', 'lesson', 'start_date', 'config_id', 'notes']);
  ls.appendRow(['8175', '8175-L06', 'L06', '2026-10-26', 'CAS-8175-L06', '']);
  ls.appendRow(['8175', '8175-L07', 'L07', '2026-10-29', 'CAS-8175-L07', '']);
  const cs = ss.insertSheet('ClassSchedule');
  cs.appendRow(['teacher_email', 'period', 'day_type', 'course_name', 'active']);
  cs.appendRow([TEACHER, '1', 'DAILY_HALF', 'Sports and Entertainment Marketing', '']);
  cs.appendRow([TEACHER, '3-Odd', 'ODD', 'Sports and Entertainment Marketing', '']);
  cs.appendRow([TEACHER, '3-Even', 'EVEN', 'Sports and Entertainment Marketing', '']);
  cs.appendRow([TEACHER, '4', 'ODD', 'Entrepreneurship 8177', '']);
  const ns = ss.insertSheet('NoSchoolDays');
  ns.appendRow(['date', 'note']);
  ns.appendRow(['2026-10-27', 'a day off for the test']);
  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['student_config_id', 'student_email', 'assignment_config_id']);
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const at = (d) => new sandbox.Date(d);
  // [workspace, period, status, submitted, lastResult, firstPassed]
  [['W1', '1', 'ACTIVE', null, '', null], ['W2', '1', 'SUBMITTED', at('2026-10-27T15:00:00Z'), '', null],
    ['W3', '3-Odd', 'COMPLETE', at('2026-10-27T15:00:00Z'), 'PASSED', at('2026-10-27T16:00:00Z')],
    ['W4', '3-Odd', 'SCHEDULED', null, '', null], ['OTHER', '1', 'ACTIVE', null, '', null]].forEach(([w, p, st, sub, res, fp]) => {
    const r = new Array(27).fill('');
    r[1] = '1234567@ccpsnet.net'; r[2] = w; r[4] = 'Student'; r[8] = TEACHER; r[11] = p; r[12] = st;
    r[13] = sub || ''; r[24] = res; r[25] = fp || '';
    ledger.appendRow(r);
    sa.appendRow([w, '1234567@ccpsnet.net', w === 'OTHER' ? 'CAS-8175-L07' : 'CAS-8175-L06']);
  });
  return Object.assign(env, { ss });
}

const docText = (sandbox, id) => sandbox.DocumentApp.openById(id).getBody().getText();

test('the lesson doc: the plan, an itinerary with A and B minutes for the course\'s blocks, look-fors, each day it runs', () => {
  const { exported, sandbox, ss } = load();
  const res = exported.makeOrRefreshLessonDoc_('8175-L06', { today: new sandbox.Date('2026-10-26T12:00:00Z') });
  assert.equal(res.success, true);
  assert.equal(res.created, true);
  const doc = sandbox.DocumentApp.openById(res.docId);
  const text = doc.getBody().getText();
  assert.match(text, /^Lesson Plan — 8175 L06 SKILL DEVELOPMENT PLAN/);
  assert.match(text, /Starts Mon Oct 26; the next lesson starts Thu Oct 29\./);
  assert.match(text, /Primary: 8175-20 Demonstrate professionalism\./);
  assert.match(text, /I can plan to grow professionally/);
  ['The plan', 'Itinerary', 'Look-fors', 'Each day it runs', 'Class status'].forEach((h) =>
    assert.ok(text.indexOf('\n' + h + '\n') !== -1, h));
  // Itinerary: the 1st and 3rd blocks (periods 1 and 3-Odd/3-Even), A and B each.
  const table = doc.getBody().paragraphs.find((p) => p.getNumRows && p.getNumRows() > 0);
  const head = table.rows[0].cells.map((c) => c.getText());
  assert.deepEqual(head, ['Block', 'Mode', '1st A (50)', '1st B (45)', '3rd A (100)', '3rd B (95)', 'What happens']);
  const task = table.rows[3].cells.map((c) => c.getText());
  assert.deepEqual(task.slice(1, 6), ['💻 Chromebooks out', '30', '25', '80', '75']);
  // Each day: Oct 26 (A) and Oct 28 (B); Oct 27 is off; Oct 29 is the next lesson.
  assert.match(text, /Mon Oct 26 · Schedule A · period 1, 3-Even/);
  assert.match(text, /Wed Oct 28 · Schedule B · period 1, 3-Even/);
  assert.doesNotMatch(text, /Oct 27 ·|Oct 29 ·/);
  const reg = ss.getSheetByName('LessonDocs').getDataRange().getValues();
  assert.deepEqual(reg[0], ['lesson_key', 'doc_id', 'doc_url', 'created_at', 'status_refreshed_at']);
  assert.equal(reg[1][0], '8175-L06');
  assert.equal(sandbox.DriveApp.getFileById(res.docId).getParents().next().getName(), 'Lesson Plans');
});

test('class status counts by period, for this lesson only; a second call refreshes it and keeps the rest', () => {
  const { exported, sandbox, ss } = load();
  const first = exported.makeOrRefreshLessonDoc_('8175-L06', { today: new sandbox.Date('2026-10-27T12:00:00Z') });
  let text = docText(sandbox, first.docId);
  const status = text.slice(text.lastIndexOf('Class status'));
  assert.match(status, /Period\nDocs made\nShared\nSubmitted\nWaiting for feedback\nPassed\n1\n2\n2\n1\n1\n0\n3-Odd\n2\n1\n1\n0\n1/);
  assert.doesNotMatch(text, /1234567|2345678/, 'counts only');
  // A third student in period 1 submits; the teacher wrote a note above.
  const body = sandbox.DocumentApp.openById(first.docId).getBody();
  body.insertParagraph(3, 'My own note.');
  const r = new Array(27).fill('');
  r[1] = '2345678@ccpsnet.net'; r[2] = 'W5'; r[8] = TEACHER; r[11] = '1'; r[12] = 'SUBMITTED'; r[13] = new sandbox.Date('2026-10-28T15:00:00Z');
  ss.getSheetByName('Ledger').appendRow(r);
  ss.getSheetByName('StudentAssignments').appendRow(['W5', '2345678@ccpsnet.net', 'CAS-8175-L06']);
  const again = exported.makeOrRefreshLessonDoc_('8175-L06', { today: new sandbox.Date('2026-10-28T12:00:00Z') });
  assert.equal(again.created, false);
  assert.equal(again.docId, first.docId);
  text = docText(sandbox, first.docId);
  assert.match(text, /My own note\./, 'the teacher\'s edits stay');
  assert.equal(text.split('Class status').length, 2, 'one status section');
  assert.match(text.slice(text.lastIndexOf('Class status')), /\n1\n3\n3\n2\n2\n0\n/);
  assert.equal(ss.getSheetByName('LessonDocs').getLastRow(), 2, 'still one registry row');
});

test('a multi-day 8177 lesson gets a table per day; an unknown lesson is refused', () => {
  const { exported, sandbox } = load();
  const res = exported.makeOrRefreshLessonDoc_('8177-game-day-takeover', { today: new sandbox.Date('2026-10-26T12:00:00Z') });
  const text = docText(sandbox, res.docId);
  assert.match(text, /\nDay 1: The Plan\n/);
  assert.match(text, /\nDay 2: The Follow-Up\n/);
  assert.match(text, /4th A \(100\)\n4th B \(90\)/);
  assert.match(text, /Not dated in LessonSchedule yet/);
  assert.match(text, /No class meetings found/);
  assert.equal(exported.makeOrRefreshLessonDoc_('8175-L99').success, false);
});

test('the lesson builder\'s rows make no per-period Lesson Frame; a hand-logged lesson still does', () => {
  const src = require('fs').readFileSync(S('51_CourseYearBuilder.js'), 'utf8');
  assert.match(src, /noFrame: true/);
  const handler = require('fs').readFileSync(S('22_LessonContextHandler.js'), 'utf8');
  assert.match(handler, /if \(alignResult\.success && payload\.noFrame\) return \{ success: true, lessonId: lessonId, frameDocUrl: null \};/);
});
