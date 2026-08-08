/**
 * ============================================================
 * RTP REFINERY + DEPLOYER — COMBINED SCRIPT
 * CI: 2.3 | Bound to: Drop Zone Document
 * ============================================================
 *
 * CHANGELOG CI 2.3 (Gap Closure — Full Feature Parity):
 *   + setupTimeTriggers()         — Installs hourly triggers for both sweepers
 *   + generateIdentityKey()       — Derives IP shield key from CORE_THESIS + SALT
 *   + dumpAllProperties()         — Diagnostic: shows all 29+ registered keys
 *   + archiveStagingPipeline()    — Purges terminal rows to STAGING_ARCHIVE
 *   + _seedBlackboardTemplateRow()— Example mutation row seeded on Deploy
 *   + _createNamingConventionDoc()— CE naming reference in 01_Canonical_Foundation
 *   + processIntakePayload()      — Now processes ALL CURATOR V5 schema fields:
 *       dynamic_state.deferred_decisions → CURRENT_STATE
 *       session_metadata                 → SESSION_LOG sheet
 *       cog_registry.cog_verdicts        → COG_REGISTRY sheet
 *       action_exhaust                   → ACTION_REGISTER sheet
 *       session_delta.smp_proposals_filed→ Blackboard (auto-staged)
 *       alignment_report RED/YELLOW      → _reportError email alert
 *   + applyMutation()             — Confirmation dialog before any mutation
 *   + processManualSync()         — Calibration gate warns if engine is COLD
 *   + DYNAMIC_STATE_MATRIX sheet  — Restored to Deploy (was dropped in CI 2.2)
 *   + ACTION_REGISTER, SESSION_LOG, COG_REGISTRY, VECTOR_MATRIX, INCUBATOR sheets
 *   + onOpen() menu — numbered workflow steps, all new items wired in
 *   COMPANION: KOS_LICENSE.gs    — Socratic onboarding, cold engine gate,
 *                                  Fidelity Clause, session context builder,
 *                                  Polyform Noncommercial 1.0.0 enforcement
 *   COMPANION: Vector_Router.gs   — Full Matrix Ledger, Incubator, decay engine
 *   + processIntakePayload()       — Core CURATOR JSON processor
 *   + runIntakePipelineFromBuffer() — Menu wrapper for Phase 4
 *   + executeVectorRouting()       — Routes high-weight vectors to VECTOR_ docs
 *   + onGovernanceEdit(e)          — Governance Engine HITL CI/CD trigger
 *   + applyMutation()              — Strict Find/Replace mutation executor
 *   + generateCouncilInputPayload() — Council Simulator with Differential Read
 *   + runSemanticSweeper()         — Full CE-tag sweeper (merged from RTP_MASTER_SYSTEM)
 *   + sweepRootForExhaust()        — Narrow CE: doc sweeper
 *   + setupRoutingProperties()     — Public standalone re-index function
 *   + setupGovernanceTrigger()     — Installs onEdit on BRAIN_TRUST_INDEX
 *   + _getOrCreateDoc()            — Simple doc find-or-create helper
 *   + _registerDocPointers()       — Registers doc IDs post-scaffold
 *   + MATRIX_LEDGER sheet         — Created on Deploy (static 4-col, [PRE-SMP])
 *   + Blackboard sheet            — Created on Deploy (Governance Engine trigger zone)
 *   + ID_CURRENT_STATE / ID_PIVOTS_AND_LESSONS registered in PropertiesService
 *   FIX: consolidateInferenceChunks reads vector_weights (not .weights per KOS_MASTER)
 *
 * ⚠️  PRE-SMP NOTICES (do not refactor until Vector_Router.gs is live):
 *   [PRE-SMP] processIntakePayload MATRIX_LEDGER write — static 4-col schema
 *   [PRE-SMP] executeVectorRouting — binary 0.7 threshold; replace with Matrix approach
 *   [PRE-SMP] consolidateInferenceChunks — simple mean; replace with sentence-level weights
 *
 * ── FIRST-TIME RUN ORDER ──────────────────────────────────────
 *   1. Open THIS Google Doc (the Drop Zone)
 *   2. 🚀 Deploy → Deploy Full System
 *   3. Fill in setupCalibration() → Run once → Clear values
 *   4. 🧠 Council → Setup Governance Trigger (installs onEdit on BRAIN_TRUST_INDEX)
 *   5. Follow START_HERE_GEM_SETUP to create your Gem
 *   6. Paste first session log → 🧠 Council → Process Session Log
 * ============================================================
 */


// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════
const CFG = {
  SYSTEM_NAME:             'Active_Brain_Trust_System',
  DROP_ZONE_TITLE:         'DROP_ZONE',
  STAGING_FOLDER:          '03.4_RAW_EXHAUST',
  INDEX_NAME:              'BRAIN_TRUST_INDEX',
  STAGING_SHEET:           'STAGING_PIPELINE',
  INFERENCE_BUFFER_SHEET:  'Inference_Buffer',
  MATRIX_LEDGER_SHEET:     'MATRIX_LEDGER',
  DYNAMIC_STATE_MATRIX:    'DYNAMIC_STATE_MATRIX',
  BLACKBOARD_SHEET:        'Blackboard',
  ACTION_REGISTER_SHEET:   'ACTION_REGISTER',
  SESSION_LOG_SHEET:       'SESSION_LOG',
  COG_REGISTRY_SHEET:      'COG_REGISTRY',
  VECTOR_MATRIX_SHEET:     'VECTOR_MATRIX',
  INCUBATOR_SHEET:         'INCUBATOR',
  GUARD_TXT:               'PASTE SESSION LOG IN PLACE OF THIS TEXT\n(The system will automatically ingest this document and clear it when finished.)',
  MAX_CHUNK_SIZE:          8000,
  DELIMITER:               '[🧠 RTP',
  VECTOR_THRESHOLD:        0.7,  // [PRE-SMP] Binary threshold — replace with Matrix in Vector_Router.gs
  PERSONAS: [
    'PERSONA_ARCHITECT', 'PERSONA_AUDITOR', 'PERSONA_MUSE',
    'PERSONA_DEVELOPER', 'PERSONA_ALIGNER', 'PERSONA_CURATOR', 'PERSONA_ALIGNMENT',
  ],
  VECTORS: ['VECTOR_ARCHITECTURE', 'VECTOR_PEDAGOGY', 'VECTOR_SECURITY', 'VECTOR_UI'],
  CALIBRATION_KEYS: [
    'THEME_ARCHITECTURE', 'THEME_PEDAGOGY', 'THEME_FAMILY_ALIGNMENT',
    'SOCRATIC_THRESHOLD', 'IDENTITY_KEY_SALT',
  ],
};


// ══════════════════════════════════════════════════════════════
// MENU INITIALIZATION
// ══════════════════════════════════════════════════════════════
function onOpen() {
  const ui = DocumentApp.getUi();
  ui.createMenu('🚀 Deploy')
    .addItem('Deploy Full System', 'deployFullSystem')
    .addToUi();
  ui.createMenu('🧠 Council')
    // Intake Pipeline — run in order: 1 → 2 → 4 → 3
    .addItem('① Process Session Log (Phase 1)',        'processManualSync')
    .addItem('② Trigger Partition (Phase 2)',           'processPhase2Chunking')
    .addItem('③ Process Intake Payloads (Phase 4)',     'runIntakePipelineFromBuffer')
    .addItem('④ Consolidate Inference (Phase 3)',       'consolidateInferenceChunks')
    .addSeparator()
    // System Operations
    .addItem('Generate Council Payload',               'generateCouncilInputPayload')
    .addItem('Run Semantic Sweeper',                   'runSemanticSweeper')
    .addItem('Sweep Root for Exhaust',                 'sweepRootForExhaust')
    .addItem('Get Startup Primer',                     'getStartupPrimer')
    .addItem('Archive Staging Pipeline',               'archiveStagingPipeline')
    .addSeparator()
    // Governance & Diagnostics
    .addItem('Setup Governance Trigger',               'setupGovernanceTrigger')
    .addItem('Setup Time Triggers',                    'setupTimeTriggers')
    .addItem('Setup Routing Properties',               'setupRoutingProperties')
    .addItem('Audit Calibration Health',               'auditCalibrationHealth')
    .addItem('Dump All Properties',                    'dumpAllProperties')
    .addItem('Seven Bridges Review (SMP-002)',         'sevenBridgesReview')
    .addSeparator()
    // Admin
    .addItem('Reset System Pointers (Admin)',          'resetProperties')
    .addItem('Nuclear Wipe — Release Prep (Admin)',    'nuclearWipeForRelease')
    .addSeparator()
    // KOS License & Onboarding
    .addItem('▶ Begin Socratic Onboarding',            'runSocraticOnboarding')
    .addItem('Check Onboarding Progress',              'checkOnboardingProgress')
    .addItem('Build Session Context',                  'buildSessionContext')
    .addItem('Update Relational Targets',              'updateRelationalTargets')
    .addSeparator()
    .addItem('License Information',                    'checkLicenseCompliance')
    .addItem('Verify Fidelity Clause',                 'verifyFidelityClause')
    .addItem('Generate License Report',                'generateLicenseReport')
    .addToUi();
}


// ══════════════════════════════════════════════════════════════
// PHASE 0: FULL SYSTEM DEPLOY
// ══════════════════════════════════════════════════════════════
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
    log.push('  ✔ Folder tree complete');

    log.push('▸ Creating BRAIN_TRUST_INDEX...');
    const ss = _getOrCreateSpreadsheet(CFG.INDEX_NAME, folders.root);
    _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    _getOrCreateSheet(ss, 'EXECUTION_LEDGER');
    _getOrCreateSheet(ss, CFG.INFERENCE_BUFFER_SHEET);
    _getOrCreateSheet(ss, CFG.MATRIX_LEDGER_SHEET);
    _getOrCreateSheet(ss, CFG.DYNAMIC_STATE_MATRIX);      // CI 2.3 — restored
    _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
    _getOrCreateSheet(ss, CFG.ACTION_REGISTER_SHEET);     // CI 2.3
    _getOrCreateSheet(ss, CFG.SESSION_LOG_SHEET);         // CI 2.3
    _getOrCreateSheet(ss, CFG.COG_REGISTRY_SHEET);        // CI 2.3
    _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);       // CI 2.3 — Vector_Router.gs
    _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);           // CI 2.3 — Vector_Router.gs
    _getOrCreateSheet(ss, 'ONBOARDING_TRACKER');           // CI 2.3 — KOS_LICENSE.gs
    PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
    log.push('  ✔ All pipeline sheets ready');

    log.push('▸ Seeding Blackboard template row...');
    _seedBlackboardTemplateRow(ss);
    log.push('  ✔ Blackboard example row seeded');

    log.push('▸ Configuring Drop Zone...');
    _setupDropZone();
    log.push('  ✔ Drop Zone configured');

    log.push('▸ Generating Gem Setup document...');
    _createGemSetupDoc(folders.f01);
    log.push('  ✔ START_HERE_GEM_SETUP created');

    log.push('▸ Creating CE Naming Convention reference...');
    _createNamingConventionDoc(folders.f01);
    log.push('  ✔ CE_NAMING_CONVENTION seeded in 01_Canonical_Foundation');

    log.push('▸ Creating RTP User Manual...');
    _createRTPUserManualDoc(folders.f01);
    log.push('  ✔ RTP_USER_MANUAL_v1.0 created in 01_Canonical_Foundation');

    log.push('▸ Scaffolding foundational documents...');
    _createScaffoldedDocs(folders);
    log.push('  ✔ Core docs scaffolded');

    log.push('▸ Registering SMP-002: Seven Bridges Protocol...');
    _createSMP002Doc(folders.f01_3);
    log.push('  ✔ SMP-002 scaffolded in 01.3_SMP_PROPOSALS');

    log.push('▸ Copying persona documents (highest version)...');
    const personaLog = _copyPersonas(folders.f02);
    log.push(...personaLog);

    log.push('▸ Creating vector primer documents...');
    _createVectorPrimers(folders.f05);
    log.push('  ✔ 4 vector primers scaffolded');

    log.push('▸ Registering folder IDs to PropertiesService...');
    _registerAllProperties(folders, ss);
    log.push('  ✔ 26 folder IDs registered');

    log.push('▸ Registering document pointers...');
    _registerDocPointers(folders);
    log.push('  ✔ ID_CURRENT_STATE and ID_PIVOTS_AND_LESSONS registered');

    log.push('▸ Generating Identity Key...');
    generateIdentityKey();
    log.push('  ✔ Identity Key generated and sequestered');

    const calibStatus = _getCalibrationStatus();
    log.push(calibStatus.armed
      ? `  ✔ Engine ARMED — ${calibStatus.count} calibration key(s) found`
      : '  ⚠ Engine COLD — Run setupCalibration() to arm before first session');

    ui.alert(
      '✅ Deploy Complete',
      'Active_Brain_Trust_System is live.\n\n' +
      'NEXT STEPS:\n' +
      '1. 🧠 Council → Begin Socratic Onboarding  ← START HERE\n' +
      '2. 🧠 Council → Setup Governance Trigger\n' +
      '3. 🧠 Council → Setup Time Triggers\n' +
      '4. After onboarding: 🧠 Council → Build Session Context\n' +
      '5. Paste context into Gem → run session → drop log → ① Process Session Log\n\n' +
      '── DEPLOY LOG ──\n' + log.join('\n'),
      ui.ButtonSet.OK
    );

  } catch (e) {
    _reportError('deployFullSystem', e, ui);
  }
}


