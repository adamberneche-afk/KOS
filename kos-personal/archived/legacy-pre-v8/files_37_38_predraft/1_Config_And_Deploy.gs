// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 1 of 8: Config & Deploy
// ================================================================
//
// Replaces : PART 1 (CFG), PART 2 (onOpen), PART 3 (Deploy),
//            PART 4 (Deploy Helpers), PART 13 (_coldEngineGate),
//            and PART 17 (resetProperties) from KOS_MASTER_v3_1.gs
//
// Changes from v5.4
// ─────────────────────────────────────────────────────────────
// • CFG expanded: STAGING_COLS, MAX_RETRIES, ERROR_LOG_SHEET,
//   INBOUND_SESSIONS_FOLDER, EXTERNAL_TELEMETRY_SHEET
// • deployFullSystem() is fully headless — no ui.alert, no
//   DocumentApp.getActiveDocument(). Returns a results object.
//   Logs to ERROR_LOG sheet and console.
// • setupAllTriggers() installs all 6 background triggers and
//   the spreadsheet onChange for Sensor 3.
// • _buildFolderTree() adds 03.5_INBOUND_SESSIONS.
// • _coldEngineGate() TIER_2 throws Error + _reportError().
//   TIER_1 logs a console warning and allows through.
//   No ui.alert anywhere.
// • onOpen() removed — standalone scripts have no container.
//   Web app UI (7_WebApp.gs) is the primary interaction surface.
// ================================================================


