// =============================================================================
// FILE: 15c_Flow2DirectEvaluationService.js
// BOUND TO: Central Ledger spreadsheet
//
// PURPOSE: Opt-in escape hatch for Flow 2 (Student Evaluation) — external
// product review, Finding 3, "this quarter" tier. Flow 2 has never been
// built in Studio (see cas-ccps/README.md), and 15_StudioFlowPrompts.js /
// 15b_StudioFlowPrompts_Flow2_Revised.js are specs to paste into a Studio
// Gemini step, not runnable code — meaning there was no way to actually
// exercise Flow 2's evaluation logic (prompt construction, response
// parsing, competency-evidence extraction) without a live Studio Flow.
//
// This gives cas-ccps the same escape hatch kos-personal already has via
// CFG.INFERENCE_MODE (1_Config_And_Deploy.gs / 10_Turnstile.gs), scaled
// down to match what cas-ccps actually needs: kos-personal's
// MANAGED_SERVICE mode hands a job off to a whole separate, billed
// Node.js/Postgres deployment (kos-personal/inference-service/) — that's
// real infrastructure this fix does not attempt to rebuild for cas-ccps.
// Instead, cfg.evaluationMode === "DIRECT_GEMINI" (00_SharedConfig.js,
// default "STUDIO") calls the Gemini API directly via UrlFetchApp, using
// FLOW_2_SYSTEM_PROMPT verbatim from 15b_StudioFlowPrompts_Flow2_Revised.js
// (now loaded into this same project — see that file's own header) so the
// prompt used here can never silently drift from what's meant to be
// pasted into a real Studio Flow.
//
// WHAT THIS DOES NOT DO:
//   - It is NOT wired into 06_StagingPipeline_Turnstile.js's release
//     loop. Automatically rerouting live student submissions through an
//     unreviewed new code path is a materially bigger decision than
//     "make Flow 2 testable" calls for — that's a deliberate, separate
//     choice for whoever runs a real deployment to make later, with a
//     real Gemini API key of their own. Call runFlow2DirectGemini_()
//     directly (Script Editor, or a manual admin action) to actually use
//     this path today.
//   - It does not replace Studio Flow 2 as a deployment target. Building
//     Flow 2 for real in Google Workspace Studio (native Gemini access,
//     no API key for anyone to manage — the Walled Garden design every
//     other Flow in this system already follows) is still the intended
//     production path. This is a testing/development bridge, not a
//     production alternative to prefer over it.
//
// THE THREE PIECES, KEPT DELIBERATELY SEPARATE FOR TESTABILITY:
//   _buildFlow2Prompt_(vars)     — pure string substitution, no network.
//   _parseFlow2Response_(text)  — pure parsing (reuses 04_Form2_TurnInGate.js's
//                                   scanCompliance_()/extractSuggestedScore_()
//                                   for the two markers that file already
//                                   parses identically; adds
//                                   [MILESTONE_OUTCOMES: {...}] parsing,
//                                   which nothing else in this repo reads
//                                   today). No network.
//   runFlow2DirectGemini_(vars) — the only piece that actually calls
//                                   UrlFetchApp; a thin orchestrator around
//                                   the two pure functions above, so the
//                                   logic that actually matters is fully
//                                   unit-testable even though the network
//                                   call itself isn't (see
//                                   tests/cas-ccps/flow2-direct-evaluation.test.js).
// =============================================================================

// ---------------------------------------------------------------------------
// _buildFlow2Prompt_ — substitutes vars into FLOW_2_SYSTEM_PROMPT
// (15b_StudioFlowPrompts_Flow2_Revised.js). Pure string manipulation, no
// network, no Sheet/Doc access — exactly what a Studio Flow's own
// variable-mapping step does, reimplemented in code so it's testable.
//
// vars: { unitName, tier, persona, milestone1, milestone2, milestone3,
//         milestone4, dod, studentText }. Any missing field substitutes
// an empty string rather than leaving the literal "{{...}}" placeholder
// in the prompt sent to Gemini.
// ---------------------------------------------------------------------------
function _buildFlow2Prompt_(vars) {
  const v = vars || {};
  return FLOW_2_SYSTEM_PROMPT
    .replace(/\{\{UNIT_NAME\}\}/g, v.unitName || "")
    .replace(/\{\{TIER\}\}/g, v.tier || "")
    .replace(/\{\{PERSONA\}\}/g, v.persona || "")
    .replace(/\{\{MILESTONE_1\}\}/g, v.milestone1 || "")
    .replace(/\{\{MILESTONE_2\}\}/g, v.milestone2 || "")
    .replace(/\{\{MILESTONE_3\}\}/g, v.milestone3 || "")
    .replace(/\{\{MILESTONE_4\}\}/g, v.milestone4 || "")
    .replace(/\{\{DOD\}\}/g, v.dod || "")
    .replace(/\{\{STUDENT_TEXT\}\}/g, v.studentText || "");
}

