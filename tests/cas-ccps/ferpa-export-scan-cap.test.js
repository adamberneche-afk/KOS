'use strict';
// 10_AdminRecoveryPanel.js's FERPA check (c): the walk over "SCR Export — "
// files stops at FERPA_MAX_EXPORT_FILES or its time limit (process hardening
// 2b), and a stopped walk fails the check, so the stop reaches the admin
// alert instead of passing as "no export shared".

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

function setup(exportCount) {
  // The files that declare what the other FERPA checks call (Check K).
  const env = loadGasFiles([S('00_SharedConfig.js'), S('10_AdminRecoveryPanel.js'), S('22_LessonContextHandler.js'),
    S('23_StudentProfileManager.js'), S('30_SCRSuggestionEngine.js'), S('34_QueueWatchdog.js'),
    S('36_WeeklyParentReport.js'), S('50_StudentDataAccess.js')], ['_ferpaHealthChecks_']);
  for (let i = 0; i < exportCount; i++) env.sandbox.DocumentApp.create('SCR Export — 2026-09-0' + (i + 1));
  return env;
}
const exportCheck = (checks) => checks.find((c) => /SCR export/.test(c.displayLine));

test('under the cap, private exports pass check (c)', () => {
  const c = exportCheck(setup(2).exported._ferpaHealthChecks_());
  assert.equal(c.ok, true);
  assert.match(c.displayLine, /No SCR export files shared/);
});

test('past the cap, check (c) fails and says the scan stopped early', () => {
  const c = exportCheck(setup(3).exported._ferpaHealthChecks_({ maxExportFiles: 2 }));
  assert.equal(c.ok, false);
  assert.match(c.displayLine, /stopped early \(more than 2 SCR export files/);
  assert.match(c.alertText, /SCAN STOPPED EARLY/);
});

test('past its time limit, check (c) fails and says so', () => {
  const c = exportCheck(setup(1).exported._ferpaHealthChecks_({ exportScanMs: -1 }));
  assert.equal(c.ok, false);
  assert.match(c.alertText, /time limit after 0 file/);
});
