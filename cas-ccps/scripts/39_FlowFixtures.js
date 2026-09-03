// =============================================================================
// FILE: 39_FlowFixtures.js
// BOUND TO: Central Ledger spreadsheet
// TRIGGERS: none — manual entry points, run from the Apps Script editor's Run
//           dropdown. None has a trailing underscore, deliberately (GAS hides
//           those from the dropdown).
//
//             installFlowFixtures()    — seed every flow's trigger data
//             checkFlowFixtures()      — report what's currently seeded
//             removeFlowFixtures()     — remove all of it
//
//           Per-flow, if you'd rather do one at a time:
//             installFlow1Fixture()    — RubricQueue     (Flow 1)
//             installFlow2Fixture()    — FlowInput       (Flow 2)
//             installWarmUpFixtures()  — WarmUpQueue     (Flows 3, 4, 5)
//
// PURPOSE: persistent dummy data for every flow's trigger condition, so a
// flow can actually be BUILT and Test Run in Studio's UI.
//
// WHY THIS IS NOT THE CANARIES, AND DOESN'T REPLACE THEM: runFlow1Canary()
// and runFlow2Canary() (35_FlowPreflightAndCanary.js) seed, verify and clean
// up within one execution — they answer "does this work?" These fixtures do
// the opposite: they sit there. While you're clicking a flow together in
// Studio, you need a row matching the trigger condition to exist for minutes
// or hours, so Test Run has something to fire on and every chip resolves to a
// visibly real value instead of a blank. Building a flow against an empty
// sheet is what produced this deployment's single biggest time sink — Flow 1's
// first build failed repeatedly with "Can't match any row," and diagnosing
// that consumed far more time than the fix.
//
// The division of labour, stated once so neither grows into the other:
//   - Fixtures (this file): what STUDIO needs to latch onto. Persistent.
//   - Canaries (file 35):   whether the CODE is correct. Transient.
//
// MARKERS: every seeded value is unmistakable and non-deliverable —
// `VDOE-FIXTURE-*` ConfigIDs, `WUQ-FIXTURE-*` queue IDs,
// `fixture-*@example.invalid` addresses (.invalid is the reserved TLD for
// exactly this), `[FIXTURE]`-titled scratch files. Deliberately a different
// namespace from 35_FlowPreflightAndCanary.js's `VDOE-CANARY-*` /
// `canary-test+*@example.invalid`, so the two never get confused and neither
// one's cleanup can touch the other's rows.
//
// TWO INTERACTIONS TO EXPECT, NEITHER A BUG:
//
//   1. LIVE FLOWS CONSUME FIXTURES. Every one of these rows sits at a status
//      some flow's trigger is watching. The moment that flow is turned on, it
//      processes the fixture and advances its status — which is exactly what
//      you want while testing (it proves the flow fires), but it means the
//      fixture set is used up as flows come online. Re-run
//      installFlowFixtures() to restore it; it's idempotent and will only
//      re-seed what's missing.
//
//      The warm-up chain is especially visible here: a PENDING_BRIDGE row
//      walks PENDING_BRIDGE -> PENDING -> DELIVERED -> PENDING_EVAL -> SCORED
//      as Flows 5, 3 and 4 each come online (with 25_WarmUpWriter.js's
//      runWarmUpEvaluation() making the DELIVERED -> PENDING_EVAL hop). That's
//      why installWarmUpFixtures() seeds THREE separate rows, one parked at
//      each Studio-watched status, rather than one row it expects you to
//      re-status by hand — all three flows have something to build against
//      simultaneously.
//
//   2. THE WATCHDOG WILL NOTICE THEM. 34_QueueWatchdog.js watches exactly
//      these statuses for staleness, so a fixture left in place past
//      WD_STALE_MINS will be reported as a stuck row. It defaults to dry-run
//      (CAS_WATCHDOG_DRY_RUN), so it alerts rather than escalating anything —
//      but if you've turned dry-run off, a stale fixture can be auto-moved to
//      the timeout status. Either way that's the watchdog doing its job, not
//      misfiring. Run removeFlowFixtures() when you're done building.
// =============================================================================

const FX_CONFIG_PREFIX = "VDOE-FIXTURE-";
const FX_QUEUE_PREFIX = "WUQ-FIXTURE-";
const FX_TEACHER_EMAIL = "fixture-teacher@example.invalid";
const FX_STUDENT_EMAIL = "fixture-student@example.invalid";

