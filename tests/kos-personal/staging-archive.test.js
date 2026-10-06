'use strict';
// Regression tests for the STAGING_PIPELINE archive paths in
// kos-personal/5_Error_And_Utilities.gs.
//
// archiveFinishedStagingRows() is the nightly trigger: it moves finished
// rows only. A STUDIO_TIMEOUT part must stay in STAGING_PIPELINE, because
// requeueStagingRows() and checkVectorClassifySessions() read that sheet
// only, and DUPLICATE rows stay because the duplicate finder reads them
// there. archiveStagingPipeline() (the web app button) still moves finished
// and failed rows. Both now move rows in bulk; the order of archived rows
// and of the rows left behind must survive that.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
];
const EXPOSE = ['archiveFinishedStagingRows', 'archiveStagingPipeline', 'setupAllTriggers',
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

test('archiveStagingPipeline: still moves finished and failed rows, and counts each', () => {
  const { exported, staging } = setup(MIXED);
  const r = exported.archiveStagingPipeline();
  assert.equal(r.success, true);
  assert.equal(r.archived, 7);
  assert.equal(r.succeeded, 5);
  assert.equal(r.failed, 2);
  assert.deepEqual(stagingUids(staging), ['UID-3', 'UID-4', 'UID-6'],
    'DUPLICATE and in-flight rows stay');
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
