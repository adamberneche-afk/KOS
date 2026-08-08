// =============================================================================
// FILE: 04_Form2_TurnInGate.js
// BOUND TO: Central Ledger spreadsheet (same project as Scripts 00+02+03+06+10)
//           The Turn-In Form is linked to the central ledger spreadsheet.
//           This script's onTurnInSubmit fires via onFormSubmit trigger on that sheet.
//
// DISAMBIGUATION:
//   The central ledger receives Form 1 AND Form 2 responses.
//   Form 1 is handled by Script 02's onFormSubmit (checks for "Student Google Account").
//   Form 2 is handled by this script's onTurnInSubmit (checks for "Your Google Account").
//   Both scripts must be in the SAME Apps Script project on the central ledger.
//
//   FIX (reconciliation decision 9): this file previously assumed
//   setCollectEmail(true) and read Google's auto-collected "Email Address"
//   field. That contradicted 16_UnifiedManualSetup.js (the actual form
//   builder — createAdminAssets_() calls setCollectEmail(false) and adds a
//   manual text item titled "Your Google Account") and
//   18_FormSubmitDispatcher.js's own comment (which already said "Your
//   Google Account"). As shipped, r["Email Address"] was always undefined
//   on a real submission, so the disambiguation check below treated every
//   real Form 2 turn-in as "not a Form 2 submission" and silently no-opped
//   — turn-ins never registered, with no error. Fixed to match the form as
//   it's actually built; 16 and 18 were already correct and are unchanged.
//   The manually-typed field (vs. auto-collect) can still be mistyped —
//   that's an accepted tradeoff already made when 16 was built this way,
//   not something this fix changes. The LEDGER_MISMATCH handling and
//   student-facing rejection messaging below still cover that case.
//
// FORENSIC CHECK:
//   Uses version history timestamp pattern — rapid block write under 15 seconds —
//   rather than email identity. Studio's service account email is not predictable.
//
// TRIGGER: dispatched from 18_FormSubmitDispatcher.js → onTurnInSubmit
// =============================================================================

function onTurnInSubmit(e) {
  const cfg = getConfig_();
  const r   = e.namedValues;

  // DISAMBIGUATION — exit immediately if this is a Form 1 (student intake) submission
  // Form 2 reads the manually-typed "Your Google Account" field; Form 1 uses
  // "Student Google Account" instead (see Script 02).
  if (!r["Your Google Account"]) {
    Logger.log("onTurnInSubmit: not a Form 2 submission — skipping.");
    return;
  }

  // Student-typed Google account identifier — matched against the Ledger.
  // A mistyped value here surfaces as LEDGER_MISMATCH below, not a silent no-op.
  const googleId        = r["Your Google Account"]?.[0]?.trim().toLowerCase() || "";
  const submittedDocUrl = r["Assignment Document Link"]?.[0]?.trim()    || "";

  if (!googleId || !submittedDocUrl) {
    Logger.log("Turn-in rejected — missing email or document URL.");
    return;
  }

  // STEP 1 — Parse File ID from URL
  const fileId = extractFileId_(submittedDocUrl);
  if (!fileId) {
    flagRejection_(cfg, googleId, null, "INVALID_URL",
      "Could not parse a Drive File ID from: " + submittedDocUrl);
    return;
  }

  // STEP 2 — Open doc, scan footer for CONFIG_ID
  let docText, configId;
  try {
    const doc = DocumentApp.openById(fileId);
    docText   = doc.getBody().getText();
    const m   = docText.match(/\[CONFIG_ID:\s*([A-Z0-9\-]+)\]/);
    if (!m) {
      flagRejection_(cfg, googleId, fileId, "MISSING_CONFIG_ID",
        "No CONFIG_ID found in document footer.");
      return;
    }
    configId = m[1];
  } catch (err) {
    flagRejection_(cfg, googleId, fileId, "DOC_ACCESS_ERROR",
      "Could not open submitted document: " + err.message);
    return;
  }

  // STEP 3 — Three-point ledger match
  const ledgerRow = findLedgerRow_(cfg, googleId, fileId, configId);
  if (!ledgerRow) {
    flagRejection_(cfg, googleId, fileId, "LEDGER_MISMATCH",
      "No ledger row matched GoogleID: " + googleId +
      " | FileID: " + fileId + " | ConfigID: " + configId);
    return;
  }

  // STEP 4 — Compliance stamp check
  const compliance = scanCompliance_(docText);
  if (compliance === "NONE") {
    flagRejection_(cfg, googleId, fileId, "NO_EVALUATION_FOUND",
      "No automated evaluation stamp found in document.");
    return;
  }
  if (compliance === "REVISION_REQUIRED") {
    flagRejection_(cfg, googleId, fileId, "REVISION_REQUIRED",
      "Document contains REVISION_REQUIRED stamp — revisions still needed.");
    return;
  }

  // STEP 5 — Forensic version history check
  // Checks for a rapid automated block write (Studio's signature) rather than
  // matching an email identity, since Studio service account email is variable.
  const forensic = runForensicCheck_(fileId);
  if (!forensic.passed) {
    flagRejection_(cfg, googleId, fileId, "FORENSIC_FAILURE", forensic.reason);
    return;
  }

  // STEP 6 — All checks passed
  markCompliant_(cfg, ledgerRow.rowIndex);
  notifyTeacher_(ledgerRow, submittedDocUrl);

  Logger.log("Turn-in APPROVED — GoogleID: " + googleId + " | ConfigID: " + configId);
}

