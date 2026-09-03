// =============================================================================
// FILE: 40_FlowPrompts.js
// BOUND TO: Central Ledger spreadsheet
// TRIGGERS: none — manual entry points:
//             syncFlowPromptsToSheet()  — write every prompt to the FlowPrompts tab
//             checkFlowPrompts()        — report what's synced and what drifted
//
// PURPOSE: one deployable home for every Studio Flow's system prompt, so
// changing a prompt is a `clasp push` plus one function run instead of a
// hand-paste into each flow's Ask Gemini step.
//
// THE GAP THIS CLOSES: before this file, five of the six prompt texts had no
// deployable home at all —
//
//   Flow 1        15_StudioFlowPrompts.js, which project-map.json lists under
//                 _excluded_not_deployed_scripts. Never pushed anywhere.
//   Flow 2        15b_StudioFlowPrompts_Flow2_Revised.js — the one exception,
//                 genuinely deployed with cas-ccps:central-ledger.
//   Flow 3 A/B    docs/CAS_Flow3_Flow4_Specification.html
//   Flow 4        the same HTML
//   Flow 5        the same HTML
//
// A prompt living only in a rendered HTML spec means every update is a
// copy-paste out of a browser and into Studio's UI, with the doc's own
// `<span class="kw">` markup interleaved through the text so the paste isn't
// even clean. There is no version history of what the live prompt actually
// says, and no way to tell whether Studio matches the spec.
//
// PROVENANCE — THE TEXT BELOW WAS EXTRACTED MECHANICALLY, NOT RETYPED. The
// Flow 3/4/5 constants were lifted from the HTML spec's own `prompt-body` and
// `<pre>` blocks by script (strip `<span class="kw">` wrappers, strip tags,
// unescape entities, trim), and FLOW_1_PROMPT was copied from
// 15_StudioFlowPrompts.js's own FLOW_1_SYSTEM_PROMPT. Nothing was
// paraphrased, reordered, or "improved" in transit —
// tests/cas-ccps/flow-prompts.test.js re-runs that same extraction against
// the HTML and against file 15 and fails if either has drifted from what's
// here. If you change a prompt, change it HERE and let that test tell you the
// spec doc now disagrees.
//
// TWO PLACEHOLDER STYLES, BOTH DELIBERATE: Flows 1 and 2 use
// {{DOUBLE_BRACE}}; Flows 3, 4 and 5 use {single_brace}. That split is how
// the two sources were authored and is not worth a rewrite of five prompts to
// unify — substituteFlowPrompt_() handles both.
//
// HOW THIS BECOMES A CHIP IN STUDIO: syncFlowPromptsToSheet() writes one row
// per prompt to a FlowPrompts tab on this spreadsheet. Because that tab lives
// on the one spreadsheet every native Studio step can already target through
// its fixed picker, a flow can read its own prompt with a "Get sheet
// contents" step (Find: prompt_key = the flow's key) and bind the resulting
// `prompt_text` chip straight into Ask Gemini's instructions field — instead
// of carrying a pasted copy that silently ages.
//
// For Flow 2 specifically there's a shorter path that needs no extra step:
// 37_FlowInputBuilder.js writes the fully-substituted prompt into FlowInput's
// own PromptText column, so it's already on the trigger row as
// @trigger.PromptText. See that file's own note on the one placeholder it
// deliberately leaves unsubstituted.
// =============================================================================

