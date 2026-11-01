// ================================================================
// 24_RegistrarFlows.gs — KOS v8.0
// BOUND TO: kos-personal (main flat-folder project)
// ================================================================
//
// The Registrar's two Studio flows (D14, built 2026-11-01), in the shape
// meta/FLOW_DOCTRINE.md calls the only one that works here:
//
//   Apps Script                       Workspace Flow             Apps Script
//   materialize a flat row     ──▶    read the row          ──▶  harvest
//   (runRegistrarMicrobatch,          one Gemini call             (runRegistrarProcessor,
//    at release)                      add a REGISTRAR_RETURN row   before its sweep)
//
// 11_Registrar_CogRelay.gs's design had each flow read the curriculum draft
// from Drive itself and write Cog_N_JSON_Output and Current_State straight
// onto REGISTRAR_LEDGER. Neither flow was ever built, and that shape is the
// one rule 1 and CHANGELOG.md's Round 17 incident rule out: a live Drive
// read in Studio can fail silently while Gemini still returns well-formed
// JSON, and a flow that writes state can't be checked by anything. So:
//
//   - RegistrarStage1Input / RegistrarStage2Input: one flat row per release,
//     the same five columns as 13's CuratorInput. Stage 1's SourceText is
//     the draft (its first CFG.REGISTRAR_MAX_CHARS characters). Stage 2's
//     is three labelled sections in one cell: the draft, Stage 1's JSON,
//     and the VECTOR_* digest (the "Master Vector Primer", the operator's
//     choice 2026-11-01: each VECTOR_* doc in 05_Vector_Repository, named
//     by theme, sharing what is left of the cell). One cell, so each
//     flow's prompt is one chip after the PromptText, nothing typed.
//     Status starts and stays READY, so each flow's trigger is one
//     condition on its own tab (rule 14).
//   - REGISTRAR_RETURN: the flow's last step appends Returned_At,
//     Release_ID (from the input row) and Output_JSON (Gemini's answer).
//   - harvestRegistrarReturns(): matches each return to the ledger by
//     Release_ID, checks it is the current release and grounded in the
//     text the model was given (rule 15), writes Cog_N_JSON_Output and
//     moves the row to PENDING_VALIDATION_N. 11's validators take it from
//     there, unchanged.
//
// Release_ID = File_ID + "|" + stage + "|" + the release's time in ms. A
// stale reset releases the row again with a new time, so a late answer to
// an old release is recognised and set aside (STALE), never applied.
//
// ENTRY POINTS (no trailing underscore — GAS hides those from the Run
// dropdown):
//   harvestRegistrarReturns()       — run by runRegistrarProcessor (11) each
//                                     pass; safe to run by hand
//   checkRegistrarFlowBinding()     — are the flow's output columns right?
//   checkRegistrarFlowLiveness()    — has either flow ever answered?
//   installRegistrarFlowFixture()   — a scratch draft queued for Stage 1
//   removeRegistrarFlowFixtures()   — and back out
//   runRegistrarFlowCanary()        — the Apps Script half end to end, with
//                                     the flow stubbed (it says so)
// ================================================================

const RG_STAGE1_TAB = 'RegistrarStage1Input';
const RG_STAGE2_TAB = 'RegistrarStage2Input';
const RG_RETURN_TAB = 'REGISTRAR_RETURN';

// Both input tabs share one shape.
const RG_INPUT_COLS = {
  TIMESTAMP:   0,
  RELEASE_ID:  1,
  FILE_ID:     2, // traceability only; the harvest goes by Release_ID
  SOURCE_TEXT: 3, // everything the model reads after its prompt
  STATUS:      4, // starts and stays READY: the flow's one trigger condition
};
const RG_INPUT_HEADERS = ['Timestamp', 'Release_ID', 'File_ID', 'SourceText', 'Status'];

// What the flow's last step writes, and what the harvest adds.
const RG_RETURN_COLS = {
  RETURNED_AT:    0, // flow
  RELEASE_ID:     1, // flow, from the input row
  OUTPUT_JSON:    2, // flow, Gemini's output
  HARVEST_STATUS: 3, // harvest: HARVESTED, STALE, NOT_GROUNDED, BAD_RELEASE_ID, EMPTY
  ERROR:          4, // harvest
};
const RG_RETURN_HEADERS = ['Returned_At', 'Release_ID', 'Output_JSON', 'Harvest_Status', 'Error'];

