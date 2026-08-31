'use strict';
// Regression tests for 27_LessonFrameGenerator.js.
//
// This closes a specific, long-documented gap: 22_LessonContextHandler.js's
// onLessonContextSubmit_() has returned frameDocUrl: null since it was
// written ("frameDocUrl is null until Script 27 is built"), and
// 07_TeacherDashboard.js's client already opens that URL the moment it's
// non-null. Both files needed zero changes beyond this one existing and
// being wired in — these tests exercise the wiring through
// onLessonContextSubmit_() itself, not just generateLessonFrame_() in
// isolation, so a broken hookup would actually fail a test here.
//
// Loaded together with 00_SharedConfig.js (getConfig_, LC_* constants come
// from 22_LessonContextHandler.js which is loaded alongside),
// 22_LessonContextHandler.js (the LC_* schema and the real call site),
// 26_CompetencyAlignmentLog.js (logAlignmentForLesson_, registerReport_ —
// this file's registration call reuses that function directly), and
// 32_CompetencyRubricImporter.js (getRubricsForLesson_) — matching how
// these five files actually share one GAS project scope (see
// tools/gas-lint/project-map.json's cas-ccps:teacher-dashboard entry,
// which is exactly this set plus 07/23/29/31/36).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, FakeDriveFolder } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const PATHS = [
  path.join(SCRIPTS, '00_SharedConfig.js'),
  path.join(SCRIPTS, '22_LessonContextHandler.js'),
  path.join(SCRIPTS, '26_CompetencyAlignmentLog.js'),
  path.join(SCRIPTS, '32_CompetencyRubricImporter.js'),
  path.join(SCRIPTS, '27_LessonFrameGenerator.js'),
];
const EXPORTS = ['onLessonContextSubmit_', 'generateLessonFrame_'];

function load() {
  return loadGasFiles(PATHS, EXPORTS);
}

function setUpFixture(sandbox, opts) {
  const options = opts || {};
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('CURRENT_TERM', '2025-26 S2');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  props.setProperty('TEACHER_NAME', 'Ms. Smith');

  let teacherFolder = null;
  if (options.withTeacherFolder !== false) {
    teacherFolder = new FakeDriveFolder('Ms. Smith', 'teacher-folder-1');
    sandbox.DriveApp._registerFolder(teacherFolder);
    props.setProperty('TEACHER_FOLDER_ID', teacherFolder.getId());
  }

  const lc = ss.insertSheet('LessonContext');
  lc.appendRow([
    'lesson_id', 'teacher_email', 'submitted_at', 'lesson_date',
    'period_or_class', 'activity_description', 'learning_objective',
    'key_vocabulary', 'prior_lesson_connection', 'competency_ids',
    'status', 'alignment_logged_at', 'error_notes', 'term',
  ]);

  const al = ss.insertSheet('AlignmentLog');
  al.appendRow([
    'log_id', 'lesson_id', 'logged_at', 'lesson_date',
    'teacher_email', 'learning_objective', 'competency_id',
    'competency_text', 'strand',
  ]);

  const reg = ss.insertSheet('CompetencyRegistry');
  reg.appendRow(['competency_id', 'competency_text', 'subject', 'grade_band', 'strand', 'teacher_email', 'active']);
  (options.registryRows || [
    ['8175-1', 'Demonstrate professional communication', 'Marketing', '9-12', 'Communication', '', 'TRUE'],
    ['8175-2', 'Analyze a target market', 'Marketing', '9-12', 'Research', '', 'TRUE'],
  ]).forEach((r) => reg.appendRow(r));

  const rubrics = ss.insertSheet('CompetencyRubrics');
  rubrics.appendRow([
    'competency_id', 'course', 'task_number', 'duty_area',
    'competency_text', 'demonstration_standard',
    'demonstration_indicators', 'skill_questions',
  ]);
  (options.rubricRows || [
    ['8175-1', 'Marketing', 1, 'Communication', 'Demonstrate professional communication', '', '[]', '["Q1"]'],
    ['8175-2', 'Marketing', 2, 'Research', 'Analyze a target market', '', '[]', '["Q1"]'],
  ]).forEach((r) => rubrics.appendRow(r));

  return { ss, lc, al, reg, rubrics, teacherFolder };
}

