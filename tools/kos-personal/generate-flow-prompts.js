'use strict';
// Regenerates kos-personal/16_FlowPrompts.gs's prompt constants FROM
// CURATOR_PROMPT.md / VECTOR_CLASSIFY_PROMPT.md / CURATOR_AUDITOR_PROMPT.md —
// the canonical, human-read source stays each .md file; the .gs constant is
// a generated mirror of it, the same relationship 14_StudioFlowBuildSpec.gs's
// FlowBuildSpec tab has to the code constants it's derived from (see that
// file's own header: "generated beats hand-copied").
//
// WHY THIS EXISTS AT ALL. Apps Script can't read a repo's .md files at
// runtime — clasp only pushes .gs/.html/appsscript.json (see .claspignore),
// so a Studio Flow that wants to pull a prompt in via a chip needs that
// prompt sitting in a Sheet cell, and the only thing that can put it there
// is code that's actually live in the script project. Hand-pasting the
// prompt into a Sheet tab once (the original plan) works but silently
// drifts the moment a .md file changes and nobody remembers to re-paste.
// This script removes the hand-paste step entirely: run it, commit the
// regenerated 16_FlowPrompts.gs, push it with the rest of the code, and
// syncFlowPrompts() (in that file) does the actual Sheet write.
//
// tests/kos-personal/flow-prompts.test.js re-runs this exact extraction at
// test time and asserts it matches what's checked into 16_FlowPrompts.gs —
// that's the drift guard. Edit a .md file, forget to re-run this script,
// and `npm test` fails on the next run pointing at exactly which constant
// went stale.
//
// Usage: node tools/kos-personal/generate-flow-prompts.js
//   (run from anywhere; paths below are repo-root-relative)

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const KP = path.join(REPO_ROOT, 'kos-personal');

// `trailerKey` selects how syncFlowPrompts() finishes each Sheet cell — see
// FP_TRAILERS in the generated footer. Every prompt here ends its .md body
// at the same "---\n\nPayload to Analyze:" divider (so extraction below
// stays one shared rule), but what comes after that divider differs: most
// prompts have ONE variable (the trailer ends right where a single
// @trigger.SourceText chip goes); CURATOR_AUDITOR_PROMPT.md has TWO
// (the transcript, then the Curator's own output) — its trailer ends after
// only the first label, so Studio needs one small typed label between the
// two chips (syncFlowPrompts()'s own guidance names exactly which prompt).
const SOURCES = [
  { mdFile: 'CURATOR_PROMPT.md', constName: 'CURATOR_SYSTEM_PROMPT', trailerKey: 'single' },
  { mdFile: 'VECTOR_CLASSIFY_PROMPT.md', constName: 'VECTOR_CLASSIFY_SYSTEM_PROMPT', trailerKey: 'single' },
  { mdFile: 'CURATOR_AUDITOR_PROMPT.md', constName: 'CURATOR_AUDITOR_SYSTEM_PROMPT', trailerKey: 'auditor' },
];

const START_MARKER = '## 1. IDENTITY & SCOPE';
const END_MARKER = '\n---\n\nPayload to Analyze:';

// Extracts the actual prompt body: everything from the first real section
// heading through the last real content line, excluding (a) the file's own
// top-of-file usage note (instructions to the HUMAN pasting this — Gemini
// never needs "same convention as..." or a pointer to another doc it can't
// read) and (b) the trailing "---\n\nPayload to Analyze:\n..." boilerplate,
// which syncFlowPrompts() reconstructs itself (per-prompt, via
// FP_TRAILERS) so the Sheet cell ends exactly where a chip should pick up —
// see 16_FlowPrompts.gs's _fpAssemblePromptText_.
function extractPromptBody(mdText, mdFile) {
  const startIdx = mdText.indexOf(START_MARKER);
  if (startIdx === -1) {
    throw new Error(mdFile + ': start marker not found — "' + START_MARKER + '"');
  }
  const endIdx = mdText.indexOf(END_MARKER, startIdx);
  if (endIdx === -1) {
    throw new Error(mdFile + ': end marker not found — "' + END_MARKER.trim() + '"');
  }
  return mdText.slice(startIdx, endIdx).trim();
}

