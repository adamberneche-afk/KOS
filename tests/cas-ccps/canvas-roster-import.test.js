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
  '51_CourseYearBuilder.js', '52_CanvasRosterImport.js'].map(S);
const EXPOSE = ['previewRosterEnrollment', 'applyRosterEnrollment', 'prepareRosterSections', '_criParseGradebook_'];
const TEACHER = 'owner.teacher@ccpsnet.net';

function csvFile(id, name, csv, minute) {
  return { id, name, getName: () => name, getLastUpdated: () => new Date(2026, 9, 4, 18, minute),
    getBlob: () => ({ getDataAsString: () => csv }) };
}

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
  row[14] = '8175 Sports Entertainment and Event Marketing';
  tm.appendRow(row);
  // The same unit for the other course.
  const row2 = row.slice();
  row2[0] = 'CFG-2'; row2[14] = '8177 Sports Entertainment and Event Management';
  tm.appendRow(row2);
  // A LIVE row with no CourseName.
  const row3 = row.slice();
  row3[0] = 'CFG-X'; row3[14] = '';
  tm.appendRow(row3);

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
    ['1234567@ccpsnet.net', '3'], ['2345678@ccpsnet.net', '3']]);
  assert.ok(r.skipped.some((s) => s.reason === 'OTHER_COURSE' && s.account === '3456789@ccpsnet.net'),
    'an 8177 student is not enrolled in the 8175 assignment');
  assert.ok(r.skipped.some((s) => s.reason === 'INVALID_ACCOUNT' && s.sisLogin === 'jdoe'));
  assert.ok(r.skipped.some((s) => s.reason === 'SECTION_NOT_MAPPED' && s.section === '8175 - Block 7'));
  assert.match(r.message, /^DRY RUN: 2 student\(s\) would be enrolled in S1-U1 Industry Overview \(CFG-1\)/);
  assert.equal(calls.length, 0);
});

test('apply enrolls each course\'s students in that course\'s assignment, with the period and course from ClassSchedule', () => {
  const { exported, calls } = setup({ sectionMap: MAPPED });
  assert.equal(exported.applyRosterEnrollment('CFG-1').enrolled, 2);
  assert.equal(exported.applyRosterEnrollment('CFG-2').enrolled, 1);
  assert.deepEqual(calls.map((c) => [c.googleId, c.studentName, c.period, c.courseName, c.unitConfigId, c.teacherEmail]), [
    ['1234567@ccpsnet.net', 'Ana Rivera', '3', '8175 Sports Entertainment and Event Marketing', 'CFG-1', TEACHER],
    ['2345678@ccpsnet.net', 'Ben Chen', '3', '8175 Sports Entertainment and Event Marketing', 'CFG-1', TEACHER],
    ['3456789@ccpsnet.net', 'Chi Okafor', '5', '8177 Sports Entertainment and Event Management', 'CFG-2', TEACHER],
  ]);
});