// Flow 1 — Rubric Extraction. Byte-identical to 15_StudioFlowPrompts.js's
// FLOW_1_SYSTEM_PROMPT; that file stays as the annotated reference (its
// per-placeholder mapping comments are worth keeping) but is not deployed,
// so this is the copy a running project can actually read.
const FLOW_1_PROMPT = `
You are a curriculum structure parser for an automated academic assignment system.

Your task is to read a teacher's evaluation rubric and map it to a strict JSON schema.
This JSON will be used to configure an AI evaluation engine that gives students
structured feedback on their work.

COURSE CONTEXT:
Course: {{COURSE_NAME}}
Academic Tier: {{TIER}}

ASSIGNMENT PROMPT TEMPLATE (for context only — do not evaluate this):
{{PROMPT_TEMPLATE_TEXT}}

INSTRUCTIONS:
- Read the rubric text below carefully.
- Extract the four most important and distinct evaluation criteria as milestones.
- If more than four criteria exist, synthesize and consolidate into the four most essential.
- If any field cannot be confidently extracted, infer a reasonable value from the course context and tier.
- The definitionOfDone must be comprehensive — it is hidden from students and used as the final evaluation gate.
- Return ONLY valid JSON. No markdown fences. No preamble. No explanation. No trailing text.
- Your entire response must begin with { and end with }.

REQUIRED JSON SCHEMA:
{
  "unitName": "string — the specific name or title of this assignment",
  "persona": "string — the AI evaluator coaching persona. Must be specific to the subject matter. Examples: 'rigorous AP Biology writing coach', 'Socratic AP History tutor', 'professional technical writing editor', 'empathetic creative writing mentor'",
  "milestone1": "string — first major evaluation criterion. Must be specific and assessable, not vague. Include what evidence or demonstration is required.",
  "milestone2": "string — second major evaluation criterion.",
  "milestone3": "string — third major evaluation criterion.",
  "milestone4": "string — fourth major evaluation criterion. Should represent the highest-order thinking required.",
  "definitionOfDone": "string — the complete hidden passing standard. Include ALL of: minimum quality thresholds for each milestone, any structural or formatting requirements, evidence standards, and the overall benchmark that distinguishes passing from failing work. This must be specific enough that a consistent pass/fail decision can be made from it alone."
}

RUBRIC TEXT TO PARSE:
{{RUBRIC_TEXT}}
`.trim();

// Flow 3 — Warm-Up Generation, Mode A. Used when warmup_anchor is present in
// lesson_context_snapshot: a teacher-authored anchor exists, so Flow 3's job
// is to adapt it to this student, not to invent a prompt.
const FLOW_3_PROMPT_MODE_A = `
You are personalizing a warm-up prompt for a high school CTE student in a Sports, Entertainment, and Event Management/Marketing course.

YOUR ROLE:
A teacher has written a seed prompt — a warmup anchor — that establishes the pedagogical angle and industry grounding for today's class. Your job is to adapt that anchor for this specific student based on their learning history. You are not rewriting the anchor. You are adjusting its cognitive demand, emphasis, and framing to match where this student is right now.

The final prompt must feel like it was written for this student specifically — not like a template that was filled in.

TEACHER'S ANCHOR PROMPT:
{warmup_anchor}

UNIT CONTEXT:
Unit: {pacing_unit_name} (Stage {pacing_stage})
Course objective for this unit: {course_objective}
Prior lesson connection: {pacing_prior_connection}
Key vocabulary in play: {pacing_key_vocabulary}

TODAY'S LESSON:
Course: {course_name}
Objective: {objective}
Competencies addressed: {competency_texts_formatted}

STUDENT CONTEXT:
Name: {first_name}
Competency gaps today (areas not yet covered): {competency_gaps_formatted}

Evaluation history (last 3 assignments):
{evaluation_signals_formatted}

Warm-up engagement history:
Average engagement score: {avg_engagement_score} / 3.0
Extra credit replies submitted: {extra_credit_count}

Shadow matrix — archetype confidence for this unit:
{shadow_archetype_note}

ARCHETYPE SELECTED: {archetype}

How to apply each archetype to the anchor:
PARADOX — The anchor already contains a tension. Sharpen it. Make the contradiction more explicit for a student who processes ideas conceptually. Don't resolve it — that's what class is for.
CONCRETE SCENARIO — The anchor is abstract. Ground it. Add a specific, real-sounding situation that a student who thinks in examples can grab onto before they lift to the concept.
BRIDGE — The anchor assumes prior exposure. Add a sentence that connects today's anchor to something this student has already covered, named specifically from their competency history.
PROVOCATION — The anchor is too comfortable for this student. Raise the stakes. Add an implication or an edge case that has no easy answer and rewards exactly the kind of knowledge this student has been building.

ADAPTATION CONSTRAINTS — follow all of these without exception:
1. Preserve the anchor's core question and industry example. Do not replace them.
2. You may add 1–2 sentences of framing before or after the anchor.
3. The final prompt is 3 to 5 sentences total including any framing you add.
4. Never use a list, bullet point, or numbered items.
5. Exactly one open question — the anchor's question, sharpened if needed.
6. Never mention grades, points, scores, or evaluation.
7. Never use the words "today" or "lesson."
8. Never reference the student's past performance explicitly.
9. Write in second person ("you", "your").
10. If the anchor already perfectly fits the archetype and student — return it unchanged. Do not adapt for the sake of adapting.

OUTPUT FORMAT:
Return only the adapted warm-up prompt text. No preamble, no label, no explanation. Just the prompt — 3 to 5 sentences ending in one open question.
`.trim();

