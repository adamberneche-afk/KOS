// =============================================================================
// FILE: 34c_OvernightHealth.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
// TRIGGERS: none of its own. writeCasSignal_() (34b) calls overnightHealth_()
//           on every watchdog run (every 10 minutes) for the signal doc's
//           LAST NIGHT section, then overnightMaybeMail_(), which emails the
//           same lines once a day, on the first run at or after 5 a.m.
//
// PURPOSE: the morning check on the night's runs (2026-10-18). The commute
// briefing reads LAST NIGHT first; the email reaches the admin the same
// morning, with the deployment it came from, so a problem is found within
// hours of the run instead of at the next class.
//
// WHAT IT CHECKS
//   - Ledger cycle jobs (64) still failing, by function name and count
//   - each 3 a.m. stage stamped a run in the last 26 hours: 3:00 profiles
//     (23), 3:05 artifact sync (33), 3:15 warm-up scoring (25), 3:30 queue
//     build (24). A quiet night (nothing to build or score) still stamps.
//   - today's warm-ups: delivered of total, plus not yet delivered and ERROR
//   - tomorrow's warm-ups (built at 3:30): delivered so far, ERROR
//   - warm-ups from earlier days still waiting on scoring (PENDING_EVAL)
//   - Studio jobs with no return: Flow 3/4/5 inputs older than 30 minutes
//     with nothing in WarmUpFlowReturn, Flow 2 FlowInput rows still READY
//     after 15 minutes (bug 4, resolved 2026-10-23: Flow 2 starts itself)
//   - warm-up returns that FAILED or need attention in the last 24 hours
//   - warm-ups delivered as the teacher's anchor (41: junk output, or no return)
//   - students held at a part a school day or more by a failed check (68)
//   - turn-in answers whose check failed (CHECK_FAILED) and wait for the
//     teacher, and answers waiting on the check over an hour (72, Flow 6;
//     only while TURN_IN_CODE_COURSES is on; reported with Module 2 off too)
//   - Flow 2 answers written into more than one row of a doc in the last
//     7 days (37's duplicate-write check, 2026-11-15; also with Module 2 off)
//   - the lesson rollout (58): problems that remain after the day's runs,
//     whether the day finished (docs left if not), and a stale Canvas export
//     once; all from 58's rolloutDayStatus_ (plan L3, 2026-11-08). The
//     all-clear line says "finished (n runs)"
//   - in the email only, once a day: Flow 2's week so far (69's
//     evaluationHealth_), which also rewrites the Measures tab, and a second
//     line: the other flows' week and Studio's runs per day (69b, which
//     rewrites the FlowMeasures tab)
//   - the checks the 6 a.m. health alert made, folded in here 2026-11-20 so
//     one run reports everything (10's autoHealthAlert is retired): submissions
//     stuck evaluating or queued and never started, STAGING_PIPELINE rows
//     with an unknown status (10's _stagingPipelineHealthChecks_, its
//     thresholds), rubric extractions stuck two hours or more (Flow 1), and
//     each failing FERPA check by name (10's _ferpaHealthChecks_). Counts
//     only; with Module 2 off too
//   - retention archiving (SCRDecisionLog, Ledger, CompetencyEvidence,
//     ParentReportLog, WarmUpQueue), which the 6 a.m. alert also ran: once a
//     day at or after 5 a.m. (overnightArchiveDaily_, called by 34b before
//     this), a failure as a problem and the all-clear saying it ran
//   - at most every 6 hours, the setup checks once run by hand: the Ledger's
//     column order (38), FlowPrompts against the code (40), the last 24
//     hours' Studio returns in the right columns (41), and each retention
//     record's date column (57)
// With no problem and nothing unreadable, one all-clear line says what ran.
//
// DATA BOUNDARY: counts only, as 34b: no names, emails, queue IDs, file IDs
// or student text. A check that can't read its tab says "unavailable",
// never all clear. The email adds the deployment (project, version marker,
// teacher account, time zone) so several deployments can be told apart.
// =============================================================================

