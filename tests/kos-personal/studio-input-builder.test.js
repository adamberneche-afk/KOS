'use strict';
// Regression tests for kos-personal/13_StudioInputBuilder.gs — closes the
// live in-Studio Docs-read both Studio flows used to have (the exact
// surface CHANGELOG.md's Round 17 incident hit: Gemini proceeding without
// reading the document because Studio's own "Get document" step silently
// failed, and returning well-formed output anyway). Apps Script now reads
// the doc once, before Studio ever runs, and writes the text into a flat
// CuratorInput/VectorClassifyInput row Studio triggers on with a SINGLE
// Sheets condition — no Docs connector, no live Drive access, at
// flow-run time, at all.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '12_StudioReturnHarvest.gs'), // SR_CURATOR_TYPES lives here
  path.join(KP, '13_StudioInputBuilder.gs'),
];

const EXPOSE = [
  'buildStudioInputRows', 'checkStudioInputBuilder', 'installStudioInputTrigger',
  'runStudioInputCanary', 'CI_COLS', 'CI_CURATOR_TAB', 'CI_CLASSIFY_TAB',
  'SR_CURATOR_TYPES', 'CFG', '_getSystemAsset', '_getOrCreateSheet',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type',
  'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];
const INPUT_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'File_ID', 'SourceText', 'Status'];

function indexSpreadsheet(exported, sandbox) {
  const props = sandbox.PropertiesService.getScriptProperties();
  const existing = props.getProperty('INDEX_ID');
  if (existing) return sandbox.SpreadsheetApp.openById(existing);
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());
  return ss;
}

function tab(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.appendRow(headers);
  return sheet;
}

// Mirrors studio-return-harvest.test.js's seed() — the source document is
// created here too, so its real mock id is what lands in the staging row.
function seed(exported, sandbox, opts) {
  const o = opts || {};
  const ss = indexSpreadsheet(exported, sandbox);
  const staging = tab(ss, exported.CFG.STAGING_SHEET, STAGING_HEADERS);
  const curatorSheet = tab(ss, exported.CI_CURATOR_TAB, INPUT_HEADERS);
  const classifySheet = tab(ss, exported.CI_CLASSIFY_TAB, INPUT_HEADERS);
  const uid = o.uid || 'UID-1';

  const doc = sandbox.DocumentApp.create('source doc for ' + uid);
  doc.getBody().setText(o.docText || 'ORIGINAL SOURCE TEXT');
  const fileId = doc.getId();

  staging.appendRow([new sandbox.Date(), uid, o.type || 'SESSION_LOG',
    'https://docs.google.com/document/d/' + fileId, fileId,
    o.status || 'STUDIO_ACTIVE', 0]);

  return { ss, staging, curatorSheet, classifySheet, uid, fileId, doc };
}

function findRow(sheet, uid) {
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).find((r) => String(r[1]).trim() === uid) || null;
}

// ── buildStudioInputRows ─────────────────────────────────────────────────────

test('buildStudioInputRows: materializes a SESSION_LOG row into CuratorInput with the real doc text', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox, { docText: 'The real session content, word for word.' });

  const result = exported.buildStudioInputRows();
  assert.equal(result.curatorBuilt, 1, JSON.stringify(result));
  assert.equal(result.classifyBuilt, 0);

  const row = findRow(ctx.curatorSheet, ctx.uid);
  assert.ok(row, 'CuratorInput row was written');
  assert.equal(row[exported.CI_COLS.SOURCE_TEXT], 'The real session content, word for word.');
  assert.equal(row[exported.CI_COLS.STATUS], 'READY');
  assert.equal(row[exported.CI_COLS.PAYLOAD_TYPE], 'SESSION_LOG');
});

test('buildStudioInputRows: materializes a VECTOR_CLASSIFY row into VectorClassifyInput, not CuratorInput', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox, { type: 'VECTOR_CLASSIFY', docText: 'Text to classify.' });

  const result = exported.buildStudioInputRows();
  assert.equal(result.classifyBuilt, 1, JSON.stringify(result));
  assert.equal(result.curatorBuilt, 0);

  assert.ok(findRow(ctx.classifySheet, ctx.uid));
  assert.equal(findRow(ctx.curatorSheet, ctx.uid), null,
    'a VECTOR_CLASSIFY row must not also land in CuratorInput');
});

test('buildStudioInputRows: every SR_CURATOR_TYPES value lands in CuratorInput', () => {
  const { exported, sandbox } = load();
  exported.SR_CURATOR_TYPES.forEach((type) => {
    const ctx = seed(exported, sandbox, { uid: 'UID-' + type, type: type });
    exported.buildStudioInputRows();
    assert.ok(findRow(ctx.curatorSheet, ctx.uid), type + ' did not reach CuratorInput');
  });
});

