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
//   - each 3 a.m. stage stamped a run in the last 26 hours: 3:00 profiles
//     (23), 3:05 artifact sync (33), 3:15 warm-up scoring (25), 3:30 queue
//     build (24). A quiet night (nothing to build or score) still stamps.
//   - today's warm-ups: delivered of total, plus not yet delivered and ERROR
//   - tomorrow's warm-ups (built at 3:30): delivered so far, ERROR
//   - warm-ups from earlier days still waiting on scoring (PENDING_EVAL)
//   - Studio jobs with no return: Flow 3/4/5 inputs older than 30 minutes
//     with nothing in WarmUpFlowReturn, Flow 2 FlowInput rows still READY
//     after 15 minutes (open bug 4)
//   - warm-up returns that FAILED or need attention in the last 24 hours
//   - Flow 3 output replaced by the teacher's anchor (41's shape gate)
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
const ON_STUDIO_STALL_MS = { 2: 15 * 60 * 1000, 3: 30 * 60 * 1000, 4: 30 * 60 * 1000, 5: 30 * 60 * 1000 };
const ON_RETURN_WINDOW_MS = 24 * 60 * 60 * 1000;
const ON_MAIL_HOUR = 5;
const ON_MAIL_STATE_KEY = "CAS_OVERNIGHT_MAILED";
const ON_DELIVERED = ["DELIVERED", "PENDING_EVAL", "SCORED", "INCOMPLETE", "EVAL_ERROR"];

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

  if (props.getProperty("M2_ENABLED") !== "true") {
    return { problems: ["Module 2 is off (M2_ENABLED), so the 3 a.m. runs and warm-ups don't run"], allClear: "" };
  }

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
            status === "NO_MATRIX_ID" ? " (set the TEACHER_MATRIX_SS_ID Script Property)" : ""));
      }
    }
  });

  const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
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
    [2, 3, 4, 5].forEach(function (f) {
      if (st.stalled[f] > 0) {
        problems.push("Studio Flow " + f + ": " + st.stalled[f] + " job(s) with no return after " +
          Math.round(ON_STUDIO_STALL_MS[f] / 60000) + " minutes" +
          (f === 2 ? " (bug 4: start Flow 2 by hand)" : " (check the Flow's run history in Studio)"));
      }
    });
    [3, 4, 5].forEach(function (f) {
      if (st.failed[f] > 0) {
        problems.push("Flow " + f + " returns that failed or need attention in the last 24 hours: " + st.failed[f]);
      }
    });
    if (st.fallback > 0) {
      problems.push("Flow 3 output that wasn't a warm-up, replaced by the teacher's own question, " +
        "in the last 24 hours: " + st.fallback + " (delivered; check Flow 3's prompt in Studio)");
    }
  } catch (e) {
    unreadable = true;
    problems.push("Studio job counts: unavailable (" + e.message + ")");
  }

  let allClear = "";
  if (!problems.length && !unreadable) {
    allClear = "All clear: all four 3 a.m. stages ran. " +
      (wu.today.total ? "Today's warm-ups: " + wu.today.delivered + " of " + wu.today.total + " delivered. "
        : "No warm-ups today. ") +
      (wu.tomorrow.total ? "Tomorrow's: " + wu.tomorrow.total + " built, " + wu.tomorrow.delivered + " delivered so far."
        : "None built for tomorrow.");
  }
  return { problems: problems, allClear: allClear };
}

// One read of WarmUpQueue's first columns (not the snapshot JSON). Columns
// are found by header, with 24's positions as the fallback.
function _onWarmUpCounts_(ss, today, tomorrow) {
  const sheet = ss.getSheetByName(getConfig_().tabs.warmUpQueue || "WarmUpQueue");
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
  const out = { stalled: { 2: 0, 3: 0, 4: 0, 5: 0 }, failed: { 3: 0, 4: 0, 5: 0 }, fallback: 0 };
  const returned = { 3: {}, 4: {}, 5: {} };
  const ret = ss.getSheetByName("WarmUpFlowReturn");
  if (ret && ret.getLastRow() > 1) {
    ret.getRange(2, 1, ret.getLastRow() - 1, 7).getValues().forEach(function (r) {
      const f = Number(r[1]);
      if (!returned[f]) return;
      returned[f][String(r[2]).trim()] = true;
      const hs = String(r[4] || "").trim();
      const when = new Date(r[0]).getTime();
      const recent = isNaN(when) || now.getTime() - when <= ON_RETURN_WINDOW_MS;
      if ((hs === "FAILED" || hs === "NEEDS_ATTENTION") && recent) out.failed[f]++;
      // 41's harvest notes "ANCHOR_FALLBACK: ..." on a Flow 3 return it
      // replaced with the teacher's anchor (WFB_ANCHOR_FALLBACK).
      if (f === 3 && hs === "HARVESTED" && recent && /^ANCHOR_FALLBACK/.test(String(r[6] || ""))) out.fallback++;
    });
  }
  [3, 4, 5].forEach(function (f) {
    const sheet = ss.getSheetByName("Flow" + f + "Input");
    if (!sheet || sheet.getLastRow() < 2) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function (r) {
      if (String(r[2] || "").trim() !== "READY") return; // CONSUMED, or RETRIED (41)
      if (returned[f][String(r[1]).trim()]) return;
      if (_onOlderThan_(r[0], now, ON_STUDIO_STALL_MS[f])) out.stalled[f]++;
    });
  });
  const fi = ss.getSheetByName(getConfig_().tabs.flowInput || "FlowInput");
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
function _onOlderThan_(value, now, ms) {
  const t = new Date(value).getTime();
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
  const marker = typeof DEPLOY_VERSION_SHA !== "undefined" ? String(DEPLOY_VERSION_SHA).slice(0, 7) : "unknown";
  const subject = "CAS overnight " + today + ": " + (n ? n + (n === 1 ? " problem" : " problems") : "all clear") +
    " (" + (cfg.teacherEmail || "no TEACHER_EMAIL") + ")";
  const body = [
    "CAS overnight check, " + Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm") + " (" + tz + ")",
    "Deployment: cas-ccps:central-ledger, version marker " + marker +
      ", teacher " + (cfg.teacherEmail || "not set") + ".",
    "Counts only. The same lines are in KOS_CAS_SIGNAL under LAST NIGHT.",
    "",
  ].concat(n ? health.problems.map(function (p) { return "- " + p; }) : [health.allClear || "No problems found."])
    .join("\n");
  MailApp.sendEmail(to, subject, body);
  props.setProperty(ON_MAIL_STATE_KEY, today);
  return true;
}
