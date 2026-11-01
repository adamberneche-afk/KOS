'use strict';
// The SCR retry (D15, built 2026-11-01). A competency a teacher rated 3 or
// 4 can be re-rated once the student has 5 pieces MET across it and its
// linked competencies, with 2 linked pieces MET per primary piece NOT_MET.
// Primary and linked ("secondary") come from each assignment's milestones:
// milestone 1 is the primary, milestones 2 and 3 its secondaries. 30b's
// LessonPrimarySecondary tab and evidence_role column were never made or
// written, so before this no student could ever be eligible.
//
// Covers the shared rule (00), the central-ledger scan (30b), the Teacher
// Dashboard's student page, SCR Review and re-rate (07), and what the
// student reads on their Competencies tab (13).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const TEACHER = 'teacher@example.com'; // the sandbox's default signed-in user
const ME = '1234567@ccpsnet.net';

// Three assignments in one TeacherMatrix:
//   A1: primary P, secondaries S1 and S2
//   A2: primary P, secondary S3
//   A3: primary S1, secondary P   (P and S1 swap roles here)
// Student workspaces C1..C5 map to them through StudentAssignments; A2's
// workspace is named by the assignment ID itself (no StudentAssignments row).
function fixture(sandbox, evidence, opts) {
  const o = opts || {};
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);

  const matrixSs = sandbox.SpreadsheetApp.create('Matrix');
  sandbox.SpreadsheetApp._registry.set(matrixSs.getId(), matrixSs);
  const tm = matrixSs.insertSheet('TeacherMatrix');
  tm.appendRow(new Array(21).fill('h'));
  const mrow = (id, p, s2, s3) => { const r = new Array(21).fill(''); r[0] = id; r[15] = p; r[16] = s2; r[17] = s3; tm.appendRow(r); };
  mrow('A1', 'P', 'S1', 'S2');
  mrow('A2', 'P', 'S3', '');
  mrow('A3', 'S1', 'P', '');
  const reg = ss.insertSheet('MatrixRegistry');
  reg.appendRow(['h', 'teacher_email', 'matrix_ss_id']);
  reg.appendRow(['', TEACHER, matrixSs.getId()]);
  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['config_id', 'x', 'assignment_id']);
  [['C1', 'A1'], ['C3', 'A3'], ['C4', 'A1'], ['C5', 'A1']].forEach(([c, a]) => sa.appendRow([c, '', a]));

  const ev = ss.insertSheet('CompetencyEvidence');
  ev.appendRow(['evidence_id', 'student_email', 'competency_id', 'milestone_text', 'outcome', 'config_id',
    'evaluated_at', 'student_file_id', 'archive_status']);
  evidence.forEach(([comp, outcome, configId, archived]) =>
    ev.appendRow(['e', ME, comp, '', outcome, configId, new Date(), '', archived || '']));

  // The Ledger (rosters and rule 3's ownership): every workspace is this
  // teacher's, this school year.
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  ['C1', 'A2', 'C3', 'C4', 'C5'].forEach((c) => {
    const r = new Array(27).fill('');
    r[0] = new Date(); r[1] = ME; r[2] = c; r[4] = 'Amy'; r[6] = 'Period 3'; r[8] = TEACHER; r[11] = '3';
    ledger.appendRow(r);
  });

  const scr = ss.insertSheet('SCRSuggestions');
  scr.appendRow(['student_email', 'competency_id', 'suggested_rating', 'met_count', 'not_met_count', 'partial_count',
    'status', 'last_computed_at', 'confirmed_rating', 'confirmed_at', 'confirmed_by']);
  scr.appendRow([ME, 'P', 3, 0, 0, 0, o.status || 'CONFIRMED', new Date(), o.rating || 3, new Date(), TEACHER]);
  const log = ss.insertSheet('SCRDecisionLog');
  log.appendRow(['decision_id', 'student_email', 'competency_id', 'suggested_rating', 'final_rating', 'decision_type',
    'decided_at', 'decided_by', 'evidence_snapshot', 'archive_status']);
  log.appendRow(['SCD-1', ME, 'P', 3, o.rating || 3, 'CONFIRMED', new Date('2026-10-20T12:00:00'), TEACHER, '', '']);
  const cr = ss.insertSheet('CompetencyRegistry');
  cr.appendRow(['competency_id', 'competency_text', 'subject', 'grade_band', 'strand', 'teacher_email', 'active']);
  [['P', 'Explain marketing'], ['S1', 'Describe the functions'], ['S2', 'Describe the concept'], ['S3', 'Identify trends']]
    .forEach(([id, t]) => cr.appendRow([id, t, 's', '9-12', 'Marketing', '', 'TRUE']));
  return { ss, scr, log };
}

