// ============================================================================
// KOS MASTER SCRIPT v8.0 — PART B of 4
// Paste immediately below Part A.
// ============================================================================


// ============================================================================
// SECTION 7: COLD ENGINE GATE (V3.4)
// TIER_1: warns and asks user permission to continue — soft gate
// TIER_2: hard blocks — throws if engine is cold
// Called at the top of sensitive functions before any processing occurs.
// ============================================================================

/**
 * Checks whether the engine is armed (Identity Key generated, thesis verified).
 * TIER_1: warns user and asks to continue — used for intake functions
 * TIER_2: hard blocks with throw — used for vector processing and context building
 *
 * @param {string} callerFunction - Name of the calling function (for error message)
 * @param {string} tier           - 'TIER_1' | 'TIER_2'
 * @throws {Error} On TIER_2 cold engine, or if user cancels TIER_1 warning
 */
function _coldEngineGate(callerFunction, tier) {
  const props  = PropertiesService.getScriptProperties();
  const isCold = !props.getProperty('RTP_IDENTITY_HASH') ||
                 props.getProperty(CFG.PROP.THESIS_VERIFIED) !== 'true';
  if (!isCold) return; // Armed — pass through

  let ui;
  try { ui = DocumentApp.getUi(); } catch (_) {}

  if (tier === 'TIER_2') {
    if (ui) ui.alert(
      '🔒 Engine COLD — Access Blocked',
      `${callerFunction} requires an armed Identity Key.\n\n` +
      'Run 🧠 Council → Begin Socratic Onboarding to activate.',
      ui.ButtonSet.OK
    );
    throw new Error(`[COLD_ENGINE_TIER_2] ${callerFunction} blocked. Run Socratic Onboarding.`);
  }

  if (tier === 'TIER_1') {
    if (!ui) return; // Headless — allow through silently
    const go = ui.alert(
      '⚠ Engine COLD',
      `The engine is not yet armed. ${callerFunction} will run but vector scoring will be inactive.\n\n` +
      'Run 🧠 Council → Begin Socratic Onboarding to arm.\n\nContinue anyway?',
      ui.ButtonSet.YES_NO
    );
    if (go !== ui.Button.YES) {
      throw new Error(`[COLD_ENGINE_TIER_1] ${callerFunction} cancelled by user.`);
    }
  }
}


// ============================================================================
// SECTION 8: CENTRALIZED ERROR REPORTING (V3.4)
// Replaces scattered ui.alert('❌'...) calls throughout the codebase.
// Logs to console always; surfaces to UI when ui context is available.
// ============================================================================

/**
 * Centralized error handler. Logs to console and surfaces to UI if available.
 * Use this instead of inline ui.alert('❌'...) in every catch block.
 *
 * @param {string}    context - Function name where the error occurred
 * @param {Error}     e       - The caught error object
 * @param {Ui|null}   ui      - DocumentApp.getUi() instance, or null for headless
 */
function _reportError(context, e, ui) {
  const msg = `[KOS ERROR — ${context}]\n${e.toString()}`;
  console.error(msg);
  if (ui) {
    try {
      ui.alert(`❌ ${context} Failed`, e.toString(), ui.ButtonSet.OK);
    } catch (_) { /* UI not available — already logged to console */ }
  }
}


// ============================================================================
// SECTION 9: PHASE 1 — INTAKE, QUARANTINE & CHUNKING
// Chunking is integrated into Phase 1. Each chunk becomes its own Google Doc
// in 03.4_RAW_EXHAUST. STAGING_PIPELINE receives one lightweight tracking row
// per chunk (Timestamp, Chunk_ID, SmartChip, File_ID, Status). No text payloads.
// ============================================================================

function processManualSync() {
  const ui   = DocumentApp.getUi();
  const doc  = DocumentApp.getActiveDocument();
  const body = doc.getBody();

  try {
    _coldEngineGate('processManualSync', 'TIER_1');

    const rawText = body.getText().replace(CFG.GUARD_TXT, '').trim();
    if (rawText.length < 50) {
      ui.alert('Payload Insufficient', 'Paste a full session log before processing.', ui.ButtonSet.OK);
      return;
    }

    runHardeningAudit(rawText);

    const logUUID = _generateLogUUID(rawText);
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);

    if (staging.getRange('B:B').getValues().flat().includes(logUUID)) {
      throw new Error('Duplicate Session Detected: Log hash already exists in the Pipeline.');
    }

    const rawFolder = _getSystemAsset('03.4_RAW_EXHAUST', 'ID_00_RAW_EXHAUST', true);

    // Quarantine the full raw log as a single archive doc
    const rawDoc  = DocumentApp.create(`[RAW]_${logUUID}`);
    const rawFile = DriveApp.getFileById(rawDoc.getId());
    rawDoc.getBody().setText(rawText);
    rawDoc.saveAndClose();
    rawFile.moveTo(rawFolder);
    rawFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);

    // Chunk and write each chunk to its own Drive doc
    const chunks       = _semanticChunker(rawText);
    const chunkReceipt = [];

    chunks.forEach((chunkText, idx) => {
      const chunkId  = `${logUUID}_CH${(idx + 1).toString().padStart(2, '0')}`;
      const docName  = `[CHUNK]_${chunkId}`;
      const chunkDoc = DocumentApp.create(docName);
      const chunkFile = DriveApp.getFileById(chunkDoc.getId());

      const chunkBody = chunkDoc.getBody();
      chunkBody.appendParagraph(`CHUNK: ${chunkId}`)
               .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      chunkBody.appendParagraph(
        `Session: ${logUUID} | Chunk ${idx + 1} of ${chunks.length} | Chars: ${chunkText.length}`
      ).setItalic(true);
      chunkBody.appendHorizontalRule();
      chunkBody.appendParagraph(chunkText);

      chunkDoc.saveAndClose();
      chunkFile.moveTo(rawFolder);
      chunkFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);

      const fileUrl = _getSafeFileUrl(chunkFile, chunkFile.getId());
      staging.appendRow([new Date(), chunkId, '', chunkFile.getId(), 'PENDING_INFERENCE']);
      _writeSmartChip(staging, staging.getLastRow(), 3, docName, fileUrl);
      chunkReceipt.push({ id: chunkId, row: staging.getLastRow() });
    });

    SpreadsheetApp.flush();
    _advanceOnboardingDay();
    _resetDropZone(body);

    const lines = chunkReceipt.map((c, i) => `  ${i + 1}. ${c.id} → Row ${c.row}`).join('\n');
    ui.alert('✅ Phase 1 Complete',
      `LOG_UUID: ${logUUID}\nChunks created: ${chunks.length}\n\n` +
      `Chunk tracking rows in STAGING_PIPELINE:\n${lines}\n\n` +
      'NEXT STEPS:\n' +
      '② 🧠 Council → Review Chunks for Curator\n' +
      '   Open each chunk doc via Smart Chip in Col C\n' +
      '   Copy text → Curator Gem → paste JSON back into doc → set Col E = BUFFERED\n' +
      '③ 🧠 Council → Process Intake Payloads (Phase 4)',
      ui.ButtonSet.OK);

  } catch (e) { _reportError('processManualSync', e, ui); }
}

