// =============================================================================
// FILE: 69b_FlowMeasures.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
// TRIGGERS: none of its own. 69's evaluationHealth_() calls flowMeasures_();
//           reportEvaluationHealth() logs it and the overnight email (34c)
//           adds one line.
//
// PURPOSE: November's goal 1 ("Measure", meta/PLAN_2026-11.md) for every
// CAS Studio flow, not only Flow 2, and the Studio runs per day D8 asks
// about (parts mean about 2.5 times the returns). 69 kept Flow 2's numbers
// per course; this keeps every flow's per week (Monday to Sunday, the same
// eight weeks), from each flow's own tabs and status columns:
//
//   Flow 1  rubric extraction  RubricQueue (Status; the watchdog's
//                              STUDIO_TIMEOUT)
//   Flow 2  evaluation         FlowInput (ReadyStatus), joined to
//                              EvaluationLog for the harvest time
//   Flow 3  warm-up            Flow3Input + WarmUpFlowReturn (41)
//   Flow 4  warm-up scoring    Flow4Input + WarmUpFlowReturn (41)
//   Flow 6  turn-in check      TurnInChecks, TurnInCodes (71),
//                              TurnInCheckInput + TurnInCheckReturn (72)
//   Flow 5 is retired (merged into Flow 3, 2026-11-01): its old input rows
//   count as Studio runs and nothing else.
//
// PER FLOW AND WEEK (a job is one FlowInput row, one warm-up per flow, one
// turn-in answer, or one RubricQueue row; its week is when it was first sent):
//   Sent           jobs sent to Studio at least once
//   Runs           input rows written: sends, retries included
//   Retries        Runs minus Sent (a send repeated after no return)
//   Returned       jobs Studio answered at least once
//   Applied        jobs whose answer was used
//   SetAside       jobs that were answered but whose answer was not used
//                  (garbled, suspect, a harvest that failed) and are done
//   NeverReturned  jobs with no answer past the flow's own timeout
//   Waiting        jobs still under way
//   FailureRate    (SetAside + NeverReturned) / Sent
//   Wait minutes   from sent to returned, median and slowest tenth
//   Flow 3 also: Fallback, warm-ups that went out as the teacher's own
//   question (41's ANCHOR_FALLBACK: junk output or no return; counted in
//   SetAside or NeverReturned too).
//   Flow 6 also: ADDRESSES, NOT_YET, CHECK_FAILED, codes issued by the check
//   and by the teacher's grant. ENGAGEMENT counts only, never learning
//   evidence (the turn-in plan's standing rule): the tab and the email say so.
//
// WHAT ISN'T RECORDED, SAID AS "—" (never a zero; FLOW_DOCTRINE rule 13):
//   - Flow 1: Studio writes the TeacherMatrix itself, so nothing marks a
//     result applied or set aside, and no return time is kept.
//   - Flow 2: Studio's return isn't stamped. The wait is from sent to the
//     harvest's EvaluationLog row (the harvest runs every 5 minutes), and
//     WaitFrom says so.
//   - Flows 3, 4, 6: harvested return rows (and Flow 6's closed input rows)
//     are deleted after 14 days (41, 72), so a week that began before then
//     shows what its input rows and records still hold, and "—" for the rest.
//   - Flow 6's screen: an answer the Apps Script screen turns down is
//     refused in the Student Dashboard's own project and never written
//     anywhere, so the runs it saves can't be counted yet.
//   Flows 1 and 2 have no retry path: Retries is blank, not zero.
//
// STUDIO RUNS PER DAY: every input row above is one Studio run (fixture and
// canary rows too: they spend the same quota). The last 14 days, the busiest
// day, against STUDIO_DAILY_RUN_LIMIT (a shared setting, 00; blank = not
// known). The email warns when a day reached 80% of it. CAS flows only:
// kos-personal's and leader-hub's flows are other projects.
//
// DATA BOUNDARY: counts, rates and minutes only; no names, emails, file
// IDs, ConfigIDs, queue or check IDs, or student text, in the log, the
// FlowMeasures tab or the email. IDs are read only to match rows.
// =============================================================================

const FM_TAB = "FlowMeasures";
const FM_HEADERS = ["WeekOf", "Flow", "Kind", "Sent", "Runs", "Retries", "Returned", "Applied", "SetAside",
  "NeverReturned", "Waiting", "FailureRate", "WaitMedianMin", "WaitSlowestTenthMin", "WaitFrom", "Fallback",
  "Screened", "Addresses", "NotYet", "CheckFailed", "CodesByCheck", "CodesByGrant", "Note", "UpdatedAt"];
