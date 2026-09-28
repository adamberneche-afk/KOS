/**
 * ================================================================
 * 20_VectorClassifySessions.gs — KOS v8.0
 * BOUND TO: kos-personal (main flat-folder project)
 * ================================================================
 *
 * Gives every real session exactly one VECTOR_MATRIX row. Before this, no
 * code path queued a VECTOR_CLASSIFY row for a real session, so
 * VECTOR_MATRIX held only the install fixtures (STUDIO_INTEGRATION_SPEC.md's
 * "Open integration question").
 *
 * WHY THE SESSION IS CLASSIFIED IN PARTS. A whole session does not fit
 * through the Flow. A Sheets cell holds 50,000 characters, the input rides
 * in one VectorClassifyInput cell and the output in one STUDIO_RETURN cell,
 * and the classifier's per-sentence JSON runs about twice the length of the
 * text it reads. So the session is split into parts of at most
 * VCS_PART_MAX_CHARS, each classified on its own, and Apps Script joins
 * them. That join is exact, not an approximation:
 * _aggregateSentenceVectors_() sums per-sentence scores over every exchange
 * and divides by the total, so classifying the parts and concatenating
 * their exchange arrays gives the same weights as classifying the whole
 * session at once. One row per session also matters for the matrix itself:
 * _writeMatrixRow() decays every theme a row doesn't score, so one row per
 * part would decay the session's absent themes once per part.
 *
 * THE SHAPE.
 *   Session UID  = the log's own UUID (LOG-xxxxxxxx), the same stem its
 *                  Curator chunks carry (LOG-xxxxxxxx_CH01, ...).
 *   Part UID     = LOG-xxxxxxxx_VC01of03. One STAGING_PIPELINE row per
 *                  part, Payload_Type VECTOR_CLASSIFY, each with its own doc
 *                  in the raw-exhaust folder. The part count is in the UID,
 *                  so nothing else has to record how many parts to expect.
 *   VectorClassifyParts tab = each finished part's exchange array, held
 *                  until the last part lands, then aggregated into one
 *                  VECTOR_MATRIX row under the session UID and removed.
 *                  Held here, not read back from STUDIO_RETURN, because
 *                  harvested return rows are pruned after 7 days and a
 *                  session's parts can finish further apart than that
 *                  (a requeue, say).
 *
 * A session's parts are queued all or nothing: if any part's doc fails to
 * create, none are queued, so a session is never left waiting on a part
 * that doesn't exist. The backfill below picks it up later.
 *
 * ENTRY POINTS (no trailing underscore, so they show in the Run dropdown):
 *   checkVectorClassifySessions()      — read-only: sessions with parts
 *                                        stored but still waiting on others.
 *   previewVectorClassifyBackfill()    — dry run of the next backfill batch.
 *   queueVectorClassifyBackfillBatch() — queue it.
 *   queueVectorClassifyBackfill(opts)  — { apply: bool, limit: number }.
 *
 * The backfill is for sessions ingested before this file existed. It reads
 * each session's text back from its CuratorInput rows, in chunk order, and
 * refuses to start a batch while an earlier batch's parts are still in
 * flight, so the queue never floods. VECTOR_MATRIX rows land in the order
 * sessions finish, so backfilled sessions append after whatever is already
 * there; run the backfill before new sessions arrive to keep the decay
 * baseline roughly chronological.
 */

const VCS_PART_MAX_CHARS = 8000;
const VCS_PARTS_TAB = 'VectorClassifyParts';
const VCS_PARTS_HEADERS = ['Stored_At', 'Session_UID', 'Part_UID', 'Part', 'Of', 'Exchanges_JSON'];
const VCS_PARTS_COLS = { STORED_AT: 0, SESSION_UID: 1, PART_UID: 2, PART: 3, OF: 4, EXCHANGES_JSON: 5 };
const VCS_BACKFILL_BATCH = 3;
const VCS_IN_FLIGHT = ['PENDING_FLOW', 'STUDIO_ACTIVE', 'FLOW_COMPLETE'];

// ================================================================
// UIDS
// ================================================================

function _vcsPad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function _vcsPartUid_(sessionUid, part, of) {
  return sessionUid + '_VC' + _vcsPad2_(part) + 'of' + _vcsPad2_(of);
}

