// =============================================================================
// FILE: 16_UnifiedManualSetup.js
// BOUND TO: Assignment System Manual Google Doc (container-bound)
// REPLACES: 14_TeacherManualSetup.js
//
// PURPOSE: Single document, single script, role determined at runtime.
//
//   ADMIN MODE — triggered when ADMIN_SS_ID is missing or unreachable.
//     The first manual to run setup becomes the admin. It creates all
//     central shared assets, writes admin Script Properties, then
//     automatically chains into teacher setup so the admin's own
//     workspace is fully configured in one pass.
//
//   TEACHER MODE — triggered when ADMIN_SS_ID exists and is reachable.
//     Clones master template sheets, creates personal forms, registers
//     in MatrixRegistry, sets time-driven triggers, writes one-step
//     trigger authorization instructions into the manual.
//
// DISTRIBUTION:
//   Admin runs setup on their copy first (no pre-configuration needed).
//   Admin then makes one copy per teacher and shares it.
//   Teacher copies inherit Script Properties including ADMIN_SS_ID,
//   so they detect teacher mode automatically on first open.
// =============================================================================

// ---------------------------------------------------------------------------
// onOpen — detects role, builds appropriate menu
// ---------------------------------------------------------------------------
function onOpen() {
  // FIX (reconciliation decision 10): `props` was referenced below
  // (line ~56, `props.getProperty("INSTALLER_COMPLETE")`) without ever
  // being declared in this function's scope — a ReferenceError on every
  // doc open once SETUP_COMPLETE is set, i.e. for every user after
  // first-time setup finishes. Declared once here and reused for both
  // property reads, matching every other function in this file, which
  // already takes `props` as an explicit parameter.
  const props = PropertiesService.getScriptProperties();
  const ui    = DocumentApp.getUi();
  const role  = detectRole_();
  const setup = props.getProperty("SETUP_COMPLETE");

  if (!setup) {
    // First open — show setup wizard entry point for detected role
    const label = role === "ADMIN"
      ? "🚀 Run Admin + Teacher Setup"
      : "🚀 Run Teacher Setup";

    ui.createMenu("⚙️ Assignment System")
      .addItem(label, "runSetupWizard")
      .addToUi();

  } else {
    // Setup complete — show full operational menu based on role
    const menu = ui.createMenu("⚙️ Assignment System");

    if (role === "ADMIN") {
      menu
        .addItem("📊 Open Admin Health Check",         "openAdminHealthCheck")
        .addItem("📋 View Admin Setup Details",         "showAdminSummary")
        .addSeparator();
    }

    // Show installer item only if scripts haven't been installed yet
    const installed = props.getProperty("INSTALLER_COMPLETE");

    if (!installed) {
      menu.addItem("🔧 Install Scripts Automatically", "runAutoInstaller");
      menu.addSeparator();
    }

    if (role === "ADMIN") {
      menu.addItem("📊 Open Admin Health Check", "openAdminHealthCheck");
      menu.addItem("📋 View Admin Setup Details", "showAdminSummary");
      menu.addSeparator();
    }

    menu
      .addItem("📋 View My Setup Details",              "showTeacherSummary")
      .addItem("🔄 Re-Run Setup (Advanced)",            "runSetupWizard")
      .addSeparator()
      .addItem("📝 Create New Assignment",              "openRubricForm")
      .addItem("👥 Register a Student",                 "openIntakeForm")
      .addItem("📊 Open My Dashboard",                  "openTeacherDashboard")
      .addToUi();
  }
}

// ---------------------------------------------------------------------------
// detectRole_ — checks whether a reachable admin spreadsheet is configured
// ---------------------------------------------------------------------------
function detectRole_() {
  const adminSsId = PropertiesService.getScriptProperties().getProperty("ADMIN_SS_ID");
  if (!adminSsId) return "ADMIN";
  try {
    SpreadsheetApp.openById(adminSsId);
    return "TEACHER";
  } catch (e) {
    // ID present but inaccessible — treat as uninitialized admin
    return "ADMIN";
  }
}

// ---------------------------------------------------------------------------
// runSetupWizard — entry point for both roles
// ---------------------------------------------------------------------------
function runSetupWizard() {
  const role = detectRole_();
  if (role === "ADMIN") {
    runAdminSetup_();
  } else {
    runTeacherSetup_();
  }
}

// =============================================================================
// ADMIN SETUP
// =============================================================================

function runAdminSetup_() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // Check for partial setup from a previous interrupted run
  if (hasPartialSetup_("ADMIN")) {
    const issues   = verifyCheckpoints_();
    const hasIssues = issues.length > 0;
    // FIX (found while verifying reconciliation decision 10): these strings
    // previously contained literal, unescaped newline characters inside
    // double-quoted string literals — invalid JS, would fail to save in
    // the Apps Script editor (confirmed via `node --check`). Replaced with
    // proper "\n" escapes; message text is unchanged.
    const resumeMsg = hasIssues
      ? "A previous setup attempt was interrupted and some assets may be missing:\n" +
        issues.map(i => "  • " + i).join("\n") + "\n\n" +
        "Click OK to start fresh (existing assets will be reused where possible)."
      : "A previous setup attempt was interrupted before completing.\n\n" +
        "Click OK to resume from where it left off — no assets will be duplicated.";

    const resume = ui.alert("Resume Previous Setup?", resumeMsg, ui.ButtonSet.OK_CANCEL);
    if (resume !== ui.Button.OK) return;
    if (hasIssues) clearCheckpoints_("ADMIN");
  }

  if (ui.alert(
    "👋 Welcome — Admin Setup",
    "This is the first manual in the system, so this copy will become the admin.\n\n" +
    "Admin setup creates all shared infrastructure:\n" +
    "  • Central spreadsheet (Ledger, Queue, Staging, Registry tabs)\n" +
    "  • Admin Assignments folder hierarchy\n" +
    "  • Master template sheets for teacher onboarding\n" +
    "  • Student Turn-In Form\n\n" +
    "After admin setup, your personal teacher workspace will be configured automatically.\n\n" +
    "Click OK to begin. This takes about 60 seconds.",
    ui.ButtonSet.OK_CANCEL
  ) !== ui.Button.OK) return;

  // Collect admin details
  const emailResp = ui.prompt(
    "Admin Setup 1 of 2 — Admin Email",
    "Enter the admin account email address.\n" +
    "This receives system alerts and flagged submission notices:",
    ui.ButtonSet.OK_CANCEL
  );
  if (emailResp.getSelectedButton() !== ui.Button.OK) return;
  const adminEmail = emailResp.getResponseText().trim();
  if (!adminEmail || adminEmail.indexOf("@") === -1) {
    ui.alert("Setup cancelled — please enter a valid email address.");
    return;
  }

  const nameResp = ui.prompt(
    "Admin Setup 2 of 2 — Organization Name",
    "Enter your school or organization name (used in folder labels):",
    ui.ButtonSet.OK_CANCEL
  );
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  const orgName = nameResp.getResponseText().trim() || "School";

  const confirm = ui.alert(
    "✅ Ready to Create Admin Assets",
    "Admin email:   " + adminEmail + "\n" +
    "Organization:  " + orgName + "\n\n" +
    "Click OK to create all shared assets.",
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  try {
    const adminResult = createAdminAssets_(adminEmail, orgName);
    persistAdminProperties_(adminResult, adminEmail, orgName);
    writeAdminSummaryPage_(adminResult, adminEmail, orgName);

    ui.alert(
      "✅ Admin Setup Complete",
      "All shared assets have been created.\n\n" +
      "Your personal teacher workspace will now be configured.\n\n" +
      "Click OK to continue.",
      ui.ButtonSet.OK
    );

    // Chain directly into teacher setup using the freshly written admin IDs
    runTeacherSetup_();

  } catch (err) {
    ui.alert(
      "❌ Admin Setup Failed",
      "An error occurred:\n\n" + err.message + "\n\n" +
      "Check the Apps Script execution log for details.",
      ui.ButtonSet.OK
    );
    Logger.log("[ADMIN SETUP] Error: " + err.message + "\n" + err.stack);
  }
}