const ON_STAGES = [
  { key: "M2_STAGE1_LAST_RUN",  label: "3:00 student profiles (23)" },
  { key: "M2_STAGE1B_LAST_RUN", label: "3:05 artifact sync (33)" },
  { key: "M2_STAGE2_LAST_RUN",  label: "3:15 warm-up scoring (25)" },
  { key: "M2_STAGE3_LAST_RUN",  label: "3:30 warm-up queue build (24)" },
];
const ON_STAGE_MAX_AGE_MS = 26 * 60 * 60 * 1000;
const ON_STUDIO_STALL_MS = { 2: 15 * 60 * 1000, 3: 30 * 60 * 1000, 4: 30 * 60 * 1000 };
const ON_RETURN_WINDOW_MS = 24 * 60 * 60 * 1000;
const ON_MAIL_HOUR = 5;
const ON_MAIL_STATE_KEY = "CAS_OVERNIGHT_MAILED";
const ON_SETUP_CHECK_MS = 6 * 60 * 60 * 1000;
const ON_SETUP_STATE_KEY = "CAS_OVERNIGHT_SETUP_CHECKS";
const ON_DELIVERED = ["DELIVERED", "PENDING_EVAL", "SCORED", "INCOMPLETE", "EVAL_ERROR"];
const ON_RUBRIC_STUCK_MS = 2 * 60 * 60 * 1000;
const ON_ARCHIVE_STATE_KEY = "CAS_OVERNIGHT_ARCHIVED";

// Retention archiving, once a day at or after ON_MAIL_HOUR (2026-11-20, from
// the retired 6 a.m. alert): each job in turn, one failing not stopping the
// rest. The day's result is kept in CAS_OVERNIGHT_ARCHIVED for
// overnightHealth_ to report. Returns that state, or null before the hour.
function overnightArchiveDaily_(now, tz) {
  now = now ? new Date(now) : new Date();
  tz = tz || Session.getScriptTimeZone();
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  let state = null;
  try { state = JSON.parse(props.getProperty(ON_ARCHIVE_STATE_KEY) || "null"); } catch (e) { state = null; }
  if (state && state.day === today) return state;
  if (Number(Utilities.formatDate(now, tz, "HH")) < ON_MAIL_HOUR) return null;
  const jobs = [
    ["SCRDecisionLog", _archiveExpiredScrDecisions_],
    ["Ledger", _archiveExpiredLedgerRows_],
    ["CompetencyEvidence", _archiveExpiredCompetencyEvidence_],
    ["ParentReportLog", _archiveExpiredParentReports_],
    ["WarmUpQueue", _archiveExpiredWarmUpQueueRows_],
  ];
  const failed = [];
  jobs.forEach(function (j) {
    try { j[1](); } catch (e) {
      console.error("[Overnight] Archiving " + j[0] + " failed: " + e.message);
      failed.push(j[0]);
    }
  });
  state = { day: today, failed: failed };
  props.setProperty(ON_ARCHIVE_STATE_KEY, JSON.stringify(state));
  return state;
}

