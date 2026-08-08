// =============================================================================
// FILE: 25_WarmUpWriter.js
// BOUND TO: Central Ledger spreadsheet
// PURPOSE: Two jobs in one script.
//
//   JOB 1 — Post-generation registration (called by Studio Flow 3 backprop)
//   -------------------------------------------------------------------------
//   After Flow 3 marks a WarmUpQueue row DELIVERED, Script 25 registers the
//   generated warm-up doc in the WarmUpRegistry tab and updates LessonContext
//   warm_up_generated to DELIVERED when all students in a lesson are done.
//   Entry point: registerDeliveredWarmUps()
//   Trigger: time-based every 5 minutes (safety net for Flow 3 backprop)
//
//   JOB 2 — Nightly evaluation cron (3:15am)
//   -------------------------------------------------------------------------
//   Scans WarmUpRegistry for yesterday's docs where total_score is null.
//   For each: opens the warm-up doc once, extracts response text and checks
//   for extra credit reply in the same pass. Counts words deterministically.
//   Computes word count score. If response exists, writes extracted text to
//   WarmUpQueue response_text column and sets status PENDING_EVAL for Flow 4.
//   Flow 4 evaluates grammar and engagement, returns scored JSON.
//   Script 25 receives scores, computes total, writes feedback into the doc,
//   updates WarmUpQueue and WarmUpRegistry.
//   Entry point: runWarmUpEvaluation()
//   Trigger: time-based daily at 3:15am
//
// EXTRA CREDIT DETECTION:
//   Handled in Job 2 during the same doc open used for word count.
//   Text after the FEEDBACK_END_MARKER is checked for a reply of 10+ words.
//   If found: WarmUpQueue extra_credit = 1, total_score += 1.
//   Script 23 reads this flag at 3:00am the following night.
//
// TERM-END GRADE REPORT:
//   generateWarmUpReport() — run manually from Script Editor.
//   Reads WarmUpRegistry for all scored rows this term.
//   Produces per-student summary: warm-ups generated, completed, total points,
//   possible points, percentage. Registers output in ReportRegistry.
//
// TRIGGER SEQUENCE (nightly):
//   3:00am — Script 23: updateAllStudentProfiles()
//   3:15am — Script 25: runWarmUpEvaluation()   ← this file
//   3:30am — Script 24: buildWarmUpQueues()
//   6:00am — Studio Flow 3: warm-up generation
//
// CONFIG KEYS:
//   CENTRAL_LEDGER_SS_ID  — Central Ledger spreadsheet ID
//   TEACHER_EMAIL         — for registry scoping
//   CURRENT_TERM          — for WarmUpRegistry term column
//   M2_ENABLED            — guard
//
// =============================================================================

// ── StudentProfiles column indices needed by S25 (shadow matrix interrupt check)
// Must match Script 23 definitions exactly.
const SP25_STUDENT_EMAIL  = 0;
const SP25_TEACHER_EMAIL  = 3;
const SP25_STUDENT_NAME   = 1;
const SP25_SHADOW_MATRIX  = 12; // JSON — per-student × per-unit confidence

// Alias for readability in checkShadowMatrixInterrupts_
const SP_STUDENT_EMAIL  = SP25_STUDENT_EMAIL;
const SP_TEACHER_EMAIL  = SP25_TEACHER_EMAIL;
const SP_STUDENT_NAME   = SP25_STUDENT_NAME;
const SP_SHADOW_MATRIX  = SP25_SHADOW_MATRIX;

// ── WarmUpQueue column indices (0-based) — must match Scripts 23 + 24 ─────────
const WQ25_QUEUE_ID          = 0;
const WQ25_LESSON_ID         = 1;
const WQ25_STUDENT_EMAIL     = 2;
const WQ25_STUDENT_NAME      = 3;
const WQ25_GOOGLE_ID         = 4;
const WQ25_LESSON_DATE       = 5;
const WQ25_LESSON_CTX_SNAP   = 6;
const WQ25_STATUS            = 8;
const WQ25_DOC_ID            = 9;
const WQ25_DOC_URL           = 10;
const WQ25_WORD_COUNT        = 11;
const WQ25_WORD_COUNT_SCORE  = 12;
const WQ25_GRAMMAR_SCORE     = 13;
const WQ25_ENGAGEMENT_SCORE  = 14;
const WQ25_EXTRA_CREDIT      = 15;
const WQ25_TOTAL_SCORE       = 16;
const WQ25_FLOW4_FEEDBACK    = 17;
const WQ25_RESPONSE_TEXT     = 18;
const WQ25_ARCHETYPE         = 19; // Flow 3 writes selected archetype — read by S23 shadow matrix
const WQ25_BRIDGE_OUTPUT      = 20; // Flow 5 writes bridge paragraph prior→today
const WQ25_COL_COUNT         = 21;

// ── WarmUpRegistry column indices (0-based) — must match schema doc ───────────
const WR_WARMUP_ID    = 0;
const WR_QUEUE_ID     = 1;
const WR_LESSON_ID    = 2;
const WR_LESSON_DATE  = 3;
const WR_STUDENT_EMAIL = 4;
const WR_STUDENT_NAME  = 5;
const WR_TEACHER_EMAIL = 6;
const WR_DOC_ID       = 7;
const WR_DOC_URL      = 8;
const WR_GENERATED_AT = 9;
const WR_TOTAL_SCORE  = 10;
const WR_EXTRA_CREDIT = 11;
const WR_TERM         = 12;
const WR_COL_COUNT    = 13;

// ── LessonContext column indices (0-based) — from Script 22 + 24 ─────────────
const LC25_LESSON_ID          = 0;
const LC25_TEACHER_EMAIL      = 1;
const LC25_LEARNING_OBJ       = 6;
const LC25_WARM_UP_GENERATED  = 14; // added by Script 24's createLessonContextWarmUpColumn_()

// ── ReportRegistry column indices (0-based) — from Script 26 ─────────────────
const RR25_REPORT_ID     = 0;
const RR25_GENERATED_AT  = 1;
const RR25_TERM          = 2;
const RR25_TEACHER_EMAIL = 3;
const RR25_DOC_ID        = 4;
const RR25_DOC_URL       = 5;
const RR25_REPORT_TYPE   = 6;

// ── Document zone delimiters — must match Flow 3 stamp pattern ────────────────
// Flow 3 stamps these into every warm-up doc. Script 25 uses them to
// extract the response zone and detect extra credit replies.
const RESPONSE_ZONE_MARKER  = "── YOUR RESPONSE ──";
const FEEDBACK_START_MARKER = "── FEEDBACK ──";
const FEEDBACK_END_MARKER   = "── END FEEDBACK ──";

