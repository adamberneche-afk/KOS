'use strict';
// Regression tests for kos-personal/4_Vector_Router.gs's pinThemeToCore() —
// the manual "pin to Core" override (KOS/CAS roadmap synthesis 2.1):
// promotes a theme to VECTOR_MATRIX immediately, bypassing
// CFG.INCUBATOR_PROMOTION_THRESHOLD, and marks its INCUBATOR row
// PROMOTED_MANUAL (not PROMOTED) so the audit trail always shows *how* a
// theme graduated — an algorithmic promotion vs. an explicit operator/
// Council override. Loads the real CFG object (1_Config_And_Deploy.gs) and
// _getOrCreateSheet/_getSystemAsset (5_Error_And_Utilities.gs) alongside
// 4_Vector_Router.gs itself — this file's sheet-header derivation and
// asset-lookup helpers live in sibling files of the same GAS project, so
// loading 4_Vector_Router.gs alone would throw a ReferenceError that has
// nothing to do with the logic actually under test (same pairing pattern
// as write-curator-output-step.test.js's StepsShared.gs).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'kos-personal', '1_Config_And_Deploy.gs');
const UTILS_PATH  = path.join(__dirname, '..', '..', 'kos-personal', '5_Error_And_Utilities.gs');
const ROUTER_PATH = path.join(__dirname, '..', '..', 'kos-personal', '4_Vector_Router.gs');

function load() {
  return loadGasFiles(
    [CONFIG_PATH, UTILS_PATH, ROUTER_PATH],
    ['pinThemeToCore', 'getVectorState', 'getManuallyPinnedCoreFacts']
  );
}

function setUp(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
  return ss;
}

test('pinThemeToCore: a theme with no incubator history gets a VECTOR_MATRIX column, a PROMOTED_MANUAL incubator row, and a Blackboard audit row', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  const res = exported.pinThemeToCore('brand_new');
  assert.equal(res.success, true);
  assert.match(res.message, /pinned to Core status/);

  const matrix = ss.getSheetByName('VECTOR_MATRIX');
  const headers = matrix.getRange(1, 1, 1, matrix.getLastColumn()).getValues()[0];
  assert.ok(headers.includes('BRAND_NEW'), 'theme is normalized to uppercase and added as a column');

  const incub = ss.getSheetByName('INCUBATOR');
  const incubRow = incub.getRange(2, 1, 1, 7).getValues()[0];
  assert.equal(incubRow[0], 'BRAND_NEW');
  assert.equal(incubRow[6], 'PROMOTED_MANUAL');

  const bb = ss.getSheetByName('Blackboard');
  assert.equal(bb.getLastRow(), 2); // header + 1 audit row
  const bbRow = bb.getRange(2, 1, 1, 12).getValues()[0];
  assert.equal(bbRow[11], false, 'Deploy_Trigger must stay false — this is not a document mutation');
  assert.match(String(bbRow[10]), /^DEPLOYED:/, 'Status is written already resolved, not staged for review');
  assert.match(bbRow[7], /BRAND_NEW/);
});

test('pinThemeToCore: an existing incubator theme migrates its raw score history and is marked PROMOTED_MANUAL, not PROMOTED', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  // Bootstrap VECTOR_MATRIX/INCUBATOR/Blackboard with real headers by
  // pinning a throwaway theme first, then seed a genuine session row and
  // an INCUBATOR row for the theme actually under test.
  exported.pinThemeToCore('placeholder');
  const matrix = ss.getSheetByName('VECTOR_MATRIX');
  const blank = new Array(matrix.getLastColumn()).fill(0);
  blank[0] = 'S1'; blank[1] = new Date();
  matrix.appendRow(blank);

  const incub = ss.getSheetByName('INCUBATOR');
  incub.appendRow([
    'EMERGING', new Date(), new Date(), 2, 1.5,
    JSON.stringify([{ session_id: 'S1', raw_score: 0.42 }]),
    'INCUBATING',
  ]);

  const res = exported.pinThemeToCore('emerging');
  assert.equal(res.success, true);

  const newHeaders = matrix.getRange(1, 1, 1, matrix.getLastColumn()).getValues()[0];
  const col = newHeaders.indexOf('EMERGING');
  assert.ok(col >= 0, 'EMERGING column was added');
  // Row 2 is S1's row — its migrated raw score should land here verbatim,
  // not re-normalized (SMP Step 2), same as the algorithmic promotion path.
  assert.equal(matrix.getRange(2, col + 1).getValue(), 0.42);

  const incubRows = incub.getRange(2, 1, incub.getLastRow() - 1, 7).getValues();
  const emergingRow = incubRows.find(r => r[0] === 'EMERGING');
  assert.equal(emergingRow[6], 'PROMOTED_MANUAL', 'manual override is distinguishable from an algorithmic PROMOTED');
});

