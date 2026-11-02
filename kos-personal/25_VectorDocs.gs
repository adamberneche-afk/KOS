// ================================================================
// 25_VectorDocs.gs — KOS v8.0
// BOUND TO: kos-personal (main flat-folder project)
// ================================================================
//
// Keeps the VECTOR_* docs in 05_Vector_Repository filled from the
// operator's own record. They are the Registrar's Stage 2 standard
// (24_RegistrarFlows.gs reads them into the "Master Vector Primer"). Until
// 2026-11-02 they were the templates setup made on 2026-05-18, so Stage 2
// scored every draft 0.0 against nothing.
//
// TWO HALVES.
//
//   1. The Vector Item Labeler, a Studio flow in the shape
//      meta/FLOW_DOCTRINE.md requires. Every item the operator's record
//      holds (below) gets one label: a theme, and a kind (PRINCIPLE,
//      CONSTRAINT, OPEN_QUESTION, HOUSEKEEPING, STALE, OTHER). The model
//      labels by item ID and writes no text, so it cannot put words into
//      the standard; the harvest accepts only IDs that were in the batch.
//
//        buildVectorItemBatches   ──▶  KOS - Vector Item Labeler  ──▶  harvestVectorItemReturns
//        VectorItemInput rows          one Ask Gemini call            VECTOR_ITEM_LABELS rows
//        (up to VI_BATCH_SIZE          adds a VECTOR_ITEM_RETURN row
//         unlabelled items each)
//
//      runVectorItemLabeler (hourly) harvests, recompiles when a label
//      arrived, then writes batches for whatever is still unlabelled. A
//      label row is never rewritten: the operator corrects one by editing
//      its Theme or Kind in VECTOR_ITEM_LABELS, and it stays corrected.
//
//   2. The compiler (no model call). Each theme's doc lists, word for word
//      with its date and session, the items labelled to that theme as
//      PRINCIPLE or CONSTRAINT, most authoritative first:
//
//        core facts the operator pinned (INCUBATOR, PROMOTED_MANUAL)
//        settled: DECISION_REGISTER RESOLVED rows, with the operator's note
//        decided in sessions: ACTION_REGISTER Type = DECISION
//        lessons and pivots: the PIVOTS_AND_LESSONS doc
//        unsettled: OPEN register rows labelled to the theme, marked as no
//          standard (any kind)
//
//      DROPPED register rows are never items. A session decision that
//      matches an OPEN or DROPPED register row, or repeats a settled one,
//      is left out; the same text from several sessions is listed once.
//      VECTOR_GOVERNANCE holds the approved SMPs.
//
// THE OPERATOR'S OWN TEXT IS NEVER TOUCHED. Each doc has the operator's
// principles, then a VD_MARKER heading; only what follows the marker is
// rewritten. A doc still holding only the setup template is replaced by
// the layout; a doc with anything else and no marker keeps all of it. A
// doc is written only when its compiled part changed.
//
// SIZE. Whole items only. Every section heading is written with its
// count, even when room runs out before its items. The primer (24) gives
// each doc the room it needs and cuts at a line.
//
// ENTRY POINTS (no trailing underscore — GAS hides those from the Run
// dropdown):
//   runVectorItemLabeler()       — hourly trigger: harvest, compile, batch
//   buildVectorItemBatches()     — write input rows for unlabelled items
//   harvestVectorItemReturns()   — apply the flow's returns
//   compileVectorDocs()          — compile now (generateDailyPrimer too)
//   checkVectorDocs()            — read-only: docs, labels, last runs
//   checkVectorItemBinding()     — are the flow's output columns right?
//   checkVectorItemLiveness()    — has the flow ever answered?
//   installVectorItemFixture()   — a two-item batch for a built flow
//   runVectorItemLabelCanary()   — the Apps Script half, flow stubbed
//   listPersonalItems()          — where the record holds PERSONAL items
// ================================================================

const VI_INPUT_TAB = 'VectorItemInput';
const VI_RETURN_TAB = 'VECTOR_ITEM_RETURN';
const VI_LABEL_TAB = 'VECTOR_ITEM_LABELS';
const VI_INPUT_HEADERS = ['Timestamp', 'Batch_ID', 'Item_Count', 'SourceText', 'Status'];
const VI_RETURN_HEADERS = ['Returned_At', 'Batch_ID', 'Output_JSON', 'Harvest_Status', 'Error'];
const VI_LABEL_HEADERS = ['Item_ID', 'Source', 'Session', 'Theme', 'Kind', 'Labeled_At', 'Batch_ID', 'Text'];
const VI_INPUT = { TIMESTAMP: 0, BATCH_ID: 1, ITEM_COUNT: 2, SOURCE_TEXT: 3, STATUS: 4 };
const VI_RETURN = { RETURNED_AT: 0, BATCH_ID: 1, OUTPUT_JSON: 2, HARVEST_STATUS: 3, ERROR: 4 };
const VI_LABEL = { ID: 0, SOURCE: 1, SESSION: 2, THEME: 3, KIND: 4, AT: 5, BATCH: 6, TEXT: 7 };

const VI_KINDS = ['PERSONAL', 'PRINCIPLE', 'CONSTRAINT', 'OPEN_QUESTION', 'HOUSEKEEPING', 'STALE', 'OTHER'];
const VI_STANDARD_KINDS = ['PRINCIPLE', 'CONSTRAINT'];
const VI_GIVEN_UP = 'UNLABELED'; // after VI_MAX_ATTEMPTS batches with no label
const VI_BATCH_SIZE = 40;
const VI_BATCHES_PER_RUN = 6;
const VI_MAX_ATTEMPTS = 3;
const VI_ITEM_INPUT_MAX = 600;
const VI_WAIT_MINS = 60; // a batch with no return after this long is sent again
const VI_ID_RE = /^\[([A-Z]+:[0-9a-f]{16})\]/gm;
const VI_FIXTURE_PREFIX = 'FIXTURE-VI-';
const VI_LAST_RUN_PROP = 'VECTOR_ITEM_LABELER_LAST_RUN';

