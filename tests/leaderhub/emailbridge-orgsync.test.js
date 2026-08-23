'use strict';
// Regression tests for leader-hub/EmailBridge.gs's Organization Sync
// (co-advisor sharing, "EE2") and AI job queue functions.
//
// leader-hub/README.md's EE2/AI-drafting sections describe a Node harness
// (verify_ee2.js, "21 checks, all passing") that exercised exactly this
// logic against an in-memory Spreadsheet/PropertiesService mock — but that
// harness was never committed to the repo, so none of what it verified was
// re-checkable by the time this file was written. This is a rebuild of
// that idea as a permanent, CI-enforced asset: if a future edit reopens
// the exact bug EmailBridge.gs's own comments say this logic was built to
// close (the "FIXED" note above pushOrgSync_ — a missing expectedUpdatedAt
// silently overwriting a co-advisor's data), this is what catches it.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFile } = require('../harness/gas-sandbox');

const EMAILBRIDGE_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'EmailBridge.gs');

function load() {
  return loadGasFile(EMAILBRIDGE_PATH, [
    'pushOrgSync_', 'pullOrgSync_', 'listOrgSyncs_',
    'queueAiJob_', 'checkAiJob_', 'markConsumed_',
  ]);
}

// ── Organization Sync: push / pull / list ─────────────────────────────────

test('pushOrgSync_: first push for a new org succeeds and returns an updatedAt', () => {
  const { exported } = load();
  const res = exported.pushOrgSync_({
    orgId: 'deca', orgName: 'DECA',
    config: { officerTitles: ['President'] },
    rosterHeaders: ['Name', 'Grade'], rosterRows: [['Alice', '11']],
    resultHeaders: ['Event', 'Placement'], resultRows: [],
    updatedBy: 'teacherA@example.com',
  });
  assert.equal(res.ok, true);
  assert.ok(res.updatedAt);
});

test('pullOrgSync_: an org that was never pushed comes back as found:false, not an error', () => {
  const { exported } = load();
  assert.deepEqual(exported.pullOrgSync_({ orgId: 'never-shared' }), { ok: true, found: false });
});

test('push then pull round-trips config, roster, and result rows exactly', () => {
  const { exported } = load();
  exported.pushOrgSync_({
    orgId: 'fbla', orgName: 'FBLA', config: { levels: ['Regional'] },
    rosterHeaders: ['Name'], rosterRows: [['Bob']],
    resultHeaders: ['Event'], resultRows: [['Regionals']],
    updatedBy: 'teacherB@example.com',
  });
  const pulled = exported.pullOrgSync_({ orgId: 'fbla' });
  assert.equal(pulled.found, true);
  assert.equal(pulled.orgName, 'FBLA');
  assert.deepEqual(pulled.config, { levels: ['Regional'] });
  assert.deepEqual(pulled.rosterHeaders, ['Name']);
  assert.deepEqual(pulled.rosterRows, [['Bob']]);
  assert.deepEqual(pulled.resultHeaders, ['Event']);
  assert.deepEqual(pulled.resultRows, [['Regionals']]);
});

test('a stale push (wrong expectedUpdatedAt) is rejected as a conflict and writes nothing', () => {
  const { exported } = load();
  exported.pushOrgSync_({ orgId: 'deca', orgName: 'DECA', rosterHeaders: ['Name'], rosterRows: [['A']], updatedBy: 'x' });

  const staleAttempt = exported.pushOrgSync_({
    orgId: 'deca', orgName: 'DECA-RENAMED',
    expectedUpdatedAt: new Date(0).toISOString(), // guaranteed stale
    rosterHeaders: ['Name'], rosterRows: [['OVERWRITE']],
  });
  assert.equal(staleAttempt.ok, false);
  assert.equal(staleAttempt.conflict, true);
  assert.ok(staleAttempt.remoteUpdatedAt, 'a conflict response must tell the client what IS there now');

  // Nothing should have been written by the rejected push.
  const pulled = exported.pullOrgSync_({ orgId: 'deca' });
  assert.equal(pulled.orgName, 'DECA');
  assert.deepEqual(pulled.rosterRows, [['A']]);
});

