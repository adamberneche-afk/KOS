/**
 * ================================================================
 * 21_VectorMatrixRepair.gs — KOS v8.0
 * BOUND TO: kos-personal (main flat-folder project)
 * ================================================================
 *
 * Phase 0 of the RTP notebook plan
 * (rtp-core-router/notebook-plan/04_MIGRATION_AND_TEST_PLAN.md): the
 * Gem's Vector State comes from VECTOR_MATRIX, so the matrix has to be
 * right before anything briefs from it. Two repairs, each a preview
 * first and an apply second, the same shape as the staging requeue:
 *
 *   DUPLICATE SESSIONS. Older session UIDs were LOG-{epoch}-{hash}, the
 *   hash taken from the log's text, so the same log pasted twice became
 *   two sessions with the same hash and different epochs (the epoch was
 *   dropped from new UIDs; see _generateLogUUID()). Both copies were
 *   chunked, curated and classified, and each counted on its own in the
 *   matrix. findDuplicateSessions() keeps one session per hash and marks
 *   every STAGING_PIPELINE row of the others DUPLICATE, which no part of
 *   the pipeline picks up again, and removes their VECTOR_MATRIX rows.
 *
 *   REDERIVED ROWS. _writeMatrixRow() used to fill a theme a session
 *   didn't score with DECAY_FACTOR × the previous row's value, and the
 *   previous row was a different session. rederiveVectorMatrix() rebuilds
 *   every row it can from the session's own classify parts (each part's
 *   doc still holds its classification JSON), with 0 for a theme the
 *   session didn't score, and writes the rows in session date order.
 *
 * Neither touches the Curator's ledgers. A duplicate session's chunks that
 * were already processed stay in CURRENT_STATE and the other docs; only
 * the matrix and the queue are corrected.
 */

const VMR_LOG_UID_RE = /^LOG-(?:\d{12,}-)?([0-9a-f]{8})$/;
const VMR_ROW_UID_RE = /^(LOG-.+?)_(?:CH\d+|VC\d+of\d+)$/;
const VMR_IN_FLIGHT = ['STUDIO_ACTIVE', 'FLOW_COMPLETE'];
const VMR_TIME_BUDGET_MS = 5 * 60 * 1000;

// ================================================================
// DUPLICATE SESSIONS
// ================================================================

function previewDuplicateSessions() {
  return findDuplicateSessions({ apply: false });
}

function applyDuplicateSessions() {
  return findDuplicateSessions({ apply: true });
}

/**
 * Groups sessions by the content hash in their UID and keeps one per
 * group: the one with a VECTOR_MATRIX row, then the one with the most
 * PROCESSED chunks, then the earliest. A group with a copy in flight at
 * Studio (STUDIO_ACTIVE, FLOW_COMPLETE) is left for a later run.
 *
 * @param {{apply?: boolean}} opts
 * @returns {{apply: boolean, groups: Object[], marked: number, matrixRowsRemoved: number, message: string}}
 */
