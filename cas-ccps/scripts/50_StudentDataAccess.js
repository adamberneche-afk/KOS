// =============================================================================
// 50_StudentDataAccess.js — CAS (CCPS)
// INCLUDE IN: cas-ccps:central-ledger
// =============================================================================
//
// Brings existing Drive sharing in line with the student-data access policy,
// and does the year-end revocation. The policy:
//   1. Student data is visible only to the student and their teachers, and
//      only during the current school year.
//   2. Only the student edits, and only before submission.
//   3. Only the teacher who assigned the work grades it and gives feedback.
//
// New work already follows it (02 shares each doc with its student and
// assigning teacher only; 04 and 25 lock a doc at submission). Files made
// before that don't, most visibly because every doc sat in a class folder
// that every student in the class could view. This fixes them, and run again
// after CURRENT_TERM moves to a new school year it revokes last year's.
//
// WHAT IT DOES, per file:
//   Student work docs (Ledger FILE_ID) and warm-up docs (WarmUpRegistry):
//     this school year → the student edits until submission, then views;
//       the assigning teacher comments; nobody else has access.
//     an earlier year → nobody but the file's owner has access. The file is
//       kept as the record.
//   "_Student Shared Folders" class folders: every viewer and editor is
//     removed, which ends the inherited access to the docs inside.
//   "SCR Export — " files: made private (their named viewers stay).
//   The Central Ledger spreadsheet itself: any student account with access is
//     REPORTED, never changed here (removing access from the Ledger by hand
//     is safer than a script guessing who else needs it).
// The file's owner (the admin account) is never touched. A permission that
// comes from a parent folder can't be removed from the file; it is reported,
// and the folder is what needs fixing.
//
// ENTRY POINTS (run from the editor, as the admin):
//   previewStudentDataAccessRepair() — dry run: logs every change it would
//                                      make, changes nothing.
//   applyStudentDataAccessRepair()   — makes the changes. Stops at a time
//                                      budget and resumes where it stopped
//                                      on the next run, so run it until it
//                                      reports "done".
//   previewReviewQueueTextScrub()    — counts ReviewQueue rows still holding
//                                      a student's writing; changes nothing.
//   applyReviewQueueTextScrub()      — empties that column (see below).
// =============================================================================

const SDA_SUBMITTED_STATUSES = ["PENDING_TEACHER_REVIEW", "COMPLIANT"];
const SDA_TIME_BUDGET_MS = 4.5 * 60 * 1000;
const SDA_CURSOR_PROP = "STUDENT_DATA_ACCESS_REPAIR_CURSOR";
const SDA_CLASS_FOLDERS_NAME = "_Student Shared Folders";

function previewStudentDataAccessRepair() {
  return runStudentDataAccessRepair_({ apply: false });
}

function applyStudentDataAccessRepair() {
  return runStudentDataAccessRepair_({ apply: true });
}

/**
 * @param {{apply?: boolean, now?: Date, budgetMs?: number}} opts
 * @returns {{apply: boolean, done: boolean, schoolYear: string, files: number,
 *            changes: Object[], failures: Object[], ledgerStudentAccess: string[]}}
 */
function runStudentDataAccessRepair_(opts) {
  const o = opts || {};
  const apply = o.apply === true;
  const started = Date.now();
  const budget = o.budgetMs || SDA_TIME_BUDGET_MS;
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const year = _currentSchoolYear_(o.now);
  const props = PropertiesService.getScriptProperties();
  const result = { apply: apply, done: false, schoolYear: year, files: 0,
    changes: [], failures: [], ledgerStudentAccess: [] };

  const targets = _sdaTargets_(cfg, ss, year);
  const start = apply ? (Number(props.getProperty(SDA_CURSOR_PROP)) || 0) : 0;
  let i = start;
  for (; i < targets.length; i++) {
    // At least one file per run, so a run always makes progress.
    if (apply && i > start && Date.now() - started > budget) break;
    const t = targets[i];
    result.files++;
    _sdaFixFile_(t, apply, result);
  }
  result.done = i >= targets.length;

  if (result.done) {
    _sdaFixClassFolders_(apply, result);
    _sdaFixExports_(apply, result);
    result.ledgerStudentAccess = _sdaLedgerStudentAccess_(cfg);
    if (apply) props.deleteProperty(SDA_CURSOR_PROP);
  } else if (apply) {
    props.setProperty(SDA_CURSOR_PROP, String(i));
  }

  Logger.log("[S50] " + (apply ? "APPLIED" : "DRY RUN") + " for school year " + year + ": " +
    result.files + " file(s) checked, " + result.changes.length + " change(s)" +
    (apply ? "" : " would be made") + ", " + result.failures.length + " failure(s)." +
    (result.done ? "" : " Stopped at the time budget; run it again to continue from file " + i + "."));
  result.changes.forEach(function (c) {
    Logger.log("[S50]   " + c.what + " " + c.email + " on " + c.target + (c.reason ? " (" + c.reason + ")" : ""));
  });
  result.failures.forEach(function (f) {
    Logger.log("[S50]   FAILED " + f.target + ": " + f.error);
  });
  if (result.ledgerStudentAccess.length) {
    Logger.log("[S50] The Central Ledger itself is shared with student account(s): " +
      result.ledgerStudentAccess.join(", ") + ". Remove them by hand (Share, in the Ledger).");
  }
  return result;
}