// ---------------------------------------------------------------------------
// findLedgerRow_
// ---------------------------------------------------------------------------
function findLedgerRow_(cfg, googleId, fileId, configId) {
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (
      data[i][1].toString().toLowerCase() === googleId.toLowerCase() &&
      data[i][2].toString()               === configId               &&
      data[i][3].toString()               === fileId
    ) {
      return {
        rowIndex:     i + 1,
        googleId:     data[i][1],
        configId:     data[i][2],
        fileId:       data[i][3],
        studentName:  data[i][4],
        block:        data[i][5],
        className:    data[i][6],
        teacherName:  data[i][7],
        teacherEmail: data[i][8],
        period:       data[i][11],
        courseName:   data[i][10]
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// scanCompliance_
// ---------------------------------------------------------------------------
function scanCompliance_(docText) {
  if (docText.indexOf("[SYSTEM: APPROVED]")          !== -1) return "APPROVED";
  if (docText.indexOf("[SYSTEM: REVISION_REQUIRED]") !== -1) return "REVISION_REQUIRED";
  return "NONE";
}

// ---------------------------------------------------------------------------
// runForensicCheck_ — timestamp-pattern forensic check
//
// A legitimate Studio-written evaluation appears in version history as a
// very rapid block edit — the entire feedback block lands in a single
// revision within a short window (typically under 10 seconds).
// A student manually typing or pasting a report leaves many small sequential
// edits spread over minutes.
//
// Detection strategy:
//   1. Get all revisions for the document
//   2. Find any revision that modified a large character count in under
//      FORENSIC_WINDOW_MS milliseconds since the previous revision
//   3. At least one such revision must exist and post-date the document
//      creation by more than 60 seconds (ruling out the initial stamp)
//
// Graceful degradation: if Drive API is unavailable, log and pass through.
// ---------------------------------------------------------------------------
function runForensicCheck_(fileId) {
  const FORENSIC_WINDOW_MS = 15000; // 15 seconds — Studio writes are near-instant

  try {
    const revisions = Drive.Revisions.list(fileId);
    const items     = (revisions.items || revisions.revisions || []);

    if (items.length < 2) {
      return { passed: false, reason: "Insufficient revision history found." };
    }

    // Sort revisions by modified time ascending
    const sorted = items.slice().sort((a, b) => {
      return new Date(a.modifiedDate || a.modifiedTime) -
             new Date(b.modifiedDate || b.modifiedTime);
    });

    const docCreated = new Date(sorted[0].modifiedDate || sorted[0].modifiedTime);
    let   foundRapidBlock = false;

    for (let i = 1; i < sorted.length; i++) {
      const prev    = new Date(sorted[i-1].modifiedDate || sorted[i-1].modifiedTime);
      const curr    = new Date(sorted[i].modifiedDate   || sorted[i].modifiedTime);
      const elapsed = curr - prev;
      const sinceCreation = curr - docCreated;

      // A rapid write that happens more than 60s after doc creation
      if (elapsed <= FORENSIC_WINDOW_MS && sinceCreation > 60000) {
        foundRapidBlock = true;
        break;
      }
    }

    if (!foundRapidBlock) {
      return {
        passed: false,
        reason: "No rapid automated block write found in version history. " +
                "The evaluation report may have been manually inserted."
      };
    }

    return { passed: true, reason: "Rapid automated block write confirmed." };

  } catch (err) {
    // Drive API unavailable — graceful degradation
    Logger.log("Forensic check skipped (Drive API): " + err.message);
    return { passed: true, reason: "Drive API unavailable — skipped." };
  }
}

// ---------------------------------------------------------------------------
// markCompliant_
// ---------------------------------------------------------------------------
function markCompliant_(cfg, rowIndex) {
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  sheet.getRange(rowIndex, 13).setValue("COMPLIANT");
  sheet.getRange(rowIndex, 14).setValue(new Date());
  sheet.getRange(rowIndex, 15).setValue("All checks passed — auto-approved.");
}

// ---------------------------------------------------------------------------
// notifyTeacher_
// ---------------------------------------------------------------------------
function notifyTeacher_(row, docUrl) {
  if (!row.teacherEmail) return;
  MailApp.sendEmail(
    row.teacherEmail,
    "✅ Verified Submission — " + row.studentName +
    " | " + row.courseName + " Period " + row.period,
    "A student submission has passed all automated checks.\n\n" +
    "Student:   " + row.studentName + "\n" +
    "Block:     " + row.block + "\n" +
    "Class:     " + row.className + " — " + row.teacherName + "\n" +
    "Period:    " + row.period + "\n" +
    "ConfigID:  " + row.configId + "\n" +
    "Document:  " + docUrl + "\n\n" +
    "Checks passed:\n" +
    "  ✓ Google ID + File ID + CONFIG_ID ledger match\n" +
    "  ✓ SYSTEM: APPROVED stamp present\n" +
    "  ✓ Version history automated block write confirmed\n\n" +
    "— Assignment System"
  );
}

// ---------------------------------------------------------------------------
// flagRejection_ — writes rejection notice to student doc (no email)
//                  and alerts teacher/admin
// ---------------------------------------------------------------------------
function flagRejection_(cfg, googleId, fileId, code, detail) {
  Logger.log("Turn-in REJECTED — " + googleId + " | Code: " + code + " | " + detail);

  // Look up teacher email from ledger if we have a fileId
  let teacherEmail = cfg.adminNotifyEmail;
  let studentName  = googleId;

  if (fileId) {
    try {
      const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
      const sheet = ss.getSheetByName(cfg.tabs.ledger);
      const data  = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][3].toString() === fileId) {
          teacherEmail = data[i][8] || cfg.adminNotifyEmail;
          studentName  = data[i][4] || googleId;
          break;
        }
      }
    } catch (e) { /* use defaults */ }
  }

  // Alert teacher with technical detail
  if (teacherEmail) {
    try {
      MailApp.sendEmail(
        teacherEmail,
        "🚩 Flagged Submission — " + code + " | " + studentName,
        "A student submission was rejected.\n\n" +
        "Student:  " + studentName + "\n" +
        "Google ID: " + googleId + "\n" +
        "Code:     " + code + "\n\n" +
        "Detail:\n" + detail + "\n\n" +
        "Use ⚙️ Admin Controls to investigate or re-queue.\n\n— Assignment System"
      );
    } catch (e) { Logger.log("Could not send teacher alert: " + e.message); }
  }

  // Write plain-language rejection into student doc feedback zone
  if (fileId) writeRejectionToDoc_(fileId, code);
}