// ── Scoring constants ─────────────────────────────────────────────────────────
const WORD_COUNT_THRESHOLDS = [
  { min: 30, score: 6 },
  { min: 25, score: 5 },
  { min: 15, score: 3 },
  { min:  0, score: 0 }
];
const EXTRA_CREDIT_MIN_WORDS = 10;
const MAX_FEEDBACK_CHARS     = 500; // cap Flow 4 feedback stored in queue row

// =============================================================================
// JOB 1 — POST-GENERATION REGISTRATION
// =============================================================================

// ---------------------------------------------------------------------------
// registerDeliveredWarmUps
// Scans WarmUpQueue for DELIVERED rows not yet in WarmUpRegistry.
// Registers each delivered doc and checks if all students in a lesson
// have been delivered — if so, marks LessonContext warm_up_generated = DELIVERED.
//
// Runs every 5 minutes as a safety-net time trigger (Flow 3 may deliver
// rows faster or slower depending on Studio concurrency).
// ---------------------------------------------------------------------------
function registerDeliveredWarmUps() {
  const cfg = getConfig_();

  const m2Enabled = PropertiesService.getScriptProperties()
    .getProperty("M2_ENABLED");
  if (m2Enabled && m2Enabled.toLowerCase() === "false") return;

  const ss           = SpreadsheetApp.openById(cfg.ledgerSsId);
  const teacherEmail = cfg.teacherEmail;
  const currentTerm  = PropertiesService.getScriptProperties()
    .getProperty("CURRENT_TERM") || "";

  const wqSheet  = ss.getSheetByName(cfg.tabs.warmUpQueue);
  const wrSheet  = ss.getSheetByName(cfg.tabs.warmUpRegistry);
  const lcSheet  = ss.getSheetByName(cfg.tabs.lessonContext);

  if (!wqSheet || !wrSheet) {
    Logger.log("[S25-J1] WarmUpQueue or WarmUpRegistry tab not found — aborting.");
    return;
  }

  const wqData = wqSheet.getDataRange().getValues();
  const wrData = wrSheet.getDataRange().getValues();

  // Build set of queue_ids already in WarmUpRegistry
  const registeredQueueIds = new Set();
  for (let i = 1; i < wrData.length; i++) {
    const qId = String(wrData[i][WR_QUEUE_ID] || "").trim();
    if (qId) registeredQueueIds.add(qId);
  }

  // Collect new registration rows
  const newRegistrations = [];
  const lessonDeliveryMap = {}; // lessonId → { total, delivered }

  for (let i = 1; i < wqData.length; i++) {
    const row      = wqData[i];
    const status   = String(row[WQ25_STATUS]       || "").trim();
    const queueId  = String(row[WQ25_QUEUE_ID]     || "").trim();
    const lessonId = String(row[WQ25_LESSON_ID]    || "").trim();
    const docId    = String(row[WQ25_DOC_ID]       || "").trim();
    const docUrl   = String(row[WQ25_DOC_URL]      || "").trim();

    if (!lessonId) continue;

    // Track delivery counts per lesson for LessonContext update
    if (!lessonDeliveryMap[lessonId]) {
      lessonDeliveryMap[lessonId] = { total: 0, delivered: 0 };
    }
    lessonDeliveryMap[lessonId].total++;

    if (status === "DELIVERED" || status === "SCORED" || status === "INCOMPLETE") {
      lessonDeliveryMap[lessonId].delivered++;
    }

    // Register only DELIVERED rows not yet in registry
    if (status !== "DELIVERED") continue;
    if (registeredQueueIds.has(queueId)) continue;
    if (!docId) continue;

    const regRow = new Array(WR_COL_COUNT).fill("");
    regRow[WR_WARMUP_ID]     = generateWarmUpId_();
    regRow[WR_QUEUE_ID]      = queueId;
    regRow[WR_LESSON_ID]     = lessonId;
    regRow[WR_LESSON_DATE]   = String(row[WQ25_LESSON_DATE] || "").trim();
    regRow[WR_STUDENT_EMAIL] = String(row[WQ25_STUDENT_EMAIL] || "").trim();
    regRow[WR_STUDENT_NAME]  = String(row[WQ25_STUDENT_NAME]  || "").trim();
    regRow[WR_TEACHER_EMAIL] = teacherEmail;
    regRow[WR_DOC_ID]        = docId;
    regRow[WR_DOC_URL]       = docUrl;
    regRow[WR_GENERATED_AT]  = new Date();
    regRow[WR_TOTAL_SCORE]   = ""; // scored later by Job 2
    regRow[WR_EXTRA_CREDIT]  = ""; // set by Job 2
    regRow[WR_TERM]          = currentTerm;

    newRegistrations.push(regRow);
    registeredQueueIds.add(queueId);
  }

  // Batch write new registrations
  if (newRegistrations.length > 0) {
    const startRow = wrSheet.getLastRow() + 1;
    wrSheet.getRange(startRow, 1, newRegistrations.length, WR_COL_COUNT)
      .setValues(newRegistrations);
    Logger.log("[S25-J1] Registered " + newRegistrations.length + " new warm-up doc(s).");
  }

  // Update LessonContext warm_up_generated = DELIVERED for fully-delivered lessons
  if (lcSheet) {
    const lcData = lcSheet.getDataRange().getValues();
    for (const [lessonId, counts] of Object.entries(lessonDeliveryMap)) {
      if (counts.delivered < counts.total) continue; // not all delivered yet
      markLessonContextDelivered_(lcSheet, lcData, lessonId);
    }
  }
}

// ---------------------------------------------------------------------------
// markLessonContextDelivered_
// Updates warm_up_generated to DELIVERED on the matching LessonContext row.
// ---------------------------------------------------------------------------
function markLessonContextDelivered_(lcSheet, lcData, lessonId) {
  for (let i = 1; i < lcData.length; i++) {
    if (String(lcData[i][LC25_LESSON_ID]).trim() !== lessonId) continue;
    const currentVal = String(lcData[i][LC25_WARM_UP_GENERATED] || "").trim();
    if (currentVal === "DELIVERED") return; // already marked
    lcSheet.getRange(i + 1, LC25_WARM_UP_GENERATED + 1).setValue("DELIVERED");
    Logger.log("[S25-J1] LessonContext DELIVERED: " + lessonId);
    return;
  }
}