/** { sessionUid, part, of } for a part UID, or null for any other UID. */
function _vcsParsePartUid_(uid) {
  const m = /^(.+)_VC(\d+)of(\d+)$/.exec(String(uid || '').trim());
  if (!m) return null;
  const part = parseInt(m[2], 10), of = parseInt(m[3], 10);
  if (!(part >= 1 && of >= 1 && part <= of)) return null;
  return { sessionUid: m[1], part: part, of: of };
}

// ================================================================
// QUEUE — called at intake (_chunkAndQueue) and by the backfill
// ================================================================

/**
 * Splits `text` into parts and queues one VECTOR_CLASSIFY staging row per
 * part. All or nothing: returns the number of parts queued, or 0 if any
 * part's doc could not be created (those docs are trashed again).
 */
function _queueClassifyParts_(text, sessionUid, rawFolder, staging) {
  const parts = _semanticChunker(String(text), VCS_PART_MAX_CHARS)
    .filter(function (p) { return p.trim(); });
  if (!parts.length) return 0;
  const of = parts.length;

  const docs = [];
  try {
    parts.forEach(function (partText, idx) {
      const doc = DocumentApp.create('[VC_' + _vcsPad2_(idx + 1) + 'of' + _vcsPad2_(of) + ']_' + sessionUid);
      const id = doc.getId();
      docs.push(id);
      doc.getBody().setText(partText);
      doc.saveAndClose();
      DriveApp.getFileById(id).moveTo(rawFolder);
    });
  } catch (e) {
    docs.forEach(function (id) {
      try { DriveApp.getFileById(id).setTrashed(true); } catch (_) {}
    });
    _reportError('_queueClassifyParts_:' + sessionUid, e, null);
    return 0;
  }

  let queued = 0;
  docs.forEach(function (id, idx) {
    const url = DriveApp.getFileById(id).getUrl();
    if (_queuePayload(_vcsPartUid_(sessionUid, idx + 1, of), 'VECTOR_CLASSIFY', url, id, staging)) queued++;
  });
  console.log('[VectorClassify] ' + sessionUid + ': queued ' + queued + ' part(s)');
  return queued;
}

// ================================================================
// COMPLETE — called by processInferenceQueue() for VECTOR_CLASSIFY rows
// ================================================================

/**
 * Handles one finished VECTOR_CLASSIFY row. A part row is stored; once the
 * session's last part is stored, all parts are aggregated into one
 * VECTOR_MATRIX row under the session UID. Any other VECTOR_CLASSIFY UID
 * (the install fixture) keeps the old one-row-one-matrix-row behavior.
 *
 * Idempotent: a part stored twice is replaced, and a session that already
 * has a VECTOR_MATRIX row is never written again.
 *
 * @returns {{status: string, message?: string, pending?: boolean}} the
 *   same status contract as processVectorClassificationPayload().
 */
function _processVectorClassifyPart_(exchanges, payloadUid, timestamp) {
  const p = _vcsParsePartUid_(payloadUid);
  if (!p) return processVectorClassificationPayload(JSON.stringify(exchanges), payloadUid, timestamp);

  if (!Array.isArray(exchanges)) {
    return { status: 'ERROR', message: 'Expected a top-level JSON array of exchanges.' };
  }

  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const partsSheet = _vcsPartsSheet_(ss);

  if (_vcsMatrixHasSession_(ss, p.sessionUid)) {
    _vcsDeleteSessionParts_(partsSheet, p.sessionUid);
    return { status: 'SUCCESS', message: 'Session ' + p.sessionUid + ' already classified.' };
  }

  _vcsUpsertPart_(partsSheet, p, payloadUid, JSON.stringify(exchanges));

  const stored = _vcsReadSessionParts_(partsSheet, p.sessionUid);
  const have = Object.keys(stored).length;
  if (have < p.of) {
    return { status: 'SUCCESS', pending: true,
      message: p.sessionUid + ': part ' + p.part + ' of ' + p.of + ' stored (' + have + ' so far).' };
  }

  let all = [];
  for (let n = 1; n <= p.of; n++) {
    if (!stored[n]) {
      return { status: 'ERROR', message: p.sessionUid + ': part ' + n + ' of ' + p.of + ' is missing.' };
    }
    all = all.concat(JSON.parse(stored[n]));
  }

  const result = processVectorClassificationPayload(JSON.stringify(all), p.sessionUid, timestamp);
  if (result.status === 'SUCCESS') {
    _vcsDeleteSessionParts_(partsSheet, p.sessionUid);
    console.log('[VectorClassify] ' + p.sessionUid + ': ' + p.of + ' part(s) aggregated into one VECTOR_MATRIX row');
  }
  return result;
}

