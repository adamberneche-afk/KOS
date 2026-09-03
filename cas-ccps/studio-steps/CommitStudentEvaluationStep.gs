// =============================================================================
// FILE: CommitStudentEvaluationStep.gs
// PROJECT: cas-ccps:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: A Workspace Studio custom step that implements Flow 2's Step
//          3b (relay/split) and Step 5b (CompetencyEvidence write), as
//          specified in cas-ccps/scripts/15b_StudioFlowPrompts_Flow2_Revised.js.
//          That file's own header calls Step 3b's connector an "OPEN
//          IMPLEMENTATION DETAIL... deliberate, explicitly flagged gap,
//          not an oversight" — this step is that implementation.
//
//          Also produces the fully-formatted feedback block for Step 5
//          (native "Insert text"), so Step 5 needs no native
//          conditional logic — just insert this step's
//          formattedFeedbackBlock output directly.
//
// STAYS NATIVE (same "only build custom code for what's genuinely
// awkward" principle as CommitRubricDraftStep.gs):
//   Step 1 (Docs — get student doc content)
//   Step 2 (Sheets — Ledger → MatrixRegistry → TeacherMatrix lookup
//     chain, now covered by this project's own ReadInstructorConfigStep.gs)
//   Step 3 (Ask Gemini, FLOW_2_SYSTEM_PROMPT) — Walled Garden
//     principle, same as Flow 1's step: this step never calls Gemini
//     itself.
//   Step 4 (Docs — remove "No feedback yet" placeholder)
//   Step 6 (Sheets — mark STAGING_PIPELINE row COMPLETE) — must run
//     regardless of this step's outcome (15b's own spec calls this a
//     "finally-equivalent guarantee"); this step is written to NEVER
//     throw, so Step 6 always executes next no matter what this step
//     encounters.
//
// PARSING LOGIC NOTE: this project is a separate, standalone Apps
// Script project from cas-ccps:central-ledger, where
// 15c_Flow2DirectEvaluationService.js's own compliance/outcome parsing
// already lives. GAS has no cross-project function calls without an
// Apps Script library, so the parsing below is a deliberate, minimal
// reimplementation — not a call into that file's
// _parseFlow2MilestoneOutcomes_(). If the [MILESTONE_OUTCOMES: ...] or
// [SYSTEM: ...] line formats ever change, both copies need updating.
// Same constraint this codebase already lives with for
// 00_SharedConfig.js across all 7 cas-ccps container-bound projects —
// not a new problem this step introduces.
//
// COMPETENCYEVIDENCE SCHEMA: 9 columns (evidence_id, student_email,
// competency_id, milestone_text, outcome, config_id, evaluated_at,
// student_file_id, archive_status — the last added by roadmap 2.2,
// "explicit archive/hibernate state"; see
// 30_SCRSuggestionEngine.js's _archiveExpiredCompetencyEvidence_()/
// reactivateCompetencyEvidence_()), byte-identical in shape and order to
// 15c_Flow2DirectEvaluationService.js's own writeCompetencyEvidenceFromFlow2_()
// in cas-ccps:central-ledger — confirmed these are the tab's only two
// writers, and its one reader (30_SCRSuggestionEngine.js's
// aggregateEvidence_()) resolves columns by header NAME, not position,
// so keeping both writers' header/column order identical is what makes
// the reader correct regardless of which one seeds the tab first. If
// this schema ever changes, that file's writer must change with it.
//
// U+2500 MARKERS: formatFeedbackBlock_() below uses the real U+2500
// box-drawing character ("── EVALUATION ... ──" / "── END EVALUATION ──"),
// not an ASCII "--" transliteration. 03_QueueBridge.js's and
// 09_StudentRevisionGuidance_M1Base.js's own body.findText() calls only
// match the real U+2500 form (confirmed by byte inspection) — an ASCII
// version would silently break both files' "insert next-steps text
// right after the evaluation" logic on every Flow 2 run. Canonical form
// confirmed at 15_StudioFlowPrompts.js:261-265; see that file and
// 15b_StudioFlowPrompts_Flow2_Revised.js's own corrected comment for
// the full story of where the ASCII version came from.
//
// TAB CREATION: writeCompetencyEvidence_() below creates the
// "CompetencyEvidence" tab if it doesn't exist yet, rather than
// throwing. This step IS Flow 2's real writer of that tab — throwing
// on a missing tab (with the outer try/catch swallowing it, per this
// step's own "never throw" contract) would mean evidence silently
// never lands on a fresh deployment, which is exactly the "this repo
// has no code that creates this tab" gap docs/FERPA_DATA_MAP.md used to
// describe.
//
// INPUT READING / ERROR HANDLING: every input is read through
// StepsShared.gs's inStr_() rather than a local unguarded
// inputs["x"].stringValues[0] pattern, and the whole execute function
// body is wrapped in try/catch — see inStr_()'s own header for why.
// =============================================================================

