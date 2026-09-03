'use strict';
// Regression tests for cas-ccps/studio-steps/FinalizeWarmUpScoreStep.gs —
// Flow 4's output step: total-score formula, WarmUpQueue/WarmUpRegistry
// writes, doc feedback, and fence-stripped Gemini JSON parsing.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'FinalizeWarmUpScoreStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, STEP_PATH], exposeNames);
}

// WarmUpQueue columns (WQ_FINALIZE_COLUMNS_): QUEUE_ID=0, STATUS=8,
// GRAMMAR_SCORE=13, ENGAGEMENT_SCORE=14, TOTAL_SCORE=16, FLOW4_FEEDBACK=17.
function queueRow(queueId) { const r = new Array(21).fill(''); r[0] = queueId; return r; }
// WarmUpRegistry columns (WR_FINALIZE_COLUMNS_): QUEUE_ID=1, TOTAL_SCORE=10, EXTRA_CREDIT=11.
function registryRow(queueId) { const r = new Array(12).fill(''); r[1] = queueId; return r; }

function setUp(sandbox, { withRegistryRow = true } = {}) {
  const ledgerSs = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ledgerSs.getId(), ledgerSs);
  const wq = ledgerSs.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  wq.appendRow(queueRow('Q1'));
  const wr = ledgerSs.insertSheet('WarmUpRegistry');
  wr.appendRow(new Array(12).fill('header'));
  if (withRegistryRow) wr.appendRow(registryRow('Q1'));
  return { ledgerSs, wq, wr };
}

function makeDoc(sandbox) {
  const doc = sandbox.DocumentApp.create('Warm-Up Doc');
  doc.getBody().appendParagraph('── WARM-UP PROMPT ──\ntext\n── END PROMPT ──\n\n── YOUR RESPONSE ──\nanswer');
  return doc;
}

test('onFinalizeWarmUpScoreExecute: computes total = wordCount + grammar + engagement + extraCredit, writes SCORED + feedback + registry', () => {
  const { exported, sandbox } = load(['onFinalizeWarmUpScoreExecute']);
  const { ledgerSs, wq, wr } = setUp(sandbox);
  const doc = makeDoc(sandbox);

  const event = makeStudioEvent({
    ledgerSsId: ledgerSs.getId(), queueId: 'Q1', fileId: doc.getId(),
    wordCountScore: '2', extraCredit: '1',
    geminiEvalOutput: JSON.stringify({ grammar: 3, engagement: 4, feedback: 'Nice work.' }),
  });
  const result = exported.onFinalizeWarmUpScoreExecute(event);

  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');
  assert.equal(result.variables.registryUpdateStatus.stringValues[0], 'OK');

  const row = wq.getRange(2, 1, 1, 21).getValues()[0];
  assert.equal(row[8], 'SCORED');
  assert.equal(row[13], 3); // GRAMMAR_SCORE
  assert.equal(row[14], 4); // ENGAGEMENT_SCORE
  assert.equal(row[16], 10); // TOTAL_SCORE = 2+3+4+1
  assert.equal(row[17], 'Nice work.');

  const regRow = wr.getRange(2, 1, 1, 12).getValues()[0];
  assert.equal(regRow[10], 10);
  assert.equal(regRow[11], 1);

  assert.match(doc.getBody().getText(), /── FEEDBACK ──/);
  assert.match(doc.getBody().getText(), /Nice work\./);
});

test('onFinalizeWarmUpScoreExecute: fence-wrapped Gemini JSON (```json ... ```) is accepted', () => {
  const { exported, sandbox } = load(['onFinalizeWarmUpScoreExecute']);
  const { ledgerSs } = setUp(sandbox);
  const doc = makeDoc(sandbox);

  const fenced = '```json\n' + JSON.stringify({ grammar: 1, engagement: 1, feedback: 'ok' }) + '\n```';
  const event = makeStudioEvent({
    ledgerSsId: ledgerSs.getId(), queueId: 'Q1', fileId: doc.getId(),
    wordCountScore: '1', extraCredit: '0', geminiEvalOutput: fenced,
  });
  const result = exported.onFinalizeWarmUpScoreExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');
});

