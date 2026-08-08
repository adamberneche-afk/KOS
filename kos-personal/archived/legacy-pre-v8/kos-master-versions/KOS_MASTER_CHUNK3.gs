// ============================================================
// CHUNK 3 of 4 — GOVERNANCE_ENGINE_AND_COUNCIL_SIMULATOR
// File: KOS_MASTER.gs
// Stitch order: Place this block AFTER Chunk 2
// ============================================================


// ============================================================
// PART 7: THE GOVERNANCE ENGINE (CI/CD PIPELINE)
// PURPOSE: Active deployment pipeline via CE-LOG / Blackboard mutations.
//          Listens for human-triggered checkbox approvals and executes
//          document mutations via strict Find/Replace logic.
// CONFORMS TO: HITL Firewall, PIVOT 003, PIVOT 008
// ============================================================

/**
 * Hardening Audit Gate (PIVOT 008).
 * Scans a payload string for patterns that indicate hardcoded logic weights
 * or extraction patterns that should be sequestered in PropertiesService.
 * Throws if a vulnerability is detected — aborts deployment.
 *
 * @param {string} payload - The mutation payload string to audit.
 * @returns {boolean} true if payload passes audit.
 * @throws {Error} If hardcoded logic patterns are detected.
 */
function runHardeningAudit(payload) {
  // Pattern: detects "weight = 0.x" or similar hardcoded numeric logic
  const extractionPattern = /weight\s*[:=]\s*0\.\d+/i;
  if (extractionPattern.test(payload)) {
    throw new Error(
      "[VULNERABILITY_DETECTED] Hardcoded logic weights found in payload. Deployment ABORTED."
    );
  }
  return true;
}

/**
 * Governance Engine CI/CD Pipeline — onEdit trigger.
 * Listens to the CE-LOG / Blackboard sheet. When a row's Deploy_Trigger
 * checkbox (Column L, index 12) is checked by the human operator, this
 * function reads the execution packet and fires the document mutation.
 *
 * HITL Firewall: The human operator's physical checkbox click is the
 * verification gate. The AI stages PENDING rows; the human approves them.
 *
 * Schema expected in the sheet row (1-indexed columns):
 *   A(1): Target_Doc_ID  B-E: Descriptive fields  F(6): Alt Doc ID
 *   G(7): CE-TAG         H(8): Version             I(9): Find_String
 *   J(10): Replace_Payload  K(11): Deployment_Status  L(12): Deploy_Trigger
 *
 * @param {Object} e - The onEdit event object provided by Apps Script.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row   = range.getRow();
  const col   = range.getColumn();

  // Only trigger on: correct sheet name, Column L (12), checkbox = true, not header row
  const isTargetSheet = (
    sheet.getName() === "Blackboard" ||
    sheet.getName().indexOf("CE-LOG") !== -1
  );
  if (!isTargetSheet || col !== 12 || range.getValue() !== true || row <= 1) return;

  try {
    // Read the full execution packet from this row (columns 1–11)
    const data = sheet.getRange(row, 1, 1, 11).getValues()[0];

    // Handle both v1.1 schema (Doc ID in Col A) and v1.2 schema (Doc ID in Col G)
    const docId    = data[0] || data[5]; // Column A (index 0) or Column F (index 5)
    const searchTag = data[8];           // Column I (index 8): Find_String
    const payload   = data[9];           // Column J (index 9): Replace_Payload

    // STEP 1: Hardening Audit — reject payloads with hardcoded logic
    runHardeningAudit(payload);

    // STEP 2: Execute the document mutation
    const success = applyMutation(docId, searchTag, payload);

    if (success) {
      // Write DEPLOYED status and uncheck the trigger so it can fire again on next edit
      sheet.getRange(row, 11).setValue("DEPLOYED: " + new Date().toLocaleString());
      sheet.getRange(row, 12).setValue(false);
      SpreadsheetApp.getActiveSpreadsheet()
        .toast("Mutation Deployed Successfully.", "Governance Engine", 5);
    }

  } catch (err) {
    // Write failure state — leave checkbox unchecked so human can fix and retry
    sheet.getRange(row, 11).setValue("FAILED: " + err.message);
    sheet.getRange(row, 12).setValue(false);
    SpreadsheetApp.getActiveSpreadsheet()
      .toast("Mutation Failed. Check Status Column.", "System Alert", 10);
  }
}

/**
 * Executes the physical document mutation.
 * Uses strict Find/Replace — if the Find_String is not located exactly,
 * the function throws rather than guessing. This is the Strict Match Rule.
 *
 * @param {string} docId     - Google Doc ID of the target document.
 * @param {string} searchTag - The exact string to locate in the document.
 * @param {string} payload   - The replacement text to inject.
 * @returns {boolean} true if mutation succeeded.
 * @throws {Error} If doc ID or search tag are missing, or if string not found.
 */
