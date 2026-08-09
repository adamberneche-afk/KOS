// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 11 of 11: Registrar / Cog Relay (Automated Registrar Ledger)
// ================================================================
//
// NEW SYSTEM (built from 4 uploaded design docs — Master Operations
// Guide, the blank ledger template, APP_FLOW_CALIBRATION_SILOS.pdf,
// APP_FLOW_INTERVENTION_CONTRACT.pdf, Cog_data_flow.txt). A curriculum-
// drafts auditing pipeline, independent of the SESSION_LOG/VECTOR_CLASSIFY
// pipeline in 2/3/4_*.gs — different intake, different ledger, different
// purpose (auditing curriculum documents for pedagogical dissonance, not
// distilling session logs).
//
// WHAT THIS PLUGS INTO THAT ALREADY EXISTED
// The 7 "Calibration Silo" folders this pipeline deposits into
// (04.1_ARCHITECT_SILO … 04.7_RTP_SILO) are NOT new — they were already
// live in 1_Config_And_Deploy.gs's _buildFolderTree() and already wired
// into 6_Governance.gs's CE-tag router (CE-ARCH, CE-AUD, CE-MUSE, CE-DEV,
// CE-ALIGN, CE-CUR, CE-RTP). What's new here is the pipeline that
// actually produces per-persona JSON exhaust and deposits it there
// automatically, per APP_FLOW_CALIBRATION_SILOS.pdf's Phase 4 — the live
// system previously only routed already-CE-tagged files, nothing wrote
// fresh exhaust into these folders on its own.
//
// TWO SYNTHESIS DECISIONS MADE WHILE BUILDING THIS (flagged, not hidden)
//  1. STAGE NAMING — the two uploaded design docs disagree on which cog
//     does which pipeline stage: Master_Operations_Guide.pdf calls Stage
//     1 "The Formatter Cog" and Stage 2 "The Auditor Cog" (dissonance
//     math). Cog_data_flow.txt's "Dual-Microloop Architecture" calls
//     Stage 1 "The Auditor Turn" (structural JSON extraction, Quant
//     Gate) and Stage 2 "The Curator Turn" (semantic truth-testing
//     against source, Qual Gate). This file adopts Cog_data_flow.txt's
//     naming — it matches this repo's own persona definitions elsewhere
//     (AUDITOR = quantitative integrity / type-strictness; CURATOR =
//     semantic truth / qualitative nuance) — so Stage 1 = AUDITOR,
//     Stage 2 = CURATOR throughout this file and both Studio prompt
//     files. If that's wrong, it's a one-word swap in the two prompt
//     files and the comments below, not a structural change.
//  2. MASTER VECTOR PRIMER — the Ops Guide says Stage 2 measures
//     deviation from a "Master Vector Primer" without saying what that
//     is. This repo already has a canonical comparison corpus for
//     exactly this purpose (05_Vector_Repository's VECTOR_* docs) — the
//     Stage 2 (Curator) prompt is written to read from there. If a
//     dedicated, separate Master Vector Primer doc is wanted instead,
//     that's a prompt-text change, not a pipeline change.
//  Also unresolved by the source docs and left as a documented default:
//  "target UID folders" for a successfully-routed file are never
//  specified beyond "[HLD] for review" as the failure path. Every
//  successfully-routed file lands in CFG.REGISTRAR_ROUTED_FOLDER
//  (06_CLASSROOM_ASSETS itself, not a subfolder) until finer per-type
//  routing is specified.
//
// STATE MACHINE
// ─────────────────────────────────────────────────────────────
//   QUEUED_FOR_COG_1      → [runRegistrarMicrobatch releases, up to
//                            CFG.REGISTRAR_MICROBATCH_SIZE]
//   COG_1_ACTIVE          → [Stage 1 Studio flow (Auditor) extracts the
//                            Master Schema, writes Cog_1_JSON_Output,
//                            sets PENDING_VALIDATION_1]
//   COG_1_ACTIVE          → [stuck > CFG.REGISTRAR_STALE_MINS] → reset to
//                            QUEUED_FOR_COG_1, Attempt_Tracker++
//   PENDING_VALIDATION_1  → [runRegistrarProcessor: JSON.parse + Key
//                            Presence "Quant Gate"] → READY_FOR_COG_2
//                            or bounced back to QUEUED_FOR_COG_1
//   READY_FOR_COG_2       → [runRegistrarMicrobatch releases] → COG_2_ACTIVE
//   COG_2_ACTIVE          → [Stage 2 Studio flow (Curator) verifies Stage
//                            1's output against source text, computes
//                            Dissonance_Delta_Score, writes
//                            Cog_2_JSON_Output, sets PENDING_VALIDATION_2.
//                            If Curator judges Schema 1 invalid, it sets
//                            schema_1_valid:false — a semantic judgment
//                            GAS cannot make itself.]
//   COG_2_ACTIVE          → [stale] → reset to READY_FOR_COG_2, Attempt_Tracker++
//   PENDING_VALIDATION_2  → [runRegistrarProcessor validates] →
//                            READY_FOR_TRANSLATION, or bounced back to
//                            QUEUED_FOR_COG_1 (schema_1_valid:false) or
//                            READY_FOR_COG_2 (Cog 2's own output malformed)
//   READY_FOR_TRANSLATION → [runRegistrarProcessor: Apollo Kill-Switch
//                            check, then Markdown briefing + Calibration
//                            Silo deposit + file routing] → COMPLETELY_ROUTED
//   READY_FOR_TRANSLATION → [intervention_triage.human_intervention_required]
//                            → AWAITING_CARBON (locked until
//                            clearInterventionTriage() is called)
//   any *_ACTIVE / *_VALIDATION → [Attempt_Tracker > CFG.REGISTRAR_RETRY_LIMIT]
//                            → CRITICAL_FAILURE (Fail Loud Protocol —
//                            _sendChatAlert fires immediately)
//
// WHAT THIS DOESN'T INCLUDE YET
//   The two Studio flows themselves (Stage 1 Auditor, Stage 2 Curator)
//   aren't built — REGISTRAR_STAGE1_AUDITOR_PROMPT.md and
//   REGISTRAR_STAGE2_CURATOR_PROMPT.md are what to build them against,
//   same convention as VECTOR_CLASSIFY_PROMPT.md. Not wired into the web
//   app UI (7_WebApp.gs) yet — getRegistrarStatus() below is the read
//   surface a future Diagnostics tab would call.
// ================================================================


