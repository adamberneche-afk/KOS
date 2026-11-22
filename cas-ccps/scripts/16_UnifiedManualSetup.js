// =============================================================================
// FILE: 16_UnifiedManualSetup.js
// BOUND TO: Assignment System Manual Google Doc (container-bound)
// REPLACES: 14_TeacherManualSetup.js
//
// PURPOSE: The setup wizard, for the admin and for each teacher: one document and script, the role decided when it runs.
//          Single document, single script, role determined at runtime.
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


    menu
      .addItem("📋 View My Setup Details",              "showTeacherSummary")
      .addItem("🔄 Re-Run Setup (Advanced)",            "runSetupWizard")
      // NEW (finding #2): "Re-Run Setup" now safely resumes from
      // checkpoints instead of recreating assets — this is the one path
      // that deliberately does start over, kept separate so an intentional
      // reset stays possible without being what a normal re-run does.
      .addItem("⚠ Force Rebuild Workspace (Advanced)",  "forceRebuildTeacherWorkspace")
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

// ---------------------------------------------------------------------------
// _promptWithRetry_ — Contextual Gates Pattern 2 (in-place retry loop).
// NEW (Say/Do Ledger cas-ccps finding #3, decided Option A).
// Presents the same ui.prompt() up to 3 times. A failed validation
// re-presents the same prompt in-place — the wizard never exits or sends
// the user to a menu item to try again — with the specific problem named
// before the next attempt, not a generic "invalid input." On the 3rd
// failure it stops cleanly with a message naming what's still wrong,
// rather than letting a bad value silently proceed or the wizard just
// vanish. Returns the validated string, or null if the user cancelled or
// exhausted all 3 attempts.
// ---------------------------------------------------------------------------
function _promptWithRetry_(ui, title, helpText, validateFn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = ui.prompt(
      title + (attempt > 0 ? " — Fix and Retry" : ""),
      helpText,
      ui.ButtonSet.OK_CANCEL
    );
    if (resp.getSelectedButton() !== ui.Button.OK) return null;

    const value   = resp.getResponseText().trim();
    const problem = validateFn(value);
    if (!problem) return value;

    if (attempt === 2) {
      ui.alert(
        "⚠ " + title + " — Setup Paused",
        problem + "\n\n" +
        "Setup will stop here so nothing gets created with bad data.\n" +
        "Reopen the ⚙️ Assignment System menu to try this step again.",
        ui.ButtonSet.OK
      );
      return null;
    }
    ui.alert("⚠ " + title + " — Please fix and retry", problem, ui.ButtonSet.OK);
    // Loop continues — same prompt re-presented, not a restart.
  }
  return null;
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
    "  • Master template sheets for teacher onboarding\n\n" +
    "After admin setup, your personal teacher workspace will be configured automatically.\n\n" +
    "Click OK to begin. This takes about 60 seconds.",
    ui.ButtonSet.OK_CANCEL
  ) !== ui.Button.OK) return;

  // Collect admin details
  // FIXED (finding #3): was single-shot — one bad keystroke and the whole
  // wizard exited, forcing a full restart from the welcome dialog. Now
  // retries in-place up to 3 times (Contextual Gates Pattern 2).
  const adminEmail = _promptWithRetry_(
    ui,
    "Admin Setup 1 of 2 — Admin Email",
    "Enter the admin account email address.\n" +
    "This receives system alerts and flagged submission notices:",
    v => (!v || v.indexOf("@") === -1)
      ? "That doesn't look like a valid email address — it needs an \"@\"."
      : null
  );
  if (!adminEmail) return;

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

    // FIXED (finding #3, Contextual Gates Pattern 1 — verify after create):
    // createAdminAssets_() not throwing doesn't guarantee every tab/file it
    // claims to have created actually exists (Drive/Sheets quota, a
    // mid-run interruption). The step's completion condition is the
    // read-back below, not the create call returning — gate blocks before
    // persisting properties or declaring success.
    const missingAssets = _verifyAdminAssets_(adminResult);
    if (missingAssets.length > 0) {
      ui.alert(
        "✗ Admin Setup Incomplete",
        "Some assets could not be verified right after creation:\n\n" +
        missingAssets.map(m => "  • " + m).join("\n") + "\n\n" +
        "This is usually a temporary Drive/Sheets permission or quota " +
        "issue. Reopen the ⚙️ Assignment System menu and run setup again — " +
        "assets already created above will be reused, not duplicated.",
        ui.ButtonSet.OK
      );
      return; // Gate: do not persist properties or declare success
    }

    persistAdminProperties_(adminResult, adminEmail, orgName);
    writeAdminSummaryPage_(adminResult, adminEmail, orgName);

    ui.alert(
      "✅ Admin Setup Complete",
      "All shared assets have been created and verified.\n\n" +
      "Your personal teacher workspace will now be configured.\n\n" +
      "Click OK to continue.",
      ui.ButtonSet.OK
    );

    // Chain directly into teacher setup using the freshly written admin IDs
    runTeacherSetup_();

  } catch (err) {
    // FIXED (finding #3, gate 02 — name the cause, give a path forward):
    // "Check the execution log" was the whole message. Every step above
    // is now checkpointed (resumeOrCreate_, 20_SetupCheckpoint.js), so
    // what's actually true today is stronger and more useful to say:
    // nothing already created gets lost, and re-running resumes instead
    // of duplicating.
    ui.alert(
      "❌ Admin Setup Failed",
      "Setup stopped while creating assets: " + err.message + "\n\n" +
      "Nothing already created above was lost — those steps are " +
      "checkpointed. Reopen the ⚙️ Assignment System menu and run setup " +
      "again to resume from here instead of starting over.",
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

  // Rename default sheet and create all required tabs.
  // FIXED (found while extending resumeOrCreate_() per finding #2's
  // decision text — "already proven 4x in createAdminAssets_()", which
  // turned out not fully true): ADMIN_LEDGER only checkpointed the
  // spreadsheet's ID, not the tabs inside it. A resume after any later
  // step failed would hit an already-populated ledger, and
  // ledgerSs.insertSheet(TABS.reviewQueue) throws "sheet already exists" on
  // a name collision — no checkpoint needed for this, just the same
  // get-or-create guard createFolder_() already uses for folders.
  let ledgerSheet = ledgerSs.getSheetByName(TABS.ledger);
  if (!ledgerSheet) {
    ledgerSheet = ledgerSs.getActiveSheet().setName("Ledger");
    // The full header row from 00_SharedConfig.js (LEDGER_HEADERS); an older
    // Ledger gets the later columns on first use.
    setHeaders_(ledgerSheet, LEDGER_HEADERS.slice());
  }

  if (!ledgerSs.getSheetByName(TABS.reviewQueue)) {
    setHeaders_(ledgerSs.insertSheet(TABS.reviewQueue), RVQ_HEADERS.slice());
  }

  if (!ledgerSs.getSheetByName(TABS.stagingPipeline)) {
    setHeaders_(ledgerSs.insertSheet(TABS.stagingPipeline), [
      "Timestamp","QueueRowRef","StudentFileID","ConfigID","TeacherEmail","Status"
    ]);
  }

  if (!ledgerSs.getSheetByName(TABS.rubricQueue)) {
    setHeaders_(ledgerSs.insertSheet(TABS.rubricQueue), RBQ_HEADERS.slice());
  }

  if (!ledgerSs.getSheetByName(TABS.matrixRegistry)) {
    setHeaders_(ledgerSs.insertSheet(TABS.matrixRegistry), [
      "TeacherName","TeacherEmail","MatrixSsId","Created"
    ]);
  }

  // ── 3+4. MASTER TEMPLATE SHEETS (Rubric Response + Teacher Matrix) ────────
  // FIXED (same finding #2 investigation): these two SpreadsheetApp.create()
  // calls had NO checkpoint at all before this fix — unlike the ledger
  // above, a duplicate here doesn't even throw, it just silently creates a
  // second/third/fourth copy of both master templates on every retry.
  // Bundled under one checkpoint — CHECKPOINT_ADMIN_TEMPLATES was already
  // documented in 20_SetupCheckpoint.js's header comment ("Master template
  // sheets created", plural, one key) but nothing wrote or read it until
  // now — the same vaporware-constant story as the teacher-side keys this
  // same finding fixes in createTeacherAssets_().
  const templatesResult = resumeOrCreate_("ADMIN_TEMPLATES", () => {
    // Master Rubric Response Sheet — Scripts 00 + 05 bound manually (instructions below)
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

    // Master Teacher Matrix Sheet — Scripts 00 + 08 bound manually (instructions below)
    const matrixMasterSs = SpreadsheetApp.create("MASTER — Teacher Matrix Sheet");
    DriveApp.getFileById(matrixMasterSs.getId()).moveTo(templatesFolder);

    const matrixSheet = matrixMasterSs.getActiveSheet().setName("TeacherMatrix");
    setHeaders_(matrixSheet, TM_HEADERS.slice()); // 00_SharedConfig.js

    const draftSheet = matrixMasterSs.insertSheet(TABS.draftUnits);
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

    return {
      masterRubricSsId: rubricMasterSs.getId(),
      masterMatrixSsId: matrixMasterSs.getId()
    };
  });
  const rubricMasterSs = SpreadsheetApp.openById(templatesResult.masterRubricSsId);
  const matrixMasterSs = SpreadsheetApp.openById(templatesResult.masterMatrixSsId);

  // ── 5. (retired) TURN-IN FORM ─────────────────────────────────────────────
  // Setup used to create a central Turn-In Form here (checkpoint
  // ADMIN_TURNIN). Students turn in on Canvas, and the form's handler was
  // retired on 2026-10-10 (P0-04), so a new install no longer creates one.
  // An existing install's form and CENTRAL_TURNIN_FORM_* properties are
  // left alone; submissions to it are ignored.

  // ── 6. MASTER STUDENT TEMPLATE DOC PLACEHOLDER ───────────────────────────
  // The master student template is a Google Doc with Scripts 00 and 01 bound.
  // It cannot be created programmatically (Apps Script can't create Docs with
  // bound scripts). The admin must create it manually then set its ID.
  // Instructions are included in the admin summary page below; nothing is set here.

  // ── 7. CENTRAL SCRIPTS PROJECT PLACEHOLDER ────────────────────────────────
  // Scripts 00 + 02 + 03 + 04 + 06 + 10 + 18 need to be bound to the ledger
  // spreadsheet. Create an instruction sheet on the ledger to guide the admin.
  // Guarded the same way as the ledger's other tabs above — this was also
  // an unconditional insertSheet() before this fix.
  if (!ledgerSs.getSheetByName("SETUP INSTRUCTIONS")) {
    const scriptInstSheet = ledgerSs.insertSheet("SETUP INSTRUCTIONS");
    scriptInstSheet.getRange("A1").setValue(
      "ADMIN ACTION REQUIRED — set up the scripts bound to THIS spreadsheet\n" +
      "(cas-ccps/docs/SETUP_GUIDE.md has every step):\n\n" +
      "1. Push the central-ledger project's files to this spreadsheet with run.js\n" +
      "   (tools/gas-lint/project-map.json lists them).\n\n" +
      "2. In Project Settings → Script Properties, add TEACHER_EMAIL and TEACHER_NAME.\n" +
      "   The dashboards need CENTRAL_LEDGER_SS_ID and ADMIN_SS_ID = " + ledgerSs.getId() + "\n\n" +
      "3. In this spreadsheet's editor run installIntakeTriggers() (and\n" +
      "   installFormSubmitTrigger() if students use the intake form), then\n" +
      "   previewLedgerCycle() and installLedgerCycle(): one cycle runs the\n" +
      "   frequent jobs, each at its own pace.\n\n" +
      "NOTE: The Ledger tab includes an AcademicYear column (column S, index 18).\n" +
      "Script 02 populates this automatically from the CURRENT_TERM property.\n" +
      "Set CURRENT_TERM in Script Properties (school year and marking period, e.g. '2627_MP1') before registering students.\n\n" +
      "4. Enable Drive Advanced Service in the Services panel\n\n" +
      "See the admin summary page in your manual for all IDs."
    );
    scriptInstSheet.getRange("A1").setWrap(true);
    scriptInstSheet.setColumnWidth(1, 700);
    scriptInstSheet.setRowHeight(1, 300);
  }

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


    adminEmail:             adminEmail,
    orgName:                orgName
  };
}

