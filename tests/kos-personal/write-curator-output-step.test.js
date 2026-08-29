'use strict';
// Regression tests for kos-personal/studio-steps/WriteCuratorOutputStep.gs —
// Curator Flow Steps 2b + 3 + 4: merge Auditor sign-off, overwrite doc
// body, mark STAGING_PIPELINE complete only on success.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'kos-personal', 'studio-steps', 'StepsShared.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'kos-personal', 'studio-steps', 'WriteCuratorOutputStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, STEP_PATH], exposeNames);
}

// STAGING_PIPELINE columns (STAGING_COLUMNS_): TIMESTAMP=0, PAYLOAD_UID=1,
// PAYLOAD_TYPE=2, DOC_URL=3, FILE_ID=4, STATUS=5, RETRY_COUNT=6.
function stagingRow(payloadUid, fileId, status = 'STUDIO_ACTIVE') {
  const r = new Array(7).fill('');
  r[1] = payloadUid; r[4] = fileId; r[5] = status;
  return r;
}

function setUp(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const sp = ss.insertSheet('STAGING_PIPELINE');
  sp.appendRow(new Array(7).fill('header'));
  return { ss, sp };
}

function makeDocWithText(sandbox, text) {
  const doc = sandbox.DocumentApp.create('Session Doc');
  doc.getBody().setText(text);
  return doc;
}

test('onWriteCuratorOutputExecute: no Auditor pass -- writes Curator JSON to the doc and marks FLOW_COMPLETE', () => {
  const { exported, sandbox } = load(['onWriteCuratorOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  sp.appendRow(stagingRow('P1', doc.getId()));

  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    curatorJsonOutput: JSON.stringify({ summary: 'a session' }),
    auditorJsonOutput: '',
  });
  const result = exported.onWriteCuratorOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');

  const written = JSON.parse(doc.getBody().getText());
  assert.equal(written.summary, 'a session');
  assert.ok(!('auditor_sign_off' in written));
  assert.equal(sp.getRange(2, 1, 1, 7).getValues()[0][5], 'FLOW_COMPLETE');
});

test('onWriteCuratorOutputExecute: an Auditor pass merges auditor_sign_off as a single top-level key', () => {
  const { exported, sandbox } = load(['onWriteCuratorOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  sp.appendRow(stagingRow('P1', doc.getId()));

  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    curatorJsonOutput: JSON.stringify({ summary: 'a session' }),
    auditorJsonOutput: JSON.stringify({ status: 'VERIFIED', unverified_claims_count: 0, trace_log: [] }),
  });
  const result = exported.onWriteCuratorOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');

  const written = JSON.parse(doc.getBody().getText());
  assert.equal(written.auditor_sign_off.status, 'VERIFIED');
});

test('onWriteCuratorOutputExecute: malformed Curator JSON -- touches nothing (doc untouched, STAGING_PIPELINE untouched)', () => {
  const { exported, sandbox } = load(['onWriteCuratorOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  sp.appendRow(stagingRow('P1', doc.getId()));

  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    curatorJsonOutput: 'not json', auditorJsonOutput: '',
  });
  const result = exported.onWriteCuratorOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'CURATOR_JSON_PARSE_FAILED');
  assert.equal(doc.getBody().getText(), 'raw session text');
  assert.equal(sp.getRange(2, 1, 1, 7).getValues()[0][5], 'STUDIO_ACTIVE');
});

test('onWriteCuratorOutputExecute: malformed Auditor JSON -- touches nothing, even though the Curator JSON was valid', () => {
  const { exported, sandbox } = load(['onWriteCuratorOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  sp.appendRow(stagingRow('P1', doc.getId()));

  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    curatorJsonOutput: JSON.stringify({ summary: 'ok' }), auditorJsonOutput: 'not json',
  });
  const result = exported.onWriteCuratorOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'AUDITOR_JSON_PARSE_FAILED');
  assert.equal(doc.getBody().getText(), 'raw session text');
  assert.equal(sp.getRange(2, 1, 1, 7).getValues()[0][5], 'STUDIO_ACTIVE');
});

test('onWriteCuratorOutputExecute: fence-wrapped Curator/Auditor JSON is accepted', () => {
  const { exported, sandbox } = load(['onWriteCuratorOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  sp.appendRow(stagingRow('P1', doc.getId()));

  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    curatorJsonOutput: '```json\n' + JSON.stringify({ summary: 'ok' }) + '\n```',
    auditorJsonOutput: '```json\n' + JSON.stringify({ status: 'VERIFIED' }) + '\n```',
  });
  const result = exported.onWriteCuratorOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');
});

test('onWriteCuratorOutputExecute: doc write succeeds but STAGING_PIPELINE row is gone -- distinct status, not silently retried', () => {
  const { exported, sandbox } = load(['onWriteCuratorOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  // Deliberately no matching STAGING_PIPELINE row for P1.

  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    curatorJsonOutput: JSON.stringify({ summary: 'ok' }), auditorJsonOutput: '',
  });
  const result = exported.onWriteCuratorOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'STAGING_ROW_NOT_FOUND_AFTER_DOC_WRITE');
  // The doc WAS overwritten in this specific partial-failure case.
  assert.notEqual(doc.getBody().getText(), 'raw session text');
});

test('onWriteCuratorOutputExecute: an unmapped required input never throws uncaught (fails closed)', () => {
  const { exported, sandbox } = load(['onWriteCuratorOutputExecute']);
  const { ss } = setUp(sandbox);
  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: 'x',
    curatorJsonOutput: null, auditorJsonOutput: null,
  });
  const result = exported.onWriteCuratorOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'CURATOR_JSON_PARSE_FAILED');
});