// Not recorded anywhere, so not known (never written as 0).
const FM_UNKNOWN = "—";
const FM_FLOWS = [
  { n: 1, label: "Flow 1 rubric extraction" },
  { n: 2, label: "Flow 2 evaluation" },
  { n: 3, label: "Flow 3 warm-up" },
  { n: 4, label: "Flow 4 warm-up scoring" },
  { n: 6, label: "Flow 6 turn-in check" },
];
const FM_ENGAGEMENT = "engagement (not learning evidence)";
// The email names a flow whose week fails more than this (1 in 20, the
// same size as D8's bar, which stays its own constant in 69).
const FM_FAILURE_BAR = 0.05;
const FM_RUN_DAYS = 14;
const FM_RUN_LIMIT_KEY = "STUDIO_DAILY_RUN_LIMIT";
const FM_RUN_WARN_SHARE = 0.8;
// A fixture's or canary's ID (39, 35, 41, 72): a Studio run, not a job.
const FM_SYNTHETIC_RE = /(^|-)(FIXTURE|CANARY)(-|$)/i;

// { rows: [FlowMeasures rows, newest week first], cells, runs, line }.
function flowMeasures_(ss, cfg, now, firstWeek) {
  const cells = {};
  const cell = function (week, flow) {
    const k = week + "|" + flow;
    if (!cells[k]) {
      cells[k] = { week: week, flow: flow, sent: 0, runs: 0, returned: 0, applied: 0, setAside: 0, never: 0,
        waiting: 0, waits: [], fallback: 0, addresses: 0, notYet: 0, checkFailed: 0, byCheck: 0, byGrant: 0 };
    }
    return cells[k];
  };
  const inWindow = function (ms) { return !isNaN(ms) && ms >= firstWeek.getTime() && ms <= now.getTime(); };
  const runDays = {};
  const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (FM_RUN_DAYS - 1)).getTime();
  const countRun = function (value) {
    const ms = sheetTimestampMs_(value);
    if (isNaN(ms) || ms < firstDay || ms > now.getTime()) return;
    const d = _fmDayKey_(ms);
    runDays[d] = (runDays[d] || 0) + 1;
  };
  const ctx = { ss: ss, cfg: cfg, now: now, cell: cell, inWindow: inWindow, countRun: countRun };

  _fmFlow1_(ctx);
  _fmFlow2_(ctx);
  _fmWarmUpFlows_(ctx);
  _fmFlow6_(ctx);

  // Before these, 41 and 72 have deleted the harvested return rows.
  const keptFrom = { 3: now.getTime() - WFB_PRUNE_AFTER_DAYS * 86400000, 4: now.getTime() - WFB_PRUNE_AFTER_DAYS * 86400000,
    6: now.getTime() - TIC_PRUNE_AFTER_DAYS * 86400000 };
  const stamp = now;
  const rows = Object.keys(cells).map(function (k) { return _fmRow_(cells[k], keptFrom[cells[k].flow], stamp); })
    .sort(function (a, b) { return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : String(a[1]).localeCompare(String(b[1])); });
  const runs = _fmRuns_(runDays, now);
  const thisWeek = _ehWeekKey_(now.getTime());
  const line = _fmLine_(Object.keys(cells).map(function (k) { return cells[k]; })
    .filter(function (c) { return c.week === thisWeek; }), runs);
  return { rows: rows, cells: cells, runs: runs, line: line };
}

function _fmValues_(sheet, width) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
}

// Flow 1: one RubricQueue row per rubric upload (05), on the admin sheet.
function _fmFlow1_(ctx) {
  const C = WD_RUBRIC_QUEUE_COLUMNS;
  const timeoutMs = WD_STALE_MINS.RUBRIC_QUEUE * 60000;
  const admin = ctx.cfg.adminSsId && ctx.cfg.adminSsId !== ctx.cfg.ledgerSsId
    ? SpreadsheetApp.openById(ctx.cfg.adminSsId) : ctx.ss;
  const sheet = admin.getSheetByName((ctx.cfg.tabs && ctx.cfg.tabs.rubricQueue) || "RubricQueue");
  _fmValues_(sheet, C.STATUS + 1).forEach(function (r) {
    ctx.countRun(r[C.TIMESTAMP]);
    const at = sheetTimestampMs_(r[C.TIMESTAMP]);
    if (!ctx.inWindow(at)) return;
    const status = String(r[C.STATUS] || "").trim();
    const c = ctx.cell(_ehWeekKey_(at), 1);
    c.sent++;
    c.runs++;
    if (status === "COMPLETE") c.returned++;
    else if (status === WD_TIMEOUT_STATUS.RUBRIC_QUEUE) c.never++;
    else if (ctx.now.getTime() - at >= timeoutMs) c.never++;
    else c.waiting++;
  });
}

