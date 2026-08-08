/**
 * ============================================================================
 * KNOWLEDGE OPERATING SYSTEM (KOS) — MASTER SCRIPT v6.0
 * ============================================================================
 * Conforms to:
 *   SMP-001  — Matrix Compiler & Vector Promotion Engine
 *   PIVOT 002 — Bifurcated Architecture (GAS = Math, Flow = Synthesis)
 *   PIVOT 003 — Idempotent Operations (_getOrCreate everywhere)
 *   PIVOT 004 — Pointer-Driven Execution (no hardcoded IDs)
 *   PIVOT 008 — Variable Sequestration (IP in PropertiesService)
 *
 * MIGRATION NOTE:
 *   Functions marked [PRE-SMP] use the pre-SMP-001 binary vector threshold.
 *   They will be superseded by Vector_Router.gs once that script is deployed.
 *   Do not extend [PRE-SMP] functions — extend Vector_Router.gs instead.
 *
 * PASTE ORDER: This is Part A of 2. Paste Part A first, then Part B.
 * ============================================================================
 */


// ============================================================================
// SECTION 1: GLOBAL CONFIGURATION (CFG)
// Single source of truth for all system constants.
// Change a name here — it propagates everywhere. Never hardcode these below.
// ============================================================================

const CFG = {
  // ── Drive folder names ───────────────────────────────────────────────────
  SYSTEM_NAME       : "Active_Brain_Trust_System",
  STAGING_FOLDER    : "03.4_RAW_EXHAUST",
  GRAVE_FOLDER      : "CE-GRAVE",

  // ── Document and spreadsheet names ───────────────────────────────────────
  DROP_ZONE_TITLE   : "DROP_ZONE",
  INDEX_NAME        : "BRAIN_TRUST_INDEX",

  // ── Sheet tab names ───────────────────────────────────────────────────────
  STAGING_SHEET     : "STAGING_PIPELINE",
  MATRIX_SHEET      : "MATRIX_LEDGER",
  BUFFER_SHEET      : "Inference_Buffer",
  BLACKBOARD_SHEET  : "Blackboard",
  LEDGER_SHEET      : "EXECUTION_LEDGER",

  // ── Intake pipeline ───────────────────────────────────────────────────────
  DROP_ZONE_SENTINEL: "▼ NEXT SESSION LOG GOES BELOW ▼",

  // ── Sweeper: server-side Drive search query (offloads filter to Google) ──
  SWEEPER_QUERY     : "title contains 'CE-' and not title contains '[UID_DOC_'",

  // ── Calibration keys expected in PropertiesService ───────────────────────
  CALIBRATION_KEYS  : [
    'SESSION_VECTOR_PRIMER',
    'RTP_IDENTITY_HASH',
    'ALIGNMENT_TOLERANCE'
  ],

  // ── CE-tag → PropertiesService folder key mapping (canonical taxonomy) ───
  TAG_TO_PROP_KEY   : {
    "CE-CODE:"    : "ID_FOLDER_CODE",
    "CE-FLOW:"    : "ID_FOLDER_FLOW",
    "CE-SMP:"     : "ID_FOLDER_SMP",
    "CE-VECTOR:"  : "ID_FOLDER_VECTOR",
    "CE-PRD:"     : "ID_FOLDER_PRDS",
    "CE-LESSON:"  : "ID_FOLDER_LESSON",
    "CE-RUBRIC:"  : "ID_FOLDER_RUBRIC",
    "CE-COMM:"    : "ID_FOLDER_COMM",
    "CE-STATE:"   : "ID_FOLDER_STATE",
    "CE-GRAVE:"   : "ID_FOLDER_GRAVE",
    "CE-TEMPLATE:": "ID_FOLDER_ROOT",
    "CE-LOG:"     : "ID_00_RAW_EXHAUST",
    "KOS:"        : "ID_00_RAW_EXHAUST",
    "CE:"         : "ID_00_RAW_EXHAUST"
  }
};


// ============================================================================
// SECTION 2: UI ENTRY POINTS
// onOpen() builds the custom menu. masterRefineryProcess() is the primary
// user-facing intake action. Both are headless-safe.
// ============================================================================

/**
 * Builds the '🚀 KOS Council' menu in the Drop Zone Doc.
 * Fails silently in headless/trigger contexts — intentional.
 */
