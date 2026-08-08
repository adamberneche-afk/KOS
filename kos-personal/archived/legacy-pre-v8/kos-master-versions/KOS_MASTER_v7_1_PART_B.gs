// ============================================================================
// KOS MASTER SCRIPT v7.0 — PART B of 3
// Paste immediately below Part A.
// ============================================================================


// ============================================================================
// SECTION 7: PHASE 1 — INTAKE, QUARANTINE & CHUNKING
//
// Architecture change (v7.2):
//   Chunking is now part of Phase 1 — not a separate Phase 2.
//   Each chunk becomes its own Google Doc in 03.4_RAW_EXHAUST.
//   STAGING_PIPELINE receives one lightweight tracking row per chunk:
//     [Timestamp, Chunk_ID, Smart_Chip_URL, File_ID, Status]
//   No text payload in the sheet. All content lives in Drive docs.
//   Inference_Buffer sheet is retired — Phase 4 reads STAGING_PIPELINE directly.
// ============================================================================

/**
 * Phase 1 — Unified Intake, Quarantine, and Chunking.
 *
 * Pipeline:
 *   1. Read and validate Drop Zone content
 *   2. Deduplicate via content hash (Differential Read)
 *   3. Harden the payload (Calibration Wall scan)
 *   4. Create one quarantine doc for the raw log
 *   5. Chunk the log semantically (8000-char limit, [🧠 RTP delimiter)
 *   6. Write each chunk to its own Google Doc in 03.4_RAW_EXHAUST
 *   7. Log one lightweight tracking row per chunk to STAGING_PIPELINE
 *      (UID, Smart Chip link, File ID, status = PENDING_INFERENCE — no text)
 *   8. Clear Drop Zone, print receipt
 */
function processManualSync() {
  const ui   = DocumentApp.getUi();
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();

  try {
    const rawText = body.getText().replace(CFG.GUARD_TXT, '').trim();
    if (rawText.length < 50) {
      ui.alert('Payload Insufficient', 'Paste a full session log before processing.', ui.ButtonSet.OK);
      return;
    }

    // Hardening audit — Calibration Wall scan before anything enters the system
    runHardeningAudit(rawText);

    // Content-hash deduplication — prevents re-processing the same log
    const logUUID = _generateLogUUID(rawText);
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);

    if (staging.getRange('B:B').getValues().flat().includes(logUUID)) {
      throw new Error('Duplicate Session Detected: Log hash already exists in the Pipeline.');
    }

    const rawFolder = _getSystemAsset('03.4_RAW_EXHAUST', 'ID_00_RAW_EXHAUST', true);

    // ── QUARANTINE: Archive the raw log as a single doc ───────────────────────
    const rawDoc  = DocumentApp.create(`[RAW]_${logUUID}`);
    const rawFile = DriveApp.getFileById(rawDoc.getId());
    rawDoc.getBody().setText(rawText);
    rawDoc.saveAndClose();                                    // Release file lock before move
    rawFile.moveTo(rawFolder);
    rawFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);

    // ── CHUNK: Split log into semantically bounded docs ───────────────────────
    const chunks       = _semanticChunker(rawText);
    const chunkReceipt = [];

    chunks.forEach((chunkText, idx) => {
      const chunkId  = `${logUUID}_CH${(idx + 1).toString().padStart(2, '0')}`;
      const docName  = `[CHUNK]_${chunkId}`;

      // Create individual chunk doc — content in Drive, not in sheet
      const chunkDoc  = DocumentApp.create(docName);
      const chunkFile = DriveApp.getFileById(chunkDoc.getId());

      // Write chunk content with header for Curator Gem context
      const chunkBody = chunkDoc.getBody();
      chunkBody.appendParagraph(`CHUNK: ${chunkId}`)
               .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      chunkBody.appendParagraph(
        `Session: ${logUUID} | Chunk ${idx + 1} of ${chunks.length} | ` +
        `Characters: ${chunkText.length}`
      ).setItalic(true);
      chunkBody.appendHorizontalRule();
      chunkBody.appendParagraph(chunkText);

      chunkDoc.saveAndClose();                               // Release lock before move
      chunkFile.moveTo(rawFolder);
      chunkFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);

      // Lightweight tracking row — Smart Chip + File ID only, no text payload
      const fileUrl = _getSafeFileUrl(chunkFile, chunkFile.getId());
      staging.appendRow([
        new Date(),            // Col A: Timestamp
        chunkId,               // Col B: Chunk_ID (used for dedup + Phase 4 lookup)
        '',                    // Col C: Smart Chip (injected below)
        chunkFile.getId(),     // Col D: File_ID (Phase 4 opens doc by this ID)
        'PENDING_INFERENCE'    // Col E: Status (Phase 4 filters on this)
      ]);
      // Inject Smart Chip into Col C of the new row
      _writeSmartChip(staging, staging.getLastRow(), 3, docName, fileUrl);

      chunkReceipt.push({ id: chunkId, row: staging.getLastRow(), url: fileUrl });
    });

    SpreadsheetApp.flush();
    _resetDropZone(body);

    // Build receipt for user
    const receiptLines = chunkReceipt.map((c, i) =>
      `  ${i + 1}. ${c.id} → Row ${c.row}`
    ).join('\n');

    ui.alert('✅ Phase 1 Complete',
      `LOG_UUID: ${logUUID}\n` +
      `Chunks created: ${chunks.length}\n\n` +
      `Chunk tracking rows in STAGING_PIPELINE:\n${receiptLines}\n\n` +
      'NEXT STEPS:\n' +
      '1. Open each chunk doc from STAGING_PIPELINE (Col C Smart Chip links)\n' +
      '2. Copy the chunk text → send to Curator Gem → get JSON back\n' +
      '3. Paste the Curator JSON back into the chunk doc, below the original text\n' +
      '4. Change Col E in STAGING_PIPELINE from PENDING_INFERENCE → BUFFERED\n' +
      '5. Repeat for all chunks, then run Phase 4 (Process Intake Payloads)',
      ui.ButtonSet.OK);

  } catch (e) {
    ui.alert('❌ PHASE 1 FAILURE', e.toString(), ui.ButtonSet.OK);
  }
}


