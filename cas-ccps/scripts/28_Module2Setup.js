// =============================================================================
// FILE: 28_Module2Setup.js
// BOUND TO: Assignment System Manual Google Doc (same project as Script 16)
// PURPOSE: Module 2 setup wizard — two phases, contextual gates throughout.
//
// DESIGN PRINCIPLE — CONTEXTUAL GATES:
//   Every action verifies its own output before declaring success.
//   Every failure surfaces at the point of action with a path forward.
//   No instruction is deferred to a document the teacher won't read.
//   The teacher never types something the system already knows.
//   A "complete" state means verified complete, not "script ran without errors."
//
// PHASE A — LIGHTWEIGHT (runs in ~30 seconds):
//   Creates M2 tabs · imports competency registry · installs backfill trigger
//   Verifies each step before proceeding to the next.
//   Ends with exact redeploy instructions in the completion alert — not the doc.
//
// PHASE B — WARM-UPS (offered from menu when timing is right):
//   Creates warm-up tabs · collects schedule via single structured prompt
//   Installs nightly triggers · verifies tab writes · surfaces Studio Flow
//   configuration inline with exact settings, not a reference to another doc.
//
// DEFERRED STATE IS NEVER SILENT:
//   If a step cannot complete, the menu item reflects it.
//   The dashboard shows a banner until the gap is resolved.
//   Re-entry is always in-place — the wizard doesn't exit on deferral.
//
// INTEGRATION WITH SCRIPT 16:
//   Add to onOpen() after SETUP_COMPLETE block (paste verbatim):
//
//     const m2PhaseA = props.getProperty("M2_SETUP_PHASE_A_COMPLETE");
//     const m2Full   = props.getProperty("M2_SETUP_COMPLETE");
//     const m2Ready  = props.getProperty("M2_REGISTRY_IMPORTED");
//     menu.addSeparator();
//     if (!m2PhaseA) {
//       menu.addItem("📚 Set Up Lesson Intelligence (Module 2)", "runModule2Setup");
//     } else if (!m2Ready) {
//       menu.addItem("⚠ Module 2 — Import Competencies Required", "runModule2ImportOnly");
//     } else if (!m2Full) {
//       menu.addItem("📚 Module 2 Status", "showModule2Status")
//           .addItem("🌅 Set Up Warm-Up Generation (Phase B)", "runModule2WarmUps");
//     } else {
//       menu.addItem("📚 Open Lesson Dashboard", "openLessonDashboard")
//           .addItem("📊 Module 2 Status", "showModule2Status");
//     }
//
//   Add at end of runTeacherSetup_() success block (paste verbatim):
//
//     const offerM2 = ui.alert(
//       "📚 Set Up Lesson Intelligence?",
//       "Module 2 automates competency alignment documentation.\n\n" +
//       "Takes about 30 seconds. Can be done now or later from the menu.\n\n" +
//       "Click OK to set it up now.",
//       ui.ButtonSet.OK_CANCEL
//     );
//     if (offerM2 === ui.Button.OK) runModule2Setup();
//
// =============================================================================

// ---------------------------------------------------------------------------
// runModule2Setup — public entry point, Phase A
// ---------------------------------------------------------------------------
function runModule2Setup() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // ── Gate: M1 must be complete ─────────────────────────────────────────────
  if (!props.getProperty("SETUP_COMPLETE")) {
    ui.alert(
      "⚠ Complete Module 1 Setup First",
      "Your Module 1 teacher workspace must be configured before " +
      "setting up Lesson Intelligence.\n\n" +
      "Run:  Assignment System → Run Teacher Setup\n\n" +
      "Then return here.",
      ui.ButtonSet.OK
    );
    return;
  }

  // ── Gate: Central Ledger must be reachable ────────────────────────────────
  const ledgerSsId = props.getProperty("CENTRAL_LEDGER_SS_ID");
  if (!ledgerSsId) {
    ui.alert(
      "⚠ Configuration Error",
      "CENTRAL_LEDGER_SS_ID is missing from Script Properties.\n\n" +
      "This value is set during Module 1 admin setup.\n" +
      "Contact your system administrator.",
      ui.ButtonSet.OK
    );
    return;
  }

  let ss;
  try {
    ss = SpreadsheetApp.openById(ledgerSsId);
  } catch (e) {
    ui.alert(
      "⚠ Cannot Reach Central Ledger",
      "The Central Ledger spreadsheet could not be opened.\n\n" +
      "ID: " + ledgerSsId + "\n\n" +
      "Verify the spreadsheet exists and you have access, then try again.",
      ui.ButtonSet.OK
    );
    return;
  }

  // ── Resume check: Phase A already complete? ───────────────────────────────
  if (props.getProperty("M2_SETUP_PHASE_A_COMPLETE")) {
    const resume = ui.alert(
      "📚 Module 2 Phase A Already Complete",
      "Lesson Intelligence setup has already been run.\n\n" +
      "Re-running is safe — all steps are idempotent.\n\n" +
      "Click OK to re-run setup (useful after adding courses or if " +
      "the competency import was incomplete).\n" +
      "Click Cancel to exit.",
      ui.ButtonSet.OK_CANCEL
    );
    if (resume !== ui.Button.OK) return;
  }

  // ── Welcome ───────────────────────────────────────────────────────────────
  const welcome = ui.alert(
    "📚 Lesson Intelligence Setup — Phase A",
    "This wizard configures competency alignment tracking.\n\n" +
    "What happens:\n" +
    "  1. Four tabs created on your Central Ledger\n" +
    "  2. Competency framework imported from CSV\n" +
    "  3. Backfill trigger installed\n" +
    "  4. Teacher Dashboard updated with 'New Lesson' button\n\n" +
    "Each step verifies itself before moving on.\n\n" +
    "Takes about 30 seconds. Click OK to begin.",
    ui.ButtonSet.OK_CANCEL
  );
  if (welcome !== ui.Button.OK) return;

  try {
    _runPhaseA_(ui, props, ss);
  } catch (err) {
    ui.alert(
      "✗ Setup Error",
      "An unexpected error occurred:\n\n" + err.message + "\n\n" +
      "Completed steps are preserved. Re-run from the menu to continue.\n\n" +
      "If the error persists, check the Apps Script execution log.",
      ui.ButtonSet.OK
    );
    Logger.log("[S28] Phase A error: " + err.message + "\n" + err.stack);
  }
}

// =============================================================================
// PHASE A — STEP BY STEP WITH INLINE VERIFICATION
// =============================================================================