// ---------------------------------------------------------------------------
// _parseFlow2MilestoneOutcomes_ — extracts and validates the
// [MILESTONE_OUTCOMES: {"1":"MET",...}] machine-readable line
// 15b_StudioFlowPrompts_Flow2_Revised.js's prompt requires as the very
// last line of a Flow 2 response. Nothing else in this repo parses this
// line today — CompetencyEvidence has always been "written externally by
// Studio Flow 2" (see docs/FERPA_DATA_MAP.md) with no code-level reader
// or writer, since Flow 2 has never actually run.
//
// Returns { "1": "MET"|"PARTIALLY_MET"|"NOT_MET"|null, "2": ..., "3": ...,
// "4": ... } — a key is null if the line is missing/malformed for that
// milestone, or if Gemini emitted a value outside the three exact allowed
// strings (never trust the model to have followed the format perfectly).
// Returns null (not an object of nulls) if the line itself can't be found
// or isn't parseable JSON at all — a fundamentally different failure than
// "found the line, one milestone's value was garbage."
// ---------------------------------------------------------------------------
function _parseFlow2MilestoneOutcomes_(responseText) {
  const text = String(responseText || "");
  const m = text.match(/\[MILESTONE_OUTCOMES:\s*(\{[\s\S]*?\})\]/);
  if (!m) return null;

  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch (e) {
    return null;
  }

  const VALID = ["MET", "PARTIALLY_MET", "NOT_MET"];
  const outcomes = {};
  ["1", "2", "3", "4"].forEach((k) => {
    const value = parsed[k];
    outcomes[k] = VALID.indexOf(value) !== -1 ? value : null;
  });
  return outcomes;
}

// ---------------------------------------------------------------------------
// _parseFlow2Response_ — the full structured read of a Flow 2 response,
// combining the compliance stamp and suggested-score markers
// 04_Form2_TurnInGate.js already parses identically (scanCompliance_(),
// extractSuggestedScore_() — same project, called directly, no
// duplicated logic) with the new milestone-outcomes line above.
//
// Returns { complianceStatus: "APPROVED"|"REVISION_REQUIRED"|"NONE",
//           suggestedScore: 2|3|4|null,
//           milestoneOutcomes: {...}|null,
//           rawResponse: string }
// ---------------------------------------------------------------------------
function _parseFlow2Response_(responseText) {
  const text = String(responseText || "");
  return {
    complianceStatus: scanCompliance_(text),
    suggestedScore: extractSuggestedScore_(text),
    milestoneOutcomes: _parseFlow2MilestoneOutcomes_(text),
    rawResponse: text,
  };
}

// ---------------------------------------------------------------------------
// _callGeminiDirect_ — the one function in this file that touches the
// network. Requires a DIRECT_GEMINI_API_KEY Script Property — deliberately
// NOT bundled with any real key; this is an explicit, per-deployment
// opt-in, same as every other Script-Property-gated feature in this repo.
// Never called unless cfg.evaluationMode === "DIRECT_GEMINI"
// (runFlow2DirectGemini_ below enforces that; this function assumes its
// caller already checked).
// ---------------------------------------------------------------------------
function _callGeminiDirect_(promptText) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("DIRECT_GEMINI_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "DIRECT_GEMINI_API_KEY Script Property is not set." };
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    "gemini-pro:generateContent?key=" + apiKey;

  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.2 },
      }),
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      return { ok: false, error: "Gemini API returned " + response.getResponseCode() + ": " + response.getContentText() };
    }

    const body = JSON.parse(response.getContentText());
    const text = body.candidates && body.candidates[0] &&
      body.candidates[0].content && body.candidates[0].content.parts &&
      body.candidates[0].content.parts[0] && body.candidates[0].content.parts[0].text;

    if (!text) {
      return { ok: false, error: "Gemini response had no candidate text: " + response.getContentText() };
    }
    return { ok: true, text: text };
  } catch (e) {
    return { ok: false, error: "Gemini call failed: " + e.message };
  }
}

// ---------------------------------------------------------------------------
// runFlow2DirectGemini_ — ENTRY POINT. Builds the Flow 2 prompt from
// `vars`, calls Gemini directly (only if cfg.evaluationMode ===
// "DIRECT_GEMINI"), and returns the fully parsed result. Does NOT write
// anything to any Sheet or Doc — that's a deliberate scope boundary (see
// this file's own header, "what this does not do"); a caller that wants
// to actually apply the result (write CompetencyEvidence rows, stamp the
// student's doc) does that itself with the returned `parsed` object,
// same as 04_Form2_TurnInGate.js already does today for a real Flow 2
// response landing in a student's document.
//
// Returns { ok: false, error } if evaluationMode isn't DIRECT_GEMINI, or
// if the Gemini call itself fails. Returns { ok: true, parsed, rawResponse }
// on success.
// ---------------------------------------------------------------------------
function runFlow2DirectGemini_(vars) {
  const cfg = getConfig_();
  if (cfg.evaluationMode !== "DIRECT_GEMINI") {
    return {
      ok: false,
      error: "cfg.evaluationMode is \"" + cfg.evaluationMode + "\", not \"DIRECT_GEMINI\" — " +
        "set the EVALUATION_MODE Script Property to \"DIRECT_GEMINI\" to opt in.",
    };
  }

  const prompt = _buildFlow2Prompt_(vars);
  const geminiResult = _callGeminiDirect_(prompt);
  if (!geminiResult.ok) return geminiResult;

  return {
    ok: true,
    parsed: _parseFlow2Response_(geminiResult.text),
    rawResponse: geminiResult.text,
  };
}