// A rubric realistic enough for a real FLOW_1_SYSTEM_PROMPT to extract four
// milestones and a definition of done from — the point is to exercise real
// extraction, not to test prompt quality.
const FX_RUBRIC_TEXT =
  "FIXTURE RUBRIC — Sports Marketing Unit 3: Campaign Pitch.\n\n" +
  "Students will design and pitch a marketing campaign for a local sports " +
  "franchise. To meet the standard, a submission must: (1) identify the target " +
  "demographic with supporting reasoning; (2) select at least two promotional " +
  "channels and justify each against that demographic; (3) propose a measurable " +
  "success metric with a stated target; and (4) deliver the pitch in " +
  "professional business language suitable for a client meeting.\n\n" +
  "A submission is complete when all four elements are present, the reasoning " +
  "in each is specific rather than generic, and the writing is free of errors " +
  "that would undermine credibility with a client.";

const FX_STUDENT_RESPONSE =
  "FIXTURE RESPONSE — This is seeded test data, not a real student submission.\n\n" +
  "For the campaign I chose the local minor league baseball team and targeted " +
  "families with children under twelve, because attendance data shows weekend " +
  "afternoon games draw that group most heavily. I selected two channels: " +
  "school-newsletter inserts, which reach parents directly at low cost, and " +
  "short-form social video, which reaches the same parents where they already " +
  "spend attention. My success metric is a fifteen percent increase in weekend " +
  "family ticket packages over the prior season.";

// ---------------------------------------------------------------------------
// installFlowFixtures — everything, in one run.
// ---------------------------------------------------------------------------
function installFlowFixtures() {
  Logger.log("[Fixtures] Installing fixtures for all five flows…");
  const results = [
    installFlow1Fixture(),
    installFlow2Fixture(),
    installWarmUpFixtures(),
  ];
  const seeded = results.reduce(function (n, r) { return n + (r.seeded || 0); }, 0);
  const skipped = results.reduce(function (n, r) { return n + (r.skipped || 0); }, 0);
  Logger.log("[Fixtures] Done — " + seeded + " row(s) seeded, " + skipped +
             " already present and left alone.");
  Logger.log("[Fixtures] Run checkFlowFixtures() for a per-flow readiness report, " +
             "or removeFlowFixtures() when you're finished building.");
  return { seeded: seeded, skipped: skipped, results: results };
}

// ---------------------------------------------------------------------------
// Flow 1 — RubricQueue, Status = PENDING_EXTRACTION
//
// Needs two real Drive files to exist, not just a row: a TeacherMatrix-shaped
// spreadsheet for the flow's commit step to write its DRAFT row into, and a
// prompt-template Doc for its Drive-read step. Unlike runFlow1Canary(), which
// deliberately points at a nonexistent template to exercise the not-found
// path, a fixture wants the happy path — so both files get created for real.
// ---------------------------------------------------------------------------
function installFlow1Fixture() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.adminSsId);
  const sheet = ss.getSheetByName(cfg.tabs.rubricQueue || "RubricQueue");
  if (!sheet) {
    Logger.log("[Fixtures] Flow 1: RubricQueue tab not found — run runFlowPreflightCheck().");
    return { flow: 1, seeded: 0, skipped: 0, error: "RubricQueue tab missing" };
  }

  if (_fxFindRow_(sheet, 1, FX_TEACHER_EMAIL) !== -1) {
    Logger.log("[Fixtures] Flow 1: already seeded — leaving it alone.");
    return { flow: 1, seeded: 0, skipped: 1 };
  }

  const templateDoc = DocumentApp.create("[FIXTURE] Flow 1 Prompt Template");
  templateDoc.getBody().setText(
    "FIXTURE ASSIGNMENT PROMPT — Sports Marketing Unit 3: Campaign Pitch.\n\n" +
    "Design a marketing campaign for a local sports franchise and pitch it as " +
    "you would to a client. Address your target demographic, your promotional " +
    "channels, and how you will measure success."
  );
  templateDoc.saveAndClose();

  const matrixSs = SpreadsheetApp.create("[FIXTURE] Flow 1 Teacher Matrix");
  _fxSeedTeacherMatrix_(matrixSs);

  sheet.appendRow([
    new Date(),
    FX_TEACHER_EMAIL,
    "Fixture Test Teacher",
    "Fixture Subject",
    "Fixture Course",
    "Tier 1 Core",
    FX_RUBRIC_TEXT,
    templateDoc.getId(),
    matrixSs.getId(),
    "PENDING_EXTRACTION",
  ]);
  SpreadsheetApp.flush();

  Logger.log("[Fixtures] Flow 1: seeded RubricQueue row " + sheet.getLastRow() + ".");
  Logger.log("[Fixtures]   prompt template doc: " + templateDoc.getId());
  Logger.log("[Fixtures]   scratch TeacherMatrix: " + matrixSs.getId());
  return { flow: 1, seeded: 1, skipped: 0,
           templateDocId: templateDoc.getId(), matrixSsId: matrixSs.getId() };
}

