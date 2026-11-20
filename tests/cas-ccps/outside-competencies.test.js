'use strict';
// Q26 (the operator, 2026-11-20): the competencies no lesson measures
// (student organization / DECA, work-based learning). 00's list is exactly
// the competencies no lesson names; the teacher rates them directly on the
// student's page (07's teacherRateOutsideCompetency), only for a student on
// their roster in that course, and may re-rate: each rating a new
// SCRDecisionLog row (the newest counts), the SCRSuggestions row decided.
// Made-up accounts only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const files = (p) => require('../../tools/gas-lint/project-map.json')[p].files.map((f) => path.join(ROOT, f));
const TEACHER = 'teacher@ccpsnet.net';
const AMY = 'amy@ccpsnet.net';

test('the list is exactly the competencies no lesson names', () => {
  const x = loadGasFiles(files('cas-ccps:student-dashboard'), ['_dashCompetencyLessons_', 'COMPETENCIES_OUTSIDE_LESSONS']).exported;
  const ids = fs.readFileSync(path.join(ROOT, 'cas-ccps/data/CompetencyRegistry.csv'), 'utf8').split('\n').slice(1)
    .map((l) => l.split(',')[0]).filter(Boolean);
  const none = ids.filter((id) => !x._dashCompetencyLessons_(id).length).sort();
  assert.deepEqual(Object.keys(x.COMPETENCIES_OUTSIDE_LESSONS).sort(), none);
  Object.entries(x.COMPETENCIES_OUTSIDE_LESSONS).forEach(([id, k]) => {
    assert.ok(['DECA', 'WBL'].includes(k), id);
    assert.equal(k, Number(id.split('-')[1]) <= 33 ? 'DECA' : 'WBL', id + ': 31-33 are DECA, 35-38 work-based learning');
  });
});

function setUp() {
  const env = loadGasFiles(files('cas-ccps:teacher-dashboard'), ['_recordOutsideRating_', '_tdOutsideCompetencies_',
    'readLatestScrRatings_', 'getConfig_'], { Session: { getActiveUser: () => ({ getEmail: () => TEACHER }),
    getEffectiveUser: () => ({ getEmail: () => TEACHER }), getScriptTimeZone: () => 'America/New_York' } });
  const sb = env.sandbox;
  const ss = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sb.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  ss.insertSheet('SCRSuggestions').appendRow(['student_email', 'competency_id', 'suggested', 'met', 'not_met', 'partial', 'status',
    'computed_at', 'confirmed_rating', 'confirmed_at', 'confirmed_by']);
  ss.insertSheet('SCRDecisionLog').appendRow(['decision_id', 'student_email', 'competency_id', 'suggested', 'final', 'type',
    'decided_at', 'decided_by', 'snapshot', 'archive_status']);
  ss.insertSheet('CompetencyRegistry').appendRow(['competency_id', 'competency_text', 'strand', 'active']);
  ss.getSheetByName('CompetencyRegistry').appendRow(['8175-31', 'Identify the purposes of the student organization.', 'x', 'TRUE']);
  // The roster and the student's courses this year, as 07 reads them.
  sb._getRosterForEmail_ = () => [{ email: AMY, name: 'Amy' }];
  sb._tdStudentCourses_ = () => ({ [AMY]: ['8175'] });
  return Object.assign(env, { ss, x: env.exported, cfg: env.exported.getConfig_() });
}
const rows = (ss, name) => ss.getSheetByName(name).getDataRange().getValues().slice(1);

test('a direct rating: decided, logged, re-rated with the newest counting', () => {
  const env = setUp();
  const r1 = env.x._recordOutsideRating_(env.cfg, AMY, '8175-31', 3);
  assert.deepEqual({ ...r1 }, { success: true, rating: 3 });
  let s = rows(env.ss, 'SCRSuggestions');
  assert.equal(s.length, 1);
  assert.equal(s[0][6], 'OVERRIDDEN', 'decided, so the weekly run leaves it');
  assert.equal(s[0][8], 3);
  const log1 = rows(env.ss, 'SCRDecisionLog');
  assert.equal(log1.length, 1);
  assert.equal(log1[0][8], 'OUTSIDE_LESSONS: DECA');
  // Re-rate a moment later: the same suggestion row, a second log row.
  log1[0][6] = new Date(Date.now() - 60000);
  env.ss.getSheetByName('SCRDecisionLog').getRange(2, 7).setValue(log1[0][6]);
  assert.equal(env.x._recordOutsideRating_(env.cfg, AMY, '8175-31', 2).success, true);
  s = rows(env.ss, 'SCRSuggestions');
  assert.equal(s.length, 1);
  assert.equal(s[0][8], 2);
  assert.equal(rows(env.ss, 'SCRDecisionLog').length, 2);
  const latest = env.x.readLatestScrRatings_(env.ss, env.cfg, TEACHER).get(AMY);
  assert.equal(Number(latest.find((r) => r.competencyId === '8175-31').rating), 2);
  const shown = env.x._tdOutsideCompetencies_(env.ss, env.cfg, AMY, ['8175']);
  assert.deepEqual(shown.map((c) => [c.id, c.kind, c.rating]).slice(0, 4),
    [['8175-31', 'DECA', 2], ['8175-32', 'DECA', null], ['8175-33', 'DECA', null], ['8175-35', 'WBL', null]]);
  assert.equal(shown[0].text, 'Identify the purposes of the student organization.');
  assert.ok(shown.every((c) => c.id.startsWith('8175-')), 'only the student\'s courses');
});

test('refused: a measured competency, a bad rating, another teacher\'s student, a course the student isn\'t in', () => {
  const env = setUp();
  assert.match(env.x._recordOutsideRating_(env.cfg, AMY, '8175-2', 2).error, /no lesson measures/);
  assert.match(env.x._recordOutsideRating_(env.cfg, AMY, '8175-31', 6).error, /1 to 5/);
  assert.match(env.x._recordOutsideRating_(env.cfg, AMY, '8175-31', 2.5).error, /1 to 5/);
  assert.match(env.x._recordOutsideRating_(env.cfg, 'bo@ccpsnet.net', '8175-31', 2).error, /not on your roster/);
  assert.match(env.x._recordOutsideRating_(env.cfg, AMY, '8177-31', 2).error, /isn't in your 8177 class/);
  assert.equal(rows(env.ss, 'SCRDecisionLog').length, 0, 'nothing written');
});
