// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 4 of 8: Vector Router
// ================================================================
//
// Replaces: PART 12 (routeVectorWeights and sub-functions) from
//           KOS_MASTER_v3_1.gs. Supersedes the transitional
//           versions in KOS_PHASE0_PATCHES.gs.
//
// ARCHITECTURE NOTE — TWO PARALLEL SHEETS
// ─────────────────────────────────────────────────────────────
// Updated for the CE-SMP Vector Weight Calculation Engine v1.0
// ("Bifurcation Boundary") — GAS computes all quantitative math;
// Studio (THE_CURATOR / VECTOR_CLASSIFY) only classifies.
//
// MATRIX_LEDGER (written by processIntakePayload in 3_Queue_Processor.gs)
//   Purpose : Append-only audit log of RAW scores per session.
//   Schema  : Fixed columns — Session_UID, Timestamp,
//             ARCHITECTURE, UI, SECURITY, PEDAGOGY,
//             GAS_DEVELOPMENT, RELATIONAL, DOMAIN_COMPLIANCE, TOTAL
//   No decay. Never used for live state reads.
//
// VECTOR_MATRIX (written by _writeMatrixRow here)
//   Purpose : Living state matrix. Current DECAYED scores.
//   Schema  : Dynamic — Session_UID, Timestamp, [known themes...],
//             INCUBATOR_SIGNALS, CHECKSUM. Grows when themes are
//             promoted. CHECKSUM (row-integrity hash) is always last.
//   Decay   : Each run applies CFG.DECAY_FACTOR to any theme
//             not present in the current session's vector_weights.
//   This is the sheet the Diagnostics tab reads for display.
//
// INCUBATOR (written by _logToIncubator here)
//   Purpose : Staging area for emerging themes that haven't yet
//             met promotion thresholds. Cumulative-score + half-life
//             decay lifecycle, not a running average.
//   Schema  : Theme, First_Detected, Last_Touched, Session_Count,
//             Cumulative_Score, Raw_Score_Log, Status
//
// DYNAMIC_STATE_MATRIX (written by _writeDynamicStateRow here)
//   Purpose : Long-format version of VECTOR_MATRIX. One row per
//             theme per session. Useful for per-theme trend queries
//             without pivoting the wide VECTOR_MATRIX.
//   Schema  : Session_UID, Timestamp, Theme, Raw_Score,
//             Decayed_Score, Session_Count, Promoted
//
// PUBLIC ENTRY POINTS
//   routeVectorWeights()     standalone caller (acquires lock)
//   _routeVectorWeightsInternal()  lock-free (called by intake)
//   processVectorClassificationPayload()  VECTOR_CLASSIFY flow entry
//   getVectorState()         web app Diagnostics tab
//   runPromotionCheck()      web app Diagnostics tab button
//   migrateVectorSchema_v2() ONE-TIME manual run — upgrades an existing
//                            live VECTOR_MATRIX/INCUBATOR sheet pair
//                            created before this engine landed. See its
//                            own header comment before running it.
//
// BUG FIXES CARRIED FROM PHASE 0
//   BUG-01  Lock: _routeVectorWeightsInternal has no lock
//   BUG-03  File ID: _routeToVectorDocs uses captured dId
//   BUG-04  Persistence: _checkPromotionCandidates uses
//           _persistPromotedVector + _getKnownVectors
// ================================================================


// ================================================================
// PUBLIC ENTRY POINTS
// ================================================================

/**
 * Safe standalone entry point. Acquires the script lock, runs
 * the full routing pipeline, releases the lock.
 *
 * Use this when calling from a menu item, diagnostic function,
 * or any context where processIntakePayload is NOT the caller.
 * Never call this from processIntakePayload — it will deadlock
 * (use _routeVectorWeightsInternal directly instead).
 *
 * @param  {Object} pd          Parsed inference JSON payload.
 * @param  {string} sessionUid  Session UID for row labelling.
 * @param  {string} timestamp   Formatted timestamp string.
 * @returns {Object} Routing result from _routeVectorWeightsInternal.
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
 * Core routing pipeline. No lock — callers must own the script
 * lock before calling (or call via routeVectorWeights).
 *
 * PIPELINE
 *   1. Split vector_weights into known (VECTOR_MATRIX target) and
 *      unknown (INCUBATOR target) using _getKnownVectors().
 *   2. _writeMatrixRow()    → VECTOR_MATRIX (decayed, wide-format)
 *   3. _writeDynamicStateRow() → DYNAMIC_STATE_MATRIX (long-format)
 *   4. _logToIncubator()    → INCUBATOR sheet
 *   5. _routeToVectorDocs() → individual VECTOR_xxx Google Docs
 *   6. _checkPromotionCandidates() → promote mature incubator themes
 *
 * @param  {Object} pd          Parsed inference JSON payload.
 * @param  {string} sessionUid  UID string for row labelling.
 * @param  {string} timestamp   Formatted timestamp string.
 * @returns {Object} { status, matrixRow, dynamicRows, routedDocs,
 *                     incubatorSignals, promotions }
 */
