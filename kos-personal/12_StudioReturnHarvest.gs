/**
 * ================================================================
 * 12_StudioReturnHarvest.gs — KOS v8.0
 * BOUND TO: kos-personal (main flat-folder project)
 * ================================================================
 *
 * Replaces `kos-personal/studio-steps/`'s two custom Workspace Studio
 * steps with an Apps Script harvest, because those steps cannot run.
 *
 * WHY. Publishing a Workspace Add-on — which is what a custom Studio step
 * is — needs a standard, non-default Google Cloud project, and GCP access
 * is switched off org-wide for the `ccpsnet.net` account by the district.
 * kos-personal is deployed on that same account (SMP-004 describes a
 * separate personal account; that is not what exists), so
 * `WriteCuratorOutputStep` and `WriteClassificationOutputStep` are
 * unreachable exactly the way cas-ccps's 8 steps are: the install completes,
 * the step never appears in Studio's picker, and nothing errors anywhere.
 * See `tools/gas-lint/gcp-map.json` and that folder's own README banner.
 *
 * THE SHAPE OF THE PORT. Only the write-back half moves. The Sheets
 * trigger, the Docs read, and both Gemini passes stay native and are
 * unaffected. Two properties make this far smaller than cas-ccps's
 * equivalent redesign (`cas-ccps/scripts/37_FlowInputBuilder.js`):
 *
 *   - The fixed-picker wall doesn't apply. What forced cas-ccps to
 *     materialize a whole lookup chain into a flat row was that a native
 *     Sheets step targets a spreadsheet through a fixed picker and never a
 *     variable — fatal when the target is a per-teacher TeacherMatrix.
 *     STAGING_PIPELINE is one spreadsheet, so native steps can reach it.
 *   - Only the doc-body overwrite genuinely needs script. A native
 *     insert-text step is not documented as able to CLEAR a document's
 *     existing content first, and at this point in the flow the body is
 *     still the raw source text, not empty.
 *
 * SO THE FLOW'S LAST STEP BECOMES A NATIVE "add row to sheet" INTO
 * `STUDIO_RETURN`, and this file does the rest on a time trigger.
 *
 * WHY A SEPARATE TAB AND NOT NEW STAGING_PIPELINE COLUMNS. Because
 * `10_Turnstile.gs`'s header already settled this: an 8th STAGING_PIPELINE
 * column would mean touching every hardcoded 7-column `getRange()` call
 * across `2/3/9_*.gs`, which is why release timestamps live in
 * PropertiesService instead of a column. A new tab adds no positional risk
 * to anything that already reads that sheet.
 *
 * AND WHY THE STATUS MACHINE IS UNCHANGED. A row stays `STUDIO_ACTIVE`
 * until this harvest sets `FLOW_COMPLETE` — there is no new intermediate
 * status. That is deliberate: the Turnstile's release gate, its staleness
 * reset, and `_alertOnUnknownStatuses_()` all keep working untouched, and
 * adding a status would have meant editing all three. The cost is that the
 * staleness guard (CFG.TURNSTILE_STALE_MINS, default 30) can reset a row
 * whose return row is still waiting, so this runs every 5 minutes, well
 * inside that window, and handles a reset row rather than assuming one
 * can't happen (see `_srApplyReturn_`).
 *
 * FAILURE PHILOSOPHY, CARRIED OVER VERBATIM. KOS's spec wants the opposite
 * of cas-ccps's Flow 2: on failure, touch NOTHING — leave the staging row
 * at `STUDIO_ACTIVE` so the staleness guard resets it for a retry. There is
 * no failure marker in this design, by the spec's own choice. Every failure
 * path below returns without writing the doc or the staging row.
 *
 * THE ONE STATE THAT IS NOT CLEANLY RETRYABLE, and which this file handles
 * better than the custom step could. Once the doc body is overwritten, the
 * original source text is GONE — replaced by the model's JSON. If the
 * staging row then fails to reach `FLOW_COMPLETE`, a retry would re-run
 * inference against a document that is already JSON rather than the session
 * text. The custom step could only flag this
 * (`STAGING_ROW_NOT_FOUND_AFTER_DOC_WRITE`) and hope a human noticed.
 * Running inside the main project, this can do better: a breadcrumb is
 * written to PropertiesService immediately after the doc write and before
 * the staging mark, keyed by Payload_UID, following the same
 * transient-state pattern as `_readReleaseMap()`. A later pass that sees
 * the breadcrumb skips the doc write and only re-attempts the mark, so the
 * awkward state resolves itself instead of needing to be noticed.
 *
 * ENTRY POINTS (no trailing underscore — GAS hides those from the Run
 * dropdown):
 *   harvestStudioReturns()        — the time-driven worker
 *   checkStudioReturns()          — read-only report, makes no writes
 *   installStudioReturnTrigger()  — for an instance deployed before this
 *                                   file existed; setupAllTriggers() also
 *                                   installs it on a fresh deploy
 *   checkStudioFlowLiveness()     — has any Flow EVER written back? the only
 *                                   thing that answers that
 *   installStudioFlowFixture()    — plant a scratch doc + PENDING_FLOW row so
 *                                   a real Flow has something to match
 *   removeStudioFlowFixtures()    — take them back out, docs included
 *   runStudioReturnCanary()       — end-to-end test of this file with the
 *                                   Flow and Gemini both stubbed
 */

