'use strict';
// Regression test for processIntakePayload()'s VECTOR ROUTER call
// (3_Queue_Processor.gs) — found while verifying the rebuilt kos-personal
// Studio integration end to end. A real Curator (SESSION_LOG) fixture run
// produced a genuine, non-fabricated VECTOR_MATRIX row with every theme at
// 0 alongside the real VECTOR_CLASSIFY row's real scores. Root cause:
// processIntakePayload() called _routeVectorWeightsInternal() (4_Vector_
// Router.gs) unconditionally for every payload type it handles, including
// SESSION_LOG payloads whose vector_weights is explicitly null by the
// Bifurcation Boundary design (the Curator never computes a session-level
// vector weight — only the Classification flow does; see 4_Vector_
// Router.gs's file header). On an empty matrix that just wrote harmless
// zeros; on a matrix with real accumulated scores, _writeMatrixRow's own
// decay branch would have applied CFG.DECAY_FACTOR to every theme's real
// previous score instead, silently decaying the whole matrix on sessions
// that never classified anything.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '4_Vector_Router.gs'),
  path.join(KP, '12_StudioReturnHarvest.gs'),
  path.join(KP, '3_Queue_Processor.gs'),
];

function load() {
  return loadGasFiles(FILES, [
    'processIntakePayload', 'processInferenceQueue', 'CFG', '_getOrCreateSheet',
  ]);
}

function setUp(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const stateDoc = sandbox.DocumentApp.create('CURRENT_STATE');
  const pivotDoc = sandbox.DocumentApp.create('PIVOTS_AND_LESSONS');

  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('INDEX_ID', ss.getId());
  props.setProperty('ID_CURRENT_STATE', stateDoc.getId());
  props.setProperty('ID_PIVOTS_AND_LESSONS', pivotDoc.getId());
  // Pass _coldEngineGate's TIER_2 check — processInferenceQueue() is gated
  // the same as every other armed-only operator tool.
  props.setProperty('IDENTITY_KEY', 'fake-identity-key');
  props.setProperty('CORE_THESIS_VERIFIED', 'true');
  return ss;
}

function vectorMatrixRows(ss) {
  const sheet = ss.getSheetByName('VECTOR_MATRIX');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

test('a SESSION_LOG payload with vector_weights: null never reaches the Vector Router', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  const result = exported.processIntakePayload(JSON.stringify({
    session_uid: 'FIXTURE-SESSION_LOG',
    session_summary: 'Curator-only session, no classification performed.',
    session_metadata: { session_type: 'WORKING', cold_start: false, rtp_version: 'v8.0' },
    vector_weights: null,
  }), 'FIXTURE-SESSION_LOG');

  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.vectorRouting.status, 'SKIPPED',
    'a null vector_weights payload must not invoke _routeVectorWeightsInternal');
  assert.deepEqual(vectorMatrixRows(ss), [],
    'the Curator has no vector data to route — VECTOR_MATRIX must stay untouched, ' +
    'not gain a phantom all-zero row (or, on a populated matrix, decay real scores)');
});

test('a payload carrying real vector_weights still reaches the Vector Router', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  const result = exported.processIntakePayload(JSON.stringify({
    session_uid: 'FIXTURE-WITH-WEIGHTS',
    vector_weights: { ARCHITECTURE: 0.6, GAS_DEVELOPMENT: 0.4 },
  }), 'FIXTURE-WITH-WEIGHTS');

  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.vectorRouting.status, 'SUCCESS');
  const rows = vectorMatrixRows(ss);
  assert.equal(rows.length, 1, 'a real vector_weights payload must still write its VECTOR_MATRIX row');
  assert.equal(rows[0][0], 'FIXTURE-WITH-WEIGHTS');
});

// The literal string THE_CURATOR sometimes sends before the Router has ever
// run ("UNAVAILABLE — Vector_Router.gs output missing", see the MATRIX_LEDGER
// write's own FIX comment a few lines above the one this test covers) is
// truthy but not an object — must be skipped the same way null is.
test('a non-object vector_weights placeholder string is also skipped, not routed', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  const result = exported.processIntakePayload(JSON.stringify({
    session_uid: 'FIXTURE-PLACEHOLDER-STRING',
    vector_weights: 'UNAVAILABLE — Vector_Router.gs output missing',
  }), 'FIXTURE-PLACEHOLDER-STRING');

  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.vectorRouting.status, 'SKIPPED');
  assert.deepEqual(vectorMatrixRows(ss), []);
});

// ── The shared-File_ID race (processInferenceQueue's own read) ─────────────
//
// installStudioFlowFixture() deliberately points a SESSION_LOG row and a
// VECTOR_CLASSIFY row at the SAME File_ID, for the same reason real Curator
// sessions eventually will (CURATOR_PROMPT.md Rule 1's paired-row citation —
// see that fixture's own header). _srOverwriteDocBody_ replaces a doc's
// ENTIRE body on every harvest, so whichever row's return is harvested LAST
// leaves the doc holding ITS content — not the other row's. Before this fix,
// processInferenceQueue() re-read that live, mutable doc body for every row;
// after, it reads each row's own STUDIO_RETURN entry (keyed by Payload_UID,
// never touched by a different UID's harvest) instead, falling back to the
// doc read only if that entry is gone.