// ---------------------------------------------------------------------------
// Flow 2 — FlowInput, ReadyStatus = READY
//
// The one that matters most for building, because Flow 2's whole redesign
// (37_FlowInputBuilder.js) exists so Studio reads literal values off one flat
// row. A fully-populated fixture row means every chip in the Ask Gemini step
// shows real text while you're wiring it, instead of a blank you can't tell
// from a broken binding.
//
// Seeds the FlowInput row directly rather than seeding the upstream
// STAGING_PIPELINE/Ledger/MatrixRegistry chain and letting the builder derive
// it. That's deliberate: this file's job is what Studio latches onto, and
// runFlow2Canary() already exercises the builder's 3-hop resolution properly.
// ---------------------------------------------------------------------------
function installFlow2Fixture() {
  const cfg = getConfig_();
  const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
  const tabName = (cfg.tabs && cfg.tabs.flowInput) || "FlowInput";
  let sheet = ledgerSs.getSheetByName(tabName);
  if (!sheet) {
    // _fiEnsureTab_ (37_FlowInputBuilder.js) owns this tab's creation; reuse
    // it rather than writing a second, divergent header list.
    sheet = _fiEnsureTab_(ledgerSs, cfg);
  }

  if (_fxFindRow_(sheet, FI.STUDENT_EMAIL, FX_STUDENT_EMAIL) !== -1) {
    Logger.log("[Fixtures] Flow 2: already seeded — leaving it alone.");
    return { flow: 2, seeded: 0, skipped: 1 };
  }

  const doc = DocumentApp.create("[FIXTURE] Flow 2 Student Submission");
  const body = doc.getBody();
  // Mirrors the zone structure stampDocument_()
  // (02_Form1_IntakeAndWorkspaceGenerator.js) writes into a real student doc,
  // so Studio's Extract step sees the markers it would see in production.
  body.appendParagraph("── FEEDBACK ──");
  body.appendParagraph(
    "[No feedback yet. Use 📊 AI Evaluation Panel → Run Assignment Check " +
    "to request your first evaluation.]");
  body.appendParagraph("── END FEEDBACK ──");
  body.appendParagraph("");
  body.appendParagraph("── YOUR RESPONSE BEGINS HERE ──");
  body.appendParagraph(FX_STUDENT_RESPONSE);
  doc.saveAndClose();

  const configId = FX_CONFIG_PREFIX + "F2";
  const row = new Array(22).fill("");
  row[FI.TIMESTAMP] = new Date();
  row[FI.STAGING_ROW_REF] = "FIXTURE"; // non-numeric on purpose — see below
  row[FI.STUDENT_FILE_ID] = doc.getId();
  row[FI.CONFIG_ID] = configId;
  row[FI.TEACHER_EMAIL] = FX_TEACHER_EMAIL;
  row[FI.STUDENT_EMAIL] = FX_STUDENT_EMAIL;
  row[FI.STUDENT_DOC_URL] = "https://docs.google.com/document/d/" + doc.getId() + "/edit";
  row[FI.UNIT_NAME] = "Fixture Unit 3 — Campaign Pitch";
  row[FI.TIER] = "Tier 1 Core";
  row[FI.PERSONA] =
    "A demanding but encouraging marketing director reviewing a junior pitch.";
  row[FI.MILESTONE_1] = "Identify the target demographic with supporting reasoning.";
  row[FI.MILESTONE_2] = "Select at least two promotional channels and justify each.";
  row[FI.MILESTONE_3] = "Propose a measurable success metric with a stated target.";
  row[FI.MILESTONE_4] = "Deliver the pitch in professional business language.";
  row[FI.DEFINITION_OF_DONE] =
    "All four elements present, reasoning specific rather than generic, and " +
    "writing free of errors that would undermine client credibility.";
  row[FI.MILESTONE_1_COMPETENCY_ID] = "FIXTURE-COMP-1";
  row[FI.MILESTONE_2_COMPETENCY_ID] = "FIXTURE-COMP-2";
  row[FI.MILESTONE_3_COMPETENCY_ID] = "FIXTURE-COMP-3";
  row[FI.MILESTONE_4_COMPETENCY_ID] = "FIXTURE-COMP-4";
  row[FI.READY_STATUS] = "READY";
  row[FI.GEMINI_FULL_OUTPUT] = "";
  // Same pre-substituted prompt a real row gets, so the @trigger.PromptText
  // chip resolves to real text while you're wiring Ask Gemini against the
  // fixture — the whole point of the fixture being fully populated.
  row[FI.PROMPT_TEXT] = _fiBuildPromptText_({
    unitName: row[FI.UNIT_NAME], tier: row[FI.TIER], persona: row[FI.PERSONA],
    milestone1: row[FI.MILESTONE_1], milestone2: row[FI.MILESTONE_2],
    milestone3: row[FI.MILESTONE_3], milestone4: row[FI.MILESTONE_4],
    dod: row[FI.DEFINITION_OF_DONE],
  });
  sheet.appendRow(row);
  SpreadsheetApp.flush();

  Logger.log("[Fixtures] Flow 2: seeded FlowInput row " + sheet.getLastRow() +
             " at READY (ConfigID " + configId + ").");
  Logger.log("[Fixtures]   student doc: " + doc.getId());
  Logger.log("[Fixtures]   StagingRowRef is the literal 'FIXTURE', not a row number — " +
             "so if you let the real harvest run against this row, its " +
             "_fiMarkStagingComplete_ finds no matching STAGING_PIPELINE row and " +
             "says so, rather than completing an unrelated real row.");
  return { flow: 2, seeded: 1, skipped: 0, configId: configId, studentFileId: doc.getId() };
}

