'use strict';
// 64_LedgerCycle.js's checks before work (2026-11-15). An idle cycle took
// about 14.5 s on 11-15, 1,440 a day: about 5.8 h of the 6 h daily trigger
// quota. Pins: each job on the way to feedback is skipped only when its
// check (beside the job, in 03, 06, 37, 68 and 72) finds nothing to do; a
// check that can't read runs its job; a job that ran makes the cycle check
// the steps after it at once, so a submission reaches its FlowInput row,
// and a result its backprop, in one cycle, with no second FlowInput row;
// quiet hours (a weekday night, a Saturday, a SCHOOL_DAYS_OFF day) hold the
// jobs without a check until the backstop, which runs everything; the
// onChange probe installs, logs and removes without an address or a cell
// value; and the day's projection and its WARN / ALERT. Every clock here is
// pinned: a test file failed after midnight on 11-15 on the real clock.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '63_DocHeader.js', '03_QueueBridge.js', '04_Form2_TurnInGate.js',
  '15b_StudioFlowPrompts_Flow2_Revised.js', '15c_Flow2DirectEvaluationService.js', '32_CompetencyRubricImporter.js', '37_FlowInputBuilder.js',
  '68_LessonParts.js', '40_FlowPrompts.js', '54_StudentAssignments.js', '55b_LessonAssignmentData.js',
  '06_StagingPipeline_Turnstile.js', '71_TurnInCodes.js', '72_TurnInCheckFlow.js', '64_LedgerCycle.js'].map(S);

const MIN = 60 * 1000;
// Wednesday 2026-11-18, 10:00 in New York: a school day, school hours.
const WED_10AM = Date.UTC(2026, 10, 18, 15, 0, 0);

const GATED = ['bridgeQueue', 'runStagingTurnstile', 'buildFlowInputRows', 'harvestFlowInputResults',
  'backPropagateCompletions', 'unlockReadyParts', 'runTurnInCheckFlow'];
const UNGATED = ['buildWarmUpFlowInputs', 'harvestWarmUpFlowReturns', 'registerDeliveredWarmUps',
  'runAlignmentLogBackfill_', 'runQueueWatchdog'];

function pinClock(sandbox, ms) {
  const clock = { ms };
  const RealDate = sandbox.Date;
  sandbox.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(clock.ms); }
    static now() { return clock.ms; }
    static [Symbol.hasInstance](x) { return x instanceof RealDate || (x && typeof x.getTime === 'function'); }
  };
  return clock;
}

