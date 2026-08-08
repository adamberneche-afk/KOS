// ============================================================
// CHUNK 5 of 6 — DEPLOYMENT_ENGINE_AND_INFRASTRUCTURE
// File: KOS_MASTER.gs
// Stitch order: Place this block AFTER Chunk 4
// Patches: GAP 1, GAP 2, GAP 3, GAP 4, GAP 5, GAP 6, GAP 7, GAP 11
// ============================================================


// ============================================================
// PART 13: THE DEPLOYMENT ENGINE (v19.0 — Full Infrastructure)
// PURPOSE: One-click system initialization. Creates complete Drive
//          topology including all missing folders, seeds all canonical
//          documents, captures document-level IDs into PropertiesService,
//          initializes all required sheet tabs, and wires all triggers.
// FIXES: GAP 1 (missing deploy), GAP 2 (missing _getOrCreateFolder),
//        GAP 3 (missing folders), GAP 4 (doc IDs never registered),
//        GAP 5 (Inference_Buffer never created), GAP 6 (MATRIX_LEDGER
//        never created), GAP 11 (no trigger initialization)
// ============================================================

/**
 * Master deployment function. Run ONCE on a fresh installation.
 * Safe to re-run — all creation operations use _getOrCreate pattern.
 *
 * Phases:
 *   1 — Anchor (UI feedback, rename spreadsheet)
 *   2 — Topology (all folders including previously missing ones)
 *   3 — Core Documents (seed content + capture IDs to PropertiesService)
 *   4 — Council Persona Stubs
 *   5 — Sheet Tab Initialization (MATRIX_LEDGER, Inference_Buffer, Blackboard)
 *   6 — Routing Properties (folder ID mapping)
 *   7 — Trigger Wiring (all time-driven triggers)
 *   8 — Handoff
 *
 * CI: 1.0 | Idempotent — safe to re-run
 */
