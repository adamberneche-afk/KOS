'use strict';
// CURRENT_TERM is the school year plus the marking period, "2627_MP1"
// (MP 1-4; the teacher's decision of 2026-10-12). Courses run all year, so
// the marking period only labels new Ledger rows: the dashboards show the
// whole current school year by default, and archiving takes a whole school
// year, never one marking period. Older terms ("2025-26 S1") still read.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const TEACHER = 'teacher@example.com'; // the sandbox's default signed-in user

// ── 00: reading a term ──

test('_schoolYearOfTerm_: "2627_MP1" is 2026-27; old terms still read; bad ones fall back', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js')], ['_schoolYearOfTerm_']);
  assert.equal(exported._schoolYearOfTerm_('2627_MP1'), '2026-27');
  assert.equal(exported._schoolYearOfTerm_('2627_MP4'), '2026-27');
  assert.equal(exported._schoolYearOfTerm_('9900_MP2'), '2099-00');
  assert.equal(exported._schoolYearOfTerm_('2025-26 S1'), '2025-26');
  for (const bad of ['2627_MP5', '2627_MP0', '2628_MP1', '2627-MP1', '2627']) {
    assert.equal(exported._schoolYearOfTerm_(bad), '', bad + ' is not a term');
  }
});

test('_currentSchoolYear_: a marking-period CURRENT_TERM gives its school year', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js')], ['_currentSchoolYear_']);
  sandbox.PropertiesService.getScriptProperties().setProperty('CURRENT_TERM', '2526_MP3');
  assert.equal(exported._currentSchoolYear_(new Date(2026, 8, 28)), '2025-26');
});

// ── 10: setting a term, archiving a year ──

function loadAdmin() {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('10_AdminRecoveryPanel.js')], [
    '_validateTermInput_', '_parseSchoolYearInput_', '_archiveSchoolYearRows_',
    '_reactivateSchoolYearRows_', 'LEDGER',
  ]);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  return Object.assign(env, { ss });
}

test('_validateTermInput_: only school year + marking period 1-4', () => {
  const { exported } = loadAdmin();
  assert.equal(exported._validateTermInput_('2627_MP1'), '');
  assert.equal(exported._validateTermInput_('2627_MP4'), '');
  for (const bad of ['', '2627_MP5', '2025-26 S1', '2627', '2628_MP1']) {
    assert.notEqual(exported._validateTermInput_(bad), '', bad + ' must be refused');
  }
});

test('_parseSchoolYearInput_: a school year in either form; a marking period is refused', () => {
  const { exported } = loadAdmin();
  assert.equal(exported._parseSchoolYearInput_('2627').year, '2026-27');
  assert.equal(exported._parseSchoolYearInput_(' 2026-27 ').year, '2026-27');
  const mp = exported._parseSchoolYearInput_('2627_mp1');
  assert.ok(mp.error && /one marking period/.test(mp.error) && /2627/.test(mp.error));
  assert.ok(exported._parseSchoolYearInput_('2628').error);
  assert.ok(exported._parseSchoolYearInput_('').error);
  assert.ok(exported._parseSchoolYearInput_('Fall').error);
});

test('_archiveSchoolYearRows_ / _reactivateSchoolYearRows_: every marking period of the year, nothing else', () => {
  const { exported, ss } = loadAdmin();
  const L = exported.LEDGER;
  const sheet = ss.insertSheet('Ledger');
  sheet.appendRow(new Array(23).fill('h'));
  const row = (term, status, ts) => {
    const r = new Array(23).fill('');
    r[L.TIMESTAMP] = ts || new Date(2026, 8, 15);
    r[L.STATUS] = status;
    r[L.ACADEMIC_YEAR] = term;
    return r;
  };
  [
    row('2627_MP1', 'COMPLIANT'),
    row('2627_MP2', 'ACTIVE'),
    row('', 'COMPLETE'),                                  // no term: its date's year, 2026-27
    row('2627_MP3', 'ERROR_TIMEOUT'),                     // left for admin review
    row('2526_MP4', 'ACTIVE', new Date(2026, 4, 1)),      // last year
    row('', 'ACTIVE', new Date(2026, 3, 1)),              // last year, by date
  ].forEach(r => sheet.appendRow(r));

  const r = exported._archiveSchoolYearRows_(sheet, '2026-27');
  assert.deepEqual({ archived: r.archived, skipped: r.skipped }, { archived: 3, skipped: 1 });
  const status = (n) => sheet.getRange(n, L.STATUS + 1).getValue();
  assert.deepEqual([2, 3, 4, 5, 6, 7].map(status),
    ['ARCHIVED', 'ARCHIVED', 'ARCHIVED', 'ERROR_TIMEOUT', 'ACTIVE', 'ACTIVE']);

  assert.equal(exported._reactivateSchoolYearRows_(sheet, '2026-27'), 3);
  assert.deepEqual([2, 3, 4].map(status), ['ACTIVE', 'ACTIVE', 'ACTIVE']);
});

// ── 07 and 13: the default view is the whole school year ──

const TEACHER_FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:teacher-dashboard'].files
  .map(f => path.join(__dirname, '..', '..', f));

function ledgerWithTwoMarkingPeriods(sandbox, L, width) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  props.setProperty('CURRENT_TERM', '2627_MP2');
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(width).fill('h'));
  const row = (name, term) => {
    const r = new Array(width).fill('');
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = name + '@ccpsnet.net'; r[L.CONFIG_ID] = 'CFG-' + name;
    r[L.FILE_ID] = 'f-' + name; r[L.STUDENT_NAME] = name; r[L.TEACHER_EMAIL] = TEACHER;
    r[L.COURSE_NAME] = '8175 Marketing'; r[L.PERIOD] = '1'; r[L.STATUS] = 'ACTIVE';
    r[L.ACADEMIC_YEAR] = term;
    return r;
  };
  ledger.appendRow(row('Amy', '2627_MP1'));
  ledger.appendRow(row('Bo', '2627_MP2'));
  return ss;
}

test('getDashboardData: in MP2, a student registered in MP1 still shows by default; the dropdown can narrow', () => {
  const { exported, sandbox } = loadGasFiles(TEACHER_FILES, ['getDashboardData', 'LEDGER']);
  ledgerWithTwoMarkingPeriods(sandbox, exported.LEDGER, 27);
  const all = exported.getDashboardData('');
  assert.equal(all.activeTerm, 'ALL');
  assert.deepEqual(all.students.map(s => s.name).sort(), ['Amy', 'Bo']);
  assert.deepEqual(all.availableTerms, ['2627_MP2', '2627_MP1']);
  const mp1 = exported.getDashboardData('2627_MP1');
  assert.deepEqual(mp1.students.map(s => s.name), ['Amy']);
});

test('getStudentDashboardData: a student registered in MP1 still sees the work in MP2', () => {
  const session = {
    getActiveUser() { return { getEmail() { return 'Amy@ccpsnet.net'; } }; },
    getEffectiveUser() { return { getEmail() { return 'admin@ccpsnet.net'; } }; },
    getScriptTimeZone() { return 'America/New_York'; },
  };
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('13_StudentDashboard.js')],
    ['getStudentDashboardData', 'LEDGER'], { Session: session });
  ledgerWithTwoMarkingPeriods(sandbox, exported.LEDGER, 23);
  const data = exported.getStudentDashboardData('');
  assert.equal(data.activeTerm, 'ALL');
  assert.equal(data.assignments.length, 1, JSON.stringify(data.emptyReason || ''));
});
