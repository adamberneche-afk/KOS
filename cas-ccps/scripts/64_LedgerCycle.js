// =============================================================================
// FILE: 64_LedgerCycle.js
// BOUND TO: Central Ledger spreadsheet
// TRIGGERS: runLedgerCycle, every minute (installLedgerCycle() installs it).
//
// PURPOSE: one trigger for the Central Ledger's frequent jobs, run one after
// another, instead of a trigger each. 2026-10-12 to 10-19 the separate 1-, 5-
// and 10-minute triggers failed about 45 times, nearly all Google-side
// ("a server error occurred", "JavaScript engine ... INTERNAL", "reading from
// storage ... INTERNAL", runs that never started, a few hung 32 minutes), plus
// "too many LockService operations against the same script" once. Every job
// opens the same spreadsheet and takes the same document lock, so ten
// triggers mostly raced each other, and Studio's "Couldn't access the
// spreadsheet" came in the same windows. One cycle at a time means fewer
// executions against the Ledger, one job's error no longer stops the others
// (each runs in its own try/catch), and a slow cycle defers the rest to the
// next minute instead of piling up.
//
// Each job keeps its own cadence (LC_JOBS) and its own document lock; the
// cycle holds no lock while it runs (the jobs' locks aren't re-entrant), only a
// LEDGER_CYCLE_BUSY_UNTIL guard so two cycles don't overlap, claimed under a
// brief script lock (00's claimRunSlot_) so two can't claim it at once. The most overdue
// job runs first, and none starts after LC_BUDGET_MS.
//
// installLedgerCycle() replaces the jobs' own triggers with this one and
// records which jobs had one (LEDGER_CYCLE_JOBS), so the cycle runs exactly
// those. restoreLedgerTriggers() undoes it: one trigger per recorded job at
// its cadence (rounded to a cadence Apps Script accepts), the cycle removed.
// previewLedgerCycle() changes nothing. Logs function names and counts only.
//
// registerDeliveredWarmUps is always one of the cycle's jobs (LC_ALWAYS): the
// setup wizard (28) put its trigger in the Unified Manual project, so the
// Ledger never had one and 117 warm-ups were registered by hand on 10-19.
// installRegistrationTrigger() and installAlignmentBackfillTrigger() are the
// Run-menu entry points for those two jobs (2026-10-20): each adds its job to
// the cycle, or gives it its own trigger when the cycle isn't installed.
// installTurnInCheckFlow() (72, 2026-11-08) does the same for
// runTurnInCheckFlow, Flow 6's harvest, retry and materialize.
// installIntakeTriggers() (2026-11-08) does it for the three intake jobs
// (bridgeQueue, runStagingTurnstile, backPropagateCompletions), which had
// no installer: a new install added them in the Triggers panel by hand
// (the setup guide's gap 3).
//
// Every minute on the way to feedback (2026-11-14, the operator's "Build
// 1-4"): the jobs between a student's Submit and the feedback all run every
// minute now. harvestFlowInputResults and unlockReadyParts were every 5,
// backPropagateCompletions and runTurnInCheckFlow every 2, so the schedule
// alone could add up to about 9 minutes to a check Studio answered in one.
// The cycle already ran every minute, so this adds no executions, only run
// time inside them. Each job's run time is now recorded
// (LEDGER_CYCLE_TIMING: last, usual, today's runs and total, and how often
// the budget pushed it to the next cycle), and the cycle's own total today
// against the daily trigger run-time quota; showSetupStatus() (35) and
// reportEvaluationHealth() (69) show them. If a job turns out to cost more
// than it saves, LEDGER_CYCLE_EVERY ({"harvestFlowInputResults": 5}, a
// Script Property) slows it again without a push.
// =============================================================================