function deployRTPInfrastructure() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();

  // ── PHASE 1: ANCHOR ──────────────────────────────────────────
  ss.toast('Initializing system architecture...', '🚀 Phase 1: Boot Sequence', 5);
  ss.rename("BRAIN_TRUST_INDEX");

  // Register the spreadsheet's own ID immediately — used by intake pipeline
  props.setProperty("ID_BRAIN_TRUST_INDEX", ss.getId());
  SpreadsheetApp.flush();

  // ── PHASE 2: TOPOLOGY ────────────────────────────────────────
  ss.toast('Creating Drive network and folder hierarchy...', '📁 Phase 2: Topology', 10);

  const rootFolder = _getOrCreateFolder("Active_Brain_Trust_System");

  // Move this spreadsheet into the ecosystem root
  DriveApp.getFileById(ss.getId()).moveTo(rootFolder);

  // Named folders — all must exist for the routing system to function
  const folders = {
    FOUNDATION    : _getOrCreateFolder("01_Canonical_Foundation",   rootFolder),
    ALIGNMENTS    : _getOrCreateFolder("02_Council_Alignments",     rootFolder),
    DYNAMIC_STATE : _getOrCreateFolder("03_Dynamic_State",          rootFolder),
    SMP           : _getOrCreateFolder("00_SMP_PROPOSALS",          rootFolder),  // GAP 3
    RAW_EXHAUST   : _getOrCreateFolder("00_RAW_EXHAUST",            rootFolder),  // GAP 3
    VECTORS       : _getOrCreateFolder("05_Vector_Repository",      rootFolder),
    VAULT         : _getOrCreateFolder("06_Memory_Vault",           rootFolder),
    AUTOPSIES     : _getOrCreateFolder("07_Project_Autopsies",      rootFolder),
    GRAVE         : _getOrCreateFolder("CE-GRAVE",                  rootFolder),  // GAP 8
    CODE          : _getOrCreateFolder("Scripts",                   rootFolder),
    COMM          : _getOrCreateFolder("Communications",            rootFolder),
    FLOW          : _getOrCreateFolder("SOPs_and_Workflows",        rootFolder)
  };

  SpreadsheetApp.flush();

  // ── PHASE 3: CORE DOCUMENTS ───────────────────────────────────
  ss.toast('Deploying Canonical and State documents...', '📄 Phase 3: Core Docs', 10);

  // Create each core document and immediately capture its Drive ID (GAP 4)
  const coreDoc      = _getOrCreateDoc("CORE_THESIS",        folders.FOUNDATION);
  const stateDoc     = _getOrCreateDoc("CURRENT_STATE",      folders.DYNAMIC_STATE);
  const pivotDoc     = _getOrCreateDoc("PIVOTS_AND_LESSONS", folders.DYNAMIC_STATE);
  const telemetryDoc = _getOrCreateDoc("SYSTEM_TELEMETRY",   folders.DYNAMIC_STATE);

  // Register document-level IDs to PropertiesService (PIVOT 004 — GAP 4)
  props.setProperty("ID_CURRENT_STATE",      stateDoc.getId());
  props.setProperty("ID_PIVOTS_AND_LESSONS", pivotDoc.getId());
  props.setProperty("ID_CORE_THESIS",        coreDoc.getId());
  props.setProperty("ID_SYSTEM_TELEMETRY",   telemetryDoc.getId());

  // Seed CORE_THESIS with placeholder only if blank
  if (coreDoc.getBody().getText().length < 10) {
    coreDoc.getBody().setText(
      "CORE THESIS\n" +
      "====================\n" +
      "[Awaiting Genesis Protocol — replace this with your CORE_THESIS before first session.]"
    );
  }

  SpreadsheetApp.flush();

  // ── PHASE 4: COUNCIL PERSONA STUBS ───────────────────────────
  ss.toast('Seeding Council Persona Documents...', '🧠 Phase 4: Alignments', 10);

  const personas = [
    { name: "PERSONA_ARCHITECT", role: "Structural integrity, logic, and infrastructure guardian." },
    { name: "PERSONA_AUDITOR",   role: "Conflict detection, historical alignment, and assumption challenging." },
    { name: "PERSONA_MUSE",      role: "Creative expansion, UX innovation, and opportunity identification." },
    { name: "PERSONA_DEVELOPER", role: "Google Apps Script (GAS) Engineer & Flow Architect." },
    { name: "PERSONA_CURATOR",   role: "Lossless data distillation and strict schema enforcement." },
    { name: "PERSONA_ALIGNMENT", role: "Relational bandwidth protection and human presence guardian." }
  ];

  personas.forEach(p => {
    const doc = _getOrCreateDoc(p.name, folders.ALIGNMENTS);
    if (doc.getBody().getText().length < 10) {
      doc.getBody().setText(
        `PERSONA: ${p.name.replace('PERSONA_', '')}\n` +
        `================================================\n` +
        `Role: ${p.role}\n\n` +
        `[Paste full alignment constraints here before activating this cog.]`
      );
    }
  });

  SpreadsheetApp.flush();

  // ── PHASE 5: SHEET TAB INITIALIZATION ────────────────────────
  ss.toast('Initializing Index tabs...', '📊 Phase 5: Sheet Tabs', 8);

  _initMatrixLedger(ss);      // GAP 6
  _initInferenceBuffer(ss);   // GAP 5
  _initBlackboard(ss);        // Governance Engine CE-LOG tab
  _initExecutionLedger(ss);   // Pre-create so Sweeper doesn't need to do it mid-run

  SpreadsheetApp.flush();

  // ── PHASE 6: ROUTING PROPERTIES ──────────────────────────────
  ss.toast('Mapping taxonomy folder IDs...', '🔍 Phase 6: Routing', 5);

  // Write all folder IDs directly from the objects we already have
  // (avoids the Drive name-search re-scan that setupRoutingProperties() does)
  props.setProperty("ID_FOLDER_FOUNDATION",  folders.FOUNDATION.getId());
  props.setProperty("ID_FOLDER_ALIGNMENTS",  folders.ALIGNMENTS.getId());
  props.setProperty("ID_FOLDER_STATE",       folders.DYNAMIC_STATE.getId());
  props.setProperty("ID_FOLDER_SMP",         folders.SMP.getId());
  props.setProperty("ID_00_RAW_EXHAUST",     folders.RAW_EXHAUST.getId());
  props.setProperty("ID_FOLDER_VECTOR",      folders.VECTORS.getId());
  props.setProperty("ID_FOLDER_VAULT",       folders.VAULT.getId());
  props.setProperty("ID_FOLDER_AUTOPSIES",   folders.AUTOPSIES.getId());
  props.setProperty("ID_FOLDER_GRAVE",       folders.GRAVE.getId());       // GAP 8
  props.setProperty("ID_FOLDER_CODE",        folders.CODE.getId());
  props.setProperty("ID_FOLDER_COMM",        folders.COMM.getId());
  props.setProperty("ID_FOLDER_FLOW",        folders.FLOW.getId());

  SpreadsheetApp.flush();

  // ── PHASE 7: TRIGGER WIRING ───────────────────────────────────
  ss.toast('Wiring time-driven triggers...', '⏱ Phase 7: Triggers', 5);
  initializeTriggers();   // GAP 11

  // ── PHASE 8: HANDOFF ──────────────────────────────────────────
  ss.toast(
    'Deployment complete. Open CORE_THESIS and enter your thesis to activate the system.',
    '✅ Phase 8: Online', 10
  );

  console.log("[DEPLOY_COMPLETE] KOS v5.5 infrastructure initialized successfully.");
}


