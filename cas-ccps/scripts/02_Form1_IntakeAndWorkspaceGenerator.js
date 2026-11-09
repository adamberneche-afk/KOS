// =============================================================================
// FILE: 02_Form1_IntakeAndWorkspaceGenerator.js
// BOUND TO: Central Ledger spreadsheet
// PURPOSE: On Form 1 submission — copies master student template (not teacher
//          prompt doc directly), injects teacher prompt content into Zone 2,
//          stamps system IDs as embedded fallback, completes three-zone structure,
//          shares into student Drive folder, registers ledger row.
//
// FORM 1 DISAMBIGUATION:
//   The central ledger receives responses from TWO forms — Form 1 (student
//   intake) and Form 2 (turn-in). onFormSubmit identifies which form fired
//   by checking for the presence of "Student Google Account" in namedValues.
//   If absent, it's a turn-in response and this function exits immediately.
//
// TRIGGER: dispatched from 18_FormSubmitDispatcher.js → onFormSubmit_Intake
// =============================================================================

function onFormSubmit_Intake(e) {
  const r = e.namedValues;

  // DISAMBIGUATION — exit immediately if this is a Turn-In Form submission
  // Turn-in responses don't have "Student Google Account" field
  if (!r["Student Google Account"]) {
    Logger.log("onFormSubmit_Intake: not a Form 1 submission — skipping.");
    return;
  }

  const cfg = getConfig_();

  // Lowercased: Google account addresses are case-insensitive, and the
  // student-ID check below is not, so "1234567@CCPSNET.NET" (a phone's
  // auto-capitalization, or caps lock) was rejected as an invalid account.
  const googleId     = (r["Student Google Account"]?.[0]?.trim() || "").toLowerCase();
  const studentName  = r["Student Full Name"]?.[0]?.trim()      || "";
  const block        = r["Block"]?.[0]?.trim()                  || "";
  const className    = r["Class Name"]?.[0]?.trim()             || "";
  const subject      = r["Subject"]?.[0]?.trim()                || "";
  const courseName   = r["Course Name"]?.[0]?.trim()            || "";
  const period       = r["Period"]?.[0]?.trim()                 || "";
  const teacherName  = r["Teacher Name"]?.[0]?.trim()           || "";
  const teacherEmail = r["Teacher Email"]?.[0]?.trim()          || "";
  const unitConfigId = r["Assignment Config ID"]?.[0]?.trim()   || "";

  if (!googleId || !studentName || !unitConfigId) {
    Logger.log("Form 1 rejected — missing required fields.");
    return;
  }

  // The intake form's "Student Google Account" field is free-text, not a
  // validated picker — googleId below flows straight into addEditor()/
  // addViewer() in shareToStudentDrive_(). _studentIdPattern_() (defined in
  // 29_StudentContextAggregator.js, same shared GAS scope) already exists
  // and is used correctly on the read/reporting side, but was never applied
  // at this, the one call site that actually grants Drive access — a typo
  // or a bad-faith entry here shares the class folder and student doc with
  // an unrelated Google account while the real student is locked out.
  const res = intakeStudent_(cfg, {
    googleId: googleId, studentName: studentName, block: block, className: className,
    subject: subject, courseName: courseName, period: period, teacherName: teacherName,
    teacherEmail: teacherEmail, unitConfigId: unitConfigId
  });
  if (res.ok) return;

  if (res.code === "INVALID_ACCOUNT") {
    Logger.log("Form 1 rejected — the account entered is not a valid student Google account (expected " + studentIdDescription_() + " @" + _studentEmailDomain_() + ").");
    notifyIntakeRejected_(cfg, {
      studentName: studentName, googleId: googleId,
      teacherEmail: teacherEmail, unitConfigId: unitConfigId,
      reason: "\"" + googleId + "\" is not a district student account. Student accounts " +
              "are " + studentIdDescription_() + " @" + _studentEmailDomain_() + ".",
      fix:    "Have the student resubmit the intake form with their school account."
    });
    return;
  }

  if (res.code === "NO_LIVE_ASSIGNMENT") {
    Logger.log("Form 1 rejected — no LIVE assignment for ConfigID: " + unitConfigId);
    notifyIntakeRejected_(cfg, {
      studentName: studentName, googleId: googleId,
      teacherEmail: teacherEmail, unitConfigId: unitConfigId,
      reason: "No LIVE assignment has Assignment Config ID \"" + unitConfigId + "\".",
      fix:    "Check that the ID on the form matches a row in your Teacher Matrix and " +
              "that the row's status is LIVE, then have the student resubmit."
    });
    return;
  }

  if (res.code === "NO_WORK_TEMPLATE") {
    Logger.log("Form 1 rejected — no template file set for the " + res.workType + " part " + unitConfigId);
    notifyIntakeRejected_(cfg, {
      studentName: studentName, googleId: googleId,
      teacherEmail: teacherEmail, unitConfigId: unitConfigId,
      reason: "\"" + unitConfigId + "\" is a " + res.workType + " part, and its template " + res.workType + " isn't set.",
      fix:    "Set the part's WORK_TEMPLATE_… Script Property on the Central Ledger to the template " + res.workType + "'s ID " +
              "(cas-ccps/README.md, work types), then have the student resubmit."
    });
    return;
  }

  if (res.code === "NO_MASTER_TEMPLATE") {
    const errMsg =
      "Student registration failed for " + studentName + ".\n\n" +
      "REASON: The Master Student Template has not been configured.\n\n" +
      "The system administrator needs to:\n" +
      "  1. Create the Master Student Template Google Doc\n" +
      "  2. Bind Scripts 00, 01, 09, and 17 to it\n" +
      "  3. Set MASTER_STUDENT_TEMPLATE_ID in the admin Script Properties\n\n" +
      "Until this is done, no student documents can be created.\n\n" +
      "Assignment Config ID: " + unitConfigId;

    // Write error row to Ledger so it surfaces in dashboards and health check
    registerLedger_(cfg, googleId, studentName, "ERROR-" + generateConfigId_(), "",
                    block, className, teacherName, teacherEmail,
                    subject, courseName, period, "");
    // Override the status to ERROR after registering
    try {
      const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
      const sheet = ss.getSheetByName(cfg.tabs.ledger);
      const last  = sheet.getLastRow();
      sheet.getRange(last, 13).setValue("ERROR: MASTER_TEMPLATE_NOT_CONFIGURED");
    } catch (e) { /* non-fatal */ }

    // Alert teacher by email
    if (teacherEmail) {
      MailApp.sendEmail(casMail_(
        teacherEmail,
        "⚠️ Student Registration Failed — " + studentName,
        errMsg
      ));
    }

    // Alert admin
    if (cfg.adminNotifyEmail && cfg.adminNotifyEmail !== teacherEmail) {
      MailApp.sendEmail(casMail_(cfg.adminNotifyEmail,
        "⚠️ MASTER_STUDENT_TEMPLATE_ID Not Configured — Registration Failed",
        errMsg
      ));
    }

    Logger.log("Form 1 error — MASTER_STUDENT_TEMPLATE_ID not set.");
  }
}