// ---------------------------------------------------------------------------
// Flows 3, 4, 5 — WarmUpQueue, one row parked at each Studio-watched status.
//
// Real status machine (confirmed against the code, not the summary docs):
//   PENDING_BRIDGE --Flow 5--> PENDING --Flow 3--> DELIVERED
//     --25_WarmUpWriter.js runWarmUpEvaluation()--> PENDING_EVAL
//     --Flow 4--> SCORED
//
// Note Flow 4's trigger is PENDING_EVAL, not DELIVERED — 28_Module2Setup.js's
// own Phase B dialog says PENDING_EVAL (line ~871) and
// 34_QueueWatchdog.js watches that status; the DELIVERED -> PENDING_EVAL hop
// belongs to Script 25, not to any flow.
// ---------------------------------------------------------------------------
function installWarmUpFixtures() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.warmUpQueue || "WarmUpQueue");
  if (!sheet) {
    Logger.log("[Fixtures] Flows 3/4/5: WarmUpQueue tab not found. That tab is " +
               "created by 28_Module2Setup.js's Module 2 Full setup — if you " +
               "haven't run that, these three flows aren't deployable yet anyway.");
    return { flow: "3/4/5", seeded: 0, skipped: 0, error: "WarmUpQueue tab missing" };
  }

  const lessonDate = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  // The lesson_context_snapshot shape buildWarmUpQueues() (24_WarmUpBridge.js)
  // actually writes. admin_root_folder_id is what Flow 3 resolves the student's
  // warm-up folder from, so it's sourced from real config rather than faked.
  const ctxBase = {
    lesson_id: "FIXTURE-LESSON-1",
    lesson_date: lessonDate,
    objective: "Students will justify a promotional channel choice against a target demographic.",
    activity: "Draft a two-sentence channel justification for your chosen franchise.",
    vocabulary: "demographic, promotional channel, success metric",
    prior_connection: "Yesterday you identified your target demographic.",
    competency_ids: ["FIXTURE-COMP-1", "FIXTURE-COMP-2"],
    course_name: "Fixture Sports Marketing",
    period: "1",
    admin_root_folder_id: cfg.adminRootFolderId || "",
    teacher_name: cfg.teacherName || "Fixture Test Teacher",
    teacher_email: cfg.teacherEmail || FX_TEACHER_EMAIL,
    pacing_unit_id: "FIXTURE-UNIT-3",
    pacing_unit_name: "Campaign Pitch",
    pacing_stage: "Develop",
    warmup_anchor: "Channel justification",
    pacing_prior_connection: "Target demographic identification",
    pacing_key_vocabulary: "demographic, channel, metric",
    course_objective: "Apply marketing principles to a local franchise.",
  };

  const profileBase = {
    student_email: FX_STUDENT_EMAIL,
    student_name: "Fixture Student",
    period: "1",
    competencies_addressed: ["FIXTURE-COMP-1"],
    competency_gaps: ["FIXTURE-COMP-2"],
    evaluation_signals: ["FIXTURE: seeded profile, not a real learner record"],
    warmup_scores: [3, 4],
    extra_credit_count: 0,
    avg_engagement_score: 2,
    last_updated: lessonDate,
    shadow_matrix: {},
    unit_current: "Campaign Pitch",
    shadow_archetype_note: null,
  };

  // Flow 5's row carries the prior-response fields buildWarmUpQueues() only
  // adds for a RETURNING student — that's precisely what makes a row start at
  // PENDING_BRIDGE instead of PENDING.
  const ctxWithPrior = Object.assign({}, ctxBase, {
    flow5_prior_response:
      "FIXTURE PRIOR RESPONSE — I picked families with young children because " +
      "weekend afternoon attendance skews that way.",
    flow5_prior_date: lessonDate,
    flow5_prior_score: 4,
  });

  const specs = [
    { suffix: "F5", status: "PENDING_BRIDGE", ctx: ctxWithPrior, response: "" },
    { suffix: "F3", status: "PENDING", ctx: ctxBase, response: "" },
    { suffix: "F4", status: "PENDING_EVAL", ctx: ctxBase, response: FX_STUDENT_RESPONSE },
  ];

  let seeded = 0;
  let skipped = 0;
  specs.forEach(function (spec) {
    const queueId = FX_QUEUE_PREFIX + spec.suffix;
    if (_fxFindRow_(sheet, WQ24_QUEUE_ID, queueId) !== -1) {
      Logger.log("[Fixtures] WarmUpQueue " + spec.status + " fixture (" + queueId +
                 ") already present — leaving it alone.");
      skipped++;
      return;
    }

    const row = new Array(WQ24_COL_COUNT).fill("");
    row[WQ24_QUEUE_ID] = queueId;
    row[WQ24_LESSON_ID] = ctxBase.lesson_id;
    row[WQ24_STUDENT_EMAIL] = FX_STUDENT_EMAIL;
    row[WQ24_STUDENT_NAME] = "Fixture Student";
    row[WQ24_GOOGLE_ID] = FX_STUDENT_EMAIL;
    row[WQ24_LESSON_DATE] = lessonDate;
    row[WQ24_LESSON_CTX_SNAP] = JSON.stringify(spec.ctx);
    row[WQ24_STUDENT_PROFILE_SNAP] = JSON.stringify(profileBase);
    row[WQ24_STATUS] = spec.status;
    if (spec.response) {
      row[WQ24_RESPONSE_TEXT] = spec.response;
      row[WQ24_WORD_COUNT] = spec.response.split(/\s+/).length;
    }
    sheet.appendRow(row);
    seeded++;
    Logger.log("[Fixtures] Flows 3/4/5: seeded " + queueId + " at " + spec.status +
               " (row " + sheet.getLastRow() + ").");
  });

  if (seeded > 0) SpreadsheetApp.flush();
  if (!cfg.adminRootFolderId) {
    Logger.log("[Fixtures] ⚠️ ADMIN_ROOT_FOLDER_ID is not set, so the seeded " +
               "snapshots carry an empty admin_root_folder_id — Flow 3's " +
               "doc-creation step has nowhere to put the warm-up doc. Set that " +
               "Script Property and re-seed if you're building Flow 3.");
  }
  return { flow: "3/4/5", seeded: seeded, skipped: skipped };
}

