// ============================================================
// CHUNK 2 of 4 — INTAKE_PIPELINE_AND_VECTOR_ROUTER
// File: KOS_MASTER.gs
// Stitch order: Place this block AFTER Chunk 1
// ============================================================


// ============================================================
// PART 5: THE INTAKE PIPELINE (PHASES 1 & 2)
// PURPOSE: Gateway lock, JSON validation, pointer extraction, and
//          volatile writes to CURRENT_STATE, PIVOTS_AND_LESSONS,
//          and MATRIX_LEDGER.
// CONFORMS TO: PIVOT 002 (Bifurcated), PIVOT 003 (Idempotent),
//              PIVOT 004 (Pointer-Driven)
//
// ⚠️  [PRE-SMP] The MATRIX_LEDGER write in this function uses a
//     static 4-column schema (ARCHITECTURE, UI, SECURITY, PEDAGOGY).
//     This will be replaced by Vector_Router.gs once the Vector Weight
//     Calculation Engine SMP is deployed. Do not extend the column
//     list here — extend it in Vector_Router.gs instead.
// ============================================================

/**
 * Main intake function. Receives a CURATOR JSON payload, validates it,
 * fetches all destination pointers securely, writes volatile state,
 * and hands off to the Vector Math Router (Phase 3).
 *
 * @param {string} rawJSONPayload - Stringified CURATOR session JSON.
 * @returns {Object} Status object with routing results or error detail.
 */
