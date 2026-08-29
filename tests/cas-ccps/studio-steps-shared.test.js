'use strict';
// Regression tests for cas-ccps/studio-steps/StepsShared.gs — the safe
// input reader (inStr_) and fence-stripping helper (stripJsonFence_)
// every step in this project relies on. These two functions are what
// make the "fails closed" claim in every step's own header actually
// true (see StepsShared.gs's own header on inStr_ for the full story:
// before this helper existed, an unmapped Studio input threw a raw
// TypeError before any status could be returned).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH], exposeNames);
}

// ── inStr_ ───────────────────────────────────────────────────────────────

test('inStr_: reads a mapped STRING input\'s first stringValues entry', () => {
  const { exported } = load(['inStr_']);
  const inputs = { foo: { stringValues: ['bar'] } };
  assert.equal(exported.inStr_(inputs, 'foo'), 'bar');
});

test('inStr_: an unmapped field (key absent entirely) returns "" by default', () => {
  const { exported } = load(['inStr_']);
  assert.equal(exported.inStr_({}, 'foo'), '');
});

test('inStr_: an unmapped field returns the given default when one is passed', () => {
  const { exported } = load(['inStr_']);
  assert.equal(exported.inStr_({}, 'foo', 'fallback'), 'fallback');
});

test('inStr_: a mapped field with an empty stringValues array falls back too (never throws)', () => {
  const { exported } = load(['inStr_']);
  const inputs = { foo: { stringValues: [] } };
  assert.equal(exported.inStr_(inputs, 'foo'), '');
});

test('inStr_: never throws even when inputs itself is null/undefined', () => {
  const { exported } = load(['inStr_']);
  assert.equal(exported.inStr_(null, 'foo'), '');
  assert.equal(exported.inStr_(undefined, 'foo'), '');
});

// ── stripJsonFence_ ──────────────────────────────────────────────────────

test('stripJsonFence_: strips a ```json ... ``` fence, leaving valid JSON', () => {
  const { exported } = load(['stripJsonFence_']);
  const fenced = '```json\n{"a":1}\n```';
  assert.equal(exported.stripJsonFence_(fenced), '{"a":1}');
  assert.deepEqual(JSON.parse(exported.stripJsonFence_(fenced)), { a: 1 });
});

test('stripJsonFence_: a bare ``` fence (no "json" language tag) is stripped too', () => {
  const { exported } = load(['stripJsonFence_']);
  assert.equal(exported.stripJsonFence_('```\n{"a":1}\n```'), '{"a":1}');
});

test('stripJsonFence_: plain unfenced JSON passes through unchanged (aside from trimming)', () => {
  const { exported } = load(['stripJsonFence_']);
  assert.equal(exported.stripJsonFence_('  {"a":1}  '), '{"a":1}');
});
