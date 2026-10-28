// =============================================================================
// FILE: 58_LessonRollout.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
//
// The nightly lesson rollout (meta/CAS_DESIGN_THREADS_2026-10-16.md, Thread
// C). A date in LessonSchedule used to do nothing by itself: the operator ran
// seedAssignments() and applyRosterEnrollment() (one Config ID at a time)
// from the editor. This runs each night and ties student docs to the
// schedule:
//
//   1. RELEASE. For the current lesson and one starting tomorrow, every doc
//      made ahead of time (Ledger status SCHEDULED) is shared with its
//      student as an editor and set ACTIVE, so it appears on the Student
//      Dashboard the night before the lesson.
//   2. SEED. Lessons starting within ROLLOUT_LEAD_DAYS (2) and the current
//      lesson go into the TeacherMatrix as LIVE (53's seedAssignments_).
//   3. ENROLL. Each of those lessons is enrolled from the Canvas exports
//      (52's enrollCanvasRoster_). A lesson that hasn't reached its release
//      night gets docs that aren't shared yet (SCHEDULED); the current lesson
//      and tomorrow's get shared ones, so a late joiner can start at once.
//   3b. LESSON DOC. With the rollout on for the course, each of those
//      lessons gets the teacher's lesson doc (66) once; later nights refresh
//      its Class status.
//
// SHADOW FIRST. ROLLOUT_AUTO_APPLY (Script Property or the Ledger's _CONFIG
// tab; blank/"off", one course code, or "all", like the pivot flags) decides
// per course whether the run acts or only logs what it would do. Off, it
// changes nothing, except that a dry-run enrollment adds newly seen Canvas
// sections to CanvasSectionMap, the same as previewRosterEnrollment(). It is
// also the kill switch.
//
// Every run writes counts to the RolloutLog tab, one row per course, lesson
// and step, and a PROBLEM row for anything that needs the operator (a
// failed enrollment, a stalled run, a stale Canvas export). The CAS signal
// (34b) reports PROBLEM rows from the last day. FERPA: counts and reason
// codes only; no student name, account, file ID or student ConfigID is ever
// written there or logged here.
//
// installLessonRolloutTrigger() runs it nightly at about 9 p.m.
// previewLessonRollout() runs it once as a dry run from the editor.
// =============================================================================

const ROLLOUT_LEAD_DAYS = 2;
const ROLLOUT_LOG_TAB = "RolloutLog";
const ROLLOUT_LOG_HEADERS = ["Timestamp", "Mode", "Course", "Lesson", "Step", "Count", "Detail"];
const ROLLOUT_TRIGGER_FN = "runLessonRollout";
// Under the 6-minute trigger limit, leaving time to write the log.
const ROLLOUT_TIME_BUDGET_MS = 4.5 * 60 * 1000;
const ROLLOUT_STALE_EXPORT_DAYS = 7;

// Nightly trigger handler.
function runLessonRollout() {
  return lessonRollout_({});
}

// Editor: what tonight's run would do, acting on nothing.
function previewLessonRollout() {
  return lessonRollout_({ forceShadow: true });
}

/**
 * @param {{today?: Date, forceShadow?: boolean}} opts
 * @returns {{rows: Array[], problems: number}} the RolloutLog rows written
 */
