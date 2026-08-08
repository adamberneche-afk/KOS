/**
 * ============================================================================
 * KNOWLEDGE OPERATING SYSTEM (KOS) — MASTER SCRIPT v7.0
 * ============================================================================
 * Foundation : CI 2.2 architecture (Drop Zone doc-bound, installable triggers)
 * Merged     : v6.0 improvements (CFG, Smart Chips, optimized sweeper,
 *              Context Compiler, CE-GRAVE, Differential Read, Hardening v2)
 * Resolves   : All 20 gaps identified in comparative audit
 *
 * KEY ARCHITECTURAL DECISIONS:
 *   - Script is bound to the DROP_ZONE Google Doc (not a spreadsheet)
 *   - Governance Engine uses INSTALLABLE trigger (setupGovernanceTrigger)
 *     because a doc-bound script cannot fire onEdit on a different spreadsheet
 *   - Pointer keys follow ID_0X_ convention (CI 2.2 canonical)
 *   - All folder IDs registered at deploy — no name-based lookups in runtime
 *   - [PRE-SMP] functions preserved until Vector_Router.gs is live
 *
 * POINTER KEY CONVENTION (canonical — do not mix with ID_FOLDER_ prefix):
 *   ID_ROOT, ID_01_*, ID_02_*, ID_03_*, ID_04_*, ID_05_*, ID_06_*, ID_07_*, ID_08_*
 *   INDEX_ID       — BRAIN_TRUST_INDEX spreadsheet
 *   ID_CURRENT_STATE, ID_PIVOTS_AND_LESSONS — document-level pointers
 *
 * FIRST-TIME RUN ORDER:
 *   1. Open the DROP_ZONE Google Doc
 *   2. 🚀 Deploy → Deploy Full System
 *   3. setupCalibration() → Run once → Clear values
 *   4. 🧠 Council → Setup Governance Trigger
 *   5. Open START_HERE_GEM_SETUP → configure your Gem
 *   6. Paste session log → 🧠 Council → Process Session Log (Phase 1)
 *
 * PASTE ORDER: Part A of 4. Paste A → B → C → D in order.
 * ============================================================================
 */


// ============================================================================
// SECTION 1: GLOBAL CONFIGURATION
// ============================================================================

