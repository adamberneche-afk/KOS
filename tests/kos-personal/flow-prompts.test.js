'use strict';
// Regression tests for kos-personal/16_FlowPrompts.gs — the generated
// mirror of CURATOR_PROMPT.md / VECTOR_CLASSIFY_PROMPT.md that lets a
// Studio Flow pull a prompt in via a chip instead of a hand-pasted block.
//
// Two different things are being verified here, and it matters which is
// which:
//   1. syncFlowPrompts()/checkFlowPrompts() behave correctly against a
//      fake Sheet (same gas-sandbox pattern as studio-flow-build-spec.test.js).
//   2. THE ACTUAL DRIFT GUARD: 16_FlowPrompts.gs's two prompt constants
//      still match what tools/kos-personal/generate-flow-prompts.js would
//      produce FROM the current CURATOR_PROMPT.md / VECTOR_CLASSIFY_PROMPT.md
//      right now. Edit either .md file, forget to re-run the generator, and
//      this is the test that fails — the CI gate this whole mechanism
//      depends on, since Apps Script itself has no way to notice the two
//      have disagreed.

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
  'syncFlowPrompts', 'checkFlowPrompts', 'FP_TAB', 'FP_HEADERS', 'FP_PROMPTS',
  'CURATOR_SYSTEM_PROMPT', 'VECTOR_CLASSIFY_SYSTEM_PROMPT', 'CFG',
  '_getSystemAsset', '_getOrCreateSheet',
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

test('syncFlowPrompts: writes a FlowPrompts tab with both prompts', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  const result = exported.syncFlowPrompts();
  assert.equal(result.rows, 2);

  const ss = indexSpreadsheet(exported, sandbox);
  const sheet = ss.getSheetByName(exported.FP_TAB);
  assert.ok(sheet, 'FlowPrompts tab was created');
  const rows = sheet.getDataRange().getValues();
  assert.deepEqual(rows[0], exported.FP_HEADERS);

  const names = rows.slice(1).map((r) => r[0]);
  assert.ok(names.includes('CURATOR_SYSTEM_PROMPT'));
  assert.ok(names.includes('VECTOR_CLASSIFY_SYSTEM_PROMPT'));
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

test('each FlowPrompts row ends with "Payload to Analyze:" so only the SourceText chip is missing', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.syncFlowPrompts();
  const ss = indexSpreadsheet(exported, sandbox);
  const rows = ss.getSheetByName(exported.FP_TAB).getDataRange().getValues();
  rows.slice(1).forEach((r) => {
    assert.ok(r[1].endsWith('Payload to Analyze:\n'),
      r[0] + '\'s PromptText should end exactly where the SourceText chip picks up');
  });
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
