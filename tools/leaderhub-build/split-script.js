'use strict';
/**
 * tools/leaderhub-build/split-script.js
 * =======================================
 * Splits one giant top-level JS source string into several chunks, each
 * safe to drop into its own separate <script> tag, to fix a real live
 * OAuth-consent-dialog crash traced (via careful bisection on throwaway
 * Apps Script projects, not the live one — see leader-hub/HISTORY.md's
 * follow-up entry) to per-<script>-tag character count, not total page
 * size. Splitting the same total content into several tags under the
 * threshold eliminated the crash outright.
 *
 * SAFETY: a cut can only land where doing so provably can't change what
 * the code does. Two cut kinds are used, both requiring bracket depth 0
 * (not inside any {, (, or [ -- see hoist-declarations.js for why that
 * alone isn't sufficient on its own without also constraining WHICH
 * depth-0 gaps are chosen):
 *   - right after a top-level `;` -- a semicolon only appears at depth 0
 *     as a genuine statement terminator (a for-loop's own `;`s are inside
 *     its `(...)`, at depth > 0), so this is always a real statement
 *     boundary.
 *   - right after a top-level `}` -- but ONLY when the next real token
 *     can't possibly be a continuation of the same statement (see
 *     CONTINUATION_STARTS below). This covers function/if/for/while/
 *     try/switch bodies that (correctly, per JS grammar) have no
 *     trailing `;`. Depth-0 `}` followed by a continuation token (e.g.
 *     `else`, or a binary operator continuing an object-literal
 *     expression statement) is never offered as a cut point.
 * Every resulting chunk is additionally verified with `node --check` as
 * a standalone file before this module trusts its own analysis --
 * cheap here (a handful of chunks), and it's exactly the check that
 * caught real fragment-boundary bugs during the original bisection
 * (a template literal can legitimately span what's a safe CONCATENATION
 * boundary without being a safe standalone-script boundary).
 *
 * PREREQUISITE: the source must already have had every top-level
 * `let`/`const` converted to `var` (hoist-declarations.js) -- otherwise
 * a binding declared in one resulting chunk would not be visible from
 * another (separate classic <script> tags each get their own top-level
 * let/const/class lexical scope; only var/function declarations become
 * shared properties of the page's global object, visible across tags in
 * document order).
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tokenize } = require('./js-lexer');

// Tokens that mean "the previous statement isn't actually over yet" when
// found immediately after a depth-0 `}` -- so that `}` is NOT offered as
// a cut point. Covers `} else {`, `} catch {`, `} finally {`, a do-while's
// `} while (...)`, and a `}` that was actually the end of an object
// literal / arrow function body inside a larger expression statement
// (`}, ...`, `}).method()`, `} + x`, `} : y`, template continuation, etc).
const CONTINUATION_STARTS = new Set([
  ';', ',', ')', ']', '.', '?', ':', '=', '+', '-', '*', '/', '%', '&', '|',
  '^', '<', '>', '!', '`',
]);
const CONTINUATION_KEYWORDS = new Set(['else', 'catch', 'finally', 'while']);

function isContinuation(tok) {
  if (!tok) return false; // EOF is never a continuation
  if (tok.type === 'punct') return CONTINUATION_STARTS.has(tok.text);
  if (tok.type === 'ident') return CONTINUATION_KEYWORDS.has(tok.text);
  return false;
}

// Returns a sorted array of character offsets into `source` where it is
// provably safe to cut (each offset is the start of a new statement).
// Offset 0 and source.length are always included.
function findSafeCutPoints(source) {
  const tokens = tokenize(source);
  const real = tokens.filter(
    (t) => t.type !== 'ws' && t.type !== 'comment-line' && t.type !== 'comment-block'
  );

  const cuts = [0];
  let depth = 0;
  let pos = 0;
  let realIdx = -1; // index of the token just processed, within `real`
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'ws' || t.type === 'comment-line' || t.type === 'comment-block') {
      pos += t.text.length;
      continue;
    }
    realIdx++;
    if (t.type === 'punct' && (t.text === '{' || t.text === '(' || t.text === '[')) {
      depth++;
      pos += t.text.length;
      continue;
    }
    if (t.type === 'punct' && (t.text === '}' || t.text === ')' || t.text === ']')) {
      depth--;
      pos += t.text.length;
      if (t.text === '}' && depth === 0) {
        const nextTok = real[realIdx + 1];
        if (!isContinuation(nextTok)) cuts.push(pos);
      }
      continue;
    }
    if (t.type === 'punct' && t.text === ';' && depth === 0) {
      pos += t.text.length;
      cuts.push(pos);
      continue;
    }
    pos += t.text.length;
  }
  if (cuts[cuts.length - 1] !== source.length) cuts.push(source.length);
  return cuts;
}

// Greedily picks cut points so each chunk is as close to (but not over)
// targetSize as possible, falling back to the next available cut point
// past targetSize only when no cut point exists within the window (a
// single statement longer than targetSize -- rare, but must still
// produce a valid chunk rather than get stuck).
function chooseChunkBoundaries(cuts, targetSize) {
  const boundaries = [0];
  let start = 0;
  while (start < cuts[cuts.length - 1]) {
    const limit = start + targetSize;
    let chosen = null;
    for (const c of cuts) {
      if (c <= start) continue;
      if (c > limit) break;
      chosen = c;
    }
    if (chosen === null) {
      // No cut point fits within the target window -- take the next
      // available one past it so progress is still made.
      chosen = cuts.find((c) => c > start);
    }
    boundaries.push(chosen);
    start = chosen;
  }
  return boundaries;
}

function verifyChunkStandalone(chunk, index) {
  const tmpPath = path.join(os.tmpdir(), `leaderhub-split-check-${process.pid}-${index}.js`);
  fs.writeFileSync(tmpPath, chunk, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', tmpPath], { stdio: 'pipe' });
  } catch (err) {
    throw new Error(
      `split-script.js: chunk ${index} (${chunk.length} chars) is not valid standalone JS:\n` +
      (err.stderr ? err.stderr.toString() : err.message)
    );
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

// Splits `source` (already hoisted + minified) into chunks no larger
// than targetSize where possible. Returns an array of strings that,
// concatenated with no separator, reproduce `source` exactly.
function splitScript(source, targetSize) {
  if (source.length <= targetSize) return [source];

  const cuts = findSafeCutPoints(source);
  const boundaries = chooseChunkBoundaries(cuts, targetSize);

  const chunks = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    chunks.push(source.slice(boundaries[i], boundaries[i + 1]));
  }

  if (chunks.join('') !== source) {
    throw new Error('split-script.js: internal error -- chunks do not reconstruct the source exactly.');
  }

  chunks.forEach((chunk, i) => verifyChunkStandalone(chunk, i));

  return chunks;
}

module.exports = { splitScript, findSafeCutPoints, chooseChunkBoundaries };
