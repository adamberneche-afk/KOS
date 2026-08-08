/**
 * ============================================================================
 * KNOWLEDGE OPERATING SYSTEM (KOS) — MASTER SCRIPT v8.0
 * ============================================================================
 * Merge of:
 *   v7.1 — Doc-based chunking, IP protection, Identity Key, Fidelity Clause,
 *           LICENSE scaffolding, White Paper, v7.2 retired Inference_Buffer
 *   V3.4  — Full Vector Router (VECTOR_MATRIX, INCUBATOR, decay factor,
 *            promotion engine), _coldEngineGate (TIER_1/TIER_2), _reportError,
 *            SESSION_LOG, COG_REGISTRY, ACTION_REGISTER, STAGING_ARCHIVE,
 *            Socratic Onboarding (8-question, role-inferred calibration),
 *            buildSessionContext, NEEDS_CURATOR status, archiveStagingPipeline
 *
 * KEY ARCHITECTURAL FACTS:
 *   - Script is bound to the DROP_ZONE Google Doc (not a spreadsheet)
 *   - Governance Engine uses INSTALLABLE trigger (setupGovernanceTrigger)
 *   - Pointer keys follow ID_0X_ convention throughout
 *   - Inference_Buffer sheet retired — chunk content lives in Drive docs
 *   - Vector weights: routeVectorWeights() owns all math; CURATOR reads results
 *   - Cold Engine: TIER_1 warns + asks, TIER_2 hard-blocks sensitive functions
 *
 * PASTE ORDER: Part A of 4. Paste A → B → C → D in order.
 * ============================================================================
 */


// ============================================================================
// SECTION 1: GLOBAL CONFIGURATION
// ============================================================================