test('onFinalizeWarmUpScoreExecute: malformed Gemini JSON -> GEMINI_JSON_PARSE_FAILED, writes EVAL_ERROR status', () => {
  const { exported, sandbox } = load(['onFinalizeWarmUpScoreExecute']);
  const { ledgerSs, wq } = setUp(sandbox);

  const event = makeStudioEvent({
    ledgerSsId: ledgerSs.getId(), queueId: 'Q1', fileId: 'doesnt-matter',
    wordCountScore: '1', extraCredit: '0', geminiEvalOutput: 'not json',
  });
  const result = exported.onFinalizeWarmUpScoreExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'GEMINI_JSON_PARSE_FAILED');
  assert.equal(result.variables.registryUpdateStatus.stringValues[0], 'SKIPPED');
  assert.equal(wq.getRange(2, 1, 1, 21).getValues()[0][8], 'EVAL_ERROR');
});

test('onFinalizeWarmUpScoreExecute: missing WarmUpRegistry row is non-blocking -- WarmUpQueue write and doc feedback still succeed', () => {
  const { exported, sandbox } = load(['onFinalizeWarmUpScoreExecute']);
  const { ledgerSs, wq } = setUp(sandbox, { withRegistryRow: false });
  const doc = makeDoc(sandbox);

  const event = makeStudioEvent({
    ledgerSsId: ledgerSs.getId(), queueId: 'Q1', fileId: doc.getId(),
    wordCountScore: '1', extraCredit: '0',
    geminiEvalOutput: JSON.stringify({ grammar: 1, engagement: 1, feedback: 'fine' }),
  });
  const result = exported.onFinalizeWarmUpScoreExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS');
  assert.equal(result.variables.registryUpdateStatus.stringValues[0], 'REGISTRY_ROW_NOT_FOUND');
  assert.equal(wq.getRange(2, 1, 1, 21).getValues()[0][8], 'SCORED');
});

test('onFinalizeWarmUpScoreExecute: a doc feedback write failure is non-blocking -- reports SUCCESS_DOC_FEEDBACK_WRITE_FAILED, still SCORED', () => {
  const { exported, sandbox } = load(['onFinalizeWarmUpScoreExecute']);
  const { ledgerSs, wq } = setUp(sandbox);

  const event = makeStudioEvent({
    ledgerSsId: ledgerSs.getId(), queueId: 'Q1', fileId: 'no-such-doc-id',
    wordCountScore: '1', extraCredit: '0',
    geminiEvalOutput: JSON.stringify({ grammar: 1, engagement: 1, feedback: 'fine' }),
  });
  const result = exported.onFinalizeWarmUpScoreExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'SUCCESS_DOC_FEEDBACK_WRITE_FAILED');
  assert.equal(wq.getRange(2, 1, 1, 21).getValues()[0][8], 'SCORED');
});

test('onFinalizeWarmUpScoreExecute: no matching WarmUpQueue row -> QUEUE_ROW_NOT_FOUND, registry update skipped', () => {
  const { exported, sandbox } = load(['onFinalizeWarmUpScoreExecute']);
  const { ledgerSs } = setUp(sandbox);
  const event = makeStudioEvent({
    ledgerSsId: ledgerSs.getId(), queueId: 'does-not-exist', fileId: 'x',
    wordCountScore: '1', extraCredit: '0',
    geminiEvalOutput: JSON.stringify({ grammar: 1, engagement: 1, feedback: 'fine' }),
  });
  const result = exported.onFinalizeWarmUpScoreExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'QUEUE_ROW_NOT_FOUND');
  assert.equal(result.variables.registryUpdateStatus.stringValues[0], 'SKIPPED');
});

test('onFinalizeWarmUpScoreExecute: an unmapped required input never throws uncaught (fails closed)', () => {
  const { exported, sandbox } = load(['onFinalizeWarmUpScoreExecute']);
  const { ledgerSs } = setUp(sandbox);
  const event = makeStudioEvent({
    ledgerSsId: ledgerSs.getId(), queueId: 'Q1', fileId: 'x',
    wordCountScore: '1', extraCredit: '0', geminiEvalOutput: null,
  });
  const result = exported.onFinalizeWarmUpScoreExecute(event);
  assert.equal(result.variables.writeStatus.stringValues[0], 'GEMINI_JSON_PARSE_FAILED');
});
