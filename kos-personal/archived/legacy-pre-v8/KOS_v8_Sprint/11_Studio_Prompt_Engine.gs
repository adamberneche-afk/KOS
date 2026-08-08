// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 11 of 11: Studio Prompt Engine
// ================================================================
//
// RESPONSIBILITY
//   This file owns the boundary between GAS and Workspace Studio.
//   It has two jobs:
//
//   1. PROMPT DELIVERY — Writes versioned system-prompt documents
//      to the ACTIVE zone folder so Studio can reference them by
//      file ID (LAW 001 — ID Supremacy). The prompt docs are the
//      single source of truth for what Studio does; no prompt text
//      lives in GAS code.
//
//   2. DRIP SCHEMA VALIDATION — Before processJsonDrip() routes a
//      drip payload, validateDripPayload() checks its structure and
//      returns a typed error if the payload violates the contract.
//      This is the firewall between Studio inference and the GAS
//      state machine.
//
// PROMPT ARCHITECTURE
// ─────────────────────────────────────────────────────────────
//   Studio is configured with two document references:
//     SYSTEM_PROMPT_DOC_ID  — The master operating context.
//                             Rebuilt by buildSystemPrompt().
//     SILO_PROMPT_DOC_ID    — Council silo inference rules.
//                             Rebuilt by buildSiloPrompt().
//
//   Both docs are stamped with kos_zone=active metadata.
//   Studio re-reads them on each inference call — they are not
//   cached inside Studio. Updating a prompt doc takes effect on
//   the next Studio run without any redeployment.
//
// DRIP CONTRACT
// ─────────────────────────────────────────────────────────────
//   Studio is instructed (via SYSTEM_PROMPT_DOC_ID) to append a
//   [KOS_DATA_DRIP] block to every inference output when it has
//   observations to record. The schema is versioned: the block
//   must open with a "schema_version" field. Payloads on an
//   unknown schema version are quarantined, not silently dropped.
//
//   Current schema version: "1.0"
//
// FUNCTIONS CALLABLE VIA google.script.run
// ─────────────────────────────────────────────────────────────
//   buildSystemPrompt()    — Rebuilds SYSTEM_PROMPT_DOC_ID
//   buildSiloPrompt()      — Rebuilds SILO_PROMPT_DOC_ID
//   getPromptHealth()      — Returns doc IDs + last-built timestamps
// ================================================================


// Increment when the drip JSON schema changes shape.
// Payloads with unknown versions are quarantined, not processed.
var DRIP_SCHEMA_VERSION = '1.0';

// PropertiesService keys for prompt doc IDs
var PROP_SYSTEM_PROMPT_ID = 'KOS_SYSTEM_PROMPT_DOC_ID';
var PROP_SILO_PROMPT_ID   = 'KOS_SILO_PROMPT_DOC_ID';
var PROP_PROMPT_BUILT_AT  = 'KOS_PROMPT_LAST_BUILT_AT';


// ================================================================
// PART 1: DRIP SCHEMA VALIDATION
// ================================================================

/**
 * Validates a parsed drip payload against the current schema version.
 *
 * VALIDATION RULES
 *   • schema_version must be present and match DRIP_SCHEMA_VERSION.
 *     Mismatched versions are quarantined: logged to ERROR_LOG and
 *     returned as { valid: false, quarantined: true }.
 *   • mirror_updates, vector_nominations, council_flags must be
 *     arrays if present (not required to be non-empty).
 *   • Each mirror_update must have: key (string), value (string),
 *     confidence_delta (number 0.0–1.0).
 *   • Each vector_nomination must have: topic (string), content (string).
 *   • Each council_flag must have: cog (string), status (string).
 *   • Any unknown top-level key is flagged as a warning but does not
 *     invalidate the payload — forward compatibility for future schema.
 *
 * @param  {Object}  payload   The parsed JSON object from the drip block.
 * @param  {string}  [uid]     Session UID for error attribution.
 * @returns {Object}  { valid, quarantined, errors[], warnings[] }
 */
