/** * ============================================================================
 * RTP MASTER SYSTEM — COMBINED DEPLOYMENT FILE
 * ============================================================================
 * CI: 1.2 | Three-Phase Execution Pipeline | Full Folder Coverage
 *
 * ▶ PHASE 1 — deployArchitecture()
 *     Creates the full Active_Brain_Trust_System folder tree in Google Drive.
 *     Idempotent: safe to re-run, will not duplicate existing folders/files.
 *
 * ▶ PHASE 2 — setupRoutingProperties()
 *     Navigates the created folder tree and registers every folder ID into
 *     PropertiesService so the Semantic Router can read them.
 *     Run AFTER deployArchitecture() completes successfully.
 *
 * ▶ PHASE 3 — semanticRouterSweeper()
 *     Scans My Drive root for CE-tagged files, routes them to their target
 *     folders, stamps a UID for idempotency, and logs to BRAIN_TRUST_INDEX.
 *     Run AFTER setupRoutingProperties() confirms all 26 properties are set.
 *
 * CORRECT RUN ORDER:
 *   1. deployArchitecture()
 *   2. setupRoutingProperties()  ← verify all ✔ in log before proceeding
 *   3. semanticRouterSweeper()
 *
 * FULL SEMANTIC TAG REFERENCE (SMP-001):
 * ─────────────────────────────────────────────────────────────────────────────
 *  TAG          → DESTINATION FOLDER
 * ─────────────────────────────────────────────────────────────────────────────
 *  CE-CODE      → 01.1_SCRIPTS
 *  CE-FLOW      → 01.2_SOP_AND_FLOWS
 *  CE-SMP       → 01.3_SMP_PROPOSALS
 *  CE-COG       → 02_Council_Alignments
 *  CE-STATE     → 03_Dynamic_State
 *  CE-CURR      → 03.1_CURRENT_STATE          ← NEW
 *  CE-PIVOT     → 03.2_PIVOTS_AND_LESSONS
 *  CE-PROC      → 03.3_PROCESSED_EXHAUST      ← NEW
 *  CE-VECTOR    → 05_Vector_Repository
 *  CE-PRD       → 06.1_LESSON_PLANS
 *  CE-LESSON    → 06.2_STUDENT_FACING
 *  CE-RUBRIC    → 06.3_ASSESSMENTS
 *  CE-COMM      → 06.4_COMMUNICATIONS
 *  CE-VAULT     → 07_Memory_Vault
 *  CE-AUTOPSY   → 08_Project_Autopsies
 *  CE-TEMPLATE  → CCPS_MASTER_TEMPLATES
 *  CE-LOG       → 04_Council_Logs (parent)    ← NEW
 *  CE-ARCH      → 04.1_ARCHITECT_SILO         ← NEW
 *  CE-AUD       → 04.2_AUDITOR_SILO           ← NEW
 *  CE-MUSE      → 04.3_MUSE_SILO              ← NEW
 *  CE-DEV       → 04.4_DEVELOPER_SILO         ← NEW
 *  CE-ALIGN     → 04.5_ALIGNER_SILO           ← NEW
 *  CE-CUR       → 04.6_CURATOR_SILO           ← NEW
 *  CE-RTP       → 04.7_RTP_SILO               ← NEW
 *  CE-GRAVE     → 04.8_COG_GRAVEYARD          ← NEW
 *  KOS: / CE:   → 03.4_RAW_EXHAUST
 * ─────────────────────────────────────────────────────────────────────────────
 */


// ============================================================================
// PHASE 1: ARCHITECTURE DEPLOYMENT
// ============================================================================

