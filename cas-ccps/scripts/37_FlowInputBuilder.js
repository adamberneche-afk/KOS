// =============================================================================
// FILE: 37_FlowInputBuilder.js
// BOUND TO: Central Ledger spreadsheet
// TRIGGERS:
//   buildFlowInputRows      — Time-driven, every 1 minute  (mirrors
//                              03_QueueBridge.js's bridgeQueue cadence)
//   harvestFlowInputResults — Time-driven, every 2 minutes (mirrors
//                              03_QueueBridge.js's backPropagateCompletions
//                              cadence)
//
// PURPOSE: Flow 2 (Student Evaluation) redesign, landed after a live
// Studio build session hit three walls documented in this session's
// own record (see cas-ccps/README.md and DEPLOYMENT_HANDOFF.md for the
// fuller writeup):
//   1. Google Workspace Studio's custom-step add-on path (the 8 steps in
//      cas-ccps/studio-steps/) requires a standard GCP project, and this
//      district's Google Workspace account has GCP access disabled
//      entirely — a hard, external blocker, not fixable from this repo.
//   2. Native Studio's "Get sheet contents" step can only target a
//      spreadsheet through a FIXED PICKER, never a variable — confirmed
//      directly in the live Studio editor. Flow 2's TeacherMatrix hop is
//      inherently per-teacher (a different spreadsheet for every
//      teacher), which native Studio structurally cannot express.
//   3. Native Studio has no version control, no tests, no rollback, and
//      a run log that shows "Run Completed" in green even when a lookup
//      step matched zero rows — exactly the class of problem
//      34_QueueWatchdog.js's own header describes from a real prior
//      incident ("a row with no Studio flow ever completing it used to
//      cycle forever... completely invisible").
//
// THE FIX: push every dynamic lookup Studio can't do into Apps Script,
// where it already has tests, and shrink Studio Flow 2 down to the one
// thing it's uniquely good for — calling Gemini with no API key, no GCP
// project, no key management. buildFlowInputRows() below performs the
// exact 3-hop Ledger -> MatrixRegistry -> TeacherMatrix lookup chain
// cas-ccps/studio-steps/ReadInstructorConfigStep.gs already implements
// and already has full test coverage for (tests/cas-ccps/
// read-instructor-config-step.test.js) — reimplemented here (not called
// directly; GAS has no cross-project function calls, and that step lives
// in the separate cas-ccps:studio-steps project) and materializes the
// result as one flat, literal row on a single fixed spreadsheet (this
// one, the Central Ledger). Studio Flow 2 then only ever needs to:
//
//   1. Trigger:   FlowInput row where ReadyStatus = "READY"
//   2. Extract:   studentResponseText, Content = @trigger.StudentDocURL
//   3. Ask Gemini: FLOW_2_SYSTEM_PROMPT (15b_StudioFlowPrompts_Flow2_Revised.js),
//                  built entirely from this row's own literal columns —
//                  no lookups, no chip concatenation, no fixed-picker
//                  problem, because FlowInput lives on the one spreadsheet
//                  every native step can already target directly.
//   4. Update row: write the raw Gemini output into THIS row's
//                  GeminiFullOutput column, set ReadyStatus = "EVALUATED".
//
// harvestFlowInputResults() below then does everything Flow 2's original
// design asked Studio's native Docs/Sheets steps (plus the
// GCP-blocked CommitStudentEvaluationStep.gs custom step) to do:
// splitting the response, writing it into the student's doc, writing
// CompetencyEvidence rows, and marking the originating STAGING_PIPELINE
// row COMPLETE. It reuses existing, already-tested functions rather than
// duplicating them:
//   _parseFlow2Response_()             — 15c_Flow2DirectEvaluationService.js
//   writeCompetencyEvidenceFromFlow2_() — 15c_Flow2DirectEvaluationService.js
// both already bound to this same project (see tools/gas-lint/project-map.json).
//
// WHAT THIS DELIBERATELY DOES NOT DO (yet):
//   - Does not touch the ALREADY-DEPLOYED, ALREADY-RUNNING
//     backPropagateCompletions() in 03_QueueBridge.js. This file only
//     ever flips a STAGING_PIPELINE row to COMPLETE; that existing
//     2-minute poller is what closes ReviewQueue, stamps Ledger's
//     LastEval, removes the "[No feedback yet." placeholder, and
//     appends the "WHAT TO DO NEXT" block. Duplicating any of that here
//     would just be a second, divergent copy of logic that already
//     works — so there's a small (~2 minute, bounded by that poller's
//     own cadence) cosmetic window where a student's doc shows both the
//     placeholder and the real feedback at once. Self-heals every run;
//     not worth a tighter coupling between two files for.
//   - Does not add FlowInput to 34_QueueWatchdog.js's staleness
//     monitoring or a retention/archival pass (see
//     tests/cas-ccps/*-retention.test.js for the pattern every other
//     long-lived tab in this system already follows). FlowInput is new
//     and low-volume (one pilot teacher) — worth adding once real usage
//     shows it's needed, not speculatively here.
//   - Does not change Flows 3, 4, or 5. Warm-Up generation/evaluation/
//     bridging were never built in Studio this session; whether they hit
//     the same fixed-picker wall (likely, since WarmUpQueue is also
//     per-teacher-routed) is a question for whoever builds them, using
//     this same FlowInput-materialization pattern if so.
// =============================================================================

