// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 10 of 10: Turnstile
// ================================================================
//
// REBUILT (reconciliation decision 2) — the original 10_Turnstile.gs
// used an incompatible schema (Status/Payload columns, PENDING_INFERENCE/
// IN_PROCESS values, ID_BRAIN_TRUST_INDEX property key) that did not
// match the real STAGING_PIPELINE sheet the other 9 files write to. See
// archived/10_Turnstile_ORIGINAL.gs for the superseded version.
//
// PURPOSE
// ─────────────────────────────────────────────────────────────
// Implements the PENDING_FLOW → STUDIO_ACTIVE gate described in
// STUDIO_INTEGRATION_SPEC.md and SCHEMA_REFERENCE.md but never built
// in the originally delivered 9 files (see kos-personal/README.md,
// "The delivered code does not match this file's own documentation").
//
//   PENDING_FLOW  → [Turnstile releases, up to CFG.TURNSTILE_CONCURRENCY]
//                 → STUDIO_ACTIVE
//   STUDIO_ACTIVE → [Studio infers, writes JSON, sets FLOW_COMPLETE]
//   STUDIO_ACTIVE → [stuck > CFG.TURNSTILE_STALE_MINS] → reset to
//                    PENDING_FLOW, Retry_Count incremented
//
// MANAGED_SERVICE MODE (CFG.INFERENCE_MODE, 1_Config_And_Deploy.gs)
// ─────────────────────────────────────────────────────────────
// When INFERENCE_MODE is 'MANAGED_SERVICE' instead of the default
// 'STUDIO', a row is handed off to the standalone inference-service
// (3_Queue_Processor.gs's _submitManagedServiceJob_) immediately before
// being released to STUDIO_ACTIVE, in place of native Studio inference.
// A row only advances to STUDIO_ACTIVE if that hand-off succeeds — a
// failed submission leaves it in PENDING_FLOW to retry on the next run,
// same as any other transient failure. This closes a previously-real gap
// (see kos-personal/README.md): MANAGED_SERVICE mode used to release rows
// to STUDIO_ACTIVE with no Studio watching and nothing else ever
// processing them.
//
// WHY RELEASE TIMESTAMPS LIVE IN PropertiesService, NOT A NEW COLUMN
// ─────────────────────────────────────────────────────────────
// Adding an 8th STAGING_PIPELINE column would mean touching every
// hardcoded 7-column getRange() call across 2/3/9_*.gs. Instead this
// file follows the same pattern already used elsewhere in v8.0 for
// transient runtime state (COUNCIL_LAST_RUN, KOS_PROMOTED_VECTORS,
// KOS_SHADOW_MATRIX): a small JSON map in PropertiesService, keyed by
// Payload_UID, pruned every run so it never grows unbounded.
//
// INSTALL
//   setupAllTriggers() in 1_Config_And_Deploy.gs installs
//   runMatrixTurnstile on a 5-minute time-driven trigger, matching
//   DEPLOYMENT_GUIDE.md's expected trigger list.
// ================================================================


// ================================================================
// TURNSTILE — TIME-DRIVEN ENTRY POINT
// ================================================================

/**
 * Releases PENDING_FLOW rows to STUDIO_ACTIVE up to
 * CFG.TURNSTILE_CONCURRENCY, and resets STUDIO_ACTIVE rows that have
 * been active longer than CFG.TURNSTILE_STALE_MINS back to
 * PENDING_FLOW (incrementing Retry_Count), per STUDIO_INTEGRATION_SPEC.md
 * Step 2 ("Staleness guard").
 *
 * Fully headless — no ui.alert. Errors go to ERROR_LOG via _reportError().
 *
 * Fires: every 5 min via time-driven trigger (setupAllTriggers).
 * Also safe to run manually from the Apps Script editor — DEPLOYMENT_GUIDE.md's
 * Troubleshooting section references running this by hand if rows stall.
 */
