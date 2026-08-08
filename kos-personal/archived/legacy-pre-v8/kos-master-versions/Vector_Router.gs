/**
 * ============================================================
 * VECTOR_ROUTER.GS
 * CI: 1.0 | Companion to RTP_REFINERY_DEPLOYER.gs
 * ============================================================
 *
 * PURPOSE:
 *   Supersedes the [PRE-SMP] binary threshold routing in the main script.
 *   Implements the full Vector Weight Calculation Engine as defined in the
 *   CURATOR V5 schema: sentence-level classification, the Incubator for
 *   new theme signals, half-life decay on the VECTOR_MATRIX, and a
 *   promotion engine that elevates recurring Incubator themes to canonical
 *   vector columns.
 *
 * SHEETS REQUIRED IN BRAIN_TRUST_INDEX (created by main script Deploy):
 *   VECTOR_MATRIX   — Canonical theme scores, one row per session
 *   INCUBATOR       — Unmapped themes accumulating toward promotion
 *
 * DEPLOYMENT:
 *   Paste this file into the same Apps Script project as the main script.
 *   No separate binding required — same Drop Zone doc.
 *
 * ACTIVATION:
 *   1. Confirm VECTOR_MATRIX and INCUBATOR tabs exist in BRAIN_TRUST_INDEX
 *   2. Call routeVectorWeights(payloadData, sessionUid, timestamp) from
 *      processIntakePayload() in place of executeVectorRouting()
 *   3. Set PIVOT_SMP_ACTIVE = true in the main script CFG to disable the
 *      [PRE-SMP] fallback
 *
 * KNOWN VECTOR TAXONOMY (VECTOR_MATRIX columns 3+):
 *   ARCHITECTURE | UI | SECURITY | PEDAGOGY | GAS_DEVELOPMENT | RELATIONAL
 *   New themes accumulate in INCUBATOR until promoted via promoteIncubatorThemes()
 *
 * CONSTANTS (mirrors main script CFG — keep in sync):
 * ============================================================
 */

const VR_CFG = {
  INDEX_NAME:          'BRAIN_TRUST_INDEX',
  VECTOR_MATRIX_SHEET: 'VECTOR_MATRIX',
  INCUBATOR_SHEET:     'INCUBATOR',
  VECTOR_FOLDER_KEY:   'ID_05_VECTOR_REPOSITORY',
  DECAY_FACTOR:        0.92,   // Half-life multiplier per session for absent themes
  INCUBATOR_THRESHOLD: 0.10,   // Min weight to log a new theme to the Incubator
  PROMOTION_MIN_SESSIONS: 3,   // Sessions a theme must appear before promotion eligibility
  PROMOTION_MIN_AVG_WEIGHT: 0.35, // Min average weight across those sessions
  KNOWN_VECTORS: [
    'ARCHITECTURE', 'UI', 'SECURITY', 'PEDAGOGY', 'GAS_DEVELOPMENT', 'RELATIONAL'
  ],
};


// ══════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ══════════════════════════════════════════════════════════════

/**
 * Primary router. Replaces executeVectorRouting() in processIntakePayload().
 * Orchestrates: Matrix write → Decay → Incubator → Vector doc routing → Promotion check.
 *
 * @param {Object} payloadData - Parsed CURATOR V5 JSON
 * @param {string} sessionUid  - Session identifier (e.g. 'LOG_1234567890')
 * @param {string} timestamp   - Formatted timestamp string
 * @returns {Object} { status, matrixRow, routedDocs, incubatorSignals, promotions }
 */