// A fixed calendar date would eventually fail
// validateLessonPayload_()'s "more than 30 days in the past" guard once
// enough real wall-clock time passes — this stays valid indefinitely.
function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function submitLesson(exported, overrides) {
  return exported.onLessonContextSubmit_(Object.assign({
    teacherEmail: 'teacher@ccpsnet.net',
    teacherName: 'Ms. Smith',
    lessonDate: todayIso(),
    periodOrClass: '3',
    activityDescription: 'Students role-play a sales pitch.',
    learningObjective: 'Students will demonstrate a persuasive pitch.',
    keyVocabulary: 'pitch, persuasion',
    priorLessonConnection: 'Builds on yesterday\'s market research lesson.',
    competencyIds: '8175-1,8175-2',
  }, overrides || {}));
}

function lcRow(lc) {
  return lc.getRange(2, 1, 1, 17).getValues()[0];
}

// ── End-to-end through the real hook ─────────────────────────────────────

test('a real submission populates frameDocUrl — the hook 07_TeacherDashboard.js has been waiting on', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  const result = submitLesson(exported);
  assert.equal(result.success, true);
  assert.ok(result.frameDocUrl, 'frameDocUrl must be populated, not null, on a normal submission');
  assert.match(result.frameDocUrl, /^https:\/\/docs\.google\.com\/document\/d\//);
});

test('the LessonContext row advances to FRAME_GENERATED with the doc columns filled in', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  const result = submitLesson(exported);

  const row = lcRow(fx.lc);
  assert.equal(row[10], 'FRAME_GENERATED'); // status
  assert.ok(row[14]); // frame_doc_id
  assert.equal(row[15], result.frameDocUrl); // frame_doc_url
  assert.ok(row[16] instanceof sandbox.Date); // frame_generated_at
});

test('the doc lands in the teacher folder, not Drive root', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  submitLesson(exported);
  assert.equal(fx.teacherFolder.files.length, 1);
});

test('with no TEACHER_FOLDER_ID configured, the doc still generates, in Drive root', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox, { withTeacherFolder: false });
  const result = submitLesson(exported);
  assert.equal(result.success, true);
  assert.ok(result.frameDocUrl);
});

// ── Content ───────────────────────────────────────────────────────────────

function docTextFor(sandbox, docId) {
  return sandbox.DocumentApp._docs.get(docId).getBody().getText();
}

test('the doc contains the objective, activity, and competency alignment', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  const result = submitLesson(exported);
  const row = lcRow(fx.lc);
  const text = docTextFor(sandbox, row[14]);

  assert.match(text, /Students will demonstrate a persuasive pitch\./);
  assert.match(text, /Students role-play a sales pitch\./);
  assert.match(text, /8175-1/);
  assert.match(text, /Demonstrate professional communication/);
  assert.match(text, /8175-2/);
  assert.match(text, /Analyze a target market/);
});

test('a blank prior-lesson connection omits that section entirely', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  submitLesson(exported, { priorLessonConnection: '' });
  const row = lcRow(fx.lc);
  const text = docTextFor(sandbox, row[14]);
  assert.ok(!/Connection to Prior Lesson/.test(text),
    'the section header itself must not appear when the field is blank');
});

test('a non-blank prior-lesson connection is included', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  submitLesson(exported);
  const row = lcRow(fx.lc);
  const text = docTextFor(sandbox, row[14]);
  assert.match(text, /Connection to Prior Lesson/);
  assert.match(text, /Builds on yesterday's market research lesson\./);
});

test('a competency ID missing from the rubric tab is noted, not silently dropped', () => {
  // getRubricsForLesson_() itself silently omits an ID it can't find (only
  // a Logger.log warning) — this is the behaviour that would otherwise make
  // a frame quietly show fewer competencies than the teacher actually
  // selected. Uses an ID present in CompetencyRegistry (so
  // validateLessonPayload_ accepts it) but absent from CompetencyRubrics
  // (so the rubric lookup itself misses it) — the two tabs this codebase
  // keeps deliberately separate, per 32_CompetencyRubricImporter.js's own
  // header.
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, {
    registryRows: [
      ['8175-1', 'Demonstrate professional communication', 'Marketing', '9-12', 'Communication', '', 'TRUE'],
      ['8175-3', 'A competency with no rubric row yet', 'Marketing', '9-12', 'Research', '', 'TRUE'],
    ],
  });
  const result = submitLesson(exported, { competencyIds: '8175-1,8175-3' });
  assert.equal(result.success, true);
  const row = lcRow(fx.lc);
  const text = docTextFor(sandbox, row[14]);
  assert.match(text, /8175-3/);
  assert.match(text, /not found in the competency registry/);
});

