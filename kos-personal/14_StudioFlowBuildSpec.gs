/**
 * ================================================================
 * 14_StudioFlowBuildSpec.gs — KOS v8.0
 * BOUND TO: kos-personal (main flat-folder project)
 * ================================================================
 *
 * Generates the sheet an operator builds either Studio Flow from — the
 * same friction cas-ccps/scripts/42_FlowBuildSpec.js addresses there,
 * closing the one gap kos-personal had that cas-ccps and leader-hub
 * didn't: every value to type here lived only in
 * STUDIO_INTEGRATION_SPEC.md's hand-written prose. `13_StudioInputBuilder.gs`
 * and `12_StudioReturnHarvest.gs`'s own column constants are the
 * authoritative source; this generates a sheet FROM them, so a schema
 * change is caught by re-running this rather than by an operator
 * discovering a stale prose table mid-build.
 *
 * WHAT THIS DOES AND DELIBERATELY DOES NOT DO. It emits the *derived*
 * half — every tab name, column number, header, trigger condition and
 * prompt key, computed from `CI_COLS`/`CI_CURATOR_TAB`/`CI_CLASSIFY_TAB`
 * (13_StudioInputBuilder.gs) and `SR_COLS`/`SR_CURATOR_TYPES`
 * (12_StudioReturnHarvest.gs). Those are the drift-prone facts.
 *
 * It does NOT re-transcribe the authored half: connector names,
 * temperature, token limits, or the reasoning behind a step. Copying
 * that here would make this sheet a third document to keep in sync with
 * STUDIO_INTEGRATION_SPEC.md and CURATOR_PROMPT.md/VECTOR_CLASSIFY_PROMPT.md.
 * Each row points at where that judgement lives instead.
 *
 * ENTRY POINTS (no trailing underscore — GAS hides those from the Run
 * dropdown):
 *   syncStudioFlowBuildSpec()   — write/refresh the FlowBuildSpec tab
 *   checkStudioFlowBuildSpec()  — is the tab present and current?
 */

const SFBS_TAB = 'FlowBuildSpec';
const SFBS_HEADERS = ['flow', 'surface', 'tab', 'column', 'header', 'who_writes_it', 'notes'];

/**
 * Writes the FlowBuildSpec tab: one row per column an operator has to
 * bind or deliberately leave alone, plus a header row per flow carrying
 * its trigger condition and prompt key.
 *
 * Idempotent — rewrites the whole tab, so a schema change anywhere
 * upstream is picked up by re-running this rather than by editing
 * anything by hand.
 */
function syncStudioFlowBuildSpec() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const rows = [SFBS_HEADERS.slice()];

  _sfbsAppendCuratorFlow_(rows);
  _sfbsAppendClassifyFlow_(rows);
  _sfbsAppendReturnSurface_(rows);

  let sheet = ss.getSheetByName(SFBS_TAB);
  if (!sheet) sheet = ss.insertSheet(SFBS_TAB);
  sheet.clear();
  sheet.getRange(1, 1, rows.length, SFBS_HEADERS.length).setValues(rows);
  sheet.getRange(1, 1, 1, SFBS_HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  console.log('[BuildSpec] wrote ' + (rows.length - 1) + ' row(s) to ' + SFBS_TAB + '.');
  console.log('[BuildSpec] Every column number, header and trigger condition there is DERIVED ' +
    'from the constants the code reads — copy from that tab, not from ' +
    'STUDIO_INTEGRATION_SPEC.md\'s prose. Connector names, prompt text, temperature and token ' +
    'limits are NOT here on purpose: they need judgement, they do not drift, and copying them ' +
    'would make this sheet a third document to keep in sync. The notes column points at where ' +
    'each of those lives.');
  return { rows: rows.length - 1 };
}

// The Curator flow — SESSION_LOG/EXTERNAL_DATA/COG_STIMULUS/COG_EXHAUST,
// via CuratorInput.
function _sfbsAppendCuratorFlow_(rows) {
  rows.push(['Curator', 'trigger', CI_CURATOR_TAB, '', '',
    '13_StudioInputBuilder.gs',
    'Trigger on Status = READY. Single condition — this tab only ever carries ' +
    SR_CURATOR_TYPES.join('/') + ' rows, so there is nothing to combine it with ' +
    '(meta/FLOW_DOCTRINE.md rule 14).']);
  Object.keys(CI_COLS).sort(function (a, b) { return CI_COLS[a] - CI_COLS[b]; }).forEach(function (key) {
    const col = CI_COLS[key];
    const header = SFBS_INPUT_HEADER_NAMES[key];
    const isSourceText = key === 'SOURCE_TEXT';
    rows.push(['Curator', 'read', CI_CURATOR_TAB, col + 1, header,
      '13_StudioInputBuilder.gs',
      isSourceText ? 'Bind Gemini\'s variable to @trigger.SourceText — the materialized ' +
        'document text. No Docs connector needed.' : '']);
  });
  rows.push(['Curator', 'prompt', '', '', '', 'CURATOR_PROMPT.md',
    'Paste verbatim as the Ask Gemini step\'s system prompt. See STUDIO_INTEGRATION_SPEC.md ' +
    'Step 7\'s connector table for the optional Auditor pass (rows 2a/2b).']);
}

