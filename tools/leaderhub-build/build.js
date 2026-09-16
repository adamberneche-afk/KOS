#!/usr/bin/env node
'use strict';
/**
 * tools/leaderhub-build/build.js
 * ================================
 * leader-hub/student-leader-hub.html used to be a single ~22,000-line file
 * — the review's Finding 4 flagged this as a real maintainability cost
 * (a monolith this size is hard to navigate, and a single-line edit
 * anywhere in it can shift line numbers everything else — including
 * tests/leaderhub/*.test.js's own extractLines() calls — used to depend
 * on). Split into the 14 files under leader-hub/src/ this script
 * concatenates back together, in the exact order manifest.json lists.
 *
 * WHY PURE TEXTUAL CONCATENATION IS SAFE HERE, DESPITE 189+ SCATTERED
 * TOP-LEVEL DECLARATIONS AND NO CENTRAL CONFIG OBJECT:
 * This is a single <script> block (well, two — see 02-error-handler.html),
 * not an ES module system. Top-level `function` declarations hoist across
 * the WHOLE assembled script regardless of which fragment they live in —
 * a function defined in fragment 10 can be called from fragment 3's
 * markup's onclick handler with no import/export needed, exactly as it
 * could before the split. The one real constraint: fragment order must
 * match the ORIGINAL file's order, because top-level `const`/`let`
 * variable INITIALIZERS (not function declarations) still run in file
 * order — a fragment that reads a `const` some earlier fragment defines
 * would break if reordered. manifest.json's order is exactly today's
 * original file order for this reason; do not reorder it casually.
 *
 * Fragment concatenation always produces ONE logical script per original
 * <script> block, never split at fragment boundaries — a fragment
 * boundary is only guaranteed safe for pure textual concatenation (each
 * fragment ends where the next begins, reproducing the original file
 * exactly), not for standing alone as a separate <script> tag (a
 * template literal can legitimately span what's a safe concatenation
 * boundary). The actual <script>-tag splitting below happens later, at
 * real statement boundaries found by tokenizing the assembled+minified
 * result — see split-script.js.
 *
 * MINIFICATION + SPLITTING (added investigating a live OAuth-consent-
 * dialog crash — see leader-hub/HISTORY.md's 2026-09-15 and follow-up
 * entries): after concatenating fragments, every real inline <script>
 * block's CONTENT (found the same comment-aware way tools/html-lint/
 * check.js finds them, via findInlineScriptBlocks — NOT a naive
 * `indexOf('<script'` scan, which mistook a comment mentioning
 * "<script>" as prose for a real tag earlier in this investigation and
 * threw every size measurement off by ~33K characters) gets:
 *   1. run through strip-comments.js's stripCommentsAndWhitespace(),
 *      which removes comments and collapses dead whitespace/blank lines
 *      while leaving every string/template/regex literal's actual
 *      content untouched and never merging two lines that had a real
 *      newline between them (JS's automatic-semicolon-insertion can
 *      change meaning if a significant newline gets removed) — a pure
 *      size reduction with no logic change, verified against the real
 *      script with verify-strip.js's token-stream equivalence check.
 *      Hand-rolled instead of using a real minifier (terser etc.)
 *      because this repo has no npm dependencies today and network
 *      access to the npm registry from every machine that runs this
 *      couldn't be confirmed — see js-lexer.js's header for the
 *      tokenizer this relies on.
 *   2. run through hoist-declarations.js's hoistTopLevelDeclarations(),
 *      converting every top-level `let`/`const` to `var` — required
 *      before a block can safely be split into multiple <script> tags
 *      (see that file's header for why).
 *   3. split into several <script> tags via split-script.js's
 *      splitScript(), each kept comfortably under the ~100K-107K
 *      per-tag character threshold established by live bisection on a
 *      throwaway project (the actual crash cause: per-<script>-tag
 *      size, confirmed unrelated to total page size or OAuth scope
 *      composition), each independently verified with `node --check`.
 * A block that was originally ONE <script>...</script> tag becomes
 * several consecutive ones with no markup between them — this changes
 * nothing about execution order or the shared global object (see above:
 * var/function declarations become properties of the page's global
 * object, shared across every script tag on the page in document
 * order) now that every top-level let/const is a var.
 *
 * Before any of this is trusted, lexer-invariants.js's
 * assertLexerInvariants() re-checks every raw block's own token stream
 * for internal consistency (balanced brackets; no regex token following
 * something only division could follow) — independent of the strip/
 * hoist/split transforms themselves, so a js-lexer.js bug that fools
 * verify-strip.js/verify-hoist.js's before-vs-after comparisons (both
 * sides tokenized the same wrong way) still gets caught here. See that
 * file's header for why this is a real, previously-hit blind spot, not
 * a hypothetical one.
 *
 * Every resulting <script> block's content also gets a trailing
 * `//# sourceURL=...` comment (a standard DevTools convention) giving it
 * a stable, readable name in the browser's Sources panel and in stack
 * traces — without it, a runtime error in a script tag that's the 7th of
 * 15 chunks of one original block just says "VM123:4231" with no way to
 * tell which chunk, let alone which original fragment, it came from.
 *
 * THE ASSEMBLED FILE IS GENERATED. Never hand-edit
 * leader-hub/student-leader-hub.html directly — edit the fragment(s)
 * under leader-hub/src/ that hold the section you're changing, then run
 * `node tools/leaderhub-build/build.js` to regenerate it. It stays
 * committed at its current path (not gitignored) — leader-hub/README.md
 * and .claspignore already establish that this file is opened directly
 * from a checkout with no deploy step; gitignoring the assembled output
 * would force a mandatory build before the file even opens, which this
 * repo's whole "no build step" framing for leader-hub was built around.
 * (That framing is about opening/deploying the file, not about
 * regenerating it — this script itself has always been a real, if tiny,
 * build step; it just has zero npm dependencies of its own.)
 * `--check` mode (below) is what actually prevents silent drift between
 * the fragments and the committed assembled file, enforced in CI instead.
 *
 * USAGE
 *   node tools/leaderhub-build/build.js          # rebuild the assembled file
 *   node tools/leaderhub-build/build.js --check  # verify it's already up to date; exit 1 if not
 *   node tools/leaderhub-build/build.js --stats  # rebuild, then print a per-block size report
 */

