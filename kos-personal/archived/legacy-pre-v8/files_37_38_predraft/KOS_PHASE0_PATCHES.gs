// ================================================================
// KOS PHASE 0 — CRITICAL BUG FIXES
// Patch target : KOS_MASTER_v3_1.gs (v5.4)
// Output       : Stable baseline for v8.0 Headless Studio build
// ================================================================
//
// HOW TO APPLY
// ─────────────────────────────────────────────────────────────
// 1. Open your Apps Script project (the one containing
//    KOS_MASTER_v3_1.gs).
// 2. Create a NEW script file called KOS_PHASE0_PATCHES.gs and
//    paste this entire file into it.
//    *** GAS does not allow duplicate function names across
//    project files. After confirming each patched function works
//    correctly, DELETE the original version from
//    KOS_MASTER_v3_1.gs. The patch file becomes the live version.
// 3. Run runPhase0Migration() ONCE from the editor to migrate
//    the STAGING_PIPELINE schema.
// 4. Run runPhase0Verify() to confirm all 5 patches are live.
// 5. Proceed to v8.0 build phases.
//
// BUGS FIXED
// ─────────────────────────────────────────────────────────────
// BUG-01  LockService deadlock: processIntakePayload holds the
//         script lock, then calls routeVectorWeights which tries
//         to acquire the same lock → always returns {LOCKED}.
//         Vector routing has never fired from the normal pipeline.
//
// BUG-02  STAGING_PIPELINE schema + hardcoded column indices.
//         New 7-col schema adds Payload_Type (col C) and
//         Retry_Count (col G). All column reads use SC constants.
//         BONUS: archiveStagingPipeline checked col 3 (File_ID)
//         for terminal statuses instead of col 4 (Status) →
//         the archive function has never successfully moved a row.
//
// BUG-03  _routeToVectorDocs re-opened newly created docs by
//         searching Drive by filename rather than using the known
//         file ID. Race condition if two docs share a name.
//
// BUG-04  CFG.KNOWN_VECTORS.push() in _checkPromotionCandidates
//         only mutates the runtime array. Promoted vectors are
//         lost on the next script execution.
//
// BUG-05  applyMutation() called ui.alert for confirmation.
//         When fired from an installable background trigger
//         (onGovernanceEdit), getUi() throws. The existing
//         try/catch silently swallowed this and fired the
//         mutation without any confirmation. The Blackboard
//         Deploy_Trigger checkbox IS the operator confirmation.
// ================================================================


// ── STAGING_PIPELINE COLUMN INDEX CONSTANTS ────────────────────
// These replace all hardcoded column indices throughout the file.
// In the v8.0 build these will live inside CFG.STAGING_COLS.
const SC = {
  TIMESTAMP:    0,
  PAYLOAD_UID:  1,
  PAYLOAD_TYPE: 2,
  DOC_URL:      3,
  FILE_ID:      4,
  STATUS:       5,
  RETRY_COUNT:  6,
};
const MAX_RETRIES = 3;


// ================================================================
// MIGRATION & VERIFICATION
// ================================================================

/**
 * ONE-TIME migration. Transforms STAGING_PIPELINE from the v5.4
 * 5-col schema to the v8.0 7-col schema and renames the status
 * PENDING_INFERENCE → PENDING_FLOW across all existing rows.
 *
 * OLD: [Timestamp, Chunk_UID, Doc_URL, File_ID, Status]
 * NEW: [Timestamp, Payload_UID, Payload_Type, Doc_URL,
 *        File_ID, Status, Retry_Count]
 *
 * Safe to re-run: detects and skips if already migrated.
 */
