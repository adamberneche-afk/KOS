// =============================================================================
// FILE: 37_FlowInputBuilder.js
// BOUND TO: Central Ledger spreadsheet
// TRIGGERS:
//   buildFlowInputRows      — Time-driven, every 1 minute  (mirrors
//                              03_QueueBridge.js's bridgeQueue cadence)
//   harvestFlowInputResults — Time-driven, every 1 minute since 2026-11-14
//                              (the Ledger cycle, 64, runs both; a 5-minute
//                              harvest could add 5 minutes to every check
//                              Studio answered in one). It was every 5,
//                              the nearest interval ScriptApp accepts to
//                              the 2 minutes first specced (see the fix
//                              note on installFlowInputTriggers() below).
//
// PURPOSE: Flow 2 (Student Evaluation) redesign, landed after a live
// Studio build session hit three walls documented in this session's
// own record (see cas-ccps/README.md and cas-ccps/docs/deployment/
// second-account.md, "The real gap", for the fuller writeup):
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
//                  The step MUST find its row by StagingRowRef (column B),
//                  the one column unique to a submission. Matched on
//                  StudentFileID or ConfigID it writes one answer into every
//                  row of that doc (seen live 2026-11-15; the harvest now
//                  flags that, _fiDuplicateWrites_ below).
//
// harvestFlowInputResults() below then does everything Flow 2's original
// design asked Studio's native Docs/Sheets steps (plus the
// GCP-blocked CommitStudentEvaluationStep.gs custom step) to do:
// splitting the response, posting it as a comment on the student's doc
// (FEEDBACK_AS_COMMENT) or writing it into the doc, setting the doc
// header's feedback line (63), writing CompetencyEvidence rows, the
// Ledger's result columns (recordEvaluationResult_) and an EvaluationLog
// row (_fiLogEvaluation_), and marking the originating STAGING_PIPELINE
// row COMPLETE, or ERROR_EVALUATION when the result can't be used. It reuses existing, already-tested functions rather than
// duplicating them:
//   _parseFlow2Response_()             — 15c_Flow2DirectEvaluationService.js
//   writeCompetencyEvidenceFromFlow2_() — 15c_Flow2DirectEvaluationService.js
// both already bound to this same project (see tools/gas-lint/project-map.json).
//
// WHAT THIS DELIBERATELY DOES NOT DO (yet):
//   - Does not touch backPropagateCompletions() in 03_QueueBridge.js
//     (a job of the Ledger cycle, 64, since 2026-10-19). This file only
//     ever flips a STAGING_PIPELINE row to COMPLETE or ERROR_EVALUATION;
//     that job is what closes ReviewQueue, stamps Ledger's
//     LastEval, removes the "[No feedback yet." placeholder, and
//     appends the "WHAT TO DO NEXT" block. Duplicating any of that here
//     would just be a second, divergent copy of logic that already
//     works — so there's a small (~2 minute, bounded by that poller's
//     own cadence) cosmetic window where a student's doc shows both the
//     placeholder and the real feedback at once. Self-heals every run;
//     not worth a tighter coupling between two files for.
//   - Since then: FlowInput is in the retention schedule (57, working
//     data), and 34c's overnight check counts Flow 2 rows still READY
//     after 15 minutes. Flows 3, 4 and 5 were built later on this same
//     pattern, in 41_WarmUpFlowBridge.js (Flow3Input/Flow4Input and
//     WarmUpFlowReturn; Flow 5 was merged into Flow 3 on 2026-11-01).
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
                                   // (or ERROR_EMPTY_OUTPUT / ERROR_SUSPECT_FABRICATION /
                                   // ERROR_MALFORMED_OUTPUT / ERROR_HARVEST_FAILED —
                                   // see _fiCheckPlausibility_ and _fiCheckResultShape_)
  GEMINI_FULL_OUTPUT:          20, // written by Studio Flow 2's own Step 4
  // Appended at the END of the schema on purpose. Every positional reader in
  // this system breaks on a column INSERTED before the end (see
  // 38_LedgerSchemaGuard.js for what that costs); appending is safe, and a
  // row written before this column existed simply reads undefined here.
  PROMPT_TEXT:                 21, // the Flow 2 prompt, pre-substituted
  // Appended 2026-11-14, same rule: the stale-input re-arm's own record
  // (_fiStaleInputs_ below). Studio reads neither; a row built before they
  // existed reads blank here, which means "never re-armed".
  REARMS:                      22, // how many times the re-arm has restarted it
  ARMED_AT:                    23, // when it was last restarted (blank: never)
};

const FI_TAB_NAME = "FlowInput";

const FI_HEADERS = [
  "Timestamp", "StagingRowRef", "StudentFileID", "ConfigID", "TeacherEmail",
  "StudentEmail", "StudentDocURL", "UnitName", "Tier", "Persona",
  "Milestone1", "Milestone2", "Milestone3", "Milestone4", "DefinitionOfDone",
  "Milestone1CompetencyId", "Milestone2CompetencyId",
  "Milestone3CompetencyId", "Milestone4CompetencyId",
  "ReadyStatus", "GeminiFullOutput", "PromptText", "ReArms", "ArmedAt",
];