// ---------------------------------------------------------------------------
// FlowInput column indices (0-based) and tab name/headers.
// ---------------------------------------------------------------------------
const FI = {
  TIMESTAMP:                 0,
  STAGING_ROW_REF:           1,  // informational + fast path for harvest;
                                  // harvestFlowInputResults() re-verifies
                                  // against live StudentFileID/ConfigID
                                  // before trusting it (see its own comment —
                                  // 10_AdminRecoveryPanel.js's
                                  // clearStagingPipeline() can renumber this).
  STUDENT_FILE_ID:            2,
  CONFIG_ID:                  3,
  TEACHER_EMAIL:              4,
  STUDENT_EMAIL:              5,
  STUDENT_DOC_URL:            6,
  UNIT_NAME:                  7,
  TIER:                       8,
  PERSONA:                    9,
  MILESTONE_1:                10,
  MILESTONE_2:                11,
  MILESTONE_3:                12,
  MILESTONE_4:                13,
  DEFINITION_OF_DONE:         14,
  MILESTONE_1_COMPETENCY_ID:  15,
  MILESTONE_2_COMPETENCY_ID:  16,
  MILESTONE_3_COMPETENCY_ID:  17,
  MILESTONE_4_COMPETENCY_ID:  18,
  READY_STATUS:               19, // READY -> EVALUATED -> HARVESTED
                                   // (or ERROR_EMPTY_OUTPUT / ERROR_HARVEST_FAILED)
  GEMINI_FULL_OUTPUT:          20, // written by Studio Flow 2's own Step 4
  // Appended at the END of the schema on purpose. Every positional reader in
  // this system breaks on a column INSERTED before the end (see
  // 38_LedgerSchemaGuard.js for what that costs); appending is safe, and a
  // row written before this column existed simply reads undefined here.
  PROMPT_TEXT:                 21, // the Flow 2 prompt, pre-substituted
};

const FI_TAB_NAME = "FlowInput";

const FI_HEADERS = [
  "Timestamp", "StagingRowRef", "StudentFileID", "ConfigID", "TeacherEmail",
  "StudentEmail", "StudentDocURL", "UnitName", "Tier", "Persona",
  "Milestone1", "Milestone2", "Milestone3", "Milestone4", "DefinitionOfDone",
  "Milestone1CompetencyId", "Milestone2CompetencyId",
  "Milestone3CompetencyId", "Milestone4CompetencyId",
  "ReadyStatus", "GeminiFullOutput", "PromptText",
];

