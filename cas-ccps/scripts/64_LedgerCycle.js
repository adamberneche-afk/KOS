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
//
// Checks before work (2026-11-15, approved by the operator that day): an
// idle cycle took about 14.5 s, so 1,440 a day came to about 5.8 h of the
// 6 h daily trigger quota every trigger here shares. Each job on the way to
// feedback now has a cheap check beside it (LC_GATES) and is skipped when
// it is sure there is nothing to do; a job that ran makes the cycle check
// the steps after it at once (LC_CHAINS); quiet hours hold the jobs without
// a check; every LEDGER_CYCLE_BACKSTOP minutes the cycle runs everything
// due without checks. showSetupStatus() projects the day's trigger time
// from it. installLedgerChangeProbe() logs whether Studio's writes fire an
// onChange trigger (it acts on nothing). See the section below.
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

// ── Gates, chains, quiet hours and the backstop (2026-11-15) ─────────────
// Measured on 11-15 (showSetupStatus(), just after the push): an idle
// cycle took about 14.5 s, nearly all of it the seven jobs on the way to
// feedback opening the spreadsheet and reading their tabs with nothing to
// do. 1,440 of them a day is about 5.8 h of Google's 6 h daily trigger
// run time, which every trigger in the project shares.
//
// THE GATES. Each of those jobs has a check beside it, in its own file
// (LC_GATES), that reads only what tells it whether there is work: one or
// two columns, through one open of the spreadsheet per cycle that every
// check shares (lcGateContext_ keeps what was read until a job runs). A
// check skips its job only when it is sure there is nothing to do; a check
// that can't read, or throws, runs the job as before. A job whose check
// isn't in this project runs.
//
// THE CHAINS (LC_CHAINS). When a job runs, the steps after it are checked
// again at once, with fresh reads, and run in the same execution if they
// now have work: a submission goes bridge → turnstile → FlowInput row in
// one cycle, and a result harvest → backprop → part unlock in one. Each job
// still takes its own document lock and re-reads its own data (37's
// existingKeys, #425's re-arm counts and #426's lanes are the job's own),
// so a chain only calls the jobs sooner; it builds nothing they wouldn't.
//
// QUIET HOURS (LEDGER_CYCLE_QUIET; default 10 p.m.–6 a.m. America/New_York,
// weekends, and the days off: the NoSchoolDays tab and SCHOOL_DAYS_OFF,
// 00's isSchoolDay_). The checks still run every minute, so a submission at
// night is still processed; the jobs without a check (the warm-up jobs, the
// registration, the alignment backfill, the watchdog) wait for the backstop.
//
// THE BACKSTOP (LEDGER_CYCLE_BACKSTOP, minutes, default 15): that often the
// cycle runs every due job without its check, so a signal a check missed
// can't strand work.
//
// LEDGER_CYCLE_GATES = off goes back to the cycle as it was before: every
// job on its cadence, no checks, no chains, no quiet hours.

