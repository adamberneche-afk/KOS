// =============================================================================
// FILE: ReadInstructorConfigStep.gs
// PROJECT: cas-ccps:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: A Workspace Studio custom step implementing Flow 2's Step 2
//          (WIDENED), as specified in
//          15b_StudioFlowPrompts_Flow2_Revised.js: a 3-hop lookup —
//          Ledger -> MatrixRegistry -> TeacherMatrix — that resolves
//          the trigger's ConfigID into everything Step 3 (Ask Gemini)
//          and the (not-yet-landed) commitStudentEvaluation step need.
//
// DEVIATES FROM 15b'S LITERAL TEXT — DELIBERATELY, DOCUMENTED HERE:
//   15b's spec says "Ledger -> match ConfigID = @trigger.ConfigID" —
//   a single-key match. That's fine for TeacherEmail (shared by every
//   student assigned the same rubric — see 03_QueueBridge.js's
//   lookupTeacherEmail_, which does exactly this, safely, for that
//   reason), but 15b's Step 2 ALSO reads GoogleID off that same
//   match — and GoogleID is a per-STUDENT field. A ConfigID-only
//   match against Ledger returns the FIRST row for that assignment,
//   which is only correct if exactly one student shares that
//   ConfigID. Since a rubric/ConfigID is normally used by an entire
//   class, this would silently attach the wrong student's GoogleID
//   whenever more than one student's evaluation is in flight for the
//   same assignment — which is the normal case, not an edge case.
//
//   04_Form2_TurnInGate.js's own findLedgerRow_() already establishes
//   the fix this codebase uses elsewhere: match on multiple keys, not
//   ConfigID alone (it uses googleId + configId + fileId together).
//   This step follows that same precedent, matching Ledger on
//   ConfigID + FileID (StudentFileID is already on the STAGING_PIPELINE
//   trigger row at column 2 — see 03_QueueBridge.js's bridgeQueue(),
//   and Flow 2's own Step 1 already reads @trigger.StudentFileID — so
//   this costs nothing extra to obtain correctly).
//
// SCHEMA SOURCES (confirmed directly from each tab's actual writer
// function, not assumed):
//   Ledger         — registerLedger_() in 02_Form1_IntakeAndWorkspaceGenerator.js
//   MatrixRegistry — fetchAssignment_() in the same file
//   TeacherMatrix  — TM_COLUMNS_, already defined in this project's
//                    CommitRubricDraftStep.gs (same GAS global scope —
//                    reused here, not redeclared, per this project's
//                    own "don't redeclare shared constants" rule)
//
// INPUT READING / ERROR HANDLING: every input is read through
// StepsShared.gs's inStr_() rather than the raw
// inputs["x"].stringValues[0] pattern, and the whole execute function
// body is wrapped in try/catch — see inStr_()'s own header for why.
// =============================================================================

var LEDGER_COLUMNS_ = {
  TIMESTAMP: 0, GOOGLE_ID: 1, CONFIG_ID: 2, FILE_ID: 3, STUDENT_NAME: 4,
  BLOCK: 5, CLASS_NAME: 6, TEACHER_NAME: 7, TEACHER_EMAIL: 8, SUBJECT: 9,
  COURSE_NAME: 10, PERIOD: 11, STATUS: 12, SUBMISSION_TS: 13, NOTES: 14,
  LAST_EVAL: 15, ADMIN_FILE_URL: 16, STUDENT_FILE_URL: 17, ACADEMIC_YEAR: 18,
};

var MATRIX_REGISTRY_COLUMNS_ = {
  TEACHER_NAME: 0, TEACHER_EMAIL: 1, MATRIX_SS_ID: 2, CREATED: 3,
};

