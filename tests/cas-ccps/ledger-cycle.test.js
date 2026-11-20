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
// The jobs every minute since 2026-11-14 (harvestFlowInputResults was 5,
// backPropagateCompletions 2): restore gives each a 1-minute trigger.

// The clock is pinned to a school day in school hours (Wednesday
// 2026-11-18, 10:00 New York): since 2026-11-15 the cycle holds some jobs
// in quiet hours, so the real clock would change what runs.
// (ledger-cycle-gates.test.js covers the checks, quiet hours and the backstop.)
const WED_10AM = Date.UTC(2026, 10, 18, 15, 0, 0);

function setup(installed) {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('64_LedgerCycle.js')],
    ['runLedgerCycle', 'installLedgerCycle', 'previewLedgerCycle', 'restoreLedgerTriggers', 'lcRecordedJobs_',
      'installRegistrationTrigger', 'installAlignmentBackfillTrigger', 'installPartUnlocks', 'lcFailingJobs_',
      'installIntakeTriggers', 'LC_JOBS', 'lcTimingReport_', 'lcJobEvery_']);
  env.sandbox.Date.now = () => WED_10AM;
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
  const now = env.sandbox.Date.now();
  const last = {};
  JOBS.forEach((fn) => { last[fn] = now; });
  last.runQueueWatchdog = now - 60 * 60 * 1000;
  last.bridgeQueue = now - 2 * 60 * 1000;
  env.props.setProperty('LEDGER_CYCLE_LAST_RUN', JSON.stringify(last));
  assert.deepEqual(env.exported.runLedgerCycle().ran, ['runQueueWatchdog', 'bridgeQueue']);

  env.props.setProperty('LEDGER_CYCLE_BUSY_UNTIL', String(env.sandbox.Date.now() + 60000));
  assert.equal(env.exported.runLedgerCycle().skipped, 'busy');
  env.props.deleteProperty('LEDGER_CYCLE_BUSY_UNTIL');

  env.sandbox.ScriptApp.newTrigger('bridgeQueue').timeBased().everyMinutes(1).create(); // an installer re-run
  env.props.setProperty('LEDGER_CYCLE_LAST_RUN', '{}');
  assert.equal(env.exported.runLedgerCycle().ran.indexOf('bridgeQueue'), -1);
});