// The check for each job, by name (each beside its job; see its file). The
// names are strings, like LC_JOBS', so a file's scope is only what it calls.
const LC_GATES = {
  "bridgeQueue":              "bridgeQueueHasWork_",       // 03
  "runStagingTurnstile":      "turnstileHasWork_",         // 06
  "buildFlowInputRows":       "flowInputBuildHasWork_",    // 37
  "harvestFlowInputResults":  "flowInputHarvestHasWork_",  // 37
  "backPropagateCompletions": "backPropagateHasWork_",     // 03
  "unlockReadyParts":         "partUnlocksHaveWork_",      // 68
  "runTurnInCheckFlow":       "turnInCheckHasWork_",       // 72
};
// Flow 6 is one job already (harvest, then retry and send), and what feeds
// it (a student's answer) is written by the Student Dashboard, so it has no
// chain.
const LC_CHAINS = [
  ["bridgeQueue", "runStagingTurnstile", "buildFlowInputRows"],
  ["harvestFlowInputResults", "backPropagateCompletions", "unlockReadyParts"],
];
const LC_PROP_GATES = "LEDGER_CYCLE_GATES";
const LC_PROP_BACKSTOP = "LEDGER_CYCLE_BACKSTOP";
const LC_BACKSTOP_DEFAULT = 15;
const LC_BACKSTOP_KEY = "_backstop"; // in LEDGER_CYCLE_LAST_RUN: when the cycle last ran without checks
const LC_PROP_QUIET = "LEDGER_CYCLE_QUIET";
const LC_QUIET_DEFAULT = { from: 22, to: 6, weekends: true, daysOff: true, tz: "America/New_York" };
// Today's answer to "a day off?", read once a day: { day, off }.
const LC_PROP_DAY = "LEDGER_CYCLE_DAY";
// What a check remembers between cycles (the part unlock's "nothing changed
// since a run that found nothing"): { fn: signature }. Counts and a hash only.
const LC_PROP_GATE_MEMO = "LEDGER_CYCLE_GATE_MEMO";
const LC_TIMING_GATES = "_gates"; // the checks, per cycle that ran any
const LC_TIMING_BASE = "_base";   // the cycle's own time: the run minus its checks and jobs

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
  const result = { ran: [], errors: [], deferred: [], idle: [], chained: [], held: [],
    backstop: false, quiet: "" };
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
    const gatesOn = lcGatesOn_(props);
    const backstop = !gatesOn ||
      started - Number(last[LC_BACKSTOP_KEY] || 0) >= lcBackstopMinutes_(props) * 60000 - LC_DUE_TOLERANCE_MS;
    const quiet = gatesOn ? lcQuietNow_(props, started) : "";
    result.backstop = gatesOn && backstop;
    result.quiet = quiet;
    if (gatesOn && backstop) last[LC_BACKSTOP_KEY] = started;
    const due = LC_JOBS
      .map(function (j, order) {
        const every = everyOf[j.fn] || j.every;
        return { fn: j.fn, every: every, order: order, overdue: started - Number(last[j.fn] || 0) - every * 60000 };
      })
      .filter(function (j) { return names.indexOf(j.fn) !== -1 && j.overdue >= -LC_DUE_TOLERANCE_MS; })
      .sort(function (a, b) { return (b.overdue - a.overdue) || (a.order - b.order); });

    const ctx = lcGateContext_(props);
    let gateMs = 0, jobMs = 0, checked = false;
    const handled = {};

    // One job: its check first (unless this is the backstop), then the job.
    // true when the job ran.
    const attempt = function (fn, chained) {
      if (Date.now() - started > LC_BUDGET_MS) {
        if (result.deferred.indexOf(fn) === -1) result.deferred.push(fn);
        lcNoteTiming_(timing, fn, null, started);
        return false;
      }
      const job = globalThis[fn];
      if (typeof job !== "function") { result.errors.push(fn + ": not in this project"); return false; }
      if (gatesOn && !backstop && lcGateFn_(fn)) {
        const g0 = Date.now();
        const work = lcGateSays_(fn, ctx);
        const gms = Date.now() - g0;
        gateMs += gms;
        checked = true;
        lcNoteGate_(timing, fn, gms, !work, started);
        if (!work) {
          last[fn] = g0;
          result.idle.push(fn);
          return false;
        }
      }
      const t0 = Date.now();
      last[fn] = t0;
      try {
        const ret = job();
        result.ran.push(fn);
        if (chained) result.chained.push(fn);
        lcNoteResult_(errs, fn, true, started);
        ctx.commit(fn, ret);
      } catch (e) {
        // A Google-side error in one job no longer stops the others.
        result.errors.push(fn + ": " + String(e && e.message || e).slice(0, 200));
        lcNoteResult_(errs, fn, false, started);
        ctx.commit(fn, e);
      }
      const ms = Date.now() - t0;
      jobMs += ms;
      lcNoteTiming_(timing, fn, ms, started);
      ctx.reset(); // the job may have written what the next check reads
      return true;
    };

    for (const j of due) {
      if (handled[j.fn]) continue;
      // Quiet hours: a job without a check waits for the backstop. It stays
      // due, so the backstop runs it.
      if (quiet && !backstop && !LC_GATES[j.fn]) { result.held.push(j.fn); continue; }
      handled[j.fn] = true;
      if (!attempt(j.fn, false) || !gatesOn || backstop) continue;
      // The steps after it, checked again now and run if they have work. A
      // step that already ran this cycle runs again only through its check.
      // (The backstop runs every due job anyway.)
      LC_CHAINS.forEach(function (chain) {
        const at = chain.indexOf(j.fn);
        if (at === -1) return;
        chain.slice(at + 1).forEach(function (next) {
          if (names.indexOf(next) === -1 || (handled[next] && !lcGateFn_(next))) return;
          handled[next] = true;
          attempt(next, true);
        });
      });
    }
    const total = Date.now() - started;
    if (checked) lcNoteTiming_(timing, LC_TIMING_GATES, gateMs, started);
    lcNoteTiming_(timing, LC_TIMING_BASE, total - gateMs - jobMs, started);
    lcNoteTiming_(timing, LC_TIMING_CYCLE, total, started, result.deferred.length > 0);
    props.setProperty(LC_PROP_LAST, JSON.stringify(last));
    props.setProperty(LC_PROP_ERRORS, JSON.stringify(errs));
    props.setProperty(LC_PROP_TIMING, JSON.stringify(timing));
    ctx.save();
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

