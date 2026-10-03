'use strict';
// Regression tests for the VECTOR_MATRIX Phase 0 repair (RTP notebook plan):
// kos-personal/4_Vector_Router.gs (_writeMatrixRow, _vmDecayedState_,
// getVectorState) and kos-personal/21_VectorMatrixRepair.gs.
//
// Pins: a session's row holds only its own scores (0 for a theme it didn't
// score, never the previous session's value × DECAY_FACTOR); decay is
// applied when the matrix is read, in session date order rather than sheet
// order; the duplicate finder keeps one session per content hash, marks the
// other copies DUPLICATE, removes their matrix rows, and leaves a group with
// a copy at Studio alone; the backfill skips DUPLICATE sessions; and the
// rederive rebuilds rows from the classify part docs, keeps what it can't
// rebuild, puts rows in date order, and writes nothing in a dry run.

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
  path.join(KP, '21_VectorMatrixRepair.gs'),
];
const EXPOSE = [
  'processVectorClassificationPayload', 'getVectorState', '_vmDecayedState_', '_buildMatrixRow_',
  'previewDuplicateSessions', 'applyDuplicateSessions', 'queueVectorClassifyBackfill',
  'previewVectorMatrixRederive', 'applyVectorMatrixRederive', 'KNOWN_STAGING_STATUSES', 'CFG',
];

const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];
const MATRIX_HEADERS = ['Session_UID', 'Timestamp', 'ARCHITECTURE', 'UI', 'INCUBATOR_SIGNALS', 'CHECKSUM'];

function setup() {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());
  props.setProperty('IDENTITY_KEY', 'k');
  props.setProperty(exported.CFG.PROP.THESIS_VERIFIED, 'true');
  const staging = ss.insertSheet(exported.CFG.STAGING_SHEET);
  staging.appendRow(STAGING_HEADERS);
  return { exported, sandbox, ss, staging };
}

// A two-theme matrix written by hand: [uid, ARCHITECTURE, UI] per row.
function seedMatrix(env, rows) {
  const matrix = env.ss.insertSheet('VECTOR_MATRIX');
  matrix.appendRow(MATRIX_HEADERS);
  rows.forEach(([uid, a, u]) => {
    matrix.appendRow(env.exported._buildMatrixRow_(['ARCHITECTURE', 'UI'], { ARCHITECTURE: a, UI: u }, uid, 't').row);
  });
  return matrix;
}

function exchanges(vectors) {
  return [{ exchange_type: 'DECISION', sentences: [{ sentence_id: 1, vectors, unmapped_signals: [] }] }];
}

function rowsOf(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

const col = (ss, name) => ss.getSheetByName('VECTOR_MATRIX').getRange(1, 1, 1, 99).getValues()[0].indexOf(name);
const stage = (env, day, uid, status, fileId) =>
  env.staging.appendRow([new Date('2026-09-' + day), uid, uid.includes('_VC') ? 'VECTOR_CLASSIFY' : 'SESSION_LOG',
    'u', fileId || 'f-' + uid, status, 0]);

// ── _writeMatrixRow / read-time decay ─────────────────────────────────

test('_writeMatrixRow: a theme the session did not score is 0, not the previous row decayed', () => {
  const env = setup();
  const { exported, ss } = env;
  exported.processVectorClassificationPayload(JSON.stringify(exchanges({ ARCHITECTURE: 0.8, UI: 0.4 })), 'LOG-aaaa0001', 't');
  exported.processVectorClassificationPayload(JSON.stringify(exchanges({ ARCHITECTURE: 0.5 })), 'LOG-aaaa0002', 't');

  const rows = rowsOf(ss, 'VECTOR_MATRIX');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][col(ss, 'ARCHITECTURE')], 0.5);
  assert.equal(rows[1][col(ss, 'UI')], 0, 'UI was 0.4 × 0.92 under the old carry-forward');
});

test('getVectorState: decays a theme across the sessions that did not score it', () => {
  const env = setup();
  const { exported } = env;
  exported.processVectorClassificationPayload(JSON.stringify(exchanges({ ARCHITECTURE: 0.8, UI: 0.4 })), 'LOG-aaaa0001', 't');
  exported.processVectorClassificationPayload(JSON.stringify(exchanges({ ARCHITECTURE: 0.5 })), 'LOG-aaaa0002', 't');

  const state = exported.getVectorState();
  const score = Object.fromEntries(state.vectors.map((v) => [v.name, v.score]));
  assert.equal(score.ARCHITECTURE, 0.5);
  assert.equal(score.UI, 0.37, '0.4 × 0.92, rounded for display');
  assert.equal(state.session_uid, 'LOG-aaaa0002');
});

