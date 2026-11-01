// =============================================================================
// FILE: 68_LessonParts.js
// BOUND TO: Central Ledger (cas-ccps:central-ledger: the rollout, the Ledger
//   cycle's unlock job) AND the Teacher Dashboard (cas-ccps:teacher-dashboard:
//   the teacher's unlock).
//
// A lesson in parts (meta/STUDENT_WORK_PLAN_2026-10.md, Phase 3; 55b's
// LESSON_PARTS): each part its own assignment and work file, unlocked in
// order. The rollout (58) seeds and enrolls every part when the lesson comes
// up; Part 1 is shared on its release night like any lesson, and the rest
// are made unshared (Ledger SCHEDULED). A part unlocks for a student when
// their latest check of the part before it found its primary MET
// (CompetencyEvidence), or when the teacher unlocks it: the doc is shared
// with the student and the Ledger row set ACTIVE, the same as a release.
//
//   unlockReadyParts()       the Ledger cycle's job (every 5 minutes)
//   installPartUnlocks()     puts it in the cycle (run once from the editor)
//   previewPartUnlocks()     what it would unlock now; changes nothing
//   unlockNextPart_(...)     the teacher's unlock (07)
//   foldPartRows_(students)  the Teacher Dashboard's one row per student (07)
//   partsHeldByFailure_(...) parts held a school day or more by a failed
//                            check (the overnight email, 34c; audit #5)
//
// A lesson students have already started as one whole doc stays whole: its
// parts are used only when no student has the lesson's own assignment yet.
//
// FERPA: PartUnlocks holds the student's workspace ConfigID (as
// StudentAssignments does), never a name, email or file; logs are counts.
// =============================================================================

const LP_LOG_TAB = "PartUnlocks";
const LP_LOG_HEADERS = ["UnlockedAt", "StudentConfigID", "PartConfigID", "By"];
const LP_JOB = "unlockReadyParts";

// A part is HELD BY A FAILED CHECK when the student's furthest open part's
// last check ended in a failure that wasn't their work (the lane timed out,
// or the result couldn't be used: Ledger ERROR_TIMEOUT / ERROR_EVALUATION),
// so the next part can't unlock on its own; flagged once a full school day
// has passed since the submit (meta/STUDENT_WORK_PLAN_2026-10.md, "What
// reaches the teacher anyway"; dead-ends audit #5). The teacher unlocks it
// (07's "Open Part n now"). School days are weekdays not listed in
// SCHOOL_DAYS_OFF (00's isSchoolDay_; packaging step 1).
const LP_FAILED_CHECK_STATUSES = ["ERROR_TIMEOUT", "ERROR_EVALUATION"];

// Whole school days strictly between the failed submit's day and today: 0 the
// same day or the next, 1 once a school day has fully passed.
function partHeldSchoolDays_(failedAtMs, now) {
  if (!failedAtMs || isNaN(failedAtMs)) return 0;
  const day = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const today = day(now || new Date());
  const d = day(new Date(failedAtMs));
  let n = 0;
  for (d.setDate(d.getDate() + 1); d < today && n < 60; d.setDate(d.getDate() + 1)) {
    const ymd = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    if (isSchoolDay_(ymd)) n++; // 00: a weekday not in SCHOOL_DAYS_OFF
  }
  return n;
}

// The lesson's parts, or null when it has none: [{ key, configId, n, a }].
function lessonPartsOf_(lessonKey) {
  const parts = typeof LESSON_PARTS !== "undefined" ? LESSON_PARTS[lessonKey] : null;
  if (!parts || !parts.length) return null;
  return parts.map(function (a) { return { key: a.key, configId: "CAS-" + String(a.key).toUpperCase(), n: a.part, a: a }; });
}

// A part's place, from its assignment ConfigID: { lessonKey, lessonConfigId,
// n, count, part, next } (next is the following part or null), or null for
// anything else. lessonConfigId is the whole lesson's (LessonSchedule's).
function partOfConfigId_(configId) {
  if (typeof LESSON_PARTS === "undefined") return null;
  const id = String(configId || "").trim().toUpperCase();
  const lessons = Object.keys(LESSON_PARTS);
  for (let i = 0; i < lessons.length; i++) {
    const parts = lessonPartsOf_(lessons[i]);
    for (let j = 0; j < parts.length; j++) {
      if (parts[j].configId === id) {
        return { lessonKey: lessons[i], lessonConfigId: "CAS-" + lessons[i].toUpperCase(), n: parts[j].n, count: parts.length, part: parts[j], next: parts[j + 1] || null };
      }
    }
  }
  return null;
}