// STUDIO_RETURN column indices. A new tab, so these are safe to define
// here — nothing else in the project reads this sheet.
const SR_COLS = {
  RETURNED_AT:    0,
  PAYLOAD_UID:    1,
  PAYLOAD_TYPE:   2,
  PRIMARY_JSON:   3, // Curator output, or Classification output
  AUDITOR_JSON:   4, // optional; Curator flow only
  HARVEST_STATUS: 5,
  ATTEMPTS:       6,
  ERROR:          7,
};

const SR_SHEET = 'STUDIO_RETURN';
const SR_DOC_WRITTEN_PROP = 'KOS_STUDIO_DOC_WRITTEN';
const SR_MAX_ATTEMPTS = 3;
const SR_PRUNE_AFTER_DAYS = 7;
const SR_FIXTURE_UID_PREFIX = 'FIXTURE-SR-';

// Payload types whose output is a merged Curator (+ optional Auditor)
// object. Anything else is treated as the Classification contract, which
// differs in two ways that are NOT interchangeable — see _srApplyReturn_.
const SR_CURATOR_TYPES = ['SESSION_LOG', 'EXTERNAL_DATA', 'COG_EXHAUST', 'COG_STIMULUS'];

// ================================================================
// HARVEST — TIME-DRIVEN ENTRY POINT
// ================================================================

/**
 * Applies every unharvested STUDIO_RETURN row: overwrite the source doc
 * with the model's output, then mark the STAGING_PIPELINE row
 * FLOW_COMPLETE. Installed on a 5-minute trigger.
 */
function harvestStudioReturns() {
  const result = { applied: 0, skipped: 0, failed: 0, attention: 0, pruned: 0 };

  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sheet = _getOrCreateSheet(ss, SR_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return result;

  const width = Object.keys(SR_COLS).length;
  const data = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const sheetRow = i + 2;
    const status = String(row[SR_COLS.HARVEST_STATUS] || '').trim();
    if (status === 'HARVESTED' || status === 'NEEDS_ATTENTION' || status === 'FAILED') {
      result.skipped++;
      continue;
    }

    const uid = String(row[SR_COLS.PAYLOAD_UID] || '').trim();
    if (!uid) {
      _srMarkReturnRow_(sheet, sheetRow, 'FAILED', 'No Payload_UID', SR_MAX_ATTEMPTS);
      result.failed++;
      continue;
    }

    const outcome = _srApplyReturn_(staging, uid, row);
    const attempts = Number(row[SR_COLS.ATTEMPTS] || 0) + 1;

    if (outcome.ok) {
      _srMarkReturnRow_(sheet, sheetRow, 'HARVESTED', '', attempts);
      _srClearDocWritten_(uid);
      result.applied++;
      console.log('[StudioReturn] ' + uid + ' applied — staging row FLOW_COMPLETE');
      continue;
    }

    if (outcome.needsAttention) {
      // Doc written, staging row unreachable, and the breadcrumb could not
      // carry us through either. This is the one state a retry cannot fix
      // blindly, so it stops here rather than looping.
      _srMarkReturnRow_(sheet, sheetRow, 'NEEDS_ATTENTION', outcome.error, attempts);
      result.attention++;
      _reportError('harvestStudioReturns',
        new Error('Payload ' + uid + ' needs attention: ' + outcome.error), null);
      continue;
    }

    if (attempts >= SR_MAX_ATTEMPTS) {
      // Give up on the RETURN row only. The staging row is deliberately
      // left alone — the staleness guard owns retrying the inference, and
      // that separation is what keeps this file from fighting the Turnstile.
      _srMarkReturnRow_(sheet, sheetRow, 'FAILED', outcome.error, attempts);
      result.failed++;
      _reportError('harvestStudioReturns',
        new Error('Payload ' + uid + ' failed after ' + attempts + ' attempt(s): ' + outcome.error +
          '. Staging row untouched for the staleness guard.'), null);
      continue;
    }

    _srMarkReturnRow_(sheet, sheetRow, '', outcome.error, attempts);
    result.failed++;
    console.warn('[StudioReturn] ' + uid + ' attempt ' + attempts + ' failed: ' + outcome.error);
  }

  result.pruned = _srPruneHarvested_(sheet);
  console.log('[StudioReturn] harvest: ' + JSON.stringify(result));
  return result;
}

