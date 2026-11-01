// =============================================================================
// FILE: 69_EvaluationHealth.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
// TRIGGERS: none of its own. Run reportEvaluationHealth() from the editor;
//           the overnight email (34c) runs it once a day and adds one line.
//
// PURPOSE: the numbers D8 waits on (meta/PLAN_2026-11.md: split more lessons
// into parts if Flow 2 fails fewer than about 1 in 20 checks), and the first
// reader of EvaluationLog (dead-ends audit #7). Per course and per week
// (Monday to Sunday), from EvaluationLog, STAGING_PIPELINE, the Ledger and
// WarmUpQueue:
//   - Flow 2 results by kind: PASSED, NEEDS_REVISION, and the three errors
//     37 logs (ERROR_EMPTY_OUTPUT, ERROR_SUSPECT_FABRICATION,
//     ERROR_HARVEST_FAILED; any other ERROR_ counted as other)
//   - submissions that never got a result: STAGING_PIPELINE rows still at
//     ERROR_TIMEOUT (a late result moves its row to COMPLETE, so it isn't
//     counted twice)
//   - the failure rate: errors and never-returned, over every check
//   - minutes from Submit to feedback (EvaluationLog's WaitMinutes, on
//     results the student got): median and the slowest tenth
//   - drafts per student per lesson: results the student got, per
//     student-and-assignment, mean and most
//   - warm-up answer rate: warm-ups delivered that week, and how many the
//     student answered (WarmUpQueue's delivered_at / answered_at)
//
// DATA BOUNDARY: counts, rates and minutes only; no names, emails, file IDs,
// ConfigIDs or student text, in the log, the Measures tab or the email.
// =============================================================================

const EH_MEASURES_TAB = "Measures";
const EH_WEEKS = 8;
const EH_RESULT_KINDS = ["PASSED", "NEEDS_REVISION", "ERROR_EMPTY_OUTPUT", "ERROR_SUSPECT_FABRICATION",
  "ERROR_HARVEST_FAILED"];
const EH_HEADERS = ["WeekOf", "Course", "Checks", "Passed", "NeedsRevision", "ErrorEmptyOutput",
  "ErrorSuspectFabrication", "ErrorHarvestFailed", "ErrorOther", "NeverReturned", "FailureRate",
  "WaitMedianMin", "WaitSlowestTenthMin", "StudentLessons", "DraftsPerStudentLesson", "MostDrafts",
  "WarmUpsDelivered", "WarmUpsAnswered", "WarmUpAnswerRate", "UpdatedAt"];
// D8's bar: split more lessons if fewer than about 1 in 20 checks fail.
const EH_D8_FAILURE_BAR = 0.05;

// Editor entry point: logs the weeks by course and rewrites the Measures tab.
function reportEvaluationHealth() {
  const out = evaluationHealth_({ write: true });
  out.rows.forEach(function (r) {
    Logger.log("[S69] " + EH_HEADERS.slice(0, -1).map(function (h, i) { return h + "=" + r[i]; }).join(" "));
  });
  Logger.log("[S69] " + out.line);
  return out;
}