function findDuplicateSessions(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const lock = apply ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(10000)) {
    return { apply: apply, groups: [], marked: 0, matrixRowsRemoved: 0,
      message: 'Another pipeline run holds the script lock. Nothing changed; try again in a minute.' };
  }
  try {
    const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const matrix = ss.getSheetByName(CFG.VECTOR_MATRIX_SHEET);
    const SC = CFG.STAGING_COLS;
    const data = staging.getLastRow() > 1
      ? staging.getRange(2, 1, staging.getLastRow() - 1, 7).getValues()
      : [];

    const inMatrix = matrix ? _vcsMatrixSessions_(ss) : {};
    const sessions = {};
    data.forEach(function (r, i) {
      const m = VMR_ROW_UID_RE.exec(String(r[SC.PAYLOAD_UID] || '').trim());
      if (!m) return;
      const h = VMR_LOG_UID_RE.exec(m[1]);
      if (!h) return;
      const s = sessions[m[1]] = sessions[m[1]] ||
        { sessionUid: m[1], hash: h[1], rows: [], processed: 0, inFlight: 0, firstAt: Infinity, duplicate: false };
      const status = String(r[SC.STATUS]).trim();
      s.rows.push(i + 2);
      if (status === 'PROCESSED' && /_CH\d+$/.test(String(r[SC.PAYLOAD_UID]).trim())) s.processed++;
      if (VMR_IN_FLIGHT.indexOf(status) !== -1) s.inFlight++;
      if (status === 'DUPLICATE') s.duplicate = true;
      const t = new Date(r[SC.TIMESTAMP]).getTime();
      if (!isNaN(t) && t < s.firstAt) s.firstAt = t;
    });

    const byHash = {};
    Object.keys(sessions).forEach(function (k) {
      const s = sessions[k];
      (byHash[s.hash] = byHash[s.hash] || []).push(s);
    });

    const groups = [];
    Object.keys(byHash).forEach(function (hash) {
      const copies = byHash[hash];
      if (copies.length < 2) return;
      copies.sort(function (a, b) {
        return (Number(!!inMatrix[b.sessionUid]) - Number(!!inMatrix[a.sessionUid])) ||
          (b.processed - a.processed) || (a.firstAt - b.firstAt);
      });
      const keep = copies[0];
      const drop = copies.slice(1).filter(function (s) { return !s.duplicate || inMatrix[s.sessionUid]; });
      if (!drop.length) return;
      const busy = drop.filter(function (s) { return s.inFlight > 0; });
      groups.push({
        hash: hash,
        keep: keep.sessionUid,
        drop: drop.map(function (s) { return s.sessionUid; }),
        rowsToMark: drop.reduce(function (n, s) { return n + s.rows.length; }, 0),
        matrixRowsToRemove: drop.filter(function (s) { return inMatrix[s.sessionUid]; }).length,
        skipped: busy.length ? 'IN_FLIGHT: ' + busy.map(function (s) { return s.sessionUid; }).join(', ') +
          ' is at Studio; run again once it finishes' : '',
        _drop: drop,
      });
    });

    let marked = 0;
    let removed = 0;
    if (apply) {
      const dropUids = {};
      groups.forEach(function (g) {
        if (g.skipped) return;
        g._drop.forEach(function (s) {
          s.rows.forEach(function (row) {
            staging.getRange(row, SC.STATUS + 1).setValue('DUPLICATE');
            marked++;
          });
          dropUids[s.sessionUid] = true;
        });
      });
      if (matrix && matrix.getLastRow() > 1) {
        const uids = matrix.getRange(2, 1, matrix.getLastRow() - 1, 1).getValues();
        for (let i = uids.length - 1; i >= 0; i--) {
          if (dropUids[String(uids[i][0]).trim()]) { matrix.deleteRow(i + 2); removed++; }
        }
      }
      const partsSheet = ss.getSheetByName(VCS_PARTS_TAB);
      if (partsSheet) Object.keys(dropUids).forEach(function (uid) { _vcsDeleteSessionParts_(partsSheet, uid); });
    }

    groups.forEach(function (g) { delete g._drop; });
    const ready = groups.filter(function (g) { return !g.skipped; });
    const message = (apply ? 'Marked ' + marked + ' row(s) DUPLICATE and removed ' + removed +
      ' VECTOR_MATRIX row(s)' : 'DRY RUN: ' + ready.length + ' duplicate group(s) would be resolved, ' +
      ready.reduce(function (n, g) { return n + g.rowsToMark; }, 0) + ' row(s) marked DUPLICATE, ' +
      ready.reduce(function (n, g) { return n + g.matrixRowsToRemove; }, 0) + ' VECTOR_MATRIX row(s) removed') +
      (groups.length > ready.length ? '; ' + (groups.length - ready.length) + ' group(s) skipped (in flight)' : '') + '.';
    console.log('[Duplicates] ' + message);
    groups.forEach(function (g) {
      console.log('[Duplicates]   ' + g.hash + ': keep ' + g.keep + ', ' +
        (g.skipped ? 'SKIP, ' + g.skipped : 'drop ' + g.drop.join(', ') + ' (' + g.rowsToMark +
          ' row(s), ' + g.matrixRowsToRemove + ' matrix row(s))'));
    });
    return { apply: apply, groups: groups, marked: marked, matrixRowsRemoved: removed, message: message };
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ================================================================
// REDERIVED ROWS
// ================================================================

function previewVectorMatrixRederive() {
  return rederiveVectorMatrix({ apply: false });
}

function applyVectorMatrixRederive() {
  return rederiveVectorMatrix({ apply: true });
}

/**
 * Rebuilds VECTOR_MATRIX from each session's classify parts, in session
 * date order. A session whose parts can't all be read keeps its current
 * row (listed as kept); nothing is written unless every part doc was
 * reached within the time budget.
 *
 * @param {{apply?: boolean}} opts
 * @returns {{apply: boolean, rebuilt: number, changed: number, kept: Object[], message: string}}
 */
function rederiveVectorMatrix(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const started = Date.now();
  const lock = apply ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(10000)) {
    return { apply: apply, rebuilt: 0, changed: 0, kept: [],
      message: 'Another pipeline run holds the script lock. Nothing changed; try again in a minute.' };
  }
  try {
    const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrix = ss.getSheetByName(CFG.VECTOR_MATRIX_SHEET);
    if (!matrix || matrix.getLastRow() <= 1) {
      return { apply: apply, rebuilt: 0, changed: 0, kept: [], message: 'VECTOR_MATRIX has no rows.' };
    }
    const lastCol = matrix.getLastColumn();
    const headers = matrix.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    if (headers.length < 5 || headers[lastCol - 2] !== 'INCUBATOR_SIGNALS' || headers[lastCol - 1] !== 'CHECKSUM') {
      return { apply: apply, rebuilt: 0, changed: 0, kept: [],
        message: 'VECTOR_MATRIX headers must end INCUBATOR_SIGNALS, CHECKSUM. Run migrateVectorSchema_v2() first.' };
    }
    const themes = headers.slice(2, -2);
    const current = matrix.getRange(2, 1, matrix.getLastRow() - 1, lastCol).getValues()
      .filter(function (r) { return String(r[0] || '').trim(); });

    // Each session's classify part docs, from STAGING_PIPELINE.
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const SC = CFG.STAGING_COLS;
    const parts = {};
    if (staging.getLastRow() > 1) {
      staging.getRange(2, 1, staging.getLastRow() - 1, 7).getValues().forEach(function (r) {
        const p = _vcsParsePartUid_(String(r[SC.PAYLOAD_UID] || '').trim());
        if (!p || String(r[SC.STATUS]).trim() !== 'PROCESSED') return;
        const s = parts[p.sessionUid] = parts[p.sessionUid] || { of: p.of, files: {} };
        s.files[p.part] = String(r[SC.FILE_ID] || '').trim();
      });
    }

    const dates = _vmSessionDates_(ss);
    const kept = [];
    let rebuilt = 0;
    let changed = 0;
    let timedOut = false;
    const out = current.map(function (r) {
      const uid = String(r[0]).trim();
      const entry = { r: r, t: _vmSessionTime_(uid, dates, r[1]) };
      if (timedOut || Date.now() - started > VMR_TIME_BUDGET_MS) {
        timedOut = true;
        kept.push({ sessionUid: uid, reason: 'TIME_BUDGET' });
        return entry;
      }
      const exchanges = _vmrReadSessionExchanges_(parts[uid]);
      if (!exchanges.ok) {
        kept.push({ sessionUid: uid, reason: exchanges.reason });
        return entry;
      }
      const known = _aggregateSentenceVectors_(exchanges.list).known;
      const row = _buildMatrixRow_(themes, known, uid, r[1]).row;
      rebuilt++;
      const differs = themes.some(function (t, k) {
        return Math.abs((parseFloat(r[2 + k]) || 0) - row[2 + k]) > 0.00005;
      });
      if (differs) changed++;
      entry.r = row;
      return entry;
    });

    out.sort(function (a, b) { return a.t - b.t; });
    const reordered = out.some(function (e, i) { return String(e.r[0]).trim() !== String(current[i][0]).trim(); });

    if (apply && timedOut) {
      return { apply: apply, rebuilt: rebuilt, changed: changed, kept: kept,
        message: 'Stopped at the ' + (VMR_TIME_BUDGET_MS / 60000) + '-minute budget before reading every part doc. ' +
          'Nothing was written; run applyVectorMatrixRederive() again.' };
    }
    if (apply) {
      matrix.getRange(2, 1, out.length, lastCol).setValues(out.map(function (e) { return e.r; }));
      const extra = matrix.getLastRow() - 1 - out.length;
      if (extra > 0) matrix.deleteRows(out.length + 2, extra);
      SpreadsheetApp.flush();
    }

    const message = (apply ? 'Rewrote' : 'DRY RUN, would rewrite') + ' VECTOR_MATRIX: ' + rebuilt + ' of ' +
      current.length + ' row(s) rebuilt from their classify parts, ' + changed + ' with changed scores' +
      (kept.length ? ', ' + kept.length + ' kept as they are' : '') +
      (reordered ? ', rows put in session date order' : '') + '.';
    console.log('[Rederive] ' + message);
    kept.forEach(function (k) { console.log('[Rederive]   kept ' + k.sessionUid + ': ' + k.reason); });
    return { apply: apply, rebuilt: rebuilt, changed: changed, kept: kept, reordered: reordered, message: message };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/** Every part's exchange array for one session, read from the part docs. */
function _vmrReadSessionExchanges_(session) {
  if (!session) return { ok: false, reason: 'NO_PARTS: no PROCESSED classify parts in STAGING_PIPELINE' };
  let list = [];
  for (let n = 1; n <= session.of; n++) {
    const fileId = session.files[n];
    if (!fileId) return { ok: false, reason: 'PART_MISSING: part ' + n + ' of ' + session.of };
    let parsed;
    try {
      const raw = DocumentApp.openById(fileId).getBody().getText().trim();
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch (e) {
      return { ok: false, reason: 'PART_UNREADABLE: part ' + n + ': ' + e.message };
    }
    if (!Array.isArray(parsed)) return { ok: false, reason: 'PART_NOT_ARRAY: part ' + n };
    list = list.concat(parsed);
  }
  return { ok: true, list: list };
}