/**
 * Applies one return row. Returns {ok} or {ok:false, error, needsAttention}.
 * Writes nothing at all on a recoverable failure — see the file header's
 * failure philosophy.
 */
function _srApplyReturn_(staging, uid, row) {
  const payloadType = String(row[SR_COLS.PAYLOAD_TYPE] || '').trim();
  const primary = String(row[SR_COLS.PRIMARY_JSON] || '');
  const auditor = String(row[SR_COLS.AUDITOR_JSON] || '');

  const found = _srFindStagingRow_(staging, uid);
  if (!found) return { ok: false, error: 'No STAGING_PIPELINE row for Payload_UID ' + uid };

  // A duplicate return. Reachable for real: the staleness guard can reset a
  // row whose return is still queued, the Turnstile re-releases it, and a
  // second Flow run returns later. Consuming it is correct — the row is
  // already done — and silently re-writing the doc would clobber a good
  // result with an older one.
  if (found.status === 'FLOW_COMPLETE') {
    return { ok: true, duplicate: true };
  }

  const alreadyWritten = _srIsDocWritten_(uid);
  if (!alreadyWritten) {
    const prepared = _srPrepareDocText_(payloadType, primary, auditor);
    if (!prepared.ok) return { ok: false, error: prepared.error };

    try {
      _srOverwriteDocBody_(found.fileId, prepared.text);
    } catch (e) {
      // Nothing written, nothing marked — cleanly retryable.
      return { ok: false, error: 'DOC_WRITE_FAILED: ' + e.message };
    }
    // Breadcrumb BEFORE the staging mark, so a crash in between is
    // recoverable rather than the unretryable state described in the header.
    _srMarkDocWritten_(uid);
  }

  try {
    staging.getRange(found.sheetRow, CFG.STAGING_COLS.STATUS + 1).setValue('FLOW_COMPLETE');
    SpreadsheetApp.flush();
  } catch (e) {
    return {
      ok: false,
      needsAttention: true,
      error: 'STAGING_MARK_FAILED_AFTER_DOC_WRITE: ' + e.message +
        ' — the doc body is already the model output, so the original source text is gone. ' +
        'Do NOT let this row be re-inferred; set its Status to FLOW_COMPLETE by hand.',
    };
  }

  return { ok: true, docWasAlreadyWritten: alreadyWritten };
}

/**
 * Builds the exact text to write to the doc. The two contracts differ in
 * ways that look cosmetic and are not — both are carried over verbatim from
 * the custom steps they replace.
 */
function _srPrepareDocText_(payloadType, primary, auditor) {
  if (String(primary).trim() === '') return { ok: false, error: 'Empty model output' };

  const isCurator = SR_CURATOR_TYPES.indexOf(payloadType) !== -1;

  if (!isCurator) {
    // CLASSIFICATION CONTRACT (WriteClassificationOutputStep.gs). Two rules:
    //   1. The ORIGINAL, unstripped text is what gets written — the fence is
    //      stripped only for the copy being validated. Re-serializing risks
    //      subtly reformatting floats or key order differently from what the
    //      model produced, and there is nothing to merge here, so there is no
    //      reason to reconstruct it at all.
    //   2. The parsed result must be an Array, or nothing is written.
    let parsed;
    try {
      parsed = JSON.parse(_srStripJsonFence_(primary));
    } catch (e) {
      return { ok: false, error: 'CLASSIFICATION_JSON_PARSE_FAILED: ' + e.message };
    }
    if (!Array.isArray(parsed)) return { ok: false, error: 'CLASSIFICATION_JSON_NOT_ARRAY' };
    return { ok: true, text: primary };
  }

  // CURATOR CONTRACT (WriteCuratorOutputStep.gs). Here the output IS
  // reconstructed, because the Auditor pass has to be merged in.
  let curatorParsed;
  try {
    curatorParsed = JSON.parse(_srStripJsonFence_(primary));
  } catch (e) {
    return { ok: false, error: 'CURATOR_JSON_PARSE_FAILED: ' + e.message };
  }

  if (String(auditor).trim() !== '') {
    let auditorParsed;
    try {
      auditorParsed = JSON.parse(_srStripJsonFence_(auditor));
    } catch (e) {
      // A malformed Auditor pass is a FULL failure, not a reason to drop the
      // audit and write an un-audited result. CURATOR_PROMPT.md's rule
      // against a fabricated sign-off implies a broken one must not be
      // papered over either.
      return { ok: false, error: 'AUDITOR_JSON_PARSE_FAILED: ' + e.message };
    }
    // CURATOR_PROMPT.md Rule 8 / Section 4: a single top-level key holding
    // the Auditor output verbatim — never a second JSON object appended
    // after the Curator's own.
    curatorParsed.auditor_sign_off = auditorParsed;
  }

  return { ok: true, text: JSON.stringify(curatorParsed) };
}

// ================================================================
// HELPERS
// ================================================================

