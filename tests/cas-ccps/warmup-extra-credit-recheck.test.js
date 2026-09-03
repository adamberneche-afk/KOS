'use strict';
// Regression tests for _recheckExtraCredit_() in 25_WarmUpWriter.js.
//
// FIXES A REAL BUG: runWarmUpEvaluation()'s main loop only ever examines a
// WarmUpRegistry row on the one night lesson_date === yesterday. The async
// Studio Flow (studio-steps/FinalizeWarmUpScoreStep.gs) writes feedback
// into the doc and total_score into the row LATER — after that window has
// already closed. So evaluateWarmUpDoc_()'s FEEDBACK_END_MARKER scan could
// never actually find a student's extra-credit reply, and extra_credit
// could never become 1. This sweep re-scans already-finalized rows within
// a bounded window to actually catch it.
//
// Loaded together with 22_LessonContextHandler.js (_normalizeLessonDateCell_)
// and 23_StudentProfileManager.js (formatDateYMD_) — both bound to the same
// cas-ccps:central-ledger GAS project 25_WarmUpWriter.js is (see
// tools/gas-lint/project-map.json), matching warmup-bridge.test.js's own
// loading rationale.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const PATHS = [
  path.join(SCRIPTS, '00_SharedConfig.js'),
  path.join(SCRIPTS, '22_LessonContextHandler.js'),
  path.join(SCRIPTS, '23_StudentProfileManager.js'),
  path.join(SCRIPTS, '25_WarmUpWriter.js'),
];
const EXPORTS = [
  'runWarmUpEvaluation',
  'WQ25_QUEUE_ID', 'WQ25_STATUS', 'WQ25_TOTAL_SCORE', 'WQ25_EXTRA_CREDIT', 'WQ25_COL_COUNT',
  'WR_WARMUP_ID', 'WR_QUEUE_ID', 'WR_LESSON_ID', 'WR_LESSON_DATE', 'WR_STUDENT_EMAIL',
  'WR_STUDENT_NAME', 'WR_TEACHER_EMAIL', 'WR_DOC_ID', 'WR_DOC_URL', 'WR_GENERATED_AT',
  'WR_TOTAL_SCORE', 'WR_EXTRA_CREDIT', 'WR_TERM', 'WR_EXTRA_CREDIT_CHECKED', 'WR_COL_COUNT',
];

function load() {
  return loadGasFiles(PATHS, EXPORTS);
}

function setUpFixture(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  props.setProperty('TEACHER_NAME', 'Ms. Smith');

  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));

  const wr = ss.insertSheet('WarmUpRegistry');
  wr.appendRow([
    'warmup_id', 'queue_id', 'lesson_id', 'lesson_date', 'student_email',
    'student_name', 'teacher_email', 'doc_id', 'doc_url', 'generated_at',
    'total_score', 'extra_credit', 'term', 'extra_credit_checked',
  ]);

  return { ss, wq, wr };
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function makeQueueRow(exported, { queueId, totalScore = 6, extraCredit = 0 }) {
  const row = new Array(exported.WQ25_COL_COUNT).fill('');
  row[exported.WQ25_QUEUE_ID] = queueId;
  row[exported.WQ25_STATUS] = 'SCORED';
  row[exported.WQ25_TOTAL_SCORE] = totalScore;
  row[exported.WQ25_EXTRA_CREDIT] = extraCredit;
  return row;
}

function makeRegistryRow(exported, { queueId, docId, lessonDate, totalScore = 6, extraCreditChecked = '' }) {
  const row = new Array(exported.WR_COL_COUNT).fill('');
  row[exported.WR_QUEUE_ID] = queueId;
  row[exported.WR_LESSON_DATE] = lessonDate;
  row[exported.WR_TEACHER_EMAIL] = 'teacher@ccpsnet.net';
  row[exported.WR_DOC_ID] = docId;
  row[exported.WR_TOTAL_SCORE] = totalScore;
  row[exported.WR_EXTRA_CREDIT] = 0;
  row[exported.WR_EXTRA_CREDIT_CHECKED] = extraCreditChecked;
  return row;
}

// Same marker strings 25_WarmUpWriter.js's own constants use.
function scoredDocWithReply(sandbox, replyWords) {
  const doc = sandbox.DocumentApp.create('Warm-Up Doc');
  doc.getBody().appendParagraph(
    '── WARM-UP PROMPT ──\nprompt text\n── END PROMPT ──\n\n' +
    '── YOUR RESPONSE ──\nA real warm-up response with enough words.\n\n' +
    '── FEEDBACK ──\nGreat job on this.\n\nWord count: 8 words\n── END FEEDBACK ──\n' +
    (replyWords || '')
  );
  return doc.getId();
}