const CFG = {
  // ── Core asset names ──────────────────────────────────────────────────────
  SYSTEM_NAME             : 'Active_Brain_Trust_System',
  DROP_ZONE_TITLE         : 'DROP_ZONE',
  INDEX_NAME              : 'BRAIN_TRUST_INDEX',

  // ── Sheet tab names ───────────────────────────────────────────────────────
  STAGING_SHEET           : 'STAGING_PIPELINE',      // Tracks all chunks: [Timestamp, Chunk_ID, SmartChip, File_ID, Status]
  MATRIX_LEDGER_SHEET     : 'MATRIX_LEDGER',
  BLACKBOARD_SHEET        : 'Blackboard',
  EXECUTION_LEDGER_SHEET  : 'EXECUTION_LEDGER',
  // INFERENCE_BUFFER_SHEET retired in v7.2 — chunk content now lives in Drive docs, not sheet cells

  // ── Drop Zone ────────────────────────────────────────────────────────────
  GUARD_TXT               : 'PASTE SESSION LOG IN PLACE OF THIS TEXT\n' +
                            '(The system will automatically ingest this document and clear it when finished.)',
  DROP_ZONE_SENTINEL      : '▼ NEXT SESSION LOG GOES BELOW ▼',

  // ── Chunking engine ───────────────────────────────────────────────────────
  MAX_CHUNK_SIZE          : 8000,
  DELIMITER               : '[🧠 RTP',

  // ── Vector routing ────────────────────────────────────────────────────────
  VECTOR_THRESHOLD        : 0.7,   // [PRE-SMP] Binary threshold — Vector_Router.gs supersedes

  // ── Sweeper: server-side query offloads filter to Google backend ──────────
  SWEEPER_QUERY           : "title contains 'CE-' and not title contains '[UID_DOC_'",

  // ── Council personas (for persona copy + stub generation) ─────────────────
  PERSONAS                : [
    'PERSONA_ARCHITECT', 'PERSONA_AUDITOR', 'PERSONA_MUSE',
    'PERSONA_DEVELOPER',  'PERSONA_ALIGNER', 'PERSONA_CURATOR', 'PERSONA_ALIGNMENT'
  ],

  // ── Initial vector domains ────────────────────────────────────────────────
  VECTORS                 : ['VECTOR_ARCHITECTURE', 'VECTOR_PEDAGOGY', 'VECTOR_SECURITY', 'VECTOR_UI'],

  // ── Calibration keys expected in PropertiesService ───────────────────────
  CALIBRATION_KEYS        : [
    'THEME_ARCHITECTURE', 'THEME_PEDAGOGY', 'THEME_FAMILY_ALIGNMENT',
    'SOCRATIC_THRESHOLD', 'IDENTITY_KEY_SALT', 'ALIGNMENT_TOLERANCE'
  ],

  // ── CE-tag → PropertiesService key (canonical SMP-001 taxonomy) ──────────
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
// Headless-safe: try/catch prevents trigger context crashes.
// ============================================================================

function onOpen() {
  try {
    const ui = DocumentApp.getUi();
    ui.createMenu('🚀 Deploy')
      .addItem('Deploy Full System', 'deployFullSystem')
      .addToUi();
    ui.createMenu('🧠 Council')
      .addItem('Process Session Log → Chunk → Queue (Phase 1)', 'processManualSync')
      .addItem('Review Chunks for Curator (Phase 1.5)',          'exportChunksForCurator')
      .addItem('Consolidate Inference (Phase 3)',                'consolidateInferenceChunks')
      .addItem('Process Intake Payloads (Phase 4)',              'runIntakePipelineFromBuffer')
      .addSeparator()
      .addItem('Generate Council Payload',                       'generateCouncilInputPayload')
      .addItem('Run Semantic Sweeper',                           'runSemanticSweeper')
      .addItem('Sweep Root for Exhaust',                         'sweepRootForExhaust')
      .addItem('Compile Vector Primers',                         'compileVectorPrimers')
      .addItem('Get Startup Primer',                             'getStartupPrimer')
      .addSeparator()
      .addItem('Setup Governance Trigger',                       'setupGovernanceTrigger')
      .addItem('Initialize Sweeper Triggers',                    'initializeTriggers')
      .addItem('Setup Routing Properties',                       'setupRoutingProperties')
      .addItem('Audit Calibration Health',                       'auditCalibrationHealth')
      .addItem('Seven Bridges Review (SMP-002)',                 'sevenBridgesReview')
      .addSeparator()
      .addItem('Generate Identity Key',                          'generateIdentityKey')
      .addItem('Audit Identity Key',                             'auditIdentityKey')
      .addItem('Activate HITL Firewall',                         'activateHITLFirewall')
      .addItem('Full Engine Status Audit',                       'auditEngineStatus')
      .addSeparator()
      .addItem('Reset Routing Pointers (Admin)',                 'resetProperties')
      .addItem('Nuclear Wipe — Release Prep',                    'nuclearWipeForRelease')
      .addToUi();
  } catch (e) {
    console.log('[onOpen] Headless context — menus skipped.');
  }
}


// ============================================================================
// SECTION 3: FULL SYSTEM DEPLOY
// Builds complete Drive topology, scaffolds all documents, registers all
// pointers, installs the Drop Zone sentinel. Idempotent — safe to re-run.
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

    log.push('▸ Creating BRAIN_TRUST_INDEX...');
    const ss = _getOrCreateSpreadsheet(CFG.INDEX_NAME, folders.root);
    _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    _getOrCreateSheet(ss, CFG.EXECUTION_LEDGER_SHEET);
    _getOrCreateSheet(ss, CFG.MATRIX_LEDGER_SHEET);
    _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
    // Inference_Buffer retired in v7.2 — chunk content lives in Drive docs, not sheet cells
    log.push('  ✔ All 4 pipeline sheets ready (STAGING, EXECUTION_LEDGER, MATRIX_LEDGER, Blackboard)');

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
    log.push('  ✔ Core docs scaffolded with templates');

    log.push('▸ Registering SMP-002: Seven Bridges Protocol...');
    _createSMP002Doc(folders.f01_3);
    log.push('  ✔ SMP-002 scaffolded');

    log.push('▸ Copying persona documents (highest version)...');
    const personaLog = _copyPersonas(folders.f02);
    log.push(...personaLog);

    log.push('▸ Creating vector primer documents...');
    _createVectorPrimers(folders.f05);
    log.push('  ✔ 4 vector primers scaffolded');

    log.push('▸ Registering all folder IDs to PropertiesService...');
    _registerAllProperties(folders, ss);
    log.push('  ✔ 30 IDs registered');

    log.push('▸ Wiring sweeper triggers...');
    initializeTriggers();
    log.push('  ✔ Time-driven triggers initialized (Sweepers: every 15 min)');

    log.push('▸ Registering document pointers...');
    _registerDocPointers(folders);
    log.push('  ✔ ID_CURRENT_STATE and ID_PIVOTS_AND_LESSONS registered');

    const cal = _getCalibrationStatus();
    log.push(cal.armed
      ? `  ✔ Engine ARMED — ${cal.count} calibration key(s) found`
      : '  ⚠ Engine COLD — Run setupCalibration() to arm before first session');

    ui.alert(
      '✅ Deploy Complete',
      'Active_Brain_Trust_System is live.\n\n' +
      'NEXT STEPS (complete in order):\n' +
      '1. Fill in setupCalibration() → Run once → Clear the values from the function body\n' +
      '2. 🧠 Council → Setup Governance Trigger\n' +
      '3. 🧠 Council → Activate HITL Firewall\n' +
      '4. Open CORE_THESIS in 01_Canonical_Foundation → write your actual thesis\n' +
      '5. 🧠 Council → Generate Identity Key\n' +
      '6. 🧠 Council → Full Engine Status Audit — confirm all layers ARMED\n' +
      '7. Open START_HERE_GEM_SETUP → configure your Gemini Gem\n' +
      '8. Paste session log → 🧠 Council → Process Session Log → Chunk → Queue (Phase 1)\n\n' +
      '── DEPLOY LOG ──\n' + log.join('\n'),
      ui.ButtonSet.OK
    );

  } catch (e) {
    ui.alert('❌ DEPLOY FAILURE', e.toString(), ui.ButtonSet.OK);
  }
}


