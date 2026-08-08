/**
 * ============================================================
 * KOS_LICENSE.GS
 * CI: 1.0 | Companion to RTP_REFINERY_DEPLOYER.gs
 * ============================================================
 *
 * LICENSE: Polyform Noncommercial 1.0.0
 *
 * This software may be used, copied, and modified for any
 * noncommercial purpose. Noncommercial means not primarily
 * intended for or directed toward commercial advantage or
 * monetary compensation.
 *
 * Commercial use — including deployment in a business context,
 * resale, or packaging this system into a commercial product —
 * requires a separate written agreement with the author.
 *
 * Author: Adam Berneche (via the RTP Council)
 * Full license: https://polyformproject.org/licenses/noncommercial/1.0.0/
 *
 * THE FIDELITY CLAUSE (mandatory for ALL commercial adaptations):
 *   1. The Alignment Cog (PERSONA_ALIGNMENT) must be preserved intact
 *   2. The HITL Firewall (human checkbox gate on all mutations) must remain
 *   3. Attribution to the original author must be maintained in the UI
 *
 * THE BLANK SLATE PROTOCOL:
 *   The engine ships with no philosophy pre-installed. It will not run at
 *   full capacity until the operator defines their own CORE_THESIS and
 *   Relational Targets through the Socratic Onboarding path. This is
 *   intentional — the system is a mirror of your values, not ours.
 *
 * THE COLD ENGINE DESIGN:
 *   Tiered access enforced by _coldEngineGate():
 *     TIER_1 (Phase 1, Phase 2): WARN — proceeds with user confirmation
 *     TIER_2 (Phase 4, mutations, council): BLOCK — hard stop until armed
 * ============================================================
 */


// ── LICENSE CONFIGURATION ─────────────────────────────────────
const LIC = {
  LICENSE_TYPE:   'Polyform Noncommercial 1.0.0',
  AUTHOR:         'Adam Berneche (RTP Council)',
  SYSTEM_VERSION: '5.4',
  ONBOARDING_DAYS: 21,
  ONBOARDING_SHEET: 'ONBOARDING_TRACKER',
  FIDELITY_REQUIRED_PERSONA: 'PERSONA_ALIGNMENT',
  FIDELITY_REQUIRED_SHEET:   'Blackboard',

  // Onboarding step count
  TOTAL_STEPS: 8,

  // PropertiesService keys owned by this file
  PROP_KEYS: {
    OPERATOR_ROLE:       'KOS_OPERATOR_ROLE',
    OPERATOR_AUDIENCE:   'KOS_OPERATOR_AUDIENCE',
    ADMIN_GHOST:         'KOS_ADMIN_GHOST',
    NECESSARY_STRUGGLE:  'KOS_NECESSARY_STRUGGLE',
    RELATIONAL_TARGETS:  'KOS_RELATIONAL_TARGETS',
    VISION_90_DAY:       'KOS_VISION_90_DAY',
    DEPLOYMENT_TYPE:     'KOS_DEPLOYMENT_TYPE',
    THESIS_VERIFIED:     'CORE_THESIS_VERIFIED',
    ONBOARDING_DAY:      'KOS_ONBOARDING_DAY',
    ONBOARDING_START:    'KOS_ONBOARDING_START',
  },
};


// ══════════════════════════════════════════════════════════════
// COLD ENGINE GATE — TIERED ACCESS CONTROL
// ══════════════════════════════════════════════════════════════

/**
 * Enforces the Cold Engine design.
 * TIER_1 (Phase 1, 2): Warns and lets the user decide.
 * TIER_2 (Phase 4, mutations, council): Hard block — throws and stops execution.
 *
 * Call at the top of any function that requires an armed engine.
 *
 * @param {string} callerFunction - Name of the calling function (for error messaging)
 * @param {string} tier          - 'TIER_1' (warn) or 'TIER_2' (block)
 * @throws {Error} If TIER_2 and engine is cold
 */
function _coldEngineGate(callerFunction, tier) {
  const props    = PropertiesService.getScriptProperties();
  const idKey    = props.getProperty('IDENTITY_KEY');
  const verified = props.getProperty(LIC.PROP_KEYS.THESIS_VERIFIED);
  const isCold   = !idKey || !verified;

  if (!isCold) return; // Engine is armed — proceed

  if (tier === 'TIER_2') {
    // Hard block — no exceptions
    let ui;
    try { ui = DocumentApp.getUi(); } catch (_) {}
    const msg =
      `[COLD ENGINE — ${callerFunction}]\n\n` +
      `This function requires an armed Identity Key.\n` +
      `Your Core Thesis has not been verified and the engine is COLD.\n\n` +
      `Run:\n  🧠 Council → Begin Socratic Onboarding\n\n` +
      `Once onboarding is complete, ${callerFunction} will be available.`;
    if (ui) ui.alert('🔒 Engine COLD — Access Blocked', msg, ui.ButtonSet.OK);
    throw new Error(`[COLD_ENGINE_GATE_TIER_2] ${callerFunction} blocked. Run Socratic Onboarding to arm.`);
  }

  if (tier === 'TIER_1') {
    // Soft warn — user decides
    let ui;
    try { ui = DocumentApp.getUi(); } catch (_) { return; } // No UI = silent pass
    const proceed = ui.alert(
      '⚠ Engine COLD',
      `The engine is not yet armed — no Identity Key is set.\n\n` +
      `${callerFunction} will run but vector scoring and behavioral calibration\n` +
      `will be inactive. Output will be unanchored to your Core Thesis.\n\n` +
      `Run 🧠 Council → Begin Socratic Onboarding to arm the engine.\n\n` +
      `Continue anyway?`,
      ui.ButtonSet.YES_NO
    );
    if (proceed !== ui.Button.YES) {
      throw new Error(`[COLD_ENGINE_GATE_TIER_1] ${callerFunction} cancelled by user.`);
    }
  }
}


// ══════════════════════════════════════════════════════════════
// SOCRATIC ONBOARDING — 21-DAY ACTIVATION PATH
// ══════════════════════════════════════════════════════════════

