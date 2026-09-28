'use strict';
// Regression tests for kos-personal/19_StagingRequeue.gs — putting
// terminal STUDIO_TIMEOUT / AUDIT_REJECTED rows back through the Flow.
//
// What a requeue has to get right, each pinned below: the dry run changes
// nothing; the staging row, the Turnstile's three Script Property maps,
// the harvest's doc-written breadcrumb, the old CuratorInput row and the
// old STUDIO_RETURN rows all reset together; an overwritten source doc is
// restored from its CuratorInput SourceText (or the row is skipped when
// there is nothing to restore from); and a batch never pushes the
// in-flight count past its limit.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '10_Turnstile.gs'),
  path.join(KP, '12_StudioReturnHarvest.gs'),
  path.join(KP, '13_StudioInputBuilder.gs'),
  path.join(KP, '19_StagingRequeue.gs'),
];
const EXPOSE = ['requeueStagingRows', 'previewStagingRequeue', 'buildStudioInputRows', 'CFG'];

const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];
const INPUT_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'File_ID', 'SourceText', 'Status'];
const RETURN_HEADERS = ['Returned_At', 'Payload_UID', 'Payload_Type', 'Primary_JSON', 'Auditor_JSON',
  'Harvest_Status', 'Attempts', 'Error'];

function tab(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.appendRow(headers);
  return sheet;
}

// Builds a sheet with:
//   A — AUDIT_REJECTED; its doc was overwritten by a harvest; two old
//       STUDIO_RETURN rows; entries in every Script Property map.
//   B — STUDIO_TIMEOUT; doc still holds the transcript.
//   C — PROCESSED; must not be touched.
//   D — STUDIO_TIMEOUT; doc holds model output and there is no
//       CuratorInput row to restore it from.
//   F — a fixture row, never requeued.
function setup() {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());

  const staging  = tab(ss, exported.CFG.STAGING_SHEET, STAGING_HEADERS);
  const curator  = tab(ss, 'CuratorInput', INPUT_HEADERS);
  tab(ss, 'VectorClassifyInput', INPUT_HEADERS);
  const returns  = tab(ss, 'STUDIO_RETURN', RETURN_HEADERS);

  function doc(text) {
    const d = sandbox.DocumentApp.create('chunk');
    d.getBody().setText(text);
    return d.getId();
  }
  const files = {
    A: doc('{"session_summary":"curator output"}'),
    B: doc('transcript B'),
    C: doc('{"done":true}'),
    D: doc('{"orphan":true}'),
    F: doc('fixture'),
  };
  const add = (uid, status, retries, fileId) =>
    staging.appendRow([new Date(), uid, 'SESSION_LOG', 'https://x/' + fileId, fileId, status, retries]);
  add('UID-A', 'AUDIT_REJECTED', 2, files.A);
  add('UID-B', 'STUDIO_TIMEOUT', 4, files.B);
  add('UID-C', 'PROCESSED', 0, files.C);
  add('UID-D', 'STUDIO_TIMEOUT', 4, files.D);
  add('FIXTURE-SR-1', 'STUDIO_TIMEOUT', 4, files.F);

  curator.appendRow([new Date(), 'UID-A', 'SESSION_LOG', files.A, 'transcript A', 'READY']);
  curator.appendRow([new Date(), 'UID-B', 'SESSION_LOG', files.B, 'transcript B', 'READY']);
  curator.appendRow([new Date(), 'UID-C', 'SESSION_LOG', files.C, 'transcript C', 'READY']);

  returns.appendRow([new Date(), 'UID-A', 'SESSION_LOG', '[prose]', '[prose]', 'FAILED', 1, 'x']);
  returns.appendRow([new Date(), 'UID-C', 'SESSION_LOG', '{}', '{}', 'HARVESTED', 1, '']);
  returns.appendRow([new Date(), 'UID-A', 'SESSION_LOG', '[prose]', '[prose]', 'FAILED', 1, 'x']);

  props.setProperty('KOS_TURNSTILE_RELEASED', JSON.stringify({ 'UID-A': 1, 'UID-C': 2 }));
  props.setProperty('KOS_AUDIT_RETRY_PRIORITY', JSON.stringify({ 'UID-A': true }));
  props.setProperty('KOS_STALE_DEPRIORITIZE', JSON.stringify({ 'UID-A': { reason: 'stale_reset' } }));
  props.setProperty('KOS_STUDIO_DOC_WRITTEN', JSON.stringify({ 'UID-A': 1 }));

  return { exported, sandbox, props, staging, curator, returns, files };
}

function statusOf(staging, uid) {
  const row = staging.rows.find((r) => r[1] === uid);
  return [row[5], row[6]];
}
const uidsIn = (sheet) => sheet.rows.slice(1).map((r) => r[1]);
const docText = (sandbox, id) => sandbox.DocumentApp.openById(id).getBody().getText();