// ---------------------------------------------------------------------------
// createAdminAssets_ — creates all central shared infrastructure
// ---------------------------------------------------------------------------
function createAdminAssets_(adminEmail, orgName) {
  const safe = orgName.replace(/[^a-zA-Z0-9 _-]/g, "").trim();

  // ── 1. ADMIN ASSIGNMENTS ROOT FOLDER ──────────────────────────────────────
  // resumeOrCreate_ checks checkpoints — won't re-create if setup is resuming
  const assignmentsFolderId = resumeOrCreate_("ADMIN_FOLDER", () => {
    const root = DriveApp.getRootFolder();
    return createFolder_(root, "Assignments").getId();
  });
  const assignmentsFolder = DriveApp.getFolderById(assignmentsFolderId);

  const sharedFolderId = resumeOrCreate_("ADMIN_SHARED_FOLDER", () =>
    createFolder_(assignmentsFolder, "_Student Shared Folders").getId()
  );
  const templatesFolderId = resumeOrCreate_("ADMIN_TEMPLATES_FOLDER", () =>
    createFolder_(assignmentsFolder, "_System Templates").getId()
  );
  const sharedFolder    = DriveApp.getFolderById(sharedFolderId);
  const templatesFolder = DriveApp.getFolderById(templatesFolderId);

  // ── 2. CENTRAL LEDGER SPREADSHEET ─────────────────────────────────────────
  const ledgerSsId_c = resumeOrCreate_("ADMIN_LEDGER", () => {
    const ss = SpreadsheetApp.create(safe + " — Assignment System Ledger");
    DriveApp.getFileById(ss.getId()).moveTo(assignmentsFolder);
    return ss.getId();
  });
  const ledgerSs = SpreadsheetApp.openById(ledgerSsId_c);

  // Rename default sheet and create all required tabs
  const ledgerSheet = ledgerSs.getActiveSheet().setName("Ledger");
  setHeaders_(ledgerSheet, [
    "Timestamp","GoogleID","ConfigID","FileID","StudentName",
    "Block","ClassName","TeacherName","TeacherEmail","Subject",
    "CourseName","Period","Status","SubmissionTS","Notes",
    "LastEval","AdminFileURL","StudentFileURL","AcademicYear"
  ]);

  const queueSheet = ledgerSs.insertSheet("ReviewQueue");
  setHeaders_(queueSheet, [
    "Timestamp","GoogleID","FileID","ConfigID",
    "StudentText","Status","ResultRef"
  ]);

  const stagingSheet = ledgerSs.insertSheet("STAGING_PIPELINE");
  setHeaders_(stagingSheet, [
    "Timestamp","QueueRowRef","StudentFileID","ConfigID","TeacherEmail","Status"
  ]);

  const rubricQueueSheet = ledgerSs.insertSheet("RubricQueue");
  setHeaders_(rubricQueueSheet, [
    "Timestamp","TeacherEmail","TeacherName","Subject",
    "CourseName","Tier","RubricText","PromptTemplateID",
    "TeacherMatrixSsId","Status"
  ]);

  const registrySheet = ledgerSs.insertSheet("MatrixRegistry");
  setHeaders_(registrySheet, [
    "TeacherName","TeacherEmail","MatrixSsId","Created"
  ]);

  // ── 3. MASTER RUBRIC RESPONSE SHEET TEMPLATE ──────────────────────────────
  // Scripts 00 + 05 will be bound to this manually (instructions in summary)
  const rubricMasterSs = SpreadsheetApp.create("MASTER — Rubric Response Sheet");
  DriveApp.getFileById(rubricMasterSs.getId()).moveTo(templatesFolder);

  const rubricSheet = rubricMasterSs.getActiveSheet().setName("Form Responses 1");
  setHeaders_(rubricSheet, [
    "Timestamp","Email Address","Instructor Name","Subject",
    "Course Name","Academic Tier","Paste Evaluation Rubric",
    "Assignment Prompt Template Link"
  ]);

  // Instruction tab so the admin knows what to do with this sheet
  const rubricInstSheet = rubricMasterSs.insertSheet("SETUP INSTRUCTIONS");
  rubricInstSheet.getRange("A1").setValue(
    "ADMIN ACTION REQUIRED:\n\n" +
    "1. Open Extensions → Apps Script in THIS spreadsheet\n" +
    "2. Create two script files:\n" +
    "   File 1: name it '00_SharedConfig' — paste contents of 00_SharedConfig.js\n" +
    "   File 2: name it '05_TeacherIntakePipeline' — paste contents of 05_TeacherIntakePipeline.js\n" +
    "3. Save the project\n" +
    "4. Do NOT set up a trigger on THIS master sheet — each teacher's cloned\n" +
    "   copy needs its own trigger added manually after registration; the\n" +
    "   generated teacher setup summary walks them through it (see\n" +
    "   'Activate Your Rubric Trigger').\n\n" +
    "This sheet will be cloned for each teacher by the setup wizard.\n" +
    "The bound scripts clone with it automatically."
  );
  rubricInstSheet.getRange("A1").setWrap(true);
  rubricInstSheet.setColumnWidth(1, 600);
  rubricInstSheet.setRowHeight(1, 200);

  // ── 4. MASTER TEACHER MATRIX SHEET TEMPLATE ───────────────────────────────
  // Scripts 00 + 08 will be bound to this manually (instructions in summary)
  const matrixMasterSs = SpreadsheetApp.create("MASTER — Teacher Matrix Sheet");
  DriveApp.getFileById(matrixMasterSs.getId()).moveTo(templatesFolder);

  const matrixSheet = matrixMasterSs.getActiveSheet().setName("TeacherMatrix");
  setHeaders_(matrixSheet, [
    "ConfigID","UnitName","Tier","Persona",
    "Milestone1","Milestone2","Milestone3","Milestone4",
    "DefinitionOfDone","InstructorEmail","Created","Status",
    "PromptTemplateID","Subject","CourseName"
  ]);

  const draftSheet = matrixMasterSs.insertSheet("DraftUnits");
  setHeaders_(draftSheet, [
    "DraftID","ConfigID","InstructorEmail","InstructorName",
    "Tier","UnitName","Persona","Milestone1","Milestone2",
    "Milestone3","Milestone4","DefinitionOfDone","Created","Status"
  ]);

  const matrixInstSheet = matrixMasterSs.insertSheet("SETUP INSTRUCTIONS");
  matrixInstSheet.getRange("A1").setValue(
    "ADMIN ACTION REQUIRED:\n\n" +
    "1. Open Extensions → Apps Script in THIS spreadsheet\n" +
    "2. Create two script files:\n" +
    "   File 1: name it '00_SharedConfig' — paste contents of 00_SharedConfig.js\n" +
    "   File 2: name it '08_TeacherConfirmationStep' — paste contents of 08_TeacherConfirmationStep.js\n" +
    "3. Save the project\n" +
    "4. Do NOT set any triggers — Script 08's onOpen() registers them automatically the first time the cloned sheet is opened\n\n" +
    "This sheet will be cloned for each teacher by the setup wizard.\n" +
    "The bound scripts clone with it automatically."
  );
  matrixInstSheet.getRange("A1").setWrap(true);
  matrixInstSheet.setColumnWidth(1, 600);
  matrixInstSheet.setRowHeight(1, 200);

  // ── 5. TURN-IN FORM (FORM 2) ───────────────────────────────────────────────
  // Central — shared across all teachers, responses go to central ledger
  const turninForm = FormApp.create(safe + " — Assignment Turn-In");
  turninForm.setDescription(
    "Submit your completed assignment. " +
    "You must have a passing evaluation in your document before submitting."
  );
  turninForm.setCollectEmail(false);

  turninForm.addTextItem()
    .setTitle("Your Google Account").setRequired(true)
    .setHelpText("Enter the Google account email you used when registered. Must match exactly.");

  turninForm.addTextItem()
    .setTitle("Assignment Document Link").setRequired(true)
    .setHelpText("Open your document, copy the full URL from your browser, and paste here.");

  turninForm.addCheckboxItem()
    .setTitle("I confirm this is my own original work")
    .setChoiceValues(["Yes, this is my own work"])
    .setRequired(true);

  turninForm.setDestination(FormApp.DestinationType.SPREADSHEET, ledgerSs.getId());
  DriveApp.getFileById(turninForm.getId()).moveTo(assignmentsFolder);

  // Store Turn-In URL immediately so Script 02 can append it to student docs
  PropertiesService.getScriptProperties().setProperty(
    "CENTRAL_TURNIN_FORM_URL", turninForm.getPublishedUrl()
  );

  // ── 6. MASTER STUDENT TEMPLATE DOC PLACEHOLDER ───────────────────────────
  // The master student template is a Google Doc with Scripts 00+01+09+17 bound.
  // It cannot be created programmatically (Apps Script can't create Docs with
  // bound scripts). The admin must create it manually then set its ID.
  // Instructions are included in the admin summary page below.
  // For now, insert a placeholder property — admin updates after manual creation.

  // ── 7. CENTRAL SCRIPTS PROJECT PLACEHOLDER ────────────────────────────────
  // Scripts 00 + 02 + 03 + 04 + 06 + 10 + 18 need to be bound to the ledger
  // spreadsheet. Create an instruction sheet on the ledger to guide the admin.
  const scriptInstSheet = ledgerSs.insertSheet("SETUP INSTRUCTIONS");
  scriptInstSheet.getRange("A1").setValue(
    "ADMIN ACTION REQUIRED — bind central scripts to THIS spreadsheet:\n\n" +
    "1. Open Extensions → Apps Script in THIS spreadsheet\n" +
    "2. Create these script files (one file per script):\n" +
    "   00_SharedConfig.js\n" +
    "   02_Form1_IntakeAndWorkspaceGenerator.js\n" +
    "   03_QueueBridge.js\n" +
    "   04_Form2_TurnInGate.js\n" +
    "   06_StagingPipeline_Turnstile.js\n" +
    "   10_AdminRecoveryPanel.js\n" +
    "   18_FormSubmitDispatcher.js\n\n" +
    "3. In Project Settings → Script Properties, add:\n" +
    "   ID_ADMIN_SPREADSHEET = " + ledgerSs.getId() + "\n\n" +
    "4. Set these triggers:\n" +
    "   bridgeQueue              → Time-driven, every 1 minute\n" +
    "   backPropagateCompletions → Time-driven, every 2 minutes\n" +
    "   runStagingTurnstile      → Time-driven, every 1 minute\n" +
    "   dispatchFormSubmit       → From spreadsheet, On form submit (handler lives in 18_FormSubmitDispatcher.js)\n\n" +
    "NOTE: The Ledger tab includes an AcademicYear column (column S, index 18).\n" +
    "Script 02 populates this automatically from the CURRENT_TERM property.\n" +
    "Set CURRENT_TERM in Script Properties (e.g. '2025-26 S1') before registering students.\n\n" +
    "5. Enable Drive Advanced Service in the Services panel\n\n" +
    "See the admin summary page in your manual for all IDs."
  );
  scriptInstSheet.getRange("A1").setWrap(true);
  scriptInstSheet.setColumnWidth(1, 700);
  scriptInstSheet.setRowHeight(1, 300);

  return {
    // Folders
    assignmentsFolderId:    assignmentsFolder.getId(),
    assignmentsFolderUrl:   assignmentsFolder.getUrl(),
    sharedFolderId:         sharedFolder.getId(),
    templatesFolderId:      templatesFolder.getId(),
    templatesFolderUrl:     templatesFolder.getUrl(),

    // Central spreadsheet
    ledgerSsId:             ledgerSs.getId(),
    ledgerSsUrl:            ledgerSs.getUrl(),

    // Master templates
    masterRubricSsId:       rubricMasterSs.getId(),
    masterRubricSsUrl:      rubricMasterSs.getUrl(),
    masterMatrixSsId:       matrixMasterSs.getId(),
    masterMatrixSsUrl:      matrixMasterSs.getUrl(),

    // Turn-In form
    turninFormId:           turninForm.getId(),
    turninFormUrl:          turninForm.getPublishedUrl(),

    adminEmail:             adminEmail,
    orgName:                orgName
  };
}

