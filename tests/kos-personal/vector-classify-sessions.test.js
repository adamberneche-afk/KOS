'use strict';
// Regression tests for kos-personal/20_VectorClassifySessions.gs: one
// VECTOR_MATRIX row per session, from a session classified in parts.
//
// Pins: intake queues a session's parts alongside its Curator chunks, each
// part small enough for one Sheets cell; parts are queued all or nothing;
// a session's matrix row appears only when its last part lands, whatever
// order they land in, and equals classifying the whole session at once; a
// part re-delivered later never writes a second row; the install fixture's
// non-part UID keeps the old behavior; and the backfill reads sessions back
// from CuratorInput, skips what it can't or needn't do, and never starts a
// batch while an earlier one is in flight.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '2_Ingestion_Sensors.gs'),
  path.join(KP, '4_Vector_Router.gs'),
  path.join(KP, '12_StudioReturnHarvest.gs'),
  path.join(KP, '13_StudioInputBuilder.gs'),
  path.join(KP, '19_StagingRequeue.gs'),
  path.join(KP, '20_VectorClassifySessions.gs'),
];
const EXPOSE = [
  '_queueClassifyParts_', '_processVectorClassifyPart_', '_chunkAndQueue',
  'processVectorClassificationPayload', 'queueVectorClassifyBackfill',
  'checkVectorClassifySessions', 'CFG',
  'installClassifyBackfillTrigger', 'removeClassifyBackfillTrigger', 'runClassifyBackfillTrigger',
];

const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];
const INPUT_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'File_ID', 'SourceText', 'Status'];

function setup() {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());
  const rawFolder = sandbox.DriveApp.getRootFolder().createFolder('RAW_EXHAUST');
  sandbox.DriveApp._registerFolder(rawFolder);
  props.setProperty('ID_00_RAW_EXHAUST', rawFolder.id);

  const staging = ss.insertSheet(exported.CFG.STAGING_SHEET);
  staging.appendRow(STAGING_HEADERS);
  const curator = ss.insertSheet('CuratorInput');
  curator.appendRow(INPUT_HEADERS);
  return { exported, sandbox, ss, staging, curator, rawFolder };
}

// A session log of `blocks` delimiter-separated exchanges, ~`size` chars each.
function sessionText(exported, blocks, size) {
  const out = [];
  for (let i = 0; i < blocks; i++) {
    out.push(exported.CFG.DELIMITER + ' exchange ' + i + '] ' + 'word '.repeat(Math.floor(size / 5)));
  }
  return out.join('\n\n');
}

function exchanges(arch, ui) {
  return [{
    exchange_type: 'DECISION',
    sentences: [{ sentence_id: 1, vectors: { ARCHITECTURE: arch, UI: ui }, unmapped_signals: [] }],
  }];
}

