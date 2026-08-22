// =============================================================================
// FILE: 10_AdminRecoveryPanel.js
// BOUND TO: Central admin spreadsheet (same project as Scripts 03 + 06)
// PURPOSE: Admin Controls menu — recovery operations, health check, overrides.
//          All IDs from getConfig_().
// =============================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚙️ Admin Controls")
    .addItem("📊 Run System Health Check",            "runSystemHealthCheck")
    .addItem("🔄 Reset Stuck Pipeline Row",           "resetStuckRow")
    .addItem("📋 Re-Queue a Failed Submission",        "requeueFailedSubmission")
    .addItem("🗑️ Clear Entire Staging Pipeline",       "clearStagingPipeline")
    .addSeparator()
    .addItem("📅 Set Current Term",                   "setCurrentTerm")
    .addItem("📦 Archive Completed Term",             "archiveCompletedTerm")
    .addItem("📈 View Term Summary",                  "viewTermSummary")
    .addSeparator()
    .addItem("📧 Re-Send Student Document Link",      "resendStudentDocLink")
    .addItem("✅ Manually Mark Student Compliant",    "manuallyMarkCompliant")
    .addToUi();
}

// ---------------------------------------------------------------------------
// _stuckRowContext_ — shared identifying-context line for one stuck
// STAGING_PIPELINE row. Consolidated so autoHealthAlert() (the daily
// email), resetStuckRow() (the manual reset confirmation), and
// runSystemHealthCheck() (the on-demand summary) all describe a stuck row
// the same way — file ID + how long it's been stuck — instead of three
// independently-formatted strings that could drift apart. A future new
// health check inherits this pattern automatically by calling it, rather
// than needing to remember to copy the format by hand.
// See Say/Do Ledger cas-ccps finding #11.
// ---------------------------------------------------------------------------
function _stuckRowContext_(rowNumber, fileId, elapsedMinutes) {
  return "Row " + rowNumber + " — File ID: " + (fileId || "unknown") +
         (elapsedMinutes !== null && elapsedMinutes !== undefined
           ? " (stuck " + elapsedMinutes + " min)"
           : "");
}