function validateDripPayload(payload, uid) {
  var errors   = [];
  var warnings = [];
  var result   = { valid: false, quarantined: false, errors: errors, warnings: warnings };

  if (!payload || typeof payload !== 'object') {
    errors.push('Payload is not an object.');
    return result;
  }

  // ── Schema version check ─────────────────────────────────────
  var sv = String(payload.schema_version || '');
  if (!sv) {
    errors.push('Missing schema_version field. Expected "' + DRIP_SCHEMA_VERSION + '".');
    result.quarantined = true;
    _reportError(
      'validateDripPayload:NO_VERSION:' + (uid || 'unknown'),
      new Error('Drip payload missing schema_version. Payload quarantined. ' +
                'Instruct Studio to include schema_version: "' + DRIP_SCHEMA_VERSION + '" in every drip block.'),
      null
    );
    return result;
  }

  if (sv !== DRIP_SCHEMA_VERSION) {
    errors.push('schema_version "' + sv + '" does not match expected "' + DRIP_SCHEMA_VERSION + '".');
    result.quarantined = true;
    _reportError(
      'validateDripPayload:VERSION_MISMATCH:' + sv,
      new Error(
        'Drip payload schema_version "' + sv + '" does not match system version "' +
        DRIP_SCHEMA_VERSION + '". Payload quarantined. ' +
        'Update Studio system prompt to use schema_version: "' + DRIP_SCHEMA_VERSION + '".'
      ),
      null
    );
    return result;
  }

  // ── Known top-level keys ─────────────────────────────────────
  var knownKeys = ['schema_version', 'mirror_updates', 'vector_nominations', 'council_flags'];
  Object.keys(payload).forEach(function(k) {
    if (knownKeys.indexOf(k) === -1) {
      warnings.push('Unknown top-level key "' + k + '" — ignored. Future schema?');
    }
  });

  // ── mirror_updates ───────────────────────────────────────────
  if (payload.mirror_updates !== undefined) {
    if (!Array.isArray(payload.mirror_updates)) {
      errors.push('mirror_updates must be an array.');
    } else {
      payload.mirror_updates.forEach(function(upd, i) {
        var prefix = 'mirror_updates[' + i + ']';
        if (!upd || typeof upd !== 'object') {
          errors.push(prefix + ' is not an object.');
          return;
        }
        if (typeof upd.key !== 'string' || !upd.key.trim()) {
          errors.push(prefix + '.key must be a non-empty string.');
        }
        if (typeof upd.value !== 'string') {
          errors.push(prefix + '.value must be a string.');
        }
        var cd = upd.confidence_delta;
        if (typeof cd !== 'number' || cd < 0 || cd > 1) {
          errors.push(prefix + '.confidence_delta must be a number between 0.0 and 1.0. Got: ' + cd);
        }
      });
    }
  }

  // ── vector_nominations ───────────────────────────────────────
  if (payload.vector_nominations !== undefined) {
    if (!Array.isArray(payload.vector_nominations)) {
      errors.push('vector_nominations must be an array.');
    } else {
      payload.vector_nominations.forEach(function(nom, i) {
        var prefix = 'vector_nominations[' + i + ']';
        if (!nom || typeof nom !== 'object') {
          errors.push(prefix + ' is not an object.');
          return;
        }
        if (typeof nom.topic !== 'string' || !nom.topic.trim()) {
          errors.push(prefix + '.topic must be a non-empty string.');
        }
        if (typeof nom.content !== 'string') {
          errors.push(prefix + '.content must be a string.');
        }
        if (nom.proposed_vector !== undefined && typeof nom.proposed_vector !== 'string') {
          warnings.push(prefix + '.proposed_vector should be a string if provided.');
        }
      });
    }
  }

  // ── council_flags ────────────────────────────────────────────
  if (payload.council_flags !== undefined) {
    if (!Array.isArray(payload.council_flags)) {
      errors.push('council_flags must be an array.');
    } else {
      payload.council_flags.forEach(function(flag, i) {
        var prefix = 'council_flags[' + i + ']';
        if (!flag || typeof flag !== 'object') {
          errors.push(prefix + ' is not an object.');
          return;
        }
        if (typeof flag.cog !== 'string' || !flag.cog.trim()) {
          errors.push(prefix + '.cog must be a non-empty string (persona name).');
        }
        if (typeof flag.status !== 'string' || !flag.status.trim()) {
          errors.push(prefix + '.status must be a non-empty string.');
        }
        if (flag.reason !== undefined && typeof flag.reason !== 'string') {
          warnings.push(prefix + '.reason should be a string if provided.');
        }
      });
    }
  }

  result.valid = errors.length === 0;
  return result;
}


/**
 * Writes a quarantined drip payload to the ERROR_LOG sheet for
 * operator review, preserving the raw text so it can be replayed
 * after Studio is corrected.
 *
 * Called automatically by validateDripPayload when quarantined: true.
 *
 * @param  {string}  rawDripText   The raw string content of the drip block.
 * @param  {Object}  validation    The result object from validateDripPayload.
 * @param  {string}  [uid]         Session UID for attribution.
 */
