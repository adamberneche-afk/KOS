'use strict';
// The three nightly jobs no test called (coverage-gaps' allowlist, from the
// dead-ends audit, 2026-11-17), each run whole against a seeded Central
// Ledger with the whole Central Ledger project loaded, as the trigger runs it:
//
// - buildUpcomingLessons (51): the trigger's entry point drafts the same
//   lessons as the plan run with apply (course-year-builder tests the plan).
// - buildWarmUpQueues (24, 3:30am): one PENDING row per enrolled student for
//   tomorrow's lesson, a returning student's last answer in the snapshot, no
//   second row for a student already queued, the lesson marked QUEUED, the
//   stage stamp; a second run adds nothing; nothing when Module 2 is off.
// - updateAllStudentProfiles (23, 3:00am): one profile per active student of
//   this teacher, updated in place or appended, carrying the class's
//   competencies and the student's scored warm-ups; the stage stamp; a
//   second run appends nothing; nothing when Module 2 is off; refused for
//   anyone but the script's owner.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const PROJECT = require('../../tools/gas-lint/project-map.json')['cas-ccps:central-ledger'];
const FILES = PROJECT.files.map((f) => path.join(ROOT, f));

const TEACHER = 'teacher@ccpsnet.net';
const OTHER_TEACHER = 'other@ccpsnet.net';
const COURSE = '8177 Sports Entertainment and Event Management';
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const TOMORROW = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); })();
// The day type tomorrow is not (24's getDayType_: the day of the month's parity).
const OFF_DAY = TOMORROW.getDate() % 2 === 1 ? 'EVEN' : 'ODD';

const A = 'amy@students.ccpsnet.net';
const B = 'ben@students.ccpsnet.net';
const C = 'cal@students.ccpsnet.net';   // archived
const D = 'dee@students.ccpsnet.net';   // another teacher's
const E = 'eli@students.ccpsnet.net';   // a period that doesn't meet tomorrow

// A Ledger row with the columns the jobs read (00's LEDGER).
function ledgerRow({ email, name, teacher = TEACHER, period = '2', status = 'ACTIVE', fileId = '' }) {
  const r = new Array(27).fill('');
  r[1] = email; r[3] = fileId; r[4] = name; r[8] = teacher; r[10] = COURSE; r[11] = period; r[12] = status;
  return r;
}

