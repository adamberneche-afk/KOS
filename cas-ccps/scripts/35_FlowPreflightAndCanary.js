// =============================================================================
// FILE: 35_FlowPreflightAndCanary.js
// BOUND TO: Central Ledger spreadsheet
// PURPOSE: Two diagnostic tools, deliberately different from
//          34_QueueWatchdog.js's ongoing production monitoring:
//
//          1. runFlowPreflightCheck() — a structural check you run once,
//             right after configuring flows in Studio (or any time you
//             suspect something's misconfigured), BEFORE relying on real
//             traffic to reveal a problem. Checks the things a Studio
//             flow depends on existing and being reachable — tabs,
//             columns, script properties — none of which the flow's own
//             execution log would ever complain about if missing (a
//             flow just silently never matches its trigger condition,
//             or a native step silently can't find a sheet it expected).
//
//          2. runFlow1Canary() — an actual end-to-end test: writes a
//             synthetic RubricQueue row with clearly-fake data, waits
//             for the real, live Flow 1 to process it, and reports
//             whether it reached the expected terminal state. This is
//             the one thing 34_QueueWatchdog.js and the pre-flight check
//             can't do — both of those only ever look at data that's
//             already there; this is the only one of the three that
//             actually exercises the deployed Studio flow.
//
// WHY ONLY FLOW 1 GETS A FULLY BUILT CANARY HERE, NOT ALL FIVE: Flow 1 is
// the one flow in this system safe to synthetically trigger without a
// real test fixture already in place — it only reads a prompt template
// doc and writes a row to an existing TeacherMatrix. Flows 3 and 5
// create real Drive folders and docs and share them with a real Google
// account; Flow 2 and Flow 4 read and write real student submission
// docs. Faking those safely needs a genuine test student account and a
// scratch folder structure that only you can set up — inventing
// placeholder IDs for those here would either silently no-op against
// nothing real, or worse, write test data somewhere a real student's
// data lives. The canary pattern below (write synthetic row -> poll for
// terminal status -> report -> clean up) is written to be the template
// for the other four once those fixtures exist — see the closing notes.
//
// THE CompetencyEvidence CHECK BELOW IS A TRUE POSITIVE, NOT A BUG:
// on a fresh deployment this fails — confirmed directly, not assumed:
// neither 16_UnifiedManualSetup.js nor 28_Module2Setup.js's automatic
// setup flow creates CompetencyEvidence, SCRSuggestions, or
// SCRDecisionLog. All three are only ever created by
// createSCRTabs_() (30_SCRSuggestionEngine.js) — a MANUAL, one-time
// admin action with no menu entry of its own (see that file's own
// "INTEGRATION WITH SCRIPT 16" note on making it discoverable the same
// way 28_Module2Setup.js's own menu items already are) — or, for
// CompetencyEvidence specifically, self-created the first time
// cas-ccps/studio-steps/CommitStudentEvaluationStep.gs actually writes
// to it. Keep this check; it's exactly the gap
// 30_SCRSuggestionEngine.js's own "[S30] Aborting run" log line
// describes on a fresh deployment that hasn't run createSCRTabs_() yet.
//
// FIXES APPLIED HERE, per the Studio Steps adoption review:
//   - Dropped the dead ADMIN_SS_ID script-property check from
//     runFlowPreflightCheck(): getConfig_() on this function's very
//     first line already throws if ADMIN_SS_ID is missing (see
//     00_SharedConfig.js's own required-properties check), so a later
//     check for the same property can never actually observe a failure
//     — by the time execution would reach it, either the property is
//     set, or the function already crashed before getting there.
//   - runFlow1Canary()'s synthetic-row write used to compute
//     sheet.getLastRow() + 1 and write to that exact row number — a
//     race if anything else appends to RubricQueue in the same moment
//     (plausible: this is the same tab Flow 1's own trigger and real
//     teacher rubric submissions use). Switched to appendRow() wrapped
//     in a document lock, the same pattern 03_QueueBridge.js,
//     06_StagingPipeline_Turnstile.js, and 08_TeacherConfirmationStep.js
//     already use for exactly this class of concurrent-write hazard.
//   - cleanUpFlow1Canary()'s deleteRow(rowNum) used to shift every row
//     below it up by one. That's fine in isolation, but this project
//     now also lands 34_QueueWatchdog.js (Step 5 of this adoption),
//     which tracks in-flight rows by absolute row number in its own
//     PropertiesService-backed state — an unrelated canary cleanup
//     deleting a row in between would silently invalidate every one of
//     that state's row-number keys for every row below it. Switched to
//     clearing the row's contents in place (clearContent()) instead of
//     removing it — the row becomes blank but every row number below it
//     stays stable, which is what any other code tracking rows by
//     position needs to be able to assume.
// =============================================================================

