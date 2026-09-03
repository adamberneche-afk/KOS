// =============================================================================
// FILE: FinalizeWarmUpScoreStep.gs
// PROJECT: cas-ccps:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: Flow 4's (Warm-Up Scoring) output step. Computes the total
//          score, writes final fields to WarmUpQueue, stamps feedback
//          into the doc's Zone 3, and updates the matching
//          WarmUpRegistry row.
//
// WHY THIS STEP EXISTS AND WHAT IT REPLACES -- a real, confirmed gap,
// not a hypothetical one:
//   25_WarmUpWriter.js's runWarmUpEvaluation() calls callFlow4_(), which
//   is a stub that returns null (its own comment: "no synchronous Flow
//   4 API exists yet -- this returns null until Flow 4 is deployed").
//   Since flow4Result is always null, `if (!flow4Result || ...)` is
//   always true, so every row hits the error branch and
//   writeFinalScores_() / writeRegistryScores_() / writeFeedbackToDoc_()
//   are never actually reached by that code path today.
//
//   There's also a second, orphaned function in that same file --
//   pollForFlow4Result_() -- which polls a WarmUpQueue row every 15s for
//   up to 3 minutes waiting for status to become "SCORED". It's fully
//   written but never called from anywhere in the file. Between
//   callFlow4_()'s stub and this dead polling function, the file
//   contains two different half-finished assumptions about how a
//   synchronous cron job (runWarmUpEvaluation, on a nightly trigger)
//   should hand off to an asynchronous Studio Flow -- neither one
//   actually wired together.
//
//   Given Flow 4 genuinely is asynchronous (a Studio Flow triggered by a
//   Sheets row update, not a function Script 25 can call and get an
//   instant return value from), the only architecture that actually
//   works is: Flow 4 is self-contained. It receives Gemini's grammar/
//   engagement/feedback, and finishes the ENTIRE job itself -- total
//   score, doc feedback, WarmUpQueue, WarmUpRegistry, status = SCORED --
//   rather than writing partial results and counting on some later
//   Script 25 pass to finish. I looked for such a later pass and didn't
//   find one: runWarmUpEvaluation() only scans rows from exactly
//   "yesterday" still missing total_score, so a row Flow 4 left
//   half-written would not be picked up and completed on a later run --
//   it would just sit unfinished.
//
//   This step is written to fully replace writeFinalScores_(),
//   writeRegistryScores_(), and writeFeedbackToDoc_() combined -- with
//   the same formulas, same column writes, same doc formatting -- not
//   to call them (a different, standalone Apps Script project can't
//   call another project's functions without a published library).
//
// WarmUpRegistry ROW CREATION IS NOT THIS STEP'S JOB: that already
// happens independently, via a separate existing Script 25 function
// (confirmed directly in 25_WarmUpWriter.js: it scans all DELIVERED
// WarmUpQueue rows on its own schedule and registers any not yet in
// WarmUpRegistry, entirely decoupled from Flow 3 or Flow 4). This step
// only ever UPDATES an existing registry row's total_score and
// extra_credit -- if that row doesn't exist yet (a timing/ordering
// edge case, not the common case), this step still finishes the
// WarmUpQueue write and doc feedback, and reports the registry gap
// as a separate, non-blocking status field rather than failing the
// whole step over it -- a missing registry row is a reporting gap
// that self-heals on that job's next run; a missing final score or
// missing feedback would directly affect the student.
//
// TOTAL SCORE FORMULA: word_count_score + grammar + engagement +
// extra_credit -- quoted directly from runWarmUpEvaluation()'s own
// total computation in 25_WarmUpWriter.js, not re-derived.
//
// ERROR HANDLING -- MY OWN JUDGMENT CALL, FLAGGED AS SUCH: neither spec
// document states an explicit failure philosophy for Flow 4 the way
// Flow 3's connector table does ("write ERROR to status"). Rather than
// leave a row silently stuck at PENDING_EVAL forever with no signal (no
// staleness guard is documented for this status, unlike
// STAGING_PIPELINE's 30-minute one in kos-personal), this step writes
// an explicit "EVAL_ERROR" status on a malformed Gemini response --
// visible and actionable, matching Flow 3's general house style of
// writing a clear status rather than staying silent, rather than
// silently leaving the row exactly as Flow 3's own convention would
// suggest.
//
// FENCE-STRIPPING: Gemini routinely wraps JSON output in a ```json ...
// ``` markdown fence even when asked for raw JSON. Stripped the same
// way 25_WarmUpWriter.js:740 already does before its own JSON.parse —
// without this, a perfect Gemini response fails validation for a
// formatting reason that has nothing to do with the evaluation itself.
//
// INPUT READING / ERROR HANDLING: every input is read through
// StepsShared.gs's inStr_() rather than the raw
// inputs["x"].stringValues[0] pattern, and the whole execute function
// body is wrapped in try/catch — see inStr_()'s own header for why.
// =============================================================================

