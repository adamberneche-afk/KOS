'use strict';
// 53's refresh (2026-10-19): an assignment already in the TeacherMatrix is
// brought up to the repo's criteria (milestones, Definition of Done,
// milestone competency IDs) and nothing else in the row changes. Also pins
// the generator fixes it carries: L07 no longer grades peer replies, its
// thin competencies use the state definition, and a milestone holding
// several competencies lists them all, each getting evidence (15c).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '22_LessonContextHandler.js', '23_StudentProfileManager.js',
  '31_PacingGuideManager.js', '32_CompetencyRubricImporter.js', '02_Form1_IntakeAndWorkspaceGenerator.js',
  '29_StudentContextAggregator.js', '53b_UnitAssignmentData.js', '53_AssignmentSeeder.js',
  '54_StudentAssignments.js', '55b_LessonAssignmentData.js', '55_LessonSchedule.js'].map(S);
const TEACHER = 'owner.teacher@ccpsnet.net';

function setup() {
  const { exported, sandbox } = loadGasFiles(FILES,
    ['previewAssignmentRefresh', 'refreshAssignments', 'LESSON_ASSIGNMENTS', 'AS_TAB_HEADERS']);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ledger = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ledger.getId(), ledger);
  props.setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const matrix = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.SpreadsheetApp._registry.set(matrix.getId(), matrix);
  const reg = ledger.insertSheet('MatrixRegistry');
  reg.appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  reg.appendRow(['Mr. Owner', TEACHER, matrix.getId(), new Date()]);
  const tab = matrix.insertSheet('TeacherMatrix');
  tab.appendRow(exported.AS_TAB_HEADERS);
  // An L07 row as seeded before the fix, and a row the repo doesn't know.
  const old = ['CAS-8175-L07', 'L07 ETHICAL DILEMMAS DISCUSSION', 'Tier 1 Core', 'persona',
    'm1', 'm2', 'm3', 'm4', 'old definition with Peer Replies', TEACHER, new Date(), 'LIVE',
    'tmpl', 'Marketing (CTE)', '8175 Sports Entertainment and Event Marketing',
    '8175-4', '8175-6', '8175-20', '8175-51', '8175-L07'];
  tab.appendRow(old);
  tab.appendRow(['VDOE-HANDMADE-2026', 'Teacher-made', 'Tier 1 Core', 'p', 'a', 'b', 'c', 'd', 'dod', TEACHER,
    new Date(), 'LIVE', 'x', 'Marketing (CTE)', 'c', '', '', '', '', '']);
  return { exported, tab, old };
}

test('L07\'s repo criteria: no peer replies, real criteria, every competency in milestone 4', () => {
  const { exported } = setup();
  const a = exported.LESSON_ASSIGNMENTS['8175-L07'];
  assert.doesNotMatch(a.definitionOfDone, /Peer Replies \(10 points\)/);
  assert.match(a.definitionOfDone, /graded by the teacher outside this document/);
  assert.doesNotMatch(a.definitionOfDone, /Evidence of Demonstrate conflict-resolution skills/);
  assert.match(a.definitionOfDone, /negotiating diplomatic solutions/);
  assert.deepEqual(a.milestoneCompetencyIds, ['8175-4', '8175-6', '8175-20', '8175-51, 8175-49']);
});

// 2026-10-20: the criteria are judged against the task. The task text is in
// the Definition of Done, and a competency's indicators are examples.
test('L06 carries its task, and its indicators read as examples, not a checklist', () => {
  const { exported } = setup();
  const d = exported.LESSON_ASSIGNMENTS['8175-L06'].definitionOfDone;
  assert.match(d, /THE TASK \(what the student was asked to do\)\n[\s\S]*Write a 100-word plan/);
  assert.match(d, /- 8175-112 Describe the job interview process\.\n    Evidence can include \(examples, not all required\):/);
  assert.match(d, /a part of a competency the task does not ask for is never required/);
  assert.doesNotMatch(d, /shows evidence for each competency listed/);
});

test('preview names the stale row and changes nothing; refresh rewrites only its criteria', () => {
  const { exported, tab, old } = setup();
  const p = exported.previewAssignmentRefresh();
  assert.deepEqual(p.changed.map((c) => [c.configId, c.fields]),
    [['CAS-8175-L07', 'milestones, definition of done, competency IDs']]);
  assert.equal(p.notInRepo, 1);
  assert.equal(tab.getRange(2, 9).getValue(), old[8], 'a preview writes nothing');

  exported.refreshAssignments();
  const a = exported.LESSON_ASSIGNMENTS['8175-L07'];
  const row = tab.getRange(2, 1, 1, 20).getValues()[0];
  assert.deepEqual(row.slice(4, 8), a.milestones);
  assert.equal(row[8], a.definitionOfDone);
  assert.deepEqual(row.slice(15, 19), a.milestoneCompetencyIds);
  assert.deepEqual([row[0], row[1], row[11], row[12], row[19]], [old[0], old[1], old[11], old[12], old[19]]);
  assert.equal(tab.getRange(3, 9).getValue(), 'dod', 'a row the repo does not know is left alone');
  assert.equal(exported.previewAssignmentRefresh().changed.length, 0, 'a second run changes nothing');
});

test('a milestone listing two competencies writes evidence for each', () => {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('15c_Flow2DirectEvaluationService.js')],
    ['writeCompetencyEvidenceFromFlow2_']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  env.sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const ev = ss.insertSheet('CompetencyEvidence');
  const r = env.exported.writeCompetencyEvidenceFromFlow2_('s@x', 'CFG', 'file',
    { 1: '8175-4', 2: '', 3: '8175-20', 4: '8175-51, 8175-49' }, { 1: 'a', 2: 'b', 3: 'c', 4: 'd' },
    { 1: 'MET', 2: 'MET', 3: 'NOT_MET', 4: 'PARTIALLY_MET' });
  assert.deepEqual(r, { written: 4, skipped: 1 });
  const rows = ev.getRange(2, 1, ev.getLastRow() - 1, 9).getValues();
  assert.deepEqual(rows.map((x) => [x[2], x[4]]),
    [['8175-4', 'MET'], ['8175-20', 'NOT_MET'], ['8175-51', 'PARTIALLY_MET'], ['8175-49', 'PARTIALLY_MET']]);
});