var MILESTONE_OUTCOME_VALUES_ = ["MET", "PARTIALLY_MET", "NOT_MET"];

// =============================================================================
// onCommitStudentEvaluationConfig
// See CommitRubricDraftStep.gs's onCommitRubricDraftConfig() for the
// same confidence note on this function's return/Save-button wiring.
// =============================================================================
function onCommitStudentEvaluationConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("geminiFullOutput", "Gemini evaluation output (full text)"))
    .addWidget(variableTextInput_("ledgerSsId", "Central Ledger spreadsheet ID"))
    .addWidget(variableTextInput_("configId", "ConfigID"))
    .addWidget(variableTextInput_("studentEmail", "Student email"))
    .addWidget(variableTextInput_("studentFileId", "Student submission doc ID"))
    .addWidget(variableTextInput_("milestone1CompetencyId", "Milestone 1 competency ID"))
    .addWidget(variableTextInput_("milestone2CompetencyId", "Milestone 2 competency ID"))
    .addWidget(variableTextInput_("milestone3CompetencyId", "Milestone 3 competency ID"))
    .addWidget(variableTextInput_("milestone4CompetencyId", "Milestone 4 competency ID"))
    .addWidget(variableTextInput_("milestone1Text", "Milestone 1 text"))
    .addWidget(variableTextInput_("milestone2Text", "Milestone 2 text"))
    .addWidget(variableTextInput_("milestone3Text", "Milestone 3 text"))
    .addWidget(variableTextInput_("milestone4Text", "Milestone 4 text"));

  var saveAction = CardService.newAction().setFunctionName("onCommitStudentEvaluationConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Commit Student Evaluation"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

// =============================================================================
// onCommitStudentEvaluationExecute
// Never throws — every failure path still returns normal outputs, so
// this step never aborts the flow before Step 6 (mark row complete)
// can run. Matches 15b's explicit "must always run... finally-
// equivalent guarantee" requirement for Step 6, and its "a failure to
// parse evidence must never block the student from receiving their
// feedback" requirement for Step 5.
// =============================================================================
function onCommitStudentEvaluationExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries the student's full evaluation text and identifying fields;
  // see this project's README for the general PII-logging policy every
  // step in this project follows.
  Logger.log("[CommitStudentEvaluationStep] execute start");

  try {
    var inputs = event.workflow.actionInvocation.inputs;
    var geminiFullOutput = inStr_(inputs, "geminiFullOutput");
    var ledgerSsId = inStr_(inputs, "ledgerSsId");
    var configId = inStr_(inputs, "configId");
    var studentEmail = inStr_(inputs, "studentEmail");
    var studentFileId = inStr_(inputs, "studentFileId");

    var competencyIds = {
      "1": inStr_(inputs, "milestone1CompetencyId"), "2": inStr_(inputs, "milestone2CompetencyId"),
      "3": inStr_(inputs, "milestone3CompetencyId"), "4": inStr_(inputs, "milestone4CompetencyId"),
    };
    var milestoneTexts = {
      "1": inStr_(inputs, "milestone1Text"), "2": inStr_(inputs, "milestone2Text"),
      "3": inStr_(inputs, "milestone3Text"), "4": inStr_(inputs, "milestone4Text"),
    };

    // Step 3b equivalent: split the raw Gemini output into the
    // student-facing report and the parsed milestone outcomes.
    var split = splitGeminiOutput_(geminiFullOutput);
    var formattedFeedbackBlock = formatFeedbackBlock_(split.studentFacingReport);

    // Step 5b equivalent. A parse failure (split.outcomesParsed === null)
    // must not throw or block the student's feedback above — it just
    // means zero evidence rows get written this run, which is exactly
    // what 15b's spec calls for.
    var evidenceResult = { written: 0, skipped: 0 };
    try {
      evidenceResult = writeCompetencyEvidence_(
        ledgerSsId, configId, studentEmail, studentFileId,
        competencyIds, milestoneTexts, split.outcomesParsed
      );
    } catch (e) {
      Logger.log("[CommitStudentEvaluationStep] evidence write failed, continuing: " + e.message);
    }

    return buildOutputRenderAction_({
      formattedFeedbackBlock: stringVar_(formattedFeedbackBlock),
      evidenceWritten: intVar_(evidenceResult.written),
      evidenceSkipped: intVar_(evidenceResult.skipped),
      parseStatus: stringVar_(split.outcomesParsed === null ? "MILESTONE_OUTCOMES_PARSE_FAILED" : "OK"),
    });
  } catch (e) {
    // Even a genuinely unexpected error must not throw uncaught here —
    // Step 6 (mark STAGING_PIPELINE row complete) has to run next no
    // matter what, per 15b's "finally-equivalent guarantee." Falls back
    // to the student's full, unsplit Gemini output as the feedback
    // block rather than an empty one, so the student still gets
    // something even in this genuinely unexpected case.
    var fallbackEvent = (event && event.workflow && event.workflow.actionInvocation && event.workflow.actionInvocation.inputs) || {};
    var fallbackText = inStr_(fallbackEvent, "geminiFullOutput", "");
    return buildOutputRenderAction_({
      formattedFeedbackBlock: stringVar_(formatFeedbackBlock_(fallbackText)),
      evidenceWritten: intVar_(0),
      evidenceSkipped: intVar_(0),
      parseStatus: stringVar_("UNEXPECTED_ERROR: " + e.message),
    });
  }
}