// ---------------------------------------------------------------------------
// checkFlowFixtures — per-flow readiness. Read-only.
// ---------------------------------------------------------------------------
function checkFlowFixtures() {
  const cfg = getConfig_();
  const adminSs = SpreadsheetApp.openById(cfg.adminSsId);
  const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
  const report = [];

  const check = function (label, sheet, keyIndex, needle, expectStatus, statusIndex) {
    if (!sheet) {
      report.push({ label: label, ok: false, detail: "tab not found" });
      return;
    }
    const rowNum = _fxFindRow_(sheet, keyIndex, needle);
    if (rowNum === -1) {
      report.push({ label: label, ok: false, detail: "no fixture row" });
      return;
    }
    const status = statusIndex === undefined
      ? null
      : String(sheet.getRange(rowNum, statusIndex + 1).getValue()).trim();
    const ok = expectStatus === undefined || status === expectStatus;
    report.push({
      label: label, ok: ok,
      detail: "row " + rowNum + (status === null ? "" : ", status " + status) +
        (ok ? "" : " — expected " + expectStatus + "; a live flow has probably " +
          "already consumed it, which is a pass for that flow"),
    });
  };

  check("Flow 1 — RubricQueue PENDING_EXTRACTION",
    adminSs.getSheetByName(cfg.tabs.rubricQueue || "RubricQueue"),
    1, FX_TEACHER_EMAIL, "PENDING_EXTRACTION", 9);

  check("Flow 2 — FlowInput READY",
    ledgerSs.getSheetByName((cfg.tabs && cfg.tabs.flowInput) || "FlowInput"),
    FI.STUDENT_EMAIL, FX_STUDENT_EMAIL, "READY", FI.READY_STATUS);

  const wq = ledgerSs.getSheetByName(cfg.tabs.warmUpQueue || "WarmUpQueue");
  check("Flow 5 — WarmUpQueue PENDING_BRIDGE", wq,
    WQ24_QUEUE_ID, FX_QUEUE_PREFIX + "F5", "PENDING_BRIDGE", WQ24_STATUS);
  check("Flow 3 — WarmUpQueue PENDING", wq,
    WQ24_QUEUE_ID, FX_QUEUE_PREFIX + "F3", "PENDING", WQ24_STATUS);
  check("Flow 4 — WarmUpQueue PENDING_EVAL", wq,
    WQ24_QUEUE_ID, FX_QUEUE_PREFIX + "F4", "PENDING_EVAL", WQ24_STATUS);

  report.forEach(function (r) {
    Logger.log("[Fixtures] " + (r.ok ? "✅" : "⬜") + " " + r.label + " — " + r.detail);
  });
  const ready = report.filter(function (r) { return r.ok; }).length;
  Logger.log("[Fixtures] " + ready + " of " + report.length +
             " flows have a fixture parked at their trigger condition.");
  return { ready: ready, total: report.length, report: report };
}

