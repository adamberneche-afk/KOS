'use strict';
// Regression tests for kos-personal/16_FlowPrompts.gs — the generated
// mirror of CURATOR_PROMPT.md / VECTOR_CLASSIFY_PROMPT.md /
// CURATOR_AUDITOR_PROMPT.md that lets a Studio Flow pull a prompt in via a
// chip instead of a hand-pasted block.
//
// Two different things are being verified here, and it matters which is
// which:
//   1. syncFlowPrompts()/checkFlowPrompts() behave correctly against a
//      fake Sheet (same gas-sandbox pattern as studio-flow-build-spec.test.js).
//   2. THE ACTUAL DRIFT GUARD: 16_FlowPrompts.gs's three prompt constants
//      still match what tools/kos-personal/generate-flow-prompts.js would
//      produce FROM the current .md files right now. Edit a .md file,
//      forget to re-run the generator, and this is the test that fails —
//      the CI gate this whole mechanism depends on, since Apps Script
//      itself has no way to notice the two have disagreed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const REPO_ROOT = path.join(__dirname, '..', '..');
const KP = path.join(REPO_ROOT, 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '16_FlowPrompts.gs'),
];

const EXPOSE = [
  'syncFlowPrompts', 'checkFlowPrompts', 'FP_TAB', 'FP_HEADERS', 'FP_PROMPTS', 'FP_TRAILERS',
  'CURATOR_SYSTEM_PROMPT', 'VECTOR_CLASSIFY_SYSTEM_PROMPT', 'CURATOR_AUDITOR_SYSTEM_PROMPT',
  'CFG', '_getSystemAsset', '_getOrCreateSheet',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

function indexSpreadsheet(exported, sandbox) {
  const props = sandbox.PropertiesService.getScriptProperties();
  const existing = props.getProperty('INDEX_ID');
  if (existing) return sandbox.SpreadsheetApp.openById(existing);
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());
  return ss;
}

// Same extraction rule as tools/kos-personal/generate-flow-prompts.js —
// duplicated here deliberately rather than required from that script, so a
// bug introduced in the generator's own extraction logic doesn't silently
// validate itself. This is a plain, independent re-derivation.
const START_MARKER = '## 1. IDENTITY & SCOPE';
const END_MARKER = '\n---\n\nPayload to Analyze:';
function extractPromptBody(mdText) {
  const startIdx = mdText.indexOf(START_MARKER);
  const endIdx = mdText.indexOf(END_MARKER, startIdx);
  assert.notEqual(startIdx, -1, 'start marker missing');
  assert.notEqual(endIdx, -1, 'end marker missing');
  return mdText.slice(startIdx, endIdx).trim();
}

test('syncFlowPrompts: writes a FlowPrompts tab with all three prompts', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  const result = exported.syncFlowPrompts();
  assert.equal(result.rows, 3);

  const ss = indexSpreadsheet(exported, sandbox);
  const sheet = ss.getSheetByName(exported.FP_TAB);
  assert.ok(sheet, 'FlowPrompts tab was created');
  const rows = sheet.getDataRange().getValues();
  assert.deepEqual(rows[0], exported.FP_HEADERS);

  const names = rows.slice(1).map((r) => r[0]);
  assert.ok(names.includes('CURATOR_SYSTEM_PROMPT'));
  assert.ok(names.includes('VECTOR_CLASSIFY_SYSTEM_PROMPT'));
  assert.ok(names.includes('CURATOR_AUDITOR_SYSTEM_PROMPT'));
});

test('syncFlowPrompts: never touches FlowBuildSpec or any other existing tab', () => {
  const { exported, sandbox } = load();
  const ss = indexSpreadsheet(exported, sandbox);
  // Plant a decoy tab first, standing in for FlowBuildSpec/STAGING_PIPELINE/etc.
  const decoy = ss.insertSheet('FlowBuildSpec');
  decoy.getRange(1, 1, 1, 2).setValues([['untouched', 'sentinel']]);

  exported.syncFlowPrompts();

  const stillThere = ss.getSheetByName('FlowBuildSpec').getDataRange().getValues();
  assert.deepEqual(stillThere, [['untouched', 'sentinel']],
    'syncFlowPrompts() must only ever write its own FlowPrompts tab');
});

test('CURATOR_SYSTEM_PROMPT / VECTOR_CLASSIFY_SYSTEM_PROMPT rows end at "Payload to Analyze:" — one chip left to add', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.syncFlowPrompts();
  const ss = indexSpreadsheet(exported, sandbox);
  const rows = ss.getSheetByName(exported.FP_TAB).getDataRange().getValues();
  ['CURATOR_SYSTEM_PROMPT', 'VECTOR_CLASSIFY_SYSTEM_PROMPT'].forEach((name) => {
    const row = rows.find((r) => r[0] === name);
    assert.ok(row[1].endsWith('Payload to Analyze:\n'),
      name + '\'s PromptText should end exactly where the SourceText chip picks up');
  });
});