// A job's check, or null when it has none in this project.
function lcGateFn_(fn) {
  const name = LC_GATES[fn];
  const gate = name ? globalThis[name] : null;
  return typeof gate === "function" ? gate : null;
}

// Whether a job has work, by its check (LC_GATES). Only an explicit false
// skips it: no check in this project, a check that throws, or any other
// answer runs the job.
function lcGateSays_(fn, ctx) {
  const gate = lcGateFn_(fn);
  if (!gate) return true;
  try {
    return gate(ctx) !== false;
  } catch (e) {
    Logger.log("[LC] " + fn + "'s check couldn't read (" + String(e && e.message || e).slice(0, 120) + "); it runs.");
    return true;
  }
}

/**
 * What the checks share in one cycle: the settings, one open of each
 * spreadsheet, and each read until a job runs (reset()). Every read is
 * rows 2 to the last row of the columns asked for; null when the tab isn't
 * there. remembered(fn) / offer(fn, value): a value a check keeps between
 * cycles, kept (save()) only when the job then ran and did nothing
 * (lcDidNothing_). Holds no values beyond this execution except those.
 */
function lcGateContext_(props) {
  let cfg = null;
  const books = {};
  let reads = {};
  let memo = null;
  const offered = {};
  let memoChanged = false;
  const memoState = function () {
    if (memo) return memo;
    try { memo = JSON.parse(props.getProperty(LC_PROP_GATE_MEMO) || "{}"); } catch (e) { memo = {}; }
    if (!memo || typeof memo !== "object" || Array.isArray(memo)) memo = {};
    return memo;
  };
  const ctx = {
    cfg: function () { return cfg || (cfg = getConfig_()); },
    book: function (which) {
      const id = which === "admin" ? ctx.cfg().adminSsId : ctx.cfg().ledgerSsId;
      if (!id) throw new Error("no spreadsheet ID for " + which);
      return books[id] || (books[id] = SpreadsheetApp.openById(id));
    },
    sheet: function (which, tab) {
      const key = "sheet|" + which + "|" + tab;
      if (!(key in reads)) reads[key] = ctx.book(which).getSheetByName(tab) || null;
      return reads[key];
    },
    lastRow: function (which, tab) {
      const key = "last|" + which + "|" + tab;
      if (!(key in reads)) {
        const sh = ctx.sheet(which, tab);
        reads[key] = sh ? sh.getLastRow() : -1;
      }
      return reads[key];
    },
    // width 0: every column there is.
    rows: function (which, tab, col, width) {
      const key = "rows|" + which + "|" + tab + "|" + col + "|" + width;
      if (key in reads) return reads[key];
      const sh = ctx.sheet(which, tab);
      let out = null;
      if (sh) {
        const last = ctx.lastRow(which, tab);
        const w = width || Math.max(1, sh.getLastColumn());
        out = last < 2 ? [] : sh.getRange(2, col, last - 1, w).getValues();
      }
      reads[key] = out;
      return out;
    },
    header: function (which, tab) {
      const key = "head|" + which + "|" + tab;
      if (key in reads) return reads[key];
      const sh = ctx.sheet(which, tab);
      let out = null;
      if (sh) {
        out = ctx.lastRow(which, tab) < 1 ? [] : sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
          .map(function (h) { return String(h).trim(); });
      }
      reads[key] = out;
      return out;
    },
    // A short hash of some rows (the order counts), for a signature.
    digest: function (rows) {
      let h = 5381;
      const text = (rows || []).map(function (r) { return Array.isArray(r) ? r.join("\u0001") : String(r); }).join("\u0002");
      for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
      return h.toString(36) + "." + text.length;
    },
    remembered: function (fn) { return memoState()[fn]; },
    offer: function (fn, value) { offered[fn] = String(value); },
    commit: function (fn, ret) {
      const m = memoState();
      if (offered[fn] !== undefined && lcDidNothing_(ret)) {
        if (m[fn] !== offered[fn]) { m[fn] = offered[fn]; memoChanged = true; }
      } else if (m[fn] !== undefined) {
        delete m[fn];
        memoChanged = true;
      }
      delete offered[fn];
    },
    reset: function () { reads = {}; },
    save: function () { if (memoChanged) props.setProperty(LC_PROP_GATE_MEMO, JSON.stringify(memo)); },
  };
  return ctx;
}

