/**
 * ============================================================
 * KOS v8.0 — THE HEADLESS STUDIO EDITION
 * File: 1_Config_And_Deploy.gs
 * ============================================================
 * Phase 0 Bug Fixes Applied in This File:
 *
 *   BUG #2 — STAGING_PIPELINE magic column indices replaced with
 *             CFG.STAGING_COL named constants. Every other file
 *             must use these constants — never raw numbers.
 *
 *   BUG #3 — _saveAndMove() is the single canonical helper for all
 *             Doc creation. Enforces saveAndClose() → getId() →
 *             moveTo() sequence. _routeToVectorDocs() fix is in
 *             4_Vector_Router.gs using this helper.
 *
 *   BUG #4 — CFG.KNOWN_VECTORS_SEED is never mutated at runtime.
 *             All callers use _getKnownVectors() which merges the
 *             seed list with promoted vectors persisted in
 *             PropertiesService under CFG.PROP.PROMOTED_VECTORS.
 *
 * Fixes #1 (lock deadlock) and #5 (applyMutation UI) are in
 * 4_Vector_Router.gs and 6_Governance.gs respectively.
 *
 * Architecture Changes vs v5.4:
 *   - Standalone script — no DocumentApp.getActiveDocument() calls
 *   - deployFullSystem() is headless: logs to console, returns log[]
 *   - DROP_ZONE doc concept retired; ingestion via web app UI
 *   - Two new folders: 01_INBOUND_SESSIONS, EXTERNAL_TELEMETRY sheet
 *   - STAGING_PIPELINE schema: 7 columns (added Payload_Type, Retry_Count)
 *   - STATUS and PAYLOAD_TYPE constants replace all hardcoded strings
 *   - setupAllTriggers() installs all 4 background triggers in one call
 * ============================================================
 */