// ---------------------------------------------------------------------------
// removeFlowFixtures — clears every fixture row and trashes the scratch files
// created for Flows 1 and 2.
//
// Clears row contents in place rather than deleting rows, same reason
// cleanUpFlow1Canary()/cleanUpFlow2Canary() do: deleteRow() shifts every row
// below it up by one, and 34_QueueWatchdog.js tracks rows by absolute
// position in its own state. Only ever touches rows carrying a fixture
// marker.
// ---------------------------------------------------------------------------
function removeFlowFixtures() {
  const cfg = getConfig_();
  const adminSs = SpreadsheetApp.openById(cfg.adminSsId);
  const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
  let cleared = 0;
  const trashIds = [];

  // Matching is expressed as data (an exact-value list and/or a prefix)
  // rather than a passed-in predicate function on purpose:
  // tools/gas-lint/check.js's possibly-undefined-in-project check can't
  // resolve a callback parameter to a declaration and reports every one as a
  // possible cross-project call bug. Four such false positives are already
  // this repo's documented baseline; not adding a fifth for a helper with
  // four call sites that a two-field options object covers just as well.
  const clearWhere = function (sheet, keyIndex, match, collectIndexes) {
    if (!sheet || sheet.getLastRow() < 2) return;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const value = String(data[i][keyIndex]).trim();
      const hit =
        (match.exact && match.exact.indexOf(value) !== -1) ||
        (match.prefix && value.indexOf(match.prefix) === 0);
      if (!hit) continue;
      (collectIndexes || []).forEach(function (idx) {
        const v = String(data[i][idx] || "").trim();
        if (v) trashIds.push(v);
      });
      sheet.getRange(i + 1, 1, 1, sheet.getLastColumn()).clearContent();
      cleared++;
    }
  };

  const fixtureEmails = { exact: [FX_TEACHER_EMAIL, FX_STUDENT_EMAIL] };

  // RubricQueue — also collect the template doc (7) and scratch matrix (8).
  clearWhere(adminSs.getSheetByName(cfg.tabs.rubricQueue || "RubricQueue"),
    1, fixtureEmails, [7, 8]);

  // FlowInput — also collect the scratch student doc.
  clearWhere(ledgerSs.getSheetByName((cfg.tabs && cfg.tabs.flowInput) || "FlowInput"),
    FI.STUDENT_EMAIL, fixtureEmails, [FI.STUDENT_FILE_ID]);

  // WarmUpQueue — Flow 3 may have created a doc of its own; collect it too.
  clearWhere(ledgerSs.getSheetByName(cfg.tabs.warmUpQueue || "WarmUpQueue"),
    WQ24_QUEUE_ID, { prefix: FX_QUEUE_PREFIX }, [WQ24_DOC_ID]);

  // Any CompetencyEvidence a real Flow 2 harvest wrote from the fixture row.
  clearWhere(ledgerSs.getSheetByName((cfg.tabs && cfg.tabs.competencyEvidence) || "CompetencyEvidence"),
    5, { prefix: FX_CONFIG_PREFIX }, []);

  trashIds.forEach(function (id) {
    try {
      DriveApp.getFileById(id).setTrashed(true);
      Logger.log("[Fixtures] Trashed scratch file " + id + ".");
    } catch (e) {
      Logger.log("[Fixtures] Could not trash " + id + " (may already be gone): " + e.message);
    }
  });

  Logger.log("[Fixtures] Cleared " + cleared + " fixture row(s), trashed " +
             trashIds.length + " scratch file(s).");
  return { cleared: cleared, trashed: trashIds.length };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// First data row (1-based) whose column `keyIndex` equals `needle`, or -1.
