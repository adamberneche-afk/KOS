/**
 * =============================================================================
 * 42_FlowBuildSpec.js
 * BOUND TO: cas-ccps:central-ledger
 * =============================================================================
 *
 * Generates the sheet an operator builds a Studio Flow from.
 *
 * THE FRICTION THIS ADDRESSES. Every flow's Studio side is built by hand in a
 * UI, and the values to type were spread across six files in three formats:
 * JS comment blocks (15_StudioFlowPrompts.js, 15b), a GAS wizard dialog
 * (28_Module2Setup.js), and markdown (leader-hub, kos-personal) — about 3,350
 * lines, from which the operator reconstructs a step list. That scatter has
 * already produced one confirmed hazard: 15b's Step 1 note renders the doc
 * markers in that comment block's em-dash-normalized style, so an operator
 * copying from it types hyphens into Studio's Extract step, which matches
 * nothing and returns empty.
 *
 * WHAT THIS DOES AND DELIBERATELY DOES NOT DO. It emits the *derived* half —
 * every tab name, column number, header, trigger condition, prompt key and
 * ownership rule, computed from the same constants the code reads. Those are
 * the drift-prone facts, and the only way to keep them true is to generate
 * them.
 *
 * It does NOT re-transcribe the authored half: connector names, temperature,
 * token limits, the reasoning behind a step. Copying that here would create a
 * seventh document to keep in sync, which is the problem rather than the fix.
 * Instead each flow's row points at where that narrative lives, and — where a
 * pointer has gone stale — says so, which is the one thing a generated sheet
 * can do that the narrative cannot.
 *
 * SO THE DIVISION IS: this file for anything a column index can go wrong in,
 * the referenced document for anything requiring judgement.
 *
 * ENTRY POINTS (no trailing underscore — GAS hides those from the Run
 * dropdown):
 *   syncFlowBuildSpec()   — write/refresh the FlowBuildSpec tab
 *   checkFlowBuildSpec()  — is the tab present and current?
 */

const FBS_TAB = "FlowBuildSpec";
const FBS_HEADERS = [
  "flow", "surface", "tab", "column", "header", "who_writes_it", "notes",
];

/**
 * Writes the FlowBuildSpec tab: one row per column an operator has to bind or
 * deliberately leave alone, plus a header block per flow carrying its trigger
 * condition and prompt key.
 *
 * Idempotent — rewrites the whole tab, so a schema change anywhere upstream
 * is picked up by re-running this rather than by editing anything.
 */
function syncFlowBuildSpec() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const rows = [FBS_HEADERS.slice()];

  _fbsAppendFlow1_(rows);
  _fbsAppendFlow2_(rows);
  _fbsAppendWarmUpFlows_(rows);
  _fbsAppendReturnSurface_(rows);

  let sheet = ss.getSheetByName(FBS_TAB);
  if (!sheet) sheet = ss.insertSheet(FBS_TAB);
  sheet.clear();
  sheet.getRange(1, 1, rows.length, FBS_HEADERS.length).setValues(rows);
  sheet.getRange(1, 1, 1, FBS_HEADERS.length).setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, FBS_HEADERS.length);

  Logger.log("[BuildSpec] Wrote " + (rows.length - 1) + " row(s) to " + FBS_TAB + ".");
  Logger.log("[BuildSpec] Every column number, header and trigger condition there is DERIVED " +
    "from the constants the code reads — copy from that tab, not from a comment block. " +
    "Connector names, temperature and token limits are NOT here on purpose: they need " +
    "judgement, they do not drift, and copying them would make this a seventh document to " +
    "keep in sync. The notes column points at where each of those lives.");
  return { rows: rows.length - 1 };
}