function runPhase0Migration() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);

  // ── STAGING_PIPELINE ─────────────────────────────────────────
  const staging = ss.getSheetByName(CFG.STAGING_SHEET);
  if (!staging) {
    console.log('[MIGRATION] STAGING_PIPELINE sheet not found — nothing to migrate.');
  } else {
    const header = staging.getRange(1, 1, 1, staging.getLastColumn()).getValues()[0];
    if (header[SC.PAYLOAD_TYPE] === 'Payload_Type') {
      console.log('[MIGRATION] STAGING_PIPELINE already on v8 schema. Skipping.');
    } else {
      const data    = staging.getDataRange().getValues();
      const newRows = [
        ['Timestamp','Payload_UID','Payload_Type','Doc_URL','File_ID','Status','Retry_Count'],
      ];
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        newRows.push([
          r[0],                                                   // Timestamp (unchanged)
          r[1],                                                   // Chunk_UID → Payload_UID
          'SESSION_LOG',                                          // Payload_Type (default for existing rows)
          r[2],                                                   // Doc_URL
          r[3],                                                   // File_ID
          r[4] === 'PENDING_INFERENCE' ? 'PENDING_FLOW' : r[4], // Status rename
          0,                                                      // Retry_Count (new)
        ]);
      }
      staging.clearContents();
      if (newRows.length > 0) {
        staging.getRange(1, 1, newRows.length, 7).setValues(newRows);
      }
      console.log('[MIGRATION] STAGING_PIPELINE migrated. '
        + (newRows.length - 1) + ' data row(s) updated.');
    }
  }

  // ── STAGING_ARCHIVE (header update if it exists) ─────────────
  const archive = ss.getSheetByName('STAGING_ARCHIVE');
  if (archive) {
    const archHeader = archive.getRange(1, 1, 1, archive.getLastColumn()).getValues()[0];
    if (!archHeader.includes('Payload_Type')) {
      archive.insertColumnBefore(4);
      archive.getRange(1, 4).setValue('Payload_Type');
      console.log('[MIGRATION] STAGING_ARCHIVE: Payload_Type column inserted at col 4.');
    }
  }

  // ── MATRIX_LEDGER — 7-col (v5.4) → 9-col (v8.0) (FIX-07) ────
  // v5.4 schema: [Session_UID, Timestamp, ARCHITECTURE, UI,
  //               SECURITY, PEDAGOGY, TOTAL]  ← 7 cols
  // v8.0 schema: [Session_UID, Timestamp, ARCHITECTURE, UI,
  //               SECURITY, PEDAGOGY, GAS_DEVELOPMENT,
  //               RELATIONAL, TOTAL]           ← 9 cols
  //
  // Without this migration, processIntakePayload() writes 9 values
  // into a 7-column sheet, creating two orphaned unheadered columns.
  const ledger = ss.getSheetByName(CFG.MATRIX_LEDGER_SHEET);
  if (ledger) {
    const lh = ledger.getRange(1, 1, 1, ledger.getLastColumn()).getValues()[0];
    if (lh.length === 7 && lh[6] === 'TOTAL') {
      // Insert GAS_DEVELOPMENT and RELATIONAL before TOTAL (col 7)
      ledger.insertColumnBefore(7);  // TOTAL shifts to col 8
      ledger.insertColumnBefore(7);  // TOTAL shifts to col 9
      ledger.getRange(1, 7).setValue('GAS_DEVELOPMENT');
      ledger.getRange(1, 8).setValue('RELATIONAL');
      if (ledger.getLastRow() > 1) {
        ledger.getRange(2, 7, ledger.getLastRow() - 1, 2).setValue(0);
      }
      console.log('[MIGRATION] MATRIX_LEDGER migrated: GAS_DEVELOPMENT + RELATIONAL columns added.');
    } else if (lh.length >= 9) {
      console.log('[MIGRATION] MATRIX_LEDGER already on v8 schema. Skipping.');
    } else {
      console.log('[MIGRATION] MATRIX_LEDGER unexpected schema (' + lh.length + ' cols) — manual review needed.');
    }
  }

  SpreadsheetApp.flush();
  console.log('[MIGRATION] Phase 0 complete. Run runPhase0Verify() to confirm.');
}


/**
 * Sanity check for all 5 bug fixes.
 * Run from the editor and read the execution log.
 */
function runPhase0Verify() {
  const log = [];

  // BUG-01
  log.push(typeof _routeVectorWeightsInternal === 'function'
    ? '✅ BUG-01  Lock fix  : _routeVectorWeightsInternal() defined'
    : '❌ BUG-01  Lock fix  : _routeVectorWeightsInternal() NOT found');

  // BUG-02 schema
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = ss.getSheetByName(CFG.STAGING_SHEET);
    if (!staging) {
      log.push('⚠  BUG-02  Schema    : STAGING_PIPELINE sheet not found');
    } else {
      const h  = staging.getRange(1, 1, 1, staging.getLastColumn()).getValues()[0];
      const ok = h[SC.PAYLOAD_TYPE] === 'Payload_Type' && h[SC.RETRY_COUNT] === 'Retry_Count';
      log.push(ok
        ? '✅ BUG-02  Schema    : 7-col header confirmed'
        : '❌ BUG-02  Schema    : Run runPhase0Migration() — got ' + JSON.stringify(h));
    }
  } catch (e) {
    log.push('❌ BUG-02  Schema    : Check error — ' + e.message);
  }

  // BUG-03
  log.push(!_routeToVectorDocs.toString().includes('getFilesByName(name).next')
    ? '✅ BUG-03  File ID   : getFilesByName re-open removed'
    : '❌ BUG-03  File ID   : old pattern still present');

  // BUG-04
  log.push(typeof _getKnownVectors === 'function' && typeof _persistPromotedVector === 'function'
    ? '✅ BUG-04  Vectors   : _getKnownVectors + _persistPromotedVector defined'
    : '❌ BUG-04  Vectors   : helper functions not found');

  // BUG-05
  log.push(!applyMutation.toString().includes('ui.alert')
    ? '✅ BUG-05  Mutation  : ui.alert removed from applyMutation'
    : '❌ BUG-05  Mutation  : ui.alert still present');

  log.forEach(line => console.log(line));
}


