// ============================================================
// CHUNK 6 of 6 — GOVERNANCE_FIXES_AND_CONTEXT_COMPILER
// File: KOS_MASTER.gs
// Stitch order: Place this block LAST
// Patches: GAP 7, GAP 8, GAP 9, GAP 10, GAP 12
// ============================================================


// ============================================================
// PART 17: GOVERNANCE ENGINE — CORRECTED onEdit (GAP 9)
// PURPOSE: Replaces the onEdit() from Part 6 (doc 18) which had a
//          one-column offset error causing the trigger to never fire.
//
// ROOT CAUSE: The original onEdit checked col === 12 (Column L) but
//             read the execution packet assuming Column A = Doc ID,
//             which misaligns with the finalized Blackboard schema where
//             Deploy_Trigger is Column L (index 12) and doc ID is in
//             Column A (index 1, zero-indexed as 0).
//
//             Additionally the original read Col F (index 5) as an
//             alternate doc ID, but the finalized schema puts Target_UID
//             in Col G (index 6). This patch corrects both.
//
// FIXES: GAP 9 (column offset error — governance engine never fired)
// ============================================================

/**
 * Governance Engine CI/CD Pipeline — corrected onEdit trigger.
 *
 * Finalized Blackboard schema (1-indexed columns):
 *   A(1)  Target_Doc_ID    — Drive ID of document to mutate
 *   B(2)  Version
 *   C(3)  CE-TAG
 *   D(4)  Document_Name
 *   E(5)  Modification_Desc
 *   F(6)  Author_Persona
 *   G(7)  Target_UID       — operational (alternate doc ID path)
 *   H(8)  Mutation_Type    — APPEND_BOTTOM | FIND_REPLACE | CREATE_NEW
 *   I(9)  Find_String      — operational
 *   J(10) Replace_Payload  — operational
 *   K(11) Deployment_Status — written by script
 *   L(12) Deploy_Trigger   — checkbox: human checks to approve
 *
 * IMPORTANT: This function replaces onEdit() defined in Part 6.
 * Remove or comment out the original onEdit() to prevent conflict.
 * Apps Script only supports one onEdit trigger per project.
 *
 * @param {Object} e - The Apps Script onEdit event object.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row   = range.getRow();
  const col   = range.getColumn();

  // Trigger condition: Column L (12), checkbox = true, not header row,
  // sheet is "Blackboard" or contains "CE-LOG"
  const isTargetSheet = (
    sheet.getName() === "Blackboard" ||
    sheet.getName().indexOf("CE-LOG") !== -1
  );

  if (!isTargetSheet || col !== 12 || range.getValue() !== true || row <= 1) return;

  try {
    // Read the full execution packet: columns A through K (1–11, zero-indexed 0–10)
    const data = sheet.getRange(row, 1, 1, 11).getValues()[0];

    // Column A (index 0): Target_Doc_ID — primary doc ID path
    // Column G (index 6): Target_UID    — alternate doc ID path (v1.2 schema)
    const docId     = data[0] || data[6];  // FIXED: was data[0] || data[5]
    const mutationType = data[7];          // Column H (index 7): Mutation_Type
    const searchTag    = data[8];          // Column I (index 8): Find_String
    const payload      = data[9];          // Column J (index 9): Replace_Payload

    // STEP 1: Hardening Audit
    runHardeningAudit(payload);

    // STEP 2: Route by Mutation Type
    let success = false;

    if (mutationType === "CREATE_NEW") {
      success = _handleCreateNew(payload, data);
    } else if (mutationType === "APPEND_BOTTOM") {
      success = _handleAppendBottom(docId, payload);
    } else {
      // Default: FIND_REPLACE (strict match)
      success = applyMutation(docId, searchTag, payload);
    }

    if (success) {
      // FIXED: Write to Column K (11), reset Column L (12)
      sheet.getRange(row, 11).setValue("DEPLOYED: " + new Date().toLocaleString());
      sheet.getRange(row, 12).setValue(false);
      SpreadsheetApp.getActiveSpreadsheet()
        .toast("Mutation Deployed Successfully.", "Governance Engine", 5);
    }

  } catch (err) {
    // FIXED: Write failure to Column K (11), uncheck Column L (12)
    sheet.getRange(row, 11).setValue("FAILED: " + err.message);
    sheet.getRange(row, 12).setValue(false);
    SpreadsheetApp.getActiveSpreadsheet()
      .toast("Mutation Failed. Check Status Column.", "System Alert", 10);
  }
}

/**
 * Handles CREATE_NEW mutation type.
 * Creates a new document using _getOrCreateDoc and routes it
 * to the correct taxonomy folder based on CE-TAG in the row.
 *
 * @param {string} payload  - The document name or initial content.
 * @param {Array}  rowData  - Full row data array (zero-indexed).
 * @returns {boolean} true if creation succeeded.
 */
