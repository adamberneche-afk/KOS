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
//   - Flow 2 results by kind: PASSED, NEEDS_REVISION, and the four errors
//     37 logs (ERROR_EMPTY_OUTPUT, ERROR_SUSPECT_FABRICATION,
//     ERROR_MALFORMED_OUTPUT (2026-11-15: a result set aside twice, or with
//     no re-arm left; a re-armed one is not a result, so not counted),
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
// And, through 69b's flowMeasures_() (2026-11-08), every CAS Studio flow per
// week (sent, returned, applied, set aside, never returned, retries, wait)
// in the FlowMeasures tab, and Studio's runs per day against
// STUDIO_DAILY_RUN_LIMIT: the email's second line. Since 2026-11-14 the
// editor log also has the Ledger cycle's run time (64's lcTimingReport_):
// today's trigger time, each job's, and the schedule's share of the wait;
// since 2026-11-15 also the day's trigger time at this rate (WARN over half
// the quota, ALERT over 80%) and how the cycle's checks decide.
//
// DATA BOUNDARY: counts, rates and minutes only; no names, emails, file IDs,
// ConfigIDs or student text, in the log, the Measures tab or the email.
// =============================================================================

const EH_MEASURES_TAB = "Measures";
const EH_WEEKS = 8;
const EH_RESULT_KINDS = ["PASSED", "NEEDS_REVISION", "ERROR_EMPTY_OUTPUT", "ERROR_SUSPECT_FABRICATION",
  "ERROR_HARVEST_FAILED", "ERROR_MALFORMED_OUTPUT"];
// The Measures tab is rewritten whole each time, so a column can go in the
// middle (ErrorMalformedOutput, 2026-11-15); _ehLine_ reads by name.
const EH_HEADERS = ["WeekOf", "Course", "Checks", "Passed", "NeedsRevision", "ErrorEmptyOutput",
  "ErrorSuspectFabrication", "ErrorHarvestFailed", "ErrorMalformedOutput", "ErrorOther", "NeverReturned", "FailureRate",
  "WaitMedianMin", "WaitSlowestTenthMin", "StudentLessons", "DraftsPerStudentLesson", "MostDrafts",
  "WarmUpsDelivered", "WarmUpsAnswered", "WarmUpAnswerRate", "UpdatedAt"];
// WarmUpQueue's lesson_context_snapshot column (25's WQ.LESSON_CTX_SNAP):
// the course is its course_name. Column 1 is the lesson ID (LES-...), which
// names no course; until 2026-11-01 this read column 1, so every warm-up
// counted under "(unknown)".
const EH_WQ_SNAPSHOT = 6;
// D8's bar: split more lessons if fewer than about 1 in 20 checks fail.
const EH_D8_FAILURE_BAR = 0.05;

// Editor entry point: logs the weeks by course and by flow, Studio's runs
// per day, and rewrites the Measures and FlowMeasures tabs.
function reportEvaluationHealth() {
  const out = evaluationHealth_({ write: true });
  out.rows.forEach(function (r) {
    Logger.log("[S69] " + EH_HEADERS.slice(0, -1).map(function (h, i) { return h + "=" + r[i]; }).join(" "));
  });
  Logger.log("[S69] " + out.line);
  out.flowRows.forEach(function (r) {
    Logger.log("[S69] " + FM_HEADERS.slice(0, -1).map(function (h, i) { return h + "=" + r[i]; }).join(" "));
  });
  if (out.runs) {
    Logger.log("[S69] Studio runs per day (CAS flows): " +
      out.runs.days.map(function (d) { return d.day + "=" + d.runs; }).join(" "));
  }
  Logger.log("[S69] " + out.flowLine);
  // Whether the schedule or Studio holds feedback up (2026-11-14): the
  // Ledger cycle's run time today and each job's (64), beside Flow 2's wait
  // above. Names and numbers only.
  try {
    const t = lcTimingReport_();
    out.cycleLines = [t.cycle, t.schedule, t.projection, t.gates].concat(LC_JOBS.map(function (j) { return j.fn + ": " + t.jobs[j.fn]; }));
    out.cycleLines.forEach(function (l) { Logger.log("[S69] " + l); });
  } catch (e) {
    Logger.log("[S69] Ledger cycle timing unavailable: " + e.message);
  }
  return out;
}