// ================================================================
// BUG-01 FIX — LockService Deadlock
//
// Root cause: processIntakePayload acquires the script lock on
// line 798, then calls routeVectorWeights on line 887, which
// immediately tries to acquire the same lock. LockService
// tryLock on an already-held script lock will always time out
// and return false → { status: 'LOCKED' }. Vector routing has
// never fired from within the normal intake pipeline.
//
// Fix: extract core routing logic into _routeVectorWeightsInternal
// (no lock). processIntakePayload calls it directly since it
// already owns the lock. routeVectorWeights becomes a thin
// lock-acquiring wrapper for safe standalone/diagnostic calls.
// ================================================================

function processIntakePayload(rawJSONPayload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: 'LOCKED', message: 'System busy.' };
  try {
    let pd;
    try { pd = JSON.parse(rawJSONPayload); }
    catch (pe) {
      _reportError('processIntakePayload JSON parse', pe, null);
      throw new Error('Malformed JSON: ' + pe.message);
    }

    const props    = PropertiesService.getScriptProperties();
    const stateId  = props.getProperty('ID_CURRENT_STATE');
    const indexId  = props.getProperty('INDEX_ID');
    const vectorId = props.getProperty('ID_05_VECTOR_REPOSITORY');
    const pivotId  = props.getProperty('ID_PIVOTS_AND_LESSONS');
    if (!stateId || !indexId || !vectorId || !pivotId) {
      throw new Error('Core pointers missing. Run 🚀 Deploy or Setup Routing Properties.');
    }

    const ts         = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const uid        = 'LOG_' + new Date().getTime();
    const stateDoc   = DocumentApp.openById(stateId);
    const pivotDoc   = DocumentApp.openById(pivotId);
    const indexSheet = SpreadsheetApp.openById(indexId);

    // next_steps / deferred_decisions → CURRENT_STATE
    const stateBody = stateDoc.getBody();
    if (pd.dynamic_state?.next_steps?.length > 0) {
      stateBody.appendParagraph(`\n[State Sync: ${ts} | ${uid}]`)
               .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      stateBody.appendParagraph('NEXT STEPS:').setBold(true);
      pd.dynamic_state.next_steps.forEach(s => stateBody.appendListItem(s));
    }
    if (pd.dynamic_state?.deferred_decisions?.length > 0) {
      stateBody.appendParagraph(`DEFERRED (${uid}):`).setBold(true);
      pd.dynamic_state.deferred_decisions.forEach(d =>
        stateBody.appendListItem(
          `[${d.owner || 'unassigned'}] ${d.decision} — Blocking: ${d.blocking}`));
    }

    // pivots → PIVOTS_AND_LESSONS
    if (pd.dynamic_state?.pivots_and_lessons?.length > 0) {
      const pb = pivotDoc.getBody();
      pb.appendParagraph(`\n[Session: ${ts} | ${uid}]`)
        .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      pd.dynamic_state.pivots_and_lessons.forEach(p => pb.appendListItem(p));
    }

    // vector_weights → MATRIX_LEDGER
    const ledger = indexSheet.getSheetByName(CFG.MATRIX_LEDGER_SHEET);
    if (ledger) {
      const w    = pd.vector_weights || {};
      const arch = parseFloat(w.ARCHITECTURE) || 0;
      const ui_  = parseFloat(w.UI)           || 0;
      const sec  = parseFloat(w.SECURITY)     || 0;
      const ped  = parseFloat(w.PEDAGOGY)     || 0;
      ledger.appendRow([uid, ts, arch, ui_, sec, ped, (arch + ui_ + sec + ped).toFixed(4)]);
    }

    // session_metadata → SESSION_LOG
    const meta = pd.session_metadata || {};
    _getOrCreateSheet(indexSheet, CFG.SESSION_LOG_SHEET).appendRow([
      uid, ts,
      meta.session_type  || '',
      meta.cold_start    || '',
      meta.rtp_version   || '',
      pd.session_summary || '',
    ]);

    // cog_verdicts → COG_REGISTRY
    if (pd.cog_registry?.cog_verdicts?.length > 0) {
      const cs = _getOrCreateSheet(indexSheet, CFG.COG_REGISTRY_SHEET);
      pd.cog_registry.cog_verdicts.forEach(v =>
        cs.appendRow([uid, ts, v.cog || '', v.final_status || '', v.summary || '']));
    }

    // action_exhaust → ACTION_REGISTER
    if (pd.action_exhaust?.length > 0) {
      const as = _getOrCreateSheet(indexSheet, CFG.ACTION_REGISTER_SHEET);
      pd.action_exhaust.forEach(a => as.appendRow([
        uid, ts,
        a.type  || '',
        a.item  || '',
        a.owner || 'unassigned',
        a.protected_time_risk ? 'YES' : 'NO',
        'OPEN',
      ]));
    }

    // smp_proposals → Blackboard
    if (pd.session_delta?.smp_proposals_filed?.length > 0) {
      const bb = _getOrCreateSheet(indexSheet, CFG.BLACKBOARD_SHEET);
      pd.session_delta.smp_proposals_filed.forEach(smp => bb.appendRow([
        '', smp.proposal_id || '', smp.title || '', '',
        `[${smp.proposal_id || 'SMP'}]`,
        smp.summary || '',
        '',
        `Filed by: ${smp.filed_by || 'unknown'} | ${smp.status || 'PENDING'}`,
        smp.filed_by || '', ts, 'STAGED_FOR_REVIEW', false,
      ]));
    }

    // alignment RED / YELLOW → error queue
    if (pd.alignment_report) {
      const alignStatus = pd.alignment_report.relational_status_at_closeout;
      if (alignStatus === 'RED' || alignStatus === 'YELLOW') {
        _reportError(
          `ALIGNMENT ${alignStatus} — ${uid}`,
          new Error(
            `Status: ${alignStatus}. ` +
            `Thresholds: ${(pd.alignment_report.thresholds_crossed_this_session || []).join(', ') || 'none'}. ` +
            `Pauses: ${pd.alignment_report.mandatory_pauses_issued || 0}.`
          ),
          null,
        );
      }
    }

    // ── BUG-01 FIX ──────────────────────────────────────────────
    // Was: routeVectorWeights(pd, uid, ts)
    //   → acquired same script lock this function holds → LOCKED
    // Now: _routeVectorWeightsInternal() — no lock, caller owns it
    const vr = _routeVectorWeightsInternal(pd, uid, ts);
    // ────────────────────────────────────────────────────────────

    return { status: 'SUCCESS', uid, vectorRouting: vr };

  } catch (error) {
    _reportError('processIntakePayload', error, null);
    return { status: 'ERROR', message: error.message };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Safe public entry point for standalone / diagnostic calls.
 * Acquires the script lock, delegates to internal, releases.
 */
function routeVectorWeights(pd, sessionUid, timestamp) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: 'LOCKED' };
  try {
    return _routeVectorWeightsInternal(pd, sessionUid, timestamp);
  } finally {
    lock.releaseLock();
  }
}


