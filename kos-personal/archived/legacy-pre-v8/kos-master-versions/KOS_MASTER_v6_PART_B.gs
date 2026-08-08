// ============================================================================
// KOS MASTER SCRIPT v6.0 — PART B of 2
// Paste this immediately below Part A.
// ============================================================================


// ============================================================================
// SECTION 7: GOVERNANCE ENGINE (CI/CD PIPELINE)
// HITL gate: human checks a checkbox in the Blackboard sheet to trigger
// document mutations. Strict match rule — never guesses.
//
// Blackboard schema (1-indexed columns):
//   A  Target_Doc_ID     — Drive ID of document to mutate
//   B  Version
//   C  CE-TAG
//   D  Document_Name
//   E  Modification_Desc
//   F  Author_Persona
//   G  Target_UID        — alternate doc ID (v1.2 schema)
//   H  Mutation_Type     — APPEND_BOTTOM | FIND_REPLACE | CREATE_NEW
//   I  Find_String
//   J  Replace_Payload
//   K  Deployment_Status — written by script
//   L  Deploy_Trigger    — checkbox: human checks to approve
// ============================================================================

/**
 * Governance Engine onEdit trigger.
 * Fires when the Deploy_Trigger checkbox (Column L) is checked in the
 * Blackboard or any CE-LOG sheet. Reads the execution packet, audits
 * the payload, routes by mutation type, writes status to Column K.
 *
 * @param {Object} e - Apps Script onEdit event.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.source.getActiveSheet();
  const row   = e.range.getRow();
  const col   = e.range.getColumn();

  const isTargetSheet = sheet.getName() === CFG.BLACKBOARD_SHEET ||
                        sheet.getName().indexOf("CE-LOG") !== -1;

  if (!isTargetSheet || col !== 12 || e.range.getValue() !== true || row <= 1) return;

  try {
    const data         = sheet.getRange(row, 1, 1, 11).getValues()[0];
    const docId        = data[0] || data[6];   // Col A primary, Col G alternate
    const mutationType = data[7];              // Col H
    const searchTag    = data[8];              // Col I
    const payload      = data[9];              // Col J

    runHardeningAudit(payload);

    let success = false;
    if      (mutationType === "CREATE_NEW")    success = _handleCreateNew(payload, data);
    else if (mutationType === "APPEND_BOTTOM") success = _handleAppendBottom(docId, payload);
    else                                       success = applyMutation(docId, searchTag, payload);

    if (success) {
      sheet.getRange(row, 11).setValue("DEPLOYED: " + new Date().toLocaleString());
      sheet.getRange(row, 12).setValue(false);
      SpreadsheetApp.getActiveSpreadsheet().toast("Mutation Deployed.", "Governance Engine", 5);
    }
  } catch (err) {
    sheet.getRange(row, 11).setValue("FAILED: " + err.message);
    sheet.getRange(row, 12).setValue(false);
    SpreadsheetApp.getActiveSpreadsheet().toast("Mutation Failed. Check Status.", "System Alert", 10);
  }
}

/**
 * Scans payload for hardcoded logic weight patterns (PIVOT 008).
 * Throws if a vulnerability is detected — aborts deployment.
 * @param {string} payload
 */
function runHardeningAudit(payload) {
  if (/weight\s*[:=]\s*0\.\d+/i.test(payload)) {
    throw new Error("[VULNERABILITY] Hardcoded logic weights detected. Deployment ABORTED.");
  }
  return true;
}

/**
 * Executes FIND_REPLACE mutation. Strict match — throws if string not found.
 * @param {string} docId
 * @param {string} searchTag
 * @param {string} payload
 * @returns {boolean}
 */
function applyMutation(docId, searchTag, payload) {
  if (!docId || !searchTag) throw new Error("Missing Doc ID or Find_String.");
  const body         = DocumentApp.openById(docId).getBody();
  const rangeElement = body.findText(searchTag);
  if (!rangeElement) {
    throw new Error(`Strict Match Failed: "${searchTag}" not found. Cannot guess.`);
  }
  rangeElement.getElement().asText().replaceText(searchTag, payload);
  return true;
}

