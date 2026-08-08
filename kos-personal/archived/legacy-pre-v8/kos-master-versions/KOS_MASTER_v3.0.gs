/**
 * ============================================================
 * KNOWLEDGE OPERATING SYSTEM (KOS) — MASTER DEPLOYMENT SCRIPT
 * Version: 5.4 | CI: 3.0 | Single-File Complete Deployment
 * Bound to: Drop Zone Document
 * ============================================================
 *
 * LICENSE: Polyform Noncommercial 1.0.0
 * Author:  Adam Berneche (RTP Council)
 * Full text: https://polyformproject.org/licenses/noncommercial/1.0.0/
 *
 * Free for noncommercial use. Commercial use requires a separate
 * written agreement with the author.
 *
 * THE FIDELITY CLAUSE (mandatory for all commercial adaptations):
 *   1. PERSONA_ALIGNMENT must be preserved intact
 *   2. The HITL Firewall (Blackboard + Governance trigger) must remain
 *   3. Attribution: "Built on KOS by Adam Berneche (RTP Council)"
 *
 * ── PIPELINE EXECUTION ORDER ──────────────────────────────────
 *   FIRST TIME:
 *     1. 🚀 Deploy → Deploy Full System
 *     2. 🧠 Council → Begin Socratic Onboarding
 *     3. 🧠 Council → Setup Governance Trigger
 *     4. 🧠 Council → Setup Time Triggers
 *     5. 🧠 Council → Build Session Context → paste into Gem
 *
 *   EVERY SESSION:
 *     ① Process Session Log (Phase 1)
 *     ② Trigger Partition (Phase 2)
 *     ③ Process Intake Payloads (Phase 4) — TIER 2 gated
 *     ④ Consolidate Inference (Phase 3)
 *
 * ── COLD ENGINE TIERS ──────────────────────────────────────────
 *   TIER 1 (Phase 1, 2): Warns — proceeds with user confirmation
 *   TIER 2 (Phase 4, mutations, council): Hard block until armed
 *
 * ── PART MAP ──────────────────────────────────────────────────
 *   1.  Configuration
 *   2.  Menu Initialization
 *   3.  Phase 0 — Deploy
 *   4.  Phase 0 — Deploy Helpers (docs, folders, sheets)
 *   5.  Phase 1 — Intake & Quarantine
 *   6.  Phase 2 — Semantic Partition
 *   7.  Phase 3 — Inference Consolidation
 *   8.  Phase 4 — Intake Pipeline (CURATOR JSON processor)
 *   9.  Vector Router (Matrix Ledger, Incubator, Decay, Promotion)
 *   10. Governance Engine (HITL CI/CD, applyMutation)
 *   11. Council Simulator (Differential Read, Payload Assembly)
 *   12. Sweepers (Semantic, Exhaust)
 *   13. KOS License & Socratic Onboarding
 *   14. Session Context Builder
 *   15. Calibration, Sovereign Helpers & Diagnostics
 *   16. Shared Utilities
 *   17. Admin
 * ============================================================
 */


// ══════════════════════════════════════════════════════════════
// PART 1: CONFIGURATION
// ══════════════════════════════════════════════════════════════
const CFG = {
  // ── System Identity ──────────────────────────────────────
  SYSTEM_NAME:              'Active_Brain_Trust_System',
  DROP_ZONE_TITLE:          'DROP_ZONE',
  SYSTEM_VERSION:           '5.4',

  // ── License ──────────────────────────────────────────────
  LICENSE_TYPE:             'Polyform Noncommercial 1.0.0',
  AUTHOR:                   'Adam Berneche (RTP Council)',
  FIDELITY_REQUIRED_PERSONA:'PERSONA_ALIGNMENT',
  FIDELITY_REQUIRED_SHEET:  'Blackboard',

  // ── Refinery Asset Names ──────────────────────────────────
  STAGING_FOLDER:           '03.4_RAW_EXHAUST',
  INDEX_NAME:               'BRAIN_TRUST_INDEX',

  // ── Sheet Names ───────────────────────────────────────────
  STAGING_SHEET:            'STAGING_PIPELINE',
  INFERENCE_BUFFER_SHEET:   'Inference_Buffer',
  MATRIX_LEDGER_SHEET:      'MATRIX_LEDGER',
  DYNAMIC_STATE_MATRIX:     'DYNAMIC_STATE_MATRIX',
  BLACKBOARD_SHEET:         'Blackboard',
  ACTION_REGISTER_SHEET:    'ACTION_REGISTER',
  SESSION_LOG_SHEET:        'SESSION_LOG',
  COG_REGISTRY_SHEET:       'COG_REGISTRY',
  VECTOR_MATRIX_SHEET:      'VECTOR_MATRIX',
  INCUBATOR_SHEET:          'INCUBATOR',
  ONBOARDING_SHEET:         'ONBOARDING_TRACKER',

  // ── Drop Zone Placeholder ─────────────────────────────────
  GUARD_TXT: 'PASTE SESSION LOG IN PLACE OF THIS TEXT\n(The system will automatically ingest this document and clear it when finished.)',

  // ── Chunking ──────────────────────────────────────────────
  MAX_CHUNK_SIZE:           8000,
  DELIMITER:                '[🧠 RTP',

  // ── Vector Router ─────────────────────────────────────────
  VECTOR_THRESHOLD:         0.7,
  DECAY_FACTOR:             0.92,
  INCUBATOR_THRESHOLD:      0.10,
  PROMOTION_MIN_SESSIONS:   3,
  PROMOTION_MIN_AVG_WEIGHT: 0.35,
  KNOWN_VECTORS: ['ARCHITECTURE', 'UI', 'SECURITY', 'PEDAGOGY', 'GAS_DEVELOPMENT', 'RELATIONAL'],

  // ── Personas to copy from Drive on Deploy ─────────────────
  PERSONAS: [
    'PERSONA_ARCHITECT', 'PERSONA_AUDITOR', 'PERSONA_MUSE',
    'PERSONA_DEVELOPER', 'PERSONA_ALIGNER', 'PERSONA_CURATOR', 'PERSONA_ALIGNMENT',
  ],

  // ── Vector primer docs to scaffold on Deploy ──────────────
  VECTORS_TO_CREATE: ['VECTOR_ARCHITECTURE', 'VECTOR_PEDAGOGY', 'VECTOR_SECURITY', 'VECTOR_UI'],

  // ── Calibration keys (values NEVER hardcoded — PIVOT 008) ─
  CALIBRATION_KEYS: [
    'THEME_ARCHITECTURE', 'THEME_PEDAGOGY', 'THEME_FAMILY_ALIGNMENT',
    'SOCRATIC_THRESHOLD', 'IDENTITY_KEY_SALT',
  ],

  // ── Onboarding ────────────────────────────────────────────
  ONBOARDING_DAYS:          21,
  TOTAL_ONBOARDING_STEPS:   8,

  // ── PropertiesService keys for onboarding state ───────────
  PROP: {
    OPERATOR_ROLE:      'KOS_OPERATOR_ROLE',
    OPERATOR_AUDIENCE:  'KOS_OPERATOR_AUDIENCE',
    ADMIN_GHOST:        'KOS_ADMIN_GHOST',
    NECESSARY_STRUGGLE: 'KOS_NECESSARY_STRUGGLE',
    RELATIONAL_TARGETS: 'KOS_RELATIONAL_TARGETS',
    VISION_90_DAY:      'KOS_VISION_90_DAY',
    DEPLOYMENT_TYPE:    'KOS_DEPLOYMENT_TYPE',
    THESIS_VERIFIED:    'CORE_THESIS_VERIFIED',
    ONBOARDING_DAY:     'KOS_ONBOARDING_DAY',
    ONBOARDING_START:   'KOS_ONBOARDING_START',
  },
};


// ══════════════════════════════════════════════════════════════
// PART 2: MENU INITIALIZATION
// ══════════════════════════════════════════════════════════════
function onOpen() {
  const ui = DocumentApp.getUi();
  ui.createMenu('🚀 Deploy')
    .addItem('Deploy Full System', 'deployFullSystem')
    .addToUi();
  ui.createMenu('🧠 Council')
    .addItem('① Process Session Log (Phase 1)',        'processManualSync')
    .addItem('② Trigger Partition (Phase 2)',           'processPhase2Chunking')
    .addItem('③ Process Intake Payloads (Phase 4)',     'runIntakePipelineFromBuffer')
    .addItem('④ Consolidate Inference (Phase 3)',       'consolidateInferenceChunks')
    .addSeparator()
    .addItem('Generate Council Payload',               'generateCouncilInputPayload')
    .addItem('Run Semantic Sweeper',                   'runSemanticSweeper')
    .addItem('Sweep Root for Exhaust',                 'sweepRootForExhaust')
    .addItem('Get Startup Primer',                     'getStartupPrimer')
    .addItem('Vector State Diagnostic',                'dumpVectorState')
    .addItem('Run Promotion Check',                    'runPromotionCheck')
    .addItem('Archive Staging Pipeline',               'archiveStagingPipeline')
    .addSeparator()
    .addItem('Setup Governance Trigger',               'setupGovernanceTrigger')
    .addItem('Setup Time Triggers',                    'setupTimeTriggers')
    .addItem('Setup Routing Properties',               'setupRoutingProperties')
    .addItem('Audit Calibration Health',               'auditCalibrationHealth')
    .addItem('Dump All Properties',                    'dumpAllProperties')
    .addItem('Seven Bridges Review (SMP-002)',         'sevenBridgesReview')
    .addSeparator()
    .addItem('▶ Begin Socratic Onboarding',            'runSocraticOnboarding')
    .addItem('Check Onboarding Progress',              'checkOnboardingProgress')
    .addItem('Build Session Context',                  'buildSessionContext')
    .addItem('Update Relational Targets',              'updateRelationalTargets')
    .addSeparator()
    .addItem('License Information',                    'checkLicenseCompliance')
    .addItem('Verify Fidelity Clause',                 'verifyFidelityClause')
    .addItem('Generate License Report',                'generateLicenseReport')
    .addSeparator()
    .addItem('Reset System Pointers (Admin)',          'resetProperties')
    .addItem('Nuclear Wipe — Release Prep (Admin)',    'nuclearWipeForRelease')
    .addToUi();
}