// Template literals break on an unescaped backtick or `${` — both appear
// throughout this prose (backtick-quoted field/function names everywhere,
// and the JSON schema blocks use backtick-adjacent fencing). Escaping
// programmatically here means never hand-transcribing ~150 lines of
// markdown into a JS string and hoping every backtick got caught.
function escapeForTemplateLiteral(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function main() {
  const constants = SOURCES.map(({ mdFile, constName, trailerKey }) => {
    const mdText = fs.readFileSync(path.join(KP, mdFile), 'utf8');
    const body = extractPromptBody(mdText, mdFile);
    return { constName, mdFile, trailerKey, body };
  });

  const header = `/**
 * ================================================================
 * 16_FlowPrompts.gs — KOS v8.0
 * BOUND TO: kos-personal (main flat-folder project)
 * ================================================================
 *
 * GENERATED FILE — do not hand-edit the prompt constants below.
 * Regenerate with: node tools/kos-personal/generate-flow-prompts.js
 * (reads CURATOR_PROMPT.md / VECTOR_CLASSIFY_PROMPT.md /
 * CURATOR_AUDITOR_PROMPT.md, which stay the canonical, human-read prompt
 * source — meta/FLOW_DOCTRINE.md rule 16).
 * tests/kos-personal/flow-prompts.test.js fails if this file and those
 * .md files ever disagree.
 *
 * WHY THIS FILE EXISTS. Apps Script can't read a repo's .md files at
 * runtime — only what clasp actually pushes. A Studio Flow that wants to
 * pull a prompt in via a chip (rather than a giant hand-pasted block in
 * the Gemini step's System Prompt field) needs that prompt sitting in a
 * Sheet cell, and the only thing that can put a CURRENT copy there is code
 * that's live in the script project. This file is that code.
 *
 * WHAT THIS DOES AND DELIBERATELY DOES NOT DO. syncFlowPrompts() writes
 * one row per prompt to a new tab, FlowPrompts — nothing else. It never
 * touches FlowBuildSpec (14_StudioFlowBuildSpec.gs owns that tab
 * entirely and rewrites it wholesale on its own sync) or any of
 * STAGING_PIPELINE/STUDIO_RETURN/CuratorInput/VectorClassifyInput. A
 * Studio Flow's own build (its trigger, steps, and chip wiring) lives
 * entirely inside Workspace Studio's own storage — nothing in any Sheet
 * tab can overwrite that; re-running syncFlowPrompts() only changes what
 * a chip already pointed at that tab resolves to, at the Flow's next run.
 *
 * ENTRY POINTS (no trailing underscore — GAS hides those from the Run
 * dropdown):
 *   syncFlowPrompts()   — write/refresh the FlowPrompts tab
 *   checkFlowPrompts()  — is the tab present and current?
 */

const FP_TAB = 'FlowPrompts';
const FP_HEADERS = ['PromptName', 'PromptText', 'SourceFile', 'Notes'];
const FP_NOTE = 'Generated by syncFlowPrompts() (16_FlowPrompts.gs) from the .md file named in ' +
  'SourceFile. Do not hand-edit this cell — edit that file, run ' +
  '\`node tools/kos-personal/generate-flow-prompts.js\`, push, and re-run syncFlowPrompts().';

`;

  const constantBlocks = constants.map(({ constName, body }) =>
    `const ${constName} = \`${escapeForTemplateLiteral(body)}\`;\n`
  ).join('\n');

  const fpPromptsEntries = constants.map(({ constName, mdFile, trailerKey }) =>
    `  { name: '${constName}', body: ${constName}, sourceFile: '${mdFile}', ` +
    `trailer: FP_TRAILERS.${trailerKey} },`
  ).join('\n');

  const footer = `
// Appended after a prompt's body when writing its Sheet cell — reconstructs
// that source .md file's own trailing "---\\n\\nPayload to Analyze:" shape,
// minus the placeholder(s) themselves, so a Gemini step's System Prompt
// field picks up exactly where the file's own [VARIABLE]-style placeholder
// was. 'single' covers every prompt with ONE variable (the trailer ends
// right where one @trigger.SourceText chip goes, nothing typed in
// between). 'auditor' is CURATOR_AUDITOR_SYSTEM_PROMPT's own shape — TWO
// variables (transcript, then the Curator's own output) — so its trailer
// ends after only the first label; syncFlowPrompts()'s own console output
// names the one small typed label Studio still needs before the second
// chip, since there's no way around a second variable needing a second
// insertion point.
const FP_TRAILERS = {
  single: '\\n\\n---\\n\\nPayload to Analyze:\\n',
  auditor: '\\n\\n---\\n\\nPayload to Analyze:\\n\\n' +
    'ORIGINAL TRANSCRIPT (verify claims against this):\\n',
};

function _fpAssemblePromptText_(body, trailer) {
  return body + trailer;
}

const FP_PROMPTS = [
${fpPromptsEntries}
];

/**
 * Writes the FlowPrompts tab: one row per prompt, ready for a Studio
 * "Get row" / "Look up row" step (filtered on PromptName) to feed a chip
 * into the Gemini step's System Prompt field — see
 * STUDIO_INTEGRATION_SPEC.md's banner for the full wiring.
 *
 * Idempotent — rewrites the whole tab, same discipline as
 * syncStudioFlowBuildSpec(). Touches ONLY this tab.
 */
function syncFlowPrompts() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const rows = [FP_HEADERS.slice()].concat(FP_PROMPTS.map(function (p) {
    return [p.name, _fpAssemblePromptText_(p.body, p.trailer), p.sourceFile, FP_NOTE];
  }));

  let sheet = ss.getSheetByName(FP_TAB);
  if (!sheet) sheet = ss.insertSheet(FP_TAB);
  sheet.clear();
  sheet.getRange(1, 1, rows.length, FP_HEADERS.length).setValues(rows);
  sheet.getRange(1, 1, 1, FP_HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  console.log('[FlowPrompts] wrote ' + (rows.length - 1) + ' row(s) to ' + FP_TAB + '.');
  console.log('[FlowPrompts] In Studio, for CURATOR_SYSTEM_PROMPT / VECTOR_CLASSIFY_SYSTEM_PROMPT: ' +
    'add a Sheets "Get row"/"Look up row" step filtered on PromptName = <the row you want>, then ' +
    'build the Gemini step\\'s System Prompt field as exactly two chips back to back — that step\\'s ' +
    'PromptText output, then @trigger.SourceText — nothing typed in between.');
  console.log('[FlowPrompts] For CURATOR_AUDITOR_SYSTEM_PROMPT specifically: TWO variables, not ' +
    'one — build the field as PromptText chip, then @trigger.SourceText (the transcript), then ' +
    'TYPE this label yourself: "\\n\\nCURATOR\\'S OUTPUT TO AUDIT (check this for accuracy and ' +
    'format compliance):\\n", then the Curator step\\'s own output chip. That one label is the only ' +
    'thing you type by hand in either flow — everything else is chips.');
  return { rows: rows.length - 1 };
}

/**
 * Read-only. Reports whether FlowPrompts exists and matches what the code
 * would generate right now — same shape as checkStudioFlowBuildSpec().
 */
function checkFlowPrompts() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sheet = ss.getSheetByName(FP_TAB);
  if (!sheet) {
    console.log('[FlowPrompts] ' + FP_TAB + ' has never been generated. Run syncFlowPrompts().');
    return { exists: false, current: false };
  }

  const expected = [FP_HEADERS.slice()].concat(FP_PROMPTS.map(function (p) {
    return [p.name, _fpAssemblePromptText_(p.body, p.trailer), p.sourceFile, FP_NOTE];
  }));
  const actual = sheet.getDataRange().getValues();
  const sameShape = actual.length === expected.length;
  const current = sameShape &&
    actual.map(function (r) { return r.join('\\u0001'); }).join('\\n') ===
    expected.map(function (r) { return r.join('\\u0001'); }).join('\\n');

  console.log('[FlowPrompts] ' + FP_TAB + ': ' + (actual.length - 1) + ' row(s), ' +
    (current ? 'current.' : 'STALE — a prompt constant changed since the last sync (or the tab ' +
      'was hand-edited). Re-run syncFlowPrompts().'));
  return { exists: true, current: current, rows: actual.length - 1, expectedRows: expected.length - 1 };
}
`;

  const output = header + constantBlocks + footer;
  const outPath = path.join(KP, '16_FlowPrompts.gs');
  fs.writeFileSync(outPath, output, 'utf8');
  console.log('Wrote ' + outPath + ' (' + constants.map(c => c.constName).join(', ') + ')');
}

main();
