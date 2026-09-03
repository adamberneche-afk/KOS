'use strict';
// Regression tests for cas-ccps/studio-steps/CreateWarmUpDocStep.gs —
// Flow 3's post-processing step: folder resolution, doc creation with
// Zone 1/2 markers, sharing, and the WarmUpQueue write-back.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent, FakeDriveFolder } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'CreateWarmUpDocStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, STEP_PATH], exposeNames);
}

// WarmUpQueue columns (see WARMUP_QUEUE_COLUMNS_): QUEUE_ID=0, STATUS=8, DOC_ID=9, DOC_URL=10.
function queueRow(queueId) {
  const row = new Array(21).fill('');
  row[0] = queueId;
  return row;
}

function setUp(sandbox, adminRootId = 'admin-root') {
  const ledgerSs = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ledgerSs.getId(), ledgerSs);
  const wq = ledgerSs.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  wq.appendRow(queueRow('Q1'));

  const adminRoot = new FakeDriveFolder('Admin Root', adminRootId);
  sandbox.DriveApp._registerFolder(adminRoot);

  return { ledgerSs, wq, adminRoot };
}

function makeLesson(overrides = {}) {
  return {
    admin_root_folder_id: 'admin-root',
    course_name: 'Sports Marketing',
    teacher_name: 'Ms. Smith',
    period: '3',
    ...overrides,
  };
}

function makeEvent(ledgerSs, lesson, overrides = {}) {
  return makeStudioEvent({
    ledgerSsId: ledgerSs.getId(),
    queueId: 'Q1',
    lessonContextSnapshotJson: JSON.stringify(lesson),
    studentGoogleId: 'student@example.com',
    studentName: 'Alice Smith',
    firstName: 'Alice',
    lessonDate: '2026-03-02',
    generatedPromptText: 'What is the market for this product?',
    bridgeOutput: '',
    ...overrides,
  });
}

test('onCreateWarmUpDocExecute: creates a doc nested under [CourseName]/[Teacher]/[Period]/Warm-Ups/[Student], shares it, and writes DELIVERED back', () => {
  const { exported, sandbox } = load(['onCreateWarmUpDocExecute']);
  const { ledgerSs, wq, adminRoot } = setUp(sandbox);

  const result = exported.onCreateWarmUpDocExecute(makeEvent(ledgerSs, makeLesson()));
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');

  const row = wq.getRange(2, 1, 1, 21).getValues()[0];
  assert.equal(row[8], 'DELIVERED'); // STATUS
  assert.ok(row[9]); // DOC_ID
  assert.ok(row[10]); // DOC_URL

  // Folder chain: courseName -> teacherName -> "Period 3" -> Warm-Ups -> studentName.
  const courseFolder = adminRoot.getFoldersByName('Sports Marketing').next();
  const teacherFolder = courseFolder.getFoldersByName('Ms. Smith').next();
  const periodFolder = teacherFolder.getFoldersByName('Period 3').next();
  const warmUpsFolder = periodFolder.getFoldersByName('Warm-Ups').next();
  const studentFolder = warmUpsFolder.getFoldersByName('Alice Smith').next();
  assert.equal(studentFolder.files.length, 1);

  const doc = sandbox.DocumentApp._docs.get(row[9]);
  const text = doc.getBody().getText();
  assert.match(text, /── WARM-UP PROMPT ──/);
  assert.match(text, /What is the market for this product\?/);
  assert.match(text, /── END PROMPT ──/);
  assert.match(text, /── YOUR RESPONSE ──/);
});

test('onCreateWarmUpDocExecute: a non-empty bridgeOutput is prepended before Zone 1, with a separator', () => {
  const { exported, sandbox } = load(['onCreateWarmUpDocExecute']);
  const { ledgerSs, wq } = setUp(sandbox);

  const event = makeEvent(ledgerSs, makeLesson(), { bridgeOutput: 'Remember last week\'s lesson on supply.' });
  const result = exported.onCreateWarmUpDocExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');

  const row = wq.getRange(2, 1, 1, 21).getValues()[0];
  const doc = sandbox.DocumentApp._docs.get(row[9]);
  const text = doc.getBody().getText();
  const bridgeIdx = text.indexOf('Remember last week');
  const zone1Idx = text.indexOf('── WARM-UP PROMPT ──');
  assert.ok(bridgeIdx !== -1 && bridgeIdx < zone1Idx, 'bridge paragraph must appear before Zone 1');
});

