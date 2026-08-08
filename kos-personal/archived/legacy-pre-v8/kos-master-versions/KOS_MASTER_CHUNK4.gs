// ============================================================
// CHUNK 4 of 4 — SWEEPERS_CONSOLIDATOR_AND_PRIMER
// File: KOS_MASTER.gs
// Stitch order: Place this block LAST
// ============================================================


// ============================================================
// PART 9: THE SEMANTIC ROUTER SWEEPER ENGINE
// PURPOSE: Scans Drive root for CE-tagged files, stamps a temporal UID
//          for idempotency, routes each file to its taxonomy folder per
//          SMP-001 CE_Naming_Convention, and logs execution to BRAIN_TRUST_INDEX.
// CONFORMS TO: CE_Naming_Convention_SMP001, PIVOT 003, PIVOT 004
// TRIGGER: Set to run on a time-driven trigger (e.g., every 15 minutes)
// ============================================================

/**
 * Scans the Drive root for all files with a recognized CE-prefix tag.
 * For each unprocessed file (no existing [UID_DOC_] stamp):
 *   1. Generates a temporal UID and stamps it onto the filename
 *   2. Moves the file to the correct taxonomy folder
 *   3. Logs the action to the EXECUTION_LEDGER tab in BRAIN_TRUST_INDEX
 *
 * CI: 1.0 | Idempotent — files with existing UIDs are skipped
 */
