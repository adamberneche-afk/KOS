'use strict';
// Regression tests for leader-hub/AiPrompts.gs — the deployable home for the
// six AI-flow system prompts, and the AI_Prompts tab a Flow can read its own
// prompt from instead of carrying a pasted copy.
//
// The load-bearing tests here are the PROVENANCE ones. Each constant in that
// file was extracted mechanically from its own *_FLOW_PROMPT.md (the text
// after the first standalone "---"), and nothing else in this repo would
// notice if a .md file were edited and the constant left behind — the Flows
// would quietly keep running the old text. So these re-run that exact split
// against all six files and demand a byte-for-byte match.
//
// A failure there means "the .md file and the constant disagree," not "the
// code is broken": decide which is right, then update the other.
//
// Loaded together with EmailBridge.gs because AiPrompts.gs reuses its
// _getAiQueueSheet_()/AI_QUEUE_SHEET_PROP (rather than duplicating the
// create-if-missing logic) and cross-checks its AI_FLOW_TYPES — both bound to
// the same GAS project, leader-hub:app, see tools/gas-lint/project-map.json.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const EMAILBRIDGE_PATH = path.join(LH, 'EmailBridge.gs');
const AI_PROMPTS_PATH = path.join(LH, 'AiPrompts.gs');

const JOB_TYPES = ['EMAIL_COMPOSE', 'ARCHIVE_INSIGHTS', 'WBL_INSIGHTS',
                   'LP_ASSIST', 'FIN_ANALYSIS', 'BRAG_EMAIL'];

function load() {
  return loadGasFiles([EMAILBRIDGE_PATH, AI_PROMPTS_PATH], [
    'syncAiPromptsToSheet', 'checkAiPrompts', 'aiPromptText_',
    'AI_PROMPT_TAB', 'AI_PROMPT_HEADERS', 'AI_PROMPT_TITLES',
    'AI_FLOW_TYPES', 'AI_QUEUE_SHEET_PROP', 'AI_QUEUE_SHEET_NAME',
    'queueAiJob_',
  ]);
}

// The same split AiPrompts.gs's header documents: everything after the first
// standalone "---" line. What precedes it is the file's own "paste this
// verbatim" preamble — instructions to a human, not part of the prompt.
function promptFromMarkdown(jobType) {
  const raw = fs.readFileSync(path.join(LH, jobType + '_FLOW_PROMPT.md'), 'utf8');
  const parts = raw.split(/^---$/m);
  assert.equal(parts.length, 2, jobType + '_FLOW_PROMPT.md should have exactly one "---"');
  return parts[1].trim();
}

// ── Provenance ───────────────────────────────────────────────────────────────

test('every prompt constant is byte-identical to the .md file it came from', () => {
  const { exported } = load();
  JOB_TYPES.forEach((jobType) => {
    assert.equal(exported.aiPromptText_(jobType), promptFromMarkdown(jobType),
      jobType + ' has drifted from ' + jobType + '_FLOW_PROMPT.md');
  });
});

test('the registry covers exactly EmailBridge.gs\'s AI_FLOW_TYPES, no more, no less', () => {
  const { exported } = load();
  // If a job type is added to AI_FLOW_TYPES without a prompt here, its Flow
  // silently has nothing to read — so the two lists must stay in step.
  assert.deepEqual([...exported.AI_FLOW_TYPES].sort(), [...JOB_TYPES].sort());
  exported.AI_FLOW_TYPES.forEach((jobType) => {
    assert.ok(exported.aiPromptText_(jobType).length > 1000,
      jobType + ' resolved to ' + exported.aiPromptText_(jobType).length + ' chars — looks truncated');
  });
});

test('an unknown job type resolves to empty rather than throwing', () => {
  const { exported } = load();
  assert.equal(exported.aiPromptText_('NOT_A_TYPE'), '');
});

test('the fenced json example blocks survived escaping into template literals', () => {
  const { exported } = load();
  // These prompts describe their payload with fenced json blocks, so the
  // generated constants needed backtick escaping. If that went wrong the text
  // would be truncated at the first fence or carry stray backslashes.
  const withFences = JOB_TYPES.filter((t) => exported.aiPromptText_(t).indexOf('```json') !== -1);
  assert.ok(withFences.length >= 5, 'expected most prompts to carry a fenced json block');
  JOB_TYPES.forEach((t) => {
    assert.equal(exported.aiPromptText_(t).indexOf('\\`'), -1,
      t + ' contains a literal backslash-backtick — escaping leaked into the text');
  });
});

test('LEADERHUB_GEM_PROMPT.md is deliberately not in the registry', () => {
  const { exported } = load();
  // It's the interactive Gem persona, not a Flow system prompt — and
  // LEADERHUB_AI_FLOW_SETUP.md's job-type table doesn't list it.
  assert.ok(fs.existsSync(path.join(LH, 'LEADERHUB_GEM_PROMPT.md')), 'the file still exists');
  assert.equal(exported.AI_FLOW_TYPES.indexOf('LEADERHUB_GEM'), -1);
});

test('no prompt carries template placeholders — input arrives via @trigger.Payload', () => {
  const { exported } = load();
  // AiPrompts.gs deliberately has no substitution machinery, unlike
  // cas-ccps/scripts/40_FlowPrompts.js. This asserts the premise: these
  // prompts are static, so there is nothing to substitute. Braces DO appear
  // inside fenced json examples, so only {{DOUBLE_BRACE}} style is checked —
  // that's the shape a real template placeholder would take here.
  JOB_TYPES.forEach((jobType) => {
    const doubles = exported.aiPromptText_(jobType).match(/\{\{[A-Za-z_0-9]+\}\}/g);
    assert.equal(doubles, null,
      jobType + ' contains ' + doubles + ' — if prompts start interpolating, this file ' +
      'needs a substitution step and this test should change deliberately');
  });
});

