// =============================================================================
// FILE: SelectWarmUpArchetypeStep.gs
// PROJECT: cas-ccps:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: Flow 3's (Warm-Up Generation) pre-processing step, as specified
//          in cas-ccps/docs/CAS_Flow3_Flow4_Specification.html: "Archetype
//          selection happens inside Flow 3's pre-processing step — before
//          the Gemini call... implemented as a Flow 3 JavaScript
//          transformation step, not by Gemini itself." That sentence is
//          the spec authorizing exactly this file, in its own words.
//
//          Parses both WarmUpQueue snapshot columns, selects an archetype
//          (shadow matrix override, then the decision table, then a fixed
//          fallback order), selects Mode A (anchor-aware) vs Mode B
//          (generative), and formats every {placeholder} both system
//          prompts need — so the native Ask Gemini step downstream is a
//          clean variable-mapping exercise, not a template-building one.
//
// A CORRECTION TO THE HTML SPEC'S OWN DECISION TABLE, FOUND WHILE
// GROUNDING THIS AGAINST ACTUAL CODE:
//   CAS_Flow3_Flow4_Specification.html's decision table describes the
//   shadow-matrix override as per-archetype: "Used directly when shadow
//   cross_confidence >= 0.75 for PARADOX on this student", and similarly
//   worded rows for the other three archetypes -- as if each archetype
//   has its own independent confidence score.
//
//   getStudentProfileSnapshot_() in 23_StudentProfileManager.js -- the
//   actual function that builds shadow_matrix -- tracks ONE
//   cross_confidence and ONE best_archetype per unit, not four
//   independent per-archetype confidences. There's no data structure
//   anywhere in this codebase holding "PARADOX confidence" separately
//   from "BRIDGE confidence" for the same student and unit. The real
//   rule (confirmed directly in that function, not inferred) is: if
//   shadow_matrix[unit_current].cross_confidence >= 0.75, use
//   shadow_matrix[unit_current].best_archetype -- whatever that happens
//   to be -- not "check each archetype's own threshold."
//
//   This file is built against the actual code, not the HTML table's
//   per-archetype phrasing.
//
// A SECOND OVERRIDE THE HTML SPEC DOES DESCRIBE CORRECTLY (worth its own
// note since it uses a DIFFERENT shadow_matrix field): "Shadow matrix
// weights toward BRIDGE for early-unit warm-ups (within_confidence < 0.3)
// regardless of decision table." within_confidence is a genuinely
// separate field from cross_confidence (both are documented in
// CAS_M2_WarmUp_Schema.html's StudentProfiles.shadow_matrix entry) --
// this override is real and distinct from the cross_confidence one
// above, and is implemented as its own, lower-priority check below.
//
// INTERPRETIVE CHOICES made below where the spec's prose doesn't fully
// disambiguate an algorithm (each is called out at the point it's made,
// not just here) -- these are reasoned defaults, not certainties:
//   - PARADOX / CONCRETE SCENARIO's "strengths contain X" / "gaps
//     contain Y" checks are evaluated across the UNION of all
//     evaluation_signals entries (the schema doc doesn't state whether
//     the array is most-recent-first, so checking all 3 rather than
//     assuming an order is the safer read).
//   - PROVOCATION's "no persistent gaps" is read as: no single gap tag
//     appears in 2 or more of the (up to 3) evaluation_signals entries.
//   - BRIDGE's "today's lesson introduces a duty area not yet covered"
//     is treated as equivalent to competency_gaps being non-empty --
//     competency_gaps is already defined (23_StudentProfileManager.js)
//     as exactly "today's competency IDs not yet addressed this term",
//     so the two conditions describe the same thing rather than two
//     independently-checkable ones.
//
// INPUT READING / ERROR HANDLING: every input is read through
// StepsShared.gs's inStr_() rather than the raw
// inputs["x"].stringValues[0] pattern, and the whole execute function
// body is wrapped in try/catch — see inStr_()'s own header for why.
// =============================================================================

var ARCHETYPES_ = {
  PARADOX: "PARADOX",
  CONCRETE_SCENARIO: "CONCRETE_SCENARIO",
  BRIDGE: "BRIDGE",
  PROVOCATION: "PROVOCATION",
};