// ── PART 1: CONFIGURATION ────────────────────────────────────
const CFG = {

  // System Identity
  SYSTEM_NAME:    'Active_Brain_Trust_System',
  SYSTEM_VERSION: '8.0',

  // License
  LICENSE_TYPE:              'Polyform Noncommercial 1.0.0',
  AUTHOR:                    'Adam Berneche (RTP Council)',
  FIDELITY_REQUIRED_PERSONA: 'PERSONA_ALIGNMENT',
  FIDELITY_REQUIRED_SHEET:   'Blackboard',

  // Asset Names
  STAGING_FOLDER:  '03.4_RAW_EXHAUST',
  INBOUND_FOLDER:  '01_INBOUND_SESSIONS',
  INDEX_NAME:      'BRAIN_TRUST_INDEX',

  // Sheet Names
  STAGING_SHEET:        'STAGING_PIPELINE',
  MATRIX_LEDGER_SHEET:  'MATRIX_LEDGER',
  DYNAMIC_STATE_MATRIX: 'DYNAMIC_STATE_MATRIX',
  BLACKBOARD_SHEET:     'Blackboard',
  ACTION_REGISTER_SHEET:'ACTION_REGISTER',
  SESSION_LOG_SHEET:    'SESSION_LOG',
  COG_REGISTRY_SHEET:   'COG_REGISTRY',
  VECTOR_MATRIX_SHEET:  'VECTOR_MATRIX',
  INCUBATOR_SHEET:      'INCUBATOR',
  ONBOARDING_SHEET:     'ONBOARDING_TRACKER',
  ERROR_LOG_SHEET:      'ERROR_LOG',
  EXECUTION_LEDGER_SHEET:'EXECUTION_LEDGER',
  TELEMETRY_SHEET:      'EXTERNAL_TELEMETRY',

  // ── BUG FIX #2 ────────────────────────────────────────────
  // STAGING_PIPELINE column indices as named constants.
  // Schema: [Timestamp, Payload_UID, Payload_Type, Doc_URL, File_ID, Status, Retry_Count]
  // NEVER use raw numbers (data[i][3] etc.) anywhere in the codebase.
  STAGING_COL: {
    TIMESTAMP:    0,
    PAYLOAD_UID:  1,
    PAYLOAD_TYPE: 2,
    DOC_URL:      3,
    FILE_ID:      4,
    STATUS:       5,
    RETRY_COUNT:  6,
  },

  // STAGING_PIPELINE status values — use these constants, never raw strings
  STATUS: {
    PENDING_FLOW:  'PENDING_FLOW',   // queued, awaiting Studio inference
    FLOW_COMPLETE: 'FLOW_COMPLETE',  // Studio has written JSON into doc
    NEEDS_CURATOR: 'NEEDS_CURATOR',  // JSON parse failed, will retry
    PROCESSED:     'PROCESSED',      // fully ingested and vector-routed
    FAILED_PARSE:  'FAILED_PARSE',   // exceeded MAX_CURATOR_RETRIES
    ERROR:         'ERROR',          // hard system error
  },

  // Payload type tags written to STAGING_PIPELINE col C
  PAYLOAD_TYPE: {
    SESSION_LOG:   'SESSION_LOG',
    COG_EXHAUST:   'COG_EXHAUST',
    EXTERNAL_DATA: 'EXTERNAL_DATA',
  },

  // Chunking
  MAX_CHUNK_SIZE: 8000,
  DELIMITER:      '[🧠 RTP',

  // Guard text (retained for legacy migration reference only)
  GUARD_TXT: 'PASTE SESSION LOG IN PLACE OF THIS TEXT\n(The system will automatically ingest this document and clear it when finished.)',

  // Vector Router
  VECTOR_THRESHOLD:         0.7,
  DECAY_FACTOR:             0.92,
  INCUBATOR_THRESHOLD:      0.10,
  PROMOTION_MIN_SESSIONS:   3,
  PROMOTION_MIN_AVG_WEIGHT: 0.35,
  MAX_CURATOR_RETRIES:      3,

  // ── BUG FIX #4 ────────────────────────────────────────────
  // This is a seed list only. NEVER push() to this array.
  // At runtime, always call _getKnownVectors() which merges
  // this with PropertiesService-persisted promoted vectors.
  KNOWN_VECTORS_SEED: [
    'ARCHITECTURE', 'UI', 'SECURITY',
    'PEDAGOGY', 'GAS_DEVELOPMENT', 'RELATIONAL',
  ],

  // Personas to copy from Drive on Deploy
  PERSONAS: [
    'PERSONA_ARCHITECT', 'PERSONA_AUDITOR', 'PERSONA_MUSE',
    'PERSONA_DEVELOPER', 'PERSONA_ALIGNER', 'PERSONA_CURATOR', 'PERSONA_ALIGNMENT',
  ],

  // Vector primer docs to scaffold on Deploy
  VECTORS_TO_CREATE: [
    'VECTOR_ARCHITECTURE', 'VECTOR_PEDAGOGY', 'VECTOR_SECURITY', 'VECTOR_UI',
  ],

  // Calibration keys — values live in PropertiesService, never hardcoded
  CALIBRATION_KEYS: [
    'THEME_ARCHITECTURE', 'THEME_PEDAGOGY', 'THEME_FAMILY_ALIGNMENT',
    'SOCRATIC_THRESHOLD', 'IDENTITY_KEY_SALT',
  ],

  // Onboarding
  ONBOARDING_DAYS:          21,
  TOTAL_ONBOARDING_STEPS:   8,

  // PropertiesService keys
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
    PROMOTED_VECTORS:   'KOS_PROMOTED_VECTORS',  // BUG FIX #4: persists promoted list
  },
};


// ── PART 2: DEPLOY ───────────────────────────────────────────
/**
 * Headless deploy. Run from the Apps Script editor (⌘+R).
 * All output goes to View → Executions log.
 * Safe to re-run (idempotent).
 */