// ============================================================================
// SECTION 8: SEMANTIC CHUNKER UTILITY
// Used by processManualSync(). Splits on [🧠 RTP delimiter, respects 8000-char limit.
// ============================================================================

/**
 * Splits text on CFG.DELIMITER boundaries, respecting CFG.MAX_CHUNK_SIZE.
 * Preserves the [🧠 RTP prefix on each split segment.
 * @param {string} text
 * @returns {string[]}
 */
function _semanticChunker(text) {
  const rawSplits = text.split(CFG.DELIMITER);
  const chunks    = [];
  let   current   = '';

  rawSplits.forEach((split, idx) => {
    if (!split.trim()) return;
    const block = (idx === 0 && !text.startsWith(CFG.DELIMITER))
      ? split
      : CFG.DELIMITER + split;

    if ((current.length + block.length) > CFG.MAX_CHUNK_SIZE) {
      if (current) chunks.push(current.trim());
      current = block;
    } else {
      current += (current ? '\n\n' : '') + block;
    }
  });

  if (current) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}


// ============================================================================
// SECTION 9: PHASE 2 — RETIRED
// Phase 2 (separate chunking step) is retired.
// Chunking now happens inside Phase 1 (processManualSync).
// This function is preserved as a no-op stub so any existing menu references
// or scheduled triggers don't throw a missing function error.
// ============================================================================

function processPhase2Chunking() {
  DocumentApp.getUi().alert(
    'Phase 2 Retired',
    'Chunking is now part of Phase 1 (Process Session Log).\n\n' +
    'Run 🧠 Council → Process Session Log (Phase 1) to intake and chunk in one step.',
    DocumentApp.getUi().ButtonSet.OK
  );
}


// ============================================================================
// SECTION 10: PHASE 2.5 — CHUNK EXPORT HELPER (UPDATED)
// Surfaces chunk doc links from STAGING_PIPELINE for Curator Gem processing.
// No longer reads Inference_Buffer — reads STAGING_PIPELINE by status.
// ============================================================================

/**
 * Displays all PENDING_INFERENCE chunk rows from STAGING_PIPELINE.
 * Each row shows the Chunk_ID and File_ID so the user can open the doc,
 * copy the text, run it through the Curator Gem, paste JSON back,
 * and mark the row BUFFERED.
 */
function exportChunksForCurator() {
  const ui = DocumentApp.getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data    = staging.getDataRange().getValues();

    const pending = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][4] === 'PENDING_INFERENCE') {
        pending.push({
          row     : i + 1,
          chunkId : data[i][1],   // Col B: Chunk_ID
          fileId  : data[i][3],   // Col D: File_ID
        });
      }
    }

    if (pending.length === 0) {
      ui.alert('No Pending Chunks',
        'No PENDING_INFERENCE rows found in STAGING_PIPELINE.\n\n' +
        'Run Phase 1 (Process Session Log) first.',
        ui.ButtonSet.OK);
      return;
    }

    const lines = pending.map((c, i) =>
      `  ${i + 1}. Row ${c.row}: ${c.chunkId}`
    ).join('\n');

    ui.alert(`${pending.length} Chunk(s) Awaiting Curator`,
      `Pending chunks in STAGING_PIPELINE:\n\n${lines}\n\n` +
      'For each chunk:\n' +
      '1. Open the doc via the Smart Chip in STAGING_PIPELINE Col C\n' +
      '2. Copy the chunk text → Curator Gem → get JSON back\n' +
      '3. Paste the JSON below the chunk text in the doc\n' +
      '4. Set STAGING_PIPELINE Col E = BUFFERED for that row\n\n' +
      'Then run Phase 4 (Process Intake Payloads).',
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Export Failed', e.toString(), ui.ButtonSet.OK);
  }
}


// ============================================================================
// SECTION 11: PHASE 3 — INFERENCE CONSOLIDATION (UPDATED)
// Now reads vector_weights from BUFFERED chunk docs directly via File_ID,
// rather than reading from the retired Inference_Buffer sheet.
// The Curator JSON is embedded in the chunk doc body below the original text.
// [PRE-SMP] Simple mean — superseded by Vector_Router.gs.
// ============================================================================

