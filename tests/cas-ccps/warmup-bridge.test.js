'use strict';
// Regression tests for 24_WarmUpBridge.js's getPriorWarmUpResponse_() —
// the exact function whose truthiness drives the Flow 5 ordering fix
// (Step 6 of the Studio Steps adoption): buildWarmUpQueues() now writes
// `row[WQ24_STATUS] = priorResponse ? "PENDING_BRIDGE" : "PENDING"`, so
// this function's return value is what decides whether a row goes
// through Flow 5 first or straight to Flow 3.
//
// Loaded together with 22_LessonContextHandler.js because
// getPriorWarmUpResponse_ calls that file's own _normalizeLessonDateCell_
// (both bound to the same GAS project, cas-ccps:central-ledger — see
// tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LESSON_CONTEXT_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '22_LessonContextHandler.js');
const WARMUP_BRIDGE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '24_WarmUpBridge.js');
// formatDateYMD_, which _normalizeLessonDateCell_ calls for a Date cell. Same
// Central Ledger project in production.
const PROFILE_MANAGER_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '23_StudentProfileManager.js');

function load() {
  return loadGasFiles([LESSON_CONTEXT_PATH, WARMUP_BRIDGE_PATH, PROFILE_MANAGER_PATH], [
    'getPriorWarmUpResponse_',
    'WQ24_QUEUE_ID', 'WQ24_LESSON_ID', 'WQ24_STUDENT_EMAIL', 'WQ24_LESSON_DATE',
    'WQ24_STATUS', 'WQ24_TOTAL_SCORE', 'WQ24_RESPONSE_TEXT',
  ]);
}

// WarmUpQueue columns used by getPriorWarmUpResponse_ (see WQ24_* in
// 24_WarmUpBridge.js): STUDENT_EMAIL, STATUS, LESSON_ID, LESSON_DATE,
// RESPONSE_TEXT, TOTAL_SCORE, QUEUE_ID. Built with real field names
// rather than indices so this test survives a column reorder — resolved
// against the actual WQ24_* export instead of hardcoded numbers.
function makeRowBuilder(exported) {
  return function row({ email = 'student@example.com', status = 'SCORED', lessonId = 'old-lesson',
                        lessonDate = '2026-01-01', responseText = 'A real warm-up response here.',
                        totalScore = 4, queueId = 'WUQ-1' } = {}) {
    const arr = new Array(21).fill('');
    arr[exported.WQ24_STUDENT_EMAIL] = email;
    arr[exported.WQ24_STATUS] = status;
    arr[exported.WQ24_LESSON_ID] = lessonId;
    arr[exported.WQ24_LESSON_DATE] = lessonDate;
    arr[exported.WQ24_RESPONSE_TEXT] = responseText;
    arr[exported.WQ24_TOTAL_SCORE] = totalScore;
    arr[exported.WQ24_QUEUE_ID] = queueId;
    return arr;
  };
}

test('getPriorWarmUpResponse_: a real prior SCORED response returns a truthy result (drives PENDING_BRIDGE)', () => {
  const { exported } = load();
  const row = makeRowBuilder(exported);
  const data = [['header'], row()];
  const result = exported.getPriorWarmUpResponse_(data, 'student@example.com', 'today-lesson');
  assert.ok(result, 'a real prior scored response must return truthy, not null');
  assert.equal(result.totalScore, 4);
  assert.equal(result.queueId, 'WUQ-1');
});

test('getPriorWarmUpResponse_: no rows at all for the student returns null (drives plain PENDING)', () => {
  const { exported } = load();
  const result = exported.getPriorWarmUpResponse_([['header']], 'student@example.com', 'today-lesson');
  assert.equal(result, null);
});

test('getPriorWarmUpResponse_: excludes rows from the current lesson itself', () => {
  const { exported } = load();
  const row = makeRowBuilder(exported);
  const data = [['header'], row({ lessonId: 'today-lesson' })];
  const result = exported.getPriorWarmUpResponse_(data, 'student@example.com', 'today-lesson');
  assert.equal(result, null, "today's own lesson row must never count as a prior response");
});