test('an assignment with no CourseName enrolls no one', () => {
  const { exported, calls } = setup({ sectionMap: MAPPED });
  const r = exported.applyRosterEnrollment('CFG-X');
  assert.match(r.message, /Can't tell which course CFG-X is for/);
  assert.equal(calls.length, 0);
});

test('a student already enrolled in this assignment is skipped; one who left Canvas is reported, not removed', () => {
  const row = (acct, term, cfgId) => [new Date(), acct, cfgId || 'CFG-1', 'f', 'n', '3', 'c', 't', TEACHER, 's', 'c', '3',
    'ACTIVE', '', '', '', '', '', term];
  const { exported, calls, ledgerSs } = setup({ sectionMap: MAPPED,
    ledgerRows: [row('1234567@ccpsnet.net', '2026-27'), row('7654321@ccpsnet.net', '2026-27'),
      row('2345678@ccpsnet.net', '2025-26')] });
  const r = exported.applyRosterEnrollment('CFG-1');
  assert.ok(r.skipped.some((s) => s.account === '1234567@ccpsnet.net' && s.reason === 'ALREADY_ENROLLED'));
  assert.deepEqual(calls.map((c) => c.googleId), ['2345678@ccpsnet.net'],
    'last year\'s row does not count as enrolled');
  assert.deepEqual(r.notInCanvas, ['7654321@ccpsnet.net']);
  assert.equal(ledgerSs.getSheetByName('Ledger').getLastRow(), 4, 'no Ledger row removed');
});

test('a row for an earlier unit doesn\'t block enrolling the same student in the next unit', () => {
  const row = [new Date(), '1234567@ccpsnet.net', 'CFG-0', 'f', 'n', '3', 'c', 't', TEACHER, 's', 'c', '3', 'ACTIVE',
    '', '', '', '', '', '2026-27'];
  const { exported, calls } = setup({ sectionMap: MAPPED, ledgerRows: [row] });
  const r = exported.applyRosterEnrollment('CFG-1');
  assert.deepEqual(calls.map((c) => c.googleId), ['1234567@ccpsnet.net', '2345678@ccpsnet.net']);
  assert.deepEqual(r.notInCanvas, []);
});

test('a student in two exports is enrolled once', () => {
  const { exported, calls } = setup({ sectionMap: MAPPED, exports: [GRADEBOOK, GRADEBOOK] });
  exported.applyRosterEnrollment('CFG-1');
  assert.equal(calls.length, 2);
});

test('an unknown or not-LIVE Config ID enrolls no one', () => {
  const { exported, calls } = setup({ sectionMap: MAPPED });
  const r = exported.applyRosterEnrollment('NOPE');
  assert.match(r.message, /No LIVE assignment has Config ID NOPE/);
  assert.equal(calls.length, 0);
  assert.match(exported.previewRosterEnrollment('').message, /Set the ROSTER_CONFIG_ID Script Property/);
});

test('run from the editor with no argument, the Config ID comes from ROSTER_CONFIG_ID', () => {
  const { exported, sandbox, calls } = setup({ sectionMap: MAPPED });
  const props = sandbox.PropertiesService.getScriptProperties();
  assert.match(exported.previewRosterEnrollment().message, /Set the ROSTER_CONFIG_ID Script Property/);

  props.setProperty('ROSTER_CONFIG_ID', ' CFG-1 ');
  assert.match(exported.previewRosterEnrollment().message, /^DRY RUN: 2 student\(s\) would be enrolled in .*\(CFG-1\)/);
  assert.match(exported.previewRosterEnrollment({ triggerUid: 'x' }).message, /\(CFG-1\)/, 'an event object is not an ID');
  assert.match(exported.applyRosterEnrollment('NOPE').message, /Config ID NOPE/, 'a passed ID wins');
  assert.equal(exported.applyRosterEnrollment().enrolled, 2);
  assert.equal(calls.length, 2);
});

test('a missing master template stops the run at the first student', () => {
  const { exported, sandbox, calls } = setup({ sectionMap: MAPPED });
  sandbox.intakeStudent_ = (cfg, s) => { calls.push(s); return { ok: false, code: 'NO_MASTER_TEMPLATE' }; };
  const r = exported.applyRosterEnrollment('CFG-1');
  assert.equal(calls.length, 1);
  assert.equal(r.failed[0].reason, 'NO_MASTER_TEMPLATE');
  assert.equal(r.enrolled, 0);
});

// The setup wizard writes TEACHER_FOLDER_ID and TEACHER_NAME into the Unified
// Manual project, so Central Ledger, where this runs, usually has neither.
test('without TEACHER_FOLDER_ID, the exports are found in Drive and the teacher name comes from the registry', () => {
  const { exported, sandbox, calls } = setup({ sectionMap: MAPPED, exports: [] });
  const props = sandbox.PropertiesService.getScriptProperties();
  props.deleteProperty('TEACHER_FOLDER_ID');
  props.deleteProperty('TEACHER_NAME');
  sandbox.DriveApp._registerFile(csvFile('g1', '2026-10-04T1830_Grades-8175.csv', GRADEBOOK, 30));
  sandbox.DriveApp._registerFile(csvFile('g2', 'Grades notes.txt', 'x', 31));

  const r = exported.applyRosterEnrollment('CFG-1');

  assert.equal(r.files, 1);
  assert.equal(r.enrolled, 2);
  assert.ok(calls.every((c) => c.teacherName === 'Mr. Owner'), 'from the MatrixRegistry row');
  assert.match(exported.previewRosterEnrollment('CFG-1').message, /DRY RUN/);
});

test('with no export anywhere, the message says where it looked', () => {
  const { exported, sandbox } = setup({ sectionMap: MAPPED, exports: [] });
  sandbox.PropertiesService.getScriptProperties().deleteProperty('TEACHER_FOLDER_ID');
  assert.match(exported.previewRosterEnrollment('CFG-1').message, /found in your Drive\.$/);
});

test('prepareRosterSections fills CanvasSectionMap and counts each section, with no Config ID and no enrollment', () => {
  const { exported, ledgerSs, calls } = setup();
  const first = exported.prepareRosterSections();
  assert.equal(first.files, 1);
  assert.deepEqual(first.unmapped, ['8175 - Block 3', '8175 - Block 7', '8177 - Block 5']);
  const map = ledgerSs.getSheetByName('CanvasSectionMap');
  assert.equal(map.getLastRow(), 4, 'one row per section');
  assert.match(first.message, /Nothing enrolled\.$/);

  // The teacher maps two sections; the next run shows each period's course.
  map.getRange(2, 1, 3, 2).getValues().forEach((r, i) => {
    const period = { '8175 - Block 3': '3', '8177 - Block 5': '5' }[r[0]] || '';
    map.getRange(i + 2, 2).setValue(period);
  });
  const second = exported.prepareRosterSections();
  const by = Object.fromEntries(second.sections.map((s) => [s.section, s]));
  assert.deepEqual([by['8175 - Block 3'].students, by['8175 - Block 3'].period, by['8175 - Block 3'].course], [2, '3', '8175']);
  assert.deepEqual([by['8177 - Block 5'].period, by['8177 - Block 5'].course], ['5', '8177']);
  assert.ok(by['8177 - Block 5'].notStudentAccounts >= 1, 'jdoe is not a student account');
  assert.deepEqual(second.unmapped, ['8175 - Block 7']);
  assert.equal(map.getLastRow(), 4, 'a second run adds no duplicate rows');
  assert.equal(calls.length, 0, 'never enrolls');
});

test('with no Config ID, preview points to prepareRosterSections', () => {
  const { exported } = setup();
  assert.match(exported.previewRosterEnrollment().message, /run prepareRosterSections\(\)/);
});
