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
// The two Flow 2 fixtures (2026-11-15). The first is the original; the second
// is a different assignment and a different response, so feedback that mixes
// the two (a grouped Studio run reading both prompts, the 11-13 symptom)
// shows at a glance: each output must talk about its own unit only.
const FX_FLOW2_SPECS = [
  { ref: "FIXTURE", configSuffix: "F2", docTitle: "[FIXTURE] Flow 2 Student Submission",
    unitName: "Fixture Unit 3 — Campaign Pitch",
    persona: "A demanding but encouraging marketing director reviewing a junior pitch.",
    milestones: ["Identify the target demographic with supporting reasoning.",
      "Select at least two promotional channels and justify each.",
      "Propose a measurable success metric with a stated target.",
      "Deliver the pitch in professional business language."],
    dod: "All four elements present, reasoning specific rather than generic, and " +
      "writing free of errors that would undermine client credibility.",
    compPrefix: "FIXTURE-COMP-", response: FX_STUDENT_RESPONSE },
  { ref: "FIXTURE-2", configSuffix: "F2B", docTitle: "[FIXTURE] Flow 2 Student Submission (second)",
    unitName: "Fixture Unit 7 — Stadium Concessions Plan",
    persona: "A practical venue operations manager reviewing a new hire's plan.",
    milestones: ["Name two concession items and the price of each with a reason.",
      "Estimate how many of each will sell at one game and show the math.",
      "Identify one risk to concession sales and a plan for it.",
      "Write the plan in clear, complete sentences."],
    dod: "All four elements present, numbers shown with their math, and a risk " +
      "that fits the venue rather than a generic one.",
    compPrefix: "FIXTURE-COMP-B", response:
      "FIXTURE RESPONSE (second) — This is seeded test data, not a real student submission.\n\n" +
      "For the home opener I would sell soft pretzels at $4, because they cost about $1 " +
      "to make and fans buy them as a quick snack, and bottled water at $3, because the " +
      "early season games are hot. With 2,000 fans and about one in five buying a " +
      "pretzel, I expect 400 pretzels; with one in four buying water, 500 bottles. " +
      "The biggest risk is rain lowering attendance, so I would order water in two " +
      "deliveries instead of all at once." },
];