// Flow 2: one FlowInput row per submission (37). The wait runs to the
// harvest's EvaluationLog row for the same submission.
function _fmFlow2_(ctx) {
  const sheet = ctx.ss.getSheetByName((ctx.cfg.tabs && ctx.cfg.tabs.flowInput) || FI_TAB_NAME);
  const rows = _fmValues_(sheet, FI.READY_STATUS + 1);
  if (!rows.length) return;
  const logged = {};
  _fmValues_(ctx.ss.getSheetByName((ctx.cfg.tabs && ctx.cfg.tabs.evaluationLog) || "EvaluationLog"),
    EVAL_LOG_HEADERS.length).forEach(function (r) {
    const ms = sheetTimestampMs_(r[0]);
    if (isNaN(ms)) return;
    const key = String(r[2] || "").trim() + "|" + String(r[1] || "").trim();
    (logged[key] = logged[key] || []).push(ms);
  });
  Object.keys(logged).forEach(function (k) { logged[k].sort(function (a, b) { return a - b; }); });
  const timeoutMs = WD_STALE_MINS.STAGING_PIPELINE * 60000;
  rows.forEach(function (r) {
    const status = String(r[FI.READY_STATUS] || "").trim();
    if (!status) return; // built, not yet READY: not sent
    ctx.countRun(r[FI.TIMESTAMP]);
    const configId = String(r[FI.CONFIG_ID] || "").trim();
    if (FM_SYNTHETIC_RE.test(configId)) return;
    const at = sheetTimestampMs_(r[FI.TIMESTAMP]);
    if (!ctx.inWindow(at)) return;
    const c = ctx.cell(_ehWeekKey_(at), 2);
    c.sent++;
    c.runs++;
    if (status === "READY") {
      if (ctx.now.getTime() - at >= timeoutMs) c.never++;
      else c.waiting++;
      return;
    }
    c.returned++;
    if (status === "EVALUATED") { c.waiting++; return; }
    if (status === "HARVESTED") c.applied++;
    else c.setAside++;
    const times = logged[String(r[FI.STUDENT_FILE_ID] || "").trim() + "|" + configId] || [];
    for (let i = 0; i < times.length; i++) {
      if (times[i] >= at) { c.waits.push(Math.round((times[i] - at) / 60000)); break; }
    }
  });
}

// Flows 3 and 4: one job per warm-up per flow (41). A retry is a new input
// row for the same QueueID; the answer is a WarmUpFlowReturn row.
function _fmWarmUpFlows_(ctx) {
  const returns = {};
  _fmValues_(ctx.ss.getSheetByName(WFB_RETURN_TAB), WFB_RETURN_HEADERS.length).forEach(function (r) {
    const key = Number(r[WFB_RET.FLOW]) + "|" + String(r[WFB_RET.QUEUE_ID] || "").trim();
    (returns[key] = returns[key] || []).push(r);
  });
  [3, 4, 5].forEach(function (flow) {
    const rows = _fmValues_(ctx.ss.getSheetByName(WFB_INPUT_TABS[flow]), 3);
    const jobs = {};
    rows.forEach(function (r) {
      ctx.countRun(r[0]);
      const id = String(r[1] || "").trim();
      if (!id || FM_SYNTHETIC_RE.test(id)) return;
      const at = sheetTimestampMs_(r[0]);
      const job = jobs[id] || (jobs[id] = { first: NaN, last: NaN, rows: 0, consumed: false });
      job.rows++;
      if (!isNaN(at) && !(job.first <= at)) job.first = at;
      if (!isNaN(at) && !(job.last >= at)) job.last = at;
      if (String(r[2] || "").trim() === "CONSUMED") job.consumed = true;
    });
    if (flow === 5) return; // retired: runs only
    Object.keys(jobs).forEach(function (id) {
      const job = jobs[id];
      if (!ctx.inWindow(job.first)) return;
      const c = ctx.cell(_ehWeekKey_(job.first), flow);
      c.sent++;
      c.runs += job.rows;
      _fmWarmUpOutcome_(c, job, returns[flow + "|" + id] || [], ctx.now);
    });
  });
}

