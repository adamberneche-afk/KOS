'use strict';
// Pacing the warm-up flows (41): Studio drops runs when many input rows
// change at once (2026-10-18, "Couldn't access the spreadsheet": 38 of 81
// warm-ups after the 3:30 build wrote every row together). Each run now
// writes at most WFB_INPUTS_PER_RUN input rows, and a READY row Studio never
// returned is written again as a new row, at most twice.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CC = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const FILES = ['00_SharedConfig.js', '22_LessonContextHandler.js', '23_StudentProfileManager.js',
  '04_Form2_TurnInGate.js', '24_WarmUpBridge.js', '25_WarmUpWriter.js', '37_FlowInputBuilder.js', '68_LessonParts.js', '03_QueueBridge.js',
  '40_FlowPrompts.js', '41_WarmUpFlowBridge.js']
  .map((f) => path.join(CC, f));
const EXPOSE = ['buildWarmUpFlowInputs', 'wfbRetryStaleInputs_', 'wfbConsumeInputRow_',
  'WFB_INPUTS_PER_RUN', 'WFB_FLOW3_HEADERS', 'WQ25_COL_COUNT', 'harvestWarmUpFlowReturns',
  'previewFailedWarmUpRepair', 'repairFailedWarmUps', 'previewFailedWarmUpScoring',
  'repairFailedWarmUpScoring', 'WFB_FLOW4_HEADERS', 'wfbFlow3Plausible_',
  'previewEvalErrorRescore', 'rescoreEvalErrorWarmUps', 'previewAcceptFailedWarmUpFeedback',
  'acceptFailedWarmUpFeedback'];

function setup() {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  return { exported, sandbox, ss, wq };
}

function pending(fx, n) {
  for (let i = 0; i < n; i++) {
    const row = new Array(fx.exported.WQ25_COL_COUNT).fill('');
    row[0] = 'WQ-' + i;
    row[3] = 'Sam Student';
    row[5] = '2026-10-19';
    row[6] = JSON.stringify({ course_name: 'Sports Entertainment and Event Marketing', warmup_anchor: 'a' });
    row[7] = JSON.stringify({ student_name: 'Sam Student' });
    row[8] = 'PENDING';
    fx.wq.appendRow(row);
  }
}

const statuses = (sheet) => sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues().map((r) => r[0]);

test('a run writes at most WFB_INPUTS_PER_RUN input rows; the rest follow on later runs', () => {
  const fx = setup();
  pending(fx, 25);
  const cap = fx.exported.WFB_INPUTS_PER_RUN;
  const first = fx.exported.buildWarmUpFlowInputs();
  assert.equal(first.flow3, cap);
  assert.equal(first.deferred, 25 - cap);
  fx.exported.buildWarmUpFlowInputs();
  const third = fx.exported.buildWarmUpFlowInputs();
  assert.equal(third.flow3, 25 - 2 * cap);
  assert.equal(third.deferred, 0);
  assert.equal(fx.ss.getSheetByName('Flow3Input').getLastRow() - 1, 25, 'each queue row once');
});

test('a READY row with no return after 30 minutes is written again, at most twice; a returned one is not', () => {
  const fx = setup();
  const tab = fx.ss.insertSheet('Flow3Input');
  tab.appendRow(fx.exported.WFB_FLOW3_HEADERS);
  const old = new Date(Date.now() - 45 * 60 * 1000);
  const fill = (id, at) => [at, id, 'READY'].concat(new Array(fx.exported.WFB_FLOW3_HEADERS.length - 3).fill('x'));
  tab.appendRow(fill('Q-DROPPED', old));
  tab.appendRow(fill('Q-RETURNED', old));
  tab.appendRow(fill('Q-RECENT', new Date()));
  const ret = fx.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  ret.appendRow([new Date(), 3, 'Q-RETURNED', 'text', '', 1, '']);

  const tabs = { 3: tab, 4: fx.ss.insertSheet('Flow4Input'), 5: fx.ss.insertSheet('Flow5Input') };
  const later = (min) => new Date(Date.now() + min * 60 * 1000);
  assert.equal(fx.exported.wfbRetryStaleInputs_(fx.ss, tabs, 10, later(0)), 1);
  assert.deepEqual(statuses(tab), ['RETRIED', 'READY', 'READY', 'READY']);
  assert.equal(tab.getRange(5, 2).getValue(), 'Q-DROPPED');
  assert.equal(tab.getRange(5, 4).getValue(), 'x', 'the whole row is copied');

  assert.equal(fx.exported.wfbRetryStaleInputs_(fx.ss, tabs, 10, later(10)), 0, 'the copy is new');
  assert.equal(fx.exported.wfbRetryStaleInputs_(fx.ss, tabs, 10, later(45)), 2, 'second try, and Q-RECENT is now stale');
  assert.equal(fx.exported.wfbRetryStaleInputs_(fx.ss, tabs, 10, later(90)), 1, 'Q-RECENT only: Q-DROPPED has had two');

  fx.exported.wfbConsumeInputRow_(fx.ss, 3, 'Q-DROPPED');
  const dropped = tab.getRange(2, 2, tab.getLastRow() - 1, 2).getValues().filter((r) => r[0] === 'Q-DROPPED');
  assert.ok(dropped.length === 3 && dropped.every((r) => r[1] === 'CONSUMED'), 'every row for the job is finished');
});

