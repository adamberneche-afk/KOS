/**
 * ============================================================================
 * KOS IP PROTECTION LAYER — v1.0
 * Implements the three mechanisms from KOS White Paper v2.0:
 *
 *   Layer 1 — Identity Key
 *     Derived from SHA-256(CORE_THESIS_text + IDENTITY_KEY_SALT).
 *     Unique to each deployment. Prevents one-click mass replication.
 *     Stored in PropertiesService as RTP_IDENTITY_HASH.
 *     Enforcement: soft warning (COLD ENGINE flag) — system continues.
 *
 *   Layer 2 — Calibration Wall (PIVOT 008)
 *     All weights, thresholds, and identity data sequestered in
 *     PropertiesService. Never appear in source code.
 *     Enforced by runHardeningAudit() in Part B.
 *
 *   Layer 3 — Fidelity Clause
 *     Verifies ALIGNMENT cog and HITL Firewall are structurally present.
 *     Runs at deploy and at each processIntakePayload() gateway.
 *     Logs violations as COLD ENGINE warnings — does not hard block.
 *
 * LICENSE: Polyform Noncommercial 1.0.0
 * https://polyformproject.org/licenses/noncommercial/1.0.0
 * Copyright (c) 2026 Adam Berneche / RTP Council
 *
 * PASTE ORDER: Add this as Part D — after Parts A, B, C.
 * ============================================================================
 */


// ============================================================================
// LAYER 1: IDENTITY KEY ENGINE
// Derives a unique deployment fingerprint from CORE_THESIS + IDENTITY_KEY_SALT.
// Each user's deployment produces a different hash — identical source code
// produces a different activated system for each operator.
// ============================================================================

/**
 * Generates the Identity Key for this deployment and stores it in
 * PropertiesService as RTP_IDENTITY_HASH.
 *
 * Derivation: SHA-256(CORE_THESIS_full_text + IDENTITY_KEY_SALT)
 * The salt is the user's private string from setupCalibration() —
 * it is the entropy that makes the key non-reproducible from
 * CORE_THESIS alone.
 *
 * Run this once after:
 *   1. CORE_THESIS has been written (not the placeholder)
 *   2. setupCalibration() has been run and IDENTITY_KEY_SALT is set
 *
 * Safe to re-run if CORE_THESIS changes — generates a new hash.
 */
function generateIdentityKey() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // Fetch the CORE_THESIS document via pointer
  const coreThesisId = props.getProperty('ID_CORE_THESIS');
  if (!coreThesisId) {
    ui.alert('❌ Identity Key Failed',
      'ID_CORE_THESIS pointer not found. Run deployFullSystem() first.',
      ui.ButtonSet.OK);
    return null;
  }

  // Read CORE_THESIS content
  const coreThesisDoc  = DocumentApp.openById(coreThesisId);
  const coreThesisText = coreThesisDoc.getBody().getText().trim();

  // Validate CORE_THESIS has been written (not the deploy placeholder)
  if (coreThesisText.length < 50 ||
      coreThesisText.includes('[Awaiting Genesis Protocol') ||
      coreThesisText.includes('Define what this Brain Trust system is')) {
    ui.alert('⚠ CORE_THESIS Not Ready',
      'The CORE_THESIS document still contains placeholder text.\n\n' +
      'Write your actual Core Thesis before generating the Identity Key.\n' +
      'The system will remain COLD until you do.',
      ui.ButtonSet.OK);
    return null;
  }

  // Fetch the private salt through the canonical calibration accessor (PIVOT 008)
  const salt = getKOSCalibration('IDENTITY_KEY_SALT');
  if (!salt || salt === 'YOUR_PRIVATE_STRING_HERE' || salt.length < 8) {
    ui.alert('⚠ Salt Not Set',
      'IDENTITY_KEY_SALT has not been configured or is still the placeholder.\n\n' +
      'Run setupCalibration() with your private string first.\n' +
      'The system will remain COLD.',
      ui.ButtonSet.OK);
    return null;
  }

  // Derive Identity Key: SHA-256 of thesis + salt
  const combined   = coreThesisText + '::KOS::' + salt;
  const hashBytes  = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined);
  const identityKey = hashBytes
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
    .join('');

  // Store the full hash and a display prefix (first 16 chars for human verification)
  props.setProperty('RTP_IDENTITY_HASH', identityKey);
  props.setProperty('RTP_IDENTITY_PREFIX', identityKey.substring(0, 16));

  const prefix = identityKey.substring(0, 16);
  ui.alert('✅ Identity Key Generated',
    `Engine ARMED with unique deployment fingerprint.\n\n` +
    `Identity Key Prefix: ${prefix}...\n` +
    `(Full hash stored in PropertiesService as RTP_IDENTITY_HASH)\n\n` +
    'This key is unique to your CORE_THESIS and private salt.\n' +
    'If you update your Core Thesis, re-run this function to refresh the key.',
    ui.ButtonSet.OK);

  console.log(`[IDENTITY_KEY] Generated. Prefix: ${prefix}`);
  return identityKey;
}