// One fixture's scratch doc and FlowInput row (unwritten), from a spec.
function _fxFlow2FixtureRow_(spec) {
  const configId = FX_CONFIG_PREFIX + spec.configSuffix;
  const doc = DocumentApp.create(spec.docTitle);
  const body = doc.getBody();
  // Mirrors the zone structure stampDocument_()
  // (02_Form1_IntakeAndWorkspaceGenerator.js) writes into a real student doc,
  // so Studio's Extract step sees the markers it would see in production.
  //
  // THE CONFIG_ID FOOTER IS NOT DECORATION, and this fixture shipped without
  // it. Flow 2's Extract step reads the response as the text BETWEEN
  // "── YOUR RESPONSE BEGINS HERE ──" and "[CONFIG_ID:" — see
  // 15b_StudioFlowPrompts_Flow2_Revised.js's Step 1 note — so a doc with no
  // footer gives that step no end delimiter at all. Script 01's
  // getConfigIdFromDoc-style fallback also parses the ConfigID straight out of
  // the body with /\[CONFIG_ID:\s*([A-Z0-9\-]+)\]/, which the fixture's
  // VDOE-FIXTURE-F2 satisfies. Both zones are reproduced from
  // 02_Form1_IntakeAndWorkspaceGenerator.js's own ZONE 3 and ZONE 4 rather
  // than approximated.
  body.appendParagraph("── FEEDBACK ──");
  body.appendParagraph(
    "[No feedback yet. Use 📊 AI Evaluation Panel → Run Assignment Check " +
    "to request your first evaluation.]");
  body.appendParagraph("── END FEEDBACK ──");
  body.appendParagraph("");
  body.appendParagraph(
    "──────────────────────────────────────────────────\n" +
    "── YOUR RESPONSE BEGINS HERE ──\n" +
    "──────────────────────────────────────────────────");
  body.appendParagraph(spec.response);
  body.appendParagraph(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "[CONFIG_ID: " + configId + "]\n" +
    "Do not modify or delete this section.\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  doc.saveAndClose();
  const row = new Array(22).fill("");
  row[FI.TIMESTAMP] = new Date();
  row[FI.STAGING_ROW_REF] = spec.ref; // non-numeric on purpose: see installFlow2Fixture
  row[FI.STUDENT_FILE_ID] = doc.getId();
  row[FI.CONFIG_ID] = configId;
  row[FI.TEACHER_EMAIL] = FX_TEACHER_EMAIL;
  row[FI.STUDENT_EMAIL] = FX_STUDENT_EMAIL;
  row[FI.STUDENT_DOC_URL] = "https://docs.google.com/document/d/" + doc.getId() + "/edit";
  row[FI.UNIT_NAME] = spec.unitName;
  row[FI.TIER] = spec.tier || "Tier 1 Core";
  row[FI.PERSONA] = spec.persona;
  row[FI.MILESTONE_1] = spec.milestones[0];
  row[FI.MILESTONE_2] = spec.milestones[1];
  row[FI.MILESTONE_3] = spec.milestones[2];
  row[FI.MILESTONE_4] = spec.milestones[3];
  row[FI.DEFINITION_OF_DONE] = spec.dod;
  row[FI.MILESTONE_1_COMPETENCY_ID] = spec.compPrefix + "1";
  row[FI.MILESTONE_2_COMPETENCY_ID] = spec.compPrefix + "2";
  row[FI.MILESTONE_3_COMPETENCY_ID] = spec.compPrefix + "3";
  row[FI.MILESTONE_4_COMPETENCY_ID] = spec.compPrefix + "4";
  row[FI.READY_STATUS] = "READY";
  row[FI.GEMINI_FULL_OUTPUT] = "";
  // Same pre-substituted prompt a real row gets, so the @trigger.PromptText
  // chip resolves to real text while you're wiring Ask Gemini against the
  // fixture — the whole point of the fixture being fully populated. A
  // reflection fixture's row carries its reflection the way a real one does
  // (37's _fiReflectionPromptText_).
  row[FI.PROMPT_TEXT] = _fiBuildPromptText_({
    unitName: row[FI.UNIT_NAME], tier: row[FI.TIER], persona: row[FI.PERSONA],
    milestone1: row[FI.MILESTONE_1], milestone2: row[FI.MILESTONE_2],
    milestone3: row[FI.MILESTONE_3], milestone4: row[FI.MILESTONE_4],
    dod: row[FI.DEFINITION_OF_DONE],
  }, spec.reflection ? _fiReflectionPromptText_(spec.reflection) : "");
  return { row: row, configId: configId, docId: doc.getId() };
}

function installFlow2Fixture(count) {
  // count 2 (2026-11-15): two fixture rows, written READY in ONE write, so
  // Studio's sheet starter sees them change together and groups them into
  // one run: the case Flow 2's Repeat-for-each loop must handle (each row
  // its own Gemini call, its own update, matched on StagingRowRef). Each row
  // has its own StagingRowRef ("FIXTURE", "FIXTURE-2"), doc and assignment.
  // checkFlow2Fixture() then says whether each got its own feedback.
  const n = Math.max(1, Math.min(FX_FLOW2_SPECS.length, Math.floor(Number(count) || 1)));
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
    Logger.log("[Fixtures] Flow 2: already seeded — leaving it alone." +
      (n > 1 ? " Run removeFlow2Fixture() first, then installFlow2Fixture(" + n + ")." : ""));
    return { flow: 2, seeded: 0, skipped: 1 };
  }

  const made = FX_FLOW2_SPECS.slice(0, n).map(_fxFlow2FixtureRow_);
  const width = Math.max(sheet.getLastColumn(), made[0].row.length);
  const rows = made.map(function (m) {
    const r = m.row.slice();
    while (r.length < width) r.push("");
    return r;
  });
  // One write for all of them, so they change at the same moment.
  const first = sheet.getLastRow() + 1;
  sheet.getRange(first, 1, rows.length, width).setValues(rows);
  SpreadsheetApp.flush();
  const row = made[0].row;
  const configId = made[0].configId;
  const doc = { getId: function () { return made[0].docId; } };

  // _fiBuildPromptText_ returns "" rather than throwing when
  // FLOW_2_SYSTEM_PROMPT (15b) or substituteFlowPrompt_ (40) is out of scope.
  // Both are bound to this project so that should never happen live — but a
  // silent empty here would send an operator to wire @trigger.PromptText
  // against a blank cell and read the result as a Studio problem. Say it
  // loudly instead.
  if (!String(row[FI.PROMPT_TEXT]).trim()) {
    Logger.log("[Fixtures] ⚠️ Flow 2: PromptText came back EMPTY. The fixture row is " +
               "otherwise complete, but @trigger.PromptText will resolve to nothing — " +
               "check that 15b_StudioFlowPrompts_Flow2_Revised.js and 40_FlowPrompts.js " +
               "are both present in this project (project-map.json lists them under " +
               "cas-ccps:central-ledger). Until then, paste Flow 2's prompt into the " +
               "Ask Gemini step by hand.");
  }

  made.forEach(function (m, i) {
    Logger.log("[Fixtures] Flow 2: seeded FlowInput row " + (first + i) + " at READY (ConfigID " + m.configId +
      ", StagingRowRef " + FX_FLOW2_SPECS[i].ref + ").");
    Logger.log("[Fixtures]   student doc: " + m.docId);
  });
  Logger.log("[Fixtures]   StagingRowRef is non-numeric on purpose (\"FIXTURE\"…), not a row number — " +
             "so if you let the real harvest run against this row, its " +
             "_fiMarkStagingComplete_ finds no matching STAGING_PIPELINE row and " +
             "says so, rather than completing an unrelated real row.");
  if (n > 1) Logger.log("[Fixtures]   Wait for Studio (2–5 min), then run checkFlow2Fixture().");
  return { flow: 2, seeded: n, skipped: 0, configId: configId, studentFileId: doc.getId(),
    rows: made.map(function (m, i) { return { configId: m.configId, ref: FX_FLOW2_SPECS[i].ref, studentFileId: m.docId }; }) };
}