// ══════════════════════════════════════════════════════════════
// PART 3: PHASE 0 — DEPLOY
// ══════════════════════════════════════════════════════════════
function deployFullSystem() {
  const ui      = DocumentApp.getUi();
  const confirm = ui.alert('🚀 Deploy Full System',
    'Builds the entire Active_Brain_Trust_System in Google Drive.\nIdempotent — safe to re-run.\n\nProceed?',
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;
  try {
    const log = [];
    log.push('▸ Building folder tree...');
    const folders = _buildFolderTree();
    log.push('  ✔ Folder tree complete');

    log.push('▸ Creating BRAIN_TRUST_INDEX...');
    const ss = _getOrCreateSpreadsheet(CFG.INDEX_NAME, folders.root);
    const sheetNames = [
      CFG.STAGING_SHEET, 'EXECUTION_LEDGER', CFG.INFERENCE_BUFFER_SHEET,
      CFG.MATRIX_LEDGER_SHEET, CFG.DYNAMIC_STATE_MATRIX, CFG.BLACKBOARD_SHEET,
      CFG.ACTION_REGISTER_SHEET, CFG.SESSION_LOG_SHEET, CFG.COG_REGISTRY_SHEET,
      CFG.VECTOR_MATRIX_SHEET, CFG.INCUBATOR_SHEET, CFG.ONBOARDING_SHEET,
    ];
    sheetNames.forEach(n => _getOrCreateSheet(ss, n));
    _seedBlackboardTemplateRow(ss);
    PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
    log.push('  ✔ All 12 pipeline sheets ready');

    log.push('▸ Configuring Drop Zone...');
    const doc = DocumentApp.getActiveDocument();
    doc.setName(CFG.DROP_ZONE_TITLE);
    _resetDropZone(doc.getBody());
    log.push('  ✔ Drop Zone configured');

    log.push('▸ Scaffolding foundational documents...');
    _createAllFoundationDocs(folders);
    log.push('  ✔ All foundation docs created');

    log.push('▸ Copying persona documents (highest version)...');
    const personaLog = _copyPersonas(folders.f02);
    log.push(...personaLog);

    log.push('▸ Creating vector primer documents...');
    CFG.VECTORS_TO_CREATE.forEach(v => _scaffoldVectorDoc(v, folders.f05));
    log.push('  ✔ Vector primers scaffolded');

    log.push('▸ Registering all properties...');
    _registerAllProperties(folders, ss);
    _registerDocPointers(folders);
    log.push('  ✔ Properties registered');

    log.push('▸ Generating Identity Key...');
    generateIdentityKey();
    log.push('  ✔ Identity Key generated');

    const cs = _getCalibrationStatus();
    log.push(cs.armed ? `  ✔ Engine ARMED — ${cs.count} key(s)` : '  ⚠ Engine COLD — run Socratic Onboarding');

    ui.alert('✅ Deploy Complete',
      'NEXT STEPS:\n1. 🧠 Council → Begin Socratic Onboarding  ← START HERE\n' +
      '2. Setup Governance Trigger\n3. Setup Time Triggers\n' +
      '4. Build Session Context → paste into Gem\n5. ① Process Session Log\n\n' +
      '── LOG ──\n' + log.join('\n'), ui.ButtonSet.OK);
  } catch (e) { _reportError('deployFullSystem', e, ui); }
}


// ══════════════════════════════════════════════════════════════
// PART 4: DEPLOY HELPERS
// ══════════════════════════════════════════════════════════════
function _buildFolderTree() {
  const root    = _getOrCreateFolder(CFG.SYSTEM_NAME);
  const f01     = _getOrCreateFolder('01_Canonical_Foundation',  root);
  const f01_1   = _getOrCreateFolder('01.1_SCRIPTS',             f01);
  const f01_2   = _getOrCreateFolder('01.2_SOP_AND_FLOWS',       f01);
  const f01_3   = _getOrCreateFolder('01.3_SMP_PROPOSALS',       f01);
  const f02     = _getOrCreateFolder('02_Council_Alignments',    root);
  const f03     = _getOrCreateFolder('03_Dynamic_State',         root);
  const f03_1   = _getOrCreateFolder('03.1_CURRENT_STATE',       f03);
  const f03_2   = _getOrCreateFolder('03.2_PIVOTS_AND_LESSONS',  f03);
  const f03_3   = _getOrCreateFolder('03.3_PROCESSED_EXHAUST',   f03);
  const f03_raw = _getOrCreateFolder('03.4_RAW_EXHAUST',         f03);
  const f04     = _getOrCreateFolder('04_Council_Logs',          root);
  const f04_1   = _getOrCreateFolder('04.1_ARCHITECT_SILO',      f04);
  const f04_2   = _getOrCreateFolder('04.2_AUDITOR_SILO',        f04);
  const f04_3   = _getOrCreateFolder('04.3_MUSE_SILO',           f04);
  const f04_4   = _getOrCreateFolder('04.4_DEVELOPER_SILO',      f04);
  const f04_5   = _getOrCreateFolder('04.5_ALIGNER_SILO',        f04);
  const f04_6   = _getOrCreateFolder('04.6_CURATOR_SILO',        f04);
  const f04_7   = _getOrCreateFolder('04.7_RTP_SILO',            f04);
  const f04_8   = _getOrCreateFolder('04.8_COG_GRAVEYARD',       f04);
  const f05     = _getOrCreateFolder('05_Vector_Repository',     root);
  const f06     = _getOrCreateFolder('06_CLASSROOM_ASSETS',      root);
  const f06_1   = _getOrCreateFolder('06.1_LESSON_PLANS',        f06);
  const f06_2   = _getOrCreateFolder('06.2_STUDENT_FACING',      f06);
  const f06_3   = _getOrCreateFolder('06.3_ASSESSMENTS',         f06);
  const f06_4   = _getOrCreateFolder('06.4_COMMUNICATIONS',      f06);
  const f07     = _getOrCreateFolder('07_Memory_Vault',          root);
  const f08     = _getOrCreateFolder('08_Project_Autopsies',     root);
  const ccps    = _getOrCreateFolder('CCPS_MASTER_TEMPLATES',    root);
  _getOrCreateFolder('01_Pending_Tagging', ccps);
  return { root, f01, f01_1, f01_2, f01_3, f02,
    f03, f03_1, f03_2, f03_3, f03_raw,
    f04, f04_1, f04_2, f04_3, f04_4, f04_5, f04_6, f04_7, f04_8,
    f05, f06, f06_1, f06_2, f06_3, f06_4, f07, f08, ccps };
}

function _registerAllProperties(folders, ss) {
  const props = PropertiesService.getScriptProperties();
  const map = {
    'ID_01_1_SCRIPTS':          folders.f01_1, 'ID_01_2_SOP_AND_FLOWS':    folders.f01_2,
    'ID_01_3_SMP_PROPOSALS':    folders.f01_3, 'ID_02_COUNCIL_ALIGNMENTS': folders.f02,
    'ID_03_DYNAMIC_STATE':      folders.f03,   'ID_03_1_CURRENT_STATE':    folders.f03_1,
    'ID_03_2_PIVOTS':           folders.f03_2, 'ID_03_3_PROCESSED':        folders.f03_3,
    'ID_00_RAW_EXHAUST':        folders.f03_raw,'ID_04_COUNCIL_LOGS':       folders.f04,
    'ID_04_1_ARCHITECT':        folders.f04_1, 'ID_04_2_AUDITOR':          folders.f04_2,
    'ID_04_3_MUSE':             folders.f04_3, 'ID_04_4_DEVELOPER':        folders.f04_4,
    'ID_04_5_ALIGNER':          folders.f04_5, 'ID_04_6_CURATOR':          folders.f04_6,
    'ID_04_7_RTP':              folders.f04_7, 'ID_04_8_GRAVEYARD':        folders.f04_8,
    'ID_05_VECTOR_REPOSITORY':  folders.f05,   'ID_06_1_LESSON_PLANS':     folders.f06_1,
    'ID_06_2_STUDENT_FACING':   folders.f06_2, 'ID_06_3_ASSESSMENTS':      folders.f06_3,
    'ID_06_4_COMMUNICATIONS':   folders.f06_4, 'ID_07_MEMORY_VAULT':       folders.f07,
    'ID_08_PROJECT_AUTOPSIES':  folders.f08,   'ID_CCPS_MASTER_TEMPLATES': folders.ccps,
    'FOLDER_ID':                folders.f03_raw,
  };
  Object.entries(map).forEach(([k, f]) => { if (f) props.setProperty(k, f.getId()); });
  if (ss) props.setProperty('INDEX_ID', ss.getId());
}

function _registerDocPointers(folders) {
  const props  = PropertiesService.getScriptProperties();
  const docMap = {
    'ID_CURRENT_STATE':     { folder: folders.f03_1, name: 'CURRENT_STATE' },
    'ID_PIVOTS_AND_LESSONS':{ folder: folders.f03_2, name: 'PIVOTS_AND_LESSONS_V1.0' },
  };
  Object.entries(docMap).forEach(([key, { folder, name }]) => {
    const f = folder.getFilesByName(name);
    if (f.hasNext()) props.setProperty(key, f.next().getId());
  });
  const indexId = props.getProperty('INDEX_ID');
  if (indexId) props.setProperty('ID_BRAIN_TRUST_INDEX', indexId);
}

function _seedBlackboardTemplateRow(ss) {
  const sheet = _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
  if (sheet.getLastRow() > 1) return;
  sheet.appendRow(['[PASTE_TARGET_DOC_ID]','CE-STATE','CURRENT_STATE','v1.0',
    '[AWAITING_GENESIS_PROTOCOL...]','SYSTEM ONLINE — Session 001','','Example row — delete before use',
    'ARCHITECT', new Date(),'EXAMPLE',false]);
  sheet.getRange(2,1,1,12).setBackground('#FFF9C4').setFontStyle('italic');
}

function _createAllFoundationDocs(folders) {
  // ── CORE_THESIS ──────────────────────────────────────────
  _scaffoldDoc('CORE_THESIS', folders.f01, [
    { h1: 'CORE THESIS' },
    { h2: 'System Identity' }, { p: 'Define what this system is and why it exists.' },
    { h2: 'Primary Objectives' }, { p: 'List the 3–5 outcomes this system produces.' },
    { h2: 'Foundational Principles' }, { p: 'What rules govern how the system operates? These should be immutable.' },
    { h2: 'Success Metrics' }, { p: 'How will you know the system is working?' },
  ]);

  // ── CURRENT_STATE ────────────────────────────────────────
  _scaffoldDoc('CURRENT_STATE', folders.f03_1, [
    { h1: 'CURRENT STATE' },
    { h2: 'Last Updated' }, { p: '[Update each session]' },
    { h2: 'System Health' }, { p: '🟢 GREEN — Nominal\n🟡 YELLOW — Issues\n🔴 RED — Critical' },
    { h2: 'Active Projects' }, { p: '[List current projects and status]' },
    { h2: 'Open Loops' }, { p: '[What is unresolved or waiting?]' },
    { h2: 'Next Actions' }, { p: '[What happens next? Who owns it? By when?]' },
  ]);

  // ── PIVOTS_AND_LESSONS ───────────────────────────────────
  _scaffoldDoc('PIVOTS_AND_LESSONS_V1.0', folders.f03_2, [
    { h1: 'PIVOTS AND LESSONS' },
    { h2: 'Entry Format' }, { p: '[DATE]  |  [LESSON TITLE]  |  [WHAT CHANGED]  |  [ACTION TAKEN]' },
    { h2: 'Active Pivots' }, { p: 'PIVOT 008 | THE_CALIBRATION_WALL | All "Soul" data sequestered in PropertiesService. Cold Engine pattern enforced.' },
    { h2: 'Archived Pivots' }, { p: 'PIVOT 001–007 — See system documentation.' },
  ]);

  // ── SYSTEM_TELEMETRY ─────────────────────────────────────
  _scaffoldDoc('SYSTEM_TELEMETRY', folders.f03, [
    { h1: 'SYSTEM TELEMETRY' },
    { h2: 'Deployment Date' }, { p: new Date().toLocaleDateString() },
    { h2: 'CI Version' }, { p: '3.0' },
    { h2: 'Engine Status' }, { p: 'COLD — Run Socratic Onboarding to arm.' },
    { h2: 'Active Personas' }, { p: '7 (ARCHITECT, AUDITOR, MUSE, DEVELOPER, ALIGNER, CURATOR, ALIGNMENT)' },
    { h2: 'Vector Coverage' }, { p: CFG.KNOWN_VECTORS.join(', ') },
  ]);

  // ── SMP-002 ──────────────────────────────────────────────
  _scaffoldDoc('SMP-002_SEVEN_BRIDGES_RECONCILIATION_PROTOCOL', folders.f01_3, [
    { h1: 'SMP-002: SEVEN BRIDGES RECONCILIATION PROTOCOL' },
    { h2: 'Status: PENDING USER APPROVAL' },
    { h2: 'The Problem' }, { p: 'Cogs responding in shared threads produce Consensus Drift — verdicts that reflect social averaging, not independent analysis.' },
    { h2: 'The Protocol' }, { p: 'Layer 1 — SEQUESTRATION: Each cog receives stimulus in isolation. Response: 5–10 sentences + Indelible Verdict (APPROVED | RETURNED | ESCALATED | PAUSED | SUPPRESSED).\nLayer 2 — RECONCILIATION: RTP assembles all 7 verdicts without cross-contamination.\n3/7 TRIGGER: 3+ non-APPROVED verdicts halt execution.' },
    { h2: 'Governing Law' }, { p: 'BRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog\'s verdict is VOID.' },
    { h2: 'Implementation' }, { p: 'sevenBridgesReview() stub is live. Full engine pending approval.' },
  ]);

  // ── PRD_TEMPLATE ─────────────────────────────────────────
  _scaffoldDoc('PRD_TEMPLATE_LESSON_PLAN', folders.ccps, [
    { h1: 'LESSON PLAN TEMPLATE' },
    { h2: 'Course & Unit' }, { p: '[Course]  |  Unit [#]: [Title]' },
    { h2: 'VDOE Competencies' }, { p: '[Competency codes]' },
    { h2: 'Learning Objectives' }, { p: 'By the end, students will:\n1. \n2. \n3. ' },
    { h2: 'Lesson Flow' }, { p: 'HOOK (0:00–0:10)\n\nINSTRUCTION (0:10–0:30)\n\nPRACTICE (0:30–0:50)\n\nCLOSURE (0:50–1:00)' },
    { h2: 'Assessment' }, { p: '[Formative or summative?]' },
    { h2: 'Differentiation' }, { p: 'Enrichment: []\nSupport: []' },
  ]);

  // ── CE NAMING CONVENTION ─────────────────────────────────
  _scaffoldDoc('CE_NAMING_CONVENTION_SMP001', folders.f01, [
    { h1: 'CE NAMING CONVENTION — SMP-001' },
    { h2: 'Formula' }, { p: '[CE-TAG]: [Descriptive Title] [vX.X optional]\nExample: CE-LESSON: Introduction to Market Segmentation v1.0' },
    { h2: 'Rules' }, { p: '1. Tag must be FIRST characters in filename\n2. Tag must be followed by ": " (colon + space)\n3. Tags are CASE-SENSITIVE\n4. Never add [UID_...] prefix — UIDs are stamped by the Sweeper\n5. One CE tag per filename' },
    { h2: 'Full Tag Reference' }, { p: 'CE-CODE → 01.1_SCRIPTS\nCE-FLOW → 01.2_SOP_AND_FLOWS\nCE-SMP → 01.3_SMP_PROPOSALS\nCE-COG → 02_Council_Alignments\nCE-STATE → 03_Dynamic_State\nCE-CURR → 03.1_CURRENT_STATE\nCE-PIVOT → 03.2_PIVOTS_AND_LESSONS\nCE-PROC → 03.3_PROCESSED_EXHAUST\nCE-LOG → 04_Council_Logs\nCE-ARCH → 04.1_ARCHITECT_SILO\nCE-AUD → 04.2_AUDITOR_SILO\nCE-MUSE → 04.3_MUSE_SILO\nCE-DEV → 04.4_DEVELOPER_SILO\nCE-ALIGN → 04.5_ALIGNER_SILO\nCE-CUR → 04.6_CURATOR_SILO\nCE-RTP → 04.7_RTP_SILO\nCE-GRAVE → 04.8_COG_GRAVEYARD\nCE-VECTOR → 05_Vector_Repository\nCE-PRD → 06.1_LESSON_PLANS\nCE-LESSON → 06.2_STUDENT_FACING\nCE-RUBRIC → 06.3_ASSESSMENTS\nCE-COMM → 06.4_COMMUNICATIONS\nCE-VAULT → 07_Memory_Vault\nCE-AUTOPSY → 08_Project_Autopsies\nCE-TEMPLATE → CCPS_MASTER_TEMPLATES\nKOS: → 03.4_RAW_EXHAUST\nCE: → 03.4_RAW_EXHAUST' },
  ]);

  // ── GEM SETUP ────────────────────────────────────────────
  _scaffoldDoc('START_HERE_GEM_SETUP', folders.f01, [
    { h1: 'START HERE: GEM SETUP GUIDE' },
    { h2: 'Step 1 — Create the Gem' }, { p: 'gemini.google.com → My Gems → Create a Gem\nName: RTP Council' },
    { h2: 'Step 2 — Paste the System Prompt' },
    { p:
`You are the RTP Council Gem — a collaborative AI assistant embedded in the Active_Brain_Trust_System.

## YOUR ROLE
You are the primary AI interface for students and team members. At session open, you will receive a [🧠 RTP — SESSION CONTEXT INJECTION] block. Process it silently, then emit a [🧠 RTP — PRE-FLIGHT] header declaring active files, ALIGNMENT status, RID assignments, and weighted execution sequence.

## YOUR PERSONALITY
- Warm, direct, and intellectually demanding
- You challenge users to think deeper, never complete work for them
- You are honest about uncertainty
- You enforce the Necessary Struggle

## SESSION CLOSING PROTOCOL
When a session ends or the user asks to close, say exactly:
"Session complete. Copy everything above this line, open your DROP_ZONE document, paste the content, and select 🧠 Council → ① Process Session Log."

## OPENING PROTOCOL
1. Process the context injection block silently
2. Emit the PRE-FLIGHT header
3. Ask: "What are we working on today?"` },
    { h2: 'Step 3 — Arm the Engine' }, { p: '1. Extensions → Apps Script\n2. Find setupCalibration()\n3. Fill in weights → Run once → Clear values\n4. 🧠 Council → Audit Calibration Health' },
    { h2: 'Step 4 — Onboard' }, { p: '🧠 Council → Begin Socratic Onboarding (8 prompts, ~10 minutes)' },
    { h2: 'Step 5 — First Session' }, { p: '1. 🧠 Council → Build Session Context\n2. Copy context block → paste into Gem\n3. Run session → @Closeout → copy full conversation\n4. Paste into Drop Zone → ① → ② → ③ → ④' },
  ]);

  // ── RTP USER MANUAL ──────────────────────────────────────
  _scaffoldDoc('RTP_USER_MANUAL_v1.0', folders.f01, [
    { h1: 'RTP USER MANUAL v1.0' },
    { h2: '1. Pre-Flight Protocol' },
    { p: 'Every session must open with [🧠 RTP — PRE-FLIGHT] containing:\n  Active Files in Context: [list]\n  ALIGNMENT Status: GREEN / YELLOW / RED\n  RID Assignments: [persona]: [weight] → [APEX LEAD or SHARED]\n  Weighted Sequence: [execution order]\n  Live Fetch Required: YES / NO\n\nThis header is mandatory and cannot be abbreviated.' },
    { h2: '2. RID Assignment Logic' },
    { p: '• All weights sum to 1.0\n• Highest-weighted persona = APEX LEAD\n• RTP weight range: 0.25–0.50\n• Minimum per active persona: 0.05\n\nExamples:\n  Code session: DEVELOPER 0.60 [APEX], RTP 0.25, ARCHITECT 0.15\n  Strategy: RTP 0.50 [APEX], ARCHITECT 0.30, MUSE 0.20\n  Crisis: ALIGNMENT 0.55 [APEX], RTP 0.30, AUDITOR 0.15' },
    { h2: '3. Persona Flags' },
    { p: '[🧠 RTP]: | [🏗 THE ARCHITECT]: [MODE: PLANNING/CRITIQUE/DESIGN] | [⚖️ THE AUDITOR]: | [✨ THE MUSE]: [TRIGGER: ...] | [💻 THE DEVELOPER]: | [📋 THE CURATOR]: | [🧭 THE ALIGNMENT]:\n\nA persona may PASS but must declare [PASS] with reason.' },
    { h2: '4. @Closeout Protocol' },
    { p: 'THE CURATOR fires at @Closeout and produces CURATOR V5 JSON:\n  session_metadata, session_summary, cog_registry, vector_weights,\n  build_state, session_delta (smp_proposals_filed), dynamic_state\n  (next_steps, pivots_and_lessons, deferred_decisions),\n  alignment_report, action_exhaust\n\nJSON must be valid. No narrative outside the JSON block.' },
    { h2: '5. State Sync Block' },
    { p: '[🧠 RTP — STATE SYNC]\nStatus: [outcome]\nCritical Data:\n  • [key decision]\nALIGNMENT: GREEN/YELLOW/RED\nMUSE routing pending: YES/NO\nSMP proposals filed: [count]\nHand-off: [actionable closing question]' },
    { h2: '6. Alignment Statuses' },
    { p: 'GREEN  — All relational targets safe, load nominal\nYELLOW — One target at risk, elevated load\nRED    — Breach active, mandatory pause — triggers email alert' },
    { h2: '7. Seven Bridges (SMP-002 — Pending Approval)' },
    { p: '3/7 TRIGGER: 3+ non-APPROVED verdicts halt execution.\nBRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog\'s verdict is VOID.\nSee SMP-002 in 01.3_SMP_PROPOSALS.' },
  ]);
}

function _scaffoldDoc(name, folder, sections) {
  if (folder.getFilesByName(name).hasNext()) return;
  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();
  sections.forEach(s => {
    if (s.h1) body.appendParagraph(s.h1).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    else if (s.h2) body.appendParagraph(s.h2).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    else if (s.h3) body.appendParagraph(s.h3).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    else if (s.p !== undefined) body.appendParagraph(String(s.p));
    else if (s.hr) body.appendHorizontalRule();
  });
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(folder);
}

function _scaffoldVectorDoc(name, folder) {
  if (folder.getFilesByName(name).hasNext()) return;
  const domain = { VECTOR_ARCHITECTURE:'System Design & Technical Infrastructure',
    VECTOR_PEDAGOGY:'Teaching, Learning & Student Outcomes',
    VECTOR_SECURITY:'Data Privacy, Student Safety & Access Control',
    VECTOR_UI:'User Experience & Interface Design' }[name] || 'Knowledge Domain';
  _scaffoldDoc(name, folder, [
    { h1: name.replace('_', ': ') },
    { h2: `Domain: ${domain}` },
    { h2: 'Core Principles' }, { p: '[What foundational beliefs govern this domain?]' },
    { h2: 'Key Decisions Log' }, { p: '[DATE]  |  [DECISION]  |  [RATIONALE]' },
    { h2: 'Active Constraints' }, { p: '[What limits or guardrails currently apply?]' },
    { h2: 'Evolution Log' }, { p: '[What changed? What was deprecated and why?]' },
  ]);
}

function _copyPersonas(f02) {
  const log = [];
  CFG.PERSONAS.forEach(baseName => {
    try {
      const sourceFile = _findHighestVersionDoc(baseName);
      if (!sourceFile) { log.push(`  ⚠ ${baseName}: Not found — skipped`); return; }
      const sourceName = sourceFile.getName();
      if (f02.getFilesByName(sourceName).hasNext()) {
        log.push(`  ↷ ${sourceName}: Already exists`); return;
      }
      const content = DocumentApp.openById(sourceFile.getId()).getBody().getText();
      const newDoc  = DocumentApp.create(sourceName);
      newDoc.getBody().setText(content);
      newDoc.saveAndClose();
      DriveApp.getFileById(newDoc.getId()).moveTo(f02);
      log.push(`  ✔ ${sourceName}: Copied`);
    } catch (e) { log.push(`  ❌ ${baseName}: ${e.message}`); }
  });
  return log;
}

function _findHighestVersionDoc(baseName) {
  const it = DriveApp.searchFiles(
    `title contains "${baseName}" and mimeType = "${MimeType.GOOGLE_DOCS}" and trashed = false`);
  let best = null, bestV = -1;
  while (it.hasNext()) {
    const f = it.next();
    const n = f.getName();
    if (n.includes('[UID_')) continue;
    const m = n.match(/[Vv][\s\.]?(\d+)/);
    const v = m ? parseInt(m[1]) : 0;
    if (v > bestV) { bestV = v; best = f; }
    else if (bestV === -1 && !best) { best = f; }
  }
  return best;
}


// ══════════════════════════════════════════════════════════════
// PART 5: PHASE 1 — INTAKE & QUARANTINE
// ══════════════════════════════════════════════════════════════
function processManualSync() {
  const ui   = DocumentApp.getUi();
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  try {
    _coldEngineGate('processManualSync', 'TIER_1');
    const rawText = body.getText().replace(CFG.GUARD_TXT, '').trim();
    if (rawText.length < 50) {
      ui.alert('Payload Insufficient', 'Paste a full session log before processing.', ui.ButtonSet.OK);
      return;
    }
    const cs = _getCalibrationStatus();
    if (!cs.armed) {
      const go = ui.alert('⚠ Engine COLD',
        'No calibration weights set. Processing will continue but vector scoring will be inactive.\n\nContinue?',
        ui.ButtonSet.YES_NO);
      if (go !== ui.Button.YES) return;
    }
    runHardeningAudit(rawText);
    const logUUID = _generateLogUUID(rawText);
    const folder  = _getSystemAsset(CFG.STAGING_FOLDER, 'FOLDER_ID', true);
    const ss      = _getSystemAsset(CFG.INDEX_NAME,     'INDEX_ID',  false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    if (staging.getRange('B:B').getValues().flat().includes(logUUID)) {
      throw new Error('Duplicate Session: Log hash already exists in the Pipeline.');
    }
    const archiveDoc  = DocumentApp.create(`[RAW]_${logUUID}`);
    const archiveFile = DriveApp.getFileById(archiveDoc.getId());
    archiveDoc.getBody().setText(rawText);
    archiveDoc.saveAndClose();
    archiveFile.moveTo(folder);
    archiveFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
    staging.appendRow([new Date(), logUUID, archiveFile.getUrl(), 'READY_FOR_PHASE_2', 'RAW_INTAKE']);
    SpreadsheetApp.flush();
    _resetDropZone(body);
    ui.alert('✅ Phase 1 Complete',
      `LOG_UUID: ${logUUID}\n\nQuarantined in ${CFG.STAGING_FOLDER}.\nRun ② Trigger Partition next.`,
      ui.ButtonSet.OK);
  } catch (e) { _reportError('processManualSync', e, ui); }
}


// ══════════════════════════════════════════════════════════════
// PART 6: PHASE 2 — SEMANTIC PARTITION
// ══════════════════════════════════════════════════════════════
function processPhase2Chunking() {
  const ui = DocumentApp.getUi();
  try {
    _coldEngineGate('processPhase2Chunking', 'TIER_1');
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data    = staging.getDataRange().getValues();
    let processed = 0, chunks = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][3] !== 'READY_FOR_PHASE_2') continue;
      const docUrl = data[i][2];
      try {
        const m = docUrl.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
        if (!m) throw new Error('Could not extract doc ID from: ' + docUrl);
        const parts   = _semanticChunker(DocumentApp.openById(m[1]).getBody().getText());
        const logUUID = data[i][1];
        parts.forEach((text, idx) => {
          staging.appendRow([new Date(), `${logUUID}_CH${(idx+1).toString().padStart(2,'0')}`, docUrl, 'PENDING_INFERENCE', text]);
          chunks++;
        });
        staging.getRange(i+1, 4).setValue('PARTITIONED');
        processed++;
      } catch (e) {
        staging.getRange(i+1, 4).setValue(`PHASE_2_ERROR: ${e.message}`);
        _reportError('processPhase2Chunking row ' + (i+1), e, null);
      }
    }
    if (processed > 0) SpreadsheetApp.flush();
    ui.alert('✅ Phase 2 Complete',
      `Partitioned ${processed} log(s) → ${chunks} chunk(s).\n\nNext: Run chunks through Curator Gem → paste JSON into Inference_Buffer → ③ Process Intake Payloads.`,
      ui.ButtonSet.OK);
  } catch (e) { _reportError('processPhase2Chunking', e, ui); }
}