function deployFullSystem() {
  const log = [];
  const stamp = s => { log.push(s); console.log(s); };
  try {
    stamp(`[KOS v${CFG.SYSTEM_VERSION}] Deploy started — ${new Date().toLocaleString()}`);

    stamp('▸ Building folder tree...');
    const folders = _buildFolderTree();
    stamp('  ✔ Folder tree ready');

    stamp('▸ Creating BRAIN_TRUST_INDEX...');
    const ss = _getOrCreateSpreadsheet(CFG.INDEX_NAME, folders.root);
    const sheetNames = [
      CFG.STAGING_SHEET, CFG.EXECUTION_LEDGER_SHEET, CFG.MATRIX_LEDGER_SHEET,
      CFG.DYNAMIC_STATE_MATRIX, CFG.BLACKBOARD_SHEET, CFG.ACTION_REGISTER_SHEET,
      CFG.SESSION_LOG_SHEET, CFG.COG_REGISTRY_SHEET, CFG.VECTOR_MATRIX_SHEET,
      CFG.INCUBATOR_SHEET, CFG.ONBOARDING_SHEET, CFG.ERROR_LOG_SHEET,
      CFG.TELEMETRY_SHEET,
    ];
    sheetNames.forEach(n => _getOrCreateSheet(ss, n));
    _seedBlackboardTemplateRow(ss);
    PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
    stamp('  ✔ All 13 pipeline sheets ready');

    stamp('▸ Scaffolding foundation documents...');
    _createAllFoundationDocs(folders);
    stamp('  ✔ Foundation docs ready');

    stamp('▸ Copying persona documents (highest version)...');
    _copyPersonas(folders.f02).forEach(l => stamp(l));

    stamp('▸ Scaffolding vector primer documents...');
    CFG.VECTORS_TO_CREATE.forEach(v => _scaffoldVectorDoc(v, folders.f05));
    stamp('  ✔ Vector primers ready');

    stamp('▸ Registering properties...');
    _registerAllProperties(folders, ss);
    _registerDocPointers(folders);
    stamp('  ✔ Properties registered');

    stamp('▸ Generating Identity Key...');
    generateIdentityKey();
    const cs = _getCalibrationStatus();
    stamp(cs.armed
      ? `  ✔ Engine ARMED — ${cs.count} calibration key(s) present`
      : '  ⚠ Engine COLD — run setupSocraticProperties() to arm');

    stamp('');
    stamp('═══════════════════════════════════');
    stamp('✔ Deploy complete.');
    stamp('NEXT: Run setupAllTriggers() to activate all sensors.');
    stamp('NEXT: Run setupSocraticProperties() to arm the engine.');
    stamp('═══════════════════════════════════');

    return { status: 'SUCCESS', log };
  } catch (e) {
    stamp(`[ERROR] deployFullSystem: ${e.message}`);
    _reportError('deployFullSystem', e);
    return { status: 'ERROR', message: e.message, log };
  }
}