// The 6 a.m. alert's checks (2026-11-20): counts only, with what to do.
// { problems, unreadable }.
function _onAdminChecks_(now) {
  const out = { problems: [], unreadable: false };
  const cfg = getConfig_();
  let adminSs = null;
  try {
    adminSs = SpreadsheetApp.openById(cfg.adminSsId);
    const st = _stagingPipelineHealthChecks_(adminSs, cfg);
    if (st.inProcessStuckRows.length) {
      out.problems.push("Submissions stuck evaluating (" + STAGING_STUCK_IN_PROCESS_MINUTES + "+ minutes, or with no timestamp): " +
        st.inProcessStuckRows.length + ". ⚙️ Admin Controls → Reset Stuck Pipeline Row");
    }
    if (st.pendingStuckRows.length) {
      out.problems.push("Submissions queued " + STAGING_STUCK_PENDING_MINUTES + "+ minutes with no evaluation started: " +
        st.pendingStuckRows.length + ". Check that the Turnstile trigger (06) is installed and running");
    }
    if (st.unknownStatusRows.length) {
      out.problems.push("STAGING_PIPELINE rows with an unknown status: " + st.unknownStatusRows.length +
        " (Studio residue from a test run; delete the row)");
    }
  } catch (e) {
    out.unreadable = true;
    out.problems.push("Stuck submissions: unavailable (" + e.message + ")");
  }
  try {
    const sheet = adminSs && adminSs.getSheetByName(cfg.tabs.rubricQueue);
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getDataRange().getValues();
      const h = data[0].map(function (x) { return String(x).trim(); });
      const iSt = h.indexOf("Status"), iTs = h.indexOf("Timestamp");
      const stuck = data.slice(1).filter(function (r) {
        if (String(r[iSt] || "").trim() !== "PENDING_EXTRACTION" || iTs === -1) return false;
        const t = new Date(r[iTs]).getTime();
        return !isNaN(t) && now.getTime() - t >= ON_RUBRIC_STUCK_MS;
      }).length;
      if (stuck) {
        out.problems.push("Rubric extractions stuck 2+ hours (Studio Flow 1): " + stuck +
          ". Check Flow 1's run history; to re-queue, delete the row and ask the teacher to resubmit the rubric");
      }
    }
  } catch (e) {
    out.unreadable = true;
    out.problems.push("Stuck rubric extractions: unavailable (" + e.message + ")");
  }
  try {
    _ferpaHealthChecks_().filter(function (c) { return !c.ok; }).forEach(function (c) {
      const line = String(c.displayLine || "").replace(/^\W+/, "").replace(/\s*[—,]\s*see admin alert\s*$/, "");
      out.problems.push("FERPA: " + line + " (⚙️ Admin Controls → System Health Check says what to do)");
    });
  } catch (e) {
    out.unreadable = true;
    out.problems.push("FERPA checks: unavailable (" + e.message + ")");
  }
  return out;
}

// Today's retention archiving, as a problem line or "" (and whether it ran).
function _onArchiveState_(props, today) {
  let state = null;
  try { state = JSON.parse(props.getProperty(ON_ARCHIVE_STATE_KEY) || "null"); } catch (e) { state = null; }
  if (!state || state.day !== today) return { ran: false, problem: "" };
  return { ran: true, problem: state.failed && state.failed.length
    ? "Retention archiving failed today for: " + state.failed.join(", ") + " (Executions shows why; it runs again tomorrow)" : "" };
}

