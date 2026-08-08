// ============================================================
// CHUNK 7 of 7 — DOC19_INTEGRATIONS
// File: KOS_MASTER.gs
// Stitch order: Place this block AFTER Chunk 6
//
// This chunk integrates six architectural improvements from the
// v5.5.1 Crucible iteration (doc 19) that are absent from Chunks 1–6:
//
//   1. CFG — global config object (removes all hardcoded strings)
//   2. onOpen() — custom menu with headless protection
//   3. masterRefineryProcess() — Drop Zone doc intake pipeline
//   4. Smart Chip rich text links — upgrades all ledger writes
//   5. runSemanticSweeper_v2() — searchFiles() O(N) optimization
//   6. _getOrCreateSpreadsheet() — flush() before moveTo() race fix
//
// NAMING NOTE ON SWEEPER:
//   This chunk provides runSemanticSweeper_v2() as the optimized
//   replacement for runSemanticSweeper() in Chunk 4. Once confirmed
//   operational, rename Chunk 4's version to runSemanticSweeper_LEGACY()
//   and rename this to runSemanticSweeper() to activate it as the
//   default. The trigger in initializeTriggers() (Chunk 5) should then
//   point to the v2 name.
// ============================================================


// ============================================================
// PART 22: CFG — GLOBAL CONFIGURATION OBJECT
// PURPOSE: Centralizes all system constants in one place.
//          Change a name here — it propagates everywhere.
//          Never hardcode these strings in function bodies.
// ============================================================

/**
 * System-wide configuration constants.
 * All folder names, sheet names, and key identifiers live here.
 * Edit this object when system topology changes — nowhere else.
 */
const CFG = {
  // Drive folder names
  SYSTEM_NAME      : "Active_Brain_Trust_System",
  STAGING_FOLDER   : "03.4_RAW_EXHAUST",
  GRAVE_FOLDER     : "CE-GRAVE",

  // Document and sheet names
  DROP_ZONE_TITLE  : "DROP_ZONE",
  INDEX_NAME       : "BRAIN_TRUST_INDEX",
  STAGING_SHEET    : "STAGING_PIPELINE",
  MATRIX_SHEET     : "MATRIX_LEDGER",
  BUFFER_SHEET     : "Inference_Buffer",
  BLACKBOARD_SHEET : "Blackboard",
  LEDGER_SHEET     : "EXECUTION_LEDGER",

  // PropertiesService keys for calibration data
  CALIBRATION_KEYS : [
    'SESSION_VECTOR_PRIMER',
    'RTP_IDENTITY_HASH',
    'ALIGNMENT_TOLERANCE'     // Added from doc 19 — sequestered alignment threshold
  ],

  // Intake pipeline
  DROP_ZONE_SENTINEL : "▼ NEXT SESSION LOG GOES BELOW ▼",

  // Sweeper search query — offloads filter to Google's backend
  SWEEPER_QUERY    : "title contains 'CE-' and not title contains '[UID_DOC_'",

  // Taxonomy: CE-tag prefix → PropertiesService key
  // Used by both the Sweeper and the Governance Engine CREATE_NEW handler
  TAG_TO_PROP_KEY  : {
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
    "CE-LOG:"     : "ID_00_RAW_EXHAUST",
    "CE-TEMPLATE:": "ID_FOLDER_ROOT",
    "KOS:"        : "ID_00_RAW_EXHAUST",
    "CE:"         : "ID_00_RAW_EXHAUST"
  }
};


// ============================================================
// PART 23: onOpen() — CUSTOM MENU WITH HEADLESS PROTECTION
// PURPOSE: Builds the KOS Council menu in the Drop Zone Doc UI.
//          Wrapped in try/catch so time-driven triggers that invoke
//          functions in this script don't crash on missing UI context.
// ============================================================