// ============================================================
// PART 14: SHEET TAB INITIALIZERS
// PURPOSE: Create required tabs with correct headers on first deploy.
//          Each function is idempotent — skips creation if tab exists.
// FIXES: GAP 5 (Inference_Buffer), GAP 6 (MATRIX_LEDGER),
//        GAP 7 (EXECUTION_LEDGER pointer fix)
// ============================================================

/**
 * Creates the MATRIX_LEDGER tab with correct headers if absent.
 * This is the Math-Before-Muse quantitative ledger (SMP-001).
 *
 * ⚠️  [PRE-SMP] Column schema is static (4 known vectors).
 *     Will be extended dynamically by Vector_Router.gs once deployed.
 *
 * @param {Spreadsheet} ss - The active BRAIN_TRUST_INDEX spreadsheet.
 */
function _initMatrixLedger(ss) {
  if (ss.getSheetByName("MATRIX_LEDGER")) return; // Already exists — skip

  const sheet = ss.insertSheet("MATRIX_LEDGER");
  sheet.appendRow([
    "SESSION_UID", "TIMESTAMP",
    "ARCHITECTURE", "UI", "SECURITY", "PEDAGOGY",
    "TOTAL"
  ]);
  sheet.getRange("A1:G1")
       .setFontWeight("bold")
       .setBackground("#1e293b")
       .setFontColor("#ffffff");
  sheet.setFrozenRows(1);

  console.log("[INIT] MATRIX_LEDGER tab created.");
}

/**
 * Creates the Inference_Buffer tab with correct headers if absent.
 * Used by consolidateInferenceChunks() to aggregate chunked inference results.
 *
 * @param {Spreadsheet} ss - The active BRAIN_TRUST_INDEX spreadsheet.
 */
function _initInferenceBuffer(ss) {
  if (ss.getSheetByName("Inference_Buffer")) return;

  const sheet = ss.insertSheet("Inference_Buffer");
  sheet.appendRow([
    "CHUNK_ID", "SESSION_ID", "TIMESTAMP",
    "Inference_Payload", "Status"
  ]);
  sheet.getRange("A1:E1")
       .setFontWeight("bold")
       .setBackground("#1e293b")
       .setFontColor("#ffffff");
  sheet.setFrozenRows(1);

  console.log("[INIT] Inference_Buffer tab created.");
}

/**
 * Creates the Blackboard (CE-LOG) tab with correct operational schema.
 * This is the HITL gate for the Governance Engine CI/CD pipeline.
 * Column L (index 12) is the Deploy_Trigger checkbox.
 *
 * @param {Spreadsheet} ss - The active BRAIN_TRUST_INDEX spreadsheet.
 */
function _initBlackboard(ss) {
  if (ss.getSheetByName("Blackboard")) return;

  const sheet = ss.insertSheet("Blackboard");

  // Full 12-column schema per finalized CE-LOG spec
  sheet.appendRow([
    "Target_Doc_ID",        // A — Drive ID of document to mutate
    "Version",              // B
    "CE-TAG",               // C
    "Document_Name",        // D
    "Modification_Desc",    // E
    "Author_Persona",       // F
    "Target_UID",           // G — operational
    "Mutation_Type",        // H — APPEND_BOTTOM | FIND_REPLACE | CREATE_NEW
    "Find_String",          // I — operational
    "Replace_Payload",      // J — operational
    "Deployment_Status",    // K — written by script: PENDING | DEPLOYED | FAILED
    "Deploy_Trigger"        // L — checkbox: human checks to approve
  ]);

  sheet.getRange("A1:L1")
       .setFontWeight("bold")
       .setBackground("#1e293b")
       .setFontColor("#ffffff");
  sheet.setFrozenRows(1);

  // Set Column L as checkboxes
  sheet.getRange("L2:L1000").insertCheckboxes();

  // Highlight operational columns G–L
  sheet.getRange("G1:L1").setBackground("#1e3a5f").setFontColor("#ffffff");

  console.log("[INIT] Blackboard (CE-LOG) tab created with checkbox column L.");
}