function matrixRows(ss) {
  const sheet = ss.getSheetByName('VECTOR_MATRIX');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

const stagingData = (staging) => staging.rows.slice(1);

test('_queueClassifyParts_: splits a session into cell-sized parts, one VECTOR_CLASSIFY row each', () => {
  const { exported, sandbox, staging, rawFolder } = setup();
  const text = sessionText(exported, 6, 3000); // ~18k chars

  const n = exported._queueClassifyParts_(text, 'LOG-aaaa1111', rawFolder, staging);

  const rows = stagingData(staging);
  assert.equal(n, rows.length);
  assert.ok(n >= 3, 'an ~18k-char session needs several 8k parts, got ' + n);
  rows.forEach((r, i) => {
    assert.equal(r[1], 'LOG-aaaa1111_VC' + String(i + 1).padStart(2, '0') + 'of' + String(n).padStart(2, '0'));
    assert.equal(r[2], 'VECTOR_CLASSIFY');
    assert.equal(r[5], 'PENDING_FLOW');
    const body = sandbox.DocumentApp.openById(r[4]).getBody().getText();
    assert.ok(body.length <= 8000, 'part ' + (i + 1) + ' is ' + body.length + ' chars');
  });
});

test('_queueClassifyParts_: all or nothing when a part doc cannot be created', () => {
  const { exported, sandbox, staging, rawFolder } = setup();
  const realCreate = sandbox.DocumentApp.create;
  let calls = 0;
  sandbox.DocumentApp.create = (name) => {
    if (++calls === 2) throw new Error('Service Documents failed');
    return realCreate.call(sandbox.DocumentApp, name);
  };
  let n;
  try {
    n = exported._queueClassifyParts_(sessionText(exported, 6, 3000), 'LOG-bbbb2222', rawFolder, staging);
  } finally {
    sandbox.DocumentApp.create = realCreate;
  }

  assert.equal(n, 0);
  assert.equal(stagingData(staging).length, 0, 'no part may be queued when any part failed');
  const first = [...sandbox.DriveApp._files.values()].find((f) => /LOG-bbbb2222/.test(f.name));
  assert.ok(first && first.isTrashed(), 'the part doc that was created is trashed again');
});

test('_chunkAndQueue: a session log queues its classification parts alongside its chunks', () => {
  const { exported, staging, rawFolder, ss } = setup();
  const n = exported._chunkAndQueue(sessionText(exported, 2, 1000), 'SESSION_LOG', 'LOG-cccc3333',
    rawFolder, staging, ss);

  const types = stagingData(staging).map((r) => r[2] + ':' + r[1]);
  assert.equal(n, 1);
  assert.deepEqual(types, ['SESSION_LOG:LOG-cccc3333_CH01', 'VECTOR_CLASSIFY:LOG-cccc3333_VC01of01']);
});

test('_processVectorClassifyPart_: one matrix row per session, only once every part is in', () => {
  const { exported, ss } = setup();

  const second = exported._processVectorClassifyPart_(exchanges(0.2, 0.0), 'LOG-dddd4444_VC02of02', 't');
  assert.equal(second.status, 'SUCCESS');
  assert.equal(second.pending, true);
  assert.equal(matrixRows(ss).length, 0, 'no matrix row until the last part lands');

  const first = exported._processVectorClassifyPart_(exchanges(0.8, 0.4), 'LOG-dddd4444_VC01of02', 't');
  assert.equal(first.status, 'SUCCESS');

  const rows = matrixRows(ss);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], 'LOG-dddd4444', 'the row is keyed by the session, not a part');
  assert.equal(ss.getSheetByName('VectorClassifyParts').getLastRow(), 1, 'stored parts are cleared');

  // Same weights as classifying the whole session in one call.
  const whole = setup();
  whole.exported.processVectorClassificationPayload(
    JSON.stringify(exchanges(0.8, 0.4).concat(exchanges(0.2, 0.0))), 'LOG-dddd4444', 't');
  assert.deepEqual(rows[0].slice(2, -1), matrixRows(whole.ss)[0].slice(2, -1));
});

test('_processVectorClassifyPart_: a part delivered again after the session is classified writes nothing', () => {
  const { exported, ss } = setup();
  exported._processVectorClassifyPart_(exchanges(0.5, 0.5), 'LOG-eeee5555_VC01of01', 't');
  const again = exported._processVectorClassifyPart_(exchanges(0.9, 0.9), 'LOG-eeee5555_VC01of01', 't');

  assert.equal(again.status, 'SUCCESS');
  assert.equal(matrixRows(ss).length, 1);
});

test('_processVectorClassifyPart_: a non-part UID (the install fixture) keeps its own row', () => {
  const { exported, ss } = setup();
  const r = exported._processVectorClassifyPart_(exchanges(0.3, 0.0), 'FIXTURE-SR-1-VECTOR_CLASSIFY', 't');

  assert.equal(r.status, 'SUCCESS');
  assert.equal(matrixRows(ss)[0][0], 'FIXTURE-SR-1-VECTOR_CLASSIFY');
});

