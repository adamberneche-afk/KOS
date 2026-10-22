'use strict';
// leader-hub's page, 2026-10-22. The operator: "there is a lot of system
// jargon and terms that the user doesn't know", and the UI must have
// enough contrast to be easily legible. These pin the fix, in the same
// shape as tests/kos-personal/web-app-legibility.test.js and
// tests/cas-ccps/dashboard-plain-words.test.js: text colours that clear
// WCAG AA, no on-screen text under 12px, plain words for the system's own
// terms, and a Terms panel that maps each plain word to the system's name.
// Everything is read from the built page (leader-hub/student-leader-hub.html),
// which tests/tools/leaderhub-build.test.js keeps in step with src/.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const PAGE = fs.readFileSync(path.join(LH, 'student-leader-hub.html'), 'utf8');
const SRC = (f) => fs.readFileSync(path.join(LH, 'src', f), 'utf8');

function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function tokens() {
  const root = SRC('01-styles.html').match(/:root\s*\{([\s\S]*?)\n\}/)[1];
  const out = {};
  for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) out[m[1]] = m[2];
  return out;
}
const aa = (fg, bg, msg) => assert.ok(ratio(fg, bg) >= 4.5, `${msg || fg + ' on ' + bg}: ${ratio(fg, bg).toFixed(2)}:1`);

test('the text tokens clear 4.5:1 on white, the page and their own tints', () => {
  const t = tokens();
  for (const fg of ['ink', 'muted', 'red', 'green', 'blue', 'orange', 'purple', 'navy']) {
    for (const bg of ['surface', 'paper', 'muted-light']) aa(t[fg], t[bg], `--${fg} on --${bg}`);
  }
  aa(t.red, t['red-light'], '--red on --red-light');
  aa(t.green, t['green-light'], '--green on --green-light');
  aa(t.blue, t['blue-light'], '--blue on --blue-light');
  aa(t.muted, t['navy-soft'], '--muted on --navy-soft');
  // White text sits on these fills (buttons, badges).
  for (const fill of ['red', 'green', 'navy', 'orange']) aa('#ffffff', t[fill], `white on --${fill}`);
  aa(t.gold, t.navy, '--gold on --navy');
  // Before: --muted #64748b (4.34:1 on --muted-light), --red #dc2626 (4.41:1
  // on --red-light), --green #16a34a (3.30:1 on white).
  assert.equal(t.muted, '#475569');
  assert.equal(t.red, '#b91c1c');
  assert.equal(t.green, '#15803d');
});

test('the shades that failed the audit are gone from the page', () => {
  // #9ca3af grey text (2.3–3.95:1), #d1d5db delete icons (1.47:1), the gold
  // #ca8a04 ALTERNATIVE label (2.94:1), white on #d97706 badges (3.19:1),
  // #16a34a / #22c55e greens, #dc2626 red on its tint, and #64748b on tints.
  for (const hex of ['#9ca3af', '#d1d5db', '#ca8a04', '#d97706', '#16a34a', '#22c55e', '#dc2626', '#64748b', '#f59e0b']) {
    assert.ok(!new RegExp(hex + '\\b', 'i').test(PAGE), 'still uses ' + hex);
  }
  // Their replacements, checked where they are read.
  aa('#4b5563', '#fef2f2', 'grey hint text on the red tint');
  aa('#4b5563', '#f0fdf4', 'grey hint text on the green tint');
  aa('#b91c1c', '#fee2e2', 'red ✕ on its tint');
  aa('#a16207', '#ffffff', 'the ALTERNATIVE label');
  aa('#a16207', '#fefce8', 'amber text on the yellow tint');
  aa('#ffffff', '#b45309', 'white on the amber badges');
  aa('#ffffff', '#15803d', 'white on the green badges');
  // The period pill is white on its block colour; gold on them was 2.7–3.1:1.
  const pill = SRC('10-command-engine-ai-and-widgets.html');
  assert.match(pill, /pEl\.style\.color = info\.block && colors\[info\.block\] \? '#fff' : 'var\(--gold\)';/);
  const colors = pill.match(/const colors = \{ 1:'(#\w+)', 2:'(#\w+)', 3:'(#\w+)', 4:'(#\w+)' \};/).slice(1);
  for (const c of colors) aa('#ffffff', c, 'white period pill on ' + c);
});

