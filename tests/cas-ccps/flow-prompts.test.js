'use strict';
// Regression tests for 40_FlowPrompts.js — the one deployable home for every
// Studio Flow's system prompt.
//
// The load-bearing tests here are the PROVENANCE ones. The prompt text in
// that file was extracted mechanically from two sources; if either source
// changes and the constants don't, the flows quietly run an outdated prompt
// and nothing else in this repo would notice. So these tests re-run the same
// extraction and demand a byte-for-byte match:
//
//   Flows 3 A/B, 4, 5  <-  docs/CAS_Flow3_Flow4_Specification.html
//   Flow 1             <-  15_StudioFlowPrompts.js (which project-map.json
//                          lists as not-deployed, hence the duplicate)
//
// A failure here means "these two disagree," not "this code is broken" —
// decide which one is right, then update the other.
//
// Loaded with 15b_StudioFlowPrompts_Flow2_Revised.js because the registry
// resolves FLOW_2 through that file's own FLOW_2_SYSTEM_PROMPT rather than
// keeping a second copy, and with 00_SharedConfig.js for getConfig_ — all one
// GAS project (cas-ccps:central-ledger, see tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const S = (f) => path.join(ROOT, 'cas-ccps', 'scripts', f);
const SPEC_HTML = path.join(ROOT, 'cas-ccps', 'docs', 'CAS_Flow3_Flow4_Specification.html');
const FLOW1_REFERENCE = S('15_StudioFlowPrompts.js');

function load() {
  return loadGasFiles(
    [S('00_SharedConfig.js'), S('15b_StudioFlowPrompts_Flow2_Revised.js'), S('40_FlowPrompts.js')],
    [
      'getFlowPrompt', 'syncFlowPromptsToSheet', 'checkFlowPrompts',
      'substituteFlowPrompt_', 'flowPromptPlaceholders_', 'flowPromptText_',
      'FLOW_PROMPT_KEYS', 'FLOW_PROMPT_TAB', 'FLOW_PROMPT_HEADERS',
      'FLOW_1_PROMPT', 'FLOW_3_PROMPT_MODE_A', 'FLOW_3_PROMPT_MODE_B',
      'FLOW_4_PROMPT', 'FLOW_5_PROMPT',
    ],
  );
}

function setUp(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  return ss;
}

// The same extraction 40_FlowPrompts.js's own header documents: strip the
// spec's <span class="kw"> highlight wrappers, strip remaining tags, unescape
// entities, trim.
function unescapeHtml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
function cleanPromptMarkup(body) {
  let t = body.replace(/<span class="kw">([\s\S]*?)<\/span>/g, '$1');
  t = t.replace(/<[^>]+>/g, '');
  return unescapeHtml(t).trim();
}
function extractFromSpec() {
  const src = fs.readFileSync(SPEC_HTML, 'utf8');
  const out = {};
  const re = /<h4>([^<]+)<\/h4>[\s\S]*?<div class="prompt-body">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(src)) !== null) out[m[1].trim()] = cleanPromptMarkup(m[2]);
  const bridge = src.match(/<pre[^>]*>(You are writing a one-paragraph bridge[\s\S]*?)<\/pre>/);
  if (bridge) out['System Prompt — Flow 5 Bridging'] = cleanPromptMarkup(bridge[1]);
  return out;
}

// ── Provenance: the constants must still match their sources ────────────────

test('FLOW_3/4/5 constants are byte-identical to the HTML spec they were extracted from', () => {
  const { exported } = load();
  const spec = extractFromSpec();

  assert.equal(exported.FLOW_3_PROMPT_MODE_A, spec['System Prompt — Mode A (Anchor-Aware)'],
    'Flow 3 Mode A has drifted from CAS_Flow3_Flow4_Specification.html');
  assert.equal(exported.FLOW_3_PROMPT_MODE_B, spec['System Prompt — Mode B (Generative)'],
    'Flow 3 Mode B has drifted from the spec');
  assert.equal(exported.FLOW_4_PROMPT, spec['System Prompt — Studio Flow 4'],
    'Flow 4 has drifted from the spec');
  assert.equal(exported.FLOW_5_PROMPT, spec['System Prompt — Flow 5 Bridging'],
    'Flow 5 has drifted from the spec');
});