// ---------------------------------------------------------------------------
// persistAdminProperties_ — writes all admin IDs to Script Properties
// These are inherited by every teacher copy of this manual
// ---------------------------------------------------------------------------
function persistAdminProperties_(result, adminEmail, orgName) {
  PropertiesService.getScriptProperties().setProperties({
    // Admin identity
    ADMIN_NOTIFY_EMAIL:           adminEmail,
    ORG_NAME:                     orgName,

    // Central infrastructure — inherited by all teacher copies
    ADMIN_ROOT_FOLDER_ID:         result.assignmentsFolderId,
    CENTRAL_LEDGER_SS_ID:         result.ledgerSsId,
    ADMIN_SS_ID:                  result.ledgerSsId,

    // Master template pointers — hardened references
    MASTER_RUBRIC_RESPONSE_SS_ID: result.masterRubricSsId,
    MASTER_TEACHER_MATRIX_SS_ID:  result.masterMatrixSsId,

    // Central Turn-In form — shared across all teachers
    CENTRAL_TURNIN_FORM_URL:      result.turninFormUrl,
    CENTRAL_TURNIN_FORM_ID:       result.turninFormId,

    // Master student template — admin fills in after manual creation (see summary)
    MASTER_STUDENT_TEMPLATE_ID:   "",

    // Web app URLs — admin fills these in after deploying Scripts 07 + 13
    TEACHER_DASHBOARD_URL:        "",
    STUDENT_DASHBOARD_URL:        ""
  });

  Logger.log("[ADMIN SETUP] Admin Script Properties written.");
}