/**
 * Builds the custom '🚀 KOS Council' menu in the active document UI.
 * Fails silently in headless/trigger execution contexts — safe for
 * time-driven triggers to fire without crashing.
 *
 * Menu items map directly to the two primary user actions:
 *   - Deploy System / Recalibrate Pointers → deployFullSystem()
 *   - Master Intake Pipeline (Single Click)  → masterRefineryProcess()
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
    // Fails silently in headless/trigger environments — intentional
    console.log("[onOpen] Headless context detected. Menu skipped.");
  }
}


// ============================================================
// PART 24: deployFullSystem() — HEADLESS-SAFE DEPLOY
// PURPOSE: Recalibration-friendly deploy that wraps all UI calls
//          in try/catch blocks so it runs safely from any context:
//          manual execution, menu click, or time-driven trigger.
//
//          This is the Drop Zone Doc version of deployment — it
//          operates from a Google Doc context rather than a Sheet.
//          Complements deployRTPInfrastructure() (Chunk 5) which
//          operates from a Sheet context.
// ============================================================

/**
 * Builds/verifies the full Drive topology and recalibrates all pointers.
 * Safe to re-run at any time — all operations are idempotent.
 * Runs from the Drop Zone Doc menu or directly from the script editor.
 *
 * CI: 1.0 | Headless-safe | Idempotent
 */
function deployFullSystem() {
  const props = PropertiesService.getScriptProperties();

  // Headless UI protection — gracefully handle missing Document context
  let ui = null;
  try {
    if (DocumentApp.getActiveDocument()) {
      ui = DocumentApp.getUi();
      ui.alert('Bootstrapping KOS Architecture...');
    }
  } catch (e) {
    console.log("[deployFullSystem] Headless context. UI feedback suppressed.");
  }

  // --- 1. Build/verify root folder tree ---
  const rootFolder    = _getOrCreateFolder(CFG.SYSTEM_NAME);
  const stagingFolder = _getOrCreateFolder(CFG.STAGING_FOLDER, rootFolder);
  const graveFolder   = _getOrCreateFolder(CFG.GRAVE_FOLDER,   rootFolder);

  // --- 2. Build/verify taxonomy folders ---
  const taxonomy = {
    "ID_FOLDER_ROOT"    : rootFolder,
    "ID_FOLDER_STAGING" : stagingFolder,
    "ID_FOLDER_GRAVE"   : graveFolder,
    "ID_FOLDER_PRDS"    : _getOrCreateFolder("Lesson_Plans",       rootFolder),
    "ID_FOLDER_LESSON"  : _getOrCreateFolder("Student_Facing",     rootFolder),
    "ID_FOLDER_RUBRIC"  : _getOrCreateFolder("Assessments",        rootFolder),
    "ID_FOLDER_COMM"    : _getOrCreateFolder("Communications",     rootFolder),
    "ID_FOLDER_FLOW"    : _getOrCreateFolder("SOPs_and_Workflows", rootFolder),
    "ID_FOLDER_CODE"    : _getOrCreateFolder("Scripts",            rootFolder),
    "ID_FOLDER_VECTOR"  : _getOrCreateFolder("Vector_Repository",  rootFolder),
    "ID_00_RAW_EXHAUST" : stagingFolder   // RAW_EXHAUST maps to staging in this topology
  };

  // --- 3. Build/verify BRAIN_TRUST_INDEX spreadsheet ---
  const indexSS = _getOrCreateSpreadsheet(CFG.INDEX_NAME, rootFolder);

  // --- 4. Register all pointers safely ---
  // Does NOT wipe existing calibration data — only updates structural IDs
  props.setProperty('ID_FOLDER_ROOT',    rootFolder.getId());
  props.setProperty('ID_FOLDER_STAGING', stagingFolder.getId());
  props.setProperty('ID_00_RAW_EXHAUST', stagingFolder.getId());
  props.setProperty('ID_INDEX',          indexSS.getId());
  props.setProperty('ID_BRAIN_TRUST_INDEX', indexSS.getId()); // Both keys for compatibility

  for (const [key, folder] of Object.entries(taxonomy)) {
    if (folder && typeof folder.getId === 'function') {
      props.setProperty(key, folder.getId());
    }
  }

  console.log("[deployFullSystem] All structural IDs registered to PropertiesService.");

  // --- 5. Confirm to user ---
  if (ui) {
    ui.alert(
      '✅ SYSTEM DEPLOYED & CALIBRATED\n\n' +
      'All structural IDs have been locked into PropertiesService.\n' +
      'The system is operating as a Cold Engine.\n\n' +
      'Next step: Open CORE_THESIS and enter your thesis to activate the system.'
    );
  }
}