// =============================================================================
// onReadInstructorConfigConfig
// See CommitRubricDraftStep.gs's onCommitRubricDraftConfig() for the
// same confidence note on this function's return/Save-button wiring.
// =============================================================================
function onReadInstructorConfigConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("ledgerSsId", "Central Ledger spreadsheet ID"))
    .addWidget(variableTextInput_("configId", "ConfigID (from trigger row)"))
    .addWidget(variableTextInput_("studentFileId", "Student submission doc ID (from trigger row)"));

  var saveAction = CardService.newAction().setFunctionName("onReadInstructorConfigConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Read Instructor Config"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

// =============================================================================
// onReadInstructorConfigExecute
// Never throws. Every hop can fail independently (Ledger row not
// found, MatrixRegistry row not found, TeacherMatrix assignment row
// not found) — lookupStatus tells the flow builder which one, so a
// native "Check if lookupStatus = OK" step can gate Step 3 (Ask
// Gemini) rather than running evaluation against empty/garbage
// config. This step deliberately does NOT decide what happens on
// failure — that's a flow-level decision, made once when Flow 2 is
// built in Studio, not baked into this step.
// =============================================================================
function onReadInstructorConfigExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries student-identifying fields (GoogleID, FileID); see this
  // project's README for the general PII-logging policy every step in
  // this project follows.
  Logger.log("[ReadInstructorConfigStep] execute start");

  try {
    var inputs = event.workflow.actionInvocation.inputs;
    var ledgerSsId = inStr_(inputs, "ledgerSsId");
    var configId = inStr_(inputs, "configId");
    var studentFileId = inStr_(inputs, "studentFileId");

    var ledgerRow;
    try {
      ledgerRow = findLedgerRow_(ledgerSsId, configId, studentFileId);
    } catch (e) {
      return emptyConfigOutput_("LEDGER_LOOKUP_ERROR: " + e.message);
    }
    if (!ledgerRow) {
      return emptyConfigOutput_("LEDGER_ROW_NOT_FOUND");
    }

    var matrixSsId;
    try {
      matrixSsId = findMatrixSsId_(ledgerSsId, ledgerRow.teacherEmail);
    } catch (e) {
      return emptyConfigOutput_("MATRIX_REGISTRY_LOOKUP_ERROR: " + e.message);
    }
    if (!matrixSsId) {
      return emptyConfigOutput_("MATRIX_REGISTRY_ROW_NOT_FOUND");
    }

    var matrixRow;
    try {
      matrixRow = findTeacherMatrixRow_(matrixSsId, configId);
    } catch (e) {
      return emptyConfigOutput_("TEACHER_MATRIX_LOOKUP_ERROR: " + e.message);
    }
    if (!matrixRow) {
      return emptyConfigOutput_("TEACHER_MATRIX_ASSIGNMENT_NOT_FOUND");
    }

    return buildOutputRenderAction_({
      studentEmail: stringVar_(ledgerRow.googleId),
      teacherEmail: stringVar_(ledgerRow.teacherEmail),
      unitName: stringVar_(matrixRow.unitName),
      tier: stringVar_(matrixRow.tier),
      persona: stringVar_(matrixRow.persona),
      milestone1Text: stringVar_(matrixRow.milestone1),
      milestone2Text: stringVar_(matrixRow.milestone2),
      milestone3Text: stringVar_(matrixRow.milestone3),
      milestone4Text: stringVar_(matrixRow.milestone4),
      definitionOfDone: stringVar_(matrixRow.dod),
      milestone1CompetencyId: stringVar_(matrixRow.milestone1CompetencyId),
      milestone2CompetencyId: stringVar_(matrixRow.milestone2CompetencyId),
      milestone3CompetencyId: stringVar_(matrixRow.milestone3CompetencyId),
      milestone4CompetencyId: stringVar_(matrixRow.milestone4CompetencyId),
      lookupStatus: stringVar_("OK"),
    });
  } catch (e) {
    return emptyConfigOutput_("UNEXPECTED_ERROR: " + e.message);
  }
}

// Builds an all-empty-string output map with only lookupStatus set —
// the shared failure path for all three lookup hops above.
function emptyConfigOutput_(statusDetail) {
  return buildOutputRenderAction_({
    studentEmail: stringVar_(""),
    teacherEmail: stringVar_(""),
    unitName: stringVar_(""),
    tier: stringVar_(""),
    persona: stringVar_(""),
    milestone1Text: stringVar_(""),
    milestone2Text: stringVar_(""),
    milestone3Text: stringVar_(""),
    milestone4Text: stringVar_(""),
    definitionOfDone: stringVar_(""),
    milestone1CompetencyId: stringVar_(""),
    milestone2CompetencyId: stringVar_(""),
    milestone3CompetencyId: stringVar_(""),
    milestone4CompetencyId: stringVar_(""),
    lookupStatus: stringVar_(statusDetail),
  });
}

