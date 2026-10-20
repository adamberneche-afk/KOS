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
  '04_Form2_TurnInGate.js', '24_WarmUpBridge.js', '25_WarmUpWriter.js', '37_FlowInputBuilder.js',
  '40_FlowPrompts.js', '41_WarmUpFlowBridge.js']
  .map((f) => path.join(CC, f));
const EXPOSE = ['buildWarmUpFlowInputs', 'wfbRetryStaleInputs_', 'wfbConsumeInputRow_',
  'WFB_INPUTS_PER_RUN', 'WFB_FLOW3_HEADERS', 'WQ25_COL_COUNT'];

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