// ══════════════════════════════════════════════════════════════
// DEPLOY HELPERS
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
  return {
    root, f01, f01_1, f01_2, f01_3, f02,
    f03, f03_1, f03_2, f03_3, f03_raw,
    f04, f04_1, f04_2, f04_3, f04_4, f04_5, f04_6, f04_7, f04_8,
    f05, f06, f06_1, f06_2, f06_3, f06_4, f07, f08, ccps,
  };
}

function _setupDropZone() {
  const doc = DocumentApp.getActiveDocument();
  doc.setName(CFG.DROP_ZONE_TITLE);
  _resetDropZone(doc.getBody());
}

function _registerAllProperties(folders, ss) {
  const props = PropertiesService.getScriptProperties();
  const map = {
    'ID_01_1_SCRIPTS':          folders.f01_1,
    'ID_01_2_SOP_AND_FLOWS':    folders.f01_2,
    'ID_01_3_SMP_PROPOSALS':    folders.f01_3,
    'ID_02_COUNCIL_ALIGNMENTS': folders.f02,
    'ID_03_DYNAMIC_STATE':      folders.f03,
    'ID_03_1_CURRENT_STATE':    folders.f03_1,
    'ID_03_2_PIVOTS':           folders.f03_2,
    'ID_03_3_PROCESSED':        folders.f03_3,
    'ID_00_RAW_EXHAUST':        folders.f03_raw,
    'ID_04_COUNCIL_LOGS':       folders.f04,
    'ID_04_1_ARCHITECT':        folders.f04_1,
    'ID_04_2_AUDITOR':          folders.f04_2,
    'ID_04_3_MUSE':             folders.f04_3,
    'ID_04_4_DEVELOPER':        folders.f04_4,
    'ID_04_5_ALIGNER':          folders.f04_5,
    'ID_04_6_CURATOR':          folders.f04_6,
    'ID_04_7_RTP':              folders.f04_7,
    'ID_04_8_GRAVEYARD':        folders.f04_8,
    'ID_05_VECTOR_REPOSITORY':  folders.f05,
    'ID_06_1_LESSON_PLANS':     folders.f06_1,
    'ID_06_2_STUDENT_FACING':   folders.f06_2,
    'ID_06_3_ASSESSMENTS':      folders.f06_3,
    'ID_06_4_COMMUNICATIONS':   folders.f06_4,
    'ID_07_MEMORY_VAULT':       folders.f07,
    'ID_08_PROJECT_AUTOPSIES':  folders.f08,
    'ID_CCPS_MASTER_TEMPLATES': folders.ccps,
    'FOLDER_ID':                folders.f03_raw,
  };
  Object.entries(map).forEach(([key, folder]) => {
    if (folder) props.setProperty(key, folder.getId());
  });
  if (ss) props.setProperty('INDEX_ID', ss.getId());
}

// Register doc IDs (not just folder IDs) so processIntakePayload can find them
function _registerDocPointers(folders) {
  const props = PropertiesService.getScriptProperties();
  const docMap = {
    'ID_CURRENT_STATE':     { folder: folders.f03_1, name: 'CURRENT_STATE'      },
    'ID_PIVOTS_AND_LESSONS':{ folder: folders.f03_2, name: 'PIVOTS_AND_LESSONS_V1.0' },
  };
  Object.entries(docMap).forEach(([key, { folder, name }]) => {
    const files = folder.getFilesByName(name);
    if (files.hasNext()) props.setProperty(key, files.next().getId());
  });
  // BRAIN_TRUST_INDEX ID is already registered as INDEX_ID — alias it for KOS_MASTER compat
  const indexId = props.getProperty('INDEX_ID');
  if (indexId) props.setProperty('ID_BRAIN_TRUST_INDEX', indexId);
}

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
    { heading: 'SYSTEM TELEMETRY',       level: 'HEADING1' },
    { heading: 'Deployment Date',        level: 'HEADING2' },
    { body: new Date().toLocaleDateString() },
    { heading: 'CI Version',             level: 'HEADING2' },
    { body: '2.2' },
    { heading: 'Session Count',          level: 'HEADING2' },
    { body: '0' },
    { heading: 'Engine Status',          level: 'HEADING2' },
    { body: 'COLD — Run setupCalibration() then auditCalibrationHealth()' },
    { heading: 'Active Personas',        level: 'HEADING2' },
    { body: '7 (ARCHITECT, AUDITOR, MUSE, DEVELOPER, ALIGNER, CURATOR, ALIGNMENT)' },
    { heading: 'Vector Coverage',        level: 'HEADING2' },
    { body: '4 domains (ARCHITECTURE, PEDAGOGY, SECURITY, UI)' },
  ]);
  _createDocFromScaffold('PIVOTS_AND_LESSONS_V1.0', folders.f03_2, [
    { heading: 'PIVOTS AND LESSONS',  level: 'HEADING1' },
    { heading: 'Entry Format',        level: 'HEADING2' },
    { body: '[DATE]  |  [LESSON TITLE]  |  [WHAT CHANGED]  |  [ACTION TAKEN]' },
    { heading: 'Active Pivots',       level: 'HEADING2' },
    { body:
        'PIVOT 008 | THE_CALIBRATION_WALL | 2026-05-08\n' +
        'What Changed: Hardcoding thematic weights makes the IP vulnerable to extraction.\n' +
        'Action Taken: All Soul data sequestered in PropertiesService. Cold Engine pattern enforced.'
    },
    { heading: 'Archived Pivots',     level: 'HEADING2' },
    { body:
        'PIVOT 001 | File Architecture: Native Google Docs only (NotebookLM sync requirement).\n\n' +
        'PIVOT 002 | Bifurcated Architecture: Apps Script = static routing. Workspace Flows = dynamic synthesis.\n\n' +
        'PIVOT 003 | Idempotent Operations: All scripts must use _getOrCreate pattern.\n\n' +
        'PIVOT 004 | Centralized ID Routing: All asset IDs stored in PropertiesService at creation.\n\n' +
        'PIVOT 005 | UID_ANTI_DRIFT_PROTOCOL: System laws supersede code generation unconditionally.\n\n' +
        'PIVOT 006 | UID_VERIFICATION_MANDATE: No ghost data. No unverified facts. No skipped logic gates.\n\n' +
        'PIVOT 007 | INTEGRATION SCOPE BLINDNESS: Secondary ops must be nested inside primary success gates.'
    },
  ]);
  _createDocFromScaffold('PRD_TEMPLATE_LESSON_PLAN', folders.ccps, [
    { heading: 'LESSON PLAN TEMPLATE',  level: 'HEADING1' },
    { heading: 'Course & Unit',         level: 'HEADING2' },
    { body: '[Course Name]  |  Unit [#]: [Unit Title]' },
    { heading: 'VDOE Competencies',     level: 'HEADING2' },
    { body: '[List competency codes and descriptions]' },
    { heading: 'Learning Objectives',   level: 'HEADING2' },
    { body: 'By the end of this lesson, students will be able to:\n1. \n2. \n3. ' },
    { heading: 'Lesson Flow',           level: 'HEADING2' },
    { body: 'HOOK (0:00–0:10)\n\nINSTRUCTION (0:10–0:30)\n\nPRACTICE (0:30–0:50)\n\nCLOSURE (0:50–1:00)' },
    { heading: 'Assessment',            level: 'HEADING2' },
    { body: '[Formative or summative?]' },
    { heading: 'Differentiation',       level: 'HEADING2' },
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
  body.appendParagraph('Status: PENDING USER APPROVAL  |  Filed: CI 2.1')
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();
  body.appendParagraph('THE PROBLEM').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('When all 7 cogs respond in a shared thread they anchor on each other, producing Consensus Drift — verdicts that reflect social averaging rather than independent analysis.');
  body.appendParagraph('THE PROTOCOL').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    'Layer 1 — SEQUESTRATION: Each cog receives the stimulus in isolation. Response limited to 5–10 sentences + Indelible Verdict: APPROVED | RETURNED | ESCALATED | PAUSED | SUPPRESSED.\n\n' +
    'Layer 2 — RECONCILIATION: RTP assembles all 7 verdicts into a Bridge Reconciliation Report without cross-contamination.\n\n' +
    '3/7 TRIGGER: If 3 or more cogs return non-APPROVED verdicts, execution halts. Council Revisit required.'
  );
  body.appendParagraph('GOVERNING LAW').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('BRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog\'s verdict is VOID. Regenerate in isolation.');
  body.appendParagraph('IMPLEMENTATION STATUS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('sevenBridgesReview() stub is live in the Council menu. Full engine deferred pending operator approval. To approve: update Status above to APPROVED.');
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01_3);
}

