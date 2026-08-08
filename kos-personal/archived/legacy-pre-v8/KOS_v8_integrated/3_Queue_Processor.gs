// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 3 of 11: Queue Processor
// ================================================================
//
// SPRINT CHANGES (integrated)
// ─────────────────────────────────────────────────────────────
// • processInferenceQueue(): passes the intake file ID through
//   _CURRENT_INTAKE_FILE_ID script property before calling
//   processIntakePayload, then deletes it after. The script lock
//   held by processIntakePayload guarantees no concurrent run
//   can overwrite this property during execution.
//
// • processIntakePayload(): calls processJsonDrip() after the
//   vector router, scanning the raw inference doc for a
//   [KOS_DATA_DRIP] block. Non-fatal — a missing or malformed
//   drip block never fails the intake.
//
// • getQueueStatus(): includes quarantine_count (DRIP_QUARANTINE
//   sheet row count) for the web app Queue tab badge.
//
// STATUS LIFECYCLE (updated)
//   PENDING_FLOW  → [Turnstile]  → IN_PROCESS
//   IN_PROCESS    → [Studio]     → FLOW_COMPLETE
//   FLOW_COMPLETE → [Queue]      → PROCESSED | NEEDS_CURATOR
// ================================================================


// ================================================================
// QUEUE PROCESSOR — TIME-DRIVEN ENTRY POINT
// ================================================================

/**
 * Scans STAGING_PIPELINE for FLOW_COMPLETE rows and processes
 * each through processIntakePayload.
 *
 * Fires: every 10 min via time-driven trigger.
 */
function processInferenceQueue() {
  try {
    _coldEngineGate('processInferenceQueue', 'TIER_2');

    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const lastRow = staging.getLastRow();
    if (lastRow <= 1) return;

    const data = staging.getRange(2, 1, lastRow - 1, 7).getValues();
    const SC   = CFG.STAGING_COLS;

    let processed = 0, requeued = 0, failed = 0;

    for (let i = 0; i < data.length; i++) {
      const sheetRow = i + 2;
      const status   = String(data[i][SC.STATUS]);
      const retries  = parseInt(data[i][SC.RETRY_COUNT]) || 0;

      // ── NEEDS_CURATOR: auto-requeue or escalate ─────────────
      if (status === 'NEEDS_CURATOR') {
        if (retries >= CFG.MAX_RETRIES) continue;
        staging.getRange(sheetRow, SC.STATUS + 1).setValue('PENDING_FLOW');
        requeued++;
        console.log('[Queue] Row ' + sheetRow + ' requeued (attempt ' + retries + ')');
        continue;
      }

      if (status !== 'FLOW_COMPLETE') continue;

      const fileId = data[i][SC.FILE_ID];
      if (!fileId) {
        staging.getRange(sheetRow, SC.STATUS + 1)
               .setValue('ERROR: No File_ID — cannot read payload doc');
        failed++;
        continue;
      }

      try {
        const raw = DocumentApp.openById(fileId).getBody().getText().trim();

        let parsed;
        try {
          parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        } catch (_) {
          const newRetries = retries + 1;
          if (newRetries >= CFG.MAX_RETRIES) {
            staging.getRange(sheetRow, SC.STATUS      + 1).setValue('FAILED_PARSE');
            staging.getRange(sheetRow, SC.RETRY_COUNT + 1).setValue(newRetries);
            _reportError(
              'processInferenceQueue:FAILED_PARSE',
              new Error(
                'Row ' + sheetRow + ' (' + data[i][SC.PAYLOAD_UID] + ') ' +
                'failed JSON parse ' + newRetries + ' time(s). Manual intervention required.\n' +
                'Doc: ' + data[i][SC.DOC_URL]
              ),
              null,
            );
          } else {
            staging.getRange(sheetRow, SC.STATUS      + 1).setValue('NEEDS_CURATOR');
            staging.getRange(sheetRow, SC.RETRY_COUNT + 1).setValue(newRetries);
          }
          failed++;
          continue;
        }

        // ── Pass file ID through script props for JSON Drip ────
        // processIntakePayload holds the script lock, so no
        // concurrent call can overwrite this before it's deleted.
        PropertiesService.getScriptProperties()
          .setProperty('_CURRENT_INTAKE_FILE_ID', fileId);

        const result = processIntakePayload(JSON.stringify(parsed));

        PropertiesService.getScriptProperties()
          .deleteProperty('_CURRENT_INTAKE_FILE_ID');

        if (result.status === 'SUCCESS') {
          staging.getRange(sheetRow, SC.STATUS + 1).setValue('PROCESSED');
          processed++;
        } else if (result.status === 'LOCKED') {
          console.log('[Queue] Row ' + sheetRow + ': lock contention, will retry next run');
        } else {
          staging.getRange(sheetRow, SC.STATUS + 1)
                 .setValue('INTAKE_ERROR: ' + result.message.substring(0, 120));
          _reportError(
            'processInferenceQueue:row' + sheetRow,
            new Error(result.message),
            null,
          );
          failed++;
        }

      } catch (rowErr) {
        // Clean up the transient property if an unexpected throw occurred
        try { PropertiesService.getScriptProperties().deleteProperty('_CURRENT_INTAKE_FILE_ID'); } catch (_) {}
        staging.getRange(sheetRow, SC.STATUS + 1)
               .setValue('ERROR: ' + rowErr.message.substring(0, 120));
        _reportError('processInferenceQueue:row' + sheetRow, rowErr, null);
        failed++;
      }
    }

    if (processed + requeued + failed > 0) SpreadsheetApp.flush();
    if (processed > 0) { try { _advanceOnboardingDay(); } catch (_) {} }

    // Auto-archive when STAGING_PIPELINE grows large.
    // processInferenceQueue reads the entire sheet on every run — without
    // periodic archiving this becomes a meaningful quota hit over months.
    // Threshold is conservative (400 rows) so it runs well before the
    // sheet becomes a performance problem. Non-fatal: a failed archive
    // does not block the next queue run.
    try {
      if (lastRow > 400) {
        const archived = archiveStagingPipeline();
        if (archived && archived.archived > 0) {
          console.log('[Queue] Auto-archived ' + archived.archived + ' terminal row(s) from STAGING_PIPELINE.');
        }
      }
    } catch (_) {}

    console.log(
      '[Queue] processed=' + processed +
      ' requeued='  + requeued  +
      ' failed='    + failed
    );

  } catch (err) {
    _reportError('processInferenceQueue', err, null);
  }
}