function routeVectorWeights(payloadData, sessionUid, timestamp) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    console.warn('[VectorRouter] Could not acquire lock — skipping.');
    return { status: 'LOCKED' };
  }

  try {
    const ss           = _vr_getIndexSheet();
    const matrixSheet  = _vr_getOrCreateSheet(ss, VR_CFG.VECTOR_MATRIX_SHEET);
    const incubSheet   = _vr_getOrCreateSheet(ss, VR_CFG.INCUBATOR_SHEET);
    const rawWeights   = payloadData.vector_weights || {};

    // 1. Separate known vectors from unknown signals
    const knownWeights   = {};
    const unknownSignals = {};

    Object.entries(rawWeights).forEach(([theme, val]) => {
      const score = parseFloat(val);
      if (isNaN(score)) return;
      if (VR_CFG.KNOWN_VECTORS.includes(theme.toUpperCase())) {
        knownWeights[theme.toUpperCase()] = score;
      } else if (score >= VR_CFG.INCUBATOR_THRESHOLD) {
        unknownSignals[theme.toUpperCase()] = score;
      }
    });

    // 2. Apply half-life decay to previous session scores and write new row
    const matrixRow = _writeMatrixRow(matrixSheet, knownWeights, sessionUid, timestamp);

    // 3. Log unknown signals to Incubator
    const incubatorSignals = _logToIncubator(incubSheet, unknownSignals, sessionUid);

    // 4. Route high-weight vectors to VECTOR_ docs (full replacement for executeVectorRouting)
    const routedDocs = _routeToVectorDocs(payloadData, knownWeights, sessionUid, timestamp);

    // 5. Check for promotion candidates
    const promotions = _checkPromotionCandidates(incubSheet, matrixSheet);

    SpreadsheetApp.flush();

    console.log(`[VectorRouter] Complete — Session: ${sessionUid} | Matrix row written | Incubator signals: ${Object.keys(unknownSignals).length} | Promotions: ${promotions.length}`);

    return { status: 'SUCCESS', matrixRow, routedDocs, incubatorSignals, promotions };

  } catch (e) {
    console.error('[VectorRouter] Fault: ' + e.toString());
    return { status: 'ERROR', message: e.message };
  } finally {
    lock.releaseLock();
  }
}


// ══════════════════════════════════════════════════════════════
// VECTOR MATRIX — Write & Decay
// ══════════════════════════════════════════════════════════════

/**
 * Reads the last VECTOR_MATRIX row, applies half-life decay to scores for
 * themes absent from the current session, then appends the new session row.
 *
 * Decay logic: if a theme was present in the last session but not this one,
 * its effective score = last_score * DECAY_FACTOR. If it is present, the new
 * score replaces the previous one (no accumulation — each session is a fresh
 * classification, not a running total).
 *
 * @param {Sheet}  sheet        - VECTOR_MATRIX sheet
 * @param {Object} knownWeights - { THEME: score } for known vectors this session
 * @param {string} sessionUid
 * @param {string} timestamp
 * @returns {Object} The row written { sessionUid, timestamp, ...scores }
 */