function onOpen() {
  try {
    if (DocumentApp.getActiveDocument()) {
      DocumentApp.getUi()
        .createMenu('🚀 KOS Council')
        .addItem('Deploy System / Recalibrate Pointers', 'deployFullSystem')
        .addSeparator()
        .addItem('Master Intake Pipeline (Single Click)', 'masterRefineryProcess')
        .addToUi();
    }
  } catch (e) {
    console.log("[onOpen] Headless context — menu skipped.");
  }
}

/**
 * Drop Zone intake pipeline. User pastes a raw session log into the
 * Drop Zone Google Doc, then triggers this from the KOS Council menu.
 *
 * Pipeline:
 *   1. Read and validate Drop Zone body
 *   2. Generate temporal UID
 *   3. Create quarantined exhaust doc — saveAndClose() before moveTo()
 *      (CRITICAL: releases file lock before Drive move API call)
 *   4. Move to staging folder
 *   5. Log Smart Chip entry to STAGING_PIPELINE sheet
 *   6. Clear Drop Zone — print receipt with UID and clickable link
 */
function masterRefineryProcess() {
  let ui  = null;
  let doc = null;

  try {
    doc = DocumentApp.getActiveDocument();
    if (doc) ui = DocumentApp.getUi();
  } catch (e) {
    console.error("[masterRefineryProcess] Headless context — no active document.");
    return;
  }

  if (!doc) return;

  const body = doc.getBody();
  const text = body.getText().trim();

  if (!text || (text.includes(CFG.DROP_ZONE_SENTINEL) && text.length < 100)) {
    if (ui) ui.alert('System Halt', 'No valid session log detected in the Drop Zone.', ui.ButtonSet.OK);
    return;
  }

  if (ui) ui.toast('Initiating Unified Intake...', 'Refinery', 3);

  const props           = PropertiesService.getScriptProperties();
  const stagingFolderId = props.getProperty('ID_FOLDER_STAGING');
  const indexId         = props.getProperty('ID_BRAIN_TRUST_INDEX');

  if (!stagingFolderId || !indexId) {
    if (ui) ui.alert('System Error', 'System not calibrated. Run "Deploy System" first.', ui.ButtonSet.OK);
    return;
  }

  const stagingFolder = DriveApp.getFolderById(stagingFolderId);
  const logUUID       = "[UID_LOG_" + new Date().getTime() + "]";
  const fileName      = `${logUUID} RAW_EXHAUST`;

  // Create quarantined doc — write content and release lock BEFORE moving
  const newDoc   = DocumentApp.create(fileName);
  const newDocId = newDoc.getId();
  newDoc.getBody().setText(text);
  newDoc.saveAndClose(); // File lock released here — safe to move now

  const newDocFile = DriveApp.getFileById(newDocId);
  newDocFile.moveTo(stagingFolder);

  // Log to STAGING_PIPELINE with Smart Chip clickable link
  const indexSS    = SpreadsheetApp.openById(indexId);
  let stagingSheet = indexSS.getSheetByName(CFG.STAGING_SHEET);

  if (!stagingSheet) {
    stagingSheet = indexSS.insertSheet(CFG.STAGING_SHEET);
    stagingSheet.appendRow(['Timestamp', 'LOG_UUID', 'Raw_Pointer', 'Status']);
    stagingSheet.getRange('1:1').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    stagingSheet.setFrozenRows(1);
  }

  const fileUrl = _getSafeFileUrl(newDocFile, newDocId);
  _writeSmartChip(stagingSheet, stagingSheet.getLastRow() + 1, 3, fileName, fileUrl);
  stagingSheet.getRange(stagingSheet.getLastRow(), 1, 1, 4)
    .setValues([[new Date(), logUUID, "", "QUARANTINED"]]);
  stagingSheet.getRange(stagingSheet.getLastRow(), 3).setRichTextValue(
    SpreadsheetApp.newRichTextValue().setText(fileName).setLinkUrl(fileUrl).build()
  );

  // Clear Drop Zone and print receipt
  body.clear();
  const header = body.appendParagraph('LOG UID: ' + logUUID);
  header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  header.setForegroundColor('#008000');
  header.setBold(true);
  body.appendParagraph('Doc ID: ' + newDocId);
  body.appendParagraph('Generated File: 🔗 ' + fileName).setLinkUrl(fileUrl);
  body.appendParagraph('Inference Pointer: ' + logUUID);
  body.appendHorizontalRule();
  const sentinel = body.appendParagraph(CFG.DROP_ZONE_SENTINEL);
  sentinel.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  sentinel.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  sentinel.setForegroundColor('#808080');
  body.appendParagraph('');

  if (ui) ui.alert('🚀 REFINERY COMPLETE\n\nLog ingested and quarantined.\nUID: ' + logUUID);
  console.log(`[masterRefineryProcess] Quarantined: ${fileName}`);
}


