'use strict';
// reportRegradeConsistency (69, 2026-11-15): two gradings of the same work,
// the original from a copy of the Ledger's earlier version and the re-grade
// in FlowInput now. Pins: rows pair on StudentFileID + ConfigID +
// StagingRowRef; fixture rows, unpaired rows and unchanged text are counted
// apart; a malformed side is counted by reason, not compared; the stamp and
// each milestone are compared (the 3×3 table, one level apart, MET ↔
// NOT_MET); an original that is a newer row's answer (one text in two rows
// of a doc) is counted apart; cleanFrom splits out pairs whose original was built after a fix;
// per unit: pairs and stamp changes; it writes nothing; the log has no file
// ID, ConfigID or student text.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '00c_CentralLedgerShared.js', '00d_TeacherDashboardShared.js', '00e_StudentDashboardShared.js', '03_QueueBridge.js', '32_CompetencyRubricImporter.js', '37_FlowInputBuilder.js', '39_FlowFixtures.js',
  '64_LedgerCycle.js', '69_EvaluationHealth.js', '69b_FlowMeasures.js'].map(S);

function out(outcomes, stamp) {
  return 'Some feedback text for the student.\n[SYSTEM: ' + stamp + ']\n[MILESTONE_OUTCOMES: ' + JSON.stringify(outcomes) + ']';
}

function load() {
  const logs = [];
  const env = loadGasFiles(FILES, ['reportRegradeConsistency', 'FI', 'FI_HEADERS'],
    { Logger: { log: (m) => logs.push(String(m)) } });
  const sb = env.sandbox;
  const x = env.exported;
  const ledger = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ledger.getId(), ledger);
  sb.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  const copy = sb.SpreadsheetApp.create('Copy of Central Ledger');
  sb.SpreadsheetApp._registry.set(copy.getId(), copy);
  const nowTab = ledger.insertSheet('FlowInput');
  const beforeTab = copy.insertSheet('FlowInput');
  nowTab.appendRow(x.FI_HEADERS);
  beforeTab.appendRow(x.FI_HEADERS);
  const row = (o) => {
    const r = new Array(x.FI_HEADERS.length).fill('');
    r[x.FI.TIMESTAMP] = o.built || new Date('2026-11-14T15:00:00Z');
    r[x.FI.STAGING_ROW_REF] = o.ref || '7';
    r[x.FI.STUDENT_FILE_ID] = o.fileId;
    r[x.FI.CONFIG_ID] = o.configId || 'CAS-TEST-L01';
    r[x.FI.UNIT_NAME] = o.unit || 'Unit 3 — Pricing';
    r[x.FI.MILESTONE_1] = 'First'; r[x.FI.MILESTONE_2] = 'Second';
    r[x.FI.READY_STATUS] = 'HARVESTED';
    r[x.FI.GEMINI_FULL_OUTPUT] = o.output;
    return r;
  };
  const pair = (o, before, now) => {
    beforeTab.appendRow(row(Object.assign({}, o, { output: before })));
    nowTab.appendRow(row(Object.assign({}, o, { output: now })));
  };
  return { x, sb, logs, pair, copyId: copy.getId(), nowTab, beforeTab, row };
}

test('pairs are compared on the stamp and each milestone', () => {
  const t = load();
  // Same result both times.
  t.pair({ fileId: 'f1' }, out({ 1: 'MET', 2: 'MET' }, 'APPROVED'), 'Again. ' + out({ 1: 'MET', 2: 'MET' }, 'APPROVED'));
  // Passed, then revise: milestone 2 one level apart.
  t.pair({ fileId: 'f2' }, out({ 1: 'MET', 2: 'MET' }, 'APPROVED'), out({ 1: 'MET', 2: 'PARTIALLY_MET' }, 'REVISION_REQUIRED'));
  // Revise, then passed: milestone 1 MET ↔ NOT_MET; another unit.
  t.pair({ fileId: 'f3', unit: 'Unit 4 — Promotion' }, out({ 1: 'NOT_MET', 2: 'MET' }, 'REVISION_REQUIRED'), out({ 1: 'MET', 2: 'MET' }, 'APPROVED'));
  const r = t.x.reportRegradeConsistency({ beforeSsId: t.copyId });
  const a = r.all;
  assert.equal(a.pairs, 3);
  assert.equal(a.stampSame, 1);
  assert.equal(a.passToRevise, 1);
  assert.equal(a.reviseToPass, 1);
  assert.equal(a.allMilestonesSame, 1);
  assert.equal(a.milestones, 6);
  assert.equal(a.agree, 4);
  assert.equal(a.offByOne, 1);
  assert.equal(a.offByTwo, 1);
  assert.equal(a.matrix.MET.PARTIALLY_MET, 1);
  assert.equal(a.matrix.NOT_MET.MET, 1);
  assert.equal(a.matrix.MET.MET, 4);
  assert.deepEqual(r.byUnit['Unit 3 — Pricing'], { pairs: 2, flipped: 1 });
  assert.deepEqual(r.byUnit['Unit 4 — Promotion'], { pairs: 1, flipped: 1 });
  assert.equal(r.clean, null);
  assert.ok(t.logs.some((l) => /Stamp: same 1 \(33.3%\), APPROVED → REVISION_REQUIRED 1, REVISION_REQUIRED → APPROVED 1/.test(l)), t.logs.join('\n'));
  assert.ok(t.logs.some((l) => /MET: 4 \/ 1 \/ 0/.test(l)));
  assert.ok(t.logs.every((l) => !/f1|f2|f3|CAS-TEST|feedback text/.test(l)), 'counts only');
});