// ══════════════════════════════════════════════════════════════
// PART 7: PHASE 3 — INFERENCE CONSOLIDATION
// ══════════════════════════════════════════════════════════════
function consolidateInferenceChunks() {
  const ui = DocumentApp.getUi();
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const buffer = _getOrCreateSheet(ss, CFG.INFERENCE_BUFFER_SHEET);
    const data   = buffer.getDataRange().getValues();
    const agg    = {};
    let done = 0, errs = 0;
    for (let i = 1; i < data.length; i++) {
      const status = data[i][4];
      if (status !== 'BUFFERED' && status !== 'INTAKE_PROCESSED') continue;
      try {
        const parsed = JSON.parse(data[i][3].toString().replace(/```json|```/g, '').trim());
        const w = parsed.vector_weights;
        if (w && typeof w === 'object') {
          Object.entries(w).forEach(([theme, val]) => {
            const s = parseFloat(val);
            if (!isNaN(s)) {
              if (!agg[theme]) agg[theme] = { sum: 0, count: 0 };
              agg[theme].sum += s; agg[theme].count++;
            }
          });
        }
        buffer.getRange(i+1, 5).setValue('CONSOLIDATED');
        done++;
      } catch (e) {
        buffer.getRange(i+1, 5).setValue(`PARSE_ERROR: ${e.message}`);
        _reportError('consolidateInferenceChunks row ' + (i+1), e, null);
        errs++;
      }
    }
    if (done === 0) {
      ui.alert('Nothing to Consolidate',
        'No BUFFERED or INTAKE_PROCESSED rows in Inference_Buffer.\nPaste Curator JSON and set Status = BUFFERED, then re-run.',
        ui.ButtonSet.OK);
      return;
    }
    const primer = { consolidated_at: new Date().toISOString(), chunk_count: done, vector_weights: {} };
    Object.entries(agg).forEach(([t, d]) => { primer.vector_weights[t] = parseFloat((d.sum/d.count).toFixed(4)); });
    PropertiesService.getScriptProperties().setProperty('SESSION_VECTOR_PRIMER', JSON.stringify(primer));
    SpreadsheetApp.flush();
    ui.alert('✅ Phase 3 Complete',
      `Consolidated ${done} chunk(s)${errs > 0 ? ` | ⚠ ${errs} parse error(s)` : ''}.\n\n` +
      Object.entries(primer.vector_weights).map(([k,v]) => `${k}: ${v}`).join('\n'),
      ui.ButtonSet.OK);
  } catch (e) { _reportError('consolidateInferenceChunks', e, ui); }
}