// A Sheets cell holds 50,000 characters. Stage 2's cell: the draft (up to
// CFG.REGISTRAR_MAX_CHARS), Stage 1's JSON (up to RG_STAGE1_JSON_MAX), and
// the primer in what is left, at most RG_PRIMER_MAX_CHARS.
const RG_CELL_MAX = 49000;
const RG_PRIMER_MAX_CHARS = 15000;
const RG_STAGE1_JSON_MAX = 8000;
const RG_STAGE2_LABELS = {
  source: 'SOURCE DOCUMENT (the curriculum draft):\n',
  stage1: '\n\nSTAGE 1 OUTPUT TO VERIFY (Cog_1_JSON_Output):\n',
  primer: '\n\nMASTER VECTOR PRIMER (the standard to measure drift against):\n',
};
const RG_FIXTURE_PREFIX = 'FIXTURE-RG-';
const RG_GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
// An input row with no return after this long is reported by the liveness
// check: the flow's own trigger, or the flow, is not running.
const RG_LIVENESS_WAIT_MINS = 30;


// ================================================================
// MATERIALIZE — called by runRegistrarMicrobatch (11) at release
// ================================================================

function _rgReleaseId_(fileId, stage, releasedAtMs) {
  return String(fileId) + '|' + stage + '|' + releasedAtMs;
}

function _rgParseReleaseId_(id) {
  const m = /^([^|]+)\|([12])\|(\d+)$/.exec(String(id || '').trim());
  return m ? { fileId: m[1], stage: Number(m[2]), releasedAt: Number(m[3]) } : null;
}

/**
 * The draft's text for a flow, or why there is none. A file that isn't a
 * Google Doc can never be read this way (deterministic, rule 17: fail now);
 * a Doc that can't be opened this minute may open next time (retryable).
 * @returns {{ok:true,text:string}|{ok:false,deterministic:boolean,reason:string}}
 */
function _rgReadDraft_(fileId) {
  let mime = '';
  try {
    mime = DriveApp.getFileById(fileId).getMimeType();
  } catch (e) {
    return { ok: false, deterministic: false, reason: 'Drive could not find the file just now: ' + e.message };
  }
  if (mime && mime !== RG_GOOGLE_DOC_MIME) {
    return { ok: false, deterministic: true,
      reason: 'The file is not a Google Doc (' + mime + '). Open it in Drive, use File > Save as Google Docs, and drop the copy in ' +
        CFG.REGISTRAR_UNC_FOLDER + '.' };
  }
  try {
    const text = DocumentApp.openById(fileId).getBody().getText();
    return { ok: true, text: text.length > CFG.REGISTRAR_MAX_CHARS ? text.slice(0, CFG.REGISTRAR_MAX_CHARS) : text };
  } catch (e) {
    return { ok: false, deterministic: false, reason: 'The Doc could not be opened just now: ' + e.message };
  }
}

/**
 * The comparison standard for Stage 2: every Google Doc named VECTOR_* in
 * 05_Vector_Repository, by name, each under its own heading, sharing
 * RG_PRIMER_MAX_CHARS. A doc cut short says so. Read once per run.
 */
function _rgVectorPrimer_(maxChars) {
  const budget = maxChars === undefined ? RG_PRIMER_MAX_CHARS : maxChars;
  const folderId = PropertiesService.getScriptProperties().getProperty('ID_05_VECTOR_REPOSITORY');
  if (!folderId) return '(No VECTOR_* docs: ID_05_VECTOR_REPOSITORY is not set.)';
  const docs = [];
  try {
    const it = DriveApp.getFolderById(folderId).getFiles();
    let seen = 0;
    while (it.hasNext() && seen < 200) {
      seen++;
      const f = it.next();
      const name = String(f.getName());
      if (name.indexOf('VECTOR_') !== 0) continue;
      if (f.getMimeType && f.getMimeType() !== RG_GOOGLE_DOC_MIME) continue;
      docs.push({ id: f.getId(), name: name });
    }
  } catch (e) {
    return '(The VECTOR_* docs could not be listed: ' + e.message + ')';
  }
  if (!docs.length) return '(No VECTOR_* docs in 05_Vector_Repository yet.)';
  docs.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  const share = Math.max(0, Math.floor(budget / docs.length) - 60);
  return docs.map(function (d) {
    let text = '';
    try { text = DocumentApp.openById(d.id).getBody().getText(); }
    catch (e) { text = '(could not be read: ' + e.message + ')'; }
    const cut = text.length > share;
    return '### ' + d.name + '\n' + (cut ? text.slice(0, share) + '\n[… cut short: this doc is longer]' : text);
  }).join('\n\n');
}

