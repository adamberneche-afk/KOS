/**
 * ================================================================
 * 22_BriefingDocs.gs — KOS v8.0
 * BOUND TO: kos-personal (main flat-folder project)
 * ================================================================
 *
 * Phase 1 of the RTP notebook plan
 * (rtp-core-router/notebook-plan/04_MIGRATION_AND_TEST_PLAN.md): the
 * Tier A notebook sources the pipeline writes, beside KOS_LATEST_PRIMER.
 * GAS is the only writer; the notebook syncs the docs and the RTP Gem
 * reads them (ADR-001).
 *
 *   KOS_RECENT_SESSIONS  the last few processed sessions' summaries, plus
 *                        any older session that still has an open decision.
 *   KOS_OPEN_DECISIONS   every DECISION_REGISTER row still OPEN.
 *   KOS_CORE_FACTS       the operator-pinned Core facts (ALIGNMENT
 *                        Threshold D) and the relational targets.
 *
 * Each doc keeps one Drive file ID and is overwritten in place, with a
 * generated-at stamp under its title (_writeStableDoc_ in 6_Governance.gs,
 * ADR-005b / ADR-006). generateDailyPrimer() calls generateBriefingDocs_()
 * every morning; generateBriefingDocs() runs it on demand.
 *
 * DECISION_REGISTER. Deferred decisions used to exist only as list items
 * appended to the CURRENT_STATE doc, with no way to mark one done. The
 * intake (processIntakePayload) now also records each one here as OPEN.
 * The operator closes one by setting its Status to RESOLVED or DROPPED in
 * the sheet, or with resolveDecision(). backfillDecisionRegister() reads
 * the decisions already in CURRENT_STATE into the register, once.
 */

const BD_RECENT_SESSIONS = 5;          // sessions shown in full in KOS_RECENT_SESSIONS
const BD_SUMMARY_MAX_CHARS = 1500;     // per session, across its chunks
const BD_OPEN_STATUS = 'OPEN';
const BD_CLOSED_STATUSES = ['RESOLVED', 'DROPPED'];

/** {Decision_ID: 0, Session_UID: 1, ...}, derived from the header list. */
function _bdCols_() {
  const cols = {};
  CFG.DECISION_REGISTER_HEADERS.forEach(function (h, i) { cols[h] = i; });
  return cols;
}

function _bdRegister_(ss) {
  return _getOrCreateSheet(ss, CFG.DECISION_REGISTER_SHEET);
}

function _bdRows_(sheet) {
  if (sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, CFG.DECISION_REGISTER_HEADERS.length).getValues();
}

// ================================================================
// DECISION_REGISTER — WRITES
// ================================================================

/**
 * Records a Curator payload's deferred decisions as OPEN rows. Called by
 * processIntakePayload() (3_Queue_Processor.gs), which holds the script
 * lock. Decision_ID is the payload uid plus the decision's position, and
 * an ID already in the register is skipped, so reprocessing a chunk
 * doesn't add its decisions twice.
 *
 * @param {Spreadsheet} ss
 * @param {string} uid       the payload's Session_UID (a chunk uid)
 * @param {string} ts        the intake's timestamp string
 * @param {Object[]} decisions  [{decision, owner, blocking}]
 * @returns {number} rows added
 */
