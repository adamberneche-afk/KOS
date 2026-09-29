'use strict';
// _backfillPromotedScores_() (4_Vector_Router.gs): the session that earns a
// theme's promotion wrote its VECTOR_MATRIX row before the new column
// existed, so its own score for that theme would read 0. Both routing paths
// (Curator and VECTOR_CLASSIFY) used to carry their own copy of this fix.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');

function setUp() {
  const { exported, sandbox } = loadGasFiles(
    [path.join(KP, '1_Config_And_Deploy.gs'), path.join(KP, '5_Error_And_Utilities.gs'),
      path.join(KP, '4_Vector_Router.gs')],
    ['_backfillPromotedScores_']);
  const sheet = sandbox.SpreadsheetApp.create('BTI').insertSheet('VECTOR_MATRIX');
  sheet.appendRow(['Session_UID', 'Timestamp', 'ARCHITECTURE', 'NEWTHEME', 'INCUBATOR_SIGNALS', 'CHECKSUM']);
  sheet.appendRow(['S-OLD', 't', 0.5, 0, 0, 'x']);
  sheet.appendRow(['S-NOW', 't', 0.2, 0, 1, 'y']);
  return { exported, sandbox, sheet };
}

test('writes the promoting session\'s own score into its row, and only that row', () => {
  const { sandbox, sheet } = setUp();
  sandbox.__exported._backfillPromotedScores_(sheet, ['NEWTHEME'], { NEWTHEME: 0.73219 });
  assert.equal(sheet.getRange(3, 4).getValue(), 0.7322);
  assert.equal(sheet.getRange(2, 4).getValue(), 0, 'earlier sessions keep 0');
});

test('does nothing with no promotions, a zero score, or a theme with no column', () => {
  const { sandbox, sheet } = setUp();
  const f = sandbox.__exported._backfillPromotedScores_;
  f(sheet, [], { NEWTHEME: 0.9 });
  f(sheet, ['NEWTHEME'], { NEWTHEME: 0 });
  f(sheet, ['MISSING'], { MISSING: 0.9 });
  assert.equal(sheet.getRange(3, 4).getValue(), 0);
  assert.equal(sheet.getLastColumn(), 6);
});
