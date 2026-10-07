'use strict';
// Tests for cas-ccps/scripts/51_CourseYearBuilder.js and the pacing-guide
// changes it relies on in 31_PacingGuideManager.js.
//
// Pins: the course data check against the repo's own files; the CCPS
// 2026-27 no-school copy staying in step with leader-hub's; course-aware
// unit resolution (an 8177 class during S8-U2, which overlaps 8175-only
// S7-U1, gets its own unit and warm-up anchor); Date cells in the
// PacingGuide tab read back as YYYY-MM-DD; and the lesson builder writing
// one lesson per school day and class period through onLessonContextSubmit_,
// skipping weekends, no-school days and any slot that already has a lesson,
// and writing nothing in a preview.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles, FakeDriveFolder } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const S = (f) => path.join(ROOT, 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '22_LessonContextHandler.js', '22b_CompetencyRegistryImporter.js',
  '23_StudentProfileManager.js', '24_WarmUpBridge.js', '26_CompetencyAlignmentLog.js',
  '27_LessonFrameGenerator.js', '31_PacingGuideManager.js', '32_CompetencyRubricImporter.js',
  '51_CourseYearBuilder.js', '55b_LessonAssignmentData.js', '55_LessonSchedule.js'].map(S);
const EXPOSE = ['checkCourseData', 'previewUpcomingLessons', 'buildUpcomingLessonPlan_', 'onLessonContextSubmit_',
  'resolveUnitForCourseDate_', 'getWarmUpAnchor_', '_loadPacingGuide_', 'installLessonPlanTrigger',
  'removeLessonPlanTrigger', 'CYB_NO_SCHOOL_2026_27', 'COURSE_DATA_EXPECTED', 'PG_HEADERS',
  'importCompetencyRegistry', 'competencyIdText_', 'removeDraftedLessons_', '_lessonPeriodText_'];

const TEACHER = 'teacher@ccpsnet.net';
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}
const REGISTRY = parseCsv(fs.readFileSync(path.join(ROOT, 'cas-ccps/data/CompetencyRegistry.csv'), 'utf8'));
const RUBRICS = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps/data/CompetencyRubrics.json'), 'utf8')).competency_rubrics;
const PACING = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps/curriculum/PacingGuide_CAS_Context.json'), 'utf8')).pacing_guide;

function setup(opts) {
  opts = opts || {};
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('CURRENT_TERM', '2026-27');
  props.setProperty('TEACHER_EMAIL', TEACHER);
  props.setProperty('TEACHER_NAME', 'Teacher');
  const folder = new FakeDriveFolder('Teacher', 'teacher-folder-1');
  sandbox.DriveApp._registerFolder(folder);
  props.setProperty('TEACHER_FOLDER_ID', folder.getId());

  ss.insertSheet('LessonContext').appendRow(['lesson_id', 'teacher_email', 'submitted_at', 'lesson_date',
    'period_or_class', 'activity_description', 'learning_objective', 'key_vocabulary',
    'prior_lesson_connection', 'competency_ids', 'status', 'alignment_logged_at', 'error_notes', 'term']);
  ss.insertSheet('AlignmentLog').appendRow(['log_id', 'lesson_id', 'logged_at', 'lesson_date', 'teacher_email',
    'learning_objective', 'competency_id', 'competency_text', 'strand']);
  const reg = ss.insertSheet('CompetencyRegistry');
  REGISTRY.forEach((r) => reg.appendRow(r));
  const rub = ss.insertSheet('CompetencyRubrics');
  rub.appendRow(['competency_id', 'course', 'task_number', 'duty_area', 'competency_text',
    'demonstration_standard', 'demonstration_indicators', 'skill_questions']);
  Object.values(RUBRICS).forEach((r) => rub.appendRow([r.competency_id, r.course, r.task_number, r.duty_area,
    r.competency_text, r.demonstration_standard, JSON.stringify(r.demonstration_indicators || []),
    JSON.stringify(r.skill_questions || [])]));

  const pg = ss.insertSheet('PacingGuide');
  pg.appendRow(exported.PG_HEADERS.slice());
  (opts.units || PACING).forEach((u) => pg.appendRow(exported.PG_HEADERS.map((h) => {
    const v = u[h];
    return v === undefined ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
  })));

  const cs = ss.insertSheet('ClassSchedule');
  cs.appendRow(['teacher_email', 'period', 'day_type', 'course_name', 'active']);
  (opts.schedule || []).forEach((r) => cs.appendRow(r));
  return { exported, sandbox, ss, props };
}