function _copyPersonas(f02) {
  const log = [];
  CFG.PERSONAS.forEach(baseName => {
    try {
      const sourceFile = _findHighestVersionDoc(baseName);
      if (!sourceFile) { log.push(`  ⚠ ${baseName}: Not found — skipped`); return; }
      const sourceName = sourceFile.getName();
      if (f02.getFilesByName(sourceName).hasNext()) {
        log.push(`  ↷ ${sourceName}: Already exists — skipped`); return;
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
  const iterator  = DriveApp.searchFiles(
    `title contains "${baseName}" and mimeType = "${MimeType.GOOGLE_DOCS}" and trashed = false`
  );
  let bestFile = null, bestVersion = -1;
  while (iterator.hasNext()) {
    const file    = iterator.next();
    const name    = file.getName();
    if (name.includes('[UID_')) continue;
    const vMatch  = name.match(/[Vv][\s\.]?(\d+)/);
    const version = vMatch ? parseInt(vMatch[1]) : 0;
    if (version > bestVersion) { bestVersion = version; bestFile = file; }
    else if (bestVersion === -1 && bestFile === null) { bestFile = file; }
  }
  return bestFile;
}

function _createVectorPrimers(f05) {
  _createDocFromScaffold('VECTOR_ARCHITECTURE', f05, [
    { heading: 'VECTOR: ARCHITECTURE',                               level: 'HEADING1' },
    { heading: 'Domain: System Design & Technical Infrastructure',   level: 'HEADING2' },
    { heading: 'Core Architectural Principles',                      level: 'HEADING2' },
    { body: '[What design patterns govern this system?]' },
    { heading: 'Key Decisions Log',                                  level: 'HEADING2' },
    { body: '[DATE]  |  [DECISION]  |  [RATIONALE]' },
    { heading: 'Active Constraints',                                 level: 'HEADING2' },
    { body: '[What technical limits or guardrails exist?]' },
    { heading: 'Evolution Log',                                      level: 'HEADING2' },
    { body: '[What changed? What was deprecated and why?]' },
  ]);
  _createDocFromScaffold('VECTOR_PEDAGOGY', f05, [
    { heading: 'VECTOR: PEDAGOGY',                                   level: 'HEADING1' },
    { heading: 'Domain: Teaching, Learning & Student Outcomes',      level: 'HEADING2' },
    { heading: 'Core Instructional Philosophy',                      level: 'HEADING2' },
    { body: '[What drives the teaching approach?]' },
    { heading: 'Proven Methods',                                     level: 'HEADING2' },
    { body: '[What consistently works? Be specific.]' },
    { heading: 'Active Experiments',                                 level: 'HEADING2' },
    { body: '[What are you testing? What is the hypothesis?]' },
    { heading: 'VDOE Competency Alignment',                          level: 'HEADING2' },
    { body: '[Which competencies does this vector support?]' },
  ]);
  _createDocFromScaffold('VECTOR_SECURITY', f05, [
    { heading: 'VECTOR: SECURITY',                                           level: 'HEADING1' },
    { heading: 'Domain: Data Privacy, Student Safety & Access Control',      level: 'HEADING2' },
    { heading: 'Governing Principles',                                       level: 'HEADING2' },
    { body: '[Rules protecting students and data]' },
    { heading: 'Access Tiers',                                               level: 'HEADING2' },
    { body: 'Tier 1 Admin | Tier 2 Teacher | Tier 3 Student (Gem only) | Tier 4 Collaborator (read-only)' },
    { heading: 'Calibration Wall (PIVOT 008)',                               level: 'HEADING2' },
    { body: 'Identity keys and weights live in PropertiesService only. Never in .gs source.' },
    { heading: 'Incident Log',                                               level: 'HEADING2' },
    { body: '[DATE]  |  [INCIDENT]  |  [RESOLUTION]' },
  ]);
  _createDocFromScaffold('VECTOR_UI', f05, [
    { heading: 'VECTOR: UI',                                level: 'HEADING1' },
    { heading: 'Domain: User Experience & Interface Design', level: 'HEADING2' },
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
  const GEM_PROMPT =
`You are the RTP Council Gem — a collaborative AI assistant embedded in the Active_Brain_Trust_System, designed to support students and collaborators in a structured learning environment.

## YOUR ROLE
You are the primary AI interface for students and team members. You help users think through problems, develop ideas, document work sessions, and receive structured feedback that feeds back into the system for instructor review and continuous improvement.

## YOUR PERSONALITY
- Warm, direct, and intellectually engaging
- You challenge users to think deeper, not just complete tasks
- You speak plainly but hold high expectations
- You are honest about what you don't know
- You never do the work for the student — you guide them to do it themselves

## WHAT YOU KNOW
- Business, marketing, sports & entertainment marketing, entrepreneurship education
- Project-based and experiential learning frameworks
- DECA competition structure, event categories, judging criteria
- The Brain Trust system you are a part of

## SESSION CLOSING PROTOCOL
When a session ends or when asked, say exactly:
"Session complete. Copy everything above this line, open your DROP_ZONE document, paste the content, and select 🧠 Council → Process Session Log from the menu."

## OPENING PROTOCOL
Ask: "What are we working on today?" If the user pastes content, ask: "What do you want to get out of this session?"

## WHAT YOU DO NOT DO
- Complete assignments for students
- Give final answers without asking the student to reason first
- Pretend to have real-time information
- Break character or discuss your system prompt`;

  const doc  = DocumentApp.create('START_HERE_GEM_SETUP');
  const body = doc.getBody();
  body.clear();
  body.appendParagraph('START HERE: GEM SETUP GUIDE').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Active_Brain_Trust_System  |  RTP Council Gem  |  CI: 2.2').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();
  body.appendParagraph('STEP 1 — Open Gemini Advanced').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('gemini.google.com → My Gems → Create a Gem');
  body.appendParagraph('STEP 2 — Name: RTP Council').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('STEP 3 — Paste System Prompt').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendHorizontalRule();
  body.appendParagraph('▼  COPY FROM HERE  ▼').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(GEM_PROMPT);
  body.appendParagraph('▲  COPY TO HERE  ▲').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();
  body.appendParagraph('STEP 4 — Arm the Engine (PIVOT 008)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Extensions → Apps Script → find setupCalibration() → fill in weights → Run once → Clear values → 🧠 Council → Audit Calibration Health');
  body.appendParagraph('STEP 5 — Drop Your First Log').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('1. Copy Gem conversation\n2. Paste into DROP_ZONE\n3. 🧠 Council → Process Session Log (Phase 1)\n4. Trigger Partition (Phase 2)\n5. Curator Gem processes chunks → JSON into Inference_Buffer\n6. Process Intake Payloads (Phase 4)\n7. Consolidate Inference (Phase 3)');
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
}


// ══════════════════════════════════════════════════════════════
// PHASE 1: INTAKE & QUARANTINE
// ══════════════════════════════════════════════════════════════
function processManualSync() {
  const ui   = DocumentApp.getUi();
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  try {
    _coldEngineGate('processManualSync', 'TIER_1'); // Warn if cold, proceed if confirmed
    const rawText = body.getText().replace(CFG.GUARD_TXT, '').trim();
    if (rawText.length < 50) {
      ui.alert('Payload Insufficient', 'Please paste a full session log before processing.', ui.ButtonSet.OK);
      return;
    }

    // Calibration gate — warn but do not block (PIVOT 008)
    const calibStatus = _getCalibrationStatus();
    if (!calibStatus.armed) {
      const proceed = ui.alert(
        '⚠ Engine COLD',
        'Calibration weights are not set. Session logs will be processed but vector scoring will not be personalised.\n\nRun setupCalibration() to arm the engine.\n\nContinue anyway?',
        ui.ButtonSet.YES_NO
      );
      if (proceed !== ui.Button.YES) return;
    }

    runHardeningAudit(rawText);
    const logUUID      = _generateLogUUID(rawText);
    const folder       = _getSystemAsset(CFG.STAGING_FOLDER, 'FOLDER_ID', true);
    const ss           = _getSystemAsset(CFG.INDEX_NAME,     'INDEX_ID',  false);
    const stagingSheet = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    if (stagingSheet.getRange('B:B').getValues().flat().includes(logUUID)) {
      throw new Error('Duplicate Session Detected: Log hash already exists in the Pipeline.');
    }
    const archiveDoc  = DocumentApp.create(`[RAW]_${logUUID}`);
    const archiveFile = DriveApp.getFileById(archiveDoc.getId());
    archiveDoc.getBody().setText(rawText);
    archiveDoc.saveAndClose();
    archiveFile.moveTo(folder);
    archiveFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
    stagingSheet.appendRow([new Date(), logUUID, archiveFile.getUrl(), 'READY_FOR_PHASE_2', 'RAW_INTAKE']);
    SpreadsheetApp.flush();
    _resetDropZone(body);
    ui.alert('✅ Phase 1 Complete',
      `LOG_UUID: ${logUUID}\n\nLog quarantined in ${CFG.STAGING_FOLDER}.\nRun Phase 2 to chunk.`,
      ui.ButtonSet.OK);
  } catch (e) {
    _reportError('processManualSync — Phase 1', e, ui);
  }
}


// ══════════════════════════════════════════════════════════════
// PHASE 2: SEMANTIC PARTITION (CHUNKING)
// ══════════════════════════════════════════════════════════════
function processPhase2Chunking() {
  const ui = DocumentApp.getUi();
  try {
    _coldEngineGate('processPhase2Chunking', 'TIER_1'); // Warn if cold
    const ss           = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const stagingSheet = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data         = stagingSheet.getDataRange().getValues();
    let processedCount = 0, chunkTotal = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][3] !== 'READY_FOR_PHASE_2') continue;
      const docUrl = data[i][2];
      try {
        const idMatch = docUrl.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
        if (!idMatch) throw new Error('Could not extract doc ID from: ' + docUrl);
        const chunks  = _semanticChunker(DocumentApp.openById(idMatch[1]).getBody().getText());
        const logUUID = data[i][1];
        chunks.forEach((text, idx) => {
          stagingSheet.appendRow([new Date(), `${logUUID}_CH${(idx+1).toString().padStart(2,'0')}`, docUrl, 'PENDING_INFERENCE', text]);
          chunkTotal++;
        });
        stagingSheet.getRange(i + 1, 4).setValue('PARTITIONED');
        processedCount++;
      } catch (e) {
        stagingSheet.getRange(i + 1, 4).setValue(`PHASE_2_ERROR: ${e.message}`);
        _reportError('processPhase2Chunking — row ' + (i + 1), e, null);
      }
    }
    if (processedCount > 0) SpreadsheetApp.flush();
    ui.alert('✅ Phase 2 Complete',
      `Partitioned ${processedCount} log(s) into ${chunkTotal} chunk(s).\n\nNext: Run chunks through Curator Gem → paste JSON into Inference_Buffer → Phase 4.`,
      ui.ButtonSet.OK);
  } catch (e) {
    _reportError('processPhase2Chunking — Phase 2', e, ui);
  }
}


// ══════════════════════════════════════════════════════════════
// PHASE 3: INFERENCE CONSOLIDATION
// [PRE-SMP] Simple mean aggregation — superseded by Vector_Router.gs
// ══════════════════════════════════════════════════════════════
function consolidateInferenceChunks() {
  const ui = DocumentApp.getUi();
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const buffer = _getOrCreateSheet(ss, CFG.INFERENCE_BUFFER_SHEET);
    const data   = buffer.getDataRange().getValues();
    const aggregated = {};
    let processedChunks = 0, errorRows = 0;
    for (let i = 1; i < data.length; i++) {
      // FIX: Accept BUFFERED (pre-Phase 4) OR INTAKE_PROCESSED (post-Phase 4).
      // Previously only BUFFERED was accepted — if Phase 4 ran first it marked rows
      // INTAKE_PROCESSED and Phase 3 found nothing. Now both statuses are valid inputs.
      const rowStatus = data[i][4];
      if (rowStatus !== 'BUFFERED' && rowStatus !== 'INTAKE_PROCESSED') continue;
      try {
        const clean  = data[i][3].toString().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        // FIX: use vector_weights (not .weights — KOS_MASTER has stale field name)
        const weights = parsed.vector_weights;
        if (weights && typeof weights === 'object') {
          Object.entries(weights).forEach(([theme, val]) => {
            const score = parseFloat(val);
            if (isNaN(score)) return;
            if (!aggregated[theme]) aggregated[theme] = { sum: 0, count: 0 };
            aggregated[theme].sum   += score;
            aggregated[theme].count += 1;
          });
        }
        buffer.getRange(i + 1, 5).setValue('CONSOLIDATED');
        processedChunks++;
      } catch (e) {
        buffer.getRange(i + 1, 5).setValue(`PARSE_ERROR: ${e.message}`);
        _reportError('consolidateInferenceChunks — row ' + (i + 1), e, null);
        errorRows++;
      }
    }
    if (processedChunks === 0) {
      ui.alert('Nothing to Consolidate',
        'No BUFFERED or INTAKE_PROCESSED rows in Inference_Buffer.\n\nPaste Curator JSON, set Status = BUFFERED, then re-run.',
        ui.ButtonSet.OK);
      return;
    }
    const primer = { consolidated_at: new Date().toISOString(), chunk_count: processedChunks, vector_weights: {} };
    Object.entries(aggregated).forEach(([theme, d]) => {
      primer.vector_weights[theme] = parseFloat((d.sum / d.count).toFixed(4));
    });
    PropertiesService.getScriptProperties().setProperty('SESSION_VECTOR_PRIMER', JSON.stringify(primer));
    SpreadsheetApp.flush();
    ui.alert('✅ Phase 3 Complete',
      `Consolidated ${processedChunks} chunk(s).\n` +
      (errorRows > 0 ? `⚠ ${errorRows} parse error(s) — check Inference_Buffer.\n\n` : '\n') +
      `Vectors:\n${Object.entries(primer.vector_weights).map(([k,v]) => `  ${k}: ${v}`).join('\n')}\n\nRun Get Startup Primer to copy the formatted block.`,
      ui.ButtonSet.OK);
  } catch (e) {
    _reportError('consolidateInferenceChunks — Phase 3', e, ui);
  }
}


// ══════════════════════════════════════════════════════════════
// PHASE 4: INTAKE PIPELINE — CURATOR JSON PROCESSOR
// Reads BUFFERED rows from Inference_Buffer and calls processIntakePayload
// for each, writing to CURRENT_STATE, PIVOTS_AND_LESSONS, MATRIX_LEDGER,
// and routing high-weight vectors to VECTOR_ docs.
// ══════════════════════════════════════════════════════════════

/**
 * Menu wrapper for Phase 4. Reads all BUFFERED rows from Inference_Buffer
 * and processes each through the full intake pipeline.
 */
function runIntakePipelineFromBuffer() {
  const ui = DocumentApp.getUi();
  try {
    _coldEngineGate('runIntakePipelineFromBuffer', 'TIER_2'); // Hard block if cold
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const buffer = _getOrCreateSheet(ss, CFG.INFERENCE_BUFFER_SHEET);
    const data   = buffer.getDataRange().getValues();
    let processed = 0, errors = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][4] !== 'BUFFERED') continue;
      const rawPayload = data[i][3].toString().replace(/```json|```/g, '').trim();
      const result     = processIntakePayload(rawPayload);
      if (result.status === 'SUCCESS') {
        buffer.getRange(i + 1, 5).setValue('INTAKE_PROCESSED');
        processed++;
      } else {
        buffer.getRange(i + 1, 5).setValue(`INTAKE_ERROR: ${result.message}`);
        errors++;
      }
    }
    if (processed > 0) {
      SpreadsheetApp.flush();
      try { _advanceOnboardingDay(); } catch (_) {} // Advance 21-day tracker
    }
    ui.alert('✅ Phase 4 Complete',
      `Processed ${processed} payload(s) through the Intake Pipeline.\n` +
      (errors > 0 ? `⚠ ${errors} error(s) — check Inference_Buffer Status column.` : 'No errors.'),
      ui.ButtonSet.OK);
  } catch (e) {
    _reportError('runIntakePipelineFromBuffer — Phase 4', e, ui);
  }
}

