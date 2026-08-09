// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 3 of 8: Queue Processor
// ================================================================
//
// Replaces: PART 9 (processInferenceQueue), PART 10
//           (processIntakePayload), and the ui.alert version of
//           _coldEngineGate from KOS_MASTER_v3_1.gs.
//           Supersedes the transitional versions in
//           KOS_PHASE0_PATCHES.gs.
//
// PIPELINE FLOW
// ─────────────────────────────────────────────────────────────
//  Sensors (2_Ingestion_Sensors.gs)
//    └─ create chunk/exhaust docs in 03.4_RAW_EXHAUST
//    └─ append STAGING_PIPELINE row: Status = PENDING_FLOW
//
//  Google Workspace Studio (external)
//    └─ polls STAGING_PIPELINE for PENDING_FLOW rows
//    └─ opens payload doc → runs inference
//    └─ replaces doc content with structured JSON response
//    └─ sets row Status = FLOW_COMPLETE
//
//  processInferenceQueue()  ← this file, every 10 min
//    └─ finds FLOW_COMPLETE rows
//    └─ reads JSON from payload doc
//    └─ calls processIntakePayload()
//    └─ sets Status = PROCESSED
//    └─ re-queues NEEDS_CURATOR rows (up to MAX_RETRIES)
//
//  processIntakePayload()   ← this file
//    └─ writes to CURRENT_STATE, PIVOTS_AND_LESSONS
//    └─ writes to MATRIX_LEDGER, SESSION_LOG, COG_REGISTRY,
//       ACTION_REGISTER, Blackboard
//    └─ flags alignment RED/YELLOW to error queue
//    └─ calls _routeVectorWeightsInternal() (4_Vector_Router.gs)
//
// STATUS LIFECYCLE
//   PENDING_FLOW → [Studio] → FLOW_COMPLETE
//   FLOW_COMPLETE → [Queue] → PROCESSED
//   FLOW_COMPLETE → [bad JSON] → NEEDS_CURATOR (retry 1–2)
//   NEEDS_CURATOR → [next queue run] → PENDING_FLOW (requeue)
//   NEEDS_CURATOR (retry 3) → FAILED_PARSE + _reportError()
//   FLOW_COMPLETE → [no File_ID on row] → MISSING_FILE_ID (terminal,
//     non-retryable — nothing to read regardless of retry count)
//   FLOW_COMPLETE → [exception reading/processing doc] → stays
//     FLOW_COMPLETE, retry count bumped (retried automatically next run)
//   → (retry 3) → PROCESSING_ERROR + _reportError()
//   Both MISSING_FILE_ID and PROCESSING_ERROR are recognized terminal
//   statuses in archiveStagingPipeline() (5_Error_And_Utilities.gs), so
//   they get archived out on the next sweep instead of accumulating.
//
// WEB APP CALLABLE
//   getQueueStatus() → Queue tab status counts + curator list
// ================================================================


// ================================================================
// QUEUE PROCESSOR — TIME-DRIVEN ENTRY POINT
// ================================================================

/**
 * Scans STAGING_PIPELINE for FLOW_COMPLETE rows and processes
 * each through processIntakePayload. Handles NEEDS_CURATOR
 * auto-requeue logic up to MAX_RETRIES.
 *
 * Fully headless — no ui.alert, no DocumentApp.getUi().
 * All status changes written directly to STAGING_PIPELINE.
 * Errors go to ERROR_LOG via _reportError().
 *
 * Fires: every 10 min via time-driven trigger (setupAllTriggers).
 *
 * KEY DIFFERENCE FROM v5.4 / Phase 0 patch:
 *   v5.4   processed PENDING_FLOW rows (HITL: user pasted JSON)
 *   v8.0   processes FLOW_COMPLETE rows (Studio set the status)
 */
