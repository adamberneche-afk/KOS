// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 2 of 8: Ingestion Sensors
// ================================================================
//
// SENSOR MAP
// ─────────────────────────────────────────────────────────────
//  Sensor 1 — SESSION_LOG
//    Trigger : time-driven, every 5 min (setupAllTriggers)
//    Handler : sensor1_scanInboundSessions()
//    Web path: submitSessionLog(text)     ← Ingest tab, direct
//    Source  : 03.5_INBOUND_SESSIONS folder (folder-drop path)
//              OR web app paste (direct path — no folder scan)
//    Output  : chunk docs → 03.4_RAW_EXHAUST
//              STAGING rows: Payload_Type = SESSION_LOG
//
//  Sensor 2 — COG_EXHAUST
//    Trigger : doPost() endpoint — no installable trigger needed
//    Handler : handleCogExhaust(payload) ← called by 7_WebApp.gs
//    Source  : POST { cog_name, task_id, verdict, artifact_text }
//    Output  : single doc → 03.4_RAW_EXHAUST
//              STAGING row: Payload_Type = COG_EXHAUST
//
//  Sensor 3 — EXTERNAL_DATA
//    Trigger : onChange on BRAIN_TRUST_INDEX (setupAllTriggers)
//    Handler : sensor3_externalTelemetry(e)
//    Web path: submitExternalData(text, title) ← Ingest tab, direct
//    Source  : EXTERNAL_TELEMETRY sheet rows (onChange path)
//              OR web app paste (direct path)
//    Output  : single doc → 03.4_RAW_EXHAUST
//              STAGING row: Payload_Type = EXTERNAL_DATA
//
// SHARED HELPERS
//   _queuePayload()  → writes a single STAGING_PIPELINE row
//   _chunkAndQueue() → splits text and calls _queuePayload per chunk
//
// DEPENDENCIES (defined in 5_Utilities.gs)
//   _semanticChunker(text)
//   _generateLogUUID(text)
//   _getSystemAsset(name, propKey, isFolder)
//   _getOrCreateSheet(ss, name)
//   _getOrCreateFolder(name, parent)
//   _reportError(context, error, ui)
// ================================================================


// ================================================================
// SENSOR 1 — SESSION LOG (Time-Driven Folder Scan)
// ================================================================

/**
 * Scans 03.5_INBOUND_SESSIONS for unprocessed Google Docs.
 * For each doc found: chunks → creates chunk docs in RAW_EXHAUST
 * → queues each chunk in STAGING_PIPELINE → moves source to
 * a _PROCESSED subfolder so it is excluded from future scans.
 *
 * This is the FOLDER-DROP path. Drop any Google Doc or plain-text
 * file into 03.5_INBOUND_SESSIONS and this trigger picks it up
 * within 5 minutes.
 *
 * The WEB APP path (submitSessionLog) chunks directly for
 * immediate queue confirmation — it does not use this folder scan.
 *
 * Fires: every 5 min via time-driven trigger.
 */
