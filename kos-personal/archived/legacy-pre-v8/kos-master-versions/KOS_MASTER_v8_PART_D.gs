// ============================================================================
// KOS MASTER SCRIPT v8.0 — PART D of 4
// KOS IP PROTECTION LAYER v2.0
// Paste immediately below Part C.
//
// Changes from v1.0 (v7.1 Part D):
//   - generateIdentityKey() now also called by Socratic Onboarding (Step 7)
//     and can be called standalone from menu
//   - verifyFidelityClause() ALIGNMENT check uses partial name match (v7.1 fix)
//   - Both generateIdentityKey() and verifyIdentityKey() route salt access
//     through getKOSCalibration() (v7.1 fix)
//   - _checkEngineStatus() now also checks thesis_verified flag (v8.0)
//   - _createLicenseDoc() and _createWhitePaperDoc() moved to Part A
//     (called from deployFullSystem — kept here as stubs for clarity)
// ============================================================================


// ============================================================================
// LAYER 1: IDENTITY KEY ENGINE
// Derived from SHA-256(CORE_THESIS_text + "::KOS::" + IDENTITY_KEY_SALT).
// Called by Socratic Onboarding Step 7 and available standalone from menu.
// ============================================================================

/**
 * Generates the Identity Key and stores it as RTP_IDENTITY_HASH.
 * Called automatically at the end of Socratic Onboarding.
 * Also available standalone: 🧠 Council → Generate Identity Key.
 *
 * Requires:
 *   1. CORE_THESIS doc written (not placeholder)
 *   2. IDENTITY_KEY_SALT set in PropertiesService (via Onboarding Step 7
 *      or setupCalibration())
 *
 * @returns {string|null} The full identity hash, or null on failure.
 */
function generateIdentityKey() {
  let ui;
  try { ui = DocumentApp.getUi(); } catch (_) {}

  const props = PropertiesService.getScriptProperties();

  // Fetch CORE_THESIS document via pointer
  const coreThesisId = props.getProperty('ID_CORE_THESIS');
  if (!coreThesisId) {
    if (ui) ui.alert('❌ Identity Key Failed',
      'ID_CORE_THESIS pointer not found.\n\nRun 🚀 Deploy → Deploy Full System first.',
      ui.ButtonSet.OK);
    return null;
  }

  // Read and validate CORE_THESIS content
  const coreThesisDoc  = DocumentApp.openById(coreThesisId);
  const coreThesisText = coreThesisDoc.getBody().getText().trim();

  if (coreThesisText.length < 50 ||
      coreThesisText.includes('[Awaiting Genesis Protocol') ||
      coreThesisText.includes('[Complete via Socratic Onboarding') ||
      coreThesisText.includes('Define what this Brain Trust system is')) {
    if (ui) ui.alert('⚠ CORE_THESIS Not Ready',
      'CORE_THESIS still contains placeholder text.\n\n' +
      'Run 🧠 Council → Begin Socratic Onboarding to write your thesis and generate the key.',
      ui.ButtonSet.OK);
    return null;
  }

  // Fetch salt through canonical accessor (PIVOT 008)
  const salt = getKOSCalibration('IDENTITY_KEY_SALT');
  if (!salt || salt === 'YOUR_PRIVATE_STRING_HERE' || salt.length < 4) {
    if (ui) ui.alert('⚠ Salt Not Set',
      'IDENTITY_KEY_SALT has not been configured.\n\n' +
      'Run 🧠 Council → Begin Socratic Onboarding (Step 7 sets the salt automatically).',
      ui.ButtonSet.OK);
    return null;
  }

  // Derive Identity Key: SHA-256(thesis + separator + salt)
  const combined    = coreThesisText + '::KOS::' + salt;
  const hashBytes   = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined);
  const identityKey = hashBytes
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
    .join('');

  props.setProperty('RTP_IDENTITY_HASH',   identityKey);
  props.setProperty('RTP_IDENTITY_PREFIX', identityKey.substring(0, 16));

  const prefix = identityKey.substring(0, 16);
  console.log(`[IDENTITY_KEY] Generated. Prefix: ${prefix}`);

  if (ui) ui.alert('✅ Identity Key Generated',
    `Engine ARMED with unique deployment fingerprint.\n\n` +
    `Identity Key Prefix: ${prefix}...\n` +
    '(Full hash stored in PropertiesService as RTP_IDENTITY_HASH)\n\n' +
    'This key is unique to your CORE_THESIS and private salt.\n' +
    'If you update your Core Thesis, re-run this to refresh the fingerprint.',
    ui.ButtonSet.OK);

  return identityKey;
}

