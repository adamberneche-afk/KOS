/**
 * ================================================================
 * 53_AssignmentSeeder.js — CAS-CCPS
 * BOUND TO: Central Ledger (cas-ccps:central-ledger)
 * ================================================================
 *
 * Writes LIVE TeacherMatrix assignments straight from the repo's unit
 * rubrics (53b_UnitAssignmentData.js, generated with
 * curriculum/unit-rubrics/), without Studio Flow 1. Seen live 2026-10-06:
 * the only RubricQueue row (2026-09-02) was still PENDING_EXTRACTION, that
 * day's rubric submission never reached the queue, and the registered
 * Teacher Matrix had no TeacherMatrix tab, so no assignment could go LIVE
 * and the roster import had no Config ID.
 *
 *   previewAssignmentSeed()  lists what would be written. Changes nothing.
 *   previewAssignmentRefresh() / refreshAssignments()  bring rows already in
 *                            the TeacherMatrix up to the repo's criteria.
 *   seedAssignments()        writes them: one LIVE row per unit and course,
 *                            with its prompt-template Doc, in the matrix
 *                            MatrixRegistry names for this teacher (adding
 *                            the TeacherMatrix tab if it is missing).
 *
 * Which units: the Script Property SEED_UNITS ("S1-U1", or the teacher's
 * lessons by key, "8175-L06,8177-employee-handbook-operations"), else each
 * course's assignment for today plus any lesson LessonSchedule (55) starts in
 * the next 7 days. A lesson's Config ID is "CAS-8175-L06" (lessonConfigId_). A unit and course already in
 * the TeacherMatrix is never written again. Config IDs are "CAS-<unit>-<code>"
 * (CAS-S1-U1-8175), so each one is the same in every run.
 *
 * FERPA: teacher-level only. Nothing here reads or writes student data.
 */

const AS_TAB_HEADERS = [
  "ConfigID", "UnitName", "Tier", "Persona",
  "Milestone1", "Milestone2", "Milestone3", "Milestone4",
  "DefinitionOfDone", "InstructorEmail", "Created", "Status",
  "PromptTemplateID", "Subject", "CourseName",
  "Milestone1CompetencyId", "Milestone2CompetencyId",
  "Milestone3CompetencyId", "Milestone4CompetencyId", "LessonUnitId",
  // The assignment's learning objectives, as JSON { competencyId: "I can …" }
  // (2026-10-24): the Student Dashboard's reflection questions quote them
  // (00, reflectionMatrixRow_). Appended last, so no reader's column moves.
  "StudentObjectives"
];

function previewAssignmentSeed() {
  return seedAssignments_({ apply: false });
}

function seedAssignments() {
  return seedAssignments_({ apply: true });
}

/** "CAS-S1-U1-8175": text, so Sheets keeps it as written. */
function assignmentConfigId_(unitId, code) {
  return "CAS-" + unitId + "-" + code;
}

/**
 * @param {{apply?: boolean, today?: Date, units?: string[]}} opts
 * @returns {{apply, planned: Object[], skipped: Object[], written: number, message: string}}
 */