// ---------------------------------------------------------------------------
// intakeStudent_ — the one path that creates a student's workspace
// Validates the account, looks up the LIVE assignment, copies the master
// template, stamps the doc, shares it with the student and the assigning
// teacher, and writes the Ledger row. Called by onFormSubmit_Intake (Form 1)
// and by 52_CanvasRosterImport.js, so a student enrolled from a Canvas
// roster is set up exactly as one who submitted the form.
//
// s: { googleId, studentName, block, className, subject, courseName,
//      period, teacherName, teacherEmail, unitConfigId }
// Returns { ok: true, studentConfigId, fileId, docUrl } or
//         { ok: false, code: INVALID_ACCOUNT | NO_LIVE_ASSIGNMENT | NO_MASTER_TEMPLATE
//           | NO_WORK_TEMPLATE (a form or Slides part whose template property
//             is unset; workType says which) }
// Nothing is written on failure; the caller decides how to report it.
// ---------------------------------------------------------------------------
// What intakeStudent_ looks up that is the same for every student in a run
// (2026-10-29): the assignment (the Ledger, MatrixRegistry and the whole
// Teacher Matrix), the teacher's prompt doc, the admin folders and the
// Ledger itself. A roster run used to repeat all of it per student, so a
// rollout run made about 20 docs before its time budget. Kept for one
// execution only; a failed lookup is not kept, so the next student retries.
let _intakeMemo_ = null;
function _intakeMemoFor_(cfg) {
  if (!_intakeMemo_ || _intakeMemo_.ledgerSsId !== cfg.ledgerSsId) {
    _intakeMemo_ = { ledgerSsId: cfg.ledgerSsId, assignments: {}, prompts: {}, folders: {}, ledger: null };
  }
  return _intakeMemo_;
}
function _intakeLedgerSs_(cfg) {
  const m = _intakeMemoFor_(cfg);
  if (!m.ledger) m.ledger = SpreadsheetApp.openById(cfg.ledgerSsId);
  return m.ledger;
}

function intakeStudent_(cfg, s) {
  const googleId = String(s.googleId || "").trim().toLowerCase();
  const studentName = s.studentName, block = s.block, className = s.className;
  const subject = s.subject, courseName = s.courseName, period = s.period;
  const teacherName = s.teacherName, teacherEmail = s.teacherEmail || "";
  const unitConfigId = s.unitConfigId;

  // The intake form's "Student Google Account" field is free-text, not a
  // validated picker — googleId below flows straight into addEditor()/
  // addViewer() in shareToStudentDrive_(). _studentIdPattern_() (defined in
  // 29_StudentContextAggregator.js, same shared GAS scope) already exists
  // and is used correctly on the read/reporting side, but was never applied
  // at this, the one call site that actually grants Drive access — a typo
  // or a bad-faith entry here shares the class folder and student doc with
  // an unrelated Google account while the real student is locked out.
  if (!_studentIdPattern_().test(googleId)) return { ok: false, code: "INVALID_ACCOUNT" };

  // Fetch LIVE assignment from Teacher Matrix via MatrixRegistry (once a run)
  const memo = _intakeMemoFor_(cfg);
  const assignment = memo.assignments[unitConfigId] || fetchAssignment_(cfg, unitConfigId);
  if (!assignment) return { ok: false, code: "NO_LIVE_ASSIGNMENT" };
  memo.assignments[unitConfigId] = assignment;

  // The assigning teacher is the owner of the matrix the assignment came
  // from (MatrixRegistry). The form's "Teacher Email" is typed by the
  // student, so it can't decide access or grading. Fall back to it only for
  // a registry row with no email, and say so.
  const assignedTeacherEmail = assignment.teacherEmail || teacherEmail.toLowerCase();
  if (!assignment.teacherEmail) {
    Logger.log("Form 1 — MatrixRegistry has no TeacherEmail for the matrix holding " + unitConfigId +
      "; using the form's Teacher Email (" + teacherEmail + ").");
  } else if (teacherEmail && assignment.teacherEmail !== teacherEmail.toLowerCase()) {
    Logger.log("Form 1 — the form says teacher " + teacherEmail + " but " + unitConfigId +
      " belongs to " + assignment.teacherEmail + "'s matrix; using the matrix owner.");
  }

  // A part marked workType "form" or "slides" (68's partWorkFile_, Phase
  // 4a/4c) gets a copy of its own template file instead of the master doc.
  const work = partWorkFile_(unitConfigId);
  if (work.type !== "doc") {
    const templateId = work.templateKey ? String(_resolveConfigValues_().values[work.templateKey] || "").trim() : "";
    if (!templateId) return { ok: false, code: "NO_WORK_TEMPLATE", workType: work.type };
    return _intakeWorkFile_(cfg, s, googleId, assignment, assignedTeacherEmail, templateId, memo, work.type);
  }

  // Copy MASTER STUDENT TEMPLATE (not teacher's prompt doc)
  // This ensures Script 01 is pre-bound on every student doc
  const masterTemplateId = cfg.masterStudentTemplateId;
  if (!masterTemplateId) return { ok: false, code: "NO_MASTER_TEMPLATE" };

  // Generate student-specific CONFIG_ID
  const studentConfigId = generateConfigId_();

  // Resolve admin folder hierarchy (each level once a run)
  const adminStudentFolder = resolveAdminPath_(cfg.adminRootFolderId, [
    subject, courseName, teacherName, "Period " + period, studentName
  ], memo.folders);

  const masterFile = DriveApp.getFileById(masterTemplateId);
  const docFile    = masterFile.makeCopy(
    assignment.unitName + " — " + studentName,
    adminStudentFolder
  );
  const fileId = docFile.getId();

  // Fetch teacher prompt content to inject into Zone 2 (once a run)
  const promptKey = assignment.promptTemplateId || "";
  let promptContent = memo.prompts[promptKey];
  if (promptContent === undefined) {
    promptContent = fetchPromptContent_(assignment.promptTemplateId);
    if (promptContent !== PROMPT_LOAD_FAILED) memo.prompts[promptKey] = promptContent;
  }

  // Build the full three-zone document structure AND stamp system IDs
  // in a single open/close cycle to prevent document lock errors
  stampDocument_(
    fileId, studentConfigId, studentName, block,
    className, teacherName, period, assignment.unitName,
    promptContent, cfg.ledgerSsId, cfg.adminSsId, cfg.studentDashboardUrl
  );

  // Share the doc with its student (edit, until submission) and the
  // assigning teacher (comment). Nobody else. With deferShare (58's nightly
  // rollout, for a lesson that hasn't reached its release night) only the
  // teacher is added now, and the Ledger row is SCHEDULED until the rollout
  // shares the doc and sets it ACTIVE.
  const deferShare = s.deferShare === true;
  shareToStudentDrive_(cfg, docFile, deferShare ? "" : googleId, assignedTeacherEmail);

  // Register in Ledger
  registerLedger_(cfg, googleId, studentName, studentConfigId, fileId,
                  block, className, teacherName, assignedTeacherEmail,
                  subject, courseName, period, docFile.getUrl(),
                  deferShare ? "SCHEDULED" : "ACTIVE");
  recordStudentAssignment_(_intakeLedgerSs_(cfg), studentConfigId, googleId, unitConfigId);

  // No name: execution logs get copied out of the account (a roster import's
  // log, pasted 2026-10-07, carried every student's name). The Ledger row has it.
  Logger.log(
    "Workspace created — ConfigID: " + studentConfigId +
    " | Assignment: " + unitConfigId +
    " | Period: " + period
  );
  return { ok: true, studentConfigId: studentConfigId, fileId: fileId, docUrl: docFile.getUrl(),
    teacherEmail: assignedTeacherEmail };
}

