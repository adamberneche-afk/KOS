'use strict';
// Competency IDs that Sheets stored as dates (2026-11-17): "8177-7" typed
// into a plain cell is read back as July 1, 8177. competencyIdText_ (32,
// from 2026-10-06, for the registry) turns such a cell back into its ID;
// Flow 2's evidence writer (15c) formats the column as text first;
// competencyIdDateRepair_ (15c) rewrites the old cells; the part unlock (68)
// reads them through competencyIdText_.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, FakeSheet } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const load = (names) => loadGasFiles([S('00_SharedConfig.js'), S('00c_CentralLedgerShared.js'), S('00d_TeacherDashboardShared.js'), S('00e_StudentDashboardShared.js'), S('00b_ScriptOwnerGuard.js'),
  S('15b_StudioFlowPrompts_Flow2_Revised.js'), S('04_Form2_TurnInGate.js'), S('32_CompetencyRubricImporter.js'), S('15c_Flow2DirectEvaluationService.js')], names);

test('competencyIdText_: a date is course-month; text is trimmed', () => {
  const { exported } = load(['competencyIdText_']);
  const f = exported.competencyIdText_;
  assert.equal(f(new Date(8177, 6, 1)), '8177-7');
  assert.equal(f(new Date(8175, 11, 1)), '8175-12');
  assert.equal(f(' 8177-19 '), '8177-19');
  assert.equal(f(''), '');
  assert.equal(f(null), '');
  // 2026-11-18: a date already turned into text by String() (37 wrote that
  // into FlowInput, and the harvest into CompetencyEvidence).
  assert.equal(f('Tue Jul 01 8177 00:00:00 GMT-0400 (Eastern Daylight Time)'), '8177-7');
  assert.equal(f('Sat Feb 01 8177 00:00:00 GMT-0500 (Eastern Standard Time)'), '8177-2');
  assert.equal(f(String(new Date(8175, 10, 1))), '8175-11', 'whatever String() of the cell gives');
  assert.equal(f('Tue Jul 15 2026 09:30:00 GMT-0400'), 'Tue Jul 15 2026 09:30:00 GMT-0400', 'not the first at midnight: left alone');
});

test('competencyIdDateRepair_: a dry run counts; apply rewrites only the dated cells, as text', () => {
  const { exported } = load(['competencyIdDateRepair_']);
  const sheet = new FakeSheet('CompetencyEvidence');
  sheet.appendRow(['evidence_id', 'student_email', 'competency_id', 'milestone_text', 'outcome']);
  sheet.appendRow(['e1', 's', new Date(8177, 6, 1), 'm', 'MET']);
  sheet.appendRow(['e2', 's', '8177-19', 'm', 'MET']);
  sheet.appendRow(['e3', 's', new Date(8177, 1, 1), 'm', 'NOT_MET']);
  sheet.appendRow(['e4', 's', new Date(8177, 6, 1), 'm', 'MET']);
  const dry = exported.competencyIdDateRepair_(sheet, false);
  assert.equal(dry.fixed, 3);
  assert.deepEqual({ ...dry.byId }, { '8177-7': 2, '8177-2': 1 });
  assert.ok(sheet.getRange(2, 3).getValue() instanceof Date || Object.prototype.toString.call(sheet.getRange(2, 3).getValue()) === '[object Date]', 'a dry run changes nothing');
  assert.match(dry.message, /^CompetencyEvidence: would rewrite 3 competency ID cell\(s\) stored as dates \(8177-2 1, 8177-7 2\)\. Run repairCompetencyIdDates\(true\)/);
  const res = exported.competencyIdDateRepair_(sheet, true);
  assert.equal(res.fixed, 3);
  assert.deepEqual(sheet.getRange(2, 3, 4, 1).getValues().map((r) => r[0]), ['8177-7', '8177-19', '8177-2', '8177-7']);
  assert.equal(exported.competencyIdDateRepair_(sheet, false).fixed, 0, 'a second run finds nothing');
});

test('competencyIdDateRepair_: a date\'s text is repaired too, and a FlowInput or TeacherMatrix by its columns', () => {
  const { exported } = load(['competencyIdDateRepair_']);
  const ev = new FakeSheet('CompetencyEvidence');
  ev.appendRow(['evidence_id', 'student_email', 'competency_id']);
  ev.appendRow(['e1', 's', 'Tue Jul 01 8177 00:00:00 GMT-0400 (Eastern Daylight Time)']);
  ev.appendRow(['e2', 's', '8177-19']);
  const r = exported.competencyIdDateRepair_(ev, true);
  assert.equal(r.fixed, 1);
  assert.deepEqual(ev.getRange(2, 3, 2, 1).getValues().map((x) => x[0]), ['8177-7', '8177-19']);
  // A TeacherMatrix row: competency IDs in columns 16 to 19; nothing else touched.
  const tm = new FakeSheet('TeacherMatrix');
  tm.appendRow(new Array(20).fill('h'));
  const row = new Array(20).fill('x');
  row[15] = new Date(8177, 6, 1); row[16] = '8177-19'; row[17] = 'Sat Feb 01 8177 00:00:00 GMT-0500 (Eastern Standard Time)'; row[18] = '';
  row[10] = new Date(2026, 10, 1); // AddedAt, a real date
  tm.appendRow(row);
  const t = exported.competencyIdDateRepair_(tm, true, { cols: [16, 17, 18, 19], label: 'TeacherMatrix 1' });
  assert.equal(t.fixed, 2);
  assert.match(t.message, /^TeacherMatrix 1: rewrote 2 /);
  assert.deepEqual(tm.getRange(2, 16, 1, 4).getValues()[0], ['8177-7', '8177-19', '8177-2', '']);
  assert.ok(Object.prototype.toString.call(tm.getRange(2, 11).getValue()) === '[object Date]', 'a real date elsewhere is left alone');
});
