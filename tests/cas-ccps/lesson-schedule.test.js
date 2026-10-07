'use strict';
// 55_LessonSchedule.js: the teacher's own lessons on the dates in the
// LessonSchedule tab. Pins: seeding adds every lesson once, dated L06 and
// Employee Handbook for 2026-10-08, and never changes a typed date; the
// lesson for a date is the latest started one, and the pacing guide covers
// the days before; the lesson builder (51) drafts the scheduled lesson, per
// course; the assignment seeder (53) seeds a lesson starting within a week,
// as Config ID CAS-8175-L06; archiveAssignment_ (54) retires an assignment.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles, FakeDriveFolder } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const S = (f) => path.join(ROOT, 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '22_LessonContextHandler.js', '22b_CompetencyRegistryImporter.js',
  '23_StudentProfileManager.js', '24_WarmUpBridge.js', '26_CompetencyAlignmentLog.js',
  '27_LessonFrameGenerator.js', '31_PacingGuideManager.js', '32_CompetencyRubricImporter.js',
  '51_CourseYearBuilder.js', '53b_UnitAssignmentData.js', '53_AssignmentSeeder.js', '54_StudentAssignments.js',
  '55b_LessonAssignmentData.js', '55_LessonSchedule.js'].map(S);
const EXPOSE = ['seedLessonSchedule', 'scheduledLessonUnit_', 'resolveUnitForCourseDate_', 'buildUpcomingLessonPlan_',
  'seedAssignments_', 'archiveAssignment_', 'recordStudentAssignment_', 'getWarmUpAnchor_', 'PG_HEADERS',
  'LESSON_ASSIGNMENTS'];
const TEACHER = 'teacher@ccpsnet.net';
const PACING = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps/curriculum/PacingGuide_CAS_Context.json'), 'utf8')).pacing_guide;
const RUBRICS = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps/data/CompetencyRubrics.json'), 'utf8')).competency_rubrics;
const OCT7 = new Date(2026, 9, 7);

function setup() {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('CURRENT_TERM', '2026-27');
  props.setProperty('TEACHER_EMAIL', TEACHER);
  props.setProperty('TEACHER_NAME', 'Teacher');
  const folder = new FakeDriveFolder('Teacher', 'teacher-folder-1');
  sandbox.DriveApp._registerFolder(folder);
  props.setProperty('TEACHER_FOLDER_ID', folder.getId());

  ss.insertSheet('LessonContext').appendRow(['lesson_id', 'teacher_email', 'submitted_at', 'lesson_date',
    'period_or_class', 'activity_description', 'learning_objective', 'key_vocabulary',
    'prior_lesson_connection', 'competency_ids', 'status', 'alignment_logged_at', 'error_notes', 'term']);
  ss.insertSheet('AlignmentLog').appendRow(['log_id', 'lesson_id', 'logged_at', 'lesson_date', 'teacher_email',
    'learning_objective', 'competency_id', 'competency_text', 'strand']);
  const reg = ss.insertSheet('CompetencyRegistry');
  reg.appendRow(['competency_id', 'competency_text', 'subject', 'strand', 'active']);
  Object.values(RUBRICS).forEach((r) => reg.appendRow([r.competency_id, r.competency_text, 'CTE', r.duty_area, 'TRUE']));
  const rub = ss.insertSheet('CompetencyRubrics');
  rub.appendRow(['competency_id', 'course', 'task_number', 'duty_area', 'competency_text',
    'demonstration_standard', 'demonstration_indicators', 'skill_questions']);
  const pg = ss.insertSheet('PacingGuide');
  pg.appendRow(exported.PG_HEADERS.slice());
  PACING.forEach((u) => pg.appendRow(exported.PG_HEADERS.map((h) => {
    const v = u[h];
    return v === undefined ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
  })));
  const cs = ss.insertSheet('ClassSchedule');
  cs.appendRow(['teacher_email', 'period', 'day_type', 'course_name', 'active']);
  cs.appendRow([TEACHER, '1', 'DAILY', 'Sports Entertainment and Event Marketing', 'TRUE']);
  cs.appendRow([TEACHER, '1', 'DAILY', 'Sports Entertainment and Event Management', 'TRUE']);

  const matrix = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(matrix.getId(), matrix);
  const mr = ss.insertSheet('MatrixRegistry');
  mr.appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  mr.appendRow(['Teacher', TEACHER, matrix.getId(), new Date()]);
  return { exported, sandbox, ss, props, matrix };
}

const rows = (ss, tab) => {
  const sh = ss.getSheetByName(tab);
  return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
};

test('seedLessonSchedule adds every lesson once, with the first two dated, and keeps typed dates', () => {
  const { exported, ss } = setup();
  exported.seedLessonSchedule();
  const tab = rows(ss, 'LessonSchedule');
  const n = Object.keys(exported.LESSON_ASSIGNMENTS).length;
  assert.equal(tab.length, n);
  const dated = tab.filter((r) => r[3]).map((r) => [r[1], String(r[3]), r[4]]);
  assert.deepEqual(dated, [['8175-L06', '2026-10-08', 'CAS-8175-L06'],
    ['8177-employee-handbook-operations', '2026-10-08', 'CAS-8177-EMPLOYEE-HANDBOOK-OPERATIONS']]);

  const sheet = ss.getSheetByName('LessonSchedule');
  const l07 = tab.findIndex((r) => r[1] === '8175-L07') + 2;
  sheet.getRange(l07, 4).setValue('2026-10-13');
  exported.seedLessonSchedule();
  assert.equal(rows(ss, 'LessonSchedule').length, n, 'nothing added twice');
  assert.equal(String(sheet.getRange(l07, 4).getValue()), '2026-10-13', 'a typed date is kept');
});

