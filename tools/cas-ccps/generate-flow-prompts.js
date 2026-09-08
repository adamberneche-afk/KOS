'use strict';
// Regenerates cas-ccps/scripts/40_FlowPrompts.js's five prompt constants FROM
// their real sources — cas-ccps/docs/CAS_Flow3_Flow4_Specification.html
// (Flows 3 A/B, 4, 5) and cas-ccps/scripts/15_StudioFlowPrompts.js (Flow 1) —
// the same relationship tools/kos-personal/generate-flow-prompts.js has to
// CURATOR_PROMPT.md/VECTOR_CLASSIFY_PROMPT.md there.
//
// WHY THIS EXISTS. 40_FlowPrompts.js's own header already states these five
// constants were "extracted mechanically, not retyped" — but until this
// script, "mechanically" meant a human manually re-running the same
// extraction rules by hand and pasting the result back in. Only
// tests/cas-ccps/flow-prompts.test.js re-running that extraction and
// asserting a byte match ever caught drift; nothing regenerated the file
// itself. This script is that missing regeneration step.
//
// TARGETED REPLACEMENT, NOT A FULL REWRITE. 40_FlowPrompts.js carries a lot
// that is NOT generated — substituteFlowPrompt_(), syncFlowPromptsToSheet(),
// checkFlowPrompts(), the FLOW_PROMPT_KEYS/TAB/HEADERS registry, FLOW_2's
// deliberate absence (resolved through 15b_StudioFlowPrompts_Flow2_Revised.js
// instead). This script only replaces the five
// `const FLOW_*_PROMPT = \`...\`.trim();` blocks, byte-for-byte identical in
// every other line, so a run against unchanged sources is a true no-op —
// confirmed by diffing before writing, not assumed.
//
// DIRECTIONALITY IS SETTLED, DELIBERATELY (meta/FLOW_DOCTRINE.md rule 16).
// 40_FlowPrompts.js's header used to invite a direct hotfix to that file
// ("change it HERE and let that test tell you the spec doc now disagrees")
// — rule 16 closes that off on purpose: a hotfix never passes through the
// same test gate a normal change does, so its fidelity can't be verified
// the way a reviewed change's can. This script always regenerates
// 40_FlowPrompts.js FROM the HTML spec / file 15 — that is the one
// correct direction, not a default that happens to usually be right. If
// tests/cas-ccps/flow-prompts.test.js is failing because someone edited
// 40_FlowPrompts.js directly instead of the canonical source: that edit
// was the mistake, not this script — port the improvement into the HTML
// spec (or file 15 for Flow 1) and run this script to deploy it properly,
// rather than treating the hotfix as something to preserve.
//
// tests/cas-ccps/flow-prompts.test.js remains the CI drift guard exactly as
// before; this script is what actually closes a drift it reports.
//
// Usage: node tools/cas-ccps/generate-flow-prompts.js
//   (run from anywhere; paths below are repo-root-relative)

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SCRIPTS = path.join(REPO_ROOT, 'cas-ccps', 'scripts');
const SPEC_HTML_PATH = path.join(REPO_ROOT, 'cas-ccps', 'docs', 'CAS_Flow3_Flow4_Specification.html');
const FLOW1_REFERENCE_PATH = path.join(SCRIPTS, '15_StudioFlowPrompts.js');
const TARGET_PATH = path.join(SCRIPTS, '40_FlowPrompts.js');

// Same extraction 40_FlowPrompts.js's own header documents, and the same one
// tests/cas-ccps/flow-prompts.test.js already asserts against — duplicated
// here deliberately (not required from the test) so a bug in one doesn't
// silently validate itself in the other.
function unescapeHtml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
function cleanPromptMarkup(body) {
  let t = body.replace(/<span class="kw">([\s\S]*?)<\/span>/g, '$1');
  t = t.replace(/<[^>]+>/g, '');
  return unescapeHtml(t).trim();
}
function extractFromSpec(html) {
  const out = {};
  const re = /<h4>([^<]+)<\/h4>[\s\S]*?<div class="prompt-body">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null) out[m[1].trim()] = cleanPromptMarkup(m[2]);
  const bridge = html.match(/<pre[^>]*>(You are writing a one-paragraph bridge[\s\S]*?)<\/pre>/);
  if (bridge) out['System Prompt — Flow 5 Bridging'] = cleanPromptMarkup(bridge[1]);
  return out;
}