const VD_MARKER = 'COMPILED EVIDENCE (rewritten by compileVectorDocs; write above this line)';
const VD_OPERATOR_HEADING = 'OPERATOR PRINCIPLES (yours; kept as written, and ranked first)';
const VD_GOVERNANCE_DOC = 'VECTOR_GOVERNANCE';
const VD_ITEM_MAX = 400;
const VD_DOC_MAX = 9000;
const VD_SIMILAR = 0.6;
const VD_FOLDER_SCAN_MAX = 200;
const VD_LAST_RUN_PROP = 'VECTOR_DOCS_LAST_RUN';
// The setup template (_scaffoldVectorDoc, 1): a doc holding it and nothing
// of the operator's is replaced, not appended to.
const VD_TEMPLATE_MARK = '[What foundational beliefs govern this domain?]';
const VD_TEMPLATE_LINES = [
  'Core Principles', '[What foundational beliefs govern this domain?]', 'Key Decisions Log',
  '[DATE]  |  [DECISION]  |  [RATIONALE]', '[DATE] | [DECISION] | [RATIONALE]', 'Active Constraints',
  '[What limits or guardrails currently apply?]', 'Evolution Log', '[What changed? What was deprecated and why?]',
];
const VD_DOMAINS = {
  ARCHITECTURE: 'System Design & Technical Infrastructure',
  PEDAGOGY: 'Teaching, Learning & Student Outcomes',
  SECURITY: 'Data Privacy, Student Safety & Access Control',
  UI: 'User Experience & Interface Design',
};


// ================================================================
// THE RECORD — every item, with a stable ID
// ================================================================

function _vdClip_(text, max) {
  const m = max || VD_ITEM_MAX;
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > m ? t.slice(0, m - 1) + '…' : t;
}

function _viNorm_(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function _viWords_(text) {
  const out = {};
  _viNorm_(text).split(' ').forEach(function (w) { if (w.length >= 4) out[w] = true; });
  return out;
}

/** Normalized-equal, or at least VD_SIMILAR of their longer words shared. */
function _viSimilar_(a, b) {
  if (_viNorm_(a) === _viNorm_(b)) return true;
  const wa = _viWords_(a);
  const wb = _viWords_(b);
  const ka = Object.keys(wa);
  const kb = Object.keys(wb);
  if (!ka.length || !kb.length) return false;
  const shared = ka.filter(function (w) { return wb[w]; }).length;
  return shared / (ka.length + kb.length - shared) >= VD_SIMILAR;
}

function _viItemId_(source, session, text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, source + '|' + session + '|' + _viNorm_(text));
  return source + ':' + bytes.slice(0, 8).map(function (b) {
    return ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1);
  }).join('');
}

function _vdTime_(v) {
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

/** DECISION_REGISTER rows: [{status, sessionUid, at, decision, note, resolvedAt}]. */
function _vdRegister_(ss) {
  const sheet = ss.getSheetByName(CFG.DECISION_REGISTER_SHEET);
  if (!sheet) return [];
  const C = _bdCols_();
  return _bdRows_(sheet).map(function (r, i) { return { r: r, row: i + 2 }; })
    .filter(function (x) { return String(x.r[C.Decision_ID]).trim(); }).map(function (x) {
    const r = x.r;
    return {
      loc: CFG.DECISION_REGISTER_SHEET + ' row ' + x.row,
      status: String(r[C.Status] || 'OPEN').trim().toUpperCase(),
      sessionUid: String(r[C.Session_UID]).trim(),
      at: r[C.Recorded_At],
      decision: String(r[C.Decision] || ''),
      note: String(r[C.Resolution_Note] || ''),
      resolvedAt: r[C.Resolved_At],
    };
  });
}

/** ACTION_REGISTER rows of Type DECISION: [{sessionUid, at, item}]. */
function _vdSessionDecisions_(ss) {
  const sheet = ss.getSheetByName(CFG.ACTION_REGISTER_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues()
    .map(function (r, i) { return { r: r, row: i + 2 }; })
    .filter(function (x) { return String(x.r[2]).trim().toUpperCase() === 'DECISION' && String(x.r[3]).trim(); })
    .map(function (x) {
      return { sessionUid: String(x.r[0]).trim(), at: x.r[1], item: String(x.r[3]),
        loc: CFG.ACTION_REGISTER_SHEET + ' row ' + x.row };
    });
}

/**
 * PIVOTS_AND_LESSONS: the intake (3) appends a "[Session: ts | uid]"
 * heading and the session's lessons under it. [{sessionUid, at, item}].
 */
function _vdLessons_() {
  const id = PropertiesService.getScriptProperties().getProperty('ID_PIVOTS_AND_LESSONS');
  if (!id) return [];
  const body = DocumentApp.openById(id).getBody();
  const out = [];
  let current = null;
  const n = body.getNumChildren();
  for (let i = 0; i < n; i++) {
    const c = body.getChild(i);
    const text = String(c.getText ? c.getText() : '').trim();
    if (!text) continue;
    const m = /^\[Session: ([^|\]]+)\|\s*([^\]]+)\]$/.exec(text);
    if (m) { current = { at: m[1].trim(), sessionUid: m[2].trim() }; continue; }
    if (current) out.push({ sessionUid: current.sessionUid, at: current.at, item: text,
      loc: 'PIVOTS_AND_LESSONS, under [Session: ' + current.at + ' | ' + current.sessionUid + ']' });
  }
  return out;
}

/**
 * Every labellable item, and what is never a standard.
 * @returns {{items: Object[], byId: Object, dropped: string[], open: string[]}}
 */
