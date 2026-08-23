'use strict';
// Extracts an exact 1-indexed, inclusive line range from a source file, and
// asserts the slice actually contains every string in `mustContain` before
// handing it back.
//
// This is a deliberately narrow tool, not a real parser or a brace-matcher
// like tools/gas-lint/check.js's stripCommentsAndStrings(). It exists so a
// test can exercise a handful of named, self-contained functions embedded
// inside leader-hub/student-leader-hub.html's ~22,000-line single <script>
// block without loading (and having to mock the DOM for) the entire file.
//
// The tradeoff, stated plainly rather than papered over: a hardcoded line
// range drifts the moment someone edits above it. The `mustContain` check
// is the safety net for that — if the range no longer contains what a
// caller expects, this throws a clear, actionable error instead of quietly
// testing the wrong 20 lines. When that happens, the fix is to re-grep for
// the real current line numbers and update the caller, never to loosen or
// remove the check.
//
// Usage:
//   extractLines(HTML_PATH, 5890, 5907, ['function escH(', 'function escJsAttr('])

const fs = require('fs');

function extractLines(filePath, startLine, endLine, mustContain = []) {
  if (startLine < 1 || endLine < startLine) {
    throw new Error(`extractLines: invalid range ${startLine}-${endLine} for ${filePath}`);
  }
  const allLines = fs.readFileSync(filePath, 'utf8').split('\n');
  const slice = allLines.slice(startLine - 1, endLine).join('\n');

  const missing = mustContain.filter((needle) => !slice.includes(needle));
  if (missing.length) {
    throw new Error(
      `extractLines(${filePath}, ${startLine}-${endLine}): expected to find ${JSON.stringify(missing)} ` +
      `in this line range but didn't find one or more of them — the source has likely moved or been ` +
      `edited since these line numbers were chosen. Re-locate the right range (grep for the missing ` +
      `string(s) in the real file) and update the caller; do not loosen this check.`
    );
  }
  return slice;
}

module.exports = { extractLines };