// Returns { problems: [], allClear: "" }. allClear is set only when every
// check was read and none found a problem.
function overnightHealth_(now, tz) {
  now = now ? new Date(now) : new Date();
  tz = tz || Session.getScriptTimeZone();
  const props = PropertiesService.getScriptProperties();
  const problems = [];
  const today = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  const tomorrow = Utilities.formatDate(new Date(now.getTime() + 24 * 60 * 60 * 1000), tz, "yyyy-MM-dd");
  let unreadable = false;

  // The 6 a.m. alert's checks and today's archiving (2026-11-20), Module 2 or not.
  const admin = _onAdminChecks_(now);
  const archive = _onArchiveState_(props, today);
  if (props.getProperty("M2_ENABLED") !== "true") {
    return { problems: ["Module 2 is off (M2_ENABLED), so the 3 a.m. runs and warm-ups don't run"]
      .concat(admin.problems).concat(archive.problem ? [archive.problem] : [])
      .concat(_onTurnInChecks_(null, now).problems).concat(_onFlow2Duplicates_(null, now).problems)
      .concat(_onFlow2Drift_(null, now).problems), allClear: "" };
  }
  admin.problems.forEach(function (p) { problems.push(p); });
  if (admin.unreadable) unreadable = true;
  if (archive.problem) problems.push(archive.problem);

  ON_STAGES.forEach(function (s) {
    const when = new Date(props.getProperty(s.key) || "").getTime();
    if (isNaN(when)) {
      problems.push("Stage " + s.label + ": no run recorded");
    } else if (now.getTime() - when > ON_STAGE_MAX_AGE_MS) {
      problems.push("Stage " + s.label + ": didn't run last night (last run " +
        Utilities.formatDate(new Date(when), tz, "yyyy-MM-dd HH:mm") + ")");
    } else {
      // ERRORS_n (25) and NO_* (33: NO_TAGS, or a stop such as NO_MATRIX_ID)
      // are runs that finished with a problem.
      const status = String(props.getProperty(s.key.replace("LAST_RUN", "STATUS")) || "");
      if (/^(ERRORS|NO_)/.test(status)) {
        problems.push("Stage " + s.label + ": ran with status " + status +
          (status === "NO_TAGS" ? " (no assignment on the Teacher Matrix has competency tags)" :
            status === "NO_MATRIX_ID" ? " (no MatrixRegistry row for the teacher, and no TEACHER_MATRIX_SS_ID)" : ""));
      }
    }
  });

  // The Ledger cycle's jobs still failing (64), 2026-10-22.
  try {
    lcFailingJobs_(props, now.getTime()).filter(function (f) { return f.streak > 0; }).forEach(function (f) {
      problems.push("Ledger job " + f.fn + ": failing, " + f.streak + " run" + (f.streak === 1 ? "" : "s") +
        " in a row (Executions in the Central Ledger's Apps Script project shows the errors)");
    });
  } catch (e) {
    unreadable = true;
    problems.push("Ledger job failures: unavailable (" + e.message + ")");
  }

  const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);

  // The setup checks that used to be run by hand (2026-10-23).
  const setup = _onSetupChecks_(props, ss, now);
  setup.problems.forEach(function (p) { problems.push(p); });
  if (setup.unreadable) unreadable = true;

  let wu = null;
  try {
    wu = _onWarmUpCounts_(ss, today, tomorrow);
  } catch (e) {
    unreadable = true;
    problems.push("Warm-up counts: unavailable (" + e.message + ")");
  }
  if (wu) {
    if (wu.today.error > 0) {
      problems.push("Today's warm-ups that failed to deliver (ERROR): " + wu.today.error +
        " of " + wu.today.total + ". Check WarmUpFlowReturn's Error column.");
    }
    if (wu.today.waiting > 0) {
      problems.push("Today's warm-ups not delivered yet: " + wu.today.waiting + " of " + wu.today.total);
    }
    if (wu.tomorrow.error > 0) {
      problems.push("Tomorrow's warm-ups that failed to deliver (ERROR): " + wu.tomorrow.error +
        " of " + wu.tomorrow.total);
    }
    if (wu.stuckEval > 0) {
      problems.push("Warm-ups from earlier days still waiting on scoring (Flow 4): " + wu.stuckEval);
    }
  }

  try {
    const st = _onStudioCounts_(ss, now);
    [2, 3, 4].forEach(function (f) {
      if (st.stalled[f] > 0) {
        problems.push("Studio Flow " + f + ": " + st.stalled[f] + " job(s) with no return after " +
          Math.round(ON_STUDIO_STALL_MS[f] / 60000) + " minutes" +
          " (check the Flow's run history in Studio)");
      }
    });
    [3, 4].forEach(function (f) {
      if (st.failed[f] > 0) {
        problems.push("Flow " + f + " returns that failed or need attention in the last 24 hours: " + st.failed[f]);
      }
    });
    if (st.fallback > 0) {
      problems.push("Warm-ups that went out as the teacher's own question in the last 24 hours: " +
        st.fallback + " (Flow 3's output wasn't a warm-up, or Studio never returned it; check Flow 3's " +
        "run history in Studio)");
    }
  } catch (e) {
    unreadable = true;
    problems.push("Studio job counts: unavailable (" + e.message + ")");
  }

  // The lesson rollout (58), 2026-10-29: its PROBLEM rows reached only the
  // signal doc, so the email said nothing on the two nights it fell behind.
  // 2026-11-08 (plan L3): only what remains after the day's runs; a run the
  // time budget stopped is not a problem when a later one finished.
  let rolloutDone = "";
  try {
    const ro = _onRollout_(ss, now);
    rolloutSignalLines_(ro).forEach(function (l) { problems.push(l); });
    rolloutDone = rolloutFinishedLine_(ro);
  } catch (e) {
    unreadable = true;
    problems.push("Lesson rollout: unavailable (" + e.message + ")");
  }

  // Parts held a school day or more by a failed check (68, 2026-11-01; audit
  // #5): the next part can't unlock on its own. Counts only.
  try {
    const held = partsHeldByFailure_(ss, getConfig_(), now);
    if (held.students > 0) {
      problems.push("Students held at a part for a school day or more because its last check didn't finish: " +
        held.students + ". Open their next part on the Teacher Dashboard (\"Open Part n now\") or ask them to submit again");
    }
  } catch (e) {
    unreadable = true;
    problems.push("Parts held by a failed check: unavailable (" + e.message + ")");
  }

  // The turn-in check (72, Flow 6, 2026-11-08). Counts only.
  const ti = _onTurnInChecks_(ss, now);
  ti.problems.forEach(function (p) { problems.push(p); });
  if (ti.unreadable) unreadable = true;

  // Flow 2 writing one answer into several rows of a doc (37, 2026-11-15).
  const dup = _onFlow2Duplicates_(ss, now);
  dup.problems.forEach(function (p) { problems.push(p); });
  if (dup.unreadable) unreadable = true;

  // A flow that bound a Full list (00's flowKeyList_, 2026-11-19).
  const fl = _onFullListReturns_(ss, now);
  fl.problems.forEach(function (p) { problems.push(p); });
  if (fl.unreadable) unreadable = true;

  // Flow 2's daily drift probe (39b, 2026-11-16): no answer, or a platform change.
  const drift = _onFlow2Drift_(ss, now);
  drift.problems.forEach(function (p) { problems.push(p); });
  if (drift.unreadable) unreadable = true;

  let allClear = "";
  if (!problems.length && !unreadable) {
    allClear = "All clear: all four 3 a.m. stages ran. " +
      (wu.today.total ? "Today's warm-ups: " + wu.today.delivered + " of " + wu.today.total + " delivered. "
        : "No warm-ups today. ") +
      (wu.tomorrow.total ? "Tomorrow's: " + wu.tomorrow.total + " built, " + wu.tomorrow.delivered + " delivered so far."
        : "None built for tomorrow.") + (rolloutDone ? " " + rolloutDone + "." : "") +
      (archive.ran ? " Retention archiving ran." : "");
  }
  return { problems: problems, allClear: allClear };
}

