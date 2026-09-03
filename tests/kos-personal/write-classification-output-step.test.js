'use strict';
// Regression tests for
// kos-personal/studio-steps/WriteClassificationOutputStep.gs —
// VECTOR_CLASSIFY Flow Steps 3 + 4: validate JSON array shape, write
// Gemini's output through byte-for-byte unchanged, mark
// STAGING_PIPELINE complete only on success.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'kos-personal', 'studio-steps', 'StepsShared.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'kos-personal', 'studio-steps', 'WriteClassificationOutputStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, STEP_PATH], exposeNames);
}

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

test('onWriteClassificationOutputExecute: a valid JSON array is written through byte-for-byte unchanged, not re-serialized', () => {
  const { exported, sandbox } = load(['onWriteClassificationOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  sp.appendRow(stagingRow('P1', doc.getId()));

  // Deliberately unusual formatting (extra spaces, specific key order) —
  // if this step re-serialized via JSON.stringify(parsed), the exact
  // byte layout below would NOT survive.
  const rawArrayText = '[ { "b": 2, "a":  1.50 } ]';
  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    classificationJsonOutput: rawArrayText,
  });
  const result = exported.onWriteClassificationOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');
  assert.equal(doc.getBody().getText(), rawArrayText);
  assert.equal(sp.getRange(2, 1, 1, 7).getValues()[0][5], 'FLOW_COMPLETE');
});

test('onWriteClassificationOutputExecute: a well-formed JSON OBJECT (not an array) is rejected as wrong shape', () => {
  const { exported, sandbox } = load(['onWriteClassificationOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  sp.appendRow(stagingRow('P1', doc.getId()));

  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    classificationJsonOutput: JSON.stringify({ not: 'an array' }),
  });
  const result = exported.onWriteClassificationOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'CLASSIFICATION_JSON_NOT_ARRAY');
  assert.equal(doc.getBody().getText(), 'raw session text'); // untouched
  assert.equal(sp.getRange(2, 1, 1, 7).getValues()[0][5], 'STUDIO_ACTIVE');
});

test('onWriteClassificationOutputExecute: a fence-wrapped array validates (fence only affects validation, not what gets written)', () => {
  const { exported, sandbox } = load(['onWriteClassificationOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  sp.appendRow(stagingRow('P1', doc.getId()));

  const fenced = '```json\n[{"a":1}]\n```';
  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    classificationJsonOutput: fenced,
  });
  const result = exported.onWriteClassificationOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');
  // The ORIGINAL fenced text is what's written -- stripping is only used
  // to validate the shape, per this file's own header.
  assert.equal(doc.getBody().getText(), fenced);
});

test('onWriteClassificationOutputExecute: malformed JSON -> CLASSIFICATION_JSON_PARSE_FAILED, touches nothing', () => {
  const { exported, sandbox } = load(['onWriteClassificationOutputExecute']);
  const { ss, sp } = setUp(sandbox);
  const doc = makeDocWithText(sandbox, 'raw session text');
  sp.appendRow(stagingRow('P1', doc.getId()));

  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: doc.getId(),
    classificationJsonOutput: 'not json',
  });
  const result = exported.onWriteClassificationOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'CLASSIFICATION_JSON_PARSE_FAILED');
  assert.equal(doc.getBody().getText(), 'raw session text');
});

test('onWriteClassificationOutputExecute: an unmapped required input never throws uncaught (fails closed)', () => {
  const { exported, sandbox } = load(['onWriteClassificationOutputExecute']);
  const { ss } = setUp(sandbox);
  const event = makeStudioEvent({
    stagingPipelineSsId: ss.getId(), payloadUid: 'P1', fileId: 'x',
    classificationJsonOutput: null,
  });
  const result = exported.onWriteClassificationOutputExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'CLASSIFICATION_JSON_PARSE_FAILED');
});
