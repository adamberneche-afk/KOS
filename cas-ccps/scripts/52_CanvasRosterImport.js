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
 * Only students whose section is in the assignment's course (its
 * TeacherMatrix CourseName, 8175 or 8177) are enrolled: one run per course,
 * each with that course's assignment. The section's own name decides the
 * course ("...MARKETING... [74-C8175H-P01]"), since both courses can meet in
 * one period; a section without one takes its period's course (ClassSchedule).
 * A section's period defaults to its code's "-P01" suffix. A student who already has
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
    s.course = s.period ? (_criSectionCourse_(name, s.period, courseByPeriod).code || "?") : "";
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
  // report). enrolled: those with a workspace for THIS assignment
  // (StudentAssignments, 02), so the next unit's assignment can be imported
  // for the same students. The Ledger's ConfigID is the student's own
  // workspace ID, so it can't say which assignment a row is for; comparing it
  // with the assignment ID never matched, and every re-run enrolled everyone
  // again (seen live 2026-10-07). unrecorded: accounts with a workspace from
  // before StudentAssignments existed. They are not enrolled again until
  // repairRosterDuplicates() records their assignment.
  const inTerm = {};
  const enrolled = {};
  const unrecorded = {};
  const assignments = readStudentAssignments_(ss);
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (ledger && ledger.getLastRow() > 1) {
    ledger.getRange(2, 1, ledger.getLastRow() - 1, 19).getValues().forEach(r => {
      if (String(r[8] || "").trim().toLowerCase() !== teacherEmail) return;
      if (String(r[12] || "").trim() === "ARCHIVED") return;
      if (term && String(r[18] || "").trim() && String(r[18]).trim() !== term) return;
      const account = String(r[1] || "").trim().toLowerCase();
      inTerm[account] = true;
      const assignment = assignments.byStudent[String(r[2] || "").trim()];
      if (assignment === configId) enrolled[account] = true;
      if (!assignment) unrecorded[account] = true;
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
    const course = _criSectionCourse_(s.section, period, courseByPeriod);
    if (course.code !== assignmentCourse) {
      result.skipped.push(Object.assign(row, { reason: "OTHER_COURSE", period: period }));
      continue;
    }
    if (enrolled[s.account]) {
      result.skipped.push(Object.assign(row, { reason: "ALREADY_ENROLLED" }));
      continue;
    }
    if (unrecorded[s.account]) {
      result.skipped.push(Object.assign(row, { reason: "UNRECORDED_WORKSPACE" }));
      continue;
    }
    row.period = period;
    result.planned.push(row);
    if (!apply) continue;
    if (Date.now() - started > CRI_TIME_BUDGET_MS) { timedOut = true; break; }

    const courseName = course.name;
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
  if (counts.UNRECORDED_WORKSPACE) {
    Logger.log("[S52] " + counts.UNRECORDED_WORKSPACE + " student(s) already have a workspace from before " +
      "assignments were recorded. Run previewRosterRepair(), then repairRosterDuplicates(), then this again.");
  }
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
 * row for every section seen that isn't there yet. The period comes from the
 * section code ("-P01]" → 1) when the tab has none.
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
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach((r, i) => {
      const sec = String(r[0] || "").trim();
      if (!sec) return;
      known[sec] = true;
      let p = String(r[1] || "").trim();
      // A blank period is filled from the section code ("-P01]" → 1), in the
      // tab, so the operator sees it and can correct it.
      if (!p && (p = _criPeriodFromSection_(sec))) {
        sheet.getRange(i + 2, 2).setNumberFormat("@").setValue(p);
      }
      if (p) map[sec] = p;
    });
  }
  const add = [];
  sections.forEach(sec => {
    if (sec && !known[sec]) {
      known[sec] = true;
      const p = _criPeriodFromSection_(sec);
      if (p) map[sec] = p;
      add.push([sec, p]);
    }
  });
  if (add.length) {
    sheet.getRange(2, 2, sheet.getLastRow() + add.length, 1).setNumberFormat("@");
    sheet.getRange(sheet.getLastRow() + 1, 1, add.length, 2).setValues(add);
  }
  return map;
}

/** { period: [course_name, ...] } from this teacher's active ClassSchedule rows. */
function _criCourseByPeriod_(ss, cfg, teacherEmail) {
  const out = {};
  const sheet = ss.getSheetByName(cfg.tabs.classSchedule);
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().forEach(r => {
    if (String(r[0] || "").trim().toLowerCase() !== teacherEmail) return;
    if (String(r[4] || "TRUE").trim().toUpperCase() === "FALSE") return;
    const p = String(r[1] || "").trim();
    const name = String(r[3] || "").trim();
    if (!p || !name) return;
    out[p] = out[p] || [];
    if (out[p].indexOf(name) === -1) out[p].push(name);
  });
  return out;
}

/**
 * A section's course: { code: "8175"|"8177"|"", name: ClassSchedule course
 * name }. 8175 and 8177 can meet in the same period, so the section's own
 * name decides when it carries the course ("...MARKETING... [74-C8175H-P01]");
 * otherwise the period's only course does.
 */
function _criSectionCourse_(section, period, courseByPeriod) {
  const names = courseByPeriod[period] || [];
  const code = _cybCourseCode_(section) || (names.length === 1 ? _cybCourseCode_(names[0]) : "");
  const name = names.filter(n => code && _cybCourseCode_(n) === code)[0] || "";
  return { code: name ? code : "", name: name };
}

// ================================================================
// REPAIR — duplicate workspaces from re-runs before StudentAssignments
// ================================================================

function previewRosterRepair() {
  return repairRosterDuplicates_({ apply: false });
}

/**
 * For this teacher's Ledger rows this term with no StudentAssignments entry:
 * works out the assignment from the workspace doc's name ("<UnitName> — …",
 * 02) and the TeacherMatrix row with that UnitName in the student's course;
 * keeps each student's earliest workspace per assignment and records its
 * assignment; archives the later ones (Status ARCHIVED, a Notes line) and
 * trashes their docs. Rows whose assignment can't be worked out are left
 * alone and counted. Logs counts only, no names or accounts.
 */
function repairRosterDuplicates() {
  return repairRosterDuplicates_({ apply: true });
}

function repairRosterDuplicates_(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const result = { apply: apply, kept: 0, duplicates: 0, unresolved: 0, recorded: 0, archived: 0, trashed: 0,
    message: "" };
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (!ledger || ledger.getLastRow() < 2) { result.message = "No Ledger rows."; Logger.log("[S52] " + result.message); return result; }

  let teacherEmail = String(cfg.teacherEmail || "").trim().toLowerCase();
  const registry = ss.getSheetByName(cfg.tabs.matrixRegistry);
  if (!teacherEmail && registry && registry.getLastRow() > 1) {
    teacherEmail = String(registry.getRange(2, 2).getValue() || "").trim().toLowerCase();
  }
  // TeacherMatrix: "<UnitName>|<course code>" → ConfigID.
  const byUnit = {};
  if (registry && registry.getLastRow() > 1) {
    registry.getRange(2, 1, registry.getLastRow() - 1, 3).getValues().forEach(r => {
      if (String(r[1] || "").trim().toLowerCase() !== teacherEmail || !String(r[2] || "").trim()) return;
      const tm = SpreadsheetApp.openById(String(r[2]).trim()).getSheetByName(cfg.tabs.teacherMatrix);
      if (!tm || tm.getLastRow() < 2) return;
      tm.getRange(2, 1, tm.getLastRow() - 1, 15).getValues().forEach(m => {
        if (String(m[11]).trim() !== "LIVE") return;
        byUnit[String(m[1]).trim() + "|" + _cybCourseCode_(m[14])] = String(m[0]).trim();
      });
    });
  }

  const term = PropertiesService.getScriptProperties().getProperty("CURRENT_TERM") || "";
  const assignments = readStudentAssignments_(ss);
  const data = ledger.getRange(2, 1, ledger.getLastRow() - 1, 19).getValues();
  const groups = {};
  data.forEach((r, i) => {
    if (String(r[8] || "").trim().toLowerCase() !== teacherEmail) return;
    if (String(r[12] || "").trim() === "ARCHIVED") return;
    if (term && String(r[18] || "").trim() && String(r[18]).trim() !== term) return;
    const sid = String(r[2] || "").trim();
    const account = String(r[1] || "").trim().toLowerCase();
    let assignment = assignments.byStudent[sid] || "";
    const recorded = !!assignment;
    if (!assignment) {
      let name = "";
      try { name = DriveApp.getFileById(String(r[3]).trim()).getName(); } catch (e) { name = ""; }
      assignment = byUnit[name.split(" — ")[0].trim() + "|" + _cybCourseCode_(r[10])] || "";
    }
    if (!assignment) { result.unresolved++; return; }
    const key = account + "|" + assignment;
    (groups[key] = groups[key] || []).push({ row: i + 2, at: new Date(r[0]).getTime() || 0, sid: sid,
      account: account, fileId: String(r[3]).trim(), assignment: assignment, recorded: recorded,
      notes: String(r[14] || "") });
  });

  Object.keys(groups).forEach(key => {
    // Keep a recorded workspace if there is one, else the earliest.
    const g = groups[key].sort((a, b) => (b.recorded - a.recorded) || (a.at - b.at));
    const keep = g[0];
    result.kept++;
    result.duplicates += g.length - 1;
    if (!apply) return;
    if (!keep.recorded) { recordStudentAssignment_(ss, keep.sid, keep.account, keep.assignment); result.recorded++; }
    g.slice(1).forEach(d => {
      ledger.getRange(d.row, 13).setValue("ARCHIVED");
      ledger.getRange(d.row, 15).setValue((d.notes ? d.notes + " | " : "") +
        "Duplicate workspace from a roster import re-run; archived " + new Date().toISOString().slice(0, 10) + ".");
      result.archived++;
      try { DriveApp.getFileById(d.fileId).setTrashed(true); result.trashed++; } catch (e) { /* counted by the gap */ }
    });
  });

  result.message = (apply
    ? "Kept " + result.kept + " workspace(s) (" + result.recorded + " newly recorded); archived " +
      result.archived + " duplicate(s) and trashed " + result.trashed + " doc(s)"
    : "DRY RUN: " + result.kept + " workspace(s) to keep, " + result.duplicates + " duplicate(s) to archive") +
    "; " + result.unresolved + " row(s) whose assignment couldn't be found were left alone.";
  Logger.log("[S52] " + result.message);
  return result;
}

/** "1" from a CCPS section code ending "-P01]"; "" when there is none. */
function _criPeriodFromSection_(section) {
  const m = /-P0*(\d+)\]\s*$/.exec(String(section || ""));
  return m ? m[1] : "";
}