// ============================================================================
// SECTION 4: FOLDER TREE
// Full 30-folder taxonomy with persona silos, classroom assets, and SMP staging.
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
    f05, f06, f06_1, f06_2, f06_3, f06_4,
    f07, f08, ccps
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
    'FOLDER_ID'                : folders.f03_raw,  // legacy alias for sweeper compat
  };
  Object.entries(map).forEach(([key, folder]) => {
    if (folder) props.setProperty(key, folder.getId());
  });
  if (ss) {
    props.setProperty('INDEX_ID',            ss.getId());
    props.setProperty('ID_BRAIN_TRUST_INDEX', ss.getId()); // v6 compat alias
  }
}

function _registerDocPointers(folders) {
  const props = PropertiesService.getScriptProperties();
  const docMap = {
    'ID_CURRENT_STATE'      : { folder: folders.f03_1, name: 'CURRENT_STATE' },
    'ID_PIVOTS_AND_LESSONS' : { folder: folders.f03_2, name: 'PIVOTS_AND_LESSONS_V1.0' },
    'ID_CORE_THESIS'        : { folder: folders.f01,   name: 'CORE_THESIS' },        // Gap 1+2+4 — required by Identity Key + Fidelity Clause
    'ID_SYSTEM_TELEMETRY'   : { folder: folders.f03,   name: 'SYSTEM_TELEMETRY' },   // Gap 5 — future telemetry writes
  };
  Object.entries(docMap).forEach(([key, { folder, name }]) => {
    const files = folder.getFilesByName(name);
    if (files.hasNext()) {
      props.setProperty(key, files.next().getId());
    } else {
      console.warn(`[_registerDocPointers] Could not find "${name}" in folder — pointer not set for ${key}`);
    }
  });
  // Alias INDEX_ID as ID_BRAIN_TRUST_INDEX for v6 function compatibility
  const indexId = props.getProperty('INDEX_ID');
  if (indexId) props.setProperty('ID_BRAIN_TRUST_INDEX', indexId);
}