function _semanticChunker(text) {
  const rawSplits = text.split(CFG.DELIMITER);
  const chunks = [], current = { v: '' };
  rawSplits.forEach((split, idx) => {
    if (!split.trim()) return;
    const block = (idx === 0 && !text.startsWith(CFG.DELIMITER)) ? split : CFG.DELIMITER + split;
    if ((current.v.length + block.length) > CFG.MAX_CHUNK_SIZE) {
      if (current.v) chunks.push(current.v.trim());
      current.v = block;
    } else {
      current.v += (current.v ? '\n\n' : '') + block;
    }
  });
  if (current.v) chunks.push(current.v.trim());
  return chunks.length ? chunks : [text];
}

// Phase 2 stub — retired, chunking now in Phase 1
function processPhase2Chunking() {
  DocumentApp.getUi().alert('Phase 2 Retired',
    'Chunking is now part of Phase 1.\n\nRun 🧠 Council → ① Process Session Log → Chunk → Queue.',
    DocumentApp.getUi().ButtonSet.OK);
}


// ============================================================================
// SECTION 10: PHASE 1.5 — CHUNK EXPORT HELPER
// ============================================================================

function exportChunksForCurator() {
  const ui = DocumentApp.getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data    = staging.getDataRange().getValues();

    const pending = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][4] === 'PENDING_INFERENCE' || data[i][4] === 'NEEDS_CURATOR') {
        pending.push({ row: i + 1, chunkId: data[i][1], fileId: data[i][3], status: data[i][4] });
      }
    }

    if (pending.length === 0) {
      ui.alert('No Pending Chunks',
        'No PENDING_INFERENCE or NEEDS_CURATOR rows in STAGING_PIPELINE.\n\nRun ① Process Session Log first.',
        ui.ButtonSet.OK);
      return;
    }

    const lines = pending.map((c, i) =>
      `  ${i + 1}. Row ${c.row}: ${c.chunkId} [${c.status}]`
    ).join('\n');

    ui.alert(`${pending.length} Chunk(s) Awaiting Curator`,
      `${lines}\n\n` +
      'For each chunk:\n' +
      '1. Open doc via Smart Chip in STAGING_PIPELINE Col C\n' +
      '2. Copy chunk text → Curator Gem → get JSON back\n' +
      '3. Paste JSON below the horizontal rule in the doc\n' +
      '4. Set Col E = BUFFERED for that row\n\n' +
      'Then run ③ Process Intake Payloads.',
      ui.ButtonSet.OK);
  } catch (e) { _reportError('exportChunksForCurator', e, ui); }
}


// ============================================================================
// SECTION 11: PHASE 3 — INFERENCE CONSOLIDATION (reads from chunk docs)
// [PRE-SMP] Simple mean — superseded by routeVectorWeights() for live sessions.
// ============================================================================

function consolidateInferenceChunks() {
  const ui = DocumentApp.getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data    = staging.getDataRange().getValues();
    const aggregated = {};
    let   processed = 0, errors = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i][4] !== 'BUFFERED') continue;
      const fileId = data[i][3];
      if (!fileId) continue;
      try {
        const docText   = DocumentApp.openById(fileId).getBody().getText();
        const jsonMatch = docText.match(/\{[\s\S]*\}(?=[^}]*$)/);
        if (!jsonMatch) {
          staging.getRange(i + 1, 5).setValue('PARSE_ERROR: No JSON found in doc');
          errors++; continue;
        }
        const parsed  = JSON.parse(jsonMatch[0].replace(/```json|```/g, '').trim());
        const weights = parsed.vector_weights;
        if (weights && typeof weights === 'object' &&
            weights !== 'UNAVAILABLE — Vector_Router.gs output missing') {
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
        _reportError('consolidateInferenceChunks row ' + (i + 1), e, null);
        errors++;
      }
    }

    if (processed === 0) {
      ui.alert('Nothing to Consolidate',
        'No BUFFERED rows in STAGING_PIPELINE.\n\nOpen chunk docs, paste Curator JSON, set Col E = BUFFERED.',
        ui.ButtonSet.OK); return;
    }

    const primer = { consolidated_at: new Date().toISOString(), chunk_count: processed, vector_weights: {} };
    Object.entries(aggregated).forEach(([theme, d]) => {
      primer.vector_weights[theme] = parseFloat((d.sum / d.count).toFixed(4));
    });

    PropertiesService.getScriptProperties().setProperty('SESSION_VECTOR_PRIMER', JSON.stringify(primer));
    SpreadsheetApp.flush();

    const lines = Object.entries(primer.vector_weights).map(([k, v]) => `  ${k.padEnd(25)} ${v}`);
    ui.alert('✅ Phase 3 Complete',
      `Consolidated ${processed} chunk(s).\n` +
      (errors > 0 ? `⚠ ${errors} error(s) — check STAGING_PIPELINE Col E.\n\n` : '\n') +
      `Vectors:\n${lines.join('\n')}\n\nRun Get Startup Primer to copy the formatted block.`,
      ui.ButtonSet.OK);
  } catch (e) { _reportError('consolidateInferenceChunks', e, ui); }
}


// ============================================================================
// SECTION 12: PHASE 4 — CURATOR JSON INTAKE PIPELINE (V3.4 + v7.2 merged)
// Reads BUFFERED rows from STAGING_PIPELINE by File_ID.
// Opens chunk doc, extracts last JSON block, processes through intake pipeline.
// Adds SESSION_LOG, COG_REGISTRY, ACTION_REGISTER writes (V3.4).
// Adds NEEDS_CURATOR status for docs without valid JSON (V3.4).
// Moves processed docs to 03.3_PROCESSED_EXHAUST.
// ============================================================================