function setup(opts = {}) {
  const viewer = opts.viewer || TEACHER;
  const env = loadGasFiles(FILES, ['buildUpcomingLessons', 'buildUpcomingLessonPlan_', 'buildWarmUpQueues',
    'updateAllStudentProfiles', 'createWarmUpTabs_', 'WQ_BASE_WIDTH', 'SP_COL_COUNT'], {
    Session: { getActiveUser: () => ({ getEmail: () => viewer }), getEffectiveUser: () => ({ getEmail: () => TEACHER }),
      getScriptTimeZone: () => 'America/New_York' },
  });
  const { sandbox, exported } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', TEACHER);
  props.setProperty('TEACHER_NAME', 'Teacher');
  // Stage 2 ran just now, so 24's health check has nothing to report.
  props.setProperty('M2_STAGE2_LAST_RUN', new Date().toISOString());

  exported.createWarmUpTabs_(); // StudentProfiles, WarmUpQueue, ClassSchedule, … with their headers
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  [ledgerRow({ email: A, name: 'Amy' }), ledgerRow({ email: B, name: 'Ben' }),
    ledgerRow({ email: A, name: 'Amy' }), // a second assignment: still one student
    ledgerRow({ email: C, name: 'Cal', status: 'ARCHIVED' }),
    ledgerRow({ email: D, name: 'Dee', teacher: OTHER_TEACHER }),
    ledgerRow({ email: E, name: 'Eli', period: '3' })].forEach((r) => ledger.appendRow(r));

  const cs = ss.getSheetByName('ClassSchedule');
  cs.appendRow([TEACHER, '2', 'DAILY', COURSE, true]);
  cs.appendRow([TEACHER, '3', OFF_DAY, COURSE, true]);

  const lc = ss.insertSheet('LessonContext');
  lc.appendRow(['lesson_id', 'teacher_email', 'submitted_at', 'lesson_date', 'period_or_class',
    'activity_description', 'learning_objective', 'key_vocabulary', 'prior_lesson_connection',
    'competency_ids', 'status', 'alignment_logged_at', 'error_notes', 'term', 'warm_up_generated']);
  lc.appendRow(['LC-TOMORROW', TEACHER, new Date(), ymd(TOMORROW), '2', 'Plan the event budget.',
    'Students build an event budget.', 'budget', 'Last time: ticket pricing.', '8177-1,8177-2',
    'ALIGNMENT_LOGGED', '', '', '', '']);

  const reg = ss.insertSheet('CompetencyRegistry');
  // cas-ccps/data/CompetencyRegistry.csv's columns.
  reg.appendRow(['competency_id', 'competency_text', 'subject', 'grade_band', 'strand', 'teacher_email', 'active']);
  reg.appendRow(['8177-1', 'Build an event budget.', 'Marketing', '9-12', 'Finance', '', 'TRUE']);
  reg.appendRow(['8177-2', 'Price tickets for an event.', 'Marketing', '9-12', 'Finance', '', 'TRUE']);

  const al = ss.insertSheet('AlignmentLog');
  al.appendRow(['log_id', 'lesson_id', 'logged_at', 'lesson_date', 'teacher_email', 'learning_objective',
    'competency_id', 'competency_text', 'strand']);
  al.appendRow(['AL-1', 'LC-EARLIER', new Date(), '2026-11-02', TEACHER, 'x', '8177-1', '', '']);
  al.appendRow(['AL-2', 'LC-EARLIER', new Date(), '2026-11-02', TEACHER, 'x', '8177-3', '', '']);
  al.appendRow(['AL-3', 'LC-OTHER', new Date(), '2026-11-02', OTHER_TEACHER, 'x', '8175-9', '', '']);

  // Earlier warm-ups: Amy's two scored ones (an answer for 24's bridge,
  // engagement and extra credit for 23), and Ben already queued for tomorrow.
  const wq = ss.getSheetByName('WarmUpQueue');
  const wqRow = (f) => { const r = new Array(exported.WQ_BASE_WIDTH).fill(''); Object.keys(f).forEach((k) => { r[k] = f[k]; }); return r; };
  wq.appendRow(wqRow({ 0: 'WUQ-A1', 1: 'LC-EARLIER', 2: A, 3: 'Amy', 5: '2026-11-02', 8: 'SCORED', 12: 4, 13: 1, 14: 2,
    15: 1, 16: 8, 18: 'I would price student tickets lower so more of the school comes.' }));
  wq.appendRow(wqRow({ 0: 'WUQ-A2', 1: 'LC-EARLIER2', 2: A, 3: 'Amy', 5: '2026-11-04', 8: 'SCORED', 12: 4, 13: 1, 14: 3,
    15: 0, 16: 8, 18: 'A sponsor could pay for the scoreboard ads and lower our costs.' }));
  wq.appendRow(wqRow({ 0: 'WUQ-B0', 1: 'LC-TOMORROW', 2: B, 3: 'Ben', 5: ymd(TOMORROW), 8: 'PENDING' }));
  return Object.assign(env, { ss, props });
}

