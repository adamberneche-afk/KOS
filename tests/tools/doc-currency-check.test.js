'use strict';
// Regression tests for tools/doc-currency/check.js.
//
// Both bugs pinned here are ones the tool actually shipped with on its first
// real run against this repo, not hypotheticals:
//
//   1. A hand-rolled comment/string stripper that had no regex-literal
//      handling. The first `/IDENTITY_KEY\s*[:=]\s*['"].+['"]/` in
//      5_Error_And_Utilities.gs read as an opening quote and desynced every
//      line after it, so half that file's functions "didn't exist" and the
//      tool reported 82 missing functions, nearly all of which are real.
//      Fixed by reusing gas-lint's stripper instead of maintaining a second,
//      weaker one — which is exactly the drift these tests exist to catch if
//      someone re-inlines it later.
//
//   2. A ±6-line window for historical-framing markers. USER_GUIDE.md's
//      "The deploy function only creates what doesn't exist" sat three lines
//      from an unrelated paragraph and silently suppressed a genuine finding,
//      because "doesn't exist" is ordinary English before it is a marker.
//      Fixed by scoping to the enclosing paragraph.
//
// The checks themselves aren't tested directly: they read the whole repo, so
// a test against them would fail every time a doc legitimately changed. The
// pure functions below are where both bugs lived.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  declaredNamesFromSource,
  paragraphAround,
  docLevelStatus,
  normalizeBlockquotes,
  DOC_TOKEN_RE,
} = require('../../tools/doc-currency/check.js');

// ── declaredNamesFromSource ────────────────────────────────────────────

test('finds a plain top-level function declaration', () => {
  const names = declaredNamesFromSource('function doThing() {\n  return 1;\n}\n');
  assert.ok(names.has('doThing'));
});

test('finds an async function declaration', () => {
  // gas-lint's own DECL_RE deliberately doesn't match these; leader-hub's
  // browser code is full of them (`async function callGAS(...)`), and a doc
  // naming one is making a true claim.
  const names = declaredNamesFromSource('async function callGAS(action) {\n}\n');
  assert.ok(names.has('callGAS'));
});

test('finds a function nested inside another function', () => {
  // Unlike gas-lint's Check A, this tool only asks "does this name exist in
  // the source at all" — brace depth is irrelevant to that question.
  const src = 'function outer() {\n  function inner() {}\n  return inner;\n}\n';
  const names = declaredNamesFromSource(src);
  assert.ok(names.has('outer'));
  assert.ok(names.has('inner'));
});

test('finds an object-literal method and a name: function member', () => {
  const src = 'const api = {\n  getThing() { return 1; },\n  setThing: function (v) {},\n};\n';
  const names = declaredNamesFromSource(src);
  assert.ok(names.has('getThing'));
  assert.ok(names.has('setThing'));
});

test('a regex literal containing quote characters does not hide later declarations', () => {
  // THE bug. A stripper without regex-literal handling treats the `'` inside
  // the character class as an opening string quote and swallows the rest of
  // the file — which is how a function declared 20 lines below a validation
  // pattern came to be reported as missing.
  const src = [
    'const patterns = [',
    "  { re: /IDENTITY_KEY\\s*[:=]\\s*['\"].+['\"]/,  label: 'Exposed key' },",
    "  { re: /SALT\\s*[:=]\\s*['\"].+['\"]/i,         label: 'Exposed salt' },",
    '];',
    '',
    'function _getCalibrationStatus() {',
    '  return { armed: true };',
    '}',
  ].join('\n');
  const names = declaredNamesFromSource(src);
  assert.ok(names.has('_getCalibrationStatus'),
    'a declaration after a regex literal containing quotes must still be found');
});

test('a function name that only appears inside a string is not treated as declared', () => {
  const src = "console.log('function ghostFunction() {}');\n";
  assert.ok(!declaredNamesFromSource(src).has('ghostFunction'));
});

test('a function name that only appears in a comment is not treated as declared', () => {
  // This is the shape of the real leader-hub case: a comment listing
  // renderTasks/resolveTask/pauseTask as the functions that were REMOVED.
  // Reading those as declarations would make the tool bless the stale docs
  // that still tell a reader to call them.
  const src = '// (renderTasks/addTask/resolveTask — removed with the seed data)\n';
  const names = declaredNamesFromSource(src);
  assert.ok(!names.has('renderTasks'));
  assert.ok(!names.has('resolveTask'));
});

// ── paragraphAround ────────────────────────────────────────────────────

test('paragraphAround returns only the blank-line-delimited block containing the line', () => {
  const lines = [
    'The deploy function only creates what doesn\'t exist.',  // 1
    'It will not overwrite your documents.',                  // 2
    '',                                                       // 3
    'Run `triggerCouncilSimulation()` before each council.',  // 4
  ];
  const para = paragraphAround(lines, 4);
  assert.ok(para.includes('triggerCouncilSimulation'));
  assert.ok(!para.includes("doesn't exist"),
    'incidental prose in a neighbouring paragraph must not leak into the marker check');
});