function applyMutation(docId, searchTag, payload) {
  if (!docId || !searchTag) {
    throw new Error("Missing Document ID or Search Tag. Cannot execute mutation.");
  }

  const doc          = DocumentApp.openById(docId);
  const body         = doc.getBody();
  const rangeElement = body.findText(searchTag);

  if (rangeElement) {
    // Exact match found — perform the replacement
    const element = rangeElement.getElement();
    const textObj = element.asText();
    textObj.replaceText(searchTag, payload);
    return true;
  } else {
    // Strict Match Rule: never guess — abort and surface the failure
    throw new Error(
      `Strict Match Failed: Find_String "${searchTag}" not located in target document. ` +
      `Cannot guess. Verify the exact string exists in the document before retrying.`
    );
  }
}


// ============================================================
// PART 8: THE COUNCIL SIMULATOR (Phase 1)
// PURPOSE: Reads volatile daily exhaust and constructs a human-readable
//          prompt document for Workspace Studio inference.
//          Differential Read Logic prevents redundant payload generation.
// CONFORMS TO: PIVOT 003 (Idempotent), PIVOT 004 (Pointer-Driven),
//              HITL Firewall (output is staged, not sent)
// ============================================================

/**
 * Council Simulator — Phase 1: Input Payload Generator.
 * Checks whether CURRENT_STATE has been updated since the last run.
 * If yes: assembles a structured prompt document and routes it to the
 * RAW_EXHAUST folder for Workspace Studio pickup.
 * If no: returns a SLEEPING status — no redundant payload generated.
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

    // Fetch all required pointers (PIVOT 004 — never hardcode IDs)
    const stateId        = props.getProperty("ID_CURRENT_STATE");
    const pivotId        = props.getProperty("ID_PIVOTS_AND_LESSONS");
    const exhaustFolderId = props.getProperty("ID_00_RAW_EXHAUST");

    if (!stateId || !pivotId || !exhaustFolderId) {
      throw new Error(
        "Architectural Fault: Core pointers missing for Council Simulator. " +
        "Run setupRoutingProperties() to resolve."
      );
    }

    // --- DIFFERENTIAL READ CHECK (Anti-Bloat) ---
    // Only generate a new payload if CURRENT_STATE has been updated since last run.
    const stateFile   = DriveApp.getFileById(stateId);
    const lastRunStr  = props.getProperty("COUNCIL_LAST_RUN") || "0";
    const lastRunTime = parseInt(lastRunStr, 10);

    if (stateFile.getLastUpdated().getTime() <= lastRunTime) {
      console.log("System Stasis: No new exhaust detected since last run. Council sleeping.");
      return { status: "SLEEPING", message: "No new data to process." };
    }

    // --- READ CURRENT STATE AND LAWS ---
    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();

    // --- GENERATE PAYLOAD DOCUMENT ---
    const timestamp  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
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
      "Evaluate the Context against the Laws. Output your response strictly using the headings: " +
      "[🏗 ARCHITECT FLAG], [⚖️ AUDITOR FLAG], and [✨ MUSE FLAG]."
    ).setBold(true);

    payloadDoc.saveAndClose();

    // --- ROUTE TO RAW_EXHAUST TRIGGER ZONE ---
    const payloadFile = DriveApp.getFileById(payloadDoc.getId());
    payloadFile.moveTo(DriveApp.getFolderById(exhaustFolderId));

    // --- UPDATE EPOCH TIMESTAMP ---
    // Prevents this function from re-running until new state data exists
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
// END CHUNK 3 of 4 — GOVERNANCE_ENGINE_AND_COUNCIL_SIMULATOR
// Next chunk: CHUNK 4 of 4 — SWEEPERS_CONSOLIDATOR_AND_PRIMER
// ============================================================