// A form or Slides part's copy (Phase 4a/4c, meta/STUDENT_WORK_PLAN_2026-10.md
// §5): the part's template file copied with DriveApp, as the doc is (no
// FormApp or SlidesApp call, so no Forms or Slides scope is used here), into
// the same admin folder, shared and recorded the same way, SCHEDULED with
// deferShare until the part unlocks (68) or its release night (58). Nothing
// is stamped: a form or deck has no response zone, and the template is blank
// (a form with a title only; a deck with one empty title slide), because
// making it is the student's work. The assigning teacher is added as an
// editor of a form (Forms have no comment access) and as a commenter on a
// deck, as on a doc; nobody else. The Ledger row's ADMIN_FILE_URL is the
// copy's own URL, which is how every reader tells its type (00's
// workFileTypeOfUrl_).
const WORK_FILE_TEACHER_ROLE = { form: "writer", slides: "commenter" };
function _intakeWorkFile_(cfg, s, googleId, assignment, teacherEmail, templateId, memo, type) {
  const studentConfigId = generateConfigId_();
  const folder = resolveAdminPath_(cfg.adminRootFolderId, [
    s.subject, s.courseName, s.teacherName, "Period " + s.period, s.studentName
  ], memo.folders);
  const file = DriveApp.getFileById(templateId).makeCopy(assignment.unitName + " — " + s.studentName, folder);
  const deferShare = s.deferShare === true;
  if (!deferShare) {
    try { file.addEditor(googleId); } catch (err) { Logger.log("Share warning for the student's account: " + err.message); }
  }
  if (teacherEmail) {
    try { shareWithoutEmail_(file, teacherEmail, WORK_FILE_TEACHER_ROLE[type] || "commenter"); } catch (err) { Logger.log("Teacher access warning for " + teacherEmail + ": " + err.message); }
  }
  const url = workFileUrl_(file.getId(), type);
  // Its snapshot doc, the copy's feedback page (Phase 4b/4c): made and
  // shared now, beside it, so Submit (13, which has no Drive scope) only
  // rewrites it.
  const snapshotDoc = _makeFormSnapshotDoc_(cfg, s, studentConfigId, assignment.unitName, folder,
    deferShare ? "" : googleId, teacherEmail, type);
  registerLedger_(cfg, googleId, s.studentName, studentConfigId, file.getId(),
                  s.block, s.className, s.teacherName, teacherEmail,
                  s.subject, s.courseName, s.period, url,
                  deferShare ? "SCHEDULED" : "ACTIVE");
  recordStudentAssignment_(_intakeLedgerSs_(cfg), studentConfigId, googleId, s.unitConfigId);
  recordFormSnapshot_(_intakeLedgerSs_(cfg), studentConfigId, file.getId(), snapshotDoc.getId(), s.unitConfigId);
  Logger.log((type === "form" ? "Form" : "Slides") + " workspace created — ConfigID: " + studentConfigId +
    " | Assignment: " + s.unitConfigId + " | Period: " + s.period);
  return { ok: true, studentConfigId: studentConfigId, fileId: file.getId(), docUrl: url, teacherEmail: teacherEmail, workType: type };
}

// What a snapshot doc calls the work it copies, by type.
const WORK_SNAPSHOT_WORDS = {
  form:   { noun: "your form", what: "your form's questions and settings", change: "Change your form, not this page.",
            ready: "When your form is ready" },
  slides: { noun: "your slides", what: "the words on your slides, your speaker notes, and how many pictures and charts each slide has",
            change: "Change your slides, not this page.", ready: "When your slides are ready" }
};