// Ready: P MET in C1 (after a NOT_MET draft), in A2, and in C3 (as a
// secondary there), so all of P's evidence gives 2; linked S1, S2 (C1) and
// S3 (A2) MET; S1 MET in C3, where it is the primary, is not linked evidence.
const READY = [
  ['P', 'NOT_MET', 'C1'], ['P', 'MET', 'C1'], ['P', 'MET', 'A2'], ['P', 'MET', 'C3'],
  ['S1', 'MET', 'C1'], ['S2', 'MET', 'C1'], ['S3', 'MET', 'A2'], ['S1', 'MET', 'C3'],
];

function shared(evidence, opts) {
  const env = loadGasFiles([S('00_SharedConfig.js')], ['scrRetryContext_', 'scrRetryStatus_', 'scrRetryRoles_', 'getConfig_']);
  const fx = fixture(env.sandbox, evidence, opts);
  const cfg = env.exported.getConfig_();
  return Object.assign(env, fx, { cfg, status: (rating) =>
    env.exported.scrRetryStatus_(env.exported.scrRetryContext_(fx.ss, cfg), ME, 'P', rating === undefined ? 3 : rating) });
}

// ── The rule (00) ────────────────────────────────────────────────────────────

test('roles come from the milestones: linked competencies, and each workspace\'s assignment', () => {
  const env = shared([]);
  const roles = env.exported.scrRetryRoles_(env.ss, env.cfg);
  assert.deepEqual(roles.linked.P, ['S1', 'S2', 'S3']);
  assert.deepEqual(roles.linked.S1, ['P']);
  assert.equal(roles.byConfig.C1.primary, 'P');
  assert.equal(roles.byConfig.A2.primary, 'P', 'a workspace named by its assignment ID');
  assert.equal(roles.byConfig.C3.primary, 'S1');
});

test('ready: 5 MET, drafts counted once, roles respected; the new rating is the rule over all of P\'s evidence', () => {
  const st = shared(READY).status();
  assert.deepEqual(st.primary, { metCount: 2, notMetCount: 0, partialCount: 0 }, 'C1 counts once, at MET; C3 is not primary for P');
  assert.equal(st.secondary.metCount, 3, 'S1 in C3 is its own primary there, so not linked evidence');
  assert.equal(st.all.metCount, 3, 'all of P\'s evidence, any role');
  assert.equal(st.eligible, true);
  assert.equal(st.newRating, 2);
  assert.equal(st.improved, true);
});

test('not yet: one piece short of 5 names what is missing', () => {
  const st = shared(READY.filter(([c]) => c !== 'S3')).status();
  assert.equal(st.eligible, false);
  assert.equal(st.needMet, 1);
  assert.equal(st.needSecondary, 0);
  assert.match(st.reason, /1 more MET/);
});

test('the ratio: 2 linked pieces MET for each primary piece NOT_MET', () => {
  const st = shared(READY.concat([['P', 'NOT_MET', 'C4'], ['P', 'NOT_MET', 'C5']])).status();
  assert.equal(st.primary.notMetCount, 2);
  assert.equal(st.needSecondary, 1, '4 linked MET needed, 3 shown');
  assert.equal(st.eligible, false);
});

test('eligible but not better: the new rating must beat the current one, and it says how many more MET would', () => {
  const ev = READY.map(([c, o, cfg]) => [c, c === 'P' && cfg === 'C3' ? 'NOT_MET' : o, cfg]).concat([['S1', 'MET', 'C4']]);
  const st = shared(ev).status();
  assert.equal(st.eligible, true);
  assert.equal(st.newRating, 3, 'MET, MET, NOT_MET averages to 3');
  assert.equal(st.improved, false);
  assert.equal(st.needPrimaryMet, 1);
});

test('only ratings of 3 or 4 apply; archived evidence is left out', () => {
  assert.equal(shared(READY).status(2).applies, false);
  assert.equal(shared(READY).status(5).applies, false);
  const st = shared(READY.map(([c, o, cfg]) => [c, o, cfg, c === 'S3' ? 'ARCHIVED' : ''])).status();
  assert.equal(st.needMet, 1);
});

