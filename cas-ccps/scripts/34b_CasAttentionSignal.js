// =============================================================================
// FILE: 34b_CasAttentionSignal.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
// TRIGGERS: none of its own. runQueueWatchdog() (34) calls writeCasSignal_()
//           at the end of every run, so the doc is rewritten every 10 minutes.
//
// PURPOSE: the CAS attention signal (KOS session 2026-10-12, SMP-018). The
// KOS Claude Project may not read CAS sheets, so this doc is its only view of
// CAS: counts of what needs the teacher, students and families first, admin
// second, rewritten in place (same file ID every time, like KOS_FAMILY_SIGNAL
// in 60). The Project reads it after the family mail signal.
//
// DATA BOUNDARY: counts only. No names, emails, file IDs, config IDs, grades,
// ratings per student or student text ever reach the doc, and nothing in this
// file writes to any CAS sheet. A line appears only when its count is above
// zero; a count that couldn't be read says so ("unavailable"), because an
// unreadable signal must never look like an all-clear. Widening what the doc
// carries is the teacher's call (meta/HANDOFF_2026-10-12.md, FERPA).
//
// LAST NIGHT (first): 34c's overnight check of the 3 a.m. runs and the
//   warm-ups, with an all-clear line when nothing is wrong; 34c also emails
//   it once a day.
// SECTION 1, STUDENTS & FAMILIES
//   - submissions waiting on feedback (STAGING_PIPELINE PENDING_INFERENCE or
//     IN_PROCESS, one per student doc)
//   - submissions whose evaluation failed or timed out (ERROR*)
//   - SCR suggestions awaiting the teacher's confirm (SCRSuggestions
//     SUGGESTED)
//   - students newly eligible for a retry since yesterday (30b)
//   - students rated below satisfactory on the SCR (a current rating of 4
//     or 5; the state scale counts 1-3 as satisfactory, 1 the highest),
//     with the change since yesterday
// SECTION 2, ADMIN
//   - Ledger cycle jobs (64) failing now or that failed today, by function
//     name, with the run-in-a-row and today's counts
//   - watchdog in DRY RUN; the watchdog run itself failing
//   - rows the watchdog timed out this run; unknown-status rows (Studio
//     residue lands here)
//   - STAGING_PIPELINE rows in flight with no timestamp (they never age, so
//     nothing else ever times them out)
//   - Submit for Feedback failures on the system side in the last 24 hours
//     (Student Dashboard's DOC_UNREADABLE, NO_QUEUE and SERVER_ERROR, counted from the
//     SubmitFailures tab 13 writes), with the count per code
//   - the nightly lesson rollout (58): PROBLEM rows in RolloutLog in the last
//     day, and the courses it is still running in SHADOW for
//   - FERPA checks failing (10's _ferpaHealthChecks_)
// Apps Script trigger failures can't be seen from inside a script; those
// still arrive as Google's failure-summary mail.
//
// COST: the queue counts are one read of STAGING_PIPELINE per run. The SCR
// counts are one read of SCRSuggestions, at most hourly. The retry scan
// (checkRetryEligibility_ per candidate, three tab reads each) runs once a
// day, under CAS_SIGNAL_RETRY_BUDGET_MS; past the budget it keeps the last
// result and says so.
//
// SETUP: nothing is required. To write it now, run runQueueWatchdog from
// the Apps Script editor. The first run creates KOS_CAS_SIGNAL in My
// Drive (or in CAS_SIGNAL_FOLDER_ID's folder, if set) and stores its ID in
// CAS_SIGNAL_DOC_ID. Paste the doc's link into the KOS Project's
// instructions.
// =============================================================================

const CAS_SIGNAL_TITLE = "KOS_CAS_SIGNAL";
const CAS_SIGNAL_STATE_KEY = "CAS_SIGNAL_STATE";
const CAS_SIGNAL_SCR_EVERY_MS = 60 * 60 * 1000;
const CAS_SIGNAL_RETRY_BUDGET_MS = 90 * 1000;
const CAS_SIGNAL_SUBMIT_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;
// Hash prefix length (hex chars) for the retry-eligible pairs kept between
// days: enough to tell pairs apart, not enough to store anything readable.
const CAS_SIGNAL_HASH_CHARS = 12;

