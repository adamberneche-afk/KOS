'use strict';
// The Teacher Dashboard header's More ▾ menu (2026-11-08, UX audit Teacher
// row "Header"). The header keeps the daily loop (Student Context, Turn-in
// codes, + Log today's lesson), Refresh and the year menu; the rest is in a
// menu button. These tests read the served markup and drive the menu's own
// code in a small fake DOM that dispatches events with capture and bubble,
// enough for its click, keydown and focus behaviour.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const FILES = [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '07_TeacherDashboard.js')];
const DEMO = 'https://script.google.com/macros/s/AKfyDEMO/exec';

function html(cfg) {
  const { exported } = loadGasFiles(FILES, ['buildDashboardHtml_']);
  return exported.buildDashboardHtml_(cfg || { studentDashboardUrl: DEMO });
}

function headerOf(page) {
  return page.slice(page.indexOf('<header>'), page.indexOf('</header>'));
}

// The menu's markup: from its <div> to the end of the More wrapper.
function menuOf(header) {
  const start = header.indexOf('<div id="more-menu"');
  return header.slice(start, header.indexOf('<button id="refresh-btn"', start));
}

// Each control in the header: [tag, id, attributes string], in order.
function controls(header) {
  const out = [];
  const re = /<(button|a|select) id="([^"]+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(header))) out.push([m[1], m[2], m[3]]);
  return out;
}

const MENU = ['parent-report-btn', 'scr-review-btn', 'lesson-schedule-btn', 'settings-btn', 'demo-student-btn', 'cas-terms-btn'];
const HANDLERS = {
  'parent-report-btn': 'openParentReportModal()',
  'scr-review-btn': 'openScrReviewModal()',
  'lesson-schedule-btn': 'openLessonScheduleModal()',
  'settings-btn': 'openSettingsModal()',
  'cas-terms-btn': 'casOpenTerms()',
};

test('the header keeps the daily buttons, Refresh and the year menu; the rest is under More ▾', () => {
  const header = headerOf(html());
  const menu = menuOf(header);
  const outside = header.replace(menu, '');
  const visible = controls(outside).map((c) => c[1]);
  assert.deepEqual(visible, ['new-lesson-btn', 'context-tab-btn', 'turnin-btn', 'more-btn', 'refresh-btn', 'term-filter']);
  assert.deepEqual(controls(menu).map((c) => c[1]), MENU);
});