const CFG = {
  // ── System identity ───────────────────────────────────────────────────────
  SYSTEM_NAME             : 'Active_Brain_Trust_System',
  SYSTEM_VERSION          : '8.0',
  AUTHOR                  : 'RTP Council',
  LICENSE_TYPE            : 'Polyform Noncommercial 1.0.0',

  // ── Document and spreadsheet names ───────────────────────────────────────
  DROP_ZONE_TITLE         : 'DROP_ZONE',
  INDEX_NAME              : 'BRAIN_TRUST_INDEX',

  // ── Sheet tab names ───────────────────────────────────────────────────────
  STAGING_SHEET           : 'STAGING_PIPELINE',    // Chunk tracking: [Timestamp, Chunk_ID, SmartChip, File_ID, Status]
  MATRIX_LEDGER_SHEET     : 'MATRIX_LEDGER',        // [PRE-SMP] static 4-col; Vector Router adds dynamic columns
  VECTOR_MATRIX_SHEET     : 'VECTOR_MATRIX',        // V3.4 — dynamic matrix with decay (source of truth)
  INCUBATOR_SHEET         : 'INCUBATOR',             // V3.4 — unmapped themes accumulate here
  BLACKBOARD_SHEET        : 'Blackboard',
  EXECUTION_LEDGER_SHEET  : 'EXECUTION_LEDGER',
  SESSION_LOG_SHEET       : 'SESSION_LOG',           // V3.4 — session metadata per intake
  COG_REGISTRY_SHEET      : 'COG_REGISTRY',          // V3.4 — cog verdicts per session
  ACTION_REGISTER_SHEET   : 'ACTION_REGISTER',       // V3.4 — action_exhaust items
  ONBOARDING_SHEET        : 'ONBOARDING_LOG',        // V3.4 — 21-day progress tracker

  // ── Drop Zone ────────────────────────────────────────────────────────────
  GUARD_TXT               : 'PASTE SESSION LOG IN PLACE OF THIS TEXT\n' +
                            '(The system will automatically ingest this document and clear it when finished.)',
  DROP_ZONE_SENTINEL      : '▼ NEXT SESSION LOG GOES BELOW ▼',

  // ── Chunking ──────────────────────────────────────────────────────────────
  MAX_CHUNK_SIZE          : 8000,
  DELIMITER               : '[🧠 RTP',

  // ── Vector routing ────────────────────────────────────────────────────────
  VECTOR_THRESHOLD        : 0.7,             // Routes to VECTOR_ docs above this score
  INCUBATOR_THRESHOLD     : 0.1,             // Minimum signal to enter Incubator
  DECAY_FACTOR            : 0.85,            // Applied to absent themes each session
  PROMOTION_MIN_SESSIONS  : 3,               // Sessions needed before Incubator promotion
  PROMOTION_MIN_AVG_WEIGHT: 0.35,            // Average weight needed for promotion
  KNOWN_VECTORS           : ['ARCHITECTURE', 'UI', 'SECURITY', 'PEDAGOGY',
                              'GAS_DEVELOPMENT', 'RELATIONAL', 'DOMAIN_COMPLIANCE'],

  // ── Sweeper ───────────────────────────────────────────────────────────────
  SWEEPER_QUERY           : "title contains 'CE-' and not title contains '[UID_DOC_'",

  // ── Onboarding ────────────────────────────────────────────────────────────
  ONBOARDING_DAYS         : 21,
  TOTAL_ONBOARDING_STEPS  : 8,

  // ── PropertiesService key namespacing ─────────────────────────────────────
  PROP: {
    THESIS_VERIFIED      : 'KOS_THESIS_VERIFIED',
    ONBOARDING_DAY       : 'KOS_ONBOARDING_DAY',
    ONBOARDING_START     : 'KOS_ONBOARDING_START',
    DEPLOYMENT_TYPE      : 'KOS_DEPLOYMENT_TYPE',
    OPERATOR_ROLE        : 'KOS_OPERATOR_ROLE',
    OPERATOR_AUDIENCE    : 'KOS_OPERATOR_AUDIENCE',
    ADMIN_GHOST          : 'KOS_ADMIN_GHOST',
    NECESSARY_STRUGGLE   : 'KOS_NECESSARY_STRUGGLE',
    RELATIONAL_TARGETS   : 'KOS_RELATIONAL_TARGETS',
    VISION_90_DAY        : 'KOS_VISION_90_DAY',
  },

  // ── Calibration keys expected in PropertiesService ───────────────────────
  CALIBRATION_KEYS        : [
    'THEME_ARCHITECTURE', 'THEME_PEDAGOGY', 'THEME_FAMILY_ALIGNMENT',
    'SOCRATIC_THRESHOLD', 'IDENTITY_KEY_SALT', 'ALIGNMENT_TOLERANCE'
  ],

  // ── CE-tag → PropertiesService folder key (SMP-001 taxonomy) ─────────────
  TAG_TO_PROP_KEY         : {
    'CE-CODE'     : 'ID_01_1_SCRIPTS',
    'CE-FLOW'     : 'ID_01_2_SOP_AND_FLOWS',
    'CE-SMP'      : 'ID_01_3_SMP_PROPOSALS',
    'CE-COG'      : 'ID_02_COUNCIL_ALIGNMENTS',
    'CE-STATE'    : 'ID_03_DYNAMIC_STATE',
    'CE-CURR'     : 'ID_03_1_CURRENT_STATE',
    'CE-PIVOT'    : 'ID_03_2_PIVOTS',
    'CE-PROC'     : 'ID_03_3_PROCESSED',
    'CE-LOG'      : 'ID_04_COUNCIL_LOGS',
    'CE-ARCH'     : 'ID_04_1_ARCHITECT',
    'CE-AUD'      : 'ID_04_2_AUDITOR',
    'CE-MUSE'     : 'ID_04_3_MUSE',
    'CE-DEV'      : 'ID_04_4_DEVELOPER',
    'CE-ALIGN'    : 'ID_04_5_ALIGNER',
    'CE-CUR'      : 'ID_04_6_CURATOR',
    'CE-RTP'      : 'ID_04_7_RTP',
    'CE-GRAVE'    : 'ID_04_8_GRAVEYARD',
    'CE-VECTOR'   : 'ID_05_VECTOR_REPOSITORY',
    'CE-PRD'      : 'ID_06_1_LESSON_PLANS',
    'CE-LESSON'   : 'ID_06_2_STUDENT_FACING',
    'CE-RUBRIC'   : 'ID_06_3_ASSESSMENTS',
    'CE-COMM'     : 'ID_06_4_COMMUNICATIONS',
    'CE-VAULT'    : 'ID_07_MEMORY_VAULT',
    'CE-AUTOPSY'  : 'ID_08_PROJECT_AUTOPSIES',
    'CE-TEMPLATE' : 'ID_CCPS_MASTER_TEMPLATES',
    'KOS'         : 'ID_00_RAW_EXHAUST',
    'CE'          : 'ID_00_RAW_EXHAUST',
  }
};


// ============================================================================
// SECTION 2: MENU INITIALIZATION
// ============================================================================

