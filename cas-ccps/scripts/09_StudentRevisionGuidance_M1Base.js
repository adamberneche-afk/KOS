// =============================================================================
// FILE: 09_StudentRevisionGuidance.js
// BOUND TO: Master Student Template Google Doc (same project as Scripts 00+01+17)
// PURPOSE: Post-evaluation document processing.
//
// INVOCATION:
//   Studio Flow 2 cannot call GAS functions directly. Instead, Script 03's
//   backPropagateCompletions() detects newly COMPLETE staging rows and calls
//   processCompletedEvaluation() for each one. This runs in the admin
//   spreadsheet's script project (Scripts 00+03+06+10), so it has full
//   access to open student docs via DriveApp/DocumentApp.
//
//   processCompletedEvaluation() is therefore defined here for documentation
//   purposes but MUST be copied into the 03_QueueBridge.js file (same project)
//   so it runs in the correct script context.
//
// WHAT IT DOES:
//   1. Removes the [No feedback yet] placeholder from the feedback zone
//   2. Appends a plain-language "What to do next" block after the eval report
//   3. Both operations happen in the same document open/close cycle as
//      backPropagateCompletions, preventing double-open lock errors
// =============================================================================

// ---------------------------------------------------------------------------
// processCompletedEvaluation — called from Script 03's backPropagateCompletions
// after confirming the staging row is COMPLETE and the queue row is STAGED.
//
// Parameters:
//   fileId  — student doc Drive file ID
//   configId — student CONFIG_ID (for logging)
// ---------------------------------------------------------------------------
function processCompletedEvaluation(fileId, configId) {
  try {
    const doc  = DocumentApp.openById(fileId);
    const body = doc.getBody();

    // 1. Remove placeholder text
    removePlaceholder_(body);

    // 2. Detect compliance result from the document text
    //    Studio has already written the evaluation including the stamp
    const fullText       = body.getText();
    const complianceResult = fullText.indexOf("[SYSTEM: APPROVED]") !== -1
      ? "APPROVED"
      : "REVISION_REQUIRED";

    // 3. Find the most recent evaluation block and append next-steps after it
    appendNextSteps_(body, complianceResult);

    doc.saveAndClose();

    Logger.log(
      "[09] Post-processing complete — ConfigID: " + configId +
      " | Result: " + complianceResult
    );
  } catch (err) {
    Logger.log("[09] processCompletedEvaluation error — " +
               "FileID: " + fileId + " | " + err.message);
  }
}

// ---------------------------------------------------------------------------
// removePlaceholder_ — removes the initial "No feedback yet" paragraph
// Safe to call on any doc regardless of whether placeholder is present
// ---------------------------------------------------------------------------
function removePlaceholder_(body) {
  const PLACEHOLDER_TEXT =
    "[No feedback yet. Use 📊 AI Evaluation Panel → Run Assignment Check " +
    "to request your first evaluation.]";

  const result = body.findText("\\[No feedback yet\\.");
  if (!result) return; // Already removed or never present

  try {
    const para = result.getElement().getParent();
    para.removeFromParent();
  } catch (e) {
    Logger.log("[09] Placeholder removal warning: " + e.message);
  }
}

// ---------------------------------------------------------------------------
// appendNextSteps_ — inserts a "What to do next" block immediately after
// the most recent END EVALUATION marker, so it sits directly below the
// evaluation report the student just received
// ---------------------------------------------------------------------------
function appendNextSteps_(body, complianceResult) {
  const END_MARKER = "── END EVALUATION ──";

  const result = body.findText("── END EVALUATION ──");
  if (!result) {
    // Fallback: append at end of feedback zone if marker not found
    Logger.log("[09] END EVALUATION marker not found — appending next steps at body end.");
    body.appendParagraph(buildNextStepsText_(complianceResult));
    return;
  }

  // Find the paragraph containing the END EVALUATION marker
  const markerPara  = result.getElement().getParent();
  const markerIndex = body.getChildIndex(markerPara);

  // Insert next-steps immediately after the marker paragraph
  body.insertParagraph(markerIndex + 1, buildNextStepsText_(complianceResult));
}

// ---------------------------------------------------------------------------
// buildNextStepsText_ — returns the plain-language next-steps string
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
    "  2. Update your response in the\n" +
    "     ── YOUR RESPONSE BEGINS HERE ── section below.\n" +
    "  3. When ready, click:\n" +
    "     📊 AI Evaluation Panel → Run Assignment Check\n" +
    "  4. Repeat until you receive a passing result.\n\n" +
    "💡  You can run as many checks as you need.\n" +
    "    There is no penalty for revising.\n" +
    "⚠️  Do not submit using the Turn-In Form until\n" +
    "    you have a passing result.\n"
  );
}