/**
 * Verifies the stored Identity Key against current CORE_THESIS content.
 * Called by _checkEngineStatus() at every processIntakePayload() gateway.
 *
 * @returns {{ valid: bool, status: string, prefix: string|null }}
 */
function verifyIdentityKey() {
  const props  = PropertiesService.getScriptProperties();
  const stored = props.getProperty('RTP_IDENTITY_HASH');
  if (!stored) return { valid: false, status: 'NOT_SET', prefix: null };

  const coreThesisId = props.getProperty('ID_CORE_THESIS');
  if (!coreThesisId) return { valid: false, status: 'COLD', prefix: null };

  try {
    const text = DocumentApp.openById(coreThesisId).getBody().getText().trim();
    // Route salt access through canonical accessor (PIVOT 008)
    const salt = getKOSCalibration('IDENTITY_KEY_SALT');
    if (!salt) return { valid: false, status: 'COLD', prefix: null };

    const combined  = text + '::KOS::' + salt;
    const hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined);
    const current   = hashBytes
      .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
      .join('');

    if (current === stored) {
      return { valid: true, status: 'ARMED', prefix: stored.substring(0, 16) };
    } else {
      return { valid: false, status: 'THESIS_CHANGED', prefix: stored.substring(0, 16) };
    }
  } catch (e) {
    console.warn('[IDENTITY_KEY] Verification error: ' + e.message);
    return { valid: false, status: 'COLD', prefix: null };
  }
}

/**
 * Menu-accessible identity status check.
 */
function auditIdentityKey() {
  const ui     = DocumentApp.getUi();
  const result = verifyIdentityKey();
  const messages = {
    ARMED         : `✅ Engine ARMED\n\nIdentity Key: ${result.prefix}...\nCORE_THESIS fingerprint verified.\nDeployment is uniquely activated.`,
    NOT_SET       : `⚠ Engine COLD — Identity Key Not Generated\n\nRun:\n1. 🧠 Council → Begin Socratic Onboarding\n   (Step 7 generates the key automatically)\n\nOR manually:\n1. Write your CORE_THESIS\n2. setupCalibration() → set IDENTITY_KEY_SALT\n3. 🧠 Council → Generate Identity Key`,
    COLD          : `⚠ Engine COLD — Pointers Missing\n\nRun 🚀 Deploy first, then Begin Socratic Onboarding.`,
    THESIS_CHANGED: `⚠ CORE_THESIS Has Changed\n\nIdentity Key Prefix: ${result.prefix}...\n\nYour Core Thesis has been modified since the key was generated.\nRun 🧠 Council → Generate Identity Key to refresh the fingerprint.`,
  };
  ui.alert('Identity Key Status', messages[result.status] || 'Unknown status.', ui.ButtonSet.OK);
}


// ============================================================================
// LAYER 3: FIDELITY CLAUSE VERIFICATION
// Verifies ALIGNMENT, HITL, and CORE_THESIS structural requirements.
// Soft warning — never hard blocks. Runs inside _checkEngineStatus().
// ============================================================================

/**
 * Verifies three Fidelity Clause requirements:
 *   1. ALIGNMENT persona document exists and has real content
 *   2. HITL_ACTIVE flag is explicitly set
 *   3. CORE_THESIS is not a placeholder
 *
 * @returns {{ compliant: bool, violations: string[] }}
 */