function _fmWarmUpOutcome_(c, job, rets, now) {
  const fallbackRe = new RegExp("^" + WFB_ANCHOR_FALLBACK);
  let noReturnFallback = false, firstReturn = NaN, harvested = false, outputFallback = false, failed = false;
  rets.forEach(function (r) {
    const raw = String(r[WFB_RET.RAW_OUTPUT] || "").trim();
    const hs = String(r[WFB_RET.HARVEST_STATUS] || "").trim();
    const fb = fallbackRe.test(String(r[WFB_RET.ERROR] || ""));
    if (!raw && fb) { noReturnFallback = true; return; } // 41 delivered the anchor; Studio never answered
    const at = sheetTimestampMs_(r[WFB_RET.TIMESTAMP]);
    if (!isNaN(at) && !(firstReturn <= at)) firstReturn = at;
    if (hs === "HARVESTED" && fb) outputFallback = true;
    else if (hs === "HARVESTED") harvested = true;
    else if (hs === "FAILED" || hs === "NEEDS_ATTENTION") failed = true;
  });
  if (noReturnFallback) { c.never++; c.fallback++; return; }
  if (!isNaN(firstReturn) || rets.length) {
    c.returned++;
    if (!isNaN(firstReturn) && firstReturn >= job.first) c.waits.push(Math.round((firstReturn - job.first) / 60000));
    if (harvested) c.applied++;
    else if (outputFallback) { c.setAside++; c.fallback++; }
    else if (failed) c.setAside++;
    else c.waiting++;
    return;
  }
  if (job.consumed) { c.returned++; c.applied++; return; } // its return row is gone
  const stale = isNaN(job.last) || now.getTime() - job.last >= WFB_INPUT_RETRY_AFTER_MS;
  if (job.rows - 1 >= WFB_MAX_INPUT_RETRIES && stale) c.never++;
  else c.waiting++;
}

// Flow 6: one job per turn-in answer sent (71's TurnInChecks, the record;
// 72's input and return rows for runs, garbled answers and the wait).
function _fmFlow6_(ctx) {
  const inputs = {};
  _fmValues_(ctx.ss.getSheetByName(TIC_INPUT_TAB), TIC_INPUT_HEADERS.length).forEach(function (r) {
    ctx.countRun(r[TCI.TIMESTAMP]);
    const id = String(r[TCI.CHECK_ID] || "").trim();
    const at = sheetTimestampMs_(r[TCI.TIMESTAMP]);
    const s = inputs[id] || (inputs[id] = { rows: 0, first: NaN });
    s.rows++;
    if (!isNaN(at) && !(s.first <= at)) s.first = at;
  });
  const returns = {};
  _fmValues_(ctx.ss.getSheetByName(TIC_RETURN_TAB), TIC_RETURN_HEADERS.length).forEach(function (r) {
    const id = String(r[TCR.CHECK_ID] || "").trim();
    const at = sheetTimestampMs_(r[TCR.RETURNED_AT]);
    const s = returns[id] || (returns[id] = { first: NaN, garbled: false });
    if (!isNaN(at) && !(s.first <= at)) s.first = at;
    if (String(r[TCR.HARVEST_STATUS] || "").trim() === TIC_SET_ASIDE) s.garbled = true;
  });
  const checks = _fmValues_(ctx.ss.getSheetByName(TURN_IN_CHECKS_TAB), TURN_IN_CHECK_HEADERS.length);
  const latest = {};
  checks.forEach(function (r) { latest[_ticOwnerKey_(r)] = String(r[TCHK.CHECK_ID] || "").trim(); });
  checks.forEach(function (r) {
    const id = String(r[TCHK.CHECK_ID] || "").trim();
    if (!id || FM_SYNTHETIC_RE.test(id)) return;
    const status = String(r[TCHK.STATUS] || "").trim();
    const sent = inputs[id];
    if (status === TURN_IN_PENDING && !sent) return; // in line, not sent yet
    const at = sheetTimestampMs_(r[TCHK.SUBMITTED_AT]);
    if (!ctx.inWindow(at)) return;
    const c = ctx.cell(_ehWeekKey_(at), 6);
    const ret = returns[id];
    c.sent++;
    c.runs += sent ? sent.rows : 0;
    if (ret || status === TURN_IN_ADDRESSES || status === TURN_IN_NOT_YET) c.returned++;
    if (sent && ret && !isNaN(sent.first) && ret.first >= sent.first) {
      c.waits.push(Math.round((ret.first - sent.first) / 60000));
    }
    if (status === TURN_IN_ADDRESSES) { c.applied++; c.addresses++; }
    else if (status === TURN_IN_NOT_YET) { c.applied++; c.notYet++; }
    else if (status === TURN_IN_CHECK_FAILED) {
      c.checkFailed++;
      if (ret && ret.garbled) c.setAside++;
      else c.never++;
    } else if (status === TURN_IN_PENDING && latest[_ticOwnerKey_(r)] === id) c.waiting++;
  });
  _fmValues_(ctx.ss.getSheetByName(TURN_IN_CODES_TAB), TURN_IN_CODE_HEADERS.length).forEach(function (r) {
    const at = sheetTimestampMs_(r[TCODE.ISSUED_AT]);
    if (!ctx.inWindow(at)) return;
    const how = String(r[TCODE.HOW] || "").trim();
    if (how === "GRANT") ctx.cell(_ehWeekKey_(at), 6).byGrant++;
    else if (how === "CHECK") ctx.cell(_ehWeekKey_(at), 6).byCheck++;
  });
}