// ── PART 3: FOLDER TREE ──────────────────────────────────────
function _buildFolderTree() {
  const root    = _getOrCreateFolder(CFG.SYSTEM_NAME);

  // 01 — Canonical Foundation
  const f01     = _getOrCreateFolder('01_Canonical_Foundation',  root);
  const f01_1   = _getOrCreateFolder('01.1_SCRIPTS',             f01);
  const f01_2   = _getOrCreateFolder('01.2_SOP_AND_FLOWS',       f01);
  const f01_3   = _getOrCreateFolder('01.3_SMP_PROPOSALS',       f01);
  // NEW v8.0: inbound session docs land here; Sensor 1 scans it
  const f01_in  = _getOrCreateFolder('01_INBOUND_SESSIONS',      f01);

  // 02 — Council Alignments (persona docs)
  const f02     = _getOrCreateFolder('02_Council_Alignments',    root);

  // 03 — Dynamic State
  const f03     = _getOrCreateFolder('03_Dynamic_State',         root);
  const f03_1   = _getOrCreateFolder('03.1_CURRENT_STATE',       f03);
  const f03_2   = _getOrCreateFolder('03.2_PIVOTS_AND_LESSONS',  f03);
  const f03_3   = _getOrCreateFolder('03.3_PROCESSED_EXHAUST',   f03);
  const f03_raw = _getOrCreateFolder('03.4_RAW_EXHAUST',         f03);

  // 04 — Council Logs (cog silos)
  const f04     = _getOrCreateFolder('04_Council_Logs',          root);
  const f04_1   = _getOrCreateFolder('04.1_ARCHITECT_SILO',      f04);
  const f04_2   = _getOrCreateFolder('04.2_AUDITOR_SILO',        f04);
  const f04_3   = _getOrCreateFolder('04.3_MUSE_SILO',           f04);
  const f04_4   = _getOrCreateFolder('04.4_DEVELOPER_SILO',      f04);
  const f04_5   = _getOrCreateFolder('04.5_ALIGNER_SILO',        f04);
  const f04_6   = _getOrCreateFolder('04.6_CURATOR_SILO',        f04);
  const f04_7   = _getOrCreateFolder('04.7_RTP_SILO',            f04);
  const f04_8   = _getOrCreateFolder('04.8_COG_GRAVEYARD',       f04);

  // 05 — Vector Repository
  const f05     = _getOrCreateFolder('05_Vector_Repository',     root);

  // 06 — Classroom Assets
  const f06     = _getOrCreateFolder('06_CLASSROOM_ASSETS',      root);
  const f06_1   = _getOrCreateFolder('06.1_LESSON_PLANS',        f06);
  const f06_2   = _getOrCreateFolder('06.2_STUDENT_FACING',      f06);
  const f06_3   = _getOrCreateFolder('06.3_ASSESSMENTS',         f06);
  const f06_4   = _getOrCreateFolder('06.4_COMMUNICATIONS',      f06);

  // 07–08 — Memory & Autopsies
  const f07     = _getOrCreateFolder('07_Memory_Vault',          root);
  const f08     = _getOrCreateFolder('08_Project_Autopsies',     root);

  // CCPS
  const ccps    = _getOrCreateFolder('CCPS_MASTER_TEMPLATES',    root);
  _getOrCreateFolder('01_Pending_Tagging', ccps);

  return {
    root, f01, f01_1, f01_2, f01_3, f01_in, f02,
    f03, f03_1, f03_2, f03_3, f03_raw,
    f04, f04_1, f04_2, f04_3, f04_4, f04_5, f04_6, f04_7, f04_8,
    f05, f06, f06_1, f06_2, f06_3, f06_4, f07, f08, ccps,
  };
}