// ---------------------------------------------------------------------------
// writeAdminSummaryPage_ — appends admin setup summary to the manual
// Includes all IDs, folder links, and the two manual script-binding steps
// ---------------------------------------------------------------------------
function writeAdminSummaryPage_(result, adminEmail, orgName) {
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const ts   = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy 'at' h:mm a"
  );

  body.appendPageBreak();

  body.appendParagraph("🔧 Admin Setup Details")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Admin setup completed: " + ts).setItalic(true);
  body.appendParagraph("");

  appendKV_(body, "Organization",  orgName);
  appendKV_(body, "Admin Email",   adminEmail);

  body.appendParagraph("").appendHorizontalRule();

  // Central assets
  body.appendParagraph("Central Assets")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  appendLink_(body, "📁  Assignments Root Folder",
    result.assignmentsFolderUrl,
    "All student documents and teacher folders live here.");
  appendLink_(body, "📊  Central Ledger Spreadsheet",
    result.ledgerSsUrl,
    "Ledger, ReviewQueue, STAGING_PIPELINE, RubricQueue, MatrixRegistry tabs.");
  appendLink_(body, "📁  System Templates Folder",
    result.templatesFolderUrl,
    "Master Rubric Response Sheet and Master Teacher Matrix Sheet.");
  appendLink_(body, "📬  Central Turn-In Form",
    result.turninFormUrl,
    "Share this URL with students when they are ready to submit.");

  body.appendParagraph("").appendHorizontalRule();

  // Required manual steps
  body.appendParagraph("⚠️  Required Manual Steps")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    "Two template sheets need scripts bound manually. " +
    "Each sheet has a SETUP INSTRUCTIONS tab with exact steps."
  ).setItalic(true);

  body.appendParagraph("");

  body.appendParagraph("Step 1 — Bind scripts to the Master Rubric Response Sheet")
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(result.masterRubricSsUrl);
  body.appendParagraph(
    "Open the SETUP INSTRUCTIONS tab in this sheet for the exact steps.\n" +
    "Scripts to bind: 00_SharedConfig.js and 05_TeacherIntakePipeline.js"
  );

  body.appendParagraph("");

  body.appendParagraph("Step 2 — Bind scripts to the Master Teacher Matrix Sheet")
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(result.masterMatrixSsUrl);
  body.appendParagraph(
    "Open the SETUP INSTRUCTIONS tab in this sheet for the exact steps.\n" +
    "Scripts to bind: 00_SharedConfig.js and 08_TeacherConfirmationStep.js"
  );

  body.appendParagraph("");

  body.appendParagraph("Step 3 — Create and configure the Master Student Template")
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(
    // FIX (found while verifying reconciliation decision 10): literal
    // unescaped newlines replaced with "\n", same as the resumeMsg fix
    // above. Also updates the Script 09 filename per reconciliation
    // decision 8 — the original 09_StudentRevisionGuidance.js (GAS writes
    // the report) is archived/superseded; 09_StudentRevisionGuidance_M1Base.js
    // (Studio writes the report) is the live design.
    "1. Create a new blank Google Doc (this is the master student template).\n" +
    "2. Open Extensions → Apps Script on that doc.\n" +
    "3. Create four script files and paste: 00_SharedConfig.js, " +
    "01_StudentDoc_ContainerScript.js, 09_StudentRevisionGuidance_M1Base.js, " +
    "17_MasterStudentTemplate.js\n" +
    "4. Set Script Properties on that doc:\n" +
    "     CENTRAL_LEDGER_SS_ID = " + result.ledgerSsId + "\n" +
    "     ADMIN_SS_ID          = " + result.ledgerSsId + "\n" +
    "5. Copy the doc's ID from its URL and open this manual's Apps Script project.\n" +
    "6. In Script Properties, set: MASTER_STUDENT_TEMPLATE_ID = [that doc ID]\n\n" +
    "This doc is never shared with anyone. Script 02 copies it for each student."
  );
  body.appendParagraph("");

  body.appendParagraph("Step 4 — Bind scripts to the Central Ledger Spreadsheet")
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(result.ledgerSsUrl);
  body.appendParagraph(
    "Open the SETUP INSTRUCTIONS tab in this sheet for the exact steps.\n" +
    "Scripts to bind: 00_SharedConfig.js, 02, 03, 04, 06, 10, 18.\n" +
    "Triggers to set: bridgeQueue (1 min), backPropagateCompletions (2 min),\n" +
    "runStagingTurnstile (1 min), onFormSubmit (Form 1 responses)."
  );

  body.appendParagraph("");

  body.appendParagraph("Step 5 — Deploy web apps and update dashboard URLs")
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(
    "After deploying Scripts 07 (Teacher Dashboard) and 13 (Student Dashboard) " +
    "as web apps, open this document's Apps Script project and update:\n\n" +
    "  TEACHER_DASHBOARD_URL = [Script 07 deployment URL]\n" +
    "  STUDENT_DASHBOARD_URL = [Script 13 deployment URL]\n\n" +
    "These values are stored in Script Properties and inherited by all teacher copies."
  );

  body.appendParagraph("");

  body.appendParagraph("Step 6 — Distribute teacher manuals")
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(
    "Make one copy of THIS document for each teacher.\n" +
    "Share the copy with the teacher as an editor.\n" +
    "The teacher opens it, clicks ⚙️ Assignment System → Run Teacher Setup,\n" +
    "and their workspace is created automatically."
  );

  body.appendParagraph("").appendHorizontalRule();

  // Technical reference
  body.appendParagraph("Technical Reference")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  [
    ["Central Ledger SS ID",           result.ledgerSsId],
    ["Admin Root Folder ID",           result.assignmentsFolderId],
    ["Master Rubric Response SS ID",   result.masterRubricSsId],
    ["Master Teacher Matrix SS ID",    result.masterMatrixSsId],
    ["Central Turn-In Form ID",        result.turninFormId]
  ].forEach(([k, v]) => appendKV_(body, k, v));

  doc.saveAndClose();
}

// =============================================================================
// TEACHER SETUP
// =============================================================================