// ---------------------------------------------------------------------------
// _verifyAdminAssets_ — Contextual Gates Pattern 1 (verify after create).
// NEW (Say/Do Ledger cas-ccps finding #3). Reads back every asset
// createAdminAssets_() just claims to have created and confirms it's
// actually reachable/present — the create calls above not throwing is not
// itself proof (a tab-insert can succeed while a spreadsheet is over
// quota; a moveTo() can silently no-op on a permissions edge case). Returns
// an array of human-readable descriptions of anything missing (empty = all
// verified).
// ---------------------------------------------------------------------------
function _verifyAdminAssets_(result) {
  const missing = [];

  try {
    const ledgerSs = SpreadsheetApp.openById(result.ledgerSsId);
    ["Ledger", "ReviewQueue", "STAGING_PIPELINE", "RubricQueue", "MatrixRegistry", "SETUP INSTRUCTIONS"]
      .forEach(t => { if (!ledgerSs.getSheetByName(t)) missing.push("Central Ledger tab \"" + t + "\""); });
  } catch (e) { missing.push("Central Ledger Spreadsheet (" + result.ledgerSsUrl + ")"); }

  try { DriveApp.getFolderById(result.assignmentsFolderId); }
  catch (e) { missing.push("Assignments Root Folder (" + result.assignmentsFolderUrl + ")"); }

  try {
    const rubricSs = SpreadsheetApp.openById(result.masterRubricSsId);
    ["Form Responses 1", "SETUP INSTRUCTIONS"].forEach(t => {
      if (!rubricSs.getSheetByName(t)) missing.push("Master Rubric Response Sheet tab \"" + t + "\"");
    });
  } catch (e) { missing.push("Master Rubric Response Sheet (" + result.masterRubricSsUrl + ")"); }

  try {
    const matrixSs = SpreadsheetApp.openById(result.masterMatrixSsId);
    ["TeacherMatrix", "DraftUnits", "SETUP INSTRUCTIONS"].forEach(t => {
      if (!matrixSs.getSheetByName(t)) missing.push("Master Teacher Matrix Sheet tab \"" + t + "\"");
    });
  } catch (e) { missing.push("Master Teacher Matrix Sheet (" + result.masterMatrixSsUrl + ")"); }

  return missing;
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
    CENTRAL_LEDGER_SS_URL:        centralLedgerUrl_(result.ledgerSsId),
    ADMIN_SS_ID:                  result.ledgerSsId,

    // Master template pointers — hardened references
    MASTER_RUBRIC_RESPONSE_SS_ID: result.masterRubricSsId,
    MASTER_TEACHER_MATRIX_SS_ID:  result.masterMatrixSsId,

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
    // decision 8 — the retired original 09_StudentRevisionGuidance.js (GAS writes
    // the report) is archived/superseded; 09_StudentRevisionGuidance_M1Base.js
    // (Studio writes the report) is the live design. That reference copy was
    // deleted 2026-11-20 (03 holds the live code); 17 (comments only) 2026-11-21.
    "1. Create a new blank Google Doc (this is the master student template).\n" +
    "2. Open Extensions → Apps Script on that doc.\n" +
    "3. Create two script files and paste: 00_SharedConfig.js, " +
    "01_StudentDoc_ContainerScript.js\n" +
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
    "Triggers to set: bridgeQueue, backPropagateCompletions and runStagingTurnstile\n" +
    "(each every 1 minute), onFormSubmit (Form 1 responses). Then run installLedgerCycle()\n" +
    "(64): one cycle takes over the three timed triggers and runs each every minute."
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
    ["Master Teacher Matrix SS ID",    result.masterMatrixSsId]
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

  // FIXED (Say/Do Ledger cas-ccps finding #2): runAdminSetup_() already had
  // this resume-or-start-fresh check (hasPartialSetup_("ADMIN")) — teacher
  // setup had no equivalent, so a failed run left no visible way back in
  // except silently re-running from scratch (which, before this same
  // finding's idempotency fix below, would have duplicated every asset).
  if (hasPartialSetup_("TEACHER")) {
    const resume = ui.alert(
      "Resume Previous Teacher Setup?",
      "A previous setup attempt for this workspace didn't finish.\n\n" +
      "Click OK to resume from where it left off — no folders, sheets, or " +
      "forms already created will be duplicated.",
      ui.ButtonSet.OK_CANCEL
    );
    if (resume !== ui.Button.OK) return;
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

  // FIXED (finding #3): all three prompts below now retry in-place (up to
  // 3 attempts) instead of exiting the whole wizard on the first bad
  // keystroke (Contextual Gates Pattern 2).
  const teacherName = _promptWithRetry_(
    ui,
    "Teacher Setup 1 of 3 — Your Name",
    "Enter your full name as it should appear on student documents:",
    v => !v ? "Name cannot be blank." : null
  );
  if (!teacherName) return;

  const teacherEmail = _promptWithRetry_(
    ui,
    "Teacher Setup 2 of 3 — Your Email",
    "Enter your email address for submission notifications:",
    v => (!v || v.indexOf("@") === -1)
      ? "That doesn't look like a valid email address — it needs an \"@\"."
      : null
  );
  if (!teacherEmail) return;

  const subject = _promptWithRetry_(
    ui,
    "Teacher Setup 3 of 3 — Your Subject",
    "Enter your subject area (e.g. Science, English, Mathematics):",
    v => !v ? "Subject cannot be blank." : null
  );
  if (!subject) return;

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

    // FIXED (finding #3, Contextual Gates Pattern 1 — verify after create):
    // same standard as admin setup — the step is done when the read-back
    // confirms it, not when createTeacherAssets_() returns.
    const missingAssets = _verifyTeacherAssets_(result, teacherEmail);
    if (missingAssets.length > 0) {
      ui.alert(
        "✗ Teacher Setup Incomplete",
        "Some assets could not be verified right after creation:\n\n" +
        missingAssets.map(m => "  • " + m).join("\n") + "\n\n" +
        "This is usually a temporary Drive/Sheets permission or quota " +
        "issue. Reopen the ⚙️ Assignment System menu and run setup again — " +
        "assets already created above will be reused, not duplicated.",
        ui.ButtonSet.OK
      );
      return; // Gate: do not persist properties or declare success
    }

    persistTeacherProperties_(result, teacherName, teacherEmail, subject);

    writeTeacherSummaryPage_(result, teacherName, teacherEmail, subject);

    props.setProperty("SETUP_COMPLETE", "true");

    ui.alert(
      "🎉 Setup Complete!",
      "Your workspace is ready and every asset has been verified.\n\n" +
      "One final step is needed to activate your rubric upload trigger.\n" +
      "Instructions have been added to the end of this document.\n\n" +
      "Use the ⚙️ Assignment System menu to create assignments,\n" +
      "register students, and open your dashboard.",
      ui.ButtonSet.OK
    );

  } catch (err) {
    // FIXED (finding #3, gate 02 — name the cause, give a path forward):
    // createTeacherAssets_()'s steps are now checkpointed (resumeOrCreate_,
    // 20_SetupCheckpoint.js), so re-running genuinely resumes rather than
    // duplicating — the error message can say so honestly instead of just
    // pointing at "contact your administrator."
    ui.alert(
      "❌ Teacher Setup Failed",
      "Setup stopped while creating your workspace: " + err.message + "\n\n" +
      "Nothing already created above was lost — those steps are " +
      "checkpointed. Reopen the ⚙️ Assignment System menu and run setup " +
      "again to resume from here. If it keeps failing at the same step, " +
      "contact your system administrator.",
      ui.ButtonSet.OK
    );
    Logger.log("[TEACHER SETUP] Error: " + err.message + "\n" + err.stack);
  }
}