// Gemini routinely wraps JSON in a ```json ... ``` markdown fence even when
// asked for raw JSON, so a perfectly well-formed response would otherwise
// fail parsing for a formatting reason unrelated to its content. Same
// treatment cas-ccps/scripts/25_WarmUpWriter.js applies before its own
// JSON.parse.
function _srStripJsonFence_(text) {
  let t = String(text == null ? '' : text).trim();
  if (t.indexOf('```') !== 0) return t;
  t = t.replace(/^```[A-Za-z0-9_-]*\s*/, '');
  const close = t.lastIndexOf('```');
  if (close !== -1) t = t.substring(0, close);
  return t.trim();
}

// Single-key match on Payload_UID is genuinely safe here, unlike cas-ccps's
// Ledger/ConfigID situation: the spec documents Payload_UID as "Unique
// identifier for this chunk," not a key shared across rows. Scans by UID
// rather than trusting a trigger-row reference, matching the spec's own
// Step 7 sample — by this point several steps have run and a row index may
// no longer mean what it did.
function _srFindStagingRow_(staging, uid) {
  const lastRow = staging.getLastRow();
  if (lastRow <= 1) return null;
  const SC = CFG.STAGING_COLS;
  const data = staging.getRange(2, 1, lastRow - 1, 7).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][SC.PAYLOAD_UID]).trim() === uid) {
      return {
        sheetRow: i + 2,
        status: String(data[i][SC.STATUS]).trim(),
        fileId: String(data[i][SC.FILE_ID]).trim(),
        payloadType: String(data[i][SC.PAYLOAD_TYPE]).trim(),
      };
    }
  }
  return null;
}

// DocumentApp rather than a native connector: body.clear() before
// setText() is the one guarantee "replace the whole body" needs and a
// native insert-text step is not documented as providing. Matches
// STUDIO_INTEGRATION_SPEC.md's own Step 6 sample.
function _srOverwriteDocBody_(fileId, text) {
  const doc = DocumentApp.openById(fileId);
  const body = doc.getBody();
  body.clear();
  body.setText(text);
  doc.saveAndClose();
}

// Transient state in PropertiesService, keyed by Payload_UID, pruned as it
// is consumed — the pattern 10_Turnstile.gs's release map established for
// exactly this reason (no new column on a 7-column sheet).
function _srReadDocWrittenMap_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(SR_DOC_WRITTEN_PROP);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('[StudioReturn] doc-written map corrupt — resetting. ' + e.message);
    return {};
  }
}

function _srSaveDocWrittenMap_(map) {
  PropertiesService.getScriptProperties().setProperty(SR_DOC_WRITTEN_PROP, JSON.stringify(map));
}

function _srIsDocWritten_(uid) {
  return !!_srReadDocWrittenMap_()[uid];
}

function _srMarkDocWritten_(uid) {
  const map = _srReadDocWrittenMap_();
  map[uid] = new Date().getTime();
  _srSaveDocWrittenMap_(map);
}

function _srClearDocWritten_(uid) {
  const map = _srReadDocWrittenMap_();
  if (map[uid]) { delete map[uid]; _srSaveDocWrittenMap_(map); }
}

function _srMarkReturnRow_(sheet, sheetRow, harvestStatus, error, attempts) {
  sheet.getRange(sheetRow, SR_COLS.HARVEST_STATUS + 1).setValue(harvestStatus);
  sheet.getRange(sheetRow, SR_COLS.ATTEMPTS + 1).setValue(attempts);
  sheet.getRange(sheetRow, SR_COLS.ERROR + 1).setValue(error || '');
}

// HARVESTED rows are kept as an audit trail rather than deleted on success,
// then pruned by age — the same trade STAGING_ARCHIVE already makes.
// NEEDS_ATTENTION and FAILED rows are never pruned: they are the ones a
// human still has to look at.
function _srPruneHarvested_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const width = Object.keys(SR_COLS).length;
  const data = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  const cutoff = new Date().getTime() - (SR_PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  let pruned = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (String(data[i][SR_COLS.HARVEST_STATUS] || '').trim() !== 'HARVESTED') continue;
    const at = new Date(data[i][SR_COLS.RETURNED_AT]).getTime();
    if (!at || at > cutoff) continue;
    sheet.deleteRow(i + 2);
    pruned++;
  }
  return pruned;
}

// ================================================================
// REPORTING, FIXTURES, CANARY
// ================================================================