test('checkVectorClassifySessions: names the parts a session is still waiting on', () => {
  const { exported, staging } = setup();
  staging.appendRow([new Date(), 'LOG-ffff6666_VC02of02', 'VECTOR_CLASSIFY', 'u', 'f', 'STUDIO_TIMEOUT', 4]);
  exported._processVectorClassifyPart_(exchanges(0.1, 0.1), 'LOG-ffff6666_VC01of02', 't');

  const report = exported.checkVectorClassifySessions();
  assert.equal(report.length, 1);
  assert.deepEqual(report[0].waiting, [{ uid: 'LOG-ffff6666_VC02of02', status: 'STUDIO_TIMEOUT' }]);
});

function seedBackfill(env) {
  const { exported, staging, curator } = env;
  const chunk = (uid, day, status) =>
    staging.appendRow([new Date('2026-09-' + day), uid, 'SESSION_LOG', 'u', 'f-' + uid, status, 0]);
  const source = (uid, text) => curator.appendRow([new Date(), uid, 'SESSION_LOG', 'f-' + uid, text, 'READY']);

  // S1: two chunks, both with source text — eligible (oldest first).
  chunk('LOG-s1_CH02', 11, 'PROCESSED'); chunk('LOG-s1_CH01', 11, 'PROCESSED');
  source('LOG-s1_CH01', 'first half'); source('LOG-s1_CH02', 'second half');
  // S2: one chunk with no CuratorInput row.
  chunk('LOG-s2_CH01', 12, 'STUDIO_TIMEOUT');
  // S3: already has a matrix row.
  chunk('LOG-s3_CH01', 12, 'PROCESSED'); source('LOG-s3_CH01', 'three');
  exported.processVectorClassificationPayload(JSON.stringify(exchanges(0.1, 0.1)), 'LOG-s3', 't');
  // S4: already has parts queued.
  chunk('LOG-s4_CH01', 13, 'PROCESSED'); source('LOG-s4_CH01', 'four');
  staging.appendRow([new Date(), 'LOG-s4_VC01of01', 'VECTOR_CLASSIFY', 'u', 'f-s4vc', 'PROCESSED', 0]);
  // S5: eligible, newer than S1.
  chunk('LOG-s5_CH01', 14, 'PROCESSED'); source('LOG-s5_CH01', 'five');
}

test('queueVectorClassifyBackfill: dry run lists eligible sessions oldest first and why others are skipped', () => {
  const env = setup();
  seedBackfill(env);
  const before = stagingData(env.staging).length;

  const r = env.exported.queueVectorClassifyBackfill({ apply: false, limit: 1 });

  assert.equal(r.eligible, 2);
  assert.deepEqual(r.sessions.map((s) => s.sessionUid), ['LOG-s1']);
  const reasons = Object.fromEntries(r.skipped.map((s) => [s.sessionUid, s.reason.split(':')[0]]));
  assert.deepEqual(reasons, { 'LOG-s2': 'SOURCE_INCOMPLETE', 'LOG-s3': 'ALREADY_CLASSIFIED', 'LOG-s4': 'ALREADY_QUEUED' });
  assert.equal(stagingData(env.staging).length, before, 'a dry run queues nothing');
});

test('queueVectorClassifyBackfill: queues the session text in chunk order, then waits for the batch to drain', () => {
  const env = setup();
  seedBackfill(env);

  const r = env.exported.queueVectorClassifyBackfill({ apply: true, limit: 1 });
  assert.equal(r.selected, 1);
  const part = stagingData(env.staging).find((row) => row[1] === 'LOG-s1_VC01of01');
  assert.ok(part, 'LOG-s1 gets one classification part');
  assert.equal(env.sandbox.DocumentApp.openById(part[4]).getBody().getText(), 'first half\n\nsecond half');

  const again = env.exported.queueVectorClassifyBackfill({ apply: true, limit: 1 });
  assert.equal(again.selected, 0, 'LOG-s1\'s part is still PENDING_FLOW');
  assert.match(again.message, /still in flight/);
  assert.ok(!stagingData(env.staging).some((row) => /^LOG-s5_VC/.test(row[1])));
});