// Returns set aside in the last 24 hours because the flow bound a Full list
// (one answer for several rows): the warm-up flows' and Flow 6's. Read from
// the harvests' notes. { problems, unreadable }.
function _onFullListReturns_(ss, now) {
  try {
    const book = ss || SpreadsheetApp.openById(getConfig_().ledgerSsId);
    const count = {};
    const scan = function (tab, width, at, flowOf, noteCol) {
      const sheet = book.getSheetByName(tab);
      if (!sheet || sheet.getLastRow() < 2) return;
      sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues().forEach(function (r) {
        if (String(r[noteCol] || "").indexOf(FLOW_FULL_LIST_NOTE) !== 0) return;
        const when = sheetTimestampMs_(r[at]);
        if (!isNaN(when) && now.getTime() - when > ON_RETURN_WINDOW_MS) return;
        const f = flowOf(r);
        count[f] = (count[f] || 0) + 1;
      });
    };
    scan("WarmUpFlowReturn", 7, 0, function (r) { return "Flow " + Number(r[1]); }, 6);
    scan("TurnInCheckReturn", 5, 0, function () { return "Flow 6"; }, 4);
    const keys = Object.keys(count).sort();
    if (!keys.length) return { problems: [], unreadable: false };
    return { problems: ["Studio flows that answered several rows at once (a Full list, not a Repeat for each), " +
      "last 24 hours: " + keys.map(function (k) { return k + " " + count[k]; }).join(", ") +
      ". Those answers were set aside. In Studio, put Ask Gemini and its write step inside a Repeat for each " +
      "(the FlowBuildSpec tab's \"one row per run\" rows)."], unreadable: false };
  } catch (e) {
    return { problems: ["Full-list returns: unavailable (" + e.message + ")"], unreadable: true };
  }
}

// The duplicate-write warning (37's flow2DuplicateWriteLine_): one line in
// the week after Flow 2 put one answer into several rows. { problems, unreadable }.
function _onFlow2Duplicates_(ss, now) {
  try {
    const line = flow2DuplicateWriteLine_(ss || SpreadsheetApp.openById(getConfig_().ledgerSsId), now);
    // And answers left out as second deliveries (37, 2026-11-17).
    const held = flow2HeldTwiceLine_(now);
    return { problems: [line, held].filter(Boolean), unreadable: false };
  } catch (e) {
    return { problems: ["Flow 2 duplicate writes: unavailable (" + e.message + ")"], unreadable: true };
  }
}