function _writeMatrixRow(sheet, knownWeights, sessionUid, timestamp) {
  const headers     = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const themeStart  = 2; // Columns 0=Session_UID, 1=Timestamp, then themes
  const themeHeaders = headers.slice(themeStart);

  // Get last row for decay calculation
  let lastScores = {};
  if (sheet.getLastRow() > 1) {
    const lastRow = sheet.getRange(sheet.getLastRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
    themeHeaders.forEach((theme, i) => {
      const val = parseFloat(lastRow[themeStart + i]);
      if (!isNaN(val)) lastScores[theme] = val;
    });
  }

  // Calculate decayed or fresh scores for each known column
  const rowValues = [sessionUid, timestamp];
  const rowResult = { sessionUid, timestamp };

  themeHeaders.forEach(theme => {
    let score;
    if (knownWeights[theme] !== undefined) {
      // Theme active this session — use fresh score
      score = parseFloat(knownWeights[theme].toFixed(4));
    } else if (lastScores[theme] !== undefined) {
      // Theme absent this session — apply half-life decay
      score = parseFloat((lastScores[theme] * VR_CFG.DECAY_FACTOR).toFixed(4));
    } else {
      score = 0;
    }
    rowValues.push(score);
    rowResult[theme] = score;
  });

  // Add incubator signal count as final column
  rowValues.push(Object.keys(knownWeights).filter(k => !themeHeaders.includes(k)).length);

  sheet.appendRow(rowValues);
  return rowResult;
}


// ══════════════════════════════════════════════════════════════
// INCUBATOR — Log, Track, Promote
// ══════════════════════════════════════════════════════════════

/**
 * Logs unknown theme signals to the Incubator sheet.
 * Each theme has one row; subsequent appearances update Last_Seen,
 * Session_Count, and recalculate Avg_Weight as a rolling mean.
 *
 * @param {Sheet}  sheet          - INCUBATOR sheet
 * @param {Object} unknownSignals - { THEME: score } for unrecognised themes
 * @param {string} sessionUid
 * @returns {string[]} List of themes logged
 */
function _logToIncubator(sheet, unknownSignals, sessionUid) {
  const logged = [];
  if (Object.keys(unknownSignals).length === 0) return logged;

  const data = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues()
    : [];

  Object.entries(unknownSignals).forEach(([theme, score]) => {
    const existingIdx = data.findIndex(r => r[0] === theme);

    if (existingIdx >= 0) {
      // Update existing Incubator entry
      const row         = data[existingIdx];
      const prevCount   = parseInt(row[3]) || 0;
      const prevAvg     = parseFloat(row[4]) || 0;
      const newCount    = prevCount + 1;
      const newAvg      = parseFloat(((prevAvg * prevCount + score) / newCount).toFixed(4));
      const sheetRow    = existingIdx + 2;

      sheet.getRange(sheetRow, 2).setValue(sessionUid);   // First_Seen (keep original)
      sheet.getRange(sheetRow, 3).setValue(sessionUid);   // Last_Seen
      sheet.getRange(sheetRow, 4).setValue(newCount);
      sheet.getRange(sheetRow, 5).setValue(newAvg);
      // Status stays INCUBATING until promoted

      data[existingIdx][2] = sessionUid;
      data[existingIdx][3] = newCount;
      data[existingIdx][4] = newAvg;
    } else {
      // New theme — add to Incubator
      sheet.appendRow([theme, sessionUid, sessionUid, 1, score.toFixed(4), 'INCUBATING']);
      data.push([theme, sessionUid, sessionUid, 1, score, 'INCUBATING']);
    }

    logged.push(theme);
    console.log(`[Incubator] Logged: ${theme} (score: ${score})`);
  });

  return logged;
}

/**
 * Scans the Incubator for themes that meet promotion criteria and promotes
 * them by adding a new column to VECTOR_MATRIX and marking them PROMOTED.
 *
 * Promotion criteria (both must pass):
 *   - Session_Count >= VR_CFG.PROMOTION_MIN_SESSIONS
 *   - Avg_Weight    >= VR_CFG.PROMOTION_MIN_AVG_WEIGHT
 *
 * @param {Sheet} incubSheet  - INCUBATOR sheet
 * @param {Sheet} matrixSheet - VECTOR_MATRIX sheet
 * @returns {string[]} Names of themes promoted this call
 */
function _checkPromotionCandidates(incubSheet, matrixSheet) {
  const promoted = [];
  if (incubSheet.getLastRow() <= 1) return promoted;

  const data         = incubSheet.getRange(2, 1, incubSheet.getLastRow() - 1, 6).getValues();
  const matrixHeaders = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];

  data.forEach((row, i) => {
    const theme       = row[0];
    const sessionCount = parseInt(row[3]) || 0;
    const avgWeight   = parseFloat(row[4]) || 0;
    const status      = row[5];

    if (status === 'PROMOTED') return; // Already promoted
    if (sessionCount < VR_CFG.PROMOTION_MIN_SESSIONS) return;
    if (avgWeight    < VR_CFG.PROMOTION_MIN_AVG_WEIGHT) return;
    if (matrixHeaders.includes(theme)) return; // Already a column

    // Add new column to VECTOR_MATRIX header row
    const newColIndex = matrixSheet.getLastColumn() + 1;
    matrixSheet.getRange(1, newColIndex).setValue(theme);

    // Backfill existing rows with 0 (no historical data)
    if (matrixSheet.getLastRow() > 1) {
      matrixSheet.getRange(2, newColIndex, matrixSheet.getLastRow() - 1, 1)
                 .setValue(0);
    }

    // Mark as promoted in Incubator
    incubSheet.getRange(i + 2, 6).setValue('PROMOTED');

    promoted.push(theme);
    VR_CFG.KNOWN_VECTORS.push(theme); // Add to runtime taxonomy
    console.log(`[Incubator→Matrix] PROMOTED: ${theme} (sessions: ${sessionCount}, avg: ${avgWeight})`);
  });

  return promoted;
}


// ══════════════════════════════════════════════════════════════
// VECTOR DOC ROUTING (replaces executeVectorRouting)
// ══════════════════════════════════════════════════════════════