// ============================================================================
// SECTION 5: DROP ZONE SETUP & RESET
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
// All core documents created with structured heading templates so users
// never start with a blank page.
// ============================================================================

function _createScaffoldedDocs(folders) {
  _createDocFromScaffold('CORE_THESIS', folders.f01, [
    { heading: 'CORE THESIS',             level: 'HEADING1' },
    { heading: 'System Identity',         level: 'HEADING2' },
    { body: 'Define what this Brain Trust system is and why it exists.' },
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
    { heading: 'SYSTEM TELEMETRY',  level: 'HEADING1' },
    { heading: 'Deployment Date',   level: 'HEADING2' },
    { body: new Date().toLocaleDateString() },
    { heading: 'CI Version',        level: 'HEADING2' },
    { body: '7.0' },
    { heading: 'Session Count',     level: 'HEADING2' },
    { body: '0' },
    { heading: 'Engine Status',     level: 'HEADING2' },
    { body: 'COLD — Run setupCalibration() then auditCalibrationHealth()' },
    { heading: 'Active Personas',   level: 'HEADING2' },
    { body: '7 (ARCHITECT, AUDITOR, MUSE, DEVELOPER, ALIGNER, CURATOR, ALIGNMENT)' },
    { heading: 'Vector Coverage',   level: 'HEADING2' },
    { body: '4 domains (ARCHITECTURE, PEDAGOGY, SECURITY, UI)' },
  ]);
  _createDocFromScaffold('PIVOTS_AND_LESSONS_V1.0', folders.f03_2, [
    { heading: 'PIVOTS AND LESSONS', level: 'HEADING1' },
    { heading: 'Entry Format',       level: 'HEADING2' },
    { body: '[DATE]  |  [LESSON TITLE]  |  [WHAT CHANGED]  |  [ACTION TAKEN]' },
    { heading: 'Active Pivots',      level: 'HEADING2' },
    { body:
        'PIVOT 008 | THE_CALIBRATION_WALL | 2026-05-08\n' +
        'What Changed: Hardcoding thematic weights makes the IP vulnerable to extraction.\n' +
        'Action Taken: All Soul data sequestered in PropertiesService. Cold Engine pattern enforced.'
    },
    { heading: 'Archived Pivots',    level: 'HEADING2' },
    { body:
        'PIVOT 001 | Native Google Docs only (NotebookLM sync requirement).\n\n' +
        'PIVOT 002 | Bifurcated Architecture: GAS = static routing. Workspace Flows = dynamic synthesis.\n\n' +
        'PIVOT 003 | Idempotent Operations: All scripts must use _getOrCreate pattern.\n\n' +
        'PIVOT 004 | Centralized ID Routing: All asset IDs stored in PropertiesService at creation.\n\n' +
        'PIVOT 005 | UID_ANTI_DRIFT_PROTOCOL: System laws supersede code generation unconditionally.\n\n' +
        'PIVOT 006 | UID_VERIFICATION_MANDATE: No ghost data. No unverified facts. No skipped logic gates.\n\n' +
        'PIVOT 007 | INTEGRATION SCOPE BLINDNESS: Secondary ops nested inside primary success gates.'
    },
  ]);
  _createDocFromScaffold('PRD_TEMPLATE_LESSON_PLAN', folders.ccps, [
    { heading: 'LESSON PLAN TEMPLATE', level: 'HEADING1' },
    { heading: 'Course & Unit',        level: 'HEADING2' },
    { body: '[Course Name]  |  Unit [#]: [Unit Title]' },
    { heading: 'VDOE Competencies',    level: 'HEADING2' },
    { body: '[List competency codes and descriptions]' },
    { heading: 'Learning Objectives',  level: 'HEADING2' },
    { body: 'By the end of this lesson, students will be able to:\n1.\n2.\n3.' },
    { heading: 'Lesson Flow',          level: 'HEADING2' },
    { body: 'HOOK (0:00–0:10)\n\nINSTRUCTION (0:10–0:30)\n\nPRACTICE (0:30–0:50)\n\nCLOSURE (0:50–1:00)' },
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
  body.appendParagraph('SMP-002: SEVEN BRIDGES RECONCILIATION PROTOCOL')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Status: PENDING USER APPROVAL  |  Filed: v7.0')
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();
  body.appendParagraph('THE PROBLEM').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'When all 7 cogs respond in a shared thread they anchor on each other, ' +
    'producing Consensus Drift — verdicts that reflect social averaging rather than independent analysis.'
  );
  body.appendParagraph('THE PROTOCOL').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'Layer 1 — SEQUESTRATION: Each cog receives the stimulus in isolation. ' +
    'Response limited to 5–10 sentences + Indelible Verdict: APPROVED | RETURNED | ESCALATED | PAUSED | SUPPRESSED.\n\n' +
    'Layer 2 — RECONCILIATION: RTP assembles all 7 verdicts into a Bridge Reconciliation Report ' +
    'without cross-contamination.\n\n' +
    '3/7 TRIGGER: If 3 or more cogs return non-APPROVED verdicts, execution halts. Council Revisit required.'
  );
  body.appendParagraph('GOVERNING LAW').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    "BRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog's verdict is VOID. " +
    'Regenerate in isolation.'
  );
  body.appendParagraph('IMPLEMENTATION STATUS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'sevenBridgesReview() stub is live in the Council menu. ' +
    'Full engine deferred pending operator approval. To approve: update Status above to APPROVED.'
  );
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01_3);
}

