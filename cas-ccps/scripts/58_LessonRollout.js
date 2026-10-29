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
//   3c. AGENDA. With the rollout on, the next school day's agenda deck for
//      the course (67), made from the lesson doc's itinerary.
//
// HOLD. A lesson whose LessonSchedule release cell says HOLD (55) is left
// out of steps 1 to 3: no student doc is made or shared for it, current or
// upcoming, until the teacher clears the hold. Its teacher lesson doc (3b)
// and the agenda (3c) still come, and each run logs it as a HOLD row.
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
//
// CATCHING UP (2026-10-29). A run makes about 20 docs before its time
// budget, so a lesson for a whole course took several nights: on 10-27 and
// 10-28 one 8175 lesson used every run and 8177's current lesson got no docs
// at all. Now:
//   - A run that stops short (the time budget, or a step not reached)
//     schedules runLessonRolloutCatchUp a few minutes later, and that one
//     does the same, until a run finishes or ROLLOUT_CATCHUP_MAX runs have
//     gone in a day (ROLLOUT_CATCHUP state in Script Properties).
//   - Enrollment shares the run's time: lessons released tonight first,
//     taking turns between courses, each given an equal share of what's
//     left, so one large lesson can't hold up another course's.
//   - Enrollment stops ROLLOUT_DOCS_RESERVE_MS early when the lesson docs
//     and agendas (3b, 3c) still have to run.
//   - ROLLOUT_BUSY_UNTIL keeps two runs (the nightly one, a catch-up, one
//     from the editor) from overlapping.
// =============================================================================

const ROLLOUT_LEAD_DAYS = 2;
const ROLLOUT_LOG_TAB = "RolloutLog";
const ROLLOUT_LOG_HEADERS = ["Timestamp", "Mode", "Course", "Lesson", "Step", "Count", "Detail"];
const ROLLOUT_TRIGGER_FN = "runLessonRollout";
// Under the 6-minute trigger limit, leaving time to write the log.
const ROLLOUT_TIME_BUDGET_MS = 4.5 * 60 * 1000;
const ROLLOUT_STALE_EXPORT_DAYS = 7;
const ROLLOUT_CATCHUP_FN = "runLessonRolloutCatchUp";
const ROLLOUT_CATCHUP_DELAY_MS = 3 * 60 * 1000;
const ROLLOUT_CATCHUP_MAX = 12;
const ROLLOUT_CATCHUP_PROP = "ROLLOUT_CATCHUP";
const ROLLOUT_BUSY_PROP = "ROLLOUT_BUSY_UNTIL";
const ROLLOUT_BUSY_MS = 6 * 60 * 1000;
const ROLLOUT_DOCS_RESERVE_MS = 60 * 1000;
// A PROBLEM row that means the run stopped short, so a catch-up run follows.
const ROLLOUT_UNFINISHED_RE = /time budget|not reached/;

// Nightly trigger handler; also the one to run from the editor to catch up.
function runLessonRollout() {
  return _lrRunAndCatchUp_({});
}

// The catch-up a run that stopped short scheduled. Removes its own one-off
// trigger, runs, and schedules the next if this one stops short too.
function runLessonRolloutCatchUp() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === ROLLOUT_CATCHUP_FN) ScriptApp.deleteTrigger(t);
  });
  return _lrRunAndCatchUp_({ catchUp: true });
}

function _lrRunAndCatchUp_(opts) {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  if (Number(props.getProperty(ROLLOUT_BUSY_PROP) || 0) > now) {
    Logger.log("[S58] A rollout run is still going; this one will catch up after it.");
    _lrScheduleCatchUp_(props, new Date(now));
    return { rows: [], problems: 0, busy: true };
  }
  props.setProperty(ROLLOUT_BUSY_PROP, String(now + ROLLOUT_BUSY_MS));
  let res;
  try {
    res = lessonRollout_(opts);
  } finally {
    props.deleteProperty(ROLLOUT_BUSY_PROP);
  }
  if (res.unfinished) _lrScheduleCatchUp_(props, new Date(now));
  else props.deleteProperty(ROLLOUT_CATCHUP_PROP);
  return res;
}

