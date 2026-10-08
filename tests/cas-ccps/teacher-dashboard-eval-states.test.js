'use strict';
// The Teacher Dashboard (07) shows each student's work in one of four
// states, from the Ledger's evaluation result columns (37's
// recordEvaluationResult_): not checked, checked but not passing yet,
// passed, or passed before with the latest check needing revision. "Not
// checked" and "not passing yet" are different situations for the teacher.
// It groups students by lesson (StudentAssignments → LessonSchedule) and
// marks the course's current lesson, the one with the latest start_date on
// or before today.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const TEACHER = 'teacher@example.com'; // the sandbox's default signed-in user

// The whole teacher-dashboard project, as it runs (tools/gas-lint/project-map.json).
const PROJECT_FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:teacher-dashboard'].files
  .map(f => path.join(__dirname, '..', '..', f));

function load() {
  return loadGasFiles(PROJECT_FILES, ['getDashboardData', '_tdEvalState_', 'LEDGER']);
}

function ledgerRow(exported, name, configId, fileId, result) {
  const L = exported.LEDGER;
  const row = new Array(27).fill('');
  row[L.TIMESTAMP] = new Date(); row[L.GOOGLE_ID] = name + '@ccpsnet.net'; row[L.CONFIG_ID] = configId;
  row[L.FILE_ID] = fileId; row[L.STUDENT_NAME] = name; row[L.TEACHER_EMAIL] = TEACHER;
  row[L.COURSE_NAME] = '8175 Marketing'; row[L.PERIOD] = '1'; row[L.STATUS] = 'ACTIVE';
  Object.assign(row, result || {});
  return row;
}

function setUp(sandbox, exported, opts) {
  const withLessons = !(opts && opts.noLessonTabs);
  const L = exported.LEDGER;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  [
    ledgerRow(exported, 'Amy', 'VDOE-A', 'f-a'),
    ledgerRow(exported, 'Bo', 'VDOE-B', 'f-b', { [L.CHECK_COUNT]: 2, [L.LAST_RESULT]: 'NEEDS_REVISION' }),
    ledgerRow(exported, 'Cy', 'VDOE-C', 'f-c', { [L.CHECK_COUNT]: 1, [L.LAST_RESULT]: 'PASSED',
      [L.FIRST_PASSED_AT]: new Date('2026-10-09T12:00:00'), [L.LAST_SUGGESTED_SCORE]: 3 }),
    ledgerRow(exported, 'Di', 'VDOE-D', 'f-d', { [L.CHECK_COUNT]: 3, [L.LAST_RESULT]: 'NEEDS_REVISION',
      [L.FIRST_PASSED_AT]: new Date('2026-10-09T12:00:00') }),
    ledgerRow(exported, 'Ed', 'VDOE-E', 'f-e'),
  ].forEach(r => ledger.appendRow(r));
  if (!withLessons) return ss;
  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['StudentConfigID', 'GoogleID', 'AssignmentConfigID', 'RecordedAt']);
  ['A', 'B', 'C', 'D'].forEach(x => sa.appendRow(['VDOE-' + x, '', 'CAS-8175-L06', '']));
  sa.appendRow(['VDOE-E', '', 'CAS-8175-L05', '']);
  const ls = ss.insertSheet('LessonSchedule');
  ls.appendRow(['course', 'lesson_key', 'lesson', 'start_date', 'config_id', 'notes']);
  ls.appendRow(['8175', '8175-L05', 'Lesson 05', '2026-10-01', 'CAS-8175-L05', '']);
  ls.appendRow(['8175', '8175-L06', 'Lesson 06', '2026-10-08', 'CAS-8175-L06', '']);
  ls.appendRow(['8175', '8175-L07', 'Lesson 07', '2999-01-01', 'CAS-8175-L07', '']);
  return ss;
}

test('_tdEvalState_: not checked, not passing, passed, passed before', () => {
  const { exported } = load();
  assert.equal(exported._tdEvalState_('', ''), 'NOT_CHECKED');
  assert.equal(exported._tdEvalState_('NEEDS_REVISION', ''), 'NOT_PASSING');
  assert.equal(exported._tdEvalState_('PASSED', new Date()), 'PASSED');
  assert.equal(exported._tdEvalState_('NEEDS_REVISION', new Date()), 'PASSED_BEFORE');
});

test('getDashboardData: each student carries its state, checks, first pass and suggested score', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, exported);
  const data = exported.getDashboardData('ALL');
  const by = Object.fromEntries(data.students.map(s => [s.name, s]));
  assert.equal(by.Amy.evalState, 'NOT_CHECKED');
  assert.equal(by.Amy.checkCount, 0);
  assert.equal(by.Bo.evalState, 'NOT_PASSING');
  assert.equal(by.Bo.checkCount, 2);
  assert.equal(by.Cy.evalState, 'PASSED');
  assert.equal(by.Cy.lastSuggestedScore, 3);
  assert.ok(by.Cy.firstPassedAt);
  assert.equal(by.Di.evalState, 'PASSED_BEFORE');
  assert.equal(by.Di.lastSuggestedScore, null);
});

test('getDashboardData: students are grouped by lesson, and the current lesson is the latest one started', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, exported);
  const data = exported.getDashboardData('ALL');
  const by = Object.fromEntries(data.students.map(s => [s.name, s]));
  assert.equal(by.Amy.assignmentName, 'Lesson 06');
  assert.equal(by.Amy.isCurrentLesson, true);
  assert.equal(by.Ed.assignmentName, 'Lesson 05');
  assert.equal(by.Ed.isCurrentLesson, false);
  // Lesson 07 hasn't started and no student is in it, so it isn't offered.
  assert.deepEqual(data.lessons.map(l => [l.id, l.current]),
    [['CAS-8175-L06', true], ['CAS-8175-L05', false]]);
});

test('getDashboardData: without StudentAssignments or LessonSchedule, students fall back to their course', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, exported, { noLessonTabs: true });
  const data = exported.getDashboardData('ALL');
  assert.ok(data.students.every(s => s.assignmentName === '8175 Marketing' && !s.isCurrentLesson));
  assert.deepEqual(data.lessons, []);
});