/**
 * Core vector routing logic. No lock — callers are responsible
 * for owning the script lock before calling this function.
 * Uses _getKnownVectors() (BUG-04 fix) instead of CFG.KNOWN_VECTORS.
 */
function _routeVectorWeightsInternal(pd, sessionUid, timestamp) {
  try {
    const ss           = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrixSheet  = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const incubSheet   = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);
    const raw          = pd.vector_weights || {};
    const known        = {};
    const unknown      = {};

    // BUG-04 FIX: _getKnownVectors() merges CFG base + persisted promotions
    const knownList = _getKnownVectors();
    Object.entries(raw).forEach(([t, v]) => {
      const s = parseFloat(v);
      if (isNaN(s)) return;
      if (knownList.includes(t.toUpperCase()))        known[t.toUpperCase()]   = s;
      else if (s >= CFG.INCUBATOR_THRESHOLD)          unknown[t.toUpperCase()] = s;
    });

    const matrixRow        = _writeMatrixRow(matrixSheet, known, sessionUid, timestamp);
    const incubatorSignals = _logToIncubator(incubSheet, unknown, sessionUid);
    const routedDocs       = _routeToVectorDocs(pd, known, sessionUid, timestamp);
    const promotions       = _checkPromotionCandidates(incubSheet, matrixSheet);
    SpreadsheetApp.flush();
    return { status: 'SUCCESS', matrixRow, routedDocs, incubatorSignals, promotions };
  } catch (e) {
    _reportError('_routeVectorWeightsInternal', e, null);
    return { status: 'ERROR', message: e.message };
  }
}