test('More ▾ is a menu button and each item a menuitem out of the Tab order', () => {
  const header = headerOf(html());
  assert.match(header, /<button id="more-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="more-menu">More <span aria-hidden="true">▾<\/span><\/button>/);
  assert.match(header, /<div id="more-menu" role="menu" aria-labelledby="more-btn" hidden>/);
  const menu = menuOf(header);
  for (const [, id, attrs] of controls(menu)) {
    assert.match(attrs, /role="menuitem"/, id);
    assert.match(attrs, /tabindex="-1"/, id);
  }
  // Emoji are decorative; each item has a text label.
  for (const label of ['Parent Reports', 'Competency ratings', 'Lessons', 'Settings', 'View as a student', 'Terms']) {
    assert.match(menu, new RegExp('<span aria-hidden="true">[^<]+</span> ' + label + '</(button|a)>'), label);
  }
});

test('each menu item keeps its old handler, and the handler exists in the page', () => {
  const page = html();
  const header = headerOf(page);
  const code = extractInlineScripts(page).join('\n');
  for (const [id, call] of Object.entries(HANDLERS)) {
    const attrs = controls(header).find((c) => c[1] === id)[2];
    assert.ok(attrs.includes('onclick="' + call + '"'), id + ' calls ' + call);
    const fn = call.replace('()', '');
    assert.match(code, new RegExp('function ' + fn + '\\('), fn + ' is defined');
  }
  // Terms and Turn-in codes still say they open a dialog.
  assert.match(header, /id="cas-terms-btn"[^>]*aria-haspopup="dialog"/);
  assert.match(header, /id="turnin-btn"[^>]*aria-haspopup="dialog"/);
});

test('View as a student keeps its URL and opens in a new tab; unset, it still says what to set', () => {
  const header = headerOf(html());
  assert.ok(header.includes('<a id="demo-student-btn" role="menuitem" tabindex="-1" href="' + DEMO + '?demo=1" target="_blank" rel="noopener"'));
  const unset = headerOf(html({ studentDashboardUrl: '' }));
  assert.match(unset, /<button id="demo-student-btn" type="button" role="menuitem" tabindex="-1" onclick="alert\('The Student Dashboard URL is not set\. Set STUDENT_DASHBOARD_URL/);
});

test('menu items are 44px tall on a touch screen, and the phone header is tighter', () => {
  const page = html();
  assert.match(page, /@media \(pointer: coarse\)\{header button,header select,header \[role="menuitem"\]\{min-height:44px !important\}\}/);
  assert.match(page, /#more-menu\[hidden\]\{display:none\}/);
  assert.match(page, /@media \(max-width:600px\)\{\s*header\{padding:10px 12px;gap:8px\}/);
});

// ── Driving the menu ───────────────────────────────────────────────────────

function fakePage() {
  const els = {};
  const docListeners = {};
  const doc = {
    activeElement: null,
    getElementById: (id) => els[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => el('x' + Math.random()),
    addEventListener: (type, fn, capture) => { (docListeners[type] = docListeners[type] || []).push({ fn, capture: !!capture }); },
    removeEventListener() {},
  };
  function el(id, opts) {
    opts = opts || {};
    const classes = new Set();
    const listeners = {};
    const node = {
      id, tagName: opts.tag || 'BUTTON', parent: opts.parent || null, children: [], style: {}, value: '', innerHTML: '',
      textContent: '', options: [], attrs: Object.assign({}, opts.attrs || {}), hidden: !!opts.hidden, disabled: false,
      offsetParent: {}, listeners, clicks: 0,
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      addEventListener(type, fn, capture) { (listeners[type] = listeners[type] || []).push({ fn, capture: !!capture }); },
      removeEventListener() {}, appendChild() {}, remove() {},
      focus() { doc.activeElement = this; },
      click() { this.clicks++; },
      contains(other) { for (let n = other; n; n = n.parent) if (n === this) return true; return false; },
      closest(sel) {
        for (let n = this; n; n = n.parent) {
          if (sel === '[role="menuitem"]' && n.attrs.role === 'menuitem') return n;
          if (sel === '#more-menu' && n.id === 'more-menu') return n;
          if (sel === 'header' && n.tagName === 'HEADER') return n;
        }
        return null;
      },
      querySelector: () => null,
      querySelectorAll(sel) {
        const all = [];
        (function walk(n) { n.children.forEach((c) => { all.push(c); walk(c); }); })(this);
        if (sel === '[role="menuitem"]') return all.filter((n) => n.attrs.role === 'menuitem');
        if (sel === 'button, select, a[href]') return all.filter((n) => n.tagName === 'BUTTON' || n.tagName === 'SELECT' || (n.tagName === 'A' && n.attrs.href));
        return [];
      },
      matches: () => false,
      getBoundingClientRect: () => ({ left: 100, right: 330, top: 0, bottom: 0 }),
    };
    if (node.parent) node.parent.children.push(node);
    els[id] = node;
    return node;
  }
  // The event path: target up to the document, capture then bubble.
  function dispatch(target, type, props) {
    let stopped = false;
    let prevented = false;
    const e = Object.assign({ type, target, shiftKey: false, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } }, props || {});
    const path = [];
    for (let n = target; n; n = n.parent) path.push(n);
    const run = (list, capture) => (list || []).filter((l) => l.capture === capture).forEach((l) => { if (!stopped) l.fn(e); });
    for (let i = path.length - 1; i >= 0 && !stopped; i--) run(path[i].listeners[type], true);
    for (let i = 0; i < path.length && !stopped; i++) run(path[i].listeners[type], false);
    if (!stopped) run(docListeners[type], false);
    if (type === 'click' && target.onclickCall) target.onclickCall();
    return { prevented };
  }
  doc.body = el('body', { tag: 'BODY' });
  const header = el('header', { tag: 'HEADER' });
  el('context-tab-btn', { parent: header });
  el('turnin-btn', { parent: header });
  const wrap = el('hdr-more', { tag: 'DIV', parent: header });
  el('more-btn', { parent: wrap, attrs: { 'aria-expanded': 'false' } });
  const menu = el('more-menu', { tag: 'DIV', parent: wrap, hidden: true, attrs: { role: 'menu' } });
  MENU.forEach((id) => el(id, { parent: menu, tag: id === 'demo-student-btn' ? 'A' : 'BUTTON', attrs: { role: 'menuitem', tabindex: '-1', href: id === 'demo-student-btn' ? DEMO + '?demo=1' : undefined } }));
  el('refresh-btn', { parent: header });
  el('term-filter', { parent: header, tag: 'SELECT' });
  ['main', 'loading', 'discard-confirm-backdrop', 'modal-backdrop', 'settings-modal-backdrop', 'settings-modal-body'].forEach((id) => el(id, { tag: 'DIV' }));
  const outside = el('outside', { tag: 'DIV' });

  const chain = () => new Proxy({}, { get: (_, n) => (n === 'withSuccessHandler' || n === 'withFailureHandler') ? () => chain() : () => {} });
  const ctx = vm.createContext({
    document: doc, window: { addEventListener() {}, open() {}, confirm: () => true }, console, setTimeout, clearTimeout, Intl, Date,
    google: { script: { get run() { return chain(); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  const code = extractInlineScripts(html()).find((c) => c.includes('function openMoreMenu'));
  new vm.Script(code).runInContext(ctx);
  const state = () => ({ expanded: els['more-btn'].getAttribute('aria-expanded'), hidden: els['more-menu'].hidden, focus: doc.activeElement && doc.activeElement.id });
  const key = (k, extra) => dispatch(doc.activeElement, 'keydown', Object.assign({ key: k }, extra || {}));
  return { ctx, doc, els, dispatch, key, state, outside };
}

test('click on More opens the menu on its first item; a second click closes it and keeps focus on More', () => {
  const p = fakePage();
  p.els['more-btn'].focus();
  p.dispatch(p.els['more-btn'], 'click');
  assert.deepEqual(p.state(), { expanded: 'true', hidden: false, focus: 'parent-report-btn' });
  assert.equal(p.els['parent-report-btn'].getAttribute('tabindex'), '0');
  assert.equal(p.els['scr-review-btn'].getAttribute('tabindex'), '-1');
  p.dispatch(p.els['more-btn'], 'click');
  assert.deepEqual(p.state(), { expanded: 'false', hidden: true, focus: 'more-btn' });
});

test('Enter, Space and ArrowDown open on the first item, ArrowUp on the last; Enter and Space stop the native click', () => {
  for (const [k, first] of [['Enter', 'parent-report-btn'], [' ', 'parent-report-btn'], ['ArrowDown', 'parent-report-btn'], ['ArrowUp', 'cas-terms-btn']]) {
    const p = fakePage();
    p.els['more-btn'].focus();
    const r = p.key(k);
    assert.ok(r.prevented, k + ' is handled');
    assert.deepEqual(p.state(), { expanded: 'true', hidden: false, focus: first }, k);
  }
});

test('arrows wrap, Home and End jump, and only the focused item is tabbable', () => {
  const p = fakePage();
  p.els['more-btn'].focus();
  p.key('ArrowDown');
  p.key('ArrowDown');
  assert.equal(p.state().focus, 'scr-review-btn');
  p.key('End');
  assert.equal(p.state().focus, 'cas-terms-btn');
  p.key('ArrowDown');
  assert.equal(p.state().focus, 'parent-report-btn');
  p.key('ArrowUp');
  assert.equal(p.state().focus, 'cas-terms-btn');
  p.key('Home');
  assert.equal(p.state().focus, 'parent-report-btn');
  assert.deepEqual(MENU.map((id) => p.els[id].getAttribute('tabindex')), ['0', '-1', '-1', '-1', '-1', '-1']);
});

test('Escape closes the menu, returns focus to More, and does not reach the page\'s panel Escape', () => {
  const p = fakePage();
  // _panelStack is a top-level const of the page's script.
  vm.runInContext('_panelStack.push({ id: "x", close: function () { globalThis.panelEscape = (globalThis.panelEscape || 0) + 1; } })', p.ctx);
  p.els['more-btn'].focus();
  p.key('ArrowDown');
  p.key('Escape');
  assert.deepEqual(p.state(), { expanded: 'false', hidden: true, focus: 'more-btn' });
  assert.equal(p.ctx.panelEscape, undefined);
});

test('Tab closes the menu and moves to the next header control; Shift+Tab to the one before', () => {
  const p = fakePage();
  p.els['refresh-btn'].disabled = false; // loadData() disabled it at load
  p.els['more-btn'].focus();
  p.key('ArrowDown');
  p.key('Tab');
  assert.deepEqual(p.state(), { expanded: 'false', hidden: true, focus: 'refresh-btn' });
  p.els['refresh-btn'].disabled = true; // while loading
  p.els['more-btn'].focus();
  p.key('ArrowDown');
  p.key('Tab');
  assert.equal(p.state().focus, 'term-filter');
  p.els['more-btn'].focus();
  p.key('ArrowDown');
  p.key('Tab', { shiftKey: true });
  assert.deepEqual(p.state(), { expanded: 'false', hidden: true, focus: 'turnin-btn' });
});

test('a click outside closes the menu; focus goes back to More only if it was in the menu', () => {
  const p = fakePage();
  p.els['more-btn'].focus();
  p.key('ArrowDown');
  p.dispatch(p.outside, 'click');
  assert.deepEqual(p.state(), { expanded: 'false', hidden: true, focus: 'more-btn' });
  p.dispatch(p.els['more-btn'], 'click');
  p.els['term-filter'].focus(); // the click landed in a field
  p.dispatch(p.outside, 'click');
  assert.deepEqual(p.state(), { expanded: 'false', hidden: true, focus: 'term-filter' });
  // A click inside the menu's wrapper doesn't count as outside.
  p.els['more-btn'].focus();
  p.key('ArrowDown');
  p.dispatch(p.els['more-menu'], 'click');
  assert.equal(p.state().expanded, 'true');
});

test('choosing an item closes the menu and puts focus on More before its own handler runs', () => {
  const p = fakePage();
  let focusWhenHandled = null;
  p.els['settings-btn'].onclickCall = () => { focusWhenHandled = p.doc.activeElement.id; };
  p.els['more-btn'].focus();
  p.key('ArrowDown');
  p.key('End');
  p.key('ArrowUp');
  p.key('ArrowUp');
  assert.equal(p.state().focus, 'settings-btn');
  p.dispatch(p.els['settings-btn'], 'click');
  assert.equal(focusWhenHandled, 'more-btn', 'a panel opened from it returns focus to More');
  assert.deepEqual(p.state(), { expanded: 'false', hidden: true, focus: 'more-btn' });
});

test('Space on View as a student follows the link (an <a> does not on its own)', () => {
  const p = fakePage();
  p.els['more-btn'].focus();
  p.key('ArrowUp');
  p.key('ArrowUp');
  assert.equal(p.state().focus, 'demo-student-btn');
  const r = p.key(' ');
  assert.ok(r.prevented);
  assert.equal(p.els['demo-student-btn'].clicks, 1);
});