// ================================================================
// PHASE 0 — REGISTRAR INTAKE
// ================================================================

/**
 * Nightly front-desk scan. Finds files in CFG.REGISTRAR_UNC_FOLDER not
 * already present in REGISTRAR_LEDGER (deduped by Drive file ID) and
 * appends them as QUEUED_FOR_COG_1.
 *
 * Fires: daily at 01:00 via time-driven trigger (setupAllTriggers).
 * Safe to run manually — idempotent, dedupes against existing File_ID.
 */
function runRegistrarIntake() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('[Registrar] Could not acquire lock — another run is active. Skipping.');
    return;
  }
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const ledger = _getOrCreateSheet(ss, CFG.REGISTRAR_LEDGER_SHEET);
    const unc    = _getSystemAsset(CFG.REGISTRAR_UNC_FOLDER, 'ID_09_UNC', true);
    const RC     = CFG.REGISTRAR_COLS;

    const lastRow = ledger.getLastRow();
    const existingIds = new Set(
      lastRow > 1
        ? ledger.getRange(2, RC.FILE_ID + 1, lastRow - 1, 1).getValues().map(r => String(r[0]))
        : []
    );

    const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    let queued = 0;

    const files = unc.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      const id = f.getId();
      if (existingIds.has(id)) continue;

      ledger.appendRow([
        id,                    // File_ID
        f.getName(),           // File_Name
        'QUEUED_FOR_COG_1',    // Current_State
        '',                    // Cog_1_JSON_Output
        '',                    // Cog_2_JSON_Output
        '',                    // Final_Human_Translation
        0,                     // Attempt_Tracker
        '',                    // Error_Log
        ts,                    // Timestamp_Intake
        '',                    // Timestamp_Finalized
      ]);
      queued++;
    }

    if (queued > 0) SpreadsheetApp.flush();
    console.log('[Registrar] Intake complete — ' + queued + ' new file(s) queued.');
  } catch (e) {
    _reportError('runRegistrarIntake', e, null);
  } finally {
    lock.releaseLock();
  }
}