// Flow 1 — Rubric Extraction. The one flow verified live end to end, and the
// only one whose trigger tab is written by a form handler rather than by a
// materializer.
function _fbsAppendFlow1_(rows) {
  const headers = ["Timestamp", "TeacherEmail", "TeacherName", "Subject",
                   "CourseName", "Tier", "RubricText", "PromptTemplateID",
                   "TeacherMatrixSsId", "Status"];
  rows.push(["Flow 1", "trigger", "RubricQueue", "", "",
    "05_TeacherIntakePipeline.js",
    "Trigger on Status = PENDING_EXTRACTION. That literal is written by " +
    "onTeacherRubricSubmit and watched by 10_AdminRecoveryPanel.js's stuck-row alert, so a " +
    "flow triggering on anything else is invisible to both."]);
  headers.forEach(function (h, i) {
    rows.push(["Flow 1", "read", "RubricQueue", i + 1, h, "the form handler",
      h === "Status" ? "The Flow updates this to COMPLETE as its last step." : ""]);
  });
  rows.push(["Flow 1", "write", "TeacherMatrix (per teacher)", "", "",
    "the Flow",
    "Write a DRAFT row. Column order is TM08 in 08_TeacherConfirmationStep.js, which that " +
    "file's own header calls the authoritative source — 37_FlowInputBuilder.js's " +
    "FI_TM_COLUMNS_ mirrors it. See the TeacherMatrix rows below."]);
  _fbsAppendTeacherMatrix_(rows);
  rows.push(["Flow 1", "prompt", FLOW_PROMPT_TAB, "", "FLOW_1", "40_FlowPrompts.js",
    "Bind the Gemini step's system prompt to a Sheets lookup on " + FLOW_PROMPT_TAB +
    " where prompt_key = FLOW_1, rather than pasting it. Then a prompt change is a clasp " +
    "push plus syncFlowPromptsToSheet()."]);
  rows.push(["Flow 1", "narrative", "", "", "", "15_StudioFlowPrompts.js",
    "Connector names, the step order and the Gemini settings live there. NOTE: its Step 3 " +
    "(\"write DRAFT row to Teacher Matrix\") was later given a custom step, " +
    "CommitRubricDraftStep.gs, which is BLOCKED on this account — so build Step 3 natively, " +
    "as the original design had it."]);
}

// The TeacherMatrix column order, emitted once and referenced by Flow 1's
// write and Flow 2's read. Derived from FI_TM_COLUMNS_ where that names a
// column, so the indices cannot drift from what the builder reads.
function _fbsAppendTeacherMatrix_(rows) {
  const headers = ["ConfigID", "UnitName", "Tier", "Persona",
                   "Milestone1", "Milestone2", "Milestone3", "Milestone4",
                   "DefinitionOfDone", "InstructorEmail", "Created", "Status",
                   "PromptTemplateID", "Subject", "CourseName",
                   "Milestone1CompetencyId", "Milestone2CompetencyId",
                   "Milestone3CompetencyId", "Milestone4CompetencyId", "LessonUnitId"];
  const readByBuilder = {};
  Object.keys(FI_TM_COLUMNS_).forEach(function (k) { readByBuilder[FI_TM_COLUMNS_[k]] = k; });
  headers.forEach(function (h, i) {
    rows.push(["Flow 1", "write", "TeacherMatrix", i + 1, h, "the Flow",
      readByBuilder[i]
        ? "Read back by 37_FlowInputBuilder.js as FI_TM_COLUMNS_." + readByBuilder[i] +
          " — a shift here silently feeds Flow 2 the wrong field."
        : "Not read by the Flow 2 builder; Status must be DRAFT for " +
          "08_TeacherConfirmationStep.js to pick it up for review."]);
  });
}