// ================================================================
// INTAKE PROCESSOR
// ================================================================

/**
 * Routes a fully parsed inference JSON payload to all downstream
 * ledgers, docs, and the vector router.
 *
 * After the vector router, scans the raw inference doc for a
 * [KOS_DATA_DRIP] block and routes mirror updates + vector
 * nominations. Non-fatal — a missing or malformed drip block
 * never fails the intake.
 *
 * @param  {string} rawJSONPayload  JSON string (Studio inference output).
 * @returns {Object} { status, uid, vectorRouting?, message? }
 */
function processIntakePayload(rawJSONPayload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: 'LOCKED', message: 'System busy.' };

  try {
    let pd;
    try { pd = JSON.parse(rawJSONPayload); }
    catch (pe) {
      _reportError('processIntakePayload:parse', pe, null);
      throw new Error('Malformed JSON: ' + pe.message);
    }

    const props    = PropertiesService.getScriptProperties();
    const stateId  = props.getProperty('ID_CURRENT_STATE');
    const indexId  = props.getProperty('INDEX_ID');
    const pivotId  = props.getProperty('ID_PIVOTS_AND_LESSONS');
    if (!stateId || !indexId || !pivotId) {
      throw new Error('Core doc/sheet pointers missing. Run deployFullSystem().');
    }

    const ts         = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const uid        = pd.session_uid || ('LOG_' + new Date().getTime());
    const stateDoc   = DocumentApp.openById(stateId);
    const pivotDoc   = DocumentApp.openById(pivotId);
    const ss         = SpreadsheetApp.openById(indexId);
    const stateBody  = stateDoc.getBody();
    const pivotBody  = pivotDoc.getBody();

    // ── CURRENT_STATE — next_steps ───────────────────────────────
    const ns = pd.dynamic_state && pd.dynamic_state.next_steps;
    if (ns && ns.length > 0) {
      stateBody.appendParagraph('\n[State Sync: ' + ts + ' | ' + uid + ']')
               .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      stateBody.appendParagraph('NEXT STEPS:').setBold(true);
      ns.forEach(s => stateBody.appendListItem(String(s)));
    }

    // ── CURRENT_STATE — deferred_decisions ──────────────────────
    const dd = pd.dynamic_state && pd.dynamic_state.deferred_decisions;
    if (dd && dd.length > 0) {
      stateBody.appendParagraph('DEFERRED (' + uid + '):').setBold(true);
      dd.forEach(d => stateBody.appendListItem(
        '[' + (d.owner || 'unassigned') + '] ' +
        (d.decision || '') + ' — Blocking: ' + (d.blocking || 'unknown')
      ));
    }

    // ── PIVOTS_AND_LESSONS ───────────────────────────────────────
    const pl = pd.dynamic_state && pd.dynamic_state.pivots_and_lessons;
    if (pl && pl.length > 0) {
      pivotBody.appendParagraph('\n[Session: ' + ts + ' | ' + uid + ']')
               .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      pl.forEach(p => pivotBody.appendListItem(String(p)));
    }

    // ── MATRIX_LEDGER — raw vector scores ───────────────────────
    const ledger = ss.getSheetByName(CFG.MATRIX_LEDGER_SHEET);
    if (ledger) {
      const w    = pd.vector_weights || {};
      const arch = parseFloat(w.ARCHITECTURE)    || 0;
      const ui_  = parseFloat(w.UI)              || 0;
      const sec  = parseFloat(w.SECURITY)        || 0;
      const ped  = parseFloat(w.PEDAGOGY)        || 0;
      const gas  = parseFloat(w.GAS_DEVELOPMENT) || 0;
      const rel  = parseFloat(w.RELATIONAL)      || 0;
      const tot  = (arch + ui_ + sec + ped + gas + rel).toFixed(4);
      ledger.appendRow([uid, ts, arch, ui_, sec, ped, gas, rel, tot]);
    }

    // ── SESSION_LOG ──────────────────────────────────────────────
    const meta = pd.session_metadata || {};
    _getOrCreateSheet(ss, CFG.SESSION_LOG_SHEET).appendRow([
      uid, ts,
      meta.session_type    || '',
      String(meta.cold_start || ''),
      meta.rtp_version     || '',
      pd.session_summary   || '',
    ]);

    // ── COG_REGISTRY ─────────────────────────────────────────────
    const verdicts = pd.cog_registry && pd.cog_registry.cog_verdicts;
    if (verdicts && verdicts.length > 0) {
      const cs = _getOrCreateSheet(ss, CFG.COG_REGISTRY_SHEET);
      verdicts.forEach(v => cs.appendRow([
        uid, ts,
        v.cog          || '',
        v.final_status || '',
        v.summary      || '',
      ]));
    }

    // ── ACTION_REGISTER ──────────────────────────────────────────
    const actions = pd.action_exhaust;
    if (actions && actions.length > 0) {
      const as = _getOrCreateSheet(ss, CFG.ACTION_REGISTER_SHEET);
      actions.forEach(a => as.appendRow([
        uid, ts,
        a.type  || '',
        a.item  || '',
        a.owner || 'unassigned',
        a.protected_time_risk ? 'YES' : 'NO',
        'OPEN',
      ]));
    }

    // ── BLACKBOARD — SMP proposals ───────────────────────────────
    const smps = pd.session_delta && pd.session_delta.smp_proposals_filed;
    if (smps && smps.length > 0) {
      const bb = _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
      smps.forEach(smp => bb.appendRow([
        '',
        smp.proposal_id || '',
        smp.title       || '',
        '',
        '[' + (smp.proposal_id || 'SMP') + ']',
        smp.summary     || '',
        '',
        'Filed by: ' + (smp.filed_by || 'unknown') + ' | ' + (smp.status || 'PENDING'),
        smp.filed_by    || '',
        ts,
        'STAGED_FOR_REVIEW',
        false,
      ]));
    }

    // ── ALIGNMENT CHECK ──────────────────────────────────────────
    const ar = pd.alignment_report;
    if (ar) {
      const alignStatus = ar.relational_status_at_closeout;
      if (alignStatus === 'RED' || alignStatus === 'YELLOW') {
        _reportError(
          'ALIGNMENT_' + alignStatus + ':' + uid,
          new Error(
            'Status: ' + alignStatus + '. ' +
            'Thresholds crossed: ' +
            ((ar.thresholds_crossed_this_session || []).join(', ') || 'none') + '. ' +
            'Mandatory pauses: ' + (ar.mandatory_pauses_issued || 0) + '.'
          ),
          null,
        );
      }
    }

    // ── VECTOR ROUTER ────────────────────────────────────────────
    // BUG-01 FIX: call internal directly — this function holds the lock.
    const vr = _routeVectorWeightsInternal(pd, uid, ts);

    // ── JSON DRIP EXTRACTOR ──────────────────────────────────────
    // Scans the raw inference doc for a [KOS_DATA_DRIP] block and
    // routes mirror updates and vector nominations. Non-fatal.
    // The file ID was stored by processInferenceQueue() above.
    try {
      const payloadFileId = PropertiesService.getScriptProperties()
                              .getProperty('_CURRENT_INTAKE_FILE_ID');
      if (payloadFileId) {
        const fullText = DocumentApp.openById(payloadFileId).getBody().getText();
        processJsonDrip(fullText, uid);
      }
    } catch (_) {}  // drip is best-effort — never blocks intake

    return { status: 'SUCCESS', uid, vectorRouting: vr };

  } catch (error) {
    _reportError('processIntakePayload', error, null);
    return { status: 'ERROR', message: error.message };
  } finally {
    lock.releaseLock();
  }
}