// Hop 1: Ledger, matched on ConfigID + FileID together — see this
// file's header note on why FileID is required here, not optional.
function findLedgerRow_(ledgerSsId, configId, studentFileId) {
  var ss = SpreadsheetApp.openById(ledgerSsId);
  var sheet = ss.getSheetByName("Ledger");
  if (!sheet) {
    throw new Error("No tab named \"Ledger\" in spreadsheet " + ledgerSsId);
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (
      String(data[i][LEDGER_COLUMNS_.CONFIG_ID]).trim() === configId &&
      String(data[i][LEDGER_COLUMNS_.FILE_ID]).trim() === studentFileId
    ) {
      return {
        googleId: String(data[i][LEDGER_COLUMNS_.GOOGLE_ID]).trim(),
        teacherEmail: String(data[i][LEDGER_COLUMNS_.TEACHER_EMAIL]).trim(),
      };
    }
  }
  return null;
}

// Hop 2: MatrixRegistry, matched on TeacherEmail (safe — one registry
// row per teacher, not per student, per fetchAssignment_'s own comment
// "Each teacher's matrix is registered once").
function findMatrixSsId_(ledgerSsId, teacherEmail) {
  var ss = SpreadsheetApp.openById(ledgerSsId);
  var sheet = ss.getSheetByName("MatrixRegistry");
  if (!sheet) {
    throw new Error("No tab named \"MatrixRegistry\" in spreadsheet " + ledgerSsId);
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][MATRIX_REGISTRY_COLUMNS_.TEACHER_EMAIL]).trim().toLowerCase()
        === teacherEmail.toLowerCase()) {
      var id = String(data[i][MATRIX_REGISTRY_COLUMNS_.MATRIX_SS_ID]).trim();
      return id || null;
    }
  }
  return null;
}

// Hop 3: TeacherMatrix, matched on ConfigID. Reuses TM_COLUMNS_ from
// CommitRubricDraftStep.gs (same project, same global scope) rather
// than redefining its own copy.
function findTeacherMatrixRow_(matrixSsId, configId) {
  var ss = SpreadsheetApp.openById(matrixSsId);
  var sheet = ss.getSheetByName("TeacherMatrix");
  if (!sheet) {
    throw new Error("No tab named \"TeacherMatrix\" in spreadsheet " + matrixSsId);
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][TM_COLUMNS_.CONFIG_ID]).trim() === configId) {
      return {
        unitName: String(data[i][TM_COLUMNS_.UNIT_NAME]).trim(),
        tier: String(data[i][TM_COLUMNS_.TIER]).trim(),
        persona: String(data[i][TM_COLUMNS_.PERSONA]).trim(),
        milestone1: String(data[i][TM_COLUMNS_.MILESTONE_1]).trim(),
        milestone2: String(data[i][TM_COLUMNS_.MILESTONE_2]).trim(),
        milestone3: String(data[i][TM_COLUMNS_.MILESTONE_3]).trim(),
        milestone4: String(data[i][TM_COLUMNS_.MILESTONE_4]).trim(),
        dod: String(data[i][TM_COLUMNS_.DOD]).trim(),
        milestone1CompetencyId: String(data[i][TM_COLUMNS_.MILESTONE_1_COMPETENCY_ID] || "").trim(),
        milestone2CompetencyId: String(data[i][TM_COLUMNS_.MILESTONE_2_COMPETENCY_ID] || "").trim(),
        milestone3CompetencyId: String(data[i][TM_COLUMNS_.MILESTONE_3_COMPETENCY_ID] || "").trim(),
        milestone4CompetencyId: String(data[i][TM_COLUMNS_.MILESTONE_4_COMPETENCY_ID] || "").trim(),
      };
    }
  }
  return null;
}