// One FlowMeasures row. keptFrom (flows 3, 4, 6): a week that began before
// this has lost its harvested return rows, so what came back is not known.
function _fmRow_(c, keptFrom, stamp) {
  const U = FM_UNKNOWN;
  const label = FM_FLOWS.filter(function (f) { return f.n === c.flow; })[0].label;
  const ymd = c.week.split("-").map(Number);
  const old = keptFrom !== undefined && new Date(ymd[0], ymd[1] - 1, ymd[2]).getTime() < keptFrom;
  const pct = function (x) { return _ehPercentile_(c.waits, x); };
  const rate = c.sent ? _ehRound_((c.setAside + c.never) / c.sent, 3) : "";
  const notes = [];
  let r;
  if (c.flow === 1) {
    notes.push("Studio writes the TeacherMatrix itself: nothing marks a result applied or set aside, and no return time is kept; no retry path");
    r = { runs: c.runs, retries: "", returned: c.returned, applied: U, setAside: U, never: c.never, waiting: c.waiting,
      rate: c.sent ? _ehRound_(c.never / c.sent, 3) : "", med: U, slow: U, from: U };
    notes.push("failure rate is never-returned only");
  } else if (c.flow === 2) {
    notes.push("Studio's return isn't stamped: the wait runs to the harvest (every 5 min); no retry path");
    r = { runs: c.runs, retries: "", returned: c.returned, applied: c.applied, setAside: c.setAside, never: c.never,
      waiting: c.waiting, rate: rate, med: pct(0.5), slow: pct(0.9), from: "sent to harvested" };
  } else if (old) {
    notes.push("returns are kept 14 days: this week shows its sends only");
    r = { runs: c.flow === 6 ? U : c.runs, retries: c.flow === 6 ? U : c.runs - c.sent, returned: U,
      applied: c.flow === 6 ? c.applied : U, setAside: U, never: U, waiting: c.flow === 6 ? c.waiting : U,
      rate: c.flow === 6 && c.sent ? _ehRound_(c.checkFailed / c.sent, 3) : U, med: U, slow: U, from: U };
  } else {
    r = { runs: c.runs, retries: c.runs - c.sent, returned: c.returned, applied: c.applied, setAside: c.setAside,
      never: c.never, waiting: c.waiting, rate: rate, med: pct(0.5), slow: pct(0.9), from: "sent to returned" };
  }
  const six = c.flow === 6;
  if (six) notes.push("screened answers aren't recorded");
  return [c.week, label, six ? FM_ENGAGEMENT : "reliability", c.sent, r.runs, r.retries, r.returned, r.applied,
    r.setAside, r.never, r.waiting, r.rate, r.med, r.slow, r.from,
    c.flow === 3 ? (old ? U : c.fallback) : "",
    six ? U : "", six ? c.addresses : "", six ? c.notYet : "", six ? c.checkFailed : "",
    six ? c.byCheck : "", six ? c.byGrant : "", notes.join("; "), stamp];
}

