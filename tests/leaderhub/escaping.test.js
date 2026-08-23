'use strict';
// Regression tests for leader-hub/student-leader-hub.html's two escaping
// helpers, escH() and escJsAttr(). The 2026-08 codebase review that
// produced tests/leaderhub found several real, still-unpatched innerHTML
// call sites where a value goes out unescaped (trip names, student names,
// journal text) — this file doesn't fix those call sites (that's a repo
// content change, not a test), but it does pin down that the helpers
// THEMSELVES are correct, so any future fix to a missing call site has a
// helper it can trust and this file already verified.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { extractLines } = require('../harness/extract-lines');
const { runInSandbox } = require('../harness/vm-run');

const HTML_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'student-leader-hub.html');

function loadEscapers() {
  const source = extractLines(HTML_PATH, 5890, 5907, ['function escH(', 'function escJsAttr(']);
  return runInSandbox(source, {}, ['escH', 'escJsAttr']);
}

test('escH escapes all 4 HTML-significant characters (&, ", <, >)', () => {
  const { escH } = loadEscapers();
  assert.equal(
    escH(`<script>alert("x")</script> & 'y'`),
    `&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; 'y'`
  );
});

test('escH leaves a bare single quote untouched (documented: it protects the HTML-attribute boundary only, not a JS string literal)', () => {
  const { escH } = loadEscapers();
  assert.equal(escH(`it's fine`), `it's fine`);
});

test('escH treats null/undefined as an empty string rather than the literal text "null"/"undefined"', () => {
  const { escH } = loadEscapers();
  assert.equal(escH(null), '');
  assert.equal(escH(undefined), '');
});

test('escJsAttr escapes every single quote, so a value cannot break out of onclick="fn(\'...\')"', () => {
  const { escJsAttr } = loadEscapers();
  const evil = `'); alert('pwned`;
  const escaped = escJsAttr(evil);
  assert.ok(!/(?<!\\)'/.test(escaped), `expected every ' to be backslash-escaped, got: ${escaped}`);
});

test('escJsAttr escapes a literal backslash before escaping quotes, so a trailing backslash can\'t un-escape the quote that follows it', () => {
  const { escJsAttr } = loadEscapers();
  // If backslashes were escaped AFTER quotes (or not at all), a value
  // ending in \' would produce \\' in the output - which JS parses as an
  // escaped backslash followed by an unescaped, string-terminating quote.
  const escaped = escJsAttr(`end\\'`);
  assert.equal(escaped, `end\\\\\\'`);
});

test('escJsAttr collapses embedded newlines/carriage returns to escaped literals, never a real line break', () => {
  const { escJsAttr } = loadEscapers();
  const escaped = escJsAttr('line1\nline2\r');
  assert.ok(!escaped.includes('\n') && !escaped.includes('\r'), `expected no real newline/CR, got: ${JSON.stringify(escaped)}`);
  assert.ok(escaped.includes('\\n') && escaped.includes('\\r'));
});

test('escJsAttr also applies escH\'s HTML-attribute escaping on top of the JS-string escaping', () => {
  const { escJsAttr } = loadEscapers();
  const escaped = escJsAttr(`<b>"quoted"</b>`);
  assert.ok(escaped.includes('&lt;b&gt;'), 'HTML tags must still be escaped');
  assert.ok(escaped.includes('&quot;'), 'double quotes must still be escaped for the surrounding HTML attribute');
});
