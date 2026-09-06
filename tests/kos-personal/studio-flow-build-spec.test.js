'use strict';
// Regression tests for kos-personal/14_StudioFlowBuildSpec.gs — the
// friction cas-ccps/scripts/42_FlowBuildSpec.js addresses there, closing
// the one gap kos-personal had that cas-ccps and leader-hub didn't: every
// value to type into Studio lived only in STUDIO_INTEGRATION_SPEC.md's
// hand-written prose, with nothing generated FROM the code's own column
// constants to catch drift.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '12_StudioReturnHarvest.gs'),
  path.join(KP, '13_StudioInputBuilder.gs'),
  path.join(KP, '14_StudioFlowBuildSpec.gs'),
];

const EXPOSE = [
  'syncStudioFlowBuildSpec', 'checkStudioFlowBuildSpec', 'SFBS_TAB', 'SFBS_HEADERS',
  'CI_COLS', 'CI_CURATOR_TAB', 'CI_CLASSIFY_TAB', 'SR_COLS', 'SR_SHEET', 'SR_CURATOR_TYPES',
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

test('syncStudioFlowBuildSpec: writes a FlowBuildSpec tab covering both flows and the return surface', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  const result = exported.syncStudioFlowBuildSpec();
  assert.ok(result.rows > 0, JSON.stringify(result));

  const ss = indexSpreadsheet(exported, sandbox);
  const sheet = ss.getSheetByName(exported.SFBS_TAB);
  assert.ok(sheet, 'FlowBuildSpec tab was created');
  const rows = sheet.getDataRange().getValues();
  assert.deepEqual(rows[0], exported.SFBS_HEADERS);

  const flows = new Set(rows.slice(1).map((r) => r[0]));
  assert.ok(flows.has('Curator'), 'Curator flow rows present');
  assert.ok(flows.has('Classify'), 'Classify flow rows present');
  assert.ok(flows.has('Both'), 'shared STUDIO_RETURN surface rows present');
});

test('syncStudioFlowBuildSpec: the Curator trigger row names a SINGLE condition on CuratorInput', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.syncStudioFlowBuildSpec();
  const ss = indexSpreadsheet(exported, sandbox);
  const rows = ss.getSheetByName(exported.SFBS_TAB).getDataRange().getValues();

  const triggerRow = rows.find((r) => r[0] === 'Curator' && r[1] === 'trigger');
  assert.ok(triggerRow, 'a Curator trigger row exists');
  assert.equal(triggerRow[2], exported.CI_CURATOR_TAB);
  assert.match(triggerRow[6], /meta\/FLOW_DOCTRINE\.md rule 14/,
    'names the doctrine rule this design satisfies');
});

test('syncStudioFlowBuildSpec: column numbers and headers are derived from CI_COLS, not retyped', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.syncStudioFlowBuildSpec();
  const ss = indexSpreadsheet(exported, sandbox);
  const rows = ss.getSheetByName(exported.SFBS_TAB).getDataRange().getValues();

  const sourceTextRow = rows.find((r) =>
    r[0] === 'Curator' && r[1] === 'read' && r[4] === 'SourceText');
  assert.ok(sourceTextRow, 'a SourceText read row exists');
  assert.equal(sourceTextRow[3], exported.CI_COLS.SOURCE_TEXT + 1,
    'column number matches CI_COLS.SOURCE_TEXT (1-indexed)');
  assert.match(sourceTextRow[6], /@trigger\.SourceText/);
});

test('syncStudioFlowBuildSpec: STUDIO_RETURN rows say who owns each column, harvest columns marked EMPTY', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.syncStudioFlowBuildSpec();
  const ss = indexSpreadsheet(exported, sandbox);
  const rows = ss.getSheetByName(exported.SFBS_TAB).getDataRange().getValues();

  const primaryJson = rows.find((r) => r[2] === exported.SR_SHEET && r[4] === 'Primary_JSON');
  assert.equal(primaryJson[5], 'the Flow');
  const harvestStatus = rows.find((r) => r[2] === exported.SR_SHEET && r[4] === 'Harvest_Status');
  assert.match(harvestStatus[5], /harvestStudioReturns.*leave EMPTY/);
});

test('syncStudioFlowBuildSpec: is idempotent — re-running rewrites the same shape, not appends', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.syncStudioFlowBuildSpec();
  const first = exported.syncStudioFlowBuildSpec();
  const ss = indexSpreadsheet(exported, sandbox);
  const rows = ss.getSheetByName(exported.SFBS_TAB).getDataRange().getValues();
  assert.equal(rows.length - 1, first.rows, 'no duplicate rows from a second sync');
});

test('checkStudioFlowBuildSpec: reports never-generated before the first sync', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  const report = exported.checkStudioFlowBuildSpec();
  assert.equal(report.exists, false);
  assert.equal(report.current, false);
});

test('checkStudioFlowBuildSpec: reports current right after a sync', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.syncStudioFlowBuildSpec();
  const report = exported.checkStudioFlowBuildSpec();
  assert.equal(report.exists, true);
  assert.equal(report.current, true);
});

test('checkStudioFlowBuildSpec: reports STALE after the tab is hand-edited out of shape', () => {
  const { exported, sandbox } = load();
  indexSpreadsheet(exported, sandbox);
  exported.syncStudioFlowBuildSpec();
  const ss = indexSpreadsheet(exported, sandbox);
  const sheet = ss.getSheetByName(exported.SFBS_TAB);
  sheet.appendRow(['Curator', 'read', exported.CI_CURATOR_TAB, 99, 'HandAdded', 'nobody', '']);

  const report = exported.checkStudioFlowBuildSpec();
  assert.equal(report.current, false, 'an extra row must be detected as drift');
});
