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
    _coldEngineGate('processInferenceQueue', 'TIER_1');

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
        staging.getRange(sheetRow, SC.STATUS + 1)
               .setValue('ERROR: No File_ID — cannot read payload doc');
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
        staging.getRange(sheetRow, SC.STATUS + 1)
               .setValue('ERROR: ' + rowErr.message.substring(0, 120));
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
// INTAKE PROCESSOR — JSON DRIP ARCHITECTURE
// ================================================================

/**
 * Routes a fully parsed inference JSON payload to all downstream
 * ledgers via an isolated fan-out (drip) pattern. Each write
 * target is wrapped in its own try/catch so a failure in one
 * branch does not prevent others from completing.
 *
 * PROPERTIES → INTAKE
 *   Reads operator calibration weights from PropertiesService at
 *   the start of each intake. Applies them to incoming vector
 *   weights before routing. Uses SOCRATIC_THRESHOLD to modulate
 *   the alignment check sensitivity.
 *
 * JSON DRIP MANIFEST
 *   Each branch returns { success, error? }. The full manifest
 *   is included in the return value for queue-processor logging.
 *
 * DRIP BRANCHES (10 total)
 *   1. current_state      CURRENT_STATE doc — next_steps, deferred
 *   2. pivots             PIVOTS_AND_LESSONS doc
 *   3. matrix_ledger      MATRIX_LEDGER sheet — calibrated raw scores
 *   4. session_log        SESSION_LOG sheet
 *   5. cog_registry       COG_REGISTRY sheet
 *   6. action_register    ACTION_REGISTER sheet
 *   7. blackboard         Blackboard sheet — SMP proposals
 *   8. alignment          Alignment check (calibration-tied threshold)
 *   9. shadow_matrix      Ambient onboarding confidence update
 *  10. vector_routing     _routeVectorWeightsInternal()
 *
 * @param  {string} rawJSONPayload  JSON string from Studio inference.
 * @returns {Object} { status, uid, manifest, drip_failures?, message? }
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
    const props   = PropertiesService.getScriptProperties();
    const stateId = props.getProperty('ID_CURRENT_STATE');
    const indexId = props.getProperty('INDEX_ID');
    const pivotId = props.getProperty('ID_PIVOTS_AND_LESSONS');
    if (!stateId || !indexId || !pivotId) {
      throw new Error('Core doc/sheet pointers missing. Run deployFullSystem().');
    }

    const ts  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const uid = pd.session_uid || ('LOG_' + new Date().getTime());

    // ── PROPERTIES → INTAKE ─────────────────────────────────────
    // Read operator calibration and apply to incoming vector weights
    // before any routing or ledger writes occur.
    const calibration = _readOperatorCalibration(props);
    pd = _applyCalibration(pd, calibration);

    const assets = {
      stateDoc: DocumentApp.openById(stateId),
      pivotDoc: DocumentApp.openById(pivotId),
      ss:       SpreadsheetApp.openById(indexId),
      calibration,
    };

    // ── JSON DRIP FAN-OUT ────────────────────────────────────────
    const manifest      = _executeDrip(pd, uid, ts, assets);
    const dripFailures  = Object.entries(manifest)
      .filter(([, v]) => v && !v.success)
      .map(([k]) => k);

    if (dripFailures.length > 0) {
      console.warn('[Intake] Drip failures: ' + dripFailures.join(', '));
    }

    return { status: 'SUCCESS', uid, manifest, drip_failures: dripFailures };

  } catch (error) {
    _reportError('processIntakePayload', error, null);
    return { status: 'ERROR', message: error.message };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Executes all 10 drip branches in sequence. Each branch is a
 * self-contained IIFE with its own try/catch. Failures are
 * reported to ERROR_LOG but do not halt subsequent branches.
 *
 * @param  {Object} pd           Calibration-adjusted inference payload.
 * @param  {string} uid          Session UID.
 * @param  {string} ts           Formatted timestamp.
 * @param  {Object} assets       { stateDoc, pivotDoc, ss, calibration }
 * @returns {Object}             Manifest of branch results.
 */