function _recordDeferredDecisions_(ss, uid, ts, decisions) {
  if (!decisions || !decisions.length) return 0;
  const sheet = _bdRegister_(ss);
  const C = _bdCols_();
  const have = {};
  _bdRows_(sheet).forEach(function (r) { have[String(r[C.Decision_ID]).trim()] = true; });

  const rows = [];
  decisions.forEach(function (d, i) {
    const id = uid + '#' + (i + 1);
    if (have[id]) return;
    const row = CFG.DECISION_REGISTER_HEADERS.map(function () { return ''; });
    row[C.Decision_ID] = id;
    row[C.Session_UID] = uid;
    row[C.Recorded_At] = ts;
    row[C.Owner]       = String((d && d.owner) || 'unassigned');
    row[C.Decision]    = String((d && d.decision) || (typeof d === 'string' ? d : ''));
    row[C.Blocking]    = String((d && d.blocking) || 'unknown');
    row[C.Status]      = BD_OPEN_STATUS;
    rows.push(row);
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  return rows.length;
}

/**
 * Closes one decision. Editing the sheet's Status cell does the same; this
 * also stamps Resolved_At.
 *
 * @param {string} decisionId  e.g. 'LOG-1a2b3c4d_CH01#2'
 * @param {string} [note]
 * @param {string} [status]    RESOLVED (default) or DROPPED
 */
function resolveDecision(decisionId, note, status) {
  status = String(status || 'RESOLVED').toUpperCase();
  if (BD_CLOSED_STATUSES.indexOf(status) === -1) {
    return { success: false, message: 'Status must be one of ' + BD_CLOSED_STATUSES.join(', ') + '.' };
  }
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sheet = _bdRegister_(ss);
  const C = _bdCols_();
  const rows = _bdRows_(sheet);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][C.Decision_ID]).trim() !== String(decisionId).trim()) continue;
    const r = i + 2;
    sheet.getRange(r, C.Status + 1).setValue(status);
    sheet.getRange(r, C.Resolved_At + 1).setValue(
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'));
    if (note) sheet.getRange(r, C.Resolution_Note + 1).setValue(String(note));
    return { success: true, message: decisionId + ' marked ' + status + '.' };
  }
  return { success: false, message: 'No decision ' + decisionId + ' in ' + CFG.DECISION_REGISTER_SHEET + '.' };
}

// ================================================================
// DECISION_REGISTER — ONE-TIME BACKFILL FROM CURRENT_STATE
// ================================================================

function previewDecisionRegisterBackfill() {
  return backfillDecisionRegister({ apply: false });
}

function applyDecisionRegisterBackfill() {
  return backfillDecisionRegister({ apply: true });
}

/**
 * Reads the deferred decisions processIntakePayload() has appended to the
 * CURRENT_STATE doc, as
 *
 *   DEFERRED (<uid>):
 *   • [<owner>] <decision> — Blocking: <blocking>
 *
 * and records each in DECISION_REGISTER as OPEN, under the same
 * Decision_ID the intake would have given it (<uid>#<position>), so the
 * backfill and the intake never record one decision twice. All of them
 * come in OPEN: the doc has no record of which were settled, so review
 * the register after applying and resolve what is already done.
 *
 * @param {{apply?: boolean}} opts
 */
function backfillDecisionRegister(opts) {
  opts = opts || {};
  const apply = opts.apply === true;
  const stateId = PropertiesService.getScriptProperties().getProperty('ID_CURRENT_STATE');
  if (!stateId) throw new Error('ID_CURRENT_STATE not set. Run deployFullSystem().');

  const found = _bdParseDeferredDecisions_(DocumentApp.openById(stateId).getBody());
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sheet = _bdRegister_(ss);
  const C = _bdCols_();
  const have = {};
  _bdRows_(sheet).forEach(function (r) { have[String(r[C.Decision_ID]).trim()] = true; });

  let added = 0;
  let already = 0;
  const lock = apply ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(10000)) {
    return { apply: apply, found: found.length, added: 0, already: 0,
      message: 'Another pipeline run holds the script lock. Nothing changed; try again in a minute.' };
  }
  try {
    const bySession = {};
    found.forEach(function (f) { (bySession[f.uid] = bySession[f.uid] || []).push(f); });
    Object.keys(bySession).forEach(function (uid) {
      const list = bySession[uid];
      list.forEach(function (f, i) { if (have[uid + '#' + (i + 1)]) already++; });
      if (apply) {
        added += _recordDeferredDecisions_(ss, uid, list[0].ts || '', list);
      } else {
        added += list.filter(function (f, i) { return !have[uid + '#' + (i + 1)]; }).length;
      }
    });
  } finally {
    if (lock) lock.releaseLock();
  }

  const message = (apply ? 'Recorded ' : 'DRY RUN, would record ') + added + ' decision(s) from CURRENT_STATE as OPEN; ' +
    already + ' already in ' + CFG.DECISION_REGISTER_SHEET + '.' +
    (apply && added ? ' Review the register and resolve any that are already settled.' : '');
  console.log('[DecisionRegister] ' + message);
  return { apply: apply, found: found.length, added: added, already: already, message: message };
}