// -----------------------------------------------------------------------
// runFlowPreflightCheck — structural validation only. Never touches
// Studio, never writes a test row, safe to run any time, including
// before any flow has been configured at all.
// -----------------------------------------------------------------------
function runFlowPreflightCheck() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.adminSsId);
  const results = [];

  results.push(_pfCheckTab_(ss, 'RubricQueue', 10)); // Flow 1 — see WD_RUBRIC_QUEUE_COLUMNS
  results.push(_pfCheckTab_(ss, 'STAGING_PIPELINE', 6)); // Flow 2 — see WD_STAGING_PIPELINE_COLUMNS
  results.push(_pfCheckTab_(ss, 'WarmUpQueue', 21)); // Flows 3/4/5 — see WD_WARMUP_QUEUE_COLUMNS
  results.push(_pfCheckTab_(ss, 'WarmUpRegistry', 12)); // Flow 4's finalizeWarmUpScore target
  // 8, not 9 — archive_status (roadmap 2.2) is self-healing
  // (_ensureCompetencyEvidenceArchiveColumn_, 30_SCRSuggestionEngine.js)
  // and read by header name with a graceful "nothing archived" fallback
  // when absent, so its absence on an un-healed pre-2.2 tab is not a
  // flow-breaking gap the way a missing column 1-8 would be.
  results.push(_pfCheckTab_(ss, 'CompetencyEvidence', 8)); // Flow 2's commitStudentEvaluation target
  results.push(_pfCheckTab_(ss, 'Ledger', 19)); // Flow 2's readInstructorConfig source
  results.push(_pfCheckTab_(ss, 'MatrixRegistry', 4)); // Flow 2's readInstructorConfig source

  results.push(_pfCheckScriptProperty_('CAS_CHAT_WEBHOOK_URL', false));

  const failed = results.filter(function (r) { return !r.ok; });
  _pfWriteReport_(ss, results);

  console.log('[Preflight] ' + (results.length - failed.length) + '/' + results.length + ' checks passed.');
  failed.forEach(function (r) { console.error('[Preflight] FAIL: ' + r.label + ' — ' + r.detail); });

  return { total: results.length, failed: failed.length, results: results };
}

function _pfCheckTab_(ss, tabName, expectedMinCols) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    return { ok: false, label: 'Tab: ' + tabName, detail: 'Tab does not exist in this spreadsheet.' };
  }
  const lastCol = sheet.getLastColumn();
  if (lastCol < expectedMinCols) {
    return {
      ok: false, label: 'Tab: ' + tabName,
      detail: 'Only ' + lastCol + ' column(s) found; expected at least ' + expectedMinCols +
        '. A flow reading/writing a column past ' + lastCol + ' will fail silently.',
    };
  }
  return { ok: true, label: 'Tab: ' + tabName, detail: lastCol + ' columns, exists.' };
}

function _pfCheckScriptProperty_(key, required) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    return {
      ok: !required, label: 'Script property: ' + key,
      detail: required
        ? 'Missing and required — most checks and all flows depend on this.'
        : 'Not set — alerts will fall back to the execution log only, not Chat.',
    };
  }
  return { ok: true, label: 'Script property: ' + key, detail: 'Configured.' };
}

function _pfWriteReport_(ss, results) {
  let sheet = ss.getSheetByName('Preflight');
  if (!sheet) sheet = ss.insertSheet('Preflight');
  sheet.clear();
  const rows = [['Check', 'Status', 'Detail'], ['Last run', new Date().toString(), '']];
  results.forEach(function (r) {
    rows.push([r.label, r.ok ? 'OK' : 'FAIL', r.detail]);
  });
  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  sheet.autoResizeColumns(1, 3);
}