function _runPhaseA_(ui, props, ss) {
  const teacherEmail = props.getProperty("TEACHER_EMAIL") || "";
  const teacherName  = props.getProperty("TEACHER_NAME")  || "";

  // ── STEP 1: Create M2 tabs ────────────────────────────────────────────────
  _gateAlert_(ui, "Step 1 of 4 — Creating Tabs",
    "Creating: LessonContext · CompetencyRegistry · AlignmentLog · ReportRegistry");

  _createM2LightweightTabs_(ss);

  // Verify all four tabs exist
  const missingTabs = ["LessonContext","CompetencyRegistry","AlignmentLog","ReportRegistry"]
    .filter(t => !ss.getSheetByName(t));
  if (missingTabs.length > 0) {
    ui.alert(
      "✗ Tab Creation Failed",
      "The following tabs could not be created:\n\n" +
      missingTabs.map(t => "  • " + t).join("\n") + "\n\n" +
      "This usually means the spreadsheet is in read-only mode or " +
      "you do not have edit access.\n\n" +
      "Verify you are an editor on:\n" + ss.getUrl() + "\n\n" +
      "Then re-run setup.",
      ui.ButtonSet.OK
    );
    return;
  }

  // ── STEP 2: Resolve course names ──────────────────────────────────────────
  // Read course names from CompetencyRegistry if already populated.
  // If not, ask the teacher once — compact format, validated inline.
  _gateAlert_(ui, "Step 2 of 4 — Identifying Your Courses", "");

  let courseNames = _resolveCourseNames_(ui, props, ss);
  if (!courseNames) return; // teacher cancelled

  // ── STEP 3: Import competency registry ───────────────────────────────────
  _gateAlert_(ui, "Step 3 of 4 — Importing Competency Framework",
    "Searching for CompetencyRegistry.csv in your teacher folder and Drive...");

  const importResult = _runRegistryImportWithGate_(ui, props, ss, courseNames);
  // importResult: { success, rowCount, deferred, message }
  // If deferred, menu will reflect this — setup continues but marks incomplete

  // ── STEP 4: Install backfill trigger ─────────────────────────────────────
  _gateAlert_(ui, "Step 4 of 4 — Installing Safety Trigger", "");

  _installTriggerIfMissing_("runAlignmentLogBackfill_", "everyMinutes", 5);

  // Verify trigger installed
  const backfillInstalled = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === "runAlignmentLogBackfill_");
  if (!backfillInstalled) {
    ui.alert(
      "⚠ Trigger Installation Warning",
      "The alignment backfill trigger could not be installed.\n\n" +
      "This trigger provides a safety net if the alignment logger " +
      "fails silently. Setup can continue without it but you should " +
      "install it manually:\n\n" +
      "  Script Editor → Triggers → + Add Trigger\n" +
      "  Function: runAlignmentLogBackfill_\n" +
      "  Event: Time-driven · Every 5 minutes",
      ui.ButtonSet.OK
    );
    // Non-fatal — continue
  }

  // ── Write Script Properties ───────────────────────────────────────────────
  props.setProperties({
    "M2_ENABLED":               "true",
    "M2_COURSES":               courseNames.join(","),
    "M2_SETUP_PHASE_A_COMPLETE":"true",
    "M2_REGISTRY_IMPORTED":     importResult.success ? "true" : "false"
  });

  // ── Write summary to doc ──────────────────────────────────────────────────
  _writePhaseASummaryDoc_(teacherName, teacherEmail, courseNames, importResult, props);

  // ── Completion alert — instructions inline, not deferred ─────────────────
  const dashUrl = props.getProperty("TEACHER_DASHBOARD_URL") || "[Dashboard URL not set]";

  const importLine = importResult.success
    ? "✓ " + importResult.rowCount + " competencies imported."
    : "⚠ Competency import incomplete — use menu item to finish.";

  ui.alert(
    "✅ Phase A Complete",

    // What was done
    "✓ Tabs created: LessonContext · CompetencyRegistry · AlignmentLog · ReportRegistry\n" +
    importLine + "\n" +
    "✓ Backfill trigger installed.\n\n" +

    // ── INLINE REDEPLOY INSTRUCTIONS — not deferred to doc ──────────────
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "ACTION REQUIRED — Redeploy Teacher Dashboard\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "The 'New Lesson' button is ready but needs one redeploy step:\n\n" +
    "  1. Open the Script 07 project (Teacher Dashboard)\n" +
    "  2. Deploy → Manage deployments\n" +
    "  3. Select your deployment → Edit (pencil icon)\n" +
    "  4. Version: New version → Deploy\n\n" +
    "Your dashboard URL stays the same:\n" +
    dashUrl + "\n\n" +

    // ── What happens next ─────────────────────────────────────────────────
    "After redeploying, click 'New Lesson' in the dashboard header to log\n" +
    "your first lesson. Competency alignment is recorded automatically.\n\n" +
    "Phase B (warm-up generation) is available from the menu after your\n" +
    "first term of lesson data has accumulated.",

    ui.ButtonSet.OK
  );
}

// =============================================================================
// COURSE NAME RESOLUTION
// No manual typing if the data is already in the system.
// =============================================================================

function _resolveCourseNames_(ui, props, ss) {
  // ── Try 1: Read from populated CompetencyRegistry tab ────────────────────
  const regSheet = ss.getSheetByName("CompetencyRegistry");
  if (regSheet && regSheet.getLastRow() > 1) {
    const data     = regSheet.getDataRange().getValues();
    const headers  = data[0].map(h => String(h).trim());
    const iSubject = headers.indexOf("subject");
    if (iSubject !== -1) {
      const names = new Set();
      for (let i = 1; i < data.length; i++) {
        const s = String(data[i][iSubject] || "").trim();
        if (s) names.add(s);
      }
      if (names.size > 0) {
        const courseList = [...names].sort();
        const confirm = ui.alert(
          "✓ Courses Found in Registry",
          "Found " + courseList.length + " course(s) already in your " +
          "CompetencyRegistry tab:\n\n" +
          courseList.map(c => "  • " + c).join("\n") + "\n\n" +
          "Click OK to use these, or Cancel to enter different courses.",
          ui.ButtonSet.OK_CANCEL
        );
        if (confirm === ui.Button.OK) {
          props.setProperty("M2_COURSES", courseList.join(","));
          return courseList;
        }
      }
    }
  }

  // ── Try 2: Read from stored M2_COURSES property ───────────────────────────
  const storedCourses = props.getProperty("M2_COURSES");
  if (storedCourses) {
    const courseList = storedCourses.split(",").map(c => c.trim()).filter(Boolean);
    if (courseList.length > 0) {
      const confirm = ui.alert(
        "✓ Courses Found in Configuration",
        "Your courses from a previous setup:\n\n" +
        courseList.map(c => "  • " + c).join("\n") + "\n\n" +
        "Click OK to use these, or Cancel to re-enter.",
        ui.ButtonSet.OK_CANCEL
      );
      if (confirm === ui.Button.OK) return courseList;
    }
  }

  // ── Try 3: Ask teacher — compact single-line format ───────────────────────
  // Retry loop — stays in-place on validation failure
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = ui.prompt(
      "Your Course Names" + (attempt > 0 ? " (try " + (attempt + 1) + " of 3)" : ""),
      "Enter your course name(s), separated by commas.\n\n" +
      "These must match the 'subject' column in your CompetencyRegistry CSV exactly.\n\n" +
      "Example:\n" +
      "Sports Entertainment and Event Management, " +
      "Sports Entertainment and Event Marketing",
      ui.ButtonSet.OK_CANCEL
    );

    if (resp.getSelectedButton() !== ui.Button.OK) return null;

    const raw   = resp.getResponseText().trim();
    const names = raw.split(",").map(c => c.trim()).filter(Boolean);

    if (names.length === 0) {
      ui.alert("At least one course name is required. Please try again.");
      continue;
    }

    // Confirm before accepting
    const confirm = ui.alert(
      "Confirm Course Names",
      names.map(c => "  • " + c).join("\n") + "\n\n" +
      "These must match your CSV exactly. Click OK to confirm.",
      ui.ButtonSet.OK_CANCEL
    );
    if (confirm === ui.Button.OK) return names;
  }

  ui.alert("Course name entry cancelled — setup stopped. Re-run from the menu.");
  return null;
}

// =============================================================================
// REGISTRY IMPORT WITH INLINE GATE
// Runs the import, verifies the result, offers retry in-place.
// =============================================================================