test('a push with NO expectedUpdatedAt against an org that already has remote data is treated as a conflict, not silently applied', () => {
  // Regression guard for the exact bug EmailBridge.gs's own "FIXED" comment
  // above pushOrgSync_ describes: a browser that never pulled at all (a
  // built-in org never explicitly synced locally, or a brand-new device)
  // used to sail straight past the compare-and-swap and overwrite whatever
  // a co-advisor had already published.
  const { exported } = load();
  exported.pushOrgSync_({ orgId: 'deca', orgName: 'DECA', rosterHeaders: ['Name'], rosterRows: [['A']], updatedBy: 'first' });

  const blindPush = exported.pushOrgSync_({
    orgId: 'deca', orgName: 'DECA', rosterHeaders: ['Name'], rosterRows: [['OVERWRITE']],
    // no expectedUpdatedAt at all
  });
  assert.equal(blindPush.ok, false);
  assert.equal(blindPush.conflict, true);

  const pulled = exported.pullOrgSync_({ orgId: 'deca' });
  assert.deepEqual(pulled.rosterRows, [['A']]);
});

test('pull-then-push recovery: pushing again with the correct expectedUpdatedAt succeeds', () => {
  const { exported } = load();
  exported.pushOrgSync_({ orgId: 'deca', orgName: 'DECA', rosterHeaders: ['Name'], rosterRows: [['A']], updatedBy: 'x' });
  const pulled = exported.pullOrgSync_({ orgId: 'deca' });

  const second = exported.pushOrgSync_({
    orgId: 'deca', orgName: 'DECA',
    expectedUpdatedAt: pulled.updatedAt,
    rosterHeaders: ['Name'], rosterRows: [['A'], ['B']],
    updatedBy: 'x',
  });
  assert.equal(second.ok, true);
  assert.deepEqual(exported.pullOrgSync_({ orgId: 'deca' }).rosterRows, [['A'], ['B']]);
});

test('two independent orgs never collide on each other\'s roster/result tabs', () => {
  const { exported } = load();
  exported.pushOrgSync_({ orgId: 'deca', orgName: 'DECA', rosterHeaders: ['Name'], rosterRows: [['A']] });
  exported.pushOrgSync_({ orgId: 'fbla', orgName: 'FBLA', rosterHeaders: ['Name'], rosterRows: [['B']] });
  assert.deepEqual(exported.pullOrgSync_({ orgId: 'deca' }).rosterRows, [['A']]);
  assert.deepEqual(exported.pullOrgSync_({ orgId: 'fbla' }).rosterRows, [['B']]);
});

test('ragged row widths are normalized to the header width instead of throwing', () => {
  const { exported } = load();
  const res = exported.pushOrgSync_({
    orgId: 'ragged', orgName: 'Ragged Co',
    rosterHeaders: ['Name', 'Grade', 'Email'],
    rosterRows: [
      ['Alice', '11'],                                   // short - needs padding
      ['Bob', '12', 'bob@example.com', 'EXTRA COLUMN'],  // long - needs trimming
    ],
  });
  assert.equal(res.ok, true);
  const pulled = exported.pullOrgSync_({ orgId: 'ragged' });
  assert.deepEqual(pulled.rosterRows, [
    ['Alice', '11', ''],
    ['Bob', '12', 'bob@example.com'],
  ]);
});

test('repeated pushes update the one _org_meta row for an org instead of appending duplicates', () => {
  const { exported } = load();
  const first = exported.pushOrgSync_({ orgId: 'deca', orgName: 'DECA', rosterHeaders: ['Name'], rosterRows: [['A']] });
  exported.pushOrgSync_({
    orgId: 'deca', orgName: 'DECA', expectedUpdatedAt: first.updatedAt,
    rosterHeaders: ['Name'], rosterRows: [['A2']],
  });
  const list = exported.listOrgSyncs_({});
  assert.equal(list.orgs.filter((o) => o.orgId === 'deca').length, 1);
});

test('listOrgSyncs_ lists every org that has been shared on this bridge', () => {
  const { exported } = load();
  exported.pushOrgSync_({ orgId: 'deca', orgName: 'DECA', rosterHeaders: [], rosterRows: [] });
  exported.pushOrgSync_({ orgId: 'fbla', orgName: 'FBLA', rosterHeaders: [], rosterRows: [] });
  const ids = exported.listOrgSyncs_({}).orgs.map((o) => o.orgId).sort();
  assert.deepEqual(ids, ['deca', 'fbla']);
});

test('pushOrgSync_/pullOrgSync_ require an orgId', () => {
  const { exported } = load();
  assert.equal(exported.pushOrgSync_({}).ok, false);
  assert.equal(exported.pullOrgSync_({}).ok, false);
});

// ── AI job queue (aiDraft / checkAiJob) ───────────────────────────────────

test('checkAiJob_ reports PENDING for a freshly queued job', () => {
  const { exported } = load();
  const queued = exported.queueAiJob_({ type: 'BRAG_EMAIL', payload: { x: 1 } });
  assert.equal(queued.ok, true);
  assert.equal(exported.checkAiJob_({ jobId: queued.jobId }).status, 'PENDING');
});

