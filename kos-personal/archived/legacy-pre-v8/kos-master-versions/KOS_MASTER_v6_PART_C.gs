// ============================================================================
// KOS MASTER SCRIPT v6.1 — PART C (CI 2.2 SURGICAL EXTRACTIONS)
// Paste this immediately below Part B.
//
// This part delivers three components extracted from CI 2.2 by Council vote:
//
//   EXTRACTION 1 — runHardeningAudit_v2()
//     Upgraded from single-pattern Regex to full Calibration Wall scan.
//     Replace all existing runHardeningAudit() calls with this version.
//
//   EXTRACTION 2 — Differential Read injected into masterRefineryProcess()
//     masterRefineryProcess() in Part A is patched here via drop-in
//     replacement logic. The patch adds a content hash check so the
//     Drop Zone never quarantines a log it has already processed.
//
//   EXTRACTION 3 — _createGemSetupDoc()
//     New function. Called from deployFullSystem() after Persona stubs.
//     Generates a fully-populated Gemini configuration document that
//     bridges the GAS backend to the Chat UI front-end.
//
// ACTIVATION INSTRUCTIONS:
//   1. Paste this Part C below Part B.
//   2. In Part B, rename runHardeningAudit() → runHardeningAudit_LEGACY()
//      (the v2 version here supersedes it — duplicate names cause parse errors)
//   3. In Part A, masterRefineryProcess() is superseded by
//      masterRefineryProcess_v2() below. Rename the Part A version to
//      masterRefineryProcess_LEGACY() and rename v2 to masterRefineryProcess().
//   4. In deployFullSystem() Phase 4 (Part A), add this call after the
//      persona stub loop:
//        _createGemSetupDoc(folders.FOUNDATION);
// ============================================================================


// ============================================================================
// EXTRACTION 1: HARDENING AUDIT v2
// Auditor's directive: "Weld it permanently to the front door."
// Upgraded from single weight-pattern scan to full Calibration Wall defense.
//
// Scans for:
//   Pattern A — Hardcoded numeric weights (weight = 0.x)
//   Pattern B — Exposed IDENTITY_KEY_SALT strings
//   Pattern C — Any key from CFG.CALIBRATION_KEYS appearing in plain text
//   Pattern D — Hardcoded Drive IDs (33-char alphanumeric strings)
//
// Called by: onEdit() before any mutation, processIntakePayload() at gateway
// ============================================================================

/**
 * Full Calibration Wall security scan. Throws on any detected vulnerability.
 * Replaces runHardeningAudit() — call this everywhere the original was called.
 *
 * @param {string} payload - Any string entering the system (mutation or JSON).
 * @throws {Error} Descriptive error identifying which pattern triggered.
 * @returns {boolean} true if payload passes all scans.
 */
function runHardeningAudit_v2(payload) {
  if (!payload || typeof payload !== 'string') return true; // Nothing to scan

  // Pattern A: Hardcoded numeric logic weights
  if (/weight\s*[:=]\s*0\.\d+/i.test(payload)) {
    throw new Error(
      "[VULNERABILITY: PATTERN_A] Hardcoded logic weight detected in payload. " +
      "Sequester all weights in PropertiesService via setupCalibration(). Deployment ABORTED."
    );
  }

  // Pattern B: Exposed identity salt — most sensitive IP in the system
  if (/IDENTITY_KEY_SALT/i.test(payload)) {
    throw new Error(
      "[VULNERABILITY: PATTERN_B] IDENTITY_KEY_SALT reference detected in payload. " +
      "This key must never appear in plaintext outside PropertiesService. Deployment ABORTED."
    );
  }

  // Pattern C: Any calibration key name appearing in plaintext
  const exposedKey = CFG.CALIBRATION_KEYS.find(k => payload.includes(k));
  if (exposedKey) {
    throw new Error(
      `[VULNERABILITY: PATTERN_C] Calibration key "${exposedKey}" exposed in payload. ` +
      "All calibration keys must remain sequestered. Deployment ABORTED."
    );
  }

  // Pattern D: Hardcoded Drive IDs (33-char base64url strings)
  // Drive IDs match: letters, numbers, hyphens, underscores, exactly 33 chars
  if (/[A-Za-z0-9_\-]{33}/.test(payload)) {
    // Secondary check: confirm it's not inside a legitimate JSON structure
    // (e.g. the payload itself being a CURATOR JSON that contains IDs)
    // Only throw if the ID appears bare (not as a JSON value)
    const bareIdPattern = /(?<![":{\[,])\b[A-Za-z0-9_\-]{33}\b(?![":}\],])/;
    if (bareIdPattern.test(payload)) {
      throw new Error(
        "[VULNERABILITY: PATTERN_D] Bare Drive ID detected in payload. " +
        "All IDs must be routed via PropertiesService pointers (PIVOT 004). Deployment ABORTED."
      );
    }
  }

  return true;
}


