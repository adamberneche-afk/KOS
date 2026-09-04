'use strict';
// Regression tests for cas-ccps/scripts/42_FlowBuildSpec.js — the sheet an
// operator builds a Studio Flow from.
//
// WHY A GENERATED SHEET AT ALL. The values to type into Studio were spread
// across six files in three formats (JS comment blocks, a GAS wizard dialog,
// markdown) — about 3,350 lines from which the operator reconstructs a step
// list. That scatter produced a confirmed hazard: 15b's Step 1 note renders
// the student-doc markers in that comment block's em-dash-normalized style,
// so copying from it puts plain hyphens into Studio's Extract step, which
// matches nothing and returns empty.
//
// So the guarantee worth testing is not "the sheet has rows". It is that
// every column number and header in it is DERIVED from the constant the code
// actually reads, and that the sheet does not quietly re-transcribe the
// authored half and become a seventh document to keep in sync.
//
// The three tests that matter most:
//   - column numbers match the FI / WFB / TM constants, not a literal list
//   - exactly one column is marked as the Flow's to write, per surface
//   - checkFlowBuildSpec() reports STALE when a constant moves

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [
  S('00_SharedConfig.js'), S('15b_StudioFlowPrompts_Flow2_Revised.js'),
  S('25_WarmUpWriter.js'), S('37_FlowInputBuilder.js'), S('40_FlowPrompts.js'),
  S('41_WarmUpFlowBridge.js'), S('42_FlowBuildSpec.js'),
];

const EXPOSE = [
  'syncFlowBuildSpec', 'checkFlowBuildSpec', 'FBS_TAB', 'FBS_HEADERS',
  'FI', 'FI_TM_COLUMNS_', 'FLOW_PROMPT_TAB',
  'WFB_RETURN_HEADERS', 'WFB_RET', 'WFB_RETURN_TAB', 'WFB_INPUT_TABS',
  'WFB_FLOW3_HEADERS', 'WFB_FLOW4_HEADERS', 'WFB_FLOW5_HEADERS', 'WFB_TRIGGER_STATUS',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

function setUp(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  return ss;
}

function specRows(exported, ss) {
  const values = ss.getSheetByName(exported.FBS_TAB).getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).map((r) => {
    const row = {};
    headers.forEach((h, i) => { row[String(h)] = r[i]; });
    return row;
  });
}

// ── Generation ───────────────────────────────────────────────────────────────

test('syncFlowBuildSpec: writes a tab covering all five flows', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const result = exported.syncFlowBuildSpec();
  assert.ok(result.rows > 50, 'rows: ' + result.rows);

  const rows = specRows(exported, ss);
  ['Flow 1', 'Flow 2', 'Flow 3', 'Flow 4', 'Flow 5'].forEach((flow) => {
    assert.ok(rows.some((r) => r.flow === flow), flow + ' has no rows');
  });
});

test('syncFlowBuildSpec: is idempotent — a second run does not append', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const first = exported.syncFlowBuildSpec();
  const second = exported.syncFlowBuildSpec();
  assert.equal(first.rows, second.rows);
  assert.equal(ss.getSheetByName(exported.FBS_TAB).getLastRow(), first.rows + 1);
});

// ── The derivation, which is the whole point ─────────────────────────────────

test('FlowInput column numbers are derived from FI, not transcribed', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();

  // If these were a hand-written list they would drift the moment a column
  // was appended — which has already happened twice to FlowInput
  // (GeminiFullOutput, then PromptText).
  const rows = specRows(exported, ss).filter((r) => r.tab === 'FlowInput' && r.column);
  Object.keys(exported.FI).forEach((key) => {
    const expectedCol = exported.FI[key] + 1;
    const row = rows.find((r) => String(r.header) === key);
    assert.ok(row, 'FI.' + key + ' has no row in the spec');
    assert.equal(Number(row.column), expectedCol,
      'FI.' + key + ' is listed at column ' + row.column + ', constant says ' + expectedCol);
  });
});

