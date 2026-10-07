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
 *   seedAssignments()        writes them: one LIVE row per unit and course,
 *                            with its prompt-template Doc, in the matrix
 *                            MatrixRegistry names for this teacher (adding
 *                            the TeacherMatrix tab if it is missing).
 *
 * Which units: the Script Property SEED_UNITS ("S1-U1" or "S1-U1,S1-U2"),
 * else each course's current pacing-guide unit. A unit and course already in
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
  "Milestone3CompetencyId", "Milestone4CompetencyId", "LessonUnitId"
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
      const configId = assignmentConfigId_(unitId, code);
      const a = UNIT_ASSIGNMENTS[unitId + "_" + code];
      if (!a) { result.skipped.push({ configId: configId, reason: "NOT_IN_COURSE" }); return; }
      if (existing[configId]) {
        result.skipped.push({ configId: configId, reason: "ALREADY_IN_MATRIX (" + existing[configId] + ")" });
        return;
      }
      result.planned.push({ key: unitId + "_" + code, configId: configId, unitName: a.unitName, courseName: a.courseName,
        competencies: a.milestoneCompetencyIds.filter(Boolean).join(", ") });
    });
  });

  if (apply && result.planned.length) {
    const tab = sheet || _asAddTab_(matrix.ss);
    const folder = _asParentFolder_(matrix.ss.getId());
    result.planned.forEach(p => {
      const a = UNIT_ASSIGNMENTS[p.key];
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
        a.milestoneCompetencyIds[2], a.milestoneCompetencyIds[3], a.unitId
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

/** { "8175": [unitId...], "8177": [...] } from SEED_UNITS or today's pacing units. */
function _asUnits_(opts) {
  const prop = opts.units ||
    String(PropertiesService.getScriptProperties().getProperty("SEED_UNITS") || "")
      .split(",").map(s => s.trim()).filter(Boolean);
  if (prop.length) return { "8175": prop, "8177": prop };
  const today = formatDateYMD_(opts.today || new Date());
  const out = {};
  ["8175", "8177"].forEach(code => {
    const unit = resolveUnitForCourseDate_(today, code); // 31
    out[code] = unit ? [unit.lesson_unit_id] : [];
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