// ── 30b: the scan the attention signal counts ────────────────────────────────

function central(evidence, opts) {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('30_SCRSuggestionEngine.js'), S('30b_SCRRetryRemediation.js')],
    ['checkRetryEligibility_', 'getAllRetryEligibleStudents_', 'attemptPrimaryRetry_', 'previewScrRetryThresholds']);
  return Object.assign(env, fixture(env.sandbox, evidence, opts));
}

test('30b: a confirmed 3 with enough evidence is eligible, with no LessonPrimarySecondary tab', () => {
  const env = central(READY);
  const r = env.exported.checkRetryEligibility_(ME, 'P');
  assert.equal(r.eligible, true);
  assert.equal(r.currentOfficialRating, 3);
  assert.equal(env.exported.getAllRetryEligibleStudents_().eligible.length, 1);
  assert.equal(env.exported.attemptPrimaryRetry_(ME, 'P').newSuggestedRating, 2);
});

test('30b: an undecided rating is not a retry', () => {
  const env = central(READY, { status: 'SUGGESTED' });
  assert.match(env.exported.checkRetryEligibility_(ME, 'P').reason, /not yet decided/);
});

// ── 07: the student page, SCR Review, and the re-rating ──────────────────────

function dashboard(evidence, opts) {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('07_TeacherDashboard.js')],
    ['teacherConfirmScrRetry', 'getScrReviewQueue', '_tdRetryRows_', 'getConfig_']);
  return Object.assign(env, fixture(env.sandbox, evidence, opts));
}

test('07: the student page lists the rating and what it needs; SCR Review lists only ready ones', () => {
  const env = dashboard(READY.filter(([c]) => c !== 'S3'));
  const rows = env.exported._tdRetryRows_(env.exported.getConfig_(), env.ss, ME);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].competencyText, 'Explain marketing');
  assert.equal(rows[0].needMet, 1);
  assert.deepEqual(env.exported.getScrReviewQueue().retries, []);
  const ready = dashboard(READY);
  assert.equal(ready.exported.getScrReviewQueue().retries.length, 1);
});

test('07: Re-rate updates the current rating and appends RETRY_IMPROVED; the first decision stays', () => {
  const env = dashboard(READY);
  const res = env.exported.teacherConfirmScrRetry(ME, 'P');
  assert.deepEqual({ success: res.success, previousRating: res.previousRating, newRating: res.newRating },
    { success: true, previousRating: 3, newRating: 2 });
  const log = env.log.getDataRange().getValues();
  assert.equal(log.length, 3);
  assert.equal(log[1][5], 'CONFIRMED');
  assert.equal(log[2][5], 'RETRY_IMPROVED');
  assert.equal(log[2][4], 2);
  assert.match(log[2][8], /previous official rating: 3/);
  assert.equal(env.scr.getDataRange().getValues()[1][8], 2);
  const again = env.exported.teacherConfirmScrRetry(ME, 'P');
  assert.equal(again.success, false, 'a 2 is past the retry');
});

test('07: Re-rate refuses when the evidence is not enough, and for a caller who is not the teacher', () => {
  const env = dashboard(READY.filter(([c]) => c !== 'S3'));
  const res = env.exported.teacherConfirmScrRetry(ME, 'P');
  assert.equal(res.success, false);
  assert.match(res.error, /1 more MET/);
  assert.equal(env.log.getLastRow(), 2, 'nothing written');
  env.sandbox.PropertiesService.getScriptProperties().setProperty('TEACHER_EMAIL', 'someone.else@example.com');
  assert.match(env.exported.teacherConfirmScrRetry(ME, 'P').error, /Not authorized/);
});

test('07: another teacher\'s rating is not listed or re-rated', () => {
  const env = dashboard(READY);
  const ledger = env.ss.getSheetByName('Ledger');
  const rows = ledger.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) ledger.getRange(i + 1, 9).setValue('other.teacher@example.com');
  assert.deepEqual(env.exported._tdRetryRows_(env.exported.getConfig_(), env.ss, ME), []);
  assert.equal(env.exported.teacherConfirmScrRetry(ME, 'P').success, false);
});

// ── 13: what the student reads ───────────────────────────────────────────────

