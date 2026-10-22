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
    .addItem("📦 Archive a Completed School Year",    "archiveCompletedTerm")
    .addItem("♻️ Reactivate an Archived School Year",  "reactivateArchivedTerm")
    .addItem("📈 View Term Summary",                  "viewTermSummary")
    .addSeparator()
    .addItem("📧 Re-Send Student Document Link",      "resendStudentDocLink")
    .addItem("✅ Manually Mark Student Compliant",    "manuallyMarkCompliant")
    .addSeparator()
    // Say/Do Ledger cas-ccps Extension 3 — exportScrDecisionLogForAudit()
    // is defined in 30_SCRSuggestionEngine.js, same central-ledger project.
    .addItem("📤 Export SCRDecisionLog for Audit",    "exportScrDecisionLogForAudit")
    // Roadmap 2.2 — reactivateCompetencyEvidence() is also defined in
    // 30_SCRSuggestionEngine.js, same central-ledger project.
    .addItem("♻️ Reactivate Competency Evidence",      "reactivateCompetencyEvidence")
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
// _stagingPipelineHealthChecks_ — Say/Do Ledger cross-portfolio Flow Health
// &amp; Inventory extension. Scans STAGING_PIPELINE once and returns both the
// existing IN_PROCESS-stuck-row check (moved here from being duplicated,
// with two DIFFERENT thresholds, inline in autoHealthAlert() and
// runSystemHealthCheck()) and a new check this extension actually asked
// for: PENDING_INFERENCE rows stuck past a threshold with no evaluation
// ever having started.
//
// The two thresholds below were previously 15 (autoHealthAlert's own local
// STUCK_PIPELINE_MINUTES) vs. a hardcoded 10 (runSystemHealthCheck) for the
// exact same "IN_PROCESS too long" question — a real drift this pass fixes
// by unifying both callers onto one shared constant, same as the
// _stuckRowContext_()/_ferpaHealthChecks_() consolidations already did for
// their own findings.
//
// A PENDING_INFERENCE row is queued but hasn't been promoted to IN_PROCESS
// yet — 06_StagingPipeline_Turnstile.js's 1-minute trigger is what promotes
// these into a free per-teacher lane. A row sitting PENDING_INFERENCE far
// longer than one promotion cycle means either that trigger isn't
// installed/running, or every lane for that teacher has been busy the
// whole time — genuinely different from "actively being evaluated" and,
// before this extension, invisible: runSystemHealthCheck() only ever
// counted PENDING_INFERENCE rows, never aged them.
//
// Two gaps closed 2026-10-12 (a hand-added test row held a teacher's lane
// IN_PROCESS and this check called it healthy):
//   - An IN_PROCESS or PENDING_INFERENCE row with no readable timestamp
//     never ages, so it never crossed either threshold. It's now reported
//     as stuck, marked "no timestamp".
//   - A row whose status is none of the known ones (Studio residue: a step
//     that typed its unbound variable names into the sheet) was counted
//     nowhere. It's now listed in unknownStatusRows. Fully blank rows are
//     skipped.
const STAGING_STUCK_IN_PROCESS_MINUTES = 15;
const STAGING_STUCK_PENDING_MINUTES    = 20;