test('malformed, unpaired, unchanged and fixture rows are counted apart, not compared', () => {
  const t = load();
  const good = out({ 1: 'MET', 2: 'MET' }, 'APPROVED');
  t.pair({ fileId: 'f1' }, 'An answer about another lesson, no outcomes line', good);
  t.pair({ fileId: 'f2' }, good, out({ 1: 'MET', 2: 'PARTI_MET' }, 'REVISION_REQUIRED'));
  t.pair({ fileId: 'f3' }, good, good);
  t.pair({ fileId: 'fx', ref: 'FIXTURE' }, good, out({ 1: 'NOT_MET', 2: 'NOT_MET' }, 'REVISION_REQUIRED'));
  t.nowTab.appendRow(t.row({ fileId: 'f4', output: good })); // built after the copy
  // Same doc and lesson, another submission: pairs on StagingRowRef.
  t.pair({ fileId: 'f5', ref: '8' }, good, out({ 1: 'PARTIALLY_MET', 2: 'MET' }, 'REVISION_REQUIRED'));
  t.beforeTab.appendRow(t.row({ fileId: 'f5', ref: '9', output: 'Second. ' + good }));
  t.nowTab.appendRow(t.row({ fileId: 'f5', ref: '9', output: 'Again. ' + good }));
  const a = t.x.reportRegradeConsistency({ beforeSsId: t.copyId }).all;
  assert.deepEqual(a.malformedBefore, { 'no outcomes line': 1 });
  assert.deepEqual(a.malformedNow, { 'outcome value not allowed': 1 });
  assert.equal(a.unchanged, 1);
  assert.equal(a.unpaired, 1);
  assert.equal(a.pairs, 2);
  assert.equal(a.passToRevise, 1);
  assert.equal(a.stampSame, 1);
});

test('an original that is a newer submission\'s answer is counted apart, not compared', () => {
  const t = load();
  const met = out({ 1: 'MET', 2: 'MET' }, 'APPROVED');
  const rev = out({ 1: 'MET', 2: 'NOT_MET' }, 'REVISION_REQUIRED');
  // One answer in both rows of doc f1 (the duplicate-write bug): the newer
  // row keeps it; the earlier row's pair is not compared.
  t.pair({ fileId: 'f1', ref: '3', built: new Date('2026-11-12T15:00:00Z') }, met, rev);
  t.pair({ fileId: 'f1', ref: '8', built: new Date('2026-11-13T15:00:00Z') }, met, 'Again. ' + met);
  // The same text in another doc is not a copy.
  t.pair({ fileId: 'f2' }, met, 'Again. ' + met);
  const a = t.x.reportRegradeConsistency({ beforeSsId: t.copyId }).all;
  assert.equal(a.copiedOriginal, 1);
  assert.equal(a.pairs, 2);
  assert.equal(a.stampSame, 2);
  assert.equal(a.passToRevise, 0);
  assert.ok(t.logs.some((l) => /another submission's answer 1/.test(l)), t.logs.join('\n'));
});

test('cleanFrom counts pairs whose original was built after a fix on their own', () => {
  const t = load();
  const met = out({ 1: 'MET', 2: 'MET' }, 'APPROVED');
  const rev = out({ 1: 'MET', 2: 'NOT_MET' }, 'REVISION_REQUIRED');
  t.pair({ fileId: 'old', built: new Date('2026-11-13T15:00:00Z') }, met, rev);
  t.pair({ fileId: 'new', built: new Date('2026-11-15T17:00:00Z') }, met, 'Again. ' + met);
  const r = t.x.reportRegradeConsistency({ beforeSsId: t.copyId, cleanFrom: '2026-11-15T12:00:00-05:00' });
  assert.equal(r.all.pairs, 2);
  assert.equal(r.clean.pairs, 1);
  assert.equal(r.clean.stampSame, 1);
  assert.ok(t.logs.some((l) => /ORIGINAL BUILT AT OR AFTER/.test(l)));
});

test('it needs the copy, a valid cleanFrom, and writes nothing', () => {
  const t = load();
  assert.throws(() => t.x.reportRegradeConsistency(), /beforeSsId/);
  assert.throws(() => t.x.reportRegradeConsistency({ beforeSsId: t.copyId, cleanFrom: 'soon' }), /cleanFrom/);
  const met = out({ 1: 'MET', 2: 'MET' }, 'APPROVED');
  t.pair({ fileId: 'f1' }, met, 'Again. ' + met);
  const snap = (s) => JSON.stringify(s.getDataRange().getValues());
  const before = [snap(t.nowTab), snap(t.beforeTab)];
  t.x.reportRegradeConsistency({ beforeSsId: t.copyId });
  assert.deepEqual([snap(t.nowTab), snap(t.beforeTab)], before);
});