/**
 * Routes all themes above threshold to their VECTOR_ docs.
 * Uses the Matrix score (post-decay) for the routing decision,
 * not the raw CURATOR score — ensures only sustained high-weight
 * themes accumulate vector doc entries.
 *
 * @param {Object} payloadData    - Full CURATOR V5 JSON
 * @param {Object} knownWeights   - { THEME: score } for this session
 * @param {string} sessionUid
 * @param {string} timestamp
 * @returns {number} Count of vector docs written to
 */
function _routeToVectorDocs(payloadData, knownWeights, sessionUid, timestamp) {
  const props        = PropertiesService.getScriptProperties();
  const vectorFolderId = props.getProperty(VR_CFG.VECTOR_FOLDER_KEY);
  if (!vectorFolderId) {
    console.warn('[VectorRouter] ID_05_VECTOR_REPOSITORY missing — skipping doc routing.');
    return 0;
  }

  const vectorFolder = DriveApp.getFolderById(vectorFolderId);
  let   routedCount  = 0;

  Object.entries(knownWeights).forEach(([theme, score]) => {
    if (score <= VR_CFG.INCUBATOR_THRESHOLD) return; // Below minimum signal

    const docName  = 'VECTOR_' + theme.toUpperCase().trim();
    const existing = vectorFolder.getFilesByName(docName);
    const vectorDoc = existing.hasNext()
      ? DocumentApp.openById(existing.next().getId())
      : _vr_createDoc(docName, vectorFolder);

    const body = vectorDoc.getBody();

    // High-weight entry (above main threshold)
    if (score > 0.7) {
      body.appendParagraph(`\n[HIGH-WEIGHT SEED: ${timestamp} | ${sessionUid} | Score: ${score}]`)
          .setHeading(DocumentApp.ParagraphHeading.HEADING3);
      if (payloadData.session_summary) body.appendParagraph(payloadData.session_summary);
    } else {
      // Lower-weight signal — append brief note only
      body.appendParagraph(`[Signal: ${timestamp} | ${sessionUid} | Score: ${score}] — See SESSION_LOG for full summary.`);
    }

    routedCount++;
  });

  return routedCount;
}


// ══════════════════════════════════════════════════════════════
// STANDALONE MENU-CALLABLE UTILITIES
// ══════════════════════════════════════════════════════════════

/**
 * Manually trigger a promotion check on the Incubator.
 * Useful after several sessions have been processed.
 */
function runPromotionCheck() {
  try {
    const ss          = _vr_getIndexSheet();
    const matrixSheet = _vr_getOrCreateSheet(ss, VR_CFG.VECTOR_MATRIX_SHEET);
    const incubSheet  = _vr_getOrCreateSheet(ss, VR_CFG.INCUBATOR_SHEET);
    const promoted    = _checkPromotionCandidates(incubSheet, matrixSheet);
    SpreadsheetApp.flush();

    const msg = promoted.length > 0
      ? `Promoted ${promoted.length} theme(s) to VECTOR_MATRIX:\n${promoted.map(t => '  • ' + t).join('\n')}`
      : `No themes met promotion criteria yet.\n\nCriteria: ≥${VR_CFG.PROMOTION_MIN_SESSIONS} sessions AND avg weight ≥${VR_CFG.PROMOTION_MIN_AVG_WEIGHT}`;

    DocumentApp.getUi().alert('Incubator Promotion Check', msg, DocumentApp.getUi().ButtonSet.OK);
  } catch (e) {
    DocumentApp.getUi().alert('❌ Promotion Check Failed', e.toString(), DocumentApp.getUi().ButtonSet.OK);
  }
}

/**
 * Shows the current state of all known vectors and Incubator candidates.
 * Diagnostic tool — no data is modified.
 */
