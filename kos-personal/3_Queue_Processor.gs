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
        // VECTOR_CLASSIFY rows carry sentence-level classification
        // output (Bifurcation Boundary — see 4_Vector_Router.gs) and
        // route to a dedicated handler instead of the full Curator
        // intake path; every other payload type is unchanged.
        const payloadUid  = String(data[i][SC.PAYLOAD_UID] || '');
        const payloadType = String(data[i][SC.PAYLOAD_TYPE] || '');
        const nowFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
        const result = (payloadType === 'VECTOR_CLASSIFY')
          ? processVectorClassificationPayload(JSON.stringify(parsed), payloadUid, nowFormatted)
          : processIntakePayload(JSON.stringify(parsed), payloadUid);

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
 * @param  {string} rawJSONPayload    JSON string (Studio inference output).
 * @param  {string} [stagingPayloadUid]  The STAGING_PIPELINE row's own
 *   Payload_UID, generated at ingestion time — pass this whenever the
 *   caller has it (processInferenceQueue always does). It takes priority
 *   over anything the Curator invented, so that this session's SESSION_LOG
 *   row and its paired VECTOR_CLASSIFY row (see 4_Vector_Router.gs's
 *   processVectorClassificationPayload, queued with the same original
 *   Payload_UID by 2_Ingestion_Sensors.gs) land under the same uid in
 *   VECTOR_MATRIX — two independent Studio flows for the same session
 *   would otherwise have no shared key to correlate on.
 * @returns {Object} { status: 'SUCCESS'|'LOCKED'|'ERROR', uid, vectorRouting?, message? }
 */