function runMatrixTurnstile() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('[Turnstile] Could not acquire lock — another run is active. Skipping.');
    return;
  }
  try {
    _coldEngineGate('runMatrixTurnstile', 'TIER_1');

    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const lastRow = staging.getLastRow();
    if (lastRow <= 1) return;  // header only — nothing to release

    const SC       = CFG.STAGING_COLS;
    const data     = staging.getRange(2, 1, lastRow - 1, 7).getValues();
    const released = _readReleaseMap();
    const nowMs    = new Date().getTime();
    const staleMs  = CFG.TURNSTILE_STALE_MINS * 60 * 1000;

    _alertOnUnknownStatuses_(data, SC);

    let staleReset = 0, activeCount = 0, freedSlots = 0;

    // ── Pass 1: reset stale STUDIO_ACTIVE rows, count still-active ──
    for (let i = 0; i < data.length; i++) {
      const sheetRow = i + 2;
      const status   = String(data[i][SC.STATUS]);
      if (status !== 'STUDIO_ACTIVE') continue;

      const uid         = String(data[i][SC.PAYLOAD_UID]);
      const releasedAt  = released[uid];
      const isStale     = releasedAt ? (nowMs - releasedAt) > staleMs : true;

      if (isStale) {
        const newRetries = (parseInt(data[i][SC.RETRY_COUNT]) || 0) + 1;
        delete released[uid];

        // Say/Do Ledger kos-personal finding #2, closed: a row with no
        // Studio flow ever completing it used to cycle PENDING_FLOW →
        // STUDIO_ACTIVE → (stale reset) forever, Retry_Count climbing
        // without bound — CFG.TURNSTILE_STUCK_THRESHOLD was a UI-only
        // "call this row stuck" signal (getQueueMetrics()) that never
        // actually stopped the cycle. Same escalate-to-failure pattern
        // Registrar already uses via CFG.REGISTRAR_RETRY_LIMIT
        // (_bounceRegistrarRow, 11_Registrar_CogRelay.gs): once the
        // threshold is exceeded, the row lands in the terminal
        // STUDIO_TIMEOUT status instead of re-queuing, so it stops
        // consuming a concurrency slot and surfaces for human review
        // instead of retrying invisibly forever.
        if (newRetries > CFG.TURNSTILE_STUCK_THRESHOLD) {
          const uidStr    = String(data[i][SC.PAYLOAD_UID]);
          const fileIdStr = String(data[i][SC.FILE_ID]);
          staging.getRange(sheetRow, SC.STATUS      + 1).setValue('STUDIO_TIMEOUT');
          staging.getRange(sheetRow, SC.RETRY_COUNT + 1).setValue(newRetries);
          staleReset++;
          console.error('[Turnstile] Row ' + sheetRow + ' (' + uid + ') → STUDIO_TIMEOUT after ' +
            newRetries + ' stale resets (threshold ' + CFG.TURNSTILE_STUCK_THRESHOLD + ').');
          _sendChatAlert(
            '🔴 STUDIO_TIMEOUT — kos-personal Turnstile\n' +
            'Row: ' + sheetRow + ' (' + uidStr + ', file ' + fileIdStr + ')\n' +
            'No Studio flow ever completed this row after ' + newRetries + ' stale resets. ' +
            'Human review required — see STAGING_PIPELINE.'
          );
        } else {
          staging.getRange(sheetRow, SC.STATUS      + 1).setValue('PENDING_FLOW');
          staging.getRange(sheetRow, SC.RETRY_COUNT + 1).setValue(newRetries);
          staleReset++;
          console.log('[Turnstile] Row ' + sheetRow + ' (' + uid + ') stale — reset to PENDING_FLOW.');
        }
      } else {
        activeCount++;
      }
    }

    // ── Pass 2: release PENDING_FLOW rows up to remaining concurrency ──
    // Priority rows (audit-gate rejections reverted to PENDING_FLOW —
    // see _markAuditRetryPriority_(), 5_Error_And_Utilities.gs) release
    // FIRST, ahead of normal row order — "push the log back to the
    // start of the queue" without physically reordering sheet rows,
    // which would risk a row-shift race against a concurrent trigger run.
    freedSlots = Math.max(0, CFG.TURNSTILE_CONCURRENCY - activeCount);
    let releasedCount = 0;

    const auditPriority   = _readAuditRetryPrioritySet_();
    const releaseOrder    = [];
    const priorityIndices = [];
    const normalIndices   = [];
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][SC.STATUS]) !== 'PENDING_FLOW') continue;
      const isPriority = !!auditPriority[String(data[i][SC.PAYLOAD_UID])];
      (isPriority ? priorityIndices : normalIndices).push(i);
    }
    releaseOrder.push(...priorityIndices, ...normalIndices);
    const consumedPriorityUids = [];

    if (freedSlots > 0) {
      for (let oi = 0; oi < releaseOrder.length && releasedCount < freedSlots; oi++) {
        const i        = releaseOrder[oi];
        const sheetRow = i + 2;
        const status   = String(data[i][SC.STATUS]);
        if (status !== 'PENDING_FLOW') continue; // defensive; releaseOrder is already filtered

        const uid = String(data[i][SC.PAYLOAD_UID]);

        // MANAGED_SERVICE mode: hand the job off to the standalone
        // inference-service before releasing — see _submitManagedServiceJob_
        // in 3_Queue_Processor.gs for why this exists (was previously
        // completely unwired; see kos-personal/README.md). In the default
        // 'STUDIO' mode this block is skipped entirely and the release
        // behaves exactly as it did before this fix.
        if (CFG.INFERENCE_MODE === 'MANAGED_SERVICE') {
          const fileId      = String(data[i][SC.FILE_ID]);
          const docUrl      = String(data[i][SC.DOC_URL]);
          const payloadType = String(data[i][SC.PAYLOAD_TYPE]);
          const submission  = _submitManagedServiceJob_(uid, fileId, docUrl, payloadType, ss.getId());

          if (!submission.ok) {
            console.warn('[Turnstile] Row ' + sheetRow + ' (' + uid + ') not released — ' +
              'managed-service submission failed: ' + submission.error);
            continue; // leave PENDING_FLOW, retry on the next 5-min run
          }
          console.log('[Turnstile] Row ' + sheetRow + ' (' + uid + ') submitted to managed service (job ' +
            submission.job_id + ').');
        }

        staging.getRange(sheetRow, SC.STATUS + 1).setValue('STUDIO_ACTIVE');
        released[uid] = nowMs;
        releasedCount++;
        if (auditPriority[uid]) consumedPriorityUids.push(uid);
        console.log('[Turnstile] Row ' + sheetRow + ' (' + uid + ') released to STUDIO_ACTIVE' +
          (auditPriority[uid] ? ' (priority — audit retry)' : '') + '.');
      }
    }

    // Priority is one-shot: drop consumed UIDs, plus any UID no longer
    // present in the sheet at all (archived, or otherwise gone) — same
    // pruning rationale as the release map below.
    if (consumedPriorityUids.length > 0 || Object.keys(auditPriority).length > 0) {
      const uidsInSheet = new Set(data.map(r => String(r[SC.PAYLOAD_UID])));
      let changed = false;
      consumedPriorityUids.forEach(uid => { delete auditPriority[uid]; changed = true; });
      Object.keys(auditPriority).forEach(uid => {
        if (!uidsInSheet.has(uid)) { delete auditPriority[uid]; changed = true; }
      });
      if (changed) _writeAuditRetryPrioritySet_(auditPriority);
    }

    // ── Prune the release map: drop any UID no longer present in
    // STAGING_PIPELINE at all (e.g. archived by archiveStagingPipeline()).
    // Entries for rows still present but no longer STUDIO_ACTIVE are
    // harmless — Pass 1 above only ever reads entries for rows whose
    // current status is STUDIO_ACTIVE — but pruning fully-gone rows
    // keeps this map from growing unbounded over the system's lifetime.
    const uidsInSheet = new Set(data.map(r => String(r[SC.PAYLOAD_UID])));
    Object.keys(released).forEach(uid => {
      if (!uidsInSheet.has(uid)) delete released[uid];
    });
    _writeReleaseMap(released);

    if (staleReset + releasedCount > 0) SpreadsheetApp.flush();

    console.log(
      '[Turnstile] active=' + activeCount +
      ' released='  + releasedCount +
      ' staleReset=' + staleReset +
      ' concurrency=' + CFG.TURNSTILE_CONCURRENCY
    );

  } catch (e) {
    _reportError('runMatrixTurnstile', e, null);
  } finally {
    lock.releaseLock();
  }
}


