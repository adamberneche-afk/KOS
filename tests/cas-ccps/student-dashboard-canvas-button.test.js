'use strict';
// The Canvas button (2026-11-15, the operator's ask): the Student Dashboard's
// header has "Canvas ↗" beside Refresh, and a ready turn-in code has "Open
// Canvas ↗" beside Copy, both opening Canvas in a new tab. Pins: the
// district's Canvas by default; CANVAS_URL (Script Property) changes it;
// anything but a plain https URL falls back to the default; the links open a
// new tab with rel="noopener" and say so to a screen reader; the demo shows
// them too.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '00b_ScriptOwnerGuard.js', '13_StudentDashboard.js', '13b_StudentDashboardDemoLessons.js',
  '13c_StudentDashboardLessons.js', '13d_StudentDashboardReview.js', '63_DocHeader.js', '71_TurnInCodes.js',
  '71b_TurnInStudent.js', '75_FormReader.js', '77_SlidesReader.js', '78_SheetReader.js'].map(S);
const DEFAULT = 'https://ccps.instructure.com';

function html(prop, opts = {}) {
  const { exported, sandbox } = loadGasFiles(FILES, ['buildStudentDashboardHtml_', 'dashCanvasUrl_']);
  if (prop !== undefined) sandbox.PropertiesService.getScriptProperties().setProperty('CANVAS_URL', prop);
  return { page: exported.buildStudentDashboardHtml_({ demo: !!opts.demo }), url: exported.dashCanvasUrl_() };
}

function headerLink(page) {
  const m = page.match(/<a id="canvas-btn"[^>]*>/);
  assert.ok(m, 'the header has the Canvas link');
  return m[0];
}

test('the header links to the district Canvas in a new tab, beside Refresh', () => {
  const { page, url } = html();
  assert.equal(url, DEFAULT);
  const a = headerLink(page);
  assert.match(a, new RegExp('href="' + DEFAULT.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '"'));
  assert.match(a, /target="_blank"/);
  assert.match(a, /rel="noopener"/);
  assert.ok(page.indexOf('id="refresh-btn"') < page.indexOf('id="canvas-btn"'), 'it sits after Refresh');
  assert.match(page, /id="canvas-btn"[^>]*>Canvas <span aria-hidden="true">↗<\/span><span class="wu-sr"> \(opens in a new tab\)<\/span><\/a>/);
});

test('CANVAS_URL changes it; anything but a plain https URL falls back', () => {
  assert.equal(html('https://example.instructure.com/courses/12').url, 'https://example.instructure.com/courses/12');
  for (const bad of ['http://ccps.instructure.com', 'javascript:alert(1)', 'https://x.com/"onmouseover="a', 'https://a b', '<https://x>', '']) {
    assert.equal(html(bad).url, DEFAULT, bad);
  }
});

test('the demo page shows it too', () => {
  headerLink(html(undefined, { demo: true }).page);
});

test('a ready turn-in code has Open Canvas beside Copy; other states do not', () => {
  const { page } = html();
  const ctx = {
    document: { getElementById: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, addEventListener() {} }),
      querySelectorAll: () => [], createElement: () => ({ style: {} }), addEventListener() {}, visibilityState: 'visible' },
    google: { script: { run: new Proxy({}, { get: (_, n) => (n === 'withSuccessHandler' || n === 'withFailureHandler'
      ? function () { return this; } : function () {}) }) } }, console, navigator: {}, setTimeout() {}, clearTimeout() {}, setInterval() {},
    addEventListener() {}, scrollTo() {}, scrollY: 0,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(page).forEach((code) => vm.runInContext(code, ctx));
  assert.equal(vm.runInContext('CANVAS_URL', ctx), DEFAULT);
  const ready = ctx.turnInCardHtml({ configId: 'A1', turnIn: { state: 'READY', code: 'CAS-8177-L05-7Q4K-M2XD' } });
  const m = ready.match(/<a class="act act-secondary ti-canvas"[^>]*>Open Canvas ↗<span class="wu-sr"> \(opens in a new tab\)<\/span><\/a>/);
  assert.ok(m, 'Open Canvas is on the ready card');
  assert.match(m[0], /href="https:\/\/ccps\.instructure\.com" target="_blank" rel="noopener"/);
  assert.ok(ready.indexOf('ti-copy') < ready.indexOf('ti-canvas'), 'after Copy');
  const pending = ctx.turnInCardHtml({ configId: 'A1', turnIn: { state: 'PENDING_CHECK' } });
  assert.doesNotMatch(pending, /ti-canvas/);
});