var MAX_FEEDBACK_CHARS_ = 500; // matches 25_WarmUpWriter.js's own MAX_FEEDBACK_CHARS exactly

var WQ_FINALIZE_COLUMNS_ = {
  QUEUE_ID: 0, STATUS: 8, GRAMMAR_SCORE: 13, ENGAGEMENT_SCORE: 14, TOTAL_SCORE: 16, FLOW4_FEEDBACK: 17,
};
var WR_FINALIZE_COLUMNS_ = {
  QUEUE_ID: 1, TOTAL_SCORE: 10, EXTRA_CREDIT: 11,
};

// =============================================================================
// onFinalizeWarmUpScoreConfig
// Same confidence note on return/Save-button wiring as this project's
// other steps.
// =============================================================================
function onFinalizeWarmUpScoreConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("ledgerSsId", "Central Ledger spreadsheet ID"))
    .addWidget(variableTextInput_("queueId", "Queue_ID (trigger row)"))
    .addWidget(variableTextInput_("fileId", "Doc_ID (trigger row)"))
    .addWidget(variableTextInput_("wordCountScore", "Word_Count_Score (trigger row — already computed by Script 25)"))
    .addWidget(variableTextInput_("extraCredit", "Extra_Credit (trigger row — already computed by Script 25)"))
    .addWidget(variableTextInput_("geminiEvalOutput", "Gemini evaluation output (JSON: grammar/engagement/feedback)"));

  var saveAction = CardService.newAction().setFunctionName("onFinalizeWarmUpScoreConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Finalize Warm-Up Score"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

// =============================================================================
// onFinalizeWarmUpScoreExecute
// Never throws uncaught.
// =============================================================================
function onFinalizeWarmUpScoreExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries the student's evaluation output; see this project's README
  // for the general PII-logging policy every step in this project
  // follows.
  Logger.log("[FinalizeWarmUpScoreStep] execute start");

  var ledgerSsId, queueId;
  try {
    var inputs = event.workflow.actionInvocation.inputs;
    ledgerSsId = inStr_(inputs, "ledgerSsId");
    queueId = inStr_(inputs, "queueId");
    var fileId = inStr_(inputs, "fileId");
    var wordCountScore = Number(inStr_(inputs, "wordCountScore")) || 0;
    var extraCredit = Number(inStr_(inputs, "extraCredit")) || 0;
    var geminiEvalOutput = inStr_(inputs, "geminiEvalOutput");

    var evalParsed;
    try {
      evalParsed = JSON.parse(stripJsonFence_(geminiEvalOutput));
    } catch (e) {
      try { writeWarmUpQueueStatus_(ledgerSsId, queueId, "EVAL_ERROR"); } catch (e2) {}
      return buildOutputRenderAction_({
        writeStatus: stringVar_("GEMINI_JSON_PARSE_FAILED"),
        registryUpdateStatus: stringVar_("SKIPPED"),
      });
    }

    var grammar = Number(evalParsed.grammar) || 0;
    var engagement = Number(evalParsed.engagement) || 0;
    var feedback = String(evalParsed.feedback || "Your response has been reviewed.");
    var total = wordCountScore + grammar + engagement + extraCredit;

    try {
      writeFinalWarmUpQueueScores_(ledgerSsId, queueId, grammar, engagement, total, feedback);
    } catch (e) {
      return buildOutputRenderAction_({
        writeStatus: stringVar_("QUEUE_ROW_NOT_FOUND"),
        registryUpdateStatus: stringVar_("SKIPPED"),
      });
    }

    var docWriteOk = true;
    try {
      appendWarmUpFeedbackToDoc_(fileId, feedback);
    } catch (e) {
      docWriteOk = false;
      Logger.log("[FinalizeWarmUpScoreStep] doc feedback write failed, continuing: " + e.message);
    }

    var registryUpdateStatus = "OK";
    try {
      var updated = updateWarmUpRegistryScores_(ledgerSsId, queueId, total, extraCredit);
      if (!updated) registryUpdateStatus = "REGISTRY_ROW_NOT_FOUND";
    } catch (e) {
      registryUpdateStatus = "REGISTRY_UPDATE_ERROR: " + e.message;
    }

    return buildOutputRenderAction_({
      writeStatus: stringVar_(docWriteOk ? "SUCCESS" : "SUCCESS_DOC_FEEDBACK_WRITE_FAILED"),
      registryUpdateStatus: stringVar_(registryUpdateStatus),
    });
  } catch (e) {
    try { writeWarmUpQueueStatus_(ledgerSsId, queueId, "EVAL_ERROR"); } catch (e2) {}
    return buildOutputRenderAction_({
      writeStatus: stringVar_("UNEXPECTED_ERROR: " + e.message),
      registryUpdateStatus: stringVar_("SKIPPED"),
    });
  }
}