// ---------------------------------------------------------------------------
// createTeacherAssets_ — clones templates, creates forms, sets triggers
//
// FIXED (Say/Do Ledger cas-ccps finding #2, decided Option A): every asset
// creation below is now wrapped in resumeOrCreate_() (20_SetupCheckpoint.js)
// — the same idempotency pattern createAdminAssets_() already uses. A retry
// after a mid-run failure resumes from the last completed step instead of
// creating a second folder/sheet/form set for the same teacher. This also
// finally makes 20_SetupCheckpoint.js's documented CHECKPOINT_TEACHER_*
// keys real — they were declared in that file's header comment with
// nothing ever writing or reading them until now.
//
// FIXED (found while restructuring this function for the above):
// `queueTabName` was referenced near the top (in the rubric sheet's
// _CONFIG write, below) but declared with `const` much further down in the
// original version of this function — a genuine "Cannot access
// 'queueTabName' before initialization" ReferenceError on every single
// run, not a hypothetical (confirmed in isolation: a `const` referenced
// before its own declaration line throws, even inside the same function
// scope). Declared once, up front, now.
// ---------------------------------------------------------------------------
function createTeacherAssets_(teacherName, teacherEmail, subject, props) {
  const safeName          = teacherName.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  const adminRootId       = props.getProperty("ADMIN_ROOT_FOLDER_ID");
  const centralSsId       = props.getProperty("CENTRAL_LEDGER_SS_ID");
  const adminSsId         = props.getProperty("ADMIN_SS_ID");
  const masterRubricSsId  = props.getProperty("MASTER_RUBRIC_RESPONSE_SS_ID");
  const masterMatrixSsId  = props.getProperty("MASTER_TEACHER_MATRIX_SS_ID");
  const queueTabName      = safeName + "_RubricQueue";

  // ── TEACHER FOLDER ─────────────────────────────────────────────────────────
  // createFolder_() is already name-idempotent on its own (reuses an
  // existing folder instead of making a sibling duplicate), but
  // checkpointing the ID too makes CHECKPOINT_TEACHER_FOLDER a real signal
  // instead of an unused documented constant, and means a resume doesn't
  // need to re-derive the folder by name at all.
  const teacherFolderId = resumeOrCreate_("TEACHER_FOLDER", () => {
    const subjectFolder = createFolder_(DriveApp.getFolderById(adminRootId), subject);
    return createFolder_(subjectFolder, safeName).getId();
  });
  const teacherFolder = DriveApp.getFolderById(teacherFolderId);

  // ── CLONE MASTER RUBRIC RESPONSE SHEET ────────────────────────────────────
  const rubricSsId = resumeOrCreate_("TEACHER_RUBRIC", () =>
    DriveApp.getFileById(masterRubricSsId)
      .makeCopy(safeName + " — Rubric Responses", teacherFolder).getId()
  );

  // ── CLONE MASTER TEACHER MATRIX SHEET ─────────────────────────────────────
  const matrixSsId = resumeOrCreate_("TEACHER_MATRIX", () =>
    DriveApp.getFileById(masterMatrixSsId)
      .makeCopy(safeName + " — Teacher Matrix", teacherFolder).getId()
  );

  // ── WRITE _CONFIG TABS TO CLONED SHEETS ───────────────────────────────────
  // Script Properties don't clone. We write a _CONFIG tab to each cloned sheet
  // immediately so Scripts 05 and 08 can read config via getSheetConfig_()
  // using SpreadsheetApp.getActiveSpreadsheet() — no IDs needed at runtime.
  // writeConfigTab_() deletes-then-recreates the _CONFIG tab every call, so
  // it's already idempotent — safe to run unconditionally on a resume too.
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
  // Already name-idempotent via the existence check — no checkpoint needed.
  const adminSs = SpreadsheetApp.openById(adminSsId);
  if (!adminSs.getSheetByName(queueTabName)) {
    const qt = adminSs.insertSheet(queueTabName);
    setHeaders_(qt, RBQ_HEADERS.slice()); // 00_SharedConfig.js
  }

  // ── REGISTER IN MATRIXREGISTRY ─────────────────────────────────────────────
  // Checkpointed — appendRow() has no idempotency of its own, so a retry
  // without this would add a second identical registry row every time.
  resumeOrCreate_("TEACHER_REGISTRY", () => {
    try {
      const centralSs = SpreadsheetApp.openById(centralSsId);
      const registry  = centralSs.getSheetByName(TABS.matrixRegistry);
      if (registry) registry.appendRow([safeName, teacherEmail, matrixSsId, new Date()]);
    } catch (e) {
      Logger.log("[TEACHER SETUP] MatrixRegistry warning: " + e.message);
    }
    return true;
  });

  // ── FORMS (Rubric Upload, Confirmation Review, Student Intake) ────────────
  // Bundled under one checkpoint, matching 20_SetupCheckpoint.js's single
  // documented CHECKPOINT_TEACHER_FORMS key — the three forms aren't
  // independently resumable: the Confirmation form's entry IDs get baked
  // into the Matrix Sheet's _CONFIG right after this block, and the
  // ConfirmationResponses tab is inserted only once as part of this same
  // step — re-running just one form on its own would try to re-insert a
  // sheet that already exists and throw.
  const formsResult = resumeOrCreate_("TEACHER_FORMS", () => {
    // ── RUBRIC UPLOAD FORM ───────────────────────────────────────────────────
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
    // review each milestone's text, then tag it). addCompetencyDropdownItems_()
    // is at the end of this file.
    addCompetencyDropdownItems_(confirmForm, centralSsId);
    // -- M6 -- one more dropdown, placed after the four M5 competency
    // dropdowns so the reading order is: review milestones, tag
    // competencies, then tag the lesson unit. addLessonUnitDropdownItem_()
    // is at the end of this file.
    addLessonUnitDropdownItem_(confirmForm, centralSsId);

    const matrixSs         = SpreadsheetApp.openById(matrixSsId);
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

    return {
      rubricFormId:    rubricForm.getId(),
      rubricFormUrl:   rubricForm.getPublishedUrl(),
      confirmFormId:   confirmForm.getId(),
      confirmFormUrl:  confirmForm.getPublishedUrl(),
      intakeFormId:    intakeForm.getId(),
      intakeFormUrl:   intakeForm.getPublishedUrl(),
      // ── EXTRACT CONFIRMATION FORM ENTRY IDS ─────────────────────────────────
      confirmEntryIds: extractFormEntryIds_(confirmForm)
    };
  });

  // ── UPDATE MATRIX _CONFIG WITH CONFIRM FORM DETAILS ───────────────────────
  // Safe to run every time (writeConfigTab_ is idempotent) — keeps this in
  // sync even on a resumed run where TEACHER_MATRIX predates TEACHER_FORMS.
  writeConfigTab_(matrixSsId, {
    ADMIN_SS_ID:               adminSsId,
    CENTRAL_LEDGER_SS_ID:      centralSsId,
    TEACHER_NAME:              teacherName,
    TEACHER_EMAIL:             teacherEmail,
    ADMIN_NOTIFY_EMAIL:        props.getProperty("ADMIN_NOTIFY_EMAIL") || "",
    CONFIRM_REVIEW_FORM_ID:    formsResult.confirmFormId,
    ...formsResult.confirmEntryIds         // CONFIRM_ENTRY_* keys
  });

  return {
    teacherFolderId,
    teacherFolderUrl:  teacherFolder.getUrl(),
    rubricSsId,
    rubricSsUrl:       SpreadsheetApp.openById(rubricSsId).getUrl(),
    matrixSsId,
    matrixSsUrl:       SpreadsheetApp.openById(matrixSsId).getUrl(),
    queueTabName,
    rubricFormId:      formsResult.rubricFormId,
    rubricFormUrl:     formsResult.rubricFormUrl,
    confirmFormId:     formsResult.confirmFormId,
    confirmFormUrl:    formsResult.confirmFormUrl,
    intakeFormId:      formsResult.intakeFormId,
    intakeFormUrl:     formsResult.intakeFormUrl,
    confirmEntryIds:   formsResult.confirmEntryIds
  };
}

