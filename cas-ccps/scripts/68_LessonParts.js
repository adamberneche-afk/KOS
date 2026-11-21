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
//   unlockReadyParts()       the Ledger cycle's job (every minute; 5 before 2026-11-14)
//   installPartUnlocks()     puts it in the cycle: in 64_LedgerCycle.js
//                            (Central Ledger only) since 2026-11-07, beside
//                            the cycle's other installers, because this file
//                            is in the Teacher Dashboard project too
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
  return parts.map(function (a) { return { key: a.key, configId: casConfigId_(a.key), n: a.part, a: a }; });
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
        return { lessonKey: lessons[i], lessonConfigId: casConfigId_(lessons[i]), n: parts[j].n, count: parts.length, part: parts[j], next: parts[j + 1] || null };
      }
    }
  }
  return null;
}

// What intake (02) makes for an assignment ConfigID (Phase 4a, 2026-11-08;
// Slides, 4c): { type: "form" | "slides", templateKey } for a part marked
// that workType in PARTS.json (55b's workFileNow), else { type: "doc" }.
// templateKey names the Script Property holding the template file's ID.
function partWorkFile_(assignmentConfigId) {
  const info = partOfConfigId_(assignmentConfigId);
  const a = info ? info.part.a : null;
  if (a && workFileHasSnapshot_(a.workFileNow)) return { type: a.workFileNow, templateKey: String(a.workTemplateKey || "") };
  return { type: "doc" };
}

// A form part's exact checks at Submit (Phase 4b): its formChecks in
// PARTS.json (55b), with the defaults filled in (00's normalizeFormChecks_:
// at least one question, email collection off).
function partFormChecks_(assignmentConfigId) {
  const info = partOfConfigId_(assignmentConfigId);
  return normalizeFormChecks_(info && info.part.a.formChecks ? info.part.a.formChecks : {});
}

// A part's exact checks for its type (Phase 4c/4d): a Slides part's
// slideChecks (00's normalizeSlideChecks_), a Sheets part's sheetChecks
// (normalizeSheetChecks_), else a form's (above). Intake
// (02) records them in FormSnapshots, which is where the Student Dashboard
// reads them.
function partWorkChecks_(assignmentConfigId) {
  const info = partOfConfigId_(assignmentConfigId);
  if (info && info.part.a.workFileNow === "slides") return normalizeSlideChecks_(info.part.a.slideChecks || {});
  if (info && info.part.a.workFileNow === "sheet") return normalizeSheetChecks_(info.part.a.sheetChecks || {});
  return partFormChecks_(assignmentConfigId);
}

// Shares a form, deck or sheet copy's snapshot doc (its feedback page, Phase
// 4b/4c) with its student as commenter: they read the file as checked and
// the feedback, and can't change what was judged. Best effort: false when
// there is none or sharing fails (the Ledger's own share has already happened).
function shareFormSnapshot_(ledgerSs, formFileId, googleId) {
  try {
    const snap = formSnapshotFor_(ledgerSs, formFileId);
    if (!snap || !String(googleId || "").trim()) return false;
    DriveApp.getFileById(snap.snapshotDocId).addCommenter(String(googleId).trim());
    return true;
  } catch (e) {
    Logger.log("[S68] Form snapshot not shared: " + e.message);
    return false;
  }
}

// Whether a lesson runs in parts: it has parts, and no student has the
// whole lesson's own assignment (StudentAssignments), so a lesson already
// started as one doc is never split under the students.
function lessonUsesParts_(ss, lessonKey) {
  if (!lessonPartsOf_(lessonKey)) return false;
  _lpSaCache_ = null;
  const of = _lpAssignmentOf_(ss);
  const whole = casConfigId_(lessonKey);
  return !Object.keys(of).some(function (sid) { return of[sid] === whole; });
}