function _fiEnsureTab_(ledgerSs, cfg) {
  const tabName = (cfg && cfg.tabs && cfg.tabs.flowInput) || FI_TAB_NAME;
  let sheet = ledgerSs.getSheetByName(tabName);
  if (!sheet) {
    sheet = ledgerSs.insertSheet(tabName);
    sheet.appendRow(FI_HEADERS);
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// buildFlowInputRows — for every STAGING_PIPELINE row at Status =
// "IN_PROCESS" (released by 06_StagingPipeline_Turnstile.js's per-teacher
// lane logic, unchanged by this file) with no FlowInput row yet, resolves
// the full 3-hop lookup chain and materializes one flat literal row.
//
// Dedup key is StudentFileID + ConfigID (the pair ReadInstructorConfigStep.gs's
// own header explains is required — ConfigID alone matches the FIRST
// student sharing that rubric, not necessarily the right one), not the
// STAGING_PIPELINE row number — a manual clearStagingPipeline() action
// (10_AdminRecoveryPanel.js) can renumber or wipe that tab entirely, and
// a content-based key survives that; a row-number-only key would not.
// ---------------------------------------------------------------------------
function buildFlowInputRows() {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[FlowInputBuilder] Parallel run congestion — standing down.");
    return;
  }

  try {
    const cfg = getConfig_();
    const adminSs = SpreadsheetApp.openById(cfg.adminSsId);
    const stagingSheet = adminSs.getSheetByName(cfg.tabs.stagingPipeline);
    if (!stagingSheet) {
      Logger.log("[FlowInputBuilder] STAGING_PIPELINE tab not found.");
      return;
    }

    const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
    const fiSheet = _fiEnsureTab_(ledgerSs, cfg);

    const stagingData = stagingSheet.getDataRange().getValues();
    if (stagingData.length < 2) return;

    const fiData = fiSheet.getDataRange().getValues();
    const existingKeys = new Set();
    for (let i = 1; i < fiData.length; i++) {
      if (String(fiData[i][FI.READY_STATUS]).trim() === "HARVESTED") continue;
      existingKeys.add(fiData[i][FI.STUDENT_FILE_ID] + "|" + fiData[i][FI.CONFIG_ID]);
    }

    let built = 0;
    for (let i = 1; i < stagingData.length; i++) {
      if (String(stagingData[i][STG_STATUS]).trim() !== "IN_PROCESS") continue;

      const studentFileId = String(stagingData[i][STG_STUDENT_FILE_ID]).trim();
      const configId      = String(stagingData[i][STG_CONFIG_ID]).trim();
      if (!studentFileId || !configId) continue;

      const key = studentFileId + "|" + configId;
      if (existingKeys.has(key)) continue;

      const ledgerRow = _fiFindLedgerRow_(cfg, configId, studentFileId);
      if (!ledgerRow) {
        Logger.log("[FlowInputBuilder] No Ledger row for ConfigID " + configId +
                   " + FileID " + studentFileId + " — will retry next cycle.");
        continue;
      }

      const matrixSsId = _fiFindMatrixSsId_(cfg, ledgerRow.teacherEmail);
      if (!matrixSsId) {
        Logger.log("[FlowInputBuilder] No MatrixRegistry entry for teacher " +
                   ledgerRow.teacherEmail + " — ConfigID " + configId +
                   " will retry next cycle.");
        continue;
      }

      let matrixRow;
      try {
        matrixRow = _fiFindTeacherMatrixRow_(matrixSsId, configId);
      } catch (e) {
        Logger.log("[FlowInputBuilder] Could not read TeacherMatrix " + matrixSsId +
                   ": " + e.message + " — will retry next cycle.");
        continue;
      }
      if (!matrixRow) {
        Logger.log("[FlowInputBuilder] No TeacherMatrix row for ConfigID " + configId +
                   " in " + matrixSsId + " — will retry next cycle.");
        continue;
      }

      fiSheet.appendRow([
        new Date(),                // Timestamp
        i + 1,                     // StagingRowRef
        studentFileId,
        configId,
        ledgerRow.teacherEmail,
        ledgerRow.googleId,        // StudentEmail
        // Built directly from StudentFileID — STAGING_PIPELINE already
        // carries this ID (03_QueueBridge.js's own STG_STUDENT_FILE_ID),
        // and 15b_StudioFlowPrompts_Flow2_Revised.js's own Step 1 spec
        // already treats it as authoritative for "the student's
        // submission doc" — no need to round-trip through Ledger's
        // AdminFileURL column for the same value.
        "https://docs.google.com/document/d/" + studentFileId + "/edit",
        matrixRow.unitName,
        matrixRow.tier,
        matrixRow.persona,
        matrixRow.milestone1,
        matrixRow.milestone2,
        matrixRow.milestone3,
        matrixRow.milestone4,
        matrixRow.dod,
        matrixRow.milestone1CompetencyId,
        matrixRow.milestone2CompetencyId,
        matrixRow.milestone3CompetencyId,
        matrixRow.milestone4CompetencyId,
        "READY",
        "", // GeminiFullOutput — Studio Flow 2 fills this in
        // The Flow 2 prompt with every placeholder resolved EXCEPT
        // {{STUDENT_TEXT}} — see _fiBuildPromptText_ below.
        _fiBuildPromptText_(matrixRow),
      ]);
      existingKeys.add(key);
      built++;
    }

    if (built > 0) {
      SpreadsheetApp.flush();
      Logger.log("[FlowInputBuilder] Built " + built + " FlowInput row(s).");
    }
  } catch (err) {
    Logger.log("[FlowInputBuilder] Critical failure: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// Hop 1: Ledger, matched on ConfigID + FileID together — same fix
// cas-ccps/studio-steps/ReadInstructorConfigStep.gs's own header
// documents (a ConfigID-only match returns the FIRST student sharing
// that rubric, not necessarily the right one, whenever more than one
// student's evaluation is in flight for the same assignment — the
// normal case, not an edge case). Distinct name from 04_Form2_TurnInGate.js's
// own findLedgerRow_() (same project, different signature — that one
// requires googleId as a match key, which this caller doesn't have yet;
// it's exactly the value being looked up here).
function _fiFindLedgerRow_(cfg, configId, studentFileId) {
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][LEDGER.CONFIG_ID]).trim() === configId &&
        String(data[i][LEDGER.FILE_ID]).trim() === studentFileId) {
      return {
        googleId: String(data[i][LEDGER.GOOGLE_ID]).trim(),
        teacherEmail: String(data[i][LEDGER.TEACHER_EMAIL]).trim(),
      };
    }
  }
  return null;
}