test('no job starts after the time budget; the rest wait for the next cycle', () => {
  const env = setup(['bridgeQueue', 'runStagingTurnstile']);
  env.exported.installLedgerCycle();
  const realNow = env.sandbox.Date.now;
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

// installPartUnlocks moved here from 68 (2026-11-07): 68 is also in the
// Teacher Dashboard project, which has no lcInstallJob_.
test('installPartUnlocks adds unlockReadyParts to the cycle, or its own trigger without one', () => {
  const env = setup(['bridgeQueue']);
  env.sandbox.unlockReadyParts = () => {};
  env.exported.installLedgerCycle();
  env.exported.installPartUnlocks();
  assert.deepEqual(JSON.parse(env.props.getProperty('LEDGER_CYCLE_JOBS')),
    ['bridgeQueue', 'registerDeliveredWarmUps', 'unlockReadyParts']);
  assert.deepEqual(env.handlers(), ['runLedgerCycle']);
  const bare = setup([]);
  bare.exported.installPartUnlocks();
  assert.deepEqual(bare.handlers(), ['unlockReadyParts']);
});

// The three intake jobs had no installer before 2026-11-08 (added by hand
// in the Triggers panel; the setup guide's gap 3).
test('installIntakeTriggers adds the three intake jobs to the cycle, or each its own trigger without one, once', () => {
  const env = setup(['buildFlowInputRows']);
  env.exported.installLedgerCycle();
  env.exported.installIntakeTriggers();
  env.exported.installIntakeTriggers();
  assert.deepEqual(JSON.parse(env.props.getProperty('LEDGER_CYCLE_JOBS')),
    ['buildFlowInputRows', 'registerDeliveredWarmUps', 'bridgeQueue', 'runStagingTurnstile', 'backPropagateCompletions']);
  assert.deepEqual(env.handlers(), ['runLedgerCycle']);
  const ran = env.exported.runLedgerCycle().ran.sort();
  assert.deepEqual(ran, ['backPropagateCompletions', 'bridgeQueue', 'buildFlowInputRows', 'registerDeliveredWarmUps',
    'runStagingTurnstile']);

  const bare = setup([]);
  bare.exported.installIntakeTriggers();
  bare.exported.installIntakeTriggers();
  assert.deepEqual(bare.handlers(), ['bridgeQueue', 'runStagingTurnstile', 'backPropagateCompletions']);
  // everyMinutes takes 1, 5, 10, 15 or 30: backPropagateCompletions' 2 rounds down to 1.
  bare.sandbox.ScriptApp.getProjectTriggers().forEach((t) =>
    assert.deepEqual(t.__calls.find((c) => c.method === 'everyMinutes').args, [1]));
  assert.equal(bare.props.getProperty('LEDGER_CYCLE_JOBS'), null);
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

// Every minute on the way to feedback (2026-11-14, the operator's "Build
// 1-4"): the jobs a student waits on run every minute, each job's run time
// is recorded (names and numbers only), and LEDGER_CYCLE_EVERY slows one
// again without a push.
test('the jobs between Submit and feedback, a code or the next part run every minute', () => {
  const env = setup();
  const every = Object.fromEntries(env.exported.LC_JOBS.map((j) => [j.fn, j.every]));
  for (const fn of ['bridgeQueue', 'runStagingTurnstile', 'buildFlowInputRows', 'harvestFlowInputResults',
    'backPropagateCompletions', 'unlockReadyParts', 'runTurnInCheckFlow']) assert.equal(every[fn], 1, fn);
  assert.equal(every.runQueueWatchdog, 10, 'the watchdog keeps its cadence');
  assert.equal(every.buildWarmUpFlowInputs, 5, 'the warm-up jobs keep theirs');
  // A minute after a cycle, the harvest is due again (it used to wait 5).
  env.exported.installLedgerCycle();
  env.exported.runLedgerCycle();
  const last = JSON.parse(env.props.getProperty('LEDGER_CYCLE_LAST_RUN'));
  Object.keys(last).forEach((k) => { last[k] -= 61 * 1000; });
  env.props.setProperty('LEDGER_CYCLE_LAST_RUN', JSON.stringify(last));
  assert.ok(env.exported.runLedgerCycle().ran.includes('harvestFlowInputResults'));
});

test('each job\'s run time and the cycle\'s are recorded, and shown with the share of the daily quota', () => {
  const env = setup(['bridgeQueue', 'harvestFlowInputResults']);
  env.exported.installLedgerCycle();
  const realNow = env.sandbox.Date.now;
  let t = realNow();
  env.sandbox.Date.now = () => t;
  env.sandbox.bridgeQueue = () => { t += 1200; };
  env.sandbox.harvestFlowInputResults = () => { t += 3400; };
  env.sandbox.registerDeliveredWarmUps = () => { t += 100; };
  env.exported.runLedgerCycle();
  t += 61 * 1000;
  env.sandbox.harvestFlowInputResults = () => { t += 2400; };
  env.exported.runLedgerCycle();
  env.sandbox.Date.now = realNow;
  const timing = JSON.parse(env.props.getProperty('LEDGER_CYCLE_TIMING'));
  assert.equal(timing.harvestFlowInputResults.last, 2400);
  assert.equal(timing.harvestFlowInputResults.runs, 2);
  assert.equal(timing.harvestFlowInputResults.total, 5800);
  assert.equal(timing.harvestFlowInputResults.max, 3400);
  assert.equal(timing.harvestFlowInputResults.avg, 3200, 'a running average: 3400 + 0.2 × (2400 − 3400)');
  assert.equal(timing._cycle.runs, 2);
  assert.equal(timing._cycle.total, 4700 + 3600);
  assert.doesNotMatch(env.props.getProperty('LEDGER_CYCLE_TIMING'), /@|https?:/, 'names and numbers only');
  const report = env.exported.lcTimingReport_(env.props);
  assert.match(report.jobs.harvestFlowInputResults, /^last 2\.4 s, usually 3\.2 s; today 2 run\(s\), 5\.8 s in all, slowest 3\.4 s$/);
  assert.match(report.cycle, /^Ledger cycle today: 2 run\(s\), 0\.1 min of trigger time \(0% of the 6 h a day/);
  assert.match(report.cycle, /0 cycle\(s\) ran out of time/);
  assert.match(report.schedule, /^Schedule: up to 5 min of waiting between jobs on the way to feedback/);
  assert.equal(report.jobs.runQueueWatchdog, 'no run timed yet');
});

test('a job the budget puts off is counted, and so is a minute skipped while a cycle runs', () => {
  const env = setup(['bridgeQueue', 'runStagingTurnstile']);
  env.exported.installLedgerCycle();
  const realNow = env.sandbox.Date.now;
  let t = realNow();
  env.sandbox.Date.now = () => t;
  env.sandbox.bridgeQueue = () => { t += 5 * 60 * 1000; };
  env.exported.runLedgerCycle();
  env.sandbox.Date.now = realNow;
  env.props.setProperty('LEDGER_CYCLE_BUSY_UNTIL', String(env.sandbox.Date.now() + 60000));
  env.exported.runLedgerCycle();
  const timing = JSON.parse(env.props.getProperty('LEDGER_CYCLE_TIMING'));
  assert.equal(timing.runStagingTurnstile.deferred, 1);
  assert.equal(timing._cycle.deferredCycles, 1);
  assert.equal(timing._cycle.busy, 1);
  assert.match(env.exported.lcTimingReport_(env.props).jobs.runStagingTurnstile, /no run timed yet/);
});

test('LEDGER_CYCLE_EVERY slows a job without a push; a bad value is ignored', () => {
  const env = setup(['bridgeQueue', 'harvestFlowInputResults']);
  env.exported.installLedgerCycle();
  env.props.setProperty('LEDGER_CYCLE_EVERY', JSON.stringify({ harvestFlowInputResults: 5, bridgeQueue: 0.5, notAJob: 3 }));
  assert.equal(env.exported.lcJobEvery_('harvestFlowInputResults', env.props), 5);
  assert.equal(env.exported.lcJobEvery_('bridgeQueue', env.props), 1, 'not a whole minute: ignored');
  env.exported.runLedgerCycle();
  const last = JSON.parse(env.props.getProperty('LEDGER_CYCLE_LAST_RUN'));
  Object.keys(last).forEach((k) => { last[k] -= 61 * 1000; });
  env.props.setProperty('LEDGER_CYCLE_LAST_RUN', JSON.stringify(last));
  assert.deepEqual(env.exported.runLedgerCycle().ran, ['bridgeQueue'], 'the harvest waits its 5 minutes');
  assert.match(env.exported.lcTimingReport_(env.props).schedule, /harvestFlowInputResults every 5/);
  env.props.setProperty('LEDGER_CYCLE_EVERY', 'not json');
  assert.equal(env.exported.lcJobEvery_('harvestFlowInputResults', env.props), 1);
});

// Audit 1.1 (2026-11-20): the Flow 2, warm-up and watchdog installers go
// through lcInstallJob_, so a re-run never takes a job out of the cycle.
test('the old installers add their jobs to the installed cycle, never their own triggers', () => {
  const env = loadGasFiles(['00_SharedConfig.js', '64_LedgerCycle.js', '34_QueueWatchdog.js', '37_FlowInputBuilder.js',
    '41_WarmUpFlowBridge.js'].map(S).concat(require('../../tools/gas-lint/project-map.json')['cas-ccps:central-ledger'].files
    .filter((f) => !/(00_SharedConfig|64_LedgerCycle|34_QueueWatchdog|37_FlowInputBuilder|41_WarmUpFlowBridge)\.js$/.test(f))
    .map((f) => path.join(__dirname, '..', '..', f))),
  ['installLedgerCycle', 'installFlowInputTriggers', 'installWarmUpFlowTriggers', 'installQueueWatchdogTrigger', 'lcRecordedJobs_']);
  const sb = env.sandbox;
  env.exported.installLedgerCycle();
  const before = sb.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction()).sort();
  env.exported.installFlowInputTriggers();
  env.exported.installWarmUpFlowTriggers();
  assert.deepEqual([...env.exported.installWarmUpFlowTriggers().installed], [], 'a re-run adds nothing');
  env.exported.installQueueWatchdogTrigger();
  assert.equal(env.exported.installQueueWatchdogTrigger(), false, 'a re-run adds nothing');
  assert.deepEqual(sb.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction()).sort(), before, 'no trigger added');
  const jobs = env.exported.lcRecordedJobs_(sb.PropertiesService.getScriptProperties());
  ['buildFlowInputRows', 'harvestFlowInputResults', 'buildWarmUpFlowInputs', 'harvestWarmUpFlowReturns', 'runQueueWatchdog']
    .forEach((fn) => assert.ok(jobs.includes(fn), fn + ' in the cycle'));
});