// ================================================================
// PHASE 2 (TURNSTILE-STYLE GATE) — MICRO-BATCHING
// ================================================================

/**
 * Turnstile-style concurrency gate for the Registrar pipeline, mirroring
 * 10_Turnstile.gs's pattern exactly. Two jobs per run:
 *   1. Reset stale COG_1_ACTIVE / COG_2_ACTIVE rows back one step,
 *      incrementing Attempt_Tracker (and escalating to CRITICAL_FAILURE
 *      if the retry limit is exceeded).
 *   2. Release up to CFG.REGISTRAR_MICROBATCH_SIZE rows total this run —
 *      COG_2_ACTIVE slots first (finish in-flight work before starting
 *      new), then COG_1_ACTIVE slots — matching the "2 to 3 UIDs every
 *      15 minutes" pacing in APP_FLOW_CALIBRATION_SILOS.pdf.
 *
 * Fires: every 15 min via time-driven trigger (setupAllTriggers).
 */
function runRegistrarMicrobatch() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('[Registrar] Microbatch: could not acquire lock. Skipping.');
    return;
  }
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const ledger = _getOrCreateSheet(ss, CFG.REGISTRAR_LEDGER_SHEET);
    const lastRow = ledger.getLastRow();
    if (lastRow <= 1) return;

    const RC   = CFG.REGISTRAR_COLS;
    const data = ledger.getRange(2, 1, lastRow - 1, 10).getValues();
    const released = _readRegistrarReleaseMap();
    const nowMs    = new Date().getTime();
    const staleMs  = CFG.REGISTRAR_STALE_MINS * 60 * 1000;

    let staleReset = 0, activeCount = 0;

    // ── Pass 1: reset stale *_ACTIVE rows ──
    for (let i = 0; i < data.length; i++) {
      const sheetRow = i + 2;
      const state    = String(data[i][RC.STATE]);
      if (state !== 'COG_1_ACTIVE' && state !== 'COG_2_ACTIVE') continue;

      const fileId     = String(data[i][RC.FILE_ID]);
      const releasedAt = released[fileId];
      const isStale    = releasedAt ? (nowMs - releasedAt) > staleMs : true;

      if (!isStale) { activeCount++; continue; }

      const fallbackState = state === 'COG_1_ACTIVE' ? 'QUEUED_FOR_COG_1' : 'READY_FOR_COG_2';
      _bounceRegistrarRow(
        ledger, sheetRow, data[i],
        fallbackState,
        'Stale in ' + state + ' for over ' + CFG.REGISTRAR_STALE_MINS + ' minutes.'
      );
      delete released[fileId];
      // Whether bounced back or escalated to CRITICAL_FAILURE, this row no
      // longer occupies an active slot — do NOT increment activeCount here
      // (mirrors 10_Turnstile.gs's runMatrixTurnstile: only the non-stale
      // branch above counts toward activeCount). A vacated slot is
      // available for Pass 2 to fill in this same run.
      staleReset++;
    }

    // ── Pass 2: release up to REGISTRAR_MICROBATCH_SIZE, Cog 2 slots first ──
    let freed = Math.max(0, CFG.REGISTRAR_MICROBATCH_SIZE - activeCount);
    let releasedCount = 0;

    const releaseByState = (fromState, toState) => {
      for (let i = 0; i < data.length && releasedCount < freed; i++) {
        const sheetRow = i + 2;
        if (String(data[i][RC.STATE]) !== fromState) continue;
        const fileId = String(data[i][RC.FILE_ID]);
        ledger.getRange(sheetRow, RC.STATE + 1).setValue(toState);
        released[fileId] = nowMs;
        releasedCount++;
      }
    };
    releaseByState('READY_FOR_COG_2', 'COG_2_ACTIVE');
    releaseByState('QUEUED_FOR_COG_1', 'COG_1_ACTIVE');

    // Prune release-map entries for rows no longer in the ledger at all.
    const idsInSheet = new Set(data.map(r => String(r[RC.FILE_ID])));
    Object.keys(released).forEach(id => { if (!idsInSheet.has(id)) delete released[id]; });
    _writeRegistrarReleaseMap(released);

    if (staleReset + releasedCount > 0) SpreadsheetApp.flush();
    console.log(
      '[Registrar] Microbatch — active=' + activeCount +
      ' released=' + releasedCount +
      ' staleReset=' + staleReset
    );
  } catch (e) {
    _reportError('runRegistrarMicrobatch', e, null);
  } finally {
    lock.releaseLock();
  }
}