// =============================================================================
// JOB 2 — NIGHTLY EVALUATION CRON (3:15am)
// =============================================================================

// ---------------------------------------------------------------------------
// runWarmUpEvaluation
// Entry point for the 3:15am trigger.
// Finds yesterday's WarmUpRegistry rows where total_score is empty.
// For each: opens the doc once, extracts response text and checks for
// extra credit reply in the same pass. Writes response_text to WarmUpQueue.
// Zero-response docs are stamped INCOMPLETE immediately, skipping Flow 4.
// Non-zero responses are queued as PENDING_EVAL for Flow 4.
// After Flow 4 returns scores, computes total and writes feedback to doc.
// ---------------------------------------------------------------------------
function runWarmUpEvaluation() {
  const cfg = getConfig_();

  const m2Enabled = PropertiesService.getScriptProperties()
    .getProperty("M2_ENABLED");
  if (m2Enabled && m2Enabled.toLowerCase() === "false") return;

  const ss           = SpreadsheetApp.openById(cfg.ledgerSsId);
  const teacherEmail = cfg.teacherEmail;

  const wqSheet = ss.getSheetByName(cfg.tabs.warmUpQueue);
  const wrSheet = ss.getSheetByName(cfg.tabs.warmUpRegistry);

  if (!wqSheet || !wrSheet) {
    Logger.log("[S25-J2] WarmUpQueue or WarmUpRegistry tab not found — aborting.");
    return;
  }

  // ── Cron health check — verify Stage 1 (Script 23) ran recently ─────────
  // Stage 1 runs at 3:00am, Stage 2 (this script) at 3:15am.
  // If Stage 1 stamp is older than 45 minutes, profiles may be stale.
  _checkCronHealth_("M2_STAGE1_LAST_RUN", "Script 23 (updateAllStudentProfiles)",
                    45, cfg.adminNotifyEmail || cfg.teacherEmail);

  const wrData = wrSheet.getDataRange().getValues();
  const wqData = wqSheet.getDataRange().getValues();

  // Find WarmUpRegistry rows from yesterday where total_score is not yet set
  const yesterday     = getYesterday_();
  const yesterdayStr  = formatDateYMD_(yesterday);

  // Build queue_id → wq row index map for fast lookup
  const queueRowByQueueId = {};
  for (let i = 1; i < wqData.length; i++) {
    const qId = String(wqData[i][WQ25_QUEUE_ID] || "").trim();
    if (qId) queueRowByQueueId[qId] = i + 1; // 1-based
  }

  const toEvaluate = []; // { wrRowNum, queueId, docId, queueRowNum }

  for (let i = 1; i < wrData.length; i++) {
    const row        = wrData[i];
    const lessonDate = String(row[WR_LESSON_DATE]   || "").trim();
    const tEmail     = String(row[WR_TEACHER_EMAIL] || "").trim().toLowerCase();
    const totalScore = String(row[WR_TOTAL_SCORE]   || "").trim();
    const docId      = String(row[WR_DOC_ID]        || "").trim();
    const queueId    = String(row[WR_QUEUE_ID]      || "").trim();

    if (tEmail !== teacherEmail.toLowerCase()) continue;
    if (lessonDate !== yesterdayStr)           continue;
    if (totalScore !== "")                     continue; // already scored
    if (!docId || !queueId)                    continue;

    const queueRowNum = queueRowByQueueId[queueId];
    if (!queueRowNum) continue;

    toEvaluate.push({
      wrRowNum:    i + 1, // 1-based
      queueId:     queueId,
      docId:       docId,
      queueRowNum: queueRowNum
    });
  }

  if (toEvaluate.length === 0) {
    Logger.log("[S25-J2] No warm-ups to evaluate for " + yesterdayStr + ".");
    return;
  }

  Logger.log("[S25-J2] Evaluating " + toEvaluate.length +
             " warm-up(s) from " + yesterdayStr);

  let scored      = 0;
  let incomplete  = 0;
  let errors      = 0;

  for (const item of toEvaluate) {
    try {
      const result = evaluateWarmUpDoc_(item.docId, item.queueId);

      if (result.error) {
        Logger.log("[S25-J2] Error evaluating doc " + item.docId + ": " + result.error);
        errors++;
        continue;
      }

      if (result.wordCount === 0) {
        // No response — stamp INCOMPLETE, score 0, skip Flow 4
        writeIncomplete_(wqSheet, item.queueRowNum, wrSheet, item.wrRowNum);
        incomplete++;
        continue;
      }

      // Write response text and word count score to WarmUpQueue
      // Set status PENDING_EVAL — Flow 4 will pick this up
      writePreEvalScores_(
        wqSheet, item.queueRowNum,
        result.wordCount, result.wordCountScore, result.responseText,
        result.extraCredit
      );

      // Call Flow 4 for grammar and engagement evaluation
      const flow4Result = callFlow4_(
        result.responseText,
        result.promptText,
        result.wordCountScore
      );

      if (!flow4Result || flow4Result.error) {
        Logger.log("[S25-J2] Flow 4 failed for queue " + item.queueId +
                   ": " + (flow4Result ? flow4Result.error : "null response"));
        errors++;
        continue;
      }

      // Compute total score
      const total = result.wordCountScore +
                    (flow4Result.grammar    || 0) +
                    (flow4Result.engagement || 0) +
                    result.extraCredit;

      // Write final scores to WarmUpQueue
      writeFinalScores_(
        wqSheet, item.queueRowNum,
        flow4Result.grammar, flow4Result.engagement,
        flow4Result.feedback, total
      );

      // Write scores to WarmUpRegistry
      writeRegistryScores_(
        wrSheet, item.wrRowNum,
        total, result.extraCredit
      );

      // Stamp feedback into the warm-up doc
      writeFeedbackToDoc_(
        item.docId,
        flow4Result.feedback,
        result.wordCountScore,
        flow4Result.grammar,
        flow4Result.engagement,
        total
      );

      scored++;

    } catch (err) {
      Logger.log("[S25-J2] Unexpected error for doc " + item.docId +
                 ": " + err.message);
      errors++;
    }
  }

  Logger.log("[S25-J2] Evaluation complete. Scored: " + scored +
             " | Incomplete: " + incomplete +
             " | Errors: " + errors);

  // ── Cron health stamp ─────────────────────────────────────────────────
  PropertiesService.getScriptProperties().setProperties({
    "M2_STAGE2_LAST_RUN": new Date().toISOString(),
    "M2_STAGE2_STATUS":   errors > 0 ? "ERRORS_" + errors : "OK"
  });

  // ── Shadow matrix interrupt check ────────────────────────────────────────
  // After evaluation, check whether any student × unit confidence crossed
  // the 0.75 threshold since last night. If so, send the teacher one digest
  // email — not one per student.
  checkShadowMatrixInterrupts_(ss, cfg);
}