// ============================================================================
// SECTION 3: DEPLOYMENT ENGINE (v6.0)
// Full system initialization — idempotent, headless-safe.
// Creates complete Drive topology, registers all document and folder IDs,
// initializes all sheet tabs, and wires all triggers in one execution.
// ============================================================================

/**
 * Primary deployment function. Run once on fresh installation.
 * Safe to re-run at any time — all operations use _getOrCreate pattern.
 *
 * Phases:
 *   1 — Anchor       (register spreadsheet ID, rename)
 *   2 — Topology     (all folders, including RAW_EXHAUST, SMP, CE-GRAVE)
 *   3 — Core Docs    (create + register document IDs to PropertiesService)
 *   4 — Personas     (seed Council Alignment stubs)
 *   5 — Sheet Tabs   (MATRIX_LEDGER, Inference_Buffer, Blackboard, EXECUTION_LEDGER)
 *   6 — Routing      (write all folder IDs to PropertiesService)
 *   7 — Triggers     (wire all time-driven triggers programmatically)
 *   8 — Handoff
 */
function deployFullSystem() {
  const props = PropertiesService.getScriptProperties();

  // Headless UI protection — safe to call from any context
  let ss  = null;
  let ui  = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    ui = ss ? ss : null;
  } catch (e) { /* headless — no spreadsheet context */ }

  function toast(msg, title, dur) {
    if (ss) { try { ss.toast(msg, title, dur); } catch(e) {} }
    console.log(`[${title}] ${msg}`);
  }

  // ── PHASE 1: ANCHOR ──────────────────────────────────────────────────────
  toast('Initializing system architecture...', '🚀 Phase 1: Boot', 5);
  if (ss) {
    ss.rename(CFG.INDEX_NAME);
    props.setProperty("ID_BRAIN_TRUST_INDEX", ss.getId());
    SpreadsheetApp.flush();
  }

  // ── PHASE 2: TOPOLOGY ────────────────────────────────────────────────────
  toast('Building Drive topology...', '📁 Phase 2: Topology', 10);

  const rootFolder = _getOrCreateFolder(CFG.SYSTEM_NAME);
  if (ss) DriveApp.getFileById(ss.getId()).moveTo(rootFolder);

  const folders = {
    FOUNDATION    : _getOrCreateFolder("01_Canonical_Foundation",   rootFolder),
    ALIGNMENTS    : _getOrCreateFolder("02_Council_Alignments",     rootFolder),
    DYNAMIC_STATE : _getOrCreateFolder("03_Dynamic_State",          rootFolder),
    SMP           : _getOrCreateFolder("00_SMP_PROPOSALS",          rootFolder),
    RAW_EXHAUST   : _getOrCreateFolder("00_RAW_EXHAUST",            rootFolder),
    STAGING       : _getOrCreateFolder(CFG.STAGING_FOLDER,          rootFolder),
    VECTORS       : _getOrCreateFolder("05_Vector_Repository",      rootFolder),
    VAULT         : _getOrCreateFolder("06_Memory_Vault",           rootFolder),
    AUTOPSIES     : _getOrCreateFolder("07_Project_Autopsies",      rootFolder),
    GRAVE         : _getOrCreateFolder(CFG.GRAVE_FOLDER,            rootFolder),
    CODE          : _getOrCreateFolder("Scripts",                   rootFolder),
    COMM          : _getOrCreateFolder("Communications",            rootFolder),
    FLOW          : _getOrCreateFolder("SOPs_and_Workflows",        rootFolder),
    PRDS          : _getOrCreateFolder("Lesson_Plans",              rootFolder),
    LESSON        : _getOrCreateFolder("Student_Facing",            rootFolder),
    RUBRIC        : _getOrCreateFolder("Assessments",               rootFolder)
  };

  if (ss) SpreadsheetApp.flush();

  // ── PHASE 3: CORE DOCUMENTS ───────────────────────────────────────────────
  toast('Deploying core documents...', '📄 Phase 3: Core Docs', 10);

  const coreDoc      = _getOrCreateDoc("CORE_THESIS",        folders.FOUNDATION);
  const stateDoc     = _getOrCreateDoc("CURRENT_STATE",      folders.DYNAMIC_STATE);
  const pivotDoc     = _getOrCreateDoc("PIVOTS_AND_LESSONS", folders.DYNAMIC_STATE);
  const telemetryDoc = _getOrCreateDoc("SYSTEM_TELEMETRY",   folders.DYNAMIC_STATE);

  // Register document IDs immediately (PIVOT 004)
  props.setProperty("ID_CORE_THESIS",        coreDoc.getId());
  props.setProperty("ID_CURRENT_STATE",      stateDoc.getId());
  props.setProperty("ID_PIVOTS_AND_LESSONS", pivotDoc.getId());
  props.setProperty("ID_SYSTEM_TELEMETRY",   telemetryDoc.getId());

  if (coreDoc.getBody().getText().length < 10) {
    coreDoc.getBody().setText(
      "CORE THESIS\n====================\n" +
      "[Awaiting Genesis Protocol — enter your CORE_THESIS here before first session.]"
    );
  }

  if (ss) SpreadsheetApp.flush();

  // ── PHASE 4: COUNCIL PERSONA STUBS ───────────────────────────────────────
  toast('Seeding Council Alignments...', '🧠 Phase 4: Personas', 8);

  [
    { name: "PERSONA_ARCHITECT", role: "Structural integrity, logic, and infrastructure guardian." },
    { name: "PERSONA_AUDITOR",   role: "Conflict detection, historical alignment, and assumption challenging." },
    { name: "PERSONA_MUSE",      role: "Creative expansion, UX innovation, and opportunity identification." },
    { name: "PERSONA_DEVELOPER", role: "Google Apps Script Engineer & Flow Architect." },
    { name: "PERSONA_CURATOR",   role: "Lossless data distillation and strict schema enforcement." },
    { name: "PERSONA_ALIGNMENT", role: "Relational bandwidth protection and human presence guardian." }
  ].forEach(p => {
    const doc = _getOrCreateDoc(p.name, folders.ALIGNMENTS);
    if (doc.getBody().getText().length < 10) {
      doc.getBody().setText(
        `PERSONA: ${p.name.replace('PERSONA_', '')}\n` +
        `================================================\n` +
        `Role: ${p.role}\n\n[Paste full alignment constraints here.]`
      );
    }
  });

  if (ss) SpreadsheetApp.flush();

  // ── PHASE 5: SHEET TAB INITIALIZATION ────────────────────────────────────
  toast('Initializing Index tabs...', '📊 Phase 5: Tabs', 8);

  if (ss) {
    _initTab(ss, CFG.MATRIX_SHEET,
      ["SESSION_UID", "TIMESTAMP", "ARCHITECTURE", "UI", "SECURITY", "PEDAGOGY", "TOTAL"],
      "#1e293b");

    _initTab(ss, CFG.BUFFER_SHEET,
      ["CHUNK_ID", "SESSION_ID", "TIMESTAMP", "Inference_Payload", "Status"],
      "#1e293b");

    _initBlackboard(ss);
    _initTab(ss, CFG.LEDGER_SHEET,
      ["UID", "TIMESTAMP", "SEMANTIC_TAG", "FILE_URL", "STATUS"],
      "#e2e8f0");

    _initTab(ss, CFG.STAGING_SHEET,
      ["Timestamp", "LOG_UUID", "Raw_Pointer", "Status"],
      "#1e293b");

    SpreadsheetApp.flush();
  }

  // ── PHASE 6: ROUTING PROPERTIES ──────────────────────────────────────────
  toast('Mapping folder IDs...', '🔍 Phase 6: Routing', 5);

  props.setProperty("ID_FOLDER_ROOT",       rootFolder.getId());
  props.setProperty("ID_FOLDER_FOUNDATION", folders.FOUNDATION.getId());
  props.setProperty("ID_FOLDER_ALIGNMENTS", folders.ALIGNMENTS.getId());
  props.setProperty("ID_FOLDER_STATE",      folders.DYNAMIC_STATE.getId());
  props.setProperty("ID_FOLDER_SMP",        folders.SMP.getId());
  props.setProperty("ID_00_RAW_EXHAUST",    folders.RAW_EXHAUST.getId());
  props.setProperty("ID_FOLDER_STAGING",    folders.STAGING.getId());
  props.setProperty("ID_FOLDER_VECTOR",     folders.VECTORS.getId());
  props.setProperty("ID_FOLDER_VAULT",      folders.VAULT.getId());
  props.setProperty("ID_FOLDER_AUTOPSIES",  folders.AUTOPSIES.getId());
  props.setProperty("ID_FOLDER_GRAVE",      folders.GRAVE.getId());
  props.setProperty("ID_FOLDER_CODE",       folders.CODE.getId());
  props.setProperty("ID_FOLDER_COMM",       folders.COMM.getId());
  props.setProperty("ID_FOLDER_FLOW",       folders.FLOW.getId());
  props.setProperty("ID_FOLDER_PRDS",       folders.PRDS.getId());
  props.setProperty("ID_FOLDER_LESSON",     folders.LESSON.getId());
  props.setProperty("ID_FOLDER_RUBRIC",     folders.RUBRIC.getId());

  // ── PHASE 7: TRIGGER WIRING ───────────────────────────────────────────────
  toast('Wiring triggers...', '⏱ Phase 7: Triggers', 5);
  initializeTriggers();

  // ── PHASE 8: HANDOFF ──────────────────────────────────────────────────────
  toast('Deployment complete. Open CORE_THESIS to activate the system.', '✅ Phase 8: Online', 10);
  console.log("[DEPLOY_COMPLETE] KOS v6.0 initialized.");
}


