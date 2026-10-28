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
    Logger.log("Form 1 rejected — the account entered is not a valid student Google account (expected 7 digits @" + _studentEmailDomain_() + ").");
    notifyIntakeRejected_(cfg, {
      studentName: studentName, googleId: googleId,
      teacherEmail: teacherEmail, unitConfigId: unitConfigId,
      reason: "\"" + googleId + "\" is not a district student account. Student accounts " +
              "are 7 digits @" + _studentEmailDomain_() + ".",
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
      MailApp.sendEmail(
        teacherEmail,
        "⚠️ Student Registration Failed — " + studentName,
        errMsg
      );
    }

    // Alert admin
    if (cfg.adminNotifyEmail && cfg.adminNotifyEmail !== teacherEmail) {
      MailApp.sendEmail(cfg.adminNotifyEmail,
        "⚠️ MASTER_STUDENT_TEMPLATE_ID Not Configured — Registration Failed",
        errMsg
      );
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
//         { ok: false, code: INVALID_ACCOUNT | NO_LIVE_ASSIGNMENT | NO_MASTER_TEMPLATE }
// Nothing is written on failure; the caller decides how to report it.
// ---------------------------------------------------------------------------
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

  // Fetch LIVE assignment from Teacher Matrix via MatrixRegistry
  const assignment = fetchAssignment_(cfg, unitConfigId);
  if (!assignment) return { ok: false, code: "NO_LIVE_ASSIGNMENT" };

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

  // Copy MASTER STUDENT TEMPLATE (not teacher's prompt doc)
  // This ensures Script 01 is pre-bound on every student doc
  const masterTemplateId = cfg.masterStudentTemplateId;
  if (!masterTemplateId) return { ok: false, code: "NO_MASTER_TEMPLATE" };

  // Generate student-specific CONFIG_ID
  const studentConfigId = generateConfigId_();

  // Resolve admin folder hierarchy
  const adminStudentFolder = resolveAdminPath_(cfg.adminRootFolderId, [
    subject, courseName, teacherName, "Period " + period, studentName
  ]);

  const masterFile = DriveApp.getFileById(masterTemplateId);
  const docFile    = masterFile.makeCopy(
    assignment.unitName + " — " + studentName,
    adminStudentFolder
  );
  const fileId = docFile.getId();

  // Fetch teacher prompt content to inject into Zone 2
  const promptContent = fetchPromptContent_(assignment.promptTemplateId);

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
  recordStudentAssignment_(SpreadsheetApp.openById(cfg.ledgerSsId), studentConfigId, googleId, unitConfigId);

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
    try { MailApp.sendEmail(to, subject, body); }
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
function fetchPromptContent_(promptTemplateId) {
  if (!promptTemplateId) return "";
  try {
    const promptDoc  = DocumentApp.openById(promptTemplateId);
    const body       = promptDoc.getBody();
    // Return the full text — stampDocument_ will insert it as Zone 2
    return body.getText().trim();
  } catch (e) {
    Logger.log("fetchPromptContent_ error: " + e.message);
    return "[Assignment prompt could not be loaded. Contact your teacher.]";
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
  writeDocHeader_(doc,
    [studentName, className + " — " + teacherName,
     block ? "Block " + block : "", period ? "Period " + period : "", unitName]
      .filter(function (x) { return String(x || "").trim() !== ""; })
      .join("  ·  "),
    studentDashboardUrl);

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

  _docFontSize_(body.appendParagraph(""), DOC_BODY_FONT_SIZE);

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
  if (teacherEmail) {
    try {
      docFile.addCommenter(teacherEmail);
    } catch (err) {
      Logger.log("Teacher comment access warning for " + teacherEmail + ": " + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// registerLedger_
// ---------------------------------------------------------------------------
function registerLedger_(cfg, googleId, studentName, configId, fileId,
                          block, className, teacherName, teacherEmail,
                          subject, courseName, period, docUrl, status) {
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
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
function resolveAdminPath_(rootId, segments) {
  let folder = DriveApp.getFolderById(rootId);
  for (const seg of segments) {
    if (!seg) continue;
    folder = resolveFolder_(folder, seg);
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