/**
 * Writes the flat input row for one release. ctx caches the sheets and the
 * primer across a run. Returns _rgReadDraft_'s failure, or { ok: true }.
 */
function _rgMaterialize_(ctx, row, stage, releasedAtMs) {
  const RC = CFG.REGISTRAR_COLS;
  const fileId = String(row[RC.FILE_ID]);
  const draft = _rgReadDraft_(fileId);
  if (!draft.ok) return draft;
  const releaseId = _rgReleaseId_(fileId, stage, releasedAtMs);
  if (stage === 1) {
    if (!ctx.stage1) ctx.stage1 = _rgInputSheet_(ctx.ss, RG_STAGE1_TAB);
    ctx.stage1.appendRow([new Date(), releaseId, fileId, draft.text, 'READY']);
  } else {
    if (!ctx.stage2) ctx.stage2 = _rgInputSheet_(ctx.ss, RG_STAGE2_TAB);
    let stage1 = String(row[RC.COG1_JSON] || '');
    if (stage1.length > RG_STAGE1_JSON_MAX) stage1 = stage1.slice(0, RG_STAGE1_JSON_MAX) + '\n[… cut short]';
    const L = RG_STAGE2_LABELS;
    const head = L.source + draft.text + L.stage1 + stage1 + L.primer;
    const room = Math.min(RG_PRIMER_MAX_CHARS, RG_CELL_MAX - head.length);
    if (ctx.primer === undefined || ctx.primerRoom !== room) { ctx.primer = _rgVectorPrimer_(room); ctx.primerRoom = room; }
    ctx.stage2.appendRow([new Date(), releaseId, fileId, (head + ctx.primer).slice(0, RG_CELL_MAX), 'READY']);
  }
  return { ok: true, releaseId: releaseId };
}

// _getOrCreateSheet (5) writes each tab's headers from its own literal map,
// which the test holds to RG_INPUT_HEADERS / RG_RETURN_HEADERS.
function _rgInputSheet_(ss, name) {
  return _getOrCreateSheet(ss, name);
}

// Makes the two input tabs and the return tab if missing; returns the return tab.
function _rgEnsureTabs_(ss) {
  _rgInputSheet_(ss, RG_STAGE1_TAB);
  _rgInputSheet_(ss, RG_STAGE2_TAB);
  return _rgReturnSheet_(ss);
}

function _rgReturnSheet_(ss) {
  return _getOrCreateSheet(ss, RG_RETURN_TAB);
}


// ================================================================
// HARVEST
// ================================================================

/**
 * Applies every unharvested REGISTRAR_RETURN row to REGISTRAR_LEDGER.
 * Called by runRegistrarProcessor (11) under its lock, before its sweep, so
 * a harvested row is validated in the same pass. Each return is marked
 * once and never re-read:
 *   HARVESTED       Cog_N_JSON_Output written, state PENDING_VALIDATION_N
 *   STALE           not the row's current release (a stale reset sent it
 *                   again, or it has moved on): set aside, ledger untouched
 *   NOT_GROUNDED    Stage 1 output shares nothing with the draft, or says
 *                   it could not read it: the row bounces to
 *                   QUEUED_FOR_COG_1 (a fresh call may read it; counts
 *                   toward the retry limit)
 *   EMPTY           no output: bounced the same way
 *   BAD_RELEASE_ID  the flow's Release_ID binding is wrong: deterministic,
 *                   nothing to retry; checkRegistrarFlowBinding() says so
 * @returns {{harvested:number, stale:number, notGrounded:number, empty:number, badId:number}}
 */
