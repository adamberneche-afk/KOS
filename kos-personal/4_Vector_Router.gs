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
// MATRIX_LEDGER (written by processIntakePayload in 3_Queue_Processor.gs)
//   Purpose : Append-only audit log of RAW scores per session.
//   Schema  : Fixed columns — Session_UID, Timestamp,
//             ARCHITECTURE, UI, SECURITY, PEDAGOGY,
//             GAS_DEVELOPMENT, RELATIONAL, TOTAL
//   No decay. Never used for live state reads.
//
// VECTOR_MATRIX (written by _writeMatrixRow here)
//   Purpose : Living state matrix. Current DECAYED scores.
//   Schema  : Dynamic — Session_UID, Timestamp, [known themes...],
//             INCUBATOR_SIGNALS. Grows when themes are promoted.
//   Decay   : Each run applies CFG.DECAY_FACTOR to any theme
//             not present in the current session's vector_weights.
//   This is the sheet the Diagnostics tab reads for display.
//
// INCUBATOR (written by _logToIncubator here)
//   Purpose : Staging area for emerging themes that haven't yet
//             met promotion thresholds.
//   Schema  : Theme, First_Seen, Last_Seen, Session_Count,
//             Avg_Weight, Status
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
//   getVectorState()         web app Diagnostics tab
//   runPromotionCheck()      web app Diagnostics tab button
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
    const incubSignals = _logToIncubator(incubSheet, unknown, sessionUid);
    const routedDocs   = _routeToVectorDocs(pd, known, sessionUid, timestamp);
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
  if (headers.length <= themeStart + 1) {
    _reportError(
      '_writeMatrixRow:NO_HEADERS',
      new Error(
        'VECTOR_MATRIX has no theme columns. Expected at least one theme column ' +
        'followed by INCUBATOR_SIGNALS. Run setupRoutingProperties() or ' +
        'deployFullSystem() to reinitialise the sheet headers. Session ' +
        sessionUid + ' not written.'
      ),
      null
    );
    return {};
  }

  const themes     = headers.slice(themeStart, -1);  // exclude trailing INCUBATOR_SIGNALS

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
  sheet.appendRow(row);
  return result;
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
 * Tracks emerging themes in the INCUBATOR sheet.
 *
 * For each unknown theme with score >= INCUBATOR_THRESHOLD:
 *   - If the theme already exists → update Last_Seen, Session_Count,
 *     recalculate rolling average score.
 *   - If new → append a fresh INCUBATING row.
 *
 * @param  {Sheet}  sheet      INCUBATOR sheet.
 * @param  {Object} unknown    { THEME: score } — unrecognised themes.
 * @param  {string} sessionUid Current session UID.
 * @returns {string[]} List of theme names logged.
 */
function _logToIncubator(sheet, unknown, sessionUid) {
  const logged = [];
  if (!Object.keys(unknown).length) return logged;

  const data = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues()
    : [];

  Object.entries(unknown).forEach(([theme, score]) => {
    const idx = data.findIndex(r => String(r[0]) === theme);

    if (idx >= 0) {
      const prev    = data[idx];
      const n       = (parseInt(prev[3]) || 0) + 1;
      const prevAvg = parseFloat(prev[4]) || 0;
      const newAvg  = parseFloat((((prevAvg * (n - 1)) + score) / n).toFixed(4));
      const sr      = idx + 2;  // 1-indexed, skip header

      sheet.getRange(sr, 3).setValue(sessionUid);  // Last_Seen
      sheet.getRange(sr, 4).setValue(n);            // Session_Count
      sheet.getRange(sr, 5).setValue(newAvg);       // Avg_Weight

      // Update local cache to handle multiple themes in same session
      data[idx][2] = sessionUid;
      data[idx][3] = n;
      data[idx][4] = newAvg;
    } else {
      sheet.appendRow([
        theme,
        sessionUid,  // First_Seen
        sessionUid,  // Last_Seen
        1,           // Session_Count
        parseFloat(score.toFixed(4)),
        'INCUBATING',
      ]);
      data.push([theme, sessionUid, sessionUid, 1, score, 'INCUBATING']);
    }
    logged.push(theme);
  });

  return logged;
}


/**
 * Scans the INCUBATOR sheet for themes that meet promotion thresholds.
 * For each qualifying theme:
 *   1. Adds a new column to VECTOR_MATRIX with that theme's name.
 *   2. Fills historical rows with 0 (no retroactive data).
 *   3. Marks the INCUBATOR row as PROMOTED.
 *   4. Persists the theme to PropertiesService (BUG-04 fix).
 *
 * Promotion thresholds (from CFG):
 *   PROMOTION_MIN_SESSIONS    minimum number of sessions seen
 *   PROMOTION_MIN_AVG_WEIGHT  minimum rolling average score
 *
 * @param  {Sheet} incubSheet   INCUBATOR sheet.
 * @param  {Sheet} matrixSheet  VECTOR_MATRIX sheet.
 * @returns {string[]} Themes promoted in this run.
 */
