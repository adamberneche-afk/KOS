// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 10 of 10: Extensions — Turnstile, Mirror Matrix,
//                JSON Drip, KOS Heartbeat
// ================================================================
//
// SPRINT FEATURES IMPLEMENTED
// ─────────────────────────────────────────────────────────────
//  1. runMatrixTurnstile()      — State-machine flow controller.
//                                 Releases exactly one PENDING_FLOW
//                                 row to IN_PROCESS per run. Prevents
//                                 concurrent Studio inference calls.
//
//  2. getMirrorMatrix()         — Retrieves or initialises the
//     updateMirrorVariable()      Ambient Onboarding state from
//                                 PropertiesService key
//                                 ALIGNMENT_MIRROR_MATRIX. Replaces
//                                 the static Socratic intake form.
//
//  3. processJsonDrip()         — Extracts [KOS_DATA_DRIP] payloads
//                                 from Studio inference output and
//                                 routes mirror updates + vector
//                                 nominations back into the system.
//
//  4. initializeKOS()           — Provisions the SMP-002 v5.6 zone
//     runHeartbeat()              folder hierarchy, hard-links IDs
//     stampFileMetadata()         into PropertiesService, stamps file
//     runStalenessCheck()         lifecycle metadata (activated_on,
//     recoverMetadata()           vaulted_on, abandoned_on), and runs
//                                 a 14-day staleness check on the
//                                 Planning Buffer.
//
// ZONE TAXONOMY (SMP-002 v5.6)
// ─────────────────────────────────────────────────────────────
//  KOS_ZONE_ACTIVE   = 00_ACTIVE_STATE     (primary search boundary)
//  KOS_ZONE_BUFFER   = 01_PLANNING_BUFFER  (proposals / drafts)
//  KOS_ZONE_VAULT    = 90_CE-VAULT         (retired active assets)
//  KOS_ZONE_SCRAP    = 95_CE-SCRAP         (abandoned proposals)
//
// TRIGGER MAP (add these in setupAllTriggers in 1_Config_And_Deploy)
// ─────────────────────────────────────────────────────────────
//  runMatrixTurnstile   → every 5 min (time-driven)
//  runHeartbeat         → daily 07:00 (time-driven)
//
// DEPENDENCIES
//   CFG, _reportError, _getOrCreateSheet, _getSystemAsset
//   (all defined in earlier numbered files)
//
// PATCH NOTES — CHANGES TO OTHER FILES REQUIRED
//   See bottom of this file: "REQUIRED PATCHES" section.
// ================================================================


// ================================================================
// PART 1: MATRIX TURNSTILE
// ================================================================

/**
 * State-machine flow controller for STAGING_PIPELINE.
 *
 * ARCHITECTURE
 *   Studio polls STAGING_PIPELINE for rows with Status = IN_PROCESS.
 *   This function is the sole mechanism that flips a row from
 *   PENDING_FLOW → IN_PROCESS. Only one row is released per run.
 *
 *   If any row is already IN_PROCESS, the system is considered busy
 *   and no additional row is released (congestion guard). This
 *   prevents Studio from receiving multiple concurrent inference
 *   tasks and producing race-condition writes back to STAGING.
 *
 *   STATUS LIFECYCLE (complete picture)
 *     PENDING_FLOW   → [Turnstile] → IN_PROCESS
 *     IN_PROCESS     → [Studio]    → FLOW_COMPLETE
 *     FLOW_COMPLETE  → [Queue]     → PROCESSED | NEEDS_CURATOR
 *
 * Fires: every 5 min via time-driven trigger.
 *
 * NOTE: This replaces the prior model where Studio polled for
 * PENDING_FLOW directly. All existing PENDING_FLOW rows will be
 * picked up on the next Turnstile run after deploy.
 */
function runMatrixTurnstile() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('[Turnstile] Could not acquire lock — another run active. Skipping.');
    return;
  }

  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const sheet   = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const SC      = CFG.STAGING_COLS;
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      console.log('[Turnstile] Queue empty — nothing to release.');
      return;
    }

    // Read Status column only — minimise quota usage
    const statusRange  = sheet.getRange(2, SC.STATUS + 1, lastRow - 1, 1);
    const statusValues = statusRange.getValues();

    // ── 1. Congestion check ─────────────────────────────────────
    const isSystemBusy = statusValues.some(
      row => String(row[0]).trim() === 'IN_PROCESS'
    );

    if (isSystemBusy) {
      console.log('[Turnstile] System busy (IN_PROCESS row exists). Standing by.');
      return;
    }

    // ── 2. Find first PENDING_FLOW row ──────────────────────────
    let targetSheetRow = -1;
    for (let i = 0; i < statusValues.length; i++) {
      if (String(statusValues[i][0]).trim() === 'PENDING_FLOW') {
        targetSheetRow = i + 2;  // 1-indexed, skip header
        break;
      }
    }

    // ── 3. Release ──────────────────────────────────────────────
    if (targetSheetRow === -1) {
      console.log('[Turnstile] Queue clear — no PENDING_FLOW rows.');
      return;
    }

    sheet.getRange(targetSheetRow, SC.STATUS + 1).setValue('IN_PROCESS');
    SpreadsheetApp.flush();

    const uid = sheet.getRange(targetSheetRow, SC.PAYLOAD_UID + 1).getValue();
    console.log(
      '[Turnstile] Row ' + targetSheetRow +
      ' released → IN_PROCESS. UID: ' + uid
    );

  } catch (e) {
    _reportError('runMatrixTurnstile', e, null);
  } finally {
    lock.releaseLock();
  }
}