function consolidateInferenceChunks() {
  const ui = DocumentApp.getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data    = staging.getDataRange().getValues();

    const aggregated = {};
    let   processed  = 0, errors = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i][4] !== 'BUFFERED') continue;

      const fileId  = data[i][3]; // Col D: File_ID
      if (!fileId) continue;

      try {
        // Read the chunk doc — Curator JSON is appended below the original text
        const docText = DocumentApp.openById(fileId).getBody().getText();

        // Extract JSON: find the last { ... } block in the document
        // The Curator pastes JSON after the original chunk text
        const jsonMatch = docText.match(/\{[\s\S]*\}(?=[^}]*$)/);
        if (!jsonMatch) {
          staging.getRange(i + 1, 5).setValue('PARSE_ERROR: No JSON found in doc');
          errors++;
          continue;
        }

        const clean  = jsonMatch[0].replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        const weights = parsed.vector_weights;

        if (weights && typeof weights === 'object' && weights !== 'UNAVAILABLE — Vector_Router.gs output missing') {
          Object.entries(weights).forEach(([theme, val]) => {
            const score = parseFloat(val);
            if (isNaN(score)) return;
            if (!aggregated[theme]) aggregated[theme] = { sum: 0, count: 0 };
            aggregated[theme].sum   += score;
            aggregated[theme].count += 1;
          });
        }

        staging.getRange(i + 1, 5).setValue('CONSOLIDATED');
        processed++;
      } catch (e) {
        staging.getRange(i + 1, 5).setValue(`PARSE_ERROR: ${e.message}`);
        errors++;
      }
    }

    if (processed === 0) {
      ui.alert('Nothing to Consolidate',
        'No BUFFERED rows found in STAGING_PIPELINE.\n\n' +
        'Open each chunk doc, paste Curator JSON, then set Col E = BUFFERED.',
        ui.ButtonSet.OK);
      return;
    }

    const primer = {
      consolidated_at : new Date().toISOString(),
      chunk_count     : processed,
      vector_weights  : {}
    };

    Object.entries(aggregated).forEach(([theme, d]) => {
      primer.vector_weights[theme] = parseFloat((d.sum / d.count).toFixed(4));
    });

    PropertiesService.getScriptProperties().setProperty('SESSION_VECTOR_PRIMER', JSON.stringify(primer));
    SpreadsheetApp.flush();

    const lines = Object.entries(primer.vector_weights)
                        .map(([k, v]) => `  ${k.padEnd(25)} ${v}`);
    ui.alert('✅ Phase 3 Complete',
      `Consolidated ${processed} chunk(s).\n` +
      (errors > 0 ? `⚠ ${errors} error(s) — check STAGING_PIPELINE Col E.\n\n` : '\n') +
      `Vectors:\n${lines.join('\n')}\n\nRun Get Startup Primer to copy the formatted block.`,
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ PHASE 3 FAILURE', e.toString(), ui.ButtonSet.OK);
  }
}


// ============================================================================
// SECTION 12: PHASE 4 — CURATOR JSON INTAKE PIPELINE (UPDATED)
// Reads BUFFERED rows from STAGING_PIPELINE by File_ID.
// Opens each chunk doc, extracts the Curator JSON from the doc body,
// processes through processIntakePayload(), moves doc to 03.3_PROCESSED_EXHAUST.
// ============================================================================

/**
 * Phase 4 — reads all BUFFERED chunk rows from STAGING_PIPELINE,
 * opens each chunk doc by File_ID, extracts the embedded Curator JSON,
 * processes it through the intake pipeline, and moves the doc to
 * 03.3_PROCESSED_EXHAUST on success.
 */
function runIntakePipelineFromBuffer() {
  const ui = DocumentApp.getUi();
  try {
    const props       = PropertiesService.getScriptProperties();
    const processedId = props.getProperty('ID_03_3_PROCESSED');

    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data    = staging.getDataRange().getValues();
    let   processed = 0, errors = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i][4] !== 'BUFFERED') continue;

      const fileId = data[i][3]; // Col D: File_ID
      if (!fileId) continue;

      try {
        // Open the chunk doc and extract the last JSON block
        const docText  = DocumentApp.openById(fileId).getBody().getText();
        const jsonMatch = docText.match(/\{[\s\S]*\}(?=[^}]*$)/);

        if (!jsonMatch) {
          staging.getRange(i + 1, 5).setValue('INTAKE_ERROR: No JSON found in doc');
          errors++;
          continue;
        }

        const raw    = jsonMatch[0].replace(/```json|```/g, '').trim();
        const result = processIntakePayload(raw);

        if (result.status === 'SUCCESS') {
          staging.getRange(i + 1, 5).setValue('INTAKE_PROCESSED');

          // Move processed chunk doc to 03.3_PROCESSED_EXHAUST
          if (processedId) {
            try {
              DriveApp.getFileById(fileId)
                      .moveTo(DriveApp.getFolderById(processedId));
            } catch (moveErr) {
              console.warn(`[Phase4] Could not move doc ${fileId}: ${moveErr.message}`);
            }
          }
          processed++;
        } else {
          staging.getRange(i + 1, 5).setValue(`INTAKE_ERROR: ${result.message}`);
          errors++;
        }
      } catch (e) {
        staging.getRange(i + 1, 5).setValue(`INTAKE_ERROR: ${e.message}`);
        errors++;
      }
    }

    if (processed > 0) SpreadsheetApp.flush();

    ui.alert('✅ Phase 4 Complete',
      `Processed ${processed} chunk(s) through the Intake Pipeline.\n` +
      `Processed docs moved to 03.3_PROCESSED_EXHAUST.\n` +
      (errors > 0 ? `⚠ ${errors} error(s) — check STAGING_PIPELINE Col E.` : 'No errors.'),
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ PHASE 4 FAILURE', e.toString(), ui.ButtonSet.OK);
  }
}


