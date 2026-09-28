'use strict';
// Regression tests for leader-hub/Diagnostics.gs — the ?diag modes that
// stand in for DevTools, which district policy blocks on the devices
// LeaderHub runs on.
//
// What these pin, and why:
//   - The probe must find the page's script blocks exactly as a browser
//     does. A plain text search is wrong in both directions here: the head
//     has "<script>" inside an HTML comment, and a print template inside
//     block 1 builds a whole page as a JavaScript string.
//   - Instrumenting must change nothing but what it adds: strip the
//     bootstrap and markers and the original page comes back byte for byte.
//   - parts=N must serve exactly the first N blocks and leave every other
//     line of markup alone, or a bisection would be chasing a different page.
//   - The browser-side panel must work with nothing else on the page, since
//     it exists for when the app's own code is broken.
//   - It's owner-only, like the app.
// Most tests run against the real built student-leader-hub.html, so a
// build change that breaks the probe fails here, not live.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const APP_HTML = fs.readFileSync(path.join(LH, 'student-leader-hub.html'), 'utf8');
const FILES = [path.join(LH, 'Code.gs'), path.join(LH, 'EmailBridge.gs'), path.join(LH, 'Diagnostics.gs'),
  path.join(LH, 'DeployVersionMarker.gs')];
const EXPOSE = ['doGet', 'lhDiagScriptElements_', 'lhDiagInstrument_', 'lhDiagPing', 'lhDiagReport',
  '_lhDiagBootstrapJs_', 'lhDiagJsLiteral_', 'lhDiagRawSlice_', 'lhDiagBlockName_', 'lhDiagCountNames_'];
const OWNER = 'owner@ccpsnet.net';

function fakeHtmlService(fileContent) {
  const outputs = [];
  const make = (content) => {
    const o = {
      content: String(content), title: null,
      getContent() { return this.content; },
      setTitle(t) { this.title = t; return this; },
      setXFrameOptionsMode() { return this; },
    };
    outputs.push(o);
    return o;
  };
  return {
    outputs,
    service: {
      createHtmlOutput: make,
      createHtmlOutputFromFile: () => make(fileContent),
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    },
  };
}

function load(viewer, opts) {
  const o = opts || {};
  const html = fakeHtmlService(o.fileContent !== undefined ? o.fileContent : APP_HTML);
  const logs = [];
  const texts = [];
  const loaded = loadGasFiles(FILES, EXPOSE, {
    HtmlService: html.service,
    ContentService: {
      MimeType: { TEXT: 'TEXT' },
      createTextOutput(t) {
        const o = { content: String(t), mime: null, setMimeType(m) { this.mime = m; return this; } };
        texts.push(o);
        return o;
      },
    },
    Session: { getActiveUser() { return { getEmail() { return viewer; } }; } },
    console: { log: (m) => logs.push(m), warn() {}, error() {} },
  });
  if (o.owner !== null) {
    loaded.sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', o.owner || OWNER);
  }
  // doGet() returns an HtmlOutput-like object with methods, which the
  // harness's structuredClone-based cross-realm copy can't carry, so call
  // the sandbox's own function and read what it produced from `outputs`.
  const doGet = (e) => { loaded.sandbox.__exported.doGet(e); };
  return Object.assign(loaded, { outputs: html.outputs, texts, logs, doGet });
}

// Block names in page order, by plain string search for the data-lh-block
// attribute build.js writes. (No tag-matching regexes in this file: CodeQL
// reads any regex over "<script" as an HTML filter, and none of these
// filter anything.)
function markerNames(html) {
  const names = [];
  const attr = 'data-lh-block="';
  let pos = html.indexOf(attr);
  while (pos !== -1) {
    const from = pos + attr.length;
    const to = html.indexOf('"', from);
    names.push(html.slice(from, to));
    pos = html.indexOf(attr, to);
  }
  return names;
}
const between = (s, from, to) => {
  const a = s.indexOf(from);
  if (a === -1) return null;
  const b = s.indexOf(to, a + from.length);
  return b === -1 ? null : s.slice(a + from.length, b);
};

// ── finding the blocks ───────────────────────────────────────────────────

test('every named block in the real page is found, in order, with exact bounds', () => {
  const { exported } = load(OWNER);
  const blocks = exported.lhDiagScriptElements_(APP_HTML).filter((b) => b.name);
  assert.deepEqual(blocks.map((b) => b.name), markerNames(APP_HTML));
  assert.ok(blocks.length >= 2, 'the built page has named blocks');
  blocks.forEach((b) => {
    const el = APP_HTML.slice(b.start, b.end);
    assert.ok(el.toLowerCase().startsWith('<script'), b.name);
    assert.ok(el.toLowerCase().endsWith('</script>'), b.name);
  });
});