/**
 * Executes CREATE_NEW mutation — creates a doc in the taxonomy folder
 * matching the row's CE-TAG.
 * @param {string} payload  - New document name.
 * @param {Array}  rowData  - Full row data (zero-indexed).
 * @returns {boolean}
 */
function _handleCreateNew(payload, rowData) {
  const ceTag    = rowData[2];
  const propKey  = CFG.TAG_TO_PROP_KEY[ceTag + ":"] || CFG.TAG_TO_PROP_KEY[ceTag];
  if (!propKey) throw new Error(`CREATE_NEW: Unrecognized CE-TAG "${ceTag}".`);

  const folderId = PropertiesService.getScriptProperties().getProperty(propKey);
  if (!folderId) throw new Error(`CREATE_NEW: Pointer missing for ${propKey}. Run deployFullSystem().`);

  _getOrCreateDoc(payload, DriveApp.getFolderById(folderId));
  console.log(`[CREATE_NEW] Created: ${payload}`);
  return true;
}

/**
 * Executes APPEND_BOTTOM mutation — appends payload to end of document.
 * @param {string} docId
 * @param {string} payload
 * @returns {boolean}
 */
function _handleAppendBottom(docId, payload) {
  if (!docId) throw new Error("APPEND_BOTTOM: Missing Target_Doc_ID.");
  DocumentApp.openById(docId).getBody().appendParagraph(
    `\n[Appended: ${new Date().toLocaleString()}]\n` + payload
  );
  return true;
}


// ============================================================================
// SECTION 8: COUNCIL SIMULATOR
// Generates a structured prompt document for Workspace Studio inference.
// Differential read logic prevents redundant payload generation.
// ============================================================================

/**
 * Reads CURRENT_STATE and PIVOTS_AND_LESSONS, assembles a structured
 * inference prompt document, and routes it to the RAW_EXHAUST staging folder.
 * Only fires if CURRENT_STATE has been updated since the last run.
 * Output doc is prefixed with "CE:" so the Sweeper routes it automatically.
 *
 * @returns {Object} { status, docName|message }
 */