// A job's return that says it did nothing: an object whose numbers are all
// 0 (68's { unlocked: 0, failed: 0 }). Anything else, an error included,
// may have done something.
function lcDidNothing_(ret) {
  if (!ret || typeof ret !== "object" || ret instanceof Error) return false;
  const keys = Object.keys(ret);
  return keys.length > 0 && keys.every(function (k) { return ret[k] === 0; });
}

function lcGatesOn_(props) {
  return String(props.getProperty(LC_PROP_GATES) || "").trim().toLowerCase() !== "off";
}

// LEDGER_CYCLE_BACKSTOP: whole minutes 1 to 60, else 15.
function lcBackstopMinutes_(props) {
  const raw = String(props.getProperty(LC_PROP_BACKSTOP) || "").trim();
  const n = Number(raw);
  if (raw && Math.floor(n) === n && n >= 1 && n <= 60) return n;
  if (raw) Logger.log("[LC] " + LC_PROP_BACKSTOP + " isn't a whole number of minutes from 1 to 60; using " + LC_BACKSTOP_DEFAULT + ".");
  return LC_BACKSTOP_DEFAULT;
}

/**
 * LEDGER_CYCLE_QUIET: "off", or JSON {"from": 22, "to": 6, "weekends": true,
 * "daysOff": true, "tz": "America/New_York"} (hours 0-23; any part left out
 * keeps its default). { on, from, to, weekends, daysOff, tz }.
 */
function lcQuietSettings_(props) {
  const out = Object.assign({ on: true }, LC_QUIET_DEFAULT);
  const raw = String(props.getProperty(LC_PROP_QUIET) || "").trim();
  if (!raw) return out;
  if (raw.toLowerCase() === "off") { out.on = false; return out; }
  let o;
  try { o = JSON.parse(raw); } catch (e) {
    Logger.log("[LC] " + LC_PROP_QUIET + " isn't JSON or \"off\"; the default quiet hours are used.");
    return out;
  }
  if (!o || typeof o !== "object") return out;
  ["from", "to"].forEach(function (k) {
    const n = Number(o[k]);
    if (o[k] !== undefined && Math.floor(n) === n && n >= 0 && n <= 23) out[k] = n;
  });
  ["weekends", "daysOff"].forEach(function (k) { if (typeof o[k] === "boolean") out[k] = o[k]; });
  if (typeof o.tz === "string" && o.tz.trim()) out.tz = o.tz.trim();
  return out;
}

