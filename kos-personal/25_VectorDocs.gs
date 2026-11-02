// ================================================================
// 25_VectorDocs.gs — KOS v8.0
// BOUND TO: kos-personal (main flat-folder project)
// ================================================================
//
// Keeps the VECTOR_* docs in 05_Vector_Repository filled, every morning,
// from the operator's own record. They are the Registrar's Stage 2
// standard (24_RegistrarFlows.gs reads them into the "Master Vector
// Primer"), and until 2026-11-02 they were the templates setup made on
// 2026-05-18: placeholders only, so Stage 2 scored every draft 0.0 against
// nothing. Nothing wrote to them: _routeToVectorDocs (4) runs only on the
// old inference path, and the VECTOR_CLASSIFY flow's path writes
// VECTOR_MATRIX instead.
//
// NO MODEL CALL. Every line is something already recorded, copied with
// its date and its session, so Stage 2 can cite it and the operator can
// trace it:
//
//   source (BRAIN_TRUST_INDEX / Drive)      what it is
//   ─────────────────────────────────────   ────────────────────────────────
//   INCUBATOR, PROMOTED_MANUAL rows          core facts the operator pinned
//   DECISION_REGISTER, RESOLVED rows         a decision and the operator's
//                                            own resolution note
//   ACTION_REGISTER, Type = DECISION         decisions a session recorded
//   PIVOTS_AND_LESSONS doc                   lessons a session recorded
//   DECISION_REGISTER, OPEN rows             unsettled: listed so Stage 2
//                                            knows they are NOT standards
//   SMP_REGISTER, APPROVED rows              rules in force (VECTOR_GOVERNANCE)
//
// The session rows were extracted by the Curator flow and passed its
// Auditor check before the intake wrote them (3_Queue_Processor.gs).
// DROPPED decisions are left out.
//
// WHICH THEME. A session belongs to a theme when its VECTOR_MATRIX score
// for that theme is at least VD_THEME_MIN, or the theme is its highest
// score. Everything that session recorded goes to those themes' docs. A
// session with no VECTOR_MATRIX row is counted, not guessed at.
//
// ORDER AND SIZE. Most authoritative first (pinned, settled, decided,
// lessons, then the unsettled list), newest first within each, each item
// at most VD_ITEM_MAX characters, each doc's compiled part at most
// VD_DOC_MAX. The primer (24) shares its room between the docs and cuts a
// doc from the end, so what a tight cell loses is the least authoritative.
//
// THE OPERATOR'S OWN TEXT IS NEVER TOUCHED. Each doc has two parts: the
// operator's principles, then a VD_MARKER heading. Only what follows the
// marker is rewritten. A doc still holding only the setup template is
// replaced by the layout; a doc with anything else in it and no marker
// keeps all of it, and gets the marker after it.
//
// A doc is written only when its compiled text changed, so a quiet day
// adds no revision. The doc carries the date of its newest source, not of
// the run; checkVectorDocs() reports when the compiler last ran.
//
// ENTRY POINTS (no trailing underscore — GAS hides those from the Run
// dropdown):
//   compileVectorDocs()   — run now (generateDailyPrimer runs it daily)
//   checkVectorDocs()     — read-only: per doc, items by kind, last run
// ================================================================

const VD_MARKER = 'COMPILED EVIDENCE (rewritten every morning by compileVectorDocs; write above this line)';
const VD_OPERATOR_HEADING = 'OPERATOR PRINCIPLES (yours; kept as written, and ranked first)';
const VD_GOVERNANCE_DOC = 'VECTOR_GOVERNANCE';
const VD_THEME_MIN = 0.25;
const VD_ITEM_MAX = 280;
const VD_DOC_MAX = 6000;
const VD_PER_SECTION_MAX = 25;
const VD_FOLDER_SCAN_MAX = 200;
const VD_LAST_RUN_PROP = 'VECTOR_DOCS_LAST_RUN';
// The setup template's placeholder (_scaffoldVectorDoc, 1): a doc holding
// it and nothing of the operator's is replaced, not appended to.
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
// READ THE RECORD
// ================================================================

function _vdClip_(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > VD_ITEM_MAX ? t.slice(0, VD_ITEM_MAX - 1) + '…' : t;
}

