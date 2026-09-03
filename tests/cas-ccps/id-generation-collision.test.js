'use strict';
// Regression tests for generateQueueId_() (24_WarmUpBridge.js) and
// generateLessonId_() (22_LessonContextHandler.js).
//
// FIXES A REAL BUG: both used to build their random suffix with
// Math.floor(Math.random() * 0xffff) — only 65,536 possible values per
// day, with no uniqueness check against existing rows. 25_WarmUpWriter.js
// uses generateQueueId_()'s output as a lookup-map key
// (queueRowByQueueId[qId] = rowNum) — a same-day collision would silently
// point that lookup at the wrong row, misattributing one student's scores
// to another's. Both now use the Utilities.getUuid()-derived pattern
// 15c_Flow2DirectEvaluationService.js's _generateEvidenceId_() already
// established.
//
// Loaded together — same cas-ccps:central-ledger GAS project (see
// tools/gas-lint/project-map.json) — matching warmup-bridge.test.js's own
// loading rationale.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const PATHS = [
  path.join(SCRIPTS, '00_SharedConfig.js'),
  path.join(SCRIPTS, '22_LessonContextHandler.js'),
  path.join(SCRIPTS, '24_WarmUpBridge.js'),
];

function load() {
  return loadGasFiles(PATHS, ['generateQueueId_', 'generateLessonId_']);
}

// Kept intentionally well under the 6-hex space (16^6 ≈ 16.8M): a genuinely
// uniform random sample this size still exercises the fix meaningfully
// (format regex on every draw; a revert to the old 4-hex/65536-value space
// fails the format assertion immediately, not on a chance duplicate), while
// keeping this test's own birthday-paradox false-positive rate negligible
// (~0.07% at n=150, vs. ~11% it would have been at a naively "thorough"
// n=2000 against this same space — a real flake this test hit once during
// its own development, not a fix bug).
const SAMPLE_SIZE = 150;

test('generateQueueId_() produces WUQ-YYYYMMDD-{6hex} with no duplicates at scale', () => {
  const { exported } = load();
  const ids = new Set();
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const id = exported.generateQueueId_();
    assert.match(id, /^WUQ-\d{8}-[0-9A-F]{6}$/, 'must match the 6-hex format');
    ids.add(id);
  }
  assert.equal(ids.size, SAMPLE_SIZE,
    `expected ${SAMPLE_SIZE} unique IDs — a collision here means the fix regressed`);
});

test('generateLessonId_() produces LES-YYYYMMDD-{6hex} with no duplicates at scale', () => {
  const { exported } = load();
  const ids = new Set();
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const id = exported.generateLessonId_();
    assert.match(id, /^LES-\d{8}-[0-9A-F]{6}$/, 'must match the 6-hex format');
    ids.add(id);
  }
  assert.equal(ids.size, SAMPLE_SIZE,
    `expected ${SAMPLE_SIZE} unique IDs — a collision here means the fix regressed`);
});
