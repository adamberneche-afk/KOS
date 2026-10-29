'use strict';
// Access policy, intake half (cas-ccps/scripts/02_Form1_IntakeAndWorkspaceGenerator.js):
// a student's doc is visible only to that student and the teacher who
// assigned it. The doc used to be moved into a "Block - Class - Teacher"
// folder that every student in the class could view, so every classmate
// inherited access to it. The assigning teacher also came from the form's
// student-typed "Teacher Email"; it now comes from MatrixRegistry.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [S('00_SharedConfig.js'), S('29_StudentContextAggregator.js'), S('63_DocHeader.js'), S('02_Form1_IntakeAndWorkspaceGenerator.js'), S('54_StudentAssignments.js')];

function load() {
  return loadGasFiles(FILES, ['shareToStudentDrive_', 'fetchAssignment_', 'getConfig_', 'intakeStudent_']);
}

test('shareToStudentDrive_: the student can edit, the assigning teacher can comment, nobody else has access', () => {
  const { exported, sandbox } = load();
  const doc = sandbox.DocumentApp.create('Unit 1 — Alice');
  const file = sandbox.DriveApp.getFileById(doc.getId());
  const parentBefore = file._parent;

  exported.shareToStudentDrive_({}, file, '1234567@ccpsnet.net', 'teacher@ccpsnet.net');

  assert.equal(file._access('1234567@ccpsnet.net'), 'editor');
  assert.equal(file._access('teacher@ccpsnet.net'), 'commenter');
  assert.equal(file.getEditors().length + file.getViewers().length, 2, 'no one else');
  assert.equal(file._parent, parentBefore, 'the doc is not moved into a class-wide shared folder');
});

test('fetchAssignment_: the assigning teacher is the matrix owner from MatrixRegistry', () => {
  const { exported, sandbox } = load();
  const ledger = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ledger.getId(), ledger);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  const matrix = sandbox.SpreadsheetApp.create('Matrix');
  sandbox.SpreadsheetApp._registry.set(matrix.getId(), matrix);
  const reg = ledger.insertSheet('MatrixRegistry');
  reg.appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  reg.appendRow(['Ms. Owner', 'Owner.Teacher@ccpsnet.net', matrix.getId(), new Date()]);
  const tm = matrix.insertSheet('TeacherMatrix');
  tm.appendRow(new Array(13).fill('h'));
  const row = new Array(13).fill('');
  row[0] = 'CFG-1'; row[1] = 'Unit 1'; row[11] = 'LIVE';
  tm.appendRow(row);

  const cfg = exported.getConfig_();
  const a = exported.fetchAssignment_(cfg, 'CFG-1');
  assert.equal(a.teacherEmail, 'owner.teacher@ccpsnet.net');
  assert.equal(a.teacherName, 'Ms. Owner');
});

// 2026-10-29: a rollout run made about 20 docs before its time budget,
// because intake looked up the assignment, the prompt doc, the folders and
// the Ledger again for every student. They're kept for the run now.
test('intakeStudent_: a run of one lesson looks up the matrix, the prompt doc and shared folders once', () => {
  const { exported, sandbox } = load();
  const { FakeDriveFolder } = require('../harness/gas-sandbox');
  const props = sandbox.PropertiesService.getScriptProperties();
  const ledger = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ledger.getId(), ledger);
  props.setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  const matrix = sandbox.SpreadsheetApp.create('Matrix');
  sandbox.SpreadsheetApp._registry.set(matrix.getId(), matrix);
  const reg = ledger.insertSheet('MatrixRegistry');
  reg.appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  reg.appendRow(['Ms. Owner', 'owner@ccpsnet.net', matrix.getId(), new Date()]);
  const prompt = sandbox.DocumentApp.create('Prompt');
  prompt.getBody().appendParagraph('Assignment: Write a plan.');
  const tm = matrix.insertSheet('TeacherMatrix');
  tm.appendRow(new Array(15).fill('h'));
  const row = new Array(15).fill('');
  row[0] = 'CFG-1'; row[1] = 'Unit 1'; row[11] = 'LIVE'; row[12] = prompt.getId();
  tm.appendRow(row);
  ledger.insertSheet('Ledger').appendRow(new Array(19).fill('h'));
  const root = new FakeDriveFolder('Admin', 'admin-root');
  sandbox.DriveApp._registerFolder(root);
  props.setProperty('ADMIN_ROOT_FOLDER_ID', root.getId());
  const template = sandbox.DocumentApp.create('Master');
  props.setProperty('MASTER_STUDENT_TEMPLATE_ID', template.getId());

  // makeCopy: a new doc, as Drive would make.
  const realFile = sandbox.DriveApp.getFileById.bind(sandbox.DriveApp);
  sandbox.DriveApp.getFileById = (id) => {
    const f = realFile(id);
    if (id === template.getId()) f.makeCopy = (name) => realFile(sandbox.DocumentApp.create(name).getId());
    return f;
  };
  const opened = {};
  const realOpen = sandbox.SpreadsheetApp.openById.bind(sandbox.SpreadsheetApp);
  sandbox.SpreadsheetApp.openById = (id) => { opened[id] = (opened[id] || 0) + 1; return realOpen(id); };
  const realDoc = sandbox.DocumentApp.openById.bind(sandbox.DocumentApp);
  let promptOpens = 0;
  sandbox.DocumentApp.openById = (id) => { if (id === prompt.getId()) promptOpens++; return realDoc(id); };
  const realFind = FakeDriveFolder.prototype.getFoldersByName;
  const looked = [];
  FakeDriveFolder.prototype.getFoldersByName = function (name) { looked.push(name); return realFind.call(this, name); };
  try {
    const cfg = exported.getConfig_();
    ['1111111', '2222222', '3333333'].forEach((id, i) => {
      const res = exported.intakeStudent_(cfg, { googleId: id + '@ccpsnet.net', studentName: 'S' + i, block: '3',
        className: '8175 Marketing', subject: '8175', courseName: '8175 Marketing', period: '3',
        teacherName: 'Ms. Owner', teacherEmail: 'owner@ccpsnet.net', unitConfigId: 'CFG-1' });
      assert.equal(res.ok, true, JSON.stringify(res));
    });
  } finally {
    FakeDriveFolder.prototype.getFoldersByName = realFind;
  }
  assert.equal(opened[matrix.getId()], 1, 'the matrix is read once');
  assert.ok(opened[ledger.getId()] <= 3, 'the Ledger opens don\'t grow with the students: ' + opened[ledger.getId()]);
  assert.equal(promptOpens, 1, 'the prompt doc is read once');
  assert.deepEqual(looked.filter((n) => n === '8175').length, 1, 'a shared folder level is looked up once');
  assert.equal(looked.filter((n) => /^S\d$/.test(n)).length, 3, 'each student\'s own folder is still found or made');
  assert.equal(ledger.getSheetByName('Ledger').getLastRow(), 4, 'three Ledger rows');
});

