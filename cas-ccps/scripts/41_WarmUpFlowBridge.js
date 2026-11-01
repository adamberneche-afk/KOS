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
 * Everything else in all three flows was already native and is untouched:
 * the Sheets trigger and the Gemini call itself.
 *
 * CORRECTION: this used to also claim "the Docs read" was untouched. It
 * isn't, for any of the three — Flow 4's input row already carries
 * evaluateWarmUpDoc_()'s extracted promptText/responseText as flat columns
 * (wfbBuildFlow4Row_ below), and Flows 3/5 read everything from JSON
 * snapshots already sitting on the WarmUpQueue row (wfbBuildFlow3Row_,
 * wfbBuildFlow5Row_). None of the three Studio Flows do their own document
 * read at all — Apps Script materializes that before Studio ever runs, the
 * same shape 37_FlowInputBuilder.js established for Flow 2's rubric/prompt
 * half. An operator building any of these three from the stale claim would
 * wire an unnecessary (and wrong) Docs-connector step that has nothing to
 * bind to.
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
 * pollForFlow4Result_() (25_WarmUpWriter.js, since removed) blocked on
 * Utilities.sleep(15000) twelve times — three minutes of wall clock per row,
 * inside a trigger. Ten students would need thirty minutes of sleeping, well
 * past any Apps Script execution limit, so Flow 4 could never have scaled
 * past a handful of rows even with the custom step working. It turns out
 * nothing ever called it — 35_FlowPreflightAndCanary.js had already noted it
 * as unused — so this port does not have to unwire anything; a note at its
 * definition now says plainly that it must stay dead, and why.
 *
 * What runWarmUpEvaluation() does is park each response at PENDING_EVAL via
 * writePreEvalScores_, which is exactly the state this file collects. It
 * used to call callFlow4_(), a stub that always returned null, and count
 * that as an error on every row; the stub and its unreachable scoring path
 * have been removed.
 *
 * THE TABS, AND WHY NOT NEW WarmUpQueue COLUMNS. WarmUpQueue is 21 columns
 * read by hardcoded WQ*_ index constants in Scripts 23, 24 and 25
 * (WQ25_COL_COUNT === 21 is asserted in several getRange calls). Widening it
 * means touching all three, which is exactly the trade kos-personal's
 * 10_Turnstile.gs refused for the same reason. (Columns after the 21 are
 * fine, since no index or 21-wide write reaches them: 34's archive_status,
 * and 00's delivered_at and answered_at, WQ_TIMING.) So:
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

// RETIRED (2026-11-01): Flow 5 merged into Flow 3, which writes the lead-in.
// No Flow5Input row is written; the headers stay for the tab's old rows
// (retention, 57) and the build spec's retired row (42).
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
// Studio drops runs when many rows change at once ("Couldn't access the
// spreadsheet", 2026-10-18: 38 of 81 warm-ups after the 3:30 build wrote
// every row together). So each 5-minute run writes at most this many input
// rows, retries included: 81 warm-ups take about 40 minutes.
const WFB_INPUTS_PER_RUN = 10;
// A READY input with no return after this long was dropped by Studio. It is
// written again as a new row (an appended row starts Studio; the old row is
// marked RETRIED), at most WFB_MAX_INPUT_RETRIES times.
const WFB_INPUT_RETRY_AFTER_MS = 30 * 60 * 1000;
const WFB_MAX_INPUT_RETRIES = 2;
// A Flow 3 job still without a return after its retries (Studio dropped it,
// or Gemini refused it: "Couldn't complete this type of request", seen
// 2026-10-18/19) gets the teacher's anchor, delivered here, so every student
// has a warm-up. Only while its lesson date hasn't passed.
const WFB_NO_RETURN_REASON = "no return from Studio after " + WFB_MAX_INPUT_RETRIES + " retries";
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
function wfbSelectArchetype_(lesson, profile, opts) {
  const shadowMatrix = profile.shadow_matrix || {};
  const unitCurrent = profile.unit_current || "";
  const shadowEntry = unitCurrent ? shadowMatrix[unitCurrent] : null;

  // P0-02: the cross-unit lock is off unless PIVOT_ARCHETYPE_LOCK enables it
  // (the caller resolves the flag, so this stays pure). Until archetypes were
  // recorded the lock could never fire; now that they are, it would lock a
  // student on one sample after about four full units, so it waits for the
  // v2 rules (P2-04).
  const lockEnabled = !!(opts && opts.lockEnabled);
  if (lockEnabled && shadowEntry && typeof shadowEntry.cross_confidence === "number" &&
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
// ── Baseline warm-ups (D6, the operator, 2026-10-24) ────────────────────────
//
// Every student starts on warm-ups about competencies 1–22, the
// workplace-readiness skills both courses share (same numbers and wording in
// 8175 and 8177), to learn how the student already works: open-ended
// questions that show their professional judgment and the supports they
// already use. A student stays on them until WFB_BASELINE_TARGET of them are
// answered or on their way (delivered, being built or being scored); a blank
// one (INCOMPLETE) doesn't count, so its skill can come back. Each is a
// different skill, in WFB_BASELINE_ORDER. They are set in the course's
// world, not the day's lesson (Mode C), and carry no bridge paragraph.
//
// The WarmUpQueue archetype cell records which skill: "BASELINE 8175-14".
// 23's shadow matrix skips those rows, since they aren't a lesson archetype.
const WFB_ARCHETYPE_BASELINE = "BASELINE";
const WFB_BASELINE_TARGET = 5;
// Initiative, time, teamwork, problem-solving and learning first: the five
// that say most about the supports a student already leans on.
const WFB_BASELINE_ORDER = [3, 14, 10, 2, 13, 5, 7, 6, 1, 12, 15, 20, 21, 11, 4, 8, 9, 19, 18, 17, 16, 22];
// Statuses that count toward the target: answered, or on the way to the
// student. INCOMPLETE (blank), ERROR and NOT_MEETING don't.
const WFB_BASELINE_COUNTED = {
  PENDING: true, PENDING_BRIDGE: true, DELIVERED: true, PENDING_EVAL: true, EVAL_ERROR: true, SCORED: true,
};

// Competencies 1–22 as data/CompetencyRubrics.json words them (identical in
// both courses; warmup-flow-bridge.test.js keeps them in step), with a
// student's wording of each for the prompt and the fallback question.
const WFB_BASELINE_SKILLS = {
  1: { text: "Demonstrate creativity and innovation", skill: "coming up with new ideas",
    indicators: "discussing the importance of creativity and innovation in the workplace; brainstorming and contributing ideas, strategies, and solutions; developing and/or improving products, services, or processes; identifying and allocating available resources" },
  2: { text: "Demonstrate critical thinking and problem-solving", skill: "solving a problem",
    indicators: "recognizing and analyzing problems; evaluating potential solutions and resources; using a logical approach to make decisions and solve problems; implementing effective courses of action" },
  3: { text: "Demonstrate initiative and self-direction", skill: "getting started on something without being told",
    indicators: "recognizing the importance of proactive, independent decision making; identifying workplace needs; completing tasks with minimal direct supervision; applying solutions" },
  4: { text: "Demonstrate integrity", skill: "doing the right thing when no one is watching",
    indicators: "defining integrity; recognizing the importance of having integrity in the workplace; complying with local, state, and federal laws; adhering to workplace policies and procedures; exhibiting honesty, fairness, and respect toward self, others, and property" },
  5: { text: "Demonstrate work ethic", skill: "sticking with work until it's done",
    indicators: "defining work ethic; recognizing the importance of having a strong work ethic; demonstrating diligence (e.g., working with persistence to accomplish a task); maintaining dependability (e.g., being reliable); accounting for one\u2019s decisions and actions; accepting the consequences of decisions and actions" },
  6: { text: "Demonstrate conflict-resolution skills", skill: "working out a disagreement",
    indicators: "Demonstrate conflict-resolution skills" },
  7: { text: "Demonstrate listening and speaking skills", skill: "listening and explaining things clearly",
    indicators: "defining nonverbal cues; employing active listening techniques (e.g., asking clarifying questions, paraphrasing what was said); exhibiting public speaking skills (e.g., making presentations); articulating ideas in a manner appropriate to the setting and audience (e.g., considering the chosen communication method and audience\u2019s level of knowledge)" },
  8: { text: "Demonstrate respect for diversity", skill: "working with people who are different from you",
    indicators: "defining diversity and discussing its importance; identifying individual differences (e.g., age, gender, ethnicity, culture, race, viewpoints, socioeconomic status, and ability); showing respect for and valuing individual differences in the workplace; being self-aware and mindful of one\u2019s own bias; collaborating with people of diverse backgrounds, viewpoints, and experiences" },
  9: { text: "Demonstrate customer service skills", skill: "helping a customer or someone you were serving",
    indicators: "defining customer service (e.g., internal customer service ; external customer service ); identifying the benefits of providing helpful, courteous, and knowledgeable customer service; prioritizing customer service (both within an organization and to external customers and stakeholders); anticipating needs of customers and coworkers; demonstrating how to provide helpful, courteous, and knowledgeable service to address customer and/or coworker needs" },
  10: { text: "Collaborate with team members", skill: "working as part of a team",
    indicators: "defining collaboration and teamwork; discussing the benefits of teamwork; establishing expectations, roles, and goals; contributing to the success of the team by sharing responsibility; respecting the thoughts, opinions, and contributions of other team members" },
  11: { text: "Demonstrate big-picture thinking", skill: "seeing how your part fits the bigger picture",
    indicators: "defining big-picture thinking as an understanding of one's role in fulfilling the mission of the workplace and a consideration of the social, economic, and environmental effects of one's actions; identifying the organization\u2019s structure, culture, policies, and procedures, as well as its role and position within the community, industry, and economy" },
  12: { text: "Demonstrate career- and life-management skills", skill: "planning your goals and next steps",
    indicators: "recognizing the importance of education and career planning (e.g., minimum job qualifications, advancement and professional-development opportunities); identifying available benefits and professional resources (e.g., labor unions, professional organizations, employee-assistance programs, insurance and retirement benefits); managing personal growth and wellness (e.g., stress management, self-care, financial planning); setting goals (e.g., specific, measurable, attainable, realistic, time-bound [SMART] goals)" },
  13: { text: "Demonstrate continuous learning and adaptability", skill: "learning something new or adjusting when things change",
    indicators: "describing the importance of continuous learning; identifying resources for continuous learning (e.g., publications, trade organizations, professional networking, workshops/classes); modifying work performance based on feedback (i.e., being coachable); acquiring industry-related professional skills and knowledge (e.g., credentials/certifications); adapting to changing job requirements" },
  14: { text: "Manage time and resources", skill: "managing your time",
    indicators: "defining efficiency and productivity as they relate to time and resource management; developing a plan of work; differentiating between high- and low-priority tasks; adapting work goals based on time and resources; human (personnel)\u2014capitalizing on strengths; respecting professional goals; capital\u2014maintaining equipment to ensure longevity and efficiency; natural\u2014using responsible and sustainable practices; natural\u2014using responsible and sustainable practices" },
  15: { text: "Demonstrate information-literacy skills", skill: "finding and checking information",
    indicators: "defining information literacy; locating and evaluating credible and relevant sources of information; using information effectively to accomplish work-related tasks" },
  16: { text: "Demonstrate an understanding of information security", skill: "keeping information and accounts safe",
    indicators: "identifying various information types/formats (e.g., paper, electronic); describing cybersecurity (e.g., risks, threats, vulnerabilities); using technology ethically (e.g., appropriately using social networks, managing personal information); abiding by workplace policies (e.g., acceptable use policy [AUP]); protecting confidentiality (e.g., protecting login information and customer information); following workplace security procedures" },
  17: { text: "Maintain working knowledge of current information-technology (IT) systems", skill: "keeping up with the technology you use",
    indicators: "hardware and devices (e.g., peripherals); software and applications; cloud-based services; file-sharing techniques; emerging technologies; troubleshooting protocols and techniques" },
  18: { text: "Demonstrate proficiency with technologies, tools, and machines common to a specific occupation", skill: "learning to use a new tool or app",
    indicators: "Demonstrate proficiency with technologies, tools, and machines common to a specific occupation" },
  19: { text: "Apply mathematical skills to job-specific tasks", skill: "using math to get a real task done",
    indicators: "performing calculations (e.g., percentages, fractions, addition, subtraction, averages, measurement, conversions, monetary transactions); applying mathematical processes to accomplish job-specific tasks (e.g., estimating required supplies, completing expense reports); managing personal finance (e.g., understanding wage rates, paycheck deductions, taxes, sales receipts)" },
  20: { text: "Demonstrate professionalism", skill: "acting professionally",
    indicators: "defining professionalism; practicing punctuality and attendance; adhering to work-schedule expectations; exercising etiquette (e.g., language, manners, and behaviors suitable for the workplace and online; appropriate verbal and nonverbal communication); exhibiting professional self-representation (e.g., using a firm handshake, introducing oneself, making eye contact); maintaining professional appearance (e.g., maintaining personal hygiene, adhering to a dress code)" },
  21: { text: "Demonstrate reading and writing skills", skill: "reading and writing to get something done",
    indicators: "reading and interpreting workplace documents; ability to convey messages with clarity; professional tone, appropriate to audience; grammar; forms and conventions (e.g., formatting documents, using an email signature); forms and conventions (e.g., formatting documents, using an email signature)" },
  22: { text: "Demonstrate workplace safety", skill: "staying safe and keeping others safe",
    indicators: "interpreting safety data sheets (SDS); identifying and using personal protective equipment (PPE); identifying and using personal protective equipment (PPE); maintaining universal precautions (e.g., to protect against bloodborne pathogens); identifying risks and hazards in the workplace; following emergency protocols (e.g., evacuation routes)" },
};

// "BASELINE 8175-14" -> { course: "8175", n: 14 }; anything else -> null.
function wfbParseBaseline_(archetypeCell) {
  const m = String(archetypeCell || "").trim().match(/^BASELINE\s+(\d{4})-(\d{1,2})$/);
  return m && WFB_BASELINE_SKILLS[Number(m[2])] ? { course: m[1], n: Number(m[2]) } : null;
}

// Per student (google_id, lower case): how many baseline warm-ups count
// toward the target, and which skills they used.
function wfbBaselineState_(rows) {
  const out = {};
  rows.forEach(function (row) {
    const b = wfbParseBaseline_(row[WQ25_ARCHETYPE]);
    if (!b) return;
    const gid = String(row[WQ25_GOOGLE_ID] || "").trim().toLowerCase();
    if (!gid) return;
    const st = out[gid] || (out[gid] = { count: 0, asked: {} });
    if (WFB_BASELINE_COUNTED[String(row[WQ25_STATUS] || "").trim()]) {
      st.count++;
      st.asked[b.n] = true;
    }
  });
  return out;
}

// The skill a student's next warm-up asks about, or 0 once they're done.
function wfbBaselineChoice_(state) {
  const st = state || { count: 0, asked: {} };
  if (st.count >= WFB_BASELINE_TARGET) return 0;
  for (let i = 0; i < WFB_BASELINE_ORDER.length; i++) {
    if (!st.asked[WFB_BASELINE_ORDER[i]]) return WFB_BASELINE_ORDER[i];
  }
  return 0;
}

// The question written by code: what a student gets when Flow 3's output
// for a baseline warm-up fails the checks, never a lesson anchor.
function wfbBaselineQuestion_(n) {
  const sk = WFB_BASELINE_SKILLS[n];
  if (!sk) return "";
  return "Think of a real time, at school, on a team, at a job or at home, that involved " + sk.skill +
    ". What did you do, and what helped you do it?";
}

function wfbBuildBaselineFields_(lesson, profile, n) {
  const sk = WFB_BASELINE_SKILLS[n];
  const course = courseCodeFromName_(lesson.course_name) || "8175";
  return {
    mode: "C",
    archetype: WFB_ARCHETYPE_BASELINE,
    archetypeCell: WFB_ARCHETYPE_BASELINE + " " + course + "-" + n,
    firstName: String(profile.student_name || "").trim().split(/\s+/)[0] || "",
    courseName: lesson.course_name || "",
    baselineCompetency: sk.text,
    baselineSkill: sk.skill,
    baselineIndicators: sk.indicators,
    priorResponse: "", // a baseline warm-up has no lead-in
  };
}

function wfbBuildFlow3Fields_(lesson, profile, opts) {
  const mode = (lesson.warmup_anchor !== null && lesson.warmup_anchor !== undefined &&
    lesson.warmup_anchor !== "") ? "A" : "B";
  const addressed = (profile.competencies_addressed || []).length;
  const gapCount = (profile.competency_gaps || []).length;

  return {
    mode: mode,
    archetype: wfbSelectArchetype_(lesson, profile, opts),
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
    // The student's last answer, for the lead-in (Flow 5 merged in,
    // 2026-11-01); blank for a first warm-up.
    priorResponse: String(lesson.flow5_prior_response || "").trim(),
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

// READY input rows older than WFB_INPUT_RETRY_AFTER_MS with nothing in
// WarmUpFlowReturn for their QueueID: Studio dropped the run. Each is copied
// to a new row (timestamp now, READY) and the old row marked RETRIED, up to
// WFB_MAX_INPUT_RETRIES per QueueID and `budget` per call. Returns the count.
function wfbRetryStaleInputs_(ss, tabs, budget, now) {
  if (budget <= 0) return 0;
  const returned = { 3: {}, 4: {}, 5: {} };
  const ret = ss.getSheetByName(WFB_RETURN_TAB);
  if (ret && ret.getLastRow() > 1) {
    ret.getRange(2, 1, ret.getLastRow() - 1, WFB_RETURN_HEADERS.length).getValues().forEach(function (r) {
      const f = Number(r[WFB_RET.FLOW]);
      if (returned[f]) returned[f][String(r[WFB_RET.QUEUE_ID]).trim()] = true;
    });
  }
  let retried = 0;
  // Not Flow 5 (retired 2026-11-01): a re-added Flow5Input row would wake it.
  [3, 4].forEach(function (flow) {
    const sheet = tabs[flow];
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1 || retried >= budget) return;
    const width = sheet.getLastColumn();
    const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    const tries = {};
    rows.forEach(function (r) {
      if (String(r[2]).trim() === "RETRIED") {
        const id = String(r[1]).trim();
        tries[id] = (tries[id] || 0) + 1;
      }
    });
    for (let i = 0; i < rows.length && retried < budget; i++) {
      const r = rows[i];
      const id = String(r[1]).trim();
      if (!id || String(r[2]).trim() !== "READY" || returned[flow][id]) continue;
      const at = new Date(r[0]).getTime();
      if (!isNaN(at) && now.getTime() - at < WFB_INPUT_RETRY_AFTER_MS) continue;
      if ((tries[id] || 0) >= WFB_MAX_INPUT_RETRIES) continue;
      const copy = r.slice();
      copy[0] = now;
      sheet.getRange(i + 2, 3).setValue("RETRIED");
      sheet.appendRow(copy);
      tries[id] = (tries[id] || 0) + 1;
      retried++;
    }
  });
  if (retried) Logger.log("[WFB] Retried " + retried + " input row(s) Studio had not returned.");
  return retried;
}

// Flow 3 READY inputs that have had every retry and are stale again: the
// teacher's anchor is delivered instead (wfbApplyFlow3_, as for a return),
// a WarmUpFlowReturn row notes ANCHOR_FALLBACK for 34c, and the input is
// CONSUMED. Skips a job already delivered, one whose lesson date has passed,
// and one not PENDING (NOT_MEETING, ERROR). Returns the count delivered.
function wfbFallbackExhaustedInputs_(ss, flow3Tab, wqSheet, now) {
  const lastRow = flow3Tab.getLastRow();
  if (lastRow <= 1 || !wqSheet) return 0;
  const returned = {};
  const ret = wfbTab_(ss, WFB_RETURN_TAB, WFB_RETURN_HEADERS);
  if (ret.getLastRow() > 1) {
    ret.getRange(2, 1, ret.getLastRow() - 1, WFB_RETURN_HEADERS.length).getValues().forEach(function (r) {
      if (Number(r[WFB_RET.FLOW]) === 3) returned[String(r[WFB_RET.QUEUE_ID]).trim()] = true;
    });
  }
  const rows = flow3Tab.getRange(2, 1, lastRow - 1, 3).getValues();
  const tries = {};
  rows.forEach(function (r) {
    if (String(r[2]).trim() === "RETRIED") tries[String(r[1]).trim()] = (tries[String(r[1]).trim()] || 0) + 1;
  });
  const today = formatDateYMD_(now);
  let delivered = 0;
  rows.forEach(function (r) {
    const id = String(r[1]).trim();
    if (!id || String(r[2]).trim() !== "READY" || returned[id]) return;
    if ((tries[id] || 0) < WFB_MAX_INPUT_RETRIES) return;
    const at = new Date(r[0]).getTime();
    if (!isNaN(at) && now.getTime() - at < WFB_INPUT_RETRY_AFTER_MS) return;
    const found = wfbFindQueueRow_(wqSheet, id);
    if (!found || String(found.row[WQ25_STATUS] || "").trim() !== "PENDING") return;
    if (wfbNormalizeDateIso_(found.row[WQ25_LESSON_DATE]) < today) return;
    const out = wfbApplyFlow3_(wqSheet, found, id, "", WFB_NO_RETURN_REASON);
    if (!out.ok) return; // no anchor, or a doc that can't be made: left for 34c's stall line
    ret.appendRow([now, 3, id, "", "HARVESTED", 0, WFB_ANCHOR_FALLBACK + ": " + WFB_NO_RETURN_REASON]);
    wfbConsumeInputRow_(ss, 3, id);
    returned[id] = true;
    delivered++;
  });
  if (delivered) Logger.log("[WFB] Delivered the teacher's anchor for " + delivered + " Flow 3 job(s) " +
    "Studio never returned.");
  return delivered;
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
  const result = { flow3: 0, flow4: 0, skipped: 0, errors: 0, retried: 0, deferred: 0, fallback: 0 };
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
  };
  const seen = {
    3: wfbExistingInputIds_(tabs[3]),
    4: wfbExistingInputIds_(tabs[4]),
  };

  // Dropped jobs first: they are the oldest.
  result.retried = wfbRetryStaleInputs_(ctx.ss, tabs, WFB_INPUTS_PER_RUN, new Date());
  result.fallback = wfbFallbackExhaustedInputs_(ctx.ss, tabs[3], wqSheet, new Date());
  let budget = WFB_INPUTS_PER_RUN - result.retried;
  let textBox = null; // WarmUpTextBox rows, read once if a Flow 4 job needs them
  const baseline = wfbBaselineState_(data); // D6: who is still on baseline warm-ups

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const status = String(row[WQ25_STATUS] || "").trim();
    const queueId = String(row[WQ25_QUEUE_ID] || "").trim();
    if (!queueId) continue;

    // Flow 5 is retired (2026-11-01, merged into Flow 3): no Flow5Input row
    // is written. A row 24 queued at PENDING_BRIDGE before then goes to
    // Flow 3 like any PENDING row, and Flow 3 writes its lead-in.
    let flow = 0;
    if (status === WFB_TRIGGER_STATUS[3] || status === WFB_TRIGGER_STATUS[5]) flow = 3;
    else if (status === WFB_TRIGGER_STATUS[4]) flow = 4;
    if (!flow) continue;

    if (seen[flow][queueId]) { result.skipped++; continue; }
    if (budget <= 0) { result.deferred++; continue; }

    try {
      if (flow === 3) {
        const gid = String(row[WQ25_GOOGLE_ID] || "").trim().toLowerCase();
        const kept = wfbParseBaseline_(row[WQ25_ARCHETYPE]); // a rebuild keeps its skill
        // The canary's fixture student (an .invalid address, 39) keeps the
        // lesson warm-up, so the canary still runs Modes A and B.
        const n = kept ? kept.n : (/\.invalid$/.test(gid) ? 0 : wfbBaselineChoice_(baseline[gid]));
        const archetype = wfbBuildFlow3Row_(tabs[3], row, queueId, n);
        if (archetype && n && !kept && gid) {
          const st = baseline[gid] || (baseline[gid] = { count: 0, asked: {} });
          st.count++;
          st.asked[n] = true;
        }
        if (archetype) {
          result.flow3++;
          // FIX (P0-02): nothing used to write the chosen archetype back, so
          // 23's shadow matrix never saw one and every student got BRIDGE
          // from the early-unit rule forever. Written once, here, where the
          // choice is made; 25's full-row writes re-read the row first, so
          // they keep it.
          if (!String(row[WQ25_ARCHETYPE] || "").trim()) {
            wqSheet.getRange(i + 2, WQ25_ARCHETYPE + 1).setValue(archetype);
          }
        } else {
          result.skipped++;
        }
      } else {
        if (!textBox) textBox = readWarmUpTextBox_(ctx.ss);
        if (wfbBuildFlow4Row_(tabs[4], row, queueId, textBox[queueId])) result.flow4++;
        else result.skipped++;
      }
      seen[flow][queueId] = true;
      budget--;
    } catch (e) {
      result.errors++;
      Logger.log("[WFB] " + queueId + " (flow " + flow + ") input build failed: " + e.message);
    }
  }

  Logger.log("[WFB] buildWarmUpFlowInputs: " + JSON.stringify(result));
  return result;
}

// baselineN: a competency 1–22 for a baseline warm-up (Mode C), or 0.
function wfbBuildFlow3Row_(sheet, row, queueId, baselineN) {
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

  const courseCode = courseCodeFromName_(lesson.course_name);
  const lockEnabled = pivotFlagFor_("PIVOT_ARCHETYPE_LOCK", courseCode);
  const f = baselineN && WFB_BASELINE_SKILLS[baselineN]
    ? wfbBuildBaselineFields_(lesson, profile, baselineN)
    : wfbBuildFlow3Fields_(lesson, profile, { lockEnabled: lockEnabled });
  sheet.appendRow([
    new Date(), queueId, "READY",
    f.mode, f.archetype, f.firstName, f.warmupAnchor,
    f.pacingUnitName, f.pacingStage, f.courseObjective, f.pacingPriorConnection,
    f.pacingKeyVocabulary, f.courseName, f.objective, f.activity, f.vocabulary,
    f.priorConnection, f.competencyTexts, f.competencyGaps, f.evaluationSignals,
    f.avgEngagementScore, f.extraCreditCount, f.shadowArchetypeNote,
    f.competenciesAddressedCount, f.totalCompetencies,
    f.mode === "C" ? "" : String(row[WQ25_BRIDGE_OUTPUT] || ""),
    String(row[WQ25_GOOGLE_ID] || ""), String(row[WQ25_STUDENT_NAME] || ""),
    row[WQ25_LESSON_DATE],
    wfbPromptFor_(3, f),
  ]);
  // The caller records this on the WarmUpQueue row (column 19), where the
  // shadow matrix reads it back ("BASELINE 8175-14" for a baseline one).
  return f.archetypeCell || f.archetype;
}

function wfbBuildFlow4Row_(sheet, row, queueId, tb) {
  const docId = String(row[WQ25_DOC_ID] || "").trim();
  if (!docId && !tb) {
    Logger.log("[WFB] " + queueId + " flow 4: no Doc_ID and no WarmUpTextBox row — skipped");
    return false;
  }
  // Reuses 25_WarmUpWriter.js rather than re-reading the doc: this is exactly
  // what ExtractWarmUpPromptTextStep was re-implementing, and the marker
  // strings it searches for are the ones wfbCreateWarmUpDoc_ writes. A
  // warm-up answered in the text box (WARMUP_TEXT_BOX) has no doc: its
  // prompt and answer are in its WarmUpTextBox row (2026-10-20: every
  // text-box answer was skipped here and sat at PENDING_EVAL).
  const extracted = docId ? evaluateWarmUpDoc_(docId, queueId) : evaluateWarmUpText_(tb);
  if (extracted && extracted.error) {
    Logger.log("[WFB] " + queueId + " flow 4: " + extracted.error);
    return false;
  }
  const originalPrompt = (extracted && extracted.promptText) || "";
  const responseText = (extracted && extracted.responseText) ||
    String(row[WQ25_RESPONSE_TEXT] || "");

  const wordCountScore = Number(row[WQ25_WORD_COUNT_SCORE] || 0);

  sheet.appendRow([
    new Date(), queueId, "READY",
    originalPrompt, responseText,
    wordCountScore, Number(row[WQ25_EXTRA_CREDIT] || 0), docId,
    wfbPromptFor_(4, {
      originalPrompt: originalPrompt,
      responseText: responseText,
      wordCountScore: String(wordCountScore),
    }),
  ]);
  return true;
}

// Each flow's prompt placeholder -> the field that fills it.
//
// FIX (P0-01, meta/PRD_CAS_RESEARCH_PIVOT.md): the fields used to be handed
// to substituteFlowPrompt_() as-is. It only upper-cases keys, so camelCase
// `warmupAnchor` never matched `{warmup_anchor}` and only {archetype} and
// {objective} were ever filled — Studio, bound to the PromptText chip, would
// have sent Gemini the rest as literal text. The names also differ beyond
// case (competencyTexts fills {competency_texts_formatted}), which is why
// this is an explicit map rather than a case conversion. A placeholder added
// to the spec without a row here fails warmup-flow-bridge.test.js.
const WFB_PROMPT_VARS = {
  3: {
    warmup_anchor: "warmupAnchor",
    pacing_unit_name: "pacingUnitName",
    pacing_stage: "pacingStage",
    course_objective: "courseObjective",
    pacing_prior_connection: "pacingPriorConnection",
    pacing_key_vocabulary: "pacingKeyVocabulary",
    course_name: "courseName",
    objective: "objective",
    activity: "activity",
    vocabulary: "vocabulary",
    prior_connection: "priorConnection",
    competency_texts_formatted: "competencyTexts",
    first_name: "firstName",
    competency_gaps_formatted: "competencyGaps",
    evaluation_signals_formatted: "evaluationSignals",
    avg_engagement_score: "avgEngagementScore",
    extra_credit_count: "extraCreditCount",
    shadow_archetype_note: "shadowArchetypeNote",
    archetype: "archetype",
    competencies_addressed_count: "competenciesAddressedCount",
    total_competencies: "totalCompetencies",
    baseline_competency: "baselineCompetency",
    baseline_skill: "baselineSkill",
    baseline_indicators: "baselineIndicators",
    // The student's last warm-up answer, for Flow 3's lead-in (Flow 5's job
    // until 2026-11-01). Blank for a first warm-up or a baseline one, and
    // then its block drops out (wfbDropBlankLines_).
    prior_response: "priorResponse",
  },
  4: {
    original_prompt_text: "originalPrompt",
    response_text: "responseText",
    word_count_score: "wordCountScore",
  },
  5: {
    flow5_prior_response: "priorResponse",
    pacing_prior_connection: "pacingPriorConnection",
    course_name: "courseName",
  },
};

/**
 * The system prompt for a flow, pre-substituted.
 *
 * Every placeholder in WFB_PROMPT_VARS is filled; one whose field is absent
 * gets "" rather than reaching Gemini as literal text.
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
    // Flow 3 has three prompts: Mode A is anchor-aware, Mode B generative,
    // Mode C the baseline (D6).
    const mode = (vars && vars.mode) || "";
    if (mode === "A" && typeof FLOW_3_PROMPT_MODE_A === "string") template = FLOW_3_PROMPT_MODE_A;
    if (mode === "C" && typeof FLOW_3_PROMPT_MODE_C === "string") template = FLOW_3_PROMPT_MODE_C;
    if (mode !== "A" && mode !== "C" && typeof FLOW_3_PROMPT_MODE_B === "string") template = FLOW_3_PROMPT_MODE_B;
  }
  if (!template) return "";
  const map = WFB_PROMPT_VARS[flow] || {};
  const fields = vars || {};
  const resolved = {};
  Object.keys(map).forEach(function (placeholder) {
    const value = fields[map[placeholder]];
    resolved[placeholder] = (value === null || value === undefined) ? "" : String(value);
  });
  if (flow === 3) template = wfbDropBlankLines_(template, resolved);
  // A student's own words (the answer Flow 4 scores, the prior answer Flow 5
  // builds on) never reach the prompt with system text in them (Docket IV).
  ["response_text", "flow5_prior_response", "prior_response"].forEach(function (k) {
    if (resolved[k]) resolved[k] = neutralizeSystemText_(resolved[k]);
  });
  return substituteFlowPrompt_(template, resolved, true);
}

// D6 (2026-10-24): a line whose every field is blank never reaches Gemini.
// Flow 3's "Stage" and "Competencies" lines were blank for every warm-up
// (the pacing guide was replaced by the teacher's lessons, and a seeded
// lesson carries no competency IDs), so the model read "Stage )" and an
// empty list. A line is kept when any of its fields has a value (filled);
// "(Stage …)" goes when the stage is blank; a block left with only its
// heading goes too.
function wfbDropBlankLines_(template, resolved) {
  const blank = function (name) {
    return Object.prototype.hasOwnProperty.call(resolved, name) && !String(resolved[name]).trim();
  };
  let t = String(template);
  if (blank("pacing_stage")) t = t.replace(/ \(Stage \{pacing_stage\}\)/g, "");
  return t.split("\n\n").map(function (para) {
    let dropped = false;
    const kept = para.split("\n").filter(function (line) {
      const names = (line.match(/\{([a-z_0-9]+)\}/g) || []).map(function (p) { return p.slice(1, -1); })
        .filter(function (nm) { return Object.prototype.hasOwnProperty.call(resolved, nm); });
      if (names.length && names.every(blank)) { dropped = true; return false; }
      return true;
    });
    if (dropped && kept.every(function (line) { return /:\s*$/.test(line); })) return null;
    return kept.join("\n");
  }).filter(function (para) { return para !== null; }).join("\n\n");
}

// ── Plausibility gate ────────────────────────────────────────────────────────
//
// Same defense _fiCheckPlausibility_ (37_FlowInputBuilder.js) added for
// Flow 2: a model can return well-formed output without engaging with what
// it was actually given. Reuses that file's own word-extraction and
// non-access-phrase list directly (_fiDistinguishingWords_,
// FI_NON_ACCESS_PHRASES) rather than a second copy — both files already
// share this GAS project (tools/gas-lint/project-map.json's
// cas-ccps:central-ledger), unlike kos-personal and leader-hub, which each
// had to duplicate the same logic because GAS has no cross-project
// function calls.
//
// NO FERPA BOUNDARY TO ROUTE AROUND HERE, UNLIKE FLOW 2. WarmUpQueue's
// response text (WQ25_RESPONSE_TEXT) is already a documented, retained
// field (docs/FERPA_DATA_MAP.md's WarmUpQueue section) — this project
// already legitimately holds it, so Flow 4's check below compares straight
// against the real response rather than working around a boundary the way
// Flow 2's had to.

function _wfbCollectText_(value, into) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") { into.push(value); return; }
  if (Array.isArray(value)) { value.forEach(function (v) { _wfbCollectText_(v, into); }); return; }
  if (typeof value === "object") {
    Object.keys(value).forEach(function (k) { _wfbCollectText_(value[k], into); });
  }
}

/**
 * @param sourceObj  Whatever this flow's own input actually is — an object,
 *                    values collected recursively.
 * @param outputText The model's raw output text to check.
 * @returns {{ok: true}} or {{ok: false, reason: string}}
 */
function _wfbCheckPlausible_(sourceObj, outputText) {
  const lower = String(outputText || "").toLowerCase();

  const nonAccessHit = FI_NON_ACCESS_PHRASES.find(function (p) { return lower.indexOf(p) !== -1; });
  if (nonAccessHit) {
    return { ok: false, reason: "the model's own output contains a self-reported non-access phrase (\"" +
      nonAccessHit + "\")" };
  }

  const strings = [];
  _wfbCollectText_(sourceObj, strings);
  const candidates = _fiDistinguishingWords_(strings.join(" "));
  if (!candidates.length) return { ok: true }; // nothing distinctive in the source to check against

  const engaged = candidates.some(function (w) { return lower.indexOf(w) !== -1; });
  if (!engaged) {
    return { ok: false, reason: "the output shares none of this row's distinguishing content (e.g. " +
      candidates.slice(0, 6).join(", ") + ")" };
  }
  return { ok: true };
}

// Flow 4's check is looser than the one above (2026-10-20: one of the first
// three text-box answers failed it and sat at EVAL_ERROR). Feedback on a
// student's answer paraphrases it and doesn't repeat a misspelling, so a
// candidate word matches on its first WFB_FLOW4_STEM_CHARS letters, and the
// warm-up's own prompt counts as source too. Feedback on a thin answer may
// honestly say "not enough information", so only the phrases about access
// are checked. Apps Script puts the answer in Flow 4's prompt itself, so a
// model that never saw it is the rarer failure here; the score-range check
// still guards the grade.
const WFB_FLOW4_STEM_CHARS = 5;
const WFB_FLOW4_ANSWER_PHRASES = [
  "insufficient context", "insufficient information", "not enough context",
  "not enough information", "was not given", "was not provided",
];

function wfbFlow4Plausible_(responseText, promptText, feedback) {
  const lower = String(feedback || "").toLowerCase();
  const nonAccessHit = FI_NON_ACCESS_PHRASES.find(function (p) {
    return WFB_FLOW4_ANSWER_PHRASES.indexOf(p) === -1 && lower.indexOf(p) !== -1;
  });
  if (nonAccessHit) {
    return { ok: false, reason: "the model's own output contains a self-reported non-access phrase (\"" +
      nonAccessHit + "\")" };
  }
  const candidates = _fiDistinguishingWords_(String(responseText || "") + " " + String(promptText || ""));
  if (!candidates.length) return { ok: true };
  const engaged = candidates.some(function (w) {
    return lower.indexOf(w.slice(0, WFB_FLOW4_STEM_CHARS)) !== -1;
  });
  if (!engaged) {
    // Counts only: these words are the student's own writing.
    return { ok: false, reason: "the output shares none of the answer's or prompt's distinguishing words (" +
      candidates.length + " checked)" };
  }
  return { ok: true };
}

// Flow 3's check (2026-10-21) asks the same of a warm-up as Flow 4's does of
// feedback, against the lesson text Flow 3 adapts: the anchor, objective,
// activity, vocabulary, unit and prior connections. The whole snapshot was
// the source before, and its 40 longest words were mostly competency rubric
// text, so the teacher's own anchor returned unchanged (which the prompt
// allows) failed for 42 of 67 lessons; about 4 warm-ups a night went out as
// the anchor for it. The course name isn't source: every warm-up shares it.
const WFB_FLOW3_SOURCE_FIELDS = [
  "warmup_anchor", "objective", "activity", "vocabulary", "prior_connection",
  "pacing_unit_name", "pacing_key_vocabulary", "course_objective", "pacing_prior_connection",
];

function wfbFlow3Plausible_(lesson, warmUp) {
  const lower = String(warmUp || "").toLowerCase();
  const nonAccessHit = FI_NON_ACCESS_PHRASES.find(function (p) { return lower.indexOf(p) !== -1; });
  if (nonAccessHit) {
    return { ok: false, reason: "the model's own output contains a self-reported non-access phrase (\"" +
      nonAccessHit + "\")" };
  }
  // The anchor itself, kept whole (constraint 1 of Mode A), always passes,
  // even when none of its words is long enough to be a candidate.
  if (wfbKeepsAnchor_(warmUp, (lesson || {}).warmup_anchor)) return { ok: true };
  const strings = [];
  WFB_FLOW3_SOURCE_FIELDS.forEach(function (k) { _wfbCollectText_((lesson || {})[k], strings); });
  const candidates = _fiDistinguishingWords_(strings.join(" "));
  if (!candidates.length) return { ok: true };
  const engaged = candidates.some(function (w) {
    return lower.indexOf(w.slice(0, WFB_FLOW4_STEM_CHARS)) !== -1;
  });
  if (!engaged) {
    return { ok: false, reason: "the output shares none of the lesson's distinguishing words (" +
      candidates.length + " checked)" };
  }
  return { ok: true };
}

// The warm-up prompt Flow 4 was given: its Flow4Input row's
// OriginalPromptText (the newest row for the job, if it was retried).
function wfbFlow4PromptText_(ss, queueId) {
  const sheet = ss.getSheetByName(WFB_INPUT_TABS[4]);
  if (!sheet || sheet.getLastRow() <= 1) return "";
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, WFB_FLOW4_HEADERS.length).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1]).trim() === queueId) return String(rows[i][3] || "");
  }
  return "";
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
  // Same lock as 37_FlowInputBuilder.js's harvest. Two overlapping runs (one
  // taking longer than the 5-minute trigger) could each create a Flow 3 doc
  // for the same queue row, and a prune's deleteRow() in one could shift
  // the row numbers the other is writing to.
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[WFB] Another harvest holds the lock — standing down until the next run.");
    return result;
  }
  try {
    return wfbHarvestUnderLock_(result);
  } finally {
    lock.releaseLock();
  }
}