function runSemanticSweeper() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn("Sweeper busy. Aborting execution.");
    return;
  }

  try {
    const props    = PropertiesService.getScriptProperties();
    const allFiles = DriveApp.getRootFolder().getFiles();

    // Map SMP-001 CE-prefix tags to their PropertiesService pointer keys.
    // Keys must exactly match what setupRoutingProperties() registered.
    const tagToPropertyMap = {
      "CE-CODE:"  : props.getProperty("ID_FOLDER_CODE"),
      "CE-FLOW:"  : props.getProperty("ID_FOLDER_FLOW"),
      "CE-SMP:"   : props.getProperty("ID_FOLDER_SMP"),
      "CE-VECTOR:": props.getProperty("ID_FOLDER_VECTOR"),
      "CE-PRD:"   : props.getProperty("ID_FOLDER_PRDS"),
      "CE-LESSON:": props.getProperty("ID_FOLDER_LESSON"),
      "CE-RUBRIC:": props.getProperty("ID_FOLDER_RUBRIC"),
      "CE-COMM:"  : props.getProperty("ID_FOLDER_COMM"),
      "CE-STATE:" : props.getProperty("ID_FOLDER_STATE"),
      "CE-LOG:"   : props.getProperty("ID_00_RAW_EXHAUST"),
      "KOS:"      : props.getProperty("ID_00_RAW_EXHAUST"),
      "CE:"       : props.getProperty("ID_00_RAW_EXHAUST")
    };

    let processedCount = 0;
    let skippedUid     = 0;

    while (allFiles.hasNext()) {
      const file     = allFiles.next();
      const fileName = file.getName();

      // --- IDEMPOTENCY GATE (PIVOT 003) ---
      // Files already stamped with a UID are skipped unconditionally.
      if (fileName.indexOf("[UID_DOC_") > -1) {
        skippedUid++;
        continue;
      }

      // --- TAG MATCHING ---
      let matchedTag     = null;
      let targetFolderId = null;

      for (let tag in tagToPropertyMap) {
        if (fileName.startsWith(tag)) {
          targetFolderId = tagToPropertyMap[tag];
          matchedTag     = tag;
          break; // First match wins — stop checking remaining tags
        }
      }

      // Skip files with no recognized CE-tag
      if (!matchedTag) continue;

      // Pointer safety check — warn if taxonomy folder wasn't registered
      if (!targetFolderId) {
        console.warn(`Taxonomy pointer missing for tag "${matchedTag}". Run setupRoutingProperties().`);
        continue;
      }

      const targetFolder = DriveApp.getFolderById(targetFolderId);

      // 1. Generate temporal UID — ensures this file is never processed twice
      const uid     = "[UID_DOC_" + new Date().getTime() + "]";
      const newName = `${uid} ${fileName}`;

      // 2. Stamp UID onto filename
      file.setName(newName);

      // 3. Move file into correct taxonomy folder
      file.moveTo(targetFolder);
      console.log(`✔ Routed and Stamped: ${fileName} → ${targetFolder.getName()}`);

      // 4. Register execution in BRAIN_TRUST_INDEX EXECUTION_LEDGER
      const indexFiles = DriveApp.getFilesByName("BRAIN_TRUST_INDEX");
      if (indexFiles.hasNext()) {
        const ss     = SpreadsheetApp.openById(indexFiles.next().getId());
        let   ledger = ss.getSheetByName("EXECUTION_LEDGER");

        // Create EXECUTION_LEDGER tab if it doesn't exist yet
        if (!ledger) {
          ledger = ss.insertSheet("EXECUTION_LEDGER");
          ledger.appendRow(["UID", "TIMESTAMP", "SEMANTIC_TAG", "FILE_URL", "STATUS"]);
          ledger.getRange("A1:E1")
                .setFontWeight("bold")
                .setBackground("#e2e8f0");
          ledger.setFrozenRows(1);
        }

        ledger.appendRow([uid, new Date(), matchedTag, file.getUrl(), "ROUTED"]);
      }

      processedCount++;
      SpreadsheetApp.flush(); // Pace API calls to prevent timeout
    }

    console.log(
      `Semantic Sweeper complete. Routed: ${processedCount} | Skipped (already UID'd): ${skippedUid}`
    );

  } catch (error) {
    console.error("Semantic Sweeper Fault: " + error.message);

  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// PART 10: THE ROOT EXHAUST SWEEPER (COG EXHAUST PROTOCOL)
// PURPOSE: Narrower sweeper that handles only CE-tagged Google Docs in
//          Drive root, stamps UIDs, and moves them to the RAW_EXHAUST
//          Trigger Zone for Workspace Studio pickup.
// TRIGGER: Set to run on a time-driven trigger (e.g., every 15 minutes)
//
// NOTE: If runSemanticSweeper() is running on the same trigger cadence,
//       this function is largely redundant for CE: prefixed docs.
//       Keep active if you need a dedicated Google Docs-only sweep
//       that runs independently of the full Semantic Sweeper.
// ============================================================

/**
 * Scans Drive root for Google Docs with "CE:" in their filename.
 * Stamps a UID and routes to the RAW_EXHAUST trigger zone.
 * Skips any file that already has a "UID_" stamp (idempotency).
 *
 * CI: 1.0 | Enforces Idempotency | Requires "CE:" in filename
 */
function sweepRootForExhaust() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // Silently abort if already running

  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const root = DriveApp.getRootFolder();

    // Only sweep native Google Docs (PIVOT 001 — native format preference)
    const looseDocs = root.getFilesByType(MimeType.GOOGLE_DOCS);

    // Fetch exhaust folder via pointer (PIVOT 004)
    const props         = PropertiesService.getScriptProperties();
    const exhaustFolderId = props.getProperty("ID_00_RAW_EXHAUST");

    if (!exhaustFolderId) {
      console.error("Architectural Fault: ID_00_RAW_EXHAUST not found in PropertiesService. " +
                    "Run setupRoutingProperties().");
      return;
    }

    const exhaustFolder = DriveApp.getFolderById(exhaustFolderId);
    let   processedCount = 0;

    while (looseDocs.hasNext()) {
      const file = looseDocs.next();
      const name = file.getName();

      // COG EXHAUST FILTER & IDEMPOTENCY CHECK
      // Must contain "CE:" (prevents false positives on unrelated docs)
      // Must NOT already have "UID_" (prevents double-processing)
      if (name.indexOf("UID_") === -1 && name.indexOf("CE:") !== -1) {
        // 1. Generate temporal UID
        const uid = "UID_RAW_" + new Date().getTime();

        // 2. Stamp UID onto filename
        file.setName(`[${uid}] ${name}`);

        // 3. Move to RAW_EXHAUST trigger zone for Workspace Studio pickup
        file.moveTo(exhaustFolder);

        processedCount++;
        SpreadsheetApp.flush(); // Pace executions to prevent API timeouts
      }
    }

    if (processedCount > 0 && ss) {
      ss.toast(
        `Swept ${processedCount} Cog Exhaust (CE) document(s) into the Trigger Zone.`,
        '🧹 Curator Action', 5
      );
    }

  } catch (e) {
    console.error("Root Exhaust Sweeper Failed: " + e.message);

  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// PART 11: THE CONSOLIDATOR (Inference Chunk Processor)
// PURPOSE: Reads buffered inference chunks from the Inference_Buffer sheet,
//          aggregates vector weights by averaging, and sequesters the
//          resulting Session Vector Primer into PropertiesService.
//
// ⚠️  [PRE-SMP] This consolidator uses simple mean averaging across chunks.
//     Once Vector_Router.gs is deployed with the sentence-level weighted
//     aggregation formula, this function will be superseded. Preserve until
//     the new pipeline is confirmed operational end-to-end.
// ============================================================

/**
 * Processes all BUFFERED rows in the Inference_Buffer sheet.
 * Averages vector weights across all processed chunks.
 * Stores the final primer in PropertiesService for startup injection.
 *
 * @returns {Object|null} The final vector primer object, or null if no chunks found.
 */
function consolidateInferenceChunks() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Inference_Buffer");

  if (!sheet) {
    console.warn("Inference_Buffer sheet not found. Create this tab before running.");
    return null;
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data.shift(); // Remove header row

  let aggregatedWeights = {};
  let chunkCount        = 0;

  // Iterate through all buffered (unprocessed) inference chunks
  data.forEach((row, index) => {
    const status  = row[4]; // Column E: Status
    const rawJson = row[3]; // Column D: Inference_Payload

    if (status === "BUFFERED") {
      try {
        const parsedPayload = JSON.parse(rawJson);
        const weights       = parsedPayload.weights;

        // Sum weights for later averaging
        for (let theme in weights) {
          aggregatedWeights[theme] = (aggregatedWeights[theme] || 0) + parseFloat(weights[theme]);
        }

        chunkCount++;

        // Mark this row as processed so it's not double-counted
        sheet.getRange(index + 2, 5).setValue("CONSOLIDATED");

      } catch (e) {
        console.error("Failed to parse inference chunk at row " + (index + 2) + ": " + e.message);
      }
    }
  });

  if (chunkCount > 0) {
    // Calculate vector mean across all chunks
    let finalPrimer = {};
    for (let theme in aggregatedWeights) {
      finalPrimer[theme] = (aggregatedWeights[theme] / chunkCount).toFixed(2);
    }

    // Sequester the Primer into PropertiesService (PIVOT 008)
    const props = PropertiesService.getScriptProperties();
    props.setProperty('SESSION_VECTOR_PRIMER', JSON.stringify(finalPrimer));

    console.log("[CONSOLIDATION_COMPLETE] Vector Primer Calculated: " + JSON.stringify(finalPrimer));
    return finalPrimer;
  }

  console.log("[CONSOLIDATION] No BUFFERED chunks found to process.");
  return null;
}


// ============================================================
// PART 12: STARTUP PRIMER INJECTION
// PURPOSE: Fetches the sequestered vector primer and formats it as a
//          calibration block for injection into the LLM system prompt
//          at @Startup.
// ============================================================

/**
 * Retrieves the SESSION_VECTOR_PRIMER from PropertiesService and formats
 * it as a structured calibration block for the RTP Morning Brief.
 * Returns an empty string if no primer exists (cold start).
 *
 * @returns {string} Formatted calibration block, or empty string if cold.
 */
function getStartupPrimer() {
  const primer = PropertiesService.getScriptProperties().getProperty('SESSION_VECTOR_PRIMER');

  if (!primer) {
    console.log("[PRIMER] No SESSION_VECTOR_PRIMER found. System starting cold.");
    return "";
  }

  const weights = JSON.parse(primer);
  let promptBlock = "\n\n[SYSTEM_CALIBRATION_DATA]\n";
  promptBlock    += "Current Cognitive Weights (Vector Primer):\n";

  for (let theme in weights) {
    promptBlock += `- ${theme}: ${weights[theme]}\n`;
  }

  return promptBlock + "[END_CALIBRATION]";
}

// ============================================================
// END CHUNK 4 of 4 — SWEEPERS_CONSOLIDATOR_AND_PRIMER
// This is the final chunk. Paste all four chunks in order to assemble
// KOS_MASTER.gs. No edits required between chunks.
// ============================================================