// { rows: [Measures rows, newest week first], line: the email's Flow 2 line,
//   flowRows: [FlowMeasures rows], runs: Studio's runs per day (69b),
//   flowLine: the email's second line }.
// opts.now for tests; opts.write rewrites the Measures and FlowMeasures tabs.
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
  const log = ss.getSheetByName(TABS.evaluationLog);
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
  if (wq && wq.getLastRow() > 1 && wq.getLastColumn() > WQ.DELIVERED_AT) {
    wq.getRange(2, 1, wq.getLastRow() - 1, WQ.ANSWERED_AT + 1).getValues().forEach(function (r) {
      const at = sheetTimestampMs_(r[WQ.DELIVERED_AT]);
      if (!r[WQ.DELIVERED_AT] || !inWindow(at)) return;
      let courseName = "";
      try { courseName = String(JSON.parse(String(r[EH_WQ_SNAPSHOT] || "{}")).course_name || ""); } catch (e) { courseName = ""; }
      const c = cell(_ehWeekKey_(at), warmUpCourseCode_(courseName) || "(unknown)");
      c.delivered++;
      if (String(r[WQ.ANSWERED_AT] || "").trim()) c.answered++;
    });
  }

  const stamp = now;
  const rows = Object.keys(cells).map(function (k) { return _ehRow_(cells[k], stamp); })
    .sort(function (a, b) { return a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : String(a[1]).localeCompare(String(b[1])); });
  const line = _ehLine_(Object.keys(cells).map(function (k) { return cells[k]; })
    .filter(function (c) { return c.week === _ehWeekKey_(now.getTime()); }), _ehWeekKey_(now.getTime()));
  if (o.write) _ehWriteMeasures_(ss, rows);

  // Every flow (69b). Its failure never holds back Flow 2's line; the reason
  // goes to the log only, since an error message can carry an ID.
  let flows = { rows: [], runs: null, line: "Other flows and Studio runs: unavailable (see the editor log)." };
  try {
    flows = flowMeasures_(ss, cfg, now, firstWeek);
    if (o.write) _fmWriteTab_(ss, flows.rows);
  } catch (e) {
    Logger.log("[S69] Flow measures failed: " + e.message);
  }
  return { rows: rows, line: line, flowRows: flows.rows, runs: flows.runs, flowLine: flows.line };
}

function _ehRow_(c, stamp) {
  const k = function (name) { return c.kinds[name] || 0; };
  const errors = k("ERROR_EMPTY_OUTPUT") + k("ERROR_SUSPECT_FABRICATION") + k("ERROR_HARVEST_FAILED") +
    k("ERROR_MALFORMED_OUTPUT") + c.other;
  const checks = k("PASSED") + k("NEEDS_REVISION") + errors + c.never;
  const drafts = Object.keys(c.drafts).map(function (x) { return c.drafts[x]; });
  return [c.week, c.course, checks, k("PASSED"), k("NEEDS_REVISION"), k("ERROR_EMPTY_OUTPUT"),
    k("ERROR_SUSPECT_FABRICATION"), k("ERROR_HARVEST_FAILED"), k("ERROR_MALFORMED_OUTPUT"), c.other, c.never,
    checks ? _ehRound_((errors + c.never) / checks, 3) : "",
    _ehPercentile_(c.waits, 0.5), _ehPercentile_(c.waits, 0.9),
    drafts.length, drafts.length ? _ehRound_(drafts.reduce(function (a, b) { return a + b; }, 0) / drafts.length, 2) : "",
    drafts.length ? Math.max.apply(null, drafts) : "",
    c.delivered, c.answered, c.delivered ? _ehRound_(c.answered / c.delivered, 3) : "", stamp];
}