test('FLOW_1_PROMPT is byte-identical to 15_StudioFlowPrompts.js, the non-deployed reference', () => {
  const { exported } = load();
  const src = fs.readFileSync(FLOW1_REFERENCE, 'utf8');
  const m = src.match(/const FLOW_1_SYSTEM_PROMPT = `([\s\S]*?)`\.trim\(\);/);
  assert.ok(m, 'could not find FLOW_1_SYSTEM_PROMPT in the reference file');
  assert.equal(exported.FLOW_1_PROMPT, m[1].trim(),
    'the deployed Flow 1 prompt and the reference copy have diverged');
});

test('every prompt is non-trivial and carries the placeholders its flow needs', () => {
  const { exported } = load();
  const expected = {
    FLOW_1: ['{{COURSE_NAME}}', '{{RUBRIC_TEXT}}', '{{TIER}}'],
    FLOW_2: ['{{UNIT_NAME}}', '{{TIER}}', '{{PERSONA}}', '{{STUDENT_TEXT}}'],
    FLOW_3_MODE_A: ['{archetype}', '{warmup_anchor}', '{first_name}'],
    FLOW_3_MODE_B: ['{archetype}', '{objective}', '{first_name}'],
    FLOW_4: ['{response_text}', '{word_count_score}'],
    FLOW_5: ['{flow5_prior_response}', '{pacing_prior_connection}', '{course_name}'],
  };
  Object.keys(expected).forEach((key) => {
    const text = exported.flowPromptText_(key);
    assert.ok(text.length > 500, key + ' looks truncated (' + text.length + ' chars)');
    expected[key].forEach((ph) => {
      assert.ok(text.indexOf(ph) !== -1, key + ' is missing placeholder ' + ph);
    });
  });
});

test('FLOW_2 resolves through 15b rather than a second copy in this file', () => {
  const { exported } = load();
  const own = fs.readFileSync(S('40_FlowPrompts.js'), 'utf8');
  assert.equal(own.indexOf('FLOW_2_PROMPT ='), -1,
    'a FLOW_2 text constant here would collide with 15b at parse time and drift');
  assert.ok(exported.flowPromptText_('FLOW_2').length > 500,
    'FLOW_2 must still resolve, via 15b');
});

// ── Substitution ─────────────────────────────────────────────────────────────

test('substituteFlowPrompt_: fills both {{DOUBLE}} and {single} placeholder styles', () => {
  const { exported } = load();
  const out = exported.substituteFlowPrompt_(
    'A={{ALPHA}} B={beta}', { ALPHA: 'one', beta: 'two' }, true);
  assert.equal(out, 'A=one B=two');
});

test('substituteFlowPrompt_: accepts bare, braced, and lowercase key spellings alike', () => {
  const { exported } = load();
  // The same vars object has to work against either prompt style without the
  // caller tracking which one it's targeting.
  assert.equal(exported.substituteFlowPrompt_('{{UNIT_NAME}}', { UNIT_NAME: 'x' }, true), 'x');
  assert.equal(exported.substituteFlowPrompt_('{{UNIT_NAME}}', { '{{UNIT_NAME}}': 'x' }, true), 'x');
  assert.equal(exported.substituteFlowPrompt_('{course_name}', { COURSE_NAME: 'x' }, true), 'x');
  assert.equal(exported.substituteFlowPrompt_('{course_name}', { course_name: 'x' }, true), 'x');
});

test('substituteFlowPrompt_: an unmatched placeholder is LEFT IN PLACE by default', () => {
  const { exported } = load();
  // This is the important one. Blanking it silently would hand Gemini a
  // prompt that looks complete and asks it to evaluate against nothing;
  // leaving the token visible makes the omission obvious in the sheet.
  // 37_FlowInputBuilder.js depends on this to keep {{STUDENT_TEXT}} standing.
  assert.equal(exported.substituteFlowPrompt_('keep {{MISSING}}', {}, true), 'keep {{MISSING}}');
  assert.equal(exported.substituteFlowPrompt_('keep {{MISSING}}', {}), 'keep {{MISSING}}');
  // Explicit opt-in is required to blank it.
  assert.equal(exported.substituteFlowPrompt_('drop {{MISSING}}', {}, false), 'drop ');
});

test('substituteFlowPrompt_: a null or undefined var counts as unmatched, not as empty', () => {
  const { exported } = load();
  assert.equal(exported.substituteFlowPrompt_('{{A}}', { A: null }, true), '{{A}}');
  assert.equal(exported.substituteFlowPrompt_('{{A}}', { A: undefined }, true), '{{A}}');
  // An empty string, though, is a deliberate value and does substitute.
  assert.equal(exported.substituteFlowPrompt_('{{A}}', { A: '' }, true), '');
});