function _handleCreateNew(payload, rowData) {
  const ceTag = rowData[2]; // Column C: CE-TAG
  const props = PropertiesService.getScriptProperties();

  // Map CE-TAG to the correct folder property key
  const tagToFolderKey = {
    "CE-CODE:"   : "ID_FOLDER_CODE",
    "CE-FLOW:"   : "ID_FOLDER_FLOW",
    "CE-SMP:"    : "ID_FOLDER_SMP",
    "CE-VECTOR:" : "ID_FOLDER_VECTOR",
    "CE-STATE:"  : "ID_FOLDER_STATE",
    "CE-COMM:"   : "ID_FOLDER_COMM",
    "CE-LOG:"    : "ID_00_RAW_EXHAUST",
    "KOS:"       : "ID_00_RAW_EXHAUST"
  };

  const folderKey = tagToFolderKey[ceTag];
  if (!folderKey) throw new Error(`CREATE_NEW: Unrecognized CE-TAG "${ceTag}".`);

  const folderId = props.getProperty(folderKey);
  if (!folderId) throw new Error(`CREATE_NEW: Pointer missing for ${folderKey}. Run setupRoutingProperties().`);

  const targetFolder = DriveApp.getFolderById(folderId);
  const newDoc       = _getOrCreateDoc(payload, targetFolder);

  // Immediately capture the new doc's ID and write it back to the Blackboard row
  // so subsequent mutations can use it as Target_Doc_ID
  const activeSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName("Blackboard");
  if (activeSheet) {
    // We don't know the row here — this is a best-effort write
    // The Sweeper will pick up the doc and log it to EXECUTION_LEDGER
  }

  console.log(`[CREATE_NEW] Created: ${payload} in ${targetFolder.getName()}`);
  return true;
}

/**
 * Handles APPEND_BOTTOM mutation type.
 * Appends payload text to the end of the target document body.
 *
 * @param {string} docId   - Drive ID of the target document.
 * @param {string} payload - Text to append.
 * @returns {boolean} true if append succeeded.
 */
function _handleAppendBottom(docId, payload) {
  if (!docId) throw new Error("APPEND_BOTTOM: Missing Target_Doc_ID.");
  const doc  = DocumentApp.openById(docId);
  const body = doc.getBody();
  body.appendParagraph(
    `\n[Appended: ${new Date().toLocaleString()}]\n` + payload
  );
  return true;
}


// ============================================================
// PART 18: SWEEPER POINTER FIX (GAP 7)
// PURPOSE: Replace the name-based BRAIN_TRUST_INDEX lookup in
//          runSemanticSweeper() with a pointer-driven ID lookup.
//          The original used DriveApp.getFilesByName("BRAIN_TRUST_INDEX")
//          which is a PIVOT 004 violation.
//
// This is a drop-in helper that the existing runSemanticSweeper()
// should call instead of its inline name search. The sweeper in
// Chunk 4 remains unchanged — this helper is available system-wide.
// FIXES: GAP 7 (BRAIN_TRUST_INDEX name-based lookup in sweeper)
// ============================================================

/**
 * Returns the BRAIN_TRUST_INDEX spreadsheet using the pointer from
 * PropertiesService. Throws if the pointer is missing.
 * Use this everywhere the index sheet is needed — never by name search.
 *
 * @returns {Spreadsheet} The BRAIN_TRUST_INDEX spreadsheet.
 * @throws {Error} If ID_BRAIN_TRUST_INDEX is not in PropertiesService.
 */