function runIntakePipelineFromBuffer() {
  const ui = DocumentApp.getUi();
  try {
    _coldEngineGate('processInferenceQueue', 'TIER_2');

    // Run engine status check ONCE before the loop — not inside processIntakePayload (Gap 6)
    const engineStatus = _checkEngineStatus();
    if (engineStatus.warnings.length > 0) {
      console.warn('[ENGINE_STATUS] ' + engineStatus.warnings.join(' | '));
    }

    const props       = PropertiesService.getScriptProperties();
    const processedId = props.getProperty('ID_03_3_PROCESSED');
    const ss          = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging     = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data        = staging.getDataRange().getValues();
    let   processed   = 0, errors = 0, notReady = 0;

    for (let i = 1; i < data.length; i++) {
      const status = data[i][4];
      // Gap 9 fix: process BUFFERED rows (user-marked ready) AND retry PENDING/NEEDS_CURATOR
      // by attempting JSON extraction — only mark NEEDS_CURATOR if extraction fails
      const isActionable = status === 'BUFFERED' ||
                           status === 'PENDING_INFERENCE' ||
                           status === 'NEEDS_CURATOR';
      if (!isActionable) continue;

      const fileId = data[i][3];
      if (!fileId) continue;

      try {
        const docText   = DocumentApp.openById(fileId).getBody().getText();
        const jsonMatch = docText.match(/\{[\s\S]*\}(?=[^}]*$)/);

        if (!jsonMatch) {
          // Doc still contains raw text — Curator hasn't processed it yet
          staging.getRange(i + 1, 5).setValue('NEEDS_CURATOR');
          notReady++;
          continue;
        }

        const raw    = jsonMatch[0].replace(/```json|```/g, '').trim();
        const result = processIntakePayload(raw, true); // pass skipEngineCheck=true

        if (result.status === 'SUCCESS') {
          staging.getRange(i + 1, 5).setValue('INTAKE_PROCESSED');
          if (processedId) {
            try { DriveApp.getFileById(fileId).moveTo(DriveApp.getFolderById(processedId)); }
            catch (moveErr) { console.warn(`[Phase4] Move failed for ${fileId}: ${moveErr.message}`); }
          }
          processed++;
        } else {
          staging.getRange(i + 1, 5).setValue(`INTAKE_ERROR: ${result.message}`);
          _reportError('processInferenceQueue row ' + (i + 1), new Error(result.message), null);
          errors++;
        }
      } catch (e) {
        staging.getRange(i + 1, 5).setValue(`INTAKE_ERROR: ${e.message}`);
        _reportError('processInferenceQueue row ' + (i + 1), e, null);
        errors++;
      }
    }

    if (processed > 0) SpreadsheetApp.flush();

    ui.alert('✅ Phase 4 Complete',
      `Processed: ${processed} chunk(s).\n` +
      (notReady > 0 ? `⚠ ${notReady} chunk(s) still contain raw text (NEEDS_CURATOR).\n  Open them via ② Review Chunks for Curator.\n` : '') +
      (errors > 0   ? `❌ ${errors} error(s) — check STAGING_PIPELINE Col E.\n` : '') +
      (processed > 0 ? `Processed docs moved to 03.3_PROCESSED_EXHAUST.` : ''),
      ui.ButtonSet.OK);
  } catch (e) { _reportError('runIntakePipelineFromBuffer', e, ui); }
}

/**
 * Core CURATOR JSON processor. Validates, extracts pointers, writes to
 * CURRENT_STATE, PIVOTS_AND_LESSONS, MATRIX_LEDGER, SESSION_LOG,
 * COG_REGISTRY, ACTION_REGISTER, and routes vectors via routeVectorWeights().
 *
 * @param {string}  rawJSONPayload  - Stringified CURATOR session JSON
 * @param {boolean} skipEngineCheck - If true, skips _checkEngineStatus() (already
 *                                    run by caller). Pass true from batch loops.
 * @returns {{ status, data?, vectorRouting? }|{ status, message }}
 */
function processIntakePayload(rawJSONPayload, skipEngineCheck) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: 'LOCKED', message: 'System busy — try again.' };

  try {
    // Engine status soft check — skip if already run by caller (Gap 6)
    if (!skipEngineCheck) {
      const engineStatus = _checkEngineStatus();
      if (engineStatus.warnings.length > 0) {
        console.warn('[ENGINE_STATUS] ' + engineStatus.warnings.join(' | '));
      }
    }

    // Parse and harden
    let payload;
    try { payload = JSON.parse(rawJSONPayload); }
    catch (pe) { _reportError('processIntakePayload JSON parse', pe, null); throw new Error('Invalid JSON — Curator payload malformed: ' + pe.message); }
    runHardeningAudit(rawJSONPayload);

    // Pointer extraction (PIVOT 004)
    const props          = PropertiesService.getScriptProperties();
    const currentStateId = props.getProperty('ID_CURRENT_STATE');
    const indexSheetId   = props.getProperty('INDEX_ID');
    const vectorFolderId = props.getProperty('ID_05_VECTOR_REPOSITORY');
    const pivotDocId     = props.getProperty('ID_PIVOTS_AND_LESSONS');

    if (!currentStateId || !indexSheetId || !vectorFolderId || !pivotDocId) {
      throw new Error('Architectural Fault: Core pointers missing. Run Deploy or Setup Routing Properties.');
    }

    const timestamp  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const uid        = 'LOG_' + new Date().getTime();
    const stateDoc   = DocumentApp.openById(currentStateId);
    const pivotDoc   = DocumentApp.openById(pivotDocId);
    const indexSheet = SpreadsheetApp.openById(indexSheetId);

    // Write next_steps to CURRENT_STATE
    if (payload.dynamic_state?.next_steps?.length > 0) {
      const b = stateDoc.getBody();
      b.appendParagraph(`\n[State Sync: ${timestamp} | ${uid}]`).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      b.appendParagraph('NEXT STEPS:').setBold(true);
      payload.dynamic_state.next_steps.forEach(s => b.appendListItem(s));
    }

    // Write pivots_and_lessons to PIVOTS_AND_LESSONS
    if (payload.dynamic_state?.pivots_and_lessons?.length > 0) {
      const b = pivotDoc.getBody();
      b.appendParagraph(`\n[Session Logged: ${timestamp} | ${uid}]`).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      payload.dynamic_state.pivots_and_lessons.forEach(p => b.appendListItem(p));
    }

    // [PRE-SMP] Write to MATRIX_LEDGER — static 4-col schema
    const ledger = indexSheet.getSheetByName(CFG.MATRIX_LEDGER_SHEET);
    if (ledger) {
      const w    = payload.vector_weights || {};
      const arch = parseFloat(w.ARCHITECTURE) || 0;
      const ui2  = parseFloat(w.UI)           || 0;
      const sec  = parseFloat(w.SECURITY)     || 0;
      const ped  = parseFloat(w.PEDAGOGY)     || 0;
      ledger.appendRow([uid, timestamp, arch, ui2, sec, ped, (arch + ui2 + sec + ped).toFixed(4)]);
    }

    // V3.4: Write session metadata to SESSION_LOG
    const sl = _getOrCreateSheet(indexSheet, CFG.SESSION_LOG_SHEET);
    sl.appendRow([
      uid, timestamp,
      payload.session_metadata?.session_type || '',
      payload.session_metadata?.cold_start   || '',
      payload.session_summary                || '',
      payload.cog_registry?.apex_lead        || '',
    ]);

    // V3.4: Write cog verdicts to COG_REGISTRY
    if (payload.cog_registry?.cog_verdicts?.length > 0) {
      const cs = _getOrCreateSheet(indexSheet, CFG.COG_REGISTRY_SHEET);
      payload.cog_registry.cog_verdicts.forEach(v => {
        cs.appendRow([uid, timestamp, v.cog || '', v.final_status || '', v.summary || '']);
      });
    }

    // V3.4: Write action_exhaust to ACTION_REGISTER + flag ALIGNMENT escalations
    if (payload.action_exhaust?.length > 0) {
      const as = _getOrCreateSheet(indexSheet, CFG.ACTION_REGISTER_SHEET);
      payload.action_exhaust.forEach(item => {
        as.appendRow([uid, timestamp, item.type || '', item.item || '', item.owner || '', item.protected_time_risk || '']);
        if (item.protected_time_risk === 'true' || item.protected_time_risk === true) {
          _reportError(`ALIGNMENT ${item.type} — ${uid}`,
            new Error(`Protected time risk flagged: ${item.item}`), null);
        }
      });
    }

    // V3.4: Write SMP proposals directly to Blackboard
    if (payload.session_delta?.smp_proposals_filed?.length > 0) {
      const bb = indexSheet.getSheetByName(CFG.BLACKBOARD_SHEET);
      if (bb) {
        payload.session_delta.smp_proposals_filed.forEach(smp => {
          bb.appendRow([
            '', smp.proposal_id || '', smp.title || '', smp.status || '',
            '', smp.summary || '', '', '', smp.filed_by || '', timestamp, 'PENDING', false
          ]);
        });
      }
    }

    console.log(`[Intake] Volatile writes complete for ${uid}`);

    // Route vectors through the full Vector Router (V3.4)
    const vectorResult = routeVectorWeights(payload.vector_weights || {}, uid, timestamp, indexSheet, vectorFolderId, payload.session_summary || '');

    return { status: 'SUCCESS', data: payload, vectorRouting: vectorResult };

  } catch (error) {
    console.error('[Intake] Fault: ' + error.message);
    return { status: 'ERROR', message: error.message };
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// SECTION 13: ARCHIVE STAGING PIPELINE (V3.4)
// Moves terminal-status rows to STAGING_ARCHIVE to keep STAGING_PIPELINE clean.
// ============================================================================

function archiveStagingPipeline() {
  const ui = DocumentApp.getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    let   archive = ss.getSheetByName('STAGING_ARCHIVE');
    if (!archive) {
      archive = ss.insertSheet('STAGING_ARCHIVE');
      archive.appendRow(['Archived_At', 'Timestamp', 'Chunk_ID', 'Doc_Link', 'File_ID', 'Status']);
      archive.getRange('1:1').setFontWeight('bold').setBackground('#f0e2d5');
      archive.setFrozenRows(1);
    }

    const terminal = ['CONSOLIDATED', 'INTAKE_PROCESSED', 'PHASE_2_ERROR', 'INTAKE_ERROR'];
    const data     = staging.getDataRange().getValues();
    const now      = new Date();

    // Gap 10 fix: collect matching row numbers first, then archive content,
    // then delete in reverse order to prevent index drift
    const rowsToDelete = [];
    for (let i = 1; i < data.length; i++) {
      if (terminal.some(s => String(data[i][4]).startsWith(s))) {
        archive.appendRow([now, ...data[i]]);
        rowsToDelete.push(i + 1); // 1-indexed sheet row
      }
    }

    // Delete in reverse so row indices remain valid after each deletion
    rowsToDelete.reverse().forEach(rowNum => staging.deleteRow(rowNum));

    SpreadsheetApp.flush();
    ui.alert('✅ Archive Complete', `Archived ${rowsToDelete.length} row(s) → STAGING_ARCHIVE.`, ui.ButtonSet.OK);
  } catch (e) { _reportError('archiveStagingPipeline', e, ui); }
}