// A tab made before the last columns were appended gets their headers, so
// a person reading the sheet sees what the cells are.
function _fiEnsureTab_(ledgerSs, cfg) {
  const tabName = (cfg && cfg.tabs && cfg.tabs.flowInput) || FI_TAB_NAME;
  let sheet = ledgerSs.getSheetByName(tabName);
  if (!sheet) {
    sheet = ledgerSs.insertSheet(tabName);
    sheet.appendRow(FI_HEADERS);
    return sheet;
  }
  const width = sheet.getLastColumn();
  if (width > 0 && width < FI_HEADERS.length) {
    sheet.getRange(1, width + 1, 1, FI_HEADERS.length - width).setValues([FI_HEADERS.slice(width)]);
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// The stale-input re-arm (2026-11-14). On 11-13 Studio's Flow 2 stopped
// answering for a day: every READY row sat with no GeminiFullOutput, its
// key held here for good, so even an admin re-queue of the timed-out
// submission built nothing and timed out again. The fix by hand was to
// clear ReadyStatus, which the "left blank" path below sets READY again on
// the next run, a fresh edit that starts Studio. The builder now does that
// itself, on the warm-up retry's pattern (41's wfbRetryStaleInputs_):
//   - A READY row with no output FI_REARM_AFTER_MS after it was set READY
//     (ArmedAt, or its Timestamp if never re-armed) is cleared, and set
//     READY on the next run: at most FI_MAX_REARMS times.
//   - After that it is ERROR_NO_ANSWER: like any ERROR_ row it blocks only
//     its own submission, so a resubmission, or an admin re-queue (whose
//     staging row the turnstile stamps when it releases it), builds a fresh
//     row. The staging row timed out long before (06), and the teacher has
//     had that email; nothing more is sent.
//   - A READY row whose submission is back in the lane (an admin re-queue
//     or a resubmission: an IN_PROCESS staging row stamped after the row
//     was last set READY) is re-armed at once, its count starts again, and
//     its StagingRowRef moves to that staging row so the harvest completes
//     the right one.
// The threshold is the turnstile's lane timeout (06's 12 minutes): by then
// the lane has given up on the row. A late answer still lands: the harvest
// completes the staging row even after ERROR_TIMEOUT, and 03 finishes it.
// A re-armed row can be answered twice (the first run was only slow); the
// harvest applies only the first (_fiAlreadyHarvested_).
// The fixture's row (39, StagingRowRef "FIXTURE") is left alone: it stays
// READY on purpose while the Flow is being built.
// ---------------------------------------------------------------------------
const FI_REARM_AFTER_MS = 12 * 60 * 1000;
const FI_MAX_REARMS = 2;
const FI_NO_ANSWER_STATUS = "ERROR_NO_ANSWER";

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

    // A key is taken while its FlowInput row is still READY/EVALUATED.
    // An ERROR_* row (empty output, suspected fabrication, failed harvest)
    // used to take its key for good, so every later submission of that doc
    // was skipped here, timed out in the lane, and never got feedback
    // again. Now an errored row blocks only the submission it was built
    // for: a STAGING_PIPELINE row stamped after it is a new submission and
    // gets a fresh evaluation. The same submission is never rebuilt, even
    // after an admin resets its staging row, so a suspect row can't re-run
    // on every pass.
    const fiData = fiSheet.getDataRange().getValues();
    const existingKeys = new Set();
    const lastErrorAt = {};
    const newRows = [];
    const unstarted = [];
    const waiting = {}; // key -> a READY row with no output yet (the re-arm)
    for (let i = 1; i < fiData.length; i++) {
      const fiStatus = String(fiData[i][FI.READY_STATUS]).trim();
      if (fiStatus === "HARVESTED") continue;
      if (fiStatus === "" && fiData[i][FI.STUDENT_FILE_ID]) unstarted.push(i + 1);
      const fiKey = fiData[i][FI.STUDENT_FILE_ID] + "|" + fiData[i][FI.CONFIG_ID];
      if (fiStatus.indexOf("ERROR_") === 0) {
        const at = new Date(fiData[i][FI.TIMESTAMP]).getTime() || 0;
        lastErrorAt[fiKey] = Math.max(lastErrorAt[fiKey] || 0, at);
        continue;
      }
      existingKeys.add(fiKey);
      if (fiStatus === "READY" && !String(fiData[i][FI.GEMINI_FULL_OUTPUT] || "").trim()) {
        waiting[fiKey] = i;
      }
    }
    const now = new Date();
    const rearm = {}; // FlowInput row number -> { count, stagingRef }

    // The student's workspace ID → its assignment's TeacherMatrix ConfigID
    // (StudentAssignments, 02). A row with none (the canary, which uses one
    // ID for both) is looked up by its own ID, as before.
    const assignments = readStudentAssignments_(ledgerSs).byStudent;

    let built = 0;
    for (let i = 1; i < stagingData.length; i++) {
      if (String(stagingData[i][STG_STATUS]).trim() !== "IN_PROCESS") continue;

      const studentFileId = String(stagingData[i][STG_STUDENT_FILE_ID]).trim();
      const configId      = String(stagingData[i][STG_CONFIG_ID]).trim();
      if (!studentFileId || !configId) continue;

      const key = studentFileId + "|" + configId;
      if (existingKeys.has(key)) {
        // Back in the lane while its row still waits: restart that row.
        const w = waiting[key];
        if (w !== undefined && _fiRearmable_(fiData[w]) &&
            sheetTimestampMs_(stagingData[i][STG_TIMESTAMP]) > _fiArmedAtMs_(fiData[w])) {
          rearm[w + 1] = { count: 0, stagingRef: i + 1 };
        }
        continue;
      }
      if (lastErrorAt[key] !== undefined) {
        const stagedAt = new Date(stagingData[i][STG_TIMESTAMP]).getTime();
        if (!(stagedAt > lastErrorAt[key])) continue;
      }

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
        matrixRow = _fiFindTeacherMatrixRow_(matrixSsId, assignments[configId] || configId);
      } catch (e) {
        Logger.log("[FlowInputBuilder] Could not read TeacherMatrix " + matrixSsId +
                   ": " + e.message + " — will retry next cycle.");
        continue;
      }
      if (!matrixRow) {
        Logger.log("[FlowInputBuilder] No TeacherMatrix row for ConfigID " + (assignments[configId] || configId) +
                   " in " + matrixSsId + " — will retry next cycle.");
        continue;
      }

      // The doc Flow 2 reads and the feedback goes to: the student's doc, or
      // for a form, Slides or Sheets part (Phase 4b/4c/4d) its snapshot doc, which 13
      // rewrote from the file at Submit (00's FormSnapshots). A copy with
      // none recorded can't have passed Submit; it waits, logged.
      let readDocId = studentFileId;
      if (workFileHasSnapshot_(ledgerRow.workType)) {
        const snap = formSnapshotFor_(ledgerSs, studentFileId);
        if (!snap) {
          Logger.log("[FlowInputBuilder] No FormSnapshots row for the " + ledgerRow.workType + " of ConfigID " + configId +
                     " — will retry next cycle.");
          continue;
        }
        readDocId = snap.snapshotDocId;
      }

      // The student's process reflection for this submission, if one was
      // asked (13, REFLECTION_ON_SUBMIT): into the prompt, and back to the
      // student as a comment once the row is in.
      const reflection = _fiSubmissionReflection_(ledgerSs, cfg, configId, studentFileId,
        sheetTimestampMs_(stagingData[i][STG_TIMESTAMP]));

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
        // A form part's is its snapshot doc (Phase 4b): Studio's Extract step
        // reads it like any student doc, and the harvest writes there.
        "https://docs.google.com/document/d/" + readDocId + "/edit",
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
        "", // ReadyStatus — set to READY just below, as its own edit
        "", // GeminiFullOutput — Studio Flow 2 fills this in
        // The Flow 2 prompt with every placeholder resolved EXCEPT
        // {{STUDENT_TEXT}} — see _fiBuildPromptText_ below.
        _fiBuildPromptText_(matrixRow, _fiReflectionPromptText_(reflection),
          _fiEarlierPartsText_(ledgerSs, cfg, ledgerRow.googleId, assignments, assignments[configId])),
      ]);
      newRows.push(fiSheet.getLastRow());
      if (reflection.length) _fiPostReflectionComment_(readDocId, reflection);
      existingKeys.add(key);
      built++;
    }

    // Rows still unanswered past the lane timeout: restarted, or given up.
    const stale = _fiStaleInputs_(fiData, waiting, rearm, now);
    stale.noAnswer.forEach(function (r) {
      fiSheet.getRange(r, FI.READY_STATUS + 1).setValue(FI_NO_ANSWER_STATUS);
      _fiScrubEarlierParts_(fiSheet, r, fiData[r - 1][FI.PROMPT_TEXT]);
    });
    // A restart is a clear now and READY on the next run (the "left blank"
    // path just below): the same two edits as the fix by hand, which started
    // Studio on 11-13. Both in one run could reach Studio as no change at all.
    const rearmRows = Object.keys(rearm);
    rearmRows.forEach(function (r) {
      const n = Number(r);
      fiSheet.getRange(n, FI.READY_STATUS + 1).setValue("");
      fiSheet.getRange(n, FI.REARMS + 1, 1, 2).setValues([[rearm[r].count, now]]);
      if (rearm[r].stagingRef) fiSheet.getRange(n, FI.STAGING_ROW_REF + 1).setValue(rearm[r].stagingRef);
    });
    if (rearmRows.length || stale.noAnswer.length) {
      SpreadsheetApp.flush();
      Logger.log("[FlowInputBuilder] Studio had not answered: restarted " + rearmRows.length +
                 " row(s), gave up on " + stale.noAnswer.length + " (" + FI_NO_ANSWER_STATUS + ").");
    }

    // READY goes in as an edit of a row already there, not with the
    // appended row. Flow 2's Studio starter ("When a sheet changes",
    // ReadyStatus -> READY) never fired on an appended row in 40 days of
    // history, and fired at once when the cell was retyped (2026-10-19).
    // A row left blank by an earlier run that stopped in between is set
    // here too, so none waits forever.
    // A blank row also gets ArmedAt = now: the re-arm's 12 minutes count
    // from this READY, not from when the row was built. Without it a row
    // cleared by hand days after it was built (11-15) was restarted again
    // on the very next run, while Studio was still answering this edit.
    if (newRows.length || unstarted.length) {
      SpreadsheetApp.flush();
      newRows.concat(unstarted).forEach(r => fiSheet.getRange(r, FI.READY_STATUS + 1).setValue("READY"));
      unstarted.forEach(r => fiSheet.getRange(r, FI.ARMED_AT + 1).setValue(now));
      SpreadsheetApp.flush();
    }
    if (built > 0) {
      Logger.log("[FlowInputBuilder] Built " + built + " FlowInput row(s).");
    }
    if (unstarted.length) {
      Logger.log("[FlowInputBuilder] Set READY on " + unstarted.length + " row(s) left blank by an earlier run.");
    }
  } catch (err) {
    Logger.log("[FlowInputBuilder] Critical failure: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// When a FlowInput row was last set READY, in ms: its ArmedAt, or its
// Timestamp if it was never re-armed. NaN when neither reads.
function _fiArmedAtMs_(row) {
  const armed = sheetTimestampMs_(row[FI.ARMED_AT]);
  return isNaN(armed) ? sheetTimestampMs_(row[FI.TIMESTAMP]) : armed;
}

// Only a real submission's row is re-armed: its StagingRowRef is a row
// number. The fixture's is "FIXTURE".
function _fiRearmable_(row) {
  const ref = Number(row[FI.STAGING_ROW_REF]);
  return String(row[FI.STAGING_ROW_REF]).trim() !== "" && !isNaN(ref) && ref >= 2;
}

// The waiting rows past FI_REARM_AFTER_MS: each is added to `rearm` (row
// number -> { count }) while it has re-arms left, else listed in noAnswer.
// A row already in `rearm` (back in the lane) is skipped. Reads only.
function _fiStaleInputs_(fiData, waiting, rearm, now) {
  const out = { noAnswer: [] };
  Object.keys(waiting).forEach(function (key) {
    const i = waiting[key];
    const row = fiData[i];
    if (rearm[i + 1] || !_fiRearmable_(row)) return;
    const at = _fiArmedAtMs_(row);
    if (isNaN(at) || now.getTime() - at < FI_REARM_AFTER_MS) return;
    const count = Number(row[FI.REARMS]) || 0;
    if (count < FI_MAX_REARMS) rearm[i + 1] = { count: count + 1 };
    else out.noAnswer.push(i + 1);
  });
  return out;
}

// ---------------------------------------------------------------------------
// The Ledger cycle's checks (64's LC_GATES, 2026-11-15): does the job have
// work? Each reads only the columns its job decides on, through the
// cycle's shared reads, and says false only when the job would do nothing.
// Keep each in step with its job.
// ---------------------------------------------------------------------------

// buildFlowInputRows has work when: a FlowInput row was left blank by an
// earlier run; a READY row is due for its re-arm (a minute early); or an
// IN_PROCESS submission has no live FlowInput row (and isn't the one its
// last ERROR_ row was built for), or has a READY one it was released after
// (the re-arm "back in the lane"). Reads STAGING_PIPELINE (six columns,
// shared) and four narrow FlowInput reads: Timestamp to ConfigID, ReadyStatus
// and ArmedAt. It doesn't read GeminiFullOutput, so a READY row that has an
// answer counts as waiting: that can only run the job when it has nothing
// to do, never skip it when it has.
function flowInputBuildHasWork_(ctx) {
  const tabs = ctx.cfg().tabs;
  const fiTab = tabs.flowInput || FI_TAB_NAME;
  const staging = ctx.rows("admin", tabs.stagingPipeline, 1, 0);
  if (staging === null) return true;
  const ids = ctx.rows("ledger", fiTab, 1, FI.CONFIG_ID + 1);
  if (ids === null) return true; // the job makes the tab
  if (!staging.length) return false; // the job stops there
  const status = ctx.rows("ledger", fiTab, FI.READY_STATUS + 1, 1);
  const now = Date.now();
  const existing = {};
  const lastErrorAt = {};
  const waiting = {}; // key -> [FlowInput rows (as the re-arm reads them)]
  let armed = null;
  const rowOf = function (i) {
    if (armed === null) armed = ctx.rows("ledger", fiTab, FI.ARMED_AT + 1, 1);
    const row = [];
    row[FI.TIMESTAMP] = ids[i][FI.TIMESTAMP];
    row[FI.STAGING_ROW_REF] = ids[i][FI.STAGING_ROW_REF];
    row[FI.ARMED_AT] = armed[i] ? armed[i][0] : "";
    return row;
  };
  for (let i = 0; i < ids.length; i++) {
    const st = String(status[i] ? status[i][0] : "").trim();
    if (st === "HARVESTED") continue;
    if (st === "" && ids[i][FI.STUDENT_FILE_ID]) return true; // left blank: set READY
    const key = ids[i][FI.STUDENT_FILE_ID] + "|" + ids[i][FI.CONFIG_ID];
    if (st.indexOf("ERROR_") === 0) {
      const at = new Date(ids[i][FI.TIMESTAMP]).getTime() || 0;
      lastErrorAt[key] = Math.max(lastErrorAt[key] || 0, at);
      continue;
    }
    existing[key] = true;
    if (st === "READY") {
      const row = rowOf(i);
      if (_fiRearmable_(row)) {
        const at = _fiArmedAtMs_(row);
        if (!isNaN(at) && now - at >= FI_REARM_AFTER_MS - 60 * 1000) return true; // due for its re-arm
        (waiting[key] = waiting[key] || []).push(row);
      }
    }
  }
  return staging.some(function (r) {
    if (String(r[STG_STATUS]).trim() !== "IN_PROCESS") return false;
    const fileId = String(r[STG_STUDENT_FILE_ID]).trim();
    const configId = String(r[STG_CONFIG_ID]).trim();
    if (!fileId || !configId) return false;
    const key = fileId + "|" + configId;
    if (existing[key]) {
      return (waiting[key] || []).some(function (row) {
        return sheetTimestampMs_(r[STG_TIMESTAMP]) > _fiArmedAtMs_(row);
      });
    }
    if (lastErrorAt[key] !== undefined && !(new Date(r[STG_TIMESTAMP]).getTime() > lastErrorAt[key])) return false;
    return true;
  });
}

// harvestFlowInputResults has work when a FlowInput row is EVALUATED. Reads
// FlowInput's ReadyStatus column. No FlowInput tab: the job returns at once.
function flowInputHarvestHasWork_(ctx) {
  const status = ctx.rows("ledger", ctx.cfg().tabs.flowInput || FI_TAB_NAME, FI.READY_STATUS + 1, 1);
  if (status === null) return false;
  return status.some(function (r) { return String(r[0]).trim() === "EVALUATED"; });
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
        // "form" or "slides" for a part's copy (Phase 4b/4c/4d): Flow 2 reads its snapshot doc.
        workType: workFileTypeOfUrl_(data[i][LEDGER.ADMIN_FILE_URL]),
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
        // Competency IDs through 32's competencyIdText_ (2026-11-18): String()
        // of a cell Sheets stored as a date wrote "Tue Jul 01 8177 …" into
        // FlowInput and then CompetencyEvidence.
        milestone1CompetencyId: competencyIdText_(row[FI_TM_COLUMNS_.MILESTONE_1_COMPETENCY_ID]),
        milestone2CompetencyId: competencyIdText_(row[FI_TM_COLUMNS_.MILESTONE_2_COMPETENCY_ID]),
        milestone3CompetencyId: competencyIdText_(row[FI_TM_COLUMNS_.MILESTONE_3_COMPETENCY_ID]),
        milestone4CompetencyId: competencyIdText_(row[FI_TM_COLUMNS_.MILESTONE_4_COMPETENCY_ID]),
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
//
// The process reflection (2026-10-24) is the one piece of student writing
// substituted here: the student typed it on the dashboard, and 13 already
// keeps it in ReflectionLog, so it is in the Ledger either way
// (docs/FERPA_DATA_MAP.md, ReflectionLog). The response itself still never is.
function _fiBuildPromptText_(matrixRow, processReflection, earlierParts, runKey) {
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
    PROCESS_REFLECTION: processReflection || "(none)",
    EARLIER_PARTS: earlierParts || "(none)",
    // The run line (2026-11-16): echoed back in the answer's RUN_INFO line.
    RUN_KEY: runKey || _fiNewRunKey_(),
    PROMPT_VERSION: _fiPromptVersion_(),
    // STUDENT_TEXT deliberately omitted — keepUnmatched leaves it in place.
  }, true);
}

// ---------------------------------------------------------------------------
// Provenance (2026-11-16): what made each result, recorded with it in
// EvaluationLog, since Flow 2 changed under live use (the grader, students'
// behavior, and Studio and its model; meta/FLOW2_VERSIONS_2026-11.md).
//   - CodeVersion: this project's deploy marker (43's DEPLOY_VERSION_SHA,
//     stamped by run.js with the pushed commit), first 7 characters.
//   - PromptVersion: "f2-" + the first 8 hex of FLOW_2_SYSTEM_PROMPT's
//     SHA-256, the template before anything is filled in. It changes only
//     when the prompt does. Read from the row's own PromptText, so it is the
//     version the row was sent, not today's.
//   - PromptHash: the first 12 hex of the row's whole PromptText.
//   - RunCheck: the answer's [RUN_INFO: {...}] line against what the row
//     sent: OK, NO_RUN_INFO, RUN_INFO_NOT_JSON, RUN_KEY_MISMATCH (an answer
//     in the wrong row: the duplicate write, another lesson's answer),
//     PROMPT_MISMATCH (Studio sent another prompt), or OLDER_PROMPT (built
//     before the run line). Recorded with every result; since 2026-11-19
//     (the operator, D19) a RUN_KEY_MISMATCH is also held back: the answer
//     names another row's run, so it isn't this submission's. It is set
//     aside like a malformed result (re-armed once, then
//     ERROR_MALFORMED_OUTPUT). The others are recorded and delivered.
//   - ModelConfigured: the model StudioConfig (39b, the operator's record)
//     says Flow 2's Ask Gemini step ran at harvest time.
//   - ModelReported: the model the answer says wrote it. A model knows its
//     name from its training, not from what runs it, so this is a hint: a
//     change in it is a sign; no change proves nothing. Studio's own record
//     of the model is the operator's (meta/FLOW2_VERSIONS_2026-11.md).
// No student text, ever.
// ---------------------------------------------------------------------------
// StudioConfig (39b, 2026-11-16): the operator's record of what Studio runs.
// The harvest stamps the model in effect on each EvaluationLog row.
const STUDIO_CONFIG_TAB = "StudioConfig";
const STUDIO_CONFIG_HEADERS = ["From", "Flow", "Step", "Model", "Settings", "Note", "RecordedAt"];

// StudioConfig's rows as { fromMs, flow, step, model }, oldest first; [] when
// there is no tab.
function studioConfigRows_(ss) {
  const sheet = ss.getSheetByName(STUDIO_CONFIG_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, STUDIO_CONFIG_HEADERS.length).getValues()
    .map(function (r) {
      return { fromMs: sheetTimestampMs_(r[0]), flow: String(r[1]).trim(), step: String(r[2]).trim(),
        model: String(r[3]).trim(), recordedMs: sheetTimestampMs_(r[6]) };
    })
    .filter(function (r) { return !isNaN(r.fromMs); })
    .sort(function (a, b) { return a.fromMs - b.fromMs; });
}

// The model StudioConfig says Flow 2's Ask Gemini step ran at `atMs`: the
// latest such row with a model, from at or before then. "" when none.
function studioModelAt_(rows, atMs) {
  let model = "";
  (rows || []).forEach(function (r) {
    if (r.fromMs <= atMs && r.model && /^flow\s*2$/i.test(r.flow) && /ask gemini/i.test(r.step)) model = r.model;
  });
  return model;
}

// The daily drift probe's row (39b, 2026-11-16): a fixture row Flow 2
// answers once a day on fixed text. The harvest leaves it EVALUATED for the
// probe to read; nothing is delivered.
const FI_DRIFT_PROBE_REF = "PROBE";

function _fiIsDriftProbeRow_(row) {
  return String(row[FI.STAGING_ROW_REF]).trim() === FI_DRIFT_PROBE_REF;
}

const FI_RUN_KEY_MISMATCH = "RUN_KEY_MISMATCH";
const FI_RUN_INFO_RE = /\[RUN_INFO:\s*(\{[^\n]*?\})\]/;
const FI_SENT_RUN_RE = /"run":"([^"]*)","prompt":"([^"]*)"/;

function _fiNewRunKey_() {
  return "r-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8).toLowerCase();
}

function _fiPromptVersion_() {
  return "f2-" + _fiOutputHash_(FLOW_2_SYSTEM_PROMPT).slice(0, 8);
}

function _fiCodeVersion_() {
  return String(DEPLOY_VERSION_SHA).slice(0, 7); // 43, same project
}

// { codeVersion, promptVersion, promptHash, runCheck, model } for one row
// and its answer. Never throws.
function _fiProvenance_(fiRow, output) {
  const out = { codeVersion: "", promptVersion: "", promptHash: "", runCheck: "", model: "" };
  try {
    out.codeVersion = _fiCodeVersion_();
    const prompt = String(fiRow[FI.PROMPT_TEXT] || "");
    if (prompt.trim()) out.promptHash = _fiOutputHash_(prompt).slice(0, 12);
    const sent = FI_SENT_RUN_RE.exec(prompt);
    if (!sent) { out.runCheck = "OLDER_PROMPT"; return out; }
    out.promptVersion = sent[2];
    const text = String(output || "");
    const all = text.match(new RegExp(FI_RUN_INFO_RE.source, "g"));
    if (!all) { out.runCheck = text.trim() ? "NO_RUN_INFO" : ""; return out; }
    let info;
    try { info = JSON.parse(FI_RUN_INFO_RE.exec(all[all.length - 1])[1]); } catch (e) { info = null; }
    if (!info || typeof info !== "object") { out.runCheck = "RUN_INFO_NOT_JSON"; return out; }
    out.model = String(info.model === undefined ? "" : info.model).replace(/\s+/g, " ").trim().slice(0, 80);
    if (String(info.run) !== sent[1]) out.runCheck = FI_RUN_KEY_MISMATCH;
    else if (String(info.prompt) !== sent[2]) out.runCheck = "PROMPT_MISMATCH";
    else out.runCheck = "OK";
  } catch (e) {
    out.runCheck = out.runCheck || "UNREADABLE";
  }
  return out;
}

// ---------------------------------------------------------------------------
// A later part of a lesson in parts (68): the student's own work on the
// parts before it, for Flow 2's EARLIER PARTS block (2026-10-28). Each open
// earlier part's response zone (03's responseZoneBounds_), read from its
// doc, under its title, with braces and <<< >>> markers taken out and at
// most FI_EARLIER_PART_MAX characters. "" for a first part or a whole lesson.
// byStudent is StudentAssignments (workspace ConfigID -> assignment).
// ---------------------------------------------------------------------------
const FI_EARLIER_PART_MAX = 6000;

function _fiEarlierPartsText_(ledgerSs, cfg, googleId, byStudent, assignmentId) {
  const info = partOfConfigId_(assignmentId);
  if (!info || info.n === 1) return "";
  const ledger = ledgerSs.getSheetByName(cfg.tabs.ledger);
  if (!ledger || ledger.getLastRow() < 2) return "";
  const me = String(googleId || "").trim().toLowerCase();
  const files = {}; // part number -> { fileId, title }
  ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER_COL_COUNT).getValues().forEach(function (r) {
    if (String(r[LEDGER.GOOGLE_ID]).trim().toLowerCase() !== me) return;
    const status = String(r[LEDGER.STATUS]).trim();
    if (status === "ARCHIVED" || status === "SCHEDULED") return;
    const p = partOfConfigId_(byStudent[String(r[LEDGER.CONFIG_ID]).trim()]);
    if (!p || p.lessonKey !== info.lessonKey || p.n >= info.n) return;
    files[p.n] = { fileId: String(r[LEDGER.FILE_ID]).trim(), title: p.part.a.partTitle || "",
      snapshot: workFileHasSnapshot_(workFileTypeOfUrl_(r[LEDGER.ADMIN_FILE_URL])) };
  });
  return Object.keys(files).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
    let text = "";
    // An earlier form, Slides or Sheets part (Phase 4b/4c/4d) is read from its snapshot
    // doc: the file as last submitted. One never submitted has none written yet.
    let docId = files[n].fileId;
    if (files[n].snapshot) {
      const snap = formSnapshotFor_(ledgerSs, docId);
      docId = snap ? snap.snapshotDocId : "";
    }
    try {
      if (!docId) throw new Error("no snapshot doc for an earlier form, Slides or Sheets part");
      const full = DocumentApp.openById(docId).getBody().getText();
      const zone = responseZoneBounds_(full);
      text = zone ? full.substring(zone.from, zone.to).trim() : "";
      if (isWorkSnapshotNotSubmitted_(text)) text = "";
    } catch (e) {
      Logger.log("[FlowInputBuilder] Earlier part " + n + " unreadable: " + e.message);
    }
    text = neutralizeSystemText_(text).replace(/\{\{|\}\}|<<<|>>>/g, "");
    if (text.length > FI_EARLIER_PART_MAX) text = text.slice(0, FI_EARLIER_PART_MAX) + " […]";
    return "Part " + n + (files[n].title ? ": " + files[n].title : "") + "\n" + (text || "(nothing written)");
  }).join("\n\n");
}

