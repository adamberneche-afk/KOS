'use strict';
// Student-data access policy, rule 1: student data is visible only during
// the current school year. cas-ccps/scripts/00_SharedConfig.js's school-year
// helpers, and the Teacher Dashboard roster that uses them.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

test('school years start in August and read like CURRENT_TERM\'s prefix', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js')], ['_schoolYearForDate_', '_schoolYearOfTerm_']);
  assert.equal(exported._schoolYearForDate_(new Date(2026, 7, 1)), '2026-27');
  assert.equal(exported._schoolYearForDate_(new Date(2026, 6, 31)), '2025-26');
  assert.equal(exported._schoolYearForDate_(new Date(2099, 11, 1)), '2099-00');
  assert.equal(exported._schoolYearOfTerm_('2025-26 S1'), '2025-26');
  assert.equal(exported._schoolYearOfTerm_('Fall 2025'), '', 'an unrecognised term falls back to the date');
});

test('the current year is CURRENT_TERM\'s when set, else today\'s', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js')], ['_currentSchoolYear_']);
  assert.equal(exported._currentSchoolYear_(new Date(2026, 8, 28)), '2026-27');
  sandbox.PropertiesService.getScriptProperties().setProperty('CURRENT_TERM', '2025-26 S2');
  assert.equal(exported._currentSchoolYear_(new Date(2026, 8, 28)), '2025-26');
});

test('_getRosterForEmail_: last year\'s students are not on this year\'s roster', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('07_TeacherDashboard.js')],
    ['_getRosterForEmail_', 'getConfig_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('CURRENT_TERM', '2026-27 S1');
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('h'));
  const row = (email, name, term) => {
    const r = new Array(23).fill('');
    r[0] = new Date(2026, 8, 1); r[1] = email; r[4] = name; r[8] = 'teacher@example.com'; r[18] = term;
    return r;
  };
  ledger.appendRow(row('1111111@ccpsnet.net', 'This Year', '2026-27 S1'));
  ledger.appendRow(row('2222222@ccpsnet.net', 'Last Year', '2025-26 S2'));

  const roster = exported._getRosterForEmail_(exported.getConfig_(), 'teacher@example.com');
  assert.deepEqual(roster.map((s) => s.name), ['This Year']);
});