test('buildStudioInputRows: only STUDIO_ACTIVE rows are considered', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox, { status: 'PENDING_FLOW' });
  const result = exported.buildStudioInputRows();
  assert.equal(result.curatorBuilt, 0);
  assert.equal(findRow(ctx.curatorSheet, ctx.uid), null);
});

test('buildStudioInputRows: an unrecognized Payload_Type is skipped and counted, not guessed at', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, { type: 'SOMETHING_ELSE' });
  const result = exported.buildStudioInputRows();
  assert.equal(result.skippedUnknownType, 1, JSON.stringify(result));
  assert.equal(result.curatorBuilt, 0);
  assert.equal(result.classifyBuilt, 0);
});

test('buildStudioInputRows: an unreadable File_ID is skipped, not thrown on, and can retry next pass', () => {
  const { exported, sandbox } = load();
  const ss = indexSpreadsheet(exported, sandbox);
  const staging = tab(ss, exported.CFG.STAGING_SHEET, STAGING_HEADERS);
  tab(ss, exported.CI_CURATOR_TAB, INPUT_HEADERS);
  staging.appendRow([new sandbox.Date(), 'UID-BAD', 'SESSION_LOG',
    'https://docs.google.com/document/d/does-not-exist', 'does-not-exist', 'STUDIO_ACTIVE', 0]);

  assert.doesNotThrow(() => exported.buildStudioInputRows());
  const result = exported.buildStudioInputRows();
  assert.equal(result.skippedUnreadable, 1, JSON.stringify(result));
});

test('buildStudioInputRows: a second pass does not duplicate an already-materialized row', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox);
  exported.buildStudioInputRows();
  const second = exported.buildStudioInputRows();
  assert.equal(second.curatorBuilt, 0, 'nothing new to build the second time');
  const rows = ctx.curatorSheet.getDataRange().getValues();
  assert.equal(rows.filter((r) => String(r[1]).trim() === ctx.uid).length, 1,
    'exactly one CuratorInput row for this UID, not two');
});

test('buildStudioInputRows: materializing does not modify the source document', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox, { docText: 'Untouched original text.' });
  exported.buildStudioInputRows();
  assert.equal(sandbox.DocumentApp.openById(ctx.fileId).getBody().getText(), 'Untouched original text.');
});

// ── checkStudioInputBuilder ───────────────────────────────────────────────────

test('checkStudioInputBuilder: reports a STUDIO_ACTIVE row awaiting materialization', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox);
  const report = exported.checkStudioInputBuilder();
  assert.equal(report.active, 1);
  assert.equal(report.materialized, 0);
  assert.equal(report.awaitingMaterialization.length, 1);
});

test('checkStudioInputBuilder: a materialized row is no longer reported as awaiting', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox);
  exported.buildStudioInputRows();
  const report = exported.checkStudioInputBuilder();
  assert.equal(report.materialized, 1);
  assert.equal(report.awaitingMaterialization.length, 0);
});

test('checkStudioInputBuilder: read-only — it never writes', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox);
  const before = ctx.curatorSheet.getDataRange().getValues();
  exported.checkStudioInputBuilder();
  assert.deepEqual(ctx.curatorSheet.getDataRange().getValues(), before);
});

// ── installStudioInputTrigger ─────────────────────────────────────────────────

test('installStudioInputTrigger: installs once, idempotent on a second call', () => {
  const { exported } = load();
  const first = exported.installStudioInputTrigger();
  assert.equal(first.installed, true);
  const second = exported.installStudioInputTrigger();
  assert.equal(second.installed, false);
  assert.equal(second.existing, 1);
});

// ── runStudioInputCanary ──────────────────────────────────────────────────────

test('runStudioInputCanary: passes end to end and cleans up after itself', () => {
  const { exported, sandbox } = load();
  const ss = indexSpreadsheet(exported, sandbox);
  const result = exported.runStudioInputCanary();
  assert.equal(result.ok, true, JSON.stringify(result.steps, null, 2));

  // Nothing left behind — the canary's own staging rows and input rows.
  const staging = ss.getSheetByName(exported.CFG.STAGING_SHEET);
  const rows = staging ? staging.getDataRange().getValues().slice(1) : [];
  assert.equal(rows.filter((r) => String(r[1]).indexOf('CANARY-CI-') === 0).length, 0,
    'canary staging rows must be cleaned up');
});