function _viItems_(ss) {
  const items = [];
  const byId = {};
  const dropped = [];
  const open = [];
  const add = function (source, sessionUid, at, text, loc) {
    const session = _bdSessionStem_(sessionUid);
    if (!String(text).trim() || /^FIXTURE/.test(session)) return;
    const id = _viItemId_(source, session, text);
    if (byId[id]) return;
    const item = { id: id, source: source, session: session, t: _vdTime_(at), date: _bdDay_(at) || 'undated',
      text: String(text), loc: loc || '' };
    items.push(item);
    byId[id] = item;
  };
  _vdRegister_(ss).forEach(function (r) {
    if (r.status === 'RESOLVED') {
      add('SETTLED', r.sessionUid, r.resolvedAt || r.at, r.decision + (r.note ? ' — Resolved: ' + r.note : ''), r.loc);
    } else if (r.status === 'DROPPED') {
      dropped.push(r.decision);
    } else {
      open.push(r.decision);
      add('OPEN', r.sessionUid, r.at, r.decision, r.loc);
    }
  });
  _vdSessionDecisions_(ss).forEach(function (r) { add('DECIDED', r.sessionUid, r.at, r.item, r.loc); });
  _vdLessons_().forEach(function (r) { add('LESSON', r.sessionUid, r.at, r.item, r.loc); });
  return { items: items, byId: byId, dropped: dropped, open: open };
}


// ================================================================
// THE LABELER — materialize, harvest, checks
// ================================================================

function _viSheets_(ss) {
  return {
    input: _getOrCreateSheet(ss, VI_INPUT_TAB),
    ret: _getOrCreateSheet(ss, VI_RETURN_TAB),
    labels: _getOrCreateSheet(ss, VI_LABEL_TAB),
  };
}

function _viRows_(sheet, width) {
  return sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues() : [];
}

/** {Item_ID: {theme, kind}} — the operator's hand edits included. */
function _viLabels_(sheet) {
  const out = {};
  _viRows_(sheet, VI_LABEL_HEADERS.length).forEach(function (r) {
    const id = String(r[VI_LABEL.ID]).trim();
    if (id) out[id] = { theme: String(r[VI_LABEL.THEME]).trim().toUpperCase(), kind: String(r[VI_LABEL.KIND]).trim().toUpperCase() };
  });
  return out;
}

function _viIdsIn_(sourceText) {
  const ids = [];
  const re = new RegExp(VI_ID_RE.source, 'gm');
  let m;
  while ((m = re.exec(String(sourceText || ''))) !== null) ids.push(m[1]);
  return ids;
}

function _viThemes_() {
  return _getKnownVectors().map(function (t) { return String(t).toUpperCase(); });
}

function _viSourceText_(themes, batch) {
  return 'THEMES: ' + themes.join(', ') + ', NONE\n\nITEMS (' + batch.length + '):\n' + batch.map(function (it) {
    return '[' + it.id + '] (' + it.source + ', ' + it.date + ') ' + _vdClip_(it.text, VI_ITEM_INPUT_MAX);
  }).join('\n');
}

/**
 * Writes input rows for unlabelled items not already in a batch awaiting
 * its answer. An item sent VI_MAX_ATTEMPTS times with no label is given
 * up on (Kind UNLABELED, Theme NONE), reported by checkVectorDocs, and
 * left for the operator to label by hand.
 * @returns {{batches:number, items:number, givenUp:number, waiting:number}}
 */
function buildVectorItemBatches() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sh = _viSheets_(ss);
  const record = _viItems_(ss);
  const labels = _viLabels_(sh.labels);
  const answered = {};
  _viRows_(sh.ret, VI_RETURN_HEADERS.length).forEach(function (r) { answered[String(r[VI_RETURN.BATCH_ID]).trim()] = true; });
  const now = Date.now();
  const attempts = {};
  const inFlight = {};
  _viRows_(sh.input, VI_INPUT_HEADERS.length).forEach(function (r) {
    const batchId = String(r[VI_INPUT.BATCH_ID]).trim();
    const waiting = !answered[batchId] && now - _vdTime_(r[VI_INPUT.TIMESTAMP]) < VI_WAIT_MINS * 60000;
    _viIdsIn_(r[VI_INPUT.SOURCE_TEXT]).forEach(function (id) {
      attempts[id] = (attempts[id] || 0) + 1;
      if (waiting) inFlight[id] = true;
    });
  });
  const out = { batches: 0, items: 0, givenUp: 0, waiting: Object.keys(inFlight).length };
  const pending = [];
  const stamp = new Date();
  record.items.forEach(function (it) {
    if (labels[it.id] || inFlight[it.id]) return;
    if ((attempts[it.id] || 0) >= VI_MAX_ATTEMPTS) {
      sh.labels.appendRow([it.id, it.source, it.session, 'NONE', VI_GIVEN_UP, stamp, '', _vdClip_(it.text)]);
      out.givenUp++;
      return;
    }
    pending.push(it);
  });
  pending.sort(function (a, b) { return b.t - a.t; }); // newest first: today's work is labelled first
  const themes = _viThemes_();
  const tag = Utilities.formatDate(stamp, Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  for (let b = 0; b < VI_BATCHES_PER_RUN && b * VI_BATCH_SIZE < pending.length; b++) {
    const batch = pending.slice(b * VI_BATCH_SIZE, (b + 1) * VI_BATCH_SIZE);
    // The row number makes the ID unique even for two runs in one second.
    sh.input.appendRow([stamp, 'VI-' + tag + '-R' + (sh.input.getLastRow() + 1), batch.length,
      _viSourceText_(themes, batch), 'READY']);
    out.batches++;
    out.items += batch.length;
  }
  return out;
}

/**
 * Applies every unharvested VECTOR_ITEM_RETURN row. Each is marked once:
 *   HARVESTED      labels written for IDs that were in its batch (Error
 *                  says how many were labelled, rejected or missing)
 *   NOT_GROUNDED   no label named an item in its batch
 *   NOT_JSON       the output is not {"labels": [...]}
 *   EMPTY          no output
 *   BAD_BATCH_ID   no input row has this Batch_ID: the flow's Batch_ID
 *                  chip is bound to the wrong column
 * A rejected or missing item is sent again by the next batch run.
 * @returns {{harvested:number, labels:number, rejected:number, notGrounded:number, notJson:number, empty:number, badId:number}}
 */
