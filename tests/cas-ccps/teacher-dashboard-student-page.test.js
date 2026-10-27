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

// ── Competencies done, n of the course's total (2026-10-27) ─────────────
// The teacher's confirmed rating of 1 to 3 counts (1 is the highest); the
// total is every active competency in the course's CompetencyRegistry rows.
function addCompetencyTabs(ss, SCRDL, decisions) {
  const reg = ss.insertSheet('CompetencyRegistry');
  reg.appendRow(['competency_id', 'competency_text', 'subject', 'grade_band', 'strand', 'teacher_email', 'active']);
  ['8175-1', '8175-2', '8175-3', '8175-4', '8175-5'].forEach(id => reg.appendRow([id, 't', 's', '9-12', 'x', '', 'TRUE']));
  reg.appendRow(['8175-6', 't', 's', '9-12', 'x', '', 'FALSE']);
  reg.appendRow(['8177-1', 't', 's', '9-12', 'x', '', 'TRUE']);
  const log = ss.insertSheet('SCRDecisionLog');
  log.appendRow(new Array(SCRDL.ARCHIVE_STATUS + 1).fill('h'));
  decisions.forEach(([email, comp, rating, at, by, archived]) => {
    const r = new Array(SCRDL.ARCHIVE_STATUS + 1).fill('');
    r[SCRDL.STUDENT_EMAIL] = email; r[SCRDL.COMPETENCY_ID] = comp; r[SCRDL.FINAL_RATING] = rating;
    r[SCRDL.DECISION_TYPE] = 'CONFIRMED'; r[SCRDL.DECIDED_AT] = at; r[SCRDL.DECIDED_BY] = by || TEACHER;
    r[SCRDL.ARCHIVE_STATUS] = archived || '';
    log.appendRow(r);
  });
}
const day = (d) => new Date('2026-10-' + d + 'T12:00:00');

test('competencies done: 1 to 3 count, the latest rating wins, inactive and other courses are left out', () => {
  const { exported, sandbox } = loadGasFiles(PROJECT_FILES, ['readLatestScrRatings_', 'competencyCourseTotals_',
    'competencyCompletionFor_', 'SCRDL', 'getConfig_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  addCompetencyTabs(ss, exported.SCRDL, [
    [AMY, '8175-1', 1, day(20)],
    [AMY, '8175-2', 3, day(20)],
    [AMY, '8175-3', 4, day(20)],            // with supervision: not yet
    [AMY, '8175-4', 2, day(20)], [AMY, '8175-4', 5, day(26)], // re-rated lower: not done
    [AMY, '8175-5', 5, day(20)], [AMY, '8175-5', 3, day(26)], // re-rated higher: done
    [AMY, '8177-1', 1, day(20)],            // a course she isn't listed in
    [AMY, '8175-3', 1, day(27), 'other.teacher@example.com'], // not this teacher's
    [AMY, '8175-2', 1, day(1), TEACHER, 'ARCHIVED — pending disposition'],
  ]);
  const cfg = exported.getConfig_();
  const totals = exported.competencyCourseTotals_(ss, cfg);
  assert.deepEqual(JSON.parse(JSON.stringify(totals)), { 8175: 5, 8177: 1 });
  const ratings = exported.readLatestScrRatings_(ss, cfg, TEACHER).get(AMY);
  assert.deepEqual(JSON.parse(JSON.stringify(exported.competencyCompletionFor_(ratings, totals, ['8175']))),
    [{ course: '8175', done: 3, total: 5 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(exported.competencyCompletionFor_(undefined, {}, ['8177']))),
    [{ course: '8177', done: 0, total: 0 }], 'no ratings and no registry: 0 with no total');
});

test('the student page and the Student Context list carry the counter for the student\'s courses', () => {
  const { exported, sandbox } = loadGasFiles(PROJECT_FILES, ['getStudentDetail', 'getStudentContextRoster', 'LEDGER', 'SCRDL']);
  // Same set-up as above, with ratings.
  const L = exported.LEDGER;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const r = new Array(27).fill('');
  r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = AMY; r[L.CONFIG_ID] = 'VDOE-A'; r[L.FILE_ID] = 'f-a';
  r[L.STUDENT_NAME] = 'Amy'; r[L.TEACHER_EMAIL] = TEACHER; r[L.COURSE_NAME] = '8175 Marketing'; r[L.STATUS] = 'ACTIVE';
  ledger.appendRow(r);
  const reg = ss.insertSheet('StudentDocRegistry');
  reg.appendRow(['email', 'name', 'doc_id', 'doc_url', 'created', 'updated', 'had_content']);
  reg.appendRow([AMY, 'Amy', 'no-such-doc', 'https://docs.google.com/document/d/x/edit', new Date(), new Date(), 'TRUE']);
  addCompetencyTabs(ss, exported.SCRDL, [[AMY, '8175-1', 2, day(20)], [AMY, '8175-2', 3, day(20)]]);

  const d = exported.getStudentDetail(AMY);
  assert.deepEqual(JSON.parse(JSON.stringify(d.competencies)), [{ course: '8175', done: 2, total: 5 }]);
  const roster = exported.getStudentContextRoster().roster;
  assert.deepEqual(JSON.parse(JSON.stringify(roster[0].competencies)), [{ course: '8175', done: 2, total: 5 }]);
});

test('the Student Dashboard shows the student every teacher\'s count for each of their courses', () => {
  const SD = ['00_SharedConfig.js', '63_DocHeader.js', '13_StudentDashboard.js']
    .map(f => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f));
  const { exported, sandbox } = loadGasFiles(SD, ['getStudentDashboardData', 'LEDGER', 'SCRDL', 'buildStudentDashboardHtml_'],
    { Session: { getActiveUser: () => ({ getEmail: () => AMY }), getEffectiveUser: () => ({ getEmail: () => AMY }),
      getScriptTimeZone: () => 'America/New_York' } });
  const L = exported.LEDGER;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const r = new Array(27).fill('');
  r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = AMY; r[L.CONFIG_ID] = 'VDOE-A'; r[L.FILE_ID] = 'f-a';
  r[L.STUDENT_NAME] = 'Amy'; r[L.TEACHER_EMAIL] = TEACHER; r[L.CLASS_NAME] = '8175 Sports Marketing';
  r[L.COURSE_NAME] = '8175 Sports Marketing'; r[L.STATUS] = 'ACTIVE';
  ledger.appendRow(r);
  addCompetencyTabs(ss, exported.SCRDL, [[AMY, '8175-1', 2, day(20)], [AMY, '8175-3', 3, day(20), 'co.teacher@example.com'],
    [BO, '8175-2', 1, day(20)]]);
  const data = exported.getStudentDashboardData('ALL');
  assert.deepEqual(JSON.parse(JSON.stringify(data.competencies)),
    [{ className: '8175 Sports Marketing', course: '8175', done: 2, total: 5 }]);
});