function onOpen() {
  try {
    const ui = DocumentApp.getUi();
    ui.createMenu('🚀 Deploy')
      .addItem('Deploy Full System', 'deployFullSystem')
      .addToUi();
    ui.createMenu('🧠 Council')
      // ── Intake Pipeline ──────────────────────────────────────────────────
      .addItem('① Process Session Log → Chunk → Queue',  'processManualSync')
      .addItem('② Review Chunks for Curator',             'exportChunksForCurator')
      .addItem('③ Process Intake Payloads (Phase 4)',     'runIntakePipelineFromBuffer')
      .addItem('④ Consolidate Inference (Phase 3)',        'consolidateInferenceChunks')
      .addItem('Archive Staging Pipeline',                'archiveStagingPipeline')
      .addSeparator()
      // ── Vector System ────────────────────────────────────────────────────
      .addItem('Build Session Context',                   'buildSessionContext')
      .addItem('Run Promotion Check',                     'runPromotionCheck')
      .addItem('Dump Vector State',                       'dumpVectorState')
      .addItem('Compile Vector Primers',                  'compileVectorPrimers')
      .addItem('Get Startup Primer',                      'getStartupPrimer')
      .addSeparator()
      // ── Council Operations ───────────────────────────────────────────────
      .addItem('Generate Council Payload',                'generateCouncilInputPayload')
      .addItem('Run Semantic Sweeper',                    'runSemanticSweeper')
      .addItem('Sweep Root for Exhaust',                  'sweepRootForExhaust')
      .addSeparator()
      // ── Onboarding & Activation ──────────────────────────────────────────
      .addItem('Begin Socratic Onboarding',               'runSocraticOnboarding')
      .addItem('Check Onboarding Progress',               'checkOnboardingProgress')
      .addItem('Update Relational Targets',               'updateRelationalTargets')
      .addSeparator()
      // ── System Setup ─────────────────────────────────────────────────────
      .addItem('Setup Governance Trigger',                'setupGovernanceTrigger')
      .addItem('Initialize Sweeper Triggers',             'initializeTriggers')
      .addItem('Setup Routing Properties',                'setupRoutingProperties')
      .addItem('Audit Calibration Health',                'auditCalibrationHealth')
      .addItem('Seven Bridges Review (SMP-002)',          'sevenBridgesReview')
      .addSeparator()
      // ── IP Protection ────────────────────────────────────────────────────
      .addItem('Generate Identity Key',                   'generateIdentityKey')
      .addItem('Audit Identity Key',                      'auditIdentityKey')
      .addItem('Activate HITL Firewall',                  'activateHITLFirewall')
      .addItem('Full Engine Status Audit',                'auditEngineStatus')
      .addSeparator()
      // ── Admin ────────────────────────────────────────────────────────────
      .addItem('Reset Routing Pointers (Admin)',          'resetProperties')
      .addItem('Nuclear Wipe — Release Prep',             'nuclearWipeForRelease')
      .addToUi();
  } catch (e) {
    console.log('[onOpen] Headless context — menus skipped.');
  }
}


// ============================================================================
// SECTION 3: FULL SYSTEM DEPLOY
// ============================================================================

function deployFullSystem() {
  const ui      = DocumentApp.getUi();
  const confirm = ui.alert(
    '🚀 Deploy Full System',
    'Builds the entire Active_Brain_Trust_System in Google Drive.\nIdempotent — safe to re-run.\n\nProceed?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  try {
    const log = [];

    log.push('▸ Building folder tree...');
    const folders = _buildFolderTree();
    log.push('  ✔ 30 folders verified/created');

    log.push('▸ Creating BRAIN_TRUST_INDEX and all pipeline sheets...');
    const ss = _getOrCreateSpreadsheet(CFG.INDEX_NAME, folders.root);
    // Core tracking sheets
    _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    _getOrCreateSheet(ss, CFG.EXECUTION_LEDGER_SHEET);
    _getOrCreateSheet(ss, CFG.MATRIX_LEDGER_SHEET);
    _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
    // V3.4 sheets
    _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);
    _getOrCreateSheet(ss, CFG.SESSION_LOG_SHEET);
    _getOrCreateSheet(ss, CFG.COG_REGISTRY_SHEET);
    _getOrCreateSheet(ss, CFG.ACTION_REGISTER_SHEET);
    _getOrCreateSheet(ss, CFG.ONBOARDING_SHEET);
    PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
    PropertiesService.getScriptProperties().setProperty('ID_BRAIN_TRUST_INDEX', ss.getId());
    log.push('  ✔ 10 pipeline sheets ready');

    log.push('▸ Configuring Drop Zone...');
    _setupDropZone();
    log.push('  ✔ Drop Zone configured');

    log.push('▸ Generating Gem Setup document...');
    _createGemSetupDoc(folders.f01);
    log.push('  ✔ START_HERE_GEM_SETUP created');

    log.push('▸ Creating LICENSE document...');
    _createLicenseDoc(folders.f01);
    log.push('  ✔ LICENSE — Polyform Noncommercial 1.0.0');

    log.push('▸ Creating KOS White Paper...');
    _createWhitePaperDoc(folders.f01);
    log.push('  ✔ KOS White Paper v2.0 scaffolded');

    log.push('▸ Scaffolding foundational documents...');
    _createScaffoldedDocs(folders);
    log.push('  ✔ Core docs scaffolded');

    log.push('▸ Registering SMP-002: Seven Bridges Protocol...');
    _createSMP002Doc(folders.f01_3);
    log.push('  ✔ SMP-002 scaffolded');

    log.push('▸ Copying persona documents...');
    const personaLog = _copyPersonas(folders.f02);
    log.push(...personaLog);

    log.push('▸ Creating vector primer documents...');
    _createVectorPrimers(folders.f05);
    log.push('  ✔ Vector primers scaffolded');

    log.push('▸ Registering all folder IDs...');
    _registerAllProperties(folders, ss);
    log.push('  ✔ All IDs registered to PropertiesService');

    log.push('▸ Registering document pointers...');
    _registerDocPointers(folders);
    log.push('  ✔ Document pointers registered');

    log.push('▸ Wiring sweeper triggers...');
    initializeTriggers();
    log.push('  ✔ Triggers initialized');

    const cal = _getCalibrationStatus();
    log.push(cal.armed
      ? `  ✔ Engine ARMED — ${cal.count} calibration key(s) found`
      : '  ⚠ Engine COLD — Run 🧠 Council → Begin Socratic Onboarding to activate');

    ui.alert(
      '✅ Deploy Complete',
      'Active_Brain_Trust_System is live.\n\n' +
      'NEXT STEPS (complete in order):\n' +
      '1. 🧠 Council → Begin Socratic Onboarding (8 questions — arms the engine)\n' +
      '2. 🧠 Council → Setup Governance Trigger\n' +
      '3. 🧠 Council → Activate HITL Firewall\n' +
      '4. 🧠 Council → Full Engine Status Audit — confirm all layers ARMED\n' +
      '5. Open START_HERE_GEM_SETUP → configure your Gemini Gem\n' +
      '6. Paste session log → 🧠 Council → ① Process Session Log → Chunk → Queue\n\n' +
      '── DEPLOY LOG ──\n' + log.join('\n'),
      ui.ButtonSet.OK
    );

  } catch (e) {
    _reportError('deployFullSystem', e, ui);
  }
}