// ================================================================
// BUG-03 FIX — _routeToVectorDocs File ID Race Condition
//
// Root cause: after DocumentApp.create() → saveAndClose() →
// moveTo(), the original code called:
//   DriveApp.getFilesByName(name).next().getId()
// This searches all of Drive by filename. Drive's search index
// may not yet reflect the moveTo, so it can return a stale or
// wrong file. If two VECTOR_ docs ever share a name it will
// open the wrong one.
//
// Fix: capture d.getId() before saveAndClose and use it directly.
// ================================================================

function _routeToVectorDocs(pd, known, sessionUid, timestamp) {
  const folderId = PropertiesService.getScriptProperties().getProperty('ID_05_VECTOR_REPOSITORY');
  if (!folderId) return 0;
  const folder = DriveApp.getFolderById(folderId);
  let count = 0;

  Object.entries(known).forEach(([theme, score]) => {
    if (score <= CFG.INCUBATOR_THRESHOLD) return;
    const name     = 'VECTOR_' + theme;
    const existing = folder.getFilesByName(name);

    const doc = existing.hasNext()
      ? DocumentApp.openById(existing.next().getId())
      : (() => {
          const d   = DocumentApp.create(name);
          const dId = d.getId();    // ← capture before saveAndClose
          d.getBody().appendParagraph(name)
           .setHeading(DocumentApp.ParagraphHeading.HEADING1);
          d.saveAndClose();
          DriveApp.getFileById(dId).moveTo(folder);
          return DocumentApp.openById(dId);  // ← use captured ID, not name search
        })();

    const body = doc.getBody();
    if (score > CFG.VECTOR_THRESHOLD) {
      body.appendParagraph(`\n[HIGH-WEIGHT: ${timestamp} | ${sessionUid} | Score: ${score}]`)
          .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      if (pd.session_summary) body.appendParagraph(pd.session_summary);
    } else {
      body.appendParagraph(`[Signal: ${timestamp} | ${sessionUid} | Score: ${score}]`);
    }
    doc.saveAndClose();
    count++;
  });
  return count;
}


// ================================================================
// BUG-04 FIX — KNOWN_VECTORS Promotion Persistence
//
// Root cause: _checkPromotionCandidates called
//   CFG.KNOWN_VECTORS.push(theme)
// CFG is a const object re-initialized on every script execution.
// Any themes promoted in a previous run were silently dropped.
// In practice this meant promoted themes would be re-evaluated as
// INCUBATOR candidates on every subsequent run.
//
// Fix: persist promoted themes to PropertiesService via
// _persistPromotedVector(). _getKnownVectors() merges the CFG
// base list with any persisted promotions at read time.
// ================================================================

/**
 * Returns CFG.KNOWN_VECTORS merged with all themes promoted from
 * the incubator in previous script executions. Use this everywhere
 * instead of CFG.KNOWN_VECTORS directly.
 */
function _getKnownVectors() {
  const base = CFG.KNOWN_VECTORS.slice();
  try {
    const raw = PropertiesService.getScriptProperties()
                  .getProperty('KOS_PROMOTED_VECTORS');
    if (raw) {
      JSON.parse(raw).forEach(t => { if (!base.includes(t)) base.push(t); });
    }
  } catch (e) {
    console.error('[_getKnownVectors] Could not read promotions: ' + e.message);
  }
  return base;
}


/**
 * Persists a newly promoted theme to PropertiesService.
 * Idempotent — safe to call multiple times for the same theme.
 */
function _persistPromotedVector(theme) {
  const props = PropertiesService.getScriptProperties();
  try {
    const raw  = props.getProperty('KOS_PROMOTED_VECTORS');
    const list = raw ? JSON.parse(raw) : [];
    if (!list.includes(theme)) {
      list.push(theme);
      props.setProperty('KOS_PROMOTED_VECTORS', JSON.stringify(list));
    }
  } catch (e) {
    console.error('[_persistPromotedVector] Failed to persist "' + theme + '": ' + e.message);
  }
}