// ============================================================================
// SECTION 14: VECTOR ROUTER (V3.4 — full implementation)
// Replaces [PRE-SMP] executeVectorRouting().
// Writes to VECTOR_MATRIX (with decay on absent themes), logs unmapped themes
// to INCUBATOR, checks promotion candidates, and routes above-threshold
// themes to VECTOR_ docs in the Vector Repository folder.
// ============================================================================

/**
 * Full Vector Router. Called from processIntakePayload().
 * Handles known vectors, unknown incubation, decay, promotion, and doc routing.
 *
 * @param {Object} weights        - { THEME: float } from CURATOR JSON
 * @param {string} uid            - Session UID
 * @param {string} timestamp      - Formatted timestamp string
 * @param {Spreadsheet} indexSheet - BRAIN_TRUST_INDEX spreadsheet
 * @param {string} vectorFolderId - Drive ID of 05_Vector_Repository
 * @param {string} summary        - Session summary for vector doc seeding
 * @returns {{ status, routedCount }|{ status, message }}
 */
function routeVectorWeights(weights, uid, timestamp, indexSheet, vectorFolderId, summary) {
  try {
    // Load any previously promoted vectors before classifying (Gap 8)
    loadPersistedVectors();

    const matrixSheet = _getOrCreateSheet(indexSheet, CFG.VECTOR_MATRIX_SHEET);
    const incubSheet  = _getOrCreateSheet(indexSheet, CFG.INCUBATOR_SHEET);

    const known   = {}; // Known vectors with signal this session
    const unknown = {}; // Unknown vectors that meet incubator threshold

    // Load incubator data ONCE before the loop (Gap 4 — prevents N sheet reads)
    const incubData = incubSheet.getDataRange().getValues();

    // Classify incoming weights
    Object.entries(weights).forEach(([theme, val]) => {
      const score = parseFloat(val);
      if (isNaN(score)) return;
      const t = theme.toUpperCase();
      if (CFG.KNOWN_VECTORS.includes(t)) {
        known[t] = score;
      } else if (score >= CFG.INCUBATOR_THRESHOLD) {
        unknown[t] = score;
      }
    });

    // Write to VECTOR_MATRIX with decay on absent known vectors
    _writeMatrixRow(matrixSheet, uid, timestamp, known);

    // Log unknown themes to INCUBATOR (passing pre-loaded data to avoid re-reads)
    Object.entries(unknown).forEach(([theme, score]) => {
      _logToIncubator(incubSheet, incubData, theme, score, uid);
    });

    // Check incubator for promotion candidates
    _checkPromotionCandidates(incubSheet, matrixSheet);

    // Route above-threshold known vectors to VECTOR_ docs
    const routedCount = _routeToVectorDocs(known, vectorFolderId, uid, timestamp, summary);

    console.log(`[VectorRouter] Matrix updated. Incubated: ${Object.keys(unknown).length}. Routed to docs: ${routedCount}`);
    return { status: 'SUCCESS', routedCount };

  } catch (e) {
    _reportError('routeVectorWeights', e, null);
    return { status: 'ERROR', message: e.message };
  }
}

/**
 * Writes a row to VECTOR_MATRIX. Applies DECAY_FACTOR to known vectors
 * that had no signal in this session (prevents stale themes persisting at
 * full weight indefinitely).
 *
 * @param {Sheet}  matrixSheet - VECTOR_MATRIX sheet
 * @param {string} uid         - Session UID
 * @param {string} timestamp
 * @param {Object} known       - { THEME: score } for themes with signal this session
 */
