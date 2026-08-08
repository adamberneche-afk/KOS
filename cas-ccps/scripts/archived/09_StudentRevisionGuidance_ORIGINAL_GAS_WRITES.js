// ⚠️ SUPERSEDED (reconciliation decision 8): this file assumes GAS writes
// the evaluation report into the student doc (prependFeedbackToHeader()).
// Four independent, mutually corroborating sources disagree — Studio's
// native "Insert text" connector writes the report directly, and GAS
// (03_QueueBridge.js's backPropagateCompletions()) only appends the
// "what to do next" block afterward. See 09_StudentRevisionGuidance_M1Base.js
// for the live design, and cas-ccps/README.md for the full evidence trail.
// This was the very first file uploaded to this project — read as an
// earlier or experimental design, not a competing live alternative.
// Archived, not deleted. Confirmed (at archival time) that nothing else
// in this repo calls prependFeedbackToHeader().
// =============================================================================
// FILE: 09_StudentRevisionGuidance.js
// EXTENDS: Script 01 (add these functions to the same container-bound project)
// PURPOSE: Prepends evaluation reports into the document feedback header zone.
//          Called by the admin evaluation engine (Script 03) after inference.
//          Most recent feedback always appears at the top for maximum visibility.
// =============================================================================

// ---------------------------------------------------------------------------
// prependFeedbackToHeader — called by the admin evaluation engine after Gemini
// inference. Inserts the evaluation report into the feedback header zone,
// above any previous feedback. Most recent report is always first.
//
// Parameters:
//   fileId           — student's Google Doc Drive file ID
//   evaluationReport — full text output from Gemini (structured report)
//   configId         — student's CONFIG_ID (for timestamp block header)
//   complianceResult — "APPROVED" or "REVISION_REQUIRED"
// ---------------------------------------------------------------------------
function prependFeedbackToHeader(fileId, evaluationReport, configId, complianceResult) {
  const doc  = DocumentApp.openById(fileId);
  const body = doc.getBody();

  const timestamp = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "MMM d, yyyy h:mm a"
  );

  // Build the feedback block with plain-language next-steps appended
  const nextSteps  = buildNextStepsBlock_(complianceResult);
  const statusLine = complianceResult === "APPROVED"
    ? "✅ RESULT: YOUR WORK MEETS THE STANDARD"
    : "✏️  RESULT: REVISIONS REQUIRED BEFORE SUBMISSION";

  const complianceStamp = complianceResult === "APPROVED"
    ? "[SYSTEM: APPROVED]"
    : "[SYSTEM: REVISION_REQUIRED]";

  const feedbackBlock =
    "\n── EVALUATION [" + timestamp + "] ──\n" +
    statusLine + "\n\n" +
    evaluationReport + "\n\n" +
    nextSteps + "\n" +
    complianceStamp + "\n" +
    "── END EVALUATION ──\n";

  // Find the FEEDBACK marker line and insert immediately after it
  // so new reports stack below the marker but above older reports
  const feedbackMarker = "── FEEDBACK ──";
  const fullText       = body.getText();
  const markerPos      = fullText.indexOf(feedbackMarker);

  if (markerPos !== -1) {
    // Find the paragraph element containing the marker
    const searchResult = body.findText("── FEEDBACK ──");
    if (searchResult) {
      const markerPara  = searchResult.getElement().getParent();
      const markerIndex = body.getChildIndex(markerPara);
      body.insertParagraph(markerIndex + 1, feedbackBlock);
    } else {
      // Fallback: insert at position 1 (after the very first paragraph)
      body.insertParagraph(1, feedbackBlock);
    }
  } else {
    // Feedback zone marker not found — insert at document top
    body.insertParagraph(0, feedbackBlock);
  }

  // Remove the "No feedback yet" placeholder if it's still present
  removePlaceholderText_(body);

  doc.saveAndClose();

  Logger.log("[FEEDBACK] Prepended evaluation to doc " + fileId +
             " | Result: " + complianceResult);
}

// ---------------------------------------------------------------------------
// buildNextStepsBlock_ — plain-language next-steps appended to every report
// Answers: what do I do now?
// ---------------------------------------------------------------------------
function buildNextStepsBlock_(complianceResult) {
  if (complianceResult === "APPROVED") {
    return (
      "WHAT TO DO NEXT:\n" +
      "  1. Read the feedback above to understand your strengths.\n" +
      "  2. Make any final polish edits if needed.\n" +
      "  3. Submit your work using the Turn-In Form your teacher provided.\n\n" +
      "⚠️  Do not delete or edit any evaluation report in this document.\n" +
      "    It is part of your verified submission record."
    );
  }

  return (
    "WHAT TO DO NEXT:\n" +
    "  1. Read the REQUIRED REVISIONS list above carefully.\n" +
    "  2. Update your response in the YOUR RESPONSE BEGINS HERE section below.\n" +
    "  3. When ready, click:  📊 AI Evaluation Panel → Run Assignment Check\n" +
    "  4. Repeat until you receive a passing result.\n\n" +
    "💡 You can run as many checks as you need. There is no penalty for revising.\n" +
    "⚠️  Do not submit using the Turn-In Form until you have a passing result."
  );
}

// ---------------------------------------------------------------------------
// removePlaceholderText_ — removes the initial "No feedback yet" placeholder
// that Script 02 stamps into the document on creation.
// Only runs once — after the first real evaluation is written.
// ---------------------------------------------------------------------------
function removePlaceholderText_(body) {
  const placeholder = "[No feedback yet. Use 📊 AI Evaluation Panel → Run Assignment Check to request your first evaluation.]";
  const result      = body.findText("\\[No feedback yet\\..*?\\]");
  if (result) {
    const para = result.getElement().getParent();
    try { para.removeFromParent(); } catch (e) { /* already removed */ }
  }
}
