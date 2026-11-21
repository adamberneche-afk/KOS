'use strict';
// A lesson's assignment ConfigID is built and read in one place (structure
// audit 3.4, 2026-11-21): casConfigId_ and parseCasId_ in 00_SharedConfig.js.
// 13 and 71 are student-facing, so the shapes they read are pinned here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const x = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '00c_CentralLedgerShared.js'), path.join(SCRIPTS, '00d_TeacherDashboardShared.js'), path.join(SCRIPTS, '00e_StudentDashboardShared.js')], ['casConfigId_', 'parseCasId_']).exported;
const plain = (o) => (o ? { ...o } : o);

test('casConfigId_ builds a lesson\'s and a part\'s ID, upper case', () => {
  assert.equal(x.casConfigId_('8175-L24'), 'CAS-8175-L24');
  assert.equal(x.casConfigId_('8175-L24', 2), 'CAS-8175-L24-P2');
  assert.equal(x.casConfigId_('8177-employee-handbook-operations'), 'CAS-8177-EMPLOYEE-HANDBOOK-OPERATIONS');
  assert.equal(x.casConfigId_('8175-l24-p2'), 'CAS-8175-L24-P2', 'a 55b part key is passed whole');
});

test('parseCasId_ reads the course, the lesson and the part; null for anything else', () => {
  assert.deepEqual(plain(x.parseCasId_('CAS-8175-L24-P2')), { course: '8175', lessonKey: '8175-L24', part: 2 });
  assert.deepEqual(plain(x.parseCasId_(' cas-8175-l02 ')), { course: '8175', lessonKey: '8175-L02', part: 0 });
  assert.deepEqual(plain(x.parseCasId_('CAS-8177-EMPLOYEE-HANDBOOK-OPERATIONS-P3')),
    { course: '8177', lessonKey: '8177-EMPLOYEE-HANDBOOK-OPERATIONS', part: 3 });
  assert.deepEqual(plain(x.parseCasId_('CAS-S1-U1-8175')), { course: '', lessonKey: 'S1-U1-8175', part: 0 },
    '53\'s unit seeds have no leading course');
  ['VDOE-X', '', null, 'CAS-'].forEach((v) => assert.equal(x.parseCasId_(v), null, String(v)));
  for (const k of ['8175-L24', '8177-L05']) for (const p of [0, 1, 4]) {
    assert.equal(x.casConfigId_(x.parseCasId_(x.casConfigId_(k, p)).lessonKey, p), x.casConfigId_(k, p), 'round trip');
  }
});

test('no script builds a lesson ID by hand or parses one with its own pattern', () => {
  const found = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js') && n !== '00_SharedConfig.js')) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    // 53's unit seed (CAS-<unit>-<course>) and 71/74's turn-in codes are other IDs.
    const built = src.match(/"CAS-" \+ (?!unitId|course|m\[1\]|_tccDigits_)[^;]*/);
    if (built) found.push(f + ': ' + built[0].slice(0, 60));
    const parsed = src.match(/\/\^CAS-\(\.\+\??\)/i) || src.match(/\/\^\(\.\*?\+?\)-P\(\\d\+\)\$\//);
    if (parsed) found.push(f + ': ' + parsed[0]);
  }
  assert.deepEqual(found, [], 'use 00_SharedConfig.js\'s casConfigId_ and parseCasId_');
});

// ── Dates (structure audit 3.5): ymd_, cellYmd_, localYmd_ in 00 ──
test('the date helpers: a Date in a time zone, a sheet cell, a Date\'s own fields', () => {
  const env = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '00c_CentralLedgerShared.js'), path.join(SCRIPTS, '00d_TeacherDashboardShared.js'), path.join(SCRIPTS, '00e_StudentDashboardShared.js')], ['ymd_', 'cellYmd_', 'localYmd_']);
  const D = env.sandbox.Date;
  const late = new D(Date.UTC(2026, 10, 21, 3, 30)); // 10:30pm on the 20th in New York
  assert.equal(env.exported.ymd_(late, 'America/New_York'), '2026-11-20');
  assert.equal(env.exported.ymd_(late, 'UTC'), '2026-11-21');
  assert.equal(env.exported.cellYmd_('2026-11-05T12:00:00Z', 'UTC'), '2026-11-05', 'a string\'s leading date');
  assert.equal(env.exported.cellYmd_('Nov 5', 'UTC'), '');
  assert.equal(env.exported.cellYmd_(new D('not a date'), 'UTC'), '', 'an invalid Date');
  assert.equal(env.exported.cellYmd_(late, 'America/New_York'), '2026-11-20');
  assert.equal(env.exported.localYmd_(new D(2026, 0, 5)), '2026-01-05');
});

test('no script keeps its own copy of a date helper', () => {
  const found = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js') && n !== '00_SharedConfig.js')) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const m = src.match(/^function (formatDateYMD_|dashIsoDate_|_onDateStr_|_schoolYmd_)\(/m);
    if (m) found.push(f + ': ' + m[1]);
    if (/Utilities\.formatDate\([^;]*"yyyy-MM-dd"\)/.test(src)) found.push(f + ': formatDate(…, "yyyy-MM-dd")');
  }
  assert.deepEqual(found, [], 'use 00_SharedConfig.js\'s ymd_, cellYmd_ and localYmd_');
});
