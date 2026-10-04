/**
 * ================================================================
 * 51_CourseYearBuilder.js — CAS-CCPS
 * BOUND TO: Central Ledger (cas-ccps:central-ledger)
 * ================================================================
 *
 * Loads the 8175 / 8177 course data into the live Central Ledger and keeps
 * the next week of lessons filled in from the pacing guide, so warm-ups and
 * the dashboards run on real content rather than fixtures.
 *
 *   importCourseData()       runs the three existing importers
 *                            (22b registry, 31 pacing guide, 32 rubrics), then
 *                            checkCourseData().
 *   checkCourseData()        compares the live tabs with the repo's data
 *                            (COURSE_DATA_EXPECTED) and seeds NoSchoolDays.
 *   previewUpcomingLessons() / buildUpcomingLessons()
 *                            for each school day in the next
 *                            CYB_LOOKAHEAD_DAYS calendar days, and each class
 *                            period meeting that day (ClassSchedule), writes a
 *                            LessonContext row from the pacing-guide unit for
 *                            that course, through onLessonContextSubmit_()
 *                            (22), so alignment logging and the Lesson Frame
 *                            Doc (27) happen exactly as for a hand-entered
 *                            lesson. A slot that already has a lesson is never
 *                            touched: the teacher's own entry always wins.
 *   installLessonPlanTrigger() runs buildUpcomingLessons() daily at 2am, before
 *                            the 3:30am warm-up queue builder (24) reads
 *                            tomorrow's lesson.
 *
 * Days off come from the NoSchoolDays tab, seeded from CYB_NO_SCHOOL_2026_27,
 * a copy of leader-hub's NO_SCHOOL_DEFAULT (tests/cas-ccps/
 * course-year-builder.test.js keeps the two in step). Edit the tab for
 * snow days. Weekends are always skipped. ODD/EVEN day types use
 * getDayType_() (24), the same rule the warm-up builder uses.
 *
 * FERPA: everything written here is teacher-level and class-level
 * (LessonContext, Lesson Frame Docs). Nothing reads or writes student data.
 */

const CYB_LOOKAHEAD_DAYS = 7;          // matches validateLessonPayload_'s 7-day limit (22)
const CYB_TIME_BUDGET_MS = 5 * 60 * 1000;
const CYB_NO_SCHOOL_TAB = "NoSchoolDays";
const CYB_TRIGGER_FN = "buildUpcomingLessons";

// What the repo's data files hold. A drift test checks these against
// cas-ccps/data/CompetencyRegistry.csv, CompetencyRubrics.json and
// curriculum/PacingGuide_CAS_Context.json.
const COURSE_DATA_EXPECTED = {
  registry: { "8175": 113, "8177": 108 },
  rubrics:  { "8175": 113, "8177": 108 },
  pacingUnits: 20
};

// Weekday holidays and breaks, 2026-27. Copied from leader-hub's
// NO_SCHOOL_DEFAULT (src/10-command-engine-ai-and-widgets.html); the test
// fails if they differ.
const CYB_NO_SCHOOL_2026_27 = [
  "2026-09-04", "2026-09-07", "2026-09-21",
  "2026-11-02", "2026-11-03", "2026-11-25", "2026-11-26", "2026-11-27",
  "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25",
  "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31",
  "2027-01-01", "2027-01-18",
  "2027-02-15",
  "2027-03-09", "2027-03-26", "2027-03-29", "2027-03-30", "2027-03-31",
  "2027-04-01", "2027-04-02",
  "2027-05-31"
];

// ================================================================
// COURSE DATA: IMPORT AND CHECK
// ================================================================

/**
 * Runs the three importers, then checkCourseData(). Each importer finds its
 * file in Drive by name (teacher folder first): CompetencyRegistry.csv,
 * PacingGuide_CAS_Context.json and CompetencyRubrics.json, from cas-ccps/data
 * and cas-ccps/curriculum. Safe to re-run: the registry import only adds
 * missing IDs, and the other two rewrite their tabs.
 */
