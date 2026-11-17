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
const load = (names) => loadGasFiles([S('00_SharedConfig.js'), S('00b_ScriptOwnerGuard.js'),
  S('15b_StudioFlowPrompts_Flow2_Revised.js'), S('04_Form2_TurnInGate.js'), S('32_CompetencyRubricImporter.js'), S('15c_Flow2DirectEvaluationService.js')], names);

test('competencyIdText_: a date is course-month; text is trimmed', () => {
  const { exported } = load(['competencyIdText_']);
  const f = exported.competencyIdText_;
  assert.equal(f(new Date(8177, 6, 1)), '8177-7');
  assert.equal(f(new Date(8175, 11, 1)), '8175-12');
  assert.equal(f(' 8177-19 '), '8177-19');
  assert.equal(f(''), '');
  assert.equal(f(null), '');
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
  assert.match(dry.message, /Would rewrite 3 of 4 .*8177-2 1, 8177-7 2.*repairCompetencyIdDates\(true\)/);
  const res = exported.competencyIdDateRepair_(sheet, true);
  assert.equal(res.fixed, 3);
  assert.deepEqual(sheet.getRange(2, 3, 4, 1).getValues().map((r) => r[0]), ['8177-7', '8177-19', '8177-2', '8177-7']);
  assert.equal(exported.competencyIdDateRepair_(sheet, false).fixed, 0, 'a second run finds nothing');
});