// ============================================================================
// SECTION 9: PHASE 3 — INFERENCE CONSOLIDATION
// Averages vector_weights across BUFFERED rows in Inference_Buffer.
// [PRE-SMP] Simple mean — superseded by Vector_Router.gs.
// ============================================================================

function consolidateInferenceChunks() {
  const ui = DocumentApp.getUi();
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const buffer = _getOrCreateSheet(ss, CFG.INFERENCE_BUFFER_SHEET);
    const data   = buffer.getDataRange().getValues();

    const aggregated = {};
    let   processed  = 0, errors = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i][4] !== 'BUFFERED') continue;
      try {
        // Strip markdown fences before parsing — handles Curator JSON with backtick wrappers
        const clean   = data[i][3].toString().replace(/```json|```/g, '').trim();
        const parsed  = JSON.parse(clean);
        // FIX: use vector_weights field (not .weights — stale field name from older schema)
        const weights = parsed.vector_weights;
        if (weights && typeof weights === 'object') {
          Object.entries(weights).forEach(([theme, val]) => {
            const score = parseFloat(val);
            if (isNaN(score)) return;
            if (!aggregated[theme]) aggregated[theme] = { sum: 0, count: 0 };
            aggregated[theme].sum   += score;
            aggregated[theme].count += 1;
          });
        }
        buffer.getRange(i + 1, 5).setValue('CONSOLIDATED');
        processed++;
      } catch (e) {
        buffer.getRange(i + 1, 5).setValue(`PARSE_ERROR: ${e.message}`);
        errors++;
      }
    }

    if (processed === 0) {
      ui.alert('Nothing to Consolidate',
        'No BUFFERED rows in Inference_Buffer.\n\nPaste Curator JSON and set Status = BUFFERED, then re-run.',
        ui.ButtonSet.OK);
      return;
    }

    const primer = {
      consolidated_at : new Date().toISOString(),
      chunk_count     : processed,
      vector_weights  : {}
    };

    Object.entries(aggregated).forEach(([theme, d]) => {
      primer.vector_weights[theme] = parseFloat((d.sum / d.count).toFixed(4));
    });

    PropertiesService.getScriptProperties().setProperty('SESSION_VECTOR_PRIMER', JSON.stringify(primer));
    SpreadsheetApp.flush();

    const lines = Object.entries(primer.vector_weights).map(([k, v]) => `  ${k.padEnd(25)} ${v}`);
    ui.alert('✅ Phase 3 Complete',
      `Consolidated ${processed} chunk(s).\n` +
      (errors > 0 ? `⚠ ${errors} parse error(s) — check Inference_Buffer.\n\n` : '\n') +
      `Vectors:\n${lines.join('\n')}\n\nRun Get Startup Primer to copy the formatted block.`,
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ PHASE 3 FAILURE', e.toString(), ui.ButtonSet.OK);
  }
}


// ============================================================================
// SECTION 10: PHASE 4 — CURATOR JSON INTAKE PIPELINE
// runIntakePipelineFromBuffer() is the menu wrapper.
// processIntakePayload() is the core processor — also callable directly.
// ============================================================================

/**
 * Phase 4 menu wrapper. Reads all BUFFERED rows from Inference_Buffer
 * and processes each through processIntakePayload().
 */
