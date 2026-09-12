'use strict';
// Regression tests for kos-personal/10_Turnstile.gs — the PENDING_FLOW →
// STUDIO_ACTIVE gate, previously the one file in this project with zero
// test coverage (confirmed by grep: no test anywhere referenced
// runMatrixTurnstile before this file). Covers: normal release under
// concurrency, the staleness reset, the STUDIO_TIMEOUT escalation ceiling,
// audit-retry priority ordering and its one-shot pruning, release-map
// pruning, the unknown-status catch-all's once-per-UID alert, and the
// MANAGED_SERVICE hand-off's failure-to-release path.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '3_Queue_Processor.gs'), // _submitManagedServiceJob_
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '10_Turnstile.gs'),
];

const EXPOSE = [
  'runMatrixTurnstile', 'CFG',
  '_readReleaseMap', '_writeReleaseMap',
  '_readAuditRetryPrioritySet_', '_writeAuditRetryPrioritySet_', '_markAuditRetryPriority_',
  '_readStaleDeprioritizeSet_', '_writeStaleDeprioritizeSet_', '_markStaleDeprioritized_',
  '_readUnknownStatusAlertedSet_', '_writeUnknownStatusAlertedSet_',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type',
  'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];

function indexSpreadsheet(exported, sandbox) {
  const props = sandbox.PropertiesService.getScriptProperties();
  const existing = props.getProperty('INDEX_ID');
  if (existing) return sandbox.SpreadsheetApp.openById(existing);
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());
  return ss;
}

// Builds the tab directly on the live sandbox spreadsheet (ss.insertSheet(),
// not exported._getOrCreateSheet()) — an exported function's RETURN value
// is structuredClone()'d across the vm/host realm boundary (see
// gas-sandbox.js's crossRealmSafe), which silently strips a FakeSheet's
// methods down to plain data. Getting the sheet this way instead keeps the
// real, live mock object, the same pattern studio-input-builder.test.js's
// own tab() helper uses.
function tab(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.appendRow(headers);
  return sheet;
}

function stagingRow(overrides) {
  const base = {
    ts: new Date(), uid: 'UID-1', type: 'SESSION_LOG',
    docUrl: 'https://docs.google.com/x', fileId: 'file-1',
    status: 'PENDING_FLOW', retries: 0,
  };
  const r = Object.assign({}, base, overrides);
  return [r.ts, r.uid, r.type, r.docUrl, r.fileId, r.status, r.retries];
}

function seed(exported, sandbox, rows) {
  const ss = indexSpreadsheet(exported, sandbox);
  const staging = tab(ss, exported.CFG.STAGING_SHEET, STAGING_HEADERS);
  rows.forEach((r) => staging.appendRow(stagingRow(r)));
  return { ss, staging };
}

// exported.CFG is a structuredClone (see crossRealmSafe above it in
// gas-sandbox.js) — mutating it changes nothing production code sees.
// sandbox.__exported.CFG is the vm's own live object, grabbed before that
// clone happens, so a mutation through it actually changes what
// runMatrixTurnstile() reads. Needed only for CFG.INFERENCE_MODE below —
// every other test here runs at the real, unmutated defaults.
function liveCfg(sandbox) {
  return sandbox.__exported.CFG;
}

function statusesByUid(staging) {
  const data = staging.getDataRange().getValues().slice(1);
  const out = {};
  data.forEach((r) => { out[r[1]] = { status: r[5], retries: r[6] }; });
  return out;
}

test('runMatrixTurnstile: header-only STAGING_PIPELINE is a no-op', () => {
  const { exported, sandbox } = load();
  const ss = indexSpreadsheet(exported, sandbox);
  tab(ss, exported.CFG.STAGING_SHEET, STAGING_HEADERS); // header row only
  assert.doesNotThrow(() => exported.runMatrixTurnstile());
});