test('"<script" inside an HTML comment or a JavaScript string is not a block', () => {
  const { exported } = load(OWNER);
  const html = '<head><!-- a <script> tag here is just text --></head><body>' +
    '<script data-lh-block="a">var t = "<script>inner<\\/script>";</script>' +
    '<script src="x.js"></script></body>';
  const els = exported.lhDiagScriptElements_(html);
  assert.equal(els.length, 2);
  assert.equal(els[0].name, 'a');
  assert.equal(els[1].name, null, 'an unnamed script is found but carries no name');
});

// ── instrumenting ────────────────────────────────────────────────────────

let exportedLiteral = null;
function stripProbe(html, names) {
  const bootStart = html.indexOf('<script>(function (CFG)');
  const bootEnd = html.indexOf('</script>', bootStart) + '</script>'.length;
  let out = html.slice(0, bootStart) + html.slice(bootEnd);
  names.forEach((n) => {
    out = out.split('<script>window.__lhDiagRan && window.__lhDiagRan(' + exportedLiteral(n) + ')</script>').join('');
  });
  return out;
}

test('probing the full page adds only the bootstrap and one marker per block', () => {
  const { exported } = load(OWNER);
  const out = exported.lhDiagInstrument_(APP_HTML, null);
  const names = markerNames(APP_HTML);
  exportedLiteral = exported.lhDiagJsLiteral_;
  assert.equal(stripProbe(out, names), APP_HTML, 'removing what the probe added gives back the original');
  exported.lhDiagScriptElements_(APP_HTML).filter((b) => b.name).forEach((b) => {
    assert.ok(out.includes(APP_HTML.slice(b.start, b.end) + '<script>window.__lhDiagRan && window.__lhDiagRan(' +
      exported.lhDiagJsLiteral_(b.name) + ')</script>'), 'marker right after ' + b.name);
  });
});

test('the bootstrap is the first script on the page, inside <head>', () => {
  const { exported } = load(OWNER);
  const out = exported.lhDiagInstrument_(APP_HTML, null);
  const lower = out.toLowerCase();
  const firstScript = lower.indexOf('<script');
  assert.ok(out.slice(firstScript).startsWith('<script>(function (CFG)'));
  assert.ok(firstScript > lower.indexOf('<head'));
  assert.ok(firstScript < lower.indexOf('</head>'));
});

test('parts=N serves exactly the first N blocks and leaves all other markup alone', () => {
  const { exported } = load(OWNER);
  const names = markerNames(APP_HTML);
  const n = Math.min(5, names.length - 1);
  const out = exported.lhDiagInstrument_(APP_HTML, n);
  assert.deepEqual(markerNames(out), names.slice(0, n));
  names.slice(n).forEach((name) => assert.ok(out.includes('<!-- lh-diag: ' + name + ' not served')));
  // Unnamed scripts (the Google sign-in loader) are left in. The probe adds
  // its own unnamed ones, the bootstrap and one marker per served block,
  // so the count is exact. (Counted rather than matched on the loader's
  // URL: CodeQL reads a URL substring check as a weak host allowlist.)
  const unnamed = (h) => exported.lhDiagScriptElements_(h).filter((b) => !b.name).length;
  assert.equal(unnamed(out), unnamed(APP_HTML) + 1 + n);
  // Markup outside the scripts is still there.
  assert.ok(out.includes('<header'));
  assert.ok(out.includes('EMAIL BRIDGE MODAL'));
});

test('parts=0 serves no named block, and a count past the end serves them all', () => {
  const { exported } = load(OWNER);
  assert.deepEqual(markerNames(exported.lhDiagInstrument_(APP_HTML, 0)), []);
  assert.deepEqual(markerNames(exported.lhDiagInstrument_(APP_HTML, 999)), markerNames(APP_HTML));
});

test('a page the probe can\'t map is refused, not half-instrumented', () => {
  const { exported } = load(OWNER);
  // A block name only inside a comment: the counts disagree.
  const html = '<head></head><body><!-- <script data-lh-block="x"></script> --></body>';
  assert.throws(() => exported.lhDiagInstrument_(html, null), /layout changed/);
});

test('values written into generated script can\'t close the script element', () => {
  const { exported } = load(OWNER);
  const lit = exported.lhDiagJsLiteral_('a</script><script>alert(1)//\u2028');
  assert.ok(!lit.includes('<') && !lit.includes('>') && !lit.includes('/'));
  assert.ok(!lit.includes('\u2028'));
  // Still the same value once the browser parses it.
  assert.equal(vm.runInNewContext(lit), 'a</script><script>alert(1)//\u2028');
});

