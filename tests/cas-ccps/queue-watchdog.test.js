'use strict';
// Regression tests for 34_QueueWatchdog.js — the four confirmed blocking
// defects from the Studio Steps adoption review (unbounded
// PropertiesService growth, wrong terminal status per queue, wrong
// mutex, shared release-map key across WarmUpQueue's three passes),
// plus the non-blocking fixes (known-status completeness, unknown-
// status wiring, missing-tab handling, dry-run default).
//
// Loaded together with 00_SharedConfig.js because this file calls
// getConfig_() — both are bound to the same GAS project
// (cas-ccps:central-ledger, see tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const WATCHDOG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '34_QueueWatchdog.js');

function load(extraGlobals) {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, WATCHDOG_PATH],
    ['runQueueWatchdog', 'runQueueWatchdogNow'],
    extraGlobals,
  );
}

function setUpConfig(sandbox, adminSs) {
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', adminSs.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', 'fake-ledger-ss');
}

function seedReleaseMap(sandbox, map) {
  sandbox.PropertiesService.getScriptProperties().setProperty('CAS_WATCHDOG_RELEASED', JSON.stringify(map));
}
function readReleaseMap(sandbox) {
  const raw = sandbox.PropertiesService.getScriptProperties().getProperty('CAS_WATCHDOG_RELEASED');
  return raw ? JSON.parse(raw) : {};
}

function goLive(sandbox) {
  sandbox.PropertiesService.getScriptProperties().setProperty('CAS_WATCHDOG_DRY_RUN', 'false');
}

// RubricQueue: 10 columns, TIMESTAMP..STATUS(9).
function rubricRow(status) {
  const r = new Array(10).fill('');
  r[9] = status;
  return r;
}
// STAGING_PIPELINE: 6 columns, STATUS at index 5.
function stagingRow(status) {
  const r = new Array(6).fill('');
  r[5] = status;
  return r;
}
// WarmUpQueue: 21 columns, QUEUE_ID=0, STATUS=8.
function warmUpRow(queueId, status) {
  const r = new Array(21).fill('');
  r[0] = queueId;
  r[8] = status;
  return r;
}

function healthCell(sheet, row, col) { return sheet.getRange(row, col).getValue(); }

// ── Fix #3: LockService — must use the document lock, not the script lock ──

test('runQueueWatchdog: acquires the document lock, never the script lock', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);

  let scriptLockCalls = 0, documentLockCalls = 0;
  const realLock = sandbox.LockService.getDocumentLock();
  sandbox.LockService.getScriptLock = () => { scriptLockCalls++; return realLock; };
  sandbox.LockService.getDocumentLock = () => { documentLockCalls++; return realLock; };

  exported.runQueueWatchdog();
  assert.equal(scriptLockCalls, 0);
  assert.equal(documentLockCalls, 1);
});

test('runQueueWatchdog: a lock already held by another run skips this run entirely, no throw', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  sandbox.LockService.getDocumentLock = () => ({ tryLock: () => false, waitLock() {}, releaseLock() {} });

  assert.doesNotThrow(() => exported.runQueueWatchdog());
  assert.ok(!ss.getSheetByName('Health'), 'a skipped run must not write a Health tab');
});

// ── Fix #2: terminal status per queue, and #1: fixes are exercised live ────

test('runQueueWatchdog (LIVE): a RubricQueue row stuck past threshold escalates to STUDIO_TIMEOUT', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  goLive(sandbox);
  const sheet = ss.insertSheet('RubricQueue');
  sheet.appendRow(new Array(10).fill('header'));
  sheet.appendRow(rubricRow('PENDING_EXTRACTION'));

  const staleTs = Date.now() - 31 * 60 * 1000;
  seedReleaseMap(sandbox, {
    'RubricQueue:PENDING_EXTRACTION:row:2': staleTs,
    'RubricQueue:PENDING_EXTRACTION:row:2:retries': 2, // one more stale check escalates
  });

  exported.runQueueWatchdog();
  assert.equal(sheet.getRange(2, 10).getValue(), 'STUDIO_TIMEOUT');
});

test('runQueueWatchdog (LIVE): a STAGING_PIPELINE row stuck past threshold escalates to ERROR_TIMEOUT, not STUDIO_TIMEOUT', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  goLive(sandbox);
  const sheet = ss.insertSheet('STAGING_PIPELINE');
  sheet.appendRow(new Array(6).fill('header'));
  sheet.appendRow(stagingRow('IN_PROCESS'));

  const staleTs = Date.now() - 31 * 60 * 1000;
  seedReleaseMap(sandbox, {
    'STAGING_PIPELINE:IN_PROCESS:row:2': staleTs,
    'STAGING_PIPELINE:IN_PROCESS:row:2:retries': 2,
  });

  exported.runQueueWatchdog();
  // ERROR_TIMEOUT is what 03_QueueBridge.js's backPropagateCompletions()
  // and 06_StagingPipeline_Turnstile.js's own recovery already write and
  // read -- STUDIO_TIMEOUT would have silently orphaned this row.
  assert.equal(sheet.getRange(2, 6).getValue(), 'ERROR_TIMEOUT');
});