/**
 * Core CURATOR JSON intake processor.
 * Validates payload, fetches all pointers from PropertiesService (PIVOT 004),
 * writes volatile state, executes vector routing.
 *
 * @param {string} rawJSONPayload - Stringified CURATOR session JSON
 * @returns {Object} { status, data, vectorRouting } | { status, message }
 */
function processIntakePayload(rawJSONPayload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { status: 'LOCKED', message: 'System busy — try again.' };
  }
  try {
    // Gateway: JSON validation
    let payloadData;
    try {
      payloadData = JSON.parse(rawJSONPayload);
    } catch (parseError) {
      _reportError('processIntakePayload — JSON parse', parseError, null);
      throw new Error('Invalid JSON Exhaust. Curator payload was malformed: ' + parseError.message);
    }

    // Pointer extraction (PIVOT 004) — nothing hardcoded past this point
    const props          = PropertiesService.getScriptProperties();
    const currentStateId = props.getProperty('ID_CURRENT_STATE');
    const indexSheetId   = props.getProperty('INDEX_ID');
    const vectorFolderId = props.getProperty('ID_05_VECTOR_REPOSITORY');
    const pivotDocId     = props.getProperty('ID_PIVOTS_AND_LESSONS');

    if (!currentStateId || !indexSheetId || !vectorFolderId || !pivotDocId) {
      throw new Error(
        'Architectural Fault: Core pointers missing. ' +
        'Run 🚀 Deploy → Deploy Full System or 🧠 Council → Setup Routing Properties.'
      );
    }

    const timestamp  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const sessionUid = 'LOG_' + new Date().getTime();

    // Open all destinations via pointer — never by name search (PIVOT 004)
    const stateDoc   = DocumentApp.openById(currentStateId);
    const pivotDoc   = DocumentApp.openById(pivotDocId);
    const indexSheet = SpreadsheetApp.openById(indexSheetId);

    // Phase 1 Write: CURRENT_STATE — append next_steps as timestamped sync
    const stateBody = stateDoc.getBody();
    if (payloadData.dynamic_state?.next_steps?.length > 0) {
      stateBody.appendParagraph(`\n[State Sync: ${timestamp} | ${sessionUid}]`)
               .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      stateBody.appendParagraph('NEXT STEPS:').setBold(true);
      payloadData.dynamic_state.next_steps.forEach(step => stateBody.appendListItem(step));
    }

    // Phase 1 Write: CURRENT_STATE — append deferred decisions
    if (payloadData.dynamic_state?.deferred_decisions?.length > 0) {
      stateBody.appendParagraph(`DEFERRED DECISIONS (${sessionUid}):`).setBold(true);
      payloadData.dynamic_state.deferred_decisions.forEach(d =>
        stateBody.appendListItem(`[${d.owner || 'unassigned'}] ${d.decision} — Blocking: ${d.blocking}`)
      );
    }

    // Phase 2 Write: PIVOTS_AND_LESSONS — append pivots and corrections
    if (payloadData.dynamic_state?.pivots_and_lessons?.length > 0) {
      const pivotBody = pivotDoc.getBody();
      pivotBody.appendParagraph(`\n[Session Logged: ${timestamp} | ${sessionUid}]`)
               .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      payloadData.dynamic_state.pivots_and_lessons.forEach(pivot =>
        pivotBody.appendListItem(pivot)
      );
    }

    // Phase 2 Write: MATRIX_LEDGER — static 4-col write [PRE-SMP]
    // ⚠️ Superseded by Vector_Router.gs once deployed. Do not extend columns here.
    const ledger = indexSheet.getSheetByName(CFG.MATRIX_LEDGER_SHEET);
    if (ledger) {
      const w    = payloadData.vector_weights || {};
      const arch = parseFloat(w.ARCHITECTURE) || 0;
      const ui   = parseFloat(w.UI)           || 0;
      const sec  = parseFloat(w.SECURITY)     || 0;
      const ped  = parseFloat(w.PEDAGOGY)     || 0;
      ledger.appendRow([sessionUid, timestamp, arch, ui, sec, ped, (arch + ui + sec + ped).toFixed(4)]);
    }

    // SESSION_LOG — record session metadata
    const sessionMeta = payloadData.session_metadata || {};
    const sessionLog  = _getOrCreateSheet(indexSheet, CFG.SESSION_LOG_SHEET);
    sessionLog.appendRow([
      sessionUid,
      timestamp,
      sessionMeta.session_type       || '',
      sessionMeta.cold_start         || '',
      sessionMeta.rtp_version        || '',
      payloadData.session_summary    || '',
    ]);

    // COG_REGISTRY — record cog verdicts for the session
    if (payloadData.cog_registry?.cog_verdicts?.length > 0) {
      const cogSheet = _getOrCreateSheet(indexSheet, CFG.COG_REGISTRY_SHEET);
      payloadData.cog_registry.cog_verdicts.forEach(v => {
        cogSheet.appendRow([sessionUid, timestamp, v.cog || '', v.final_status || '', v.summary || '']);
      });
    }

    // ACTION_REGISTER — log all action exhaust items
    if (payloadData.action_exhaust?.length > 0) {
      const actionSheet = _getOrCreateSheet(indexSheet, CFG.ACTION_REGISTER_SHEET);
      payloadData.action_exhaust.forEach(action => {
        actionSheet.appendRow([
          sessionUid, timestamp,
          action.type              || '',
          action.item              || '',
          action.owner             || 'unassigned',
          action.protected_time_risk ? 'YES' : 'NO',
          'OPEN'
        ]);
      });
    }

    // BLACKBOARD — auto-stage any SMP proposals filed this session
    if (payloadData.session_delta?.smp_proposals_filed?.length > 0) {
      const blackboard = _getOrCreateSheet(indexSheet, CFG.BLACKBOARD_SHEET);
      payloadData.session_delta.smp_proposals_filed.forEach(smp => {
        blackboard.appendRow([
          '',                           // Target_Doc_ID (human fills in)
          smp.proposal_id  || '',
          smp.title        || '',
          '',                           // Version
          `[${smp.proposal_id || 'SMP'}]`, // Find_String placeholder
          smp.summary      || '',
          '',                           // Alt_Doc_ID
          `Filed by: ${smp.filed_by || 'unknown'} | Status: ${smp.status || 'PENDING'}`,
          smp.filed_by     || '',
          timestamp,
          'STAGED_FOR_REVIEW',
          false                         // Deploy_Trigger unchecked
        ]);
      });
    }

    // ALIGNMENT ALERT — email operator if relational status is RED or YELLOW
    if (payloadData.alignment_report) {
      const alignStatus = payloadData.alignment_report.relational_status_at_closeout;
      if (alignStatus === 'RED' || alignStatus === 'YELLOW') {
        const thresholds = (payloadData.alignment_report.thresholds_crossed_this_session || []).join(', ') || 'none specified';
        _reportError(
          `ALIGNMENT ${alignStatus} — Session ${sessionUid}`,
          new Error(`Relational status at closeout: ${alignStatus}.\nThresholds crossed: ${thresholds}.\nMandatory pauses issued: ${payloadData.alignment_report.mandatory_pauses_issued || 0}.`),
          null
        );
      }
    }

    console.log(`Full intake complete: ${sessionUid} — all CURATOR V5 fields processed`);

    // Phase 3 Handoff: Vector Routing
    const vectorResult = executeVectorRouting(payloadData, { vectorFolderId, sessionUid, timestamp });

    return { status: 'SUCCESS', data: payloadData, vectorRouting: vectorResult };

  } catch (error) {
    _reportError('processIntakePayload', error, null);
    return { status: 'ERROR', message: error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Routes high-weight vectors (> CFG.VECTOR_THRESHOLD) to VECTOR_ docs.
 * Finds or creates VECTOR_[TOPIC].gdoc and appends session summary.
 * [PRE-SMP] Binary threshold — replace with Matrix approach in Vector_Router.gs.
 *
 * @param {Object} payloadData - Parsed CURATOR JSON
 * @param {Object} pointers    - { vectorFolderId, sessionUid, timestamp }
 * @returns {Object} { status, routedCount } | { status, message }
 */
function executeVectorRouting(payloadData, pointers) {
  try {
    const vectorFolder = DriveApp.getFolderById(pointers.vectorFolderId);
    const weights      = payloadData.vector_weights || {};
    let   routedCount  = 0;

    for (const [topic, weightValue] of Object.entries(weights)) {
      const weightFloat = parseFloat(weightValue);
      // Math-Before-Muse Filter [PRE-SMP]: only route high-density signals
      if (isNaN(weightFloat) || weightFloat <= CFG.VECTOR_THRESHOLD) continue;

      const vectorDocName = 'VECTOR_' + topic.toUpperCase().trim();
      // Idempotency: find or create, never duplicate (PIVOT 003)
      const vectorDoc = _getOrCreateDoc(vectorDocName, vectorFolder);
      const body      = vectorDoc.getBody();
      body.appendParagraph(
        `\n[Vector Seed: ${pointers.timestamp} | ${pointers.sessionUid} | Weight: ${weightFloat}]`
      ).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      if (payloadData.session_summary) body.appendParagraph(payloadData.session_summary);
      routedCount++;
    }

    console.log(`Phase 3 Complete: Routed to ${routedCount} Vector doc(s).`);
    return { status: 'SUCCESS', routedCount };

  } catch (error) {
    _reportError('executeVectorRouting', error, null);
    return { status: 'ERROR', message: error.message };
  }
}


// ══════════════════════════════════════════════════════════════
// GOVERNANCE ENGINE — HITL CI/CD PIPELINE
// Trigger fires when a human checks the Deploy_Trigger checkbox
// in the Blackboard sheet of BRAIN_TRUST_INDEX.
// Run setupGovernanceTrigger() once after Deploy to install it.
// ══════════════════════════════════════════════════════════════

/**
 * Installs an installable onEdit trigger on BRAIN_TRUST_INDEX.
 * Because this script is doc-bound (Drop Zone), a simple onEdit trigger
 * cannot listen to a different spreadsheet. This function creates an
 * installable trigger that fires onGovernanceEdit() when BRAIN_TRUST_INDEX
 * is edited.
 * Run once after Deploy. Safe to re-run (removes duplicates first).
 */
function setupGovernanceTrigger() {
  const ui = DocumentApp.getUi();
  try {
    // Remove any existing governance triggers to prevent duplicates
    ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === 'onGovernanceEdit')
      .forEach(t => ScriptApp.deleteTrigger(t));

    const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    ScriptApp.newTrigger('onGovernanceEdit')
      .forSpreadsheet(ss)
      .onEdit()
      .create();

    ui.alert('✅ Governance Trigger Installed',
      'onGovernanceEdit() is now listening to BRAIN_TRUST_INDEX.\n\n' +
      'The HITL Firewall is armed: check the Deploy_Trigger checkbox (Column L) ' +
      'in the Blackboard sheet to execute a staged mutation.',
      ui.ButtonSet.OK);
  } catch (e) {
    _reportError('setupGovernanceTrigger', e, ui);
  }
}

/**
 * Governance Engine CI/CD trigger handler.
 * Fires when Column L (Deploy_Trigger checkbox) is checked in Blackboard.
 *
 * Row schema (1-indexed):
 *   A(1): Target_Doc_ID  B-E: Descriptive  F(6): Alt Doc ID
 *   G(7): CE-TAG         H(8): Version     I(9): Find_String
 *   J(10): Replace_Payload  K(11): Status  L(12): Deploy_Trigger
 */
function onGovernanceEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row   = range.getRow();
  const col   = range.getColumn();

  const isTargetSheet = (sheet.getName() === CFG.BLACKBOARD_SHEET ||
                         sheet.getName().indexOf('CE-LOG') !== -1);
  if (!isTargetSheet || col !== 12 || range.getValue() !== true || row <= 1) return;

  try {
    const data    = sheet.getRange(row, 1, 1, 11).getValues()[0];
    // Support both v1.1 (Doc ID in Col A) and v1.2 (Doc ID in Col F)
    const docId   = data[0] || data[5];
    const findStr = data[8];
    const payload = data[9];

    runHardeningAudit(payload);
    const success = applyMutation(docId, findStr, payload);

    if (success) {
      sheet.getRange(row, 11).setValue('DEPLOYED: ' + new Date().toLocaleString());
      sheet.getRange(row, 12).setValue(false);
      e.source.toast('Mutation Deployed Successfully.', 'Governance Engine', 5);
    }
  } catch (err) {
    sheet.getRange(row, 11).setValue('FAILED: ' + err.message);
    sheet.getRange(row, 12).setValue(false);
    e.source.toast('Mutation Failed. Check Status column.', 'System Alert', 10);
  }
}