/** Read-only. Safe to run against a live deployment at any time. */
function checkStudioReturns() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sheet = _getOrCreateSheet(ss, SR_SHEET);
  const report = { total: 0, unharvested: 0, harvested: 0, needsAttention: 0, failed: 0, fixtures: 0, rows: [] };
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    const width = Object.keys(SR_COLS).length;
    const data = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    data.forEach(function (row) {
      const status = String(row[SR_COLS.HARVEST_STATUS] || '').trim() || 'UNHARVESTED';
      const uid = String(row[SR_COLS.PAYLOAD_UID] || '').trim();
      report.total++;
      if (status === 'HARVESTED') report.harvested++;
      else if (status === 'NEEDS_ATTENTION') report.needsAttention++;
      else if (status === 'FAILED') report.failed++;
      else report.unharvested++;
      if (uid.indexOf(SR_FIXTURE_UID_PREFIX) === 0) report.fixtures++;
      report.rows.push({ uid: uid, type: String(row[SR_COLS.PAYLOAD_TYPE] || ''), status: status,
        attempts: Number(row[SR_COLS.ATTEMPTS] || 0), error: String(row[SR_COLS.ERROR] || '') });
    });
  }

  const stranded = Object.keys(_srReadDocWrittenMap_());
  console.log('[StudioReturn] check: ' + JSON.stringify({
    total: report.total, unharvested: report.unharvested, harvested: report.harvested,
    needsAttention: report.needsAttention, failed: report.failed, fixtures: report.fixtures,
  }));
  if (report.needsAttention) {
    console.warn('[StudioReturn] ' + report.needsAttention + ' row(s) NEED ATTENTION — their doc ' +
      'body is already model output, so the original source text is gone. Set the matching ' +
      'STAGING_PIPELINE Status to FLOW_COMPLETE by hand; do not let them be re-inferred.');
  }
  if (stranded.length) {
    console.log('[StudioReturn] doc-written breadcrumbs outstanding for: ' + stranded.join(', ') +
      ' — a harvest pass will skip the doc write for these and only re-attempt the staging mark.');
  }
  report.strandedBreadcrumbs = stranded;
  return report;
}

/**
 * Installs the 5-minute trigger on an instance deployed before this file
 * existed. setupAllTriggers() also installs it on a fresh deploy; this is
 * the catch-up path, and it is idempotent.
 */
function installStudioReturnTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'harvestStudioReturns';
  });
  if (existing.length) {
    console.log('[StudioReturn] trigger already installed (' + existing.length + ')');
    return { installed: false, existing: existing.length };
  }
  ScriptApp.newTrigger('harvestStudioReturns').timeBased().everyMinutes(5).create();
  console.log('[StudioReturn] installed harvestStudioReturns on a 5-minute trigger');
  return { installed: true, existing: 0 };
}

/**
 * Plants one scratch document plus TWO PENDING_FLOW staging rows — a
 * SESSION_LOG row for the Curator flow and a paired VECTOR_CLASSIFY row for
 * the classification flow — so the Turnstile releases both and each real
 * Workspace Flow has something to match.
 *
 * THIS IS THE ONLY THING THAT ANSWERS "IS THE FLOW LIVE?". A Studio Flow that
 * matched zero rows reports a green "Run Completed", indistinguishable from
 * working — the lesson that cost a cas-ccps session. Nothing on this side of
 * the boundary can tell you a Flow ran; the only evidence is a row appearing
 * in STUDIO_RETURN that this code did not put there.
 *
 * WHY BOTH TYPES, AND WHY THEY SHARE A DOCUMENT. There are two independent
 * flows here, and the first version of this fixture only fed one of them —
 * the classification flow had nothing to latch onto at all, and its output
 * contract (write the ORIGINAL unstripped text, validate it parses to an
 * Array) had never been exercised against a real queued row. The two rows
 * share one FileID because that is what the design intends:
 * CURATOR_PROMPT.md's Rule 1 has the Curator citing a completed, independent
 * VECTOR_CLASSIFY row *for the same session*, and README.md:192 records the
 * open gap that `_chunkAndQueue()` doesn't yet queue that paired row. Until
 * it does, this fixture is the only place the paired shape exists — so it
 * also serves as a worked example of what that fix should produce.
 *
 * An earlier version planted a STUDIO_RETURN row instead, which was the wrong
 * side of the handshake: STUDIO_RETURN is where the Flow WRITES, so a fixture
 * there tests this file's harvest (the canary already does that, more
 * thoroughly) and says nothing about the Flow. Worse, it used a prefixed
 * Payload_UID no staging row could match, so it would have exercised the
 * not-found path while looking like a passing test.
 *
 * The document is scratch and its body is disposable — being overwritten by
 * the model's output is the expected outcome, not a side effect to avoid.
 */
