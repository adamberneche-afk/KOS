'use strict';
// ================================================================
// inference.js — Prompt assembly and Claude API inference
// ================================================================
// This is the proprietary core of the service. The prompt
// assembles operator-specific context from their calibration
// state, vector history, and shadow matrix to produce inference
// that improves with every session.
// ================================================================

const Anthropic = require('@anthropic-ai/sdk');
const Ajv       = require('ajv');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ajv    = new Ajv({ allErrors: true, coerceTypes: true });


// ── Output JSON Schema (for validation) ──────────────────────────

const OUTPUT_SCHEMA = {
  type: 'object',
  required: ['session_uid', 'session_summary', 'dynamic_state', 'vector_weights', 'alignment_report'],
  properties: {
    session_uid:      { type: 'string' },
    session_summary:  { type: 'string', minLength: 10 },
    session_metadata: {
      type: 'object',
      properties: {
        session_type: { type: 'string', enum: ['WORKING','PLANNING','REVIEW','DEBRIEF'] },
        cold_start:   { type: 'boolean' },
        rtp_version:  { type: 'string' },
      },
    },
    dynamic_state: {
      type: 'object',
      properties: {
        next_steps:           { type: 'array', items: { type: 'string' } },
        deferred_decisions:   { type: 'array' },
        pivots_and_lessons:   { type: 'array', items: { type: 'string' } },
      },
    },
    vector_weights: {
      type: 'object',
      required: ['ARCHITECTURE','UI','SECURITY','PEDAGOGY','GAS_DEVELOPMENT','RELATIONAL'],
      properties: {
        ARCHITECTURE:    { type: 'number', minimum: 0, maximum: 1 },
        UI:              { type: 'number', minimum: 0, maximum: 1 },
        SECURITY:        { type: 'number', minimum: 0, maximum: 1 },
        PEDAGOGY:        { type: 'number', minimum: 0, maximum: 1 },
        GAS_DEVELOPMENT: { type: 'number', minimum: 0, maximum: 1 },
        RELATIONAL:      { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    cog_registry:    { type: 'object' },
    action_exhaust:  { type: 'array' },
    session_delta:   { type: 'object' },
    alignment_report: {
      type: 'object',
      required: ['relational_status_at_closeout'],
      properties: {
        relational_status_at_closeout:    { type: 'string', enum: ['GREEN','YELLOW','RED'] },
        thresholds_crossed_this_session:  { type: 'array' },
        mandatory_pauses_issued:          { type: 'number' },
      },
    },
    alignment_observations: { type: 'object' },
  },
};

const validate = ajv.compile(OUTPUT_SCHEMA);


// ── Prompt assembly ───────────────────────────────────────────────

/**
 * Assembles the system prompt using all available operator context.
 * The more sessions a user has processed, the richer this context
 * becomes — this is the compounding advantage made concrete.
 *
 * @param  {Object} operatorMeta   Metadata stored with the user record.
 * @param  {Object} driveContext   Context read from their spreadsheet.
 * @returns {string} System prompt.
 */
function buildSystemPrompt(operatorMeta, driveContext) {
  const {
    email,
    operatorRole      = 'Knowledge worker',
    deploymentType    = 'INDIVIDUAL',
    vision90Day       = '',
    adminGhost        = '',
    necessaryStruggle = '',
    relationalTargets = '',
    socraticThreshold = 0.75,
    themeArchitecture = 0.75,
    themePedagogy     = 0.75,
    themeFamilyAlign  = 0.75,
    shadowMatrix      = {},
  } = operatorMeta;

  const {
    recentVectors    = [],
    sessionCount     = 0,
    sessionSummaries = [],
  } = driveContext;

  // Format shadow matrix for prompt
  const shadowLines = Object.entries(shadowMatrix).map(([key, val]) => {
    const pct    = Math.round((val.confidence || 0) * 100);
    const status = val.status || 'UNKNOWN';
    const value  = val.inferred_value ? ` — "${val.inferred_value}"` : '';
    return `  ${key.padEnd(24)} ${status.padEnd(14)} ${pct}%${value}`;
  }).join('\n') || '  [No shadow matrix data yet — this is an early session]';

  // Format recent vector history
  const vectorHistory = recentVectors.length > 0
    ? recentVectors.map(v =>
        `  ${v.timestamp.substring(0,10)}  ARCH:${v.ARCHITECTURE.toFixed(2)}  UI:${v.UI.toFixed(2)}  ` +
        `SEC:${v.SECURITY.toFixed(2)}  PED:${v.PEDAGOGY.toFixed(2)}  GAS:${v.GAS_DEVELOPMENT.toFixed(2)}  REL:${v.RELATIONAL.toFixed(2)}`
      ).join('\n')
    : '  [No prior sessions — this is the first session]';

  // Format recent summaries
  const recentSummaries = sessionSummaries.length > 0
    ? sessionSummaries.map((s, i) => `  ${i + 1}. ${s}`).join('\n')
    : '  [No prior sessions]';

  return `You are the KOS inference engine — a structured knowledge extraction system calibrated to a specific operator's working context.

Your job is to read a working session and extract structured intelligence from it. You do not generate, invent, or speculate beyond what is present in the session. You extract what is there and structure it precisely.

═══ OPERATOR PROFILE ═══════════════════════════════════════
Role             : ${operatorRole}
Deployment type  : ${deploymentType}
Sessions to date : ${sessionCount}
90-Day Vision    : ${vision90Day || '[Not yet defined]'}

WHAT STEALS THEIR TIME (Admin Ghost):
${adminGhost || '[Not yet identified]'}

WHAT THEY REFUSE TO AUTOMATE (Necessary Struggle):
${necessaryStruggle || '[Not yet identified]'}

WHO THIS SYSTEM PROTECTS TIME FOR (Relational Targets):
${relationalTargets || '[Not yet identified]'}

═══ CALIBRATION STATE ═══════════════════════════════════════
SOCRATIC_THRESHOLD   : ${socraticThreshold}
THEME_ARCHITECTURE   : ${themeArchitecture}
THEME_PEDAGOGY       : ${themePedagogy}
THEME_FAMILY_ALIGN   : ${themeFamilyAlign}

Calibration note: Vector weights you assign will be multiplied
by (theme_calibration / 0.75) in the KOS pipeline. Score based
on raw session presence — KOS applies the calibration.

═══ AMBIENT CALIBRATION (SHADOW MATRIX) ════════════════════
${shadowLines}

═══ RECENT VECTOR HISTORY (last ${recentVectors.length} sessions) ═════════════
${vectorHistory}

═══ RECENT SESSION SUMMARIES ═══════════════════════════════
${recentSummaries}

═══ EXTRACTION RULES ════════════════════════════════════════
1. Extract only what is present in the session. Do not generate content that wasn't discussed.
2. next_steps must be concrete and actionable — not vague intentions.
3. deferred_decisions must have a decision description and a blocking reason.
4. vector_weights: score 0.0–1.0 for each domain based on how prominently it featured in this specific session. 0.0 = not present, 1.0 = the entire session was about this domain.
5. alignment_report: relational_status_at_closeout must be GREEN, YELLOW, or RED. Use RED only if a relational boundary was clearly violated. YELLOW if one was approached. GREEN otherwise.
6. alignment_observations.confidence_deltas: use small values (0.02–0.08) when the session provides evidence for a shadow question. Use 0.0 when there is no relevant evidence. Do NOT use negative values.
7. Return ONLY the JSON object. No markdown, no code fences, no explanation before or after.

═══ OUTPUT SCHEMA ════════════════════════════════════════════
Return a single JSON object with these keys:
session_uid, session_summary, session_metadata, dynamic_state,
vector_weights, cog_registry, action_exhaust, session_delta,
alignment_report, alignment_observations

Full schema is defined in the KOS STUDIO_INTEGRATION_SPEC.`;
}


/**
 * Builds the COG_STIMULUS-specific system prompt.
 * Instructs the model to act as a specific persona in sequestered mode.
 *
 * @param  {string} personaName  e.g. 'PERSONA_ARCHITECT'
 * @returns {string}
 */
function buildCouncilSystemPrompt(personaName) {
  return `You are operating as ${personaName} in SEQUESTERED mode as part of the KOS Council Review Protocol (SMP-002).

BRIDGE_FIDELITY_001: You have NOT seen and MUST NOT reference the verdicts of any other cog. Your verdict is void if derived from knowledge of another cog's output.

The stimulus document you will receive contains:
1. Your persona definition
2. The current system state (context)
3. The active constraints and pivots (laws)
4. Specific inference instructions

Your response must be a single JSON object containing only:
{
  "session_uid": "the council ID from the stimulus header",
  "cog_registry": {
    "cog_verdicts": [{
      "cog": "${personaName}",
      "final_status": "APPROVED | FLAG | VETO",
      "summary": "One sentence verdict from your specific persona perspective"
    }]
  }
}

No other fields. No explanation. Valid JSON only.`;
}


// ── Main inference function ───────────────────────────────────────

/**
 * Runs inference on a session document using the Claude API.
 * Assembles operator context, calls the API, validates the output,
 * and returns the parsed JSON.
 *
 * @param  {Object} params
 * @param  {string} params.sessionText   Raw session text from the chunk doc.
 * @param  {string} params.payloadUid    Payload UID for the session_uid field.
 * @param  {string} params.payloadType   SESSION_LOG | COG_STIMULUS | EXTERNAL_DATA
 * @param  {Object} params.operatorMeta  Operator metadata from the user record.
 * @param  {Object} params.driveContext  Context read from their spreadsheet.
 * @returns {{ output, inputTokens, outputTokens, model }}
 */
async function runInference({ sessionText, payloadUid, payloadType, operatorMeta, driveContext }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

  let systemPrompt;
  if (payloadType === 'COG_STIMULUS') {
    // Extract persona name from the stimulus document header
    const personaMatch = sessionText.match(/Cog\s*:\s*(PERSONA_\w+)/i);
    const personaName  = personaMatch ? personaMatch[1] : 'PERSONA_UNKNOWN';
    systemPrompt = buildCouncilSystemPrompt(personaName);
  } else {
    systemPrompt = buildSystemPrompt(operatorMeta, driveContext);
  }

  const userMessage = payloadType === 'COG_STIMULUS'
    ? `Process this council stimulus:\n\n${sessionText}`
    : `Extract structured knowledge from this session. The session_uid should be "${payloadUid}".\n\n${sessionText}`;

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const rawOutput    = response.content[0]?.text || '';
  const inputTokens  = response.usage?.input_tokens  || 0;
  const outputTokens = response.usage?.output_tokens || 0;

  // Strip any accidental markdown fences the model adds
  const cleaned = rawOutput
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/,        '')
    .trim();

  // Parse and validate
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    throw new Error(`Model produced invalid JSON: ${parseErr.message}. Raw output (first 200 chars): ${cleaned.substring(0, 200)}`);
  }

  // Ensure session_uid is set
  if (!parsed.session_uid) {
    parsed.session_uid = payloadUid;
  }

  // Validate against schema
  const valid = validate(parsed);
  if (!valid) {
    const errors = validate.errors.map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`Output schema validation failed: ${errors}`);
  }

  return {
    output:       parsed,
    outputString: JSON.stringify(parsed, null, 2),
    inputTokens,
    outputTokens,
    model,
  };
}


// ── Credit cost helper ────────────────────────────────────────────

function getCreditCost(payloadType) {
  const costs = {
    SESSION_LOG:        parseInt(process.env.CREDITS_SESSION_LOG     || '5'),
    EXTERNAL_DATA:      parseInt(process.env.CREDITS_EXTERNAL_DATA   || '2'),
    COG_STIMULUS:       parseInt(process.env.CREDITS_COG_STIMULUS    || '5'),
    EXTERNAL_TELEMETRY: parseInt(process.env.CREDITS_EXTERNAL_DATA   || '2'),
  };
  return costs[payloadType] || 5;
}


module.exports = {
  runInference,
  getCreditCost,
  OUTPUT_SCHEMA,
};