function _fxFindRow_(sheet, keyIndex, needle) {
  if (!sheet || sheet.getLastRow() < 2) return -1;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyIndex]).trim() === needle) return i + 1;
  }
  return -1;
}

// A TeacherMatrix-shaped tab with one LIVE fixture assignment already in it,
// so Flow 1 has somewhere real to write its DRAFT row and Flow 2's own
// lookups have something to resolve if you point them here. 20 columns,
// matching FI_TM_COLUMNS_ (37_FlowInputBuilder.js) and CommitRubricDraftStep.gs's
// TM_COLUMNS_.
function _fxSeedTeacherMatrix_(matrixSs) {
  const sheet = matrixSs.getActiveSheet().setName("TeacherMatrix");
  sheet.appendRow([
    "ConfigID", "UnitName", "Tier", "Persona",
    "Milestone1", "Milestone2", "Milestone3", "Milestone4",
    "DefinitionOfDone", "InstructorEmail", "Created", "Status",
    "PromptTemplateID", "Subject", "CourseName",
    "Milestone1CompetencyId", "Milestone2CompetencyId",
    "Milestone3CompetencyId", "Milestone4CompetencyId", "LessonUnitId",
  ]);
  sheet.appendRow([
    FX_CONFIG_PREFIX + "F1", "Fixture Unit 3 — Campaign Pitch", "Tier 1 Core",
    "A demanding but encouraging marketing director reviewing a junior pitch.",
    "Identify the target demographic with supporting reasoning.",
    "Select at least two promotional channels and justify each.",
    "Propose a measurable success metric with a stated target.",
    "Deliver the pitch in professional business language.",
    "All four elements present, reasoning specific rather than generic.",
    FX_TEACHER_EMAIL, new Date(), "LIVE",
    "FIXTURE-NO-TEMPLATE", "Fixture Subject", "Fixture Course",
    "FIXTURE-COMP-1", "FIXTURE-COMP-2", "FIXTURE-COMP-3", "FIXTURE-COMP-4", "",
  ]);
  return sheet;
}