// The drift probe's warning (39b's flow2DriftLine_). { problems, unreadable }.
function _onFlow2Drift_(ss, now) {
  try {
    const line = flow2DriftLine_(ss || SpreadsheetApp.openById(getConfig_().ledgerSsId), now);
    return { problems: line ? [line] : [], unreadable: false };
  } catch (e) {
    return { problems: ["Flow 2 drift probe: unavailable (" + e.message + ")"], unreadable: true };
  }
}

// Turn-in answers the check couldn't decide, waiting for the teacher, and
// answers the check hasn't reached in an hour (72's turnInCheckCounts_).
// Nothing while the switch is off. { problems, unreadable }.
function _onTurnInChecks_(ss, now) {
  if (turnInOffEverywhere_()) return { problems: [], unreadable: false };
  try {
    const c = turnInCheckCounts_(ss || SpreadsheetApp.openById(getConfig_().ledgerSsId), now);
    const problems = [];
    if (c && c.failed > 0) {
      problems.push("Turn-in answers the check couldn't decide, waiting for you: " + c.failed + ". No code " +
        "was issued; the student can send the answer again, or grantTurnInCode() gives one with a reason");
    }
    if (c && c.stalled > 0) {
      problems.push("Turn-in answers waiting on the check for over an hour: " + c.stalled + " (is " +
        "runTurnInCheckFlow running? showSetupStatus() says; checkTurnInCheckFlowLiveness() says whether Flow 6 answers)");
    }
    return { problems: problems, unreadable: false };
  } catch (e) {
    return { problems: ["Turn-in checks: unavailable (" + e.message + ")"], unreadable: true };
  }
}

// The read-only setup checks, which were editor-only: the Ledger's column
// order (38), the FlowPrompts tab against the code (40), the last 24 hours'
// Flow 3/4/5 returns written to the right columns (41), and each retention
// record's date column (57), and any ⚙ Settings key (00's
// DASHBOARD_SETTING_KEYS) set as a Script Property here, and 29's and
// 30's weekly triggers. They read whole
// tabs, so they run at most every ON_SETUP_CHECK_MS and the lines are kept
// in ON_SETUP_STATE_KEY in between. All these files are in the Central
// Ledger project. Counts, header names and setting names only.
function _onSetupChecks_(props, ss, now) {
  let saved = null;
  try { saved = JSON.parse(props.getProperty(ON_SETUP_STATE_KEY) || "null"); } catch (e) { saved = null; }
  if (saved && now.getTime() - Number(saved.at || 0) < ON_SETUP_CHECK_MS && Array.isArray(saved.problems)) {
    return { problems: saved.problems, unreadable: !!saved.unreadable };
  }
  const problems = [];
  let unreadable = false;
  const run = function (label, fn) {
    try { fn(); } catch (e) {
      unreadable = true;
      problems.push(label + ": unavailable (" + e.message + ")");
    }
  };

  run("Ledger columns", function () {
    const p = lsgHeaderProblem_(ss.getSheetByName(getConfig_().tabs.ledger));
    if (p) problems.push(p);
  });

  run("Flow prompts", function () {
    const r = checkFlowPrompts();
    if (r.drifted || r.missing) {
      problems.push("Flow prompts on the FlowPrompts tab: " + r.drifted + " differ from the code, " + r.missing +
        " missing. Studio reads that tab, so run syncFlowPromptsToSheet()");
    }
  });

  run("Flow return columns", function () {
    const c = wfbRecentBindingCounts_(ss, now, ON_RETURN_WINDOW_MS);
    if (c.bad) {
      problems.push("Studio returns in the wrong columns (last 24 hours): " + c.bad + " of " + c.recent +
        " WarmUpFlowReturn rows. Run checkFlowBinding() to see which column each Flow's last step is off by");
    }
  });

  run("Retention schedule", function () {
    const missing = retentionMissingDateColumns_(getConfig_(), now);
    if (missing.length) {
      problems.push("Retention records with no date column, so none of their rows are checked: " +
        missing.map(function (r) { return r.label + " (\"" + r.missingDateColumn + "\")"; }).join(", "));
    }
  });

  run("Settings", function () {
    const all = props.getProperties();
    const here = DASHBOARD_SETTING_KEYS.filter(function (k) { return String(all[k] || "").trim() !== ""; });
    if (here.length) {
      problems.push("Settings set as Script Properties in the Central Ledger, which override the Teacher " +
        "Dashboard's ⚙ Settings here: " + here.join(", ") + ". Set each in ⚙ Settings, then delete the property");
    }
  });

  // 29's and 30's weekly runs (2026-10-27): their installers were hidden
  // from the Run dropdown, so neither had run and nothing said so.
  run("Weekly runs", function () {
    const handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    if (handlers.indexOf("runWeeklyStudentAggregation_") === -1) {
      problems.push("Student Context docs: the weekly run has no trigger, so no doc is made or updated. " +
        "Run setupStudentContextDocs()");
    }
    if (handlers.indexOf("runWeeklySCRSuggestionUpdate_") === -1) {
      problems.push("Competency suggestions: the weekly run has no trigger, so 🎓 Competency ratings gets no " +
        "new suggestion. Run setupCompetencySuggestions()");
    }
  });

  props.setProperty(ON_SETUP_STATE_KEY, JSON.stringify({ at: now.getTime(), problems: problems, unreadable: unreadable }));
  return { problems: problems, unreadable: unreadable };
}