/**
 * Verifies the stored Identity Key is valid against current CORE_THESIS.
 * Called at processIntakePayload() gateway and on-demand from menu.
 *
 * Returns: { valid: bool, status: 'ARMED'|'COLD'|'THESIS_CHANGED'|'NOT_SET', prefix: string }
 * Never throws — soft warning only.
 */
function verifyIdentityKey() {
  const props = PropertiesService.getScriptProperties();
  const stored = props.getProperty('RTP_IDENTITY_HASH');

  if (!stored) {
    return { valid: false, status: 'NOT_SET', prefix: null };
  }

  const coreThesisId = props.getProperty('ID_CORE_THESIS');
  if (!coreThesisId) {
    return { valid: false, status: 'COLD', prefix: null };
  }

  try {
    const text  = DocumentApp.openById(coreThesisId).getBody().getText().trim();
    // Route salt access through canonical accessor — not direct props read (PIVOT 008)
    const salt  = getKOSCalibration('IDENTITY_KEY_SALT');
    if (!salt) return { valid: false, status: 'COLD', prefix: null };

    const combined  = text + '::KOS::' + salt;
    const hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined);
    const current   = hashBytes
      .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
      .join('');

    if (current === stored) {
      return { valid: true, status: 'ARMED', prefix: stored.substring(0, 16) };
    } else {
      // CORE_THESIS has been edited since last key generation
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
    NOT_SET       : `⚠ Engine COLD — Identity Key Not Generated\n\nRun:\n1. Write your CORE_THESIS\n2. setupCalibration() → set IDENTITY_KEY_SALT\n3. 🧠 Council → Generate Identity Key`,
    COLD          : `⚠ Engine COLD — Pointers Missing\n\nRun deployFullSystem() first, then generateIdentityKey().`,
    THESIS_CHANGED: `⚠ CORE_THESIS Has Changed\n\nIdentity Key Prefix: ${result.prefix}...\n\nYour Core Thesis has been modified since the key was generated.\nRun 🧠 Council → Generate Identity Key to refresh the fingerprint.`,
  };

  ui.alert('Identity Key Status', messages[result.status] || 'Unknown status.', ui.ButtonSet.OK);
}


// ============================================================================
// LAYER 3: FIDELITY CLAUSE VERIFICATION
// Verifies that ALIGNMENT and HITL structural requirements are present.
// Runs at intake gateway. Soft warning — does not hard block processing.
// ============================================================================

/**
 * Verifies the three Fidelity Clause requirements are structurally intact:
 *   1. ALIGNMENT persona document exists and is non-empty
 *   2. HITL flag is active in PropertiesService (HITL_ACTIVE = 'true')
 *   3. CORE_THESIS is not the deploy placeholder
 *
 * Returns: { compliant: bool, violations: string[] }
 * Never throws. Violations are logged as warnings, not hard blocks.
 */