// ============================================================
// PART 25: masterRefineryProcess() — DROP ZONE INTAKE PIPELINE
// PURPOSE: The primary user-facing intake function. The user pastes
//          raw session logs into the Drop Zone Google Doc, then triggers
//          this function from the KOS Council menu.
//
//          Pipeline:
//            1. Read Drop Zone doc body — validate non-empty
//            2. Generate temporal UID
//            3. Create quarantined exhaust doc with UID filename
//            4. Dump text into new doc — saveAndClose() to release lock
//            5. Move quarantined doc to staging folder
//            6. Log to STAGING_PIPELINE sheet with Smart Chip link
//            7. Clear Drop Zone — print receipt with UID + link
//
// KEY PATCH FROM DOC 19:
//   saveAndClose() called BEFORE moveTo() — releases the Google file
//   lock before the Drive API move operation. Without this, moveTo()
//   intermittently throws a "file is being edited" exception.
// ============================================================

/**
 * Master intake controller. Run from the KOS Council menu in the
 * Drop Zone Doc after pasting a raw session log.
 *
 * @returns {void} Operates on the active document directly.
 */
function masterRefineryProcess() {
  let ui  = null;
  let doc = null;

  // Headless UI protection
  try {
    doc = DocumentApp.getActiveDocument();
    if (doc) ui = DocumentApp.getUi();
  } catch (e) {
    console.error("[masterRefineryProcess] Headless execution — no active Document.");
    return;
  }

  if (!doc) {
    console.error("[masterRefineryProcess] Aborted: Cannot read Drop Zone in this context.");
    return;
  }

  const body = doc.getBody();
  const text = body.getText().trim();

  // Validate: reject if empty or only the sentinel placeholder
  if (!text || (text.includes(CFG.DROP_ZONE_SENTINEL) && text.length < 100)) {
    if (ui) ui.alert(
      'System Halt',
      'No valid session log detected in the Drop Zone.\n\n' +
      'Paste your session log below the sentinel line and try again.',
      ui.ButtonSet.OK
    );
    return;
  }

  if (ui) ui.toast('Initiating Unified Intake...', 'Refinery', 3);

  const props = PropertiesService.getScriptProperties();
  const stagingFolderId = props.getProperty('ID_FOLDER_STAGING');
  const indexId         = props.getProperty('ID_BRAIN_TRUST_INDEX') ||
                          props.getProperty('ID_INDEX');

  if (!stagingFolderId || !indexId) {
    if (ui) ui.alert(
      'System Error',
      'System not calibrated. Please run "Deploy System / Recalibrate Pointers" first.',
      ui.ButtonSet.OK
    );
    return;
  }

  const stagingFolder = DriveApp.getFolderById(stagingFolderId);

  // --- STEP 1: Generate temporal UID ---
  const logUUID  = "[UID_LOG_" + new Date().getTime() + "]";
  const fileName = `${logUUID} RAW_EXHAUST`;

  // --- STEP 2: Create quarantined exhaust doc ---
  const newDoc   = DocumentApp.create(fileName);
  const newDocId = newDoc.getId();

  // --- STEP 3: Dump text FIRST, then release file lock ---
  // CRITICAL: saveAndClose() must complete before moveTo() is called.
  // Without this, Drive's file lock causes intermittent move exceptions.
  newDoc.getBody().setText(text);
  newDoc.saveAndClose();

  // --- STEP 4: Move to staging (file lock now released) ---
  const newDocFile = DriveApp.getFileById(newDocId);
  newDocFile.moveTo(stagingFolder);

  // --- STEP 5: Log to STAGING_PIPELINE with Smart Chip ---
  const indexSpreadsheet = SpreadsheetApp.openById(indexId);
  let stagingSheet = indexSpreadsheet.getSheetByName(CFG.STAGING_SHEET);

  // Idempotent sheet creation if absent
  if (!stagingSheet) {
    stagingSheet = indexSpreadsheet.insertSheet(CFG.STAGING_SHEET);
    stagingSheet.appendRow(['Timestamp', 'LOG_UUID', 'Raw_Pointer', 'Status']);
    stagingSheet.getRange('1:1')
                .setFontWeight('bold')
                .setBackground('#1e293b')
                .setFontColor('#ffffff');
    stagingSheet.setFrozenRows(1);
  }

  // Build Smart Chip rich text link (clickable in Sheets — GAP from doc 18)
  const fileUrl = _getSafeFileUrl(newDocFile, newDocId);
  const richTextLink = SpreadsheetApp.newRichTextValue()
    .setText(fileName)
    .setLinkUrl(fileUrl)
    .build();

  // Append base row with empty slot for Smart Chip, then inject
  stagingSheet.appendRow([new Date(), logUUID, "", "QUARANTINED"]);
  stagingSheet.getRange(stagingSheet.getLastRow(), 3).setRichTextValue(richTextLink);

  // --- STEP 6: Clear Drop Zone and print receipt ---
  body.clear();

  const receiptHeader = body.appendParagraph('LOG UID: ' + logUUID);
  receiptHeader.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  receiptHeader.setForegroundColor('#008000');
  receiptHeader.setBold(true);

  body.appendParagraph('Doc ID: ' + newDocId);

  const linkPara = body.appendParagraph('Generated File: 🔗 ' + fileName);
  linkPara.setLinkUrl(fileUrl);

  body.appendParagraph('Inference Pointer: ' + logUUID);
  body.appendHorizontalRule();

  const sentinel = body.appendParagraph(CFG.DROP_ZONE_SENTINEL);
  sentinel.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  sentinel.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  sentinel.setForegroundColor('#808080');

  body.appendParagraph(''); // Empty line below sentinel for next paste

  if (ui) ui.alert(
    '🚀 FULL REFINERY COMPLETE\n\n' +
    'Log successfully ingested, quarantined, and staged.\n' +
    'UID: ' + logUUID
  );

  console.log(`[masterRefineryProcess] Quarantined: ${fileName} | UID: ${logUUID}`);
}