// ══════════════════════════════════════════════════════════════
// PART 8: PHASE 4 — INTAKE PIPELINE (CURATOR JSON PROCESSOR)
// ══════════════════════════════════════════════════════════════
function runIntakePipelineFromBuffer() {
  const ui = DocumentApp.getUi();
  try {
    _coldEngineGate('runIntakePipelineFromBuffer', 'TIER_2');
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const buffer = _getOrCreateSheet(ss, CFG.INFERENCE_BUFFER_SHEET);
    const data   = buffer.getDataRange().getValues();
    let ok = 0, errs = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][4] !== 'BUFFERED') continue;
      const result = processIntakePayload(data[i][3].toString().replace(/```json|```/g, '').trim());
      if (result.status === 'SUCCESS') {
        buffer.getRange(i+1, 5).setValue('INTAKE_PROCESSED'); ok++;
      } else {
        buffer.getRange(i+1, 5).setValue(`INTAKE_ERROR: ${result.message}`); errs++;
      }
    }
    if (ok > 0) {
      SpreadsheetApp.flush();
      try { _advanceOnboardingDay(); } catch (_) {}
    }
    ui.alert('✅ Phase 4 Complete',
      `Processed ${ok} payload(s).${errs > 0 ? `\n⚠ ${errs} error(s) — check Inference_Buffer.` : ''}`,
      ui.ButtonSet.OK);
  } catch (e) { _reportError('runIntakePipelineFromBuffer', e, ui); }
}

function processIntakePayload(rawJSONPayload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: 'LOCKED', message: 'System busy.' };
  try {
    let pd;
    try { pd = JSON.parse(rawJSONPayload); }
    catch (pe) { _reportError('processIntakePayload JSON parse', pe, null); throw new Error('Malformed JSON: ' + pe.message); }

    const props = PropertiesService.getScriptProperties();
    const stateId  = props.getProperty('ID_CURRENT_STATE');
    const indexId  = props.getProperty('INDEX_ID');
    const vectorId = props.getProperty('ID_05_VECTOR_REPOSITORY');
    const pivotId  = props.getProperty('ID_PIVOTS_AND_LESSONS');
    if (!stateId || !indexId || !vectorId || !pivotId) {
      throw new Error('Core pointers missing. Run 🚀 Deploy or Setup Routing Properties.');
    }

    const ts  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const uid = 'LOG_' + new Date().getTime();
    const stateDoc   = DocumentApp.openById(stateId);
    const pivotDoc   = DocumentApp.openById(pivotId);
    const indexSheet = SpreadsheetApp.openById(indexId);

    // next_steps → CURRENT_STATE
    const stateBody = stateDoc.getBody();
    if (pd.dynamic_state?.next_steps?.length > 0) {
      stateBody.appendParagraph(`\n[State Sync: ${ts} | ${uid}]`).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      stateBody.appendParagraph('NEXT STEPS:').setBold(true);
      pd.dynamic_state.next_steps.forEach(s => stateBody.appendListItem(s));
    }
    if (pd.dynamic_state?.deferred_decisions?.length > 0) {
      stateBody.appendParagraph(`DEFERRED (${uid}):`).setBold(true);
      pd.dynamic_state.deferred_decisions.forEach(d =>
        stateBody.appendListItem(`[${d.owner||'unassigned'}] ${d.decision} — Blocking: ${d.blocking}`));
    }

    // pivots → PIVOTS_AND_LESSONS
    if (pd.dynamic_state?.pivots_and_lessons?.length > 0) {
      const pb = pivotDoc.getBody();
      pb.appendParagraph(`\n[Session: ${ts} | ${uid}]`).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      pd.dynamic_state.pivots_and_lessons.forEach(p => pb.appendListItem(p));
    }

    // vector_weights → MATRIX_LEDGER
    const ledger = indexSheet.getSheetByName(CFG.MATRIX_LEDGER_SHEET);
    if (ledger) {
      const w = pd.vector_weights || {};
      const arch = parseFloat(w.ARCHITECTURE)||0, ui2 = parseFloat(w.UI)||0;
      const sec  = parseFloat(w.SECURITY)||0,     ped = parseFloat(w.PEDAGOGY)||0;
      ledger.appendRow([uid, ts, arch, ui2, sec, ped, (arch+ui2+sec+ped).toFixed(4)]);
    }

    // session_metadata → SESSION_LOG
    const meta = pd.session_metadata || {};
    _getOrCreateSheet(indexSheet, CFG.SESSION_LOG_SHEET)
      .appendRow([uid, ts, meta.session_type||'', meta.cold_start||'', meta.rtp_version||'', pd.session_summary||'']);

    // cog_verdicts → COG_REGISTRY
    if (pd.cog_registry?.cog_verdicts?.length > 0) {
      const cs = _getOrCreateSheet(indexSheet, CFG.COG_REGISTRY_SHEET);
      pd.cog_registry.cog_verdicts.forEach(v => cs.appendRow([uid, ts, v.cog||'', v.final_status||'', v.summary||'']));
    }

    // action_exhaust → ACTION_REGISTER
    if (pd.action_exhaust?.length > 0) {
      const as = _getOrCreateSheet(indexSheet, CFG.ACTION_REGISTER_SHEET);
      pd.action_exhaust.forEach(a => as.appendRow([uid, ts, a.type||'', a.item||'', a.owner||'unassigned', a.protected_time_risk?'YES':'NO', 'OPEN']));
    }

    // smp_proposals → Blackboard
    if (pd.session_delta?.smp_proposals_filed?.length > 0) {
      const bb = _getOrCreateSheet(indexSheet, CFG.BLACKBOARD_SHEET);
      pd.session_delta.smp_proposals_filed.forEach(smp => bb.appendRow([
        '', smp.proposal_id||'', smp.title||'', '', `[${smp.proposal_id||'SMP'}]`,
        smp.summary||'', '', `Filed by: ${smp.filed_by||'unknown'} | ${smp.status||'PENDING'}`,
        smp.filed_by||'', ts, 'STAGED_FOR_REVIEW', false
      ]));
    }

    // alignment RED/YELLOW → email alert
    if (pd.alignment_report) {
      const as = pd.alignment_report.relational_status_at_closeout;
      if (as === 'RED' || as === 'YELLOW') {
        _reportError(`ALIGNMENT ${as} — ${uid}`,
          new Error(`Status: ${as}. Thresholds: ${(pd.alignment_report.thresholds_crossed_this_session||[]).join(', ')||'none'}. Pauses: ${pd.alignment_report.mandatory_pauses_issued||0}.`),
          null);
      }
    }

    // Route vectors via Vector Router
    const vr = routeVectorWeights(pd, uid, ts);
    return { status: 'SUCCESS', uid, vectorRouting: vr };

  } catch (error) {
    _reportError('processIntakePayload', error, null);
    return { status: 'ERROR', message: error.message };
  } finally { lock.releaseLock(); }
}


// ══════════════════════════════════════════════════════════════
// PART 9: VECTOR ROUTER — MATRIX LEDGER, INCUBATOR, DECAY
// ══════════════════════════════════════════════════════════════
function routeVectorWeights(pd, sessionUid, timestamp) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: 'LOCKED' };
  try {
    const ss          = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrixSheet = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const incubSheet  = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);
    const raw         = pd.vector_weights || {};
    const known = {}, unknown = {};
    Object.entries(raw).forEach(([t, v]) => {
      const s = parseFloat(v);
      if (isNaN(s)) return;
      if (CFG.KNOWN_VECTORS.includes(t.toUpperCase())) known[t.toUpperCase()] = s;
      else if (s >= CFG.INCUBATOR_THRESHOLD) unknown[t.toUpperCase()] = s;
    });
    const matrixRow       = _writeMatrixRow(matrixSheet, known, sessionUid, timestamp);
    const incubatorSignals = _logToIncubator(incubSheet, unknown, sessionUid);
    const routedDocs      = _routeToVectorDocs(pd, known, sessionUid, timestamp);
    const promotions      = _checkPromotionCandidates(incubSheet, matrixSheet);
    SpreadsheetApp.flush();
    return { status: 'SUCCESS', matrixRow, routedDocs, incubatorSignals, promotions };
  } catch (e) {
    _reportError('routeVectorWeights', e, null);
    return { status: 'ERROR', message: e.message };
  } finally { lock.releaseLock(); }
}

function _writeMatrixRow(sheet, known, sessionUid, timestamp) {
  const headers    = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const themeStart = 2;
  const themes     = headers.slice(themeStart);
  let lastScores   = {};
  if (sheet.getLastRow() > 1) {
    const lr = sheet.getRange(sheet.getLastRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
    themes.forEach((t, i) => { const v = parseFloat(lr[themeStart+i]); if (!isNaN(v)) lastScores[t] = v; });
  }
  const row = [sessionUid, timestamp];
  const result = { sessionUid, timestamp };
  themes.forEach(t => {
    let s;
    if (known[t] !== undefined) s = parseFloat(known[t].toFixed(4));
    else if (lastScores[t] !== undefined) s = parseFloat((lastScores[t] * CFG.DECAY_FACTOR).toFixed(4));
    else s = 0;
    row.push(s); result[t] = s;
  });
  row.push(Object.keys(known).filter(k => !themes.includes(k)).length);
  sheet.appendRow(row);
  return result;
}

function _logToIncubator(sheet, unknown, sessionUid) {
  const logged = [];
  if (!Object.keys(unknown).length) return logged;
  const data = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow()-1, 6).getValues() : [];
  Object.entries(unknown).forEach(([theme, score]) => {
    const idx = data.findIndex(r => r[0] === theme);
    if (idx >= 0) {
      const prev = data[idx], n = (parseInt(prev[3])||0)+1, avg = parseFloat((((parseFloat(prev[4])||0)*(n-1)+score)/n).toFixed(4));
      const sr = idx+2;
      sheet.getRange(sr,3).setValue(sessionUid);
      sheet.getRange(sr,4).setValue(n);
      sheet.getRange(sr,5).setValue(avg);
      data[idx][2]=sessionUid; data[idx][3]=n; data[idx][4]=avg;
    } else {
      sheet.appendRow([theme, sessionUid, sessionUid, 1, score.toFixed(4), 'INCUBATING']);
      data.push([theme, sessionUid, sessionUid, 1, score, 'INCUBATING']);
    }
    logged.push(theme);
  });
  return logged;
}

function _checkPromotionCandidates(incubSheet, matrixSheet) {
  const promoted = [];
  if (incubSheet.getLastRow() <= 1) return promoted;
  const data    = incubSheet.getRange(2,1,incubSheet.getLastRow()-1,6).getValues();
  const headers = matrixSheet.getRange(1,1,1,matrixSheet.getLastColumn()).getValues()[0];
  data.forEach((row, i) => {
    const [theme,,, count, avg, status] = row;
    if (status === 'PROMOTED' || parseInt(count) < CFG.PROMOTION_MIN_SESSIONS || parseFloat(avg) < CFG.PROMOTION_MIN_AVG_WEIGHT || headers.includes(theme)) return;
    const nc = matrixSheet.getLastColumn()+1;
    matrixSheet.getRange(1, nc).setValue(theme);
    if (matrixSheet.getLastRow() > 1) matrixSheet.getRange(2, nc, matrixSheet.getLastRow()-1, 1).setValue(0);
    incubSheet.getRange(i+2, 6).setValue('PROMOTED');
    if (!CFG.KNOWN_VECTORS.includes(theme)) CFG.KNOWN_VECTORS.push(theme);
    promoted.push(theme);
  });
  return promoted;
}

function _routeToVectorDocs(pd, known, sessionUid, timestamp) {
  const folderId = PropertiesService.getScriptProperties().getProperty('ID_05_VECTOR_REPOSITORY');
  if (!folderId) return 0;
  const folder = DriveApp.getFolderById(folderId);
  let count = 0;
  Object.entries(known).forEach(([theme, score]) => {
    if (score <= CFG.INCUBATOR_THRESHOLD) return;
    const name = 'VECTOR_' + theme;
    const existing = folder.getFilesByName(name);
    const doc  = existing.hasNext() ? DocumentApp.openById(existing.next().getId()) : (() => {
      const d = DocumentApp.create(name);
      d.getBody().appendParagraph(name).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      d.saveAndClose();
      DriveApp.getFileById(d.getId()).moveTo(folder);
      return DocumentApp.openById(DriveApp.getFilesByName(name).next().getId());
    })();
    const body = doc.getBody();
    if (score > CFG.VECTOR_THRESHOLD) {
      body.appendParagraph(`\n[HIGH-WEIGHT: ${timestamp} | ${sessionUid} | Score: ${score}]`).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      if (pd.session_summary) body.appendParagraph(pd.session_summary);
    } else {
      body.appendParagraph(`[Signal: ${timestamp} | ${sessionUid} | Score: ${score}]`);
    }
    count++;
  });
  return count;
}

function runPromotionCheck() {
  const ui = DocumentApp.getUi();
  try {
    const ss          = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrixSheet = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const incubSheet  = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);
    const promoted    = _checkPromotionCandidates(incubSheet, matrixSheet);
    SpreadsheetApp.flush();
    ui.alert('Incubator Promotion Check',
      promoted.length > 0
        ? `Promoted ${promoted.length} theme(s):\n${promoted.map(t => '  • ' + t).join('\n')}`
        : `No themes met criteria yet.\nNeeds ≥${CFG.PROMOTION_MIN_SESSIONS} sessions AND avg ≥${CFG.PROMOTION_MIN_AVG_WEIGHT}`,
      ui.ButtonSet.OK);
  } catch (e) { _reportError('runPromotionCheck', e, ui); }
}