// A form or deck copy's snapshot doc (Phase 4b, 2026-11-08; decks, 4c): a
// Google Doc in the student's admin folder beside the copy, owned by the
// system account, shared with the student (commenter, once the part is open:
// they read the file as checked and the feedback, and can't change what was
// judged) and
// the assigning teacher (commenter, as on a doc). It is laid out like a
// student doc's lower half, so every reader of a doc reads it unchanged:
// the page header (63, "Feedback: …"), the feedback zone (unless feedback
// is a comment), then the response marker, the snapshot (13 rewrites it at
// each Submit, from 75), and the "[CONFIG_ID:" line every reader stops at.
// Returns the Document.
function _makeFormSnapshotDoc_(cfg, s, studentConfigId, unitName, folder, studentAccount, teacherEmail, type) {
  const w = WORK_SNAPSHOT_WORDS[type] || WORK_SNAPSHOT_WORDS.form;
  const doc = DocumentApp.create(unitName + " — " + s.studentName + " — " + w.noun + ", as checked");
  const file = DriveApp.getFileById(doc.getId());
  file.moveTo(folder);
  writeDocHeader_(doc,
    [s.studentName, s.className + " — " + s.teacherName,
     s.block ? "Block " + s.block : "", s.period ? "Period " + s.period : ""]
      .filter(function (x) { return String(x || "").trim() !== ""; })
      .join("  ·  "),
    cfg.studentDashboardUrl, unitName);
  const body = doc.getBody();
  const title = body.appendParagraph(unitName + " — " + w.noun + ", as checked");
  title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  title.editAsText().setFontSize(14).setBold(true);
  _docFontSize_(body.appendParagraph(
    "The system writes this page. Each time you press Submit for Feedback, it copies " + w.what +
    " here, and that copy is what the check reads. " + w.change), DOC_BODY_FONT_SIZE);
  if (!feedbackAsCommentFor_(studentConfigId, s.className)) {
    _docFontSize_(body.appendParagraph("── FEEDBACK ──"), DOC_BODY_FONT_SIZE);
    _docFontSize_(body.appendParagraph(
      "[No feedback yet. " + w.ready + ", open your assignment dashboard (link at the top) " +
      "and click Submit for Feedback. Your feedback will appear here.]"), DOC_BODY_FONT_SIZE);
    _docFontSize_(body.appendParagraph("── END FEEDBACK ──"), DOC_BODY_FONT_SIZE);
  }
  body.appendParagraph("── YOUR RESPONSE BEGINS HERE ──")
    .editAsText().setFontSize(10).setForegroundColor(DOC_HEADER_GREY);
  _docFontSize_(body.appendParagraph(workSnapshotNotSubmitted_(type)), DOC_BODY_FONT_SIZE);
  body.appendParagraph("[CONFIG_ID: " + studentConfigId + "]").editAsText().setFontSize(1).setForegroundColor("#ffffff");
  body.appendParagraph("↑ The copy of " + w.noun + " ends above. Nothing below this is checked.")
    .editAsText().setFontSize(DOC_BODY_FONT_SIZE).setForegroundColor(DOC_HEADER_GREY);
  doc.saveAndClose();
  if (studentAccount) {
    try { file.addCommenter(studentAccount); } catch (err) { Logger.log("Snapshot share warning for the student's account: " + err.message); }
  }
  if (teacherEmail) {
    try { shareWithoutEmail_(file, teacherEmail, "commenter"); } catch (err) { Logger.log("Snapshot access warning for " + teacherEmail + ": " + err.message); }
  }
  return doc;
}

// One FormSnapshots row (00): the form or deck copy, its snapshot doc, the
// part, and the part's exact checks for its type as JSON (68's
// partWorkChecks_). IDs only.
function recordFormSnapshot_(ss, studentConfigId, formFileId, snapshotDocId, partConfigId) {
  let sheet = ss.getSheetByName(FORM_SNAPSHOTS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(FORM_SNAPSHOTS_TAB);
    sheet.appendRow(FORM_SNAPSHOTS_HEADERS);
  }
  const at = sheet.getLastRow() + 1;
  sheet.getRange(at, FS.STUDENT_CONFIG_ID + 1, 1, 4).setNumberFormat("@"); // the IDs, as text
  sheet.getRange(at, 1, 1, FORM_SNAPSHOTS_HEADERS.length).setValues([[new Date(), studentConfigId, formFileId,
    snapshotDocId, partConfigId, JSON.stringify(partWorkChecks_(partConfigId)), ""]]);
}

// refreshFormSnapshots — run by hand from the Central Ledger's editor
// (Phase 4b; decks too since 4c): every form or deck copy on the Ledger gets
// a snapshot doc if it has none (made and shared as at intake; the student
// only once the row is open), and every FormSnapshots row's FormChecks is
// rewritten from the parts data now, so a part's formChecks or slideChecks
// changed after its copies were made apply at the next Submit. Logs counts
// only.
function refreshFormSnapshots() {
  const cfg = getConfig_();
  const ss = _intakeLedgerSs_(cfg);
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (!ledger || ledger.getLastRow() < 2) { Logger.log("refreshFormSnapshots: no Ledger rows."); return { made: 0, updated: 0, failed: 0 }; }
  const byStudent = readStudentAssignments_(ss).byStudent;
  const data = ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER_COL_COUNT).getValues();
  const out = { made: 0, updated: 0, failed: 0 };
  data.forEach(function (r) {
    const type = workFileTypeOfUrl_(r[LEDGER.ADMIN_FILE_URL]);
    if (!workFileHasSnapshot_(type)) return;
    const status = String(r[LEDGER.STATUS]).trim();
    if (status === "ARCHIVED") return;
    const formId = String(r[LEDGER.FILE_ID]).trim();
    if (formSnapshotFor_(ss, formId)) return;
    const sid = String(r[LEDGER.CONFIG_ID]).trim();
    try {
      const folder = DriveApp.getFileById(formId).getParents().next();
      const s = { studentName: String(r[LEDGER.STUDENT_NAME]).trim(), className: String(r[LEDGER.CLASS_NAME]).trim(),
        teacherName: String(r[LEDGER.TEACHER_NAME]).trim(), block: String(r[LEDGER.BLOCK]).trim(),
        period: String(r[LEDGER.PERIOD]).trim() };
      const unitName = String(r[LEDGER.COURSE_NAME]).trim();
      const doc = _makeFormSnapshotDoc_(cfg, s, sid, unitName, folder,
        status === "SCHEDULED" ? "" : String(r[LEDGER.GOOGLE_ID]).trim(), String(r[LEDGER.TEACHER_EMAIL]).trim(), type);
      recordFormSnapshot_(ss, sid, formId, doc.getId(), byStudent[sid] || "");
      out.made++;
    } catch (e) {
      Logger.log("refreshFormSnapshots: no snapshot made for ConfigID " + sid + ": " + e.message);
      out.failed++;
    }
  });
  const sheet = ss.getSheetByName(FORM_SNAPSHOTS_TAB);
  if (sheet && sheet.getLastRow() >= 2) {
    const n = sheet.getLastRow() - 1;
    const rows = sheet.getRange(2, 1, n, FORM_SNAPSHOTS_HEADERS.length).getValues();
    const checks = rows.map(function (row) {
      const part = String(row[FS.PART_CONFIG_ID]).trim() || byStudent[String(row[FS.STUDENT_CONFIG_ID]).trim()] || "";
      const now = JSON.stringify(partWorkChecks_(part));
      if (now !== String(row[FS.FORM_CHECKS])) out.updated++;
      return [now];
    });
    sheet.getRange(2, FS.FORM_CHECKS + 1, n, 1).setValues(checks);
  }
  Logger.log("refreshFormSnapshots: " + out.made + " snapshot doc(s) made, " + out.updated +
    " row(s) with new checks, " + out.failed + " failed.");
  return out;
}