test('delete ✕ icons are red, and a deadline row\'s icons use the row\'s own text colour', () => {
  const src = SRC('10-command-engine-ai-and-widgets.html');
  assert.match(src, /horizonDelete\([^)]*\)" aria-label="Delete this item" style="background:none;border:none;color:#b91c1c;/);
  assert.match(src, /deleteDeadline\('\$\{escJsAttr\(dl\.id\)\}'\)" style="background:none;border:none;color:\$\{u\.text\};/);
  // Each urgency's text colour on its row colour.
  for (const m of src.matchAll(/return\s+\{bg:'(#\w+)',text:'(#\w+)'/g)) aa(m[2], m[1], `deadline row ${m[2]} on ${m[1]}`);
  // The DECA season card's row labels inherit the card's text colour, not
  // --muted (3.37:1 on the navy card, 2.1:1 once --muted darkened).
  assert.match(SRC('07-events-email-members-goals.html'), /<span style="color:inherit;opacity:\.8;min-width:160px;flex-shrink:0">\$\{label\}<\/span>/);
});

test('white text on dark panels is at least 75% opaque', () => {
  for (const m of PAGE.matchAll(/(?<![-\w])color:\s*rgba\(255,\s*255,\s*255,\s*(0?\.\d+)\)/g)) {
    assert.ok(Number(m[1]) >= 0.75, m[0]);
  }
});

test('no on-screen text is under 12px, and Bebas Neue never falls back to a cursive font', () => {
  const small = [...PAGE.matchAll(/font-size:\s*(\d*\.?\d+)rem/g)].filter((m) => Number(m[1]) < 0.75);
  assert.deepEqual(small.map((m) => m[0]), []);
  // Pixel sizes under 12px are left only in the printed county forms
  // (.pf-* styles, the permission/leave form builders in src/08 and the
  // printed store checklist in src/09), which copy the paper form's size.
  for (const f of fs.readdirSync(path.join(LH, 'src'))) {
    const s = SRC(f);
    const lines = s.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/font-size:\s*(\d*\.?\d+)px/g)) {
        if (Number(m[1]) >= 12) continue;
        const printed = /^\.pf-/.test(line.trim()) || f.startsWith('08-') || (f.startsWith('09-') && /SBE|Tool Kit|<title>/.test(line + lines[i - 1]));
        assert.ok(printed, `${f}:${i + 1} ${m[0]}`);
      }
    });
  }
  assert.doesNotMatch(PAGE, /Bebas Neue\\?',\s*cursive/);
  assert.match(SRC('01-styles.html'), /\.logo\{font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;/);
});

test('a checkbox or radio is not stretched to the full row', () => {
  assert.match(SRC('01-styles.html'), /input\[type=checkbox\],input\[type=radio\]\{width:auto;\}/);
});

// The words a person reads: markup outside comments, styles and tooltips
// and the Terms list (both name the system's term on purpose: "Called the
// SBE checklist").
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
function visible(src) {
  let text = cutBetween(src, '<style>', '</style>');
  text = cutBetween(text, '<!--', '-->');
  text = text.replace(/^\s*\/\/.*$/gm, '');
  // The Terms list names each system term on purpose, too.
  text = cutBetween(text, 'LH_TERMS = [', '\n];');
  return cutBetween(text, 'title="', '"');
}

test('the screen uses plain words for the system\'s own terms', () => {
  const text = visible(PAGE);
  for (const gone of ['⏰ Cron idle', 'Obs Prep ${done}', 'Obs prep checklist', 'Obs follow-up', "label:'Synergy Grades'",
    "'Attendance (Synergy)'", '📊 Grade & Platform Currency', '>SBE Checklist<', 'SBE Compliance', 'SBE Approval Progress',
    '`SBE ${sbeDone}', 'h avg WBL`', 'low-stock SKU', 'comp coverage', 'No SCR sessions yet', 'Fuzzy →', '>AUTO<',
    'FT Permission Form', 'Connect to cas-ccps', '>Email Bridge <', 'JI Topic', '>AI Flow Health<',
    'd past ${p.maxDays}-day limit', "'⏰ 2am'", '✓ 2am ran']) {
    assert.ok(!text.includes(gone), 'still on screen: ' + gone);
  }
  for (const now of ['🌙 Overnight re-plan: not yet', 'Observation prep ${done}/${total}', "label:'Gradebook grades'",
    "label:'Gradebook attendance'", 'Store approval checklist', 'Field Trip Permission Form', 'Connect to CAS',
    'Email connection', 'never logged here — log it today']) {
    assert.ok(text.includes(now), 'missing: ' + now);
  }
});