function lessonRollout_(opts) {
  opts = opts || {};
  const started = Date.now();
  const deadline = started + ROLLOUT_TIME_BUDGET_MS;
  const now = opts.today || new Date();
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const rows = [];
  const log = function (mode, course, lesson, step, count, detail) {
    rows.push([new Date(), mode, course, lesson, step, count, detail || ""]);
  };

  const plan = _lrPlan_(now);
  const modes = {};
  Object.keys(plan).forEach(function (course) {
    modes[course] = !opts.forceShadow && pivotFlagFor_("ROLLOUT_AUTO_APPLY", course) ? "APPLY" : "SHADOW";
  });

  // 1. Release first: it is the step a class is waiting on.
  try {
    const release = _lrRelease_(ss, cfg, plan, modes, deadline);
    Object.keys(release).forEach(function (lesson) {
      const r = release[lesson];
      log(r.mode, r.course, lesson, "RELEASE", r.count, r.mode === "APPLY" ? "shared and opened" : "would share and open");
      if (r.failed) log(r.mode, r.course, lesson, "PROBLEM", r.failed, "doc(s) could not be shared; still SCHEDULED");
      if (r.stopped) log(r.mode, r.course, lesson, "PROBLEM", 0, "release stopped at the time budget; the next run continues");
    });
  } catch (e) {
    log("-", "-", "-", "PROBLEM", 0, "release failed: " + e.message);
  }

  // 2. Seed every lesson in the window that isn't in the TeacherMatrix yet.
  const keys = [];
  Object.keys(plan).forEach(function (course) {
    plan[course].lessons.forEach(function (l) { keys.push(l.key); });
  });
  const seeded = {};
  ["APPLY", "SHADOW"].forEach(function (mode) {
    const mine = keys.filter(function (k) { return modes[_lrCourseOfKey_(k)] === mode; });
    if (!mine.length) return;
    try {
      const res = seedAssignments_({ apply: mode === "APPLY", today: now, units: mine });
      res.planned.forEach(function (p) {
        seeded[p.configId] = mode === "APPLY";
        log(mode, _lrCourseOfConfigId_(p.configId), p.configId, "SEED", 1,
          mode === "APPLY" ? "added to the TeacherMatrix as LIVE" : "would add to the TeacherMatrix as LIVE");
      });
    } catch (e) {
      log(mode, "-", "-", "PROBLEM", 0, "seeding failed: " + e.message);
    }
  });

  // 3. Enroll each lesson in the window.
  Object.keys(plan).forEach(function (course) {
    const mode = modes[course];
    plan[course].lessons.forEach(function (l) {
      const lesson = lessonConfigId_(l.key);
      if (Date.now() > deadline) {
        log(mode, course, lesson, "PROBLEM", 0, "enrollment not reached: time budget used; the next run continues");
        return;
      }
      if (mode === "SHADOW" && seeded[lesson] === false) {
        log(mode, course, lesson, "ENROLL", 0, "not checked: the lesson isn't seeded yet (it would be tonight)");
        return;
      }
      try {
        const res = enrollCanvasRoster_({
          apply: mode === "APPLY", assignmentConfigId: lesson,
          deferShare: !l.releaseNow, deadline: deadline, quiet: true,
        });
        const n = mode === "APPLY" ? res.enrolled : res.planned.length;
        log(mode, course, lesson, "ENROLL", n, _lrEnrollDetail_(res, mode, l.releaseNow));
        if (res.failed.length) {
          log(mode, course, lesson, "PROBLEM", res.failed.length, "enrollment failed: " + _lrReasonCounts_(res.failed));
        }
        if (res.timedOut) log(mode, course, lesson, "PROBLEM", 0, "enrollment stopped at the time budget; the next run continues");
        if (res.unmappedSections.length) {
          log(mode, course, lesson, "PROBLEM", res.unmappedSections.length,
            "Canvas section(s) with no period in CanvasSectionMap");
        }
        if (!res.planned.length && !res.enrolled && res.message.indexOf("No LIVE assignment") === 0) {
          log(mode, course, lesson, "PROBLEM", 0, "no LIVE assignment for this lesson");
        }
      } catch (e) {
        log(mode, course, lesson, "PROBLEM", 0, "enrollment failed: " + e.message);
      }
    });
  });

  // 3b. The teacher's lesson doc (66), once per lesson; a later night only
  // refreshes its Class status. For courses the rollout acts for.
  Object.keys(plan).forEach(function (course) {
    if (modes[course] !== "APPLY") return;
    plan[course].lessons.forEach(function (l) {
      const lesson = lessonConfigId_(l.key);
      if (Date.now() > deadline) {
        log("APPLY", course, lesson, "PROBLEM", 0, "lesson doc not reached: time budget used; the next run continues");
        return;
      }
      try {
        const res = makeOrRefreshLessonDoc_(l.key, { today: now });
        if (res.success) log("APPLY", course, lesson, "LESSON_DOC", 1, res.created ? "lesson doc made" : "class status refreshed");
        else log("APPLY", course, lesson, "PROBLEM", 0, "lesson doc: " + res.error);
      } catch (e) {
        log("APPLY", course, lesson, "PROBLEM", 0, "lesson doc failed: " + e.message);
      }
    });
  });

  // 4. A stale Canvas export misses late joiners and section changes.
  try {
    const files = _criFindExports_(cfg);
    const newest = files.length ? files[0].getLastUpdated() : null;
    const ageDays = newest ? Math.floor((now.getTime() - newest.getTime()) / 86400000) : null;
    if (ageDays === null) log("-", "-", "-", "PROBLEM", 0, "no Canvas gradebook export found");
    else if (ageDays > ROLLOUT_STALE_EXPORT_DAYS) {
      log("-", "-", "-", "PROBLEM", ageDays, "the newest Canvas export is " + ageDays + " days old; export a fresh one");
    }
  } catch (e) {
    log("-", "-", "-", "PROBLEM", 0, "Canvas exports not checked: " + e.message);
  }

  if (!rows.length) log("-", "-", "-", "IDLE", 0, "no lesson starts within " + ROLLOUT_LEAD_DAYS + " days and none is current");
  _lrWriteLog_(ss, rows);
  const problems = rows.filter(function (r) { return r[4] === "PROBLEM"; }).length;
  Logger.log("[S58] Lesson rollout: " + rows.length + " log row(s), " + problems + " problem(s). See " + ROLLOUT_LOG_TAB + ".");
  return { rows: rows, problems: problems };
}