/** Reads the Registrar release-timestamp map. Returns {} if unset/corrupt. */
function _readRegistrarReleaseMap() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('KOS_REGISTRAR_RELEASED');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('[Registrar] Release map corrupt — resetting. ' + e.message);
    return {};
  }
}

/** Persists the Registrar release-timestamp map. */
function _writeRegistrarReleaseMap(map) {
  PropertiesService.getScriptProperties()
    .setProperty('KOS_REGISTRAR_RELEASED', JSON.stringify(map));
}


// ================================================================
// SHARED BOUNCE-BACK / FAIL LOUD LOGIC
// ================================================================

/**
 * The "Bounce-Back Mechanism": reverts a row to an earlier state and
 * increments Attempt_Tracker. If that push exceeds CFG.REGISTRAR_RETRY_LIMIT,
 * escalates to CRITICAL_FAILURE instead (Fail Loud Protocol) and fires an
 * immediate chat alert — the row is NOT sent back to fallbackState in
 * that case.
 *
 * @param  {Sheet}  ledger       REGISTRAR_LEDGER sheet.
 * @param  {number} sheetRow     1-indexed sheet row.
 * @param  {Array}  row          That row's current values (0-indexed, CFG.REGISTRAR_COLS).
 * @param  {string} fallbackState  State to bounce back to, if under the retry limit.
 * @param  {string} reason       Human-readable reason, appended to Error_Log.
 * @returns {boolean} true if bounced back normally, false if escalated to CRITICAL_FAILURE.
 */
function _bounceRegistrarRow(ledger, sheetRow, row, fallbackState, reason) {
  const RC = CFG.REGISTRAR_COLS;
  const attempts = (parseInt(row[RC.ATTEMPT], 10) || 0) + 1;
  const fileId    = row[RC.FILE_ID];
  const fileName  = row[RC.FILE_NAME];
  const prevError = String(row[RC.ERROR_LOG] || '');
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const errorEntry = '[' + ts + '] ' + reason;

  if (attempts > CFG.REGISTRAR_RETRY_LIMIT) {
    ledger.getRange(sheetRow, RC.STATE + 1).setValue('CRITICAL_FAILURE');
    ledger.getRange(sheetRow, RC.ATTEMPT + 1).setValue(attempts);
    ledger.getRange(sheetRow, RC.ERROR_LOG + 1).setValue(
      (prevError ? prevError + '\n' : '') + errorEntry + ' — retry limit exceeded, CRITICAL_FAILURE.'
    );
    _sendChatAlert(
      '🔴 CRITICAL_FAILURE — Registrar/Cog Relay\n' +
      'File: ' + fileName + ' (' + fileId + ')\n' +
      'Reason: ' + reason + '\n' +
      'Exceeded retry limit (' + CFG.REGISTRAR_RETRY_LIMIT + '). Human review required.'
    );
    console.error('[Registrar] ' + fileName + ' → CRITICAL_FAILURE after ' + attempts + ' attempts: ' + reason);
    return false;
  }

  ledger.getRange(sheetRow, RC.STATE + 1).setValue(fallbackState);
  ledger.getRange(sheetRow, RC.ATTEMPT + 1).setValue(attempts);
  ledger.getRange(sheetRow, RC.ERROR_LOG + 1).setValue(
    (prevError ? prevError + '\n' : '') + errorEntry + ' — bounced to ' + fallbackState + '.'
  );
  console.log('[Registrar] ' + fileName + ' bounced to ' + fallbackState + ' (attempt ' + attempts + '): ' + reason);
  return true;
}


