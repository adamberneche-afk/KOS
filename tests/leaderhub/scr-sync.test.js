'use strict';
// Regression tests for leader-hub/SCR.gs — the SCR grading-score
// server-migration ("Phase 6"). This is the highest-stakes domain in the
// migration plan (live-during-class editing), so it gets the most
// scrutiny of any domain's test file: the found:false/found:true
// distinction that protects a fresh deployment's first pull from wiping
// out real local scores, upsert-in-place vs. append, per-cell deletion on
// a score of 0, and same-batch double-writes to one cell resolving to the
// batch's final value rather than depending on iteration order.
//
// Loads Data.gs alongside SCR.gs (loadGasFiles, not loadGasFile) because
// SCR.gs's sheet lookups go through Data.gs's _getLhDataSpreadsheet_() —
// same convention tests/leaderhub/emailbridge-orgsync.test.js's own
// header comment describes for a cross-file dependency within one GAS
// project.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const DATA_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'Data.gs');
const SCR_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'SCR.gs');

function load() {
  return loadGasFiles([DATA_PATH, SCR_PATH], ['lhSaveScrScores_', 'lhGetScrScores_']);
}

test('lhGetScrScores_: a fresh deployment (never synced) returns found:false, not an empty scores object', () => {
  const { exported } = load();
  assert.deepEqual(exported.lhGetScrScores_(), { ok: true, found: false });
});

test('lhSaveScrScores_ with an empty/missing batch is a no-op, not an error', () => {
  const { exported } = load();
  assert.deepEqual(exported.lhSaveScrScores_([]), { ok: true, saved: 0 });
  assert.deepEqual(exported.lhSaveScrScores_(), { ok: true, saved: 0 });
});

test('a saved cell round-trips through lhGetScrScores_ in the real nested shape', () => {
  const { exported } = load();
  exported.lhSaveScrScores_([{ course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 5, score: 3 }]);
  const res = exported.lhGetScrScores_();
  assert.equal(res.ok, true);
  assert.equal(res.found, true);
  assert.deepEqual(res.scores, { '8177': { '3': { 'a@ccpsnet.net': { '5': 3 } } } });
});

test('after saving at least one real cell, an otherwise-empty result is found:true, not found:false', () => {
  const { exported } = load();
  exported.lhSaveScrScores_([{ course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 5, score: 3 }]);
  // Clear that one cell back to 0 — the tab now exists but every cell is gone.
  exported.lhSaveScrScores_([{ course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 5, score: 0 }]);
  const res = exported.lhGetScrScores_();
  assert.equal(res.found, true);
  assert.deepEqual(res.scores, {});
});

test('re-saving the same cell updates it in place, not as a second row', () => {
  const { exported, sandbox } = load();
  exported.lhSaveScrScores_([{ course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 5, score: 2 }]);
  exported.lhSaveScrScores_([{ course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 5, score: 4 }]);
  const res = exported.lhGetScrScores_();
  assert.deepEqual(res.scores, { '8177': { '3': { 'a@ccpsnet.net': { '5': 4 } } } });
  const ss = sandbox.SpreadsheetApp._registry.values().next().value;
  const sheet = ss.getSheetByName('scr_scores');
  const dataRows = sheet.getDataRange().getValues().length - 1; // minus header
  assert.equal(dataRows, 1);
});

test('a score of 0 deletes the cell’s row instead of storing a zero', () => {
  const { exported } = load();
  exported.lhSaveScrScores_([{ course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 5, score: 2 }]);
  exported.lhSaveScrScores_([{ course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 5, score: 0 }]);
  const res = exported.lhGetScrScores_();
  assert.deepEqual(res.scores, {});
});

test('different students/competencies/periods/courses never collide into the same row', () => {
  const { exported } = load();
  exported.lhSaveScrScores_([
    { course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 1, score: 1 },
    { course: '8177', period: '3', studentKey: 'b@ccpsnet.net', compNum: 1, score: 2 },
    { course: '8177', period: '4', studentKey: 'a@ccpsnet.net', compNum: 1, score: 3 },
    { course: '8175', period: '3', studentKey: 'a@ccpsnet.net', compNum: 1, score: 4 },
    { course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 2, score: 5 },
  ]);
  const res = exported.lhGetScrScores_();
  assert.equal(res.scores['8177']['3']['a@ccpsnet.net']['1'], 1);
  assert.equal(res.scores['8177']['3']['b@ccpsnet.net']['1'], 2);
  assert.equal(res.scores['8177']['4']['a@ccpsnet.net']['1'], 3);
  assert.equal(res.scores['8175']['3']['a@ccpsnet.net']['1'], 4);
  assert.equal(res.scores['8177']['3']['a@ccpsnet.net']['2'], 5);
});

test('two changes to the same cell within one batch resolve to the batch’s last value, appending only one row', () => {
  const { exported, sandbox } = load();
  exported.lhSaveScrScores_([
    { course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 1, score: 2 },
    { course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 1, score: 5 },
  ]);
  const res = exported.lhGetScrScores_();
  assert.equal(res.scores['8177']['3']['a@ccpsnet.net']['1'], 5);
  const ss = sandbox.SpreadsheetApp._registry.values().next().value;
  const dataRows = ss.getSheetByName('scr_scores').getDataRange().getValues().length - 1;
  assert.equal(dataRows, 1);
});

test('scr_scores and Data.gs’s own domains live in the same private spreadsheet, not two different ones', () => {
  const { exported, sandbox } = load();
  exported.lhSaveScrScores_([{ course: '8177', period: '3', studentKey: 'a@ccpsnet.net', compNum: 1, score: 1 }]);
  // Only one Spreadsheet should ever get created across both files loaded
  // together — a second, accidental one would mean SCR.gs isn't actually
  // reusing Data.gs's _getLhDataSpreadsheet_() as intended.
  assert.equal(sandbox.SpreadsheetApp._registry.size, 1);
});