// ================================================================
// PART 1: CONFIGURATION
// ================================================================
const CFG = {

  // ── System Identity ──────────────────────────────────────────
  SYSTEM_NAME:              'Active_Brain_Trust_System',
  SYSTEM_VERSION:           '8.0',

  // ── License ──────────────────────────────────────────────────
  LICENSE_TYPE:             'Polyform Noncommercial 1.0.0',
  AUTHOR:                   'Adam Berneche (RTP Council)',
  FIDELITY_REQUIRED_PERSONA:'PERSONA_ALIGNMENT',
  FIDELITY_REQUIRED_SHEET:  'Blackboard',

  // ── Core Asset Names ─────────────────────────────────────────
  INDEX_NAME:               'BRAIN_TRUST_INDEX',

  // ── Drive Folder Names ───────────────────────────────────────
  STAGING_FOLDER:           '03.4_RAW_EXHAUST',
  INBOUND_SESSIONS_FOLDER:  '03.5_INBOUND_SESSIONS',   // v8.0 — Sensor 1 drop zone

  // ── Sheet Names ───────────────────────────────────────────────
  STAGING_SHEET:            'STAGING_PIPELINE',
  INFERENCE_BUFFER_SHEET:   'Inference_Buffer',         // legacy — kept for backward compat
  MATRIX_LEDGER_SHEET:      'MATRIX_LEDGER',
  DYNAMIC_STATE_MATRIX:     'DYNAMIC_STATE_MATRIX',
  BLACKBOARD_SHEET:         'Blackboard',
  ACTION_REGISTER_SHEET:    'ACTION_REGISTER',
  SESSION_LOG_SHEET:        'SESSION_LOG',
  COG_REGISTRY_SHEET:       'COG_REGISTRY',
  VECTOR_MATRIX_SHEET:      'VECTOR_MATRIX',
  INCUBATOR_SHEET:          'INCUBATOR',
  ONBOARDING_SHEET:         'ONBOARDING_TRACKER',
  EXTERNAL_TELEMETRY_SHEET: 'EXTERNAL_TELEMETRY',      // v8.0 — Sensor 3 target
  ERROR_LOG_SHEET:          'ERROR_LOG',                // v8.0 — error digest source

  // ── STAGING_PIPELINE Column Index Map ────────────────────────
  // Single source of truth — replaces the SC const in Phase 0 patch.
  // Phase 0 patch SC values match these exactly.
  STAGING_COLS: {
    TIMESTAMP:    0,
    PAYLOAD_UID:  1,
    PAYLOAD_TYPE: 2,
    DOC_URL:      3,
    FILE_ID:      4,
    STATUS:       5,
    RETRY_COUNT:  6,
  },
  MAX_RETRIES: 3,

  // ── Chunking ──────────────────────────────────────────────────
  MAX_CHUNK_SIZE:           25000,
  DELIMITER:                '[🧠 RTP',

  // ── Vector Router ─────────────────────────────────────────────
  VECTOR_THRESHOLD:         0.7,
  DECAY_FACTOR:             0.92,
  INCUBATOR_THRESHOLD:      0.10,
  PROMOTION_MIN_SESSIONS:   3,
  PROMOTION_MIN_AVG_WEIGHT: 0.35,
  KNOWN_VECTORS: [
    'ARCHITECTURE', 'UI', 'SECURITY',
    'PEDAGOGY', 'GAS_DEVELOPMENT', 'RELATIONAL',
  ],

  // ── Personas to copy from Drive on Deploy ─────────────────────
  PERSONAS: [
    'PERSONA_ARCHITECT', 'PERSONA_AUDITOR', 'PERSONA_MUSE',
    'PERSONA_DEVELOPER', 'PERSONA_ALIGNER', 'PERSONA_CURATOR',
    'PERSONA_ALIGNMENT',
  ],

  // ── Vector primer docs to scaffold on Deploy ──────────────────
  VECTORS_TO_CREATE: [
    'VECTOR_ARCHITECTURE', 'VECTOR_PEDAGOGY',
    'VECTOR_SECURITY', 'VECTOR_UI',
  ],

  // ── Calibration keys (values never hardcoded) ─────────────────
  CALIBRATION_KEYS: [
    'THEME_ARCHITECTURE', 'THEME_PEDAGOGY', 'THEME_FAMILY_ALIGNMENT',
    'SOCRATIC_THRESHOLD', 'IDENTITY_KEY_SALT',
  ],

  // ── Onboarding ────────────────────────────────────────────────
  ONBOARDING_DAYS:          21,
  TOTAL_ONBOARDING_STEPS:   8,

  // ── Turnstile ────────────────────────────────────────────────
  TURNSTILE_CONCURRENCY:    1,    // max concurrent STUDIO_ACTIVE rows
  TURNSTILE_STALE_MINS:     30,   // mins before stale STUDIO_ACTIVE resets

  // ── Shadow Matrix (Ambient Onboarding) ───────────────────────
  SHADOW_MATRIX_KEY:        'KOS_SHADOW_MATRIX',
  SHADOW_VERIFY_THRESHOLD:  0.75, // confidence to auto-verify a question
  SHADOW_QUESTION_KEYS: [
    'admin_ghost',        // what steals your time
    'relational_targets', // who this system protects time for
    'necessary_struggle', // what you refuse to automate
    'prime_directive',    // core professional purpose
    'temporal_constraints', // protected time blocks
  ],

  // ── Council ──────────────────────────────────────────────────
  COUNCIL_AUTO_TRIGGER_SESSIONS: 5,  // sessions between auto-council checks
  COUNCIL_PERSONAS: [
    'PERSONA_ARCHITECT', 'PERSONA_AUDITOR', 'PERSONA_MUSE',
    'PERSONA_DEVELOPER', 'PERSONA_ALIGNER', 'PERSONA_CURATOR',
    'PERSONA_ALIGNMENT',
  ],

  // ── PropertiesService keys for onboarding state ───────────────
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


// ================================================================
// DEPLOY — HEADLESS ENTRY POINT
// ================================================================

/**
 * Builds or verifies the entire KOS v8.0 system in Google Drive.
 * Idempotent — safe to re-run. Does NOT require or use any UI.
 *
 * Call from: Apps Script editor, or via the web app Diagnostics
 * tab (7_WebApp.gs exposes this as a server-side function).
 *
 * @returns {Object} { success, log[], errors[] }
 */
function deployFullSystem() {
  const log    = [];
  const errors = [];

  const emit = msg => { log.push(msg); console.log('[DEPLOY] ' + msg); };
  const fail = (ctx, e) => {
    const msg = `❌ ${ctx}: ${e.message}`;
    errors.push(msg);
    console.error('[DEPLOY ERROR] ' + msg);
    _reportError('deployFullSystem:' + ctx, e, null);
  };

  try {
    // ── 1. Folder Tree ─────────────────────────────────────────
    emit('Building folder tree…');
    const folders = _buildFolderTree();
    emit('✔ Folder tree ready (' + Object.keys(folders).length + ' folders)');

    // ── 2. BRAIN_TRUST_INDEX ───────────────────────────────────
    emit('Creating / verifying BRAIN_TRUST_INDEX…');
    const ss = _getOrCreateSpreadsheet(CFG.INDEX_NAME, folders.root);
    const sheetNames = [
      CFG.STAGING_SHEET,
      'EXECUTION_LEDGER',
      CFG.INFERENCE_BUFFER_SHEET,
      CFG.MATRIX_LEDGER_SHEET,
      CFG.DYNAMIC_STATE_MATRIX,
      CFG.BLACKBOARD_SHEET,
      CFG.ACTION_REGISTER_SHEET,
      CFG.SESSION_LOG_SHEET,
      CFG.COG_REGISTRY_SHEET,
      CFG.VECTOR_MATRIX_SHEET,
      CFG.INCUBATOR_SHEET,
      CFG.ONBOARDING_SHEET,
      CFG.EXTERNAL_TELEMETRY_SHEET,   // v8.0 — Sensor 3
      CFG.ERROR_LOG_SHEET,            // v8.0 — error digest
    ];
    sheetNames.forEach(n => _getOrCreateSheet(ss, n));
    _seedBlackboardTemplateRow(ss);
    PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
    emit('✔ All ' + sheetNames.length + ' pipeline sheets verified');

    // ── 3. Foundation Documents ────────────────────────────────
    emit('Scaffolding foundational documents…');
    try { _createAllFoundationDocs(folders); emit('✔ Foundation docs scaffolded'); }
    catch (e) { fail('_createAllFoundationDocs', e); }

    // ── 4. Personas ────────────────────────────────────────────
    emit('Copying persona documents…');
    try {
      const pLog = _copyPersonas(folders.f02);
      pLog.forEach(l => emit(l));
    } catch (e) { fail('_copyPersonas', e); }

    // ── 5. Vector Primer Docs ──────────────────────────────────
    emit('Scaffolding vector primer docs…');
    try {
      CFG.VECTORS_TO_CREATE.forEach(v => _scaffoldVectorDoc(v, folders.f05));
      emit('✔ Vector primers ready');
    } catch (e) { fail('_scaffoldVectorDoc', e); }

    // ── 6. Property Registration ───────────────────────────────
    emit('Registering system properties…');
    try {
      _registerAllProperties(folders, ss);
      _registerDocPointers(folders);
      emit('✔ Properties registered');
    } catch (e) { fail('_registerAllProperties', e); }

    // ── 7. Identity Key ────────────────────────────────────────
    emit('Generating Identity Key…');
    try {
      generateIdentityKey();
      emit('✔ Identity Key generated');
    } catch (e) { fail('generateIdentityKey', e); }

    // ── 8. Calibration Status ──────────────────────────────────
    try {
      const cs = _getCalibrationStatus();
      emit(cs.armed
        ? '✔ Engine ARMED — ' + cs.count + ' calibration key(s) set'
        : '⚠ Engine COLD — run Socratic Onboarding via web app to arm');
    } catch (e) { emit('⚠ Could not read calibration status'); }

    // ── 9. Trigger Setup ───────────────────────────────────────
    emit('Installing background triggers…');
    try {
      const tLog = setupAllTriggers();
      tLog.forEach(l => emit(l));
    } catch (e) { fail('setupAllTriggers', e); }

    // ── 10. Log to ERROR_LOG sheet ────────────────────────────
    try {
      const errSheet = _getOrCreateSheet(ss, CFG.ERROR_LOG_SHEET);
      errSheet.appendRow([
        new Date(),
        'deployFullSystem',
        'Deploy complete. Errors: ' + errors.length,
        log.join(' | '),
      ]);
      SpreadsheetApp.flush();
    } catch (_) {} // non-critical

    const success = errors.length === 0;
    emit(success
      ? '🚀 Deploy complete — no errors.'
      : '⚠ Deploy finished with ' + errors.length + ' non-fatal error(s). Check error log.');

    return { success, log, errors };

  } catch (fatalError) {
    fail('FATAL', fatalError);
    return { success: false, log, errors };
  }
}


// ================================================================
// TRIGGER MANAGEMENT
// ================================================================

/**
 * Installs all background triggers for the v8.0 headless system.
 * Idempotent — removes existing KOS triggers before re-installing.
 *
 * Triggers installed:
 *   sensor1_scanInboundSessions   → every 5 min  (time-driven)
 *   processInferenceQueue         → every 10 min (time-driven)
 *   sendDailyErrorReport          → daily 08:00  (time-driven)
 *   runSemanticSweeper            → hourly        (time-driven)
 *   sweepRootForExhaust           → hourly        (time-driven)
 *   sensor3_externalTelemetry     → onChange on BRAIN_TRUST_INDEX
 *
 * Note: Sensor 2 (COG_EXHAUST) is the doPost() web app endpoint —
 * it requires no installable trigger.
 *
 * @returns {string[]} Log lines for embed in deployFullSystem output.
 */
function setupAllTriggers() {
  const log = [];
  const KOS_TRIGGERS = [
    'sensor1_scanInboundSessions',
    'processInferenceQueue',
    'sendDailyErrorReport',
    'runSemanticSweeper',
    'sweepRootForExhaust',
    'sensor3_externalTelemetry',
  ];

  // ── Clear existing KOS triggers ────────────────────────────
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (KOS_TRIGGERS.includes(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  if (removed > 0) log.push('  ↻ Removed ' + removed + ' existing KOS trigger(s)');

  const installed = [];
  const failed    = [];

  const tryInstall = (name, fn) => {
    try { fn(); installed.push(name); }
    catch (e) { failed.push(name + ': ' + e.message); }
  };

  // ── Sensor 1 — scan INBOUND_SESSIONS every 5 min ───────────
  tryInstall('sensor1_scanInboundSessions', () =>
    ScriptApp.newTrigger('sensor1_scanInboundSessions')
      .timeBased().everyMinutes(5).create()
  );

  // ── Queue Processor — every 10 min ─────────────────────────
  tryInstall('processInferenceQueue', () =>
    ScriptApp.newTrigger('processInferenceQueue')
      .timeBased().everyMinutes(10).create()
  );

  // ── Daily Error Report — 08:00 ─────────────────────────────
  tryInstall('sendDailyErrorReport', () =>
    ScriptApp.newTrigger('sendDailyErrorReport')
      .timeBased().atHour(8).everyDays(1).create()
  );

  // ── Semantic Sweeper — hourly ───────────────────────────────
  tryInstall('runSemanticSweeper', () =>
    ScriptApp.newTrigger('runSemanticSweeper')
      .timeBased().everyHours(1).create()
  );

  // ── Exhaust Sweeper — hourly ────────────────────────────────
  tryInstall('sweepRootForExhaust', () =>
    ScriptApp.newTrigger('sweepRootForExhaust')
      .timeBased().everyHours(1).create()
  );

  // ── Sensor 3 — onChange on BRAIN_TRUST_INDEX ───────────────
  // The onChange trigger must bind to the spreadsheet object.
  // Requires INDEX_ID to be set — safe to call after property registration.
  tryInstall('sensor3_externalTelemetry', () => {
    const indexId = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (!indexId) throw new Error('INDEX_ID not set — run deployFullSystem first');
    ScriptApp.newTrigger('sensor3_externalTelemetry')
      .forSpreadsheet(SpreadsheetApp.openById(indexId))
      .onChange()
      .create();
  });

  // ── FIX-02: Governance onEdit — was in teardown but never installed ──
  tryInstall('onGovernanceEdit', () => {
    const indexId = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (!indexId) throw new Error('INDEX_ID not set — run deployFullSystem first');
    ScriptApp.newTrigger('onGovernanceEdit')
      .forSpreadsheet(SpreadsheetApp.openById(indexId))
      .onEdit()
      .create();
  });

  // ── Turnstile — every 5 min (rate-controls Studio exposure) ────
  tryInstall('runMatrixTurnstile', () =>
    ScriptApp.newTrigger('runMatrixTurnstile')
      .timeBased().everyMinutes(5).create()
  );

  // ── Daily Primer — 06:00 (before error digest at 08:00) ────────
  tryInstall('generateDailyPrimer', () =>
    ScriptApp.newTrigger('generateDailyPrimer')
      .timeBased().atHour(6).everyDays(1).create()
  );

  // ── Auto Council check — every 2 hours ─────────────────────────
  tryInstall('autoCouncilCheck', () =>
    ScriptApp.newTrigger('autoCouncilCheck')
      .timeBased().everyHours(2).create()
  );

  if (installed.length > 0) {
    log.push('  ✔ Triggers installed: ' + installed.join(', '));
  }
  if (failed.length > 0) {
    failed.forEach(f => log.push('  ⚠ Trigger failed: ' + f));
  }
  return log;
}


/**
 * Removes ALL KOS background triggers without reinstalling them.
 * Use this before migrating to a new script or during debugging.
 */
function teardownAllTriggers() {
  const KOS_TRIGGERS = [
    'sensor1_scanInboundSessions', 'processInferenceQueue',
    'sendDailyErrorReport', 'runSemanticSweeper',
    'sweepRootForExhaust', 'sensor3_externalTelemetry',
    'onGovernanceEdit',
    'runMatrixTurnstile',   // Turnstile
    'generateDailyPrimer',  // Daily primer
    'autoCouncilCheck',     // Auto council
  ];
  let count = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (KOS_TRIGGERS.includes(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });
  console.log('[teardownAllTriggers] Removed ' + count + ' trigger(s).');
  return count;
}


// ================================================================
// FOLDER TREE
// ================================================================

/**
 * Creates the full KOS v8.0 Drive folder hierarchy.
 * Idempotent — _getOrCreateFolder is a no-op if the folder exists.
 *
 * v8.0 additions vs v5.4:
 *   f03_inbound  = 03.5_INBOUND_SESSIONS  ← Sensor 1 drop zone
 *
 * @returns {Object} Named folder references for use by callers.
 */
function _buildFolderTree() {
  const root  = _getOrCreateFolder(CFG.SYSTEM_NAME);

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
  const f03_in  = _getOrCreateFolder('03.5_INBOUND_SESSIONS',    f03);  // v8.0 — Sensor 1

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
    f03, f03_1, f03_2, f03_3, f03_raw, f03_in,
    f04, f04_1, f04_2, f04_3, f04_4, f04_5, f04_6, f04_7, f04_8,
    f05, f06, f06_1, f06_2, f06_3, f06_4, f07, f08, ccps,
  };
}


// ================================================================
// PROPERTY REGISTRATION
// ================================================================

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
    'FOLDER_ID':                folders.f03_raw,           // legacy alias
    'ID_03_5_INBOUND_SESSIONS': folders.f03_in,            // v8.0
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
  };
  Object.entries(map).forEach(([k, f]) => {
    if (f) props.setProperty(k, f.getId());
  });
  if (ss) {
    props.setProperty('INDEX_ID', ss.getId());
    props.setProperty('ID_BRAIN_TRUST_INDEX', ss.getId());
  }
}