test('the return surface is derived from WFB_RETURN_HEADERS and WFB_RET', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();

  const rows = specRows(exported, ss).filter((r) => r.tab === exported.WFB_RETURN_TAB && r.column);
  assert.equal(rows.length, exported.WFB_RETURN_HEADERS.length);
  exported.WFB_RETURN_HEADERS.forEach((h, i) => {
    const row = rows.find((r) => Number(r.column) === i + 1);
    assert.equal(String(row.header), h);
  });
});

test('every TeacherMatrix column the Flow 2 builder reads says so, by constant name', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();

  // The load-bearing warning on that surface: Flow 1 writes the matrix and
  // 37_FlowInputBuilder.js reads it by position, so a shift silently feeds
  // Flow 2 the wrong field. The spec has to name which columns those are.
  const rows = specRows(exported, ss).filter((r) => r.tab === 'TeacherMatrix' && r.column);
  Object.keys(exported.FI_TM_COLUMNS_).forEach((key) => {
    const col = exported.FI_TM_COLUMNS_[key] + 1;
    const row = rows.find((r) => Number(r.column) === col);
    assert.ok(row, 'no spec row for TeacherMatrix column ' + col);
    assert.match(String(row.notes), new RegExp('FI_TM_COLUMNS_\\.' + key),
      'column ' + col + ' should name the constant that reads it: ' + row.notes);
  });
});

test('each warm-up input tab is listed at its real width', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();
  const rows = specRows(exported, ss);
  const widths = {
    3: exported.WFB_FLOW3_HEADERS.length,
    4: exported.WFB_FLOW4_HEADERS.length,
    5: exported.WFB_FLOW5_HEADERS.length,
  };
  [3, 4, 5].forEach((flow) => {
    const tab = exported.WFB_INPUT_TABS[flow];
    const cols = rows.filter((r) => r.tab === tab && r.column && r.surface === 'read');
    assert.equal(cols.length, widths[flow], tab + ' listed ' + cols.length + ' of ' + widths[flow]);
  });
});

test('each flow names its trigger condition, taken from the status constants', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();
  const triggers = specRows(exported, ss).filter((r) => r.surface === 'trigger');

  // Five flows, five trigger rows. A flow whose trigger condition an operator
  // has to infer is the second of the four causes of "nothing happened".
  assert.ok(triggers.length >= 5, 'only ' + triggers.length + ' trigger rows');
  [3, 4, 5].forEach((flow) => {
    const row = triggers.find((r) => r.flow === 'Flow ' + flow);
    assert.match(String(row.notes), new RegExp(exported.WFB_TRIGGER_STATUS[flow]),
      'Flow ' + flow + ' should name the WarmUpQueue status it materializes from');
  });
  assert.match(String(triggers.find((r) => r.flow === 'Flow 1').notes), /PENDING_EXTRACTION/);
  assert.match(String(triggers.find((r) => r.flow === 'Flow 2').notes), /READY/);
});

// ── Ownership, the thing a mis-binding gets wrong ────────────────────────────

test('exactly two FlowInput columns are marked as the Flow\'s to write', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();

  // Flow 2's update-row step must write BOTH GeminiFullOutput and
  // ReadyStatus (= "EVALUATED") in the same step. Corrected during live
  // redeployment: a build that wrote only GeminiFullOutput ran successfully
  // in Studio but was never harvested, because harvestFlowInputResults()
  // only processes rows already at EVALUATED and nothing else makes that
  // transition. checkFlow2Binding() now flags that specific gap as
  // "stuck at READY" — exists because the failure is otherwise invisible.
  const writes = specRows(exported, ss)
    .filter((r) => r.tab === 'FlowInput' && r.surface === 'write');
  assert.equal(writes.length, 2);
  const columns = writes.map((w) => Number(w.column)).sort((a, b) => a - b);
  assert.deepEqual(columns, [
    exported.FI.READY_STATUS + 1, exported.FI.GEMINI_FULL_OUTPUT + 1,
  ].sort((a, b) => a - b));
  const outputRow = writes.find((w) => Number(w.column) === exported.FI.GEMINI_FULL_OUTPUT + 1);
  const statusRow = writes.find((w) => Number(w.column) === exported.FI.READY_STATUS + 1);
  assert.match(String(outputRow.notes), /TWO columns/);
  assert.match(String(statusRow.notes), /EVALUATED/);
});

