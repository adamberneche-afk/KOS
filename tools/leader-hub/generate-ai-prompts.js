'use strict';
// Regenerates leader-hub/AiPrompts.gs's six prompt constants FROM their real
// sources — the six leader-hub/*_FLOW_PROMPT.md files — the same
// relationship tools/kos-personal/generate-flow-prompts.js has to
// CURATOR_PROMPT.md/VECTOR_CLASSIFY_PROMPT.md there, and
// tools/cas-ccps/generate-flow-prompts.js has to its own two sources.
//
// WHY THIS EXISTS. AiPrompts.gs's own header already states each constant
// was "extracted mechanically, not retyped" — but until this script, that
// meant a human re-running the same split by hand. Only
// tests/leaderhub/ai-prompts.test.js re-running the split and asserting a
// byte match ever caught drift; nothing regenerated the file itself.
//
// TARGETED REPLACEMENT, NOT A FULL REWRITE. AiPrompts.gs carries a lot that
// is NOT generated — syncAiPromptsToSheet(), checkAiPrompts(),
// AI_PROMPT_TAB/HEADERS/TITLES, the AI_FLOW_TYPES cross-check. This script
// only replaces the six `const AI_PROMPT_* = \`...\`.trim();` blocks,
// byte-for-byte identical in every other line, so a run against unchanged
// .md sources is a true no-op — confirmed by diffing before writing.
//
// tests/leaderhub/ai-prompts.test.js remains the CI drift guard exactly as
// before; this script is what you run when it fails and the .md file (not
// AiPrompts.gs) is the one that's right.
//
// Usage: node tools/leader-hub/generate-ai-prompts.js
//   (run from anywhere; paths below are repo-root-relative)

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const LH = path.join(REPO_ROOT, 'leader-hub');
const TARGET_PATH = path.join(LH, 'AiPrompts.gs');

// jobType -> constant name -> source .md file. Order matches AiPrompts.gs's
// own declaration order (cosmetic only — replaceConstant finds each by name
// regardless of order).
const SOURCES = [
  { jobType: 'EMAIL_COMPOSE', constName: 'AI_PROMPT_EMAIL_COMPOSE' },
  { jobType: 'ARCHIVE_INSIGHTS', constName: 'AI_PROMPT_ARCHIVE_INSIGHTS' },
  { jobType: 'WBL_INSIGHTS', constName: 'AI_PROMPT_WBL_INSIGHTS' },
  { jobType: 'LP_ASSIST', constName: 'AI_PROMPT_LP_ASSIST' },
  { jobType: 'FIN_ANALYSIS', constName: 'AI_PROMPT_FIN_ANALYSIS' },
  { jobType: 'BRAG_EMAIL', constName: 'AI_PROMPT_BRAG_EMAIL' },
];

// Same split AiPrompts.gs's own header documents, and the same one
// tests/leaderhub/ai-prompts.test.js already asserts against: everything
// after the first standalone "---" line. What precedes it is the file's own
// "paste this verbatim" preamble — instructions to a human, not the prompt.
function promptFromMarkdown(jobType) {
  const mdPath = path.join(LH, jobType + '_FLOW_PROMPT.md');
  const raw = fs.readFileSync(mdPath, 'utf8');
  const parts = raw.split(/^---$/m);
  if (parts.length !== 2) {
    throw new Error(mdPath + ': expected exactly one standalone "---" line, found ' + (parts.length - 1));
  }
  return parts[1].trim();
}

// Escapes for safe insertion into a template literal. These prompts DO
// contain fenced ```json example blocks (AiPrompts.gs's own header flags
// this explicitly), so unlike cas-ccps's five prompts this is load-bearing,
// not defensive — tests/leaderhub/ai-prompts.test.js's own "survived
// escaping" test exists because of exactly this.
function escapeForTemplateLiteral(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function replaceConstant(src, name, body) {
  const re = new RegExp('const ' + name + ' = `[\\s\\S]*?`\\.trim\\(\\);');
  if (!re.test(src)) throw new Error(TARGET_PATH + ': could not find "const ' + name + ' = ..." to replace');
  const replacement = 'const ' + name + ' = `\n' + escapeForTemplateLiteral(body) + '\n`.trim();';
  return src.replace(re, replacement);
}

function main() {
  const extracted = {};
  SOURCES.forEach(({ jobType, constName }) => {
    extracted[constName] = promptFromMarkdown(jobType);
  });

  let target = fs.readFileSync(TARGET_PATH, 'utf8');
  const before = target;
  const changed = [];
  Object.keys(extracted).forEach((name) => {
    const updated = replaceConstant(target, name, extracted[name]);
    if (updated !== target) changed.push(name);
    target = updated;
  });

  if (target === before) {
    console.log('No change — all six constants in ' + TARGET_PATH + ' already match their .md sources.');
    return;
  }

  fs.writeFileSync(TARGET_PATH, target, 'utf8');
  console.log('Updated ' + TARGET_PATH + ': ' + changed.join(', ') +
    ' regenerated from source. Re-run tests/leaderhub/ai-prompts.test.js and ' +
    'checkAiPrompts() (after a real push) to confirm.');
}

main();
