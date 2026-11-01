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
 * The release column (2026-10-28, Thread C) holds a lesson back from the
 * nightly rollout (58): HOLD there and the rollout neither makes nor
 * shares its student docs, whatever its date, until the cell is cleared.
 * The lesson is still the one taught on its dates. Blank (or AUTO) is the
 * normal nightly rollout. The 📅 Lessons panel (07) sets it; a tab made
 * before the column existed gets its header from seedLessonSchedule().
 *
 * Warm-ups review: each pair of class days takes a random seed from the
 * lessons taught so far (a LessonSchedule start_date on or before the day),
 * the same for the ODD and EVEN classes (reviewWarmUpKey_, 2026-10-19). A
 * WarmUpPlan row overrides the pick for its pair of days.
 *
 *   seedWarmUpPlan()      adds the rows in WARMUP_PLAN_SEED that aren't in the
 *                         tab yet (date + course). Rows the teacher typed or
 *                         changed are never touched.
 *   plannedWarmUpUnit_(dateStr, code)
 *                         that day's planned lesson, in the same unit shape,
 *                         or null. getWarmUpAnchor_ (31) uses it first, so
 *                         only the warm-up changes, not the day's lesson.
 *
 * FERPA: teacher-level only.
 */

const LS_TAB = "LessonSchedule";
const LS_HEADERS = ["course", "lesson_key", "lesson", "start_date", "config_id", "notes", "release"];
const LS_RELEASE_COL = LS_HEADERS.indexOf("release") + 1;
const LS_HOLD = "HOLD";
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
  } else if (String(sheet.getRange(1, LS_RELEASE_COL).getValue()).trim() !== "release") {
    sheet.getRange(1, LS_RELEASE_COL).setValue("release").setFontWeight("bold");
  }
  const have = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().forEach(r => { have[String(r[0]).trim()] = true; });
  }
  const add = [];
  schoolCourseCodes_().forEach(code => (LESSON_ORDER[code] || []).forEach(key => {
    if (have[key]) return;
    const a = LESSON_ASSIGNMENTS[key];
    add.push([code, key, a.unitName, LS_FIRST_DATES[key] || "", lessonConfigId_(key), "", ""]);
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

/**
 * { "8175": [{ key, start, hold }], "8177": [...] }, dated rows only, by
 * start. hold: the release column says HOLD (a tab without the column holds
 * nothing).
 */
function _lsRows_() {
  if (_lsCache_) return _lsCache_;
  const out = {};
  schoolCourseCodes_().forEach(code => { out[code] = []; });
  try {
    const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
    const sheet = ss.getSheetByName(LS_TAB);
    if (sheet && sheet.getLastRow() > 1) {
      const width = Math.max(4, Math.min(sheet.getLastColumn(), LS_RELEASE_COL));
      const holdAt = width >= LS_RELEASE_COL &&
        String(sheet.getRange(1, LS_RELEASE_COL).getValue()).trim().toLowerCase() === "release" ? LS_RELEASE_COL - 1 : -1;
      sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues().forEach(r => {
        const code = String(r[0]).trim(), key = String(r[1]).trim();
        const start = _normalizeLessonDateCell_(r[3]); // 22: Sheets stores a typed date as a Date
        if (!out[code] || !key || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !LESSON_ASSIGNMENTS[key]) return;
        out[code].push({ key: key, start: start, hold: holdAt !== -1 && String(r[holdAt]).trim().toUpperCase() === LS_HOLD });
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
  const next = rows[at + 1];
  return _lessonUnit_(rows[at].key, code, rows[at].start, next ? next.start : "");
}

function _lessonUnit_(key, code, start, end) {
  const a = LESSON_ASSIGNMENTS[key];
  const unit = {
    lesson_unit_id: a.key,
    lesson_unit_name: a.unitName,
    stage: "", stage_name: "",
    approx_start: start,
    approx_end: end,
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

// ---------------------------------------------------------------------------
// WarmUpPlan: which lesson seeds each day's warm-up
// ---------------------------------------------------------------------------

const WUP_TAB = "WarmUpPlan";
const WUP_HEADERS = ["date", "course", "lesson_key", "notes"];

// Week of 2026-10-19: a review of the first quarter's lessons, one a day, in
// teaching order (8177's from its pacing guide's Quarter 1).
const WARMUP_PLAN_SEED = [
  ["2026-10-19", "8175", "8175-L01"],
  ["2026-10-20", "8175", "8175-L02"],
  ["2026-10-21", "8175", "8175-L03"],
  ["2026-10-22", "8175", "8175-L04"],
  ["2026-10-23", "8175", "8175-L05"],
  ["2026-10-19", "8177", "8177-the-business-of-the-game"],
  ["2026-10-20", "8177", "8177-brand-board"],
  ["2026-10-21", "8177", "8177-the-4-ps-of-the-fan-experience"],
  ["2026-10-22", "8177", "8177-chhs-school-store-company-description"],
  ["2026-10-23", "8177", "8177-what-is-branding-reflection-essay"]
];

function seedWarmUpPlan() {
  const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
  let sheet = ss.getSheetByName(WUP_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(WUP_TAB);
    sheet.getRange(1, 1, 1, WUP_HEADERS.length).setValues([WUP_HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else if (String(sheet.getRange(1, LS_RELEASE_COL).getValue()).trim() !== "release") {
    sheet.getRange(1, LS_RELEASE_COL).setValue("release").setFontWeight("bold");
  }
  const have = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(r => {
      have[_normalizeLessonDateCell_(r[0]) + "|" + String(r[1]).trim()] = true;
    });
  }
  const add = WARMUP_PLAN_SEED
    .filter(r => !have[r[0] + "|" + r[1]])
    .map(r => [r[0], r[1], r[2], LESSON_ASSIGNMENTS[r[2]].unitName]);
  if (add.length) {
    const at = sheet.getLastRow() + 1;
    sheet.getRange(at, 1, add.length, WUP_HEADERS.length).setNumberFormat("@").setValues(add);
  }
  Logger.log("[S55] Added " + add.length + " row(s) to " + WUP_TAB + ". Change a lesson_key to pick a " +
    "different seed for that day; delete a row to use the current lesson's seed.");
  _wupCache_ = null;
  return { added: add.length };
}

let _wupCache_ = null;

/** { "2026-10-19|8175": "8175-L01", ... }; rows naming an unknown or other-course lesson are skipped. */
function _wupRows_() {
  if (_wupCache_) return _wupCache_;
  const out = {};
  try {
    const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
    const sheet = ss.getSheetByName(WUP_TAB);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(r => {
        const date = _normalizeLessonDateCell_(r[0]);
        const code = String(r[1]).trim(), key = String(r[2]).trim();
        const a = LESSON_ASSIGNMENTS[key];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !a || a.code !== code) {
          if (key) Logger.log("[S55] " + WUP_TAB + " row skipped: " + [date, code, key].join(" / "));
          return;
        }
        out[date + "|" + code] = key;
      });
    }
  } catch (e) {
    Logger.log("[S55] " + WUP_TAB + " not read: " + e.message);
  }
  _wupCache_ = out;
  return out;
}

/**
 * The WarmUpPlan row covering dateStr for this course, { date, key }, or
 * null. A row covers its own date and the next weekday, so one row is one
 * warm-up for a pair of class days: the ODD and EVEN classes on the same
 * lesson get the same warm-up, and a DAILY_HALF period (24) gets it on the
 * first day only (decided 2026-10-19). A row on the next weekday wins.
 */
function plannedWarmUpRow_(dateStr, code) {
  const rows = _wupRows_();
  if (rows[dateStr + "|" + code]) return { date: dateStr, key: rows[dateStr + "|" + code] };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  d.setDate(d.getDate() - (d.getDay() === 1 ? 3 : 1)); // the weekday before
  if (d.getDay() === 0 || d.getDay() === 6) return null;
  const prev = formatDateYMD_(d);
  return rows[prev + "|" + code] ? { date: prev, key: rows[prev + "|" + code] } : null;
}

/**
 * The lesson seeding this course's warm-up on dateStr, as a unit, or null:
 * the WarmUpPlan row covering the date when there is one (an override),
 * otherwise reviewWarmUpKey_'s pick from the lessons taught so far.
 */
function plannedWarmUpUnit_(dateStr, code) {
  const row = plannedWarmUpRow_(dateStr, code);
  const key = row ? row.key : reviewWarmUpKey_(dateStr, code);
  return key ? _lessonUnit_(key, code, dateStr, dateStr) : null;
}

/**
 * A random review seed (decided 2026-10-19): any lesson with a LessonSchedule
 * start_date on or before dateStr, that is, taught by then. The pick is
 * random but fixed for a pair of class days (the odd date and the weekday
 * after), so the ODD and EVEN classes get the same warm-up; it can repeat.
 * A lesson with no start date isn't in the pool. "" when nothing is dated.
 */
function reviewWarmUpKey_(dateStr, code) {
  const pool = (_lsRows_()[code] || [])
    .filter(r => r.start <= dateStr && LESSON_ASSIGNMENTS[r.key].warmupAnchor)
    .map(r => r.key);
  if (!pool.length) return "";
  return pool[_wupHash_(_wupPairStart_(dateStr) + "|" + code) % pool.length];
}

/** The date a pair of class days starts: an odd date, else the weekday before. */
function _wupPairStart_(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m || +m[3] % 2 === 1) return String(dateStr || "");
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  d.setDate(d.getDate() - (d.getDay() === 1 ? 3 : 1));
  return formatDateYMD_(d);
}

/** FNV-1a: the same string always picks the same lesson. */
function _wupHash_(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
