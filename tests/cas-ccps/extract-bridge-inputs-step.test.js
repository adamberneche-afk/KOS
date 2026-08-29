'use strict';
// Regression tests for cas-ccps/studio-steps/ExtractBridgeInputsStep.gs —
// Flow 5's input-preparation step.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'ExtractBridgeInputsStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, STEP_PATH], exposeNames);
}

test('onExtractBridgeInputsExecute: pulls flow5_prior_response, pacing_prior_connection, course_name out of the snapshot', () => {
  const { exported } = load(['onExtractBridgeInputsExecute']);
  const lesson = {
    flow5_prior_response: 'Last week you discussed supply and demand.',
    pacing_prior_connection: 'Builds on unit 2',
    course_name: 'Sports Marketing',
  };
  const result = exported.onExtractBridgeInputsExecute(makeStudioEvent({ lessonContextSnapshotJson: JSON.stringify(lesson) }));
  assert.equal(result.variables.extractStatus.stringValues[0], 'OK');
  assert.equal(result.variables.flow5PriorResponse.stringValues[0], lesson.flow5_prior_response);
  assert.equal(result.variables.pacingPriorConnection.stringValues[0], 'Builds on unit 2');
  assert.equal(result.variables.courseName.stringValues[0], 'Sports Marketing');
});

test('onExtractBridgeInputsExecute: no prior response in snapshot -> NO_PRIOR_RESPONSE_IN_SNAPSHOT (defense in depth)', () => {
  const { exported } = load(['onExtractBridgeInputsExecute']);
  const result = exported.onExtractBridgeInputsExecute(makeStudioEvent({ lessonContextSnapshotJson: JSON.stringify({ course_name: 'X' }) }));
  assert.equal(result.variables.extractStatus.stringValues[0], 'NO_PRIOR_RESPONSE_IN_SNAPSHOT');
  assert.equal(result.variables.flow5PriorResponse.stringValues[0], '');
});

test('onExtractBridgeInputsExecute: malformed snapshot -> LESSON_SNAPSHOT_PARSE_FAILED', () => {
  const { exported } = load(['onExtractBridgeInputsExecute']);
  const result = exported.onExtractBridgeInputsExecute(makeStudioEvent({ lessonContextSnapshotJson: 'not json' }));
  assert.equal(result.variables.extractStatus.stringValues[0], 'LESSON_SNAPSHOT_PARSE_FAILED');
});

test('onExtractBridgeInputsExecute: an unmapped input never throws uncaught (fails closed)', () => {
  const { exported } = load(['onExtractBridgeInputsExecute']);
  const result = exported.onExtractBridgeInputsExecute(makeStudioEvent({ lessonContextSnapshotJson: null }));
  assert.equal(result.variables.extractStatus.stringValues[0], 'LESSON_SNAPSHOT_PARSE_FAILED');
});