// The classification flow — VECTOR_CLASSIFY, via VectorClassifyInput.
function _sfbsAppendClassifyFlow_(rows) {
  rows.push(['Classify', 'trigger', CI_CLASSIFY_TAB, '', '',
    '13_StudioInputBuilder.gs',
    'Trigger on Status = READY. Single condition — this tab only ever carries ' +
    'VECTOR_CLASSIFY rows, so there is nothing to combine it with.']);
  Object.keys(CI_COLS).sort(function (a, b) { return CI_COLS[a] - CI_COLS[b]; }).forEach(function (key) {
    const col = CI_COLS[key];
    const header = SFBS_INPUT_HEADER_NAMES[key];
    const isSourceText = key === 'SOURCE_TEXT';
    rows.push(['Classify', 'read', CI_CLASSIFY_TAB, col + 1, header,
      '13_StudioInputBuilder.gs',
      isSourceText ? 'Bind Gemini\'s variable to @trigger.SourceText. The known-vectors list ' +
        'is hardcoded into the prompt itself — no other variable mapping needed.' : '']);
  });
  rows.push(['Classify', 'prompt', '', '', '', 'VECTOR_CLASSIFY_PROMPT.md',
    'Paste verbatim as the Ask Gemini step\'s system prompt.']);
}

// Both flows write into the same STUDIO_RETURN tab, dispatched by
// Payload_Type at harvest time — one surface, not two.
function _sfbsAppendReturnSurface_(rows) {
  rows.push(['Both', 'trigger (write)', SR_SHEET, '', '',
    'the Flow\'s own last step',
    'Native "add row to sheet" — NOT a trigger to build; this is what BOTH flows\' last step ' +
    'writes into.']);
  Object.keys(SR_COLS).sort(function (a, b) { return SR_COLS[a] - SR_COLS[b]; }).forEach(function (key) {
    const col = SR_COLS[key];
    const header = SFBS_RETURN_HEADER_NAMES[key];
    const flowWrites = col <= SR_COLS.AUDITOR_JSON;
    rows.push(['Both', 'write', SR_SHEET, col + 1, header,
      flowWrites ? 'the Flow' : 'harvestStudioReturns() — leave EMPTY',
      key === 'PAYLOAD_UID' || key === 'PAYLOAD_TYPE'
        ? 'Must come from the trigger row, unchanged — see checkStudioFlowBinding().'
        : '']);
  });
}

// Column-index maps carry their own constant names (TIMESTAMP, PAYLOAD_UID,
// ...), not the sheet's real header text — these translate one to the
// other, derived from the same _getOrCreateSheet H-map headers
// (5_Error_And_Utilities.gs) rather than retyped.
const SFBS_INPUT_HEADER_NAMES = {
  TIMESTAMP: 'Timestamp', PAYLOAD_UID: 'Payload_UID', PAYLOAD_TYPE: 'Payload_Type',
  FILE_ID: 'File_ID', SOURCE_TEXT: 'SourceText', STATUS: 'Status',
};
const SFBS_RETURN_HEADER_NAMES = {
  RETURNED_AT: 'Returned_At', PAYLOAD_UID: 'Payload_UID', PAYLOAD_TYPE: 'Payload_Type',
  PRIMARY_JSON: 'Primary_JSON', AUDITOR_JSON: 'Auditor_JSON',
  HARVEST_STATUS: 'Harvest_Status', ATTEMPTS: 'Attempts', ERROR: 'Error',
};

/**
 * Read-only. Reports whether FlowBuildSpec exists and matches what the
 * code would generate right now.
 */
function checkStudioFlowBuildSpec() {
  const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  const sheet = ss.getSheetByName(SFBS_TAB);
  if (!sheet) {
    console.log('[BuildSpec] ' + SFBS_TAB + ' has never been generated. Run syncStudioFlowBuildSpec().');
    return { exists: false, current: false };
  }

  const expected = [SFBS_HEADERS.slice()];
  _sfbsAppendCuratorFlow_(expected);
  _sfbsAppendClassifyFlow_(expected);
  _sfbsAppendReturnSurface_(expected);

  const actual = sheet.getDataRange().getValues();
  const keyOf = function (r) { return [r[0], r[1], r[2], r[3], r[4]].join('|'); };
  const sameShape = actual.length === expected.length;
  const current = sameShape &&
    actual.slice(1).map(keyOf).join('\n') === expected.slice(1).map(keyOf).join('\n');

  console.log('[BuildSpec] ' + SFBS_TAB + ': ' + (actual.length - 1) + ' row(s), ' +
    (current ? 'current.' : 'STALE — a tab, column or trigger condition has changed since the ' +
      'last sync. Re-run syncStudioFlowBuildSpec(), and re-check any Flow step bound to a ' +
      'column whose number moved.'));
  return { exists: true, current: current, rows: actual.length - 1, expectedRows: expected.length - 1 };
}
