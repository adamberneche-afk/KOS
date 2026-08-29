// =============================================================================
// FILE: ExtractBridgeInputsStep.gs
// PROJECT: cas-ccps:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: Flow 5's (Bridging Flow) input-preparation step. Flow 5's
//          system prompt needs three separate values —
//          {flow5_prior_response}, {pacing_prior_connection},
//          {course_name} — that all live inside the single raw
//          lesson_context_snapshot JSON blob on the trigger row. This
//          step does the one genuinely non-native-friendly part: pull
//          those three fields out as clean variables for the native
//          Ask Gemini step to consume.
//
// A NOTE ON WHERE THIS SPEC ACTUALLY LIVES: Flow 5 isn't a separate
// document. It's the last section of CAS_Flow3_Flow4_Specification.html.
//
// A GENUINE NAMING COLLISION, WORTH FLAGGING SEPARATELY:
// cas-ccps/docs/PLATFORM_DOCUMENTATION.html describes a DIFFERENT
// "Studio Flow 5" — "Lesson Frame Generation," triggered by a teacher's
// Lesson Context Form submission, unrelated to bridging. This file is
// built against the Bridging Flow interpretation, for three reasons:
// it's the one with an actual system prompt and column mapping, not
// just a one-line description; it's corroborated by real, working code
// (flow5_prior_response, getPriorWarmUpResponse_(), and the
// WQ25_BRIDGE_OUTPUT column all exist in 24_WarmUpBridge.js and
// 25_WarmUpWriter.js today); and CAS_Flow3_Flow4_Specification.html's
// own title — "v1.2 — Anchor-Aware + Shadow Matrix + Bridging Flow" —
// names this as the current version. PLATFORM_DOCUMENTATION.html reads
// like an earlier planning doc where the Flow 5 slot was provisionally
// assigned to a different, never-built idea, later reused for this one.
//
// TRIGGER-LEVEL FILTERING, NOT THIS STEP'S JOB: the flow's own trigger
// condition is "Status = PENDING_BRIDGE" — 24_WarmUpBridge.js's
// buildWarmUpQueues() only ever writes that status when a prior
// response was actually found (row[WQ24_STATUS] = priorResponse ?
// "PENDING_BRIDGE" : "PENDING"), so PENDING_BRIDGE alone already means
// "there is a prior response" with no compound condition needed. (An
// earlier version of this comment described the condition as "Status =
// PENDING AND flow5_prior_response != null" — that was the single-
// status design before the two-status PENDING/PENDING_BRIDGE split;
// see 24_WarmUpBridge.js's own header on that fix and
// cas-ccps/studio-steps/README.md's Flow 5 section for the full
// reasoning.) The light defensive check below (empty priorResponse
// treated as a parse-adjacent failure) exists only as defense in depth,
// not because it's expected to fire in normal operation.
//
// FLOW 5'S OWN FINAL STEP (native, not built here): after the Ask
// Gemini step produces the bridge paragraph, a native "Sheets — update
// row" step writes it to bridge_output (col 21) AND sets Status back
// to PENDING — this is what hands the row to Flow 3, which still only
// ever triggers on "Status = PENDING" (unchanged).
//
// INPUT READING / ERROR HANDLING: reads its input through
// StepsShared.gs's inStr_() rather than the raw
// inputs["x"].stringValues[0] pattern, and wraps the whole execute
// function body in try/catch — see inStr_()'s own header for why.
// =============================================================================

// =============================================================================
// onExtractBridgeInputsConfig
// Same confidence note on return/Save-button wiring as this project's
// other steps.
// =============================================================================
function onExtractBridgeInputsConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("lessonContextSnapshotJson", "lesson_context_snapshot (trigger row)"));

  var saveAction = CardService.newAction().setFunctionName("onExtractBridgeInputsConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Extract Bridge Inputs"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

// =============================================================================
// onExtractBridgeInputsExecute
// Never throws. extractStatus gates the native Ask Gemini step, same
// pattern as extractWarmUpPromptText and readInstructorConfig elsewhere
// in this project.
// =============================================================================
function onExtractBridgeInputsExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries the student's prior warm-up response text; see this
  // project's README for the general PII-logging policy every step in
  // this project follows.
  Logger.log("[ExtractBridgeInputsStep] execute start");

  try {
    var inputs = event.workflow.actionInvocation.inputs;
    var lessonJsonText = inStr_(inputs, "lessonContextSnapshotJson");

    var lesson;
    try {
      lesson = JSON.parse(lessonJsonText);
    } catch (e) {
      return buildOutputRenderAction_({
        extractStatus: stringVar_("LESSON_SNAPSHOT_PARSE_FAILED"),
        flow5PriorResponse: stringVar_(""),
        pacingPriorConnection: stringVar_(""),
        courseName: stringVar_(""),
      });
    }

    var priorResponse = lesson.flow5_prior_response;
    if (priorResponse === null || priorResponse === undefined || String(priorResponse).trim() === "") {
      // Shouldn't happen given the trigger's own condition already
      // filters this — defense in depth only, see this file's header.
      return buildOutputRenderAction_({
        extractStatus: stringVar_("NO_PRIOR_RESPONSE_IN_SNAPSHOT"),
        flow5PriorResponse: stringVar_(""),
        pacingPriorConnection: stringVar_(""),
        courseName: stringVar_(""),
      });
    }

    return buildOutputRenderAction_({
      extractStatus: stringVar_("OK"),
      flow5PriorResponse: stringVar_(priorResponse),
      pacingPriorConnection: stringVar_(lesson.pacing_prior_connection || ""),
      courseName: stringVar_(lesson.course_name || ""),
    });
  } catch (e) {
    return buildOutputRenderAction_({
      extractStatus: stringVar_("UNEXPECTED_ERROR: " + e.message),
      flow5PriorResponse: stringVar_(""),
      pacingPriorConnection: stringVar_(""),
      courseName: stringVar_(""),
    });
  }
}