function seedAssignments_(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const result = { apply: apply, planned: [], skipped: [], written: 0, message: "" };

  const matrix = _asTeacherMatrix_(ss, cfg);
  if (!matrix.ss) {
    result.message = "No Teacher Matrix in MatrixRegistry for this teacher. Nothing seeded.";
    Logger.log("[S53] " + result.message);
    return result;
  }

  const units = _asUnits_(opts);
  const sheet = matrix.ss.getSheetByName("TeacherMatrix");
  const existing = {};
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues().forEach(r => {
      existing[String(r[0]).trim()] = String(r[11]).trim();
    });
  }

  ["8175", "8177"].forEach(code => {
    units[code].forEach(unitId => {
      const found = _asAssignment_(unitId, code);
      if (found === "OTHER_COURSE") return;
      const configId = found ? found.configId : assignmentConfigId_(unitId, code);
      if (!found) { result.skipped.push({ configId: configId, reason: "NOT_IN_COURSE" }); return; }
      if (existing[configId]) {
        result.skipped.push({ configId: configId, reason: "ALREADY_IN_MATRIX (" + existing[configId] + ")" });
        return;
      }
      const a = found.a;
      result.planned.push({ a: a, configId: configId, unitName: a.unitName, courseName: a.courseName,
        competencies: a.milestoneCompetencyIds.filter(Boolean).join(", ") });
    });
  });

  if (apply && result.planned.length) {
    const tab = sheet || _asAddTab_(matrix.ss);
    const folder = _asParentFolder_(matrix.ss.getId());
    result.planned.forEach(p => {
      const a = p.a;
      const doc = DocumentApp.create(a.unitName + " (" + a.code + ") — Prompt template");
      doc.getBody().setText(a.promptText);
      doc.saveAndClose();
      if (folder) DriveApp.getFileById(doc.getId()).moveTo(folder);
      const row = [
        p.configId, a.unitName, a.tier, a.persona,
        a.milestones[0], a.milestones[1], a.milestones[2], a.milestones[3],
        a.definitionOfDone, matrix.teacherEmail, new Date(), "LIVE",
        doc.getId(), a.subject, a.courseName,
        a.milestoneCompetencyIds[0], a.milestoneCompetencyIds[1],
        a.milestoneCompetencyIds[2], a.milestoneCompetencyIds[3], a.unitId || a.key,
        _asObjectivesJson_(a)
      ];
      const at = tab.getLastRow() + 1;
      // Text first: Sheets reads "8175-1" as a date (competencyIdText_, 32).
      tab.getRange(at, 1, 1, row.length).setNumberFormat("@");
      tab.getRange(at, 11).setNumberFormat("yyyy-mm-dd hh:mm");
      tab.getRange(at, 1, 1, row.length).setValues([row]);
      result.written++;
    });
  }

  result.message = (apply
    ? "Wrote " + result.written + " LIVE assignment(s)"
    : "DRY RUN: " + result.planned.length + " assignment(s) would be written LIVE") +
    " to the TeacherMatrix in " + matrix.ss.getName() + "; " + result.skipped.length + " skipped.";
  Logger.log("[S53] " + result.message);
  result.planned.forEach(p => Logger.log("[S53]   " + p.configId + "  " + p.unitName + " — " + p.courseName +
    " (milestone competencies: " + p.competencies + ")"));
  result.skipped.forEach(s => Logger.log("[S53]   skip " + s.configId + ": " + s.reason));
  return result;
}

/**
 * A pacing-guide unit ("S1-U1") or one of the teacher's lessons ("8175-L06",
 * 55b) for a course: { a, configId }, "OTHER_COURSE" for a lesson of the
 * other course, or null.
 */
// ---------------------------------------------------------------------------
// Refresh: an assignment already in the TeacherMatrix is never written again
// by seedAssignments(), so a fix to its criteria in the repo never reached it
// (2026-10-19: L07 graded peer replies Flow 2 can't see, and two of its
// competencies had no criteria). This rewrites the milestones, the
// Definition of Done, the milestone competency IDs and the "I can"
// objectives (2026-10-24) of each row whose ConfigID the repo knows, where
// they differ, and the task text in the row's prompt doc, which new student
// docs are made from. Flow 2 reads the row when a student submits (37), so
// the next submission uses it; a FlowInput row already written, and a
// student doc already made, keep their text. Nothing else in the row changes.
//
//   previewAssignmentRefresh()  lists each row that would change, and which
//                               fields. Changes nothing.
//   refreshAssignments()        writes them.
// ---------------------------------------------------------------------------
const AS_REFRESH_COLS_ = { MILESTONES: 4, DOD: 8, PROMPT_DOC: 12, COMP_IDS: 15, OBJECTIVES: 20 }; // 0-based, AS_TAB_HEADERS

// The assignment's "I can" objectives as the TeacherMatrix keeps them: JSON,
// keys in a fixed order so an unchanged set compares equal. "" with none.
function _asObjectivesJson_(a) {
  const o = (a && a.objectives) || {};
  const keys = Object.keys(o).sort();
  if (!keys.length) return "";
  const out = {};
  keys.forEach(k => { out[k] = o[k]; });
  return JSON.stringify(out);
}