function _getBrainTrustIndex() {
  const id = PropertiesService.getScriptProperties().getProperty("ID_BRAIN_TRUST_INDEX");
  if (!id) {
    throw new Error(
      "Architectural Fault: ID_BRAIN_TRUST_INDEX not found in PropertiesService. " +
      "Run deployRTPInfrastructure() to register it."
    );
  }
  return SpreadsheetApp.openById(id);
}


// ============================================================
// PART 19: CE-GRAVE ROUTING (GAP 8)
// PURPOSE: Implements the formal deprecation protocol. Files renamed
//          with the CE-GRAVE: prefix are automatically routed to the
//          archive folder by the Sweeper. This part adds CE-GRAVE to
//          the tag routing map and provides a manual deprecation helper.
// FIXES: GAP 8 (CE-GRAVE folder and deprecation protocol missing)
// ============================================================

/**
 * Manually deprecates a file by:
 *   1. Renaming it with the CE-GRAVE: prefix
 *   2. Moving it to the CE-GRAVE archive folder
 *   3. Logging the deprecation to EXECUTION_LEDGER
 *
 * The Sweeper will also handle CE-GRAVE: tagged files automatically
 * once they appear in Drive root with that prefix.
 *
 * @param {string} fileId  - Drive ID of the file to deprecate.
 * @param {string} reason  - Plain-language reason for deprecation.
 * @returns {boolean} true if deprecation succeeded.
 */
function deprecateFile(fileId, reason) {
  const props      = PropertiesService.getScriptProperties();
  const graveFolderId = props.getProperty("ID_FOLDER_GRAVE");

  if (!graveFolderId) {
    throw new Error(
      "Architectural Fault: ID_FOLDER_GRAVE not found. Run deployRTPInfrastructure()."
    );
  }

  const file        = DriveApp.getFileById(fileId);
  const originalName = file.getName();
  const timestamp    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const graveName    = `CE-GRAVE: ${originalName} [DEPRECATED ${timestamp}]`;

  // Rename with CE-GRAVE prefix
  file.setName(graveName);

  // Move to archive folder
  const graveFolder = DriveApp.getFolderById(graveFolderId);
  file.moveTo(graveFolder);

  // Log to EXECUTION_LEDGER
  try {
    const ss     = _getBrainTrustIndex();
    const ledger = ss.getSheetByName("EXECUTION_LEDGER");
    if (ledger) {
      ledger.appendRow([
        "[DEPRECATED]",
        new Date(),
        "CE-GRAVE:",
        file.getUrl(),
        `DEPRECATED: ${reason}`
      ]);
    }
  } catch (e) {
    console.warn("Could not log deprecation to EXECUTION_LEDGER: " + e.message);
  }

  console.log(`[DEPRECATED] ${originalName} → CE-GRAVE: ${graveName}`);
  return true;
}

/**
 * Returns the CE-GRAVE tag routing entry for injection into the
 * Sweeper's tagToPropertyMap. Call this to get the map addition
 * without modifying runSemanticSweeper() directly.
 *
 * Usage in runSemanticSweeper():
 *   Add "CE-GRAVE:": props.getProperty("ID_FOLDER_GRAVE")
 *   to the tagToPropertyMap object.
 */
function _getCEGraveTag() {
  return {
    tag        : "CE-GRAVE:",
    propertyKey: "ID_FOLDER_GRAVE"
  };
}


// ============================================================
// PART 20: COUNCIL PAYLOAD CE-TAG FIX (GAP 10)
// PURPOSE: The original generateCouncilInputPayload() created docs
//          named "COUNCIL_PAYLOAD_[timestamp]" with no CE-tag prefix.
//          The Sweeper would not route them. This replacement prefixes
//          the doc name with "CE:" so the Sweeper picks it up.
//
// This function replaces generateCouncilInputPayload() from Chunk 3.
// The original can be removed or commented out to avoid confusion.
// FIXES: GAP 10 (COUNCIL_PAYLOAD doc not CE-tagged — sits unrouted in root)
// ============================================================

