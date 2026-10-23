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
const RQ_STUDENT_TEXT = 4; // always emptied; see bridgeQueue()
const RQ_STATUS    = 5;

// STAGING_PIPELINE column indices (0-based)
// Schema: Timestamp | QueueRowRef | StudentFileID | ConfigID | TeacherEmail | Status
// Prefixed STG_ (not SP_) — SP_ is 23_StudentProfileManager.js's prefix for
// the unrelated StudentProfiles sheet, and both files share the Central
// Ledger project's global scope. SP_TEACHER_EMAIL=4 here vs. SP_TEACHER_EMAIL=3
// there was a real duplicate-declaration crash, caught by
// tools/gas-lint/check.js, not just a naming coincidence.
const STG_TIMESTAMP       = 0;
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

    // Student writing never stays in ReviewQueue: nothing reads it (Flow 2
    // reads the student's Doc). The Student Dashboard no longer stores it,
    // but docs made before the 01 change still append it here directly
    // from their own menu, so empty the column whenever any row has some.
    if (queueData.slice(1).some(r => String(r[RQ_STUDENT_TEXT]).trim() !== "")) {
      queueSheet.getRange(2, RQ_STUDENT_TEXT + 1, queueData.length - 1, 1)
        .setValues(queueData.slice(1).map(() => [""]));
      Logger.log("[BRIDGE] Emptied student text from ReviewQueue.");
    }

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

      // Handle ERROR_TIMEOUT rows (the lane timed out, 06) and
      // ERROR_EVALUATION rows (the check ran but its result couldn't be
      // used, 37): close the queue row, tell the teacher why, and set the
      // doc's header so the student isn't told "waiting for feedback" for
      // good (2026-10-22, UX audit fix-first 4).
      if (stagingStatus === "ERROR_TIMEOUT" || stagingStatus === "ERROR_EVALUATION") {
        const rowNum = parseInt(queueRowRef, 10);
        if (!isNaN(rowNum) && rowNum >= 2) {
          const currentQStatus = String(
            queueSheet.getRange(rowNum, RQ_STATUS + 1).getValue()
          ).trim();
          if (currentQStatus === "STAGED") {
            markQueueRow_(queueSheet, rowNum, stagingStatus);
            updateLedgerStatus_(ledgerSheet, fileId, configId, stagingStatus);
            if (stagingStatus === "ERROR_TIMEOUT") {
              notifyTimeoutToTeacher_(cfg, teacherEmail, fileId, configId, ledgerSheet);
            } else {
              notifyFailedCheckToTeacher_(cfg, teacherEmail, fileId, configId, ledgerSheet);
            }
            setDocFeedbackStatus_(fileId, stagingStatus === "ERROR_TIMEOUT" ? "TIMED_OUT" : "NOT_CHECKED", {});
            Logger.log("[BACKPROP] " + stagingStatus + " closed — row " + rowNum +
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

      // A result can land after the timeout branch above already closed the
      // queue row (a slow Studio run, or one started by hand). The harvest
      // then marks staging COMPLETE, so finish the queue and Ledger rows
      // too; otherwise they stay at ERROR_TIMEOUT for good.
      const late = currentStatus === "ERROR_TIMEOUT";
      if (currentStatus !== "STAGED" && !late) continue;

      markQueueRow_(queueSheet, rowNum, "COMPLETE");
      updateLedgerEvalTimestamp_(ledgerSheet, fileId, configId);
      markLedgerEvaluated_(ledgerSheet, fileId, configId);

      // Post-processing: backup placeholder removal + next-steps block
      // Studio should have handled these already in Flow 2 Steps 4-5,
      // but this catches any cases where Studio's doc connector step failed
      processCompletedEvaluation_(fileId, configId);

      Logger.log("[BACKPROP] Processed row " + rowNum + (late ? " (arrived after its timeout)" : "") +
                 " | FileID: " + fileId);
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

    // Feedback as a comment (FEEDBACK_AS_COMMENT, 00): its next steps ride in
    // the comment and the result is on the Ledger, so nothing is added here.
    // An older doc still has the zone's placeholder, which says feedback
    // appears in the document; clear it.
    if (feedbackAsCommentFor_(configId)) {
      if (text.indexOf("[No feedback yet.") !== -1) {
        removePlaceholder_(body);
        doc.saveAndClose();
      }
      return;
    }

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

    // P0-03: Studio reads the doc when it evaluates, not when the student
    // submits, so text added after the dashboard's check still reaches
    // Flow 2. Flag it for the operator, and judge the result only from text
    // outside the response zone, so a typed "[SYSTEM: APPROVED]" there can't
    // decide which next steps are added.
    const zone = responseZoneBounds_(text);
    const typed = zone ? findSystemText_(text.substring(zone.from, zone.to)) : "";
    if (typed) {
      Logger.log("[09] WARNING — ConfigID " + configId + ": the response zone contains " +
                 "system text (" + typed + "). Check this evaluation by hand.");
    }
    const outsideZone = zone ? text.substring(0, zone.from) + text.substring(zone.to) : text;
    const complianceResult = outsideZone.indexOf("[SYSTEM: APPROVED]") !== -1
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

// The student's response zone in a doc's text: from the response marker to
// the first system end marker, the same span 01's extractStudentResponse_()
// and 13's dashExtractResponse_() read. { from, to }, or null with no marker.
const BRIDGE_RESPONSE_MARKER = "── YOUR RESPONSE BEGINS HERE ──"; // 01's RESPONSE_MARKER

function responseZoneBounds_(fullText) {
  const start = fullText.indexOf(BRIDGE_RESPONSE_MARKER);
  if (start === -1) return null;
  const from = start + BRIDGE_RESPONSE_MARKER.length;
  const ends = [fullText.indexOf("[CONFIG_ID:", from), fullText.indexOf("[SYS_LEDGER_SS_ID:", from)]
    .filter(n => n !== -1);
  return { from: from, to: ends.length > 0 ? Math.min.apply(null, ends) : fullText.length };
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
// Students submit from their Student Dashboard (the doc's menu doesn't run
// for student accounts) and turn in on Canvas, which is where grades are
// given. A passing result suggests turning in without requiring it, and
// still offers another check; turning in before it passes is allowed (the
// teacher sees the latest result in the doc).
// 37_FlowInputBuilder.js puts this in every evaluation block it writes, so
// each one carries its own next steps.
// Never quote the response marker line itself (the dashes and all) in this
// text: 37 inserts the block into the feedback zone, above the real marker,
// and 01/13's extractors and responseZoneBounds_() take the first match, so
// a quote here would pull the whole assignment into the "response".
function buildNextStepsText_(complianceResult) {
  if (complianceResult === "APPROVED") {
    return (
      "\n" +
      "──────────────────────────────────────────────────\n" +
      "✅  WHAT TO DO NEXT\n" +
      "──────────────────────────────────────────────────\n\n" +
      "Your work meets the standard. You have two choices:\n\n" +
      "  • Done with it? Turn it in on Canvas: copy this document's link, open\n" +
      "    the Canvas assignment, choose Start Assignment → Website URL and paste it.\n" +
      "  • Want to make it stronger? Keep revising, then open your assignment\n" +
      "    dashboard (the link is near the top of this document) and click\n" +
      "    Submit for Feedback again.\n\n" +
      "⚠️  Do not delete or edit the feedback in this document.\n" +
      "    It is part of your record.\n"
    );
  }
  return (
    "\n" +
    "──────────────────────────────────────────────────\n" +
    "✏️   WHAT TO DO NEXT\n" +
    "──────────────────────────────────────────────────\n\n" +
    "Your work needs revision. Here's what to do:\n\n" +
    "  1. Read the REQUIRED REVISIONS list above carefully.\n" +
    "  2. Update your response below the\n" +
    "     \"YOUR RESPONSE BEGINS HERE\" line.\n" +
    "  3. Open your assignment dashboard (the link is near the top of this\n" +
    "     document) and click Submit for Feedback.\n" +
    "  4. Repeat until you see a ✅ passing result.\n\n" +
    "💡  You can check as many times as you need — no penalty for revising.\n"
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
function notifyTimeoutToTeacher_(cfg, teacherEmail, fileId, configId, ledgerSheet) {
  if (!teacherEmail || teacherEmail === "UNKNOWN") return;
  // Names the student and lesson and links the doc (2026-10-22): the email
  // used to give only the ConfigID and Document ID.
  let studentName = "", lessonName = "", docUrl = "";
  try {
    const rows = ledgerSheet ? ledgerSheet.getDataRange().getValues() : [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][LEDGER.FILE_ID]).trim() !== fileId) continue;
      studentName = String(rows[i][LEDGER.STUDENT_NAME] || "").trim();
      lessonName  = String(rows[i][LEDGER.COURSE_NAME] || "").trim();
      docUrl      = String(rows[i][LEDGER.STUDENT_FILE_URL] || "").trim();
      break;
    }
  } catch (e) {
    Logger.log("[BACKPROP] notifyTimeoutToTeacher_ lookup error: " + e.message);
  }
  if (!docUrl && fileId) docUrl = "https://docs.google.com/document/d/" + fileId + "/edit";
  const who  = studentName || "A student";
  const what = lessonName ? " on " + lessonName : "";
  const dashboardUrl = (cfg && cfg.teacherDashboardUrl) || "";
  try {
    MailApp.sendEmail(
      teacherEmail,
      "⚠️ Feedback didn't finish — " + who + (lessonName ? ", " + lessonName : ""),
      who + "'s work" + what + " was sent to be checked, but the check didn't " +
      "finish in time, so it was taken out of line. Your Teacher Dashboard shows it " +
      "as \"Couldn't be checked ⚠\".\n\n" +
      (docUrl ? "Student's doc: " + docUrl + "\n" : "") +
      (dashboardUrl ? "Teacher Dashboard: " + dashboardUrl + "\n" : "") +
      "\n" +
      // The doc's own menu doesn't run for student accounts (2026-10-19).
      // A late result still lands (backprop finishes an ERROR_TIMEOUT row),
      // and while the doc's FlowInput row is READY a resubmission builds no
      // new one, so restarting the check comes first.
      "What to do (the student doesn't need to do anything yet):\n" +
      "  1. In the Central Ledger, open the FlowInput tab and find this doc's row\n" +
      "     (search for its Document ID: " + fileId + ").\n" +
      "  2. If its ReadyStatus cell says READY, type READY into that cell again. That\n" +
      "     restarts the check; the feedback lands and the student's status updates by\n" +
      "     itself, even late.\n" +
      "  3. If the cell is blank, starts with ERROR_, or the row isn't there, ask the student\n" +
      "     to press Submit for Feedback again on the Student Dashboard.\n\n" +
      "Don't use the Admin Recovery Panel reset for this: the feedback would arrive twice.\n" +
      "If this keeps happening, tell your system admin and give them this code: " + configId + "\n\n" +
      "— Classroom Agency System (automated alert)"
    );
  } catch (e) {
    Logger.log("[BACKPROP] notifyTimeoutToTeacher_ error: " + e.message);
  }
}

// The student and lesson for a doc, from the Ledger: { studentName,
// lessonName, docUrl }, blanks when the row isn't found.
function _bridgeDocContext_(ledgerSheet, fileId) {
  const out = { studentName: "", lessonName: "", docUrl: "" };
  try {
    const rows = ledgerSheet ? ledgerSheet.getDataRange().getValues() : [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][LEDGER.FILE_ID]).trim() !== fileId) continue;
      out.studentName = String(rows[i][LEDGER.STUDENT_NAME] || "").trim();
      out.lessonName  = String(rows[i][LEDGER.COURSE_NAME] || "").trim();
      out.docUrl      = String(rows[i][LEDGER.STUDENT_FILE_URL] || "").trim();
      break;
    }
  } catch (e) {
    Logger.log("[BACKPROP] doc context lookup error: " + e.message);
  }
  if (!out.docUrl && fileId) out.docUrl = "https://docs.google.com/document/d/" + fileId + "/edit";
  return out;
}

// notifyFailedCheckToTeacher_ — the check ran, but its result couldn't be
// used (37: empty output, a result that didn't fit the assignment, or a
// failed harvest). A resubmission gets a fresh check (37's
// buildFlowInputRows), so the fix is the student's Submit (2026-10-22).
function notifyFailedCheckToTeacher_(cfg, teacherEmail, fileId, configId, ledgerSheet) {
  if (!teacherEmail || teacherEmail === "UNKNOWN") return;
  const c = _bridgeDocContext_(ledgerSheet, fileId);
  const who = c.studentName || "A student";
  const dashboardUrl = (cfg && cfg.teacherDashboardUrl) || "";
  try {
    MailApp.sendEmail(
      teacherEmail,
      "⚠️ Feedback couldn't be made — " + who + (c.lessonName ? ", " + c.lessonName : ""),
      who + "'s work" + (c.lessonName ? " on " + c.lessonName : "") + " was checked, but the " +
      "result couldn't be used (it was empty, or didn't match the assignment), so no feedback " +
      "was sent. Your Teacher Dashboard shows it as \"Couldn't be checked ⚠\", and the " +
      "student's doc says it couldn't be checked this time.\n\n" +
      (c.docUrl ? "Student's doc: " + c.docUrl + "\n" : "") +
      (dashboardUrl ? "Teacher Dashboard: " + dashboardUrl + "\n" : "") +
      "\nWhat to do: ask the student to press Submit for Feedback again on the Student " +
      "Dashboard. That starts a fresh check.\n\n" +
      "If it happens again for the same work, tell your system admin and give them this code: " +
      configId + "\n\n" +
      "— Classroom Agency System (automated alert)"
    );
  } catch (e) {
    Logger.log("[BACKPROP] notifyFailedCheckToTeacher_ error: " + e.message);
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
// markLedgerEvaluated_ — an evaluation came back, so the Ledger row moves to
// COMPLETE ("Feedback is ready" on the Student Dashboard). Nothing
// set it before, so a student's card still read "Not started yet" after
// feedback arrived. Only from a not-yet-evaluated state: a turned-in or
// archived row keeps its status.
// ---------------------------------------------------------------------------
function markLedgerEvaluated_(ledgerSheet, fileId, configId) {
  const data = ledgerSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][L_FILE_ID]).trim() === fileId &&
        String(data[i][L_CONFIG_ID]).trim() === configId) {
      const status = String(data[i][L_STATUS]).trim();
      if (status === "ACTIVE" || status === "PENDING" || status === "STAGED" ||
          status === "ERROR_TIMEOUT" || status === "") {
        ledgerSheet.getRange(i + 1, L_STATUS + 1).setValue("COMPLETE");
      }
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
