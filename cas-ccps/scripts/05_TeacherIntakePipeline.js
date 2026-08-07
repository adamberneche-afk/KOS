// =============================================================================
// FILE: 05_TeacherIntakePipeline.js
// BOUND TO: Teacher Rubric Upload Form response sheet
// PURPOSE: Validates teacher rubric submission, writes a pointer row to
//          RubricQueue for Workspace Studio Flow 1 to process.
//          No Gemini call. No API key. Studio owns the extraction entirely.
//
// TRIGGER: onFormSubmit → onTeacherRubricSubmit
// =============================================================================

// ---------------------------------------------------------------------------
// CONFIGURATION — reads from _CONFIG tab on this sheet (Script 19)
// Script Properties don't clone with makeCopy(). Script 16 writes a _CONFIG
// tab to this sheet at creation time. getSheetConfig_() reads from there.
// ---------------------------------------------------------------------------
function getConfig_05() {
  return getSheetConfig_(); // defined in 19_ClonedSheetConfig.js
}

// RubricQueue column indices (0-based)
const RQ05 = {
  TIMESTAMP:          0,
  TEACHER_EMAIL:      1,
  TEACHER_NAME:       2,
  SUBJECT:            3,
  COURSE_NAME:        4,
  TIER:               5,
  RUBRIC_TEXT:        6,
  PROMPT_TEMPLATE_ID: 7,
  STATUS:             8   // PENDING_EXTRACTION → IN_EXTRACTION (Studio) → COMPLETE
};

