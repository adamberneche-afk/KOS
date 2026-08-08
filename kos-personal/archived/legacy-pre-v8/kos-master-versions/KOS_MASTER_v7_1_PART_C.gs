// ============================================================================
// KOS MASTER SCRIPT v7.0 — PART C of 3
// Paste immediately below Part B.
// ============================================================================


// ============================================================================
// SECTION 14: CALIBRATION & HARDENING (PIVOT 008)
// ============================================================================

/**
 * Injects proprietary calibration weights into PropertiesService.
 * Fill in values → Run once → Clear values from function body.
 * ⚠️  Never commit live values to source control.
 */
function setupCalibration() {
  const props = PropertiesService.getScriptProperties();
  // ── FILL IN YOUR VALUES BELOW ─────────────────────────────────────────────
  const calibrationMap = {
    'THEME_ARCHITECTURE'     : 'YOUR_WEIGHT_HERE',      // e.g. '0.85'
    'THEME_PEDAGOGY'         : 'YOUR_WEIGHT_HERE',      // e.g. '0.90'
    'THEME_FAMILY_ALIGNMENT' : 'YOUR_WEIGHT_HERE',      // e.g. '1.00'
    'SOCRATIC_THRESHOLD'     : 'YOUR_WEIGHT_HERE',      // e.g. '0.75'
    'ALIGNMENT_TOLERANCE'    : 'YOUR_WEIGHT_HERE',      // e.g. '0.80'
    'IDENTITY_KEY_SALT'      : 'YOUR_PRIVATE_STRING_HERE',
  };
  // ── CLEAR VALUES AFTER RUNNING ────────────────────────────────────────────
  props.setProperties(calibrationMap);
  console.log('[HARDENING_COMPLETE] Calibration sequestered in PropertiesService. Clear this function body now.');
}

function auditCalibrationHealth() {
  const ui      = DocumentApp.getUi();
  const status  = _getCalibrationStatus();
  const missing = CFG.CALIBRATION_KEYS.filter(
    k => !PropertiesService.getScriptProperties().getProperty(k)
  );
  if (!status.armed) {
    ui.alert('⚠ Engine COLD',
      `No calibration data found.\n\nExpected keys:\n${CFG.CALIBRATION_KEYS.map(k => '  • ' + k).join('\n')}\n\nRun setupCalibration() to arm.`,
      ui.ButtonSet.OK);
  } else {
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

/**
 * Fetches a single calibration value by key. Always use this — never read
 * props directly in business logic.
 * @param {string} key
 * @returns {string|null}
 */
function getKOSCalibration(key) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) console.error(`[CALIBRATION_ERROR] Missing key: "${key}". Engine COLD.`);
  return val || null;
}

/**
 * Full Calibration Wall security audit. Scans payload for any of four
 * vulnerability patterns. Throws on first match — aborts the calling operation.
 *
 * Pattern A — Hardcoded numeric weights (weight = 0.x)
 * Pattern B — Hardcoded threshold values (threshold = 0.x)
 * Pattern C — Exposed IDENTITY_KEY reference with an assigned value
 * Pattern D — Exposed SALT reference with an assigned value
 *
 * @param {string} payload - Any string entering the system.
 * @throws {Error} Descriptive error identifying the pattern and remediation.
 * @returns {boolean} true if payload passes all scans.
 */