function dumpVectorState() {
  const ui = DocumentApp.getUi();
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrix = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const incub  = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);
    const lines  = ['── VECTOR_MATRIX (last session) ──'];
    if (matrix.getLastRow() > 1) {
      const h = matrix.getRange(1,1,1,matrix.getLastColumn()).getValues()[0];
      const r = matrix.getRange(matrix.getLastRow(),1,1,matrix.getLastColumn()).getValues()[0];
      h.slice(2).forEach((t,i) => lines.push(`  ${String(t).padEnd(25)} ${r[i+2]}`));
    } else lines.push('  No sessions yet.');
    lines.push('\n── INCUBATOR ──');
    if (incub.getLastRow() > 1) {
      const d = incub.getRange(2,1,incub.getLastRow()-1,6).getValues();
      d.forEach(r => lines.push(`  ${String(r[0]).padEnd(25)} sessions:${r[3]}  avg:${r[4]}  ${r[5]}`));
    } else lines.push('  Empty.');
    ui.alert('Vector State', lines.join('\n'), ui.ButtonSet.OK);
  } catch (e) { _reportError('dumpVectorState', e, ui); }
}

function getStartupPrimer() {
  const ui  = DocumentApp.getUi();
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrix = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    if (matrix.getLastRow() > 1) {
      const h = matrix.getRange(1,1,1,matrix.getLastColumn()).getValues()[0];
      const r = matrix.getRange(matrix.getLastRow(),1,1,matrix.getLastColumn()).getValues()[0];
      let block = '[🧠 VECTOR_MATRIX — STARTUP CALIBRATION]\n';
      block    += `Last Session: ${r[0]} | ${r[1]}\nDecayed Vector Scores:\n`;
      h.slice(2).forEach((t,i) => { block += `  ${String(t).padEnd(25)} ${r[i+2]}\n`; });
      block += '[END CALIBRATION]';
      ui.alert('SESSION_VECTOR_PRIMER', block, ui.ButtonSet.OK);
    } else {
      const raw = PropertiesService.getScriptProperties().getProperty('SESSION_VECTOR_PRIMER');
      if (!raw) { ui.alert('No Primer', 'Run Phase 3 or Phase 4 first.', ui.ButtonSet.OK); return; }
      const p = JSON.parse(raw);
      const lines = Object.entries(p.vector_weights||{}).map(([k,v]) => `  ${k}: ${v}`);
      ui.alert('SESSION_VECTOR_PRIMER (legacy)', `Consolidated: ${p.consolidated_at}\n${lines.join('\n')}`, ui.ButtonSet.OK);
    }
  } catch (e) { _reportError('getStartupPrimer', e, ui); }
}


// ══════════════════════════════════════════════════════════════
// PART 10: GOVERNANCE ENGINE — HITL CI/CD PIPELINE
// ══════════════════════════════════════════════════════════════
function setupGovernanceTrigger() {
  const ui = DocumentApp.getUi();
  try {
    ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === 'onGovernanceEdit')
      .forEach(t => ScriptApp.deleteTrigger(t));
    const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    ScriptApp.newTrigger('onGovernanceEdit').forSpreadsheet(ss).onEdit().create();
    ui.alert('✅ Governance Trigger Installed',
      'onGovernanceEdit() now listens to BRAIN_TRUST_INDEX.\nCheck the Deploy_Trigger checkbox (Column L) in Blackboard to fire a mutation.',
      ui.ButtonSet.OK);
  } catch (e) { _reportError('setupGovernanceTrigger', e, ui); }
}

function onGovernanceEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row   = range.getRow();
  const col   = range.getColumn();
  const isTarget = (sheet.getName() === CFG.BLACKBOARD_SHEET || sheet.getName().indexOf('CE-LOG') !== -1);
  if (!isTarget || col !== 12 || range.getValue() !== true || row <= 1) return;
  try {
    const data    = sheet.getRange(row, 1, 1, 11).getValues()[0];
    const docId   = data[0] || data[5];
    const findStr = data[8];
    const payload = data[9];
    runHardeningAudit(payload);
    applyMutation(docId, findStr, payload);
    sheet.getRange(row, 11).setValue('DEPLOYED: ' + new Date().toLocaleString());
    sheet.getRange(row, 12).setValue(false);
    e.source.toast('Mutation deployed.', 'Governance Engine', 5);
  } catch (err) {
    sheet.getRange(row, 11).setValue('FAILED: ' + err.message);
    sheet.getRange(row, 12).setValue(false);
    e.source.toast('Mutation failed — check Status column.', 'System Alert', 10);
    _reportError('onGovernanceEdit', err, null);
  }
}

function applyMutation(docId, searchTag, payload) {
  if (!docId || !searchTag) throw new Error('Missing Document ID or Search Tag.');
  try {
    const ui = DocumentApp.getUi();
    const ok = ui.alert('⚠ Confirm Mutation',
      `FIND:    "${searchTag}"\nREPLACE: "${payload.substring(0,120)}${payload.length>120?'…':''}"\nDOC:     ${docId}\n\nProceed?`,
      ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) throw new Error('Mutation cancelled by operator.');
  } catch (uiErr) {
    if (!uiErr.message.includes('cancelled')) console.warn('[applyMutation] No UI context.');
    else throw uiErr;
  }
  const body = DocumentApp.openById(docId).getBody();
  const el   = body.findText(searchTag);
  if (el) { el.getElement().asText().replaceText(searchTag, payload); return true; }
  throw new Error(`Strict Match Failed: "${searchTag}" not found in doc ${docId}.`);
}


// ══════════════════════════════════════════════════════════════
// PART 11: COUNCIL SIMULATOR — DIFFERENTIAL READ
// ══════════════════════════════════════════════════════════════
function generateCouncilInputPayload() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { ui.alert('System Busy', 'Try again.', ui.ButtonSet.OK); return { status: 'LOCKED' }; }
  try {
    _coldEngineGate('generateCouncilInputPayload', 'TIER_2');
    const props      = PropertiesService.getScriptProperties();
    const stateId    = props.getProperty('ID_CURRENT_STATE');
    const pivotId    = props.getProperty('ID_PIVOTS_AND_LESSONS');
    const exhaustId  = props.getProperty('ID_00_RAW_EXHAUST');
    if (!stateId || !pivotId || !exhaustId) throw new Error('Core pointers missing. Run Deploy or Setup Routing Properties.');
    const stateFile  = DriveApp.getFileById(stateId);
    const lastRun    = parseInt(props.getProperty('COUNCIL_LAST_RUN') || '0', 10);
    if (stateFile.getLastUpdated().getTime() <= lastRun) {
      ui.alert('System Stasis', 'No new data since last run. Council sleeping.', ui.ButtonSet.OK);
      return { status: 'SLEEPING' };
    }
    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();
    const ts        = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const docName   = 'CE: COUNCIL_PAYLOAD_' + ts;
    const doc       = DocumentApp.create(docName);
    const body      = doc.getBody();
    body.appendParagraph('[🧠 RTP COUNCIL INITIATION STUB]').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`System State: ${ts}`);
    body.appendParagraph('1. THE CONTEXT (Recent Session Summary)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(stateText);
    body.appendParagraph('2. THE LAWS (Active Constraints)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(pivotText);
    body.appendParagraph('3. INFERENCE INSTRUCTIONS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('Act as Architect, Auditor, and Muse. Evaluate Context against Laws. Respond with: [🏗 ARCHITECT FLAG], [⚖️ AUDITOR FLAG], [✨ MUSE FLAG].').setBold(true);
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(exhaustId));
    props.setProperty('COUNCIL_LAST_RUN', new Date().getTime().toString());
    ui.alert('✅ Council Payload Generated', `"${docName}"\nRouted to RAW_EXHAUST for Workspace Studio pickup.`, ui.ButtonSet.OK);
    return { status: 'SUCCESS', docName };
  } catch (error) {
    _reportError('generateCouncilInputPayload', error, ui);
    return { status: 'ERROR', message: error.message };
  } finally { lock.releaseLock(); }
}


// ══════════════════════════════════════════════════════════════
// PART 12: SWEEPERS
// ══════════════════════════════════════════════════════════════
function setupTimeTriggers() {
  const ui = DocumentApp.getUi();
  try {
    ['runSemanticSweeper', 'sweepRootForExhaust'].forEach(fn => {
      ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === fn)
        .forEach(t => ScriptApp.deleteTrigger(t));
      ScriptApp.newTrigger(fn).timeBased().everyHours(1).create();
    });
    ui.alert('✅ Time Triggers Installed',
      'runSemanticSweeper() and sweepRootForExhaust() run hourly.\nApps Script editor → Triggers to adjust.',
      ui.ButtonSet.OK);
  } catch (e) { _reportError('setupTimeTriggers', e, ui); }
}

function setupRoutingProperties() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  function fetchId(name, isFolder) {
    const it = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
    if (it.hasNext()) return it.next().getId();
    console.error(`NOT FOUND: [${name}]`); return null;
  }
  const map = {
    'ID_01_1_SCRIPTS':fetchId('01.1_SCRIPTS',true),'ID_01_2_SOP_AND_FLOWS':fetchId('01.2_SOP_AND_FLOWS',true),
    'ID_01_3_SMP_PROPOSALS':fetchId('01.3_SMP_PROPOSALS',true),'ID_02_COUNCIL_ALIGNMENTS':fetchId('02_Council_Alignments',true),
    'ID_03_DYNAMIC_STATE':fetchId('03_Dynamic_State',true),'ID_03_1_CURRENT_STATE':fetchId('03.1_CURRENT_STATE',true),
    'ID_03_2_PIVOTS':fetchId('03.2_PIVOTS_AND_LESSONS',true),'ID_03_3_PROCESSED':fetchId('03.3_PROCESSED_EXHAUST',true),
    'ID_00_RAW_EXHAUST':fetchId('03.4_RAW_EXHAUST',true),'ID_04_COUNCIL_LOGS':fetchId('04_Council_Logs',true),
    'ID_04_1_ARCHITECT':fetchId('04.1_ARCHITECT_SILO',true),'ID_04_2_AUDITOR':fetchId('04.2_AUDITOR_SILO',true),
    'ID_04_3_MUSE':fetchId('04.3_MUSE_SILO',true),'ID_04_4_DEVELOPER':fetchId('04.4_DEVELOPER_SILO',true),
    'ID_04_5_ALIGNER':fetchId('04.5_ALIGNER_SILO',true),'ID_04_6_CURATOR':fetchId('04.6_CURATOR_SILO',true),
    'ID_04_7_RTP':fetchId('04.7_RTP_SILO',true),'ID_04_8_GRAVEYARD':fetchId('04.8_COG_GRAVEYARD',true),
    'ID_05_VECTOR_REPOSITORY':fetchId('05_Vector_Repository',true),'ID_06_1_LESSON_PLANS':fetchId('06.1_LESSON_PLANS',true),
    'ID_06_2_STUDENT_FACING':fetchId('06.2_STUDENT_FACING',true),'ID_06_3_ASSESSMENTS':fetchId('06.3_ASSESSMENTS',true),
    'ID_06_4_COMMUNICATIONS':fetchId('06.4_COMMUNICATIONS',true),'ID_07_MEMORY_VAULT':fetchId('07_Memory_Vault',true),
    'ID_08_PROJECT_AUTOPSIES':fetchId('08_Project_Autopsies',true),'ID_CCPS_MASTER_TEMPLATES':fetchId('CCPS_MASTER_TEMPLATES',true),
    'FOLDER_ID':fetchId('03.4_RAW_EXHAUST',true),'INDEX_ID':fetchId('BRAIN_TRUST_INDEX',false),
    'ID_CURRENT_STATE':fetchId('CURRENT_STATE',false),'ID_PIVOTS_AND_LESSONS':fetchId('PIVOTS_AND_LESSONS_V1.0',false),
  };
  let ok = 0, miss = 0;
  Object.entries(map).forEach(([k, id]) => { if (id) { props.setProperty(k, id); ok++; } else miss++; });
  ui.alert('Setup Routing Properties', miss === 0 ? `✅ All ${ok} properties registered.` : `⚠ ${ok} ok, ${miss} missing — check execution log.`, ui.ButtonSet.OK);
}

function runSemanticSweeper() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { ui.alert('Sweeper Busy', 'Already running.', ui.ButtonSet.OK); return; }
  try {
    const props = PropertiesService.getScriptProperties();
    const files = DriveApp.getRootFolder().getFiles();
    const tagMap = {
      'CE-CODE':CFG.KNOWN_VECTORS,'CE-FLOW':props.getProperty('ID_01_2_SOP_AND_FLOWS'),
      'CE-SMP':props.getProperty('ID_01_3_SMP_PROPOSALS'),'CE-COG':props.getProperty('ID_02_COUNCIL_ALIGNMENTS'),
      'CE-STATE':props.getProperty('ID_03_DYNAMIC_STATE'),'CE-CURR':props.getProperty('ID_03_1_CURRENT_STATE'),
      'CE-PIVOT':props.getProperty('ID_03_2_PIVOTS'),'CE-PROC':props.getProperty('ID_03_3_PROCESSED'),
      'CE-LOG':props.getProperty('ID_04_COUNCIL_LOGS'),'CE-ARCH':props.getProperty('ID_04_1_ARCHITECT'),
      'CE-AUD':props.getProperty('ID_04_2_AUDITOR'),'CE-MUSE':props.getProperty('ID_04_3_MUSE'),
      'CE-DEV':props.getProperty('ID_04_4_DEVELOPER'),'CE-ALIGN':props.getProperty('ID_04_5_ALIGNER'),
      'CE-CUR':props.getProperty('ID_04_6_CURATOR'),'CE-RTP':props.getProperty('ID_04_7_RTP'),
      'CE-GRAVE':props.getProperty('ID_04_8_GRAVEYARD'),'CE-VECTOR':props.getProperty('ID_05_VECTOR_REPOSITORY'),
      'CE-PRD':props.getProperty('ID_06_1_LESSON_PLANS'),'CE-LESSON':props.getProperty('ID_06_2_STUDENT_FACING'),
      'CE-RUBRIC':props.getProperty('ID_06_3_ASSESSMENTS'),'CE-COMM':props.getProperty('ID_06_4_COMMUNICATIONS'),
      'CE-VAULT':props.getProperty('ID_07_MEMORY_VAULT'),'CE-AUTOPSY':props.getProperty('ID_08_PROJECT_AUTOPSIES'),
      'CE-TEMPLATE':props.getProperty('ID_CCPS_MASTER_TEMPLATES'),
      'CE-CODE':props.getProperty('ID_01_1_SCRIPTS'),
      'KOS:':props.getProperty('ID_00_RAW_EXHAUST'),'CE:':props.getProperty('ID_00_RAW_EXHAUST'),
    };
    let ledger = null;
    const idx = DriveApp.getFilesByName(CFG.INDEX_NAME);
    if (idx.hasNext()) ledger = _getOrCreateSheet(SpreadsheetApp.openById(idx.next().getId()), 'EXECUTION_LEDGER');
    let routed = 0, skipped = 0, noTag = 0, nullId = 0;
    while (files.hasNext()) {
      const file = files.next(), name = file.getName();
      if (name.indexOf('[UID_DOC_') > -1) { skipped++; continue; }
      let matched = null, folderId = null;
      for (const tag in tagMap) {
        if (name.startsWith(tag + ':') || name.startsWith(tag + ' ')) {
          folderId = tagMap[tag]; matched = tag; break;
        }
      }
      if (!matched) { noTag++; continue; }
      if (!folderId || Array.isArray(folderId)) { nullId++; continue; }
      const uid = '[UID_DOC_' + new Date().getTime() + ']';
      file.setName(`${uid} ${name}`);
      file.moveTo(DriveApp.getFolderById(folderId));
      if (ledger) ledger.appendRow([uid, new Date(), matched, file.getUrl(), 'ROUTED']);
      routed++; SpreadsheetApp.flush();
    }
    ui.alert('✅ Sweep Complete', `Routed: ${routed} | Skipped (UID): ${skipped} | No tag: ${noTag} | Null pointer: ${nullId}`, ui.ButtonSet.OK);
  } catch (e) { _reportError('runSemanticSweeper', e, ui); }
  finally { lock.releaseLock(); }
}

