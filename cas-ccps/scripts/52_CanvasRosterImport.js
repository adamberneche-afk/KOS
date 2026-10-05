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
 *      Upload the CSV(s) to your teacher folder (TEACHER_FOLDER_ID). Canvas
 *      names them "<date>_Grades-<course>.csv"; any .csv with "Grades" in
 *      its name is read.
 *   2. previewRosterEnrollment("<Assignment Config ID>") lists who would be
 *      enrolled, and fills the CanvasSectionMap tab with every Canvas
 *      section it found. Put each section's class period in that tab.
 *   3. applyRosterEnrollment("<Assignment Config ID>") enrolls them.
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
 * @param {{apply?: boolean, assignmentConfigId: string}} opts
 * @returns {{apply, files, students, planned: Object[], enrolled: number,
 *            skipped: Object[], failed: Object[], unmappedSections: string[],
 *            notInCanvas: string[], message}}
 */
function enrollCanvasRoster_(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const started = Date.now();
  const configId = String(opts.assignmentConfigId || "").trim();
  const cfg = getConfig_();
  const result = { apply: apply, files: 0, students: 0, planned: [], enrolled: 0, skipped: [], failed: [],
    unmappedSections: [], notInCanvas: [], message: "" };

  if (!configId) {
    result.message = "Pass the Assignment Config ID of a LIVE assignment, e.g. previewRosterEnrollment(\"ABC123\").";
    Logger.log("[S52] " + result.message);
    return result;
  }
  const assignment = fetchAssignment_(cfg, configId);
  if (!assignment) {
    result.message = "No LIVE assignment has Config ID " + configId + ". Confirm it in the Teacher Matrix first.";
    Logger.log("[S52] " + result.message);
    return result;
  }
  const teacherEmail = (assignment.teacherEmail || cfg.teacherEmail || "").toLowerCase();

  const files = _criFindExports_(cfg);
  result.files = files.length;
  if (!files.length) {
    result.message = "No Canvas gradebook export (.csv with \"Grades\" in the name) in your teacher folder.";
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
  const enrolled = {};
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (ledger && ledger.getLastRow() > 1) {
    ledger.getRange(2, 1, ledger.getLastRow() - 1, 19).getValues().forEach(r => {
      if (String(r[8] || "").trim().toLowerCase() !== teacherEmail) return;
      if (String(r[12] || "").trim() === "ARCHIVED") return;
      if (term && String(r[18] || "").trim() && String(r[18]).trim() !== term) return;
      enrolled[String(r[1] || "").trim().toLowerCase()] = true;
    });
  }
  result.notInCanvas = Object.keys(enrolled).filter(a => !seenAccounts[a]);

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
      teacherName: cfg.teacherName, teacherEmail: teacherEmail, unitConfigId: configId
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

/** Canvas gradebook exports in the teacher folder, newest first. */
function _criFindExports_(cfg) {
  if (!cfg.teacherFolderId) return [];
  const out = [];
  const it = DriveApp.getFolderById(cfg.teacherFolderId).getFiles();
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