/**
 * Guided 8-step interactive onboarding.
 * Walks the operator through defining their CORE_THESIS, Relational Targets,
 * Identity Key Salt, and deployment type. Infers initial calibration weights
 * from their declared role. Seals the thesis and arms the engine on completion.
 *
 * Run from: 🧠 Council → Begin Socratic Onboarding
 */
function runSocraticOnboarding() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // Check if already complete
  if (props.getProperty(LIC.PROP_KEYS.THESIS_VERIFIED) === 'true') {
    const restart = ui.alert(
      'Onboarding Already Complete',
      `Your engine is armed and Core Thesis is verified.\n\n` +
      `Day ${props.getProperty(LIC.PROP_KEYS.ONBOARDING_DAY) || 1} of ${LIC.ONBOARDING_DAYS}.\n\n` +
      `Do you want to restart onboarding? This will reset your thesis and unseal the engine.`,
      ui.ButtonSet.YES_NO
    );
    if (restart !== ui.Button.YES) return;
    _unsealEngine(props);
  }

  ui.alert(
    '🧠 Welcome to the KOS Socratic Onboarding',
    `You are about to define your Core Thesis — the philosophical foundation that\n` +
    `every persona in this system will serve.\n\n` +
    `This is not a form. It is a conversation.\n\n` +
    `The system ships with no philosophy pre-installed. What you build here\n` +
    `is yours alone — it cannot be replicated without your answers and your\n` +
    `private passphrase.\n\n` +
    `8 questions. You can cancel at any time and resume later.\n\n` +
    `Take your time. This is the most important step.`,
    ui.ButtonSet.OK
  );

  const answers = {};

  // ── STEP 1: Primary Role ──────────────────────────────────
  const step1 = _socraticPrompt(ui, 1,
    'WHAT IS YOUR ROLE?',
    'What is your primary role or domain?\n\n' +
    'Examples: Marketing Teacher, Business Coach, Curriculum Designer,\n' +
    'Software Developer, Non-Profit Director, Sales Manager'
  );
  if (!step1) return _onboardingCancelled(ui);
  answers.role = step1;
  props.setProperty(LIC.PROP_KEYS.OPERATOR_ROLE, step1);

  // ── STEP 2: Who You Serve ─────────────────────────────────
  const step2 = _socraticPrompt(ui, 2,
    'WHO DO YOU SERVE?',
    'Who are the people whose growth and success your work directly affects?\n\n' +
    'Examples: High school students aged 15-18, Small business owners in retail,\n' +
    'First-generation college students, Mid-market sales teams'
  );
  if (!step2) return _onboardingCancelled(ui);
  answers.audience = step2;
  props.setProperty(LIC.PROP_KEYS.OPERATOR_AUDIENCE, step2);

  // ── STEP 3: The Admin Ghost ───────────────────────────────
  const step3 = _socraticPrompt(ui, 3,
    'NAME YOUR ADMIN GHOST',
    'The Admin Ghost is the administrative friction that steals time from\n' +
    'the work that actually matters.\n\n' +
    'What does it steal from you specifically, and how many hours per week?\n\n' +
    'Examples: Grading formatting takes 4 hours/week. Parent email management\n' +
    'takes 3 hours. Lesson plan documentation takes 2 hours.'
  );
  if (!step3) return _onboardingCancelled(ui);
  answers.adminGhost = step3;
  props.setProperty(LIC.PROP_KEYS.ADMIN_GHOST, step3);

  // ── STEP 4: The Necessary Struggle ───────────────────────
  const step4 = _socraticPrompt(ui, 4,
    'DEFINE YOUR NECESSARY STRUGGLE',
    'The Necessary Struggle is the cognitive friction you REFUSE to automate —\n' +
    'the difficulty that produces real growth in the people you serve.\n\n' +
    'If you automate this, the system fails. What is it?\n\n' +
    'Examples: Students must wrestle with their own business plan — I will\n' +
    'never write it for them. Clients must make their own pricing decisions\n' +
    'even when I could make them faster.'
  );
  if (!step4) return _onboardingCancelled(ui);
  answers.necessaryStruggle = step4;
  props.setProperty(LIC.PROP_KEYS.NECESSARY_STRUGGLE, step4);

  // ── STEP 5: Relational Targets ────────────────────────────
  const step5 = _socraticPrompt(ui, 5,
    'WHO ARE YOUR RELATIONAL TARGETS?',
    'Carbon-to-Carbon relationships are the human connections this system\n' +
    'exists to protect and deepen — not replace.\n\n' +
    'List your top 3-5 relationships by name or role (comma separated).\n' +
    'These will be monitored by the Alignment Cog for cognitive load risk.\n\n' +
    'Examples: My students (as a group), My department head Sarah,\n' +
    'My family, My 3 key clients'
  );
  if (!step5) return _onboardingCancelled(ui);
  answers.relationalTargets = step5;
  props.setProperty(LIC.PROP_KEYS.RELATIONAL_TARGETS, step5);

  // ── STEP 6: 90-Day Vision ─────────────────────────────────
  const step6 = _socraticPrompt(ui, 6,
    'YOUR 90-DAY VISION',
    'In one sentence: what does success look like in 90 days if the KOS\n' +
    'is working exactly as intended?\n\n' +
    'Be specific. Vague visions produce vague results.\n\n' +
    'Examples: My students submit higher-quality business plans because I\n' +
    'spent 5 more hours per week with them instead of on paperwork.'
  );
  if (!step6) return _onboardingCancelled(ui);
  answers.vision90Day = step6;
  props.setProperty(LIC.PROP_KEYS.VISION_90_DAY, step6);

  // ── STEP 7: Identity Key Salt ─────────────────────────────
  const step7 = _socraticPrompt(ui, 7,
    'CREATE YOUR IDENTITY KEY PASSPHRASE',
    '⚠ CRITICAL STEP — READ CAREFULLY\n\n' +
    'Create a private passphrase of your choosing. It can be anything:\n' +
    'a phrase, a date, a memory — something only you know.\n\n' +
    'This will be combined with your thesis to generate a unique Identity Key\n' +
    'that is your IP anchor. It cannot be recovered if lost.\n\n' +
    'YOU WILL NOT BE ASKED TO ENTER THIS AGAIN.\n' +
    'Write it down in a secure location before proceeding.'
  );
  if (!step7) return _onboardingCancelled(ui);
  props.setProperty('IDENTITY_KEY_SALT', step7); // Sequestered immediately

  // ── STEP 8: Deployment Type & License Acknowledgement ─────
  const deployTypes = ['INDIVIDUAL', 'EDUCATOR', 'COMMERCIAL'];
  const step8 = _socraticPrompt(ui, 8,
    'DEPLOYMENT TYPE — LICENSE ACKNOWLEDGEMENT',
    'This software is free under the Polyform Noncommercial 1.0.0 license.\n\n' +
    'How will you use this system?\n' +
    '  INDIVIDUAL  — Personal use, research, learning\n' +
    '  EDUCATOR    — Teaching, academic, nonprofit\n' +
    '  COMMERCIAL  — Business, revenue-generating, enterprise\n\n' +
    'Commercial use is permitted on an honor system with attribution.\n' +
    'The Fidelity Clause requires preserving the Alignment Cog and HITL Firewall.\n\n' +
    'Type one of: INDIVIDUAL, EDUCATOR, or COMMERCIAL'
  );
  if (!step8) return _onboardingCancelled(ui);
  const deployType = deployTypes.includes(step8.toUpperCase().trim())
    ? step8.toUpperCase().trim() : 'INDIVIDUAL';
  props.setProperty(LIC.PROP_KEYS.DEPLOYMENT_TYPE, deployType);

  // ── SEAL THE THESIS ───────────────────────────────────────
  _sealThesis(props, answers, deployType);

  ui.alert(
    '✅ Onboarding Complete — Engine Armed',
    `Your Core Thesis has been sealed and your Identity Key has been generated.\n\n` +
    `Deployment Type: ${deployType}\n` +
    `Relational Targets: ${answers.relationalTargets}\n\n` +
    `Your 90-Day Vision:\n"${answers.vision90Day}"\n\n` +
    `NEXT STEPS:\n` +
    `1. Run 🧠 Council → Build Session Context to assemble your first Gem session\n` +
    `2. Paste the context block at the top of a new Gem session\n` +
    `3. Run your first session → drop the log → Phase 1 → 2 → 4 → 3\n\n` +
    `Day 1 of ${LIC.ONBOARDING_DAYS}. The system is live.`,
    ui.ButtonSet.OK
  );
}