// watchdog: { dryRun, results, error } from runQueueWatchdog(); results is
// null when the watchdog run failed.
function writeCasSignal_(watchdog, now) {
  now = now ? new Date(now) : new Date();
  watchdog = watchdog || {};
  const props = PropertiesService.getScriptProperties();
  const state = _casSignalReadState_(props);
  const tz = Session.getScriptTimeZone();
  _casSignalRollDay_(state, Utilities.formatDate(now, tz, "yyyy-MM-dd"));

  const students = [];
  const admin = [];
  // The Ledger cycle's failing jobs (64), first: a job failing every minute
  // used to show nowhere (2026-10-22, UX audit fix-first 5).
  try {
    if (typeof lcFailingJobs_ === "function") {
      lcFailingJobs_(props, now.getTime()).forEach(function (f) {
        admin.push("Ledger job " + f.fn + ": " +
          (f.streak > 0 ? "failing, " + f.streak + " run" + (f.streak === 1 ? "" : "s") + " in a row" : "recovered") +
          ", " + f.today + " failure" + (f.today === 1 ? "" : "s") + " today (Executions in the Central Ledger's Apps Script project shows the errors)");
      });
    }
  } catch (e) {
    admin.push("Ledger job failures: unavailable (" + e.message + ")");
  }

  // ── Queue counts (every run) ──
  let queue = null;
  try {
    queue = _casSignalQueueCounts_();
  } catch (e) {
    console.error("[CasSignal] Queue counts failed: " + e.message);
  }
  if (!queue) {
    students.push("Submissions waiting on feedback: unavailable (STAGING_PIPELINE couldn't be read)");
  } else {
    if (queue.waiting > 0) students.push("Submissions waiting on feedback: " + queue.waiting);
    if (queue.failed > 0) students.push("Submissions whose evaluation failed or timed out: " + queue.failed);
    if (queue.noTimestamp > 0) admin.push("Queue rows in flight with no timestamp (they never time out): " + queue.noTimestamp);
  }

  // ── SCR counts (hourly) and retry scan (daily) ──
  const scr = _casSignalScr_(state, now);
  if (scr.error) {
    students.push("SCR counts: unavailable (" + scr.error + ")");
  } else {
    if (scr.awaiting > 0) {
      students.push("SCR suggestions awaiting your confirm: " + scr.awaiting +
        " (" + _casSignalPlural_(scr.awaitingStudents, "student") + ")");
    }
    if (scr.belowSat > 0) {
      const prev = state.prevBelowSat;
      const change = prev === null || prev === undefined ? "no count from yesterday yet"
        : (scr.belowSat - prev === 0 ? "no change since yesterday"
          : (scr.belowSat - prev > 0 ? "+" : "") + (scr.belowSat - prev) + " since yesterday");
      students.push("Students below satisfactory on the SCR (a 4 or 5): " + scr.belowSat + " (" + change + ")");
    }
  }
  if (state.retryError) {
    students.push("Students newly eligible for a retry: unavailable (" + state.retryError + ")");
  } else if (state.retryNew > 0) {
    students.push("Students newly eligible for a retry: " + state.retryNew +
      (state.prevRetry ? "" : " (first scan, so every eligible student counts as new)"));
  }

  // ── Admin ──
  if (watchdog.error || !watchdog.results) {
    admin.push("Queue watchdog: the last run failed" + (watchdog.error ? " (" + watchdog.error + ")" : ""));
  } else {
    if (watchdog.dryRun) admin.push("Queue watchdog: DRY RUN (it reports stuck rows but doesn't fix them)");
    const r = watchdog.results;
    const timedOut = r.rubricQueue.timedOut + r.stagingPipeline.timedOut + r.warmUpQueue.timedOut;
    const unknown = r.rubricQueue.unknown + r.stagingPipeline.unknown + r.warmUpQueue.unknown;
    const missing = [r.rubricQueue, r.stagingPipeline, r.warmUpQueue].filter(function (q) { return q.sheetMissing; }).length;
    if (timedOut > 0) admin.push("Queue rows " + (watchdog.dryRun ? "that would have timed out" : "timed out") + " this run: " + timedOut);
    if (unknown > 0) admin.push("Queue rows with an unknown status (check for Studio residue): " + unknown);
    if (missing > 0) admin.push("Queue tabs missing: " + missing);
  }
  try {
    const sf = _casSignalSubmitFailures_(now);
    if (sf.total > 0) {
      const parts = Object.keys(sf.byCode).sort().map(function (c) { return c + " " + sf.byCode[c]; });
      admin.push("Student submissions that failed on the system side in the last 24 hours: " + sf.total +
        " (" + parts.join(", ") + "). The Student Dashboard couldn't open a doc or find the ReviewQueue; " +
        "check its Executions log for the reason.");
    }
  } catch (e) {
    console.error("[CasSignal] Failed-submission count failed: " + e.message);
    admin.push("Failed-submission count: unavailable (the SubmitFailures tab couldn't be read)");
  }
  try {
    const ro = _casSignalRollout_(now);
    if (ro.problems > 0) {
      admin.push("Lesson rollout problems in the last day: " + ro.problems + " (see the RolloutLog tab)");
    }
    if (ro.shadow) {
      admin.push("Lesson rollout: SHADOW for " + ro.shadow + " (it logs what it would do; set " +
        "ROLLOUT_AUTO_APPLY to act)");
    }
  } catch (e) {
    console.error("[CasSignal] Rollout check failed: " + e.message);
    admin.push("Lesson rollout: unavailable (the RolloutLog tab couldn't be read)");
  }
  try {
    const failing = _ferpaHealthChecks_().filter(function (c) { return !c.ok; }).length;
    if (failing > 0) admin.push("FERPA checks failing: " + failing + " (run the System Health Check)");
  } catch (e) {
    admin.push("FERPA checks: unavailable (" + e.message + ")");
  }

  // ── Last night (34c): the 3 a.m. runs and warm-ups; emailed once a day ──
  let lastNight;
  try {
    lastNight = overnightHealth_(now, tz);
  } catch (e) {
    console.error("[CasSignal] Overnight check failed: " + e.message);
    lastNight = { problems: ["Overnight check: unavailable (" + e.message + ")"], allClear: "" };
  }
  try {
    overnightMaybeMail_(lastNight, now, tz);
  } catch (e) {
    console.error("[CasSignal] Overnight email failed: " + e.message);
  }

  _casSignalWriteState_(props, state);
  _casSignalWriteDoc_(props, _casSignalLines_(students, admin, now, tz, lastNight));
  return { students: students, admin: admin, lastNight: lastNight };
}