const RQ_HEADERS = ['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'StudentText', 'Status'];
const STG_HEADERS = ['Timestamp', 'QueueRowRef', 'StudentFileID', 'ConfigID', 'TeacherEmail', 'Status'];

// A Central Ledger with the tabs the checks read, the cycle installed with
// `jobs`, and a minute that is neither the first nor the backstop.
function setup(opts = {}) {
  const env = loadGasFiles(FILES, ['runLedgerCycle', 'lcTimingReport_', 'lcProjection_', 'FI', 'FI_HEADERS',
    'LEDGER', 'TCHK', 'TURN_IN_CHECK_HEADERS', 'TIC_RETURN_HEADERS', 'installLedgerChangeProbe',
    'removeLedgerChangeProbe', 'reportLedgerChangeProbe', 'onLedgerChangeProbe', 'lcSettingLines_']);
  const sb = env.sandbox;
  const clock = pinClock(sb, opts.now || WED_10AM);
  const ss = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sb.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TURN_IN_CODE_COURSES', 'all');
  Object.entries(opts.props || {}).forEach(([k, v]) => props.setProperty(k, v));
  const x = env.exported;
  const tab = (name, headers) => { const sh = ss.insertSheet(name); sh.appendRow(headers); return sh; };
  const t = {
    queue: tab('ReviewQueue', RQ_HEADERS),
    staging: tab('STAGING_PIPELINE', STG_HEADERS),
    fi: tab('FlowInput', x.FI_HEADERS),
    ledger: tab('Ledger', new Array(27).fill('h')),
    registry: tab('MatrixRegistry', ['TeacherName', 'TeacherEmail', 'MatrixSsId', 'Created']),
    checks: tab('TurnInChecks', x.TURN_IN_CHECK_HEADERS),
    returns: tab('TurnInCheckReturn', x.TIC_RETURN_HEADERS),
    evidence: tab('CompetencyEvidence', ['h']),
  };
  // What a day leaves behind: all of it finished.
  t.queue.appendRow([new Date(clock.ms - 60 * MIN), 'student@example.invalid', 'f-old', 'C-OLD', '', 'COMPLETE']);
  t.staging.appendRow([new Date(clock.ms - 60 * MIN), '2', 'f-old', 'C-OLD', 'teacher@example.invalid', 'COMPLETE']);
  t.fi.appendRow(fiRow(x, { file: 'f-old', config: 'C-OLD', status: 'HARVESTED', at: clock.ms - 60 * MIN }));
  t.ledger.appendRow(ledgerRow(x, { status: 'ACTIVE' }));
  const check = new Array(x.TURN_IN_CHECK_HEADERS.length).fill('');
  check[x.TCHK.CHECK_ID] = 'TIC-1';
  check[x.TCHK.STATUS] = 'ADDRESSES';
  t.checks.appendRow(check);
  t.returns.appendRow([new Date(clock.ms - 60 * MIN), 'TIC-1', 'VERDICT: ADDRESSES', 'APPLIED', '', new Date(clock.ms - 59 * MIN)]);

  const jobs = opts.jobs || GATED;
  props.setProperty('LEDGER_CYCLE_JOBS', JSON.stringify(jobs));
  sb.ScriptApp.newTrigger('runLedgerCycle').timeBased().everyMinutes(1).create();
  const last = { _backstop: clock.ms - (opts.backstopAgo === undefined ? MIN : opts.backstopAgo) };
  jobs.forEach((fn) => { last[fn] = opts.lastRun === undefined ? clock.ms - 61 * 1000 : opts.lastRun; });
  props.setProperty('LEDGER_CYCLE_LAST_RUN', JSON.stringify(last));

  const calls = [];
  const stub = (fns) => fns.forEach((fn) => {
    sb[fn] = () => { calls.push(fn); return fn === 'unlockReadyParts' ? { unlocked: 0, failed: 0 } : undefined; };
  });
  if (opts.stub !== false) stub(jobs);
  const cycle = (minutes = 1) => { clock.ms += minutes * MIN; return env.exported.runLedgerCycle(); };
  const run = () => env.exported.runLedgerCycle();
  return Object.assign(env, { ss, props, clock, t, x, calls, cycle, run });
}

function fiRow(x, { file, config, status, at, ref = 2, armedAt = '' }) {
  const row = new Array(x.FI_HEADERS.length).fill('');
  row[x.FI.TIMESTAMP] = new Date(at);
  row[x.FI.STAGING_ROW_REF] = ref;
  row[x.FI.STUDENT_FILE_ID] = file;
  row[x.FI.CONFIG_ID] = config;
  row[x.FI.READY_STATUS] = status;
  row[x.FI.ARMED_AT] = armedAt;
  row[x.FI.PROMPT_TEXT] = 'prompt';
  return row;
}

function ledgerRow(x, { status, googleId = 'student@example.invalid', configId = 'C-OLD', fileId = 'f-old',
  teacher = 'teacher@example.invalid' }) {
  const row = new Array(27).fill('');
  row[x.LEDGER.GOOGLE_ID] = googleId;
  row[x.LEDGER.CONFIG_ID] = configId;
  row[x.LEDGER.FILE_ID] = fileId;
  row[x.LEDGER.TEACHER_EMAIL] = teacher;
  row[x.LEDGER.STATUS] = status;
  return row;
}

// ── The checks ─────────────────────────────────────────────────────────────

test('with nothing waiting, every job on the way to feedback is checked and skipped, and the skips are timed', () => {
  const env = setup();
  const r = env.run();
  assert.deepEqual(r.ran, []);
  assert.deepEqual(r.idle.slice().sort(), GATED.slice().sort());
  assert.equal(r.backstop, false);
  assert.deepEqual(env.calls, []);
  const timing = JSON.parse(env.props.getProperty('LEDGER_CYCLE_TIMING'));
  assert.equal(timing.bridgeQueue.checks, 1);
  assert.equal(timing.bridgeQueue.idle, 1);
  assert.equal(timing.bridgeQueue.runs, 0, 'a skip is not a run');
  assert.equal(timing._gates.runs, 1, 'the cycle\'s checks, timed as one');
  assert.match(env.x.lcTimingReport_(env.props).jobs.bridgeQueue, /^no run timed yet; checked 1 time\(s\) today, nothing waiting 1/);
  // A skipped job is not overdue the next minute: it was looked at.
  const last = JSON.parse(env.props.getProperty('LEDGER_CYCLE_LAST_RUN'));
  assert.equal(last.bridgeQueue, env.clock.ms);
});

test('each check runs its job when something waits', () => {
  const cases = [
    ['bridgeQueue', 'a PENDING ReviewQueue row', (e) =>
      e.t.queue.appendRow([new Date(e.clock.ms), 's@example.invalid', 'f-1', 'C-1', '', 'PENDING'])],
    ['bridgeQueue', 'student text left in ReviewQueue', (e) => e.t.queue.getRange(2, 5).setValue('words')],
    ['runStagingTurnstile', 'a PENDING_INFERENCE row', (e) =>
      e.t.staging.appendRow([new Date(e.clock.ms), '3', 'f-1', 'C-1', 'teacher@example.invalid', 'PENDING_INFERENCE'])],
    ['runStagingTurnstile', 'an IN_PROCESS row old enough to time out', (e) => {
      e.t.staging.appendRow([new Date(e.clock.ms - 12 * MIN), '3', 'f-1', 'C-1', 'teacher@example.invalid', 'IN_PROCESS']);
      e.t.fi.appendRow(fiRow(e.x, { file: 'f-1', config: 'C-1', status: 'READY', at: e.clock.ms - 5 * MIN, ref: 3 }));
    }],
    ['buildFlowInputRows', 'an IN_PROCESS submission with no FlowInput row', (e) =>
      e.t.staging.appendRow([new Date(e.clock.ms - MIN), '3', 'f-1', 'C-1', 'teacher@example.invalid', 'IN_PROCESS'])],
    ['buildFlowInputRows', 'a FlowInput row left blank', (e) =>
      e.t.fi.appendRow(fiRow(e.x, { file: 'f-1', config: 'C-1', status: '', at: e.clock.ms - MIN }))],
    ['buildFlowInputRows', 'a READY row unanswered 12 minutes (the re-arm)', (e) =>
      e.t.fi.appendRow(fiRow(e.x, { file: 'f-1', config: 'C-1', status: 'READY', at: e.clock.ms - 13 * MIN, ref: 3 }))],
    ['harvestFlowInputResults', 'an EVALUATED FlowInput row', (e) =>
      e.t.fi.appendRow(fiRow(e.x, { file: 'f-1', config: 'C-1', status: 'EVALUATED', at: e.clock.ms - MIN }))],
    ['backPropagateCompletions', 'a COMPLETE staging row whose queue row is STAGED', (e) =>
      e.t.queue.getRange(2, 6).setValue('STAGED')],
    ['backPropagateCompletions', 'a timed-out staging row whose queue row is STAGED', (e) => {
      e.t.queue.getRange(2, 6).setValue('STAGED');
      e.t.staging.getRange(2, 6).setValue('ERROR_TIMEOUT');
    }],
    ['unlockReadyParts', 'a SCHEDULED part', (e) => e.t.ledger.appendRow(ledgerRow(e.x, { status: 'SCHEDULED' }))],
    ['runTurnInCheckFlow', 'an answer PENDING_CHECK', (e) => e.t.checks.getRange(2, e.x.TCHK.STATUS + 1).setValue('PENDING_CHECK')],
    ['runTurnInCheckFlow', 'a Flow 6 return not yet harvested', (e) => e.t.returns.getRange(2, 4).setValue('')],
  ];
  for (const [job, what, mutate] of cases) {
    const env = setup();
    mutate(env);
    const r = env.run();
    assert.ok(r.ran.includes(job), job + ' runs for ' + what + ' (ran: ' + r.ran.join(', ') + ')');
  }
});

test('the checks stay quiet for what their job would not act on', () => {
  // An IN_PROCESS row still in Studio's hands, with its READY FlowInput row:
  // neither the turnstile nor the builder has anything to do.
  const env = setup();
  env.t.staging.appendRow([new Date(env.clock.ms - 3 * MIN), '3', 'f-1', 'C-1', 'teacher@example.invalid', 'IN_PROCESS']);
  env.t.fi.appendRow(fiRow(env.x, { file: 'f-1', config: 'C-1', status: 'READY', at: env.clock.ms - 3 * MIN, ref: 3 }));
  // A COMPLETE staging row whose queue row is already COMPLETE, and the
  // fixture's READY row, which is never re-armed.
  env.t.fi.appendRow(fiRow(env.x, { file: 'f-fx', config: 'C-FX', status: 'READY', at: env.clock.ms - 99 * MIN, ref: 'FIXTURE' }));
  assert.deepEqual(env.run().ran, []);
  // The turn-in switch off everywhere: Flow 6 has nothing to do whatever waits.
  const off = setup({ props: { TURN_IN_CODE_COURSES: 'off' } });
  off.t.checks.getRange(2, off.x.TCHK.STATUS + 1).setValue('PENDING_CHECK');
  assert.ok(!off.run().ran.includes('runTurnInCheckFlow'));
});

test('the part unlock check remembers a run that unlocked nothing until what it reads changes', () => {
  const env = setup();
  env.t.ledger.appendRow(ledgerRow(env.x, { status: 'SCHEDULED' }));
  assert.ok(env.run().ran.includes('unlockReadyParts'), 'a locked part: run once');
  assert.ok(!env.cycle().ran.includes('unlockReadyParts'), 'nothing changed since a run that unlocked nothing');
  env.t.evidence.appendRow(['a MET arrives']);
  assert.ok(env.cycle().ran.includes('unlockReadyParts'), 'a new evidence row: run again');
  assert.ok(!env.cycle().ran.includes('unlockReadyParts'));
  // A run that unlocked something keeps no signature: the next check runs it.
  env.sandbox.unlockReadyParts = () => ({ unlocked: 1, failed: 0 });
  env.t.ledger.appendRow(ledgerRow(env.x, { status: 'SCHEDULED', configId: 'C-2' }));
  assert.ok(env.cycle().ran.includes('unlockReadyParts'));
  assert.ok(env.cycle().ran.includes('unlockReadyParts'), 'not remembered after it did something');
  assert.doesNotMatch(env.props.getProperty('LEDGER_CYCLE_GATE_MEMO') || '', /@|example/, 'counts and a hash only');
});

test('a check that can\'t read, or throws, runs its job; LEDGER_CYCLE_GATES=off runs every job', () => {
  // The admin spreadsheet can't be opened: every check that reads it runs its job.
  const env = setup({ props: { ADMIN_SS_ID: 'missing-spreadsheet' } });
  const r = env.run();
  assert.deepEqual(r.ran.slice().sort(),
    ['backPropagateCompletions', 'bridgeQueue', 'buildFlowInputRows', 'runStagingTurnstile']);
  // One check throws.
  const env2 = setup();
  env2.sandbox.flowInputHarvestHasWork_ = () => { throw new Error('Service Spreadsheets timed out'); };
  assert.deepEqual(env2.run().ran, ['harvestFlowInputResults']);
  // The switch.
  const env3 = setup({ props: { LEDGER_CYCLE_GATES: 'off' } });
  const r3 = env3.run();
  assert.deepEqual(r3.ran.slice().sort(), GATED.slice().sort());
  assert.deepEqual(r3.idle, []);
});

// ── The chains ─────────────────────────────────────────────────────────────

function realPipeline() {
  const env = setup({ stub: false, jobs: ['bridgeQueue', 'runStagingTurnstile', 'buildFlowInputRows',
    'harvestFlowInputResults', 'backPropagateCompletions'] });
  const sb = env.sandbox;
  const doc = sb.DocumentApp.create('Student Doc');
  doc.getBody().setText('[No feedback yet. Use the panel to run a check.]');
  const file = doc.getId();
  env.t.ledger.appendRow(ledgerRow(env.x, { status: 'ACTIVE', configId: 'C-1', fileId: file }));
  env.t.registry.appendRow(['Teacher', 'teacher@example.invalid', 'matrix-1', new Date(env.clock.ms)]);
  const matrix = sb.SpreadsheetApp.create('Teacher Matrix');
  sb.SpreadsheetApp._registry.set('matrix-1', matrix);
  const tm = matrix.insertSheet('TeacherMatrix');
  tm.appendRow(new Array(20).fill('header'));
  const m = new Array(20).fill('');
  m[0] = 'C-1'; m[1] = 'Unit'; m[2] = 'Tier 1'; m[3] = 'Coach'; m[4] = 'M1'; m[8] = 'DoD'; m[15] = 'COMP-1';
  tm.appendRow(m);
  env.t.queue.appendRow([new Date(env.clock.ms), 'student@example.invalid', file, 'C-1', '', 'PENDING']);
  return Object.assign(env, { file });
}

test('a chain carries a submission to its FlowInput row, and a result through backprop, each in one cycle, with no second row', () => {
  const env = realPipeline();
  const fiRows = () => env.t.fi.getLastRow() - 1;
  const r1 = env.run();
  assert.deepEqual(r1.errors, []);
  assert.deepEqual(r1.ran, ['bridgeQueue', 'runStagingTurnstile', 'buildFlowInputRows'], 'bridge → turnstile → builder');
  assert.deepEqual(r1.chained, ['runStagingTurnstile', 'buildFlowInputRows']);
  assert.equal(fiRows(), 2, 'the old row and the new one');
  assert.equal(env.t.fi.getRange(3, env.x.FI.READY_STATUS + 1).getValue(), 'READY');

  // While Studio works, nothing has work.
  assert.deepEqual(env.cycle().ran, []);

  // Studio answers.
  env.t.fi.getRange(3, env.x.FI.GEMINI_FULL_OUTPUT + 1).setValue('Good work.\n[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 4]\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET"}]');
  env.t.fi.getRange(3, env.x.FI.READY_STATUS + 1).setValue('EVALUATED');
  const r3 = env.cycle();
  assert.deepEqual(r3.errors, []);
  assert.deepEqual(r3.ran, ['harvestFlowInputResults', 'backPropagateCompletions'], 'harvest → backprop');
  assert.deepEqual(r3.chained, ['backPropagateCompletions']);
  assert.equal(env.t.fi.getRange(3, env.x.FI.READY_STATUS + 1).getValue(), 'HARVESTED');
  assert.equal(env.t.staging.getRange(3, 6).getValue(), 'COMPLETE');
  assert.equal(env.t.queue.getRange(3, 6).getValue(), 'COMPLETE', 'closed in the same cycle');

  // Then nothing, and the backstop runs every job without building a second row.
  assert.deepEqual(env.cycle().ran, []);
  const r5 = env.cycle(15);
  assert.equal(r5.backstop, true);
  assert.equal(r5.ran.length, 5);
  assert.equal(fiRows(), 2, 'no second FlowInput row');
});

// ── Quiet hours and the backstop ───────────────────────────────────────────

const ALL = GATED.concat(UNGATED);

function quietCase(now, props) {
  // Every job overdue; the backstop ran 5 minutes ago.
  return setup({ now, props, jobs: ALL, lastRun: 0, backstopAgo: 5 * MIN });
}

test('quiet hours run only the checks, except on the backstop minute, which runs everything', () => {
  const cases = [
    ['a weekday at 11 p.m.', Date.UTC(2026, 10, 19, 4, 0, 0), {}, 'night'],
    ['a Saturday', Date.UTC(2026, 10, 21, 15, 0, 0), {}, 'weekend'],
    ['a SCHOOL_DAYS_OFF day', Date.UTC(2026, 10, 25, 15, 0, 0), { SCHOOL_DAYS_OFF: '2026-11-25' }, 'day off'],
  ];
  for (const [what, now, props, why] of cases) {
    const env = quietCase(now, props);
    const r = env.run();
    assert.equal(r.quiet, why, what);
    assert.deepEqual(r.ran, [], what + ': nothing waits, and the jobs without a check wait');
    assert.deepEqual(r.held.slice().sort(), UNGATED.slice().sort(), what);
    assert.deepEqual(r.idle.slice().sort(), GATED.slice().sort(), what + ': the checks still run');
    const b = env.cycle(10); // 15 minutes since the backstop
    assert.equal(b.backstop, true, what);
    assert.deepEqual(b.ran.slice().sort(), ALL.slice().sort(), what + ': the backstop runs every job');
  }
  // Wednesday 10 a.m. is not quiet: the jobs without a check run on their cadence.
  const day = quietCase(WED_10AM, {});
  const r = day.run();
  assert.equal(r.quiet, '');
  assert.deepEqual(r.ran.slice().sort(), UNGATED.slice().sort());
});

test('a submission found at night is still processed', () => {
  const env = quietCase(Date.UTC(2026, 10, 19, 4, 0, 0), {});
  env.t.queue.appendRow([new Date(env.clock.ms), 's@example.invalid', 'f-1', 'C-1', '', 'PENDING']);
  const r = env.run();
  assert.equal(r.quiet, 'night');
  assert.deepEqual(r.ran, ['bridgeQueue']);
});

// Quiet hours' checks every LEDGER_CYCLE_QUIET_EVERY minutes (2026-11-19, the
// operator: the idle cycle alone projected 83% of the daily trigger quota on
// a day off). Between full cycles a minute returns at once.
test('in quiet hours a full cycle every 5 minutes; the minutes between return at once; school hours every minute', () => {
  const env = quietCase(Date.UTC(2026, 10, 19, 4, 0, 0), {}); // a weekday, 11 p.m. Eastern
  assert.equal(env.run().quiet, 'night');
  env.t.queue.appendRow([new Date(env.clock.ms), 's@example.invalid', 'f-1', 'C-1', '', 'PENDING']);
  for (let m = 1; m <= 4; m++) {
    const r = env.cycle(1);
    assert.equal(r.skipped, 'quiet', 'minute ' + m);
    assert.deepEqual(r.ran, []);
  }
  const full = env.cycle(1);
  assert.equal(full.skipped, undefined, 'the fifth minute is a full cycle');
  assert.deepEqual(full.ran, ['bridgeQueue'], 'the night\'s submission, five minutes on');

  // 5:58 a.m.: a full cycle; 6:00 is school hours, so a full cycle though 5 minutes haven't passed.
  const dawn = quietCase(Date.UTC(2026, 10, 19, 10, 58, 0), {});
  assert.equal(dawn.run().quiet, 'night');
  assert.equal(dawn.cycle(1).skipped, 'quiet', '5:59');
  const six = dawn.cycle(1);
  assert.equal(six.skipped, undefined);
  assert.equal(six.quiet, '');
  assert.equal(dawn.cycle(1).skipped, undefined, 'school hours: every minute');

  // A Saturday: the next day starts with a full cycle.
  const sat = quietCase(Date.UTC(2026, 10, 22, 4, 58, 0), {}); // 11:58 p.m. Saturday
  assert.equal(sat.run().quiet, 'weekend');
  assert.equal(sat.cycle(1).skipped, 'quiet');
  assert.equal(sat.cycle(1).skipped, undefined, 'midnight: a new day, a full cycle');

  // LEDGER_CYCLE_QUIET_EVERY = 1: every minute, as before; 2: every other one; out of range: 5.
  const one = quietCase(Date.UTC(2026, 10, 19, 4, 0, 0), { LEDGER_CYCLE_QUIET_EVERY: '1' });
  one.run();
  assert.equal(one.cycle(1).skipped, undefined);
  assert.equal(one.props.getProperty('LEDGER_CYCLE_QUIET_NEXT'), null);
  const two = quietCase(Date.UTC(2026, 10, 19, 4, 0, 0), { LEDGER_CYCLE_QUIET_EVERY: '2' });
  two.run();
  assert.equal(two.cycle(1).skipped, 'quiet');
  assert.equal(two.cycle(1).skipped, undefined);
  const bad = quietCase(Date.UTC(2026, 10, 19, 4, 0, 0), { LEDGER_CYCLE_QUIET_EVERY: '0' });
  bad.run();
  assert.equal(bad.cycle(4).skipped, 'quiet');
  assert.equal(bad.cycle(1).skipped, undefined);

  // School hours never skip, and a garbled note runs the full cycle.
  const day = quietCase(WED_10AM, {});
  day.run();
  assert.equal(day.cycle(1).skipped, undefined);
  day.props.setProperty('LEDGER_CYCLE_QUIET_NEXT', 'not json');
  assert.equal(day.cycle(1).skipped, undefined);
});

test('LEDGER_CYCLE_QUIET and LEDGER_CYCLE_BACKSTOP change the hours and the interval; off turns quiet hours off', () => {
  const at11pm = Date.UTC(2026, 10, 19, 4, 0, 0);
  assert.equal(quietCase(at11pm, { LEDGER_CYCLE_QUIET: 'off' }).run().quiet, '');
  assert.equal(quietCase(at11pm, { LEDGER_CYCLE_QUIET: '{"from":0,"to":6}' }).run().quiet, '');
  assert.equal(quietCase(at11pm, { LEDGER_CYCLE_QUIET: 'not json' }).run().quiet, 'night', 'a bad value keeps the default');
  // A 5-minute backstop: due now (it ran 5 minutes ago).
  assert.equal(quietCase(at11pm, { LEDGER_CYCLE_BACKSTOP: '5' }).run().backstop, true);
  assert.equal(quietCase(at11pm, { LEDGER_CYCLE_BACKSTOP: '90' }).run().backstop, false, 'out of range: 15');
});

// ── The onChange probe ─────────────────────────────────────────────────────

test('the probe installs once, logs each change without an address or a cell value, keeps 200, and removes', () => {
  const env = setup();
  const sb = env.sandbox;
  const probes = () => sb.ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'onLedgerChangeProbe');
  env.x.installLedgerChangeProbe();
  env.x.installLedgerChangeProbe();
  assert.equal(probes().length, 1);
  assert.equal(probes()[0].getEventType(), 'ON_CHANGE');

  const user = (email) => ({ getEmail: () => email });
  env.t.fi.appendRow(fiRow(env.x, { file: 'f-secret', config: 'C-SECRET', status: 'READY', at: env.clock.ms }));
  env.x.onLedgerChangeProbe({ changeType: 'EDIT', user: user('teacher@example.com'), source: env.ss });
  env.x.onLedgerChangeProbe({ changeType: 'INSERT_ROW', user: user('someone@example.invalid'), source: env.ss });
  env.x.onLedgerChangeProbe({ changeType: 'OTHER', source: env.ss });
  const log = env.ss.getSheetByName('_ChangeProbe').getDataRange().getValues();
  assert.deepEqual(log[0], ['At', 'ChangeType', 'ByProbeOwner', 'TabsMoved']);
  assert.deepEqual(log.slice(1).map((r) => r.slice(1)), [
    ['EDIT', 'yes', 'FlowInput +1'],
    ['INSERT_ROW', 'no', 'none'],
    ['OTHER', 'unknown', 'none'],
  ]);
  const text = JSON.stringify(log) + env.props.getProperty('LEDGER_CHANGE_PROBE_ROWS');
  assert.doesNotMatch(text, /@|f-secret|C-SECRET|prompt/, 'no address, no cell value');

  for (let i = 0; i < 205; i++) env.x.onLedgerChangeProbe({ changeType: 'EDIT', source: env.ss });
  assert.equal(env.ss.getSheetByName('_ChangeProbe').getLastRow() - 1, 200, 'the last 200');

  const report = env.x.reportLedgerChangeProbe();
  assert.equal(report.installed, true);
  assert.equal(report.events, 200);
  assert.match(report.lines[1], /^By change type: EDIT 200$/);
  assert.doesNotMatch(report.lines.join('\n'), /@/);

  assert.equal(env.x.removeLedgerChangeProbe().removed, 1);
  assert.equal(probes().length, 0);
  assert.match(env.x.reportLedgerChangeProbe().lines[0], /not installed/);
});

