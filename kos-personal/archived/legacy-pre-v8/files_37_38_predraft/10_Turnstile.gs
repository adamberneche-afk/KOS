// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 10 of 10: Matrix Turnstile Engine
// ================================================================
//
// Adapted from: CE-CODE: Matrix_Turnstile_Engine v1.5
// Original author: RTP Council session
//
// WHAT THIS DOES
// ─────────────────────────────────────────────────────────────
// Controls how many chunks are exposed to Workspace Studio at
// one time. Without this, Studio would see ALL PENDING_FLOW rows
// simultaneously and attempt to process them in parallel, causing
// race conditions and duplicate inference calls.
//
// STATUS LIFECYCLE WITH TURNSTILE
//   Sensor            PENDING_FLOW
//   Turnstile         PENDING_FLOW  →  STUDIO_ACTIVE
//   Studio            STUDIO_ACTIVE →  FLOW_COMPLETE
//   Queue Processor   FLOW_COMPLETE →  PROCESSED
//
// KEY BEHAVIOURS
//   Congestion Check: if any row is already STUDIO_ACTIVE,
//     the turnstile does nothing. Studio is busy.
//   Staleness Guard:  if a STUDIO_ACTIVE row is older than
//     CFG.TURNSTILE_STALE_MINS, it is reset to PENDING_FLOW
//     and an error is logged. Prevents permanent stuck rows.
//   Concurrency:      CFG.TURNSTILE_CONCURRENCY controls how
//     many rows can be STUDIO_ACTIVE simultaneously (default 1).
//
// TRIGGER
//   Installed by setupAllTriggers() every 5 minutes.
//   Uses the script lock — safe against concurrent executions.
//
// STUDIO INTEGRATION CONTRACT UPDATE
//   Studio must now watch for STUDIO_ACTIVE (not PENDING_FLOW).
//   PENDING_FLOW = "waiting for turnstile" (not yet Studio's concern).
//   STUDIO_ACTIVE = "your turn" (Studio processes this row).
// ================================================================


/**
 * Pure state machine. Reads STAGING_PIPELINE and releases at most
 * CFG.TURNSTILE_CONCURRENCY rows from PENDING_FLOW to STUDIO_ACTIVE
 * per execution. Respects the staleness guard before checking
 * for new work to release.
 *
 * Fires: every 5 min via time-driven trigger (setupAllTriggers).
 */
