'use strict';
// Regression test for a real, previously-unescaped innerHTML sink: the
// School Store Sales Log's shift-entry renderer
// (09-wbl-lessonplans-procurement-finance-esports.html's renderFinance()).
//
// saveSales() takes `staff` and `notes` straight from free-text form
// fields with only .trim() applied (no HTML escaping) and pushes them
// into SALES_LOG. renderFinance() then interpolated both directly into an
// innerHTML template string — every other user-entered field in this same
// file already goes through the escH() helper (see tests/leaderhub/
// escaping.test.js, which pins escH()/escJsAttr() themselves) before
// interpolation; this was the one sink that had been missed. A student
// logging a shift with e.g. `<img src=x onerror=...>` in "Staff" or
// "Notes" got it executed for anyone who later viewed the Finance/Sales
// tab. Fixed by wrapping both fields with escH(), same as this file's
// other interpolated fields.
//
// This test exercises the real renderer function, not a re-description of
// it — see extract-lines.js's own header for why a hardcoded line range
// (with a mustContain safety net) is how this repo tests a named function
// embedded in a large single-<script> file without mocking the whole DOM.
// `s.date` is deliberately left unescaped in the source and untested for
// escaping here — it comes from an `<input type="date">`, which the
// browser constrains to a real date string or empty, unlike the free-text
// `staff`/`notes` inputs.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { extractLines } = require('../harness/extract-lines');
const { runInSandbox } = require('../harness/vm-run');

const ESCH_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'src', '06-tasks-trips-and-modals-core.html');
const FINANCE_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'src', '09-wbl-lessonplans-procurement-finance-esports.html');

function renderSalesLog(salesLog) {
  const escHSource = extractLines(ESCH_PATH, 1461, 1463, ['function escH(']);
  // The real sink: the else-branch of renderFinance()'s sales-log block,
  // which assigns the rendered rows straight into a DOM element's
  // innerHTML. Extracted as-is (not reimplemented) so this test fails if
  // the real source stops escaping, not just if a hand-written copy of
  // the logic would.
  const sinkSource = extractLines(FINANCE_PATH, 1829, 1846, [
    'logEl.innerHTML = [...SALES_LOG]', 'escH(s.staff)', 'escH(s.notes)', "}).join('');",
  ]);

  const logEl = { innerHTML: '' };
  const { logEl: result } = runInSandbox(
    escHSource + '\n' + sinkSource,
    { SALES_LOG: salesLog, logEl },
    ['logEl'],
  );
  return result.innerHTML;
}

function sale(overrides) {
  return Object.assign({
    id: 'sl1', date: '2026-09-21', staff: 'Alex', units: 3,
    cash: 20, card: 10, cogs: 12, notes: '',
  }, overrides);
}

test('a staff name containing an HTML tag is escaped, not executed', () => {
  const html = renderSalesLog([sale({ staff: '<img src=x onerror=alert(1)>' })]);
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), `raw payload leaked into innerHTML: ${html}`);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('a notes field containing a script tag is escaped, not executed', () => {
  const html = renderSalesLog([sale({ notes: '<script>alert(document.cookie)</script>' })]);
  assert.ok(!html.includes('<script>alert(document.cookie)</script>'), `raw payload leaked into innerHTML: ${html}`);
  assert.ok(html.includes('&lt;script&gt;alert(document.cookie)&lt;/script&gt;'));
});

test('an ordinary staff name and notes render unchanged, with no double-escaping', () => {
  const html = renderSalesLog([sale({ staff: "O'Brien", notes: 'Ran low on drinks' })]);
  assert.ok(html.includes("O'Brien"));
  assert.ok(html.includes('Ran low on drinks'));
});

test('a blank notes field renders no notes block at all, same as before this fix', () => {
  const html = renderSalesLog([sale({ notes: '' })]);
  assert.ok(!html.includes('⚠️'));
});

test('multiple sales all get escaped, not just the first', () => {
  const html = renderSalesLog([
    sale({ id: 'sl1', staff: '<b>one</b>' }),
    sale({ id: 'sl2', staff: '<b>two</b>' }),
  ]);
  assert.ok(!html.includes('<b>one</b>') && !html.includes('<b>two</b>'), `raw payload leaked: ${html}`);
  assert.ok(html.includes('&lt;b&gt;one&lt;/b&gt;') && html.includes('&lt;b&gt;two&lt;/b&gt;'));
});