function _executeDrip(pd, uid, ts, assets) {
  const { stateDoc, pivotDoc, ss, calibration } = assets;
  const manifest = {};

  // ── 1. CURRENT_STATE ─────────────────────────────────────────
  manifest.current_state = (() => { try {
    const body = stateDoc.getBody();
    const ns = pd.dynamic_state?.next_steps;
    if (ns?.length > 0) {
      body.appendParagraph('\n[State Sync: ' + ts + ' | ' + uid + ']')
          .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      body.appendParagraph('NEXT STEPS:').setBold(true);
      ns.forEach(s => body.appendListItem(String(s)));
    }
    const dd = pd.dynamic_state?.deferred_decisions;
    if (dd?.length > 0) {
      body.appendParagraph('DEFERRED (' + uid + '):').setBold(true);
      dd.forEach(d => body.appendListItem(
        '[' + (d.owner || 'unassigned') + '] ' + (d.decision || '') +
        ' — Blocking: ' + (d.blocking || 'unknown')
      ));
    }
    return { success: true };
  } catch (e) { _reportError('drip:current_state:' + uid, e, null); return { success: false, error: e.message }; }})();

  // ── 2. PIVOTS_AND_LESSONS ────────────────────────────────────
  manifest.pivots = (() => { try {
    const pl = pd.dynamic_state?.pivots_and_lessons;
    if (pl?.length > 0) {
      const body = pivotDoc.getBody();
      body.appendParagraph('\n[Session: ' + ts + ' | ' + uid + ']')
          .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      pl.forEach(p => body.appendListItem(String(p)));
    }
    return { success: true };
  } catch (e) { _reportError('drip:pivots:' + uid, e, null); return { success: false, error: e.message }; }})();

  // ── 3. MATRIX_LEDGER ─────────────────────────────────────────
  manifest.matrix_ledger = (() => { try {
    const ledger = ss.getSheetByName(CFG.MATRIX_LEDGER_SHEET);
    if (!ledger) return { success: false, error: 'MATRIX_LEDGER sheet not found' };
    const w   = pd.vector_weights || {};
    const row = [
      uid, ts,
      parseFloat(w.ARCHITECTURE)    || 0,
      parseFloat(w.UI)              || 0,
      parseFloat(w.SECURITY)        || 0,
      parseFloat(w.PEDAGOGY)        || 0,
      parseFloat(w.GAS_DEVELOPMENT) || 0,
      parseFloat(w.RELATIONAL)      || 0,
    ];
    row.push(row.slice(2).reduce((a, b) => a + b, 0).toFixed(4));
    ledger.appendRow(row);
    return { success: true };
  } catch (e) { _reportError('drip:matrix_ledger:' + uid, e, null); return { success: false, error: e.message }; }})();

  // ── 4. SESSION_LOG ────────────────────────────────────────────
  manifest.session_log = (() => { try {
    const meta = pd.session_metadata || {};
    _getOrCreateSheet(ss, CFG.SESSION_LOG_SHEET).appendRow([
      uid, ts,
      meta.session_type    || '',
      String(meta.cold_start || ''),
      meta.rtp_version     || '',
      pd.session_summary   || '',
    ]);
    return { success: true };
  } catch (e) { _reportError('drip:session_log:' + uid, e, null); return { success: false, error: e.message }; }})();

  // ── 5. COG_REGISTRY ───────────────────────────────────────────
  manifest.cog_registry = (() => { try {
    const verdicts = pd.cog_registry?.cog_verdicts;
    if (verdicts?.length > 0) {
      const cs = _getOrCreateSheet(ss, CFG.COG_REGISTRY_SHEET);
      verdicts.forEach(v => cs.appendRow([uid, ts, v.cog || '', v.final_status || '', v.summary || '']));
    }
    return { success: true };
  } catch (e) { _reportError('drip:cog_registry:' + uid, e, null); return { success: false, error: e.message }; }})();

  // ── 6. ACTION_REGISTER ────────────────────────────────────────
  manifest.action_register = (() => { try {
    const actions = pd.action_exhaust;
    if (actions?.length > 0) {
      const as = _getOrCreateSheet(ss, CFG.ACTION_REGISTER_SHEET);
      actions.forEach(a => as.appendRow([
        uid, ts, a.type || '', a.item || '',
        a.owner || 'unassigned', a.protected_time_risk ? 'YES' : 'NO', 'OPEN',
      ]));
    }
    return { success: true };
  } catch (e) { _reportError('drip:action_register:' + uid, e, null); return { success: false, error: e.message }; }})();

  // ── 7. BLACKBOARD ─────────────────────────────────────────────
  manifest.blackboard = (() => { try {
    const smps = pd.session_delta?.smp_proposals_filed;
    if (smps?.length > 0) {
      const bb = _getOrCreateSheet(ss, CFG.BLACKBOARD_SHEET);
      smps.forEach(smp => bb.appendRow([
        '', smp.proposal_id || '', smp.title || '', '',
        '[' + (smp.proposal_id || 'SMP') + ']',
        smp.summary || '', '',
        'Filed by: ' + (smp.filed_by || 'unknown') + ' | ' + (smp.status || 'PENDING'),
        smp.filed_by || '', ts, 'STAGED_FOR_REVIEW', false,
      ]));
    }
    return { success: true };
  } catch (e) { _reportError('drip:blackboard:' + uid, e, null); return { success: false, error: e.message }; }})();

  // ── 8. ALIGNMENT (calibration-tied threshold) ─────────────────
  manifest.alignment = (() => { try {
    const ar = pd.alignment_report;
    if (!ar) return { success: true, status: 'NO_REPORT' };
    const alignStatus = ar.relational_status_at_closeout;
    // SOCRATIC_THRESHOLD < 0.85 = strict operator: YELLOW fires error.
    // At default 0.75, both RED and YELLOW report.
    const threshold = calibration.SOCRATIC_THRESHOLD || 0.75;
    if (alignStatus === 'RED' || (alignStatus === 'YELLOW' && threshold < 0.85)) {
      _reportError(
        'ALIGNMENT_' + alignStatus + ':' + uid,
        new Error('Status: ' + alignStatus + '. Thresholds: ' +
          ((ar.thresholds_crossed_this_session || []).join(', ') || 'none') +
          '. Pauses: ' + (ar.mandatory_pauses_issued || 0)),
        null,
      );
    }
    return { success: true, status: alignStatus };
  } catch (e) { _reportError('drip:alignment:' + uid, e, null); return { success: false, error: e.message }; }})();

  // ── 9. SHADOW MATRIX (ambient onboarding confidence update) ───
  manifest.shadow_matrix = (() => { try {
    if (pd.alignment_observations) {
      _updateShadowMatrix(pd.alignment_observations, uid);
    }
    return { success: true };
  } catch (e) { _reportError('drip:shadow_matrix:' + uid, e, null); return { success: false, error: e.message }; }})();

  // ── 10. VECTOR ROUTER ─────────────────────────────────────────
  // BUG-01 FIX: _routeVectorWeightsInternal (no lock — caller owns it)
  manifest.vector_routing = (() => { try {
    return _routeVectorWeightsInternal(pd, uid, ts);
  } catch (e) { _reportError('drip:vector_routing:' + uid, e, null); return { success: false, error: e.message }; }})();

  return manifest;
}


