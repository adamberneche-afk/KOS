/**
 * =============================================================================
 * 41_WarmUpFlowBridge.js
 * BOUND TO: cas-ccps:central-ledger
 * =============================================================================
 *
 * Ports Flows 3, 4 and 5 off the five custom Workspace Studio steps they
 * depend on, using the same two-phase pattern 37_FlowInputBuilder.js
 * established for Flow 2: Apps Script materializes a flat literal input row,
 * Studio makes only the model call, Apps Script harvests the output.
 *
 * WHY. All 8 steps in cas-ccps/studio-steps/ are unreachable on this account
 * — a Workspace Add-on needs a standard, non-default Cloud project and GCP is
 * switched off org-wide by the district. HISTORY.md records the whole
 * confirmation; tools/gas-lint/gcp-map.json holds the declaration. Flow 2 was
 * redesigned around that wall already; these three were the remaining
 * exposure, named as such in that declaration's own `if_unavailable`.
 *
 * WHICH STEPS THIS REPLACES, AND WHICH HALF OF EACH FLOW MOVES:
 *
 *   Flow 5 (Bridging)         input : ExtractBridgeInputsStep
 *                             output: none — a native Sheets update sufficed
 *   Flow 3 (Warm-Up Generate) input : SelectWarmUpArchetypeStep
 *                             output: CreateWarmUpDocStep
 *   Flow 4 (Warm-Up Scoring)  input : ExtractWarmUpPromptTextStep
 *                             output: FinalizeWarmUpScoreStep
 *
 * Everything else in all three flows was already native and is untouched: the
 * Sheets trigger, the Docs read, and the Gemini call itself.
 *
 * HOW MUCH OF THIS IS GENUINELY NEW CODE: much less than 5 steps' worth,
 * because three of the five were duplicating Apps Script that already exists
 * in this same project — and each said so in its own header:
 *
 *   - ExtractWarmUpPromptTextStep re-implemented what
 *     evaluateWarmUpDoc_() (25_WarmUpWriter.js) already does: read the doc
 *     and pull the exact text between the Zone 1 delimiters. Reused, not
 *     ported.
 *   - FinalizeWarmUpScoreStep's three write-backs each state they "mirror
 *     writeFinalScores_() / writeFeedbackToDoc_() / writeRegistryScores_()
 *     exactly". Those live in 25_WarmUpWriter.js, in this project, so the
 *     harvest calls them. A second copy is what drift is made of.
 *   - ExtractBridgeInputsStep is three field reads off one parsed JSON blob.
 *
 * That leaves SelectWarmUpArchetypeStep's decision logic and
 * CreateWarmUpDocStep's document construction as the only substantial ports.
 * Both are reproduced faithfully below, including the interpretive choices
 * their headers flag as such — the archetype evaluation ORDER (PROVOCATION →
 * PARADOX → CONCRETE SCENARIO → BRIDGE, which differs from the spec table's
 * listing order), the "persistent gap" reading (a gap tag recurring across 2+
 * evaluation_signals entries), and the exact zone markers, font sizes and
 * colours the doc structure depends on. Those markers are not decoration:
 * evaluateWarmUpDoc_() finds the response by searching for them, so a changed
 * string silently breaks Flow 4.
 *
 * A REAL BUG THIS REMOVES, not just a wall it works around.
 * pollForFlow4Result_() (25_WarmUpWriter.js) blocks on
 * Utilities.sleep(15000) twelve times — three minutes of wall clock per row,
 * inside a trigger. Ten students would need thirty minutes of sleeping, well
 * past any Apps Script execution limit, so Flow 4 could never have scaled
 * past a handful of rows even with the custom step working. It turns out
 * nothing ever called it — 35_FlowPreflightAndCanary.js had already noted it
 * as unused — so this port does not have to unwire anything; a note at its
 * definition now says plainly that it must stay dead, and why.
 *
 * What runWarmUpEvaluation() DOES do is call callFlow4_(), a stub that always
 * returns null. Its null branch counted that as an error, so every nightly
 * run logged a failure for every row even though writePreEvalScores_ had
 * correctly parked each one at PENDING_EVAL — which is exactly the state this
 * file collects. That branch now says so instead of crying wolf.
 *
 * THE TABS, AND WHY NOT NEW WarmUpQueue COLUMNS. WarmUpQueue is 21 columns
 * read by hardcoded WQ*_ index constants in Scripts 23, 24 and 25
 * (WQ25_COL_COUNT === 21 is asserted in several getRange calls). Widening it
 * means touching all three, which is exactly the trade kos-personal's
 * 10_Turnstile.gs refused for the same reason. So:
 *
 *   Flow3Input / Flow4Input / Flow5Input — one flat literal row per pending
 *       job, one tab per flow so each Flow's native "get row" step points at
 *       its own columns through the fixed picker it is limited to.
 *   WarmUpFlowReturn — where every flow's last native "add row to sheet"
 *       step drops its raw model output. One shared tab: all three returns
 *       are the same shape (flow, queue id, raw text), discriminated by the
 *       Flow column.
 *
 * The WarmUpQueue status machine is unchanged. PENDING_BRIDGE → PENDING →
 * DELIVERED → PENDING_EVAL → SCORED still means exactly what it meant; this
 * file just moves who performs each transition. Nothing else in the system
 * has to learn a new state.
 *
 * ENTRY POINTS (no trailing underscore — GAS hides those from the Run
 * dropdown):
 *   buildWarmUpFlowInputs()      — materialize inputs for all three flows
 *   harvestWarmUpFlowReturns()   — apply whatever has come back
 *   installWarmUpFlowTriggers()  — both of the above, on time triggers
 *   checkWarmUpFlowLiveness()    — has each flow EVER returned anything?
 *   checkFlowBinding()           — are the Flow's output columns bound right?
 *                                  also logs the binding to copy from
 *   checkFlow2Binding()          — the same, for Flow 2's write-into-the-row shape
 *   runWarmUpFlowCanary()        — end-to-end, with Studio stubbed
 *   removeWarmUpFlowFixtures()   — clean up after a canary that died early
 */

// ── Tabs ─────────────────────────────────────────────────────────────────────

const WFB_RETURN_TAB = "WarmUpFlowReturn";
const WFB_INPUT_TABS = { 3: "Flow3Input", 4: "Flow4Input", 5: "Flow5Input" };

const WFB_RETURN_HEADERS = [
  "Timestamp", "Flow", "QueueID", "RawOutput", "HarvestStatus", "Attempts", "Error",
];
const WFB_RET = {
  TIMESTAMP: 0, FLOW: 1, QUEUE_ID: 2, RAW_OUTPUT: 3,
  HARVEST_STATUS: 4, ATTEMPTS: 5, ERROR: 6,
};

// Flow 5 needs three values that all live inside the single
// lesson_context_snapshot blob — the one genuinely non-native-friendly part
// of that flow, and the whole reason ExtractBridgeInputsStep existed.
const WFB_FLOW5_HEADERS = [
  "Timestamp", "QueueID", "Status",
  "PriorResponse", "PacingPriorConnection", "CourseName", "PromptText",
];

// Flow 3's full materialized input: the archetype decision plus every
// {placeholder} its system prompt interpolates, pre-formatted as plain text.
const WFB_FLOW3_HEADERS = [
  "Timestamp", "QueueID", "Status",
  "Mode", "Archetype", "FirstName", "WarmupAnchor",
  "PacingUnitName", "PacingStage", "CourseObjective", "PacingPriorConnection",
  "PacingKeyVocabulary", "CourseName", "Objective", "Activity", "Vocabulary",
  "PriorConnection", "CompetencyTexts", "CompetencyGaps", "EvaluationSignals",
  "AvgEngagementScore", "ExtraCreditCount", "ShadowArchetypeNote",
  "CompetenciesAddressedCount", "TotalCompetencies", "BridgeOutput",
  "StudentGoogleID", "StudentName", "LessonDate", "PromptText",
];

// Flow 4's inputs are almost all already on the WarmUpQueue row by the time
// Script 25 sets PENDING_EVAL; OriginalPromptText is the one that isn't, and
// evaluateWarmUpDoc_() already extracts it.
const WFB_FLOW4_HEADERS = [
  "Timestamp", "QueueID", "Status",
  "OriginalPromptText", "ResponseText", "WordCountScore", "ExtraCredit", "DocID",
  "PromptText",
];