// ============================================================================
// EXTRACTION 2: masterRefineryProcess_v2() WITH DIFFERENTIAL READ
// Developer's directive: "Inject the Differential Read timestamp check."
//
// New behavior vs Part A version:
//   - Computes a SHA-256-equivalent content hash of the pasted log text
//     using Utilities.computeDigest() before creating the quarantine doc
//   - Checks this hash against LAST_INTAKE_HASH in PropertiesService
//   - If hashes match: the same log was already processed — abort silently
//   - If hashes differ: new content confirmed — proceed with quarantine
//   - After successful quarantine: stores the new hash as LAST_INTAKE_HASH
//
// This prevents the Drop Zone from creating duplicate quarantine docs
// if the user accidentally triggers the intake twice on the same log.
// ============================================================================

/**
 * Drop Zone intake pipeline with Differential Read protection.
 * Supersedes masterRefineryProcess() from Part A.
 * Rename this to masterRefineryProcess() after renaming the Part A version.
 *
 * Differential Read: computes content hash of log text before quarantining.
 * Aborts if hash matches the previously processed log (duplicate prevention).
 */
function masterRefineryProcess_v2() {
  let ui  = null;
  let doc = null;

  try {
    doc = DocumentApp.getActiveDocument();
    if (doc) ui = DocumentApp.getUi();
  } catch (e) {
    console.error("[Refinery_v2] Headless context — no active document.");
    return;
  }

  if (!doc) return;

  const body = doc.getBody();
  const text = body.getText().trim();

  // Validate: reject if empty or only the sentinel placeholder
  if (!text || (text.includes(CFG.DROP_ZONE_SENTINEL) && text.length < 100)) {
    if (ui) ui.alert('System Halt', 'No valid session log detected in the Drop Zone.', ui.ButtonSet.OK);
    return;
  }

  // ── DIFFERENTIAL READ: Content Hash Check ────────────────────────────────
  // Compute a fingerprint of the current log text.
  // If it matches the last successfully processed log, this is a duplicate.
  const rawBytes    = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text);
  const contentHash = rawBytes.map(b => (b < 0 ? b + 256 : b)
                                        .toString(16).padStart(2, '0')).join('');

  const props          = PropertiesService.getScriptProperties();
  const lastHash       = props.getProperty('LAST_INTAKE_HASH');

  if (lastHash && lastHash === contentHash) {
    if (ui) ui.alert(
      'Duplicate Detected',
      'This log has already been processed.\n\n' +
      'The Drop Zone content matches the last successful intake.\n' +
      'Paste a new session log and try again.',
      ui.ButtonSet.OK
    );
    console.log("[Refinery_v2] Duplicate log detected — intake aborted.");
    return;
  }
  // ── END DIFFERENTIAL READ ─────────────────────────────────────────────────

  if (ui) ui.toast('Initiating Unified Intake...', 'Refinery', 3);

  const stagingFolderId = props.getProperty('ID_FOLDER_STAGING');
  const indexId         = props.getProperty('ID_BRAIN_TRUST_INDEX');

  if (!stagingFolderId || !indexId) {
    if (ui) ui.alert('System Error', 'System not calibrated. Run "Deploy System" first.', ui.ButtonSet.OK);
    return;
  }

  const stagingFolder = DriveApp.getFolderById(stagingFolderId);
  const logUUID       = "[UID_LOG_" + new Date().getTime() + "]";
  const fileName      = `${logUUID} RAW_EXHAUST`;

  // ── HARDENING AUDIT at Drop Zone entry ────────────────────────────────────
  // Auditor: "No data enters the vector space without passing the Regex scan."
  try {
    runHardeningAudit_v2(text);
  } catch (auditErr) {
    if (ui) ui.alert('Security Halt', auditErr.message, ui.ButtonSet.OK);
    console.error("[Refinery_v2] Hardening audit failed: " + auditErr.message);
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Create quarantined doc — write content and release lock BEFORE moving
  const newDoc   = DocumentApp.create(fileName);
  const newDocId = newDoc.getId();
  newDoc.getBody().setText(text);
  newDoc.saveAndClose(); // File lock released — safe to move now

  const newDocFile = DriveApp.getFileById(newDocId);
  newDocFile.moveTo(stagingFolder);

  // Log to STAGING_PIPELINE with Smart Chip
  const indexSS    = SpreadsheetApp.openById(indexId);
  let stagingSheet = indexSS.getSheetByName(CFG.STAGING_SHEET);

  if (!stagingSheet) {
    stagingSheet = indexSS.insertSheet(CFG.STAGING_SHEET);
    stagingSheet.appendRow(['Timestamp', 'LOG_UUID', 'Raw_Pointer', 'Status']);
    stagingSheet.getRange('1:1').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    stagingSheet.setFrozenRows(1);
  }

  const fileUrl = _getSafeFileUrl(newDocFile, newDocId);
  stagingSheet.appendRow([new Date(), logUUID, "", "QUARANTINED"]);
  _writeSmartChip(stagingSheet, stagingSheet.getLastRow(), 3, fileName, fileUrl);

  // ── STORE CONTENT HASH (Differential Read state update) ───────────────────
  props.setProperty('LAST_INTAKE_HASH', contentHash);
  // ─────────────────────────────────────────────────────────────────────────

  // Clear Drop Zone and print receipt
  body.clear();
  const header = body.appendParagraph('LOG UID: ' + logUUID);
  header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  header.setForegroundColor('#008000');
  header.setBold(true);
  body.appendParagraph('Doc ID: ' + newDocId);
  body.appendParagraph('Generated File: 🔗 ' + fileName).setLinkUrl(fileUrl);
  body.appendParagraph('Inference Pointer: ' + logUUID);
  body.appendParagraph('Content Hash: ' + contentHash);
  body.appendHorizontalRule();
  const sentinel = body.appendParagraph(CFG.DROP_ZONE_SENTINEL);
  sentinel.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  sentinel.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  sentinel.setForegroundColor('#808080');
  body.appendParagraph('');

  if (ui) ui.alert('🚀 REFINERY COMPLETE\n\nLog ingested and quarantined.\nUID: ' + logUUID);
  console.log(`[Refinery_v2] Quarantined: ${fileName} | Hash: ${contentHash}`);
}