// Hop 2: MatrixRegistry, matched on TeacherEmail (case-insensitive) — one
// registry row per teacher, safe to match alone (fetchAssignment_'s own
// comment: "Each teacher's matrix is registered once").
function _fiFindMatrixSsId_(cfg, teacherEmail) {
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.matrixRegistry);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const lower = String(teacherEmail || "").toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === lower) {
      const id = String(data[i][2]).trim();
      return id || null;
    }
  }
  return null;
}

// Hop 3: TeacherMatrix (a per-teacher spreadsheet — this is the hop
// native Studio's "Get sheet contents" cannot do at all, its Spreadsheet
// field being a fixed picker only). Column shape matches TM_COLUMNS_ in
// cas-ccps/studio-steps/CommitRubricDraftStep.gs exactly (20 columns:
// see that file's own header) but is redeclared here under a distinct
// name (FI_TM_COLUMNS_) since that file lives in a different GAS
// project (cas-ccps:studio-steps) with its own separate global scope.
//
// Reads defensively past the actual row width: a TeacherMatrix row
// confirmed before Module 5 shipped is only 15 columns wide (no
// Milestone*CompetencyId columns yet) — String(row[n] || "").trim() on
// an out-of-range index returns "", the same "carry the blank through,
// never guess" rule 15b_StudioFlowPrompts_Flow2_Revised.js's own
// DEPENDENCY note requires.
var FI_TM_COLUMNS_ = {
  CONFIG_ID: 0, UNIT_NAME: 1, TIER: 2, PERSONA: 3,
  MILESTONE_1: 4, MILESTONE_2: 5, MILESTONE_3: 6, MILESTONE_4: 7, DOD: 8,
  MILESTONE_1_COMPETENCY_ID: 15, MILESTONE_2_COMPETENCY_ID: 16,
  MILESTONE_3_COMPETENCY_ID: 17, MILESTONE_4_COMPETENCY_ID: 18,
};

