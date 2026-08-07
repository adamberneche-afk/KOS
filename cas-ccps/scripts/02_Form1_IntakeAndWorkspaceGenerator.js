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

  const googleId     = r["Student Google Account"]?.[0]?.trim() || "";
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

  // Fetch LIVE assignment from Teacher Matrix via MatrixRegistry
  const assignment = fetchAssignment_(cfg, unitConfigId);
  if (!assignment) {
    Logger.log("Form 1 rejected — no LIVE assignment for ConfigID: " + unitConfigId);
    return;
  }

  // Generate student-specific CONFIG_ID
  const studentConfigId = generateConfigId_();

  // Resolve admin folder hierarchy
  const adminStudentFolder = resolveAdminPath_(cfg.adminRootFolderId, [
    subject, courseName, teacherName, "Period " + period, studentName
  ]);

  // Copy MASTER STUDENT TEMPLATE (not teacher's prompt doc)
  // This ensures Script 01 is pre-bound on every student doc
  const masterTemplateId = cfg.masterStudentTemplateId;
  if (!masterTemplateId) {
    const errMsg =
      "Student registration failed for " + studentName + ".

" +
      "REASON: The Master Student Template has not been configured.

" +
      "The system administrator needs to:
" +
      "  1. Create the Master Student Template Google Doc
" +
      "  2. Bind Scripts 00, 01, 09, and 17 to it
" +
      "  3. Set MASTER_STUDENT_TEMPLATE_ID in the admin Script Properties

" +
      "Until this is done, no student documents can be created.

" +
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

    Logger.log("Form 1 error — MASTER_STUDENT_TEMPLATE_ID not set. " +
               "Student: " + studentName);
    return;
  }

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
    promptContent, cfg.ledgerSsId, cfg.adminSsId
  );

  // Share into student Drive under [Block - Class - Teacher] folder
  shareToStudentDrive_(cfg, docFile, googleId, block, className, teacherName);

  // Register in Ledger
  registerLedger_(cfg, googleId, studentName, studentConfigId, fileId,
                  block, className, teacherName, teacherEmail,
                  subject, courseName, period, docFile.getUrl());

  Logger.log(
    "Workspace created — " + studentName +
    " | ConfigID: " + studentConfigId +
    " | Block: " + block + " P" + period
  );
}

// ---------------------------------------------------------------------------
// fetchAssignment_ — reads Teacher Matrix via MatrixRegistry
// Uses ConfigID prefix lookup to go directly to the right matrix SS
// avoiding O(n×m) scan across all teacher spreadsheets
// ---------------------------------------------------------------------------
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
              promptTemplateId: String(data[i][12]).trim()
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

// ---------------------------------------------------------------------------
// stampDocument_ — builds the four-zone structure AND stamps system IDs
// in a single open/close cycle. System IDs are written as invisible text
// below the CONFIG_ID footer for Script 01's ID fallback.
//
// Zone 1: Feedback header  (prepend zone — Studio writes here)
// Zone 2: Assignment prompt (injected from teacher's template)
// Zone 3: Response divider + student work area
// Zone 4: CONFIG_ID footer + system ID block (invisible)
// ---------------------------------------------------------------------------
function stampDocument_(fileId, configId, studentName, block,
                         className, teacherName, period, unitName,
                         promptContent, ledgerSsId, adminSsId) {
  const doc  = DocumentApp.openById(fileId);
  const body = doc.getBody();

  // Clear the master template body before stamping
  body.clear();

  // ── ZONE 1: FEEDBACK HEADER ───────────────────────────────────────────────
  body.appendParagraph(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "📊 FEEDBACK\n" +
    "Student: " + studentName +
    "  |  Block: " + block +
    "  |  " + className + " — " + teacherName +
    "  |  Period: " + period + "\n" +
    "Assignment: " + unitName + "\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

  body.appendParagraph("── FEEDBACK ──");

  body.appendParagraph(
    "[No feedback yet. Use 📊 AI Evaluation Panel → Run Assignment Check " +
    "to request your first evaluation.]"
  );

  body.appendParagraph("── END FEEDBACK ──");
  body.appendParagraph("");

  // ── ZONE 2: ASSIGNMENT PROMPT ─────────────────────────────────────────────
  body.appendParagraph(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "📋 ASSIGNMENT\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

  // Inject teacher prompt content — paragraph by paragraph to preserve structure
  if (promptContent) {
    promptContent.split("\n").forEach(line => {
      body.appendParagraph(line);
    });
  }

  body.appendParagraph("");

  // ── ZONE 3: RESPONSE DIVIDER ──────────────────────────────────────────────
  body.appendParagraph(
    "──────────────────────────────────────────────────\n" +
    "── YOUR RESPONSE BEGINS HERE ──\n" +
    "──────────────────────────────────────────────────"
  );

  body.appendParagraph("");  // Student writes here

  // ── ZONE 4: CONFIG_ID FOOTER + SYSTEM ID BLOCK ───────────────────────────
  body.appendParagraph(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "[CONFIG_ID: " + configId + "]\n" +
    "Do not modify or delete this section.\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  );

  // Zone 4b: System ID block — invisible white 1pt text for Script 01 fallback
  // Must be last so body.clear() earlier in this function doesn't wipe it
  if (ledgerSsId && adminSsId) {
    const sysBlock =
      "[SYS_LEDGER_SS_ID:" + ledgerSsId + "]" +
      "[SYS_ADMIN_SS_ID:"  + adminSsId  + "]";
    const sysPara = body.appendParagraph(sysBlock);
    sysPara.editAsText()
      .setFontSize(1)
      .setForegroundColor("#ffffff");
  }

  doc.saveAndClose();
}

// ---------------------------------------------------------------------------
// shareToStudentDrive_
// ---------------------------------------------------------------------------
function shareToStudentDrive_(cfg, docFile, googleId, block, className, teacherName) {
  const folderName  = block + " - " + className + " - " + teacherName;
  const adminRoot   = DriveApp.getFolderById(cfg.adminRootFolderId);
  const sharedRoot  = resolveFolder_(adminRoot, "_Student Shared Folders");
  const classFolder = resolveFolder_(sharedRoot, folderName);

  try {
    classFolder.addViewer(googleId);
    docFile.addEditor(googleId);
    docFile.moveTo(classFolder);
  } catch (err) {
    Logger.log("Share warning for " + googleId + ": " + err.message);
    docFile.addEditor(googleId);
  }
}

// ---------------------------------------------------------------------------
// registerLedger_
// ---------------------------------------------------------------------------
function registerLedger_(cfg, googleId, studentName, configId, fileId,
                          block, className, teacherName, teacherEmail,
                          subject, courseName, period, docUrl) {
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);

  // AcademicYear populated from CURRENT_TERM Script Property
  // Admin sets this before each term (e.g. "2025-26 S1")
  // Allows per-term dashboard filtering and end-of-term archiving
  const currentTerm = PropertiesService.getScriptProperties()
                        .getProperty("CURRENT_TERM") || "";

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
    "ACTIVE",      // 12 Status
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