// ---------------------------------------------------------------------------
// _verifyTeacherAssets_ — Contextual Gates Pattern 1 (verify after create).
// NEW (Say/Do Ledger cas-ccps finding #3). Same completion-condition
// standard as _verifyAdminAssets_() above: createTeacherAssets_() not
// throwing doesn't guarantee every folder/sheet/form/registry-row it
// claims to have created is actually there.
// ---------------------------------------------------------------------------
function _verifyTeacherAssets_(result, teacherEmail) {
  const missing = [];

  try { DriveApp.getFolderById(result.teacherFolderId); }
  catch (e) { missing.push("Teacher Folder (" + result.teacherFolderUrl + ")"); }

  try {
    const rubricSs = SpreadsheetApp.openById(result.rubricSsId);
    if (!rubricSs.getSheetByName(TABS.config)) missing.push("Rubric Response Sheet's _CONFIG tab");
  } catch (e) { missing.push("Rubric Response Sheet (" + result.rubricSsUrl + ")"); }

  try {
    const matrixSs = SpreadsheetApp.openById(result.matrixSsId);
    ["_CONFIG", "ConfirmationResponses"].forEach(t => {
      if (!matrixSs.getSheetByName(t)) missing.push("Teacher Matrix Sheet tab \"" + t + "\"");
    });
  } catch (e) { missing.push("Teacher Matrix Sheet (" + result.matrixSsUrl + ")"); }

  [
    ["Rubric Upload Form",        result.rubricFormId,  result.rubricFormUrl],
    ["Confirmation Review Form",  result.confirmFormId, result.confirmFormUrl],
    ["Student Registration Form", result.intakeFormId,  result.intakeFormUrl]
  ].forEach(([label, id, url]) => {
    try { FormApp.openById(id); }
    catch (e) { missing.push(label + " (" + url + ")"); }
  });

  try {
    const adminSsId = PropertiesService.getScriptProperties().getProperty("ADMIN_SS_ID");
    const adminSs   = SpreadsheetApp.openById(adminSsId);
    if (!adminSs.getSheetByName(result.queueTabName)) {
      missing.push("Rubric Queue tab on the Central Ledger (\"" + result.queueTabName + "\")");
    }
    const registry   = adminSs.getSheetByName(TABS.matrixRegistry);
    const registered = registry && registry.getDataRange().getValues()
      .some(row => String(row[1] || "").toLowerCase() === teacherEmail.toLowerCase());
    if (!registered) missing.push("MatrixRegistry row for " + teacherEmail);
  } catch (e) {
    missing.push("Central Ledger MatrixRegistry check (" + e.message + ")");
  }

  return missing;
}