test('the return tab marks the harvest-owned columns "leave empty"', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();
  const rows = specRows(exported, ss).filter((r) => r.tab === exported.WFB_RETURN_TAB && r.column);

  rows.forEach((r) => {
    const idx = Number(r.column) - 1;
    if (idx <= exported.WFB_RET.RAW_OUTPUT) {
      assert.equal(r.surface, 'write', r.header + ' should be the Flow\'s to write');
    } else {
      assert.equal(r.surface, 'leave empty', r.header + ' is the harvest\'s');
      assert.match(String(r.notes), /LEAVE EMPTY/);
    }
  });
});

test('the doc markers are given as box-drawing characters, with the hyphen trap named', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();
  const rows = specRows(exported, ss);

  // The confirmed hazard this sheet exists to defuse. The marker has to
  // appear here in its real form, and the note has to say why not to copy
  // 15b's rendering of it.
  const marker = rows.find((r) => String(r.header).indexOf('YOUR RESPONSE BEGINS') !== -1);
  assert.ok(marker, 'the response marker is not in the spec');
  assert.match(String(marker.header), /──/, 'must carry the box-drawing form');
  const warning = rows.find((r) => /normalizes\s+em-dashes|em-dashes/.test(String(r.notes)));
  assert.ok(warning, 'nothing warns about 15b\'s hyphen rendering');
  assert.match(String(warning.notes), /matches nothing/);
});

test('blocked custom steps are called out where an operator would follow the spec into them', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();
  const narratives = specRows(exported, ss).filter((r) => r.surface === 'narrative');

  // Pointing at a document whose connector tables call for a custom step that
  // cannot run is exactly the stale pointer that has cost time repeatedly. A
  // generated sheet can flag it; the document cannot flag itself.
  assert.ok(narratives.length >= 2);
  narratives.forEach((r) => {
    assert.match(String(r.notes), /BLOCKED/, r.who_writes_it + ' should warn about the blocked steps');
  });
});

test('prompts are referenced by key rather than pasted', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();
  const prompts = specRows(exported, ss).filter((r) => r.surface === 'prompt');
  assert.ok(prompts.length >= 5);
  prompts.forEach((r) => {
    assert.equal(r.tab, exported.FLOW_PROMPT_TAB);
    // Pasting prompt text into this sheet would make it a second copy to keep
    // in sync — the problem, not the fix.
    assert.ok(String(r.header).length < 40, 'looks like pasted prompt text: ' + r.header);
  });
});

// ── Staleness ────────────────────────────────────────────────────────────────

test('checkFlowBuildSpec: reports current right after a sync', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  exported.syncFlowBuildSpec();
  const report = exported.checkFlowBuildSpec();
  assert.equal(report.exists, true);
  assert.equal(report.current, true);
});

test('checkFlowBuildSpec: reports absent before the first sync, without throwing', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const report = exported.checkFlowBuildSpec();
  assert.equal(report.exists, false);
  assert.equal(report.current, false);
});

test('checkFlowBuildSpec: STALE once a column number in the sheet no longer matches', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();

  // Simulates the real drift: a constant moved, so the sheet an operator
  // already built from is describing the old layout. That is the one thing
  // this has over a hand-written document — the drift is visible.
  const sheet = ss.getSheetByName(exported.FBS_TAB);
  const colIdx = exported.FBS_HEADERS.indexOf('column') + 1;
  sheet.getRange(3, colIdx).setValue(99);

  const report = exported.checkFlowBuildSpec();
  assert.equal(report.current, false);
});

test('checkFlowBuildSpec: a reworded note is NOT stale', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.syncFlowBuildSpec();
  // Comparison is on flow|surface|tab|column|header. Diffing the notes too
  // would flag every wording change as drift, which trains the reader to
  // ignore the report.
  const sheet = ss.getSheetByName(exported.FBS_TAB);
  const notesIdx = exported.FBS_HEADERS.indexOf('notes') + 1;
  sheet.getRange(3, notesIdx).setValue('someone added a local note here');

  assert.equal(exported.checkFlowBuildSpec().current, true);
});
