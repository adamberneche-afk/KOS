'use strict';
// Flow 2 results that must not reach a student (2026-11-15). Two things the
// live FlowInput rows showed, described here with made-up fixtures only:
//   - an answer that evaluated another lesson, with an outcome the prompt
//     never allows ("PARTI_MET"), was delivered;
//   - one answer sat in two rows of the same doc (a submission and its
//     resubmission): Studio's Update rows step matched on a column that
//     isn't unique to a submission.
// Pins: a malformed result (a value outside MET / PARTIALLY_MET / NOT_MET,
// no outcomes line, a count that doesn't match the row, no stamp, a stamp
// the passing rule contradicts) is never delivered: no doc write, comment,
// evidence, Ledger result or log row; it is re-armed once on #425's
// counters, then ERROR_MALFORMED_OUTPUT, which closes as "Couldn't be
// checked" on the student's card. A duplicate is flagged (dates only), the
// newer row delivered and an unharvested older copy re-armed.
// checkFlow2Binding() names the StagingRowRef fix; removeFlow2Fixture()
// clears the fixture row cleanUpFlow2Canary() leaves. Every clock is pinned.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
// The Central Ledger's files the harvest, the backprop, the binding check,
// the canary cleanup and the fixtures reach.
const FILES = ['00_SharedConfig.js', '63_DocHeader.js', '03_QueueBridge.js', '04_Form2_TurnInGate.js',
  '15b_StudioFlowPrompts_Flow2_Revised.js', '15c_Flow2DirectEvaluationService.js', '37_FlowInputBuilder.js',
  '68_LessonParts.js', '40_FlowPrompts.js', '54_StudentAssignments.js', '55b_LessonAssignmentData.js',
  '25_WarmUpWriter.js', '41_WarmUpFlowBridge.js', '35_FlowPreflightAndCanary.js', '39_FlowFixtures.js',
  '64_LedgerCycle.js'].map(S);

const MIN = 60 * 1000;
// Monday 2026-11-16, 10:00 in New York.
const NOW = Date.UTC(2026, 10, 16, 15, 0, 0);
const TEACHER = 'teacher@example.invalid';
const STUDENT = 'student@example.invalid';
const CONFIG = 'CAS-TEST-L01';

function pinClock(sandbox, ms) {
  const clock = { ms };
  const RealDate = sandbox.Date;
  sandbox.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(clock.ms); }
    static now() { return clock.ms; }
    static [Symbol.hasInstance](x) { return x instanceof RealDate || (x && typeof x.getTime === 'function'); }
  };
  return clock;
}