function student(evidence) {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('63_DocHeader.js'), S('13_StudentDashboard.js')], ['_dashRetryFor_', 'getConfig_'],
    { Session: { getActiveUser: () => ({ getEmail: () => ME }), getEffectiveUser: () => ({ getEmail: () => ME }),
      getScriptTimeZone: () => 'America/New_York' } });
  const fx = fixture(env.sandbox, evidence);
  return (rating) => env.exported._dashRetryFor_(fx.ss, env.exported.getConfig_(), ME,
    [{ competencyId: 'P', rating: rating === undefined ? 3 : rating }]);
}

test('13: ready says the teacher decides, and never shows the suggested number', () => {
  const r = student(READY)().P;
  assert.equal(r.ready, true);
  assert.match(r.text, /Your teacher decides/);
  assert.doesNotMatch(r.text, /\b2\b/);
});

test('13: not yet names the linked skills in words and how much more', () => {
  const r = student(READY.concat([['P', 'NOT_MET', 'C4'], ['P', 'NOT_MET', 'C5']]).filter(([c]) => c !== 'S3'))().P;
  assert.equal(r.ready, false);
  assert.match(r.text, /^To be re-rated: show 2 more times one of the skills that go with it: “Describe the functions”/);
  assert.equal(student(READY)(2).P, undefined, 'a 2 gets nothing');
});


// ── The thresholds as settings (2026-11-01) ─────────────────────────────────

test('the thresholds come from config: defaults 5 and 2; a bad value keeps the default', () => {
  const { scrRetryThresholds_ } = loadGasFiles([S('00_SharedConfig.js')], ['scrRetryThresholds_']).exported;
  assert.deepEqual({ ...scrRetryThresholds_({}) }, { minMet: 5, linkedPerMiss: 2 });
  assert.deepEqual({ ...scrRetryThresholds_({ SCR_RETRY_MIN_MET: '4', SCR_RETRY_LINKED_PER_MISS: '1' }) }, { minMet: 4, linkedPerMiss: 1 });
  for (const bad of ['0', '-1', '2.5', 'five', '21']) {
    assert.deepEqual({ ...scrRetryThresholds_({ SCR_RETRY_MIN_MET: bad, SCR_RETRY_LINKED_PER_MISS: bad }) },
      { minMet: 5, linkedPerMiss: 2 }, bad);
  }
});

test('a configured minimum changes eligibility: one short of 5 is ready at 4', () => {
  const short = READY.filter(([c]) => c !== 'S3');
  assert.equal(shared(short).status().eligible, false, 'not yet at the default 5');
  const env = shared(short);
  env.sandbox.PropertiesService.getScriptProperties().setProperty('SCR_RETRY_MIN_MET', '4');
  const st = env.exported.scrRetryStatus_(env.exported.scrRetryContext_(env.ss, env.cfg), ME, 'P', 3);
  assert.equal(st.eligible, true);
  assert.equal(st.needMet, 0);
});

test('a configured ratio changes eligibility: one linked per miss clears what two did not', () => {
  const twoMisses = READY.concat([['P', 'NOT_MET', 'C4'], ['P', 'NOT_MET', 'C5']]);
  const env = shared(twoMisses);
  env.sandbox.PropertiesService.getScriptProperties().setProperty('SCR_RETRY_LINKED_PER_MISS', '1');
  const st = env.exported.scrRetryStatus_(env.exported.scrRetryContext_(env.ss, env.cfg), ME, 'P', 3);
  assert.equal(st.needSecondary, 0, '2 linked MET needed at 1 per miss, 3 shown');
});

test('30b: previewScrRetryThresholds counts at the current values and one step either side, names nobody', () => {
  const env = central(READY.filter(([c]) => c !== 'S3'));
  const logs = [];
  env.sandbox.Logger.log = (m) => logs.push(String(m));
  const r = env.exported.previewScrRetryThresholds();
  assert.equal(r.candidates, 1);
  const row = (m, l) => r.rows.find((x) => x.minMet === m && x.linkedPerMiss === l);
  assert.equal(row(5, 2).notYet, 1, 'current: one short');
  assert.equal(row(4, 2).ready, 1, 'at 4 it would be ready');
  assert.equal(row(6, 2).notYet, 1);
  assert.equal(r.rows.length, 5);
  assert.doesNotMatch(logs.join('\n'), /@|1234567/, 'counts only');
});