// ---------------------------------------------------------------------------
// forceRebuildTeacherWorkspace — NEW (Say/Do Ledger cas-ccps finding #2).
// An explicit, intentional reset — distinct from "Re-Run Setup (Advanced)",
// which now safely *resumes* from checkpoints (see createTeacherAssets_())
// rather than recreating anything. This is the one path that actually
// clears TEACHER_* checkpoints first, so a genuine "start over" stays
// possible without being what a normal re-run does by default.
// ---------------------------------------------------------------------------
function forceRebuildTeacherWorkspace() {
  const ui = DocumentApp.getUi();
  const confirm = ui.alert(
    "⚠ Force Rebuild Teacher Workspace",
    "This creates a brand-new folder, sheets, and forms for your workspace " +
    "— it does NOT delete or reuse your current ones. Any assignments, " +
    "registered students, or rubrics tied to the old workspace stay right " +
    "where they are; you would need to manually migrate anything you want " +
    "to keep.\n\n" +
    "Only do this if your workspace is broken in a way a normal \"Re-Run " +
    "Setup\" resume can't fix.\n\n" +
    "Continue?",
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  clearCheckpoints_("TEACHER");
  PropertiesService.getScriptProperties().deleteProperty("SETUP_COMPLETE");
  runTeacherSetup_();
}

// ---------------------------------------------------------------------------
// extractFormEntryIds_
// ---------------------------------------------------------------------------
// Includes the M5 competency and M6 Lesson Unit entries (the addenda that
// once carried them were folded into this file 2026-11-20).
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
// Not written since 2026-11-01 (dead-ends audit, nothing read them):
// TEACHER_MATRIX_SS_URL, RUBRIC_RESPONSE_SS_ID/_URL, RUBRIC_FORM_ID,
// INTAKE_FORM_ID. An install that has them keeps them; nothing uses them.
function persistTeacherProperties_(result, teacherName, teacherEmail, subject) {
  PropertiesService.getScriptProperties().setProperties({
    TEACHER_NAME:             teacherName,
    TEACHER_EMAIL:            teacherEmail,
    TEACHER_SUBJECT:          subject,
    TEACHER_FOLDER_ID:        result.teacherFolderId,
    TEACHER_FOLDER_URL:       result.teacherFolderUrl,
    TEACHER_MATRIX_SS_ID:     result.matrixSsId,
    RUBRIC_QUEUE_TAB:         result.queueTabName,
    RUBRIC_FORM_URL:          result.rubricFormUrl,
    CONFIRM_REVIEW_FORM_ID:   result.confirmFormId,
    CONFIRM_REVIEW_FORM_URL:  result.confirmFormUrl,
    INTAKE_FORM_URL:          result.intakeFormUrl,
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

// The Central Ledger's link. Setup writes it (since 2026-11-01); a manual
// set up before then has only the ID, so the link is built from that.
function openAdminHealthCheck() {
  const p = PropertiesService.getScriptProperties();
  showLink_("Open the Central Ledger Spreadsheet to access Admin Controls:",
    p.getProperty("CENTRAL_LEDGER_SS_URL") || centralLedgerUrl_(p.getProperty("CENTRAL_LEDGER_SS_ID")));
}

function centralLedgerUrl_(ssId) {
  const id = String(ssId || "").trim();
  return id ? "https://docs.google.com/spreadsheets/d/" + id + "/edit" : "";
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

// =============================================================================
// Confirmation Form dropdowns (competency, M5; lesson unit, M6). Folded in
// 2026-11-20 from 16_UnifiedManualSetup_M5_ADDENDUM_v2.js and
// 16_UnifiedManualSetup_M6_ADDENDUM.js (both deleted), whose paste instructions had all
// been applied (meta/AUDIT_STRUCTURE_2026-11-20.md, 2.1). The code is unchanged.
// =============================================================================

// ---------------------------------------------------------------------------
// -- M5 -- addCompetencyDropdownItems_
// ---------------------------------------------------------------------------
function addCompetencyDropdownItems_(confirmForm, centralSsId) {
  const options = buildCompetencyDropdownOptions_(centralSsId);

  // FIXED (confirmed live during a real from-scratch deployment):
  // FormApp's ListItem.setChoiceValues() throws "Array is empty: values"
  // outright when given an empty array -- it does NOT silently create an
  // empty dropdown the way the warning below always assumed. That made
  // this a hard failure at teacher-setup time whenever CompetencyRegistry
  // hadn't been imported yet, not the soft "blocks future submissions"
  // degradation the comment describes. A single placeholder choice keeps
  // setChoiceValues() valid while preserving that same intent: it isn't a
  // real competency ID, so a submission using it still needs the import
  // run and setup re-run (Re-Run Setup is checkpoint-safe) before the
  // field has real choices.
  const placeholderOptions = ["(no competencies imported yet -- run Script 22b)"];
  if (options.length === 0) {
    Logger.log("[M5] WARNING -- CompetencyRegistry returned zero options. " +
      "Competency dropdowns will be created with a placeholder choice only. " +
      "Run importCompetencyRegistry() (Script 22b), then Re-Run Setup, " +
      "before these four fields have real choices to select.");
  }

  [
    { title: "Competency — Milestone 1" },
    { title: "Competency — Milestone 2" },
    { title: "Competency — Milestone 3" },
    { title: "Competency — Milestone 4" },
  ].forEach(f => {
    confirmForm.addListItem()
      .setTitle(f.title)
      .setChoiceValues(options.length > 0 ? options : placeholderOptions)
      .setRequired(true)
      .setHelpText(
        "Select the Student Competency Record (SCR) competency this " +
        "milestone evidences. Every milestone must map to exactly one " +
        "competency -- pick the closest match if a milestone touches " +
        "more than one."
      );
  });
}

// ---------------------------------------------------------------------------
// -- M5 -- buildCompetencyDropdownOptions_
// Unchanged from v1.
// ---------------------------------------------------------------------------
function buildCompetencyDropdownOptions_(centralSsId) {
  const ss = SpreadsheetApp.openById(centralSsId);
  const sheet = ss.getSheetByName(TABS.competencyRegistry);
  if (!sheet) {
    Logger.log("[M5] CompetencyRegistry tab not found on Central Ledger -- " +
      "cannot build dropdown options.");
    return [];
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iId = headers.indexOf("competency_id");
  const iText = headers.indexOf("competency_text");
  const iSubject = headers.indexOf("subject");
  const iStrand = headers.indexOf("strand");
  const iActive = headers.indexOf("active");

  if (iId === -1 || iText === -1) {
    Logger.log("[M5] CompetencyRegistry missing required columns " +
      "(competency_id, competency_text).");
    return [];
  }

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const active = iActive === -1 ? true
      : String(row[iActive]).trim().toUpperCase() !== "FALSE";
    if (!active) continue;

    const id = String(row[iId]).trim();
    if (!id) continue;

    const text = String(row[iText]).trim();
    const subject = iSubject !== -1 ? String(row[iSubject]).trim() : "";
    const strand = iStrand !== -1 ? String(row[iStrand]).trim() : "";

    const dashIdx = id.lastIndexOf("-");
    const taskNum = dashIdx !== -1
      ? parseInt(id.substring(dashIdx + 1), 10) || 9999
      : 9999;
    const courseCode = dashIdx !== -1 ? id.substring(0, dashIdx) : id;

    rows.push({ id, text, subject, strand, courseCode, taskNum });
  }

  rows.sort((a, b) => {
    if (a.courseCode !== b.courseCode) return a.courseCode.localeCompare(b.courseCode);
    if (a.strand !== b.strand) return a.strand.localeCompare(b.strand);
    return a.taskNum - b.taskNum;
  });

  return rows.map(r => {
    const label = r.text.length > 90 ? r.text.slice(0, 87) + "..." : r.text;
    return r.id + " — " + label;
  });
}

// ---------------------------------------------------------------------------
// -- M5 -- extractFormEntryIds_ -- EXTENDED. Unchanged from v1.
//
// APPLIED — this replacement has now actually been merged into
// 16_UnifiedManualSetup.js (plus the M6 addendum's one-line Lesson Unit
// extension on top). This block is kept as a comment for the historical
// record only; it is NOT live code — as an uncommented top-level function
// it collided with the real, merged version, since both files share this
// project's global scope (caught by tools/gas-lint/check.js).
//
// function extractFormEntryIds_(form) {
//   const titleToKey = {
//     "Draft ID": "CONFIRM_ENTRY_DRAFT_ID",
//     "Assignment Name": "CONFIRM_ENTRY_UNIT_NAME",
//     "AI Coach Persona": "CONFIRM_ENTRY_PERSONA",
//     "Milestone 1": "CONFIRM_ENTRY_MILESTONE_1",
//     "Milestone 2": "CONFIRM_ENTRY_MILESTONE_2",
//     "Milestone 3": "CONFIRM_ENTRY_MILESTONE_3",
//     "Milestone 4": "CONFIRM_ENTRY_MILESTONE_4",
//     "Passing Standard": "CONFIRM_ENTRY_DOD",
//     // -- M5 --
//     "Competency — Milestone 1": "CONFIRM_ENTRY_COMP_1",
//     "Competency — Milestone 2": "CONFIRM_ENTRY_COMP_2",
//     "Competency — Milestone 3": "CONFIRM_ENTRY_COMP_3",
//     "Competency — Milestone 4": "CONFIRM_ENTRY_COMP_4",
//   };
//
//   const map = {};
//   for (const item of form.getItems()) {
//     const key = titleToKey[item.getTitle()];
//     if (!key) continue;
//     try {
//       const type = item.getType();
//       const id = type === FormApp.ItemType.TEXT
//         ? item.asTextItem().getId()
//         : type === FormApp.ItemType.PARAGRAPH_TEXT
//         ? item.asParagraphTextItem().getId()
//         // -- M5 -- new branch for the competency dropdowns
//         : type === FormApp.ItemType.LIST
//         ? item.asListItem().getId()
//         : null;
//       if (id) map[key] = "entry." + id;
//     } catch (e) { /* skip */ }
//   }
//   return map;
// }
// ---------------------------------------------------------------------------

// =============================================================================
// REMAINING OPEN ITEM -- unchanged from v1
// =============================================================================
//
// Script 08's getConfig_08() reads these as cfg.confirmEntryComp1..4
// (camelCase, per that file's existing naming convention -- e.g.
// CONFIRM_ENTRY_MILESTONE_1 becomes cfg.confirmEntryM1). The exact
// property-to-cfg-field transform lives inside getSheetConfig_()
// (19_ClonedSheetConfig.js -- not yet seen). The CONFIRM_ENTRY_COMP_1..4
// names above follow the existing pattern exactly, so whatever transform
// applies to the other eight should apply identically to these four --
// this is the one remaining unverified link in the chain.
//
// =============================================================================

// ---------------------------------------------------------------------------
// -- M6 -- addLessonUnitDropdownItem_
// ---------------------------------------------------------------------------
function addLessonUnitDropdownItem_(confirmForm, centralSsId) {
  const options = buildLessonUnitDropdownOptions_(centralSsId);

  // FIXED (same bug as addCompetencyDropdownItems_() above, confirmed live
  // during a real from-scratch deployment): setChoiceValues() throws
  // "Array is empty: values" on an empty array instead of silently
  // creating an empty dropdown -- a hard setup-time failure, not the soft
  // "blocks future submissions" degradation the warning always assumed.
  // Same placeholder-choice fix.
  const placeholderOptions = ["(no pacing guide imported yet -- run Script 31)"];
  if (options.length === 0) {
    Logger.log("[M6] WARNING — PacingGuide returned zero options. The " +
      "Lesson Unit dropdown will be created with a placeholder choice only. " +
      "Run importPacingGuide() (Script 31), then Re-Run Setup, before this " +
      "field has real choices to select.");
  }

  confirmForm.addListItem()
    .setTitle("Lesson Unit")
    .setChoiceValues(options.length > 0 ? options : placeholderOptions)
    .setRequired(true)
    .setHelpText(
      "Select the pacing-guide lesson unit this assignment belongs to. " +
      "Never guessed by the system — always your call."
    );
}

// ---------------------------------------------------------------------------
// -- M6 -- buildLessonUnitDropdownOptions_
// Mirrors buildCompetencyDropdownOptions_() (M5 addendum) exactly, reading
// the "PacingGuide" tab instead of "CompetencyRegistry". See
// 00_SharedConfig.js for that tab's schema (PG_HEADERS) and 31 for the
// importPacingGuide() function that populates it.
// ---------------------------------------------------------------------------
function buildLessonUnitDropdownOptions_(centralSsId) {
  const ss = SpreadsheetApp.openById(centralSsId);
  const sheet = ss.getSheetByName(TABS.pacingGuide);
  if (!sheet) {
    Logger.log("[M6] PacingGuide tab not found on Central Ledger — cannot " +
      "build dropdown options. Run importPacingGuide() (Script 31) first.");
    return [];
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iId = headers.indexOf("lesson_unit_id");
  const iName = headers.indexOf("lesson_unit_name");
  const iStage = headers.indexOf("stage");

  if (iId === -1 || iName === -1) {
    Logger.log("[M6] PacingGuide missing required columns " +
      "(lesson_unit_id, lesson_unit_name).");
    return [];
  }

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const id = String(row[iId]).trim();
    if (!id) continue;

    const name = String(row[iName]).trim();
    const stage = iStage !== -1 ? row[iStage] : "";

    rows.push({ id, name, stage: Number(stage) || 0, sheetOrder: i });
  }

  // PacingGuide is written in stage/unit order by importPacingGuide()
  // already — sort defensively by stage then original sheet order rather
  // than assuming that ordering is preserved forever.
  rows.sort((a, b) => a.stage - b.stage || a.sheetOrder - b.sheetOrder);

  return rows.map(r => r.id + " — " + r.name);
}

// ---------------------------------------------------------------------------
// -- M6 -- extractFormEntryIds_ titleToKey extension.
//
// APPLIED — this one line, plus the M5 addendum's full replacement, are
// both now merged directly into 16_UnifiedManualSetup.js's
// extractFormEntryIds_(). Kept here as historical record only.
// ---------------------------------------------------------------------------

/*
  const titleToKey = {
    ...
    "Competency — Milestone 4": "CONFIRM_ENTRY_COMP_4",
    // -- M6 --
    "Lesson Unit": "CONFIRM_ENTRY_LESSON_UNIT",
  };
*/
