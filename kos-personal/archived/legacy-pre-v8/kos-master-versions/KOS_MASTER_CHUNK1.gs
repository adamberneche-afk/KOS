// ============================================================
// CHUNK 1 of 4 — SYSTEM_CONFIG_AND_DEPLOYMENT
// File: KOS_MASTER.gs
// Stitch order: Place this block FIRST
// ============================================================

/**
 * ========================================================================
 * KNOWLEDGE OPERATING SYSTEM (KOS) — MASTER SCRIPT
 * Version: 5.5 (Consolidated)
 * Conforms to: SMP-001, PIVOT 002 (Bifurcated Architecture),
 *              PIVOT 003 (Idempotency), PIVOT 004 (Pointer-Driven Execution),
 *              PIVOT 008 (Variable Sequestration)
 *
 * CHUNK MAP:
 *   Chunk 1 — System Config, Deployment Engine, Core Utilities
 *   Chunk 2 — Intake Pipeline (Phases 1–3), Vector Math Router
 *   Chunk 3 — Governance Engine (CI/CD), Council Simulator
 *   Chunk 4 — Semantic Sweeper, Root Exhaust Sweeper, Consolidator, Primer
 * ========================================================================
 *
 * ⚠️  MIGRATION NOTE (CE-SMP: Vector Weight Calculation Engine):
 *     The current vector weight logic in this script pre-dates the
 *     sentence-level calculation architecture defined in the Vector Weight
 *     Calculation Engine SMP. Functions marked [PRE-SMP] will be superseded
 *     by Vector_Router.gs once that script is deployed. Do not refactor
 *     those functions until Vector_Router.gs is live and VECTOR_MATRIX is
 *     confirmed operational.
 * ========================================================================
 */


// ============================================================
// PART 1: SYSTEM CONFIGURATION & ROUTING SETUP
// PURPOSE: Dynamically searches Drive for Taxonomy folders and maps their
//          IDs to Script Properties for Pointer-Driven routing (PIVOT 004).
// ============================================================

/**
 * Scans Google Drive for all SMP-001 taxonomy folders and writes their
 * Drive IDs into Script PropertiesService. Run this once after initial
 * folder creation, and again any time a folder is moved or renamed.
 *
 * CI: 1.0 | Fulfills PIVOT 004 (Pointer-Driven Execution)
 */
function setupRoutingProperties() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();

  if (ss) ss.toast('Scanning Drive for Taxonomy Folders...', '🔍 Searching', 3);

  // Helper: Search Drive by name and return the first matching folder ID.
  // Returns null if not found and logs a structured error.
  function fetchFolderId(folderName) {
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      return folders.next().getId();
    } else {
      console.error(`⚠️ FOLDER MISSING: Could not locate [${folderName}] in Drive.`);
      return null;
    }
  }

  // SMP-001 canonical taxonomy. Keys are the PropertiesService property names.
  // Values are the exact Drive folder names to search for.
  const taxonomyKeys = {
    "ID_FOLDER_PRDS":       fetchFolderId("Lesson_Plans"),
    "ID_FOLDER_LESSON":     fetchFolderId("Student_Facing"),
    "ID_FOLDER_RUBRIC":     fetchFolderId("Assessments"),
    "ID_FOLDER_COMM":       fetchFolderId("Communications"),
    "ID_FOLDER_FLOW":       fetchFolderId("SOPs_and_Workflows"),
    "ID_FOLDER_CODE":       fetchFolderId("Scripts"),
    "ID_FOLDER_VECTOR":     fetchFolderId("[05_Vector_Repository]"),
    "ID_FOLDER_STATE":      fetchFolderId("[03_Dynamic_State]"),
    "ID_FOLDER_SMP":        fetchFolderId("[00_SMP_PROPOSALS]"),
    "ID_00_RAW_EXHAUST":    fetchFolderId("[00_RAW_EXHAUST]")
  };

  let mappedCount = 0;
  let errorCount = 0;

  for (let key in taxonomyKeys) {
    const folderId = taxonomyKeys[key];
    if (folderId) {
      props.setProperty(key, folderId);
      mappedCount++;
    } else {
      errorCount++;
    }
  }

  if (ss) {
    if (errorCount === 0) {
      ss.toast(`Successfully mapped ${mappedCount} Folder IDs to the Master Ledger.`, '✅ System Humming', 8);
    } else {
      ss.toast(`Mapped ${mappedCount} IDs. ${errorCount} folder(s) not found. Check execution logs.`, '⚠️ Partial Success', 8);
    }
  }
}