function _fiFindTeacherMatrixRow_(matrixSsId, configId) {
  const ss = SpreadsheetApp.openById(matrixSsId);
  const sheet = ss.getSheetByName("TeacherMatrix");
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][FI_TM_COLUMNS_.CONFIG_ID]).trim() === configId) {
      const row = data[i];
      const at = (n) => String(row[n] || "").trim();
      return {
        unitName: at(FI_TM_COLUMNS_.UNIT_NAME),
        tier: at(FI_TM_COLUMNS_.TIER),
        persona: at(FI_TM_COLUMNS_.PERSONA),
        milestone1: at(FI_TM_COLUMNS_.MILESTONE_1),
        milestone2: at(FI_TM_COLUMNS_.MILESTONE_2),
        milestone3: at(FI_TM_COLUMNS_.MILESTONE_3),
        milestone4: at(FI_TM_COLUMNS_.MILESTONE_4),
        dod: at(FI_TM_COLUMNS_.DOD),
        milestone1CompetencyId: at(FI_TM_COLUMNS_.MILESTONE_1_COMPETENCY_ID),
        milestone2CompetencyId: at(FI_TM_COLUMNS_.MILESTONE_2_COMPETENCY_ID),
        milestone3CompetencyId: at(FI_TM_COLUMNS_.MILESTONE_3_COMPETENCY_ID),
        milestone4CompetencyId: at(FI_TM_COLUMNS_.MILESTONE_4_COMPETENCY_ID),
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// _fiBuildPromptText_ — the Flow 2 prompt with this assignment's rubric
// already substituted in, so Studio's Ask Gemini step can bind one chip
// (@trigger.PromptText) instead of carrying a hand-pasted copy of the
// prompt that silently ages every time 15b's text changes.
//
// Substitutes everything EXCEPT {{STUDENT_TEXT}}, which is deliberately left
// standing. That value comes from Studio's own Extract step reading the
// student's Doc, which happens after this row exists — and pre-substituting
// it would mean this function reading the Doc and writing the student's
// writing into the central Ledger, the same FERPA regression
// docs/FERPA_DATA_MAP.md's pointer-based design exists to avoid.
//
// So in Studio, Ask Gemini's instructions get @trigger.PromptText, and the
// extracted response text goes in as the {{STUDENT_TEXT}} variable mapping —
// one mapping, rather than the whole prompt, pasted by hand.
//
// substituteFlowPrompt_ / FLOW_2_SYSTEM_PROMPT come from 40_FlowPrompts.js
// and 15b_StudioFlowPrompts_Flow2_Revised.js, both bound to this same
// project. If 40_FlowPrompts.js isn't deployed alongside this file, this
// returns "" and logs — the flow still works off a pasted prompt, it just
// doesn't get the chip.
// ---------------------------------------------------------------------------
function _fiBuildPromptText_(matrixRow) {
  if (typeof substituteFlowPrompt_ !== "function" ||
      typeof FLOW_2_SYSTEM_PROMPT !== "string") {
    Logger.log("[FlowInputBuilder] 40_FlowPrompts.js or 15b's FLOW_2_SYSTEM_PROMPT " +
               "is not loaded in this project — leaving PromptText empty. Studio " +
               "will need a pasted prompt instead of the @trigger.PromptText chip.");
    return "";
  }
  return substituteFlowPrompt_(FLOW_2_SYSTEM_PROMPT, {
    UNIT_NAME:   matrixRow.unitName,
    TIER:        matrixRow.tier,
    PERSONA:     matrixRow.persona,
    MILESTONE_1: matrixRow.milestone1,
    MILESTONE_2: matrixRow.milestone2,
    MILESTONE_3: matrixRow.milestone3,
    MILESTONE_4: matrixRow.milestone4,
    DOD:         matrixRow.dod,
    // STUDENT_TEXT deliberately omitted — keepUnmatched leaves it in place.
  }, true);
}

// ---------------------------------------------------------------------------
// harvestFlowInputResults — for every FlowInput row Studio has finished
// (ReadyStatus = "EVALUATED"), splits the Gemini output, writes the
// student-facing feedback into their doc, writes CompetencyEvidence
// rows, and marks the originating STAGING_PIPELINE row COMPLETE so the
// already-deployed backPropagateCompletions() (03_QueueBridge.js) closes
// the rest of the loop on its own next cycle.
// ---------------------------------------------------------------------------
function harvestFlowInputResults() {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[FlowInputBuilder] Harvest — parallel run congestion — standing down.");
    return;
  }

  try {
    const cfg = getConfig_();
    const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
    const fiSheet = ledgerSs.getSheetByName((cfg.tabs && cfg.tabs.flowInput) || FI_TAB_NAME);
    if (!fiSheet) return;

    const adminSs = SpreadsheetApp.openById(cfg.adminSsId);
    const stagingSheet = adminSs.getSheetByName(cfg.tabs.stagingPipeline);

    // writeCompetencyEvidenceFromFlow2_ (15c_Flow2DirectEvaluationService.js)
    // logs and no-ops if this tab doesn't exist yet rather than creating
    // it — correct for that file's own DIRECT_GEMINI dev/test bridge
    // (never the sole intended writer), but this harvest path IS the
    // real, sole writer once Flow 2 runs this way. Self-heal here, same
    // "create the tab if missing" convention every other long-lived tab
    // in this system already follows (e.g. _ensureTurnInReviewColumns_,
    // createSCRTabs_). The 9-column header is left to
    // writeCompetencyEvidenceFromFlow2_'s own first real write, which
    // already seeds it when the tab is empty.
    const evidenceTabName = (cfg.tabs && cfg.tabs.competencyEvidence) || "CompetencyEvidence";
    if (!ledgerSs.getSheetByName(evidenceTabName)) {
      ledgerSs.insertSheet(evidenceTabName);
    }

    const fiData = fiSheet.getDataRange().getValues();
    let harvested = 0;

    for (let i = 1; i < fiData.length; i++) {
      if (String(fiData[i][FI.READY_STATUS]).trim() !== "EVALUATED") continue;

      const rowNum = i + 1;
      const geminiFullOutput = String(fiData[i][FI.GEMINI_FULL_OUTPUT] || "");
      const studentFileId = String(fiData[i][FI.STUDENT_FILE_ID]).trim();
      const configId = String(fiData[i][FI.CONFIG_ID]).trim();
      const studentEmail = String(fiData[i][FI.STUDENT_EMAIL]).trim();
      const stagingRowRef = Number(fiData[i][FI.STAGING_ROW_REF]);

      if (!geminiFullOutput.trim()) {
        Logger.log("[FlowInputBuilder] Row " + rowNum +
                   " marked EVALUATED with no output — leaving for manual review.");
        fiSheet.getRange(rowNum, FI.READY_STATUS + 1).setValue("ERROR_EMPTY_OUTPUT");
        continue;
      }

      try {
        // _parseFlow2Response_ — 15c_Flow2DirectEvaluationService.js,
        // same project, already tested. Returns { complianceStatus,
        // suggestedScore, milestoneOutcomes, rawResponse }.
        const parsed = _parseFlow2Response_(geminiFullOutput);

        const studentFacingReport = _fiStripMilestoneOutcomesLine_(geminiFullOutput);
        const feedbackBlock = _fiFormatFeedbackBlock_(studentFacingReport, parsed.complianceStatus);

        const doc = DocumentApp.openById(studentFileId);
        const body = doc.getBody();
        body.appendParagraph(feedbackBlock);
        doc.saveAndClose();

        const competencyIds = {
          "1": String(fiData[i][FI.MILESTONE_1_COMPETENCY_ID] || ""),
          "2": String(fiData[i][FI.MILESTONE_2_COMPETENCY_ID] || ""),
          "3": String(fiData[i][FI.MILESTONE_3_COMPETENCY_ID] || ""),
          "4": String(fiData[i][FI.MILESTONE_4_COMPETENCY_ID] || ""),
        };
        const milestoneTexts = {
          "1": String(fiData[i][FI.MILESTONE_1] || ""),
          "2": String(fiData[i][FI.MILESTONE_2] || ""),
          "3": String(fiData[i][FI.MILESTONE_3] || ""),
          "4": String(fiData[i][FI.MILESTONE_4] || ""),
        };
        // writeCompetencyEvidenceFromFlow2_ — 15c_Flow2DirectEvaluationService.js,
        // same project, already tested. Skips any milestone with a blank
        // competency ID or no valid outcome — never guesses.
        writeCompetencyEvidenceFromFlow2_(
          studentEmail, configId, studentFileId,
          competencyIds, milestoneTexts, parsed.milestoneOutcomes
        );

        if (stagingSheet) {
          _fiMarkStagingComplete_(stagingSheet, stagingRowRef, studentFileId, configId);
        }

        fiSheet.getRange(rowNum, FI.READY_STATUS + 1).setValue("HARVESTED");
        harvested++;
      } catch (err) {
        Logger.log("[FlowInputBuilder] Harvest failed for row " + rowNum + ": " + err.message);
        fiSheet.getRange(rowNum, FI.READY_STATUS + 1).setValue("ERROR_HARVEST_FAILED");
      }
    }

    if (harvested > 0) {
      SpreadsheetApp.flush();
      Logger.log("[FlowInputBuilder] Harvested " + harvested + " row(s).");
    }
  } catch (err) {
    Logger.log("[FlowInputBuilder] Critical harvest failure: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// Tries the cheap path first (StagingRowRef as a direct row number,
// re-verified against live FileID/ConfigID before trusting it — see
// this file's own header on why a manual clearStagingPipeline() means
// that number can go stale), falling back to a full scan by content.
function _fiMarkStagingComplete_(stagingSheet, stagingRowRef, studentFileId, configId) {
  if (!isNaN(stagingRowRef) && stagingRowRef >= 2) {
    const liveFileId = String(stagingSheet.getRange(stagingRowRef, STG_STUDENT_FILE_ID + 1).getValue()).trim();
    const liveConfigId = String(stagingSheet.getRange(stagingRowRef, STG_CONFIG_ID + 1).getValue()).trim();
    if (liveFileId === studentFileId && liveConfigId === configId) {
      stagingSheet.getRange(stagingRowRef, STG_STATUS + 1).setValue("COMPLETE");
      return;
    }
  }

  const data = stagingSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][STG_STUDENT_FILE_ID]).trim() === studentFileId &&
        String(data[i][STG_CONFIG_ID]).trim() === configId &&
        String(data[i][STG_STATUS]).trim() === "IN_PROCESS") {
      stagingSheet.getRange(i + 1, STG_STATUS + 1).setValue("COMPLETE");
      return;
    }
  }
  Logger.log("[FlowInputBuilder] Could not find matching STAGING_PIPELINE row for FileID " +
             studentFileId + " ConfigID " + configId + " to mark COMPLETE.");
}