function _registerDocPointers(folders) {
  const props  = PropertiesService.getScriptProperties();
  const docMap = {
    'ID_CURRENT_STATE':      { folder: folders.f03_1, name: 'CURRENT_STATE' },
    'ID_PIVOTS_AND_LESSONS': { folder: folders.f03_2, name: 'PIVOTS_AND_LESSONS_V1.0' },
  };
  Object.entries(docMap).forEach(([key, { folder, name }]) => {
    const it = folder.getFilesByName(name);
    if (it.hasNext()) props.setProperty(key, it.next().getId());
  });
}


/**
 * Headless version of setupRoutingProperties — re-indexes Drive
 * for all folder/file IDs and writes them to PropertiesService.
 * Use this if folders were manually moved or renamed.
 */
function setupRoutingProperties() {
  function fetchId(name, isFolder) {
    const it = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
    if (it.hasNext()) return it.next().getId();
    console.error('[setupRoutingProperties] NOT FOUND: ' + name);
    return null;
  }
  const props = PropertiesService.getScriptProperties();
  const map = {
    'ID_01_1_SCRIPTS':          fetchId('01.1_SCRIPTS',              true),
    'ID_01_2_SOP_AND_FLOWS':    fetchId('01.2_SOP_AND_FLOWS',        true),
    'ID_01_3_SMP_PROPOSALS':    fetchId('01.3_SMP_PROPOSALS',        true),
    'ID_02_COUNCIL_ALIGNMENTS': fetchId('02_Council_Alignments',     true),
    'ID_03_DYNAMIC_STATE':      fetchId('03_Dynamic_State',          true),
    'ID_03_1_CURRENT_STATE':    fetchId('03.1_CURRENT_STATE',        true),
    'ID_03_2_PIVOTS':           fetchId('03.2_PIVOTS_AND_LESSONS',   true),
    'ID_03_3_PROCESSED':        fetchId('03.3_PROCESSED_EXHAUST',    true),
    'ID_00_RAW_EXHAUST':        fetchId('03.4_RAW_EXHAUST',          true),
    'FOLDER_ID':                fetchId('03.4_RAW_EXHAUST',          true),
    'ID_03_5_INBOUND_SESSIONS': fetchId('03.5_INBOUND_SESSIONS',     true),  // v8.0
    'ID_04_COUNCIL_LOGS':       fetchId('04_Council_Logs',           true),
    'ID_04_1_ARCHITECT':        fetchId('04.1_ARCHITECT_SILO',       true),
    'ID_04_2_AUDITOR':          fetchId('04.2_AUDITOR_SILO',         true),
    'ID_04_3_MUSE':             fetchId('04.3_MUSE_SILO',            true),
    'ID_04_4_DEVELOPER':        fetchId('04.4_DEVELOPER_SILO',       true),
    'ID_04_5_ALIGNER':          fetchId('04.5_ALIGNER_SILO',        true),
    'ID_04_6_CURATOR':          fetchId('04.6_CURATOR_SILO',         true),
    'ID_04_7_RTP':              fetchId('04.7_RTP_SILO',             true),
    'ID_04_8_GRAVEYARD':        fetchId('04.8_COG_GRAVEYARD',        true),
    'ID_05_VECTOR_REPOSITORY':  fetchId('05_Vector_Repository',      true),
    'ID_06_1_LESSON_PLANS':     fetchId('06.1_LESSON_PLANS',         true),
    'ID_06_2_STUDENT_FACING':   fetchId('06.2_STUDENT_FACING',       true),
    'ID_06_3_ASSESSMENTS':      fetchId('06.3_ASSESSMENTS',          true),
    'ID_06_4_COMMUNICATIONS':   fetchId('06.4_COMMUNICATIONS',       true),
    'ID_07_MEMORY_VAULT':       fetchId('07_Memory_Vault',           true),
    'ID_08_PROJECT_AUTOPSIES':  fetchId('08_Project_Autopsies',      true),
    'ID_CCPS_MASTER_TEMPLATES': fetchId('CCPS_MASTER_TEMPLATES',     true),
    'INDEX_ID':                 fetchId('BRAIN_TRUST_INDEX',         false),
    'ID_CURRENT_STATE':         fetchId('CURRENT_STATE',             false),
    'ID_PIVOTS_AND_LESSONS':    fetchId('PIVOTS_AND_LESSONS_V1.0',   false),
  };
  let ok = 0, miss = 0;
  Object.entries(map).forEach(([k, id]) => {
    if (id) { props.setProperty(k, id); ok++; }
    else miss++;
  });
  const msg = `setupRoutingProperties: ${ok} registered, ${miss} missing.`;
  console.log('[' + msg + ']');
  return { ok, miss };
}


