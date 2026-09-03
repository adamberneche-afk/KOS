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
// WHICH FLOWS HAVE CANARIES, AND WHY THE OTHERS DON'T: Flow 1 was the
// one flow safe to synthetically trigger without an operator-provided
// fixture — it only reads a prompt template doc and writes a row to an
// existing TeacherMatrix. Flows 3 and 5 create real Drive folders and
// docs and share them with a real Google account (Flow 3 actually calls
// DriveApp.addEditor(), so a synthetic address won't do); Flow 4 needs a
// real WarmUpQueue row already at DELIVERED with a real response in
// Zone 2. Inventing placeholder IDs for those would either silently
// no-op against nothing real or, worse, write test data where a real
// student's data lives.
//
// Flow 2 was in that same "needs a real student doc" category until
// 37_FlowInputBuilder.js moved its entire lookup chain out of Studio and
// into code. runFlow2Canary() below now provisions its own scratch
// student doc and scratch TeacherMatrix and trashes both afterwards, so
// it needs nothing from the operator — at the cost of verifying the code
// half only, with Studio deliberately stubbed out. Read that function's
// own header before trusting a PASS from it: it is a different kind of
// canary than Flow 1's, which does wait on the live Studio flow.
//
// The Flow 1 pattern (write synthetic row -> poll for terminal status ->
// report -> clean up) remains the template for Flows 3-5 once their
// fixtures exist — see the closing notes.
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
  // Self-healing (37_FlowInputBuilder.js's own _fiEnsureTab_) — absent on
  // a deployment that has never run buildFlowInputRows() yet, same
  // reasoning as the CompetencyEvidence check above. 21, not fewer —
  // GeminiFullOutput (col 21) is written by Studio Flow 2 itself, not by
  // the builder, but the column must already exist for that write to
  // land anywhere. 22 since PromptText (col 22) was appended for the
  // @trigger.PromptText chip — see 40_FlowPrompts.js.
  results.push(_pfCheckTab_(ss, 'FlowInput', 22)); // Flow 2's materialized input row

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
// runFlow2Canary — exercises the ENTIRE Apps Script half of Flow 2
// (37_FlowInputBuilder.js) end to end against this live deployment,
// with fully synthetic, self-provisioned fixtures.
//
// READ THIS FIRST — IT IS A DIFFERENT KIND OF CANARY THAN FLOW 1'S.
// runFlow1Canary() above waits on the real, live Studio flow and so
// proves Studio itself works. This one deliberately does NOT. It calls
// buildFlowInputRows() directly, then SIMULATES Studio's write (a
// canned Gemini output + ReadyStatus = EVALUATED), then calls
// harvestFlowInputResults() directly. A PASS here means every line of
// code cas-ccps owns in Flow 2 is correct; it says nothing whatsoever
// about whether the Studio flow is built, turned on, or wired to the
// right columns.
//
// That split is the point, not a shortcut. Flow 2's Studio side is now
// only four steps (trigger on FlowInput / Extract the doc / Ask Gemini /
// write the result back), and everything else is code. Proving the code
// half separately means that when the full chain misbehaves, the
// failure is unambiguously Studio's — no hunting across six tabs to
// work out which half broke.
//
// WHY THIS IS NOW POSSIBLE, WHEN THIS FILE'S HEADER USED TO SAY IT
// WASN'T: the old objection was that Flow 2 "read[s] and write[s] real
// student submission docs," needing a test-student fixture only the
// operator could set up. 37_FlowInputBuilder.js's redesign removes
// that: the whole lookup chain now runs in code, so the canary can
// create its OWN scratch student doc and its OWN scratch TeacherMatrix
// spreadsheet and trash both afterwards. Nothing belonging to a real
// student or a real teacher is read or written at any point.
//
// SAFETY — WHY THE SYNTHETIC STAGING ROW CANNOT LEAK INTO REAL
// PROCESSING: its QueueRowRef is the literal string 'CANARY', not a
// number. Both branches of 03_QueueBridge.js's backPropagateCompletions()
// gate on parseInt(queueRowRef) — `if (isNaN(rowNum) || rowNum < 2)
// continue` on the COMPLETE path, and the same !isNaN guard wrapping the
// whole ERROR_TIMEOUT path including its notifyTimeoutToTeacher_() call.
// A non-numeric ref therefore makes that function skip the row entirely
// on every path, so the canary can never close a real ReviewQueue row,
// never stamp a real Ledger row, and never send mail to the fake
// address. That is load-bearing: do not "tidy" QueueRowRef into a
// number.
//
// The live 1-minute buildFlowInputRows and 2-minute
// harvestFlowInputResults triggers may fire mid-canary. That's safe:
// both take the same document lock this function's callees take, so
// they serialize rather than interleave, the builder dedupes on
// StudentFileID + ConfigID so a concurrent run can't double-create, and
// harvest only ever touches rows at EVALUATED.
// =============================================================================
function runFlow2Canary() {
  const cfg = getConfig_();
  // Timestamp plus a random token, not the timestamp alone: two runs in the
  // same millisecond would otherwise share a ConfigID, a teacher address and
  // every derived marker, and the second would resolve against the first's
  // fixtures. Same "+ random token" shape _generateEvidenceId_()
  // (15c_Flow2DirectEvaluationService.js) already uses for the same reason.
  const stamp = String(new Date().getTime()) + '-' +
    Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
  const configId = 'VDOE-CANARY-' + stamp;
  // Per-run unique, deliberately. _fiFindMatrixSsId_ returns the FIRST
  // MatrixRegistry row matching a teacher email, so a fixed address would
  // make a second canary run resolve to the FIRST run's scratch matrix —
  // which has no row for the new ConfigID, failing the builder stage for a
  // reason that has nothing to do with the deployment. Plus-addressing keeps
  // the runs independent; .invalid is the reserved, never-deliverable TLD.
  const teacherEmail = 'canary-test+' + stamp + '@example.invalid';
  const studentEmail = 'canary-student@example.invalid';
  const stages = [];
  const record = function (label, ok, detail) {
    stages.push({ label: label, ok: ok, detail: detail || '' });
    console.log('[Canary:Flow2] ' + (ok ? 'PASS' : 'FAIL') + ' — ' + label +
                (detail ? ' — ' + detail : ''));
    return ok;
  };
  const fail = function (label, detail) {
    record(label, false, detail);
    return { ok: false, configId: configId, stages: stages, detail: detail };
  };

  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const staging = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  const registry = ss.getSheetByName(cfg.tabs.matrixRegistry);
  if (!staging || !ledger || !registry) {
    return fail('Fixture tabs present',
      'STAGING_PIPELINE, Ledger or MatrixRegistry missing — run runFlowPreflightCheck() first.');
  }

  let scratchDocId = null;
  let scratchMatrixSsId = null;

  try {
    // ── Provision throwaway fixtures ───────────────────────────────────────
    const doc = DocumentApp.create('[CANARY] Flow 2 Student Doc ' + stamp);
    scratchDocId = doc.getId();
    doc.getBody().appendParagraph('── FEEDBACK ──');
    doc.getBody().appendParagraph(
      '[No feedback yet. Use 📊 AI Evaluation Panel → Run Assignment Check ' +
      'to request your first evaluation.]');
    doc.getBody().appendParagraph('── END FEEDBACK ──');
    doc.getBody().appendParagraph('── YOUR RESPONSE BEGINS HERE ──');
    doc.getBody().appendParagraph('This is a canary submission. Not a real student response.');
    doc.saveAndClose();

    const matrixSs = SpreadsheetApp.create('[CANARY] Flow 2 Teacher Matrix ' + stamp);
    scratchMatrixSsId = matrixSs.getId();
    const matrixSheet = matrixSs.getActiveSheet().setName('TeacherMatrix');
    // 20 columns, matching FI_TM_COLUMNS_ / CommitRubricDraftStep.gs's TM_COLUMNS_.
    matrixSheet.appendRow([
      'ConfigID', 'UnitName', 'Tier', 'Persona',
      'Milestone1', 'Milestone2', 'Milestone3', 'Milestone4',
      'DefinitionOfDone', 'InstructorEmail', 'Created', 'Status',
      'PromptTemplateID', 'Subject', 'CourseName',
      'Milestone1CompetencyId', 'Milestone2CompetencyId',
      'Milestone3CompetencyId', 'Milestone4CompetencyId', 'LessonUnitId',
    ]);
    matrixSheet.appendRow([
      configId, 'Canary Unit', 'Tier 1 Core', 'Canary Coach',
      'Canary milestone one', 'Canary milestone two',
      'Canary milestone three', 'Canary milestone four',
      'Canary definition of done', teacherEmail, new Date(), 'LIVE',
      'CANARY-NO-TEMPLATE', 'Canary Subject', 'Canary Course',
      'CANARY-COMP-1', 'CANARY-COMP-2', 'CANARY-COMP-3', 'CANARY-COMP-4',
    ]);
    SpreadsheetApp.flush();
    record('Provisioned scratch doc + TeacherMatrix', true,
      'doc ' + scratchDocId + ', matrix ' + scratchMatrixSsId);

    // ── Seed the three rows the builder reads ─────────────────────────────
    const lock = LockService.getDocumentLock();
    try {
      lock.waitLock(15000);
    } catch (e) {
      return fail('Acquire document lock', 'Another write is in progress; try again shortly.');
    }
    let stagingRowNum;
    try {
      registry.appendRow(['Canary Test Teacher', teacherEmail, scratchMatrixSsId, new Date()]);

      const ledgerRow = new Array(19).fill('');
      ledgerRow[LEDGER.TIMESTAMP] = new Date();
      ledgerRow[LEDGER.GOOGLE_ID] = studentEmail;
      ledgerRow[LEDGER.CONFIG_ID] = configId;
      ledgerRow[LEDGER.FILE_ID] = scratchDocId;
      ledgerRow[LEDGER.STUDENT_NAME] = 'Canary Student';
      ledgerRow[LEDGER.TEACHER_NAME] = 'Canary Test Teacher';
      ledgerRow[LEDGER.TEACHER_EMAIL] = teacherEmail;
      ledgerRow[LEDGER.STATUS] = 'ACTIVE';
      ledgerRow[LEDGER.ADMIN_FILE_URL] =
        'https://docs.google.com/document/d/' + scratchDocId + '/edit';
      ledger.appendRow(ledgerRow);

      // QueueRowRef = 'CANARY' deliberately — see this function's header.
      staging.appendRow([new Date(), 'CANARY', scratchDocId, configId, teacherEmail, 'IN_PROCESS']);
      stagingRowNum = staging.getLastRow();
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    record('Seeded MatrixRegistry + Ledger + STAGING_PIPELINE rows', true,
      'staging row ' + stagingRowNum);

    // ── Stage 1: the builder's 3-hop resolution ───────────────────────────
    buildFlowInputRows();

    const fiSheet = ss.getSheetByName((cfg.tabs && cfg.tabs.flowInput) || 'FlowInput');
    if (!fiSheet) return fail('FlowInput tab created', 'buildFlowInputRows() did not create the tab.');

    const fiData = fiSheet.getDataRange().getValues();
    let fiRowNum = -1;
    for (let i = 1; i < fiData.length; i++) {
      if (String(fiData[i][FI.CONFIG_ID]).trim() === configId) { fiRowNum = i + 1; break; }
    }
    if (fiRowNum === -1) {
      return fail('Builder materialized a FlowInput row',
        'No row for ' + configId + '. Most likely a broken lookup hop — check the ' +
        'execution log for a "will retry next cycle" line naming which one, and run ' +
        'checkLedgerSchema() in case the Ledger columns have drifted.');
    }
    const fiRow = fiData[fiRowNum - 1];

    const expected = [
      [FI.STUDENT_FILE_ID, scratchDocId, 'StudentFileID'],
      [FI.TEACHER_EMAIL, teacherEmail, 'TeacherEmail'],
      [FI.STUDENT_EMAIL, studentEmail, 'StudentEmail'],
      [FI.STUDENT_DOC_URL, 'https://docs.google.com/document/d/' + scratchDocId + '/edit', 'StudentDocURL'],
      [FI.UNIT_NAME, 'Canary Unit', 'UnitName'],
      [FI.TIER, 'Tier 1 Core', 'Tier'],
      [FI.PERSONA, 'Canary Coach', 'Persona'],
      [FI.MILESTONE_1, 'Canary milestone one', 'Milestone1'],
      [FI.MILESTONE_4, 'Canary milestone four', 'Milestone4'],
      [FI.DEFINITION_OF_DONE, 'Canary definition of done', 'DefinitionOfDone'],
      [FI.MILESTONE_1_COMPETENCY_ID, 'CANARY-COMP-1', 'Milestone1CompetencyId'],
      [FI.MILESTONE_4_COMPETENCY_ID, 'CANARY-COMP-4', 'Milestone4CompetencyId'],
      [FI.READY_STATUS, 'READY', 'ReadyStatus'],
    ];
    const wrong = expected.filter(function (e) { return String(fiRow[e[0]]).trim() !== e[1]; });
    if (wrong.length > 0) {
      return fail('Every resolved FlowInput field is correct',
        wrong.map(function (e) {
          return e[2] + ' = "' + fiRow[e[0]] + '" (expected "' + e[1] + '")';
        }).join('; '));
    }
    record('Builder resolved all 3 hops into a correct FlowInput row', true, 'row ' + fiRowNum);

    // ── Simulate Studio ───────────────────────────────────────────────────
    const cannedOutput =
      'CANARY EVALUATION. This text stands in for a real Gemini response.\n' +
      '[SYSTEM: APPROVED]\n' +
      '[SUGGESTED_SCORE: 3]\n' +
      '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"PARTIALLY_MET","4":"NOT_MET"}]';
    fiSheet.getRange(fiRowNum, FI.GEMINI_FULL_OUTPUT + 1).setValue(cannedOutput);
    fiSheet.getRange(fiRowNum, FI.READY_STATUS + 1).setValue('EVALUATED');
    SpreadsheetApp.flush();
    record('Simulated Studio\'s write (GeminiFullOutput + EVALUATED)', true,
      'NOT a test of Studio itself — see this function\'s header');

    // ── Stage 2: the harvest ──────────────────────────────────────────────
    harvestFlowInputResults();

    const docText = DocumentApp.openById(scratchDocId).getBody().getText();
    if (docText.indexOf('── END EVALUATION ──') === -1) {
      return fail('Harvest wrote the feedback block into the student doc',
        'No "END EVALUATION" marker found. 03_QueueBridge.js\'s appendNextSteps_() ' +
        'matches on that exact U+2500 marker, so its absence would also break next-steps.');
    }
    if (docText.indexOf('YOUR WORK MEETS THE STANDARD') === -1) {
      return fail('Feedback block reflects the APPROVED compliance stamp',
        'Result line missing or wrong for [SYSTEM: APPROVED].');
    }
    if (docText.indexOf('[MILESTONE_OUTCOMES:') !== -1) {
      return fail('Machine-readable outcomes line stripped before the student sees it',
        'The [MILESTONE_OUTCOMES: ...] line reached the document body.');
    }
    if (docText.indexOf('[SUGGESTED_SCORE: 3]') === -1) {
      return fail('Suggested-score line preserved in the doc',
        '04_Form2_TurnInGate.js\'s extractSuggestedScore_() reads that line out of the ' +
        'doc at turn-in time — stripping it would silently lose the score.');
    }
    record('Harvest wrote correct, correctly-filtered feedback into the doc', true);

    const evidenceSheet = ss.getSheetByName((cfg.tabs && cfg.tabs.competencyEvidence) || 'CompetencyEvidence');
    if (!evidenceSheet) return fail('CompetencyEvidence tab exists', 'Harvest did not self-heal the tab.');
    const evidence = evidenceSheet.getDataRange().getValues();
    const canaryEvidence = evidence.filter(function (r) {
      return String(r[5]).trim() === configId; // config_id is column 6 (index 5)
    });
    if (canaryEvidence.length !== 4) {
      return fail('Four CompetencyEvidence rows written (one per milestone)',
        'Found ' + canaryEvidence.length + '. All four milestones had both a competency ID ' +
        'and a valid outcome, so all four should have been written.');
    }
    const outcomes = canaryEvidence.map(function (r) { return String(r[4]).trim(); }).sort();
    if (outcomes.join(',') !== 'MET,MET,NOT_MET,PARTIALLY_MET') {
      return fail('Milestone outcomes parsed correctly onto the evidence rows',
        'Got: ' + outcomes.join(','));
    }
    record('CompetencyEvidence: 4 rows with correctly parsed outcomes', true);

    const stagingStatus = String(staging.getRange(stagingRowNum, STG_STATUS + 1).getValue()).trim();
    if (stagingStatus !== 'COMPLETE') {
      return fail('STAGING_PIPELINE row marked COMPLETE',
        'Status is "' + stagingStatus + '". Without this, backPropagateCompletions() never ' +
        'closes the loop for a real submission.');
    }
    record('STAGING_PIPELINE row flipped to COMPLETE', true, 'row ' + stagingRowNum);

    const finalFiStatus = String(fiSheet.getRange(fiRowNum, FI.READY_STATUS + 1).getValue()).trim();
    if (finalFiStatus !== 'HARVESTED') {
      return fail('FlowInput row marked HARVESTED',
        'Status is "' + finalFiStatus + '" — the row would be reprocessed on the next cycle.');
    }
    record('FlowInput row flipped to HARVESTED', true, 'row ' + fiRowNum);

    console.log('[Canary:Flow2] ✅ ALL ' + stages.length + ' STAGES PASSED. The Apps Script ' +
                'half of Flow 2 is working end to end. Studio itself is still unverified — ' +
                'build the four-step flow and watch a real submission for that.');
    console.log('[Canary:Flow2] Run cleanUpFlow2Canary(\'' + configId + '\') when you\'re done ' +
                'inspecting, to clear the synthetic rows and trash the scratch files.');

    return {
      ok: true,
      configId: configId,
      stages: stages,
      scratchDocId: scratchDocId,
      scratchMatrixSsId: scratchMatrixSsId,
      detail: 'All ' + stages.length + ' stages passed.',
    };

  } catch (err) {
    console.error('[Canary:Flow2] Threw: ' + err.message);
    return {
      ok: false, configId: configId, stages: stages,
      scratchDocId: scratchDocId, scratchMatrixSsId: scratchMatrixSsId,
      detail: 'Threw: ' + err.message + ' — run cleanUpFlow2Canary(\'' + configId +
        '\') to remove whatever was seeded before the failure.',
    };
  }
}

function runFlow2CanaryNow() {
  const result = runFlow2Canary();
  const failed = result.stages ? result.stages.filter(function (s) { return !s.ok; }) : [];
  SpreadsheetApp.getUi().alert(
    (result.ok ? '✅ PASS — ' : '❌ FAIL — ') + result.detail +
    (failed.length ? '\n\nFirst failure: ' + failed[0].label + '\n' + failed[0].detail : '') +
    '\n\nThis tests the Apps Script half of Flow 2 only, not Studio.' +
    '\n\nClean up with: cleanUpFlow2Canary(\'' + result.configId + '\')'
  );
}

// Clears everything a Flow 2 canary run seeded and trashes its scratch
// files. Not automatic — you may want to look at what it wrote first.
//
// Pass the configId runFlow2Canary() returned. Omit it to clean up every
// canary run's leftovers at once (any row whose ConfigID starts with
// 'VDOE-CANARY-'), which is what you want after a run that threw partway.
//
// Clears row contents in place rather than deleting rows — same reason
// cleanUpFlow1Canary() does: deleteRow() shifts every row below it up by
// one, and 34_QueueWatchdog.js tracks rows by absolute position in its own
// state. Refuses to touch any row that doesn't carry a canary marker.
function cleanUpFlow2Canary(configId) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const prefix = 'VDOE-CANARY-';
  const matches = function (v) {
    const s = String(v).trim();
    return configId ? s === configId : s.indexOf(prefix) === 0;
  };
  let cleared = 0;

  const clearRowsWhere = function (tabName, keyIndex) {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 2) return;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (matches(data[i][keyIndex])) {
        sheet.getRange(i + 1, 1, 1, sheet.getLastColumn()).clearContent();
        cleared++;
      }
    }
  };

  clearRowsWhere(cfg.tabs.stagingPipeline, STG_CONFIG_ID);
  clearRowsWhere(cfg.tabs.ledger, LEDGER.CONFIG_ID);
  clearRowsWhere((cfg.tabs && cfg.tabs.flowInput) || 'FlowInput', FI.CONFIG_ID);
  clearRowsWhere((cfg.tabs && cfg.tabs.competencyEvidence) || 'CompetencyEvidence', 5);

  // MatrixRegistry is keyed by teacher, not ConfigID — match the fake
  // address family instead, and only ever that. Prefix + suffix rather than
  // an exact string because runFlow2Canary() plus-addresses each run
  // (canary-test+<stamp>@example.invalid) to keep runs independent; both
  // halves must match, so no real address can ever be caught by this.
  const registry = ss.getSheetByName(cfg.tabs.matrixRegistry);
  const scratchIds = [];
  if (registry && registry.getLastRow() >= 2) {
    const data = registry.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const email = String(data[i][1]).trim();
      const isCanaryTeacher = email.indexOf('canary-test') === 0 &&
        email.lastIndexOf('@example.invalid') === email.length - '@example.invalid'.length;
      if (isCanaryTeacher) {
        const id = String(data[i][2]).trim();
        if (id) scratchIds.push(id);
        registry.getRange(i + 1, 1, 1, registry.getLastColumn()).clearContent();
        cleared++;
      }
    }
  }

  scratchIds.forEach(function (id) {
    try {
      DriveApp.getFileById(id).setTrashed(true);
      console.log('[Canary:Flow2] Trashed scratch TeacherMatrix ' + id + '.');
    } catch (e) {
      console.log('[Canary:Flow2] Could not trash ' + id + ': ' + e.message);
    }
  });

  console.log('[Canary:Flow2] Cleared ' + cleared + ' synthetic row(s).');
  console.log('[Canary:Flow2] The scratch student doc is named "[CANARY] Flow 2 Student Doc …" ' +
              'in your Drive — trash it by hand, or pass its ID to ' +
              'DriveApp.getFileById(id).setTrashed(true).');
  return { cleared: cleared, trashed: scratchIds };
}

// =============================================================================
// EXTENDING THE CANARY PATTERN TO FLOWS 3-5
//
// Each needs a real test fixture only you can provide, not something
// safe to invent:
//   - Flow 1 (built above): a scratch TeacherMatrix-shaped spreadsheet.
//     Fully realistic testing also wants a real Drive doc ID for
//     PromptTemplateID — CANARY-NO-TEMPLATE above deliberately tests the
//     "template not found" path instead, which still proves the flow
//     fires and Step 4 marks something, just not the full happy path.
//   - Flow 2 (built above): needs no operator-provided fixture at all
//     any more. 37_FlowInputBuilder.js moved the whole lookup chain into
//     code, so runFlow2Canary() provisions its own scratch doc and
//     scratch TeacherMatrix. The tradeoff is that it verifies the code
//     half only and stubs Studio out — see its own header.
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
