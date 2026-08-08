# KOS v8.0 Sprint Patches
# Exact find-replace targets for the four files that need changes.
# Each patch is bounded by ── START FIND ── / ── REPLACE WITH ──.
# Apply in file order.

================================================================================
PATCH A-1  |  1_Config_And_Deploy.gs
           |  DELETE the duplicate resetProperties() function
================================================================================

── START FIND (delete this entire block) ──
/**
 * Clears routing pointer cache while preserving all calibration,
 * onboarding, and promoted vector data. Re-index Drive by running
 * setupRoutingProperties() after this.
 */
function resetProperties() {
  const props = PropertiesService.getScriptProperties();
  const keep  = {};
  [
    ...CFG.CALIBRATION_KEYS,
    'IDENTITY_KEY',
    'KOS_PROMOTED_VECTORS',      // v8.0 — vector promotion persistence
    ...Object.values(CFG.PROP),
    'KOS_OPERATOR_ROLE', 'KOS_OPERATOR_AUDIENCE', 'KOS_ADMIN_GHOST',
    'KOS_NECESSARY_STRUGGLE', 'KOS_RELATIONAL_TARGETS', 'KOS_VISION_90_DAY',
  ].forEach(k => { const v = props.getProperty(k); if (v) keep[k] = v; });
  props.deleteAllProperties();
  if (Object.keys(keep).length > 0) props.setProperties(keep);
  console.log('[resetProperties] Routing cache cleared. Calibration and promotion state preserved. Run setupRoutingProperties() to re-index.');
  return { kept: Object.keys(keep).length };
}
── END FIND ──

── REPLACE WITH ──
// resetProperties() is defined in 5_Error_And_Utilities.gs (canonical version).
// The copy that was here has been removed to prevent GAS duplicate-function errors.
── END REPLACE ──


================================================================================
PATCH A-2  |  1_Config_And_Deploy.gs
           |  Expand KOS_TRIGGERS array in setupAllTriggers()
================================================================================

── START FIND ──
  const KOS_TRIGGERS = [
    'sensor1_scanInboundSessions',
    'processInferenceQueue',
    'sendDailyErrorReport',
    'runSemanticSweeper',
    'sweepRootForExhaust',
    'sensor3_externalTelemetry',
  ];
── END FIND ──

── REPLACE WITH ──
  const KOS_TRIGGERS = [
    'sensor1_scanInboundSessions',
    'processInferenceQueue',
    'sendDailyErrorReport',
    'runSemanticSweeper',
    'sweepRootForExhaust',
    'sensor3_externalTelemetry',
    'runMatrixTurnstile',   // 10_KOS_Extensions — Turnstile flow controller
    'runHeartbeat',         // 10_KOS_Extensions — SMP-002 zone heartbeat
    'onGovernanceEdit',     // 6_Governance — Blackboard mutation trigger
  ];
── END REPLACE ──


================================================================================
PATCH A-3  |  1_Config_And_Deploy.gs
           |  Add Turnstile, Heartbeat, and governance triggers to the
           |  tryInstall block inside setupAllTriggers()
================================================================================

── START FIND ──
  // ── Sensor 3 — onChange on BRAIN_TRUST_INDEX ───────────────
  // The onChange trigger must bind to the spreadsheet object.
  // Requires INDEX_ID to be set — safe to call after property registration.
  tryInstall('sensor3_externalTelemetry', () => {
    const indexId = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (!indexId) throw new Error('INDEX_ID not set — run deployFullSystem first');
    ScriptApp.newTrigger('sensor3_externalTelemetry')
      .forSpreadsheet(SpreadsheetApp.openById(indexId))
      .onChange()
      .create();
  });
── END FIND ──

── REPLACE WITH ──
  // ── Sensor 3 — onChange on BRAIN_TRUST_INDEX ───────────────
  // The onChange trigger must bind to the spreadsheet object.
  // Requires INDEX_ID to be set — safe to call after property registration.
  tryInstall('sensor3_externalTelemetry', () => {
    const indexId = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (!indexId) throw new Error('INDEX_ID not set — run deployFullSystem first');
    ScriptApp.newTrigger('sensor3_externalTelemetry')
      .forSpreadsheet(SpreadsheetApp.openById(indexId))
      .onChange()
      .create();
  });

  // ── Governance trigger — onEdit on BRAIN_TRUST_INDEX ───────
  // Fires when Deploy_Trigger (col 12) is checked TRUE in Blackboard.
  // Must bind to the spreadsheet — requires INDEX_ID.
  tryInstall('onGovernanceEdit', () => {
    const indexId = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (!indexId) throw new Error('INDEX_ID not set — run deployFullSystem first');
    ScriptApp.newTrigger('onGovernanceEdit')
      .forSpreadsheet(SpreadsheetApp.openById(indexId))
      .onEdit()
      .create();
  });

  // ── Turnstile — every 5 min ────────────────────────────────
  // Releases exactly one PENDING_FLOW row → IN_PROCESS per run.
  // Studio polls for IN_PROCESS rows to begin inference.
  tryInstall('runMatrixTurnstile', () =>
    ScriptApp.newTrigger('runMatrixTurnstile')
      .timeBased().everyMinutes(5).create()
  );

  // ── Heartbeat — daily 07:00 ────────────────────────────────
  // SMP-002 zone folder integrity check + 14-day staleness check
  // on Planning Buffer. Reports via ERROR_LOG / daily digest.
  tryInstall('runHeartbeat', () =>
    ScriptApp.newTrigger('runHeartbeat')
      .timeBased().atHour(7).everyDays(1).create()
  );
