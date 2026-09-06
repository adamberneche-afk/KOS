/**
 * ================================================================
 * 13_StudioInputBuilder.gs — KOS v8.0
 * BOUND TO: kos-personal (main flat-folder project)
 * ================================================================
 *
 * Materializes both Studio flows' inputs the same way
 * cas-ccps/scripts/37_FlowInputBuilder.js and 41_WarmUpFlowBridge.js
 * already do, and 12_StudioReturnHarvest.gs already does for the
 * WRITE-BACK half of these same two flows: Apps Script reads whatever
 * Studio would otherwise have to read live, and writes a flat literal
 * row Studio can trigger on with a single Sheets condition and one
 * native "Get row" step. No Docs connector, no Drive access, at
 * flow-run time, at all.
 *
 * WHY THIS EXISTS — closing the exact gap Round 17 hit (CHANGELOG.md).
 * Before this file, both the Curator flow (SESSION_LOG/EXTERNAL_DATA/
 * COG_STIMULUS/COG_EXHAUST) and the classification flow (VECTOR_CLASSIFY)
 * had a live "Google Docs — Get document" step inside Studio, reading
 * @trigger.File_ID at flow-run time (STUDIO_INTEGRATION_SPEC.md's old
 * Step 3 / connector table Step 1). Round 17's incident was that live
 * read silently failing ("Workspace sources is turned off... sent
 * without file references from variables") while Gemini still returned
 * well-formed, schema-valid output — the failure
 * 12_StudioReturnHarvest.gs's groundedness gate (_srCheckGroundedness_)
 * now catches AFTER the fact. This file closes the same gap a level
 * earlier: with no live Docs-read step left in Studio at all, that
 * specific failure mode cannot occur structurally, the same way it
 * already can't for cas-ccps's Flows 3/4/5 or any of leader-hub's six
 * flows. The groundedness gate stays — it is still a real defense
 * against a model that reads a materialized SourceText cell and
 * fabricates anyway — but it is no longer the ONLY thing standing
 * between a Studio permission toggle and a silently fabricated answer.
 *
 * WHY TWO TABS, NOT ONE, AND NOT NEW STAGING_PIPELINE COLUMNS.
 * 10_Turnstile.gs's header already settled the second question: an 8th
 * STAGING_PIPELINE column means touching every hardcoded 7-column
 * getRange() call across 2/3/9_*.gs. The first — CuratorInput and
 * VectorClassifyInput as two separate tabs, rather than one shared tab
 * with a Payload_Type filter — is what keeps each Flow's own trigger a
 * SINGLE condition (`Status = READY` on its own tab) instead of the
 * exact compound-AND shape (`Status = STUDIO_ACTIVE AND Payload_Type in
 * (...)`) that let Round 17's Payload_Type half do all the filtering
 * while Status silently wasn't wired (meta/FLOW_DOCTRINE.md rule 14,
 * written after this same incident). A shared tab would just move the
 * compound condition from STAGING_PIPELINE onto the new tab, not remove
 * it. cas-ccps's own post-redesign flows get this same single-condition
 * shape for the identical reason — three input tabs, not one, for
 * Flows 3/4/5 (41_WarmUpFlowBridge.js).
 *
 * THE SHAPE, PER ROW: identical for both tabs.
 *   Timestamp | Payload_UID | Payload_Type | File_ID | SourceText | Status
 * File_ID is carried along for debugging/traceability only — the
 * harvest still looks up the doc to overwrite by File_ID from
 * STAGING_PIPELINE itself (_srFindStagingRow_), not from this tab.
 * Status starts and stays "READY" — this file never advances it; the
 * Flow's own last step ("add row to sheet" into STUDIO_RETURN,
 * unchanged) is what tells 12_StudioReturnHarvest.gs a row answered.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO. Advance STAGING_PIPELINE's
 * own Status column, or duplicate 10_Turnstile.gs's release/staleness
 * logic. A row lands here once it is already STUDIO_ACTIVE (Turnstile's
 * job); this file only ever adds a row to one of the two input tabs, on
 * its own 1-minute trigger — faster than the Turnstile's and harvest's
 * 5-minute cadence, matching cas-ccps's buildFlowInputRows() precedent,
 * so a row's input is ready before the next 5-minute cycle needs it.
 *
 * ENTRY POINTS (no trailing underscore — GAS hides those from the Run
 * dropdown):
 *   buildStudioInputRows()      — the time-driven materializer
 *   checkStudioInputBuilder()   — read-only report: is anything
 *                                 STUDIO_ACTIVE and NOT yet materialized?
 *                                 The fifth cause of "nothing happened,"
 *                                 introduced by this file existing at
 *                                 all — a Flow with a perfect trigger and
 *                                 binding still sees nothing if this
 *                                 never ran.
 *   installStudioInputTrigger() — idempotent trigger installer, for an
 *                                 instance deployed before this file
 *                                 existed; setupAllTriggers() also
 *                                 installs it on a fresh deploy.
 *   runStudioInputCanary()      — end-to-end test of this file with a
 *                                 scratch doc and scratch staging row.
 */