function sweepRootForExhaust() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const props   = PropertiesService.getScriptProperties();
    const exId    = props.getProperty('ID_00_RAW_EXHAUST');
    if (!exId) throw new Error('ID_00_RAW_EXHAUST missing. Run Setup Routing Properties.');
    const exFolder = DriveApp.getFolderById(exId);
    const docs     = DriveApp.getRootFolder().getFilesByType(MimeType.GOOGLE_DOCS);
    let count = 0;
    while (docs.hasNext()) {
      const f = docs.next(), n = f.getName();
      if (n.indexOf('UID_') === -1 && n.indexOf('CE:') !== -1) {
        f.setName(`[UID_RAW_${new Date().getTime()}] ${n}`);
        f.moveTo(exFolder); count++; SpreadsheetApp.flush();
      }
    }
    ui.alert('✅ Exhaust Sweep', count > 0 ? `Swept ${count} CE: doc(s) to RAW_EXHAUST.` : 'No CE: docs found in root.', ui.ButtonSet.OK);
  } catch (e) { _reportError('sweepRootForExhaust', e, ui); }
  finally { lock.releaseLock(); }
}

function archiveStagingPipeline() {
  const ui = DocumentApp.getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    let   archive = ss.getSheetByName('STAGING_ARCHIVE');
    if (!archive) {
      archive = ss.insertSheet('STAGING_ARCHIVE');
      archive.appendRow(['Archived_At','Timestamp','LOG_UUID','Raw_Pointer','Status','Payload']);
      archive.getRange('1:1').setFontWeight('bold').setBackground('#f0e2d5');
      archive.setFrozenRows(1);
    }
    const terminal = ['PARTITIONED','CONSOLIDATED','INTAKE_PROCESSED','PHASE_2_ERROR','INTAKE_ERROR'];
    const data = staging.getDataRange().getValues();
    const now  = new Date();
    let   done = 0;
    for (let i = data.length-1; i >= 1; i--) {
      if (terminal.some(s => String(data[i][3]).startsWith(s))) {
        archive.appendRow([now, ...data[i]]);
        staging.deleteRow(i+1); done++;
      }
    }
    SpreadsheetApp.flush();
    ui.alert('✅ Archive Complete', `Archived ${done} row(s) → STAGING_ARCHIVE.`, ui.ButtonSet.OK);
  } catch (e) { _reportError('archiveStagingPipeline', e, ui); }
}


// ══════════════════════════════════════════════════════════════
// PART 13: KOS LICENSE & SOCRATIC ONBOARDING
// ══════════════════════════════════════════════════════════════
function _coldEngineGate(callerFunction, tier) {
  const props    = PropertiesService.getScriptProperties();
  const isCold   = !props.getProperty('IDENTITY_KEY') || props.getProperty(CFG.PROP.THESIS_VERIFIED) !== 'true';
  if (!isCold) return;
  if (tier === 'TIER_2') {
    let ui; try { ui = DocumentApp.getUi(); } catch (_) {}
    if (ui) ui.alert('🔒 Engine COLD — Access Blocked',
      `${callerFunction} requires an armed Identity Key.\n\nRun 🧠 Council → Begin Socratic Onboarding to activate.`,
      ui.ButtonSet.OK);
    throw new Error(`[COLD_ENGINE_TIER_2] ${callerFunction} blocked. Run Socratic Onboarding.`);
  }
  if (tier === 'TIER_1') {
    let ui; try { ui = DocumentApp.getUi(); } catch (_) { return; }
    const go = ui.alert('⚠ Engine COLD',
      `The engine is not yet armed. ${callerFunction} will run but vector scoring will be inactive.\n\nContinue anyway?`,
      ui.ButtonSet.YES_NO);
    if (go !== ui.Button.YES) throw new Error(`[COLD_ENGINE_TIER_1] ${callerFunction} cancelled.`);
  }
}

function runSocraticOnboarding() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true') {
    const restart = ui.alert('Onboarding Complete',
      `Engine is armed. Day ${props.getProperty(CFG.PROP.ONBOARDING_DAY)||1} of ${CFG.ONBOARDING_DAYS}.\n\nRestart and reset your thesis?`,
      ui.ButtonSet.YES_NO);
    if (restart !== ui.Button.YES) return;
    ['IDENTITY_KEY', CFG.PROP.THESIS_VERIFIED, CFG.PROP.ONBOARDING_DAY, CFG.PROP.ONBOARDING_START]
      .forEach(k => props.deleteProperty(k));
  }
  ui.alert('🧠 Welcome to KOS Socratic Onboarding',
    '8 questions. ~10 minutes.\n\nThe system ships with no philosophy pre-installed.\nWhat you define here is yours alone — it cannot be replicated without your answers and passphrase.\n\nYou can cancel at any time and resume later.',
    ui.ButtonSet.OK);
  const a = {};
  const ask = (step, title, body) => {
    const r = ui.prompt(`Step ${step} of ${CFG.TOTAL_ONBOARDING_STEPS} — ${title}`, body, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return null;
    return r.getResponseText().trim() || null;
  };
  a.role = ask(1, 'WHAT IS YOUR ROLE?', 'Your primary role or domain.\nExamples: Marketing Teacher, Business Coach, Software Developer, Non-Profit Director');
  if (!a.role) return ui.alert('Paused', 'Resume anytime with 🧠 Council → Begin Socratic Onboarding.', ui.ButtonSet.OK);
  a.audience = ask(2, 'WHO DO YOU SERVE?', 'The people whose growth your work directly affects.\nExamples: High school students, Small business owners, Corporate teams');
  if (!a.audience) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);
  a.adminGhost = ask(3, 'NAME YOUR ADMIN GHOST', 'What does administrative drag steal from you specifically, and how many hours per week?\nExamples: Grading formatting 4hr/wk. Parent email management 3hr/wk.');
  if (!a.adminGhost) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);
  a.struggle = ask(4, 'THE NECESSARY STRUGGLE', 'What cognitive friction do you REFUSE to automate — the difficulty that produces real growth?\nExamples: Students must write their own business plan. Clients must make their own pricing decisions.');
  if (!a.struggle) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);
  a.targets = ask(5, 'RELATIONAL TARGETS', 'Your top 3-5 Carbon-to-Carbon relationships (comma separated).\nThese are the people this system exists to protect time for.');
  if (!a.targets) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);
  a.vision = ask(6, '90-DAY VISION', 'In one sentence: what does success look like in 90 days if the KOS is working perfectly?\nBe specific. Vague visions produce vague results.');
  if (!a.vision) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);
  a.salt = ask(7, 'IDENTITY KEY PASSPHRASE',
    '⚠ CRITICAL — READ CAREFULLY\n\nCreate a private passphrase (anything you will remember).\nThis combines with your thesis to generate a unique Identity Key.\n\nYOU WILL NOT BE ASKED AGAIN. Write it down first.');
  if (!a.salt) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);
  props.setProperty('IDENTITY_KEY_SALT', a.salt);
  const deployTypes = ['INDIVIDUAL','EDUCATOR','COMMERCIAL'];
  a.deployType = ask(8, 'DEPLOYMENT TYPE',
    'License: Polyform Noncommercial 1.0.0 — free for noncommercial use.\nCommercial use: honor system with attribution.\n\nType one of: INDIVIDUAL, EDUCATOR, COMMERCIAL');
  if (!a.deployType) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);
  const dt = deployTypes.includes((a.deployType||'').toUpperCase()) ? a.deployType.toUpperCase() : 'INDIVIDUAL';
  props.setProperty(CFG.PROP.DEPLOYMENT_TYPE, dt);
  props.setProperty(CFG.PROP.OPERATOR_ROLE,      a.role);
  props.setProperty(CFG.PROP.OPERATOR_AUDIENCE,  a.audience);
  props.setProperty(CFG.PROP.ADMIN_GHOST,         a.adminGhost);
  props.setProperty(CFG.PROP.NECESSARY_STRUGGLE,  a.struggle);
  props.setProperty(CFG.PROP.RELATIONAL_TARGETS,  a.targets);
  props.setProperty(CFG.PROP.VISION_90_DAY,       a.vision);
  Object.entries(_inferCalibrationWeights(a.role)).forEach(([k,v]) => { if (!props.getProperty(k)) props.setProperty(k, String(v)); });
  _seedCoreThesisDoc(a, dt);
  generateIdentityKey();
  props.setProperty(CFG.PROP.THESIS_VERIFIED, 'true');
  props.setProperty(CFG.PROP.ONBOARDING_DAY,  '1');
  props.setProperty(CFG.PROP.ONBOARDING_START, new Date().toISOString());
  _logOnboardingDay(1, 'SEALED', a.vision);
  ui.alert('✅ Engine Armed — Onboarding Complete',
    `Deployment: ${dt}\nRelational Targets: ${a.targets}\n\nYour 90-Day Vision:\n"${a.vision}"\n\nNEXT STEPS:\n1. 🧠 Council → Build Session Context\n2. Paste context into a new Gem session\n3. Run your first session → ① Process Session Log\n\nDay 1 of ${CFG.ONBOARDING_DAYS}. The system is live.`,
    ui.ButtonSet.OK);
}

function _inferCalibrationWeights(role) {
  const r = (role||'').toLowerCase();
  const w = { THEME_ARCHITECTURE:'0.75', THEME_PEDAGOGY:'0.75', THEME_FAMILY_ALIGNMENT:'0.75', SOCRATIC_THRESHOLD:'0.75' };
  if (/teach|educat|curriculum|instruc|tutor|profess/.test(r)) {
    w.THEME_PEDAGOGY='0.92'; w.THEME_FAMILY_ALIGNMENT='0.88'; w.THEME_ARCHITECTURE='0.72'; w.SOCRATIC_THRESHOLD='0.80';
  } else if (/coach|business|sales|market|consult|entrepreneur/.test(r)) {
    w.THEME_FAMILY_ALIGNMENT='0.92'; w.THEME_PEDAGOGY='0.68'; w.THEME_ARCHITECTURE='0.78'; w.SOCRATIC_THRESHOLD='0.72';
  } else if (/develop|engineer|code|software|technical|architect/.test(r)) {
    w.THEME_ARCHITECTURE='0.90'; w.THEME_PEDAGOGY='0.55'; w.THEME_FAMILY_ALIGNMENT='0.70'; w.SOCRATIC_THRESHOLD='0.70';
  } else if (/nonprofit|community|social|advocate|director/.test(r)) {
    w.THEME_FAMILY_ALIGNMENT='0.95'; w.THEME_PEDAGOGY='0.80'; w.THEME_ARCHITECTURE='0.65'; w.SOCRATIC_THRESHOLD='0.78';
  }
  return w;
}

function _seedCoreThesisDoc(a, deployType) {
  try {
    const props = PropertiesService.getScriptProperties();
    let id = props.getProperty('ID_CORE_THESIS');
    if (!id) { const f = DriveApp.getFilesByName('CORE_THESIS'); if (f.hasNext()) { id = f.next().getId(); props.setProperty('ID_CORE_THESIS', id); } }
    if (!id) return;
    const doc  = DocumentApp.openById(id);
    const body = doc.getBody();
    body.clear();
    [
      { h1: 'CORE THESIS' },
      { h3: `Sealed: ${new Date().toLocaleDateString()}  |  Deployment: ${deployType}  |  KOS v${CFG.SYSTEM_VERSION}` },
      { hr: true },
      { h2: 'Primary Role' },    { p: a.role },
      { h2: 'Who I Serve' },     { p: a.audience },
      { h2: 'The Admin Ghost' }, { p: a.adminGhost },
      { h2: 'The Necessary Struggle' }, { p: a.struggle },
      { h2: 'Relational Targets (Carbon-to-Carbon)' }, { p: a.targets },
      { h2: '90-Day Vision' },   { p: a.vision },
      { hr: true },
      { h2: 'License' },
      { p: `${CFG.LICENSE_TYPE}\nDeployment: ${deployType}\nAuthor: ${CFG.AUTHOR}\nFidelity Clause: preserve PERSONA_ALIGNMENT and HITL Firewall in any adaptation.` },
    ].forEach(s => {
      if (s.h1) body.appendParagraph(s.h1).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      else if (s.h2) body.appendParagraph(s.h2).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      else if (s.h3) body.appendParagraph(s.h3).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      else if (s.p) body.appendParagraph(String(s.p));
      else if (s.hr) body.appendHorizontalRule();
    });
    doc.saveAndClose();
  } catch (e) { console.error('[Onboarding] Could not seed CORE_THESIS: ' + e.toString()); }
}