function wfbHarvestUnderLock_(result) {
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
      // A fallback is delivered, but noted so 34c can count it.
      wfbMarkReturn_(returns, sheetRow, "HARVESTED",
        outcome.fallback ? WFB_ANCHOR_FALLBACK + ": " + outcome.fallback : "", attempts);
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
// PENDING, which is what hands it to Flow 3. Retired 2026-11-01 (Flow 3
// writes the lead-in); kept so an answer already on its way still lands.
function wfbApplyFlow5_(wqSheet, found, raw) {
  const status = String(found.row[WQ25_STATUS] || "").trim();
  if (status === "PENDING" || status === "DELIVERED") {
    return { ok: true, duplicate: true }; // already bridged
  }

  let lesson;
  try { lesson = JSON.parse(String(found.row[WQ25_LESSON_CTX_SNAP] || "{}")); } catch (e) { lesson = {}; }
  const plausibility = _wfbCheckPlausible_({
    priorResponse: lesson.flow5_prior_response,
    priorConnection: lesson.pacing_prior_connection,
    courseName: lesson.course_name,
  }, raw);
  if (!plausibility.ok) return { ok: false, error: "SUSPECT_FABRICATION: " + plausibility.reason };

  wqSheet.getRange(found.sheetRow, WQ25_BRIDGE_OUTPUT + 1).setValue(String(raw).trim());
  wqSheet.getRange(found.sheetRow, WQ25_STATUS + 1).setValue("PENDING");
  SpreadsheetApp.flush();
  return { ok: true };
}

// Flow 3's answer split into { leadIn, warmUp } (2026-11-01): "LEAD-IN: …"
// then "WARM-UP: …", or "WARM-UP: …" alone, or (an answer without markers)
// all of it the warm-up.
function wfbSplitLeadIn_(raw) {
  const text = String(raw || "").trim();
  const w = /(^|\n)\s*\**WARM-?UP:\**\s*/i.exec(text);
  if (!w) return { leadIn: "", warmUp: text };
  const before = text.slice(0, w.index);
  const lead = /^\s*\**LEAD-?IN:\**\s*([\s\S]*)$/i.exec(before);
  return { leadIn: lead ? lead[1].trim() : "", warmUp: text.slice(w.index + w[0].length).trim() };
}

// Why a lead-in can't be shown, or "". Short, prose, and about the
// student's last answer (the plausibility gate Flow 5's bridge had).
const WFB_LEAD_IN_MAX_CHARS = 400;
function wfbLeadInProblem_(leadIn, lesson) {
  const t = String(leadIn || "").trim();
  if (!t) return "empty";
  if (t.length > WFB_LEAD_IN_MAX_CHARS) return "longer than " + WFB_LEAD_IN_MAX_CHARS + " characters";
  if (/\n\s*([-*•]|\d+[.)])\s/.test("\n" + t)) return "a list";
  if (!String((lesson || {}).flow5_prior_response || "").trim()) return "no last answer to connect";
  const plausibility = _wfbCheckPlausible_({
    priorResponse: lesson.flow5_prior_response,
    priorConnection: lesson.pacing_prior_connection,
    courseName: lesson.course_name,
  }, t);
  return plausibility.ok ? "" : "SUSPECT_FABRICATION: " + plausibility.reason;
}