function _runRegistryImportWithGate_(ui, props, ss, courseNames) {
  const teacherFolderUrl = props.getProperty("TEACHER_FOLDER_URL") || "";

  // ── Check if CSV is findable before running importer ─────────────────────
  const csvFile = _findCsvFile_(props);

  if (!csvFile) {
    // File not found — give exact instructions and offer retry in-place
    for (let attempt = 0; attempt < 3; attempt++) {
      const retry = ui.alert(
        "⚠ CompetencyRegistry.csv Not Found" +
        (attempt > 0 ? " (attempt " + (attempt + 1) + " of 3)" : ""),

        "The competency data file could not be found in your Drive.\n\n" +
        "To fix this:\n" +
        "  1. Open your teacher folder:\n" +
        "     " + (teacherFolderUrl || "[TEACHER_FOLDER_URL not set]") + "\n" +
        "  2. Upload the file: CompetencyRegistry.csv\n" +
        "  3. Click OK to try again, or Cancel to skip import now.\n\n" +
        "⚠ If you skip, the 'New Lesson' competency dropdown will be empty\n" +
        "until you run: Assignment System → ⚠ Module 2 — Import Required",

        ui.ButtonSet.OK_CANCEL
      );

      if (retry !== ui.Button.OK) {
        // Teacher explicitly deferred — mark in properties
        props.setProperty("M2_REGISTRY_IMPORTED", "false");
        return { success: false, deferred: true, rowCount: 0,
                 message: "Import deferred — use menu to complete." };
      }

      // Try again
      const retryFile = _findCsvFile_(props);
      if (retryFile) {
        return _executeImportAndVerify_(ui, ss, retryFile, courseNames);
      }
    }

    // Three attempts failed
    props.setProperty("M2_REGISTRY_IMPORTED", "false");
    return { success: false, deferred: true, rowCount: 0,
             message: "File not found after 3 attempts — import deferred." };
  }

  return _executeImportAndVerify_(ui, ss, csvFile, courseNames);
}

function _executeImportAndVerify_(ui, ss, csvFile, courseNames) {
  // Run the importer
  let importedCount = 0;
  // FIXED (external review pass, folded in — Addendum 22 R1; corrected fix,
  // external product review Finding 5): importCompetencyRegistry() is
  // defined in Script 22b, which is bound to the Central Ledger project,
  // not this one (Assignment System Manual / unified-manual). Apps Script
  // doesn't share scope across projects, so a direct call here would throw
  // ReferenceError on every attempt — caught by the gas-lint tool's
  // checkUndefinedFunctionCalls check (commit dd339b4). The real fix is an
  // Apps Script Library dependency (this project's manifest now declares
  // one — see cas-ccps/clasp/manifests/unified-manual.appsscript.json's
  // dependencies.libraries — pointing at central-ledger published as a
  // Library, userSymbol CentralLedger): once that Library dependency is
  // actually wired up with a real scriptId/version (a credentialed,
  // deployment-time step — see cas-ccps/README.md's Finding 5 writeup),
  // CentralLedger.importCompetencyRegistry() resolves for real, no manual
  // Script-Editor step required. The typeof guard below still exists for
  // the same reason it always did: this repo can't verify the live
  // deployment actually has the Library wired up, so it fails gracefully
  // with the manual fallback instructions instead of a bare ReferenceError.
  if (typeof CentralLedger === "undefined" || typeof CentralLedger.importCompetencyRegistry !== "function") {
    ui.alert(
      "⚠ Import Not Available From This Sheet",
      "The competency registry importer (Script 22b) is bound to the " +
      "Central Ledger project, not the Assignment System Manual — and the " +
      "CentralLedger Library dependency isn't wired up yet on this deployment " +
      "(see cas-ccps/README.md's Finding 5 writeup to set that up once).\n\n" +
      "Until then, import manually:\n" +
      "  1. Open the Central Ledger spreadsheet\n" +
      "  2. Run: Assignment System → Import Competency Registry\n\n" +
      "This step can't be completed from this menu — it has to run from " +
      "Central Ledger directly.",
      ui.ButtonSet.OK
    );
    return { success: false, deferred: true, rowCount: 0,
             message: "Import must be run from the Central Ledger project directly." };
  }
  try {
    CentralLedger.importCompetencyRegistry(); // Script 22b, via the CentralLedger Library
  } catch (err) {
    ui.alert(
      "✗ Import Failed",
      "The competency import encountered an error:\n\n" +
      err.message + "\n\n" +
      "Check the execution log for details.\n" +
      "You can retry from: Assignment System → ⚠ Module 2 — Import Required",
      ui.ButtonSet.OK
    );
    return { success: false, deferred: true, rowCount: 0,
             message: "Import error: " + err.message };
  }

  // Verify: count rows in CompetencyRegistry and check course coverage
  const regSheet = ss.getSheetByName("CompetencyRegistry");
  if (!regSheet || regSheet.getLastRow() < 2) {
    ui.alert(
      "✗ Import Verification Failed",
      "The import ran but the CompetencyRegistry tab appears empty.\n\n" +
      "This can happen if the CSV format doesn't match the expected headers.\n\n" +
      "Expected header row:\n" +
      "competency_id, competency_text, subject, grade_band, strand, teacher_email, active\n\n" +
      "Check your CSV and retry from the menu.",
      ui.ButtonSet.OK
    );
    return { success: false, deferred: true, rowCount: 0,
             message: "Import ran but registry appears empty." };
  }

  importedCount = regSheet.getLastRow() - 1; // minus header

  // Verify course names appear in imported data
  const data     = regSheet.getDataRange().getValues();
  const headers  = data[0].map(h => String(h).trim());
  const iSubject = headers.indexOf("subject");
  const foundCourses = new Set();
  if (iSubject !== -1) {
    for (let i = 1; i < data.length; i++) {
      const s = String(data[i][iSubject] || "").trim();
      if (s) foundCourses.add(s);
    }
  }

  const missingCourses = courseNames.filter(c => !foundCourses.has(c));
  if (missingCourses.length > 0) {
    ui.alert(
      "⚠ Course Name Mismatch",
      importedCount + " competencies imported, but these course names\n" +
      "were not found in the imported data:\n\n" +
      missingCourses.map(c => "  • " + c).join("\n") + "\n\n" +
      "Course names in the CSV:\n" +
      [...foundCourses].map(c => "  • " + c).join("\n") + "\n\n" +
      "The 'New Lesson' modal tabs will show only courses whose names\n" +
      "match exactly. If the tab names look wrong after redeploying Script 07,\n" +
      "re-run setup and confirm course names match the CSV 'subject' column.",
      ui.ButtonSet.OK
    );
    // Non-fatal — import succeeded, names just need attention
  }

  return {
    success:   true,
    rowCount:  importedCount,
    deferred:  false,
    message:   importedCount + " competencies imported successfully.",
    courses:   [...foundCourses]
  };
}

// =============================================================================
// PHASE B — WARM-UP SETUP
// =============================================================================