// ---------------------------------------------------------------------------
// _ferpaHealthChecks_ — shared FERPA-adjacent health signals, consolidated
// so autoHealthAlert() (daily email) and runSystemHealthCheck() (on-demand
// dialog) check the same three things the same way instead of each growing
// its own copy that could drift — same pattern _stuckRowContext_() already
// established for finding #11. See Say/Do Ledger cas-ccps finding #5,
// Bonus 1.
//
// Returns an array of { ok, alertText, displayLine }:
//   ok          — false means this check found a real problem
//   alertText   — daily-email wording (only used when !ok)
//   displayLine — on-demand dialog's one-line summary (always shown)
// ---------------------------------------------------------------------------
function _ferpaHealthChecks_() {
  const checks = [];
  const scriptProps = PropertiesService.getScriptProperties();

  // (a) 25_WarmUpWriter.js's callFlow4_() has a dead direct-Gemini-API
  // code path (documented placeholder, returns null) that would go live —
  // bypassing the Walled Garden's Studio-Flow-only boundary entirely — the
  // moment a GEMINI_API_KEY Script Property exists. This key should never
  // be set in a correctly-configured deployment.
  const geminiKeySet = !!scriptProps.getProperty("GEMINI_API_KEY");
  checks.push({
    ok: !geminiKeySet,
    alertText:
      "🚨 GEMINI_API_KEY IS SET\n" +
      "   A direct-Gemini-API Script Property exists. The Walled Garden design\n" +
      "   requires all AI processing to go through Google Workspace Studio\n" +
      "   Flows, never a direct API call — this property should not exist in a\n" +
      "   correctly-configured deployment.\n" +
      "   Action: Delete the GEMINI_API_KEY Script Property (Project Settings →\n" +
      "   Script Properties) unless you have a specific, reviewed reason to keep it.",
    displayLine: geminiKeySet
      ? "🚨  GEMINI_API_KEY is set — direct-API bypass risk, see admin alert"
      : "✅  No direct-Gemini-API key configured",
  });

  // (b) getStudentProfileSnapshot_() (23_StudentProfileManager.js) redacts
  // full student names to first-name-only by default before Flow 3 ever
  // sees them. FERPA_FLOW3_FULL_NAME_OVERRIDE is the one Script Property
  // that can turn that safety default back off — alert if it's ever set.
  const nameOverride = scriptProps.getProperty("FERPA_FLOW3_FULL_NAME_OVERRIDE") === "true";
  checks.push({
    ok: !nameOverride,
    alertText:
      "🚨 FLOW 3 FULL-NAME OVERRIDE IS ON\n" +
      "   FERPA_FLOW3_FULL_NAME_OVERRIDE is set to true — warm-up generation is\n" +
      "   sending each student's full name to Studio Flow 3 instead of the\n" +
      "   first-name-only default.\n" +
      "   Action: Remove this Script Property unless there's a specific,\n" +
      "   reviewed reason the override is needed.",
    displayLine: nameOverride
      ? "🚨  Flow 3 full-name override is ON — sending full names, see admin alert"
      : "✅  Flow 3 sends first-name-only (safety default active)",
  });

  // (c) exportToWorkbookGrid_() (30_SCRSuggestionEngine.js) restricts its
  // export spreadsheet's sharing at creation time, but sharing can always
  // be widened by hand afterward — spot-check any file matching its naming
  // pattern for sharing broader than the organization's own domain.
  let overShared = [];
  try {
    const files = DriveApp.searchFiles('title contains "SCR Export — "');
    while (files.hasNext()) {
      const f = files.next();
      const access = f.getSharingAccess();
      if (access === DriveApp.Access.ANYONE || access === DriveApp.Access.ANYONE_WITH_LINK) {
        overShared.push(f.getName());
      }
    }
  } catch (e) {
    Logger.log("[FERPA HEALTH] SCR export sharing scan failed: " + e.message);
  }
  checks.push({
    ok: overShared.length === 0,
    alertText: overShared.length
      ? "🚨 SCR EXPORT SHARED BEYOND THE ORGANIZATION\n" +
        "   " + overShared.length + " file(s) matching \"SCR Export — \" are shared\n" +
        "   with anyone, not just your organization:\n" +
        overShared.map(n => "     • " + n).join("\n") + "\n" +
        "   Action: Open each file → Share → restrict access to your organization."
      : "",
    displayLine: overShared.length
      ? "🚨  " + overShared.length + " SCR export file(s) shared beyond the org — see admin alert"
      : "✅  No SCR export files shared beyond the organization",
  });

  return checks;
}

