'use strict';
// Regression tests for kos-personal/11_Registrar_CogRelay.gs's stage
// validators. A model can return valid JSON that isn't an object ("null",
// a bare string, an array). `k in parsed` then threw, the row-level catch
// only logged it, and the row sat in PENDING_VALIDATION_x forever. It is
// now bounced like any other malformed output.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '11_Registrar_CogRelay.gs'),
];

function setup(state, cog1, cog2) {
  const { exported, sandbox } = loadGasFiles(FILES,
    ['_validateRegistrarStage1', '_validateRegistrarStage2', 'CFG']);
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  const ledger = ss.insertSheet('REGISTRAR_LEDGER');
  ledger.appendRow(['File_ID', 'File_Name', 'State', 'Cog1_JSON', 'Cog2_JSON', 'Translation',
    'Attempt', 'Error_Log', 'TS_Intake', 'TS_Final']);
  const row = ['f1', 'file one', state, cog1, cog2, '', 0, '', '', ''];
  ledger.appendRow(row);
  return { exported, ledger, row };
}

for (const raw of ['null', '"just a string"', '[1,2]', '42']) {
  test('_validateRegistrarStage1: bounces non-object JSON ' + raw, () => {
    const { exported, ledger, row } = setup('PENDING_VALIDATION_1', raw, '');
    exported._validateRegistrarStage1(ledger, 2, row);
    assert.equal(ledger.rows[1][2], 'QUEUED_FOR_COG_1');
    assert.match(ledger.rows[1][7], /not a JSON object/);
  });

  test('_validateRegistrarStage2: bounces non-object JSON ' + raw, () => {
    const { exported, ledger, row } = setup('PENDING_VALIDATION_2', '{}', raw);
    exported._validateRegistrarStage2(ledger, 2, row);
    assert.equal(ledger.rows[1][2], 'READY_FOR_COG_2');
    assert.match(ledger.rows[1][7], /not a JSON object/);
  });
}
