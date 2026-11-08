'use strict';
// Decision #12 (2026-10-19): Deploy_Trigger deploys a Blackboard row only
// when its Status is APPROVED. Any other row (staged, already DEPLOYED,
// FAILED, blank) is refused: checkbox reset, Status unchanged, no mutation.
// Plan item L8 (2026-11-08): an edit over more than one cell that includes
// Deploy_Trigger (a paste over several checkboxes) deploys nothing, unticks
// every ticked box in it and says so; one tick at a time is unchanged.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '6_Governance.gs'].map((f) => path.join(KP, f));

function setup(status) {
  const env = loadGasFiles(FILES, ['onGovernanceEdit', 'CFG']);
  const ss = env.sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  const bb = ss.insertSheet(env.exported.CFG.BLACKBOARD_SHEET);
  bb.appendRow(['Target_Doc_ID', 'CE_Tag', 'Doc_Title', 'Version', 'Find_String', 'Replace_Payload',
    'Alt_Doc_ID', 'Notes', 'Filed_By', 'Filed_Date', 'Status', 'Deploy_Trigger']);
  bb.appendRow(['doc-1', 'CE-1', 't', '', '[TAG]', 'new', '', '', 'operator', new Date(), status, true]);
  const mutated = [];
  env.sandbox.applyMutation = (id) => { mutated.push(id); return true; };
  env.sandbox.runHardeningAudit = () => {};
  const toasts = [];
  ss.toast = (msg) => toasts.push(msg);
  ss.getActiveSheet = () => bb;
  const e = { source: ss, range: editRange(bb, 2, 12) };
  return { env, bb, e, mutated, toasts };
}

// The edited range as an onEdit event hands it over: real Range methods,
// getValue() reading the top-left cell.
function editRange(sheet, row, col, numRows = 1, numCols = 1) {
  const r = sheet.getRange(row, col, numRows, numCols);
  return {
    getRow: () => row, getColumn: () => col,
    getNumRows: () => numRows, getNumColumns: () => numCols,
    getValue: () => r.getValue(), getValues: () => r.getValues(),
  };
}

function addRow(bb, docId, status, tick) {
  bb.appendRow([docId, 'CE-1', 't', '', '[TAG]', 'new', '', '', 'operator', new Date(), status, tick]);
}

for (const status of ['STAGED_FOR_REVIEW', 'DEPLOYED: 10/19/2026, 9:00:00 AM', 'FAILED: tag not found', '']) {
  test(`a row with Status "${status || 'blank'}" is refused`, () => {
    const fx = setup(status);
    fx.env.exported.onGovernanceEdit(fx.e);
    assert.deepEqual(fx.mutated, []);
    assert.equal(fx.bb.getRange(2, 12).getValue(), false, 'checkbox reset');
    assert.equal(fx.bb.getRange(2, 11).getValue(), status, 'Status unchanged');
    assert.match(fx.toasts[0], /set Status to APPROVED first/);
  });
}

test('an APPROVED row deploys, once', () => {
  const fx = setup(' approved ');
  fx.env.exported.onGovernanceEdit(fx.e);
  assert.deepEqual(fx.mutated, ['doc-1']);
  assert.match(fx.bb.getRange(2, 11).getValue(), /^DEPLOYED: /);
  assert.equal(fx.bb.getRange(2, 12).getValue(), false);

  fx.bb.getRange(2, 12).setValue(true); // ticked again by accident
  fx.env.exported.onGovernanceEdit(fx.e);
  assert.deepEqual(fx.mutated, ['doc-1'], 'a deployed row never deploys twice');
});

// ── L8: one row at a time ─────────────────────────────────────────────

test('a paste over several Deploy_Trigger boxes deploys nothing and unticks all of them', () => {
  const fx = setup('APPROVED');
  addRow(fx.bb, 'doc-2', 'APPROVED', true);
  addRow(fx.bb, 'doc-3', 'STAGED_FOR_REVIEW', true);
  fx.e.range = editRange(fx.bb, 2, 12, 3, 1);
  fx.env.exported.onGovernanceEdit(fx.e);

  assert.deepEqual(fx.mutated, [], 'nothing deployed, not even the APPROVED top row');
  assert.deepEqual([2, 3, 4].map((r) => fx.bb.getRange(r, 12).getValue()), [false, false, false]);
  assert.deepEqual([2, 3, 4].map((r) => fx.bb.getRange(r, 11).getValue()),
    ['APPROVED', 'APPROVED', 'STAGED_FOR_REVIEW'], 'Status untouched');
  assert.equal(fx.toasts.length, 1);
  assert.match(fx.toasts[0], /^3 Deploy_Trigger boxes ticked in a multi-cell edit\. Tick one row at a time; nothing was deployed\.$/);
});

test('a paste across a row that includes a ticked Deploy_Trigger deploys nothing either', () => {
  const fx = setup('APPROVED');
  fx.e.range = editRange(fx.bb, 2, 11, 1, 2); // Status and Deploy_Trigger together
  fx.env.exported.onGovernanceEdit(fx.e);
  assert.deepEqual(fx.mutated, []);
  assert.equal(fx.bb.getRange(2, 12).getValue(), false);
  assert.match(fx.toasts[0], /^1 Deploy_Trigger box ticked/);
});

test('a multi-cell edit with the header row unticks below it and leaves the header alone', () => {
  const fx = setup('APPROVED');
  fx.e.range = editRange(fx.bb, 1, 12, 2, 1);
  fx.env.exported.onGovernanceEdit(fx.e);
  assert.deepEqual(fx.mutated, []);
  assert.equal(fx.bb.getRange(1, 12).getValue(), 'Deploy_Trigger');
  assert.equal(fx.bb.getRange(2, 12).getValue(), false);
});

test('a multi-cell edit that ticks nothing, or misses Deploy_Trigger, is left alone and silent', () => {
  const fx = setup('APPROVED');
  addRow(fx.bb, 'doc-2', 'APPROVED', false);
  fx.e.range = editRange(fx.bb, 2, 1, 2, 11); // columns A–K only
  fx.env.exported.onGovernanceEdit(fx.e);
  assert.equal(fx.bb.getRange(2, 12).getValue(), true, 'a tick outside the edit is not this edit\'s');

  fx.bb.getRange(2, 12).setValue(false);
  fx.e.range = editRange(fx.bb, 2, 12, 2, 1);
  fx.env.exported.onGovernanceEdit(fx.e);
  assert.deepEqual(fx.mutated, []);
  assert.deepEqual(fx.toasts, []);
});

test('one tick at a time still works: an APPROVED row deploys, then a non-APPROVED one is refused', () => {
  const fx = setup('APPROVED');
  addRow(fx.bb, 'doc-2', 'STAGED_FOR_REVIEW', true);
  fx.env.exported.onGovernanceEdit(fx.e);
  assert.deepEqual(fx.mutated, ['doc-1']);
  assert.match(fx.bb.getRange(2, 11).getValue(), /^DEPLOYED: /);

  fx.e.range = editRange(fx.bb, 3, 12);
  fx.env.exported.onGovernanceEdit(fx.e);
  assert.deepEqual(fx.mutated, ['doc-1']);
  assert.equal(fx.bb.getRange(3, 12).getValue(), false);
  assert.match(fx.toasts[1], /set Status to APPROVED first \(it is STAGED_FOR_REVIEW\)/);
});