// ---------------------------------------------------------------------------
// autoHealthAlert — runs daily on a time-driven trigger.
// Checks for stuck IN_PROCESS rows and RubricQueue PENDING_EXTRACTION rows
// older than the alert thresholds. Emails the admin if issues are found.
// Silently exits if everything is healthy — no noise when all is well.
//
// TRIGGER: Set this up once in the Central Ledger spreadsheet's script project:
//   Time-driven → Day timer → Between 6am-7am → autoHealthAlert
// The AutoInstaller sets this trigger automatically.
// ---------------------------------------------------------------------------
function autoHealthAlert() {
  const STUCK_PIPELINE_MINUTES  = 15;  // Alert if IN_PROCESS row older than this
  const STUCK_EXTRACTION_HOURS  = 2;   // Alert if PENDING_EXTRACTION row older than this

  const cfg = getConfig_();
  if (!cfg.adminNotifyEmail) return; // No email configured — skip silently

  const ss  = SpreadsheetApp.openById(cfg.adminSsId);
  const now = new Date();
  const issues = [];

  // --- Check STAGING_PIPELINE for stuck IN_PROCESS rows ---
  const stagingSheet = ss.getSheetByName(cfg.tabs.stagingPipeline);
  if (stagingSheet) {
    const stagingData = stagingSheet.getDataRange().getValues();
    const headers     = stagingData[0] ? stagingData[0].map(h => String(h).trim()) : [];
    const stIdx       = headers.indexOf("Status");
    const tsIdx       = headers.indexOf("Timestamp");
    const fileIdx     = headers.indexOf("StudentFileID");

    for (let i = 1; i < stagingData.length; i++) {
      const status = String(stagingData[i][stIdx] || "").trim();
      if (status !== "IN_PROCESS") continue;

      const rowTs   = tsIdx !== -1 ? new Date(stagingData[i][tsIdx]) : null;
      const elapsed = rowTs ? Math.round((now - rowTs) / 60000) : null;

      if (elapsed !== null && elapsed >= STUCK_PIPELINE_MINUTES) {
        const fileId = fileIdx !== -1 ? String(stagingData[i][fileIdx]).trim() : "unknown";
        issues.push(
          "⏱️ STUCK EVALUATION\n" +
          "   " + _stuckRowContext_(i + 1, fileId, elapsed) + "\n" +
          "   Action: Use ⚙️ Admin Controls → Reset Stuck Pipeline Row"
        );
      }
    }
  }

  // --- Check RubricQueue for stuck PENDING_EXTRACTION rows ---
  const rubricSheet = ss.getSheetByName(cfg.tabs.rubricQueue);
  if (rubricSheet) {
    const rubricData    = rubricSheet.getDataRange().getValues();
    const rHeaders      = rubricData[0] ? rubricData[0].map(h => String(h).trim()) : [];
    const rStIdx        = rHeaders.indexOf("Status");
    const rTsIdx        = rHeaders.indexOf("Timestamp");
    const rTeacherIdx   = rHeaders.indexOf("TeacherEmail");
    const rCourseIdx    = rHeaders.indexOf("CourseName");

    for (let i = 1; i < rubricData.length; i++) {
      const status = String(rubricData[i][rStIdx] || "").trim();
      if (status !== "PENDING_EXTRACTION") continue;

      const rowTs   = rTsIdx !== -1 ? new Date(rubricData[i][rTsIdx]) : null;
      const elapsed = rowTs ? Math.round((now - rowTs) / 3600000) : null; // hours

      if (elapsed !== null && elapsed >= STUCK_EXTRACTION_HOURS) {
        const teacher = rTeacherIdx !== -1
          ? String(rubricData[i][rTeacherIdx]).trim() : "unknown";
        const course  = rCourseIdx !== -1
          ? String(rubricData[i][rCourseIdx]).trim()  : "unknown";
        issues.push(
          "📋 STUCK RUBRIC EXTRACTION (row " + (i + 1) + ")\n" +
          "   Teacher: " + teacher + "\n" +
          "   Course:  " + course  + "\n" +
          "   Stuck for: " + elapsed + " hour" + (elapsed === 1 ? "" : "s") + "\n" +
          "   Action: Check Studio Flow 1 — it may have timed out or hit a quota limit\n" +
          "   To re-queue: delete this row and ask the teacher to resubmit their rubric"
        );
      }
    }
  }

  // --- Check that the Drive Advanced Service is actually enabled ---
  // FIXED: 04_Form2_TurnInGate.js's runForensicCheck_() calls Drive.Revisions.list()
  // (the Advanced Service, not DriveApp) and silently treats "Drive is undefined"
  // as a passed check — meaning the anti-cheating forensic check quietly no-ops
  // for every submission if this service was never enabled, with no alert
  // anywhere until now. This checks the same global the forensic function
  // depends on, so it catches drift regardless of whether the project was set
  // up via clasp push of the checked-in manifest or manually in the Script Editor.
  if (typeof Drive === "undefined") {
    issues.push(
      "🚨 DRIVE ADVANCED SERVICE NOT ENABLED\n" +
      "   The anti-cheating forensic check (version-history scan) is silently\n" +
      "   passing every submission because it can't reach the Drive Advanced\n" +
      "   Service.\n" +
      "   Action: Extensions → Apps Script → Services (+) → add \"Drive API\",\n" +
      "   or redeploy this project from the checked-in manifest, which now\n" +
      "   declares it."
    );
  }

  // --- FERPA-adjacent checks (Say/Do Ledger finding #5, Bonus 1) ---
  _ferpaHealthChecks_().forEach(c => { if (!c.ok && c.alertText) issues.push(c.alertText); });

  // --- Send alert only if issues exist ---
  if (issues.length === 0) {
    Logger.log("[AUTO-HEALTH] All systems healthy — no alert sent.");
    return;
  }

  const body =
    "The Assignment System automated health check found " +
    issues.length + " issue" + (issues.length === 1 ? "" : "s") +
    " that need your attention.\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    issues.join("\n\n") +
    "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    "Open the Central Ledger Spreadsheet and use ⚙️ Admin Controls to resolve these.\n\n" +
    "— Assignment System (automated alert)";

  MailApp.sendEmail(
    cfg.adminNotifyEmail,
    "⚠️ Assignment System — " + issues.length +
      " Issue" + (issues.length === 1 ? "" : "s") + " Need Attention",
    body
  );

  Logger.log("[AUTO-HEALTH] Alert sent to " + cfg.adminNotifyEmail +
             " — " + issues.length + " issue(s) found.");
}