// ---------------------------------------------------------------------------
// runModule2WarmUps — public entry point, Phase B
// Offered from menu. Not auto-chained from Phase A.
// ---------------------------------------------------------------------------
function runModule2WarmUps() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // ── Gate: Phase A must be complete ────────────────────────────────────────
  if (!props.getProperty("M2_SETUP_PHASE_A_COMPLETE")) {
    ui.alert(
      "⚠ Complete Phase A First",
      "Set up Lesson Intelligence (Phase A) before configuring warm-ups.\n\n" +
      "Run: Assignment System → 📚 Set Up Lesson Intelligence (Module 2)",
      ui.ButtonSet.OK
    );
    return;
  }

  // ── Gate: Registry must be imported ──────────────────────────────────────
  if (props.getProperty("M2_REGISTRY_IMPORTED") !== "true") {
    ui.alert(
      "⚠ Competency Import Required First",
      "Warm-up generation needs the competency registry to personalize prompts.\n\n" +
      "Complete the import first:\n" +
      "Run: Assignment System → ⚠ Module 2 — Import Required\n\n" +
      "Then return here to set up warm-ups.",
      ui.ButtonSet.OK
    );
    return;
  }

  // ── Gate: Enough M1 data? ─────────────────────────────────────────────────
  // Check if any scored evaluations exist — warm-up personalization needs
  // evaluation history to be meaningful. Warn but don't block.
  const ledgerSsId = props.getProperty("CENTRAL_LEDGER_SS_ID");
  let ss;
  try { ss = SpreadsheetApp.openById(ledgerSsId); }
  catch (e) {
    ui.alert("⚠ Cannot reach Central Ledger. Contact your administrator.", ui.ButtonSet.OK);
    return;
  }

  const stagingSheet = ss.getSheetByName("STAGING_PIPELINE");
  const hasEvalHistory = stagingSheet && stagingSheet.getLastRow() > 1;
  if (!hasEvalHistory) {
    const proceed = ui.alert(
      "📋 Warm-Ups Work Best With Evaluation History",
      "The warm-up system personalizes each prompt using students' past\n" +
      "evaluation feedback. Your Module 1 evaluation pipeline doesn't have\n" +
      "history yet.\n\n" +
      "You can set up warm-ups now — they will generate generic prompts\n" +
      "until evaluation history accumulates.\n\n" +
      "Click OK to continue anyway, or Cancel to wait until after your\n" +
      "first assignment cycle completes.",
      ui.ButtonSet.OK_CANCEL
    );
    if (proceed !== ui.Button.OK) return;
  }

  // ── Welcome ───────────────────────────────────────────────────────────────
  const welcome = ui.alert(
    "🌅 Warm-Up Generation Setup — Phase B",
    "This wizard configures the overnight warm-up pipeline.\n\n" +
    "What happens:\n" +
    "  1. Four tabs created (StudentProfiles · WarmUpQueue · " +
    "WarmUpRegistry · ClassSchedule)\n" +
    "  2. Block schedule entered — one structured line, not 14 dialogs\n" +
    "  3. Nightly triggers installed and verified\n" +
    "  4. Studio Flow configuration shown inline\n\n" +
    "Takes about 2 minutes. Click OK to begin.",
    ui.ButtonSet.OK_CANCEL
  );
  if (welcome !== ui.Button.OK) return;

  try {
    _runPhaseB_(ui, props, ss);
  } catch (err) {
    ui.alert(
      "✗ Phase B Error",
      "An unexpected error occurred:\n\n" + err.message + "\n\n" +
      "Completed steps are preserved. Re-run from the menu to continue.",
      ui.ButtonSet.OK
    );
    Logger.log("[S28] Phase B error: " + err.message + "\n" + err.stack);
  }
}

