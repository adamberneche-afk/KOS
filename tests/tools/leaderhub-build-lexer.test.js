'use strict';
// Regression coverage for the js-lexer.js / strip-comments.js /
// hoist-declarations.js / split-script.js toolchain build.js relies on to
// safely minify and split leader-hub's giant assembled inline script (see
// leader-hub/HISTORY.md's OAuth-consent-dialog-crash entries for why any
// of this exists). Only verify-strip.js/verify-hoist.js existed as manual
// CLI checks before this file — this wires the same kind of token-stream
// equivalence checking into `npm test` so CI catches a regression here,
// not just a human remembering to run the CLI scripts by hand.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { tokenize } = require('../../tools/leaderhub-build/js-lexer.js');
const { stripCommentsAndWhitespace } = require('../../tools/leaderhub-build/strip-comments.js');
const { hoistTopLevelDeclarations } = require('../../tools/leaderhub-build/hoist-declarations.js');
const { splitScript, findSafeCutPoints } = require('../../tools/leaderhub-build/split-script.js');

function significantTokens(source) {
  return tokenize(source)
    .filter((t) => t.type !== 'comment-line' && t.type !== 'comment-block' && t.type !== 'ws')
    .map((t) => t.text);
}

function nodeCheck(source) {
  const tmp = path.join(os.tmpdir(), `leaderhub-lexer-test-${process.pid}-${Date.now()}-${Math.random()}.js`);
  fs.writeFileSync(tmp, source);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  } finally {
    fs.unlinkSync(tmp);
  }
}

test('js-lexer: reconstructing every token exactly reproduces the source', () => {
  const src = 'function f(a, b) {\n  return a + b; // sum\n}\nconst x = `hi ${f(1, 2)}`;\n';
  const toks = tokenize(src);
  assert.equal(toks.map((t) => t.text).join(''), src);
});

test('js-lexer: a template with two ${...} expressions and a division right after a space does not run away', () => {
  // Regression test for a real bug: inside a template's ${...} expression,
  // whitespace was falling through to the tokenizer's generic default
  // branch, which incorrectly reset "is a `/` a regex or division"
  // tracking back to "regex allowed" on ANY non-)/] character including
  // plain whitespace. `a / 1000` -- division, with a space before the
  // `/` -- then had its `/` misread as the start of a regex literal, and
  // the runaway regex scan consumed everything up to the next literal
  // `/` in the source (or EOF), silently swallowing the rest of the
  // template, its closing backtick, and anything after it into one
  // corrupted token.
  const line = 'if (el) el.textContent = `${a || \'x\'} (${Math.round((Date.now() - start) / 1000)}s)`;NEXT';
  const toks = tokenize(line);
  const tmpl = toks.find((t) => t.type === 'template');
  assert.ok(tmpl, 'expected a template token');
  assert.equal(tmpl.text, '`${a || \'x\'} (${Math.round((Date.now() - start) / 1000)}s)`');
  const next = toks.find((t) => t.text === 'NEXT');
  assert.ok(next, 'text after the template must still be tokenized, not swallowed into the template');
});

test('js-lexer: three-levels-deep nested templates are each tokenized as one balanced template', () => {
  const src = '`${cond ? `${items.map(x => `${x}`).join(",")}` : "none"}`';
  const toks = tokenize(src);
  assert.equal(toks.length, 1);
  assert.equal(toks[0].type, 'template');
  assert.equal(toks[0].text, src);
});

test('strip-comments + js-lexer: stripping is a no-op on significant tokens (comments/whitespace only removed)', () => {
  const src = [
    'function f(a, b) {',
    '  // adds two numbers',
    '  return a + b; /* inline */',
    '}',
    'const msg = `${f(1, 2)} (${Math.round((Date.now() - 0) / 1000)}s)`;',
    '',
  ].join('\n');
  const stripped = stripCommentsAndWhitespace(stripCommentsAndWhitespace(src));
  assert.deepEqual(significantTokens(stripped), significantTokens(src));
  assert.ok(nodeCheck(stripped), 'stripped output must still be valid standalone JS');
});