// ── syncAiPromptsToSheet ─────────────────────────────────────────────────────

test('syncAiPromptsToSheet: writes one row per job type, into the AI queue spreadsheet', () => {
  const { exported, sandbox } = load();

  const result = exported.syncAiPromptsToSheet();
  assert.equal(result.synced, JOB_TYPES.length);
  assert.equal(result.oversize, 0);

  // Must land in the SAME spreadsheet the Flows already trigger on — that's
  // the whole reason a fixed-picker Sheets connector can reach it without a
  // second file to authorize.
  const ssId = sandbox.PropertiesService.getScriptProperties()
    .getProperty(exported.AI_QUEUE_SHEET_PROP);
  assert.ok(ssId, 'the queue spreadsheet ID property should be set');
  const ss = sandbox.SpreadsheetApp.openById(ssId);
  assert.ok(ss.getSheetByName(exported.AI_QUEUE_SHEET_NAME), 'AI_Queue is a sibling tab');

  const sheet = ss.getSheetByName(exported.AI_PROMPT_TAB);
  assert.ok(sheet, 'AI_Prompts tab exists');
  const data = sheet.getDataRange().getValues();
  assert.deepEqual(data[0], exported.AI_PROMPT_HEADERS);
  assert.equal(data.length, JOB_TYPES.length + 1);

  const keyCol = exported.AI_PROMPT_HEADERS.indexOf('job_type');
  const textCol = exported.AI_PROMPT_HEADERS.indexOf('prompt_text');
  JOB_TYPES.forEach((jobType) => {
    const row = data.find((r) => String(r[keyCol]).trim() === jobType);
    assert.ok(row, jobType + ' missing from the sheet');
    assert.equal(row[textCol], exported.aiPromptText_(jobType),
      jobType + "'s sheet text must match the code exactly — it's what the Flow reads");
    assert.equal(row[exported.AI_PROMPT_HEADERS.indexOf('title')],
      exported.AI_PROMPT_TITLES[jobType]);
  });
});

test('syncAiPromptsToSheet: is idempotent and clears stale rows', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();

  const ssId = sandbox.PropertiesService.getScriptProperties()
    .getProperty(exported.AI_QUEUE_SHEET_PROP);
  const sheet = sandbox.SpreadsheetApp.openById(ssId).getSheetByName(exported.AI_PROMPT_TAB);
  // A row for a retired job type — a Flow keyed on job_type would still find
  // it, so the sync has to clear it rather than leave it behind.
  sheet.appendRow(['RETIRED_TYPE', 'gone', 5, new Date(), 'stale text']);

  exported.syncAiPromptsToSheet();
  const data = sheet.getDataRange().getValues();
  assert.equal(data.length, JOB_TYPES.length + 1);
  assert.ok(!data.some((r) => String(r[0]).trim() === 'RETIRED_TYPE'));
});

test('syncAiPromptsToSheet: does not disturb AI_Queue rows in the same spreadsheet', () => {
  const { exported, sandbox } = load();
  // The queue and the prompts share one file; syncing prompts must not touch
  // a job someone is waiting on.
  const queued = exported.queueAiJob_({ type: 'BRAG_EMAIL', payload: { x: 1 } });
  exported.syncAiPromptsToSheet();

  const ssId = sandbox.PropertiesService.getScriptProperties()
    .getProperty(exported.AI_QUEUE_SHEET_PROP);
  const queue = sandbox.SpreadsheetApp.openById(ssId).getSheetByName('AI_Queue');
  const rows = queue.getDataRange().getValues();
  assert.ok(rows.some((r) => String(r[1]).trim() === queued.jobId),
    'the queued job row survives a prompt sync');
});

// ── checkAiPrompts ───────────────────────────────────────────────────────────

test('checkAiPrompts: all in sync right after a sync', () => {
  const { exported } = load();
  exported.syncAiPromptsToSheet();

  const report = exported.checkAiPrompts();
  assert.equal(report.inSync, JOB_TYPES.length);
  assert.equal(report.drifted, 0);
  assert.equal(report.missing, 0);
  assert.equal(report.unregistered, 0);
});

test('checkAiPrompts: everything missing before the first sync, without throwing', () => {
  const { exported } = load();
  const report = exported.checkAiPrompts();
  assert.equal(report.missing, JOB_TYPES.length);
  assert.equal(report.inSync, 0);
});

test('checkAiPrompts: catches a prompt changed in code but never re-synced', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();

  // Exactly the situation this exists for: the code moved on, the sheet the
  // Flows read did not.
  const ssId = sandbox.PropertiesService.getScriptProperties()
    .getProperty(exported.AI_QUEUE_SHEET_PROP);
  const sheet = sandbox.SpreadsheetApp.openById(ssId).getSheetByName(exported.AI_PROMPT_TAB);
  const textCol = exported.AI_PROMPT_HEADERS.indexOf('prompt_text') + 1;
  sheet.getRange(2, textCol).setValue('hand-edited, no longer matches the code');

  const report = exported.checkAiPrompts();
  assert.equal(report.drifted, 1);
  assert.equal(report.inSync, JOB_TYPES.length - 1);
});