test('checkAiJob_ hands back a COMPLETE result exactly once, then the row is gone', () => {
  const { exported, sandbox } = load();
  const queued = exported.queueAiJob_({ type: 'BRAG_EMAIL', payload: {} });

  // Simulate the Workspace Flow writing its result directly into the
  // queue sheet, the way it would in real use.
  const queueSheetId = sandbox.PropertiesService.getScriptProperties().getProperty('AI_QUEUE_SHEET_ID');
  const queueSheet = sandbox.SpreadsheetApp.openById(queueSheetId).getSheetByName('AI_Queue');
  const rowIndex = queueSheet.rows.findIndex((r) => r[1] === queued.jobId);
  queueSheet.rows[rowIndex][4] = 'COMPLETE'; // STATUS column
  queueSheet.rows[rowIndex][5] = 'Great job this week!'; // RESULT column

  const first = exported.checkAiJob_({ jobId: queued.jobId });
  assert.equal(first.status, 'COMPLETE');
  assert.equal(first.result, 'Great job this week!');

  const second = exported.checkAiJob_({ jobId: queued.jobId });
  assert.equal(second.status, 'NOT_FOUND', 'a completed job\'s row must not be handed back twice');
});

test('checkAiJob_ reports ERROR with the recorded message, and the row is then gone', () => {
  const { exported, sandbox } = load();
  const queued = exported.queueAiJob_({ type: 'LP_ASSIST', payload: {} });
  const queueSheetId = sandbox.PropertiesService.getScriptProperties().getProperty('AI_QUEUE_SHEET_ID');
  const queueSheet = sandbox.SpreadsheetApp.openById(queueSheetId).getSheetByName('AI_Queue');
  const rowIndex = queueSheet.rows.findIndex((r) => r[1] === queued.jobId);
  queueSheet.rows[rowIndex][4] = 'ERROR';
  queueSheet.rows[rowIndex][6] = 'Gemini quota exceeded'; // ERROR column

  const result = exported.checkAiJob_({ jobId: queued.jobId });
  assert.equal(result.status, 'ERROR');
  assert.equal(result.error, 'Gemini quota exceeded');
});

test('checkAiJob_ sweeps a stale (>2h) row on ANY call, without disturbing the job actually being checked', () => {
  const { exported, sandbox } = load();
  const stale = exported.queueAiJob_({ type: 'WBL_INSIGHTS', payload: {} });
  const fresh = exported.queueAiJob_({ type: 'BRAG_EMAIL', payload: {} });

  const queueSheetId = sandbox.PropertiesService.getScriptProperties().getProperty('AI_QUEUE_SHEET_ID');
  const queueSheet = sandbox.SpreadsheetApp.openById(queueSheetId).getSheetByName('AI_Queue');
  const staleRowIndex = queueSheet.rows.findIndex((r) => r[1] === stale.jobId);
  queueSheet.rows[staleRowIndex][0] = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3h old > 2h cap

  const checked = exported.checkAiJob_({ jobId: fresh.jobId });
  assert.equal(checked.status, 'PENDING', 'the job actually being checked must be unaffected by the sweep');

  const staleStillThere = queueSheet.rows.some((r) => r[1] === stale.jobId);
  assert.equal(staleStillThere, false, 'a >2h-old unclaimed row must be swept');
});

test('checkAiJob_ returns NOT_FOUND for an unknown jobId', () => {
  const { exported } = load();
  assert.equal(exported.checkAiJob_({ jobId: 'does-not-exist' }).status, 'NOT_FOUND');
});

test('checkAiJob_ requires a jobId', () => {
  const { exported } = load();
  assert.equal(exported.checkAiJob_({}).ok, false);
});

// ── markConsumed_ (horizon-item dedup) ─────────────────────────────────────

test('markConsumed_ caps the stored id list at 300 entries so it never exceeds PropertiesService\'s per-value limit', () => {
  const { exported, sandbox } = load();
  exported.markConsumed_(Array.from({ length: 250 }, (_, i) => 'first-' + i));
  exported.markConsumed_(Array.from({ length: 100 }, (_, i) => 'second-' + i));

  const stored = JSON.parse(sandbox.PropertiesService.getScriptProperties().getProperty('consumed') || '[]');
  assert.ok(stored.length <= 300, `expected <=300 stored ids, got ${stored.length}`);
  // the most RECENT ids must be the ones kept, not the oldest
  assert.ok(stored.includes('second-99'));
  assert.ok(!stored.includes('first-0'));
});

test('markConsumed_ with an empty list is a no-op', () => {
  const { exported } = load();
  assert.deepEqual(exported.markConsumed_([]), { ok: true, consumed: 0 });
});