function runTeacherSetup_() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // Verify admin properties are present before proceeding
  const required = [
    "ADMIN_ROOT_FOLDER_ID",
    "CENTRAL_LEDGER_SS_ID",
    "ADMIN_SS_ID",
    "MASTER_RUBRIC_RESPONSE_SS_ID",
    "MASTER_TEACHER_MATRIX_SS_ID"
  ];

  const missing = required.filter(k => !props.getProperty(k));
  if (missing.length > 0) {
    ui.alert(
      "⚠️ Admin Setup Required First",
      "This manual cannot run teacher setup yet.\n\n" +
      "Missing configuration:\n" + missing.map(k => "  • " + k).join("\n") + "\n\n" +
      "Contact your system administrator.",
      ui.ButtonSet.OK
    );
    return;
  }

  // Teacher detail collection
  if (ui.alert(
    "👋 Teacher Workspace Setup",
    "This wizard creates your personal assignment workspace.\n\n" +
    "You will be asked for:\n" +
    "  • Your full name\n" +
    "  • Your email address\n" +
    "  • Your subject area\n\n" +
    "Everything else is created automatically in about 30 seconds.",
    ui.ButtonSet.OK_CANCEL
  ) !== ui.Button.OK) return;

  const nameResp = ui.prompt(
    "Teacher Setup 1 of 3 — Your Name",
    "Enter your full name as it should appear on student documents:",
    ui.ButtonSet.OK_CANCEL
  );
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  const teacherName = nameResp.getResponseText().trim();
  if (!teacherName) { ui.alert("Setup cancelled — name cannot be blank."); return; }

  const emailResp = ui.prompt(
    "Teacher Setup 2 of 3 — Your Email",
    "Enter your email address for submission notifications:",
    ui.ButtonSet.OK_CANCEL
  );
  if (emailResp.getSelectedButton() !== ui.Button.OK) return;
  const teacherEmail = emailResp.getResponseText().trim();
  if (!teacherEmail || teacherEmail.indexOf("@") === -1) {
    ui.alert("Setup cancelled — please enter a valid email address.");
    return;
  }

  const subjectResp = ui.prompt(
    "Teacher Setup 3 of 3 — Your Subject",
    "Enter your subject area (e.g. Science, English, Mathematics):",
    ui.ButtonSet.OK_CANCEL
  );
  if (subjectResp.getSelectedButton() !== ui.Button.OK) return;
  const subject = subjectResp.getResponseText().trim();
  if (!subject) { ui.alert("Setup cancelled — subject cannot be blank."); return; }

  const confirm = ui.alert(
    "✅ Ready to Create Teacher Workspace",
    "Name:    " + teacherName + "\n" +
    "Email:   " + teacherEmail + "\n" +
    "Subject: " + subject + "\n\n" +
    "Click OK to create your workspace.",
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  try {
    const result = createTeacherAssets_(teacherName, teacherEmail, subject, props);

    persistTeacherProperties_(result, teacherName, teacherEmail, subject);

    writeTeacherSummaryPage_(result, teacherName, teacherEmail, subject);

    props.setProperty("SETUP_COMPLETE", "true");

    ui.alert(
      "🎉 Setup Complete!",
      "Your workspace is ready.\n\n" +
      "One final step is needed to activate your rubric upload trigger.\n" +
      "Instructions have been added to the end of this document.\n\n" +
      "Use the ⚙️ Assignment System menu to create assignments,\n" +
      "register students, and open your dashboard.",
      ui.ButtonSet.OK
    );

  } catch (err) {
    ui.alert(
      "❌ Teacher Setup Failed",
      "An error occurred:\n\n" + err.message + "\n\n" +
      "Contact your system administrator.",
      ui.ButtonSet.OK
    );
    Logger.log("[TEACHER SETUP] Error: " + err.message + "\n" + err.stack);
  }
}