test('runMatrixTurnstile: releases a PENDING_FLOW row to STUDIO_ACTIVE and records the release time', () => {
  const { exported, sandbox } = load();
  const { staging } = seed(exported, sandbox, [{ uid: 'UID-1', status: 'PENDING_FLOW' }]);
  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['UID-1'].status, 'STUDIO_ACTIVE');
  const released = exported._readReleaseMap();
  assert.ok(released['UID-1'], 'release map should record when this UID was released');
});

test('runMatrixTurnstile: respects TURNSTILE_CONCURRENCY — only releases up to the limit', () => {
  const { exported, sandbox } = load();
  const { staging } = seed(exported, sandbox, [
    { uid: 'UID-1', status: 'PENDING_FLOW' },
    { uid: 'UID-2', status: 'PENDING_FLOW' },
  ]);
  // Default CFG.TURNSTILE_CONCURRENCY is 1 — confirm the default itself,
  // then exercise it.
  assert.equal(exported.CFG.TURNSTILE_CONCURRENCY, 1);
  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  const releasedCount = Object.values(after).filter((r) => r.status === 'STUDIO_ACTIVE').length;
  assert.equal(releasedCount, 1, 'only one row should release when concurrency is 1');
  const stillPending = Object.values(after).filter((r) => r.status === 'PENDING_FLOW').length;
  assert.equal(stillPending, 1);
});

test('runMatrixTurnstile: a STUDIO_ACTIVE row with no release-map entry is treated as stale immediately', () => {
  const { exported, sandbox } = load();
  // releasedAt undefined -> `releasedAt ? ... : true` -> stale on the very
  // first run that sees it, e.g. a row hand-edited to STUDIO_ACTIVE, or a
  // release-map entry lost to a prior corrupt-JSON reset.
  const { staging } = seed(exported, sandbox, [
    { uid: 'UID-1', status: 'STUDIO_ACTIVE', retries: 0 },
  ]);
  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['UID-1'].status, 'PENDING_FLOW');
  assert.equal(after['UID-1'].retries, 1);
});

test('runMatrixTurnstile: a STUDIO_ACTIVE row within its stale window is left alone and counted active', () => {
  const { exported, sandbox } = load();
  const { staging } = seed(exported, sandbox, [
    { uid: 'UID-1', status: 'STUDIO_ACTIVE', retries: 0 },
  ]);
  // Mark it as released just now, well inside CFG.TURNSTILE_STALE_MINS.
  exported._writeReleaseMap({ 'UID-1': new Date().getTime() });

  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['UID-1'].status, 'STUDIO_ACTIVE', 'a fresh release must not be reset');
  assert.equal(after['UID-1'].retries, 0);
});

test('runMatrixTurnstile: a STUDIO_ACTIVE row past its stale window resets to PENDING_FLOW, Retry_Count incremented', () => {
  const { exported, sandbox } = load();
  const { staging } = seed(exported, sandbox, [
    { uid: 'UID-1', status: 'STUDIO_ACTIVE', retries: 1 },
  ]);
  const staleMs = exported.CFG.TURNSTILE_STALE_MINS * 60 * 1000;
  exported._writeReleaseMap({ 'UID-1': new Date().getTime() - staleMs - 1000 });

  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['UID-1'].status, 'PENDING_FLOW');
  assert.equal(after['UID-1'].retries, 2);
  const released = exported._readReleaseMap();
  assert.ok(!released['UID-1'], 'the stale entry should be cleared, not left dangling');
});

test('runMatrixTurnstile: escalates to STUDIO_TIMEOUT once stale resets exceed TURNSTILE_STUCK_THRESHOLD', () => {
  const { exported, sandbox } = load();
  const threshold = exported.CFG.TURNSTILE_STUCK_THRESHOLD;
  const { staging } = seed(exported, sandbox, [
    { uid: 'UID-1', status: 'STUDIO_ACTIVE', retries: threshold }, // one more reset tips it over
  ]);
  const staleMs = exported.CFG.TURNSTILE_STALE_MINS * 60 * 1000;
  exported._writeReleaseMap({ 'UID-1': new Date().getTime() - staleMs - 1000 });

  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['UID-1'].status, 'STUDIO_TIMEOUT',
    'a row stuck past the threshold must stop cycling and surface for human review');
  assert.equal(after['UID-1'].retries, threshold + 1);
});