test('pinThemeToCore: is idempotent — a theme already at Core status returns success without adding a duplicate column', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  exported.pinThemeToCore('DUPLICATE');
  const matrix = ss.getSheetByName('VECTOR_MATRIX');
  const colsAfterFirst = matrix.getLastColumn();

  const res2 = exported.pinThemeToCore('duplicate');
  assert.equal(res2.success, true);
  assert.match(res2.message, /already at Core status/);
  assert.equal(matrix.getLastColumn(), colsAfterFirst, 'no second column was inserted');
});

// ── Roadmap 2.3 — value-consistency drift's data source ────────────────
// pinThemeToCore() pins a theme (a topic-vector label); Core_Fact is what
// makes it a checkable *fact* rather than a bare category name.

test('pinThemeToCore: persists the note as Core_Fact on a brand-new pin', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  exported.pinThemeToCore('NO_WEEKEND_CALLS', 'Operator will not take client calls on weekends.');

  const incub = ss.getSheetByName('INCUBATOR');
  const row = incub.getRange(2, 1, 1, 8).getValues()[0];
  assert.equal(row[6], 'PROMOTED_MANUAL');
  assert.equal(row[7], 'Operator will not take client calls on weekends.');
  assert.equal(incub.getRange(1, 8).getValue(), 'Core_Fact', 'header self-heals to the documented name');
});

test('pinThemeToCore: persists the note as Core_Fact when promoting an existing incubator row', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  exported.pinThemeToCore('placeholder'); // bootstrap real headers, as in the test above
  const incub = ss.getSheetByName('INCUBATOR');
  incub.appendRow(['EMERGING', new Date(), new Date(), 2, 1.5, '[]', 'INCUBATING']);

  exported.pinThemeToCore('emerging', 'Never ship a Friday-afternoon deploy.');

  const rows = incub.getRange(2, 1, incub.getLastRow() - 1, 8).getValues();
  const emergingRow = rows.find(r => r[0] === 'EMERGING');
  assert.equal(emergingRow[6], 'PROMOTED_MANUAL');
  assert.equal(emergingRow[7], 'Never ship a Friday-afternoon deploy.');
});

test('pinThemeToCore: with no note, Core_Fact stays blank', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  exported.pinThemeToCore('BARE_THEME');

  const incub = ss.getSheetByName('INCUBATOR');
  const row = incub.getRange(2, 1, 1, 8).getValues()[0];
  assert.equal(row[7], '');
});

test('getManuallyPinnedCoreFacts: returns only PROMOTED_MANUAL rows, with their fact text', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);

  exported.pinThemeToCore('FACT_A', 'Operator never works past 6pm on weekdays.');
  exported.pinThemeToCore('FACT_B', 'All student data stays in Drive, never a third-party server.');

  const facts = exported.getManuallyPinnedCoreFacts();
  assert.deepEqual(
    facts.sort((a, b) => a.theme.localeCompare(b.theme)),
    [
      { theme: 'FACT_A', fact: 'Operator never works past 6pm on weekdays.' },
      { theme: 'FACT_B', fact: 'All student data stays in Drive, never a third-party server.' },
    ]
  );
});

test('getManuallyPinnedCoreFacts: excludes algorithmically-promoted and still-incubating themes', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  exported.pinThemeToCore('MANUAL_ONE', 'A real pinned fact.');
  const incub = ss.getSheetByName('INCUBATOR');
  incub.appendRow(['ALGORITHMIC', new Date(), new Date(), 5, 4.0, '[]', 'PROMOTED']);
  incub.appendRow(['STILL_BUILDING', new Date(), new Date(), 1, 0.5, '[]', 'INCUBATING']);

  const facts = exported.getManuallyPinnedCoreFacts();
  assert.equal(facts.length, 1);
  assert.equal(facts[0].theme, 'MANUAL_ONE');
});

test('getManuallyPinnedCoreFacts: falls back to the bare theme name when no fact text was ever recorded', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);

  exported.pinThemeToCore('NO_NOTE_GIVEN'); // no note argument at all

  const facts = exported.getManuallyPinnedCoreFacts();
  assert.deepEqual(facts, [{ theme: 'NO_NOTE_GIVEN', fact: 'NO_NOTE_GIVEN' }]);
});

test('getManuallyPinnedCoreFacts: returns an empty array when INCUBATOR does not exist yet', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Empty Index');
  sandbox.PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());

  assert.deepEqual(exported.getManuallyPinnedCoreFacts(), []);
});

test('getVectorState: a manually-pinned theme disappears from the incubating list', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  exported.pinThemeToCore('SIDELINED');
  // getVectorState() takes an early "no sessions processed yet" branch
  // whenever VECTOR_MATRIX has no data rows at all — need a real session
  // row so it actually reads the INCUBATOR sheet this test cares about.
  const matrix = ss.getSheetByName('VECTOR_MATRIX');
  const blank = new Array(matrix.getLastColumn()).fill(0);
  blank[0] = 'S1'; blank[1] = new Date();
  matrix.appendRow(blank);

  const state = exported.getVectorState();
  assert.equal(state.success, true);
  assert.ok(
    !state.incubating.some(v => v.name === 'SIDELINED'),
    'a PROMOTED_MANUAL row must not still read as "incubating" in the Diagnostics tab'
  );
});