function verifyFidelityClause() {
  const props      = PropertiesService.getScriptProperties();
  const violations = [];

  // Check 1: ALIGNMENT persona document exists and is populated
  // Uses partial name search — file may be versioned (e.g. PERSONA_ALIGNMENT V5)
  try {
    const alignmentFolderId = props.getProperty('ID_02_COUNCIL_ALIGNMENTS');
    if (alignmentFolderId) {
      const folder = DriveApp.getFolderById(alignmentFolderId);

      // Partial match: find any file whose name starts with 'PERSONA_ALIGNMENT'
      const allFiles = folder.getFiles();
      let alignmentFile = null;
      while (allFiles.hasNext()) {
        const f = allFiles.next();
        if (f.getName().startsWith('PERSONA_ALIGNMENT')) { alignmentFile = f; break; }
      }

      if (!alignmentFile) {
        violations.push('ALIGNMENT persona document not found in 02_Council_Alignments. ' +
          'Expected a file starting with "PERSONA_ALIGNMENT".');
      } else {
        const doc  = DocumentApp.openById(alignmentFile.getId());
        const text = doc.getBody().getText().trim();
        if (text.length < 100 || text.includes('[Paste full alignment constraints here')) {
          violations.push(
            `ALIGNMENT persona (${alignmentFile.getName()}) contains only placeholder text — not yet configured.`
          );
        }
      }
    } else {
      violations.push('ID_02_COUNCIL_ALIGNMENTS pointer missing — cannot verify ALIGNMENT cog.');
    }
  } catch (e) {
    violations.push('ALIGNMENT verification error: ' + e.message);
  }

  // Check 2: HITL flag is set
  const hitlActive = props.getProperty('HITL_ACTIVE');
  if (hitlActive !== 'true') {
    violations.push(
      'HITL_ACTIVE flag not set. Run activateHITLFirewall() to confirm Human-In-The-Loop compliance.'
    );
  }

  // Check 3: CORE_THESIS is not a placeholder
  try {
    const coreThesisId = props.getProperty('ID_CORE_THESIS');
    if (coreThesisId) {
      const text = DocumentApp.openById(coreThesisId).getBody().getText().trim();
      if (text.length < 50 ||
          text.includes('[Awaiting Genesis Protocol') ||
          text.includes('Define what this Brain Trust system is')) {
        violations.push(
          'CORE_THESIS contains placeholder text — Cold Engine Protocol active. ' +
          'Write your thesis before processing intake payloads.'
        );
      }
    } else {
      violations.push('ID_CORE_THESIS pointer missing — cannot verify Blank Slate Protocol.');
    }
  } catch (e) {
    violations.push('CORE_THESIS verification error: ' + e.message);
  }

  return { compliant: violations.length === 0, violations };
}

/**
 * Sets the HITL_ACTIVE flag in PropertiesService.
 * Human operator must explicitly call this to confirm HITL compliance.
 * This is the operator's declaration that they understand and accept
 * the Human-In-The-Loop Firewall as a binding constraint.
 */
