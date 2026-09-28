'use strict';
// Regression tests for tools/leaderhub-build/order-declarations.js, and for
// what it exists to guarantee: splitting LeaderHub's one big script into
// several <script> tags doesn't change what runs at page load.
//
// Why: in one script, every top-level function declaration and var exists
// before any statement runs. Split into tags, each exists only once its own
// tag has run. Live on 2026-09-28, ?diag=probe showed
// "_lpHasUnsavedChanges is not defined": a line in the second tag named a
// function declared several tags later, and the rest of that tag's
// load-time code never ran.
//
// The last test runs the real built page's tags one after another in one
// shared vm context, which is how separate classic <script> tags share
// globals, with permissive stand-ins for the browser. The browser
// stand-ins can't be perfect, so the test only fails on the bug class
// itself: a ReferenceError for a name the page declares at top level.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { orderDeclarations, isFunctionDeclaration, varNames } = require('../../tools/leaderhub-build/order-declarations.js');
const { splitScript } = require('../../tools/leaderhub-build/split-script.js');
const { tokenize } = require('../../tools/leaderhub-build/js-lexer.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const real = (src) => tokenize(src).filter((t) => t.type !== 'ws' && t.type !== 'comment-line' && t.type !== 'comment-block');

// Runs each chunk as its own script in one shared context. Returns the
// errors, one per chunk that threw.
function runAsSeparateTags(chunks, globals) {
  const ctx = vm.createContext(Object.assign({}, globals));
  const errors = [];
  chunks.forEach((c, i) => {
    try { vm.runInContext(c, ctx, { filename: 'chunk' + i }); } catch (e) { errors.push({ chunk: i, error: e }); }
  });
  return { ctx, errors };
}

test('isFunctionDeclaration accepts only a whole named function declaration', () => {
  assert.ok(isFunctionDeclaration(real('function f(a,b){return a}')));
  assert.ok(isFunctionDeclaration(real('async function f(){await x}')));
  assert.ok(isFunctionDeclaration(real('function* g(){yield 1}')));
  assert.ok(isFunctionDeclaration(real('function f(a={x:1},[b]=[]){if(a){}}')));
  assert.ok(!isFunctionDeclaration(real('function f(){}\n[1].forEach(g)')), 'ASI-joined statement stays put');
  assert.ok(!isFunctionDeclaration(real('var f=function(){};')));
  assert.ok(!isFunctionDeclaration(real('if(x){function f(){}}')));
  assert.ok(!isFunctionDeclaration(real('(function(){})();')));
});

test('varNames lists every top-level var name, and nothing nested', () => {
  assert.deepEqual(varNames(real('var a=1,b=[1,2],c;')), ['a', 'b', 'c']);
  assert.deepEqual(varNames(real('var a=f(1,2),b={x:1,y:2};')), ['a', 'b']);
  assert.deepEqual(varNames(real('x.var=1;foo(1,2);')), []);
  assert.throws(() => varNames(real('var {a,b}=o;')), /destructuring/);
});

test('functions and var names move ahead of every other statement; nothing else moves', () => {
  const src = 'var a=f();function f(){return b}var b=2;g();function g(){}';
  const r = orderDeclarations(src);
  assert.equal(r.source, 'var a,b;\nfunction f(){return b}function g(){}var a=f();var b=2;g();');
  assert.deepEqual([r.functions, r.statements, r.vars], [2, 3, 2]);
});

test('a later duplicate function still wins, as in one script', () => {
  const src = 'var out=f();function f(){return 1}function f(){return 2}';
  const { ctx } = runAsSeparateTags([orderDeclarations(src).source], {});
  assert.equal(ctx.out, 2);
  const one = vm.createContext({});
  vm.runInContext(src, one);
  assert.equal(one.out, 2);
});

test('the live bug in miniature: split without reordering throws, with reordering matches one script', () => {
  // Padding makes the splitter cut between the use and the declaration.
  const pad = 'var pad="' + 'x'.repeat(200) + '";';
  const src = 'var checks=[later];' + pad + 'var early=typeof undeclaredYet;' + pad +
    'function later(){return 1}' + pad + 'var undeclaredYet=5;';
  const one = vm.createContext({});
  vm.runInContext(src, one);
  assert.equal(one.checks[0](), 1);
  assert.equal(one.early, 'undefined');

  const naive = runAsSeparateTags(splitScript(src, 240), {});
  assert.ok(naive.errors.some((e) => /later is not defined/.test(e.error.message)), 'the naive split reproduces the bug');

  const ordered = runAsSeparateTags(splitScript(orderDeclarations(src).source, 240), {});
  assert.deepEqual(ordered.errors, []);
  assert.equal(ordered.ctx.checks[0](), 1);
  assert.equal(ordered.ctx.early, 'undefined');
});

// A value that answers every property read, call and construction with
// another one like itself, so app code touching the DOM runs on.
function stub() {
  const f = function () {};
  return new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then' || typeof k === 'symbol') return undefined;
      if (k === 'length') return 0;
      return stub();
    },
    apply() { return stub(); },
    construct() { return stub(); },
    set() { return true; },
  });
}

