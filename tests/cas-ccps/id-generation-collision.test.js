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

// The suffix is 12 hex characters (16^12 ≈ 2.8e14) since 2026-11-01. At 6,
// this test's own chance of a repeat at n=150 was about 0.07%, and it
// failed by chance on 10-31; the same odds applied to a day's real IDs. At
// 12, n=2000 has about a 1-in-140-million chance of a repeat, so a failure
// here means the ID is no longer random enough, not bad luck. A revert to a
// shorter suffix fails the format check on the first draw.
const SAMPLE_SIZE = 2000;

test('generateQueueId_() produces WUQ-YYYYMMDD-{12hex} with no duplicates at scale', () => {
  const { exported } = load();
  const ids = new Set();
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const id = exported.generateQueueId_();
    assert.match(id, /^WUQ-\d{8}-[0-9A-F]{12}$/, 'must match the 12-hex format');
    ids.add(id);
  }
  assert.equal(ids.size, SAMPLE_SIZE,
    `expected ${SAMPLE_SIZE} unique IDs — a collision here means the fix regressed`);
});

test('generateLessonId_() produces LES-YYYYMMDD-{12hex} with no duplicates at scale', () => {
  const { exported } = load();
  const ids = new Set();
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const id = exported.generateLessonId_();
    assert.match(id, /^LES-\d{8}-[0-9A-F]{12}$/, 'must match the 12-hex format');
    ids.add(id);
  }
  assert.equal(ids.size, SAMPLE_SIZE,
    `expected ${SAMPLE_SIZE} unique IDs — a collision here means the fix regressed`);
});
