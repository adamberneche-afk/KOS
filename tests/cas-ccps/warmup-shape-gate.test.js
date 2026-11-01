'use strict';
// Flow 3's shape gate (41): output that is the prompt itself, a description
// of it or a list of its fields is never delivered; the teacher's anchor goes
// out instead and the harvest notes it. repairWarmUpTextBox() fixes rows
// delivered before the gate. 34c counts the fallbacks, and 33 stamps its
// stage when it stops early (2026-10-19: 18 of 126 warm-ups were not
// warm-ups, and the 3:05 sync recorded no run). Synthetic text only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CC = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const FILES = ['00_SharedConfig.js', '22_LessonContextHandler.js', '23_StudentProfileManager.js',
  '04_Form2_TurnInGate.js', '25_WarmUpWriter.js', '37_FlowInputBuilder.js', '55b_LessonAssignmentData.js', '68_LessonParts.js', '41_WarmUpFlowBridge.js']
  .map((f) => path.join(CC, f));
const EXPOSE = ['wfbApplyFlow3_', 'wfbFindQueueRow_', 'wfbWarmUpShapeProblem_', 'repairWarmUpTextBox',
  'harvestWarmUpFlowReturns', 'WQ25_COL_COUNT', 'WQ25_STATUS', 'WTB', 'WTB_HEADERS'];

const ANCHOR = 'How does a sports team make money? List as many ways as you can think of.';
const GOOD = 'Think about the last game you watched. How does a sports team make money, and which way brings in the most?';
const ECHO = 'You are personalizing a warm-up prompt for a high school CTE student.\n\n' +
  "TEACHER'S ANCHOR PROMPT:\n" + ANCHOR + '\n\nADAPTATION CONSTRAINTS — follow all of these:\n1. Preserve the anchor.';
const SUMMARY = 'The warm-up prompt configuration for student Sam focuses on the bridge archetype and a ' +
  'competency gap in work ethic (8175-5).';
const FIELDS = '- Student: Sam\n- Unit: L02\n- Course: Sports Marketing';

function setup() {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  props.setProperty('TEACHER_NAME', 'Teacher');
  props.setProperty('WARMUP_TEXT_BOX', 'all');
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  return { exported, sandbox, ss, wq };
}

function queue(fx, queueId, anchor) {
  const row = new Array(fx.exported.WQ25_COL_COUNT).fill('');
  row[0] = queueId;
  row[3] = 'Sam Student';
  row[5] = '2026-10-20';
  row[6] = JSON.stringify({ course_name: 'Sports Entertainment and Event Management',
    objective: 'Sports team revenue streams', warmup_anchor: anchor === undefined ? ANCHOR : anchor });
  row[8] = 'PENDING';
  fx.wq.appendRow(row);
  return fx.exported.wfbFindQueueRow_(fx.wq, queueId);
}

const boxText = (fx) => fx.ss.getSheetByName('WarmUpTextBox').getRange(2, 4).getValue();