const fs = require('fs');
const path = require('path');
const { findInlineScriptBlocks } = require('../html-lint/check.js');
const { stripCommentsAndWhitespace } = require('./strip-comments.js');
const { hoistTopLevelDeclarations } = require('./hoist-declarations.js');
const { splitScript } = require('./split-script.js');
const { assertLexerInvariants } = require('./lexer-invariants.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = require(path.join(__dirname, 'manifest.json'));

// Comfortably under the ~100K-107K per-<script>-tag crash threshold
// established by live bisection (see this file's header comment).
const MAX_SCRIPT_CHUNK_SIZE = 70000;

function concatenateFragments() {
  const parts = MANIFEST.fragments.map((relPath) => {
    const absPath = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Fragment listed in manifest.json not found: ${relPath}`);
    }
    return fs.readFileSync(absPath, 'utf8');
  });
  // No separator — see this file's own header comment: each fragment must
  // end exactly where the next began, reproducing the original file's
  // line boundaries with nothing added or removed.
  return parts.join('');
}

// A stable, readable name for a script block/chunk's `//# sourceURL=`
// comment (browser DevTools convention: naming a <script> block in the
// Sources panel and in stack traces, instead of an anonymous "VM123").
// Not a real file path — nothing on disk has to exist at this name.
function sourceUrlFor(blockIndex, chunkIndex, chunkCount) {
  const base = `leader-hub-block-${blockIndex}`;
  if (chunkCount === 1) return `${base}.js`;
  return `${base}-part-${chunkIndex + 1}-of-${chunkCount}.js`;
}

// Replaces every real inline <script> block's content with its
// comment/whitespace-stripped, let/const-hoisted version, then — only for
// a block over MAX_SCRIPT_CHUNK_SIZE — splits it into several consecutive
// <script>...</script> tags (same open/close tag text repeated, no markup
// between them) at verified-safe statement boundaries. Everything else
// (markup, styles, HTML comments, attributes) is left byte-for-byte
// unchanged. Minification is applied twice per block: it's not perfectly
// idempotent in one pass (a same-line comment's own leading space can be
// left behind until a second pass sees it adjacent to the following
// newline with nothing between them — see strip-comments.js's header)
// but does reach a stable fixed point by the second pass, verified with
// verify-strip.js.
//
// `statsOut`, if given an array, gets one entry pushed per original
// <script> block: { blockIndex, originalLength, minifiedLength,
// chunkSizes } — used by `--stats` mode; normal callers omit it.
function minifyScriptBlocks(assembled, statsOut) {
  const blocks = findInlineScriptBlocks(assembled);
  let out = '';
  let cursor = 0;
  blocks.forEach(({ contentStart, contentEnd }, blockIndex) => {
    const beforeContent = assembled.slice(cursor, contentStart);
    const openTagMatch = /<script\b[^>]*>$/i.exec(beforeContent);
    if (!openTagMatch) {
      throw new Error('build.js: could not locate this <script> block\'s own opening tag.');
    }
    const closeTagMatch = /^<\/script[^>]*>/i.exec(assembled.slice(contentEnd));
    if (!closeTagMatch) {
      throw new Error('build.js: could not locate this <script> block\'s own closing tag.');
    }
    const openTag = openTagMatch[0];
    const closeTag = closeTagMatch[0];

    out += beforeContent;
    const content = assembled.slice(contentStart, contentEnd);

    // Independent sanity check on the RAW block, before any transform —
    // see lexer-invariants.js's header for why this can catch a
    // js-lexer.js bug that a before/after comparison alone would miss.
    assertLexerInvariants(content, `<script> block ${blockIndex}`);

    let processed = stripCommentsAndWhitespace(stripCommentsAndWhitespace(content));

    let chunks;
    if (processed.length > MAX_SCRIPT_CHUNK_SIZE) {
      processed = hoistTopLevelDeclarations(processed);
      chunks = splitScript(processed, MAX_SCRIPT_CHUNK_SIZE);
    } else {
      chunks = [processed];
    }

    const named = chunks.map((chunk, i) => `${chunk}\n//# sourceURL=${sourceUrlFor(blockIndex, i, chunks.length)}`);
    out += named.join(`${closeTag}${openTag}`);

    if (statsOut) {
      statsOut.push({
        blockIndex,
        originalLength: content.length,
        minifiedLength: processed.length,
        chunkSizes: chunks.map((c) => c.length),
      });
    }

    cursor = contentEnd;
  });
  out += assembled.slice(cursor);
  return out;
}

function build(statsOut) {
  return minifyScriptBlocks(concatenateFragments(), statsOut);
}

function printStats(concatenatedLength, stats) {
  console.log('');
  console.log('Per-<script>-block minification + splitting report:');
  stats.forEach(({ blockIndex, originalLength, minifiedLength, chunkSizes }) => {
    const pct = originalLength > 0 ? (100 * (1 - minifiedLength / originalLength)).toFixed(1) : '0.0';
    console.log(`  block ${blockIndex}: ${originalLength} -> ${minifiedLength} chars (-${pct}%)`);
    if (chunkSizes.length > 1) {
      console.log(`    split into ${chunkSizes.length} <script> tags: [${chunkSizes.join(', ')}] (max ${Math.max(...chunkSizes)}, target ${MAX_SCRIPT_CHUNK_SIZE})`);
    }
  });
  const totalOriginal = stats.reduce((s, b) => s + b.originalLength, 0);
  const totalMinified = stats.reduce((s, b) => s + b.minifiedLength, 0);
  const totalPct = totalOriginal > 0 ? (100 * (1 - totalMinified / totalOriginal)).toFixed(1) : '0.0';
  console.log(`  all script content: ${totalOriginal} -> ${totalMinified} chars (-${totalPct}%)`);
  console.log(`  concatenated fragments (pre-minify): ${concatenatedLength} chars`);
  console.log('');
}

function main() {
  const checkMode = process.argv.includes('--check');
  const statsMode = process.argv.includes('--stats');
  const outputPath = path.join(REPO_ROOT, MANIFEST.output);
  const concatenated = concatenateFragments();
  const stats = statsMode ? [] : undefined;
  const assembled = minifyScriptBlocks(concatenated, stats);

  if (statsMode) printStats(concatenated.length, stats);

  if (checkMode) {
    if (!fs.existsSync(outputPath)) {
      console.error(`✗ ${MANIFEST.output} does not exist. Run without --check to generate it.`);
      process.exit(1);
    }
    const committed = fs.readFileSync(outputPath, 'utf8');
    if (assembled === committed) {
      console.log(`✓ ${MANIFEST.output} matches the ${MANIFEST.fragments.length} fragments under leader-hub/src/ — no drift.`);
      process.exit(0);
    }
    console.error(
      `✗ ${MANIFEST.output} does NOT match its fragments — it was hand-edited directly, ` +
      `or a fragment changed without rebuilding.\n` +
      `  Committed length: ${committed.length} chars. Fragment-built length: ${assembled.length} chars.\n` +
      `  Run \`node tools/leaderhub-build/build.js\` (no --check) to regenerate it from the fragments, ` +
      `then re-commit both.`
    );
    process.exit(1);
  }

  fs.writeFileSync(outputPath, assembled, 'utf8');
  console.log(`✓ Built ${MANIFEST.output} from ${MANIFEST.fragments.length} fragments under leader-hub/src/ (${assembled.length} chars).`);
}

if (require.main === module) main();

module.exports = { build, concatenateFragments, minifyScriptBlocks, MANIFEST };