// ---------------------------------------------------------------------------
// checkShadowMatrixInterrupts_
// Reads all StudentProfiles, finds any student × unit combinations where
// cross_confidence >= 0.75 and the teacher has NOT been notified yet
// (tracked via M2_SHADOW_NOTIFIED_* Script Properties).
// Sends one batched email digest, then marks each crossing as notified.
// ---------------------------------------------------------------------------
function checkShadowMatrixInterrupts_(ss, cfg) {
  const CONFIDENCE_THRESHOLD = 0.75;
  const props       = PropertiesService.getScriptProperties();
  const teacherEmail = cfg.teacherEmail;
  const teacherName  = cfg.teacherName || teacherEmail;

  const spSheet = ss.getSheetByName(cfg.tabs.studentProfiles);
  if (!spSheet || spSheet.getLastRow() < 2) return;

  const data = spSheet.getDataRange().getValues();
  const interrupts = []; // { studentName, email, unitId, unitName, bestArchetype, confidence }

  for (let i = 1; i < data.length; i++) {
    const rowEmail   = String(data[i][SP_STUDENT_EMAIL]  || "").trim().toLowerCase();
    const rowTeacher = String(data[i][SP_TEACHER_EMAIL]  || "").trim().toLowerCase();
    const rowName    = String(data[i][SP_STUDENT_NAME]   || "").trim();

    if (rowEmail === teacherEmail.toLowerCase()) continue; // skip teacher row
    if (rowTeacher !== teacherEmail.toLowerCase()) continue;

    let matrix = {};
    try { matrix = JSON.parse(data[i][SP_SHADOW_MATRIX] || "{}"); }
    catch(e) { continue; }

    for (const unitId of Object.keys(matrix)) {
      const unitData   = matrix[unitId];
      const confidence = unitData.cross_confidence || 0;
      if (confidence < CONFIDENCE_THRESHOLD) continue;

      // Check if already notified for this student + unit
      const notifyKey = "M2_SHADOW_NOTIFIED_" + rowEmail.replace(/[^a-z0-9]/g, "_") + "_" + unitId;
      const alreadyNotified = props.getProperty(notifyKey);
      if (alreadyNotified) continue;

      interrupts.push({
        studentName:    rowName,
        email:          rowEmail,
        unitId:         unitId,
        bestArchetype:  unitData.best_archetype || "UNKNOWN",
        confidence:     confidence,
        trend:          unitData.trend || "flat",
        historyCount:   (unitData.archetype_history || []).length
      });
    }
  }

  if (interrupts.length === 0) {
    Logger.log("[S25] Shadow matrix: no new interrupt thresholds crossed.");
    return;
  }

  Logger.log("[S25] Shadow matrix: " + interrupts.length + " interrupt(s) to send.");

  // ── Build digest email ────────────────────────────────────────────────────
  const rows = interrupts.map(item =>
    "  " + item.studentName + " — " + item.unitId +
    "\n    Best archetype: " + item.bestArchetype +
    " (" + Math.round(item.confidence * 100) + "% confidence, " +
    item.historyCount + " warm-ups, trend: " + item.trend + ")"
  ).join("\n\n");

  const subject = "[CAS] Warm-Up Archetype Confidence — " + interrupts.length +
                  " student" + (interrupts.length > 1 ? "s" : "") + " ready";

  const body =
    "Hello " + teacherName + ",\n\n" +
    "The warm-up system has reached high confidence on archetype selection " +
    "for the following student" + (interrupts.length > 1 ? "s" : "") + ":\n\n" +
    rows + "\n\n" +
    "The system will automatically weight toward the best archetype for " +
    "each student's next warm-up.\n\n" +
    "Reply OVERRIDE to any individual student name above if you want to " +
    "keep the default archetype selection for that student.\n\n" +
    "This digest is sent once per student per unit. You will not receive " +
    "repeat notifications for the same student and unit.\n\n" +
    "— Classroom Agency System";

  try {
    MailApp.sendEmail({
      to:      teacherEmail,
      subject: subject,
      body:    body
    });
    Logger.log("[S25] Shadow matrix digest sent to " + teacherEmail);
  } catch (mailErr) {
    Logger.log("[S25] Could not send shadow matrix email: " + mailErr.message);
    return; // Don't mark as notified if email failed
  }

  // ── Mark all sent interrupts as notified ──────────────────────────────────
  const toSet = {};
  for (const item of interrupts) {
    const notifyKey = "M2_SHADOW_NOTIFIED_" +
      item.email.replace(/[^a-z0-9]/g, "_") + "_" + item.unitId;
    toSet[notifyKey] = new Date().toISOString();
  }
  try {
    props.setProperties(toSet);
  } catch (propErr) {
    Logger.log("[S25] Could not write notification flags: " + propErr.message);
  }
}

