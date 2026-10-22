/**
 * ================================================================
 * 19_StagingRequeue.gs — KOS v8.0
 * BOUND TO: kos-personal (main flat-folder project)
 * ================================================================
 *
 * Puts terminal STUDIO_TIMEOUT / AUDIT_REJECTED rows back through the
 * Curator (or Classify) Flow, in small batches, dry-run first.
 *
 * WHY HAND-EDITING THE STATUS CELL IS NOT ENOUGH. A row's state is spread
 * across five places, and a requeue that fixes only STAGING_PIPELINE
 * times out again:
 *
 *   1. STAGING_PIPELINE Status / Retry_Count. Reset to PENDING_FLOW / 0,
 *      so the queue's MAX_RETRIES budget starts fresh.
 *   2. The Turnstile's Script Properties: the release map, the audit-retry
 *      priority set, the stale-deprioritize set and the stale-reset counts. Stale entries would
 *      misorder the release or misjudge staleness.
 *   3. The row's CuratorInput / VectorClassifyInput row. The Flow only
 *      fires on a NEW input row. buildStudioInputRows() now replaces an
 *      input row built before the row's latest release, but it needs the
 *      release map to tell, and step 2 clears that entry; so the old row
 *      is removed here and the builder reads the restored doc instead.
 *   4. Its STUDIO_RETURN rows. _srGetHarvestedPayloadText_() reads the
 *      FIRST return row for a UID, so an old FAILED row would shadow the
 *      new answer. The harvest's doc-written breadcrumb is cleared too.
 *   5. The source doc itself. A successful harvest overwrites the doc
 *      with the model's output BEFORE the audit gate runs, so an
 *      audit-rejected row's doc no longer holds its transcript.
 *      Re-inferring it would curate the Curator's own output. The input
 *      row's SourceText is the doc as it was when materialized (a chunk
 *      is at most CFG.MAX_CHUNK_SIZE chars, well inside a cell), so the
 *      doc is restored from it whenever the two differ. A row whose doc
 *      looks like model output and has no SourceText to restore from is
 *      skipped as SOURCE_LOST, never requeued.
 *
 * AUDIT_LOG is left alone: it is the accountability record. One side
 * effect: if a requeued row later times out for real, the Turnstile still
 * labels it AUDIT_REJECTED, because its UID is in AUDIT_LOG.
 *
 * BATCHING. A batch tops the in-flight count (PENDING_FLOW, STUDIO_ACTIVE,
 * FLOW_COMPLETE) up to RQ_BATCH_SIZE, so running it again before the last
 * batch drains adds nothing. The Sept 10-14 error burst came from draining
 * 235 rows at once.
 *
 * DO NOT RUN THIS until fresh returns harvest cleanly
 * (checkStudioFlowBinding(), see STUDIO_REBIND_HANDOFF.md). Requeuing into
 * a Flow that still answers in persona prose reproduces the same failures
 * and spends each row's retries doing it.
 *
 * ENTRY POINTS (no trailing underscore, so they show in the Run dropdown):
 *   previewStagingRequeue() — dry run: what the next batch would change.
 *   requeueStagingBatch()   — apply one batch.
 *   requeueStagingRows(opts) — the same, with options:
 *     { apply: bool, limit: number, statuses: [..], uids: [..] }
 *     `uids` requeues exactly those rows (still terminal-status only).
 *
 * WEB APP (Queue tab, UX audit 2026-10-22): the "Failed" tile used to be a
 * number with no rows behind it, and requeue was editor-only.
 *   getFailedQueueRows()        — every failed row, with whether it can be retried.
 *   previewRetryFailedRow(uid)  — requeueStagingRows dry run for one UID.
 *   retryFailedRow(uid)         — the same, applied.
 * Both retry calls go through requeueStagingRows({uids: [uid]}), so the
 * five-place reset above is the only requeue path; nothing here edits a
 * status cell itself.
 */

