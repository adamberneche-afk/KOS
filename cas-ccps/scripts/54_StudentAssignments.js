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