const LC_TRIGGER_FN = "runLedgerCycle";
const LC_BUDGET_MS = 4 * 60 * 1000;
const LC_BUSY_MS = 6 * 60 * 1000;
const LC_DUE_TOLERANCE_MS = 15 * 1000;
const LC_PROP_JOBS = "LEDGER_CYCLE_JOBS";
const LC_PROP_LAST = "LEDGER_CYCLE_LAST_RUN";
const LC_PROP_BUSY = "LEDGER_CYCLE_BUSY_UNTIL";
// Each job's failures (2026-10-22, UX audit fix-first 5): the cycle used to
// only log them, so the trigger "succeeded" and nothing showed a job failing
// every minute. { fn: { streak, since, day, dayCount } }: failures in a row
// (0 after a success), when the streak began, and today's count. 34b and
// 34c read it (function names and counts only). Once a job has failed
// LC_ALERT_STREAK cycles in a row, the cycle throws after running every job,
// so Google's trigger-failure email arrives too.
const LC_PROP_ERRORS = "LEDGER_CYCLE_ERRORS";
const LC_ALERT_STREAK = 10;
// Each job's run time (2026-11-14): { fn: { last, avg, max, day, runs,
// total, deferred } } in ms, and the same for the whole cycle under
// LC_TIMING_CYCLE, with busy (minutes skipped because a cycle still ran).
// avg is a running average (each run counts LC_TIMING_WEIGHT); the rest are
// today's. Function names and numbers only.
const LC_PROP_TIMING = "LEDGER_CYCLE_TIMING";
const LC_TIMING_CYCLE = "_cycle";
const LC_TIMING_WEIGHT = 0.2;
// A job's cadence set by hand, without a push: {"fn": minutes}, whole
// minutes from 1 to 60. Anything else is ignored (and the log says so).
const LC_PROP_EVERY = "LEDGER_CYCLE_EVERY";
// Google's published daily trigger run-time quota for a Google Workspace
// account: 6 hours (a consumer account has 90 minutes). The cycle's share of
// it is shown, so a cadence that costs too much shows before it hits.
const LC_DAILY_TRIGGER_MINUTES = 360;

// The Ledger's frequent jobs and their cadence in minutes, in pipeline order
// (used to break ties). The jobs a student waits on between Submit and
// feedback (or a turn-in code, or the next part) run every minute since
// 2026-11-14; the warm-up jobs and the watchdog keep the installers'
// cadences.
const LC_ALWAYS = ["registerDeliveredWarmUps"];

const LC_JOBS = [
  { fn: "bridgeQueue",               every: 1  }, // 03
  { fn: "runStagingTurnstile",       every: 1  }, // 06
  { fn: "buildFlowInputRows",        every: 1  }, // 37
  { fn: "harvestFlowInputResults",   every: 1  }, // 37 (5 before 2026-11-14)
  { fn: "backPropagateCompletions",  every: 1  }, // 03 (2 before 2026-11-14)
  { fn: "buildWarmUpFlowInputs",     every: 5  }, // 41
  { fn: "harvestWarmUpFlowReturns",  every: 5  }, // 41
  { fn: "registerDeliveredWarmUps",  every: 5  }, // 25
  { fn: "runAlignmentLogBackfill_",  every: 5  }, // 22
  { fn: "runQueueWatchdog",          every: 10 }, // 34
  { fn: "unlockReadyParts",          every: 1  }, // 68 (5 before 2026-11-14)
  { fn: "runTurnInCheckFlow",        every: 1  }, // 72 (Flow 6; installTurnInCheckFlow(); 2 before 2026-11-14)
];

// The jobs between a student's Submit and the feedback on their card, in
// order: the schedule can add up to one cadence at each.
const LC_FEEDBACK_PATH = ["bridgeQueue", "runStagingTurnstile", "buildFlowInputRows", "harvestFlowInputResults",
  "backPropagateCompletions"];

