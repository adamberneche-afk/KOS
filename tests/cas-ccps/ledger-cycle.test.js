'use strict';
// 64_LedgerCycle.js: one every-minute trigger runs the Central Ledger's
// frequent jobs in turn (2026-10-19: ~45 Google-side failures in a week from
// ten separate triggers racing one spreadsheet). Pins: install takes over the
// jobs' own triggers and records them; the cycle runs only recorded jobs, at
// their cadence, most overdue first, each in its own try/catch, none after
// the time budget, never two cycles at once, and leaves a job that has its
// own trigger again to that trigger; restore puts the triggers back;
// registerDeliveredWarmUps is always a job (2026-10-20: the wizard had put
// its trigger in the wrong project); the two Run-menu installers add their
// job to the cycle, or give it its own trigger when there is no cycle.
// The jobs are stand-ins; each job's own work is tested in its own file.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const JOBS = ['bridgeQueue', 'runStagingTurnstile', 'buildFlowInputRows', 'harvestFlowInputResults',
  'backPropagateCompletions', 'buildWarmUpFlowInputs', 'harvestWarmUpFlowReturns', 'registerDeliveredWarmUps',
  'runAlignmentLogBackfill_', 'runQueueWatchdog'];

function setup(installed) {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('64_LedgerCycle.js')],
    ['runLedgerCycle', 'installLedgerCycle', 'previewLedgerCycle', 'restoreLedgerTriggers', 'lcRecordedJobs_',
      'installRegistrationTrigger', 'installAlignmentBackfillTrigger', 'lcFailingJobs_']);
  const calls = [];
  JOBS.forEach((fn) => { env.sandbox[fn] = () => calls.push(fn); });
  (installed || JOBS).forEach((fn) => env.sandbox.ScriptApp.newTrigger(fn).timeBased().everyMinutes(5).create());
  const props = env.sandbox.PropertiesService.getScriptProperties();
  const handlers = () => env.sandbox.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  return Object.assign(env, { calls, props, handlers });
}

test('install replaces the jobs\' own triggers with one cycle trigger; preview changes nothing', () => {
  const env = setup(['bridgeQueue', 'buildWarmUpFlowInputs', 'runQueueWatchdog']);
  env.sandbox.ScriptApp.newTrigger('buildWarmUpQueues').timeBased().atHour(3).create(); // not a cycle job
  const preview = env.exported.previewLedgerCycle();
  assert.deepEqual(preview.takenOver, ['bridgeQueue', 'buildWarmUpFlowInputs', 'runQueueWatchdog']);
  assert.equal(env.handlers().length, 4, 'a preview changes nothing');

  env.exported.installLedgerCycle();
  assert.deepEqual(env.handlers().sort(), ['buildWarmUpQueues', 'runLedgerCycle']);
  assert.deepEqual(JSON.parse(env.props.getProperty('LEDGER_CYCLE_JOBS')),
    ['bridgeQueue', 'buildWarmUpFlowInputs', 'runQueueWatchdog', 'registerDeliveredWarmUps'],
    'registerDeliveredWarmUps is a job even with no trigger of its own');
  env.exported.installLedgerCycle();
  assert.equal(env.handlers().filter((h) => h === 'runLedgerCycle').length, 1, 'idempotent');
});