// ---------------------------------------------------------------------------
// createTeacherAssets_ — clones templates, creates forms, sets triggers
// ---------------------------------------------------------------------------
function createTeacherAssets_(teacherName, teacherEmail, subject, props) {
  const safeName          = teacherName.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  const adminRootId       = props.getProperty("ADMIN_ROOT_FOLDER_ID");
  const centralSsId       = props.getProperty("CENTRAL_LEDGER_SS_ID");
  const adminSsId         = props.getProperty("ADMIN_SS_ID");
  const masterRubricSsId  = props.getProperty("MASTER_RUBRIC_RESPONSE_SS_ID");
  const masterMatrixSsId  = props.getProperty("MASTER_TEACHER_MATRIX_SS_ID");

  // ── TEACHER FOLDER ─────────────────────────────────────────────────────────
  const adminRoot     = DriveApp.getFolderById(adminRootId);
  const subjectFolder = createFolder_(adminRoot, subject);
  const teacherFolder = createFolder_(subjectFolder, safeName);

  // ── CLONE MASTER RUBRIC RESPONSE SHEET ────────────────────────────────────
  const rubricSsFile = DriveApp.getFileById(masterRubricSsId)
    .makeCopy(safeName + " — Rubric Responses", teacherFolder);
  const rubricSsId   = rubricSsFile.getId();

  // ── CLONE MASTER TEACHER MATRIX SHEET ─────────────────────────────────────
  const matrixSsFile = DriveApp.getFileById(masterMatrixSsId)
    .makeCopy(safeName + " — Teacher Matrix", teacherFolder);
  const matrixSsId   = matrixSsFile.getId();

  // ── WRITE _CONFIG TABS TO CLONED SHEETS ───────────────────────────────────
  // Script Properties don't clone. We write a _CONFIG tab to each cloned sheet
  // immediately so Scripts 05 and 08 can read config via getSheetConfig_()
  // using SpreadsheetApp.getActiveSpreadsheet() — no IDs needed at runtime.
  //
  // Rubric Response Sheet config (for Script 05)
  writeConfigTab_(rubricSsId, {
    ADMIN_SS_ID:            adminSsId,
    CENTRAL_LEDGER_SS_ID:  centralSsId,
    TEACHER_NAME:           teacherName,
    TEACHER_EMAIL:          teacherEmail,
    TEACHER_MATRIX_SS_ID:  matrixSsId,
    RUBRIC_QUEUE_TAB:       queueTabName,
    ADMIN_NOTIFY_EMAIL:     props.getProperty("ADMIN_NOTIFY_EMAIL") || ""
  });

  // Teacher Matrix Sheet config (for Script 08) — entry IDs added after form creation
  // We write a partial config now and update it after extractFormEntryIds_()
  writeConfigTab_(matrixSsId, {
    ADMIN_SS_ID:            adminSsId,
    CENTRAL_LEDGER_SS_ID:  centralSsId,
    TEACHER_NAME:           teacherName,
    TEACHER_EMAIL:          teacherEmail,
    ADMIN_NOTIFY_EMAIL:     props.getProperty("ADMIN_NOTIFY_EMAIL") || ""
    // CONFIRM_REVIEW_FORM_ID and entry IDs added below after form creation
  });

  // NOTE: Time-driven triggers for Script 08 (pollForNewDrafts, abandonStaleDrafts)
  // are registered by Script 08's own onOpen() when the teacher first opens the
  // cloned Teacher Matrix sheet. This avoids the cross-project trigger limitation.
  // The teacher simply needs to open the matrix sheet once after setup.

  // ── ADD TEACHER AUDIT QUEUE TAB TO ADMIN SPREADSHEET ──────────────────────
  const adminSs      = SpreadsheetApp.openById(adminSsId);
  const queueTabName = safeName + "_RubricQueue";
  if (!adminSs.getSheetByName(queueTabName)) {
    const qt = adminSs.insertSheet(queueTabName);
    setHeaders_(qt, [
      "Timestamp","TeacherEmail","TeacherName","Subject",
      "CourseName","Tier","RubricText","PromptTemplateID",
      "TeacherMatrixSsId","Status"
    ]);
  }

  // ── REGISTER IN MATRIXREGISTRY ─────────────────────────────────────────────
  try {
    const centralSs = SpreadsheetApp.openById(centralSsId);
    const registry  = centralSs.getSheetByName("MatrixRegistry");
    if (registry) registry.appendRow([safeName, teacherEmail, matrixSsId, new Date()]);
  } catch (e) {
    Logger.log("[TEACHER SETUP] MatrixRegistry warning: " + e.message);
  }

  // ── RUBRIC UPLOAD FORM ─────────────────────────────────────────────────────
  const rubricForm = FormApp.create(safeName + " — Assignment Rubric Upload");
  rubricForm.setDescription("Upload your rubric and prompt template to create a new assignment.");
  rubricForm.setCollectEmail(true);

  [
    { title: "Instructor Name",                  para: false, help: "Your full name.", req: true },
    { title: "Subject",                          para: false, help: "e.g. Science, English", req: true },
    { title: "Course Name",                      para: false, help: "e.g. AP Biology", req: true },
    { title: "Paste Evaluation Rubric",          para: true,
      help: "Full rubric text. The more detail you include, the better the AI evaluation.", req: true },
    { title: "Assignment Prompt Template Link",  para: false,
      help: "Google Doc URL of your student-facing assignment prompt.", req: true }
  ].forEach(f => {
    const item = (f.para ? rubricForm.addParagraphTextItem() : rubricForm.addTextItem())
      .setTitle(f.title).setRequired(f.req);
    if (f.help) item.setHelpText(f.help);
  });

  rubricForm.addMultipleChoiceItem()
    .setTitle("Academic Tier")
    .setChoiceValues(["Tier 1 Core","Tier 2 Honors","Tier 3 Executive"])
    .setRequired(true);

  rubricForm.setDestination(FormApp.DestinationType.SPREADSHEET, rubricSsId);
  DriveApp.getFileById(rubricForm.getId()).moveTo(teacherFolder);

  // ── CONFIRMATION REVIEW FORM ───────────────────────────────────────────────
  const confirmForm = FormApp.create(safeName + " — Assignment Review & Confirm");
  confirmForm.setDescription(
    "Review what the system extracted from your rubric. Edit anything incorrect, then submit."
  );
  confirmForm.setCollectEmail(true);

  [
    { title: "Draft ID",         para: false, help: "Auto-filled — do not edit." },
    { title: "Assignment Name",  para: false, help: "The name students will see." },
    { title: "AI Coach Persona", para: true,  help: "e.g. 'rigorous science writing coach'" },
    { title: "Milestone 1",      para: true,  help: "First major evaluation criterion." },
    { title: "Milestone 2",      para: true,  help: "" },
    { title: "Milestone 3",      para: true,  help: "" },
    { title: "Milestone 4",      para: true,  help: "" },
    { title: "Passing Standard", para: true,  help: "Hidden from students. Used as the final gate." }
  ].forEach(f => {
    const item = (f.para ? confirmForm.addParagraphTextItem() : confirmForm.addTextItem())
      .setTitle(f.title).setRequired(true);
    if (f.help) item.setHelpText(f.help);
  });

  // -- M5 -- four competency dropdown items, added after the eight
  // pre-existing items above (matching a teacher's natural reading order:
  // review each milestone's text, then tag it). Merged from
  // 16_UnifiedManualSetup_M5_ADDENDUM_v2.js — addCompetencyDropdownItems_()
  // itself already lived in this project (see that addendum file, still
  // present alongside this one), only this call site was unmerged.
  addCompetencyDropdownItems_(confirmForm, centralSsId);
  // -- M6 -- one more dropdown, placed after the four M5 competency
  // dropdowns so the reading order is: review milestones, tag
  // competencies, then tag the lesson unit. Merged from
  // 16_UnifiedManualSetup_M6_ADDENDUM.js — same story as M5 above.
  addLessonUnitDropdownItem_(confirmForm, centralSsId);

  const matrixSs        = SpreadsheetApp.openById(matrixSsId);
  const confirmRespSheet = matrixSs.insertSheet("ConfirmationResponses");
  setHeaders_(confirmRespSheet, [
    "Timestamp","Email Address","Draft ID","Assignment Name",
    "AI Coach Persona","Milestone 1","Milestone 2",
    "Milestone 3","Milestone 4","Passing Standard",
    // -- M5/M6 -- five trailing headers matching the five new form items --
    "Competency — Milestone 1","Competency — Milestone 2",
    "Competency — Milestone 3","Competency — Milestone 4",
    "Lesson Unit"
  ]);
  confirmForm.setDestination(FormApp.DestinationType.SPREADSHEET, matrixSsId);
  DriveApp.getFileById(confirmForm.getId()).moveTo(teacherFolder);

  // ── STUDENT INTAKE FORM (FORM 1) ───────────────────────────────────────────
  const intakeForm = FormApp.create(safeName + " — Student Registration");
  intakeForm.setDescription("Register a student for an assignment.");
  intakeForm.setCollectEmail(false);

  [
    { title: "Student Google Account",   help: "Student's Google account (any domain).",          req: true  },
    { title: "Student Full Name",        help: "",                                                 req: true  },
    { title: "Class Name",               help: "e.g. AP Biology",                                 req: true  },
    { title: "Subject",                  help: "",                                                 req: true  },
    { title: "Course Name",              help: "Must match exactly the course name on the assignment.", req: true  },
    { title: "Period",                   help: "e.g. 3",                                          req: true  },
    { title: "Teacher Name",             help: "Pre-fill: " + teacherName,                        req: true  },
    { title: "Teacher Email",            help: "Pre-fill: " + teacherEmail,                       req: false },
    { title: "Assignment Config ID",     help: "The ConfigID from your Teacher Matrix.",           req: true  }
  ].forEach(f => {
    const item = intakeForm.addTextItem().setTitle(f.title).setRequired(f.req);
    if (f.help) item.setHelpText(f.help);
  });

  intakeForm.addMultipleChoiceItem()
    .setTitle("Block")
    .setChoiceValues(["1","2O","2E","3O","3E","4O","4E"])
    .setRequired(true);

  intakeForm.setDestination(FormApp.DestinationType.SPREADSHEET, centralSsId);
  DriveApp.getFileById(intakeForm.getId()).moveTo(teacherFolder);

  // ── EXTRACT CONFIRMATION FORM ENTRY IDS ───────────────────────────────────
  const confirmEntryIds = extractFormEntryIds_(confirmForm);

  // ── UPDATE MATRIX _CONFIG WITH CONFIRM FORM DETAILS ───────────────────────
  // Now that we have the form ID and entry IDs, update the matrix config tab
  writeConfigTab_(matrixSsId, {
    ADMIN_SS_ID:               adminSsId,
    CENTRAL_LEDGER_SS_ID:      centralSsId,
    TEACHER_NAME:              teacherName,
    TEACHER_EMAIL:             teacherEmail,
    ADMIN_NOTIFY_EMAIL:        props.getProperty("ADMIN_NOTIFY_EMAIL") || "",
    CONFIRM_REVIEW_FORM_ID:    confirmForm.getId(),
    ...confirmEntryIds         // CONFIRM_ENTRY_* keys
  });

  return {
    teacherFolderId:   teacherFolder.getId(),
    teacherFolderUrl:  teacherFolder.getUrl(),
    rubricSsId,
    rubricSsUrl:       rubricSsFile.getUrl(),
    matrixSsId,
    matrixSsUrl:       matrixSsFile.getUrl(),
    queueTabName,
    rubricFormId:      rubricForm.getId(),
    rubricFormUrl:     rubricForm.getPublishedUrl(),
    confirmFormId:     confirmForm.getId(),
    confirmFormUrl:    confirmForm.getPublishedUrl(),
    intakeFormId:      intakeForm.getId(),
    intakeFormUrl:     intakeForm.getPublishedUrl(),
    // Turn-in form is central — read from props
    turninFormUrl:     PropertiesService.getScriptProperties()
                         .getProperty("CENTRAL_TURNIN_FORM_URL") || "",
    confirmEntryIds
  };
}