test('previewStagingRequeue: reports the plan and changes nothing', () => {
  const { exported, sandbox, props, staging, curator, returns, files } = setup();
  const before = JSON.stringify([staging.rows, curator.rows, returns.rows, props.getProperties()]);

  const r = exported.previewStagingRequeue();

  assert.equal(r.apply, false);
  assert.deepEqual(r.eligible, { AUDIT_REJECTED: 1, STUDIO_TIMEOUT: 2 });
  assert.equal(r.selected, 2);
  const byUid = Object.fromEntries(r.rows.map((p) => [p.uid, p]));
  assert.equal(byUid['UID-A'].restoreDoc, true, 'A\'s doc was overwritten by the harvest');
  assert.equal(byUid['UID-A'].returnRowsRemoved, 2);
  assert.equal(byUid['UID-B'].restoreDoc, false);
  assert.equal(byUid['UID-D'].action, 'SKIP');
  assert.match(byUid['UID-D'].reason, /SOURCE_LOST/);
  assert.ok(!byUid['FIXTURE-SR-1'], 'fixture rows are never requeued');

  assert.equal(JSON.stringify([staging.rows, curator.rows, returns.rows, props.getProperties()]), before);
  assert.equal(docText(sandbox, files.A), '{"session_summary":"curator output"}');
});

test('requeueStagingRows: resets every piece of a row\'s state together', () => {
  const { exported, sandbox, props, staging, curator, returns, files } = setup();

  const r = exported.requeueStagingRows({ apply: true });

  assert.equal(r.selected, 2);
  assert.deepEqual(statusOf(staging, 'UID-A'), ['PENDING_FLOW', 0]);
  assert.deepEqual(statusOf(staging, 'UID-B'), ['PENDING_FLOW', 0]);
  assert.deepEqual(statusOf(staging, 'UID-C'), ['PROCESSED', 0]);
  assert.deepEqual(statusOf(staging, 'UID-D'), ['STUDIO_TIMEOUT', 4], 'SOURCE_LOST rows stay terminal');
  assert.deepEqual(statusOf(staging, 'FIXTURE-SR-1'), ['STUDIO_TIMEOUT', 4]);

  assert.equal(docText(sandbox, files.A), 'transcript A', 'the transcript is restored before re-inference');
  assert.equal(docText(sandbox, files.B), 'transcript B');

  assert.deepEqual(uidsIn(curator), ['UID-C']);
  assert.deepEqual(uidsIn(returns), ['UID-C']);

  assert.deepEqual(JSON.parse(props.getProperty('KOS_TURNSTILE_RELEASED')), { 'UID-C': 2 });
  assert.deepEqual(JSON.parse(props.getProperty('KOS_AUDIT_RETRY_PRIORITY')), {});
  assert.deepEqual(JSON.parse(props.getProperty('KOS_STALE_DEPRIORITIZE')), {});
  assert.deepEqual(JSON.parse(props.getProperty('KOS_STUDIO_DOC_WRITTEN')), {});
});

test('requeueStagingRows: a requeued row is re-materialized once the Turnstile releases it', () => {
  const { exported, staging, curator } = setup();
  exported.requeueStagingRows({ apply: true });

  // Stand in for the Turnstile releasing UID-A.
  staging.rows.find((r) => r[1] === 'UID-A')[5] = 'STUDIO_ACTIVE';
  const built = exported.buildStudioInputRows();

  assert.equal(built.curatorBuilt, 1);
  const fresh = curator.rows.find((r) => r[1] === 'UID-A');
  assert.equal(fresh[4], 'transcript A', 'the Flow sees the transcript, not the old model output');
});

test('requeueStagingRows: a batch only tops the in-flight count up to its limit', () => {
  const { exported, staging } = setup();

  const first = exported.requeueStagingRows({ apply: true, limit: 1 });
  assert.equal(first.selected, 1);
  assert.deepEqual(statusOf(staging, 'UID-A'), ['PENDING_FLOW', 0]);
  assert.deepEqual(statusOf(staging, 'UID-B'), ['STUDIO_TIMEOUT', 4]);

  const second = exported.requeueStagingRows({ apply: true, limit: 1 });
  assert.equal(second.selected, 0, 'UID-A is still in flight, so the batch is full');
  assert.match(second.message, /Batch is full/);
  assert.deepEqual(statusOf(staging, 'UID-B'), ['STUDIO_TIMEOUT', 4]);
});

test('requeueStagingRows: uids requeues only the named rows', () => {
  const { exported, staging } = setup();

  const r = exported.requeueStagingRows({ apply: true, uids: ['UID-B', 'UID-C'] });

  assert.equal(r.selected, 1, 'UID-C is PROCESSED, not terminal-failed, so it is not eligible');
  assert.deepEqual(statusOf(staging, 'UID-B'), ['PENDING_FLOW', 0]);
  assert.deepEqual(statusOf(staging, 'UID-A'), ['AUDIT_REJECTED', 2]);
  assert.deepEqual(statusOf(staging, 'UID-C'), ['PROCESSED', 0]);
});