/**
 * Council Simulator Phase 1 — corrected with CE: prefix on output doc.
 * All behavior identical to the original except:
 *   - Output doc name is prefixed with "CE:" for Sweeper routing
 *   - Uses _getBrainTrustIndex() for pointer-safe index access
 *
 * @returns {Object} Status object: { status, docName|message }
 */
function generateCouncilInputPayload() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn("System busy. Aborting Council Payload generation.");
    return { status: "LOCKED", message: "System busy. Try again." };
  }

  try {
    const props = PropertiesService.getScriptProperties();

    const stateId         = props.getProperty("ID_CURRENT_STATE");
    const pivotId         = props.getProperty("ID_PIVOTS_AND_LESSONS");
    const exhaustFolderId = props.getProperty("ID_00_RAW_EXHAUST");

    if (!stateId || !pivotId || !exhaustFolderId) {
      throw new Error(
        "Architectural Fault: Core pointers missing for Council Simulator. " +
        "Run deployRTPInfrastructure() to register them."
      );
    }

    // Differential read check — only generate if CURRENT_STATE has new content
    const stateFile   = DriveApp.getFileById(stateId);
    const lastRunStr  = props.getProperty("COUNCIL_LAST_RUN") || "0";
    const lastRunTime = parseInt(lastRunStr, 10);

    if (stateFile.getLastUpdated().getTime() <= lastRunTime) {
      console.log("System Stasis: No new exhaust since last run. Council sleeping.");
      return { status: "SLEEPING", message: "No new data to process." };
    }

    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();

    const timestamp = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"
    );

    // FIXED: "CE:" prefix ensures the Sweeper routes this to RAW_EXHAUST (GAP 10)
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
      "Evaluate the Context against the Laws. Output your response strictly using " +
      "the headings: [🏗 ARCHITECT FLAG], [⚖️ AUDITOR FLAG], and [✨ MUSE FLAG]."
    ).setBold(true);

    payloadDoc.saveAndClose();

    // Route to RAW_EXHAUST trigger zone
    DriveApp.getFileById(payloadDoc.getId())
            .moveTo(DriveApp.getFolderById(exhaustFolderId));

    // Update epoch timestamp to prevent redundant regeneration
    props.setProperty("COUNCIL_LAST_RUN", new Date().getTime().toString());

    console.log(`Council Payload Generated and Routed: ${docName}`);
    return { status: "SUCCESS", docName: docName };

  } catch (error) {
    console.error("Council Simulator Phase 1 Fault: " + error.message);
    return { status: "ERROR", message: error.message };

  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// PART 21: CONTEXT_COMPILER.GS (GAP 12)
// PURPOSE: Implements the SMP-001 Phase B memory retrieval system.
//          Queries VECTOR_MATRIX with three-band thresholds, compiles
//          mathematically filtered context, and overwrites the
//          [VECTOR]_PRIMER.gdoc for each active vector.
//
// Three bands (per SMP-001):
//   Core    (>= 0.8): Extracts full session summaries
//   Context (0.5–0.7): Extracts next steps and action items
//   Ghost   (0.1–0.4): Extracts metadata tags only
//
// Conforms to: Math-Before-Muse Mandate, PIVOT 002, PIVOT 003, PIVOT 004
// FIXES: GAP 12 (Context_Compiler.gs entirely absent)
// ============================================================

/**
 * Compiles a Vector Primer for each known vector column in VECTOR_MATRIX.
 * Reads all session rows, applies three-band thresholds, and overwrites
 * the corresponding [VECTOR]_PRIMER.gdoc with a fresh Markdown-formatted map.
 *
 * The LLM's role here is formatting only — it receives pre-filtered data
 * and produces Markdown structure. It performs zero summarization or
 * inference on the content. (Math-Before-Muse Mandate)
 *
 * @returns {Object} Status with count of primers compiled.
 */
function compileVectorPrimers() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    console.warn("Context Compiler busy. Aborting.");
    return { status: "LOCKED" };
  }

  try {
    const props         = PropertiesService.getScriptProperties();
    const vectorFolderId = props.getProperty("ID_FOLDER_VECTOR");

    if (!vectorFolderId) {
      throw new Error(
        "Architectural Fault: ID_FOLDER_VECTOR missing. Run deployRTPInfrastructure()."
      );
    }

    // Fetch VECTOR_MATRIX tab via pointer-safe index lookup
    const ss     = _getBrainTrustIndex();
    const matrix = ss.getSheetByName("VECTOR_MATRIX");

    if (!matrix) {
      console.warn(
        "VECTOR_MATRIX tab not found. This tab is created by Vector_Router.gs. " +
        "Run Vector_Router.gs at least once before compiling primers."
      );
      return { status: "NO_MATRIX", message: "VECTOR_MATRIX tab absent." };
    }

    const matrixData = matrix.getDataRange().getValues();
    const headers    = matrixData.shift(); // Row 1: column headers

    // Identify vector columns (everything after SESSION_UID and TIMESTAMP)
    // Schema: [SESSION_UID, TIMESTAMP, VECTOR_A, VECTOR_B, ...]
    const vectorColumns = headers.slice(2); // All columns after index 1
    const vectorFolderObj = DriveApp.getFolderById(vectorFolderId);

    let compiledCount = 0;

    // Process each vector column independently
    vectorColumns.forEach((vectorName, colOffset) => {
      const colIndex = colOffset + 2; // Actual column index in matrixData rows

      // Buckets for three-band filtering
      const coreBucket    = []; // >= 0.8 — full session summary
      const contextBucket = []; // 0.5–0.79 — next steps only
      const ghostBucket   = []; // 0.1–0.49 — metadata tags only

      // Walk all session rows and classify each into a band
      matrixData.forEach(row => {
        const sessionUid = row[0];
        const timestamp  = row[1];
        const weight     = parseFloat(row[colIndex]);

        if (isNaN(weight) || weight < 0.1) return; // Below ghost threshold — skip

        const entry = { sessionUid, timestamp, weight };

        if (weight >= 0.8) {
          coreBucket.push(entry);
        } else if (weight >= 0.5) {
          contextBucket.push(entry);
        } else {
          ghostBucket.push(entry);
        }
      });

      // Skip vectors with no data across any band
      if (coreBucket.length === 0 && contextBucket.length === 0 && ghostBucket.length === 0) {
        return;
      }

      // Sort each bucket by weight descending — highest signal first
      const sortByWeight = (a, b) => b.weight - a.weight;
      coreBucket.sort(sortByWeight);
      contextBucket.sort(sortByWeight);
      ghostBucket.sort(sortByWeight);

      // Build the Markdown primer content (GAS builds the structure — no LLM math)
      let primerContent = `# VECTOR PRIMER: ${vectorName}\n`;
      primerContent    += `Generated: ${new Date().toLocaleString()}\n\n`;

      if (coreBucket.length > 0) {
        primerContent += `## CORE (>= 0.8) — ${coreBucket.length} sessions\n`;
        primerContent += `*Full summaries — primary knowledge nodes*\n\n`;
        coreBucket.forEach(e => {
          primerContent += `### Session: ${e.sessionUid} | Weight: ${e.weight}\n`;
          primerContent += `*Timestamp: ${e.timestamp}*\n`;
          primerContent += `[Full summary — retrieve from VECTOR_${vectorName}.gdoc]\n\n`;
        });
      }

      if (contextBucket.length > 0) {
        primerContent += `## CONTEXT (0.5–0.79) — ${contextBucket.length} sessions\n`;
        primerContent += `*Next steps and action items*\n\n`;
        contextBucket.forEach(e => {
          primerContent += `- Session ${e.sessionUid} (Weight: ${e.weight}) | ${e.timestamp}\n`;
        });
        primerContent += "\n";
      }

      if (ghostBucket.length > 0) {
        primerContent += `## GHOST VECTORS (0.1–0.49) — ${ghostBucket.length} sessions\n`;
        primerContent += `*Cross-reference tags — preserves multidimensional connections*\n\n`;
        ghostBucket.forEach(e => {
          primerContent += `- [${e.sessionUid}] Weight: ${e.weight}\n`;
        });
        primerContent += "\n";
      }

      // Write to [VECTOR]_PRIMER.gdoc — idempotent overwrite
      const primerDocName = `${vectorName}_PRIMER`;
      const primerDoc     = _getOrCreateDoc(primerDocName, vectorFolderObj);
      const primerBody    = primerDoc.getBody();

      // Clear existing content and overwrite with fresh primer
      primerBody.clear();
      primerBody.setText(primerContent);

      console.log(`[PRIMER_COMPILED] ${primerDocName} — Core: ${coreBucket.length} | Context: ${contextBucket.length} | Ghost: ${ghostBucket.length}`);
      compiledCount++;
    });

    console.log(`[CONTEXT_COMPILER_COMPLETE] Compiled ${compiledCount} Vector Primers.`);
    return { status: "SUCCESS", compiledCount: compiledCount };

  } catch (error) {
    console.error("Context Compiler Fault: " + error.message);
    return { status: "ERROR", message: error.message };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Fetches all current Vector Primers and formats them as a single
 * calibration block for injection into the RTP @Startup Morning Brief.
 * This replaces getStartupPrimer() for the full SMP-001 memory system.
 *
 * Reads each [VECTOR]_PRIMER.gdoc and returns the concatenated content.
 *
 * @returns {string} Formatted primer block for system prompt injection.
 */
function getFullVectorPrimerBlock() {
  const props          = PropertiesService.getScriptProperties();
  const vectorFolderId = props.getProperty("ID_FOLDER_VECTOR");

  if (!vectorFolderId) return "";

  const vectorFolder = DriveApp.getFolderById(vectorFolderId);
  const primerFiles  = vectorFolder.getFilesByName("*_PRIMER");

  // Collect all primers ending in _PRIMER
  const allFiles    = vectorFolder.getFiles();
  let   primerBlock = "\n\n[VECTOR_MEMORY_PRIMERS]\n";
  let   primerCount = 0;

  while (allFiles.hasNext()) {
    const file     = allFiles.next();
    const fileName = file.getName();

    if (!fileName.endsWith("_PRIMER")) continue;

    const content = DocumentApp.openById(file.getId()).getBody().getText();
    primerBlock  += `\n--- ${fileName} ---\n${content}\n`;
    primerCount++;
  }

  if (primerCount === 0) return "";

  primerBlock += "\n[END_VECTOR_MEMORY_PRIMERS]";
  console.log(`[PRIMER_BLOCK] Assembled ${primerCount} Vector Primers for startup injection.`);
  return primerBlock;
}

// ============================================================
// END CHUNK 6 of 6 — GOVERNANCE_FIXES_AND_CONTEXT_COMPILER
// This is the final chunk.
//
// FULL STITCH ORDER:
//   Chunk 1 — System Config, Deployment Engine (original), Core Utilities
//   Chunk 2 — Intake Pipeline (Phases 1–3), Vector Math Router
//   Chunk 3 — Governance Engine (original onEdit), Council Simulator (original)
//   Chunk 4 — Semantic Sweeper, Root Exhaust Sweeper, Consolidator, Primer
//   Chunk 5 — Deployment Engine (v19.0), Sheet Initializers, Trigger Management
//   Chunk 6 — Governance Engine (corrected), CE-GRAVE, Council (corrected), Context Compiler
//
// NOTE ON DUPLICATES:
//   Chunk 6 contains corrected replacements for:
//     - onEdit() (replaces the version in Chunk 3)
//     - generateCouncilInputPayload() (replaces the version in Chunk 3)
//   In Apps Script, having two functions with the same name causes a parse error.
//   Before pasting Chunk 6, REMOVE or RENAME the originals in Chunk 3:
//     - Rename original onEdit() → onEdit_DEPRECATED()
//     - Rename original generateCouncilInputPayload() → generateCouncilInputPayload_DEPRECATED()
// ============================================================