// ── The projection ─────────────────────────────────────────────────────────

function projected(timing, props = {}) {
  const env = setup({ jobs: ALL, props });
  env.props.setProperty('LEDGER_CYCLE_TIMING', JSON.stringify(timing));
  return env.x.lcProjection_(env.props);
}

const usual = (base) => {
  const t = { _base: { avg: base }, _gates: { avg: 1500 } };
  GATED.forEach((fn) => { t[fn] = { avg: 2000 }; });
  ['buildWarmUpFlowInputs', 'harvestWarmUpFlowReturns', 'registerDeliveredWarmUps', 'runAlignmentLogBackfill_']
    .forEach((fn) => { t[fn] = { avg: 3000 }; });
  t.runQueueWatchdog = { avg: 22000 };
  return t;
};

test('the projection: each part\'s usual time × how often the schedule runs it, with WARN over 50% and ALERT over 80%', () => {
  // Checks every minute in quiet hours too (LEDGER_CYCLE_QUIET_EVERY = 1, as
  // before 2026-11-19). A school day (480 quiet minutes, backstop every 15):
  //   the cycle's own 1,440 × 1 s = 1,440 s; the checks (1,440 − 96) × 1.5 s = 2,016 s;
  //   seven checked jobs at the backstop, 96 × 2 s × 7 = 1,344 s;
  //   four warm-up jobs every 5 min by day, 15 at night: (192 + 32) × 3 s × 4 = 2,688 s;
  //   the watchdog every 10 by day, 15 at night: (96 + 32) × 22 s = 2,816 s;
  //   10,304 s = 2.9 h, 48% of 6 h. A day off: 1,440 + 2,016 + 1,344 + 96 × 3 × 4 + 96 × 22 = 8,064 s = 2.2 h.
  const every1 = { LEDGER_CYCLE_QUIET_EVERY: '1' };
  const p = projected(usual(1000), every1);
  assert.equal(p.level, '');
  assert.equal(p.schoolHours, 2.9);
  assert.equal(p.offHours, 2.2);
  assert.match(p.line, /^At this rate: about 2\.9 h a day \(48% of the 6 h\) on a school day, 2\.2 h \(37%\) on a day off/);
  // 2 s more of the cycle's own time a minute: 13,184 s = 3.7 h, 61%.
  const warn = projected(usual(3000), every1);
  assert.equal(warn.level, 'WARN');
  assert.match(warn.line, /^WARN: At this rate: about 3\.7 h a day \(61% of the 6 h\)/);
  // 5 s more: 17,504 s = 4.9 h, 81%.
  const alert = projected(usual(6000), every1);
  assert.equal(alert.level, 'ALERT');
  assert.match(alert.line, /^ALERT: At this rate: about 4\.9 h a day \(81% of the 6 h\)/);
  assert.match(alert.line, /every trigger here stops until tomorrow/);
  // Checks off: every job on its cadence, all day: 1,440 + 7 × 1,440 × 2 + 4 × 288 × 3 + 144 × 22 = 28,224 s.
  const off = projected(usual(1000), { LEDGER_CYCLE_GATES: 'off' });
  assert.equal(off.schoolHours, 7.8);
  assert.equal(off.level, 'ALERT');
});

