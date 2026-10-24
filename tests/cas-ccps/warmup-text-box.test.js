'use strict';
// WARMUP_TEXT_BOX end to end on the Ledger side: Flow 3's harvest (41)
// writes the warm-up to the WarmUpTextBox tab and makes no doc; Job 1 (25)
// registers it without a doc; the nightly run (25) scores the answer the
// Student Dashboard saved, stamps an empty one INCOMPLETE, and credits a
// reply of at least 10 words. The dashboard's own saving is covered in
// student-dashboard-warmups.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CC = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const FILES = ['00_SharedConfig.js', '22_LessonContextHandler.js', '23_StudentProfileManager.js',
  '04_Form2_TurnInGate.js', '25_WarmUpWriter.js', '37_FlowInputBuilder.js', '41_WarmUpFlowBridge.js']
  .map((f) => path.join(CC, f));
const EXPOSE = ['wfbApplyFlow3_', 'wfbFindQueueRow_', '_registerDeliveredWarmUps_', 'runWarmUpEvaluation',
  'warmUpTextBoxFor_', 'WQ25_COL_COUNT', 'WQ25_STATUS', 'WQ25_DOC_ID', 'WQ25_RESPONSE_TEXT',
  'WQ25_WORD_COUNT_SCORE', 'WQ25_TOTAL_SCORE', 'WQ25_EXTRA_CREDIT', 'WR_COL_COUNT', 'WR_QUEUE_ID',
  'WR_DOC_ID', 'WR_TOTAL_SCORE', 'WR_EXTRA_CREDIT', 'WTB'];