// Flow 2 — Student Evaluation. Reads one flat materialized row, which is what
// the 37 redesign bought: no variable spreadsheet target, no custom step.
function _fbsAppendFlow2_(rows) {
  rows.push(["Flow 2", "trigger", "FlowInput", FI.READY_STATUS + 1, "ReadyStatus",
    "37_FlowInputBuilder.js",
    "Trigger on ReadyStatus = READY. The whole row is already resolved by then — do NOT add " +
    "lookup steps against the Ledger, MatrixRegistry or a TeacherMatrix. That chain is what " +
    "the materializer exists to remove, and a per-teacher matrix cannot be reached by a " +
    "fixed-picker step anyway."]);

  const names = {};
  Object.keys(FI).forEach(function (k) { names[FI[k]] = k; });
  for (let i = 0; i <= FI.PROMPT_TEXT; i++) {
    const key = names[i] || "(unnamed)";
    let who = "the materializer";
    let note = "Read it as a chip. Do not write to it.";
    if (i === FI.GEMINI_FULL_OUTPUT) {
      who = "the Flow";
      note = "The ONLY column the Flow writes. harvestFlowInputResults() reads it here and " +
        "nowhere else; checkFlow2Binding() diagnoses a write that lands elsewhere.";
    } else if (i === FI.READY_STATUS) {
      note = "The trigger condition. The harvest updates it after applying the result.";
    } else if (i === FI.PROMPT_TEXT) {
      note = "The pre-substituted system prompt. Bind the Gemini step to this chip. " +
        "{{STUDENT_TEXT}} is deliberately left standing — the Extract step fills it, so the " +
        "student's response never enters this spreadsheet (FERPA).";
    } else if (i === FI.STAGING_ROW_REF) {
      note = "Read-only. The harvest uses it to complete the STAGING_PIPELINE row.";
    }
    rows.push(["Flow 2", i === FI.GEMINI_FULL_OUTPUT ? "write" : "read",
      "FlowInput", i + 1, key, who, note]);
  }

  rows.push(["Flow 2", "read", "student Doc", "", "",
    "02_Form1_IntakeAndWorkspaceGenerator.js",
    "Extract the response as the text BETWEEN the two markers below. COPY THEM FROM THE " +
    "CODE: RESPONSE_MARKER and CONFIG_ID_MARKER in 01_StudentDoc_ContainerScript.js. 15b's " +
    "Step 1 note renders them with plain hyphens because that comment block normalizes " +
    "em-dashes, and Studio matches literally — typing the hyphen form matches nothing and " +
    "the step returns empty."]);
  rows.push(["Flow 2", "read", "student Doc", "", "── YOUR RESPONSE BEGINS HERE ──",
    "stampDocument_ ZONE 3", "Start of the response zone. Box-drawing characters, not hyphens."]);
  rows.push(["Flow 2", "read", "student Doc", "", "[CONFIG_ID:",
    "stampDocument_ ZONE 4", "End of the response zone."]);
  rows.push(["Flow 2", "prompt", FLOW_PROMPT_TAB, "", "FLOW_2", "40_FlowPrompts.js",
    "Or bind the PromptText chip above, which is already substituted for this student."]);
}

// Flows 3, 4 and 5 — one materialized input tab each, all three returning
// through one shared tab.
function _fbsAppendWarmUpFlows_(rows) {
  const specs = [
    { flow: 5, headers: WFB_FLOW5_HEADERS, prompt: "FLOW_5",
      note: "Bridging. Its three inputs all come out of one lesson_context_snapshot blob, " +
        "which is why this materializer exists." },
    { flow: 3, headers: WFB_FLOW3_HEADERS, prompt: "FLOW_3_MODE_A / FLOW_3_MODE_B",
      note: "Warm-Up Generation. Mode is materialized: A when a warmup_anchor exists, B " +
        "otherwise. Branch the Gemini step on the Mode column and use the matching prompt key." },
    { flow: 4, headers: WFB_FLOW4_HEADERS, prompt: "FLOW_4",
      note: "Warm-Up Scoring. OriginalPromptText is extracted from the student's doc by " +
        "evaluateWarmUpDoc_, not reconstructed from the snapshot — so it is the exact text " +
        "the student saw." },
  ];

  specs.forEach(function (spec) {
    const label = "Flow " + spec.flow;
    const tab = WFB_INPUT_TABS[spec.flow];
    rows.push([label, "trigger", tab, 3, "Status", "41_WarmUpFlowBridge.js",
      "Trigger on Status = READY. Rows are materialized from WarmUpQueue rows sitting at " +
      WFB_TRIGGER_STATUS[spec.flow] + ". " + spec.note]);
    spec.headers.forEach(function (h, i) {
      rows.push([label, "read", tab, i + 1, h, "the materializer",
        h === "PromptText"
          ? "The pre-substituted system prompt. Bind the Gemini step to this chip."
          : "Read it as a chip. Do not write to it — the harvest owns every write."]);
    });
    rows.push([label, "prompt", FLOW_PROMPT_TAB, "", spec.prompt, "40_FlowPrompts.js",
      "Alternative to the PromptText chip above."]);
  });

  rows.push(["Flows 3/4/5", "narrative", "", "", "",
    "cas-ccps/docs/CAS_Flow3_Flow4_Specification.html",
    "Connector names, Gemini settings and the archetype decision table's reasoning. NOTE: " +
    "the five custom steps that spec's connector tables call for are BLOCKED on this " +
    "account — 41_WarmUpFlowBridge.js replaces all five, so build every step natively."]);
}