test('CURATOR_AUDITOR_SYSTEM_PROMPT row ends after the FIRST of its two variable labels', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.syncFlowPrompts();
  const ss = indexSpreadsheet(exported, sandbox);
  const rows = ss.getSheetByName(exported.FP_TAB).getDataRange().getValues();
  const row = rows.find((r) => r[0] === 'CURATOR_AUDITOR_SYSTEM_PROMPT');
  assert.ok(row[1].endsWith('ORIGINAL TRANSCRIPT (verify claims against this):\n'),
    'the auditor prompt cell should end right where the SourceText chip goes — the SECOND ' +
    'label (Curator\'s output) is still typed by hand in Studio, per syncFlowPrompts()\'s own log');
  assert.ok(row[1].indexOf('Payload to Analyze:') !== -1);
});

test('checkFlowPrompts: reports missing before a sync, current immediately after', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  assert.equal(exported.checkFlowPrompts().exists, false);
  exported.syncFlowPrompts();
  const after = exported.checkFlowPrompts();
  assert.equal(after.exists, true);
  assert.equal(after.current, true);
});

test('checkFlowPrompts: STALE after a hand-edit to a synced row', () => {
  const { exported, sandbox } = load();
  const ss = indexSpreadsheet(exported, sandbox);
  exported.syncFlowPrompts();
  const sheet = ss.getSheetByName(exported.FP_TAB);
  sheet.getRange(2, 2).setValue('someone typed over the generated cell');
  assert.equal(exported.checkFlowPrompts().current, false);
});

test('DRIFT GUARD: CURATOR_SYSTEM_PROMPT still matches CURATOR_PROMPT.md', () => {
  const { exported } = load();
  const mdText = fs.readFileSync(path.join(KP, 'CURATOR_PROMPT.md'), 'utf8');
  const expected = extractPromptBody(mdText);
  assert.equal(exported.CURATOR_SYSTEM_PROMPT, expected,
    'CURATOR_PROMPT.md changed without re-running ' +
    'tools/kos-personal/generate-flow-prompts.js — regenerate 16_FlowPrompts.gs');
});

test('DRIFT GUARD: VECTOR_CLASSIFY_SYSTEM_PROMPT still matches VECTOR_CLASSIFY_PROMPT.md', () => {
  const { exported } = load();
  const mdText = fs.readFileSync(path.join(KP, 'VECTOR_CLASSIFY_PROMPT.md'), 'utf8');
  const expected = extractPromptBody(mdText);
  assert.equal(exported.VECTOR_CLASSIFY_SYSTEM_PROMPT, expected,
    'VECTOR_CLASSIFY_PROMPT.md changed without re-running ' +
    'tools/kos-personal/generate-flow-prompts.js — regenerate 16_FlowPrompts.gs');
});

test('DRIFT GUARD: CURATOR_AUDITOR_SYSTEM_PROMPT still matches CURATOR_AUDITOR_PROMPT.md', () => {
  const { exported } = load();
  const mdText = fs.readFileSync(path.join(KP, 'CURATOR_AUDITOR_PROMPT.md'), 'utf8');
  const expected = extractPromptBody(mdText);
  assert.equal(exported.CURATOR_AUDITOR_SYSTEM_PROMPT, expected,
    'CURATOR_AUDITOR_PROMPT.md changed without re-running ' +
    'tools/kos-personal/generate-flow-prompts.js — regenerate 16_FlowPrompts.gs');
});

test('CURATOR_AUDITOR_SYSTEM_PROMPT never produces its own session summary — only checks the Curator\'s', () => {
  const { exported } = load();
  // Whitespace-normalized: the real prompt wraps this phrase across a line
  // break, so a literal multi-word substring check would be brittle
  // against a future re-wrap that changes nothing meaningful.
  const text = exported.CURATOR_AUDITOR_SYSTEM_PROMPT.toLowerCase().replace(/\s+/g, ' ');
  assert.ok(text.indexOf('you do not extract, summarize, or analyze the session yourself') !== -1,
    'the scope boundary against acting as a second Curator should be explicit');
});

test('CURATOR_AUDITOR_SYSTEM_PROMPT\'s output schema matches what _isAuditFailure_ actually reads', () => {
  const { exported } = load();
  const text = exported.CURATOR_AUDITOR_SYSTEM_PROMPT;
  ['"status"', '"unverified_claims_count"', '"trace_log"'].forEach((key) => {
    assert.ok(text.indexOf(key) !== -1, 'schema example is missing ' + key);
  });
});
