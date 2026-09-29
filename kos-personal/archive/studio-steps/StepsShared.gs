// =============================================================================
// FILE: StepsShared.gs
// PROJECT: kos-personal:studio-steps (standalone; see tools/gas-lint/
//          project-map.json). A SEPARATE Apps Script project from
//          cas-ccps's studio-steps — SMP-004 bifurcates kos-personal
//          onto the personal Google account and cas-ccps onto the
//          district domain account, so these two projects can't share
//          a GAS project (or its global scope) even though the design
//          pattern below is deliberately the same one used there.
//
// PURPOSE: Helpers shared by every custom Studio step in this project.
//          Same reasoning as cas-ccps's StepsShared.gs: GAS
//          concatenates every file in a project into one global
//          scope, so these are declared once, here, not once per step
//          file.
// =============================================================================

// A text-input field wired to Studio's variable picker. kos-personal is
// single-user (per STUDIO_INTEGRATION_SPEC.md's own note on this), so
// several of these fields are just as likely to be typed once as a
// literal constant (e.g. stagingPipelineSsId) as mapped to a variable —
// this widget supports both, same as cas-ccps's version.
function variableTextInput_(fieldName, title) {
  return CardService.newTextInput()
    .setFieldName(fieldName)
    .setTitle(title)
    .setHostAppDataSource(
      CardService.newHostAppDataSource().setWorkflowDataSource(
        CardService.newWorkflowDataSource().setIncludeVariables(true)
      )
    );
}

// Safely reads a Studio-mapped STRING input, returning defaultValue
// ("" if omitted) when the field is unmapped, non-STRING, or otherwise
// has no stringValues. Same helper, same reasoning, as cas-ccps's
// studio-steps StepsShared.gs's inStr_() — see that file's header for
// the full explanation of why every onXExecute in this project should
// read its inputs through this helper (and wrap its whole body in
// try/catch) rather than the raw stringValues[0] pattern.
function inStr_(inputs, name, defaultValue) {
  var input = inputs && inputs[name];
  if (input && input.stringValues && input.stringValues.length > 0) {
    return input.stringValues[0];
  }
  return defaultValue !== undefined ? defaultValue : "";
}

function stringVar_(value) {
  return AddOnsResponseService.newVariableData().addStringValue(String(value));
}

function buildOutputRenderAction_(variableDataMap) {
  var workflowAction = AddOnsResponseService.newReturnOutputVariablesAction()
    .setVariableDataMap(variableDataMap);
  var hostAppAction = AddOnsResponseService.newHostAppAction()
    .setWorkflowAction(workflowAction);
  return AddOnsResponseService.newRenderActionBuilder()
    .setHostAppAction(hostAppAction)
    .build();
}

// STAGING_PIPELINE column indices (0-based), from
// STUDIO_INTEGRATION_SPEC.md Step 2's own column map table — confirmed
// against that doc directly, not inferred.
var STAGING_COLUMNS_ = {
  TIMESTAMP: 0,
  PAYLOAD_UID: 1,
  PAYLOAD_TYPE: 2,
  DOC_URL: 3,
  FILE_ID: 4,
  STATUS: 5,
  RETRY_COUNT: 6,
};

// Shared by both steps in this project: find the STAGING_PIPELINE row
// for a given Payload_UID and set its Status to FLOW_COMPLETE. Unlike
// cas-ccps's Ledger/ConfigID situation, a single-key match here is
// genuinely safe — Payload_UID is documented in the spec as "Unique
// identifier for this chunk," not shared across multiple rows the way
// ConfigID is in cas-ccps's Ledger.
//
// Mirrors STUDIO_INTEGRATION_SPEC.md Step 7's own code sample exactly
// (same column, same linear scan) rather than relying on "@trigger.row"
// — that sample scans by Payload_UID for a reason worth keeping: by the
// time a multi-step flow reaches this point, re-deriving the row from
// Payload_UID is one linear scan over a small sheet and avoids any
// assumption about whether a trigger-row reference stays valid across
// several prior steps' execution time.
//
// Throws if the row can't be found — the caller decides what that
// means for its own writeStatus output; this function's only job is
// the lookup + write.
function markStagingPipelineComplete_(stagingPipelineSsId, payloadUid) {
  var ss = SpreadsheetApp.openById(stagingPipelineSsId);
  var sheet = ss.getSheetByName("STAGING_PIPELINE");
  if (!sheet) {
    throw new Error("No tab named \"STAGING_PIPELINE\" in spreadsheet " + stagingPipelineSsId);
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][STAGING_COLUMNS_.PAYLOAD_UID]).trim() === payloadUid) {
      sheet.getRange(i + 1, STAGING_COLUMNS_.STATUS + 1).setValue("FLOW_COMPLETE");
      SpreadsheetApp.flush();
      return;
    }
  }
  throw new Error("No STAGING_PIPELINE row found for Payload_UID " + payloadUid);
}

// Replaces a Drive document's entire body with the given text. Used by
// both steps for their Step 3 write-back. A plain "insert text" native
// connector isn't clearly documented as able to CLEAR existing content
// first (the doc's existing body is the raw source text at this point,
// not empty) — this uses DocumentApp directly, matching
// STUDIO_INTEGRATION_SPEC.md's own Step 6 code sample exactly
// (body.clear() before setText()), which is the one part of "replace
// the whole body" this project can't safely delegate to a native step
// without confirming that guarantee first.
function overwriteDocBody_(fileId, text) {
  var doc = DocumentApp.openById(fileId);
  var body = doc.getBody();
  body.clear();
  body.setText(text);
  doc.saveAndClose();
}