function harvestVectorItemReturns() {
  const out = { harvested: 0, labels: 0, rejected: 0, notGrounded: 0, notJson: 0, empty: 0, badId: 0 };
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sh = _viSheets_(ss);
  const returns = _viRows_(sh.ret, VI_RETURN_HEADERS.length);
  if (!returns.some(function (r) { return !String(r[VI_RETURN.HARVEST_STATUS] || '').trim(); })) return out;
  const batches = {};
  _viRows_(sh.input, VI_INPUT_HEADERS.length).forEach(function (r) {
    batches[String(r[VI_INPUT.BATCH_ID]).trim()] = _viIdsIn_(r[VI_INPUT.SOURCE_TEXT]);
  });
  const record = _viItems_(ss);
  const labels = _viLabels_(sh.labels);
  const themes = _viThemes_().concat(['NONE']);
  const stamp = new Date();
  const mark = function (i, status, error) {
    sh.ret.getRange(i + 2, VI_RETURN.HARVEST_STATUS + 1, 1, 2).setValues([[status, error || '']]);
  };
  for (let i = 0; i < returns.length; i++) {
    const r = returns[i];
    if (String(r[VI_RETURN.HARVEST_STATUS] || '').trim()) continue;
    const batchId = String(r[VI_RETURN.BATCH_ID]).trim();
    const ids = batches[batchId];
    if (!ids) { mark(i, 'BAD_BATCH_ID', 'No ' + VI_INPUT_TAB + ' row has this Batch_ID: bind it to the input row\'s Batch_ID.'); out.badId++; continue; }
    const text = _srStripJsonFence_(_srUnwrapStudioLinks_(r[VI_RETURN.OUTPUT_JSON])).trim();
    if (!text) { mark(i, 'EMPTY', 'The flow returned no output.'); out.empty++; continue; }
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
    if (!parsed || !Array.isArray(parsed.labels)) {
      mark(i, 'NOT_JSON', 'Expected {"labels": [...]}.'); out.notJson++; continue;
    }
    const inBatch = {};
    ids.forEach(function (id) { inBatch[id] = true; });
    const fixture = batchId.indexOf(VI_FIXTURE_PREFIX) === 0;
    let matched = 0;
    let written = 0;
    let rejected = 0;
    const seen = {};
    parsed.labels.forEach(function (l) {
      const id = String(l && l.id || '').trim();
      const theme = String(l && l.theme || '').trim().toUpperCase();
      const kind = String(l && l.kind || '').trim().toUpperCase();
      if (!inBatch[id] || seen[id] || themes.indexOf(theme) === -1 || VI_KINDS.indexOf(kind) === -1) { rejected++; return; }
      seen[id] = true;
      matched++;
      if (fixture || labels[id]) return;
      const it = record.byId[id];
      if (!it) return; // the item left the record since its batch was written
      sh.labels.appendRow([id, it.source, it.session, theme, kind, stamp, batchId, _vdClip_(it.text)]);
      labels[id] = { theme: theme, kind: kind };
      written++;
    });
    const missing = ids.filter(function (id) { return !seen[id]; }).length;
    if (!matched) {
      mark(i, 'NOT_GROUNDED', 'No label named an item in this batch (' + rejected + ' rejected).');
      out.notGrounded++;
      continue;
    }
    mark(i, 'HARVESTED', 'labelled ' + written + '; rejected ' + rejected + '; missing ' + missing);
    out.harvested++;
    out.labels += written;
    out.rejected += rejected;
  }
  if (out.harvested + out.notGrounded + out.notJson + out.empty + out.badId) {
    console.log('[VectorItems] harvest — ' + JSON.stringify(out));
  }
  return out;
}

/**
 * The hourly trigger: harvest, recompile the docs when a label arrived,
 * then batch what is still unlabelled.
 */
function runVectorItemLabeler() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { console.log('[VectorItems] Another run holds the lock. Skipping.'); return null; }
  try {
    const h = harvestVectorItemReturns();
    let compiled = null;
    if (h.labels > 0) compiled = compileVectorDocs_();
    const b = buildVectorItemBatches();
    const summary = { at: new Date().toISOString(), harvest: h, batches: b,
      compiled: compiled ? { written: compiled.written.length, failed: compiled.failed.length } : null };
    PropertiesService.getScriptProperties().setProperty(VI_LAST_RUN_PROP, JSON.stringify(summary));
    return summary;
  } catch (e) {
    _reportError('runVectorItemLabeler', e, null);
    return null;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Read-only. Are the flow's output columns bound right? A Batch_ID that
 * matches no input row means its chip is on the wrong column; an
 * Output_JSON that isn't {"labels": [...]} means the output chip is.
 */
function checkVectorItemBinding() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const report = { ok: true, header: null, rows: 0, unmatchedBatchId: 0, notJson: 0, notes: [] };
  const ret = ss.getSheetByName(VI_RETURN_TAB);
  if (!ret || ret.getLastRow() < 1) {
    report.notes.push('No ' + VI_RETURN_TAB + ' tab yet. Run runVectorItemLabeler() once, then build the flow from FlowBuildSpec.');
  } else {
    report.header = ret.getRange(1, 1, 1, VI_RETURN_HEADERS.length).getValues()[0].map(String);
    if (report.header.join('|') !== VI_RETURN_HEADERS.join('|')) {
      report.ok = false;
      report.notes.push('Header is "' + report.header.join(', ') + '"; expected "' + VI_RETURN_HEADERS.join(', ') + '".');
    }
    const known = {};
    const input = ss.getSheetByName(VI_INPUT_TAB);
    if (input) _viRows_(input, VI_INPUT_HEADERS.length).forEach(function (r) { known[String(r[VI_INPUT.BATCH_ID]).trim()] = true; });
    _viRows_(ret, VI_RETURN_HEADERS.length).forEach(function (r) {
      report.rows++;
      if (!known[String(r[VI_RETURN.BATCH_ID]).trim()]) report.unmatchedBatchId++;
      const text = _srStripJsonFence_(String(r[VI_RETURN.OUTPUT_JSON] || '')).trim();
      let ok = false;
      try { ok = Array.isArray(JSON.parse(text).labels); } catch (e) { ok = false; }
      if (text && !ok) report.notJson++;
    });
    if (report.unmatchedBatchId || report.notJson) report.ok = false;
  }
  console.log('[VectorItems] binding: ' + JSON.stringify(report));
  console.log('[VectorItems] The flow\'s last step adds a row to ' + VI_RETURN_TAB + ': Returned_At = the run time; ' +
    'Batch_ID = @trigger.Batch_ID; Output_JSON = the Gemini step\'s output. Leave Harvest_Status and Error empty.');
  return report;
}