// Minutes of the quiet window in a school day.
function lcQuietMinutes_(q) {
  if (!q.on || q.from === q.to) return 0;
  return ((q.to - q.from + 24) % 24) * 60;
}

/**
 * Why now is quiet: "night", "weekend", "day off", or "" (school hours, or
 * quiet hours off). A time zone or calendar that can't be read is not
 * quiet: the cycle then does more, never less.
 */
function lcQuietNow_(props, now) {
  const q = lcQuietSettings_(props);
  if (!q.on) return "";
  let ymd, hour;
  try {
    const s = Utilities.formatDate(new Date(now), q.tz, "yyyy-MM-dd HH").split(" ");
    ymd = s[0];
    hour = Number(s[1]);
  } catch (e) {
    Logger.log("[LC] Quiet hours: time zone \"" + q.tz + "\" unreadable; not quiet.");
    return "";
  }
  const p = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  if (weekend && q.weekends) return "weekend";
  if (!weekend && q.daysOff && lcDayOff_(props, ymd)) return "day off";
  if (q.from !== q.to && (q.from > q.to ? hour >= q.from || hour < q.to : hour >= q.from && hour < q.to)) return "night";
  return "";
}

// Whether a weekday is a day off (00's isSchoolDay_: the NoSchoolDays tab and
// SCHOOL_DAYS_OFF), asked once a day and kept in LEDGER_CYCLE_DAY.
function lcDayOff_(props, ymd) {
  let kept = {};
  try { kept = JSON.parse(props.getProperty(LC_PROP_DAY) || "{}") || {}; } catch (e) { kept = {}; }
  if (kept.day === ymd && typeof kept.off === "boolean") return kept.off;
  let off = false;
  try { off = !isSchoolDay_(ymd); } catch (e) { off = false; }
  props.setProperty(LC_PROP_DAY, JSON.stringify({ day: ymd, off: off }));
  return off;
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
    if (LC_GATES[key]) { t.checks = 0; t.checkTotal = 0; t.idle = 0; }
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

// One check of a job (2026-11-15): how long it took, and whether it found
// nothing to do (the job skipped). Today's checks, their total, how many
// skipped, and a running average of a check: { checks, checkTotal, idle,
// checkAvg } beside the job's own run times.
function lcNoteGate_(timing, fn, ms, idle, now) {
  const t = lcTimingEntry_(timing, fn, now);
  ms = Math.max(0, Math.round(ms));
  t.checkAvg = Number(t.checkAvg) > 0 ? Math.round(t.checkAvg + LC_TIMING_WEIGHT * (ms - t.checkAvg)) : ms;
  t.checks = (Number(t.checks) || 0) + 1;
  t.checkTotal = (Number(t.checkTotal) || 0) + ms;
  if (idle) t.idle = (Number(t.idle) || 0) + 1;
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
    const today = !!t && t.day === day;
    // Its check (2026-11-15): today's checks, and how many found nothing.
    const checks = today && Number(t.checks) > 0
      ? "; checked " + t.checks + " time(s) today, nothing waiting " + (Number(t.idle) || 0) +
        " (usually " + lcSeconds_(t.checkAvg) + " a check)" : "";
    if (!t || !t.runs && !t.last) { jobs[j.fn] = "no run timed yet" + checks; return; }
    jobs[j.fn] = "last " + lcSeconds_(t.last) + ", usually " + lcSeconds_(t.avg) +
      (today ? "; today " + t.runs + " run(s), " + lcSeconds_(t.total) + " in all, slowest " + lcSeconds_(t.max) +
        (t.deferred ? ", put off " + t.deferred + " time(s) by the budget" : "") : "; no run today") + checks;
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
  const projection = lcProjection_(props, timing);
  return { jobs: jobs, cycle: cycle, schedule: schedule, gates: lcGatesLine_(props), projection: projection.line,
    level: projection.level, timing: timing };
}

// How the cycle decides this minute's work (2026-11-15), in one line.
function lcGatesLine_(props) {
  if (!lcGatesOn_(props)) {
    return "Checks: off (" + LC_PROP_GATES + " = off): every job runs on its cadence, as before 2026-11-15.";
  }
  const q = lcQuietSettings_(props);
  const hh = function (h) { return ("0" + h).slice(-2) + ":00"; };
  return "Checks: on. The jobs on the way to feedback run only when their check finds work, and the steps after a job " +
    "that ran are checked again at once (" + LC_CHAINS.map(function (c) { return c.join(" → "); }).join("; ") + "). " +
    "Every " + lcBackstopMinutes_(props) + " min the cycle runs every due job without checks (the backstop). " +
    (q.on ? "Quiet hours: " + (q.from !== q.to ? hh(q.from) + "–" + hh(q.to) + " " + q.tz : "no night window") +
      (q.weekends ? ", weekends" : "") + (q.daysOff ? ", days off" : "") +
      "; then the jobs without a check wait for the backstop." : "Quiet hours: off.");
}

/**
 * The cycle's daily trigger time at this rate (2026-11-15): each part's
 * usual time × how often today's schedule runs it, for a school day and a
 * day off. { line, level ("", "WARN", "ALERT"), schoolHours, offHours, pct }.
 * Parts: the cycle's own time every minute; the checks every minute but the
 * backstop's; each job with a check at the backstop; each job without one
 * at its cadence, or in quiet hours at the slower of its cadence and the
 * backstop. A submission's own runs come on top. Before the first timed
 * cycle with checks, the cycle's usual time × 1,440 stands in.
 */
function lcProjection_(props, timing) {
  props = props || PropertiesService.getScriptProperties();
  timing = timing || lcTimingState_(props);
  const avg = function (key) { return timing[key] ? Number(timing[key].avg) || 0 : 0; };
  const gatesOn = lcGatesOn_(props);
  const backstop = lcBackstopMinutes_(props);
  const q = lcQuietSettings_(props);
  const everyOf = lcEveryOverrides_(props);
  let jobs = lcRecordedJobs_(props);
  if (!jobs.length) jobs = LC_JOBS.map(function (j) { return j.fn; });
  const split = !!timing[LC_TIMING_BASE];
  const daySeconds = function (quietMin) {
    if (!split) return 1440 * avg(LC_TIMING_CYCLE) / 1000;
    let ms = 1440 * avg(LC_TIMING_BASE);
    if (gatesOn) ms += (1440 - Math.floor(1440 / backstop)) * avg(LC_TIMING_GATES);
    LC_JOBS.forEach(function (j) {
      if (jobs.indexOf(j.fn) === -1) return;
      const every = everyOf[j.fn] || j.every;
      let runs;
      if (!gatesOn) runs = 1440 / every;
      else if (LC_GATES[j.fn]) runs = 1440 / Math.max(every, backstop);
      else runs = (1440 - quietMin) / every + quietMin / Math.max(every, backstop);
      ms += runs * avg(j.fn);
    });
    return ms / 1000;
  };
  const quietSchool = gatesOn ? lcQuietMinutes_(q) : 0;
  const quietOff = gatesOn && q.on && (q.weekends || q.daysOff) ? 1440 : quietSchool;
  const school = daySeconds(quietSchool) / 3600;
  const off = daySeconds(quietOff) / 3600;
  const quota = LC_DAILY_TRIGGER_MINUTES / 60;
  const pct = Math.round(Math.max(school, off) / quota * 100);
  const level = pct > 80 ? "ALERT" : pct > 50 ? "WARN" : "";
  const h = function (x) { return Math.round(x * 10) / 10; };
  const line = (level ? level + ": " : "") + "At this rate: about " + h(school) + " h a day (" +
    Math.round(school / quota * 100) + "% of the " + quota + " h) on a school day, " + h(off) + " h (" +
    Math.round(off / quota * 100) + "%) on a day off" +
    (split ? ", from each job's usual time at this schedule; each submission's own runs come on top."
      : ", from the cycle's usual time × 1,440 (each part's time shows after a cycle with checks).") +
    (level === "ALERT" ? " Over 80% of the daily trigger time: if it runs out, every trigger here stops until tomorrow."
      : level === "WARN" ? " Over half the daily trigger time." : "");
  return { line: line, level: level, schoolHours: h(school), offHours: h(off), pct: pct };
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

// ── The onChange probe (2026-11-15) ──────────────────────────────────────
// Whether a change Studio makes to the Ledger fires an installable onChange
// trigger. Google's docs say a script's or an API request's writes never
// fire one (so the cycle's own writes can't start the next step); community
// testing says a Sheets API write made with a user's credentials does, and
// Studio's Sheets steps write as the operator. The probe only records what
// fires, so a later change can move the harvest onto onChange if Studio's
// writes do. It acts on nothing.
//
//   installLedgerChangeProbe()  one onChange trigger on the Central Ledger
//   removeLedgerChangeProbe()   removes it (the _ChangeProbe tab stays)
//   reportLedgerChangeProbe()   prints the log, newest last, with counts
//
// Each event is one row of the _ChangeProbe tab: when, the change type,
// whether the user who made it is the account the probe runs as (the one
// that installed it: yes / no / unknown when Google gives no user; never
// the address), and which watched tabs' last row moved since the last event
// (tab names and row counts). No cell values, no student data. A tab, not a
// Script Property: 200 lines are more than a property's 9 KB holds, and a
// script's own write to the sheet fires no onChange, so the log can't feed
// itself. The last LC_PROBE_KEEP rows are kept.
const LC_PROBE_FN = "onLedgerChangeProbe";
const LC_PROBE_TAB = "_ChangeProbe";
const LC_PROBE_HEADERS = ["At", "ChangeType", "ByProbeOwner", "TabsMoved"];
const LC_PROBE_KEEP = 200;
const LC_PROP_PROBE_ROWS = "LEDGER_CHANGE_PROBE_ROWS"; // { tab: last row } of the watched tabs
// The tabs Studio's flows and the Student Dashboard write.
const LC_PROBE_TABS = ["ReviewQueue", "STAGING_PIPELINE", "FlowInput", "WarmUpFlowReturn", "TurnInChecks",
  "TurnInCheckReturn"];

/** The onChange probe on the Central Ledger. Safe to run again. */
function installLedgerChangeProbe() {
  const have = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === LC_PROBE_FN; });
  let message;
  if (have.length) {
    message = "The onChange probe is already installed.";
  } else {
    const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
    ScriptApp.newTrigger("onLedgerChangeProbe").forSpreadsheet(ss).onChange().create(); // LC_PROBE_FN
    lcProbeMoved_(ss); // the baseline, so the first event shows only its own change
    message = "The onChange probe is installed. Make a change (submit a test assignment), then run reportLedgerChangeProbe().";
  }
  Logger.log("[LC] " + message);
  return { installed: true, message: message };
}