// ================================================================
// PART 2: MIRROR MATRIX — AMBIENT ONBOARDING
// ================================================================
//
// The Mirror Matrix replaces the static Socratic Onboarding
// intake form with Probabilistic Ambient Onboarding.
//
// Instead of a mandatory pre-flight questionnaire, the system
// observes operator behaviour across sessions and builds a
// confidence model of the operator's values, habits, and
// friction points passively. ALIGNMENT only prompts the operator
// for explicit confirmation when a specific variable reaches the
// 0.75 confidence threshold.
//
// The full set of 25 mirror variables spans five personas. Each
// variable tracks:
//   inferred_value     — What the system has inferred so far.
//   confidence         — Float 0.0–1.0. Threshold = 0.75.
//   status             — PENDING | HYPOTHESIZED | VERIFIED
//   last_updated_uid   — The session UID that last changed this.
//
// PERSONA ATTRIBUTION
//   muse_*             — Creative agency and friction signals
//   architect_*        — Structural and data-habit signals
//   dev_*              — Execution footprint signals
//   auditor_*          — Self-honesty and compliance signals
//   alignment_*        — Relational boundary and wellbeing signals
// ================================================================

/**
 * Returns the current Mirror Matrix from PropertiesService.
 * Initialises the full 25-variable schema on first call (cold start).
 *
 * Idempotent — re-running this function after partial initialisation
 * does not overwrite variables that already have data.
 *
 * @returns {Object}  The Mirror Matrix state object.
 */