// ── the browser-side panel, run against a bare fake DOM ──────────────────

function runBootstrap(exported, expected, total, parts) {
  const listeners = {};
  const panel = { textContent: '', parentNode: null, setAttribute() {} };
  const documentElement = { appendChild(el) { el.parentNode = documentElement; } };
  const sandbox = {
    navigator: { userAgent: 'test' },
    document: {
      body: null, documentElement,
      createElement: () => panel,
      addEventListener: (ev, fn) => { listeners['doc:' + ev] = fn; },
    },
    Date,
    JSON,
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (ev, fn) => { listeners[ev] = fn; };
  sandbox.setTimeout = () => {};
  vm.createContext(sandbox);
  vm.runInContext(exported._lhDiagBootstrapJs_(expected, total, parts), sandbox);
  return { sandbox, panel, listeners };
}

test('panel: counts the blocks that ran and names the ones that didn\'t', () => {
  const { exported } = load(OWNER);
  const { sandbox, panel } = runBootstrap(exported, ['a.js', 'b.js', 'c.js'], 3, null);
  assert.equal(panel.parentNode !== null, true, 'visible before any app code runs');
  sandbox.__lhDiagRan('a.js');
  assert.match(panel.textContent, /Blocks ran: 1 of 3\s+NOT RUN: b\.js, c\.js/);
  sandbox.__lhDiagRan('b.js');
  sandbox.__lhDiagRan('c.js');
  assert.match(panel.textContent, /Blocks ran: 3 of 3\s+\(all\)/);
});

test('panel: shows script errors with file and line, and failed resource loads', () => {
  const { exported } = load(OWNER);
  const { sandbox, panel, listeners } = runBootstrap(exported, ['a.js'], 1, null);
  listeners.error({ message: 'Unexpected token', filename: 'leader-hub-block-1-part-3-of-15.js', lineno: 12, colno: 5, target: sandbox });
  listeners.error({ target: { src: 'https://accounts.google.com/gsi/client' } });
  assert.match(panel.textContent, /Errors: 2/);
  assert.match(panel.textContent, /Unexpected token @ leader-hub-block-1-part-3-of-15\.js:12:5/);
  assert.match(panel.textContent, /failed to load https:\/\/accounts\.google\.com\/gsi\/client/);
});

test('panel: says when only some blocks were served', () => {
  const { exported } = load(OWNER);
  const { panel } = runBootstrap(exported, ['a.js', 'b.js'], 16, 2);
  assert.match(panel.textContent, /first 2 of 16 blocks served/);
});

// ── doGet routing and the owner gate ─────────────────────────────────────

test('doGet without ?diag serves the app exactly as before', () => {
  const { doGet, outputs } = load(OWNER);
  doGet({ parameter: {} });
  assert.equal(outputs[outputs.length - 1].content, APP_HTML);
});

test('?diag=probe serves the instrumented app to the owner', () => {
  const { doGet, outputs } = load(OWNER);
  doGet({ parameter: { diag: 'probe', parts: '3' } });
  const served = outputs[outputs.length - 1];
  assert.equal(served.title, 'LeaderHub — diagnostic');
  assert.deepEqual(markerNames(served.content), markerNames(APP_HTML).slice(0, 3));
});

test('?diag=probe serves nothing of the app to anyone else', () => {
  const { doGet, outputs } = load('someone@ccpsnet.net');
  doGet({ parameter: { diag: 'probe' } });
  const served = outputs[outputs.length - 1];
  assert.ok(!served.content.includes('sourceURL'), 'no app code');
  assert.match(served.content, /signed in as <b>someone@ccpsnet\.net<\/b>/);
});

test('?diag=1 shows the owner the page facts and both server calls', () => {
  const { doGet, outputs, exported } = load(OWNER);
  doGet({ parameter: { diag: '1' } });
  const page = outputs[outputs.length - 1].content;
  assert.match(page, /App page size<\/th><td>\d+ characters/);
  assert.match(page, new RegExp('Named script blocks</th><td>' + markerNames(APP_HTML).length + ' '));
  assert.match(page, /lhDiagPing\(\)/);
  // One table row per script element, the served page's own layout.
  const elements = exported.lhDiagScriptElements_(APP_HTML).length;
  assert.equal((page.split('<table class="blocks">')[1].match(/<tr><td>/g) || []).length, elements);
  assert.match(page, new RegExp('All script elements</th><td>' + elements + '<'));
  assert.match(page, /lhGetAllConfig_\(\)/);
  // A private function missing from google.script.run is reported, not
  // left on "waiting" by a TypeError.
  assert.match(page, /typeof priv\.lhGetAllConfig_!=="function"/);
  assert.match(page, new RegExp('Block names in raw text</th><td>' + markerNames(APP_HTML).length + '<'));
  assert.match(page, /sourceURL comments in raw text<\/th><td>0 /);
  // The page's own script must at least parse.
  const js = between(page, '<script>', '</script>');
  assert.doesNotThrow(() => new vm.Script(js));
});

test('?diag=1 tells anyone else only who they are signed in as', () => {
  const { doGet, outputs } = load('someone@ccpsnet.net');
  doGet({ parameter: { diag: '1' } });
  const page = outputs[outputs.length - 1].content;
  assert.match(page, /someone@ccpsnet\.net/);
  assert.match(page, /You are the owner<\/th><td>no/);
  ['App page size', 'Deploy marker', '<script'].forEach((t) => assert.ok(!page.includes(t), t));
});

test('?diag=1 flags an unset OWNER_EMAIL', () => {
  const { doGet, outputs } = load(OWNER, { owner: null });
  doGet({ parameter: { diag: '1' } });
  assert.match(outputs[outputs.length - 1].content, /OWNER_EMAIL set<\/th><td>NO/);
});

// ── the two browser-callable functions ───────────────────────────────────

test('lhDiagReport logs the summary, capped', () => {
  const { exported, logs } = load(OWNER);
  assert.equal(exported.lhDiagReport('x'.repeat(50000)), true);
  assert.ok(logs[0].startsWith('[LH-DIAG] '));
  assert.ok(logs[0].length <= 20000 + '[LH-DIAG] '.length);
});

test('lhDiagPing returns only the caller\'s own address', () => {
  const { exported } = load('someone@ccpsnet.net');
  const r = exported.lhDiagPing();
  assert.equal(r.ok, true);
  assert.equal(r.you, 'someone@ccpsnet.net');
  assert.deepEqual(Object.keys(r).sort(), ['ok', 'server_time', 'you']);
});

// ── ?diag=raw and the block-endings view ─────────────────────────────────

test('?diag=raw gives the owner the page text as held, whole or a stretch', () => {
  const { doGet, texts } = load(OWNER);
  doGet({ parameter: { diag: 'raw' } });
  assert.equal(texts[0].content, APP_HTML);
  assert.equal(texts[0].mime, 'TEXT');
  doGet({ parameter: { diag: 'raw', from: '100', len: '50' } });
  assert.equal(texts[1].content, APP_HTML.slice(100, 150));
});

test('?diag=raw serves nothing of the app to anyone else', () => {
  const { doGet, texts, outputs } = load('someone@ccpsnet.net');
  doGet({ parameter: { diag: 'raw' } });
  assert.equal(texts.length, 0);
  assert.match(outputs[outputs.length - 1].content, /Not authorized/);
});

test('lhDiagRawSlice_ ignores values that are not plain numbers', () => {
  const { exported } = load(OWNER);
  assert.equal(exported.lhDiagRawSlice_('abcdef', 'x', '2'), 'abcdef');
  assert.equal(exported.lhDiagRawSlice_('abcdef', '2', ''), 'cdef');
  assert.equal(exported.lhDiagRawSlice_('abcdef', '1', '-3'), 'bcdef');
});

test('lhDiagBlockName_ reads the name from an opening tag, and only there', () => {
  const { exported } = load(OWNER);
  assert.equal(exported.lhDiagBlockName_('<script data-lh-block="leader-hub-block-0">'), 'leader-hub-block-0');
  assert.equal(exported.lhDiagBlockName_('<SCRIPT DATA-LH-BLOCK="b">'), 'b');
  assert.equal(exported.lhDiagBlockName_('<script>'), null);
  assert.equal(exported.lhDiagBlockName_('<script data-lh-block="">'), null);
  assert.equal(exported.lhDiagCountNames_('<script data-lh-block="a"></script><script data-lh-block="b">'), 2);
});

// Every block in the real page is named, so none depends on a
// "//# sourceURL=" comment, which HtmlService strips and which then took
// the closing tag with it.
test('the built page names every inline script by attribute and has no sourceURL comments', () => {
  const { exported } = load(OWNER);
  assert.ok(!APP_HTML.includes('//# sourceURL='));
  const inline = exported.lhDiagScriptElements_(APP_HTML)
    .filter((b) => !APP_HTML.slice(b.start, APP_HTML.indexOf('>', b.start)).includes(' src='));
  assert.ok(inline.length >= 2);
  inline.forEach((b) => assert.ok(b.name, 'unnamed inline script at ' + b.start));
});