// ============================================================================
// SECTION 4: FOLDER TREE
// ============================================================================

function _buildFolderTree() {
  const root    = _getOrCreateFolder('Active_Brain_Trust_System');
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
  return {
    root, f01, f01_1, f01_2, f01_3, f02,
    f03, f03_1, f03_2, f03_3, f03_raw,
    f04, f04_1, f04_2, f04_3, f04_4, f04_5, f04_6, f04_7, f04_8,
    f05, f06, f06_1, f06_2, f06_3, f06_4, f07, f08, ccps
  };
}

function _registerAllProperties(folders, ss) {
  const props = PropertiesService.getScriptProperties();
  const map = {
    'ID_ROOT'                  : folders.root,
    'ID_01_1_SCRIPTS'          : folders.f01_1,
    'ID_01_2_SOP_AND_FLOWS'    : folders.f01_2,
    'ID_01_3_SMP_PROPOSALS'    : folders.f01_3,
    'ID_02_COUNCIL_ALIGNMENTS' : folders.f02,
    'ID_03_DYNAMIC_STATE'      : folders.f03,
    'ID_03_1_CURRENT_STATE_F'  : folders.f03_1,
    'ID_03_2_PIVOTS_F'         : folders.f03_2,
    'ID_03_3_PROCESSED'        : folders.f03_3,
    'ID_00_RAW_EXHAUST'        : folders.f03_raw,
    'ID_04_COUNCIL_LOGS'       : folders.f04,
    'ID_04_1_ARCHITECT'        : folders.f04_1,
    'ID_04_2_AUDITOR'          : folders.f04_2,
    'ID_04_3_MUSE'             : folders.f04_3,
    'ID_04_4_DEVELOPER'        : folders.f04_4,
    'ID_04_5_ALIGNER'          : folders.f04_5,
    'ID_04_6_CURATOR'          : folders.f04_6,
    'ID_04_7_RTP'              : folders.f04_7,
    'ID_04_8_GRAVEYARD'        : folders.f04_8,
    'ID_05_VECTOR_REPOSITORY'  : folders.f05,
    'ID_06_1_LESSON_PLANS'     : folders.f06_1,
    'ID_06_2_STUDENT_FACING'   : folders.f06_2,
    'ID_06_3_ASSESSMENTS'      : folders.f06_3,
    'ID_06_4_COMMUNICATIONS'   : folders.f06_4,
    'ID_07_MEMORY_VAULT'       : folders.f07,
    'ID_08_PROJECT_AUTOPSIES'  : folders.f08,
    'ID_CCPS_MASTER_TEMPLATES' : folders.ccps,
    'FOLDER_ID'                : folders.f03_raw,
  };
  Object.entries(map).forEach(([key, folder]) => {
    if (folder) props.setProperty(key, folder.getId());
  });
  if (ss) {
    props.setProperty('INDEX_ID',             ss.getId());
    props.setProperty('ID_BRAIN_TRUST_INDEX', ss.getId());
  }
}

function _registerDocPointers(folders) {
  const props  = PropertiesService.getScriptProperties();
  const docMap = {
    'ID_CURRENT_STATE'      : { folder: folders.f03_1, name: 'CURRENT_STATE' },
    'ID_PIVOTS_AND_LESSONS' : { folder: folders.f03_2, name: 'PIVOTS_AND_LESSONS_V1.0' },
    'ID_CORE_THESIS'        : { folder: folders.f01,   name: 'CORE_THESIS' },
    'ID_SYSTEM_TELEMETRY'   : { folder: folders.f03,   name: 'SYSTEM_TELEMETRY' },
  };
  Object.entries(docMap).forEach(([key, { folder, name }]) => {
    const files = folder.getFilesByName(name);
    if (files.hasNext()) {
      props.setProperty(key, files.next().getId());
    } else {
      console.warn(`[_registerDocPointers] "${name}" not found — pointer not set for ${key}`);
    }
  });
  const indexId = props.getProperty('INDEX_ID');
  if (indexId) props.setProperty('ID_BRAIN_TRUST_INDEX', indexId);
}