function _writeMatrixRow(matrixSheet, uid, timestamp, known) {
  // Gap 3 fix: use Math.max(1,...) to prevent getRange error on completely empty sheet
  const lastCol = Math.max(1, matrixSheet.getLastColumn());
  let headers   = matrixSheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (!headers[0] || headers[0] !== 'SESSION_UID') {
    // First run — initialize headers
    matrixSheet.clearContents();
    const initHeaders = ['SESSION_UID', 'TIMESTAMP', ...CFG.KNOWN_VECTORS];
    matrixSheet.appendRow(initHeaders);
    matrixSheet.getRange(1, 1, 1, initHeaders.length)
               .setFontWeight('bold').setBackground('#1e293b').setFontColor('#fff');
    matrixSheet.setFrozenRows(1);
    headers = initHeaders;
  }

  // Add new columns for any newly promoted vectors not yet in matrix
  CFG.KNOWN_VECTORS.forEach(theme => {
    if (!headers.includes(theme)) {
      matrixSheet.getRange(1, headers.length + 1).setValue(theme);
      headers.push(theme);
    }
  });

  // Get last row values for decay calculation
  const lastRow = matrixSheet.getLastRow();
  let prevValues = {};
  if (lastRow > 1) {
    const prevData = matrixSheet.getRange(lastRow, 1, 1, headers.length).getValues()[0];
    headers.forEach((h, i) => { if (i >= 2) prevValues[h] = parseFloat(prevData[i]) || 0; });
  }

  // Build this session's row — apply decay to absent themes
  const row = [uid, timestamp];
  headers.slice(2).forEach(theme => {
    if (known[theme] !== undefined) {
      row.push(known[theme].toFixed(4));        // Signal present — use current score
    } else {
      const prev = prevValues[theme] || 0;
      row.push((prev * CFG.DECAY_FACTOR).toFixed(4)); // Signal absent — apply decay
    }
  });

  matrixSheet.appendRow(row);
}

/**
 * Logs an unknown theme to the INCUBATOR sheet.
 * Accepts pre-loaded incubData to avoid re-reading the sheet on every call.
 *
 * @param {Sheet}   incubSheet - INCUBATOR sheet
 * @param {Array[]} incubData  - Pre-loaded sheet values (from getDataRange().getValues())
 * @param {string}  theme      - Theme name (uppercase)
 * @param {number}  score      - Weight score this session
 * @param {string}  uid        - Session UID
 */
function _logToIncubator(incubSheet, incubData, theme, score, uid) {
  if (score <= CFG.INCUBATOR_THRESHOLD) return;

  // Initialize headers if sheet is empty
  if (!incubData[0] || incubData[0][0] !== 'THEME') {
    incubSheet.clearContents();
    incubSheet.appendRow(['THEME', 'SESSION_COUNT', 'CUMULATIVE_SCORE', 'AVG_SCORE', 'LAST_SESSION', 'STATUS']);
    incubSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#2d1b69').setFontColor('#fff');
    incubSheet.setFrozenRows(1);
  }
  let   themeRow = -1;
  for (let i = 1; i < incubData.length; i++) {
    if (incubData[i][0] === theme) { themeRow = i + 1; break; }
  }

  if (themeRow === -1) {
    // New theme — create row
    incubSheet.appendRow([theme, 1, score.toFixed(4), score.toFixed(4), uid, 'INCUBATING']);
  } else {
    // Update existing row
    const count = parseInt(incubData[themeRow - 1][1]) + 1;
    const cumul = parseFloat(incubData[themeRow - 1][2]) + score;
    const avg   = cumul / count;
    incubSheet.getRange(themeRow, 2, 1, 4).setValues([[count, cumul.toFixed(4), avg.toFixed(4), uid]]);
  }
}

/**
 * Checks all INCUBATING themes for promotion eligibility.
 * Promotion conditions (both must be met):
 *   - SESSION_COUNT >= CFG.PROMOTION_MIN_SESSIONS
 *   - AVG_SCORE    >= CFG.PROMOTION_MIN_AVG_WEIGHT
 *
 * On promotion: persists theme to PropertiesService (Gap 7+8 fix),
 * adds to CFG.KNOWN_VECTORS runtime array, adds column to VECTOR_MATRIX,
 * marks row PROMOTED in INCUBATOR.
 *
 * @param {Sheet} incubSheet  - INCUBATOR sheet
 * @param {Sheet} matrixSheet - VECTOR_MATRIX sheet
 */
function _checkPromotionCandidates(incubSheet, matrixSheet) {
  // Ensure runtime CFG.KNOWN_VECTORS includes any previously promoted vectors
  loadPersistedVectors();

  const data = incubSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const [theme, count, , avg, , status] = data[i];
    if (status === 'PROMOTED' ||
        parseInt(count) < CFG.PROMOTION_MIN_SESSIONS ||
        parseFloat(avg)  < CFG.PROMOTION_MIN_AVG_WEIGHT ||
        CFG.KNOWN_VECTORS.includes(theme)) continue;

    // Promote: add to runtime array AND persist to PropertiesService (Gap 7 fix)
    CFG.KNOWN_VECTORS.push(theme);
    _persistKnownVectors();

    // Add column to VECTOR_MATRIX
    const lastCol = matrixSheet.getLastColumn();
    matrixSheet.getRange(1, lastCol + 1).setValue(theme)
               .setFontWeight('bold').setBackground('#1e293b').setFontColor('#fff');

    // Mark as PROMOTED in incubator
    incubSheet.getRange(i + 1, 6).setValue('PROMOTED');
    console.log(`[VectorRouter] PROMOTED: ${theme} (sessions: ${count}, avg: ${avg})`);

    try {
      DocumentApp.getUi().alert(
        `🧬 Vector Promoted: ${theme}`,
        `New vector "${theme}" promoted from Incubator.\n` +
        `Sessions: ${count} | Avg score: ${parseFloat(avg).toFixed(4)}\n\n` +
        `Added to VECTOR_MATRIX as a tracked column.\n` +
        `Persisted to PropertiesService — active from next session.`,
        DocumentApp.getUi().ButtonSet.OK
      );
    } catch (_) { /* headless */ }
  }
}

/**
 * Persists the current CFG.KNOWN_VECTORS array to PropertiesService.
 * Called after every promotion so the extended list survives script restarts.
 * (Gap 7+8 fix)
 */
function _persistKnownVectors() {
  PropertiesService.getScriptProperties().setProperty(
    'KOS_KNOWN_VECTORS',
    JSON.stringify(CFG.KNOWN_VECTORS)
  );
}

/**
 * Loads any previously promoted vectors from PropertiesService into
 * CFG.KNOWN_VECTORS at runtime. Call this at the start of any function
 * that reads or writes the vector taxonomy.
 * (Gap 8 fix — promotions now survive session restarts)
 */
function loadPersistedVectors() {
  try {
    const stored = PropertiesService.getScriptProperties().getProperty('KOS_KNOWN_VECTORS');
    if (!stored) return;
    const persisted = JSON.parse(stored);
    persisted.forEach(theme => {
      if (!CFG.KNOWN_VECTORS.includes(theme)) {
        CFG.KNOWN_VECTORS.push(theme);
      }
    });
  } catch (e) {
    console.warn('[loadPersistedVectors] Could not load: ' + e.message);
  }
}