test('hoist-declarations: converts a true top-level let/const to var', () => {
  const src = 'let HORIZON = 5;\nconst _bragTab = null;\n';
  const out = hoistTopLevelDeclarations(src);
  assert.equal(out, 'var HORIZON = 5;\nvar _bragTab = null;\n');
});

test('hoist-declarations: leaves a for-loop\'s own let alone (nested inside the for-head\'s parens)', () => {
  const src = 'for (let i = 0; i < 10; i++) { sum += i; }';
  const out = hoistTopLevelDeclarations(src);
  assert.equal(out, src);
});

test('hoist-declarations: leaves a function-scoped let/const alone', () => {
  const src = 'function f() {\n  let x = 1;\n  const y = 2;\n  return x + y;\n}';
  const out = hoistTopLevelDeclarations(src);
  assert.equal(out, src);
});

test('hoist-declarations: leaves `.let(...)`/`.const(...)` method calls alone', () => {
  const src = 'obj.let(5);\nobj.const(6);';
  const out = hoistTopLevelDeclarations(src);
  assert.equal(out, src);
});

test('hoist-declarations: leaves an object key named let/const alone', () => {
  const src = 'var obj = { let: 5, const: 6 };';
  const out = hoistTopLevelDeclarations(src);
  assert.equal(out, src);
});

test('hoist-declarations: token stream is identical to the original except let/const -> var', () => {
  const src = [
    'let HORIZON = 5;',
    'function f() {',
    '  let x = 1;',
    '  for (let i = 0; i < x; i++) {}',
    '}',
    'const g = () => { const y = 2; return y; };',
    'obj.let(1);',
    'var o = { let: 1, const: 2 };',
  ].join('\n');
  const out = hoistTopLevelDeclarations(src);
  const origToks = significantTokens(src);
  const outToks = significantTokens(out);
  assert.equal(origToks.length, outToks.length);
  for (let i = 0; i < origToks.length; i++) {
    if (origToks[i] === outToks[i]) continue;
    assert.ok(
      (origToks[i] === 'let' || origToks[i] === 'const') && outToks[i] === 'var',
      `unexpected mismatch at token ${i}: ${origToks[i]} -> ${outToks[i]}`,
    );
  }
  assert.ok(nodeCheck(out), 'hoisted output must still be valid standalone JS');
});

test('split-script: chunks concatenate back to the exact original source', () => {
  const statements = [];
  for (let i = 0; i < 200; i++) {
    statements.push(`function f${i}() { return ${i} + (${i} * 2); }`);
  }
  const src = statements.join('\n') + '\n';
  const chunks = splitScript(src, 500);
  assert.equal(chunks.join(''), src);
  assert.ok(chunks.length > 1, 'expected the source to actually be split given the small target size');
});

test('split-script: every chunk is independently valid standalone JS', () => {
  const statements = [];
  for (let i = 0; i < 200; i++) {
    statements.push(`var v${i} = ${i};`);
    statements.push(`function f${i}() { return v${i} * 2; }`);
  }
  const src = statements.join('\n') + '\n';
  const chunks = splitScript(src, 800);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(nodeCheck(chunk), `chunk failed node --check:\n${chunk}`);
  }
});

test('split-script: a source at or under the target size is returned as a single chunk', () => {
  const src = 'var x = 1;\nvar y = 2;\n';
  const chunks = splitScript(src, 10000);
  assert.deepEqual(chunks, [src]);
});

test('split-script: never cuts inside an expression (depth-0 gap between operator and operand is not a valid cut point)', () => {
  // A naive "cut at any bracket-depth-0 gap" approach would be tempted to
  // cut between `a` and `+` below -- both at depth 0 -- which would
  // silently change what the code does (two statements that each parse
  // fine alone, but no longer compute the original sum) rather than fail
  // loudly. findSafeCutPoints must never offer that gap.
  const src = 'var total = a\n  + b\n  + c;\nvar next = 1;';
  const cuts = findSafeCutPoints(src);
  const midExpressionGap = src.indexOf('+ b');
  assert.ok(!cuts.includes(midExpressionGap), 'must not offer a cut point in the middle of an expression');
});