const WFB_MAX_ATTEMPTS = 3;
const WFB_PRUNE_AFTER_DAYS = 14;
const WFB_CANARY_PREFIX = "WUQ-CANARY-";

// Which WarmUpQueue status makes a row eligible for each flow's input row.
// Reading these off the existing status machine rather than inventing new
// states is what keeps Scripts 23/24/25 unaware that anything changed.
const WFB_TRIGGER_STATUS = { 5: "PENDING_BRIDGE", 3: "PENDING", 4: "PENDING_EVAL" };

// The student-profile snapshot column. 25_WarmUpWriter.js's WQ25_* constants
// skip index 7 — that file never needed it — so this names it explicitly
// rather than writing WQ25_LESSON_CTX_SNAP + 1, which is the kind of
// positional cleverness that has already cost this repo a live session.
// Confirmed against 24_WarmUpBridge.js:60 (WQ24_STUDENT_PROFILE_SNAP = 7),
// the code that writes it.
const WFB_PROFILE_SNAP = 7;

// ── Archetype selection — ported from SelectWarmUpArchetypeStep.gs ───────────

const WFB_ARCHETYPES = {
  PROVOCATION: "PROVOCATION",
  PARADOX: "PARADOX",
  CONCRETE_SCENARIO: "CONCRETE_SCENARIO",
  BRIDGE: "BRIDGE",
};
const WFB_SHADOW_CROSS_CONFIDENCE_THRESHOLD = 0.75;
const WFB_SHADOW_WITHIN_CONFIDENCE_EARLY_UNIT_THRESHOLD = 0.3;

/**
 * Two-layer selection, verbatim from the step this replaces: shadow-matrix
 * overrides first (definite, then early-unit), the decision table second,
 * then a fixed fallback.
 *
 * The evaluation ORDER here (PROVOCATION → PARADOX → CONCRETE SCENARIO →
 * BRIDGE) deliberately differs from the order the spec's decision TABLE
 * lists them in; the spec states the evaluation order separately, in prose,
 * and that is the one that governs. Preserved rather than tidied, because
 * "tidying" it silently changes which prompt a student gets.
 */
function wfbSelectArchetype_(lesson, profile) {
  const shadowMatrix = profile.shadow_matrix || {};
  const unitCurrent = profile.unit_current || "";
  const shadowEntry = unitCurrent ? shadowMatrix[unitCurrent] : null;

  if (shadowEntry && typeof shadowEntry.cross_confidence === "number" &&
      shadowEntry.cross_confidence >= WFB_SHADOW_CROSS_CONFIDENCE_THRESHOLD &&
      shadowEntry.best_archetype) {
    return wfbNormalizeArchetypeName_(shadowEntry.best_archetype);
  }

  if (shadowEntry && typeof shadowEntry.within_confidence === "number" &&
      shadowEntry.within_confidence < WFB_SHADOW_WITHIN_CONFIDENCE_EARLY_UNIT_THRESHOLD) {
    return WFB_ARCHETYPES.BRIDGE;
  }

  const signals = profile.evaluation_signals || [];
  const avgEngagement = Number(profile.avg_engagement_score || 0);
  const gaps = profile.competency_gaps || [];
  const extraCreditCount = Number(profile.extra_credit_count || 0);

  const allStrengths = wfbUnionIndicatorTags_(signals, "strengths");
  const allGaps = wfbUnionIndicatorTags_(signals, "gaps");

  if (avgEngagement >= 2.5 && extraCreditCount >= 1 && !wfbHasPersistentGap_(signals)) {
    return WFB_ARCHETYPES.PROVOCATION;
  }
  if (avgEngagement >= 2.5 &&
      (allStrengths.indexOf("analysis") !== -1 || allStrengths.indexOf("critical_thinking") !== -1) &&
      allGaps.indexOf("application") !== -1) {
    return WFB_ARCHETYPES.PARADOX;
  }
  if (avgEngagement >= 1.5 &&
      (allGaps.indexOf("analysis") !== -1 || allGaps.indexOf("critical_thinking") !== -1) &&
      allStrengths.indexOf("application") !== -1) {
    return WFB_ARCHETYPES.CONCRETE_SCENARIO;
  }
  if (gaps.length > 0) {
    return WFB_ARCHETYPES.BRIDGE;
  }

  // Only reachable when every competency is already addressed AND none of the
  // three conditions above matched — a case the spec's fallback language
  // ("BRIDGE, then CONCRETE SCENARIO, then PARADOX") doesn't precisely
  // anticipate, since BRIDGE is ruled out by definition here.
  if (allGaps.length > 0 || allStrengths.length > 0) return WFB_ARCHETYPES.CONCRETE_SCENARIO;
  return WFB_ARCHETYPES.PARADOX;
}

// shadow_matrix.best_archetype is free text written by
// 23_StudentProfileManager.js, so normalize defensively — the HTML spec's
// prose uses "CONCRETE SCENARIO" with a space where this file uses an
// underscore.
function wfbNormalizeArchetypeName_(raw) {
  const upper = String(raw).toUpperCase().replace(/\s+/g, "_");
  if (upper === "CONCRETE" || upper === "CONCRETE_SCENARIO") return WFB_ARCHETYPES.CONCRETE_SCENARIO;
  if (upper === "PARADOX") return WFB_ARCHETYPES.PARADOX;
  if (upper === "BRIDGE") return WFB_ARCHETYPES.BRIDGE;
  if (upper === "PROVOCATION") return WFB_ARCHETYPES.PROVOCATION;
  return WFB_ARCHETYPES.BRIDGE; // safest default for an unrecognized value
}

function wfbUnionIndicatorTags_(signals, key) {
  const out = [];
  for (let i = 0; i < signals.length; i++) {
    const indicators = signals[i] && signals[i].indicators;
    const tags = (indicators && indicators[key]) || [];
    for (let j = 0; j < tags.length; j++) {
      if (out.indexOf(tags[j]) === -1) out.push(tags[j]);
    }
  }
  return out;
}

// "No persistent gaps" read as: no single gap tag recurs across 2 or more of
// the (up to 3) evaluation_signals entries. An interpretive choice the step
// flagged as its own; kept identical so the same student gets the same
// archetype before and after this port.
function wfbHasPersistentGap_(signals) {
  const counts = {};
  for (let i = 0; i < signals.length; i++) {
    const indicators = signals[i] && signals[i].indicators;
    const gaps = (indicators && indicators.gaps) || [];
    for (let j = 0; j < gaps.length; j++) {
      counts[gaps[j]] = (counts[gaps[j]] || 0) + 1;
      if (counts[gaps[j]] >= 2) return true;
    }
  }
  return false;
}

// Prefers the newer competency_rubrics structure when present (Script 32's
// addRubricsToSnapshot_), falls back to competency_texts — both appear in a
// live snapshot depending on when that call last succeeded, since
// 24_WarmUpBridge.js falls back if it throws.
function wfbFormatCompetencyTexts_(lesson) {
  const items = lesson.competency_rubrics || lesson.competency_texts || [];
  if (!items.length) return "";
  const lines = [];
  for (let i = 0; i < items.length; i++) {
    lines.push("- " + (items[i].id || "") + ": " + (items[i].text || ""));
  }
  return lines.join("\n");
}

function wfbFormatList_(arr) {
  if (!arr || !arr.length) return "None";
  return arr.join(", ");
}

function wfbFormatEvaluationSignals_(signals) {
  if (!signals || !signals.length) return "No prior evaluation history.";
  const lines = [];
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    const indicators = s.indicators || {};
    lines.push(
      "- " + (s.date || "") + ": " + (s.note || "") +
      " (strengths: " + wfbFormatList_(indicators.strengths) +
      "; gaps: " + wfbFormatList_(indicators.gaps) + ")"
    );
  }
  return lines.join("\n");
}

/**
 * Everything Flow 3's system prompt interpolates, as one flat object of
 * plain strings. Pure — no sheet or Drive access — so the whole archetype
 * decision is unit-testable without a live queue.
 */