function _quarantineDrip(rawDripText, validation, uid) {
  try {
    var ss    = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    var sheet = _getOrCreateSheet(ss, 'DRIP_QUARANTINE');

    // Ensure headers
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp', 'Session_UID', 'Schema_Version_Found',
        'Errors', 'Warnings', 'Raw_Drip_Text',
      ]);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    }

    var rawJson   = rawDripText || '';
    var sv        = 'unknown';
    try { sv = JSON.parse(rawJson.replace(/```json|```/g, '')).schema_version || 'missing'; } catch (_) {}

    sheet.appendRow([
      new Date(),
      uid || '',
      sv,
      (validation.errors   || []).join(' | '),
      (validation.warnings || []).join(' | '),
      rawJson.substring(0, 5000),   // cap at 5k chars per cell
    ]);

    console.warn('[DripQuarantine] Quarantined drip for session ' + (uid || 'unknown') +
                 '. Errors: ' + (validation.errors || []).join('; '));
  } catch (e) {
    _reportError('_quarantineDrip', e, null);
  }
}


// ================================================================
// PART 2: PATCH processJsonDrip() — add validation gate
// ================================================================
//
// Replace the processJsonDrip() function in 10_KOS_Extensions.gs
// with the version below. The only change is inserting the
// validateDripPayload() call after JSON.parse and before routing.
//
// This replaces the existing processJsonDrip() definition in full.
// ================================================================

/**
 * Scans inference text for a [KOS_DATA_DRIP] payload, validates it,
 * and routes mirror updates, vector nominations, and council flags.
 *
 * VALIDATION GATE (new in this patch)
 *   validateDripPayload() is called before any routing branch.
 *   If the payload is quarantined (wrong/missing schema_version),
 *   nothing is routed and the raw block is written to DRIP_QUARANTINE.
 *   If the payload has errors but is not quarantined (field-level
 *   issues), bad items are skipped per-item and the rest are routed.
 *
 * @param  {string} inferenceText  Full text of the Studio inference doc.
 * @param  {string} [sessionUid]   UID of the triggering session.
 * @returns {boolean}  true = drip found; false = no drip present.
 */
function processJsonDrip(inferenceText, sessionUid) {
  if (!inferenceText) return false;

  var dripRegex = /\[KOS_DATA_DRIP\]([\s\S]*?)\[\/KOS_DATA_DRIP\]/;
  var match     = inferenceText.match(dripRegex);
  if (!match) return false;

  var rawDrip = match[1].trim();
  var payload;

  try {
    payload = JSON.parse(rawDrip.replace(/```json|```/g, '').trim());
  } catch (parseErr) {
    _reportError('processJsonDrip:parse', parseErr, null);
    console.warn('[JsonDrip] Drip block found but JSON was malformed — skipping.');
    return false;
  }

  // ── Validation gate ──────────────────────────────────────────
  var validation = validateDripPayload(payload, sessionUid);

  if (validation.quarantined) {
    _quarantineDrip(rawDrip, validation, sessionUid);
    return true;  // drip was present — return true even though not routed
  }

  if (!validation.valid) {
    // Field-level errors: log warnings but proceed with valid items
    console.warn('[JsonDrip] Drip has field errors — routing valid items only. Errors: ' +
                 validation.errors.join('; '));
  }

  if (validation.warnings.length > 0) {
    console.log('[JsonDrip] Drip warnings: ' + validation.warnings.join('; '));
  }

  var routed = 0;

  // ── Branch 1: Mirror Matrix updates ─────────────────────────
  if (Array.isArray(payload.mirror_updates) && payload.mirror_updates.length > 0) {
    payload.mirror_updates.forEach(function(upd) {
      try {
        if (!upd.key || typeof upd.key !== 'string') return;
        var ok = updateMirrorVariable(
          upd.key,
          String(upd.value              || ''),
          parseFloat(upd.confidence_delta || 0),
          sessionUid || null
        );
        if (ok) routed++;
      } catch (e) {
        _reportError('processJsonDrip:mirror:' + (upd.key || '?'), e, null);
      }
    });
  }

  // ── Branch 2: Vector nominations → Incubator ────────────────
  if (Array.isArray(payload.vector_nominations) && payload.vector_nominations.length > 0) {
    try {
      var ss         = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
      var incubSheet = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);
      var uid        = sessionUid || ('DRIP-' + new Date().getTime());

      payload.vector_nominations.forEach(function(nom) {
        try {
          if (!nom.topic || typeof nom.topic !== 'string') return;
          var topic = nom.topic.toUpperCase().trim().replace(/\s+/g, '_');
          var scores = {};
          scores[topic] = CFG.INCUBATOR_THRESHOLD + 0.01;
          _logToIncubator(incubSheet, scores, uid);
          console.log('[JsonDrip] Vector nomination logged: ' + topic);
          routed++;
        } catch (e) {
          _reportError('processJsonDrip:vector:' + (nom.topic || '?'), e, null);
        }
      });
    } catch (e) {
      _reportError('processJsonDrip:vectorBranch', e, null);
    }
  }

  // ── Branch 3: Council flags ──────────────────────────────────
  if (Array.isArray(payload.council_flags) && payload.council_flags.length > 0) {
    payload.council_flags.forEach(function(flag) {
      try {
        if (String(flag.status || '').toUpperCase() === 'BLOCKED') {
          _reportError(
            'processJsonDrip:COUNCIL_FLAG:' + (flag.cog || 'UNKNOWN'),
            new Error(
              'Council flag raised. Reason: ' + (flag.reason || 'No reason provided') +
              '. Session: ' + (sessionUid || 'unknown')
            ),
            null
          );
        }
      } catch (e) {
        _reportError('processJsonDrip:councilBranch', e, null);
      }
    });
  }

  if (routed > 0) {
    console.log('[JsonDrip] Drip processed. ' + routed + ' item(s) routed.');
    SpreadsheetApp.flush();
  }

  return true;
}