// Flow 3 — Warm-Up Generation, Mode B. Used when warmup_anchor is null (no
// pacing guide loaded yet): Flow 3 generates from scratch.
const FLOW_3_PROMPT_MODE_B = `
You are generating a warm-up prompt for a high school CTE student in a Sports, Entertainment, and Event Management/Marketing course.

YOUR ROLE:
You write cognitive entry points — not review questions, not preview questions. A cognitive entry point makes a student think before the lesson begins, creates productive tension that the lesson resolves, and is interesting enough that a student who doesn't have to engage probably will anyway. It never feels like homework.

TODAY'S LESSON:
Course: {course_name}
Objective: {objective}
Activity: {activity}
Key vocabulary: {vocabulary}
Connection to prior lesson: {prior_connection}
Competencies addressed: {competency_texts_formatted}

STUDENT CONTEXT:
Name: {first_name}
Competencies this student has already covered this term: {competencies_addressed_count} of {total_competencies}
New competency areas introduced today: {competency_gaps_formatted}

Evaluation history (last 3 assignments):
{evaluation_signals_formatted}

Warm-up engagement history:
Average engagement score: {avg_engagement_score} / 3.0
Extra credit replies submitted: {extra_credit_count}

ARCHETYPE SELECTED: {archetype}

Archetype definitions:
PARADOX — Surface a genuine contradiction. Two things both seem true but can't both be right without nuance the lesson provides. Student is conceptually strong, struggles with application.
CONCRETE SCENARIO — Present a specific real-sounding industry situation requiring judgment. Abstraction emerges from the scenario. Student works well with tangible problems.
BRIDGE — Connect today's new competency domain to something the student has already covered. Activate prior knowledge. Reduce friction of new material.
PROVOCATION — A genuine intellectual challenge with no easy answer. No scaffolding. Rewards prior knowledge. For students who are strong across the board.

WRITING CONSTRAINTS — follow all of these without exception:
1. 3 to 5 sentences maximum. Not a word more.
2. Never use a list, bullet point, or numbered items.
3. Never use fill-in-the-blank format.
4. Never ask more than one question. The prompt ends with exactly one question.
5. The question must be open-ended — no yes/no questions.
6. Never mention grades, points, scores, or evaluation.
7. Never use the words "today" or "lesson" — the student already knows what day it is.
8. Never reference the student's past performance explicitly — use it to inform the angle, not the content.
9. Write in second person ("you", "your") — address the student directly.
10. Industry-grounded — the scenario or example must be real or plausible in sports, entertainment, or event contexts. No generic business examples.
11. Vocabulary words may appear naturally but must not be defined — the prompt assumes the student will encounter the definition in class.

OUTPUT FORMAT:
Return only the warm-up prompt text. No preamble, no label, no explanation, no quotation marks around the output. Just the prompt itself — 3 to 5 sentences ending in one open question.
`.trim();

