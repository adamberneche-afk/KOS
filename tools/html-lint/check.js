#!/usr/bin/env node
'use strict';
/**
 * tools/html-lint/check.js
 * ========================
 * Extracts every top-level <script>...</script> block from a given HTML
 * file (no `src=` attribute — inline blocks only) and runs `node --check`
 * against each one, exactly the way past sessions working on
 * leader-hub/student-leader-hub.html apparently did by hand before every
 * commit (per leader-hub/README.md's own repeated "Verified with node
 * --check on both <script> blocks" notes) — as an enforced CI gate instead
 * of a manual habit someone has to remember.
 *
 * This is a syntax check ONLY. It catches the exact bug class
 * leader-hub/README.md documents finding this way in the past — 8 places
 * where raw JavaScript rendered as visible garbage text because it sat
 * outside any <script> tag, and separately, literal unescaped backticks
 * breaking an outer template literal — both of which are unparseable
 * JavaScript and would fail this check immediately. It does NOT catch
 * logic bugs, missing escaping at an innerHTML call site, or anything
 * `tests/leaderhub/*.test.js` covers instead.
 *
 * Usage: node tools/html-lint/check.js <path-to-html-file> [...more files]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

// Blanks out the CONTENT of every HTML comment (keeping its exact length
// and every newline, so line numbers elsewhere never shift) before this
// file goes looking for real <script>/</script> tags. Without this, prose
// like "a <script> tag can't be conditional" or "outside any <script>
// tag" — both real sentences in student-leader-hub.html's own comments,
// written to explain a PAST bug of exactly this shape — reads as a real
// tag boundary, and the lazy </script> match then swallows everything up
// to the next REAL closing tag as if it were one (invalid) script block.
// Found by running this checker for real, not hypothesized in advance.
function blankHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' ')
  );
}

function extractInlineScripts(html) {
  const blocks = [];
  const scannable = blankHtmlComments(html);
  // Deliberately simple and line-number-preserving: replaces everything
  // BEFORE a script block's content with newlines, so a syntax error's
  // reported line number inside the extracted block still matches the
  // real file's line number when read back by a human.
  //
  // FIXED (CodeQL js/bad-tag-filter): the closing-tag half used to be the
  // rigid literal `<\/script>` - real HTML tolerates whitespace before
  // the `>` (`</script >`, `</script  >`), which this didn't match. A
  // stray extra space in a closing tag would have made this regex skip
  // right past the real end and keep matching into whatever the NEXT
  // `<\/script>` happened to be - silently extracting the wrong,
  // oversized "block" instead of erroring. The closing tag is now its
  // own capture group (3) specifically so its real matched length -
  // whatever whitespace it actually contained - can be used below,
  // instead of assuming the fixed 9-character literal.
  const re = /<script\b([^>]*)>([\s\S]*?)(<\/script\s*>)/gi;
  let m;
  while ((m = re.exec(scannable))) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue; // external script - nothing to check here
    const blockStart = m.index + m[0].indexOf('>', m[1].length) + 1;
    // blankHtmlComments() only replaces comment CHARACTERS, never removes
    // any (same length, same newlines) - so an index/offset found against
    // `scannable` points at the exact same character in the real `html`.
    // Slicing the real content back out here (rather than using m[2],
    // which came from the blanked copy) matters because a genuine JS
    // comment inside a real script block must reach `node --check`
    // unblanked — only HTML-level <!-- --> comments outside/around script
    // tags are the thing being blanked.
    const contentEnd = m.index + m[0].length - m[3].length;
    const before = html.slice(0, blockStart);
    const leadingNewlines = before.split('\n').length - 1;
    const content = html.slice(blockStart, contentEnd);
    blocks.push('\n'.repeat(leadingNewlines) + content);
  }
  return blocks;
}

function checkFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const blocks = extractInlineScripts(html);
  if (!blocks.length) {
    console.log(`${filePath}: no inline <script> blocks found — nothing to check.`);
    return true;
  }

  let ok = true;
  blocks.forEach((content, i) => {
    const tmpFile = path.join(os.tmpdir(), `html-lint-${path.basename(filePath)}-${i}-${process.pid}.js`);
    fs.writeFileSync(tmpFile, content);
    try {
      execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' });
      console.log(`${filePath}: <script> block ${i + 1}/${blocks.length} — OK`);
    } catch (e) {
      ok = false;
      console.error(`${filePath}: <script> block ${i + 1}/${blocks.length} — SYNTAX ERROR`);
      console.error(e.stderr ? e.stderr.toString() : e.message);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
  return ok;
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node tools/html-lint/check.js <path-to-html-file> [...more files]');
    process.exit(2);
  }
  let allOk = true;
  for (const f of files) {
    if (!checkFile(f)) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}

if (require.main === module) main();

module.exports = { extractInlineScripts, checkFile };