function activateHITLFirewall() {
  const ui = DocumentApp.getUi();
  const confirm = ui.alert(
    '🛡 Activate HITL Firewall',
    'By activating the Human-In-The-Loop Firewall, you confirm:\n\n' +
    '• No autonomous writes to canonical documents will occur without your explicit verification\n' +
    '• No external communications will be sent without your approval\n' +
    '• All document mutations require your checkbox approval in the Blackboard\n' +
    '• The AI operates in READ / Audit mode only — DICTATE / WRITE / Verify is your role\n\n' +
    'Activate the HITL Firewall?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) return;

  PropertiesService.getScriptProperties().setProperty('HITL_ACTIVE', 'true');
  ui.alert('✅ HITL Firewall Active',
    'Human-In-The-Loop compliance confirmed.\n\n' +
    'The system will enforce verification gates at all write operations.\n' +
    'This flag is stored in PropertiesService and persists across sessions.',
    ui.ButtonSet.OK);
  console.log('[HITL_FIREWALL] Activated by operator.');
}

/**
 * Combined engine status report — Identity Key + Fidelity Clause + Calibration Wall.
 * The full picture of whether the system is armed, cold, or partially compliant.
 */
function auditEngineStatus() {
  const ui       = DocumentApp.getUi();
  const identity = verifyIdentityKey();
  const fidelity = verifyFidelityClause();
  const cal      = _getCalibrationStatus();
  const props    = PropertiesService.getScriptProperties();
  const hitl     = props.getProperty('HITL_ACTIVE') === 'true';

  const lines = [];

  // Identity Key
  const idIcon = identity.valid ? '✅' : '⚠';
  lines.push(`${idIcon} IDENTITY KEY: ${identity.status}${identity.prefix ? ' (' + identity.prefix + '...)' : ''}`);

  // Calibration Wall
  lines.push(cal.armed
    ? `✅ CALIBRATION WALL: ARMED (${cal.count} key(s))`
    : `⚠ CALIBRATION WALL: COLD — run setupCalibration()`);

  // HITL Firewall
  lines.push(hitl
    ? '✅ HITL FIREWALL: ACTIVE'
    : '⚠ HITL FIREWALL: NOT CONFIRMED — run activateHITLFirewall()');

  // Fidelity Clause
  if (fidelity.compliant) {
    lines.push('✅ FIDELITY CLAUSE: COMPLIANT');
  } else {
    lines.push('⚠ FIDELITY CLAUSE: VIOLATIONS DETECTED');
    fidelity.violations.forEach(v => lines.push('   • ' + v));
  }

  // Overall status
  const fullyArmed = identity.valid && cal.armed && hitl && fidelity.compliant;
  const header     = fullyArmed
    ? '✅ ENGINE FULLY ARMED'
    : '⚠ ENGINE COLD — Review violations below';

  ui.alert(header, lines.join('\n'), ui.ButtonSet.OK);
}


// ============================================================================
// LICENSE SCAFFOLDING — DRIVE AND CODEBASE
// Creates LICENSE and KOS_WHITE_PAPER documents during deployment.
// Called from deployFullSystem() in Part A.
// ============================================================================

/**
 * Creates the LICENSE document in the 01_Canonical_Foundation folder.
 * Idempotent — skips if already exists with content.
 *
 * @param {Folder} f01 - The 01_Canonical_Foundation folder object.
 */
function _createLicenseDoc(f01) {
  const name = 'LICENSE — Polyform Noncommercial 1.0.0';
  if (f01.getFilesByName(name).hasNext()) return;

  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();

  body.appendParagraph('KNOWLEDGE OPERATING SYSTEM (KOS)')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Copyright (c) 2026 Adam Berneche / RTP Council');
  body.appendParagraph('Licensed under the Polyform Noncommercial License 1.0.0');
  body.appendParagraph('https://polyformproject.org/licenses/noncommercial/1.0.0');
  body.appendHorizontalRule();

  body.appendParagraph('PERMITTED USE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'This software is free for any noncommercial purpose, including personal use, ' +
    'research, education, charitable organizations, public institutions, and government entities. ' +
    'Full license text: https://polyformproject.org/licenses/noncommercial/1.0.0'
  );

  body.appendParagraph('FIDELITY CLAUSE (Commercial Licensing Requirement)')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'Any commercial deployment must preserve three architectural elements:'
  );
  [
    '1. THE ALIGNMENT COG — Must remain active, unmodified, and with authority to pause any session when human relational bandwidth is threatened. Cannot be suppressed or removed.',
    '2. THE HITL FIREWALL — No autonomous writes to canonical documents, no external communications, no mutations to persistent state without explicit human verification.',
    '3. THE COLD ENGINE PROTOCOL — The system must remain inert until the user defines their own CORE_THESIS. Pre-loading a vendor-defined thesis violates this clause.'
  ].forEach(item => body.appendListItem(item));

  body.appendParagraph('THE BLANK SLATE PROTOCOL').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'The KOS does not impose a philosophy. It provides the architecture for a human to build their own. ' +
    'Every deployment begins cold. The operator\'s sovereignty over their own cognitive architecture is the point.'
  );

  body.appendParagraph('COMMERCIAL LICENSING CONTACT').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('[Add your contact information here for commercial licensing inquiries]');

  body.appendHorizontalRule();
  body.appendParagraph('We automate the machine so we can be free to be human.').setItalic(true);

  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
  console.log('[LICENSE] LICENSE document created in 01_Canonical_Foundation.');
}

