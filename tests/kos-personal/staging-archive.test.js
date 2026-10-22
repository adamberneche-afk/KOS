'use strict';
// Regression tests for the STAGING_PIPELINE archive paths in
// kos-personal/5_Error_And_Utilities.gs.
//
// archiveFinishedStagingRows() is the nightly trigger: it moves finished
// rows only. A STUDIO_TIMEOUT part must stay in STAGING_PIPELINE, because
// requeueStagingRows() and checkVectorClassifySessions() read that sheet
// only, and DUPLICATE rows stay because the duplicate finder reads them
// there. archiveStagingPipeline() (the web app button) moved finished AND
// failed rows until 2026-10-22 (UX audit fix-first 14), which put a failed
// row beyond any retry; it now moves the same set as the nightly run, and
// previewStagingArchive() gives the web app its confirm count. Both move
// rows in bulk; the order of archived rows and of the rows left behind
// must survive that.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
];
const EXPOSE = ['archiveFinishedStagingRows', 'archiveStagingPipeline', 'previewStagingArchive', 'setupAllTriggers',
  'KOS_TRIGGER_HANDLERS', 'CFG'];

const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];

function setup(statuses) {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
  const staging = ss.insertSheet(exported.CFG.STAGING_SHEET);
  staging.appendRow(STAGING_HEADERS);
  statuses.forEach((s, i) =>
    staging.appendRow([new Date(), 'UID-' + i, 'VECTOR_CLASSIFY', 'https://x/' + i, 'F' + i, s, 0]));
  return { exported, ss, staging };
}

function stagingUids(sheet) {
  return sheet.getDataRange().getValues().slice(1).map((r) => r[1]);
}
function archiveUids(sheet) {
  return sheet.getDataRange().getValues().slice(1).map((r) => r[2]);
}

const MIXED = ['PROCESSED', 'PROCESSED', 'STUDIO_TIMEOUT', 'DUPLICATE', 'PENDING_FLOW',
  'PROCESSED', 'STUDIO_ACTIVE', 'AUDIT_REJECTED', 'INTAKE_PROCESSED', 'PROCESSED'];

test('archiveFinishedStagingRows: moves finished rows only, in order', () => {
  const { exported, ss, staging } = setup(MIXED);
  const r = exported.archiveFinishedStagingRows();

  assert.equal(r.success, true);
  assert.equal(r.archived, 5);
  assert.equal(r.remaining, 5);
  assert.deepEqual(stagingUids(staging), ['UID-2', 'UID-3', 'UID-4', 'UID-6', 'UID-7'],
    'STUDIO_TIMEOUT, DUPLICATE, in-flight and AUDIT_REJECTED rows stay, in their order');
  const archive = ss.getSheetByName('STAGING_ARCHIVE');
  assert.deepEqual(archiveUids(archive), ['UID-0', 'UID-1', 'UID-5', 'UID-8', 'UID-9']);
  const row = archive.getDataRange().getValues()[1];
  assert.equal(Object.prototype.toString.call(row[0]), '[object Date]', 'Archived_At comes first');
  assert.equal(row[6], 'PROCESSED', 'the staging columns follow unchanged');
});

test('archiveFinishedStagingRows: nothing finished leaves the sheet alone', () => {
  const { exported, staging } = setup(['STUDIO_TIMEOUT', 'PENDING_FLOW']);
  const r = exported.archiveFinishedStagingRows();
  assert.equal(r.archived, 0);
  assert.equal(r.remaining, 2);
  assert.deepEqual(stagingUids(staging), ['UID-0', 'UID-1']);
});

test('archiveFinishedStagingRows: a second run appends below the first', () => {
  const { exported, ss, staging } = setup(['PROCESSED', 'PENDING_FLOW']);
  exported.archiveFinishedStagingRows();
  staging.getRange(2, 6).setValue('PROCESSED');
  exported.archiveFinishedStagingRows();
  assert.equal(staging.getLastRow(), 1);
  assert.deepEqual(archiveUids(ss.getSheetByName('STAGING_ARCHIVE')), ['UID-0', 'UID-1']);
});

test('archiveStagingPipeline: moves finished rows only; failed rows stay so they can be retried', () => {
  const { exported, ss, staging } = setup(MIXED.concat(['FAILED_PARSE', 'PROCESSING_ERROR: boom']));
  const r = exported.archiveStagingPipeline();
  assert.equal(r.success, true);
  assert.equal(r.archived, 5);
  assert.equal(r.succeeded, 5);
  assert.equal(r.failed, 0, 'no failed row is archived');
  assert.equal(r.failedKept, 4, 'STUDIO_TIMEOUT, AUDIT_REJECTED, FAILED_PARSE and PROCESSING_ERROR stay');
  assert.deepEqual(stagingUids(staging), ['UID-2', 'UID-3', 'UID-4', 'UID-6', 'UID-7', 'UID-10', 'UID-11']);
  assert.deepEqual(archiveUids(ss.getSheetByName('STAGING_ARCHIVE')), ['UID-0', 'UID-1', 'UID-5', 'UID-8', 'UID-9']);
});

test('previewStagingArchive: counts what the button would move, and changes nothing', () => {
  const { exported, ss, staging } = setup(MIXED.concat(['FAILED_PARSE']));
  const p = exported.previewStagingArchive();
  assert.equal(p.success, true);
  assert.equal(p.finished, 5);
  assert.equal(p.failedKept, 3);
  assert.equal(staging.getLastRow(), 12, 'every row is still in the queue');
  assert.equal(ss.getSheetByName('STAGING_ARCHIVE'), null, 'no archive sheet was made');
  assert.equal(exported.archiveStagingPipeline().archived, p.finished, 'the preview matches the real run');
});

test('setupAllTriggers installs the nightly archive once', () => {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  assert.ok(exported.KOS_TRIGGER_HANDLERS.includes('archiveFinishedStagingRows'));
  exported.setupAllTriggers();
  exported.setupAllTriggers();
  const n = sandbox.ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'archiveFinishedStagingRows').length;
  assert.equal(n, 1);
});
