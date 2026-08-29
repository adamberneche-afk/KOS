// =============================================================================
// FILE: ExtractWarmUpPromptTextStep.gs
// PROJECT: cas-ccps:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: Flow 4's (Warm-Up Scoring) input-preparation step. Flow 4's
//          system prompt needs {original_prompt_text} -- the exact text
//          Flow 3 generated for this student, not an approximation.
//
//          CAS_Flow3_Flow4_Specification.html's own connector table says
//          Flow 4 "reconstructs the original prompt from the [lesson
//          context] snapshot" -- but the snapshot only has objective/
//          activity/vocabulary/etc, not the actual unique text Flow 3
//          generated. evaluateWarmUpDoc_() in 25_WarmUpWriter.js does
//          something more precise: it reads the doc directly and
//          extracts the exact text between the Zone 1 delimiters. This
//          step does the same thing, on the same delimiters that file
//          uses (confirmed directly from its own PROMPT_START/PROMPT_END
//          constants, not assumed) -- byte-identical to what the
//          student actually saw, not a reconstruction from summary
//          fields.
//
//          Takes the raw doc text as input (from a native "Docs — get
//          document" step) rather than opening the doc itself, since
//          that native step already has to run anyway to get
//          response_text for the Gemini call -- no reason for a second
//          Drive/Docs API call just to re-read the same doc.
//
// INPUT READING / ERROR HANDLING: reads its input through
// StepsShared.gs's inStr_() rather than the raw
// inputs["x"].stringValues[0] pattern, and wraps the whole execute
// function body in try/catch — see inStr_()'s own header for why.
// =============================================================================

// =============================================================================
// onExtractWarmUpPromptTextConfig
// Same confidence note on return/Save-button wiring as this project's
// other steps.
// =============================================================================
function onExtractWarmUpPromptTextConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("rawDocText", "Warm-up doc body text (native Docs — get document step's output)"));

  var saveAction = CardService.newAction().setFunctionName("onExtractWarmUpPromptTextConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Extract Warm-Up Prompt Text"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

// =============================================================================
// onExtractWarmUpPromptTextExecute
// Never throws. extractStatus tells the flow builder whether promptText
// is usable -- gate the native Ask Gemini step on this being OK, same
// pattern as readInstructorConfig's lookupStatus elsewhere in this
// project.
// =============================================================================
function onExtractWarmUpPromptTextExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries the student's full warm-up doc text; see this project's
  // README for the general PII-logging policy every step in this
  // project follows.
  Logger.log("[ExtractWarmUpPromptTextStep] execute start");

  try {
    var inputs = event.workflow.actionInvocation.inputs;
    var rawDocText = inStr_(inputs, "rawDocText");

    var promptStart = rawDocText.indexOf("── WARM-UP PROMPT ──");
    var promptEnd = rawDocText.indexOf("── END PROMPT ──");

    if (promptStart === -1 || promptEnd === -1 || promptEnd <= promptStart) {
      return buildOutputRenderAction_({
        extractStatus: stringVar_("PROMPT_MARKERS_NOT_FOUND"),
        promptText: stringVar_(""),
      });
    }

    var promptText = rawDocText
      .substring(promptStart + "── WARM-UP PROMPT ──".length, promptEnd)
      .trim();

    return buildOutputRenderAction_({
      extractStatus: stringVar_("OK"),
      promptText: stringVar_(promptText),
    });
  } catch (e) {
    return buildOutputRenderAction_({
      extractStatus: stringVar_("UNEXPECTED_ERROR: " + e.message),
      promptText: stringVar_(""),
    });
  }
}