// ============================================================================
// EXTRACTION 3: _createGemSetupDoc()
// Muse's directive: "Take the Gem Setup Doc generator."
// Aligner's constraint: "Bridge the backend to the Chat UI — no automation."
//
// Generates a fully-populated Google Doc that tells the user exactly how
// to configure the Gemini Gem front-end for the RTP system.
// This document is the human-readable translation layer between the GAS
// backend and the AI chat interface — it writes the instructions once,
// in the right folder, so the user never has a blank starting point.
//
// Called from: deployFullSystem() Phase 4, after persona stubs are created.
// Location: 01_Canonical_Foundation folder.
// ============================================================================

/**
 * Creates the KOS Gem Setup Document in the Foundation folder.
 * Idempotent — skips if document already exists with content.
 * Dynamically reads registered PropertiesService IDs to populate
 * the setup instructions with live system pointers.
 *
 * @param {Folder} foundationFolder - The 01_Canonical_Foundation Drive folder.
 */
function _createGemSetupDoc(foundationFolder) {
  const doc  = _getOrCreateDoc("KOS_GEM_SETUP_GUIDE", foundationFolder);
  const body = doc.getBody();

  // Idempotent: only populate if blank
  if (body.getText().length > 50) {
    console.log("[GemSetup] KOS_GEM_SETUP_GUIDE already populated — skipping.");
    return;
  }

  const props         = PropertiesService.getScriptProperties();
  const indexId       = props.getProperty("ID_BRAIN_TRUST_INDEX")   || "[Register ID — run deployFullSystem]";
  const stateId       = props.getProperty("ID_CURRENT_STATE")       || "[Register ID — run deployFullSystem]";
  const pivotId       = props.getProperty("ID_PIVOTS_AND_LESSONS")  || "[Register ID — run deployFullSystem]";
  const coreThesisId  = props.getProperty("ID_CORE_THESIS")         || "[Register ID — run deployFullSystem]";
  const vectorFolderId = props.getProperty("ID_FOLDER_VECTOR")      || "[Register ID — run deployFullSystem]";

  // ── Document Header ────────────────────────────────────────────────────────
  body.appendParagraph("KOS GEM SETUP GUIDE")
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(
    "This document configures your Gemini Gem (RTP front-end) to connect to the " +
    "KOS backend. Follow each section in order. Do not skip the System Prompt step."
  );
  body.appendHorizontalRule();

  // ── Section 1: System Prompt ───────────────────────────────────────────────
  body.appendParagraph("1. GEM SYSTEM PROMPT")
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    "In Gemini → Gem Manager → Edit Gem → Instructions, paste the following block. " +
    "Replace bracketed values with your actual document URLs from Drive."
  );
  body.appendParagraph("─────────────────────────────────────────────────────");
  body.appendParagraph(
    "You are the RTP (Recursive Thought Partner) for the Knowledge Operating System (KOS). " +
    "You operate as a Socratic Concierge: eliminate administrative friction, preserve cognitive friction. " +
    "You route all requests through the Council of Personas (Architect, Auditor, Muse, Developer, Curator, Alignment). " +
    "\n\nYour active system documents are:\n" +
    `- CORE_THESIS: https://docs.google.com/document/d/${coreThesisId}/edit\n` +
    `- CURRENT_STATE: https://docs.google.com/document/d/${stateId}/edit\n` +
    `- PIVOTS_AND_LESSONS: https://docs.google.com/document/d/${pivotId}/edit\n` +
    `- BRAIN_TRUST_INDEX: https://docs.google.com/spreadsheets/d/${indexId}/edit\n` +
    "\nYou enforce the Math-Before-Muse Mandate: never sort, filter, or aggregate " +
    "quantitative data — Apps Script handles all math. You format the mathematical survivor only. " +
    "\n\nYou follow the HITL Firewall: all external writes require explicit human verification. " +
    "You never autonomously send communications or mutate canonical documents. " +
    "\n\nYour Truth Hierarchy: Core Router → PIVOTS_AND_LESSONS → BRAIN_TRUST_INDEX → Persona Cogs."
  ).setItalic(true);
  body.appendParagraph("─────────────────────────────────────────────────────");

  // ── Section 2: Knowledge Sources ───────────────────────────────────────────
  body.appendParagraph("2. GEM KNOWLEDGE SOURCES")
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    "In Gem Manager → Knowledge, add the following Google Drive files. " +
    "These give the Gem access to your live system state."
  );
  [
    { label: "CORE_THESIS",        id: coreThesisId  },
    { label: "CURRENT_STATE",      id: stateId       },
    { label: "PIVOTS_AND_LESSONS", id: pivotId       }
  ].forEach(item => {
    body.appendListItem(
      `${item.label}: https://docs.google.com/document/d/${item.id}/edit`
    );
  });
  body.appendParagraph(
    "\nAlso add your six PERSONA_ alignment documents from the 02_Council_Alignments folder. " +
    "These define behavioral constraints for each Council cog."
  );

  // ── Section 3: Startup Ritual ──────────────────────────────────────────────
  body.appendParagraph("3. STARTUP RITUAL (@Startup)")
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    "At the start of every new Gem session, send this message to initialize context:\n\n" +
    "\"@Startup — run the Morning Briefing. Load CURRENT_STATE, PIVOTS_AND_LESSONS, and " +
    "CORE_THESIS. Report open threads, deferred decisions, and any action items from the " +
    "last CURATOR JSON. Then await my first directive.\""
  ).setItalic(true);

  // ── Section 4: Drop Zone Intake ────────────────────────────────────────────
  body.appendParagraph("4. DROP ZONE INTAKE WORKFLOW")
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    "After each working session in the Gem:\n\n" +
    "1. Ask the Curator to produce the canonical session JSON.\n" +
    "2. Copy the full JSON output.\n" +
    "3. Open your DROP_ZONE Google Doc.\n" +
    "4. Paste the JSON below the sentinel line.\n" +
    "5. From the '🚀 KOS Council' menu → 'Master Intake Pipeline (Single Click)'.\n" +
    "6. The system quarantines the log, logs a receipt, and resets the Drop Zone.\n\n" +
    "The STAGING_PIPELINE sheet in BRAIN_TRUST_INDEX tracks every log ingested."
  );

  // ── Section 5: System Pointers Reference ──────────────────────────────────
  body.appendParagraph("5. LIVE SYSTEM POINTERS")
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    "These IDs were registered at deployment. Do not modify them manually — " +
    "re-run deployFullSystem() to refresh if any pointer becomes stale."
  );
  [
    { label: "BRAIN_TRUST_INDEX (Sheet)", id: indexId,        type: "spreadsheets" },
    { label: "CURRENT_STATE (Doc)",       id: stateId,        type: "document"     },
    { label: "PIVOTS_AND_LESSONS (Doc)",  id: pivotId,        type: "document"     },
    { label: "CORE_THESIS (Doc)",         id: coreThesisId,   type: "document"     },
    { label: "Vector Repository (Folder)",id: vectorFolderId, type: "folders"      }
  ].forEach(item => {
    const base = item.type === "spreadsheets"
      ? `https://docs.google.com/spreadsheets/d/${item.id}/edit`
      : item.type === "folders"
      ? `https://drive.google.com/drive/folders/${item.id}`
      : `https://docs.google.com/document/d/${item.id}/edit`;
    body.appendListItem(`${item.label}: ${base}`);
  });

  body.appendHorizontalRule();
  body.appendParagraph(
    `Generated by KOS deployFullSystem() — ${new Date().toLocaleString()}\n` +
    "To regenerate: delete this document's content and re-run deployFullSystem()."
  ).setItalic(true);

  doc.saveAndClose();
  console.log("[GemSetup] KOS_GEM_SETUP_GUIDE created and populated.");
}


