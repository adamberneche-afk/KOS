/**
 * ================================================================
 * 52_CanvasRosterImport.js — CAS-CCPS
 * BOUND TO: Central Ledger (cas-ccps:central-ledger)
 * ================================================================
 *
 * Enrolls a class roster from Canvas gradebook exports, so students don't
 * each have to submit the intake form before warm-ups and dashboards see
 * them.
 *
 *   1. In each Canvas course: Grades → Export → Export Entire Gradebook.
 *      Upload the CSV(s) to your Drive. Canvas names them
 *      "<date>_Grades-<course>.csv"; any .csv with "Grades" in its name is
 *      read: from the TEACHER_FOLDER_ID folder when this project has that
 *      property, otherwise from anywhere in your own Drive. (The setup
 *      wizard writes TEACHER_* properties into the Unified Manual project,
 *      not this one.)
 *   1a. Before any assignment is LIVE: prepareRosterSections() fills the
 *      CanvasSectionMap tab from the exports and logs each section's student
 *      count, so periods can be mapped ahead of time. It enrolls no one.
 *   2. previewRosterEnrollment("<Assignment Config ID>") lists who would be
 *      enrolled, and fills the CanvasSectionMap tab with every Canvas
 *      section it found. Put each section's class period in that tab.
 *   3. applyRosterEnrollment("<Assignment Config ID>") enrolls them.
 *
 * The editor's Run button can't pass an argument, so run with none and the
 * Config ID comes from the ROSTER_CONFIG_ID Script Property (Project
 * Settings → Script properties). An ID passed in wins over the property.
 *
 * Only students whose class period (ClassSchedule) is in the assignment's
 * course (its TeacherMatrix CourseName, 8175 or 8177) are enrolled: one run
 * per course, each with that course's assignment. A student who already has
 * a Ledger row for this assignment is skipped.
 *
 * Each student is set up by intakeStudent_() (02), the same function the
 * intake form uses: their own copy of the master template for that LIVE
 * assignment, shared with them and the assigning teacher, and a Ledger row
 * for the period and current term. A student who already has a Ledger row
 * for this teacher this term is skipped, so a re-run after a new export
 * only adds new students. Students who left the Canvas course are listed,
 * never removed.
 *
 * Reads only three columns: Student, SIS Login ID and Section. Every grade
 * column is ignored. The roster never leaves the account: the CSVs stay in
 * your Drive, and the log shows accounts, not names.
 */

const CRI_SECTION_MAP_TAB = "CanvasSectionMap";
const CRI_TIME_BUDGET_MS = 5 * 60 * 1000;

function previewRosterEnrollment(assignmentConfigId) {
  return enrollCanvasRoster_({ apply: false, assignmentConfigId: assignmentConfigId });
}

function applyRosterEnrollment(assignmentConfigId) {
  return enrollCanvasRoster_({ apply: true, assignmentConfigId: assignmentConfigId });
}

/**
 * Fills CanvasSectionMap from the gradebook exports and logs, per section,
 * how many student accounts it holds, how many logins aren't district student
 * accounts, and (once mapped) the period and its ClassSchedule course. Needs
 * no Config ID and enrolls no one: the mapping step done ahead of time.
 * Logs counts and section names only, never student names or accounts.
 *
 * @returns {{files: number, students: number, sections: Object[], unmapped: string[], message: string}}
 */
