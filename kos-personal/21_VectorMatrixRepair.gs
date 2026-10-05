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
 *   UNREBUILDABLE ROWS. A row the rederive had to keep (no classify parts,
 *   or one missing) still holds the old carried-forward values.
 *   resetUnrebuildableRows() removes it and queues the session to be
 *   classified again from its CuratorInput text, the backfill's source, so
 *   a fresh row lands when the parts come back.
 *
 * None of these touches the Curator's ledgers. A duplicate session's chunks that
 * were already processed stay in CURRENT_STATE and the other docs; only
 * the matrix and the queue are corrected.
 */

const VMR_LOG_UID_RE = /^LOG-(?:\d{12,}-)?([0-9a-f]{8})$/;
const VMR_ROW_UID_RE = /^(LOG-.+?)_(?:CH\d+|VC\d+of\d+)$/;
const VMR_IN_FLIGHT = ['STUDIO_ACTIVE', 'FLOW_COMPLETE'];
const VMR_TIME_BUDGET_MS = 5 * 60 * 1000;
// The status a reset gives a session's old classify part rows. They move to
// STAGING_ARCHIVE under it, so neither the rederive nor the reset reads
// them again (both take PROCESSED parts only); the new parts reuse their
// UIDs, and a row left in STAGING_PIPELINE would be matched first.
const VMR_SUPERSEDED = 'SUPERSEDED';

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

    // A copy whose staging rows were archived (archiveStagingPipeline moves
    // finished rows out) can still have a VECTOR_MATRIX row, and is still
    // counted in Vector State. Seen 2026-10-03: edd1075a, cd01a44e and
    // 79edf49b were missing from the first live preview. Add each matrix
    // session the staging scan didn't see, with no rows to mark.
    Object.keys(inMatrix).forEach(function (uid) {
      if (sessions[uid]) return;
      const h = VMR_LOG_UID_RE.exec(uid);
      if (!h) return;
      const epoch = /^LOG-(\d{12,})-/.exec(uid);
      sessions[uid] = { sessionUid: uid, hash: h[1], rows: [], processed: 0, inFlight: 0,
        firstAt: epoch ? Number(epoch[1]) : Infinity, duplicate: false };
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
      PropertiesService.getScriptProperties().setProperty(CFG.PROP.VM_LAST_DEDUPE_AT, new Date().toISOString());
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
  const budgetMs = VMR_TIME_BUDGET_MS;
  const props = PropertiesService.getScriptProperties();
  // Sessions an earlier, unfinished apply already rebuilt. Reading part docs
  // is slow (about 20 seconds a session on the live account), so a large
  // matrix takes several runs; each run writes what it rebuilt and resumes.
  const done = {};
  try {
    JSON.parse(props.getProperty(CFG.PROP.VM_REDERIVE_DONE) || '[]').forEach(function (u) { done[u] = true; });
  } catch (_) {}
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

    // Each session's classify part docs, from STAGING_PIPELINE and STAGING_ARCHIVE.
    const parts = _vmrSessionParts_(ss);

    const dates = _vmSessionDates_(ss);
    const kept = [];
    let rebuilt = 0;
    let changed = 0;
    let timedOut = false;
    let alreadyDone = 0;
    const rebuiltUids = [];
    const out = current.map(function (r) {
      const uid = String(r[0]).trim();
      const entry = { r: r, t: _vmSessionTime_(uid, dates, r[1]) };
      if (done[uid]) {
        alreadyDone++;
        return entry;
      }
      if (timedOut || Date.now() - started > budgetMs || (opts.maxRows != null && rebuilt >= opts.maxRows)) {
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
      rebuiltUids.push(uid);
      const differs = themes.some(function (t, k) {
        return Math.abs((parseFloat(r[2 + k]) || 0) - row[2 + k]) > 0.00005;
      });
      if (differs) changed++;
      entry.r = row;
      return entry;
    });

    out.sort(function (a, b) { return a.t - b.t; });
    const reordered = out.some(function (e, i) { return String(e.r[0]).trim() !== String(current[i][0]).trim(); });

    if (apply) {
      matrix.getRange(2, 1, out.length, lastCol).setValues(out.map(function (e) { return e.r; }));
      const extra = matrix.getLastRow() - 1 - out.length;
      if (extra > 0) matrix.deleteRows(out.length + 2, extra);
      SpreadsheetApp.flush();
      if (timedOut) {
        // Keep what this run rebuilt; the next run starts after it.
        props.setProperty(CFG.PROP.VM_REDERIVE_DONE, JSON.stringify(Object.keys(done).concat(rebuiltUids)));
      } else {
        props.deleteProperty(CFG.PROP.VM_REDERIVE_DONE);
        props.setProperty(CFG.PROP.VM_REDERIVE_KEPT, String(kept.length));
        props.setProperty(CFG.PROP.VM_REDERIVE_KEPT_UIDS, JSON.stringify(kept));
        props.setProperty(CFG.PROP.VM_LAST_REDERIVE_AT, new Date().toISOString());
      }
    }

    const remaining = kept.filter(function (k) { return k.reason === 'TIME_BUDGET'; }).length;
    if (timedOut) {
      const message = (apply
        ? 'Rebuilt ' + rebuilt + ' row(s) this run and wrote them (' + (alreadyDone + rebuilt) + ' of ' +
          current.length + ' done); ' + remaining + ' left. Run applyVectorMatrixRederive() again to continue.'
        : 'DRY RUN, stopped at the ' + Math.round(budgetMs / 60000) + '-minute budget after ' + rebuilt +
          ' row(s) (' + changed + ' with changed scores); ' + remaining + ' not read. ' +
          'applyVectorMatrixRederive() works through them across several runs.');
      console.log('[Rederive] ' + message);
      kept.forEach(function (k) { if (k.reason !== 'TIME_BUDGET') console.log('[Rederive]   kept ' + k.sessionUid + ': ' + k.reason); });
      return { apply: apply, rebuilt: rebuilt, changed: changed, kept: kept, alreadyDone: alreadyDone,
        remaining: remaining, finished: false, message: message };
    }

    const message = (apply ? 'Rewrote' : 'DRY RUN, would rewrite') + ' VECTOR_MATRIX: ' + rebuilt + ' of ' +
      current.length + ' row(s) rebuilt from their classify parts' +
      (alreadyDone ? ' (and ' + alreadyDone + ' rebuilt by earlier runs)' : '') + ', ' + changed + ' with changed scores' +
      (kept.length ? ', ' + kept.length + ' kept as they are' : '') +
      (reordered ? ', rows put in session date order' : '') + '.';
    console.log('[Rederive] ' + message);
    kept.forEach(function (k) { console.log('[Rederive]   kept ' + k.sessionUid + ': ' + k.reason); });
    return { apply: apply, rebuilt: rebuilt, changed: changed, kept: kept, alreadyDone: alreadyDone,
      remaining: 0, finished: true, reordered: reordered, message: message };
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ================================================================
// UNREBUILDABLE ROWS
// ================================================================

function previewUnrebuildableReset() {
  return resetUnrebuildableRows({ apply: false });
}

function applyUnrebuildableReset() {
  return resetUnrebuildableRows({ apply: true });
}

/**
 * Also removes the rows of sessions whose text is gone (NO_SOURCE), without
 * queueing them; Vector State then simply has no row for them.
 */
function dropUnrebuildableRowsWithoutSource() {
  return resetUnrebuildableRows({ apply: true, dropWithoutSource: true });
}

/**
 * Finds the VECTOR_MATRIX rows that can't be rebuilt from classify parts
 * and, for each, removes the row and queues the session to be classified
 * again. A row is unrebuildable when its session has no complete set of
 * PROCESSED part rows (live or archived), when the last finished rederive
 * kept it (that also covers a part doc that wouldn't parse), or when it is
 * named in opts.uids (a full session UID or its 8-character hash).
 *
 * Per session, in one go: the new parts are queued from the session's
 * CuratorInput text (every chunk, 1..N, must be there); only if that worked
 * are the old part rows moved to STAGING_ARCHIVE as SUPERSEDED, its
 * VectorClassifyParts rows cleared and its matrix row removed. Like the
 * backfill, a run queues at most VCS_BACKFILL_BATCH sessions and none while
 * classify parts are still in flight.
 *
 * @param {{apply?: boolean, uids?: string[], dropWithoutSource?: boolean}} opts
 * @returns {{apply, candidates: Object[], requeued: string[], dropped: string[], message: string}}
 */
function resetUnrebuildableRows(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const lock = apply ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(10000)) {
    return { apply: apply, candidates: [], requeued: [], dropped: [],
      message: 'Another pipeline run holds the script lock. Nothing changed; try again in a minute.' };
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const matrix = ss.getSheetByName(CFG.VECTOR_MATRIX_SHEET);
    const inMatrix = matrix ? _vcsMatrixSessions_(ss) : {};
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const SC = CFG.STAGING_COLS;
    const stagingRows = staging.getLastRow() > 1 ? staging.getRange(2, 1, staging.getLastRow() - 1, 7).getValues() : [];

    // Why each matrix session is a candidate.
    const reasons = {};
    const parts = _vmrSessionParts_(ss);
    Object.keys(inMatrix).forEach(function (uid) {
      if (_rqIsTestUid_(uid) || !/^LOG-/.test(uid)) return;
      const p = parts[uid];
      if (!p) { reasons[uid] = 'NO_PARTS'; return; }
      for (let n = 1; n <= p.of; n++) {
        if (!p.files[n]) { reasons[uid] = 'PART_MISSING: part ' + n + ' of ' + p.of; return; }
      }
    });
    let keptByRederive = [];
    try { keptByRederive = JSON.parse(props.getProperty(CFG.PROP.VM_REDERIVE_KEPT_UIDS) || '[]'); } catch (_) {}
    keptByRederive.forEach(function (k) {
      if (inMatrix[k.sessionUid] && !reasons[k.sessionUid]) reasons[k.sessionUid] = 'KEPT_BY_REDERIVE: ' + k.reason;
    });
    (opts.uids || []).forEach(function (u) {
      const want = String(u).trim();
      Object.keys(inMatrix).forEach(function (uid) {
        const h = VMR_LOG_UID_RE.exec(uid);
        if ((uid === want || (h && h[1] === want)) && !reasons[uid]) reasons[uid] = 'NAMED';
      });
    });

    // Where each candidate stands.
    const inFlightBySession = {};
    let inFlight = 0;
    stagingRows.forEach(function (r) {
      const p = _vcsParsePartUid_(String(r[SC.PAYLOAD_UID] || '').trim());
      if (p && VCS_IN_FLIGHT.indexOf(String(r[SC.STATUS]).trim()) !== -1) {
        inFlight++;
        inFlightBySession[p.sessionUid] = true;
      }
    });
    const source = _vmrSourceIndex_(ss, stagingRows);
    const candidates = Object.keys(reasons).sort().map(function (uid) {
      const c = { sessionUid: uid, reason: reasons[uid] };
      if (inFlightBySession[uid]) { c.plan = 'SKIP'; c.detail = 'IN_FLIGHT: its parts are at Studio'; return c; }
      const text = _vmrSessionText_(source, uid);
      if (!text.ok) { c.plan = opts.dropWithoutSource ? 'DROP' : 'NO_SOURCE'; c.detail = text.reason; return c; }
      c.plan = 'REQUEUE';
      c._text = text.text;
      c.chunks = text.chunks;
      c.parts = _semanticChunker(text.text, VCS_PART_MAX_CHARS).filter(function (x) { return x.trim(); }).length;
      return c;
    });

    const room = inFlight > 0 ? 0 : VCS_BACKFILL_BATCH;
    const toQueue = candidates.filter(function (c) { return c.plan === 'REQUEUE'; }).slice(0, room);
    const toDrop = candidates.filter(function (c) { return c.plan === 'DROP'; });
    const requeued = [];
    const dropped = [];

    if (apply && (toQueue.length || toDrop.length)) {
      const partsSheet = ss.getSheetByName(VCS_PARTS_TAB);
      let rawFolder = null;
      if (toQueue.length) {
        const rawId = props.getProperty('ID_00_RAW_EXHAUST');
        if (!rawId) throw new Error('ID_00_RAW_EXHAUST not set. Run deployFullSystem().');
        rawFolder = DriveApp.getFolderById(rawId);
      }
      toQueue.forEach(function (c) {
        // The old part rows, found before the new ones are appended under the same UIDs.
        const oldRows = [];
        staging.getRange(2, 1, Math.max(staging.getLastRow() - 1, 1), 7).getValues().forEach(function (r, i) {
          const p = _vcsParsePartUid_(String(r[SC.PAYLOAD_UID] || '').trim());
          if (p && p.sessionUid === c.sessionUid) oldRows.push(i + 2);
        });
        c.queuedParts = _queueClassifyParts_(c._text, c.sessionUid, rawFolder, staging);
        if (!c.queuedParts) { c.plan = 'QUEUE_FAILED'; c.detail = 'no part doc could be created; see ERROR_LOG'; return; }
        _vmrSupersedeParts_(ss, staging, oldRows, c.sessionUid);
        if (partsSheet) _vcsDeleteSessionParts_(partsSheet, c.sessionUid);
        _vmrDeleteMatrixRow_(matrix, c.sessionUid);
        requeued.push(c.sessionUid);
      });
      toDrop.forEach(function (c) {
        if (partsSheet) _vcsDeleteSessionParts_(partsSheet, c.sessionUid);
        _vmrDeleteMatrixRow_(matrix, c.sessionUid);
        dropped.push(c.sessionUid);
      });
      SpreadsheetApp.flush();

      // The primer's "could not be rebuilt" flag counts these; drop the ones handled.
      const handled = {};
      requeued.concat(dropped).forEach(function (u) { handled[u] = true; });
      const stillKept = keptByRederive.filter(function (k) { return !handled[k.sessionUid]; });
      if (props.getProperty(CFG.PROP.VM_REDERIVE_KEPT) != null) {
        props.setProperty(CFG.PROP.VM_REDERIVE_KEPT, String(stillKept.length));
        props.setProperty(CFG.PROP.VM_REDERIVE_KEPT_UIDS, JSON.stringify(stillKept));
      }
      if (requeued.length) props.setProperty(CFG.PROP.VC_LAST_BACKFILL_AT, new Date().toISOString());
    }

    const waiting = candidates.filter(function (c) { return c.plan === 'REQUEUE'; }).length - toQueue.length;
    const noSource = candidates.filter(function (c) { return c.plan === 'NO_SOURCE'; }).length;
    const message = (apply
      ? 'Removed ' + (requeued.length + dropped.length) + ' VECTOR_MATRIX row(s): ' + requeued.length +
        ' re-queued for classification' + (dropped.length ? ', ' + dropped.length + ' dropped without a requeue' : '')
      : 'DRY RUN: ' + candidates.length + ' row(s) cannot be rebuilt; ' + toQueue.length + ' would be removed and re-queued' +
        (toDrop.length ? ', ' + toDrop.length + ' removed without a requeue' : '')) +
      (waiting > 0 ? '; ' + waiting + ' more after this batch' : '') +
      (inFlight > 0 ? '. ' + inFlight + ' classify part(s) are still in flight: wait for them to finish, then run again' : '') +
      (noSource ? '. ' + noSource + ' have no complete CuratorInput text and stay as they are ' +
        '(dropUnrebuildableRowsWithoutSource() removes them)' : '') + '.';
    console.log('[Reset] ' + message);
    candidates.forEach(function (c) {
      console.log('[Reset]   ' + c.sessionUid + ' (' + c.reason + '): ' + c.plan +
        (c.plan === 'REQUEUE' ? ', ' + c.chunks + ' chunk(s) → ' + c.parts + ' part(s)' : '') +
        (c.detail ? ', ' + c.detail : ''));
    });
    candidates.forEach(function (c) { delete c._text; });
    return { apply: apply, candidates: candidates, requeued: requeued, dropped: dropped, inFlight: inFlight, message: message };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * What a session's text can be rebuilt from: CuratorInput's text per chunk
 * UID, and the highest chunk number each session is known to have (its
 * SESSION_LOG rows, live or archived, and the intake's "N chunk(s) created"
 * note), so a session missing its last chunks isn't taken as whole.
 */
function _vmrSourceIndex_(ss, stagingRows) {
  const SC = CFG.STAGING_COLS;
  const text = {};
  const curator = ss.getSheetByName(CI_CURATOR_TAB);
  if (curator && curator.getLastRow() > 1) {
    curator.getRange(2, 1, curator.getLastRow() - 1, Object.keys(CI_COLS).length).getValues().forEach(function (r) {
      const uid = String(r[CI_COLS.PAYLOAD_UID] || '').trim();
      if (uid && String(r[CI_COLS.SOURCE_TEXT] || '').trim()) text[uid] = String(r[CI_COLS.SOURCE_TEXT]);
    });
  }
  const maxChunk = {};
  const seen = function (uid) {
    const m = /^(.+)_CH(\d+)$/.exec(String(uid || '').trim());
    if (m) maxChunk[m[1]] = Math.max(maxChunk[m[1]] || 0, parseInt(m[2], 10));
  };
  stagingRows.forEach(function (r) { seen(r[SC.PAYLOAD_UID]); });
  const archive = ss.getSheetByName('STAGING_ARCHIVE');
  if (archive && archive.getLastRow() > 1) {
    archive.getRange(2, 2 + SC.PAYLOAD_UID, archive.getLastRow() - 1, 1).getValues().forEach(function (r) { seen(r[0]); });
  }
  Object.keys(text).forEach(seen);
  const intake = _vcsIntakeChunkCounts_(ss);
  Object.keys(intake).forEach(function (uid) { maxChunk[uid] = Math.max(maxChunk[uid] || 0, intake[uid]); });
  return { text: text, maxChunk: maxChunk };
}

/** { ok, text, chunks } for one session, or { ok: false, reason }. */
function _vmrSessionText_(source, sessionUid) {
  const n = source.maxChunk[sessionUid] || 0;
  if (!n) return { ok: false, reason: 'NO_SOURCE: no chunk of this session in CuratorInput or STAGING' };
  const missing = [];
  const parts = [];
  for (let i = 1; i <= n; i++) {
    const uid = sessionUid + '_CH' + (i < 10 ? '0' : '') + i;
    if (source.text[uid] == null) missing.push(i); else parts.push(source.text[uid]);
  }
  if (missing.length) {
    return { ok: false, reason: 'NO_SOURCE: no CuratorInput text for chunk(s) ' + missing.join(',') + ' of ' + n };
  }
  return { ok: true, text: parts.join('\n\n'), chunks: n };
}

/**
 * Moves a session's old classify part rows (sheet rows, found before the
 * new parts were queued) to STAGING_ARCHIVE as SUPERSEDED, and marks its
 * already-archived PROCESSED part rows SUPERSEDED too, so no later rederive
 * mixes the old split's parts with the new one's.
 */
function _vmrSupersedeParts_(ss, staging, sheetRows, sessionUid) {
  const SC = CFG.STAGING_COLS;
  let archive = ss.getSheetByName('STAGING_ARCHIVE');
  if (!archive) {
    archive = ss.insertSheet('STAGING_ARCHIVE');
    archive.appendRow(['Archived_At', 'Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count']);
  } else if (archive.getLastRow() > 1) {
    const rows = archive.getRange(2, 1, archive.getLastRow() - 1, 8).getValues();
    rows.forEach(function (r, i) {
      const p = _vcsParsePartUid_(String(r[1 + SC.PAYLOAD_UID] || '').trim());
      if (p && p.sessionUid === sessionUid && String(r[1 + SC.STATUS]).trim() === 'PROCESSED') {
        archive.getRange(i + 2, 2 + SC.STATUS).setValue(VMR_SUPERSEDED);
      }
    });
  }
  const now = new Date();
  sheetRows.slice().sort(function (a, b) { return b - a; }).forEach(function (row) {
    const r = staging.getRange(row, 1, 1, 7).getValues()[0];
    r[SC.STATUS] = VMR_SUPERSEDED;
    archive.appendRow([now].concat(r));
    staging.deleteRow(row);
  });
}

function _vmrDeleteMatrixRow_(matrix, sessionUid) {
  if (!matrix || matrix.getLastRow() <= 1) return;
  const uids = matrix.getRange(2, 1, matrix.getLastRow() - 1, 1).getValues();
  for (let i = uids.length - 1; i >= 0; i--) {
    if (String(uids[i][0]).trim() === sessionUid) matrix.deleteRow(i + 2);
  }
}

/**
 * { sessionUid: { of, files: { part: fileId } } } from every PROCESSED
 * classify part row, in STAGING_PIPELINE and in STAGING_ARCHIVE.
 * archiveStagingPipeline() moves PROCESSED rows out, so a session whose
 * parts finished before an archive run has some or all of them only in the
 * archive; their docs are still there. A live row wins over an archived
 * one for the same part. Parts from a different split (another part count)
 * than the session's live rows are ignored.
 */
function _vmrSessionParts_(ss) {
  const SC = CFG.STAGING_COLS;
  const parts = {};
  const add = function (rows, offset, live) {
    rows.forEach(function (r) {
      const p = _vcsParsePartUid_(String(r[offset + SC.PAYLOAD_UID] || '').trim());
      if (!p || String(r[offset + SC.STATUS]).trim() !== 'PROCESSED') return;
      const fileId = String(r[offset + SC.FILE_ID] || '').trim();
      if (!fileId) return;
      let s = parts[p.sessionUid];
      if (!s) s = parts[p.sessionUid] = { of: p.of, files: {}, live: live };
      if (s.of !== p.of) {
        // An archived split that doesn't match the live one is stale; two
        // archived splits: keep the larger, which is the later backfill.
        if (s.live || p.of < s.of) return;
        s.of = p.of; s.files = {};
      }
      if (!s.files[p.part]) s.files[p.part] = fileId;
    });
  };
  const staging = ss.getSheetByName(CFG.STAGING_SHEET);
  if (staging && staging.getLastRow() > 1) add(staging.getRange(2, 1, staging.getLastRow() - 1, 7).getValues(), 0, true);
  const archive = ss.getSheetByName('STAGING_ARCHIVE');
  if (archive && archive.getLastRow() > 1) add(archive.getRange(2, 1, archive.getLastRow() - 1, 8).getValues(), 1, false);
  return parts;
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