// ---------------------------------------------------------------------------
// fetchAssignment_ — reads Teacher Matrix via MatrixRegistry
// Uses ConfigID prefix lookup to go directly to the right matrix SS
// avoiding O(n×m) scan across all teacher spreadsheets
// ---------------------------------------------------------------------------
// Both rejections above used to end at Logger.log, which only the script
// owner's execution log ever shows. The student got no document, the
// teacher saw nothing, and the student simply never appeared. This emails
// the teacher named on the form, and the admin, the same way the
// MASTER_STUDENT_TEMPLATE_ID failure does. No Ledger row is written: the
// account may be someone else's, or not an account at all, and the Ledger
// is what other scripts share documents from.
// Mail is best effort: a quota or bad-address failure is logged, never
// thrown, so it can't turn a rejected submission into a failed trigger.
function notifyIntakeRejected_(cfg, d) {
  const subject = "⚠️ Student Registration Failed — " + (d.studentName || d.googleId || "unknown student");
  const body =
    "A student intake form submission was not processed, so no student document was created.\n\n" +
    "Student: " + (d.studentName || "(blank)") + "\n" +
    "Account entered: " + (d.googleId || "(blank)") + "\n" +
    "Assignment Config ID: " + (d.unitConfigId || "(blank)") + "\n\n" +
    "REASON: " + d.reason + "\n\n" +
    "TO FIX: " + d.fix + "\n";

  const recipients = [];
  if (d.teacherEmail) recipients.push(d.teacherEmail);
  if (cfg.adminNotifyEmail &&
      cfg.adminNotifyEmail.toLowerCase() !== String(d.teacherEmail || "").toLowerCase()) {
    recipients.push(cfg.adminNotifyEmail);
  }
  if (!recipients.length) {
    Logger.log("Form 1 rejection not emailed — no Teacher Email on the form and no ADMIN_NOTIFY_EMAIL set.");
  }
  recipients.forEach(function (to) {
    try { MailApp.sendEmail(casMail_(to, subject, body)); }
    catch (e) { Logger.log("Form 1 rejection email to " + to + " failed: " + e.message); }
  });
}