function _runPhaseB_(ui, props, ss) {
  const teacherEmail = props.getProperty("TEACHER_EMAIL") || "";
  const teacherName  = props.getProperty("TEACHER_NAME")  || "";

  // ── STEP 1: Create warm-up tabs ───────────────────────────────────────────
  _gateAlert_(ui, "Step 1 of 4 — Creating Warm-Up Tabs",
    "Creating: StudentProfiles · WarmUpQueue · WarmUpRegistry · ClassSchedule");

  _createM2WarmUpTabs_(ss);
  _addWarmUpGeneratedColumn_(ss);

  const missingTabs = ["StudentProfiles","WarmUpQueue","WarmUpRegistry","ClassSchedule"]
    .filter(t => !ss.getSheetByName(t));
  if (missingTabs.length > 0) {
    ui.alert(
      "✗ Tab Creation Failed",
      "Could not create:\n\n" +
      missingTabs.map(t => "  • " + t).join("\n") + "\n\n" +
      "Verify you have edit access to:\n" + ss.getUrl(),
      ui.ButtonSet.OK
    );
    return;
  }

  // ── STEP 2: Import pacing guide ──────────────────────────────────────────
  // Non-blocking — Phase B completes whether or not import succeeds.
  // Deferred state shown in menu until resolved.
  const pgFile = _findFileInDrive_(props, "PacingGuide_CAS_Context.json");
  if (!pgFile) {
    ui.alert(
      "⚠ Pacing Guide Not Found",
      "PacingGuide_CAS_Context.json was not found in your teacher folder.\n\n" +
      "Upload the file to:\n" + (props.getProperty("TEACHER_FOLDER_URL") || "[teacher folder]") + "\n\n" +
      "Then run importPacingGuide() from Script 31 in the Script Editor.\n\n" +
      "Warm-up prompts will generate using Mode B (generative) until the " +
      "pacing guide is imported.",
      ui.ButtonSet.OK
    );
    props.setProperty("M2_PACING_GUIDE_IMPORTED", "false");
  } else if (typeof CentralLedger === "undefined" || typeof CentralLedger.importPacingGuide !== "function") {
    // FIXED (external review pass, folded in — Addendum 22 R1; corrected
    // fix, external product review Finding 5): importPacingGuide() is
    // defined in Script 31, bound to the Central Ledger project. Same
    // CentralLedger Library fix as the registry import in
    // _executeImportAndVerify_() above — see that function's comment for
    // the full explanation.
    ui.alert(
      "⚠ Import Not Available From This Sheet",
      "The pacing guide importer (Script 31) is bound to the Central Ledger " +
      "project, not the Assignment System Manual — and the CentralLedger " +
      "Library dependency isn't wired up yet on this deployment (see " +
      "cas-ccps/README.md's Finding 5 writeup to set that up once).\n\n" +
      "Until then, import manually:\n" +
      "  1. Open the Central Ledger spreadsheet\n" +
      "  2. Run importPacingGuide() from Script 31 in that project's Script Editor\n\n" +
      "This step can't be completed from this menu — it has to run from " +
      "Central Ledger directly.",
      ui.ButtonSet.OK
    );
    props.setProperty("M2_PACING_GUIDE_IMPORTED", "false");
  } else {
    try {
      CentralLedger.importPacingGuide(); // Script 31, via the CentralLedger Library
      props.setProperty("M2_PACING_GUIDE_IMPORTED", "true");
      Logger.log("[S28] Pacing guide imported successfully.");
    } catch(pgErr) {
      ui.alert(
        "⚠ Pacing Guide Import Failed",
        "The import encountered an error:\n\n" + pgErr.message + "\n\n" +
        "Run importPacingGuide() from Script 31 manually to retry.",
        ui.ButtonSet.OK
      );
      props.setProperty("M2_PACING_GUIDE_IMPORTED", "false");
    }
  }

  // ── STEP 3: Import competency rubrics ─────────────────────────────────────
  // Non-blocking. Rubric data enriches warm-up quality but is not required.
  const crFile = _findFileInDrive_(props, "CompetencyRubrics.json");
  if (!crFile) {
    ui.alert(
      "⚠ Competency Rubrics Not Found",
      "CompetencyRubrics.json was not found in your teacher folder.\n\n" +
      "Upload the file to:\n" + (props.getProperty("TEACHER_FOLDER_URL") || "[teacher folder]") + "\n\n" +
      "Then run importCompetencyRubrics() from Script 32 in the Script Editor.\n\n" +
      "Warm-up prompts will generate without skill question enrichment until imported.",
      ui.ButtonSet.OK
    );
    props.setProperty("M2_RUBRICS_IMPORTED", "false");
  } else if (typeof CentralLedger === "undefined" || typeof CentralLedger.importCompetencyRubrics !== "function") {
    // FIXED (external review pass, folded in — Addendum 22 R1; corrected
    // fix, external product review Finding 5): importCompetencyRubrics()
    // is defined in Script 32, bound to the Central Ledger project. Same
    // CentralLedger Library fix as the two imports above — see
    // _executeImportAndVerify_()'s comment for the full explanation.
    ui.alert(
      "⚠ Import Not Available From This Sheet",
      "The competency rubrics importer (Script 32) is bound to the Central " +
      "Ledger project, not the Assignment System Manual — and the " +
      "CentralLedger Library dependency isn't wired up yet on this deployment " +
      "(see cas-ccps/README.md's Finding 5 writeup to set that up once).\n\n" +
      "Until then, import manually:\n" +
      "  1. Open the Central Ledger spreadsheet\n" +
      "  2. Run importCompetencyRubrics() from Script 32 in that project's Script Editor\n\n" +
      "This step can't be completed from this menu — it has to run from " +
      "Central Ledger directly.",
      ui.ButtonSet.OK
    );
    props.setProperty("M2_RUBRICS_IMPORTED", "false");
  } else {
    try {
      CentralLedger.importCompetencyRubrics(); // Script 32, via the CentralLedger Library
      props.setProperty("M2_RUBRICS_IMPORTED", "true");
      Logger.log("[S28] Competency rubrics imported successfully.");
    } catch(crErr) {
      ui.alert(
        "⚠ Competency Rubrics Import Failed",
        "The import encountered an error:\n\n" + crErr.message + "\n\n" +
        "Run importCompetencyRubrics() from Script 32 manually to retry.",
        ui.ButtonSet.OK
      );
      props.setProperty("M2_RUBRICS_IMPORTED", "false");
    }
  }

  // ── STEP 4: Collect block schedule — single structured prompt ────────────
  _gateAlert_(ui, "Step 4 of 5 — Block Schedule", "");

  const scheduleResult = _collectScheduleCompact_(ui, props, ss, teacherEmail);
  if (!scheduleResult) return; // cancelled

  // ── STEP 5: Install triggers ──────────────────────────────────────────────
  _gateAlert_(ui, "Step 5 of 5 — Installing Nightly Triggers", "");

  _installTriggerIfMissing_("updateAllStudentProfiles", "atHour", 3,  { nearMinute: 0  });
  // FIXED: syncArtifactCompetencies (Script 33, Stage 1B) had its own
  // standalone manual installer (installArtifactSyncTrigger_()) but was
  // never part of the wizard's automated install/verify list — a
  // third-party review found it. It stamps M2_STAGE1B_LAST_RUN on every
  // run, now checked by runWarmUpEvaluation() below at 3:15am; installing
  // it here is what makes that check meaningful on a fresh setup instead
  // of alerting every night on a trigger the wizard never installed.
  _installTriggerIfMissing_("syncArtifactCompetencies", "atHour", 3,  { nearMinute: 5  });
  _installTriggerIfMissing_("runWarmUpEvaluation",      "atHour", 3,  { nearMinute: 15 });
  _installTriggerIfMissing_("buildWarmUpQueues",         "atHour", 3,  { nearMinute: 30 });
  _installTriggerIfMissing_("registerDeliveredWarmUps", "everyMinutes", 5);

  // Verify all five triggers installed
  const installedFns = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  const requiredTriggers = [
    "updateAllStudentProfiles",
    "syncArtifactCompetencies",
    "runWarmUpEvaluation",
    "buildWarmUpQueues",
    "registerDeliveredWarmUps"
  ];
  const missingTriggers = requiredTriggers.filter(fn => !installedFns.includes(fn));

  if (missingTriggers.length > 0) {
    ui.alert(
      "⚠ Trigger Installation Incomplete",
      "These triggers could not be installed automatically:\n\n" +
      missingTriggers.map(fn => "  • " + fn).join("\n") + "\n\n" +
      "Install them manually:\n" +
      "  Script Editor → Triggers → + Add Trigger\n" +
      "  Event source: Time-driven\n\n" +
      "  updateAllStudentProfiles  → Every day at 3am\n" +
      "  syncArtifactCompetencies  → Every day at 3:05am\n" +
      "  runWarmUpEvaluation       → Every day at 3:15am\n" +
      "  buildWarmUpQueues          → Every day at 3:30am\n" +
      "  registerDeliveredWarmUps  → Every 5 minutes\n\n" +
      "Click OK to continue — warm-ups won't run until triggers are active.",
      ui.ButtonSet.OK
    );
    // Non-fatal — continue
  }

  // ── Write Script Properties ───────────────────────────────────────────────
  props.setProperties({
    "M2_SETUP_COMPLETE":      "true",
    "M2_SETUP_PHASE_B":       "true"
  });

  // ── STEP 4: Studio Flow configuration — inline, not deferred ─────────────
  _gateAlert_(ui, "Step 5 of 5 complete — Studio Flow Configuration follows.", "");

  // Show Flow 5 config first — it's a PREREQUISITE step for Flow 3, not an
  // independent flow: a returning student's row starts at Status =
  // PENDING_BRIDGE (see 24_WarmUpBridge.js's own buildWarmUpQueues()) and
  // Flow 5 promotes it to PENDING once bridge_output is written, which is
  // the only thing that hands the row to Flow 3 below. A first-week
  // student (no prior warm-up history) never gets PENDING_BRIDGE at all —
  // their row starts straight at PENDING, so Flow 3 alone is enough to see
  // that case through. Flow 5 not configured, or misconfigured, means
  // every RETURNING student's row sits at PENDING_BRIDGE forever — the
  // Queue Watchdog (Script 34) will flag that as a timed-out row once it's
  // live, but configuring Flow 5 correctly the first time avoids ever
  // needing that safety net to fire.
  ui.alert(
    "⚙ Configure Studio Flow 5 — Warm-Up Bridging",

    "In Google Workspace Studio, create a flow with these exact settings:\n\n" +
    "  Name:         CAS — Warm-Up Bridging\n" +
    "  Trigger:      Sheets row updated\n" +
    "                Sheet: WarmUpQueue\n" +
    "                Condition: Status = PENDING_BRIDGE\n" +
    "                (this status only appears on a row that already has\n" +
    "                a prior scored response — no further condition needed)\n\n" +
    "  Step 1:       Custom step — CAS-CCPS: Extract Bridge Inputs\n" +
    "                (pulls flow5_prior_response, pacing_prior_connection,\n" +
    "                course_name out of lesson_context_snapshot)\n" +
    "  Step 2:       Ask Gemini — system prompt from\n" +
    "                CAS_Flow3_Flow4_Specification.html's Bridging Flow section\n" +
    "  Step 3:       Sheets — update row\n" +
    "                Write bridge_output = Gemini's output\n" +
    "                Set status = PENDING\n" +
    "                (this is what hands the row to Flow 3 below —\n" +
    "                Flow 3's own trigger condition never changes)\n\n" +
    "Click OK when Flow 5 is configured.",

    ui.ButtonSet.OK
  );

  // Show Flow 3 config
  ui.alert(
    "⚙ Configure Studio Flow 3 — Warm-Up Generation",

    "In Google Workspace Studio, create a flow with these exact settings:\n\n" +
    "  Name:         CAS — Warm-Up Generation\n" +
    "  Trigger:      Sheets row updated\n" +
    "                Sheet: WarmUpQueue\n" +
    "                Condition: Status = PENDING\n" +
    "                (a row reaches this status directly if the student has\n" +
    "                no prior warm-up history, or via Flow 5 above once it\n" +
    "                writes bridge_output for a returning student)\n" +
    "  Model:        Gemini Pro\n" +
    "  Temperature:  0.7\n" +
    "  Max tokens:   400\n\n" +
    "  Input:        Read lesson_context_snapshot + student_profile_snapshot\n" +
    "                from trigger row\n" +
    "  Output 1:     Create Google Doc in student warm-up folder\n" +
    "                (path from admin_root_folder_id in snapshot)\n" +
    "  Output 2:     Share doc with student email as editor\n" +
    "  Output 3:     Write doc_id + doc_url to trigger row\n" +
    "                Set status = DELIVERED\n\n" +
    "  System prompt: See CAS_Flow3_Flow4_Specification.html\n" +
    "  Archetype selection logic runs as a pre-processing step.\n\n" +
    "Click OK when Flow 3 is configured.",

    ui.ButtonSet.OK
  );

  // Show Flow 4 config
  ui.alert(
    "⚙ Configure Studio Flow 4 — Warm-Up Evaluation",

    "In Google Workspace Studio, create a second flow:\n\n" +
    "  Name:         CAS — Warm-Up Evaluation\n" +
    "  Trigger:      Sheets row updated\n" +
    "                Sheet: WarmUpQueue\n" +
    "                Condition: Status = PENDING_EVAL\n" +
    "  Model:        Gemini Pro\n" +
    "  Temperature:  0.2\n" +
    "  Max tokens:   256\n\n" +
    "  Input:        Read response_text + lesson_context_snapshot\n" +
    "                from trigger row\n" +
    "  Output:       Write grammar_score + engagement_score + flow4_feedback\n" +
    "                to trigger row · Set status = SCORED\n\n" +
    "  Response format: JSON only — no preamble, no markdown\n" +
    "  { \"grammar\": 0|1, \"engagement\": 0|1|2|3, \"feedback\": \"...\" }\n\n" +
    "  System prompt: See CAS_Flow3_Flow4_Specification.html\n\n" +
    "Click OK when Flow 4 is configured.",

    ui.ButtonSet.OK
  );

  // ── Write summary to doc ──────────────────────────────────────────────────
  _writePhaseBSummaryDoc_(teacherName, teacherEmail, scheduleResult, props);

  // ── Completion alert with smoke test checklist inline ────────────────────
  ui.alert(
    "✅ Phase B Complete — Warm-Up System Active",

    "✓ Tabs created: StudentProfiles · WarmUpQueue · WarmUpRegistry\n" +
    "   ClassSchedule · PacingGuide · CompetencyRubrics\n" +
    (props.getProperty("M2_PACING_GUIDE_IMPORTED") === "true"
      ? "✓ Pacing guide imported\n"
      : "⚠ Pacing guide pending — run importPacingGuide() from Script 31\n") +
    (props.getProperty("M2_RUBRICS_IMPORTED") === "true"
      ? "✓ Competency rubrics imported\n"
      : "⚠ Rubrics pending — run importCompetencyRubrics() from Script 32\n") +
    "✓ Block schedule written: " + scheduleResult.rows.length + " period(s)\n" +
    "✓ Nightly triggers installed\n" +
    "✓ Studio Flows configured (confirm above)\n\n" +

    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "SMOKE TEST — run these in order:\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "  1. Submit a lesson context for tomorrow via the dashboard\n" +
    "  2. Run buildWarmUpQueues() from Script 24 → WarmUpQueue rows appear\n" +
    "  3. Run updateAllStudentProfiles() from Script 23 → profiles populated\n" +
    "  4. Trigger Flow 3 → warm-up docs in student Drive folders\n" +
    "  5. Write 30+ words in one doc\n" +
    "  6. Run runWarmUpEvaluation() from Script 25 → WarmUpQueue SCORED\n" +
    "     Feedback written into doc\n" +
    "  7. Run generateWarmUpReport() from Script 25 → grade report created\n\n" +

    "The nightly cron runs automatically from tomorrow at 3am.",

    ui.ButtonSet.OK
  );
}