/**
 * Routes vectors above CFG.VECTOR_THRESHOLD to their VECTOR_ docs.
 * Finds or creates VECTOR_[THEME].gdoc in 05_Vector_Repository.
 *
 * @param {Object} known          - { THEME: score } known vectors with signal
 * @param {string} vectorFolderId - Drive ID of 05_Vector_Repository
 * @param {string} uid            - Session UID
 * @param {string} timestamp
 * @param {string} summary        - Session summary to append
 * @returns {number} Count of vector docs updated
 */
function _routeToVectorDocs(known, vectorFolderId, uid, timestamp, summary) {
  const folder = DriveApp.getFolderById(vectorFolderId);
  let   routed = 0;
  Object.entries(known).forEach(([theme, score]) => {
    if (score <= CFG.VECTOR_THRESHOLD) return;
    const doc  = _getOrCreateDoc('VECTOR_' + theme, folder);
    const body = doc.getBody();
    body.appendParagraph(`\n[Vector Seed: ${timestamp} | ${uid} | Weight: ${score}]`)
        .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    if (summary) body.appendParagraph(summary);
    routed++;
  });
  return routed;
}

/**
 * Menu-accessible promotion check — surfaces promotion candidates to the user.
 */
function runPromotionCheck() {
  const ui = DocumentApp.getUi();
  try {
    _coldEngineGate('runPromotionCheck', 'TIER_1');
    loadPersistedVectors();
    const ss          = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrixSheet = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const incubSheet  = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);
    _checkPromotionCandidates(incubSheet, matrixSheet);
    const data       = incubSheet.getDataRange().getValues();
    const candidates = data.slice(1).filter(r =>
      r[5] !== 'PROMOTED' &&
      parseInt(r[1]) >= CFG.PROMOTION_MIN_SESSIONS &&
      parseFloat(r[3]) >= CFG.PROMOTION_MIN_AVG_WEIGHT
    );
    if (candidates.length === 0) {
      ui.alert('Promotion Check',
        `No themes met criteria yet.\nNeeds ≥${CFG.PROMOTION_MIN_SESSIONS} sessions AND avg ≥${CFG.PROMOTION_MIN_AVG_WEIGHT}`,
        ui.ButtonSet.OK);
    } else {
      const lines = candidates.map(r => `  ${r[0]}: ${r[1]} sessions, avg ${parseFloat(r[3]).toFixed(4)}`).join('\n');
      ui.alert('🧬 Promotion Candidates', lines, ui.ButtonSet.OK);
    }
  } catch (e) { _reportError('runPromotionCheck', e, ui); }
}

/**
 * Dumps current VECTOR_MATRIX and INCUBATOR state to a dialog for inspection.
 */
function dumpVectorState() {
  const ui = DocumentApp.getUi();
  try {
    _coldEngineGate('dumpVectorState', 'TIER_1');
    loadPersistedVectors();
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrix = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const incub  = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);
    const mRows  = Math.max(0, matrix.getLastRow() - 1);
    const iData  = incub.getDataRange().getValues().slice(1);
    const incubLines = iData.map(r =>
      `  ${String(r[0]).padEnd(20)} sessions:${r[1]} avg:${parseFloat(r[3]||0).toFixed(3)} [${r[5]}]`
    ).join('\n');
    ui.alert('Vector State',
      `VECTOR_MATRIX: ${mRows} session(s) logged\n` +
      `Known vectors (${CFG.KNOWN_VECTORS.length}): ${CFG.KNOWN_VECTORS.join(', ')}\n\n` +
      `INCUBATOR (${iData.length} theme(s)):\n${incubLines || '  (empty)'}`,
      ui.ButtonSet.OK);
  } catch (e) { _reportError('dumpVectorState', e, ui); }
}


// ============================================================================
// SECTION 15: SOCRATIC ONBOARDING (V3.4)
// 8-question dialogue that arms the engine, derives calibration weights
// from role inference, seeds CORE_THESIS doc, generates Identity Key,
// and starts the 21-day onboarding log.
// ============================================================================

function runSocraticOnboarding() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  if (props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true') {
    const day     = props.getProperty(CFG.PROP.ONBOARDING_DAY) || '1';
    const restart = ui.alert('Onboarding Complete',
      `Engine is armed. Day ${day} of ${CFG.ONBOARDING_DAYS}.\n\nRestart and reset your thesis?`,
      ui.ButtonSet.YES_NO);
    if (restart !== ui.Button.YES) return;
    ['RTP_IDENTITY_HASH', CFG.PROP.THESIS_VERIFIED, CFG.PROP.ONBOARDING_DAY, CFG.PROP.ONBOARDING_START]
      .forEach(k => props.deleteProperty(k));
  }

  ui.alert('Welcome to KOS Socratic Onboarding',
    `${CFG.TOTAL_ONBOARDING_STEPS} questions. ~10 minutes.\n\n` +
    'The system ships with no philosophy pre-installed. What you define here is yours alone — ' +
    'it cannot be replicated without your answers and passphrase.\n\nYou can cancel at any time and resume later.',
    ui.ButtonSet.OK);

  const a   = {};
  const ask = (step, title, body) => {
    const r = ui.prompt(
      `Step ${step} of ${CFG.TOTAL_ONBOARDING_STEPS} — ${title}`, body, ui.ButtonSet.OK_CANCEL
    );
    if (r.getSelectedButton() !== ui.Button.OK) return null;
    return r.getResponseText().trim() || null;
  };

  a.role = ask(1, 'WHAT IS YOUR ROLE?',
    'Your primary role or domain.\nExamples: Marketing Teacher, Business Coach, Software Developer, Non-Profit Director');
  if (!a.role) return ui.alert('Paused', 'Resume anytime with 🧠 Council → Begin Socratic Onboarding.', ui.ButtonSet.OK);

  a.audience = ask(2, 'WHO DO YOU SERVE?',
    'The people whose growth your work directly affects.\nExamples: High school students, Small business owners, Corporate teams');
  if (!a.audience) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.adminGhost = ask(3, 'NAME YOUR ADMIN GHOST',
    'What does administrative drag steal from you specifically, and how many hours per week?\nExamples: Grading formatting 4hr/wk. Parent email management 3hr/wk.');
  if (!a.adminGhost) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.struggle = ask(4, 'THE NECESSARY STRUGGLE',
    'What cognitive friction do you REFUSE to automate — the difficulty that produces real growth?\nExamples: Students must write their own business plan. Clients must make their own pricing decisions.');
  if (!a.struggle) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.targets = ask(5, 'RELATIONAL TARGETS',
    'Your top 3-5 Carbon-to-Carbon relationships (comma separated).\nThese are the people this system exists to protect time for.');
  if (!a.targets) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.vision = ask(6, '90-DAY VISION',
    'In one sentence: what does success look like in 90 days if the KOS is working perfectly?\nBe specific. Vague visions produce vague results.');
  if (!a.vision) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.salt = ask(7, 'IDENTITY KEY PASSPHRASE',
    '⚠ CRITICAL — READ CAREFULLY\n\n' +
    'Create a private passphrase (anything you will remember).\n' +
    'This combines with your thesis to generate a unique Identity Key.\n\n' +
    'YOU WILL NOT BE ASKED AGAIN. Write it down first.');
  if (!a.salt) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);
  props.setProperty('IDENTITY_KEY_SALT', a.salt);

  a.deployType = ask(8, 'DEPLOYMENT TYPE',
    `License: ${CFG.LICENSE_TYPE} — free for noncommercial use.\nCommercial use: honor system with attribution.\n\nType one of: INDIVIDUAL, EDUCATOR, COMMERCIAL`);
  if (!a.deployType) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  const dt = ['INDIVIDUAL','EDUCATOR','COMMERCIAL'].includes((a.deployType||'').toUpperCase())
    ? a.deployType.toUpperCase() : 'INDIVIDUAL';

  // Persist all onboarding data
  props.setProperty(CFG.PROP.DEPLOYMENT_TYPE,      dt);
  props.setProperty(CFG.PROP.OPERATOR_ROLE,         a.role);
  props.setProperty(CFG.PROP.OPERATOR_AUDIENCE,     a.audience);
  props.setProperty(CFG.PROP.ADMIN_GHOST,            a.adminGhost);
  props.setProperty(CFG.PROP.NECESSARY_STRUGGLE,     a.struggle);
  props.setProperty(CFG.PROP.RELATIONAL_TARGETS,     a.targets);
  props.setProperty(CFG.PROP.VISION_90_DAY,          a.vision);

  // Infer calibration weights from role
  Object.entries(_inferCalibrationWeights(a.role)).forEach(([k, v]) => {
    if (!props.getProperty(k)) props.setProperty(k, String(v));
  });

  // Seed CORE_THESIS with onboarding data
  _seedCoreThesisDoc(a, dt);

  // Generate Identity Key
  generateIdentityKey();

  // Mark thesis verified and start onboarding log
  props.setProperty(CFG.PROP.THESIS_VERIFIED, 'true');
  props.setProperty(CFG.PROP.ONBOARDING_DAY,   '1');
  props.setProperty(CFG.PROP.ONBOARDING_START,  new Date().toISOString());
  _logOnboardingDay(1, 'SEALED', a.vision);

  ui.alert('✅ Engine Armed — Onboarding Complete',
    `Deployment: ${dt}\nRelational Targets: ${a.targets}\n\nYour 90-Day Vision:\n"${a.vision}"\n\n` +
    'NEXT STEPS:\n' +
    '1. 🧠 Council → Build Session Context\n' +
    '2. Paste context into a new Gem session\n' +
    '3. Run your first session → ① Process Session Log\n\n' +
    `Day 1 of ${CFG.ONBOARDING_DAYS}. The system is live.`,
    ui.ButtonSet.OK);
}

