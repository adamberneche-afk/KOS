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
const FILES = [S('00_SharedConfig.js'), S('29_StudentContextAggregator.js'), S('02_Form1_IntakeAndWorkspaceGenerator.js')];

function load() {
  return loadGasFiles(FILES, ['shareToStudentDrive_', 'fetchAssignment_', 'getConfig_']);
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
