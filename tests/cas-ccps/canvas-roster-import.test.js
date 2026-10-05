'use strict';
// Tests for cas-ccps/scripts/52_CanvasRosterImport.js.
//
// Pins: only the Student / SIS Login ID / Section columns of a Canvas
// gradebook export are read (grades are ignored); the Points Possible row
// and the Test Student are skipped; a bare 7-digit login becomes
// <id>@ccpsnet.net and anything that isn't a student account is refused;
// sections map to periods through the CanvasSectionMap tab, which is filled
// with every section seen and blocks enrollment until a period is set; a
// student already in the Ledger for this teacher and term is skipped; a
// preview enrolls no one; and each student is enrolled through
// intakeStudent_ (02), the same path as the intake form.
//
// intakeStudent_ itself (template copy, sharing, Ledger row) is covered by
// form1-intake-id-validation.test.js and student-data-access-intake.test.js;
// here it is replaced with a recorder.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, FakeDriveFolder } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '29_StudentContextAggregator.js', '02_Form1_IntakeAndWorkspaceGenerator.js',
  '52_CanvasRosterImport.js'].map(S);
const EXPOSE = ['previewRosterEnrollment', 'applyRosterEnrollment', '_criParseGradebook_'];
const TEACHER = 'owner.teacher@ccpsnet.net';

const GRADEBOOK = [
  'Student,ID,SIS User ID,SIS Login ID,Section,Unit 1 Quiz (101),Current Score',
  '    Points Possible,,,,,10,',
  '"Rivera, Ana",11,S1,1234567,8175 - Block 3,9,90',
  '"Chen, Ben",12,S2,2345678@ccpsnet.net,8175 - Block 3,8,80',
  '"Okafor, Chi",13,S3,3456789,8177 - Block 5,10,100',
  '"Doe, Dana",14,S4,jdoe,8177 - Block 5,7,70',
  '"Student, Test",15,,teststudent,8175 - Block 3,,',
  '"Lane, Eli",16,S6,4567890,8175 - Block 7,6,60',
].join('\n');

function setup(opts) {
  opts = opts || {};
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ledgerSs = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ledgerSs.getId(), ledgerSs);
  props.setProperty('CENTRAL_LEDGER_SS_ID', ledgerSs.getId());
  props.setProperty('CURRENT_TERM', '2026-27');
  props.setProperty('TEACHER_NAME', 'Mr. Owner');

  const folder = new FakeDriveFolder('Teacher', 'teacher-folder-1');
  sandbox.DriveApp._registerFolder(folder);
  props.setProperty('TEACHER_FOLDER_ID', folder.getId());
  (opts.exports || [GRADEBOOK]).forEach((csv, i) => folder.addFile({
    getName: () => '2026-10-04T1830_Grades-Course' + i + '.csv',
    getLastUpdated: () => new Date(2026, 9, 4, 18, 30 + i),
    getBlob: () => ({ getDataAsString: () => csv }),
  }));
  folder.addFile({ getName: () => 'Notes.csv', getLastUpdated: () => new Date(), getBlob: () => ({ getDataAsString: () => 'x' }) });

  // A LIVE assignment, owned by TEACHER through MatrixRegistry.
  const matrix = sandbox.SpreadsheetApp.create('Matrix');
  sandbox.SpreadsheetApp._registry.set(matrix.getId(), matrix);
  const reg = ledgerSs.insertSheet('MatrixRegistry');
  reg.appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  reg.appendRow(['Mr. Owner', TEACHER, matrix.getId(), new Date()]);
  const tm = matrix.insertSheet('TeacherMatrix');
  tm.appendRow(new Array(13).fill('h'));
  const row = new Array(13).fill('');
  row[0] = 'CFG-1'; row[1] = 'S1-U1 Industry Overview'; row[11] = 'LIVE';
  tm.appendRow(row);

  const ledger = ledgerSs.insertSheet('Ledger');
  ledger.appendRow(['Timestamp', 'GoogleID', 'ConfigID', 'FileID', 'StudentName', 'Block', 'ClassName', 'TeacherName',
    'TeacherEmail', 'Subject', 'CourseName', 'Period', 'Status', 'SubmissionTS', 'Notes', 'LastEval', 'AdminFileURL',
    'StudentFileURL', 'AcademicYear']);
  (opts.ledgerRows || []).forEach((r) => ledger.appendRow(r));

  const cs = ledgerSs.insertSheet('ClassSchedule');
  cs.appendRow(['teacher_email', 'period', 'day_type', 'course_name', 'active']);
  cs.appendRow([TEACHER, '3', 'ODD', '8175 Sports Entertainment and Event Marketing', 'TRUE']);
  cs.appendRow([TEACHER, '5', 'EVEN', '8177 Sports Entertainment and Event Management', 'TRUE']);

  if (opts.sectionMap) {
    const m = ledgerSs.insertSheet('CanvasSectionMap');
    m.appendRow(['canvas_section', 'period']);
    opts.sectionMap.forEach((r) => m.appendRow(r));
  }

  const calls = [];
  sandbox.intakeStudent_ = (cfg, s) => { calls.push(s); return { ok: true, studentConfigId: 'S-' + calls.length }; };
  return { exported, sandbox, ledgerSs, calls };
}

const MAPPED = [['8175 - Block 3', '3'], ['8177 - Block 5', '5'], ['8175 - Block 7', '']];