// ================================================================
// WEB APP CALLABLE — QUEUE TAB DATA
// ================================================================

/**
 * Returns live status counts, NEEDS_CURATOR row details, and drip
 * quarantine count for the web app Queue tab.
 *
 * @returns {Object} {
 *   success, counts, needs_curator[], total, quarantine_count, last_updated
 * }
 */
function getQueueStatus() {
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const SC      = CFG.STAGING_COLS;

    const counts = { pending: 0, in_process: 0, ready: 0, needs_curator: 0, processed: 0, failed: 0 };
    const needsCuratorRows = [];

    if (staging.getLastRow() > 1) {
      const data = staging
        .getRange(2, 1, staging.getLastRow() - 1, 7)
        .getValues();

      data.forEach(row => {
        const s = String(row[SC.STATUS]);
        if      (s === 'PENDING_FLOW')                           counts.pending++;
        else if (s === 'IN_PROCESS')                             counts.in_process++;
        else if (s === 'FLOW_COMPLETE')                          counts.ready++;
        else if (s === 'NEEDS_CURATOR')                          counts.needs_curator++;
        else if (s === 'PROCESSED' || s === 'INTAKE_PROCESSED')  counts.processed++;
        else if (
          s === 'FAILED_PARSE' ||
          s.startsWith('ERROR:') ||
          s.startsWith('INTAKE_ERROR:')
        ) counts.failed++;  // mirror _isTerminal prefix logic in archiveStagingPipeline

        if (s === 'NEEDS_CURATOR') {
          needsCuratorRows.push({
            uid:     String(row[SC.PAYLOAD_UID]),
            type:    String(row[SC.PAYLOAD_TYPE]),
            url:     String(row[SC.DOC_URL]),
            retries: parseInt(row[SC.RETRY_COUNT]) || 0,
          });
        }
      });
    }

    // Drip quarantine count — surfaced as a badge in the Queue tab
    let quarantineCount = 0;
    try {
      const qSheet = _getOrCreateSheet(ss, 'DRIP_QUARANTINE');
      quarantineCount = Math.max(0, qSheet.getLastRow() - 1);
    } catch (_) {}

    return {
      success:          true,
      counts,
      needs_curator:    needsCuratorRows,
      total:            Object.values(counts).reduce((a, b) => a + b, 0),
      quarantine_count: quarantineCount,
      last_updated:     new Date().toLocaleTimeString(),
    };

  } catch (err) {
    _reportError('getQueueStatus', err, null);
    return { success: false, message: err.message };
  }
}


/**
 * Manually promotes a PENDING_FLOW or NEEDS_CURATOR row to
 * FLOW_COMPLETE for development testing.
 * USE IN DEVELOPMENT ONLY.
 */
function devSetFlowComplete(rowNumber) {
  if (rowNumber < 2) throw new Error('rowNumber must be >= 2.');
  const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const current = staging.getRange(rowNumber, CFG.STAGING_COLS.STATUS + 1).getValue();
  if (current !== 'PENDING_FLOW' && current !== 'NEEDS_CURATOR' && current !== 'IN_PROCESS') {
    throw new Error('Row ' + rowNumber + ' is "' + current + '" — only PENDING_FLOW, IN_PROCESS, or NEEDS_CURATOR rows can be promoted.');
  }
  staging.getRange(rowNumber, CFG.STAGING_COLS.STATUS + 1).setValue('FLOW_COMPLETE');
  SpreadsheetApp.flush();
  console.log('[devSetFlowComplete] Row ' + rowNumber + ' → FLOW_COMPLETE');
}


// ================================================================
// END 3_Queue_Processor.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 4_Vector_Router.gs
// ================================================================