/**
 * Reads operator calibration weights from PropertiesService.
 * Returns a flat object { key: floatValue } for all CALIBRATION_KEYS
 * that have been set. Missing keys are omitted (callers use defaults).
 */
function _readOperatorCalibration(props) {
  const cal = {};
  CFG.CALIBRATION_KEYS.forEach(k => {
    const v = props.getProperty(k);
    if (v !== null && v !== '') cal[k] = parseFloat(v) || 0;
  });
  return cal;
}


/**
 * Applies operator calibration weights to pd.vector_weights.
 *
 * Calibration weight > 0.75 (default) = operator emphasises this domain.
 * Calibration weight < 0.75 = operator de-emphasises it.
 *
 * Formula: calibrated = raw × (cal / 0.75)
 *   e.g. THEME_ARCHITECTURE = 0.90 → 0.90/0.75 = 1.2× multiplier
 *        THEME_PEDAGOGY     = 0.60 → 0.60/0.75 = 0.8× multiplier
 *
 * Mutates pd.vector_weights in place. Returns pd.
 */
function _applyCalibration(pd, calibration) {
  if (!pd || !pd.vector_weights || !calibration) return pd;
  const DEFAULT = 0.75;
  const calMap = {
    'ARCHITECTURE': calibration.THEME_ARCHITECTURE     || DEFAULT,
    'PEDAGOGY':     calibration.THEME_PEDAGOGY         || DEFAULT,
    'RELATIONAL':   calibration.THEME_FAMILY_ALIGNMENT || DEFAULT,
  };
  const out = {};
  Object.entries(pd.vector_weights).forEach(([theme, raw]) => {
    const cal   = calMap[theme.toUpperCase()] || DEFAULT;
    out[theme]  = parseFloat(((parseFloat(raw) || 0) * (cal / DEFAULT)).toFixed(4));
  });
  pd.vector_weights = out;
  return pd;
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
        // FAILED_PARSE, ERROR rows intentionally excluded from counts
        // so the operator focuses on the curator list

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


// ================================================================
// END 3_Queue_Processor.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 4_Vector_Router.gs
// ================================================================