── END REPLACE ──


================================================================================
PATCH A-4  |  1_Config_And_Deploy.gs
           |  Add initializeKOS() and persona placeholder scaffolding to
           |  deployFullSystem()
================================================================================

── START FIND ──
    // ── 1. Folder Tree ─────────────────────────────────────────
    emit('Building folder tree…');
    const folders = _buildFolderTree();
    emit('✔ Folder tree ready (' + Object.keys(folders).length + ' folders)');
── END FIND ──

── REPLACE WITH ──
    // ── 1. Folder Tree ─────────────────────────────────────────
    emit('Building folder tree…');
    const folders = _buildFolderTree();
    emit('✔ Folder tree ready (' + Object.keys(folders).length + ' folders)');

    // ── 1.5. SMP-002 Zone Provisioning ─────────────────────────
    // Provisions 00_ACTIVE_STATE, 01_PLANNING_BUFFER, 90_CE-VAULT,
    // and 95_CE-SCRAP. Idempotent — verifies existing folders.
    emit('Provisioning SMP-002 zone folders…');
    try {
      const zr = initializeKOS();
      zr.provisioned.forEach(n => emit('  ✔ Provisioned: ' + n));
      zr.verified.forEach(n   => emit('  ↷ Verified: '   + n));
      zr.warnings.forEach(w   => emit('  ⚠ ' + w));
    } catch (e) { fail('initializeKOS', e); }
── END REPLACE ──


================================================================================
PATCH A-5  |  1_Config_And_Deploy.gs
           |  Add persona placeholder scaffolding inside _copyPersonas()
================================================================================

── START FIND ──
      const sourceFile = _findHighestVersionDoc(baseName);
      if (!sourceFile) { log.push('  ⚠ ' + baseName + ': Not found in Drive — skipped'); return; }
── END FIND ──

── REPLACE WITH ──
      const sourceFile = _findHighestVersionDoc(baseName);
      if (!sourceFile) {
        // Scaffold a placeholder so the engine has a doc to open
        // even before the real persona is added to Drive.
        const placeholderName = baseName + '_PLACEHOLDER';
        if (!f02.getFilesByName(placeholderName).hasNext()) {
          _scaffoldDoc(placeholderName, f02, [
            { h1: baseName },
            { h2: 'STATUS: PLACEHOLDER — Replace with the real persona document' },
            { p:  'This placeholder was created by deployFullSystem() because the source ' +
                  'persona document was not found in Drive. ' +
                  'Add the real persona to Drive and re-run deployFullSystem() to replace it.' },
            { h2: 'Persona Identity' },
            { p:  '[Define persona role and mandate here]' },
            { h2: 'Core Directives' },
            { p:  '[List the 3–5 core operating rules for this persona]' },
            { h2: 'Voice & Tone' },
            { p:  '[How does this persona communicate? What register and pace?]' },
            { h2: 'HITL Firewall Rules' },
            { p:  '[What will this persona never do without operator approval?]' },
          ]);
        }
        log.push('  ↷ ' + baseName + ': Not found in Drive — placeholder scaffolded');
        return;
      }
── END REPLACE ──


================================================================================
PATCH A-6  |  1_Config_And_Deploy.gs  (teardownAllTriggers)
           |  Add new trigger names to teardown list
================================================================================

── START FIND ──
  const KOS_TRIGGERS = [
    'sensor1_scanInboundSessions', 'processInferenceQueue',
    'sendDailyErrorReport', 'runSemanticSweeper',
    'sweepRootForExhaust', 'sensor3_externalTelemetry',
    'onGovernanceEdit',  // governance trigger
  ];
── END FIND ──

── REPLACE WITH ──
  const KOS_TRIGGERS = [
    'sensor1_scanInboundSessions', 'processInferenceQueue',
    'sendDailyErrorReport', 'runSemanticSweeper',
    'sweepRootForExhaust', 'sensor3_externalTelemetry',
    'onGovernanceEdit',     // 6_Governance — Blackboard mutation trigger
    'runMatrixTurnstile',   // 10_KOS_Extensions — Turnstile
    'runHeartbeat',         // 10_KOS_Extensions — SMP-002 Heartbeat
  ];