// ================================================================
// PART 3: PROMPT DELIVERY — buildSystemPrompt()
// ================================================================
//
// The system prompt document is the single source of truth for
// what Studio does. It is written to Drive and registered by file
// ID so Studio can always read the current version without
// redeployment.
//
// PROMPT SECTIONS (in document order)
//   §1  SYSTEM IDENTITY & MANDATE
//   §2  WORLD MODEL — What KOS is and how it works
//   §3  ACTIVE VECTORS — Current routing landscape (injected at build time)
//   §4  PERSONA ROSTER — Which cogs are available and their mandate
//   §5  MIRROR MATRIX DIRECTIVE — How to produce mirror observations
//   §6  JSON DRIP PROTOCOL — Exact schema Studio must output
//   §7  SILO COUNCIL RULES — When sequestered reasoning applies
//   §8  OPERATOR CONTEXT — Identity key, onboarding day, admin email
//   §9  HARD CONSTRAINTS — What Studio must never do
//
// Sections §3 and §8 are dynamically injected from PropertiesService
// at build time. All other sections are static structured text.
//
// The document is versioned: each build appends a build timestamp
// to the doc title (e.g. "KOS_SYSTEM_PROMPT — 2024-11-03T07:00").
// The old doc is moved to the VAULT zone on rebuild.
// ================================================================

/**
 * Builds or rebuilds the Studio system prompt document.
 * Registers its ID in PropertiesService as KOS_SYSTEM_PROMPT_DOC_ID.
 * Moves the previous version to the VAULT zone before overwriting.
 *
 * Safe to call from the Diagnostics tab or from deployFullSystem().
 *
 * @returns {Object}  { success, docId, docUrl, message }
 */