/**
 * Creates the KOS White Paper document in the 01_Canonical_Foundation folder.
 * Idempotent — skips if already exists with content.
 *
 * @param {Folder} f01 - The 01_Canonical_Foundation folder object.
 */
function _createWhitePaperDoc(f01) {
  const name = 'KOS White Paper v2.0 — The Sovereign Human Edition';
  if (f01.getFilesByName(name).hasNext()) return;

  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();

  body.appendParagraph('KOS WHITE PAPER v2.0')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('The Sovereign Human Edition')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'A Framework for Human Agency in the Age of Commodity Intelligence\n' +
    'Version: 5.4 (Open-Source Deployment)\n' +
    'Author: RTP Council\n' +
    'License: Polyform Noncommercial 1.0.0'
  );
  body.appendHorizontalRule();

  const sections = [
    {
      title: '1. Executive Summary',
      text:
        'The Knowledge Operating System (KOS) is not a productivity tool; it is a cognitive harness ' +
        'designed to protect the human from the machine. In an era where generative AI has commoditized ' +
        'competence and accuracy, the KOS shifts the focus from Efficiency of Output to Density of Presence. ' +
        'By automating "Junk Friction" (administration, formatting, routing) and preserving "Generative ' +
        'Friction" (critical thinking, relational depth), the KOS enables a 500% increase in human value ' +
        'creation without sacrificing human presence.'
    },
    {
      title: '2. The Core Problem: The Extraction Trap',
      text:
        'Modern AI tools are built on an extractive model. They optimize for the "Sycophancy Loop" — ' +
        'telling the user what they want to hear as quickly as possible to maximize engagement. This ' +
        'destroys the Necessary Struggle required for learning and growth.\n\n' +
        'The Error: Using AI to replace human effort.\n' +
        'The Result: Skill atrophy, "Ghost Data" (unverified AI hallucinations), and a loss of relational bandwidth.'
    },
    {
      title: '3. The KOS Thesis: The Cognitive Fulcrum',
      text:
        'The KOS operates on the principle of the Vacuum of Admin. By using a sophisticated layer of ' +
        'specialized personas (The Council), the system clears the soil of administrative drag.\n\n' +
        '1. Remove Administrative Friction: The system handles file routing, log distillation, and state management.\n' +
        '2. Preserve Cognitive Friction: The Auditor explicitly challenges the user\'s assumptions.\n' +
        '3. The Result: A 5x capacity multiplier (500% yield) reinvested into Carbon-to-Carbon relationships.'
    },
    {
      title: '4. The ROI Map: Three Horizons',
      text:
        '90-Second Hook — Automated Drive Infrastructure Deployment\n' +
        'Immediate administrative structure and visual command center.\n\n' +
        '10-Minute Vent — Initial Session Ingestion and Distillation\n' +
        'First lossless record and "Admin Ghost" offloading.\n\n' +
        '21-Day Moat — Socratic Onboarding Path\n' +
        'Full cognitive prosthetic alignment and high switching costs.'
    },
    {
      title: '5. The Relational Moat: A New Market Strategy',
      text:
        'For small businesses and educators, the KOS offers a "Boutique Advantage." While large firms ' +
        'use AI to scale Efficiency (volume), KOS users use AI to scale Intimacy (depth).\n\n' +
        'The Moat: A relationship so highly attuned and human-centric that it cannot be replaced by ' +
        'a sterile, automated competitor.\n\n' +
        'Anticipatory Empathy: Using system memory to trigger analog, human gestures — the lunch, the call, ' +
        'the face-to-face intervention.'
    },
    {
      title: '6. Technical Shielding: The Identity Key',
      text:
        'The system is released as a "Cold Engine." Full activation requires generation of a unique ' +
        'Identity Key derived from the user\'s specific CORE_THESIS combined with their private ' +
        'IDENTITY_KEY_SALT. This technical barrier prevents one-click automated wrappers from mass-deploying ' +
        'the technology in an extractive, non-aligned fashion.\n\n' +
        'Each deployment produces a unique SHA-256 fingerprint. Identical source code produces a ' +
        'different activated system for each operator. The key is the user\'s values, encoded.'
    },
    {
      title: '7. The Open-Source Mandate: Freedom to be Human',
      text:
        'To preempt market extraction, the KOS core is released at a price of $0.\n\n' +
        'Preempting the Market: By commoditizing the highest-leverage harness, we prevent corporations ' +
        'from gatekeeping human agency.\n\n' +
        'The Blank Slate Protocol: The KOS does not impose a philosophy; it requires the user to build ' +
        'their own. The system remains cold until the user defines their own Core Thesis and Relational ' +
        'Targets. It is a mirror of the user\'s soul, not an echo of the creator\'s.'
    },
    {
      title: '8. Conclusion',
      text:
        'The Knowledge Operating System is a declaration of independence from the "Admin Ghost." ' +
        'It assumes that the struggle to think, to build, and to connect is the only work worth doing. ' +
        'We automate the machine so we can be free to be human.'
    }
  ];

  sections.forEach(s => {
    body.appendParagraph(s.title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(s.text);
  });

  body.appendHorizontalRule();
  body.appendParagraph(
    `Document generated by deployFullSystem() — ${new Date().toLocaleString()}`
  ).setItalic(true);

  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
  console.log('[WHITE_PAPER] KOS White Paper created in 01_Canonical_Foundation.');
}