// Flow 3: create the doc, stamp the zones, share it, record doc_id/url and
// DELIVERED. Ported from CreateWarmUpDocStep.
// forcedFallback: deliver the anchor without reading raw (a job Studio never
// returned; see wfbFallbackExhaustedInputs_), with this reason.
function wfbApplyFlow3_(wqSheet, found, queueId, raw, forcedFallback) {
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

  // A baseline warm-up (D6) is checked against its skill, not the lesson,
  // and its fallback is the question code writes for that skill.
  const baselineOf = wfbParseBaseline_(row[WQ25_ARCHETYPE]);
  const gate = baselineOf ? {
    warmup_anchor: wfbBaselineQuestion_(baselineOf.n),
    objective: WFB_BASELINE_SKILLS[baselineOf.n].text,
    activity: WFB_BASELINE_SKILLS[baselineOf.n].indicators,
    vocabulary: WFB_BASELINE_SKILLS[baselineOf.n].skill,
  } : lesson;
  // Flow 3's answer: an optional lead-in line, then the warm-up (Flow 5
  // merged in, 2026-11-01). The lead-in is checked on its own and dropped,
  // never the warm-up, if it doesn't hold. An answer with no markers is the
  // warm-up alone, as before. A bridge Flow 5 wrote before then still shows.
  let bridge = baselineOf ? "" : String(row[WQ25_BRIDGE_OUTPUT] || "");
  if (!forcedFallback) {
    const parts = wfbSplitLeadIn_(raw);
    raw = parts.warmUp;
    if (parts.leadIn && !baselineOf) {
      const leadCheck = wfbLeadInProblem_(parts.leadIn, lesson);
      if (leadCheck) {
        Logger.log("[WFB] " + queueId + ": lead-in dropped (" + leadCheck + "); the warm-up goes out without it.");
      } else {
        bridge = parts.leadIn;
        wqSheet.getRange(found.sheetRow, WQ25_BRIDGE_OUTPUT + 1).setValue(bridge);
      }
    }
  }

  // Shape gate first: output that is the prompt itself, a description of it
  // or a list of its fields is never shown. The teacher's own anchor goes
  // out instead, and the harvest records the fallback (34c counts it).
  let fallback = forcedFallback || "";
  const shape = fallback ? "" : wfbWarmUpShapeProblem_(raw, gate.warmup_anchor);
  if (fallback || shape) {
    const anchor = String(gate.warmup_anchor || "").trim();
    if (!anchor) return { ok: false, error: "NOT_A_WARMUP: " + (shape || fallback) };
    raw = anchor;
    fallback = fallback || shape;
  } else {
    // Plausibility gate BEFORE any Drive work — a fabricated warm-up prompt
    // is the assignment text the student actually responds to, and the doc
    // this creates can't cheaply be un-created (see the existingDocId guard
    // above: a second attempt after a doc already exists is refused for
    // exactly that reason).
    // A failure gets the teacher's anchor too, like the shape gate: a retry
    // of the same output fails the same way, and the row would otherwise end
    // at ERROR with no warm-up for the day (four on 2026-10-20).
    const plausibility = wfbFlow3Plausible_(gate, raw);
    if (!plausibility.ok) {
      const anchor = String(gate.warmup_anchor || "").trim();
      if (!anchor) return { ok: false, error: "SUSPECT_FABRICATION: " + plausibility.reason };
      raw = anchor;
      fallback = "SUSPECT_FABRICATION: " + plausibility.reason;
    }
  }

  // The text box needs no folder, so the folder-path fields are checked only
  // for a doc. Checked first, a blank teacher_name failed every warm-up.
  if (courseName && warmUpTextBoxFor_(courseName)) {
    const delivered = wfbDeliverToTextBox_(wqSheet, found, queueId, raw, bridge);
    if (fallback) delivered.fallback = fallback;
    return delivered;
  }

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
      String(raw).trim(), bridge);
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
  stampWarmUpTiming_(wqSheet, found.sheetRow, WQ_TIMING.DELIVERED_AT, new Date());
  SpreadsheetApp.flush();
  return fallback ? { ok: true, fallback: fallback } : { ok: true };
}