const RQ_BATCH_SIZE = 10;
const RQ_STATUSES = ['STUDIO_TIMEOUT', 'AUDIT_REJECTED'];
const RQ_IN_FLIGHT = ['PENDING_FLOW', 'STUDIO_ACTIVE', 'FLOW_COMPLETE'];
// Fixture and canary rows are never requeued. Built inside a function, not
// as a top-level const: the two prefixes live in other files, and a
// top-level reference would depend on the order GAS loads files in.
function _rqIsTestUid_(uid) {
  return [SR_FIXTURE_UID_PREFIX, CI_FIXTURE_UID_PREFIX, 'CANARY-']
    .some(function (p) { return uid.indexOf(p) === 0; });
}

/** Dry run of the next batch. Changes nothing. */
function previewStagingRequeue() {
  return requeueStagingRows({ apply: false });
}

/** Applies one batch of up to RQ_BATCH_SIZE rows. */
function requeueStagingBatch() {
  return requeueStagingRows({ apply: true });
}

/**
 * @param {{apply?: boolean, limit?: number, statuses?: string[], uids?: string[]}} opts
 * @returns {{apply: boolean, eligible: Object<string, number>, inFlight: number,
 *            selected: number, remaining: number, rows: Object[], message: string}}
 */
function requeueStagingRows(opts) {
  opts = opts || {};
  const apply    = opts.apply === true;
  const limit    = Math.max(0, Number(opts.limit != null ? opts.limit : RQ_BATCH_SIZE));
  const statuses = opts.statuses || RQ_STATUSES;
  const onlyUids = opts.uids ? opts.uids.map(String) : null;

  const lock = apply ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(10000)) {
    const busy = { apply: apply, busy: true, eligible: {}, inFlight: 0, selected: 0, remaining: 0, rows: [],
      message: 'Another pipeline run holds the script lock. Nothing changed; try again in a minute.' };
    console.log('[Requeue] ' + busy.message);
    return busy;
  }

  try {
    const ss       = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging  = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const curator  = _getOrCreateSheet(ss, CI_CURATOR_TAB);
    const classify = _getOrCreateSheet(ss, CI_CLASSIFY_TAB);
    const returns  = _getOrCreateSheet(ss, SR_SHEET);
    const SC = CFG.STAGING_COLS;

    const data = staging.getLastRow() > 1
      ? staging.getRange(2, 1, staging.getLastRow() - 1, 7).getValues()
      : [];

    const eligible = {};
    const candidates = [];
    let inFlight = 0;
    for (let i = 0; i < data.length; i++) {
      const status = String(data[i][SC.STATUS]).trim();
      const uid    = String(data[i][SC.PAYLOAD_UID] || '').trim();
      if (RQ_IN_FLIGHT.indexOf(status) !== -1) { inFlight++; continue; }
      if (statuses.indexOf(status) === -1 || !uid) continue;
      if (_rqIsTestUid_(uid)) continue;
      if (onlyUids && onlyUids.indexOf(uid) === -1) continue;
      eligible[status] = (eligible[status] || 0) + 1;
      candidates.push(i);
    }

    // A named-UID requeue is deliberate and bounded by its own list; a
    // default batch only tops the in-flight count up to `limit`.
    const room = onlyUids ? limit : Math.max(0, limit - inFlight);
    const inputIndex  = { curator: _rqIndexRows_(curator, CI_COLS.PAYLOAD_UID),
                          classify: _rqIndexRows_(classify, CI_COLS.PAYLOAD_UID) };
    const returnIndex = _rqIndexRows_(returns, SR_COLS.PAYLOAD_UID);

    const rows = [];
    let selected = 0;
    for (let c = 0; c < candidates.length && selected < room; c++) {
      const i        = candidates[c];
      const uid      = String(data[i][SC.PAYLOAD_UID]).trim();
      const type     = String(data[i][SC.PAYLOAD_TYPE] || '').trim();
      const fileId   = String(data[i][SC.FILE_ID] || '').trim();
      const isClassify = type === 'VECTOR_CLASSIFY';
      const inputSheetName = isClassify ? CI_CLASSIFY_TAB : CI_CURATOR_TAB;
      const inputRows  = (isClassify ? inputIndex.classify : inputIndex.curator)[uid] || [];
      const returnRows = returnIndex[uid] || [];

      const plan = {
        sheetRow: i + 2, uid: uid, type: type, status: String(data[i][SC.STATUS]).trim(),
        retryCount: Number(data[i][SC.RETRY_COUNT]) || 0,
        action: 'REQUEUE', reason: '', restoreDoc: false,
        inputSheet: inputSheetName, inputRowsRemoved: inputRows.length,
        returnRowsRemoved: returnRows.length,
      };

      const sheetForInput = isClassify ? classify : curator;
      const sourceText = inputRows.length
        ? String(sheetForInput.getRange(inputRows[inputRows.length - 1], CI_COLS.SOURCE_TEXT + 1).getValue())
        : null;

      let docText = null;
      try {
        docText = DocumentApp.openById(fileId).getBody().getText();
      } catch (e) {
        plan.action = 'SKIP';
        plan.reason = 'DOC_UNREADABLE: ' + e.message;
      }

      if (plan.action === 'REQUEUE') {
        if (sourceText !== null && sourceText !== '') {
          plan.restoreDoc = _rqNormalize_(docText) !== _rqNormalize_(sourceText);
        } else if (/^[{\[]/.test(String(docText).trim())) {
          plan.action = 'SKIP';
          plan.reason = 'SOURCE_LOST: the doc holds model output and there is no ' +
            inputSheetName + ' SourceText to restore it from';
        }
      }

      if (plan.action === 'REQUEUE') {
        selected++;
        plan._inputRowNums  = inputRows;
        plan._returnRowNums = returnRows;
        plan._fileId        = fileId;
        plan._sourceText    = sourceText;
      }
      rows.push(plan);
    }

    if (apply) _rqApply_(staging, curator, classify, returns, rows);

    const total = candidates.length;
    const remaining = total - (apply ? selected : 0);
    const message = (apply ? 'Requeued ' : 'DRY RUN, would requeue ') + selected + ' of ' + total +
      ' eligible row(s) ' + JSON.stringify(eligible) + '; ' + inFlight + ' already in flight' +
      (rows.length > selected ? '; ' + (rows.length - selected) + ' skipped' : '') +
      (!onlyUids && room === 0 && total > 0
        ? '. Batch is full: wait for the in-flight rows to finish, then run again.' : '.');

    console.log('[Requeue] ' + message);
    rows.forEach(function (p) {
      console.log('[Requeue]   row ' + p.sheetRow + ' ' + p.uid + ' (' + p.type + ', ' + p.status +
        ', retries ' + p.retryCount + '): ' +
        (p.action === 'SKIP' ? 'SKIP, ' + p.reason
          : 'PENDING_FLOW/0' + (p.restoreDoc ? ', restore doc from ' + p.inputSheet : '') +
            ', remove ' + p.inputRowsRemoved + ' ' + p.inputSheet + ' + ' +
            p.returnRowsRemoved + ' STUDIO_RETURN row(s)'));
    });

    return {
      apply: apply, eligible: eligible, inFlight: inFlight, selected: selected,
      remaining: remaining, message: message,
      rows: rows.map(function (p) {
        const out = {};
        Object.keys(p).forEach(function (k) { if (k.charAt(0) !== '_') out[k] = p[k]; });
        return out;
      }),
    };
  } finally {
    if (lock) lock.releaseLock();
  }
}

// The web app lists at most this many failed rows; `total` still counts all.
const RQ_FAILED_LIST_CAP = 100;

/**
 * Every STAGING_PIPELINE row whose status starts with a
 * TERMINAL_FAILED_STATUSES prefix (5_Error_And_Utilities.gs), for the
 * Queue tab's failed list. Read-only.
 *
 * `status` is the matched prefix; `detail` is anything after it (an
 * INTAKE_ERROR / PROCESSING_ERROR status carries ': <message>').
 * `canRetry` is true only for a row requeueStagingRows() would consider:
 * an exact RQ_STATUSES status, a UID, and not a fixture or canary row.
 * Other failed statuses have no requeue path; the list says so.
 *
 * @returns {{success: boolean, total: number, byStatus: Object<string, number>,
 *            rows: Object[], message?: string}}
 */
function getFailedQueueRows() {
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const SC      = CFG.STAGING_COLS;
    const last    = staging.getLastRow();
    const data    = last > 1 ? staging.getRange(2, 1, last - 1, 7).getValues() : [];

    const rows = [];
    const byStatus = {};
    let total = 0;
    data.forEach(function (r) {
      const raw  = String(r[SC.STATUS]).trim();
      const code = TERMINAL_FAILED_STATUSES.filter(function (p) { return raw.indexOf(p) === 0; })[0];
      if (!code) return;
      total++;
      byStatus[code] = (byStatus[code] || 0) + 1;
      if (rows.length >= RQ_FAILED_LIST_CAP) return;
      const uid = String(r[SC.PAYLOAD_UID] || '').trim();
      const ts  = r[SC.TIMESTAMP];
      rows.push({
        uid:      uid,
        type:     String(r[SC.PAYLOAD_TYPE] || ''),
        status:   code,
        detail:   raw.slice(code.length).replace(/^[:\s]+/, ''),
        url:      String(r[SC.DOC_URL] || ''),
        retries:  Number(r[SC.RETRY_COUNT]) || 0,
        // google.script.run drops Date values; send a string.
        addedAt:  (ts && typeof ts.toISOString === 'function') ? ts.toISOString() : String(ts || ''),
        canRetry: RQ_STATUSES.indexOf(raw) !== -1 && !!uid && !_rqIsTestUid_(uid),
      });
    });
    return { success: true, total: total, byStatus: byStatus, rows: rows };
  } catch (e) {
    _reportError('getFailedQueueRows', e, null);
    return { success: false, total: 0, byStatus: {}, rows: [], message: e.message };
  }
}