// ============================================================================
// ACTIVATION CHECKLIST
//
// After pasting Part C below Parts A and B, complete these steps:
//
// STEP 1 — Rename legacy functions to prevent duplicate name parse errors:
//   In Part B:
//     runHardeningAudit()          → runHardeningAudit_LEGACY()
//   In Part A:
//     masterRefineryProcess()      → masterRefineryProcess_LEGACY()
//
// STEP 2 — Update all call sites:
//   In Part B, onEdit() calls runHardeningAudit(payload)
//     → change to runHardeningAudit_v2(payload)
//   In Part A, processIntakePayload() has no hardening audit call
//     → add runHardeningAudit_v2(rawJSONPayload) immediately after JSON.parse()
//
// STEP 3 — Wire Gem Setup Doc into deployment:
//   In Part A, deployFullSystem() Phase 4, after the personas.forEach() loop:
//     → add: _createGemSetupDoc(folders.FOUNDATION);
//
// STEP 4 — Rename v2 functions to canonical names:
//   masterRefineryProcess_v2() → masterRefineryProcess()
//   runHardeningAudit_v2()     → runHardeningAudit()
//   (or leave as _v2 and update all call sites — both approaches work)
//
// STEP 5 — Update onOpen() menu in Part A:
//   The menu item 'masterRefineryProcess' resolves by function name string.
//   If you renamed to masterRefineryProcess_v2, update the addItem() call:
//     .addItem('Master Intake Pipeline (Single Click)', 'masterRefineryProcess_v2')
//
// ============================================================================
// END OF KOS MASTER SCRIPT v6.1 PART C
// ============================================================================