// ---------------------------------------------------------------------------
// extractFormEntryIds_
// ---------------------------------------------------------------------------
// M5/M6 note: this function used to also exist, nearly identically, as a
// "paste this version over it" replacement in
// 16_UnifiedManualSetup_M5_ADDENDUM_v2.js — that addendum's own header
// said as much, but nobody had actually done the paste, so both files
// declared extractFormEntryIds_ as literal top-level code while sharing
// this project's global scope. Caught by tools/gas-lint/check.js. Merged
// here now, per that addendum's own instruction, plus the one-line M6
// extension (16_UnifiedManualSetup_M6_ADDENDUM.js) for the Lesson Unit
// dropdown. The addendum files are left in place as the historical
// record of what changed and why — see their own headers — not deleted.
function extractFormEntryIds_(form) {
  const titleToKey = {
    "Draft ID":         "CONFIRM_ENTRY_DRAFT_ID",
    "Assignment Name":  "CONFIRM_ENTRY_UNIT_NAME",
    "AI Coach Persona": "CONFIRM_ENTRY_PERSONA",
    "Milestone 1":      "CONFIRM_ENTRY_MILESTONE_1",
    "Milestone 2":      "CONFIRM_ENTRY_MILESTONE_2",
    "Milestone 3":      "CONFIRM_ENTRY_MILESTONE_3",
    "Milestone 4":      "CONFIRM_ENTRY_MILESTONE_4",
    "Passing Standard": "CONFIRM_ENTRY_DOD",
    // -- M5 --
    "Competency — Milestone 1": "CONFIRM_ENTRY_COMP_1",
    "Competency — Milestone 2": "CONFIRM_ENTRY_COMP_2",
    "Competency — Milestone 3": "CONFIRM_ENTRY_COMP_3",
    "Competency — Milestone 4": "CONFIRM_ENTRY_COMP_4",
    // -- M6 --
    "Lesson Unit": "CONFIRM_ENTRY_LESSON_UNIT",
  };

  const map = {};
  for (const item of form.getItems()) {
    const key = titleToKey[item.getTitle()];
    if (!key) continue;
    try {
      const type = item.getType();
      const id   = type === FormApp.ItemType.TEXT
        ? item.asTextItem().getId()
        : type === FormApp.ItemType.PARAGRAPH_TEXT
          ? item.asParagraphTextItem().getId()
          // -- M5 -- new branch for the competency (and M6's lesson-unit) dropdowns
          : type === FormApp.ItemType.LIST
            ? item.asListItem().getId()
            : null;
      if (id) map[key] = "entry." + id;
    } catch (e) { /* skip */ }
  }
  return map;
}

// ---------------------------------------------------------------------------
// persistTeacherProperties_
// ---------------------------------------------------------------------------
function persistTeacherProperties_(result, teacherName, teacherEmail, subject) {
  PropertiesService.getScriptProperties().setProperties({
    TEACHER_NAME:             teacherName,
    TEACHER_EMAIL:            teacherEmail,
    TEACHER_SUBJECT:          subject,
    TEACHER_FOLDER_ID:        result.teacherFolderId,
    TEACHER_FOLDER_URL:       result.teacherFolderUrl,
    TEACHER_MATRIX_SS_ID:     result.matrixSsId,
    TEACHER_MATRIX_SS_URL:    result.matrixSsUrl,
    RUBRIC_RESPONSE_SS_ID:    result.rubricSsId,
    RUBRIC_RESPONSE_SS_URL:   result.rubricSsUrl,
    RUBRIC_QUEUE_TAB:         result.queueTabName,
    RUBRIC_FORM_ID:           result.rubricFormId,
    RUBRIC_FORM_URL:          result.rubricFormUrl,
    CONFIRM_REVIEW_FORM_ID:   result.confirmFormId,
    CONFIRM_REVIEW_FORM_URL:  result.confirmFormUrl,
    INTAKE_FORM_ID:           result.intakeFormId,
    INTAKE_FORM_URL:          result.intakeFormUrl,
    TURNIN_FORM_URL:          result.turninFormUrl,
    ...result.confirmEntryIds
  });
  Logger.log("[TEACHER SETUP] Teacher Script Properties written.");
}