// Per course: the current lesson (the latest that has started) and every
// lesson starting within ROLLOUT_LEAD_DAYS. releaseNow is true for the
// current lesson and one starting tomorrow: its docs are shared tonight.
function _lrPlan_(now) {
  const today = formatDateYMD_(now);
  const tomorrow = formatDateYMD_(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const lead = formatDateYMD_(new Date(now.getFullYear(), now.getMonth(), now.getDate() + ROLLOUT_LEAD_DAYS));
  const all = _lsRows_();
  const plan = {};
  Object.keys(all).forEach(function (course) {
    const rows = all[course];
    let current = null;
    rows.forEach(function (r) { if (r.start <= today) current = r; });
    const lessons = [];
    if (current) lessons.push({ key: current.key, start: current.start, releaseNow: true });
    rows.forEach(function (r) {
      if (r.start > today && r.start <= lead) lessons.push({ key: r.key, start: r.start, releaseNow: r.start <= tomorrow });
    });
    if (lessons.length) plan[course] = { lessons: lessons };
  });
  return plan;
}

// Shares SCHEDULED docs for the lessons being released tonight and sets their
// Ledger rows ACTIVE. Returns { lessonConfigId: {course, mode, count, failed, stopped} }.
function _lrRelease_(ss, cfg, plan, modes, deadline) {
  const releasing = {};
  Object.keys(plan).forEach(function (course) {
    plan[course].lessons.forEach(function (l) {
      if (l.releaseNow) releasing[lessonConfigId_(l.key)] = course;
    });
  });
  const out = {};
  if (!Object.keys(releasing).length) return out;
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (!ledger || ledger.getLastRow() < 2) return out;
  const byStudent = readStudentAssignments_(ss).byStudent;
  const data = ledger.getRange(1, 1, ledger.getLastRow(), LEDGER_COL_COUNT).getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][LEDGER.STATUS]).trim() !== "SCHEDULED") continue;
    const lesson = byStudent[String(data[i][LEDGER.CONFIG_ID]).trim()];
    const course = releasing[lesson];
    if (!course) continue;
    const mode = modes[course];
    const r = out[lesson] || (out[lesson] = { course: course, mode: mode, count: 0, failed: 0, stopped: false });
    if (mode !== "APPLY") { r.count++; continue; }
    if (Date.now() > deadline) { r.stopped = true; continue; }
    try {
      DriveApp.getFileById(String(data[i][LEDGER.FILE_ID]).trim())
        .addEditor(String(data[i][LEDGER.GOOGLE_ID]).trim());
      ledger.getRange(i + 1, LEDGER.STATUS + 1).setValue("ACTIVE");
      r.count++;
    } catch (e) {
      r.failed++;
    }
  }
  return out;
}

function _lrEnrollDetail_(res, mode, releaseNow) {
  const verb = mode === "APPLY" ? "enrolled" : "would enroll";
  const shared = releaseNow ? "shared now" : "not shared until the night before";
  const skipped = res.skipped.length ? "; skipped " + _lrReasonCounts_(res.skipped) : "";
  return verb + " (" + shared + ")" + skipped;
}

// "ALREADY_ENROLLED 24, OTHER_COURSE 30": reason codes only, never accounts.
function _lrReasonCounts_(list) {
  const counts = {};
  list.forEach(function (x) { counts[x.reason] = (counts[x.reason] || 0) + 1; });
  return Object.keys(counts).sort().map(function (k) { return k + " " + counts[k]; }).join(", ");
}

function _lrCourseOfKey_(key) {
  return String(key).split("-")[0];
}

function _lrCourseOfConfigId_(configId) {
  const m = String(configId).match(/^CAS-(\d{4})-/);
  return m ? m[1] : "-";
}

function _lrWriteLog_(ss, rows) {
  let sheet = ss.getSheetByName(ROLLOUT_LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(ROLLOUT_LOG_TAB);
    sheet.appendRow(ROLLOUT_LOG_HEADERS);
    sheet.setFrozenRows(1);
  }
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, ROLLOUT_LOG_HEADERS.length).setValues(rows);
}

function installLessonRolloutTrigger() {
  if (ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === ROLLOUT_TRIGGER_FN; })) {
    Logger.log("[S58] The nightly lesson rollout trigger is already installed.");
    return false;
  }
  ScriptApp.newTrigger(ROLLOUT_TRIGGER_FN).timeBased().atHour(21).nearMinute(0).everyDays(1).create();
  Logger.log("[S58] Installed the nightly lesson rollout (about 9 p.m.). It only logs until ROLLOUT_AUTO_APPLY is set.");
  return true;
}

function removeLessonRolloutTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === ROLLOUT_TRIGGER_FN) { ScriptApp.deleteTrigger(t); removed++; }
  });
  Logger.log("[S58] Removed " + removed + " lesson rollout trigger(s).");
  return removed;
}