function _checkPromotionCandidates(incubSheet, matrixSheet) {
  const promoted = [];
  if (incubSheet.getLastRow() <= 1) return promoted;

  const data    = incubSheet.getRange(2, 1, incubSheet.getLastRow() - 1, 6).getValues();
  const headers = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];

  data.forEach((row, i) => {
    const [theme,,, count, avg, status] = row;
    if (
      status === 'PROMOTED'                              ||
      parseInt(count)  < CFG.PROMOTION_MIN_SESSIONS     ||
      parseFloat(avg)  < CFG.PROMOTION_MIN_AVG_WEIGHT   ||
      headers.includes(theme)
    ) return;

    const nc = matrixSheet.getLastColumn() + 1;
    matrixSheet.getRange(1, nc).setValue(theme);
    if (matrixSheet.getLastRow() > 1) {
      matrixSheet.getRange(2, nc, matrixSheet.getLastRow() - 1, 1).setValue(0);
    }
    incubSheet.getRange(i + 2, 6).setValue('PROMOTED');

    // ── BUG-04 FIX ──────────────────────────────────────────────
    // Was: CFG.KNOWN_VECTORS.push(theme)  ← runtime only, lost next run
    // Now: persisted to PropertiesService via _persistPromotedVector()
    _persistPromotedVector(theme);
    // ────────────────────────────────────────────────────────────

    promoted.push(theme);
  });
  return promoted;
}


// ================================================================
// BUG-05 FIX — applyMutation ui.alert in Background Trigger
//
// Root cause: applyMutation wrapped ui.alert in a try/catch.
// When called from the installable onGovernanceEdit trigger,
// DocumentApp.getUi() throws "Cannot call getUi() from this
// context." The catch block checked if the error message
// contained 'cancelled' — it doesn't in a trigger context —
// so it logged a warning and fell through, firing the mutation
// with no confirmation whatsoever.
//
// Fix: remove the UI block entirely. The operator signals
// confirmation by checking Deploy_Trigger (col 12 = true) in
// the Blackboard row. onGovernanceEdit only calls applyMutation
// when that value is true, which is the authorization.
// ================================================================

function applyMutation(docId, searchTag, payload) {
  if (!docId || !searchTag) {
    throw new Error('applyMutation: Missing docId or searchTag.');
  }
  const body = DocumentApp.openById(docId).getBody();
  const el   = body.findText(searchTag);
  if (!el) {
    throw new Error(`Strict Match Failed: "${searchTag}" not found in doc ${docId}.`);
  }
  el.getElement().asText().replaceText(searchTag, payload);
  console.log(`[applyMutation] Deployed to ${docId}: "${searchTag}"`);
  return true;
}


// ================================================================
// BUG-02 FIX — STAGING_PIPELINE Column Index Hardcoding
//
// All column reads and writes now use SC constants instead of
// magic numbers. processInferenceQueue and archiveStagingPipeline
// are the primary consumers.
//
// BONUS FIX in archiveStagingPipeline: the terminal status check
// was data[i][3] which is File_ID. Status is data[i][4] in the
// old schema (data[i][SC.STATUS] = data[i][5] in the new one).
// Because File_ID strings never matched terminal status strings,
// archiveStagingPipeline has never archived a single row.
//
// Retry logic added: NEEDS_CURATOR rows increment a counter.
// After MAX_RETRIES the row is set to FAILED_PARSE and
// _reportError() fires once (queued for daily digest in v8.0).
// Backward-compat: PENDING_INFERENCE accepted during migration.
// ================================================================

