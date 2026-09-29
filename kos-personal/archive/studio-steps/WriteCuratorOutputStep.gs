// =============================================================================
// FILE: WriteCuratorOutputStep.gs
// PROJECT: kos-personal:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: A Workspace Studio custom step implementing Steps 2b + 3 + 4
//          of the Curator Flow (SESSION_LOG / EXTERNAL_DATA /
//          COG_STIMULUS payloads), as specified in
//          STUDIO_INTEGRATION_SPEC.md's connector table:
//            2b (required if 2a used) — merge Step 2's Curator JSON
//              with Step 2a's optional Auditor sign-off into ONE object
//            3  — overwrite the source doc's body with that JSON
//            4  — mark STAGING_PIPELINE FLOW_COMPLETE, but ONLY on
//              success; on any failure, touch NOTHING (leave Status at
//              STUDIO_ACTIVE so the staleness guard resets it for
//              retry) — see the spec's own Error Handling section.
//
//          Steps T (Sheets trigger), 1 (Docs — get document), 2
//          (Gemini, CURATOR_PROMPT.md pasted verbatim), and 2a
//          (optional Gemini Auditor pass) all stay native — this step
//          never calls Gemini itself, preserving the same Walled
//          Garden principle cas-ccps's own steps already establish
//          (see cas-ccps/scripts/15c_Flow2DirectEvaluationService.js's
//          header).
//
// IMPORTANT DIFFERENCE FROM cas-ccps's Flow 2 step:
//   cas-ccps's Flow 2 always marks its trigger row complete, success or
//   failure, because failure there is tracked via a separate mechanism
//   downstream. KOS's own spec explicitly wants the OPPOSITE on
//   failure: touch nothing at all, so the existing staleness guard
//   (TURNSTILE_STALE_MINS, default 30 min) resets the row for a retry.
//   This step is written to that rule — every failure path below
//   returns without writing the doc OR the STAGING_PIPELINE row.
//
// FENCE-STRIPPING: Gemini routinely wraps JSON output in a ```json ...
// ``` markdown fence even when asked for raw JSON. Stripped before
// parsing both the Curator and (when present) the Auditor JSON, the
// same way cas-ccps/scripts/25_WarmUpWriter.js:740 already does before
// its own JSON.parse — without this, a perfect Gemini response fails
// validation for a formatting reason unrelated to the session content.
//
// INPUT READING / ERROR HANDLING: every input is read through
// StepsShared.gs's inStr_() rather than the raw
// inputs["x"].stringValues[0] pattern, and the whole execute function
// body is wrapped in try/catch — see inStr_()'s own header for why.
// =============================================================================

// =============================================================================
// onWriteCuratorOutputConfig
// See cas-ccps's CommitRubricDraftStep.gs for the same confidence note
// on this function's return/Save-button wiring, and on the manifest's
// "state": "PUBLISHED" field — both apply equally here.
// =============================================================================
function onWriteCuratorOutputConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("stagingPipelineSsId", "BRAIN_TRUST_INDEX spreadsheet ID"))
    .addWidget(variableTextInput_("payloadUid", "Payload_UID (trigger row)"))
    .addWidget(variableTextInput_("fileId", "File_ID (trigger row)"))
    .addWidget(variableTextInput_("curatorJsonOutput", "Curator Gemini output (JSON)"))
    .addWidget(variableTextInput_("auditorJsonOutput",
        "Auditor Gemini output (JSON) — leave this field's mapping empty if Step 2a isn't wired into this flow"));

  var saveAction = CardService.newAction().setFunctionName("onWriteCuratorOutputConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Write Curator Output"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

// Strips a leading/trailing ```json or ``` markdown fence — see this
// file's header note on why.
function stripJsonFence_(text) {
  return String(text).replace(/```json|```/g, "").trim();
}

// =============================================================================
// onWriteCuratorOutputExecute
// Never throws to the caller in a way that would abort the flow run
// uninformatively — every path returns a normal output with a specific
// writeStatus. But unlike cas-ccps's steps, failure here means "return
// early having touched nothing," not "return early having written a
// failure marker" — there is no failure marker in this design, by the
// spec's own choice.
// =============================================================================
function onWriteCuratorOutputExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries the full session/document text; see this project's README
  // for the general PII-logging policy every step in this project
  // follows.
  Logger.log("[WriteCuratorOutputStep] execute start");

  try {
    var inputs = event.workflow.actionInvocation.inputs;
    var stagingPipelineSsId = inStr_(inputs, "stagingPipelineSsId");
    var payloadUid = inStr_(inputs, "payloadUid");
    var fileId = inStr_(inputs, "fileId");
    var curatorJsonOutput = inStr_(inputs, "curatorJsonOutput");
    var auditorJsonOutput = inStr_(inputs, "auditorJsonOutput");

    var curatorParsed;
    try {
      curatorParsed = JSON.parse(stripJsonFence_(curatorJsonOutput));
    } catch (e) {
      return buildOutputRenderAction_({ writeStatus: stringVar_("CURATOR_JSON_PARSE_FAILED") });
    }

    var auditorUsed = String(auditorJsonOutput || "").trim() !== "";
    if (auditorUsed) {
      var auditorParsed;
      try {
        auditorParsed = JSON.parse(stripJsonFence_(auditorJsonOutput));
      } catch (e) {
        // A malformed Auditor pass is treated as a full failure, not a
        // reason to silently drop the audit and write an un-audited
        // result -- CURATOR_PROMPT.md's own rule against a fabricated
        // sign-off implies a genuinely missing/broken one shouldn't be
        // papered over either. Nothing is written; the row is retried.
        return buildOutputRenderAction_({ writeStatus: stringVar_("AUDITOR_JSON_PARSE_FAILED") });
      }
      // CURATOR_PROMPT.md Rule 8 / Section 4: auditor_sign_off is a single
      // top-level key holding the Auditor step's output verbatim -- never
      // a second JSON object appended after the Curator's own.
      curatorParsed.auditor_sign_off = auditorParsed;
    }

    var finalText = JSON.stringify(curatorParsed);

    try {
      overwriteDocBody_(fileId, finalText);
    } catch (e) {
      return buildOutputRenderAction_({ writeStatus: stringVar_("DOC_WRITE_FAILED") });
    }

    try {
      markStagingPipelineComplete_(stagingPipelineSsId, payloadUid);
    } catch (e) {
      // The doc write already succeeded at this point -- the source text
      // is gone, replaced with the Curator's JSON, but the row never
      // reached FLOW_COMPLETE. This is a genuinely awkward partial state
      // (not a clean "touched nothing" failure), which is exactly why it
      // gets its own status code rather than reusing DOC_WRITE_FAILED --
      // it needs a human to notice, not a silent retry that would
      // re-run inference against a doc that's already JSON, not the
      // original session text.
      return buildOutputRenderAction_({ writeStatus: stringVar_("STAGING_ROW_NOT_FOUND_AFTER_DOC_WRITE") });
    }

    return buildOutputRenderAction_({ writeStatus: stringVar_("SUCCESS") });
  } catch (e) {
    return buildOutputRenderAction_({ writeStatus: stringVar_("UNEXPECTED_ERROR: " + e.message) });
  }
}