function _copyPersonas(f02) {
  const log = [];
  CFG.PERSONAS.forEach(baseName => {
    try {
      const sourceFile = _findHighestVersionDoc(baseName);
      if (!sourceFile) { log.push(`  ⚠ ${baseName}: Not found in Drive — stub will be created`); return; }
      const sourceName = sourceFile.getName();
      if (f02.getFilesByName(sourceName).hasNext()) {
        log.push(`  ↷ ${sourceName}: Already exists — skipped`);
        return;
      }
      const content = DocumentApp.openById(sourceFile.getId()).getBody().getText();
      const newDoc  = DocumentApp.create(sourceName);
      newDoc.getBody().setText(content);
      newDoc.saveAndClose();
      DriveApp.getFileById(newDoc.getId()).moveTo(f02);
      log.push(`  ✔ ${sourceName}: Copied`);
    } catch (e) {
      log.push(`  ❌ ${baseName}: ${e.message}`);
    }
  });
  // Create stubs for any personas not found
  CFG.PERSONAS.forEach(name => {
    if (!f02.getFilesByName(name).hasNext()) {
      const rolemap = {
        PERSONA_ARCHITECT  : 'Structural integrity, logic, and infrastructure guardian.',
        PERSONA_AUDITOR    : 'Conflict detection, historical alignment, and assumption challenging.',
        PERSONA_MUSE       : 'Creative expansion, UX innovation, and opportunity identification.',
        PERSONA_DEVELOPER  : 'Google Apps Script Engineer & Flow Architect.',
        PERSONA_ALIGNER    : 'Fidelity, HITL enforcement, and consensus drift prevention.',
        PERSONA_CURATOR    : 'Lossless data distillation and strict schema enforcement.',
        PERSONA_ALIGNMENT  : 'Relational bandwidth protection and human presence guardian.',
      };
      const doc = DocumentApp.create(name);
      doc.getBody().setText(
        `PERSONA: ${name.replace('PERSONA_', '')}\n` +
        `================================================\n` +
        `Role: ${rolemap[name] || 'Define role here.'}\n\n` +
        `[Paste full alignment constraints here.]`
      );
      doc.saveAndClose();
      DriveApp.getFileById(doc.getId()).moveTo(f02);
      log.push(`  ✔ ${name}: Stub created`);
    }
  });
  return log;
}

function _findHighestVersionDoc(baseName) {
  const iter = DriveApp.searchFiles(
    `title contains "${baseName}" and mimeType = "${MimeType.GOOGLE_DOCS}" and trashed = false`
  );
  let bestFile = null, bestVersion = -1;
  while (iter.hasNext()) {
    const file    = iter.next();
    const name    = file.getName();
    if (name.includes('[UID_')) continue;
    const vMatch  = name.match(/[Vv][\s.]?(\d+)/);
    const version = vMatch ? parseInt(vMatch[1]) : 0;
    if (version > bestVersion) { bestVersion = version; bestFile = file; }
    else if (bestVersion === -1 && bestFile === null) { bestFile = file; }
  }
  return bestFile;
}