function runHardeningAudit(payload) {
  if (!payload || typeof payload !== 'string') return true;
  const patterns = [
    { re: /weight\s*[:=]\s*0\.\d+/i,          label: 'Hardcoded weight value'     },
    { re: /threshold\s*[:=]\s*0\.\d+/i,       label: 'Hardcoded threshold value'  },
    { re: /IDENTITY_KEY\s*[:=]\s*['"].+['"]/,  label: 'Exposed identity key'       },
    { re: /SALT\s*[:=]\s*['"].+['"]/i,         label: 'Exposed salt string'        },
  ];
  patterns.forEach(({ re, label }) => {
    if (re.test(payload)) {
      throw new Error(
        `[VULNERABILITY_DETECTED] ${label} found in payload. ` +
        'Aborted per PIVOT 008 (Calibration Wall). ' +
        'Move this value to PropertiesService via setupCalibration().'
      );
    }
  });
  return true;
}


// ============================================================================
// SECTION 15: CONTEXT COMPILER (SMP-001 Phase B)
// Queries MATRIX_LEDGER with three-band thresholds.
// GAS builds the structure — no LLM inference on quantitative data.
// Math-Before-Muse Mandate.
// ============================================================================

/**
 * Compiles a Vector Primer for each known vector column in MATRIX_LEDGER.
 * Three bands per SMP-001:
 *   Core    >= 0.8 : Full session summaries (primary knowledge nodes)
 *   Context 0.5–0.79: Next steps / action items
 *   Ghost   0.1–0.49: Metadata tags (preserves cross-references)
 *
 * Overwrites [VECTOR_NAME]_PRIMER.gdoc in 05_Vector_Repository.
 * @returns {{ status, compiledCount }|{ status, message }}
 */
function compileVectorPrimers() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    ui.alert('Context Compiler Busy', 'Could not acquire lock. Try again.', ui.ButtonSet.OK);
    return { status: 'LOCKED' };
  }
  try {
    const vectorFolderId = PropertiesService.getScriptProperties().getProperty('ID_05_VECTOR_REPOSITORY');
    if (!vectorFolderId) throw new Error('ID_05_VECTOR_REPOSITORY missing. Run setupRoutingProperties().');

    const ss     = _getBrainTrustIndex();
    const matrix = ss.getSheetByName(CFG.MATRIX_LEDGER_SHEET);
    if (!matrix) {
      ui.alert('Matrix Not Found',
        'MATRIX_LEDGER tab missing. Run Phase 4 at least once to populate it.',
        ui.ButtonSet.OK);
      return { status: 'NO_MATRIX' };
    }

    const rows        = matrix.getDataRange().getValues();
    const headers     = rows.shift();
    const vectorCols  = headers.slice(2); // Skip SESSION_UID and TIMESTAMP
    const vectorFolder = DriveApp.getFolderById(vectorFolderId);
    let   compiled    = 0;

    vectorCols.forEach((vectorName, offset) => {
      const colIdx   = offset + 2;
      const core     = [], context = [], ghost = [];

      rows.forEach(row => {
        const w = parseFloat(row[colIdx]);
        if (isNaN(w) || w < 0.1) return;
        const entry = { uid: row[0], ts: row[1], weight: w };
        if      (w >= 0.8) core.push(entry);
        else if (w >= 0.5) context.push(entry);
        else               ghost.push(entry);
      });

      if (!core.length && !context.length && !ghost.length) return;

      const desc = (a, b) => b.weight - a.weight;
      core.sort(desc); context.sort(desc); ghost.sort(desc);

      let md = `# VECTOR PRIMER: ${vectorName}\nGenerated: ${new Date().toLocaleString()}\n\n`;

      if (core.length) {
        md += `## CORE (≥ 0.8) — ${core.length} session(s)\n*Full summaries — primary knowledge nodes*\n\n`;
        core.forEach(e => {
          md += `### ${e.uid} | Weight: ${e.weight}\n*${e.ts}*\n[Retrieve full summary from VECTOR_${vectorName}.gdoc]\n\n`;
        });
      }
      if (context.length) {
        md += `## CONTEXT (0.5–0.79) — ${context.length} session(s)\n*Next steps and action items*\n\n`;
        context.forEach(e => { md += `- ${e.uid} (${e.weight}) | ${e.ts}\n`; });
        md += '\n';
      }
      if (ghost.length) {
        md += `## GHOST VECTORS (0.1–0.49) — ${ghost.length} session(s)\n*Cross-reference tags*\n\n`;
        ghost.forEach(e => { md += `- [${e.uid}] Weight: ${e.weight}\n`; });
        md += '\n';
      }

      // Idempotent overwrite of [VECTOR_NAME]_PRIMER.gdoc
      const primerDoc = _getOrCreateDoc(`${vectorName}_PRIMER`, vectorFolder);
      primerDoc.getBody().clear();
      primerDoc.getBody().setText(md);
      console.log(`[ContextCompiler] ${vectorName}_PRIMER — Core:${core.length} Context:${context.length} Ghost:${ghost.length}`);
      compiled++;
    });

    ui.alert('✅ Context Compiler Complete', `Compiled ${compiled} Vector Primer(s).`, ui.ButtonSet.OK);
    return { status: 'SUCCESS', compiledCount: compiled };
  } catch (e) {
    ui.alert('❌ Context Compiler Failed', e.toString(), ui.ButtonSet.OK);
    return { status: 'ERROR', message: e.message };
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// SECTION 16: STARTUP PRIMER
// Fetches SESSION_VECTOR_PRIMER and formats for LLM system prompt injection.
// ============================================================================

function getStartupPrimer() {
  const ui  = DocumentApp.getUi();
  const raw = PropertiesService.getScriptProperties().getProperty('SESSION_VECTOR_PRIMER');
  if (!raw) {
    ui.alert('No Primer Found',
      'Run Phase 3 (Consolidate Inference) after processing chunks.',
      ui.ButtonSet.OK);
    return '';
  }
  try {
    const primer = JSON.parse(raw);
    const lines  = Object.entries(primer.vector_weights || {})
                         .map(([k, v]) => `  ${k.padEnd(25)} ${v}`);
    const block =
      `[🧠 RTP — STARTUP PRIMER]\n` +
      `Consolidated: ${primer.consolidated_at}\n` +
      `Chunks: ${primer.chunk_count}\n\n` +
      `VECTOR_WEIGHTS:\n${lines.join('\n')}\n\n` +
      `[END PRIMER — Inject at top of next Gem session]`;
    ui.alert('SESSION_VECTOR_PRIMER', block, ui.ButtonSet.OK);
    return block;
  } catch (e) {
    ui.alert('Primer Parse Error', e.toString(), ui.ButtonSet.OK);
    return '';
  }
}


// ============================================================================
// SECTION 17: SEVEN BRIDGES REVIEW (SMP-002 STUB)
// ============================================================================

function sevenBridgesReview() {
  DocumentApp.getUi().alert(
    '🌉 SMP-002: Seven Bridges Reconciliation Protocol',
    'Status: PENDING USER APPROVAL\n\n' +
    '3/7 TRIGGER: 3+ non-APPROVED verdicts halt execution.\n' +
    'BRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog\'s verdict is VOID.\n\n' +
    'To approve:\n1. Open SMP-002 in 01.3_SMP_PROPOSALS\n2. Update Status to APPROVED\n3. Notify Developer to build execution layer.',
    DocumentApp.getUi().ButtonSet.OK
  );
}


// ============================================================================
// SECTION 18: ADMIN
// ============================================================================

/**
 * Clears all routing pointer keys from PropertiesService while PRESERVING
 * calibration keys. Use when folders are manually moved — next run re-indexes.
 */
function resetProperties() {
  const props = PropertiesService.getScriptProperties();
  // Save calibration data before wipe
  const saved = {};
  CFG.CALIBRATION_KEYS.forEach(k => {
    const v = props.getProperty(k);
    if (v) saved[k] = v;
  });
  props.deleteAllProperties();
  if (Object.keys(saved).length > 0) props.setProperties(saved);

  try {
    DocumentApp.getUi().toast(
      'Routing pointer cache cleared. Calibration keys preserved. Next run will re-index.',
      'System Reset', 5
    );
  } catch (e) {
    console.log('[resetProperties] Complete — calibration preserved, routing cleared.');
  }
}

/**
 * Wipes ALL PropertiesService data including calibration.
 * Use for open-source release preparation only. ⚠️  IRREVERSIBLE.
 */
function nuclearWipeForRelease() {
  const ui      = DocumentApp.getUi();
  const confirm = ui.alert(
    '☢ NUCLEAR WIPE',
    'Permanently deletes ALL PropertiesService data:\n• Calibration keys\n• Folder/doc ID caches\n• SESSION_VECTOR_PRIMER\n\nIrreversible.\n\nProceed?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteAllProperties();
  ui.alert('✅ Clean Sweep', 'All IP wiped. Re-run Deploy + setupCalibration() to restore.', ui.ButtonSet.OK);
}

/**
 * Programs time-driven triggers for background sweeper operations.
 * Idempotent — checks for existing triggers before creating.
 * Run once after Deploy as an optional step (sweepers also work via menu).
 */
function initializeTriggers() {
  const existing = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

  function wire(fnName, minutes) {
    if (existing.includes(fnName)) {
      console.log(`[Triggers] Already exists: ${fnName}`);
      return;
    }
    ScriptApp.newTrigger(fnName).timeBased().everyMinutes(minutes).create();
    console.log(`[Triggers] Wired: ${fnName} — every ${minutes} min`);
  }

  wire('runSemanticSweeper', 15);
  wire('sweepRootForExhaust', 15);
  console.log('[Triggers] All sweeper triggers initialized.');
}

function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log('[Triggers] All project triggers removed.');
}

/**
 * Formally deprecates a Drive file:
 *   1. Renames with CE-GRAVE: prefix and DEPRECATED date stamp
 *   2. Moves to 04.8_COG_GRAVEYARD
 *   3. Logs the action to EXECUTION_LEDGER
 *
 * The Sweeper will also handle any CE-GRAVE: tagged file that appears
 * in Drive root automatically — this helper is for programmatic deprecation.
 *
 * @param {string} fileId - Drive ID of the file to deprecate.
 * @param {string} reason - Plain-language reason for deprecation.
 * @returns {boolean} true on success.
 */
function deprecateFile(fileId, reason) {
  const graveFolderId = PropertiesService.getScriptProperties().getProperty('ID_04_8_GRAVEYARD');
  if (!graveFolderId) {
    throw new Error('ID_04_8_GRAVEYARD missing. Run deployFullSystem() or setupRoutingProperties().');
  }

  const file         = DriveApp.getFileById(fileId);
  const originalName = file.getName();
  const date         = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const graveName    = `CE-GRAVE: ${originalName} [DEPRECATED ${date}]`;

  file.setName(graveName);
  file.moveTo(DriveApp.getFolderById(graveFolderId));

  // Log to EXECUTION_LEDGER
  try {
    const ss     = _getBrainTrustIndex();
    const ledger = _getOrCreateSheet(ss, CFG.EXECUTION_LEDGER_SHEET);
    const url    = _getSafeFileUrl(file, fileId);
    ledger.appendRow(['[DEPRECATED]', new Date(), 'CE-GRAVE:', url, `DEPRECATED: ${reason}`, '']);
  } catch (e) {
    console.warn('[deprecateFile] Could not log to EXECUTION_LEDGER: ' + e.message);
  }

  console.log(`[deprecateFile] ${originalName} → ${graveName}`);
  return true;
}

/**
 * Non-throwing folder search within a parent. Returns null if not found.
 * Used for conditional existence checks without try/catch overhead.
 * @param {string} name
 * @param {Folder} parent
 * @returns {Folder|null}
 */
function _findFolder(name, parent) {
  if (!parent) return null;
  const iter = parent.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : null;
}


// ============================================================================
// SECTION 19: CORE UTILITIES
// All _getOrCreate helpers, pointer accessors, Smart Chip writers,
// UUID generator, and sheet initializers. Pure infrastructure — no business logic.
// ============================================================================

/**
 * Content-hash-based UUID generator. Bakes an 8-char MD5 fingerprint into
 * the UID so deduplication is intrinsic to the ID structure.
 * @param {string} text - Raw log text to fingerprint.
 * @returns {string} LOG-{timestamp}-{8-char-hash}
 */
function _generateLogUUID(text) {
  const ts   = new Date().getTime();
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
    .map(val => (val < 0 ? val + 256 : val).toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 8);
  return `LOG-${ts}-${hash}`;
}

/**
 * Returns existing Google Doc in folder or creates one. (PIVOT 003)
 * @param {string} docName
 * @param {Folder} folder
 * @returns {Document}
 */
function _getOrCreateDoc(docName, folder) {
  const existing = folder.getFilesByName(docName);
  if (existing.hasNext()) return DocumentApp.openById(existing.next().getId());
  const doc  = DocumentApp.create(docName);
  DriveApp.getFileById(doc.getId()).moveTo(folder);
  return doc;
}

/**
 * Returns existing folder by name within optional parent, or creates one. (PIVOT 003)
 * @param {string} name
 * @param {Folder} [parent]
 * @returns {Folder}
 */
function _getOrCreateFolder(name, parent) {
  const p        = parent || DriveApp.getRootFolder();
  const existing = p.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : p.createFolder(name);
}

/**
 * Returns existing spreadsheet by name in folder, or creates and moves one.
 * SpreadsheetApp.flush() before moveTo() prevents file-lock race condition. (PIVOT 003)
 * @param {string} name
 * @param {Folder} parentFolder
 * @returns {Spreadsheet}
 */
function _getOrCreateSpreadsheet(name, parentFolder) {
  const files = parentFolder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId());
  }
  const ss = SpreadsheetApp.create(name);
  SpreadsheetApp.flush(); // Critical: forces creation to sync before moveTo()
  DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
  return ss;
}

/**
 * Self-healing pointer lookup. Tries PropertiesService first, falls back to
 * Drive name search, auto-updates the cached ID on fallback success.
 * @param {string}  name    - Human-readable asset name (for Drive search fallback).
 * @param {string}  propKey - PropertiesService key to try first.
 * @param {boolean} isFolder
 * @returns {Folder|Spreadsheet}
 * @throws {Error} If asset cannot be found by either method.
 */
function _getSystemAsset(name, propKey, isFolder) {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty(propKey);
  if (id) {
    try {
      const asset = isFolder ? DriveApp.getFolderById(id) : SpreadsheetApp.openById(id);
      return asset; // Happy path — pointer is fresh
    } catch (e) {
      console.warn(`[_getSystemAsset] Stale pointer for ${propKey} — falling back to Drive search.`);
    }
  }
  // Fallback: Drive name search (self-heals stale pointer)
  const iter = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
  if (!iter.hasNext()) {
    throw new Error(`Asset Not Found: "${name}"\n\nRun 🚀 Deploy → Deploy Full System first.`);
  }
  const found = iter.next();
  const newId = found.getId();
  props.setProperty(propKey, newId); // Auto-update stale pointer
  return isFolder ? found : SpreadsheetApp.openById(newId);
}

/**
 * Returns BRAIN_TRUST_INDEX via pointer. Supports both INDEX_ID and
 * ID_BRAIN_TRUST_INDEX keys for cross-version compatibility. (PIVOT 004)
 * @returns {Spreadsheet}
 * @throws {Error} If neither pointer key is registered.
 */
function _getBrainTrustIndex() {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty('INDEX_ID') || props.getProperty('ID_BRAIN_TRUST_INDEX');
  if (!id) {
    throw new Error('INDEX_ID missing. Run 🚀 Deploy → Deploy Full System.');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Returns file URL safely. Constructs fallback URL if getUrl() returns null
 * (can occur briefly after moveTo() before Drive syncs).
 * @param {File}   file
 * @param {string} fileId
 * @returns {string}
 */
function _getSafeFileUrl(file, fileId) {
  try {
    const url = file.getUrl();
    if (url) return url;
  } catch (e) { /* API glitch post-move — use constructed fallback */ }
  return `https://docs.google.com/document/d/${fileId}/edit`;
}

/**
 * Writes a Smart Chip rich text hyperlink into a sheet cell.
 * @param {Sheet}  sheet
 * @param {number} row      - 1-indexed
 * @param {number} col      - 1-indexed
 * @param {string} linkText
 * @param {string} url
 */
function _writeSmartChip(sheet, row, col, linkText, url) {
  sheet.getRange(row, col).setRichTextValue(
    SpreadsheetApp.newRichTextValue().setText(linkText).setLinkUrl(url).build()
  );
}

/**
 * Creates or returns a sheet tab with predefined headers. (PIVOT 003)
 * Uses a canonical headerMap so column schemas are consistent system-wide.
 * @param {Spreadsheet} ss
 * @param {string}      sheetName
 * @returns {Sheet}
 */
function _getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headerMap = {
      // v7.2 schema: chunk tracking rows — no text payload in sheet
      // Col A: Timestamp  B: Chunk_ID  C: Smart_Chip_URL  D: File_ID  E: Status
      [CFG.STAGING_SHEET]         : ['Timestamp', 'Chunk_ID', 'Doc_Link', 'File_ID', 'Status'],
      [CFG.EXECUTION_LEDGER_SHEET]: ['UID', 'TIMESTAMP', 'SEMANTIC_TAG', 'FILE_URL', 'STATUS', 'ATTEMPT_TRACKER'],
      // Inference_Buffer retired in v7.2 — preserved here as a no-op for backward compat
      'Inference_Buffer'          : ['Timestamp', 'Session_ID', 'Chunk_ID', 'Inference_Payload', 'Status'],
      [CFG.MATRIX_LEDGER_SHEET]   : ['Session_UID', 'Timestamp', 'ARCHITECTURE', 'UI', 'SECURITY', 'PEDAGOGY', 'TOTAL'],
      [CFG.BLACKBOARD_SHEET]      : ['Target_Doc_ID', 'CE_Tag', 'Doc_Title', 'Version', 'Find_String', 'Replace_Payload', 'Alt_Doc_ID', 'Notes', 'Filed_By', 'Filed_Date', 'Status', 'Deploy_Trigger'],
    };
    const headers = headerMap[sheetName] || ['Timestamp', 'Data'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
         .setFontWeight('bold')
         .setBackground('#1e293b')
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    // Blackboard: set Column L (12) as checkboxes
    if (sheetName === CFG.BLACKBOARD_SHEET) {
      sheet.getRange('L2:L1000').insertCheckboxes();
    }
  }
  return sheet;
}

// ============================================================================
// END OF KOS MASTER SCRIPT v7.0
//
// PASTE ORDER:
//   1. Part A — Config, menus, deploy engine, folder taxonomy, doc scaffolding
//   2. Part B — Pipeline phases 1–4, governance engine, council simulator, sweepers
//   3. Part C — Calibration, context compiler, primer, admin, all utilities
//
// POST-PASTE CHECKLIST:
//   [ ] Paste Parts A → B → C → D in order. Save in Apps Script editor.
//   [ ] Open DROP_ZONE Google Doc → 🚀 Deploy → Deploy Full System
//   [ ] Fill in setupCalibration() → Run → Clear values from function body
//   [ ] 🧠 Council → Setup Governance Trigger
//   [ ] 🧠 Council → Activate HITL Firewall
//   [ ] Open CORE_THESIS in 01_Canonical_Foundation → write your actual thesis
//   [ ] 🧠 Council → Generate Identity Key
//   [ ] 🧠 Council → Full Engine Status Audit — confirm all layers ARMED
//   [ ] Open START_HERE_GEM_SETUP → configure Gemini Gem
//
// SESSION INTAKE WORKFLOW (v7.2 — doc-based chunking):
//   [ ] Paste session log into DROP_ZONE
//   [ ] 🧠 Council → Process Session Log → Chunk → Queue (Phase 1)
//       └─ Creates one chunk doc per chunk in 03.4_RAW_EXHAUST
//       └─ Logs lightweight tracking rows to STAGING_PIPELINE (Smart Chip + File_ID, no text)
//   [ ] 🧠 Council → Review Chunks for Curator (Phase 1.5)
//       └─ Shows all PENDING_INFERENCE rows with links to chunk docs
//   [ ] For each chunk doc (open via Smart Chip in STAGING_PIPELINE Col C):
//       └─ Copy the chunk text below the horizontal rule
//       └─ Send to Curator Gem → receive JSON back
//       └─ Paste the JSON at the bottom of the same chunk doc
//       └─ Set STAGING_PIPELINE Col E = BUFFERED for that row
//   [ ] 🧠 Council → Process Intake Payloads (Phase 4)
//       └─ Reads each BUFFERED row, opens chunk doc by File_ID
//       └─ Extracts last JSON block from doc body
//       └─ Writes to CURRENT_STATE, PIVOTS_AND_LESSONS, MATRIX_LEDGER
//       └─ Moves processed doc to 03.3_PROCESSED_EXHAUST
//   [ ] 🧠 Council → Consolidate Inference (Phase 3) → Get Startup Primer
// ============================================================================