function wfbBuildFlow3Fields_(lesson, profile) {
  const mode = (lesson.warmup_anchor !== null && lesson.warmup_anchor !== undefined &&
    lesson.warmup_anchor !== "") ? "A" : "B";
  const addressed = (profile.competencies_addressed || []).length;
  const gapCount = (profile.competency_gaps || []).length;

  return {
    mode: mode,
    archetype: wfbSelectArchetype_(lesson, profile),
    firstName: String(profile.student_name || "").trim().split(/\s+/)[0] || "",
    warmupAnchor: lesson.warmup_anchor || "",
    pacingUnitName: lesson.pacing_unit_name || "",
    pacingStage: lesson.pacing_stage != null ? String(lesson.pacing_stage) : "",
    courseObjective: lesson.course_objective || "",
    pacingPriorConnection: lesson.pacing_prior_connection || "",
    pacingKeyVocabulary: lesson.pacing_key_vocabulary || "",
    courseName: lesson.course_name || "",
    objective: lesson.objective || "",
    activity: lesson.activity || "",
    vocabulary: lesson.vocabulary || "",
    priorConnection: lesson.prior_connection || "",
    competencyTexts: wfbFormatCompetencyTexts_(lesson),
    competencyGaps: wfbFormatList_(profile.competency_gaps),
    evaluationSignals: wfbFormatEvaluationSignals_(profile.evaluation_signals),
    avgEngagementScore: String(profile.avg_engagement_score != null ? profile.avg_engagement_score : 0),
    extraCreditCount: String(profile.extra_credit_count != null ? profile.extra_credit_count : 0),
    shadowArchetypeNote: profile.shadow_archetype_note || "",
    competenciesAddressedCount: String(addressed),
    totalCompetencies: String(addressed + gapCount),
  };
}

// ── Shared plumbing ──────────────────────────────────────────────────────────

function wfbLedger_() {
  const cfg = getConfig_();
  return { cfg: cfg, ss: SpreadsheetApp.openById(cfg.ledgerSsId) };
}

function wfbTab_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Self-heal an empty header row rather than writing rows under nothing.
  // Deliberately does NOT rewrite a populated-but-different header row: that
  // relabels existing rows without moving their values, which hides a
  // mismatch instead of fixing it. Same reasoning as leader-hub's
  // repairAiQueueSchema() refusing while data rows are present.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function wfbFindQueueRow_(wqSheet, queueId) {
  const lastRow = wqSheet.getLastRow();
  if (lastRow <= 1) return null;
  const data = wqSheet.getRange(2, 1, lastRow - 1, WQ25_COL_COUNT).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][WQ25_QUEUE_ID]).trim() === queueId) {
      return { sheetRow: i + 2, row: data[i] };
    }
  }
  return null;
}

// Gemini wraps JSON in a ```json fence even when told not to. Same treatment
// evaluateWarmUpDoc_'s neighbours already apply before JSON.parse.
function wfbStripFence_(text) {
  let t = String(text == null ? "" : text).trim();
  if (t.indexOf("```") !== 0) return t;
  t = t.replace(/^```[A-Za-z0-9_-]*\s*/, "");
  const close = t.lastIndexOf("```");
  if (close !== -1) t = t.substring(0, close);
  return t.trim();
}

function wfbExistingInputIds_(sheet) {
  const seen = {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return seen;
  const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i][0]).trim();
    if (id) seen[id] = true;
  }
  return seen;
}

// ── Phase 1: materialize inputs ──────────────────────────────────────────────

/**
 * Writes one flat literal input row per WarmUpQueue row that is sitting at a
 * flow's trigger status and does not already have one. Time trigger.
 *
 * Idempotent by QueueID per tab, so a row already materialized is never
 * duplicated — which matters because a Flow reading two input rows for the
 * same student would generate two warm-up docs.
 */
function buildWarmUpFlowInputs() {
  const result = { flow3: 0, flow4: 0, flow5: 0, skipped: 0, errors: 0 };
  const ctx = wfbLedger_();
  const wqSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpQueue);
  if (!wqSheet) {
    Logger.log("[WFB] WarmUpQueue tab not found — aborting.");
    return result;
  }
  const lastRow = wqSheet.getLastRow();
  if (lastRow <= 1) return result;

  const data = wqSheet.getRange(2, 1, lastRow - 1, WQ25_COL_COUNT).getValues();
  const tabs = {
    3: wfbTab_(ctx.ss, WFB_INPUT_TABS[3], WFB_FLOW3_HEADERS),
    4: wfbTab_(ctx.ss, WFB_INPUT_TABS[4], WFB_FLOW4_HEADERS),
    5: wfbTab_(ctx.ss, WFB_INPUT_TABS[5], WFB_FLOW5_HEADERS),
  };
  const seen = {
    3: wfbExistingInputIds_(tabs[3]),
    4: wfbExistingInputIds_(tabs[4]),
    5: wfbExistingInputIds_(tabs[5]),
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const status = String(row[WQ25_STATUS] || "").trim();
    const queueId = String(row[WQ25_QUEUE_ID] || "").trim();
    if (!queueId) continue;

    let flow = 0;
    if (status === WFB_TRIGGER_STATUS[5]) flow = 5;
    else if (status === WFB_TRIGGER_STATUS[3]) flow = 3;
    else if (status === WFB_TRIGGER_STATUS[4]) flow = 4;
    if (!flow) continue;

    if (seen[flow][queueId]) { result.skipped++; continue; }

    try {
      if (flow === 5) {
        if (wfbBuildFlow5Row_(tabs[5], row, queueId)) result.flow5++;
        else result.skipped++;
      } else if (flow === 3) {
        if (wfbBuildFlow3Row_(tabs[3], row, queueId)) result.flow3++;
        else result.skipped++;
      } else {
        if (wfbBuildFlow4Row_(tabs[4], row, queueId)) result.flow4++;
        else result.skipped++;
      }
      seen[flow][queueId] = true;
    } catch (e) {
      result.errors++;
      Logger.log("[WFB] " + queueId + " (flow " + flow + ") input build failed: " + e.message);
    }
  }

  Logger.log("[WFB] buildWarmUpFlowInputs: " + JSON.stringify(result));
  return result;
}

function wfbBuildFlow5Row_(sheet, row, queueId) {
  let lesson;
  try {
    lesson = JSON.parse(String(row[WQ25_LESSON_CTX_SNAP] || "{}"));
  } catch (e) {
    Logger.log("[WFB] " + queueId + " flow 5: LESSON_SNAPSHOT_PARSE_FAILED");
    return false;
  }
  const prior = lesson.flow5_prior_response;
  if (prior === null || prior === undefined || String(prior).trim() === "") {
    // The trigger status alone can select a row with no prior response; the
    // step this replaces returned NO_PRIOR_RESPONSE_IN_SNAPSHOT here. There
    // is nothing to bridge from, so no input row is written and the Flow is
    // never handed a job it cannot do.
    Logger.log("[WFB] " + queueId + " flow 5: no prior response in snapshot — skipped");
    return false;
  }
  sheet.appendRow([
    new Date(), queueId, "READY",
    String(prior), lesson.pacing_prior_connection || "", lesson.course_name || "",
    wfbPromptFor_(5, {}),
  ]);
  return true;
}

function wfbBuildFlow3Row_(sheet, row, queueId) {
  let lesson, profile;
  try {
    lesson = JSON.parse(String(row[WQ25_LESSON_CTX_SNAP] || "{}"));
  } catch (e) {
    Logger.log("[WFB] " + queueId + " flow 3: LESSON_SNAPSHOT_PARSE_FAILED");
    return false;
  }
  try {
    profile = JSON.parse(String(row[WFB_PROFILE_SNAP] || "{}"));
  } catch (e) {
    Logger.log("[WFB] " + queueId + " flow 3: PROFILE_SNAPSHOT_PARSE_FAILED");
    return false;
  }

  const f = wfbBuildFlow3Fields_(lesson, profile);
  sheet.appendRow([
    new Date(), queueId, "READY",
    f.mode, f.archetype, f.firstName, f.warmupAnchor,
    f.pacingUnitName, f.pacingStage, f.courseObjective, f.pacingPriorConnection,
    f.pacingKeyVocabulary, f.courseName, f.objective, f.activity, f.vocabulary,
    f.priorConnection, f.competencyTexts, f.competencyGaps, f.evaluationSignals,
    f.avgEngagementScore, f.extraCreditCount, f.shadowArchetypeNote,
    f.competenciesAddressedCount, f.totalCompetencies,
    String(row[WQ25_BRIDGE_OUTPUT] || ""),
    String(row[WQ25_GOOGLE_ID] || ""), String(row[WQ25_STUDENT_NAME] || ""),
    row[WQ25_LESSON_DATE],
    wfbPromptFor_(3, f),
  ]);
  return true;
}

