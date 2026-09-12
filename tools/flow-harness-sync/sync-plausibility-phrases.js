#!/usr/bin/env node
'use strict';
// Regenerates the plausibility/groundedness gate's phrase lists, stopword
// sets, and match-count threshold in all three consuming files FROM
// shared/flow-harness/plausibility-phrases.json — the canonical source the
// flow-harness proposal's Phase 0 and the redundancy review's B1/#2 finding
// both called for. GAS gives each of cas-ccps/leader-hub/kos-personal its
// own execution scope (no cross-project function calls), so the runtime
// CODE in each file stays separate; only this DATA is unified, the same
// "build-time materialization, not a runtime library" mechanism
// tools/clasp-sync/sync.js already uses for cas-ccps's shared files.
//
// TARGETED REPLACEMENT, LIKE tools/cas-ccps/generate-flow-prompts.js. Each
// target file keeps 100% of its own hand-written logic (the different
// comparison target — rubric fields, a JSON payload, or the source
// document itself — stays genuinely per-system, per the proposal's own
// scope line); this only replaces three specific `const NAME = ...;`
// blocks per file.
//
// Usage:
//   node tools/flow-harness-sync/sync-plausibility-phrases.js         write
//   node tools/flow-harness-sync/sync-plausibility-phrases.js --check dry run,
//     exit 1 if any target would change (used by gas-lint's harness-drift check)

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SPEC_PATH = path.join(REPO_ROOT, 'shared', 'flow-harness', 'plausibility-phrases.json');

// Per-file constant names — the one piece of per-system configuration this
// script needs, since each implementation named its own constants
// independently before this file existed (that naming mismatch itself is
// exactly the kind of surface drift this whole mechanism exists to make
// visible, not something to paper over by forcing identical names).
const TARGETS = [
  {
    file: path.join(REPO_ROOT, 'cas-ccps', 'scripts', '37_FlowInputBuilder.js'),
    phraseConst: 'FI_NON_ACCESS_PHRASES',
    stopwordConst: 'FI_PLAUSIBILITY_STOPWORDS',
    maxCandidatesConst: 'FI_PLAUSIBILITY_MAX_CANDIDATES',
  },
  {
    file: path.join(REPO_ROOT, 'leader-hub', 'EmailBridge.gs'),
    phraseConst: 'AI_NON_ENGAGEMENT_PHRASES',
    stopwordConst: 'AI_PLAUSIBILITY_STOPWORDS',
    maxCandidatesConst: 'AI_PLAUSIBILITY_MAX_CANDIDATES',
  },
  {
    file: path.join(REPO_ROOT, 'kos-personal', '12_StudioReturnHarvest.gs'),
    phraseConst: 'SR_NON_ACCESS_PHRASES',
    stopwordConst: 'SR_GROUNDEDNESS_STOPWORDS',
    maxCandidatesConst: 'SR_GROUNDEDNESS_MAX_CANDIDATES',
  },
];

// Single quotes by default (this repo's own convention in these files);
// double quotes only for a phrase that itself contains an apostrophe —
// none of the canonical phrases contain a double quote, so no escaping
// case has ever been needed.
function quoteJs(s) {
  return s.indexOf("'") !== -1 ? '"' + s + '"' : "'" + s + "'";
}

// Fixed items-per-line wrapping — simple and deterministic beats trying to
// preserve whatever ad hoc wrapping a file happened to have before this
// script managed it.
function wrapLines(items, perLine, indent) {
  const lines = [];
  for (let i = 0; i < items.length; i += perLine) {
    lines.push(indent + items.slice(i, i + perLine).join(', ') + ',');
  }
  return lines.join('\n');
}

function renderPhraseArray(constName, phrases) {
  const body = wrapLines(phrases.map(quoteJs), 4, '  ');
  return 'const ' + constName + ' = [\n' + body + '\n];';
}

function renderStopwordObject(constName, stopwords) {
  const sorted = stopwords.slice().sort();
  const body = wrapLines(sorted.map(function (w) { return w + ': 1'; }), 6, '  ');
  return 'const ' + constName + ' = {\n' + body + '\n};';
}

function renderMaxCandidates(constName, n) {
  return 'const ' + constName + ' = ' + n + ';';
}

// Replaces exactly one `const NAME = <array-or-object-or-number>;` block —
// same regex shape tools/cas-ccps/generate-flow-prompts.js's
// replaceConstant() uses, generalized to cover all three literal kinds
// this script manages (`[...]`, `{...}`, or a bare number).
function replaceConstant(src, name, replacement) {
  const re = new RegExp('const ' + name + ' = (?:\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\}|[0-9]+);');
  if (!re.test(src)) {
    throw new Error('could not find "const ' + name + ' = ..." to replace — has it been renamed, ' +
      'or does it need to be introduced by hand first? See this script\'s own header.');
  }
  return src.replace(re, replacement);
}

function computeUpdates() {
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  return TARGETS.map(function (target) {
    const before = fs.readFileSync(target.file, 'utf8');
    let after = before;
    after = replaceConstant(after, target.phraseConst, renderPhraseArray(target.phraseConst, spec.nonAccessPhrases));
    after = replaceConstant(after, target.stopwordConst, renderStopwordObject(target.stopwordConst, spec.stopwords));
    after = replaceConstant(after, target.maxCandidatesConst, renderMaxCandidates(target.maxCandidatesConst, spec.maxCandidates));
    return { file: target.file, before: before, after: after, changed: before !== after };
  });
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const updates = computeUpdates();
  const changed = updates.filter(function (u) { return u.changed; });

  if (checkOnly) {
    if (changed.length === 0) {
      console.log('[flow-harness-sync] plausibility-phrases: all 3 consumers match ' +
        'shared/flow-harness/plausibility-phrases.json.');
      return 0;
    }
    changed.forEach(function (u) {
      console.log('[flow-harness-sync] DRIFT: ' + path.relative(REPO_ROOT, u.file) +
        ' does not match the canonical source — run without --check to fix.');
    });
    return 1;
  }

  if (changed.length === 0) {
    console.log('[flow-harness-sync] No change — all 3 consumers already match ' +
      'shared/flow-harness/plausibility-phrases.json.');
    return 0;
  }
  changed.forEach(function (u) {
    fs.writeFileSync(u.file, u.after, 'utf8');
    console.log('[flow-harness-sync] Updated ' + path.relative(REPO_ROOT, u.file));
  });
  return 0;
}

module.exports = {
  computeUpdates, TARGETS, SPEC_PATH,
  quoteJs, wrapLines, renderPhraseArray, renderStopwordObject, renderMaxCandidates, replaceConstant,
};

if (require.main === module) {
  process.exitCode = main();
}