// ============================================================================
// SECTION 4: HARDENER UTILITY (PIVOT 008)
// Sequesters private IP into PropertiesService. Run once, then clear values.
// ============================================================================

/**
 * Injects proprietary calibration weights into PropertiesService.
 * ⚠️  CLEAR the values in calibrationMap AFTER first run.
 */
function setupCalibration() {
  const props = PropertiesService.getScriptProperties();
  const calibrationMap = {
    'THEME_ARCHITECTURE'    : '0.85',
    'THEME_PEDAGOGY'        : '0.90',
    'THEME_FAMILY_ALIGNMENT': '1.00',
    'SOCRATIC_THRESHOLD'    : '0.75',
    'ALIGNMENT_TOLERANCE'   : '0.80',
    'IDENTITY_KEY_SALT'     : 'your_private_secret_string_here'
  };
  props.setProperties(calibrationMap);
  console.log("[HARDENING_COMPLETE] Calibration sequestered in PropertiesService.");
}

/**
 * Verifies all CFG.CALIBRATION_KEYS are present in PropertiesService.
 */
function auditCalibrationHealth() {
  const props       = PropertiesService.getScriptProperties();
  const missingKeys = CFG.CALIBRATION_KEYS.filter(k => !props.getProperty(k));

  if (missingKeys.length === 0) {
    console.log(`[CALIBRATION_WALL] ✅ All ${CFG.CALIBRATION_KEYS.length} keys present.`);
  } else {
    console.warn(`[CALIBRATION_WALL] ⚠️ Missing: ${missingKeys.join(', ')}`);
  }
}