/**
 * Helper: displays a numbered step prompt and returns the text response.
 * Returns null if user cancels.
 */
function _socraticPrompt(ui, stepNum, title, body) {
  const result = ui.prompt(
    `Step ${stepNum} of ${LIC.TOTAL_STEPS} — ${title}`,
    body,
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return null;
  const text = result.getResponseText().trim();
  return text.length > 0 ? text : null;
}

function _onboardingCancelled(ui) {
  ui.alert(
    'Onboarding Paused',
    'Your progress has been saved up to the last completed step.\n\n' +
    'Run 🧠 Council → Begin Socratic Onboarding to resume.',
    ui.ButtonSet.OK
  );
}

/**
 * Seals the thesis: verifies the identity key, infers calibration weights
 * from the operator's role, seeds the CORE_THESIS doc, and marks the engine ARMED.
 */
function _sealThesis(props, answers, deployType) {
  // Generate Identity Key from thesis content + salt (calls main script function)
  try { generateIdentityKey(); } catch (e) {
    console.warn('[Onboarding] generateIdentityKey() failed: ' + e.message);
  }

  // Infer initial calibration weights from declared role
  const inferredWeights = _inferCalibrationWeights(answers.role || '');
  Object.entries(inferredWeights).forEach(([key, val]) => {
    // Only set if not already manually calibrated
    if (!props.getProperty(key)) props.setProperty(key, String(val));
  });

  // Seed CORE_THESIS document with onboarding answers
  _seedCoreThesis(answers, deployType);

  // Mark engine as armed
  props.setProperty(LIC.PROP_KEYS.THESIS_VERIFIED, 'true');
  props.setProperty(LIC.PROP_KEYS.ONBOARDING_DAY, '1');
  props.setProperty(LIC.PROP_KEYS.ONBOARDING_START, new Date().toISOString());

  // Log to ONBOARDING_TRACKER
  _logOnboardingDay(1, 'SEALED', answers.vision90Day);

  console.log('[KOS_LICENSE] Engine armed. Deployment: ' + deployType);
}

/**
 * Resets all onboarding properties so the operator can restart.
 */
function _unsealEngine(props) {
  [
    LIC.PROP_KEYS.THESIS_VERIFIED,
    LIC.PROP_KEYS.ONBOARDING_DAY,
    LIC.PROP_KEYS.ONBOARDING_START,
    'IDENTITY_KEY',
  ].forEach(k => props.deleteProperty(k));
  console.log('[KOS_LICENSE] Engine unsealed for onboarding restart.');
}

/**
 * Infers initial thematic calibration weights from the operator's declared role.
 * These seed PropertiesService as starting values; setupCalibration() or
 * subsequent sessions will refine them via the Vector_Router.
 *
 * @param {string} role - The operator's declared role string
 * @returns {Object} { THEME_*: value } map for PropertiesService
 */
function _inferCalibrationWeights(role) {
  const r = role.toLowerCase();
  const weights = {
    THEME_ARCHITECTURE:    0.75,
    THEME_PEDAGOGY:        0.75,
    THEME_FAMILY_ALIGNMENT:0.75,
    SOCRATIC_THRESHOLD:    0.75,
  };

  if (/teach|educat|curriculum|instruc|tutor|profess/.test(r)) {
    weights.THEME_PEDAGOGY         = 0.92;
    weights.THEME_FAMILY_ALIGNMENT = 0.88;
    weights.THEME_ARCHITECTURE     = 0.72;
    weights.SOCRATIC_THRESHOLD     = 0.80;
  } else if (/coach|business|sales|market|consult|entrepreneur/.test(r)) {
    weights.THEME_FAMILY_ALIGNMENT = 0.92;
    weights.THEME_PEDAGOGY         = 0.68;
    weights.THEME_ARCHITECTURE     = 0.78;
    weights.SOCRATIC_THRESHOLD     = 0.72;
  } else if (/develop|engineer|code|software|technical|architect/.test(r)) {
    weights.THEME_ARCHITECTURE     = 0.90;
    weights.THEME_PEDAGOGY         = 0.55;
    weights.THEME_FAMILY_ALIGNMENT = 0.70;
    weights.SOCRATIC_THRESHOLD     = 0.70;
  } else if (/nonprofit|community|social|advocate|director/.test(r)) {
    weights.THEME_FAMILY_ALIGNMENT = 0.95;
    weights.THEME_PEDAGOGY         = 0.80;
    weights.THEME_ARCHITECTURE     = 0.65;
    weights.SOCRATIC_THRESHOLD     = 0.78;
  }

  return weights;
}

/**
 * Writes onboarding answers into the CORE_THESIS document.
 * Finds the doc via PropertiesService pointer or Drive search.
 */
function _seedCoreThesis(answers, deployType) {
  try {
    const props = PropertiesService.getScriptProperties();
    let thesisId = props.getProperty('ID_CORE_THESIS');
    if (!thesisId) {
      const files = DriveApp.getFilesByName('CORE_THESIS');
      if (!files.hasNext()) { console.warn('[Onboarding] CORE_THESIS doc not found.'); return; }
      thesisId = files.next().getId();
      props.setProperty('ID_CORE_THESIS', thesisId);
    }

    const doc  = DocumentApp.openById(thesisId);
    const body = doc.getBody();
    body.clear();

    body.appendParagraph('CORE THESIS').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Sealed: ${new Date().toLocaleDateString()}  |  Deployment: ${deployType}  |  System: KOS v${LIC.SYSTEM_VERSION}`)
        .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    body.appendHorizontalRule();

    body.appendParagraph('Primary Role').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(answers.role);

    body.appendParagraph('Who I Serve').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(answers.audience);

    body.appendParagraph('The Admin Ghost (What It Steals)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(answers.adminGhost);

    body.appendParagraph('The Necessary Struggle (What I Refuse to Automate)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(answers.necessaryStruggle);

    body.appendParagraph('Relational Targets (Carbon-to-Carbon)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(answers.relationalTargets);

    body.appendParagraph('90-Day Vision').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(answers.vision90Day);

    body.appendHorizontalRule();
    body.appendParagraph('LICENSE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(
      `This system is deployed under the Polyform Noncommercial 1.0.0 license.\n` +
      `Deployment type declared by operator: ${deployType}\n` +
      `Author: ${LIC.AUTHOR}\n` +
      `The Fidelity Clause requires preserving the Alignment Cog and HITL Firewall in any adaptation.`
    );

    doc.saveAndClose();
  } catch (e) {
    console.error('[Onboarding] Failed to seed CORE_THESIS: ' + e.toString());
  }
}


// ══════════════════════════════════════════════════════════════
// ONBOARDING PROGRESS TRACKING
// ══════════════════════════════════════════════════════════════

/**
 * Shows current onboarding progress and the 3-horizon ROI map.
 */
function checkOnboardingProgress() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  const verified    = props.getProperty(LIC.PROP_KEYS.THESIS_VERIFIED) === 'true';
  const currentDay  = parseInt(props.getProperty(LIC.PROP_KEYS.ONBOARDING_DAY) || '0');
  const startDate   = props.getProperty(LIC.PROP_KEYS.ONBOARDING_START);
  const deployType  = props.getProperty(LIC.PROP_KEYS.DEPLOYMENT_TYPE) || 'NOT SET';
  const vision      = props.getProperty(LIC.PROP_KEYS.VISION_90_DAY) || 'Not yet defined';
  const targets     = props.getProperty(LIC.PROP_KEYS.RELATIONAL_TARGETS) || 'Not yet defined';

  if (!verified) {
    ui.alert(
      '🔒 Engine COLD — Onboarding Not Started',
      'Your Core Thesis has not been sealed.\n\n' +
      'Run 🧠 Council → Begin Socratic Onboarding to activate the system.',
      ui.ButtonSet.OK
    );
    return;
  }

  const phase = currentDay <= 7 ? '1: Foundation (Days 1-7)'
              : currentDay <= 14 ? '2: Calibration (Days 8-14)'
              : '3: Activation (Days 15-21)';

  const progressBar = '█'.repeat(Math.min(currentDay, 21)) +
                      '░'.repeat(Math.max(0, 21 - currentDay));

  ui.alert(
    `🧠 Onboarding Progress — Day ${currentDay} of ${LIC.ONBOARDING_DAYS}`,
    `[${progressBar}] ${Math.round((currentDay / 21) * 100)}%\n` +
    `Phase: ${phase}\n` +
    `Started: ${startDate ? new Date(startDate).toLocaleDateString() : 'Unknown'}\n` +
    `Deployment: ${deployType}\n\n` +
    `YOUR 90-DAY VISION:\n"${vision}"\n\n` +
    `RELATIONAL TARGETS:\n${targets}\n\n` +
    `── 3-HORIZON ROI MAP ──\n` +
    `Horizon 1 (90 sec) — Deploy infrastructure        ✔ COMPLETE\n` +
    `Horizon 2 (10 min) — First session ingestion      ${currentDay >= 1 ? '✔ COMPLETE' : '○ PENDING'}\n` +
    `Horizon 3 (21 day) — Full cognitive prosthetic    ${currentDay >= 21 ? '✔ COMPLETE' : `Day ${currentDay}/21`}`,
    ui.ButtonSet.OK
  );
}

/**
 * Increments the onboarding day counter.
 * Called by processIntakePayload on successful Phase 4 completion.
 */
function _advanceOnboardingDay() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(LIC.PROP_KEYS.THESIS_VERIFIED) !== 'true') return;
  const current = parseInt(props.getProperty(LIC.PROP_KEYS.ONBOARDING_DAY) || '1');
  if (current < LIC.ONBOARDING_DAYS) {
    const next = current + 1;
    props.setProperty(LIC.PROP_KEYS.ONBOARDING_DAY, String(next));
    _logOnboardingDay(next, 'SESSION_COMPLETE', '');
    console.log(`[Onboarding] Day advanced: ${current} → ${next}`);
  }
}

/**
 * Logs an onboarding milestone to the ONBOARDING_TRACKER sheet.
 */
function _logOnboardingDay(day, event, note) {
  try {
    const props = PropertiesService.getScriptProperties();
    const indexId = props.getProperty('INDEX_ID');
    if (!indexId) return;
    const ss    = SpreadsheetApp.openById(indexId);
    let tracker = ss.getSheetByName(LIC.ONBOARDING_SHEET);
    if (!tracker) {
      tracker = ss.insertSheet(LIC.ONBOARDING_SHEET);
      tracker.appendRow(['Day', 'Date', 'Event', 'Note', 'Vision_90_Day']);
      tracker.getRange('1:1').setFontWeight('bold').setBackground('#e8d5f0');
      tracker.setFrozenRows(1);
    }
    tracker.appendRow([
      day,
      new Date(),
      event,
      note || '',
      props.getProperty(LIC.PROP_KEYS.VISION_90_DAY) || '',
    ]);
  } catch (e) {
    console.warn('[Onboarding] Could not log day: ' + e.message);
  }
}


// ══════════════════════════════════════════════════════════════
// RELATIONAL TARGETS
// ══════════════════════════════════════════════════════════════

/**
 * Returns the operator's Relational Targets as a parsed array.
 * Used by buildSessionContext() to include in the Gem session opener.
 *
 * @returns {string[]} Array of relational target names/roles
 */
function getRelationalTargets() {
  const raw = PropertiesService.getScriptProperties().getProperty(LIC.PROP_KEYS.RELATIONAL_TARGETS) || '';
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * Menu-callable: updates Relational Targets without a full re-onboarding.
 */
function updateRelationalTargets() {
  const ui     = DocumentApp.getUi();
  const result = ui.prompt(
    'Update Relational Targets',
    'List your current Carbon-to-Carbon relationships (comma separated).\n\n' +
    'These are the people whose lives this system exists to protect time for.',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  const targets = result.getResponseText().trim();
  if (targets) {
    PropertiesService.getScriptProperties().setProperty(LIC.PROP_KEYS.RELATIONAL_TARGETS, targets);
    ui.alert('✅ Relational Targets Updated', targets, ui.ButtonSet.OK);
  }
}


// ══════════════════════════════════════════════════════════════
// SESSION CONTEXT BUILDER
// ══════════════════════════════════════════════════════════════

/**
 * Assembles the full context block for a new Gem session.
 * Reads CORE_THESIS, PIVOTS_AND_LESSONS, User Manual, and Vector Primer
 * from Drive/PropertiesService and formats them as a copy-pasteable block.
 *
 * This is the missing piece that makes the pre-flight header possible:
 * "Active Files in Context: CORE_THESIS, PIVOTS_AND_LESSONS, BRAIN_TRUST_INDEX, RTP_USER_MANUAL"
 *
 * Run from: 🧠 Council → Build Session Context
 */
function buildSessionContext() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  _coldEngineGate('buildSessionContext', 'TIER_2');

  try {
    const sections = [];
    const loaded   = [];

    // ── CORE_THESIS ────────────────────────────────────────
    const thesisId = props.getProperty('ID_CORE_THESIS');
    if (thesisId) {
      try {
        const text = DocumentApp.openById(thesisId).getBody().getText();
        if (text.length > 50) {
          sections.push('## CORE_THESIS\n' + text.substring(0, 1500) +
            (text.length > 1500 ? '\n[...truncated for context window...]' : ''));
          loaded.push('CORE_THESIS');
        }
      } catch (_) { console.warn('Could not load CORE_THESIS.'); }
    }

    // ── PIVOTS_AND_LESSONS ─────────────────────────────────
    const pivotId = props.getProperty('ID_PIVOTS_AND_LESSONS');
    if (pivotId) {
      try {
        const text = DocumentApp.openById(pivotId).getBody().getText();
        if (text.length > 50) {
          sections.push('## PIVOTS_AND_LESSONS (Active System Laws)\n' +
            text.substring(0, 2000) +
            (text.length > 2000 ? '\n[...truncated...]' : ''));
          loaded.push('PIVOTS_AND_LESSONS');
        }
      } catch (_) { console.warn('Could not load PIVOTS_AND_LESSONS.'); }
    }

    // ── RTP USER MANUAL ────────────────────────────────────
    const manualFiles = DriveApp.getFilesByName('RTP_USER_MANUAL_v1.0');
    if (manualFiles.hasNext()) {
      try {
        const text = DocumentApp.openById(manualFiles.next().getId()).getBody().getText();
        if (text.length > 50) {
          sections.push('## RTP_USER_MANUAL_v1.0 (Operational Procedures)\n' +
            text.substring(0, 1200) +
            (text.length > 1200 ? '\n[...truncated...]' : ''));
          loaded.push('RTP_USER_MANUAL v1.0');
        }
      } catch (_) { console.warn('Could not load RTP_USER_MANUAL.'); }
    }

    // ── VECTOR PRIMER ──────────────────────────────────────
    let primer = '';
    try {
      // Try Vector_Router.gs first, fall back to main script primer
      primer = (typeof getVectorPrimer === 'function')
        ? getVectorPrimer()
        : (PropertiesService.getScriptProperties().getProperty('SESSION_VECTOR_PRIMER')
          ? _formatLegacyPrimer() : '');
    } catch (_) {}
    if (primer) {
      sections.push(primer);
      loaded.push('BRAIN_TRUST_INDEX (Vector Primer)');
    }

    // ── RELATIONAL TARGETS ─────────────────────────────────
    const targets = getRelationalTargets();
    if (targets.length > 0) {
      sections.push('## RELATIONAL TARGETS (Protect These Relationships)\n' +
        targets.map((t, i) => `${i + 1}. ${t}`).join('\n'));
    }

    // ── ASSEMBLE BLOCK ─────────────────────────────────────
    const block =
      `[🧠 RTP — SESSION CONTEXT INJECTION]\n` +
      `Assembled: ${new Date().toLocaleString()}\n` +
      `Active Files: ${loaded.join(', ')}\n` +
      `Operator: ${props.getProperty(LIC.PROP_KEYS.OPERATOR_ROLE) || 'Unknown'}\n` +
      `Onboarding Day: ${props.getProperty(LIC.PROP_KEYS.ONBOARDING_DAY) || '?'} of ${LIC.ONBOARDING_DAYS}\n` +
      `\n${'═'.repeat(50)}\n\n` +
      sections.join('\n\n' + '─'.repeat(50) + '\n\n') +
      `\n\n${'═'.repeat(50)}\n` +
      `[END CONTEXT INJECTION — Paste this entire block at the top of a new Gem session]\n` +
      `The Gem will emit a [🧠 RTP — PRE-FLIGHT] header once it has processed this block.`;

    // Write to Drop Zone for easy copy
    const doc  = DocumentApp.getActiveDocument();
    const body = doc.getBody();
    body.clear();
    const p = body.getParagraphs()[0] || body.appendParagraph('');
    p.setText(block);
    p.setHeading(DocumentApp.ParagraphHeading.NORMAL);

    ui.alert(
      '✅ Session Context Built',
      `Loaded: ${loaded.join(', ')}\n\n` +
      `The context block has been written to this document.\n\n` +
      `Copy the entire document content and paste it at the top of a new Gem session.\n` +
      `The Gem will respond with a [🧠 RTP — PRE-FLIGHT] header.\n\n` +
      `⚠ Do NOT run Process Session Log on this document — it is an outbound context block,\n` +
      `not an inbound session log. Open a fresh Drop Zone after your session.`,
      ui.ButtonSet.OK
    );

  } catch (e) {
    _reportError('buildSessionContext', e, ui);
  }
}

function _formatLegacyPrimer() {
  const raw = PropertiesService.getScriptProperties().getProperty('SESSION_VECTOR_PRIMER');
  if (!raw) return '';
  try {
    const primer = JSON.parse(raw);
    const lines  = Object.entries(primer.vector_weights || {}).map(([k,v]) => `  ${k}: ${v}`);
    return `## SESSION_VECTOR_PRIMER\nConsolidated: ${primer.consolidated_at}\n${lines.join('\n')}`;
  } catch (_) { return ''; }
}


// ══════════════════════════════════════════════════════════════
// FIDELITY CLAUSE & LICENSE COMPLIANCE
// ══════════════════════════════════════════════════════════════

/**
 * Verifies that all Fidelity Clause requirements are intact.
 * Mandatory for commercial deployments. Callable by anyone.
 * Checks: Alignment Cog exists, Blackboard sheet exists, HITL trigger is live.
 */
function verifyFidelityClause() {
  const ui      = DocumentApp.getUi();
  const props   = PropertiesService.getScriptProperties();
  const results = [];
  let   allPass = true;

  // Check 1: PERSONA_ALIGNMENT exists in Council Alignments
  const councilId = props.getProperty('ID_02_COUNCIL_ALIGNMENTS');
  if (councilId) {
    try {
      const folder = DriveApp.getFolderById(councilId);
      const files  = folder.getFilesByName(LIC.FIDELITY_REQUIRED_PERSONA);
      if (files.hasNext()) {
        results.push(`✔ ${LIC.FIDELITY_REQUIRED_PERSONA} found in Council Alignments`);
      } else {
        results.push(`❌ ${LIC.FIDELITY_REQUIRED_PERSONA} MISSING from Council Alignments`);
        allPass = false;
      }
    } catch (_) {
      results.push(`⚠ Could not verify Council Alignments folder`);
      allPass = false;
    }
  } else {
    results.push('⚠ Council Alignments folder ID not registered');
    allPass = false;
  }

  // Check 2: Blackboard sheet exists in BRAIN_TRUST_INDEX
  const indexId = props.getProperty('INDEX_ID');
  if (indexId) {
    try {
      const ss      = SpreadsheetApp.openById(indexId);
      const board   = ss.getSheetByName(LIC.FIDELITY_REQUIRED_SHEET);
      const trigger = ScriptApp.getProjectTriggers()
        .some(t => t.getHandlerFunction() === 'onGovernanceEdit');
      results.push(board
        ? `✔ ${LIC.FIDELITY_REQUIRED_SHEET} sheet found in BRAIN_TRUST_INDEX`
        : `❌ ${LIC.FIDELITY_REQUIRED_SHEET} sheet MISSING`);
      results.push(trigger
        ? '✔ Governance trigger (onGovernanceEdit) is active'
        : '⚠ Governance trigger not installed — run Setup Governance Trigger');
      if (!board) allPass = false;
    } catch (_) {
      results.push('⚠ Could not access BRAIN_TRUST_INDEX');
      allPass = false;
    }
  } else {
    results.push('⚠ BRAIN_TRUST_INDEX ID not registered');
    allPass = false;
  }

  // Check 3: Deployment type
  const deployType = props.getProperty(LIC.PROP_KEYS.DEPLOYMENT_TYPE) || 'NOT DECLARED';
  results.push(`\nDeployment type: ${deployType}`);
  if (deployType === 'COMMERCIAL') {
    results.push('ℹ Commercial deployment — Fidelity Clause is MANDATORY');
    results.push('ℹ Attribution required: "Built on KOS by Adam Berneche (RTP Council)"');
  }

  const verdict = allPass ? '✅ FIDELITY CLAUSE: COMPLIANT' : '❌ FIDELITY CLAUSE: VIOLATIONS FOUND';
  ui.alert('Fidelity Clause Verification', `${verdict}\n\n${results.join('\n')}`, ui.ButtonSet.OK);
}

/**
 * Generates a printable license compliance report and saves it to
 * 01_Canonical_Foundation. Useful for commercial deployments.
 */
function generateLicenseReport() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  try {
    const timestamp  = new Date().toLocaleDateString();
    const deployType = props.getProperty(LIC.PROP_KEYS.DEPLOYMENT_TYPE) || 'NOT DECLARED';
    const operator   = props.getProperty(LIC.PROP_KEYS.OPERATOR_ROLE)   || 'NOT SET';
    const day        = props.getProperty(LIC.PROP_KEYS.ONBOARDING_DAY)  || '0';
    const idKey      = props.getProperty('IDENTITY_KEY')                 ? '✔ SET' : '⚠ NOT SET';
    const verified   = props.getProperty(LIC.PROP_KEYS.THESIS_VERIFIED) === 'true' ? '✔ VERIFIED' : '⚠ NOT VERIFIED';

    const doc  = DocumentApp.create(`KOS_LICENSE_REPORT_${timestamp.replace(/\//g, '-')}`);
    const body = doc.getBody();
    body.clear();

    body.appendParagraph('KOS LICENSE COMPLIANCE REPORT').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Generated: ${timestamp}  |  System: KOS v${LIC.SYSTEM_VERSION}`)
        .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    body.appendHorizontalRule();

    body.appendParagraph('LICENSE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(`Type: ${LIC.LICENSE_TYPE}\nAuthor: ${LIC.AUTHOR}\nReference: https://polyformproject.org/licenses/noncommercial/1.0.0/`);

    body.appendParagraph('OPERATOR').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(`Role: ${operator}\nDeployment Type: ${deployType}\nOnboarding Day: ${day} of ${LIC.ONBOARDING_DAYS}\nIdentity Key: ${idKey}\nCore Thesis: ${verified}`);

    body.appendParagraph('FIDELITY CLAUSE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(
      `Required for all commercial adaptations:\n` +
      `1. Alignment Cog (PERSONA_ALIGNMENT) must be preserved\n` +
      `2. HITL Firewall (Blackboard + Governance trigger) must remain functional\n` +
      `3. Attribution: "Built on KOS by Adam Berneche (RTP Council)"\n\n` +
      `Run 🧠 Council → Verify Fidelity Clause for live compliance check.`
    );

    body.appendParagraph('RELATIONAL TARGETS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(props.getProperty(LIC.PROP_KEYS.RELATIONAL_TARGETS) || 'Not defined');

    body.appendParagraph('90-DAY VISION').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(props.getProperty(LIC.PROP_KEYS.VISION_90_DAY) || 'Not defined');

    doc.saveAndClose();

    // Move to 01_Canonical_Foundation if it exists
    const f01Id = props.getProperty('ID_01_1_SCRIPTS');
    const parentId = props.getProperty('ID_02_COUNCIL_ALIGNMENTS');
    const foundationFiles = DriveApp.getFoldersByName('01_Canonical_Foundation');
    if (foundationFiles.hasNext()) {
      DriveApp.getFileById(doc.getId()).moveTo(foundationFiles.next());
    }

    ui.alert('✅ License Report Generated',
      `Report saved: "KOS_LICENSE_REPORT_${timestamp.replace(/\//g, '-')}"\n\n` +
      `Check 01_Canonical_Foundation in your Drive.`,
      ui.ButtonSet.OK);

  } catch (e) {
    _reportError('generateLicenseReport', e, ui);
  }
}

/**
 * Menu-callable: shows license summary and attribution.
 */
function checkLicenseCompliance() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const deployType = props.getProperty(LIC.PROP_KEYS.DEPLOYMENT_TYPE) || 'NOT DECLARED';
  const armed      = props.getProperty(LIC.PROP_KEYS.THESIS_VERIFIED) === 'true';

  ui.alert(
    'KOS License Information',
    `License: ${LIC.LICENSE_TYPE}\n` +
    `Author:  ${LIC.AUTHOR}\n` +
    `System:  KOS v${LIC.SYSTEM_VERSION}\n\n` +
    `This software is FREE for noncommercial use.\n` +
    `Commercial use is permitted on an honor system with attribution.\n\n` +
    `THE FIDELITY CLAUSE (commercial deployments):\n` +
    `  • Preserve PERSONA_ALIGNMENT (the Alignment Cog)\n` +
    `  • Preserve the HITL Firewall (Blackboard + Governance trigger)\n` +
    `  • Attribution: "Built on KOS by ${LIC.AUTHOR}"\n\n` +
    `Your deployment: ${deployType}\n` +
    `Engine status:  ${armed ? '✔ ARMED' : '⚠ COLD — run Socratic Onboarding'}\n\n` +
    `Full license: https://polyformproject.org/licenses/noncommercial/1.0.0/`,
    ui.ButtonSet.OK
  );
}