// Whether a lesson runs in parts: it has parts, and no student has the
// whole lesson's own assignment (StudentAssignments), so a lesson already
// started as one doc is never split under the students.
function lessonUsesParts_(ss, lessonKey) {
  if (!lessonPartsOf_(lessonKey)) return false;
  _lpSaCache_ = null;
  const of = _lpAssignmentOf_(ss);
  const whole = "CAS-" + String(lessonKey).toUpperCase();
  return !Object.keys(of).some(function (sid) { return of[sid] === whole; });
}

// { studentConfigId: assignmentConfigId }, read from StudentAssignments
// directly (54 is not in the Teacher Dashboard).
let _lpSaCache_ = null;
function _lpAssignmentOf_(ss) {
  if (_lpSaCache_) return _lpSaCache_;
  const out = {};
  const sa = ss.getSheetByName("StudentAssignments");
  if (sa && sa.getLastRow() > 1) {
    sa.getRange(2, 1, sa.getLastRow() - 1, 3).getValues().forEach(function (r) {
      const sid = String(r[0] || "").trim(), aid = String(r[2] || "").trim();
      if (sid && aid) out[sid] = aid;
    });
  }
  _lpSaCache_ = out;
  return out;
}

// The latest outcome per competency on one student file, from
// CompetencyEvidence by header: { competencyId: "MET" | ... }.
function _lpLatestOutcomes_(evidence) {
  const byFile = {};
  if (!evidence || evidence.getLastRow() < 2) return byFile;
  const rows = evidence.getDataRange().getValues();
  const h = rows[0].map(function (x) { return String(x).trim(); });
  const iFile = h.indexOf("student_file_id"), iComp = h.indexOf("competency_id"),
    iOut = h.indexOf("outcome"), iAt = h.indexOf("evaluated_at"), iArch = h.indexOf("archive_status");
  if (iFile === -1 || iComp === -1 || iOut === -1 || iAt === -1) return byFile;
  rows.slice(1).forEach(function (r) {
    if (iArch !== -1 && String(r[iArch]).trim()) return;
    const file = String(r[iFile]).trim(), comp = String(r[iComp]).trim();
    if (!file || !comp) return;
    const at = sheetTimestampMs_(r[iAt]) || 0;
    const f = byFile[file] = byFile[file] || {};
    if (!f[comp] || at >= f[comp].at) f[comp] = { at: at, outcome: String(r[iOut]).trim().toUpperCase() };
  });
  return byFile;
}

// Shares one Ledger row's doc with its student and sets it ACTIVE (a
// release, 58). Returns true when done.
function _lpShare_(ledger, rowIndex, row) {
  DriveApp.getFileById(String(row[LEDGER.FILE_ID]).trim()).addEditor(String(row[LEDGER.GOOGLE_ID]).trim());
  ledger.getRange(rowIndex + 1, LEDGER.STATUS + 1).setValue("ACTIVE");
  return true;
}