// ── PART 4: PROPERTY REGISTRATION ───────────────────────────
function _registerAllProperties(folders, ss) {
  const props = PropertiesService.getScriptProperties();
  const map = {
    'ID_01_1_SCRIPTS':          folders.f01_1,
    'ID_01_2_SOP_AND_FLOWS':    folders.f01_2,
    'ID_01_3_SMP_PROPOSALS':    folders.f01_3,
    'ID_01_INBOUND_SESSIONS':   folders.f01_in,  // NEW v8.0
    'ID_02_COUNCIL_ALIGNMENTS': folders.f02,
    'ID_03_DYNAMIC_STATE':      folders.f03,
    'ID_03_1_CURRENT_STATE':    folders.f03_1,
    'ID_03_2_PIVOTS':           folders.f03_2,
    'ID_03_3_PROCESSED':        folders.f03_3,
    'ID_00_RAW_EXHAUST':        folders.f03_raw,
    'FOLDER_ID':                folders.f03_raw,  // alias used by sensor1
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
  Object.entries(map).forEach(([k, f]) => { if (f) props.setProperty(k, f.getId()); });
  if (ss) props.setProperty('INDEX_ID', ss.getId());
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
  const indexId = props.getProperty('INDEX_ID');
  if (indexId) props.setProperty('ID_BRAIN_TRUST_INDEX', indexId);
}


// ── PART 5: TRIGGER SETUP ────────────────────────────────────
/**
 * Installs all 4 background triggers. Idempotent — clears existing
 * handlers before reinstalling. Run once after deployFullSystem().
 *
 * Installed triggers:
 *   sensor1_scanInboundSessions  — time-driven, every 15 min
 *   processInferenceQueue        — time-driven, every 15 min
 *   sendDailyErrorReport         — time-driven, daily at 6am
 *   sensor3_externalTelemetry    — onChange on BRAIN_TRUST_INDEX
 */
function setupAllTriggers() {
  const log = [];
  const handlersToClear = [
    'sensor1_scanInboundSessions',
    'processInferenceQueue',
    'sendDailyErrorReport',
    'sensor3_externalTelemetry',
  ];

  ScriptApp.getProjectTriggers()
    .filter(t => handlersToClear.includes(t.getHandlerFunction()))
    .forEach(t => { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('sensor1_scanInboundSessions')
    .timeBased().everyMinutes(15).create();
  log.push('  ✔ Sensor 1 — time-driven, 15 min interval');

  ScriptApp.newTrigger('processInferenceQueue')
    .timeBased().everyMinutes(15).create();
  log.push('  ✔ Queue Processor — time-driven, 15 min interval');

  ScriptApp.newTrigger('sendDailyErrorReport')
    .timeBased().atHour(6).everyDays(1).create();
  log.push('  ✔ Daily Error Report — 6am daily');

  // onChange watches the full BRAIN_TRUST_INDEX spreadsheet;
  // sensor3_externalTelemetry filters to CFG.TELEMETRY_SHEET internally
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  ScriptApp.newTrigger('sensor3_externalTelemetry')
    .forSpreadsheet(ss).onChange().create();
  log.push('  ✔ Sensor 3 — onChange on BRAIN_TRUST_INDEX');

  log.forEach(l => console.log(l));
  console.log('All triggers installed.');
  return log;
}


// ── PART 6: FOUNDATION DOC SCAFFOLDING ──────────────────────
function _createAllFoundationDocs(folders) {
  _scaffoldDoc('CORE_THESIS', folders.f01, [
    { h1: 'CORE THESIS' },
    { h2: 'System Identity' },   { p: 'Define what this system is and why it exists.' },
    { h2: 'Primary Objectives' },{ p: 'List the 3–5 outcomes this system produces.' },
    { h2: 'Foundational Principles' }, { p: 'What rules govern how the system operates? These should be immutable.' },
    { h2: 'Success Metrics' },   { p: 'How will you know the system is working?' },
  ]);

  _scaffoldDoc('CURRENT_STATE', folders.f03_1, [
    { h1: 'CURRENT STATE' },
    { h2: 'Last Updated' },  { p: '[Update each session]' },
    { h2: 'System Health' }, { p: '🟢 GREEN — Nominal\n🟡 YELLOW — Issues\n🔴 RED — Critical' },
    { h2: 'Active Projects' },{ p: '[List current projects and status]' },
    { h2: 'Open Loops' },    { p: '[What is unresolved or waiting?]' },
    { h2: 'Next Actions' },  { p: '[What happens next? Who owns it? By when?]' },
  ]);

  _scaffoldDoc('PIVOTS_AND_LESSONS_V1.0', folders.f03_2, [
    { h1: 'PIVOTS AND LESSONS' },
    { h2: 'Entry Format' }, { p: '[DATE]  |  [LESSON TITLE]  |  [WHAT CHANGED]  |  [ACTION TAKEN]' },
    { h2: 'Active Pivots' },{ p: 'PIVOT 008 | THE_CALIBRATION_WALL | All "Soul" data in PropertiesService.\nPIVOT 009 | HEADLESS_STUDIO | Drop Zone retired. Ingestion via web app.' },
    { h2: 'Archived Pivots' }, { p: 'PIVOT 001–008 — See system documentation.' },
  ]);

  _scaffoldDoc('SYSTEM_TELEMETRY', folders.f03, [
    { h1: 'SYSTEM TELEMETRY' },
    { h2: 'Deployment Date' },  { p: new Date().toLocaleDateString() },
    { h2: 'Version' },          { p: `KOS v${CFG.SYSTEM_VERSION} — Headless Studio Edition` },
    { h2: 'Engine Status' },    { p: 'COLD — Run setupSocraticProperties() to arm.' },
    { h2: 'Active Personas' },  { p: '7 (ARCHITECT, AUDITOR, MUSE, DEVELOPER, ALIGNER, CURATOR, ALIGNMENT)' },
    { h2: 'Architecture' },     { p: 'Headless Pub/Sub. Three sensors → STAGING_PIPELINE → Queue Processor → Vector Router.' },
  ]);
}

function _scaffoldDoc(name, folder, sections) {
  if (folder.getFilesByName(name).hasNext()) return;
  const doc  = DocumentApp.create(name);
  const body = doc.getBody();
  sections.forEach(s => {
    if      (s.h1) body.appendParagraph(s.h1).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    else if (s.h2) body.appendParagraph(s.h2).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    else if (s.h3) body.appendParagraph(s.h3).setHeading(DocumentApp.ParagraphHeading.HEADING3);
    else if (s.p)  body.appendParagraph(String(s.p));
    else if (s.hr) body.appendHorizontalRule();
  });
  // BUG FIX #3 pattern: always use _saveAndMove()
  _saveAndMove(doc, folder);
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
    { h2: `Domain: ${domain}` },
    { h2: 'Core Principles' },    { p: '[What foundational beliefs govern this domain?]' },
    { h2: 'Key Decisions Log' },  { p: '[DATE]  |  [DECISION]  |  [RATIONALE]' },
    { h2: 'Active Constraints' }, { p: '[What limits or guardrails currently apply?]' },
    { h2: 'Evolution Log' },      { p: '[What changed? What was deprecated and why?]' },
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
      // BUG FIX #3 pattern
      _saveAndMove(newDoc, f02);
      log.push(`  ✔ ${sourceName}: Copied`);
    } catch (e) {
      log.push(`  ❌ ${baseName}: ${e.message}`);
    }
  });
  return log;
}