function importCourseData() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  if (!ss.getSheetByName(cfg.tabs.competencyRegistry)) {
    Logger.log("[S51] CompetencyRegistry tab missing; creating the Module 2 tabs first.");
    createModule2Tabs_();
  }
  importCompetencyRegistry();
  importPacingGuide();
  importCompetencyRubrics();
  return checkCourseData();
}

/**
 * Read-only apart from seeding NoSchoolDays when it is missing. Logs one
 * line per check and returns { ok, problems[] }.
 */
function checkCourseData() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const problems = [];

  const countByCourse = (tab, col) => {
    const sheet = ss.getSheetByName(tab);
    if (!sheet || sheet.getLastRow() < 2) return null;
    const counts = {};
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().forEach(r => {
      const id = String(r[col] || "").trim();
      if (!id) return;
      const course = id.split("-")[0];
      counts[course] = (counts[course] || 0) + 1;
    });
    return counts;
  };

  [["CompetencyRegistry", cfg.tabs.competencyRegistry, COURSE_DATA_EXPECTED.registry],
   ["CompetencyRubrics", cfg.tabs.competencyRubrics, COURSE_DATA_EXPECTED.rubrics]].forEach(([label, tab, want]) => {
    const got = countByCourse(tab, 0);
    if (!got) { problems.push(label + ": tab missing or empty"); return; }
    Object.keys(want).forEach(course => {
      if ((got[course] || 0) !== want[course]) {
        problems.push(label + ": " + course + " has " + (got[course] || 0) + " row(s), expected " + want[course]);
      }
    });
  });

  const units = _loadPacingGuide_() || [];
  if (units.length !== COURSE_DATA_EXPECTED.pacingUnits) {
    problems.push("PacingGuide: " + units.length + " unit(s), expected " + COURSE_DATA_EXPECTED.pacingUnits);
  }
  units.forEach(u => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(u.approx_start) || !/^\d{4}-\d{2}-\d{2}$/.test(u.approx_end)) {
      problems.push("PacingGuide: " + u.lesson_unit_id + " has unreadable dates (" + u.approx_start + " / " + u.approx_end + ")");
    }
  });

  const noSchool = _cybNoSchoolDays_(ss);
  const ok = problems.length === 0;
  Logger.log("[S51] Course data " + (ok ? "OK" : "INCOMPLETE") + ": registry, rubrics, " +
    units.length + " pacing unit(s), " + noSchool.size + " no-school day(s).");
  problems.forEach(p => Logger.log("[S51]   " + p));
  if (!ok) Logger.log("[S51] Upload the repo's data files to your teacher folder and run importCourseData().");
  return { ok: ok, problems: problems, noSchoolDays: noSchool.size, pacingUnits: units.length };
}

// ================================================================
// CALENDAR
// ================================================================

/** The NoSchoolDays tab's dates, seeding it from CYB_NO_SCHOOL_2026_27 when missing or empty. */
function _cybNoSchoolDays_(ss) {
  let sheet = ss.getSheetByName(CYB_NO_SCHOOL_TAB);
  if (!sheet) sheet = ss.insertSheet(CYB_NO_SCHOOL_TAB);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(1, 1, 1, 2).setValues([["date", "note"]]);
    sheet.getRange(2, 1, CYB_NO_SCHOOL_2026_27.length, 1).setNumberFormat("@");
    sheet.getRange(2, 1, CYB_NO_SCHOOL_2026_27.length, 2)
      .setValues(CYB_NO_SCHOOL_2026_27.map(d => [d, "CCPS 2026-27 calendar"]));
  }
  const set = new Set();
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(r => {
    const d = _normalizeLessonDateCell_(r[0]);
    if (d) set.add(d);
  });
  return set;
}