function _inferCalibrationWeights(role) {
  const r = (role || '').toLowerCase();
  const w = { THEME_ARCHITECTURE:'0.75', THEME_PEDAGOGY:'0.75', THEME_FAMILY_ALIGNMENT:'0.75', SOCRATIC_THRESHOLD:'0.75' };
  if (/teach|educat|curriculum|instruc|tutor|profess/.test(r)) {
    w.THEME_PEDAGOGY='0.92'; w.THEME_FAMILY_ALIGNMENT='0.88'; w.THEME_ARCHITECTURE='0.72'; w.SOCRATIC_THRESHOLD='0.80';
  } else if (/coach|business|sales|market|consult|entrepreneur/.test(r)) {
    w.THEME_FAMILY_ALIGNMENT='0.92'; w.THEME_PEDAGOGY='0.68'; w.THEME_ARCHITECTURE='0.78'; w.SOCRATIC_THRESHOLD='0.72';
  } else if (/develop|engineer|code|software|technical|architect/.test(r)) {
    w.THEME_ARCHITECTURE='0.90'; w.THEME_PEDAGOGY='0.55'; w.THEME_FAMILY_ALIGNMENT='0.70'; w.SOCRATIC_THRESHOLD='0.70';
  } else if (/nonprofit|community|social|advocate|director/.test(r)) {
    w.THEME_FAMILY_ALIGNMENT='0.95'; w.THEME_PEDAGOGY='0.80'; w.THEME_ARCHITECTURE='0.65'; w.SOCRATIC_THRESHOLD='0.78';
  }
  return w;
}

function _seedCoreThesisDoc(a, deployType) {
  try {
    const props = PropertiesService.getScriptProperties();
    let   id    = props.getProperty('ID_CORE_THESIS');
    if (!id) {
      const f = DriveApp.getFilesByName('CORE_THESIS');
      if (f.hasNext()) { id = f.next().getId(); props.setProperty('ID_CORE_THESIS', id); }
    }
    if (!id) return;
    const doc  = DocumentApp.openById(id);
    const body = doc.getBody();
    body.clear();
    [
      { h1: 'CORE THESIS' },
      { h3: `Sealed: ${new Date().toLocaleDateString()} | Deployment: ${deployType} | KOS v${CFG.SYSTEM_VERSION}` },
      { hr: true },
      { h2: 'Primary Role' },          { p: a.role },
      { h2: 'Who I Serve' },           { p: a.audience },
      { h2: 'The Admin Ghost' },       { p: a.adminGhost },
      { h2: 'The Necessary Struggle'},  { p: a.struggle },
      { h2: 'Relational Targets (Carbon-to-Carbon)' }, { p: a.targets },
      { h2: '90-Day Vision' },         { p: a.vision },
      { hr: true },
      { h2: 'License' },
      { p: `${CFG.LICENSE_TYPE}\nDeployment: ${deployType}\nAuthor: ${CFG.AUTHOR}\nFidelity Clause: preserve PERSONA_ALIGNMENT and HITL Firewall in any adaptation.` },
    ].forEach(s => {
      if      (s.h1) body.appendParagraph(s.h1).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      else if (s.h2) body.appendParagraph(s.h2).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      else if (s.h3) body.appendParagraph(s.h3).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      else if (s.p)  body.appendParagraph(String(s.p));
      else if (s.hr) body.appendHorizontalRule();
    });
    doc.saveAndClose();
  } catch (e) { console.error('[Onboarding] Could not seed CORE_THESIS: ' + e.toString()); }
}