// ================================================================
// PARTS TAB + MATRIX HELPERS
// ================================================================

function _vcsPartsSheet_(ss) {
  const sheet = _getOrCreateSheet(ss, VCS_PARTS_TAB);
  if (sheet.getLastRow() === 0) sheet.appendRow(VCS_PARTS_HEADERS);
  return sheet;
}

function _vcsPartRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, VCS_PARTS_HEADERS.length).getValues();
}

function _vcsUpsertPart_(sheet, p, partUid, json) {
  const rows = _vcsPartRows_(sheet);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][VCS_PARTS_COLS.PART_UID]).trim() === partUid) {
      sheet.getRange(i + 2, VCS_PARTS_COLS.EXCHANGES_JSON + 1).setValue(json);
      sheet.getRange(i + 2, VCS_PARTS_COLS.STORED_AT + 1).setValue(new Date());
      return;
    }
  }
  sheet.appendRow([new Date(), p.sessionUid, partUid, p.part, p.of, json]);
}

/** { partNumber: exchangesJson } for one session. */
function _vcsReadSessionParts_(sheet, sessionUid) {
  const out = {};
  _vcsPartRows_(sheet).forEach(function (r) {
    if (String(r[VCS_PARTS_COLS.SESSION_UID]).trim() !== sessionUid) return;
    out[Number(r[VCS_PARTS_COLS.PART])] = String(r[VCS_PARTS_COLS.EXCHANGES_JSON]);
  });
  return out;
}

function _vcsDeleteSessionParts_(sheet, sessionUid) {
  const rows = _vcsPartRows_(sheet);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][VCS_PARTS_COLS.SESSION_UID]).trim() === sessionUid) sheet.deleteRow(i + 2);
  }
}

function _vcsMatrixSessions_(ss) {
  const set = {};
  const sheet = ss.getSheetByName(CFG.VECTOR_MATRIX_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return set;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
    const uid = String(r[0] || '').trim();
    if (uid) set[uid] = true;
  });
  return set;
}