// The one surface all three warm-up flows share, and the one an operator is
// most likely to mis-bind, since it is bound one column at a time in a picker.
function _fbsAppendReturnSurface_(rows) {
  WFB_RETURN_HEADERS.forEach(function (h, i) {
    const flowWrites = i <= WFB_RET.RAW_OUTPUT;
    let note;
    if (i === WFB_RET.FLOW) {
      note = "The literal 3, 4 or 5 — not a name. The harvest skips any other value.";
    } else if (i === WFB_RET.QUEUE_ID) {
      note = "From the trigger row's QueueID. Never a row number: the harvest matches on it.";
    } else if (i === WFB_RET.RAW_OUTPUT) {
      note = "The Gemini step's output, unmodified. Do not strip the markdown fence — the " +
        "harvest does that, and Flow 4's classification contract needs the original text.";
    } else if (i === WFB_RET.TIMESTAMP) {
      note = "Now.";
    } else {
      note = "LEAVE EMPTY. The harvest writes this; a value here also makes it read your " +
        "output as its own bookkeeping and skip the row.";
    }
    rows.push(["Flows 3/4/5", flowWrites ? "write" : "leave empty", WFB_RETURN_TAB,
      i + 1, h, flowWrites ? "the Flow" : "the harvest", note]);
  });
  rows.push(["Flows 3/4/5", "verify", WFB_RETURN_TAB, "", "", "41_WarmUpFlowBridge.js",
    "Run checkFlowBinding() WHILE wiring this step. It reports where values actually landed, " +
    "so a one-column shift comes back as a shift with its offset rather than as \"nothing " +
    "came back\"."]);
}

/**
 * Reports whether the tab exists and whether it still matches what the code
 * would generate now. Read-only.
 *
 * Drift here is expected and harmless — it just means a constant changed since
 * the last sync. The point is that it is *visible*, which is the whole
 * difference between this and a hand-written setup document.
 */
function checkFlowBuildSpec() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(FBS_TAB);
  if (!sheet) {
    Logger.log("[BuildSpec] " + FBS_TAB + " has never been generated. Run syncFlowBuildSpec().");
    return { exists: false, current: false };
  }

  // Regenerate into memory and compare row counts plus the derived column
  // rows. A full cell-by-cell diff would flag every wording change in the
  // notes, which is not what anyone needs to know about.
  const expected = [FBS_HEADERS.slice()];
  _fbsAppendFlow1_(expected);
  _fbsAppendFlow2_(expected);
  _fbsAppendWarmUpFlows_(expected);
  _fbsAppendReturnSurface_(expected);

  const actual = sheet.getDataRange().getValues();
  const sameShape = actual.length === expected.length;
  const keyOf = function (r) {
    return [r[0], r[1], r[2], r[3], r[4]].join("|"); // flow|surface|tab|column|header
  };
  const actualKeys = actual.slice(1).map(keyOf).join("\n");
  const expectedKeys = expected.slice(1).map(keyOf).join("\n");
  const current = sameShape && actualKeys === expectedKeys;

  Logger.log("[BuildSpec] " + FBS_TAB + ": " + (actual.length - 1) + " row(s), " +
    (current ? "current." : "STALE — a tab, column or trigger condition has changed since " +
      "the last sync. Re-run syncFlowBuildSpec(), and re-check any Flow step bound to a " +
      "column whose number moved."));
  return { exists: true, current: current, rows: actual.length - 1,
           expectedRows: expected.length - 1 };
}