function checkOnboardingProgress() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const day   = parseInt(props.getProperty(CFG.PROP.ONBOARDING_DAY) || '0');
  const armed = props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true';
  if (!armed) {
    ui.alert('🔒 Engine COLD', 'Thesis not verified.\n\nRun 🧠 Council → Begin Socratic Onboarding.', ui.ButtonSet.OK);
    return;
  }
  const phase = day <= 7 ? '1: Foundation (Days 1-7)' : day <= 14 ? '2: Calibration (Days 8-14)' : '3: Activation (Days 15-21)';
  const bar   = '█'.repeat(Math.min(day, 21)) + '░'.repeat(Math.max(0, 21 - day));
  ui.alert(`Onboarding Progress — Day ${day} of ${CFG.ONBOARDING_DAYS}`,
    `[${bar}] ${Math.round(day / 21 * 100)}%\nPhase: ${phase}\n\n` +
    `Role: ${props.getProperty(CFG.PROP.OPERATOR_ROLE) || 'Not set'}\n` +
    `Deployment: ${props.getProperty(CFG.PROP.DEPLOYMENT_TYPE) || 'Not set'}\n\n` +
    `90-Day Vision:\n"${props.getProperty(CFG.PROP.VISION_90_DAY) || 'Not defined'}"\n\n` +
    `Relational Targets:\n${props.getProperty(CFG.PROP.RELATIONAL_TARGETS) || 'Not defined'}\n\n` +
    `── 3-HORIZON ROI MAP ──\n` +
    `Horizon 1 (90 sec)  Deploy infrastructure       ✔ COMPLETE\n` +
    `Horizon 2 (10 min)  First session ingestion      ${day >= 1 ? '✔ COMPLETE' : '○ PENDING'}\n` +
    `Horizon 3 (21 day)  Full cognitive alignment     ${day >= 21 ? '✔ COMPLETE' : day + '/21'}`,
    ui.ButtonSet.OK);
}

function _advanceOnboardingDay() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(CFG.PROP.THESIS_VERIFIED) !== 'true') return;
  const cur = parseInt(props.getProperty(CFG.PROP.ONBOARDING_DAY) || '1');
  if (cur < CFG.ONBOARDING_DAYS) {
    props.setProperty(CFG.PROP.ONBOARDING_DAY, String(cur + 1));
    _logOnboardingDay(cur + 1, 'SESSION_COMPLETE', '');
  }
}

function _logOnboardingDay(day, event, note) {
  try {
    const id = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (!id) return;
    const ss = SpreadsheetApp.openById(id);
    let   t  = ss.getSheetByName(CFG.ONBOARDING_SHEET);
    if (!t) {
      t = ss.insertSheet(CFG.ONBOARDING_SHEET);
      t.appendRow(['Day', 'Date', 'Event', 'Note', 'Vision_90_Day']);
      t.getRange('1:1').setFontWeight('bold').setBackground('#e8d5f0');
      t.setFrozenRows(1);
    }
    t.appendRow([day, new Date(), event, note || '',
      PropertiesService.getScriptProperties().getProperty(CFG.PROP.VISION_90_DAY) || '']);
  } catch (e) { console.warn('[Onboarding] Log failed: ' + e.message); }
}

function getRelationalTargets() {
  return (PropertiesService.getScriptProperties().getProperty(CFG.PROP.RELATIONAL_TARGETS) || '')
    .split(',').map(t => t.trim()).filter(Boolean);
}

function updateRelationalTargets() {
  const ui = DocumentApp.getUi();
  const r  = ui.prompt('Update Relational Targets',
    'List your Carbon-to-Carbon relationships (comma separated).\nThese are the people this system exists to protect time for.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const t = r.getResponseText().trim();
  if (t) {
    PropertiesService.getScriptProperties().setProperty(CFG.PROP.RELATIONAL_TARGETS, t);
    ui.alert('✅ Updated', t, ui.ButtonSet.OK);
  }
}


// ============================================================================
// SECTION 16: SESSION CONTEXT BUILDER (V3.4)
// Assembles a structured context block from live system docs for injection
// into a new Gem session. Requires TIER_2 armed engine.
// ============================================================================

function buildSessionContext() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();
  try {
    _coldEngineGate('buildSessionContext', 'TIER_2');

    const sections = [], loaded = [];
    const readDoc  = (id, label, maxChars) => {
      if (!id) return;
      try {
        const text = DocumentApp.openById(id).getBody().getText();
        if (text.length > 50) {
          sections.push(`## ${label}\n` + text.substring(0, maxChars) +
            (text.length > maxChars ? '\n[...truncated...]' : ''));
          loaded.push(label);
        }
      } catch (e) { console.warn(`[buildSessionContext] Could not read ${label}: ${e.message}`); }
    };

    readDoc(props.getProperty('ID_CORE_THESIS'),        'CORE_THESIS',        3000);
    readDoc(props.getProperty('ID_CURRENT_STATE'),      'CURRENT_STATE',      2000);
    readDoc(props.getProperty('ID_PIVOTS_AND_LESSONS'), 'PIVOTS_AND_LESSONS', 2000);

    // Inject vector primer if available
    const primer = getStartupPrimerBlock();
    if (primer) { sections.push(primer); loaded.push('VECTOR_PRIMER'); }

    // Inject onboarding context
    const role    = props.getProperty(CFG.PROP.OPERATOR_ROLE)     || '';
    const vision  = props.getProperty(CFG.PROP.VISION_90_DAY)     || '';
    const targets = props.getProperty(CFG.PROP.RELATIONAL_TARGETS) || '';
    const day     = props.getProperty(CFG.PROP.ONBOARDING_DAY)    || '?';
    if (role) {
      sections.push(
        `## OPERATOR CONTEXT\nRole: ${role}\n90-Day Vision: ${vision}\n` +
        `Relational Targets: ${targets}\nOnboarding Day: ${day} of ${CFG.ONBOARDING_DAYS}`
      );
      loaded.push('OPERATOR_CONTEXT');
    }

    if (sections.length === 0) {
      ui.alert('No Context Available',
        'No documents could be read. Ensure CORE_THESIS and CURRENT_STATE exist and are non-empty.',
        ui.ButtonSet.OK); return;
    }

    const fullContext =
      `[🧠 RTP — SESSION CONTEXT BLOCK]\n` +
      `Built: ${new Date().toLocaleString()} | KOS v${CFG.SYSTEM_VERSION}\n` +
      `Loaded: ${loaded.join(', ')}\n\n` +
      sections.join('\n\n---\n\n') +
      `\n\n[END SESSION CONTEXT BLOCK — Paste above your first message in the Gem]`;

    // Write to a temporary doc for easy copying
    const contextDoc  = DocumentApp.create(`CE: SESSION_CONTEXT_${new Date().getTime()}`);
    contextDoc.getBody().setText(fullContext);
    contextDoc.saveAndClose();

    const rawFolder = _getSystemAsset('03.4_RAW_EXHAUST', 'ID_00_RAW_EXHAUST', true);
    DriveApp.getFileById(contextDoc.getId()).moveTo(rawFolder);

    ui.alert('✅ Session Context Built',
      `Loaded: ${loaded.join(', ')}\n\n` +
      'A CE: SESSION_CONTEXT doc has been created and routed to 03.4_RAW_EXHAUST.\n' +
      'Open it, copy the full contents, and paste at the top of your next Gem session.',
      ui.ButtonSet.OK);

  } catch (e) { _reportError('buildSessionContext', e, ui); }
}

// ============================================================================
// END OF PART B
// Paste Part C immediately below this line.
// ============================================================================
