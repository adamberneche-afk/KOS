// =============================================================================
// FILE: 69c_LessonReport.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
// PURPOSE: The lesson report: one row per lesson, counts only, flagging lessons that look unclear, too easy or hard to reach.
// TRIGGERS: none. Run buildLessonReport() from the editor; it rewrites the
//           LessonReport tab and logs the flags.
//
// TURN-IN STAGE 5 (meta/TURN_IN_CODE_PLAN_2026-11.md, "The lesson report";
// built 2026-11-20 at the operator's go): one row per lesson, counts only,
// for the lesson flywheel. Three patterns, each a reason to look at the
// lesson, never a verdict on it:
//
//   A  UNCLEAR   many turn-in codes, few first goals met even after revising:
//                task or rubric unclear, too hard, or off its milestone
//   B  TOO EASY  first goals met on the first check, thin reflections: too
//                easy, or pasteable (the zero-shot column says which)
//   C  FRICTION  few submissions (and few codes, where codes were on):
//                access or friction, not learning
//
// A pattern is FLAGGED only when it holds in at least two sections (Ledger
// periods) of at least LR_MIN_N students each; the report says where it
// held either way. (The plan's other route, two runs of the lesson, needs a
// second school year.) Every figure carries its count, and each lesson its
// first and last check dates, so a short week isn't read as a weak lesson.
//
// THE FIRST GOAL is the lesson's (or part's) first milestone's competency,
// the one that opens the next part. A lesson in parts counts each part's
// file on its own. Codes count only for a lesson whose checks ran after the
// first code was issued ("codes on").
//
// Sources, read once: the Ledger (current school year: file, period,
// account), StudentAssignments (54: workspace to assignment), 55b/68 (the
// lesson and part data), CompetencyEvidence (each check's outcomes),
// ReflectionLog (word counts only), TurnInCodes (71) and ZeroShotResults
// (39d). Fixture rows never match a lesson. Writes lesson keys and counts:
// no names, accounts, IDs or student text.
// =============================================================================

const LR_TAB = "LessonReport";
const LR_MIN_N = 5;                 // students a section needs to count
const LR_MIN_SECTIONS = 2;          // sections a pattern must hold in to be flagged
const LR_A_CODES = 0.6;             // A: codes / students who submitted, at least
const LR_A_EVER_MET = 0.5;          // A: files whose first goal was ever MET, below
const LR_B_FIRST_MET = 0.8;         // B: files whose first check met the first goal, at least
const LR_B_THIN_WORDS = 12;         // B: median reflection words, below
const LR_C_SUBMITTED = 0.5;         // C: students who submitted / assigned, below
const LR_C_CODES = 0.3;             // C: codes / assigned, below (where codes were on)
const LR_HEADERS = ["Course", "LessonKey", "Lesson", "FirstCheck", "LastCheck", "Assigned", "Submitted",
  "FilesChecked", "FirstTryMet", "EverMet", "Reflections", "MedianWords", "Codes", "Sections",
  "Flagged", "HeldIn", "ZeroShot"];

// "CAS-8175-L24-P2" -> { key: "8175-L24", part: 2 }, or null.
function lrLessonOf_(assignmentId) {
  if (typeof LESSON_ASSIGNMENTS !== "object") return null;
  const id = parseCasId_(assignmentId);
  if (!id) return null;
  const want = id.lessonKey.toLowerCase();
  const key = Object.keys(LESSON_ASSIGNMENTS).filter(function (k) { return k.toLowerCase() === want; })[0];
  return key ? { key: key, part: id.part } : null;
}

// The first goal's competency for a lesson or one of its parts.
function lrFirstGoal_(key, part) {
  let a = LESSON_ASSIGNMENTS[key];
  if (part && typeof LESSON_PARTS === "object" && LESSON_PARTS[key]) {
    a = LESSON_PARTS[key].filter(function (p) { return Number(p.part) === part; })[0] || a;
  }
  return a && a.milestoneCompetencyIds ? String(a.milestoneCompetencyIds[0] || "").trim() : "";
}

