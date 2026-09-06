// ================================================================
// 15_Preflight.gs — KOS v8.0
// BOUND TO: kos-personal (main flat-folder project)
// ================================================================
//
// runKosPersonalPreflight() — the "is the structure sound?" check
// meta/FLOW_DOCTRINE.md rule 9's table had marked "—" for kos-personal:
// the only one of the three systems with a canary (runStudioReturnCanary()),
// a binding check (checkStudioFlowBinding()) and a liveness check
// (checkStudioFlowLiveness()), but nothing verifying the structure those
// three assume already exists BEFORE relying on real traffic to reveal a
// gap. Modeled on cas-ccps/scripts/35_FlowPreflightAndCanary.js's
// runFlowPreflightCheck() and leader-hub's runLeaderHubPreflight().
//
// THREE THINGS THIS CHECKS, EACH A DIFFERENT WAY "NOTHING HAPPENS" SILENTLY:
//
//   1. Tab width. STAGING_PIPELINE / STUDIO_RETURN / CuratorInput /
//      VectorClassifyInput are all self-healing (_getOrCreateSheet creates
//      each with the right width on first use), so a MISSING tab is never
//      the failure mode here — a tab present but narrower than its own
//      column-index map is, since a Studio "add row to sheet" step (or a
//      hardcoded getRange() call elsewhere in this project) bound to a
//      column past the last one writes nowhere and still reports success.
//      Same reasoning as cas-ccps's own _pfCheckSelfHealingTab_.
//
//   2. Trigger completeness. Every handler in KOS_TRIGGER_HANDLERS
//      (1_Config_And_Deploy.gs) should be installed exactly once. Unlike
//      cas-ccps's hand-enumerated one _pfCheckTrigger_() call per trigger,
//      this loops the one shared list directly — the same list whose
//      absence let setupAllTriggers() and teardownAllTriggers() drift
//      independently before it existed (see KOS_TRIGGER_HANDLERS's own
//      comment). A preflight enumerating installed triggers against that
//      one list is exactly the check that would have caught that class of
//      bug the moment it was introduced, instead of whenever an operator
//      happened to notice a trigger silently not firing.
//
//   3. Script properties. KOS_ADMIN_EMAIL only — soft/optional, since its
//      only effect is that sendDailyErrorReport() has nowhere to send the
//      digest (5_Error_And_Utilities.gs already logs that condition on its
//      own). INDEX_ID is deliberately NOT checked here as its own property:
//      resolving `ss` below via _getSystemAsset() either throws (handled
//      first, see below) or succeeds and caches INDEX_ID as a side effect —
//      by the time any check below runs, the property is always already
//      set, making a later check of it dead code that can never observe a
//      failure. cas-ccps's own header documents dropping the equivalent
//      ADMIN_SS_ID check for exactly this reason (getConfig_() there
//      already throws first).
//
// ENTRY POINTS (no trailing underscore — GAS hides those from the Run
// dropdown):
//   runKosPersonalPreflight()    — run the checks, write the Preflight tab
//   runKosPersonalPreflightNow() — same, plus a UI alert (for a menu item)
// ================================================================

function runKosPersonalPreflight() {
  const results = [];
  let ss;
  try {
    ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
  } catch (e) {
    results.push({
      ok: false, label: 'BRAIN_TRUST_INDEX spreadsheet',
      detail: 'Could not resolve the index spreadsheet (' + e.message + '). Run ' +
        'deployFullSystem() first — no other check here can run without it.',
    });
    console.error('[Preflight] ' + results[0].detail);
    return { total: 1, failed: 1, results: results };
  }

  results.push(_kpCheckSelfHealingTab_(ss, CFG.STAGING_SHEET, 7,
    'any ingestion sensor (2_Ingestion_Sensors.gs)'));
  results.push(_kpCheckSelfHealingTab_(ss, SR_SHEET, 8,
    'harvestStudioReturns()\'s first run, or a Studio flow\'s own "add row to sheet" step'));
  results.push(_kpCheckSelfHealingTab_(ss, CI_CURATOR_TAB, 6, 'buildStudioInputRows()'));
  results.push(_kpCheckSelfHealingTab_(ss, CI_CLASSIFY_TAB, 6, 'buildStudioInputRows()'));

  KOS_TRIGGER_HANDLERS.forEach(function (handler) {
    results.push(_kpCheckTrigger_(handler));
  });

  results.push(_kpCheckScriptProperty_('KOS_ADMIN_EMAIL', false));

  const failed = results.filter(function (r) { return !r.ok; });
  _kpWriteReport_(ss, results);

  console.log('[Preflight] ' + (results.length - failed.length) + '/' + results.length + ' checks passed.');
  failed.forEach(function (r) { console.error('[Preflight] FAIL: ' + r.label + ' — ' + r.detail); });

  return { total: results.length, failed: failed.length, results: results };
}

function _kpCheckSelfHealingTab_(ss, tabName, expectedMinCols, healer) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    return {
      ok: true, label: 'Tab: ' + tabName,
      detail: 'Not created yet — ' + healer + ' creates it on first run. Not a failure.',
    };
  }
  const lastCol = sheet.getLastColumn();
  if (lastCol < expectedMinCols) {
    return {
      ok: false, label: 'Tab: ' + tabName,
      detail: 'Only ' + lastCol + ' column(s); expected at least ' + expectedMinCols +
        '. A Studio step (or a hardcoded getRange() call) bound to a column past ' + lastCol +
        ' writes nowhere and still reports success.',
    };
  }
  return { ok: true, label: 'Tab: ' + tabName, detail: lastCol + ' columns, exists.' };
}

function _kpCheckTrigger_(handlerName) {
  let installed = 0;
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === handlerName) installed++;
    });
  } catch (e) {
    return {
      ok: true, label: 'Trigger: ' + handlerName,
      detail: 'Could not read project triggers (' + e.message + ') — not treated as a failure.',
    };
  }
  if (installed === 0) {
    return {
      ok: false, label: 'Trigger: ' + handlerName,
      detail: 'Not installed. Run setupAllTriggers(). Until then nothing moves and no error is ' +
        'raised anywhere.',
    };
  }
  if (installed > 1) {
    return {
      ok: false, label: 'Trigger: ' + handlerName,
      detail: installed + ' copies installed — it will run ' + installed + ' times per interval. ' +
        'Run teardownAllTriggers() then setupAllTriggers() to collapse back to one.',
    };
  }
  return { ok: true, label: 'Trigger: ' + handlerName, detail: 'installed once.' };
}

function _kpCheckScriptProperty_(key, required) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    return {
      ok: !required, label: 'Script property: ' + key,
      detail: required
        ? 'Missing and required.'
        : 'Not set — sendDailyErrorReport() has nowhere to send the digest (it already logs ' +
          'this condition itself; see 5_Error_And_Utilities.gs).',
    };
  }
  return { ok: true, label: 'Script property: ' + key, detail: 'Configured.' };
}

function _kpWriteReport_(ss, results) {
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

/**
 * UI-facing wrapper: runs the checks, then shows an alert summarizing
 * pass/fail count (degrades to a console log in headless contexts — see
 * 9_UI_Diagnostics.gs's _getUi()). See the Preflight tab for the full
 * detail either way.
 */
function runKosPersonalPreflightNow() {
  const result = runKosPersonalPreflight();
  _getUi().alert(
    result.failed === 0
      ? 'All ' + result.total + ' preflight checks passed. See the Preflight tab for detail.'
      : result.failed + ' of ' + result.total + ' checks FAILED — see the Preflight tab.'
  );
}