test('retries share the per-run budget with new rows', () => {
  const fx = setup();
  const cap = fx.exported.WFB_INPUTS_PER_RUN;
  const tab = fx.ss.insertSheet('Flow3Input');
  tab.appendRow(fx.exported.WFB_FLOW3_HEADERS);
  const old = new Date(Date.now() - 45 * 60 * 1000);
  for (let i = 0; i < 4; i++) tab.appendRow([old, 'STALE-' + i, 'READY']);
  pending(fx, cap);
  const r = fx.exported.buildWarmUpFlowInputs();
  assert.equal(r.retried, 4);
  assert.equal(r.flow3, cap - 4);
  assert.equal(r.deferred, 4);
});

test('a Flow 3 job with no return after every retry gets the teacher\'s anchor; a past day\'s or a NOT_MEETING one does not', () => {
  const fx = setup();
  fx.sandbox.PropertiesService.getScriptProperties().setProperty('WARMUP_TEXT_BOX', 'all');
  const add = (id, date, status) => {
    const row = new Array(fx.exported.WQ25_COL_COUNT).fill('');
    row[0] = id; row[3] = 'Sam Student'; row[5] = date; row[8] = status;
    row[6] = JSON.stringify({ course_name: 'Sports Entertainment and Event Marketing', warmup_anchor: 'How does a team make money?' });
    fx.wq.appendRow(row);
  };
  add('Q-LOST', '2099-01-05', 'PENDING');
  add('Q-OLD', '2020-01-05', 'PENDING');
  add('Q-OFF', '2099-01-05', 'NOT_MEETING');
  add('Q-NEW', '2099-01-05', 'PENDING');
  const tab = fx.ss.insertSheet('Flow3Input');
  tab.appendRow(fx.exported.WFB_FLOW3_HEADERS);
  const old = new Date(Date.now() - 45 * 60 * 1000);
  const input = (id, status, at) => tab.appendRow([at || old, id, status]);
  ['Q-LOST', 'Q-OLD', 'Q-OFF'].forEach((id) => { input(id, 'RETRIED'); input(id, 'RETRIED'); input(id, 'READY'); });
  input('Q-NEW', 'RETRIED'); input('Q-NEW', 'READY'); // one retry left

  const r = fx.exported.buildWarmUpFlowInputs();
  assert.equal(r.fallback, 1);
  const statusOf = (id) => fx.wq.getRange(2, 1, 4, 9).getValues().find((x) => x[0] === id)[8];
  assert.equal(statusOf('Q-LOST'), 'DELIVERED');
  assert.equal(statusOf('Q-OLD'), 'PENDING', 'its day has passed');
  assert.equal(statusOf('Q-OFF'), 'NOT_MEETING');
  assert.equal(statusOf('Q-NEW'), 'PENDING', 'still has a retry');
  assert.equal(fx.ss.getSheetByName('WarmUpTextBox').getRange(2, 4).getValue(), 'How does a team make money?');
  const ret = fx.ss.getSheetByName('WarmUpFlowReturn').getRange(2, 1, 1, 7).getValues()[0];
  assert.deepEqual([ret[1], ret[2], ret[4]], [3, 'Q-LOST', 'HARVESTED']);
  assert.match(ret[6], /^ANCHOR_FALLBACK: no return from Studio after 2 retries/);
  const lost = tab.getRange(2, 2, tab.getLastRow() - 1, 2).getValues().filter((x) => x[0] === 'Q-LOST');
  assert.ok(lost.every((x) => x[1] === 'CONSUMED'));
  assert.equal(fx.exported.buildWarmUpFlowInputs().fallback, 0, 'a second run delivers nothing again');
});