── END REPLACE ──


================================================================================
PATCH B-1  |  3_Queue_Processor.gs
           |  Hook processJsonDrip() into processIntakePayload(),
           |  scanning the raw inference payload doc before returning
================================================================================

── START FIND ──
    // ── VECTOR ROUTER ────────────────────────────────────────────
    // BUG-01 FIX: call _routeVectorWeightsInternal directly
    // (not routeVectorWeights) since this function holds the lock.
    const vr = _routeVectorWeightsInternal(pd, uid, ts);

    return { status: 'SUCCESS', uid, vectorRouting: vr };
── END FIND ──

── REPLACE WITH ──
    // ── VECTOR ROUTER ────────────────────────────────────────────
    // BUG-01 FIX: call _routeVectorWeightsInternal directly
    // (not routeVectorWeights) since this function holds the lock.
    const vr = _routeVectorWeightsInternal(pd, uid, ts);

    // ── JSON DRIP EXTRACTOR ──────────────────────────────────────
    // Scans the raw inference doc for a [KOS_DATA_DRIP] payload and
    // routes mirror updates + vector nominations. Non-fatal — a
    // missing or malformed drip block does not fail the intake.
    // Drip is extracted from the inference payload doc (rawJSONPayload
    // was already parsed, so we reconstruct from pd for the scan).
    // In practice, Studio appends the drip block to the end of the
    // doc body, after the JSON. We re-open the doc to get the full text.
    try {
      const stateProps  = PropertiesService.getScriptProperties();
      const payloadFile = stateProps.getProperty('_CURRENT_INTAKE_FILE_ID');
      if (payloadFile) {
        const fullText = DocumentApp.openById(payloadFile).getBody().getText();
        processJsonDrip(fullText, uid);
      }
    } catch (_) {}   // drip is best-effort — never blocks intake

    return { status: 'SUCCESS', uid, vectorRouting: vr };
── END REPLACE ──

# NOTE: To make `_CURRENT_INTAKE_FILE_ID` available, add one line in
# processInferenceQueue(), just before the processIntakePayload call:
#
#   PropertiesService.getScriptProperties()
#     .setProperty('_CURRENT_INTAKE_FILE_ID', fileId);
#   const result = processIntakePayload(JSON.stringify(parsed));
#   PropertiesService.getScriptProperties()
#     .deleteProperty('_CURRENT_INTAKE_FILE_ID');
#
# This is a simple thread-local pass-through. Since processIntakePayload
# holds the script lock, no other invocation can overwrite this property
# during the same intake execution.

── FIND (in processInferenceQueue) ──
        // ── Intake ──────────────────────────────────────────────
        const result = processIntakePayload(JSON.stringify(parsed));
── END FIND ──

── REPLACE WITH ──
        // ── Intake ──────────────────────────────────────────────
        // Pass the file ID through script properties so processIntakePayload
        // can access the raw doc for JSON Drip scanning. The script lock
        // guarantees no concurrent intake can overwrite this.
        PropertiesService.getScriptProperties()
          .setProperty('_CURRENT_INTAKE_FILE_ID', fileId);
        const result = processIntakePayload(JSON.stringify(parsed));
        PropertiesService.getScriptProperties()
          .deleteProperty('_CURRENT_INTAKE_FILE_ID');
── END REPLACE ──


================================================================================
PATCH C-1  |  7_WebApp.gs
           |  Update the callable functions comment block
================================================================================

── START FIND ──
//   Diagnostics tab:
//     getVectorState()                → 4_Vector_Router.gs
//     runPromotionCheck()             → 4_Vector_Router.gs
//     sendDailyErrorReport()          → 5_Error_And_Utilities.gs
//     archiveStagingPipeline()        → 5_Error_And_Utilities.gs
//     triggerCouncilSimulation()      → 6_Governance.gs
//     deployFullSystem()              → 1_Config_And_Deploy.gs
── END FIND ──

── REPLACE WITH ──
//   Diagnostics tab:
//     getVectorState()                → 4_Vector_Router.gs
//     runPromotionCheck()             → 4_Vector_Router.gs
//     sendDailyErrorReport()          → 5_Error_And_Utilities.gs
//     archiveStagingPipeline()        → 5_Error_And_Utilities.gs
//     triggerCouncilSimulation()      → 6_Governance.gs
//     deployFullSystem()              → 1_Config_And_Deploy.gs
//     getMirrorMatrixStatus()         → 10_KOS_Extensions.gs
//     verifyMirrorVariable(key, val)  → 10_KOS_Extensions.gs
//     initializeKOSFromUI()           → 10_KOS_Extensions.gs
//     getZoneHealth()                 → 10_KOS_Extensions.gs
── END REPLACE ──