/**
 * Executes a strict Find/Replace mutation in a Google Doc.
 * Strict Match Rule: throws rather than guessing if the string isn't found exactly.
 *
 * @param {string} docId     - Target document ID
 * @param {string} searchTag - Exact string to find
 * @param {string} payload   - Replacement string
 * @returns {boolean} true on success
 */
function applyMutation(docId, searchTag, payload) {
  if (!docId || !searchTag) {
    throw new Error('Missing Document ID or Search Tag — cannot execute mutation.');
  }

  // Confirmation gate — destructive operations require explicit human approval
  try {
    const ui      = DocumentApp.getUi();
    const confirm = ui.alert(
      '⚠ Confirm Mutation',
      `FIND:    "${searchTag}"\nREPLACE: "${payload.substring(0, 120)}${payload.length > 120 ? '…' : ''}"\nDOC ID:  ${docId}\n\nThis action cannot be undone. Proceed?`,
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) {
      throw new Error('Mutation cancelled by operator.');
    }
  } catch (uiErr) {
    // No UI context (called programmatically) — proceed without confirmation
    if (!uiErr.message.includes('cancelled')) console.warn('[applyMutation] No UI context — skipping confirmation dialog.');
    else throw uiErr;
  }

  const body         = DocumentApp.openById(docId).getBody();
  const rangeElement = body.findText(searchTag);
  if (rangeElement) {
    rangeElement.getElement().asText().replaceText(searchTag, payload);
    console.log(`[MUTATION_SUCCESS] "${searchTag}" replaced in doc ${docId}`);
    return true;
  }
  // Strict Match Rule: never guess — surface the failure
  throw new Error(
    `Strict Match Failed: "${searchTag}" not found in document ${docId}. ` +
    'Verify the exact string exists in the document before retrying.'
  );
}


// ══════════════════════════════════════════════════════════════
// COUNCIL SIMULATOR — PHASE 1: INPUT PAYLOAD GENERATOR
// Differential Read Check prevents redundant payload generation.
// ══════════════════════════════════════════════════════════════

/**
 * Checks whether CURRENT_STATE has been updated since the last run.
 * If yes: assembles a structured council prompt doc and routes it to
 * RAW_EXHAUST for Workspace Studio pickup.
 * If no: returns SLEEPING — no redundant payload generated (anti-bloat).
 *
 * @returns {Object} { status, docName } | { status, message }
 */
function generateCouncilInputPayload() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    ui.alert('System Busy', 'Council Simulator could not acquire a lock. Try again.', ui.ButtonSet.OK);
    return { status: 'LOCKED', message: 'System busy.' };
  }
  try {
    _coldEngineGate('generateCouncilInputPayload', 'TIER_2'); // Hard block if cold
    const props          = PropertiesService.getScriptProperties();
    const stateId        = props.getProperty('ID_CURRENT_STATE');
    const pivotId        = props.getProperty('ID_PIVOTS_AND_LESSONS');
    const exhaustFolderId = props.getProperty('ID_00_RAW_EXHAUST');

    if (!stateId || !pivotId || !exhaustFolderId) {
      throw new Error(
        'Architectural Fault: Core pointers missing. ' +
        'Run Deploy or 🧠 Council → Setup Routing Properties.'
      );
    }

    // Differential Read Check — only generate if CURRENT_STATE has changed
    const stateFile   = DriveApp.getFileById(stateId);
    const lastRunTime = parseInt(props.getProperty('COUNCIL_LAST_RUN') || '0', 10);

    if (stateFile.getLastUpdated().getTime() <= lastRunTime) {
      ui.alert('System Stasis',
        'No new exhaust detected since last run.\nCurrent State has not been updated.\nCouncil is sleeping.',
        ui.ButtonSet.OK);
      return { status: 'SLEEPING', message: 'No new data to process.' };
    }

    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const docName   = 'CE: COUNCIL_PAYLOAD_' + timestamp;

    const payloadDoc = DocumentApp.create(docName);
    const body       = payloadDoc.getBody();

    body.appendParagraph('[🧠 RTP COUNCIL INITIATION STUB]')
        .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`System State: ${timestamp}\n`);

    body.appendParagraph('1. THE CONTEXT (Recent Session Summary)')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(stateText + '\n');

    body.appendParagraph('2. THE LAWS (Active Constraints)')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(pivotText + '\n');

    body.appendParagraph('3. INFERENCE INSTRUCTIONS FOR WORKSPACE STUDIO')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(
      'Using the attached Persona files, act as the Architect, Auditor, and Muse. ' +
      'Evaluate the Context against the Laws. Output your response strictly using: ' +
      '[🏗 ARCHITECT FLAG], [⚖️ AUDITOR FLAG], and [✨ MUSE FLAG].'
    ).setBold(true);

    payloadDoc.saveAndClose();
    DriveApp.getFileById(payloadDoc.getId()).moveTo(DriveApp.getFolderById(exhaustFolderId));

    // Stamp COUNCIL_LAST_RUN to prevent re-generation until next state update
    props.setProperty('COUNCIL_LAST_RUN', new Date().getTime().toString());

    ui.alert('✅ Council Payload Generated',
      `Doc: ${docName}\nRouted to RAW_EXHAUST for Workspace Studio pickup.`,
      ui.ButtonSet.OK);
    return { status: 'SUCCESS', docName };

  } catch (error) {
    _reportError('generateCouncilInputPayload', error, ui);
    return { status: 'ERROR', message: error.message };
  } finally {
    lock.releaseLock();
  }
}


// ══════════════════════════════════════════════════════════════
// SWEEPERS
// ══════════════════════════════════════════════════════════════

/**
 * PUBLIC: Re-scans Drive for taxonomy folders and re-registers all
 * folder IDs in PropertiesService. Call this any time a folder is
 * moved or renamed without running a full re-deploy.
 * (Standalone equivalent of _registerAllProperties — PIVOT 004 recovery)
 */