// Shared shape — both tabs use the same six columns.
const CI_COLS = {
  TIMESTAMP:    0,
  PAYLOAD_UID:  1,
  PAYLOAD_TYPE: 2,
  FILE_ID:      3, // traceability only; the harvest re-derives its own from STAGING_PIPELINE
  SOURCE_TEXT:  4, // what used to be a live Studio Docs-read
  STATUS:       5, // starts and stays READY — this file never advances it
};

const CI_CURATOR_TAB    = 'CuratorInput';
const CI_CLASSIFY_TAB   = 'VectorClassifyInput';
const CI_FIXTURE_UID_PREFIX = 'FIXTURE-CI-';

// ================================================================
// MATERIALIZE — TIME-DRIVEN ENTRY POINT
// ================================================================

/**
 * For every STAGING_PIPELINE row at STUDIO_ACTIVE not yet materialized,
 * opens its Drive doc once and writes a flat row to CuratorInput or
 * VectorClassifyInput — whichever this Payload_Type belongs to.
 * Installed on a 1-minute trigger.
 */
function buildStudioInputRows() {
  const result = { curatorBuilt: 0, classifyBuilt: 0, skippedUnreadable: 0, skippedUnknownType: 0 };

  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const lastRow = staging.getLastRow();
  if (lastRow <= 1) return result;

  const curatorSheet  = _getOrCreateSheet(ss, CI_CURATOR_TAB);
  const classifySheet = _getOrCreateSheet(ss, CI_CLASSIFY_TAB);
  const knownCurator  = _ciKnownUids_(curatorSheet);
  const knownClassify = _ciKnownUids_(classifySheet);

  const SC = CFG.STAGING_COLS;
  const data = staging.getRange(2, 1, lastRow - 1, 7).getValues();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][SC.STATUS]).trim() !== 'STUDIO_ACTIVE') continue;

    const uid  = String(data[i][SC.PAYLOAD_UID] || '').trim();
    const type = String(data[i][SC.PAYLOAD_TYPE] || '').trim();
    const fileId = String(data[i][SC.FILE_ID] || '').trim();
    if (!uid || !fileId) continue;

    const isCurator  = SR_CURATOR_TYPES.indexOf(type) !== -1;
    const isClassify = type === 'VECTOR_CLASSIFY';
    if (!isCurator && !isClassify) {
      // Not this file's job to guess what an unrecognized type should do —
      // 10_Turnstile.gs's _alertOnUnknownStatuses_-style reporting covers
      // status values; an unrecognized Payload_Type on an otherwise
      // STUDIO_ACTIVE row is its own separate, rare shape, so just skip and
      // count it rather than silently swallowing it.
      result.skippedUnknownType++;
      continue;
    }

    const sheet = isCurator ? curatorSheet : classifySheet;
    const known = isCurator ? knownCurator : knownClassify;
    if (known[uid]) continue; // already materialized on an earlier pass

    const text = _ciReadDocText_(fileId);
    if (text === null) {
      result.skippedUnreadable++;
      console.warn('[StudioInput] ' + uid + ': could not open File_ID ' + fileId +
        ' — will retry next pass.');
      continue;
    }

    sheet.appendRow([new Date(), uid, type, fileId, text, 'READY']);
    known[uid] = true; // so a second STUDIO_ACTIVE row this same pass can't double-add
    if (isCurator) { result.curatorBuilt++; } else { result.classifyBuilt++; }
  }

  if (result.curatorBuilt || result.classifyBuilt) {
    console.log('[StudioInput] built ' + result.curatorBuilt + ' CuratorInput row(s), ' +
      result.classifyBuilt + ' VectorClassifyInput row(s)');
  }
  return result;
}

// ================================================================
// HELPERS
// ================================================================

function _ciReadDocText_(fileId) {
  try {
    return DocumentApp.openById(fileId).getBody().getText();
  } catch (e) {
    return null;
  }
}