test('_vmDecayedState_: orders sessions by date, not by sheet row', () => {
  const env = setup();
  // Sheet order: B then A. Dates: A (Sep 10) before B (Sep 12).
  const matrix = seedMatrix(env, [['LOG-bbbbbbbb', 0.6, 0], ['LOG-aaaaaaaa', 0, 0.5]]);
  stage(env, 12, 'LOG-bbbbbbbb_CH01', 'PROCESSED');
  stage(env, 10, 'LOG-aaaaaaaa_CH01', 'PROCESSED');

  const state = env.exported._vmDecayedState_(env.ss, matrix);
  assert.equal(state.latest[0], 'LOG-bbbbbbbb');
  assert.equal(state.scores.ARCHITECTURE, 0.6);
  assert.equal(state.scores.UI, 0.46, 'A\'s UI decays once, through B');
});

test('_vmDecayedState_: an old-style UID is dated by the epoch in it', () => {
  const env = setup();
  const matrix = seedMatrix(env, [['LOG-1789000000000-cccccccc', 0, 0.5], ['LOG-1788000000000-dddddddd', 0.7, 0]]);
  const state = env.exported._vmDecayedState_(env.ss, matrix);
  assert.equal(state.latest[0], 'LOG-1789000000000-cccccccc');
  assert.equal(state.scores.ARCHITECTURE, 0.644);
  assert.equal(state.scores.UI, 0.5);
});

// ── duplicate sessions ────────────────────────────────────────────────

function seedDuplicates(env) {
  // 6c6944a8: two copies; the later one has the matrix row, the earlier more PROCESSED chunks.
  stage(env, 10, 'LOG-1789000000000-6c6944a8_CH01', 'PROCESSED');
  stage(env, 10, 'LOG-1789000000000-6c6944a8_CH02', 'PROCESSED');
  stage(env, 11, 'LOG-1789100000000-6c6944a8_CH01', 'PROCESSED');
  stage(env, 11, 'LOG-1789100000000-6c6944a8_VC01of01', 'PROCESSED');
  // edd1075a: three copies, none classified; the one with most PROCESSED chunks wins.
  stage(env, 12, 'LOG-1789200000000-edd1075a_CH01', 'AUDIT_REJECTED');
  stage(env, 13, 'LOG-1789300000000-edd1075a_CH01', 'PROCESSED');
  stage(env, 14, 'LOG-1789400000000-edd1075a_CH01', 'PENDING_FLOW');
  // 79edf49b: the second copy is at Studio, so the group waits.
  stage(env, 15, 'LOG-1789500000000-79edf49b_CH01', 'PROCESSED');
  stage(env, 16, 'LOG-1789600000000-79edf49b_CH01', 'STUDIO_ACTIVE');
  // cd01a44e: both copies classified; the earlier is kept and the later's row removed.
  stage(env, 17, 'LOG-1789700000000-cd01a44e_CH01', 'PROCESSED');
  stage(env, 18, 'LOG-1789800000000-cd01a44e_CH01', 'PROCESSED');
  // A session with no copy.
  stage(env, 19, 'LOG-11112222_CH01', 'PROCESSED');
  seedMatrix(env, [['LOG-1789100000000-6c6944a8', 0.5, 0.5], ['LOG-1789700000000-cd01a44e', 0.4, 0.4],
    ['LOG-1789800000000-cd01a44e', 0.4, 0.4], ['LOG-11112222', 0.1, 0.1]]);
}

test('previewDuplicateSessions: picks a keeper per hash and changes nothing', () => {
  const env = setup();
  seedDuplicates(env);
  const before = JSON.stringify(env.staging.rows);

  const r = env.exported.previewDuplicateSessions();
  const byHash = Object.fromEntries(r.groups.map((g) => [g.hash, g]));

  assert.equal(r.groups.length, 4);
  assert.equal(byHash['6c6944a8'].keep, 'LOG-1789100000000-6c6944a8', 'the copy with a matrix row is kept');
  assert.deepEqual(byHash['6c6944a8'].drop, ['LOG-1789000000000-6c6944a8']);
  assert.equal(byHash['6c6944a8'].rowsToMark, 2);
  assert.equal(byHash['6c6944a8'].matrixRowsToRemove, 0);
  assert.equal(byHash.cd01a44e.keep, 'LOG-1789700000000-cd01a44e', 'both classified: the earliest is kept');
  assert.equal(byHash.cd01a44e.matrixRowsToRemove, 1);
  assert.equal(byHash.edd1075a.keep, 'LOG-1789300000000-edd1075a', 'then the copy with the most PROCESSED chunks');
  assert.equal(byHash.edd1075a.drop.length, 2);
  assert.match(byHash['79edf49b'].skipped, /^IN_FLIGHT/);
  assert.match(r.message, /^DRY RUN: 3 duplicate group\(s\)/);
  assert.equal(JSON.stringify(env.staging.rows), before);
  assert.equal(rowsOf(env.ss, 'VECTOR_MATRIX').length, 4);
});