function fetchAssignment_(cfg, unitConfigId) {
  try {
    const centralSs = SpreadsheetApp.openById(cfg.ledgerSsId);
    const registry  = centralSs.getSheetByName(cfg.tabs.matrixRegistry);
    if (!registry) {
      Logger.log("MatrixRegistry tab not found.");
      return null;
    }

    const regData = registry.getDataRange().getValues();
    // Registry columns: 0:TeacherName 1:TeacherEmail 2:MatrixSsId 3:Created
    // Each teacher's matrix is registered once — scan registry (small) first,
    // then open only the one matching matrix
    for (let r = 1; r < regData.length; r++) {
      const matrixSsId = String(regData[r][2]).trim();
      if (!matrixSsId) continue;

      try {
        const matrixSs    = SpreadsheetApp.openById(matrixSsId);
        const matrixSheet = matrixSs.getSheetByName(cfg.tabs.teacherMatrix);
        if (!matrixSheet) continue;

        const data = matrixSheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          if (
            String(data[i][0]).trim() === unitConfigId &&
            String(data[i][11]).trim() === "LIVE"
          ) {
            return {
              configId:         String(data[i][0]).trim(),
              unitName:         String(data[i][1]).trim(),
              tier:             String(data[i][2]).trim(),
              promptTemplateId: String(data[i][12]).trim(),
              courseName:       String(data[i][14] || "").trim(),
              // The matrix's owner is the teacher who assigned the work.
              // This, not the form's student-typed "Teacher Email", decides
              // who may see, comment on and grade the student's doc.
              teacherEmail:     String(regData[r][1] || "").trim().toLowerCase(),
              teacherName:      String(regData[r][0] || "").trim()
            };
          }
        }
      } catch (inner) {
        Logger.log("Could not read matrix " + matrixSsId + ": " + inner.message);
      }
    }
    return null;
  } catch (e) {
    Logger.log("fetchAssignment_ error: " + e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// fetchPromptContent_ — reads the teacher's prompt template doc as plain text
// Returns the content to inject into Zone 2 of the student doc
// ---------------------------------------------------------------------------
const PROMPT_LOAD_FAILED = "[Assignment prompt could not be loaded. Contact your teacher.]";
function fetchPromptContent_(promptTemplateId) {
  if (!promptTemplateId) return "";
  try {
    const promptDoc  = DocumentApp.openById(promptTemplateId);
    const body       = promptDoc.getBody();
    // Return the full text — stampDocument_ will insert it as Zone 2
    return body.getText().trim();
  } catch (e) {
    Logger.log("fetchPromptContent_ error: " + e.message);
    return PROMPT_LOAD_FAILED;
  }
}

// Text sizes in a student doc (2026-10-22, the operator's choice): the
// assignment and the feedback zone small, the student's own writing larger,
// so the page reads as "their work" first. The page header is 8 too (63).
const DOC_BODY_FONT_SIZE     = 8;
const DOC_RESPONSE_FONT_SIZE = 10;

// Sets a paragraph's font size through its attributes, which also holds
// for an empty paragraph: the student's writing space is one, and what they
// type there takes its size.
function _docFontSize_(para, size) {
  const attrs = {};
  attrs[DocumentApp.Attribute.FONT_SIZE] = size;
  para.setAttributes(attrs);
  return para;
}

// A lesson's *emphasis* in italics, not as literal asterisks (2026-10-22):
// returns the line without them and the [start, end] ranges to italicize.
function _docItalicSpans_(line) {
  const spans = [];
  let text = "";
  let last = 0;
  const re = /\*([^*\n]+)\*/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    text += line.slice(last, m.index);
    spans.push([text.length, text.length + m[1].length - 1]);
    text += m[1];
    last = m.index + m[0].length;
  }
  return { text: text + line.slice(last), spans: spans };
}

// The task as the doc shows it (2026-10-22, UX audit fix-first 11): without
// the task's title line ("Assignment: ...", or an 8175 lesson's "Project:",
// "Discussion:" or "Extra Credit:" first line; "Title: Assignment: ..."
// before 2026-10-28; the doc has its own title heading) and its closing
// "Submission:" part ("Submit your response as a Text Entry"), which
// contradicts CAS. The lesson data keeps both: the lesson editor and the
// Canvas cartridge read it as written.
function _docStudentTask_(text) {
  const paras = String(text || "").trim().split(/\n{2,}/)
    .filter((p, i) => !/^(Title:|Assignment:)/.test(p.trim()) &&
      !(i === 0 && /^(Project|Discussion|Extra Credit):/.test(p.trim())));
  const t = paras.join("\n\n");
  const sub = t.search(/(^|\n\n)Submission:\s*(\n|$)/);
  return (sub === -1 ? t : t.slice(0, sub)).trim();
}

// The writing space's empty lines, and the doc's last line (stampDocument_).
const DOC_WRITING_LINES = 6;
const DOC_BELOW_END_NOTE = "↑ Write your response above. Nothing below this is checked.";

// The assignment in a two-row table (2026-10-24, the operator's layout): the
// task under a grey label, and what the work needs to show (the student's
// "I can" objectives, as a checklist) under a blue one. Text at 9 pt.
const DOC_TABLE_FONT_SIZE = 9;
const DOC_SHOW_HEADING = "What your work needs to show:";
const DOC_TABLE_SECTIONS = {
  task: { label: "The assignment", labelColor: "#e8eaed", bodyColor: "#ffffff" },
  show: { label: "What your work needs to show", labelColor: "#d2e3fc", bodyColor: "#f4f8fe" }
};

// One table section: a label row, then a body row with the text laid out:
// a short line ending ":" is a bold heading, "- " lines are a bulleted list
// (a checklist "☐" in the objectives section), the rest plain paragraphs.
function _docTableSection_(table, section, text, checklist) {
  const head = table.appendTableRow().appendTableCell(section.label);
  head.setBackgroundColor(section.labelColor);
  head.getChild(0).asParagraph().editAsText().setFontSize(DOC_TABLE_FONT_SIZE).setBold(true);
  const cell = table.appendTableRow().appendTableCell("");
  cell.setBackgroundColor(section.bodyColor);
  String(text || "").split("\n").forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const item = /^- /.test(line);
    const md = _docItalicSpans_(item ? line.slice(2) : line);
    let para;
    if (item && !checklist) {
      para = cell.appendListItem(md.text).setGlyphType(DocumentApp.GlyphType.BULLET);
    } else if (item) {
      para = cell.appendParagraph("☐ " + md.text);
      md.spans = md.spans.map(sp => [sp[0] + 2, sp[1] + 2]);
    } else if (/:$/.test(line) && line.length < 60) {
      para = cell.appendParagraph(md.text.replace(/:$/, ""));
      para.editAsText().setBold(true);
      para.setSpacingBefore(6);
    } else {
      para = cell.appendParagraph(md.text);
    }
    _docFontSize_(para, DOC_TABLE_FONT_SIZE);
    md.spans.forEach(sp => para.editAsText().setItalic(sp[0], sp[1], true));
    _docLinkUrls_(para);
  });
  // A new cell starts with one empty paragraph; drop it once there is text.
  if (cell.getNumChildren() > 1) cell.removeChild(cell.getChild(0));
}

function _docAssignmentTable_(body, promptContent) {
  const task = _docStudentTask_(promptContent);
  const cut = task.indexOf(DOC_SHOW_HEADING);
  const table = body.appendTable();
  _docTableSection_(table, DOC_TABLE_SECTIONS.task, cut === -1 ? task : task.slice(0, cut), false);
  if (cut !== -1) {
    _docTableSection_(table, DOC_TABLE_SECTIONS.show, task.slice(cut + DOC_SHOW_HEADING.length), true);
  }
  table.setBorderColor("#9aa0a6");
  return table;
}

// Makes every https:// address in a paragraph a link (a lesson's video
// links, VIDEO_LINKS.json, 2026-10-24). A trailing ")" or "." isn't part of
// the address. A paragraph that can't take a link keeps the plain text.
function _docLinkUrls_(para) {
  const text = para.getText();
  const re = /https:\/\/[^\s()<>"]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const url = m[0].replace(/[.,;:]+$/, "");
    try {
      para.editAsText().setLinkUrl(m.index, m.index + url.length - 1, url);
    } catch (e) {
      Logger.log("stampDocument_: no link for an address in the task: " + e.message);
    }
  }
}

// The doc's own navigation (stampDocument_). None of it may contain the
// response marker's text.
const DOC_RESPONSE_HEADING   = "Your response";
const DOC_WRITE_BELOW        = "Write your answer under the grey line below.";
const DOC_JUMP_TO_RESPONSE   = "↓ Go to your response";
const DOC_JUMP_TO_ASSIGNMENT = "↑ Back to the assignment";

// Links `label` (the end of `para`'s text) to a bookmark at the start of
// `target`. A doc that can't take the bookmark keeps the plain text.
function _docLinkToBookmark_(doc, para, label, target) {
  try {
    const bookmark = doc.addBookmark(doc.newPosition(target, 0));
    const text = para.getText();
    const start = text.lastIndexOf(label);
    para.editAsText().setLinkUrl(start, start + label.length - 1, "#bookmark=" + bookmark.getId());
  } catch (e) {
    Logger.log("stampDocument_: no jump link (" + label + "): " + e.message);
  }
}