var SHADOW_CROSS_CONFIDENCE_THRESHOLD_ = 0.75;
var SHADOW_WITHIN_CONFIDENCE_EARLY_UNIT_THRESHOLD_ = 0.3;

// =============================================================================
// onSelectWarmUpArchetypeConfig
// See cas-ccps's CommitRubricDraftStep.gs for the standard confidence
// note on this function's return/Save-button wiring.
// =============================================================================
function onSelectWarmUpArchetypeConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("lessonContextSnapshotJson", "lesson_context_snapshot (trigger row)"))
    .addWidget(variableTextInput_("studentProfileSnapshotJson", "student_profile_snapshot (trigger row)"));

  var saveAction = CardService.newAction().setFunctionName("onSelectWarmUpArchetypeConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Select Warm-Up Archetype"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

// =============================================================================
// onSelectWarmUpArchetypeExecute
// Never throws. selectionStatus is the first output the flow builder
// should branch on: route to a native "Sheets - update row: status =
// ERROR" step on anything other than OK, skipping the Gemini call
// entirely for a row with no usable prompt data.
// =============================================================================
function onSelectWarmUpArchetypeExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries the student's full profile snapshot (evaluation history,
  // engagement scores); see this project's README for the general
  // PII-logging policy every step in this project follows.
  Logger.log("[SelectWarmUpArchetypeStep] execute start");

  try {
    var inputs = event.workflow.actionInvocation.inputs;
    var lessonJsonText = inStr_(inputs, "lessonContextSnapshotJson");
    var profileJsonText = inStr_(inputs, "studentProfileSnapshotJson");

    var lesson, profile;
    try {
      lesson = JSON.parse(lessonJsonText);
    } catch (e) {
      return emptyArchetypeOutput_("LESSON_SNAPSHOT_PARSE_FAILED");
    }
    try {
      profile = JSON.parse(profileJsonText);
    } catch (e) {
      return emptyArchetypeOutput_("PROFILE_SNAPSHOT_PARSE_FAILED");
    }

    var archetype = selectArchetype_(lesson, profile);
    var mode = (lesson.warmup_anchor !== null && lesson.warmup_anchor !== undefined && lesson.warmup_anchor !== "")
      ? "A" : "B";

    var firstName = String(profile.student_name || "").trim().split(/\s+/)[0] || "";
    var competencyTextsFormatted = formatCompetencyTexts_(lesson);
    var competencyGapsFormatted = formatList_(profile.competency_gaps);
    var evaluationSignalsFormatted = formatEvaluationSignals_(profile.evaluation_signals);
    var competenciesAddressedCount = String((profile.competencies_addressed || []).length);
    var totalCompetencies = String(
      ((profile.competencies_addressed || []).length) + ((profile.competency_gaps || []).length)
    );

    return buildOutputRenderAction_({
      selectionStatus: stringVar_("OK"),
      mode: stringVar_(mode),
      archetype: stringVar_(archetype),
      firstName: stringVar_(firstName),
      warmupAnchor: stringVar_(lesson.warmup_anchor || ""),
      pacingUnitName: stringVar_(lesson.pacing_unit_name || ""),
      pacingStage: stringVar_(lesson.pacing_stage != null ? String(lesson.pacing_stage) : ""),
      courseObjective: stringVar_(lesson.course_objective || ""),
      pacingPriorConnection: stringVar_(lesson.pacing_prior_connection || ""),
      pacingKeyVocabulary: stringVar_(lesson.pacing_key_vocabulary || ""),
      courseName: stringVar_(lesson.course_name || ""),
      objective: stringVar_(lesson.objective || ""),
      activity: stringVar_(lesson.activity || ""),
      vocabulary: stringVar_(lesson.vocabulary || ""),
      priorConnection: stringVar_(lesson.prior_connection || ""),
      competencyTextsFormatted: stringVar_(competencyTextsFormatted),
      competencyGapsFormatted: stringVar_(competencyGapsFormatted),
      evaluationSignalsFormatted: stringVar_(evaluationSignalsFormatted),
      avgEngagementScore: stringVar_(String(profile.avg_engagement_score != null ? profile.avg_engagement_score : 0)),
      extraCreditCount: stringVar_(String(profile.extra_credit_count != null ? profile.extra_credit_count : 0)),
      shadowArchetypeNote: stringVar_(profile.shadow_archetype_note || ""),
      competenciesAddressedCount: stringVar_(competenciesAddressedCount),
      totalCompetencies: stringVar_(totalCompetencies),
    });
  } catch (e) {
    return emptyArchetypeOutput_("UNEXPECTED_ERROR: " + e.message);
  }
}

