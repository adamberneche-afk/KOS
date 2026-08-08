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
        staging.getRange(sheetRow, SC.STATUS      + 1).setValue('PENDING_FLOW');
        staging.getRange(sheetRow, SC.RETRY_COUNT + 1).setValue(newRetries);
        delete released[uid];
        staleReset++;
        console.log('[Turnstile] Row ' + sheetRow + ' (' + uid + ') stale — reset to PENDING_FLOW.');
      } else {
        activeCount++;
      }
    }

    // ── Pass 2: release PENDING_FLOW rows up to remaining concurrency ──
    freedSlots = Math.max(0, CFG.TURNSTILE_CONCURRENCY - activeCount);
    let releasedCount = 0;

    if (freedSlots > 0) {
      for (let i = 0; i < data.length && releasedCount < freedSlots; i++) {
        const sheetRow = i + 2;
        const status   = String(data[i][SC.STATUS]);
        if (status !== 'PENDING_FLOW') continue;

        const uid = String(data[i][SC.PAYLOAD_UID]);
        staging.getRange(sheetRow, SC.STATUS + 1).setValue('STUDIO_ACTIVE');
        released[uid] = nowMs;
        releasedCount++;
        console.log('[Turnstile] Row ' + sheetRow + ' (' + uid + ') released to STUDIO_ACTIVE.');
      }
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
// END 10_Turnstile.gs
// KOS v8.0 — The Headless Studio Edition
// ================================================================
