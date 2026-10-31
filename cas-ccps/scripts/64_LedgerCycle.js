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

// The Ledger's frequent jobs and their cadence in minutes, in pipeline order
// (used to break ties). Cadences are the ones each installer set; 03's
// backPropagateCompletions was specced at 2.
const LC_ALWAYS = ["registerDeliveredWarmUps"];

const LC_JOBS = [
  { fn: "bridgeQueue",               every: 1  }, // 03
  { fn: "runStagingTurnstile",       every: 1  }, // 06
  { fn: "buildFlowInputRows",        every: 1  }, // 37
  { fn: "harvestFlowInputResults",   every: 5  }, // 37
  { fn: "backPropagateCompletions",  every: 2  }, // 03
  { fn: "buildWarmUpFlowInputs",     every: 5  }, // 41
  { fn: "harvestWarmUpFlowReturns",  every: 5  }, // 41
  { fn: "registerDeliveredWarmUps",  every: 5  }, // 25
  { fn: "runAlignmentLogBackfill_",  every: 5  }, // 22
  { fn: "runQueueWatchdog",          every: 10 }, // 34
  { fn: "unlockReadyParts",          every: 5  }, // 68
];

/** The cycle. Time trigger, every minute. */
function runLedgerCycle() {
  const props = PropertiesService.getScriptProperties();
  const started = Date.now();
  if (!claimRunSlot_(LC_PROP_BUSY, LC_BUSY_MS)) {
    Logger.log("[LC] A cycle is still running; skipping this minute.");
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
    const due = LC_JOBS
      .map(function (j, order) { return { fn: j.fn, every: j.every, order: order,
        overdue: started - Number(last[j.fn] || 0) - j.every * 60000 }; })
      .filter(function (j) { return names.indexOf(j.fn) !== -1 && j.overdue >= -LC_DUE_TOLERANCE_MS; })
      .sort(function (a, b) { return (b.overdue - a.overdue) || (a.order - b.order); });

    for (const j of due) {
      if (Date.now() - started > LC_BUDGET_MS) { result.deferred.push(j.fn); continue; }
      const fn = globalThis[j.fn];
      if (typeof fn !== "function") { result.errors.push(j.fn + ": not in this project"); continue; }
      last[j.fn] = Date.now();
      try {
        fn();
        result.ran.push(j.fn);
        lcNoteResult_(errs, j.fn, true, started);
      } catch (e) {
        // A Google-side error in one job no longer stops the others.
        result.errors.push(j.fn + ": " + String(e && e.message || e).slice(0, 200));
        lcNoteResult_(errs, j.fn, false, started);
      }
    }
    props.setProperty(LC_PROP_LAST, JSON.stringify(last));
    props.setProperty(LC_PROP_ERRORS, JSON.stringify(errs));
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

/** registerDeliveredWarmUps (25): in the cycle, or its own trigger without one. */
function installRegistrationTrigger() {
  return lcInstallJob_("registerDeliveredWarmUps");
}

/** runAlignmentLogBackfill_ (22): in the cycle, or its own trigger without one. */
function installAlignmentBackfillTrigger() {
  return lcInstallJob_("runAlignmentLogBackfill_");
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
      message = fn + " added to the Ledger cycle (every " + job.every + " min).";
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