// ── Shape gate (Flow 3) ──────────────────────────────────────────────────────
//
// 2026-10-19: 18 of the first 126 delivered warm-ups were not warm-ups: the
// Flow 3 prompt echoed back, a third-person description of it, or a list of
// its fields. Each passed _wfbCheckPlausible_, which only asks that the
// output share words with the input, and a copy of the input shares all of
// them. A warm-up is a few sentences to the student, so anything carrying
// the prompt's own headings or vocabulary, a list, or a page of text is
// refused here.
const WFB_WARMUP_MAX_CHARS = 900;
const WFB_WARMUP_PROMPT_MARKERS = [
  "you are personalizing", "adaptation constraints", "output format",
  "teacher's anchor prompt", "student context", "archetype",
  "warm-up prompt", "warmup prompt", "competency gap",
];
const WFB_ANCHOR_FALLBACK = "ANCHOR_FALLBACK";

// 2026-10-21: 8 of a night's 17 shape failures were Flow 3's whole prompt
// (3,400 characters, the Mode A text with its fields filled), so Studio
// returned its input; they read "longer than 900 characters" until this.
// Most of the rest had no question mark: a sentence about the anchor (that
// it already fits), not the anchor. The question rule applies only with an
// anchor to compare, since 5 of the 67 lesson anchors have no "?".
const WFB_WARMUP_PROMPT_ECHO = ["you are personalizing a warm-up", "you are generating a warm-up",
  "you are writing a baseline warm-up", "your role:"];