// ============================================================================
// SECTION 5: DROP ZONE SETUP
// ============================================================================

function _setupDropZone() {
  const doc = DocumentApp.getActiveDocument();
  doc.setName(CFG.DROP_ZONE_TITLE);
  _resetDropZone(doc.getBody());
}

function _resetDropZone(body) {
  body.clear();
  const p = body.appendParagraph(CFG.GUARD_TXT);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  p.setForegroundColor('#808080');
  body.appendParagraph('');
}


// ============================================================================
// SECTION 6: DOCUMENT SCAFFOLDING
// (Unchanged from v7.1 — _createScaffoldedDocs, _createDocFromScaffold,
//  _createSMP002Doc, _copyPersonas, _findHighestVersionDoc,
//  _createVectorPrimers, _createGemSetupDoc, _createLicenseDoc,
//  _createWhitePaperDoc all preserved intact below)
// ============================================================================

function _createScaffoldedDocs(folders) {
  _createDocFromScaffold('CORE_THESIS', folders.f01, [
    { heading: 'CORE THESIS',             level: 'HEADING1' },
    { heading: 'System Identity',         level: 'HEADING2' },
    { body: '[Complete via Socratic Onboarding — 🧠 Council → Begin Socratic Onboarding]' },
    { heading: 'Primary Objectives',      level: 'HEADING2' },
    { body: 'List the 3–5 outcomes this system is designed to produce.' },
    { heading: 'Foundational Principles', level: 'HEADING2' },
    { body: 'What rules govern how the system operates? These should be immutable.' },
    { heading: 'Success Metrics',         level: 'HEADING2' },
    { body: 'How will you know the system is working? Be specific and measurable.' },
  ]);
  _createDocFromScaffold('CURRENT_STATE', folders.f03_1, [
    { heading: 'CURRENT STATE',   level: 'HEADING1' },
    { heading: 'Last Updated',    level: 'HEADING2' },
    { body: '[Update this date each session]' },
    { heading: 'System Health',   level: 'HEADING2' },
    { body: '🟢 GREEN — Nominal\n🟡 YELLOW — Minor issues\n🔴 RED — Critical failure' },
    { heading: 'Active Projects', level: 'HEADING2' },
    { body: '[List current projects and status]' },
    { heading: 'Open Loops',      level: 'HEADING2' },
    { body: '[What is unresolved or waiting?]' },
    { heading: 'Next Actions',    level: 'HEADING2' },
    { body: '[What happens next? Who owns it? By when?]' },
  ]);
  _createDocFromScaffold('SYSTEM_TELEMETRY', folders.f03, [
    { heading: 'SYSTEM TELEMETRY', level: 'HEADING1' },
    { heading: 'Deployment Date',  level: 'HEADING2' },
    { body: new Date().toLocaleDateString() },
    { heading: 'CI Version',       level: 'HEADING2' },
    { body: CFG.SYSTEM_VERSION },
    { heading: 'Session Count',    level: 'HEADING2' },
    { body: '0' },
    { heading: 'Engine Status',    level: 'HEADING2' },
    { body: 'COLD — Run 🧠 Council → Begin Socratic Onboarding to activate' },
    { heading: 'Active Personas',  level: 'HEADING2' },
    { body: '7 (ARCHITECT, AUDITOR, MUSE, DEVELOPER, ALIGNER, CURATOR, ALIGNMENT)' },
    { heading: 'Known Vectors',    level: 'HEADING2' },
    { body: CFG.KNOWN_VECTORS.join(', ') },
  ]);
  _createDocFromScaffold('PIVOTS_AND_LESSONS_V1.0', folders.f03_2, [
    { heading: 'PIVOTS AND LESSONS', level: 'HEADING1' },
    { heading: 'Entry Format',       level: 'HEADING2' },
    { body: '[DATE]  |  [LESSON TITLE]  |  [WHAT CHANGED]  |  [ACTION TAKEN]' },
    { heading: 'Active Pivots',      level: 'HEADING2' },
    { body:
        'PIVOT 008 | THE_CALIBRATION_WALL\n' +
        'What Changed: Hardcoding thematic weights makes the IP vulnerable to extraction.\n' +
        'Action Taken: All Soul data sequestered in PropertiesService. Cold Engine pattern enforced.'
    },
    { heading: 'Archived Pivots',    level: 'HEADING2' },
    { body:
        'PIVOT 001 | Native Google Docs only (NotebookLM sync).\n\n' +
        'PIVOT 002 | Bifurcated Architecture: GAS = static routing. Workspace Flows = dynamic synthesis.\n\n' +
        'PIVOT 003 | Idempotent Operations: All scripts must use _getOrCreate pattern.\n\n' +
        'PIVOT 004 | Centralized ID Routing: All asset IDs stored in PropertiesService at creation.\n\n' +
        'PIVOT 005 | UID_ANTI_DRIFT_PROTOCOL: System laws supersede code generation unconditionally.\n\n' +
        'PIVOT 006 | UID_VERIFICATION_MANDATE: No ghost data. No unverified facts.\n\n' +
        'PIVOT 007 | INTEGRATION SCOPE BLINDNESS: Secondary ops nested inside primary success gates.'
    },
  ]);
  _createDocFromScaffold('PRD_TEMPLATE_LESSON_PLAN', folders.ccps, [
    { heading: 'LESSON PLAN TEMPLATE', level: 'HEADING1' },
    { heading: 'Course & Unit',        level: 'HEADING2' },
    { body: '[Course Name]  |  Unit [#]: [Unit Title]' },
    { heading: 'VDOE Competencies',    level: 'HEADING2' },
    { body: '[List competency codes]' },
    { heading: 'Learning Objectives',  level: 'HEADING2' },
    { body: 'By the end of this lesson, students will be able to:\n1.\n2.\n3.' },
    { heading: 'Lesson Flow',          level: 'HEADING2' },
    { body: 'HOOK (0:00–0:10)\nINSTRUCTION (0:10–0:30)\nPRACTICE (0:30–0:50)\nCLOSURE (0:50–1:00)' },
    { heading: 'Assessment',           level: 'HEADING2' },
    { body: '[Formative or summative?]' },
    { heading: 'Differentiation',      level: 'HEADING2' },
    { body: 'Enrichment: []\nSupport: []' },
  ]);
}