test('the warm-up section always appears with a labeled placeholder, never a fabricated value', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  submitLesson(exported);
  const row = lcRow(fx.lc);
  const text = docTextFor(sandbox, row[14]);
  assert.match(text, /Suggested Warm-Up/);
  assert.match(text, /Generated separately by the nightly warm-up flow/);
});

// ── Registration ─────────────────────────────────────────────────────────

test('ReportRegistry gets a row with report_type LESSON_FRAME', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  const result = submitLesson(exported);

  const rr = fx.ss.getSheetByName('ReportRegistry');
  assert.ok(rr, 'registerReport_() must self-heal the ReportRegistry tab if missing');
  const rows = rr.getDataRange().getValues();
  assert.equal(rows.length, 2, 'header + one row');
  assert.equal(rows[1][5], result.frameDocUrl); // doc_url
  assert.equal(rows[1][6], 'LESSON_FRAME'); // report_type
});

test('registerReport_ widening: Script 26 report still registers as ALIGNMENT_TERM', () => {
  // registerReport_() gained an 8th, optional reportType parameter. Its
  // one pre-existing call site (generateAlignmentReport(), 7 args) must
  // still default to ALIGNMENT_TERM. Loaded with generateAlignmentReport
  // exported alongside the usual names, so this exercises a real call
  // rather than just inspecting the source.
  const { loadGasFiles: reload } = require('../harness/gas-sandbox');
  const { exported, sandbox } = reload(PATHS, ['generateAlignmentReport', 'onLessonContextSubmit_']);
  const fx = setUpFixture(sandbox);
  fx.al.appendRow(['LOG-1', 'LES-1', new sandbox.Date(), '2026-03-01',
    'teacher@ccpsnet.net', 'Prior objective', '8175-1',
    'Demonstrate professional communication', 'Communication']);

  const result = exported.generateAlignmentReport();
  assert.ok(result && result.docId, 'the alignment report itself must still be generated');

  const rr = fx.ss.getSheetByName('ReportRegistry');
  const rows = rr.getDataRange().getValues();
  assert.equal(rows[1][6], 'ALIGNMENT_TERM',
    'the pre-existing call site must keep defaulting to ALIGNMENT_TERM after the reportType param was added');
});

// ── Idempotency and failure handling ────────────────────────────────────

test('a second call for the same lesson does not create a second doc', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  const result = submitLesson(exported);
  const row = lcRow(fx.lc);
  const lessonId = row[0];

  const second = exported.generateLessonFrame_(lessonId);
  assert.equal(second.success, true);
  assert.equal(second.docUrl, result.frameDocUrl,
    'a repeat call must return the existing doc, not mint a new one');

  const rr = fx.ss.getSheetByName('ReportRegistry');
  assert.equal(rr.getDataRange().getValues().length, 2, 'still only one registry row');
});

test('a row not yet ALIGNMENT_LOGGED is skipped, not treated as an error', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  fx.lc.appendRow([
    'LES-PENDING', 'teacher@ccpsnet.net', new sandbox.Date(), '2026-03-03',
    '4', 'Activity', 'Objective', '', '', '8175-1',
    'RECEIVED', '', '', '2025-26 S2',
  ]);
  const result = exported.generateLessonFrame_('LES-PENDING');
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
});

test('a submission still succeeds and reports frameDocUrl null when frame generation throws', () => {
  // Simulate a DocumentApp failure the same way this codebase tests other
  // non-fatal-failure paths: monkeypatch the mock to throw once.
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);
  const realCreate = sandbox.DocumentApp.create;
  sandbox.DocumentApp.create = () => { throw new Error('simulated Drive failure'); };

  const result = submitLesson(exported);
  assert.equal(result.success, true, 'lesson submission itself must not fail');
  assert.equal(result.frameDocUrl, null);

  const row = lcRow(fx.lc);
  assert.match(String(row[12]), /Lesson frame generation deferred/); // error_notes
  assert.equal(row[10], 'ALIGNMENT_LOGGED', 'status must not advance to FRAME_GENERATED on failure');

  sandbox.DocumentApp.create = realCreate;
});