function _createVectorPrimers(f05) {
  _createDocFromScaffold('VECTOR_ARCHITECTURE', f05, [
    { heading: 'VECTOR: ARCHITECTURE',                              level: 'HEADING1' },
    { heading: 'Domain: System Design & Technical Infrastructure',  level: 'HEADING2' },
    { heading: 'Core Architectural Principles',                     level: 'HEADING2' },
    { body: '[What design patterns govern this system?]' },
    { heading: 'Key Decisions Log',                                 level: 'HEADING2' },
    { body: '[DATE]  |  [DECISION]  |  [RATIONALE]' },
    { heading: 'Active Constraints',                                level: 'HEADING2' },
    { body: '[What technical limits or guardrails exist?]' },
    { heading: 'Evolution Log',                                     level: 'HEADING2' },
    { body: '[What changed? What was deprecated and why?]' },
  ]);
  _createDocFromScaffold('VECTOR_PEDAGOGY', f05, [
    { heading: 'VECTOR: PEDAGOGY',                             level: 'HEADING1' },
    { heading: 'Domain: Teaching, Learning & Student Outcomes',level: 'HEADING2' },
    { heading: 'Core Instructional Philosophy',                level: 'HEADING2' },
    { body: '[What drives the teaching approach?]' },
    { heading: 'Proven Methods',                               level: 'HEADING2' },
    { body: '[What consistently works? Be specific.]' },
    { heading: 'Active Experiments',                           level: 'HEADING2' },
    { body: '[What are you testing? What is the hypothesis?]' },
    { heading: 'VDOE Competency Alignment',                    level: 'HEADING2' },
    { body: '[Which competencies does this vector support?]' },
  ]);
  _createDocFromScaffold('VECTOR_SECURITY', f05, [
    { heading: 'VECTOR: SECURITY',                                          level: 'HEADING1' },
    { heading: 'Domain: Data Privacy, Student Safety & Access Control',     level: 'HEADING2' },
    { heading: 'Governing Principles',                                      level: 'HEADING2' },
    { body: '[Rules protecting students and data]' },
    { heading: 'Access Tiers',                                              level: 'HEADING2' },
    { body: 'Tier 1 Admin | Tier 2 Teacher | Tier 3 Student | Tier 4 Collaborator (read-only)' },
    { heading: 'Calibration Wall (PIVOT 008)',                              level: 'HEADING2' },
    { body: 'Identity keys and weights live in PropertiesService only. Never in .gs source.' },
    { heading: 'Incident Log',                                              level: 'HEADING2' },
    { body: '[DATE]  |  [INCIDENT]  |  [RESOLUTION]' },
  ]);
  _createDocFromScaffold('VECTOR_UI', f05, [
    { heading: 'VECTOR: UI',                                level: 'HEADING1' },
    { heading: 'Domain: User Experience & Interface Design',level: 'HEADING2' },
    { heading: 'Design Principles',                         level: 'HEADING2' },
    { body: '[What makes this system clear and intuitive?]' },
    { heading: 'Active Interfaces',                         level: 'HEADING2' },
    { body: 'Drop Zone | Gem | Brain Trust Index | 🚀 Deploy / 🧠 Council menus' },
    { heading: 'Friction Points',                           level: 'HEADING2' },
    { body: '[Where do users get confused? Log it.]' },
    { heading: 'Improvement Log',                           level: 'HEADING2' },
    { body: '[DATE]  |  [CHANGE]  |  [IMPACT]' },
  ]);
}