function emptyArchetypeOutput_(status) {
  var emptyFields = [
    "mode", "archetype", "firstName", "warmupAnchor", "pacingUnitName", "pacingStage",
    "courseObjective", "pacingPriorConnection", "pacingKeyVocabulary", "courseName",
    "objective", "activity", "vocabulary", "priorConnection", "competencyTextsFormatted",
    "competencyGapsFormatted", "evaluationSignalsFormatted", "avgEngagementScore",
    "extraCreditCount", "shadowArchetypeNote", "competenciesAddressedCount", "totalCompetencies",
  ];
  var out = { selectionStatus: stringVar_(status) };
  for (var i = 0; i < emptyFields.length; i++) out[emptyFields[i]] = stringVar_("");
  return buildOutputRenderAction_(out);
}

// Two-layer selection: shadow matrix overrides first (definite, then
// early-unit), decision table second (priority order confirmed in the
// spec's own prose: PROVOCATION -> PARADOX -> CONCRETE SCENARIO ->
// BRIDGE), fixed fallback order last (BRIDGE -> CONCRETE SCENARIO ->
// PARADOX, per the spec).
function selectArchetype_(lesson, profile) {
  var shadowMatrix = profile.shadow_matrix || {};
  var unitCurrent = profile.unit_current || "";
  var shadowEntry = unitCurrent ? shadowMatrix[unitCurrent] : null;

  if (shadowEntry && typeof shadowEntry.cross_confidence === "number" &&
      shadowEntry.cross_confidence >= SHADOW_CROSS_CONFIDENCE_THRESHOLD_ &&
      shadowEntry.best_archetype) {
    return normalizeArchetypeName_(shadowEntry.best_archetype);
  }

  if (shadowEntry && typeof shadowEntry.within_confidence === "number" &&
      shadowEntry.within_confidence < SHADOW_WITHIN_CONFIDENCE_EARLY_UNIT_THRESHOLD_) {
    return ARCHETYPES_.BRIDGE;
  }

  var signals = profile.evaluation_signals || [];
  var avgEngagement = Number(profile.avg_engagement_score || 0);
  var gaps = profile.competency_gaps || [];
  var extraCreditCount = Number(profile.extra_credit_count || 0);

  var allStrengths = unionIndicatorTags_(signals, "strengths");
  var allGaps = unionIndicatorTags_(signals, "gaps");

  // Priority order confirmed directly in the spec's own prose (the
  // decision TABLE lists them PARADOX/CONCRETE SCENARIO/BRIDGE/
  // PROVOCATION, but the evaluation ORDER stated separately is
  // PROVOCATION -> PARADOX -> CONCRETE SCENARIO -> BRIDGE).
  if (avgEngagement >= 2.5 && extraCreditCount >= 1 && !hasPersistentGap_(signals)) {
    return ARCHETYPES_.PROVOCATION;
  }
  if (avgEngagement >= 2.5 &&
      (allStrengths.indexOf("analysis") !== -1 || allStrengths.indexOf("critical_thinking") !== -1) &&
      allGaps.indexOf("application") !== -1) {
    return ARCHETYPES_.PARADOX;
  }
  if (avgEngagement >= 1.5 &&
      (allGaps.indexOf("analysis") !== -1 || allGaps.indexOf("critical_thinking") !== -1) &&
      allStrengths.indexOf("application") !== -1) {
    return ARCHETYPES_.CONCRETE_SCENARIO;
  }
  if (gaps.length > 0) {
    return ARCHETYPES_.BRIDGE;
  }

  // Fixed fallback order, per the spec: "A student with no evaluation
  // history and no warm-up history receives a BRIDGE prompt."
  //
  // NOTE: the decision table's own BRIDGE check above (gaps.length > 0)
  // already covers the case the spec describes here -- a brand-new
  // student has "all competencies technically gaps," so gaps.length > 0
  // is already true and the function has already returned BRIDGE before
  // reaching this point. This block only runs when gaps.length === 0
  // (every competency already addressed) AND none of the other three
  // conditions matched -- a genuinely rare case the spec's fallback
  // language doesn't precisely anticipate. Falling through the stated
  // order (BRIDGE, then CONCRETE SCENARIO, then PARADOX) with BRIDGE
  // already ruled out by definition at this point:
  if (allGaps.length > 0 || allStrengths.length > 0) return ARCHETYPES_.CONCRETE_SCENARIO;
  return ARCHETYPES_.PARADOX;
}

