'use strict';
// KOS_GEMINI_BRIEF (28_GeminiBrief.gs): start's lines in one short doc,
// copied from the primer as written, with three check words a day and an
// END line, under a size budget.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '6_Governance.gs', '22_BriefingDocs.gs', '28_GeminiBrief.gs'].map((f) => path.join(KP, f));
const EXPOSE = ['_primerBlocks_', 'geminiBriefBlocks_', 'geminiCheckWords_', 'writeGeminiBrief_', 'GB_MAX_CHARS', 'CFG'];

const VECTOR = { success: true, vectors: [{ name: 'GAS_DEVELOPMENT', score: 0.28 }, { name: 'PEDAGOGY', score: 0.08 }] };
const SHADOW = { success: true, engine_mode: 'CALIBRATED', questions: [{ label: 'Q1', status: 'LOCKED', confidence: 0.9, inferred: '' }] };
const QUALITY = { flagged: false, flags: [], lines: [{ kind: 'p', text: 'Status: OK. No known data-quality problems.' }] };
const DECISIONS = [
  { id: 'LOG-1_CH01#1', owner: 'operator', decision: 'First decision' },
  { id: 'LOG-2_CH01#1', owner: 'RTP', decision: 'Second decision' },
];

function primer(exported, onboarding) {
  const blocks = exported._primerBlocks_(onboarding, 'My students are ready.', VECTOR, SHADOW, QUALITY);
  blocks.splice(onboarding ? 1 : 0, 0, { kind: 'p', text: 'Moral debt: 0.0 (MUSE suggests alternatives at 3.0).' });
  return blocks;
}
const texts = (blocks) => blocks.map((b) => b.text);

test('the brief copies start\'s lines from the primer as written, between three check words, and ends with END', () => {
  const { exported } = loadGasFiles(FILES, EXPOSE);
  const b = exported.geminiBriefBlocks_(primer(exported, 'Onboarding Day 21 of 21'), DECISIONS, ['amber', 'cedar', 'violet'], '2026-11-23 06:08');
  const t = texts(b);
  assert.equal(t[0], 'Check word (start): amber');
  assert.ok(t.includes('My students are ready.'), 'the vision, exactly');
  assert.ok(t.includes('Onboarding Day 21 of 21'));
  assert.ok(t.includes('Moral debt: 0.0 (MUSE suggests alternatives at 3.0).'));
  assert.ok(t.includes('Vector State (Data Quality OK)'));
  assert.ok(t.includes('Status: OK. No known data-quality problems.'), 'the Data Quality Status line, word for word');
  assert.ok(t.includes('Engine mode: CALIBRATED'));
  assert.ok(t.includes('LOG-1_CH01#1 [operator]: First decision'));
  assert.ok(t.indexOf('Check word (middle): cedar') > t.indexOf('Engine mode: CALIBRATED'));
  assert.deepEqual(t.slice(-2), ['Check word (end): violet', 'END KOS_GEMINI_BRIEF — generated 2026-11-23 06:08']);
});

test('no onboarding line once closed out; only the first five decisions; under the budget', () => {
  const { exported } = loadGasFiles(FILES, EXPOSE);
  const many = Array.from({ length: 12 }, (_, i) => ({ id: 'LOG-' + i, owner: 'operator', decision: 'x'.repeat(900) }));
  const b = exported.geminiBriefBlocks_(primer(exported, ''), many, ['a', 'b', 'c'], '2026-11-23 06:08');
  const t = texts(b);
  assert.ok(!t.some((x) => /Onboarding/.test(x)));
  assert.equal(t.filter((x) => /^LOG-/.test(x)).length, 5);
  assert.ok(t.join('\n').length <= exported.GB_MAX_CHARS, 'long decisions are cut to fit');
  assert.ok(t.includes('Open decisions: 12 (the first 5, oldest first)'));
});

test('the check words: three different words, kept for the day, new the next day', () => {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const props = sandbox.PropertiesService.getScriptProperties();
  const w1 = exported.geminiCheckWords_(props, '2026-11-23');
  assert.equal(new Set(w1).size, 3);
  assert.deepEqual(exported.geminiCheckWords_(props, '2026-11-23'), w1, 'a re-run the same day keeps them');
  let changed = false;
  for (let i = 0; i < 5 && !changed; i++) changed = exported.geminiCheckWords_(props, '2026-11-2' + (4 + i)).join() !== w1.join();
  assert.ok(changed, 'a new day picks again');
});

test('writeGeminiBrief_ writes one stable doc, overwritten in place', () => {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
  ss.insertSheet(exported.CFG.DECISION_REGISTER_SHEET).appendRow(['Decision_ID']);
  const folder = sandbox.DriveApp.getRootFolder();
  const id = exported.writeGeminiBrief_(folder, new Date('2026-11-23T11:08:00Z'), primer(exported, ''));
  assert.equal(exported.writeGeminiBrief_(folder, new Date('2026-11-24T11:08:00Z'), primer(exported, '')), id, 'same doc');
  const text = sandbox.DocumentApp.openById(id).getBody().getText();
  assert.match(text, /^GEMINI BRIEF — 2026-11-24\nGenerated at: /);
  assert.match(text, /Check word \(start\): \w+[\s\S]*Check word \(end\): \w+\nEND KOS_GEMINI_BRIEF — generated 2026-11-24/);
  assert.match(text, /None open\./);
});