function prepareRosterSections() {
  const cfg = getConfig_();
  const result = { files: 0, students: 0, sections: [], unmapped: [], message: "" };
  const files = _criFindExports_(cfg);
  result.files = files.length;
  if (!files.length) {
    result.message = "No Canvas gradebook export (.csv with \"Grades\" in the name) found in " +
      (cfg.teacherFolderId ? "your teacher folder (TEACHER_FOLDER_ID)." : "your Drive.");
    Logger.log("[S52] " + result.message);
    return result;
  }
  const bySection = {};
  const seen = {};
  files.forEach(file => {
    _criParseGradebook_(file.getBlob().getDataAsString("UTF-8")).forEach(s => {
      if (s.account && seen[s.account]) return;
      if (s.account) seen[s.account] = true;
      const sec = bySection[s.section] = bySection[s.section] || { section: s.section, students: 0, notStudentAccounts: 0 };
      if (s.account && _studentIdPattern_().test(s.account)) sec.students++; else sec.notStudentAccounts++;
    });
  });
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sectionMap = _criSectionMap_(ss, Object.keys(bySection));
  // TEACHER_EMAIL is set in the Unified Manual project, so here it usually
  // comes from the MatrixRegistry row.
  let teacherEmail = String(cfg.teacherEmail || "").trim().toLowerCase();
  const registry = ss.getSheetByName(cfg.tabs.matrixRegistry);
  if (!teacherEmail && registry && registry.getLastRow() > 1) {
    teacherEmail = String(registry.getRange(2, 2).getValue() || "").trim().toLowerCase();
  }
  const courseByPeriod = _criCourseByPeriod_(ss, cfg, teacherEmail);
  Object.keys(bySection).sort().forEach(name => {
    const s = bySection[name];
    s.period = sectionMap[name] || "";
    s.course = s.period ? (_cybCourseCode_(courseByPeriod[s.period]) || "?") : "";
    result.students += s.students;
    if (!s.period) result.unmapped.push(name);
    result.sections.push(s);
  });
  result.message = "Read " + result.files + " export(s): " + result.students + " student account(s) in " +
    result.sections.length + " section(s); " + result.unmapped.length + " section(s) still need a period in " +
    CRI_SECTION_MAP_TAB + ". Nothing enrolled.";
  Logger.log("[S52] " + result.message);
  result.sections.forEach(s => Logger.log("[S52]   " + s.section + ": " + s.students + " student(s)" +
    (s.notStudentAccounts ? ", " + s.notStudentAccounts + " not a student account" : "") +
    (s.period ? " → period " + s.period + (s.course ? " (" + s.course + ")" : "") : " → no period yet")));
  return result;
}

/**
 * @param {{apply?: boolean, assignmentConfigId: string}} opts
 * @returns {{apply, files, students, planned: Object[], enrolled: number,
 *            skipped: Object[], failed: Object[], unmappedSections: string[],
 *            notInCanvas: string[], message}}
 */