function deployArchitecture() {

  // ROOT LEVEL
  const rootFolder = _getOrCreateFolder("Active_Brain_Trust_System");

  // 01_Canonical_Foundation
  const f01 = _getOrCreateFolder("01_Canonical_Foundation", rootFolder);
  _getOrCreateFolder("01.1_SCRIPTS", f01);
  _getOrCreateFolder("01.2_SOP_AND_FLOWS", f01);
  _getOrCreateFolder("01.3_SMP_PROPOSALS", f01);
  _getOrCreateDoc("CORE_THESIS", f01);
  _getOrCreateDoc("START_HERE_GEM_SETUP", f01);

  // 02_Council_Alignments
  const f02 = _getOrCreateFolder("02_Council_Alignments", rootFolder);
  _getOrCreateDoc("PERSONA_ALIGNMENT", f02);
  _getOrCreateDoc("PERSONA_ARCHITECT V4", f02);
  _getOrCreateDoc("PERSONA_AUDITOR V3", f02);
  _getOrCreateDoc("PERSONA_CURATOR_v.5.3", f02);
  _getOrCreateDoc("PERSONA_DEVELOPER V4", f02);
  _getOrCreateDoc("PERSONA_MUSE V4", f02);
  _getOrCreateDoc("RTP_GEM_INSTRUCTIONS", f02);

  // 03_Dynamic_State
  const f03 = _getOrCreateFolder("03_Dynamic_State", rootFolder);
  _getOrCreateFolder("03.1_CURRENT_STATE", f03);
  _getOrCreateFolder("03.2_PIVOTS_AND_LESSONS", f03);
  _getOrCreateFolder("03.3_PROCESSED_EXHAUST", f03);
  _getOrCreateFolder("03.4_RAW_EXHAUST", f03);
  _getOrCreateDoc("CURRENT_STATE", f03);
  _getOrCreateSheet("DYNAMIC_STATE_MATRIX", f03);
  _getOrCreateDoc("PIVOTS_AND_LESSONS_V18.1", f03);
  _getOrCreateDoc("SYSTEM_TELEMETRY", f03);

  // 04_Council_Logs (The Calibration Silos)
  const f04 = _getOrCreateFolder("04_Council_Logs", rootFolder);
  _getOrCreateFolder("04.1_ARCHITECT_SILO", f04);
  _getOrCreateFolder("04.2_AUDITOR_SILO", f04);
  _getOrCreateFolder("04.3_MUSE_SILO", f04);
  _getOrCreateFolder("04.4_DEVELOPER_SILO", f04);
  _getOrCreateFolder("04.5_ALIGNER_SILO", f04);
  _getOrCreateFolder("04.6_CURATOR_SILO", f04);
  _getOrCreateFolder("04.7_RTP_SILO", f04);
  _getOrCreateFolder("04.8_COG_GRAVEYARD", f04);

  // 05_Vector_Repository
  const f05 = _getOrCreateFolder("05_Vector_Repository", rootFolder);
  _getOrCreateDoc("VECTOR_ARCHITECTURE", f05);
  _getOrCreateDoc("VECTOR_PEDAGOGY", f05);
  _getOrCreateDoc("VECTOR_SECURITY", f05);
  _getOrCreateDoc("VECTOR_UI", f05);

  // 06_CLASSROOM_ASSETS
  const f06 = _getOrCreateFolder("06_CLASSROOM_ASSETS", rootFolder);
  _getOrCreateFolder("06.1_LESSON_PLANS", f06);
  _getOrCreateFolder("06.2_STUDENT_FACING", f06);
  _getOrCreateFolder("06.3_ASSESSMENTS", f06);
  _getOrCreateFolder("06.4_COMMUNICATIONS", f06);

  // 07 & 08
  _getOrCreateFolder("07_Memory_Vault", rootFolder);
  _getOrCreateFolder("08_Project_Autopsies", rootFolder);

  // CCPS_MASTER_TEMPLATES & Root Level Index
  const ccps = _getOrCreateFolder("CCPS_MASTER_TEMPLATES", rootFolder);
  _getOrCreateFolder("01_Pending_Tagging", ccps);
  _getOrCreateDoc("PRD_TEMPLATE_LESSON_PLAN", ccps);
  _getOrCreateSheet("BRAIN_TRUST_INDEX", rootFolder);

  Logger.log("✅ Phase 1 complete: Architecture deployed. Run setupRoutingProperties() next.");
}


// ============================================================================
// PHASE 2: REGISTER FOLDER IDs TO PROPERTIESSERVICE
// ============================================================================