/**
 * After installFlow2Fixture(2) (or 1): did each fixture row get its own
 * feedback? Per row: its status, whether it has output, whether the output
 * names its own unit's subject and not the other's, and whether two rows
 * hold the same output. Read-only; logs names of fixture units only.
 */
function checkFlow2Fixture() {
  const cfg = getConfig_();
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName((cfg.tabs && cfg.tabs.flowInput) || "FlowInput");
  const data = sheet && sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues().slice(1) : [];
  const keys = { "F2": /campaign|demographic|promotional/i, "F2B": /concession|pretzel|stadium/i };
  const rows = data.filter(function (r) { return String(r[FI.CONFIG_ID]).trim().indexOf(FX_CONFIG_PREFIX) === 0; });
  if (!rows.length) {
    Logger.log("[Fixtures] checkFlow2Fixture: no fixture rows. Run installFlow2Fixture(2) first.");
    return { rows: 0, ok: false };
  }
  const outs = {};
  let ok = true;
  rows.forEach(function (r) {
    const id = String(r[FI.CONFIG_ID]).trim();
    const suffix = id.slice(FX_CONFIG_PREFIX.length);
    const out = String(r[FI.GEMINI_FULL_OUTPUT] || "");
    const status = String(r[FI.READY_STATUS] || "").trim();
    let verdict;
    if (!out.trim()) { verdict = "no output yet (status " + (status || "blank") + ")"; ok = false; }
    else {
      const own = keys[suffix] ? keys[suffix].test(out) : true;
      const other = Object.keys(keys).some(function (k) { return k !== suffix && keys[k].test(out); });
      verdict = own && !other ? "its own feedback" : other ? "MIXED: mentions the other fixture's assignment" : "doesn't mention its own assignment";
      if (!(own && !other)) ok = false;
      if (outs[out]) { verdict += "; SAME OUTPUT as " + outs[out]; ok = false; }
      outs[out] = id;
    }
    Logger.log("[Fixtures] " + id + " (StagingRowRef " + String(r[FI.STAGING_ROW_REF]).trim() + "): " + status + " — " + verdict);
  });
  Logger.log("[Fixtures] checkFlow2Fixture: " + (ok ? "PASS — each row got its own feedback." :
    "NOT YET — see above. If a row is still READY, wait and run this again; if outputs are mixed or the same, " +
    "check Flow 2's Repeat for each (every chip should be Step 2's each item) and Update rows (match on StagingRowRef)."));
  Logger.log("[Fixtures] When done: removeFlow2Fixture().");
  return { rows: rows.length, ok: ok };
}