function _casSignalLines_(students, admin, now, tz, lastNight) {
  const lines = [
    CAS_SIGNAL_TITLE,
    "Generated at: " + Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm") + " (" + tz + ")",
    "Counts only: no names, IDs, grades or student text. Rewritten every 10 minutes by the CAS queue watchdog. " +
      "Open the Teacher Dashboard to act on any of it.",
    "",
  ];
  if (lastNight) {
    lines.push("LAST NIGHT (the 3 a.m. runs and warm-ups)");
    if (lastNight.problems.length) lastNight.problems.forEach(function (l) { lines.push("- " + l); });
    else lines.push(lastNight.allClear);
    lines.push("");
  }
  lines.push("1. STUDENTS & FAMILIES");
  if (students.length) students.forEach(function (l) { lines.push("- " + l); });
  else lines.push("Nothing waiting on you.");
  lines.push("");
  lines.push("2. ADMIN");
  if (admin.length) admin.forEach(function (l) { lines.push("- " + l); });
  else lines.push("Nothing needs attention.");
  return lines;
}

// One read of STAGING_PIPELINE. Counts student docs, not rows, for the two
// student lines (a doc resubmitted twice is one student waiting).
function _casSignalQueueCounts_() {
  const cfg = getConfig_();
  const sheet = SpreadsheetApp.openById(cfg.adminSsId).getSheetByName(cfg.tabs.stagingPipeline || "STAGING_PIPELINE");
  if (!sheet) throw new Error("STAGING_PIPELINE tab missing");
  const C = WD_STAGING_PIPELINE_COLUMNS;
  const data = sheet.getDataRange().getValues();
  const waiting = {}, failed = {};
  let noTimestamp = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[C.STATUS] || "").trim();
    const doc = String(row[C.STUDENT_FILE_ID] || "").trim() || "row" + i;
    if (status === "PENDING_INFERENCE" || status === "IN_PROCESS") {
      waiting[doc] = true;
      if (!_casSignalHasTime_(row[C.TIMESTAMP])) noTimestamp++;
    } else if (status.indexOf("ERROR") === 0) {
      failed[doc] = true;
    }
  }
  return { waiting: Object.keys(waiting).length, failed: Object.keys(failed).length, noTimestamp: noTimestamp };
}

