// =============================================================================
// FILE: CommitRubricDraftStep.gs
// PROJECT: cas-ccps:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: A Workspace Studio custom step that replaces Step 3 of Flow 1
//          (Rubric Extraction) as specified in
//          cas-ccps/scripts/15_StudioFlowPrompts.js: "Write DRAFT row to
//          Teacher Matrix." Step 4 ("Mark RubricQueue row complete")
//          stays a native Studio "Google Sheets — Update row" step,
//          which can already reference "@trigger row" directly —
//          nothing about that step is awkward enough to justify custom
//          code. Step 3 is: it requires parsing an arbitrary JSON blob
//          and mapping its fields onto specific spreadsheet columns,
//          which native Sheets connectors don't do cleanly. That
//          parsing/validation/column-mapping work is what this file
//          does.
//
//          Steps 1 (Drive — read prompt template) and 2 (Ask Gemini)
//          stay native Studio steps too — this preserves the "Walled
//          Garden" design already established in this repo (see
//          15c_Flow2DirectEvaluationService.js's header: Studio's
//          native Gemini access needs no API key for anyone to
//          manage). This step never calls Gemini itself; it only
//          consumes the JSON text a native Gemini step already
//          produced.
//
// TeacherMatrix column schema: kept identical to TM08 in
// 08_TeacherConfirmationStep.js (the script that reads what this step
// writes, and the authoritative source for this schema). If that
// file's schema changes, TM_COLUMNS_ below must change with it.
//
// FENCE-STRIPPING: Gemini routinely wraps JSON output in a ```json ...
// ``` markdown fence even when asked for raw JSON. Stripped the same
// way 25_WarmUpWriter.js:740 already does before its own JSON.parse —
// without this, a perfect Gemini response fails validation for a
// formatting reason that has nothing to do with the rubric content.
//
// INPUT READING / ERROR HANDLING: every input is read through
// StepsShared.gs's inStr_() rather than the raw
// inputs["x"].stringValues[0] pattern, and the whole execute function
// body is wrapped in try/catch — see inStr_()'s own header for why.
// =============================================================================

// -----------------------------------------------------------------------
// TeacherMatrix column indices (0-based) — mirrors TM08 in
// 08_TeacherConfirmationStep.js exactly. 20 columns total.
// -----------------------------------------------------------------------
var TM_COLUMNS_ = {
  CONFIG_ID: 0,
  UNIT_NAME: 1,
  TIER: 2,
  PERSONA: 3,
  MILESTONE_1: 4,
  MILESTONE_2: 5,
  MILESTONE_3: 6,
  MILESTONE_4: 7,
  DOD: 8,
  INSTRUCTOR_EMAIL: 9,
  CREATED: 10,
  STATUS: 11,               // DRAFT | REVIEW_SENT | LIVE | ARCHIVED
  PROMPT_TEMPLATE_ID: 12,
  SUBJECT: 13,
  COURSE_NAME: 14,
  // ── M5 ── left blank here; filled in later by the teacher during
  // confirmation — same "intentionally blank on pre-fill" convention
  // 08_TeacherConfirmationStep.js already uses for these columns.
  MILESTONE_1_COMPETENCY_ID: 15,
  MILESTONE_2_COMPETENCY_ID: 16,
  MILESTONE_3_COMPETENCY_ID: 17,
  MILESTONE_4_COMPETENCY_ID: 18,
  // ── M6 ── also left blank; teacher-assigned during confirmation.
  LESSON_UNIT_ID: 19,
};
var TM_COLUMN_COUNT_ = 20;

var REQUIRED_RUBRIC_FIELDS_ = [
  "unitName", "persona", "milestone1", "milestone2",
  "milestone3", "milestone4", "definitionOfDone",
];

