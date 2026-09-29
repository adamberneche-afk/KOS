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

// Points at the fragment file (tools/leaderhub-build/ split, external
// product review Finding 4) rather than the assembled monolith — a real
// robustness win, not just a rename: only an edit inside this ~1,500-line
// fragment can shift these line numbers now, not an edit anywhere in the
// full ~22,000-line file.
const HTML_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'src', '06-tasks-trips-and-modals-core.html');

function loadEscapers() {
  const source = extractLines(HTML_PATH, 1461, 1479, ['function escH(', 'function escJsAttr(']);
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

// The DECA season notice is the one stored field rendered as markup on
// purpose (its default uses <strong>). It comes from localStorage or the
// JSON season editor, so everything is escaped and only <strong> comes back.
test('_decaNoticeHtml keeps <strong> and escapes everything else', () => {
  const html07 = path.join(__dirname, '..', '..', 'leader-hub', 'src', '07-events-email-members-goals.html');
  const source = extractLines(HTML_PATH, 1461, 1463, ['function escH(']) + '\n' +
    extractLines(html07, 1066, 1068, ['function _decaNoticeHtml(']);
  const { _decaNoticeHtml } = runInSandbox(source, {}, ['_decaNoticeHtml']);
  assert.equal(_decaNoticeHtml('<strong>Due NOW.</strong> 45 days'), '<strong>Due NOW.</strong> 45 days');
  assert.equal(_decaNoticeHtml('<img src=x onerror=alert(1)><strong>ok</strong>'),
    '&lt;img src=x onerror=alert(1)&gt;<strong>ok</strong>');
  assert.equal(_decaNoticeHtml('<strong onclick="x()">no</strong>'), '&lt;strong onclick=&quot;x()&quot;&gt;no</strong>');
  assert.equal(_decaNoticeHtml(null), '');
});