function runFlowPreflightCheckNow() {
  const result = runFlowPreflightCheck();
  SpreadsheetApp.getUi().alert(
    result.failed === 0
      ? 'All ' + result.total + ' preflight checks passed. See the Preflight tab for detail.'
      : result.failed + ' of ' + result.total + ' checks FAILED — see the Preflight tab.'
  );
}

// -----------------------------------------------------------------------
// runFlow1Canary — writes a synthetic RubricQueue row, waits for the
// live Flow 1 to process it, reports pass/fail. Requires a real,
// existing TeacherMatrix spreadsheet to point the canary at — reads its
// ID from a script property rather than inventing one, since a made-up
// ID would just make the canary fail for the wrong reason (Flow 1's
// commitRubricDraft step legitimately can't open a spreadsheet that
// doesn't exist).
//
// SET THIS ONCE BEFORE FIRST USE: PropertiesService script property
// CAS_CANARY_TEST_MATRIX_SS_ID — any real TeacherMatrix-shaped
// spreadsheet you're comfortable writing throwaway test rows into. A
// scratch copy of a real TeacherMatrix works fine; doesn't need to be
// attached to a real teacher's live one.
//
// The synthetic row uses a clearly-fake teacher email
// (canary-test@example.invalid — .invalid is the actual reserved TLD
// for exactly this purpose, never a deliverable address) so it's
// unmistakable in the sheet and impossible to confuse with a real
// submission.
//
// CONCURRENT-WRITE SAFETY: appends under a document lock rather than
// computing sheet.getLastRow() + 1 itself — RubricQueue is the same tab
// real teacher rubric submissions land on, so a canary run overlapping
// with real traffic is a real possibility, not a hypothetical one. See
// this file's own header for the full reasoning and precedent.
// -----------------------------------------------------------------------
function runFlow1Canary() {
  const cfg = getConfig_();
  const testMatrixSsId = PropertiesService.getScriptProperties().getProperty('CAS_CANARY_TEST_MATRIX_SS_ID');
  if (!testMatrixSsId) {
    const msg = 'CAS_CANARY_TEST_MATRIX_SS_ID script property not set — see this function\'s header comment.';
    console.error('[Canary:Flow1] ' + msg);
    return { ok: false, detail: msg };
  }

  const ss = SpreadsheetApp.openById(cfg.adminSsId);
  const sheet = ss.getSheetByName('RubricQueue');
  if (!sheet) {
    return { ok: false, detail: 'RubricQueue tab not found — run runFlowPreflightCheck() first.' };
  }

  const marker = 'canary-' + new Date().getTime();
  const row = [
    new Date(), 'canary-test@example.invalid', 'Canary Test Teacher', 'Canary Subject',
    'Canary Course', 'Standard',
    // A short, clean rubric text — realistic enough for the real
    // FLOW_1_SYSTEM_PROMPT to extract something structured from, not
    // testing prompt quality, just that the pipeline runs end to end.
    'Students will identify three components of a marketing funnel and explain how each ' +
      'connects to customer decision-making. (' + marker + ')',
    'CANARY-NO-TEMPLATE', // PromptTemplateID — Flow 1's Step 1 (Drive read) will fail to find
    // this, which is fine: it exercises the "Gemini gets no template
    // text" path, not a fully realistic run. See the closing notes for
    // why a fully realistic canary needs a real template doc ID too.
    testMatrixSsId,
    'PENDING_EXTRACTION',
  ];

  const lock = LockService.getDocumentLock();
  let newRowNum;
  try {
    lock.waitLock(15000);
  } catch (e) {
    const msg = 'Could not acquire document lock — another write is in progress. Try again shortly.';
    console.error('[Canary:Flow1] ' + msg);
    return { ok: false, detail: msg };
  }
  try {
    sheet.appendRow(row);
    newRowNum = sheet.getLastRow();
  } finally {
    lock.releaseLock();
  }
  console.log('[Canary:Flow1] Wrote synthetic row ' + newRowNum + ' (marker: ' + marker + '). Waiting for Flow 1...');

  // Poll every 15s for up to 3 minutes — same cadence
  // 25_WarmUpWriter.js's own (unused) pollForFlow4Result_ already
  // established as reasonable for "wait on a Studio flow" in this
  // codebase.
  const maxAttempts = 12;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    Utilities.sleep(15000);
    const status = String(sheet.getRange(newRowNum, 10).getValue()).trim();
    if (status === 'COMPLETE' || status === 'EXTRACTION_ERROR' || status === 'STUDIO_TIMEOUT') {
      const result = {
        ok: status === 'COMPLETE',
        detail: 'Row ' + newRowNum + ' reached "' + status + '" after ~' + (attempt * 15) + 's.',
        rowNum: newRowNum,
        finalStatus: status,
      };
      console.log('[Canary:Flow1] ' + (result.ok ? 'PASS' : 'FAIL') + ' — ' + result.detail);
      return result;
    }
  }

  const timeoutResult = {
    ok: false,
    detail: 'Row ' + newRowNum + ' still "' + sheet.getRange(newRowNum, 10).getValue() +
      '" after 3 minutes — Flow 1 likely never picked it up. Check it\'s turned on in Studio ' +
      'and its trigger condition (Status = PENDING_EXTRACTION) is configured correctly.',
    rowNum: newRowNum,
  };
  console.error('[Canary:Flow1] FAIL (timeout) — ' + timeoutResult.detail);
  return timeoutResult;
}