test('applyDuplicateSessions: marks the dropped copies DUPLICATE and removes their matrix rows', () => {
  const env = setup();
  seedDuplicates(env);

  const r = env.exported.applyDuplicateSessions();
  const status = Object.fromEntries(env.staging.rows.slice(1).map((row) => [row[1], row[5]]));

  assert.equal(r.marked, 5);
  assert.equal(r.matrixRowsRemoved, 1);
  assert.equal(status['LOG-1789000000000-6c6944a8_CH01'], 'DUPLICATE');
  assert.equal(status['LOG-1789000000000-6c6944a8_CH02'], 'DUPLICATE');
  assert.equal(status['LOG-1789200000000-edd1075a_CH01'], 'DUPLICATE');
  assert.equal(status['LOG-1789400000000-edd1075a_CH01'], 'DUPLICATE');
  assert.equal(status['LOG-1789800000000-cd01a44e_CH01'], 'DUPLICATE');
  assert.equal(status['LOG-1789100000000-6c6944a8_CH01'], 'PROCESSED', 'the keeper is untouched');
  assert.equal(status['LOG-1789600000000-79edf49b_CH01'], 'STUDIO_ACTIVE', 'an in-flight group is left alone');
  assert.equal(status['LOG-1789500000000-79edf49b_CH01'], 'PROCESSED');
  assert.deepEqual(rowsOf(env.ss, 'VECTOR_MATRIX').map((row) => row[0]),
    ['LOG-1789100000000-6c6944a8', 'LOG-1789700000000-cd01a44e', 'LOG-11112222']);
  assert.ok(env.exported.KNOWN_STAGING_STATUSES.includes('DUPLICATE'));

  const again = env.exported.previewDuplicateSessions();
  assert.equal(again.groups.filter((g) => !g.skipped).length, 0, 'a second run finds nothing left to do');
});

// Seen live 2026-10-03: a copy whose staging rows were archived still has
// its VECTOR_MATRIX row, and still counts in Vector State.
test('applyDuplicateSessions: finds a copy that is only in VECTOR_MATRIX (its staging rows archived)', () => {
  const env = setup();
  stage(env, 12, 'LOG-1789200000000-edd1075a_CH01', 'PROCESSED');
  seedMatrix(env, [['LOG-1789200000000-edd1075a', 0.5, 0.5], ['LOG-1789050000000-edd1075a', 0.5, 0.5],
    ['LOG-1789900000000-edd1075a', 0.5, 0.5], ['LOG-11112222', 0.1, 0.1]]);

  const preview = env.exported.previewDuplicateSessions();
  assert.equal(preview.groups.length, 1, JSON.stringify(preview.groups));
  const g = preview.groups[0];
  assert.equal(g.keep, 'LOG-1789200000000-edd1075a', 'the copy still in staging, with a PROCESSED chunk, is kept');
  assert.deepEqual(g.drop.slice().sort(), ['LOG-1789050000000-edd1075a', 'LOG-1789900000000-edd1075a']);
  assert.equal(g.rowsToMark, 0, 'the archived copies have no staging rows to mark');
  assert.equal(g.matrixRowsToRemove, 2);

  const r = env.exported.applyDuplicateSessions();
  assert.equal(r.matrixRowsRemoved, 2);
  assert.deepEqual(rowsOf(env.ss, 'VECTOR_MATRIX').map((row) => row[0]),
    ['LOG-1789200000000-edd1075a', 'LOG-11112222']);
  assert.equal(env.exported.previewDuplicateSessions().groups.length, 0, 'nothing left after one apply');
});