/**
 * @param anchor  optional: the teacher's anchor. With it, a warm-up must ask
 *                a question unless it keeps the anchor whole.
 * @returns {string} why the text isn't a warm-up, or "" if it is one.
 */
function wfbWarmUpShapeProblem_(text, anchor) {
  const t = String(text || "").trim();
  const lower = t.toLowerCase();
  if (WFB_WARMUP_PROMPT_ECHO.some(function (m) { return lower.indexOf(m) !== -1; })) {
    return "is Flow 3's own prompt (Studio returned its input; see the Gemini step in Studio's run history)";
  }
  if (t.length > WFB_WARMUP_MAX_CHARS) return "longer than " + WFB_WARMUP_MAX_CHARS + " characters";
  const marker = WFB_WARMUP_PROMPT_MARKERS.find(function (m) { return lower.indexOf(m) !== -1; });
  if (marker) return "contains the prompt's own wording (\"" + marker + "\")";
  if (/\b8\d{3}-\d{1,2}\b/.test(t)) return "names a competency code";
  if (/^\s*(?:[-*\u2022]|\d+[.)])\s+/m.test(t)) return "is a list";
  if (anchor && t.indexOf("?") === -1 && !wfbKeepsAnchor_(t, anchor)) return "asks no question";
  return "";
}