// ================================================================
// PHASE 1/2 VALIDATION + PHASE 3 TRANSLATION & ROUTING
// ================================================================

/**
 * Master Schema required top-level keys, per APP_FLOW_INTERVENTION_CONTRACT.pdf
 * Phase 1. This is the GAS-side "Quant Gate" — JSON.parse + Key Presence
 * only. Whether the VALUES are semantically correct is Stage 2's
 * (Curator's) job, not this function's.
 */
const REGISTRAR_SCHEMA_1_KEYS = [
  'doc_uid', 'intervention_triage',
  'architect_data', 'muse_data', 'developer_data', 'aligner_data', 'rtp_data',
];

/**
 * Single sweep that dispatches every REGISTRAR_LEDGER row needing a GAS
 * action by its Current_State: validates Stage 1 output, validates Stage
 * 2 output, or translates + routes a fully-verified row. Mirrors
 * processInferenceQueue()'s single-sweep-per-run style.
 *
 * Fires: every 10 min via time-driven trigger (setupAllTriggers).
 */
function runRegistrarProcessor() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    console.log('[Registrar] Processor: could not acquire lock. Skipping.');
    return;
  }
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const ledger = _getOrCreateSheet(ss, CFG.REGISTRAR_LEDGER_SHEET);
    const lastRow = ledger.getLastRow();
    if (lastRow <= 1) return;

    const RC   = CFG.REGISTRAR_COLS;
    const data = ledger.getRange(2, 1, lastRow - 1, 10).getValues();
    let touched = 0;

    for (let i = 0; i < data.length; i++) {
      const sheetRow = i + 2;
      const state    = String(data[i][RC.STATE]);
      try {
        if (state === 'PENDING_VALIDATION_1') {
          _validateRegistrarStage1(ledger, sheetRow, data[i]);
          touched++;
        } else if (state === 'PENDING_VALIDATION_2') {
          _validateRegistrarStage2(ledger, sheetRow, data[i]);
          touched++;
        } else if (state === 'READY_FOR_TRANSLATION') {
          _translateAndRouteRegistrarRow(ledger, sheetRow, data[i]);
          touched++;
        }
      } catch (rowErr) {
        _reportError('runRegistrarProcessor:row' + sheetRow, rowErr, null);
      }
    }

    if (touched > 0) SpreadsheetApp.flush();
    console.log('[Registrar] Processor touched ' + touched + ' row(s).');
  } catch (e) {
    _reportError('runRegistrarProcessor', e, null);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Validates the Stage 1 (Auditor) JSON — parseable, and every
 * REGISTRAR_SCHEMA_1_KEYS key present. Structural only, per the Ops
 * Guide's framing ("Apps Script enforces JSON.parse and Key Presence").
 * Advances to READY_FOR_COG_2 on success, bounces to QUEUED_FOR_COG_1 on
 * failure.
 */
function _validateRegistrarStage1(ledger, sheetRow, row) {
  const RC = CFG.REGISTRAR_COLS;
  let parsed;
  try {
    parsed = JSON.parse(row[RC.COG1_JSON]);
  } catch (e) {
    _bounceRegistrarRow(ledger, sheetRow, row, 'QUEUED_FOR_COG_1', 'Stage 1 JSON.parse failed: ' + e.message);
    return;
  }

  const missing = REGISTRAR_SCHEMA_1_KEYS.filter(k => !(k in parsed));
  if (missing.length > 0) {
    _bounceRegistrarRow(
      ledger, sheetRow, row, 'QUEUED_FOR_COG_1',
      'Stage 1 output missing required key(s): ' + missing.join(', ')
    );
    return;
  }

  ledger.getRange(sheetRow, RC.STATE + 1).setValue('READY_FOR_COG_2');
  console.log('[Registrar] ' + row[RC.FILE_NAME] + ' passed Stage 1 validation → READY_FOR_COG_2.');
}

/**
 * Validates the Stage 2 (Curator) JSON. Expects
 * { schema_1_valid: boolean, dissonance_delta_score: number, action_command: string }
 * — Cog 2's own output schema isn't specified by the source docs beyond
 * "Delta Score and Action_Command are written to Schema 2" (Master Ops
 * Guide, Phase 2), so this shape is this file's synthesis; update
 * REGISTRAR_STAGE2_CURATOR_PROMPT.md and here together if it changes.
 *
 * If Curator judged Stage 1's output invalid (schema_1_valid: false —
 * a semantic call GAS cannot make itself), this bounces the row all the
 * way back to QUEUED_FOR_COG_1, matching the Ops Guide's "Validation
 * Gate: Cog 2 first validates the integrity of Schema 1. If invalid, it
 * bounces the file back to Phase 1."
 */
function _validateRegistrarStage2(ledger, sheetRow, row) {
  const RC = CFG.REGISTRAR_COLS;
  let parsed;
  try {
    parsed = JSON.parse(row[RC.COG2_JSON]);
  } catch (e) {
    _bounceRegistrarRow(ledger, sheetRow, row, 'READY_FOR_COG_2', 'Stage 2 JSON.parse failed: ' + e.message);
    return;
  }

  if (parsed.schema_1_valid === false) {
    _bounceRegistrarRow(
      ledger, sheetRow, row, 'QUEUED_FOR_COG_1',
      'Stage 2 (Curator) judged Stage 1 output invalid against source text.'
    );
    return;
  }

  const requiredKeys = ['dissonance_delta_score', 'action_command'];
  const missing = requiredKeys.filter(k => !(k in parsed));
  if (missing.length > 0) {
    _bounceRegistrarRow(
      ledger, sheetRow, row, 'READY_FOR_COG_2',
      'Stage 2 output missing required key(s): ' + missing.join(', ')
    );
    return;
  }

  ledger.getRange(sheetRow, RC.STATE + 1).setValue('READY_FOR_TRANSLATION');
  console.log('[Registrar] ' + row[RC.FILE_NAME] + ' passed Stage 2 validation → READY_FOR_TRANSLATION.');
}

/**
 * Phase 3: Translation & Routing. For a fully-verified row —
 *   1. Apollo Kill-Switch check (APP_FLOW_INTERVENTION_CONTRACT.pdf
 *      Phase 3): if intervention_triage.human_intervention_required,
 *      halt here — set AWAITING_CARBON, fire an immediate high-priority
 *      chat alert, move the file to [HLD], and stop. Does NOT write
 *      Final_Human_Translation or touch the Calibration Silos yet —
 *      clearInterventionTriage() re-enters this same function once a
 *      teacher clears the triage.
 *   2. Otherwise: build a Markdown briefing, deposit each of the five
 *      Phase-2 hand-off blocks into its Calibration Silo doc, move the
 *      file to CFG.REGISTRAR_ROUTED_FOLDER, and mark COMPLETELY_ROUTED.
 */
function _translateAndRouteRegistrarRow(ledger, sheetRow, row) {
  const RC = CFG.REGISTRAR_COLS;
  let schema1, schema2;
  try {
    schema1 = JSON.parse(row[RC.COG1_JSON]);
    schema2 = JSON.parse(row[RC.COG2_JSON]);
  } catch (e) {
    _reportError('_translateAndRouteRegistrarRow:parse', e, null);
    ledger.getRange(sheetRow, RC.ERROR_LOG + 1).setValue(
      String(row[RC.ERROR_LOG] || '') + '\nTranslation-phase parse failure: ' + e.message
    );
    return;
  }

  const triage = schema1.intervention_triage || {};
  const fileId = row[RC.FILE_ID];

  if (triage.human_intervention_required === true) {
    ledger.getRange(sheetRow, RC.STATE + 1).setValue('AWAITING_CARBON');
    _sendChatAlert(
      '🟡 APOLLO KILL-SWITCH — human intervention required\n' +
      'File: ' + row[RC.FILE_NAME] + ' (' + fileId + ')\n' +
      'Target: ' + (triage.target_entity || 'unspecified') + '\n' +
      'Friction source: ' + (triage.friction_source || 'unspecified') + '\n' +
      'Pedagogical gap: ' + (triage.pedagogical_gap_identified || 'unspecified') + '\n' +
      'Awaiting Carbon — call clearInterventionTriage("' + fileId + '") once resolved.'
    );
    try {
      const hld = _getSystemAsset(CFG.REGISTRAR_HLD_FOLDER, 'ID_09_1_HLD', true);
      DriveApp.getFileById(fileId).moveTo(hld);
    } catch (moveErr) {
      _reportError('_translateAndRouteRegistrarRow:moveToHLD', moveErr, null);
    }
    console.log('[Registrar] ' + row[RC.FILE_NAME] + ' → AWAITING_CARBON (Apollo Kill-Switch).');
    return;
  }

  // ── Build the Markdown briefing ──
  const briefing = [
    '# Registrar Briefing — ' + row[RC.FILE_NAME],
    '',
    '**Doc UID:** ' + (schema1.doc_uid || fileId),
    '**Dissonance Delta Score:** ' + schema2.dissonance_delta_score,
    '**Action Command:** ' + schema2.action_command,
    '',
    '## Pedagogical Gap',
    schema1.intervention_triage && schema1.intervention_triage.pedagogical_gap_identified || '_none flagged_',
  ].join('\n');
  ledger.getRange(sheetRow, RC.TRANSLATION + 1).setValue(briefing);

  // ── Deposit into the 5 Calibration Silos (Phase 2 hand-off) ──
  // ARCHITECT/MUSE/DEVELOPER/ALIGNER/RTP consume their named block.
  // AUDITOR and CURATOR are the pipeline's own producing stages here,
  // not additional hand-off targets — Phase 2 of
  // APP_FLOW_INTERVENTION_CONTRACT.pdf lists exactly these 5.
  const silos = [
    ['ID_04_1_ARCHITECT', schema1.architect_data],
    ['ID_04_3_MUSE',       schema1.muse_data],
    ['ID_04_4_DEVELOPER',  schema1.developer_data],
    ['ID_04_5_ALIGNER',    schema1.aligner_data],
    ['ID_04_7_RTP',        schema1.rtp_data],
  ];
  const props = PropertiesService.getScriptProperties();
  silos.forEach(([propKey, block]) => {
    if (block === undefined) return;
    try {
      const folderId = props.getProperty(propKey);
      if (!folderId) return;  // deployFullSystem hasn't registered this silo yet
      const folder = DriveApp.getFolderById(folderId);
      const doc = _getOrCreateDoc('UID_' + (schema1.doc_uid || fileId), folder);
      doc.getBody().appendParagraph(JSON.stringify(block));
      doc.saveAndClose();
    } catch (siloErr) {
      _reportError('_translateAndRouteRegistrarRow:silo:' + propKey, siloErr, null);
    }
  });

  // ── Route the file ──
  try {
    const routed = _getSystemAsset(CFG.REGISTRAR_ROUTED_FOLDER, 'ID_06_CLASSROOM_ASSETS', true);
    DriveApp.getFileById(fileId).moveTo(routed);
  } catch (moveErr) {
    _reportError('_translateAndRouteRegistrarRow:route', moveErr, null);
  }

  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  ledger.getRange(sheetRow, RC.STATE + 1).setValue('COMPLETELY_ROUTED');
  ledger.getRange(sheetRow, RC.TS_FINAL + 1).setValue(ts);
  console.log('[Registrar] ' + row[RC.FILE_NAME] + ' → COMPLETELY_ROUTED.');
}


// ================================================================
// MANUAL / HITL ENTRY POINTS
// ================================================================

/**
 * Clears an Apollo Kill-Switch hold. Per APP_FLOW_INTERVENTION_CONTRACT.pdf
 * Phase 3 ("Awaiting Carbon: System remains locked on this item until
 * Teacher clears the triage state") — this is that clearing action. Call
 * from the Apps Script editor (or wire into a future web app button)
 * once a human has actually resolved the flagged friction. Re-enters the
 * translate/route step, which will now proceed since the check only
 * fires once, at the state transition into AWAITING_CARBON.
 *
 * @param  {string} fileId  REGISTRAR_LEDGER File_ID (Drive file ID).
 * @returns {string} Result message.
 */
function clearInterventionTriage(fileId) {
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const ledger = _getOrCreateSheet(ss, CFG.REGISTRAR_LEDGER_SHEET);
    const RC     = CFG.REGISTRAR_COLS;
    const lastRow = ledger.getLastRow();
    if (lastRow <= 1) return 'REGISTRAR_LEDGER is empty.';

    const data = ledger.getRange(2, 1, lastRow - 1, 10).getValues();
    const idx = data.findIndex(r => String(r[RC.FILE_ID]) === String(fileId));
    if (idx === -1) return 'File_ID not found: ' + fileId;
    if (String(data[idx][RC.STATE]) !== 'AWAITING_CARBON') {
      return 'File is not in AWAITING_CARBON (currently ' + data[idx][RC.STATE] + ') — nothing to clear.';
    }

    const sheetRow = idx + 2;
    ledger.getRange(sheetRow, RC.STATE + 1).setValue('READY_FOR_TRANSLATION');
    SpreadsheetApp.flush();
    console.log('[Registrar] Triage cleared for ' + data[idx][RC.FILE_NAME] + ' — re-queued for translation & routing.');
    return 'Cleared. Row will finish routing on the next runRegistrarProcessor() pass.';
  } catch (e) {
    _reportError('clearInterventionTriage', e, null);
    return 'Error: ' + e.message;
  }
}

/**
 * Read-only status summary — counts per Current_State. Safe to run from
 * the Apps Script editor at any time; also the shape a future web app
 * Diagnostics tab would call.
 *
 * @returns {Object} { success, counts: { [state]: number }, total }
 */
function getRegistrarStatus() {
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const ledger = _getOrCreateSheet(ss, CFG.REGISTRAR_LEDGER_SHEET);
    const RC     = CFG.REGISTRAR_COLS;
    const lastRow = ledger.getLastRow();
    if (lastRow <= 1) return { success: true, counts: {}, total: 0 };

    const states = ledger.getRange(2, RC.STATE + 1, lastRow - 1, 1).getValues();
    const counts = {};
    states.forEach(([s]) => { counts[s] = (counts[s] || 0) + 1; });
    return { success: true, counts, total: lastRow - 1 };
  } catch (e) {
    _reportError('getRegistrarStatus', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// END 11_Registrar_CogRelay.gs
// KOS v8.0 — The Headless Studio Edition
// ================================================================