// { rows: [Measures rows, newest week first], line: the email's one line }.
// opts.now for tests; opts.write rewrites the Measures tab.
function evaluationHealth_(opts) {
  const o = opts || {};
  const now = o.now ? new Date(o.now) : new Date();
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const firstWeek = _ehWeekStart_(new Date(now.getTime() - (EH_WEEKS - 1) * 7 * 86400000));
  const courseOf = _ehCourseByConfig_(ss, cfg);
  const cells = {};
  const cell = function (week, course) {
    const k = week + "|" + course;
    if (!cells[k]) {
      cells[k] = { week: week, course: course, kinds: {}, other: 0, never: 0, waits: [], drafts: {},
        delivered: 0, answered: 0 };
    }
    return cells[k];
  };
  const inWindow = function (ms) { return !isNaN(ms) && ms >= firstWeek.getTime() && ms <= now.getTime(); };

  // EvaluationLog: one row per Flow 2 result (37).
  const log = ss.getSheetByName((cfg.tabs && cfg.tabs.evaluationLog) || "EvaluationLog");
  if (log && log.getLastRow() > 1) {
    const rows = log.getRange(2, 1, log.getLastRow() - 1, EVAL_LOG_HEADERS.length).getValues();
    rows.forEach(function (r) {
      const at = sheetTimestampMs_(r[0]);
      if (!inWindow(at)) return;
      const configId = String(r[1] || "").trim();
      const c = cell(_ehWeekKey_(at), courseOf[configId] || "(unknown)");
      const result = String(r[4] || "").trim();
      if (EH_RESULT_KINDS.indexOf(result) !== -1) c.kinds[result] = (c.kinds[result] || 0) + 1;
      else if (/^ERROR_/.test(result)) c.other++;
      else return;
      if (result === "PASSED" || result === "NEEDS_REVISION") {
        const wait = Number(r[6]);
        if (r[6] !== "" && !isNaN(wait)) c.waits.push(wait);
        const key = configId + "|" + String(r[2] || "").trim();
        c.drafts[key] = (c.drafts[key] || 0) + 1;
      }
    });
  }

  // STAGING_PIPELINE: submissions the lane timed out that never got a result.
  const staging = ss.getSheetByName(cfg.tabs.stagingPipeline);
  if (staging && staging.getLastRow() > 1) {
    staging.getRange(2, 1, staging.getLastRow() - 1, STG_STATUS + 1).getValues().forEach(function (r) {
      if (String(r[STG_STATUS]).trim() !== "ERROR_TIMEOUT") return;
      const at = sheetTimestampMs_(r[STG_TIMESTAMP]);
      if (!inWindow(at)) return;
      cell(_ehWeekKey_(at), courseOf[String(r[STG_CONFIG_ID] || "").trim()] || "(unknown)").never++;
    });
  }

  // WarmUpQueue: delivered that week, and answered.
  const wq = ss.getSheetByName(cfg.tabs.warmUpQueue);
  if (wq && wq.getLastRow() > 1 && wq.getLastColumn() > WQ_TIMING.DELIVERED_AT) {
    wq.getRange(2, 1, wq.getLastRow() - 1, WQ_TIMING.ANSWERED_AT + 1).getValues().forEach(function (r) {
      const at = sheetTimestampMs_(r[WQ_TIMING.DELIVERED_AT]);
      if (!r[WQ_TIMING.DELIVERED_AT] || !inWindow(at)) return;
      const c = cell(_ehWeekKey_(at), warmUpCourseCode_(r[1]) || "(unknown)");
      c.delivered++;
      if (String(r[WQ_TIMING.ANSWERED_AT] || "").trim()) c.answered++;
    });
  }

  const stamp = now;
  const rows = Object.keys(cells).map(function (k) { return _ehRow_(cells[k], stamp); })
    .sort(function (a, b) { return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : String(a[1]).localeCompare(String(b[1])); });
  const line = _ehLine_(Object.keys(cells).map(function (k) { return cells[k]; })
    .filter(function (c) { return c.week === _ehWeekKey_(now.getTime()); }), _ehWeekKey_(now.getTime()));
  if (o.write) _ehWriteMeasures_(ss, rows);
  return { rows: rows, line: line };
}