/** The cycle. Time trigger, every minute. */
function runLedgerCycle() {
  const props = PropertiesService.getScriptProperties();
  const started = Date.now();
  if (!claimRunSlot_(LC_PROP_BUSY, LC_BUSY_MS)) {
    Logger.log("[LC] A cycle is still running; skipping this minute.");
    try {
      const busy = lcTimingState_(props);
      lcNoteBusy_(busy, started);
      props.setProperty(LC_PROP_TIMING, JSON.stringify(busy));
    } catch (e) { /* the count is a nicety; the skip is what matters */ }
    return { ran: [], errors: [], skipped: "busy" };
  }
  const result = { ran: [], errors: [], deferred: [] };
  try {
    // A job that has its own trigger again (an installer re-run) is left to
    // it, so it doesn't run twice; installLedgerCycle() takes it back over.
    const own = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    const names = lcRecordedJobs_(props).filter(function (fn) { return own.indexOf(fn) === -1; });
    let last = {};
    try { last = JSON.parse(props.getProperty(LC_PROP_LAST) || "{}"); } catch (e) { last = {}; }
    var errs = lcErrorState_(props);
    const timing = lcTimingState_(props);
    const everyOf = lcEveryOverrides_(props);
    const due = LC_JOBS
      .map(function (j, order) {
        const every = everyOf[j.fn] || j.every;
        return { fn: j.fn, every: every, order: order, overdue: started - Number(last[j.fn] || 0) - every * 60000 };
      })
      .filter(function (j) { return names.indexOf(j.fn) !== -1 && j.overdue >= -LC_DUE_TOLERANCE_MS; })
      .sort(function (a, b) { return (b.overdue - a.overdue) || (a.order - b.order); });

    for (const j of due) {
      if (Date.now() - started > LC_BUDGET_MS) {
        result.deferred.push(j.fn);
        lcNoteTiming_(timing, j.fn, null, started);
        continue;
      }
      const fn = globalThis[j.fn];
      if (typeof fn !== "function") { result.errors.push(j.fn + ": not in this project"); continue; }
      const t0 = Date.now();
      last[j.fn] = t0;
      try {
        fn();
        result.ran.push(j.fn);
        lcNoteResult_(errs, j.fn, true, started);
      } catch (e) {
        // A Google-side error in one job no longer stops the others.
        result.errors.push(j.fn + ": " + String(e && e.message || e).slice(0, 200));
        lcNoteResult_(errs, j.fn, false, started);
      }
      lcNoteTiming_(timing, j.fn, Date.now() - t0, started);
    }
    lcNoteTiming_(timing, LC_TIMING_CYCLE, Date.now() - started, started, result.deferred.length > 0);
    props.setProperty(LC_PROP_LAST, JSON.stringify(last));
    props.setProperty(LC_PROP_ERRORS, JSON.stringify(errs));
    props.setProperty(LC_PROP_TIMING, JSON.stringify(timing));
  } finally {
    props.deleteProperty(LC_PROP_BUSY);
  }
  if (result.errors.length) Logger.log("[LC] Errors: " + result.errors.join(" | "));
  if (result.deferred.length) Logger.log("[LC] Out of time; next cycle: " + result.deferred.join(", "));
  const stuck = lcFailingJobs_(props, started).filter(function (f) { return f.streak >= LC_ALERT_STREAK; });
  if (stuck.length) {
    throw new Error("Ledger cycle: " + stuck.map(function (f) {
      return f.fn + " has failed " + f.streak + " cycles in a row";
    }).join("; ") + ". The other jobs still ran. See the execution log for the errors.");
  }
  return result;
}