// ══════════════════════════════════════════════════════════════
// DEPLOY HELPER — called by _createScaffoldedDocs in main script
// ══════════════════════════════════════════════════════════════

/**
 * Creates the RTP User Manual scaffold doc in 01_Canonical_Foundation.
 * Contains operational procedures for the RTP: pre-flight protocol,
 * RID assignment, @Closeout, State Sync, and Seven Bridges reference.
 * Idempotent — skips if doc already exists.
 */
function _createRTPUserManualDoc(f01) {
  const name = 'RTP_USER_MANUAL_v1.0';
  if (f01.getFilesByName(name).hasNext()) return;

  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();

  body.appendParagraph('RTP USER MANUAL v1.0').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Active_Brain_Trust_System  |  Operational Procedures  |  CI: 2.3')
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();

  body.appendParagraph('1. PRE-FLIGHT PROTOCOL').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'Every session must open with a [🧠 RTP — PRE-FLIGHT] header. This is non-negotiable.\n' +
    'The header must contain:\n' +
    '  Active Files in Context: [list all docs injected]\n' +
    '  ALIGNMENT Status: GREEN / YELLOW / RED\n' +
    '  RID Assignments: [persona]: [weight] → [APEX LEAD or SHARED]\n' +
    '  Weighted Sequence: [execution order]\n' +
    '  Live Fetch Required: YES / NO\n\n' +
    'The pre-flight header is the RTP\'s declaration of operational state.\n' +
    'It cannot be skipped, abbreviated, or combined with other content.'
  );

  body.appendParagraph('2. RID ASSIGNMENT LOGIC').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'RID (Role in Discussion) weights are assigned per session based on the Vector Primer\n' +
    'and session type. Rules:\n\n' +
    '  • All RID weights must sum to exactly 1.0\n' +
    '  • The highest-weighted persona holds APEX LEAD\n' +
    '  • All others hold SHARED\n' +
    '  • Minimum weight per active persona: 0.05\n' +
    '  • Maximum weight for APEX LEAD: 0.70\n' +
    '  • RTP always participates; its weight ranges from 0.25 to 0.50\n\n' +
    'Assignment examples:\n' +
    '  Code session:    DEVELOPER 0.60 [APEX], RTP 0.25 [SHARED], ARCHITECT 0.15 [SHARED]\n' +
    '  Strategy session: RTP 0.50 [APEX], ARCHITECT 0.30 [SHARED], MUSE 0.20 [SHARED]\n' +
    '  Crisis session:  ALIGNMENT 0.55 [APEX], RTP 0.30 [SHARED], AUDITOR 0.15 [SHARED]'
  );

  body.appendParagraph('3. WEIGHTED EXECUTION SEQUENCE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'Personas respond in descending RID weight order.\n' +
    'Each response must begin with its persona flag:\n' +
    '  [🧠 RTP]: ...\n' +
    '  [🏗 THE ARCHITECT]: [MODE: PLANNING / CRITIQUE / DESIGN]\n' +
    '  [⚖️ THE AUDITOR]: ...\n' +
    '  [✨ THE MUSE]: [TRIGGER: ...]\n' +
    '  [💻 THE DEVELOPER]: ...\n' +
    '  [📋 THE CURATOR]: ...\n' +
    '  [🧭 THE ALIGNMENT]: ...\n\n' +
    'A persona may PASS (not respond) but must declare [PASS] with reason.\n' +
    'No persona may respond without its flag header.'
  );

  body.appendParagraph('4. @CLOSEOUT PROTOCOL').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    '@Closeout is triggered by the operator or when a session goal is achieved.\n' +
    'On @Closeout, THE CURATOR fires and produces a CURATOR V5 JSON payload containing:\n\n' +
    '  session_metadata: { session_type, cold_start, rtp_version }\n' +
    '  session_summary: [one paragraph plain text]\n' +
    '  dynamic_state:\n' +
    '    next_steps: [...]\n' +
    '    pivots_and_lessons: [...]\n' +
    '    deferred_decisions: [{ decision, blocking, owner }]\n' +
    '  vector_weights: { THEME: score }\n' +
    '  cog_registry: { cog_verdicts: [{ cog, final_status, summary }] }\n' +
    '  action_exhaust: [{ type, item, owner, protected_time_risk }]\n' +
    '  session_delta: { smp_proposals_filed: [...] }\n' +
    '  alignment_report: { relational_status_at_closeout, thresholds_crossed, mandatory_pauses_issued }\n\n' +
    'The JSON must be valid and parseable. No narrative text outside the JSON block.'
  );

  body.appendParagraph('5. STATE SYNC BLOCK').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'After @Closeout JSON, the RTP emits [🧠 RTP — STATE SYNC]:\n\n' +
    '  [🧠 RTP — STATE SYNC]\n' +
    '  Status: [brief session outcome]\n' +
    '  Critical Data:\n' +
    '    • [key insight or decision]\n' +
    '    • [key insight or decision]\n' +
    '  ALIGNMENT: GREEN / YELLOW / RED\n' +
    '  MUSE routing pending: YES / NO\n' +
    '  SMP proposals filed this session: [count or "none"]\n' +
    '  Hand-off: [actionable closing question for the operator]\n\n' +
    'The State Sync is not a summary. It is a hand-off document.\n' +
    'The hand-off question must be answerable with YES/NO or a single action.'
  );

  body.appendParagraph('6. SEVEN BRIDGES PROTOCOL (SMP-002)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'Status: PENDING APPROVAL\n\n' +
    'When the 3/7 trigger fires (3+ non-APPROVED verdicts):\n' +
    '  1. Halt current execution immediately\n' +
    '  2. Emit [SEVEN BRIDGES TRIGGERED] with the 3 dissenting verdicts\n' +
    '  3. Do not proceed until operator issues explicit approval\n' +
    '  4. BRIDGE_FIDELITY_001: Never summarize a cog\'s verdict — quote directly\n\n' +
    'See SMP-002_SEVEN_BRIDGES_RECONCILIATION_PROTOCOL in 01.3_SMP_PROPOSALS.'
  );

  body.appendParagraph('7. ALIGNMENT STATUS DEFINITIONS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'GREEN  — All relational targets safe, cognitive load nominal, no thresholds crossed\n' +
    'YELLOW — One relational target at risk, elevated cognitive load, minor drift detected\n' +
    'RED    — Relational breach active, cognitive load critical, mandatory pause required\n\n' +
    'RED status triggers an immediate _reportError() email to the operator.\n' +
    'Session cannot proceed to Phase 4 processing while ALIGNMENT is RED.'
  );

  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
}

// ============================================================
// END KOS_LICENSE.GS
// Companion: RTP_REFINERY_DEPLOYER.gs CI 2.3 | Vector_Router.gs CI 1.0
// ============================================================