function processInferenceQueue() {
  try {
    _coldEngineGate('processInferenceQueue', 'TIER_2');

    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const lastRow = staging.getLastRow();
    if (lastRow <= 1) return;  // header only — nothing to process

    const data = staging.getRange(2, 1, lastRow - 1, 7).getValues();
    const SC   = CFG.STAGING_COLS;

    let processed = 0, requeued = 0, failed = 0;

    for (let i = 0; i < data.length; i++) {
      const sheetRow = i + 2;  // 1-indexed, skipping header
      const status   = String(data[i][SC.STATUS]);
      const retries  = parseInt(data[i][SC.RETRY_COUNT]) || 0;

      // ── NEEDS_CURATOR: auto-requeue or escalate ─────────────
      if (status === 'NEEDS_CURATOR') {
        if (retries >= CFG.MAX_RETRIES) {
          // Already escalated when MAX_RETRIES was hit — skip
          continue;
        }
        // Reset for Studio to retry inference on the same doc
        staging.getRange(sheetRow, SC.STATUS + 1).setValue('PENDING_FLOW');
        requeued++;
        console.log('[Queue] Row ' + sheetRow + ' requeued (attempt ' + retries + ')');
        continue;
      }

      // ── Only process rows Studio has marked FLOW_COMPLETE ────
      if (status !== 'FLOW_COMPLETE') continue;

      const fileId = data[i][SC.FILE_ID];
      if (!fileId) {
        // Non-retryable — there's no File_ID to read regardless of how
        // many times this runs again. FIXED: this used to be a bare
        // 'ERROR: ...' string, which archiveStagingPipeline()'s terminal
        // list never matched (it only recognizes specific named
        // statuses), so rows like this accumulated in STAGING_PIPELINE
        // forever with no cleanup path. Renamed to a named terminal
        // status and added to that list — see 5_Error_And_Utilities.gs.
        staging.getRange(sheetRow, SC.STATUS + 1).setValue('MISSING_FILE_ID');
        failed++;
        continue;
      }

      try {
        const raw = DocumentApp.openById(fileId).getBody().getText().trim();

        // ── JSON Parse ──────────────────────────────────────────
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

        // ── Intake ──────────────────────────────────────────────
        const result = processIntakePayload(JSON.stringify(parsed));

        if (result.status === 'SUCCESS') {
          staging.getRange(sheetRow, SC.STATUS + 1).setValue('PROCESSED');
          processed++;
        } else if (result.status === 'LOCKED') {
          // LockService contention from a concurrent processIntakePayload.
          // Leave as FLOW_COMPLETE — next trigger run will retry.
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
        // FIXED: this used to unconditionally set a bare 'ERROR: ...'
        // status with no retry — a transient failure here (Drive API
        // hiccup, temporary permission issue, quota limit) permanently
        // stuck the row, since 'ERROR: ...' also isn't one of
        // archiveStagingPipeline()'s recognized terminal statuses, so it
        // was never even cleaned up. Now retries like the JSON-parse
        // failure path above: leaving the status as FLOW_COMPLETE (its
        // value going into this try block) means the next run's
        // `if (status !== 'FLOW_COMPLETE') continue` naturally picks it
        // back up — no explicit reset needed, just bump the retry count.
        // Only escalates to a genuinely terminal, named status after
        // CFG.MAX_RETRIES, matching the FAILED_PARSE pattern.
        const newRetries = retries + 1;
        if (newRetries >= CFG.MAX_RETRIES) {
          staging.getRange(sheetRow, SC.STATUS      + 1)
                 .setValue('PROCESSING_ERROR: ' + rowErr.message.substring(0, 100));
          staging.getRange(sheetRow, SC.RETRY_COUNT + 1).setValue(newRetries);
        } else {
          staging.getRange(sheetRow, SC.RETRY_COUNT + 1).setValue(newRetries);
        }
        _reportError('processInferenceQueue:row' + sheetRow, rowErr, null);
        failed++;
      }
    }

    if (processed + requeued + failed > 0) SpreadsheetApp.flush();
    if (processed > 0) { try { _advanceOnboardingDay(); } catch (_) {} }

    console.log(
      '[Queue] processed=' + processed +
      ' requeued='  + requeued  +
      ' failed='    + failed
    );

  } catch (e) {
    _reportError('processInferenceQueue', e, null);
  }
}


// ================================================================
// INTAKE PROCESSOR
// ================================================================

/**
 * Routes a fully parsed inference JSON payload to all downstream
 * ledgers, docs, and the vector router.
 *
 * WRITE TARGETS
 *   CURRENT_STATE doc         next_steps, deferred_decisions
 *   PIVOTS_AND_LESSONS doc    pivots_and_lessons
 *   MATRIX_LEDGER sheet       vector_weights (raw scores)
 *   SESSION_LOG sheet         session_metadata + summary
 *   COG_REGISTRY sheet        cog_verdicts
 *   ACTION_REGISTER sheet     action_exhaust items
 *   Blackboard sheet          smp_proposals_filed
 *   Vector Router             _routeVectorWeightsInternal()
 *
 * Acquires the script lock to prevent concurrent writes across
 * concurrent trigger firings.
 *
 * Called by: processInferenceQueue (this file)
 *
 * @param  {string} rawJSONPayload  JSON string (Studio inference output).
 * @returns {Object} { status: 'SUCCESS'|'LOCKED'|'ERROR', uid, vectorRouting?, message? }
 */
function processIntakePayload(rawJSONPayload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: 'LOCKED', message: 'System busy.' };

  try {
    // ── Parse ───────────────────────────────────────────────────
    let pd;
    try { pd = JSON.parse(rawJSONPayload); }
    catch (pe) {
      _reportError('processIntakePayload:parse', pe, null);
      throw new Error('Malformed JSON: ' + pe.message);
    }

    // ── Asset resolution ────────────────────────────────────────
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
    const ns = pd.dynamic_state?.next_steps;
    if (ns?.length > 0) {
      stateBody.appendParagraph('\n[State Sync: ' + ts + ' | ' + uid + ']')
               .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      stateBody.appendParagraph('NEXT STEPS:').setBold(true);
      ns.forEach(s => stateBody.appendListItem(String(s)));
    }

    // ── CURRENT_STATE — deferred_decisions ──────────────────────
    const dd = pd.dynamic_state?.deferred_decisions;
    if (dd?.length > 0) {
      stateBody.appendParagraph('DEFERRED (' + uid + '):').setBold(true);
      dd.forEach(d => stateBody.appendListItem(
        '[' + (d.owner || 'unassigned') + '] ' +
        (d.decision || '') + ' — Blocking: ' + (d.blocking || 'unknown')
      ));
    }

    // ── PIVOTS_AND_LESSONS ───────────────────────────────────────
    const pl = pd.dynamic_state?.pivots_and_lessons;
    if (pl?.length > 0) {
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
      String(meta.cold_start     || ''),
      meta.rtp_version     || '',
      pd.session_summary   || '',
    ]);

    // ── COG_REGISTRY ─────────────────────────────────────────────
    const verdicts = pd.cog_registry?.cog_verdicts;
    if (verdicts?.length > 0) {
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
    if (actions?.length > 0) {
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
    const smps = pd.session_delta?.smp_proposals_filed;
    if (smps?.length > 0) {
      const bb = _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
      smps.forEach(smp => bb.appendRow([
        '',
        smp.proposal_id || '',
        smp.title        || '',
        '',
        '[' + (smp.proposal_id || 'SMP') + ']',
        smp.summary      || '',
        '',
        'Filed by: ' + (smp.filed_by || 'unknown') + ' | ' + (smp.status || 'PENDING'),
        smp.filed_by     || '',
        ts,
        'STAGED_FOR_REVIEW',
        false,
      ]));
    }

    // ── ALIGNMENT CHECK — RED/YELLOW to error queue ──────────────
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

    // ── SHADOW MATRIX — passive calibration (reconciliation decision 1) ──
    // Non-fatal: a bad/missing alignment_observations block should never
    // fail the whole intake, matching how every other branch above degrades.
    try { _updateShadowMatrix(pd.alignment_observations); }
    catch (shadowErr) { console.warn('[processIntakePayload] Shadow matrix update failed: ' + shadowErr.message); }

    // ── VECTOR ROUTER ────────────────────────────────────────────
    // BUG-01 FIX: call _routeVectorWeightsInternal directly
    // (not routeVectorWeights) since this function holds the lock.
    const vr = _routeVectorWeightsInternal(pd, uid, ts);

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
 * Returns live status counts and NEEDS_CURATOR row details for
 * the web app Queue tab.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(renderQueue)
 *     .getQueueStatus()
 *
 * @returns {Object} {
 *   success, counts, needs_curator[], total, last_updated
 * }
 */
function getQueueStatus() {
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const SC      = CFG.STAGING_COLS;

    const counts = { pending: 0, ready: 0, needs_curator: 0, processed: 0 };
    const needsCuratorRows = [];

    if (staging.getLastRow() > 1) {
      const data = staging
        .getRange(2, 1, staging.getLastRow() - 1, 7)
        .getValues();

      data.forEach(row => {
        const s = String(row[SC.STATUS]);
        if      (s === 'PENDING_FLOW')                               counts.pending++;
        else if (s === 'FLOW_COMPLETE')                              counts.ready++;
        else if (s === 'NEEDS_CURATOR')                              counts.needs_curator++;
        else if (s === 'PROCESSED' || s === 'INTAKE_PROCESSED')      counts.processed++;
        // FAILED_PARSE, MISSING_FILE_ID, PROCESSING_ERROR rows intentionally
        // excluded from counts so the operator focuses on the curator list

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

    return {
      success:       true,
      counts,
      needs_curator: needsCuratorRows,
      total:         Object.values(counts).reduce((a, b) => a + b, 0),
      last_updated:  new Date().toLocaleTimeString(),
    };

  } catch (e) {
    _reportError('getQueueStatus', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * Returns live status counts for the web app Queue tab, in the shape
 * 8_WebApp_UI.html actually expects (reconciliation decision 3) —
 * `{queued, pending, active, needs_review, needs_curator, processed}`
 * rather than getQueueStatus()'s `{pending, ready, needs_curator, processed}`.
 *
 * Status → bucket mapping:
 *   queued        = PENDING_FLOW        (waiting for the Turnstile)
 *   active        = STUDIO_ACTIVE + FLOW_COMPLETE (the engine currently
 *                   owns these rows — either Studio is working on them,
 *                   or Studio finished and the queue processor hasn't
 *                   drained them yet)
 *   needs_review  = NEEDS_CURATOR
 *   processed     = PROCESSED + INTAKE_PROCESSED
 *
 * `pending` and `needs_curator` are included as aliases of `queued` and
 * `needs_review` respectively — 8_WebApp_UI.html's renderQueue() reads
 * either name (`c.queued ?? c.pending`, `c.needs_review ?? c.needs_curator`).
 * FAILED_PARSE, MISSING_FILE_ID, and PROCESSING_ERROR rows are
 * intentionally excluded, same as getQueueStatus().
 *
 * `managed_service` field: reconciliation decision 3 originally removed
 * the HTML's "Managed Inference" credits panel entirely because no vendor
 * billing relationship existed anywhere in this system. Round 3
 * reconciliation revived that path as an explicit opt-in — see
 * CFG.INFERENCE_MODE. `managed_service` is `null` (panel stays hidden)
 * unless CFG.INFERENCE_MODE is 'MANAGED_SERVICE' AND the deployment has
 * configured CFG.PROP.MANAGED_SERVICE_BASE_URL / _API_KEY as Script
 * Properties — in the default 'STUDIO' mode this is always null, so the
 * "nothing on a vendor server by default" framing still holds.
 *
 * Called by the web app via:
 *   google.script.run.withSuccessHandler(renderQueue).getQueueMetrics()
 *
 * @returns {Object} { success, counts, needs_curator[], total, last_updated, managed_service }
 */
function getQueueMetrics() {
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const SC      = CFG.STAGING_COLS;

    let queued = 0, active = 0, needsReview = 0, processed = 0;
    const needsCuratorRows = [];

    if (staging.getLastRow() > 1) {
      const data = staging
        .getRange(2, 1, staging.getLastRow() - 1, 7)
        .getValues();

      data.forEach(row => {
        const s = String(row[SC.STATUS]);
        if      (s === 'PENDING_FLOW')                               queued++;
        else if (s === 'STUDIO_ACTIVE' || s === 'FLOW_COMPLETE')     active++;
        else if (s === 'NEEDS_CURATOR')                              needsReview++;
        else if (s === 'PROCESSED' || s === 'INTAKE_PROCESSED')      processed++;
        // FAILED_PARSE, MISSING_FILE_ID, PROCESSING_ERROR rows intentionally
        // excluded — same as getQueueStatus()

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

    const counts = {
      queued, pending: queued,
      active,
      needs_review: needsReview, needs_curator: needsReview,
      processed,
    };

    return {
      success:         true,
      counts,
      needs_curator:   needsCuratorRows,
      total:           queued + active + needsReview + processed,
      last_updated:    new Date().toLocaleTimeString(),
      managed_service: _getManagedServiceStatus_(),
    };

  } catch (e) {
    _reportError('getQueueMetrics', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * _getManagedServiceStatus_ — optional inference-service account lookup.
 *
 * Returns null (panel hidden client-side, see renderServiceStatus() in
 * 8_WebApp_UI.html) unless ALL of the following hold:
 *   - CFG.INFERENCE_MODE === 'MANAGED_SERVICE' (default is 'STUDIO' — see
 *     1_Config_And_Deploy.gs for the full explanation of both paths)
 *   - CFG.PROP.MANAGED_SERVICE_BASE_URL and _API_KEY are both set as
 *     Script Properties for this deployment
 *
 * Calls GET {base}/api/v1/account on the standalone Node.js service at
 * kos-personal/inference-service/ (see that directory's
 * INFERENCE_SERVICE_DEPLOYMENT.md — a separate Cloud Run / Postgres /
 * Stripe deployment, not part of this Apps Script project). Any failure
 * (unset properties, network error, non-200 response) is non-fatal and
 * returns null — a managed-service outage should never break the rest of
 * the queue dashboard.
 *
 * @returns {Object|null} { credit_balance, subscription_tier } or null
 */
function _getManagedServiceStatus_() {
  if (CFG.INFERENCE_MODE !== 'MANAGED_SERVICE') return null;

  const props   = PropertiesService.getScriptProperties();
  const baseUrl = props.getProperty(CFG.PROP.MANAGED_SERVICE_BASE_URL);
  const apiKey  = props.getProperty(CFG.PROP.MANAGED_SERVICE_API_KEY);
  if (!baseUrl || !apiKey) return null;

  try {
    const resp = UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + '/api/v1/account', {
      method: 'get',
      headers: { 'X-KOS-API-Key': apiKey },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) return null;

    const body = JSON.parse(resp.getContentText());
    if (typeof body.credit_balance !== 'number' || !body.subscription_tier) return null;

    return {
      credit_balance:    body.credit_balance,
      subscription_tier: body.subscription_tier,
    };
  } catch (e) {
    // Non-fatal — a managed-service outage should never break the queue tab.
    return null;
  }
}


/**
 * Manually promotes a single STAGING_PIPELINE row from
 * PENDING_FLOW to FLOW_COMPLETE for testing the queue processor
 * without needing Workspace Studio to set the status.
 *
 * USE IN DEVELOPMENT ONLY — do not call from production triggers.
 *
 * @param {number} rowNumber  1-indexed row number in STAGING_PIPELINE
 *                            (2 = first data row, skipping header).
 */
function devSetFlowComplete(rowNumber) {
  if (rowNumber < 2) throw new Error('rowNumber must be >= 2 (row 1 is the header).');
  const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const current = staging.getRange(rowNumber, CFG.STAGING_COLS.STATUS + 1).getValue();
  if (current !== 'PENDING_FLOW' && current !== 'NEEDS_CURATOR') {
    throw new Error('Row ' + rowNumber + ' is "' + current + '" — only PENDING_FLOW or NEEDS_CURATOR rows can be promoted.');
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