// 2026-10-20: every warm-up answered in the text box sat at PENDING_EVAL,
// because the Flow 4 input builder skipped any row without a Doc_ID.
test('a text-box warm-up at PENDING_EVAL gets a Flow 4 input from its WarmUpTextBox row', () => {
  const fx = setup();
  const add = (id) => {
    const row = new Array(fx.exported.WQ25_COL_COUNT).fill('');
    row[0] = id; row[3] = 'Sam Student'; row[5] = '2026-10-19'; row[8] = 'PENDING_EVAL';
    row[12] = 3; row[18] = 'Teams sell tickets and sponsorships.';
    fx.wq.appendRow(row);
  };
  add('Q-TB');
  add('Q-NONE');
  const tb = fx.ss.insertSheet('WarmUpTextBox');
  tb.appendRow(['queue_id', 'lesson_date', 'bridge_text', 'warmup_text',
    'response_text', 'submitted_at', 'reply_text', 'replied_at']);
  tb.appendRow(['Q-TB', '2026-10-19', '', 'How does a team make money?',
    'Teams sell tickets and sponsorships.', new Date(), '', '']);

  const r = fx.exported.buildWarmUpFlowInputs();
  assert.equal(r.flow4, 1);
  assert.equal(r.skipped, 1, 'a row with neither a doc nor a text box is still skipped');
  const input = fx.ss.getSheetByName('Flow4Input');
  assert.equal(input.getLastRow(), 2);
  const [, id, status, prompt, response, wcs, , docId, promptText] = input.getRange(2, 1, 1, 9).getValues()[0];
  assert.deepEqual([id, status, prompt, response, wcs, docId],
    ['Q-TB', 'READY', 'How does a team make money?', 'Teams sell tickets and sponsorships.', 3, '']);
  assert.match(String(promptText), /How does a team make money\?/);
  assert.match(String(promptText), /Teams sell tickets and sponsorships\./);
});

// 2026-10-20: four of Wednesday's warm-ups ended at ERROR because Studio's
// output failed the plausibility check; the shape gate's anchor fallback now
// covers that too, and repairFailedWarmUps() delivers it for rows already
// failed.
const RET_HEADERS = ['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error'];
const ANCHOR = 'How does a team make money?';
function textBoxJob(fx, id, date, status) {
  fx.sandbox.PropertiesService.getScriptProperties().setProperty('WARMUP_TEXT_BOX', 'all');
  const row = new Array(fx.exported.WQ25_COL_COUNT).fill('');
  row[0] = id; row[3] = 'Sam Student'; row[5] = date; row[8] = status;
  row[6] = JSON.stringify({ course_name: 'Sports Entertainment and Event Marketing',
    course_objective: 'Explain sponsorship revenue streams', warmup_anchor: ANCHOR });
  fx.wq.appendRow(row);
}
const statusOf = (fx, id) => fx.wq.getRange(2, 1, fx.wq.getLastRow() - 1, 9).getValues().find((x) => x[0] === id)[8];

test('a Flow 3 return that fails the plausibility check delivers the teacher\'s anchor', () => {
  const fx = setup();
  textBoxJob(fx, 'Q-FAB', '2099-01-05', 'PENDING');
  const ret = fx.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(RET_HEADERS);
  ret.appendRow([new Date(), 3, 'Q-FAB', 'What is your favorite hobby, and why do you enjoy it?', '', 0, '']);

  const r = fx.exported.harvestWarmUpFlowReturns();
  assert.equal(r.applied, 1, JSON.stringify(r));
  assert.equal(statusOf(fx, 'Q-FAB'), 'DELIVERED');
  assert.equal(fx.ss.getSheetByName('WarmUpTextBox').getRange(2, 4).getValue(), ANCHOR);
  const after = ret.getRange(2, 1, 1, 7).getValues()[0];
  assert.equal(after[4], 'HARVESTED');
  assert.match(after[6], /^ANCHOR_FALLBACK: SUSPECT_FABRICATION: /);
});

