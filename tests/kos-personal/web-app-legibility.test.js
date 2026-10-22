'use strict';
// kos-personal's web app (8_WebApp_UI.html), 2026-10-22. The operator: the
// UI "doesn't offer enough contrast to be easily legible", and "there is a
// lot of system jargon and terms that the user doesn't know". These pin
// the fix: colour tokens that clear WCAG contrast on every surface, no text
// under 12px, zoom allowed, plain words on screen, and a Terms panel that
// maps each plain word to the system's own name.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const UI = fs.readFileSync(path.join(KP, '8_WebApp_UI.html'), 'utf8');

function tokens() {
  const root = UI.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
  const out = {};
  for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) out[m[1]] = m[2];
  return out;
}
function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('every text colour clears 4.5:1 on every surface, and the main ones 7:1', () => {
  const t = tokens();
  const surfaces = ['bg', 'surface', 'surface2', 'amber-bg'];
  for (const fg of ['text', 'text2', 'text3', 'amber-text', 'amber-light', 'success', 'danger', 'warn']) {
    for (const bg of surfaces) {
      assert.ok(ratio(t[fg], t[bg]) >= 4.5, `--${fg} on --${bg}: ${ratio(t[fg], t[bg]).toFixed(2)}:1`);
    }
  }
  for (const fg of ['text', 'text2', 'amber-text']) {
    assert.ok(ratio(t[fg], t.surface2) >= 7, `--${fg} on --surface2: ${ratio(t[fg], t.surface2).toFixed(2)}:1`);
  }
  // A control's outline (inputs, buttons, tip icons) needs 3:1 (WCAG 1.4.11).
  for (const bg of ['bg', 'surface', 'surface2']) {
    assert.ok(ratio(t.border2, t[bg]) >= 3, `--border2 on --${bg}`);
  }
});

test('amber text uses --amber-text, not the darker --amber', () => {
  assert.doesNotMatch(UI, /(?<![-\w])color:\s*var\(--amber\)/);
  assert.doesNotMatch(UI, /style\.color\s*=\s*'var\(--amber\)'/);
});

test('no text is smaller than 12px, and the page can be zoomed', () => {
  const small = [...UI.matchAll(/font-size:\s*(\d+)px/g)].filter((m) => Number(m[1]) < 12);
  assert.deepEqual(small.map((m) => m[0]), []);
  assert.doesNotMatch(fs.readFileSync(path.join(KP, '7_WebApp.gs'), 'utf8'), /maximum-scale/);
});

// The labels a person reads: the markup without comments, the script block
// or tooltips (a tooltip names the system term on purpose: "Called the
// Turnstile in the sheets").
// Cut by plain string search, not a tag-matching regex: this reads one
// known file, and a regex HTML filter is the pattern code scanning flags.
function cutBetween(src, open, close) {
  let out = '';
  let i = 0;
  for (;;) {
    const a = src.indexOf(open, i);
    if (a < 0) return out + src.slice(i);
    out += src.slice(i, a);
    const b = src.indexOf(close, a + open.length);
    if (b < 0) return out;
    i = b + close.length;
  }
}
function scriptBody() {
  return UI.slice(UI.indexOf('<script>') + '<script>'.length, UI.lastIndexOf('</script>'));
}
function visibleMarkup() {
  let text = cutBetween(UI, '<script>', '</script>');
  text = cutBetween(text, '<style>', '</style>');
  text = cutBetween(text, '<!--', '-->');
  return cutBetween(text, 'title="', '"');
}

test('the screen uses plain words for the system\'s own terms', () => {
  const text = visibleMarkup();
  const banned = ['Cog Verdict', 'Council ID', 'Vector weights', 'Incubating themes', 'Ambient calibration',
    'Pin to Core', 'Sensor 2 webhook', 'Sensor 1 picks', 'Session Log', 'Build My Studio',
    'HEADLESS STUDIO', 'Admin Ghost', 'Necessary Struggle', 'Relational Targets',
    '>Ingest<', '>Diagnostics<', 'Curriculum auditing', 'Run full council review',
    'Send error digest', 'session starter'];
  for (const term of banned) assert.ok(!text.includes(term), 'still on screen: ' + term);
});

test('tooltips never cite a script file or a config constant', () => {
  const titles = [...UI.matchAll(/title="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(titles.length >= 8);
  for (const t of titles) {
    assert.doesNotMatch(t, /\.gs\b|CFG\.|SMP-\d|COG_REGISTRY/, t);
  }
  // The registrar tooltip is rewritten by script once its status loads.
  const script = scriptBody();
  const tip = script.match(/tip\.title = everCompleted([\s\S]*?);\n/)[1];
  assert.doesNotMatch(tip, /\.gs\b|pedagogical dissonance/);
});

// The helpers and the Terms list, run as the browser would run them.
function helpers() {
  const script = scriptBody();
  const start = script.indexOf('const QUESTION_LABELS');
  const end = script.indexOf('function openGlossary');
  const ctx = {};
  vm.runInNewContext(script.slice(start, end) + '\nthis.out = { plainQuestion, plainTopic, safeUrl_, GLOSSARY };', ctx);
  return ctx.out;
}

test('server names are shown in plain words, and unknown ones in sentence case', () => {
  const { plainQuestion, plainTopic, safeUrl_ } = helpers();
  assert.equal(plainQuestion('Admin Ghost'), 'Busywork to hand off');
  assert.equal(plainQuestion('Something new'), 'Something new');
  assert.equal(plainTopic('GAS_DEVELOPMENT'), 'Apps Script development');
  assert.equal(plainTopic('STUDENT_AGENCY'), 'Student agency');
  assert.equal(safeUrl_('https://docs.google.com/document/d/x'), 'https://docs.google.com/document/d/x');
  assert.equal(safeUrl_('javascript:alert(1)'), '#');
});

test('the Terms panel maps every renamed term to what the sheets and docs call it', () => {
  const { GLOSSARY } = helpers();
  const aka = GLOSSARY.map((g) => g[2]).join(' | ');
  for (const systemName of ['Turnstile', 'Sensor 1', 'Sensor 2', 'Shadow matrix', 'Vector weights',
    'Incubating themes', 'KOS_CORE_FACTS', 'Cog', 'Active Brain Trust', 'Seven Bridges', 'Council ID',
    'Stimulus doc', 'Daily primer', 'Registrar', 'Admin Ghost', 'Necessary Struggle', 'Relational Targets',
    'Triggers', 'Error digest', 'Studio flow', 'Session log']) {
    assert.ok(aka.includes(systemName), 'no Terms entry for ' + systemName);
  }
  for (const [term, what] of GLOSSARY) {
    assert.ok(term && what && what.length > 20, 'a real explanation for ' + term);
  }
  assert.match(UI, /<dialog id="glossary"[^>]*aria-labelledby="glossary-title"/);
  assert.match(UI, /id="btn-glossary" onclick="openGlossary\(\)"/);
});