test('runMatrixTurnstile: escalated STUDIO_TIMEOUT rows free their concurrency slot for others', () => {
  const { exported, sandbox } = load();
  const threshold = exported.CFG.TURNSTILE_STUCK_THRESHOLD;
  assert.equal(exported.CFG.TURNSTILE_CONCURRENCY, 1, 'this test relies on the default concurrency of 1');
  const { staging } = seed(exported, sandbox, [
    { uid: 'STUCK', status: 'STUDIO_ACTIVE', retries: threshold },
    { uid: 'WAITING', status: 'PENDING_FLOW' },
  ]);
  const staleMs = exported.CFG.TURNSTILE_STALE_MINS * 60 * 1000;
  exported._writeReleaseMap({ STUCK: new Date().getTime() - staleMs - 1000 });

  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['STUCK'].status, 'STUDIO_TIMEOUT');
  assert.equal(after['WAITING'].status, 'STUDIO_ACTIVE',
    'the timed-out row no longer counts as active, so the waiting row should get the freed slot');
});

test('runMatrixTurnstile: an audit-retry-priority UID releases ahead of an earlier normal row', () => {
  const { exported, sandbox } = load();
  assert.equal(exported.CFG.TURNSTILE_CONCURRENCY, 1, 'this test relies on the default concurrency of 1');
  const { staging } = seed(exported, sandbox, [
    { uid: 'NORMAL', status: 'PENDING_FLOW' },   // appended first, normal order
    { uid: 'PRIORITY', status: 'PENDING_FLOW' }, // appended second, but audit-priority
  ]);
  exported._markAuditRetryPriority_('PRIORITY');

  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['PRIORITY'].status, 'STUDIO_ACTIVE',
    'priority row should take the single available slot even though it is later in the sheet');
  assert.equal(after['NORMAL'].status, 'PENDING_FLOW');
});

test('runMatrixTurnstile: priority is one-shot — a released UID is dropped from the priority set', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, [{ uid: 'PRIORITY', status: 'PENDING_FLOW' }]);
  exported._markAuditRetryPriority_('PRIORITY');

  exported.runMatrixTurnstile();

  const priority = exported._readAuditRetryPrioritySet_();
  assert.ok(!priority['PRIORITY'], 'a consumed priority UID must not stay marked forever');
});

test('runMatrixTurnstile: a priority UID no longer in the sheet at all is pruned from the set', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, [{ uid: 'STILL-HERE', status: 'PENDING_FLOW' }]);
  exported._markAuditRetryPriority_('LONG-GONE'); // never in the sheet

  exported.runMatrixTurnstile();

  const priority = exported._readAuditRetryPrioritySet_();
  assert.ok(!priority['LONG-GONE'], 'a priority entry for a row that no longer exists must not linger forever');
});

// ── Process-hardening sprint, Phase 1a/1b: deprioritize-on-stale-reset ──
//
// Incident shape: with TURNSTILE_CONCURRENCY == 1, releasing purely
// oldest-first meant a row that just failed and got stale-reset — which is,
// by construction, one of the OLDEST rows in the queue — got released
// again almost immediately, ahead of every other waiting row, every single
// stale cycle. These tests pin the fix: a just-reset row gives way to any
// other ready row first.