function wfbBuildFlow4Row_(sheet, row, queueId) {
  const docId = String(row[WQ25_DOC_ID] || "").trim();
  if (!docId) {
    Logger.log("[WFB] " + queueId + " flow 4: no Doc_ID on the row — skipped");
    return false;
  }
  // Reuses 25_WarmUpWriter.js rather than re-reading the doc: this is exactly
  // what ExtractWarmUpPromptTextStep was re-implementing, and the marker
  // strings it searches for are the ones wfbCreateWarmUpDoc_ writes.
  const extracted = evaluateWarmUpDoc_(docId, queueId);
  if (extracted && extracted.error) {
    Logger.log("[WFB] " + queueId + " flow 4: " + extracted.error);
    return false;
  }
  const originalPrompt = (extracted && extracted.promptText) || "";
  const responseText = (extracted && extracted.responseText) ||
    String(row[WQ25_RESPONSE_TEXT] || "");

  sheet.appendRow([
    new Date(), queueId, "READY",
    originalPrompt, responseText,
    Number(row[WQ25_WORD_COUNT_SCORE] || 0), Number(row[WQ25_EXTRA_CREDIT] || 0), docId,
    wfbPromptFor_(4, { originalPrompt: originalPrompt }),
  ]);
  return true;
}

/**
 * The system prompt for a flow, pre-substituted, with any placeholder the
 * Flow itself must fill left standing.
 *
 * Resolves through 40_FlowPrompts.js so a prompt change stays a `clasp push`
 * plus one function run. Returns "" rather than throwing when that file is
 * absent, because an input row with no prompt is still a useful diagnostic —
 * the Flow can carry a pasted prompt as it always could.
 */
function wfbPromptFor_(flow, vars) {
  if (typeof substituteFlowPrompt_ !== "function") return "";
  let template = "";
  if (flow === 5 && typeof FLOW_5_PROMPT === "string") template = FLOW_5_PROMPT;
  if (flow === 4 && typeof FLOW_4_PROMPT === "string") template = FLOW_4_PROMPT;
  if (flow === 3) {
    // Flow 3 has two prompts: Mode A is anchor-aware, Mode B generative.
    const modeA = (vars && vars.mode === "A");
    if (modeA && typeof FLOW_3_PROMPT_MODE_A === "string") template = FLOW_3_PROMPT_MODE_A;
    if (!modeA && typeof FLOW_3_PROMPT_MODE_B === "string") template = FLOW_3_PROMPT_MODE_B;
  }
  if (!template) return "";
  return substituteFlowPrompt_(template, vars || {}, true);
}

// ── Phase 2: harvest returns ─────────────────────────────────────────────────

/**
 * Applies every unharvested WarmUpFlowReturn row. Time trigger.
 *
 * Failure policy differs from kos-personal's harvest on purpose: cas-ccps's
 * flows DO write a failure marker (status ERROR / EVAL_ERROR), because that
 * is what CreateWarmUpDocStep and FinalizeWarmUpScoreStep did and what the
 * teacher-facing dashboards read. Retrying is bounded by WFB_MAX_ATTEMPTS
 * rather than by a staleness guard.
 */
function harvestWarmUpFlowReturns() {
  const result = { applied: 0, skipped: 0, failed: 0, attention: 0, pruned: 0 };
  const ctx = wfbLedger_();
  const returns = wfbTab_(ctx.ss, WFB_RETURN_TAB, WFB_RETURN_HEADERS);
  const lastRow = returns.getLastRow();
  if (lastRow <= 1) return result;

  const wqSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpQueue);
  const wrSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpRegistry);
  if (!wqSheet) {
    Logger.log("[WFB] WarmUpQueue tab not found — aborting harvest.");
    return result;
  }

  const data = returns.getRange(2, 1, lastRow - 1, WFB_RETURN_HEADERS.length).getValues();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const sheetRow = i + 2;
    const hs = String(row[WFB_RET.HARVEST_STATUS] || "").trim();
    if (hs === "HARVESTED" || hs === "FAILED" || hs === "NEEDS_ATTENTION") {
      result.skipped++;
      continue;
    }

    const flow = Number(row[WFB_RET.FLOW] || 0);
    const queueId = String(row[WFB_RET.QUEUE_ID] || "").trim();
    const raw = String(row[WFB_RET.RAW_OUTPUT] || "");
    const attempts = Number(row[WFB_RET.ATTEMPTS] || 0) + 1;

    if (!queueId || [3, 4, 5].indexOf(flow) === -1) {
      wfbMarkReturn_(returns, sheetRow, "FAILED", "Missing QueueID or unknown Flow " + flow, WFB_MAX_ATTEMPTS);
      result.failed++;
      continue;
    }

    let outcome;
    try {
      outcome = wfbApplyReturn_(wqSheet, wrSheet, flow, queueId, raw);
    } catch (e) {
      outcome = { ok: false, error: "UNEXPECTED_ERROR: " + e.message };
    }

    if (outcome.ok) {
      wfbMarkReturn_(returns, sheetRow, "HARVESTED", "", attempts);
      wfbConsumeInputRow_(ctx.ss, flow, queueId);
      result.applied++;
      continue;
    }
    if (outcome.needsAttention) {
      wfbMarkReturn_(returns, sheetRow, "NEEDS_ATTENTION", outcome.error, attempts);
      result.attention++;
      Logger.log("[WFB] " + queueId + " NEEDS ATTENTION: " + outcome.error);
      continue;
    }
    if (attempts >= WFB_MAX_ATTEMPTS) {
      wfbMarkReturn_(returns, sheetRow, "FAILED", outcome.error, attempts);
      wfbWriteQueueStatus_(wqSheet, queueId, flow === 4 ? "EVAL_ERROR" : "ERROR");
      result.failed++;
      Logger.log("[WFB] " + queueId + " failed after " + attempts + ": " + outcome.error);
      continue;
    }
    wfbMarkReturn_(returns, sheetRow, "", outcome.error, attempts);
    result.failed++;
  }

  result.pruned = wfbPruneHarvested_(returns);
  Logger.log("[WFB] harvestWarmUpFlowReturns: " + JSON.stringify(result));
  return result;
}

function wfbApplyReturn_(wqSheet, wrSheet, flow, queueId, raw) {
  const found = wfbFindQueueRow_(wqSheet, queueId);
  if (!found) return { ok: false, error: "No WarmUpQueue row for Queue_ID " + queueId };
  if (String(raw).trim() === "") return { ok: false, error: "Empty model output" };

  if (flow === 5) return wfbApplyFlow5_(wqSheet, found, raw);
  if (flow === 3) return wfbApplyFlow3_(wqSheet, found, queueId, raw);
  return wfbApplyFlow4_(wqSheet, wrSheet, found, queueId, raw);
}

// Flow 5: the bridge paragraph goes in col 20 and the row advances to
// PENDING, which is what hands it to Flow 3.
function wfbApplyFlow5_(wqSheet, found, raw) {
  const status = String(found.row[WQ25_STATUS] || "").trim();
  if (status === "PENDING" || status === "DELIVERED") {
    return { ok: true, duplicate: true }; // already bridged
  }
  wqSheet.getRange(found.sheetRow, WQ25_BRIDGE_OUTPUT + 1).setValue(String(raw).trim());
  wqSheet.getRange(found.sheetRow, WQ25_STATUS + 1).setValue("PENDING");
  SpreadsheetApp.flush();
  return { ok: true };
}