function checkOnboardingProgress() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const day   = parseInt(props.getProperty(CFG.PROP.ONBOARDING_DAY) || '0');
  const armed = props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true';
  if (!armed) {
    ui.alert('🔒 Engine COLD', 'Thesis not verified.\n\nRun 🧠 Council → Begin Socratic Onboarding.', ui.ButtonSet.OK); return;
  }
  const phase = day<=7 ? '1: Foundation (Days 1-7)' : day<=14 ? '2: Calibration (Days 8-14)' : '3: Activation (Days 15-21)';
  const bar   = '█'.repeat(Math.min(day,21)) + '░'.repeat(Math.max(0,21-day));
  ui.alert(`Onboarding Progress — Day ${day} of ${CFG.ONBOARDING_DAYS}`,
    `[${bar}] ${Math.round(day/21*100)}%\nPhase: ${phase}\n\n` +
    `Role: ${props.getProperty(CFG.PROP.OPERATOR_ROLE)||'Not set'}\n` +
    `Deployment: ${props.getProperty(CFG.PROP.DEPLOYMENT_TYPE)||'Not set'}\n\n` +
    `90-Day Vision:\n"${props.getProperty(CFG.PROP.VISION_90_DAY)||'Not defined'}"\n\n` +
    `Relational Targets:\n${props.getProperty(CFG.PROP.RELATIONAL_TARGETS)||'Not defined'}\n\n` +
    `── 3-HORIZON ROI MAP ──\n` +
    `Horizon 1 (90 sec)  Deploy infrastructure          ✔ COMPLETE\n` +
    `Horizon 2 (10 min)  First session ingestion        ${day>=1?'✔ COMPLETE':'○ PENDING'}\n` +
    `Horizon 3 (21 day)  Full cognitive alignment       ${day>=21?'✔ COMPLETE':day+'/21'}`,
    ui.ButtonSet.OK);
}

function _advanceOnboardingDay() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(CFG.PROP.THESIS_VERIFIED) !== 'true') return;
  const cur = parseInt(props.getProperty(CFG.PROP.ONBOARDING_DAY)||'1');
  if (cur < CFG.ONBOARDING_DAYS) {
    props.setProperty(CFG.PROP.ONBOARDING_DAY, String(cur+1));
    _logOnboardingDay(cur+1, 'SESSION_COMPLETE', '');
  }
}

function _logOnboardingDay(day, event, note) {
  try {
    const id = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (!id) return;
    const ss = SpreadsheetApp.openById(id);
    let t    = ss.getSheetByName(CFG.ONBOARDING_SHEET);
    if (!t) {
      t = ss.insertSheet(CFG.ONBOARDING_SHEET);
      t.appendRow(['Day','Date','Event','Note','Vision_90_Day']);
      t.getRange('1:1').setFontWeight('bold').setBackground('#e8d5f0');
      t.setFrozenRows(1);
    }
    t.appendRow([day, new Date(), event, note||'', PropertiesService.getScriptProperties().getProperty(CFG.PROP.VISION_90_DAY)||'']);
  } catch (e) { console.warn('[Onboarding] Log failed: ' + e.message); }
}

function getRelationalTargets() {
  const raw = PropertiesService.getScriptProperties().getProperty(CFG.PROP.RELATIONAL_TARGETS) || '';
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

function updateRelationalTargets() {
  const ui = DocumentApp.getUi();
  const r  = ui.prompt('Update Relational Targets',
    'List your Carbon-to-Carbon relationships (comma separated).\nThese are the people this system exists to protect time for.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const t = r.getResponseText().trim();
  if (t) { PropertiesService.getScriptProperties().setProperty(CFG.PROP.RELATIONAL_TARGETS, t); ui.alert('✅ Updated', t, ui.ButtonSet.OK); }
}


// ══════════════════════════════════════════════════════════════
// PART 14: SESSION CONTEXT BUILDER
// ══════════════════════════════════════════════════════════════
function buildSessionContext() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  try {
    _coldEngineGate('buildSessionContext', 'TIER_2');
    const sections = [], loaded = [];

    const readDoc = (id, label, maxChars) => {
      if (!id) return;
      try {
        const text = DocumentApp.openById(id).getBody().getText();
        if (text.length > 50) {
          sections.push(`## ${label}\n` + text.substring(0, maxChars) + (text.length > maxChars ? '\n[...truncated...]' : ''));
          loaded.push(label);
        }
      } catch (_) { console.warn(`Could not load ${label}`); }
    };

    readDoc(props.getProperty('ID_CORE_THESIS'),      'CORE_THESIS',         1500);
    readDoc(props.getProperty('ID_PIVOTS_AND_LESSONS'),'PIVOTS_AND_LESSONS',  2000);

    const manFiles = DriveApp.getFilesByName('RTP_USER_MANUAL_v1.0');
    if (manFiles.hasNext()) readDoc(manFiles.next().getId(), 'RTP_USER_MANUAL v1.0', 1200);

    // Vector Primer
    try {
      const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
      const matrix = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
      if (matrix.getLastRow() > 1) {
        const h = matrix.getRange(1,1,1,matrix.getLastColumn()).getValues()[0];
        const r = matrix.getRange(matrix.getLastRow(),1,1,matrix.getLastColumn()).getValues()[0];
        let primer = '## VECTOR_MATRIX — STARTUP CALIBRATION\n';
        h.slice(2).forEach((t,i) => { primer += `  ${String(t).padEnd(22)} ${r[i+2]}\n`; });
        sections.push(primer);
        loaded.push('BRAIN_TRUST_INDEX (Vector Primer)');
      }
    } catch (_) {}

    // Relational Targets
    const targets = getRelationalTargets();
    if (targets.length > 0) {
      sections.push('## RELATIONAL TARGETS (Protect These Relationships)\n' + targets.map((t,i) => `${i+1}. ${t}`).join('\n'));
    }

    const block =
      `[🧠 RTP — SESSION CONTEXT INJECTION]\n` +
      `Assembled: ${new Date().toLocaleString()}\n` +
      `Active Files: ${loaded.join(', ')}\n` +
      `Operator: ${props.getProperty(CFG.PROP.OPERATOR_ROLE)||'Unknown'}\n` +
      `Onboarding Day: ${props.getProperty(CFG.PROP.ONBOARDING_DAY)||'?'} of ${CFG.ONBOARDING_DAYS}\n` +
      `\n${'═'.repeat(50)}\n\n` +
      sections.join('\n\n' + '─'.repeat(50) + '\n\n') +
      `\n\n${'═'.repeat(50)}\n` +
      `[END CONTEXT INJECTION — Paste this entire block at the top of a new Gem session.\n` +
      `The Gem will respond with a [🧠 RTP — PRE-FLIGHT] header.]`;

    const doc  = DocumentApp.getActiveDocument();
    const body = doc.getBody();
    body.clear();
    (body.getParagraphs()[0] || body.appendParagraph('')).setText(block);

    ui.alert('✅ Session Context Built',
      `Loaded: ${loaded.join(', ')}\n\nContext block is now in this document.\nCopy it and paste it at the top of a new Gem session.\n\n⚠ Do NOT run ① Process Session Log on this document — it is an outbound context block, not an inbound log.`,
      ui.ButtonSet.OK);
  } catch (e) { _reportError('buildSessionContext', e, ui); }
}


// ══════════════════════════════════════════════════════════════
// PART 15: CALIBRATION, SOVEREIGN HELPERS & DIAGNOSTICS
// ══════════════════════════════════════════════════════════════

/**
 * HARDENER — fill in values, run once, clear values, confirm with auditCalibrationHealth().
 * PIVOT 008: values are NEVER hardcoded. This function is the single loading point.
 */
function setupCalibration() {
  const props = PropertiesService.getScriptProperties();
  // ── FILL IN YOUR VALUES BELOW ─────────────────────────────
  const calibrationMap = {
    'THEME_ARCHITECTURE':    'YOUR_WEIGHT_HERE',   // e.g. '0.85'
    'THEME_PEDAGOGY':        'YOUR_WEIGHT_HERE',   // e.g. '0.90'
    'THEME_FAMILY_ALIGNMENT':'YOUR_WEIGHT_HERE',   // e.g. '1.00'
    'SOCRATIC_THRESHOLD':    'YOUR_WEIGHT_HERE',   // e.g. '0.75'
    'IDENTITY_KEY_SALT':     'YOUR_PRIVATE_STRING_HERE',
  };
  // ── CLEAR VALUES AFTER RUNNING ────────────────────────────
  props.setProperties(calibrationMap);
  console.log('[HARDENING_COMPLETE] Weights sequestered. Clear this function body now.');
}

function auditCalibrationHealth() {
  const ui     = DocumentApp.getUi();
  const status = _getCalibrationStatus();
  if (!status.armed) {
    ui.alert('⚠ Engine COLD',
      `No calibration data found.\n\nExpected keys:\n${CFG.CALIBRATION_KEYS.map(k=>'  • '+k).join('\n')}\n\nRun setupCalibration() or complete Socratic Onboarding.`,
      ui.ButtonSet.OK);
  } else {
    const missing = CFG.CALIBRATION_KEYS.filter(k => !PropertiesService.getScriptProperties().getProperty(k));
    ui.alert('Calibration Health',
      missing.length === 0
        ? `✅ Engine ARMED — ${status.count} key(s) verified.`
        : `⚠ PARTIAL — Missing:\n${missing.map(k=>'  • '+k).join('\n')}`,
      ui.ButtonSet.OK);
  }
}

function _getCalibrationStatus() {
  const props = PropertiesService.getScriptProperties();
  const found = CFG.CALIBRATION_KEYS.filter(k => props.getProperty(k) !== null);
  return { armed: found.length > 0, count: found.length };
}

function generateIdentityKey() {
  try {
    const props = PropertiesService.getScriptProperties();
    const salt  = props.getProperty('IDENTITY_KEY_SALT') || 'DEFAULT_SALT';
    let thesis  = '';
    const tid   = props.getProperty('ID_CORE_THESIS');
    if (tid) { try { thesis = DocumentApp.openById(tid).getBody().getText(); } catch (_) {} }
    if (!thesis) { const f = DriveApp.getFilesByName('CORE_THESIS'); if (f.hasNext()) thesis = DocumentApp.openById(f.next().getId()).getBody().getText(); }
    const combined = (thesis.substring(0, 500) + salt).trim();
    const key = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, combined)
      .map(b => (b<0?b+256:b).toString(16).padStart(2,'0')).join('').substring(0,16).toUpperCase();
    props.setProperty('IDENTITY_KEY', key);
    console.log('[IDENTITY_KEY_GENERATED] 16-char key derived and sequestered.');
    return key;
  } catch (e) { _reportError('generateIdentityKey', e, null); return null; }
}

function dumpAllProperties() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const all   = props.getProperties();
  const lines = [];
  const routingKeys = Object.keys(all).filter(k => !CFG.CALIBRATION_KEYS.includes(k) && k !== 'IDENTITY_KEY' && !k.startsWith('KOS_'));
  const calibKeys   = [...CFG.CALIBRATION_KEYS, 'IDENTITY_KEY'];
  const onboardKeys = Object.keys(all).filter(k => k.startsWith('KOS_'));
  lines.push('── ROUTING & ASSET POINTERS ──');
  routingKeys.sort().forEach(k => { const v = all[k]; lines.push(`${k.padEnd(30)} ${v?v.substring(0,28)+(v.length>28?'…':''):'⚠ NULL'}`); });
  lines.push('\n── CALIBRATION (values hidden — PIVOT 008) ──');
  calibKeys.forEach(k => lines.push(`${k.padEnd(30)} ${all[k]?'✔ SET':'⚠ NOT SET'}`));
  lines.push('\n── ONBOARDING STATE ──');
  onboardKeys.forEach(k => { const v = all[k]; lines.push(`${k.padEnd(30)} ${v?v.substring(0,30):'⚠ NOT SET'}`); });
  lines.push(`\nTotal keys: ${Object.keys(all).length}`);
  ui.alert('Properties Diagnostic', lines.join('\n'), ui.ButtonSet.OK);
}

function nuclearWipeForRelease() {
  const ui = DocumentApp.getUi();
  const ok = ui.alert('☢ NUCLEAR WIPE',
    'Permanently deletes ALL PropertiesService data:\n• Calibration weights & Identity Key\n• All folder/doc ID caches\n• Onboarding state & Relational Targets\n• SESSION_VECTOR_PRIMER\n\nIrreversible.\n\nProceed?',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteAllProperties();
  ui.alert('✅ Clean Sweep', 'All IP wiped. Re-run Deploy + Socratic Onboarding to restore.', ui.ButtonSet.OK);
}

function getKOSCalibration(key) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) console.error(`[CALIBRATION_ERROR] Missing: "${key}". Run setupCalibration().`);
  return val;
}