function sessionLogRows(ss) {
  const sheet = ss.getSheetByName('SESSION_LOG');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

function appendStagingRow(ss, { uid, type, fileId }) {
  ss.getSheetByName('STAGING_PIPELINE').appendRow([
    '2026-09-07 17:00:00', uid, type, 'https://docs.example/doc', fileId, 'FLOW_COMPLETE', 0,
  ]);
}

function appendReturnRow(ss, { uid, type, primary, auditor }) {
  ss.getSheetByName('STUDIO_RETURN').appendRow([
    '2026-09-07 17:00:00', uid, type, primary, auditor || '', 'HARVESTED', 1, '',
  ]);
}

test('processInferenceQueue reads each row\'s own STUDIO_RETURN entry, not a doc a companion row already overwrote', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  // appendRow() via ss.getSheetByName() needs the sheet (and its header row)
  // to exist first — _getOrCreateSheet is what every real caller uses to get
  // that for free; STAGING_PIPELINE and STUDIO_RETURN both need it here
  // since this test populates rows before processInferenceQueue() ever runs.
  exported._getOrCreateSheet(ss, 'STAGING_PIPELINE');
  exported._getOrCreateSheet(ss, 'STUDIO_RETURN');

  const sharedDoc = sandbox.DocumentApp.create('shared-session-doc');
  const fileId = sharedDoc.getId();

  const curatorPayload = {
    session_uid: 'FIXTURE-SR-RACE-SESSION_LOG',
    session_summary: 'Real Curator summary that must reach SESSION_LOG.',
    session_metadata: { session_type: 'WORKING', cold_start: false, rtp_version: 'v8.0' },
    vector_weights: null,
  };
  const classifyPayload = [{
    exchange_type: 'EXPLORATORY',
    sentences: [{ sentence_id: 1, vectors: { ARCHITECTURE: 0.8 }, unmapped_signals: [] }],
  }];

  // Both STAGING_PIPELINE rows share one File_ID, exactly as the real fixture does.
  appendStagingRow(ss, { uid: 'FIXTURE-SR-RACE-SESSION_LOG', type: 'SESSION_LOG', fileId });
  appendStagingRow(ss, { uid: 'FIXTURE-SR-RACE-VECTOR_CLASSIFY', type: 'VECTOR_CLASSIFY', fileId });

  // STUDIO_RETURN keeps each row's OWN payload, uncorrupted, keyed by UID.
  appendReturnRow(ss, {
    uid: 'FIXTURE-SR-RACE-SESSION_LOG', type: 'SESSION_LOG',
    primary: JSON.stringify(curatorPayload),
  });
  appendReturnRow(ss, {
    uid: 'FIXTURE-SR-RACE-VECTOR_CLASSIFY', type: 'VECTOR_CLASSIFY',
    primary: JSON.stringify(classifyPayload),
  });

  // The Classification row's harvest ran LAST and clobbered the shared doc —
  // its body now holds the array, not the Curator's object. A pre-fix
  // processInferenceQueue() would read exactly this for BOTH staging rows.
  sharedDoc.getBody().setText(JSON.stringify(classifyPayload));

  exported.processInferenceQueue();

  const staging = ss.getSheetByName('STAGING_PIPELINE');
  const rows = staging.getRange(2, 1, staging.getLastRow() - 1, 7).getValues();
  const statusByUid = Object.fromEntries(rows.map(r => [r[1], r[5]]));
  assert.equal(statusByUid['FIXTURE-SR-RACE-SESSION_LOG'], 'PROCESSED',
    'the SESSION_LOG row must process successfully from its own STUDIO_RETURN entry');
  assert.equal(statusByUid['FIXTURE-SR-RACE-VECTOR_CLASSIFY'], 'PROCESSED');

  const logRows = sessionLogRows(ss);
  assert.equal(logRows.length, 1,
    'the Curator\'s real summary must reach SESSION_LOG even though the shared doc ' +
    'no longer holds it — pre-fix this was silently skipped (pd was the array, not an object)');
  assert.equal(logRows[0][0], 'FIXTURE-SR-RACE-SESSION_LOG');
  assert.equal(logRows[0][5], curatorPayload.session_summary);

  const matrixRows = vectorMatrixRows(ss);
  const architectureCol = 2; // Session_UID, Timestamp, ARCHITECTURE, ...
  const classifyRow = matrixRows.find(r => r[0] === 'FIXTURE-SR-RACE-VECTOR_CLASSIFY');
  assert.ok(classifyRow, 'the real classification row must still land in VECTOR_MATRIX');
  assert.equal(classifyRow[architectureCol], 0.8);
  // Pre-fix, the SESSION_LOG row also produced a phantom all-zero VECTOR_MATRIX
  // row (it fell through to _routeVectorWeightsInternal with an undefined
  // vector_weights, same as the earlier bug) — confirm there's exactly one
  // real row here, not two.
  assert.equal(matrixRows.length, 1,
    'no phantom VECTOR_MATRIX row from the SESSION_LOG UID');
});