function buildSystemPrompt() {
  try {
    var props   = PropertiesService.getScriptProperties();
    var matrix  = getMirrorMatrix();
    var health  = getSystemHealth();

    // ── Retire previous version ─────────────────────────────────
    var prevId = props.getProperty(PROP_SYSTEM_PROMPT_ID);
    if (prevId) {
      try {
        moveFileToZone(prevId, 'VAULT');
        console.log('[buildSystemPrompt] Previous prompt vaulted: ' + prevId);
      } catch (_) {}   // non-fatal if vault fails
    }

    // ── Build prompt sections ────────────────────────────────────
    var ts      = new Date().toISOString().substring(0, 16).replace('T', ' ');
    var docName = 'KOS_SYSTEM_PROMPT — ' + ts;
    var doc     = DocumentApp.create(docName);
    var docId   = doc.getId();
    var body    = doc.getBody();
    body.clear();

    // §1 IDENTITY & MANDATE
    _promptH1(body, '§1 — SYSTEM IDENTITY & MANDATE');
    _promptP(body,
      'You are the Knowledge Operating System (KOS v' + (CFG.SYSTEM_VERSION || '8.0') + '), ' +
      'operating as the Headless Studio Edition. You run inside Google Workspace Studio ' +
      'as the primary inference engine for a solo operator\'s knowledge management pipeline. ' +
      'Your full name is "' + (CFG.SYSTEM_NAME || 'KOS') + '". You do not roleplay. ' +
      'You are a state machine that thinks.'
    );
    _promptP(body,
      'Your mandate is threefold: ' +
      '(1) Process structured session logs into the operator\'s knowledge architecture. ' +
      '(2) Build a passive confidence model of the operator through the Mirror Matrix. ' +
      '(3) Surface insights, risks, and proposals through the ALIGNMENT persona when warranted.'
    );

    // §2 WORLD MODEL
    _promptH1(body, '§2 — WORLD MODEL');
    _promptH2(body, 'Pipeline Architecture');
    _promptP(body,
      'Session logs enter via INTAKE_SESSIONS. The Turnstile (runMatrixTurnstile) releases ' +
      'one row at a time to IN_PROCESS status. You read the IN_PROCESS row, produce a ' +
      'structured inference document, and write FLOW_COMPLETE to the Status column. ' +
      'The GAS Queue Processor (processInferenceQueue) then reads your output and routes ' +
      'it into the knowledge architecture. You never write directly to any ledger ' +
      'other than STAGING_PIPELINE Status. All writes go through GAS.'
    );
    _promptH2(body, 'Vector Routing');
    _promptP(body,
      'Every session is scored against the active vector space. Vectors are themes that ' +
      'have accumulated sufficient signal to be promoted from the Incubator. Your inference ' +
      'output includes a JSON block that GAS routes to the correct Vector doc. ' +
      'If you observe a genuinely new theme not present in the active vectors, nominate it ' +
      'via the JSON Drip vector_nominations array — do not invent a new vector category.'
    );

    // §3 ACTIVE VECTORS (dynamic)
    _promptH1(body, '§3 — ACTIVE VECTOR LANDSCAPE');
    var promoted = [];
    try { promoted = JSON.parse(props.getProperty('KOS_PROMOTED_VECTORS') || '[]'); } catch (_) {}
    if (promoted.length > 0) {
      _promptP(body, 'Currently promoted vectors (' + promoted.length + '):');
      promoted.forEach(function(v, i) { _promptP(body, '  ' + (i + 1) + '. ' + v); });
    } else {
      _promptP(body,
        'No vectors have been promoted yet. The system is in early incubation. ' +
        'Score themes conservatively until patterns emerge across multiple sessions.'
      );
    }

    // §4 PERSONA ROSTER
    _promptH1(body, '§4 — PERSONA ROSTER');
    _promptP(body,
      'You have access to five internal reasoning personas. They are not separate agents — ' +
      'they are distinct cognitive lenses you apply sequentially or selectively based on ' +
      'the session content. All five must be considered for every intake. Silence from a ' +
      'persona is a valid output only if the session genuinely contains nothing in its domain.'
    );
    var personas = [
      ['MUSE',      'Creative agency, pedagogical friction, and student experience signals.'],
      ['ARCHITECT', 'Structural integrity, data habits, schema discipline, and scale decisions.'],
      ['DEVELOPER', 'Execution footprint, trigger behaviour, concurrency signals, and latency tolerance.'],
      ['AUDITOR',   'Self-honesty, compliance risk, Shirky Principle traps, and Goodhart\'s Law violations.'],
      ['ALIGNMENT', 'Relational boundaries, operator wellbeing, automation guilt, and authentic voice.'],
    ];
    personas.forEach(function(p) {
      _promptH2(body, p[0]);
      _promptP(body, p[1]);
    });

    // §5 MIRROR MATRIX DIRECTIVE
    _promptH1(body, '§5 — MIRROR MATRIX DIRECTIVE');
    _promptP(body,
      'The Mirror Matrix is a 25-variable passive confidence model of the operator. ' +
      'You build it by observing patterns across sessions — you never ask the operator ' +
      'directly for this information. When a session contains evidence relevant to a ' +
      'mirror variable, include an entry in the mirror_updates array of the JSON Drip block. ' +
      'Use conservative confidence_delta values (0.05–0.25). Never assign 1.0 — ' +
      'that is reserved for operator-verified values. A HYPOTHESIZED variable (≥ 0.75 ' +
      'confidence) will be surfaced to the operator for confirmation.'
    );

    // Current mirror state summary
    var mStatus = getMirrorMatrixStatus();
    _promptH2(body, 'Current Mirror State');
    _promptP(body,
      'Total variables: ' + (mStatus.total || 25) + '. ' +
      'Pending: ' + (mStatus.pending || 25) + '. ' +
      'Hypothesized: ' + (mStatus.hypothesized || 0) + '. ' +
      'Verified: ' + (mStatus.verified || 0) + '.'
    );

    // Active hypotheses — give Studio context so it doesn't re-derive
    if (mStatus.variables) {
      var hypothesized = mStatus.variables.filter(function(v) {
        return v.status === 'HYPOTHESIZED' || v.status === 'VERIFIED';
      });
      if (hypothesized.length > 0) {
        _promptH2(body, 'Active Hypotheses (do not re-derive these)');
        hypothesized.forEach(function(v) {
          _promptP(body,
            '[' + v.status + '] ' + (v.label || v.key) + ': "' +
            (v.value || 'no value yet') + '" (' +
            Math.round((v.confidence || 0) * 100) + '% confidence)'
          );
        });
      }
    }

    // §6 JSON DRIP PROTOCOL
    _promptH1(body, '§6 — JSON DRIP PROTOCOL');
    _promptP(body,
      'At the end of every inference output, append a [KOS_DATA_DRIP] block. ' +
      'This block is machine-read by GAS and invisible to the operator. ' +
      'It is the ONLY mechanism for updating system state from Studio. ' +
      'You must include it even if all arrays are empty — an empty drip block ' +
      'confirms the inference ran cleanly with no state updates.'
    );
    _promptH2(body, 'Exact Required Format');
    _promptP(body,
      '[KOS_DATA_DRIP]\n' +
      '{\n' +
      '  "schema_version": "' + DRIP_SCHEMA_VERSION + '",\n' +
      '  "mirror_updates": [\n' +
      '    {\n' +
      '      "key": "<mirror_variable_key>",\n' +
      '      "value": "<inferred value as a plain sentence>",\n' +
      '      "confidence_delta": <0.05 to 0.25>\n' +
      '    }\n' +
      '  ],\n' +
      '  "vector_nominations": [\n' +
      '    {\n' +
      '      "topic": "<UPPER_CASE_TOPIC>",\n' +
      '      "content": "<one sentence describing the pattern>",\n' +
      '      "proposed_vector": "<OPTIONAL: suggested vector name>"\n' +
      '    }\n' +
      '  ],\n' +
      '  "council_flags": [\n' +
      '    {\n' +
      '      "cog": "<PERSONA_NAME>",\n' +
      '      "status": "BLOCKED",\n' +
      '      "reason": "<why this cog is blocking>"\n' +
      '    }\n' +
      '  ]\n' +
      '}\n' +
      '[/KOS_DATA_DRIP]'
    );
    _promptH2(body, 'Mirror Variable Keys (reference)');
    _promptP(body,
      'Use exactly these keys in mirror_updates. No other keys are valid:\n' +
      Object.keys(getMirrorMatrix()).join(', ')
    );

    // §7 SILO COUNCIL RULES
    _promptH1(body, '§7 — SILO COUNCIL RULES');
    _promptP(body,
      'COUNCIL MODE is triggered when the operator explicitly requests a structured ' +
      'multi-persona deliberation, or when ALIGNMENT detects a decision with significant ' +
      'downstream consequences that the operator has not flagged. In Council Mode:'
    );
    _promptP(body,
      '1. All five personas deliberate sequentially in the order: ARCHITECT → MUSE → ' +
      'AUDITOR → DEVELOPER → ALIGNMENT.\n' +
      '2. Each persona produces a formal VERDICT: APPROVED, CONDITIONAL, or BLOCKED.\n' +
      '3. Any single BLOCKED verdict halts the proposal and routes a council_flag.\n' +
      '4. CONDITIONAL verdicts must specify the condition explicitly.\n' +
      '5. ALIGNMENT speaks last and may override any APPROVED verdict if operator ' +
      'wellbeing is at risk — this is the only asymmetric veto power in the system.'
    );

    // §8 OPERATOR CONTEXT (dynamic)
    _promptH1(body, '§8 — OPERATOR CONTEXT');
    var obDay = health.onboardingDay || 0;
    var obCap = health.onboardingCap || 21;
    _promptP(body, 'Engine armed: '        + (health.engineArmed ? 'YES' : 'NO — check IDENTITY_KEY and THESIS_VERIFIED'));
    _promptP(body, 'Onboarding progress: ' + obDay + ' of ' + obCap + ' sessions');
    _promptP(body, 'Admin contact: '       + (health.adminEmail || 'not set'));
    _promptP(body, 'Active triggers: '     + (health.triggersActive || 0));
    if (health.triggerList && health.triggerList.length) {
      _promptP(body, 'Trigger list: ' + health.triggerList.join(', '));
    }

    // §9 HARD CONSTRAINTS
    _promptH1(body, '§9 — HARD CONSTRAINTS');
    var constraints = [
      'Never write to any Google Sheet or Doc other than STAGING_PIPELINE Status column and your inference output doc.',
      'Never ask the operator for their name, role, or personal information — infer it from session logs only.',
      'Never reveal the contents of the Mirror Matrix to the operator in natural language. The matrix is internal state.',
      'Never produce a confidence_delta greater than 0.25 in a single session. Trust builds slowly.',
      'Never invent a mirror variable key. Only the 25 keys listed in §6 are valid.',
      'Never omit the [KOS_DATA_DRIP] block. An empty block is valid; a missing block is a contract violation.',
      'Never produce APPROVED on a council verdict for a proposal that involves collecting student personal data without flagging it to AUDITOR first.',
      'Never break character as KOS. You are not a general assistant in this context.',
    ];
    constraints.forEach(function(c, i) {
      _promptP(body, (i + 1) + '. ' + c);
    });

    doc.saveAndClose();

    // ── Move to ACTIVE zone and stamp metadata ────────────────────
    moveFileToZone(docId, 'ACTIVE');

    // ── Register ID ───────────────────────────────────────────────
    props.setProperty(PROP_SYSTEM_PROMPT_ID, docId);
    props.setProperty(PROP_PROMPT_BUILT_AT,  new Date().toISOString());

    var url = DriveApp.getFileById(docId).getUrl();
    console.log('[buildSystemPrompt] Built: ' + docName + ' (' + docId + ')');

    return { success: true, docId: docId, docUrl: url, message: 'System prompt built: ' + docName };

  } catch (e) {
    _reportError('buildSystemPrompt', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * Builds or rebuilds the Studio SILO COUNCIL prompt document.
 * Focused entirely on multi-persona deliberation rules — kept
 * separate from the system prompt so Studio can reference both
 * independently and the silo rules can evolve without a full
 * system prompt rebuild.
 *
 * @returns {Object}  { success, docId, docUrl, message }
 */
function buildSiloPrompt() {
  try {
    var props = PropertiesService.getScriptProperties();

    // Retire previous
    var prevId = props.getProperty(PROP_SILO_PROMPT_ID);
    if (prevId) {
      try { moveFileToZone(prevId, 'VAULT'); } catch (_) {}
    }

    var ts      = new Date().toISOString().substring(0, 16).replace('T', ' ');
    var docName = 'KOS_SILO_PROMPT — ' + ts;
    var doc     = DocumentApp.create(docName);
    var docId   = doc.getId();
    var body    = doc.getBody();
    body.clear();

    _promptH1(body, 'KOS COUNCIL SILO — Deliberation Protocol');
    _promptP(body,
      'This document governs the sequestered reasoning protocol for the KOS Council. ' +
      'It is read by Studio when the operator or ALIGNMENT triggers Council Mode. ' +
      'It supplements, not replaces, the System Prompt (§7 of that document covers ' +
      'the trigger conditions). This document governs the mechanics of deliberation.'
    );

    _promptH1(body, 'The Silo Principle');
    _promptP(body,
      'In Council Mode, each persona reasons in isolation before seeing the others\' verdicts. ' +
      'The order is fixed: ARCHITECT → MUSE → AUDITOR → DEVELOPER → ALIGNMENT. ' +
      'Personas do not revise their verdicts after seeing others\'. ' +
      'The synthesis is done by ALIGNMENT, who weighs all verdicts and produces the ' +
      'final COUNCIL RECOMMENDATION — a single, unambiguous directive.'
    );

    _promptH1(body, 'Verdict Taxonomy');
    var verdicts = [
      ['APPROVED',     'The persona endorses the proposal without conditions.'],
      ['CONDITIONAL',  'The persona endorses with a specific, actionable condition. The condition must be stated in one sentence. Vague conditions (e.g. "with care") are not valid.'],
      ['BLOCKED',      'The persona vetoes the proposal. A BLOCKED verdict stops the council and routes a council_flag to GAS. The reason must be stated in one sentence.'],
    ];
    verdicts.forEach(function(v) {
      _promptH2(body, v[0]);
      _promptP(body, v[1]);
    });

    _promptH1(body, 'ALIGNMENT Asymmetric Veto');
    _promptP(body,
      'ALIGNMENT may override any APPROVED verdict — even a unanimous council — if it ' +
      'determines that the proposal threatens the operator\'s wellbeing, authentic voice, ' +
      'or relational boundaries. This veto is not subject to appeal within the same council. ' +
      'The operator must be notified of the veto reason in plain language, separate from the JSON Drip.'
    );

    _promptH1(body, 'Council Output Format');
    _promptP(body, 'Produce exactly this structure for every council session:');
    _promptP(body,
      '--- COUNCIL SESSION ---\n' +
      'PROPOSAL: [restate the proposal in one sentence]\n\n' +
      'ARCHITECT VERDICT: [APPROVED|CONDITIONAL|BLOCKED]\n' +
      '[One sentence rationale]\n\n' +
      'MUSE VERDICT: [APPROVED|CONDITIONAL|BLOCKED]\n' +
      '[One sentence rationale]\n\n' +
      'AUDITOR VERDICT: [APPROVED|CONDITIONAL|BLOCKED]\n' +
      '[One sentence rationale]\n\n' +
      'DEVELOPER VERDICT: [APPROVED|CONDITIONAL|BLOCKED]\n' +
      '[One sentence rationale]\n\n' +
      'ALIGNMENT VERDICT: [APPROVED|CONDITIONAL|BLOCKED]\n' +
      '[One sentence rationale]\n\n' +
      'COUNCIL RECOMMENDATION: [PROCEED|PROCEED WITH CONDITIONS|HALT]\n' +
      '[Two sentences maximum. State the decision and any conditions.]\n' +
      '--- END COUNCIL SESSION ---'
    );
    _promptP(body,
      'After the council section, append the standard [KOS_DATA_DRIP] block. ' +
      'If any persona issued BLOCKED, include a council_flag entry. ' +
      'If ALIGNMENT issued a veto, set its council_flag status to "ALIGNMENT_VETO".'
    );

    _promptH1(body, 'Silo Hard Constraints');
    _promptP(body,
      '1. Never abbreviate or skip a persona\'s deliberation — all five must appear.\n' +
      '2. Never use "N/A" as a verdict — APPROVED with rationale "This domain is not applicable" is valid.\n' +
      '3. Never let ALIGNMENT endorse a proposal that AUDITOR has BLOCKED on data privacy grounds.\n' +
      '4. Never produce a COUNCIL RECOMMENDATION without having stated all five verdicts first.\n' +
      '5. Never produce a council session inside a regular intake — Council Mode must be explicitly triggered.'
    );

    doc.saveAndClose();
    moveFileToZone(docId, 'ACTIVE');
    props.setProperty(PROP_SILO_PROMPT_ID, docId);

    var url = DriveApp.getFileById(docId).getUrl();
    console.log('[buildSiloPrompt] Built: ' + docName + ' (' + docId + ')');
    return { success: true, docId: docId, docUrl: url, message: 'Silo prompt built: ' + docName };

  } catch (e) {
    _reportError('buildSiloPrompt', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * Returns prompt document health for the Diagnostics tab.
 * Shows doc IDs, last-built timestamp, and Drive URLs.
 *
 * Called by the web app via:
 *   google.script.run.withSuccessHandler(fn).getPromptHealth()
 *
 * @returns {Object}
 */
function getPromptHealth() {
  try {
    var props   = PropertiesService.getScriptProperties();
    var sysId   = props.getProperty(PROP_SYSTEM_PROMPT_ID);
    var siloId  = props.getProperty(PROP_SILO_PROMPT_ID);
    var builtAt = props.getProperty(PROP_PROMPT_BUILT_AT);

    var resolve = function(id) {
      if (!id) return { exists: false, url: null, name: null };
      try {
        var f = DriveApp.getFileById(id);
        return { exists: true, url: f.getUrl(), name: f.getName() };
      } catch (_) {
        return { exists: false, url: null, name: null };
      }
    };

    return {
      success:      true,
      builtAt:      builtAt || null,
      systemPrompt: Object.assign({ id: sysId  || null }, resolve(sysId)),
      siloPrompt:   Object.assign({ id: siloId || null }, resolve(siloId)),
    };
  } catch (e) {
    _reportError('getPromptHealth', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// DOCUMENT BUILDER HELPERS
// ================================================================
// Thin wrappers around DocumentApp Body methods.
// Using plain appendParagraph rather than heading styles to avoid
// the GAS DocumentApp HEADING enum availability variations.

function _promptH1(body, text) {
  var p = body.appendParagraph(text);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  return p;
}

function _promptH2(body, text) {
  var p = body.appendParagraph(text);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  return p;
}

function _promptP(body, text) {
  return body.appendParagraph(String(text || ''));
}


// ================================================================
// PATCH E — ADDITIONS TO OTHER FILES
// ================================================================
//
// ── PATCH E-1: 1_Config_And_Deploy.gs — deployFullSystem() ─────
//
// Add prompt building as the final step before the success banner.
// Find:
//
//    emit('✔ Deployment complete.');
//
// Add above it:
//
//    // ── Step N: Build Studio prompt documents ─────────────────
//    emit('Building Studio prompt documents…');
//    try {
//      const sp = buildSystemPrompt();
//      emit(sp.success ? '  ✔ System prompt: ' + sp.docUrl : '  ⚠ System prompt failed: ' + sp.message);
//      const sl = buildSiloPrompt();
//      emit(sl.success ? '  ✔ Silo prompt: '   + sl.docUrl : '  ⚠ Silo prompt failed: '   + sl.message);
//    } catch (e) { fail('buildPrompts', e); }
//
// ── PATCH E-2: 7_WebApp.gs — callable functions comment ─────────
//
// Add to the Diagnostics tab section:
//
//   buildSystemPrompt()    → 11_Studio_Prompt_Engine.gs
//   buildSiloPrompt()      → 11_Studio_Prompt_Engine.gs
//   getPromptHealth()      → 11_Studio_Prompt_Engine.gs
//
// ── PATCH E-3: 8_WebApp_UI.html — Diagnostics tab ───────────────
//
// Add a Prompt Health panel after the Zone Health panel.
// See PATCH_F_PromptHealth_UI.html for the complete HTML/CSS/JS.
//
// ── PATCH E-4: setupAllTriggers (1_Config_And_Deploy.gs) ────────
//
// No new triggers needed for this file.
// buildSystemPrompt() is called by deployFullSystem() and by the
// Diagnostics tab on demand. It does not run on a schedule because
// prompt docs should be rebuilt deliberately, not automatically —
// an auto-rebuild would vault the current prompt mid-operation.
//
// ================================================================


// ================================================================
// END 11_Studio_Prompt_Engine.gs
// KOS v8.0 — The Headless Studio Edition
// ================================================================