function processInferenceQueue() {
  const ui = DocumentApp.getUi();
  try {
    _coldEngineGate('processInferenceQueue', 'TIER_2');
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data    = staging.getDataRange().getValues();

    let processed = 0, notReady = 0, errs = 0;

    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][SC.STATUS]);

      // Accept PENDING_INFERENCE during migration window
      const isPending = status === 'PENDING_FLOW' || status === 'PENDING_INFERENCE';
      const isCurator = status === 'NEEDS_CURATOR';
      if (!isPending && !isCurator) continue;

      const fileId = data[i][SC.FILE_ID];   // BUG-02 FIX: was data[i][3]
      if (!fileId) {
        staging.getRange(i + 1, SC.STATUS + 1).setValue('ERROR: No File_ID in row');
        errs++;
        continue;
      }

      try {
        const raw = DocumentApp.openById(fileId).getBody().getText().trim();
        let parsed;
        try {
          parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        } catch (_) {
          // JSON parse failed — doc still has raw chunk text or malformed JSON
          const retries = (parseInt(data[i][SC.RETRY_COUNT]) || 0) + 1;
          if (retries >= MAX_RETRIES) {
            staging.getRange(i + 1, SC.STATUS + 1).setValue('FAILED_PARSE');
            staging.getRange(i + 1, SC.RETRY_COUNT + 1).setValue(retries);
            _reportError(
              'processInferenceQueue',
              new Error(
                `Row ${i + 1} (${data[i][SC.PAYLOAD_UID]}) failed JSON parse ` +
                `${retries} times. Manual intervention required.\n` +
                `Doc: ${data[i][SC.DOC_URL]}`
              ),
              null,
            );
          } else {
            staging.getRange(i + 1, SC.STATUS + 1).setValue('NEEDS_CURATOR');
            staging.getRange(i + 1, SC.RETRY_COUNT + 1).setValue(retries);
          }
          notReady++;
          continue;
        }

        const result = processIntakePayload(JSON.stringify(parsed));
        if (result.status === 'SUCCESS') {
          staging.getRange(i + 1, SC.STATUS + 1).setValue('INTAKE_PROCESSED');
          processed++;
        } else {
          staging.getRange(i + 1, SC.STATUS + 1)
                 .setValue('INTAKE_ERROR: ' + result.message);
          _reportError('processInferenceQueue row ' + (i + 1),
                        new Error(result.message), null);
          errs++;
        }
      } catch (e) {
        staging.getRange(i + 1, SC.STATUS + 1).setValue('ERROR: ' + e.message);
        _reportError('processInferenceQueue row ' + (i + 1), e, null);
        errs++;
      }
    }

    if (processed > 0) {
      SpreadsheetApp.flush();
      try { _advanceOnboardingDay(); } catch (_) {}
    }

    const notReadyMsg = notReady > 0
      ? `\n\n${notReady} chunk(s) not yet ready (NEEDS_CURATOR).\n` +
        `Open via ② Export Chunks for Curator, run through Curator Gem, ` +
        `paste JSON back into the doc, then re-run.`
      : '';

    ui.alert('✅ Phase 3 Complete',
      `Processed: ${processed}\nNeeds Curator: ${notReady}\nErrors: ${errs}${notReadyMsg}`,
      ui.ButtonSet.OK);
  } catch (e) { _reportError('processInferenceQueue', e, ui); }
}


function exportChunksForCurator() {
  const ui = DocumentApp.getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const data    = staging.getDataRange().getValues();

    // BUG-02 FIX: was r[4]; now SC.STATUS
    const pending = data.slice(1).filter(r => {
      const s = String(r[SC.STATUS]);
      return s === 'PENDING_FLOW' || s === 'PENDING_INFERENCE' || s === 'NEEDS_CURATOR';
    });

    if (pending.length === 0) {
      ui.alert('No Chunks Pending',
        'No PENDING_FLOW or NEEDS_CURATOR rows in STAGING_PIPELINE.\n\nRun ① Intake & Chunk first.',
        ui.ButtonSet.OK);
      return;
    }

    // BUG-02 FIX: was r[1], r[2]; now SC.PAYLOAD_UID, SC.DOC_URL
    const lines = pending.map((r, i) =>
      `${(i + 1).toString().padStart(2, ' ')}. ${r[SC.PAYLOAD_UID]}\n    ${r[SC.DOC_URL]}`
    );

    ui.alert(
      `${pending.length} Chunk(s) Ready for Curator`,
      `WORKFLOW:\n` +
      `  1. Open each chunk doc (URLs below)\n` +
      `  2. Copy the raw chunk text\n` +
      `  3. Paste into your Curator Gem → get JSON response\n` +
      `  4. Return to the chunk doc → Select All → Paste\n` +
      `  5. Save and close the doc\n` +
      `  6. Repeat for all chunks\n` +
      `  7. Run ③ Process Inference Queue\n\n` +
      `── CHUNK DOCS ──\n${lines.join('\n\n')}`,
      ui.ButtonSet.OK,
    );
  } catch (e) { _reportError('exportChunksForCurator', e, ui); }
}