function _findHighestVersionDoc(baseName) {
  const it = DriveApp.searchFiles(
    `title contains "${baseName}" and mimeType = "${MimeType.GOOGLE_DOCS}" and trashed = false`
  );
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

function _seedBlackboardTemplateRow(ss) {
  const sheet = _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
  if (sheet.getLastRow() > 1) return;
  sheet.appendRow([
    '[PASTE_TARGET_DOC_ID]', 'CE-STATE', 'CURRENT_STATE', 'v1.0',
    '[AWAITING_GENESIS_PROTOCOL...]', 'SYSTEM ONLINE — Session 001',
    '', 'Example row — delete before use', 'ARCHITECT', new Date(), 'EXAMPLE', false,
  ]);
  sheet.getRange(2, 1, 1, 12).setBackground('#FFF9C4').setFontStyle('italic');
}


// ── PART 7: SCHEMA HELPERS ───────────────────────────────────
/**
 * Returns or creates a sheet with the correct v8.0 headers.
 * All column definitions are authoritative here.
 */
function _getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);

  const H = {
    // BUG FIX #2: updated 7-column schema
    [CFG.STAGING_SHEET]: [
      'Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count',
    ],
    [CFG.EXECUTION_LEDGER_SHEET]: [
      'UID', 'Timestamp', 'Semantic_Tag', 'File_URL', 'Status', 'Attempt_Tracker',
    ],
    [CFG.MATRIX_LEDGER_SHEET]: [
      'Session_UID', 'Timestamp', 'ARCHITECTURE', 'UI', 'SECURITY', 'PEDAGOGY', 'Total',
    ],
    [CFG.DYNAMIC_STATE_MATRIX]: [
      'Session_UID', 'Timestamp', 'Theme', 'Raw_Score', 'Decayed_Score', 'Session_Count', 'Promoted',
    ],
    [CFG.BLACKBOARD_SHEET]: [
      'Target_Doc_ID', 'CE_Tag', 'Doc_Title', 'Version', 'Find_String',
      'Replace_Payload', 'Alt_Doc_ID', 'Notes', 'Filed_By', 'Filed_Date', 'Status', 'Deploy_Trigger',
    ],
    [CFG.ACTION_REGISTER_SHEET]: [
      'Session_UID', 'Timestamp', 'Type', 'Item', 'Owner', 'Protected_Time_Risk', 'Status',
    ],
    [CFG.SESSION_LOG_SHEET]: [
      'Session_UID', 'Timestamp', 'Session_Type', 'Cold_Start', 'RTP_Version', 'Session_Summary',
    ],
    [CFG.COG_REGISTRY_SHEET]: [
      'Session_UID', 'Timestamp', 'Cog', 'Final_Status', 'Summary',
    ],
    [CFG.VECTOR_MATRIX_SHEET]: [
      'Session_UID', 'Timestamp',
      ...CFG.KNOWN_VECTORS_SEED,
      'Incubator_Signals',
    ],
    [CFG.INCUBATOR_SHEET]: [
      'Theme', 'First_Seen', 'Last_Seen', 'Session_Count', 'Avg_Weight', 'Status',
    ],
    [CFG.ONBOARDING_SHEET]: [
      'Day', 'Date', 'Event', 'Note', 'Vision_90_Day',
    ],
    [CFG.ERROR_LOG_SHEET]: [
      'Timestamp', 'Context', 'Error', 'Stack', 'Emailed',
    ],
    [CFG.TELEMETRY_SHEET]: [
      'Timestamp', 'Source', 'Category', 'Content', 'Status',
    ],
  };

  const headers = H[name] || ['Timestamp', 'Data'];
  sheet.appendRow(headers);
  sheet.getRange('1:1').setFontWeight('bold').setBackground('#e2e8f0');
  sheet.setFrozenRows(1);
  return sheet;
}