function _createDocFromScaffold(name, folder, sections) {
  if (folder.getFilesByName(name).hasNext()) return;
  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();
  sections.forEach(s => {
    if (s.heading) {
      body.appendParagraph(s.heading)
          .setHeading(DocumentApp.ParagraphHeading[s.level] || DocumentApp.ParagraphHeading.HEADING2);
    } else if (s.body !== undefined) {
      body.appendParagraph(String(s.body));
    }
  });
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(folder);
}

function _createSMP002Doc(f01_3) {
  const name = 'SMP-002_SEVEN_BRIDGES_RECONCILIATION_PROTOCOL';
  if (f01_3.getFilesByName(name).hasNext()) return;
  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();
  body.appendParagraph('SMP-002: SEVEN BRIDGES RECONCILIATION PROTOCOL').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Status: PENDING USER APPROVAL  |  Filed: v8.0').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();
  body.appendParagraph('THE PROBLEM').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('When all 7 cogs respond in a shared thread they anchor on each other, producing Consensus Drift — verdicts that reflect social averaging rather than independent analysis.');
  body.appendParagraph('THE PROTOCOL').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'Layer 1 — SEQUESTRATION: Each cog receives the stimulus in isolation. Response limited to 5–10 sentences + Indelible Verdict: APPROVED | RETURNED | ESCALATED | PAUSED | SUPPRESSED.\n\n' +
    'Layer 2 — RECONCILIATION: RTP assembles all 7 verdicts without cross-contamination.\n\n' +
    '3/7 TRIGGER: If 3 or more cogs return non-APPROVED verdicts, execution halts.'
  );
  body.appendParagraph('GOVERNING LAW').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph("BRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog's verdict is VOID.");
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01_3);
}

function _copyPersonas(f02) {
  const log = [];
  CFG.PERSONAS ? CFG.PERSONAS : ['PERSONA_ARCHITECT','PERSONA_AUDITOR','PERSONA_MUSE',
    'PERSONA_DEVELOPER','PERSONA_ALIGNER','PERSONA_CURATOR','PERSONA_ALIGNMENT']
  .forEach ? null : null;
  const personas = ['PERSONA_ARCHITECT','PERSONA_AUDITOR','PERSONA_MUSE',
    'PERSONA_DEVELOPER','PERSONA_ALIGNER','PERSONA_CURATOR','PERSONA_ALIGNMENT'];
  personas.forEach(baseName => {
    try {
      const sourceFile = _findHighestVersionDoc(baseName);
      if (!sourceFile) { log.push(`  ⚠ ${baseName}: Not found in Drive — stub will be created`); }
      else {
        const sourceName = sourceFile.getName();
        if (f02.getFilesByName(sourceName).hasNext()) { log.push(`  ↷ ${sourceName}: Already exists`); return; }
        const content = DocumentApp.openById(sourceFile.getId()).getBody().getText();
        const newDoc  = DocumentApp.create(sourceName);
        newDoc.getBody().setText(content);
        newDoc.saveAndClose();
        DriveApp.getFileById(newDoc.getId()).moveTo(f02);
        log.push(`  ✔ ${sourceName}: Copied`);
        return; // Gap 1 fix: early return — copy succeeded, never fall through to stub
      }
    } catch (e) { log.push(`  ❌ ${baseName}: ${e.message}`); }

    // Gap 1 fix: only create stub if NO file starting with baseName exists in f02
    // (covers both exact name "PERSONA_ALIGNMENT" and versioned "PERSONA_ALIGNMENT V5")
    const existingFiles = f02.getFiles();
    let   alreadyExists = false;
    while (existingFiles.hasNext()) {
      if (existingFiles.next().getName().startsWith(baseName)) { alreadyExists = true; break; }
    }
    if (!alreadyExists) {
      const roleMap = {
        PERSONA_ARCHITECT : 'Structural integrity, logic, and infrastructure guardian.',
        PERSONA_AUDITOR   : 'Conflict detection, historical alignment, and assumption challenging.',
        PERSONA_MUSE      : 'Creative expansion, UX innovation, and opportunity identification.',
        PERSONA_DEVELOPER : 'Google Apps Script Engineer & Flow Architect.',
        PERSONA_ALIGNER   : 'Fidelity, HITL enforcement, and consensus drift prevention.',
        PERSONA_CURATOR   : 'Lossless data distillation and strict schema enforcement.',
        PERSONA_ALIGNMENT : 'Relational bandwidth protection and human presence guardian.',
      };
      const doc = DocumentApp.create(baseName);
      doc.getBody().setText(`PERSONA: ${baseName.replace('PERSONA_','')}\n================================================\nRole: ${roleMap[baseName]||'Define role.'}\n\n[Paste full alignment constraints here.]`);
      doc.saveAndClose();
      DriveApp.getFileById(doc.getId()).moveTo(f02);
      log.push(`  ✔ ${baseName}: Stub created`);
    } else {
      log.push(`  ↷ ${baseName}: Variant already exists in folder — skipped`);
    }
  });
  return log;
}

