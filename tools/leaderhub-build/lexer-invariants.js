'use strict';
/**
 * tools/leaderhub-build/lexer-invariants.js
 * ============================================
 * A standalone sanity pass over js-lexer.js's own token output, checking
 * rules the tokenizer is SUPPOSED to already guarantee -- independent of
 * any before/after comparison (verify-strip.js, verify-hoist.js) against
 * another file tokenized the same way.
 *
 * WHY THIS EXISTS: verify-strip.js and verify-hoist.js tokenize both an
 * original and a transformed file with the SAME js-lexer.js and compare
 * the results. That catches a bug in strip-comments.js/hoist-
 * declarations.js's own transform logic, but NOT a bug in tokenize()
 * itself -- if the tokenizer misclassifies the same input the same way
 * on both sides, the comparison still "passes," self-consistently fooled
 * (see leader-hub/HISTORY.md's follow-up entry: a real js-lexer.js bug,
 * where whitespace before a `/` inside a template's `${...}` expression
 * caused division to be misread as the start of a regex literal, whose
 * runaway scan then silently swallowed the rest of the input, went
 * undetected by verify-strip.js for exactly this reason). This module
 * checks the tokenizer's OWN internal consistency instead: rules that
 * must hold for ANY correctly-tokenized valid JS, regardless of what
 * transform (if any) is being verified.
 *
 * CHECKS:
 *   1. Bracket balance -- {, (, [ and their matching close must never go
 *      negative (an unmatched close) and must end at exactly zero (an
 *      unmatched open) across the whole token stream. A mis-scanned
 *      template or regex that silently swallowed a real `{`/`(`/`[` or
 *      its close is the most common way this goes wrong.
 *   2. No regex token can immediately follow (ignoring whitespace/
 *      comments) a token that only a BINARY operator could legally
 *      follow -- a number, string, template, non-keyword identifier, or
 *      a closing `)`/`]`. A `/` after any of those is always division,
 *      never the start of a regex literal; a `regex`-typed token there
 *      proves the tokenizer misread a division operator, exactly the
 *      bug class this file exists to catch. Mirrors js-lexer.js's own
 *      `regexAllowed` rule, checked against its OWN output after the
 *      fact rather than trusted blindly while scanning.
 */

const { tokenize, KEYWORDS_BEFORE_REGEX } = require('./js-lexer');

const OPENERS = new Set(['{', '(', '[']);
const CLOSERS = new Set(['}', ')', ']']);
const MATCHING_OPENER = { '}': '{', ')': '(', ']': '[' };

function checkBracketBalance(tokens) {
  const violations = [];
  const stack = [];
  let pos = 0;
  for (const t of tokens) {
    if (t.type === 'punct') {
      if (OPENERS.has(t.text)) stack.push({ text: t.text, pos });
      else if (CLOSERS.has(t.text)) {
        const top = stack.pop();
        if (!top || top.text !== MATCHING_OPENER[t.text]) {
          violations.push({
            pos,
            message: `unmatched closing '${t.text}' at char ${pos} (${top ? `expected to close '${top.text}' opened at char ${top.pos}` : 'nothing open'})`,
          });
        }
      }
    }
    pos += t.text.length;
  }
  for (const unclosed of stack) {
    violations.push({ pos: unclosed.pos, message: `unclosed '${unclosed.text}' opened at char ${unclosed.pos}, never closed` });
  }
  return violations;
}

// A `/` can only start a regex literal where a new expression could
// legally begin -- never right after something that already produced a
// value (a completed operand), where a bare `/` can only be division.
function disallowsFollowingRegex(tok) {
  if (!tok) return false;
  if (tok.type === 'number' || tok.type === 'string' || tok.type === 'template') return true;
  if (tok.type === 'ident' && !KEYWORDS_BEFORE_REGEX.has(tok.text)) return true;
  if (tok.type === 'punct' && (tok.text === ')' || tok.text === ']')) return true;
  return false;
}

function checkRegexAfterValue(tokens) {
  const violations = [];
  let lastReal = null;
  let pos = 0;
  for (const t of tokens) {
    if (t.type === 'ws' || t.type === 'comment-line' || t.type === 'comment-block') {
      pos += t.text.length;
      continue;
    }
    if (t.type === 'regex' && disallowsFollowingRegex(lastReal)) {
      violations.push({
        pos,
        message: `regex token at char ${pos} immediately follows ${lastReal.type} ${JSON.stringify(lastReal.text.slice(0, 30))} -- ` +
          `a '/' there can only be division; this tokenizer misread it as a regex literal, and the runaway scan ` +
          `likely swallowed real code up to the next literal '/' or end of input`,
      });
    }
    lastReal = t;
    pos += t.text.length;
  }
  return violations;
}

// Runs every check against `tokens` (as produced by tokenize()), returning
// a flat array of {pos, message} violations -- empty means clean.
function checkLexerInvariants(tokens) {
  return [...checkBracketBalance(tokens), ...checkRegexAfterValue(tokens)];
}

// Convenience: tokenizes `source` and throws a single descriptive Error
// listing every violation if any are found. Callers that just want a
// pass/fail gate (build.js) should use this rather than the lower-level
// checkLexerInvariants().
function assertLexerInvariants(source, label) {
  const tokens = tokenize(source);
  const violations = checkLexerInvariants(tokens);
  if (violations.length) {
    const where = label ? ` in ${label}` : '';
    const details = violations.map((v) => `  - ${v.message}`).join('\n');
    throw new Error(`lexer-invariants: ${violations.length} violation(s)${where} -- js-lexer.js likely misread something:\n${details}`);
  }
}

module.exports = { checkLexerInvariants, checkBracketBalance, checkRegexAfterValue, assertLexerInvariants };