function lrWords_(text) {
  const t = String(text || "").trim();
  return t ? t.split(/\s+/).length : 0;
}

function lrMedian_(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort(function (a, b) { return a - b; });
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The report, from plain rows (testable without a spreadsheet).
 * inp: {
 *   files:       [{ fileId, configId, account, period }]     the Ledger, this year
 *   assignments: { studentConfigId: assignmentConfigId }     StudentAssignments
 *   evidence:    [{ fileId, competencyId, outcome, at }]     CompetencyEvidence (ms)
 *   reflections: [{ fileId, words }]                         ReflectionLog
 *   codes:       [{ account, assignmentId, at }]             TurnInCodes (ms)
 *   zeroShot:    { lessonKey: { stamp, firstMet } }          ZeroShotResults
 * }
 * Returns [{ key, course, ... per LR_HEADERS, flags: [..], heldIn: {A:[..]} }].
 */
function lessonReportRows_(inp) {
  const codesFrom = inp.codes.reduce(function (m, c) { return Math.min(m, c.at || Infinity); }, Infinity);
  const L = {};
  const lessonOf = function (key) {
    return L[key] || (L[key] = { key: key, assigned: {}, submitted: {}, files: {}, words: [], codes: {},
      first: Infinity, last: -Infinity, periods: {} });
  };
  const per = function (l, period) {
    return l.periods[period] || (l.periods[period] = { assigned: {}, submitted: {}, files: 0, firstMet: 0, everMet: 0,
      words: [], codes: {} });
  };
  const fileInfo = {};
  inp.files.forEach(function (f) {
    const where = lrLessonOf_(inp.assignments[f.configId]);
    if (!where) return;
    const l = lessonOf(where.key);
    const period = String(f.period || "").trim() || "?";
    l.assigned[f.account] = true;
    per(l, period).assigned[f.account] = true;
    fileInfo[f.fileId] = { key: where.key, part: where.part, account: f.account, period: period,
      goal: lrFirstGoal_(where.key, where.part) };
  });
  // Each file's checks, in time order: the first goal's outcome at each.
  const checks = {};
  inp.evidence.forEach(function (e) {
    const fi = fileInfo[e.fileId];
    if (!fi || String(e.competencyId).trim() !== fi.goal) return;
    (checks[e.fileId] = checks[e.fileId] || []).push(e);
  });
  Object.keys(checks).forEach(function (fileId) {
    const fi = fileInfo[fileId], l = L[fi.key], p = per(l, fi.period);
    const list = checks[fileId].sort(function (a, b) { return a.at - b.at; });
    const firstMet = String(list[0].outcome).toUpperCase() === "MET";
    const everMet = list.some(function (e) { return String(e.outcome).toUpperCase() === "MET"; });
    l.files[fileId] = { firstMet: firstMet, everMet: everMet };
    l.submitted[fi.account] = true;
    p.submitted[fi.account] = true;
    p.files++;
    if (firstMet) p.firstMet++;
    if (everMet) p.everMet++;
    l.first = Math.min(l.first, list[0].at);
    l.last = Math.max(l.last, list[list.length - 1].at);
  });
  inp.reflections.forEach(function (r) {
    const fi = fileInfo[r.fileId];
    if (!fi) return;
    L[fi.key].words.push(r.words);
    per(L[fi.key], fi.period).words.push(r.words);
  });
  const periodOf = {};
  Object.keys(fileInfo).forEach(function (id) {
    const fi = fileInfo[id];
    periodOf[fi.key + "|" + fi.account] = fi.period;
  });
  inp.codes.forEach(function (c) {
    const where = lrLessonOf_(c.assignmentId);
    if (!where || !L[where.key]) return;
    const l = L[where.key];
    l.codes[c.account] = true;
    const period = periodOf[where.key + "|" + c.account];
    if (period) per(l, period).codes[c.account] = true;
  });

  return Object.keys(L).sort().map(function (key) {
    const l = L[key];
    const n = function (o) { return Object.keys(o).length; };
    const files = Object.keys(l.files).map(function (id) { return l.files[id]; });
    const codesOn = l.last >= codesFrom;
    const heldIn = { A: [], B: [], C: [] };
    let sections = 0;
    Object.keys(l.periods).sort().forEach(function (period) {
      const p = l.periods[period];
      const assigned = n(p.assigned), submitted = n(p.submitted), codes = n(p.codes);
      if (assigned < LR_MIN_N) return;
      sections++;
      const med = lrMedian_(p.words);
      if (codesOn && submitted >= LR_MIN_N && p.files && codes / submitted >= LR_A_CODES && p.everMet / p.files < LR_A_EVER_MET) heldIn.A.push(period);
      if (p.files >= LR_MIN_N && p.firstMet / p.files >= LR_B_FIRST_MET && med !== null && med < LR_B_THIN_WORDS) heldIn.B.push(period);
      if (submitted / assigned < LR_C_SUBMITTED && (!codesOn || codes / assigned < LR_C_CODES)) heldIn.C.push(period);
    });
    const flags = ["A", "B", "C"].filter(function (k) { return heldIn[k].length >= LR_MIN_SECTIONS; });
    const zs = inp.zeroShot[key];
    const a = LESSON_ASSIGNMENTS[key];
    return {
      key: key, course: String(a.code || key.split("-")[0]), name: a.unitName,
      first: isFinite(l.first) ? new Date(l.first) : "", last: isFinite(l.last) ? new Date(l.last) : "",
      assigned: n(l.assigned), submitted: n(l.submitted), files: files.length,
      firstMet: files.filter(function (f) { return f.firstMet; }).length,
      everMet: files.filter(function (f) { return f.everMet; }).length,
      reflections: l.words.length, medianWords: lrMedian_(l.words),
      codes: codesOn ? n(l.codes) : null, sections: sections, flags: flags, heldIn: heldIn,
      zeroShot: zs ? (zs.stamp === "APPROVED" ? "PASSED cold" : zs.firstMet ? "first goal met cold" : "not passed cold") : "",
    };
  });
}

// "12 of 20 (60%)", or "—" with nothing to count.
function lrOf_(x, of) {
  return of ? x + " of " + of + " (" + Math.round(100 * x / of) + "%)" : "—";
}

function lrSheetRow_(r) {
  const held = ["A", "B", "C"].filter(function (k) { return r.heldIn[k].length; })
    .map(function (k) { return k + ": P" + r.heldIn[k].join(", P"); }).join("; ");
  return [r.course, r.key, r.name, r.first, r.last, r.assigned, lrOf_(r.submitted, r.assigned),
    r.files, lrOf_(r.firstMet, r.files), lrOf_(r.everMet, r.files), r.reflections,
    r.medianWords === null ? "—" : r.medianWords, r.codes === null ? "codes off" : lrOf_(r.codes, r.submitted),
    r.sections, r.flags.join(", "), held, r.zeroShot];
}

// The inputs, read from the Ledger's tabs.
function _lrReadInputs_(ss, cfg) {
  const year = _currentSchoolYear_();
  const files = [];
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (ledger && ledger.getLastRow() > 1) {
    ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER.ACADEMIC_YEAR + 1).getValues().forEach(function (r) {
      if (!_isCurrentSchoolYearRow_(r, year)) return;
      const fileId = String(r[LEDGER.FILE_ID] || "").trim(), configId = String(r[LEDGER.CONFIG_ID] || "").trim();
      if (!fileId || !configId) return;
      files.push({ fileId: fileId, configId: configId, period: String(r[LEDGER.PERIOD] || "").trim(),
        account: String(r[LEDGER.GOOGLE_ID] || "").trim().toLowerCase() });
    });
  }
  const assignments = readStudentAssignments_(ss).byStudent;
  const evidence = [];
  const ev = ss.getSheetByName(TABS.competencyEvidence);
  if (ev && ev.getLastRow() > 1) {
    const data = ev.getDataRange().getValues();
    const h = data[0].map(function (x) { return String(x).trim(); });
    const iFile = h.indexOf("student_file_id"), iComp = h.indexOf("competency_id"), iOut = h.indexOf("outcome"),
      iAt = h.indexOf("evaluated_at"), iArch = h.indexOf("archive_status");
    if (iFile !== -1 && iComp !== -1 && iOut !== -1 && iAt !== -1) {
      data.slice(1).forEach(function (r) {
        if (iArch !== -1 && String(r[iArch] || "").trim()) return;
        evidence.push({ fileId: String(r[iFile]).trim(), competencyId: competencyIdText_(r[iComp]),
          outcome: String(r[iOut]).trim(), at: sheetTimestampMs_(r[iAt]) || 0 });
      });
    }
  }
  const reflections = [];
  const rl = ss.getSheetByName(TABS.reflectionLog);
  if (rl && rl.getLastRow() > 1) {
    rl.getRange(2, 1, rl.getLastRow() - 1, REFLECTION_LOG_HEADERS.length).getValues().forEach(function (r) {
      reflections.push({ fileId: String(r[RL.FILE_ID]).trim(), words: lrWords_(r[RL.ANSWER]) });
    });
  }
  const codes = [];
  const tc = ss.getSheetByName(TURN_IN_CODES_TAB);
  if (tc && tc.getLastRow() > 1) {
    tc.getRange(2, 1, tc.getLastRow() - 1, TURN_IN_CODE_HEADERS.length).getValues().forEach(function (r) {
      codes.push({ account: String(r[TCODE.GOOGLE_ID]).trim().toLowerCase(),
        assignmentId: String(r[TCODE.ASSIGNMENT_ID]).trim(), at: sheetTimestampMs_(r[TCODE.ISSUED_AT]) || 0 });
    });
  }
  return { files: files, assignments: assignments, evidence: evidence, reflections: reflections, codes: codes,
    zeroShot: zeroShotByLesson_(ss) };
}

