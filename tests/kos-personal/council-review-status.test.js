'use strict';
// Tests for getCouncilReviewStatus() (6_Governance.gs) — the read-only
// "where is this review up to" view over COG_REGISTRY.
//
// A Seven Bridges review is fanned out by hand, one cog per conversation,
// over however long that takes. Every step was already durably recorded
// (submitCogVerdict() writes a COG_REGISTRY row as each verdict lands), but
// nothing read it back: compileCouncilVerdict_() answers "what did the cogs
// say" and structurally cannot answer "who hasn't answered yet," since it
// only ever sees rows that exist. This is that complement.
//
// Two cases below cover skew that nothing surfaces today. The web app's Cog
// field is free text with a datalist of suggestions, and submitCogVerdict()
// stores whatever is typed after a trim — so a typo records a verdict that
// counts toward CFG.COG_HALT_THRESHOLD under a name matching no persona
// (while the real persona still reads as never having voted), and a
// double-submission counts twice. Both inflate the halt arithmetic silently.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'kos-personal', '1_Config_And_Deploy.gs');
const UTILS_PATH  = path.join(__dirname, '..', '..', 'kos-personal', '5_Error_And_Utilities.gs');
const GOV_PATH    = path.join(__dirname, '..', '..', 'kos-personal', '6_Governance.gs');

function load() {
  return loadGasFiles(
    [CONFIG_PATH, UTILS_PATH, GOV_PATH],
    ['getCouncilReviewStatus', 'compileCouncilVerdict_', 'CFG']
  );
}

// COG_REGISTRY columns, per SCHEMA_REFERENCE.md and the read in
// compileCouncilVerdict_(): Session_UID (the council ID), Timestamp, Cog,
// Final_Status, Summary.
function setUp(sandbox, rows) {
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());

  const reg = ss.insertSheet('COG_REGISTRY');
  reg.appendRow(['Session_UID', 'Timestamp', 'Cog', 'Final_Status', 'Summary']);
  (rows || []).forEach((r) =>
    reg.appendRow([r.councilId, new Date(), r.cog, r.status, r.summary || '']));
  return ss;
}

test('getCouncilReviewStatus: with nothing submitted, every persona is pending', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, []);

  const res = exported.getCouncilReviewStatus('SB_1');
  assert.equal(res.success, true);
  assert.equal(res.total, 0);
  assert.equal(res.received.length, 0);
  assert.equal(res.pending.length, exported.CFG.PERSONAS.length);
  assert.equal(res.complete, false);
  assert.match(res.message, /No verdicts recorded yet/);
});

test('getCouncilReviewStatus: reports who has verdicted and who is still outstanding', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, [
    { councilId: 'SB_1', cog: 'PERSONA_ARCHITECT', status: 'APPROVED' },
    { councilId: 'SB_1', cog: 'PERSONA_AUDITOR',   status: 'FLAG', summary: 'Retention unclear.' },
  ]);

  const res = exported.getCouncilReviewStatus('SB_1');
  assert.deepEqual(res.received.map(r => r.cog).sort(), ['ARCHITECT', 'AUDITOR']);
  assert.ok(res.pending.includes('MUSE'));
  assert.ok(res.pending.includes('DEVELOPER'));
  assert.equal(res.complete, false);
  assert.match(res.message, /Still waiting on/);
});

test('getCouncilReviewStatus: matching tolerates case and an optional PERSONA_ prefix', () => {
  const { exported, sandbox } = load();
  // All three notations refer to real personas — CFG.PERSONAS stores the
  // PERSONA_ form, the datalist suggests it, and an operator reasonably
  // types the bare name. Treating these as different cogs would invent a
  // problem rather than report one.
  setUp(sandbox, [
    { councilId: 'SB_1', cog: 'architect',        status: 'APPROVED' },
    { councilId: 'SB_1', cog: 'PERSONA_Auditor',  status: 'APPROVED' },
    { councilId: 'SB_1', cog: 'MUSE',             status: 'APPROVED' },
  ]);

  const res = exported.getCouncilReviewStatus('SB_1');
  assert.deepEqual(res.received.map(r => r.cog).sort(), ['ARCHITECT', 'AUDITOR', 'MUSE']);
  assert.equal(res.unrecognized.length, 0, 'none of these are typos');
});