function enrollCanvasRoster_(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const started = Date.now();
  // Run from the editor, the argument is undefined (or, from a trigger, an
  // event object), so only a string counts.
  const passed = typeof opts.assignmentConfigId === "string" ? opts.assignmentConfigId.trim() : "";
  const configId = passed ||
    String(PropertiesService.getScriptProperties().getProperty("ROSTER_CONFIG_ID") || "").trim();
  const cfg = getConfig_();
  const result = { apply: apply, files: 0, students: 0, planned: [], enrolled: 0, skipped: [], failed: [],
    unmappedSections: [], notInCanvas: [], message: "" };

  if (!configId) {
    result.message = "No Config ID. Set the ROSTER_CONFIG_ID Script Property (Project Settings → Script " +
      "properties) to a LIVE assignment's Config ID and run again, or call previewRosterEnrollment(\"ABC123\"). " +
      "To map sections before any assignment is LIVE, run prepareRosterSections().";
    Logger.log("[S52] " + result.message);
    return result;
  }
  const assignment = fetchAssignment_(cfg, configId);
  if (!assignment) {
    result.message = "No LIVE assignment has Config ID " + configId + ". Confirm it in the Teacher Matrix first.";
    Logger.log("[S52] " + result.message);
    return result;
  }
  // Which course this assignment is for. Without it every export's students
  // would be enrolled in one course's assignment (seen in review 2026-10-06).
  const assignmentCourse = _cybCourseCode_(assignment.courseName);
  if (!assignmentCourse) {
    result.message = "Can't tell which course " + configId + " is for: its TeacherMatrix CourseName is \"" +
      (assignment.courseName || "") + "\". Nothing enrolled.";
    Logger.log("[S52] " + result.message);
    return result;
  }
  const teacherEmail = (assignment.teacherEmail || cfg.teacherEmail || "").toLowerCase();
  // From the assignment's MatrixRegistry row: TEACHER_NAME is set in the
  // Unified Manual project, so it is usually blank here.
  const teacherName = assignment.teacherName || cfg.teacherName || "";

  const files = _criFindExports_(cfg);
  result.files = files.length;
  if (!files.length) {
    result.message = "No Canvas gradebook export (.csv with \"Grades\" in the name) found in " +
      (cfg.teacherFolderId ? "your teacher folder (TEACHER_FOLDER_ID)." : "your Drive.");
    Logger.log("[S52] " + result.message);
    return result;
  }

  // Students from every export; the first export a student appears in wins.
  const roster = [];
  const seenAccounts = {};
  files.forEach(file => {
    _criParseGradebook_(file.getBlob().getDataAsString("UTF-8")).forEach(s => {
      if (s.account && seenAccounts[s.account]) return;
      if (s.account) seenAccounts[s.account] = true;
      roster.push(s);
    });
  });
  result.students = roster.length;

  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sectionMap = _criSectionMap_(ss, roster.map(s => s.section));
  const courseByPeriod = _criCourseByPeriod_(ss, cfg, teacherEmail);

  // Accounts already in the Ledger for this teacher and term.
  const term = PropertiesService.getScriptProperties().getProperty("CURRENT_TERM") || "";
  // inTerm: this teacher's students this term (for the "left the course"
  // report). enrolled: those with a row for THIS assignment, so the next
  // unit's assignment can be imported for the same students.
  const inTerm = {};
  const enrolled = {};
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (ledger && ledger.getLastRow() > 1) {
    ledger.getRange(2, 1, ledger.getLastRow() - 1, 19).getValues().forEach(r => {
      if (String(r[8] || "").trim().toLowerCase() !== teacherEmail) return;
      if (String(r[12] || "").trim() === "ARCHIVED") return;
      if (term && String(r[18] || "").trim() && String(r[18]).trim() !== term) return;
      const account = String(r[1] || "").trim().toLowerCase();
      inTerm[account] = true;
      if (String(r[2] || "").trim() === configId) enrolled[account] = true;
    });
  }
  result.notInCanvas = Object.keys(inTerm).filter(a => !seenAccounts[a]);

  const unmapped = {};
  let timedOut = false;
  for (const s of roster) {
    const row = { account: s.account || "(blank)", section: s.section };
    if (!s.account || !_studentIdPattern_().test(s.account)) {
      result.skipped.push(Object.assign(row, { reason: "INVALID_ACCOUNT", sisLogin: s.sisLogin }));
      continue;
    }
    const period = sectionMap[s.section];
    if (!period) {
      unmapped[s.section] = true;
      result.skipped.push(Object.assign(row, { reason: "SECTION_NOT_MAPPED" }));
      continue;
    }
    if (_cybCourseCode_(courseByPeriod[period]) !== assignmentCourse) {
      result.skipped.push(Object.assign(row, { reason: "OTHER_COURSE", period: period }));
      continue;
    }
    if (enrolled[s.account]) {
      result.skipped.push(Object.assign(row, { reason: "ALREADY_ENROLLED" }));
      continue;
    }
    row.period = period;
    result.planned.push(row);
    if (!apply) continue;
    if (Date.now() - started > CRI_TIME_BUDGET_MS) { timedOut = true; break; }

    const courseName = courseByPeriod[period] || "";
    const res = intakeStudent_(cfg, {
      googleId: s.account, studentName: s.name, block: period, className: courseName,
      subject: courseName, courseName: courseName, period: period,
      teacherName: teacherName, teacherEmail: teacherEmail, unitConfigId: configId
    });
    if (res.ok) {
      result.enrolled++;
      enrolled[s.account] = true;
    } else {
      result.failed.push(Object.assign(row, { reason: res.code }));
      if (res.code === "NO_MASTER_TEMPLATE" || res.code === "NO_LIVE_ASSIGNMENT") break;
    }
  }
  result.unmappedSections = Object.keys(unmapped);

  result.message = (apply
    ? "Enrolled " + result.enrolled + " of " + result.planned.length + " student(s)"
    : "DRY RUN: " + result.planned.length + " student(s) would be enrolled") +
    " in " + assignment.unitName + " (" + configId + ") from " + result.files + " export(s); " +
    result.skipped.length + " skipped" + (result.failed.length ? ", " + result.failed.length + " FAILED" : "") +
    (timedOut ? ". Stopped at the time budget; run applyRosterEnrollment again to continue." : ".");
  Logger.log("[S52] " + result.message);
  if (result.unmappedSections.length) {
    Logger.log("[S52] Put a class period next to each of these sections in the " + CRI_SECTION_MAP_TAB +
      " tab, then run again: " + result.unmappedSections.join(" | "));
  }
  const counts = {};
  result.skipped.forEach(s => { counts[s.reason] = (counts[s.reason] || 0) + 1; });
  Object.keys(counts).forEach(k => Logger.log("[S52]   skipped " + k + ": " + counts[k]));
  result.skipped.filter(s => s.reason === "INVALID_ACCOUNT")
    .forEach(s => Logger.log("[S52]   not a student account: SIS Login ID \"" + s.sisLogin + "\""));
  result.failed.forEach(f => Logger.log("[S52]   FAILED " + f.account + ": " + f.reason));
  if (result.notInCanvas.length) {
    Logger.log("[S52] " + result.notInCanvas.length + " student(s) in the Ledger are not in any export " +
      "(left the course?). Nothing was removed.");
  }
  return result;
}