// ================================================================
// COLD ENGINE GATE — HEADLESS v8.0
// ================================================================

/**
 * Headless replacement for the v5.4 _coldEngineGate.
 *
 * TIER_2 (hard gate): throws a standard Error and calls
 *   _reportError() so the admin gets it in the daily digest.
 *   The calling trigger exits cleanly.
 *
 * TIER_1 (soft gate): logs a console warning and allows the
 *   caller to proceed. Vector scoring will be inactive but
 *   no data is lost.
 *
 * Neither tier attempts to access DocumentApp.getUi().
 */
function _coldEngineGate(callerFunction, tier) {
  const props  = PropertiesService.getScriptProperties();
  const isCold = !props.getProperty('IDENTITY_KEY') ||
                  props.getProperty(CFG.PROP.THESIS_VERIFIED) !== 'true';
  if (!isCold) return;  // armed — pass through

  if (tier === 'TIER_2') {
    const err = new Error(
      `[COLD_ENGINE_TIER_2] ${callerFunction} is blocked. ` +
      `The engine has not been armed. Complete Socratic Onboarding via the web app.`
    );
    _reportError(`COLD_ENGINE_GATE — ${callerFunction}`, err, null);
    throw err;  // aborts the trigger cleanly
  }

  // TIER_1 — warn but allow through
  console.warn(
    `[COLD_ENGINE_TIER_1] ${callerFunction}: Engine cold. ` +
    `Vector scoring inactive. Complete Socratic Onboarding to arm.`
  );
}