function archiveStagingPipeline() {
  const ui = DocumentApp.getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    let   archive = ss.getSheetByName('STAGING_ARCHIVE');

    if (!archive) {
      archive = ss.insertSheet('STAGING_ARCHIVE');
      archive.appendRow([
        'Archived_At','Timestamp','Payload_UID','Payload_Type',
        'Doc_URL','File_ID','Status','Retry_Count',
      ]);
      archive.getRange('1:1').setFontWeight('bold').setBackground('#f0e2d5');
      archive.setFrozenRows(1);
    }

    // BUG-02 FIX: added v8 status strings; kept legacy strings for rows
    //             that were never archived due to the column bug below.
    const terminal = [
      'PARTITIONED', 'CONSOLIDATED',
      'INTAKE_PROCESSED', 'PROCESSED',    // v8.0 name
      'FAILED_PARSE',                     // new — retry cap exceeded
      'PHASE_2_ERROR', 'INTAKE_ERROR',
    ];

    const data = staging.getDataRange().getValues();
    const now  = new Date();
    let   done = 0;

    for (let i = data.length - 1; i >= 1; i--) {
      // BUG-02 BONUS FIX: was data[i][3] = File_ID → never matched anything
      // Now correctly reads the Status column
      const rowStatus = String(data[i][SC.STATUS]);
      if (terminal.some(s => rowStatus.startsWith(s))) {
        archive.appendRow([now, ...data[i]]);
        staging.deleteRow(i + 1);
        done++;
      }
    }

    SpreadsheetApp.flush();
    ui.alert('✅ Archive Complete',
      `Archived ${done} row(s) → STAGING_ARCHIVE.`, ui.ButtonSet.OK);
  } catch (e) { _reportError('archiveStagingPipeline', e, ui); }
}


/**
 * Updated _getOrCreateSheet with corrected STAGING_SHEET header.
 * Also pre-creates the ERROR_LOG sheet for the v8.0 error digest.
 * Replace the original _getOrCreateSheet in KOS_MASTER_v3_1.gs.
 */
function _getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  const H = {
    // BUG-02 FIX: 7-col schema
    [CFG.STAGING_SHEET]:          ['Timestamp','Payload_UID','Payload_Type','Doc_URL','File_ID','Status','Retry_Count'],
    'EXECUTION_LEDGER':           ['UID','TIMESTAMP','SEMANTIC_TAG','FILE_URL','STATUS','ATTEMPT_TRACKER'],
    [CFG.INFERENCE_BUFFER_SHEET]: ['Timestamp','Session_ID','Chunk_ID','Inference_Payload','Status'],
    [CFG.MATRIX_LEDGER_SHEET]:    ['Session_UID','Timestamp','ARCHITECTURE','UI','SECURITY','PEDAGOGY','TOTAL'],
    [CFG.DYNAMIC_STATE_MATRIX]:   ['Session_UID','Timestamp','Theme','Raw_Score','Decayed_Score','Session_Count','Promoted'],
    [CFG.BLACKBOARD_SHEET]:       ['Target_Doc_ID','CE_Tag','Doc_Title','Version','Find_String','Replace_Payload','Alt_Doc_ID','Notes','Filed_By','Filed_Date','Status','Deploy_Trigger'],
    [CFG.ACTION_REGISTER_SHEET]:  ['Session_UID','Timestamp','Type','Item','Owner','Protected_Time_Risk','Status'],
    [CFG.SESSION_LOG_SHEET]:      ['Session_UID','Timestamp','Session_Type','Cold_Start','RTP_Version','Session_Summary'],
    [CFG.COG_REGISTRY_SHEET]:     ['Session_UID','Timestamp','Cog','Final_Status','Summary'],
    [CFG.VECTOR_MATRIX_SHEET]:    ['Session_UID','Timestamp',...CFG.KNOWN_VECTORS,'INCUBATOR_SIGNALS'],
    [CFG.INCUBATOR_SHEET]:        ['Theme','First_Seen','Last_Seen','Session_Count','Avg_Weight','Status'],
    [CFG.ONBOARDING_SHEET]:       ['Day','Date','Event','Note','Vision_90_Day'],
    'ERROR_LOG':                  ['Timestamp','Context','Message','Stack'],  // v8.0 error digest
  };
  const headers = H[name] || ['Timestamp','Data'];
  sheet.appendRow(headers);
  sheet.getRange('1:1').setFontWeight('bold').setBackground('#e2e8f0');
  sheet.setFrozenRows(1);
  return sheet;
}


// ================================================================
// END KOS_PHASE0_PATCHES.gs
// Apply to  : KOS_MASTER_v3_1.gs (v5.4)
// Prepares  : v8.0 Headless Studio Edition
// Next phase: 1_Config_And_Deploy.gs (schema constants in CFG,
//             folder tree expansion, setupAllTriggers)
// ================================================================