/** { sessionUid: chunkCount } from the intake's SESSION_LOG rows, where present. */
function _vcsIntakeChunkCounts_(ss) {
  const out = {};
  const sheet = ss.getSheetByName(CFG.SESSION_LOG_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues().forEach(function (r) {
    if (String(r[3]).trim() !== 'SENSOR_INTAKE') return;
    const m = /^(\d+) chunk\(s\) created/.exec(String(r[5]));
    if (m) out[String(r[0]).trim()] = parseInt(m[1], 10);
  });
  return out;
}

function _vcsMatrixHasSession_(ss, sessionUid) {
  return !!_vcsMatrixSessions_(ss)[sessionUid];
}

// ================================================================
// REPORT
// ================================================================

/**
 * Read-only. Lists sessions with some parts stored and others still
 * outstanding, and where each outstanding part's staging row stands, so a
 * part that died (STUDIO_TIMEOUT, FAILED_PARSE) is visible rather than
 * holding its session back silently. 19_StagingRequeue.gs requeues it:
 * STUDIO_TIMEOUT by default, any other status by passing opts.statuses.
 */
function checkVectorClassifySessions() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const partsSheet = _vcsPartsSheet_(ss);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const SC = CFG.STAGING_COLS;

  const statusByUid = {};
  if (staging.getLastRow() > 1) {
    staging.getRange(2, 1, staging.getLastRow() - 1, 7).getValues().forEach(function (r) {
      statusByUid[String(r[SC.PAYLOAD_UID]).trim()] = String(r[SC.STATUS]).trim();
    });
  }

  const sessions = {};
  _vcsPartRows_(partsSheet).forEach(function (r) {
    const sid = String(r[VCS_PARTS_COLS.SESSION_UID]).trim();
    const s = sessions[sid] = sessions[sid] || { sessionUid: sid, of: Number(r[VCS_PARTS_COLS.OF]), stored: [] };
    s.stored.push(Number(r[VCS_PARTS_COLS.PART]));
  });

  const report = Object.keys(sessions).map(function (sid) {
    const s = sessions[sid];
    const waiting = [];
    for (let n = 1; n <= s.of; n++) {
      if (s.stored.indexOf(n) !== -1) continue;
      const uid = _vcsPartUid_(sid, n, s.of);
      waiting.push({ uid: uid, status: statusByUid[uid] || 'NO_STAGING_ROW' });
    }
    // All parts stored but no matrix row: the final aggregation failed
    // (its row reads INTAKE_ERROR). Re-deliver any one part to retry it.
    return { sessionUid: sid, of: s.of, stored: s.stored.length, waiting: waiting,
      aggregationFailed: waiting.length === 0 };
  });

  console.log('[VectorClassify] ' + report.length + ' session(s) partly classified');
  report.forEach(function (s) {
    console.log('[VectorClassify]   ' + s.sessionUid + ': ' + s.stored + ' of ' + s.of + ' stored; ' +
      (s.aggregationFailed
        ? 'every part is in but aggregation failed. Fix the cause (see ERROR_LOG), then requeue ' +
          'one part: requeueStagingRows({apply: true, uids: [...], statuses: [<its status>]}).'
        : 'waiting on ' + s.waiting.map(function (w) { return w.uid + ' (' + w.status + ')'; }).join(', ')));
  });
  return report;
}

// ================================================================
// BACKFILL — sessions ingested before this file existed
// ================================================================

function previewVectorClassifyBackfill() {
  return queueVectorClassifyBackfill({ apply: false });
}

function queueVectorClassifyBackfillBatch() {
  return queueVectorClassifyBackfill({ apply: true });
}

/**
 * @param {{apply?: boolean, limit?: number}} opts
 * @returns {{apply: boolean, inFlight: number, eligible: number, selected: number,
 *            skipped: Object[], sessions: Object[], message: string}}
 */