function rows(ss, tab) {
  const sh = ss.getSheetByName(tab);
  return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

// ---------------------------------------------------------------------------
// buildWarmUpQueues (24)
// ---------------------------------------------------------------------------

test('buildWarmUpQueues queues tomorrow\'s warm-up for each enrolled student, once', () => {
  const { exported, ss, props } = setup();
  exported.buildWarmUpQueues();
  const wq = rows(ss, 'WarmUpQueue');
  const added = wq.slice(3);
  assert.deepEqual(added.map((r) => r[2]), [A], 'Amy only: Ben is already queued, Cal archived, Dee another teacher\'s, Eli not meeting');
  const r = added[0];
  assert.equal(r[1], 'LC-TOMORROW');
  assert.equal(r[3], 'Amy');
  assert.equal(r[4], A);
  assert.equal(r[5], ymd(TOMORROW));
  assert.equal(r[8], 'PENDING');
  assert.match(String(r[0]), /^WUQ-/);
  const snap = JSON.parse(r[6]);
  assert.equal(snap.lesson_id, 'LC-TOMORROW');
  assert.equal(snap.lesson_date, ymd(TOMORROW));
  assert.equal(snap.objective, 'Students build an event budget.');
  assert.deepEqual(snap.competency_ids, ['8177-1', '8177-2']);
  assert.equal(snap.period, '2');
  assert.equal(snap.flow5_prior_response, 'A sponsor could pay for the scoreboard ads and lower our costs.',
    'her latest scored answer, for the lead-in');
  assert.equal(snap.flow5_prior_date, '2026-11-04');
  assert.equal(typeof JSON.parse(r[7]), 'object', 'a profile snapshot');

  assert.equal(rows(ss, 'LessonContext')[0][14], 'QUEUED');
  assert.equal(props.getProperty('M2_STAGE3_STATUS'), 'OK_1');
  assert.ok(props.getProperty('M2_STAGE3_LAST_RUN'));

  exported.buildWarmUpQueues();
  assert.equal(rows(ss, 'WarmUpQueue').length, wq.length, 'a second run adds nothing');
  assert.equal(props.getProperty('M2_STAGE3_STATUS'), 'OK_NONE');
});

test('buildWarmUpQueues: a night with no period meeting is still stamped; Module 2 off builds nothing', () => {
  const quiet = setup();
  const cs = quiet.ss.getSheetByName('ClassSchedule');
  cs.getRange(2, 3).setValue(OFF_DAY); // period 2 no longer meets tomorrow
  quiet.exported.buildWarmUpQueues();
  assert.equal(rows(quiet.ss, 'WarmUpQueue').length, 3);
  assert.equal(quiet.props.getProperty('M2_STAGE3_STATUS'), 'OK_NONE');

  const off = setup();
  off.props.setProperty('M2_ENABLED', 'false');
  off.exported.buildWarmUpQueues();
  assert.equal(rows(off.ss, 'WarmUpQueue').length, 3);
  assert.equal(off.props.getProperty('M2_STAGE3_LAST_RUN'), null, 'no stamp: it did not run');
});

// ---------------------------------------------------------------------------
// updateAllStudentProfiles (23)
// ---------------------------------------------------------------------------

test('updateAllStudentProfiles writes one profile per active student, in place or appended', () => {
  const { exported, ss, props } = setup();
  // Ben has a profile from an earlier night, under another row first.
  const sp = ss.getSheetByName('StudentProfiles');
  const old = new Array(exported.SP_COL_COUNT).fill('');
  old[0] = 'someone@students.ccpsnet.net';
  sp.appendRow(old.slice());
  old[0] = B; old[1] = 'Ben (old)'; old[5] = '[]';
  sp.appendRow(old.slice());

  exported.updateAllStudentProfiles();
  const p = rows(ss, 'StudentProfiles');
  const emails = p.map((r) => r[0]);
  assert.deepEqual(emails, ['someone@students.ccpsnet.net', B, A, E],
    'Ben updated in his own row; Amy and Eli appended; Cal (archived) and Dee (another teacher\'s) left out');
  const ben = p[1], amy = p[2];
  assert.equal(ben[1], 'Ben', 'his row now carries the Ledger\'s name');
  assert.equal(ben[3], TEACHER);
  assert.equal(ben[4], '2');
  assert.deepEqual(JSON.parse(ben[5]).sort(), ['8177-1', '8177-3'], 'the class\'s competencies, this teacher\'s only');
  assert.deepEqual(JSON.parse(ben[8]), [], 'no warm-ups scored yet');
  assert.equal(ben[10], '', 'no engagement average without a scored warm-up');

  const scores = JSON.parse(amy[8]);
  assert.deepEqual(scores.map((s) => s.queue_id), ['WUQ-A1', 'WUQ-A2'], 'her scored warm-ups, oldest first');
  assert.equal(amy[9], 1, 'one extra credit');
  assert.equal(amy[10], 2.5, 'the average engagement of 2 and 3');
  assert.ok(amy[11] instanceof Date || String(amy[11]).length > 0, 'last_updated');
  assert.equal(typeof JSON.parse(amy[12]), 'object', 'a shadow matrix');

  assert.equal(props.getProperty('M2_STAGE1_STATUS'), 'OK');
  assert.ok(props.getProperty('M2_STAGE1_LAST_RUN'));

  exported.updateAllStudentProfiles();
  assert.equal(rows(ss, 'StudentProfiles').length, p.length, 'a second run appends no one again');
});

test('updateAllStudentProfiles: nothing when Module 2 is off; refused for anyone but the script\'s owner', () => {
  const off = setup();
  off.props.setProperty('M2_ENABLED', 'false');
  off.exported.updateAllStudentProfiles();
  assert.equal(rows(off.ss, 'StudentProfiles').length, 0);
  assert.equal(off.props.getProperty('M2_STAGE1_LAST_RUN'), null);

  const stranger = setup({ viewer: 'someone@ccpsnet.net' });
  assert.throws(() => stranger.exported.updateAllStudentProfiles(), /Not authorized/);
  assert.equal(rows(stranger.ss, 'StudentProfiles').length, 0);
});

// ---------------------------------------------------------------------------
// buildUpcomingLessons (51)
// ---------------------------------------------------------------------------

test('buildUpcomingLessons, the trigger\'s entry point, writes the planned lessons, not a preview', () => {
  const { exported, ss, props } = setup();
  // A pacing unit covering the next weeks, so the plan has lessons to draft.
  const pg = ss.getSheetByName('PacingGuide');
  const start = new Date(TOMORROW.getFullYear(), TOMORROW.getMonth(), TOMORROW.getDate() - 10);
  const end = new Date(TOMORROW.getFullYear(), TOMORROW.getMonth(), TOMORROW.getDate() + 30);
  const headers = pg.getRange(1, 1, 1, pg.getLastColumn()).getValues()[0];
  const unit = { lesson_unit_id: 'T-8177', stage: '8', stage_name: 'Stage 8', lesson_unit_name: 'Event budgets',
    approx_start: ymd(start), approx_end: ymd(end), weeks: '6', overlap_type: '8177 only',
    objective_8177: 'Students plan an event.', competency_ids_8177: '8177-1,8177-2',
    key_vocabulary: 'budget', prior_lesson_connection: 'Ticket pricing.', warmup_anchor: 'Anchor for 8177.' };
  pg.appendRow(headers.map((h) => (unit[h] === undefined ? '' : unit[h])));

  const preview = exported.buildUpcomingLessonPlan_({ apply: false });
  const before = rows(ss, 'LessonContext').length;
  const r = exported.buildUpcomingLessons();
  assert.equal(r.apply, true, 'the trigger writes; it is not a preview');
  assert.ok(preview.planned.length > 0, 'the plan has lessons to draft');
  const drafted = preview.planned.filter((s) => !(s.date === ymd(TOMORROW) && s.period === '2')).length;
  assert.equal(r.written, drafted, JSON.stringify(r.failed));
  assert.equal(rows(ss, 'LessonContext').length, before + r.written);
  // Only on a weekday: run on a Friday or Saturday, tomorrow is a weekend
  // and the plan has no day to skip (failed on Friday 2026-11-20).
  if (TOMORROW.getDay() !== 0 && TOMORROW.getDay() !== 6) {
    assert.ok(r.skipped.some((s) => s.date === ymd(TOMORROW) && s.period === '2' && s.reason === 'LESSON_EXISTS'),
      'tomorrow\'s period 2 already has the teacher\'s lesson');
  }

  props.setProperty('M2_ENABLED', 'false');
  assert.equal(exported.buildUpcomingLessons().written, 0, 'nothing when Module 2 is off');
});