test('the shape check passes a warm-up and names what is wrong with each kind of junk', () => {
  const shape = setupShape();
  assert.equal(shape(GOOD), '');
  assert.equal(shape(ANCHOR), '');
  assert.match(shape(ECHO), /Flow 3's own prompt \(Studio returned its input/);
  assert.match(shape(SUMMARY), /prompt's own wording/);
  assert.match(shape(FIELDS), /a list/);
  assert.match(shape('Think about stadium pricing for 8177-4 skills.'), /competency code/);
  assert.match(shape(GOOD.repeat(10)), /longer than/);
});

// 2026-10-21: 8 of a night's 17 shape failures were the whole Mode A prompt
// (about 3,400 characters), and most of the rest asked no question: a
// sentence about the anchor rather than the anchor.
test('Studio returning the prompt is named as that, not as too long', () => {
  const shape = setupShape();
  assert.match(shape(ECHO + '\n' + 'x'.repeat(3000)), /^is Flow 3's own prompt/);
  assert.match(shape('YOUR ROLE:\nWrite a warm-up.'), /^is Flow 3's own prompt/);
});

test('with an anchor, a warm-up must ask a question unless it keeps the anchor whole', () => {
  const shape = setupShape();
  const said = 'This anchor already fits the student well, so it is kept as written for the bridge.';
  assert.equal(shape(said), '', 'no anchor given: the rule does not apply');
  assert.equal(shape(said, ANCHOR), 'asks no question');
  assert.equal(shape(GOOD, ANCHOR), '');
  const plain = 'Describe one thing a sponsor gets from a stadium deal. Be specific.';
  assert.equal(shape(plain, plain), '', 'an anchor with no question, returned unchanged');
  assert.equal(shape('Picture the crowd. ' + plain, '*' + plain + '*'), '', 'kept whole inside framing');
});

function setupShape() {
  return setup().exported.wfbWarmUpShapeProblem_;
}

test('a good warm-up is delivered as written', () => {
  const fx = setup();
  assert.deepEqual(fx.exported.wfbApplyFlow3_(fx.wq, queue(fx, 'Q1'), 'Q1', GOOD), { ok: true });
  assert.equal(boxText(fx), GOOD);
});

test('junk output delivers the teacher\'s anchor instead, and says why', () => {
  const fx = setup();
  const out = fx.exported.wfbApplyFlow3_(fx.wq, queue(fx, 'Q1'), 'Q1', ECHO);
  assert.equal(out.ok, true);
  assert.match(out.fallback, /Flow 3's own prompt/);
  assert.equal(boxText(fx), ANCHOR);
  assert.equal(fx.wq.getRange(2, fx.exported.WQ25_STATUS + 1).getValue(), 'DELIVERED');
});

test('with no anchor to fall back on, junk is refused rather than shown', () => {
  const fx = setup();
  const out = fx.exported.wfbApplyFlow3_(fx.wq, queue(fx, 'Q1', ''), 'Q1', SUMMARY);
  assert.equal(out.ok, false);
  assert.match(out.error, /^NOT_A_WARMUP/);
  assert.equal(fx.ss.getSheetByName('WarmUpTextBox'), null);
});

test('the harvest notes a fallback on the return row', () => {
  const fx = setup();
  queue(fx, 'Q1');
  const ret = fx.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  ret.appendRow([new Date(), 3, 'Q1', FIELDS, '', 0, '']);
  fx.exported.harvestWarmUpFlowReturns();
  assert.equal(ret.getRange(2, 5).getValue(), 'HARVESTED');
  assert.match(ret.getRange(2, 7).getValue(), /^ANCHOR_FALLBACK: is a list/);
});

test('repairWarmUpTextBox replaces unanswered junk with the anchor and leaves the rest', () => {
  const fx = setup();
  const { WTB, WTB_HEADERS } = fx.exported;
  const box = fx.ss.insertSheet('WarmUpTextBox');
  box.appendRow(WTB_HEADERS);
  const add = (id, text, answer) => {
    queue(fx, id);
    const r = new Array(WTB_HEADERS.length).fill('');
    r[WTB.QUEUE_ID] = id; r[WTB.LESSON_DATE] = '2026-10-20'; r[WTB.WARMUP] = text; r[WTB.RESPONSE] = answer || '';
    box.appendRow(r);
  };
  add('Q1', GOOD);
  add('Q2', ECHO);
  add('Q3', SUMMARY, 'already answered');
  add('Q4', FIELDS);
  assert.deepEqual(fx.exported.repairWarmUpTextBox(), { checked: 4, replaced: 2, answeredSkipped: 1, noAnchor: 0 });
  const texts = box.getRange(2, WTB.WARMUP + 1, 4, 1).getValues().map((r) => r[0]);
  assert.deepEqual(texts, [GOOD, ANCHOR, SUMMARY, ANCHOR]);
  assert.equal(fx.exported.repairWarmUpTextBox().replaced, 0, 'a second run changes nothing');
});

test('34c counts fallbacks; 33 stamps a stop with its reason', () => {
  // 34c with what its setup checks reach (38, 40, 41, 57 and their collaborators).
  const env = loadGasFiles(['00_SharedConfig.js', '34c_OvernightHealth.js', '64_LedgerCycle.js',
    '43_DeployVersionMarker_CentralLedger.js', '03_QueueBridge.js', '10_AdminRecoveryPanel.js',
    '15b_StudioFlowPrompts_Flow2_Revised.js', '23_StudentProfileManager.js', '25_WarmUpWriter.js',
    '29_StudentContextAggregator.js', '30_SCRSuggestionEngine.js', '34_QueueWatchdog.js', '36_WeeklyParentReport.js',
    '37_FlowInputBuilder.js', '55b_LessonAssignmentData.js', '68_LessonParts.js', '38_LedgerSchemaGuard.js', '40_FlowPrompts.js', '41_WarmUpFlowBridge.js',
    '54_StudentAssignments.js', '57_RetentionSchedule.js'].map((f) => path.join(CC, f)), ['overnightHealth_']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  const now = new Date('2026-10-19T10:00:00Z');
  ['M2_STAGE1_LAST_RUN', 'M2_STAGE2_LAST_RUN', 'M2_STAGE3_LAST_RUN', 'M2_STAGE1B_LAST_RUN']
    .forEach((k) => props.setProperty(k, new Date(now.getTime() - 3 * 3600 * 1000).toISOString()));
  props.setProperty('M2_STAGE1B_STATUS', 'NO_MATRIX_ID');
  ss.insertSheet('WarmUpQueue').appendRow(['queue_id', 'lesson_id', 'student_email', 'student_name',
    'google_id', 'lesson_date', 'lesson_context_snapshot', 'student_profile_snapshot', 'status']);
  const ret = ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  ret.appendRow([new Date(now.getTime() - 3600 * 1000), 3, 'Q1', 'x', 'HARVESTED', 1, 'ANCHOR_FALLBACK: is a list']);
  ret.appendRow([new Date(now.getTime() - 3600 * 1000), 3, 'Q2', 'x', 'HARVESTED', 1, '']);
  const p = env.exported.overnightHealth_(now).problems.join('\n');
  assert.match(p, /went out as the teacher's own question in the last 24 hours: 1/);
  assert.match(p, /3:05 artifact sync \(33\): ran with status NO_MATRIX_ID \(no MatrixRegistry row for the teacher, and no TEACHER_MATRIX_SS_ID/);

  const s33 = loadGasFiles([path.join(CC, '00_SharedConfig.js'), path.join(CC, '33_ArtifactCompetencyBridge.js'),
    path.join(CC, '53_AssignmentSeeder.js'), path.join(CC, '54_StudentAssignments.js')],
    ['syncArtifactCompetencies']);
  const ledger = s33.sandbox.SpreadsheetApp.create('Central Ledger');
  s33.sandbox.SpreadsheetApp._registry.set(ledger.getId(), ledger);
  const p33 = s33.sandbox.PropertiesService.getScriptProperties();
  p33.setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  p33.setProperty('ADMIN_SS_ID', ledger.getId());
  p33.setProperty('M2_ENABLED', 'true');
  s33.exported.syncArtifactCompetencies();
  assert.equal(p33.getProperty('M2_STAGE1B_STATUS'), 'NO_LEDGER_TAB');
  assert.ok(p33.getProperty('M2_STAGE1B_LAST_RUN'));
});