/**
 * Creates the EXECUTION_LEDGER tab with correct headers if absent.
 * Pre-creates this tab so the Sweeper doesn't need to do it mid-run
 * and can use the pointer-driven ID lookup instead of name search (GAP 7).
 *
 * @param {Spreadsheet} ss - The active BRAIN_TRUST_INDEX spreadsheet.
 */
function _initExecutionLedger(ss) {
  if (ss.getSheetByName("EXECUTION_LEDGER")) return;

  const sheet = ss.insertSheet("EXECUTION_LEDGER");
  sheet.appendRow(["UID", "TIMESTAMP", "SEMANTIC_TAG", "FILE_URL", "STATUS"]);
  sheet.getRange("A1:E1")
       .setFontWeight("bold")
       .setBackground("#e2e8f0");
  sheet.setFrozenRows(1);

  console.log("[INIT] EXECUTION_LEDGER tab created.");
}


// ============================================================
// PART 15: TRIGGER MANAGEMENT
// PURPOSE: Programmatically wire all time-driven triggers so the user
//          never has to touch the Apps Script trigger UI.
//          Idempotent — checks for existing triggers before creating.
// FIXES: GAP 11 (no trigger initialization function)
// ============================================================

/**
 * Creates all required time-driven triggers for the KOS system.
 * Safe to re-run — existing triggers are checked first to prevent duplicates.
 *
 * Triggers created:
 *   runSemanticSweeper       — every 15 minutes
 *   sweepRootForExhaust      — every 15 minutes
 *   generateCouncilInputPayload — every hour
 */
function initializeTriggers() {
  const existingTriggers = ScriptApp.getProjectTriggers();

  // Helper: check if a trigger already exists for a given function name
  function triggerExists(fnName) {
    return existingTriggers.some(t => t.getHandlerFunction() === fnName);
  }

  // Semantic Sweeper — every 15 minutes
  if (!triggerExists("runSemanticSweeper")) {
    ScriptApp.newTrigger("runSemanticSweeper")
      .timeBased()
      .everyMinutes(15)
      .create();
    console.log("[TRIGGER] runSemanticSweeper wired — every 15 minutes.");
  }

  // Root Exhaust Sweeper — every 15 minutes
  if (!triggerExists("sweepRootForExhaust")) {
    ScriptApp.newTrigger("sweepRootForExhaust")
      .timeBased()
      .everyMinutes(15)
      .create();
    console.log("[TRIGGER] sweepRootForExhaust wired — every 15 minutes.");
  }

  // Council Simulator — every hour
  if (!triggerExists("generateCouncilInputPayload")) {
    ScriptApp.newTrigger("generateCouncilInputPayload")
      .timeBased()
      .everyHours(1)
      .create();
    console.log("[TRIGGER] generateCouncilInputPayload wired — every hour.");
  }

  console.log("[TRIGGERS_COMPLETE] All system triggers initialized.");
}

/**
 * Removes all project triggers. Use before re-running initializeTriggers()
 * if you need to reset the trigger schedule cleanly.
 *
 * ⚠️  This also removes the onEdit trigger for the Governance Engine.
 *     After running, re-deploy deployRTPInfrastructure() or call
 *     initializeTriggers() to restore.
 */
function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log("[TRIGGERS_CLEARED] All project triggers removed.");
}


// ============================================================
// PART 16: _getOrCreateFolder (GAP 2)
// PURPOSE: Idempotent folder creation utility missing from doc 18.
//          Mirrors _getOrCreateDoc pattern for Drive folders.
// FIXES: GAP 2 (_getOrCreateFolder never defined)
// ============================================================

/**
 * Returns an existing Drive folder by name within an optional parent,
 * or creates it if absent. Never creates duplicates. (PIVOT 003)
 *
 * @param {string} folderName     - The target folder name.
 * @param {Folder} [parentFolder] - Optional parent. Defaults to Drive root.
 * @returns {Folder} The existing or newly created folder.
 */
function _getOrCreateFolder(folderName, parentFolder) {
  const searchScope = parentFolder
    ? parentFolder.getFoldersByName(folderName)
    : DriveApp.getFoldersByName(folderName);

  if (searchScope.hasNext()) {
    return searchScope.next();
  }

  return parentFolder
    ? parentFolder.createFolder(folderName)
    : DriveApp.createFolder(folderName);
}

// ============================================================
// END CHUNK 5 of 6 — DEPLOYMENT_ENGINE_AND_INFRASTRUCTURE
// Next chunk: CHUNK 6 of 6 — GOVERNANCE_FIXES_AND_CONTEXT_COMPILER
// ============================================================