function verifyFidelityClause() {
  const props      = PropertiesService.getScriptProperties();
  const violations = [];

  // Check 1: ALIGNMENT persona — partial name match (handles versioned filenames)
  try {
    const folderId = props.getProperty('ID_02_COUNCIL_ALIGNMENTS');
    if (folderId) {
      const folder   = DriveApp.getFolderById(folderId);
      const allFiles = folder.getFiles();
      let   found    = null;
      while (allFiles.hasNext()) {
        const f = allFiles.next();
        if (f.getName().startsWith('PERSONA_ALIGNMENT')) { found = f; break; }
      }
      if (!found) {
        violations.push('ALIGNMENT persona not found in 02_Council_Alignments. Expected file starting with "PERSONA_ALIGNMENT".');
      } else {
        const text = DocumentApp.openById(found.getId()).getBody().getText().trim();
        if (text.length < 100 || text.includes('[Paste full alignment constraints here')) {
          violations.push(`ALIGNMENT persona (${found.getName()}) contains only placeholder text — not yet configured.`);
        }
      }
    } else {
      violations.push('ID_02_COUNCIL_ALIGNMENTS pointer missing — cannot verify ALIGNMENT cog.');
    }
  } catch (e) { violations.push('ALIGNMENT verification error: ' + e.message); }

  // Check 2: HITL flag
  if (props.getProperty('HITL_ACTIVE') !== 'true') {
    violations.push('HITL_ACTIVE flag not set. Run 🧠 Council → Activate HITL Firewall.');
  }

  // Check 3: CORE_THESIS not a placeholder
  try {
    const thesisId = props.getProperty('ID_CORE_THESIS');
    if (thesisId) {
      const text = DocumentApp.openById(thesisId).getBody().getText().trim();
      if (text.length < 50 ||
          text.includes('[Awaiting Genesis Protocol') ||
          text.includes('[Complete via Socratic Onboarding') ||
          text.includes('Define what this Brain Trust system is')) {
        violations.push('CORE_THESIS contains placeholder text — Cold Engine Protocol active. Complete Socratic Onboarding.');
      }
    } else {
      violations.push('ID_CORE_THESIS pointer missing — cannot verify Blank Slate Protocol.');
    }
  } catch (e) { violations.push('CORE_THESIS verification error: ' + e.message); }

  return { compliant: violations.length === 0, violations };
}

/**
 * Operator declaration — sets HITL_ACTIVE flag after explicit confirmation.
 */