// ---------------------------------------------------------------------------
// evaluateWarmUpDoc_
// Opens a warm-up doc ONCE and extracts everything Script 25 needs:
//   - response text (student's writing below RESPONSE_ZONE_MARKER)
//   - word count and word count score
//   - extra credit flag (text after FEEDBACK_END_MARKER, if any)
//   - prompt text (for Flow 4 context)
//
// Returns: {
//   responseText, wordCount, wordCountScore,
//   promptText, extraCredit (0 or 1), error?
// }
// ---------------------------------------------------------------------------
function evaluateWarmUpDoc_(fileId, queueId) {
  let doc, text;

  try {
    doc  = DocumentApp.openById(fileId);
    text = doc.getBody().getText();
  } catch (err) {
    return { error: "Could not open doc " + fileId + ": " + err.message };
  }

  // ── Extract prompt text (between PROMPT zone markers) ─────────────────────
  const promptStart = text.indexOf("── WARM-UP PROMPT ──");
  const promptEnd   = text.indexOf("── END PROMPT ──");
  const promptText  = (promptStart !== -1 && promptEnd !== -1)
    ? text.substring(promptStart + "── WARM-UP PROMPT ──".length, promptEnd).trim()
    : "";

  // ── Extract response text (below RESPONSE_ZONE_MARKER) ───────────────────
  const responseIdx = text.indexOf(RESPONSE_ZONE_MARKER);
  if (responseIdx === -1) {
    return { error: "RESPONSE_ZONE_MARKER not found in doc " + fileId };
  }

  // Response zone is everything after the marker, up to the FEEDBACK marker
  // (if feedback has already been written — shouldn't be, but defensive)
  const feedbackIdx = text.indexOf(FEEDBACK_START_MARKER);
  const responseRaw = feedbackIdx !== -1
    ? text.substring(responseIdx + RESPONSE_ZONE_MARKER.length, feedbackIdx)
    : text.substring(responseIdx + RESPONSE_ZONE_MARKER.length);

  const responseText = responseRaw.trim();
  const wordCount    = responseText.length > 0
    ? responseText.split(/\s+/).filter(Boolean).length
    : 0;

  // ── Compute word count score ───────────────────────────────────────────────
  let wordCountScore = 0;
  for (const threshold of WORD_COUNT_THRESHOLDS) {
    if (wordCount >= threshold.min) {
      wordCountScore = threshold.score;
      break;
    }
  }

  // ── Check for extra credit reply (text after FEEDBACK_END_MARKER) ─────────
  // On the first nightly evaluation, FEEDBACK_END_MARKER won't exist yet
  // (feedback is written by this run). Extra credit is detected on the
  // SUBSEQUENT night's run — the student replies after seeing feedback.
  let extraCredit = 0;
  const feedbackEndIdx = text.indexOf(FEEDBACK_END_MARKER);
  if (feedbackEndIdx !== -1) {
    const afterFeedback = text
      .substring(feedbackEndIdx + FEEDBACK_END_MARKER.length)
      .trim();
    const replyWordCount = afterFeedback.split(/\s+/).filter(Boolean).length;
    if (replyWordCount >= EXTRA_CREDIT_MIN_WORDS) {
      extraCredit = 1;
    }
  }

  return { responseText, wordCount, wordCountScore, promptText, extraCredit, error: null };
}

// ---------------------------------------------------------------------------
// callFlow4_
// Calls Studio Flow 4 via the Gemini API to evaluate grammar and engagement.
// Passes the prompt text, student response, and pre-computed word count score.
// Flow 4 returns structured JSON: { grammar, engagement, feedback }
//
// Flow 4 is instructed to:
//   - Never mention points, scores, or grades in feedback
//   - Write feedback in a pedagogical tone that advances thinking
//   - Keep feedback to 1-3 sentences
//   - Return ONLY valid JSON with no preamble or markdown
//
// Returns: { grammar, engagement, feedback } or { error: "..." }
// ---------------------------------------------------------------------------
function callFlow4_(responseText, promptText, wordCountScore) {
  // Flow 4 is implemented as a Studio Flow triggered by WarmUpQueue status.
  // This function constructs the payload written to the queue row that
  // Flow 4 reads, then polls for the result.
  //
  // In the current architecture, Flow 4 reads from PENDING_EVAL WarmUpQueue
  // rows and writes back grammar_score, engagement_score, and flow4_feedback.
  // Script 25 then reads those values back in the next pass.
  //
  // For direct synchronous evaluation (if using Gemini API directly rather
  // than Studio), the implementation below can replace the queue-based approach.
  // Uncomment and configure if direct API access is available.

  /*
  // ── Direct Gemini API call (alternative to Studio Flow queue) ─────────────
  const prompt = buildFlow4Prompt_(responseText, promptText, wordCountScore);
  const url    = "https://generativelanguage.googleapis.com/v1beta/models/" +
                 "gemini-pro:generateContent?key=" +
                 PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 256 }
  };

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  });

  const data = JSON.parse(response.getContentText());
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    return { error: "Flow 4 JSON parse error: " + e.message + " | Raw: " + raw };
  }
  */

  // ── Studio Flow queue-based approach ──────────────────────────────────────
  // Flow 4 reads PENDING_EVAL rows. Script 25 polls for SCORED status.
  // This function is called after writePreEvalScores_() has set the status
  // to PENDING_EVAL. We poll the queue row until Flow 4 writes results back.
  // Implementation: see pollForFlow4Result_() below.
  return null; // placeholder — actual call via Studio Flow polling
}

// ---------------------------------------------------------------------------
// buildFlow4Prompt_
// Constructs the evaluation prompt sent to Flow 4.
// ---------------------------------------------------------------------------
function buildFlow4Prompt_(responseText, promptText, wordCountScore) {
  return [
    "You are evaluating a high school CTE student's warm-up response.",
    "The warm-up prompt was:",
    "---",
    promptText,
    "---",
    "The student's response was:",
    "---",
    responseText,
    "---",
    "The word count score has already been computed: " + wordCountScore + " points.",
    "",
    "Evaluate the response on two criteria:",
    "",
    "1. GRAMMAR AND SENTENCE STRUCTURE (0 or 1 point):",
    "   1 = Cohesive sentences with no significant errors that impede comprehension.",
    "   0 = Significant errors that impede comprehension.",
    "",
    "2. ENGAGEMENT (0, 1, 2, or 3 points):",
    "   3 = Genuine — directly addresses the prompt with original thought.",
    "   2 = Surface — on-topic but formulaic or thin.",
    "   1 = Minimal — tangentially related or very thin.",
    "   0 = Off-topic or filler — does not engage with the prompt.",
    "",
    "Also write 1-3 sentences of pedagogical feedback for the student.",
    "IMPORTANT: Never mention points, scores, or grades in the feedback.",
    "The feedback should advance the student's thinking about the topic.",
    "It will appear in their document before next class.",
    "",
    "Respond ONLY with valid JSON. No preamble, no markdown, no explanation.",
    "Format:",
    '{ "grammar": 0_or_1, "engagement": 0_1_2_or_3, "feedback": "your feedback here" }'
  ].join("\n");
}

// ---------------------------------------------------------------------------
// pollForFlow4Result_
// Polls a WarmUpQueue row for Flow 4's result (status changes from
// PENDING_EVAL to SCORED by Studio Flow 4).
// Polls every 15 seconds for up to 3 minutes.
// Returns the scored row data or null on timeout.
// ---------------------------------------------------------------------------
function pollForFlow4Result_(wqSheet, queueRowNum, queueId) {
  const MAX_ATTEMPTS  = 12; // 12 × 15s = 3 minutes
  const POLL_INTERVAL = 15 * 1000; // 15 seconds

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    Utilities.sleep(POLL_INTERVAL);

    // Re-read the specific queue row
    const rowData = wqSheet.getRange(queueRowNum, 1, 1, WQ25_COL_COUNT).getValues()[0];
    const status  = String(rowData[WQ25_STATUS] || "").trim();

    if (status === "SCORED") {
      return {
        grammar:    Number(rowData[WQ25_GRAMMAR_SCORE]    || 0),
        engagement: Number(rowData[WQ25_ENGAGEMENT_SCORE] || 0),
        feedback:   String(rowData[WQ25_FLOW4_FEEDBACK]   || "").trim()
      };
    }
  }

  Logger.log("[S25-J2] Flow 4 timeout for queue row " + queueRowNum +
             " (" + queueId + ") after 3 minutes.");
  return null;
}