function runMatrixTurnstile() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('[Turnstile] Could not acquire lock — another run active. Skipping.');
    return;
  }
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const lastRow = staging.getLastRow();
    if (lastRow <= 1) return;

    const data = staging.getRange(2, 1, lastRow - 1, 7).getValues();
    const SC   = CFG.STAGING_COLS;
    const now  = new Date();

    // ── STALENESS GUARD ─────────────────────────────────────────
    // A STUDIO_ACTIVE row that has been sitting longer than
    // TURNSTILE_STALE_MINS means Studio dropped it. Reset to
    // PENDING_FLOW so it can be re-released on the next tick.
    let staleReset = 0;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][SC.STATUS]) !== 'STUDIO_ACTIVE') continue;
      const ts = data[i][SC.TIMESTAMP];
      if (!ts) continue;
      const ageMin = (now - new Date(ts)) / 60000;
      if (ageMin > (CFG.TURNSTILE_STALE_MINS || 30)) {
        const sheetRow = i + 2;
        staging.getRange(sheetRow, SC.STATUS + 1).setValue('PENDING_FLOW');
        _reportError(
          'runMatrixTurnstile:STALE_ACTIVE',
          new Error(
            'Row ' + sheetRow + ' (' + data[i][SC.PAYLOAD_UID] + ') was STUDIO_ACTIVE for ' +
            Math.round(ageMin) + ' min. Resetting to PENDING_FLOW. Studio may have dropped it.'
          ),
          null,
        );
        staleReset++;
      }
    }
    if (staleReset > 0) {
      SpreadsheetApp.flush();
      // Re-read data after stale resets so congestion check is accurate
      data.splice(0, data.length,
        ...staging.getRange(2, 1, lastRow - 1, 7).getValues());
    }

    // ── CONGESTION CHECK ────────────────────────────────────────
    // Count currently active rows. If we're at or above the
    // concurrency limit, Studio is busy — stand down.
    const activeCount = data.filter(r =>
      String(r[SC.STATUS]) === 'STUDIO_ACTIVE'
    ).length;

    const maxConcurrent = CFG.TURNSTILE_CONCURRENCY || 1;
    if (activeCount >= maxConcurrent) {
      console.log(
        '[Turnstile] ' + activeCount + '/' + maxConcurrent +
        ' slot(s) occupied. Standing by.'
      );
      return;
    }

    // ── TURNSTILE RELEASE ───────────────────────────────────────
    // Release (maxConcurrent - activeCount) rows from PENDING_FLOW
    // to STUDIO_ACTIVE. Processes in FIFO order (first pending row first).
    let released = 0;
    const toRelease = maxConcurrent - activeCount;

    for (let i = 0; i < data.length && released < toRelease; i++) {
      if (String(data[i][SC.STATUS]) !== 'PENDING_FLOW') continue;
      const sheetRow = i + 2;
      staging.getRange(sheetRow, SC.STATUS + 1).setValue('STUDIO_ACTIVE');
      released++;
      console.log(
        '[Turnstile] Row ' + sheetRow +
        ' (' + data[i][SC.PAYLOAD_UID] + ') → STUDIO_ACTIVE'
      );
    }

    if (released > 0) {
      SpreadsheetApp.flush();
      console.log('[Turnstile] Released ' + released + ' row(s) to Studio.');

      // ── Notify managed inference service (if configured) ───────
      // If KOS_INFERENCE_SERVICE_URL and KOS_INFERENCE_API_KEY are
      // set in PropertiesService, post each released row as a job.
      // This closes the Studio integration loop for managed users.
      _notifyInferenceService(data, released, props);

    } else {
      console.log('[Turnstile] Queue clear. No pending tasks.');
    }

  } catch (e) {
    _reportError('runMatrixTurnstile', e, null);
  } finally {
    lock.releaseLock();
  }
}




// ================================================================
// MANAGED INFERENCE SERVICE — NOTIFICATION
// ================================================================

/**
 * Posts newly-released STUDIO_ACTIVE rows to the managed inference
 * service as jobs. Called by runMatrixTurnstile() after releasing rows.
 *
 * Only fires if BOTH of these PropertiesService keys are set:
 *   KOS_INFERENCE_SERVICE_URL — base URL of the inference service
 *   KOS_INFERENCE_API_KEY     — API key returned during OAuth setup
 *
 * If either key is missing, this is a self-hosted instance and the
 * user's own Studio handles inference. No notification is sent.
 *
 * @param {Array}  data      Full STAGING_PIPELINE data array.
 * @param {number} released  Number of rows just released.
 * @param {Object} props     PropertiesService instance.
 */
function _notifyInferenceService(data, released, props) {
  const serviceUrl = props.getProperty('KOS_INFERENCE_SERVICE_URL');
  const apiKey     = props.getProperty('KOS_INFERENCE_API_KEY');
  if (!serviceUrl || !apiKey) return; // Self-hosted — skip

  const SC = CFG.STAGING_COLS;

  // Find the rows we just released (STUDIO_ACTIVE)
  // Re-read from data since we updated them in the same run
  const releasedRows = data.filter(r =>
    String(r[SC.STATUS]) === 'STUDIO_ACTIVE'
  ).slice(0, released);

  releasedRows.forEach(row => {
    try {
      const payload = JSON.stringify({
        payload_uid:  String(row[SC.PAYLOAD_UID]),
        file_id:      String(row[SC.FILE_ID]),
        doc_url:      String(row[SC.DOC_URL]),
        payload_type: String(row[SC.PAYLOAD_TYPE] || 'SESSION_LOG'),
      });

      // Sign the payload with the webhook secret if available
      const webhookSecret = props.getProperty('KOS_INFERENCE_WEBHOOK_SECRET');
      const headers = {
        'Content-Type': 'application/json',
        'X-KOS-API-Key': apiKey,
      };
      if (webhookSecret) {
        const sig = Utilities.computeHmacSha256Signature(payload, webhookSecret);
        const hexSig = sig.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
        headers['X-KOS-Signature'] = 'sha256=' + hexSig;
      }

      const response = UrlFetchApp.fetch(serviceUrl + '/api/v1/jobs', {
        method:             'post',
        payload:            payload,
        headers,
        muteHttpExceptions: true,
      });

      const code = response.getResponseCode();
      if (code === 201) {
        console.log('[Turnstile] Job posted to inference service: ' + row[SC.PAYLOAD_UID]);
      } else {
        console.error('[Turnstile] Inference service error ' + code + ': ' + response.getContentText().substring(0, 200));
      }

    } catch (e) {
      // Non-fatal — the row is STUDIO_ACTIVE and will be picked up
      // by the service's own polling if the webhook fails
      console.error('[Turnstile] Could not notify inference service: ' + e.message);
    }
  });
}