// =============================================================================
// onCommitRubricDraftConfig — builds the step's configuration card.
//
// CONFIDENCE NOTE: the public "Build a calculator step with Apps
// Script" quickstart confirms the *input field* construction
// (variableTextInput_, in StepsShared.gs) and the onExecuteFunction
// mechanics below precisely. What the publicly available walkthrough
// text didn't give me a clean, complete view of is this function's own
// closing return statement or exactly how its Save button is wired.
// What's below follows the standard CardService pattern used by every
// other kind of Workspace Add-on config card, which is very likely
// right — but treat this one function, and the manifest's
// "state": "PUBLISHED" field, as the two things to double-check
// against the live walkthrough during test-deploy, not as verified the
// way the rest of this file is.
// =============================================================================
function onCommitRubricDraftConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("geminiJsonOutput", "Gemini rubric-extraction output (JSON)"))
    .addWidget(variableTextInput_("teacherMatrixSsId", "Teacher Matrix spreadsheet ID"))
    .addWidget(variableTextInput_("teacherEmail", "Instructor email"))
    .addWidget(variableTextInput_("promptTemplateId", "Prompt template file ID"))
    .addWidget(variableTextInput_("subject", "Subject"))
    .addWidget(variableTextInput_("courseName", "Course name"))
    .addWidget(variableTextInput_("tier", "Academic tier"));

  var saveAction = CardService.newAction().setFunctionName("onCommitRubricDraftConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Commit Rubric Draft"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

// =============================================================================
// onCommitRubricDraftExecute — runs when the step executes in a live
// flow. Reads the 7 configured inputs, validates the Gemini JSON,
// writes the DRAFT row, and returns configId/status/errorDetail. Never
// throws — every failure path returns status: "VALIDATION_FAILED"
// with a human-readable errorDetail instead (including the outer
// try/catch, for anything unexpected the inner checks don't already
// cover), so a bad Gemini response shows up as a clear message in the
// flow's run log rather than a raw stack trace. Matches this repo's
// existing principle (see 15c_Flow2DirectEvaluationService.js's
// _parseFlow2MilestoneOutcomes_): never trust the model to have
// followed the JSON schema perfectly, and never write a row built from
// data that didn't validate.
// =============================================================================
function onCommitRubricDraftExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries the rubric JSON (teacher-authored, not student PII, but
  // still not something this step needs to put in Stackdriver on every
  // run; see this project's README for the general PII-logging policy
  // every step in this project follows).
  Logger.log("[CommitRubricDraftStep] execute start");

  try {
    var inputs = event.workflow.actionInvocation.inputs;
    var geminiJsonOutput  = inStr_(inputs, "geminiJsonOutput");
    var teacherMatrixSsId = inStr_(inputs, "teacherMatrixSsId");
    var teacherEmail      = inStr_(inputs, "teacherEmail");
    var promptTemplateId  = inStr_(inputs, "promptTemplateId");
    var subject           = inStr_(inputs, "subject");
    var courseName        = inStr_(inputs, "courseName");
    var tier               = inStr_(inputs, "tier");

    var parsed = parseAndValidateRubricJson_(geminiJsonOutput);
    if (!parsed.ok) {
      return buildOutputRenderAction_({
        configId: stringVar_(""),
        status: stringVar_("VALIDATION_FAILED"),
        errorDetail: stringVar_(parsed.error),
      });
    }

    var configId = generateRubricConfigId_();
    var row = buildTeacherMatrixRow_(configId, parsed.data, {
      teacherEmail: teacherEmail,
      promptTemplateId: promptTemplateId,
      subject: subject,
      courseName: courseName,
      tier: tier,
    });

    try {
      appendTeacherMatrixRow_(teacherMatrixSsId, row);
    } catch (e) {
      return buildOutputRenderAction_({
        configId: stringVar_(""),
        status: stringVar_("VALIDATION_FAILED"),
        errorDetail: stringVar_("Could not write to Teacher Matrix: " + e.message),
      });
    }

    return buildOutputRenderAction_({
      configId: stringVar_(configId),
      status: stringVar_("DRAFT_WRITTEN"),
      errorDetail: stringVar_(""),
    });
  } catch (e) {
    // Anything unexpected (a missing input inStr_ wasn't asked to
    // default, a genuine runtime error) — still return a status rather
    // than throw uncaught, per this project's "fails closed" rule.
    return buildOutputRenderAction_({
      configId: stringVar_(""),
      status: stringVar_("VALIDATION_FAILED"),
      errorDetail: stringVar_("Unexpected error: " + e.message),
    });
  }
}

// Parses geminiJsonOutput and checks that all 7 fields
// FLOW_1_SYSTEM_PROMPT requires (unitName, persona, milestone1-4,
// definitionOfDone) are present and non-empty strings. Returns
// { ok: true, data } or { ok: false, error }. Never throws.
function parseAndValidateRubricJson_(rawText) {
  var data;
  try {
    data = JSON.parse(stripJsonFence_(rawText));
  } catch (e) {
    return { ok: false, error: "Gemini output was not valid JSON: " + e.message };
  }

  var missing = [];
  for (var i = 0; i < REQUIRED_RUBRIC_FIELDS_.length; i++) {
    var field = REQUIRED_RUBRIC_FIELDS_[i];
    if (typeof data[field] !== "string" || data[field].trim() === "") {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: "Missing or empty required field(s): " + missing.join(", "),
    };
  }

  return { ok: true, data: data };
}

// Matches the format specified in 15_StudioFlowPrompts.js's Flow 1 Step
// 3: "VDOE-" + randomToken + "-" + year. The exact token algorithm
// isn't specified there — this uses 8 characters from the shared
// randomToken_() in StepsShared.gs. Short enough to stay readable in a
// spreadsheet cell; long enough that a same-second collision between
// two teachers submitting rubrics simultaneously is not a practical
// concern.
function generateRubricConfigId_() {
  return "VDOE-" + randomToken_(8) + "-" + new Date().getFullYear();
}

// Assembles the 20-column TeacherMatrix row. Columns 15-19 (the M5
// competency IDs and M6 lesson_unit_id) are left as empty strings —
// deliberately, not an oversight; see the header note above.
function buildTeacherMatrixRow_(configId, rubricData, meta) {
  var row = [];
  for (var i = 0; i < TM_COLUMN_COUNT_; i++) row.push("");

  row[TM_COLUMNS_.CONFIG_ID] = configId;
  row[TM_COLUMNS_.UNIT_NAME] = rubricData.unitName;
  row[TM_COLUMNS_.TIER] = meta.tier;
  row[TM_COLUMNS_.PERSONA] = rubricData.persona;
  row[TM_COLUMNS_.MILESTONE_1] = rubricData.milestone1;
  row[TM_COLUMNS_.MILESTONE_2] = rubricData.milestone2;
  row[TM_COLUMNS_.MILESTONE_3] = rubricData.milestone3;
  row[TM_COLUMNS_.MILESTONE_4] = rubricData.milestone4;
  row[TM_COLUMNS_.DOD] = rubricData.definitionOfDone;
  row[TM_COLUMNS_.INSTRUCTOR_EMAIL] = meta.teacherEmail;
  row[TM_COLUMNS_.CREATED] = new Date();
  row[TM_COLUMNS_.STATUS] = "DRAFT";
  row[TM_COLUMNS_.PROMPT_TEMPLATE_ID] = meta.promptTemplateId;
  row[TM_COLUMNS_.SUBJECT] = meta.subject;
  row[TM_COLUMNS_.COURSE_NAME] = meta.courseName;

  return row;
}

// Opens the teacher's Teacher Matrix by ID and appends one row to the
// "TeacherMatrix" tab. Throws if the spreadsheet can't be opened or the
// tab doesn't exist — the caller (onCommitRubricDraftExecute) catches
// this and turns it into a VALIDATION_FAILED output rather than
// letting it surface as a raw execution error in the flow run log.
function appendTeacherMatrixRow_(spreadsheetId, row) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName("TeacherMatrix");
  if (!sheet) {
    throw new Error("No tab named \"TeacherMatrix\" in spreadsheet " + spreadsheetId);
  }
  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, 1, row.length).setValues([row]);
}
