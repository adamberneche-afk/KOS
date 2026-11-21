'use strict';
// A tab's columns are declared once, in 00_SharedConfig.js (structure audit
// 3.1, 2026-11-21): the Ledger (LEDGER, LEDGER_HEADERS), WarmUpQueue (WQ,
// WQ_HEADERS), TeacherMatrix (TM), RubricQueue (RBQ), ReviewQueue (RVQ), LessonContext
// (LCTX) and PacingGuide (PG). Each index map must stay in step with its header row, and no
// other file may keep its own copy.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const x = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js')],
  ['LEDGER', 'LEDGER_HEADERS', 'LEDGER_BASE_WIDTH', 'LEDGER_COL_COUNT', 'LEDGER_LATER_HEADERS',
    'WQ', 'WQ_HEADERS', 'WQ_BASE_WIDTH', 'TM', 'TM_HEADERS', 'TM_BASE_WIDTH',
    'RBQ', 'RBQ_HEADERS', 'RVQ', 'RVQ_HEADERS', 'LCTX', 'LCTX_HEADERS', 'PG', 'PG_HEADERS']).exported;

// Each LEDGER key and the header it names.
const NAMES = {
  TIMESTAMP: 'Timestamp', GOOGLE_ID: 'GoogleID', CONFIG_ID: 'ConfigID', FILE_ID: 'FileID',
  STUDENT_NAME: 'StudentName', BLOCK: 'Block', CLASS_NAME: 'ClassName', TEACHER_NAME: 'TeacherName',
  TEACHER_EMAIL: 'TeacherEmail', SUBJECT: 'Subject', COURSE_NAME: 'CourseName', PERIOD: 'Period',
  STATUS: 'Status', SUBMISSION_TS: 'SubmissionTS', NOTES: 'Notes', LAST_EVAL: 'LastEval',
  ADMIN_FILE_URL: 'AdminFileURL', STUDENT_FILE_URL: 'StudentFileURL', ACADEMIC_YEAR: 'AcademicYear',
  TURN_IN_SUGGESTED_SCORE: 'SuggestedScore', TURN_IN_FINAL_SCORE: 'FinalScore',
  TURN_IN_SCORE_DECIDED_BY: 'ScoreDecidedBy', TURN_IN_SCORE_DECIDED_AT: 'ScoreDecidedAt',
  CHECK_COUNT: 'CheckCount', LAST_RESULT: 'LastResult', FIRST_PASSED_AT: 'FirstPassedAt',
  LAST_SUGGESTED_SCORE: 'LastSuggestedScore',
};

test('every LEDGER index names its header in LEDGER_HEADERS, and every header has an index', () => {
  assert.deepEqual(Object.keys(x.LEDGER).sort(), Object.keys(NAMES).sort());
  for (const [k, h] of Object.entries(NAMES)) assert.equal(x.LEDGER_HEADERS[x.LEDGER[k]], h, k);
  assert.equal(x.LEDGER_COL_COUNT, x.LEDGER_HEADERS.length);
  assert.equal(x.LEDGER_HEADERS[x.LEDGER_BASE_WIDTH - 1], 'AcademicYear', 'the setup-era width ends at AcademicYear');
  assert.deepEqual([...x.LEDGER_LATER_HEADERS], x.LEDGER_HEADERS.slice(x.LEDGER_BASE_WIDTH));
});

test('no script keeps its own copy of the Ledger\'s column indexes', () => {
  const copies = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js') && n !== '00_SharedConfig.js')) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const m = src.match(/^const (L|LD|LD\d+)_(GOOGLE_ID|CONFIG_ID|FILE_ID|STATUS|TEACHER_EMAIL|PERIOD|TERM)\s*=\s*\d+/m);
    if (m) copies.push(f + ': ' + m[0]);
    if (/"AdminFileURL"\s*,\s*"StudentFileURL"/.test(src)) copies.push(f + ': a header list');
  }
  assert.deepEqual(copies, [], 'use 00_SharedConfig.js\'s LEDGER and LEDGER_HEADERS');
});

test('WarmUpQueue: WQ\'s indexes are WQ_HEADERS\' positions, the header in lower case with underscores', () => {
  const snake = (k) => ({ LESSON_CTX_SNAP: 'lesson_context_snapshot', STUDENT_PROFILE_SNAP: 'student_profile_snapshot' })[k] || k.toLowerCase();
  const keys = Object.keys(x.WQ);
  assert.equal(keys.length, x.WQ_HEADERS.length);
  for (const k of keys) assert.equal(x.WQ_HEADERS[x.WQ[k]], snake(k), k);
  assert.equal(x.WQ_HEADERS[x.WQ_BASE_WIDTH - 1], 'bridge_output', '24 writes through bridge_output');
});