function harvestRegistrarReturns() {
  const out = { harvested: 0, stale: 0, notGrounded: 0, empty: 0, badId: 0 };
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  // All three tabs exist, with headers, from the first pass after a push:
  // Studio binds a flow's trigger and its "add row" step to a tab that is
  // already there.
  const returns = _rgEnsureTabs_(ss);
  if (returns.getLastRow() < 2) return out;
  const ledger = _getOrCreateSheet(ss, CFG.REGISTRAR_LEDGER_SHEET);
  const RC = CFG.REGISTRAR_COLS;
  const R = RG_RETURN_COLS;
  const width = RG_RETURN_HEADERS.length;
  const rows = returns.getRange(2, 1, returns.getLastRow() - 1, width).getValues();
  const released = _readRegistrarReleaseMap();
  let releasedChanged = false;
  const sourceCache = {};

  const mark = function (i, status, error) {
    returns.getRange(i + 2, R.HARVEST_STATUS + 1, 1, 2).setValues([[status, error || '']]);
  };

  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][R.HARVEST_STATUS] || '').trim()) continue;
    const rel = _rgParseReleaseId_(rows[i][R.RELEASE_ID]);
    if (!rel) { mark(i, 'BAD_RELEASE_ID', 'Release_ID is not File_ID|stage|time: bind it to the input row\'s Release_ID.'); out.badId++; continue; }

    const lastRow = ledger.getLastRow();
    const data = lastRow > 1 ? ledger.getRange(2, 1, lastRow - 1, 10).getValues() : [];
    const idx = data.findIndex(function (r) { return String(r[RC.FILE_ID]) === rel.fileId; });
    const activeState = 'COG_' + rel.stage + '_ACTIVE';
    if (idx === -1 || String(data[idx][RC.STATE]) !== activeState || Number(released[rel.fileId]) !== rel.releasedAt) {
      mark(i, 'STALE', idx === -1 ? 'No ledger row for this file.' :
        'Not the current release (the row is ' + data[idx][RC.STATE] + ').');
      out.stale++;
      continue;
    }
    const sheetRow = idx + 2;
    const text = _srStripJsonFence_(_srUnwrapStudioLinks_(rows[i][R.OUTPUT_JSON])).trim();
    const fallback = rel.stage === 1 ? 'QUEUED_FOR_COG_1' : 'READY_FOR_COG_2';
    if (!text) {
      mark(i, 'EMPTY', 'The flow returned no output.');
      _bounceRegistrarRow(ledger, sheetRow, data[idx], fallback, 'Stage ' + rel.stage + ' flow returned no output.');
      delete released[rel.fileId]; releasedChanged = true;
      out.empty++;
      continue;
    }
    if (rel.stage === 1) {
      if (sourceCache[rows[i][R.RELEASE_ID]] === undefined) {
        sourceCache[rows[i][R.RELEASE_ID]] = _rgInputSourceText_(ss, RG_STAGE1_TAB, String(rows[i][R.RELEASE_ID]).trim());
      }
      const g = _rgCheckGrounded_(sourceCache[rows[i][R.RELEASE_ID]], text);
      if (!g.grounded) {
        mark(i, 'NOT_GROUNDED', g.reason);
        _bounceRegistrarRow(ledger, sheetRow, data[idx], fallback, 'Stage 1 output not grounded in the draft: ' + g.reason);
        delete released[rel.fileId]; releasedChanged = true;
        out.notGrounded++;
        continue;
      }
    }
    const col = rel.stage === 1 ? RC.COG1_JSON : RC.COG2_JSON;
    ledger.getRange(sheetRow, col + 1).setValue(text);
    ledger.getRange(sheetRow, RC.STATE + 1).setValue('PENDING_VALIDATION_' + rel.stage);
    delete released[rel.fileId]; releasedChanged = true;
    mark(i, 'HARVESTED', '');
    out.harvested++;
  }
  if (releasedChanged) _writeRegistrarReleaseMap(released);
  if (out.harvested + out.stale + out.notGrounded + out.empty + out.badId) {
    console.log('[RegistrarFlows] harvest — ' + JSON.stringify(out));
  }
  return out;
}