test('runMatrixTurnstile: a row stale-reset on an earlier run gives way to a row that has been waiting since, on the next run', () => {
  // Two SEPARATE runMatrixTurnstile() calls, deliberately — Pass 2 reads
  // the SAME in-memory `data` snapshot Pass 1 just updated in-sheet, so a
  // row Pass 1 resets is never itself eligible for release again within
  // that same run regardless of this fix (confirmed against the pre-fix
  // code before writing this test: it already "protects" the same-run
  // case, incidentally, for a completely different reason). The real
  // incident this fix targets spans separate 5-minute Turnstile cycles:
  // a row stale-reset on run N is sitting at plain PENDING_FLOW, same as
  // any other row, by the time run N+1 starts — and being one of the
  // OLDEST rows in the sheet, pure sheet-order release picks it again
  // ahead of anything newer that has been waiting the whole time.
  const { exported, sandbox } = load();
  assert.equal(exported.CFG.TURNSTILE_CONCURRENCY, 1, 'this test relies on the default concurrency of 1');
  const { staging } = seed(exported, sandbox, [{ uid: 'BAD', status: 'STUDIO_ACTIVE' }]);

  exported.runMatrixTurnstile(); // run N: BAD is stale, resets to PENDING_FLOW, deprioritized
  assert.equal(statusesByUid(staging)['BAD'].status, 'PENDING_FLOW');

  // GOOD arrives after BAD's reset — later in the sheet, but not the row
  // that just failed.
  staging.appendRow(stagingRow({ uid: 'GOOD', status: 'PENDING_FLOW' }));

  exported.runMatrixTurnstile(); // run N+1: both BAD and GOOD are plain PENDING_FLOW now

  const after = statusesByUid(staging);
  assert.equal(after['GOOD'].status, 'STUDIO_ACTIVE',
    'a row that has been waiting should take the slot instead of the row that just failed last run');
  assert.equal(after['BAD'].status, 'PENDING_FLOW');
});

test('runMatrixTurnstile: a deprioritized row still releases once nothing else is waiting', () => {
  const { exported, sandbox } = load();
  const { staging } = seed(exported, sandbox, [{ uid: 'ONLY-ONE', status: 'PENDING_FLOW' }]);
  exported._markStaleDeprioritized_('ONLY-ONE', 'stale_reset', 1);

  exported.runMatrixTurnstile();

  assert.equal(statusesByUid(staging)['ONLY-ONE'].status, 'STUDIO_ACTIVE',
    'deprioritized only means "let others go first," never "never release at all"');
});

test('runMatrixTurnstile: deprioritize is one-shot — a released UID is dropped from the set', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, [{ uid: 'ONCE', status: 'PENDING_FLOW' }]);
  exported._markStaleDeprioritized_('ONCE', 'stale_reset', 1);

  exported.runMatrixTurnstile();

  const set = exported._readStaleDeprioritizeSet_();
  assert.ok(!set['ONCE'], 'a consumed deprioritize entry must not stay marked forever');
});

test('runMatrixTurnstile: a deprioritize entry for a row no longer in the sheet at all is pruned', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, [{ uid: 'STILL-HERE', status: 'PENDING_FLOW' }]);
  exported._markStaleDeprioritized_('LONG-GONE', 'stale_reset', 3); // never in the sheet

  exported.runMatrixTurnstile();

  const set = exported._readStaleDeprioritizeSet_();
  assert.ok(!set['LONG-GONE'], 'a deprioritize entry for a row that no longer exists must not linger forever');
});

test('runMatrixTurnstile: priority wins over deprioritized if a UID is somehow marked both', () => {
  const { exported, sandbox } = load();
  assert.equal(exported.CFG.TURNSTILE_CONCURRENCY, 1, 'this test relies on the default concurrency of 1');
  const { staging } = seed(exported, sandbox, [
    { uid: 'OTHER', status: 'PENDING_FLOW' },
    { uid: 'BOTH', status: 'PENDING_FLOW' },
  ]);
  exported._markAuditRetryPriority_('BOTH');
  exported._markStaleDeprioritized_('BOTH', 'stale_reset', 1);

  exported.runMatrixTurnstile();

  assert.equal(statusesByUid(staging)['BOTH'].status, 'STUDIO_ACTIVE',
    'an active retry request from the audit gate should not be held back by an unrelated deprioritize entry');
});