test('getPriorWarmUpResponse_: excludes a non-SCORED row (e.g. still PENDING or DELIVERED)', () => {
  const { exported } = load();
  const row = makeRowBuilder(exported);
  const data = [['header'], row({ status: 'DELIVERED' })];
  const result = exported.getPriorWarmUpResponse_(data, 'student@example.com', 'today-lesson');
  assert.equal(result, null);
});

test('getPriorWarmUpResponse_: excludes an empty or too-short response', () => {
  const { exported } = load();
  const row = makeRowBuilder(exported);
  const data = [['header'], row({ responseText: 'short' })];
  const result = exported.getPriorWarmUpResponse_(data, 'student@example.com', 'today-lesson');
  assert.equal(result, null);
});

test('getPriorWarmUpResponse_: excludes a different student\'s row (case-insensitive email match)', () => {
  const { exported } = load();
  const row = makeRowBuilder(exported);
  const data = [['header'], row({ email: 'OTHER@Example.com' })];
  const result = exported.getPriorWarmUpResponse_(data, 'student@example.com', 'today-lesson');
  assert.equal(result, null);

  const data2 = [['header'], row({ email: 'Student@Example.COM' })];
  const result2 = exported.getPriorWarmUpResponse_(data2, 'student@example.com', 'today-lesson');
  assert.ok(result2, 'matching email must be case-insensitive');
});

test('getPriorWarmUpResponse_: picks the most recent of several qualifying rows, by lesson date', () => {
  const { exported } = load();
  const row = makeRowBuilder(exported);
  const data = [
    ['header'],
    row({ lessonId: 'lesson-1', lessonDate: '2026-01-01', queueId: 'WUQ-OLD' }),
    row({ lessonId: 'lesson-2', lessonDate: '2026-01-15', queueId: 'WUQ-NEWEST' }),
    row({ lessonId: 'lesson-3', lessonDate: '2026-01-08', queueId: 'WUQ-MIDDLE' }),
  ];
  const result = exported.getPriorWarmUpResponse_(data, 'student@example.com', 'today-lesson');
  assert.equal(result.queueId, 'WUQ-NEWEST');
});

test('getPriorWarmUpResponse_: caps responseText at 800 characters for the snapshot', () => {
  const { exported } = load();
  const row = makeRowBuilder(exported);
  const longText = 'x'.repeat(1000);
  const data = [['header'], row({ responseText: longText })];
  const result = exported.getPriorWarmUpResponse_(data, 'student@example.com', 'today-lesson');
  assert.equal(result.responseText.length, 800);
});

test('getPriorWarmUpResponse_: a Date-coerced lesson_date cell (Sheets auto-conversion) is still handled correctly', () => {
  const { exported } = load();
  const row = makeRowBuilder(exported);
  // Simulates Sheets silently storing an ISO date string as a real Date
  // object (see _normalizeLessonDateCell_'s own header comment on why
  // this happens and what it breaks if unhandled).
  const data = [['header'], row({ lessonDate: new Date('2026-01-01T00:00:00') })];
  const result = exported.getPriorWarmUpResponse_(data, 'student@example.com', 'today-lesson');
  assert.ok(result, 'a Date-coerced lesson_date cell must still be recognized as a qualifying row');
});

// ── shared periods (8175 and 8177 in the same period, different students) ──

function loadShared() {
  return loadGasFiles([LESSON_CONTEXT_PATH, WARMUP_BRIDGE_PATH, PROFILE_MANAGER_PATH], [
    'findLesson_', 'getEnrolledStudents_', 'sharedPeriods_', 'lessonPeriodKey_', 'courseCodeFromName_',
  ]);
}

test('sharedPeriods_ / lessonPeriodKey_: only a period with two courses is keyed by course', () => {
  const { exported } = loadShared();
  const meeting = [
    { period: '1', courseName: 'Sports Entertainment and Event Marketing' },
    { period: '1', courseName: 'Sports Entertainment and Event Management' },
    { period: '3', courseName: '8175 Marketing' },
  ];
  const shared = exported.sharedPeriods_(meeting);
  assert.deepEqual([...shared], ['1']);
  assert.equal(exported.lessonPeriodKey_('1', meeting[0].courseName, true), '1 (8175)');
  assert.equal(exported.lessonPeriodKey_('1', meeting[1].courseName, true), '1 (8177)');
  assert.equal(exported.lessonPeriodKey_('3', meeting[2].courseName, false), '3');
});