/** Dry run of a retry for one failed row. Changes nothing. */
function previewRetryFailedRow(uid) {
  return _rqRetryOne_(uid, false);
}

/** Retries one failed row through requeueStagingRows(). */
function retryFailedRow(uid) {
  return _rqRetryOne_(uid, true);
}

/**
 * Runs requeueStagingRows({uids: [uid], limit: 1}) and words the result for
 * the web app.
 *
 * @returns {{success: boolean, canRetry: boolean, applied: boolean,
 *            restoreDoc?: boolean, busy?: boolean, message: string}}
 */
function _rqRetryOne_(uid, apply) {
  const id = String(uid || '').trim();
  if (!id) return { success: false, canRetry: false, applied: false, message: 'No item was named.' };
  try {
    const r = requeueStagingRows({ apply: apply, uids: [id], limit: 1 });
    if (r.busy) {
      return { success: true, busy: true, canRetry: false, applied: false,
        message: 'The system is busy with another run. Nothing changed; try again in a minute.' };
    }
    const p = r.rows[0];
    if (!p) {
      return { success: true, canRetry: false, applied: false,
        message: 'This item can\'t be retried from here. Only items that timed out or failed the ' +
          'quality check can be, and it may already be back in the queue. Tap Refresh queue.' };
    }
    if (p.action === 'SKIP') {
      const lost = p.reason.indexOf('SOURCE_LOST') === 0;
      return { success: true, canRetry: false, applied: false,
        message: lost
          ? 'Its doc now holds the AI\'s answer and no copy of the original was saved, so a retry ' +
            'would give the AI its own answer. It can\'t be retried from here.'
          : 'Its doc can\'t be opened, so it can\'t be retried. Check that the doc still exists.' };
    }
    if (apply) {
      return { success: true, canRetry: true, applied: true, restoreDoc: p.restoreDoc,
        message: 'Back in the queue with its retries reset. Google\'s AI flow picks it up on its next pass.' };
    }
    return { success: true, canRetry: true, applied: false, restoreDoc: p.restoreDoc,
      message: 'A retry puts it back in the queue with its retries reset to 0 and clears its earlier AI answers.' +
        (p.restoreDoc ? ' Its doc is put back to the original text first.' : '') +
        ' If Google\'s AI flow is still failing, it will fail the same way again.' };
  } catch (e) {
    _reportError(apply ? 'retryFailedRow' : 'previewRetryFailedRow', e, null);
    return { success: false, canRetry: false, applied: false, message: e.message };
  }
}