function _ehRow_(c, stamp) {
  const k = function (name) { return c.kinds[name] || 0; };
  const errors = k("ERROR_EMPTY_OUTPUT") + k("ERROR_SUSPECT_FABRICATION") + k("ERROR_HARVEST_FAILED") + c.other;
  const checks = k("PASSED") + k("NEEDS_REVISION") + errors + c.never;
  const drafts = Object.keys(c.drafts).map(function (x) { return c.drafts[x]; });
  return [c.week, c.course, checks, k("PASSED"), k("NEEDS_REVISION"), k("ERROR_EMPTY_OUTPUT"),
    k("ERROR_SUSPECT_FABRICATION"), k("ERROR_HARVEST_FAILED"), c.other, c.never,
    checks ? _ehRound_((errors + c.never) / checks, 3) : "",
    _ehPercentile_(c.waits, 0.5), _ehPercentile_(c.waits, 0.9),
    drafts.length, drafts.length ? _ehRound_(drafts.reduce(function (a, b) { return a + b; }, 0) / drafts.length, 2) : "",
    drafts.length ? Math.max.apply(null, drafts) : "",
    c.delivered, c.answered, c.delivered ? _ehRound_(c.answered / c.delivered, 3) : "", stamp];
}

// The email's line, for this week across courses.
function _ehLine_(cellsThisWeek, week) {
  let checks = 0, failed = 0, never = 0, delivered = 0, answered = 0, waits = [], drafts = [];
  cellsThisWeek.forEach(function (c) {
    const r = _ehRow_(c, "");
    checks += r[2];
    failed += r[5] + r[6] + r[7] + r[8];
    never += r[9];
    delivered += c.delivered;
    answered += c.answered;
    waits = waits.concat(c.waits);
    Object.keys(c.drafts).forEach(function (x) { drafts.push(c.drafts[x]); });
  });
  if (!checks && !delivered) return "Flow 2 and warm-ups, week of " + week + ": nothing yet this week.";
  const rate = checks ? (failed + never) / checks : 0;
  return "Flow 2, week of " + week + ": " + checks + " check" + (checks === 1 ? "" : "s") + ", " +
    failed + " failed and " + never + " never returned (" + _ehRound_(rate * 100, 1) + "%; D8's bar is under " +
    (EH_D8_FAILURE_BAR * 100) + "%)" +
    (waits.length ? "; feedback in " + _ehPercentile_(waits, 0.5) + " min median, " + _ehPercentile_(waits, 0.9) +
      " at the slowest tenth" : "") +
    (drafts.length ? "; " + _ehRound_(drafts.reduce(function (a, b) { return a + b; }, 0) / drafts.length, 1) +
      " drafts per student per lesson" : "") +
    (delivered ? "; warm-ups answered " + answered + " of " + delivered : "") +
    ". The Measures tab has the weeks by course.";
}

function _ehWriteMeasures_(ss, rows) {
  let sheet = ss.getSheetByName(EH_MEASURES_TAB);
  if (!sheet) sheet = ss.insertSheet(EH_MEASURES_TAB);
  sheet.clear();
  sheet.getRange(1, 1, 1, EH_HEADERS.length).setValues([EH_HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, EH_HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);
}

// ConfigID -> course code from the Ledger (00's ledgerRowCourseCode_).
function _ehCourseByConfig_(ss, cfg) {
  const out = {};
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, LEDGER_COL_COUNT).getValues().forEach(function (row) {
    const id = String(row[LEDGER.CONFIG_ID] || "").trim();
    const code = ledgerRowCourseCode_(row);
    if (id && code) out[id] = code;
  });
  return out;
}

// The Monday (local time) of the week a moment falls in, as a Date / "yyyy-MM-dd".
function _ehWeekStart_(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start;
}

function _ehWeekKey_(ms) {
  const s = _ehWeekStart_(new Date(ms));
  return s.getFullYear() + "-" + String(s.getMonth() + 1).padStart(2, "0") + "-" + String(s.getDate()).padStart(2, "0");
}

// Nearest-rank percentile; "" for none.
function _ehPercentile_(values, p) {
  if (!values.length) return "";
  const sorted = values.slice().sort(function (a, b) { return a - b; });
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

function _ehRound_(x, places) {
  const f = Math.pow(10, places);
  return Math.round(x * f) / f;
}