/**
 * Returns current queue health metrics for the web app Queue tab
 * and Diagnostics tab. Also returns managed service account status
 * if configured.
 *
 * Called via:
 *   google.script.run.withSuccessHandler(fn).getQueueMetrics()
 */
function getQueueMetrics() {
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const SC      = CFG.STAGING_COLS;
    const now     = new Date();
    const props   = PropertiesService.getScriptProperties();

    const counts = {
      queued:       0,
      active:       0,
      ready:        0,
      needs_review: 0,
      failed:       0,
      processed:    0,
    };
    const activeRows = [];
    let   staleCount = 0;
    const staleThresh = CFG.TURNSTILE_STALE_MINS || 30;

    if (staging.getLastRow() > 1) {
      staging.getRange(2, 1, staging.getLastRow() - 1, 7)
        .getValues()
        .forEach(row => {
          const s = String(row[SC.STATUS]);
          if      (s === 'PENDING_FLOW')                            counts.queued++;
          else if (s === 'STUDIO_ACTIVE')                           counts.active++;
          else if (s === 'FLOW_COMPLETE')                           counts.ready++;
          else if (s === 'NEEDS_CURATOR')                           counts.needs_review++;
          else if (s === 'FAILED_PARSE')                            counts.failed++;
          else if (s === 'PROCESSED' || s === 'INTAKE_PROCESSED')  counts.processed++;

          if (s === 'STUDIO_ACTIVE') {
            const ageMin = row[SC.TIMESTAMP]
              ? Math.round((now - new Date(row[SC.TIMESTAMP])) / 60000)
              : null;
            if (ageMin !== null && ageMin > staleThresh) staleCount++;
            activeRows.push({
              uid:     String(row[SC.PAYLOAD_UID]),
              type:    String(row[SC.PAYLOAD_TYPE]),
              age_min: ageMin,
              stale:   ageMin !== null && ageMin > staleThresh,
            });
          }
        });
    }

    // Read managed service account status if configured
    let serviceAccount = null;
    const serviceUrl = props.getProperty('KOS_INFERENCE_SERVICE_URL');
    const apiKey     = props.getProperty('KOS_INFERENCE_API_KEY');
    if (serviceUrl && apiKey) {
      try {
        const response = UrlFetchApp.fetch(serviceUrl + '/api/v1/account', {
          headers:            { 'X-KOS-API-Key': apiKey },
          muteHttpExceptions: true,
        });
        if (response.getResponseCode() === 200) {
          serviceAccount = JSON.parse(response.getContentText());
        }
      } catch (_) {}
    }

    return {
      success:        true,
      counts,
      active_rows:    activeRows,
      stale_count:    staleCount,
      concurrency:    CFG.TURNSTILE_CONCURRENCY || 1,
      last_checked:   now.toLocaleTimeString(),
      managed_service: serviceAccount,  // null if self-hosted
    };
  } catch (e) {
    _reportError('getQueueMetrics', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// END 10_Turnstile.gs
// ================================================================