function _getOrCreateSpreadsheet(name, parentFolder) {
  const files = parentFolder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(f.getId());
    }
  }
  const ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
  return ss;
}

function _getOrCreateFolder(name, parent) {
  const p  = parent || DriveApp.getRootFolder();
  const it = p.getFoldersByName(name);
  return it.hasNext() ? it.next() : p.createFolder(name);
}

function _findFolder(name, parent) {
  if (!parent) return null;
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function _getOrCreateDoc(docName, folder) {
  const it = folder.getFilesByName(docName);
  if (it.hasNext()) return DocumentApp.openById(it.next().getId());
  const doc = DocumentApp.create(docName);
  const id  = _saveAndMove(doc, folder);
  return DocumentApp.openById(id);
}

function _getSystemAsset(name, propKey, isFolder) {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty(propKey);
  if (id) {
    try {
      return isFolder ? DriveApp.getFolderById(id) : SpreadsheetApp.openById(id);
    } catch (_) { /* stale pointer — fall through to re-search */ }
  }
  const it = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
  if (!it.hasNext()) throw new Error(`Asset not found: "${name}". Run deployFullSystem() first.`);
  const asset = it.next();
  props.setProperty(propKey, asset.getId());
  return isFolder ? asset : SpreadsheetApp.openById(asset.getId());
}

/**
 * BUG FIX #3 — Canonical save-and-move helper.
 * Captures the file ID BEFORE saveAndClose() since calling getid()
 * after close on a newly-created doc can cause race conditions.
 * Returns the file ID so callers can re-open by ID if needed.
 *
 * Usage: const fileId = _saveAndMove(doc, folder);
 */
function _saveAndMove(doc, folder) {
  const fileId = doc.getId();   // capture ID before close
  doc.saveAndClose();
  DriveApp.getFileById(fileId).moveTo(folder);
  return fileId;
}


// ── PART 8: BUG FIX #4 — KNOWN VECTORS ─────────────────────
/**
 * Returns the live known-vector list by merging the immutable seed
 * array with any themes that have been promoted from INCUBATOR and
 * persisted to PropertiesService. Call this instead of CFG.KNOWN_VECTORS_SEED
 * anywhere you need the full current set.
 */
function _getKnownVectors() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(CFG.PROP.PROMOTED_VECTORS);
  const promoted = raw ? JSON.parse(raw) : [];
  const combined = [...CFG.KNOWN_VECTORS_SEED];
  promoted.forEach(v => { if (!combined.includes(v)) combined.push(v); });
  return combined;
}

/**
 * Persists a newly-promoted vector theme.
 * Called by _checkPromotionCandidates() in 4_Vector_Router.gs
 * instead of the old CFG.KNOWN_VECTORS.push() pattern.
 */
