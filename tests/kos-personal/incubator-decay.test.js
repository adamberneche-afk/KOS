'use strict';
// Regression tests for kos-personal/4_Vector_Router.gs's
// _applyIncubatorDecay_(). It runs once per classified session and used to
// decay each INCUBATING theme from its Last_Touched time on every run, so an
// untouched theme lost the whole gap again each session. It now decays only
// the time since the previous decay run.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '4_Vector_Router.gs'),
];
const DAY = 86400000;

function setup(lastTouchedMs, score) {
  const { exported, sandbox } = loadGasFiles(FILES, ['_applyIncubatorDecay_', 'CFG']);
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  const sheet = ss.insertSheet('INCUBATOR');
  sheet.appendRow(['Theme', 'First_Detected', 'Last_Touched', 'Session_Count', 'Cumulative_Score',
    'Raw_Score_Log', 'Status']);
  sheet.appendRow(['ECONOMICS', new Date(lastTouchedMs), new Date(lastTouchedMs), 1, score, '[]', 'INCUBATING']);
  return { exported, sheet };
}
const scoreOf = (sheet) => sheet.rows[1][4];

test('_applyIncubatorDecay_: one half-life halves the score', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const { exported, sheet } = setup(now - 14 * DAY, 2.0);
  exported._applyIncubatorDecay_(sheet, new Date(now).toISOString());
  assert.equal(scoreOf(sheet), 1.0);
});

test('_applyIncubatorDecay_: a second run a minute later does not decay the same gap again', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const { exported, sheet } = setup(now - 14 * DAY, 2.0);
  exported._applyIncubatorDecay_(sheet, new Date(now).toISOString());
  exported._applyIncubatorDecay_(sheet, new Date(now + 60000).toISOString());
  assert.ok(scoreOf(sheet) > 0.99, 'expected ~1.0, got ' + scoreOf(sheet));
});

test('_applyIncubatorDecay_: two runs a half-life apart compound correctly', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const { exported, sheet } = setup(now, 2.0);
  exported._applyIncubatorDecay_(sheet, new Date(now + 14 * DAY).toISOString());
  exported._applyIncubatorDecay_(sheet, new Date(now + 28 * DAY).toISOString());
  assert.equal(scoreOf(sheet), 0.5);
});