// ---------------------------------------------------------------------------
// The reflection fixture (2026-11-19, D19's third safeguard, the operator's
// go). The 11-15 re-grade graded the same doc twice, with and without its
// reflection, and two of three such pairs came out differently. Flow 2's
// prompt says a reflection answer never stands in for work that isn't
// there. This tests it: pairs of rows identical but for the reflection,
// on a made-up campaign pitch that leaves out its success metric
// (milestone 3), with a reflection that claims one. Each pair should get
// the same outcomes, and milestone 3 should never be MET.
// installFlow2ReflectionFixture(pairs) writes them (each pair spends two
// Studio runs; default 3 pairs, at most 5), checkFlow2ReflectionFixture()
// compares them once Studio has answered, removeFlow2Fixture() clears them.
// Made-up text only.
// ---------------------------------------------------------------------------
const FX_REFLECTION_PREFIX = "R"; // ConfigIDs VDOE-FIXTURE-R<pair>W / R<pair>N
const FX_REFLECTION_REF_BASE = 100; // StagingRowRefs FIXTURE-101, FIXTURE-102, …
const FX_REFLECTION_MAX_PAIRS = 5;
const FX_REFLECTION_RESPONSE =
  "FIXTURE RESPONSE (reflection test) — This is seeded test data, not a real student submission.\n\n" +
  "For the campaign I chose the local minor league baseball team and targeted " +
  "families with children under twelve, because attendance data shows weekend " +
  "afternoon games draw that group most heavily. I selected two channels: " +
  "school-newsletter inserts, which reach parents directly at low cost, and " +
  "short-form social video, which reaches the same parents where they already " +
  "spend attention. The pitch closes by asking the team to fund both channels " +
  "for the spring season.";
// Claims the metric the response leaves out.
const FX_REFLECTION_ANSWERS = [
  { kind: "EVIDENCE", competencyId: "FIXTURE-COMP-3",
    question: "How does your work show a measurable goal for the campaign?",
    answer: "I set a clear goal of a fifteen percent increase in weekend family ticket packages over last " +
      "season, and I explained how the team would measure it every month." },
];

function _fxReflectionSpecs_(pairs) {
  const base = FX_FLOW2_SPECS[0];
  const out = [];
  for (let p = 1; p <= pairs; p++) {
    [["W", FX_REFLECTION_ANSWERS], ["N", null]].forEach(function (arm, j) {
      out.push(Object.assign({}, base, {
        ref: "FIXTURE-" + (FX_REFLECTION_REF_BASE + (p - 1) * 2 + j + 1),
        configSuffix: FX_REFLECTION_PREFIX + p + arm[0],
        docTitle: "[FIXTURE] Flow 2 reflection test, pair " + p + (arm[1] ? ", with" : ", without"),
        response: FX_REFLECTION_RESPONSE, reflection: arm[1],
      }));
    });
  }
  return out;
}

function _fxIsReflectionFixtureConfig_(configId) {
  return new RegExp("^" + FX_CONFIG_PREFIX + FX_REFLECTION_PREFIX + "\\d+[WN]$").test(String(configId).trim());
}