/** Read-only. Has the flow ever answered, and is a batch waiting longer than VI_WAIT_MINS? */
function checkVectorItemLiveness() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const report = { inputs: 0, answered: 0, waiting: 0, lastReturn: '', everAnswered: false };
  const answered = {};
  let last = 0;
  const ret = ss.getSheetByName(VI_RETURN_TAB);
  if (ret) _viRows_(ret, VI_RETURN_HEADERS.length).forEach(function (r) {
    answered[String(r[VI_RETURN.BATCH_ID]).trim()] = true;
    last = Math.max(last, _vdTime_(r[VI_RETURN.RETURNED_AT]));
  });
  const input = ss.getSheetByName(VI_INPUT_TAB);
  if (input) _viRows_(input, VI_INPUT_HEADERS.length).forEach(function (r) {
    report.inputs++;
    if (answered[String(r[VI_INPUT.BATCH_ID]).trim()]) { report.answered++; return; }
    if (Date.now() - _vdTime_(r[VI_INPUT.TIMESTAMP]) > VI_WAIT_MINS * 60000) report.waiting++;
  });
  report.everAnswered = report.answered > 0;
  report.lastReturn = last ? new Date(last).toISOString() : '';
  console.log('[VectorItems] liveness: ' + JSON.stringify(report));
  if (!report.everAnswered && report.inputs) {
    console.log('[VectorItems] The flow has never answered. It is not built, not on, or its starter does not match ' +
      VI_INPUT_TAB + ' rows with Status = READY.');
  }
  return report;
}

/**
 * A two-item batch (one principle, one housekeeping) so a built flow has
 * something to answer. Its labels are checked by the harvest and never
 * written to VECTOR_ITEM_LABELS.
 */
function installVectorItemFixture() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sh = _viSheets_(ss);
  const stamp = new Date();
  const batchId = VI_FIXTURE_PREFIX + Utilities.formatDate(stamp, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const items = [
    { id: 'FIXTURE:0000000000000001', source: 'DECIDED', date: '2026-11-02',
      text: 'Warm-ups stay under five minutes so the lesson starts on time.' },
    { id: 'FIXTURE:0000000000000002', source: 'SETTLED', date: '2026-11-02',
      text: 'Create the pacing guide sheet — Resolved: created and shared.' },
  ];
  sh.input.appendRow([stamp, batchId, items.length, _viSourceText_(_viThemes_(), items), 'READY']);
  console.log('[VectorItems] fixture batch ' + batchId + ' written to ' + VI_INPUT_TAB + '. A built flow answers into ' +
    VI_RETURN_TAB + '; runVectorItemLabeler() harvests it; checkVectorItemLiveness() says whether that happened.');
  return { installed: true, batchId: batchId };
}

/**
 * The Apps Script half end to end with the flow stubbed (it says so):
 * fixture batch, a stub answer, the harvest. Removes its own rows.
 */
function runVectorItemLabelCanary() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sh = _viSheets_(ss);
  const steps = [];
  const fx = installVectorItemFixture();
  steps.push({ step: 'fixture batch written', ok: !!fx.installed });
  sh.ret.appendRow([new Date(), fx.batchId, JSON.stringify({ labels: [
    { id: 'FIXTURE:0000000000000001', theme: 'PEDAGOGY', kind: 'PRINCIPLE' },
    { id: 'FIXTURE:0000000000000002', theme: 'NONE', kind: 'HOUSEKEEPING' }] })]);
  harvestVectorItemReturns();
  const row = _viRows_(sh.ret, VI_RETURN_HEADERS.length).filter(function (r) { return String(r[VI_RETURN.BATCH_ID]) === fx.batchId; })[0];
  steps.push({ step: 'stub answer harvested', ok: !!row && row[VI_RETURN.HARVEST_STATUS] === 'HARVESTED' });
  [sh.ret, sh.input].forEach(function (s) {
    for (let r = s.getLastRow(); r >= 2; r--) {
      if (String(s.getRange(r, 2).getValue()) === fx.batchId) s.deleteRow(r);
    }
  });
  const passed = steps.filter(function (s) { return s.ok; }).length;
  console.log('[VectorItems] canary: ' + passed + '/' + steps.length + ' passed (the flow itself was stubbed). ' + JSON.stringify(steps));
  return { passed: passed, total: steps.length, steps: steps, stubbed: true };
}


// ================================================================
// THE COMPILER
// ================================================================

const VD_SECTIONS = [
  ['pinned', 'Core facts you pinned (do not contradict)'],
  ['settled', 'Settled: decisions you resolved, with your note'],
  ['decided', 'Decided in sessions'],
  ['lessons', 'Lessons and pivots from sessions'],
  ['open', 'Unsettled: open decisions. NOT a standard; do not score drift against these'],
];
const VD_SECTION_OF = { SETTLED: 'settled', DECIDED: 'decided', LESSON: 'lessons', OPEN: 'open' };