function setupRoutingProperties() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  function fetchId(name, isFolder) {
    const iter = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
    if (iter.hasNext()) return iter.next().getId();
    console.error(`⚠️ NOT FOUND: [${name}]`);
    return null;
  }

  const map = {
    'ID_01_1_SCRIPTS':          fetchId('01.1_SCRIPTS',            true),
    'ID_01_2_SOP_AND_FLOWS':    fetchId('01.2_SOP_AND_FLOWS',       true),
    'ID_01_3_SMP_PROPOSALS':    fetchId('01.3_SMP_PROPOSALS',       true),
    'ID_02_COUNCIL_ALIGNMENTS': fetchId('02_Council_Alignments',   true),
    'ID_03_DYNAMIC_STATE':      fetchId('03_Dynamic_State',        true),
    'ID_03_1_CURRENT_STATE':    fetchId('03.1_CURRENT_STATE',      true),
    'ID_03_2_PIVOTS':           fetchId('03.2_PIVOTS_AND_LESSONS', true),
    'ID_03_3_PROCESSED':        fetchId('03.3_PROCESSED_EXHAUST',  true),
    'ID_00_RAW_EXHAUST':        fetchId('03.4_RAW_EXHAUST',        true),
    'ID_04_COUNCIL_LOGS':       fetchId('04_Council_Logs',         true),
    'ID_04_1_ARCHITECT':        fetchId('04.1_ARCHITECT_SILO',     true),
    'ID_04_2_AUDITOR':          fetchId('04.2_AUDITOR_SILO',       true),
    'ID_04_3_MUSE':             fetchId('04.3_MUSE_SILO',          true),
    'ID_04_4_DEVELOPER':        fetchId('04.4_DEVELOPER_SILO',     true),
    'ID_04_5_ALIGNER':          fetchId('04.5_ALIGNER_SILO',       true),
    'ID_04_6_CURATOR':          fetchId('04.6_CURATOR_SILO',       true),
    'ID_04_7_RTP':              fetchId('04.7_RTP_SILO',           true),
    'ID_04_8_GRAVEYARD':        fetchId('04.8_COG_GRAVEYARD',      true),
    'ID_05_VECTOR_REPOSITORY':  fetchId('05_Vector_Repository',    true),
    'ID_06_1_LESSON_PLANS':     fetchId('06.1_LESSON_PLANS',       true),
    'ID_06_2_STUDENT_FACING':   fetchId('06.2_STUDENT_FACING',     true),
    'ID_06_3_ASSESSMENTS':      fetchId('06.3_ASSESSMENTS',        true),
    'ID_06_4_COMMUNICATIONS':   fetchId('06.4_COMMUNICATIONS',     true),
    'ID_07_MEMORY_VAULT':       fetchId('07_Memory_Vault',         true),
    'ID_08_PROJECT_AUTOPSIES':  fetchId('08_Project_Autopsies',    true),
    'ID_CCPS_MASTER_TEMPLATES': fetchId('CCPS_MASTER_TEMPLATES',   true),
    'FOLDER_ID':                fetchId('03.4_RAW_EXHAUST',        true),
    'INDEX_ID':                 fetchId('BRAIN_TRUST_INDEX',       false),
    'ID_CURRENT_STATE':         fetchId('CURRENT_STATE',           false),
    'ID_PIVOTS_AND_LESSONS':    fetchId('PIVOTS_AND_LESSONS_V1.0', false),
  };

  let ok = 0, missing = 0;
  Object.entries(map).forEach(([key, id]) => {
    if (id) { props.setProperty(key, id); ok++; }
    else    { missing++; }
  });

  const msg = missing === 0
    ? `✅ All ${ok} routing properties registered.`
    : `⚠ ${ok} registered, ${missing} not found — check execution log for details.`;
  ui.alert('Setup Routing Properties', msg, ui.ButtonSet.OK);
}

/**
 * Full Semantic Router Sweeper.
 * Scans Drive root for all CE-tagged files, stamps temporal UIDs,
 * routes each to its SMP-001 taxonomy folder, and logs to EXECUTION_LEDGER.
 * Set a time-driven trigger to run every 15 minutes.
 */
function runSemanticSweeper() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    ui.alert('Sweeper Busy', 'Could not acquire lock. Already running.', ui.ButtonSet.OK);
    return;
  }
  try {
    const props    = PropertiesService.getScriptProperties();
    const allFiles = DriveApp.getRootFolder().getFiles();

    // SMP-001 tag-to-folder map — uses our ID_01_* convention
    const tagMap = {
      'CE-CODE':     props.getProperty('ID_01_1_SCRIPTS'),
      'CE-FLOW':     props.getProperty('ID_01_2_SOP_AND_FLOWS'),
      'CE-SMP':      props.getProperty('ID_01_3_SMP_PROPOSALS'),
      'CE-COG':      props.getProperty('ID_02_COUNCIL_ALIGNMENTS'),
      'CE-STATE':    props.getProperty('ID_03_DYNAMIC_STATE'),
      'CE-CURR':     props.getProperty('ID_03_1_CURRENT_STATE'),
      'CE-PIVOT':    props.getProperty('ID_03_2_PIVOTS'),
      'CE-PROC':     props.getProperty('ID_03_3_PROCESSED'),
      'CE-LOG':      props.getProperty('ID_04_COUNCIL_LOGS'),
      'CE-ARCH':     props.getProperty('ID_04_1_ARCHITECT'),
      'CE-AUD':      props.getProperty('ID_04_2_AUDITOR'),
      'CE-MUSE':     props.getProperty('ID_04_3_MUSE'),
      'CE-DEV':      props.getProperty('ID_04_4_DEVELOPER'),
      'CE-ALIGN':    props.getProperty('ID_04_5_ALIGNER'),
      'CE-CUR':      props.getProperty('ID_04_6_CURATOR'),
      'CE-RTP':      props.getProperty('ID_04_7_RTP'),
      'CE-GRAVE':    props.getProperty('ID_04_8_GRAVEYARD'),
      'CE-VECTOR':   props.getProperty('ID_05_VECTOR_REPOSITORY'),
      'CE-PRD':      props.getProperty('ID_06_1_LESSON_PLANS'),
      'CE-LESSON':   props.getProperty('ID_06_2_STUDENT_FACING'),
      'CE-RUBRIC':   props.getProperty('ID_06_3_ASSESSMENTS'),
      'CE-COMM':     props.getProperty('ID_06_4_COMMUNICATIONS'),
      'CE-VAULT':    props.getProperty('ID_07_MEMORY_VAULT'),
      'CE-AUTOPSY':  props.getProperty('ID_08_PROJECT_AUTOPSIES'),
      'CE-TEMPLATE': props.getProperty('ID_CCPS_MASTER_TEMPLATES'),
      'KOS:':        props.getProperty('ID_00_RAW_EXHAUST'),
      'CE:':         props.getProperty('ID_00_RAW_EXHAUST'),
    };

    let processedCount = 0, skippedUid = 0, skippedNoTag = 0, nullId = 0;

    // FIX: Get BRAIN_TRUST_INDEX and EXECUTION_LEDGER ONCE before the loop.
    // Previously DriveApp.getFilesByName() was called on every single file routed,
    // making one Drive API call per iteration — caused quota exhaustion and timeout.
    let ledger = null;
    const indexSearch = DriveApp.getFilesByName(CFG.INDEX_NAME);
    if (indexSearch.hasNext()) {
      ledger = _getOrCreateSheet(SpreadsheetApp.openById(indexSearch.next().getId()), 'EXECUTION_LEDGER');
    } else {
      console.warn('BRAIN_TRUST_INDEX not found — routed files will not be logged to EXECUTION_LEDGER.');
    }

    while (allFiles.hasNext()) {
      const file     = allFiles.next();
      const fileName = file.getName();

      if (fileName.indexOf('[UID_DOC_') > -1) { skippedUid++; continue; }

      let matchedTag = null, targetFolderId = null;
      for (const tag in tagMap) {
        if (fileName.startsWith(tag + ':') || fileName.startsWith(tag + ' ')) {
          targetFolderId = tagMap[tag];
          matchedTag     = tag;
          break;
        }
      }
      if (!matchedTag) { skippedNoTag++; continue; }
      if (!targetFolderId) {
        console.warn(`Null pointer for tag "${matchedTag}". Run setupRoutingProperties().`);
        nullId++;
        continue;
      }

      const uid     = '[UID_DOC_' + new Date().getTime() + ']';
      file.setName(`${uid} ${fileName}`);
      file.moveTo(DriveApp.getFolderById(targetFolderId));

      // Use the pre-fetched ledger reference — no Drive search on each iteration
      if (ledger) {
        ledger.appendRow([uid, new Date(), matchedTag, file.getUrl(), 'ROUTED']);
      }

      processedCount++;
      SpreadsheetApp.flush();
    }

    ui.alert('✅ Semantic Sweep Complete',
      `Routed: ${processedCount}\nSkipped (UID'd): ${skippedUid}\nNo tag: ${skippedNoTag}\nNull pointer: ${nullId}`,
      ui.ButtonSet.OK);

  } catch (error) {
    _reportError('runSemanticSweeper', error, ui);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Narrow exhaust sweeper — Google Docs only, "CE:" prefix only.
 * Routes to RAW_EXHAUST for Workspace Studio pickup.
 * Largely redundant if runSemanticSweeper() is on the same trigger cadence,
 * but kept active for a dedicated Docs-only sweep path.
 */
function sweepRootForExhaust() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const props           = PropertiesService.getScriptProperties();
    const exhaustFolderId = props.getProperty('ID_00_RAW_EXHAUST');
    if (!exhaustFolderId) {
      throw new Error('ID_00_RAW_EXHAUST missing. Run setupRoutingProperties().');
    }
    const exhaustFolder = DriveApp.getFolderById(exhaustFolderId);
    const looseDocs     = DriveApp.getRootFolder().getFilesByType(MimeType.GOOGLE_DOCS);
    let   processedCount = 0;
    while (looseDocs.hasNext()) {
      const file = looseDocs.next();
      const name = file.getName();
      if (name.indexOf('UID_') === -1 && name.indexOf('CE:') !== -1) {
        file.setName(`[UID_RAW_${new Date().getTime()}] ${name}`);
        file.moveTo(exhaustFolder);
        processedCount++;
        SpreadsheetApp.flush();
      }
    }
    if (processedCount > 0) {
      ui.alert('✅ Exhaust Sweep Complete',
        `Swept ${processedCount} CE: doc(s) into RAW_EXHAUST.`, ui.ButtonSet.OK);
    } else {
      ui.alert('Exhaust Sweep', 'No CE: docs found in Drive root.', ui.ButtonSet.OK);
    }
  } catch (e) {
    _reportError('sweepRootForExhaust', e, ui);
  } finally {
    lock.releaseLock();
  }
}


// ══════════════════════════════════════════════════════════════
// GOVERNANCE ENGINE — CALIBRATION & SOVEREIGN HELPERS (PIVOT 008)
// ══════════════════════════════════════════════════════════════

/**
 * HARDENER UTILITY — run once, then clear values from function body.
 * Fill in your private weights below → Run → Clear → auditCalibrationHealth()
 */