// shadow_matrix.best_archetype is written by 23_StudentProfileManager.js
// as free text (e.g. "PARADOX") -- normalized here defensively in case
// it ever carries different casing or the "CONCRETE SCENARIO" (with a
// space) form the HTML spec uses in prose, rather than this file's own
// CONCRETE_SCENARIO constant.
function normalizeArchetypeName_(raw) {
  var upper = String(raw).toUpperCase().replace(/\s+/g, "_");
  if (upper === "CONCRETE" || upper === "CONCRETE_SCENARIO") return ARCHETYPES_.CONCRETE_SCENARIO;
  if (upper === "PARADOX") return ARCHETYPES_.PARADOX;
  if (upper === "BRIDGE") return ARCHETYPES_.BRIDGE;
  if (upper === "PROVOCATION") return ARCHETYPES_.PROVOCATION;
  return ARCHETYPES_.BRIDGE; // safest default if shadow matrix ever writes something unrecognized
}

function unionIndicatorTags_(signals, key) {
  var out = [];
  for (var i = 0; i < signals.length; i++) {
    var indicators = signals[i] && signals[i].indicators;
    var tags = (indicators && indicators[key]) || [];
    for (var j = 0; j < tags.length; j++) {
      if (out.indexOf(tags[j]) === -1) out.push(tags[j]);
    }
  }
  return out;
}

// "No persistent gaps" -- read as: no single gap tag recurs across 2 or
// more of the (up to 3) evaluation_signals entries. See this file's
// header note on this interpretive choice.
function hasPersistentGap_(signals) {
  var counts = {};
  for (var i = 0; i < signals.length; i++) {
    var indicators = signals[i] && signals[i].indicators;
    var gaps = (indicators && indicators.gaps) || [];
    for (var j = 0; j < gaps.length; j++) {
      counts[gaps[j]] = (counts[gaps[j]] || 0) + 1;
      if (counts[gaps[j]] >= 2) return true;
    }
  }
  return false;
}

// Prefers the newer competency_rubrics structure (added by Script 32's
// addRubricsToSnapshot_) when present, falls back to the older
// competency_texts array otherwise -- both exist in the live snapshot
// object depending on when addRubricsToSnapshot_ last ran successfully
// (24_WarmUpBridge.js falls back to competency_texts if that call
// throws). Either way this produces plain, readable text for the
// prompt template -- Gemini doesn't need the raw JSON shape.
function formatCompetencyTexts_(lesson) {
  var items = lesson.competency_rubrics || lesson.competency_texts || [];
  if (!items.length) return "";
  var lines = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    lines.push("- " + (item.id || "") + ": " + (item.text || ""));
  }
  return lines.join("\n");
}

function formatList_(arr) {
  if (!arr || !arr.length) return "None";
  return arr.join(", ");
}

function formatEvaluationSignals_(signals) {
  if (!signals || !signals.length) return "No prior evaluation history.";
  var lines = [];
  for (var i = 0; i < signals.length; i++) {
    var s = signals[i];
    var indicators = s.indicators || {};
    lines.push(
      "- " + (s.date || "") + ": " + (s.note || "") +
      " (strengths: " + formatList_(indicators.strengths) +
      "; gaps: " + formatList_(indicators.gaps) + ")"
    );
  }
  return lines.join("\n");
}