test('runQueueWatchdog (LIVE): a WarmUpQueue row stuck past threshold escalates to INCOMPLETE, not STUDIO_TIMEOUT', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  goLive(sandbox);
  const sheet = ss.insertSheet('WarmUpQueue');
  sheet.appendRow(new Array(21).fill('header'));
  sheet.appendRow(warmUpRow('Q1', 'PENDING'));

  const staleTs = Date.now() - 21 * 60 * 1000;
  seedReleaseMap(sandbox, {
    'WarmUpQueue:PENDING:Q1': staleTs,
    'WarmUpQueue:PENDING:Q1:retries': 2,
  });

  exported.runQueueWatchdog();
  // INCOMPLETE is one of 25_WarmUpWriter.js's own three recognized
  // terminal statuses (DELIVERED/SCORED/INCOMPLETE) -- STUDIO_TIMEOUT
  // would mean nothing to that reader.
  assert.equal(sheet.getRange(2, 9).getValue(), 'INCOMPLETE');
});

// ── Fix #4: shared release-map key across WarmUpQueue's three passes ──────

test('runQueueWatchdog: a row that legitimately transitioned PENDING -> PENDING_EVAL does NOT inherit its old PENDING clock', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  goLive(sandbox);
  const sheet = ss.insertSheet('WarmUpQueue');
  sheet.appendRow(new Array(21).fill('header'));
  // The row is NOW at PENDING_EVAL -- it already moved on from PENDING.
  sheet.appendRow(warmUpRow('Q1', 'PENDING_EVAL'));

  // Simulate the OLD, buggy key shape (no status embedded) holding an
  // ancient timestamp from when this row was still PENDING. Under the
  // fix, PENDING_EVAL's own key is a DIFFERENT string, so this old key
  // is simply irrelevant now, not read at all.
  const ancientTs = Date.now() - 10 * 60 * 60 * 1000; // 10 hours ago
  seedReleaseMap(sandbox, { 'WarmUpQueue:Q1': ancientTs });

  exported.runQueueWatchdog();
  // Must NOT have escalated -- a fresh clock for PENDING_EVAL just started.
  assert.equal(sheet.getRange(2, 9).getValue(), 'PENDING_EVAL');

  const map = readReleaseMap(sandbox);
  assert.ok(map['WarmUpQueue:PENDING_EVAL:Q1'], 'a fresh, status-scoped key must now exist');
  assert.ok(!map['WarmUpQueue:PENDING_EVAL:Q1:retries'], 'first sighting -- no retries yet');
});

// ── Fix #1: unbounded PropertiesService growth (pruning) ───────────────────

test('runQueueWatchdog: prunes a release-map key whose row has since moved on to a different status', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  const sheet = ss.insertSheet('RubricQueue');
  sheet.appendRow(new Array(10).fill('header'));
  sheet.appendRow(rubricRow('COMPLETE')); // no longer PENDING_EXTRACTION

  seedReleaseMap(sandbox, {
    'RubricQueue:PENDING_EXTRACTION:row:2': Date.now() - 60000, // stale leftover from before it completed
    'SomeOtherKey:from:a:deleted:row': Date.now() - 999999999,
  });

  exported.runQueueWatchdog();
  const map = readReleaseMap(sandbox);
  assert.deepEqual(map, {}, 'both untouched keys must be pruned -- neither row is being watched this run');
});

test('runQueueWatchdog: does NOT prune a key that is still actively being tracked this run', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  const sheet = ss.insertSheet('RubricQueue');
  sheet.appendRow(new Array(10).fill('header'));
  sheet.appendRow(rubricRow('PENDING_EXTRACTION')); // still in flight

  const recentTs = Date.now() - 5000;
  seedReleaseMap(sandbox, { 'RubricQueue:PENDING_EXTRACTION:row:2': recentTs });

  exported.runQueueWatchdog();
  const map = readReleaseMap(sandbox);
  assert.ok(map['RubricQueue:PENDING_EXTRACTION:row:2'], 'a row still in flight must keep its key');
});

// ── Non-blocking fix: known-status completeness (no false "unknown" alarms) ─

test('runQueueWatchdog: PENDING_INFERENCE (a real, routine STAGING_PIPELINE status) is never flagged unknown', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  const sheet = ss.insertSheet('STAGING_PIPELINE');
  sheet.appendRow(new Array(6).fill('header'));
  sheet.appendRow(stagingRow('PENDING_INFERENCE'));

  exported.runQueueWatchdog();
  const health = ss.getSheetByName('Health');
  assert.equal(healthCell(health, 11, 2), 0, 'STAGING_PIPELINE unknown-status count must be 0');
});

test('runQueueWatchdog: INCOMPLETE (a real, routine WarmUpQueue terminal status) is never flagged unknown', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  const sheet = ss.insertSheet('WarmUpQueue');
  sheet.appendRow(new Array(21).fill('header'));
  sheet.appendRow(warmUpRow('Q1', 'INCOMPLETE'));

  exported.runQueueWatchdog();
  const health = ss.getSheetByName('Health');
  assert.equal(healthCell(health, 12, 2), 0, 'WarmUpQueue unknown-status count must be 0');
});