// Removes the [MILESTONE_OUTCOMES: {...}] machine-readable line before
// this text ever reaches a student — same stripping regex as
// cas-ccps/studio-steps/CommitStudentEvaluationStep.gs's own
// splitGeminiOutput_(), reimplemented here (not shared — GAS has no
// cross-project function calls; see that file's own header on this
// exact constraint, and 15c_Flow2DirectEvaluationService.js's parallel
// note for _parseFlow2Response_ itself). Deliberately leaves any
// [SUGGESTED_SCORE: N] line intact — 04_Form2_TurnInGate.js's
// extractSuggestedScore_() reads that line directly out of the doc text
// at turn-in time.
function _fiStripMilestoneOutcomesLine_(fullText) {
  return String(fullText || "")
    .replace(/\[MILESTONE_OUTCOMES:\s*(\{[\s\S]*?\})\]\s*/, "")
    .replace(/\s+$/, "");
}

// Builds the same feedback block shape
// cas-ccps/studio-steps/CommitStudentEvaluationStep.gs's own
// formatFeedbackBlock_() produces — real U+2500 box-drawing markers
// (03_QueueBridge.js's appendNextSteps_() only matches this exact
// character, confirmed by that file's own header comment), so the
// already-deployed backPropagateCompletions()/appendNextSteps_() finds
// "── END EVALUATION ──" correctly once it runs.
function _fiFormatFeedbackBlock_(studentFacingReport, complianceStatus) {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const resultLine = complianceStatus === "APPROVED"
    ? "✅ RESULT: YOUR WORK MEETS THE STANDARD"
    : "✏️  RESULT: REVISIONS REQUIRED";

  return "\n── EVALUATION " + timestamp + " ──\n" +
    resultLine + "\n\n" +
    studentFacingReport +
    "\n── END EVALUATION ──\n";
}

// ---------------------------------------------------------------------------
// installFlowInputTriggers — one-time admin action, same pattern as this
// project's other installX() functions (installStudentAggregatorTrigger_,
// installSCRTrigger_, etc.) — checks for an existing trigger by handler
// name before adding a second one.
// ---------------------------------------------------------------------------
function installFlowInputTriggers() {
  const existing = ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());

  if (existing.indexOf("buildFlowInputRows") === -1) {
    ScriptApp.newTrigger("buildFlowInputRows").timeBased().everyMinutes(1).create();
    Logger.log("[FlowInputBuilder] Installed buildFlowInputRows — every 1 minute.");
  }
  if (existing.indexOf("harvestFlowInputResults") === -1) {
    ScriptApp.newTrigger("harvestFlowInputResults").timeBased().everyMinutes(2).create();
    Logger.log("[FlowInputBuilder] Installed harvestFlowInputResults — every 2 minutes.");
  }
}