function dumpVectorState() {
  const ui = DocumentApp.getUi();
  try {
    const ss          = _vr_getIndexSheet();
    const matrixSheet = _vr_getOrCreateSheet(ss, VR_CFG.VECTOR_MATRIX_SHEET);
    const incubSheet  = _vr_getOrCreateSheet(ss, VR_CFG.INCUBATOR_SHEET);
    const lines       = [];

    lines.push('── VECTOR_MATRIX (last session) ──');
    if (matrixSheet.getLastRow() > 1) {
      const headers  = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];
      const lastRow  = matrixSheet.getRange(matrixSheet.getLastRow(), 1, 1, matrixSheet.getLastColumn()).getValues()[0];
      headers.slice(2).forEach((h, i) => {
        lines.push(`  ${String(h).padEnd(25)} ${lastRow[i + 2]}`);
      });
    } else {
      lines.push('  No sessions processed yet.');
    }

    lines.push('\n── INCUBATOR (all candidates) ──');
    if (incubSheet.getLastRow() > 1) {
      const incubData = incubSheet.getRange(2, 1, incubSheet.getLastRow() - 1, 6).getValues();
      incubData.forEach(r => {
        lines.push(`  ${String(r[0]).padEnd(25)} sessions: ${r[3]}  avg: ${r[4]}  status: ${r[5]}`);
      });
    } else {
      lines.push('  Incubator is empty.');
    }

    lines.push(`\nDecay factor: ${VR_CFG.DECAY_FACTOR} | Promotion: ≥${VR_CFG.PROMOTION_MIN_SESSIONS} sessions, avg ≥${VR_CFG.PROMOTION_MIN_AVG_WEIGHT}`);

    ui.alert('Vector State Diagnostic', lines.join('\n'), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Dump Failed', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Returns the formatted SESSION_VECTOR_PRIMER from the most recent
 * VECTOR_MATRIX row for injection into the LLM system prompt at startup.
 * Call this instead of getStartupPrimer() in the main script once
 * Vector_Router.gs is the active routing engine.
 *
 * @returns {string} Formatted calibration block for prompt injection
 */
function getVectorPrimer() {
  try {
    const ss          = _vr_getIndexSheet();
    const matrixSheet = _vr_getOrCreateSheet(ss, VR_CFG.VECTOR_MATRIX_SHEET);

    if (matrixSheet.getLastRow() <= 1) {
      console.log('[VectorRouter] No sessions in VECTOR_MATRIX. Returning cold start.');
      return '';
    }

    const headers  = matrixSheet.getRange(1, 1, 1, matrixSheet.getLastColumn()).getValues()[0];
    const lastRow  = matrixSheet.getRange(matrixSheet.getLastRow(), 1, 1, matrixSheet.getLastColumn()).getValues()[0];
    const sessionUid = lastRow[0];
    const timestamp  = lastRow[1];

    let block = '\n\n[🧠 VECTOR_MATRIX — STARTUP CALIBRATION]\n';
    block    += `Last Session: ${sessionUid} | ${timestamp}\n`;
    block    += 'Decayed Vector Scores:\n';

    headers.slice(2).forEach((h, i) => {
      const score = parseFloat(lastRow[i + 2]) || 0;
      block += `  ${String(h).padEnd(25)} ${score.toFixed(4)}\n`;
    });

    block += '[END CALIBRATION — Use these weights to bias session inference]\n';
    return block;

  } catch (e) {
    console.error('[VectorRouter] getVectorPrimer failed: ' + e.toString());
    return '';
  }
}


// ══════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ══════════════════════════════════════════════════════════════

function _vr_getIndexSheet() {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty('INDEX_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (_) {}
  }
  const files = DriveApp.getFilesByName(VR_CFG.INDEX_NAME);
  if (!files.hasNext()) throw new Error('BRAIN_TRUST_INDEX not found. Run Deploy first.');
  const ss = SpreadsheetApp.openById(files.next().getId());
  props.setProperty('INDEX_ID', ss.getId());
  return ss;
}

function _vr_getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);

  const headerMap = {
    [VR_CFG.VECTOR_MATRIX_SHEET]: ['Session_UID', 'Timestamp', ...VR_CFG.KNOWN_VECTORS, 'INCUBATOR_SIGNALS'],
    [VR_CFG.INCUBATOR_SHEET]:     ['Theme', 'First_Seen', 'Last_Seen', 'Session_Count', 'Avg_Weight', 'Status'],
  };
  const headers = headerMap[name] || ['Timestamp', 'Data'];
  sheet.appendRow(headers);
  sheet.getRange('1:1').setFontWeight('bold').setBackground('#d5e8f0');
  sheet.setFrozenRows(1);
  return sheet;
}

function _vr_createDoc(docName, folder) {
  const doc = DocumentApp.create(docName);
  doc.getBody().appendParagraph(docName).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).moveTo(folder);
  return DocumentApp.openById(DriveApp.getFilesByName(docName).next().getId());
}

// ============================================================
// END VECTOR_ROUTER.GS
// Companion: RTP_REFINERY_DEPLOYER.gs CI 2.3
// To activate: replace executeVectorRouting() calls with routeVectorWeights()
// ============================================================