function sensor1_scanInboundSessions() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('[Sensor1] Could not acquire lock — another run is active. Skipping.');
    return;
  }
  try {
    _coldEngineGate('sensor1_scanInboundSessions', 'TIER_1');

    const props     = PropertiesService.getScriptProperties();
    const inboundId = props.getProperty('ID_03_5_INBOUND_SESSIONS');
    const rawId     = props.getProperty('ID_00_RAW_EXHAUST');

    if (!inboundId || !rawId) {
      _reportError('sensor1_scanInboundSessions',
        new Error('ID_03_5_INBOUND_SESSIONS or ID_00_RAW_EXHAUST not set. Run deployFullSystem().'),
        null);
      return;
    }

    const inboundFolder   = DriveApp.getFolderById(inboundId);
    const rawFolder       = DriveApp.getFolderById(rawId);
    // _PROCESSED subfolder: processed docs move here so getFiles()
    // (non-recursive) excludes them on all subsequent trigger runs.
    const processedFolder = _getOrCreateFolder('_PROCESSED', inboundFolder);

    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);

    const files = inboundFolder.getFiles();
    let scanned = 0, queued = 0, skipped = 0;

    while (files.hasNext()) {
      const file = files.next();
      if (file.getMimeType() !== MimeType.GOOGLE_DOCS) continue;
      scanned++;

      try {
        const rawText = DocumentApp.openById(file.getId()).getBody().getText().trim();
        if (rawText.length < 50) {
          console.log('[Sensor1] Skipping near-empty doc: ' + file.getName());
          file.moveTo(processedFolder);
          skipped++;
          continue;
        }

        const logUUID = _generateLogUUID(rawText);

        // Duplicate guard: check Payload_UID column for this logUUID prefix
        if (staging.getLastRow() > 1) {
          const existingUids = staging
            .getRange(2, CFG.STAGING_COLS.PAYLOAD_UID + 1, staging.getLastRow() - 1, 1)
            .getValues().flat().map(String);
          if (existingUids.some(u => u.startsWith(logUUID))) {
            console.log('[Sensor1] Duplicate skipped: ' + file.getName());
            file.moveTo(processedFolder);
            skipped++;
            continue;
          }
        }

        // Optional hardening audit — non-fatal if function absent
        try { runHardeningAudit(rawText); } catch (_) {}

        // Archive full raw log as a single reference doc
        const rawDocName = '[RAW]_' + logUUID;
        if (!rawFolder.getFilesByName(rawDocName).hasNext()) {
          const rawDoc = DocumentApp.create(rawDocName);
          const rawDId = rawDoc.getId();
          rawDoc.getBody().setText(rawText);
          rawDoc.saveAndClose();
          DriveApp.getFileById(rawDId).moveTo(rawFolder);
          DriveApp.getFileById(rawDId)
            .setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
        }

        const n = _chunkAndQueue(rawText, 'SESSION_LOG', logUUID, rawFolder, staging, ss);
        queued += n;

        // Move source to _PROCESSED — excluded from all future scans
        file.moveTo(processedFolder);

      } catch (docErr) {
        _reportError('sensor1:doc:' + file.getName(), docErr, null);
      }
    }

    if (queued > 0) SpreadsheetApp.flush();
    console.log(
      '[Sensor1] scanned=' + scanned +
      ' queued=' + queued +
      ' skipped=' + skipped
    );

  } catch (e) {
    _reportError('sensor1_scanInboundSessions', e, null);
  } finally {
    lock.releaseLock();
  }
}


// ================================================================
// SENSOR 1 — WEB APP ENTRY POINT
// ================================================================

/**
 * Chunks and queues a session log submitted via the web app
 * Ingest tab. Does NOT use the INBOUND_SESSIONS folder — runs
 * the full chunk pipeline inline for immediate feedback.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .submitSessionLog(text)
 *
 * @param  {string} text  Raw session log text.
 * @returns {Object} { success, uid, chunks, message }
 */