// The earlier parts' text is the student's work, which the Ledger otherwise
// never holds (FERPA data map): it stays in PromptText only while the check
// runs, and goes once the row is harvested or fails.
const FI_EARLIER_PARTS_RE = /(<<<EARLIER_PARTS>>>\n)[\s\S]*?(\n<<<END_EARLIER_PARTS>>>)/;

function _fiScrubEarlierParts_(fiSheet, rowNum, promptText) {
  const text = String(promptText || "");
  const m = FI_EARLIER_PARTS_RE.exec(text);
  if (!m || m[0] === m[1] + "(none)" + m[2]) return;
  fiSheet.getRange(rowNum, FI.PROMPT_TEXT + 1)
    .setValue(text.replace(FI_EARLIER_PARTS_RE, "$1(removed after the check)$2"));
}

// ---------------------------------------------------------------------------
// The process reflection for one submission (13 writes it to ReflectionLog
// just before queueing the work). A submission's answers share one
// SubmittedAt; this takes the latest group from at most 6 hours before the
// staging row up to 2 minutes after it, so an answer from an earlier
// submission is never read as this one's. [] when none was asked.
// ---------------------------------------------------------------------------
const FI_REFLECTION_WINDOW_MS = 6 * 60 * 60 * 1000;

function _fiSubmissionReflection_(ledgerSs, cfg, configId, studentFileId, stagedAtMs) {
  let rows;
  try {
    rows = readReflections_(ledgerSs, cfg, configId, studentFileId);
  } catch (e) {
    Logger.log("[FlowInputBuilder] ReflectionLog unreadable for ConfigID " + configId + ": " + e.message);
    return [];
  }
  if (!rows.length || !stagedAtMs) return [];
  const inWindow = rows.filter(function (r) {
    return r.submittedAt && r.submittedAt <= stagedAtMs + 2 * 60 * 1000 &&
           r.submittedAt >= stagedAtMs - FI_REFLECTION_WINDOW_MS;
  });
  if (!inWindow.length) return [];
  const latest = Math.max.apply(null, inWindow.map(function (r) { return r.submittedAt; }));
  return inWindow.filter(function (r) { return r.submittedAt === latest; });
}

// The answers as Flow 2 reads them, each after its question. Braces are
// taken out so an answer can't look like one of the prompt's placeholders.
function _fiReflectionPromptText_(reflection) {
  if (!reflection || !reflection.length) return "";
  const clean = function (t) { return String(t || "").replace(/\{\{|\}\}/g, "").trim(); };
  return reflection.map(function (r) {
    return "Question" + (r.kind === "FEEDBACK" ? " about the last feedback" : "") +
           (r.competencyId ? " (about " + r.competencyId + ")" : "") + ": " + clean(r.question) +
           "\nAnswer: " + clean(r.answer);
  }).join("\n\n");
}

// The student's answers back to them as a comment on their doc, for
// reference while they work (decided 2026-10-24). It sits outside the body,
// so no reader of the response sees it; nothing reads it back.
function _fiPostReflectionComment_(fileId, reflection) {
  const when = Utilities.formatDate(new Date(reflection[0].submittedAt), Session.getScriptTimeZone(), "MMM d");
  const text = "Your reflection (" + when + "). This is for you to look back at while you work. " +
    "It isn't part of your work.\n\n" +
    reflection.map(function (r) { return r.question + "\n" + r.answer; }).join("\n\n");
  try {
    Drive.Comments.create({ content: text }, fileId, { fields: "id" });
  } catch (e) {
    Logger.log("[FlowInputBuilder] Could not post the reflection comment: " + e.message);
  }
}

// ---------------------------------------------------------------------------
// _fiCheckPlausibility_ — a FERPA-safe backstop against kos-personal's
// Round 17 incident (CHANGELOG.md there, 12_StudioReturnHarvest.gs's
// _srCheckGroundedness_ here means kos-personal): Gemini proceeding without
// reading its source material and returning well-formed, schema-passing
// output anyway. A green run and a real answer look identical from every
// check that inspects only shape, never content.
//
// WHY THIS IS NOT A LITERAL PORT OF kos-personal's CHECK. That one opens the
// source document itself and looks for shared vocabulary. Doing the
// equivalent here — opening the student's Doc to compare against
// geminiFullOutput — is exactly the read _fiBuildPromptText_'s comment
// above says this file must never do, even transiently for a comparison
// that stores nothing: "the same FERPA regression docs/FERPA_DATA_MAP.md's
// pointer-based design exists to avoid." That design goes out of its way to
// keep the student's own words out of this project's reach at all, not just
// out of what gets persisted. So this checks two things that need NONE of
// the student's own words:
//
//   1. Does geminiFullOutput contain a self-reported non-access phrase — the
//      model saying, in its own returned text, that it couldn't reach
//      something? This is the exact shape of kos-personal's incident log
//      ("Workspace sources is turned off... sent without file
//      references"), just checked against the output itself rather than a
//      run log an operator has to remember to read.
//   2. Does geminiFullOutput engage with ANY of the rubric content this row
//      actually carries — persona, unit name, tier, or milestone text? All
//      teacher-authored curriculum content already legitimately sitting in
//      this row (the same fields _fiBuildPromptText_ substitutes into
//      PromptText), never student content. A response mentioning none of
//      it didn't even use the one thing Apps Script hands Gemini directly.
//
// WHAT THIS DOES NOT PROVE, UNLIKE kos-personal's CHECK: that the model
// read the STUDENT'S text specifically. It cannot prove that without doing
// the read this design forbids. This is a narrower, honest backstop — it
// catches a model that announces non-access, or one that ignored the
// rubric entirely, not one that read the rubric but fabricated a response
// to the student's actual submission. Say so in the failure reason rather
// than implying more (Flow Doctrine rule 10/13: a check states what it
// cannot know).
// ---------------------------------------------------------------------------
// GENERATED from shared/flow-harness/plausibility-phrases.json — do not
// hand-edit; run `node tools/flow-harness-sync/sync-plausibility-phrases.js`.
// Canonical across all three systems' plausibility/groundedness gates
// (redundancy review B1 / flow-harness proposal Phase 0) — this file's own
// runtime code stays separate from cas-ccps/leader-hub's (GAS has no
// cross-project function calls), only this DATA is unified so the three
// gates can't silently disagree on what counts as "the model said it
// couldn't access something."
const FI_NON_ACCESS_PHRASES = [
  "can't access", 'cannot access', 'could not open', "couldn't open",
  'do not have access', "don't have access", 'i do not have', "i don't have",
  'insufficient context', 'insufficient information', 'no access to', 'not enough context',
  'not enough information', 'unable to access', 'unable to generate', 'unable to open',
  'unable to view', 'was not given', 'was not provided', 'without reading',
  'workspace sources',
];

// Longest-unique-word-first, same proxy kos-personal's _srDistinguishingWords_
// uses for "distinguishing": rare/specific terms (a persona name, a unit
// title, curriculum vocabulary) tend to run longer than common English
// filler. Reimplemented here rather than shared — GAS has no cross-project
// function calls (this file's own header), and this project is a separate
// one from kos-personal.
//
// GENERATED from shared/flow-harness/plausibility-phrases.json — see
// FI_NON_ACCESS_PHRASES above.
const FI_PLAUSIBILITY_STOPWORDS = {
  actually: 1, additional: 1, although: 1, another: 1, basically: 1, because: 1,
  between: 1, content: 1, context: 1, covered: 1, covering: 1, definition: 1,
  different: 1, discuss: 1, discussed: 1, discussion: 1, document: 1, eventually: 1,
  everything: 1, follow: 1, following: 1, follows: 1, general: 1, generally: 1,
  however: 1, important: 1, involved: 1, milestone: 1, operator: 1, overall: 1,
  process: 1, produce: 1, produced: 1, project: 1, regarding: 1, session: 1,
  should: 1, something: 1, specific: 1, student: 1, summary: 1, system: 1,
  teacher: 1, therefore: 1, through: 1, various: 1, without: 1, working: 1,
};