test('_processVectorClassifyPart_: keeps the stored parts when no matrix row could be written', () => {
  const { exported, ss } = setup();
  const matrix = ss.insertSheet('VECTOR_MATRIX');
  matrix.appendRow(['Session_UID', 'Timestamp']); // no theme columns

  const r = exported._processVectorClassifyPart_(exchanges(0.5, 0.5), 'LOG-gggg7777_VC01of01', 't');

  assert.equal(r.status, 'ERROR');
  assert.equal(matrixRows(ss).length, 0);
  assert.equal(ss.getSheetByName('VectorClassifyParts').getLastRow(), 2, 'the part is kept for a retry');

  const report = exported.checkVectorClassifySessions();
  assert.equal(report[0].aggregationFailed, true);
});

test('queueVectorClassifyBackfill: skips a session with a chunk missing from the middle or the end', () => {
  const env = setup();
  const { staging, curator, ss } = env;
  const chunk = (uid) => staging.appendRow([new Date('2026-09-11'), uid, 'SESSION_LOG', 'u', 'f-' + uid, 'PROCESSED', 0]);
  const source = (uid) => curator.appendRow([new Date(), uid, 'SESSION_LOG', 'f-' + uid, 'text ' + uid, 'READY']);
  // Gap: chunk 2 is in neither sheet.
  chunk('LOG-gap_CH01'); chunk('LOG-gap_CH03'); source('LOG-gap_CH01'); source('LOG-gap_CH03');
  // Tail: intake made 3 chunks, only 2 remain.
  chunk('LOG-tail_CH01'); chunk('LOG-tail_CH02'); source('LOG-tail_CH01'); source('LOG-tail_CH02');
  const log = ss.insertSheet('SESSION_LOG');
  log.appendRow(['Session_UID', 'Timestamp', 'Type', 'Stage', 'Version', 'Note']);
  log.appendRow(['LOG-tail', new Date(), 'SESSION_LOG', 'SENSOR_INTAKE', 'v8', '3 chunk(s) created']);
  // Same, with the intake row written in the fixed column layout.
  chunk('LOG-new_CH01'); source('LOG-new_CH01');
  log.appendRow(['LOG-new', new Date(), 'SENSOR_INTAKE', '', 'v8', '2 chunk(s) created (SESSION_LOG)']);

  const r = env.exported.queueVectorClassifyBackfill({ apply: false });

  assert.equal(r.eligible, 0);
  const reasons = Object.fromEntries(r.skipped.map((s) => [s.sessionUid, s.reason.split(':')[0]]));
  assert.deepEqual(reasons, {
    'LOG-gap': 'CHUNKS_INCOMPLETE', 'LOG-tail': 'CHUNKS_INCOMPLETE', 'LOG-new': 'CHUNKS_INCOMPLETE',
  });
});