/**
 * Parses CURRENT_STATE's body into [{uid, ts, owner, decision, blocking}].
 * A "DEFERRED (<uid>):" paragraph opens a group; the list items after it
 * belong to it until the next non-list paragraph. The timestamp comes from
 * the nearest preceding "[State Sync: <ts> | <uid>]" heading for the same
 * uid, when there is one.
 */
function _bdParseDeferredDecisions_(body) {
  const out = [];
  const n = body.getNumChildren();
  let uid = null;
  const tsByUid = {};
  for (let i = 0; i < n; i++) {
    const el = body.getChild(i);
    const text = String(el.getText ? el.getText() : '').trim();
    const sync = /^\[State Sync: (.+?) \| (.+?)\]$/.exec(text);
    if (sync) tsByUid[sync[2].trim()] = sync[1].trim();
    const head = /^DEFERRED \((.+)\):$/.exec(text);
    if (head) { uid = head[1].trim(); continue; }
    if (el.getType() !== DocumentApp.ElementType.LIST_ITEM) { uid = null; continue; }
    if (!uid) continue;
    const m = /^\[([^\]]*)\]\s*(.*?)\s+—\s+Blocking:\s*(.*)$/.exec(text);
    out.push(m
      ? { uid: uid, ts: tsByUid[uid] || '', owner: m[1], decision: m[2], blocking: m[3] }
      : { uid: uid, ts: tsByUid[uid] || '', owner: 'unassigned', decision: text, blocking: 'unknown' });
  }
  return out;
}

// ================================================================
// BRIEFING DOC CONTENT
// ================================================================

/** OPEN register rows, oldest first. Anything not RESOLVED/DROPPED counts as open. */
function _bdOpenDecisions_(ss) {
  const sheet = ss.getSheetByName(CFG.DECISION_REGISTER_SHEET);
  if (!sheet) return [];
  const C = _bdCols_();
  return _bdRows_(sheet)
    .filter(function (r) {
      return String(r[C.Decision_ID]).trim() &&
        BD_CLOSED_STATUSES.indexOf(String(r[C.Status]).trim().toUpperCase()) === -1;
    })
    .map(function (r) {
      return {
        id: String(r[C.Decision_ID]).trim(),
        sessionUid: String(r[C.Session_UID]).trim(),
        recordedAt: r[C.Recorded_At],
        owner: String(r[C.Owner] || 'unassigned'),
        decision: String(r[C.Decision] || ''),
        blocking: String(r[C.Blocking] || 'unknown'),
      };
    });
}

function _bdSessionStem_(uid) {
  return String(uid).trim().replace(/_CH\d+$/, '').replace(/#\d+$/, '');
}

function _bdDay_(v) {
  // Not `instanceof Date`: a sheet cell's Date can come from another realm.
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v || '').slice(0, 10);
}

/**
 * Processed sessions from SESSION_LOG's Curator rows (one per chunk),
 * grouped by session, newest first: [{uid, lastAt, type, chunks, summary}].
 */
function _bdSessions_(ss) {
  const log = ss.getSheetByName(CFG.SESSION_LOG_SHEET);
  if (!log || log.getLastRow() <= 1) return [];
  const by = {};
  log.getRange(2, 1, log.getLastRow() - 1, 6).getValues().forEach(function (r) {
    if (_isIntakeSessionLogRow_(r) || !String(r[0]).trim()) return;
    const stem = _bdSessionStem_(r[0]);
    const s = by[stem] = by[stem] || { uid: stem, lastAt: 0, lastRaw: '', type: '', chunks: [] };
    const t = new Date(r[1]).getTime();
    if (!isNaN(t) && t >= s.lastAt) { s.lastAt = t; s.lastRaw = r[1]; }
    if (r[2]) s.type = String(r[2]);
    s.chunks.push({ uid: String(r[0]).trim(), summary: String(r[5] || '').trim() });
  });
  return Object.keys(by).map(function (k) {
    const s = by[k];
    s.chunks.sort(function (a, b) { return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0; });
    s.summary = _truncateWithMarker_(s.chunks.map(function (c) { return c.summary; })
      .filter(Boolean).join(' '), BD_SUMMARY_MAX_CHARS);
    return s;
  }).sort(function (a, b) { return b.lastAt - a.lastAt; });
}