test('findLesson_: with a list of keys, the most recent matching row wins', () => {
  const { exported } = loadShared();
  const lc = (id, period, status) => {
    const r = new Array(15).fill('');
    r[0] = id; r[1] = 'teacher@ccpsnet.net'; r[3] = '2026-10-07'; r[4] = period; r[10] = status || 'RECEIVED';
    return r;
  };
  const data = [['header'], lc('draft-8175', '1 (8175)'), lc('draft-8177', '1 (8177)'), lc('mine', '1')];
  assert.equal(exported.findLesson_(data, 'teacher@ccpsnet.net', ['1 (8175)', '1'], '2026-10-07').lessonId, 'mine');
  assert.equal(exported.findLesson_(data.slice(0, 3), 'teacher@ccpsnet.net', ['1 (8177)', '1'], '2026-10-07').lessonId,
    'draft-8177');
  assert.equal(exported.findLesson_(data, 'teacher@ccpsnet.net', '1 (8175)', '2026-10-07').lessonId, 'draft-8175');
});

test('getEnrolledStudents_: a course code keeps only that course\'s students in the period', () => {
  const { exported } = loadShared();
  const st = (email, course) => {
    const r = new Array(19).fill('');
    r[1] = email; r[4] = 'Student'; r[8] = 'teacher@ccpsnet.net'; r[10] = course; r[11] = '1'; r[12] = 'ACTIVE';
    return r;
  };
  const data = [['header'], st('a@x', 'Sports Entertainment and Event Marketing'),
    st('b@x', 'Sports Entertainment and Event Management'), st('c@x', '')];
  const emails = (code) => exported.getEnrolledStudents_(data, 'teacher@ccpsnet.net', '1', '', code).map((s) => s.email);
  assert.deepEqual(emails('8175'), ['a@x']);
  assert.deepEqual(emails('8177'), ['b@x']);
  assert.deepEqual(emails(''), ['a@x', 'b@x', 'c@x'], 'no code: every student in the period, as before');
});

// ── 23's shadow matrix records archetypes (P0-02) ────────────────────────────
//
// updateShadowMatrix_ keys archetypes by queue_id (column 0) but used to look
// each score up by lesson_id, which never matches: archetype_history stayed
// empty, best_archetype null, and the early-unit rule gave every student
// BRIDGE. resolveUnitForDate_ lives in 31; it is stubbed to one unit here.

function loadProfile() {
  return loadGasFiles([LESSON_CONTEXT_PATH, WARMUP_BRIDGE_PATH, PROFILE_MANAGER_PATH], [
    'buildWarmupData_', 'updateShadowMatrix_',
    'WQ23_QUEUE_ID', 'WQ23_LESSON_ID', 'WQ23_STUDENT_EMAIL', 'WQ23_LESSON_DATE',
    'WQ23_STATUS', 'WQ23_ENGAGEMENT_SCORE', 'WQ23_ARCHETYPE',
  ]);
}

function shadowQueue(exported, specs) {
  const header = new Array(21).fill('h');
  return [header].concat(specs.map((s) => {
    const r = new Array(21).fill('');
    r[exported.WQ23_QUEUE_ID] = s.queueId;
    r[exported.WQ23_LESSON_ID] = s.lessonId;
    r[exported.WQ23_STUDENT_EMAIL] = s.email || 'ada@example.invalid';
    r[exported.WQ23_LESSON_DATE] = s.date;
    r[exported.WQ23_STATUS] = 'SCORED';
    r[exported.WQ23_ENGAGEMENT_SCORE] = s.engagement;
    r[exported.WQ23_ARCHETYPE] = s.archetype || '';
    return r;
  }));
}