test('queueVectorClassifyBackfill: reads chunks archived out of STAGING_PIPELINE', () => {
  const env = setup();
  const { staging, curator, ss } = env;
  const archive = ss.insertSheet('STAGING_ARCHIVE');
  archive.appendRow(['Archived_At'].concat(STAGING_HEADERS));
  const live = (uid, day) => staging.appendRow([new Date('2026-09-' + day), uid, 'SESSION_LOG', 'u', 'f-' + uid, 'PROCESSED', 0]);
  const gone = (uid, day, type, status) => archive.appendRow(
    [new Date(), new Date('2026-09-' + day), uid, type || 'SESSION_LOG', 'u', 'f-' + uid, status || 'PROCESSED', 0]);
  const source = (uid) => curator.appendRow([new Date(), uid, 'SESSION_LOG', 'f-' + uid, 'text ' + uid, 'READY']);

  // Split: chunk 2 archived, chunks 1 and 3 live; chunk 1 archived as well.
  live('LOG-split_CH01', 12); live('LOG-split_CH03', 12); gone('LOG-split_CH02', 12); gone('LOG-split_CH01', 12);
  ['LOG-split_CH01', 'LOG-split_CH02', 'LOG-split_CH03'].forEach(source);
  // Every chunk archived; older than LOG-split.
  gone('LOG-old_CH01', 10); gone('LOG-old_CH02', 10); source('LOG-old_CH01'); source('LOG-old_CH02');
  // Archived, and its parts were archived PROCESSED: already queued.
  gone('LOG-done_CH01', 11); source('LOG-done_CH01');
  gone('LOG-done_VC01of01', 11, 'VECTOR_CLASSIFY', 'PROCESSED');
  // Archived, its only parts SUPERSEDED by the reset: still eligible.
  gone('LOG-reset_CH01', 13); source('LOG-reset_CH01');
  gone('LOG-reset_VC01of02', 13, 'VECTOR_CLASSIFY', 'SUPERSEDED');
  // An archived part never counts as in flight.
  gone('LOG-old_VC01of01', 9, 'VECTOR_CLASSIFY', 'PENDING_FLOW');

  const r = env.exported.queueVectorClassifyBackfill({ apply: false, limit: 5 });

  assert.equal(r.inFlight, 0);
  assert.deepEqual(r.sessions.map((s) => [s.sessionUid, s.chunks]), [['LOG-split', 3], ['LOG-reset', 1]]);
  const reasons = Object.fromEntries(r.skipped.map((s) => [s.sessionUid, s.reason.split(':')[0]]));
  assert.deepEqual(reasons, { 'LOG-old': 'ALREADY_QUEUED', 'LOG-done': 'ALREADY_QUEUED' });

  const applied = env.exported.queueVectorClassifyBackfill({ apply: true, limit: 1 });
  assert.deepEqual(applied.sessions.map((s) => s.sessionUid), ['LOG-split']);
  const part = stagingData(staging).find((row) => row[1] === 'LOG-split_VC01of01');
  assert.equal(env.sandbox.DocumentApp.openById(part[4]).getBody().getText(),
    'text LOG-split_CH01\n\ntext LOG-split_CH02\n\ntext LOG-split_CH03');
});

const backfillTriggers = (sandbox) =>
  sandbox.ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'runClassifyBackfillTrigger');

test('installClassifyBackfillTrigger: one 15-minute trigger, however often it is run', () => {
  const env = setup();
  assert.equal(env.exported.installClassifyBackfillTrigger().installed, true);
  assert.equal(env.exported.installClassifyBackfillTrigger().installed, false);
  const t = backfillTriggers(env.sandbox);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0].__calls.find((c) => c.method === 'everyMinutes').args, [15]);

  assert.equal(env.exported.removeClassifyBackfillTrigger(), 1);
  assert.equal(backfillTriggers(env.sandbox).length, 0);
});

test('runClassifyBackfillTrigger: queues a batch per run and removes itself once nothing is left', () => {
  const env = setup();
  seedBackfill(env);
  env.exported.installClassifyBackfillTrigger();

  const first = env.exported.runClassifyBackfillTrigger();
  assert.equal(first.ran, true);
  assert.equal(first.result.selected, 2, 'LOG-s1 and LOG-s5 fit one default batch');
  assert.equal(first.removed, false);
  assert.equal(backfillTriggers(env.sandbox).length, 1);

  // Both are queued now, so nothing is eligible, though their parts are still in flight.
  const second = env.exported.runClassifyBackfillTrigger();
  assert.equal(second.result.selected, 0);
  assert.equal(second.result.eligible, 0);
  assert.equal(second.removed, true);
  assert.equal(backfillTriggers(env.sandbox).length, 0);
  assert.equal(env.sandbox.LockService.getScriptLock().hasLock(), false, 'the lock is released');
});