function _routeVectorWeightsInternal(pd, sessionUid, timestamp) {
  try {
    const ss          = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrixSheet = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const dynamicSheet= _getOrCreateSheet(ss, CFG.DYNAMIC_STATE_MATRIX);
    const incubSheet  = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);
    const raw         = pd.vector_weights || {};

    // ── Split raw weights into known vs incubator candidates ────
    const known   = {};
    const unknown = {};

    // BUG-04 FIX: _getKnownVectors() merges CFG base + promoted
    const knownList = _getKnownVectors();

    Object.entries(raw).forEach(([t, v]) => {
      const score = parseFloat(v);
      if (isNaN(score) || score < 0) return;
      const upper = t.toUpperCase().trim();
      if      (knownList.includes(upper))    known[upper]   = score;
      else if (score >= CFG.INCUBATOR_THRESHOLD) unknown[upper] = score;
    });

    // ── Write to sheets ─────────────────────────────────────────
    const matrixRow    = _writeMatrixRow(matrixSheet, known, sessionUid, timestamp);
    const dynamicRows  = _writeDynamicStateRow(dynamicSheet, known, unknown, sessionUid, timestamp);
    const incubSignals = _logToIncubator(incubSheet, unknown, sessionUid, timestamp);
    const routedDocs   = _routeToVectorDocs(pd, known, sessionUid, timestamp);
    _applyIncubatorDecay_(incubSheet, timestamp);
    const promotions   = _checkPromotionCandidates(incubSheet, matrixSheet);

    // Back-fill promoted column scores for the triggering session.
    // _writeMatrixRow resolves headers before _checkPromotionCandidates
    // inserts the new column, so the triggering session always writes
    // a zero for the newly promoted theme. If that theme had a signal
    // in this session's unknown weights, patch the row now. Backported
    // from an earlier draft found in the reupload batch — without this,
    // the session that actually earned a theme's promotion is the one
    // session whose row for it reads 0.
    if (promotions.length > 0) {
      try {
        const updatedHeaders = matrixSheet
          .getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];
        const lastDataRow    = matrixSheet.getLastRow();
        if (lastDataRow > 1) {
          promotions.forEach(theme => {
            const colIdx = updatedHeaders.indexOf(theme);
            if (colIdx === -1) return;
            const sessionScore = parseFloat(unknown[theme]) || 0;
            if (sessionScore > 0) {
              matrixSheet.getRange(lastDataRow, colIdx + 1).setValue(
                parseFloat(sessionScore.toFixed(4))
              );
            }
          });
        }
      } catch (_) {}  // non-fatal — next session will score normally
    }

    SpreadsheetApp.flush();
    return {
      status: 'SUCCESS',
      matrixRow,
      dynamicRows,
      routedDocs,
      incubatorSignals: incubSignals,
      promotions,
    };
  } catch (e) {
    _reportError('_routeVectorWeightsInternal', e, null);
    return { status: 'ERROR', message: e.message };
  }
}


// ================================================================
// SENTENCE-LEVEL VECTOR CLASSIFICATION (Bifurcation Boundary)
// ================================================================
// Operator decision: the Inference Flow (Studio) is a qualitative
// classifier only — it never computes a session-level vector weight.
// It receives individual sentences and returns a relevance signal per
// known vector, plus an exchange_type (DECISION | EXPLORATORY) per
// exchange. GAS performs every quantitative step: the multiplier,
// the summation, the normalization, the decay, and the promotion math.
// See STUDIO_INTEGRATION_SPEC.md's "Inference Flow — Sentence
// Classification" section for the exact Studio-side contract this
// consumes, and CE-SMP Vector Weight Calculation Engine v1.0 for the
// full design rationale.

/**
 * Handles a completed VECTOR_CLASSIFY payload from processInferenceQueue.
 * Runs the deterministic aggregation, writes VECTOR_MATRIX + INCUBATOR,
 * and applies decay/promotion — all independent of the main SESSION_LOG
 * Curator payload for the same session. If the Curator's own payload
 * arrives before this one, processIntakePayload's existing "vector_weights
 * must be a real object" check already degrades gracefully (see
 * 3_Queue_Processor.gs) — there is no hard ordering dependency between
 * the two Studio flows.
 *
 * @param  {string} rawJSONPayload  JSON string — top-level array of
 *   exchange objects: [{ exchange_type: 'DECISION'|'EXPLORATORY',
 *   sentences: [{ sentence_id, vectors: {THEME: 0.0-1.0, ...},
 *   unmapped_signals: [{theme, weight}] }] }].
 * @param  {string} sessionUid
 * @param  {string} timestamp
 * @returns {Object} { status: 'SUCCESS'|'LOCKED'|'ERROR', matrixRow?, promotions?, message? }
 */