/**
 * Rewrites the LessonReport tab, one row per lesson with a student
 * workspace this school year, and logs the flagged ones. Counts only.
 */
function buildLessonReport() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const rows = lessonReportRows_(_lrReadInputs_(ss, cfg));
  let sh = ss.getSheetByName(LR_TAB);
  if (!sh) sh = ss.insertSheet(LR_TAB);
  sh.clearContents();
  sh.getRange(1, 1, 1, LR_HEADERS.length).setValues([LR_HEADERS]).setFontWeight("bold");
  sh.setFrozenRows(1);
  if (rows.length) sh.getRange(2, 1, rows.length, LR_HEADERS.length).setValues(rows.map(lrSheetRow_));
  const names = { A: "unclear or too hard", B: "too easy or pasteable", C: "friction or access" };
  const flagged = rows.filter(function (r) { return r.flags.length; });
  Logger.log("[LessonReport] " + rows.length + " lesson(s) with students this year; " + flagged.length +
    " flagged (a pattern in at least " + LR_MIN_SECTIONS + " sections of " + LR_MIN_N + "+ students). The LessonReport tab has the numbers.");
  flagged.forEach(function (r) {
    Logger.log("[LessonReport] " + r.key + ": " + r.flags.map(function (k) { return names[k]; }).join("; ") +
      (r.zeroShot ? " (zero-shot: " + r.zeroShot + ")" : ""));
  });
  const one = rows.filter(function (r) { return !r.flags.length && (r.heldIn.A.length || r.heldIn.B.length || r.heldIn.C.length); });
  if (one.length) Logger.log("[LessonReport] Held in one section only, not flagged: " + one.map(function (r) { return r.key; }).join(", ") + ".");
  return { lessons: rows.length, flagged: flagged.length };
}