// GENERATED from shared/flow-harness/plausibility-phrases.json.
const FI_PLAUSIBILITY_MAX_CANDIDATES = 40;

function _fiDistinguishingWords_(text) {
  const seen = {};
  const words = [];
  const matches = String(text).toLowerCase().match(/[a-z0-9]{6,}/g) || [];
  matches.forEach(function (w) {
    if (seen[w] || FI_PLAUSIBILITY_STOPWORDS[w]) return;
    seen[w] = true;
    words.push(w);
  });
  words.sort(function (a, b) { return b.length - a.length; });
  return words.slice(0, FI_PLAUSIBILITY_MAX_CANDIDATES);
}

function _fiCheckPlausibility_(geminiFullOutput, fiRow) {
  const text = String(geminiFullOutput || '');
  const lower = text.toLowerCase();

  const nonAccessHit = FI_NON_ACCESS_PHRASES.find(function (p) { return lower.indexOf(p) !== -1; });
  if (nonAccessHit) {
    return {
      ok: false,
      reason: 'the model\'s own output contains a self-reported non-access phrase ("' +
        nonAccessHit + '") — the same shape as kos-personal\'s Round 17 incident, where Gemini ' +
        'proceeded without reading its source material and said so in its own text.',
    };
  }

  const rubricWords = _fiDistinguishingWords_([
    fiRow[FI.PERSONA], fiRow[FI.UNIT_NAME], fiRow[FI.TIER],
    fiRow[FI.MILESTONE_1], fiRow[FI.MILESTONE_2], fiRow[FI.MILESTONE_3], fiRow[FI.MILESTONE_4],
  ].join(' '));
  if (!rubricWords.length) return { ok: true }; // nothing distinctive in the rubric to check against

  const engaged = rubricWords.some(function (w) { return lower.indexOf(w) !== -1; });
  if (!engaged) {
    return {
      ok: false,
      reason: 'the model\'s output shares none of this row\'s rubric content — e.g. ' +
        rubricWords.slice(0, 6).join(', ') + '. Does not prove the student\'s own response went ' +
        'unread (this check never opens that Doc — see its own comment for why), but the model ' +
        'did not engage with the one thing this row hands it directly (@trigger.PromptText).',
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// harvestFlowInputResults — for every FlowInput row Studio has finished
// (ReadyStatus = "EVALUATED"), splits the Gemini output, writes the
// student-facing feedback into their doc, writes CompetencyEvidence
// rows, and marks the originating STAGING_PIPELINE row COMPLETE so the
// already-deployed backPropagateCompletions() (03_QueueBridge.js) closes
// the rest of the loop on its own next cycle.
//
// EVALUATED -> HARVESTED (or ERROR_EMPTY_OUTPUT / ERROR_SUSPECT_FABRICATION /
// ERROR_MALFORMED_OUTPUT / ERROR_HARVEST_FAILED). ERROR_SUSPECT_FABRICATION is
// _fiCheckPlausibility_'s gate, checked before any write to the student's doc
// — same "touch nothing on a suspect row" rule as the other error paths.
// Then (2026-11-15) a copy of a later row's answer (_fiDuplicateWrites_) and
// a result whose machine lines don't hold together (_fiCheckResultShape_)
// are set aside undelivered: re-armed once, then ERROR_MALFORMED_OUTPUT.
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
    let evalLog = null; // EvaluationLog rows, read once if a re-armed row needs them
    let answered = false; // Studio answered a real row: clears 03's not-answering alert
    const now = new Date();
    // One answer in several rows of a doc (Studio's Update row matched on a
    // column that isn't unique): flagged, and the earlier row's copy held back.
    const dupes = _fiDuplicateWrites_(fiData);
    if (dupes.events.length) _fiRecordDuplicateWrites_(ledgerSs, dupes.events, now);
    const setAside = { rearmed: 0, malformed: 0, reasons: {} };
    let studioRows = null; // StudioConfig (39b), read once if a row is harvested
    const workTypes = {}; // fileId -> work type, from the Ledger, read once if needed
    let heldTwice = 0; // answers for submissions already delivered (not after a restart)

    for (let i = 1; i < fiData.length; i++) {
      if (String(fiData[i][FI.READY_STATUS]).trim() !== "EVALUATED") continue;
      if (_fiIsDriftProbeRow_(fiData[i])) continue; // 39b reads it

      const rowNum = i + 1;
      const geminiFullOutput = String(fiData[i][FI.GEMINI_FULL_OUTPUT] || "");
      const studentFileId = String(fiData[i][FI.STUDENT_FILE_ID]).trim();
      const configId = String(fiData[i][FI.CONFIG_ID]).trim();
      const studentEmail = String(fiData[i][FI.STUDENT_EMAIL]).trim();
      const stagingRowRef = Number(fiData[i][FI.STAGING_ROW_REF]);
      // The doc Flow 2 read, where the feedback goes: the student's doc, or
      // a form part's snapshot doc (Phase 4b). The work file's ID stays the
      // key for the Ledger, the evidence and the logs.
      const feedbackDocId = _fiDocIdFromUrl_(fiData[i][FI.STUDENT_DOC_URL]) || studentFileId;
      if (geminiFullOutput.trim() && !FLOW2_ALERT_SYNTHETIC_RE.test(configId)) answered = true;
      // What made this answer (2026-11-16): recorded with every log row below,
      // with the model StudioConfig (39b) says Ask Gemini ran.
      const prov = _fiProvenance_(fiData[i], geminiFullOutput);
      if (studioRows === null) {
        try { studioRows = studioConfigRows_(ledgerSs); } catch (e) { studioRows = []; }
      }
      prov.modelConfigured = studioModelAt_(studioRows, now.getTime());
      if (prov.runCheck && prov.runCheck !== "OK" && prov.runCheck !== "OLDER_PROMPT") {
        Logger.log("[FlowInputBuilder] Row " + rowNum + ": run check " + prov.runCheck +
          (prov.runCheck === FI_RUN_KEY_MISMATCH ? " (another row's answer: held back)." : " (recorded; not held back)."));
      }

      // One submission, one delivery (2026-11-17, proposed after the 11-15
      // re-grade, the operator's yes): a row whose submission already had a
      // result applied is never delivered again, whatever answered it
      // again: a re-armed row's second answer (the first run was only
      // slow), or a Studio test run that set rows already HARVESTED back to
      // EVALUATED (the 11-15 re-grade did, and every student got a second
      // comment). The answer is left out untouched and the row goes back
      // to HARVESTED; nothing reaches the student, the Ledger or the
      // evidence. Applied = an EvaluationLog PASSED or NEEDS_REVISION row
      // for the same file and ConfigID at or after the row was built.
      if (evalLog === null) evalLog = _fiEvaluationLogRows_(ledgerSs, cfg);
      if (_fiAlreadyHarvested_(evalLog, fiData[i])) {
        const restarted = String(fiData[i][FI.ARMED_AT] || "").trim() !== "";
        Logger.log("[FlowInputBuilder] Row " + rowNum + (restarted
          ? " was answered again after a restart; the first answer is already applied, so this one is left out."
          : " was answered again after its result was delivered (a Studio test run?); left out, not delivered twice."));
        fiSheet.getRange(rowNum, FI.READY_STATUS + 1).setValue("HARVESTED");
        if (!restarted) heldTwice++;
        continue;
      }

      if (!geminiFullOutput.trim()) {
        Logger.log("[FlowInputBuilder] Row " + rowNum +
                   " marked EVALUATED with no output — leaving for manual review.");
        fiSheet.getRange(rowNum, FI.READY_STATUS + 1).setValue("ERROR_EMPTY_OUTPUT");
        _fiScrubEarlierParts_(fiSheet, rowNum, fiData[i][FI.PROMPT_TEXT]);
        if (stagingSheet) _fiMarkStagingFailed_(stagingSheet, stagingRowRef, studentFileId, configId);
        _fiLogEvaluation_(ledgerSs, cfg, studentFileId, configId, "ERROR_EMPTY_OUTPUT", null, null, prov);
        continue;
      }

      const plausibility = _fiCheckPlausibility_(geminiFullOutput, fiData[i]);
      if (!plausibility.ok) {
        Logger.log("[FlowInputBuilder] Row " + rowNum + " ERROR_SUSPECT_FABRICATION: " +
                   plausibility.reason);
        fiSheet.getRange(rowNum, FI.READY_STATUS + 1).setValue("ERROR_SUSPECT_FABRICATION");
        _fiScrubEarlierParts_(fiSheet, rowNum, fiData[i][FI.PROMPT_TEXT]);
        if (stagingSheet) _fiMarkStagingFailed_(stagingSheet, stagingRowRef, studentFileId, configId);
        _fiLogEvaluation_(ledgerSs, cfg, studentFileId, configId, "ERROR_SUSPECT_FABRICATION", null, null, prov);
        continue;
      }

      // Never delivered: a copy of a later submission's answer, an answer
      // whose run line names another row's run (2026-11-19, D19), or a
      // result whose machine lines don't hold together (2026-11-15). Each is
      // run again once (the re-arm), then ERROR_MALFORMED_OUTPUT.
      const shape = dupes.copies[rowNum]
        ? { ok: false, reason: "a later submission's answer, copied into this row" }
        : prov.runCheck === FI_RUN_KEY_MISMATCH
          ? { ok: false, reason: "another row's answer (its run key isn't this row's)" }
          : _fiCheckResultShape_(geminiFullOutput, fiData[i]);
      if (!shape.ok) {
        const outcome = _fiSetAsideMalformed_(fiSheet, rowNum, fiData[i], now);
        setAside.reasons[shape.reason] = (setAside.reasons[shape.reason] || 0) + 1;
        if (outcome === "REARMED") {
          setAside.rearmed++;
        } else {
          setAside.malformed++;
          if (stagingSheet) _fiMarkStagingFailed_(stagingSheet, stagingRowRef, studentFileId, configId);
          _fiLogEvaluation_(ledgerSs, cfg, studentFileId, configId, FI_MALFORMED_STATUS, null, null, prov);
        }
        continue;
      }

      try {
        // _parseFlow2Response_ — 15c_Flow2DirectEvaluationService.js,
        // same project, already tested. Returns { complianceStatus,
        // suggestedScore, milestoneOutcomes, rawResponse }.
        const parsed = _parseFlow2Response_(geminiFullOutput);
        // The outcomes and the stamp _fiCheckResultShape_ checked: the last
        // outcomes line, and a stamp the outcomes agree with. Before
        // 2026-11-15 a tiered APPROVED the outcomes didn't support was
        // turned into REVISION_REQUIRED and delivered; now it is malformed.
        parsed.milestoneOutcomes = shape.outcomes;
        parsed.complianceStatus = shape.compliance;
        // Tiered assignments (COMPETENCY_TIERS, 2026-10-20): the tertiary
        // competencies the work showed are read from the ALSO_SHOWN line.
        const tiers = _fiTiersFromDod_(String(fiData[i][FI.DEFINITION_OF_DONE] || ""));
        const alsoShown = tiers ? _fiAlsoShown_(geminiFullOutput, tiers.tertiary) : [];

        const studentFacingReport = _fiStripMilestoneOutcomesLine_(geminiFullOutput);
        // As a comment: on a Slides part's deck itself (2026-11-17, the
        // operator: the student revises the deck, so the feedback belongs
        // there; the feedback page stays the record of what was checked),
        // else on the doc Flow 2 read. A deck that won't take it falls back
        // to the feedback page, then to the doc's feedback zone.
        let asComment = "", commentUrl = "", onSlides = false;
        if (feedbackAsCommentFor_(configId)) {
          const c = _fiPostFeedbackComment_(ledgerSs, cfg, feedbackDocId, studentFileId,
            _fiFormatFeedbackComment_(studentFacingReport, parsed.complianceStatus), workTypes);
          asComment = c.id; onSlides = c.onSlides; commentUrl = c.url;
        }
        if (!asComment) {
          const doc = DocumentApp.openById(feedbackDocId);
          _fiInsertEvaluation_(doc.getBody(),
            _fiFormatFeedbackBlock_(studentFacingReport, parsed.complianceStatus));
          doc.saveAndClose();
        }
        // The doc header's feedback line (00), color-coded by the result.
        setDocFeedbackStatus_(feedbackDocId,
          parsed.complianceStatus === "APPROVED" ? "PASSED" : "REVISE",
          { inComments: !!asComment, onSlides: onSlides, commentUrl: commentUrl });

        const competencyIds = {
          "1": competencyIdText_(fiData[i][FI.MILESTONE_1_COMPETENCY_ID]),
          "2": competencyIdText_(fiData[i][FI.MILESTONE_2_COMPETENCY_ID]),
          "3": competencyIdText_(fiData[i][FI.MILESTONE_3_COMPETENCY_ID]),
          "4": competencyIdText_(fiData[i][FI.MILESTONE_4_COMPETENCY_ID]),
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
        // A tertiary competency the work showed counts as MET evidence;
        // one it didn't show records nothing (never required).
        if (alsoShown.length) {
          writeCompetencyEvidenceFromFlow2_(studentEmail, configId, studentFileId,
            { "1": alsoShown.join(", ") }, { "1": "Also shown (tertiary competency)" }, { "1": "MET" });
        }

        const recorded = recordEvaluationResult_(ledgerSs.getSheetByName(cfg.tabs.ledger), studentFileId, configId,
          parsed.complianceStatus, parsed.suggestedScore);
        _fiLogEvaluation_(ledgerSs, cfg, studentFileId, configId,
          parsed.complianceStatus === "APPROVED" ? "PASSED" : "NEEDS_REVISION", recorded,
          parsed.suggestedScore, prov);

        if (stagingSheet) {
          _fiMarkStagingComplete_(stagingSheet, stagingRowRef, studentFileId, configId);
        }

        fiSheet.getRange(rowNum, FI.READY_STATUS + 1).setValue("HARVESTED");
        _fiScrubEarlierParts_(fiSheet, rowNum, fiData[i][FI.PROMPT_TEXT]);
        harvested++;
      } catch (err) {
        Logger.log("[FlowInputBuilder] Harvest failed for row " + rowNum + ": " + err.message);
        fiSheet.getRange(rowNum, FI.READY_STATUS + 1).setValue("ERROR_HARVEST_FAILED");
        _fiScrubEarlierParts_(fiSheet, rowNum, fiData[i][FI.PROMPT_TEXT]);
        if (stagingSheet) _fiMarkStagingFailed_(stagingSheet, stagingRowRef, studentFileId, configId);
        _fiLogEvaluation_(ledgerSs, cfg, studentFileId, configId, "ERROR_HARVEST_FAILED", null, null, prov);
      }
    }

    if (harvested > 0) {
      SpreadsheetApp.flush();
      Logger.log("[FlowInputBuilder] Harvested " + harvested + " row(s).");
    }
    if (heldTwice) {
      // Many at once means something re-ran Flow 2 over delivered rows:
      // the overnight email says so (34c reads FI_HELD_TWICE_PROP).
      Logger.log("[FlowInputBuilder] Not delivered twice: " + heldTwice + " answer(s) for submissions that already had their result.");
      _fiNoteHeldTwice_(heldTwice, now);
    }
    if (setAside.rearmed || setAside.malformed) {
      SpreadsheetApp.flush();
      Logger.log("[FlowInputBuilder] Results not delivered: re-armed " + setAside.rearmed + ", gave up on " +
        setAside.malformed + " (" + FI_MALFORMED_STATUS + "). Why: " + Object.keys(setAside.reasons).map(function (r) {
          return r + " " + setAside.reasons[r];
        }).join("; ") + ".");
    }
    if (dupes.events.length) {
      Logger.log("[FlowInputBuilder] " + dupes.events.length + " answer(s) found in more than one row of a doc. " +
        "Flow 2's Update row step must find its row by StagingRowRef (column B); see showSetupStatus().");
    }
    if (answered) flow2NoteAnswered_();
  } catch (err) {
    Logger.log("[FlowInputBuilder] Critical harvest failure: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

// The Doc ID in a FlowInput row's StudentDocURL, or "" (Phase 4b: a form
// part's row names its snapshot doc there).
function _fiDocIdFromUrl_(url) {
  const m = /^https:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/.exec(String(url || "").trim());
  return m ? m[1] : "";
}

// recordEvaluationResult_ — the evaluation's result on the student's Ledger
// row, for the Teacher Dashboard: one more check, the latest result, when it
// first passed (kept even if a later check needs revision) and the latest
// suggested score. The result was only ever written into the doc before, so
// "checked but not passing" and "never checked" looked the same.
function recordEvaluationResult_(ledgerSheet, fileId, configId, complianceStatus, suggestedScore) {
  if (!ledgerSheet) return;
  const data = ledgerSheet.getRange(1, 1, Math.max(1, ledgerSheet.getLastRow()), LEDGER_COL_COUNT).getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][LEDGER.FILE_ID]).trim() !== fileId ||
        String(data[i][LEDGER.CONFIG_ID]).trim() !== configId) continue;
    _ensureEvaluationResultColumns_(ledgerSheet);
    const passed = complianceStatus === "APPROVED";
    const firstPassed = data[i][LEDGER.FIRST_PASSED_AT] || (passed ? new Date() : "");
    const checkCount = (Number(data[i][LEDGER.CHECK_COUNT]) || 0) + 1;
    ledgerSheet.getRange(i + 1, LEDGER.CHECK_COUNT + 1, 1, 4).setValues([[
      checkCount,
      passed ? "PASSED" : "NEEDS_REVISION",
      firstPassed,
      suggestedScore == null ? "" : suggestedScore,
    ]]);
    return { attempt: checkCount, submittedAt: data[i][LEDGER.SUBMISSION_TS] };
  }
  Logger.log("[FlowInputBuilder] No Ledger row for ConfigID " + configId + " to record its result on.");
  return null;
}

// _fiLogEvaluation_ — one EvaluationLog row per Flow 2 result (2026-10-23).
// The Ledger keeps only the latest result and a count, so how long each
// check took and how a student's attempts went were lost. Times, the
// attempt number, the result and the minutes from the latest submission to
// the result; never the student's writing or the feedback. Rows are only
// appended. A failed harvest (ERROR_*) is a row too, with no attempt
// number, since the Ledger's count only counts results the student got.
// recorded: recordEvaluationResult_'s { attempt, submittedAt }, or null, in
// which case the submission time is read from the Ledger. Never throws: by
// the time it runs the student's feedback is already written, and a failed
// log write mustn't mark that harvest failed.
// Since 2026-11-16 each row also says what made the result (_fiProvenance_):
// CodeVersion, PromptVersion, PromptHash, RunCheck, ModelReported. An older
// tab gets the new headers on its next write; its older rows stay blank there.
const EVAL_LOG_HEADERS = ["EvaluatedAt", "ConfigID", "StudentFileID", "Attempt", "Result",
  "SubmittedAt", "WaitMinutes", "SuggestedScore",
  "CodeVersion", "PromptVersion", "PromptHash", "RunCheck", "ModelReported", "ModelConfigured"];

function _fiLogEvaluation_(ledgerSs, cfg, fileId, configId, result, recorded, suggestedScore, prov) {
  try {
    _fiAppendEvaluationLog_(ledgerSs, cfg, fileId, configId, result, recorded, suggestedScore, prov);
  } catch (e) {
    Logger.log("[FlowInputBuilder] EvaluationLog write failed (" + result + "): " + e.message);
  }
}

function _fiAppendEvaluationLog_(ledgerSs, cfg, fileId, configId, result, recorded, suggestedScore, prov) {
  const name = (cfg.tabs && cfg.tabs.evaluationLog) || "EvaluationLog";
  let sheet = ledgerSs.getSheetByName(name);
  if (!sheet) {
    sheet = ledgerSs.insertSheet(name);
    sheet.appendRow(EVAL_LOG_HEADERS);
  } else if (sheet.getLastColumn() < EVAL_LOG_HEADERS.length) {
    sheet.getRange(1, 1, 1, EVAL_LOG_HEADERS.length).setValues([EVAL_LOG_HEADERS]);
  }
  const p = prov || {};
  let submittedAt = recorded ? recorded.submittedAt : "";
  if (!recorded) {
    const ledger = ledgerSs.getSheetByName(cfg.tabs.ledger);
    const data = ledger ? ledger.getDataRange().getValues() : [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][LEDGER.FILE_ID]).trim() === fileId && String(data[i][LEDGER.CONFIG_ID]).trim() === configId) {
        submittedAt = data[i][LEDGER.SUBMISSION_TS];
        break;
      }
    }
  }
  const now = new Date();
  const sentMs = sheetTimestampMs_(submittedAt);
  const wait = !submittedAt || isNaN(sentMs) || sentMs > now.getTime() ? "" : Math.round((now.getTime() - sentMs) / 60000);
  sheet.appendRow([now, configId, fileId, recorded ? recorded.attempt : "", result,
    isNaN(sentMs) || !submittedAt ? "" : new Date(sentMs), wait, suggestedScore == null ? "" : suggestedScore,
    p.codeVersion || "", p.promptVersion || "", p.promptHash || "", p.runCheck || "", p.model || "",
    p.modelConfigured || ""]);
}