test('runMatrixTurnstile: the release map is pruned of UIDs no longer present in the sheet', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, [{ uid: 'STILL-HERE', status: 'PENDING_FLOW' }]);
  exported._writeReleaseMap({ 'ARCHIVED-AWAY': new Date().getTime() });

  exported.runMatrixTurnstile();

  const released = exported._readReleaseMap();
  assert.ok(!released['ARCHIVED-AWAY'], 'an archived row\'s stale release-map entry must not grow the map forever');
});

test('runMatrixTurnstile: an unrecognized Status is alerted on once, and not repeated on the next run', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, [{ uid: 'WEIRD', status: 'AUDITING _LOG' }]); // the real incident's typo'd status
  exported.runMatrixTurnstile();

  let alerted = exported._readUnknownStatusAlertedSet_();
  assert.ok(alerted['WEIRD'], 'the unknown-status row should be recorded as alerted');

  // Second run: must not re-throw, re-alert, or otherwise choke on the
  // still-unrecognized status — it stays untouched (this file never
  // auto-fixes it) and the alerted set stays exactly as it was.
  exported.runMatrixTurnstile();
  alerted = exported._readUnknownStatusAlertedSet_();
  assert.deepEqual(Object.keys(alerted), ['WEIRD']);
});

test('runMatrixTurnstile: an unknown-status row does not consume a concurrency slot or block real rows', () => {
  const { exported, sandbox } = load();
  assert.equal(exported.CFG.TURNSTILE_CONCURRENCY, 1, 'this test relies on the default concurrency of 1');
  const { staging } = seed(exported, sandbox, [
    { uid: 'WEIRD', status: 'AUDITING _LOG' },
    { uid: 'NORMAL', status: 'PENDING_FLOW' },
  ]);
  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['NORMAL'].status, 'STUDIO_ACTIVE',
    'an unrecognized-status row must not swallow the one free concurrency slot');
  assert.equal(after['WEIRD'].status, 'AUDITING _LOG', 'this file never auto-fixes an unknown status');
});

test('runMatrixTurnstile: the unknown-status alerted set is pruned once the row is gone', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, [{ uid: 'STILL-HERE', status: 'PENDING_FLOW' }]);
  exported._writeUnknownStatusAlertedSet_({ 'LONG-GONE': true });

  exported.runMatrixTurnstile();

  const alerted = exported._readUnknownStatusAlertedSet_();
  assert.ok(!alerted['LONG-GONE']);
});

test('runMatrixTurnstile: MANAGED_SERVICE mode leaves a row PENDING_FLOW when the service is not configured', () => {
  const { exported, sandbox } = load();
  liveCfg(sandbox).INFERENCE_MODE = 'MANAGED_SERVICE';
  // Deliberately not setting MANAGED_SERVICE_BASE_URL / API_KEY — the
  // hand-off must fail closed, same as _submitManagedServiceJob_'s own
  // "not configured" branch documents.
  const { staging } = seed(exported, sandbox, [{ uid: 'UID-1', status: 'PENDING_FLOW' }]);

  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['UID-1'].status, 'PENDING_FLOW',
    'a failed managed-service submission must leave the row for the next 5-minute retry, not release it with nothing watching it');
});

test('runMatrixTurnstile: does nothing when it cannot acquire the script lock', () => {
  const { exported, sandbox } = load();
  const { staging } = seed(exported, sandbox, [{ uid: 'UID-1', status: 'PENDING_FLOW' }]);
  sandbox.LockService.getScriptLock = () => ({ tryLock: () => false, waitLock() {}, releaseLock() {} });

  exported.runMatrixTurnstile();

  const after = statusesByUid(staging);
  assert.equal(after['UID-1'].status, 'PENDING_FLOW', 'a concurrent run holding the lock must be left untouched');
});