function runFlow1CanaryNow() {
  const result = runFlow1Canary();
  SpreadsheetApp.getUi().alert((result.ok ? '✅ PASS: ' : '❌ FAIL: ') + result.detail);
}

// Blanks a canary's synthetic row after you've reviewed the result —
// not run automatically, since you may want to inspect the row (and
// whatever it wrote to the test TeacherMatrix) before it's gone.
//
// Clears the row's contents in place rather than deleting it — see
// this file's own header for why deleteRow() (which shifts every row
// below it up by one) is unsafe here now that 34_QueueWatchdog.js
// tracks rows by absolute position in its own state.
function cleanUpFlow1Canary(rowNum) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.adminSsId);
  const sheet = ss.getSheetByName('RubricQueue');
  const email = String(sheet.getRange(rowNum, 2).getValue());
  if (email.indexOf('canary-test@') !== 0) {
    throw new Error('Row ' + rowNum + ' does not look like a canary row (TeacherEmail: "' +
      email + '") — refusing to clear. Pass the exact rowNum runFlow1Canary() returned.');
  }
  sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).clearContent();
  console.log('[Canary:Flow1] Cleared row ' + rowNum + '.');
}

// =============================================================================
// EXTENDING THE CANARY PATTERN TO FLOWS 2-5
//
// Each needs a real test fixture only you can provide, not something
// safe to invent:
//   - Flow 1 (built above): a scratch TeacherMatrix-shaped spreadsheet.
//     Fully realistic testing also wants a real Drive doc ID for
//     PromptTemplateID — CANARY-NO-TEMPLATE above deliberately tests the
//     "template not found" path instead, which still proves the flow
//     fires and Step 4 marks something, just not the full happy path.
//   - Flow 2: a real Ledger row + real TeacherMatrix row for a fake
//     "student," and a real (fake) student submission doc with the
//     expected zone markers already in it.
//   - Flow 3 and Flow 5: a real Drive folder tree matching Flow 3's
//     expected structure, and — this is the one that needs a genuine
//     answer, not a workaround — a real Google account to share the
//     generated doc with. A synthetic email won't work here the way it
//     does for Flow 1's TeacherEmail column, because Flow 3 actually
//     calls DriveApp.addEditor() with it.
//   - Flow 4: a real WarmUpQueue row already at DELIVERED, with a real
//     doc containing a real student response in Zone 2.
//
// The shape to follow once those exist: write a synthetic row with a
// clear marker (same canary-test@example.invalid / timestamp-marker
// convention as Flow 1's), poll the same way runFlow1Canary() does,
// check for whichever terminal statuses that flow can produce, clean up
// the same way. Nothing about the polling/reporting mechanics above is
// Flow-1-specific — only the row shape and the fixture requirements are.
// =============================================================================