/** Removes the onChange probe. Its log tab stays for reportLedgerChangeProbe(). */
function removeLedgerChangeProbe() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === LC_PROBE_FN) { ScriptApp.deleteTrigger(t); removed++; }
  });
  PropertiesService.getScriptProperties().deleteProperty(LC_PROP_PROBE_ROWS);
  Logger.log("[LC] onChange probe: " + removed + " trigger(s) removed.");
  return { removed: removed };
}

/** The onChange trigger's handler: one row in _ChangeProbe. Never throws. */
function onLedgerChangeProbe(e) {
  try {
    const ss = (e && e.source) || SpreadsheetApp.openById(getConfig_().ledgerSsId);
    let by = "unknown";
    try {
      const who = e && e.user && typeof e.user.getEmail === "function" ? String(e.user.getEmail() || "").trim().toLowerCase() : "";
      const me = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
      if (who && me) by = who === me ? "yes" : "no";
    } catch (err) { by = "unknown"; }
    const lock = LockService.getScriptLock();
    const locked = lock.tryLock(10000);
    try {
      const moved = locked ? lcProbeMoved_(ss) : "(not compared: busy)";
      let sheet = ss.getSheetByName(LC_PROBE_TAB);
      if (!sheet) {
        sheet = ss.insertSheet(LC_PROBE_TAB);
        sheet.getRange(1, 1, 1, LC_PROBE_HEADERS.length).setValues([LC_PROBE_HEADERS]);
        sheet.setFrozenRows(1);
      }
      sheet.appendRow([new Date(), String((e && e.changeType) || "(no event)"), by, moved || "none"]);
      const extra = sheet.getLastRow() - 1 - LC_PROBE_KEEP;
      if (locked && extra > 0) sheet.deleteRows(2, extra);
    } finally {
      if (locked) lock.releaseLock();
    }
  } catch (err) {
    Logger.log("[LC] onChange probe: " + String(err && err.message || err).slice(0, 200));
  }
}