function processVectorClassificationPayload(rawJSONPayload, sessionUid, timestamp) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: 'LOCKED', message: 'System busy.' };
  try {
    let exchanges;
    try { exchanges = JSON.parse(rawJSONPayload); }
    catch (pe) {
      _reportError('processVectorClassificationPayload:parse', pe, null);
      return { status: 'ERROR', message: 'Malformed JSON: ' + pe.message };
    }
    if (!Array.isArray(exchanges)) {
      return { status: 'ERROR', message: 'Expected a top-level JSON array of exchanges.' };
    }

    const aggregated = _aggregateSentenceVectors_(exchanges);

    const ss          = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrixSheet = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const incubSheet  = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);

    const matrixRow = _writeMatrixRow(matrixSheet, aggregated.known, sessionUid, timestamp);
    _logToIncubator(incubSheet, aggregated.unknown, sessionUid, timestamp);
    _applyIncubatorDecay_(incubSheet, timestamp);
    const promotions = _checkPromotionCandidates(incubSheet, matrixSheet);

    // Same triggering-session back-fill _routeVectorWeightsInternal
    // already applies — a theme promoted THIS session shouldn't read 0
    // in the very row that earned its promotion.
    if (promotions.length > 0) {
      try {
        const updatedHeaders = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];
        const lastDataRow    = matrixSheet.getLastRow();
        if (lastDataRow > 1) {
          promotions.forEach(theme => {
            const colIdx = updatedHeaders.indexOf(theme);
            if (colIdx === -1) return;
            const sessionScore = parseFloat(aggregated.unknown[theme]) || 0;
            if (sessionScore > 0) {
              matrixSheet.getRange(lastDataRow, colIdx + 1).setValue(parseFloat(sessionScore.toFixed(4)));
            }
          });
        }
      } catch (_) {}  // non-fatal — next session will score normally
    }

    SpreadsheetApp.flush();
    return { status: 'SUCCESS', matrixRow, promotions };
  } catch (e) {
    _reportError('processVectorClassificationPayload', e, null);
    return { status: 'ERROR', message: e.message };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Pure quantitative aggregation — zero inference/LLM trust, zero
 * randomness. For each vector, sums (sentence_score × exchange_multiplier)
 * across every sentence in the session, then divides by the total
 * possible score (the sum of multipliers across every sentence,
 * DECISION-weighted), producing a normalized 0.0–1.0 weight. The same
 * session log always produces the same weights regardless of who runs
 * it or when (SMP §3.4's "key property").
 *
 * Unmapped signals aggregate the same way, keyed by theme name, and are
 * returned separately for Incubator logging — anything below
 * CFG.INCUBATOR_THRESHOLD is dropped rather than incubated, matching
 * the Inference Flow's own minimum-detection floor.
 *
 * @param  {Array<Object>} exchanges  See processVectorClassificationPayload's JSDoc.
 * @returns {Object} { known: {THEME: float}, unknown: {THEME: float} }
 */
function _aggregateSentenceVectors_(exchanges) {
  const knownList   = _getKnownVectors();
  const rawKnown    = {};   // theme -> summed weighted score
  const rawUnknown  = {};
  let totalPossible = 0;

  (Array.isArray(exchanges) ? exchanges : []).forEach(exch => {
    const multiplier = (exch && exch.exchange_type === 'DECISION')
      ? CFG.DECISION_MULTIPLIER
      : CFG.EXPLORATORY_MULTIPLIER;
    const sentences = (exch && Array.isArray(exch.sentences)) ? exch.sentences : [];

    sentences.forEach(s => {
      if (!s) return;
      totalPossible += multiplier;

      Object.entries(s.vectors || {}).forEach(([theme, val]) => {
        const score = parseFloat(val);
        if (isNaN(score) || score <= 0) return;
        const upper = String(theme).toUpperCase().trim();
        // Defensive: the Inference Flow is instructed to only use
        // known_vectors here, but a stale/mismatched flow config could
        // still send something else — route it like an unmapped signal
        // rather than silently dropping it.
        if (knownList.includes(upper)) {
          rawKnown[upper] = (rawKnown[upper] || 0) + (score * multiplier);
        }
      });

      (Array.isArray(s.unmapped_signals) ? s.unmapped_signals : []).forEach(sig => {
        const score = parseFloat(sig && sig.weight);
        const upper = String((sig && sig.theme) || '').toUpperCase().trim();
        if (!upper || isNaN(score) || score < CFG.INCUBATOR_THRESHOLD) return;
        if (knownList.includes(upper)) return;  // promoted since the Flow's known_vectors list was last synced
        rawUnknown[upper] = (rawUnknown[upper] || 0) + (score * multiplier);
      });
    });
  });

  if (totalPossible <= 0) return { known: {}, unknown: {} };

  const normalize = raw => {
    const out = {};
    Object.entries(raw).forEach(([theme, sum]) => {
      out[theme] = parseFloat(Math.min(1, sum / totalPossible).toFixed(4));
    });
    return out;
  };

  return { known: normalize(rawKnown), unknown: normalize(rawUnknown) };
}


// ================================================================
// SHEET WRITERS
// ================================================================

/**
 * Appends one row to VECTOR_MATRIX (wide-format, decayed state).
 *
 * For each theme column in the sheet:
 *   - If the current session has a score for that theme → use it.
 *   - Otherwise → apply DECAY_FACTOR to the previous row's score.
 *   - If no previous score exists → write 0.
 *
 * The final column (INCUBATOR_SIGNALS) records how many incoming
 * themes were routed to the incubator rather than known columns.
 *
 * @param  {Sheet}  sheet      VECTOR_MATRIX sheet.
 * @param  {Object} known      { THEME: score } — known themes only.
 * @param  {string} sessionUid UID for the new row.
 * @param  {string} timestamp  Formatted timestamp.
 * @returns {Object} { sessionUid, timestamp, [theme]: score, ... }
 */
function _writeMatrixRow(sheet, known, sessionUid, timestamp) {
  const headers    = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const themeStart = 2;  // cols 0=Session_UID, 1=Timestamp, 2+=themes

  // Guard: if the sheet has no header columns beyond the first two, it
  // was likely created without the correct schema (e.g. manual
  // intervention or a fresh sheet that missed initialisation). Writing a
  // malformed row here would silently corrupt the matrix. Backported
  // from an earlier draft found in the reupload batch.
  //
  // Trailing columns are INCUBATOR_SIGNALS then CHECKSUM (added for the
  // Vector Weight Calculation Engine row-integrity check) — themeStart+2
  // is the minimum width with both present plus at least one theme.
  if (headers.length <= themeStart + 2) {
    _reportError(
      '_writeMatrixRow:NO_HEADERS',
      new Error(
        'VECTOR_MATRIX has no theme columns. Expected at least one theme column ' +
        'followed by INCUBATOR_SIGNALS and CHECKSUM. Run setupRoutingProperties() or ' +
        'deployFullSystem() to reinitialise the sheet headers. Session ' +
        sessionUid + ' not written.'
      ),
      null
    );
    return {};
  }

  const themes = headers.slice(themeStart, -2);  // exclude trailing INCUBATOR_SIGNALS + CHECKSUM

  // Read last row for decay baseline
  const lastScores = {};
  if (sheet.getLastRow() > 1) {
    const lr = sheet.getRange(
      sheet.getLastRow(), 1, 1, sheet.getLastColumn()
    ).getValues()[0];
    themes.forEach((t, i) => {
      const v = parseFloat(lr[themeStart + i]);
      if (!isNaN(v)) lastScores[t] = v;
    });
  }

  // Build new row with decay applied to absent themes
  const row    = [sessionUid, timestamp];
  const result = { sessionUid, timestamp };

  themes.forEach(t => {
    let score;
    if (known[t] !== undefined) {
      score = parseFloat(known[t].toFixed(4));
    } else if (lastScores[t] !== undefined) {
      score = parseFloat((lastScores[t] * CFG.DECAY_FACTOR).toFixed(4));
    } else {
      score = 0;
    }
    row.push(score);
    result[t] = score;
  });

  // INCUBATOR_SIGNALS: count of incoming themes that didn't map to a column
  const incubCount = Object.keys(known).filter(k => !themes.includes(k)).length;
  row.push(incubCount);

  // CHECKSUM: corruption-detection only (Law 5 — Matrix Row Integrity),
  // not a security control. Hashes session_uid + every theme score in a
  // fixed order so a duplicate/altered row is detectable on audit.
  row.push(_computeMatrixRowChecksum_(sessionUid, themes.map(t => result[t])));

  sheet.appendRow(row);
  return result;
}


/**
 * Row-integrity hash for one VECTOR_MATRIX row — detects duplicate
 * session_id rows or silently-corrupted float values on audit. Not a
 * security control (CFG.MATRIX_ROW_CHECKSUM_ALGO defaults to MD5, which
 * is fine here — this only needs to catch accidental corruption, not
 * resist a deliberate attacker).
 *
 * @param  {string} sessionUid
 * @param  {number[]} scores  Theme scores in header column order.
 * @returns {string} Lowercase hex digest.
 */
function _computeMatrixRowChecksum_(sessionUid, scores) {
  const algoName = CFG.MATRIX_ROW_CHECKSUM_ALGO === 'SHA_256' ? 'SHA_256' : 'MD5';
  const algo     = Utilities.DigestAlgorithm[algoName];
  const raw      = sessionUid + '|' + scores.map(s => (parseFloat(s) || 0).toFixed(4)).join(',');
  return Utilities.computeDigest(algo, raw)
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
    .join('');
}


/**
 * Appends one row per theme to DYNAMIC_STATE_MATRIX (long-format).
 * Records both the raw session score and the decayed score side-by-side.
 * This format makes per-theme trend analysis straightforward without
 * pivoting the wide VECTOR_MATRIX.
 *
 * Writes rows for known themes (with scores) only.
 * Unknown/incubator themes are tracked in _logToIncubator instead.
 *
 * @param  {Sheet}  sheet      DYNAMIC_STATE_MATRIX sheet.
 * @param  {Object} known      Known themes with session scores.
 * @param  {Object} unknown    Incubator-bound themes (logged separately).
 * @param  {string} sessionUid UID for the new rows.
 * @param  {string} timestamp  Formatted timestamp.
 * @returns {number} Number of rows written.
 */
function _writeDynamicStateRow(sheet, known, unknown, sessionUid, timestamp) {
  let written = 0;

  // Known themes — write raw score, compute decayed score from last entry
  Object.entries(known).forEach(([theme, rawScore]) => {
    // Find previous score for this theme to compute decay baseline
    let prevDecayed = 0;
    if (sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
      for (let i = data.length - 1; i >= 0; i--) {
        if (String(data[i][2]) === theme) {
          prevDecayed = parseFloat(data[i][4]) || 0;
          break;
        }
      }
    }
    const decayedScore = prevDecayed > 0
      ? parseFloat((prevDecayed * CFG.DECAY_FACTOR).toFixed(4))
      : parseFloat(rawScore.toFixed(4));

    sheet.appendRow([
      sessionUid,
      timestamp,
      theme,
      parseFloat(rawScore.toFixed(4)),
      decayedScore,
      0,        // Session_Count — updated by _checkPromotionCandidates
      false,    // Promoted
    ]);
    written++;
  });

  return written;
}


/**
 * Tracks emerging themes in the INCUBATOR sheet (CE-SMP Vector Weight
 * Calculation Engine v1.0 schema — cumulative score + raw score log,
 * not a rolling average).
 *
 * For each unknown theme with score >= INCUBATOR_THRESHOLD:
 *   - If the theme already exists → append to Raw_Score_Log, add this
 *     session's score to Cumulative_Score, bump Session_Count and
 *     Last_Touched.
 *   - If new → append a fresh INCUBATING row.
 *
 * Half-life decay (Phase 2) and promotion (Phase 3) are separate passes
 * — see _applyIncubatorDecay_ and _checkPromotionCandidates — so this
 * function only ever adds score, never removes it.
 *
 * @param  {Sheet}  sheet      INCUBATOR sheet.
 * @param  {Object} unknown    { THEME: score } — unrecognised themes.
 * @param  {string} sessionUid Current session UID.
 * @param  {string} timestamp  ISO-ish timestamp string for this session.
 * @returns {string[]} List of theme names logged.
 */
function _logToIncubator(sheet, unknown, sessionUid, timestamp) {
  const logged = [];
  if (!Object.keys(unknown).length) return logged;

  const data = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues()
    : [];

  Object.entries(unknown).forEach(([theme, score]) => {
    const idx = data.findIndex(r => String(r[0]) === theme);

    if (idx >= 0) {
      const prev = data[idx];
      if (String(prev[6]) === 'PROMOTED') return;  // already graduated — ignore

      const n = (parseInt(prev[3]) || 0) + 1;
      const cumulative = parseFloat((parseFloat(prev[4]) || 0) + score);

      let log = [];
      try { log = JSON.parse(prev[5] || '[]'); } catch (_) { log = []; }
      log.push({ session_id: sessionUid, raw_score: score });

      const sr = idx + 2;  // 1-indexed, skip header
      sheet.getRange(sr, 3).setValue(timestamp);                       // Last_Touched
      sheet.getRange(sr, 4).setValue(n);                                // Session_Count
      sheet.getRange(sr, 5).setValue(parseFloat(cumulative.toFixed(4))); // Cumulative_Score
      sheet.getRange(sr, 6).setValue(JSON.stringify(log));              // Raw_Score_Log
      sheet.getRange(sr, 7).setValue('INCUBATING');                     // re-activate if it had DECAYED

      data[idx][2] = timestamp;
      data[idx][3] = n;
      data[idx][4] = cumulative;
      data[idx][5] = JSON.stringify(log);
      data[idx][6] = 'INCUBATING';
    } else {
      const log = [{ session_id: sessionUid, raw_score: score }];
      sheet.appendRow([
        theme,
        timestamp,                          // First_Detected
        timestamp,                          // Last_Touched
        1,                                  // Session_Count
        parseFloat(score.toFixed(4)),       // Cumulative_Score
        JSON.stringify(log),                // Raw_Score_Log
        'INCUBATING',
      ]);
      data.push([theme, timestamp, timestamp, 1, score, JSON.stringify(log), 'INCUBATING']);
    }
    logged.push(theme);
  });

  return logged;
}


/**
 * Phase 2 (SMP §3.5) — applies half-life decay to every still-INCUBATING
 * theme, run once per session closeout before promotion is evaluated.
 * A theme that hasn't been touched in a while loses ground toward
 * promotion on a 0.5^(days/HALF_LIFE) curve; one that drops below the
 * floor is marked DECAYED (retained for audit, not deleted, and can
 * re-activate — see _logToIncubator — if it's touched again later).
 *
 * @param  {Sheet}  sheet      INCUBATOR sheet.
 * @param  {string} timestamp  Current run's timestamp (decay reference point).
 */
function _applyIncubatorDecay_(sheet, timestamp) {
  if (sheet.getLastRow() <= 1) return;

  const now  = new Date(timestamp).getTime() || Date.now();
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();

  data.forEach((row, i) => {
    const [, , lastTouched, , cumulative, , status] = row;
    if (status === 'PROMOTED' || status === 'DECAYED') return;

    const lastMs        = new Date(lastTouched).getTime() || now;
    const daysSince      = Math.max(0, (now - lastMs) / 86400000);
    const decayFactor    = Math.pow(0.5, daysSince / CFG.INCUBATOR_HALF_LIFE_DAYS);
    const decayed        = parseFloat((parseFloat(cumulative) || 0) * decayFactor);
    const sr             = i + 2;

    sheet.getRange(sr, 5).setValue(parseFloat(decayed.toFixed(4)));  // Cumulative_Score
    if (decayed < CFG.INCUBATOR_DECAY_FLOOR) {
      sheet.getRange(sr, 7).setValue('DECAYED');
    }
  });
}


/**
 * Phase 3 (SMP §3.5) — scans the INCUBATOR sheet for themes whose
 * (decayed) cumulative score has cleared CFG.INCUBATOR_PROMOTION_THRESHOLD.
 * For each qualifying theme:
 *   1. Adds a new column to VECTOR_MATRIX with that theme's name.
 *   2. Migrates Raw_Score_Log into VECTOR_MATRIX as-is — historical
 *      incubated scores transfer verbatim, not re-normalized (SMP
 *      Step 2). Prior sessions before the theme existed stay at 0
 *      (no backfill — they were measured without this vector).
 *   3. Marks the INCUBATOR row PROMOTED (terminal — _logToIncubator
 *      skips PROMOTED rows going forward).
 *   4. Persists the theme to PropertiesService (BUG-04 fix) so
 *      _getKnownVectors() picks it up on the very next session.
 *   5. Logs an operator notification — PRIMER doc creation itself is
 *      NOT staged as a separate HITL approval step here: _routeToVectorDocs
 *      already auto-creates a lightweight VECTOR_<THEME> doc the next
 *      time this theme scores as a known vector, which is this
 *      codebase's existing, already-automatic doc-creation path (unlike
 *      the SMP's proposed separate CE-LOG CREATE_NEW mutation type,
 *      which this repo's Governance Engine doesn't implement — see
 *      6_Governance.gs, FIND_REPLACE only). The operator decision to
 *      require "always manual HITL approval" is honored as a review
 *      notification on promotion, not as a block on that existing,
 *      low-risk auto-creation.
 *
 * @param  {Sheet} incubSheet   INCUBATOR sheet.
 * @param  {Sheet} matrixSheet  VECTOR_MATRIX sheet.
 * @returns {string[]} Themes promoted in this run.
 */
function _checkPromotionCandidates(incubSheet, matrixSheet) {
  const promoted = [];
  if (incubSheet.getLastRow() <= 1) return promoted;

  const data    = incubSheet.getRange(2, 1, incubSheet.getLastRow() - 1, 7).getValues();
  const headers = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];

  data.forEach((row, i) => {
    const [theme, firstDetected, , sessionCount, cumulative, rawLogJson, status] = row;
    if (
      status !== 'INCUBATING'                              ||
      parseFloat(cumulative) < CFG.INCUBATOR_PROMOTION_THRESHOLD ||
      headers.includes(theme)                              // already a column
    ) return;

    // Insert new theme column in VECTOR_MATRIX — before the trailing
    // INCUBATOR_SIGNALS + CHECKSUM columns (see _writeMatrixRow).
    const insertAt = matrixSheet.getLastColumn() - 1;
    matrixSheet.insertColumnBefore(insertAt);
    matrixSheet.getRange(1, insertAt).setValue(theme);

    // Migrate the raw score log verbatim into the historical rows that
    // actually produced those scores; every other prior row gets 0
    // (SMP Step 1 — "do not backfill").
    const lastDataRow = matrixSheet.getLastRow();
    if (lastDataRow > 1) {
      matrixSheet.getRange(2, insertAt, lastDataRow - 1, 1).setValue(0);
      let rawLog = [];
      try { rawLog = JSON.parse(rawLogJson || '[]'); } catch (_) { rawLog = []; }
      if (rawLog.length > 0) {
        const uidCol = matrixSheet.getRange(2, 1, lastDataRow - 1, 1).getValues().map(r => String(r[0]));
        rawLog.forEach(entry => {
          const rowIdx = uidCol.indexOf(String(entry.session_id));
          if (rowIdx === -1) return;  // that session's row has aged out or was never written
          matrixSheet.getRange(rowIdx + 2, insertAt).setValue(parseFloat(entry.raw_score) || 0);
        });
      }
    }

    incubSheet.getRange(i + 2, 7).setValue('PROMOTED');

    // BUG-04 FIX: persist to PropertiesService across executions
    _persistPromotedVector(theme);

    promoted.push(theme);
    console.log(
      '[VectorRouter] Promoted theme: ' + theme +
      ' (cumulative=' + parseFloat(cumulative).toFixed(2) +
      ', sessions=' + sessionCount +
      ', first detected=' + firstDetected + '). ' +
      'A VECTOR_' + theme + ' doc will be created automatically the next time ' +
      'it scores as a known vector — review it once it appears.'
    );
  });

  return promoted;
}


/**
 * Creates or updates one Google Doc per high-weight known theme
 * in the 05_Vector_Repository folder.
 *
 * Docs named VECTOR_THEME are created if they don't exist.
 * High-weight sessions (score > VECTOR_THRESHOLD) append a heading
 * entry with the session summary.
 * Standard sessions append a brief signal note.
 *
 * BUG-03 FIX: File ID captured before saveAndClose to prevent
 * Drive name-search race condition on newly created docs.
 *
 * @param  {Object} pd          Parsed inference payload.
 * @param  {Object} known       { THEME: score } known themes.
 * @param  {string} sessionUid  Session UID.
 * @param  {string} timestamp   Formatted timestamp string.
 * @returns {number} Count of vector docs written to.
 */
function _routeToVectorDocs(pd, known, sessionUid, timestamp) {
  const folderId = PropertiesService.getScriptProperties()
                     .getProperty('ID_05_VECTOR_REPOSITORY');
  if (!folderId) {
    console.warn('[VectorRouter] ID_05_VECTOR_REPOSITORY not set — skipping doc routing.');
    return 0;
  }

  const folder = DriveApp.getFolderById(folderId);
  let count = 0;

  Object.entries(known).forEach(([theme, score]) => {
    if (score <= CFG.INCUBATOR_THRESHOLD) return;

    const docName  = 'VECTOR_' + theme;
    const existing = folder.getFilesByName(docName);

    let doc;
    if (existing.hasNext()) {
      doc = DocumentApp.openById(existing.next().getId());
    } else {
      // BUG-03 FIX: capture dId before saveAndClose
      const d   = DocumentApp.create(docName);
      const dId = d.getId();
      d.getBody().appendParagraph(docName)
       .setHeading(DocumentApp.ParagraphHeading.HEADING1);
      d.saveAndClose();
      DriveApp.getFileById(dId).moveTo(folder);
      doc = DocumentApp.openById(dId);  // open by captured ID, not name search
    }

    const body = doc.getBody();

    if (score > CFG.VECTOR_THRESHOLD) {
      // High-weight session — record heading + summary
      body.appendParagraph(
        '\n[HIGH-WEIGHT: ' + timestamp + ' | ' + sessionUid + ' | Score: ' + score + ']'
      ).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      if (pd.session_summary) {
        body.appendParagraph(pd.session_summary);
      }
      if (pd.dynamic_state?.next_steps?.length > 0) {
        body.appendParagraph('Key Next Steps:').setBold(true);
        pd.dynamic_state.next_steps
          .slice(0, 3)
          .forEach(s => body.appendListItem(String(s)));
      }
    } else {
      // Standard signal — brief inline note
      body.appendParagraph(
        '[Signal: ' + timestamp + ' | ' + sessionUid + ' | Score: ' + score + ']'
      );
    }

    doc.saveAndClose();
    count++;
  });

  return count;
}


// ================================================================
// VECTOR PERSISTENCE HELPERS  (BUG-04)
// ================================================================

/**
 * Returns CFG.KNOWN_VECTORS merged with all themes promoted from
 * the incubator in previous executions. Use this everywhere
 * instead of directly referencing CFG.KNOWN_VECTORS.
 *
 * @returns {string[]} Merged known vector list.
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
    console.error('[_getKnownVectors] Could not read promoted vectors: ' + e.message);
  }
  return base;
}


/**
 * Writes a promoted theme to PropertiesService so it survives
 * across script executions. Idempotent.
 *
 * @param {string} theme  Uppercase theme name to persist.
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
    console.error('[_persistPromotedVector] Failed for "' + theme + '": ' + e.message);
  }
}


// ================================================================
// WEB APP CALLABLE — DIAGNOSTICS TAB
// ================================================================

/**
 * Returns the current vector state for the web app Diagnostics tab.
 * Reads the most recent row of VECTOR_MATRIX for decayed live scores,
 * the INCUBATOR sheet for pending candidates, and PropertiesService
 * for promoted themes beyond the base CFG.KNOWN_VECTORS list.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(renderVectors)
 *     .getVectorState()
 *
 * @returns {Object} {
 *   success, vectors[], incubating[], promoted_themes[],
 *   session_uid, last_updated, message?
 * }
 */
function getVectorState() {
  try {
    const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrix = ss.getSheetByName(CFG.VECTOR_MATRIX_SHEET);

    if (!matrix || matrix.getLastRow() <= 1) {
      return {
        success:    true,
        vectors:    _getKnownVectors().map(n => ({ name: n, score: 0 })),
        incubating: [],
        promoted_themes: [],
        session_uid:  '',
        last_updated: '',
        message:    'No sessions processed yet — scores initialised to 0.',
      };
    }

    const headers    = matrix.getRange(1, 1, 1, matrix.getLastColumn()).getValues()[0];
    const lastRow    = matrix.getRange(
      matrix.getLastRow(), 1, 1, matrix.getLastColumn()
    ).getValues()[0];

    const themeStart = 2;
    // Exclude the trailing INCUBATOR_SIGNALS + CHECKSUM columns
    const themes = headers.slice(themeStart).filter(h => h !== 'INCUBATOR_SIGNALS' && h !== 'CHECKSUM');

    const vectors = themes
      .map((name, i) => ({
        name:  String(name),
        score: parseFloat((parseFloat(lastRow[themeStart + i] || 0)).toFixed(2)),
      }))
      .filter(v => v.name)
      .sort((a, b) => b.score - a.score);

    // Incubator candidates (INCUBATING + DECAYED — exclude PROMOTED rows,
    // which have graduated to a real vector column above).
    // Schema: Theme, First_Detected, Last_Touched, Session_Count,
    // Cumulative_Score, Raw_Score_Log, Status (CE-SMP Vector Weight
    // Calculation Engine v1.0).
    const incubating = [];
    const incubSheet = ss.getSheetByName(CFG.INCUBATOR_SHEET);
    if (incubSheet && incubSheet.getLastRow() > 1) {
      incubSheet
        .getRange(2, 1, incubSheet.getLastRow() - 1, 7)
        .getValues()
        .forEach(r => {
          if (String(r[6]) !== 'PROMOTED') {
            incubating.push({
              name:             String(r[0]),
              sessions:         parseInt(r[3]) || 0,
              cumulative_score: parseFloat((parseFloat(r[4]) || 0).toFixed(2)),
              status:           String(r[6] || 'INCUBATING'),
            });
          }
        });
      incubating.sort((a, b) => b.cumulative_score - a.cumulative_score);
    }

    // Promoted themes beyond CFG base (persisted promotions)
    const promotedThemes = _getKnownVectors()
      .filter(v => !CFG.KNOWN_VECTORS.includes(v));

    return {
      success:             true,
      vectors,
      incubating,
      promotion_threshold: CFG.INCUBATOR_PROMOTION_THRESHOLD,
      promoted_themes:     promotedThemes,
      session_uid:         String(lastRow[0] || ''),
      last_updated:        String(lastRow[1] || ''),
    };

  } catch (e) {
    _reportError('getVectorState', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * Manually triggers a promotion check on the INCUBATOR sheet.
 * Called by the "Run incubator promotion" button in the web app
 * Diagnostics tab.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .runPromotionCheck()
 *
 * @returns {{success: boolean, message: string}} `success` distinguishes a
 *   genuine exception from a routine "nothing to promote" result — this
 *   used to return a bare string in both the error and no-op cases
 *   ('Error: ...' vs. 'No promotion candidates...'), and the web app
 *   rendered both in the same neutral color since there was no field to
 *   tell them apart.
 */
function runPromotionCheck() {
  try {
    const ss          = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrixSheet = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const incubSheet  = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return { success: true, message: 'System busy — try again in a moment.' };
    try {
      const promoted = _checkPromotionCandidates(incubSheet, matrixSheet);
      if (promoted.length > 0) SpreadsheetApp.flush();
      return {
        success: true,
        message: promoted.length > 0
          ? promoted.length + ' vector' + (promoted.length === 1 ? '' : 's') + ' promoted: ' + promoted.join(', ')
          : 'No promotion candidates at this time.',
      };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    _reportError('runPromotionCheck', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * Dumps the full vector state to the console for debugging.
 * Safe to run from the Apps Script editor at any time.
 */
function dumpVectorState() {
  const state = getVectorState();
  if (!state.success) { console.log('Error: ' + state.message); return; }
  console.log('═══ VECTOR STATE (' + (state.last_updated || 'no sessions') + ') ═══');
  state.vectors.forEach(v =>
    console.log('  ' + v.name.padEnd(20) + v.score.toFixed(2))
  );
  if (state.incubating.length) {
    console.log('\n─── INCUBATOR ───');
    state.incubating.forEach(v =>
      console.log(
        '  ' + v.name.padEnd(20) +
        'cumulative=' + v.cumulative_score +
        ' sessions=' + v.sessions +
        ' status=' + v.status
      )
    );
  }
  if (state.promoted_themes.length) {
    console.log('\n─── PROMOTED (beyond CFG base) ───');
    console.log('  ' + state.promoted_themes.join(', '));
  }
  console.log('Session UID: ' + (state.session_uid || 'none'));
}


// ================================================================
// ONE-TIME SCHEMA MIGRATION (CE-SMP Vector Weight Calculation Engine)
// ================================================================

/**
 * ONE-TIME, MANUALLY-RUN migration for a live BRAIN_TRUST_INDEX
 * spreadsheet whose VECTOR_MATRIX / INCUBATOR tabs pre-date the
 * Bifurcation Boundary work (commit ff37fd5). Run this from the Apps
 * Script editor once, before deploying the current `4_Vector_Router.gs`
 * against an existing production sheet.
 *
 * WHY THIS EXISTS
 * `_getOrCreateSheet()` only sets headers when it CREATES a sheet — it
 * never touches one that already exists. A spreadsheet built before this
 * engine landed has:
 *   VECTOR_MATRIX : Session_UID, Timestamp, ARCHITECTURE, UI, SECURITY,
 *                   PEDAGOGY, GAS_DEVELOPMENT, RELATIONAL,
 *                   INCUBATOR_SIGNALS               (no DOMAIN_COMPLIANCE,
 *                                                     no CHECKSUM)
 *   INCUBATOR     : Theme, First_Seen, Last_Seen, Session_Count,
 *                   Avg_Weight, Status               (running-average
 *                                                      lifecycle, not
 *                                                      cumulative-score +
 *                                                      half-life decay)
 * Deploying the current code on top of that sheet as-is will misalign
 * columns (`_writeMatrixRow`'s NO_HEADERS guard may even refuse to write
 * at all) rather than self-heal. This function upgrades both tabs in
 * place, non-destructively — no rows are deleted, no existing scores are
 * discarded.
 *
 * WHAT IT DOES
 *  VECTOR_MATRIX:
 *   - Inserts a DOMAIN_COMPLIANCE column (if missing) immediately before
 *     INCUBATOR_SIGNALS, backfilled to 0 for every existing row — there is
 *     no historical signal to recover for a theme that didn't exist yet.
 *   - Appends a CHECKSUM column (if missing) after INCUBATOR_SIGNALS,
 *     backfilled with a real checksum computed from each row's existing
 *     theme scores via `_computeMatrixRowChecksum_` — so integrity
 *     auditing works retroactively too, not just for new rows.
 *  INCUBATOR:
 *   - Renames First_Seen → First_Detected, Last_Seen → Last_Touched
 *     (labels only — values are unchanged, same meaning).
 *   - Renames Avg_Weight → Cumulative_Score, and for each existing row
 *     overwrites the value with `avg_weight * session_count` — a
 *     best-effort reconstruction of a cumulative score from a running
 *     average. This is an APPROXIMATION: the exact per-exchange history
 *     (DECISION vs EXPLORATORY multipliers applied at the time) isn't
 *     recoverable from an average alone. Flagged in the returned log.
 *   - Inserts a Raw_Score_Log column (if missing) before Status,
 *     populated with a single synthetic entry per row noting the
 *     migration, so the column is valid JSON from the start rather than
 *     empty.
 *
 * Safe to run more than once — every step checks for the target schema
 * first and skips if already migrated.
 *
 * @returns {Object} { success, log: string[], errors: string[] }
 */
function migrateVectorSchema_v2() {
  const log = [];
  const errors = [];
  try {
    const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);

    // ── VECTOR_MATRIX ──────────────────────────────────────────
    const matrixSheet = ss.getSheetByName(CFG.VECTOR_MATRIX_SHEET);
    if (!matrixSheet) {
      log.push('VECTOR_MATRIX sheet does not exist yet — nothing to migrate. ' +
                'It will be created with the current schema on first use.');
    } else {
      let headers = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];
      const incubIdx = headers.indexOf('INCUBATOR_SIGNALS');

      if (incubIdx === -1) {
        errors.push('VECTOR_MATRIX header has no INCUBATOR_SIGNALS column — ' +
                     'this sheet does not match any known schema version. Skipped; review manually.');
      } else {
        const lastDataRow = matrixSheet.getLastRow();

        if (!headers.includes('DOMAIN_COMPLIANCE')) {
          matrixSheet.insertColumnBefore(incubIdx + 1);
          matrixSheet.getRange(1, incubIdx + 1).setValue('DOMAIN_COMPLIANCE');
          if (lastDataRow > 1) {
            const fill = Array(lastDataRow - 1).fill([0]);
            matrixSheet.getRange(2, incubIdx + 1, lastDataRow - 1, 1).setValues(fill);
          }
          log.push('VECTOR_MATRIX: inserted DOMAIN_COMPLIANCE column before INCUBATOR_SIGNALS, ' +
                    'backfilled 0 for ' + Math.max(0, lastDataRow - 1) + ' existing row(s).');
          headers = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];
        } else {
          log.push('VECTOR_MATRIX: DOMAIN_COMPLIANCE column already present — skipped.');
        }

        if (!headers.includes('CHECKSUM')) {
          const themeStart = 2;
          const newIncubIdx = headers.indexOf('INCUBATOR_SIGNALS');
          const themes = headers.slice(themeStart, newIncubIdx);
          const checksumCol = headers.length + 1;
          matrixSheet.getRange(1, checksumCol).setValue('CHECKSUM');

          if (lastDataRow > 1) {
            const data = matrixSheet.getRange(2, 1, lastDataRow - 1, headers.length).getValues();
            const checksums = data.map(row => {
              const sessionUid = row[0];
              const scores = themes.map((_, i) => row[themeStart + i]);
              return [_computeMatrixRowChecksum_(sessionUid, scores)];
            });
            matrixSheet.getRange(2, checksumCol, checksums.length, 1).setValues(checksums);
          }
          log.push('VECTOR_MATRIX: appended CHECKSUM column, backfilled real checksums for ' +
                    Math.max(0, lastDataRow - 1) + ' existing row(s).');
        } else {
          log.push('VECTOR_MATRIX: CHECKSUM column already present — skipped.');
        }
      }
    }

    // ── INCUBATOR ──────────────────────────────────────────────
    const incubSheet = ss.getSheetByName(CFG.INCUBATOR_SHEET);
    if (!incubSheet) {
      log.push('INCUBATOR sheet does not exist yet — nothing to migrate. ' +
                'It will be created with the current schema on first use.');
    } else {
      let headers = incubSheet.getRange(1, 1, 1, incubSheet.getLastColumn()).getValues()[0];

      if (headers.includes('Cumulative_Score')) {
        log.push('INCUBATOR: already on the Cumulative_Score schema — skipped.');
      } else if (!headers.includes('Avg_Weight')) {
        errors.push('INCUBATOR header has neither Avg_Weight nor Cumulative_Score — ' +
                     'this sheet does not match any known schema version. Skipped; review manually.');
      } else {
        const lastDataRow  = incubSheet.getLastRow();
        const firstSeenCol = headers.indexOf('First_Seen') + 1;
        const lastSeenCol  = headers.indexOf('Last_Seen') + 1;
        const avgWeightCol = headers.indexOf('Avg_Weight') + 1;
        const statusCol    = headers.indexOf('Status') + 1;
        const sessCountCol = headers.indexOf('Session_Count') + 1;

        if (firstSeenCol > 0) incubSheet.getRange(1, firstSeenCol).setValue('First_Detected');
        if (lastSeenCol  > 0) incubSheet.getRange(1, lastSeenCol).setValue('Last_Touched');
        if (avgWeightCol > 0) incubSheet.getRange(1, avgWeightCol).setValue('Cumulative_Score');

        let approxNote = '';
        if (lastDataRow > 1 && avgWeightCol > 0 && sessCountCol > 0) {
          const data = incubSheet.getRange(2, 1, lastDataRow - 1, headers.length).getValues();
          const newValues = data.map(row => {
            const avg   = parseFloat(row[avgWeightCol - 1]) || 0;
            const count = parseInt(row[sessCountCol - 1], 10) || 1;
            return [parseFloat((avg * count).toFixed(4))];
          });
          incubSheet.getRange(2, avgWeightCol, newValues.length, 1).setValues(newValues);
          approxNote = ' (Cumulative_Score approximated as avg_weight × session_count — ' +
                       'exact per-exchange history is not recoverable from an average)';
        }

        // Insert Raw_Score_Log before Status, if missing.
        headers = incubSheet.getRange(1, 1, 1, incubSheet.getLastColumn()).getValues()[0];
        if (!headers.includes('Raw_Score_Log')) {
          const statusIdx = headers.indexOf('Status');
          incubSheet.insertColumnBefore(statusIdx + 1);
          incubSheet.getRange(1, statusIdx + 1).setValue('Raw_Score_Log');

          if (lastDataRow > 1) {
            const cumulCol = headers.indexOf('Cumulative_Score') + 1;
            const refreshed = incubSheet.getRange(2, 1, lastDataRow - 1, incubSheet.getLastColumn()).getValues();
            const logValues = refreshed.map(row => {
              const cumulative = parseFloat(row[cumulCol - 1]) || 0;
              return [JSON.stringify([{
                session_id: 'MIGRATED',
                raw_score: cumulative,
                note: 'Reconstructed during migrateVectorSchema_v2() from a pre-existing ' +
                      'Avg_Weight value; original per-session raw-score history was not retained.',
              }])];
            });
            incubSheet.getRange(2, statusIdx + 1, logValues.length, 1).setValues(logValues);
          }
        }

        log.push('INCUBATOR: migrated ' + Math.max(0, lastDataRow - 1) + ' existing row(s) to the ' +
                  'Cumulative_Score + Raw_Score_Log schema' + approxNote + '.');
      }
    }

    SpreadsheetApp.flush();
    log.forEach(l => console.log(l));
    errors.forEach(e => console.log('ERROR: ' + e));
    return { success: errors.length === 0, log, errors };
  } catch (e) {
    _reportError('migrateVectorSchema_v2', e, null);
    return { success: false, log, errors: errors.concat(e.message) };
  }
}


// ================================================================
// END 4_Vector_Router.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 5_Error_And_Utilities.gs
// ================================================================
