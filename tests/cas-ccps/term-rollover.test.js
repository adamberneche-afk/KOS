'use strict';
// Decision #41 (2026-10-19): the term follows the marking-period dates. A
// period runs through its last day (2026-27: Oct 30, Jan 22, Mar 25, Jun 4);
// CURRENT_TERM names the school year and is the fallback outside the table.
// Enrollment checks compare the school year, so MP1 students stay enrolled
// in MP2 (before this, an exact match would have dropped every one of them
// from warm-ups and the roster on Oct 31).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

function load(props) {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('22_LessonContextHandler.js'), S('24_WarmUpBridge.js')],
    ['currentTerm_', 'sameSchoolYearTerm_', '_currentSchoolYear_', 'getEnrolledStudents_']);
  const p = env.sandbox.PropertiesService.getScriptProperties();
  Object.entries(props || {}).forEach(([k, v]) => p.setProperty(k, v));
  return env.exported;
}
const at = (ymd) => new Date(ymd + 'T16:00:00Z'); // midday in Virginia

test('the term rolls over the day after each marking period ends', () => {
  const x = load({ CURRENT_TERM: '2627_MP1' });
  assert.equal(x.currentTerm_(at('2026-08-24')), '2627_MP1');
  assert.equal(x.currentTerm_(at('2026-10-30')), '2627_MP1');
  assert.equal(x.currentTerm_(at('2026-10-31')), '2627_MP2');
  assert.equal(x.currentTerm_(at('2027-01-22')), '2627_MP2');
  assert.equal(x.currentTerm_(at('2027-01-23')), '2627_MP3');
  assert.equal(x.currentTerm_(at('2027-03-26')), '2627_MP4');
  assert.equal(x.currentTerm_(at('2027-06-04')), '2627_MP4');
  assert.equal(x.currentTerm_(at('2027-06-05')), '2627_MP1', 'summer: CURRENT_TERM as set');
  assert.equal(x.currentTerm_(at('2026-07-15')), '2627_MP1', 'before the table\'s year: CURRENT_TERM');
  assert.equal(x._currentSchoolYear_(at('2026-11-02')), '2026-27');
});

test('the table can be replaced; a CURRENT_TERM in another school year wins', () => {
  const x = load({ MARKING_PERIOD_ENDS: '2627_MP1=2026-11-06, 2627_MP2=2027-01-29, junk' });
  assert.equal(x.currentTerm_(at('2026-11-02')), '2627_MP1');
  assert.equal(x.currentTerm_(at('2026-11-09')), '2627_MP2');
  assert.equal(load({ CURRENT_TERM: '2025-26 S2' }).currentTerm_(at('2026-11-09')), '2025-26 S2');
  assert.equal(load({}).currentTerm_(at('2026-10-19')), '2627_MP1', 'no setup: the built-in 2026-27 calendar');
});

test('an MP1 student is still enrolled in MP2; another year is not', () => {
  const x = load({});
  assert.equal(x.sameSchoolYearTerm_('2627_MP1', '2627_MP2'), true);
  assert.equal(x.sameSchoolYearTerm_('2526_MP4', '2627_MP1'), false);
  assert.equal(x.sameSchoolYearTerm_('', '2627_MP2'), true);
  assert.equal(x.sameSchoolYearTerm_('Fall', 'Spring'), false, 'no readable year: exact match');
  const row = (email, term) => {
    const r = new Array(19).fill('');
    r[1] = email; r[4] = 'Student'; r[8] = 'teacher@ccpsnet.net'; r[11] = '1'; r[12] = 'ACTIVE'; r[18] = term;
    return r;
  };
  const data = [['header'], row('a@x', '2627_MP1'), row('b@x', '2526_MP4')];
  assert.deepEqual(x.getEnrolledStudents_(data, 'teacher@ccpsnet.net', '1', '2627_MP2', '').map((s) => s.email), ['a@x']);
});
