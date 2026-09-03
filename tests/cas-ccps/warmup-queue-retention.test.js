'use strict';
// Regression tests for the automatic WarmUpQueue retention archival added
// to 34_QueueWatchdog.js. A third-party review found WarmUpQueue was the
// one major operational tab (alongside Ledger, SCRDecisionLog,
// CompetencyEvidence, ParentReportLog) with no retention mechanism at all.
// Extends the exact same *_RETENTION_YEARS/self-healing-column/never-delete
// pattern (tests/cas-ccps/competency-evidence-retention.test.js is the
// direct template) to this tab. Lives in 34_QueueWatchdog.js, not
// 25_WarmUpWriter.js, because that file already owns WarmUpQueue health
// monitoring and already keeps its own WD_WARMUP_QUEUE_COLUMNS map.
//
// Loaded together with 22_LessonContextHandler.js (_normalizeLessonDateCell_)
// and 23_StudentProfileManager.js (formatDateYMD_) — all bound to the same
// cas-ccps:central-ledger GAS project (see tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const PATHS = [
  path.join(SCRIPTS, '00_SharedConfig.js'),
  path.join(SCRIPTS, '22_LessonContextHandler.js'),
  path.join(SCRIPTS, '23_StudentProfileManager.js'),
  path.join(SCRIPTS, '34_QueueWatchdog.js'),
];

function load() {
  return loadGasFiles(PATHS, [
    '_warmUpQueueRetentionYears_',
    '_archiveExpiredWarmUpQueueRows_',
    '_countWarmUpQueueRowsPastRetentionUnarchived_',
    'reactivateWarmUpQueueArchival',
  ]);
}

// WQ25_COL_COUNT is 21 (0-20); ARCHIVE_STATUS is the new column at 21.
const COL_COUNT = 22;
const QUEUE_ID = 0, STUDENT_EMAIL = 2, LESSON_DATE = 5, ARCHIVE_STATUS = 21;

function queueRow({ queueId = 'WUQ-1', email = 'student@example.com', lessonDate, archiveStatus = '' }) {
  const row = new Array(COL_COUNT).fill('');
  row[QUEUE_ID] = queueId;
  row[STUDENT_EMAIL] = email;
  row[LESSON_DATE] = lessonDate;
  row[ARCHIVE_STATUS] = archiveStatus;
  return row;
}

function setUpFixture(sandbox, rows, opts) {
  const options = opts || {};
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const sheet = ss.insertSheet('WarmUpQueue');
  const header = options.oldHeader
    ? new Array(21).fill('header') // pre-fix shape: no archive_status column at all
    : new Array(22).fill('header').map((h, i) => (i === ARCHIVE_STATUS ? 'archive_status' : h));
  sheet.appendRow(header);
  (rows || []).forEach((r) => sheet.appendRow(queueRow(r)));
  return { ss, sheet };
}

function ymdYearsAgo(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  const pad = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

test('_warmUpQueueRetentionYears_: defaults to 5 when unset, same unconfirmed default as the other four', () => {
  const { exported } = load();
  assert.equal(exported._warmUpQueueRetentionYears_(), 5);
});

test('_warmUpQueueRetentionYears_: an explicitly configured value overrides the default', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('WARMUP_QUEUE_RETENTION_YEARS', '3');
  assert.equal(exported._warmUpQueueRetentionYears_(), 3);
});

test('_warmUpQueueRetentionYears_: a garbage or non-positive property value falls back to the default', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('WARMUP_QUEUE_RETENTION_YEARS', 'nope');
  assert.equal(exported._warmUpQueueRetentionYears_(), 5);
  sandbox.PropertiesService.getScriptProperties().setProperty('WARMUP_QUEUE_RETENTION_YEARS', '0');
  assert.equal(exported._warmUpQueueRetentionYears_(), 5);
});

test('_archiveExpiredWarmUpQueueRows_: archives an old row past retention', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [
    { queueId: 'WUQ-1', lessonDate: ymdYearsAgo(6) },
    { queueId: 'WUQ-2', lessonDate: ymdYearsAgo(7) },
  ]);

  const result = exported._archiveExpiredWarmUpQueueRows_();
  assert.equal(result.archived, 2);
  assert.equal(result.checked, 2);

  const rows = sheet.getRange(2, 1, 2, COL_COUNT).getValues();
  rows.forEach((row) => assert.equal(row[ARCHIVE_STATUS], 'ARCHIVED'));
});