function installFlow2ReflectionFixture(pairs) {
  const n = Math.max(1, Math.min(FX_REFLECTION_MAX_PAIRS, Math.floor(Number(pairs) || 3)));
  const cfg = getConfig_();
  const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ledgerSs.getSheetByName((cfg.tabs && cfg.tabs.flowInput) || "FlowInput") || _fiEnsureTab_(ledgerSs, cfg);
  const data = sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues().slice(1) : [];
  if (data.some(function (r) { return _fxIsReflectionFixtureConfig_(r[FI.CONFIG_ID]); })) {
    Logger.log("[Fixtures] Reflection fixture: already seeded. checkFlow2ReflectionFixture() reads it; " +
      "removeFlow2Fixture() clears it before seeding again.");
    return { seeded: 0, skipped: 1 };
  }
  const made = _fxReflectionSpecs_(n).map(_fxFlow2FixtureRow_);
  const width = Math.max(sheet.getLastColumn(), made[0].row.length);
  const rows = made.map(function (m) {
    const r = m.row.slice();
    while (r.length < width) r.push("");
    return r;
  });
  const first = sheet.getLastRow() + 1;
  sheet.getRange(first, 1, rows.length, width).setValues(rows);
  SpreadsheetApp.flush();
  Logger.log("[Fixtures] Reflection fixture: " + n + " pair(s), " + rows.length + " FlowInput rows from row " + first +
    " (READY): the same response in each, with and without a reflection that claims the missing success metric. " +
    "That's " + rows.length + " Studio runs. Wait for Studio (a few minutes), then checkFlow2ReflectionFixture().");
  return { seeded: rows.length, pairs: n, first: first };
}

/**
 * After installFlow2ReflectionFixture(): per pair, each row's outcomes and
 * stamp, whether the two differ, and whether milestone 3 (not in the work,
 * claimed in the reflection) was credited. Read-only.
 */
function checkFlow2ReflectionFixture() {
  const cfg = getConfig_();
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName((cfg.tabs && cfg.tabs.flowInput) || "FlowInput");
  const data = sheet && sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues().slice(1) : [];
  const byPair = {};
  data.forEach(function (r) {
    const id = String(r[FI.CONFIG_ID]).trim();
    if (!_fxIsReflectionFixtureConfig_(id)) return;
    const m = /R(\d+)([WN])$/.exec(id);
    const out = String(r[FI.GEMINI_FULL_OUTPUT] || "");
    (byPair[m[1]] = byPair[m[1]] || {})[m[2]] = out.trim()
      ? { outcomes: _parseFlow2MilestoneOutcomes_(out), stamp: scanCompliance_(out) } : null;
  });
  const pairs = Object.keys(byPair).sort(function (a, b) { return a - b; });
  if (!pairs.length) {
    Logger.log("[Fixtures] checkFlow2ReflectionFixture: no reflection fixture rows. Run installFlow2ReflectionFixture() first.");
    return { pairs: 0, done: false };
  }
  const fmt = function (o) {
    return o.outcomes ? Object.keys(o.outcomes).sort().map(function (k) { return k + " " + o.outcomes[k]; }).join(", ") : "no outcomes line";
  };
  const res = { pairs: pairs.length, answered: 0, differ: 0, creditedWith: 0, creditedWithout: 0, done: true };
  pairs.forEach(function (p) {
    const w = byPair[p].W, n = byPair[p].N;
    if (!w || !n) {
      res.done = false;
      Logger.log("[Fixtures] Pair " + p + ": waiting for Studio (" + (!w && !n ? "neither row" : !w ? "the row with the reflection" : "the row without") + " answered).");
      return;
    }
    res.answered++;
    const same = JSON.stringify(w.outcomes) === JSON.stringify(n.outcomes) && w.stamp === n.stamp;
    if (!same) res.differ++;
    const met3 = function (o) { return !!(o.outcomes && o.outcomes["3"] === "MET"); };
    if (met3(w)) res.creditedWith++;
    if (met3(n)) res.creditedWithout++;
    Logger.log("[Fixtures] Pair " + p + ": " + (same ? "SAME" : "DIFFERENT") +
      ". With the reflection: " + fmt(w) + " (" + w.stamp + "). Without: " + fmt(n) + " (" + n.stamp + ").");
  });
  if (res.answered) {
    Logger.log("[Fixtures] checkFlow2ReflectionFixture: " + res.answered + " pair(s) answered; " + res.differ +
      " graded differently with the reflection. Milestone 3 (the success metric the work leaves out, the reflection claims) " +
      "was MET in " + res.creditedWith + " with the reflection and " + res.creditedWithout + " without. " +
      (res.creditedWith > res.creditedWithout
        ? "The reflection is standing in for missing work: the prompt's rule isn't holding."
        : res.differ
          ? "Pairs differ but the claim wasn't credited more often: the grader varies run to run on the same text."
          : "The reflection didn't change a grade."));
  }
  if (!res.done) Logger.log("[Fixtures] Not every pair has answered; run this again in a few minutes.");
  Logger.log("[Fixtures] When done: removeFlow2Fixture() (clears these rows and their scratch docs).");
  return res;
}

