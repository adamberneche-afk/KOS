'use strict';
// Regression tests for gas-lint's Check N — the bounded-loop convention.
// A `while (x.hasNext())` loop over a Drive/Docs/Sheets iterator should
// reference both a cap and a pacing call; this is warning-level, not
// error-level (see check.js's Check N comment for why: real production
// loops already exist with neither, and this is a new convention being
// introduced, not a retrofit).
//
// extractWhileLoopBody() and the two pattern regexes are the pure units —
// the check itself walks the whole repo via PROJECT_MAP.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractWhileLoopBody,
  HASNEXT_WHILE_RE,
  LOOP_CAP_RE,
  LOOP_PACING_RE,
  stripCommentsAndStrings,
} = require('../../tools/gas-lint/check.js');

// Runs the same two-step match-then-extract the real check does, for one
// `while (...hasNext())` loop in `src`, and returns { hasCap, hasPacing }
// (or null if no such loop is found).
function evaluate(src) {
  const stripped = stripCommentsAndStrings(src);
  HASNEXT_WHILE_RE.lastIndex = 0;
  const m = HASNEXT_WHILE_RE.exec(stripped);
  if (!m) return null;
  const body = extractWhileLoopBody(stripped, HASNEXT_WHILE_RE.lastIndex);
  assert.ok(body, 'expected a matched loop body');
  return { hasCap: LOOP_CAP_RE.test(body), hasPacing: LOOP_PACING_RE.test(body) };
}

// afterCond must be computed the same way the real check does — the index
// right after HASNEXT_WHILE_RE's full match (both closing parens), not by
// hand: a naive `indexOf(')')` search from "hasNext" finds hasNext()'s OWN
// closing paren, one paren too early.
function afterCondIndex(stripped) {
  HASNEXT_WHILE_RE.lastIndex = 0;
  const m = HASNEXT_WHILE_RE.exec(stripped);
  assert.ok(m, 'expected HASNEXT_WHILE_RE to match');
  return HASNEXT_WHILE_RE.lastIndex;
}

test('extractWhileLoopBody: braced body, brace-balanced against nested braces', () => {
  const src = 'while (files.hasNext()) { if (x) { y(); } z(); }\nfunction other() {}\n';
  const stripped = stripCommentsAndStrings(src);
  const body = extractWhileLoopBody(stripped, afterCondIndex(stripped));
  assert.ok(body.startsWith('{') && body.trim().endsWith('}'));
  assert.ok(!/function other/.test(body));
});

test('extractWhileLoopBody: braceless single-statement body, stops at the top-level semicolon', () => {
  const src = 'while (it.hasNext()) it.next().setTrashed(true);\nconst after = 1;\n';
  const stripped = stripCommentsAndStrings(src);
  const body = extractWhileLoopBody(stripped, afterCondIndex(stripped));
  assert.equal(body.trim(), 'it.next().setTrashed(true);');
});

test('a loop with neither a cap nor pacing: both missing', () => {
  const r = evaluate('while (files.hasNext()) {\n  const f = files.next();\n  doThing(f);\n}\n');
  assert.deepEqual(r, { hasCap: false, hasPacing: false });
});

test('a loop with a break but no pacing: cap present, pacing missing', () => {
  const r = evaluate('while (files.hasNext()) {\n  if (count > 10) break;\n  count++;\n}\n');
  assert.deepEqual(r, { hasCap: true, hasPacing: false });
});

test('a loop with a MAX_*-named reference but no pacing: cap present, pacing missing', () => {
  const r = evaluate('while (files.hasNext()) {\n  if (scanned >= MAX_FILES_PER_RUN) return;\n  scanned++;\n}\n');
  assert.deepEqual(r, { hasCap: true, hasPacing: false });
});

test('a loop with Utilities.sleep() but no cap: pacing present, cap missing', () => {
  const r = evaluate('while (files.hasNext()) {\n  process_(files.next());\n  Utilities.sleep(50);\n}\n');
  assert.deepEqual(r, { hasCap: false, hasPacing: true });
});

test('a loop with an elapsed-time budget check counts as pacing', () => {
  const r = evaluate('while (files.hasNext()) {\n  if (Date.now() - start > BUDGET_MS) break;\n  process_(files.next());\n}\n');
  assert.deepEqual(r, { hasCap: true, hasPacing: true });
});

test('a loop with both a cap and a pacing call: fully compliant', () => {
  const r = evaluate([
    'while (files.hasNext()) {',
    '  if (scanned >= MAX_FILES_PER_RUN) break;',
    '  process_(files.next());',
    '  scanned++;',
    '  Utilities.sleep(25);',
    '}',
  ].join('\n'));
  assert.deepEqual(r, { hasCap: true, hasPacing: true });
});

test('a `for` loop is not matched at all — this check is hasNext-while-specific', () => {
  const stripped = stripCommentsAndStrings('for (let i = 0; i < 10; i++) { doThing(i); }\n');
  HASNEXT_WHILE_RE.lastIndex = 0;
  assert.equal(HASNEXT_WHILE_RE.exec(stripped), null);
});