test('_criParseGradebook_ reads names, logins and sections, and skips Points Possible and the Test Student', () => {
  const { exported } = setup();
  const rows = exported._criParseGradebook_(GRADEBOOK);
  assert.deepEqual(rows.map((r) => [r.name, r.account, r.section]), [
    ['Ana Rivera', '1234567@ccpsnet.net', '8175 - Block 3'],
    ['Ben Chen', '2345678@ccpsnet.net', '8175 - Block 3'],
    ['Chi Okafor', '3456789@ccpsnet.net', '8177 - Block 5'],
    ['Dana Doe', 'jdoe', '8177 - Block 5'],
    ['Eli Lane', '4567890@ccpsnet.net', '8175 - Block 7'],
  ]);
  rows.forEach((r) => assert.deepEqual(Object.keys(r).sort(), ['account', 'name', 'section', 'sisLogin'],
    'nothing from the grade columns is carried'));
});

test('the first preview fills CanvasSectionMap with every section and enrolls no one until periods are set', () => {
  const { exported, ledgerSs, calls } = setup();
  const r = exported.previewRosterEnrollment('CFG-1');
  assert.equal(r.planned.length, 0);
  assert.deepEqual(r.unmappedSections.sort(), ['8175 - Block 3', '8175 - Block 7', '8177 - Block 5']);
  const map = ledgerSs.getSheetByName('CanvasSectionMap');
  assert.deepEqual(map.getRange(2, 1, map.getLastRow() - 1, 1).getValues().map((x) => x[0]).sort(),
    ['8175 - Block 3', '8175 - Block 7', '8177 - Block 5']);
  assert.equal(calls.length, 0);
});

test('preview plans the mapped students, refuses a non-student login, and writes nothing', () => {
  const { exported, calls } = setup({ sectionMap: MAPPED });
  const r = exported.previewRosterEnrollment('CFG-1');
  assert.deepEqual(r.planned.map((p) => [p.account, p.period]), [
    ['1234567@ccpsnet.net', '3'], ['2345678@ccpsnet.net', '3'], ['3456789@ccpsnet.net', '5']]);
  assert.ok(r.skipped.some((s) => s.reason === 'INVALID_ACCOUNT' && s.sisLogin === 'jdoe'));
  assert.ok(r.skipped.some((s) => s.reason === 'SECTION_NOT_MAPPED' && s.section === '8175 - Block 7'));
  assert.match(r.message, /^DRY RUN: 3 student\(s\) would be enrolled in S1-U1 Industry Overview \(CFG-1\)/);
  assert.equal(calls.length, 0);
});

test('apply enrolls each student through intakeStudent_ with the period and course from ClassSchedule', () => {
  const { exported, calls } = setup({ sectionMap: MAPPED });
  const r = exported.applyRosterEnrollment('CFG-1');
  assert.equal(r.enrolled, 3);
  assert.deepEqual(calls.map((c) => [c.googleId, c.studentName, c.period, c.courseName, c.unitConfigId, c.teacherEmail]), [
    ['1234567@ccpsnet.net', 'Ana Rivera', '3', '8175 Sports Entertainment and Event Marketing', 'CFG-1', TEACHER],
    ['2345678@ccpsnet.net', 'Ben Chen', '3', '8175 Sports Entertainment and Event Marketing', 'CFG-1', TEACHER],
    ['3456789@ccpsnet.net', 'Chi Okafor', '5', '8177 Sports Entertainment and Event Management', 'CFG-1', TEACHER],
  ]);
});

test('a student already in the Ledger this term is skipped; one who left Canvas is reported, not removed', () => {
  const row = (acct, term) => [new Date(), acct, 'X', 'f', 'n', '3', 'c', 't', TEACHER, 's', 'c', '3', 'ACTIVE',
    '', '', '', '', '', term];
  const { exported, calls, ledgerSs } = setup({ sectionMap: MAPPED,
    ledgerRows: [row('1234567@ccpsnet.net', '2026-27'), row('7654321@ccpsnet.net', '2026-27'), row('2345678@ccpsnet.net', '2025-26')] });
  const r = exported.applyRosterEnrollment('CFG-1');
  assert.ok(r.skipped.some((s) => s.account === '1234567@ccpsnet.net' && s.reason === 'ALREADY_ENROLLED'));
  assert.deepEqual(calls.map((c) => c.googleId), ['2345678@ccpsnet.net', '3456789@ccpsnet.net'],
    'last year\'s row does not count as enrolled');
  assert.deepEqual(r.notInCanvas, ['7654321@ccpsnet.net']);
  assert.equal(ledgerSs.getSheetByName('Ledger').getLastRow(), 4, 'no Ledger row removed');
});

test('a student in two exports is enrolled once', () => {
  const { exported, calls } = setup({ sectionMap: MAPPED, exports: [GRADEBOOK, GRADEBOOK] });
  exported.applyRosterEnrollment('CFG-1');
  assert.equal(calls.length, 3);
});

test('an unknown or not-LIVE Config ID enrolls no one', () => {
  const { exported, calls } = setup({ sectionMap: MAPPED });
  const r = exported.applyRosterEnrollment('NOPE');
  assert.match(r.message, /No LIVE assignment has Config ID NOPE/);
  assert.equal(calls.length, 0);
  assert.match(exported.previewRosterEnrollment('').message, /Pass the Assignment Config ID/);
});

test('a missing master template stops the run at the first student', () => {
  const { exported, sandbox, calls } = setup({ sectionMap: MAPPED });
  sandbox.intakeStudent_ = (cfg, s) => { calls.push(s); return { ok: false, code: 'NO_MASTER_TEMPLATE' }; };
  const r = exported.applyRosterEnrollment('CFG-1');
  assert.equal(calls.length, 1);
  assert.equal(r.failed[0].reason, 'NO_MASTER_TEMPLATE');
  assert.equal(r.enrolled, 0);
});