function extractFlow1(src) {
  const m = src.match(/const FLOW_1_SYSTEM_PROMPT = `([\s\S]*?)`\.trim\(\);/);
  if (!m) throw new Error('15_StudioFlowPrompts.js: could not find FLOW_1_SYSTEM_PROMPT');
  return m[1].trim();
}

// Escapes for safe insertion into a template literal — backtick, `${`, and a
// literal backslash all need it. None of these five prompts currently
// contain a backtick (no fenced code in this HTML spec's prose), but this
// stays defensive rather than assuming that never changes.
function escapeForTemplateLiteral(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

// Replaces exactly one `const NAME = \`...\`.trim();` block in `src`,
// preserving the file's own established shape (leading/trailing newline
// inside the backticks, `.trim()` at the call site strips them back off —
// same convention the file already uses everywhere).
function replaceConstant(src, name, body) {
  const re = new RegExp('const ' + name + ' = `[\\s\\S]*?`\\.trim\\(\\);');
  if (!re.test(src)) throw new Error(TARGET_PATH + ': could not find "const ' + name + ' = ..." to replace');
  const replacement = 'const ' + name + ' = `\n' + escapeForTemplateLiteral(body) + '\n`.trim();';
  return src.replace(re, replacement);
}

function main() {
  const specHtml = fs.readFileSync(SPEC_HTML_PATH, 'utf8');
  const spec = extractFromSpec(specHtml);
  const REQUIRED_TITLES = [
    'System Prompt — Mode A (Anchor-Aware)',
    'System Prompt — Mode B (Generative)',
    'System Prompt — Studio Flow 4',
    'System Prompt — Flow 5 Bridging',
  ];
  REQUIRED_TITLES.forEach((title) => {
    if (!spec[title]) throw new Error(SPEC_HTML_PATH + ': expected prompt titled "' + title + '" not found');
  });

  const flow1Src = fs.readFileSync(FLOW1_REFERENCE_PATH, 'utf8');
  const extracted = {
    FLOW_1_PROMPT: extractFlow1(flow1Src),
    FLOW_3_PROMPT_MODE_A: spec['System Prompt — Mode A (Anchor-Aware)'],
    FLOW_3_PROMPT_MODE_B: spec['System Prompt — Mode B (Generative)'],
    FLOW_4_PROMPT: spec['System Prompt — Studio Flow 4'],
    FLOW_5_PROMPT: spec['System Prompt — Flow 5 Bridging'],
  };

  let target = fs.readFileSync(TARGET_PATH, 'utf8');
  const before = target;
  const changed = [];
  Object.keys(extracted).forEach((name) => {
    const updated = replaceConstant(target, name, extracted[name]);
    if (updated !== target) changed.push(name);
    target = updated;
  });

  if (target === before) {
    console.log('No change — all five constants in ' + TARGET_PATH + ' already match their sources.');
    return;
  }

  console.log('[Prompts] Overwriting ' + changed.join(', ') + ' in ' + TARGET_PATH +
    ' from the canonical source (meta/FLOW_DOCTRINE.md rule 16) — if a prompt was tuned by a ' +
    'direct hotfix instead of via the HTML spec / file 15, that tune needs porting into the ' +
    'canonical source first, or this overwrite is correct and the hotfix is what\'s being closed.');
  fs.writeFileSync(TARGET_PATH, target, 'utf8');
  console.log('Updated ' + TARGET_PATH + ': ' + changed.join(', ') +
    ' regenerated from source. Re-run tests/cas-ccps/flow-prompts.test.js and ' +
    'checkFlowPrompts() (after a real push) to confirm.');
}

main();