function processIntakePayload(rawJSONPayload, stagingPayloadUid) {
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
    // FIX: real THE_CURATOR output (schema_version 5.0) nests the session's
    // real, deterministic ID at session_metadata.session_id — there is no
    // top-level session_uid field. Reading the wrong key meant every real
    // session got a random LOG_<timestamp> fallback UID instead of its real
    // session ID, breaking any downstream matching keyed on session identity.
    // stagingPayloadUid now takes priority over both — see JSDoc above.
    const uid        = stagingPayloadUid || pd.session_metadata?.session_id || pd.session_uid || ('LOG_' + new Date().getTime());
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
    // FIX: real THE_CURATOR output sends vector_weights as the literal
    // string "UNAVAILABLE — Vector_Router.gs output missing" (not an
    // object) whenever the router hasn't run yet — a genuinely common case
    // in real logs, not an edge case. `pd.vector_weights || {}` doesn't
    // catch this, since a non-empty string is truthy, so every field read
    // off it came back undefined and this silently wrote a fake all-zero
    // row into the ledger instead of skipping a session with no real data.
    if (ledger && pd.vector_weights && typeof pd.vector_weights === 'object') {
      const w    = pd.vector_weights;
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
        // FIX: real output inconsistently sends this as a JS boolean
        // (true/false) or as a string ("true"/"false") depending on the
        // session. Any non-empty string — including the literal "false" —
        // is truthy in JS, so the old check silently recorded every
        // string-typed "false" as a "YES" protected-time risk.
        (a.protected_time_risk === true || a.protected_time_risk === 'true') ? 'YES' : 'NO',
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

    const counts = { pending: 0, ready: 0, needs_curator: 0, processed: 0, failed: 0 };
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
        // FIXED: these used to be silently excluded from every count, so a
        // row that hit a terminal failure (e.g. a brand-new user's very
        // first submission) was invisible everywhere in the Queue tab —
        // including making totalActivity read 0, which showed the "your
        // queue is empty, get started" onboarding message instead of any
        // indication something had actually failed. See TERMINAL_FAILED_STATUSES
        // (5_Error_And_Utilities.gs), the same list archiveStagingPipeline()
        // uses to identify these rows for cleanup.
        else if (TERMINAL_FAILED_STATUSES.some(p => s.startsWith(p)))  counts.failed++;

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
 * `failed` = any TERMINAL_FAILED_STATUSES row (5_Error_And_Utilities.gs) —
 * FAILED_PARSE, PHASE_2_ERROR, INTAKE_ERROR, MISSING_FILE_ID, PROCESSING_ERROR.
 * These used to be silently excluded from every count; now they're a
 * visible tile so a permanently-stuck row is never mistaken for an empty
 * queue.
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

    let queued = 0, active = 0, needsReview = 0, processed = 0, failed = 0;
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
        // FIXED: these used to be silently excluded — see the matching
        // comment in getQueueStatus() above. A row stuck in one of these
        // terminal-failure statuses was invisible in every Queue tab tile,
        // and could make totalActivity read 0 (renderQueue(), 8_WebApp_UI.html),
        // showing the "empty queue, get started" message even when the
        // user's very first submission had actually failed.
        else if (TERMINAL_FAILED_STATUSES.some(p => s.startsWith(p)))  failed++;

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
      failed,
    };

    return {
      success:         true,
      counts,
      needs_curator:   needsCuratorRows,
      total:           queued + active + needsReview + processed + failed,
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
 * _submitManagedServiceJob_ — hands a released row off to the managed
 * inference service instead of native Workspace Studio.
 *
 * Fixes the gap kos-personal/README.md flagged: CFG.INFERENCE_MODE ===
 * 'MANAGED_SERVICE' got you a working account-status panel, but nothing
 * anywhere ever called the service's POST /api/v1/jobs webhook — a row
 * released to STUDIO_ACTIVE in that mode would just sit there forever,
 * since there's no Studio watching it and nothing else submits the job.
 *
 * Called from runMatrixTurnstile() (10_Turnstile.gs) immediately before
 * a PENDING_FLOW row is flipped to STUDIO_ACTIVE, ONLY when
 * CFG.INFERENCE_MODE === 'MANAGED_SERVICE'. In the default 'STUDIO' mode
 * this is never called — Turnstile's release loop is unchanged from
 * before this fix.
 *
 * The service does the rest itself once the job is queued: its worker
 * reads the session doc, runs inference, writes results back to Drive,
 * and calls back into this same spreadsheet to set FLOW_COMPLETE (see
 * inference-service/src/worker.js's setFlowComplete call) using its own
 * stored OAuth connection for this user — this function's only job is
 * the initial hand-off, not polling for completion. Turnstile's existing
 * staleness reset (CFG.TURNSTILE_STALE_MINS) is the safety net if the
 * service never finishes a job, exactly as it already is for a stalled
 * Studio flow.
 *
 * @param {string} payloadUid
 * @param {string} fileId
 * @param {string} docUrl
 * @param {string} payloadType
 * @param {string} indexSpreadsheetId - this instance's own Index spreadsheet
 *   ID. FIXED: this used to never be sent, so the service's
 *   users.index_spreadsheet_id stayed permanently empty and
 *   setFlowComplete()/readOperatorContext() always failed — see
 *   INFERENCE_SERVICE_DEPLOYMENT.md's integration-status note and the
 *   commit that added this parameter for the full failure trace.
 * @returns {Object} { ok: true, job_id } or { ok: false, error }
 */
function _submitManagedServiceJob_(payloadUid, fileId, docUrl, payloadType, indexSpreadsheetId) {
  if (CFG.INFERENCE_MODE !== 'MANAGED_SERVICE') {
    return { ok: false, error: 'CFG.INFERENCE_MODE is not MANAGED_SERVICE' };
  }

  const props   = PropertiesService.getScriptProperties();
  const baseUrl = props.getProperty(CFG.PROP.MANAGED_SERVICE_BASE_URL);
  const apiKey  = props.getProperty(CFG.PROP.MANAGED_SERVICE_API_KEY);
  if (!baseUrl || !apiKey) {
    return { ok: false, error: 'MANAGED_SERVICE_BASE_URL/API_KEY not configured' };
  }

  const bodyString = JSON.stringify({
    payload_uid:          payloadUid,
    file_id:              fileId,
    doc_url:              docUrl,
    payload_type:         payloadType,
    index_spreadsheet_id: indexSpreadsheetId,
  });

  const headers = { 'X-KOS-API-Key': apiKey };

  // Signature is optional server-side ("skip in dev if not configured" —
  // see server.js's validateWebhookSignature) but always sent when a
  // secret is configured here, matching the service's own HMAC-SHA256
  // over the raw request body scheme.
  const secret = props.getProperty(CFG.PROP.MANAGED_SERVICE_WEBHOOK_SECRET);
  if (secret) {
    const sigBytes = Utilities.computeHmacSha256Signature(bodyString, secret);
    const sigHex = sigBytes.map(b => {
      const v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
    headers['X-KOS-Signature'] = 'sha256=' + sigHex;
  }

  try {
    const resp = UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + '/api/v1/jobs', {
      method: 'post',
      contentType: 'application/json',
      headers,
      payload: bodyString,
      muteHttpExceptions: true,
    });

    const code = resp.getResponseCode();
    // 201 = a fresh job was created. 200 = the service already had a job
    // for this payload_uid (idempotency guard — see server.js's
    // POST /api/v1/jobs) and returned that existing job's status instead
    // of creating a duplicate; either code is a successful submission.
    if (code !== 201 && code !== 200) {
      let message = 'HTTP ' + code;
      try {
        const errBody = JSON.parse(resp.getContentText());
        if (errBody.error) message = errBody.error;
      } catch (parseErr) {
        // Response body wasn't JSON — keep the plain HTTP-code message.
      }
      return { ok: false, error: message };
    }

    const body = JSON.parse(resp.getContentText());
    return { ok: true, job_id: body.job_id };

  } catch (e) {
    // Network error, timeout, etc. — non-fatal to the caller, which
    // leaves the row in PENDING_FLOW to retry on the next Turnstile run.
    return { ok: false, error: e.message };
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