// =============================================================================
// COMPACT SCHEDULE COLLECTION
// Single structured prompt. Validated inline. Retries in-place.
// =============================================================================

function _collectScheduleCompact_(ui, props, ss, teacherEmail) {
  const courseNames = (props.getProperty("M2_COURSES") || "")
    .split(",").map(c => c.trim()).filter(Boolean);

  // Build example using teacher's actual course names
  const exampleCourse1 = courseNames[0] || "Course Name";
  const exampleCourse2 = courseNames[1] || courseNames[0] || "Course Name";

  const FORMAT_HELP =
    "Enter your schedule as: PERIOD:DAYTYPE:COURSE NAME\n" +
    "One period per line (or separate entries with \";\" if this box " +
    "won't keep your line breaks).\n\n" +
    "DAYTYPE values:\n" +
    "  DAILY — meets every school day (Period 1)\n" +
    "  ODD   — meets on odd calendar days (1st, 3rd, 5th...)\n" +
    "  EVEN  — meets on even calendar days (2nd, 4th, 6th...)\n\n" +
    "Two courses in the same period at once? Enter it twice, once per " +
    "course.\n\n" +
    "Example:\n" +
    "1:DAILY:" + exampleCourse1 + "\n" +
    "2:ODD:"   + exampleCourse1 + "\n" +
    "3:EVEN:"  + exampleCourse2 + "\n" +
    "4:ODD:"   + exampleCourse2 + "\n\n" +
    "Your configured courses:\n" +
    courseNames.map(c => "  • " + c).join("\n");

  // Retry loop — stays in-place on parse/validation error
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = ui.prompt(
      "Block Schedule" + (attempt > 0 ? " — Fix and Retry" : ""),
      FORMAT_HELP,
      ui.ButtonSet.OK_CANCEL
    );

    if (resp.getSelectedButton() !== ui.Button.OK) return null;

    const raw = resp.getResponseText().trim();
    if (!raw) {
      ui.alert("Schedule cannot be blank. Please try again.");
      continue;
    }

    // Parse each line.
    // FIXED (confirmed live during a real deployment): Ui.prompt()'s dialog
    // does not reliably preserve newlines in its response text -- a
    // multi-line PERIOD:DAYTYPE:COURSE entry came back as one long
    // space-joined blob, which then parsed as a single "line" whose
    // course-name field swallowed everything after the second colon
    // (every subsequent period/daytype/course got absorbed into one
    // giant invalid course name). Splitting on ";" too lets a teacher
    // work around an unreliable newline by separating entries with
    // semicolons instead -- real newlines still work exactly as before.
    const lines   = raw.split(/[\n;]/).map(l => l.trim()).filter(Boolean);
    const rows    = [];
    const errors  = [];

    for (const line of lines) {
      // Format: PERIOD:DAYTYPE:COURSE NAME
      const colonIdx1 = line.indexOf(":");
      if (colonIdx1 === -1) { errors.push("'" + line + "' — missing colons"); continue; }
      const colonIdx2 = line.indexOf(":", colonIdx1 + 1);
      if (colonIdx2 === -1) { errors.push("'" + line + "' — needs two colons"); continue; }

      const period     = line.substring(0, colonIdx1).trim();
      const dayType    = line.substring(colonIdx1 + 1, colonIdx2).trim().toUpperCase();
      const courseName = line.substring(colonIdx2 + 1).trim();

      if (!period)     { errors.push("'" + line + "' — period cannot be blank"); continue; }
      if (!["DAILY","ODD","EVEN"].includes(dayType)) {
        errors.push("'" + line + "' — day type must be DAILY, ODD, or EVEN (got: " + dayType + ")");
        continue;
      }
      if (!courseName) { errors.push("'" + line + "' — course name cannot be blank"); continue; }
      if (courseNames.length > 0 && !courseNames.includes(courseName)) {
        errors.push("'" + courseName + "' — not in your configured courses.\n" +
          "     Configured: " + courseNames.join(", "));
        continue;
      }

      rows.push([teacherEmail, period, dayType, courseName, "TRUE"]);
    }

    if (errors.length > 0) {
      ui.alert(
        "⚠ Schedule Format Errors" +
        (attempt < 2 ? " — Please fix and retry" : " — Final attempt"),
        errors.map(e => "  • " + e).join("\n") + "\n\n" +
        (attempt < 2
          ? "Click OK to re-enter your schedule."
          : "Setup cancelled — re-run from the menu when ready."),
        ui.ButtonSet.OK
      );
      if (attempt === 2) return null;
      continue;
    }

    if (rows.length === 0) {
      ui.alert("No valid rows found. Please check the format and try again.");
      continue;
    }

    // Confirm before writing
    const preview = rows.map(r =>
      "  Period " + r[1] + " · " + r[2] + " · " + r[3]
    ).join("\n");

    const confirm = ui.alert(
      "✅ Confirm Your Schedule",
      preview + "\n\n" +
      "Click OK to save this schedule, or Cancel to re-enter.",
      ui.ButtonSet.OK_CANCEL
    );
    if (confirm !== ui.Button.OK) continue;

    // Write to ClassSchedule tab
    const schedSheet = ss.getSheetByName("ClassSchedule");

    // Clear existing rows for this teacher (safe re-run)
    const existing = schedSheet.getDataRange().getValues();
    for (let i = existing.length - 1; i >= 1; i--) {
      if (String(existing[i][0]).trim().toLowerCase() === teacherEmail.toLowerCase()) {
        schedSheet.deleteRow(i + 1);
      }
    }

    // Batch write
    const startRow = schedSheet.getLastRow() + 1;
    schedSheet.getRange(startRow, 1, rows.length, 5).setValues(rows);

    // Verify write
    const verifyData = schedSheet.getDataRange().getValues();
    const written = verifyData.filter(r =>
      String(r[0]).trim().toLowerCase() === teacherEmail.toLowerCase()
    );

    if (written.length !== rows.length) {
      ui.alert(
        "⚠ Schedule Verification Failed",
        "Wrote " + rows.length + " rows but only " + written.length +
        " could be verified.\n\n" +
        "Check the ClassSchedule tab manually:\n" + ss.getUrl(),
        ui.ButtonSet.OK
      );
      // Return anyway — partial write is better than stopping
    }

    Logger.log("[S28] ClassSchedule written: " + rows.length + " row(s).");
    return { rows };
  }

  return null;
}