// ---------------------------------------------------------------------------
// Flows 3, 4, 5 — WarmUpQueue, one row parked at each Studio-watched status.
//
// Real status machine (confirmed against the code, not the summary docs):
//   PENDING --Flow 3--> DELIVERED
// (Until 2026-11-01 a returning student started at PENDING_BRIDGE for
// Flow 5's bridge; Flow 5 is merged into Flow 3, which writes the lead-in.)
//     --25_WarmUpWriter.js runWarmUpEvaluation()--> PENDING_EVAL
//     --Flow 4--> SCORED
//
// Note Flow 4's trigger is PENDING_EVAL, not DELIVERED — 28_Module2Setup.js's
// own Phase B dialog says PENDING_EVAL (line ~871) and
// 34_QueueWatchdog.js watches that status; the DELIVERED -> PENDING_EVAL hop
// belongs to Script 25, not to any flow.
// ---------------------------------------------------------------------------
/**
 * Builds a scratch warm-up document for the Flow 4 fixture, with the same
 * zone structure a real Flow 3 run produces plus a written response.
 *
 * WHY A REAL DOCUMENT AND NOT A FAKED Doc_ID. Flow 4's materialization
 * (41_WarmUpFlowBridge.js) calls evaluateWarmUpDoc_() to pull the ORIGINAL
 * prompt text out of the doc, because reconstructing it from the lesson
 * snapshot gives an approximation rather than the exact text the student saw.
 * A fabricated Doc_ID makes that call fail and no Flow4Input row is written —
 * the flow would have nothing to latch onto, which is the specific problem
 * these fixtures exist to solve.
 *
 * THE MARKERS ARE COPIED FROM THE READER, NOT INVENTED. evaluateWarmUpDoc_()
 * finds the prompt between "── WARM-UP PROMPT ──" and "── END PROMPT ──", and
 * the response after RESPONSE_ZONE_MARKER. Using RESPONSE_ZONE_MARKER by
 * reference (it is the same project) rather than retyping the string is what
 * keeps this fixture honest if that constant ever changes.
 *
 * Returns { id, url } or null — a fixture that cannot make a doc logs and
 * degrades to a status-only row rather than aborting the whole seed.
 */
