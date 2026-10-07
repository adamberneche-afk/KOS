/**
 * ================================================================
 * 54_StudentAssignments.js — CAS-CCPS
 * BOUND TO: Central Ledger (cas-ccps:central-ledger)
 * ================================================================
 */

// ---------------------------------------------------------------------------
// StudentAssignments tab: which assignment each student workspace belongs to
//
// The Ledger's ConfigID is the student's own workspace ID (VDOE-…), never the
// assignment's TeacherMatrix ConfigID (CAS-S1-U1-8175), and nothing else
// recorded the assignment. So the roster import could not tell a student was
// already enrolled (re-runs made duplicate workspaces, seen live 2026-10-07)
// and the Flow 2 input builder (37) looked up the TeacherMatrix with the
// student's ID, which never matches. One row per workspace, written at intake (intakeStudent_, 02).
// ---------------------------------------------------------------------------
const STUDENT_ASSIGNMENTS_TAB = "StudentAssignments";
const SA_HEADERS = ["StudentConfigID", "GoogleID", "AssignmentConfigID", "RecordedAt"];

function _saSheet_(ss) {
  let sheet = ss.getSheetByName(STUDENT_ASSIGNMENTS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(STUDENT_ASSIGNMENTS_TAB);
    sheet.getRange(1, 1, 1, SA_HEADERS.length).setValues([SA_HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function recordStudentAssignment_(ss, studentConfigId, googleId, assignmentConfigId) {
  if (!studentConfigId || !assignmentConfigId) return;
  const sheet = _saSheet_(ss);
  const at = sheet.getLastRow() + 1;
  sheet.getRange(at, 1, 1, 3).setNumberFormat("@");
  sheet.getRange(at, 1, 1, 4).setValues([[studentConfigId,
    String(googleId || "").trim().toLowerCase(), assignmentConfigId, new Date()]]);
}

/**
 * { byStudent: { studentConfigId: assignmentConfigId },
 *   enrolled: Set of "<account>|<assignmentConfigId>" }
 */
function readStudentAssignments_(ss) {
  const out = { byStudent: {}, enrolled: new Set() };
  const sheet = ss.getSheetByName(STUDENT_ASSIGNMENTS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(r => {
    const sid = String(r[0] || "").trim(), acct = String(r[1] || "").trim().toLowerCase();
    const aid = String(r[2] || "").trim();
    if (!sid || !aid) return;
    out.byStudent[sid] = aid;
    if (acct) out.enrolled.add(acct + "|" + aid);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Retire an assignment: previewArchiveAssignment() / archiveAssignment()
//
// For the assignment in the Script Property ARCHIVE_CONFIG_ID (e.g.
// CAS-S1-U1-8175): every student workspace recorded for it gets Status
// ARCHIVED and a Notes line in the Ledger, its doc goes to the trash, and the
// TeacherMatrix row is set ARCHIVED so nothing enrolls into it again. Used
// when the teacher replaced the pacing-guide units with his own lessons
// (2026-10-07). Logs counts only.
// ---------------------------------------------------------------------------
function previewArchiveAssignment() {
  return archiveAssignment_({ apply: false });
}

function archiveAssignment() {
  return archiveAssignment_({ apply: true });
}

function archiveAssignment_(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const configId = String(opts.configId ||
    PropertiesService.getScriptProperties().getProperty("ARCHIVE_CONFIG_ID") || "").trim();
  const result = { apply: apply, configId: configId, workspaces: 0, archived: 0, trashed: 0, matrixRows: 0, message: "" };
  if (!configId) {
    result.message = "Set the ARCHIVE_CONFIG_ID Script Property to the assignment's Config ID. Nothing archived.";
    Logger.log("[S54] " + result.message);
    return result;
  }
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const students = {};
  const byStudent = readStudentAssignments_(ss).byStudent;
  Object.keys(byStudent).forEach(sid => { if (byStudent[sid] === configId) students[sid] = true; });

  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  const rows = [];
  if (ledger && ledger.getLastRow() > 1) {
    ledger.getRange(2, 1, ledger.getLastRow() - 1, 15).getValues().forEach((r, i) => {
      if (!students[String(r[2] || "").trim()] || String(r[12] || "").trim() === "ARCHIVED") return;
      rows.push({ row: i + 2, fileId: String(r[3] || "").trim(), notes: String(r[14] || "") });
    });
  }
  result.workspaces = rows.length;

  // The TeacherMatrix row(s), in every registered matrix.
  const matrixRows = [];
  const registry = ss.getSheetByName(cfg.tabs.matrixRegistry);
  if (registry && registry.getLastRow() > 1) {
    registry.getRange(2, 3, registry.getLastRow() - 1, 1).getValues().forEach(r => {
      const id = String(r[0] || "").trim();
      if (!id) return;
      const tm = SpreadsheetApp.openById(id).getSheetByName(cfg.tabs.teacherMatrix);
      if (!tm || tm.getLastRow() < 2) return;
      tm.getRange(2, 1, tm.getLastRow() - 1, 12).getValues().forEach((m, i) => {
        if (String(m[0]).trim() === configId && String(m[11]).trim() !== "ARCHIVED") matrixRows.push({ sheet: tm, row: i + 2 });
      });
    });
  }
  result.matrixRows = matrixRows.length;

  if (apply) {
    const today = new Date().toISOString().slice(0, 10);
    rows.forEach(x => {
      ledger.getRange(x.row, 13).setValue("ARCHIVED");
      ledger.getRange(x.row, 15).setValue((x.notes ? x.notes + " | " : "") +
        "Assignment " + configId + " retired; archived " + today + ".");
      result.archived++;
      try { DriveApp.getFileById(x.fileId).setTrashed(true); result.trashed++; } catch (e) { /* counted by the gap */ }
    });
    matrixRows.forEach(m => m.sheet.getRange(m.row, 12).setValue("ARCHIVED"));
  }

  result.message = (apply
    ? "Archived " + result.archived + " workspace(s) for " + configId + " and trashed " + result.trashed + " doc(s)"
    : "DRY RUN: " + result.workspaces + " workspace(s) for " + configId + " would be archived and their docs trashed") +
    "; " + result.matrixRows + " TeacherMatrix row(s) " + (apply ? "set" : "would be set") + " ARCHIVED.";
  Logger.log("[S54] " + result.message);
  return result;
}