function generateCouncilInputPayload() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { status: "LOCKED", message: "System busy." };

  try {
    const props           = PropertiesService.getScriptProperties();
    const stateId         = props.getProperty("ID_CURRENT_STATE");
    const pivotId         = props.getProperty("ID_PIVOTS_AND_LESSONS");
    const exhaustFolderId = props.getProperty("ID_00_RAW_EXHAUST");

    if (!stateId || !pivotId || !exhaustFolderId) {
      throw new Error("Architectural Fault: Core pointers missing. Run deployFullSystem().");
    }

    // Differential read — skip if CURRENT_STATE unchanged since last run
    const stateFile   = DriveApp.getFileById(stateId);
    const lastRunTime = parseInt(props.getProperty("COUNCIL_LAST_RUN") || "0", 10);
    if (stateFile.getLastUpdated().getTime() <= lastRunTime) {
      console.log("[Council] System stasis — no new exhaust. Sleeping.");
      return { status: "SLEEPING", message: "No new data." };
    }

    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

    // "CE:" prefix ensures the Sweeper routes this to RAW_EXHAUST
    const docName    = "CE: COUNCIL_PAYLOAD_" + timestamp;
    const payloadDoc = DocumentApp.create(docName);
    const body       = payloadDoc.getBody();

    body.appendParagraph("[🧠 RTP COUNCIL INITIATION STUB]")
        .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`System State: ${timestamp}\n`);
    body.appendParagraph("1. THE CONTEXT (Recent Session Summary)")
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(stateText + "\n");
    body.appendParagraph("2. THE LAWS (Active Constraints)")
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(pivotText + "\n");
    body.appendParagraph("3. INFERENCE INSTRUCTIONS FOR WORKSPACE STUDIO")
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(
      "Using the attached Persona files, act as the Architect, Auditor, and Muse. " +
      "Evaluate the Context against the Laws. Output using: " +
      "[🏗 ARCHITECT FLAG], [⚖️ AUDITOR FLAG], [✨ MUSE FLAG]."
    ).setBold(true);
    payloadDoc.saveAndClose();

    DriveApp.getFileById(payloadDoc.getId())
            .moveTo(DriveApp.getFolderById(exhaustFolderId));

    props.setProperty("COUNCIL_LAST_RUN", new Date().getTime().toString());
    console.log(`[Council] Payload generated: ${docName}`);
    return { status: "SUCCESS", docName };

  } catch (error) {
    console.error("[Council] Fault: " + error.message);
    return { status: "ERROR", message: error.message };
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// SECTION 9: SEMANTIC SWEEPER (v2 — O(N) Optimized)
// Uses server-side searchFiles() to filter CE-tagged files at Google's
// backend — dramatically faster than iterating all files in root.
// Stamps UID, routes to taxonomy folder, logs Smart Chip to EXECUTION_LEDGER.
// ============================================================================

/**
 * Scans Drive root for CE-tagged, un-stamped files.
 * For each match: stamps a temporal UID, routes to taxonomy folder,
 * logs a Smart Chip entry to EXECUTION_LEDGER via pointer-safe index access.
 *
 * Trigger: every 15 minutes (set by initializeTriggers).
 */
function runSemanticSweeper() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { console.warn("[Sweeper] Busy."); return; }

  try {
    const props = PropertiesService.getScriptProperties();

    // Server-side filter — only pulls CE-tagged files without existing UIDs
    const files = DriveApp.getRootFolder().searchFiles(CFG.SWEEPER_QUERY);

    const ss     = _getBrainTrustIndex();
    let   ledger = ss.getSheetByName(CFG.LEDGER_SHEET);
    if (!ledger) {
      ledger = ss.insertSheet(CFG.LEDGER_SHEET);
      ledger.appendRow(["UID", "TIMESTAMP", "SEMANTIC_TAG", "FILE_URL", "STATUS"]);
      ledger.getRange("A1:E1").setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
      ledger.setFrozenRows(1);
    }

    let processedCount = 0;

    while (files.hasNext()) {
      const file     = files.next();
      const fileName = file.getName();

      // Match CE-tag prefix against canonical taxonomy
      let matchedTag = null, targetPropKey = null;
      for (const [tag, propKey] of Object.entries(CFG.TAG_TO_PROP_KEY)) {
        if (fileName.startsWith(tag)) { matchedTag = tag; targetPropKey = propKey; break; }
      }
      if (!matchedTag) continue;

      const targetFolderId = props.getProperty(targetPropKey);
      if (!targetFolderId) {
        console.warn(`[Sweeper] Pointer missing for "${matchedTag}". Run deployFullSystem().`);
        continue;
      }

      // Stamp UID and route
      const uid     = "[UID_DOC_" + new Date().getTime() + "]";
      const newName = `${uid} ${fileName}`;
      file.setName(newName);
      file.moveTo(DriveApp.getFolderById(targetFolderId));
      console.log(`[Sweeper] ✔ ${fileName} → ${targetFolderId}`);

      // Log Smart Chip to EXECUTION_LEDGER
      const fileUrl = _getSafeFileUrl(file, file.getId());
      ledger.appendRow([uid, new Date(), matchedTag, "", "ROUTED"]);
      _writeSmartChip(ledger, ledger.getLastRow(), 4, newName, fileUrl);

      processedCount++;
      SpreadsheetApp.flush();
    }

    console.log(`[Sweeper] Complete — routed ${processedCount} files.`);
  } catch (error) {
    console.error("[Sweeper] Fault: " + error.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Narrower sweeper — Google Docs with "CE:" in filename only.
 * Routes to RAW_EXHAUST trigger zone for Workspace Studio pickup.
 * Trigger: every 15 minutes (set by initializeTriggers).
 */
function sweepRootForExhaust() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;

  try {
    const props           = PropertiesService.getScriptProperties();
    const exhaustFolderId = props.getProperty("ID_00_RAW_EXHAUST");
    if (!exhaustFolderId) {
      console.error("[ExhaustSweeper] ID_00_RAW_EXHAUST missing. Run deployFullSystem().");
      return;
    }
    const exhaustFolder = DriveApp.getFolderById(exhaustFolderId);
    const looseDocs     = DriveApp.getRootFolder().getFilesByType(MimeType.GOOGLE_DOCS);
    let   count         = 0;

    while (looseDocs.hasNext()) {
      const file = looseDocs.next();
      const name = file.getName();
      if (name.indexOf("UID_") === -1 && name.indexOf("CE:") !== -1) {
        file.setName(`[UID_RAW_${new Date().getTime()}] ${name}`);
        file.moveTo(exhaustFolder);
        count++;
        SpreadsheetApp.flush();
      }
    }

    if (count > 0) console.log(`[ExhaustSweeper] Swept ${count} CE doc(s) to trigger zone.`);
  } catch (e) {
    console.error("[ExhaustSweeper] Fault: " + e.message);
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// SECTION 10: DEPRECATION PROTOCOL (CE-GRAVE)
// Formal deprecation: rename with CE-GRAVE prefix, move to archive folder,
// log to EXECUTION_LEDGER.
// ============================================================================

/**
 * Formally deprecates a Drive file by renaming it with CE-GRAVE: prefix,
 * moving it to the archive folder, and logging the action.
 *
 * @param {string} fileId - Drive ID of the file to deprecate.
 * @param {string} reason - Reason for deprecation.
 * @returns {boolean}
 */
function deprecateFile(fileId, reason) {
  const graveFolderId = PropertiesService.getScriptProperties().getProperty("ID_FOLDER_GRAVE");
  if (!graveFolderId) throw new Error("ID_FOLDER_GRAVE missing. Run deployFullSystem().");

  const file         = DriveApp.getFileById(fileId);
  const originalName = file.getName();
  const date         = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const graveName    = `CE-GRAVE: ${originalName} [DEPRECATED ${date}]`;

  file.setName(graveName);
  file.moveTo(DriveApp.getFolderById(graveFolderId));

  try {
    const ss     = _getBrainTrustIndex();
    const ledger = ss.getSheetByName(CFG.LEDGER_SHEET);
    if (ledger) {
      ledger.appendRow(["[DEPRECATED]", new Date(), "CE-GRAVE:", file.getUrl(), `DEPRECATED: ${reason}`]);
    }
  } catch (e) {
    console.warn("[Deprecate] Could not log to EXECUTION_LEDGER: " + e.message);
  }

  console.log(`[Deprecate] ${originalName} → ${graveName}`);
  return true;
}


// ============================================================================
// SECTION 11: CONSOLIDATOR & STARTUP PRIMER
// Averages chunked inference weights, sequesters result as SESSION_VECTOR_PRIMER.
// [PRE-SMP] — superseded by Vector_Router.gs once SMP is deployed.
// ============================================================================

/**
 * Reads all BUFFERED rows from Inference_Buffer, averages vector weights
 * across chunks, and sequesters the result in PropertiesService.
 * [PRE-SMP] Simple mean — replaced by Vector_Router.gs sentence-level formula.
 *
 * @returns {Object|null} Final primer object, or null if no chunks.
 */
function consolidateInferenceChunks() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss ? ss.getSheetByName(CFG.BUFFER_SHEET) : null;

  if (!sheet) {
    console.warn("[Consolidator] Inference_Buffer not found.");
    return null;
  }

  const data    = sheet.getDataRange().getValues();
  data.shift(); // Remove header

  let aggregated = {};
  let chunkCount = 0;

  data.forEach((row, i) => {
    if (row[4] !== "BUFFERED") return;
    try {
      const weights = JSON.parse(row[3]).weights;
      for (const theme in weights) {
        aggregated[theme] = (aggregated[theme] || 0) + parseFloat(weights[theme]);
      }
      chunkCount++;
      sheet.getRange(i + 2, 5).setValue("CONSOLIDATED");
    } catch (e) {
      console.error(`[Consolidator] Parse failed at row ${i + 2}`);
    }
  });

  if (chunkCount === 0) return null;

  const primer = {};
  for (const theme in aggregated) {
    primer[theme] = (aggregated[theme] / chunkCount).toFixed(2);
  }

  PropertiesService.getScriptProperties().setProperty('SESSION_VECTOR_PRIMER', JSON.stringify(primer));
  console.log("[Consolidator] Primer calculated: " + JSON.stringify(primer));
  return primer;
}

/**
 * Fetches SESSION_VECTOR_PRIMER and formats it for LLM system prompt injection.
 * @returns {string} Calibration block, or empty string if cold.
 */
function getStartupPrimer() {
  const raw = PropertiesService.getScriptProperties().getProperty('SESSION_VECTOR_PRIMER');
  if (!raw) { console.log("[Primer] Cold start — no primer found."); return ""; }

  try {
    const weights = JSON.parse(raw);
    let block = "\n\n[SYSTEM_CALIBRATION_DATA]\nCurrent Cognitive Weights (Vector Primer):\n";
    for (const theme in weights) block += `- ${theme}: ${weights[theme]}\n`;
    return block + "[END_CALIBRATION]";
  } catch (e) {
    console.error("[Primer] JSON parse failed.");
    return "";
  }
}


// ============================================================================
// SECTION 12: CONTEXT COMPILER (SMP-001 Phase B)
// Queries VECTOR_MATRIX with three-band thresholds, builds Markdown primer
// for each vector, overwrites [VECTOR]_PRIMER.gdoc. GAS builds the structure
// — no LLM inference on quantitative data. (Math-Before-Muse Mandate)
// ============================================================================

/**
 * Compiles a Vector Primer for each column in VECTOR_MATRIX.
 * Three bands per SMP-001:
 *   Core    >= 0.8 : Full session summaries
 *   Context 0.5–0.79: Next steps / actions
 *   Ghost   0.1–0.49: Metadata tags (preserves cross-references)
 *
 * @returns {Object} { status, compiledCount }
 */
function compileVectorPrimers() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: "LOCKED" };

  try {
    const props          = PropertiesService.getScriptProperties();
    const vectorFolderId = props.getProperty("ID_FOLDER_VECTOR");
    if (!vectorFolderId) throw new Error("ID_FOLDER_VECTOR missing. Run deployFullSystem().");

    const ss     = _getBrainTrustIndex();
    const matrix = ss.getSheetByName(CFG.MATRIX_SHEET);
    if (!matrix) {
      console.warn("[ContextCompiler] VECTOR_MATRIX not found. Run Vector_Router.gs first.");
      return { status: "NO_MATRIX" };
    }

    const rows         = matrix.getDataRange().getValues();
    const headers      = rows.shift();
    const vectorCols   = headers.slice(2); // Skip SESSION_UID and TIMESTAMP
    const vectorFolder = DriveApp.getFolderById(vectorFolderId);
    let compiledCount  = 0;

    vectorCols.forEach((vectorName, offset) => {
      const colIdx = offset + 2;
      const core = [], context = [], ghost = [];

      rows.forEach(row => {
        const w     = parseFloat(row[colIdx]);
        if (isNaN(w) || w < 0.1) return;
        const entry = { uid: row[0], ts: row[1], weight: w };
        if      (w >= 0.8) core.push(entry);
        else if (w >= 0.5) context.push(entry);
        else               ghost.push(entry);
      });

      if (!core.length && !context.length && !ghost.length) return;

      const sortDesc = (a, b) => b.weight - a.weight;
      core.sort(sortDesc); context.sort(sortDesc); ghost.sort(sortDesc);

      let md = `# VECTOR PRIMER: ${vectorName}\nGenerated: ${new Date().toLocaleString()}\n\n`;

      if (core.length) {
        md += `## CORE (≥ 0.8) — ${core.length} sessions\n*Full summaries — primary knowledge nodes*\n\n`;
        core.forEach(e => {
          md += `### ${e.uid} | Weight: ${e.weight}\n*${e.ts}*\n[Full summary — see VECTOR_${vectorName}.gdoc]\n\n`;
        });
      }
      if (context.length) {
        md += `## CONTEXT (0.5–0.79) — ${context.length} sessions\n*Next steps and action items*\n\n`;
        context.forEach(e => { md += `- ${e.uid} (${e.weight}) | ${e.ts}\n`; });
        md += "\n";
      }
      if (ghost.length) {
        md += `## GHOST VECTORS (0.1–0.49) — ${ghost.length} sessions\n*Cross-reference tags*\n\n`;
        ghost.forEach(e => { md += `- [${e.uid}] Weight: ${e.weight}\n`; });
        md += "\n";
      }

      // Idempotent overwrite of [VECTOR]_PRIMER.gdoc
      const primerDoc = _getOrCreateDoc(`${vectorName}_PRIMER`, vectorFolder);
      primerDoc.getBody().clear();
      primerDoc.getBody().setText(md);

      console.log(`[ContextCompiler] ${vectorName}_PRIMER — Core:${core.length} Context:${context.length} Ghost:${ghost.length}`);
      compiledCount++;
    });

    console.log(`[ContextCompiler] Complete — ${compiledCount} primers compiled.`);
    return { status: "SUCCESS", compiledCount };

  } catch (error) {
    console.error("[ContextCompiler] Fault: " + error.message);
    return { status: "ERROR", message: error.message };
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// SECTION 13: TRIGGER MANAGEMENT
// Programmatic trigger wiring — no manual Apps Script UI setup required.
// ============================================================================

/**
 * Creates all time-driven triggers. Checks for existing triggers first
 * to prevent duplicates. Safe to re-run.
 */
function initializeTriggers() {
  const existing = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

  function wire(fnName, interval, unit) {
    if (existing.includes(fnName)) {
      console.log(`[Triggers] Already exists: ${fnName}`);
      return;
    }
    const builder = ScriptApp.newTrigger(fnName).timeBased();
    if (unit === 'minutes') builder.everyMinutes(interval);
    else                    builder.everyHours(interval);
    builder.create();
    console.log(`[Triggers] Wired: ${fnName} — every ${interval} ${unit}`);
  }

  wire("runSemanticSweeper",          15, 'minutes');
  wire("sweepRootForExhaust",         15, 'minutes');
  wire("generateCouncilInputPayload",  1, 'hours');

  console.log("[Triggers] All triggers initialized.");
}

/** Removes all project triggers. Re-run initializeTriggers() to restore. */
function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log("[Triggers] All triggers removed.");
}


// ============================================================================
// SECTION 14: CORE UTILITIES
// All _getOrCreate helpers, pointer accessors, Smart Chip writers.
// Every function here is pure infrastructure — no business logic.
// ============================================================================

/**
 * Returns existing Google Doc in folder, or creates one. (PIVOT 003)
 * @param {string} docName
 * @param {Folder} folder
 * @returns {Document}
 */
function _getOrCreateDoc(docName, folder) {
  const existing = folder.getFilesByName(docName);
  if (existing.hasNext()) return DocumentApp.openById(existing.next().getId());
  const doc  = DocumentApp.create(docName);
  const file = DriveApp.getFileById(doc.getId());
  file.moveTo(folder);
  return doc;
}

/**
 * Returns existing folder by name (within optional parent), or creates one. (PIVOT 003)
 * @param {string} folderName
 * @param {Folder} [parentFolder]
 * @returns {Folder}
 */
function _getOrCreateFolder(folderName, parentFolder) {
  const scope = parentFolder
    ? parentFolder.getFoldersByName(folderName)
    : DriveApp.getFoldersByName(folderName);
  if (scope.hasNext()) return scope.next();
  return parentFolder ? parentFolder.createFolder(folderName) : DriveApp.createFolder(folderName);
}

/**
 * Returns existing spreadsheet by name in folder, or creates and moves one.
 * SpreadsheetApp.flush() before moveTo() prevents race condition. (PIVOT 003)
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
  SpreadsheetApp.flush(); // Force creation to sync before move (race condition fix)
  DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
  return ss;
}

/**
 * Returns BRAIN_TRUST_INDEX spreadsheet via pointer. Never by name search. (PIVOT 004)
 * @returns {Spreadsheet}
 * @throws {Error} If ID_BRAIN_TRUST_INDEX not in PropertiesService.
 */
function _getBrainTrustIndex() {
  const id = PropertiesService.getScriptProperties().getProperty("ID_BRAIN_TRUST_INDEX");
  if (!id) throw new Error("ID_BRAIN_TRUST_INDEX missing. Run deployFullSystem().");
  return SpreadsheetApp.openById(id);
}

/**
 * Returns file URL safely. Constructs fallback if getUrl() returns null
 * (can occur briefly after moveTo() before Drive syncs). (doc 19 patch)
 * @param {File}   file
 * @param {string} fileId
 * @returns {string}
 */
function _getSafeFileUrl(file, fileId) {
  try { const u = file.getUrl(); if (u) return u; } catch (e) {}
  return `https://docs.google.com/document/d/${fileId}/edit`;
}

/**
 * Writes a Smart Chip rich text link into a sheet cell.
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


// ============================================================================
// SECTION 15: SHEET TAB INITIALIZERS
// Each function is idempotent — skips if tab already exists.
// ============================================================================

/**
 * Generic tab initializer: creates tab with headers and formatting if absent.
 * @param {Spreadsheet} ss
 * @param {string}      tabName
 * @param {Array}       headers
 * @param {string}      headerBg - Hex color for header row background.
 */
function _initTab(ss, tabName, headers, headerBg) {
  if (ss.getSheetByName(tabName)) return;
  const sheet = ss.insertSheet(tabName);
  sheet.appendRow(headers);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold").setBackground(headerBg);
  if (headerBg === '#1e293b') headerRange.setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  console.log(`[InitTab] Created: ${tabName}`);
}

/**
 * Creates the Blackboard tab with full 12-column schema and checkbox column.
 * @param {Spreadsheet} ss
 */
function _initBlackboard(ss) {
  if (ss.getSheetByName(CFG.BLACKBOARD_SHEET)) return;
  const sheet = ss.insertSheet(CFG.BLACKBOARD_SHEET);
  sheet.appendRow([
    "Target_Doc_ID", "Version", "CE-TAG", "Document_Name",
    "Modification_Desc", "Author_Persona", "Target_UID",
    "Mutation_Type", "Find_String", "Replace_Payload",
    "Deployment_Status", "Deploy_Trigger"
  ]);
  sheet.getRange("A1:L1").setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
  sheet.getRange("G1:L1").setBackground("#1e3a5f");
  sheet.setFrozenRows(1);
  sheet.getRange("L2:L1000").insertCheckboxes();
  console.log("[InitTab] Created: Blackboard with checkbox column L.");
}

// ============================================================================
// END OF KOS MASTER SCRIPT v6.0
// ============================================================================