function daysAgoStr(k) {
  const d = new Date();
  d.setDate(d.getDate() - k);
  const pad = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function setup(flag) {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  props.setProperty('TEACHER_NAME', 'Teacher');
  if (flag) props.setProperty('WARMUP_TEXT_BOX', flag);
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  const wr = ss.insertSheet('WarmUpRegistry');
  wr.appendRow(['warmup_id', 'queue_id', 'lesson_id', 'lesson_date', 'student_email', 'student_name',
    'teacher_email', 'doc_id', 'doc_url', 'generated_at', 'total_score', 'extra_credit', 'term', 'extra_credit_checked']);
  return { exported, sandbox, ss, wq, wr };
}

function pendingRow(exported, queueId, lessonDate) {
  const row = new Array(exported.WQ25_COL_COUNT).fill('');
  row[0] = queueId;
  row[1] = 'LES-1';
  row[2] = 'student@ccpsnet.net';
  row[3] = 'Sam Student';
  row[4] = 'student@ccpsnet.net';
  row[5] = lessonDate;
  row[6] = JSON.stringify({ admin_root_folder_id: 'root', course_name: 'Sports Entertainment and Event Marketing',
    teacher_name: 'Teacher', period: '1', learning_objective: 'Stadium pricing strategy for bottled water' });
  row[8] = 'PENDING';
  return row;
}

const RAW = 'Sam, why would a fan pay five dollars for stadium water? Think about pricing strategy.';

function deliver(fx, queueId, lessonDate) {
  fx.wq.appendRow(pendingRow(fx.exported, queueId, lessonDate));
  const found = fx.exported.wfbFindQueueRow_(fx.wq, queueId);
  return fx.exported.wfbApplyFlow3_(fx.wq, found, queueId, RAW);
}

test('the flag is per course, like the other shared switches', () => {
  const fx = setup('8175');
  assert.equal(fx.exported.warmUpTextBoxFor_('Sports Entertainment and Event Marketing'), true);
  assert.equal(fx.exported.warmUpTextBoxFor_('Sports Entertainment and Event Management'), false);
  assert.equal(setup().exported.warmUpTextBoxFor_('Sports Entertainment and Event Marketing'), false, 'off by default');
});

test('Flow 3 with the flag on: the warm-up goes to WarmUpTextBox, no doc, DELIVERED; a retry adds nothing', () => {
  const fx = setup('all');
  assert.deepEqual(deliver(fx, 'WQ-1', daysAgoStr(0)), { ok: true });
  const wqRow = fx.wq.getRange(2, 1, 1, fx.exported.WQ25_COL_COUNT).getValues()[0];
  assert.equal(wqRow[fx.exported.WQ25_STATUS], 'DELIVERED');
  assert.equal(wqRow[fx.exported.WQ25_DOC_ID], '');
  const tb = fx.ss.getSheetByName('WarmUpTextBox');
  assert.equal(tb.getLastRow(), 2);
  assert.equal(tb.getRange(2, fx.exported.WTB.WARMUP + 1).getValue(), RAW);
  assert.equal(tb.getRange(2, fx.exported.WTB.LESSON_DATE + 1).getValue(), daysAgoStr(0));

  fx.wq.getRange(2, fx.exported.WQ25_STATUS + 1).setValue('PENDING');
  fx.exported.wfbApplyFlow3_(fx.wq, fx.exported.wfbFindQueueRow_(fx.wq, 'WQ-1'), 'WQ-1', RAW);
  assert.equal(tb.getLastRow(), 2, 'no second row');
});

test('registered without a doc, then the saved answer is scored the next night; an empty one is INCOMPLETE', () => {
  const fx = setup('all');
  deliver(fx, 'WQ-A', daysAgoStr(1));
  deliver(fx, 'WQ-B', daysAgoStr(1));
  fx.exported._registerDeliveredWarmUps_();
  const wr = fx.wr.getRange(2, 1, 2, fx.exported.WR_COL_COUNT).getValues();
  assert.deepEqual(wr.map((r) => [r[fx.exported.WR_QUEUE_ID], r[fx.exported.WR_DOC_ID]]), [['WQ-A', ''], ['WQ-B', '']]);

  const tb = fx.ss.getSheetByName('WarmUpTextBox');
  const answer = 'Fans pay more because the stadium is the only place to buy water and the experience is part of the price they accept.';
  tb.getRange(2, fx.exported.WTB.RESPONSE + 1).setValue(answer);

  fx.exported.runWarmUpEvaluation();
  const [a, b] = fx.wq.getRange(2, 1, 2, fx.exported.WQ25_COL_COUNT).getValues();
  assert.equal(a[fx.exported.WQ25_STATUS], 'PENDING_EVAL');
  assert.equal(a[fx.exported.WQ25_RESPONSE_TEXT], answer);
  assert.equal(a[fx.exported.WQ25_WORD_COUNT_SCORE], 3, '23 words');
  assert.equal(b[fx.exported.WQ25_STATUS], 'INCOMPLETE');
});

test('a late answer: an INCOMPLETE warm-up answered afterwards is scored on a later night, with no extra credit', () => {
  const fx = setup('all');
  deliver(fx, 'WQ-L', daysAgoStr(1));
  deliver(fx, 'WQ-OLD', daysAgoStr(3)); // stamped INCOMPLETE on an earlier night
  fx.exported._registerDeliveredWarmUps_();
  fx.wq.getRange(3, fx.exported.WQ25_STATUS + 1).setValue('INCOMPLETE');
  fx.wr.getRange(3, fx.exported.WR_TOTAL_SCORE + 1).setValue(0);

  fx.exported.runWarmUpEvaluation();
  assert.equal(fx.wq.getRange(2, fx.exported.WQ25_STATUS + 1).getValue(), 'INCOMPLETE', 'blank on its night');
  assert.equal(fx.wq.getRange(3, fx.exported.WQ25_STATUS + 1).getValue(), 'INCOMPLETE', 'still blank: left alone');

  const tb = fx.ss.getSheetByName('WarmUpTextBox');
  const answer = 'Fans pay more because the stadium is the only place to buy water and the experience is part of the price.';
  tb.getRange(2, fx.exported.WTB.RESPONSE + 1).setValue(answer);
  tb.getRange(3, fx.exported.WTB.RESPONSE + 1).setValue(answer);
  fx.exported.runWarmUpEvaluation();
  [2, 3].forEach((r) => {
    const row = fx.wq.getRange(r, 1, 1, fx.exported.WQ25_COL_COUNT).getValues()[0];
    assert.equal(row[fx.exported.WQ25_STATUS], 'PENDING_EVAL', 'parked for Flow 4 like an on-time answer');
    assert.equal(row[fx.exported.WQ25_RESPONSE_TEXT], answer);
    assert.equal(row[fx.exported.WQ25_EXTRA_CREDIT], 0);
  });

  fx.exported.runWarmUpEvaluation();
  assert.equal(fx.wq.getRange(2, fx.exported.WQ25_STATUS + 1).getValue(), 'PENDING_EVAL', 'picked up once');
});

test('extra credit: a reply of 10+ words saved on the dashboard is credited', () => {
  const fx = setup('all');
  deliver(fx, 'WQ-C', daysAgoStr(3));
  deliver(fx, 'WQ-D', daysAgoStr(3));
  fx.exported._registerDeliveredWarmUps_();
  [2, 3].forEach((r) => {
    fx.wq.getRange(r, fx.exported.WQ25_STATUS + 1).setValue('SCORED');
    fx.wq.getRange(r, fx.exported.WQ25_TOTAL_SCORE + 1).setValue(6);
    fx.wr.getRange(r, fx.exported.WR_TOTAL_SCORE + 1).setValue(6);
  });
  const tb = fx.ss.getSheetByName('WarmUpTextBox');
  tb.getRange(2, fx.exported.WTB.REPLY + 1).setValue('I see now that the location lets them charge whatever fans will accept.');
  tb.getRange(3, fx.exported.WTB.REPLY + 1).setValue('Thanks!');

  fx.exported.runWarmUpEvaluation();
  const wr = fx.wr.getRange(2, 1, 2, fx.exported.WR_COL_COUNT).getValues();
  assert.deepEqual(wr.map((r) => [r[fx.exported.WR_TOTAL_SCORE], r[fx.exported.WR_EXTRA_CREDIT]]), [[7, 1], [6, '']]);
  const wq = fx.wq.getRange(2, 1, 1, fx.exported.WQ25_COL_COUNT).getValues()[0];
  assert.deepEqual([wq[fx.exported.WQ25_TOTAL_SCORE], wq[fx.exported.WQ25_EXTRA_CREDIT]], [7, 1]);
});

test('Flow 3 with the flag on: a blank teacher_name still delivers (no folder is needed); a doc still needs it', () => {
  const fx = setup('8175');
  const row = pendingRow(fx.exported, 'WQ-T', daysAgoStr(0));
  const snap = JSON.parse(row[6]);
  snap.teacher_name = '';
  row[6] = JSON.stringify(snap);
  fx.wq.appendRow(row);
  assert.deepEqual(fx.exported.wfbApplyFlow3_(fx.wq, fx.exported.wfbFindQueueRow_(fx.wq, 'WQ-T'), 'WQ-T', RAW), { ok: true });
  assert.equal(fx.wq.getRange(2, fx.exported.WQ25_STATUS + 1).getValue(), 'DELIVERED');

  snap.course_name = 'Sports Entertainment and Event Management'; // 8177: flag off, so a doc
  const docRow = pendingRow(fx.exported, 'WQ-U', daysAgoStr(0));
  docRow[6] = JSON.stringify(snap);
  fx.wq.appendRow(docRow);
  const res = fx.exported.wfbApplyFlow3_(fx.wq, fx.exported.wfbFindQueueRow_(fx.wq, 'WQ-U'), 'WQ-U', RAW);
  assert.equal(res.error, 'FOLDER_PATH_FIELDS_MISSING');
});

test('a NOT_MEETING warm-up (24: its period does not meet that day) is never scored INCOMPLETE', () => {
  const fx = setup('all');
  deliver(fx, 'WQ-N', daysAgoStr(1));
  fx.exported._registerDeliveredWarmUps_();
  fx.wq.getRange(2, fx.exported.WQ25_STATUS + 1).setValue('NOT_MEETING');
  fx.exported.runWarmUpEvaluation();
  assert.equal(fx.wq.getRange(2, fx.exported.WQ25_STATUS + 1).getValue(), 'NOT_MEETING');
  assert.equal(fx.wr.getRange(2, fx.exported.WR_TOTAL_SCORE + 1).getValue(), '');
});

// WarmUpQueue's timing columns (2026-10-23): delivered_at on DELIVERED (41),
// answered_at at the nightly scoring (25), after archive_status.
test('timing: delivered_at is set once on delivery, answered_at from the saved answer; an empty one has none', () => {
  const fx = setup('all');
  deliver(fx, 'WQ-A', daysAgoStr(1));
  deliver(fx, 'WQ-B', daysAgoStr(1));
  assert.deepEqual(fx.wq.getRange(1, 22, 1, 3).getValues()[0], ['archive_status', 'delivered_at', 'answered_at']);
  const firstDelivered = fx.wq.getRange(2, 23).getValue();
  assert.equal(Object.prototype.toString.call(firstDelivered), '[object Date]');

  fx.wq.getRange(2, fx.exported.WQ25_STATUS + 1).setValue('PENDING');
  fx.exported.wfbApplyFlow3_(fx.wq, fx.exported.wfbFindQueueRow_(fx.wq, 'WQ-A'), 'WQ-A', RAW);
  assert.equal(fx.wq.getRange(2, 23).getValue(), firstDelivered, 'a second delivery keeps the first time');

  fx.exported._registerDeliveredWarmUps_();
  const saved = new Date(Date.now() - 20 * 3600 * 1000);
  const tb = fx.ss.getSheetByName('WarmUpTextBox');
  tb.getRange(2, fx.exported.WTB.RESPONSE + 1, 1, 2).setValues([[
    'Fans pay more because the stadium is the only place to buy water and the experience is part of the price.', saved]]);
  fx.exported.runWarmUpEvaluation();
  assert.equal(fx.wq.getRange(2, 24).getValue().getTime(), saved.getTime());
  assert.equal(fx.wq.getRange(3, 24).getValue(), '', 'no answer, no answered_at');
});

test('timing: a doc warm-up\'s answered_at is the doc\'s last edit; a Drive error stops nothing', () => {
  const { exported, sandbox } = loadGasFiles(FILES, ['_stampWarmUpAnswered_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  wq.appendRow(new Array(21).fill(''));
  const edited = new Date('2026-10-22T14:05:00Z');
  sandbox.DriveApp._files.set('doc-1', { getLastUpdated() { return edited; } });
  exported._stampWarmUpAnswered_(wq, { docId: 'doc-1', queueRowNum: 2, queueId: 'WQ-1' }, null);
  assert.equal(wq.getRange(2, 24).getValue().getTime(), edited.getTime());
  assert.doesNotThrow(() => exported._stampWarmUpAnswered_(wq, { docId: 'gone', queueRowNum: 2, queueId: 'WQ-1' }, null));
});