function _bdSessionBlocks_(s, openBySession) {
  const out = [];
  out.push({ kind: 'h2', text: s.uid + ' (' + (_bdDay_(s.lastRaw) || 'date unknown') + ')' });
  out.push({ kind: 'p', text: (s.type ? 'Type: ' + s.type + '. ' : '') + 'Chunks processed: ' + s.chunks.length + '.' });
  out.push({ kind: 'p', text: s.summary || 'No summary recorded.' });
  const open = openBySession[s.uid] || [];
  if (open.length) {
    out.push({ kind: 'p', text: 'Open decisions from this session (see KOS_OPEN_DECISIONS):' });
    open.forEach(function (d) { out.push({ kind: 'li', text: d.id + ': ' + d.decision }); });
  }
  return out;
}

/** KOS_RECENT_SESSIONS content. */
function _recentSessionsBlocks_(ss) {
  const sessions = _bdSessions_(ss);
  const open = _bdOpenDecisions_(ss);
  const openBySession = {};
  open.forEach(function (d) {
    const stem = _bdSessionStem_(d.sessionUid);
    (openBySession[stem] = openBySession[stem] || []).push(d);
  });

  const recent = sessions.slice(0, BD_RECENT_SESSIONS);
  const shown = {};
  recent.forEach(function (s) { shown[s.uid] = true; });
  const older = sessions.slice(BD_RECENT_SESSIONS).filter(function (s) { return openBySession[s.uid]; });

  const out = [];
  out.push({ kind: 'p', text: 'The ' + BD_RECENT_SESSIONS + ' most recently processed sessions, newest first, ' +
    'then any older session that still has an open decision. Summaries come from SESSION_LOG. ' +
    'Next steps and the full decision list live in CURRENT_STATE and KOS_OPEN_DECISIONS.' });
  if (!recent.length) {
    out.push({ kind: 'p', text: 'No sessions processed yet.' });
    return out;
  }
  out.push({ kind: 'h2', text: 'Recent sessions' });
  recent.forEach(function (s) { out.push.apply(out, _bdSessionBlocks_(s, openBySession)); });
  if (older.length) {
    out.push({ kind: 'h2', text: 'Older sessions with open decisions' });
    older.forEach(function (s) { out.push.apply(out, _bdSessionBlocks_(s, openBySession)); });
  }
  return out;
}

/** KOS_OPEN_DECISIONS content. */
function _openDecisionsBlocks_(ss) {
  const open = _bdOpenDecisions_(ss);
  const out = [];
  out.push({ kind: 'p', text: 'Every deferred decision still OPEN in ' + CFG.DECISION_REGISTER_SHEET +
    ', oldest first. A decision leaves this list when the operator marks it RESOLVED or DROPPED.' });
  out.push({ kind: 'p', text: 'Open decisions: ' + open.length });
  if (!open.length) {
    out.push({ kind: 'p', text: 'None open.' });
    return out;
  }
  open.forEach(function (d) {
    out.push({ kind: 'li', text: '[' + d.owner + '] ' + d.decision + ' — Blocking: ' + d.blocking +
      ' (' + d.id + ', recorded ' + (_bdDay_(d.recordedAt) || 'date unknown') + ')' });
  });
  return out;
}

/**
 * KOS_CORE_FACTS content. The heading is the exact one
 * PERSONA_ALIGNMENT_V5_1.md §2.2 Threshold D looks for, the same one
 * buildSessionContext() (9_UI_Diagnostics.gs) injects.
 */