// ============================================================
// PART 26: SMART CHIP UTILITY
// PURPOSE: Safe URL getter with Drive API fallback.
//          Doc 19 identified that file.getUrl() can glitch immediately
//          after a moveTo() — the URL temporarily returns null before
//          Drive syncs. This helper provides a constructed fallback.
// ============================================================

/**
 * Returns the URL of a Drive file safely.
 * Falls back to a constructed Drive URL if getUrl() returns null
 * (which can happen briefly after a moveTo() operation).
 *
 * @param {File}   file   - The Drive file object.
 * @param {string} fileId - The file's Drive ID (used in fallback).
 * @returns {string} A valid URL for the file.
 */
function _getSafeFileUrl(file, fileId) {
  try {
    const url = file.getUrl();
    if (url) return url;
  } catch (e) {
    // getUrl() glitched — use constructed fallback
  }
  return `https://docs.google.com/document/d/${fileId}/edit`;
}

/**
 * Upgrades a plain text URL in a sheet cell to a Smart Chip rich text link.
 * Use this to retrofit any existing ledger rows that have raw URL strings.
 *
 * @param {Sheet}  sheet    - The target sheet.
 * @param {number} row      - 1-indexed row number.
 * @param {number} col      - 1-indexed column number.
 * @param {string} linkText - The display text for the link.
 * @param {string} url      - The URL to link to.
 */
function _writeSmartChip(sheet, row, col, linkText, url) {
  const richText = SpreadsheetApp.newRichTextValue()
    .setText(linkText)
    .setLinkUrl(url)
    .build();
  sheet.getRange(row, col).setRichTextValue(richText);
}


// ============================================================
// PART 27: runSemanticSweeper_v2() — O(N) OPTIMIZED SWEEPER
// PURPOSE: Replaces the full file iteration loop in runSemanticSweeper()
//          (Chunk 4) with a server-side searchFiles() query that filters
//          by CE-tag presence and absence of existing UID stamps.
//          Dramatically faster on large Drives — Google's backend does
//          the filtering rather than GAS iterating every file in root.
//
// TO ACTIVATE: Once confirmed operational, rename the Chunk 4 version
//              to runSemanticSweeper_LEGACY() and rename this to
//              runSemanticSweeper(). Update initializeTriggers() (Chunk 5)
//              trigger function name to match.
// ============================================================