// The last FM_RUN_DAYS days' runs: { days: [{ day, runs }] oldest first,
// busiest, limit (a number, or null), limitNote, warn: [days at 80%+] }.
function _fmRuns_(runDays, now) {
  const days = [];
  for (let i = FM_RUN_DAYS - 1; i >= 0; i--) {
    const d = _fmDayKey_(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12).getTime());
    days.push({ day: d, runs: runDays[d] || 0 });
  }
  const busiest = days.reduce(function (a, b) { return b.runs > a.runs ? b : a; }, days[0]);
  const lim = studioDailyRunLimit_();
  const warn = lim.limit ? days.filter(function (d) { return d.runs >= FM_RUN_WARN_SHARE * lim.limit; }) : [];
  return { days: days, busiest: busiest, limit: lim.limit, limitNote: lim.note, warn: warn };
}

// STUDIO_DAILY_RUN_LIMIT, a shared setting (Script Property or the Ledger's
// _CONFIG): { limit: a positive number or null, note }. Never guessed.
function studioDailyRunLimit_() {
  let raw = "";
  try { raw = String(_resolveConfigValues_().values[FM_RUN_LIMIT_KEY] || "").trim(); } catch (e) { raw = ""; }
  if (!raw) return { limit: null, note: "limit not set — set " + FM_RUN_LIMIT_KEY + " from Workspace Studio's quota" };
  const n = Number(raw.replace(/,/g, ""));
  if (!(n > 0) || Math.floor(n) !== n) {
    return { limit: null, note: FM_RUN_LIMIT_KEY + " is not a whole number — set it from Workspace Studio's quota" };
  }
  return { limit: n, note: "" };
}

// The email's second line: flows other than 2 (69's line has Flow 2) over
// the bar or with jobs never returned this week, Flow 6's engagement counts,
// and Studio's runs.
function _fmLine_(cellsThisWeek, runs) {
  const parts = [];
  FM_FLOWS.forEach(function (f) {
    if (f.n === 2) return;
    const c = cellsThisWeek.filter(function (x) { return x.flow === f.n; })[0];
    if (!c || !c.sent) return;
    const failed = f.n === 1 ? c.never : c.setAside + c.never;
    if (failed / c.sent > FM_FAILURE_BAR || c.never > 0) {
      parts.push("Flow " + f.n + " " + c.never + " of " + c.sent + " never returned" +
        (f.n === 1 ? "" : ", " + c.setAside + " set aside") + " (" + _ehRound_(failed / c.sent * 100, 1) + "%)" +
        (f.n === 3 && c.fallback ? ", " + c.fallback + " sent as the teacher's own question" : ""));
    }
  });
  const flows = parts.length ? parts.join("; ") : "no other flow over 1 in 20 failed or left a job unreturned";
  const six = cellsThisWeek.filter(function (x) { return x.flow === 6; })[0];
  const engagement = six && six.sent ? "; Flow 6 engagement (not learning evidence): " + six.sent + " answers checked, " +
    six.addresses + " addresses, " + six.notYet + " not yet, " + six.checkFailed + " check failed" : "";
  return "Other flows this week: " + flows + engagement + ". " + _fmRunsSentence_(runs);
}

function _fmRunsSentence_(runs) {
  const b = runs.busiest;
  let s = "Studio runs (CAS flows), last " + FM_RUN_DAYS + " days: " +
    (b.runs ? "busiest " + b.day + " with " + b.runs : "none");
  if (!runs.limit) return s + "; " + runs.limitNote + ".";
  if (!b.runs) return s + " (daily limit " + runs.limit + ").";
  s += " of a " + runs.limit + " daily limit (" + _ehRound_(b.runs / runs.limit * 100, 0) + "%)";
  if (runs.warn.length) {
    const lastWarn = runs.warn[runs.warn.length - 1];
    s = "WARNING: " + runs.warn.length + " day" + (runs.warn.length === 1 ? "" : "s") + " at " +
      (FM_RUN_WARN_SHARE * 100) + "% or more of Studio's daily limit, latest " + lastWarn.day + " (" + lastWarn.runs +
      " of " + runs.limit + "). " + s;
  }
  return s + ".";
}

function _fmWriteTab_(ss, rows) {
  let sheet = ss.getSheetByName(FM_TAB);
  if (!sheet) sheet = ss.insertSheet(FM_TAB);
  sheet.clear();
  sheet.getRange(1, 1, 1, FM_HEADERS.length).setValues([FM_HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, FM_HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);
}

// Local "yyyy-MM-dd" of a moment, like 69's week keys.
function _fmDayKey_(ms) {
  const d = new Date(ms);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