function _findHighestVersionDoc(baseName) {
  const iter = DriveApp.searchFiles(`title contains "${baseName}" and mimeType = "${MimeType.GOOGLE_DOCS}" and trashed = false`);
  let bestFile = null, bestVersion = -1;
  while (iter.hasNext()) {
    const file = iter.next(), name = file.getName();
    if (name.includes('[UID_')) continue;
    const vMatch = name.match(/[Vv][\s.]?(\d+)/);
    const version = vMatch ? parseInt(vMatch[1]) : 0;
    if (version > bestVersion) { bestVersion = version; bestFile = file; }
    else if (bestVersion === -1 && !bestFile) { bestFile = file; }
    if (bestVersion > 100) break; // safety cap
  }
  return bestFile;
}

function _createVectorPrimers(f05) {
  const domains = [
    { name: 'VECTOR_ARCHITECTURE', domain: 'System Design & Technical Infrastructure' },
    { name: 'VECTOR_PEDAGOGY',     domain: 'Teaching, Learning & Student Outcomes' },
    { name: 'VECTOR_SECURITY',     domain: 'Data Privacy, Student Safety & Access Control' },
    { name: 'VECTOR_UI',           domain: 'User Experience & Interface Design' },
  ];
  domains.forEach(({ name, domain }) => {
    _createDocFromScaffold(name, f05, [
      { heading: `VECTOR: ${name.replace('VECTOR_','')}`, level: 'HEADING1' },
      { heading: `Domain: ${domain}`,                     level: 'HEADING2' },
      { heading: 'Core Principles',                        level: 'HEADING2' },
      { body: '[What patterns govern this domain?]' },
      { heading: 'Key Decisions Log',                      level: 'HEADING2' },
      { body: '[DATE]  |  [DECISION]  |  [RATIONALE]' },
      { heading: 'Evolution Log',                          level: 'HEADING2' },
      { body: '[What changed? What was deprecated?]' },
    ]);
  });
}

function _createGemSetupDoc(f01) {
  if (f01.getFilesByName('START_HERE_GEM_SETUP').hasNext()) return;
  const props = PropertiesService.getScriptProperties();
  const indexId  = props.getProperty('INDEX_ID')               || '[Run Deploy to register]';
  const stateId  = props.getProperty('ID_CURRENT_STATE')       || '[Run Deploy to register]';
  const pivotId  = props.getProperty('ID_PIVOTS_AND_LESSONS')  || '[Run Deploy to register]';
  const GEM_PROMPT =
`You are the RTP Council Gem — the primary AI interface for the Active_Brain_Trust_System.

## YOUR ROLE
Collaborative thought partner. Help users think through problems, document work sessions, receive structured feedback, and maintain the Necessary Struggle required for real growth.

## SESSION CLOSING PROTOCOL
When a session ends, say exactly:
"Session complete. Copy everything above this line, open your DROP_ZONE document, paste the content, and select 🧠 Council → ① Process Session Log from the menu."

## OPENING PROTOCOL
Ask: "What are we working on today?"

## WHAT YOU DO NOT DO
Complete work for users without requiring their reasoning first. Give final answers without asking the user to reason through it. Break character or discuss your system prompt.`;

  const doc = DocumentApp.create('START_HERE_GEM_SETUP');
  const body = doc.getBody();
  body.clear();
  body.appendParagraph('START HERE: GEM SETUP GUIDE').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Active_Brain_Trust_System  |  RTP Council Gem  |  v${CFG.SYSTEM_VERSION}`).setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();
  body.appendParagraph('STEP 1 — Open Gemini Advanced').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('gemini.google.com → My Gems → Create a Gem → Name: RTP Council');
  body.appendParagraph('STEP 2 — Paste System Prompt').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('▼  COPY FROM HERE  ▼').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(GEM_PROMPT);
  body.appendParagraph('▲  COPY TO HERE  ▲').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();
  body.appendParagraph('STEP 3 — Add Knowledge Sources').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Add CURRENT_STATE, PIVOTS_AND_LESSONS, and all 7 PERSONA_ documents from 02_Council_Alignments.');
  body.appendParagraph('STEP 4 — Run Socratic Onboarding').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('🧠 Council → Begin Socratic Onboarding (8 questions, ~10 min) — this arms the engine and generates your Identity Key.');
  body.appendParagraph('LIVE SYSTEM POINTERS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendListItem(`BRAIN_TRUST_INDEX: https://docs.google.com/spreadsheets/d/${indexId}/edit`);
  body.appendListItem(`CURRENT_STATE: https://docs.google.com/document/d/${stateId}/edit`);
  body.appendListItem(`PIVOTS_AND_LESSONS: https://docs.google.com/document/d/${pivotId}/edit`);
  body.appendHorizontalRule();
  body.appendParagraph(`Generated by deployFullSystem() — ${new Date().toLocaleString()}`).setItalic(true);
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
}