/** Wipes all Script Properties. Use for open-source release only. ⚠️ IRREVERSIBLE. */
function nuclearWipeForRelease() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  console.log("[CLEAN_SWEEP] All IP wiped. Ready for open-source release.");
}

/**
 * Fetches a calibration value by key. Always use this — never read props directly.
 * @param {string} key
 * @returns {string|null}
 */
function getKOSCalibration(key) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) console.error(`[CALIBRATION_ERROR] Missing key: ${key}. Engine COLD.`);
  return val || null;
}


// ============================================================================
// SECTION 5: INTAKE PIPELINE — PHASE 1 & 2 (JSON Processor)
// Receives CURATOR JSON, validates, writes volatile state, routes vectors.
// [PRE-SMP] MATRIX_LEDGER write uses static 4-column schema.
// ============================================================================

/**
 * Receives a stringified CURATOR session JSON, validates it, fetches all
 * destination pointers, writes to CURRENT_STATE and PIVOTS_AND_LESSONS,
 * logs to MATRIX_LEDGER, and hands off to the Vector Math Router.
 *
 * @param {string} rawJSONPayload - Stringified CURATOR session JSON.
 * @returns {Object} Status object with routing results or error detail.
 */
function processIntakePayload(rawJSONPayload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    console.error("[Intake] Locked — system busy.");
    return { status: "LOCKED", message: "System busy. Try again." };
  }

  try {
    // Gateway: parse and validate JSON
    let payload;
    try {
      payload = JSON.parse(rawJSONPayload);
    } catch (e) {
      throw new Error("Invalid JSON — Curator payload malformed.");
    }

    // Pointer extraction (PIVOT 004) — all IDs from PropertiesService
    const props          = PropertiesService.getScriptProperties();
    const currentStateId = props.getProperty("ID_CURRENT_STATE");
    const indexSheetId   = props.getProperty("ID_BRAIN_TRUST_INDEX");
    const vectorFolderId = props.getProperty("ID_FOLDER_VECTOR");
    const pivotDocId     = props.getProperty("ID_PIVOTS_AND_LESSONS");

    if (!currentStateId || !indexSheetId || !vectorFolderId || !pivotDocId) {
      throw new Error("Architectural Fault: Core pointers missing. Run deployFullSystem().");
    }

    const timestamp  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const sessionUid = "LOG_" + new Date().getTime();
    const stateDoc   = DocumentApp.openById(currentStateId);
    const pivotDoc   = DocumentApp.openById(pivotDocId);
    const indexSheet = SpreadsheetApp.openById(indexSheetId);

    // Write next_steps to CURRENT_STATE
    const nextSteps = payload.dynamic_state?.next_steps;
    if (nextSteps?.length > 0) {
      const body = stateDoc.getBody();
      body.appendParagraph(`\n[State Sync: ${timestamp} | ${sessionUid}]`)
          .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      body.appendParagraph("NEXT STEPS:").setBold(true);
      nextSteps.forEach(s => body.appendListItem(s));
    }

    // Write pivots_and_lessons to PIVOTS_AND_LESSONS
    const pivots = payload.dynamic_state?.pivots_and_lessons;
    if (pivots?.length > 0) {
      const body = pivotDoc.getBody();
      body.appendParagraph(`\n[Session Logged: ${timestamp} | ${sessionUid}]`)
          .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      pivots.forEach(p => body.appendListItem(p));
    }

    // [PRE-SMP] Write to MATRIX_LEDGER — static 4-vector schema
    // Replace with Vector_Router.gs output once SMP is deployed.
    const ledger = indexSheet.getSheetByName(CFG.MATRIX_SHEET);
    if (ledger) {
      const w    = payload.vector_weights || {};
      const arch = parseFloat(w.ARCHITECTURE) || 0;
      const ui   = parseFloat(w.UI)           || 0;
      const sec  = parseFloat(w.SECURITY)     || 0;
      const ped  = parseFloat(w.PEDAGOGY)     || 0;
      ledger.appendRow([sessionUid, timestamp, arch, ui, sec, ped, arch + ui + sec + ped]);
    }

    console.log(`[Intake] Volatile write complete for ${sessionUid}`);

    const vectorResult = executeVectorRouting(payload, { vectorFolderId, sessionUid, timestamp });
    return { status: "SUCCESS", data: payload, vectorRouting: vectorResult };

  } catch (error) {
    console.error("[Intake] Fault: " + error.message);
    return { status: "ERROR", message: error.message };
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// SECTION 6: VECTOR MATH ROUTER (Phase 3) [PRE-SMP]
// Routes high-weight vectors to VECTOR_ docs. Binary threshold — superseded
// by Vector_Router.gs once SMP-001 Vector Weight Calculation Engine is live.
// ============================================================================

/**
 * For each vector weight > 0.7, finds or creates VECTOR_[TOPIC].gdoc
 * and appends the session summary. [PRE-SMP] — preserve until Vector_Router.gs live.
 *
 * @param {Object} payload  - Parsed CURATOR JSON.
 * @param {Object} pointers - { vectorFolderId, sessionUid, timestamp }
 * @returns {Object} Status with routedCount.
 */
function executeVectorRouting(payload, pointers) {
  try {
    const vectorFolder = DriveApp.getFolderById(pointers.vectorFolderId);
    const weights      = payload.vector_weights || {};
    let routedCount    = 0;

    for (const [topic, val] of Object.entries(weights)) {
      const w = parseFloat(val);
      if (!isNaN(w) && w > 0.7) {
        const doc  = _getOrCreateDoc("VECTOR_" + topic.toUpperCase().trim(), vectorFolder);
        const body = doc.getBody();
        body.appendParagraph(
          `\n[Vector Seed: ${pointers.timestamp} | ${pointers.sessionUid} | Weight: ${w}]`
        ).setHeading(DocumentApp.ParagraphHeading.HEADING3);
        if (payload.session_summary) body.appendParagraph(payload.session_summary);
        routedCount++;
      }
    }

    console.log(`[VectorRouter] Routed to ${routedCount} Vector Doc(s).`);
    return { status: "SUCCESS", routedCount };
  } catch (error) {
    console.error("[VectorRouter] Fault: " + error.message);
    return { status: "ERROR", message: error.message };
  }
}


// ============================================================================
// END OF PART A
// Paste Part B immediately below this line.
// ============================================================================