test('onCreateWarmUpDocExecute: missing folder-path fields writes ERROR to WarmUpQueue and reports FOLDER_PATH_FIELDS_MISSING', () => {
  const { exported, sandbox } = load(['onCreateWarmUpDocExecute']);
  const { ledgerSs, wq } = setUp(sandbox);

  const lesson = makeLesson({ teacher_name: '' }); // blank required field
  const result = exported.onCreateWarmUpDocExecute(makeEvent(ledgerSs, lesson));
  assert.equal(result.variables.writeStatus.stringValues[0], 'FOLDER_PATH_FIELDS_MISSING');
  const row = wq.getRange(2, 1, 1, 21).getValues()[0];
  assert.equal(row[8], 'ERROR');
});

test('onCreateWarmUpDocExecute: malformed lesson snapshot -> LESSON_SNAPSHOT_PARSE_FAILED, status = ERROR', () => {
  const { exported, sandbox } = load(['onCreateWarmUpDocExecute']);
  const { ledgerSs, wq } = setUp(sandbox);

  const event = makeStudioEvent({
    ledgerSsId: ledgerSs.getId(), queueId: 'Q1', lessonContextSnapshotJson: 'not json',
    studentGoogleId: 's@example.com', studentName: 'S', firstName: 'S', lessonDate: '2026-03-02',
    generatedPromptText: 'text', bridgeOutput: '',
  });
  const result = exported.onCreateWarmUpDocExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'LESSON_SNAPSHOT_PARSE_FAILED');
  assert.equal(wq.getRange(2, 1, 1, 21).getValues()[0][8], 'ERROR');
});

test('onCreateWarmUpDocExecute: unresolvable admin root folder -> DOC_CREATE_FAILED, status = ERROR (never throws uncaught)', () => {
  const { exported, sandbox } = load(['onCreateWarmUpDocExecute']);
  const { ledgerSs, wq } = setUp(sandbox);
  // admin_root_folder_id points at a folder never registered with DriveApp.
  const lesson = makeLesson({ admin_root_folder_id: 'does-not-exist' });
  const result = exported.onCreateWarmUpDocExecute(makeEvent(ledgerSs, lesson));
  assert.match(result.variables.writeStatus.stringValues[0], /^DOC_CREATE_FAILED/);
  assert.equal(wq.getRange(2, 1, 1, 21).getValues()[0][8], 'ERROR');
});

test('onCreateWarmUpDocExecute: no matching WarmUpQueue row for Queue_ID -> writeStatus reports it directly (nothing to write)', () => {
  const { exported, sandbox } = load(['onCreateWarmUpDocExecute']);
  const { ledgerSs } = setUp(sandbox);
  const event = makeEvent(ledgerSs, makeLesson(), { queueId: 'does-not-exist' });
  const result = exported.onCreateWarmUpDocExecute(event);
  assert.match(result.variables.writeStatus.stringValues[0], /^DOC_CREATE_FAILED|^QUEUE_ROW_NOT_FOUND_AFTER_DOC_CREATE/);
});

test('onCreateWarmUpDocExecute: an unmapped required input never throws uncaught (fails closed)', () => {
  const { exported, sandbox } = load(['onCreateWarmUpDocExecute']);
  const { ledgerSs, wq } = setUp(sandbox);
  const event = makeEvent(ledgerSs, makeLesson(), { lessonContextSnapshotJson: null });
  const result = exported.onCreateWarmUpDocExecute(event);
  // lessonContextSnapshotJson defaults to "" via inStr_, which fails JSON.parse.
  assert.equal(result.variables.writeStatus.stringValues[0], 'LESSON_SNAPSHOT_PARSE_FAILED');
  assert.equal(wq.getRange(2, 1, 1, 21).getValues()[0][8], 'ERROR');
});