function submitSessionLog(text) {
  try {
    if (!text || text.trim().length < 50) {
      return { success: false, message: 'Payload too short. Paste a full session log.' };
    }

    _coldEngineGate('submitSessionLog', 'TIER_1');

    const rawText = text.trim();
    const logUUID = _generateLogUUID(rawText);

    const props = PropertiesService.getScriptProperties();
    const rawId = props.getProperty('ID_00_RAW_EXHAUST');
    if (!rawId) {
      return { success: false, message: 'RAW_EXHAUST folder not set. Run deployFullSystem().' };
    }

    const rawFolder = DriveApp.getFolderById(rawId);
    const ss        = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging   = _getOrCreateSheet(ss, CFG.STAGING_SHEET);

    // Duplicate guard
    if (staging.getLastRow() > 1) {
      const existingUids = staging
        .getRange(2, CFG.STAGING_COLS.PAYLOAD_UID + 1, staging.getLastRow() - 1, 1)
        .getValues().flat().map(String);
      if (existingUids.some(u => u.startsWith(logUUID))) {
        // duplicate:true lets the web app style this as "already handled,
        // no action needed" rather than a real failure — the pipeline did
        // exactly what it should here, this isn't an error.
        return { success: false, duplicate: true, message: 'Duplicate: this session log has already been queued.' };
      }
    }

    // Archive full raw log as a reference doc (not surfaced in queue)
    const rawDocName = '[RAW]_' + logUUID;
    if (!rawFolder.getFilesByName(rawDocName).hasNext()) {
      const rawDoc = DocumentApp.create(rawDocName);
      const rawDId = rawDoc.getId();
      rawDoc.getBody().setText(rawText);
      rawDoc.saveAndClose();
      DriveApp.getFileById(rawDId).moveTo(rawFolder);
      DriveApp.getFileById(rawDId)
        .setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
    }

    const chunksQueued = _chunkAndQueue(rawText, 'SESSION_LOG', logUUID, rawFolder, staging, ss);
    SpreadsheetApp.flush();

    return {
      success: true,
      uid:     logUUID,
      chunks:  chunksQueued,
      message: chunksQueued + ' chunk(s) queued as PENDING_FLOW',
    };

  } catch (e) {
    _reportError('submitSessionLog', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// SENSOR 2 — COG EXHAUST (Webhook Handler)
// ================================================================

/**
 * Internal handler for COG_EXHAUST payloads arriving via doPost.
 * Called by doPost(e) in 7_WebApp.gs after JSON parsing and
 * basic field validation.
 *
 * Creates one formatted doc per cog exhaust payload.
 * COG_EXHAUST is not chunked — the verdict artifact is kept whole.
 *
 * Expected payload shape:
 *   { cog_name: string, task_id: string,
 *     verdict: string, artifact_text: string }
 *
 * @param  {Object} payload Parsed JSON from the POST body.
 * @returns {Object} { success, uid, docUrl, message }
 */
function handleCogExhaust(payload) {
  try {
    const { cog_name, task_id, verdict, artifact_text } = payload;
    if (!cog_name || !artifact_text) {
      return { success: false, message: 'cog_name and artifact_text are required.' };
    }

    const props = PropertiesService.getScriptProperties();
    const rawId = props.getProperty('ID_00_RAW_EXHAUST');
    if (!rawId) {
      return { success: false, message: 'RAW_EXHAUST folder not set. Run deployFullSystem().' };
    }

    const rawFolder = DriveApp.getFolderById(rawId);
    const ts        = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const safeTaskId  = (task_id  || 'NOTASK').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeCogName = (cog_name || 'COG').replace(/[^a-zA-Z0-9_-]/g,    '');
    const uid         = 'COG-' + new Date().getTime() + '-' + safeTaskId;

    const content = [
      '=== COG EXHAUST ===',
      'Cog      : ' + (cog_name || ''),
      'Task ID  : ' + (task_id  || ''),
      'Verdict  : ' + (verdict  || ''),
      'Timestamp: ' + ts,
      '===================',
      '',
      artifact_text.trim(),
    ].join('\n');

    const docName = '[COG]_' + uid + '_' + safeCogName;
    const doc     = DocumentApp.create(docName);
    const dId     = doc.getId();
    doc.getBody().setText(content);
    doc.saveAndClose();
    DriveApp.getFileById(dId).moveTo(rawFolder);

    const docUrl  = DriveApp.getFileById(dId).getUrl();
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const queued  = _queuePayload(uid, 'COG_EXHAUST', docUrl, dId, staging);
    SpreadsheetApp.flush();

    if (!queued) {
      return { success: false, message: 'Duplicate: COG_EXHAUST with this ID already queued.' };
    }

    console.log('[Sensor2] COG_EXHAUST queued: ' + uid + ' cog=' + cog_name);
    return { success: true, uid, docUrl, message: 'COG_EXHAUST queued as PENDING_FLOW' };

  } catch (e) {
    _reportError('handleCogExhaust', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// SENSOR 3 — EXTERNAL TELEMETRY (onChange Trigger)
// ================================================================

/**
 * Fires on any spreadsheet change to BRAIN_TRUST_INDEX.
 * Scans the EXTERNAL_TELEMETRY sheet for rows where the Status
 * column (col D) is blank, converts each to a doc in RAW_EXHAUST,
 * and queues it as EXTERNAL_DATA.
 *
 * EXTERNAL_TELEMETRY sheet schema (set by _getOrCreateSheet):
 *   [Timestamp, Title, Content, Status, Payload_UID]
 *   col A         B      C        D       E
 *
 * A row is unprocessed when col D (Status) is empty.
 * After queuing: col D = 'QUEUED', col E = Payload_UID.
 *
 * The onChange event object does not identify which sheet changed.
 * The Status guard ensures each row is processed exactly once.
 *
 * Fires: on INSERT_ROW / OTHER_CHANGE on BRAIN_TRUST_INDEX.
 */
function sensor3_externalTelemetry(e) {
  // Filter to row-insertion events to avoid unnecessary scans on
  // every cell edit. Remove this guard if rows arrive via paste or
  // formula (which may fire OTHER_CHANGE instead of INSERT_ROW).
  if (e && e.changeType &&
      e.changeType !== 'INSERT_ROW' &&
      e.changeType !== 'OTHER_CHANGE') return;

  try {
    const props = PropertiesService.getScriptProperties();
    const rawId = props.getProperty('ID_00_RAW_EXHAUST');
    if (!rawId) return;

    const rawFolder = DriveApp.getFolderById(rawId);
    const ss        = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const telSheet  = ss.getSheetByName(CFG.EXTERNAL_TELEMETRY_SHEET);
    if (!telSheet || telSheet.getLastRow() <= 1) return;

    // Cursor-based scan: only read rows added since the last successful run.
    // Without this, sensor3 reads the entire EXTERNAL_TELEMETRY sheet on
    // every onChange event across the whole spreadsheet — including edits
    // to unrelated tabs — and scales with total row count over time.
    // Backported from an earlier draft found in the reupload batch; the
    // rest of this system's sensors already avoid full-sheet rescans, this
    // one just hadn't been updated to match.
    const cursorKey   = 'KOS_SENSOR3_LAST_ROW';
    const lastKnown   = parseInt(props.getProperty(cursorKey) || '1');
    const currentLast = telSheet.getLastRow();

    // Cursor reset guard: if the sheet was manually cleared or truncated,
    // currentLast will be less than the stored lastKnown high-water mark.
    // Without resetting, the early-return below fires forever and sensor3
    // goes permanently silent after any manual sheet truncation.
    const effectiveLast = currentLast < lastKnown ? 1 : lastKnown;
    if (effectiveLast !== lastKnown) {
      props.setProperty(cursorKey, '1');
      console.log('[Sensor3] Cursor reset: sheet appears cleared ' +
        '(currentLast=' + currentLast + ' < lastKnown=' + lastKnown + ').');
    }

    // Nothing new since last scan
    if (currentLast <= effectiveLast) return;

    // Read only unscanned rows (from lastKnown+1 to currentLast)
    const scanFrom = Math.max(2, effectiveLast + 1);
    const scanRows = currentLast - scanFrom + 1;
    const data    = telSheet.getRange(scanFrom, 1, scanRows, 5).getValues();
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const ts      = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    let queued = 0;

    for (let i = 0; i < data.length; i++) {
      const [, title, content, status] = data[i];
      // Row offset in sheet = scanFrom + i (1-indexed)
      if (String(status).trim() !== '') continue;  // already handled

      const contentStr = String(content || '').trim();
      if (!contentStr) continue;

      const sheetRow = scanFrom + i;  // absolute sheet row (1-indexed)
      try {
        const uid       = _generateLogUUID(contentStr + sheetRow);
        const safeTitle = String(title || 'Untitled')
          .replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 40);
        const docName   = '[EXT]_' + uid + '_' + safeTitle;

        const docContent = [
          'EXTERNAL DATA INTAKE',
          'UID      : ' + uid,
          'Title    : ' + String(title || ''),
          'Ingested : ' + ts,
          '─────────────────────────────',
          '',
          contentStr,
        ].join('\n');

        const doc  = DocumentApp.create(docName);
        const dId  = doc.getId();
        doc.getBody().setText(docContent);
        doc.saveAndClose();
        DriveApp.getFileById(dId).moveTo(rawFolder);

        const docUrl   = DriveApp.getFileById(dId).getUrl();
        const didQueue = _queuePayload(uid, 'EXTERNAL_DATA', docUrl, dId, staging);

        telSheet.getRange(sheetRow, 4).setValue(didQueue ? 'QUEUED'     : 'DUPLICATE');
        telSheet.getRange(sheetRow, 5).setValue(didQueue ? uid          : '');
        if (didQueue) queued++;

      } catch (rowErr) {
        telSheet.getRange(sheetRow, 4)
          .setValue('ERROR: ' + rowErr.message.substring(0, 80));
        _reportError('sensor3:row' + sheetRow, rowErr, null);
      }
    }

    // Advance cursor to the last row we scanned, regardless of whether
    // rows were queued — prevents re-scanning already-processed empty rows.
    props.setProperty(cursorKey, String(currentLast));

    if (queued > 0) {
      SpreadsheetApp.flush();
      console.log('[Sensor3] EXTERNAL_DATA queued=' + queued);
    }

  } catch (e) {
    _reportError('sensor3_externalTelemetry', e, null);
  }
}


// ================================================================
// SENSOR 3 — WEB APP ENTRY POINT
// ================================================================

/**
 * Creates a single doc from text paste and queues it as
 * EXTERNAL_DATA. Also writes an audit row to EXTERNAL_TELEMETRY
 * with Status pre-set to 'QUEUED' so sensor3's onChange guard
 * skips it.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .submitExternalData(text, title)
 *
 * @param  {string} text  Article, data, or research notes.
 * @param  {string} title Source name or title (optional).
 * @returns {Object} { success, uid, docUrl, message }
 */
function submitExternalData(text, title) {
  try {
    if (!text || text.trim().length < 20) {
      return { success: false, message: 'Content too short. Paste a full article or data block.' };
    }

    const contentStr = text.trim();
    // (title || 'Untitled').trim() only catches a falsy title — a
    // whitespace-only title (e.g. pasted from a form that always sends a
    // string) survives the `||` check, then trims down to '', bypassing
    // the 'Untitled' fallback entirely. Trim first, then fall back.
    const titleStr   = ((title || '').trim() || 'Untitled').substring(0, 100);
    const uid        = _generateLogUUID(contentStr);
    const ts         = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    const props = PropertiesService.getScriptProperties();
    const rawId = props.getProperty('ID_00_RAW_EXHAUST');
    if (!rawId) {
      return { success: false, message: 'RAW_EXHAUST folder not set. Run deployFullSystem().' };
    }

    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);

    // Duplicate guard — checked BEFORE creating a Doc, same pattern as
    // sensor1_scanInboundSessions/submitSessionLog. FIXED: this used to
    // rely on _queuePayload's fileId check below, which compares the
    // brand-new Doc's Drive file ID (always unique — freshly created
    // every call) against existing FILE_ID values, so it could never
    // fire; the "Duplicate" branch was unreachable dead code. Now checks
    // PAYLOAD_UID directly against this content's deterministic hash,
    // same as the session-log dedup checks.
    if (staging.getLastRow() > 1) {
      const existingUids = staging
        .getRange(2, CFG.STAGING_COLS.PAYLOAD_UID + 1, staging.getLastRow() - 1, 1)
        .getValues().flat().map(String);
      if (existingUids.includes(uid)) {
        // duplicate:true lets the web app style this as "already handled,
        // no action needed" rather than a real failure.
        return { success: false, duplicate: true, message: 'Duplicate: this content has already been queued.' };
      }
    }

    const rawFolder = DriveApp.getFolderById(rawId);
    const safeTitle = titleStr.replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 40);
    const docName   = '[EXT]_' + uid + '_' + safeTitle;

    const docContent = [
      'EXTERNAL DATA INTAKE',
      'UID      : ' + uid,
      'Title    : ' + titleStr,
      'Ingested : ' + ts,
      '─────────────────────────────',
      '',
      contentStr,
    ].join('\n');

    const doc  = DocumentApp.create(docName);
    const dId  = doc.getId();
    doc.getBody().setText(docContent);
    doc.saveAndClose();
    DriveApp.getFileById(dId).moveTo(rawFolder);

    const docUrl  = DriveApp.getFileById(dId).getUrl();
    const queued  = _queuePayload(uid, 'EXTERNAL_DATA', docUrl, dId, staging);

    if (!queued) {
      // Defensive fallback — should be unreachable now that the PAYLOAD_UID
      // check above runs first, but _queuePayload's own fileId check stays
      // in place as a second line of defense, same as everywhere else it's used.
      return { success: false, duplicate: true, message: 'Duplicate: this content has already been queued.' };
    }

    // Audit row in EXTERNAL_TELEMETRY — Status=QUEUED prevents sensor3 re-processing
    const telSheet = _getOrCreateSheet(ss, CFG.EXTERNAL_TELEMETRY_SHEET);
    telSheet.appendRow([new Date(), titleStr, contentStr, 'QUEUED', uid]);

    SpreadsheetApp.flush();

    return {
      success: true,
      uid,
      docUrl,
      message: 'EXTERNAL_DATA queued as PENDING_FLOW',
    };

  } catch (e) {
    _reportError('submitExternalData', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// SHARED PIPELINE HELPERS
// ================================================================

/**
 * Appends a single row to STAGING_PIPELINE.
 * Guards against duplicate File_IDs before writing.
 *
 * @param  {string} payloadUid   Unique ID for this payload.
 * @param  {string} payloadType  SESSION_LOG | COG_EXHAUST | EXTERNAL_DATA
 * @param  {string} docUrl       Google Drive URL of the payload doc.
 * @param  {string} fileId       Google Drive File ID of the payload doc.
 * @param  {Sheet}  staging      Already-open STAGING_PIPELINE sheet.
 * @returns {boolean} true = row written; false = duplicate skipped.
 */
function _queuePayload(payloadUid, payloadType, docUrl, fileId, staging) {
  if (staging.getLastRow() > 1) {
    const existingIds = staging
      .getRange(2, CFG.STAGING_COLS.FILE_ID + 1, staging.getLastRow() - 1, 1)
      .getValues().flat().map(String);
    if (existingIds.includes(fileId)) return false;
  }
  staging.appendRow([
    new Date(),
    payloadUid,
    payloadType,
    docUrl,
    fileId,
    'PENDING_FLOW',
    0,
  ]);
  return true;
}


/**
 * Chunks raw text via _semanticChunker, creates one Drive doc
 * per chunk in rawFolder, and queues each via _queuePayload.
 *
 * Used by: sensor1_scanInboundSessions, submitSessionLog.
 * Not used for COG_EXHAUST or EXTERNAL_DATA (single-doc payloads).
 *
 * Also appends a SESSION_LOG intake event row for traceability.
 *
 * @param  {string} rawText      Full session log text.
 * @param  {string} payloadType  Payload type string (SESSION_LOG).
 * @param  {string} logUUID      Base UUID from _generateLogUUID.
 * @param  {Folder} rawFolder    03.4_RAW_EXHAUST Drive folder.
 * @param  {Sheet}  staging      Open STAGING_PIPELINE sheet.
 * @param  {Spreadsheet} ss      Open BRAIN_TRUST_INDEX spreadsheet.
 * @returns {number} Number of chunks successfully queued.
 */
function _chunkAndQueue(rawText, payloadType, logUUID, rawFolder, staging, ss) {
  const chunks = _semanticChunker(rawText);
  let queued = 0;

  chunks.forEach((chunkText, idx) => {
    const padded    = (idx + 1).toString().padStart(2, '0');
    const chunkUID  = logUUID + '_CH' + padded;
    const chunkName = '[CHUNK_' + padded + ']_' + logUUID;
    try {
      const doc  = DocumentApp.create(chunkName);
      const dId  = doc.getId();              // BUG-03 pattern: capture ID first
      doc.getBody().setText(chunkText);
      doc.saveAndClose();
      DriveApp.getFileById(dId).moveTo(rawFolder);

      const docUrl   = DriveApp.getFileById(dId).getUrl();
      const didQueue = _queuePayload(chunkUID, payloadType, docUrl, dId, staging);
      if (didQueue) queued++;
    } catch (chunkErr) {
      _reportError('_chunkAndQueue:CH' + padded + ':' + logUUID, chunkErr, null);
    }
  });

  // SESSION_LOG row for intake traceability (non-critical)
  try {
    _getOrCreateSheet(ss, CFG.SESSION_LOG_SHEET).appendRow([
      logUUID, new Date(), payloadType, 'SENSOR_INTAKE',
      CFG.SYSTEM_VERSION,
      chunks.length + ' chunk(s) created',
    ]);
  } catch (_) {}

  return queued;
}


// ================================================================
// END 2_Ingestion_Sensors.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 3_Queue_Processor.gs
// ================================================================