// True when the text holds the whole anchor, ignoring case, punctuation and
// spacing (some anchors carry markdown asterisks).
function wfbKeepsAnchor_(text, anchor) {
  const squash = function (x) { return String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
  const a = squash(anchor);
  return !!a && squash(text).indexOf(a) !== -1;
}

/**
 * Operator entry point (Central Ledger, Run menu). Replaces every warm-up
 * already in WarmUpTextBox that fails the shape gate with the teacher's
 * anchor from its WarmUpQueue snapshot, for rows the student hasn't answered
 * yet. Answered rows are counted, not changed. Logs counts only.
 */
function repairWarmUpTextBox() {
  const ctx = wfbLedger_();
  const sheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpTextBox);
  const wqSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpQueue);
  const result = { checked: 0, replaced: 0, answeredSkipped: 0, noAnchor: 0 };
  if (!sheet || !wqSheet || sheet.getLastRow() < 2) {
    Logger.log("[WFB] repairWarmUpTextBox: " + JSON.stringify(result));
    return result;
  }
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, WTB_HEADERS.length).getValues();
  rows.forEach(function (r, i) {
    result.checked++;
    if (!wfbWarmUpShapeProblem_(r[WTB.WARMUP])) return;
    if (String(r[WTB.RESPONSE] || "").trim()) { result.answeredSkipped++; return; }
    const found = wfbFindQueueRow_(wqSheet, String(r[WTB.QUEUE_ID]).trim());
    let anchor = "";
    if (!found) { result.noAnchor++; return; }
    try {
      anchor = String(JSON.parse(String(found.row[WQ25_LESSON_CTX_SNAP] || "{}")).warmup_anchor || "").trim();
    } catch (e) { anchor = ""; }
    if (!anchor) { result.noAnchor++; return; }
    sheet.getRange(i + 2, WTB.WARMUP + 1).setValue(sheetSafeText_(anchor));
    result.replaced++;
  });
  SpreadsheetApp.flush();
  Logger.log("[WFB] repairWarmUpTextBox: " + JSON.stringify(result));
  return result;
}

// Flow 3 jobs that ended at ERROR because Studio's output failed the
// plausibility check (before 2026-10-20 that failed the row; it now gets the
// anchor): delivers the teacher's anchor for each one whose day hasn't
// passed, and notes ANCHOR_FALLBACK on its return row for 34c. Counts only.
function previewFailedWarmUpRepair() { return wfbRepairFailedWarmUps_(true); }
function repairFailedWarmUps() { return wfbRepairFailedWarmUps_(false); }

function wfbRepairFailedWarmUps_(dryRun) {
  const ctx = wfbLedger_();
  const wqSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpQueue);
  const ret = ctx.ss.getSheetByName(WFB_RETURN_TAB);
  const result = { dryRun: dryRun, failed: 0, delivered: 0, pastDay: 0, notError: 0, noAnchor: 0 };
  if (!wqSheet || !ret || ret.getLastRow() < 2) {
    Logger.log("[WFB] repairFailedWarmUps: " + JSON.stringify(result));
    return result;
  }
  const today = formatDateYMD_(new Date());
  const rows = ret.getRange(2, 1, ret.getLastRow() - 1, WFB_RETURN_HEADERS.length).getValues();
  rows.forEach(function (r, i) {
    const error = String(r[WFB_RET.ERROR] || "");
    if (Number(r[WFB_RET.FLOW]) !== 3 || String(r[WFB_RET.HARVEST_STATUS]).trim() !== "FAILED" ||
        error.indexOf("SUSPECT_FABRICATION") !== 0) return;
    result.failed++;
    const queueId = String(r[WFB_RET.QUEUE_ID]).trim();
    const found = wfbFindQueueRow_(wqSheet, queueId);
    if (!found || String(found.row[WQ25_STATUS] || "").trim() !== "ERROR") { result.notError++; return; }
    if (wfbNormalizeDateIso_(found.row[WQ25_LESSON_DATE]) < today) { result.pastDay++; return; }
    if (dryRun) { result.delivered++; return; }
    const out = wfbApplyFlow3_(wqSheet, found, queueId, "", error);
    if (!out.ok) { result.noAnchor++; return; }
    wfbMarkReturn_(ret, i + 2, "HARVESTED", WFB_ANCHOR_FALLBACK + ": " + error, r[WFB_RET.ATTEMPTS]);
    wfbConsumeInputRow_(ctx.ss, 3, queueId);
    result.delivered++;
  });
  if (!dryRun) SpreadsheetApp.flush();
  Logger.log("[WFB] repairFailedWarmUps: " + JSON.stringify(result));
  return result;
}

// Flow 4 jobs that ended at EVAL_ERROR because the feedback failed the
// plausibility check (before 2026-10-20's looser Flow 4 check): applies the
// saved model output again under the current check, and scores each one that
// now passes. Counts only.
function previewFailedWarmUpScoring() { return wfbRepairFailedScoring_(true); }
function repairFailedWarmUpScoring() { return wfbRepairFailedScoring_(false); }

// The same jobs, when the teacher has read each one's feedback (RawOutput in
// WarmUpFlowReturn) and judged it fits the answer: scores them without the
// plausibility check, which misses feedback that paraphrases (2026-10-26:
// "market value" and "industry standards" for an answer about negotiating
// pay). Parse and score-range checks still apply. Read every row the
// preview counts before running it.
function previewAcceptFailedWarmUpFeedback() { return wfbRepairFailedScoring_(true, true); }
function acceptFailedWarmUpFeedback() { return wfbRepairFailedScoring_(false, true); }