function findRowByColumnValue_(sheet, columnIndex, value) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][columnIndex]).trim() === value) return i + 1; // 1-indexed
  }
  return -1;
}

function writeWarmUpQueueStatus_(ledgerSsId, queueId, status) {
  var ss = SpreadsheetApp.openById(ledgerSsId);
  var sheet = ss.getSheetByName("WarmUpQueue");
  if (!sheet) throw new Error("No tab named \"WarmUpQueue\" in spreadsheet " + ledgerSsId);
  var rowNum = findRowByColumnValue_(sheet, WQ_FINALIZE_COLUMNS_.QUEUE_ID, queueId);
  if (rowNum === -1) throw new Error("No WarmUpQueue row found for Queue_ID " + queueId);
  sheet.getRange(rowNum, WQ_FINALIZE_COLUMNS_.STATUS + 1).setValue(status);
}

// Mirrors writeFinalScores_() in 25_WarmUpWriter.js exactly: same four
// fields, same "SCORED" status, same MAX_FEEDBACK_CHARS cap.
function writeFinalWarmUpQueueScores_(ledgerSsId, queueId, grammar, engagement, total, feedback) {
  var ss = SpreadsheetApp.openById(ledgerSsId);
  var sheet = ss.getSheetByName("WarmUpQueue");
  if (!sheet) throw new Error("No tab named \"WarmUpQueue\" in spreadsheet " + ledgerSsId);
  var rowNum = findRowByColumnValue_(sheet, WQ_FINALIZE_COLUMNS_.QUEUE_ID, queueId);
  if (rowNum === -1) throw new Error("No WarmUpQueue row found for Queue_ID " + queueId);

  sheet.getRange(rowNum, WQ_FINALIZE_COLUMNS_.STATUS + 1).setValue("SCORED");
  sheet.getRange(rowNum, WQ_FINALIZE_COLUMNS_.GRAMMAR_SCORE + 1).setValue(grammar);
  sheet.getRange(rowNum, WQ_FINALIZE_COLUMNS_.ENGAGEMENT_SCORE + 1).setValue(engagement);
  sheet.getRange(rowNum, WQ_FINALIZE_COLUMNS_.TOTAL_SCORE + 1).setValue(total);
  sheet.getRange(rowNum, WQ_FINALIZE_COLUMNS_.FLOW4_FEEDBACK + 1)
    .setValue(feedback.substring(0, MAX_FEEDBACK_CHARS_));
  SpreadsheetApp.flush();
}

// Mirrors writeFeedbackToDoc_() in 25_WarmUpWriter.js exactly: same
// marker strings, same fallback text, same font size/color, appended
// as a paragraph (never inserted before the response, matching that
// function's own comment on why it appends rather than inserts).
function appendWarmUpFeedbackToDoc_(fileId, feedbackText) {
  var doc = DocumentApp.openById(fileId);
  var body = doc.getBody();

  var feedbackBlock =
    "\n── FEEDBACK ──\n" +
    (feedbackText || "Your response has been reviewed.") + "\n" +
    "\n── END FEEDBACK ──\n";

  body.appendParagraph(feedbackBlock)
    .editAsText()
    .setFontSize(11)
    .setForegroundColor("#444444");

  doc.saveAndClose();
}

// Mirrors writeRegistryScores_() in 25_WarmUpWriter.js: same two
// fields, matched by Queue_ID (that function takes a row number
// directly since its caller already knows it from the same run that
// created the row; this step re-finds it, same reasoning as
// CreateWarmUpDocStep.gs's findWarmUpQueueRow_). Returns false rather
// than throwing if no matching row exists yet -- see this file's header
// note on why that's non-blocking here specifically.
function updateWarmUpRegistryScores_(ledgerSsId, queueId, total, extraCredit) {
  var ss = SpreadsheetApp.openById(ledgerSsId);
  var sheet = ss.getSheetByName("WarmUpRegistry");
  if (!sheet) throw new Error("No tab named \"WarmUpRegistry\" in spreadsheet " + ledgerSsId);
  var rowNum = findRowByColumnValue_(sheet, WR_FINALIZE_COLUMNS_.QUEUE_ID, queueId);
  if (rowNum === -1) return false;
  sheet.getRange(rowNum, WR_FINALIZE_COLUMNS_.TOTAL_SCORE + 1).setValue(total);
  sheet.getRange(rowNum, WR_FINALIZE_COLUMNS_.EXTRA_CREDIT + 1).setValue(extraCredit);
  SpreadsheetApp.flush();
  return true;
}