function _coreFactsBlocks_(ss) {
  const facts = _readPinnedCoreFacts_(ss);
  const targets = getRelationalTargets();
  const out = [];
  out.push({ kind: 'h2', text: 'CORE FACTS (Operator-Pinned — Do Not Contradict)' });
  if (facts.length) {
    facts.forEach(function (f, i) { out.push({ kind: 'li', text: (i + 1) + '. [' + f.theme + '] ' + f.fact }); });
  } else {
    out.push({ kind: 'p', text: 'None pinned yet. ALIGNMENT Threshold D has nothing to check against; ' +
      'treat this as "nothing pinned", never as evidence of drift.' });
  }
  out.push({ kind: 'h2', text: 'RELATIONAL TARGETS (Protect These Relationships)' });
  if (targets.length) {
    targets.forEach(function (t, i) { out.push({ kind: 'li', text: (i + 1) + '. ' + t }); });
  } else {
    out.push({ kind: 'p', text: 'None set.' });
  }
  return out;
}

// ================================================================
// GENERATION
// ================================================================

const BD_DOCS = [
  { name: 'KOS_RECENT_SESSIONS', title: 'RECENT SESSIONS', prop: 'RECENT_SESSIONS_DOC_ID', build: '_recentSessionsBlocks_' },
  { name: 'KOS_OPEN_DECISIONS',  title: 'OPEN DECISIONS',  prop: 'OPEN_DECISIONS_DOC_ID',  build: '_openDecisionsBlocks_' },
  { name: 'KOS_CORE_FACTS',      title: 'CORE FACTS',      prop: 'CORE_FACTS_DOC_ID',      build: '_coreFactsBlocks_' },
];

/**
 * Writes every briefing doc into `folder`. Each doc's content is built
 * before its doc is touched, and each is written on its own: a failure is
 * reported to ERROR_LOG and leaves that doc and its stamp as they were.
 *
 * @param {Folder} folder
 * @param {Date} now
 * @returns {{written: string[], failed: {doc: string, message: string}[]}}
 */
function generateBriefingDocs_(folder, now) {
  const result = { written: [], failed: [] };
  let ss = null;
  try {
    ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  } catch (e) {
    _reportError('generateBriefingDocs_', e, null);
    BD_DOCS.forEach(function (d) { result.failed.push({ doc: d.name, message: e.message }); });
    return result;
  }
  const builders = {
    _recentSessionsBlocks_: _recentSessionsBlocks_,
    _openDecisionsBlocks_: _openDecisionsBlocks_,
    _coreFactsBlocks_: _coreFactsBlocks_,
  };
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  BD_DOCS.forEach(function (d) {
    try {
      const blocks = builders[d.build](ss);
      _writeStableDoc_(folder, CFG.PROP[d.prop], d.name, d.title + ' — ' + dateStr,
        _briefingStamp_(now, 'generateBriefingDocs'), blocks);
      result.written.push(d.name);
    } catch (e) {
      _reportError('generateBriefingDocs_:' + d.name, e, null);
      result.failed.push({ doc: d.name, message: e.message });
    }
  });
  return result;
}

/**
 * Editor entry point: regenerates the briefing docs now, without the
 * primer. Logs each doc's ID, for adding it to the notebook.
 */
function generateBriefingDocs() {
  const folderId = PropertiesService.getScriptProperties().getProperty('ID_03_1_CURRENT_STATE');
  if (!folderId) throw new Error('ID_03_1_CURRENT_STATE not set. Run deployFullSystem().');
  const result = generateBriefingDocs_(DriveApp.getFolderById(folderId), new Date());
  const props = PropertiesService.getScriptProperties();
  BD_DOCS.forEach(function (d) {
    console.log('[BriefingDocs] ' + d.name + ': ' + (props.getProperty(CFG.PROP[d.prop]) || 'not created'));
  });
  result.failed.forEach(function (f) { console.log('[BriefingDocs] FAILED ' + f.doc + ': ' + f.message); });
  return result;
}