// The SourceText the model was given for one release, or null.
function _rgInputSourceText_(ss, tab, releaseId) {
  const sheet = ss.getSheetByName(tab);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const C = RG_INPUT_COLS;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, RG_INPUT_HEADERS.length).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][C.RELEASE_ID]).trim() === releaseId) return String(rows[i][C.SOURCE_TEXT] || '');
  }
  return null;
}

/**
 * Rule 15, against the text the model was actually given (the input row),
 * not a fresh read of the doc: 12's two checks. A self-reported
 * non-access phrase fails outright; past SR_GROUNDEDNESS_MIN_CHARS, the
 * output must share at least one of the draft's distinguishing words.
 */
function _rgCheckGrounded_(sourceText, outputText) {
  const lower = String(outputText).toLowerCase();
  const phrase = SR_NON_ACCESS_PHRASES.find(function (p) { return lower.indexOf(p) !== -1; });
  if (phrase) return { grounded: false, reason: 'the output says it could not read its source ("' + phrase + '").' };
  if (sourceText === null) return { grounded: true }; // input row gone: nothing to compare with
  if (sourceText.length < SR_GROUNDEDNESS_MIN_CHARS) return { grounded: true };
  const words = _srDistinguishingWords_(sourceText);
  if (!words.length || words.some(function (w) { return lower.indexOf(w) !== -1; })) return { grounded: true };
  return { grounded: false,
    reason: 'the output shares none of the draft\'s ' + words.length + ' most distinguishing words (e.g. ' +
      words.slice(0, 5).join(', ') + ').' };
}


// ================================================================
// CHECKS (rule 9), FIXTURE, CANARY
// ================================================================

/**
 * Read-only. Are the flow's output columns bound right? Reads
 * REGISTRAR_RETURN's header and its rows: a Release_ID that doesn't parse,
 * or matches no input row, means the flow's Release_ID chip is bound to
 * the wrong column; an Output_JSON that doesn't start with "{" means the
 * output chip is. Logs the binding to copy.
 */
function checkRegistrarFlowBinding() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const report = { ok: true, header: null, rows: 0, badReleaseId: 0, unmatchedReleaseId: 0, notJson: 0, notes: [] };
  const returns = ss.getSheetByName(RG_RETURN_TAB);
  if (!returns || returns.getLastRow() < 1) {
    report.notes.push('No ' + RG_RETURN_TAB + ' tab yet: no flow has written to it. Build the flows from FlowBuildSpec.');
  } else {
    report.header = returns.getRange(1, 1, 1, RG_RETURN_HEADERS.length).getValues()[0].map(String);
    if (report.header.join('|') !== RG_RETURN_HEADERS.join('|')) {
      report.ok = false;
      report.notes.push('Header is "' + report.header.join(', ') + '"; expected "' + RG_RETURN_HEADERS.join(', ') + '".');
    }
    const known = {};
    [RG_STAGE1_TAB, RG_STAGE2_TAB].forEach(function (tab) {
      const s = ss.getSheetByName(tab);
      if (!s || s.getLastRow() < 2) return;
      s.getRange(2, RG_INPUT_COLS.RELEASE_ID + 1, s.getLastRow() - 1, 1).getValues()
        .forEach(function (r) { known[String(r[0]).trim()] = true; });
    });
    if (returns.getLastRow() > 1) {
      returns.getRange(2, 1, returns.getLastRow() - 1, RG_RETURN_HEADERS.length).getValues().forEach(function (r) {
        report.rows++;
        const id = String(r[RG_RETURN_COLS.RELEASE_ID]).trim();
        if (!_rgParseReleaseId_(id)) report.badReleaseId++;
        else if (!known[id]) report.unmatchedReleaseId++;
        const out = _srStripJsonFence_(String(r[RG_RETURN_COLS.OUTPUT_JSON] || '')).trim();
        if (out && out.charAt(0) !== '{') report.notJson++;
      });
    }
    if (report.badReleaseId || report.unmatchedReleaseId || report.notJson) report.ok = false;
  }
  console.log('[RegistrarFlows] binding: ' + JSON.stringify(report));
  console.log('[RegistrarFlows] The last step of each flow adds a row to ' + RG_RETURN_TAB + ': ' +
    'Returned_At = the run time; Release_ID = the input row\'s Release_ID; Output_JSON = the Gemini step\'s output. ' +
    'Leave Harvest_Status and Error empty.');
  return report;
}