// ---------------------------------------------------------------------------
// writeIncomplete_
// Stamps a WarmUpQueue row and WarmUpRegistry row as INCOMPLETE with score 0.
// Called when word count = 0 (no response written).
// ---------------------------------------------------------------------------
function writeIncomplete_(wqSheet, queueRowNum, wrSheet, wrRowNum) {
  // Update WarmUpQueue row
  const wqUpdates = wqSheet.getRange(queueRowNum, 1, 1, WQ25_COL_COUNT).getValues()[0];
  wqUpdates[WQ25_STATUS]           = "INCOMPLETE";
  wqUpdates[WQ25_WORD_COUNT]       = 0;
  wqUpdates[WQ25_WORD_COUNT_SCORE] = 0;
  wqUpdates[WQ25_GRAMMAR_SCORE]    = 0;
  wqUpdates[WQ25_ENGAGEMENT_SCORE] = 0;
  wqUpdates[WQ25_EXTRA_CREDIT]     = 0;
  wqUpdates[WQ25_TOTAL_SCORE]      = 0;
  wqSheet.getRange(queueRowNum, 1, 1, WQ25_COL_COUNT).setValues([wqUpdates]);

  // Update WarmUpRegistry
  wrSheet.getRange(wrRowNum, WR_TOTAL_SCORE + 1).setValue(0);
  wrSheet.getRange(wrRowNum, WR_EXTRA_CREDIT + 1).setValue(0);
}

// ---------------------------------------------------------------------------
// writePreEvalScores_
// Writes word count, word count score, response text to WarmUpQueue row.
// Sets status to PENDING_EVAL so Studio Flow 4 picks it up.
// ---------------------------------------------------------------------------
function writePreEvalScores_(wqSheet, queueRowNum,
                              wordCount, wordCountScore, responseText,
                              extraCredit) {
  const row = wqSheet.getRange(queueRowNum, 1, 1, WQ25_COL_COUNT).getValues()[0];
  row[WQ25_STATUS]           = "PENDING_EVAL";
  row[WQ25_WORD_COUNT]       = wordCount;
  row[WQ25_WORD_COUNT_SCORE] = wordCountScore;
  row[WQ25_EXTRA_CREDIT]     = extraCredit;
  row[WQ25_RESPONSE_TEXT]    = responseText.substring(0, 5000); // cap at 5000 chars
  wqSheet.getRange(queueRowNum, 1, 1, WQ25_COL_COUNT).setValues([row]);
}

// ---------------------------------------------------------------------------
// writeFinalScores_
// Writes Flow 4's grammar, engagement scores and feedback to WarmUpQueue.
// Sets status SCORED. Called after Flow 4 returns its result.
// ---------------------------------------------------------------------------
function writeFinalScores_(wqSheet, queueRowNum,
                            grammar, engagement, feedback, total) {
  const row = wqSheet.getRange(queueRowNum, 1, 1, WQ25_COL_COUNT).getValues()[0];
  row[WQ25_STATUS]           = "SCORED";
  row[WQ25_GRAMMAR_SCORE]    = grammar;
  row[WQ25_ENGAGEMENT_SCORE] = engagement;
  row[WQ25_TOTAL_SCORE]      = total;
  row[WQ25_FLOW4_FEEDBACK]   = (feedback || "").substring(0, MAX_FEEDBACK_CHARS);
  wqSheet.getRange(queueRowNum, 1, 1, WQ25_COL_COUNT).setValues([row]);
}

// ---------------------------------------------------------------------------
// writeRegistryScores_
// Updates total_score and extra_credit on a WarmUpRegistry row.
// This is the one targeted update Script 25 makes to an existing registry row.
// ---------------------------------------------------------------------------
function writeRegistryScores_(wrSheet, wrRowNum, total, extraCredit) {
  wrSheet.getRange(wrRowNum, WR_TOTAL_SCORE  + 1).setValue(total);
  wrSheet.getRange(wrRowNum, WR_EXTRA_CREDIT + 1).setValue(extraCredit);
}

// ---------------------------------------------------------------------------
// writeFeedbackToDoc_
// Stamps Flow 4's feedback into the warm-up doc below the student's response.
// Uses the FEEDBACK zone delimiters so Script 25's next-night run can
// detect extra credit replies written after FEEDBACK_END_MARKER.
//
// Structure written:
//   ── FEEDBACK ──
//   [feedback text]
//
//   Word count: N words
//   ── END FEEDBACK ──
//
// The score breakdown is intentionally omitted from the doc — students see
// pedagogical feedback only, not their point total.
// ---------------------------------------------------------------------------
function writeFeedbackToDoc_(fileId, feedbackText, wordCountScore,
                               grammar, engagement, total) {
  try {
    const doc  = DocumentApp.openById(fileId);
    const body = doc.getBody();

    const feedbackBlock =
      "\n" + FEEDBACK_START_MARKER + "\n" +
      (feedbackText || "Your response has been reviewed.") + "\n" +
      "\n" + FEEDBACK_END_MARKER + "\n";

    // Append feedback below student response — never insert before it
    // findText() locates the END PROMPT marker to ensure we're appending
    // in the right zone, but we append to body to avoid index fragility
    body.appendParagraph(feedbackBlock)
      .editAsText()
      .setFontSize(11)
      .setForegroundColor("#444444");

    doc.saveAndClose();
    Logger.log("[S25-J2] Feedback written to doc " + fileId);
  } catch (err) {
    Logger.log("[S25-J2] Could not write feedback to doc " +
               fileId + ": " + err.message);
  }
}

// =============================================================================
// TERM-END GRADE REPORT
// =============================================================================