// The answers left out as second deliveries, for the overnight email:
// { day: "yyyy-MM-dd", count } in a Script Property, the day's running count.
const FI_HELD_TWICE_PROP = "FI_HELD_TWICE";

function _fiNoteHeldTwice_(n, now) {
  try {
    const props = PropertiesService.getScriptProperties();
    const day = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
    let cur = {};
    try { cur = JSON.parse(props.getProperty(FI_HELD_TWICE_PROP) || "{}") || {}; } catch (e) { cur = {}; }
    const count = (cur.day === day ? Number(cur.count) || 0 : 0) + n;
    props.setProperty(FI_HELD_TWICE_PROP, JSON.stringify({ day: day, count: count }));
  } catch (e) {
    Logger.log("[FlowInputBuilder] Held-twice count not kept: " + e.message);
  }
}

// EvaluationLog's rows (no header), or [] when there is no tab.
function _fiEvaluationLogRows_(ledgerSs, cfg) {
  const sheet = ledgerSs.getSheetByName((cfg.tabs && cfg.tabs.evaluationLog) || "EvaluationLog");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, EVAL_LOG_HEADERS.length).getValues();
}

// Has this FlowInput row's submission already had a result applied? An
// EvaluationLog PASSED or NEEDS_REVISION row for the same doc and ConfigID
// at or after the FlowInput row was built.
function _fiAlreadyHarvested_(logRows, fiRow) {
  const fileId = String(fiRow[FI.STUDENT_FILE_ID]).trim();
  const configId = String(fiRow[FI.CONFIG_ID]).trim();
  const builtAt = sheetTimestampMs_(fiRow[FI.TIMESTAMP]);
  if (isNaN(builtAt)) return false;
  return logRows.some(function (r) {
    const result = String(r[4]).trim();
    return String(r[2]).trim() === fileId && String(r[1]).trim() === configId &&
      (result === "PASSED" || result === "NEEDS_REVISION") && sheetTimestampMs_(r[0]) >= builtAt;
  });
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

  // The row still in flight; else (a late answer, after the lane timed it
  // out, 06) the latest ERROR_TIMEOUT one, which 03 then finishes.
  const data = stagingSheet.getDataRange().getValues();
  let timedOut = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][STG_STUDENT_FILE_ID]).trim() !== studentFileId ||
        String(data[i][STG_CONFIG_ID]).trim() !== configId) continue;
    const status = String(data[i][STG_STATUS]).trim();
    if (status === "IN_PROCESS") {
      stagingSheet.getRange(i + 1, STG_STATUS + 1).setValue("COMPLETE");
      return;
    }
    if (status === "ERROR_TIMEOUT") timedOut = i;
  }
  if (timedOut !== -1) {
    stagingSheet.getRange(timedOut + 1, STG_STATUS + 1).setValue("COMPLETE");
    return;
  }
  Logger.log("[FlowInputBuilder] Could not find matching STAGING_PIPELINE row for FileID " +
             studentFileId + " ConfigID " + configId + " to mark COMPLETE.");
}

// A check whose result couldn't be used (2026-10-22, UX audit fix-first 4):
// its staging row is marked ERROR_EVALUATION, so 03 closes the submission,
// tells the teacher why and sets the doc's header, instead of the row
// sitting IN_PROCESS until the lane times it out as "didn't finish in time".
function _fiMarkStagingFailed_(stagingSheet, stagingRowRef, studentFileId, configId) {
  try {
    if (!isNaN(stagingRowRef) && stagingRowRef >= 2 &&
        String(stagingSheet.getRange(stagingRowRef, STG_STUDENT_FILE_ID + 1).getValue()).trim() === studentFileId &&
        String(stagingSheet.getRange(stagingRowRef, STG_CONFIG_ID + 1).getValue()).trim() === configId &&
        String(stagingSheet.getRange(stagingRowRef, STG_STATUS + 1).getValue()).trim() === "IN_PROCESS") {
      stagingSheet.getRange(stagingRowRef, STG_STATUS + 1).setValue("ERROR_EVALUATION");
      return;
    }
    const data = stagingSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][STG_STUDENT_FILE_ID]).trim() === studentFileId &&
          String(data[i][STG_CONFIG_ID]).trim() === configId &&
          String(data[i][STG_STATUS]).trim() === "IN_PROCESS") {
        stagingSheet.getRange(i + 1, STG_STATUS + 1).setValue("ERROR_EVALUATION");
        return;
      }
    }
  } catch (e) {
    Logger.log("[FlowInputBuilder] Could not mark the staging row failed: " + e.message);
  }
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
    .replace(/\[ALSO_SHOWN:\s*\[[^\]]*\]\]\s*/, "")
    .replace(/\[RUN_INFO:\s*\{[^\n]*?\}\]\s*/g, "")
    .replace(/\s+$/, "");
}

// A tiered Definition of Done (tools/cas-ccps/build-lesson-assignments.js,
// COMPETENCY_TIERS) has a PASSING RULE line and a TERTIARY COMPETENCIES
// section. Returns { tertiary: [ids] }, or null for an untiered one.
function _fiTiersFromDod_(dod) {
  const text = String(dod || "");
  if (text.indexOf("PASSING RULE: APPROVED when Milestone 1") === -1) return null;
  const at = text.indexOf("TERTIARY COMPETENCIES");
  const section = at === -1 ? "" : text.slice(at).split(/\n\s*\n/)[0];
  const tertiary = [];
  section.split("\n").forEach(l => {
    const m = /^- (\d{4}-\d+) /.exec(l.trim());
    if (m) tertiary.push(m[1]);
  });
  return { tertiary: tertiary };
}