// ---------------------------------------------------------------------------
// onTeacherRubricSubmit — trigger bound to Teacher Rubric Upload Form
// Validates submission, writes pointer row to RubricQueue
// ---------------------------------------------------------------------------
function onTeacherRubricSubmit(e) {
  const r = e.namedValues;
  const cfg = getConfig_05();

  const instructorEmail   = r["Email Address"]?.[0]?.trim()                    || cfg.teacherEmail || "";
  const instructorName    = r["Instructor Name"]?.[0]?.trim()                  || cfg.teacherName  || "";
  const subject           = r["Subject"]?.[0]?.trim()                          || "";
  const courseName        = r["Course Name"]?.[0]?.trim()                      || "";
  const tier              = r["Academic Tier"]?.[0]?.trim()                    || "Tier 1 Core";
  const rawRubricText     = r["Paste Evaluation Rubric"]?.[0]?.trim()          || "";
  const promptTemplateUrl = r["Assignment Prompt Template Link"]?.[0]?.trim()  || "";

  // --- Validate ---
  if (!rawRubricText || rawRubricText.length < 100) {
    notifyError_(instructorEmail, instructorName,
      "Your rubric submission was too short. Please paste the full rubric text and resubmit.");
    return;
  }

  const promptTemplateId = extractFileId_(promptTemplateUrl);
  if (!promptTemplateId) {
    notifyError_(instructorEmail, instructorName,
      "The assignment prompt template link could not be read.\n" +
      "Please share the Google Doc link (not a download link) and resubmit.");
    return;
  }

  // Validate the prompt template is accessible AND is a Google Doc
  // This pre-validates at assignment creation time so failures surface
  // immediately — not weeks later when students are being registered
  try {
    const templateFile = DriveApp.getFileById(promptTemplateId);
    const fileName     = templateFile.getName();
    const mimeType     = templateFile.getMimeType();

    if (mimeType !== MimeType.GOOGLE_DOCS) {
      notifyError_(instructorEmail, instructorName,
        "The assignment prompt template must be a Google Doc (not a PDF, Word file, etc).\n\n" +
        "File found: " + fileName + "\n" +
        "File type: " + mimeType + "\n\n" +
        "Please create or convert your prompt to a Google Doc and resubmit."
      );
      return;
    }

    // Verify DocumentApp can open it (catches permission issues DriveApp misses)
    const testOpen = DocumentApp.openById(promptTemplateId);
    const bodyText = testOpen.getBody().getText();

    if (!bodyText || bodyText.trim().length < 20) {
      notifyError_(instructorEmail, instructorName,
        "The assignment prompt template document appears to be empty or nearly empty.\n\n" +
        "File: " + fileName + "\n\n" +
        "Please add your assignment instructions to the document and resubmit."
      );
      return;
    }

  } catch (err) {
    notifyError_(instructorEmail, instructorName,
      "The prompt template document could not be opened.\n\n" +
      "Most likely causes:\n" +
      "  • The document has not been shared with the admin account\n" +
      "  • The sharing link has expired or been revoked\n\n" +
      "To fix this:\n" +
      "  1. Open your prompt template Google Doc\n" +
      "  2. Click Share (top right)\n" +
      "  3. Add the admin account as a viewer: " +
             (cfg.adminNotifyEmail || "[contact your admin for their email]") + "\n" +
      "  4. Resubmit your rubric upload form"
    );
    return;
  }

  // --- Write to central RubricQueue (Studio Flow 1 trigger tab) ---
  if (!cfg.adminSsId) {
    throw new Error(
      "_CONFIG tab on this sheet is missing ADMIN_SS_ID. " +
      "The setup wizard may not have completed successfully. " +
      "Contact your system administrator."
    );
  }

  const adminSs      = SpreadsheetApp.openById(cfg.adminSsId);
  const centralQueue = adminSs.getSheetByName("RubricQueue"); // Central tab — always this name
  if (!centralQueue) {
    throw new Error(
      "RubricQueue tab not found in admin spreadsheet. " +
      "Expected tab name: RubricQueue. " +
      "Check the central ledger spreadsheet setup."
    );
  }

  const queueRow = [
    new Date(),              // Timestamp
    instructorEmail,         // TeacherEmail
    instructorName,          // TeacherName
    subject,                 // Subject
    courseName,              // CourseName
    tier,                    // Tier
    rawRubricText,           // RubricText — Studio reads for extraction
    promptTemplateId,        // PromptTemplateID — pointer to prompt doc
    cfg.teacherMatrixSsId,   // TeacherMatrixSsId — Studio writes DRAFT row here
    "PENDING_EXTRACTION"     // Status
  ];

  centralQueue.appendRow(queueRow);

  // --- Also write to teacher's personal audit queue tab ---
  // Tab name is stored in _CONFIG as RUBRIC_QUEUE_TAB (set by Script 16)
  const personalTabName = cfg.rubricQueueTab;
  if (personalTabName) {
    const personalQueue = adminSs.getSheetByName(personalTabName);
    if (personalQueue) {
      personalQueue.appendRow(queueRow);
    } else {
      Logger.log("[05] Personal audit tab not found: " + personalTabName +
                 " — central queue write succeeded.");
    }
  }

  // Notify teacher their submission is being processed
  MailApp.sendEmail(
    instructorEmail,
    "📋 Assignment Rubric Received — Processing Now",
    "Hello " + instructorName + ",\n\n" +
    "Your assignment rubric has been received and is being processed.\n\n" +
    "Within a few minutes you will receive a second email asking you to\n" +
    "review and confirm what the system extracted from your rubric.\n\n" +
    "Course: " + courseName + "\n" +
    "Subject: " + subject + "\n\n" +
    "— Assignment System"
  );

  Logger.log(
    "[INTAKE] RubricQueue row written — " + instructorEmail +
    " | Course: " + courseName
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractFileId_(url) {
  if (!url) return null;
  let m = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
  if (m) return m[1];
  m = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
  return m ? m[1] : null;
}

function notifyError_(email, name, detail) {
  if (!email) return;
  MailApp.sendEmail(
    email,
    "⚠️ Assignment Submission Failed — Action Required",
    "Hello " + name + ",\n\n" +
    "Your assignment submission could not be processed.\n\n" +
    "Reason:\n" + detail + "\n\n" +
    "Please correct the issue and resubmit.\n\n— Assignment System"
  );
}