/**
 * Canvas gradebook exports, newest first: in the TEACHER_FOLDER_ID folder
 * when this project has one, otherwise any you own in Drive.
 */
function _criFindExports_(cfg) {
  const out = [];
  const it = cfg.teacherFolderId
    ? DriveApp.getFolderById(cfg.teacherFolderId).getFiles()
    : DriveApp.searchFiles('title contains "Grades" and trashed = false and \'me\' in owners');
  let n = 0;
  while (it.hasNext() && n < 500) {
    n++;
    const f = it.next();
    const name = String(f.getName());
    if (/grades/i.test(name) && /\.csv$/i.test(name)) out.push(f);
  }
  return out.sort((a, b) => (b.getLastUpdated ? b.getLastUpdated() - a.getLastUpdated() : 0));
}

/**
 * Students from one Canvas gradebook CSV: [{name, sisLogin, account, section}].
 * Skips the "Points Possible" row and Canvas's Test Student.
 */
function _criParseGradebook_(text) {
  const rows = Utilities.parseCsv(String(text || "").replace(/^﻿/, ""));
  if (!rows.length) return [];
  const header = rows[0].map(h => String(h).trim().toLowerCase());
  const col = name => header.indexOf(name);
  const iName = col("student"), iLogin = col("sis login id"), iSection = col("section");
  if (iName === -1 || iLogin === -1) {
    Logger.log("[S52] Not a Canvas gradebook export (no Student / SIS Login ID columns); skipped.");
    return [];
  }
  const domain = _studentEmailDomain_();
  const out = [];
  rows.slice(1).forEach(r => {
    const rawName = String(r[iName] || "").trim();
    if (!rawName || /points possible/i.test(rawName) || /^student,\s*test$|^test student$/i.test(rawName)) return;
    const sisLogin = String(r[iLogin] || "").trim();
    let account = sisLogin.toLowerCase();
    if (/^\d{7}$/.test(account)) account += "@" + domain;
    const parts = rawName.split(",");
    const name = parts.length === 2 ? (parts[1].trim() + " " + parts[0].trim()) : rawName;
    out.push({ name: name, sisLogin: sisLogin, account: account,
      section: iSection === -1 ? "" : String(r[iSection] || "").trim() });
  });
  return out;
}

/**
 * { "<Canvas section>": "<period>" } from the CanvasSectionMap tab, adding a
 * row (period blank) for every section seen that isn't there yet.
 */
function _criSectionMap_(ss, sections) {
  let sheet = ss.getSheetByName(CRI_SECTION_MAP_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(CRI_SECTION_MAP_TAB);
    sheet.getRange(1, 1, 1, 2).setValues([["canvas_section", "period"]]);
  }
  const map = {};
  const known = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(r => {
      const sec = String(r[0] || "").trim();
      if (!sec) return;
      known[sec] = true;
      const p = String(r[1] || "").trim();
      if (p) map[sec] = p;
    });
  }
  const add = [];
  sections.forEach(sec => {
    if (sec && !known[sec]) { known[sec] = true; add.push([sec, ""]); }
  });
  if (add.length) {
    sheet.getRange(2, 2, sheet.getLastRow() + add.length, 1).setNumberFormat("@");
    sheet.getRange(sheet.getLastRow() + 1, 1, add.length, 2).setValues(add);
  }
  return map;
}

/** { period: course_name } from this teacher's active ClassSchedule rows. */
function _criCourseByPeriod_(ss, cfg, teacherEmail) {
  const out = {};
  const sheet = ss.getSheetByName(cfg.tabs.classSchedule);
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().forEach(r => {
    if (String(r[0] || "").trim().toLowerCase() !== teacherEmail) return;
    if (String(r[4] || "TRUE").trim().toUpperCase() === "FALSE") return;
    const p = String(r[1] || "").trim();
    if (p && !out[p]) out[p] = String(r[3] || "").trim();
  });
  return out;
}