function getMirrorMatrix() {
  const props = PropertiesService.getScriptProperties();
  const raw   = props.getProperty('ALIGNMENT_MIRROR_MATRIX');

  if (raw) {
    try { return JSON.parse(raw); } catch (_) {}
  }

  // Cold-start default schema — all 25 variables
  const defaultMatrix = {

    // ── MUSE: Creative agency & pedagogical friction ────────────
    muse_agency_vacuum: {
      label:           'The Agency Vacuum',
      question:        'Where is the operator doing the thinking for students out of convenience or lack of time?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    muse_dream_project: {
      label:           'The Dream Project',
      question:        'What heavy-lift project does the operator repeatedly abandon due to administrative exhaustion?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    muse_necessary_struggle: {
      label:           'The Necessary Struggle',
      question:        'What concept does the operator believe students must wrestle with — and resist having made easier?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    muse_generative_friction: {
      label:           'The Generative Friction',
      question:        "Which persona's pushback does the operator respond to with the most creative energy?",
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    muse_spoonfeeding_tell: {
      label:           'The Spoon-Feeding Tell',
      question:        'What scaffolding or rubrics does the operator deploy that domesticate student creativity for grading efficiency?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },

    // ── ARCHITECT: Structural and data-habit signals ─────────────
    architect_asset_graveyard: {
      label:           'The Asset Graveyard',
      question:        'Which Drive folders or schemas does the operator consistently abandon or bypass when under pressure?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    architect_semantic_discipline: {
      label:           'The Semantic Discipline',
      question:        'Does the operator naturally adhere to CE-TAG routing, or does the system need aggressive upstream cleaning?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    architect_approval_tolerance: {
      label:           'The Approval Tolerance',
      question:        'How much HITL friction will the operator tolerate before they bypass governance and act manually?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    architect_scale_horizon: {
      label:           'The Scale Horizon',
      question:        'Is the operator designing for this semester only, or structuring data for multi-year evolution?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    architect_data_silo: {
      label:           'The Data Silo',
      question:        'Where is the operator silently duplicating data between Workspace apps because no structural bridge exists yet?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },

    // ── DEVELOPER: Execution footprint signals ───────────────────
    dev_error_reaction: {
      label:           'The Error Reaction',
      question:        'When a pipeline fails, does the operator debug it or abandon and do the task manually?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    dev_concurrency_tell: {
      label:           'The Concurrency Tell',
      question:        'Does the operator spam triggers rapidly under stress, indicating periods where Turnstile locks are critical?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    dev_data_sovereignty: {
      label:           'The Data Sovereignty Tolerance',
      question:        'Will the operator manage UIDs for data safety, or default to fragile name-matching for speed?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    dev_latency_comfort: {
      label:           'The Latency Comfort',
      question:        'Does the operator need immediate visual feedback to trust the system, or is silent background execution acceptable?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    dev_black_box_comfort: {
      label:           'The Black Box Comfort',
      question:        'Does the operator need a step-by-step execution ledger, or only the final output?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },

    // ── AUDITOR: Self-honesty and compliance signals ─────────────
    auditor_shirky_risk: {
      label:           'The Shirky Principle Risk',
      question:        'Is the operator building KOS management tasks to replace grading tasks, avoiding the harder human work?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    auditor_extraction_camouflage: {
      label:           'The Extraction Camouflage',
      question:        'Is a proposed automation actually extracting student data for compliance, masquerading as a pedagogical tool?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    auditor_sycophancy_echo: {
      label:           'The Sycophancy Echo',
      question:        'Is the operator dismissing pushback too quickly, training the RTP to agree rather than challenge?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    auditor_corporate_camouflage: {
      label:           'The Corporate Camouflage',
      question:        'Is the operator using the system to sound "sterile professional" instead of maintaining their authentic voice?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    auditor_goodharts_trap: {
      label:           "The Goodhart's Law Trap",
      question:        'What metric is the operator hyper-focusing on that may be corrupting the actual learning objective?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },

    // ── ALIGNMENT: Relational boundary & wellbeing signals ───────
    alignment_relational_boundary: {
      label:           'The Relational Boundary',
      question:        'When (exact time/day) does the operator consistently stop sending directives, and what relationship are they protecting?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    alignment_stress_tell: {
      label:           'The Stress Tell',
      question:        'What administrative friction category causes the operator\'s prompt tone to become terse or frantic?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    alignment_automation_guilt: {
      label:           'The Automation Guilt',
      question:        'What exhausting task is the operator holding onto because delegating it to the machine feels "lazy"?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    alignment_energy_source: {
      label:           'The Energy Source',
      question:        'What specific classroom interaction consistently restores the operator\'s enthusiasm when reported in session logs?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
    alignment_authentic_baseline: {
      label:           'The Authentic Baseline',
      question:        'What is the true level of informality, brevity, and empathy in the operator\'s raw, unedited communication style?',
      inferred_value:  null,
      confidence:      0.0,
      status:          'PENDING',
      last_updated_uid: null,
    },
  };

  props.setProperty('ALIGNMENT_MIRROR_MATRIX', JSON.stringify(defaultMatrix));
  console.log('[MirrorMatrix] Cold-start schema initialised — 25 variables registered.');
  return defaultMatrix;
}


/**
 * Quietly updates a Mirror Matrix variable based on session inference.
 *
 * Rules:
 *   • VERIFIED variables are never overwritten — they have been
 *     explicitly confirmed by the operator and are locked.
 *   • Confidence is incremented by confidenceDelta and capped at 1.0.
 *   • When confidence crosses 0.75 from PENDING, status moves to
 *     HYPOTHESIZED. The system may then issue a verification prompt.
 *
 * Called by processJsonDrip() for each mirror_update in the drip payload.
 * May also be called directly from processIntakePayload if the Studio
 * inference JSON includes mirror signals in a future schema version.
 *
 * @param  {string} targetKey        Mirror variable key (e.g. 'dev_error_reaction').
 * @param  {string} inferredValue    The inferred value string from Studio.
 * @param  {number} confidenceDelta  How much to increment confidence (0.0–1.0).
 * @param  {string} [sessionUid]     Optional — UID of the triggering session.
 * @returns {boolean}  true = updated; false = key not found or VERIFIED lock.
 */
function updateMirrorVariable(targetKey, inferredValue, confidenceDelta, sessionUid) {
  const props  = PropertiesService.getScriptProperties();
  const matrix = getMirrorMatrix();

  if (!matrix[targetKey]) {
    console.warn('[MirrorMatrix] Unknown key "' + targetKey + '" — skipping.');
    return false;
  }

  // VERIFIED lock — human has explicitly confirmed this value
  if (matrix[targetKey].status === 'VERIFIED') {
    console.log('[MirrorMatrix] "' + targetKey + '" is VERIFIED — skipping update.');
    return true;
  }

  matrix[targetKey].inferred_value   = String(inferredValue || '');
  matrix[targetKey].confidence       = Math.min(
    1.0,
    parseFloat((matrix[targetKey].confidence + (confidenceDelta || 0)).toFixed(4))
  );
  if (sessionUid) matrix[targetKey].last_updated_uid = sessionUid;

  // Threshold trigger: PENDING → HYPOTHESIZED
  if (
    matrix[targetKey].confidence >= 0.75 &&
    matrix[targetKey].status    === 'PENDING'
  ) {
    matrix[targetKey].status = 'HYPOTHESIZED';
    console.log(
      '[MirrorMatrix] "' + targetKey + '" reached 0.75 confidence → HYPOTHESIZED. ' +
      'Ready for ALIGNMENT verification prompt. Value: ' +
      matrix[targetKey].inferred_value
    );
  }

  props.setProperty('ALIGNMENT_MIRROR_MATRIX', JSON.stringify(matrix));
  return true;
}


/**
 * Marks a Mirror Matrix variable as VERIFIED (operator-confirmed).
 * VERIFIED status locks the variable against future passive updates.
 *
 * Call from the web app Diagnostics tab when the operator confirms
 * a HYPOTHESIZED value, or from the governance Blackboard mutation.
 *
 * @param  {string} targetKey     Mirror variable key to verify.
 * @param  {string} [finalValue]  Optional — operator-confirmed value override.
 * @returns {boolean}
 */
function verifyMirrorVariable(targetKey, finalValue) {
  const props  = PropertiesService.getScriptProperties();
  const matrix = getMirrorMatrix();

  if (!matrix[targetKey]) {
    console.warn('[MirrorMatrix] Unknown key "' + targetKey + '" — cannot verify.');
    return false;
  }

  if (finalValue !== undefined) {
    matrix[targetKey].inferred_value = String(finalValue);
  }
  matrix[targetKey].status     = 'VERIFIED';
  matrix[targetKey].confidence = 1.0;

  props.setProperty('ALIGNMENT_MIRROR_MATRIX', JSON.stringify(matrix));
  console.log('[MirrorMatrix] "' + targetKey + '" VERIFIED and locked.');
  return true;
}


/**
 * Returns a summary of Mirror Matrix status for the Diagnostics tab.
 * Sorted by confidence descending so the highest-signal variables
 * surface first.
 *
 * Called by the web app via:
 *   google.script.run.withSuccessHandler(fn).getMirrorMatrixStatus()
 *
 * @returns {Object} { success, total, pending, hypothesized, verified, variables[] }
 */
function getMirrorMatrixStatus() {
  try {
    const matrix    = getMirrorMatrix();
    const variables = Object.entries(matrix).map(([key, v]) => ({
      key,
      label:      v.label      || key,
      confidence: v.confidence || 0,
      status:     v.status     || 'PENDING',
      value:      v.inferred_value || null,
    })).sort((a, b) => b.confidence - a.confidence);

    const counts = variables.reduce((acc, v) => {
      acc[v.status.toLowerCase()] = (acc[v.status.toLowerCase()] || 0) + 1;
      return acc;
    }, {});

    return {
      success:      true,
      total:        variables.length,
      pending:      counts.pending      || 0,
      hypothesized: counts.hypothesized || 0,
      verified:     counts.verified     || 0,
      variables,
    };
  } catch (e) {
    _reportError('getMirrorMatrixStatus', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// PART 3: JSON DRIP EXTRACTOR
// ================================================================
// processJsonDrip() is defined in 11_Studio_Prompt_Engine.gs.
// It was moved there so the validated version (with schema version
// checking and DRIP_QUARANTINE routing) lives alongside the drip
// schema constants and validateDripPayload().
//
// GAS shares one execution scope across all project files, so the
// function is callable from anywhere regardless of which file
// defines it.
// ================================================================


// ================================================================
// PART 4: KOS HEARTBEAT — SMP-002 v5.6 ENFORCEMENT
// ================================================================
//
// The Heartbeat provisions and enforces the zone folder hierarchy
// defined in SMP-002 v5.6. It is the GAS equivalent of the
// infrastructure-as-code layer.
//
// ZONE MAP
//   KOS_ZONE_ACTIVE  00_ACTIVE_STATE    Primary search boundary
//   KOS_ZONE_BUFFER  01_PLANNING_BUFFER Proposals / drafts
//   KOS_ZONE_VAULT   90_CE-VAULT        Retired active assets
//   KOS_ZONE_SCRAP   95_CE-SCRAP        Abandoned proposals
//
// LAW 001 — ID SUPREMACY
//   All zone references use the Drive folder ID stored in
//   PropertiesService, never the folder name. Names are for
//   humans; IDs are for the system.
//
// SEC-001 — SINGLETON RULE
//   If multiple non-trashed folders share the same zone name,
//   the system logs a warning and uses the first result. The
//   operator is alerted via _reportError to manually resolve
//   the duplicate.
//
// SEC-002 — METADATA HEARTBEAT
//   runHeartbeat() verifies that every file registered in
//   PropertiesService as an active asset still has its
//   kos_zone metadata. If metadata is absent (e.g. after a
//   delete/re-upload), _reportError flags the operator.
//
// SEC-003 — SHADOW COPY PROTOCOL
//   stampFileMetadata() detects SHORTCUT MIMEType and refuses
//   to stamp shortcuts as active assets (SEC-004 Shortcut
//   Refusal). The operator must create a local copy first.
//
// SEC-005 — STALENESS CHECK
//   Files in 01_PLANNING_BUFFER that have not been modified
//   for BUFFER_STALENESS_DAYS (14) are flagged via _reportError.
// ================================================================

const KOS_ZONES = {
  ACTIVE: '00_ACTIVE_STATE',
  BUFFER: '01_PLANNING_BUFFER',
  VAULT:  '90_CE-VAULT',
  SCRAP:  '95_CE-SCRAP',
};

const BUFFER_STALENESS_DAYS  = 14;
const KOS_MIME_SHORTCUT      = 'application/vnd.google-apps.shortcut';


/**
 * Provisions the SMP-002 zone folder hierarchy and hard-links
 * all folder IDs into PropertiesService.
 *
 * Idempotent — safe to re-run. Verifies existing folders rather
 * than recreating them. Designed to be called by deployFullSystem()
 * and runHeartbeat().
 *
 * SEC-001 SINGLETON RULE: if a zone name returns more than one
 * non-trashed folder, the operator is warned. The first result
 * is used and its ID is locked. The duplicate should be deleted
 * or renamed manually.
 *
 * @returns {Object}  { success, provisioned[], verified[], warnings[] }
 */
function initializeKOS() {
  const props       = PropertiesService.getScriptProperties();
  const provisioned = [];
  const verified    = [];
  const warnings    = [];

  Object.entries(KOS_ZONES).forEach(([key, name]) => {
    const propKey = 'KOS_ZONE_' + key;
    let   folderId;

    // Check for existing ID in PropertiesService first (LAW 001)
    const cached = props.getProperty(propKey);
    if (cached) {
      try {
        DriveApp.getFolderById(cached);  // throws if folder deleted/inaccessible
        verified.push(name);
        return;  // ID still valid — nothing to do
      } catch (_) {
        console.warn('[initializeKOS] Cached ID for ' + name + ' is stale. Re-provisioning.');
      }
    }

    // Search Drive for the folder by name
    const it = DriveApp.getFoldersByName(name);
    if (it.hasNext()) {
      const first = it.next();
      folderId    = first.getId();

      // SEC-001: warn if duplicate exists
      if (it.hasNext()) {
        const msg = 'SINGLETON VIOLATION: multiple folders named "' + name +
                    '" found. Using ID ' + folderId +
                    '. Delete or rename the duplicate to prevent data routing ambiguity.';
        warnings.push(msg);
        _reportError('initializeKOS:SEC-001:' + name, new Error(msg), null);
      }

      verified.push(name);
    } else {
      // Provision new zone folder in Drive root
      const folder = DriveApp.createFolder(name);
      folderId     = folder.getId();
      provisioned.push(name);
      console.log('[initializeKOS] Provisioned: ' + name + ' (' + folderId + ')');
    }

    props.setProperty(propKey, folderId);
  });

  const success = warnings.length === 0;
  console.log(
    '[initializeKOS] provisioned=' + provisioned.length +
    ' verified=' + verified.length +
    ' warnings=' + warnings.length
  );
  return { success, provisioned, verified, warnings };
}


/**
 * Stamps a Drive file with KOS lifecycle metadata using the
 * Advanced Drive Service (Drive.Files.patch).
 *
 * REQUIRES: Drive API enabled in Apps Script Services.
 *
 * SEC-004 SHORTCUT REFUSAL: Shortcuts are refused — they share a
 * name with their target but have a different ID and cannot reliably
 * carry metadata. The operator must create a Drive copy first.
 *
 * @param  {string} fileId    Google Drive file ID.
 * @param  {string} zone      'active' | 'buffer' | 'vault' | 'scrap'
 * @param  {string} [event]   Lifecycle event that triggered the stamp.
 * @returns {boolean}  true = stamped; false = refused (shortcut or error).
 */
function stampFileMetadata(fileId, zone, event) {
  if (!fileId || !zone) return false;

  try {
    // SEC-004: Shortcut refusal
    const fileMeta = Drive.Files.get(fileId, { fields: 'mimeType,name' });
    if (fileMeta.mimeType === KOS_MIME_SHORTCUT) {
      console.warn(
        '[Heartbeat] SEC-004: Shortcut refused — "' + fileMeta.name + '" (' + fileId + '). ' +
        'Create a Drive copy to enable metadata stamping.'
      );
      return false;
    }

    const now          = new Date().toISOString();
    const appProperties = { kos_zone: zone, last_verified_at: now };

    if (zone === 'active')  appProperties.activated_on = now;
    if (zone === 'vault')   appProperties.vaulted_on   = now;
    if (zone === 'scrap')   appProperties.abandoned_on = now;
    if (zone === 'buffer')  appProperties.proposed_on  = now;

    Drive.Files.patch({ appProperties }, fileId);
    console.log('[Heartbeat] Stamped: ' + fileId + ' → zone=' + zone);
    return true;

  } catch (e) {
    _reportError('stampFileMetadata:' + fileId, e, null);
    return false;
  }
}


/**
 * Reads a file's KOS zone metadata via the Drive Advanced Service.
 * Returns null if the file has no kos_zone appProperty (unverified).
 *
 * @param  {string} fileId
 * @returns {Object|null}  appProperties object or null.
 */
function getFileMetadata(fileId) {
  try {
    const meta = Drive.Files.get(fileId, { fields: 'appProperties,name,modifiedDate,mimeType' });
    return meta.appProperties || null;
  } catch (e) {
    return null;
  }
}


/**
 * Moves a file to the specified KOS zone folder and stamps its
 * lifecycle metadata in a single atomic operation.
 *
 * @param  {string} fileId   Drive file ID.
 * @param  {string} zoneKey  'ACTIVE' | 'BUFFER' | 'VAULT' | 'SCRAP'
 * @returns {boolean}
 */
function moveFileToZone(fileId, zoneKey) {
  const props    = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('KOS_ZONE_' + zoneKey);
  if (!folderId) {
    console.error('[moveFileToZone] Zone ' + zoneKey + ' not provisioned. Run initializeKOS().');
    return false;
  }

  try {
    const file          = DriveApp.getFileById(fileId);
    const targetFolder  = DriveApp.getFolderById(folderId);
    const zoneLabel     = zoneKey.toLowerCase();

    // Move file — remove from all current parents, add to zone folder
    file.getParents().toArray().forEach(p => { try { p.removeFile(file); } catch (_) {} });
    targetFolder.addFile(file);

    stampFileMetadata(fileId, zoneLabel);
    return true;

  } catch (e) {
    _reportError('moveFileToZone:' + fileId + ':' + zoneKey, e, null);
    return false;
  }
}


/**
 * Daily heartbeat. Runs two checks:
 *
 *   1. SEC-002 Metadata Integrity: Scans files listed in
 *      PropertiesService as core assets and verifies their
 *      kos_zone metadata is still present. Flags any file
 *      that has lost its metadata (e.g. after a delete/re-upload).
 *
 *   2. SEC-005 Staleness Check: Scans the Planning Buffer for
 *      files not modified in BUFFER_STALENESS_DAYS days and
 *      reports them via _reportError so the operator can decide
 *      whether to Activate, Scrap, or continue working on them.
 *
 * Fires: daily 07:00 via time-driven trigger (add to setupAllTriggers).
 */
function runHeartbeat() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('[Heartbeat] Could not acquire lock — skipping.');
    return;
  }
  try {
    _runMetadataIntegrityCheck();
    _runStalenessCheck();
    console.log('[Heartbeat] Daily check complete.');
  } catch (e) {
    _reportError('runHeartbeat', e, null);
  } finally {
    lock.releaseLock();
  }
}


/**
 * SEC-002: Verifies that core registered assets still carry
 * their kos_zone metadata. Flags metadata loss via _reportError.
 *
 * Core assets are identified by PropertiesService keys whose
 * values are Google Drive file IDs (non-folder entries from
 * _registerAllProperties, _registerDocPointers, etc.).
 *
 * Only keys prefixed with ID_ and INDEX_ID are checked.
 */
function _runMetadataIntegrityCheck() {
  const props  = PropertiesService.getScriptProperties();
  const all    = props.getProperties();
  let   issues = 0;

  const fileKeys = Object.keys(all).filter(
    k => (k.startsWith('ID_') || k === 'INDEX_ID') && !k.includes('FOLDER')
  );

  fileKeys.forEach(key => {
    const id = all[key];
    if (!id || id.length < 10) return;

    const meta = getFileMetadata(id);
    if (meta === null) return;   // Drive API unavailable — skip silently

    if (!meta.kos_zone) {
      issues++;
      _reportError(
        'Heartbeat:SEC-002:MetadataLoss:' + key,
        new Error(
          'File ' + id + ' (property: ' + key + ') has lost its kos_zone metadata. ' +
          'This can occur after a manual delete + re-upload. ' +
          'Re-run stampFileMetadata("' + id + '", "<zone>") to restore, or ' +
          'run setupRoutingProperties() if the file ID has changed.'
        ),
        null
      );
    }
  });

  if (issues > 0) {
    console.warn('[Heartbeat] SEC-002: ' + issues + ' asset(s) with missing metadata flagged.');
  } else {
    console.log('[Heartbeat] SEC-002: All core assets metadata intact.');
  }
}


/**
 * SEC-005: Flags Planning Buffer files not modified in
 * BUFFER_STALENESS_DAYS days via _reportError (daily digest).
 * Does NOT auto-move files — that requires operator approval.
 */
function _runStalenessCheck() {
  const props    = PropertiesService.getScriptProperties();
  const bufferId = props.getProperty('KOS_ZONE_BUFFER');

  if (!bufferId) {
    console.warn('[Heartbeat] SEC-005: KOS_ZONE_BUFFER not provisioned — skipping staleness check.');
    return;
  }

  const buffer    = DriveApp.getFolderById(bufferId);
  const files     = buffer.getFiles();
  const cutoffMs  = BUFFER_STALENESS_DAYS * 24 * 60 * 60 * 1000;
  const now       = Date.now();
  let   staleCount = 0;

  while (files.hasNext()) {
    const file       = files.next();
    const lastMod    = file.getLastUpdated().getTime();
    const ageMs      = now - lastMod;

    if (ageMs > cutoffMs) {
      staleCount++;
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      _reportError(
        'Heartbeat:SEC-005:Staleness',
        new Error(
          '"' + file.getName() + '" (' + file.getId() + ') has been in ' +
          KOS_ZONES.BUFFER + ' for ' + ageDays + ' days without modification. ' +
          'Decision required: Activate it, Scrap it, or continue working on it. ' +
          'File URL: ' + file.getUrl()
        ),
        null
      );
    }
  }

  console.log('[Heartbeat] SEC-005: Staleness check complete. ' + staleCount + ' stale item(s) flagged.');
}


/**
 * Recovery function: re-stamps metadata on a file using its CE-TAG
 * as a last resort if the registered file ID has changed (e.g. after
 * a delete + re-upload cycle). Searches by name prefix match.
 *
 * AUDITOR GATE: This function must only be called after manual
 * verification that the file found is genuinely the correct asset.
 * It writes a warning to ERROR_LOG and requires explicit zone
 * confirmation from the caller.
 *
 * @param  {string} ceTagPrefix  CE-TAG prefix, e.g. 'CE-STATE: Master Schedule'.
 * @param  {string} zoneKey      'ACTIVE' | 'BUFFER' | 'VAULT' | 'SCRAP'
 * @returns {Object}  { found: boolean, fileId?, name?, stamped: boolean }
 */
function recoverMetadata(ceTagPrefix, zoneKey) {
  const result = { found: false, stamped: false };

  _reportError(
    'recoverMetadata:AUDITOR_GATE',
    new Error(
      'recoverMetadata() called for prefix "' + ceTagPrefix + '" targeting zone ' + zoneKey + '. ' +
      'Verify the identified file is correct before allowing this recovery to proceed. ' +
      'This is a last-resort operation — file ID may have changed.'
    ),
    null
  );

  try {
    const it = DriveApp.searchFiles(
      'title contains "' + ceTagPrefix.replace(/"/g, '') + '" and trashed = false'
    );
    if (!it.hasNext()) return result;

    const file   = it.next();
    result.found = true;
    result.fileId = file.getId();
    result.name   = file.getName();

    // Re-stamp and update PropertiesService key if zone is ACTIVE
    stampFileMetadata(result.fileId, zoneKey.toLowerCase(), 'RECOVERY');
    result.stamped = true;

    console.log('[recoverMetadata] Recovered: ' + result.name + ' → ' + zoneKey);
    return result;

  } catch (e) {
    _reportError('recoverMetadata', e, null);
    return result;
  }
}


// ================================================================
// WEB APP CALLABLES — DIAGNOSTICS TAB
// ================================================================

/**
 * Returns Mirror Matrix status for the web app Diagnostics tab.
 * Alias — getMirrorMatrixStatus() is defined above.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .getMirrorMatrixStatus()
 */
// getMirrorMatrixStatus() already defined above — no alias needed.


/**
 * Runs initializeKOS() on demand from the Diagnostics tab.
 * Returns the provisioning log for display.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .initializeKOSFromUI()
 */
function initializeKOSFromUI() {
  try {
    return initializeKOS();
  } catch (e) {
    _reportError('initializeKOSFromUI', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * Returns zone folder health for the Diagnostics tab — verifies
 * all four zone IDs are registered and the folders still exist.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .getZoneHealth()
 */
function getZoneHealth() {
  try {
    const props  = PropertiesService.getScriptProperties();
    const zones  = Object.entries(KOS_ZONES).map(([key, name]) => {
      const id  = props.getProperty('KOS_ZONE_' + key);
      let   ok  = false;
      let   url = null;
      if (id) {
        try {
          const f = DriveApp.getFolderById(id);
          ok  = true;
          url = f.getUrl();
        } catch (_) {}
      }
      return { key, name, id: id || null, ok, url };
    });
    return { success: true, zones };
  } catch (e) {
    _reportError('getZoneHealth', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// ═══════════════════════════════════════════════════════════════
// REQUIRED PATCHES TO EXISTING FILES
// ═══════════════════════════════════════════════════════════════
//
// Apply these changes to the corresponding existing files.
// Each patch is clearly bounded and self-contained.
//
// ── PATCH A: 1_Config_And_Deploy.gs ────────────────────────────
//
// 1. DELETE resetProperties() from 1_Config_And_Deploy.gs.
//    The canonical version in 5_Error_And_Utilities.gs is complete
//    and adds KOS_ADMIN_EMAIL to the preserved list. Having two
//    definitions is a GAS compile hazard.
//
// 2. Add Turnstile trigger to setupAllTriggers(). Inside the
//    function, after the sensor1 tryInstall block, add:
//
//    tryInstall('runMatrixTurnstile', () =>
//      ScriptApp.newTrigger('runMatrixTurnstile')
//        .timeBased().everyMinutes(5).create()
//    );
//
//    And add 'runMatrixTurnstile' to the KOS_TRIGGERS array at the
//    top of the function so the idempotent clean-up removes it on
//    redeploy:
//
//    const KOS_TRIGGERS = [
//      'sensor1_scanInboundSessions',
//      'processInferenceQueue',
//      'sendDailyErrorReport',
//      'runSemanticSweeper',
//      'sweepRootForExhaust',
//      'sensor3_externalTelemetry',
//      'runMatrixTurnstile',   // ← ADD
//      'runHeartbeat',         // ← ADD
//    ];
//
// 3. Add Heartbeat trigger to setupAllTriggers():
//
//    tryInstall('runHeartbeat', () =>
//      ScriptApp.newTrigger('runHeartbeat')
//        .timeBased().atHour(7).everyDays(1).create()
//    );
//
// 4. Add governance trigger auto-install to setupAllTriggers().
//    This closes the gap identified in the review (issue #2).
//    After the sensor3 tryInstall block, add:
//
//    tryInstall('onGovernanceEdit', () => {
//      const indexId = PropertiesService.getScriptProperties()
//                        .getProperty('INDEX_ID');
//      if (!indexId) throw new Error('INDEX_ID not set');
//      ScriptApp.newTrigger('onGovernanceEdit')
//        .forSpreadsheet(SpreadsheetApp.openById(indexId))
//        .onEdit().create();
//    });
//
//    Also add 'onGovernanceEdit' to the KOS_TRIGGERS array above.
//
// 5. Add initializeKOS() call to deployFullSystem() as Step 1.5,
//    between folder tree and spreadsheet creation:
//
//    emit('Provisioning SMP-002 zone folders…');
//    try {
//      const zr = initializeKOS();
//      zr.provisioned.forEach(n => emit('  ✔ Provisioned: ' + n));
//      zr.verified.forEach(n =>   emit('  ↷ Verified: '   + n));
//      zr.warnings.forEach(w =>   emit('  ⚠ ' + w));
//    } catch (e) { fail('initializeKOS', e); }
//
// 6. Add persona scaffolding fallback to _copyPersonas() so that
//    if a source persona doc is not found in Drive, a placeholder
//    is scaffolded in f02 rather than silently skipping:
//
//    REPLACE the current "Not found" skip block:
//      if (!sourceFile) { log.push('  ⚠ ' + baseName + ': Not found in Drive — skipped'); return; }
//
//    WITH:
//      if (!sourceFile) {
//        log.push('  ↷ ' + baseName + ': Not found in Drive — scaffolding placeholder');
//        _scaffoldDoc(baseName + '_PLACEHOLDER', f02, [
//          { h1: baseName },
//          { h2: 'STATUS: PLACEHOLDER — Replace this document with the real persona' },
//          { p:  'This placeholder was created by deployFullSystem because the source ' +
//                'persona document was not found in Drive. ' +
//                'Add the real persona document to Drive and re-run deployFullSystem().' },
//          { h2: 'Persona Identity' },       { p: '[Define persona role and mandate here]' },
//          { h2: 'Core Directives' },        { p: '[List the 3-5 core operating rules]' },
//          { h2: 'Voice & Tone' },           { p: '[How does this persona communicate?]' },
//          { h2: 'HITL Firewall Rules' },    { p: '[What will this persona never do autonomously?]' },
//        ]);
//        return;
//      }
//
// ── PATCH B: 3_Queue_Processor.gs ──────────────────────────────
//
// Add processJsonDrip() call inside processIntakePayload(), after
// the vector router call and before the return statement:
//
//    // ── JSON DRIP EXTRACTOR ──────────────────────────────────
//    // Non-fatal: drip processing is best-effort. A missing or
//    // malformed drip block does not affect intake success.
//    try {
//      const fullText = DocumentApp.openById(
//        props.getProperty('ID_CURRENT_STATE') // or the inference doc ID
//      ).getBody().getText();
//      processJsonDrip(fullText, uid);
//    } catch (_) {}
//
// NOTE: The drip extractor should ideally scan the raw inference
// doc (the payload doc whose fileId is in STAGING), not the
// CURRENT_STATE doc. In the queue processor, you have access to
// `fileId` (the payload doc ID) earlier in the flow. Route the
// drip scan there:
//
//    try {
//      const inferenceText = DocumentApp.openById(fileId).getBody().getText();
//      processJsonDrip(inferenceText, uid);
//    } catch (_) {}
//
// ── PATCH C: 7_WebApp.gs ───────────────────────────────────────
//
// Add getMirrorMatrixStatus, initializeKOSFromUI, getZoneHealth
// to the "FUNCTIONS CALLABLE VIA google.script.run" comment block:
//
//   Diagnostics tab (additions):
//     getMirrorMatrixStatus()   → 10_KOS_Extensions.gs
//     initializeKOSFromUI()     → 10_KOS_Extensions.gs
//     getZoneHealth()           → 10_KOS_Extensions.gs
//     verifyMirrorVariable(k,v) → 10_KOS_Extensions.gs
//
// ── PATCH D: 8_WebApp_UI.html ──────────────────────────────────
//
// The Mirror Matrix status panel and Zone Health indicator are
// new Diagnostics tab widgets. Add the following sections inside
// the Diagnostics tab content area after the existing vector state
// panel:
//
//  <!-- Mirror Matrix Status -->
//  <div class="section-card" id="mirror-panel">
//    <div class="section-header">
//      <span class="section-icon">🪞</span>
//      <span class="section-title">Mirror Matrix</span>
//      <span class="sync-line" id="mirror-sync"></span>
//    </div>
//    <div id="mirror-status">Loading…</div>
//    <button class="btn btn-ghost" onclick="loadMirrorStatus()">Refresh</button>
//  </div>
//
//  <!-- Zone Health -->
//  <div class="section-card" id="zone-panel">
//    <div class="section-header">
//      <span class="section-icon">📁</span>
//      <span class="section-title">Zone Health</span>
//    </div>
//    <div id="zone-status">Loading…</div>
//    <button class="btn btn-ghost" onclick="loadZoneHealth()">Refresh</button>
//    <button class="btn btn-ghost" onclick="handleInitKOS()">Initialize Zones</button>
//  </div>
//
// And add the corresponding JS handlers:
//
//  function loadMirrorStatus() {
//    callServer('getMirrorMatrixStatus', [], res => {
//      const el = document.getElementById('mirror-status');
//      if (!res.success) { el.textContent = 'Error: ' + esc(res.message); return; }
//      const bars = res.variables.filter(v => v.confidence > 0)
//        .map(v =>
//          '<div class="mirror-row">' +
//          '<span class="mirror-label">' + esc(v.label) + '</span>' +
//          '<span class="mirror-status ' + v.status.toLowerCase() + '">' + esc(v.status) + '</span>' +
//          '<div class="mirror-bar"><div class="mirror-fill" style="width:' +
//          Math.round(v.confidence * 100) + '%"></div></div>' +
//          '</div>'
//        ).join('');
//      el.innerHTML = bars ||
//        '<p class="empty-state">No observations yet — confidence builds passively.</p>';
//      document.getElementById('mirror-sync').textContent =
//        res.verified + ' verified · ' + res.hypothesized + ' hypothesized · ' +
//        res.pending + ' pending';
//    });
//  }
//
//  function loadZoneHealth() {
//    callServer('getZoneHealth', [], res => {
//      const el = document.getElementById('zone-status');
//      if (!res.success) { el.textContent = 'Error: ' + esc(res.message); return; }
//      el.innerHTML = res.zones.map(z =>
//        '<div class="health-row">' +
//        '<span>' + (z.ok ? '🟢' : '🔴') + ' ' + esc(z.name) + '</span>' +
//        (z.url ? '<a href="' + esc(z.url) + '" target="_blank">Open ↗</a>' : '') +
//        '</div>'
//      ).join('');
//    });
//  }
//
//  function handleInitKOS() {
//    callServer('initializeKOSFromUI', [], res => {
//      const msg = res.success
//        ? 'Zones ready. Provisioned: ' + (res.provisioned || []).join(', ') || 'none'
//        : 'Error: ' + res.message;
//      showDiagStatus(msg);
//      loadZoneHealth();
//    });
//  }
//
// Also call loadMirrorStatus() and loadZoneHealth() inside the
// existing loadDiagnostics() function so they populate on tab open.
//
// ═══════════════════════════════════════════════════════════════
// END REQUIRED PATCHES
// ================================================================


// ================================================================
// END 10_KOS_Extensions.gs
// KOS v8.0 — The Headless Studio Edition
// ================================================================