// ---------------------------------------------------------------------------
// writeTeacherSummaryPage_
// ---------------------------------------------------------------------------
function writeTeacherSummaryPage_(result, teacherName, teacherEmail, subject) {
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const ts   = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy 'at' h:mm a"
  );

  body.appendPageBreak();

  body.appendParagraph("⚙️ Your Teacher Setup Details")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Setup completed: " + ts).setItalic(true);
  body.appendParagraph("");

  appendKV_(body, "Name",    teacherName);
  appendKV_(body, "Email",   teacherEmail);
  appendKV_(body, "Subject", subject);

  body.appendParagraph("").appendHorizontalRule();

  body.appendParagraph("Your Forms")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  appendLink_(body, "📤  Assignment Rubric Upload Form", result.rubricFormUrl,
    "Use this to create new assignments. AI extracts your criteria automatically.");
  appendLink_(body, "👥  Student Registration Form",     result.intakeFormUrl,
    "Use this to register each student. Their document is created automatically.");
  appendLink_(body, "📬  Student Turn-In Form",          result.turninFormUrl,
    "Share this link with students when they are ready to submit.");

  body.appendParagraph("").appendHorizontalRule();

  body.appendParagraph("Your Spreadsheets")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  appendLink_(body, "📊  Teacher Matrix", result.matrixSsUrl,
    "Contains all your assignment configurations. Do not edit directly.");
  appendLink_(body, "📁  Your Admin Folder", result.teacherFolderUrl,
    "Your forms, response sheets, and Teacher Matrix live here.");

  body.appendParagraph("").appendHorizontalRule();

  // One remaining manual step — trigger authorization
  body.appendParagraph("⚠️  One Final Step — Activate Your Rubric Trigger")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  body.appendParagraph(
    "Your assignment creation flow needs one manual authorization step. " +
    "This takes about 2 minutes and only needs to be done once."
  ).setItalic(true);

  body.appendParagraph("");

  [
    ["Step 1 — Open your Rubric Responses spreadsheet", result.rubricSsUrl],
    ["Step 2 — Click:  Extensions → Apps Script", null],
    ["Step 3 — Click the clock icon (⏰) in the left sidebar → + Add Trigger", null],
    ["Step 4 — Configure the trigger exactly as shown:", null]
  ].forEach(([heading, url]) => {
    body.appendParagraph(heading).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    if (url) body.appendParagraph(url);
    body.appendParagraph("");
  });

  [
    "Function to run:    onTeacherRubricSubmit",
    "Deployment:         Head",
    "Event source:       From spreadsheet",
    "Event type:         On form submit",
    "Failure notify:     Immediately"
  ].forEach(line => body.appendParagraph("        " + line).setSpacingBefore(2).setSpacingAfter(2));

  body.appendParagraph("");

  body.appendParagraph("Step 5 — Click Save and authorize when Google prompts you")
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(
    "Click Allow. This is a one-time authorization. You will not be asked again."
  );

  body.appendParagraph("");
  body.appendParagraph("✅  Once the trigger appears in the list, you are done.").setBold(true);

  body.appendParagraph("");
  body.appendParagraph("Step 6 — Open your Teacher Matrix spreadsheet once")
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(result.matrixSsUrl);
  body.appendParagraph(
    "Opening it triggers onOpen() in the bound Script 08, which automatically " +
    "registers the evaluation polling triggers on that sheet's script project. " +
    "You only need to do this once. After that, the system monitors for new " +
    "assignment drafts automatically."
  );

  body.appendParagraph("");
  body.appendParagraph("✅  After completing Steps 5 and 6, your workspace is fully active.").setBold(true);

  body.appendParagraph("").appendHorizontalRule();

  body.appendParagraph("Technical Reference (Admin Use)")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  [
    ["Teacher Matrix SS ID",  result.matrixSsId],
    ["Rubric Response SS ID", result.rubricSsId],
    ["Rubric Form ID",        result.rubricFormId],
    ["Confirm Form ID",       result.confirmFormId],
    ["Intake Form ID",        result.intakeFormId],
    ["Teacher Folder ID",     result.teacherFolderId],
    ["RubricQueue Tab",       result.queueTabName]
  ].forEach(([k, v]) => appendKV_(body, k, v));

  doc.saveAndClose();
}

// =============================================================================
// MENU ACTIONS
// =============================================================================

function openRubricForm() {
  showLink_("Open your Rubric Upload Form to create a new assignment:",
    PropertiesService.getScriptProperties().getProperty("RUBRIC_FORM_URL"));
}

function openIntakeForm() {
  showLink_("Open the Student Registration Form:",
    PropertiesService.getScriptProperties().getProperty("INTAKE_FORM_URL"));
}

function openTeacherDashboard() {
  const url = PropertiesService.getScriptProperties().getProperty("TEACHER_DASHBOARD_URL");
  showLink_("Open your Teacher Dashboard:",
    url || "Dashboard URL not configured yet — contact your admin after they deploy Script 07.");
}

function openAdminHealthCheck() {
  showLink_("Open the Central Ledger Spreadsheet to access Admin Controls:",
    PropertiesService.getScriptProperties().getProperty("CENTRAL_LEDGER_SS_URL") || "");
}

function showAdminSummary() {
  const p  = PropertiesService.getScriptProperties().getProperties();
  DocumentApp.getUi().alert("Admin Summary",
    "Org:     " + (p.ORG_NAME            || "—") + "\n" +
    "Email:   " + (p.ADMIN_NOTIFY_EMAIL   || "—") + "\n\n" +
    "Ledger:  " + (p.CENTRAL_LEDGER_SS_ID || "—") + "\n" +
    "Root:    " + (p.ADMIN_ROOT_FOLDER_ID || "—") + "\n\n" +
    "Scroll to the Admin Setup Details page for full information.",
    DocumentApp.getUi().ButtonSet.OK);
}

function showTeacherSummary() {
  const p  = PropertiesService.getScriptProperties().getProperties();
  DocumentApp.getUi().alert("Your Setup Summary",
    "Name:    " + (p.TEACHER_NAME    || "—") + "\n" +
    "Email:   " + (p.TEACHER_EMAIL   || "—") + "\n" +
    "Subject: " + (p.TEACHER_SUBJECT || "—") + "\n\n" +
    "Rubric Form:\n"     + (p.RUBRIC_FORM_URL  || "—") + "\n\n" +
    "Registration Form:\n" + (p.INTAKE_FORM_URL  || "—") + "\n\n" +
    "Turn-In Form:\n"    + (p.TURNIN_FORM_URL  || "—") + "\n\n" +
    "Scroll to Your Teacher Setup Details for full information.",
    DocumentApp.getUi().ButtonSet.OK);
}

// ---------------------------------------------------------------------------
// markInstallerComplete — called by Script 21 after successful installation
// Removes the installer menu item on next open
// ---------------------------------------------------------------------------
function markInstallerComplete() {
  PropertiesService.getScriptProperties().setProperty("INSTALLER_COMPLETE", "true");
}

// =============================================================================
// SHARED HELPERS
// =============================================================================

function createFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function setHeaders_(sheet, headers) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setFontWeight("bold").setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
}

function appendKV_(body, label, value) {
  const p = body.appendParagraph("");
  p.appendText(label + ":  ").setBold(true);
  p.appendText(value || "—").setBold(false);
}

function appendLink_(body, label, url, description) {
  body.appendParagraph(label).setBold(true);
  if (description) body.appendParagraph(description).setItalic(true);
  body.appendParagraph(url || "—");
  body.appendParagraph("");
}

function showLink_(message, url) {
  DocumentApp.getUi().alert("Open This Link",
    message + "\n\n" + (url || "Not configured — contact your admin."),
    DocumentApp.getUi().ButtonSet.OK);
}