function _ciKnownUids_(sheet) {
  const known = {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return known;
  const width = Object.keys(CI_COLS).length;
  sheet.getRange(2, 1, lastRow - 1, width).getValues().forEach(function (r) {
    const uid = String(r[CI_COLS.PAYLOAD_UID] || '').trim();
    if (uid) known[uid] = true;
  });
  return known;
}

// ================================================================
// REPORTING, TRIGGER, CANARY
// ================================================================

/**
 * The fifth cause of "nothing happened" — introduced by this file
 * existing at all. checkStudioFlowLiveness() (12_StudioReturnHarvest.gs)
 * already separates "never built," "trigger matches nothing," "wrong
 * columns," and "the model call errored." None of those four can see a
 * STUDIO_ACTIVE row that is perfectly healthy in every way except that
 * this file never ran (or keeps failing to open its doc) — a Flow with a
 * flawless trigger and binding still sees nothing, because there is
 * nothing in CuratorInput/VectorClassifyInput for it to match.
 *
 * Read-only. Safe to run against a live deployment at any time.
 */
function checkStudioInputBuilder() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const curatorSheet  = _getOrCreateSheet(ss, CI_CURATOR_TAB);
  const classifySheet = _getOrCreateSheet(ss, CI_CLASSIFY_TAB);
  const knownCurator  = _ciKnownUids_(curatorSheet);
  const knownClassify = _ciKnownUids_(classifySheet);

  const report = { active: 0, materialized: 0, awaitingMaterialization: [], oldestAwaitingMins: 0 };
  const lastRow = staging.getLastRow();
  if (lastRow <= 1) {
    console.log('[StudioInput] checkStudioInputBuilder: no STAGING_PIPELINE rows — nothing to conclude.');
    return report;
  }

  const SC = CFG.STAGING_COLS;
  const nowMs = new Date().getTime();
  staging.getRange(2, 1, lastRow - 1, 7).getValues().forEach(function (row) {
    if (String(row[SC.STATUS]).trim() !== 'STUDIO_ACTIVE') return;
    const uid  = String(row[SC.PAYLOAD_UID] || '').trim();
    const type = String(row[SC.PAYLOAD_TYPE] || '').trim();
    const isCurator  = SR_CURATOR_TYPES.indexOf(type) !== -1;
    const isClassify = type === 'VECTOR_CLASSIFY';
    if (!isCurator && !isClassify) return; // not this file's concern — see buildStudioInputRows()

    report.active++;
    const known = isCurator ? knownCurator : knownClassify;
    if (known[uid]) { report.materialized++; return; }

    const ageMins = Math.round((nowMs - new Date(row[SC.TIMESTAMP]).getTime()) / 60000);
    report.awaitingMaterialization.push({ uid: uid, type: type, ageMins: ageMins });
    if (ageMins > report.oldestAwaitingMins) report.oldestAwaitingMins = ageMins;
  });

  console.log('[StudioInput] checkStudioInputBuilder: ' + report.active + ' STUDIO_ACTIVE row(s) ' +
    'this file should feed, ' + report.materialized + ' materialized, ' +
    report.awaitingMaterialization.length + ' still waiting');
  if (report.awaitingMaterialization.length && report.oldestAwaitingMins > 5) {
    console.warn('[StudioInput] ' + report.awaitingMaterialization.length + ' row(s) STUDIO_ACTIVE ' +
      'for over 5 minutes with no CuratorInput/VectorClassifyInput row yet (oldest ' +
      report.oldestAwaitingMins + ' min) — buildStudioInputRows() is not running, or its doc ' +
      'reads are failing. Either would look exactly like "the Flow never answered" from ' +
      'checkStudioFlowLiveness() alone.');
  }
  return report;
}

/**
 * Installs the 1-minute trigger on an instance deployed before this file
 * existed. setupAllTriggers() also installs it on a fresh deploy; this
 * is the catch-up path, and it is idempotent.
 */
function installStudioInputTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'buildStudioInputRows';
  });
  if (existing.length) {
    console.log('[StudioInput] trigger already installed (' + existing.length + ')');
    return { installed: false, existing: existing.length };
  }
  ScriptApp.newTrigger('buildStudioInputRows').timeBased().everyMinutes(1).create();
  console.log('[StudioInput] installed buildStudioInputRows on a 1-minute trigger');
  return { installed: true, existing: 0 };
}

/**
 * Exercises this file end to end against a scratch doc and a scratch
 * STAGING_PIPELINE row, for both tabs. Cleans up after itself.
 *
 * What it proves: a STUDIO_ACTIVE row of either shape gets its doc text
 * materialized into the right tab, a second pass doesn't duplicate it,
 * and an unreadable File_ID is skipped rather than thrown on. What it
 * does NOT prove: that any Workspace Flow exists to consume the row —
 * nothing here touches Studio. A pass means the Apps Script half is
 * sound, so a Flow that still sees nothing is either not built or not
 * triggering on the right tab.
 */
