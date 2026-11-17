'use strict';
// runInference() (src/inference.js) for VECTOR_CLASSIFY jobs, and the
// Curator's vector_weights.
//
// VECTOR_CLASSIFY jobs used to get the Curator prompt and schema. GAS's
// _processVectorClassifyPart_() only accepts a top-level array of
// exchanges, so every managed-service classification failed at intake and
// no session got a VECTOR_MATRIX row. And the Curator prompt asked for
// numeric session-level vector_weights, which CURATOR_PROMPT.md Rule 1
// forbids: GAS writes a VECTOR_MATRIX row for any payload that has them.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-test-not-used';

const Anthropic = require('@anthropic-ai/sdk');
const inference = require(path.join(__dirname, '..', 'src', 'inference.js'));
const { VECTOR_CLASSIFY_SYSTEM_PROMPT } = require(path.join(__dirname, '..', 'src', 'flow-prompts.js'));

const MessagesProto = Object.getPrototypeOf(new Anthropic({ apiKey: 'x' }).messages);

// Replaces messages.create for one call and records the request.
async function runWith(reply, params) {
  const calls = [];
  const orig = MessagesProto.create;
  MessagesProto.create = async function (req) {
    calls.push(req);
    return Object.assign({ usage: { input_tokens: 10, output_tokens: 20 }, stop_reason: 'end_turn' }, reply);
  };
  try {
    const result = await inference.runInference(Object.assign({
      sessionText: 'We decided the script must never run if an API changes the status.',
      payloadUid: 'LOG-abc_VC01of01',
      operatorMeta: {},
      driveContext: {},
    }, params));
    return { result, calls };
  } finally {
    MessagesProto.create = orig;
  }
}

function text(obj) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] };
}

function vectors(overrides) {
  const v = {};
  inference.KNOWN_VECTORS.forEach((k) => { v[k] = 0; });
  return Object.assign(v, overrides);
}

const CLASSIFICATION = [{
  exchange_type: 'DECISION',
  sentences: [{ sentence_id: 1, vectors: vectors({ SECURITY: 0.8, GAS_DEVELOPMENT: 0.6 }), unmapped_signals: [] }],
}];

test('a VECTOR_CLASSIFY job is sent the classifier prompt, not the Curator one', async () => {
  const { calls } = await runWith(text(CLASSIFICATION), { payloadType: 'VECTOR_CLASSIFY' });
  assert.equal(calls[0].system, VECTOR_CLASSIFY_SYSTEM_PROMPT);
  assert.match(calls[0].messages[0].content, /^Payload to Analyze:\n/);
  assert.doesNotMatch(calls[0].system, /KOS inference engine/);
  assert.ok(calls[0].max_tokens >= 16000, 'room for a full part: ' + calls[0].max_tokens);
});

test('a VECTOR_CLASSIFY job returns the exchange array GAS expects, unchanged', async () => {
  const { result } = await runWith(text(CLASSIFICATION), { payloadType: 'VECTOR_CLASSIFY' });
  assert.ok(Array.isArray(result.output));
  assert.deepEqual(JSON.parse(result.outputString), CLASSIFICATION);
});

test('a classification missing a known vector, or not an array, fails validation', async () => {
  const missing = [{ exchange_type: 'DECISION',
    sentences: [{ sentence_id: 1, vectors: { SECURITY: 0.8 }, unmapped_signals: [] }] }];
  await assert.rejects(runWith(text(missing), { payloadType: 'VECTOR_CLASSIFY' }), /schema validation failed/);
  await assert.rejects(runWith(text({ session_uid: 'x' }), { payloadType: 'VECTOR_CLASSIFY' }), /schema validation failed/);
});

test('the schema requires exactly the prompt\'s known vectors', () => {
  assert.deepEqual(inference.KNOWN_VECTORS, inference.parseKnownVectors(VECTOR_CLASSIFY_SYSTEM_PROMPT));
  assert.ok(inference.KNOWN_VECTORS.includes('DOMAIN_COMPLIANCE'));
  assert.throws(() => inference.parseKnownVectors('no list here'), /no known-vectors list/);
});

test('output cut off at max_tokens is reported as that, not as bad JSON', async () => {
  await assert.rejects(
    runWith(Object.assign(text('[{"exchange_type":"DECI'), { stop_reason: 'max_tokens' }), { payloadType: 'VECTOR_CLASSIFY' }),
    /cut off at max_tokens/);
});

const CURATOR = {
  session_summary: 'The operator locked the status-change rule.',
  dynamic_state: { next_steps: [], deferred_decisions: [], pivots_and_lessons: [] },
  alignment_report: { relational_status_at_closeout: 'GREEN' },
};

test('the Curator prompt asks for vector_weights: null, and null is what GAS gets', async () => {
  const { result, calls } = await runWith(
    text(Object.assign({ vector_weights: { ARCHITECTURE: 0.9, UI: 0, SECURITY: 0, PEDAGOGY: 0, GAS_DEVELOPMENT: 0, RELATIONAL: 0 } }, CURATOR)),
    { payloadType: 'SESSION_LOG', payloadUid: 'LOG-abc_CH01' });
  assert.match(calls[0].system, /vector_weights: always null/);
  assert.equal(calls[0].max_tokens, 4096);
  assert.equal(result.output.vector_weights, null);
  assert.equal(result.output.session_uid, 'LOG-abc_CH01');
});

test('a Curator output that follows Rule 1 passes validation', async () => {
  const { result } = await runWith(text(Object.assign({ vector_weights: null }, CURATOR)),
    { payloadType: 'SESSION_LOG' });
  assert.equal(result.output.vector_weights, null);
});

test('VECTOR_CLASSIFY has its own credit price setting', () => {
  const prev = process.env.CREDITS_VECTOR_CLASSIFY;
  process.env.CREDITS_VECTOR_CLASSIFY = '3';
  try {
    assert.equal(inference.getCreditCost('VECTOR_CLASSIFY'), 3);
  } finally {
    if (prev === undefined) delete process.env.CREDITS_VECTOR_CLASSIFY; else process.env.CREDITS_VECTOR_CLASSIFY = prev;
  }
  assert.equal(inference.getCreditCost('VECTOR_CLASSIFY'), 5, 'same default as before');
});