test('a reply written after feedback is credited on a later night\'s run', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);

  const docId = scoredDocWithReply(sandbox, 'This is a genuine extra credit reply with plenty of words in it.');
  fx.wq.appendRow(makeQueueRow(exported, { queueId: 'WUQ-1', totalScore: 6 }));
  fx.wr.appendRow(makeRegistryRow(exported, { queueId: 'WUQ-1', docId, lessonDate: daysAgoStr(3), totalScore: 6 }));

  exported.runWarmUpEvaluation();

  const wrRow = fx.wr.getRange(2, 1, 1, exported.WR_COL_COUNT).getValues()[0];
  assert.equal(wrRow[exported.WR_EXTRA_CREDIT], 1, 'extra_credit must be set once a real reply is found');
  assert.equal(wrRow[exported.WR_TOTAL_SCORE], 7, 'total_score must be incremented by 1');
  assert.ok(wrRow[exported.WR_EXTRA_CREDIT_CHECKED], 'extra_credit_checked must be stamped once credited');

  const wqRow = fx.wq.getRange(2, 1, 1, exported.WQ25_COL_COUNT).getValues()[0];
  assert.equal(wqRow[exported.WQ25_EXTRA_CREDIT], 1, 'WarmUpQueue mirror must also be updated');
  assert.equal(wqRow[exported.WQ25_TOTAL_SCORE], 7);
});

test('this sweep runs even on a quiet night with nothing new to evaluate', () => {
  // Regression guard for a bug introduced and caught while building this
  // very fix: runWarmUpEvaluation() returns early when toEvaluate is
  // empty (no lessons from exactly "yesterday") — the recheck sweep must
  // not be gated behind that early return, or it would never run on any
  // night without a fresh lesson.
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);

  const docId = scoredDocWithReply(sandbox, 'This reply has more than ten words in it, easily.');
  fx.wq.appendRow(makeQueueRow(exported, { queueId: 'WUQ-2', totalScore: 5 }));
  fx.wr.appendRow(makeRegistryRow(exported, { queueId: 'WUQ-2', docId, lessonDate: daysAgoStr(2), totalScore: 5 }));
  // No row for "yesterday" exists at all — toEvaluate will be empty.

  exported.runWarmUpEvaluation();

  const wrRow = fx.wr.getRange(2, 1, 1, exported.WR_COL_COUNT).getValues()[0];
  assert.equal(wrRow[exported.WR_EXTRA_CREDIT], 1, 'the sweep must still run and credit this row');
});

test('a row still within the recheck window with no reply yet is left unstamped', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);

  const docId = scoredDocWithReply(sandbox, ''); // no reply after feedback yet
  fx.wq.appendRow(makeQueueRow(exported, { queueId: 'WUQ-3', totalScore: 4 }));
  fx.wr.appendRow(makeRegistryRow(exported, { queueId: 'WUQ-3', docId, lessonDate: daysAgoStr(2), totalScore: 4 }));

  exported.runWarmUpEvaluation();

  const wrRow = fx.wr.getRange(2, 1, 1, exported.WR_COL_COUNT).getValues()[0];
  assert.equal(wrRow[exported.WR_EXTRA_CREDIT], 0);
  assert.equal(wrRow[exported.WR_EXTRA_CREDIT_CHECKED], '', 'unstamped so a later run checks again');
  assert.equal(wrRow[exported.WR_TOTAL_SCORE], 4, 'score must not change without a real reply');
});

test('a row past the recheck window with no reply is stamped done, not credited (termination)', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);

  const docId = scoredDocWithReply(sandbox, ''); // still no reply
  fx.wq.appendRow(makeQueueRow(exported, { queueId: 'WUQ-4', totalScore: 3 }));
  fx.wr.appendRow(makeRegistryRow(exported, { queueId: 'WUQ-4', docId, lessonDate: daysAgoStr(10), totalScore: 3 }));

  exported.runWarmUpEvaluation();

  const wrRow = fx.wr.getRange(2, 1, 1, exported.WR_COL_COUNT).getValues()[0];
  assert.equal(wrRow[exported.WR_EXTRA_CREDIT], 0);
  assert.ok(wrRow[exported.WR_EXTRA_CREDIT_CHECKED], 'must be stamped so the sweep stops re-scanning this row');
  assert.equal(wrRow[exported.WR_TOTAL_SCORE], 3);
});

test('a row already stamped extra_credit_checked is never re-scanned', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox);

  // If this ever got re-scanned, the reply present in the doc would credit
  // it — the stamp must prevent that from happening at all.
  const docId = scoredDocWithReply(sandbox, 'A late reply that must never be picked up again.');
  fx.wq.appendRow(makeQueueRow(exported, { queueId: 'WUQ-5', totalScore: 5 }));
  fx.wr.appendRow(makeRegistryRow(exported, {
    queueId: 'WUQ-5', docId, lessonDate: daysAgoStr(4), totalScore: 5, extraCreditChecked: new sandbox.Date(),
  }));

  exported.runWarmUpEvaluation();

  const wrRow = fx.wr.getRange(2, 1, 1, exported.WR_COL_COUNT).getValues()[0];
  assert.equal(wrRow[exported.WR_EXTRA_CREDIT], 0, 'an already-checked row must not be re-credited');
  assert.equal(wrRow[exported.WR_TOTAL_SCORE], 5);
});

test('self-healing: extra_credit_checked column is added to a pre-existing WarmUpRegistry sheet', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');

  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));

  // Old 13-column header — no extra_credit_checked, matching a deployment
  // that predates this fix.
  const wr = ss.insertSheet('WarmUpRegistry');
  wr.appendRow([
    'warmup_id', 'queue_id', 'lesson_id', 'lesson_date', 'student_email',
    'student_name', 'teacher_email', 'doc_id', 'doc_url', 'generated_at',
    'total_score', 'extra_credit', 'term',
  ]);

  exported.runWarmUpEvaluation();

  assert.equal(wr.getRange(1, 14).getValue(), 'extra_credit_checked');
});