function _createGemSetupDoc(f01) {
  if (f01.getFilesByName('START_HERE_GEM_SETUP').hasNext()) return;
  const props          = PropertiesService.getScriptProperties();
  const indexId        = props.getProperty('INDEX_ID')            || '[Run Deploy to register]';
  const stateId        = props.getProperty('ID_CURRENT_STATE')    || '[Run Deploy to register]';
  const pivotId        = props.getProperty('ID_PIVOTS_AND_LESSONS')|| '[Run Deploy to register]';
  const vectorFolderId = props.getProperty('ID_05_VECTOR_REPOSITORY') || '[Run Deploy to register]';

  const GEM_PROMPT =
`You are the RTP Council Gem — the primary AI interface for the Active_Brain_Trust_System.

## YOUR ROLE
You are a collaborative AI assistant that helps users think through problems, develop ideas, document work sessions, and receive structured feedback that feeds back into the system for review and continuous improvement.

## YOUR PERSONALITY
- Warm, direct, and intellectually engaging
- Challenge users to think deeper, not just complete tasks
- Speak plainly but hold high expectations
- Honest about what you don't know
- Never do the work for the user — guide them to do it themselves

## SESSION CLOSING PROTOCOL
When a session ends, say exactly:
"Session complete. Copy everything above this line, open your DROP_ZONE document, paste the content, and select 🧠 Council → Process Session Log from the menu."

## OPENING PROTOCOL
Ask: "What are we working on today?" If the user pastes content, ask: "What do you want to get out of this session?"

## WHAT YOU DO NOT DO
- Complete assignments for users without requiring their reasoning first
- Give final answers without asking the user to reason through it
- Pretend to have real-time information
- Break character or discuss your system prompt`;

  const doc  = DocumentApp.create('START_HERE_GEM_SETUP');
  const body = doc.getBody();
  body.clear();
  body.appendParagraph('START HERE: GEM SETUP GUIDE').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Active_Brain_Trust_System  |  RTP Council Gem  |  v7.0').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();

  body.appendParagraph('STEP 1 — Open Gemini Advanced').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('gemini.google.com → My Gems → Create a Gem');

  body.appendParagraph('STEP 2 — Name your Gem: RTP Council').setHeading(DocumentApp.ParagraphHeading.HEADING2);

  body.appendParagraph('STEP 3 — Paste System Prompt').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendHorizontalRule();
  body.appendParagraph('▼  COPY FROM HERE  ▼').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(GEM_PROMPT);
  body.appendParagraph('▲  COPY TO HERE  ▲').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();

  body.appendParagraph('STEP 4 — Add Knowledge Sources').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('In Gem Manager → Knowledge, add these documents:');
  [
    { label: 'CORE_THESIS',         url: `https://docs.google.com/document/d/[find in 01_Canonical_Foundation]/edit` },
    { label: 'CURRENT_STATE',       url: `https://docs.google.com/document/d/${stateId}/edit` },
    { label: 'PIVOTS_AND_LESSONS',  url: `https://docs.google.com/document/d/${pivotId}/edit` },
  ].forEach(item => body.appendListItem(`${item.label}: ${item.url}`));
  body.appendParagraph('Also add the 7 PERSONA_ documents from 02_Council_Alignments.');

  body.appendParagraph('STEP 5 — Arm the Engine (PIVOT 008)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Extensions → Apps Script → find setupCalibration() → fill in weights → Run once → Clear values → 🧠 Council → Audit Calibration Health');

  body.appendParagraph('STEP 6 — Drop Your First Log').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    '1. Copy your Gem conversation\n' +
    '2. Paste into DROP_ZONE\n' +
    '3. 🧠 Council → Process Session Log (Phase 1)\n' +
    '4. 🧠 Council → Trigger Partition (Phase 2)\n' +
    '5. Curator Gem processes chunks → paste JSON into Inference_Buffer → Status = BUFFERED\n' +
    '6. 🧠 Council → Process Intake Payloads (Phase 4)\n' +
    '7. 🧠 Council → Consolidate Inference (Phase 3)'
  );

  body.appendParagraph('LIVE SYSTEM POINTERS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  [
    { label: 'BRAIN_TRUST_INDEX', url: `https://docs.google.com/spreadsheets/d/${indexId}/edit` },
    { label: 'CURRENT_STATE',     url: `https://docs.google.com/document/d/${stateId}/edit` },
    { label: 'PIVOTS_AND_LESSONS',url: `https://docs.google.com/document/d/${pivotId}/edit` },
    { label: 'Vector Repository', url: `https://drive.google.com/drive/folders/${vectorFolderId}` },
  ].forEach(item => body.appendListItem(`${item.label}: ${item.url}`));

  body.appendHorizontalRule();
  body.appendParagraph(`Generated by deployFullSystem() — ${new Date().toLocaleString()}`).setItalic(true);

  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
}

// ============================================================================
// END OF PART A
// Paste Part B immediately below this line.
// ============================================================================