// Rows the Student Dashboard (13's dashRecordFailure_) appended in the last
// 24 hours, counted by error code. The tab is created on the first failure,
// so a missing tab is a count of zero. A row with no readable timestamp is
// counted: an unreadable signal must never look like an all-clear.
function _casSignalSubmitFailures_(now) {
  const cfg = getConfig_();
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.submitFailures || "SubmitFailures");
  const out = { total: 0, byCode: {} };
  if (!sheet) return out;
  const since = now.getTime() - CAS_SIGNAL_SUBMIT_FAILURE_WINDOW_MS;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const when = new Date(data[i][0]).getTime();
    if (!isNaN(when) && when < since) continue;
    const raw = String(data[i][1] || "").trim();
    const code = /^[A-Z_]{1,32}$/.test(raw) ? raw : "UNKNOWN";
    out.byCode[code] = (out.byCode[code] || 0) + 1;
    out.total++;
  }
  return out;
}

// The nightly lesson rollout's (58) last day: PROBLEM rows, and the courses
// it ran in SHADOW. No rows (not installed yet) is a quiet zero.
function _casSignalRollout_(now) {
  const cfg = getConfig_();
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName("RolloutLog");
  const out = { problems: 0, shadow: "" };
  if (!sheet || sheet.getLastRow() < 2) return out;
  const since = now.getTime() - CAS_SIGNAL_SUBMIT_FAILURE_WINDOW_MS;
  const shadow = {};
  sheet.getDataRange().getValues().slice(1).forEach(function (r) {
    const when = new Date(r[0]).getTime();
    if (!isNaN(when) && when < since) return;
    if (r[4] === "PROBLEM") out.problems++;
    if (r[1] === "SHADOW" && /^\d{4}$/.test(String(r[2]))) shadow[String(r[2])] = true;
  });
  out.shadow = Object.keys(shadow).sort().join(", ");
  return out;
}

function _casSignalHasTime_(value) {
  if (value === "" || value === null || value === undefined) return false;
  return !isNaN(new Date(value).getTime());
}

// SCRSuggestions, at most hourly (the cached counts are reused in between),
// plus the daily retry scan. SCR scale: 1 (can teach others) is the highest,
// 1-3 are satisfactory, 4 is "with supervision", 5 "cannot perform".
function _casSignalScr_(state, now) {
  const nowMs = now.getTime();
  if (state.scr && state.scrAt && nowMs - state.scrAt < CAS_SIGNAL_SCR_EVERY_MS) {
    if (!state.scr.error) state.todayBelowSat = state.scr.belowSat;
    _casSignalMaybeRetryScan_(state, now, null);
    return state.scr;
  }
  let scr;
  let data = null;
  try {
    const cfg = getConfig_();
    const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
    if (!sheet) throw new Error("SCRSuggestions tab missing");
    data = sheet.getDataRange().getValues();
    scr = _casSignalScrCounts_(data);
  } catch (e) {
    console.error("[CasSignal] SCR counts failed: " + e.message);
    scr = { error: "SCRSuggestions couldn't be read" };
  }
  state.scr = scr;
  state.scrAt = nowMs;
  if (!scr.error) state.todayBelowSat = scr.belowSat;
  _casSignalMaybeRetryScan_(state, now, data);
  return scr;
}