/**
 * Applies the planned requeues. Order matters: the doc and the side rows
 * are fixed before the staging row goes back to PENDING_FLOW, so the
 * Turnstile can never release a row whose old input row still exists.
 */
function _rqApply_(staging, curator, classify, returns, rows) {
  const SC = CFG.STAGING_COLS;
  const todo = rows.filter(function (p) { return p.action === 'REQUEUE'; });
  if (!todo.length) return;

  todo.forEach(function (p) {
    if (p.restoreDoc) _srOverwriteDocBody_(p._fileId, p._sourceText);
  });

  const curatorDeletes = [], classifyDeletes = [], returnDeletes = [];
  todo.forEach(function (p) {
    const target = p.inputSheet === CI_CLASSIFY_TAB ? classifyDeletes : curatorDeletes;
    p._inputRowNums.forEach(function (n) { target.push(n); });
    p._returnRowNums.forEach(function (n) { returnDeletes.push(n); });
  });
  _rqDeleteRows_(curator, curatorDeletes);
  _rqDeleteRows_(classify, classifyDeletes);
  _rqDeleteRows_(returns, returnDeletes);

  const released     = _readReleaseMap();
  const priority     = _readAuditRetryPrioritySet_();
  const deprioritize = _readStaleDeprioritizeSet_();
  const docWritten   = _srReadDocWrittenMap_();
  const staleCounts  = _readTurnstileStaleCounts_();
  todo.forEach(function (p) {
    delete released[p.uid];
    delete priority[p.uid];
    delete deprioritize[p.uid];
    delete docWritten[p.uid];
    delete staleCounts[p.uid];
  });
  _writeReleaseMap(released);
  _writeAuditRetryPrioritySet_(priority);
  _writeStaleDeprioritizeSet_(deprioritize);
  _srSaveDocWrittenMap_(docWritten);
  _writeTurnstileStaleCounts_(staleCounts);

  todo.forEach(function (p) {
    staging.getRange(p.sheetRow, SC.STATUS + 1).setValue('PENDING_FLOW');
    staging.getRange(p.sheetRow, SC.RETRY_COUNT + 1).setValue(0);
  });
  SpreadsheetApp.flush();
}

/** { uid: [sheetRow, ...] } for one tab, in sheet order. */
function _rqIndexRows_(sheet, uidCol) {
  const index = {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return index;
  sheet.getRange(2, uidCol + 1, lastRow - 1, 1).getValues().forEach(function (r, i) {
    const uid = String(r[0] || '').trim();
    if (!uid) return;
    (index[uid] = index[uid] || []).push(i + 2);
  });
  return index;
}

/** Deletes rows bottom-up so earlier row numbers stay valid. */
function _rqDeleteRows_(sheet, rowNums) {
  rowNums.slice().sort(function (a, b) { return b - a; })
    .forEach(function (n) { sheet.deleteRow(n); });
}

function _rqNormalize_(text) {
  return String(text == null ? '' : text).replace(/\r\n/g, '\n').trim();
}