function wfbRepairFailedScoring_(dryRun, accept) {
  const ctx = wfbLedger_();
  const wqSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpQueue);
  const wrSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpRegistry);
  const ret = ctx.ss.getSheetByName(WFB_RETURN_TAB);
  const result = { dryRun: dryRun, failed: 0, scored: 0, stillFailing: 0, notEvalError: 0, byDate: {} };
  const label = accept ? "acceptFailedWarmUpFeedback" : "repairFailedWarmUpScoring";
  if (!wqSheet || !ret || ret.getLastRow() < 2) {
    Logger.log("[WFB] " + label + ": " + JSON.stringify(result));
    return result;
  }
  const rows = ret.getRange(2, 1, ret.getLastRow() - 1, WFB_RETURN_HEADERS.length).getValues();
  rows.forEach(function (r, i) {
    if (Number(r[WFB_RET.FLOW]) !== 4 || String(r[WFB_RET.HARVEST_STATUS]).trim() !== "FAILED" ||
        String(r[WFB_RET.ERROR] || "").indexOf("SUSPECT_FABRICATION") !== 0) return;
    result.failed++;
    const queueId = String(r[WFB_RET.QUEUE_ID]).trim();
    const found = wfbFindQueueRow_(wqSheet, queueId);
    if (!found || String(found.row[WQ25_STATUS] || "").trim() !== "EVAL_ERROR") { result.notEvalError++; return; }
    if (dryRun) {
      // The same gate the apply runs, with no writes.
      let parsed = null;
      try { parsed = JSON.parse(wfbStripFence_(r[WFB_RET.RAW_OUTPUT])); } catch (e) { /* counted below */ }
      const feedback = parsed ? String(parsed.feedback || "") : "";
      const ok = feedback && (accept
        ? wfbScoreInRange_(Number(parsed.grammar), 0, 1) && wfbScoreInRange_(Number(parsed.engagement), 0, 3)
        : wfbFlow4Plausible_(found.row[WQ25_RESPONSE_TEXT], wfbFlow4PromptText_(ctx.ss, queueId), feedback).ok);
      if (ok) wfbCountScored_(result, found.row); else result.stillFailing++;
      return;
    }
    const out = wfbApplyFlow4_(wqSheet, wrSheet, found, queueId, String(r[WFB_RET.RAW_OUTPUT] || ""),
      { accepted: !!accept });
    if (!out.ok) { result.stillFailing++; return; }
    wfbMarkReturn_(ret, i + 2, "HARVESTED", accept ? "ACCEPTED_BY_TEACHER: " + r[WFB_RET.ERROR] : "",
      r[WFB_RET.ATTEMPTS]);
    wfbConsumeInputRow_(ctx.ss, 4, queueId);
    wfbCountScored_(result, found.row);
  });
  if (!dryRun) SpreadsheetApp.flush();
  Logger.log("[WFB] " + label + ": " + JSON.stringify(result));
  return result;
}

function wfbCountScored_(result, row) {
  result.scored++;
  const date = wfbNormalizeDateIso_(row[WQ25_LESSON_DATE]) || "no date";
  result.byDate[date] = (result.byDate[date] || 0) + 1;
}

// Warm-ups at EVAL_ERROR whose saved feedback still fails the check (what
// repairFailedWarmUpScoring leaves as stillFailing): sends each answer to
// Flow 4 again for new feedback, and puts the row back at PENDING_EVAL. Its
// old input rows are marked CONSUMED and its FAILED Flow 4 returns deleted,
// so the new job is retried and counted like any other. At most
// WFB_INPUTS_PER_RUN per run (Studio drops runs when many rows land at
// once); run again for the rest. Counts and lesson dates only.
function previewEvalErrorRescore() { return wfbRescoreEvalErrors_(true); }
function rescoreEvalErrorWarmUps() { return wfbRescoreEvalErrors_(false); }