function activateHITLFirewall() {
  const ui      = DocumentApp.getUi();
  const confirm = ui.alert('🛡 Activate HITL Firewall',
    'By activating the Human-In-The-Loop Firewall, you confirm:\n\n' +
    '• No autonomous writes to canonical documents without your verification\n' +
    '• No external communications without your approval\n' +
    '• All mutations require your checkbox in the Blackboard\n' +
    '• The AI operates in READ / Audit mode — DICTATE / WRITE / Verify is your role\n\n' +
    'Activate?',
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty('HITL_ACTIVE', 'true');
  ui.alert('✅ HITL Firewall Active',
    'Human-In-The-Loop compliance confirmed.\nStored in PropertiesService — persists across sessions.',
    ui.ButtonSet.OK);
  console.log('[HITL_FIREWALL] Activated by operator.');
}

/**
 * Combined engine status report — all four layers.
 */
function auditEngineStatus() {
  const ui       = DocumentApp.getUi();
  const identity = verifyIdentityKey();
  const fidelity = verifyFidelityClause();
  const cal      = _getCalibrationStatus();
  const props    = PropertiesService.getScriptProperties();
  const hitl     = props.getProperty('HITL_ACTIVE') === 'true';
  const thesis   = props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true';
  const day      = props.getProperty(CFG.PROP.ONBOARDING_DAY) || '0';

  const lines = [
    identity.valid
      ? `✅ IDENTITY KEY: ARMED (${identity.prefix}...)`
      : `⚠ IDENTITY KEY: ${identity.status}`,
    cal.armed
      ? `✅ CALIBRATION WALL: ARMED (${cal.count} key(s))`
      : '⚠ CALIBRATION WALL: COLD — run Socratic Onboarding or setupCalibration()',
    hitl
      ? '✅ HITL FIREWALL: ACTIVE'
      : '⚠ HITL FIREWALL: NOT CONFIRMED — run Activate HITL Firewall',
    fidelity.compliant
      ? '✅ FIDELITY CLAUSE: COMPLIANT'
      : '⚠ FIDELITY CLAUSE: VIOLATIONS:\n' + fidelity.violations.map(v => '   • ' + v).join('\n'),
    thesis
      ? `✅ THESIS VERIFIED: Day ${day} of ${CFG.ONBOARDING_DAYS}`
      : '⚠ THESIS: Not sealed — run Socratic Onboarding',
  ];

  const fullyArmed = identity.valid && cal.armed && hitl && fidelity.compliant && thesis;
  ui.alert(
    fullyArmed ? '✅ ENGINE FULLY ARMED' : '⚠ ENGINE COLD — Review below',
    lines.join('\n'),
    ui.ButtonSet.OK
  );
}

/**
 * Runs all IP protection checks. Returns combined status.
 * Called at processIntakePayload() gateway — soft warning, never blocks.
 *
 * @returns {{ armed: bool, warnings: string[] }}
 */
function _checkEngineStatus() {
  const warnings  = [];
  const identity  = verifyIdentityKey();
  const fidelity  = verifyFidelityClause();
  const cal       = _getCalibrationStatus();
  const props     = PropertiesService.getScriptProperties();
  const hitl      = props.getProperty('HITL_ACTIVE') === 'true';
  const thesis    = props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true';

  if (!identity.valid) warnings.push(`[COLD ENGINE] Identity Key: ${identity.status}. Run Socratic Onboarding.`);
  if (!cal.armed)      warnings.push('[COLD ENGINE] Calibration Wall not armed. Run Socratic Onboarding.');
  if (!hitl)           warnings.push('[COLD ENGINE] HITL Firewall not confirmed. Run Activate HITL Firewall.');
  if (!thesis)         warnings.push('[COLD ENGINE] Thesis not verified. Run Socratic Onboarding.');
  if (!fidelity.compliant) fidelity.violations.forEach(v => warnings.push('[FIDELITY VIOLATION] ' + v));

  warnings.forEach(w => console.warn(w));

  return {
    armed   : identity.valid && cal.armed && hitl && fidelity.compliant && thesis,
    warnings
  };
}

// ============================================================================
// POST-PASTE CHECKLIST (v8.0):
//
//   [ ] Paste Parts A → B → C → D in order. Save in Apps Script editor.
//   [ ] Open DROP_ZONE Google Doc → 🚀 Deploy → Deploy Full System
//   [ ] 🧠 Council → Begin Socratic Onboarding
//       └─ 8 questions (~10 min)
//       └─ Sets IDENTITY_KEY_SALT (Step 7)
//       └─ Seeds CORE_THESIS with your answers
//       └─ Generates Identity Key automatically
//       └─ Infers and sets calibration weights from your role
//       └─ Starts 21-day onboarding log
//   [ ] 🧠 Council → Setup Governance Trigger
//   [ ] 🧠 Council → Activate HITL Firewall
//   [ ] 🧠 Council → Full Engine Status Audit — confirm all 5 layers ARMED
//   [ ] Open START_HERE_GEM_SETUP → configure Gemini Gem
//
// SESSION INTAKE WORKFLOW (v8.0):
//   [ ] Paste session log into DROP_ZONE
//   [ ] 🧠 Council → ① Process Session Log → Chunk → Queue
//       └─ Quarantines raw log as [RAW]_${logUUID}
//       └─ Creates [CHUNK]_${chunkId} docs in 03.4_RAW_EXHAUST
//       └─ Logs lightweight tracking rows to STAGING_PIPELINE
//   [ ] 🧠 Council → ② Review Chunks for Curator
//       └─ Shows all PENDING_INFERENCE / NEEDS_CURATOR rows
//   [ ] For each chunk doc (open via Smart Chip in STAGING_PIPELINE Col C):
//       └─ Copy chunk text → Curator Gem → paste JSON back into doc
//       └─ Set STAGING_PIPELINE Col E = BUFFERED
//   [ ] 🧠 Council → ③ Process Intake Payloads (Phase 4)
//       └─ Extracts Curator JSON from each BUFFERED chunk doc
//       └─ Writes to CURRENT_STATE, PIVOTS_AND_LESSONS, MATRIX_LEDGER
//       └─ Writes to SESSION_LOG, COG_REGISTRY, ACTION_REGISTER
//       └─ Routes vectors through full Vector Router (decay + incubator)
//       └─ Moves processed docs to 03.3_PROCESSED_EXHAUST
//   [ ] 🧠 Council → ④ Consolidate Inference (Phase 3) → Get Startup Primer
//   [ ] 🧠 Council → Compile Vector Primers (run after several sessions)
//   [ ] 🧠 Council → Build Session Context (inject into next Gem session)
//
// ============================================================================
// END OF KOS MASTER SCRIPT v8.0
// ============================================================================