function _casSignalScrCounts_(data) {
  let awaiting = 0;
  const awaitingStudents = {};
  const belowSat = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[SCRS.STUDENT_EMAIL] || "").trim().toLowerCase();
    if (!email) continue;
    const status = String(row[SCRS.STATUS] || "").trim();
    let rating = null;
    if (status === "SUGGESTED") {
      awaiting++;
      awaitingStudents[email] = true;
      if (row[SCRS.SUGGESTED_RATING] !== "") rating = Number(row[SCRS.SUGGESTED_RATING]);
    } else if (status === "CONFIRMED" || status === "OVERRIDDEN") {
      if (row[SCRS.CONFIRMED_RATING] !== "") rating = Number(row[SCRS.CONFIRMED_RATING]);
    }
    if (rating !== null && rating > 3) belowSat[email] = true;
  }
  return {
    awaiting: awaiting,
    awaitingStudents: Object.keys(awaitingStudents).length,
    belowSat: Object.keys(belowSat).length,
  };
}

// Once a day: which students are retry-eligible now that weren't at the end
// of yesterday. Between runs only short hash prefixes of the
// student|competency pairs are kept (in this project's Script Properties),
// never the emails themselves.
function _casSignalMaybeRetryScan_(state, now, suggestionData) {
  if (state.retryDay === state.day) return;
  const started = Date.now();
  try {
    let data = suggestionData;
    if (!data) {
      const cfg = getConfig_();
      const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
      if (!sheet) throw new Error("SCRSuggestions tab missing");
      data = sheet.getDataRange().getValues();
    }
    const hashes = [];
    const newStudents = {};
    const prev = state.prevRetry ? state.prevRetry.reduce(function (m, h) { m[h] = true; return m; }, {}) : null;
    const candidates = retryCandidates_(data);
    for (let i = 0; i < candidates.length; i++) {
      if (Date.now() - started > CAS_SIGNAL_RETRY_BUDGET_MS) throw new Error("scan ran past its time budget");
      const c = candidates[i];
      if (!checkRetryEligibility_(c.studentEmail, c.competencyId).eligible) continue;
      const h = _casSignalHash_(c.studentEmail.toLowerCase() + "|" + c.competencyId);
      hashes.push(h);
      if (!prev || !prev[h]) newStudents[c.studentEmail.toLowerCase()] = true;
    }
    state.todayRetry = hashes;
    state.retryNew = Object.keys(newStudents).length;
    state.retryError = null;
  } catch (e) {
    console.error("[CasSignal] Retry scan failed: " + e.message);
    state.retryError = e.message;
  }
  state.retryDay = state.day;
}

function _casSignalHash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, "0"); })
    .join("").slice(0, CAS_SIGNAL_HASH_CHARS);
}

// At the first run of a new day, the end-of-yesterday values become the
// baselines "since yesterday" compares against.
function _casSignalRollDay_(state, today) {
  if (state.day === today) return;
  if (state.day) {
    state.prevBelowSat = state.todayBelowSat === undefined ? null : state.todayBelowSat;
    state.prevRetry = state.todayRetry || null;
  }
  state.day = today;
  state.todayBelowSat = undefined;
  state.todayRetry = null;
  state.retryNew = 0;
}

function _casSignalReadState_(props) {
  try {
    return JSON.parse(props.getProperty(CAS_SIGNAL_STATE_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function _casSignalWriteState_(props, state) {
  props.setProperty(CAS_SIGNAL_STATE_KEY, JSON.stringify(state));
}

function _casSignalWriteDoc_(props, lines) {
  const doc = _casSignalDoc_(props);
  const body = doc.getBody();
  // A cleared body keeps one empty paragraph: the title goes into it.
  body.clear();
  body.setText(lines[0]);
  lines.slice(1).forEach(function (l) { body.appendParagraph(l); });
  doc.saveAndClose();
}

function _casSignalDoc_(props) {
  const id = props.getProperty("CAS_SIGNAL_DOC_ID");
  if (id) {
    try { return DocumentApp.openById(id); } catch (e) { /* recreated below */ }
  }
  const doc = DocumentApp.create(CAS_SIGNAL_TITLE);
  const folderId = props.getProperty("CAS_SIGNAL_FOLDER_ID");
  if (folderId) {
    try { DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(folderId)); } catch (e) { /* stays in My Drive */ }
  }
  props.setProperty("CAS_SIGNAL_DOC_ID", doc.getId());
  return doc;
}

function _casSignalPlural_(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}