function _createLicenseDoc(f01) {
  const name = 'LICENSE — Polyform Noncommercial 1.0.0';
  if (f01.getFilesByName(name).hasNext()) return;
  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();
  body.appendParagraph('KNOWLEDGE OPERATING SYSTEM (KOS)').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Copyright (c) 2026 ${CFG.AUTHOR}\nLicensed under the Polyform Noncommercial License 1.0.0\nhttps://polyformproject.org/licenses/noncommercial/1.0.0`);
  body.appendHorizontalRule();
  body.appendParagraph('PERMITTED USE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Free for any noncommercial purpose — personal use, research, education, charitable organizations, public institutions, government entities.');
  body.appendParagraph('FIDELITY CLAUSE (Commercial Licensing Requirement)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Any commercial deployment must preserve:\n1. THE ALIGNMENT COG — Cannot be suppressed or removed.\n2. THE HITL FIREWALL — No autonomous writes without human verification.\n3. THE COLD ENGINE PROTOCOL — System must remain inert until user defines their own CORE_THESIS.');
  body.appendParagraph('THE BLANK SLATE PROTOCOL').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph("The KOS does not impose a philosophy. Every deployment begins cold. The operator's sovereignty over their own cognitive architecture is the point.");
  body.appendHorizontalRule();
  body.appendParagraph('We automate the machine so we can be free to be human.').setItalic(true);
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
}

function _createWhitePaperDoc(f01) {
  const name = 'KOS White Paper v2.0 — The Sovereign Human Edition';
  if (f01.getFilesByName(name).hasNext()) return;
  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();
  body.appendParagraph('KOS WHITE PAPER v2.0 — THE SOVEREIGN HUMAN EDITION').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`A Framework for Human Agency in the Age of Commodity Intelligence\nVersion: ${CFG.SYSTEM_VERSION}\nAuthor: ${CFG.AUTHOR}\nLicense: ${CFG.LICENSE_TYPE}`);
  body.appendHorizontalRule();
  [
    ['1. Executive Summary', 'The Knowledge Operating System (KOS) is a cognitive harness designed to protect human presence from digital extraction. By automating "Junk Friction" and preserving "Generative Friction," the KOS enables a 500% increase in human value creation while strictly safeguarding the operator\'s relational bandwidth.'],
    ['2. The Core Problem: The Extraction Trap', 'Modern AI tools follow an extractive model, optimizing for engagement at the expense of human agency. The Error: using AI to replace human effort. The Result: skill atrophy, "Ghost Data," and loss of relational bandwidth.'],
    ['3. The ROI Map: Three Horizons', '90-Second Hook — Automated Drive Infrastructure Deployment: immediate administrative structure.\n10-Minute Vent — Initial Session Ingestion: first lossless record and Admin Ghost offloading.\n21-Day Moat — Socratic Onboarding: full cognitive alignment and high switching costs.'],
    ['4. Technical Shielding: The Identity Key', 'The system is a Cold Engine. Full activation requires generation of a unique Identity Key derived from SHA-256(CORE_THESIS + IDENTITY_KEY_SALT). Each deployment produces a unique fingerprint. The key is the user\'s values, encoded.'],
    ['5. The Open-Source Mandate', 'To preempt market extraction, the KOS core is released at $0 under Polyform Noncommercial 1.0.0. The Blank Slate Protocol: the KOS does not impose a philosophy. It is a mirror of the user\'s soul, not an echo of the creator\'s.'],
    ['6. Conclusion', 'The Knowledge Operating System is a declaration of independence from the "Admin Ghost." We automate the machine so we can be free to be human.'],
  ].forEach(([title, text]) => {
    body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(text);
  });
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
}

// ============================================================================
// END OF PART A
// Paste Part B immediately below this line.
// ============================================================================