test('queueVectorClassifyBackfill: skips a session marked DUPLICATE', () => {
  const env = setup();
  const curator = env.ss.insertSheet('CuratorInput');
  curator.appendRow(['Timestamp', 'Payload_UID', 'Payload_Type', 'File_ID', 'SourceText', 'Status']);
  stage(env, 10, 'LOG-1789000000000-6c6944a8_CH01', 'DUPLICATE');
  curator.appendRow([new Date(), 'LOG-1789000000000-6c6944a8_CH01', 'SESSION_LOG', 'f', 'text', 'READY']);

  const r = env.exported.queueVectorClassifyBackfill({ apply: false });
  assert.equal(r.eligible, 0);
  assert.equal(r.skipped[0].reason.split(':')[0], 'DUPLICATE');
});

// ── rederive ─────────────────────────────────────────────────────────

function partDoc(env, json) {
  const doc = env.sandbox.DocumentApp.create('part');
  doc.getBody().setText(json);
  return doc.getId();
}

function seedRederive(env) {
  // Rows carry the old carry-forward values; sheet order is not date order.
  seedMatrix(env, [['LOG-bbbbbbbb', 0.6, 0.368], ['LOG-aaaaaaaa', 0.3, 0.4], ['LOG-cccccccc', 0.552, 0.9]]);
  stage(env, 12, 'LOG-bbbbbbbb_VC01of02', 'PROCESSED',
    partDoc(env, '```json\n' + JSON.stringify(exchanges({ ARCHITECTURE: 0.6 })) + '\n```'));
  stage(env, 12, 'LOG-bbbbbbbb_VC02of02', 'PROCESSED', partDoc(env, JSON.stringify(exchanges({ ARCHITECTURE: 0.6 }))));
  stage(env, 10, 'LOG-aaaaaaaa_VC01of01', 'PROCESSED', partDoc(env, JSON.stringify(exchanges({ UI: 0.4 }))));
  // C's only part never landed.
  stage(env, 14, 'LOG-cccccccc_VC01of01', 'STUDIO_TIMEOUT');
}

test('previewVectorMatrixRederive: reports what it would rebuild and writes nothing', () => {
  const env = setup();
  seedRederive(env);
  const before = JSON.stringify(rowsOf(env.ss, 'VECTOR_MATRIX'));

  const r = env.exported.previewVectorMatrixRederive();

  assert.equal(r.rebuilt, 2);
  assert.equal(r.changed, 2);
  assert.equal(r.reordered, true);
  assert.deepEqual(r.kept.map((k) => [k.sessionUid, k.reason.split(':')[0]]), [['LOG-cccccccc', 'NO_PARTS']]);
  assert.match(r.message, /^DRY RUN/);
  assert.equal(JSON.stringify(rowsOf(env.ss, 'VECTOR_MATRIX')), before);
});

test('applyVectorMatrixRederive: rewrites rows from their parts, in session date order', () => {
  const env = setup();
  seedRederive(env);

  env.exported.applyVectorMatrixRederive();
  const rows = rowsOf(env.ss, 'VECTOR_MATRIX');

  assert.deepEqual(rows.map((r) => r[0]), ['LOG-aaaaaaaa', 'LOG-bbbbbbbb', 'LOG-cccccccc']);
  assert.deepEqual(rows[0].slice(2, 4), [0, 0.4], 'A no longer carries a decayed ARCHITECTURE');
  assert.deepEqual(rows[1].slice(2, 4), [0.6, 0], 'B no longer carries A\'s UI × 0.92');
  assert.deepEqual(rows[2].slice(2, 4), [0.552, 0.9], 'C, with no parts, is kept as it was');
  assert.equal(rows[1][5], env.exported._buildMatrixRow_(['ARCHITECTURE', 'UI'], { ARCHITECTURE: 0.6 }, 'LOG-bbbbbbbb', 't').row[5],
    'the checksum matches the rebuilt scores');
});

test('rederive: an unreadable part keeps the session\'s row', () => {
  const env = setup();
  seedMatrix(env, [['LOG-aaaaaaaa', 0.3, 0.4]]);
  stage(env, 10, 'LOG-aaaaaaaa_VC01of02', 'PROCESSED', partDoc(env, 'not json'));
  stage(env, 10, 'LOG-aaaaaaaa_VC02of02', 'PROCESSED', partDoc(env, '[]'));

  const r = env.exported.applyVectorMatrixRederive();
  assert.equal(r.rebuilt, 0);
  assert.equal(r.kept[0].reason.split(':')[0], 'PART_UNREADABLE');
  assert.deepEqual(rowsOf(env.ss, 'VECTOR_MATRIX')[0].slice(2, 4), [0.3, 0.4]);
});