function _lpLog_(ss, rows) {
  if (!rows.length) return;
  let sheet = ss.getSheetByName(LP_LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(LP_LOG_TAB);
    sheet.getRange(1, 1, 1, LP_LOG_HEADERS.length).setValues([LP_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LP_LOG_HEADERS.length).setValues(rows);
}

// The parts ready to unlock: a student's SCHEDULED part whose previous part's
// latest check found that part's primary MET. [{ rowIndex, row, studentConfigId,
// partConfigId }], with the Ledger rows read once.
function _lpReady_(ss, cfg) {
  _lpSaCache_ = null;
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (!ledger || ledger.getLastRow() < 2) return { ledger: ledger, ready: [] };
  const assignmentOf = _lpAssignmentOf_(ss);
  const outcomes = _lpLatestOutcomes_(ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence"));
  const data = ledger.getRange(1, 1, ledger.getLastRow(), LEDGER_COL_COUNT).getValues();
  // Each student's part rows: { "<googleId>|<lessonKey>": { n: { rowIndex, row, sid } } }.
  const byStudent = {};
  for (let i = 1; i < data.length; i++) {
    const sid = String(data[i][LEDGER.CONFIG_ID]).trim();
    const info = partOfConfigId_(assignmentOf[sid]);
    if (!info || String(data[i][LEDGER.STATUS]).trim() === "ARCHIVED") continue;
    const k = String(data[i][LEDGER.GOOGLE_ID]).trim().toLowerCase() + "|" + info.lessonKey;
    (byStudent[k] = byStudent[k] || {})[info.n] = { rowIndex: i, row: data[i], sid: sid, info: info };
  }
  const ready = [];
  Object.keys(byStudent).forEach(function (k) {
    const parts = byStudent[k];
    Object.keys(parts).forEach(function (n) {
      const cur = parts[n];
      if (!cur.info.next) return;
      const next = parts[Number(n) + 1];
      if (!next || String(next.row[LEDGER.STATUS]).trim() !== "SCHEDULED") return;
      const primary = cur.info.part.a.milestoneCompetencyIds[0];
      const o = (outcomes[String(cur.row[LEDGER.FILE_ID]).trim()] || {})[primary];
      if (o && o.outcome === "MET") {
        ready.push({ rowIndex: next.rowIndex, row: next.row, studentConfigId: next.sid, partConfigId: next.info.part.configId });
      }
    });
  });
  return { ledger: ledger, ready: ready };
}

// The Ledger cycle's job. Counts only in the log.
function unlockReadyParts() {
  requireScriptOwner_();
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const r = _lpReady_(ss, cfg);
  const log = [];
  let failed = 0;
  r.ready.forEach(function (x) {
    try {
      _lpShare_(r.ledger, x.rowIndex, x.row);
      log.push([new Date(), x.studentConfigId, x.partConfigId, "PRIMARY_MET"]);
    } catch (e) {
      failed++;
    }
  });
  _lpLog_(ss, log);
  if (log.length || failed) Logger.log("[S68] Parts unlocked: " + log.length + (failed ? ", " + failed + " failed" : "") + ".");
  return { unlocked: log.length, failed: failed };
}

function previewPartUnlocks() {
  requireScriptOwner_();
  const cfg = getConfig_();
  const r = _lpReady_(SpreadsheetApp.openById(cfg.ledgerSsId), cfg);
  Logger.log("[S68] Would unlock " + r.ready.length + " part(s) now.");
  return { wouldUnlock: r.ready.length };
}

// Puts unlockReadyParts in the Ledger cycle (64), or gives it its own
// 5-minute trigger when the cycle isn't installed. Safe to re-run.
function installPartUnlocks() {
  requireScriptOwner_();
  return lcInstallJob_(LP_JOB);
}

// The Teacher Dashboard's rows (07) for lessons in parts, one per student
// and lesson: the student's furthest open part stands for the lesson, with
// every part's state in `parts` and the next locked one in `nextPart` (null
// when none is left, or when no part is open yet: the lesson's release opens
// Part 1). A row is a part when it has `part` ({ n, count, title }); other
// rows pass through. The order is kept, each lesson where its first part was.
function foldPartRows_(students, now) {
  const groups = {};
  const out = [];
  students.forEach(function (s) {
    if (!s.part) { out.push(s); return; }
    const k = String(s.googleId).toLowerCase() + "|" + s.assignmentId;
    if (!groups[k]) { groups[k] = []; out.push(groups[k]); }
    groups[k].push(s);
  });
  return out.map(function (x) {
    if (!Array.isArray(x)) return x;
    x.sort(function (a, b) { return a.part.n - b.part.n; });
    const open = x.filter(function (s) { return s.status !== "SCHEDULED"; });
    const cur = open.length ? open[open.length - 1] : x[0];
    const next = open.length ? x.filter(function (s) { return s.status === "SCHEDULED" && s.part.n > cur.part.n; })[0] : null;
    const heldDays = next && LP_FAILED_CHECK_STATUSES.indexOf(cur.ledgerStatus) !== -1
      ? partHeldSchoolDays_(cur.submittedAtMs, now || new Date()) : 0;
    return Object.assign({}, cur, {
      // Held a school day or more by a failed check (see LP_FAILED_CHECK_STATUSES).
      heldByFailure: heldDays >= 1 ? { schoolDays: heldDays } : null,
      parts: x.map(function (s) {
        return { n: s.part.n, title: s.part.title, open: s.status !== "SCHEDULED", docUrl: s.status !== "SCHEDULED" ? s.docUrl : null };
      }),
      nextPart: next ? { n: next.part.n, title: next.part.title } : null
    });
  });
}

// The students whose furthest open part in a lesson is held a school day or
// more by a failed check (LP_FAILED_CHECK_STATUSES), next part still
// locked: { students, parts } counts for the overnight email (34c). Counts
// only, never who.
function partsHeldByFailure_(ss, cfg, now) {
  _lpSaCache_ = null;
  const out = { students: 0, parts: 0 };
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (!ledger || ledger.getLastRow() < 2) return out;
  const assignmentOf = _lpAssignmentOf_(ss);
  const data = ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER_COL_COUNT).getValues();
  const byStudent = {};
  data.forEach(function (r) {
    const info = partOfConfigId_(assignmentOf[String(r[LEDGER.CONFIG_ID]).trim()]);
    if (!info || String(r[LEDGER.STATUS]).trim() === "ARCHIVED") return;
    const k = String(r[LEDGER.GOOGLE_ID]).trim().toLowerCase() + "|" + info.lessonKey;
    (byStudent[k] = byStudent[k] || {})[info.n] = String(r[LEDGER.STATUS]).trim() === "SCHEDULED" ? null : r;
  });
  const who = {};
  Object.keys(byStudent).forEach(function (k) {
    const parts = byStudent[k];
    const open = Object.keys(parts).map(Number).filter(function (n) { return parts[n]; }).sort(function (a, b) { return a - b; });
    if (!open.length) return;
    const cur = open[open.length - 1];
    if (!(cur + 1 in parts) || parts[cur + 1] !== null) return;
    const r = parts[cur];
    if (LP_FAILED_CHECK_STATUSES.indexOf(String(r[LEDGER.STATUS]).trim()) === -1) return;
    if (partHeldSchoolDays_(sheetTimestampMs_(r[LEDGER.SUBMISSION_TS]), now) < 1) return;
    out.parts++;
    who[k.split("|")[0]] = true;
  });
  out.students = Object.keys(who).length;
  return out;
}

// The teacher's unlock: the earliest SCHEDULED part of a lesson for the
// student whose workspace is `studentConfigId` (any of their parts in it).
// Returns { success, unlocked: "Part 3" } or { success: false, error }.
function unlockNextPart_(cfg, studentConfigId, teacherEmail) {
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  _lpSaCache_ = null;
  const assignmentOf = _lpAssignmentOf_(ss);
  const info = partOfConfigId_(assignmentOf[String(studentConfigId || "").trim()]);
  if (!info) return { success: false, error: "That work isn't part of a lesson in parts." };
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  const data = ledger.getRange(1, 1, ledger.getLastRow(), LEDGER_COL_COUNT).getValues();
  const me = data.filter(function (r) { return String(r[LEDGER.CONFIG_ID]).trim() === String(studentConfigId).trim(); })[0];
  if (!me) return { success: false, error: "No Ledger row for that work." };
  if (String(me[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() !== String(teacherEmail || "").trim().toLowerCase()) {
    return { success: false, error: "Not your student." };
  }
  const student = String(me[LEDGER.GOOGLE_ID]).trim().toLowerCase();
  let best = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][LEDGER.GOOGLE_ID]).trim().toLowerCase() !== student) continue;
    if (String(data[i][LEDGER.STATUS]).trim() !== "SCHEDULED") continue;
    const p = partOfConfigId_(assignmentOf[String(data[i][LEDGER.CONFIG_ID]).trim()]);
    if (!p || p.lessonKey !== info.lessonKey) continue;
    if (!best || p.n < best.p.n) best = { i: i, p: p };
  }
  if (!best) return { success: false, error: "Every part of this lesson is already open for this student." };
  _lpShare_(ledger, best.i, data[best.i]);
  _lpLog_(ss, [[new Date(), String(data[best.i][LEDGER.CONFIG_ID]).trim(), best.p.part.configId, "TEACHER"]]);
  return { success: true, unlocked: "Part " + best.p.n };
}
