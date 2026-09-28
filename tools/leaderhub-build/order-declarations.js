'use strict';
/**
 * tools/leaderhub-build/order-declarations.js
 * =============================================
 * Reorders one big top-level script so that splitting it into several
 * <script> tags (split-script.js) can't change what it does at load time.
 *
 * WHY: in ONE classic script, every top-level function declaration exists
 * before any statement runs, and every top-level `var` already exists
 * (as undefined) too. Split into separate tags, a function or var only
 * exists once ITS tag has run. So a statement that runs at load time and
 * names a function declared in a later tag throws a ReferenceError, and the
 * rest of its tag's load-time code is skipped. That happened live
 * (2026-09-28, ?diag=probe): fragment 06's
 * `const _unsavedWorkChecks = [_lpHasUnsavedChanges, ...]` ran before the
 * tag holding fragment 09's `function _lpHasUnsavedChanges()`.
 *
 * WHAT: the output is, in order,
 *   1. one `var a,b,c;` naming every top-level var (so a read before its
 *      assignment gives undefined, as in one script, instead of throwing),
 *   2. every top-level function declaration, in original order,
 *   3. every other top-level statement, in original order.
 * That is exactly the order one script would set these up in: function
 * declarations are instantiated before any statement runs, in source order
 * (so a later duplicate still wins), and nothing else moves relative to
 * anything else. A bare `var x;` never overwrites an existing value, so
 * the up-front list is harmless even for a name the page's globals
 * already have.
 *
 * PREREQUISITE: top-level let/const already rewritten to var
 * (hoist-declarations.js), so every top-level binding is a var, a
 * function or a class. A top-level destructuring var would need its
 * names pulled out of the pattern; none exists today, so one throws here
 * rather than being half-handled.
 *
 * SAFETY: a statement only moves to group 2 when it is, as a whole, one
 * named `function` / `function*` / `async function` declaration: the body's
 * closing `}` is the statement's last real token. Anything else (including
 * a function declaration that shares its cut-point segment with a following
 * statement, which ASI can cause) stays where it is, in group 3.
 */

const { tokenize } = require('./js-lexer');
const { findSafeCutPoints } = require('./split-script');

const isReal = (t) => t.type !== 'ws' && t.type !== 'comment-line' && t.type !== 'comment-block';

// True when `real` (one statement's real tokens) is exactly one named
// function declaration.
function isFunctionDeclaration(real) {
  let i = 0;
  if (real[i] && real[i].type === 'ident' && real[i].text === 'async') i++;
  if (!real[i] || real[i].type !== 'ident' || real[i].text !== 'function') return false;
  i++;
  if (real[i] && real[i].type === 'punct' && real[i].text === '*') i++;
  if (!real[i] || real[i].type !== 'ident') return false;
  i++;
  if (!real[i] || real[i].text !== '(') return false;
  // Walk the parameter list, then the body, to the body's closing brace.
  let depth = 0;
  let sawBody = false;
  for (; i < real.length; i++) {
    const t = real[i].text;
    if (real[i].type !== 'punct') continue;
    if (t === '(' || t === '[' || t === '{') {
      if (t === '{' && depth === 0) sawBody = true;
      depth++;
    } else if (t === ')' || t === ']' || t === '}') {
      depth--;
      if (depth === 0 && t === '}' && sawBody) return i === real.length - 1;
    }
  }
  return false;
}

// Names declared by the top-level var statements in `real`: the
// identifier after each depth-0 `var`, and after each depth-0 comma in
// that var list (which a `;` ends).
function varNames(real) {
  const names = [];
  let depth = 0;
  let inVarList = false;
  for (let i = 0; i < real.length; i++) {
    const t = real[i];
    if (t.type === 'punct') {
      if (t.text === '(' || t.text === '[' || t.text === '{') { depth++; continue; }
      if (t.text === ')' || t.text === ']' || t.text === '}') { depth--; continue; }
    }
    if (depth !== 0) continue;
    const prev = real[i - 1];
    if (t.type === 'ident' && t.text === 'var' && !(prev && prev.text === '.')) {
      const next = real[i + 1];
      if (next && next.type === 'punct' && (next.text === '{' || next.text === '[')) {
        throw new Error('order-declarations.js: a top-level destructuring var needs its names ' +
          'listed up front, which this file does not do yet.');
      }
      inVarList = true;
      if (next && next.type === 'ident') names.push(next.text);
      continue;
    }
    if (!inVarList || t.type !== 'punct') continue;
    if (t.text === ';') inVarList = false;
    else if (t.text === ',') {
      const next = real[i + 1];
      if (next && next.type === 'ident') names.push(next.text);
    }
  }
  return names;
}

// Returns { source, functions, statements, vars } where `source` is the
// reordered script and the rest are counts for the --stats report.
function orderDeclarations(source) {
  const cuts = findSafeCutPoints(source);
  const functions = [];
  const others = [];
  const names = [];
  const seen = new Set();
  for (let c = 0; c < cuts.length - 1; c++) {
    const text = source.slice(cuts[c], cuts[c + 1]);
    const real = tokenize(text).filter(isReal);
    if (real.length === 0) { others.push(text); continue; }
    if (isFunctionDeclaration(real)) { functions.push(text); continue; }
    varNames(real).forEach((n) => { if (!seen.has(n)) { seen.add(n); names.push(n); } });
    others.push(text);
  }
  const preamble = names.length ? 'var ' + names.join(',') + ';\n' : '';
  return {
    source: preamble + functions.join('') + others.join(''),
    functions: functions.length,
    statements: others.length,
    vars: names.length,
  };
}

module.exports = { orderDeclarations, isFunctionDeclaration, varNames };