// ── Non-blocking fix: unknown-status scanning wired for all 3 queues ───────

test('runQueueWatchdog: a genuinely unrecognized RubricQueue status is now counted (was dead code before)', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  const sheet = ss.insertSheet('RubricQueue');
  sheet.appendRow(new Array(10).fill('header'));
  sheet.appendRow(rubricRow('SOME_TYPO_STATUS'));

  exported.runQueueWatchdog();
  const health = ss.getSheetByName('Health');
  assert.equal(healthCell(health, 10, 2), 1);
});

test('runQueueWatchdog: a genuinely unrecognized STAGING_PIPELINE status is now counted (was dead code before)', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  const sheet = ss.insertSheet('STAGING_PIPELINE');
  sheet.appendRow(new Array(6).fill('header'));
  sheet.appendRow(stagingRow('SOME_TYPO_STATUS'));

  exported.runQueueWatchdog();
  const health = ss.getSheetByName('Health');
  assert.equal(healthCell(health, 11, 2), 1);
});

test('runQueueWatchdog: a genuinely unrecognized WarmUpQueue status is counted exactly once, not triple-counted across its 3 passes', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  const sheet = ss.insertSheet('WarmUpQueue');
  sheet.appendRow(new Array(21).fill('header'));
  sheet.appendRow(warmUpRow('Q1', 'SOME_TYPO_STATUS'));

  exported.runQueueWatchdog();
  const health = ss.getSheetByName('Health');
  assert.equal(healthCell(health, 12, 2), 1, 'must be counted exactly once, not once per of the 3 WarmUpQueue passes');
});

// ── Non-blocking fix: a missing tab fails loudly, not silent-healthy ───────

test('runQueueWatchdog: a missing WarmUpQueue tab is reported distinctly on the Health tab, not as a clean zero', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  // No WarmUpQueue tab inserted at all.

  exported.runQueueWatchdog();
  const health = ss.getSheetByName('Health');
  assert.equal(healthCell(health, 7, 2), 'TAB MISSING');
});

test('runQueueWatchdog: a missing tab sends a Chat alert naming which tab', () => {
  const sentMessages = [];
  const { exported, sandbox } = load({
    UrlFetchApp: { fetch: (url, opts) => { sentMessages.push(JSON.parse(opts.payload).text); return { getResponseCode: () => 200 }; } },
  });
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CAS_CHAT_WEBHOOK_URL', 'https://chat.example/webhook');

  exported.runQueueWatchdog();
  assert.ok(sentMessages.some((m) => m.includes('WarmUpQueue tab not found')));
});

// ── Dry run: on by default, real escalation needs an explicit opt-out ──────

test('runQueueWatchdog: DRY RUN (default, no CAS_WATCHDOG_DRY_RUN set) never writes the escalation status to the sheet', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  // CAS_WATCHDOG_DRY_RUN deliberately left unset.
  const sheet = ss.insertSheet('RubricQueue');
  sheet.appendRow(new Array(10).fill('header'));
  sheet.appendRow(rubricRow('PENDING_EXTRACTION'));

  seedReleaseMap(sandbox, {
    'RubricQueue:PENDING_EXTRACTION:row:2': Date.now() - 31 * 60 * 1000,
    'RubricQueue:PENDING_EXTRACTION:row:2:retries': 2,
  });

  exported.runQueueWatchdog();
  assert.equal(sheet.getRange(2, 10).getValue(), 'PENDING_EXTRACTION', 'the row must be untouched in dry run');

  const health = ss.getSheetByName('Health');
  assert.match(healthCell(health, 1, 1), /DRY RUN/);
  assert.equal(healthCell(health, 5, 3), 1, 'the Health tab still reports it as "would have timed out" this run');
});

test('runQueueWatchdogNow: alerts that the run was a dry run', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  exported.runQueueWatchdogNow();
  const calls = sandbox.SpreadsheetApp.getUi()._calls;
  assert.equal(calls.length, 1);
  assert.match(calls[0].message, /DRY RUN/);
});

test('runQueueWatchdogNow: once live (CAS_WATCHDOG_DRY_RUN=false), the alert no longer mentions dry run', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  goLive(sandbox);
  exported.runQueueWatchdogNow();
  const calls = sandbox.SpreadsheetApp.getUi()._calls;
  assert.ok(!/DRY RUN/.test(calls[0].message));
});

// ── Chat alert graceful degradation ─────────────────────────────────────────

test('a missing CAS_CHAT_WEBHOOK_URL never throws -- the run still completes and writes the Health tab', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Admin');
  setUpConfig(sandbox, ss);
  const sheet = ss.insertSheet('RubricQueue');
  sheet.appendRow(new Array(10).fill('header'));
  sheet.appendRow(rubricRow('SOME_TYPO_STATUS')); // triggers an alert path
  assert.doesNotThrow(() => exported.runQueueWatchdog());
  assert.ok(ss.getSheetByName('Health'));
});