function installStudioFlowFixture() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');

  const doc = DocumentApp.create('KOS Fixture — StudioReturn ' + stamp);
  doc.getBody().setText(
    'FIXTURE SESSION LOG — planted by installStudioFlowFixture() to give both Studio flows ' +
    'something to match. This body is disposable; a Flow is expected to replace it with JSON.\n\n' +
    'Discussed the Studio integration: the custom-step path is blocked on this account, so the ' +
    'write-back moved into Apps Script as a harvest over a STUDIO_RETURN tab. Also covered why ' +
    'widening STAGING_PIPELINE was refused, and how the doc-written breadcrumb makes the ' +
    'partial state recoverable.');
  doc.saveAndClose();
  const fileId = doc.getId();
  const docUrl = 'https://docs.google.com/document/d/' + fileId;

  // One stem, two rows — the shared stem is what makes the pair visibly one
  // session rather than two unrelated fixtures.
  const stem = SR_FIXTURE_UID_PREFIX + stamp;
  const rows = [
    { uid: stem + '-SESSION_LOG', type: 'SESSION_LOG' },
    { uid: stem + '-VECTOR_CLASSIFY', type: 'VECTOR_CLASSIFY' },
  ];
  rows.forEach(function (r) {
    staging.appendRow([new Date(), r.uid, r.type, docUrl, fileId, 'PENDING_FLOW', 0]);
  });

  console.log('[StudioReturn] fixture installed: doc ' + fileId + ', rows ' +
    rows.map(function (r) { return r.type; }).join(' + '));
  console.log('[StudioReturn] Next: runMatrixTurnstile() releases them to STUDIO_ACTIVE ' +
    '(it is TIER_1 gated, so a cold engine warns but still passes through), then a real Flow ' +
    'should write a STUDIO_RETURN row for each. checkStudioFlowLiveness() reports whether that ' +
    'ever happened, per payload type. Nothing else can tell you.');
  return { installed: true, fileId: fileId, uids: rows.map(function (r) { return r.uid; }) };
}

/** Removes fixture staging rows, their returns, and trashes their scratch docs. */
function removeStudioFlowFixtures() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const returns = _getOrCreateSheet(ss, SR_SHEET);
  const SC = CFG.STAGING_COLS;
  let removedRows = 0, trashedDocs = 0, removedReturns = 0;

  const sLast = staging.getLastRow();
  if (sLast > 1) {
    const sData = staging.getRange(2, 1, sLast - 1, 7).getValues();
    for (let i = sData.length - 1; i >= 0; i--) {
      if (String(sData[i][SC.PAYLOAD_UID] || '').indexOf(SR_FIXTURE_UID_PREFIX) !== 0) continue;
      const fileId = String(sData[i][SC.FILE_ID] || '').trim();
      if (fileId) {
        try { DriveApp.getFileById(fileId).setTrashed(true); trashedDocs++; }
        catch (e) { console.warn('[StudioReturn] could not trash ' + fileId + ': ' + e.message); }
      }
      staging.deleteRow(i + 2);
      removedRows++;
    }
  }

  const rLast = returns.getLastRow();
  if (rLast > 1) {
    const width = Object.keys(SR_COLS).length;
    const rData = returns.getRange(2, 1, rLast - 1, width).getValues();
    for (let i = rData.length - 1; i >= 0; i--) {
      if (String(rData[i][SR_COLS.PAYLOAD_UID] || '').indexOf(SR_FIXTURE_UID_PREFIX) !== 0) continue;
      returns.deleteRow(i + 2);
      removedReturns++;
    }
  }

  console.log('[StudioReturn] removed ' + removedRows + ' fixture staging row(s), ' +
    removedReturns + ' return row(s), trashed ' + trashedDocs + ' doc(s)');
  return { removedRows: removedRows, removedReturns: removedReturns, trashedDocs: trashedDocs };
}

/**
 * Pairs rows released for inference against returns actually received, and
 * says plainly whether anything is writing back.
 *
 * This is the report to run when someone asks "is the Studio flow working?".
 * `checkStudioReturns()` describes the returns that arrived;
 * this one is about the ones that did not.
 */