/**
 * Optimized Semantic Sweeper using server-side Drive search.
 * Finds all CE-tagged files in root that haven't been UID-stamped yet,
 * routes them to their taxonomy folders, and logs Smart Chip entries
 * to the EXECUTION_LEDGER.
 *
 * CI: 1.0 | Idempotent | O(N) optimized via searchFiles()
 */
function runSemanticSweeper_v2() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn("[Sweeper_v2] Busy. Aborting.");
    return;
  }

  try {
    const props = PropertiesService.getScriptProperties();

    // --- SERVER-SIDE SEARCH (doc 19 optimization) ---
    // Offloads the UID filter to Google's backend. Only returns files that:
    //   a) have 'CE-' in their title, AND
    //   b) do NOT already have '[UID_DOC_' in their title
    // This is O(results) instead of O(all files in root).
    const files = DriveApp.getRootFolder().searchFiles(CFG.SWEEPER_QUERY);

    // Fetch EXECUTION_LEDGER via pointer (PIVOT 004 — not by name search)
    const ss     = _getBrainTrustIndex();
    let   ledger = ss.getSheetByName(CFG.LEDGER_SHEET);

    if (!ledger) {
      ledger = ss.insertSheet(CFG.LEDGER_SHEET);
      ledger.appendRow(["UID", "TIMESTAMP", "SEMANTIC_TAG", "FILE_URL", "STATUS"]);
      ledger.getRange("A1:E1")
            .setFontWeight("bold")
            .setBackground("#1e293b")
            .setFontColor("#ffffff");
      ledger.setFrozenRows(1);
    }

    let processedCount = 0;

    while (files.hasNext()) {
      const file     = files.next();
      const fileName = file.getName();

      // --- TAG MATCHING against CFG taxonomy ---
      let matchedTag        = null;
      let targetPropertyKey = null;

      for (const [tag, propKey] of Object.entries(CFG.TAG_TO_PROP_KEY)) {
        if (fileName.startsWith(tag)) {
          matchedTag        = tag;
          targetPropertyKey = propKey;
          break;
        }
      }

      // False positive from search (no recognized CE-tag prefix) — skip
      if (!matchedTag) continue;

      const targetFolderId = props.getProperty(targetPropertyKey);
      if (!targetFolderId) {
        console.warn(`[Sweeper_v2] Routing pointer missing for tag "${matchedTag}". Run deployFullSystem().`);
        continue;
      }

      const targetFolder = DriveApp.getFolderById(targetFolderId);

      // --- UID STAMP ---
      const uid     = "[UID_DOC_" + new Date().getTime() + "]";
      const newName = `${uid} ${fileName}`;
      file.setName(newName);

      // --- MOVE TO TAXONOMY FOLDER ---
      file.moveTo(targetFolder);
      console.log(`[Sweeper_v2] ✔ Routed: ${fileName} → ${targetFolder.getName()}`);

      // --- SMART CHIP LEDGER REGISTRATION (doc 19 upgrade) ---
      const fileUrl = _getSafeFileUrl(file, file.getId());

      // Append base row with empty URL slot
      ledger.appendRow([uid, new Date(), matchedTag, "", "ROUTED"]);

      // Inject Smart Chip into the URL column (col 4)
      _writeSmartChip(ledger, ledger.getLastRow(), 4, newName, fileUrl);

      processedCount++;
      SpreadsheetApp.flush(); // Pace API calls
    }

    console.log(`[Sweeper_v2] Complete. Routed: ${processedCount} files.`);

  } catch (error) {
    console.error("[Sweeper_v2] Fault: " + error.message);

  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// PART 28: _getOrCreateSpreadsheet() — WITH FILE LOCK SYNC
// PURPOSE: Idempotent spreadsheet creation with SpreadsheetApp.flush()
//          before moveTo() to prevent race condition exceptions.
//
// ROOT CAUSE OF ORIGINAL BUG:
//   SpreadsheetApp.create() is async under the hood — it returns
//   a Spreadsheet object before Drive has fully committed the file.
//   Calling DriveApp.getFileById(ss.getId()).moveTo() immediately after
//   can throw "File not found" or "File is being edited" intermittently.
//   SpreadsheetApp.flush() forces the creation to fully sync first.
// ============================================================

/**
 * Returns an existing spreadsheet by name within a parent folder,
 * or creates and moves one if absent. (PIVOT 003 — Idempotent)
 *
 * @param {string} name         - The target spreadsheet name.
 * @param {Folder} parentFolder - The Drive folder to place it in.
 * @returns {Spreadsheet} The existing or newly created spreadsheet.
 */
function _getOrCreateSpreadsheet(name, parentFolder) {
  // Search for existing spreadsheet within the parent folder
  const files = parentFolder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(f.getId());
    }
  }

  // Not found — create, flush, then move (file lock sync patch)
  const ss = SpreadsheetApp.create(name);
  SpreadsheetApp.flush(); // CRITICAL: forces creation to fully commit before moveTo()
  DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
  return ss;
}