function previewAssignmentRefresh() {
  return refreshAssignments_({ apply: false });
}

function refreshAssignments() {
  return refreshAssignments_({ apply: true });
}

/** ConfigID -> repo assignment, for every lesson and unit the repo has. */
function _asByConfigId_() {
  const out = {};
  const lessons = typeof LESSON_ASSIGNMENTS !== "undefined" ? LESSON_ASSIGNMENTS : {};
  Object.keys(lessons).forEach(k => { out[lessonConfigId_(k)] = lessons[k]; });
  Object.keys(UNIT_ASSIGNMENTS).forEach(k => {
    const a = UNIT_ASSIGNMENTS[k];
    const cut = k.lastIndexOf("_");
    out[assignmentConfigId_(k.slice(0, cut), k.slice(cut + 1))] = a;
  });
  return out;
}

function refreshAssignments_(opts) {
  const apply = !!(opts && opts.apply === true);
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const result = { apply: apply, changed: [], unchanged: 0, notInRepo: 0, message: "" };
  const matrix = _asTeacherMatrix_(ss, cfg);
  const sheet = matrix.ss && matrix.ss.getSheetByName("TeacherMatrix");
  if (!sheet || sheet.getLastRow() < 2) {
    result.message = "No TeacherMatrix rows for this teacher. Nothing to refresh.";
    Logger.log("[S53] " + result.message);
    return result;
  }
  const repo = _asByConfigId_();
  const width = AS_REFRESH_COLS_.OBJECTIVES + 1;
  // The header for the objectives column on a sheet made before it existed.
  if (apply && String(sheet.getRange(1, AS_REFRESH_COLS_.OBJECTIVES + 1).getValue()).trim() === "") {
    sheet.getRange(1, AS_REFRESH_COLS_.OBJECTIVES + 1).setValue(AS_TAB_HEADERS[AS_REFRESH_COLS_.OBJECTIVES]).setFontWeight("bold");
  }
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(width, sheet.getLastColumn())).getValues();
  rows.forEach((r, i) => {
    const configId = String(r[0]).trim();
    const a = repo[configId];
    if (!a) { result.notInRepo++; return; }
    const fields = [];
    const want = {
      milestones: a.milestones.slice(0, 4),
      dod: a.definitionOfDone,
      ids: a.milestoneCompetencyIds.slice(0, 4).map(v => v || ""),
      objectives: _asObjectivesJson_(a),
    };
    const have = {
      milestones: r.slice(AS_REFRESH_COLS_.MILESTONES, AS_REFRESH_COLS_.MILESTONES + 4).map(v => String(v).trim()),
      dod: String(r[AS_REFRESH_COLS_.DOD]).trim(),
      ids: r.slice(AS_REFRESH_COLS_.COMP_IDS, AS_REFRESH_COLS_.COMP_IDS + 4).map(competencyIdText_),
      objectives: String(r[AS_REFRESH_COLS_.OBJECTIVES] || "").trim(),
    };
    if (want.milestones.some((m, j) => m.trim() !== have.milestones[j])) fields.push("milestones");
    if (want.dod.trim() !== have.dod) fields.push("definition of done");
    if (want.ids.some((m, j) => m !== have.ids[j])) fields.push("competency IDs");
    if (want.objectives !== have.objectives) fields.push("objectives");
    // The task text new student docs are made from (02 reads the prompt
    // doc), so a lesson seeded before a task change gets it too. Only the
    // template changes: docs already made for students keep their text.
    const promptDocId = String(r[AS_REFRESH_COLS_.PROMPT_DOC] || "").trim();
    let promptDoc = null;
    if (promptDocId && a.promptText) {
      try {
        promptDoc = DocumentApp.openById(promptDocId);
        if (promptDoc.getBody().getText().trim() !== String(a.promptText).trim()) fields.push("task text");
        else promptDoc = null;
      } catch (e) {
        Logger.log("[S53] Prompt doc for " + configId + " not read: " + e.message);
        promptDoc = null;
      }
    }
    if (!fields.length) { result.unchanged++; return; }
    result.changed.push({ configId: configId, unitName: a.unitName, fields: fields.join(", ") });
    if (!apply) return;
    const at = i + 2;
    sheet.getRange(at, AS_REFRESH_COLS_.MILESTONES + 1, 1, 5).setValues([want.milestones.concat([want.dod])]);
    // Text first: Sheets reads "8175-1" as a date (competencyIdText_, 32).
    const ids = sheet.getRange(at, AS_REFRESH_COLS_.COMP_IDS + 1, 1, 4);
    ids.setNumberFormat("@");
    ids.setValues([want.ids]);
    const obj = sheet.getRange(at, AS_REFRESH_COLS_.OBJECTIVES + 1);
    obj.setNumberFormat("@");
    obj.setValue(want.objectives);
    if (promptDoc) {
      promptDoc.getBody().setText(a.promptText);
      promptDoc.saveAndClose();
    }
  });
  result.message = (apply ? "Refreshed " : "DRY RUN: would refresh ") + result.changed.length +
    " assignment(s) from the repo (" + (result.changed.map(c => c.configId + ": " + c.fields).join("; ") || "none") +
    "); " + result.unchanged + " already current, " + result.notInRepo + " not from the repo (left alone).";
  Logger.log("[S53] " + result.message);
  return result;
}

