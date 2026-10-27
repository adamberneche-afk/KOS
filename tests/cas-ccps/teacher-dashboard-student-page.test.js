'use strict';
// One student's page on the Teacher Dashboard (2026-10-27,
// meta/SPRINT_DASHBOARD_2026-11.md, PR 2): getStudentDetail (07) returns
// that student's parent report for this week and their Student Context doc
// (29) split into weeks, newest first, only for this teacher's students.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const TEACHER = 'teacher@example.com'; // the sandbox's default signed-in user
const PROJECT_FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:teacher-dashboard'].files
  .map(f => path.join(__dirname, '..', '..', f));

const AMY = '1234567@ccpsnet.net';
const BO = '7654321@ccpsnet.net';

function setUp() {
  const { exported, sandbox } = loadGasFiles(PROJECT_FILES, ['getStudentDetail', 'LEDGER']);
  const L = exported.LEDGER;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const row = (email, name, teacher) => {
    const r = new Array(27).fill('');
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = email; r[L.CONFIG_ID] = 'VDOE-' + name;
    r[L.FILE_ID] = 'f-' + name; r[L.STUDENT_NAME] = name; r[L.TEACHER_EMAIL] = teacher;
    r[L.COURSE_NAME] = '8175 Marketing'; r[L.PERIOD] = '1'; r[L.STATUS] = 'ACTIVE';
    return r;
  };
  ledger.appendRow(row(AMY, 'Amy', TEACHER));
  ledger.appendRow(row(BO, 'Bo', 'someone.else@example.com'));

  const doc = sandbox.DocumentApp.create('Amy — Student Context');
  const body = doc.getBody();
  body.appendParagraph('Student Context: Amy').setHeading('HEADING1');
  body.appendParagraph('Week of October 19, 2026').setHeading('HEADING2');
  body.appendParagraph('Completed Assignments').setHeading('HEADING3');
  body.appendParagraph('• 8175 L05  —  COMPLIANT');
  body.appendParagraph('');
  body.appendParagraph('Week of October 26, 2026').setHeading('HEADING2');
  body.appendParagraph('Warm-Up Reflections').setHeading('HEADING3');
  body.appendParagraph('Asked: How does a team make money?');
  body.appendParagraph('Tickets and sponsors.');
  const reg = ss.insertSheet('StudentDocRegistry');
  reg.appendRow(['email', 'name', 'doc_id', 'doc_url', 'created', 'updated', 'had_content']);
  reg.appendRow([AMY, 'Amy', doc.getId(), 'https://docs.google.com/document/d/' + doc.getId() + '/edit',
    new Date(), new Date(), 'TRUE']);
  reg.appendRow([BO, 'Bo', 'other-doc', 'https://docs.google.com/document/d/other-doc/edit', new Date(), new Date(), 'TRUE']);
  return { exported };
}

test('getStudentDetail: this week\'s report and the context doc by week, newest first', () => {
  const { exported } = setUp();
  const d = exported.getStudentDetail(AMY.toUpperCase());
  assert.equal(d.success, true, JSON.stringify(d));
  assert.equal(d.reportError, undefined);
  assert.equal(d.contextError, undefined);
  assert.equal(d.report.studentEmail, AMY);
  assert.ok(d.report.preview.length > 0, 'the text the teacher copies');
  assert.ok(d.weekStart);
  assert.match(d.context.docUrl, /^https:\/\/docs\.google\.com\/document\/d\//);
  assert.deepEqual(d.context.weeks.map(w => w.label), ['Week of October 26, 2026', 'Week of October 19, 2026']);
  assert.deepEqual(d.context.weeks[0].items, [
    { text: 'Warm-Up Reflections', heading: true },
    { text: 'Asked: How does a team make money?', heading: false },
    { text: 'Tickets and sponsors.', heading: false },
  ]);
  assert.equal(d.context.weeks[1].items.length, 2, 'blank lines and the title are left out');
});

test('getStudentDetail: another teacher\'s student gets neither report nor doc', () => {
  const { exported } = setUp();
  const d = exported.getStudentDetail(BO);
  assert.equal(d.success, true);
  assert.equal(d.report, null);
  assert.equal(d.context, null);
  assert.equal(exported.getStudentDetail('').success, false);
});