test('_archiveExpiredWarmUpQueueRows_: leaves a recent row (within the retention window) untouched', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [{ lessonDate: ymdYearsAgo(1) }]);

  const result = exported._archiveExpiredWarmUpQueueRows_();
  assert.equal(result.archived, 0);

  const row = sheet.getRange(2, 1, 1, COL_COUNT).getValues()[0];
  assert.equal(row[ARCHIVE_STATUS], '');
});

test('_archiveExpiredWarmUpQueueRows_: an already-ARCHIVED row is left alone (not re-processed)', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [{ lessonDate: ymdYearsAgo(10), archiveStatus: 'ARCHIVED' }]);

  const result = exported._archiveExpiredWarmUpQueueRows_();
  assert.equal(result.archived, 0);

  const row = sheet.getRange(2, 1, 1, COL_COUNT).getValues()[0];
  assert.equal(row[ARCHIVE_STATUS], 'ARCHIVED');
});

test('_archiveExpiredWarmUpQueueRows_: a blank lesson_date is skipped, never treated as ageless-and-archivable', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [{ lessonDate: '' }]);

  const result = exported._archiveExpiredWarmUpQueueRows_();
  assert.equal(result.archived, 0);

  const row = sheet.getRange(2, 1, 1, COL_COUNT).getValues()[0];
  assert.equal(row[ARCHIVE_STATUS], '');
});

test('_archiveExpiredWarmUpQueueRows_: a missing WarmUpQueue tab returns zeros rather than throwing', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Empty Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const result = exported._archiveExpiredWarmUpQueueRows_();
  assert.deepEqual(result, { archived: 0, checked: 0 });
});

test('_archiveExpiredWarmUpQueueRows_: self-heals a pre-fix sheet missing the archive_status column', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [{ lessonDate: ymdYearsAgo(6) }], { oldHeader: true });

  const result = exported._archiveExpiredWarmUpQueueRows_();
  assert.equal(result.archived, 1);
  assert.equal(sheet.getRange(1, ARCHIVE_STATUS + 1).getValue(), 'archive_status');
});

test('_countWarmUpQueueRowsPastRetentionUnarchived_: mirrors _archiveExpiredWarmUpQueueRows_ as a read-only check', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox, [
    { queueId: 'WUQ-1', lessonDate: ymdYearsAgo(6) },
    { queueId: 'WUQ-2', lessonDate: ymdYearsAgo(1) },
  ]);

  assert.equal(exported._countWarmUpQueueRowsPastRetentionUnarchived_(), 1, 'before archival runs, one row is past retention and unarchived');
  exported._archiveExpiredWarmUpQueueRows_();
  assert.equal(exported._countWarmUpQueueRowsPastRetentionUnarchived_(), 0, 'after archival runs, the counter must return to zero');
});

test('reactivateWarmUpQueueArchival: clears archive_status for a matching student, prompted via the UI', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [
    { queueId: 'WUQ-1', email: 'alice@example.com', lessonDate: ymdYearsAgo(6), archiveStatus: 'ARCHIVED' },
    { queueId: 'WUQ-2', email: 'alice@example.com', lessonDate: ymdYearsAgo(1), archiveStatus: '' },
    { queueId: 'WUQ-3', email: 'bob@example.com', lessonDate: ymdYearsAgo(6), archiveStatus: 'ARCHIVED' },
  ]);

  const ui = sandbox.SpreadsheetApp.getUi();
  ui.prompt = () => ({ getSelectedButton: () => ui.Button.OK, getResponseText: () => 'alice@example.com' });
  ui.alert = () => ui.Button.YES;

  exported.reactivateWarmUpQueueArchival();

  const rows = sheet.getRange(2, 1, 3, COL_COUNT).getValues();
  assert.equal(rows[0][ARCHIVE_STATUS], ''); // alice's archived row — reactivated
  assert.equal(rows[1][ARCHIVE_STATUS], ''); // alice's already-active row — untouched
  assert.equal(rows[2][ARCHIVE_STATUS], 'ARCHIVED'); // bob's row — untouched
});