function lcErrorState_(props) {
  try {
    const v = JSON.parse(props.getProperty(LC_PROP_ERRORS) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (e) {
    return {};
  }
}

function lcNoteResult_(errs, fn, ok, now) {
  const day = Utilities.formatDate(new Date(now), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const e = errs[fn] || { streak: 0, since: 0, day: day, dayCount: 0 };
  if (e.day !== day) { e.day = day; e.dayCount = 0; }
  if (ok) {
    e.streak = 0;
    e.since = 0;
  } else {
    if (!e.streak) e.since = now;
    e.streak++;
    e.dayCount++;
  }
  errs[fn] = e;
}

/**
 * The cycle's jobs that are failing now or failed today: [{ fn, streak,
 * since, today }], worst first. For 34b and 34c; names and counts only.
 */
function lcFailingJobs_(props, now) {
  props = props || PropertiesService.getScriptProperties();
  const day = Utilities.formatDate(new Date(now || Date.now()), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const errs = lcErrorState_(props);
  return Object.keys(errs).map(function (fn) {
    const e = errs[fn] || {};
    return { fn: fn, streak: Number(e.streak) || 0, since: Number(e.since) || 0,
      today: e.day === day ? Number(e.dayCount) || 0 : 0 };
  }).filter(function (f) { return f.streak > 0 || f.today > 0; })
    .sort(function (a, b) { return (b.streak - a.streak) || (b.today - a.today); });
}

// ── Run time (2026-11-14) ────────────────────────────────────────────────

function lcTimingState_(props) {
  try {
    const v = JSON.parse(props.getProperty(LC_PROP_TIMING) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch (e) {
    return {};
  }
}

function lcDayKey_(now) {
  return Utilities.formatDate(new Date(now), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function lcTimingEntry_(timing, key, now) {
  const day = lcDayKey_(now);
  const t = timing[key] && typeof timing[key] === "object" ? timing[key] : {};
  if (t.day !== day) {
    t.day = day; t.runs = 0; t.total = 0; t.max = 0; t.deferred = 0;
    if (key === LC_TIMING_CYCLE) { t.deferredCycles = 0; t.busy = 0; }
  }
  timing[key] = t;
  return t;
}

// One run of a job (or of the whole cycle, key LC_TIMING_CYCLE) that took
// ms; ms null: the job was due but the budget pushed it to the next cycle.
function lcNoteTiming_(timing, key, ms, now, deferredAny) {
  const t = lcTimingEntry_(timing, key, now);
  if (ms === null || ms === undefined) { t.deferred = (Number(t.deferred) || 0) + 1; return; }
  ms = Math.max(0, Math.round(ms));
  t.last = ms;
  t.avg = Number(t.avg) > 0 ? Math.round(t.avg + LC_TIMING_WEIGHT * (ms - t.avg)) : ms;
  t.max = Math.max(Number(t.max) || 0, ms);
  t.runs = (Number(t.runs) || 0) + 1;
  t.total = (Number(t.total) || 0) + ms;
  if (deferredAny) t.deferredCycles = (Number(t.deferredCycles) || 0) + 1;
}

function lcNoteBusy_(timing, now) {
  const t = lcTimingEntry_(timing, LC_TIMING_CYCLE, now);
  t.busy = (Number(t.busy) || 0) + 1;
}

// {"fn": minutes} from LEDGER_CYCLE_EVERY, for jobs in LC_JOBS only, whole
// minutes 1 to 60; anything else is left out.
function lcEveryOverrides_(props) {
  let raw = {};
  try { raw = JSON.parse((props || PropertiesService.getScriptProperties()).getProperty(LC_PROP_EVERY) || "{}"); } catch (e) {
    Logger.log("[LC] " + LC_PROP_EVERY + " isn't JSON; the cadences in LC_JOBS are used.");
    return {};
  }
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  LC_JOBS.forEach(function (j) {
    const n = Number(raw[j.fn]);
    if (raw[j.fn] !== undefined && Math.floor(n) === n && n >= 1 && n <= 60) out[j.fn] = n;
  });
  return out;
}

/** A job's cadence in minutes: LEDGER_CYCLE_EVERY's, else LC_JOBS'. */
function lcJobEvery_(fn, props) {
  const over = lcEveryOverrides_(props)[fn];
  const job = LC_JOBS.filter(function (j) { return j.fn === fn; })[0];
  return over || (job ? job.every : 0);
}

function lcSeconds_(ms) {
  return (Math.round((Number(ms) || 0) / 100) / 10) + " s";
}

/**
 * The run-time picture, for showSetupStatus() (35) and
 * reportEvaluationHealth() (69): { jobs: { fn: line }, cycle: line,
 * schedule: line, timing }. Today's numbers only count today's runs.
 * Names and numbers only.
 */
function lcTimingReport_(props, now) {
  props = props || PropertiesService.getScriptProperties();
  const day = lcDayKey_(now || Date.now());
  const timing = lcTimingState_(props);
  const jobs = {};
  LC_JOBS.forEach(function (j) {
    const t = timing[j.fn];
    if (!t || !t.runs && !t.last) { jobs[j.fn] = "no run timed yet"; return; }
    const today = t.day === day;
    jobs[j.fn] = "last " + lcSeconds_(t.last) + ", usually " + lcSeconds_(t.avg) +
      (today ? "; today " + t.runs + " run(s), " + lcSeconds_(t.total) + " in all, slowest " + lcSeconds_(t.max) +
        (t.deferred ? ", put off " + t.deferred + " time(s) by the budget" : "") : "; no run today");
  });
  const c = timing[LC_TIMING_CYCLE];
  let cycle;
  if (!c || c.day !== day) {
    cycle = "Ledger cycle today: no run timed yet.";
  } else {
    const mins = (Number(c.total) || 0) / 60000;
    cycle = "Ledger cycle today: " + c.runs + " run(s), " + (Math.round(mins * 10) / 10) + " min of trigger time (" +
      Math.round(mins / LC_DAILY_TRIGGER_MINUTES * 1000) / 10 + "% of the " + (LC_DAILY_TRIGGER_MINUTES / 60) +
      " h a day Google allows a Workspace account), usually " + lcSeconds_(c.avg) + " a run, slowest " + lcSeconds_(c.max) +
      "; " + (Number(c.deferredCycles) || 0) + " cycle(s) ran out of time and put jobs off" +
      "; " + (Number(c.busy) || 0) + " minute(s) skipped because a cycle was still running.";
  }
  // The schedule's share of the wait: up to one cadence at each job on the
  // way to feedback, while none is put off.
  const everyOf = lcEveryOverrides_(props);
  const hops = LC_FEEDBACK_PATH.map(function (fn) {
    return everyOf[fn] || LC_JOBS.filter(function (j) { return j.fn === fn; })[0].every;
  });
  const schedule = "Schedule: up to " + hops.reduce(function (a, b) { return a + b; }, 0) +
    " min of waiting between jobs on the way to feedback (" + LC_FEEDBACK_PATH.map(function (fn, i) {
      return fn + " every " + hops[i];
    }).join(", ") + "), plus Studio's own time (FlowMeasures' Flow 2 wait).";
  return { jobs: jobs, cycle: cycle, schedule: schedule, timing: timing };
}

/** The jobs installLedgerCycle() found triggers for. */
function lcRecordedJobs_(props) {
  try {
    const v = JSON.parse(props.getProperty(LC_PROP_JOBS) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

/** What installLedgerCycle() would do. Changes nothing. */
function previewLedgerCycle() {
  return lcInstall_({ apply: false });
}

/**
 * Replaces the frequent jobs' own triggers with runLedgerCycle every minute.
 * Only jobs that have a trigger now are taken over. Run again after adding a
 * job's trigger by hand to fold it in.
 */
function installLedgerCycle() {
  return lcInstall_({ apply: true });
}

function lcInstall_(opts) {
  const apply = opts && opts.apply === true;
  const props = PropertiesService.getScriptProperties();
  const known = LC_JOBS.map(function (j) { return j.fn; });
  const triggers = ScriptApp.getProjectTriggers();
  const found = [];
  triggers.forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (known.indexOf(fn) !== -1 && found.indexOf(fn) === -1) found.push(fn);
  });
  const jobs = lcRecordedJobs_(props);
  found.concat(LC_ALWAYS).forEach(function (fn) {
    if (jobs.indexOf(fn) === -1) jobs.push(fn);
  });
  const hasCycle = triggers.some(function (t) { return t.getHandlerFunction() === LC_TRIGGER_FN; });
  const missing = known.filter(function (fn) { return jobs.indexOf(fn) === -1; });
  const result = { apply: apply, takenOver: found, jobs: jobs, notInstalled: missing, message: "" };
  if (apply) {
    triggers.forEach(function (t) {
      if (found.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
    });
    props.setProperty(LC_PROP_JOBS, JSON.stringify(jobs));
    if (!hasCycle && jobs.length) ScriptApp.newTrigger(LC_TRIGGER_FN).timeBased().everyMinutes(1).create();
  }
  result.message = (apply ? "Ledger cycle installed" : "DRY RUN: the Ledger cycle would") +
    (apply ? ": " : " take over ") + found.length + " trigger(s) (" + (found.join(", ") || "none") +
    "); it runs " + jobs.length + " job(s). Not installed before, so not run: " + (missing.join(", ") || "none") + ".";
  Logger.log("[LC] " + result.message);
  return result;
}

/** Rollback: one trigger per recorded job again, and no cycle. */
function restoreLedgerTriggers() {
  const props = PropertiesService.getScriptProperties();
  const jobs = lcRecordedJobs_(props);
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(function (t) {
    if (t.getHandlerFunction() === LC_TRIGGER_FN) ScriptApp.deleteTrigger(t);
  });
  const have = existing.map(function (t) { return t.getHandlerFunction(); });
  const restored = [];
  LC_JOBS.forEach(function (j) {
    if (jobs.indexOf(j.fn) === -1 || have.indexOf(j.fn) !== -1) return;
    const mins = lcEveryMinutes_(j.every);
    ScriptApp.newTrigger(j.fn).timeBased().everyMinutes(mins).create();
    restored.push(j.fn + " (" + mins + " min)");
  });
  props.deleteProperty(LC_PROP_JOBS);
  props.deleteProperty(LC_PROP_BUSY);
  Logger.log("[LC] Restored " + restored.length + " trigger(s): " + (restored.join(", ") || "none") +
    "; the cycle trigger is removed.");
  return { restored: restored };
}

// everyMinutes takes only 1, 5, 10, 15 or 30.
function lcEveryMinutes_(every) {
  return [1, 5, 10, 15, 30].filter(function (m) { return m <= every; }).pop() || 1;
}

const LC_INTAKE_JOBS = ["bridgeQueue", "runStagingTurnstile", "backPropagateCompletions"];

/**
 * The three intake jobs (03, 06): in the cycle, or each its own trigger
 * without one. Safe to run again. Before 2026-11-08 they had no installer
 * and were added by hand in the Triggers panel.
 */
function installIntakeTriggers() {
  return LC_INTAKE_JOBS.map(function (fn) { return lcInstallJob_(fn); });
}

/** registerDeliveredWarmUps (25): in the cycle, or its own trigger without one. */
function installRegistrationTrigger() {
  return lcInstallJob_("registerDeliveredWarmUps");
}

/** runAlignmentLogBackfill_ (22): in the cycle, or its own trigger without one. */
function installAlignmentBackfillTrigger() {
  return lcInstallJob_("runAlignmentLogBackfill_");
}

/** unlockReadyParts (68): in the cycle, or its own trigger without one.
 *  Here, not in 68, since 2026-11-07: 68 is also in the Teacher Dashboard
 *  project, which has no Ledger cycle (lcInstallJob_ isn't there). The
 *  Ledger is no web app, so like its siblings it needs no owner guard. */
function installPartUnlocks() {
  return lcInstallJob_("unlockReadyParts");
}

// Adds one LC_JOBS job to the cycle's recorded jobs when the cycle is
// installed (a trigger of its own would make the cycle leave it alone),
// otherwise gives it its own trigger at its cadence. Safe to run again.
function lcInstallJob_(fn) {
  const props = PropertiesService.getScriptProperties();
  const handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  const job = LC_JOBS.filter(function (j) { return j.fn === fn; })[0];
  let message;
  if (handlers.indexOf(LC_TRIGGER_FN) !== -1) {
    const jobs = lcRecordedJobs_(props);
    if (jobs.indexOf(fn) === -1) {
      jobs.push(fn);
      props.setProperty(LC_PROP_JOBS, JSON.stringify(jobs));
      message = fn + " added to the Ledger cycle (every " + lcJobEvery_(fn, props) + " min).";
    } else {
      message = fn + " already runs in the Ledger cycle.";
    }
    if (handlers.indexOf(fn) !== -1) {
      message += " It also has its own trigger, so the cycle leaves it to that; run installLedgerCycle() to fold it in.";
    }
  } else if (handlers.indexOf(fn) !== -1) {
    message = fn + " already has its own trigger.";
  } else {
    const mins = lcEveryMinutes_(job.every);
    ScriptApp.newTrigger(fn).timeBased().everyMinutes(mins).create();
    message = fn + " installed: its own trigger, every " + mins + " min (the Ledger cycle isn't installed).";
  }
  Logger.log("[LC] " + message);
  return { fn: fn, message: message };
}