test('paragraphAround keeps a multi-line explanation together', () => {
  // This repo's actual convention: the removal note and the function name
  // are in one block, so scoping to the paragraph must not split them.
  const lines = [
    'Intro paragraph.',
    '',
    'The shared-context generator `triggerCouncilSimulation()` was',
    '**deleted** in Round 14 — it violated BRIDGE_FIDELITY_001 by letting',
    'one flow role-play every persona at once.',
    '',
    'Later text.',
  ];
  const para = paragraphAround(lines, 3);
  assert.ok(para.includes('triggerCouncilSimulation'));
  assert.ok(para.includes('deleted'));
  assert.ok(!para.includes('Later text'));
});

test('paragraphAround handles a line at the very start and very end', () => {
  const lines = ['only line'];
  assert.equal(paragraphAround(lines, 1), 'only line');
});

// ── docLevelStatus ─────────────────────────────────────────────────────

test('a file-level SUPERSEDED banner marks the whole document historical', () => {
  // LEADERHUB_README.md's own banner says callAI() "neither exists in the
  // code anymore". Without this the tool reports that finding back at the
  // document that already states it, twenty times over.
  const raw = '# LeaderHub README\n\n> **⚠ SUPERSEDED — kept for historical reference only.**\n\nUse `callAI()` to reach Gemini.\n';
  assert.equal(docLevelStatus('leader-hub/LEADERHUB_README.md', raw), 'superseded');
});

test('a banner appearing far below the top of the file does not exempt the document', () => {
  // A banner earns its exemption by being where a reader will see it first.
  const raw = '# Doc\n'.concat('filler\n'.repeat(60), '> **⚠ SUPERSEDED**\n');
  assert.equal(docLevelStatus('some/doc.md', raw), 'live');
});

test('a doc listed as documenting an out-of-repo Apps Script project reports as external', () => {
  const raw = '# Integration guide\n\nCall `processInbox()` every 10 minutes.\n';
  assert.equal(docLevelStatus('leader-hub/LH_02_INTEGRATION_GUIDE.md', raw), 'external');
});

test('an ordinary doc with no banner reports as live', () => {
  assert.equal(docLevelStatus('kos-personal/USER_GUIDE.md', '# User Guide\n\nText.\n'), 'live');
});

// ── DOC_TOKEN_RE ───────────────────────────────────────────────────────

function tokens(raw) {
  const out = [];
  DOC_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = DOC_TOKEN_RE.exec(raw))) out.push(m[1]);
  return out;
}

test('a backticked call with parens is read as a function claim', () => {
  assert.deepEqual(tokens('Run `runPhase0Migration()` first.'), ['runPhase0Migration']);
  assert.deepEqual(tokens('Call `pinThemeToCore(theme, note)` to pin.'), ['pinThemeToCore']);
});

test('a backticked bare word without parens is not a function claim', () => {
  // `COG_STIMULUS` and `Core_Fact` are values and columns, not calls —
  // treating them as function claims is what would make this check unusable.
  assert.deepEqual(tokens('The `COG_STIMULUS` payload type and `Core_Fact` column.'), []);
});

test('unbackticked prose that happens to contain call syntax is ignored', () => {
  assert.deepEqual(tokens('The function someFunction() is described below.'), []);
});

// ── normalizeBlockquotes ─────────────────────────────────────────────────
// The real bug this exists to fix: meta/CODEBASE_REVIEW.md once carried
// "...gas-sandbox.js` — 346\n> passing tests..." — a blockquote line-wrap
// splitting the count from the word "passing" — and checkCitedTestCounts'
// plain \s+ regex could not cross the `>` sitting between the two newlines,
// so a stale count went unreported. This pins the fix directly rather than
// depending on the whole-repo check, which would only ever tell you the
// state of whatever the repo currently says.

test('a count and "passing" split by a blockquote line-wrap become matchable', () => {
  const raw = 'via `tests/harness/gas-sandbox.js` — 346\n> passing tests at the time of writing.';
  const normalized = normalizeBlockquotes(raw);
  assert.match(normalized, /346\s+passing/,
    'the blockquote marker must no longer separate the count from "passing"');
});

test('normalizeBlockquotes preserves the string length, so line numbers stay valid', () => {
  // lineAt() is always called against the ORIGINAL raw text with an index
  // found in the normalized text. That only stays correct if every
  // character up to and including the match keeps the same offset —
  // i.e. the transform never inserts or removes characters.
  const raw = 'line one\n> line two — 346\n> passing tests\nline four';
  assert.equal(normalizeBlockquotes(raw).length, raw.length);
});

test('normalizeBlockquotes only touches a leading ">", not one appearing mid-line', () => {
  // A real comparison operator or quoted-greater-than in prose (e.g. "5 > 3")
  // must not be mistaken for a blockquote marker.
  const raw = 'Scores where 5 > 3 held, on one line.';
  assert.equal(normalizeBlockquotes(raw), raw);
});

test('a blockquote marker at the very start of the file is also normalized', () => {
  const raw = '> 346\n> passing tests, first line of the file.';
  assert.match(normalizeBlockquotes(raw), /346\s+passing/);
});

test('an ordinary single-line count still matches after normalization', () => {
  // The fix must not regress the common case that already worked.
  const raw = 'the suite reports 374 passing tests today.';
  assert.equal(normalizeBlockquotes(raw), raw);
  assert.match(normalizeBlockquotes(raw), /374\s+passing/);
});