test('runClassifyBackfillTrigger: keeps its trigger while sessions are waiting on a batch in flight', () => {
  const env = setup();
  seedBackfill(env);
  env.staging.appendRow([new Date(), 'LOG-zz_VC01of01', 'VECTOR_CLASSIFY', 'u', 'f-zz', 'PENDING_FLOW', 0]);
  env.exported.installClassifyBackfillTrigger();

  const r = env.exported.runClassifyBackfillTrigger();
  assert.equal(r.result.selected, 0);
  assert.equal(r.result.eligible, 2);
  assert.equal(r.removed, false);
  assert.equal(backfillTriggers(env.sandbox).length, 1);
});

test('runClassifyBackfillTrigger: an error is reported and the trigger stays for the next run', () => {
  const env = setup();
  env.exported.installClassifyBackfillTrigger();
  env.sandbox.PropertiesService.getScriptProperties().deleteProperty('INDEX_ID');

  const r = env.exported.runClassifyBackfillTrigger();
  assert.equal(r.ran, false);
  assert.ok(r.error);
  assert.equal(backfillTriggers(env.sandbox).length, 1);
  assert.equal(env.sandbox.LockService.getScriptLock().hasLock(), false);
});

test('queueVectorClassifyBackfill: never classifies a second copy of the same content', () => {
  const env = setup();
  const { staging, curator, ss } = env;
  const archive = ss.insertSheet('STAGING_ARCHIVE');
  archive.appendRow(['Archived_At'].concat(STAGING_HEADERS));
  const gone = (uid, day) => archive.appendRow(
    [new Date(), new Date('2026-09-' + day), uid, 'SESSION_LOG', 'u', 'f-' + uid, 'PROCESSED', 0]);
  const live = (uid, day) => staging.appendRow([new Date('2026-09-' + day), uid, 'SESSION_LOG', 'u', 'f-' + uid, 'PROCESSED', 0]);
  const source = (uid) => curator.appendRow([new Date(), uid, 'SESSION_LOG', 'f-' + uid, 'text ' + uid, 'READY']);

  // The 2026-10-06 case: the kept copy is classified; the dropped copy's
  // chunks were archived before the repair, so none of them reads DUPLICATE.
  const matrix = ss.insertSheet('VECTOR_MATRIX');
  matrix.appendRow(['Session_UID', 'Timestamp', 'ARCHITECTURE']);
  matrix.appendRow(['LOG-1789058964096-edd1075a', new Date(), 0.5]);
  gone('LOG-1789059068989-edd1075a_CH01', 10); source('LOG-1789059068989-edd1075a_CH01');
  // Two unclassified copies of new content: only the older is eligible.
  live('LOG-1789000000001-aaaa1111_CH01', 11); source('LOG-1789000000001-aaaa1111_CH01');
  live('LOG-aaaa1111_CH01', 12); source('LOG-aaaa1111_CH01');
  // A different hash is unaffected.
  live('LOG-bbbb2222_CH01', 13); source('LOG-bbbb2222_CH01');

  const r = env.exported.queueVectorClassifyBackfill({ apply: false, limit: 5 });

  assert.deepEqual(r.sessions.map((s) => s.sessionUid), ['LOG-1789000000001-aaaa1111', 'LOG-bbbb2222']);
  const reasons = Object.fromEntries(r.skipped.map((s) => [s.sessionUid, s.reason]));
  assert.equal(reasons['LOG-1789059068989-edd1075a'], 'DUPLICATE_HASH: same content as LOG-1789058964096-edd1075a');
  assert.equal(reasons['LOG-aaaa1111'], 'DUPLICATE_HASH: same content as LOG-1789000000001-aaaa1111');
});