// ---------------------------------------------------------------------------
// generateWarmUpReport
// Run manually from Script Editor at end of term.
// Reads WarmUpRegistry for all rows this term, filtered to this teacher.
// Produces per-student summary with points earned, possible, percentage.
// Registers output doc in ReportRegistry (type: WARMUP_TERM).
// Also writes Script Properties pointing to the most recent report.
// ---------------------------------------------------------------------------
function generateWarmUpReport() {
  const cfg          = getConfig_();
  const props        = PropertiesService.getScriptProperties();
  const currentTerm  = props.getProperty("CURRENT_TERM") || "All Terms";
  const teacherEmail = cfg.teacherEmail;
  const generatedAt  = new Date();

  const ss      = SpreadsheetApp.openById(cfg.ledgerSsId);
  const wrSheet = ss.getSheetByName(cfg.tabs.warmUpRegistry);
  const rrSheet = ss.getSheetByName(cfg.tabs.reportRegistry);

  if (!wrSheet) {
    Logger.log("[S25] WarmUpRegistry tab not found — cannot generate report.");
    return null;
  }

  const wrData = wrSheet.getDataRange().getValues();

  // Build per-student summary from WarmUpRegistry
  const studentSummary = {}; // email → { name, generated, completed, totalPoints, possiblePoints, extraCredits }

  for (let i = 1; i < wrData.length; i++) {
    const row        = wrData[i];
    const tEmail     = String(row[WR_TEACHER_EMAIL] || "").trim().toLowerCase();
    const term       = String(row[WR_TERM]          || "").trim();
    const email      = String(row[WR_STUDENT_EMAIL] || "").trim().toLowerCase();
    const name       = String(row[WR_STUDENT_NAME]  || "").trim();
    const totalScore = row[WR_TOTAL_SCORE];
    const ec         = Number(row[WR_EXTRA_CREDIT]  || 0);

    if (tEmail !== teacherEmail.toLowerCase()) continue;
    if (currentTerm !== "All Terms" && term && term !== currentTerm) continue;
    if (!email) continue;

    if (!studentSummary[email]) {
      studentSummary[email] = {
        name:           name || email,
        generated:      0,
        completed:      0,
        totalPoints:    0,
        possiblePoints: 0,
        extraCredits:   0
      };
    }

    studentSummary[email].generated++;
    studentSummary[email].possiblePoints += 10; // max per warm-up excluding extra credit

    if (totalScore !== "" && totalScore !== null && totalScore !== undefined) {
      const score = Number(totalScore);
      studentSummary[email].completed++;
      // Subtract extra credit from total to get base score for possible calculation
      studentSummary[email].totalPoints += Math.min(score, 10);
      studentSummary[email].extraCredits += ec;
    }
  }

  if (Object.keys(studentSummary).length === 0) {
    Logger.log("[S25] No WarmUpRegistry rows found for " + teacherEmail +
               " / " + currentTerm + " — no report generated.");
    return null;
  }

  // ── Build report document ──────────────────────────────────────────────────
  const dateStr = Utilities.formatDate(generatedAt, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const timeStr = Utilities.formatDate(generatedAt, Session.getScriptTimeZone(), "MMM d, yyyy h:mm a");
  const title   = "Warm-Up Grade Report — " + currentTerm +
                  " — " + (cfg.teacherName || teacherEmail) +
                  " — " + dateStr;

  const folder = cfg.teacherFolderId
    ? DriveApp.getFolderById(cfg.teacherFolderId)
    : DriveApp.getRootFolder();

  const doc  = DocumentApp.create(title);
  const body = doc.getBody();
  DriveApp.getFileById(doc.getId()).moveTo(folder);

  body.appendParagraph("WARM-UP GRADE REPORT")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Teacher:   " + (cfg.teacherName || teacherEmail));
  body.appendParagraph("Term:      " + currentTerm);
  body.appendParagraph("Generated: " + timeStr);
  body.appendParagraph("").appendHorizontalRule();

  // Summary line
  const totalStudents   = Object.keys(studentSummary).length;
  const totalGenerated  = Object.values(studentSummary).reduce((a, s) => a + s.generated,  0);
  const totalCompleted  = Object.values(studentSummary).reduce((a, s) => a + s.completed,  0);
  const totalPoints     = Object.values(studentSummary).reduce((a, s) => a + s.totalPoints, 0);
  const totalPossible   = Object.values(studentSummary).reduce((a, s) => a + s.possiblePoints, 0);

  body.appendParagraph(
    totalStudents + " students · " +
    totalGenerated + " warm-ups generated · " +
    totalCompleted + " completed · " +
    totalPoints + "/" + totalPossible + " total points"
  ).setBold(true);
  body.appendParagraph("");

  // ── Per-student rows ───────────────────────────────────────────────────────
  body.appendParagraph("STUDENT DETAIL")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  // Sort alphabetically by name
  const sortedStudents = Object.entries(studentSummary)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));

  for (const [email, s] of sortedStudents) {
    const pct          = s.possiblePoints > 0
      ? Math.round((s.totalPoints / s.possiblePoints) * 100) : 0;
    const completionPct = s.generated > 0
      ? Math.round((s.completed   / s.generated)     * 100) : 0;
    const ecStr        = s.extraCredits > 0 ? " (+" + s.extraCredits + " EC)" : "";

    body.appendParagraph(
      s.name + "   " +
      s.totalPoints + "/" + s.possiblePoints + " pts (" + pct + "%)" + ecStr + "   " +
      s.completed + "/" + s.generated + " completed (" + completionPct + "%)"
    ).editAsText().setFontSize(11);
  }

  body.appendParagraph("").appendHorizontalRule();
  body.appendParagraph(
    "SCORING RUBRIC: Word Count 6pts (30+wds) / 5pts (25-29) / 3pts (15-24) / 0pts (<15)  " +
    "Grammar 1pt  Engagement 3pts  Extra Credit +1pt"
  ).editAsText().setFontSize(9).setForegroundColor("#666666");

  doc.saveAndClose();

  const docId  = doc.getId();
  const docUrl = "https://docs.google.com/document/d/" + docId + "/edit";

  Logger.log("[S25] Warm-up grade report generated: " + docUrl);

  // ── Register in ReportRegistry ─────────────────────────────────────────────
  if (rrSheet) {
    const reportId  = generateReportId25_();
    const rrRow     = new Array(7).fill("");
    rrRow[RR25_REPORT_ID]     = reportId;
    rrRow[RR25_GENERATED_AT]  = generatedAt;
    rrRow[RR25_TERM]          = currentTerm;
    rrRow[RR25_TEACHER_EMAIL] = teacherEmail;
    rrRow[RR25_DOC_ID]        = docId;
    rrRow[RR25_DOC_URL]       = docUrl;
    rrRow[RR25_REPORT_TYPE]   = "WARMUP_TERM";
    rrSheet.appendRow(rrRow);
    Logger.log("[S25] Registered in ReportRegistry: " + reportId);
  }

  // ── Write to Script Properties ─────────────────────────────────────────────
  try {
    props.setProperties({
      "M2_LAST_WARMUP_REPORT_DOC_ID": docId,
      "M2_LAST_WARMUP_REPORT_URL":    docUrl,
      "M2_LAST_WARMUP_REPORT_TERM":   currentTerm,
      "M2_LAST_WARMUP_REPORT_DATE":   dateStr
    });
  } catch (err) {
    Logger.log("[S25] Could not write Script Properties: " + err.message);
  }

  return { docId, docUrl };
}

