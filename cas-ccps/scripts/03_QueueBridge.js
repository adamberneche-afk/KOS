// =============================================================================
// FILE: 03_QueueBridge.js
// BOUND TO: Central Ledger spreadsheet
// TRIGGERS:
//   bridgeQueue              — Time-driven, every 1 minute
//   backPropagateCompletions — Time-driven, every 2 minutes
// =============================================================================

// Ledger column indices (0-based)
const L_GOOGLE_ID = 1;
const L_CONFIG_ID = 2;
const L_FILE_ID   = 3;
const L_STATUS    = 12;
const L_LAST_EVAL = 15;
const L_TERM      = 18;  // AcademicYear/Term column added for term management

// ReviewQueue column indices (0-based)
const RQ_GOOGLE_ID = 1;
const RQ_FILE_ID   = 2;
const RQ_CONFIG_ID = 3;
const RQ_STATUS    = 5;

// STAGING_PIPELINE column indices (0-based)
// Schema: Timestamp | QueueRowRef | StudentFileID | ConfigID | TeacherEmail | Status
// Prefixed STG_ (not SP_) — SP_ is 23_StudentProfileManager.js's prefix for
// the unrelated StudentProfiles sheet, and both files share the Central
// Ledger project's global scope. SP_TEACHER_EMAIL=4 here vs. SP_TEACHER_EMAIL=3
// there was a real duplicate-declaration crash, caught by
// tools/gas-lint/check.js, not just a naming coincidence.
const STG_QUEUE_ROW_REF   = 1;
const STG_STUDENT_FILE_ID = 2;
const STG_CONFIG_ID       = 3;
const STG_TEACHER_EMAIL   = 4;  // Added for per-teacher lane routing in Script 06
const STG_STATUS          = 5;  // Shifted from 4 → 5 with TeacherEmail insertion