test('the projection with quiet hours\' checks every 5 minutes (the default since 2026-11-19)', () => {
  // A school day: full cycles 960 + 480 / 5 = 1,056; the cycle's own 1,056 × 1 s;
  // the checks (1,056 − 96) × 1.5 s = 1,440 s; the jobs as before (1,344 + 2,688 + 2,816):
  // 9,344 s = 2.6 h. A day off: 288 full cycles: 288 + 192 × 1.5 + 1,344 + 1,152 + 2,112 = 5,184 s = 1.4 h.
  const p = projected(usual(1000));
  assert.equal(p.schoolHours, 2.6);
  assert.equal(p.offHours, 1.4);
  // The 11-19 numbers' shape: about 5.6 s of the cycle's own and 7 s of checks a minute.
  const live = usual(5600);
  live._gates = { avg: 7000 };
  const before = projected(live, { LEDGER_CYCLE_QUIET_EVERY: '1' });
  const after = projected(live);
  assert.ok(after.offHours < before.offHours / 2, before.offHours + ' -> ' + after.offHours);
  assert.ok(after.schoolHours < before.schoolHours, before.schoolHours + ' -> ' + after.schoolHours);
});

test('the projection before a cycle with checks: the cycle\'s usual time × 1,440 (11-15: 14.5 s, 5.8 h, ALERT)', () => {
  const p = projected({ _cycle: { avg: 14500 } });
  assert.equal(p.schoolHours, 5.8);
  assert.equal(p.pct, 97);
  assert.equal(p.level, 'ALERT');
  assert.match(p.line, /from the cycle's usual time × 1,440/);
});

// ── The cycle's settings from the _CONFIG tab too (2026-11-15) ─────────────
// The operator put LEDGER_CYCLE_EVERY on the Central Ledger's _CONFIG tab,
// and 64 read it only from Script Properties. Now either works, the property
// first, read through 00's shared-config cache: no spreadsheet open added.

function configTab(env, rows) {
  const sh = env.ss.insertSheet('_CONFIG');
  sh.appendRow(['Key', 'Value']);
  rows.forEach((r) => sh.appendRow(r));
}

const EVERY_5 = JSON.stringify({ harvestFlowInputResults: 5 });

test('LEDGER_CYCLE_EVERY and LEDGER_CYCLE_GATES on the _CONFIG tab take effect', () => {
  const env = setup({ jobs: ['bridgeQueue', 'harvestFlowInputResults'] });
  configTab(env, [['LEDGER_CYCLE_EVERY', EVERY_5], ['LEDGER_CYCLE_GATES', 'off']]);
  const r = env.run();
  assert.deepEqual(r.ran, ['bridgeQueue'], 'the harvest waits for its 5 minutes; no checks (gates off)');
  assert.deepEqual(r.idle, []);
  const lines = env.x.lcSettingLines_();
  assert.ok(lines.includes('LEDGER_CYCLE_EVERY = ' + EVERY_5 + '  <- Central Ledger _CONFIG tab'));
  assert.ok(lines.includes('LEDGER_CYCLE_QUIET = (unset: the default)'));
});

test('a Script Property wins over the _CONFIG tab', () => {
  const env = setup({ jobs: ['bridgeQueue', 'harvestFlowInputResults'],
    props: { LEDGER_CYCLE_EVERY: JSON.stringify({ harvestFlowInputResults: 1 }) } });
  configTab(env, [['LEDGER_CYCLE_EVERY', EVERY_5], ['LEDGER_CYCLE_GATES', 'off']]);
  assert.deepEqual(env.run().ran, ['bridgeQueue', 'harvestFlowInputResults']);
  assert.ok(env.x.lcSettingLines_().some((l) => /^LEDGER_CYCLE_EVERY = .*<- Script Property$/.test(l)));
});

test('LEDGER_CYCLE_QUIET from the _CONFIG tab: off at 11 p.m. is not quiet; the property still wins', () => {
  const at11pm = Date.UTC(2026, 10, 19, 4, 0, 0);
  const fromTab = quietCase(at11pm, {});
  configTab(fromTab, [['LEDGER_CYCLE_QUIET', 'off']]);
  assert.equal(fromTab.run().quiet, '');
  const both = quietCase(at11pm, { LEDGER_CYCLE_QUIET: '{"from":22,"to":6}' });
  configTab(both, [['LEDGER_CYCLE_QUIET', 'off']]);
  assert.equal(both.run().quiet, 'night');
});

test('no extra spreadsheet open per cycle for a setting on the _CONFIG tab', () => {
  const opens = (env) => {
    const real = env.sandbox.SpreadsheetApp.openById;
    let n = 0;
    env.sandbox.SpreadsheetApp.openById = (id) => { n++; return real.call(env.sandbox.SpreadsheetApp, id); };
    const counts = [];
    for (let i = 0; i < 3; i++) { n = 0; env.cycle(1); counts.push(n); }
    return counts;
  };
  const asProperty = setup({ jobs: GATED, props: { LEDGER_CYCLE_EVERY: EVERY_5, LEDGER_CYCLE_BACKSTOP: '30' } });
  configTab(asProperty, []);
  const onTab = setup({ jobs: GATED });
  configTab(onTab, [['LEDGER_CYCLE_EVERY', EVERY_5], ['LEDGER_CYCLE_BACKSTOP', '30']]);
  const a = opens(asProperty);
  const b = opens(onTab);
  assert.deepEqual(b, a, 'the same opens, cycle by cycle');
  assert.ok(b[1] <= 1 && b[2] <= 1, 'after the first, at most the one the checks share: ' + b.join(','));
});