// Flow 3: create the doc, stamp the zones, share it, record doc_id/url and
// DELIVERED. Ported from CreateWarmUpDocStep.
function wfbApplyFlow3_(wqSheet, found, queueId, raw) {
  const row = found.row;
  if (String(row[WQ25_STATUS] || "").trim() === "DELIVERED") {
    return { ok: true, duplicate: true };
  }
  // A doc already recorded means a previous pass got as far as creating one.
  // Retrying would make a SECOND doc for the same student, which is worse
  // than stopping — same category as kos-personal's unretryable state.
  const existingDocId = String(row[WQ25_DOC_ID] || "").trim();
  if (existingDocId) {
    return {
      ok: false, needsAttention: true,
      error: "Doc_ID " + existingDocId + " is already recorded for " + queueId +
        " but the row is not DELIVERED. Retrying would create a second doc for this " +
        "student — set the status by hand after checking the doc.",
    };
  }

  let lesson;
  try {
    lesson = JSON.parse(String(row[WQ25_LESSON_CTX_SNAP] || "{}"));
  } catch (e) {
    return { ok: false, error: "LESSON_SNAPSHOT_PARSE_FAILED" };
  }
  const adminRoot = lesson.admin_root_folder_id;
  const courseName = lesson.course_name || "";
  const teacherName = lesson.teacher_name || "";
  const period = lesson.period != null ? String(lesson.period) : "";
  if (!adminRoot || !courseName || !teacherName || !period) {
    return { ok: false, error: "FOLDER_PATH_FIELDS_MISSING" };
  }

  const studentName = String(row[WQ25_STUDENT_NAME] || "");
  const firstName = studentName.trim().split(/\s+/)[0] || "";
  const dateIso = wfbNormalizeDateIso_(row[WQ25_LESSON_DATE]);
  const dateReadable = wfbFormatReadableDate_(dateIso) || String(row[WQ25_LESSON_DATE]);

  let file;
  try {
    const folder = wfbResolveWarmUpFolder_(adminRoot, courseName, teacherName, period, studentName);
    file = wfbCreateWarmUpDoc_(folder, dateIso, firstName, dateReadable,
      String(raw).trim(), String(row[WQ25_BRIDGE_OUTPUT] || ""));
  } catch (e) {
    return { ok: false, error: "DOC_CREATE_FAILED: " + e.message };
  }

  const shareWith = String(row[WQ25_GOOGLE_ID] || "");
  try {
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    // .invalid is the reserved TLD, so it can never be a real student — this
    // is a fixture row (39_FlowFixtures.js seeds fixture-student@example.invalid).
    // addEditor would throw on an address that cannot exist, parking the row
    // in NEEDS_ATTENTION and making a working fixture look like a bug. Sharing
    // to a nonexistent account is not a capability worth proving; everything
    // before this point — the folder chain, the doc, the zones — is, and it
    // has already happened by now.
    if (/\.invalid$/i.test(shareWith.trim())) {
      Logger.log("[WFB] " + queueId + ": fixture address " + shareWith +
        " — doc created and left unshared, deliberately.");
    } else {
      file.addEditor(shareWith);
    }
  } catch (e) {
    return {
      ok: false, needsAttention: true,
      error: "DOC_SHARE_FAILED: " + e.message + " — the doc exists (" + file.getId() +
        ") but is not shared with the student, and the row is not DELIVERED. Retrying " +
        "would create a second doc.",
    };
  }

  wqSheet.getRange(found.sheetRow, WQ25_DOC_ID + 1).setValue(file.getId());
  wqSheet.getRange(found.sheetRow, WQ25_DOC_URL + 1).setValue(file.getUrl());
  wqSheet.getRange(found.sheetRow, WQ25_STATUS + 1).setValue("DELIVERED");
  SpreadsheetApp.flush();
  return { ok: true };
}

// Flow 4: parse the evaluation JSON, then hand off to Script 25's own
// write-backs rather than a second copy of them.
function wfbApplyFlow4_(wqSheet, wrSheet, found, queueId, raw) {
  const row = found.row;
  if (String(row[WQ25_STATUS] || "").trim() === "SCORED") {
    return { ok: true, duplicate: true };
  }

  let parsed;
  try {
    parsed = JSON.parse(wfbStripFence_(raw));
  } catch (e) {
    return { ok: false, error: "GEMINI_JSON_PARSE_FAILED: " + e.message };
  }

  const grammar = Number(parsed.grammar) || 0;
  const engagement = Number(parsed.engagement) || 0;
  const feedback = String(parsed.feedback || "Your response has been reviewed.");
  const wordCountScore = Number(row[WQ25_WORD_COUNT_SCORE] || 0);
  const extraCredit = Number(row[WQ25_EXTRA_CREDIT] || 0);
  const total = wordCountScore + grammar + engagement + extraCredit;

  writeFinalScores_(wqSheet, found.sheetRow, grammar, engagement, feedback, total);

  // Zone 3 and the registry are best-effort, exactly as the step had it: a
  // scored row with no feedback paragraph is recoverable, an unscored row is
  // not, so neither of these failing undoes the scores above.
  const docId = String(row[WQ25_DOC_ID] || "").trim();
  if (docId) {
    try {
      writeFeedbackToDoc_(docId, feedback, wordCountScore, grammar, engagement, total);
    } catch (e) {
      Logger.log("[WFB] " + queueId + " Zone 3 write failed, scores stand: " + e.message);
    }
  }
  if (wrSheet) {
    try {
      const wrRow = wfbFindRegistryRow_(wrSheet, queueId);
      if (wrRow > 0) writeRegistryScores_(wrSheet, wrRow, total, extraCredit);
      else Logger.log("[WFB] " + queueId + " no WarmUpRegistry row — scores stand");
    } catch (e) {
      Logger.log("[WFB] " + queueId + " registry update failed, scores stand: " + e.message);
    }
  }
  return { ok: true };
}

// ── Flow 3 document construction — ported from CreateWarmUpDocStep.gs ────────

// Folder chain: [Admin Root]/[Course]/[Teacher]/[Period N]/Warm-Ups/[Student]
function wfbResolveWarmUpFolder_(adminRootFolderId, courseName, teacherName, period, studentName) {
  let folder = DriveApp.getFolderById(adminRootFolderId);
  folder = wfbGetOrCreateFolder_(folder, courseName);
  folder = wfbGetOrCreateFolder_(folder, teacherName);
  folder = wfbGetOrCreateFolder_(folder, "Period " + period);
  folder = wfbGetOrCreateFolder_(folder, "Warm-Ups");
  folder = wfbGetOrCreateFolder_(folder, studentName);
  return folder;
}

function wfbGetOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * Stamps Zones 1 and 2 per the spec's "Document structure" section. Zone 3
 * (Feedback) is deliberately NOT written here — the spec is explicit that it
 * is written after Flow 4 evaluates the response.
 *
 * THE MARKER STRINGS ARE LOAD-BEARING, not formatting. evaluateWarmUpDoc_()
 * locates the prompt by searching for "── WARM-UP PROMPT ──" and
 * "── END PROMPT ──", and the response by RESPONSE_ZONE_MARKER. Change any of
 * them here and Flow 4 silently reads an empty response.
 */
function wfbCreateWarmUpDoc_(parentFolder, dateIso, firstName, dateReadable, promptText, bridgeOutput) {
  const doc = DocumentApp.create("Warm-Up " + dateIso + " — " + firstName);
  const file = DriveApp.getFileById(doc.getId());
  parentFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file); // create() always lands in root first

  const body = doc.getBody();
  body.clear();
  body.appendParagraph("Warm-Up — " + dateReadable + " — " + firstName);

  if (bridgeOutput && String(bridgeOutput).trim() !== "") {
    body.appendParagraph(String(bridgeOutput).trim())
      .editAsText().setFontSize(11).setForegroundColor("#5f6368").setItalic(true);
    body.appendParagraph("──────────")
      .editAsText().setFontSize(9).setForegroundColor("#9aa0a6");
  }

  body.appendParagraph("── WARM-UP PROMPT ──")
    .editAsText().setFontSize(12).setForegroundColor("#333333");
  body.appendParagraph(promptText)
    .editAsText().setFontSize(12).setForegroundColor("#333333");
  body.appendParagraph("── END PROMPT ──")
    .editAsText().setFontSize(12).setForegroundColor("#333333");
  body.appendParagraph("");
  body.appendParagraph(RESPONSE_ZONE_MARKER)
    .editAsText().setFontSize(11).setForegroundColor("#202124");

  doc.saveAndClose();
  return file;
}