// Finds the [MILESTONE_OUTCOMES: {...}] line (matched on the bracket
// text itself, per 15b's spec, not on position — it moves depending on
// whether a [SUGGESTED_SCORE: N] line is present), removes exactly
// that line from the text, and parses its JSON. If the line is missing
// or its JSON is malformed, studentFacingReport falls back to the
// FULL original text — nothing is lost for the student — and
// outcomesParsed is null.
function splitGeminiOutput_(fullText) {
  var text = String(fullText || "");
  var match = text.match(/\[MILESTONE_OUTCOMES:\s*(\{[\s\S]*?\})\]\s*/);

  if (!match) {
    return { studentFacingReport: text, outcomesParsed: null };
  }

  var studentFacingReport =
    (text.slice(0, match.index) + text.slice(match.index + match[0].length))
      .replace(/\s+$/, "");

  var parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (e) {
    return { studentFacingReport: studentFacingReport, outcomesParsed: null };
  }

  var outcomes = {};
  ["1", "2", "3", "4"].forEach(function (k) {
    var v = parsed[k];
    outcomes[k] = MILESTONE_OUTCOME_VALUES_.indexOf(v) !== -1 ? v : null;
  });
  return { studentFacingReport: studentFacingReport, outcomesParsed: outcomes };
}

// Builds the exact block Step 5 inserts after "-- FEEDBACK --",
// matching 15_StudioFlowPrompts.js's original Step 5 spec verbatim —
// unchanged by the Flow 2 revision (15b's header, point 1: "every
// other section... UNCHANGED"). Uses the real U+2500 box-drawing
// character for both markers (see this file's own header) and
// Session.getScriptTimeZone() rather than a hardcoded zone string
// (matches every other Utilities.formatDate() call in this repo).
function formatFeedbackBlock_(studentFacingReport) {
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  var resultLine = studentFacingReport.indexOf("[SYSTEM: APPROVED]") !== -1
    ? "✅ RESULT: YOUR WORK MEETS THE STANDARD"
    : "✏️  RESULT: REVISIONS REQUIRED";

  return "\n── EVALUATION " + timestamp + " ──\n" +
    resultLine + "\n\n" +
    studentFacingReport +
    "\n── END EVALUATION ──\n";
}

// Step 5b equivalent. Skips any milestone where the competency ID is
// blank OR outcomesParsed has no valid value for it — covers both a
// pre-Module-5 assignment and a Step-3b-equivalent parse failure, the
// same two cases 15b's DEPENDENCY note calls out. Creates the
// "CompetencyEvidence" tab if it doesn't exist yet (see this file's own
// header on why — this step IS Flow 2's writer, unlike the dev-only
// bridge in 15c_Flow2DirectEvaluationService.js), then defensively
// writes a header row too if the tab is empty, same reasoning that
// file's writeCompetencyEvidenceFromFlow2_ already uses for this exact
// tab.
function writeCompetencyEvidence_(ledgerSsId, configId, studentEmail, studentFileId,
                                    competencyIds, milestoneTexts, outcomesParsed) {
  var written = 0, skipped = 0;
  var rows = [];
  var now = new Date();

  ["1", "2", "3", "4"].forEach(function (n) {
    var competencyId = competencyIds[n];
    var outcome = outcomesParsed ? outcomesParsed[n] : null;
    if (!competencyId || !outcome) {
      skipped++;
      return;
    }
    rows.push([
      "EVD-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd") + "-" + randomToken_(6),
      studentEmail,
      competencyId,
      milestoneTexts[n],
      outcome,
      configId,
      now,
      studentFileId,
      "", // archive_status — blank until _archiveExpiredCompetencyEvidence_()
          // ages it out, or reactivateCompetencyEvidence_() clears it back
          // (30_SCRSuggestionEngine.js, roadmap 2.2)
    ]);
    written++;
  });

  if (rows.length > 0) {
    var ss = SpreadsheetApp.openById(ledgerSsId);
    var sheet = ss.getSheetByName("CompetencyEvidence");
    if (!sheet) {
      sheet = ss.insertSheet("CompetencyEvidence");
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 9).setValues([[
        "evidence_id", "student_email", "competency_id", "milestone_text",
        "outcome", "config_id", "evaluated_at", "student_file_id", "archive_status",
      ]]);
    }
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, 9).setValues(rows);
  }

  return { written: written, skipped: skipped };
}