/**
 * Read-only. Has either flow ever answered, and is anything waiting
 * longer than RG_LIVENESS_WAIT_MINS? Per stage: input rows, returns, the
 * last return, and input rows of rows still *_ACTIVE with no return.
 */
function checkRegistrarFlowLiveness() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const now = Date.now();
  const report = { stages: {}, everAnswered: false };
  const returned = {};
  let lastAt = {};
  const returns = ss.getSheetByName(RG_RETURN_TAB);
  if (returns && returns.getLastRow() > 1) {
    returns.getRange(2, 1, returns.getLastRow() - 1, RG_RETURN_HEADERS.length).getValues().forEach(function (r) {
      const rel = _rgParseReleaseId_(r[RG_RETURN_COLS.RELEASE_ID]);
      if (!rel) return;
      returned[String(r[RG_RETURN_COLS.RELEASE_ID]).trim()] = true;
      const at = new Date(r[RG_RETURN_COLS.RETURNED_AT]).getTime();
      if (!isNaN(at) && (!lastAt[rel.stage] || at > lastAt[rel.stage])) lastAt[rel.stage] = at;
    });
  }
  [[1, RG_STAGE1_TAB], [2, RG_STAGE2_TAB]].forEach(function (pair) {
    const stage = pair[0];
    const s = ss.getSheetByName(pair[1]);
    const st = { inputs: 0, answered: 0, waiting: 0, lastReturn: lastAt[stage] ? new Date(lastAt[stage]).toISOString() : '' };
    if (s && s.getLastRow() > 1) {
      s.getRange(2, 1, s.getLastRow() - 1, RG_INPUT_HEADERS.length).getValues().forEach(function (r) {
        st.inputs++;
        const id = String(r[RG_INPUT_COLS.RELEASE_ID]).trim();
        if (returned[id]) { st.answered++; return; }
        const at = new Date(r[RG_INPUT_COLS.TIMESTAMP]).getTime();
        if (!isNaN(at) && now - at > RG_LIVENESS_WAIT_MINS * 60000) st.waiting++;
      });
    }
    if (st.answered) report.everAnswered = true;
    report.stages[stage] = st;
  });
  console.log('[RegistrarFlows] liveness: ' + JSON.stringify(report));
  if (!report.everAnswered) {
    console.log('[RegistrarFlows] Neither flow has answered yet. If input rows exist, the flow is not built, ' +
      'not on, or its trigger does not match ' + RG_STAGE1_TAB + '/' + RG_STAGE2_TAB + ' rows with Status = READY.');
  }
  return report;
}

/**
 * A scratch draft in a scratch Doc, queued for Stage 1 like a real one, so
 * a built flow has something to match. runRegistrarMicrobatch releases it
 * and writes its input row; the flow answers; the harvest applies it.
 * Translation (11) recognises the File_Name prefix and routes nothing.
 */
function installRegistrarFlowFixture() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const ledger = _getOrCreateSheet(ss, CFG.REGISTRAR_LEDGER_SHEET);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const doc = DocumentApp.create(RG_FIXTURE_PREFIX + stamp);
  doc.getBody().setText(
    'FIXTURE CURRICULUM DRAFT — planted by installRegistrarFlowFixture(). Disposable.\n\n' +
    'Lesson: Ticket pricing for a minor-league ballpark. Students compare dynamic pricing with ' +
    'fixed pricing, list three factors a promoter weighs (weather, opponent, giveaway night), and ' +
    'write a two-paragraph recommendation for the general manager. Assessment: a short rubric on ' +
    'evidence and clarity.');
  doc.saveAndClose();
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  ledger.appendRow([doc.getId(), RG_FIXTURE_PREFIX + stamp, 'QUEUED_FOR_COG_1', '', '', '', 0, '', ts, '']);
  console.log('[RegistrarFlows] fixture queued: ' + doc.getId() + '. Next: runRegistrarMicrobatch() releases it and ' +
    'writes its ' + RG_STAGE1_TAB + ' row; a built Stage 1 flow answers into ' + RG_RETURN_TAB + '; ' +
    'runRegistrarProcessor() harvests it. checkRegistrarFlowLiveness() says whether that happened.');
  return { installed: true, fileId: doc.getId() };
}