function wfbRescoreEvalErrors_(dryRun) {
  const result = { dryRun: dryRun, evalError: 0, resent: 0, noAnswer: 0, deferred: 0, byDate: {} };
  // The harvest's lock: this deletes return rows the harvest reads by number.
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[WFB] rescoreEvalErrorWarmUps: the harvest holds the lock — try again in a minute.");
    return result;
  }
  try {
    const ctx = wfbLedger_();
    const wqSheet = ctx.ss.getSheetByName(ctx.cfg.tabs.warmUpQueue);
    if (!wqSheet || wqSheet.getLastRow() < 2) {
      Logger.log("[WFB] rescoreEvalErrorWarmUps: " + JSON.stringify(result));
      return result;
    }
    const data = wqSheet.getRange(2, 1, wqSheet.getLastRow() - 1, WQ25_COL_COUNT).getValues();
    const textBox = readWarmUpTextBox_(ctx.ss);
    const input = dryRun ? null : wfbTab_(ctx.ss, WFB_INPUT_TABS[4], WFB_FLOW4_HEADERS);
    const resent = {};
    data.forEach(function (row, i) {
      const queueId = String(row[WQ25_QUEUE_ID] || "").trim();
      if (!queueId || String(row[WQ25_STATUS] || "").trim() !== "EVAL_ERROR") return;
      result.evalError++;
      if (!String(row[WQ25_DOC_ID] || "").trim() && !textBox[queueId]) { result.noAnswer++; return; }
      if (result.resent >= WFB_INPUTS_PER_RUN) { result.deferred++; return; }
      if (!dryRun) {
        wfbConsumeInputRow_(ctx.ss, 4, queueId); // the old job is finished
        if (!wfbBuildFlow4Row_(input, row, queueId, textBox[queueId])) { result.noAnswer++; return; }
        wqSheet.getRange(i + 2, WQ25_STATUS + 1).setValue(WFB_TRIGGER_STATUS[4]);
        resent[queueId] = true;
      }
      result.resent++;
      const date = wfbNormalizeDateIso_(row[WQ25_LESSON_DATE]) || "no date";
      result.byDate[date] = (result.byDate[date] || 0) + 1;
    });
    // Bottom up, so the rows above keep their numbers. Studio's new returns
    // land below these and arrive with no HarvestStatus.
    const ret = dryRun ? null : ctx.ss.getSheetByName(WFB_RETURN_TAB);
    if (ret && ret.getLastRow() > 1) {
      const rows = ret.getRange(2, 1, ret.getLastRow() - 1, WFB_RETURN_HEADERS.length).getValues();
      for (let j = rows.length - 1; j >= 0; j--) {
        if (Number(rows[j][WFB_RET.FLOW]) === 4 && resent[String(rows[j][WFB_RET.QUEUE_ID]).trim()] &&
            String(rows[j][WFB_RET.HARVEST_STATUS] || "").trim() === "FAILED") {
          ret.deleteRow(j + 2);
        }
      }
    }
    if (!dryRun) SpreadsheetApp.flush();
    Logger.log("[WFB] rescoreEvalErrorWarmUps: " + JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

// WARMUP_TEXT_BOX (00): the warm-up goes on the Student Dashboard instead of
// into a doc. Unlike a doc, a second attempt can't duplicate anything: a row
// already written for this queue_id is kept and the status re-stamped.
// bridge: the paragraph shown above the warm-up ("" for a baseline one).
function wfbDeliverToTextBox_(wqSheet, found, queueId, raw, bridge) {
  const ss = wfbLedger_().ss;
  const sheet = warmUpTextBoxSheet_(ss);
  if (!readWarmUpTextBox_(ss)[queueId]) {
    const row = new Array(WTB_HEADERS.length).fill("");
    row[WTB.QUEUE_ID]    = queueId;
    row[WTB.LESSON_DATE] = wfbNormalizeDateIso_(found.row[WQ25_LESSON_DATE]);
    row[WTB.BRIDGE]      = sheetSafeText_(String(bridge === undefined ? found.row[WQ25_BRIDGE_OUTPUT] || "" : bridge).trim());
    row[WTB.WARMUP]      = sheetSafeText_(String(raw).trim());
    sheet.appendRow(row);
  }
  wqSheet.getRange(found.sheetRow, WQ25_STATUS + 1).setValue("DELIVERED");
  stampWarmUpTiming_(wqSheet, found.sheetRow, WQ_TIMING.DELIVERED_AT, new Date());
  SpreadsheetApp.flush();
  return { ok: true };
}

// Flow 4: parse the evaluation JSON, then hand off to Script 25's own
// write-backs rather than a second copy of them.
// opts.accepted: the teacher read the feedback and accepted it
// (acceptFailedWarmUpFeedback), so the plausibility gate is skipped; the
// parse and score-range checks still run.
function wfbApplyFlow4_(wqSheet, wrSheet, found, queueId, raw, opts) {
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

  // The prompt allows grammar 0-1 and engagement 0-3. Anything else is a
  // model error (or a response that talked it into inflating a score), and
  // it must not reach the gradebook: fail the row instead of writing it.
  const grammar = Number(parsed.grammar);
  const engagement = Number(parsed.engagement);
  if (!wfbScoreInRange_(grammar, 0, 1) || !wfbScoreInRange_(engagement, 0, 3)) {
    return { ok: false, error: "GEMINI_SCORE_OUT_OF_RANGE: grammar=" + parsed.grammar +
      ", engagement=" + parsed.engagement };
  }
  const feedback = String(parsed.feedback || "Your response has been reviewed.");
  const wordCountScore = Number(row[WQ25_WORD_COUNT_SCORE] || 0);
  const extraCredit = Number(row[WQ25_EXTRA_CREDIT] || 0);
  const total = wordCountScore + grammar + engagement + extraCredit;

  // Plausibility gate BEFORE any score or feedback write — the highest-
  // stakes of the three flows this file harvests: grammar/engagement
  // become part of the student's real grade, and unlike Flow 2's
  // FERPA-blocked student text, WQ25_RESPONSE_TEXT is already a
  // documented, retained field this project legitimately holds (see this
  // section's own header comment), so the check compares straight against
  // the real response.
  const plausibility = (opts && opts.accepted) ? { ok: true } : wfbFlow4Plausible_(row[WQ25_RESPONSE_TEXT],
    wfbFlow4PromptText_(wfbLedger_().ss, queueId), feedback);
  if (!plausibility.ok) return { ok: false, error: "SUSPECT_FABRICATION: " + plausibility.reason };

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

function wfbScoreInRange_(n, lo, hi) {
  return Number.isInteger(n) && n >= lo && n <= hi;
}

// A bare "yyyy-MM-dd" string parses as UTC midnight, which is the evening
// before in America/New_York, so every warm-up doc was headed with the day
// before its lesson. Parse it as local midnight instead, as 22/31 already do.
function wfbParseDate_(raw) {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return new Date(raw.trim() + "T00:00:00");
  }
  return new Date(raw);
}

// Degrades to the raw string rather than throwing when Date parsing fails —
// a Sheets Date cell's exact handed-back shape isn't guaranteed.
function wfbNormalizeDateIso_(raw) {
  const d = wfbParseDate_(raw);
  if (isNaN(d.getTime())) return String(raw);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function wfbFormatReadableDate_(iso) {
  const d = wfbParseDate_(iso);
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
  // A retried job has more than one row (the old ones RETRIED): all of
  // them are finished once its return is applied.
  const ids = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === queueId && String(ids[i][1]).trim() !== "CONSUMED") {
      sheet.getRange(i + 2, 3).setValue("CONSUMED");
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
    const at = sheetTimestampMs_(data[i][WFB_RET.TIMESTAMP]); // Studio's rows are text (00)
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
 * One-off recovery, run by hand: Flow 3 returns that failed only on
 * FOLDER_PATH_FIELDS_MISSING (a blank teacher_name before text-box delivery
 * stopped needing folder fields) are reset and harvested again. The model
 * output is already in WarmUpFlowReturn, so nothing is re-run in Studio.
 * Logs counts only.
 */
function retryWarmUpFolderPathFailures() {
  const ctx = wfbLedger_();
  const returns = wfbTab_(ctx.ss, WFB_RETURN_TAB, WFB_RETURN_HEADERS);
  const lastRow = returns.getLastRow();
  let reset = 0;
  if (lastRow >= 2) {
    const data = returns.getRange(2, 1, lastRow - 1, WFB_RETURN_HEADERS.length).getValues();
    data.forEach((r, i) => {
      if (Number(r[WFB_RET.FLOW]) !== 3) return;
      if (String(r[WFB_RET.HARVEST_STATUS] || "").trim() !== "FAILED") return;
      if (String(r[WFB_RET.ERROR] || "").indexOf("FOLDER_PATH_FIELDS_MISSING") === -1) return;
      wfbMarkReturn_(returns, i + 2, "", "", 0);
      reset++;
    });
  }
  Logger.log("[WFB] retryWarmUpFolderPathFailures: reset " + reset + " Flow 3 return(s); harvesting now.");
  return { reset: reset, harvest: harvestWarmUpFlowReturns() };
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
        const st = String(r[0]).trim();
        if (st === "CONSUMED") consumed++;
        else if (st === "READY") ready++;
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

// For 34c's overnight check: of the WarmUpFlowReturn rows written in the
// last windowMs, how many checkFlowBinding() would flag. Counts only.
function wfbRecentBindingCounts_(ss, now, windowMs) {
  const out = { recent: 0, bad: 0 };
  const returns = ss.getSheetByName(WFB_RETURN_TAB);
  if (!returns || returns.getLastRow() < 2) return out;
  const knownIds = {};
  const wq = ss.getSheetByName(getConfig_().tabs.warmUpQueue);
  if (wq && wq.getLastRow() > 1) {
    wq.getRange(2, WQ25_QUEUE_ID + 1, wq.getLastRow() - 1, 1).getValues().forEach(function (r) {
      const id = String(r[0]).trim();
      if (id) knownIds[id] = true;
    });
  }
  returns.getRange(2, 1, returns.getLastRow() - 1, WFB_RETURN_HEADERS.length).getValues().forEach(function (r) {
    const at = sheetTimestampMs_(r[WFB_RET.TIMESTAMP]);
    if (isNaN(at) || now.getTime() - at > windowMs) return;
    out.recent++;
    if (_wfbDiagnoseReturnRow_(r, knownIds).length) out.bad++;
  });
  return out;
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

  // The harvest's own row for a job Studio never returned (wfbFallbackExhaustedInputs_):
  // no output, the note in Error. Not Studio's, so not a binding to diagnose.
  if (!cell(WFB_RET.RAW_OUTPUT) && cell(WFB_RET.ERROR).indexOf(WFB_ANCHOR_FALLBACK + ":") === 0) return issues;

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
 *
 * FIX (found during live redeployment — confirmed directly, not assumed):
 * this check used to treat any row with non-empty GeminiFullOutput as fully
 * healthy and skip it entirely. That misses the exact failure a real Studio
 * build just produced: the Flow's update-row step wrote GeminiFullOutput
 * correctly but left ReadyStatus at "READY" instead of also setting it to
 * "EVALUATED" — harvestFlowInputResults() only ever processes rows already
 * at EVALUATED (nothing else in this codebase makes that transition), so
 * the row sits with real output, forever unharvested, and this check
 * previously called it fine. Now flagged as its own category,
 * `stuckAtReady`, before the existing mis-bound-output heuristic runs.
 */
function checkFlow2Binding() {
  const ctx = wfbLedger_();
  const tabName = (ctx.cfg.tabs && ctx.cfg.tabs.flowInput) || 'FlowInput';
  const sheet = ctx.ss.getSheetByName(tabName);
  const report = { rows: 0, awaitingOutput: 0, stuckAtReady: 0, suspected: [] };
  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log('[WFB] checkFlow2Binding: no ' + tabName + ' rows to diagnose.');
    return report;
  }

  Logger.log('[WFB] Flow 2 writes its result INTO the trigger row, not a new one. Bind the ' +
    'output step to column ' + (FI.GEMINI_FULL_OUTPUT + 1) + ' (GeminiFullOutput), AND set ' +
    'column ' + (FI.READY_STATUS + 1) + ' (ReadyStatus) to the literal "EVALUATED" — both in ' +
    'the same update-row step. Change nothing else on the row.');

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, FI.PROMPT_TEXT + 1).getValues();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    report.rows++;
    const hasOutput = !!String(row[FI.GEMINI_FULL_OUTPUT] || '').trim();
    const readyStatus = String(row[FI.READY_STATUS] || '').trim();

    if (hasOutput && readyStatus === 'READY') {
      // Output arrived, but the status half of the same write never
      // happened — harvestFlowInputResults() will never see this row.
      report.stuckAtReady++;
      continue;
    }
    if (hasOutput) continue; // output arrived AND status already advanced — healthy
    if (readyStatus !== 'READY') continue;
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
  if (report.stuckAtReady) {
    Logger.log('[WFB]   ' + report.stuckAtReady + ' row(s) have real GeminiFullOutput but ' +
      'ReadyStatus is still READY, not EVALUATED. harvestFlowInputResults() will never process ' +
      'these — they will sit forever with real, unharvested output. Fix the Flow\'s update-row ' +
      'step: it must write the literal "EVALUATED" into ReadyStatus in the SAME step that ' +
      'writes GeminiFullOutput, not leave that column untouched.');
  }
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

    // The lock is off unless PIVOT_ARCHETYPE_LOCK enables it (P0-02), so the
    // check turns it on, as the unit tests do.
    step("a high-confidence shadow-matrix entry overrides the decision table",
      wfbSelectArchetype_({}, { unit_current: "U1",
        shadow_matrix: { U1: { cross_confidence: 0.9, best_archetype: "concrete scenario" } } },
        { lockEnabled: true })
        === "CONCRETE_SCENARIO",
      "and its free-text spelling is normalized");

    step("a fenced Flow 4 payload parses",
      JSON.parse(wfbStripFence_("```json\n{\"grammar\":2}\n```")).grammar === 2, "");

    // Flow 5 merged into Flow 3 (2026-11-01). A row left at PENDING_BRIDGE
    // becomes a Flow 3 input whose prompt carries the last answer, and Flow
    // 3's answer splits into the lead-in and the warm-up. No Drive access.
    const snapshot = JSON.stringify({
      flow5_prior_response: "CANARY-PRIOR-ANSWER", pacing_prior_connection: "connects", course_name: "CAS",
    });
    const wqRow = [];
    for (let i = 0; i < WQ25_COL_COUNT; i++) wqRow.push("");
    wqRow[WQ25_QUEUE_ID] = queueId;
    wqRow[WQ25_LESSON_CTX_SNAP] = snapshot;
    wqRow[WQ25_STATUS] = "PENDING_BRIDGE";
    wqRow[WQ25_STUDENT_NAME] = "Canary Student";
    // .invalid keeps it on lesson warm-ups (Mode A/B), as the fixture
    // student does; a new student's baseline warm-up (Mode C) has no lead-in.
    wqRow[WQ25_GOOGLE_ID] = "canary-student@example.invalid";
    wqSheet.appendRow(wqRow);

    const built = buildWarmUpFlowInputs();
    const f3Tab = wfbLedger_().ss.getSheetByName(WFB_INPUT_TABS[3]);
    const f3Rows = f3Tab && f3Tab.getLastRow() > 1
      ? f3Tab.getRange(2, 1, f3Tab.getLastRow() - 1, WFB_FLOW3_HEADERS.length).getValues() : [];
    const mine = f3Rows.filter(function (r) { return String(r[1]).trim() === queueId; })[0];
    step("a PENDING_BRIDGE row becomes a Flow 3 input, its prompt carrying the last answer",
      !!mine && String(mine[WFB_FLOW3_HEADERS.length - 1]).indexOf("CANARY-PRIOR-ANSWER") !== -1,
      JSON.stringify(built));

    const split = wfbSplitLeadIn_("LEAD-IN: You said before that prices rise.\nWARM-UP: Why would a fan pay more?");
    step("Flow 3's answer splits into the lead-in and the warm-up",
      split.leadIn === "You said before that prices rise." && split.warmUp === "Why would a fan pay more?",
      JSON.stringify(split));
    step("an answer without labels is all warm-up",
      wfbSplitLeadIn_("Why would a fan pay more?").leadIn === "", "");
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