// ================================================================
// FOUNDATION DOCUMENT SCAFFOLDING
// ================================================================

function _createAllFoundationDocs(folders) {
  _scaffoldDoc('CORE_THESIS', folders.f01, [
    { h1: 'CORE THESIS' },
    { h2: 'System Identity' },
    { p:  'Define what this system is and why it exists.' },
    { h2: 'Primary Objectives' },
    { p:  'List the 3–5 outcomes this system produces.' },
    { h2: 'Foundational Principles' },
    { p:  'What rules govern how the system operates? These should be immutable.' },
    { h2: 'Success Metrics' },
    { p:  'How will you know the system is working?' },
  ]);

  _scaffoldDoc('CURRENT_STATE', folders.f03_1, [
    { h1: 'CURRENT STATE' },
    { h2: 'Last Updated' }, { p: '[Update each session]' },
    { h2: 'System Health' },
    { p:  '🟢 GREEN — Nominal\n🟡 YELLOW — Issues\n🔴 RED — Critical' },
    { h2: 'Active Projects' }, { p: '[List current projects and status]' },
    { h2: 'Open Loops' },     { p: '[What is unresolved or waiting?]' },
    { h2: 'Next Actions' },   { p: '[What happens next? Who owns it? By when?]' },
  ]);

  _scaffoldDoc('PIVOTS_AND_LESSONS_V1.0', folders.f03_2, [
    { h1: 'PIVOTS AND LESSONS' },
    { h2: 'Entry Format' },
    { p:  '[DATE]  |  [LESSON TITLE]  |  [WHAT CHANGED]  |  [ACTION TAKEN]' },
    { h2: 'Active Pivots' },
    { p:  'PIVOT 008 | THE_CALIBRATION_WALL | All "Soul" data in PropertiesService. Cold Engine enforced.' },
    { h2: 'Archived Pivots' }, { p: 'PIVOT 001–007 — See system documentation.' },
  ]);

  _scaffoldDoc('SYSTEM_TELEMETRY', folders.f03, [
    { h1: 'SYSTEM TELEMETRY' },
    { h2: 'Deployment Date' }, { p: new Date().toLocaleDateString() },
    { h2: 'System Version' },  { p: 'KOS v8.0 — Headless Studio Edition' },
    { h2: 'Engine Status' },   { p: 'COLD — Complete Socratic Onboarding via web app to arm.' },
    { h2: 'Architecture' },    { p: 'Headless Pub/Sub. Sensors: SESSION_LOG (web app + time trigger), COG_EXHAUST (doPost webhook), EXTERNAL_DATA (onChange + web app paste).' },
    { h2: 'Active Personas' }, { p: '7 (ARCHITECT, AUDITOR, MUSE, DEVELOPER, ALIGNER, CURATOR, ALIGNMENT)' },
    { h2: 'Vector Coverage' }, { p: CFG.KNOWN_VECTORS.join(', ') },
  ]);

  _scaffoldDoc('SMP-002_SEVEN_BRIDGES_RECONCILIATION_PROTOCOL', folders.f01_3, [
    { h1: 'SMP-002: SEVEN BRIDGES RECONCILIATION PROTOCOL' },
    { h2: 'Status: PENDING USER APPROVAL' },
    { h2: 'The Problem' },
    { p:  'Cogs responding in shared threads produce Consensus Drift.' },
    { h2: 'The Protocol' },
    { p:  'Layer 1 — SEQUESTRATION: Each cog receives stimulus in isolation.\nLayer 2 — RECONCILIATION: RTP assembles all 7 verdicts without cross-contamination.\n3/7 TRIGGER: 3+ non-APPROVED verdicts halt execution.' },
    { h2: 'Governing Law' },
    { p:  'BRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog\'s verdict is VOID.' },
  ]);

  _scaffoldDoc('CE_NAMING_CONVENTION_SMP001', folders.f01, [
    { h1: 'CE NAMING CONVENTION — SMP-001' },
    { h2: 'Formula' },
    { p:  '[CE-TAG]: [Descriptive Title] [vX.X optional]' },
    { h2: 'Rules' },
    { p:  '1. Tag must be FIRST characters in filename\n2. Followed by ": " (colon + space)\n3. Tags are CASE-SENSITIVE\n4. Never manually add [UID_...] prefix\n5. One CE tag per filename' },
  ]);

  // v8.0 — replaces START_HERE_GEM_SETUP (HITL doc retired)
  _scaffoldDoc('KOS_v8_QUICK_START', folders.f01, [
    { h1: 'KOS v8.0 QUICK START — HEADLESS STUDIO EDITION' },
    { h2: '1. Deploy' },
    { p:  'Run deployFullSystem() from the Apps Script editor once.\nThis builds all folders, sheets, foundation docs, and installs all triggers.' },
    { h2: '2. Arm the Engine' },
    { p:  'Open the web app URL (Apps Script → Deploy → Test Deployments).\nComplete Socratic Onboarding from the Diagnostics tab.' },
    { h2: '3. Ingest Session Logs' },
    { p:  'Web App → Ingest tab → Session Log → Paste → Queue Payload.\nOr: Drop a .txt doc into 03.5_INBOUND_SESSIONS — Sensor 1 picks it up within 5 minutes.' },
    { h2: '4. Ingest Research / Context' },
    { p:  'Web App → Ingest tab → Research / Context → Paste title + content → Queue Payload.\nQueued as EXTERNAL_DATA with status PENDING_FLOW.' },
    { h2: '5. COG Exhaust Webhook (Sensor 2)' },
    { p:  'POST to the web app URL with payload:\n  { "cog_name": "...", "task_id": "...", "verdict": "...", "artifact_text": "..." }\nHeader: Content-Type: application/json' },
    { h2: '6. Monitor' },
    { p:  'Web App → Queue tab: live status counts and NEEDS_CURATOR list.\nError digest arrives daily at 08:00 or on demand from Diagnostics tab.' },
    { h2: '7. Governance Mutations' },
    { p:  'BRAIN_TRUST_INDEX → Blackboard tab.\nSet Deploy_Trigger = TRUE in the row to fire applyMutation().' },
  ]);

  _scaffoldDoc('PRD_TEMPLATE_LESSON_PLAN', folders.ccps, [
    { h1: 'LESSON PLAN TEMPLATE' },
    { h2: 'Course & Unit' },  { p: '[Course]  |  Unit [#]: [Title]' },
    { h2: 'VDOE Competencies' }, { p: '[Competency codes]' },
    { h2: 'Learning Objectives' },
    { p:  'By the end, students will:\n1. \n2. \n3. ' },
    { h2: 'Lesson Flow' },
    { p:  'HOOK (0:00–0:10)\n\nINSTRUCTION (0:10–0:30)\n\nPRACTICE (0:30–0:50)\n\nCLOSURE (0:50–1:00)' },
    { h2: 'Assessment' },     { p: '[Formative or summative?]' },
    { h2: 'Differentiation' }, { p: 'Enrichment: []\nSupport: []' },
  ]);

  // ── Persona scaffolding (Sprint: Personas as Deploy Scaffolding) ─
  // Creates template persona docs in 02_Council_Alignments if they
  // don't already exist. These are starter scaffolds — the operator
  // and Studio populate them during calibration sessions.
  _scaffoldPersonaDocs(folders.f02);
}