function queueVectorClassifyBackfill(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const limit = Math.max(0, Number(opts.limit != null ? opts.limit : VCS_BACKFILL_BATCH));

  const ss       = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging  = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const curator  = _getOrCreateSheet(ss, CI_CURATOR_TAB);
  const SC = CFG.STAGING_COLS;
  const rows = staging.getLastRow() > 1
    ? staging.getRange(2, 1, staging.getLastRow() - 1, 7).getValues()
    : [];

  // Sessions from their SESSION_LOG chunk rows, and which already have parts.
  const sessions = {};
  const hasParts = {};
  let inFlight = 0;
  rows.forEach(function (r) {
    const uid = String(r[SC.PAYLOAD_UID] || '').trim();
    const type = String(r[SC.PAYLOAD_TYPE] || '').trim();
    const status = String(r[SC.STATUS]).trim();
    const part = _vcsParsePartUid_(uid);
    if (type === 'VECTOR_CLASSIFY' && part) {
      hasParts[part.sessionUid] = true;
      if (VCS_IN_FLIGHT.indexOf(status) !== -1) inFlight++;
      return;
    }
    const m = /^(.+)_CH(\d+)$/.exec(uid);
    if (type !== 'SESSION_LOG' || !m) return;
    const s = sessions[m[1]] = sessions[m[1]] || { sessionUid: m[1], chunks: [], firstAt: r[SC.TIMESTAMP] };
    s.chunks.push({ uid: uid, n: parseInt(m[2], 10) });
    if (new Date(r[SC.TIMESTAMP]) < new Date(s.firstAt)) s.firstAt = r[SC.TIMESTAMP];
  });

  const sourceByUid = {};
  if (curator.getLastRow() > 1) {
    curator.getRange(2, 1, curator.getLastRow() - 1, Object.keys(CI_COLS).length).getValues()
      .forEach(function (r) {
        sourceByUid[String(r[CI_COLS.PAYLOAD_UID]).trim()] = String(r[CI_COLS.SOURCE_TEXT]);
      });
  }
  const classified = _vcsMatrixSessions_(ss);
  const expectedChunks = _vcsIntakeChunkCounts_(ss);

  const ordered = Object.keys(sessions).map(function (k) { return sessions[k]; })
    .sort(function (a, b) { return new Date(a.firstAt) - new Date(b.firstAt); });

  const skipped = [];
  const eligible = [];
  ordered.forEach(function (s) {
    if (_rqIsTestUid_(s.sessionUid)) return;
    if (classified[s.sessionUid]) return skipped.push({ sessionUid: s.sessionUid, reason: 'ALREADY_CLASSIFIED' });
    if (hasParts[s.sessionUid])   return skipped.push({ sessionUid: s.sessionUid, reason: 'ALREADY_QUEUED' });
    s.chunks.sort(function (a, b) { return a.n - b.n; });
    // Every chunk must be here. Archived rows leave STAGING_PIPELINE, and
    // classifying the chunks that happen to remain would mark a partial
    // session done for good. Chunks run 1..N with no gaps, and N matches
    // the intake's own "N chunk(s) created" note when it has one.
    const expected = expectedChunks[s.sessionUid];
    const last = s.chunks[s.chunks.length - 1].n;
    const gapless = s.chunks.every(function (c, idx) { return c.n === idx + 1; });
    if (!gapless || (expected && expected !== last)) {
      return skipped.push({ sessionUid: s.sessionUid, reason: 'CHUNKS_INCOMPLETE: have ' +
        s.chunks.map(function (c) { return c.n; }).join(',') +
        (expected ? ' of ' + expected : '') + ' (some may be archived)' });
    }
    const missing = s.chunks.filter(function (c) { return !sourceByUid[c.uid]; });
    if (missing.length) {
      return skipped.push({ sessionUid: s.sessionUid, reason: 'SOURCE_INCOMPLETE: no CuratorInput text for ' +
        missing.map(function (c) { return c.uid; }).join(', ') });
    }
    s.text = s.chunks.map(function (c) { return sourceByUid[c.uid]; }).join('\n\n');
    eligible.push(s);
  });

  const room = inFlight > 0 ? 0 : limit;
  const batch = eligible.slice(0, room);
  const planned = batch.map(function (s) {
    return { sessionUid: s.sessionUid, chunks: s.chunks.length, chars: s.text.length,
      parts: _semanticChunker(s.text, VCS_PART_MAX_CHARS).filter(function (p) { return p.trim(); }).length };
  });

  let queuedSessions = 0;
  if (apply && batch.length) {
    const rawId = PropertiesService.getScriptProperties().getProperty('ID_00_RAW_EXHAUST');
    if (!rawId) throw new Error('ID_00_RAW_EXHAUST not set. Run deployFullSystem().');
    const rawFolder = DriveApp.getFolderById(rawId);
    batch.forEach(function (s, i) {
      planned[i].queuedParts = _queueClassifyParts_(s.text, s.sessionUid, rawFolder, staging);
      if (planned[i].queuedParts) queuedSessions++;
    });
    SpreadsheetApp.flush();
  }

  const message = (apply ? 'Queued ' + queuedSessions : 'DRY RUN, would queue ' + batch.length) +
    ' of ' + eligible.length + ' unclassified session(s); ' + skipped.length + ' skipped' +
    (inFlight > 0 ? '. ' + inFlight + ' part(s) from an earlier batch are still in flight: ' +
      'wait for them to finish, then run again.' : '.');
  console.log('[VectorClassify] backfill: ' + message);
  planned.forEach(function (p) {
    console.log('[VectorClassify]   ' + p.sessionUid + ': ' + p.chunks + ' chunk(s), ' + p.chars +
      ' chars → ' + p.parts + ' part(s)');
  });
  skipped.forEach(function (s) { console.log('[VectorClassify]   skip ' + s.sessionUid + ': ' + s.reason); });

  return { apply: apply, inFlight: inFlight, eligible: eligible.length, selected: batch.length,
    skipped: skipped, sessions: planned, message: message };
}