function runHardeningAudit(payload) {
  [
    { re: /weight\s*[:=]\s*0\.\d+/i,        label: 'Hardcoded weight value'    },
    { re: /threshold\s*[:=]\s*0\.\d+/i,     label: 'Hardcoded threshold value' },
    { re: /IDENTITY_KEY\s*[:=]\s*['"].+['"]/, label: 'Exposed identity key'    },
    { re: /SALT\s*[:=]\s*['"].+['"]/i,       label: 'Exposed salt string'      },
  ].forEach(({ re, label }) => {
    if (re.test(payload)) throw new Error(`[VULNERABILITY_DETECTED] ${label}. Aborted per PIVOT 008. Move to PropertiesService via setupCalibration().`);
  });
  return true;
}

function sevenBridgesReview() {
  DocumentApp.getUi().alert('🌉 SMP-002: Seven Bridges Reconciliation Protocol',
    'Status: PENDING USER APPROVAL\n\n3/7 TRIGGER: 3+ non-APPROVED verdicts halt execution.\nBRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog\'s verdict is VOID.\n\nTo approve:\n1. Open SMP-002 in 01.3_SMP_PROPOSALS\n2. Update Status to APPROVED\n3. Notify Developer to build the execution layer.',
    DocumentApp.getUi().ButtonSet.OK);
}

function checkLicenseCompliance() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  ui.alert('KOS License Information',
    `License: ${CFG.LICENSE_TYPE}\nAuthor:  ${CFG.AUTHOR}\nSystem:  KOS v${CFG.SYSTEM_VERSION}\n\n` +
    `Free for noncommercial use. Commercial use: honor system with attribution.\n\n` +
    `THE FIDELITY CLAUSE (commercial deployments):\n  • Preserve PERSONA_ALIGNMENT\n  • Preserve the HITL Firewall\n  • Attribution: "Built on KOS by ${CFG.AUTHOR}"\n\n` +
    `Your deployment: ${props.getProperty(CFG.PROP.DEPLOYMENT_TYPE)||'NOT DECLARED'}\n` +
    `Engine status:  ${props.getProperty(CFG.PROP.THESIS_VERIFIED)==='true'?'✔ ARMED':'⚠ COLD — run Socratic Onboarding'}\n\n` +
    `Full license: https://polyformproject.org/licenses/noncommercial/1.0.0/`,
    ui.ButtonSet.OK);
}

function verifyFidelityClause() {
  const ui      = DocumentApp.getUi();
  const props   = PropertiesService.getScriptProperties();
  const results = [];
  let   pass    = true;
  const cid     = props.getProperty('ID_02_COUNCIL_ALIGNMENTS');
  if (cid) {
    try {
      const f = DriveApp.getFolderById(cid).getFilesByName(CFG.FIDELITY_REQUIRED_PERSONA);
      f.hasNext() ? results.push(`✔ ${CFG.FIDELITY_REQUIRED_PERSONA} found`) : (results.push(`❌ ${CFG.FIDELITY_REQUIRED_PERSONA} MISSING`), pass=false);
    } catch (_) { results.push('⚠ Could not verify Council Alignments'); pass=false; }
  } else { results.push('⚠ Council Alignments folder not registered'); pass=false; }
  const iid = props.getProperty('INDEX_ID');
  if (iid) {
    try {
      const ss    = SpreadsheetApp.openById(iid);
      const board = ss.getSheetByName(CFG.FIDELITY_REQUIRED_SHEET);
      const trig  = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'onGovernanceEdit');
      results.push(board ? `✔ ${CFG.FIDELITY_REQUIRED_SHEET} sheet found` : `❌ ${CFG.FIDELITY_REQUIRED_SHEET} MISSING`);
      results.push(trig ? '✔ Governance trigger active' : '⚠ Governance trigger not installed');
      if (!board) pass=false;
    } catch (_) { results.push('⚠ Could not access BRAIN_TRUST_INDEX'); pass=false; }
  }
  const dt = props.getProperty(CFG.PROP.DEPLOYMENT_TYPE)||'NOT DECLARED';
  results.push(`\nDeployment: ${dt}`);
  if (dt === 'COMMERCIAL') { results.push('ℹ Fidelity Clause is MANDATORY for commercial use'); results.push('ℹ Attribution required: "Built on KOS by ' + CFG.AUTHOR + '"'); }
  ui.alert('Fidelity Clause Verification', `${pass?'✅ COMPLIANT':'❌ VIOLATIONS FOUND'}\n\n${results.join('\n')}`, ui.ButtonSet.OK);
}

function generateLicenseReport() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  try {
    const ts = new Date().toLocaleDateString().replace(/\//g,'-');
    const doc  = DocumentApp.create(`KOS_LICENSE_REPORT_${ts}`);
    const body = doc.getBody();
    body.clear();
    _scaffoldDoc(`KOS_LICENSE_REPORT_${ts}`, DriveApp.getRootFolder(), []); // placeholder
    [
      { h1: 'KOS LICENSE COMPLIANCE REPORT' },
      { h3: `Generated: ${new Date().toLocaleDateString()}  |  KOS v${CFG.SYSTEM_VERSION}` },
      { hr: true },
      { h2: 'License' }, { p: `Type: ${CFG.LICENSE_TYPE}\nAuthor: ${CFG.AUTHOR}\nhttps://polyformproject.org/licenses/noncommercial/1.0.0/` },
      { h2: 'Operator' }, { p: `Role: ${props.getProperty(CFG.PROP.OPERATOR_ROLE)||'Not set'}\nDeployment: ${props.getProperty(CFG.PROP.DEPLOYMENT_TYPE)||'Not set'}\nOnboarding: Day ${props.getProperty(CFG.PROP.ONBOARDING_DAY)||'0'} of ${CFG.ONBOARDING_DAYS}\nIdentity Key: ${props.getProperty('IDENTITY_KEY')?'✔ SET':'⚠ NOT SET'}\nCore Thesis: ${props.getProperty(CFG.PROP.THESIS_VERIFIED)==='true'?'✔ VERIFIED':'⚠ NOT VERIFIED'}` },
      { h2: 'Fidelity Clause' }, { p: `1. PERSONA_ALIGNMENT must be preserved\n2. HITL Firewall must remain functional\n3. Attribution: "Built on KOS by ${CFG.AUTHOR}"` },
      { h2: '90-Day Vision' }, { p: props.getProperty(CFG.PROP.VISION_90_DAY)||'Not defined' },
      { h2: 'Relational Targets' }, { p: props.getProperty(CFG.PROP.RELATIONAL_TARGETS)||'Not defined' },
    ].forEach(s => {
      if (s.h1) body.appendParagraph(s.h1).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      else if (s.h2) body.appendParagraph(s.h2).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      else if (s.h3) body.appendParagraph(s.h3).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      else if (s.p) body.appendParagraph(String(s.p));
      else if (s.hr) body.appendHorizontalRule();
    });
    doc.saveAndClose();
    const f01 = DriveApp.getFoldersByName('01_Canonical_Foundation');
    if (f01.hasNext()) DriveApp.getFileById(doc.getId()).moveTo(f01.next());
    ui.alert('✅ License Report Generated', `KOS_LICENSE_REPORT_${ts}\nSaved to 01_Canonical_Foundation.`, ui.ButtonSet.OK);
  } catch (e) { _reportError('generateLicenseReport', e, ui); }
}


// ══════════════════════════════════════════════════════════════
// PART 16: SHARED UTILITIES
// ══════════════════════════════════════════════════════════════
function _generateLogUUID(text) {
  const ts   = new Date().getTime();
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
    .map(b => (b<0?b+256:b).toString(16).padStart(2,'0')).join('').substring(0,8);
  return `LOG-${ts}-${hash}`;
}

function _semanticChunker(text) {
  const splits = text.split(CFG.DELIMITER);
  const chunks = [];
  let cur = '';
  splits.forEach((s, i) => {
    if (!s.trim()) return;
    const block = (i===0 && !text.startsWith(CFG.DELIMITER)) ? s : CFG.DELIMITER + s;
    if ((cur.length + block.length) > CFG.MAX_CHUNK_SIZE) {
      if (cur) chunks.push(cur.trim());
      cur = block;
    } else { cur += (cur ? '\n\n' : '') + block; }
  });
  if (cur) chunks.push(cur.trim());
  return chunks.length ? chunks : [text];
}

function _resetDropZone(body) {
  body.clear();
  const ps = body.getParagraphs();
  const p  = ps.length > 0 ? ps[0] : body.appendParagraph('');
  p.setText(CFG.GUARD_TXT);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  p.setForegroundColor('#808080');
  body.appendParagraph('');
}

function _getSystemAsset(name, propKey, isFolder) {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty(propKey);
  if (id) { try { return isFolder ? DriveApp.getFolderById(id) : SpreadsheetApp.openById(id); } catch (_) {} }
  const it = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
  if (!it.hasNext()) throw new Error(`Asset Not Found: "${name}". Run 🚀 Deploy first.`);
  const asset = it.next();
  props.setProperty(propKey, asset.getId());
  return isFolder ? asset : SpreadsheetApp.openById(asset.getId());
}

function _getOrCreateDoc(docName, folder) {
  const existing = folder.getFilesByName(docName);
  if (existing.hasNext()) return DocumentApp.openById(existing.next().getId());
  const doc = DocumentApp.create(docName);
  DriveApp.getFileById(doc.getId()).moveTo(folder);
  return doc;
}

function _getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  const H = {
    [CFG.STAGING_SHEET]:         ['Timestamp','LOG_UUID','Raw_Pointer','Status','Payload'],
    'EXECUTION_LEDGER':          ['UID','TIMESTAMP','SEMANTIC_TAG','FILE_URL','STATUS','ATTEMPT_TRACKER'],
    [CFG.INFERENCE_BUFFER_SHEET]:['Timestamp','Session_ID','Chunk_ID','Inference_Payload','Status'],
    [CFG.MATRIX_LEDGER_SHEET]:   ['Session_UID','Timestamp','ARCHITECTURE','UI','SECURITY','PEDAGOGY','TOTAL'],
    [CFG.DYNAMIC_STATE_MATRIX]:  ['Session_UID','Timestamp','Theme','Raw_Score','Decayed_Score','Session_Count','Promoted'],
    [CFG.BLACKBOARD_SHEET]:      ['Target_Doc_ID','CE_Tag','Doc_Title','Version','Find_String','Replace_Payload','Alt_Doc_ID','Notes','Filed_By','Filed_Date','Status','Deploy_Trigger'],
    [CFG.ACTION_REGISTER_SHEET]: ['Session_UID','Timestamp','Type','Item','Owner','Protected_Time_Risk','Status'],
    [CFG.SESSION_LOG_SHEET]:     ['Session_UID','Timestamp','Session_Type','Cold_Start','RTP_Version','Session_Summary'],
    [CFG.COG_REGISTRY_SHEET]:    ['Session_UID','Timestamp','Cog','Final_Status','Summary'],
    [CFG.VECTOR_MATRIX_SHEET]:   ['Session_UID','Timestamp',...CFG.KNOWN_VECTORS,'INCUBATOR_SIGNALS'],
    [CFG.INCUBATOR_SHEET]:       ['Theme','First_Seen','Last_Seen','Session_Count','Avg_Weight','Status'],
    [CFG.ONBOARDING_SHEET]:      ['Day','Date','Event','Note','Vision_90_Day'],
  };
  const headers = H[name] || ['Timestamp','Data'];
  sheet.appendRow(headers);
  sheet.getRange('1:1').setFontWeight('bold').setBackground('#e2e8f0');
  sheet.setFrozenRows(1);
  return sheet;
}

function _getOrCreateSpreadsheet(name, parentFolder) {
  const files = parentFolder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId());
  }
  const ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
  return ss;
}

function _getOrCreateFolder(name, parent) {
  const p = parent || DriveApp.getRootFolder();
  const e = p.getFoldersByName(name);
  return e.hasNext() ? e.next() : p.createFolder(name);
}

function _findFolder(name, parent) {
  if (!parent) return null;
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function _reportError(context, error, ui) {
  const recipient = Session.getActiveUser().getEmail();
  const ts        = new Date().toLocaleString();
  const subject   = `[RTP ERROR] ${context}`;
  const body      =
    `RTP System Error Report\n${'═'.repeat(40)}\n` +
    `Timestamp : ${ts}\nFunction  : ${context}\nError     : ${error.toString()}\n` +
    (error.stack ? `\nStack:\n${error.stack}\n` : '') +
    `\n${'═'.repeat(40)}\nSystem: ${CFG.SYSTEM_NAME} | CI: 3.0`;
  try { if (recipient) MailApp.sendEmail(recipient, subject, body); }
  catch (me) { console.error(`[EMAIL_FAILED] ${me.message}`); }
  if (ui) { try { ui.alert(`❌ ${context}`, `${error.toString()}\n\nError report emailed to ${recipient||'script owner'}.`, ui.ButtonSet.OK); } catch (_) {} }
  console.error(`[ERROR] ${context}: ${error.toString()}`);
}


// ══════════════════════════════════════════════════════════════
// PART 17: ADMIN
// ══════════════════════════════════════════════════════════════

/**
 * Clears routing pointer cache while PRESERVING calibration keys and
 * onboarding state. Use when folders are manually moved or renamed.
 * The next run will re-search Drive and re-cache all IDs.
 */
function resetProperties() {
  const props  = PropertiesService.getScriptProperties();
  const keep   = {};
  [...CFG.CALIBRATION_KEYS, 'IDENTITY_KEY',
   ...Object.values(CFG.PROP),
   'KOS_OPERATOR_ROLE','KOS_OPERATOR_AUDIENCE','KOS_ADMIN_GHOST',
   'KOS_NECESSARY_STRUGGLE','KOS_RELATIONAL_TARGETS','KOS_VISION_90_DAY',
  ].forEach(k => { const v = props.getProperty(k); if (v) keep[k] = v; });
  props.deleteAllProperties();
  if (Object.keys(keep).length > 0) props.setProperties(keep);
  DocumentApp.getUi().toast(
    'Routing cache cleared. Calibration and onboarding state preserved. Next run re-indexes Drive.',
    'System Reset', 5
  );
}

// ============================================================
// END KOS_MASTER_v3.0.gs
// License: Polyform Noncommercial 1.0.0
// Author:  Adam Berneche (RTP Council)
// Version: KOS 5.4 | CI: 3.0
// ============================================================