// ---------------------------------------------------------------------------
// stampDocument_ — builds the four-zone structure AND stamps system IDs
// in a single open/close cycle. System IDs are written as invisible text
// below the CONFIG_ID footer for Script 01's ID fallback.
//
// Zone 1: Feedback header  (prepend zone — Studio writes here)
// Zone 2: Assignment prompt (injected from teacher's template), as a two-row
//         table: the task, then what the work needs to show
// Zone 3: "Your response" heading, the jump link back, the response
//         divider and the student work area
// Zone 4: CONFIG_ID + system ID block (one invisible line, the response
//         zone's end) and the assignment code in the page footer
// ---------------------------------------------------------------------------
function stampDocument_(fileId, configId, studentName, block,
                         className, teacherName, period, unitName,
                         promptContent, ledgerSsId, adminSsId, studentDashboardUrl) {
  const doc  = DocumentApp.openById(fileId);
  const body = doc.getBody();

  // Clear the master template body before stamping
  body.clear();

  // With feedback as comments (FEEDBACK_AS_COMMENT, 00) the doc gets no
  // feedback zone: the header keeps who and what, and the dashboard link.
  // The Ledger row doesn't exist yet, so the course comes from the class.
  const feedbackInComments = feedbackAsCommentFor_(configId, className);

  // Who and what, the dashboard link and the feedback status live in the
  // page header (00's writeDocHeader_), in small grey text, so the page
  // itself holds only the assignment and the student's work. The dashboard
  // link used to be a body line; the menu (01) finds the URL in the system
  // block below.
  // Line 1 who and where; line 2 the lesson and the link (2026-10-28).
  writeDocHeader_(doc,
    [studentName, className + " — " + teacherName,
     block ? "Block " + block : "", period ? "Period " + period : ""]
      .filter(function (x) { return String(x || "").trim() !== ""; })
      .join("  ·  "),
    studentDashboardUrl, unitName);

  // With feedback in the doc (FEEDBACK_AS_COMMENT off) its zone stays:
  // 03 and 37 write between the markers.
  if (!feedbackInComments) {
    // 37 inserts each evaluation with the END line's formatting, so the
    // feedback comes out at the zone's size.
    _docFontSize_(body.appendParagraph("── FEEDBACK ──"), DOC_BODY_FONT_SIZE);
    // Must start "[No feedback yet." — 03_QueueBridge.js finds and removes it
    // by that prefix once the first evaluation arrives.
    _docFontSize_(body.appendParagraph(
      "[No feedback yet. When you're ready, open your assignment dashboard (link at the top) " +
      "and click Submit for Feedback. Your feedback will appear here.]"
    ), DOC_BODY_FONT_SIZE);
    _docFontSize_(body.appendParagraph("── END FEEDBACK ──"), DOC_BODY_FONT_SIZE);
    _docFontSize_(body.appendParagraph(""), DOC_BODY_FONT_SIZE);
  }

  // Getting around (2026-10-22, the operator's ask for tabs). The work has
  // to stay in the doc's one tab: every reader of the response (01, 03, 13,
  // 37) reads the first tab's body. So the title and "Your response" are
  // headings, which the Docs outline lists, and two links jump between
  // them through bookmarks. Both links sit above the response marker, so
  // neither is ever read as the student's writing.
  const title = body.appendParagraph(unitName);
  title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  title.editAsText().setFontSize(14).setBold(true);
  const toResponse = _docFontSize_(body.appendParagraph(DOC_JUMP_TO_RESPONSE), DOC_BODY_FONT_SIZE);

  if (promptContent) _docAssignmentTable_(body, promptContent);

  // The response starts on a new page, so it never splits across the
  // directions' last page (2026-10-28, the operator's ask).
  body.appendPageBreak();

  const responseHeading = body.appendParagraph(DOC_RESPONSE_HEADING);
  responseHeading.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  responseHeading.editAsText().setFontSize(DOC_RESPONSE_FONT_SIZE).setBold(true);
  const toAssignment = _docFontSize_(
    body.appendParagraph(DOC_WRITE_BELOW + "  ·  " + DOC_JUMP_TO_ASSIGNMENT), DOC_BODY_FONT_SIZE);
  _docLinkToBookmark_(doc, toResponse, DOC_JUMP_TO_RESPONSE, responseHeading);
  _docLinkToBookmark_(doc, toAssignment, DOC_JUMP_TO_ASSIGNMENT, title);

  // The marker text is read by the dashboard, the doc menu and the
  // evaluation (01, 13, 37 and others): keep it exactly.
  body.appendParagraph("── YOUR RESPONSE BEGINS HERE ──")
    .editAsText().setFontSize(10).setForegroundColor(DOC_HEADER_GREY);

  // Student writes here: several empty lines, so the writing space looks
  // like room to write (2026-10-22, UX audit fix-first 3).
  for (let i = 0; i < DOC_WRITING_LINES; i++) {
    _docFontSize_(body.appendParagraph(""), DOC_RESPONSE_FONT_SIZE);
  }

  // Zone 4: the end of the response zone and the system IDs, in one line of
  // invisible white 1pt text. "[CONFIG_ID:" is where every reader of the
  // response stops (01, 03, 13, and Studio's Flow 2 extract step, 42), and
  // 01 reads the code from it; it used to be a visible grey line ("Do not
  // delete this line"), which students could edit. The code a person reads
  // is in the page footer now (2026-10-24, the operator's layout).
  // SYS_DASHBOARD_URL is what the doc's menu actually uses now: it asks the
  // Student Dashboard web app (which runs as the admin) for the student's
  // Ledger row, rather than opening the Ledger as the student. The two
  // spreadsheet IDs stay for older copies of Script 01.
  const sysBlock = "[CONFIG_ID: " + configId + "]" +
    (ledgerSsId && adminSsId
      ? "[SYS_LEDGER_SS_ID:" + ledgerSsId + "]" +
        "[SYS_ADMIN_SS_ID:"  + adminSsId  + "]" +
        (studentDashboardUrl ? "[SYS_DASHBOARD_URL:" + studentDashboardUrl + "]" : "")
      : "");
  body.appendParagraph(sysBlock).editAsText().setFontSize(1).setForegroundColor("#ffffff");

  // The page footer: the assignment code, for the teacher and support.
  const footer = doc.getFooter() || doc.addFooter();
  footer.clear();
  const code = footer.getNumChildren() ? footer.getChild(0).asParagraph() : footer.appendParagraph("");
  code.setText("Assignment code: " + configId);
  code.editAsText().setFontSize(DOC_HEADER_FONT_SIZE).setForegroundColor(DOC_HEADER_GREY);

  // A normal last paragraph (2026-10-22, UX audit fix-first 3): the doc used
  // to end on the 1pt white system block, so clicking below the text or
  // pressing Ctrl+End put the cursor there and anything typed was invisible.
  // Typing here is visible, and the line says it isn't checked.
  body.appendParagraph(DOC_BELOW_END_NOTE)
    .editAsText().setFontSize(DOC_BODY_FONT_SIZE).setForegroundColor(DOC_HEADER_GREY);

  doc.saveAndClose();
}