// Degrades to the raw string rather than throwing when Date parsing fails —
// a Sheets Date cell's exact handed-back shape isn't guaranteed.
function wfbNormalizeDateIso_(raw) {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function wfbFormatReadableDate_(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMMM d, yyyy");
}

// ── Bookkeeping ──────────────────────────────────────────────────────────────

function wfbFindRegistryRow_(wrSheet, queueId) {
  const lastRow = wrSheet.getLastRow();
  if (lastRow <= 1) return -1;
  const data = wrSheet.getRange(2, 1, lastRow - 1, WR_QUEUE_ID + 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][WR_QUEUE_ID]).trim() === queueId) return i + 2;
  }
  return -1;
}

function wfbWriteQueueStatus_(wqSheet, queueId, status) {
  try {
    const found = wfbFindQueueRow_(wqSheet, queueId);
    if (found) wqSheet.getRange(found.sheetRow, WQ25_STATUS + 1).setValue(status);
  } catch (e) {
    Logger.log("[WFB] could not write status " + status + " for " + queueId + ": " + e.message);
  }
}

function wfbMarkReturn_(sheet, sheetRow, harvestStatus, error, attempts) {
  sheet.getRange(sheetRow, WFB_RET.HARVEST_STATUS + 1).setValue(harvestStatus);
  sheet.getRange(sheetRow, WFB_RET.ATTEMPTS + 1).setValue(attempts);
  sheet.getRange(sheetRow, WFB_RET.ERROR + 1).setValue(error || "");
}

// Marks the matching input row CONSUMED once its return is applied, so
// buildWarmUpFlowInputs' idempotence check and checkWarmUpFlowLiveness can
// both tell an outstanding job from a finished one.
function wfbConsumeInputRow_(ss, flow, queueId) {
  const sheet = ss.getSheetByName(WFB_INPUT_TABS[flow]);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const ids = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === queueId) {
      sheet.getRange(i + 2, 3).setValue("CONSUMED");
      return;
    }
  }
}

function wfbPruneHarvested_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const data = sheet.getRange(2, 1, lastRow - 1, WFB_RETURN_HEADERS.length).getValues();
  const cutoff = new Date().getTime() - (WFB_PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  let pruned = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (String(data[i][WFB_RET.HARVEST_STATUS] || "").trim() !== "HARVESTED") continue;
    const at = new Date(data[i][WFB_RET.TIMESTAMP]).getTime();
    if (!at || at > cutoff) continue;
    sheet.deleteRow(i + 2);
    pruned++;
  }
  return pruned;
}

// ── Operations ───────────────────────────────────────────────────────────────

/**
 * Installs both time triggers. Idempotent. Separate from the main setup
 * function so an already-live deployment can pick these up without re-running
 * anything else.
 */
function installWarmUpFlowTriggers() {
  const wanted = [
    { fn: "buildWarmUpFlowInputs", mins: 5 },
    { fn: "harvestWarmUpFlowReturns", mins: 5 },
  ];
  const existing = {};
  ScriptApp.getProjectTriggers().forEach(function (t) {
    existing[t.getHandlerFunction()] = true;
  });
  const installed = [];
  wanted.forEach(function (w) {
    if (existing[w.fn]) return;
    ScriptApp.newTrigger(w.fn).timeBased().everyMinutes(w.mins).create();
    installed.push(w.fn);
  });
  Logger.log("[WFB] installWarmUpFlowTriggers: installed " + JSON.stringify(installed) +
    (installed.length ? "" : " (both already present)"));
  return { installed: installed };
}

/**
 * Per flow: how many jobs are waiting, and has that flow EVER returned
 * anything? The second question is the one that matters and the one the
 * Studio UI cannot answer — a Flow whose trigger matched zero rows reports a
 * green "Run Completed", which is indistinguishable from working.
 */
function checkWarmUpFlowLiveness() {
  const ctx = wfbLedger_();
  const returns = wfbTab_(ctx.ss, WFB_RETURN_TAB, WFB_RETURN_HEADERS);
  const everReturned = { 3: 0, 4: 0, 5: 0 };

  const rLast = returns.getLastRow();
  if (rLast > 1) {
    returns.getRange(2, 1, rLast - 1, WFB_RETURN_HEADERS.length).getValues().forEach(function (r) {
      const f = Number(r[WFB_RET.FLOW] || 0);
      if (everReturned[f] !== undefined) everReturned[f]++;
    });
  }

  const report = { flows: {} };
  [3, 4, 5].forEach(function (flow) {
    const sheet = ctx.ss.getSheetByName(WFB_INPUT_TABS[flow]);
    let ready = 0, consumed = 0;
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
        if (String(r[0]).trim() === "CONSUMED") consumed++;
        else ready++;
      });
    }
    report.flows[flow] = { ready: ready, consumed: consumed,
      returnsSeen: everReturned[flow], everReturned: everReturned[flow] > 0 };
  });

  Logger.log("[WFB] checkWarmUpFlowLiveness: " + JSON.stringify(report.flows));
  [3, 4, 5].forEach(function (flow) {
    const f = report.flows[flow];
    if (!f.everReturned && f.ready > 0) {
      Logger.log("[WFB] Flow " + flow + ": NOTHING has ever been written to " + WFB_RETURN_TAB +
        ", but " + f.ready + " job(s) are waiting in " + WFB_INPUT_TABS[flow] + ". Either the " +
        "Flow is not built, or its last step is not the native \"add row to sheet\" into " +
        WFB_RETURN_TAB + " this harvest reads. A green \"Run Completed\" rules out neither.");
    } else if (!f.everReturned) {
      Logger.log("[WFB] Flow " + flow + ": no returns and nothing waiting — nothing to conclude.");
    }
  });
  return report;
}

// ── Binding probe ────────────────────────────────────────────────────────────

/**
 * Diagnoses whether a Flow's native "add row to sheet" step is bound to the
 * right columns — the one deployment surface nothing else could check.
 *
 * WHY THIS EXISTS. Every other check in this repo verifies the Apps Script
 * side. The Studio side is built by hand in a UI, and until now the only
 * signal about it was checkWarmUpFlowLiveness()'s "nothing has ever come
 * back". That single answer covers four different causes:
 *
 *   1. the Flow was never built
 *   2. its trigger condition is wrong, so it matches no rows
 *   3. it runs and writes, but into the wrong columns
 *   4. it runs and Gemini errors
 *
 * Case 3 is the one that looks most like case 1 and is the easiest to
 * create: WarmUpFlowReturn's columns are bound one at a time in a picker,
 * and a row written one column across is silently invisible to the harvest.
 * This function separates it out by looking at where the values actually
 * LANDED rather than at whether the harvest liked them.
 *
 * Read-only. It also logs the expected binding, so it doubles as the thing to
 * copy from while wiring the step — generated from the same header constants
 * the harvest reads, so it cannot drift from the code the way a hand-written
 * setup document does.
 */
function checkFlowBinding() {
  const ctx = wfbLedger_();
  const report = { returnRows: 0, ok: 0, problems: [], expected: [] };

  // The binding to copy. Derived, not transcribed.
  WFB_RETURN_HEADERS.forEach(function (name, idx) {
    const owner = (idx <= WFB_RET.RAW_OUTPUT) ? 'the Flow writes this' : 'leave EMPTY — the harvest owns it';
    report.expected.push({ column: idx + 1, header: name, owner: owner });
  });
  Logger.log('[WFB] Expected binding for the final "add row to sheet" step, into ' + WFB_RETURN_TAB + ':');
  report.expected.forEach(function (e) {
    Logger.log('[WFB]   col ' + e.column + '  ' + e.header + '  — ' + e.owner);
  });
  Logger.log('[WFB]   Flow must be the literal 3, 4 or 5. QueueID must be the trigger row\'s ' +
    'Queue_ID. RawOutput is the Gemini step\'s output, unmodified.');

  const returns = ctx.ss.getSheetByName(WFB_RETURN_TAB);
  if (!returns || returns.getLastRow() <= 1) {
    Logger.log('[WFB] No rows in ' + WFB_RETURN_TAB + ' yet, so there is no binding to diagnose. ' +
      'That is case 1 or 2 above — the Flow has never written here at all. ' +
      'checkWarmUpFlowLiveness() covers those.');
    return report;
  }

  const wqSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpQueue);
  const knownIds = {};
  if (wqSheet && wqSheet.getLastRow() > 1) {
    wqSheet.getRange(2, WQ25_QUEUE_ID + 1, wqSheet.getLastRow() - 1, 1)
      .getValues().forEach(function (r) {
        const id = String(r[0]).trim();
        if (id) knownIds[id] = true;
      });
  }

  const width = WFB_RETURN_HEADERS.length;
  const data = returns.getRange(2, 1, returns.getLastRow() - 1, width).getValues();
  for (let i = 0; i < data.length; i++) {
    report.returnRows++;
    const row = data[i];
    const issues = _wfbDiagnoseReturnRow_(row, knownIds);
    if (!issues.length) { report.ok++; continue; }
    report.problems.push({ row: i + 2, issues: issues });
  }

  Logger.log('[WFB] checkFlowBinding: ' + report.ok + '/' + report.returnRows +
    ' return row(s) correctly bound');
  report.problems.forEach(function (p) {
    Logger.log('[WFB]   row ' + p.row + ':');
    p.issues.forEach(function (msg) { Logger.log('[WFB]     - ' + msg); });
  });
  if (!report.problems.length && report.returnRows) {
    Logger.log('[WFB] Every row is bound correctly, so a flow still reporting no results is ' +
      'failing inside the Flow itself (case 4) rather than writing to the wrong place.');
  }
  return report;
}