// One entry per file: { fileId, label, student, teacher, current, submitted }.
function _sdaTargets_(cfg, ss, year) {
  const out = [];
  const seen = {};
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (ledger && ledger.getLastRow() > 1) {
    ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER.ACADEMIC_YEAR + 1).getValues().forEach(function (row) {
      const fileId = String(row[LEDGER.FILE_ID] || "").trim();
      if (!fileId || seen[fileId]) return;
      seen[fileId] = true;
      out.push({
        fileId: fileId,
        label: "work doc " + String(row[LEDGER.CONFIG_ID] || "") + " (" + String(row[LEDGER.STUDENT_NAME] || "") + ")",
        student: String(row[LEDGER.GOOGLE_ID] || "").trim().toLowerCase(),
        teacher: String(row[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase(),
        current: _isCurrentSchoolYearRow_(row, year),
        submitted: SDA_SUBMITTED_STATUSES.indexOf(String(row[LEDGER.STATUS] || "").trim()) !== -1,
      });
    });
  }
  // WarmUpRegistry: student_email 4, teacher_email 6, doc_id 7, generated_at
  // 9, term 12, extra_credit_checked 13 (25_WarmUpWriter.js WR_*). A
  // warm-up is final once its extra-credit window closed (13 is stamped).
  const wr = ss.getSheetByName(cfg.tabs.warmUpRegistry);
  if (wr && wr.getLastRow() > 1) {
    wr.getRange(2, 1, wr.getLastRow() - 1, Math.max(14, wr.getLastColumn())).getValues().forEach(function (row) {
      const fileId = String(row[7] || "").trim();
      if (!fileId || seen[fileId]) return;
      seen[fileId] = true;
      const rowYear = _schoolYearOfTerm_(row[12]) || _schoolYearForDate_(row[9]);
      out.push({
        fileId: fileId,
        label: "warm-up doc " + String(row[1] || ""),
        student: String(row[4] || "").trim().toLowerCase(),
        teacher: String(row[6] || "").trim().toLowerCase(),
        current: rowYear === year,
        submitted: String(row[13] || "").trim() !== "",
      });
    });
  }
  return out;
}

function _sdaFixFile_(t, apply, result) {
  let file;
  try {
    file = DriveApp.getFileById(t.fileId);
  } catch (e) {
    result.failures.push({ target: t.label, error: "could not open: " + e.message });
    return;
  }
  let owner = "";
  try { owner = String(file.getOwner().getEmail() || "").toLowerCase(); } catch (e) { /* shared drive */ }

  // What each person should end with: "edit", "comment", or nothing.
  const want = {};
  if (t.current) {
    if (t.student) want[t.student] = t.submitted ? "view" : "edit";
    if (t.teacher && t.teacher !== t.student) want[t.teacher] = "comment";
  }
  const reason = t.current ? "" : "earlier school year";

  function change(what, email, fn) {
    result.changes.push({ target: t.label, what: what, email: email, reason: reason });
    if (!apply) return;
    try { fn(); } catch (e) {
      result.failures.push({ target: t.label, error: what + " " + email + ": " + e.message +
        " (likely inherited from a parent folder)" });
    }
  }

  file.getEditors().forEach(function (u) {
    const email = String(u.getEmail() || "").toLowerCase();
    if (!email || email === owner) return;
    const w = want[email];
    if (w === "edit") return;
    change(w ? "downgrade to " + w + ":" : "remove editor", email, function () {
      file.removeEditor(email);
      if (w === "comment") file.addCommenter(email);
      if (w === "view") file.addViewer(email);
    });
  });
  // getViewers() returns viewers and commenters alike.
  file.getViewers().forEach(function (u) {
    const email = String(u.getEmail() || "").toLowerCase();
    if (!email || email === owner) return;
    if (want[email]) return; // kept; a missing role is added below
    change("remove viewer/commenter", email, function () { file.removeViewer(email); });
  });

  const hasAny = {};
  file.getEditors().concat(file.getViewers()).forEach(function (u) { hasAny[String(u.getEmail()).toLowerCase()] = true; });
  Object.keys(want).forEach(function (email) {
    if (email === owner) return;
    const w = want[email];
    if (w === "edit" && !file.getEditors().some(function (u) { return String(u.getEmail()).toLowerCase() === email; })) {
      change("grant edit:", email, function () { file.addEditor(email); });
    } else if (w === "comment" && !hasAny[email]) {
      change("grant comment:", email, function () { file.addCommenter(email); });
    } else if (w === "comment" && apply) {
      // getViewers() can't tell a viewer from a commenter, so make sure of
      // the role without logging a change on every run. A no-op if held.
      try { file.addCommenter(email); } catch (e) { /* reported by the next dry run */ }
    } else if (w === "view" && !hasAny[email]) {
      change("grant view:", email, function () { file.addViewer(email); });
    }
  });
}

// Every class folder under "_Student Shared Folders" loses every viewer and
// editor except its owner: those grants are what gave each classmate access
// to every doc inside.
function _sdaFixClassFolders_(apply, result) {
  let roots;
  try { roots = DriveApp.getFoldersByName(SDA_CLASS_FOLDERS_NAME); } catch (e) { return; }
  while (roots.hasNext()) {
    const root = roots.next();
    const classFolders = root.getFolders();
    while (classFolders.hasNext()) {
      const folder = classFolders.next();
      let owner = "";
      try { owner = String(folder.getOwner().getEmail() || "").toLowerCase(); } catch (e) { /* shared drive */ }
      const label = "class folder " + folder.getName();
      folder.getEditors().concat(folder.getViewers()).forEach(function (u) {
        const email = String(u.getEmail() || "").toLowerCase();
        if (!email || email === owner) return;
        result.changes.push({ target: label, what: "remove folder access", email: email, reason: "class-wide sharing" });
        if (!apply) return;
        try { folder.removeEditor(email); folder.removeViewer(email); } catch (e) {
          result.failures.push({ target: label, error: email + ": " + e.message });
        }
      });
    }
  }
}

function _sdaFixExports_(apply, result) {
  let files;
  try { files = DriveApp.searchFiles('title contains "SCR Export — "'); } catch (e) { return; }
  while (files.hasNext()) {
    const f = files.next();
    if (f.getSharingAccess() === DriveApp.Access.PRIVATE) continue;
    result.changes.push({ target: "export " + f.getName(), what: "make private", email: "(link sharing)", reason: "" });
    if (!apply) continue;
    try { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {
      result.failures.push({ target: "export " + f.getName(), error: e.message });
    }
  }
}

// Student accounts with access to the Central Ledger spreadsheet. Reported
// only: with the student dashboard running as the admin, no student needs it.
function _sdaLedgerStudentAccess_(cfg) {
  try {
    const f = DriveApp.getFileById(cfg.ledgerSsId);
    return f.getEditors().concat(f.getViewers())
      .map(function (u) { return String(u.getEmail() || "").toLowerCase(); })
      .filter(function (e) { return _studentIdPattern_().test(e); });
  } catch (e) {
    return [];
  }
}

// ── ReviewQueue's StudentText column ────────────────────────────────────────
// Until the Student Dashboard stopped storing it (13_StudentDashboard.js),
// every "Run Assignment Check" copied the student's whole response, up to
// 100,000 characters, into column 5 of ReviewQueue on the Admin spreadsheet.
// Nothing ever read it (Flow 2 reads the student's own Doc), so emptying it
// loses nothing. The rows themselves stay: the bridge tracks them by status.
const SDA_RQ_TEXT_COL = 5; // 1-based

function previewReviewQueueTextScrub() {
  return scrubReviewQueueText_({ apply: false });
}

function applyReviewQueueTextScrub() {
  return scrubReviewQueueText_({ apply: true });
}

/**
 * @param {{apply?: boolean}} opts
 * @returns {{apply: boolean, rowsWithText: number, cleared: number, message: string}}
 */
function scrubReviewQueueText_(opts) {
  const apply = !!(opts && opts.apply);
  const sheet = _sdaReviewQueue_();
  const rows = sheet && sheet.getLastRow() > 1
    ? sheet.getRange(2, SDA_RQ_TEXT_COL, sheet.getLastRow() - 1, 1).getValues()
    : [];
  const rowsWithText = rows.filter(function (r) { return String(r[0]).trim() !== ""; }).length;
  let cleared = 0;
  if (apply && rowsWithText) {
    sheet.getRange(2, SDA_RQ_TEXT_COL, rows.length, 1)
      .setValues(rows.map(function () { return [""]; }));
    cleared = rowsWithText;
  }
  const message = apply
    ? "Emptied the student text in " + cleared + " ReviewQueue row(s)."
    : "DRY RUN: " + rowsWithText + " ReviewQueue row(s) hold a student's writing; applyReviewQueueTextScrub() empties them.";
  Logger.log("[ReviewQueue scrub] " + message);
  return { apply: apply, rowsWithText: rowsWithText, cleared: cleared, message: message };
}

// For the health check (10_AdminRecoveryPanel.js): ReviewQueue rows still
// holding a student's writing. 0 when the tab is missing.
function _countReviewQueueRowsWithText_() {
  return scrubReviewQueueText_({ apply: false }).rowsWithText;
}

function _sdaReviewQueue_() {
  const cfg = getConfig_();
  return SpreadsheetApp.openById(cfg.adminSsId).getSheetByName(cfg.tabs.reviewQueue);
}