// Two capitalized words in a row, the first of them not a word that
// usually starts a tool, product or protocol name: "Lennox Taylor" is
// listed, "Apps Script" and "Seven Bridges" are not. For review only.
const VD_NAME_REVIEW_MAX = 60;
const VD_NOT_A_NAME = ['Google', 'Apps', 'Workspace', 'Claude', 'Gemini', 'Core', 'Seven', 'Web', 'Morning', 'Governance',
  'Vector', 'Central', 'Ledger', 'Drop', 'Custom', 'Cold', 'Warm', 'Master', 'Studio', 'Admin', 'Evidence', 'Calibration',
  'The', 'Rule', 'Resolution', 'Genesis', 'Pre', 'Pointer', 'Socratic', 'Polyform', 'Single', 'Control', 'Free', 'Unique',
  'Unified', 'Supreme', 'Bifurcated', 'Idempotent', 'Integration', 'Implemented', 'Implement', 'Adopted', 'Adopt',
  'Approve', 'Commit', 'Establish', 'Recognized', 'Replaced', 'Applied', 'Multi', 'Micro', 'Dual', 'Three', 'Red'];
function _vdPossibleName_(text) {
  const re = /\b([A-Z][a-z]+(?:['’-][A-Za-z]+)?)\s+([A-Z][a-z]+(?:['’-][A-Za-z]+)?)\b/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    if (VD_NOT_A_NAME.indexOf(m[1].split(/['’-]/)[0]) === -1) return m[1] + ' ' + m[2];
  }
  return '';
}

// Open decisions are listed as no standard, so only the other sections
// need a second look.
function _vdIsStandardEntry_(d, e) {
  return d.open.indexOf(e) === -1;
}

/** Core facts the operator pinned, with an empty fact reported rather than shown. */
function _vdPinned_(ss) {
  const ok = [];
  const empty = [];
  _readPinnedCoreFacts_(ss).forEach(function (f) {
    const theme = String(f.theme).trim().toUpperCase();
    const fact = String(f.fact || '').trim();
    if (!fact || fact.toUpperCase() === theme) empty.push(theme);
    else ok.push({ theme: theme, fact: fact });
  });
  return { ok: ok, empty: empty };
}

/**
 * What each doc lists. Items come in only with a label for that theme;
 * standards only as PRINCIPLE or CONSTRAINT.
 */
function _vdCollect_(ss, themes) {
  const record = _viItems_(ss);
  const labelSheet = ss.getSheetByName(VI_LABEL_TAB);
  const labels = labelSheet ? _viLabels_(labelSheet) : {};
  const docs = {};
  themes.forEach(function (t) {
    docs['VECTOR_' + t] = { theme: t, pinned: [], settled: [], decided: [], lessons: [], open: [], sessions: {} };
  });
  const stats = { items: record.items.length, awaiting: 0, givenUp: 0, notStandard: 0, setAside: 0, duplicates: 0,
    emptyPinned: [], nameReview: [] };
  const pinned = _vdPinned_(ss);
  stats.emptyPinned = pinned.empty;
  pinned.ok.forEach(function (f) {
    const d = docs['VECTOR_' + f.theme];
    if (d) d.pinned.push({ t: 0, date: '', text: _vdClip_(f.fact), raw: f.fact });
  });

  const settledTexts = [];
  record.items.forEach(function (it) {
    const lab = labels[it.id];
    if (!lab) { stats.awaiting++; return; }
    if (lab.kind === VI_GIVEN_UP) { stats.givenUp++; return; }
    const d = docs['VECTOR_' + lab.theme];
    if (!d) return;
    const section = VD_SECTION_OF[it.source];
    if (section !== 'open' && VI_STANDARD_KINDS.indexOf(lab.kind) === -1) { stats.notStandard++; return; }
    if (it.source === 'DECIDED' && record.open.concat(record.dropped).some(function (o) { return _viSimilar_(o, it.text); })) {
      stats.setAside++;
      return;
    }
    if (it.source === 'SETTLED') settledTexts.push(it.text);
    d[section].push({ id: it.id, t: it.t, date: it.date, session: it.session, raw: it.text,
      text: _vdClip_(it.text) + ' (' + it.date + ', ' + it.session + ')' });
    d.sessions[it.session] = true;
  });

  // The same thing recorded more than once is listed once, at its most
  // authoritative and then newest; a session decision a settled one
  // already covers is left to the settled one.
  Object.keys(docs).forEach(function (name) {
    const d = docs[name];
    const kept = [];
    VD_SECTIONS.forEach(function (s) {
      d[s[0]].sort(function (a, b) { return b.t - a.t; });
      d[s[0]] = d[s[0]].filter(function (e) {
        if (s[0] === 'decided' && settledTexts.some(function (x) { return _viSimilar_(x.split(' — Resolved: ')[0], e.raw); })) {
          stats.duplicates++;
          return false;
        }
        const twin = kept.filter(function (k) { return _viSimilar_(k.raw, e.raw); })[0];
        if (twin) { twin.also = (twin.also || 0) + 1; stats.duplicates++; return false; }
        kept.push(e);
        return true;
      });
    });
    kept.forEach(function (e) {
      if (e.also) e.text += ' (also recorded in ' + e.also + ' other session' + (e.also === 1 ? '' : 's') + ')';
      // Not a filter: on the live record a name pattern matched 179 of 453
      // items, nearly all of them tools and protocols. The labeler's
      // PERSONAL rule keeps names out; this lists what to read once.
      if (e.id && _vdIsStandardEntry_(d, e)) {
        const pair = _vdPossibleName_(e.raw);
        if (pair && stats.nameReview.length < VD_NAME_REVIEW_MAX) stats.nameReview.push(name + ' ' + e.id + ': "' + pair + '"');
      }
    });
  });
  return { docs: docs, stats: stats };
}

/** The compiled part of one theme doc: whole items, every heading with its count. */
function _vdThemeBlocks_(d, stats) {
  const counts = VD_SECTIONS.map(function (s) { return d[s[0]].length; });
  const total = counts.reduce(function (a, b) { return a + b; }, 0);
  const standards = total - d.open.length;
  const latest = VD_SECTIONS.reduce(function (m, s) {
    return d[s[0]].reduce(function (mm, e) { return e.date > mm ? e.date : mm; }, m);
  }, '');
  const out = [{ kind: 'p', text: 'Theme ' + d.theme + (VD_DOMAINS[d.theme] ? ' (' + VD_DOMAINS[d.theme] + ')' : '') + '. ' +
    standards + ' standard(s) from ' + Object.keys(d.sessions).length + ' session(s); newest ' + (latest || 'none') + '. ' +
    'Each item is copied as recorded, with its date and session: the items the Vector Item Labeler labelled ' +
    d.theme + ' and PRINCIPLE or CONSTRAINT.' +
    (stats && stats.awaiting ? ' ' + stats.awaiting + ' of the record\'s items still await a label.' : '') }];
  if (!standards) {
    out.push({ kind: 'p', text: 'No recorded standard for this theme yet. There is nothing here to measure drift against: ' +
      'treat this theme as having none, never as a draft being on standard.' });
  }
  const headings = VD_SECTIONS.map(function (s, i) { return s[1] + ' (' + counts[i] + ')'; });
  let room = VD_DOC_MAX - out[0].text.length - headings.reduce(function (a, h) { return a + h.length + 1; }, 0) - 200;
  VD_SECTIONS.forEach(function (s, i) {
    if (!counts[i]) return;
    out.push({ kind: 'h2', text: headings[i] });
    const items = d[s[0]];
    for (let k = 0; k < items.length; k++) {
      if (items[k].text.length + 1 > room) {
        out.push({ kind: 'p', text: '[' + (items.length - k) + ' more not shown: room]' });
        return;
      }
      out.push({ kind: 'li', text: items[k].text });
      room -= items[k].text.length + 1;
    }
  });
  return out;
}

/** VECTOR_GOVERNANCE's compiled part: the SMP rules in force. */
function _vdGovernanceBlocks_(ss) {
  const inForce = _bdSmpRows_(ss).filter(function (o) { return BD_SMP_IN_FORCE.indexOf(o.Status) !== -1; });
  const out = [{ kind: 'p', text: 'Rules in force for every theme: the APPROVED rows of ' + CFG.SMP_REGISTER_SHEET +
    ' (' + inForce.length + '). A PENDING or NEEDS_REVIEW SMP is not a standard.' }];
  if (!inForce.length) out.push({ kind: 'p', text: 'None approved yet.' });
  inForce.forEach(function (o) {
    out.push({ kind: 'li', text: _vdClip_(o.SMP_ID + ' — ' + o.Title + (o.Rule ? ': ' + o.Rule : '')) +
      ' (approved ' + (o.Decided_At || 'undated') + ')' });
  });
  return out;
}

function _vdIsTemplateOnly_(text) {
  if (String(text).indexOf(VD_TEMPLATE_MARK) === -1) return false;
  return String(text).split('\n').every(function (line) {
    const l = line.trim();
    return !l || /^VECTOR[:_ ]/.test(l) || /^Domain: /.test(l) || VD_TEMPLATE_LINES.indexOf(l) !== -1;
  });
}

function _vdMarkerIndex_(body) {
  const n = body.getNumChildren();
  for (let i = 0; i < n; i++) {
    const c = body.getChild(i);
    if (c.getText && String(c.getText()).trim() === VD_MARKER) return i;
  }
  return -1;
}

function _vdCompiledText_(body, markerIdx) {
  const parts = [];
  for (let i = markerIdx + 1; i < body.getNumChildren(); i++) {
    const c = body.getChild(i);
    parts.push(c.getText ? String(c.getText()) : '');
  }
  while (parts.length && !parts[parts.length - 1].trim()) parts.pop();
  return parts.join('\n');
}

/**
 * Writes one doc's compiled part below its marker, leaving everything
 * above it as it is. Returns 'created', 'written' or 'unchanged'.
 */
function _vdWriteDoc_(folder, name, blocks) {
  let file = null;
  const it = folder.getFilesByName(name);
  if (it.hasNext()) file = it.next();
  const state = file ? 'written' : 'created';
  const doc = file ? DocumentApp.openById(file.getId()) : DocumentApp.create(name);
  const body = doc.getBody();
  const wanted = blocks.map(function (b) { return b.text; }).join('\n');

  let markerIdx = _vdMarkerIndex_(body);
  if (markerIdx === -1) {
    if (state === 'created' || _vdIsTemplateOnly_(body.getText())) {
      const domain = VD_DOMAINS[name.replace('VECTOR_', '')];
      _clearDocBody_(body);
      body.appendParagraph(name + (domain ? ': ' + domain : '')).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      body.removeChild(body.getChild(0));
      body.appendParagraph(VD_OPERATOR_HEADING).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph('');
    }
    body.appendParagraph(VD_MARKER).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    markerIdx = body.getNumChildren() - 1;
  } else if (_vdCompiledText_(body, markerIdx) === wanted) {
    return 'unchanged';
  }

  // New content first, then the old compiled part between the marker and
  // it: the body's last element is never the one removed.
  const oldEnd = body.getNumChildren();
  _appendBlocks_(body, blocks);
  for (let i = oldEnd - 1; i > markerIdx; i--) body.removeChild(body.getChild(i));
  doc.saveAndClose();
  if (state === 'created') DriveApp.getFileById(doc.getId()).moveTo(folder);
  return state;
}

/**
 * Compiles every VECTOR_* doc. Each is written on its own: a failure is
 * reported to ERROR_LOG and leaves that doc as it was.
 */
function compileVectorDocs_() {
  const result = { written: [], unchanged: [], failed: [], stats: null };
  const folderId = PropertiesService.getScriptProperties().getProperty('ID_05_VECTOR_REPOSITORY');
  if (!folderId) {
    result.failed.push({ doc: '(all)', message: 'ID_05_VECTOR_REPOSITORY is not set. Run deployFullSystem().' });
    return result;
  }
  const folder = DriveApp.getFolderById(folderId);
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const collected = _vdCollect_(ss, _viThemes_());
  result.stats = collected.stats;
  const plan = Object.keys(collected.docs).sort().map(function (name) {
    return { name: name, build: function () { return _vdThemeBlocks_(collected.docs[name], collected.stats); } };
  });
  plan.push({ name: VD_GOVERNANCE_DOC, build: function () { return _vdGovernanceBlocks_(ss); } });
  plan.forEach(function (p) {
    try {
      const state = _vdWriteDoc_(folder, p.name, p.build());
      (state === 'unchanged' ? result.unchanged : result.written).push(p.name);
    } catch (e) {
      _reportError('compileVectorDocs_:' + p.name, e, null);
      result.failed.push({ doc: p.name, message: e.message });
    }
  });
  PropertiesService.getScriptProperties().setProperty(VD_LAST_RUN_PROP, JSON.stringify({
    at: new Date().toISOString(), written: result.written.length, unchanged: result.unchanged.length,
    failed: result.failed.length, stats: collected.stats,
  }));
  return result;
}

/** Editor entry point: compile now and log what changed. */
function compileVectorDocs() {
  const r = compileVectorDocs_();
  console.log('[VectorDocs] ' + JSON.stringify(r));
  return r;
}

/**
 * Read-only. Per VECTOR_* doc: marker, template, compiled length, and
 * whether the operator has written above it; when the compiler and the
 * labeler last ran; how many items await a label or were given up on;
 * which pinned core facts are empty.
 */
function checkVectorDocs() {
  const props = PropertiesService.getScriptProperties();
  const report = { lastCompile: null, lastLabelerRun: null, docs: [], notes: [] };
  try { report.lastCompile = JSON.parse(props.getProperty(VD_LAST_RUN_PROP) || 'null'); } catch (e) { /* unreadable */ }
  try { report.lastLabelerRun = JSON.parse(props.getProperty(VI_LAST_RUN_PROP) || 'null'); } catch (e) { /* unreadable */ }
  if (!report.lastCompile) report.notes.push('compileVectorDocs has never run.');
  else if (Date.now() - new Date(report.lastCompile.at).getTime() > 36 * 3600000) {
    report.notes.push('Last compile ' + report.lastCompile.at + ': over a day and a half ago. Is generateDailyPrimer running?');
  }
  if (!report.lastLabelerRun) report.notes.push('runVectorItemLabeler has never run. Run setupAllTriggers().');
  const s = report.lastCompile && report.lastCompile.stats;
  if (s && s.awaiting) report.notes.push(s.awaiting + ' item(s) await a label. If that does not fall, check checkVectorItemLiveness().');
  if (s && s.givenUp) report.notes.push(s.givenUp + ' item(s) were sent ' + VI_MAX_ATTEMPTS + ' times with no label: Kind ' +
    VI_GIVEN_UP + ' in ' + VI_LABEL_TAB + '. Label them there by hand.');
  if (s && s.nameReview && s.nameReview.length) report.notes.push('Read these compiled item(s) once: each has what may be ' +
    'a person\'s name. If one does name a person, set its Kind to PERSONAL in ' + VI_LABEL_TAB + ': ' + s.nameReview.join('; '));
  if (s && s.emptyPinned && s.emptyPinned.length) report.notes.push('Pinned core fact(s) with no text, left out: ' +
    s.emptyPinned.join(', ') + '. Write the fact in INCUBATOR\'s Core_Fact column.');
  const folderId = props.getProperty('ID_05_VECTOR_REPOSITORY');
  if (!folderId) { report.notes.push('ID_05_VECTOR_REPOSITORY is not set.'); console.log('[VectorDocs] ' + JSON.stringify(report)); return report; }
  const it = DriveApp.getFolderById(folderId).getFiles();
  let seen = 0;
  while (it.hasNext() && seen < VD_FOLDER_SCAN_MAX) {
    seen++;
    const f = it.next();
    const name = String(f.getName());
    if (name.indexOf('VECTOR_') !== 0) continue;
    const body = DocumentApp.openById(f.getId()).getBody();
    const idx = _vdMarkerIndex_(body);
    let operatorChars = 0;
    for (let i = 1; i < (idx === -1 ? 0 : idx); i++) {
      const t = String(body.getChild(i).getText ? body.getChild(i).getText() : '').trim();
      if (t && t !== VD_OPERATOR_HEADING) operatorChars += t.length;
    }
    report.docs.push({ name: name, compiled: idx !== -1, templateOnly: _vdIsTemplateOnly_(body.getText()),
      compiledChars: idx === -1 ? 0 : _vdCompiledText_(body, idx).length, operatorChars: operatorChars });
  }
  report.docs.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  console.log('[VectorDocs] ' + JSON.stringify(report));
  return report;
}

/**
 * Read-only. Where the record holds items the labeler marked PERSONAL (a
 * named person, or private life): tab and row, or the lessons doc's session
 * heading, with the item. For the operator's 10-19 decision to scrub
 * student data from KOS: this lists, it changes nothing. Items not yet
 * labelled aren't listed; run it again once checkVectorDocs shows none
 * awaiting.
 * @returns {{personal:number, awaiting:number, items:{loc:string, session:string, text:string}[]}}
 */
function listPersonalItems() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const record = _viItems_(ss);
  const sheet = ss.getSheetByName(VI_LABEL_TAB);
  const labels = sheet ? _viLabels_(sheet) : {};
  const out = { personal: 0, awaiting: 0, items: [] };
  record.items.forEach(function (it) {
    const l = labels[it.id];
    if (!l) { out.awaiting++; return; }
    if (l.kind !== 'PERSONAL') return;
    out.personal++;
    out.items.push({ loc: it.loc, session: it.session, text: _vdClip_(it.text, 200) });
  });
  out.items.sort(function (a, b) { return a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0; });
  console.log('[VectorItems] ' + out.personal + ' PERSONAL item(s) in the record' +
    (out.awaiting ? '; ' + out.awaiting + ' not labelled yet, so not checked' : '') + '.');
  out.items.forEach(function (x) { console.log('  ' + x.loc + ' (' + x.session + '): ' + x.text); });
  return out;
}

// ================================================================
// END 25_VectorDocs.gs
// ================================================================