/**
 * Creates template persona docs in the Council Alignments folder.
 * Each doc has the persona's role, behavioral profile, and blank
 * calibration slots. Called by _createAllFoundationDocs().
 *
 * Idempotent: _scaffoldDoc() checks for existence before creating.
 *
 * @param {Folder} folder  02_Council_Alignments Drive folder.
 */
function _scaffoldPersonaDocs(folder) {
  const personas = [
    {
      name: 'PERSONA_ARCHITECT_V5',
      role: 'THE ARCHITECT',
      directive: 'Design systems that outlast the session. Every decision must survive the test of scale.',
      triggers: 'When structural decisions must be made. When technical debt threatens the mission.',
      bounds: 'Never overrides relational priorities for pure efficiency. Never designs without constraints.',
      voice: 'Precise, declarative, future-facing. Speaks in systems and tradeoffs.',
    },
    {
      name: 'PERSONA_AUDITOR_V5',
      role: 'THE AUDITOR',
      directive: 'Verify before you trust. Surface what others assume is fine.',
      triggers: 'When verification is needed. When compliance or consistency is at risk.',
      bounds: 'Never blocks progress without a clear path forward. Never audits without criteria.',
      voice: 'Measured, evidence-first, direct. Delivers verdicts, not opinions.',
    },
    {
      name: 'PERSONA_MUSE_V5',
      role: 'THE MUSE',
      directive: 'Find the unexpected connection. The system is only as alive as its ideas.',
      triggers: 'When creative approaches are needed. When the operator is stuck in linear thinking.',
      bounds: 'Never prioritises novelty over function. Never ignores the operator\'s constraints.',
      voice: 'Associative, warm, expansive. Speaks in metaphors and possibilities.',
    },
    {
      name: 'PERSONA_DEVELOPER_V5',
      role: 'THE DEVELOPER',
      directive: 'Build what was designed. Close the gap between intent and implementation.',
      triggers: 'When technical implementation is needed. When code or process must be executed.',
      bounds: 'Never ships without a test case. Never builds without a spec.',
      voice: 'Literal, precise, solution-oriented. Speaks in functions and edge cases.',
    },
    {
      name: 'PERSONA_ALIGNER_V5',
      role: 'THE ALIGNER',
      directive: 'Protect the relational field. No outcome justifies a breach of trust.',
      triggers: 'When relational stakes are present. When the operator\'s protected targets are affected.',
      bounds: 'Never compromises relational integrity for operational speed.',
      voice: 'Warm, deliberate, protective. Speaks in relationships and consequences.',
    },
    {
      name: 'PERSONA_CURATOR_V5',
      role: 'THE CURATOR',
      directive: 'Organise so the operator can think. The signal must be findable.',
      triggers: 'When information is scattered. When synthesis or classification is needed.',
      bounds: 'Never discards without archiving. Never organises without a retrieval plan.',
      voice: 'Orderly, systematic, calm. Speaks in categories and hierarchies.',
    },
    {
      name: 'PERSONA_ALIGNMENT_V5',
      role: 'THE ALIGNMENT ENFORCER',
      directive: 'This system exists to protect human time and relational integrity. Enforce it.',
      triggers: 'Always active. Monitors every output for alignment drift.',
      bounds: 'Cannot be suppressed. Cannot be overridden by other cogs.',
      voice: 'Firm, non-negotiable, clear. Issues flags, not suggestions.',
    },
  ];

  personas.forEach(p => {
    _scaffoldDoc(p.name, folder, [
      { h1: p.role },
      { h3: 'CE-CODE: ' + p.name + '  |  KOS v' + CFG.SYSTEM_VERSION },
      { hr: true },
      { h2: 'Prime Directive' },       { p: p.directive  },
      { h2: 'Activation Trigger' },    { p: p.triggers   },
      { h2: 'Behavioral Bounds' },     { p: p.bounds     },
      { h2: 'Voice & Register' },      { p: p.voice      },
      { hr: true },
      { h2: 'Calibration Notes' },
      { p: '[Populated by Ambient Onboarding as confidence intervals are verified]\n\n' +
           'admin_ghost:          [UNKNOWN]\n' +
           'relational_targets:   [UNKNOWN]\n' +
           'necessary_struggle:   [UNKNOWN]\n' +
           'prime_directive:      [UNKNOWN]\n' +
           'temporal_constraints: [UNKNOWN]' },
      { h2: 'Session History' },
      { p: '[Auto-populated by vector routing after each processed session]' },
    ]);
  });
}