function rows(ss, tab) {
  const sh = ss.getSheetByName(tab);
  return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

// Two units covering the next 40 days, overlapping like S7-U1 / S8-U2.
function liveUnits() {
  return [
    { lesson_unit_id: 'T-8175', stage: '7', stage_name: 'Stage 7', lesson_unit_name: 'Promotion (8175)',
      approx_start: ymd(addDays(TODAY, -10)), approx_end: ymd(addDays(TODAY, 30)), overlap_type: '8175 only',
      objective_8175: 'Students plan a promotion.', objective_8177: '',
      competency_ids_8175: '8175-1,8175-2', competency_ids_8177: '', warmup_anchor: 'Anchor for 8175.',
      key_vocabulary: 'promotion', prior_lesson_connection: '' },
    { lesson_unit_id: 'T-8177', stage: '8', stage_name: 'Stage 8', lesson_unit_name: 'Event Planning (8177)',
      approx_start: ymd(addDays(TODAY, -5)), approx_end: ymd(addDays(TODAY, 30)), overlap_type: '8177 only',
      objective_8175: '', objective_8177: 'Students plan an event.',
      competency_ids_8175: '', competency_ids_8177: '8177-1,8177-2', warmup_anchor: 'Anchor for 8177.',
      key_vocabulary: 'event', prior_lesson_connection: '' },
  ];
}

const SCHEDULE = [
  [TEACHER, '1', 'DAILY', '8175 Sports Entertainment and Event Marketing', 'TRUE'],
  [TEACHER, '2', 'ODD', 'Sports Entertainment and Event Management', 'TRUE'],
  [TEACHER, '3', 'EVEN', '8177 Management', 'TRUE'],
  [TEACHER, '4', 'DAILY', 'Study Hall', 'TRUE'],
];

// The slots the builder should plan, computed independently.
function expectedSlots(noSchool) {
  const out = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(TODAY, i);
    if (d.getDay() === 0 || d.getDay() === 6 || (noSchool || []).includes(ymd(d))) continue;
    const odd = d.getDate() % 2 === 1;
    out.push([ymd(d), '1']);
    out.push([ymd(d), odd ? '2' : '3']);
  }
  return out;
}

// ── repo data ─────────────────────────────────────────────────────────

test('COURSE_DATA_EXPECTED matches the repo data files', () => {
  const { exported } = setup();
  const count = (ids) => ids.reduce((m, id) => { const c = id.split('-')[0]; m[c] = (m[c] || 0) + 1; return m; }, {});
  assert.deepEqual({ ...exported.COURSE_DATA_EXPECTED.registry }, count(REGISTRY.slice(1).map((r) => r[0])));
  assert.deepEqual({ ...exported.COURSE_DATA_EXPECTED.rubrics }, count(Object.values(RUBRICS).map((r) => r.competency_id)));
  assert.equal(exported.COURSE_DATA_EXPECTED.pacingUnits, PACING.length);
});

test('the CCPS 2026-27 no-school days match leader-hub\'s NO_SCHOOL_DEFAULT', () => {
  const { exported } = setup();
  const src = fs.readFileSync(path.join(ROOT, 'leader-hub/src/10-command-engine-ai-and-widgets.html'), 'utf8');
  const block = /const NO_SCHOOL_DEFAULT = \[([\s\S]*?)\];/.exec(src)[1];
  const lh = block.match(/\d{4}-\d{2}-\d{2}/g);
  assert.deepEqual([...exported.CYB_NO_SCHOOL_2026_27], lh);
});

test('checkCourseData: OK with the repo data loaded, and seeds NoSchoolDays', () => {
  const { exported, ss } = setup();
  const r = exported.checkCourseData();
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.equal(r.pacingUnits, 20);
  assert.equal(rows(ss, 'NoSchoolDays').length, exported.CYB_NO_SCHOOL_2026_27.length);
});

test('checkCourseData: names what is missing', () => {
  const { exported, ss } = setup();
  ss.getSheetByName('CompetencyRubrics').deleteRows(2, 5);
  const r = exported.checkCourseData();
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /CompetencyRubrics: 8175 has 108 row\(s\), expected 113/.test(p)), r.problems.join('; '));
});

// ── competency IDs Sheets stores as dates ─────────────────────────────
// Sheets reads "8175-1".."8175-12" as a year and month (seen live
// 2026-10-06: checkCourseData counted 101/96, and the registry import
// appended those 24 IDs again). The sandbox doesn't auto-convert, so these
// tests put the Date in the cell the way Sheets leaves it.
const sheetsDate = (id) => { const [y, m] = id.split('-').map(Number); return new Date(y, m - 1, 1); };
const dateShaped = (id) => /^\d{4}-(?:[1-9]|1[0-2])$/.test(id);