// ---------------------------------------------------------------------------
// bridgeQueue — moves PENDING ReviewQueue rows to STAGING_PIPELINE
// Deduplication: checks both already-staged refs AND recent queue rows
// for the same fileId to prevent duplicate evaluations from rapid clicks
//
// LOCKED: this runs on a 1-minute time trigger, same as
// 06_StagingPipeline_Turnstile.js's runStagingTurnstile — which already
// takes a lock for exactly this reason, but this function didn't. Apps
// Script does not serialize overlapping trigger firings on its own; if
// one run takes longer than 60 seconds (plausible as ReviewQueue/
// STAGING_PIPELINE grow), a second fires on the same stale
// pre-write snapshot, sees the same PENDING row as not-yet-staged, and
// stages it twice — one student submission gets evaluated twice. Fixed
// by taking the same document lock the Turnstile already uses; a
// congested run stands down instead of racing.
// ---------------------------------------------------------------------------
function bridgeQueue() {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[BRIDGE] Parallel run congestion — standing down.");
    return;
  }

  try {
    const cfg          = getConfig_();
    const ss           = SpreadsheetApp.openById(cfg.adminSsId);
    const queueSheet   = ss.getSheetByName(cfg.tabs.reviewQueue);
    const stagingSheet = ss.getSheetByName(cfg.tabs.stagingPipeline);

    if (!queueSheet || !stagingSheet) {
      Logger.log("[BRIDGE] Missing required tabs.");
      return;
    }

    const queueData   = queueSheet.getDataRange().getValues();
    const stagingData = stagingSheet.getDataRange().getValues();

    // Build set of already-staged QueueRowRefs
    const alreadyStaged = new Set();
    for (let i = 1; i < stagingData.length; i++) {
      alreadyStaged.add(stagingData[i][STG_QUEUE_ROW_REF].toString());
    }

    // Build set of fileIds currently IN_PROCESS or PENDING_INFERENCE in staging
    // This is the deduplication gate — if a doc is already being evaluated,
    // don't stage another request for the same doc
    const inFlight = new Set();
    for (let i = 1; i < stagingData.length; i++) {
      const st = String(stagingData[i][STG_STATUS]).trim();
      // Also treat ERROR_TIMEOUT as in-flight for deduplication purposes
      if (st === "IN_PROCESS" || st === "PENDING_INFERENCE") {
        inFlight.add(stagingData[i][STG_STUDENT_FILE_ID].toString().trim());
      }
    }

    for (let i = 1; i < queueData.length; i++) {
      const row    = queueData[i];
      const status = String(row[RQ_STATUS]).trim();
      if (status !== "PENDING") continue;

      const queueRowRef   = (i + 1).toString();
      const studentFileId = String(row[RQ_FILE_ID]).trim();
      const configId      = String(row[RQ_CONFIG_ID]).trim();
      const googleId      = String(row[RQ_GOOGLE_ID]).trim();

      if (alreadyStaged.has(queueRowRef)) continue;

      // Deduplication: if this doc is already in the evaluation pipeline,
      // mark this queue row as DUPLICATE and skip it
      if (inFlight.has(studentFileId)) {
        markQueueRow_(queueSheet, i + 1, "DUPLICATE");
        Logger.log("[BRIDGE] Duplicate skipped — FileID: " + studentFileId);
        continue;
      }

      if (!studentFileId || !configId || !googleId) {
        markQueueRow_(queueSheet, i + 1, "ERROR: Missing required fields");
        continue;
      }

      // Look up teacher email for per-teacher lane routing in Script 06
      // Read from Ledger using configId as the key
      const teacherEmail = lookupTeacherEmail_(cfg, configId);

      stagingSheet.appendRow([
        new Date(),    // Timestamp
        queueRowRef,   // QueueRowRef
        studentFileId, // StudentFileID
        configId,      // ConfigID
        teacherEmail,  // TeacherEmail — used by Script 06 per-teacher lane routing
        "PENDING_INFERENCE" // Status
      ]);

      // Add to in-flight set immediately so subsequent rows in this same
      // batch don't also get staged for the same doc
      inFlight.add(studentFileId);

      markQueueRow_(queueSheet, i + 1, "STAGED");

      Logger.log("[BRIDGE] Staged — QueueRow: " + queueRowRef +
                 " | FileID: " + studentFileId);
    }
  } catch (err) {
    Logger.log("[BRIDGE] Critical failure: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// backPropagateCompletions — closes out queue/ledger rows and runs
// post-evaluation doc processing (placeholder removal + next-steps)
// This is a backup pass — Studio handles the primary feedback formatting.
//
// LOCKED: same 2-minute-trigger overlap risk as bridgeQueue() above. This
// function already re-reads the queue row's LIVE status right before
// acting (currentQStatus/currentStatus below) rather than trusting the
// stale stagingData snapshot, which narrows the race window — but two
// overlapping runs could still both read "STAGED" before either writes
// "COMPLETE", double-running updateLedgerEvalTimestamp_/
// processCompletedEvaluation_ for the same row. The lock closes that
// window fully instead of narrowing it.
// ---------------------------------------------------------------------------
function backPropagateCompletions() {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[BACKPROP] Parallel run congestion — standing down.");
    return;
  }

  try {
    const cfg          = getConfig_();
    const ss           = SpreadsheetApp.openById(cfg.adminSsId);
    const stagingSheet = ss.getSheetByName(cfg.tabs.stagingPipeline);
    const queueSheet   = ss.getSheetByName(cfg.tabs.reviewQueue);
    const ledgerSs     = SpreadsheetApp.openById(cfg.ledgerSsId);
    const ledgerSheet  = ledgerSs.getSheetByName(cfg.tabs.ledger);

    if (!stagingSheet || !queueSheet || !ledgerSheet) return;

    const stagingData = stagingSheet.getDataRange().getValues();

    for (let i = 1; i < stagingData.length; i++) {
      const stagingStatus = String(stagingData[i][STG_STATUS]).trim();
      const queueRowRef   = stagingData[i][STG_QUEUE_ROW_REF].toString();
      const fileId        = stagingData[i][STG_STUDENT_FILE_ID].toString().trim();
      const configId      = stagingData[i][STG_CONFIG_ID].toString().trim();
      const teacherEmail  = String(stagingData[i][STG_TEACHER_EMAIL] || "").trim();

      // Handle ERROR_TIMEOUT rows — close queue row and notify teacher
      if (stagingStatus === "ERROR_TIMEOUT") {
        const rowNum = parseInt(queueRowRef, 10);
        if (!isNaN(rowNum) && rowNum >= 2) {
          const currentQStatus = String(
            queueSheet.getRange(rowNum, RQ_STATUS + 1).getValue()
          ).trim();
          if (currentQStatus === "STAGED") {
            markQueueRow_(queueSheet, rowNum, "ERROR_TIMEOUT");
            updateLedgerStatus_(ledgerSheet, fileId, configId, "ERROR_TIMEOUT");
            notifyTimeoutToTeacher_(cfg, teacherEmail, fileId, configId);
            Logger.log("[BACKPROP] ERROR_TIMEOUT closed — row " + rowNum +
                       " | Teacher: " + teacherEmail);
          }
        }
        continue;
      }

      if (stagingStatus !== "COMPLETE") continue;

      const rowNum = parseInt(queueRowRef, 10);
      if (isNaN(rowNum) || rowNum < 2) continue;

      const currentStatus = String(
        queueSheet.getRange(rowNum, RQ_STATUS + 1).getValue()
      ).trim();

      if (currentStatus !== "STAGED") continue;

      markQueueRow_(queueSheet, rowNum, "COMPLETE");
      updateLedgerEvalTimestamp_(ledgerSheet, fileId, configId);

      // Post-processing: backup placeholder removal + next-steps block
      // Studio should have handled these already in Flow 2 Steps 4-5,
      // but this catches any cases where Studio's doc connector step failed
      processCompletedEvaluation_(fileId, configId);

      Logger.log("[BACKPROP] Processed row " + rowNum + " | FileID: " + fileId);
    }
  } catch (err) {
    Logger.log("[BACKPROP] Critical failure: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// processCompletedEvaluation_
// ---------------------------------------------------------------------------
function processCompletedEvaluation_(fileId, configId) {
  try {
    const doc  = DocumentApp.openById(fileId);
    const body = doc.getBody();
    const text = body.getText();

    // Only process if placeholder is still present (Studio may have removed it)
    const needsProcessing = text.indexOf("[No feedback yet.") !== -1;
    if (!needsProcessing) {
      // Also check if next-steps block is missing even without placeholder
      const hasNextSteps = text.indexOf("WHAT TO DO NEXT") !== -1;
      if (hasNextSteps) {
        Logger.log("[09] Already processed — " + configId);
        return;
      }
    }

    removePlaceholder_(body);

    const complianceResult = text.indexOf("[SYSTEM: APPROVED]") !== -1
      ? "APPROVED" : "REVISION_REQUIRED";

    // Only append next-steps if not already present
    if (text.indexOf("WHAT TO DO NEXT") === -1) {
      appendNextSteps_(body, complianceResult);
    }

    doc.saveAndClose();
    Logger.log("[09] Post-processing complete — " + configId +
               " | " + complianceResult);
  } catch (err) {
    Logger.log("[09] Error — FileID: " + fileId + " | " + err.message);
  }
}

// ---------------------------------------------------------------------------
// removePlaceholder_
// ---------------------------------------------------------------------------
function removePlaceholder_(body) {
  const result = body.findText("\\[No feedback yet\\.");
  if (!result) return;
  try { result.getElement().getParent().removeFromParent(); } catch (e) {}
}

// ---------------------------------------------------------------------------
// appendNextSteps_
// ---------------------------------------------------------------------------
function appendNextSteps_(body, complianceResult) {
  const result = body.findText("── END EVALUATION ──");
  const text   = buildNextStepsText_(complianceResult);
  if (!result) { body.appendParagraph(text); return; }
  const idx = body.getChildIndex(result.getElement().getParent());
  body.insertParagraph(idx + 1, text);
}

// ---------------------------------------------------------------------------
// buildNextStepsText_
// ---------------------------------------------------------------------------
function buildNextStepsText_(complianceResult) {
  if (complianceResult === "APPROVED") {
    return (
      "\n" +
      "──────────────────────────────────────────────────\n" +
      "✅  WHAT TO DO NEXT\n" +
      "──────────────────────────────────────────────────\n\n" +
      "Your work meets the standard. Here's what to do:\n\n" +
      "  1. Read the feedback above to understand your strengths.\n" +
      "  2. Make any final polish edits you feel are needed.\n" +
      "  3. Submit your work using the Turn-In Form your teacher provided.\n\n" +
      "⚠️  Do not delete or edit any evaluation report in this document.\n" +
      "    It is part of your verified submission record.\n"
    );
  }
  return (
    "\n" +
    "──────────────────────────────────────────────────\n" +
    "✏️   WHAT TO DO NEXT\n" +
    "──────────────────────────────────────────────────\n\n" +
    "Your work needs revision before you can submit. Here's what to do:\n\n" +
    "  1. Read the REQUIRED REVISIONS list above carefully.\n" +
    "  2. Update your response below the\n" +
    "     ── YOUR RESPONSE BEGINS HERE ── line.\n" +
    "  3. When ready, click:\n" +
    "     📊 AI Evaluation Panel → Run Assignment Check\n" +
    "  4. Repeat until you see a ✅ passing result.\n\n" +
    "💡  You can run as many checks as you need — no penalty for revising.\n" +
    "⚠️  Do not submit via the Turn-In Form until you see a ✅ passing result.\n"
  );
}

// ---------------------------------------------------------------------------
// lookupTeacherEmail_ — finds teacher email for a given configId in the Ledger
// Used by bridgeQueue to stamp TeacherEmail onto staging rows for lane routing
// ---------------------------------------------------------------------------
function lookupTeacherEmail_(cfg, configId) {
  try {
    const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
    const sheet    = ledgerSs.getSheetByName(cfg.tabs.ledger);
    const data     = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][L_CONFIG_ID]).trim() === configId) {
        return String(data[i][8] || "").trim(); // col 8 = TeacherEmail
      }
    }
  } catch (e) {
    Logger.log("[BRIDGE] lookupTeacherEmail_ error: " + e.message);
  }
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// notifyTimeoutToTeacher_ — emails teacher when an evaluation times out
// so they can re-queue the student rather than waiting indefinitely
// ---------------------------------------------------------------------------
function notifyTimeoutToTeacher_(cfg, teacherEmail, fileId, configId) {
  if (!teacherEmail || teacherEmail === "UNKNOWN") return;
  try {
    MailApp.sendEmail(
      teacherEmail,
      "⚠️ Evaluation Timeout — Student Assignment",
      "An automated evaluation did not complete within the expected time window " +
      "and has been cleared from the queue.\n\n" +
      "Assignment Config ID: " + configId + "\n" +
      "Document ID: " + fileId + "\n\n" +
      "What to do:\n" +
      "  1. Ask the student to reopen their document\n" +
      "  2. Have them click: 📊 AI Evaluation Panel → Run Assignment Check\n" +
      "  3. Their request will be re-queued automatically\n\n" +
      "If this keeps happening for the same student, contact your system admin.\n\n" +
      "— Assignment System (automated alert)"
    );
  } catch (e) {
    Logger.log("[BACKPROP] notifyTimeoutToTeacher_ error: " + e.message);
  }
}

// ---------------------------------------------------------------------------
// markQueueRow_
// ---------------------------------------------------------------------------
function markQueueRow_(sheet, rowNumber, status) {
  sheet.getRange(rowNumber, RQ_STATUS + 1).setValue(status);
}

// ---------------------------------------------------------------------------
// updateLedgerEvalTimestamp_
// ---------------------------------------------------------------------------
function updateLedgerEvalTimestamp_(ledgerSheet, fileId, configId) {
  const data = ledgerSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (
      String(data[i][L_FILE_ID]).trim()   === fileId &&
      String(data[i][L_CONFIG_ID]).trim() === configId
    ) {
      ledgerSheet.getRange(i + 1, L_LAST_EVAL + 1).setValue(new Date());
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// updateLedgerStatus_ (external UX audit)
// ---------------------------------------------------------------------------
// The ERROR_TIMEOUT branch above used to update only STAGING_PIPELINE and
// ReviewQueue, never the Ledger — so the student's own fetchStatus_()/
// buildStatusMessage_() (01_StudentDoc_ContainerScript.js) kept reading
// whatever pre-timeout status (STAGED/PENDING) was last written there,
// showing "Being Evaluated Right Now... within the next 1-3 minutes"
// indefinitely, and the Teacher Dashboard's resolveDisplay_() (keyed off
// this same column) never flagged the row either. Writing the status here
// lights up both of those already-built, already-tested consumers with
// no changes needed on their end.
function updateLedgerStatus_(ledgerSheet, fileId, configId, status) {
  const data = ledgerSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (
      String(data[i][L_FILE_ID]).trim()   === fileId &&
      String(data[i][L_CONFIG_ID]).trim() === configId
    ) {
      ledgerSheet.getRange(i + 1, L_STATUS + 1).setValue(status);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// markQueueRowComplete
// ---------------------------------------------------------------------------
function markQueueRowComplete(queueRowRef) {
  const cfg        = getConfig_();
  const ss         = SpreadsheetApp.openById(cfg.adminSsId);
  const sheet      = ss.getSheetByName(cfg.tabs.reviewQueue);
  const rowNumber  = parseInt(queueRowRef, 10);
  if (isNaN(rowNumber) || rowNumber < 2) return;
  sheet.getRange(rowNumber, RQ_STATUS + 1).setValue("COMPLETE");
}