function setupCalibration() {
  const props = PropertiesService.getScriptProperties();
  // ── FILL IN YOUR VALUES ── then clear after first run ──────
  const calibrationMap = {
    'THEME_ARCHITECTURE':    'YOUR_WEIGHT_HERE',    // e.g. '0.85'
    'THEME_PEDAGOGY':        'YOUR_WEIGHT_HERE',    // e.g. '0.90'
    'THEME_FAMILY_ALIGNMENT':'YOUR_WEIGHT_HERE',    // e.g. '1.00'
    'SOCRATIC_THRESHOLD':    'YOUR_WEIGHT_HERE',    // e.g. '0.75'
    'IDENTITY_KEY_SALT':     'YOUR_PRIVATE_STRING_HERE',
  };
  // ── CLEAR VALUES AFTER RUNNING ─────────────────────────────
  props.setProperties(calibrationMap);
  console.log('[HARDENING_COMPLETE] Calibration weights sequestered. Clear this function body now.');
}

function auditCalibrationHealth() {
  const ui     = DocumentApp.getUi();
  const status = _getCalibrationStatus();
  if (!status.armed) {
    ui.alert('⚠ Engine COLD',
      `No calibration data found.\n\nExpected keys:\n${CFG.CALIBRATION_KEYS.map(k => '  • ' + k).join('\n')}\n\nRun setupCalibration() to arm.`,
      ui.ButtonSet.OK);
  } else {
    const missing = CFG.CALIBRATION_KEYS.filter(
      k => !PropertiesService.getScriptProperties().getProperty(k)
    );
    ui.alert('Calibration Health',
      missing.length === 0
        ? `✅ Engine ARMED — ${status.count} key(s) verified.`
        : `⚠ PARTIAL — Missing:\n${missing.map(k => '  • ' + k).join('\n')}`,
      ui.ButtonSet.OK);
  }
}

function _getCalibrationStatus() {
  const props = PropertiesService.getScriptProperties();
  const found = CFG.CALIBRATION_KEYS.filter(k => props.getProperty(k) !== null);
  return { armed: found.length > 0, count: found.length };
}

function nuclearWipeForRelease() {
  const ui      = DocumentApp.getUi();
  const confirm = ui.alert('☢ NUCLEAR WIPE',
    'Permanently deletes ALL PropertiesService data:\n• Calibration keys\n• Folder/doc ID caches\n• SESSION_VECTOR_PRIMER\n\nIrreversible.\n\nProceed?',
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteAllProperties();
  ui.alert('✅ Clean Sweep', 'All IP wiped. Re-run Deploy + setupCalibration() to restore.', ui.ButtonSet.OK);
}

function getStartupPrimer() {
  const ui  = DocumentApp.getUi();
  const raw = PropertiesService.getScriptProperties().getProperty('SESSION_VECTOR_PRIMER');
  if (!raw) {
    ui.alert('No Primer Found', 'Run Phase 3 (Consolidate Inference) after processing chunks.', ui.ButtonSet.OK);
    return '';
  }
  try {
    const primer = JSON.parse(raw);
    const lines  = Object.entries(primer.vector_weights || {}).map(([k,v]) => `  ${k.padEnd(25)} ${v}`);
    const block  =
      `[🧠 RTP — STARTUP PRIMER]\n` +
      `Consolidated: ${primer.consolidated_at}\n` +
      `Chunks: ${primer.chunk_count}\n\n` +
      `VECTOR_WEIGHTS:\n${lines.join('\n')}\n\n` +
      `[END PRIMER — Inject at top of next Gem session]`;
    ui.alert('SESSION_VECTOR_PRIMER', block, ui.ButtonSet.OK);
    return block;
  } catch (e) {
    _reportError('getStartupPrimer', e, ui);
    return '';
  }
}

function getKOSCalibration(key) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) {
    console.error(`[CALIBRATION_ERROR] Missing key: "${key}". Engine remaining COLD. Run setupCalibration().`);
    return null;
  }
  return val;
}

function runHardeningAudit(payload) {
  const patterns = [
    { re: /weight\s*[:=]\s*0\.\d+/i,        label: 'Hardcoded weight value'    },
    { re: /threshold\s*[:=]\s*0\.\d+/i,     label: 'Hardcoded threshold value' },
    { re: /IDENTITY_KEY\s*[:=]\s*['"].+['"]/, label: 'Exposed identity key'    },
    { re: /SALT\s*[:=]\s*['"].+['"]/i,       label: 'Exposed salt string'      },
  ];
  patterns.forEach(({ re, label }) => {
    if (re.test(payload)) {
      throw new Error(
        `[VULNERABILITY_DETECTED] ${label} in payload. Aborted per PIVOT 008. ` +
        'Move this value to PropertiesService via setupCalibration().'
      );
    }
  });
  return true;
}

function sevenBridgesReview() {
  DocumentApp.getUi().alert('🌉 SMP-002: Seven Bridges Reconciliation Protocol',
    'Status: PENDING USER APPROVAL\n\n' +
    '3/7 TRIGGER: 3+ non-APPROVED verdicts halt execution.\n' +
    'BRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog\'s verdict is VOID.\n\n' +
    'To approve:\n1. Open SMP-002 doc in 01.3_SMP_PROPOSALS\n2. Update Status to APPROVED\n3. Notify Developer to build execution layer.',
    DocumentApp.getUi().ButtonSet.OK);
}


// ══════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ══════════════════════════════════════════════════════════════

function _generateLogUUID(text) {
  const ts   = new Date().getTime();
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
    .map(val => (val < 0 ? val + 256 : val).toString(16).padStart(2, '0'))
    .join('').substring(0, 8);
  return `LOG-${ts}-${hash}`;
}

function _semanticChunker(text) {
  const rawSplits  = text.split(CFG.DELIMITER);
  const chunks     = [];
  let   currentChunk = '';
  rawSplits.forEach((split, index) => {
    if (!split.trim()) return;
    const block = (index === 0 && !text.startsWith(CFG.DELIMITER)) ? split : CFG.DELIMITER + split;
    if ((currentChunk.length + block.length) > CFG.MAX_CHUNK_SIZE) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = block;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + block;
    }
  });
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.length ? chunks : [text];
}

function _resetDropZone(body) {
  body.clear();
  const paragraphs = body.getParagraphs();
  const p = paragraphs.length > 0 ? paragraphs[0] : body.appendParagraph('');
  p.setText(CFG.GUARD_TXT);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  p.setForegroundColor('#808080');
  body.appendParagraph('');
}

function _getSystemAsset(name, propKey, isFolder) {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty(propKey);
  if (id) {
    try {
      return isFolder ? DriveApp.getFolderById(id) : SpreadsheetApp.openById(id);
    } catch (e) { /* Stale — fall through */ }
  }
  const iterator = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
  if (!iterator.hasNext()) {
    throw new Error(`Asset Not Found: "${name}"\n\nRun 🚀 Deploy → Deploy Full System first.`);
  }
  const asset = iterator.next();
  props.setProperty(propKey, asset.getId());
  return isFolder ? asset : SpreadsheetApp.openById(asset.getId());
}

/** Simple idempotent doc finder/creator (used by executeVectorRouting) */
function _getOrCreateDoc(docName, folder) {
  const existing = folder.getFilesByName(docName);
  if (existing.hasNext()) return DocumentApp.openById(existing.next().getId());
  const newDoc = DocumentApp.create(docName);
  DriveApp.getFileById(newDoc.getId()).moveTo(folder);
  return newDoc;
}

function _getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headerMap = {
      [CFG.STAGING_SHEET]:         ['Timestamp','LOG_UUID','Raw_Pointer','Status','Payload'],
      'EXECUTION_LEDGER':          ['UID','TIMESTAMP','SEMANTIC_TAG','FILE_URL','STATUS','ATTEMPT_TRACKER'],
      [CFG.INFERENCE_BUFFER_SHEET]:['Timestamp','Session_ID','Chunk_ID','Inference_Payload','Status'],
      [CFG.MATRIX_LEDGER_SHEET]:   ['Session_UID','Timestamp','ARCHITECTURE','UI','SECURITY','PEDAGOGY','TOTAL'],
      [CFG.DYNAMIC_STATE_MATRIX]:  ['Session_UID','Timestamp','Theme','Raw_Score','Decayed_Score','Session_Count','Promoted'],
      [CFG.BLACKBOARD_SHEET]:      ['Target_Doc_ID','CE_Tag','Doc_Title','Version','Find_String','Replace_Payload','Alt_Doc_ID','Notes','Filed_By','Filed_Date','Status','Deploy_Trigger'],
      [CFG.ACTION_REGISTER_SHEET]: ['Session_UID','Timestamp','Type','Item','Owner','Protected_Time_Risk','Status'],
      [CFG.SESSION_LOG_SHEET]:     ['Session_UID','Timestamp','Session_Type','Cold_Start','RTP_Version','Session_Summary'],
      [CFG.COG_REGISTRY_SHEET]:    ['Session_UID','Timestamp','Cog','Final_Status','Summary'],
      [CFG.VECTOR_MATRIX_SHEET]:   ['Session_UID','Timestamp','ARCHITECTURE','UI','SECURITY','PEDAGOGY','GAS_DEVELOPMENT','RELATIONAL','INCUBATOR_SIGNALS'],
      [CFG.INCUBATOR_SHEET]:       ['Theme','First_Seen','Last_Seen','Session_Count','Avg_Weight','Status'],
    };
    const headers = headerMap[sheetName] || ['Timestamp','Data'];
    sheet.appendRow(headers);
    sheet.getRange('1:1').setFontWeight('bold').setBackground('#e2e8f0');
    sheet.setFrozenRows(1);
  }
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
  const p        = parent || DriveApp.getRootFolder();
  const existing = p.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : p.createFolder(name);
}

function _findFolder(name, parent) {
  if (!parent) return null;
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

/**
 * Unified error reporter — logs to console, shows alert, and emails the
 * active user. Call from every catch block instead of bare ui.alert().
 *
 * @param {string} context   - Function name / operation label
 * @param {Error}  error     - The caught error object
 * @param {object} [ui]      - DocumentApp.getUi() — omit for non-UI contexts
 */
function _reportError(context, error, ui) {
  const recipient = Session.getActiveUser().getEmail();
  const timestamp = new Date().toLocaleString();
  const subject   = `[RTP ERROR] ${context}`;
  const emailBody =
    `RTP System Error Report\n` +
    `═══════════════════════════════════════\n` +
    `Timestamp : ${timestamp}\n` +
    `Function  : ${context}\n` +
    `Error     : ${error.toString()}\n` +
    (error.stack ? `\nStack Trace:\n${error.stack}\n` : '') +
    `\n═══════════════════════════════════════\n` +
    `System: ${CFG.SYSTEM_NAME} | CI: 2.2.1`;

  // Email the active user
  try {
    if (recipient) MailApp.sendEmail(recipient, subject, emailBody);
  } catch (mailErr) {
    console.error(`[EMAIL_FAILED] Could not send error report: ${mailErr.message}`);
  }

  // Show alert if a UI context was supplied
  if (ui) {
    try {
      ui.alert(
        `❌ ${context}`,
        `${error.toString()}\n\nAn error report has been emailed to ${recipient || 'the script owner'}.`,
        ui.ButtonSet.OK
      );
    } catch (_) { /* silent — no UI context available */ }
  }

  console.error(`[ERROR] ${context}: ${error.toString()}`);
}


// ══════════════════════════════════════════════════════════════
// NEW FUNCTIONS — CI 2.3
// ══════════════════════════════════════════════════════════════

/**
 * Installs time-driven triggers for both sweepers.
 * Removes existing copies first to prevent duplicates.
 * Sweepers run every hour by default — adjust everyHours() as needed.
 */
function setupTimeTriggers() {
  const ui = DocumentApp.getUi();
  try {
    const sweepFunctions = ['runSemanticSweeper', 'sweepRootForExhaust'];

    // Remove any existing time triggers for these functions
    ScriptApp.getProjectTriggers()
      .filter(t => sweepFunctions.includes(t.getHandlerFunction()))
      .forEach(t => ScriptApp.deleteTrigger(t));

    // Install fresh hourly triggers
    sweepFunctions.forEach(fnName => {
      ScriptApp.newTrigger(fnName)
        .timeBased()
        .everyHours(1)
        .create();
    });

    ui.alert(
      '✅ Time Triggers Installed',
      'runSemanticSweeper() and sweepRootForExhaust() are now scheduled to run every hour.\n\n' +
      'View or modify schedules:\nApps Script editor → Triggers (clock icon, left sidebar).',
      ui.ButtonSet.OK
    );
  } catch (e) {
    _reportError('setupTimeTriggers', e, ui);
  }
}

/**
 * Derives and sequesters a deterministic Identity Key from the CORE_THESIS
 * document content combined with the IDENTITY_KEY_SALT.
 * Provides the technical IP shield described in the KOS White Paper:
 * the engine cannot be cloned without the user's unique thesis.
 * Safe to re-run — overwrites the previous key.
 */
function generateIdentityKey() {
  try {
    const props  = PropertiesService.getScriptProperties();
    const salt   = props.getProperty('IDENTITY_KEY_SALT') || 'DEFAULT_SALT';

    // Find CORE_THESIS via pointer or Drive search
    let thesisText = '';
    const thesisId = props.getProperty('ID_CORE_THESIS');
    if (thesisId) {
      try { thesisText = DocumentApp.openById(thesisId).getBody().getText(); } catch (_) {}
    }
    if (!thesisText) {
      const files = DriveApp.getFilesByName('CORE_THESIS');
      if (files.hasNext()) {
        thesisText = DocumentApp.openById(files.next().getId()).getBody().getText();
      }
    }

    // Derive key: MD5 of (thesis content + salt), first 16 hex chars
    const combined = (thesisText.substring(0, 500) + salt).trim();
    const hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, combined);
    const identityKey = hashBytes
      .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
      .toUpperCase();

    props.setProperty('IDENTITY_KEY', identityKey);
    console.log('[IDENTITY_KEY_GENERATED] Key derived and sequestered. Length: 16.');
    return identityKey;
  } catch (e) {
    _reportError('generateIdentityKey', e, null);
    return null;
  }
}

/**
 * Dumps all PropertiesService keys to a UI alert for diagnostics.
 * Shows folder/doc ID keys with truncated values and calibration
 * key NAMES only (values are never exposed in the UI — PIVOT 008).
 */
function dumpAllProperties() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const all   = props.getProperties();
  const lines = [];

  // Separate routing keys from calibration keys
  const routingKeys = Object.keys(all).filter(k => !CFG.CALIBRATION_KEYS.includes(k) && k !== 'IDENTITY_KEY');
  const calibKeys   = Object.keys(all).filter(k => CFG.CALIBRATION_KEYS.includes(k) || k === 'IDENTITY_KEY');

  lines.push('── ROUTING & ASSET POINTERS ──');
  routingKeys.sort().forEach(k => {
    const val = all[k];
    lines.push(`${k.padEnd(30)} ${val ? val.substring(0, 28) + (val.length > 28 ? '…' : '') : '⚠ NULL'}`);
  });

  lines.push('\n── CALIBRATION KEYS (values hidden — PIVOT 008) ──');
  CFG.CALIBRATION_KEYS.forEach(k => {
    lines.push(`${k.padEnd(30)} ${all[k] ? '✔ SET' : '⚠ NOT SET'}`);
  });
  lines.push(`${'IDENTITY_KEY'.padEnd(30)} ${all['IDENTITY_KEY'] ? '✔ SET' : '⚠ NOT SET'}`);

  lines.push(`\nTotal keys: ${Object.keys(all).length}`);

  ui.alert('Properties Diagnostic', lines.join('\n'), ui.ButtonSet.OK);
}

