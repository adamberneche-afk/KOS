'use strict';
// Regression tests for 29_StudentContextAggregator.js's student-ID
// validation and its per-teacher redaction boundary (Finding 2 / "this
// month" test coverage). The redaction boundary matters most: the file's
// own "FIXED (FERPA leak)" comment above getAllStudentDocsForTeacher_
// records that this function used to return every student in the district
// to any authorized teacher — these tests pin that fix down permanently.
//
// Loaded together with 00_SharedConfig.js because _studentEmailDomain_()
// calls getConfig_() — both files are bound to the same GAS project
// (cas-ccps:central-ledger, see tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const AGGREGATOR_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '29_StudentContextAggregator.js');

function load() {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, AGGREGATOR_PATH],
    ['buildValidatedStudentRoster_', 'getAllStudentDocsForTeacher_', 'getStudentDocForViewer_', '_studentIdPattern_'],
  );
}

// Ledger row layout this file actually reads (see its own [1]/[4]/[8]
// index comments): [1]=GoogleID, [4]=StudentName, [8]=TeacherEmail.
// Only those three columns are populated here; everything else this test
// doesn't touch is left blank, matching the file's own tolerance for
// sparse rows (String(row[n] || "")).
function ledgerRow({ googleId, name, teacherEmail }) {
  const row = new Array(9).fill('');
  row[1] = googleId;
  row[4] = name;
  row[8] = teacherEmail;
  return row;
}

function setUpFixture(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(9).fill('header'));
  ledger.appendRow(ledgerRow({ googleId: '1234567@ccpsnet.net', name: 'Alice', teacherEmail: 'teacherA@ccpsnet.net' }));
  ledger.appendRow(ledgerRow({ googleId: '2345678@ccpsnet.net', name: 'Bob', teacherEmail: 'teacherB@ccpsnet.net' }));
  // Malformed GoogleID (5 digits, not the required 7) — must never reach
  // the roster or any teacher's doc list, no matter whose class it's in.
  ledger.appendRow(ledgerRow({ googleId: '12345@ccpsnet.net', name: 'Malformed', teacherEmail: 'teacherA@ccpsnet.net' }));

  const registry = ss.insertSheet('StudentDocRegistry');
  registry.appendRow(['student_email', 'student_name', 'doc_id', 'doc_url', 'created_at', 'last_updated_at', 'last_run_had_content']);
  registry.appendRow(['1234567@ccpsnet.net', 'Alice', 'doc-alice', 'https://docs.google.com/document/d/doc-alice/edit', new Date(), '', '']);
  registry.appendRow(['2345678@ccpsnet.net', 'Bob', 'doc-bob', 'https://docs.google.com/document/d/doc-bob/edit', new Date(), '', '']);

  return { ss, ledger, registry };
}

// ── ID validation ────────────────────────────────────────────────────────

test('_studentIdPattern_: accepts exactly 7 digits @ the configured district domain', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);
  const pattern = exported._studentIdPattern_();
  assert.equal(pattern.test('1234567@ccpsnet.net'), true);
  assert.equal(pattern.test('123456@ccpsnet.net'), false);   // 6 digits
  assert.equal(pattern.test('12345678@ccpsnet.net'), false); // 8 digits
  assert.equal(pattern.test('1234567@gmail.com'), false);    // wrong domain
  assert.equal(pattern.test('notanumber@ccpsnet.net'), false);
});

test('buildValidatedStudentRoster_: excludes malformed GoogleIDs, keeps valid ones', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox);

  const roster = exported.buildValidatedStudentRoster_(ledger);
  assert.equal(roster.size, 2);
  assert.equal(roster.get('1234567@ccpsnet.net'), 'Alice');
  assert.equal(roster.get('2345678@ccpsnet.net'), 'Bob');
  assert.equal(roster.has('12345@ccpsnet.net'), false);
});

// ── The redaction boundary — FERPA fix regression ───────────────────────────

test('getAllStudentDocsForTeacher_: a teacher sees only their own students, never another teacher\'s', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  const teacherAResults = exported.getAllStudentDocsForTeacher_('teacherA@ccpsnet.net');
  assert.equal(teacherAResults.length, 1);
  assert.equal(teacherAResults[0].email, '1234567@ccpsnet.net');

  const teacherBResults = exported.getAllStudentDocsForTeacher_('teacherB@ccpsnet.net');
  assert.equal(teacherBResults.length, 1);
  assert.equal(teacherBResults[0].email, '2345678@ccpsnet.net');
});

test('getAllStudentDocsForTeacher_: an unrecognized teacher email sees nobody, not everybody', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  assert.deepEqual(exported.getAllStudentDocsForTeacher_('stranger@ccpsnet.net'), []);
});

test('getAllStudentDocsForTeacher_: no teacher identity at all -> empty, never the full roster', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  assert.deepEqual(exported.getAllStudentDocsForTeacher_(''), []);
  assert.deepEqual(exported.getAllStudentDocsForTeacher_(undefined), []);
});

test('getStudentDocForViewer_: a student sees only their own doc info', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  const own = exported.getStudentDocForViewer_('2345678@ccpsnet.net');
  assert.equal(own.docId, 'doc-bob');
});

test('getStudentDocForViewer_: a viewer with no registry row gets null, never someone else\'s doc', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  assert.equal(exported.getStudentDocForViewer_('9999999@ccpsnet.net'), null);
});