function setupRoutingProperties() {
  const props = PropertiesService.getScriptProperties();

  // Navigate the folder tree by name — mirrors deployArchitecture() exactly
  const root = _findFolder("Active_Brain_Trust_System", DriveApp.getRootFolder());
  if (!root) {
    Logger.log("❌ FATAL: Active_Brain_Trust_System not found. Run deployArchitecture() first.");
    return;
  }

  const f01  = _findFolder("01_Canonical_Foundation", root);
  const f02  = _findFolder("02_Council_Alignments", root);
  const f03  = _findFolder("03_Dynamic_State", root);
  const f04  = _findFolder("04_Council_Logs", root);
  const f05  = _findFolder("05_Vector_Repository", root);
  const f06  = _findFolder("06_CLASSROOM_ASSETS", root);
  const f07  = _findFolder("07_Memory_Vault", root);
  const f08  = _findFolder("08_Project_Autopsies", root);
  const ccps = _findFolder("CCPS_MASTER_TEMPLATES", root);

  const routingMap = {
    // 01_Canonical_Foundation
    "ID_01_1_SCRIPTS":          _findFolder("01.1_SCRIPTS", f01),
    "ID_01_2_SOP_AND_FLOWS":    _findFolder("01.2_SOP_AND_FLOWS", f01),
    "ID_01_3_SMP_PROPOSALS":    _findFolder("01.3_SMP_PROPOSALS", f01),

    // 02_Council_Alignments
    "ID_02_COUNCIL_ALIGNMENTS": f02,

    // 03_Dynamic_State
    "ID_03_DYNAMIC_STATE":      f03,
    "ID_03_1_CURRENT_STATE":    _findFolder("03.1_CURRENT_STATE", f03),   // NEW
    "ID_03_2_PIVOTS":           _findFolder("03.2_PIVOTS_AND_LESSONS", f03),
    "ID_03_3_PROCESSED":        _findFolder("03.3_PROCESSED_EXHAUST", f03), // NEW
    "ID_00_RAW_EXHAUST":        _findFolder("03.4_RAW_EXHAUST", f03),

    // 04_Council_Logs — full silo coverage (all NEW)
    "ID_04_COUNCIL_LOGS":       f04,
    "ID_04_1_ARCHITECT":        _findFolder("04.1_ARCHITECT_SILO", f04),
    "ID_04_2_AUDITOR":          _findFolder("04.2_AUDITOR_SILO", f04),
    "ID_04_3_MUSE":             _findFolder("04.3_MUSE_SILO", f04),
    "ID_04_4_DEVELOPER":        _findFolder("04.4_DEVELOPER_SILO", f04),
    "ID_04_5_ALIGNER":          _findFolder("04.5_ALIGNER_SILO", f04),
    "ID_04_6_CURATOR":          _findFolder("04.6_CURATOR_SILO", f04),
    "ID_04_7_RTP":              _findFolder("04.7_RTP_SILO", f04),
    "ID_04_8_GRAVEYARD":        _findFolder("04.8_COG_GRAVEYARD", f04),

    // 05–08
    "ID_05_VECTOR_REPOSITORY":  f05,
    "ID_06_1_LESSON_PLANS":     _findFolder("06.1_LESSON_PLANS", f06),
    "ID_06_2_STUDENT_FACING":   _findFolder("06.2_STUDENT_FACING", f06),
    "ID_06_3_ASSESSMENTS":      _findFolder("06.3_ASSESSMENTS", f06),
    "ID_06_4_COMMUNICATIONS":   _findFolder("06.4_COMMUNICATIONS", f06),
    "ID_07_MEMORY_VAULT":       f07,
    "ID_08_PROJECT_AUTOPSIES":  f08,

    // CCPS
    "ID_CCPS_MASTER_TEMPLATES": ccps,
  };

  let successCount = 0;
  let failCount    = 0;

  Logger.log("=== REGISTERING FOLDER IDs TO PROPERTIESSERVICE ===");
  for (const key in routingMap) {
    const folder = routingMap[key];
    if (folder) {
      props.setProperty(key, folder.getId());
      Logger.log(`  ✔ ${key} → ${folder.getId()} (${folder.getName()})`);
      successCount++;
    } else {
      Logger.log(`  ❌ ${key} → FOLDER NOT FOUND. Re-run deployArchitecture().`);
      failCount++;
    }
  }

  Logger.log("====================================================");
  Logger.log(`✅ Done. ${successCount} properties set. ${failCount} failures.`);

  if (failCount > 0) {
    Logger.log("⚠ Re-run deployArchitecture() to create missing folders, then run this script again.");
  } else {
    Logger.log("🟢 All clear — 26 properties confirmed. You can now run semanticRouterSweeper().");
  }
}


// ============================================================================
// PHASE 3: SEMANTIC ROUTER SWEEPER ENGINE
// ============================================================================
// CI: 1.2 | Enforces Idempotency | Full SMP-001 Tag Coverage

