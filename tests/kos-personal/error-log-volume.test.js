'use strict';
// ERROR_LOG volume control. The live log reached 17,218 rows, 15,000 of
// them (87%) one recurring condition: _coldEngineGate()'s TIER_2 block,
// written twice per firing of a 10-minute trigger for four months. Two
// separate faults produced that number, and a third let it accumulate:
//
//   1. The gate called _reportError() and then threw into a caller whose
//      own catch called _reportError() again — 7,500 matched pairs for
//      7,500 events, under two different contexts, nothing tying them
//      together.
//   2. A blocked gate is a steady state, not an event. Every firing while
//      the engine stayed unarmed said exactly what the first one said.
//   3. ERROR_LOG had no retention of any kind — appends only, nothing
//      ever removing anything.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
];

const EXPOSE = [
  '_reportError', '_coldEngineGate', '_markErrorLogged_', 'archiveErrorLog',
  'CFG', '_getSystemAsset',
];

function load() {
  const loaded = loadGasFiles(FILES, EXPOSE);
  const { exported, sandbox } = loaded;
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
  return Object.assign({ ss }, loaded);
}

function errorRows(ss, exported) {
  const sheet = ss.getSheetByName(exported.CFG.ERROR_LOG_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
}

// ── one event, one row ──────────────────────────────────────────────────

test('_reportError: a plain error writes exactly one ERROR_LOG row', () => {
  const { exported, ss } = load();
  exported._reportError('someCaller', new Error('boom'), null);
  assert.equal(errorRows(ss, exported).length, 1);
});

test('_reportError: an error already logged by whoever threw it adds no second row', () => {
  const { exported, ss } = load();
  const err = new Error('boom');

  exported._reportError('innerThrower', err, null);   // the throw site reports
  exported._reportError('outerCatcher', err, null);   // the catch site reports again

  const rows = errorRows(ss, exported);
  assert.equal(rows.length, 1, 'one event must not produce a pair of rows');
  assert.equal(rows[0][1], 'innerThrower',
    'the more specific context wins — whoever threw it reports first');
});

test('_reportError: the suppression flag is non-enumerable, so it never leaks into serialized output', () => {
  const { exported } = load();
  const err = new Error('boom');
  exported._markErrorLogged_(err);
  assert.equal(err.__kosErrorLogged, true);
  assert.deepEqual(Object.keys(err), [], 'must not become an own enumerable key');
});

test('_reportError: a non-object throw value is handled without throwing inside the handler', () => {
  const { exported, ss } = load();
  exported._reportError('stringThrower', 'a bare string', null);
  assert.equal(errorRows(ss, exported).length, 1);
});

// ── a blocked gate is a steady state, not an event ──────────────────────

function armless(sandbox) {
  // Leave IDENTITY_KEY unset — that is what "cold" means to the gate.
  return sandbox.PropertiesService.getScriptProperties();
}

function blockOnce(exported, caller) {
  assert.throws(() => exported._coldEngineGate(caller || 'processInferenceQueue', 'TIER_2'),
    /COLD_ENGINE_TIER_2/);
}

test('_coldEngineGate: a TIER_2 block still throws, so the caller still aborts', () => {
  const { exported, sandbox } = load();
  armless(sandbox);
  blockOnce(exported);
});

test('_coldEngineGate: repeated blocks inside the report window write ONE row, not one per firing', () => {
  const { exported, sandbox, ss } = load();
  armless(sandbox);

  for (let i = 0; i < 20; i++) blockOnce(exported);   // 20 trigger firings

  const rows = errorRows(ss, exported);
  assert.equal(rows.length, 1,
    'twenty firings of an unchanged condition are one thing worth recording, not twenty');
  assert.match(String(rows[0][1]), /COLD_ENGINE_GATE/);
});

test('_coldEngineGate: the caller catching and reporting the block adds no second row', () => {
  const { exported, sandbox, ss } = load();
  armless(sandbox);

  // Exactly what processInferenceQueue() does: gate inside try, catch
  // reports. This pairing is what produced 7,500 duplicate rows.
  try {
    exported._coldEngineGate('processInferenceQueue', 'TIER_2');
  } catch (e) {
    exported._reportError('processInferenceQueue', e, null);
  }

  assert.equal(errorRows(ss, exported).length, 1);
});

test('_coldEngineGate: a suppressed block still reaches the caller\'s catch un-swallowed', () => {
  const { exported, sandbox } = load();
  armless(sandbox);
  blockOnce(exported);            // consumes the window
  blockOnce(exported);            // suppressed row, but must still throw
});

test('_coldEngineGate: the window reopens once it has elapsed', () => {
  const { exported, sandbox, ss } = load();
  const props = armless(sandbox);
  blockOnce(exported);
  assert.equal(errorRows(ss, exported).length, 1);

  const windowMs = exported.CFG.COLD_GATE_REPORT_INTERVAL_MINS * 60 * 1000;
  props.setProperty('KOS_COLD_GATE_LAST_REPORT', JSON.stringify({
    processInferenceQueue: new Date().getTime() - windowMs - 1000,
  }));

  blockOnce(exported);
  assert.equal(errorRows(ss, exported).length, 2,
    'a condition that is still true hours later is worth saying again');
});

test('_coldEngineGate: the window is per-caller, so a rare entry point is not silenced by a trigger', () => {
  const { exported, sandbox, ss } = load();
  armless(sandbox);
  blockOnce(exported, 'processInferenceQueue');   // the 10-minute trigger
  blockOnce(exported, 'buildSessionContext');     // a human clicking a button

  const contexts = errorRows(ss, exported).map((r) => String(r[1]));
  assert.equal(contexts.length, 2, JSON.stringify(contexts));
  assert.ok(contexts.some((c) => /processInferenceQueue/.test(c)));
  assert.ok(contexts.some((c) => /buildSessionContext/.test(c)),
    'the operator who just clicked must still be told why nothing happened');
});

test('_coldEngineGate: an armed engine is not gated at all', () => {
  const { exported, sandbox, ss } = load();
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('IDENTITY_KEY', 'k');
  props.setProperty(exported.CFG.PROP.THESIS_VERIFIED, 'true');

  exported._coldEngineGate('processInferenceQueue', 'TIER_2');  // must not throw
  assert.equal(errorRows(ss, exported).length, 0);
});

// ── retention ───────────────────────────────────────────────────────────

// Rows are seeded as already-reported by default: that is the steady state
// (all 17,217 rows of the live log carry a Reported_At), and an unreported
// row is deliberately un-sweepable — see the guard test below.
function seedErrorLog(exported, ss, stamps, opts) {
  const unreported = (opts || {}).unreported || [];
  const sheet = ss.insertSheet(exported.CFG.ERROR_LOG_SHEET);
  sheet.appendRow(['Timestamp', 'Context', 'Message', 'Stack', 'Reported_At']);
  stamps.forEach((s, i) => sheet.appendRow([
    s, 'ctx' + i, 'msg' + i, 'stack',
    unreported.indexOf(i) === -1 ? '2026-09-20 08:00:00' : '',
  ]));
  return sheet;
}

function daysAgo(n) {
  const d = new Date(new Date().getTime() - n * 24 * 60 * 60 * 1000);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

test('archiveErrorLog: moves rows past the retention window into ERROR_LOG_ARCHIVE', () => {
  const { exported, ss } = load();
  seedErrorLog(exported, ss, [daysAgo(120), daysAgo(90), daysAgo(1)]);

  const result = exported.archiveErrorLog(30);

  assert.equal(result.success, true);
  assert.equal(result.archived, 2);
  const remaining = errorRows(ss, exported);
  assert.equal(remaining.length, 1, 'the recent row stays');
  assert.match(String(remaining[0][1]), /ctx2/);

  const archive = ss.getSheetByName(exported.CFG.ERROR_LOG_ARCHIVE_SHEET);
  assert.ok(archive, 'swept rows are moved, never deleted');
  assert.equal(archive.getLastRow() - 1, 2, 'both old rows landed in the archive');
});

test('archiveErrorLog: stops at the first in-window row rather than deleting past it', () => {
  const { exported, ss } = load();
  // Out of order on purpose: a recent row sitting above an old one. The
  // sweep must not delete by index across anything still inside the window.
  seedErrorLog(exported, ss, [daysAgo(120), daysAgo(1), daysAgo(200)]);

  const result = exported.archiveErrorLog(30);

  assert.equal(result.archived, 1, 'only the leading contiguous old block is swept');
  const remaining = errorRows(ss, exported).map((r) => String(r[1]));
  assert.deepEqual(remaining, ['ctx1', 'ctx2'],
    'the recent row and everything below it are left for a later pass');
});

test('archiveErrorLog: a log with nothing old enough is left completely alone', () => {
  const { exported, ss } = load();
  seedErrorLog(exported, ss, [daysAgo(2), daysAgo(1)]);

  const result = exported.archiveErrorLog(30);

  assert.equal(result.archived, 0);
  assert.equal(errorRows(ss, exported).length, 2);
  assert.equal(ss.getSheetByName(exported.CFG.ERROR_LOG_ARCHIVE_SHEET), null,
    'no archive tab is created when there is nothing to put in it');
});

test('archiveErrorLog: an absent or empty ERROR_LOG is a no-op, not an error', () => {
  const { exported, ss } = load();
  assert.deepEqual(exported.archiveErrorLog(30), { success: true, archived: 0, remaining: 0 });

  seedErrorLog(exported, ss, []);
  assert.deepEqual(exported.archiveErrorLog(30), { success: true, archived: 0, remaining: 0 });
});

test('archiveErrorLog: never sweeps a row the daily digest has not sent yet, however old', () => {
  const { exported, ss } = load();
  // Ancient, but Reported_At is blank — a digest that has been failing for
  // months must not have its unread backlog quietly filed away. This guard
  // is what makes the sweep safe to run from sendDailyErrorReport().
  seedErrorLog(exported, ss, [daysAgo(300), daysAgo(200)], { unreported: [0] });

  assert.equal(exported.archiveErrorLog(30).archived, 0);
  assert.equal(errorRows(ss, exported).length, 2, 'nothing was swept');
});

test('archiveErrorLog: sweeps up to an unreported row and stops there', () => {
  const { exported, ss } = load();
  seedErrorLog(exported, ss, [daysAgo(300), daysAgo(250), daysAgo(200)], { unreported: [1] });

  assert.equal(exported.archiveErrorLog(30).archived, 1);
  const remaining = errorRows(ss, exported).map((r) => String(r[1]));
  assert.deepEqual(remaining, ['ctx1', 'ctx2']);
});

test('archiveErrorLog: defaults to CFG.ERROR_LOG_RETENTION_DAYS when called with no argument', () => {
  const { exported, ss } = load();
  const beyond = exported.CFG.ERROR_LOG_RETENTION_DAYS + 10;
  seedErrorLog(exported, ss, [daysAgo(beyond), daysAgo(1)]);

  assert.equal(exported.archiveErrorLog().archived, 1);
});