test('getCouncilReviewStatus: a typo is flagged as unrecognized, and the real persona still reads as pending', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, [
    { councilId: 'SB_1', cog: 'ARCHITEKT', status: 'VETO', summary: 'Blocking concern.' },
  ]);

  const res = exported.getCouncilReviewStatus('SB_1');

  assert.equal(res.unrecognized.length, 1);
  assert.equal(res.unrecognized[0].cog, 'ARCHITEKT', 'raw text preserved so the typo is visible');
  assert.equal(res.received.length, 0, 'it counts for no persona');
  assert.ok(res.pending.includes('ARCHITECT'), 'the real cog is still outstanding');
  // The verdict is nonetheless in compileCouncilVerdict_()'s halt count —
  // that is exactly the silent skew this surfaces rather than changes.
  assert.equal(res.nonApprovedCount, 1);
  assert.equal(res.countsInflated, true);
  assert.match(res.message, /unrecognized cog name/);
});

test('getCouncilReviewStatus: a double-submitted cog is flagged, not silently double-counted', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, [
    { councilId: 'SB_1', cog: 'PERSONA_AUDITOR', status: 'FLAG' },
    { councilId: 'SB_1', cog: 'PERSONA_AUDITOR', status: 'FLAG' },
  ]);

  const res = exported.getCouncilReviewStatus('SB_1');

  assert.equal(res.received.length, 1, 'one cog, however many rows it filed');
  assert.equal(res.received[0].count, 2);
  assert.deepEqual(res.duplicates, [{ cog: 'AUDITOR', count: 2 }]);
  assert.equal(res.total, 2, 'the underlying row count is unchanged');
  assert.equal(res.countsInflated, true);
  assert.match(res.message, /duplicate cog/);
});

test('getCouncilReviewStatus: complete once every persona has verdicted, and the halt verdict carries through', () => {
  const { exported, sandbox } = load();
  // Three non-APPROVED verdicts trips CFG.COG_HALT_THRESHOLD.
  setUp(sandbox, exported.CFG.PERSONAS.map((p, i) => ({
    councilId: 'SB_1', cog: p, status: i < 3 ? 'VETO' : 'APPROVED',
  })));

  const res = exported.getCouncilReviewStatus('SB_1');
  assert.equal(res.complete, true);
  assert.equal(res.pending.length, 0);
  assert.equal(res.received.length, exported.CFG.PERSONAS.length);
  assert.equal(res.halted, true, 'halt rule still owned by compileCouncilVerdict_()');
  assert.equal(res.countsInflated, false, 'clean run — nothing skewing the count');
  assert.match(res.message, /All \d+ cogs have verdicted/);
});

test('getCouncilReviewStatus: scopes strictly to one council ID', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, [
    { councilId: 'SB_1', cog: 'PERSONA_ARCHITECT', status: 'APPROVED' },
    { councilId: 'SB_2', cog: 'PERSONA_AUDITOR',   status: 'VETO' },
    { councilId: 'SB_2', cog: 'PERSONA_MUSE',      status: 'VETO' },
  ]);

  const res = exported.getCouncilReviewStatus('SB_1');
  assert.equal(res.total, 1);
  assert.deepEqual(res.received.map(r => r.cog), ['ARCHITECT']);
  assert.equal(res.nonApprovedCount, 0, "SB_2's vetoes must not leak in");
});

test('getCouncilReviewStatus: a blank council ID is rejected, not treated as a wildcard', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, [{ councilId: 'SB_1', cog: 'PERSONA_ARCHITECT', status: 'APPROVED' }]);

  const res = exported.getCouncilReviewStatus('   ');
  assert.equal(res.success, false);
  assert.match(res.message, /Council ID is required/);
});