const SHADOW_SPECS = [
  { queueId: 'WUQ-1', lessonId: 'LES-1', date: '2026-10-20', engagement: 3, archetype: 'PARADOX' },
  { queueId: 'WUQ-2', lessonId: 'LES-2', date: '2026-10-22', engagement: 3, archetype: 'PARADOX' },
  { queueId: 'WUQ-3', lessonId: 'LES-3', date: '2026-10-24', engagement: 1, archetype: 'BRIDGE' },
  // No archetype recorded: never logged as UNKNOWN.
  { queueId: 'WUQ-4', lessonId: 'LES-4', date: '2026-10-26', engagement: 2 },
  // Another student's row must not leak in.
  { queueId: 'WUQ-9', lessonId: 'LES-1', date: '2026-10-20', engagement: 0,
    archetype: 'PROVOCATION', email: 'other@example.invalid' },
];

test('scores carry their queue_id, so the shadow matrix can find their archetype', () => {
  const { exported } = loadProfile();
  const data = exported.buildWarmupData_(shadowQueue(exported, SHADOW_SPECS));
  assert.deepEqual(data['ada@example.invalid'].scores.map((s) => s.queue_id),
    ['WUQ-1', 'WUQ-2', 'WUQ-3', 'WUQ-4']);
});

test('updateShadowMatrix_ logs each recorded archetype and picks the best', () => {
  const { exported, sandbox } = loadProfile();
  sandbox.resolveUnitForDate_ = () => ({ unit_id: 'S1-U2' });
  const wq = shadowQueue(exported, SHADOW_SPECS);
  const scores = exported.buildWarmupData_(wq)['ada@example.invalid'].scores;
  const unit = exported.updateShadowMatrix_('ada@example.invalid', {}, scores, wq)['S1-U2'];

  assert.deepEqual(unit.archetype_history.map((h) => [h.warmup_id, h.archetype]),
    [['WUQ-1', 'PARADOX'], ['WUQ-2', 'PARADOX'], ['WUQ-3', 'BRIDGE']]);
  assert.equal(unit.best_archetype, 'PARADOX');
  assert.equal(unit.within_confidence, 3 / 8,
    'three logged warm-ups: past the 0.3 early-unit floor, so BRIDGE is no longer forced');
});

test('updateShadowMatrix_ is idempotent across nightly runs', () => {
  const { exported, sandbox } = loadProfile();
  sandbox.resolveUnitForDate_ = () => ({ unit_id: 'S1-U2' });
  const wq = shadowQueue(exported, SHADOW_SPECS);
  const scores = exported.buildWarmupData_(wq)['ada@example.invalid'].scores;
  const first = exported.updateShadowMatrix_('ada@example.invalid', {}, scores, wq);
  const second = exported.updateShadowMatrix_('ada@example.invalid', first, scores, wq);
  assert.equal(second['S1-U2'].archetype_history.length, 3);
});

// P0-05: units are ordered by stage then unit number, so the newest unit gets
// the full decay weight even past S9 or U9.
test('compareUnitIds_ orders units numerically, not alphabetically', () => {
  const { sandbox } = loadProfile();
  const ids = ['S10-U1', 'S1-U10', 'S2-U1', 'S1-U2', 'S0-U3', 'misc'];
  assert.deepEqual(ids.slice().sort(sandbox.compareUnitIds_),
    ['S0-U3', 'S1-U2', 'S1-U10', 'S2-U1', 'S10-U1', 'misc']);
});

test('cross_confidence weights the numerically newest unit most', () => {
  const { exported, sandbox } = loadProfile();
  // S1-U10 is newer than S1-U2; alphabetically it would sort first and get
  // the smaller weight. Full new unit (1.0) + empty older unit (0): newest
  // weighted 1, older 0.85 → 1 / 1.85 ≈ 0.54. Reversed it would be 0.46.
  const matrix = {
    'S1-U2':  { archetype_history: [], within_confidence: 0, cross_confidence: 0, trend: 'flat' },
    'S1-U10': { archetype_history: [], within_confidence: 1, cross_confidence: 0, trend: 'flat' },
  };
  sandbox.resolveUnitForDate_ = () => null;
  const out = exported.updateShadowMatrix_('ada@example.invalid', matrix, [], [new Array(21).fill('h')]);
  assert.equal(out['S1-U10'].cross_confidence, 0.54);
});