function runIntakePipelineFromBuffer() {
  const ui = DocumentApp.getUi();
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const buffer = _getOrCreateSheet(ss, CFG.INFERENCE_BUFFER_SHEET);
    const data   = buffer.getDataRange().getValues();
    let processed = 0, errors = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i][4] !== 'BUFFERED') continue;
      const raw    = data[i][3].toString().replace(/```json|```/g, '').trim();
      const result = processIntakePayload(raw);
      if (result.status === 'SUCCESS') {
        buffer.getRange(i + 1, 5).setValue('INTAKE_PROCESSED');
        processed++;
      } else {
        buffer.getRange(i + 1, 5).setValue(`INTAKE_ERROR: ${result.message}`);
        errors++;
      }
    }

    if (processed > 0) SpreadsheetApp.flush();
    ui.alert('✅ Phase 4 Complete',
      `Processed ${processed} payload(s).\n` +
      (errors > 0 ? `⚠ ${errors} error(s) — check Inference_Buffer Status column.` : 'No errors.'),
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ PHASE 4 FAILURE', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Core CURATOR JSON processor. Validates payload, extracts all pointers
 * from PropertiesService, writes to CURRENT_STATE, PIVOTS_AND_LESSONS,
 * MATRIX_LEDGER, and routes high-weight vectors.
 *
 * @param {string} rawJSONPayload - Stringified CURATOR session JSON.
 * @returns {{ status, data?, vectorRouting? }|{ status, message }}
 */
function processIntakePayload(rawJSONPayload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { status: 'LOCKED', message: 'System busy — try again.' };
  }
  try {
    // Gateway: parse + harden
    let payload;
    try {
      payload = JSON.parse(rawJSONPayload);
    } catch (e) {
      throw new Error('Invalid JSON — Curator payload malformed: ' + e.message);
    }
    runHardeningAudit(rawJSONPayload);

    // Engine status soft check — never blocks, logs COLD ENGINE warnings to console
    const engineStatus = _checkEngineStatus();
    if (engineStatus.warnings.length > 0) {
      console.warn('[ENGINE_STATUS] ' + engineStatus.warnings.join(' | '));
    }

    // Pointer extraction (PIVOT 004) — nothing hardcoded past this point
    const props          = PropertiesService.getScriptProperties();
    const currentStateId = props.getProperty('ID_CURRENT_STATE');
    const indexSheetId   = props.getProperty('INDEX_ID');
    const vectorFolderId = props.getProperty('ID_05_VECTOR_REPOSITORY');
    const pivotDocId     = props.getProperty('ID_PIVOTS_AND_LESSONS');

    if (!currentStateId || !indexSheetId || !vectorFolderId || !pivotDocId) {
      throw new Error(
        'Architectural Fault: Core pointers missing. ' +
        'Run 🚀 Deploy → Deploy Full System or 🧠 Council → Setup Routing Properties.'
      );
    }

    const timestamp  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const sessionUid = 'LOG_' + new Date().getTime();
    const stateDoc   = DocumentApp.openById(currentStateId);
    const pivotDoc   = DocumentApp.openById(pivotDocId);
    const indexSheet = SpreadsheetApp.openById(indexSheetId);

    // Write next_steps to CURRENT_STATE
    if (payload.dynamic_state?.next_steps?.length > 0) {
      const body = stateDoc.getBody();
      body.appendParagraph(`\n[State Sync: ${timestamp} | ${sessionUid}]`)
          .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      body.appendParagraph('NEXT STEPS:').setBold(true);
      payload.dynamic_state.next_steps.forEach(s => body.appendListItem(s));
    }

    // Write pivots_and_lessons to PIVOTS_AND_LESSONS
    if (payload.dynamic_state?.pivots_and_lessons?.length > 0) {
      const body = pivotDoc.getBody();
      body.appendParagraph(`\n[Session Logged: ${timestamp} | ${sessionUid}]`)
          .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      payload.dynamic_state.pivots_and_lessons.forEach(p => body.appendListItem(p));
    }

    // [PRE-SMP] Write to MATRIX_LEDGER — static 4-vector schema
    // Do not extend columns here — extend in Vector_Router.gs instead.
    const ledger = indexSheet.getSheetByName(CFG.MATRIX_LEDGER_SHEET);
    if (ledger) {
      const w    = payload.vector_weights || {};
      const arch = parseFloat(w.ARCHITECTURE) || 0;
      const ui   = parseFloat(w.UI)           || 0;
      const sec  = parseFloat(w.SECURITY)     || 0;
      const ped  = parseFloat(w.PEDAGOGY)     || 0;
      ledger.appendRow([sessionUid, timestamp, arch, ui, sec, ped, (arch + ui + sec + ped).toFixed(4)]);
    }

    const vectorResult = executeVectorRouting(payload, { vectorFolderId, sessionUid, timestamp });
    return { status: 'SUCCESS', data: payload, vectorRouting: vectorResult };

  } catch (error) {
    console.error('[Intake] Fault: ' + error.message);
    return { status: 'ERROR', message: error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Routes high-weight vectors to VECTOR_ docs. [PRE-SMP] Binary threshold.
 * @param {Object} payload
 * @param {{ vectorFolderId, sessionUid, timestamp }} pointers
 * @returns {{ status, routedCount }|{ status, message }}
 */
function executeVectorRouting(payload, pointers) {
  try {
    const folder  = DriveApp.getFolderById(pointers.vectorFolderId);
    const weights = payload.vector_weights || {};
    let   routed  = 0;

    for (const [topic, val] of Object.entries(weights)) {
      const w = parseFloat(val);
      if (isNaN(w) || w <= CFG.VECTOR_THRESHOLD) continue;
      const doc  = _getOrCreateDoc('VECTOR_' + topic.toUpperCase().trim(), folder);
      const body = doc.getBody();
      body.appendParagraph(
        `\n[Vector Seed: ${pointers.timestamp} | ${pointers.sessionUid} | Weight: ${w}]`
      ).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      if (payload.session_summary) body.appendParagraph(payload.session_summary);
      routed++;
    }
    console.log(`[VectorRouter] Routed to ${routed} vector doc(s).`);
    return { status: 'SUCCESS', routedCount: routed };
  } catch (e) {
    console.error('[VectorRouter] Fault: ' + e.message);
    return { status: 'ERROR', message: e.message };
  }
}


// ============================================================================
// SECTION 11: GOVERNANCE ENGINE — HITL CI/CD PIPELINE
// Uses an installable trigger (not simple onEdit) because this script is
// bound to a Google Doc — a simple onEdit cannot fire on a spreadsheet.
// Run setupGovernanceTrigger() once after Deploy to install the listener.
// ============================================================================

/**
 * Installs an installable onEdit trigger on BRAIN_TRUST_INDEX.
 * Removes duplicate triggers before creating. Run once after Deploy.
 */
function setupGovernanceTrigger() {
  const ui = DocumentApp.getUi();
  try {
    // Remove any existing governance triggers to prevent duplicates
    ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === 'onGovernanceEdit')
      .forEach(t => ScriptApp.deleteTrigger(t));

    const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    ScriptApp.newTrigger('onGovernanceEdit')
      .forSpreadsheet(ss)
      .onEdit()
      .create();

    ui.alert('✅ Governance Trigger Installed',
      'onGovernanceEdit() is now listening to BRAIN_TRUST_INDEX.\n\n' +
      'Check the Deploy_Trigger checkbox (Column L) in the Blackboard sheet to execute a staged mutation.',
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Trigger Setup Failed', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Governance Engine event handler — fires when Column L checkbox is checked.
 * Reads execution packet, routes by mutation type, writes status to Column K.
 *
 * Blackboard schema (1-indexed):
 *   A: Target_Doc_ID  B: CE_Tag  C: Doc_Title  D: Version  E: Find_String
 *   F: Replace_Payload  G: Alt_Doc_ID  H: Notes  I: Filed_By  J: Filed_Date
 *   K: Status  L: Deploy_Trigger (checkbox)
 */
function onGovernanceEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.source.getActiveSheet();
  const row   = e.range.getRow();
  const col   = e.range.getColumn();

  const isTarget = (sheet.getName() === CFG.BLACKBOARD_SHEET ||
                    sheet.getName().indexOf('CE-LOG') !== -1);
  if (!isTarget || col !== 12 || e.range.getValue() !== true || row <= 1) return;

  try {
    const data     = sheet.getRange(row, 1, 1, 11).getValues()[0];
    const docId    = data[0] || data[6];    // Col A primary, Col G alternate
    const ceTag    = data[1];               // Col B: CE_Tag
    const findStr  = data[4];               // Col E: Find_String
    const payload  = data[5];               // Col F: Replace_Payload

    runHardeningAudit(payload);

    // Detect mutation type by content: empty find string = APPEND, otherwise FIND_REPLACE
    let success;
    if (!findStr || findStr.toString().trim() === '') {
      success = _handleAppendBottom(docId, payload);
    } else {
      success = applyMutation(docId, findStr, payload);
    }

    if (success) {
      sheet.getRange(row, 11).setValue('DEPLOYED: ' + new Date().toLocaleString());
      sheet.getRange(row, 12).setValue(false);
      e.source.toast('Mutation Deployed Successfully.', 'Governance Engine', 5);
    }
  } catch (err) {
    sheet.getRange(row, 11).setValue('FAILED: ' + err.message);
    sheet.getRange(row, 12).setValue(false);
    e.source.toast('Mutation Failed. Check Status column.', 'System Alert', 10);
  }
}

/**
 * Strict Find/Replace mutation executor. Throws if Find_String not found exactly.
 */
function applyMutation(docId, searchTag, payload) {
  if (!docId || !searchTag) {
    throw new Error('Missing Document ID or Search Tag.');
  }
  const body    = DocumentApp.openById(docId).getBody();
  const found   = body.findText(searchTag);
  if (!found) {
    throw new Error(`Strict Match Failed: "${searchTag}" not found in document. Verify before retrying.`);
  }
  found.getElement().asText().replaceText(searchTag, payload);
  return true;
}

function _handleAppendBottom(docId, payload) {
  if (!docId) throw new Error('APPEND_BOTTOM: Missing Document ID.');
  DocumentApp.openById(docId).getBody().appendParagraph(
    `\n[Appended: ${new Date().toLocaleString()}]\n` + payload
  );
  return true;
}


// ============================================================================
// SECTION 12: COUNCIL SIMULATOR — DIFFERENTIAL READ PAYLOAD GENERATOR
// Only generates a council prompt if CURRENT_STATE has changed since last run.
// ============================================================================

function generateCouncilInputPayload() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    ui.alert('System Busy', 'Could not acquire lock. Try again.', ui.ButtonSet.OK);
    return { status: 'LOCKED' };
  }
  try {
    const props           = PropertiesService.getScriptProperties();
    const stateId         = props.getProperty('ID_CURRENT_STATE');
    const pivotId         = props.getProperty('ID_PIVOTS_AND_LESSONS');
    const exhaustFolderId = props.getProperty('ID_00_RAW_EXHAUST');

    if (!stateId || !pivotId || !exhaustFolderId) {
      throw new Error('Core pointers missing. Run Deploy or Setup Routing Properties.');
    }

    // Differential Read: skip if CURRENT_STATE unchanged since last run
    const stateFile   = DriveApp.getFileById(stateId);
    const lastRunTime = parseInt(props.getProperty('COUNCIL_LAST_RUN') || '0', 10);
    if (stateFile.getLastUpdated().getTime() <= lastRunTime) {
      ui.alert('System Stasis',
        'No new exhaust since last run. CURRENT_STATE unchanged. Council sleeping.',
        ui.ButtonSet.OK);
      return { status: 'SLEEPING' };
    }

    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const docName   = 'CE: COUNCIL_PAYLOAD_' + timestamp;

    const payloadDoc = DocumentApp.create(docName);
    const body       = payloadDoc.getBody();

    body.appendParagraph('[🧠 RTP COUNCIL INITIATION STUB]').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`System State: ${timestamp}\n`);
    body.appendParagraph('1. THE CONTEXT').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(stateText + '\n');
    body.appendParagraph('2. THE LAWS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(pivotText + '\n');
    body.appendParagraph('3. INFERENCE INSTRUCTIONS FOR WORKSPACE STUDIO').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(
      'Using the attached Persona files, act as the Architect, Auditor, and Muse. ' +
      'Evaluate the Context against the Laws. Output using: ' +
      '[🏗 ARCHITECT FLAG], [⚖️ AUDITOR FLAG], [✨ MUSE FLAG].'
    ).setBold(true);

    payloadDoc.saveAndClose();
    DriveApp.getFileById(payloadDoc.getId()).moveTo(DriveApp.getFolderById(exhaustFolderId));
    props.setProperty('COUNCIL_LAST_RUN', new Date().getTime().toString());

    ui.alert('✅ Council Payload Generated', `Doc: ${docName}\nRouted to RAW_EXHAUST.`, ui.ButtonSet.OK);
    return { status: 'SUCCESS', docName };
  } catch (e) {
    ui.alert('❌ Council Simulator Failed', e.toString(), ui.ButtonSet.OK);
    return { status: 'ERROR', message: e.message };
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// SECTION 13: SWEEPERS
// runSemanticSweeper: optimized O(N) server-side search, full CE-tag taxonomy.
// sweepRootForExhaust: narrow Google Docs CE: prefix only.
// setupRoutingProperties: public re-index after manual folder moves.
// ============================================================================

/**
 * Full semantic sweeper. Uses server-side searchFiles() for O(N) performance.
 * Routes CE-tagged files to SMP-001 taxonomy folders, logs Smart Chip entries.
 * Recommended: set a 15-minute time-driven trigger via initializeTriggers().
 */
function runSemanticSweeper() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    ui.alert('Sweeper Busy', 'Already running. Try again in a moment.', ui.ButtonSet.OK);
    return;
  }
  try {
    const props = PropertiesService.getScriptProperties();

    // O(N) optimized: Google backend filters — only returns CE-tagged, un-UID'd files
    const files = DriveApp.getRootFolder().searchFiles(CFG.SWEEPER_QUERY);

    const ss     = _getBrainTrustIndex();
    const ledger = _getOrCreateSheet(ss, CFG.EXECUTION_LEDGER_SHEET);

    let processed = 0, skipped = 0, nullPointer = 0;

    while (files.hasNext()) {
      const file     = files.next();
      const fileName = file.getName();

      // Match against full CE-tag taxonomy
      let matchedTag = null, propKey = null;
      for (const [tag, key] of Object.entries(CFG.TAG_TO_PROP_KEY)) {
        if (fileName.startsWith(tag + ':') || fileName.startsWith(tag + ' ')) {
          matchedTag = tag; propKey = key; break;
        }
      }

      if (!matchedTag) { skipped++; continue; }

      const folderId = props.getProperty(propKey);
      if (!folderId) {
        console.warn(`[Sweeper] Null pointer for "${matchedTag}". Run setupRoutingProperties().`);
        nullPointer++;
        continue;
      }

      const uid     = '[UID_DOC_' + new Date().getTime() + ']';
      const newName = `${uid} ${fileName}`;
      file.setName(newName);
      file.moveTo(DriveApp.getFolderById(folderId));

      // Smart Chip ledger entry (v6 improvement)
      const fileUrl = _getSafeFileUrl(file, file.getId());
      ledger.appendRow([uid, new Date(), matchedTag, '', 'ROUTED']);
      _writeSmartChip(ledger, ledger.getLastRow(), 4, newName, fileUrl);

      processed++;
      SpreadsheetApp.flush();
    }

    ui.alert('✅ Semantic Sweep Complete',
      `Routed: ${processed}\nNo CE-tag: ${skipped}\nNull pointer: ${nullPointer}`,
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Sweeper Failed', e.toString(), ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

/** Narrow exhaust sweeper — Google Docs with CE: prefix only. */
function sweepRootForExhaust() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const folderId = PropertiesService.getScriptProperties().getProperty('ID_00_RAW_EXHAUST');
    if (!folderId) throw new Error('ID_00_RAW_EXHAUST missing. Run setupRoutingProperties().');
    const folder = DriveApp.getFolderById(folderId);
    const docs   = DriveApp.getRootFolder().getFilesByType(MimeType.GOOGLE_DOCS);
    let   count  = 0;
    while (docs.hasNext()) {
      const f    = docs.next();
      const name = f.getName();
      if (name.indexOf('UID_') === -1 && name.indexOf('CE:') !== -1) {
        f.setName(`[UID_RAW_${new Date().getTime()}] ${name}`);
        f.moveTo(folder);
        count++;
        SpreadsheetApp.flush();
      }
    }
    ui.alert('✅ Exhaust Sweep', count > 0 ? `Swept ${count} CE: doc(s).` : 'No CE: docs found.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Exhaust Sweep Failed', e.toString(), ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Re-scans Drive and re-registers all folder/doc IDs to PropertiesService.
 * Use after manually moving or renaming folders without a full re-deploy.
 */
function setupRoutingProperties() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  function fetchId(name, isFolder) {
    const iter = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
    if (iter.hasNext()) return iter.next().getId();
    console.error(`⚠️ NOT FOUND: [${name}]`);
    return null;
  }

  const map = {
    'ID_01_1_SCRIPTS'          : fetchId('01.1_SCRIPTS',             true),
    'ID_01_2_SOP_AND_FLOWS'    : fetchId('01.2_SOP_AND_FLOWS',       true),
    'ID_01_3_SMP_PROPOSALS'    : fetchId('01.3_SMP_PROPOSALS',       true),
    'ID_02_COUNCIL_ALIGNMENTS' : fetchId('02_Council_Alignments',    true),
    'ID_03_DYNAMIC_STATE'      : fetchId('03_Dynamic_State',         true),
    'ID_00_RAW_EXHAUST'        : fetchId('03.4_RAW_EXHAUST',         true),
    'ID_04_COUNCIL_LOGS'       : fetchId('04_Council_Logs',          true),
    'ID_04_1_ARCHITECT'        : fetchId('04.1_ARCHITECT_SILO',      true),
    'ID_04_2_AUDITOR'          : fetchId('04.2_AUDITOR_SILO',        true),
    'ID_04_3_MUSE'             : fetchId('04.3_MUSE_SILO',           true),
    'ID_04_4_DEVELOPER'        : fetchId('04.4_DEVELOPER_SILO',      true),
    'ID_04_5_ALIGNER'          : fetchId('04.5_ALIGNER_SILO',        true),
    'ID_04_6_CURATOR'          : fetchId('04.6_CURATOR_SILO',        true),
    'ID_04_7_RTP'              : fetchId('04.7_RTP_SILO',            true),
    'ID_04_8_GRAVEYARD'        : fetchId('04.8_COG_GRAVEYARD',       true),
    'ID_05_VECTOR_REPOSITORY'  : fetchId('05_Vector_Repository',     true),
    'ID_06_1_LESSON_PLANS'     : fetchId('06.1_LESSON_PLANS',        true),
    'ID_06_2_STUDENT_FACING'   : fetchId('06.2_STUDENT_FACING',      true),
    'ID_06_3_ASSESSMENTS'      : fetchId('06.3_ASSESSMENTS',         true),
    'ID_06_4_COMMUNICATIONS'   : fetchId('06.4_COMMUNICATIONS',      true),
    'ID_07_MEMORY_VAULT'       : fetchId('07_Memory_Vault',          true),
    'ID_08_PROJECT_AUTOPSIES'  : fetchId('08_Project_Autopsies',     true),
    'ID_CCPS_MASTER_TEMPLATES' : fetchId('CCPS_MASTER_TEMPLATES',    true),
    'FOLDER_ID'                : fetchId('03.4_RAW_EXHAUST',         true),
    'INDEX_ID'                 : fetchId('BRAIN_TRUST_INDEX',        false),
    'ID_CURRENT_STATE'         : fetchId('CURRENT_STATE',            false),
    'ID_PIVOTS_AND_LESSONS'    : fetchId('PIVOTS_AND_LESSONS_V1.0',  false),
    'ID_CORE_THESIS'           : fetchId('CORE_THESIS',              false),  // Gap 7 — required by Identity Key
    'ID_SYSTEM_TELEMETRY'      : fetchId('SYSTEM_TELEMETRY',         false),  // Gap 5 — telemetry pointer
  };

  let ok = 0, missing = 0;
  Object.entries(map).forEach(([key, id]) => {
    if (id) { props.setProperty(key, id); ok++; }
    else    { missing++; }
  });

  // Dual-register INDEX_ID for v6 compatibility
  const indexId = props.getProperty('INDEX_ID');
  if (indexId) props.setProperty('ID_BRAIN_TRUST_INDEX', indexId);

  const msg = missing === 0
    ? `✅ All ${ok} routing properties registered.`
    : `⚠ ${ok} registered, ${missing} not found — check execution log.`;
  ui.alert('Setup Routing Properties', msg, ui.ButtonSet.OK);
}

// ============================================================================
// END OF PART B
// Paste Part C immediately below this line.
// ============================================================================