/** "8175", "8177" or "" from a ClassSchedule course name (same rule as getWarmUpAnchor_ in 31). */
function _cybCourseCode_(courseName) {
  const name = String(courseName || "");
  if (name.indexOf("8175") !== -1 || /marketing/i.test(name)) return "8175";
  if (name.indexOf("8177") !== -1 || /management/i.test(name)) return "8177";
  return "";
}

// ================================================================
// LESSONS
// ================================================================

function previewUpcomingLessons() {
  return buildUpcomingLessonPlan_({ apply: false });
}

/** Trigger entry point (daily, 2am). */
function buildUpcomingLessons() {
  return buildUpcomingLessonPlan_({ apply: true });
}

/**
 * @param {{apply?: boolean, today?: Date}} opts
 * @returns {{apply, planned: Object[], written: number, skipped: Object[], failed: Object[], message}}
 */
function buildUpcomingLessonPlan_(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const started = Date.now();
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const result = { apply: apply, planned: [], written: 0, skipped: [], failed: [], message: "" };

  if (PropertiesService.getScriptProperties().getProperty("M2_ENABLED") !== "true") {
    result.message = "Module 2 is not enabled (M2_ENABLED). Nothing built.";
    Logger.log("[S51] " + result.message);
    return result;
  }
  const scheduleSheet = ss.getSheetByName(cfg.tabs.classSchedule);
  const lcSheet = ss.getSheetByName(cfg.tabs.lessonContext);
  const units = _loadPacingGuide_() || [];
  if (!scheduleSheet || scheduleSheet.getLastRow() < 2 || !lcSheet || !units.length) {
    result.message = "Missing " + [!scheduleSheet || scheduleSheet.getLastRow() < 2 ? "ClassSchedule rows" : "",
      !lcSheet ? "the LessonContext tab" : "", !units.length ? "the PacingGuide (run importCourseData())" : ""]
      .filter(Boolean).join(", ") + ". Nothing built.";
    Logger.log("[S51] " + result.message);
    return result;
  }

  const schedule = scheduleSheet.getDataRange().getValues();
  const teachers = [];
  schedule.slice(1).forEach(r => {
    const t = String(r[CS_TEACHER_EMAIL] || "").trim().toLowerCase();
    if (t && teachers.indexOf(t) === -1) teachers.push(t);
  });

  // Slots that already have a lesson (any status but SUPERSEDED).
  const taken = new Set();
  lcSheet.getDataRange().getValues().slice(1).forEach(r => {
    if (String(r[LC_STATUS] || "").trim() === LC_STATUS_SUPERSEDED) return;
    taken.add([String(r[LC_TEACHER_EMAIL] || "").trim().toLowerCase(),
      _normalizeLessonDateCell_(r[LC_LESSON_DATE]),
      String(r[LC_PERIOD_OR_CLASS] || "").trim().toLowerCase()].join("|"));
  });

  const noSchool = _cybNoSchoolDays_(ss);
  const firstDay = units.reduce((m, u) => (!m || (u.approx_start && u.approx_start < m)) ? u.approx_start : m, "");
  const lastDay = units.reduce((m, u) => (u.approx_end > m ? u.approx_end : m), "");
  const today = opts.today ? new Date(opts.today.getTime()) : new Date();
  today.setHours(0, 0, 0, 0);

  let timedOut = false;
  for (let i = 1; i <= CYB_LOOKAHEAD_DAYS && !timedOut; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const dateStr = formatDateYMD_(day);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    if (noSchool.has(dateStr)) { result.skipped.push({ date: dateStr, reason: "NO_SCHOOL" }); continue; }
    if (dateStr < firstDay || dateStr > lastDay) { result.skipped.push({ date: dateStr, reason: "OUTSIDE_PACING_GUIDE" }); continue; }

    const dayType = getDayType_(day);
    for (const teacher of teachers) {
      for (const p of getPeriodsForDay_(schedule, teacher, dayType)) {
        const slot = { date: dateStr, teacher: teacher, period: p.period, course: p.courseName };
        if (taken.has([teacher, dateStr, String(p.period).toLowerCase()].join("|"))) {
          result.skipped.push(Object.assign(slot, { reason: "LESSON_EXISTS" }));
          continue;
        }
        const code = _cybCourseCode_(p.courseName);
        if (!code) { result.skipped.push(Object.assign(slot, { reason: "UNKNOWN_COURSE" })); continue; }
        const unit = resolveUnitForCourseDate_(dateStr, code);
        if (!unit) { result.skipped.push(Object.assign(slot, { reason: "NO_UNIT" })); continue; }

        const payload = _cybLessonPayload_(teacher, dateStr, p.period, code, unit);
        slot.unit = unit.lesson_unit_id;
        result.planned.push(slot);
        if (!apply) continue;
        if (Date.now() - started > CYB_TIME_BUDGET_MS) { timedOut = true; break; }
        const res = onLessonContextSubmit_(payload);
        if (res && res.success) {
          result.written++;
          taken.add([teacher, dateStr, String(p.period).toLowerCase()].join("|"));
        } else {
          result.failed.push(Object.assign({}, slot, { error: (res && res.error) || "unknown error" }));
        }
      }
      if (timedOut) break;
    }
  }

  result.message = (apply
    ? "Wrote " + result.written + " of " + result.planned.length + " planned lesson(s)"
    : "DRY RUN: " + result.planned.length + " lesson(s) would be written") +
    ", " + result.skipped.length + " skipped" +
    (result.failed.length ? ", " + result.failed.length + " FAILED" : "") +
    (timedOut ? ". Stopped at the time budget; the next run continues." : ".");
  Logger.log("[S51] " + result.message);
  result.planned.forEach(s => Logger.log("[S51]   " + s.date + " " + s.period + " (" + s.course + "): " + s.unit));
  result.failed.forEach(f => Logger.log("[S51]   FAILED " + f.date + " " + f.period + ": " + f.error));
  result.skipped.filter(s => s.reason !== "LESSON_EXISTS" && s.reason !== "NO_SCHOOL")
    .forEach(s => Logger.log("[S51]   skip " + s.date + (s.period ? " " + s.period : "") + ": " + s.reason));
  return result;
}