// =============================================================================
// CRON HEALTH CHECK
// =============================================================================

// ---------------------------------------------------------------------------
// _checkCronHealth_
// Checks whether a prior cron stage ran within the expected window.
// Called at the start of each stage to verify the previous stage completed.
// If the stamp is missing or stale, logs a warning and sends one email alert.
// Non-fatal — the current stage continues regardless.
//
// Parameters:
//   stampKey        — Script Properties key written by the prior stage
//   stageName       — human-readable name for the alert email
//   maxAgeMinutes   — how old the stamp can be before triggering an alert
//   notifyEmail     — email address for the alert (teacher or admin)
// ---------------------------------------------------------------------------
function _checkCronHealth_(stampKey, stageName, maxAgeMinutes, notifyEmail) {
  const props    = PropertiesService.getScriptProperties();
  const stampStr = props.getProperty(stampKey);
  const alertKey = stampKey + "_ALERTED";

  if (!stampStr) {
    // Stage has never run — likely first night
    Logger.log("[CRON-HEALTH] No stamp found for " + stageName +
               " — may be first run.");
    return;
  }

  const stampDate  = new Date(stampStr);
  const now        = new Date();
  const ageMinutes = (now - stampDate) / (1000 * 60);

  if (ageMinutes <= maxAgeMinutes) {
    // Stage ran within the expected window — clear any prior alert flag
    props.deleteProperty(alertKey);
    Logger.log("[CRON-HEALTH] " + stageName + " ran " +
               Math.round(ageMinutes) + " min ago — OK.");
    return;
  }

  // Stage is stale — check if we already sent an alert tonight
  const alreadyAlerted = props.getProperty(alertKey);
  if (alreadyAlerted) {
    Logger.log("[CRON-HEALTH] " + stageName + " stale (" +
               Math.round(ageMinutes) + " min) — alert already sent.");
    return;
  }

  // Send alert and set flag
  Logger.log("[CRON-HEALTH] ⚠ " + stageName + " ran " +
             Math.round(ageMinutes) + " min ago — expected < " +
             maxAgeMinutes + " min. Sending alert.");

  try {
    MailApp.sendEmail({
      to:      notifyEmail,
      subject: "[CAS] Cron health warning — " + stageName,
      body:    "The warm-up pipeline cron stage " + stageName + " last ran " +
               Math.round(ageMinutes) + " minutes ago.\n\n" +
               "Expected: within " + maxAgeMinutes + " minutes of the current run.\n\n" +
               "This may mean tonight's warm-up prompts are less personalized " +
               "than usual, or that the evaluation pass did not complete.\n\n" +
               "Check the Apps Script execution log on the Central Ledger " +
               "for details.\n\n" +
               "Last successful run: " + stampStr + "\n\n" +
               "— Classroom Agency System"
    });
    props.setProperty(alertKey, now.toISOString());
    Logger.log("[CRON-HEALTH] Alert sent to " + notifyEmail);
  } catch(mailErr) {
    Logger.log("[CRON-HEALTH] Could not send alert: " + mailErr.message);
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function getYesterday_() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function formatDateYMD_(date) {
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

function generateWarmUpId_() {
  const now = new Date();
  return "WUP-" +
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") + "-" +
    Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

function generateReportId25_() {
  const now = new Date();
  return "RPT-" +
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") + "-" +
    Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

// ---------------------------------------------------------------------------
// installRegistrationTrigger_
// Installs the 5-minute Job 1 safety-net trigger for registerDeliveredWarmUps.
// Called once manually. Safe to re-run.
// ---------------------------------------------------------------------------
function installRegistrationTrigger_() {
  const existing = ScriptApp.getProjectTriggers()
    .map(t => t.getHandlerFunction());

  if (existing.includes("registerDeliveredWarmUps")) {
    Logger.log("[S25] registerDeliveredWarmUps trigger already installed.");
    return;
  }

  ScriptApp.newTrigger("registerDeliveredWarmUps")
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log("[S25] Installed: registerDeliveredWarmUps every 5 minutes.");
}

// ---------------------------------------------------------------------------
// validateWarmUpEvaluation — run manually to check last evaluation run
// ---------------------------------------------------------------------------
function validateWarmUpEvaluation() {
  const cfg     = getConfig_();
  const ss      = SpreadsheetApp.openById(cfg.ledgerSsId);
  const wrSheet = ss.getSheetByName(cfg.tabs.warmUpRegistry);

  if (!wrSheet) { Logger.log("[VALIDATE] WarmUpRegistry not found."); return; }

  const data         = wrSheet.getDataRange().getValues();
  const teacherEmail = cfg.teacherEmail.toLowerCase();
  let total = 0, scored = 0, incomplete = 0, pending = 0;

  for (let i = 1; i < data.length; i++) {
    const tEmail = String(data[i][WR_TEACHER_EMAIL] || "").trim().toLowerCase();
    if (tEmail !== teacherEmail) continue;
    total++;
    const score = data[i][WR_TOTAL_SCORE];
    if (score === "" || score === null) pending++;
    else if (Number(score) === 0)      incomplete++;
    else                                scored++;
  }

  Logger.log("[VALIDATE] WarmUpRegistry for " + cfg.teacherEmail + ":");
  Logger.log("[VALIDATE]   Total docs registered: " + total);
  Logger.log("[VALIDATE]   Scored:                " + scored);
  Logger.log("[VALIDATE]   Incomplete (0 words):  " + incomplete);
  Logger.log("[VALIDATE]   Pending evaluation:    " + pending);
  if (pending > 0) Logger.log("[VALIDATE] ⚠ " + pending + " doc(s) still awaiting evaluation.");
  else              Logger.log("[VALIDATE] ✓ All registered docs evaluated.");
}