/** Removes fixture ledger rows and trashes their scratch Docs. Input and return rows stay as history. */
function removeRegistrarFlowFixtures() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const ledger = _getOrCreateSheet(ss, CFG.REGISTRAR_LEDGER_SHEET);
  const RC = CFG.REGISTRAR_COLS;
  let removed = 0;
  for (let r = ledger.getLastRow(); r >= 2; r--) {
    const row = ledger.getRange(r, 1, 1, 10).getValues()[0];
    if (String(row[RC.FILE_NAME]).indexOf(RG_FIXTURE_PREFIX) !== 0) continue;
    try { DriveApp.getFileById(String(row[RC.FILE_ID])).setTrashed(true); } catch (e) { /* already gone */ }
    ledger.deleteRow(r);
    removed++;
  }
  console.log('[RegistrarFlows] removed ' + removed + ' fixture row(s).');
  return { removed: removed };
}

/**
 * The Apps Script half end to end, with the flow STUBBED: this canary
 * writes the return row the flow would, so it proves materialize and
 * harvest, never that Studio is built (rule 10; checkRegistrarFlowLiveness
 * answers that). Uses its own fixture row and removes it after.
 */
function runRegistrarFlowCanary() {
  const steps = [];
  const step = function (name, pass, detail) { steps.push({ name: name, pass: !!pass, detail: detail || '' }); };
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const ledger = _getOrCreateSheet(ss, CFG.REGISTRAR_LEDGER_SHEET);
  const RC = CFG.REGISTRAR_COLS;
  const fx = installRegistrarFlowFixture();
  try {
    const lastRow = ledger.getLastRow();
    const data = ledger.getRange(2, 1, lastRow - 1, 10).getValues();
    const idx = data.findIndex(function (r) { return String(r[RC.FILE_ID]) === fx.fileId; });
    const at = Date.now();
    const m = _rgMaterialize_({ ss: ss }, data[idx], 1, at);
    step('materialize writes the Stage 1 input row', m.ok, m.ok ? m.releaseId : m.reason);
    if (!m.ok) return _rgCanaryReport_(steps);
    ledger.getRange(idx + 2, RC.STATE + 1).setValue('COG_1_ACTIVE');
    const released = _readRegistrarReleaseMap();
    released[fx.fileId] = at;
    _writeRegistrarReleaseMap(released);
    const stub = JSON.stringify({ doc_uid: fx.fileId, intervention_triage: { human_intervention_required: false },
      architect_data: { topic: 'ticket pricing ballpark promoter' }, muse_data: {}, developer_data: {}, aligner_data: {}, rtp_data: {} });
    _rgReturnSheet_(ss).appendRow([new Date(), m.releaseId, stub, '', '']);
    step('STUBBED flow: a return row written by this canary, not by Studio', true);
    const h = harvestRegistrarReturns();
    const after = ledger.getRange(idx + 2, 1, 1, 10).getValues()[0];
    step('harvest applies it', h.harvested >= 1 && String(after[RC.STATE]) === 'PENDING_VALIDATION_1',
      'state ' + after[RC.STATE]);
  } catch (e) {
    step('canary ran', false, e.message);
  } finally {
    removeRegistrarFlowFixtures();
  }
  return _rgCanaryReport_(steps);
}

function _rgCanaryReport_(steps) {
  const passed = steps.filter(function (s) { return s.pass; }).length;
  steps.forEach(function (s) { console.log((s.pass ? '✅ ' : '❌ ') + s.name + (s.detail ? ' — ' + s.detail : '')); });
  console.log('[RegistrarFlows] canary: ' + passed + '/' + steps.length + ' passed (the flow itself was stubbed).');
  return { passed: passed, total: steps.length, steps: steps };
}

// ================================================================
// END 24_RegistrarFlows.gs
// ================================================================