// ---------------------------------------------------------------------------
// setupAutoHealthTrigger — call once to install the daily health check trigger.
// The AutoInstaller calls this during setup. Can also be run manually.
// ---------------------------------------------------------------------------
function setupAutoHealthTrigger() {
  // Check if trigger already exists
  const existing = ScriptApp.getProjectTriggers();
  const hasAlert = existing.some(t => t.getHandlerFunction() === "autoHealthAlert");

  if (hasAlert) {
    Logger.log("[AUTO-HEALTH] Daily trigger already registered.");
    return;
  }

  ScriptApp.newTrigger("autoHealthAlert")
    .timeBased()
    .everyDays(1)
    .atHour(6) // 6am in the script timezone
    .create();

  Logger.log("[AUTO-HEALTH] Daily health alert trigger registered.");
}

// ---------------------------------------------------------------------------
// resetStuckRow — resets IN_PROCESS rows older than 10 minutes
// ---------------------------------------------------------------------------
function resetStuckRow() {
  const ui  = SpreadsheetApp.getUi();
  if (ui.alert("Reset Stuck Pipeline Row",
    "Reset any evaluation running for more than 10 minutes back to the queue?\n\nContinue?",
    ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const cfg     = getConfig_();
  const ss      = SpreadsheetApp.openById(cfg.adminSsId);
  const sheet   = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const stIdx   = headers.indexOf("Status");
  const tsIdx   = headers.indexOf("Timestamp");
  const fileIdx = headers.indexOf("StudentFileID");
  const now     = new Date();
  const cutoff  = 10 * 60 * 1000;
  const reset   = []; // identifying context for each row actually reset — finding #11

  for (let i = 1; i < data.length; i++) {
    const rowStatus = String(data[i][stIdx]).trim();
    // Reset both stuck IN_PROCESS rows and ERROR_TIMEOUT rows to re-queue them
    if (rowStatus !== "IN_PROCESS" && rowStatus !== "ERROR_TIMEOUT") continue;
    let elapsedMin = null;
    if (rowStatus === "IN_PROCESS") {
      const rowTs = tsIdx !== -1 ? new Date(data[i][tsIdx]) : null;
      if (rowTs) elapsedMin = Math.round((now - rowTs) / 60000);
      if (rowTs && (now - rowTs) < cutoff) continue;
    }
    const fileId = fileIdx !== -1 ? String(data[i][fileIdx]).trim() : "unknown";
    reset.push(_stuckRowContext_(i + 1, fileId, elapsedMin));
    sheet.getRange(i + 1, stIdx + 1).setValue("PENDING_INFERENCE");
  }

  SpreadsheetApp.flush();
  // FIXED (finding #11): used to just report a count with no identifying
  // context — brought up to the same standard autoHealthAlert() already
  // uses, via the shared _stuckRowContext_() helper.
  ui.alert(reset.length > 0
    ? "✅ " + reset.length + " stuck row(s) reset to queue:\n\n" + reset.join("\n")
    : "✅ No stuck rows found.");
}

// ---------------------------------------------------------------------------
// clearStagingPipeline
// ---------------------------------------------------------------------------
function clearStagingPipeline() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert("⚠️ Clear Entire Staging Pipeline",
    "Delete ALL rows from the staging pipeline?\n\n" +
    "ReviewQueue rows are NOT affected — they will be re-staged on the next bridge run.\n\nContinue?",
    ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const cfg   = getConfig_();
  const ss    = SpreadsheetApp.openById(cfg.adminSsId);
  const sheet = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const last  = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
  SpreadsheetApp.flush();
  ui.alert("✅ Staging pipeline cleared.");
}

// ---------------------------------------------------------------------------
// requeueFailedSubmission
// ---------------------------------------------------------------------------
function requeueFailedSubmission() {
  const ui  = SpreadsheetApp.getUi();
  const res = ui.prompt("Re-Queue Failed Submission",
    "Enter the student's Google account or CONFIG_ID:",
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const term  = res.getResponseText().trim();
  const cfg   = getConfig_();
  const ss    = SpreadsheetApp.openById(cfg.adminSsId);
  const sheet = ss.getSheetByName(cfg.tabs.reviewQueue);
  const data  = sheet.getDataRange().getValues();
  let   found = false;

  for (let i = 1; i < data.length; i++) {
    const rowGid   = String(data[i][1]).trim().toLowerCase();
    const rowCfg   = String(data[i][3]).trim();
    const rowSt    = String(data[i][5]).trim();

    if (rowGid !== term.toLowerCase() && rowCfg !== term) continue;

    if (rowSt === "PENDING" || rowSt === "STAGED") {
      ui.alert("This submission is already queued (" + rowSt + "). No action needed.");
      return;
    }

    if (rowSt === "COMPLETE" || rowSt === "COMPLIANT") {
      if (ui.alert("Already Complete",
        "Status is: " + rowSt + ". Re-queue anyway?",
        ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    }

    sheet.getRange(i + 1, 6).setValue("PENDING");
    found = true;
    break;
  }

  SpreadsheetApp.flush();
  ui.alert(found
    ? "✅ Submission re-queued. Bridge will pick it up within 1–2 minutes."
    : "⚠️ No submission found matching: " + term);
}

// ---------------------------------------------------------------------------
// runSystemHealthCheck
// ---------------------------------------------------------------------------
function runSystemHealthCheck() {
  const ui  = SpreadsheetApp.getUi();
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.adminSsId);

  const stagingSheet = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const queueSheet   = ss.getSheetByName(cfg.tabs.reviewQueue);
  const ledgerSs     = SpreadsheetApp.openById(cfg.ledgerSsId);
  const ledgerSheet  = ledgerSs.getSheetByName(cfg.tabs.ledger);

  const sd = stagingSheet ? stagingSheet.getDataRange().getValues() : [];
  const qd = queueSheet   ? queueSheet.getDataRange().getValues()   : [];
  const ld = ledgerSheet  ? ledgerSheet.getDataRange().getValues()  : [];

  const sHeaders  = sd[0] ? sd[0].map(h => String(h).trim()) : [];
  const stIdx     = sHeaders.indexOf("Status");
  const tsIdx     = sHeaders.indexOf("Timestamp");
  const fileIdx   = sHeaders.indexOf("StudentFileID");
  const now       = new Date();

  // FIXED (finding #11): stuckRows now collects identifying context (file
  // ID, elapsed minutes) via the shared _stuckRowContext_() helper instead
  // of just a bare count — brought up to the standard autoHealthAlert()
  // already sets for describing a stuck row.
  let inProcess = 0, pending = 0, complete = 0, sErrors = 0, timeouts = 0;
  const stuckRows = [];
  for (let i = 1; i < sd.length; i++) {
    const s = String(sd[i][stIdx] || "").trim();
    if (s === "IN_PROCESS")        inProcess++;
    if (s === "PENDING_INFERENCE") pending++;
    if (s === "COMPLETE")          complete++;
    if (s === "ERROR_TIMEOUT")     timeouts++;
    if (s.startsWith("ERROR") && s !== "ERROR_TIMEOUT") sErrors++;
    if (s === "IN_PROCESS" && tsIdx !== -1) {
      const elapsedMin = Math.round((now - new Date(sd[i][tsIdx])) / 60000);
      if (elapsedMin > 10) {
        const fileId = fileIdx !== -1 ? String(sd[i][fileIdx]).trim() : "unknown";
        stuckRows.push(_stuckRowContext_(i + 1, fileId, elapsedMin));
      }
    }
  }
  const stuck = stuckRows.length;

  let qPending = 0, qStaged = 0, qComplete = 0, qErrors = 0;
  for (let i = 1; i < qd.length; i++) {
    const s = String(qd[i][5] || "").trim();
    if (s === "PENDING")  qPending++;
    if (s === "STAGED")   qStaged++;
    if (s === "COMPLETE") qComplete++;
    if (s.startsWith("ERROR")) qErrors++;
  }

  let lActive = 0, lCompliant = 0, lFlagged = 0, lArchived = 0;
  for (let i = 1; i < ld.length; i++) {
    const s = String(ld[i][12] || "").trim();
    if (s === "ACTIVE")    lActive++;
    if (s === "COMPLIANT") lCompliant++;
    if (s === "ARCHIVED")  lArchived++;
    if (s.startsWith("ERROR") || s === "FLAGGED") lFlagged++;
  }
  const currentTerm = PropertiesService.getScriptProperties().getProperty("CURRENT_TERM") || "(not set)";

  // FIXED (finding #5, Bonus 1): folded into the final "all healthy" &&
  // condition below, not just appended as a display line — a display-only
  // addition wouldn't have affected the actual pass/fail result.
  const ferpaChecks = _ferpaHealthChecks_();
  const ferpaOk     = ferpaChecks.every(c => c.ok);

  const ts = Utilities.formatDate(now, Session.getScriptTimeZone(), "MMM d, h:mm a");

  ui.alert("System Health Check", [
    "SYSTEM HEALTH CHECK — " + ts + "\n",
    "STAGING PIPELINE",
    (stuck > 0
      ? "⚠️  " + stuck + " stuck row(s) — use Reset Stuck Row:\n      " + stuckRows.join("\n      ")
      : "✅  No stuck rows"),
    "   Evaluating:   " + inProcess,
    "   Queued:       " + pending,
    "   Complete:     " + complete,
    (timeouts > 0 ? "⏱️  Timeouts auto-cleared: " + timeouts + " (teachers notified)" : "✅  No timeouts"),
    (sErrors > 0 ? "⚠️  Other errors: " + sErrors : ""),
    "",
    "REVIEW QUEUE",
    "   Pending:      " + qPending,
    "   Staged:       " + qStaged,
    "   Complete:     " + qComplete,
    (qErrors > 0 ? "⚠️  Errors: " + qErrors : "✅  No errors"),
    "",
    "STUDENT LEDGER",
    "   Current term: " + currentTerm,
    "   Active:       " + lActive,
    "   Compliant:    " + lCompliant,
    "   Archived:     " + lArchived,
    (lFlagged > 0 ? "🚩  Flagged: " + lFlagged : "✅  No flagged students"),
    "",
    "FORENSIC CHECK",
    // FIXED: 04_Form2_TurnInGate.js's runForensicCheck_() calls the Drive
    // Advanced Service and silently treats "unavailable" as a passed check —
    // this makes that failure visible instead of invisible.
    (typeof Drive === "undefined"
      ? "🚨  Drive Advanced Service NOT enabled — anti-cheating check is silently passing every submission. Enable it via Extensions → Apps Script → Services."
      : "✅  Drive Advanced Service enabled — forensic check is active."),
    "",
    "FERPA",
    ...ferpaChecks.map(c => c.displayLine),
    "",
    (stuck === 0 && sErrors === 0 && qErrors === 0 && lFlagged === 0 && typeof Drive !== "undefined" && ferpaOk
      ? "✅ All systems healthy." + (timeouts > 0 ? " (" + timeouts + " timeout(s) auto-resolved.)" : "")
      : "⚠️ Action may be required. See flags above.")
  ].filter(l => l !== "").join("\n"), ui.ButtonSet.OK);
}

// ---------------------------------------------------------------------------
// resendStudentDocLink — looks up by Google ID or name, shows doc URL in alert
// Since students have no email, writes the link into their doc's feedback zone
// ---------------------------------------------------------------------------
function resendStudentDocLink() {
  const ui  = SpreadsheetApp.getUi();
  const res = ui.prompt("Re-Send Student Document Link",
    "Enter the student's Google account or full name:",
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const term = res.getResponseText().trim().toLowerCase();
  const cfg  = getConfig_();
  const ss   = SpreadsheetApp.openById(cfg.ledgerSsId);
  const data = ss.getSheetByName(cfg.tabs.ledger).getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowGid  = String(data[i][1]).toLowerCase();
    const rowName = String(data[i][4]).toLowerCase();
    if (rowGid !== term && rowName !== term) continue;

    const fileId  = String(data[i][3]).trim();
    const docUrl  = "https://docs.google.com/document/d/" + fileId + "/edit";

    ui.alert(
      "✅ Student Document Found",
      "Student:  " + data[i][4] + "\n" +
      "Document: " + docUrl + "\n\n" +
      "Share this link with the student directly.",
      ui.ButtonSet.OK
    );
    return;
  }

  ui.alert("⚠️ No student found matching: " + term);
}

// ---------------------------------------------------------------------------
// setCurrentTerm — updates the CURRENT_TERM Script Property used by
// Scripts 02, 07, and 13 to tag and filter student records by term
// ---------------------------------------------------------------------------
function setCurrentTerm() {
  const ui  = SpreadsheetApp.getUi();
  const cur = PropertiesService.getScriptProperties().getProperty("CURRENT_TERM") || "(not set)";

  const res = ui.prompt(
    "Set Current Term",
    "Enter the term identifier for new student registrations.\n\n" +
    "Current term: " + cur + "\n\n" +
    "Format examples:  2025-26 S1  |  2025-26 S2  |  Fall 2025  |  Spring 2026\n\n" +
    "All students registered AFTER this change will be tagged with the new term.\n" +
    "Existing registrations are not affected.",
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const newTerm = res.getResponseText().trim();
  if (!newTerm) { ui.alert("Term cannot be blank."); return; }

  PropertiesService.getScriptProperties().setProperty("CURRENT_TERM", newTerm);
  ui.alert(
    "✅ Current Term Updated",
    "New term: " + newTerm + "\n\n" +
    "All new student registrations will be tagged with this term.\n" +
    "Teacher and student dashboards will default to showing this term.",
    ui.ButtonSet.OK
  );
}

// ---------------------------------------------------------------------------
// archiveCompletedTerm — marks all COMPLIANT and stale ACTIVE rows
// from a selected term as ARCHIVED so dashboards filter them out
// ---------------------------------------------------------------------------
function archiveCompletedTerm() {
  const ui  = SpreadsheetApp.getUi();
  const cfg = getConfig_();

  const termRes = ui.prompt(
    "Archive a Completed Term",
    "Enter the term to archive (e.g. 2025-26 S1).\n\n" +
    "What gets archived:\n" +
    "  • All COMPLIANT submissions from that term\n" +
    "  • All ACTIVE (unfinished) rows from that term\n\n" +
    "Archived rows stay in the Ledger for records but are hidden from dashboards.\n\n" +
    "This cannot be undone automatically — contact your admin to restore.",
    ui.ButtonSet.OK_CANCEL
  );
  if (termRes.getSelectedButton() !== ui.Button.OK) return;

  const termToArchive = termRes.getResponseText().trim();
  if (!termToArchive) { ui.alert("Term cannot be blank."); return; }

  const confirm = ui.alert(
    // FIX (found while verifying reconciliation decision 10): the literal
    // quote characters meant to wrap termToArchive in the displayed message
    // (e.g. Archive "2024-2025"?) were unescaped, breaking the string
    // literal boundary — same class of bug as the newline fixes above.
    "Archive \"" + termToArchive + "\"?",
    "This will mark all student records from \"" + termToArchive + "\" as ARCHIVED.\n\n" +
    "They will no longer appear in teacher or student dashboards.\n\n" +
    "Are you sure?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const ledgerSs  = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet     = ledgerSs.getSheetByName(cfg.tabs.ledger);
  const data      = sheet.getDataRange().getValues();
  let   archived  = 0;
  let   skipped   = 0;

  for (let i = 1; i < data.length; i++) {
    const rowTerm  = String(data[i][18] || "").trim();
    const rowStatus = String(data[i][12]).trim();

    if (rowTerm !== termToArchive) continue;

    // Archive COMPLIANT and ACTIVE rows — leave ERROR rows for admin review
    if (rowStatus === "COMPLIANT" || rowStatus === "ACTIVE" || rowStatus === "COMPLETE") {
      sheet.getRange(i + 1, 13).setValue("ARCHIVED");
      archived++;
    } else {
      skipped++;
    }
  }

  SpreadsheetApp.flush();

  ui.alert(
    "✅ Archive Complete",
    "Term archived: " + termToArchive + "\n\n" +
    "Rows archived: " + archived + "\n" +
    (skipped > 0 ? "Rows skipped (errors/other): " + skipped + "\n" : "") +
    "\nThese records are still in the Ledger for your records.\n" +
    "They will no longer appear in dashboards.",
    ui.ButtonSet.OK
  );
}

// ---------------------------------------------------------------------------
// viewTermSummary — shows a per-term breakdown of student counts and statuses
// ---------------------------------------------------------------------------
function viewTermSummary() {
  const ui  = SpreadsheetApp.getUi();
  const cfg = getConfig_();

  const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet    = ledgerSs.getSheetByName(cfg.tabs.ledger);
  const data     = sheet.getDataRange().getValues();

  const terms = {};

  for (let i = 1; i < data.length; i++) {
    const term   = String(data[i][18] || "(no term)").trim();
    const status = String(data[i][12]).trim();
    if (!terms[term]) terms[term] = { total:0, compliant:0, active:0, archived:0, error:0 };
    terms[term].total++;
    if (status === "COMPLIANT")      terms[term].compliant++;
    else if (status === "ARCHIVED")  terms[term].archived++;
    else if (status.startsWith("ERROR")) terms[term].error++;
    else                             terms[term].active++;
  }

  const sorted = Object.keys(terms).sort().reverse();
  const lines  = ["TERM SUMMARY\n"];

  sorted.forEach(term => {
    const t = terms[term];
    lines.push(term + ":");
    lines.push("  Total: " + t.total + "  |  Compliant: " + t.compliant +
               "  |  Active: " + t.active + "  |  Archived: " + t.archived +
               (t.error > 0 ? "  |  Errors: " + t.error : ""));
    lines.push("");
  });

  ui.alert("Term Summary", lines.join("\n"), ui.ButtonSet.OK);
}

// ---------------------------------------------------------------------------
// manuallyMarkCompliant
// ---------------------------------------------------------------------------
function manuallyMarkCompliant() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert("Manually Mark Student Compliant",
    "Use only when you have personally reviewed the student's work.\n\nContinue?",
    ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const res = ui.prompt("Manually Mark Compliant",
    "Enter the student's CONFIG_ID:", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const configId = res.getResponseText().trim();
  const cfg      = getConfig_();
  const ss       = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet    = ss.getSheetByName(cfg.tabs.ledger);
  const data     = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() !== configId) continue;
    sheet.getRange(i + 1, 13).setValue("COMPLIANT");
    sheet.getRange(i + 1, 14).setValue(new Date());
    sheet.getRange(i + 1, 15).setValue("Manually marked compliant by administrator.");
    SpreadsheetApp.flush();
    ui.alert("✅ " + data[i][4] + " marked COMPLIANT.");
    return;
  }

  ui.alert("⚠️ No student found with CONFIG_ID: " + configId);
}
