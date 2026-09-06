'use strict';
// Regression tests for kos-personal/1_Config_And_Deploy.gs's trigger
// management — setupAllTriggers() and teardownAllTriggers().
//
// Found while adding buildStudioInputRows's trigger: the two functions
// each kept their OWN independent copy of the same handler-name list.
// setupAllTriggers()'s copy was already missing 'harvestStudioReturns' —
// every OTHER trigger it installs gets cleared before reinstalling, so
// that one alone would grow a duplicate on every re-run against an
// already-deployed instance. teardownAllTriggers()'s copy had the exact
// same gap, unnoticed until this file's own audit found the second copy —
// meaning "tear down everything" would have silently left
// harvestStudioReturns (and would have left buildStudioInputRows too, had
// this stayed two lists) still running after someone believed the
// teardown was complete. Both functions now read one shared
// KOS_TRIGGER_HANDLERS list, so there is nothing left to drift between
// them.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
];

const EXPOSE = ['setupAllTriggers', 'teardownAllTriggers', 'KOS_TRIGGER_HANDLERS', 'CFG'];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

// sensor3_externalTelemetry and onGovernanceEdit call
// ScriptApp.newTrigger(...).forSpreadsheet(...).onChange()/.onEdit() —
// methods the sandbox's trigger-builder mock doesn't implement (it's
// built for the time-based installers). setupAllTriggers()'s own
// tryInstall() catches that and reports them as failed rather than
// throwing, so every OTHER trigger this function manages is still
// exercised faithfully; these two just never appear in the sandbox's
// installed set.
const SANDBOX_UNSUPPORTED = ['sensor3_externalTelemetry', 'onGovernanceEdit'];

function installableHandlers(exported) {
  return exported.KOS_TRIGGER_HANDLERS.filter((h) => SANDBOX_UNSUPPORTED.indexOf(h) === -1);
}

test('setupAllTriggers and teardownAllTriggers manage the exact same handler set', () => {
  // The structural fix itself: both functions now read the one exported
  // constant, so there is only one list to assert about.
  const { exported } = load();
  assert.ok(Array.isArray(exported.KOS_TRIGGER_HANDLERS));
  assert.ok(exported.KOS_TRIGGER_HANDLERS.includes('harvestStudioReturns'),
    'the trigger this list was originally missing');
  assert.ok(exported.KOS_TRIGGER_HANDLERS.includes('buildStudioInputRows'),
    'the trigger whose addition surfaced the missing one above');
});

test('setupAllTriggers: installs every sandbox-supported handler, including the two newest', () => {
  const { exported, sandbox } = load();
  exported.setupAllTriggers();

  const installedHandlers = sandbox.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  installableHandlers(exported).forEach((handler) => {
    assert.ok(installedHandlers.includes(handler), handler + ' was not installed');
  });
  assert.ok(installedHandlers.includes('harvestStudioReturns'));
  assert.ok(installedHandlers.includes('buildStudioInputRows'));
});

test('setupAllTriggers: re-running does not duplicate any trigger, harvestStudioReturns included', () => {
  const { exported, sandbox } = load();
  exported.setupAllTriggers();
  exported.setupAllTriggers();

  const handlers = sandbox.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  installableHandlers(exported).forEach((handler) => {
    const count = handlers.filter((h) => h === handler).length;
    assert.equal(count, 1, handler + ' appeared ' + count + ' time(s) after a second setup run');
  });
});

test('teardownAllTriggers: removes every trigger setupAllTriggers installed, including the newest two', () => {
  const { exported, sandbox } = load();
  exported.setupAllTriggers();
  const before = sandbox.ScriptApp.getProjectTriggers().length;
  assert.ok(before > 0, 'sanity: something was actually installed first');

  const removed = exported.teardownAllTriggers();

  assert.equal(sandbox.ScriptApp.getProjectTriggers().length, 0,
    'a trigger survived teardown — this is the exact bug class this test guards against');
  assert.equal(removed, before);
});

test('teardownAllTriggers: specifically clears harvestStudioReturns and buildStudioInputRows', () => {
  // The regression case by name, not just by count — a bug in ONE
  // handler's presence in the list could still pass the count-based
  // assertion above if it happened to be offset by an unrelated extra
  // trigger, so name each one explicitly.
  const { exported, sandbox } = load();
  exported.setupAllTriggers();
  exported.teardownAllTriggers();

  const remaining = sandbox.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  assert.ok(!remaining.includes('harvestStudioReturns'));
  assert.ok(!remaining.includes('buildStudioInputRows'));
});