/**
 * Per-row diagnosis. Returns a list of human-readable problems, empty when
 * the row is correctly bound.
 *
 * The shift check is the point: rather than only saying "Flow is blank", it
 * looks for where each expected value actually landed and reports the offset.
 * A one-column shift is by far the most likely mis-binding, and the hardest
 * to see by eye in a picker.
 */
function _wfbDiagnoseReturnRow_(row, knownIds) {
  const issues = [];
  const cell = function (idx) { return String(row[idx] === undefined ? '' : row[idx]).trim(); };

  // Where did a flow number actually land?
  let flowAt = -1;
  for (let i = 0; i < row.length; i++) {
    if (['3', '4', '5'].indexOf(cell(i)) !== -1) { flowAt = i; break; }
  }
  // Where did a known Queue_ID actually land?
  let idAt = -1;
  for (let i = 0; i < row.length; i++) {
    if (knownIds[cell(i)]) { idAt = i; break; }
  }
  // Where did the longest blob land? That is almost certainly the model output.
  //
  // Timestamp is excluded, and that exclusion is load-bearing: a Date cell
  // stringifies to ~50 characters, so without it an EMPTY RawOutput made this
  // pick column 1 and report "your output landed in Timestamp" — a confident
  // wrong answer where "the output is not reaching this row at all" is the
  // useful one. Caught by its own test.
  //
  // The trade: output genuinely bound to column 1 reads as absent rather than
  // as misplaced. That binding is implausible (Timestamp is the first column
  // and the obvious one to leave to `now`), and the Flow/QueueID diagnostics
  // below still fire, so the row is not reported as healthy either way.
  //
  // AND if RawOutput holds anything at all, that is the answer — the
  // heuristic exists only to LOCATE misplaced output, so running it when the
  // output is already in the right place just invents false positives. A
  // terse but valid result (a one-line bridge sentence) is shorter than the
  // threshold and was being read as "nothing is arriving".
  // ...but only when RawOutput's content is not better explained as some
  // OTHER field's value. On a one-column shift, RawOutput holds the Queue_ID,
  // and short-circuiting on "non-empty" would trust that and hide the shift.
  const rawCell = cell(WFB_RET.RAW_OUTPUT);
  const rawLooksLikeAnotherField = !!rawCell &&
    (knownIds[rawCell] || ['3', '4', '5'].indexOf(rawCell) !== -1);
  let blobAt = -1;
  if (rawCell && !rawLooksLikeAnotherField) {
    blobAt = WFB_RET.RAW_OUTPUT;
  } else {
    let blobLen = 0;
    for (let i = 0; i < row.length; i++) {
      if (i === WFB_RET.TIMESTAMP) continue;
      const len = cell(i).length;
      if (len > blobLen && len > 20) { blobLen = len; blobAt = i; }
    }
  }

  if (flowAt === -1) {
    issues.push('No cell holds 3, 4 or 5 — the Flow column is unbound, or bound to a ' +
      'value that is not the literal flow number. The harvest skips any row whose Flow ' +
      'is not 3, 4 or 5.');
  } else if (flowAt !== WFB_RET.FLOW) {
    issues.push('The flow number is in column ' + (flowAt + 1) + ' (' +
      WFB_RETURN_HEADERS[flowAt] + '), expected column ' + (WFB_RET.FLOW + 1) +
      ' (Flow) — your binding is shifted by ' + (flowAt - WFB_RET.FLOW) + ' column(s).');
  }

  if (idAt === -1) {
    const present = cell(WFB_RET.QUEUE_ID);
    issues.push(present
      ? 'QueueID holds "' + present + '", which matches no WarmUpQueue row. Bind it to the ' +
        'trigger row\'s Queue_ID, not to a generated id or a row number.'
      : 'QueueID is empty — the harvest cannot find the queue row to apply the result to.');
  } else if (idAt !== WFB_RET.QUEUE_ID) {
    issues.push('The Queue_ID is in column ' + (idAt + 1) + ' (' + WFB_RETURN_HEADERS[idAt] +
      '), expected column ' + (WFB_RET.QUEUE_ID + 1) + ' (QueueID).');
  }

  if (blobAt === -1) {
    issues.push('No cell holds anything long enough to be model output. The Gemini step\'s ' +
      'output is not reaching this row at all.');
  } else if (blobAt !== WFB_RET.RAW_OUTPUT) {
    issues.push('The model output landed in column ' + (blobAt + 1) + ' (' +
      WFB_RETURN_HEADERS[blobAt] + '), expected column ' + (WFB_RET.RAW_OUTPUT + 1) +
      ' (RawOutput). Everything from HarvestStatus onward belongs to the harvest — ' +
      'writing there also means the harvest reads your output as its own bookkeeping.');
  }

  // The harvest's own columns must arrive empty. A value here is either a
  // mis-binding or a row the harvest has already processed.
  const bookkeeping = [WFB_RET.HARVEST_STATUS, WFB_RET.ATTEMPTS, WFB_RET.ERROR];
  const processed = ['HARVESTED', 'FAILED', 'NEEDS_ATTENTION'].indexOf(cell(WFB_RET.HARVEST_STATUS)) !== -1;
  if (!processed) {
    bookkeeping.forEach(function (idx) {
      const v = cell(idx);
      if (v && idx !== blobAt && String(Number(v)) !== v) {
        issues.push(WFB_RETURN_HEADERS[idx] + ' (column ' + (idx + 1) + ') arrived holding "' +
          v.substring(0, 40) + '" — the Flow should leave it empty.');
      }
    });
  }

  return issues;
}

/**
 * The Flow 2 half. Studio writes into an EXISTING FlowInput row rather than
 * appending, so the mis-binding shape is different: the output lands in some
 * other column of a row that already has 21 populated cells.
 *
 * Heuristic by nature, and reported as such: it looks for a READY row whose
 * GeminiFullOutput is empty while some column that should hold a short
 * literal holds something long and JSON-shaped. That is the signature of an
 * output write bound to the wrong column.
 */