test('no script keeps its own copy of WarmUpQueue\'s column indexes or header row', () => {
  const copies = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js') && n !== '00_SharedConfig.js')) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const m = src.match(/^const (WQ\d*|DASH_WQ|WFB)_(QUEUE_ID|STATUS|LESSON_DATE|PROFILE_SNAP|GOOGLE_ID)\s*=\s*\d+/m);
    if (m) copies.push(f + ': ' + m[0]);
    if (/"lesson_context_snapshot"\s*,\s*"student_profile_snapshot"/.test(src)) copies.push(f + ': a header list');
  }
  assert.deepEqual(copies, [], 'use 00_SharedConfig.js\'s WQ and WQ_HEADERS');
});

// KEY_NAME -> HeaderName for the CamelCase tabs: each word capitalized, then
// the few that don't follow that.
const camel = (k, odd) => odd[k] || k.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const checkTab = (map, headers, odd) => {
  assert.equal(Object.keys(map).length, headers.length);
  for (const k of Object.keys(map)) assert.equal(headers[map[k]], camel(k, odd), k);
};

test('TeacherMatrix, RubricQueue and ReviewQueue: each index map names its header row', () => {
  checkTab(x.TM, x.TM_HEADERS, {
    CONFIG_ID: 'ConfigID', DOD: 'DefinitionOfDone', PROMPT_TEMPLATE_ID: 'PromptTemplateID',
    MILESTONE_1: 'Milestone1', MILESTONE_2: 'Milestone2', MILESTONE_3: 'Milestone3', MILESTONE_4: 'Milestone4',
    MILESTONE_1_COMPETENCY_ID: 'Milestone1CompetencyId', MILESTONE_2_COMPETENCY_ID: 'Milestone2CompetencyId',
    MILESTONE_3_COMPETENCY_ID: 'Milestone3CompetencyId', MILESTONE_4_COMPETENCY_ID: 'Milestone4CompetencyId',
  });
  assert.equal(x.TM_HEADERS[x.TM_BASE_WIDTH - 1], 'CourseName', 'setup-era width ends at CourseName');
  checkTab(x.RBQ, x.RBQ_HEADERS, { PROMPT_TEMPLATE_ID: 'PromptTemplateID', TEACHER_MATRIX_SS_ID: 'TeacherMatrixSsId' });
  checkTab(x.RVQ, x.RVQ_HEADERS, { GOOGLE_ID: 'GoogleID', FILE_ID: 'FileID', CONFIG_ID: 'ConfigID' });
});

test('no script keeps its own copy of TeacherMatrix, RubricQueue or ReviewQueue columns', () => {
  const copies = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js') && n !== '00_SharedConfig.js')) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const m = src.match(/^(?:const|var) (TM\d+|FI_TM_COLUMNS_|RQ\d+|WD_RUBRIC_QUEUE_COLUMNS)\s*=|^const (?:TM|RQ)_(CONFIG_ID|STATUS|FILE_ID)\s*=\s*\d+/m);
    if (m) copies.push(f + ': ' + m[0]);
    if (/"DefinitionOfDone",\s*"InstructorEmail"/.test(src)) copies.push(f + ': a TeacherMatrix header list');
    if (/"RubricText",\s*"PromptTemplateID",\s*"TeacherMatrixSsId"/.test(src)) copies.push(f + ': a RubricQueue header list');
  }
  assert.deepEqual(copies, [], 'use 00_SharedConfig.js\'s TM, RBQ and RVQ');
});

test('LessonContext: LCTX\'s indexes are LCTX_HEADERS\' positions', () => {
  assert.equal(Object.keys(x.LCTX).length, x.LCTX_HEADERS.length);
  for (const k of Object.keys(x.LCTX)) assert.equal(x.LCTX_HEADERS[x.LCTX[k]], k.toLowerCase(), k);
});

test('no script keeps its own copy of LessonContext\'s columns or header row', () => {
  const copies = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js') && n !== '00_SharedConfig.js')) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const m = src.match(/^const LC\d*_(LESSON_ID|STATUS|LESSON_DATE|FRAME_DOC_ID|WARM_UP_GENERATED)\s*=\s*\d+/m);
    if (m) copies.push(f + ': ' + m[0]);
    if (/"period_or_class",\s*"activity_description"/.test(src)) copies.push(f + ': a header list');
  }
  assert.deepEqual(copies, [], 'use 00_SharedConfig.js\'s LCTX and LCTX_HEADERS');
});

test('28 heads warm_up_generated in its own column, not past the frame columns', () => {
  const env = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '28_Module2Setup.js')],
    ['_addWarmUpGeneratedColumn_', 'LCTX', 'LCTX_HEADERS', 'PG', 'PG_HEADERS']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  const sheet = ss.insertSheet('LessonContext');
  const headers = env.exported.LCTX_HEADERS.slice();
  headers[env.exported.LCTX.WARM_UP_GENERATED] = ''; // a tab made by the old 14-header setup, frames added since
  sheet.appendRow(headers);
  env.exported._addWarmUpGeneratedColumn_(ss);
  const after = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  assert.deepEqual(after.map(String), [...env.exported.LCTX_HEADERS]);
  env.exported._addWarmUpGeneratedColumn_(ss);
  assert.equal(sheet.getLastColumn(), env.exported.LCTX_HEADERS.length, 'a second run adds nothing');
});

