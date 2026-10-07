/**
 * ================================================================
 * 55_LessonSchedule.js — CAS-CCPS
 * BOUND TO: Central Ledger (cas-ccps:central-ledger)
 * ================================================================
 *
 * The teacher's own lessons (55b_LessonAssignmentData.js, generated from
 * cas-ccps/curriculum/lessons/) on dates the teacher sets in the
 * LessonSchedule tab. The operator replaced the generated pacing-guide units
 * with these lessons on 2026-10-07 and keeps the dates himself.
 *
 *   seedLessonSchedule()  adds a row per lesson (both courses, in teaching
 *                         order) that isn't in the tab yet. Dates the teacher
 *                         typed are never changed; LS_FIRST_DATES fills the
 *                         first two the first time.
 *   scheduledLessonUnit_(dateStr, code)
 *                         the lesson a course is on for a date: the one with
 *                         the latest start_date on or before it. A lesson runs
 *                         until the next one starts. Returned in the
 *                         pacing-guide unit shape, so resolveUnitForCourseDate_
 *                         (31), and through it the lesson builder (51) and the
 *                         warm-ups (24), use the schedule wherever it has a
 *                         dated lesson, and the pacing guide before that.
 *
 * FERPA: teacher-level only.
 */

const LS_TAB = "LessonSchedule";
const LS_HEADERS = ["course", "lesson_key", "lesson", "start_date", "config_id", "notes"];
const LS_FIRST_DATES = { "8175-L06": "2026-10-08", "8177-employee-handbook-operations": "2026-10-08" };

/** "CAS-8175-L06", "CAS-8177-EMPLOYEE-HANDBOOK-OPERATIONS". */
function lessonConfigId_(key) {
  return "CAS-" + String(key).toUpperCase();
}

function seedLessonSchedule() {
  const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
  let sheet = ss.getSheetByName(LS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(LS_TAB);
    sheet.getRange(1, 1, 1, LS_HEADERS.length).setValues([LS_HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  const have = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().forEach(r => { have[String(r[0]).trim()] = true; });
  }
  const add = [];
  ["8175", "8177"].forEach(code => (LESSON_ORDER[code] || []).forEach(key => {
    if (have[key]) return;
    const a = LESSON_ASSIGNMENTS[key];
    add.push([code, key, a.unitName, LS_FIRST_DATES[key] || "", lessonConfigId_(key), ""]);
  }));
  if (add.length) {
    const at = sheet.getLastRow() + 1;
    sheet.getRange(at, 1, add.length, LS_HEADERS.length).setNumberFormat("@").setValues(add);
  }
  Logger.log("[S55] Added " + add.length + " lesson(s) to " + LS_TAB + ". Put a start date (YYYY-MM-DD) next to " +
    "each lesson; a lesson runs until the next one starts.");
  _lsCache_ = null;
  return { added: add.length };
}

// One read per execution: the builder and the warm-ups ask once per period.
let _lsCache_ = null;

/** { "8175": [{ key, start }], "8177": [...] }, dated rows only, by start. */
function _lsRows_() {
  if (_lsCache_) return _lsCache_;
  const out = { "8175": [], "8177": [] };
  try {
    const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
    const sheet = ss.getSheetByName(LS_TAB);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(r => {
        const code = String(r[0]).trim(), key = String(r[1]).trim();
        const start = _normalizeLessonDateCell_(r[3]); // 22: Sheets stores a typed date as a Date
        if (!out[code] || !key || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !LESSON_ASSIGNMENTS[key]) return;
        out[code].push({ key: key, start: start });
      });
    }
  } catch (e) {
    Logger.log("[S55] LessonSchedule not read: " + e.message);
  }
  Object.keys(out).forEach(c => out[c].sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  _lsCache_ = out;
  return out;
}

/**
 * The scheduled lesson for a course on a date, in the pacing-guide unit
 * shape (31's units), or null when no dated lesson has started by then.
 */
function scheduledLessonUnit_(dateStr, code) {
  const rows = (_lsRows_()[code] || []);
  let at = -1;
  rows.forEach((r, i) => { if (r.start <= dateStr) at = i; });
  if (at === -1) return null;
  const a = LESSON_ASSIGNMENTS[rows[at].key];
  const next = rows[at + 1];
  const unit = {
    lesson_unit_id: a.key,
    lesson_unit_name: a.unitName,
    stage: "", stage_name: "",
    approx_start: rows[at].start,
    approx_end: next ? next.start : "",
    overlap_type: code + " only",
    warmup_anchor: a.warmupAnchor,
    key_vocabulary: a.vocabulary || "",
    prior_lesson_connection: "",
    lesson_assignment_key: a.key
  };
  unit["objective_" + code] = a.objective;
  unit["competency_ids_" + code] = a.competencyIds.join(",");
  return unit;
}