// The watched tabs whose last row changed since the last call, as
// "FlowInput +1, ReviewQueue +2", and the new rows kept. Names and counts only.
function lcProbeMoved_(ss) {
  const props = PropertiesService.getScriptProperties();
  let before = {};
  try { before = JSON.parse(props.getProperty(LC_PROP_PROBE_ROWS) || "{}") || {}; } catch (e) { before = {}; }
  const now = {};
  const moved = [];
  LC_PROBE_TABS.forEach(function (tab) {
    const sh = ss.getSheetByName(tab);
    now[tab] = sh ? sh.getLastRow() : -1;
    if (before[tab] !== undefined && before[tab] !== now[tab]) {
      const d = now[tab] - before[tab];
      moved.push(tab + " " + (d > 0 ? "+" : "") + d);
    }
  });
  props.setProperty(LC_PROP_PROBE_ROWS, JSON.stringify(now));
  return moved.join(", ");
}

/** Prints the probe's log (newest last) and its counts. Read-only. */
function reportLedgerChangeProbe() {
  const installed = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === LC_PROBE_FN; });
  const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
  const sheet = ss.getSheetByName(LC_PROBE_TAB);
  const rows = sheet && sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, LC_PROBE_HEADERS.length).getValues() : [];
  const tz = Session.getScriptTimeZone();
  const byType = {};
  const byOwner = {};
  const lines = ["onChange probe: " + (installed ? "installed" : "not installed (installLedgerChangeProbe())") +
    "; " + rows.length + " event(s) logged (the last " + LC_PROBE_KEEP + " are kept)."];
  rows.forEach(function (r) {
    const type = String(r[1]), by = String(r[2]);
    byType[type] = (byType[type] || 0) + 1;
    byOwner[by] = (byOwner[by] || 0) + 1;
  });
  lines.push("By change type: " + (Object.keys(byType).map(function (k) { return k + " " + byType[k]; }).join(", ") || "none"));
  lines.push("Made by the probe's own account: " + (Object.keys(byOwner).map(function (k) { return k + " " + byOwner[k]; }).join(", ") || "none"));
  rows.forEach(function (r) {
    const at = Object.prototype.toString.call(r[0]) === "[object Date]" ? Utilities.formatDate(r[0], tz, "yyyy-MM-dd HH:mm:ss") : String(r[0]);
    lines.push("  " + at + "  " + r[1] + "  by owner: " + r[2] + "  moved: " + r[3]);
  });
  lines.forEach(function (l) { Logger.log(l); });
  return { installed: installed, events: rows.length, lines: lines };
}