function checkStudioFlowLiveness() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const returns = _getOrCreateSheet(ss, SR_SHEET);
  const SC = CFG.STAGING_COLS;

  const seenUids = {};
  const rLast = returns.getLastRow();
  let returnCount = 0;
  // Per payload type, because there are TWO independent flows here and a
  // single "has anything ever returned" number cannot tell you which one is
  // live. A Curator flow working while the classification flow was never
  // built looks identical in the aggregate.
  const returnsByType = {};
  if (rLast > 1) {
    const width = Object.keys(SR_COLS).length;
    returns.getRange(2, 1, rLast - 1, width).getValues().forEach(function (row) {
      const uid = String(row[SR_COLS.PAYLOAD_UID] || '').trim();
      if (!uid) return;
      seenUids[uid] = true;
      returnCount++;
      const type = String(row[SR_COLS.PAYLOAD_TYPE] || '').trim() || 'UNKNOWN';
      returnsByType[type] = (returnsByType[type] || 0) + 1;
    });
  }

  const report = { released: 0, awaitingReturn: [], completed: 0, returnRows: returnCount,
                   flowEverReturned: returnCount > 0, oldestAwaitingMins: 0,
                   returnsByType: returnsByType, releasedByType: {} };
  const sLast = staging.getLastRow();
  const nowMs = new Date().getTime();
  if (sLast > 1) {
    staging.getRange(2, 1, sLast - 1, 7).getValues().forEach(function (row) {
      const status = String(row[SC.STATUS]).trim();
      const uid = String(row[SC.PAYLOAD_UID]).trim();
      if (status === 'FLOW_COMPLETE') { report.completed++; return; }
      if (status !== 'STUDIO_ACTIVE') return;
      report.released++;
      const relType = String(row[SC.PAYLOAD_TYPE]).trim() || 'UNKNOWN';
      report.releasedByType[relType] = (report.releasedByType[relType] || 0) + 1;
      if (seenUids[uid]) return;
      const ageMins = Math.round((nowMs - new Date(row[SC.TIMESTAMP]).getTime()) / 60000);
      report.awaitingReturn.push({ uid: uid, type: String(row[SC.PAYLOAD_TYPE]).trim(), ageMins: ageMins });
      if (ageMins > report.oldestAwaitingMins) report.oldestAwaitingMins = ageMins;
    });
  }

  console.log('[StudioReturn] liveness: ' + report.released + ' row(s) STUDIO_ACTIVE, ' +
    report.awaitingReturn.length + ' with no return yet, ' + returnCount +
    ' return row(s) ever seen, ' + report.completed + ' row(s) FLOW_COMPLETE');
  console.log('[StudioReturn]   returns by payload type: ' +
    (Object.keys(returnsByType).length ? JSON.stringify(returnsByType) : 'none'));
  console.log('[StudioReturn]   released by payload type: ' +
    (Object.keys(report.releasedByType).length ? JSON.stringify(report.releasedByType) : 'none'));
  // Per type, name the ones that have been handed work and never answered.
  // This is the line that separates "the Curator flow works and the
  // classification flow was never built" from "nothing works".
  Object.keys(report.releasedByType).forEach(function (type) {
    if (!returnsByType[type]) {
      console.warn('[StudioReturn]   payload type ' + type + ': ' + report.releasedByType[type] +
        ' row(s) released and NOT ONE return, ever. That flow specifically is not writing back.');
    }
  });

  if (!report.flowEverReturned && report.released > 0) {
    console.warn('[StudioReturn] NO Workspace Flow has EVER written to ' + SR_SHEET + ', but ' +
      report.released + ' row(s) have been released for inference (oldest ' +
      report.oldestAwaitingMins + ' min). Either the Flow is not built, or its last step is not ' +
      'the native "add row to sheet" into ' + SR_SHEET + ' this harvest reads. A green ' +
      '"Run Completed" in the Studio UI does not rule either out — a Flow that matched zero rows ' +
      'reports exactly the same thing.');
  } else if (!report.flowEverReturned) {
    console.log('[StudioReturn] no returns yet and nothing released for inference — nothing to ' +
      'conclude. installStudioFlowFixture() then runMatrixTurnstile() gives the Flow something ' +
      'to match.');
  } else if (report.oldestAwaitingMins > CFG.TURNSTILE_STALE_MINS) {
    console.warn('[StudioReturn] a Flow HAS written before, but ' + report.awaitingReturn.length +
      ' row(s) have been waiting longer than TURNSTILE_STALE_MINS (' + CFG.TURNSTILE_STALE_MINS +
      ') — the staleness guard will recycle them. Look for a Flow erroring rather than a Flow ' +
      'that was never built.');
  }
  return report;
}

/**
 * Exercises this file end to end against a scratch doc and a scratch
 * staging row, with the Flow and Gemini both stubbed. Cleans up after
 * itself.
 *
 * What it proves: both output contracts, the doc overwrite, the staging
 * mark, the duplicate-return path, and that a malformed Auditor pass writes
 * nothing. What it does NOT prove: that any Workspace Flow exists — nothing
 * here touches one. A pass means the Apps Script half is sound, so a
 * remaining failure is in the Flow.
 */