// ================================================================
// RELEASE MAP — PropertiesService-backed { Payload_UID: releasedAtMs }
// ================================================================

/** Reads the turnstile release-timestamp map. Returns {} if unset/corrupt. */
function _readReleaseMap() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('KOS_TURNSTILE_RELEASED');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('[Turnstile] Release map corrupt — resetting. ' + e.message);
    return {};
  }
}

/** Persists the turnstile release-timestamp map. */
function _writeReleaseMap(map) {
  PropertiesService.getScriptProperties()
    .setProperty('KOS_TURNSTILE_RELEASED', JSON.stringify(map));
}


// ================================================================
// UNKNOWN-STATUS CATCH-ALL
// ================================================================
// A row whose Status is not in KNOWN_STAGING_STATUSES / doesn't match a
// TERMINAL_FAILED_STATUSES prefix (5_Error_And_Utilities.gs) matches
// none of the exact-string checks in this file, the Queue Processor's
// main loop, or getQueueMetrics()'s counts — it's invisible to every
// health check the system has, including the STUDIO_TIMEOUT ceiling
// above. Found via a real row stuck at "AUDITING _LOG", a status no
// Sensor/Turnstile/Queue-Processor/Studio flow in this codebase ever
// writes. This never auto-fixes the row — same "propose, don't execute"
// boundary as everything else here — it only makes sure a human finds
// out, once, instead of the row sitting silently forever.