// ============================================================================
// ENGINE STATUS INJECTION INTO INTAKE PIPELINE
// Add this call to processIntakePayload() immediately after JSON validation.
// It runs a soft check and prepends a COLD ENGINE warning to the session log
// without blocking processing.
// ============================================================================

/**
 * Runs all three IP protection checks and returns a combined engine status.
 * Called at the processIntakePayload() gateway.
 * Soft warning — never throws, never blocks.
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

  if (!identity.valid) {
    warnings.push(`[COLD ENGINE] Identity Key: ${identity.status}. Run generateIdentityKey().`);
  }
  if (!cal.armed) {
    warnings.push('[COLD ENGINE] Calibration Wall not armed. Run setupCalibration().');
  }
  if (!hitl) {
    warnings.push('[COLD ENGINE] HITL Firewall not confirmed. Run activateHITLFirewall().');
  }
  if (!fidelity.compliant) {
    fidelity.violations.forEach(v => warnings.push('[FIDELITY VIOLATION] ' + v));
  }

  warnings.forEach(w => console.warn(w));

  return {
    armed    : identity.valid && cal.armed && hitl && fidelity.compliant,
    warnings
  };
}


// ============================================================================
// MENU ADDITIONS
// Add these items to the onOpen() menu in Part A under a new 'Sovereignty' group.
//
// In Part A, add to the 🧠 Council menu before the final .addToUi():
//   .addSeparator()
//   .addItem('Generate Identity Key',      'generateIdentityKey')
//   .addItem('Audit Identity Key',         'auditIdentityKey')
//   .addItem('Activate HITL Firewall',     'activateHITLFirewall')
//   .addItem('Full Engine Status Audit',   'auditEngineStatus')
// ============================================================================


// ============================================================================
// DEPLOY INTEGRATION
// Add these two calls to deployFullSystem() in Part A, after _createGemSetupDoc():
//
//   log.push('▸ Creating LICENSE document...');
//   _createLicenseDoc(folders.f01);
//   log.push('  ✔ LICENSE — Polyform Noncommercial 1.0.0');
//
//   log.push('▸ Creating KOS White Paper...');
//   _createWhitePaperDoc(folders.f01);
//   log.push('  ✔ KOS White Paper v2.0 scaffolded');
//
// And add this call to processIntakePayload() immediately after JSON.parse():
//   const engineStatus = _checkEngineStatus();
//   if (engineStatus.warnings.length > 0) {
//     console.warn('[ENGINE_STATUS] ' + engineStatus.warnings.join(' | '));
//   }
// ============================================================================

// ============================================================================
// END OF KOS IP PROTECTION LAYER v1.0
// ============================================================================
