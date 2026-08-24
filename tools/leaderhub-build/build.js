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
 * THE ASSEMBLED FILE IS GENERATED. Never hand-edit
 * leader-hub/student-leader-hub.html directly — edit the fragment(s)
 * under leader-hub/src/ that hold the section you're changing, then run
 * `node tools/leaderhub-build/build.js` to regenerate it. It stays
 * committed at its current path (not gitignored) — leader-hub/README.md
 * and .claspignore already establish that this file is opened directly
 * from a checkout with no deploy step; gitignoring the assembled output
 * would force a mandatory build before the file even opens, which this
 * repo's whole "no build step" framing for leader-hub was built around.
 * `--check` mode (below) is what actually prevents silent drift between
 * the fragments and the committed assembled file, enforced in CI instead.
 *
 * USAGE
 *   node tools/leaderhub-build/build.js          # rebuild the assembled file
 *   node tools/leaderhub-build/build.js --check  # verify it's already up to date; exit 1 if not
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = require(path.join(__dirname, 'manifest.json'));

function build() {
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

function main() {
  const checkMode = process.argv.includes('--check');
  const outputPath = path.join(REPO_ROOT, MANIFEST.output);
  const assembled = build();

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

main();