/**
 * Alerts once per Payload_UID for any row whose Status isn't recognized
 * by _isKnownStagingStatus_(). Memoized via PropertiesService so a
 * standing unknown-status row doesn't re-alert every 5-minute run.
 *
 * @param {Array<Array>} data  STAGING_PIPELINE data rows (from getValues()).
 * @param {Object} SC          CFG.STAGING_COLS column-index map.
 */
function _alertOnUnknownStatuses_(data, SC) {
  const alerted = _readUnknownStatusAlertedSet_();
  const uidsInSheet = new Set();
  let alertedThisRun = false;

  for (let i = 0; i < data.length; i++) {
    const status = String(data[i][SC.STATUS]);
    const uid    = String(data[i][SC.PAYLOAD_UID]);
    uidsInSheet.add(uid);

    if (_isKnownStagingStatus_(status)) continue;
    if (alerted[uid]) continue; // already alerted this UID once

    const sheetRow  = i + 2;
    const fileIdStr = String(data[i][SC.FILE_ID]);
    console.error('[Turnstile] Row ' + sheetRow + ' (' + uid + ') has unrecognized Status "' +
      status + '" — invisible to Turnstile, the Queue Processor, and the Queue tab.');
    _sendChatAlert(
      '🟡 UNKNOWN STATUS — kos-personal STAGING_PIPELINE\n' +
      'Row: ' + sheetRow + ' (' + uid + ', file ' + fileIdStr + ')\n' +
      'Status: "' + status + '" is not a recognized pipeline state (see ' +
      'SCHEMA_REFERENCE.md\'s Status Lifecycle table). This row is invisible ' +
      'to Turnstile, the Queue Processor, and the Queue tab\'s health counts — ' +
      'it will never advance on its own. Fix the Status cell by hand to ' +
      're-enter it into the pipeline. (You will not be alerted again for this row.)'
    );
    alerted[uid] = true;
    alertedThisRun = true;
  }

  // Prune UIDs no longer present in the sheet at all (e.g. archived by
  // archiveStagingPipeline()) — same pruning rationale as the release
  // map below: keeps this from growing unbounded over the system's
  // lifetime.
  let pruned = false;
  Object.keys(alerted).forEach(uid => {
    if (!uidsInSheet.has(uid)) { delete alerted[uid]; pruned = true; }
  });

  if (alertedThisRun || pruned) _writeUnknownStatusAlertedSet_(alerted);
}

/** Reads the { Payload_UID: true } set of already-alerted unknown-status rows. */
function _readUnknownStatusAlertedSet_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('KOS_UNKNOWN_STATUS_ALERTED');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('[Turnstile] Unknown-status alert set corrupt — resetting. ' + e.message);
    return {};
  }
}

/** Persists the { Payload_UID: true } set of already-alerted unknown-status rows. */
function _writeUnknownStatusAlertedSet_(set) {
  PropertiesService.getScriptProperties()
    .setProperty('KOS_UNKNOWN_STATUS_ALERTED', JSON.stringify(set));
}


// ================================================================
// END 10_Turnstile.gs
// KOS v8.0 — The Headless Studio Edition
// ================================================================