function _vdTime_(v) {
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

/** {sessionStem: {THEME: score}} from VECTOR_MATRIX, the highest score per stem. */
function _vdSessionThemes_(ss, themes) {
  const sheet = ss.getSheetByName(CFG.VECTOR_MATRIX_SHEET);
  const out = {};
  if (!sheet || sheet.getLastRow() <= 1) return out;
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const header = values[0].map(function (h) { return String(h).trim().toUpperCase(); });
  const cols = {};
  themes.forEach(function (t) { const i = header.indexOf(t); if (i !== -1) cols[t] = i; });
  for (let r = 1; r < values.length; r++) {
    const stem = _bdSessionStem_(values[r][0]);
    if (!stem) continue;
    const s = out[stem] = out[stem] || {};
    Object.keys(cols).forEach(function (t) {
      const v = parseFloat(values[r][cols[t]]);
      if (!isNaN(v) && v > (s[t] || 0)) s[t] = v;
    });
  }
  return out;
}

/** The themes a session belongs to: at or over VD_THEME_MIN, plus its top theme. */
function _vdThemesFor_(scores) {
  if (!scores) return [];
  let top = null;
  const out = [];
  Object.keys(scores).forEach(function (t) {
    if (scores[t] >= VD_THEME_MIN) out.push(t);
    if (scores[t] > 0 && (!top || scores[t] > scores[top])) top = t;
  });
  if (top && out.indexOf(top) === -1) out.push(top);
  return out;
}

/** DECISION_REGISTER rows: [{status, sessionUid, at, decision, note, resolvedAt}]. */
function _vdRegister_(ss) {
  const sheet = ss.getSheetByName(CFG.DECISION_REGISTER_SHEET);
  if (!sheet) return [];
  const C = _bdCols_();
  return _bdRows_(sheet).filter(function (r) { return String(r[C.Decision_ID]).trim(); }).map(function (r) {
    return {
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
    .filter(function (r) { return String(r[2]).trim().toUpperCase() === 'DECISION' && String(r[3]).trim(); })
    .map(function (r) { return { sessionUid: String(r[0]).trim(), at: r[1], item: String(r[3]) }; });
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
    const text = String(body.getChild(i).getText ? body.getChild(i).getText() : '').trim();
    if (!text) continue;
    const m = /^\[Session: ([^|\]]+)\|\s*([^\]]+)\]$/.exec(text);
    if (m) { current = { at: m[1].trim(), sessionUid: m[2].trim() }; continue; }
    if (current) out.push({ sessionUid: current.sessionUid, at: current.at, item: text });
  }
  return out;
}

/**
 * Everything each doc will list, by doc name. Pure on what it is given,
 * so the test can hold the attribution and ordering without Drive.
 */
function _vdCollect_(ss, themes) {
  const sessionThemes = _vdSessionThemes_(ss, themes);
  const docs = {};
  themes.forEach(function (t) {
    docs['VECTOR_' + t] = { theme: t, pinned: [], settled: [], decided: [], lessons: [], open: [], sessions: {} };
  });
  const unattributed = {};
  const add = function (sessionUid, kind, entry) {
    const stem = _bdSessionStem_(sessionUid);
    const ts = _vdThemesFor_(sessionThemes[stem]);
    if (!ts.length) { unattributed[stem] = true; return; }
    ts.forEach(function (t) {
      const d = docs['VECTOR_' + t];
      d[kind].push(entry);
      d.sessions[stem] = true;
    });
  };

  _readPinnedCoreFacts_(ss).forEach(function (f) {
    const d = docs['VECTOR_' + String(f.theme).trim().toUpperCase()];
    if (d) d.pinned.push({ t: 0, text: _vdClip_(f.fact) });
  });
  _vdRegister_(ss).forEach(function (r) {
    if (r.status === 'RESOLVED') {
      add(r.sessionUid, 'settled', { t: _vdTime_(r.resolvedAt) || _vdTime_(r.at),
        text: _vdClip_(r.decision + (r.note ? ' — Resolved: ' + r.note : '')) +
          ' (' + (_bdDay_(r.resolvedAt) || _bdDay_(r.at) || 'undated') + ', ' + _bdSessionStem_(r.sessionUid) + ')' });
    } else if (r.status === 'OPEN') {
      add(r.sessionUid, 'open', { t: _vdTime_(r.at),
        text: _vdClip_(r.decision) + ' (' + (_bdDay_(r.at) || 'undated') + ', ' + _bdSessionStem_(r.sessionUid) + ')' });
    }
  });
  _vdSessionDecisions_(ss).forEach(function (r) {
    add(r.sessionUid, 'decided', { t: _vdTime_(r.at),
      text: _vdClip_(r.item) + ' (' + (_bdDay_(r.at) || 'undated') + ', ' + _bdSessionStem_(r.sessionUid) + ')' });
  });
  _vdLessons_().forEach(function (r) {
    add(r.sessionUid, 'lessons', { t: _vdTime_(r.at),
      text: _vdClip_(r.item) + ' (' + (_bdDay_(r.at) || 'undated') + ', ' + _bdSessionStem_(r.sessionUid) + ')' });
  });
  return { docs: docs, unattributed: Object.keys(unattributed).length };
}


// ================================================================
// RENDER
// ================================================================

const VD_SECTIONS = [
  ['pinned', 'Core facts you pinned (do not contradict)'],
  ['settled', 'Settled: decisions you resolved, with your note'],
  ['decided', 'Decided in sessions'],
  ['lessons', 'Lessons and pivots from sessions'],
  ['open', 'Unsettled: open decisions. NOT a standard; do not score drift against these'],
];

/** The compiled part of one theme doc, as blocks, at most VD_DOC_MAX characters. */
function _vdThemeBlocks_(d) {
  const newest = function (a, b) { return b.t - a.t; };
  const total = VD_SECTIONS.reduce(function (n, s) { return n + d[s[0]].length; }, 0);
  const latest = VD_SECTIONS.reduce(function (m, s) {
    return d[s[0]].reduce(function (mm, e) { return Math.max(mm, e.t); }, m);
  }, 0);
  const out = [];
  let used = 0;
  const push = function (b) { out.push(b); used += b.text.length + 1; };
  push({ kind: 'p', text: 'Theme ' + d.theme + (VD_DOMAINS[d.theme] ? ' (' + VD_DOMAINS[d.theme] + ')' : '') + '. ' +
    Object.keys(d.sessions).length + ' session(s), ' + total + ' item(s); newest source ' +
    (latest ? Utilities.formatDate(new Date(latest), Session.getScriptTimeZone(), 'yyyy-MM-dd') : 'none') +
    '. Each item: what was recorded (date, session).' });
  if (!total) {
    push({ kind: 'p', text: 'No recorded evidence for this theme yet. There is no standard here to measure drift against: ' +
      'treat this theme as having none, never as a draft being on standard.' });
    return out;
  }
  let full = false;
  VD_SECTIONS.forEach(function (s) {
    const items = d[s[0]].slice().sort(newest);
    if (!items.length || full) return;
    const shown = items.slice(0, VD_PER_SECTION_MAX);
    push({ kind: 'h2', text: s[1] + ' (' + items.length + ')' });
    for (let i = 0; i < shown.length; i++) {
      if (used + shown[i].text.length > VD_DOC_MAX) {
        push({ kind: 'p', text: '[… ' + (items.length - i) + ' more not shown: room]' });
        full = true;
        return;
      }
      push({ kind: 'li', text: shown[i].text });
    }
    if (items.length > shown.length) push({ kind: 'p', text: '[… ' + (items.length - shown.length) + ' older not shown]' });
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


// ================================================================
// WRITE
// ================================================================

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
  let doc;
  let state = 'written';
  if (!file) {
    doc = DocumentApp.create(name);
    state = 'created';
  } else {
    doc = DocumentApp.openById(file.getId());
  }
  const body = doc.getBody();
  const wanted = blocks.map(function (b) { return b.text; }).join('\n');

  let markerIdx = _vdMarkerIndex_(body);
  if (markerIdx === -1) {
    if (state === 'created' || _vdIsTemplateOnly_(body.getText())) {
      _clearDocBody_(body);
      body.appendParagraph(name + (VD_DOMAINS[name.replace('VECTOR_', '')] ? ': ' +
        VD_DOMAINS[name.replace('VECTOR_', '')] : '')).setHeading(DocumentApp.ParagraphHeading.HEADING1);
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
 * @returns {{written:string[], unchanged:string[], failed:{doc:string,message:string}[], unattributedSessions:number}}
 */
function compileVectorDocs_() {
  const result = { written: [], unchanged: [], failed: [], unattributedSessions: 0 };
  const folderId = PropertiesService.getScriptProperties().getProperty('ID_05_VECTOR_REPOSITORY');
  if (!folderId) {
    result.failed.push({ doc: '(all)', message: 'ID_05_VECTOR_REPOSITORY is not set. Run deployFullSystem().' });
    return result;
  }
  const folder = DriveApp.getFolderById(folderId);
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const collected = _vdCollect_(ss, _getKnownVectors());
  result.unattributedSessions = collected.unattributed;
  const plan = Object.keys(collected.docs).sort().map(function (name) {
    return { name: name, build: function () { return _vdThemeBlocks_(collected.docs[name]); } };
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
    failed: result.failed.length, unattributedSessions: result.unattributedSessions,
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
 * Read-only. Per VECTOR_* doc: whether it has the marker, whether it is
 * still the setup template, how long its compiled part is and whether the
 * operator has written anything above it; and when the compiler last ran.
 */
function checkVectorDocs() {
  const props = PropertiesService.getScriptProperties();
  const report = { lastRun: null, docs: [], notes: [] };
  try { report.lastRun = JSON.parse(props.getProperty(VD_LAST_RUN_PROP) || 'null'); } catch (e) { /* unreadable */ }
  if (!report.lastRun) report.notes.push('compileVectorDocs has never run. Run it once, or wait for generateDailyPrimer.');
  else if (Date.now() - new Date(report.lastRun.at).getTime() > 36 * 3600000) {
    report.notes.push('Last run ' + report.lastRun.at + ': over a day and a half ago. Is generateDailyPrimer running?');
  }
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
    for (let i = 0; i < (idx === -1 ? 0 : idx); i++) {
      const t = String(body.getChild(i).getText ? body.getChild(i).getText() : '').trim();
      if (t && t !== VD_OPERATOR_HEADING && i > 0) operatorChars += t.length;
    }
    report.docs.push({ name: name, compiled: idx !== -1, templateOnly: _vdIsTemplateOnly_(body.getText()),
      compiledChars: idx === -1 ? 0 : _vdCompiledText_(body, idx).length, operatorChars: operatorChars });
  }
  report.docs.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  console.log('[VectorDocs] ' + JSON.stringify(report));
  return report;
}

// ================================================================
// END 25_VectorDocs.gs
// ================================================================