function _stagingPipelineHealthChecks_(ss, cfg) {
  const result = {
    inProcessStuckRows: [],
    pendingStuckRows: [],
    unknownStatusRows: [],
    counts: { inProcess: 0, pending: 0, complete: 0, timeouts: 0, otherErrors: 0 },
  };

  const stagingSheet = ss.getSheetByName(cfg.tabs.stagingPipeline);
  if (!stagingSheet) return result;

  const data    = stagingSheet.getDataRange().getValues();
  const headers = data[0] ? data[0].map(h => String(h).trim()) : [];
  const stIdx   = headers.indexOf("Status");
  const tsIdx   = headers.indexOf("Timestamp");
  const fileIdx = headers.indexOf("StudentFileID");
  const teachIdx= headers.indexOf("TeacherEmail");
  const now     = new Date();

  for (let i = 1; i < data.length; i++) {
    if (data[i].every(c => c === "" || c === null)) continue;
    const status = String(data[i][stIdx] || "").trim();
    const rowTs   = tsIdx !== -1 ? new Date(data[i][tsIdx]) : null;
    // A blank or unreadable timestamp: elapsed is unknowable, not zero.
    const noTs    = tsIdx !== -1 && (data[i][tsIdx] === "" || isNaN(rowTs.getTime()));
    const elapsed = rowTs && !noTs ? Math.round((now - rowTs) / 60000) : null;
    const fileId  = fileIdx !== -1 ? String(data[i][fileIdx]).trim() : "unknown";

    if (status === "IN_PROCESS") {
      result.counts.inProcess++;
      if (noTs) {
        result.inProcessStuckRows.push(_stuckRowContext_(i + 1, fileId, null) + " (no timestamp, so it never times out)");
      } else if (elapsed !== null && elapsed >= STAGING_STUCK_IN_PROCESS_MINUTES) {
        result.inProcessStuckRows.push(_stuckRowContext_(i + 1, fileId, elapsed));
      }
    } else if (status === "PENDING_INFERENCE") {
      result.counts.pending++;
      if (noTs) {
        const teacher = teachIdx !== -1 ? String(data[i][teachIdx]).trim() : "unknown";
        result.pendingStuckRows.push(
          _stuckRowContext_(i + 1, fileId, null) + " (no timestamp) — Teacher: " + (teacher || "unknown")
        );
      } else if (elapsed !== null && elapsed >= STAGING_STUCK_PENDING_MINUTES) {
        const teacher = teachIdx !== -1 ? String(data[i][teachIdx]).trim() : "unknown";
        result.pendingStuckRows.push(
          _stuckRowContext_(i + 1, fileId, elapsed) + " — Teacher: " + (teacher || "unknown")
        );
      }
    } else if (status === "COMPLETE") {
      result.counts.complete++;
    } else if (status === "ERROR_TIMEOUT") {
      result.counts.timeouts++;
    } else if (status.startsWith("ERROR")) {
      result.counts.otherErrors++;
    } else {
      result.unknownStatusRows.push(
        "Row " + (i + 1) + " — status \"" + (status || "(blank)").slice(0, 40) + "\""
      );
    }
  }

  return result;
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

  // (a) GEMINI_API_KEY was read only by a commented-out direct-Gemini call
  // in 25_WarmUpWriter.js (since removed) that would have bypassed the
  // Walled Garden's Studio-Flow-only boundary. Nothing reads it now, and
  // it should never be set in a correctly-configured deployment.
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
  // pattern for sharing broader than private (named viewers only).
  let overShared = [];
  try {
    const files = DriveApp.searchFiles('title contains "SCR Export — "');
    while (files.hasNext()) {
      const f = files.next();
      const access = f.getSharingAccess();
      // Domain-wide counts too: students are on the domain, and the export
      // holds every student's ratings (student-data access policy).
      if (access !== DriveApp.Access.PRIVATE) {
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

  // (d) SCRDecisionLog rows past the configured retention window that
  // haven't moved to the restricted "Archived — pending disposition review"
  // state (Say/Do Ledger cas-ccps Extension 3). Both callers of this
  // function (autoHealthAlert() and runSystemHealthCheck()) already run
  // _archiveExpiredScrDecisions_() immediately before calling this, so a
  // nonzero count here means archival itself failed or didn't run — a
  // genuine signal, not a tautology.
  let pastRetentionUnarchived = 0;
  try {
    pastRetentionUnarchived = _countScrDecisionsPastRetentionUnarchived_();
  } catch (e) {
    Logger.log("[FERPA HEALTH] SCRDecisionLog retention scan failed: " + e.message);
  }
  checks.push({
    ok: pastRetentionUnarchived === 0,
    alertText: pastRetentionUnarchived
      ? "🚨 SCRDecisionLog RETENTION ARCHIVAL DID NOT RUN\n" +
        "   " + pastRetentionUnarchived + " row(s) are past the configured retention\n" +
        "   window (SCR_RETENTION_YEARS Script Property, default 5 years) and have\n" +
        "   not moved to the archived state — this should be automatic.\n" +
        "   Action: run ⚙️ Admin Controls → Run System Health Check once by hand\n" +
        "   (which re-triggers archival), and confirm the daily health-check\n" +
        "   trigger (setupAutoHealthTrigger) is still installed."
      : "",
    displayLine: pastRetentionUnarchived
      ? "🚨  " + pastRetentionUnarchived + " SCRDecisionLog row(s) past retention, not archived — see admin alert"
      : "✅  No SCRDecisionLog rows past retention awaiting archival",
  });

  // (e) Ledger rows past the configured retention window that haven't been
  // marked ARCHIVED (external product review, Finding 6 — same pattern as
  // check (d) above, extended to the Ledger). Both callers already run
  // _archiveExpiredLedgerRows_() immediately before calling this, so a
  // nonzero count here means archival itself failed or didn't run.
  let ledgerPastRetentionUnarchived = 0;
  try {
    ledgerPastRetentionUnarchived = _countLedgerRowsPastRetentionUnarchived_();
  } catch (e) {
    Logger.log("[FERPA HEALTH] Ledger retention scan failed: " + e.message);
  }
  checks.push({
    ok: ledgerPastRetentionUnarchived === 0,
    alertText: ledgerPastRetentionUnarchived
      ? "🚨 LEDGER RETENTION ARCHIVAL DID NOT RUN\n" +
        "   " + ledgerPastRetentionUnarchived + " row(s) are past the configured retention\n" +
        "   window (LEDGER_RETENTION_YEARS Script Property, default 5 years,\n" +
        "   unconfirmed against any real district retention schedule) and have\n" +
        "   not moved to ARCHIVED — this should be automatic.\n" +
        "   Action: run ⚙️ Admin Controls → Run System Health Check once by hand\n" +
        "   (which re-triggers archival), and confirm the daily health-check\n" +
        "   trigger (setupAutoHealthTrigger) is still installed."
      : "",
    displayLine: ledgerPastRetentionUnarchived
      ? "🚨  " + ledgerPastRetentionUnarchived + " Ledger row(s) past retention, not archived — see admin alert"
      : "✅  No Ledger rows past retention awaiting archival",
  });

  // (f) CompetencyEvidence rows past the configured retention window that
  // haven't been marked ARCHIVED (roadmap 2.2 — same pattern as (d)/(e),
  // extended to the one FERPA-scoped tab that had no archival mechanism
  // at all). Both callers already run _archiveExpiredCompetencyEvidence_()
  // immediately before calling this, so a nonzero count here means
  // archival itself failed or didn't run.
  let evidencePastRetentionUnarchived = 0;
  try {
    evidencePastRetentionUnarchived = _countCompetencyEvidencePastRetentionUnarchived_();
  } catch (e) {
    Logger.log("[FERPA HEALTH] CompetencyEvidence retention scan failed: " + e.message);
  }
  checks.push({
    ok: evidencePastRetentionUnarchived === 0,
    alertText: evidencePastRetentionUnarchived
      ? "🚨 COMPETENCYEVIDENCE RETENTION ARCHIVAL DID NOT RUN\n" +
        "   " + evidencePastRetentionUnarchived + " row(s) are past the configured retention\n" +
        "   window (COMPETENCY_EVIDENCE_RETENTION_YEARS Script Property, default 5\n" +
        "   years, unconfirmed against any real district retention schedule) and\n" +
        "   have not moved to ARCHIVED — this should be automatic.\n" +
        "   Action: run ⚙️ Admin Controls → Run System Health Check once by hand\n" +
        "   (which re-triggers archival), and confirm the daily health-check\n" +
        "   trigger (setupAutoHealthTrigger) is still installed."
      : "",
    displayLine: evidencePastRetentionUnarchived
      ? "🚨  " + evidencePastRetentionUnarchived + " CompetencyEvidence row(s) past retention, not archived — see admin alert"
      : "✅  No CompetencyEvidence rows past retention awaiting archival",
  });

  // ── (g) ParentReportLog retention ──
  // Same counter-after-archiver shape as (d), (e) and (f): both callers run
  // _archiveExpiredParentReports_() immediately before this, so a nonzero
  // result means archival itself failed, not that it merely hasn't run.
  //
  // This is the disclosure log — the record of what left the school's domain,
  // about whom, and to which address. Of the four retention checks it is the
  // one whose window a records request is most likely to ask about, which is
  // also why its five-year default being unconfirmed matters most here.
  let parentReportsPastRetentionUnarchived = 0;
  try {
    parentReportsPastRetentionUnarchived = _countParentReportsPastRetentionUnarchived_();
  } catch (e) {
    Logger.log("[FERPA HEALTH] ParentReportLog retention scan failed: " + e.message);
  }
  checks.push({
    ok: parentReportsPastRetentionUnarchived === 0,
    alertText: parentReportsPastRetentionUnarchived
      ? "🚨 PARENTREPORTLOG RETENTION ARCHIVAL DID NOT RUN\n" +
        "   " + parentReportsPastRetentionUnarchived + " disclosure record(s) are past the configured\n" +
        "   retention window (PARENT_REPORT_RETENTION_YEARS Script Property,\n" +
        "   default 5 years, unconfirmed against any real district retention\n" +
        "   schedule) and have not moved to ARCHIVED — this should be automatic.\n" +
        "   Action: run ⚙️ Admin Controls → Run System Health Check once by hand\n" +
        "   (which re-triggers archival), and confirm the daily health-check\n" +
        "   trigger (setupAutoHealthTrigger) is still installed."
      : "",
    displayLine: parentReportsPastRetentionUnarchived
      ? "🚨  " + parentReportsPastRetentionUnarchived + " ParentReportLog row(s) past retention, not archived — see admin alert"
      : "✅  No ParentReportLog rows past retention awaiting archival",
  });

  // ── (h) WarmUpQueue retention (third-party review) ──
  // Same counter-after-archiver shape as (d)-(g): both callers run
  // _archiveExpiredWarmUpQueueRows_() (34_QueueWatchdog.js) immediately
  // before this, so a nonzero result means archival itself failed, not
  // that it merely hasn't run.
  let warmUpQueuePastRetentionUnarchived = 0;
  try {
    warmUpQueuePastRetentionUnarchived = _countWarmUpQueueRowsPastRetentionUnarchived_();
  } catch (e) {
    Logger.log("[FERPA HEALTH] WarmUpQueue retention scan failed: " + e.message);
  }
  checks.push({
    ok: warmUpQueuePastRetentionUnarchived === 0,
    alertText: warmUpQueuePastRetentionUnarchived
      ? "🚨 WARMUPQUEUE RETENTION ARCHIVAL DID NOT RUN\n" +
        "   " + warmUpQueuePastRetentionUnarchived + " row(s) are past the configured retention\n" +
        "   window (WARMUP_QUEUE_RETENTION_YEARS Script Property, default 1 school\n" +
        "   year, 57_RetentionSchedule.js, pending district confirmation) and have\n" +
        "   not moved to ARCHIVED — this should be automatic.\n" +
        "   Action: run ⚙️ Admin Controls → Run System Health Check once by hand\n" +
        "   (which re-triggers archival), and confirm the daily health-check\n" +
        "   trigger (setupAutoHealthTrigger) is still installed."
      : "",
    displayLine: warmUpQueuePastRetentionUnarchived
      ? "🚨  " + warmUpQueuePastRetentionUnarchived + " WarmUpQueue row(s) past retention, not archived — see admin alert"
      : "✅  No WarmUpQueue rows past retention awaiting archival",
  });

  // ── (i) Student writing copied into ReviewQueue ──
  // The Student Dashboard used to store each submission's full text in
  // ReviewQueue's StudentText column; it no longer does, and nothing read
  // it. Rows still holding text predate that fix (or come from an old
  // deployment of 13_StudentDashboard.js).
  let reviewQueueRowsWithText = 0;
  try {
    reviewQueueRowsWithText = _countReviewQueueRowsWithText_();
  } catch (e) {
    Logger.log("[FERPA HEALTH] ReviewQueue text scan failed: " + e.message);
  }
  checks.push({
    ok: reviewQueueRowsWithText === 0,
    alertText: reviewQueueRowsWithText
      ? "🚨 STUDENT WRITING IS STORED IN REVIEWQUEUE\n" +
        "   " + reviewQueueRowsWithText + " ReviewQueue row(s) hold a copy of a student's response.\n" +
        "   Student writing belongs only in the student's own Doc.\n" +
        "   Action: run applyReviewQueueTextScrub() from the editor. If new rows\n" +
        "   keep appearing, redeploy the student-dashboard web app."
      : "",
    displayLine: reviewQueueRowsWithText
      ? "🚨  " + reviewQueueRowsWithText + " ReviewQueue row(s) hold student writing — see admin alert"
      : "✅  ReviewQueue holds no student writing",
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
  const STUCK_EXTRACTION_HOURS  = 2;   // Alert if PENDING_EXTRACTION row older than this

  const cfg = getConfig_();
  if (!cfg.adminNotifyEmail) return; // No email configured — skip silently

  const ss  = SpreadsheetApp.openById(cfg.adminSsId);
  const now = new Date();
  const issues = [];

  // --- Check STAGING_PIPELINE for stuck IN_PROCESS / PENDING_INFERENCE rows ---
  // (Say/Do Ledger cross-portfolio Flow Health extension: both checks now
  // share one scan + one pair of thresholds with runSystemHealthCheck(),
  // via _stagingPipelineHealthChecks_() — see its own doc comment above.)
  const staging = _stagingPipelineHealthChecks_(ss, cfg);
  staging.inProcessStuckRows.forEach(ctx => {
    issues.push(
      "⏱️ STUCK EVALUATION\n" +
      "   " + ctx + "\n" +
      "   Action: Use ⚙️ Admin Controls → Reset Stuck Pipeline Row"
    );
  });
  staging.pendingStuckRows.forEach(ctx => {
    issues.push(
      "🕓 QUEUED SUBMISSION NEVER STARTED EVALUATION\n" +
      "   " + ctx + "\n" +
      "   Action: Confirm the Turnstile time-driven trigger (06_StagingPipeline_Turnstile.js) is installed and running — a queued row this old with no evaluation started usually means it isn't."
    );
  });
  staging.unknownStatusRows.forEach(ctx => {
    issues.push(
      "❓ STAGING ROW WITH AN UNKNOWN STATUS\n" +
      "   " + ctx + "\n" +
      "   Action: Open STAGING_PIPELINE. Text like a step's variable names is Studio residue from a test run; delete the row."
    );
  });

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

  // The Drive Advanced Service check that stood here guarded 04's turn-in
  // forensic check, its only user; both retired with the Turn-In Form
  // (P0-04, 2026-10-10).

  // --- SCRDecisionLog retention archival (Say/Do Ledger cas-ccps Extension 3) ---
  // Runs before the FERPA checks below so the "past retention, not archived"
  // check right after almost always reads zero — it's a genuine health
  // signal (did archival actually run?) precisely because this call
  // normally makes it true, not a tautology.
  _archiveExpiredScrDecisions_();

  // --- Ledger retention archival (external product review, Finding 6) ---
  // Same rationale as the SCRDecisionLog call above, extended to the Ledger.
  _archiveExpiredLedgerRows_();

  // --- CompetencyEvidence retention archival (roadmap 2.2 — explicit
  // archive/hibernate state). Same rationale as the two calls above,
  // extended to the one FERPA-scoped tab that had no archival at all.
  _archiveExpiredCompetencyEvidence_();
  _archiveExpiredParentReports_();

  // --- WarmUpQueue retention archival (third-party review — the one major
  // operational tab with zero retention at all). Same rationale as the
  // calls above, in 34_QueueWatchdog.js since that file already owns
  // WarmUpQueue health monitoring.
  _archiveExpiredWarmUpQueueRows_();

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
  const cfg   = getConfig_();
  const ss    = SpreadsheetApp.openById(cfg.adminSsId);
  const sheet = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const queue = ss.getSheetByName(cfg.tabs.reviewQueue);
  const plan  = _clearStagingPlan_(sheet, queue);
  if (!plan.rows) {
    ui.alert("✅ The staging pipeline is already empty.");
    return;
  }
  // A preview first, and the ReviewQueue rows put back (2026-10-22, UX audit
  // fix-first 7). This used to promise ReviewQueue rows "will be re-staged
  // on the next bridge run", but the bridge (03) stages only PENDING rows and
  // these were STAGED, so every student cleared stayed "being checked" for
  // good.
  const byStatus = Object.keys(plan.byStatus).map(function (k) {
    return "  " + k + ": " + plan.byStatus[k];
  }).join("\n");
  if (ui.alert("⚠️ Clear Entire Staging Pipeline",
    "This deletes all " + plan.rows + " staging row(s):\n" + byStatus + "\n\n" +
    (plan.requeue.length
      ? plan.requeue.length + " submission(s) not finished yet will be put back in line " +
        "(their ReviewQueue rows set to PENDING), so the bridge stages them again. " +
        "A feedback still on its way may arrive twice.\n\n"
      : "No unfinished submission needs putting back in line.\n\n") +
    "Continue?",
    ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const last = sheet.getLastRow();
  if (last > 1) sheet.deleteRows(2, last - 1);
  plan.requeue.forEach(function (rowNum) {
    queue.getRange(rowNum, CSP_RQ_STATUS + 1).setValue("PENDING");
  });
  SpreadsheetApp.flush();
  ui.alert("✅ Staging pipeline cleared." +
    (plan.requeue.length ? " " + plan.requeue.length + " submission(s) put back in line." : ""));
}

// ReviewQueue's Status column (03's RQ_STATUS).
const CSP_RQ_STATUS = 5;

// What clearStagingPipeline() would do: { rows, byStatus, requeue }, where
// requeue lists the ReviewQueue row numbers still STAGED behind a staging
// row that isn't COMPLETE. Reads only.
function _clearStagingPlan_(sheet, queue) {
  const plan = { rows: 0, byStatus: {}, requeue: [] };
  if (!sheet || sheet.getLastRow() < 2) return plan;
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) { return String(h).trim(); });
  const stIdx  = headers.indexOf("Status") !== -1 ? headers.indexOf("Status") : 5;
  const refIdx = headers.indexOf("QueueRowRef") !== -1 ? headers.indexOf("QueueRowRef") : 1;
  const refs = {};
  for (let i = 1; i < data.length; i++) {
    const st = String(data[i][stIdx]).trim() || "(blank)";
    plan.rows++;
    plan.byStatus[st] = (plan.byStatus[st] || 0) + 1;
    const ref = parseInt(data[i][refIdx], 10);
    if (st !== "COMPLETE" && !isNaN(ref) && ref >= 2) refs[ref] = true;
  }
  if (queue && queue.getLastRow() > 1) {
    const q = queue.getRange(1, CSP_RQ_STATUS + 1, queue.getLastRow(), 1).getValues();
    Object.keys(refs).forEach(function (r) {
      const n = Number(r);
      if (n <= q.length && String(q[n - 1][0]).trim() === "STAGED") plan.requeue.push(n);
    });
  }
  plan.requeue.sort(function (a, b) { return a - b; });
  return plan;
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
  // Run from the editor there is no spreadsheet UI: getUi() throws "Cannot
  // call SpreadsheetApp.getUi() from this context" (seen 2026-10-12). The
  // report then goes to the execution log.
  let ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    ui = { alert: function (title, body) { Logger.log("[10] " + title + "\n" + body); }, ButtonSet: { OK: "OK" } };
  }
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.adminSsId);

  const queueSheet   = ss.getSheetByName(cfg.tabs.reviewQueue);
  const ledgerSs     = SpreadsheetApp.openById(cfg.ledgerSsId);
  const ledgerSheet  = ledgerSs.getSheetByName(cfg.tabs.ledger);

  const qd  = queueSheet   ? queueSheet.getDataRange().getValues()   : [];
  // Bounded to LEDGER_COL_COUNT (00_SharedConfig.js), not getDataRange() —
  // external product review Finding 6.
  const ld  = ledgerSheet  ? ledgerSheet.getRange(1, 1, Math.max(1, ledgerSheet.getLastRow()), LEDGER_COL_COUNT).getValues() : [];
  const now = new Date();

  // FIXED (Say/Do Ledger cross-portfolio Flow Health extension): this used
  // to hardcode a 10-minute IN_PROCESS threshold, drifting from
  // autoHealthAlert()'s own 15-minute one for the exact same question — now
  // both callers share one scan and one pair of thresholds via
  // _stagingPipelineHealthChecks_() (see its doc comment). Also adds the
  // PENDING_INFERENCE-stuck check that function was actually built for —
  // previously this function only ever counted those rows, never aged them.
  const staging       = _stagingPipelineHealthChecks_(ss, cfg);
  const inProcess     = staging.counts.inProcess;
  const pending       = staging.counts.pending;
  const complete      = staging.counts.complete;
  const timeouts      = staging.counts.timeouts;
  const sErrors       = staging.counts.otherErrors;
  const stuckRows     = staging.inProcessStuckRows;
  const pendingStuck  = staging.pendingStuckRows;
  const unknownRows   = staging.unknownStatusRows;
  const stuck         = stuckRows.length;

  let qPending = 0, qStaged = 0, qComplete = 0, qErrors = 0;
  for (let i = 1; i < qd.length; i++) {
    const s = String(qd[i][5] || "").trim();
    if (s === "PENDING")  qPending++;
    if (s === "STAGED")   qStaged++;
    if (s === "COMPLETE") qComplete++;
    if (s.startsWith("ERROR")) qErrors++;
  }

  let lActive = 0, lCompliant = 0, lPendingReview = 0, lFlagged = 0, lArchived = 0;
  for (let i = 1; i < ld.length; i++) {
    const s = String(ld[i][12] || "").trim();
    if (s === "ACTIVE")    lActive++;
    // NEW (Say/Do Ledger cas-ccps finding #1): visibility into how many
    // genuine-complete submissions are sitting in the new intermediate
    // state, awaiting a teacher's own confirm/override — a normal, expected
    // state, not folded into "all healthy" below, since a healthy system can
    // (and should) have some of these at any given moment.
    if (s === "PENDING_TEACHER_REVIEW") lPendingReview++;
    if (s === "COMPLIANT") lCompliant++;
    if (s === "ARCHIVED")  lArchived++;
    if (s.startsWith("ERROR") || s === "FLAGGED") lFlagged++;
  }
  const currentTerm = currentTerm_() || "(not set)";

  // Same reasoning as autoHealthAlert() above — archive first, so the
  // retention health check below reflects current-after-archival reality
  // (Say/Do Ledger cas-ccps Extension 3).
  _archiveExpiredScrDecisions_();

  // Ledger retention archival (external product review, Finding 6) — same
  // reasoning as the SCRDecisionLog call above, extended to the Ledger.
  _archiveExpiredLedgerRows_();

  // CompetencyEvidence retention archival (roadmap 2.2) — same reasoning,
  // extended to the one FERPA-scoped tab that had no archival at all.
  _archiveExpiredCompetencyEvidence_();
  _archiveExpiredParentReports_();

  // WarmUpQueue retention archival (third-party review) — same reasoning,
  // in 34_QueueWatchdog.js since that file already owns WarmUpQueue health.
  _archiveExpiredWarmUpQueueRows_();

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
    // NEW (Say/Do Ledger cross-portfolio Flow Health extension): a queued
    // row that's never even been promoted to IN_PROCESS was previously
    // invisible here — only counted, never aged.
    (pendingStuck.length > 0
      ? "🕓  " + pendingStuck.length + " queued row(s) never started evaluation:\n      " + pendingStuck.join("\n      ")
      : "✅  No queued rows stuck without starting"),
    (unknownRows.length > 0
      ? "❓  " + unknownRows.length + " row(s) with an unknown status (Studio residue?):\n      " + unknownRows.join("\n      ")
      : "✅  No unknown-status rows"),
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
    "   Pending review: " + lPendingReview,
    "   Compliant:    " + lCompliant,
    "   Archived:     " + lArchived,
    (lFlagged > 0 ? "🚩  Flagged: " + lFlagged : "✅  No flagged students"),
    "",
    "FERPA",
    ...ferpaChecks.map(c => c.displayLine),
    "",
    (stuck === 0 && pendingStuck.length === 0 && unknownRows.length === 0 && sErrors === 0 && qErrors === 0 && lFlagged === 0 && ferpaOk
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
  // Bounded to LEDGER_COL_COUNT (00_SharedConfig.js), not getDataRange() —
  // external product review Finding 6.
  const ledgerSheet = ss.getSheetByName(cfg.tabs.ledger);
  const data = ledgerSheet.getRange(1, 1, Math.max(1, ledgerSheet.getLastRow()), LEDGER_COL_COUNT).getValues();

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
// Scripts 02 and 52 to tag new Ledger rows, and by the dashboards' term
// dropdowns. The format is the school year plus the marking period,
// "2627_MP1" (MP 1-4; decided 2026-10-12). Changing it at a new marking
// period hides no one: the dashboards show the whole school year by default.
// Since 2026-10-19 the term follows the marking-period dates (currentTerm_(),
// 00); this property is the fallback for a date they don't cover (summer).
// ---------------------------------------------------------------------------
function setCurrentTerm() {
  const ui  = SpreadsheetApp.getUi();
  const cur = PropertiesService.getScriptProperties().getProperty("CURRENT_TERM") || "(not set)";

  const res = ui.prompt(
    "Set Current Term",
    "Enter the school year and marking period, like 2627_MP1\n" +
    "(2627 is the 2026-27 school year; MP is 1 to 4).\n\n" +
    "CURRENT_TERM: " + cur + "\n" +
    "Term in use today: " + (currentTerm_() || "(not set)") + "\n" +
    "During the school year the term follows the marking-period dates (MARKING_PERIOD_ENDS);\n" +
    "CURRENT_TERM is used only on a date those don't cover.\n\n" +
    "Students registered or imported after this change are tagged with the new term.\n" +
    "Existing rows keep theirs, and the dashboards still show the whole school year.",
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const newTerm = res.getResponseText().trim().toUpperCase();
  const check = _validateTermInput_(newTerm);
  if (check) { ui.alert(check); return; }

  PropertiesService.getScriptProperties().setProperty("CURRENT_TERM", newTerm);
  ui.alert(
    "✅ Current Term Updated",
    "New term: " + newTerm + "\n\n" +
    "New student registrations will be tagged with this term.\n" +
    "The dashboards keep showing the whole school year; pick a term in their dropdown to narrow it.",
    ui.ButtonSet.OK
  );
}

// "" when term is a valid "2627_MP1"-style term, else the reason it isn't.
function _validateTermInput_(term) {
  if (!term) return "Term cannot be blank.";
  if (!MP_TERM_RE_.test(term) || !_schoolYearOfTerm_(term)) {
    return "\"" + term + "\" isn't a term. Use the school year and marking period, like 2627_MP1 " +
      "(two consecutive years, then _MP and 1 to 4).";
  }
  return "";
}

// A school year typed for archive or reactivate: "2627" or "2026-27".
// Returns { year: "2026-27" } or { error }. A marking period is refused:
// courses run all year, so archiving one would hide students mid-year.
function _parseSchoolYearInput_(text) {
  const t = String(text || "").trim().toUpperCase();
  if (!t) return { error: "School year cannot be blank." };
  if (MP_TERM_RE_.test(t)) {
    return { error: "\"" + t + "\" is one marking period. Courses run all year, so archive the whole " +
      "school year at its end instead: enter " + t.slice(0, 4) + "." };
  }
  if (/^\d{4}$/.test(t)) {
    const year = _schoolYearOfTerm_(t + "_MP1");
    return year ? { year: year } : { error: "\"" + t + "\" isn't a school year (two consecutive years, like 2627)." };
  }
  if (SCHOOL_YEAR_RE_.test(t)) return { year: t };
  return { error: "\"" + t + "\" isn't a school year. Enter it like 2627 (or 2026-27)." };
}

// Archives one school year's COMPLIANT, ACTIVE and COMPLETE Ledger rows (a
// row's year is its term's, else its timestamp's; see 00). Returns counts.
function _archiveSchoolYearRows_(sheet, year) {
  const data = sheet.getDataRange().getValues();
  let archived = 0, skipped = 0;
  for (let i = 1; i < data.length; i++) {
    if (_rowSchoolYear_(data[i]) !== year) continue;
    const rowStatus = String(data[i][LEDGER.STATUS]).trim();
    // Archive COMPLIANT and ACTIVE rows — leave ERROR rows for admin review
    if (rowStatus === "COMPLIANT" || rowStatus === "ACTIVE" || rowStatus === "COMPLETE" ||
        rowStatus === "SCHEDULED") {
      sheet.getRange(i + 1, LEDGER.STATUS + 1).setValue("ARCHIVED");
      archived++;
    } else if (rowStatus !== "ARCHIVED") {
      skipped++;
    }
  }
  return { archived: archived, skipped: skipped };
}

// Sets one school year's ARCHIVED Ledger rows back to ACTIVE.
function _reactivateSchoolYearRows_(sheet, year) {
  const data = sheet.getDataRange().getValues();
  let reactivated = 0;
  for (let i = 1; i < data.length; i++) {
    if (_rowSchoolYear_(data[i]) !== year) continue;
    if (String(data[i][LEDGER.STATUS]).trim() !== "ARCHIVED") continue;
    sheet.getRange(i + 1, LEDGER.STATUS + 1).setValue("ACTIVE");
    reactivated++;
  }
  return reactivated;
}

// ---------------------------------------------------------------------------
// archiveCompletedTerm — at the end of a school year, marks its COMPLIANT,
// ACTIVE and COMPLETE rows ARCHIVED so dashboards filter them out. It takes
// a school year ("2627"), never a marking period: a term is one marking
// period of a year-long course (since 2026-10-12), and archiving one would
// hide students' work mid-year. The menu name is kept so existing menus work.
// ---------------------------------------------------------------------------
function archiveCompletedTerm() {
  const ui  = SpreadsheetApp.getUi();
  const cfg = getConfig_();

  const termRes = ui.prompt(
    "Archive a Completed School Year",
    "Enter the school year to archive, like 2627 (for 2026-27).\n" +
    "Do this once the year is over; a single marking period can't be archived.\n\n" +
    "What gets archived from that year:\n" +
    "  • All COMPLIANT and COMPLETE submissions\n" +
    "  • All ACTIVE (unfinished) rows\n\n" +
    "Archived rows stay in the Ledger for records but are hidden from dashboards.\n\n" +
    "To undo this later, use ♻️ Reactivate an Archived School Year in this same menu.",
    ui.ButtonSet.OK_CANCEL
  );
  if (termRes.getSelectedButton() !== ui.Button.OK) return;

  const parsed = _parseSchoolYearInput_(termRes.getResponseText());
  if (parsed.error) { ui.alert(parsed.error); return; }
  const year = parsed.year;

  const confirm = ui.alert(
    "Archive " + year + "?",
    "This will mark all student records from the " + year + " school year as ARCHIVED.\n\n" +
    "They will no longer appear in teacher or student dashboards.\n\n" +
    "Are you sure?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
  const r = _archiveSchoolYearRows_(sheet, year);
  SpreadsheetApp.flush();

  ui.alert(
    "✅ Archive Complete",
    "School year archived: " + year + "\n\n" +
    "Rows archived: " + r.archived + "\n" +
    (r.skipped > 0 ? "Rows skipped (errors/other): " + r.skipped + "\n" : "") +
    "\nThese records are still in the Ledger for your records.\n" +
    "They will no longer appear in dashboards.",
    ui.ButtonSet.OK
  );
}

// ---------------------------------------------------------------------------
// reactivateArchivedTerm (roadmap 2.2 — "explicit archive/hibernate state").
// The genuinely missing half of archiveCompletedTerm() above: until this,
// nothing in cas-ccps had a way back from ARCHIVED at all —
// archiveCompletedTerm()'s own confirm dialog says so explicitly ("This
// cannot be undone automatically — contact your admin to restore"). This
// IS that restore path.
//
// Sets a school year's ARCHIVED rows back to ACTIVE — a deliberate
// simplification, not a bug: archiveCompletedTerm() overwrites whichever
// of COMPLIANT/ACTIVE/COMPLETE a row had with a single ARCHIVED value, so
// that original distinction isn't recoverable through the round trip.
// ACTIVE is the safe default ("back in play, visible on dashboards again")
// rather than guessing which of the three it actually was.
// ---------------------------------------------------------------------------
function reactivateArchivedTerm() {
  const ui  = SpreadsheetApp.getUi();
  const cfg = getConfig_();

  const termRes = ui.prompt(
    "Reactivate an Archived School Year",
    "Enter the school year to reactivate, like 2627 (for 2026-27).\n\n" +
    "This sets every ARCHIVED row from that year back to ACTIVE so it " +
    "appears on dashboards again.\n\n" +
    "Note: the original distinction between COMPLIANT/ACTIVE/COMPLETE is " +
    "not restored — every reactivated row becomes ACTIVE.",
    ui.ButtonSet.OK_CANCEL
  );
  if (termRes.getSelectedButton() !== ui.Button.OK) return;

  const parsed = _parseSchoolYearInput_(termRes.getResponseText());
  if (parsed.error) { ui.alert(parsed.error); return; }
  const year = parsed.year;

  const confirm = ui.alert(
    "Reactivate " + year + "?",
    "This will set all ARCHIVED student records from the " + year + " school year to ACTIVE.\n\n" +
    "Are you sure?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
  const reactivated = _reactivateSchoolYearRows_(sheet, year);
  if (reactivated > 0) SpreadsheetApp.flush();

  ui.alert(
    "✅ Reactivate Complete",
    reactivated > 0
      ? "School year reactivated: " + year + "\n\nRows reactivated: " + reactivated
      : "No ARCHIVED rows found for " + year,
    ui.ButtonSet.OK
  );
}

// =============================================================================
// AUTOMATIC LEDGER RETENTION (external product review, Finding 6, "this
// quarter" scaling fix — extends the SCR_RETENTION_YEARS pattern
// (30_SCRSuggestionEngine.js) to the Ledger).
//
// cas-ccps/docs/FERPA_DATA_MAP.md is explicit that this repo does not
// assert a retention period for a tab unless one is actually enforced
// somewhere — this is that enforcement, following SCR_RETENTION_YEARS'
// own precedent exactly: a configurable, Script-Property-driven default
// that ships UNCONFIRMED against any real district/legal retention
// schedule (no primary source has been checked for assignment records
// specifically, any more than one had been for SCR ratings when that
// default first shipped) — correct the number the moment a real one is
// known, via LEDGER_RETENTION_YEARS, no code change required.
//
// Deliberately reuses the STATUS column's existing "ARCHIVED" value
// (LEDGER.STATUS, 00_SharedConfig.js) rather than adding a second,
// parallel archive-flag column — archiveCompletedTerm() above already
// established "ARCHIVED" as this tab's one archival signal (dashboards
// already skip it — see 13_StudentDashboard.js's own "Skip ARCHIVED
// rows" comment), and this function is genuinely the same operation,
// just time-triggered instead of admin-triggered by term name. Only
// rows already in one of archiveCompletedTerm()'s own archivable
// statuses (COMPLIANT/ACTIVE/COMPLETE) are eligible — ERROR-prefixed
// rows are left alone for admin review, same as there. Never deletes
// anything; actual permanent deletion still always requires a human
// decision outside any script here.
// =============================================================================
const LEDGER_ARCHIVABLE_STATUSES = ["COMPLIANT", "ACTIVE", "COMPLETE", "SCHEDULED"];

function _ledgerRetentionYears_() {
  const raw = PropertiesService.getScriptProperties().getProperty("LEDGER_RETENTION_YEARS");
  const n = Number(raw);
  return (n && n > 0) ? n : 5;
}

// Returns { archived, checked }. Safe to call with the Ledger tab missing
// (returns zeros) or with nothing eligible (returns archived: 0). Anchors
// "how old is this record" on LEDGER.TIMESTAMP (registration date, always
// populated) — the same "age of the record itself" anchor SCRDecisionLog's
// own archival uses (DECIDED_AT), not SubmissionTS, which is blank for any
// row that was never submitted and shouldn't be treated as ageless just
// because of that.
function _archiveExpiredLedgerRows_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  if (!sheet) return { archived: 0, checked: 0 };

  const cutoff = _retentionCutoff_(_ledgerRetentionYears_());

  const data = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), LEDGER_COL_COUNT).getValues();
  let archived = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[LEDGER.STATUS] || "").trim();
    if (LEDGER_ARCHIVABLE_STATUSES.indexOf(status) === -1) continue; // already ARCHIVED, or an ERROR/other status left for admin review

    const ts = row[LEDGER.TIMESTAMP];
    if (!ts) continue;
    const rowDate = new Date(ts);
    if (isNaN(rowDate.getTime())) continue;

    if (rowDate < cutoff) {
      sheet.getRange(i + 1, LEDGER.STATUS + 1).setValue("ARCHIVED");
      archived++;
    }
  }

  if (archived > 0) {
    SpreadsheetApp.flush();
    Logger.log("[S10] Archived " + archived + " Ledger row(s) past the " +
      _ledgerRetentionYears_() + "-year retention window.");
  }

  return { archived: archived, checked: data.length - 1 };
}

// ---------------------------------------------------------------------------
// _countLedgerRowsPastRetentionUnarchived_ — read-only companion to
// _archiveExpiredLedgerRows_(), used by _ferpaHealthChecks_() as a pure
// check with no side effects of its own — same pairing as
// _countScrDecisionsPastRetentionUnarchived_()/_archiveExpiredScrDecisions_()
// in 30_SCRSuggestionEngine.js. Both callers of _ferpaHealthChecks_()
// already run _archiveExpiredLedgerRows_() first, so this should almost
// always return 0 — a nonzero result means archival itself failed or the
// daily trigger isn't actually firing, which is the real thing worth
// alerting on.
// ---------------------------------------------------------------------------
function _countLedgerRowsPastRetentionUnarchived_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  if (!sheet) return 0;

  const cutoff = _retentionCutoff_(_ledgerRetentionYears_());

  const data = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), LEDGER_COL_COUNT).getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[LEDGER.STATUS] || "").trim();
    if (LEDGER_ARCHIVABLE_STATUSES.indexOf(status) === -1) continue;
    const ts = row[LEDGER.TIMESTAMP];
    if (!ts) continue;
    const rowDate = new Date(ts);
    if (isNaN(rowDate.getTime())) continue;
    if (rowDate < cutoff) count++;
  }
  return count;
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
//
// NOTE (Say/Do Ledger cas-ccps finding #1): the normal path for a
// genuine-complete submission is no longer straight to COMPLIANT — it stops
// at PENDING_TEACHER_REVIEW first, and the teacher's own Pending Review
// queue (07_TeacherDashboard.js) is what finally confirms/overrides it. This
// admin action still exists as a separate, explicit escape hatch — e.g. a
// submission stuck in an error state that never reached the normal
// ledger-matched flow at all — not as the routine override the finding was
// originally about (that gap is what the Pending Review queue now closes).
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

  // Student-data access policy, rule 3: only the teacher who assigned the
  // work grades it. The Ledger menu is open to anyone who can edit the
  // Ledger, so check the signed-in user against the row's teacher.
  const me = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() !== configId) continue;
    const rowTeacher = String(data[i][LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase();
    if (!me || me !== rowTeacher) {
      ui.alert("⚠️ Only the teacher who assigned this work (" + (rowTeacher || "unknown") +
        ") can mark it compliant.");
      return;
    }
    sheet.getRange(i + 1, 13).setValue("COMPLIANT");
    sheet.getRange(i + 1, 14).setValue(new Date());
    sheet.getRange(i + 1, 15).setValue("Manually marked compliant by " + me + ".");
    SpreadsheetApp.flush();
    ui.alert("✅ " + data[i][4] + " marked COMPLIANT.");
    return;
  }

  ui.alert("⚠️ No student found with CONFIG_ID: " + configId);
}