// =============================================================================
// TAB CREATION
// =============================================================================

function _createM2LightweightTabs_(ss) {
  // lesson_date (col 4) forced to text format on both tabs below — Sheets
  // otherwise silently auto-detects the "YYYY-MM-DD" strings this column
  // is written with and stores them as real Date values instead, which
  // broke supersedeDuplicates_()/findLesson_()'s string comparisons
  // (22_LessonContextHandler.js / 24_WarmUpBridge.js).
  _createTabIfMissing28_(ss, "LessonContext", [
    "lesson_id","teacher_email","submitted_at","lesson_date",
    "period_or_class","activity_description","learning_objective",
    "key_vocabulary","prior_lesson_connection","competency_ids",
    "status","alignment_logged_at","error_notes","term"
  ], [4]);
  _createTabIfMissing28_(ss, "CompetencyRegistry", [
    "competency_id","competency_text","subject","grade_band",
    "strand","teacher_email","active"
  ]);
  _createTabIfMissing28_(ss, "AlignmentLog", [
    "log_id","lesson_id","logged_at","lesson_date",
    "teacher_email","learning_objective","competency_id",
    "competency_text","strand"
  ], [4]);
  _createTabIfMissing28_(ss, "ReportRegistry", [
    "report_id","generated_at","term","teacher_email",
    "doc_id","doc_url","report_type"
  ]);
}

function _createM2WarmUpTabs_(ss) {
  _createTabIfMissing28_(ss, "StudentProfiles", [
    "student_email","student_name","google_id","teacher_email","period",
    "competencies_addressed","competency_gaps","evaluation_signals",
    "warmup_scores","extra_credit_count","avg_engagement_score","last_updated",
    "shadow_matrix","unit_current"
  ]);
  _createTabIfMissing28_(ss, "WarmUpQueue", [
    "queue_id","lesson_id","student_email","student_name","google_id",
    "lesson_date","lesson_context_snapshot","student_profile_snapshot",
    "status","doc_id","doc_url","word_count","word_count_score",
    "grammar_score","engagement_score","extra_credit","total_score",
    "flow4_feedback","response_text","archetype","bridge_output"
  ], [6]);
  _createTabIfMissing28_(ss, "WarmUpRegistry", [
    "warmup_id","queue_id","lesson_id","lesson_date","student_email",
    "student_name","teacher_email","doc_id","doc_url","generated_at",
    "total_score","extra_credit","term","extra_credit_checked"
  ], [4]);
  _createTabIfMissing28_(ss, "ClassSchedule", [
    "teacher_email","period","day_type","course_name","active"
  ]);

  // ── Pacing guide + competency rubric tabs ─────────────────────────────────
  // Headers only — content populated by importPacingGuide() (S29)
  // and importCompetencyRubrics() (S30) after upload.
  _createTabIfMissing28_(ss, "PacingGuide", [
    "lesson_unit_id","stage","stage_name","lesson_unit_name",
    "approx_start","approx_end","weeks","overlap_type",
    "division_context","objective_8175","objective_8177",
    "competency_ids_8175","competency_ids_8177",
    "key_vocabulary","prior_lesson_connection","warmup_anchor"
  ]);

  _createTabIfMissing28_(ss, "CompetencyRubrics", [
    "competency_id","course","task_number","duty_area",
    "competency_text","demonstration_standard",
    "demonstration_indicators","skill_questions"
  ]);
}

function _addWarmUpGeneratedColumn_(ss) {
  const sheet = ss.getSheetByName("LessonContext");
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.includes("warm_up_generated")) return;
  const newCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, newCol)
    .setValue("warm_up_generated")
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  Logger.log("[S28] warm_up_generated column added.");
}

// textColumns: optional array of 1-based column indices to force to plain
// text format, so ISO-date-shaped strings ("YYYY-MM-DD") written into them
// later never get silently auto-converted to a real Date value by Sheets —
// see 22_LessonContextHandler.js's _normalizeLessonDateCell_ for the bug
// this prevents.
function _createTabIfMissing28_(ss, tabName, headers, textColumns) {
  if (ss.getSheetByName(tabName)) return;
  const sheet = ss.insertSheet(tabName);
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  (textColumns || []).forEach(col => {
    sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  });
  Logger.log("[S28] Created tab: " + tabName);
}

// =============================================================================
// TRIGGER INSTALLATION
// =============================================================================

