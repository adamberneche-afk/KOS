// =============================================================================
// FILE: StepsShared.gs
// PROJECT: cas-ccps:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: Helpers shared by every custom Studio step in this project —
//          the config-card field builder, the safe-input reader, the
//          output-variable wrappers, and a random-token generator.
//          Factored out once here instead of once per step file, since
//          GAS concatenates every file in a project into one global
//          scope (see project-map.json's own top comment) — a second
//          copy of any of these in another file in THIS project would
//          crash the whole project at parse time, which is exactly what
//          tools/gas-lint/check.js's global-scope-collision check
//          exists to catch.
//
//          Adding a new step to this project: put its own file in
//          cas-ccps/studio-steps/, add its workflowElements entry to
//          cas-ccps/clasp/manifests/studio-steps.appsscript.json, add
//          its file to project-map.json's cas-ccps:studio-steps entry.
//          Nothing here needs to change unless the new step needs a
//          genuinely new shared helper.
// =============================================================================

// A text-input field wired to Studio's variable picker, so the person
// building a flow can map it to a prior step's output or the trigger
// row's columns, instead of typing a literal value. (They can still
// type a literal value in the same field if they want to — this only
// adds the option, it doesn't remove the plain-text one.)
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
// has no stringValues — rather than every execute function reaching
// straight into inputs[name].stringValues[0], which throws a raw
// TypeError ("Cannot read properties of undefined") for an unmapped
// field. That direct-read pattern is exactly what made every step's
// "fails closed" header claim untrue before this helper existed: an
// unmapped input threw before any status could be returned, silently
// stranding the trigger row instead of reporting a clear status the
// way every other failure path in this project already does. Every
// onXExecute in this project should read its inputs through this
// helper, not the raw stringValues[0] pattern, and should wrap its
// whole body in try/catch so a genuinely unexpected error (not just a
// missing input) still returns a status instead of throwing uncaught.
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

function intVar_(value) {
  return AddOnsResponseService.newVariableData().addIntegerValue(Math.trunc(Number(value) || 0));
}

// Wraps an already-built { outputId: VariableData, ... } map in the
// AddOnsResponseService boilerplate every step's onExecuteFunction needs
// to hand outputs back to the flow. Modeled directly on the confirmed
// outputVariables() pattern from Google's own "Build a calculator step"
// quickstart (AddOnsResponseService.newReturnOutputVariablesAction ->
// newHostAppAction -> newRenderActionBuilder), generalized to take a
// pre-built map instead of one hardcoded value.
function buildOutputRenderAction_(variableDataMap) {
  var workflowAction = AddOnsResponseService.newReturnOutputVariablesAction()
    .setVariableDataMap(variableDataMap);
  var hostAppAction = AddOnsResponseService.newHostAppAction()
    .setWorkflowAction(workflowAction);
  return AddOnsResponseService.newRenderActionBuilder()
    .setHostAppAction(hostAppAction)
    .build();
}

// A short random uppercase-hex token, length characters long. Used by
// CommitRubricDraftStep.gs (ConfigID) — the exact ID *format* string
// (the "VDOE-" prefix and date placement) is specific to that ID's own
// spec; only the random-token piece is shared.
function randomToken_(length) {
  return Utilities.getUuid().replace(/-/g, "").substring(0, length).toUpperCase();
}

// Strips a leading/trailing ```json or ``` markdown fence, same as
// 25_WarmUpWriter.js:740 — Gemini emits these routinely even when asked
// for raw JSON, and without stripping them a perfectly well-formed
// response fails validation for a formatting reason unrelated to the
// content itself. Shared here (not redeclared in CommitRubricDraftStep.gs
// and FinalizeWarmUpScoreStep.gs, both of which need it) because GAS
// concatenates every file in this project into one global scope — a
// second declaration would be exactly the parse-time crash this
// project's own gas-lint entry exists to catch.
function stripJsonFence_(text) {
  return String(text).replace(/```json|```/g, "").trim();
}