test('the lesson for a date is the latest one started; the pacing guide covers the days before', () => {
  const { exported, ss } = setup();
  exported.seedLessonSchedule();
  const sheet = ss.getSheetByName('LessonSchedule');
  const tab = rows(ss, 'LessonSchedule');
  sheet.getRange(tab.findIndex((r) => r[1] === '8175-L07') + 2, 4).setValue('2026-10-13');

  assert.equal(exported.scheduledLessonUnit_('2026-10-07', '8175'), null);
  assert.equal(exported.resolveUnitForCourseDate_('2026-10-07', '8175').lesson_unit_id, 'S1-U1');
  assert.equal(exported.resolveUnitForCourseDate_('2026-10-08', '8175').lesson_unit_id, '8175-L06');
  const l06 = exported.resolveUnitForCourseDate_('2026-10-12', '8175');
  assert.equal(l06.lesson_unit_id, '8175-L06');
  assert.equal(l06.approx_end, '2026-10-13', 'runs until the next lesson starts');
  assert.equal(exported.resolveUnitForCourseDate_('2026-10-13', '8175').lesson_unit_id, '8175-L07');
  assert.equal(exported.resolveUnitForCourseDate_('2026-10-08', '8177').lesson_unit_id,
    '8177-employee-handbook-operations');
  const anchor = exported.getWarmUpAnchor_('2026-10-08', 'Sports Entertainment and Event Management');
  assert.match(anchor.anchor, /Starbucks in Richmond/);
});

test('the lesson builder drafts each course\'s scheduled lesson', () => {
  const { exported, ss } = setup();
  exported.seedLessonSchedule();
  const plan = exported.buildUpcomingLessonPlan_({ apply: false, today: OCT7 });
  const oct8 = plan.planned.filter((p) => p.date === '2026-10-08').map((p) => [p.period, p.unit]);
  assert.deepEqual(oct8, [['1 (8175)', '8175-L06'], ['1 (8177)', '8177-employee-handbook-operations']]);
  assert.equal(rows(ss, 'LessonContext').length, 0);
});

test('the seeder seeds the lessons starting within a week, as CAS-<course>-<lesson>', () => {
  const { exported, matrix, sandbox } = setup();
  exported.seedLessonSchedule();
  const r = exported.seedAssignments_({ apply: true, today: OCT7 });
  const ids = r.planned.map((p) => p.configId);
  assert.ok(ids.includes('CAS-8175-L06') && ids.includes('CAS-8177-EMPLOYEE-HANDBOOK-OPERATIONS'), ids.join(','));
  const tm = matrix.getSheetByName('TeacherMatrix');
  const row = tm.getRange(2, 1, tm.getLastRow() - 1, 20).getValues().find((x) => x[0] === 'CAS-8175-L06');
  assert.equal(row[11], 'LIVE');
  assert.equal(row[14], '8175 Sports Entertainment and Event Marketing');
  assert.equal(row[19], '8175-L06');
  assert.match(sandbox.DocumentApp.openById(row[12]).getBody().getText(), /Skill Development Plan/);
});

test('archiveAssignment_ archives the workspaces for one assignment and its TeacherMatrix row', () => {
  const { exported, sandbox, ss, matrix } = setup();
  exported.seedAssignments_({ apply: true, units: ['S1-U1'] });
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(19).fill('h'));
  const doc = (n) => sandbox.DocumentApp.create(n).getId();
  const mk = (acct, sid, fileId) => [new Date(), acct, sid, fileId, 'n', '1', 'c', 't', TEACHER, 's', 'c', '1',
    'ACTIVE', '', '', '', '', '', '2026-27'];
  const a = doc('A'), b = doc('B');
  ledger.appendRow(mk('1234567@ccpsnet.net', 'VDOE-A', a));
  ledger.appendRow(mk('2345678@ccpsnet.net', 'VDOE-B', b));
  exported.recordStudentAssignment_(ss, 'VDOE-A', '1234567@ccpsnet.net', 'CAS-S1-U1-8175');
  exported.recordStudentAssignment_(ss, 'VDOE-B', '2345678@ccpsnet.net', 'CAS-S1-U1-8177');

  const preview = exported.archiveAssignment_({ apply: false, configId: 'CAS-S1-U1-8175' });
  assert.deepEqual([preview.workspaces, preview.matrixRows], [1, 1]);
  const r = exported.archiveAssignment_({ apply: true, configId: 'CAS-S1-U1-8175' });
  assert.deepEqual([r.archived, r.trashed], [1, 1]);
  assert.equal(ledger.getRange(2, 13).getValue(), 'ARCHIVED');
  assert.equal(ledger.getRange(3, 13).getValue(), 'ACTIVE', 'the other course\'s assignment is untouched');
  assert.equal(sandbox.DriveApp.getFileById(a).isTrashed(), true);
  const tm = matrix.getSheetByName('TeacherMatrix').getRange(2, 1, 2, 12).getValues();
  assert.deepEqual(tm.map((x) => [x[0], x[11]]), [['CAS-S1-U1-8175', 'ARCHIVED'], ['CAS-S1-U1-8177', 'LIVE']]);
});
