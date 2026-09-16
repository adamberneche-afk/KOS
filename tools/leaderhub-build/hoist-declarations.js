'use strict';
/**
 * tools/leaderhub-build/hoist-declarations.js
 * =============================================
 * Rewrites TOP-LEVEL (script-scope, not nested in any function/block/
 * for-loop-head) `let`/`const` declarations to `var`, and nothing else.
 *
 * WHY: this codebase is a single classic (non-module) script with ~2,200
 * top-level `let`/`const` bindings, some referenced hundreds of lines and
 * several source fragments away from where they're declared (`LS`, the
 * localStorage wrapper, alone has 300+ later references). That's safe
 * today because it's ONE <script> tag — but build.js needs to split the
 * giant script into several smaller <script> tags to fix a real OAuth-
 * consent-dialog crash traced to per-tag size (see leader-hub/HISTORY.md's
 * 2026-09-15 entry). Separate classic <script> tags each get their OWN
 * top-level lexical scope for let/const/class -- only var and function
 * declarations become shared properties of the page's global object,
 * visible from every script tag in document order. Converting every
 * top-level let/const to var is what makes splitting safe: it changes
 * NOTHING about behavior in a single combined tag (var's hoisting/
 * redeclaration/no-reassignment-guard differences can only make more code
 * work, never break code that was valid under the stricter let/const
 * rules -- see this file's own tests for the reasoning spelled out
 * case-by-case) while making every such binding visible across tags too.
 *
 * SAFETY: only rewrites a `let`/`const` token that is:
 *   - at bracket depth 0 (not inside any {, (, or [ -- this alone excludes
 *     a for-loop's own `for (let i = 0; ...)` head, since that `let` sits
 *     inside the for's `(...)`, and excludes anything nested in a
 *     function/block/object/array),
 *   - not immediately preceded by `.` (so `foo.let(x)` -- `let` used as a
 *     property/method name -- is left alone), and
 *   - immediately followed by something that can start a binding target
 *     (an identifier, `{` for object destructuring, or `[` for array
 *     destructuring) -- so `{ let: 5 }` (an object key) is left alone,
 *     since after `let` there it's `:`, not a binding start.
 * Verified against the real script with verify-hoist.js's token-stream
 * comparison (identical everywhere except let/const -> var at exactly the
 * positions this file rewrote) before being wired into build.js.
 */

const { tokenize } = require('./js-lexer');

function canStartBindingTarget(tok) {
  if (!tok) return false;
  if (tok.type === 'ident') return true;
  if (tok.type === 'punct' && (tok.text === '{' || tok.text === '[')) return true;
  return false;
}

function hoistTopLevelDeclarations(source) {
  const tokens = tokenize(source);
  let depth = 0;
  let out = '';

  // Index of the last non-whitespace, non-comment token emitted, to check
  // "not preceded by a dot" and "next token can start a binding."
  let lastRealIdx = -1;
  const real = []; // indices into `tokens` for non-ws/non-comment entries, in order

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'ws' && t.type !== 'comment-line' && t.type !== 'comment-block') {
      real.push(i);
    }
  }

  // Map token index -> position within `real` for quick neighbor lookups.
  const realPos = new Map();
  real.forEach((idx, pos) => realPos.set(idx, pos));

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.type === 'punct' && (t.text === '{' || t.text === '(' || t.text === '[')) {
      depth++;
      out += t.text;
      continue;
    }
    if (t.type === 'punct' && (t.text === '}' || t.text === ')' || t.text === ']')) {
      depth--;
      out += t.text;
      continue;
    }

    if (t.type === 'ident' && (t.text === 'let' || t.text === 'const') && depth === 0) {
      const pos = realPos.get(i);
      const prevTok = pos > 0 ? tokens[real[pos - 1]] : null;
      const nextTok = pos < real.length - 1 ? tokens[real[pos + 1]] : null;
      const precededByDot = prevTok && prevTok.type === 'punct' && prevTok.text === '.';
      if (!precededByDot && canStartBindingTarget(nextTok)) {
        out += 'var';
        continue;
      }
    }

    out += t.text;
  }

  return out;
}

module.exports = { hoistTopLevelDeclarations };
