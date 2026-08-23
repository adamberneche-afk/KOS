'use strict';
// Regression tests for tools/html-lint/check.js's extractor — specifically
// the exact false-positive this checker hit the first time it was run for
// real against leader-hub/student-leader-hub.html: prose inside an HTML
// comment that happens to say "<script>" (written to describe a past bug
// of this shape) was mistaken for a real tag boundary, and the lazy
// </script> match then swallowed everything up to the next REAL closing
// tag as one huge, unparseable "script block."

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

test('extracts a single real inline <script> block', () => {
  const html = '<html><body><script>const x = 1;</script></body></html>';
  const blocks = extractInlineScripts(html);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].trim(), 'const x = 1;');
});

test('skips an external <script src="..."> tag entirely', () => {
  const html = '<script src="https://example.com/lib.js"></script><script>const x = 1;</script>';
  const blocks = extractInlineScripts(html);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].trim(), 'const x = 1;');
});

test('does not mistake a literal "<script>" mentioned inside an HTML comment for a real tag', () => {
  // This is the exact shape of the false positive this checker hit against
  // the real file: prose describing a <script>-tag bug, sitting well
  // before the real script block, with no real closing tag of its own.
  const html = [
    '<!-- a <script> tag can\'t be conditional, so this renders as text -->',
    '<script>const realCode = 1;</script>',
  ].join('\n');
  const blocks = extractInlineScripts(html);
  assert.equal(blocks.length, 1, 'the comment must not be treated as a script block boundary');
  assert.equal(blocks[0].trim(), 'const realCode = 1;');
});

test('preserves real content (including genuine JS comments) inside a script block untouched', () => {
  const html = '<!-- unrelated top-level comment -->\n<script>\n// a real JS comment\nconst y = 2;\n</script>';
  const blocks = extractInlineScripts(html);
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0].includes('// a real JS comment'), 'a genuine JS comment inside the script block must survive');
  assert.ok(blocks[0].includes('const y = 2;'));
});

test('preserves line numbers, so a syntax error inside the block reports the real file line', () => {
  const html = ['<html>', '<body>', '<script>', 'const ok = 1;', 'this is not valid js;;;', '</script>'].join('\n');
  const blocks = extractInlineScripts(html);
  assert.equal(blocks.length, 1);
  // Line 1-2 are <html>/<body>, line 3 is <script>, so the block's own
  // first real line of content ("const ok = 1;") must be line 4.
  const lines = blocks[0].split('\n');
  assert.equal(lines[3].trim(), 'const ok = 1;');
});

test('finds multiple real script blocks in one file', () => {
  const html = '<script>const a = 1;</script><p>text</p><script>const b = 2;</script>';
  const blocks = extractInlineScripts(html);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].trim(), 'const a = 1;');
  assert.equal(blocks[1].trim(), 'const b = 2;');
});