// One catch-up a few minutes out, at most ROLLOUT_CATCHUP_MAX a day.
function _lrScheduleCatchUp_(props, now) {
  const day = formatDateYMD_(now);
  let state = {};
  try { state = JSON.parse(props.getProperty(ROLLOUT_CATCHUP_PROP) || "{}"); } catch (e) { state = {}; }
  const count = state.day === day ? Number(state.count) || 0 : 0;
  if (count >= ROLLOUT_CATCHUP_MAX) {
    Logger.log("[S58] Not scheduling another catch-up: " + count + " ran today. Tomorrow night's run continues.");
    return false;
  }
  if (ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === ROLLOUT_CATCHUP_FN; })) return false;
  ScriptApp.newTrigger(ROLLOUT_CATCHUP_FN).timeBased().after(ROLLOUT_CATCHUP_DELAY_MS).create();
  props.setProperty(ROLLOUT_CATCHUP_PROP, JSON.stringify({ day: day, count: count + 1 }));
  Logger.log("[S58] The run stopped short; catch-up " + (count + 1) + " of at most " + ROLLOUT_CATCHUP_MAX +
    " today in about " + Math.round(ROLLOUT_CATCHUP_DELAY_MS / 60000) + " minutes.");
  return true;
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
  Object.keys(plan).forEach(function (course) {
    plan[course].held.forEach(function (l) {
      log(modes[course], course, lessonConfigId_(l.key), "HOLD", 0, "held in LessonSchedule: no student docs made or shared");
    });
  });
  // A lesson in parts (68): its parts, unless students already have it whole.
  Object.keys(plan).forEach(function (course) {
    plan[course].lessons.forEach(function (l) {
      l.parts = lessonUsesParts_(ss, l.key) ? lessonPartsOf_(l.key) : null;
    });
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
  // A lesson in parts (68) seeds each part instead.
  const keys = [];
  Object.keys(plan).forEach(function (course) {
    plan[course].lessons.forEach(function (l) {
      (l.parts ? l.parts.map(function (p) { return p.key; }) : [l.key]).forEach(function (k) { keys.push(k); });
    });
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

  // 3. Enroll each lesson in the window, in the order _lrEnrollOrder_ gives
  // (tonight's releases first, the courses taking turns), each with an equal
  // share of the time left. With lesson docs or agendas still to make, the
  // last ROLLOUT_DOCS_RESERVE_MS is kept for them.
  const docsAfter = Object.keys(plan).some(function (c) { return modes[c] === "APPLY"; });
  const enrollDeadline = docsAfter ? deadline - ROLLOUT_DOCS_RESERVE_MS : deadline;
  const order = _lrEnrollOrder_(plan);
  order.forEach(function (l, i) {
    const course = l.course;
    const mode = modes[course];
    const lesson = lessonConfigId_(l.key);
    if (Date.now() > enrollDeadline) {
      log(mode, course, lesson, "PROBLEM", 0, "enrollment not reached: time budget used; the next run continues");
      return;
    }
    const share = Date.now() + Math.floor((enrollDeadline - Date.now()) / (order.length - i));
    if (mode === "SHADOW" && seeded[lesson] === false) {
      log(mode, course, lesson, "ENROLL", 0, "not checked: the lesson isn't seeded yet (it would be tonight)");
      return;
    }
    try {
      const res = enrollCanvasRoster_({
        apply: mode === "APPLY", assignmentConfigId: lesson,
        deferShare: !l.releaseNow, deadline: share, quiet: true,
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

  // 3b. The teacher's lesson doc (66), once per lesson; a later night only
  // refreshes its Class status. For courses the rollout acts for.
  Object.keys(plan).forEach(function (course) {
    if (modes[course] !== "APPLY") return;
    plan[course].lessons.concat(plan[course].held).forEach(function (l) {
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

  // 3c. The next school day's agenda deck (67), per course with it on.
  Object.keys(plan).forEach(function (course) {
    if (modes[course] !== "APPLY") return;
    if (Date.now() > deadline) {
      log("APPLY", course, "-", "PROBLEM", 0, "agenda not reached: time budget used; make it from 📅 Lessons");
      return;
    }
    try {
      const day = nextAgendaDay_(course, formatDateYMD_(now));
      if (!day) return;
      const res = makeAgendaDeck_(course, day);
      if (res.success) log("APPLY", course, "-", "AGENDA", 1, (res.created ? "agenda made for " : "agenda remade for ") + day);
      else log("APPLY", course, "-", "PROBLEM", 0, "agenda for " + day + ": " + res.error);
    } catch (e) {
      log("APPLY", course, "-", "PROBLEM", 0, "agenda failed: " + e.message);
    }
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
  // A dry run never needs a catch-up.
  const unfinished = !opts.forceShadow && rows.some(function (r) {
    return r[4] === "PROBLEM" && r[1] === "APPLY" && ROLLOUT_UNFINISHED_RE.test(String(r[6]));
  });
  Logger.log("[S58] Lesson rollout: " + rows.length + " log row(s), " + problems + " problem(s)" +
    (unfinished ? "; stopped short" : "") + ". See " + ROLLOUT_LOG_TAB + ".");
  return { rows: rows, problems: problems, unfinished: unfinished };
}

// The lessons (or parts) to enroll, in order: those released tonight first
// (the current lesson, tomorrow's, Part 1 of a lesson in parts), then the
// rest; within each group the courses take turns. [{ course, key, releaseNow }].
function _lrEnrollOrder_(plan) {
  const byCourse = {};
  Object.keys(plan).sort().forEach(function (course) {
    const list = byCourse[course] = [];
    plan[course].lessons.forEach(function (l) {
      // Part 1 is released like a lesson; later parts stay unshared until
      // they unlock (68).
      if (l.parts) l.parts.forEach(function (p) { list.push({ course: course, key: p.key, releaseNow: p.n === 1 && l.releaseNow }); });
      else list.push({ course: course, key: l.key, releaseNow: l.releaseNow });
    });
  });
  const out = [];
  [true, false].forEach(function (releaseNow) {
    const queues = Object.keys(byCourse).map(function (c) {
      return byCourse[c].filter(function (t) { return t.releaseNow === releaseNow; });
    });
    for (let i = 0; queues.some(function (q) { return i < q.length; }); i++) {
      queues.forEach(function (q) { if (i < q.length) out.push(q[i]); });
    }
  });
  return out;
}

// Per course: the current lesson (the latest that has started) and every
// lesson starting within ROLLOUT_LEAD_DAYS. releaseNow is true for the
// current lesson and one starting tomorrow: its docs are shared tonight.
// A lesson held in LessonSchedule goes in `held` instead of `lessons`.
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
    const held = [];
    const add = function (r, releaseNow) {
      (r.hold ? held : lessons).push({ key: r.key, start: r.start, releaseNow: releaseNow });
    };
    if (current) add(current, true);
    rows.forEach(function (r) {
      if (r.start > today && r.start <= lead) add(r, r.start <= tomorrow);
    });
    if (lessons.length || held.length) plan[course] = { lessons: lessons, held: held };
  });
  return plan;
}

// Shares SCHEDULED docs for the lessons being released tonight and sets their
// Ledger rows ACTIVE. Returns { lessonConfigId: {course, mode, count, failed, stopped} }.
function _lrRelease_(ss, cfg, plan, modes, deadline) {
  const releasing = {};
  Object.keys(plan).forEach(function (course) {
    plan[course].lessons.forEach(function (l) {
      if (l.releaseNow) releasing[l.parts ? l.parts[0].configId : lessonConfigId_(l.key)] = course;
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