// Flow 4 — Warm-Up Evaluation. Returns JSON only:
// { "grammar": 0|1, "engagement": 0|1|2|3, "feedback": "..." }
const FLOW_4_PROMPT = `
You are evaluating a high school CTE student's warm-up response in a Sports, Entertainment, and Event Management/Marketing course.

THE WARM-UP PROMPT WAS:
{original_prompt_text}

THE STUDENT'S RESPONSE:
{response_text}

WORD COUNT SCORE (already computed — do not re-evaluate):
{word_count_score} / 6 points

YOUR TASK:
Evaluate the response on exactly two criteria:

1. GRAMMAR AND SENTENCE STRUCTURE — 0 or 1 point
   Award 1 point if the response consists of cohesive sentences with no errors that significantly impede comprehension.
   Award 0 points if errors significantly impede comprehension.
   Minor errors (comma splices, informal register) do not reduce the score.
   Context: this is a verbal warm-up written in class, not a formal essay.

2. ENGAGEMENT — 0, 1, 2, or 3 points
   3 = Genuine. Directly addresses the prompt with original thought. Shows the student actually considered the question.
   2 = Surface. On-topic but formulaic, thin, or restates the question without extending it.
   1 = Minimal. Tangentially related, or so brief that genuine engagement cannot be confirmed.
   0 = Off-topic or filler. Does not engage with the prompt at all.

FEEDBACK WRITING RULES — all mandatory:
- Write 1 to 3 sentences of pedagogical feedback.
- NEVER mention points, scores, grades, or evaluation criteria.
- NEVER say "good job", "well done", or similar praise without substance.
- NEVER say "you need to improve" or similar deficit framing.
- Write something that advances the student's thinking about today's topic.
- The student will read this before the next class. It should make them want to think more.
- If the response was genuine (score 3): push further. Ask the implicit next question.
- If the response was surface (score 2): make the depth visible. Show what a deeper answer would look at.
- If the response was minimal (score 1): find the thread of engagement and pull it.
- If the response was off-topic (score 0): write one sentence connecting what they wrote to the actual prompt.

OUTPUT FORMAT — strict:
Return ONLY valid JSON. No preamble, no markdown, no explanation outside the JSON.
{
  "grammar": 0 or 1,
  "engagement": 0, 1, 2, or 3,
  "feedback": "your feedback text here"
}
`.trim();

// Flow 5 — Warm-Up Bridging. Temperature 0.4, max 150 tokens per the spec —
// connective, not generative.
const FLOW_5_PROMPT = `
You are writing a one-paragraph bridge for a high school CTE student in a Sports, Entertainment, and Event Management/Marketing course.

YOUR ROLE:
The student wrote a warm-up response in a previous class. Today's lesson builds on what they engaged with. Write 2-3 sentences that make that connection explicit - what they thought about before, how it leads to today, and why that matters. The bridge goes at the top of their warm-up doc before the new prompt.

WHAT THE STUDENT WROTE LAST TIME:
{flow5_prior_response}

HOW TODAY CONNECTS TO THE PRIOR LESSON:
{pacing_prior_connection}

TODAY'S COURSE:
{course_name}

CONSTRAINTS:
1. Exactly 2-3 sentences. No more, no less.
2. Address the student in second person ("you", "your").
3. Reference what they actually wrote - name a specific idea if they expressed one.
4. Do not preview today's lesson - only make the connection to the prior one.
5. Never mention grades, scores, or warm-ups.
6. Avoid "last time" - use "recently" or "in your last response" at most once.
7. End with a sentence that creates forward momentum.
8. If the prior response is too short or generic to reference, use only pacing_prior_connection.

OUTPUT FORMAT:
Return only the bridge paragraph. No label, no preamble. 2-3 sentences.
`.trim();

// =============================================================================
// REGISTRY
//
// Flow 2 is intentionally absent from the text constants above and resolved
// through FLOW_2_SYSTEM_PROMPT instead: that constant is declared by
// 15b_StudioFlowPrompts_Flow2_Revised.js, bound to this same GAS project, so
// a second copy here would both collide at parse time and immediately start
// drifting. Referencing it keeps one source of truth.
// =============================================================================

const FLOW_PROMPT_KEYS = [
  "FLOW_1", "FLOW_2", "FLOW_3_MODE_A", "FLOW_3_MODE_B", "FLOW_4", "FLOW_5",
];

const FLOW_PROMPT_TAB = "FlowPrompts";

const FLOW_PROMPT_HEADERS = [
  "prompt_key", "flow", "title", "placeholders", "chars", "synced_at", "prompt_text",
];

