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
 *      so the Turnstile's STUDIO_TIMEOUT ceiling starts fresh.
 *   2. The Turnstile's Script Properties: the release map, the audit-retry
 *      priority set and the stale-deprioritize set. Stale entries would
 *      misorder the release or misjudge staleness.
 *   3. The row's CuratorInput / VectorClassifyInput row.
 *      buildStudioInputRows() skips any UID it has materialized before,
 *      and the Flow only fires on a NEW input row, so while the old row
 *      exists the Flow never sees the requeued row, and it dies at the
 *      Turnstile again. (This is also why the audit gate's own
 *      revert-to-PENDING_FLOW retries all ran out on staleness.)
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
    const busy = { apply: apply, eligible: {}, inFlight: 0, selected: 0, remaining: 0, rows: [],
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
  todo.forEach(function (p) {
    delete released[p.uid];
    delete priority[p.uid];
    delete deprioritize[p.uid];
    delete docWritten[p.uid];
  });
  _writeReleaseMap(released);
  _writeAuditRetryPrioritySet_(priority);
  _writeStaleDeprioritizeSet_(deprioritize);
  _srSaveDocWrittenMap_(docWritten);

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