// The tier pass rule: Milestone 1 (the primary) MET, the other three at
// least PARTIALLY_MET.
function _fiTierRulePasses_(outcomes) {
  const o = outcomes || {};
  const atLeastPartial = v => v === "MET" || v === "PARTIALLY_MET";
  return o["1"] === "MET" && atLeastPartial(o["2"]) && atLeastPartial(o["3"]) && atLeastPartial(o["4"]);
}

// ---------------------------------------------------------------------------
// Malformed results (2026-11-15). On 11-13 one answer evaluated another
// lesson's work, asked for revisions from that lesson, and carried an
// outcome the prompt never allows ("PARTI_MET"); the student got it. A
// result is now checked before anything reaches the student, and is
// malformed when:
//   - it has no parseable [MILESTONE_OUTCOMES: {...}] line (the last one
//     counts: the evaluator writes it at the end, Docket IV);
//   - a value is not MET, PARTIALLY_MET or NOT_MET;
//   - the line names a milestone the row doesn't have, or leaves out one it
//     has (the row's non-blank Milestone1-4; four keys are always accepted,
//     since the prompt asks for four);
//   - it has no compliance stamp, or both stamps;
//   - the stamp contradicts the passing rule computed from the outcomes:
//     a tiered Definition of Done's PASSING RULE (_fiTierRulePasses_), both
//     ways, since the prompt says APPROVED "exactly when that rule is met";
//     otherwise APPROVED needs every milestone MET, while a
//     REVISION_REQUIRED with every milestone MET stands (the prompt also
//     asks the whole Definition of Done be met, which the outcomes can't show).
// Until then the stamp decided, except that a tiered APPROVED the outcomes
// didn't support was recorded and delivered as REVISION_REQUIRED. Now
// neither wins: the result is not used.
// A malformed result is never delivered (no comment, doc write, evidence,
// Ledger result or log row). The row is re-armed once, on #425's pattern
// (_fiStaleInputs_): output and ReadyStatus cleared, the builder sets READY
// on its next run, ReArms set to FI_MAX_REARMS (so the stale re-arm won't
// restart it again) and ArmedAt to now. Malformed again, or no re-arms
// left, or not a submission's row (the fixture): ERROR_MALFORMED_OUTPUT,
// which closes like the other errors (the staging row ERROR_EVALUATION, so
// 03 tells the teacher and the student's card reads "Couldn't be checked").
// ---------------------------------------------------------------------------
const FI_MALFORMED_STATUS = "ERROR_MALFORMED_OUTPUT";
const FI_OUTCOME_VALUES = ["MET", "PARTIALLY_MET", "NOT_MET"];
const FI_OUTCOMES_RE = /\[MILESTONE_OUTCOMES:\s*(\{[\s\S]*?\})\]/;

// { ok: true, outcomes: {"1".."4": value|null}, compliance } or
// { ok: false, reason } (a short phrase, no row content).
function _fiCheckResultShape_(fullText, fiRow) {
  const text = String(fullText || "");
  const bad = function (reason) { return { ok: false, reason: reason }; };
  const all = text.match(new RegExp(FI_OUTCOMES_RE.source, "g"));
  if (!all) return bad("no outcomes line");
  let parsed;
  try { parsed = JSON.parse(FI_OUTCOMES_RE.exec(all[all.length - 1])[1]); } catch (e) { return bad("outcomes line not JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return bad("outcomes line not JSON");
  const keys = Object.keys(parsed);
  const named = ["1", "2", "3", "4"].filter(function (n) {
    return String(fiRow[FI["MILESTONE_" + n]] === undefined ? "" : fiRow[FI["MILESTONE_" + n]]).trim() !== "";
  });
  if (keys.some(function (k) { return ["1", "2", "3", "4"].indexOf(k) === -1; }) ||
      named.some(function (n) { return keys.indexOf(n) === -1; }) ||
      (keys.length !== named.length && keys.length !== 4)) {
    return bad("milestone count does not match the row");
  }
  if (keys.some(function (k) { return FI_OUTCOME_VALUES.indexOf(parsed[k]) === -1; })) return bad("outcome value not allowed");
  const approved = text.indexOf("[SYSTEM: APPROVED]") !== -1;
  const revise = text.indexOf("[SYSTEM: REVISION_REQUIRED]") !== -1;
  if (!approved && !revise) return bad("no compliance stamp");
  if (approved && revise) return bad("both compliance stamps");
  const outcomes = { "1": null, "2": null, "3": null, "4": null };
  keys.forEach(function (k) { outcomes[k] = parsed[k]; });
  const tiered = !!_fiTiersFromDod_(String(fiRow[FI.DEFINITION_OF_DONE] || ""));
  const scored = named.length ? named : keys;
  const passes = tiered ? _fiTierRulePasses_(outcomes)
    : scored.every(function (k) { return outcomes[k] === "MET"; });
  if (tiered ? approved !== passes : approved && !passes) return bad("stamp contradicts the passing rule");
  return { ok: true, outcomes: outcomes, compliance: approved ? "APPROVED" : "REVISION_REQUIRED" };
}

// Sets a result aside without delivering it: re-armed ("REARMED") while the
// row has its one re-arm, else FI_MALFORMED_STATUS ("MALFORMED"). The
// caller closes the staging row and logs a terminal one.
function _fiSetAsideMalformed_(fiSheet, rowNum, row, now) {
  if (_fiRearmable_(row) && (Number(row[FI.REARMS]) || 0) < FI_MAX_REARMS) {
    fiSheet.getRange(rowNum, FI.READY_STATUS + 1, 1, 2).setValues([["", ""]]);
    fiSheet.getRange(rowNum, FI.REARMS + 1, 1, 2).setValues([[FI_MAX_REARMS, now]]);
    return "REARMED";
  }
  fiSheet.getRange(rowNum, FI.READY_STATUS + 1).setValue(FI_MALFORMED_STATUS);
  _fiScrubEarlierParts_(fiSheet, rowNum, row[FI.PROMPT_TEXT]);
  return "MALFORMED";
}

// ---------------------------------------------------------------------------
// Duplicate writes (2026-11-15). Two FlowInput rows of one doc, a submission
// and its resubmission an hour later, held the same answer, and it answered
// the later one's reflection: Studio's Update row step had found its row by
// a column that isn't unique to a submission (StudentFileID or ConfigID),
// so one answer went into every row of the doc. Its row must be found by
// StagingRowRef (column B).
// Rows of one StudentFileID whose outputs hash the same (SHA-256; the text
// is never kept) are a pair, earlier and newer by Timestamp, then row order.
// Each pair with an EVALUATED row is one event, kept in FI_DUP_TAB as
// dates only (when found, when each row was built, the earlier row's
// status). The newer row is delivered: the answer is its own. The earlier
// row, if not yet harvested, is set aside like a malformed result (re-armed
// once), never delivered.
// ---------------------------------------------------------------------------
const FI_DUP_TAB = "Flow2Duplicates";
const FI_DUP_HEADERS = ["DetectedAt", "EarlierBuiltAt", "NewerBuiltAt", "EarlierStatus"];
const FI_DUP_WINDOW_DAYS = 7; // how long a found duplicate keeps the warning up

// { copies: { rowNum: true } (EVALUATED rows holding a later row's answer),
//   events: [{ earlierAt, newerAt, earlierStatus }] }. Reads only.
function _fiDuplicateWrites_(fiData) {
  const out = { copies: {}, events: [] };
  const byDoc = {};
  const live = {}; // docs with a row to harvest: only those are hashed
  for (let i = 1; i < fiData.length; i++) {
    const text = String(fiData[i][FI.GEMINI_FULL_OUTPUT] || "").trim();
    const doc = String(fiData[i][FI.STUDENT_FILE_ID] || "").trim();
    if (!text || !doc) continue;
    (byDoc[doc] = byDoc[doc] || []).push(i);
    if (String(fiData[i][FI.READY_STATUS]).trim() === "EVALUATED") live[doc] = true;
  }
  Object.keys(byDoc).forEach(function (doc) {
    const rows = byDoc[doc];
    if (rows.length < 2 || !live[doc]) return;
    const byHash = {}; // hash -> the rows holding it, oldest first
    rows.map(function (i) {
      return { i: i, at: sheetTimestampMs_(fiData[i][FI.TIMESTAMP]),
        hash: _fiOutputHash_(String(fiData[i][FI.GEMINI_FULL_OUTPUT]).trim()) };
    }).sort(function (a, b) {
      const at = (isNaN(a.at) ? 0 : a.at) - (isNaN(b.at) ? 0 : b.at);
      return at || a.i - b.i;
    }).forEach(function (r) { (byHash[r.hash] = byHash[r.hash] || []).push(r.i); });
    Object.keys(byHash).forEach(function (h) {
      const held = byHash[h];
      const newest = held[held.length - 1];
      const newerStatus = String(fiData[newest][FI.READY_STATUS]).trim();
      held.slice(0, -1).forEach(function (i) {
        const earlierStatus = String(fiData[i][FI.READY_STATUS]).trim();
        if (earlierStatus !== "EVALUATED" && newerStatus !== "EVALUATED") return; // found before
        if (earlierStatus === "EVALUATED") out.copies[i + 1] = true;
        out.events.push({ earlierAt: fiData[i][FI.TIMESTAMP], newerAt: fiData[newest][FI.TIMESTAMP],
          earlierStatus: earlierStatus });
      });
    });
  });
  return out;
}

function _fiOutputHash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)
    .map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, "0"); }).join("");
}

// Appends the events to FI_DUP_TAB (made on the first). Never throws: the
// harvest goes on either way.
function _fiRecordDuplicateWrites_(ledgerSs, events, now) {
  try {
    let sheet = ledgerSs.getSheetByName(FI_DUP_TAB);
    if (!sheet) {
      sheet = ledgerSs.insertSheet(FI_DUP_TAB);
      sheet.appendRow(FI_DUP_HEADERS);
    }
    events.forEach(function (e) { sheet.appendRow([now, e.earlierAt, e.newerAt, e.earlierStatus]); });
  } catch (e) {
    Logger.log("[FlowInputBuilder] Could not record a duplicate write: " + e.message);
  }
}

// What FI_DUP_TAB holds: { total, recent (within FI_DUP_WINDOW_DAYS),
// lastAt (ms, or NaN) }. Counts and dates only.
function flow2DuplicateWrites_(ss, now) {
  const out = { total: 0, recent: 0, lastAt: NaN };
  const sheet = ss.getSheetByName(FI_DUP_TAB);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const t = (now ? new Date(now) : new Date()).getTime();
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
    const at = sheetTimestampMs_(r[0]);
    out.total++;
    if (!isNaN(at) && t - at <= FI_DUP_WINDOW_DAYS * 86400000) out.recent++;
    if (!isNaN(at) && !(out.lastAt >= at)) out.lastAt = at;
  });
  return out;
}

// The warning line for showSetupStatus (35), the overnight check (34c) and
// the CAS signal (34b), or "" when none was found in FI_DUP_WINDOW_DAYS.
function flow2DuplicateWriteLine_(ss, now) {
  const d = flow2DuplicateWrites_(ss, now);
  if (!d.recent) return "";
  return "Flow 2 wrote one answer into more than one row of a doc " + d.recent + " time(s) in the last " +
    FI_DUP_WINDOW_DAYS + " days (last " + Utilities.formatDate(new Date(d.lastAt), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") +
    "). Likely cause: Flow 2's Update row step finds its row by a column that isn't unique (StudentFileID or " +
    "ConfigID). In Studio, set it to match on StagingRowRef (column B). The copies were held back; checkFlow2Binding() says more.";
}

// The overnight email's line for answers left out as second deliveries
// (2026-11-17): today's or yesterday's count, else "".
function flow2HeldTwiceLine_(now) {
  let cur = {};
  try { cur = JSON.parse(PropertiesService.getScriptProperties().getProperty(FI_HELD_TWICE_PROP) || "{}") || {}; } catch (e) { cur = {}; }
  const n = Number(cur.count) || 0;
  if (!n || !cur.day) return "";
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  const yesterday = Utilities.formatDate(new Date(now.getTime() - 24 * 60 * 60 * 1000), tz, "yyyy-MM-dd");
  if (cur.day !== today && cur.day !== yesterday) return "";
  return "Flow 2 answered " + n + " submission(s) again on " + cur.day + " after their results were delivered. " +
    "None was delivered twice. Many at once usually means a Studio test run re-ran Flow 2 over rows already done.";
}

// The tertiary competencies Flow 2 says the work showed: its ALSO_SHOWN line,
// kept only where the ID is one of this assignment's tertiaries.
function _fiAlsoShown_(fullText, tertiary) {
  // The last one: the evaluator writes its line at the end, and an earlier
  // one can only be the student's text echoed back (Docket IV).
  const all = String(fullText || "").match(/\[ALSO_SHOWN:\s*(\[[^\]]*\])\]/g);
  const m = all ? /\[ALSO_SHOWN:\s*(\[[^\]]*\])\]/.exec(all[all.length - 1]) : null;
  if (!m) return [];
  let ids;
  try { ids = JSON.parse(m[1]); } catch (e) { return []; }
  if (!Array.isArray(ids)) return [];
  const allowed = tertiary || [];
  return ids.map(id => String(id).trim()).filter((id, k, all) => allowed.indexOf(id) !== -1 && all.indexOf(id) === k);
}