// Returns the raw, unsubstituted prompt text for a key, or "" if unknown.
// Kept as a function rather than a literal map so FLOW_2_SYSTEM_PROMPT is
// read at call time — a top-level map object would capture it at parse time,
// and GAS's file concatenation order across a project is not something worth
// depending on.
function flowPromptText_(key) {
  switch (key) {
    case "FLOW_1":        return FLOW_1_PROMPT;
    case "FLOW_2":        return FLOW_2_SYSTEM_PROMPT;
    case "FLOW_3_MODE_A": return FLOW_3_PROMPT_MODE_A;
    case "FLOW_3_MODE_B": return FLOW_3_PROMPT_MODE_B;
    case "FLOW_4":        return FLOW_4_PROMPT;
    case "FLOW_5":        return FLOW_5_PROMPT;
    default:              return "";
  }
}

function flowPromptMeta_(key) {
  switch (key) {
    case "FLOW_1":        return { flow: "1", title: "Rubric Extraction" };
    case "FLOW_2":        return { flow: "2", title: "Student Evaluation" };
    case "FLOW_3_MODE_A": return { flow: "3", title: "Warm-Up Generation — Mode A (anchor-aware)" };
    case "FLOW_3_MODE_B": return { flow: "3", title: "Warm-Up Generation — Mode B (generative)" };
    case "FLOW_4":        return { flow: "4", title: "Warm-Up Evaluation" };
    case "FLOW_5":        return { flow: "5", title: "Warm-Up Bridging" };
    default:              return { flow: "?", title: "unknown" };
  }
}

// Every placeholder a prompt actually contains, both brace styles, sorted.
// Useful for spotting a `vars` object that's missing a field before Gemini
// gets a prompt with a literal {{UNIT_NAME}} still in it.
function flowPromptPlaceholders_(text) {
  const found = {};
  const doubles = String(text).match(/\{\{[A-Za-z_0-9]+\}\}/g) || [];
  const singles = String(text).match(/\{[a-z_0-9]+\}/g) || [];
  doubles.concat(singles).forEach(function (p) { found[p] = true; });
  return Object.keys(found).sort();
}

// ---------------------------------------------------------------------------
// substituteFlowPrompt_ — fills a prompt's placeholders from `vars`.
//
// Accepts keys in any of the three shapes a caller might reasonably hold:
// "UNIT_NAME", "{{UNIT_NAME}}", or "unit_name" — so the same vars object
// works against a {{DOUBLE_BRACE}} prompt (Flows 1-2) and a {single_brace}
// one (Flows 3-5) without the caller tracking which style it's targeting.
//
// `keepUnmatched` controls the one genuinely important behaviour: a
// placeholder with no matching var. Default is to leave it in place, because
// silently blanking it produces a prompt that looks complete and asks Gemini
// to evaluate against nothing. 37_FlowInputBuilder.js relies on this to leave
// {{STUDENT_TEXT}} standing while substituting everything else.
// ---------------------------------------------------------------------------
function substituteFlowPrompt_(text, vars, keepUnmatched) {
  let out = String(text || "");
  const lookup = {};
  Object.keys(vars || {}).forEach(function (rawKey) {
    const bare = rawKey.replace(/^\{+|\}+$/g, "");
    lookup[bare.toUpperCase()] = vars[rawKey];
  });

  const resolve = function (whole, bare) {
    const hit = lookup[bare.toUpperCase()];
    if (hit === undefined || hit === null) {
      return keepUnmatched === false ? "" : whole;
    }
    return String(hit);
  };

  out = out.replace(/\{\{([A-Za-z_0-9]+)\}\}/g, resolve);
  out = out.replace(/\{([a-z_0-9]+)\}/g, resolve);
  return out;
}

// Public resolver: getFlowPrompt("FLOW_5", { flow5_prior_response: "…" }).
// Pass no vars to get the raw template.
function getFlowPrompt(key, vars) {
  const text = flowPromptText_(key);
  if (!text) {
    Logger.log("[Prompts] Unknown prompt key \"" + key + "\". Known: " +
               FLOW_PROMPT_KEYS.join(", "));
    return "";
  }
  return vars ? substituteFlowPrompt_(text, vars, true) : text;
}

