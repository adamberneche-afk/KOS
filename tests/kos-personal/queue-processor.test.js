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
  path.join(KP, '3_Queue_Processor.gs'),
];

function load() {
  return loadGasFiles(FILES, ['processIntakePayload', 'CFG']);
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