// ---------------------------------------------------------------------------
// shareToStudentDrive_
// ---------------------------------------------------------------------------
function shareToStudentDrive_(cfg, docFile, googleId, teacherEmail) {
  // Access policy: a student's work is visible only to that student and the
  // teacher who assigned it. The doc used to be moved into a shared
  // "Block - Class - Teacher" folder that every student in the class could
  // view, so each classmate inherited view access to every other student's
  // doc. It now stays in the admin folder it was copied into, shared
  // directly: the student can edit (until submission, see
  // 04_Form2_TurnInGate.js) and the assigning teacher can comment.
  if (googleId) {
    try {
      docFile.addEditor(googleId);
    } catch (err) {
      Logger.log("Share warning for the student's account: " + err.message);
    }
  }
  // The teacher's share sends no email (plan L7, below); the student's
  // keeps Drive's usual one.
  if (teacherEmail) {
    try {
      shareWithoutEmail_(docFile, teacherEmail, "commenter");
    } catch (err) {
      Logger.log("Teacher comment access warning for " + teacherEmail + ": " + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// shareWithoutEmail_ — a share that sends no "shared with you" email (plan L7)
// ---------------------------------------------------------------------------
// 2026-11-08. Every student doc is made by the script's account and shared
// with the assigning teacher (shareToStudentDrive_ above; a form copy and
// its snapshot doc the same way), and DriveApp's addEditor/addCommenter/
// addViewer always email the person added: one notice in the teacher's
// inbox per doc, about 110 the day a lesson rolled out (11-02). The Drive
// advanced service (Drive API v3, already in the Central Ledger's manifest)
// can share without the email. Without it (Drive undefined) or if the call
// fails, this shares through DriveApp, so access never depends on it.
// role: "writer", "commenter" or "reader". A new direct share only: on a
// file where the person already edits, a lower role here could replace it
// (DriveApp's addCommenter never downgrades); no caller does that. Returns
// "quiet" (no email) or "email" (DriveApp). Throws as DriveApp does when
// the account can't be shared with.
function shareWithoutEmail_(file, email, role) {
  const who = String(email || "").trim();
  if (!who) return "";
  if (typeof Drive !== "undefined" && Drive && Drive.Permissions) {
    try {
      Drive.Permissions.create({ type: "user", role: role, emailAddress: who }, file.getId(),
        { sendNotificationEmail: false, supportsAllDrives: true });
      return "quiet";
    } catch (e) {
      Logger.log("[S02] Share without email failed (" + e.message + "); sharing through DriveApp, which emails.");
    }
  }
  if (role === "writer") file.addEditor(who);
  else if (role === "commenter") file.addCommenter(who);
  else file.addViewer(who);
  return "email";
}

// ---------------------------------------------------------------------------
// registerLedger_
// ---------------------------------------------------------------------------
function registerLedger_(cfg, googleId, studentName, configId, fileId,
                          block, className, teacherName, teacherEmail,
                          subject, courseName, period, docUrl, status) {
  const ss    = _intakeLedgerSs_(cfg);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);

  // AcademicYear: the current marking period (currentTerm_(), 00), by date.
  // Allows per-term dashboard filtering and end-of-term archiving
  const currentTerm = currentTerm_();

  sheet.appendRow([
    new Date(),    // 0  Timestamp
    googleId,      // 1  GoogleID
    configId,      // 2  ConfigID
    fileId,        // 3  FileID
    studentName,   // 4  StudentName
    block,         // 5  Block
    className,     // 6  ClassName
    teacherName,   // 7  TeacherName
    teacherEmail,  // 8  TeacherEmail
    subject,       // 9  Subject
    courseName,    // 10 CourseName
    period,        // 11 Period
    status || "ACTIVE", // 12 Status (SCHEDULED: made ahead, not shared yet)
    "",            // 13 SubmissionTS
    "",            // 14 Notes
    "",            // 15 LastEval
    docUrl,        // 16 AdminFileURL
    "",            // 17 StudentFileURL
    currentTerm    // 18 AcademicYear
  ]);
}

// ---------------------------------------------------------------------------
// generateConfigId_
// ---------------------------------------------------------------------------
function generateConfigId_() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let t = "";
  for (let i = 0; i < 6; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return "VDOE-" + t + "-" + new Date().getFullYear();
}

// ---------------------------------------------------------------------------
// resolveAdminPath_ — walks/creates folder hierarchy from root
// ---------------------------------------------------------------------------
// seen (optional): { path: Folder } kept across calls in one run, so the
// levels students share are looked up once.
function resolveAdminPath_(rootId, segments, seen) {
  let key = String(rootId);
  let folder = seen && seen[key] ? seen[key] : DriveApp.getFolderById(rootId);
  if (seen) seen[key] = folder;
  for (const seg of segments) {
    if (!seg) continue;
    key += "/" + seg;
    folder = seen && seen[key] ? seen[key] : resolveFolder_(folder, seg);
    if (seen) seen[key] = folder;
  }
  return folder;
}

// ---------------------------------------------------------------------------
// resolveFolder_ — finds or creates a named subfolder
// ---------------------------------------------------------------------------
function resolveFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