// 2026-10-21: about 4 warm-ups a night went out as the anchor because the
// check compared them with the whole snapshot, whose longest words were
// competency rubric text. Flow 3's check reads the lesson text it adapts.
test('a Flow 3 warm-up that paraphrases the lesson is delivered as written', () => {
  const fx = setup();
  textBoxJob(fx, 'Q-OK', '2099-01-05', 'PENDING');
  const ret = fx.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(RET_HEADERS);
  const warmUp = 'A stadium sells naming rights, tickets and parking. Which of those sponsors would you call first?';
  ret.appendRow([new Date(), 3, 'Q-OK', warmUp, '', 0, '']);
  assert.equal(fx.exported.harvestWarmUpFlowReturns().applied, 1);
  assert.equal(fx.ss.getSheetByName('WarmUpTextBox').getRange(2, 4).getValue(), warmUp);
  assert.equal(ret.getRange(2, 7).getValue(), '', 'no fallback noted');
});

test('wfbFlow3Plausible_: every lesson\'s anchor returned unchanged passes; an off-topic warm-up does not', () => {
  const { exported } = setup();
  const la = loadGasFiles([path.join(CC, '55b_LessonAssignmentData.js')], ['LESSON_ASSIGNMENTS'])
    .exported.LESSON_ASSIGNMENTS;
  const lessons = Object.keys(la).map((k) => la[k]).filter((a) => a.warmupAnchor);
  assert.ok(lessons.length >= 60);
  lessons.forEach((a) => {
    const lesson = { warmup_anchor: a.warmupAnchor, objective: a.objective, vocabulary: a.vocabulary,
      pacing_unit_name: a.unitName, course_name: a.courseName,
      competency_rubrics: [{ skill_questions: ['Differentiate characteristics of entrepreneurship'] }] };
    assert.ok(exported.wfbFlow3Plausible_(lesson, a.warmupAnchor).ok, a.key);
  });
  const lesson = { warmup_anchor: ANCHOR, course_objective: 'Explain sponsorship revenue streams',
    course_name: 'Sports Entertainment and Event Marketing' };
  const off = exported.wfbFlow3Plausible_(lesson, 'Which sports entertainment event would you market?');
  assert.equal(off.ok, false, 'the course name alone is not engagement');
  assert.match(off.reason, /none of the lesson's distinguishing words \(\d+ checked\)$/);
  assert.match(exported.wfbFlow3Plausible_(lesson, 'Revenue? I am unable to access the lesson.').reason,
    /non-access phrase/);
});

test('repairFailedWarmUps delivers the anchor for a job failed as fabricated, not a past day\'s or another failure', () => {
  const fx = setup();
  textBoxJob(fx, 'Q-ERR', '2099-01-05', 'ERROR');
  textBoxJob(fx, 'Q-PAST', '2020-01-05', 'ERROR');
  textBoxJob(fx, 'Q-OTHER', '2099-01-05', 'ERROR');
  const ret = fx.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(RET_HEADERS);
  const fab = 'SUSPECT_FABRICATION: the output shares none of this row\'s distinguishing content';
  ret.appendRow([new Date(), 3, 'Q-ERR', 'x', 'FAILED', 3, fab]);
  ret.appendRow([new Date(), 3, 'Q-PAST', 'x', 'FAILED', 3, fab]);
  ret.appendRow([new Date(), 3, 'Q-OTHER', 'x', 'FAILED', 3, 'No WarmUpQueue row for Queue_ID Q-OTHER']);

  const preview = fx.exported.previewFailedWarmUpRepair();
  assert.deepEqual([preview.failed, preview.delivered, preview.pastDay], [2, 1, 1]);
  assert.equal(statusOf(fx, 'Q-ERR'), 'ERROR', 'the preview changes nothing');

  const r = fx.exported.repairFailedWarmUps();
  assert.deepEqual([r.failed, r.delivered, r.pastDay], [2, 1, 1]);
  assert.equal(statusOf(fx, 'Q-ERR'), 'DELIVERED');
  assert.equal(statusOf(fx, 'Q-PAST'), 'ERROR');
  assert.equal(statusOf(fx, 'Q-OTHER'), 'ERROR');
  const tb = fx.ss.getSheetByName('WarmUpTextBox');
  assert.equal(tb.getLastRow(), 2);
  assert.deepEqual([tb.getRange(2, 1).getValue(), tb.getRange(2, 4).getValue()], ['Q-ERR', ANCHOR]);
  const row = ret.getRange(2, 1, 1, 7).getValues()[0];
  assert.equal(row[4], 'HARVESTED');
  assert.match(row[6], /^ANCHOR_FALLBACK: SUSPECT_FABRICATION/);
  assert.equal(fx.exported.repairFailedWarmUps().delivered, 0, 'a second run does nothing');
});

// 2026-10-20: one of the first three text-box answers scored by Flow 4 sat at
// EVAL_ERROR: the feedback paraphrased the answer, and the plausibility check
// wanted one of its longest words verbatim. Flow 4's check now matches a
// word's first letters, counts the prompt's words, and allows feedback that
// says an answer is thin.
const PROMPT = 'How does a sports franchise generate revenue?';
function scoringJob(fx, id, status, answer) {
  const row = new Array(fx.exported.WQ25_COL_COUNT).fill('');
  row[0] = id; row[3] = 'Sam Student'; row[5] = '2026-10-19'; row[8] = status;
  row[12] = 2; row[18] = answer;
  fx.wq.appendRow(row);
  let input = fx.ss.getSheetByName('Flow4Input');
  if (!input) {
    input = fx.ss.insertSheet('Flow4Input');
    input.appendRow(fx.exported.WFB_FLOW4_HEADERS);
  }
  input.appendRow([new Date(), id, 'READY', PROMPT, answer, 2, 0, '', 'prompt']);
}
const evaluation = (feedback) => JSON.stringify({ grammar: 1, engagement: 2, feedback });
function harvestOne(fx, id, feedback) {
  let ret = fx.ss.getSheetByName('WarmUpFlowReturn');
  if (!ret) { ret = fx.ss.insertSheet('WarmUpFlowReturn'); ret.appendRow(RET_HEADERS); }
  ret.appendRow([new Date(), 4, id, evaluation(feedback), '', 0, '']);
  return fx.exported.harvestWarmUpFlowReturns();
}

test('Flow 4 scores feedback that paraphrases a misspelled answer', () => {
  const fx = setup();
  scoringJob(fx, 'Q-PARA', 'PENDING_EVAL', 'Teams make mony from sponsorships and merchandize.');
  const r = harvestOne(fx, 'Q-PARA', 'You named sponsorship and merchandise sales as two ways teams earn money.');
  assert.equal(r.applied, 1, JSON.stringify(r));
  assert.equal(statusOf(fx, 'Q-PARA'), 'SCORED');
});

test('Flow 4 counts the prompt\'s words, and allows feedback that calls an answer thin', () => {
  const fx = setup();
  scoringJob(fx, 'Q-THIN', 'PENDING_EVAL', 'tikets i think');
  const r = harvestOne(fx, 'Q-THIN',
    'There is not enough information here yet: name two ways a franchise brings in revenue.');
  assert.equal(r.applied, 1, JSON.stringify(r));
  assert.equal(statusOf(fx, 'Q-THIN'), 'SCORED');
});

test('Flow 4 still fails feedback that says it could not see the answer, or is about nothing in it', () => {
  const fx = setup();
  scoringJob(fx, 'Q-NOACCESS', 'PENDING_EVAL', 'Teams sell tickets and sponsorships.');
  scoringJob(fx, 'Q-GENERIC', 'PENDING_EVAL', 'Teams sell tickets and sponsorships.');
  harvestOne(fx, 'Q-NOACCESS', 'I am unable to view the sponsorship answer, so here is general advice.');
  const r = harvestOne(fx, 'Q-GENERIC', 'Great work overall, well done!');
  assert.equal(r.applied, 0, JSON.stringify(r));
  assert.equal(statusOf(fx, 'Q-NOACCESS'), 'PENDING_EVAL');
  assert.equal(statusOf(fx, 'Q-GENERIC'), 'PENDING_EVAL');
  const errors = fx.ss.getSheetByName('WarmUpFlowReturn').getRange(2, 7, 2, 1).getValues().map((x) => x[0]);
  assert.match(errors[0], /^SUSPECT_FABRICATION: .*non-access phrase \("unable to view"\)/);
  assert.match(errors[1], /^SUSPECT_FABRICATION: .*\(\d+ checked\)$/);
  assert.doesNotMatch(errors[1], /sponsorships|tickets/, 'the reason never quotes the answer');
});

test('repairFailedWarmUpScoring scores an EVAL_ERROR job that passes the Flow 4 check now', () => {
  const fx = setup();
  scoringJob(fx, 'Q-EVAL', 'EVAL_ERROR', 'Teams make mony from sponsorships and merchandize.');
  scoringJob(fx, 'Q-STILL', 'EVAL_ERROR', 'Teams sell tickets and sponsorships.');
  scoringJob(fx, 'Q-OTHER', 'EVAL_ERROR', 'Teams sell tickets and sponsorships.');
  const ret = fx.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(RET_HEADERS);
  const fab = 'SUSPECT_FABRICATION: the output shares none of this row\'s distinguishing content';
  ret.appendRow([new Date(), 4, 'Q-EVAL',
    evaluation('You named sponsorship and merchandise sales as two ways teams earn money.'), 'FAILED', 3, fab]);
  ret.appendRow([new Date(), 4, 'Q-STILL', evaluation('Great work overall, well done!'), 'FAILED', 3, fab]);
  ret.appendRow([new Date(), 4, 'Q-OTHER', 'not json', 'FAILED', 3, 'GEMINI_JSON_PARSE_FAILED: x']);

  const preview = fx.exported.previewFailedWarmUpScoring();
  assert.deepEqual([preview.failed, preview.scored, preview.stillFailing], [2, 1, 1]);
  assert.equal(statusOf(fx, 'Q-EVAL'), 'EVAL_ERROR', 'the preview changes nothing');

  const r = fx.exported.repairFailedWarmUpScoring();
  assert.deepEqual([r.failed, r.scored, r.stillFailing], [2, 1, 1]);
  assert.equal(statusOf(fx, 'Q-EVAL'), 'SCORED');
  assert.equal(statusOf(fx, 'Q-STILL'), 'EVAL_ERROR');
  assert.equal(statusOf(fx, 'Q-OTHER'), 'EVAL_ERROR');
  const row = ret.getRange(2, 1, 1, 7).getValues()[0];
  assert.deepEqual([row[4], row[6]], ['HARVESTED', '']);
  assert.equal(fx.ss.getSheetByName('Flow4Input').getRange(2, 3).getValue(), 'CONSUMED');
  assert.equal(fx.exported.repairFailedWarmUpScoring().scored, 0, 'a second run does nothing');
});

// 2026-10-26: one job's saved feedback still failed the check, so the repair
// above left it at EVAL_ERROR and its card read "Being checked" for good.
test('rescoreEvalErrorWarmUps sends an EVAL_ERROR answer to Flow 4 again', () => {
  const fx = setup();
  const answer = 'Teams sell tickets and sponsorships.';
  scoringJob(fx, 'Q-RESEND', 'EVAL_ERROR', answer);
  scoringJob(fx, 'Q-NOBOX', 'EVAL_ERROR', answer); // no doc and no text-box row
  scoringJob(fx, 'Q-DONE', 'SCORED', answer);
  const tb = fx.ss.insertSheet('WarmUpTextBox');
  tb.appendRow(['queue_id', 'lesson_date', 'bridge_text', 'warmup_text', 'response_text',
    'submitted_at', 'reply_text', 'replied_at']);
  tb.appendRow(['Q-RESEND', '2026-10-19', '', PROMPT, answer, new Date(), '', '']);
  const ret = fx.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(RET_HEADERS);
  const fab = 'SUSPECT_FABRICATION: the output shares none of this row\'s distinguishing content';
  ret.appendRow([new Date(), 4, 'Q-RESEND', evaluation('Great work overall, well done!'), 'FAILED', 3, fab]);
  ret.appendRow([new Date(), 4, 'Q-DONE', evaluation('x'), 'HARVESTED', 1, '']);
  const input = fx.ss.getSheetByName('Flow4Input');

  const preview = fx.exported.previewEvalErrorRescore();
  assert.deepEqual([preview.evalError, preview.resent, preview.noAnswer], [2, 1, 1]);
  assert.deepEqual(preview.byDate, { '2026-10-19': 1 });
  assert.equal(statusOf(fx, 'Q-RESEND'), 'EVAL_ERROR', 'the preview changes nothing');
  assert.equal(input.getLastRow(), 4);
  assert.equal(ret.getLastRow(), 3);

  const r = fx.exported.rescoreEvalErrorWarmUps();
  assert.deepEqual([r.evalError, r.resent, r.noAnswer], [2, 1, 1]);
  assert.equal(statusOf(fx, 'Q-RESEND'), 'PENDING_EVAL');
  assert.equal(statusOf(fx, 'Q-NOBOX'), 'EVAL_ERROR');
  const rows = input.getRange(2, 1, input.getLastRow() - 1, 9).getValues();
  const mine = rows.filter((x) => x[1] === 'Q-RESEND');
  assert.deepEqual(mine.map((x) => x[2]), ['CONSUMED', 'READY'], 'the old job closed, a new one open');
  assert.equal(mine[1][4], answer);
  assert.match(mine[1][8], /Teams sell tickets/, 'the new job carries its prompt text');
  const left = ret.getRange(2, 1, ret.getLastRow() - 1, 7).getValues();
  assert.deepEqual(left.map((x) => x[2]), ['Q-DONE'], 'the FAILED return is gone; others stay');

  // The new feedback comes back and is scored as usual.
  const h = harvestOne(fx, 'Q-RESEND', 'You named ticket sales and sponsorships as ways a team earns money.');
  assert.equal(h.applied, 1, JSON.stringify(h));
  assert.equal(statusOf(fx, 'Q-RESEND'), 'SCORED');
  assert.equal(fx.exported.rescoreEvalErrorWarmUps().resent, 0, 'a second run sends nothing new');
});

test('rescoreEvalErrorWarmUps sends at most WFB_INPUTS_PER_RUN a run', () => {
  const fx = setup();
  const cap = fx.exported.WFB_INPUTS_PER_RUN;
  const tb = fx.ss.insertSheet('WarmUpTextBox');
  tb.appendRow(['queue_id', 'lesson_date', 'bridge_text', 'warmup_text', 'response_text',
    'submitted_at', 'reply_text', 'replied_at']);
  for (let i = 0; i < cap + 3; i++) {
    scoringJob(fx, 'Q-' + i, 'EVAL_ERROR', 'Teams sell tickets.');
    tb.appendRow(['Q-' + i, '2026-10-19', '', PROMPT, 'Teams sell tickets.', new Date(), '', '']);
  }
  const r = fx.exported.rescoreEvalErrorWarmUps();
  assert.deepEqual([r.resent, r.deferred], [cap, 3]);
  const r2 = fx.exported.rescoreEvalErrorWarmUps();
  assert.deepEqual([r2.resent, r2.deferred], [3, 0]);
});

// 2026-10-26: feedback that paraphrased the answer ("market value",
// "industry standards") failed the check twice; the teacher read it and
// accepted it. The score-range check still applies.
test('acceptFailedWarmUpFeedback scores feedback the check missed, but never an out-of-range score', () => {
  const fx = setup();
  scoringJob(fx, 'Q-PARAPHRASE', 'EVAL_ERROR', 'I would ask for more money and see what they say.');
  scoringJob(fx, 'Q-RANGE', 'EVAL_ERROR', 'I would ask for more money and see what they say.');
  const ret = fx.ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(RET_HEADERS);
  const fab = "SUSPECT_FABRICATION: the output shares none of the answer's or prompt's distinguishing words (10 checked)";
  ret.appendRow([new Date(), 4, 'Q-PARAPHRASE', evaluation('Research your market value before the room.'), 'FAILED', 3, fab]);
  ret.appendRow([new Date(), 4, 'Q-RANGE', JSON.stringify({ grammar: 1, engagement: 9, feedback: 'x' }), 'FAILED', 3, fab]);

  assert.equal(fx.exported.previewFailedWarmUpScoring().scored, 0, 'the check still misses it');
  const preview = fx.exported.previewAcceptFailedWarmUpFeedback();
  assert.deepEqual([preview.failed, preview.scored, preview.stillFailing], [2, 1, 1]);
  assert.deepEqual(preview.byDate, { '2026-10-19': 1 });
  assert.equal(statusOf(fx, 'Q-PARAPHRASE'), 'EVAL_ERROR', 'the preview changes nothing');

  const r = fx.exported.acceptFailedWarmUpFeedback();
  assert.deepEqual([r.scored, r.stillFailing], [1, 1]);
  assert.equal(statusOf(fx, 'Q-PARAPHRASE'), 'SCORED');
  assert.equal(statusOf(fx, 'Q-RANGE'), 'EVAL_ERROR');
  const row = ret.getRange(2, 1, 1, 7).getValues()[0];
  assert.equal(row[4], 'HARVESTED');
  assert.match(row[6], /^ACCEPTED_BY_TEACHER: SUSPECT_FABRICATION/);
  assert.equal(fx.exported.acceptFailedWarmUpFeedback().scored, 0, 'a second run does nothing');
});