function semanticRouterSweeper() {
  const lock = LockService.getScriptLock();
  // Prevent concurrent executions that could cause double-routing
  if (!lock.tryLock(10000)) return;

  try {
    const props = PropertiesService.getScriptProperties();

    // Use getFiles() to catch ALL file types — not just native Google Docs
    const allFiles = DriveApp.getRootFolder().getFiles();

    // ==========================================================================
    // THE SEMANTIC TAXONOMY MAP (SMP-001) — Full Coverage
    // ==========================================================================
    const taxonomyMap = {
      // 01_Canonical_Foundation
      "CE-CODE":     props.getProperty("ID_01_1_SCRIPTS"),
      "CE-FLOW":     props.getProperty("ID_01_2_SOP_AND_FLOWS"),
      "CE-SMP":      props.getProperty("ID_01_3_SMP_PROPOSALS"),

      // 02_Council_Alignments
      "CE-COG":      props.getProperty("ID_02_COUNCIL_ALIGNMENTS"),

      // 03_Dynamic_State
      "CE-STATE":    props.getProperty("ID_03_DYNAMIC_STATE"),
      "CE-CURR":     props.getProperty("ID_03_1_CURRENT_STATE"),    // NEW
      "CE-PIVOT":    props.getProperty("ID_03_2_PIVOTS"),
      "CE-PROC":     props.getProperty("ID_03_3_PROCESSED"),        // NEW

      // 04_Council_Logs — full silo coverage (all NEW)
      "CE-LOG":      props.getProperty("ID_04_COUNCIL_LOGS"),
      "CE-ARCH":     props.getProperty("ID_04_1_ARCHITECT"),
      "CE-AUD":      props.getProperty("ID_04_2_AUDITOR"),
      "CE-MUSE":     props.getProperty("ID_04_3_MUSE"),
      "CE-DEV":      props.getProperty("ID_04_4_DEVELOPER"),
      "CE-ALIGN":    props.getProperty("ID_04_5_ALIGNER"),
      "CE-CUR":      props.getProperty("ID_04_6_CURATOR"),
      "CE-RTP":      props.getProperty("ID_04_7_RTP"),
      "CE-GRAVE":    props.getProperty("ID_04_8_GRAVEYARD"),

      // 05–08
      "CE-VECTOR":   props.getProperty("ID_05_VECTOR_REPOSITORY"),
      "CE-PRD":      props.getProperty("ID_06_1_LESSON_PLANS"),
      "CE-LESSON":   props.getProperty("ID_06_2_STUDENT_FACING"),
      "CE-RUBRIC":   props.getProperty("ID_06_3_ASSESSMENTS"),
      "CE-COMM":     props.getProperty("ID_06_4_COMMUNICATIONS"),
      "CE-VAULT":    props.getProperty("ID_07_MEMORY_VAULT"),
      "CE-AUTOPSY":  props.getProperty("ID_08_PROJECT_AUTOPSIES"),

      // CCPS
      "CE-TEMPLATE": props.getProperty("ID_CCPS_MASTER_TEMPLATES"),

      // Raw exhaust fallbacks
      "KOS:":        props.getProperty("ID_00_RAW_EXHAUST"), // Human input routing
      "CE:":         props.getProperty("ID_00_RAW_EXHAUST")  // Generic AI exhaust fallback
    };

    // Diagnostic: log all resolved folder IDs so null values surface immediately
    Logger.log("=== TAXONOMY MAP RESOLVED VALUES ===");
    for (const tag in taxonomyMap) {
      Logger.log(`  ${tag} → ${taxonomyMap[tag] || "⚠ NULL — run setupRoutingProperties()"}`);
    }
    Logger.log("====================================");

    let processedCount = 0;
    let skippedUid     = 0;
    let skippedNoTag   = 0;
    let skippedNullId  = 0;

    while (allFiles.hasNext()) {
      const file = allFiles.next();
      const name = file.getName();

      Logger.log(`Scanning: "${name}"`);

      // IDEMPOTENCY CHECK: Already routed files carry a UID — skip them
      if (name.indexOf("[UID_") !== -1) {
        skippedUid++;
        continue;
      }

      // Scan filename for a Semantic Tag
      let targetFolderId = null;
      let matchedTag     = null;

      for (const tag in taxonomyMap) {
        if (name.indexOf(tag) !== -1) {
          targetFolderId = taxonomyMap[tag];
          matchedTag = tag;
          break; // Stop at first valid tag match
        }
      }

      // No semantic tag — not our file, skip silently
      if (!matchedTag) {
        skippedNoTag++;
        continue;
      }

      // Null folder ID guard — surfaces misconfigured properties explicitly
      if (!targetFolderId) {
        skippedNullId++;
        Logger.log(`⚠ NULL FOLDER ID: Tag "${matchedTag}" matched "${name}" but folder ID is null. Run setupRoutingProperties().`);
        continue;
      }

      // Tag matched AND folder ID is valid — execute the move

      // 1. Generate Temporal UID to prevent duplicate processing
      const uid = "[UID_DOC_" + new Date().getTime() + "]";

      // 2. Stamp UID onto filename (e.g., "[UID_DOC_17100000] CE-LESSON: Marketing")
      file.setName(uid + " " + name);

      // 3. Move to target folder
      const targetFolder = DriveApp.getFolderById(targetFolderId);
      file.moveTo(targetFolder);
      Logger.log(`✔ Moved: "${name}" → tag "${matchedTag}" → folder "${targetFolder.getName()}"`);

      // ========================================================================
      // BLACKBOARD LEDGER (EXECUTION REGISTRATION)
      // ========================================================================
      const indexFiles = DriveApp.getFilesByName("BRAIN_TRUST_INDEX");

      if (indexFiles.hasNext()) {
        const ss = SpreadsheetApp.openById(indexFiles.next().getId());
        let ledger = ss.getSheetByName("EXECUTION_LEDGER");

        // Auto-generate the tab and headers on first run
        if (!ledger) {
          ledger = ss.insertSheet("EXECUTION_LEDGER");
          ledger.appendRow(["UID", "TIMESTAMP", "SEMANTIC_TAG", "FILE_URL", "STATUS", "ATTEMPT_TRACKER"]);
          ledger.getRange("A1:F1").setFontWeight("bold").setBackground("#e2e8f0");
          ledger.setFrozenRows(1);
        }

        // Register routed file with QUEUED status for Cog Engine micro-loops
        ledger.appendRow([
          uid,
          new Date(),
          matchedTag,
          file.getUrl(),
          "QUEUED",
          0  // Attempt Tracker starts at 0 (Bounce-Back Protocol)
        ]);
      } else {
        Logger.log("Ledger Error: BRAIN_TRUST_INDEX not found. File moved but NOT registered.");
      }
      // ========================================================================

      processedCount++;
      SpreadsheetApp.flush(); // Pace executions to prevent Google API timeouts
    }

    // Final run summary
    Logger.log(`\n========== SWEEP COMPLETE ==========`);
    Logger.log(`  ✔ Routed:           ${processedCount}`);
    Logger.log(`  ↷ Already had UID:  ${skippedUid}`);
    Logger.log(`  — No tag match:     ${skippedNoTag}`);
    Logger.log(`  ⚠ Null folder ID:   ${skippedNullId}`);
    Logger.log(`=====================================`);

  } catch (e) {
    Logger.log("Sweeper Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// SHARED HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a folder inside a parent (or Drive root if no parent given).
 * Idempotent — returns existing folder if found.
 */
function _getOrCreateFolder(folderName, parentFolder) {
  const parent = parentFolder || DriveApp.getRootFolder();
  const folders = parent.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parent.createFolder(folderName);
}

/**
 * Creates a Google Doc inside a parent folder.
 * Idempotent — returns existing doc if found.
 */
function _getOrCreateDoc(docName, parentFolder) {
  const files = parentFolder.getFilesByName(docName);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_DOCS) return DocumentApp.openById(file.getId());
  }
  const doc = DocumentApp.create(docName);
  DriveApp.getFileById(doc.getId()).moveTo(parentFolder);
  return doc;
}

/**
 * Creates a Google Sheet inside a parent folder.
 * Idempotent — returns existing sheet if found.
 */
function _getOrCreateSheet(sheetName, parentFolder) {
  const files = parentFolder.getFilesByName(sheetName);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(file.getId());
  }
  const sheet = SpreadsheetApp.create(sheetName);
  DriveApp.getFileById(sheet.getId()).moveTo(parentFolder);
  return sheet;
}

/**
 * Finds a subfolder by name inside a parent folder.
 * Returns the folder object or null if not found.
 */
function _findFolder(name, parentFolder) {
  if (!parentFolder) return null;
  const folders = parentFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : null;
}