// ============================================================
// PART 2: THE HARDENER UTILITY (PIVOT 008)
// PURPOSE: Sequester private IP weights and calibration data into
//          PropertiesService to prevent hardcoding in script bodies.
// RUN ONCE: After seeding, clear sensitive values from this function body.
// ============================================================

/**
 * Injects proprietary calibration weights into Script Properties.
 * Run once during system initialization, then clear the values below.
 *
 * CI: 1.0 | Fulfills PIVOT 008 (Variable Sequestration)
 */
function setupCalibration() {
  const props = PropertiesService.getScriptProperties();

  // Define your proprietary weights here.
  // ⚠️  CLEAR THESE VALUES AFTER FIRST RUN — do not leave live data in source.
  const calibrationMap = {
    'THEME_ARCHITECTURE':     '0.85',
    'THEME_PEDAGOGY':         '0.90',
    'THEME_FAMILY_ALIGNMENT': '1.00',
    'SOCRATIC_THRESHOLD':     '0.75',
    'IDENTITY_KEY_SALT':      'your_private_secret_string_here'
  };

  props.setProperties(calibrationMap);
  console.log("[HARDENING_COMPLETE] Calibration weights sequestered in PropertiesService.");
}

/**
 * Audits the current state of the Calibration Wall.
 * Run to verify all expected keys are present after setupCalibration().
 */
function auditCalibrationHealth() {
  const props = PropertiesService.getScriptProperties();
  const keys = props.getKeys();

  if (keys.length === 0) {
    console.warn("[SYSTEM_COLD] No calibration data found. Engine is currently un-aligned.");
  } else {
    console.log(`[SYSTEM_ARMED] Found ${keys.length} sequestered calibration keys.`);
    keys.forEach(key => console.log(` - Key Verified: ${key}`));
  }
}

/**
 * Wipes all Script Properties. Use for open-source release preparation.
 * ⚠️  IRREVERSIBLE. Run only when intentionally clearing all IP from the engine.
 */
function nuclearWipeForRelease() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  console.log("[CLEAN_SWEEP] All sequestered IP data wiped. Ready for open-source release.");
}

/**
 * Fetches a single calibration value from PropertiesService by key.
 * Use this everywhere calibration data is needed — never read props directly.
 *
 * @param {string} key - The PropertiesService key to retrieve.
 * @returns {string|null} The stored value, or null if missing.
 */
function getKOSCalibration(key) {
  const props = PropertiesService.getScriptProperties();
  const val = props.getProperty(key);
  if (!val) {
    console.error(`[CALIBRATION_ERROR] Missing key: ${key}. Engine remaining COLD.`);
    return null;
  }
  return val;
}


// ============================================================
// PART 3: THE DEPLOYMENT ENGINE (v18.3 — UX Refactor & Native Personas)
// PURPOSE: One-click system initialization. Creates all Drive topology,
//          seeds canonical documents, and generates persona stubs.
// ============================================================

/**
 * Master deployment function. Run once on a fresh installation.
 * Phases: Boot → Topology → Core Docs → Council Personas → Handoff
 *
 * CI: 1.0 | Idempotent — safe to re-run (uses _getOrCreate throughout)
 */
function deployRTPInfrastructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- PHASE 1: ANCHOR (Immediate UI feedback) ---
  ss.toast('Initializing system architecture...', '🚀 Phase 1: Boot Sequence', 5);
  ss.rename("BRAIN_TRUST_INDEX");
  SpreadsheetApp.flush();

  // --- PHASE 2: TOPOLOGY (Folder Generation) ---
  ss.toast('Creating Drive network and folder hierarchy...', '📁 Phase 2: Topology', 8);

  const rootFolder = _getOrCreateFolder("Active_Brain_Trust_System");

  // Move this spreadsheet into the root folder so it lives inside the ecosystem
  DriveApp.getFileById(ss.getId()).moveTo(rootFolder);

  const folders = {
    "FOUNDATION":    _getOrCreateFolder("01_Canonical_Foundation", rootFolder),
    "ALIGNMENTS":    _getOrCreateFolder("02_Council_Alignments", rootFolder),
    "DYNAMIC_STATE": _getOrCreateFolder("03_Dynamic_State", rootFolder),
    "VECTORS":       _getOrCreateFolder("05_Vector_Repository", rootFolder),
    "VAULT":         _getOrCreateFolder("06_Memory_Vault", rootFolder),
    "AUTOPSIES":     _getOrCreateFolder("07_Project_Autopsies", rootFolder)
  };

  SpreadsheetApp.flush();

  // --- PHASE 3: STATE INITIALIZATION (Core Docs) ---
  ss.toast('Deploying Canonical and State documents...', '📄 Phase 3: Core Docs', 8);

  const coreDoc      = _getOrCreateDoc("CORE_THESIS",       folders.FOUNDATION);
  const stateDoc     = _getOrCreateDoc("CURRENT_STATE",     folders.DYNAMIC_STATE);
  const pivotDoc     = _getOrCreateDoc("PIVOTS_AND_LESSONS",folders.DYNAMIC_STATE);
  const telemetryDoc = _getOrCreateDoc("SYSTEM_TELEMETRY",  folders.DYNAMIC_STATE);

  // Seed CORE_THESIS with a placeholder if the doc is blank
  if (coreDoc.getBody().getText().length < 10) {
    coreDoc.getBody().setText(
      "CORE THESIS\n====================\n[Awaiting Genesis Protocol...]"
    );
  }

  SpreadsheetApp.flush();

  // --- PHASE 4: COUNCIL ALIGNMENTS (Persona Doc Generation) ---
  ss.toast('Seeding Council Persona Documents...', '🧠 Phase 4: Alignments', 8);

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
    // Only seed if the file is blank — never overwrite existing persona content
    if (doc.getBody().getText().length < 10) {
      doc.getBody().setText(
        `PERSONA: ${p.name.replace('PERSONA_', '')}\n` +
        `================================================\n` +
        `Role: ${p.role}\n\n` +
        `[Paste full alignment constraints here...]`
      );
    }
  });

  SpreadsheetApp.flush();

  // --- PHASE 5: COMPLETION & HANDOFF ---
  ss.toast('Deployment complete. System online.', '✅ Phase 5: Online', 5);
  Utilities.sleep(1500);

  // After deployment, run routing setup to map all folder IDs to properties
  setupRoutingProperties();
}


// ============================================================
// PART 4: CORE UTILITIES
// PURPOSE: Idempotent asset creation helpers used across all parts.
//          These are the foundation of PIVOT 003 compliance.
// ============================================================

/**
 * Returns an existing Google Doc by name within a folder, or creates one
 * if absent. Never creates duplicates. (PIVOT 003 — Idempotent Operations)
 *
 * @param {string} docName - The target document name.
 * @param {Folder} folder  - The Drive folder to search within and create into.
 * @returns {Document} The existing or newly created Google Doc.
 */
function _getOrCreateDoc(docName, folder) {
  const existing = folder.getFilesByName(docName);
  if (existing.hasNext()) {
    // Doc already exists — return it without creating a duplicate
    return DocumentApp.openById(existing.next().getId());
  }
  // Doc is absent — create it, move it into the target folder, return it
  const newDoc  = DocumentApp.create(docName);
  const newFile = DriveApp.getFileById(newDoc.getId());
  newFile.moveTo(folder);
  return newDoc;
}

/**
 * Returns an existing Drive folder by name (within an optional parent),
 * or creates one if absent. Never creates duplicates. (PIVOT 003)
 *
 * @param {string} folderName       - The target folder name.
 * @param {Folder} [parentFolder]   - Optional parent. Defaults to Drive root.
 * @returns {Folder} The existing or newly created folder.
 */
function _getOrCreateFolder(folderName, parentFolder) {
  // Determine search scope: parent folder if provided, otherwise Drive root
  const searchScope = parentFolder
    ? parentFolder.getFoldersByName(folderName)
    : DriveApp.getFoldersByName(folderName);

  if (searchScope.hasNext()) {
    // Folder already exists — return it
    return searchScope.next();
  }

  // Folder is absent — create it in the correct location
  return parentFolder
    ? parentFolder.createFolder(folderName)
    : DriveApp.createFolder(folderName);
}

// ============================================================
// END CHUNK 1 of 4 — SYSTEM_CONFIG_AND_DEPLOYMENT
// Next chunk: CHUNK 2 of 4 — INTAKE_PIPELINE_AND_VECTOR_ROUTER
// ============================================================