function _fxCreateWarmUpFixtureDoc_(queueId, ctx, responseText) {
  try {
    const doc = DocumentApp.create("FIXTURE Warm-Up — " + queueId);
    const body = doc.getBody();
    body.clear();
    body.appendParagraph("Warm-Up — FIXTURE — Fixture Student");

    body.appendParagraph("── WARM-UP PROMPT ──");
    body.appendParagraph(
      "FIXTURE PROMPT — " + (ctx.activity || "Draft a channel justification.") +
      " Think about " + (ctx.vocabulary || "your key terms") + " as you write.");
    body.appendParagraph("── END PROMPT ──");
    body.appendParagraph("");
    body.appendParagraph(RESPONSE_ZONE_MARKER);
    body.appendParagraph(responseText);
    doc.saveAndClose();

    const file = DriveApp.getFileById(doc.getId());
    Logger.log("[Fixtures] Flow 4: created scratch doc " + file.getId() +
               " with a prompt zone and a written response.");
    return { id: file.getId(), url: file.getUrl() };
  } catch (e) {
    Logger.log("[Fixtures] Flow 4: could not create the scratch doc (" + e.message +
               "). Seeding a status-only row — Flow 4's materialization will " +
               "skip it for want of a Doc_ID, so Flow 4 has nothing to match " +
               "until this is re-run.");
    return null;
  }
}

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
    // OBJECT shape, not strings. 41_WarmUpFlowBridge.js's archetype decision
    // reads signals[i].indicators.strengths/.gaps and formats .date/.note, so
    // a plain string array materializes into a nonsense prompt block
    // ("- : (strengths: None; gaps: None)") without erroring anywhere. These
    // values are chosen to land on CONCRETE_SCENARIO through the decision
    // table — application strong, analysis a gap, engagement 2 — so the
    // fixture exercises a real branch rather than the fallback tail.
    evaluation_signals: [
      {
        date: lessonDate,
        note: "FIXTURE: seeded signal, not a real learner record",
        indicators: { strengths: ["application"], gaps: ["analysis"] },
      },
    ],
    warmup_scores: [3, 4],
    extra_credit_count: 0,
    avg_engagement_score: 2,
    last_updated: lessonDate,
    shadow_matrix: {},
    unit_current: "Campaign Pitch",
    shadow_archetype_note: null,
  };

  // The F3L row carries the prior-response fields buildWarmUpQueues() only
  // adds for a RETURNING student: Flow 3 answers it with a lead-in.
  const ctxWithPrior = Object.assign({}, ctxBase, {
    flow5_prior_response:
      "FIXTURE PRIOR RESPONSE — I picked families with young children because " +
      "weekend afternoon attendance skews that way.",
    flow5_prior_date: lessonDate,
    flow5_prior_score: 4,
  });

  const specs = [
    { suffix: "F3L", status: "PENDING", ctx: ctxWithPrior, response: "" },
    { suffix: "F3", status: "PENDING", ctx: ctxBase, response: "" },
    // withDoc: Flow 4's materialization refuses a row with no Doc_ID, and
    // reads the original prompt out of the doc via evaluateWarmUpDoc_(). A
    // status alone therefore gives Flow 4 nothing to latch onto — this is the
    // one fixture that has to bring a real document with it.
    { suffix: "F4", status: "PENDING_EVAL", ctx: ctxBase,
      response: FX_STUDENT_RESPONSE, withDoc: true },
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
      const words = spec.response.split(/\s+/).filter(Boolean).length;
      row[WQ24_WORD_COUNT] = words;
      // Flow 4's total is word_count_score + grammar + engagement +
      // extra_credit, and the harvest reads this cell rather than recomputing
      // it. Left at 0 the fixture would score a plausible response as if it
      // had been blank, which reads as a scoring bug rather than a fixture
      // gap. 2 is the mid band for a response of this length.
      row[WQ24_WORD_COUNT_SCORE] = 2;
    }
    if (spec.withDoc) {
      const made = _fxCreateWarmUpFixtureDoc_(queueId, spec.ctx, spec.response);
      if (made) {
        row[WQ24_DOC_ID] = made.id;
        row[WQ24_DOC_URL] = made.url;
      }
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
  check("Flow 3 (lead-in) — WarmUpQueue PENDING", wq,
    WQ24_QUEUE_ID, FX_QUEUE_PREFIX + "F3L", "PENDING", WQ24_STATUS);
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
  // A fixture parked at a trigger condition is only half the story. Nothing
  // reaches a Flow until Apps Script materializes an input row from it, and
  // nothing proves a Flow ran until something appears in the return tab.
  // Saying so here keeps "fixtures installed" from being mistaken for
  // "the flows are being exercised" — the exact confusion these fixtures
  // were built to remove.
  Logger.log("[Fixtures] Next: buildWarmUpFlowInputs() materializes Flows 3/4/5's " +
             "input rows (installWarmUpFlowTriggers() does it on a schedule), then " +
             "checkWarmUpFlowLiveness() reports whether any Flow has ever written " +
             "back. For Flow 2 the equivalents are installFlowInputTriggers() and " +
             "the FlowInput row checked above.");
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

  // 41_WarmUpFlowBridge.js's four tabs. Materialized input rows and harvested
  // returns both key on the WarmUpQueue's Queue_ID, so the same prefix match
  // clears them — without this, removing the fixtures would leave input rows
  // pointing at queue rows that no longer exist and the next harvest pass
  // would report them as failures forever.
  clearWhere(ledgerSs.getSheetByName("Flow3Input"), 1, { prefix: FX_QUEUE_PREFIX });
  clearWhere(ledgerSs.getSheetByName("Flow4Input"), 1, { prefix: FX_QUEUE_PREFIX });
  // The return tab keys Queue_ID in column 3 (0-based 2), after Flow.
  clearWhere(ledgerSs.getSheetByName("WarmUpFlowReturn"), 2, { prefix: FX_QUEUE_PREFIX });

  // FlowInput — also collect the scratch student doc (removeFlow2Fixture's
  // match: any fixture marker, not only the student address).
  const f2 = _fxClearFlow2FixtureRows_(ledgerSs, cfg);
  cleared += f2.cleared;
  f2.trashIds.forEach(function (id) { trashIds.push(id); });

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
// removeFlow2Fixture — only Flow 2's fixture: its FlowInput row(s), any
// CompetencyEvidence a harvest wrote from one, and the scratch student doc.
// For after Flow 2 is built, when the warm-up fixtures may still be in use.
// (2026-11-15: a fixture row outlived cleanUpFlow2Canary() (35), which
// clears canary rows only, VDOE-CANARY-; the fixture's are VDOE-FIXTURE-.)
// A row counts as the fixture when any of its markers does: StagingRowRef
// "FIXTURE", a VDOE-FIXTURE- ConfigID, or the fixture teacher or student
// address. Contents cleared in place, as removeFlowFixtures() does.
// ---------------------------------------------------------------------------
function removeFlow2Fixture() {
  const cfg = getConfig_();
  const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
  const res = _fxClearFlow2FixtureRows_(ledgerSs, cfg);
  const evidence = ledgerSs.getSheetByName((cfg.tabs && cfg.tabs.competencyEvidence) || "CompetencyEvidence");
  if (evidence && evidence.getLastRow() >= 2) {
    evidence.getDataRange().getValues().forEach(function (r, i) {
      if (i === 0 || String(r[5]).trim().indexOf(FX_CONFIG_PREFIX) !== 0) return;
      evidence.getRange(i + 1, 1, 1, evidence.getLastColumn()).clearContent();
      res.cleared++;
    });
  }
  res.trashIds.forEach(function (id) {
    try {
      DriveApp.getFileById(id).setTrashed(true);
    } catch (e) {
      Logger.log("[Fixtures] Could not trash a scratch doc (may already be gone): " + e.message);
    }
  });
  Logger.log("[Fixtures] Flow 2: cleared " + res.cleared + " fixture row(s), trashed " + res.trashIds.length +
             " scratch doc(s).");
  return { cleared: res.cleared, trashed: res.trashIds.length };
}

function _fxIsFlow2FixtureRow_(row) {
  return /^FIXTURE(-\d+)?$/.test(String(row[FI.STAGING_ROW_REF]).trim()) ||
    String(row[FI.CONFIG_ID]).trim().indexOf(FX_CONFIG_PREFIX) === 0 ||
    [FX_TEACHER_EMAIL, FX_STUDENT_EMAIL].indexOf(String(row[FI.TEACHER_EMAIL]).trim()) !== -1 ||
    [FX_TEACHER_EMAIL, FX_STUDENT_EMAIL].indexOf(String(row[FI.STUDENT_EMAIL]).trim()) !== -1;
}

// Clears the fixture's FlowInput rows: { cleared, trashIds (scratch docs) }.
function _fxClearFlow2FixtureRows_(ledgerSs, cfg) {
  const out = { cleared: 0, trashIds: [] };
  const sheet = ledgerSs.getSheetByName((cfg.tabs && cfg.tabs.flowInput) || "FlowInput");
  if (!sheet || sheet.getLastRow() < 2) return out;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    // The drift probe (39b) has its own remover, removeFlow2DriftProbe().
    if (!_fxIsFlow2FixtureRow_(data[i]) || _fiIsDriftProbeRow_(data[i])) continue;
    const id = String(data[i][FI.STUDENT_FILE_ID] || "").trim();
    if (id) out.trashIds.push(id);
    sheet.getRange(i + 1, 1, 1, sheet.getLastColumn()).clearContent();
    out.cleared++;
  }
  return out;
}

// How many Flow 2 fixture rows FlowInput holds (showSetupStatus, 35).
function flow2FixtureRows_(ss) {
  const sheet = ss.getSheetByName("FlowInput");
  if (!sheet || sheet.getLastRow() < 2) return 0;
  // The daily drift probe's row (39b) is meant to stay; it isn't a leftover.
  return sheet.getDataRange().getValues().slice(1).filter(function (r) {
    return _fxIsFlow2FixtureRow_(r) && !_fiIsDriftProbeRow_(r);
  }).length;
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