// { studentConfigId: assignmentConfigId }, read from StudentAssignments
// directly (54 is not in the Teacher Dashboard).
let _lpSaCache_ = null;
function _lpAssignmentOf_(ss) {
  if (_lpSaCache_) return _lpSaCache_;
  const out = {};
  const sa = ss.getSheetByName(TABS.studentAssignments);
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
    const file = String(r[iFile]).trim(), comp = competencyIdText_(r[iComp]);
    if (!file || !comp) return;
    const at = sheetTimestampMs_(r[iAt]) || 0;
    const f = byFile[file] = byFile[file] || {};
    if (!f[comp] || at >= f[comp].at) f[comp] = { at: at, outcome: String(r[iOut]).trim().toUpperCase() };
  });
  return byFile;
}

// Shares one Ledger row's work file (a doc, or a part's form, deck or sheet: Drive
// shares them the same way) with its student and sets it ACTIVE (a release, 58).
// Returns true when done.
function _lpShare_(ledger, rowIndex, row) {
  DriveApp.getFileById(String(row[LEDGER.FILE_ID]).trim()).addEditor(String(row[LEDGER.GOOGLE_ID]).trim());
  // A form, Slides or Sheets part's feedback page goes with it (Phase 4b/4c/4d).
  if (workFileHasSnapshot_(workFileTypeOfUrl_(row[LEDGER.ADMIN_FILE_URL]))) {
    shareFormSnapshot_(ledger.getParent(), String(row[LEDGER.FILE_ID]).trim(), String(row[LEDGER.GOOGLE_ID]).trim());
  }
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
  const outcomes = _lpLatestOutcomes_(ss.getSheetByName(TABS.competencyEvidence));
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

// The Ledger cycle's check (64's LC_GATES, 2026-11-15): unlockReadyParts
// has work only while a Ledger row is SCHEDULED (a locked part), and then
// only if something it reads changed since a run that unlocked nothing: the
// Ledger's Status column (a hash), and the row counts of CompetencyEvidence
// (where a MET arrives) and StudentAssignments. The cycle keeps that
// signature only after a run that unlocked and failed nothing. An edit by
// hand inside an evidence or assignment row changes no count; the cycle's
// backstop (every 15 minutes, without checks) catches it.
function partUnlocksHaveWork_(ctx) {
  const cfg = ctx.cfg();
  const status = ctx.rows("ledger", cfg.tabs.ledger, LEDGER.STATUS + 1, 1);
  if (status === null) return false; // no Ledger tab: the job finds nothing
  if (!status.some(function (r) { return String(r[0]).trim() === "SCHEDULED"; })) return false;
  const sig = [status.length, ctx.digest(status),
    ctx.lastRow("ledger", TABS.competencyEvidence),
    ctx.lastRow("ledger", TABS.studentAssignments)].join(":");
  if (ctx.remembered("unlockReadyParts") === sig) return false;
  ctx.offer("unlockReadyParts", sig);
  return true;
}

// ---------------------------------------------------------------------------
// explainLockedParts — why each locked part is still locked (2026-11-16,
// after a student earned a turn-in code on Part 1 and Part 2 stayed shut).
// A turn-in code is earned on any feedback, Revise included (71: the
// question asks what the student will change), while a part opens only when
// the latest check of the part before it found that part's primary
// competency MET. So a code on Part 1 doesn't open Part 2. For each
// student's next locked part (a SCHEDULED part whose previous part is open),
// one reason:
//   READY                    the primary is MET: unlockReadyParts() would open
//                            it now (if it stays, the cycle's job isn't running)
//   PRIMARY_NOT_MET          the latest check found it PARTIALLY_MET or NOT_MET
//                            (and says when an earlier check found it MET, and
//                            when the latest is the 11-15 re-grade's)
//   PRIMARY_NOT_IN_EVIDENCE  checked, but no evidence row for the primary's ID
//                            (an ID mismatch between the lesson and the matrix)
//   PREVIOUS_CHECK_FAILED    the previous part's last check ended in an error
//   PREVIOUS_NOT_CHECKED     no check of the previous part yet
//   NO_ROW                   the student's last open part has a next part in
//                            PARTS.json but no Ledger row for it, so nothing
//                            can unlock it (a part added after the lesson went
//                            out, 2026-11-17): applyLessonPartsCatchUp (58)
//                            makes it. Its row is the open part's; latest is
//                            that part's primary outcome.
// and whether the student holds a turn-in code for the previous part. Reads
// only. Logs Ledger row numbers, lesson keys, part numbers and competency
// IDs: no name, email or file ID. The teacher opens a part by hand from the
// Teacher Dashboard ("Open Part n now").
// ---------------------------------------------------------------------------
const LP_REGRADE_FROM = "2026-11-15T14:30:00-05:00";
const LP_REGRADE_TO = "2026-11-15T14:50:00-05:00";

function explainLockedParts() {
  requireScriptOwner_();
  const cfg = getConfig_();
  const res = lockedPartReasons_(SpreadsheetApp.openById(cfg.ledgerSsId), cfg);
  const counts = {};
  res.items.forEach(function (x) { counts[x.reason] = (counts[x.reason] || 0) + 1; });
  Logger.log("[S68] Locked parts next in line: " + res.items.length + " (" +
    (Object.keys(counts).map(function (k) { return k + " " + counts[k]; }).join(", ") || "none") +
    "); locked behind another locked part: " + res.behind + ".");
  res.items.forEach(function (x) {
    Logger.log("  Ledger row " + x.row + " (" + x.lessonKey + ", Part " + x.n + "): " + x.reason +
      (x.latest ? " (latest: " + x.latest + ")" : "") +
      (x.everMet ? "; an earlier check found it MET" : "") +
      (x.latestInRegrade ? "; the latest check is the 11-15 re-grade's" : "") +
      (x.reason === "PRIMARY_NOT_IN_EVIDENCE" ? "; expected " + x.primary + ", found " + (x.seen.join(", ") || "none") : "") +
      (x.reason === "NO_ROW" ? "; no Ledger row for Part " + x.n + ": run applyLessonPartsCatchUp('" + x.lessonKey + "')" : "") +
      (x.prevHasCode ? "; holds a turn-in code for Part " + (x.n - 1) : ""));
  });
  return res;
}

// { items: [{ row, lessonKey, n, reason, primary, latest, everMet,
//   latestInRegrade, seen, prevHasCode }], behind }.
function lockedPartReasons_(ss, cfg) {
  _lpSaCache_ = null;
  const out = { items: [], behind: 0 };
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (!ledger || ledger.getLastRow() < 2) return out;
  const assignmentOf = _lpAssignmentOf_(ss);
  const history = _lpEvidenceHistory_(ss.getSheetByName(TABS.competencyEvidence));
  const coded = _lpCodedStudentIds_(ss);
  const fromMs = Date.parse(LP_REGRADE_FROM), toMs = Date.parse(LP_REGRADE_TO);
  const data = ledger.getRange(1, 1, ledger.getLastRow(), LEDGER_COL_COUNT).getValues();
  const byStudent = {};
  for (let i = 1; i < data.length; i++) {
    const sid = String(data[i][LEDGER.CONFIG_ID]).trim();
    const info = partOfConfigId_(assignmentOf[sid]);
    if (!info || String(data[i][LEDGER.STATUS]).trim() === "ARCHIVED") continue;
    const k = String(data[i][LEDGER.GOOGLE_ID]).trim().toLowerCase() + "|" + info.lessonKey;
    (byStudent[k] = byStudent[k] || {})[info.n] = { rowIndex: i, row: data[i], sid: sid, info: info };
  }
  Object.keys(byStudent).forEach(function (k) {
    const parts = byStudent[k];
    Object.keys(parts).forEach(function (n) {
      const cur = parts[n];
      if (String(cur.row[LEDGER.STATUS]).trim() !== "SCHEDULED") {
        // An open part whose next part was never made for this student.
        if (cur.info.next && !parts[Number(n) + 1]) {
          const p = cur.info.part.a.milestoneCompetencyIds[0];
          const c = (history[String(cur.row[LEDGER.FILE_ID]).trim()] || {})[p];
          out.items.push({ row: cur.rowIndex + 1, lessonKey: cur.info.lessonKey, n: Number(n) + 1, reason: "NO_ROW",
            primary: p, latest: c && c.length ? c[c.length - 1].outcome : "", everMet: false, latestInRegrade: false,
            seen: [], prevHasCode: !!coded[cur.sid] });
        }
        return;
      }
      const prev = parts[Number(n) - 1];
      if (!prev) return; // Part 1 opens with the lesson's release
      if (String(prev.row[LEDGER.STATUS]).trim() === "SCHEDULED") { out.behind++; return; }
      const primary = prev.info.part.a.milestoneCompetencyIds[0];
      const file = String(prev.row[LEDGER.FILE_ID]).trim();
      const ev = history[file] || {};
      const item = { row: cur.rowIndex + 1, lessonKey: cur.info.lessonKey, n: Number(n), reason: "", primary: primary,
        latest: "", everMet: false, latestInRegrade: false, seen: Object.keys(ev).sort(), prevHasCode: !!coded[prev.sid] };
      const checks = ev[primary];
      if (checks && checks.length) {
        const last = checks[checks.length - 1];
        item.latest = last.outcome;
        item.everMet = checks.slice(0, -1).some(function (c) { return c.outcome === "MET"; });
        item.latestInRegrade = last.at >= fromMs && last.at <= toMs;
        item.reason = last.outcome === "MET" ? "READY" : "PRIMARY_NOT_MET";
      } else if (item.seen.length) {
        item.reason = "PRIMARY_NOT_IN_EVIDENCE";
      } else if (LP_FAILED_CHECK_STATUSES.indexOf(String(prev.row[LEDGER.STATUS]).trim()) !== -1) {
        item.reason = "PREVIOUS_CHECK_FAILED";
      } else {
        item.reason = "PREVIOUS_NOT_CHECKED";
      }
      out.items.push(item);
    });
  });
  out.items.sort(function (a, b) { return a.row - b.row; });
  return out;
}

// Every unarchived check per file and competency, oldest first:
// { file: { competencyId: [{ at, outcome }] } }.
function _lpEvidenceHistory_(evidence) {
  const out = {};
  if (!evidence || evidence.getLastRow() < 2) return out;
  const rows = evidence.getDataRange().getValues();
  const h = rows[0].map(function (x) { return String(x).trim(); });
  const iFile = h.indexOf("student_file_id"), iComp = h.indexOf("competency_id"),
    iOut = h.indexOf("outcome"), iAt = h.indexOf("evaluated_at"), iArch = h.indexOf("archive_status");
  if (iFile === -1 || iComp === -1 || iOut === -1 || iAt === -1) return out;
  rows.slice(1).forEach(function (r) {
    if (iArch !== -1 && String(r[iArch]).trim()) return;
    const file = String(r[iFile]).trim(), comp = competencyIdText_(r[iComp]);
    if (!file || !comp) return;
    const f = out[file] = out[file] || {};
    (f[comp] = f[comp] || []).push({ at: sheetTimestampMs_(r[iAt]) || 0, outcome: String(r[iOut]).trim().toUpperCase() });
  });
  Object.keys(out).forEach(function (file) {
    Object.keys(out[file]).forEach(function (c) { out[file][c].sort(function (a, b) { return a.at - b.at; }); });
  });
  return out;
}

// { studentConfigId: true } for each part a turn-in code was issued for
// (71's TurnInCodes, read by header; this file is in the Teacher Dashboard
// project too, which doesn't hold 71).
function _lpCodedStudentIds_(ss) {
  const out = {};
  const sheet = ss.getSheetByName("TurnInCodes");
  if (!sheet || sheet.getLastRow() < 2) return out;
  const rows = sheet.getDataRange().getValues();
  const i = rows[0].map(function (x) { return String(x).trim(); }).indexOf("StudentConfigID");
  if (i === -1) return out;
  rows.slice(1).forEach(function (r) { const id = String(r[i]).trim(); if (id) out[id] = true; });
  return out;
}

function previewPartUnlocks() {
  requireScriptOwner_();
  const cfg = getConfig_();
  const r = _lpReady_(SpreadsheetApp.openById(cfg.ledgerSsId), cfg);
  Logger.log("[S68] Would unlock " + r.ready.length + " part(s) now.");
  return { wouldUnlock: r.ready.length };
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
        return { n: s.part.n, title: s.part.title, open: s.status !== "SCHEDULED", docUrl: s.status !== "SCHEDULED" ? s.docUrl : null,
          workType: s.workType || "doc" };
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