function _cybLessonPayload_(teacher, dateStr, period, code, unit) {
  const anchor = String(unit.warmup_anchor || "").trim();
  return {
    teacherEmail: teacher,
    lessonDate: dateStr,
    periodOrClass: String(period),
    learningObjective: String(unit["objective_" + code] || "").trim() || unit.lesson_unit_name,
    activityDescription: "Auto-drafted from the pacing guide: " + unit.lesson_unit_id + " " +
      unit.lesson_unit_name + "." + (anchor ? " Warm-up: " + anchor : "") +
      " Submit a lesson for this period to replace it.",
    keyVocabulary: String(unit.key_vocabulary || "").trim(),
    priorLessonConnection: String(unit.prior_lesson_connection || "").trim(),
    competencyIds: String(unit["competency_ids_" + code] || "").trim()
  };
}

// ================================================================
// TRIGGER
// ================================================================

/** Installs buildUpcomingLessons() daily near 2am. Run once; safe to re-run. */
function installLessonPlanTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === CYB_TRIGGER_FN);
  if (exists) {
    Logger.log("[S51] " + CYB_TRIGGER_FN + " trigger already installed.");
    return false;
  }
  ScriptApp.newTrigger(CYB_TRIGGER_FN).timeBased().atHour(2).nearMinute(0).everyDays(1).create();
  Logger.log("[S51] Installed " + CYB_TRIGGER_FN + " (daily, about 2am).");
  return true;
}

function removeLessonPlanTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === CYB_TRIGGER_FN) { ScriptApp.deleteTrigger(t); removed++; }
  });
  Logger.log("[S51] Removed " + removed + " " + CYB_TRIGGER_FN + " trigger(s).");
  return removed;
}