test('the cycle runs only recorded jobs, at their cadence, and keeps going past an error', () => {
  const env = setup(['bridgeQueue', 'harvestWarmUpFlowReturns', 'runQueueWatchdog']);
  env.exported.installLedgerCycle();
  env.sandbox.harvestWarmUpFlowReturns = () => { throw new Error("We're sorry, a server error occurred."); };
  const first = env.exported.runLedgerCycle();
  assert.deepEqual(first.ran.sort(), ['bridgeQueue', 'registerDeliveredWarmUps', 'runQueueWatchdog']);
  assert.match(first.errors[0], /^harvestWarmUpFlowReturns: We're sorry/);
  assert.equal(env.calls.indexOf('runStagingTurnstile'), -1, 'never installed, never run');

  // A minute later only the 1-minute job is due.
  const last = JSON.parse(env.props.getProperty('LEDGER_CYCLE_LAST_RUN'));
  Object.keys(last).forEach((k) => { last[k] -= 61 * 1000; });
  env.props.setProperty('LEDGER_CYCLE_LAST_RUN', JSON.stringify(last));
  assert.deepEqual(env.exported.runLedgerCycle().ran, ['bridgeQueue']);
  assert.equal(env.props.getProperty('LEDGER_CYCLE_BUSY_UNTIL'), null, 'the guard is cleared');
});

test('the most overdue job runs first; a running cycle blocks the next; an own trigger wins', () => {
  const env = setup();
  env.exported.installLedgerCycle();
  const now = Date.now();
  const last = {};
  JOBS.forEach((fn) => { last[fn] = now; });
  last.runQueueWatchdog = now - 60 * 60 * 1000;
  last.bridgeQueue = now - 2 * 60 * 1000;
  env.props.setProperty('LEDGER_CYCLE_LAST_RUN', JSON.stringify(last));
  assert.deepEqual(env.exported.runLedgerCycle().ran, ['runQueueWatchdog', 'bridgeQueue']);

  env.props.setProperty('LEDGER_CYCLE_BUSY_UNTIL', String(Date.now() + 60000));
  assert.equal(env.exported.runLedgerCycle().skipped, 'busy');
  env.props.deleteProperty('LEDGER_CYCLE_BUSY_UNTIL');

  env.sandbox.ScriptApp.newTrigger('bridgeQueue').timeBased().everyMinutes(1).create(); // an installer re-run
  env.props.setProperty('LEDGER_CYCLE_LAST_RUN', '{}');
  assert.equal(env.exported.runLedgerCycle().ran.indexOf('bridgeQueue'), -1);
});

test('no job starts after the time budget; the rest wait for the next cycle', () => {
  const env = setup(['bridgeQueue', 'runStagingTurnstile']);
  env.exported.installLedgerCycle();
  const realNow = Date.now;
  let t = realNow();
  env.sandbox.Date.now = () => t;
  env.sandbox.bridgeQueue = () => { t += 5 * 60 * 1000; };
  const r = env.exported.runLedgerCycle();
  env.sandbox.Date.now = realNow;
  assert.deepEqual([r.ran, r.deferred], [['bridgeQueue'], ['runStagingTurnstile', 'registerDeliveredWarmUps']]);
});

test('restore puts each job\'s own trigger back at an accepted cadence and removes the cycle', () => {
  const env = setup(['bridgeQueue', 'backPropagateCompletions', 'runQueueWatchdog']);
  env.exported.installLedgerCycle();
  const r = env.exported.restoreLedgerTriggers();
  assert.deepEqual(r.restored, ['bridgeQueue (1 min)', 'backPropagateCompletions (1 min)',
    'registerDeliveredWarmUps (5 min)', 'runQueueWatchdog (10 min)']);
  assert.deepEqual(env.handlers().sort(),
    ['backPropagateCompletions', 'bridgeQueue', 'registerDeliveredWarmUps', 'runQueueWatchdog']);
  assert.equal(env.props.getProperty('LEDGER_CYCLE_JOBS'), null);
});

test('preflight: a job run by the cycle passes; one with its own trigger as well is flagged', () => {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('35_FlowPreflightAndCanary.js'), S('64_LedgerCycle.js')],
    ['_pfCheckTrigger_', 'installLedgerCycle']);
  env.sandbox.ScriptApp.newTrigger('buildWarmUpFlowInputs').timeBased().everyMinutes(5).create();
  env.exported.installLedgerCycle();
  assert.match(env.exported._pfCheckTrigger_('buildWarmUpFlowInputs', 'x', 'Warm-up inputs').detail, /run by runLedgerCycle/);
  env.sandbox.ScriptApp.newTrigger('buildWarmUpFlowInputs').timeBased().everyMinutes(5).create();
  assert.equal(env.exported._pfCheckTrigger_('buildWarmUpFlowInputs', 'x', 'Warm-up inputs').ok, false);
});

test('the two installers add their job to an installed cycle, once, with no trigger of its own', () => {
  const env = setup(['bridgeQueue']);
  env.exported.installLedgerCycle();
  env.exported.installAlignmentBackfillTrigger();
  env.exported.installAlignmentBackfillTrigger();
  const r = env.exported.installRegistrationTrigger();
  assert.match(r.message, /already runs in the Ledger cycle/);
  assert.deepEqual(JSON.parse(env.props.getProperty('LEDGER_CYCLE_JOBS')),
    ['bridgeQueue', 'registerDeliveredWarmUps', 'runAlignmentLogBackfill_']);
  assert.deepEqual(env.handlers(), ['runLedgerCycle']);
  assert.ok(env.exported.runLedgerCycle().ran.includes('runAlignmentLogBackfill_'));
});

test('without the cycle, an installer gives the job its own 5-minute trigger, once', () => {
  const env = setup([]);
  env.exported.installRegistrationTrigger();
  env.exported.installRegistrationTrigger();
  assert.deepEqual(env.handlers(), ['registerDeliveredWarmUps']);
  assert.equal(env.props.getProperty('LEDGER_CYCLE_JOBS'), null);
});

// UX audit fix-first 5 (2026-10-22): a job's failures are counted where 34b
// and 34c can see them, and a job failing ten cycles in a row makes the
// trigger itself fail, so Google's failure email arrives.
test('the cycle counts each job\'s failures, and fails loudly after ten in a row', () => {
  const env = setup(['bridgeQueue', 'harvestWarmUpFlowReturns']);
  env.exported.installLedgerCycle();
  let broken = true;
  env.sandbox.harvestWarmUpFlowReturns = () => { if (broken) throw new Error('server error'); };
  const cycle = () => { env.props.deleteProperty('LEDGER_CYCLE_LAST_RUN'); return env.exported.runLedgerCycle(); };
  for (let i = 0; i < 9; i++) cycle();
  let failing = env.exported.lcFailingJobs_(env.props);
  assert.equal(failing.length, 1);
  assert.equal(failing[0].fn, 'harvestWarmUpFlowReturns');
  assert.equal(failing[0].streak, 9);
  assert.equal(failing[0].today, 9);
  assert.throws(cycle, /harvestWarmUpFlowReturns has failed 10 cycles in a row/);
  assert.ok(env.calls.filter((c) => c === 'bridgeQueue').length === 10, 'the other jobs still ran');
  broken = false;
  cycle();
  failing = env.exported.lcFailingJobs_(env.props);
  assert.equal(failing[0].streak, 0, 'a success ends the streak');
  assert.equal(failing[0].today, 10, 'today\'s count is kept');
  assert.doesNotMatch(env.props.getProperty('LEDGER_CYCLE_ERRORS'), /server error/, 'names and counts only');
});