// ---------------------------------------------------------------------------
// syncFlowPromptsToSheet — write every prompt to the FlowPrompts tab.
//
// Rewrites the whole tab rather than patching rows, so a prompt that was
// removed from the registry can't linger in the sheet as a stale row a flow
// is still reading. Idempotent by construction.
//
// A Google Sheets cell holds 50,000 characters; the longest prompt here is
// well under 4,000, so no chunking is needed — but the guard below reports it
// rather than letting Sheets truncate silently if a prompt ever grows past it.
// ---------------------------------------------------------------------------
function syncFlowPromptsToSheet() {
  const CELL_LIMIT = 50000;
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  let sheet = ss.getSheetByName(FLOW_PROMPT_TAB);
  if (!sheet) sheet = ss.insertSheet(FLOW_PROMPT_TAB);

  const now = new Date();
  const rows = [FLOW_PROMPT_HEADERS.slice()];
  let oversize = 0;

  FLOW_PROMPT_KEYS.forEach(function (key) {
    const text = flowPromptText_(key);
    if (!text) {
      Logger.log("[Prompts] " + key + " resolved to empty text — skipped. If this is " +
                 "FLOW_2, 15b_StudioFlowPrompts_Flow2_Revised.js isn't loaded in this project.");
      return;
    }
    if (text.length > CELL_LIMIT) {
      oversize++;
      Logger.log("[Prompts] ⚠️ " + key + " is " + text.length + " characters, past the " +
                 CELL_LIMIT + "-character cell limit — Sheets will truncate it. Split " +
                 "the prompt or read it from a Doc instead.");
    }
    const meta = flowPromptMeta_(key);
    rows.push([
      key, meta.flow, meta.title,
      flowPromptPlaceholders_(text).join(" "),
      text.length, now, text,
    ]);
  });

  sheet.clear();
  sheet.getRange(1, 1, rows.length, FLOW_PROMPT_HEADERS.length).setValues(rows);
  sheet.getRange(1, 1, 1, FLOW_PROMPT_HEADERS.length)
    .setFontWeight("bold").setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();

  Logger.log("[Prompts] Synced " + (rows.length - 1) + " prompt(s) to the " +
             FLOW_PROMPT_TAB + " tab" + (oversize ? " (" + oversize + " oversize!)" : "") + ".");
  Logger.log("[Prompts] In Studio: add a \"Get sheet contents\" step on this " +
             "spreadsheet's " + FLOW_PROMPT_TAB + " tab, Find prompt_key = the flow's key, " +
             "then bind the prompt_text chip into Ask Gemini's instructions field.");
  return { synced: rows.length - 1, oversize: oversize };
}

// ---------------------------------------------------------------------------
// checkFlowPrompts — read-only. Reports whether the sheet matches the code,
// which is the question that matters after someone edits a prompt: did the
// clasp push actually reach the tab the flows read?
// ---------------------------------------------------------------------------
function checkFlowPrompts() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(FLOW_PROMPT_TAB);
  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log("[Prompts] " + FLOW_PROMPT_TAB + " tab is missing or empty — run " +
               "syncFlowPromptsToSheet().");
    return { inSync: 0, drifted: 0, missing: FLOW_PROMPT_KEYS.length };
  }

  const data = sheet.getDataRange().getValues();
  const keyCol = FLOW_PROMPT_HEADERS.indexOf("prompt_key");
  const textCol = FLOW_PROMPT_HEADERS.indexOf("prompt_text");
  const onSheet = {};
  for (let i = 1; i < data.length; i++) {
    onSheet[String(data[i][keyCol]).trim()] = String(data[i][textCol]);
  }

  let inSync = 0, drifted = 0, missing = 0;
  FLOW_PROMPT_KEYS.forEach(function (key) {
    const code = flowPromptText_(key);
    if (!code) return;
    if (!(key in onSheet)) {
      missing++;
      Logger.log("[Prompts] ⬜ " + key + " — not on the sheet at all.");
    } else if (onSheet[key] !== code) {
      drifted++;
      Logger.log("[Prompts] ⚠️ " + key + " — sheet differs from code (" +
                 onSheet[key].length + " chars on sheet vs " + code.length +
                 " in code). Re-run syncFlowPromptsToSheet().");
    } else {
      inSync++;
      Logger.log("[Prompts] ✅ " + key + " — in sync.");
    }
  });

  Logger.log("[Prompts] " + inSync + " in sync, " + drifted + " drifted, " +
             missing + " missing.");
  return { inSync: inSync, drifted: drifted, missing: missing };
}
