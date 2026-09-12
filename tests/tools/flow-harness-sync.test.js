'use strict';
// Regression tests for tools/flow-harness-sync/sync-plausibility-phrases.js
// — the generator that materializes shared/flow-harness/plausibility-phrases.json
// into cas-ccps/scripts/37_FlowInputBuilder.js, leader-hub/EmailBridge.gs, and
// kos-personal/12_StudioReturnHarvest.gs. gas-lint's Check L
// (checkPlausibilityGateDrift) is a thin wrapper around this file's
// computeUpdates() — see tests/tools/gas-lint-gcp.test.js's own header for
// why a repo-walking check is tested through its pure unit rather than
// directly: a test against the check itself would fail whenever any of the
// three systems legitimately changed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  computeUpdates, TARGETS, SPEC_PATH,
  quoteJs, wrapLines, renderPhraseArray, renderStopwordObject, renderMaxCandidates, replaceConstant,
} = require('../../tools/flow-harness-sync/sync-plausibility-phrases.js');

// ── The drift guard — mirrors tests/cas-ccps/flow-prompts.test.js's role ────

test('all three real consumers currently match the canonical source (no drift)', () => {
  const updates = computeUpdates();
  const changed = updates.filter((u) => u.changed);
  assert.deepEqual(changed.map((u) => u.file), [],
    'run `node tools/flow-harness-sync/sync-plausibility-phrases.js` to fix');
});

test('computeUpdates() covers exactly the three known consumers', () => {
  const updates = computeUpdates();
  assert.equal(updates.length, 3);
  assert.deepEqual(
    updates.map((u) => path.basename(u.file)).sort(),
    ['12_StudioReturnHarvest.gs', '37_FlowInputBuilder.js', 'EmailBridge.gs'],
  );
});

test('the canonical source has no duplicate phrases or stopwords', () => {
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  assert.equal(new Set(spec.nonAccessPhrases).size, spec.nonAccessPhrases.length);
  assert.equal(new Set(spec.stopwords).size, spec.stopwords.length);
});

test('no canonical phrase is a strict substring of another (redundant entries were pruned)', () => {
  // A shorter listed phrase already catches every occurrence of a longer
  // phrase that contains it — keeping both is pure redundancy, which the
  // consolidation deliberately pruned (e.g. cas-ccps's old "no access to
  // the document" dropped once leader-hub's shorter "no access to" was
  // unioned in). This guards against that redundancy creeping back in.
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  spec.nonAccessPhrases.forEach((p) => {
    const subsumedBy = spec.nonAccessPhrases.filter((q) => q !== p && q.length < p.length && p.indexOf(q) !== -1);
    assert.deepEqual(subsumedBy, [], `"${p}" is redundant — already caught by ${JSON.stringify(subsumedBy)}`);
  });
});

// ── Rendering primitives ─────────────────────────────────────────────────────

test('quoteJs: single-quotes by default, double-quotes only when the string itself contains an apostrophe', () => {
  assert.equal(quoteJs('cannot access'), "'cannot access'");
  assert.equal(quoteJs("don't have access"), '"don\'t have access"');
});

test('wrapLines: wraps at the given items-per-line, trailing comma on every line', () => {
  const out = wrapLines(['a', 'b', 'c', 'd', 'e'], 2, '  ');
  assert.equal(out, '  a, b,\n  c, d,\n  e,');
});

test('renderStopwordObject: sorted alphabetically regardless of input order', () => {
  const out = renderStopwordObject('X_STOPWORDS', ['zebra', 'apple']);
  assert.match(out, /apple: 1, zebra: 1,/, 'apple must be rendered before zebra');
});

test('renderMaxCandidates: a bare number literal', () => {
  assert.equal(renderMaxCandidates('X_MAX', 40), 'const X_MAX = 40;');
});

// ── replaceConstant() — the actual drift-detection/regeneration mechanism ──

function withTempFile(content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-harness-sync-test-'));
  const file = path.join(dir, 'scratch.js');
  fs.writeFileSync(file, content, 'utf8');
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('replaceConstant: replaces an array literal in place, leaving the rest of the file untouched', () => {
  const src = 'const BEFORE = 1;\nconst TARGET = [\n  \'old\',\n];\nconst AFTER = 2;\n';
  const updated = replaceConstant(src, 'TARGET', renderPhraseArray('TARGET', ['new phrase']));
  assert.match(updated, /const BEFORE = 1;/);
  assert.match(updated, /const AFTER = 2;/);
  assert.match(updated, /'new phrase'/);
  assert.doesNotMatch(updated, /'old'/);
});

test('replaceConstant: replaces an object literal (stopword shape) in place', () => {
  const src = 'const STOP = {\n  old: 1,\n};\n';
  const updated = replaceConstant(src, 'STOP', renderStopwordObject('STOP', ['zebra']));
  assert.match(updated, /zebra: 1/);
  assert.doesNotMatch(updated, /old: 1/);
});

test('replaceConstant: replaces a bare number literal (max-candidates shape) in place', () => {
  const src = 'const MAX = 20;\n';
  const updated = replaceConstant(src, 'MAX', renderMaxCandidates('MAX', 40));
  assert.equal(updated, 'const MAX = 40;\n');
});

test('replaceConstant: throws a clear error when the named constant does not exist yet', () => {
  assert.throws(
    () => replaceConstant('const OTHER = 1;', 'MISSING', 'const MISSING = 2;'),
    /could not find "const MISSING = ..." to replace/,
  );
});

test('a synthetic drift is detected and correctly repaired, without touching an unrelated file', () => {
  const drifted = "const KEEP_ME = 'unrelated';\n" +
    "const FI_NON_ACCESS_PHRASES = [\n  'deliberately-stale-entry',\n];\n" +
    "const FI_PLAUSIBILITY_STOPWORDS = {\n  stale: 1,\n};\n" +
    "const FI_PLAUSIBILITY_MAX_CANDIDATES = 999;\n";

  withTempFile(drifted, (file) => {
    const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
    let after = drifted;
    after = replaceConstant(after, 'FI_NON_ACCESS_PHRASES',
      renderPhraseArray('FI_NON_ACCESS_PHRASES', spec.nonAccessPhrases));
    after = replaceConstant(after, 'FI_PLAUSIBILITY_STOPWORDS',
      renderStopwordObject('FI_PLAUSIBILITY_STOPWORDS', spec.stopwords));
    after = replaceConstant(after, 'FI_PLAUSIBILITY_MAX_CANDIDATES',
      renderMaxCandidates('FI_PLAUSIBILITY_MAX_CANDIDATES', spec.maxCandidates));

    assert.match(after, /const KEEP_ME = 'unrelated';/, 'unrelated content must survive untouched');
    assert.doesNotMatch(after, /deliberately-stale-entry/);
    assert.doesNotMatch(after, /stale: 1/);
    assert.doesNotMatch(after, /999/);
    spec.nonAccessPhrases.forEach((p) => assert.ok(after.indexOf(p) !== -1, `missing phrase: ${p}`));
  });
});