// One read of WarmUpQueue's first columns (not the snapshot JSON). Columns
// are found by header, with 24's positions as the fallback.
function _onWarmUpCounts_(ss, today, tomorrow) {
  const sheet = ss.getSheetByName(TABS.warmUpQueue);
  if (!sheet) throw new Error("WarmUpQueue tab missing");
  const out = {
    today:    { total: 0, delivered: 0, waiting: 0, error: 0 },
    tomorrow: { total: 0, delivered: 0, waiting: 0, error: 0 },
    stuckEval: 0,
  };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  const dateCol = header.indexOf("lesson_date") >= 0 ? header.indexOf("lesson_date") : 5;
  const statusCol = header.indexOf("status") >= 0 ? header.indexOf("status") : 8;
  const width = Math.max(dateCol, statusCol) + 1;
  sheet.getRange(2, 1, lastRow - 1, width).getValues().forEach(function (r) {
    const date = _onDateStr_(r[dateCol]);
    const status = String(r[statusCol] || "").trim();
    const bucket = date === today ? out.today : (date === tomorrow ? out.tomorrow : null);
    // NOT_MEETING (24): queued for a day the period doesn't meet; not a warm-up.
    if (bucket && status !== "NOT_MEETING") {
      bucket.total++;
      if (ON_DELIVERED.indexOf(status) >= 0) bucket.delivered++;
      else if (status === "ERROR") bucket.error++;
      else bucket.waiting++;
    }
    if (status === "PENDING_EVAL" && date && date < today) out.stuckEval++;
  });
  return out;
}

// Studio jobs with no return yet, and recent failed returns.
function _onStudioCounts_(ss, now) {
  const out = { stalled: { 2: 0, 3: 0, 4: 0 }, failed: { 3: 0, 4: 0 }, fallback: 0 };
  const returned = { 3: {}, 4: {} };
  const ret = ss.getSheetByName(TABS.warmUpFlowReturn);
  if (ret && ret.getLastRow() > 1) {
    ret.getRange(2, 1, ret.getLastRow() - 1, 7).getValues().forEach(function (r) {
      const f = Number(r[1]);
      if (!returned[f]) return;
      returned[f][String(r[2]).trim()] = true;
      const hs = String(r[4] || "").trim();
      const when = sheetTimestampMs_(r[0]); // Studio writes it as text (00)
      const recent = isNaN(when) || now.getTime() - when <= ON_RETURN_WINDOW_MS;
      if ((hs === "FAILED" || hs === "NEEDS_ATTENTION") && recent) out.failed[f]++;
      // 41's harvest notes "ANCHOR_FALLBACK: ..." on a Flow 3 return it
      // replaced with the teacher's anchor (WFB_ANCHOR_FALLBACK).
      if (f === 3 && hs === "HARVESTED" && recent && /^ANCHOR_FALLBACK/.test(String(r[6] || ""))) out.fallback++;
    });
  }
  [3, 4].forEach(function (f) {
    const sheet = ss.getSheetByName("Flow" + f + "Input");
    if (!sheet || sheet.getLastRow() < 2) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function (r) {
      if (String(r[2] || "").trim() !== "READY") return; // CONSUMED, or RETRIED (41)
      if (returned[f][String(r[1]).trim()]) return;
      if (_onOlderThan_(r[0], now, ON_STUDIO_STALL_MS[f])) out.stalled[f]++;
    });
  });
  const fi = ss.getSheetByName(TABS.flowInput);
  if (fi && fi.getLastRow() > 1) {
    const header = fi.getRange(1, 1, 1, fi.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    const readyCol = header.indexOf("ReadyStatus");
    if (readyCol >= 0) {
      fi.getRange(2, 1, fi.getLastRow() - 1, readyCol + 1).getValues().forEach(function (r) {
        if (String(r[readyCol] || "").trim() === "READY" && _onOlderThan_(r[0], now, ON_STUDIO_STALL_MS[2])) {
          out.stalled[2]++;
        }
      });
    }
  }
  return out;
}

