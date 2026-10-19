'use strict';
// Decision #12 (2026-10-19): Deploy_Trigger deploys a Blackboard row only
// when its Status is APPROVED. Any other row (staged, already DEPLOYED,
// FAILED, blank) is refused: checkbox reset, Status unchanged, no mutation.

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
  const cell = bb.getRange(2, 12);
  const range = { getRow: () => 2, getColumn: () => 12, getValue: () => cell.getValue() };
  const e = { source: ss, range };
  return { env, bb, e, mutated, toasts };
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