test('getFlowPrompt: returns the raw template with no vars, substituted with them', () => {
  const { exported } = load();
  const raw = exported.getFlowPrompt('FLOW_5');
  assert.ok(raw.indexOf('{course_name}') !== -1);

  const filled = exported.getFlowPrompt('FLOW_5', {
    flow5_prior_response: 'PRIOR', pacing_prior_connection: 'LINK', course_name: 'COURSE',
  });
  assert.ok(filled.indexOf('{course_name}') === -1, 'placeholder should be gone');
  assert.ok(filled.indexOf('COURSE') !== -1);
  assert.ok(filled.indexOf('PRIOR') !== -1);
});

test('getFlowPrompt: an unknown key returns empty and logs rather than throwing', () => {
  const { exported } = load();
  assert.equal(exported.getFlowPrompt('FLOW_99'), '');
});

test('flowPromptPlaceholders_: reports both styles, sorted and deduplicated', () => {
  const { exported } = load();
  const got = exported.flowPromptPlaceholders_('{{B}} {a} {{B}} {a} {c}');
  assert.deepEqual(got, ['{a}', '{c}', '{{B}}']);
});

// ── Sheet sync ───────────────────────────────────────────────────────────────

test('syncFlowPromptsToSheet: writes one row per prompt with text and metadata', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  const result = exported.syncFlowPromptsToSheet();
  assert.equal(result.synced, exported.FLOW_PROMPT_KEYS.length);
  assert.equal(result.oversize, 0);

  const sheet = ss.getSheetByName(exported.FLOW_PROMPT_TAB);
  const data = sheet.getDataRange().getValues();
  assert.deepEqual(data[0], exported.FLOW_PROMPT_HEADERS);
  assert.equal(data.length, exported.FLOW_PROMPT_KEYS.length + 1);

  const keyCol = exported.FLOW_PROMPT_HEADERS.indexOf('prompt_key');
  const textCol = exported.FLOW_PROMPT_HEADERS.indexOf('prompt_text');
  exported.FLOW_PROMPT_KEYS.forEach((key) => {
    const row = data.find((r) => String(r[keyCol]).trim() === key);
    assert.ok(row, key + ' is missing from the sheet');
    assert.equal(row[textCol], exported.flowPromptText_(key),
      key + "'s text on the sheet must match the code exactly — it's what Studio reads");
  });
});

test('syncFlowPromptsToSheet: is idempotent and never accumulates stale rows', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  exported.syncFlowPromptsToSheet();
  // A row for a prompt that no longer exists in the registry — a flow reading
  // by prompt_key would still find it, so the sync must clear it out.
  ss.getSheetByName(exported.FLOW_PROMPT_TAB).appendRow(['FLOW_OBSOLETE', '9', 'gone', '', 0, new Date(), 'stale']);
  exported.syncFlowPromptsToSheet();

  const data = ss.getSheetByName(exported.FLOW_PROMPT_TAB).getDataRange().getValues();
  assert.equal(data.length, exported.FLOW_PROMPT_KEYS.length + 1);
  assert.ok(!data.some((r) => String(r[0]).trim() === 'FLOW_OBSOLETE'));
});

// ── Drift detection ──────────────────────────────────────────────────────────

test('checkFlowPrompts: reports all in sync right after a sync', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  exported.syncFlowPromptsToSheet();

  const report = exported.checkFlowPrompts();
  assert.equal(report.inSync, exported.FLOW_PROMPT_KEYS.length);
  assert.equal(report.drifted, 0);
  assert.equal(report.missing, 0);
});

test('checkFlowPrompts: catches a prompt edited on the sheet but not re-synced', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowPromptsToSheet();

  // Exactly the situation this function exists for: someone changed the
  // prompt in code and pushed, but never re-ran the sync — so the flows are
  // still reading the old text.
  const sheet = ss.getSheetByName(exported.FLOW_PROMPT_TAB);
  const textCol = exported.FLOW_PROMPT_HEADERS.indexOf('prompt_text') + 1;
  sheet.getRange(2, textCol).setValue('hand-edited, no longer matches the code');

  const report = exported.checkFlowPrompts();
  assert.equal(report.drifted, 1);
  assert.equal(report.inSync, exported.FLOW_PROMPT_KEYS.length - 1);
});

test('checkFlowPrompts: an absent tab reports everything missing, without throwing', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const report = exported.checkFlowPrompts();
  assert.equal(report.missing, exported.FLOW_PROMPT_KEYS.length);
  assert.equal(report.inSync, 0);
});