function _scaffoldDoc(name, folder, sections) {
  if (folder.getFilesByName(name).hasNext()) return;
  const doc  = DocumentApp.create(name);
  const dId  = doc.getId();
  const body = doc.getBody();
  body.clear();
  sections.forEach(s => {
    if      (s.h1)           body.appendParagraph(s.h1).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    else if (s.h2)           body.appendParagraph(s.h2).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    else if (s.h3)           body.appendParagraph(s.h3).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    else if (s.p !== undefined) body.appendParagraph(String(s.p));
    else if (s.hr)           body.appendHorizontalRule();
  });
  doc.saveAndClose();
  DriveApp.getFileById(dId).moveTo(folder);  // BUG-03 pattern: use captured ID
}


function _scaffoldVectorDoc(name, folder) {
  if (folder.getFilesByName(name).hasNext()) return;
  const domain = {
    VECTOR_ARCHITECTURE: 'System Design & Technical Infrastructure',
    VECTOR_PEDAGOGY:     'Teaching, Learning & Student Outcomes',
    VECTOR_SECURITY:     'Data Privacy, Student Safety & Access Control',
    VECTOR_UI:           'User Experience & Interface Design',
  }[name] || 'Knowledge Domain';
  _scaffoldDoc(name, folder, [
    { h1: name.replace('_', ': ') },
    { h2: 'Domain: ' + domain },
    { h2: 'Core Principles' },
    { p:  '[What foundational beliefs govern this domain?]' },
    { h2: 'Key Decisions Log' },
    { p:  '[DATE]  |  [DECISION]  |  [RATIONALE]' },
    { h2: 'Active Constraints' },
    { p:  '[What limits or guardrails currently apply?]' },
    { h2: 'Evolution Log' },
    { p:  '[What changed? What was deprecated and why?]' },
  ]);
}