// The email's line, for this week across courses.
function _ehLine_(cellsThisWeek, week) {
  let checks = 0, failed = 0, never = 0, delivered = 0, answered = 0, waits = [], drafts = [];
  const col = function (h) { return EH_HEADERS.indexOf(h); };
  cellsThisWeek.forEach(function (c) {
    const r = _ehRow_(c, "");
    checks += r[col("Checks")];
    ["ErrorEmptyOutput", "ErrorSuspectFabrication", "ErrorHarvestFailed", "ErrorMalformedOutput", "ErrorOther"]
      .forEach(function (h) { failed += r[col(h)]; });
    never += r[col("NeverReturned")];
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

// =============================================================================
// reportRegradeConsistency — how consistently Flow 2 grades the same work
// (added 2026-11-15). That afternoon a Studio Test run re-graded every
// FlowInput row, so most submissions now have two gradings of unchanged
// work: the original, in the Ledger's version history, and the re-grade, in
// FlowInput now. Make a copy of the version from before the re-grade (File →
// Version history → that version → ⋮ → Make a copy) and pass the copy's ID:
//   reportRegradeConsistency({ beforeSsId: "<the copy's ID>" })
// Optional: cleanFrom (an ISO time): pairs whose original row was built at or
// after it are also counted on their own, so originals graded before a
// Studio fix (which could answer for another lesson) can be set apart.
// Rows pair on StudentFileID + ConfigID + StagingRowRef; fixture rows are
// skipped. An original that is a newer submission's answer (the same text in
// more than one row of a doc: the duplicate-write bug) is counted apart, not
// compared. Each side is read by _fiCheckResultShape_ (37), so a grading that
// is malformed is counted as such, not compared. For each well-formed pair:
// the stamp (same, APPROVED → REVISION_REQUIRED, or the reverse), and each
// milestone both graded: the 3×3 table of original against re-grade, how
// many agree, differ by one level (MET / PARTIALLY_MET / NOT_MET) or by two;
// and per UnitName, pairs and stamp changes. Reads only: writes no cell,
// tab or property. Same DATA BOUNDARY as above: counts and unit names only.
// =============================================================================
const RC_LEVELS = ["MET", "PARTIALLY_MET", "NOT_MET"];

function reportRegradeConsistency(opts) {
  opts = opts || {};
  if (!opts.beforeSsId) {
    throw new Error("reportRegradeConsistency: pass { beforeSsId: <ID of a copy of the Ledger from before the re-grade> }.");
  }
  const cleanFromMs = opts.cleanFrom ? Date.parse(opts.cleanFrom) : NaN;
  if (opts.cleanFrom && isNaN(cleanFromMs)) throw new Error("reportRegradeConsistency: cleanFrom is not a time.");
  const cfg = getConfig_();
  const tab = (cfg.tabs && cfg.tabs.flowInput) || TABS.flowInput;
  const nowSheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(tab);
  const beforeSheet = SpreadsheetApp.openById(opts.beforeSsId).getSheetByName(tab);
  if (!nowSheet || !beforeSheet) throw new Error("reportRegradeConsistency: a FlowInput tab is missing.");
  const res = regradeConsistency_(beforeSheet.getDataRange().getValues().slice(1),
    nowSheet.getDataRange().getValues().slice(1), cleanFromMs);
  _rcLog_("ALL PAIRS", res.all);
  if (res.clean) _rcLog_("ORIGINAL BUILT AT OR AFTER " + opts.cleanFrom, res.clean);
  Logger.log("[Regrade] By unit (pairs compared; stamp changed):");
  Object.keys(res.byUnit).sort().forEach(function (u) {
    Logger.log("  " + u + ": " + res.byUnit[u].pairs + "; " + res.byUnit[u].flipped);
  });
  return res;
}

// The comparison itself, on FlowInput rows (no header): before and now.
function regradeConsistency_(beforeRows, nowRows, cleanFromMs) {
  const key = function (r) {
    return [r[FI.STUDENT_FILE_ID], r[FI.CONFIG_ID], r[FI.STAGING_ROW_REF]].map(function (v) { return String(v).trim(); }).join("|");
  };
  const before = {};
  beforeRows.forEach(function (r) {
    if (_fxIsFlow2FixtureRow_(r) || !String(r[FI.STUDENT_FILE_ID]).trim()) return;
    before[key(r)] = r;
  });
  // An original that is another submission's answer (the duplicate-write
  // bug, 37's _fiDuplicateWrites_): the same text in more than one row of a
  // doc. The newest row holding it keeps it; the older rows' pairs would
  // compare two different drafts, so they are counted apart, not compared.
  const copied = _rcCopiedOriginals_(beforeRows, key);
  const out = { all: _rcEmpty_(), clean: isNaN(cleanFromMs) ? null : _rcEmpty_(), byUnit: {} };
  nowRows.forEach(function (now) {
    if (_fxIsFlow2FixtureRow_(now) || !String(now[FI.STUDENT_FILE_ID]).trim()) return;
    const was = before[key(now)];
    const a = was ? String(was[FI.GEMINI_FULL_OUTPUT] || "").trim() : "";
    const b = String(now[FI.GEMINI_FULL_OUTPUT] || "").trim();
    const buckets = [out.all];
    if (out.clean && was && sheetTimestampMs_(was[FI.TIMESTAMP]) >= cleanFromMs) buckets.push(out.clean);
    const add = function (fn) { buckets.forEach(fn); };
    if (!was || !a || !b) { add(function (s) { s.unpaired++; }); return; }
    if (copied[key(now)]) { add(function (s) { s.copiedOriginal++; }); return; }
    if (a === b) { add(function (s) { s.unchanged++; }); return; }
    const sa = _fiCheckResultShape_(a, was), sb = _fiCheckResultShape_(b, now);
    if (!sa.ok || !sb.ok) {
      add(function (s) {
        if (!sa.ok) s.malformedBefore[sa.reason] = (s.malformedBefore[sa.reason] || 0) + 1;
        if (!sb.ok) s.malformedNow[sb.reason] = (s.malformedNow[sb.reason] || 0) + 1;
      });
      return;
    }
    const unit = String(now[FI.UNIT_NAME] || "").trim() || "(no unit name)";
    const u = out.byUnit[unit] || (out.byUnit[unit] = { pairs: 0, flipped: 0 });
    u.pairs++;
    if (sa.compliance !== sb.compliance) u.flipped++;
    add(function (s) {
      s.pairs++;
      if (sa.compliance === sb.compliance) s.stampSame++;
      else if (sa.compliance === "APPROVED") s.passToRevise++;
      else s.reviseToPass++;
      let allSame = true;
      ["1", "2", "3", "4"].forEach(function (k) {
        const x = sa.outcomes[k], y = sb.outcomes[k];
        if (!x || !y) return;
        s.matrix[x][y]++;
        s.milestones++;
        const gap = Math.abs(RC_LEVELS.indexOf(x) - RC_LEVELS.indexOf(y));
        if (gap === 0) s.agree++; else if (gap === 1) s.offByOne++; else s.offByTwo++;
        if (gap) allSame = false;
      });
      if (allSame) s.allMilestonesSame++;
    });
  });
  return out;
}

// { key: true } for each original row holding the same text as a newer row
// of the same doc (by Timestamp, then row order).
function _rcCopiedOriginals_(beforeRows, key) {
  const byDocText = {};
  beforeRows.forEach(function (r, i) {
    if (_fxIsFlow2FixtureRow_(r)) return;
    const doc = String(r[FI.STUDENT_FILE_ID] || "").trim();
    const text = String(r[FI.GEMINI_FULL_OUTPUT] || "").trim();
    if (!doc || !text) return;
    const k = doc + "\u0000" + text;
    (byDocText[k] = byDocText[k] || []).push({ r: r, i: i, at: sheetTimestampMs_(r[FI.TIMESTAMP]) });
  });
  const out = {};
  Object.keys(byDocText).forEach(function (k) {
    const held = byDocText[k];
    if (held.length < 2) return;
    held.sort(function (a, b) {
      return ((isNaN(a.at) ? 0 : a.at) - (isNaN(b.at) ? 0 : b.at)) || a.i - b.i;
    });
    held.slice(0, -1).forEach(function (h) { out[key(h.r)] = true; });
  });
  return out;
}

function _rcEmpty_() {
  const matrix = {};
  RC_LEVELS.forEach(function (x) { matrix[x] = {}; RC_LEVELS.forEach(function (y) { matrix[x][y] = 0; }); });
  return { pairs: 0, unpaired: 0, unchanged: 0, copiedOriginal: 0, malformedBefore: {}, malformedNow: {},
    stampSame: 0, passToRevise: 0, reviseToPass: 0, allMilestonesSame: 0,
    milestones: 0, agree: 0, offByOne: 0, offByTwo: 0, matrix: matrix };
}

function _rcLog_(title, s) {
  const pct = function (n, d) { return d ? Math.round(1000 * n / d) / 10 + "%" : "n/a"; };
  const list = function (o) {
    const k = Object.keys(o);
    return k.length ? k.map(function (r) { return r + " " + o[r]; }).join(", ") : "none";
  };
  Logger.log("[Regrade] " + title);
  Logger.log("  Pairs compared: " + s.pairs + " (not paired " + s.unpaired + ", same text both times " + s.unchanged +
             ", original was another submission's answer " + s.copiedOriginal + ")");
  Logger.log("  Malformed, original: " + list(s.malformedBefore) + "; re-grade: " + list(s.malformedNow));
  Logger.log("  Stamp: same " + s.stampSame + " (" + pct(s.stampSame, s.pairs) + "), APPROVED → REVISION_REQUIRED " +
             s.passToRevise + ", REVISION_REQUIRED → APPROVED " + s.reviseToPass);
  Logger.log("  Every milestone the same: " + s.allMilestonesSame + " of " + s.pairs + " (" + pct(s.allMilestonesSame, s.pairs) + ")");
  Logger.log("  Milestones: " + s.milestones + " graded twice; agree " + s.agree + " (" + pct(s.agree, s.milestones) +
             "), one level apart " + s.offByOne + ", MET ↔ NOT_MET " + s.offByTwo);
  Logger.log("  Original (rows) against re-grade (columns): MET / PARTIALLY_MET / NOT_MET");
  RC_LEVELS.forEach(function (x) {
    Logger.log("    " + x + ": " + RC_LEVELS.map(function (y) { return s.matrix[x][y]; }).join(" / "));
  });
}

// =============================================================================
// reportGradingByVersion — Flow 2's gradings grouped by the version that
// made them (added 2026-11-16). Flow 2 changed under live use: competency
// tiers and the passing rule (10-20), the process reflection (on 10-27),
// earlier parts (10-29), injection guards (11-01), a new Gemini model (11-13
// afternoon), Studio's rebuild (11-15). meta/FLOW2_VERSIONS_2026-11.md has
// the timeline. Two things set a grading's version:
//   - the prompt it was sent, read from the row's own PromptText (the
//     passing rule, the reflection block answered / "(none)" / absent, the
//     earlier-parts block, tertiary competencies, the injection guard line),
//     so a row is never placed by guessing from its date;
//   - the platform when it was graded (FLOW2_PLATFORM_EPOCHS: model and
//     Studio pipeline), from the row's ArmedAt if it was restarted, else
//     its Timestamp.
// The 11-15 re-grade overwrote every older row's answer in FlowInput, so
// the originals are read from a copy of the Ledger from before it
// (opts.beforeSsId), and the live tab gives the re-grades of those rows and
// the originals of rows built after the re-grade (opts.regradeTo). Per
// group: rows, graded, malformed by reason, approved, every milestone's
// MET / PARTIALLY_MET / NOT_MET and milestone 1's; per prompt version, the
// re-grade of the same rows, so the platform's effect is read with the
// prompt held fixed. An original that is a newer row's answer (the
// duplicate-write bug) is counted apart. Reads only; counts only.
//   reportGradingByVersion({ beforeSsId: "<the copy's ID>" })
// =============================================================================
const FLOW2_PLATFORM_EPOCHS = [
  { from: "2026-11-13T13:00:00-05:00", label: "new model, Studio before the rebuild" },
  // The rebuild was on 11-15, during the day (the 2:33 PM re-grade ran on
  // it); rows graded overnight on 11-15 count as before it.
  { from: "2026-11-15T12:00:00-05:00", label: "new model, rebuilt Studio" },
];
const FLOW2_FIRST_EPOCH_LABEL = "earlier model, Studio before the rebuild";
const GV_REGRADE_FROM = "2026-11-15T14:30:00-05:00";
const GV_REGRADE_TO = "2026-11-15T14:50:00-05:00";

function reportGradingByVersion(opts) {
  opts = opts || {};
  if (!opts.beforeSsId) {
    throw new Error("reportGradingByVersion: pass { beforeSsId: <ID of a copy of the Ledger from before the 11-15 re-grade> }.");
  }
  const cfg = getConfig_();
  const tab = (cfg.tabs && cfg.tabs.flowInput) || TABS.flowInput;
  const nowSheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(tab);
  const beforeSheet = SpreadsheetApp.openById(opts.beforeSsId).getSheetByName(tab);
  if (!nowSheet || !beforeSheet) throw new Error("reportGradingByVersion: a FlowInput tab is missing.");
  const res = gradingByVersion_(beforeSheet.getDataRange().getValues().slice(1),
    nowSheet.getDataRange().getValues().slice(1), opts);
  _gvLog_(res);
  return res;
}

// The grouping itself, on FlowInput rows (no header): the copy and now.
function gradingByVersion_(beforeRows, nowRows, opts) {
  opts = opts || {};
  const epochs = (opts.epochs || FLOW2_PLATFORM_EPOCHS).map(function (e) {
    return { fromMs: Date.parse(e.from), label: e.label };
  }).sort(function (a, b) { return a.fromMs - b.fromMs; });
  const firstLabel = opts.firstEpochLabel || FLOW2_FIRST_EPOCH_LABEL;
  const regradeFromMs = Date.parse(opts.regradeFrom || GV_REGRADE_FROM);
  const regradeToMs = Date.parse(opts.regradeTo || GV_REGRADE_TO);
  const key = function (r) {
    return [r[FI.STUDENT_FILE_ID], r[FI.CONFIG_ID], r[FI.STAGING_ROW_REF]].map(function (v) { return String(v).trim(); }).join("|");
  };
  const real = function (r) { return !_fxIsFlow2FixtureRow_(r) && String(r[FI.STUDENT_FILE_ID] || "").trim() !== ""; };
  const gradedAtMs = function (r) {
    const armed = sheetTimestampMs_(r[FI.ARMED_AT]);
    const built = sheetTimestampMs_(r[FI.TIMESTAMP]);
    return isNaN(armed) ? built : Math.max(armed, isNaN(built) ? armed : built);
  };
  const epochOf = function (ms) {
    let label = firstLabel;
    epochs.forEach(function (e) { if (!isNaN(ms) && ms >= e.fromMs) label = e.label; });
    return label;
  };

  const out = { byVersion: {}, byEpoch: {}, byWeek: {}, regradeByVersion: {},
    copiedOriginal: 0, unanswered: 0, originals: 0, regrades: 0 };
  const copied = _rcCopiedOriginals_(beforeRows, key);
  const inCopy = {};
  const add = function (bucket, name, row, text) {
    const s = bucket[name] || (bucket[name] = _gvEmpty_());
    s.rows++;
    const shape = _fiCheckResultShape_(text, row);
    if (!shape.ok) { s.malformed[shape.reason] = (s.malformed[shape.reason] || 0) + 1; return; }
    s.graded++;
    if (shape.compliance === "APPROVED") s.approved++;
    Object.keys(shape.outcomes).forEach(function (k) {
      const v = shape.outcomes[k];
      if (s.levels[v] === undefined) return;
      s.levels[v]++;
      if (k === "1") s.m1[v]++;
    });
  };
  const original = function (r) {
    const text = String(r[FI.GEMINI_FULL_OUTPUT] || "").trim();
    if (!text) { out.unanswered++; return; }
    if (copied[key(r)]) { out.copiedOriginal++; return; }
    out.originals++;
    const at = gradedAtMs(r);
    add(out.byVersion, _gvSignature_(r[FI.PROMPT_TEXT]), r, text);
    add(out.byEpoch, epochOf(at), r, text);
    add(out.byWeek, isNaN(at) ? "(no date)" : _gvWeekOf_(at), r, text);
  };

  beforeRows.forEach(function (r) {
    if (!real(r)) return;
    inCopy[key(r)] = r;
    original(r);
  });
  nowRows.forEach(function (r) {
    if (!real(r)) return;
    const was = inCopy[key(r)];
    const built = sheetTimestampMs_(r[FI.TIMESTAMP]);
    if (!was) {
      // Built after the copy: an original unless it was built before the
      // re-grade ended (then its answer may be the re-grade's).
      if (isNaN(built) || built >= regradeToMs) original(r);
      return;
    }
    // In both: the live answer is the re-grade when the row was built before it.
    if (!(built < regradeFromMs)) return;
    const text = String(r[FI.GEMINI_FULL_OUTPUT] || "").trim();
    if (!text || text === String(was[FI.GEMINI_FULL_OUTPUT] || "").trim()) return;
    if (copied[key(r)]) return;
    out.regrades++;
    add(out.regradeByVersion, _gvSignature_(was[FI.PROMPT_TEXT]), r, text);
  });
  return out;
}

// The prompt's version, from the text it was sent with.
function _gvSignature_(promptText) {
  const p = String(promptText || "");
  const block = function (name) {
    const m = p.match(new RegExp("<<<" + name + ">>>([\\s\\S]*?)<<<END_" + name + ">>>"));
    if (!m) return "absent";
    const body = m[1].trim();
    return /^\(none\)$/i.test(body) ? "none" : "present";
  };
  const tert = p.match(/TERTIARY COMPETENCIES[^\n]*\n([\s\S]*?)(\n\s*\n|\n[A-Z ]{6,}[(:])/);
  const parts = [
    /PASSING RULE:/.test(p) ? "passing rule" : "no passing rule",
    "reflection " + block("PROCESS_REFLECTION"),
    "earlier parts " + block("EARLIER_PARTS"),
    tert && !/None for this assignment/i.test(tert[1]) ? "tertiaries" : "no tertiaries",
    /looks like a system line/i.test(p) ? "guard" : "no guard",
  ];
  return p.trim() ? parts.join(", ") : "(no prompt text)";
}

// The Monday of a time's week, as yyyy-MM-dd in the script's zone.
function _gvWeekOf_(ms) {
  const d = new Date(ms);
  const tz = Session.getScriptTimeZone();
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    .indexOf(Utilities.formatDate(d, tz, "EEE")) + 1; // 1 = Monday
  return ymd_(new Date(ms - (dow - 1) * 86400000), tz);
}

function _gvEmpty_() {
  return { rows: 0, graded: 0, approved: 0, malformed: {},
    levels: { MET: 0, PARTIALLY_MET: 0, NOT_MET: 0 }, m1: { MET: 0, PARTIALLY_MET: 0, NOT_MET: 0 } };
}

function _gvLog_(res) {
  const pct = function (n, d) { return d ? Math.round(1000 * n / d) / 10 + "%" : "n/a"; };
  const line = function (name, s) {
    const all = s.levels.MET + s.levels.PARTIALLY_MET + s.levels.NOT_MET;
    const bad = Object.keys(s.malformed);
    return "  " + name + ": " + s.rows + " row(s), " + s.graded + " graded, approved " + s.approved +
      " (" + pct(s.approved, s.graded) + "); milestones MET / PARTIALLY_MET / NOT_MET " +
      [s.levels.MET, s.levels.PARTIALLY_MET, s.levels.NOT_MET].map(function (n) { return pct(n, all); }).join(" / ") +
      "; milestone 1 MET " + pct(s.m1.MET, s.m1.MET + s.m1.PARTIALLY_MET + s.m1.NOT_MET) +
      (bad.length ? "; malformed: " + bad.map(function (r) { return r + " " + s.malformed[r]; }).join(", ") : "");
  };
  const section = function (title, bucket) {
    Logger.log("[Versions] " + title);
    Object.keys(bucket).sort().forEach(function (k) { Logger.log(line(k, bucket[k])); });
  };
  Logger.log("[Versions] Originals " + res.originals + " (another submission's answer, set apart: " +
             res.copiedOriginal + "; no answer: " + res.unanswered + "); re-grades " + res.regrades + ".");
  section("ORIGINALS BY PLATFORM (model and Studio, when graded)", res.byEpoch);
  section("ORIGINALS BY WEEK GRADED", res.byWeek);
  section("ORIGINALS BY PROMPT VERSION (from each row's PromptText)", res.byVersion);
  section("THE 11-15 RE-GRADE OF THE SAME ROWS, BY THEIR PROMPT VERSION", res.regradeByVersion);
}