function _persistPromotedVector(theme) {
  const props   = PropertiesService.getScriptProperties();
  const raw     = props.getProperty(CFG.PROP.PROMOTED_VECTORS);
  const current = raw ? JSON.parse(raw) : [];
  if (!current.includes(theme)) {
    current.push(theme);
    props.setProperty(CFG.PROP.PROMOTED_VECTORS, JSON.stringify(current));
  }
}


// ── PART 9: SCHEMA MIGRATION ─────────────────────────────────
/**
 * One-time migration from v5.4 → v8.0 STAGING_PIPELINE schema.
 *
 * Old schema (5 cols): [Timestamp, Chunk_UID, Doc_URL, File_ID, Status]
 * New schema (7 cols): [Timestamp, Payload_UID, Payload_Type, Doc_URL, File_ID, Status, Retry_Count]
 *
 * Also remaps status strings:
 *   PENDING_INFERENCE → PENDING_FLOW
 *   INTAKE_PROCESSED  → PROCESSED
 *   All others        → preserved as-is
 *
 * Safe to run multiple times — checks column count before acting.
 */
function migrateExistingStagingRows() {
  const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = ss.getSheetByName(CFG.STAGING_SHEET);
  if (!staging) {
    console.log('STAGING_PIPELINE not found — nothing to migrate.');
    return;
  }

  const lastCol = staging.getLastColumn();
  const lastRow = staging.getLastRow();

  if (lastCol === 7) {
    console.log('STAGING_PIPELINE already at v8.0 schema (7 cols). No migration needed.');
    return;
  }
  if (lastCol !== 5) {
    console.warn(`Unexpected column count: ${lastCol}. Manual inspection required before migrating.`);
    return;
  }

  const NEW_HEADERS = [
    'Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count',
  ];

  if (lastRow <= 1) {
    staging.getRange(1, 1, 1, 7).setValues([NEW_HEADERS]);
    staging.getRange('1:1').setFontWeight('bold').setBackground('#e2e8f0');
    console.log('Empty STAGING_PIPELINE headers updated to v8.0 schema.');
    return;
  }

  const STATUS_MAP = {
    'PENDING_INFERENCE': CFG.STATUS.PENDING_FLOW,
    'INTAKE_PROCESSED':  CFG.STATUS.PROCESSED,
  };

  const rows    = staging.getRange(2, 1, lastRow - 1, 5).getValues();
  const newData = rows.map(([ts, uid, url, fileId, status]) => [
    ts,
    uid,
    CFG.PAYLOAD_TYPE.SESSION_LOG,   // legacy rows were all session logs
    url,
    fileId,
    STATUS_MAP[status] || status,
    0,                              // Retry_Count default
  ]);

  staging.clearContents();
  staging.getRange(1, 1, 1, 7).setValues([NEW_HEADERS]);
  staging.getRange(2, 1, newData.length, 7).setValues(newData);
  staging.getRange('1:1').setFontWeight('bold').setBackground('#e2e8f0');
  staging.setFrozenRows(1);
  SpreadsheetApp.flush();

  console.log(`Migration complete: ${newData.length} row(s) updated to v8.0 schema.`);
}


// ── PART 10: ADMIN ───────────────────────────────────────────
/**
 * Clears routing pointer cache while preserving calibration keys,
 * onboarding state, and the promoted-vector list.
 * Use when folders are manually moved or renamed.
 */
function resetProperties() {
  const props = PropertiesService.getScriptProperties();
  const keep  = {};
  [
    ...CFG.CALIBRATION_KEYS,
    'IDENTITY_KEY',
    ...Object.values(CFG.PROP),
    'KOS_OPERATOR_ROLE', 'KOS_OPERATOR_AUDIENCE', 'KOS_ADMIN_GHOST',
    'KOS_NECESSARY_STRUGGLE', 'KOS_RELATIONAL_TARGETS', 'KOS_VISION_90_DAY',
  ].forEach(k => {
    const v = props.getProperty(k);
    if (v) keep[k] = v;
  });
  props.deleteAllProperties();
  if (Object.keys(keep).length > 0) props.setProperties(keep);
  console.log('Routing cache cleared. Calibration, onboarding, and promoted-vector state preserved.');
}