function browserStandIns() {
  const noop = () => {};
  const store = { getItem: () => null, setItem: noop, removeItem: noop, key: () => null, length: 0 };
  const g = {
    console: { log: noop, warn: noop, error: noop, info: noop },
    setTimeout: () => 1, setInterval: () => 1, clearTimeout: noop, clearInterval: noop,
    requestAnimationFrame: noop, queueMicrotask: noop,
    document: stub(), navigator: stub(), location: stub(), history: stub(), google: stub(), URL: stub(),
    localStorage: store, sessionStorage: store,
    fetch: () => new Promise(noop), alert: noop, confirm: () => false, prompt: () => null,
    MutationObserver: function () { return stub(); }, IntersectionObserver: function () { return stub(); },
    ResizeObserver: function () { return stub(); }, FileReader: function () { return stub(); },
    Image: function () { return stub(); }, Event: function () {}, CustomEvent: function () {},
    Blob: function () {}, HTMLElement: function () {}, Node: function () {},
    getComputedStyle: () => stub(), matchMedia: () => stub(), performance: { now: () => 0 },
    crypto: { randomUUID: () => 'id', getRandomValues: (a) => a },
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    scrollTo: noop, open: () => stub(), print: noop, atob: (s) => s, btoa: (s) => s, structuredClone: (x) => x,
  };
  return g;
}

test('the built page\'s split script runs at load with nothing named before it exists', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'leader-hub', 'student-leader-hub.html'), 'utf8');
  // The big block's tags, in order, by the name build.js writes on each.
  const chunks = [];
  const attr = 'data-lh-block="leader-hub-block-1-part-';
  let pos = html.indexOf(attr);
  while (pos !== -1) {
    const bodyStart = html.indexOf('>', pos) + 1;
    const bodyEnd = html.indexOf('</script>', bodyStart);
    chunks.push(html.slice(bodyStart, bodyEnd));
    pos = html.indexOf(attr, bodyEnd);
  }
  assert.ok(chunks.length >= 2, 'the big block is split');

  // Everything the block declares at top level.
  const declared = new Set();
  const whole = chunks.join('');
  const pre = /^var ([^;]+);/.exec(whole);
  assert.ok(pre, 'the reordered block opens with its var list');
  pre[1].split(',').forEach((n) => declared.add(n));
  (whole.match(/(?:^|[;}\n])\s*(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/g) || [])
    .forEach((m) => declared.add(m.replace(/^[\s\S]*function\*?\s+/, '')));

  const g = browserStandIns();
  g.window = g; g.self = g;
  const { errors } = runAsSeparateTags(chunks, g);
  const early = errors.filter((e) => e.error.name === 'ReferenceError' &&
    declared.has(String(e.error.message).split(' ')[0]));
  assert.deepEqual(early.map((e) => `chunk ${e.chunk}: ${e.error.message}`), []);
});