test('PacingGuide: PG\'s indexes are PG_HEADERS\' positions', () => {
  const odd = { UNIT_ID: 'lesson_unit_id', UNIT_NAME: 'lesson_unit_name', OBJ_8175: 'objective_8175',
    OBJ_8177: 'objective_8177', COMP_IDS_8175: 'competency_ids_8175', COMP_IDS_8177: 'competency_ids_8177',
    KEY_VOCAB: 'key_vocabulary', PRIOR_CONNECTION: 'prior_lesson_connection',
    VOCAB_WITH_DEFS: 'vocabulary_with_definitions' };
  assert.equal(Object.keys(x.PG).length, x.PG_HEADERS.length);
  for (const k of Object.keys(x.PG)) assert.equal(x.PG_HEADERS[x.PG[k]], odd[k] || k.toLowerCase(), k);
});

test('no script keeps its own copy of PacingGuide\'s columns or header row', () => {
  const copies = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js') && n !== '00_SharedConfig.js')) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const m = src.match(/^const PG_(UNIT_ID|STAGE|WARMUP_ANCHOR)\s*=\s*\d+|^const PG_HEADERS\b/m);
    if (m) copies.push(f + ': ' + m[0]);
    if (/"objective_8175",\s*"objective_8177"/.test(src)) copies.push(f + ': a header list');
  }
  assert.deepEqual(copies, [], 'use 00_SharedConfig.js\'s PG and PG_HEADERS');
});

// ── ensureTab_ (structure audit 3.2): the one "make sure this tab exists" ──
test('ensureTab_: creates a missing tab with its headers once, and returns it', () => {
  const env = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js')], ['ensureTab_']);
  const ss = env.sandbox.SpreadsheetApp.create('Ledger');
  const before = ss.getSheets().length;
  const sheet = env.exported.ensureTab_(ss, 'Things', ['a', 'b', 'c'], { textColumns: [2] });
  assert.ok(sheet && ss.getSheetByName('Things'));
  const made = ss.getSheetByName('Things');
  assert.deepEqual(made.getRange(1, 1, 1, 3).getValues()[0], ['a', 'b', 'c']);
  assert.ok(env.exported.ensureTab_(ss, 'Things', ['a', 'b', 'c']), 'a second call returns the tab');
  assert.equal(ss.getSheets().length, before + 1, 'and makes no second one');
});

test('ensureTab_: fills in trailing headers on a tab whose headers match, leaves a different one alone', () => {
  const env = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js')], ['ensureTab_']);
  const ss = env.sandbox.SpreadsheetApp.create('Ledger');
  const older = ss.insertSheet('Older');
  older.appendRow(['a', 'b']);
  env.exported.ensureTab_(ss, 'Older', ['a', 'b', 'c', 'd']);
  assert.deepEqual(older.getRange(1, 1, 1, older.getLastColumn()).getValues()[0], ['a', 'b', 'c', 'd']);
  const other = ss.insertSheet('Other');
  other.appendRow(['a', 'x']);
  env.exported.ensureTab_(ss, 'Other', ['a', 'b', 'c']);
  assert.deepEqual(other.getRange(1, 1, 1, other.getLastColumn()).getValues()[0], ['a', 'x'], 'not ours to change');
});

test('no script keeps its own create-the-tab helper', () => {
  const found = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const m = src.match(/^function (_createTabIf\w+|_fmsEnsureTab_)\(/m);
    if (m) found.push(f + ': ' + m[1]);
  }
  assert.deepEqual(found, [], 'use 00_SharedConfig.js\'s ensureTab_');
});

// ── Tab names (structure audit 3.3): one list, TABS in 00 ─────────────────
test('tab names: no "tabs.x || literal" fallback, no file redeclaring a TABS name or another file\'s tab', () => {
  const env = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js')], ['TABS']);
  const names = new Set(Object.values(env.exported.TABS));
  const found = [];
  const owners = {};
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const fb = src.match(/tabs\)?\.\w+\)?\s*\|\|\s*"[A-Za-z_]+"/);
    if (fb) found.push(f + ': ' + fb[0]);
    for (const m of src.matchAll(/^(?:const|var) (\w*TAB\w*)\s*=\s*"([^"]+)"/gm)) {
      if (names.has(m[2])) found.push(f + ': ' + m[1] + ' repeats TABS\'s "' + m[2] + '"');
      (owners[m[2]] = owners[m[2]] || []).push(f);
    }
  }
  Object.entries(owners).filter(([, fs2]) => fs2.length > 1)
    .forEach(([n, fs2]) => found.push('"' + n + '" declared in ' + fs2.join(', ')));
  assert.deepEqual(found, [], 'use 00_SharedConfig.js\'s TABS');
});