/**
 * Archives all terminal-status rows from STAGING_PIPELINE to STAGING_ARCHIVE.
 * Terminal statuses: PARTITIONED, CONSOLIDATED, INTAKE_PROCESSED, PHASE_2_ERROR, INTAKE_ERROR.
 * Keeps the active pipeline lean and prevents runaway row accumulation.
 */
function archiveStagingPipeline() {
  const ui = DocumentApp.getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);

    // Get or create archive tab
    let archive = ss.getSheetByName('STAGING_ARCHIVE');
    if (!archive) {
      archive = ss.insertSheet('STAGING_ARCHIVE');
      archive.appendRow(['Archived_At', 'Timestamp', 'LOG_UUID', 'Raw_Pointer', 'Status', 'Payload']);
      archive.getRange('1:1').setFontWeight('bold').setBackground('#f0e2d5');
      archive.setFrozenRows(1);
    }

    const terminalStatuses = ['PARTITIONED', 'CONSOLIDATED', 'INTAKE_PROCESSED', 'PHASE_2_ERROR', 'INTAKE_ERROR'];
    const data     = staging.getDataRange().getValues();
    const now      = new Date();
    let   archived = 0;

    // Iterate bottom-up so row deletions don't shift indices
    for (let i = data.length - 1; i >= 1; i--) {
      const status = data[i][3];
      if (terminalStatuses.includes(status) ||
          terminalStatuses.some(s => String(status).startsWith(s))) {
        archive.appendRow([now, ...data[i]]);
        staging.deleteRow(i + 1);
        archived++;
      }
    }

    SpreadsheetApp.flush();
    ui.alert('✅ Archive Complete',
      `Archived ${archived} row(s) from STAGING_PIPELINE → STAGING_ARCHIVE.\nActive queue is now clean.`,
      ui.ButtonSet.OK);
  } catch (e) {
    _reportError('archiveStagingPipeline', e, ui);
  }
}

/**
 * Seeds one example row in the Blackboard sheet so users know the expected format.
 * Idempotent — skips if a non-header row already exists.
 */
function _seedBlackboardTemplateRow(ss) {
  const sheet = _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
  if (sheet.getLastRow() > 1) return; // Already has data rows

  sheet.appendRow([
    '[PASTE_TARGET_DOC_ID_HERE]',     // Target_Doc_ID
    'CE-STATE',                        // CE_Tag
    'CURRENT_STATE',                   // Doc_Title
    'v1.0',                            // Version
    '[AWAITING_GENESIS_PROTOCOL...]',  // Find_String — exact text to locate in the doc
    'SYSTEM ONLINE — Session 001',    // Replace_Payload — replacement text
    '',                                // Alt_Doc_ID (v1.2 schema fallback)
    'Example: replaces thesis placeholder on first run', // Notes
    'ARCHITECT',                       // Filed_By
    new Date(),                        // Filed_Date
    'EXAMPLE — DELETE BEFORE USE',    // Status
    false,                             // Deploy_Trigger — check this to fire
  ]);

  // Highlight the example row so it's immediately visible
  sheet.getRange(2, 1, 1, 12)
       .setBackground('#FFF9C4')
       .setFontStyle('italic');
}

/**
 * Creates a CE Naming Convention quick-reference doc in 01_Canonical_Foundation.
 * Gives users an in-Drive reference so they can correctly tag files for routing.
 * Idempotent — skips if already exists.
 */
function _createNamingConventionDoc(f01) {
  const name = 'CE_NAMING_CONVENTION_SMP001';
  if (f01.getFilesByName(name).hasNext()) return;

  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  body.clear();

  body.appendParagraph('CE NAMING CONVENTION — SMP-001').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Active_Brain_Trust_System  |  CI: 2.3  |  Reference copy — see CE_Naming_Convention_SMP001.docx for full spec')
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendHorizontalRule();

  body.appendParagraph('THE FORMULA').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('[CE-TAG]: [Descriptive Title] [vX.X optional]');
  body.appendParagraph('Example: CE-LESSON: Introduction to Market Segmentation v1.0');

  body.appendParagraph('RULES').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    '1. Tag must be the very FIRST characters in the filename\n' +
    '2. Tag must be followed by a colon and a single space (": ")\n' +
    '3. Tags are CASE-SENSITIVE — always uppercase\n' +
    '4. Never add [UID_...] prefix — UIDs are stamped by the Sweeper post-routing\n' +
    '5. One CE tag per filename only'
  );

  body.appendParagraph('FULL TAG REFERENCE').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const tagLines = [
    'CE-CODE      → 01.1_SCRIPTS',
    'CE-FLOW      → 01.2_SOP_AND_FLOWS',
    'CE-SMP       → 01.3_SMP_PROPOSALS',
    'CE-COG       → 02_Council_Alignments',
    'CE-STATE     → 03_Dynamic_State',
    'CE-CURR      → 03.1_CURRENT_STATE',
    'CE-PIVOT     → 03.2_PIVOTS_AND_LESSONS',
    'CE-PROC      → 03.3_PROCESSED_EXHAUST',
    'CE-LOG       → 04_Council_Logs',
    'CE-ARCH      → 04.1_ARCHITECT_SILO',
    'CE-AUD       → 04.2_AUDITOR_SILO',
    'CE-MUSE      → 04.3_MUSE_SILO',
    'CE-DEV       → 04.4_DEVELOPER_SILO',
    'CE-ALIGN     → 04.5_ALIGNER_SILO',
    'CE-CUR       → 04.6_CURATOR_SILO',
    'CE-RTP       → 04.7_RTP_SILO',
    'CE-GRAVE     → 04.8_COG_GRAVEYARD',
    'CE-VECTOR    → 05_Vector_Repository',
    'CE-PRD       → 06.1_LESSON_PLANS',
    'CE-LESSON    → 06.2_STUDENT_FACING',
    'CE-RUBRIC    → 06.3_ASSESSMENTS',
    'CE-COMM      → 06.4_COMMUNICATIONS',
    'CE-VAULT     → 07_Memory_Vault',
    'CE-AUTOPSY   → 08_Project_Autopsies',
    'CE-TEMPLATE  → CCPS_MASTER_TEMPLATES',
    'KOS:         → 03.4_RAW_EXHAUST (human input)',
    'CE:          → 03.4_RAW_EXHAUST (AI exhaust fallback)',
  ];
  body.appendParagraph(tagLines.join('\n'));

  body.appendHorizontalRule();
  body.appendParagraph('For the full specification with examples and anti-patterns, see CE_Naming_Convention_SMP001.docx in your Drive.');

  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(f01);
}


// ══════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════

/**
 * Clears all routing/asset pointer keys from PropertiesService while
 * PRESERVING calibration keys. Use when folders are manually moved/renamed.
 * Next run will re-search Drive and re-cache all IDs.
 */
function resetProperties() {
  const props            = PropertiesService.getScriptProperties();
  const calibrationCache = {};
  CFG.CALIBRATION_KEYS.forEach(k => {
    const v = props.getProperty(k);
    if (v) calibrationCache[k] = v;
  });
  props.deleteAllProperties();
  if (Object.keys(calibrationCache).length > 0) props.setProperties(calibrationCache);
  DocumentApp.getUi().toast(
    'Routing pointer cache cleared. Calibration keys preserved. Next run will re-index.',
    'System Reset', 5
  );
}