// ---------------------------------------------------------------------------
// _generateEvidenceId_ — same "EVD-" + yyyyMMdd + "-" + 6-char token shape
// cas-ccps/studio-steps/CommitStudentEvaluationStep.gs's own writer uses
// for this column, so both writers of CompetencyEvidence produce evidence
// IDs in one recognizable format even though they're two independent GAS
// projects that can't share a literal function. Not
// 02_Form1_IntakeAndWorkspaceGenerator.js's generateConfigId_() — that's a
// "VDOE-" ID for a different purpose (a rubric ConfigID, not an evidence
// row ID) — and not the Studio step's own randomToken_() either, which
// lives in a different project's global scope entirely.
// ---------------------------------------------------------------------------
function _generateEvidenceId_(now) {
  const token = Utilities.getUuid().replace(/-/g, "").substring(0, 6).toUpperCase();
  return "EVD-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd") + "-" + token;
}

// ---------------------------------------------------------------------------
// writeCompetencyEvidenceFromFlow2_ — the CompetencyEvidence write step
// Flow 2 itself would otherwise perform (Step 3b/CompetencyEvidence-write
// in 15b_StudioFlowPrompts_Flow2_Revised.js's step sequence). Kept as a
// separate function, not folded into runFlow2DirectGemini_ above, so a
// caller/test can inspect a parsed evaluation before deciding whether to
// commit evidence rows from it.
//
// Row shape and header are byte-identical, in the same column order, to
// cas-ccps/studio-steps/CommitStudentEvaluationStep.gs's own
// writeCompetencyEvidence_() — confirmed the two are the tab's only
// writers, and that its one reader (30_SCRSuggestionEngine.js's
// aggregateEvidence_()) resolves columns by header NAME, not position;
// matching header/order here means the reader works correctly regardless
// of which of the two writers seeds the tab first. This function used to
// write only 3 columns (student_email, competency_id, outcome) — widened
// here specifically to close that mismatch, not as an independent schema
// change.
//
// competencyIds / milestoneTexts: { "1": value|"", "2": ..., "3": ..., "4": ... } —
// from TeacherMatrix's Milestone1_Competency_Id..4 / Milestone1..4 columns
// (competency IDs blank for any assignment confirmed before Module 5
// shipped — see 15b_StudioFlowPrompts_Flow2_Revised.js's own DEPENDENCY
// note).
//
// Skips any milestone where the competency ID is blank, OR where
// milestoneOutcomes has no valid outcome for it — matching the exact
// "skip, never guess or write a row with a missing key" rule that file's
// DEPENDENCY note specifies. Returns { written, skipped }.
// ---------------------------------------------------------------------------
function writeCompetencyEvidenceFromFlow2_(studentEmail, configId, studentFileId, competencyIds, milestoneTexts, milestoneOutcomes) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const evidenceSheet = ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence");
  if (!evidenceSheet) {
    Logger.log("[S15c] CompetencyEvidence tab not found. Cannot write evidence.");
    return { written: 0, skipped: 0 };
  }

  let written = 0;
  let skipped = 0;
  const rows = [];
  const now = new Date();

  ["1", "2", "3", "4"].forEach((milestoneNum) => {
    const competencyId = competencyIds && competencyIds[milestoneNum];
    const outcome = milestoneOutcomes && milestoneOutcomes[milestoneNum];
    if (!competencyId || !outcome) {
      skipped++;
      return;
    }
    const milestoneText = (milestoneTexts && milestoneTexts[milestoneNum]) || "";
    rows.push([
      _generateEvidenceId_(now), studentEmail, competencyId, milestoneText,
      outcome, configId || "", now, studentFileId || "",
    ]);
    written++;
  });

  if (rows.length > 0) {
    // CompetencyEvidence has no code-level creation function anywhere in
    // this repo — "written externally by Studio Flow 2" (docs/FERPA_DATA_MAP.md)
    // — so this is one of the two code paths that could ever write to a
    // genuinely empty tab. A blank sheet needs its header row first, or
    // the first evidence row would land in row 1 and be misread as
    // headers by 30_SCRSuggestionEngine.js's aggregateEvidence_() (which
    // reads data[0] as headers unconditionally).
    if (evidenceSheet.getLastRow() === 0) {
      evidenceSheet.getRange(1, 1, 1, 8).setValues([[
        "evidence_id", "student_email", "competency_id", "milestone_text",
        "outcome", "config_id", "evaluated_at", "student_file_id",
      ]]);
    }
    const startRow = evidenceSheet.getLastRow() + 1;
    evidenceSheet.getRange(startRow, 1, rows.length, 8).setValues(rows);
  }

  Logger.log("[S15c] CompetencyEvidence: wrote " + written + " row(s), skipped " + skipped +
    " milestone(s) (missing competency ID or outcome).");
  return { written: written, skipped: skipped };
}