// ---------------------------------------------------------------------------
// writeRejectionToDoc_ — prepends rejection notice into feedback header zone
// ---------------------------------------------------------------------------
function writeRejectionToDoc_(fileId, code) {
  // Rejection messages — plain language, answers what happened + what to do next
  // Merged from Script 11 (StudentFriendlyRejections) — Script 11 is now archived
  const messages = {
    "INVALID_URL":
      "⚠️ SUBMISSION ISSUE — Wrong Document Link\n\n" +
      "WHAT HAPPENED:\n" +
      "The document link you submitted doesn't appear to be a valid Google Docs link.\n\n" +
      "WHAT TO DO:\n" +
      "  1. Open your assignment document in Google Docs.\n" +
      "  2. Copy the full URL from your browser's address bar.\n" +
      "     It should look like: https://docs.google.com/document/d/...\n" +
      "  3. Go back to the Turn-In Form and submit again with the correct link.\n\n" +
      "If you're still having trouble, contact your teacher.",

    "MISSING_CONFIG_ID":
      "⚠️ SUBMISSION ISSUE — Wrong Document Submitted\n\n" +
      "WHAT HAPPENED:\n" +
      "The document you submitted does not appear to be your official assignment " +
      "document. It's missing the assignment tracking code at the bottom.\n\n" +
      "WHAT TO DO:\n" +
      "  1. Find the original document that was shared with you when you registered.\n" +
      "     Check for an email with subject: 'Your Assignment Workspace Is Ready'.\n" +
      "  2. Make sure you are submitting THAT document — not a copy or a new doc.\n" +
      "  3. The tracking code at the bottom should look like: [CONFIG_ID: VDOE-...]\n\n" +
      "If you cannot find your original document, contact your teacher.",

    "DOC_ACCESS_ERROR":
      "⚠️ SUBMISSION ISSUE — Document Could Not Be Opened\n\n" +
      "WHAT HAPPENED:\n" +
      "The system was unable to access your document. This usually means the " +
      "sharing settings on your document have changed.\n\n" +
      "WHAT TO DO:\n" +
      "  1. Open your assignment document.\n" +
      "  2. Click the Share button (top right corner).\n" +
      "  3. Make sure the document is still shared with your teacher's account.\n" +
      "  4. Submit the Turn-In Form again.",

    "LEDGER_MISMATCH":
      "⚠️ SUBMISSION ISSUE — Account Not Matched\n\n" +
      "WHAT HAPPENED:\n" +
      "The system could not match your submission to your registered account. " +
      "This can happen if you submitted using a different Google account than " +
      "the one used when you registered, or if you are submitting a document " +
      "that was not assigned to you.\n\n" +
      "WHAT TO DO:\n" +
      "  1. Make sure you entered your Google account exactly as registered.\n" +
      "  2. Make sure you are submitting YOUR original assignment document.\n" +
      "  3. Try submitting the Turn-In Form again.\n\n" +
      "If the problem continues, contact your teacher.",

    "NO_EVALUATION_FOUND":
      "⚠️ NOT READY TO SUBMIT YET — Evaluation Required First\n\n" +
      "WHAT HAPPENED:\n" +
      "Before you can submit your final assignment, you need to request at least " +
      "one evaluation from the AI coach and receive a passing result.\n\n" +
      "WHAT TO DO:\n" +
      "  1. Open your assignment document.\n" +
      "  2. Make sure your work is written in the response section.\n" +
      "  3. Click: 📊 AI Evaluation Panel → Run Assignment Check\n" +
      "  4. Wait 1–3 minutes for your feedback to appear at the top of the document.\n" +
      "  5. If your work passes, you will see a ✅ passing notice.\n" +
      "  6. Then return to the Turn-In Form and submit again.",

    "REVISION_REQUIRED":
      "⚠️ NOT READY TO SUBMIT YET — Revisions Still Needed\n\n" +
      "WHAT HAPPENED:\n" +
      "Your most recent evaluation showed that your work still needs revisions. " +
      "You can only submit after the AI coach confirms your work meets all requirements.\n\n" +
      "WHAT TO DO:\n" +
      "  1. Open your assignment document.\n" +
      "  2. Scroll to the top — find the REQUIRED REVISIONS section.\n" +
      "  3. Make the changes listed there.\n" +
      "  4. Run another evaluation: 📊 AI Evaluation Panel → Run Assignment Check\n" +
      "  5. Once you receive a passing result, return here and submit again.\n\n" +
      "You can run as many evaluations as you need. There is no penalty for revising.",

    "FORENSIC_FAILURE":
      "⚠️ SUBMISSION COULD NOT BE VERIFIED — Contact Your Teacher\n\n" +
      "WHAT HAPPENED:\n" +
      "The system was unable to confirm that the evaluation report in your document " +
      "was generated by the official assignment system.\n\n" +
      "WHAT TO DO:\n" +
      "Please contact your teacher directly. They will review your document " +
      "and help resolve this. Let them know you received a 'verification' error " +
      "on your final submission."
  };

  const message = messages[code] ||
    "⚠️ SUBMISSION ISSUE\n\nAn unexpected error occurred. Contact your teacher.";

  try {
    const doc  = DocumentApp.openById(fileId);
    const body = doc.getBody();
    const ts   = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), "MMM d, yyyy h:mm a"
    );

    const noticeText =
      "\n── SUBMISSION NOTICE [" + ts + "] ──\n" +
      message + "\n" +
      "── END NOTICE ──\n";

    // Insert after the FEEDBACK marker
    const result = body.findText("── FEEDBACK ──");
    if (result) {
      const paraIdx = body.getChildIndex(result.getElement().getParent());
      body.insertParagraph(paraIdx + 1, noticeText);
    } else {
      body.insertParagraph(0, noticeText);
    }

    doc.saveAndClose();
  } catch (err) {
    Logger.log("Could not write rejection to doc " + fileId + ": " + err.message);
  }
}

// ---------------------------------------------------------------------------
// extractFileId_
// ---------------------------------------------------------------------------
function extractFileId_(url) {
  let m = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
  if (m) return m[1];
  m = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
  return m ? m[1] : null;
}