// ============================================================
// PART 29: CFG-AWARE CALIBRATION SETUP
// PURPOSE: Updates setupCalibration() to include the ALIGNMENT_TOLERANCE
//          key from doc 19 CFG.CALIBRATION_KEYS, and provides a
//          CFG-driven audit that checks all expected keys are present.
// ============================================================

/**
 * Verifies all calibration keys defined in CFG.CALIBRATION_KEYS are
 * present in PropertiesService. Reports missing keys explicitly.
 * Use after setupCalibration() to confirm the Calibration Wall is complete.
 */
function auditCalibrationHealth_v2() {
  const props       = PropertiesService.getScriptProperties();
  const missingKeys = [];

  CFG.CALIBRATION_KEYS.forEach(key => {
    if (!props.getProperty(key)) {
      missingKeys.push(key);
    }
  });

  if (missingKeys.length === 0) {
    console.log(`[CALIBRATION_WALL] ✅ All ${CFG.CALIBRATION_KEYS.length} keys present. System armed.`);
    CFG.CALIBRATION_KEYS.forEach(k => console.log(` - Verified: ${k}`));
  } else {
    console.warn(`[CALIBRATION_WALL] ⚠️ ${missingKeys.length} key(s) missing:`);
    missingKeys.forEach(k => console.warn(` - MISSING: ${k}`));
    console.warn("Run setupCalibration() and add ALIGNMENT_TOLERANCE before activating.");
  }
}

// ============================================================
// END CHUNK 7 of 7 — DOC19_INTEGRATIONS
//
// FULL STITCH ORDER (all 7 chunks):
//   Chunk 1 — System Config (setupRoutingProperties, Hardener, deploy v18.3, utilities)
//   Chunk 2 — Intake Pipeline (processIntakePayload, executeVectorRouting)
//   Chunk 3 — Governance Engine (onEdit original), Council Simulator (original)
//   Chunk 4 — Sweepers (runSemanticSweeper original), Consolidator, Primer
//   Chunk 5 — Deployment Engine v19.0, Sheet Initializers, Trigger Management
//   Chunk 6 — Governance fixes (onEdit corrected), CE-GRAVE, Council fix, Context Compiler
//   Chunk 7 — CFG object, onOpen menu, Drop Zone intake, Smart Chips, Sweeper v2, flush fix
//
// FUNCTION CONFLICTS TO RESOLVE BEFORE FINAL ASSEMBLY:
//   In Chunk 3:
//     Rename onEdit()                    → onEdit_DEPRECATED()
//     Rename generateCouncilInputPayload() → generateCouncilInputPayload_DEPRECATED()
//   In Chunk 4:
//     Rename runSemanticSweeper()        → runSemanticSweeper_LEGACY()
//     (once Sweeper_v2 is confirmed operational, update initializeTriggers()
//      in Chunk 5 to point to runSemanticSweeper_v2)
//   In Chunk 1:
//     CFG is now the canonical config source — string literals in
//     Chunks 1–6 that match CFG values can be gradually migrated
//     to CFG references on next refactor pass.
// ============================================================