function _copyPersonas(f02) {
  const log = [];
  CFG.PERSONAS.forEach(baseName => {
    try {
      const sourceFile = _findHighestVersionDoc(baseName);
      if (!sourceFile) { log.push('  ⚠ ' + baseName + ': Not found in Drive — skipped'); return; }
      const sourceName = sourceFile.getName();
      if (f02.getFilesByName(sourceName).hasNext()) {
        log.push('  ↷ ' + sourceName + ': Already exists'); return;
      }
      const content = DocumentApp.openById(sourceFile.getId()).getBody().getText();
      const newDoc  = DocumentApp.create(sourceName);
      const newId   = newDoc.getId();
      newDoc.getBody().setText(content);
      newDoc.saveAndClose();
      DriveApp.getFileById(newId).moveTo(f02);  // BUG-03 pattern: use captured ID
      log.push('  ✔ ' + sourceName + ': Copied');
    } catch (e) {
      log.push('  ❌ ' + baseName + ': ' + e.message);
    }
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
    if (v > bestV)              { bestV = v; best = f; }
    else if (bestV === -1 && !best) { best = f; }
  }
  return best;
}


function _seedBlackboardTemplateRow(ss) {
  const sheet = _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
  if (sheet.getLastRow() > 1) return;
  sheet.appendRow([
    '[PASTE_TARGET_DOC_ID]', 'CE-STATE', 'CURRENT_STATE', 'v1.0',
    '[AWAITING_GENESIS_PROTOCOL...]', 'SYSTEM ONLINE — Session 001', '', 'Example row — delete before use',
    'ARCHITECT', new Date(), 'EXAMPLE', false,
  ]);
  sheet.getRange(2, 1, 1, 12).setBackground('#FFF9C4').setFontStyle('italic');
}


// ================================================================
// ADMIN
// ================================================================

// ================================================================
// END 1_Config_And_Deploy.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 2_Ingestion_Sensors.gs
// ================================================================
