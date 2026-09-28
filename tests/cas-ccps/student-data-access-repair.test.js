'use strict';
// cas-ccps/scripts/50_StudentDataAccess.js — brings existing sharing in line
// with the student-data access policy, and revokes earlier school years.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [S('00_SharedConfig.js'), S('29_StudentContextAggregator.js'), S('50_StudentDataAccess.js')];

const ALICE = '1111111@ccpsnet.net';
const BOB = '2222222@ccpsnet.net';
const TEACHER = 'teacher@ccpsnet.net';
const OTHER = 'other.teacher@ccpsnet.net';

function setup() {
  const { exported, sandbox } = loadGasFiles(FILES, ['runStudentDataAccessRepair_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('CURRENT_TERM', '2026-27 S1');
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('h'));

  // The old intake: every doc in a class folder every student could view.
  const shared = sandbox.DriveApp.getRootFolder().createFolder('_Student Shared Folders');
  sandbox.DriveApp._registerFolder(shared);
  const classFolder = shared.createFolder('A - Marketing - Ms. T');
  classFolder.addViewer(ALICE);
  classFolder.addViewer(BOB);

  function doc(name, perms) {
    const d = sandbox.DocumentApp.create(name);
    const f = sandbox.DriveApp.getFileById(d.getId());
    (perms.editors || []).forEach((e) => f.addEditor(e));
    (perms.viewers || []).forEach((e) => f.addViewer(e));
    return f;
  }
  function row(file, student, status, term, teacher) {
    const r = new Array(23).fill('');
    r[0] = new Date(2026, 8, 1); r[1] = student; r[2] = 'CFG-' + file.getId(); r[3] = file.getId();
    r[4] = 'Student'; r[8] = teacher || TEACHER; r[12] = status; r[18] = term;
    ledger.appendRow(r);
  }
  return { exported, sandbox, props, classFolder, doc, row };
}

test('a dry run reports every change and makes none', () => {
  const fx = setup();
  const working = fx.doc('working', { editors: [ALICE, OTHER] });
  fx.row(working, ALICE, 'ACTIVE', '2026-27 S1');

  const r = fx.exported.runStudentDataAccessRepair_({ apply: false });

  assert.equal(r.apply, false);
  assert.ok(r.changes.some((c) => c.email === OTHER), 'another teacher\'s edit access is reported');
  assert.ok(r.changes.some((c) => c.target.startsWith('class folder')), 'the class folder is reported');
  assert.equal(working._access(OTHER), 'editor', 'nothing changed');
  assert.equal(fx.classFolder._access(BOB), 'viewer', 'nothing changed');
});

test('applying brings this year\'s docs in line and revokes last year\'s', () => {
  const fx = setup();
  const working = fx.doc('working', { editors: [ALICE, OTHER], viewers: [BOB] });
  fx.row(working, ALICE, 'ACTIVE', '2026-27 S1');
  const submitted = fx.doc('submitted', { editors: [BOB] });
  fx.row(submitted, BOB, 'PENDING_TEACHER_REVIEW', '2026-27 S1');
  const lastYear = fx.doc('last year', { editors: [ALICE], viewers: [TEACHER] });
  fx.row(lastYear, ALICE, 'COMPLIANT', '2025-26 S2');
  const exportFile = fx.doc('SCR Export — 2026-09-01', {});
  exportFile.setSharing('DOMAIN', 'VIEW');

  const r = fx.exported.runStudentDataAccessRepair_({ apply: true });

  assert.equal(r.done, true);
  assert.deepEqual(r.failures, []);
  // Before submission: the student edits, the assigning teacher comments, nobody else.
  assert.equal(working._access(ALICE), 'editor');
  assert.equal(working._access(TEACHER), 'commenter');
  assert.equal(working._access(OTHER), null);
  assert.equal(working._access(BOB), null, 'a classmate loses access');
  // After submission: the student reads, can't edit.
  assert.equal(submitted._access(BOB), 'viewer');
  assert.equal(submitted._access(TEACHER), 'commenter');
  // An earlier school year: nobody but the owner.
  assert.equal(lastYear._access(ALICE), null);
  assert.equal(lastYear._access(TEACHER), null);
  // The class folder no longer shares everything in it with the class.
  assert.equal(fx.classFolder._access(ALICE), null);
  assert.equal(fx.classFolder._access(BOB), null);
  assert.equal(exportFile.getSharingAccess(), 'PRIVATE');
});

test('a second apply finds nothing left to change', () => {
  const fx = setup();
  const working = fx.doc('working', { editors: [ALICE, OTHER] });
  fx.row(working, ALICE, 'ACTIVE', '2026-27 S1');
  fx.exported.runStudentDataAccessRepair_({ apply: true });

  const again = fx.exported.runStudentDataAccessRepair_({ apply: false });
  assert.deepEqual(again.changes, []);
});

test('a run past its time budget stops, and the next run resumes where it stopped', () => {
  const fx = setup();
  const a = fx.doc('a', { editors: [ALICE, OTHER] });
  fx.row(a, ALICE, 'ACTIVE', '2026-27 S1');
  const b = fx.doc('b', { editors: [BOB, OTHER] });
  fx.row(b, BOB, 'ACTIVE', '2026-27 S1');

  const first = fx.exported.runStudentDataAccessRepair_({ apply: true, budgetMs: -1 });
  assert.equal(first.done, false);
  assert.equal(first.files, 1);
  assert.ok(fx.props.getProperty('STUDENT_DATA_ACCESS_REPAIR_CURSOR'));

  const second = fx.exported.runStudentDataAccessRepair_({ apply: true });
  assert.equal(second.done, true);
  assert.equal(b._access(OTHER), null);
  assert.equal(fx.props.getProperty('STUDENT_DATA_ACCESS_REPAIR_CURSOR'), null);
});

test('warm-up docs: open ones stay editable, closed ones are read-only, last year\'s are revoked', () => {
  const fx = setup();
  const ss = fx.sandbox.SpreadsheetApp.openById(fx.props.getProperty('CENTRAL_LEDGER_SS_ID'));
  const wr = ss.insertSheet('WarmUpRegistry');
  wr.appendRow(['warmup_id', 'queue_id', 'lesson_id', 'lesson_date', 'student_email', 'student_name',
    'teacher_email', 'doc_id', 'doc_url', 'generated_at', 'total_score', 'extra_credit', 'term',
    'extra_credit_checked']);
  const open = fx.doc('warm-up open', { editors: [ALICE] });
  const closed = fx.doc('warm-up closed', { editors: [ALICE] });
  const old = fx.doc('warm-up old', { editors: [ALICE] });
  const add = (f, term, checked) => wr.appendRow(['W', 'Q-' + f.getId(), 'L', '', ALICE, 'Alice', TEACHER,
    f.getId(), '', new Date(2026, 8, 2), 5, 0, term, checked]);
  add(open, '2026-27 S1', '');
  add(closed, '2026-27 S1', new Date());
  add(old, '2025-26 S2', new Date());

  fx.exported.runStudentDataAccessRepair_({ apply: true });

  assert.equal(open._access(ALICE), 'editor');
  assert.equal(closed._access(ALICE), 'viewer');
  assert.equal(old._access(ALICE), null);
});