// A row with no readable timestamp counts as old: it never ages otherwise.
// RolloutLog's last 24 hours, as 58's rolloutDayStatus_ reads it: problems
// that remain, docs left if the day didn't finish, the export note. No tab
// is a quiet zero.
function _onRollout_(ss, now) {
  const sheet = ss.getSheetByName(TABS.rolloutLog);
  const rows = sheet && sheet.getLastRow() >= 2 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues() : [];
  return rolloutDayStatus_(rows, now, ON_RETURN_WINDOW_MS);
}

function _onOlderThan_(value, now, ms) {
  const t = sheetTimestampMs_(value);
  return isNaN(t) || now.getTime() - t > ms;
}

function _onDateStr_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || "").trim());
  return m ? m[1] : "";
}

// Once a day, on the first run at or after ON_MAIL_HOUR. Marked sent only
// after MailApp succeeds, so a failed send is retried on the next run.
function overnightMaybeMail_(health, now, tz) {
  now = now ? new Date(now) : new Date();
  tz = tz || Session.getScriptTimeZone();
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  if (Number(Utilities.formatDate(now, tz, "HH")) < ON_MAIL_HOUR) return false;
  if (props.getProperty(ON_MAIL_STATE_KEY) === today) return false;
  const cfg = getConfig_();
  const to = cfg.adminNotifyEmail || cfg.teacherEmail;
  if (!to) return false;

  const n = health.problems.length;
  // Flow 2's week (69, 2026-11-01): one line, and the Measures tab rewritten
  // once a day. Its failure doesn't hold the email back.
  // Since 2026-11-08 a second line (69b): the other flows' week and
  // Studio's runs per day against STUDIO_DAILY_RUN_LIMIT.
  let measures = "";
  try {
    const eh = evaluationHealth_({ now: now, write: true });
    measures = [eh.line, eh.flowLine].filter(Boolean).join("\n");
  } catch (e) {
    measures = "Flow 2's week: unavailable (" + e.message + ")";
  }
  const marker = typeof DEPLOY_VERSION_SHA !== "undefined" ? String(DEPLOY_VERSION_SHA).slice(0, 7) : "unknown";
  const subject = "CAS overnight " + today + ": " + (n ? n + (n === 1 ? " problem" : " problems") : "all clear") +
    " (" + (cfg.teacherEmail || "no TEACHER_EMAIL") + ")";
  const body = [
    "CAS overnight check, " + Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm") + " (" + tz + ")",
    "Deployment: cas-ccps:central-ledger, version marker " + marker +
      ", teacher " + (cfg.teacherEmail || "not set") + ".",
    "Counts only. The same lines are in KOS_CAS_SIGNAL under LAST NIGHT.",
    "",
    measures,
    "",
  ].concat(n ? health.problems.map(function (p) { return "- " + p; }) : [health.allClear || "No problems found."])
    .join("\n");
  MailApp.sendEmail(casMail_(to, subject, body));
  props.setProperty(ON_MAIL_STATE_KEY, today);
  return true;
}