// Builds the same feedback block shape
// cas-ccps/studio-steps/CommitStudentEvaluationStep.gs's own
// formatFeedbackBlock_() produces — real U+2500 box-drawing markers
// (03_QueueBridge.js's appendNextSteps_() only matches this exact
// character, confirmed by that file's own header comment), so the
// already-deployed backPropagateCompletions()/appendNextSteps_() finds
// "── END EVALUATION ──" correctly once it runs.
// Where an evaluation lands in the student's doc. The doc's feedback zone is
// the stretch between "── FEEDBACK ──" and "── END FEEDBACK ──" near the top
// (02's intake builds it), and 03 removes its "[No feedback yet" placeholder
// once an evaluation arrives. This used to appendParagraph() at the very end
// of the document instead: below the assignment, the student's response and
// the hidden system block, in that block's tiny font, while the zone the
// student actually reads was left empty (2026-10-16: "the feedback never
// landed"). Inserting just before the zone's end line puts it where the
// student looks, in the zone's own formatting, and newer evaluations stack
// below older ones, the same oldest-first order the end-of-doc appends had.
// No end line (an older or hand-edited doc) falls back to appending.
// 03's next-steps text must never quote the response marker line: this block
// now sits above the real one, and every extractor takes the first match.
const FI_FEEDBACK_END_MARKER = "── END FEEDBACK ──";

function _fiInsertEvaluation_(body, block) {
  const n = body.getNumChildren();
  for (let i = 0; i < n; i++) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    const marker = child.asParagraph();
    if (marker.getText().trim() !== FI_FEEDBACK_END_MARKER) continue;
    const inserted = body.insertParagraph(i, block);
    inserted.setAttributes(marker.getAttributes());
    return inserted;
  }
  Logger.log("[FlowInputBuilder] No '" + FI_FEEDBACK_END_MARKER +
             "' line in the doc; appended the evaluation at the end.");
  return body.appendParagraph(block);
}

function _fiFormatFeedbackBlock_(studentFacingReport, complianceStatus) {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const resultLine = complianceStatus === "APPROVED" ? FI_RESULT_PASSED : FI_RESULT_REVISE;

  // Each block carries its own next steps (03_QueueBridge.js's
  // buildNextStepsText_, same project). 03 adds a next-steps block only to a
  // doc that has none, so on a resubmission the first evaluation's steps
  // used to stay put while new results arrived below them.
  return "\n── EVALUATION " + timestamp + " ──\n" +
    resultLine + "\n\n" +
    _fiPassedRevisionsHeading_(studentFacingReport, complianceStatus) + "\n" +
    buildNextStepsText_(complianceStatus) +
    "\n── END EVALUATION ──\n";
}

// The same feedback as a comment on the doc (FEEDBACK_AS_COMMENT, 00): the
// result line, the report and the next steps, without the box-drawing
// EVALUATION markers, which only exist for code that searches the doc.
// It reads in the Comments panel (about 300px wide), so it has no divider
// lines or hard-wrapped lines, uses the dashboards' words, and says that
// resolving the comment doesn't delete it (2026-10-22).
function _fiFormatFeedbackComment_(studentFacingReport, complianceStatus) {
  const when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d, h:mm a");
  const resultLine = complianceStatus === "APPROVED" ? FI_RESULT_PASSED : FI_RESULT_REVISE;
  return "Feedback, " + when + "\n" + resultLine + "\n\n" +
    _fiPassedRevisionsHeading_(_fiCleanCommentReport_(studentFacingReport), complianceStatus) + "\n\n" +
    _fiCommentNextSteps_(complianceStatus);
}

// The report as a student reads it in a comment (2026-11-16, UX audit item
// 1): the result line above already says Passed or Revise, and the Ledger
// keeps the stamp and the suggested score, so the comment drops the
// [SYSTEM: …] and [SUGGESTED_SCORE: …] lines (the prompt says a student is
// never told a score), the headings of the machine sections ("4. COMPLIANCE
// STAMP", "5b. ALSO-SHOWN LINE"…), and the numbers on the section headings,
// which the model often gets wrong ("1. REQUIRED REVISIONS" after "2.").
// Feedback written into the doc keeps them: 04 reads the score line there.
const FI_COMMENT_SECTIONS_RE = /^(\s*)\d+[a-z]?\.\s*(OVERALL ASSESSMENT|MILESTONE BREAKDOWN|REQUIRED REVISIONS|YOUR PROCESS|ALSO SHOWN)\b/i;
const FI_MACHINE_HEADING_RE = /^\s*(\d+[a-z]?\.\s*)?(COMPLIANCE STAMP|SUGGESTED SCORE|ALSO-SHOWN LINE|RUN LINE|MACHINE-READABLE OUTCOME LINE)\s*:?\s*$/i;
const FI_MACHINE_LINE_RE = /^\s*\[(SYSTEM|SUGGESTED_SCORE)\s*:[^\]]*\]\s*$/i;

function _fiCleanCommentReport_(report) {
  return String(report || "").split("\n")
    .filter(function (l) { return !FI_MACHINE_LINE_RE.test(l) && !FI_MACHINE_HEADING_RE.test(l); })
    .map(function (l) { return l.replace(FI_COMMENT_SECTIONS_RE, "$1$2"); })
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// A Passed result's revisions are optional (2026-11-17, UX audit item 4, the
// operator's yes): "REQUIRED REVISIONS" told a student who passed that they
// had to change something. On a pass the heading reads "TO MAKE IT
// STRONGER (optional)", with or without its section number, in the doc and
// in the comment. A Revise result keeps its heading. Flow 2's stored
// output (and 39b's reading of it) is unchanged: only what is delivered.
const FI_REQUIRED_REVISIONS_RE = /^(\s*(?:\d+[a-z]?\.\s*)?)REQUIRED REVISIONS\b:?/gim;

function _fiPassedRevisionsHeading_(report, complianceStatus) {
  if (complianceStatus !== "APPROVED") return report;
  return String(report || "").replace(FI_REQUIRED_REVISIONS_RE, "$1TO MAKE IT STRONGER (optional)");
}

// The result line, in the doc and in the comment: the dashboards' words.
const FI_RESULT_PASSED = "Result: ✅ Passed. Your work meets the standard.";
const FI_RESULT_REVISE = "Result: ✏️ Revise, then submit again.";

function _fiCommentNextSteps_(complianceStatus) {
  const keep = "Resolving this comment only hides it. You can find it again with the Comments button.";
  // How to turn work in depends on the turn-in code switch (03's
  // nextStepsTurnInMode_, same project; 2026-11-15).
  const mode = nextStepsTurnInMode_();
  const steps = NEXT_STEPS_TURN_IN_[mode];
  if (complianceStatus === "APPROVED") {
    return "What to do next\n" + steps.comment +
      (mode === "CODE"
        ? "\nWant to make it stronger? (optional) Revise it, then press Submit for Feedback on your dashboard again (the link is at the top of this document). Your turn-in code stays the same."
        : "• Want to make it stronger? Revise it, then press Submit for Feedback on your dashboard again (the link is at the top of this document)." +
          (mode === "LINK" ? "" : " Your turn-in code stays the same.")) + "\n\n" +
      keep;
  }
  return "What to do next\n" +
    "1. Read the revisions listed above.\n" +
    "2. Change your work under the \u201cYour response\u201d heading.\n" +
    "3. Press Submit for Feedback on your dashboard (the link is at the top of this document).\n" +
    "You can check as many times as you need. There's no penalty for revising.\n" +
    (mode === "LINK" ? "" : "\n" + steps.reviseComment) + "\n" +
    keep;
}

// A work file's type ("doc", "form", "slides", "sheet") from its Ledger row's
// AdminFileURL; "" when no row names it. The Ledger is read once per run,
// into `cache`, and only when a part with a feedback page is harvested.
function _fiWorkTypeOf_(ledgerSs, cfg, fileId, cache) {
  if (!cache.__read) {
    cache.__read = true;
    const sheet = ledgerSs.getSheetByName(cfg.tabs.ledger);
    const data = sheet && sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, LEDGER_COL_COUNT).getValues() : [];
    data.forEach(function (r) {
      const id = String(r[LEDGER.FILE_ID] || "").trim();
      if (id) cache[id] = workFileTypeOfUrl_(r[LEDGER.ADMIN_FILE_URL]);
    });
  }
  return cache[String(fileId || "").trim()] || "";
}

// Posts the feedback as an unanchored comment through the Drive advanced
// service (v3, already in this project's manifest; the drive scope covers
// it). The comment's ID when it posted (2026-11-17: the feedback line links
// to it, 63), "" when it didn't. On a failure the harvest falls back to the
// doc, so the student still gets feedback, and the log says why.
// Posts one feedback comment where the harvest puts it (2026-11-17): on a
// Slides part's deck when the work is a deck, else (or if the deck won't
// take it) on the feedback doc. Returns { id, onSlides, url }: id is the
// comment's ID, "posted" when Drive returned none, "" when neither took it;
// url is the link that opens it (63), "" without an ID. Shared by the
// harvest and repostMissingFeedback, so both link the header the same way.
function _fiPostFeedbackComment_(ledgerSs, cfg, feedbackDocId, workFileId, text, workTypes) {
  let id = "", onSlides = false;
  if (workFileId && workFileId !== feedbackDocId && _fiWorkTypeOf_(ledgerSs, cfg, workFileId, workTypes) === "slides") {
    id = _fiPostEvaluationComment_(workFileId, text);
    onSlides = !!id;
  }
  if (!id) id = _fiPostEvaluationComment_(feedbackDocId, text);
  const url = id && id !== "posted"
    ? (onSlides ? feedbackCommentUrl_(workFileId, id, "slides") : feedbackCommentUrl_(feedbackDocId, id))
    : "";
  return { id: id, onSlides: onSlides, url: url };
}

function _fiPostEvaluationComment_(fileId, text) {
  try {
    const c = Drive.Comments.create({ content: text }, fileId, { fields: "id" });
    return String((c && c.id) || "posted");
  } catch (e) {
    Logger.log("[FlowInputBuilder] Could not post the feedback comment (" + e.message +
               "); put it in the doc instead.");
    return "";
  }
}

// ---------------------------------------------------------------------------
// installFlowInputTriggers — one-time admin action, same pattern as this
// project's other installX() functions (installStudentAggregatorTrigger_,
// installSCRTrigger_, etc.) — checks for an existing trigger by handler
// name before adding a second one.
// -----------------------------------------------------------------------
// checkFlow2Liveness
//
// Has Flow 2 EVER written a result? Added because gas-lint's Check I found
// this missing: Flows 3/4/5 got checkWarmUpFlowLiveness(), leader-hub got
// checkAiFlowFixtures(), kos-personal got checkStudioFlowLiveness(), and
// Flow 2 — the first flow redesigned around the wall — never got one. The
// declaration in tools/gas-lint/flow-map.json is what surfaced the omission.
//
// Flow 2's shape makes this cheaper than the others: because Studio writes
// INTO the trigger row rather than appending, a row that has been answered
// is a row whose GeminiFullOutput is non-empty. No separate return tab to
// correlate.
//
// Read-only. Reports rows waiting, rows answered, and — the useful part —
// says plainly when rows have been READY longer than the harvest interval
// with nothing ever written, which is the state that means "no Flow is
// listening" rather than "the Flow is slow".
// -----------------------------------------------------------------------
function checkFlow2Liveness() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName((cfg.tabs && cfg.tabs.flowInput) || "FlowInput");
  const report = { ready: 0, answered: 0, everAnswered: false, oldestReadyMins: 0 };

  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log("[FlowInput] checkFlow2Liveness: no FlowInput rows — nothing to conclude. " +
               "installFlow2Fixture() gives Flow 2 something to match.");
    return report;
  }

  const nowMs = new Date().getTime();
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, FI.PROMPT_TEXT + 1).getValues();
  data.forEach(function (row) {
    const answered = String(row[FI.GEMINI_FULL_OUTPUT] || "").trim() !== "";
    if (answered) { report.answered++; report.everAnswered = true; return; }
    if (String(row[FI.READY_STATUS] || "").trim() !== "READY") return;
    report.ready++;
    const ageMins = Math.round((nowMs - new Date(row[FI.TIMESTAMP]).getTime()) / 60000);
    if (ageMins > report.oldestReadyMins) report.oldestReadyMins = ageMins;
  });

  Logger.log("[FlowInput] checkFlow2Liveness: " + report.ready + " row(s) READY and unanswered, " +
             report.answered + " answered, oldest wait " + report.oldestReadyMins + " min");
  if (!report.everAnswered && report.ready > 0) {
    Logger.log("[FlowInput] NOTHING has ever been written to GeminiFullOutput, but " +
               report.ready + " row(s) are READY. Either Flow 2 is not built, its trigger is " +
               "not matching ReadyStatus = READY, or its output step is bound to a different " +
               "column — checkFlow2Binding() separates that last one. A green \"Run " +
               "Completed\" in Studio rules out none of the three.");
  } else if (report.ready > 0) {
    Logger.log("[FlowInput] Flow 2 HAS answered before, so a row waiting now is more likely a " +
               "slow or erroring run than a missing flow.");
  }
  return report;
}