function processIntakePayload(rawJSONPayload) {
  // Concurrency lock — prevents simultaneous executions from corrupting writes
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    console.error("System Busy: Could not acquire lock for Intake Pipeline.");
    return { status: "LOCKED", message: "System busy, please try again." };
  }

  try {
    // --- GATEWAY: JSON Validation ---
    let payloadData;
    try {
      payloadData = JSON.parse(rawJSONPayload);
    } catch (parseError) {
      throw new Error("Invalid JSON Exhaust. The Curator's payload was malformed.");
    }

    // --- POINTER EXTRACTION (PIVOT 004) ---
    // All destination IDs are fetched from PropertiesService at the gateway.
    // Nothing is hardcoded past this point.
    const props          = PropertiesService.getScriptProperties();
    const currentStateId = props.getProperty("ID_CURRENT_STATE");
    const indexSheetId   = props.getProperty("ID_BRAIN_TRUST_INDEX");
    const vectorFolderId = props.getProperty("ID_FOLDER_VECTOR");
    const pivotDocId     = props.getProperty("ID_PIVOTS_AND_LESSONS");

    // Architectural safety check — halt if any core pointer is missing
    if (!currentStateId || !indexSheetId || !vectorFolderId || !pivotDocId) {
      throw new Error(
        "Architectural Fault: One or more Core Pointers are missing from PropertiesService. " +
        "Run setupRoutingProperties() to resolve."
      );
    }

    const timestamp  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const sessionUid = "LOG_" + new Date().getTime();

    // Open all destination assets via pointer (never by name search)
    const stateDoc   = DocumentApp.openById(currentStateId);
    const pivotDoc   = DocumentApp.openById(pivotDocId);
    const indexSheet = SpreadsheetApp.openById(indexSheetId);

    // --- PHASE 1 WRITE: CURRENT_STATE (Volatile Memory) ---
    // Appends next steps from the CURATOR payload as a timestamped state sync.
    if (
      payloadData.dynamic_state &&
      payloadData.dynamic_state.next_steps &&
      payloadData.dynamic_state.next_steps.length > 0
    ) {
      const stateBody = stateDoc.getBody();
      stateBody.appendParagraph(`\n[State Sync: ${timestamp} | ${sessionUid}]`)
               .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      stateBody.appendParagraph("NEXT STEPS:").setBold(true);
      payloadData.dynamic_state.next_steps.forEach(step => stateBody.appendListItem(step));
    }

    // --- PHASE 2 WRITE: PIVOTS_AND_LESSONS (Supreme Law Archive) ---
    // Appends any mistakes/corrections captured by the CURATOR.
    if (
      payloadData.dynamic_state &&
      payloadData.dynamic_state.pivots_and_lessons &&
      payloadData.dynamic_state.pivots_and_lessons.length > 0
    ) {
      const pivotBody = pivotDoc.getBody();
      pivotBody.appendParagraph(`\n[Session Logged: ${timestamp} | ${sessionUid}]`)
               .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      payloadData.dynamic_state.pivots_and_lessons.forEach(pivot =>
        pivotBody.appendListItem(pivot)
      );
    }

    // --- PHASE 2 WRITE: MATRIX_LEDGER (Math-Before-Muse Mandate) ---
    // ⚠️  [PRE-SMP] Static 4-column write. Replace with Vector_Router.gs output
    //     once the Vector Weight Calculation Engine SMP is deployed.
    const ledger = indexSheet.getSheetByName("MATRIX_LEDGER");
    if (ledger) {
      const w    = payloadData.vector_weights || {};
      const arch = parseFloat(w.ARCHITECTURE) || 0;
      const ui   = parseFloat(w.UI)           || 0;
      const sec  = parseFloat(w.SECURITY)     || 0;
      const ped  = parseFloat(w.PEDAGOGY)     || 0;
      ledger.appendRow([sessionUid, timestamp, arch, ui, sec, ped, (arch + ui + sec + ped)]);
    } else {
      console.warn("MATRIX_LEDGER tab not found in BRAIN_TRUST_INDEX. Create the tab and re-run.");
    }

    console.log(`Phases 1 & 2 Complete: Volatile write executed for ${sessionUid}`);

    // --- HANDOFF TO PHASE 3: Vector Routing ---
    const pointers = {
      vectorFolderId : vectorFolderId,
      sessionUid     : sessionUid,
      timestamp      : timestamp
    };

    const vectorResult = executeVectorRouting(payloadData, pointers);

    return {
      status       : "SUCCESS",
      data         : payloadData,
      vectorRouting: vectorResult
    };

  } catch (error) {
    console.error("Pipeline Fault: " + error.message);
    return { status: "ERROR", message: error.message };

  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// PART 6: THE INTAKE PIPELINE (PHASE 3) — VECTOR MATH ROUTER
// PURPOSE: Routes high-weight vectors (> 0.7) to their corresponding
//          VECTOR_ docs in the 05_Vector_Repository folder.
//
// ⚠️  [PRE-SMP] This function uses the original binary threshold (> 0.7)
//     from the pre-SMP-001 architecture. It will be superseded by
//     Vector_Router.gs which implements the full Matrix Ledger approach,
//     Incubator, half-life decay, and promotion engine.
//     Preserve this function until Vector_Router.gs is live.
// ============================================================

/**
 * Evaluates incoming vector weights. For any theme with weight > 0.7,
 * finds or creates the corresponding VECTOR_[TOPIC].gdoc and appends
 * the session summary as a new entry.
 *
 * @param {Object} payloadData - Parsed CURATOR session JSON.
 * @param {Object} pointers    - { vectorFolderId, sessionUid, timestamp }
 * @returns {Object} Status object with count of routed vectors.
 */
function executeVectorRouting(payloadData, pointers) {
  try {
    const vectorFolder = DriveApp.getFolderById(pointers.vectorFolderId);
    const weights      = payloadData.vector_weights || {};
    let routedCount    = 0;

    for (const [topic, weightValue] of Object.entries(weights)) {
      const weightFloat = parseFloat(weightValue);

      // Math-Before-Muse Filter: only route high-density signals
      // ⚠️  [PRE-SMP] Binary threshold. Replace with Matrix write in Vector_Router.gs.
      if (!isNaN(weightFloat) && weightFloat > 0.7) {
        const vectorDocName = "VECTOR_" + topic.toUpperCase().trim();

        // Idempotency check (PIVOT 003): find or create, never duplicate
        const vectorDoc = _getOrCreateDoc(vectorDocName, vectorFolder);
        const body      = vectorDoc.getBody();

        // Append session summary as a timestamped entry
        body.appendParagraph(
          `\n[Vector Seed: ${pointers.timestamp} | ${pointers.sessionUid} | Weight: ${weightFloat}]`
        ).setHeading(DocumentApp.ParagraphHeading.HEADING3);

        if (payloadData.session_summary) {
          body.appendParagraph(payloadData.session_summary);
        }

        routedCount++;
      }
    }

    console.log(`Phase 3 Complete: Routed to ${routedCount} Vector Doc(s).`);
    return { status: "SUCCESS", routedCount: routedCount };

  } catch (error) {
    console.error("Vector Math Router Fault: " + error.message);
    return { status: "ERROR", message: error.message };
  }
}

// ============================================================
// END CHUNK 2 of 4 — INTAKE_PIPELINE_AND_VECTOR_ROUTER
// Next chunk: CHUNK 3 of 4 — GOVERNANCE_ENGINE_AND_COUNCIL_SIMULATOR
// ============================================================