function _checkPromotionCandidates(incubSheet, matrixSheet) {
  const promoted = [];
  if (incubSheet.getLastRow() <= 1) return promoted;

  const data    = incubSheet.getRange(2, 1, incubSheet.getLastRow() - 1, 6).getValues();
  const headers = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];

  data.forEach((row, i) => {
    const [theme,,, count, avg, status] = row;
    if (
      status    === 'PROMOTED'                        ||
      parseInt(count)  < CFG.PROMOTION_MIN_SESSIONS   ||
      parseFloat(avg)  < CFG.PROMOTION_MIN_AVG_WEIGHT ||
      headers.includes(theme)                         // already a column
    ) return;

    // Insert new theme column in VECTOR_MATRIX
    // Position: before the trailing INCUBATOR_SIGNALS column
    const insertAt = matrixSheet.getLastColumn();  // inserts before INCUBATOR_SIGNALS
    matrixSheet.insertColumnBefore(insertAt);
    matrixSheet.getRange(1, insertAt).setValue(theme);
    if (matrixSheet.getLastRow() > 1) {
      matrixSheet.getRange(2, insertAt, matrixSheet.getLastRow() - 1, 1).setValue(0);
    }

    incubSheet.getRange(i + 2, 6).setValue('PROMOTED');

    // BUG-04 FIX: persist to PropertiesService across executions
    _persistPromotedVector(theme);

    promoted.push(theme);
    console.log('[VectorRouter] Promoted theme: ' + theme);
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
    // Exclude the trailing INCUBATOR_SIGNALS column
    const themes = headers.slice(themeStart).filter(h => h !== 'INCUBATOR_SIGNALS');

    const vectors = themes
      .map((name, i) => ({
        name:  String(name),
        score: parseFloat((parseFloat(lastRow[themeStart + i] || 0)).toFixed(2)),
      }))
      .filter(v => v.name)
      .sort((a, b) => b.score - a.score);

    // Incubator candidates (exclude PROMOTED rows)
    const incubating = [];
    const incubSheet = ss.getSheetByName(CFG.INCUBATOR_SHEET);
    if (incubSheet && incubSheet.getLastRow() > 1) {
      incubSheet
        .getRange(2, 1, incubSheet.getLastRow() - 1, 6)
        .getValues()
        .forEach(r => {
          if (String(r[5]) !== 'PROMOTED') {
            incubating.push({
              name:     String(r[0]),
              sessions: parseInt(r[3]) || 0,
              avg:      parseFloat((parseFloat(r[4]) || 0).toFixed(2)),
              status:   String(r[5] || 'INCUBATING'),
            });
          }
        });
      incubating.sort((a, b) => b.avg - a.avg);
    }

    // Promoted themes beyond CFG base (persisted promotions)
    const promotedThemes = _getKnownVectors()
      .filter(v => !CFG.KNOWN_VECTORS.includes(v));

    return {
      success:         true,
      vectors,
      incubating,
      promoted_themes: promotedThemes,
      session_uid:     String(lastRow[0] || ''),
      last_updated:    String(lastRow[1] || ''),
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
 * @returns {string} Human-readable result for the web app status line.
 */
function runPromotionCheck() {
  try {
    const ss          = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrixSheet = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
    const incubSheet  = _getOrCreateSheet(ss, CFG.INCUBATOR_SHEET);

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return 'System busy — try again in a moment.';
    try {
      const promoted = _checkPromotionCandidates(incubSheet, matrixSheet);
      if (promoted.length > 0) SpreadsheetApp.flush();
      return promoted.length > 0
        ? promoted.length + ' vector(s) promoted: ' + promoted.join(', ')
        : 'No promotion candidates at this time.';
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    _reportError('runPromotionCheck', e, null);
    return 'Error: ' + e.message;
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
      console.log('  ' + v.name.padEnd(20) + 'avg=' + v.avg + ' sessions=' + v.sessions)
    );
  }
  if (state.promoted_themes.length) {
    console.log('\n─── PROMOTED (beyond CFG base) ───');
    console.log('  ' + state.promoted_themes.join(', '));
  }
  console.log('Session UID: ' + (state.session_uid || 'none'));
}


// ================================================================
// END 4_Vector_Router.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 5_Error_And_Utilities.gs
// ================================================================