function runStudioReturnCanary() {
  const steps = [];
  function step(name, pass, detail) { steps.push({ name: name, pass: !!pass, detail: detail || '' }); }

  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
  const returns = _getOrCreateSheet(ss, SR_SHEET);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const uid = 'CANARY-SR-' + stamp + '-' + Utilities.getUuid().substring(0, 6).toUpperCase();
  let doc = null;

  try {
    doc = DocumentApp.create('KOS Canary — StudioReturn ' + stamp);
    doc.getBody().setText('ORIGINAL SOURCE TEXT — the harvest should replace this.');
    doc.saveAndClose();
    const fileId = doc.getId();
    step('scratch doc created', !!fileId, fileId);

    staging.appendRow([new Date(), uid, 'SESSION_LOG', 'https://docs.google.com/document/d/' + fileId,
      fileId, 'STUDIO_ACTIVE', 0]);
    step('scratch STAGING_PIPELINE row created', !!_srFindStagingRow_(staging, uid), uid);

    // Curator contract, with an Auditor pass and a markdown fence — the
    // shape a real Gemini response actually arrives in.
    const curator = '```json\n{"summary":"canary","themes":["ARCHITECTURE"]}\n```';
    const auditor = '{"verdict":"PASS"}';
    const prepared = _srPrepareDocText_('SESSION_LOG', curator, auditor);
    step('fence stripped and Auditor merged under auditor_sign_off',
      prepared.ok && JSON.parse(prepared.text).auditor_sign_off &&
      JSON.parse(prepared.text).auditor_sign_off.verdict === 'PASS',
      prepared.ok ? prepared.text : prepared.error);

    const badAuditor = _srPrepareDocText_('SESSION_LOG', curator, 'not json at all');
    step('a malformed Auditor pass fails instead of writing un-audited output',
      !badAuditor.ok && badAuditor.error.indexOf('AUDITOR_JSON_PARSE_FAILED') === 0,
      JSON.stringify(badAuditor));

    const classification = _srPrepareDocText_('VECTOR_CLASSIFY', '```json\n[{"theme":"UI"}]\n```', '');
    step('classification output is written verbatim, fence and all',
      classification.ok && classification.text.indexOf('```') === 0,
      'the original text is written; the fence is stripped only to validate');

    const notArray = _srPrepareDocText_('VECTOR_CLASSIFY', '{"theme":"UI"}', '');
    step('non-array classification output is rejected',
      !notArray.ok && notArray.error === 'CLASSIFICATION_JSON_NOT_ARRAY', JSON.stringify(notArray));

    returns.appendRow([new Date(), uid, 'SESSION_LOG', curator, auditor, '', 0, '']);
    const first = harvestStudioReturns();
    step('harvest applied the return', first.applied >= 1, JSON.stringify(first));

    const after = _srFindStagingRow_(staging, uid);
    step('staging row reached FLOW_COMPLETE', after && after.status === 'FLOW_COMPLETE',
      after ? after.status : 'row missing');

    const bodyNow = DocumentApp.openById(fileId).getBody().getText();
    step('doc body was replaced with the merged JSON',
      bodyNow.indexOf('ORIGINAL SOURCE TEXT') === -1 && bodyNow.indexOf('auditor_sign_off') !== -1,
      bodyNow.substring(0, 80));

    step('no doc-written breadcrumb left behind', !_srIsDocWritten_(uid),
      'the breadcrumb is cleared once the staging mark succeeds');

    // A duplicate return, which the staleness guard can genuinely produce.
    returns.appendRow([new Date(), uid, 'SESSION_LOG',
      '{"summary":"a stale second result that must not clobber the first"}', '', '', 0, '']);
    harvestStudioReturns();
    const bodyAfterDup = DocumentApp.openById(fileId).getBody().getText();
    step('a duplicate return is consumed without re-writing the doc',
      bodyAfterDup === bodyNow, 'body unchanged');
  } catch (e) {
    step('canary ran without throwing', false, e.message);
  } finally {
    _srCanaryCleanUp_(staging, returns, uid, doc);
  }

  const passed = steps.filter(function (s) { return s.pass; }).length;
  const ok = passed === steps.length;
  console.log('[StudioReturn] canary: ' + passed + '/' + steps.length + ' step(s) passed');
  steps.forEach(function (s) {
    console.log('[StudioReturn]   ' + (s.pass ? 'PASS' : 'FAIL') + '  ' + s.name +
      (s.detail ? ' — ' + s.detail : ''));
  });
  console.log('[StudioReturn] This exercised the Apps Script half ONLY — no Workspace Flow was ' +
    'involved. Use installStudioReturnFixture() to find out whether a real Flow returns anything.');
  return { ok: ok, passed: passed, total: steps.length, steps: steps };
}

function _srCanaryCleanUp_(staging, returns, uid, doc) {
  try {
    const width = Object.keys(SR_COLS).length;
    const lastRow = returns.getLastRow();
    if (lastRow > 1) {
      const data = returns.getRange(2, 1, lastRow - 1, width).getValues();
      for (let i = data.length - 1; i >= 0; i--) {
        if (String(data[i][SR_COLS.PAYLOAD_UID]).trim() === uid) returns.deleteRow(i + 2);
      }
    }
    const sLast = staging.getLastRow();
    if (sLast > 1) {
      const sData = staging.getRange(2, 1, sLast - 1, 7).getValues();
      for (let i = sData.length - 1; i >= 0; i--) {
        if (String(sData[i][CFG.STAGING_COLS.PAYLOAD_UID]).trim() === uid) staging.deleteRow(i + 2);
      }
    }
    _srClearDocWritten_(uid);
    if (doc) DriveApp.getFileById(doc.getId()).setTrashed(true);
  } catch (e) {
    console.warn('[StudioReturn] canary cleanup incomplete: ' + e.message +
      ' — look for Payload_UID ' + uid);
  }
}