test('each pulse ring\'s percentage is captioned with what it counts', () => {
  const src = SRC('10-command-engine-ai-and-widgets.html');
  const block = src.slice(src.indexOf('const PULSE_MEANINGS'), src.indexOf('function renderPulseRow'));
  const ctx = {};
  vm.runInNewContext(block + '\nthis.m = PULSE_MEANINGS;', ctx);
  for (const key of ['teach', 'store', 'deca', 'esports', 'trips']) {
    const [caption, tip] = ctx.m[key];
    assert.ok(caption && tip.length > 30, key);
  }
  assert.match(src, /title="\$\{m\[1\]\}">\$\{d\.pct\}%<\/div>\n\s*<div style="font-size:\.75rem;color:var\(--muted\);line-height:1\.2">\$\{m\[0\]\}<\/div>/);
});

function terms() {
  const src = SRC('12-integrations-pacing-subplan-brag.html');
  const block = src.slice(src.indexOf('const LH_TERMS'), src.indexOf('function lhOpenTerms'));
  const ctx = {
    SCR_SCORE_LABELS: { 1: 'Can teach others', 2: 'Without supervision', 3: 'Limited supervision', 4: 'With supervision', 5: 'Cannot perform' },
    CAS_PACING_UNITS: [{ vocabulary: [{ term: 'SCR rating', definition: 'Student Competency Record — the 1–5 scale' }] }],
  };
  vm.runInNewContext(block + '\nthis.out = { LH_TERMS, meaning: _lhTermMeaning };', ctx);
  return ctx.out;
}

test('the Terms panel maps every renamed term to what the forms, guide or code call it', () => {
  const { LH_TERMS, meaning } = terms();
  const aka = LH_TERMS.map((t) => t[2]).join(' | ');
  for (const systemName of ['Synergy', 'SBE', 'Obs Prep', 'Cron', 'Email Bridge', 'cas-ccps', 'FT Permission Form',
    'WBL', 'Student Competency Record', 'AI Flow Health', 'Pulse', 'Grade & Platform Currency', 'Journal', 'DLC, SLC, ICDC',
    'CTSO', 'TripTracker', 'PO #', 'JSON']) {
    assert.ok(aka.includes(systemName), 'no Terms entry for ' + systemName);
  }
  for (const t of LH_TERMS) assert.ok(t[0] && meaning(t).length > 20, 'a real explanation for ' + t[0]);
  // The SCR entry reuses SCR_SCORE_LABELS and the pacing guide's definition.
  const scr = meaning(LH_TERMS.find((t) => t[0] === 'SCR'));
  assert.match(scr, /^Student Competency Record — the 1–5 scale/);
  assert.match(scr, /1 is the highest: 1 Can teach others · 2 Without supervision .* 5 Cannot perform/);
});

test('the Terms panel is a native dialog opened from a header button', () => {
  assert.match(PAGE, /<dialog id="lh-terms" class="lh-terms" aria-labelledby="lh-terms-title">/);
  assert.match(PAGE, /<h2 id="lh-terms-title">Terms used in LeaderHub<\/h2>/);
  const header = PAGE.slice(PAGE.indexOf('<header>'), PAGE.indexOf('</header>'));
  assert.match(header, /id="lh-terms-btn"[^>]*onclick="lhOpenTerms\(\)" aria-haspopup="dialog"/);
  // Focus goes back to the button when the dialog closes (Escape included),
  // and the page's own modal Escape handler stands aside for it.
  assert.match(PAGE, /addEventListener\('close', \(\) => \{ const b = document\.getElementById\('lh-terms-btn'\); if \(b\) b\.focus\(\); \}\)/);
  assert.match(SRC('06-tasks-trips-and-modals-core.html'), /function _moTrapKeydown\(e\) \{\n\s*\/\/[^\n]*\n\s*if \(document\.querySelector\('dialog\[open\]'\)\) return;/);
});