function _installTriggerIfMissing_(fnName, type, value, opts) {
  const existing = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (existing.includes(fnName)) {
    Logger.log("[S28] Trigger already installed: " + fnName);
    return;
  }
  const builder = ScriptApp.newTrigger(fnName).timeBased();
  if (type === "everyMinutes") {
    builder.everyMinutes(value);
  } else if (type === "atHour") {
    builder.atHour(value);
    if (opts && opts.nearMinute !== undefined) builder.nearMinute(opts.nearMinute);
    builder.everyDays(1);
  }
  builder.create();
  Logger.log("[S28] Trigger installed: " + fnName);
}

// =============================================================================
// CSV FILE FINDER
// =============================================================================

function _findCsvFile_(props) {
  const FILENAME = "CompetencyRegistry.csv";

  // Search teacher folder first
  const folderId = props.getProperty("TEACHER_FOLDER_ID");
  if (folderId) {
    try {
      const folder = DriveApp.getFolderById(folderId);
      const files  = folder.getFilesByName(FILENAME);
      if (files.hasNext()) return files.next();
    } catch (e) {
      Logger.log("[S28] Could not search teacher folder: " + e.message);
    }
  }

  // Fall back to Drive-wide search
  const files = DriveApp.getFilesByName(FILENAME);
  if (files.hasNext()) return files.next();
  return null;
}

// =============================================================================
// HELPERS
// =============================================================================

// Brief progress indicator — keeps teacher informed between steps
function _gateAlert_(ui, title, body) {
  if (!body) return; // skip empty gates
  // For single-line progress messages, use a non-blocking log instead
  // of an alert to reduce click fatigue. Only show alerts for steps
  // that need explicit teacher attention.
  Logger.log("[S28] " + title + (body ? ": " + body : ""));
}

// =============================================================================
// SUMMARY PAGE WRITERS (reference artifact, not instruction delivery)
// =============================================================================

function _writePhaseASummaryDoc_(teacherName, teacherEmail, courseNames,
                                  importResult, props) {
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const ts   = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy 'at' h:mm a"
  );

  body.appendPageBreak();
  body.appendParagraph("📚 Module 2 — Phase A Setup Record")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Completed: " + ts).setItalic(true);
  body.appendParagraph("");

  appendKV_(body, "Teacher", teacherName);
  appendKV_(body, "Email",   teacherEmail);
  appendKV_(body, "Courses", courseNames.join(", "));
  body.appendParagraph("").appendHorizontalRule();

  body.appendParagraph("Tabs Created")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  ["LessonContext","CompetencyRegistry","AlignmentLog","ReportRegistry"]
    .forEach(t => body.appendParagraph("  ✓ " + t));
  body.appendParagraph("");

  body.appendParagraph("Competency Registry")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(importResult.success
    ? "✓ " + importResult.rowCount + " competencies imported."
    : "⚠ Import incomplete — use menu item: ⚠ Module 2 — Import Required"
  );
  body.appendParagraph("");

  body.appendParagraph("Script Properties Written")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  [
    ["M2_ENABLED",               "true"],
    ["M2_COURSES",               courseNames.join(", ")],
    ["M2_SETUP_PHASE_A_COMPLETE","true"],
    ["M2_REGISTRY_IMPORTED",     importResult.success ? "true" : "false"]
  ].forEach(([k, v]) => appendKV_(body, k, v));

  doc.saveAndClose();
}

function _writePhaseBSummaryDoc_(teacherName, teacherEmail, scheduleResult, props) {
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const ts   = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy 'at' h:mm a"
  );

  body.appendPageBreak();
  body.appendParagraph("🌅 Module 2 — Phase B Setup Record")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Completed: " + ts).setItalic(true);
  body.appendParagraph("");

  body.appendParagraph("Block Schedule")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  scheduleResult.rows.forEach(r =>
    body.appendParagraph("  Period " + r[1] + " · " + r[2] + " · " + r[3])
  );
  body.appendParagraph("");

  body.appendParagraph("Triggers Installed")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  [
    "3:00am — updateAllStudentProfiles",
    "3:05am — syncArtifactCompetencies",
    "3:15am — runWarmUpEvaluation",
    "3:30am — buildWarmUpQueues",
    "Every 5 min — registerDeliveredWarmUps"
  ].forEach(t => body.appendParagraph("  ✓ " + t));
  body.appendParagraph("");

  body.appendParagraph("Studio Flows Required")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    "Flow 5 — Warm-Up Bridging    (Trigger: WarmUpQueue status=PENDING_BRIDGE)\n" +
    "                              Prerequisite for Flow 3, only for returning\n" +
    "                              students — writes bridge_output and sets\n" +
    "                              status back to PENDING when done.\n" +
    "Flow 3 — Warm-Up Generation  (Trigger: WarmUpQueue status=PENDING)\n" +
    "Flow 4 — Warm-Up Evaluation  (Trigger: WarmUpQueue status=PENDING_EVAL)\n\n" +
    "Full configuration: CAS_Flow3_Flow4_Specification.html"
  );

  doc.saveAndClose();
}

// ---------------------------------------------------------------------------
// _findFileInDrive_
// Searches teacher folder then all of Drive for a named file.
// Used by Phase B import gates to check file availability before running.
// ---------------------------------------------------------------------------
function _findFileInDrive_(props, filename) {
  const folderId = props.getProperty("TEACHER_FOLDER_ID");
  if (folderId) {
    try {
      const folder = DriveApp.getFolderById(folderId);
      const files  = folder.getFilesByName(filename);
      if (files.hasNext()) return files.next();
    } catch(e) {
      Logger.log("[S28] Could not search teacher folder: " + e.message);
    }
  }
  const files = DriveApp.getFilesByName(filename);
  return files.hasNext() ? files.next() : null;
}

// =============================================================================
// MENU ACTIONS
// =============================================================================

function openLessonDashboard() {
  const url = PropertiesService.getScriptProperties()
    .getProperty("TEACHER_DASHBOARD_URL");
  showLink_(
    "Open your Teacher Dashboard to log lessons and view student status:",
    url || "Dashboard URL not configured — contact your admin."
  );
}

function runModule2ImportOnly() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const ss    = SpreadsheetApp.openById(props.getProperty("CENTRAL_LEDGER_SS_ID"));
  const courseNames = (props.getProperty("M2_COURSES") || "")
    .split(",").map(c => c.trim()).filter(Boolean);

  const result = _runRegistryImportWithGate_(ui, props, ss, courseNames);
  if (result.success) {
    props.setProperty("M2_REGISTRY_IMPORTED", "true");
    ui.alert(
      "✅ Import Complete",
      result.rowCount + " competencies imported.\n\n" +
      "Redeploy Script 07 to activate the competency tabs in the " +
      "lesson context modal.",
      ui.ButtonSet.OK
    );
  }
}

function showModule2Status() {
  const props  = PropertiesService.getScriptProperties();
  const phaseA = props.getProperty("M2_SETUP_PHASE_A_COMPLETE") || "false";
  const phaseB = props.getProperty("M2_SETUP_COMPLETE")          || "false";
  const reg    = props.getProperty("M2_REGISTRY_IMPORTED")       || "false";
  const courses = props.getProperty("M2_COURSES")                || "—";

  DocumentApp.getUi().alert(
    "📚 Module 2 Status",
    "Phase A (Lesson Intelligence): " + (phaseA === "true" ? "✓" : "✗ Not complete") + "\n" +
    "Competency registry imported:  " + (reg   === "true" ? "✓" : "⚠ Required") + "\n" +
    "Phase B (Warm-Ups):            " + (phaseB === "true" ? "✓" : "Not set up") + "\n\n" +
    "Courses: " + courses,
    DocumentApp.getUi().ButtonSet.OK
  );
}
