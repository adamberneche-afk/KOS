// =============================================================================
// FILE: WriteClassificationOutputStep.gs
// PROJECT: kos-personal:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: A Workspace Studio custom step implementing Steps 3 + 4 of
//          the VECTOR_CLASSIFY Flow, as specified in
//          STUDIO_INTEGRATION_SPEC.md's second connector table — the
//          "second, independent Studio flow" that classifies sentences
//          against known vectors. Simpler than WriteCuratorOutputStep.gs:
//          there's no optional Auditor merge here, just validate ->
//          write -> conditionally complete.
//
//          Steps T (Sheets trigger, Payload_Type = VECTOR_CLASSIFY), 1
//          (Docs — get document), and 2 (Gemini,
//          VECTOR_CLASSIFY_PROMPT.md pasted verbatim) all stay native —
//          same Walled Garden principle as WriteCuratorOutputStep.gs.
//
// WHY THE RAW TEXT IS WRITTEN THROUGH UNCHANGED, NOT RE-SERIALIZED:
//   This step parses classificationJsonOutput only to VALIDATE it, then
//   discards the parsed result and writes Gemini's ORIGINAL text
//   verbatim -- not JSON.stringify(parsed). Re-serializing risks subtly
//   reformatting floats or key order differently than what Gemini
//   actually produced, for no benefit here (unlike
//   WriteCuratorOutputStep.gs, there's nothing to MERGE into this
//   output, so there's no reason to reconstruct it in code at all).
//
// SAME FAILURE PHILOSOPHY AS THE CURATOR STEP: on any failure, this
// step writes nothing and touches STAGING_PIPELINE nothing, leaving
// Status at STUDIO_ACTIVE for the staleness guard to retry.
//
// FENCE-STRIPPING: only used to VALIDATE the shape (see above) —
// Gemini routinely wraps JSON output in a ```json ... ``` markdown
// fence even when asked for raw JSON, so the fence is stripped before
// JSON.parse the same way cas-ccps/scripts/25_WarmUpWriter.js:740
// already does, otherwise a perfectly well-formed array fails
// validation for a formatting reason unrelated to its content. The
// ORIGINAL, unstripped text is still what gets written to the doc (see
// above) — stripping only ever touches the copy this step parses to
// validate, never the copy it writes.
//
// INPUT READING / ERROR HANDLING: every input is read through
// StepsShared.gs's inStr_() rather than the raw
// inputs["x"].stringValues[0] pattern, and the whole execute function
// body is wrapped in try/catch — see inStr_()'s own header for why.
// =============================================================================

// =============================================================================
// onWriteClassificationOutputConfig
// Same confidence note on return/Save-button wiring as
// WriteCuratorOutputStep.gs's onWriteCuratorOutputConfig().
// =============================================================================
function onWriteClassificationOutputConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("stagingPipelineSsId", "BRAIN_TRUST_INDEX spreadsheet ID"))
    .addWidget(variableTextInput_("payloadUid", "Payload_UID (trigger row)"))
    .addWidget(variableTextInput_("fileId", "File_ID (trigger row)"))
    .addWidget(variableTextInput_("classificationJsonOutput", "Classifier Gemini output (JSON array)"));

  var saveAction = CardService.newAction().setFunctionName("onWriteClassificationOutputConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Write Classification Output"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

function stripJsonFenceForValidation_(text) {
  return String(text).replace(/```json|```/g, "").trim();
}

// =============================================================================
// onWriteClassificationOutputExecute
// Never throws. Validates that the output is not just parseable JSON
// but specifically a JSON array -- STUDIO_INTEGRATION_SPEC.md's output
// schema for this flow is explicit that the top level is an array of
// exchanges, not an object; a well-formed object here would still be
// wrong shape and should not be written through as if it were valid.
// =============================================================================
function onWriteClassificationOutputExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries the classified session text; see this project's README for
  // the general PII-logging policy every step in this project follows.
  Logger.log("[WriteClassificationOutputStep] execute start");

  try {
    var inputs = event.workflow.actionInvocation.inputs;
    var stagingPipelineSsId = inStr_(inputs, "stagingPipelineSsId");
    var payloadUid = inStr_(inputs, "payloadUid");
    var fileId = inStr_(inputs, "fileId");
    var classificationJsonOutput = inStr_(inputs, "classificationJsonOutput");

    var parsed;
    try {
      parsed = JSON.parse(stripJsonFenceForValidation_(classificationJsonOutput));
    } catch (e) {
      return buildOutputRenderAction_({ writeStatus: stringVar_("CLASSIFICATION_JSON_PARSE_FAILED") });
    }
    if (!Array.isArray(parsed)) {
      return buildOutputRenderAction_({ writeStatus: stringVar_("CLASSIFICATION_JSON_NOT_ARRAY") });
    }

    try {
      overwriteDocBody_(fileId, classificationJsonOutput);
    } catch (e) {
      return buildOutputRenderAction_({ writeStatus: stringVar_("DOC_WRITE_FAILED") });
    }

    try {
      markStagingPipelineComplete_(stagingPipelineSsId, payloadUid);
    } catch (e) {
      return buildOutputRenderAction_({ writeStatus: stringVar_("STAGING_ROW_NOT_FOUND_AFTER_DOC_WRITE") });
    }

    return buildOutputRenderAction_({ writeStatus: stringVar_("SUCCESS") });
  } catch (e) {
    return buildOutputRenderAction_({ writeStatus: stringVar_("UNEXPECTED_ERROR: " + e.message) });
  }
}