function checkFlow2Binding() {
  const ctx = wfbLedger_();
  const tabName = (ctx.cfg.tabs && ctx.cfg.tabs.flowInput) || 'FlowInput';
  const sheet = ctx.ss.getSheetByName(tabName);
  const report = { rows: 0, awaitingOutput: 0, suspected: [] };
  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log('[WFB] checkFlow2Binding: no ' + tabName + ' rows to diagnose.');
    return report;
  }

  Logger.log('[WFB] Flow 2 writes its result INTO the trigger row, not a new one. Bind the ' +
    'output step to column ' + (FI.GEMINI_FULL_OUTPUT + 1) + ' (GeminiFullOutput) and change ' +
    'nothing else on the row.');

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, FI.PROMPT_TEXT + 1).getValues();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    report.rows++;
    if (String(row[FI.GEMINI_FULL_OUTPUT] || '').trim()) continue; // output arrived where expected
    if (String(row[FI.READY_STATUS] || '').trim() !== 'READY') continue;
    report.awaitingOutput++;

    // Columns that should hold a short-ish literal. PromptText is excluded —
    // it is legitimately long.
    for (let c = 0; c <= FI.MILESTONE_4_COMPETENCY_ID; c++) {
      const v = String(row[c] === undefined ? '' : row[c]).trim();
      if (v.length < 400) continue;
      if (v.indexOf('{') === -1 && v.indexOf('```') === -1) continue;
      report.suspected.push({ row: i + 2, column: c + 1, sample: v.substring(0, 60) });
    }
  }

  Logger.log('[WFB] checkFlow2Binding: ' + report.awaitingOutput + ' of ' + report.rows +
    ' row(s) READY with no output yet');
  report.suspected.forEach(function (sus) {
    Logger.log('[WFB]   row ' + sus.row + ': column ' + sus.column + ' holds long JSON-shaped ' +
      'text where a short literal belongs ("' + sus.sample + '…"). The output step is very ' +
      'likely bound to that column instead of GeminiFullOutput (column ' +
      (FI.GEMINI_FULL_OUTPUT + 1) + ').');
  });
  if (report.awaitingOutput && !report.suspected.length) {
    Logger.log('[WFB]   No mis-bound output found. Those rows are waiting on the Flow itself — ' +
      'either it is not built, its trigger does not match READY, or it is erroring.');
  }
  return report;
}

/**
 * Exercises all three flows' Apps Script halves end to end against scratch
 * rows, with Studio stubbed. Cleans up after itself.
 *
 * A pass means the materialization and the harvest are sound, so a remaining
 * failure is in the Flow. It says nothing about whether any Flow exists —
 * checkWarmUpFlowLiveness() is the only thing that does.
 */
function runWarmUpFlowCanary() {
  const steps = [];
  function step(name, pass, detail) { steps.push({ name: name, pass: !!pass, detail: detail || "" }); }

  const ctx = wfbLedger_();
  const wqSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpQueue);
  if (!wqSheet) {
    Logger.log("[WFB] canary aborted: no WarmUpQueue tab");
    return { ok: false, passed: 0, total: 0, steps: [] };
  }
  const returns = wfbTab_(ctx.ss, WFB_RETURN_TAB, WFB_RETURN_HEADERS);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const queueId = WFB_CANARY_PREFIX + stamp;

  try {
    // Pure logic first — no sheet or Drive access needed, and a failure here
    // localises to the ported decision table rather than the plumbing.
    const fields = wfbBuildFlow3Fields_(
      { warmup_anchor: "an anchor", course_name: "CAS", pacing_stage: 2 },
      { student_name: "Test Student", competency_gaps: ["c1"], avg_engagement_score: 1.0 });
    step("Flow 3 fields materialize, Mode A when an anchor is present",
      fields.mode === "A" && fields.firstName === "Test" && fields.archetype === "BRIDGE",
      JSON.stringify({ mode: fields.mode, archetype: fields.archetype }));

    const modeB = wfbBuildFlow3Fields_({ course_name: "CAS" }, { student_name: "X" });
    step("Mode B when there is no anchor", modeB.mode === "B", modeB.mode);

    step("a high-confidence shadow-matrix entry overrides the decision table",
      wfbSelectArchetype_({}, { unit_current: "U1",
        shadow_matrix: { U1: { cross_confidence: 0.9, best_archetype: "concrete scenario" } } })
        === "CONCRETE_SCENARIO",
      "and its free-text spelling is normalized");

    step("a fenced Flow 4 payload parses",
      JSON.parse(wfbStripFence_("```json\n{\"grammar\":2}\n```")).grammar === 2, "");

    // Flow 5 end to end, which needs no Drive access: bridge text in, col 20
    // and PENDING out.
    const snapshot = JSON.stringify({
      flow5_prior_response: "prior", pacing_prior_connection: "connects", course_name: "CAS",
    });
    const wqRow = [];
    for (let i = 0; i < WQ25_COL_COUNT; i++) wqRow.push("");
    wqRow[WQ25_QUEUE_ID] = queueId;
    wqRow[WQ25_LESSON_CTX_SNAP] = snapshot;
    wqRow[WQ25_STATUS] = "PENDING_BRIDGE";
    wqRow[WQ25_STUDENT_NAME] = "Canary Student";
    wqSheet.appendRow(wqRow);

    const built = buildWarmUpFlowInputs();
    step("buildWarmUpFlowInputs materialized a Flow 5 row", built.flow5 >= 1, JSON.stringify(built));

    returns.appendRow([new Date(), 5, queueId, "A bridge paragraph.", "", 0, ""]);
    const harvested = harvestWarmUpFlowReturns();
    step("harvest applied the Flow 5 return", harvested.applied >= 1, JSON.stringify(harvested));

    const after = wfbFindQueueRow_(wqSheet, queueId);
    step("bridge output written and status advanced to PENDING",
      after && String(after.row[WQ25_STATUS]).trim() === "PENDING" &&
      String(after.row[WQ25_BRIDGE_OUTPUT]).indexOf("bridge paragraph") !== -1,
      after ? String(after.row[WQ25_STATUS]) : "row missing");

    returns.appendRow([new Date(), 5, queueId, "A stale second bridge.", "", 0, ""]);
    harvestWarmUpFlowReturns();
    const afterDup = wfbFindQueueRow_(wqSheet, queueId);
    // Reads the QUEUE row, not the return row — an earlier draft of this
    // assertion indexed a WarmUpQueue row with WFB_RET constants, which
    // would have passed for the wrong reason.
    step("a duplicate return does not overwrite the first",
      afterDup && String(afterDup.row[WQ25_BRIDGE_OUTPUT]).indexOf("bridge paragraph") !== -1 &&
      String(afterDup.row[WQ25_BRIDGE_OUTPUT]).indexOf("stale second") === -1,
      afterDup ? String(afterDup.row[WQ25_BRIDGE_OUTPUT]) : "row missing");
  } catch (e) {
    step("canary ran without throwing", false, e.message);
  } finally {
    removeWarmUpFlowFixtures();
  }

  const passed = steps.filter(function (s) { return s.pass; }).length;
  const ok = passed === steps.length;
  Logger.log("[WFB] runWarmUpFlowCanary: " + passed + "/" + steps.length + " passed");
  steps.forEach(function (s) {
    Logger.log("[WFB]   " + (s.pass ? "PASS" : "FAIL") + "  " + s.name + (s.detail ? " — " + s.detail : ""));
  });
  Logger.log("[WFB] Flows 3 and 4 were exercised as pure logic only — both need Drive and a real " +
    "student doc, which a canary must not fabricate. checkWarmUpFlowLiveness() is what tells you " +
    "whether the real Flows return anything.");
  return { ok: ok, passed: passed, total: steps.length, steps: steps };
}

/** Removes every canary row across the queue, the input tabs and the returns. */
function removeWarmUpFlowFixtures() {
  const ctx = wfbLedger_();
  const removed = { queue: 0, inputs: 0, returns: 0 };

  const wqSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpQueue);
  if (wqSheet && wqSheet.getLastRow() > 1) {
    const data = wqSheet.getRange(2, 1, wqSheet.getLastRow() - 1, WQ25_COL_COUNT).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][WQ25_QUEUE_ID] || "").indexOf(WFB_CANARY_PREFIX) !== 0) continue;
      wqSheet.deleteRow(i + 2);
      removed.queue++;
    }
  }

  [3, 4, 5].forEach(function (flow) {
    const sheet = ctx.ss.getSheetByName(WFB_INPUT_TABS[flow]);
    if (!sheet || sheet.getLastRow() <= 1) return;
    const ids = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0] || "").indexOf(WFB_CANARY_PREFIX) !== 0) continue;
      sheet.deleteRow(i + 2);
      removed.inputs++;
    }
  });

  const returns = ctx.ss.getSheetByName(WFB_RETURN_TAB);
  if (returns && returns.getLastRow() > 1) {
    const data = returns.getRange(2, 1, returns.getLastRow() - 1, WFB_RETURN_HEADERS.length).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][WFB_RET.QUEUE_ID] || "").indexOf(WFB_CANARY_PREFIX) !== 0) continue;
      returns.deleteRow(i + 2);
      removed.returns++;
    }
  }

  Logger.log("[WFB] removeWarmUpFlowFixtures: " + JSON.stringify(removed));
  return removed;
}