function load() {
  const logs = [];
  const env = loadGasFiles(FILES, ['buildFlowInputRows', 'harvestFlowInputResults', 'backPropagateCompletions',
    'checkFlow2Binding', 'cleanUpFlow2Canary', 'installFlow2Fixture', 'removeFlow2Fixture', 'flow2DuplicateWriteLine_',
    '_fiCheckResultShape_', 'FI', 'FI_HEADERS', 'LEDGER', 'STG_STATUS'],
  { Logger: { log: (m) => logs.push(String(m)) } });
  const sb = env.sandbox;
  const clock = pinClock(sb, NOW);
  sb.MailApp.sendEmail = () => {};
  const comments = [];
  sb.Drive = { Comments: { create(resource, fileId) { comments.push({ resource, fileId }); return { id: 'c' }; } } };
  const ss = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sb.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  const x = env.exported;
  const queue = ss.insertSheet('ReviewQueue');
  queue.appendRow(['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'StudentText', 'Status']);
  const staging = ss.insertSheet('STAGING_PIPELINE');
  staging.appendRow(['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status']);
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  ss.insertSheet('MatrixRegistry').appendRow(['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']);
  ss.insertSheet('CompetencyEvidence');
  return Object.assign(env, { sb, ss, x, clock, logs, comments, queue, staging, ledger, props });
}

// One submission in flight: its doc, ReviewQueue STAGED, staging IN_PROCESS,
// the Ledger row and a teacher matrix; then the builder's FlowInput row.
function submission(env, { dod = 'Definition of done.', m4 = 'Milestone four' } = {}) {
  const { sb, x, ss } = env;
  const doc = sb.DocumentApp.create('Student Doc');
  doc.getBody().setText('── FEEDBACK ──');
  doc.getBody().appendParagraph('[No feedback yet.]');
  doc.getBody().appendParagraph('── END FEEDBACK ──');
  const fileId = doc.getId();
  env.queue.appendRow([new Date(env.clock.ms - 2 * MIN), STUDENT, fileId, CONFIG, '', 'STAGED']);
  env.staging.appendRow([new Date(env.clock.ms - MIN), String(env.queue.getLastRow()), fileId, CONFIG, TEACHER, 'IN_PROCESS']);
  const lrow = new Array(27).fill('');
  lrow[x.LEDGER.GOOGLE_ID] = STUDENT; lrow[x.LEDGER.CONFIG_ID] = CONFIG; lrow[x.LEDGER.FILE_ID] = fileId;
  lrow[x.LEDGER.TEACHER_EMAIL] = TEACHER; lrow[x.LEDGER.STATUS] = 'STAGED';
  env.ledger.appendRow(lrow);
  ss.getSheetByName('MatrixRegistry').appendRow(['Teacher', TEACHER, 'matrix-1', new Date()]);
  const matrix = sb.SpreadsheetApp.create('Teacher Matrix');
  sb.SpreadsheetApp._registry.set('matrix-1', matrix);
  const tm = matrix.insertSheet('TeacherMatrix');
  tm.appendRow(new Array(20).fill('h'));
  const r = new Array(20).fill('');
  r[0] = CONFIG; r[1] = 'Campaign Pitch'; r[2] = 'Tier 1'; r[3] = 'Marketing Director';
  r[4] = 'Milestone one'; r[5] = 'Milestone two'; r[6] = 'Milestone three'; r[7] = m4; r[8] = dod;
  r[15] = 'COMP-1'; r[16] = 'COMP-2'; r[17] = 'COMP-3'; r[18] = 'COMP-4';
  tm.appendRow(r);
  x.buildFlowInputRows();
  return { doc, fileId };
}

const fi = (env) => env.ss.getSheetByName('FlowInput');
const cell = (env, row, col) => fi(env).getRange(row, env.x.FI[col] + 1).getValue();

// Studio's answer into FlowInput row `row`.
function answer(env, row, output) {
  fi(env).getRange(row, env.x.FI.GEMINI_FULL_OUTPUT + 1).setValue(output);
  fi(env).getRange(row, env.x.FI.READY_STATUS + 1).setValue('EVALUATED');
}

const REPORT = 'Your Campaign Pitch for the Marketing Director is clear.\n';
const GOOD = REPORT + '[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 3]\n' +
  '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]';
const MALFORMED = {
  'an outcome the prompt never allows ("PARTI_MET")': REPORT + '[SYSTEM: REVISION_REQUIRED]\n' +
    '[MILESTONE_OUTCOMES: {"1":"PARTI_MET","2":"MET","3":"MET","4":"MET"}]',
  'no outcomes line': REPORT + '[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 3]',
  'a count that does not match the row': REPORT + '[SYSTEM: REVISION_REQUIRED]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"NOT_MET"}]',
  'a stamp the passing rule contradicts': REPORT + '[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 3]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"NOT_MET","3":"MET","4":"MET"}]',
  'no compliance stamp': REPORT + '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]',
};

function nothingDelivered(env, sub, what) {
  const { x } = env;
  assert.equal(sub.doc.getBody().getText().indexOf('Campaign Pitch'), -1, what + ': no doc write');
  assert.equal(env.comments.length, 0, what + ': no comment');
  assert.equal(env.ss.getSheetByName('CompetencyEvidence').getLastRow(), 0, what + ': no evidence');
  assert.equal(env.ledger.getRange(2, x.LEDGER.LAST_RESULT + 1).getValue(), '', what + ': no Ledger result');
}

for (const [what, output] of Object.entries(MALFORMED)) {
  test('malformed (' + what + '): not delivered, re-armed once, then ERROR_MALFORMED_OUTPUT', () => {
    const env = load();
    const sub = submission(env);
    answer(env, 2, output);
    env.x.harvestFlowInputResults();

    nothingDelivered(env, sub, what);
    assert.equal(cell(env, 2, 'READY_STATUS'), '', 'cleared: the re-arm');
    assert.equal(cell(env, 2, 'GEMINI_FULL_OUTPUT'), '', 'the bad answer is not kept for the next run to trip on');
    assert.equal(cell(env, 2, 'REARMS'), 2, 'its one re-arm spends the budget');
    assert.equal(new Date(cell(env, 2, 'ARMED_AT')).getTime(), NOW);
    assert.equal(env.staging.getRange(2, env.x.STG_STATUS + 1).getValue(), 'IN_PROCESS', 'still in the lane');
    assert.equal(env.ss.getSheetByName('EvaluationLog'), null, 'a re-arm is not a result');
    assert.ok(env.logs.some((l) => /re-armed 1, gave up on 0/.test(l)), 'counts in the log');

    env.clock.ms += MIN;
    env.x.buildFlowInputRows();
    assert.equal(cell(env, 2, 'READY_STATUS'), 'READY', 'the builder starts Studio again');

    env.clock.ms += MIN;
    answer(env, 2, output);
    env.x.harvestFlowInputResults();
    nothingDelivered(env, sub, what + ', again');
    assert.equal(cell(env, 2, 'READY_STATUS'), 'ERROR_MALFORMED_OUTPUT');
    assert.equal(env.staging.getRange(2, env.x.STG_STATUS + 1).getValue(), 'ERROR_EVALUATION');
    const log = env.ss.getSheetByName('EvaluationLog').getDataRange().getValues();
    assert.deepEqual(log.slice(1).map((r) => r[4]), ['ERROR_MALFORMED_OUTPUT']);
  });
}

test('malformed, then a good answer on the re-armed run: delivered once', () => {
  const env = load();
  const sub = submission(env);
  answer(env, 2, MALFORMED['an outcome the prompt never allows ("PARTI_MET")']);
  env.x.harvestFlowInputResults();
  env.clock.ms += MIN;
  env.x.buildFlowInputRows();
  answer(env, 2, GOOD);
  env.x.harvestFlowInputResults();
  assert.equal(cell(env, 2, 'READY_STATUS'), 'HARVESTED');
  assert.equal(sub.doc.getBody().getText().split('Campaign Pitch').length - 1, 1);
  assert.equal(env.ledger.getRange(2, env.x.LEDGER.LAST_RESULT + 1).getValue(), 'PASSED');
});

test('malformed with the re-arm budget spent goes terminal at once', () => {
  const env = load();
  const sub = submission(env);
  fi(env).getRange(2, env.x.FI.REARMS + 1, 1, 2).setValues([[2, new Date(NOW - 20 * MIN)]]);
  answer(env, 2, MALFORMED['no outcomes line']);
  env.x.harvestFlowInputResults();
  nothingDelivered(env, sub, 'budget spent');
  assert.equal(cell(env, 2, 'READY_STATUS'), 'ERROR_MALFORMED_OUTPUT');
});

test('the passing rule: tiered both ways; untiered, REVISION_REQUIRED with every milestone MET stands', () => {
  const env = load();
  const row = [];
  row[env.x.FI.MILESTONE_1] = 'a'; row[env.x.FI.MILESTONE_2] = 'b'; row[env.x.FI.MILESTONE_3] = 'c'; row[env.x.FI.MILESTONE_4] = 'd';
  const shape = (stamp, o) => env.x._fiCheckResultShape_('x\n[SYSTEM: ' + stamp + ']\n[MILESTONE_OUTCOMES: ' + JSON.stringify(o) + ']', row);
  const allMet = { 1: 'MET', 2: 'MET', 3: 'MET', 4: 'MET' };
  assert.equal(shape('REVISION_REQUIRED', allMet).ok, true, 'the whole Definition of Done can still fall short');
  assert.equal(shape('APPROVED', allMet).compliance, 'APPROVED');
  row[env.x.FI.DEFINITION_OF_DONE] = 'PASSING RULE: APPROVED when Milestone 1 (the primary competency) is MET and the rest partial.';
  const tierPass = { 1: 'MET', 2: 'PARTIALLY_MET', 3: 'PARTIALLY_MET', 4: 'MET' };
  assert.equal(shape('APPROVED', tierPass).ok, true);
  assert.equal(shape('REVISION_REQUIRED', tierPass).reason, 'stamp contradicts the passing rule');
  assert.equal(shape('APPROVED', { 1: 'PARTIALLY_MET', 2: 'MET', 3: 'MET', 4: 'MET' }).reason, 'stamp contradicts the passing rule');
  // A blank Milestone 4: three keys fit the row, four are accepted too.
  row[env.x.FI.MILESTONE_4] = '';
  row[env.x.FI.DEFINITION_OF_DONE] = '';
  assert.equal(shape('APPROVED', { 1: 'MET', 2: 'MET', 3: 'MET' }).ok, true);
  assert.equal(shape('APPROVED', { 1: 'MET', 2: 'MET' }).ok, false);
  // The last outcomes line counts (an echoed one earlier doesn't).
  const echoed = 'You wrote [MILESTONE_OUTCOMES: {"1":"PARTI_MET"}].\n[SYSTEM: APPROVED]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET"}]';
  assert.equal(env.x._fiCheckResultShape_(echoed, row).ok, true);
});

test('the student card: a malformed result closes as "Couldn\'t be checked"', () => {
  const env = load();
  submission(env);
  for (let i = 0; i < 2; i++) {
    answer(env, 2, MALFORMED['a stamp the passing rule contradicts']);
    env.x.harvestFlowInputResults();
    env.clock.ms += MIN;
    env.x.buildFlowInputRows();
  }
  assert.equal(cell(env, 2, 'READY_STATUS'), 'ERROR_MALFORMED_OUTPUT');
  env.x.backPropagateCompletions();
  const status = env.ledger.getRange(2, env.x.LEDGER.STATUS + 1).getValue();
  assert.equal(status, 'ERROR_EVALUATION');
  const card = loadGasFiles([S('00_SharedConfig.js'), S('13_StudentDashboard.js'), S('13c_StudentDashboardLessons.js'),
    S('71_TurnInCodes.js'), S('71b_TurnInStudent.js')], ['resolveStudentStatus_']).exported;
  assert.match(card.resolveStudentStatus_(status, ''), /^Couldn't be checked this time/);
});

// ── Duplicate writes ───────────────────────────────────────────────────────

// Two FlowInput rows of one doc: an older one, then a resubmission's, an
// hour apart, with the same answer in both.
function duplicatePair(env, olderStatus) {
  const sub = submission(env);
  const sheet = fi(env);
  const older = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.getRange(2, env.x.FI.TIMESTAMP + 1).setValue(new Date(NOW - 60 * MIN));
  sheet.getRange(2, env.x.FI.STAGING_ROW_REF + 1).setValue(9); // an older staging row
  const newer = older.slice();
  newer[env.x.FI.TIMESTAMP] = new Date(NOW - 2 * MIN);
  sheet.appendRow(newer);
  answer(env, 3, GOOD);
  sheet.getRange(2, env.x.FI.GEMINI_FULL_OUTPUT + 1).setValue(GOOD);
  sheet.getRange(2, env.x.FI.READY_STATUS + 1).setValue(olderStatus);
  return sub;
}

test('duplicate: the newer row is delivered, the unharvested older copy re-armed, the event kept as dates', () => {
  const env = load();
  const sub = duplicatePair(env, 'EVALUATED');
  env.x.harvestFlowInputResults();

  assert.equal(cell(env, 3, 'READY_STATUS'), 'HARVESTED', 'the answer is the newer submission\'s own');
  assert.equal(sub.doc.getBody().getText().split('Campaign Pitch').length - 1, 1, 'delivered once, not twice');
  assert.equal(cell(env, 2, 'READY_STATUS'), '', 'the older copy is re-armed');
  assert.equal(cell(env, 2, 'GEMINI_FULL_OUTPUT'), '');
  const tab = env.ss.getSheetByName('Flow2Duplicates').getDataRange().getValues();
  assert.deepEqual(tab[0], ['DetectedAt', 'EarlierBuiltAt', 'NewerBuiltAt', 'EarlierStatus']);
  assert.equal(tab.length, 2);
  assert.equal(new Date(tab[1][0]).getTime(), NOW);
  assert.equal(new Date(tab[1][1]).getTime(), NOW - 60 * MIN);
  assert.equal(tab[1][3], 'EVALUATED');
  assert.ok(!tab[1].some((v) => String(v).indexOf(sub.fileId) !== -1), 'no file ID');
  assert.match(env.x.flow2DuplicateWriteLine_(env.ss), /match on StagingRowRef \(column B\)/);

  // Harvested again: not found again.
  env.x.harvestFlowInputResults();
  assert.equal(env.ss.getSheetByName('Flow2Duplicates').getLastRow(), 2);
});

test('duplicate: an older row already harvested is left alone; the newer is delivered and the event kept', () => {
  const env = load();
  const sub = duplicatePair(env, 'HARVESTED');
  env.x.harvestFlowInputResults();
  assert.equal(cell(env, 3, 'READY_STATUS'), 'HARVESTED');
  assert.equal(cell(env, 2, 'READY_STATUS'), 'HARVESTED');
  assert.equal(sub.doc.getBody().getText().split('Campaign Pitch').length - 1, 1);
  assert.equal(env.ss.getSheetByName('Flow2Duplicates').getLastRow(), 2);
});

test('duplicate: the warning ages out after a week; different answers in one doc are no duplicate', () => {
  const env = load();
  duplicatePair(env, 'HARVESTED');
  env.x.harvestFlowInputResults();
  env.clock.ms += 8 * 24 * 60 * MIN;
  assert.equal(env.x.flow2DuplicateWriteLine_(env.ss), '');

  const other = load();
  duplicatePair(other, 'HARVESTED');
  fi(other).getRange(2, other.x.FI.GEMINI_FULL_OUTPUT + 1).setValue(GOOD.replace('is clear', 'needs work'));
  other.x.harvestFlowInputResults();
  assert.equal(other.ss.getSheetByName('Flow2Duplicates'), null);
});

test('checkFlow2Binding: rows holding a copied answer name the Studio fix, StagingRowRef', () => {
  const env = load();
  duplicatePair(env, 'HARVESTED');
  fi(env).getRange(3, env.x.FI.READY_STATUS + 1).setValue('HARVESTED');
  const report = env.x.checkFlow2Binding();
  assert.equal(report.duplicateOutputs, 1);
  const said = env.logs.join('\n');
  assert.match(said, /Update rows step and set the column it matches on to StagingRowRef \(column 2\)/);
  assert.match(said, /no Drive file sources/);
  assert.match(said, /One row per run/);
});

// ── The fixture row cleanUpFlow2Canary() leaves ────────────────────────────

test('the Flow 2 fixture row survives the canary cleanup, which says so; removeFlow2Fixture() clears it', () => {
  const env = load();
  const installed = env.x.installFlow2Fixture();
  // A real row beside it stays.
  const real = new Array(env.x.FI_HEADERS.length).fill('');
  real[env.x.FI.STAGING_ROW_REF] = 2; real[env.x.FI.STUDENT_FILE_ID] = 'f-real'; real[env.x.FI.CONFIG_ID] = CONFIG;
  real[env.x.FI.TEACHER_EMAIL] = TEACHER; real[env.x.FI.READY_STATUS] = 'HARVESTED';
  fi(env).appendRow(real);

  const canary = env.x.cleanUpFlow2Canary();
  assert.equal(canary.fixtureRowsLeft, 1);
  assert.equal(cell(env, 2, 'STAGING_ROW_REF'), 'FIXTURE', 'not a canary row, so the canary cleanup leaves it');

  const trashed = [];
  env.sb.DriveApp.getFileById = (id) => ({ setTrashed() { trashed.push(id); } });
  const r = env.x.removeFlow2Fixture();
  assert.equal(r.cleared, 1);
  assert.deepEqual(trashed, [installed.studentFileId]);
  assert.equal(cell(env, 2, 'STAGING_ROW_REF'), '');
  assert.equal(cell(env, 3, 'STUDENT_FILE_ID'), 'f-real');
});