test('competencyIdText_: a Date cell reads back as its competency ID', () => {
  const { exported } = setup();
  assert.equal(exported.competencyIdText_(sheetsDate('8175-1')), '8175-1');
  assert.equal(exported.competencyIdText_(sheetsDate('8177-12')), '8177-12');
  assert.equal(exported.competencyIdText_(' 8175-45 '), '8175-45');
  assert.equal(exported.competencyIdText_(''), '');
});

test('checkCourseData: counts competency IDs that Sheets stored as dates', () => {
  const { exported, ss } = setup();
  ['CompetencyRegistry', 'CompetencyRubrics'].forEach((tab) => {
    ss.getSheetByName(tab).rows.slice(1).forEach((r) => { if (dateShaped(String(r[0]))) r[0] = sheetsDate(r[0]); });
  });
  assert.equal(ss.getSheetByName('CompetencyRegistry').rows.filter((r) => r[0] instanceof Date).length, 24);
  const r = exported.checkCourseData();
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('importCompetencyRegistry: turns Date IDs back into text and removes the rows a past import appended again', () => {
  const { exported, ss, sandbox, props } = setup();
  const reg = ss.getSheetByName('CompetencyRegistry');
  // The live state: the 24 date-shaped IDs stored as Dates, then appended
  // a second time (also as Dates) by an import that didn't recognize them.
  const mangled = reg.rows.slice(1).filter((r) => dateShaped(String(r[0])));
  mangled.forEach((r) => { r[0] = sheetsDate(r[0]); });
  mangled.forEach((r) => reg.appendRow([new Date(r[0].getTime())].concat(r.slice(1))));
  assert.equal(reg.getLastRow() - 1, 245);

  const csv = fs.readFileSync(path.join(ROOT, 'cas-ccps/data/CompetencyRegistry.csv'), 'utf8');
  const folder = sandbox.DriveApp.getFolderById(props.getProperty('TEACHER_FOLDER_ID'));
  folder.files.push({ name: 'CompetencyRegistry.csv', getName: () => 'CompetencyRegistry.csv',
    getId: () => 'csv-1', getBlob: () => ({ getDataAsString: () => csv }) });

  exported.importCompetencyRegistry();

  const ids = reg.rows.slice(1).map((r) => r[0]);
  assert.equal(ids.length, 221, 'the 24 re-appended rows are gone and nothing new is appended');
  assert.ok(ids.every((id) => typeof id === 'string'), 'every ID is text');
  assert.equal(new Set(ids).size, 221);
  assert.deepEqual(ids.slice().sort(), REGISTRY.slice(1).map((r) => r[0]).sort());
  assert.equal(exported.checkCourseData().ok, true);
});

// ── pacing guide reads ────────────────────────────────────────────────

test('_loadPacingGuide_ reads Date cells in approx_start/approx_end back as YYYY-MM-DD', () => {
  const { exported, ss } = setup();
  const sh = ss.getSheetByName('PacingGuide');
  sh.getRange(2, 5, 1, 2).setValues([[new Date(2026, 7, 25), new Date(2026, 8, 4)]]);
  const u = exported._loadPacingGuide_()[0];
  assert.equal(u.approx_start, '2026-08-25');
  assert.equal(u.approx_end, '2026-09-04');
});

test('an 8177 class during S8-U2 gets its own unit and warm-up anchor, not 8175-only S7-U1', () => {
  const { exported } = setup();
  const s8u2 = PACING.find((u) => u.lesson_unit_id === 'S8-U2');
  assert.equal(exported.resolveUnitForCourseDate_('2027-04-15', '8177').lesson_unit_id, 'S8-U2');
  assert.equal(exported.resolveUnitForCourseDate_('2027-04-15', '8175').lesson_unit_id, 'S7-U1');
  const a = exported.getWarmUpAnchor_('2027-04-15', 'Sports Entertainment and Event Management');
  assert.ok(a, 'used to be null: the first unit covering the date was 8175-only');
  assert.equal(a.unit_id, 'S8-U2');
  assert.equal(a.anchor, s8u2.warmup_anchor);
});

// ── lesson builder ────────────────────────────────────────────────────

test('previewUpcomingLessons plans one lesson per school day and meeting period, and writes nothing', () => {
  const { exported, ss } = setup({ units: liveUnits(), schedule: SCHEDULE });
  const r = exported.buildUpcomingLessonPlan_({ apply: false, today: TODAY });
  assert.deepEqual(r.planned.map((s) => [s.date, s.period]), expectedSlots());
  assert.ok(r.skipped.some((s) => s.reason === 'UNKNOWN_COURSE' && s.period === '4'), 'Study Hall is no course');
  assert.equal(rows(ss, 'LessonContext').length, 0);
  r.planned.forEach((s) => assert.equal(s.unit, s.period === '1' ? 'T-8175' : 'T-8177'));
});

test('buildUpcomingLessons writes each lesson through onLessonContextSubmit_, with its frame Doc', () => {
  const { exported, ss } = setup({ units: liveUnits(), schedule: SCHEDULE });
  const r = exported.buildUpcomingLessonPlan_({ apply: true, today: TODAY });
  const want = expectedSlots();
  assert.equal(r.written, want.length, JSON.stringify(r.failed));
  const lc = rows(ss, 'LessonContext');
  assert.equal(lc.length, want.length);
  lc.forEach((row) => {
    const is8175 = row[4] === '1';
    assert.equal(row[1], TEACHER);
    assert.equal(row[6], is8175 ? 'Students plan a promotion.' : 'Students plan an event.');
    assert.equal(row[9], is8175 ? '8175-1,8175-2' : '8177-1,8177-2');
    assert.match(row[5], /^Auto-drafted from the pacing guide: T-817[57]/);
    assert.match(row[5], /Warm-up: Anchor for 817[57]\./);
    assert.equal(row[10], 'FRAME_GENERATED', 'alignment logged and the Lesson Frame Doc made');
    assert.ok(row[16], 'frame Doc URL recorded');
  });

  const again = exported.buildUpcomingLessonPlan_({ apply: true, today: TODAY });
  assert.equal(again.written, 0, 'a second run adds nothing');
  assert.equal(rows(ss, 'LessonContext').length, want.length);
});

test('a slot that already has a lesson is left alone, and a no-school day is skipped', () => {
  const firstSchoolDay = expectedSlots()[0][0];
  const { exported, ss } = setup({ units: liveUnits(), schedule: SCHEDULE });
  ss.getSheetByName('NoSchoolDays') || ss.insertSheet('NoSchoolDays');
  const ns = ss.getSheetByName('NoSchoolDays');
  ns.appendRow(['date', 'note']);
  ns.appendRow([firstSchoolDay, 'snow day']);

  const secondDay = expectedSlots([firstSchoolDay])[0][0];
  const mine = exported.onLessonContextSubmit_({ teacherEmail: TEACHER, lessonDate: secondDay, periodOrClass: '1',
    activityDescription: 'My own lesson.', learningObjective: 'Mine.', competencyIds: '8175-1' });
  assert.equal(mine.success, true);

  const r = exported.buildUpcomingLessonPlan_({ apply: true, today: TODAY });
  assert.ok(r.skipped.some((s) => s.date === firstSchoolDay && s.reason === 'NO_SCHOOL'));
  assert.ok(r.skipped.some((s) => s.date === secondDay && s.period === '1' && s.reason === 'LESSON_EXISTS'));
  const lc = rows(ss, 'LessonContext');
  assert.ok(!lc.some((row) => row[3] === firstSchoolDay), 'nothing written on the snow day');
  const slot = lc.filter((row) => row[3] === secondDay && row[4] === '1');
  assert.equal(slot.length, 1, 'the teacher\'s lesson is the only one in that slot');
  assert.equal(slot[0][6], 'Mine.');
  assert.notEqual(slot[0][10], 'SUPERSEDED');
});

test('nothing is built when Module 2 is off', () => {
  const { exported, ss, props } = setup({ units: liveUnits(), schedule: SCHEDULE });
  props.setProperty('M2_ENABLED', 'false');
  const r = exported.buildUpcomingLessonPlan_({ apply: true, today: TODAY });
  assert.equal(r.written, 0);
  assert.match(r.message, /M2_ENABLED/);
  assert.equal(rows(ss, 'LessonContext').length, 0);
});

test('installLessonPlanTrigger installs one daily trigger, once', () => {
  const { exported, sandbox } = setup();
  assert.equal(exported.installLessonPlanTrigger(), true);
  assert.equal(exported.installLessonPlanTrigger(), false);
  const handlers = sandbox.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  assert.deepEqual(handlers.filter((h) => h === 'buildUpcomingLessons'), ['buildUpcomingLessons']);
  assert.equal(exported.removeLessonPlanTrigger(), 1);
});

// ── shared periods: 8175 and 8177 in the same period, different students ──

const SHARED_SCHEDULE = [
  [TEACHER, '1', 'DAILY', 'Sports Entertainment and Event Marketing', 'TRUE'],
  [TEACHER, '1', 'DAILY', 'Sports Entertainment and Event Management', 'TRUE'],
];

function schoolDays() {
  return expectedSlots().filter((s) => s[1] === '1').map((s) => s[0]);
}

test('a period where both courses meet gets one lesson per course, keyed by course', () => {
  const { exported, ss } = setup({ units: liveUnits(), schedule: SHARED_SCHEDULE });
  const preview = exported.buildUpcomingLessonPlan_({ apply: false, today: TODAY });
  const want = [];
  schoolDays().forEach((d) => { want.push([d, '1 (8175)']); want.push([d, '1 (8177)']); });
  assert.deepEqual(preview.planned.map((s) => [s.date, s.period]), want);

  const r = exported.buildUpcomingLessonPlan_({ apply: true, today: TODAY });
  assert.equal(r.written, want.length, 'used to write only the first course: the second read LESSON_EXISTS');
  rows(ss, 'LessonContext').forEach((row) => {
    assert.equal(row[6], row[4] === '1 (8175)' ? 'Students plan a promotion.' : 'Students plan an event.');
  });
  assert.equal(exported.buildUpcomingLessonPlan_({ apply: true, today: TODAY }).written, 0);
});

test('in a shared period, a lesson the teacher entered for the whole period wins over both drafts', () => {
  const { exported, ss } = setup({ units: liveUnits(), schedule: SHARED_SCHEDULE });
  const day = schoolDays()[0];
  exported.onLessonContextSubmit_({ teacherEmail: TEACHER, lessonDate: day, periodOrClass: '1',
    activityDescription: 'Both groups together.', learningObjective: 'Mine.', competencyIds: '8175-1' });
  exported.buildUpcomingLessonPlan_({ apply: true, today: TODAY });
  const slot = rows(ss, 'LessonContext').filter((row) => row[3] === day);
  assert.deepEqual(slot.map((row) => row[4]), ['1']);
});

test('_lessonPeriodText_: a period Sheets stored as a date reads back as written', () => {
  const { exported } = setup();
  // Sheets reads "1-8177" as January 8177 (seen live: a second build wrote every lesson again).
  assert.equal(exported._lessonPeriodText_(new Date(8177, 0, 1)), '1-8177');
  assert.equal(exported._lessonPeriodText_(3), '3');
  assert.equal(exported._lessonPeriodText_(' 1 (8175) '), '1 (8175)');
});

// ── unbuild ───────────────────────────────────────────────────────────

test('removeDraftedLessons_ supersedes drafts from today on and trashes their Docs; the teacher\'s and past ones stay', () => {
  const { exported, ss, sandbox } = setup({ units: liveUnits(), schedule: SHARED_SCHEDULE });
  const days = schoolDays();
  exported.onLessonContextSubmit_({ teacherEmail: TEACHER, lessonDate: days[1], periodOrClass: '1',
    activityDescription: 'My own lesson.', learningObjective: 'Mine.', competencyIds: '8175-1' });
  exported.buildUpcomingLessonPlan_({ apply: true, today: TODAY });
  const lcSheet = ss.getSheetByName('LessonContext');
  // One draft moved into the past: before today, so left alone.
  const pastRow = rows(ss, 'LessonContext').findIndex((r) => r[4] === '1 (8175)' && r[3] === days[0]) + 2;
  lcSheet.getRange(pastRow, 4).setValue(ymd(addDays(TODAY, -1)));

  const drafts = () => rows(ss, 'LessonContext').filter((r) => String(r[5]).indexOf('Auto-drafted') === 0);
  const liveDrafts = drafts().filter((r) => r[3] >= ymd(TODAY));
  const preview = exported.removeDraftedLessons_({ apply: false, today: TODAY });
  assert.equal(preview.rows.length, liveDrafts.length);
  assert.ok(drafts().every((r) => r[10] !== 'SUPERSEDED'), 'a dry run changes nothing');

  const r = exported.removeDraftedLessons_({ apply: true, today: TODAY });
  assert.equal(r.superseded, liveDrafts.length);
  assert.equal(r.docsTrashed, liveDrafts.length);
  liveDrafts.forEach((d) => assert.equal(sandbox.DriveApp.getFileById(d[15]).isTrashed(), true));
  drafts().forEach((d) => assert.equal(d[10] === 'SUPERSEDED', d[3] >= ymd(TODAY)));
  const mine = rows(ss, 'LessonContext').find((x) => x[5] === 'My own lesson.');
  assert.notEqual(mine[10], 'SUPERSEDED');

  // The slots are free again.
  const again = exported.buildUpcomingLessonPlan_({ apply: false, today: TODAY });
  assert.equal(again.planned.length, liveDrafts.length + 1, 'the past draft\'s slot is drafted again too');
});