// ---------------------------------------------------------------------------
// FIX (found during live redeployment): ScriptApp's time-based trigger API
// only accepts everyMinutes(1|5|10|15|30) — confirmed directly, a real
// account throws "The value you passed to everyMinutes was invalid" on
// everyMinutes(2). The harvest side was specced at "every 2 minutes" (see
// this file's own header and 03_QueueBridge.js's identical, equally
// unachievable backPropagateCompletions comment) but never actually
// installable. Moved to the nearest legal value, 5 — keeping harvest
// slower than build's 1-minute cadence, which was the actual intent, rather
// than collapsing the two to the same interval. installFlowInputTriggers()
// itself was never reached past this line on affected accounts, so
// buildFlowInputRows could end up installed with harvestFlowInputResults
// silently missing; the indexOf guards below make re-running this function
// safe (it won't duplicate buildFlowInputRows) once the fix is pushed.
//
// Since 2026-11-20 (meta/AUDIT_STRUCTURE_2026-11-20.md, 1.1) through 64's
// lcInstallJob_, like every other frequent job: into the Ledger cycle when
// it is installed, its own trigger only when it isn't. Before, a re-run
// created its own every-minute trigger, and the cycle leaves a job with its
// own trigger to it: no gates, no quiet hours, its own share of the daily
// trigger quota.
function installFlowInputTriggers() {
  return ["buildFlowInputRows", "harvestFlowInputResults"].map(function (fn) { return lcInstallJob_(fn); });
}

// ---------------------------------------------------------------------------
// removeFeedbackCommentsPosted — undo a burst of feedback comments (added
// 2026-11-15, after a Studio Test run re-graded every FlowInput row and the
// harvest posted the new feedback on students' docs). For each doc FlowInput
// names (fixture rows left out), it finds the comments this script's account
// posted between `from` and `to` whose text starts "Feedback, " (only
// _fiFormatFeedbackComment_ writes that), and lists them. Nothing is deleted
// unless `doDelete` is true. Run it from the editor, e.g.
//   removeFeedbackCommentsPosted("2026-11-15T14:34:00-05:00", "2026-11-15T15:05:00-05:00")
//   removeFeedbackCommentsPosted("2026-11-15T14:34:00-05:00", "2026-11-15T15:05:00-05:00", true)
// It logs counts by FlowInput row, never a name, email or file ID. A run that
// reaches its time budget says so; run it again to finish (deleted comments
// are gone, so it picks up where it stopped).
// ---------------------------------------------------------------------------
function removeFeedbackCommentsPosted(from, to, doDelete) {
  const fromMs = Date.parse(from), toMs = Date.parse(to);
  if (isNaN(fromMs) || isNaN(toMs) || toMs <= fromMs) {
    throw new Error("removeFeedbackCommentsPosted: give a start and end time, e.g. " +
                    "\"2026-11-15T14:34:00-05:00\", \"2026-11-15T15:05:00-05:00\".");
  }
  if (toMs - fromMs > 24 * 3600 * 1000) {
    throw new Error("removeFeedbackCommentsPosted: the window is over a day long; narrow it.");
  }
  const started = Date.now();
  const budgetMs = 4.5 * 60 * 1000;
  const cfg = getConfig_();
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId)
    .getSheetByName((cfg.tabs && cfg.tabs.flowInput) || FI_TAB_NAME);
  const out = { docs: 0, found: 0, deleted: 0, failed: 0, unreadable: 0, finished: true, rows: [] };
  if (!sheet || sheet.getLastRow() < 2) { Logger.log("[FeedbackCleanup] FlowInput is empty."); return out; }

  const data = sheet.getDataRange().getValues();
  const seen = {};
  const docs = [];
  for (let i = 1; i < data.length; i++) {
    if (_fxIsFlow2FixtureRow_(data[i])) continue;
    const docId = _fiDocIdFromUrl_(data[i][FI.STUDENT_DOC_URL]) || String(data[i][FI.STUDENT_FILE_ID] || "").trim();
    if (!docId || seen[docId]) continue;
    seen[docId] = true;
    docs.push({ docId: docId, row: i + 1 });
  }

  for (let d = 0; d < docs.length; d++) {
    if (Date.now() - started > budgetMs) { out.finished = false; break; }
    out.docs++;
    let matches;
    try {
      matches = _fiFeedbackCommentsIn_(docs[d].docId, fromMs, toMs);
    } catch (e) {
      out.unreadable++;
      Logger.log("[FeedbackCleanup] Row " + docs[d].row + ": couldn't read its comments (" + e.message + ").");
      continue;
    }
    if (!matches.length) continue;
    out.found += matches.length;
    let removed = 0;
    if (doDelete === true) {
      matches.forEach(function (c) {
        try { Drive.Comments.remove(docs[d].docId, c.id); removed++; }
        catch (e) { out.failed++; Logger.log("[FeedbackCleanup] Row " + docs[d].row + ": couldn't delete a comment (" + e.message + ")."); }
      });
      out.deleted += removed;
    }
    out.rows.push({ row: docs[d].row, found: matches.length, deleted: removed });
    Logger.log("[FeedbackCleanup] Row " + docs[d].row + ": " + matches.length + " feedback comment(s) in the window" +
               (doDelete === true ? ", deleted " + removed + "." : "."));
  }

  Logger.log("[FeedbackCleanup] " + (doDelete === true ? "DELETE" : "DRY RUN (nothing deleted)") + ": " +
             out.docs + " of " + docs.length + " doc(s) checked, " + out.found + " feedback comment(s) in the window" +
             (doDelete === true ? ", " + out.deleted + " deleted, " + out.failed + " failed" : "") +
             (out.unreadable ? ", " + out.unreadable + " doc(s) unreadable" : "") + "." +
             (out.finished ? "" : " Stopped at the time budget; run it again to finish.") +
             (doDelete === true ? "" : " To delete them, run it again with true as the third argument."));
  return out;
}

// ---------------------------------------------------------------------------
// repostMissingFeedback — give back feedback the cleanup above took away
// (added 2026-11-15). The re-grade answered some submissions Studio had
// never answered (still READY for days), so the comment the cleanup deleted
// was their only feedback. For each doc FlowInput names (fixture rows left
// out), it takes the doc's newest row; when that row is HARVESTED and the
// doc has no "Feedback, " comment from this account made after the row was
// built, it lists the row, and with `doPost` true posts the row's result as
// the harvest would (_fiFormatFeedbackComment_ on the student-facing text,
// the stamp read by _fiCheckResultShape_). A doc whose newest row already
// has feedback is left alone, so an older row superseded by a resubmission
// is never posted. Rows whose assignment keeps feedback in the doc, and
// malformed results, are counted, not posted. `skipRefs`: StagingRowRefs to
// leave out (e.g. a result to check by hand first). Run it from the editor:
//   repostMissingFeedback()                 // dry run: lists, posts nothing
//   repostMissingFeedback(true, [67, 75])   // posts, leaving rows 67 and 75
// It logs FlowInput row and StagingRowRef only. Posting is safe to repeat:
// a posted row has its comment and is not posted again.
// ---------------------------------------------------------------------------
function repostMissingFeedback(doPost, skipRefs) {
  const skip = {};
  (skipRefs || []).forEach(function (r) { skip[String(r).trim()] = true; });
  const started = Date.now();
  const budgetMs = 4.5 * 60 * 1000;
  const cfg = getConfig_();
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId)
    .getSheetByName((cfg.tabs && cfg.tabs.flowInput) || FI_TAB_NAME);
  const out = { docs: 0, hasFeedback: 0, notHarvested: 0, inDoc: 0, skipped: 0, malformed: 0,
    missing: 0, posted: 0, failed: 0, unreadable: 0, finished: true, rows: [] };
  if (!sheet || sheet.getLastRow() < 2) { Logger.log("[FeedbackRepost] FlowInput is empty."); return out; }

  // The newest row of each doc, by Timestamp, then row order.
  const data = sheet.getDataRange().getValues();
  const newest = {};
  for (let i = 1; i < data.length; i++) {
    if (_fxIsFlow2FixtureRow_(data[i])) continue;
    const docId = _fiDocIdFromUrl_(data[i][FI.STUDENT_DOC_URL]) || String(data[i][FI.STUDENT_FILE_ID] || "").trim();
    if (!docId) continue;
    const at = sheetTimestampMs_(data[i][FI.TIMESTAMP]);
    const cur = newest[docId];
    if (!cur || (isNaN(at) ? 0 : at) >= (isNaN(cur.at) ? 0 : cur.at)) newest[docId] = { i: i, at: at };
  }
  const asComment = feedbackAsCommentChecker_();
  const docIds = Object.keys(newest);
  const workTypes = {};
  const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);

  for (let d = 0; d < docIds.length; d++) {
    if (Date.now() - started > budgetMs) { out.finished = false; break; }
    out.docs++;
    const docId = docIds[d];
    const i = newest[docId].i, row = data[i], rowNum = i + 1;
    const ref = String(row[FI.STAGING_ROW_REF] || "").trim();
    const label = "Row " + rowNum + " (StagingRowRef " + ref + ")";
    if (String(row[FI.READY_STATUS] || "").trim() !== "HARVESTED") { out.notHarvested++; continue; }
    if (!asComment(row[FI.CONFIG_ID])) { out.inDoc++; continue; }
    // A Slides part's feedback is on its deck (2026-11-17); older feedback
    // may still be on its feedback page, so both are looked at.
    const workId = String(row[FI.STUDENT_FILE_ID] || "").trim();
    const deck = workId && workId !== docId && _fiWorkTypeOf_(ledgerSs, cfg, workId, workTypes) === "slides" ? workId : "";
    let since;
    try {
      const builtMs = isNaN(newest[docId].at) ? 0 : newest[docId].at;
      since = _fiFeedbackCommentsIn_(docId, builtMs, Date.now() + 60000);
      if (deck && !since.length) since = _fiFeedbackCommentsIn_(deck, builtMs, Date.now() + 60000);
    } catch (e) {
      out.unreadable++;
      Logger.log("[FeedbackRepost] " + label + ": couldn't read its comments (" + e.message + ").");
      continue;
    }
    if (since.length) { out.hasFeedback++; continue; }
    if (skip[ref]) { out.skipped++; Logger.log("[FeedbackRepost] " + label + ": no feedback, left out as asked."); continue; }
    const output = String(row[FI.GEMINI_FULL_OUTPUT] || "").trim();
    const shape = output ? _fiCheckResultShape_(output, row) : { ok: false, reason: "no output" };
    if (!shape.ok) {
      out.malformed++;
      Logger.log("[FeedbackRepost] " + label + ": no feedback, but its result is malformed (" + shape.reason + "); not posted.");
      continue;
    }
    out.missing++;
    const result = shape.compliance === "APPROVED" ? "Passed" : "Revise";
    let posted = false;
    if (doPost === true) {
      const text = _fiFormatFeedbackComment_(_fiStripMilestoneOutcomesLine_(output), shape.compliance);
      const c = _fiPostFeedbackComment_(ledgerSs, cfg, docId, workId, text, workTypes);
      posted = !!c.id;
      if (posted) {
        out.posted++;
        // The header's line, as the harvest sets it (2026-11-18): its link
        // opens the new comment, so View feedback finds a reposted comment
        // too, not only the Comments button.
        setDocFeedbackStatus_(docId, shape.compliance === "APPROVED" ? "PASSED" : "REVISE",
          { inComments: true, onSlides: c.onSlides, commentUrl: c.url });
      } else out.failed++;
    }
    out.rows.push({ row: rowNum, ref: ref, result: result, posted: posted });
    Logger.log("[FeedbackRepost] " + label + ": no feedback since it was built; result " + result +
               (doPost === true ? (posted ? ", posted." : ", COULD NOT POST.") : "."));
  }

  Logger.log("[FeedbackRepost] " + (doPost === true ? "POST" : "DRY RUN (nothing posted)") + ": " +
             out.docs + " of " + docIds.length + " doc(s) checked; " + out.hasFeedback + " have feedback, " +
             out.missing + " missing" + (doPost === true ? " (" + out.posted + " posted, " + out.failed + " failed)" : "") +
             (out.skipped ? ", " + out.skipped + " left out as asked" : "") +
             (out.malformed ? ", " + out.malformed + " malformed" : "") +
             (out.notHarvested ? ", " + out.notHarvested + " newest row not harvested" : "") +
             (out.inDoc ? ", " + out.inDoc + " keep feedback in the doc" : "") +
             (out.unreadable ? ", " + out.unreadable + " unreadable" : "") + "." +
             (out.finished ? "" : " Stopped at the time budget; run it again to finish.") +
             (doPost === true || !out.missing ? "" : " To post them, run it again with true as the first argument."));
  return out;
}

// The feedback comments this account posted on one doc inside [fromMs, toMs].
function _fiFeedbackCommentsIn_(docId, fromMs, toMs) {
  const found = [];
  let pageToken;
  do {
    const opts = { fields: "comments(id,createdTime,author(me),content),nextPageToken", pageSize: 100 };
    if (pageToken) opts.pageToken = pageToken;
    const res = Drive.Comments.list(docId, opts) || {};
    (res.comments || []).forEach(function (c) {
      const t = Date.parse(c.createdTime);
      if (c.author && c.author.me === true && t >= fromMs && t <= toMs &&
          String(c.content || "").indexOf("Feedback, ") === 0) {
        found.push({ id: c.id, createdTime: c.createdTime });
      }
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return found;
}