function _asAssignment_(id, code) {
  const lessons = typeof LESSON_ASSIGNMENTS !== "undefined" ? LESSON_ASSIGNMENTS : {};
  if (lessons[id]) {
    return lessons[id].code === code ? { a: lessons[id], configId: lessonConfigId_(id) } : "OTHER_COURSE";
  }
  const a = UNIT_ASSIGNMENTS[id + "_" + code];
  return a ? { a: a, configId: assignmentConfigId_(id, code) } : null;
}

/**
 * { "8175": [id...], "8177": [...] } from SEED_UNITS (unit IDs or lesson
 * keys), else each course's assignment for today plus any scheduled lesson
 * (55) starting in the next 7 days, so a lesson can be seeded the day before.
 */
function _asUnits_(opts) {
  const prop = opts.units ||
    String(PropertiesService.getScriptProperties().getProperty("SEED_UNITS") || "")
      .split(",").map(s => s.trim()).filter(Boolean);
  if (prop.length) return { "8175": prop, "8177": prop };
  const now = opts.today || new Date();
  const today = formatDateYMD_(now);
  const soon = formatDateYMD_(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  const out = {};
  ["8175", "8177"].forEach(code => {
    const unit = resolveUnitForCourseDate_(today, code); // 31
    out[code] = unit ? [unit.lesson_unit_id] : [];
    (_lsRows_()[code] || []).forEach(r => {
      if (r.start > today && r.start <= soon && out[code].indexOf(r.key) === -1) out[code].push(r.key);
    });
  });
  return out;
}

/** The teacher's matrix from MatrixRegistry: { ss, teacherEmail }. */
function _asTeacherMatrix_(ss, cfg) {
  const reg = ss.getSheetByName(cfg.tabs.matrixRegistry);
  if (!reg || reg.getLastRow() < 2) return {};
  const want = String(cfg.teacherEmail || "").trim().toLowerCase();
  const rows = reg.getRange(2, 1, reg.getLastRow() - 1, 3).getValues()
    .filter(r => String(r[2] || "").trim());
  const row = rows.filter(r => !want || String(r[1]).trim().toLowerCase() === want)[0] || rows[0];
  if (!row) return {};
  return { ss: SpreadsheetApp.openById(String(row[2]).trim()), teacherEmail: String(row[1]).trim().toLowerCase() };
}

function _asAddTab_(matrixSs) {
  const tab = matrixSs.insertSheet("TeacherMatrix");
  tab.getRange(1, 1, 1, AS_TAB_HEADERS.length).setValues([AS_TAB_HEADERS]).setFontWeight("bold");
  tab.setFrozenRows(1);
  return tab;
}

function _asParentFolder_(fileId) {
  try {
    const parents = DriveApp.getFileById(fileId).getParents();
    return parents.hasNext() ? parents.next() : null;
  } catch (e) {
    return null;
  }
}