function runStudioInputCanary() {
  const steps = [];
  function step(name, pass, detail) { steps.push({ name: name, pass: !!pass, detail: detail || '' }); }

  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const curatorSheet  = _getOrCreateSheet(ss, CI_CURATOR_TAB);
  const classifySheet = _getOrCreateSheet(ss, CI_CLASSIFY_TAB);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const curatorUid  = 'CANARY-CI-' + stamp + '-CURATOR';
  const classifyUid = 'CANARY-CI-' + stamp + '-CLASSIFY';
  let doc = null;

  try {
    doc = DocumentApp.create('KOS Canary — StudioInput ' + stamp);
    doc.getBody().setText('ORIGINAL SOURCE TEXT — the materializer should copy this, not consume it.');
    doc.saveAndClose();
    const fileId = doc.getId();

    staging.appendRow([new Date(), curatorUid, 'SESSION_LOG',
      'https://docs.google.com/document/d/' + fileId, fileId, 'STUDIO_ACTIVE', 0]);
    staging.appendRow([new Date(), classifyUid, 'VECTOR_CLASSIFY',
      'https://docs.google.com/document/d/' + fileId, fileId, 'STUDIO_ACTIVE', 0]);

    const first = buildStudioInputRows();
    step('one CuratorInput row built', first.curatorBuilt === 1, JSON.stringify(first));
    step('one VectorClassifyInput row built', first.classifyBuilt === 1, JSON.stringify(first));

    const curatorRow  = _ciFindRow_(curatorSheet, curatorUid);
    const classifyRow = _ciFindRow_(classifySheet, classifyUid);
    step('CuratorInput row carries the real source text',
      curatorRow && curatorRow[CI_COLS.SOURCE_TEXT].indexOf('ORIGINAL SOURCE TEXT') !== -1,
      curatorRow ? curatorRow[CI_COLS.SOURCE_TEXT] : 'row missing');
    step('CuratorInput row starts at READY',
      curatorRow && curatorRow[CI_COLS.STATUS] === 'READY', curatorRow ? curatorRow[CI_COLS.STATUS] : '');
    step('the source document itself was NOT modified',
      DocumentApp.openById(fileId).getBody().getText().indexOf('ORIGINAL SOURCE TEXT') === 0,
      'materializing must copy, never consume, the source');

    const second = buildStudioInputRows();
    step('a second pass does not duplicate either row',
      second.curatorBuilt === 0 && second.classifyBuilt === 0, JSON.stringify(second));

    // An unreadable File_ID — the doc-open failure path.
    const badUid = 'CANARY-CI-' + stamp + '-BADFILE';
    staging.appendRow([new Date(), badUid, 'SESSION_LOG',
      'https://docs.google.com/document/d/does-not-exist', 'does-not-exist-file-id',
      'STUDIO_ACTIVE', 0]);
    const third = buildStudioInputRows();
    step('an unreadable File_ID is skipped, not thrown on',
      third.skippedUnreadable >= 1 && !_ciFindRow_(curatorSheet, badUid),
      JSON.stringify(third));
    _ciDeleteRow_(staging, badUid);
  } catch (e) {
    step('canary ran without throwing', false, e.message);
  } finally {
    _ciDeleteRow_(staging, curatorUid);
    _ciDeleteRow_(staging, classifyUid);
    _ciDeleteRow_(curatorSheet, curatorUid);
    _ciDeleteRow_(classifySheet, classifyUid);
    if (doc) { try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (e) { /* best-effort */ } }
  }

  const passed = steps.filter(function (s) { return s.pass; }).length;
  const ok = passed === steps.length;
  console.log('[StudioInput] canary: ' + passed + '/' + steps.length + ' step(s) passed');
  steps.forEach(function (s) {
    console.log('[StudioInput]   ' + (s.pass ? 'PASS' : 'FAIL') + '  ' + s.name +
      (s.detail ? ' — ' + s.detail : ''));
  });
  console.log('[StudioInput] This exercised the Apps Script half ONLY — no Workspace Flow was ' +
    'involved. checkStudioFlowLiveness() (12_StudioReturnHarvest.gs) is what tells you whether a ' +
    'real Flow is reading these tabs.');
  return { ok: ok, passed: passed, total: steps.length, steps: steps };
}

function _ciFindRow_(sheet, uid) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  const width = Object.keys(CI_COLS).length;
  const data = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][CI_COLS.PAYLOAD_UID]).trim() === uid) return data[i];
  }
  return null;
}

function _ciDeleteRow_(sheet, uid) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const width = sheet.getLastColumn();
  const data = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    // Column 1 (Payload_UID) is shared across STAGING_PIPELINE and both
    // input tabs — safe to key on for this cleanup helper only.
    if (String(data[i][1]).trim() === uid) sheet.deleteRow(i + 2);
  }
}
