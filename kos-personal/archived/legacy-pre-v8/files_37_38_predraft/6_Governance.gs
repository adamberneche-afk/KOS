// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 6 of 8: Governance Engine
// ================================================================
//
// Replaces: PART 10 (Governance Engine), PART 11 (Council
//           Simulator — headless version), and PART 12
//           (Sweepers) from KOS_MASTER_v3_1.gs.
//
// TRIGGER MAP
// ─────────────────────────────────────────────────────────────
//  onGovernanceEdit(e)    installable onEdit on BRAIN_TRUST_INDEX
//                         fires when Deploy_Trigger (col 12) in
//                         Blackboard is checked TRUE by operator.
//                         Uses e.source.toast() — safe in edit
//                         triggers. Never calls getUi().
//
//  runSemanticSweeper()   time-driven hourly. Scans Drive root for
//                         CE-tagged files and routes them to the
//                         correct folder via the tagMap.
//
//  sweepRootForExhaust()  time-driven hourly. Catches any CE: or
//                         KOS: docs that landed in Drive root and
//                         moves them to 03.4_RAW_EXHAUST.
//
// INSTALL
//   Call installGovernanceTrigger() once (or include it in
//   setupAllTriggers() in 1_Config_And_Deploy.gs) to register
//   the onEdit trigger on BRAIN_TRUST_INDEX.
//
//   setupAllTriggers() already installs runSemanticSweeper and
//   sweepRootForExhaust as hourly triggers.
//
// KEY CHANGES FROM v5.4
// ─────────────────────────────────────────────────────────────
// applyMutation()        BUG-05 canonical fix: ui.alert removed.
//                        Deploy_Trigger checkbox IS the operator
//                        confirmation. No lock needed — caller
//                        (onGovernanceEdit) runs in the edit
//                        event context, not a background trigger.
//
// runSemanticSweeper()   Fully headless: no ui.alert. Results
//                        logged to EXECUTION_LEDGER + console.
//                        BUG FIX: 'CE-CODE' key appeared twice
//                        in tagMap (line 1243 vs 1256 in v5.4);
//                        second definition silently won. Fixed
//                        by removing the first (wrong) entry
//                        that pointed to CFG.KNOWN_VECTORS array.
//
// sweepRootForExhaust()  Fully headless: no ui.alert. Logs to
//                        console only.
//
// generateCouncilInputPayload() Headless version retained here as
//                        triggerCouncilSimulation() for web app
//                        Diagnostics tab. HITL version with
//                        ui.alert stays in 9_UI_Diagnostics.gs.
// ================================================================


// ================================================================
// TRIGGER INSTALLATION
// ================================================================

/**
 * Installs the onEdit installable trigger for onGovernanceEdit
 * on BRAIN_TRUST_INDEX. Safe to call multiple times — removes
 * the existing trigger before re-creating.
 *
 * Add a call to this function inside setupAllTriggers() in
 * 1_Config_And_Deploy.gs for fully automated deployment:
 *
 *   tryInstall('onGovernanceEdit', () => {
 *     const indexId = props.getProperty('INDEX_ID');
 *     if (!indexId) throw new Error('INDEX_ID not set');
 *     ScriptApp.newTrigger('onGovernanceEdit')
 *       .forSpreadsheet(SpreadsheetApp.openById(indexId))
 *       .onEdit().create();
 *   });
 */
function installGovernanceTrigger() {
  try {
    ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === 'onGovernanceEdit')
      .forEach(t => ScriptApp.deleteTrigger(t));

    const indexId = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
    if (!indexId) throw new Error('INDEX_ID not set. Run deployFullSystem() first.');

    ScriptApp.newTrigger('onGovernanceEdit')
      .forSpreadsheet(SpreadsheetApp.openById(indexId))
      .onEdit()
      .create();

    console.log('[installGovernanceTrigger] onEdit trigger installed on BRAIN_TRUST_INDEX.');
  } catch (e) {
    _reportError('installGovernanceTrigger', e, null);
  }
}


// ================================================================
// GOVERNANCE TRIGGER HANDLER
// ================================================================

/**
 * Fires when any cell in BRAIN_TRUST_INDEX is edited.
 * Exits immediately unless the edit is in the Deploy_Trigger
 * column (col 12) of the Blackboard sheet and the value is TRUE.
 *
 * When triggered:
 *   1. Reads the full Blackboard row for mutation parameters.
 *   2. Runs runHardeningAudit on the payload (PIVOT 008).
 *   3. Calls applyMutation() on the target doc.
 *   4. If Alt_Doc_ID is set, applies mutation there too.
 *   5. Updates Status column to DEPLOYED or FAILED with details.
 *   6. Resets Deploy_Trigger to false (prevents re-fire).
 *   7. Toasts a brief result via e.source.toast() — safe in
 *      installable onEdit context without getUi().
 *
 * Blackboard column map (1-indexed):
 *   A(1) Target_Doc_ID  B(2) CE_Tag    C(3) Doc_Title
 *   D(4) Version        E(5) Find_Str  F(6) Replace_Payload
 *   G(7) Alt_Doc_ID     H(8) Notes     I(9) Filed_By
 *   J(10) Filed_Date    K(11) Status   L(12) Deploy_Trigger
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e  Edit event.
 */
function onGovernanceEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const row   = range.getRow();
  const col   = range.getColumn();

  // Only act on Deploy_Trigger (col 12) in Blackboard or CE-LOG sheets
  const isTarget = sheet.getName() === CFG.BLACKBOARD_SHEET ||
                   sheet.getName().indexOf('CE-LOG') !== -1;
  if (!isTarget || col !== 12 || range.getValue() !== true || row <= 1) return;

  // Read mutation parameters from the row (cols 1–11)
  const data       = sheet.getRange(row, 1, 1, 11).getValues()[0];
  const targetDocId = String(data[0] || '').trim();
  const altDocId    = String(data[6] || '').trim();
  const findStr     = String(data[4] || '').trim();  // col E = Find_String
  const payload     = String(data[5] || '').trim();  // col F = Replace_Payload
  const status_col  = 11;  // col K

  try {
    if (!targetDocId) throw new Error('Target_Doc_ID (col A) is blank.');
    if (!findStr)     throw new Error('Find_String (col E) is blank.');

    // PIVOT 008: run hardening audit on payload before any write
    runHardeningAudit(payload);

    // Primary mutation
    applyMutation(targetDocId, findStr, payload);

    // Optional secondary target (Alt_Doc_ID)
    if (altDocId) {
      try { applyMutation(altDocId, findStr, payload); }
      catch (altErr) {
        console.warn('[onGovernanceEdit] Alt_Doc_ID mutation failed: ' + altErr.message);
      }
    }

    // Mark row as deployed
    sheet.getRange(row, status_col).setValue('DEPLOYED: ' + new Date().toLocaleString());
    sheet.getRange(row, 12).setValue(false);  // reset trigger checkbox
    e.source.toast('Mutation deployed to ' + targetDocId, 'Governance Engine', 5);

  } catch (err) {
    sheet.getRange(row, status_col).setValue('FAILED: ' + err.message.substring(0, 100));
    sheet.getRange(row, 12).setValue(false);  // always reset, even on failure
    e.source.toast('Mutation failed — see Status column.', 'Governance Alert', 10);
    _reportError('onGovernanceEdit:row' + row, err, null);
  }
}


// ================================================================
// MUTATION ENGINE
// ================================================================

/**
 * Finds `searchTag` in the body of the Google Doc at `docId` and
 * replaces it with `payload`.
 *
 * BUG-05 FIX (canonical v8.0): ui.alert confirmation block
 * removed entirely. The Deploy_Trigger checkbox (col L = true)
 * in the Blackboard row is the operator's authorization signal.
 * onGovernanceEdit only calls this after verifying that checkbox.
 *
 * Throws on any failure — caller (onGovernanceEdit) catches and
 * writes the error to the Status column.
 *
 * @param  {string} docId      Google Drive file ID of target doc.
 * @param  {string} searchTag  Exact text string to find.
 * @param  {string} payload    Replacement string.
 * @returns {boolean}          true on success.
 * @throws  {Error}            If doc cannot be opened or tag not found.
 */
function applyMutation(docId, searchTag, payload) {
  if (!docId || !searchTag) {
    throw new Error('applyMutation: Missing docId or searchTag.');
  }
  const body = DocumentApp.openById(docId).getBody();
  const el   = body.findText(searchTag);
  if (!el) {
    throw new Error(
      'Strict Match Failed: "' + searchTag + '" not found in doc ' + docId + '.'
    );
  }
  el.getElement().asText().replaceText(searchTag, payload);
  console.log('[applyMutation] Deployed: "' + searchTag + '" → doc ' + docId);
  return true;
}


// ================================================================
// SEMANTIC SWEEPER — HOURLY TRIGGER
// ================================================================

/**
 * Scans Drive root for files with CE-tagged names and routes each
 * to the correct system folder based on the CE tag prefix.
 *
 * Skips files that have already been stamped with [UID_DOC_...].
 * Writes each routed file to the EXECUTION_LEDGER sheet.
 *
 * Fires: hourly via time-driven trigger (setupAllTriggers).
 *
 * BUG FIX from v5.4: 'CE-CODE' appeared twice in the tagMap —
 * once pointing to CFG.KNOWN_VECTORS (an array, not a folder ID)
 * and once pointing to ID_01_1_SCRIPTS. The array entry was
 * silently overwritten at runtime. Fixed by removing the duplicate.
 */
function runSemanticSweeper() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('[Sweeper] Could not acquire lock — another run is active. Skipping.');
    return;
  }
  try {
    const tagMap = _buildTagMap();
    const files  = DriveApp.getRootFolder().getFiles();

    // Open EXECUTION_LEDGER once for the whole sweep
    let ledger = null;
    try {
      const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
      ledger   = _getOrCreateSheet(ss, 'EXECUTION_LEDGER');
    } catch (_) {}

    let routed = 0, skipped = 0, noTag = 0, nullId = 0;
    const ledgerRows = [];

    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();

      // Skip already-processed files (UID stamp present)
      if (name.indexOf('[UID_DOC_') > -1) { skipped++; continue; }

      // Find matching CE tag prefix
      let matchedTag = null;
      let folderId   = null;

      for (const [tag, id] of Object.entries(tagMap)) {
        if (name.startsWith(tag + ':') || name.startsWith(tag + ' ')) {
          matchedTag = tag;
          folderId   = id;
          break;
        }
      }

      if (!matchedTag)                     { noTag++;  continue; }
      if (!folderId || Array.isArray(folderId)) { nullId++; continue; }

      try {
        const uid     = '[UID_DOC_' + new Date().getTime() + ']';
        const newName = uid + ' ' + name;
        file.setName(newName);
        file.moveTo(DriveApp.getFolderById(folderId));
        ledgerRows.push([uid, new Date(), matchedTag, file.getUrl(), 'ROUTED']);
        routed++;
      } catch (fileErr) {
        console.error('[Sweeper] Could not route "' + name + '": ' + fileErr.message);
      }
    }

    // Batch-write ledger entries
    if (ledger && ledgerRows.length > 0) {
      ledgerRows.forEach(r => ledger.appendRow(r));
      SpreadsheetApp.flush();
    }

    console.log(
      '[Sweeper] routed=' + routed +
      ' skipped=' + skipped +
      ' noTag='   + noTag   +
      ' nullId='  + nullId
    );

  } catch (e) {
    _reportError('runSemanticSweeper', e, null);
  } finally {
    lock.releaseLock();
  }
}


/**
 * Builds the CE-tag → folder-ID routing map used by runSemanticSweeper.
 * Reads all folder IDs from PropertiesService at call time.
 *
 * Extracting this into a helper keeps runSemanticSweeper readable
 * and makes the map testable in isolation.
 *
 * @returns {Object}  { 'CE-TAG': folderId, ... }
 */
function _buildTagMap() {
  const p = PropertiesService.getScriptProperties();
  return {
    'CE-CODE':     p.getProperty('ID_01_1_SCRIPTS'),           // v5.4 had this defined twice — fixed
    'CE-FLOW':     p.getProperty('ID_01_2_SOP_AND_FLOWS'),
    'CE-SMP':      p.getProperty('ID_01_3_SMP_PROPOSALS'),
    'CE-COG':      p.getProperty('ID_02_COUNCIL_ALIGNMENTS'),
    'CE-STATE':    p.getProperty('ID_03_DYNAMIC_STATE'),
    'CE-CURR':     p.getProperty('ID_03_1_CURRENT_STATE'),
    'CE-PIVOT':    p.getProperty('ID_03_2_PIVOTS'),
    'CE-PROC':     p.getProperty('ID_03_3_PROCESSED'),
    'CE-LOG':      p.getProperty('ID_04_COUNCIL_LOGS'),
    'CE-ARCH':     p.getProperty('ID_04_1_ARCHITECT'),
    'CE-AUD':      p.getProperty('ID_04_2_AUDITOR'),
    'CE-MUSE':     p.getProperty('ID_04_3_MUSE'),
    'CE-DEV':      p.getProperty('ID_04_4_DEVELOPER'),
    'CE-ALIGN':    p.getProperty('ID_04_5_ALIGNER'),
    'CE-CUR':      p.getProperty('ID_04_6_CURATOR'),
    'CE-RTP':      p.getProperty('ID_04_7_RTP'),
    'CE-GRAVE':    p.getProperty('ID_04_8_GRAVEYARD'),
    'CE-VECTOR':   p.getProperty('ID_05_VECTOR_REPOSITORY'),
    'CE-PRD':      p.getProperty('ID_06_1_LESSON_PLANS'),
    'CE-LESSON':   p.getProperty('ID_06_2_STUDENT_FACING'),
    'CE-RUBRIC':   p.getProperty('ID_06_3_ASSESSMENTS'),
    'CE-COMM':     p.getProperty('ID_06_4_COMMUNICATIONS'),
    'CE-VAULT':    p.getProperty('ID_07_MEMORY_VAULT'),
    'CE-AUTOPSY':  p.getProperty('ID_08_PROJECT_AUTOPSIES'),
    'CE-TEMPLATE': p.getProperty('ID_CCPS_MASTER_TEMPLATES'),
    // Catch-all: any CE: or KOS: prefixed doc routes to RAW_EXHAUST
    'CE':          p.getProperty('ID_00_RAW_EXHAUST'),
    'KOS':         p.getProperty('ID_00_RAW_EXHAUST'),
  };
}


// ================================================================
// EXHAUST SWEEPER — HOURLY TRIGGER
// ================================================================

/**
 * Catches CE: or KOS: prefixed Google Docs that landed in Drive root
 * and moves them to 03.4_RAW_EXHAUST with a UID timestamp prefix.
 *
 * This is a safety net for files created by external tools that
 * don't route directly to a KOS folder.
 *
 * Fires: hourly via time-driven trigger (setupAllTriggers).
 */
function sweepRootForExhaust() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const exId  = props.getProperty('ID_00_RAW_EXHAUST');
    if (!exId) {
      console.error('[sweepRootForExhaust] ID_00_RAW_EXHAUST not set. Run setupRoutingProperties().');
      return;
    }

    const exFolder = DriveApp.getFolderById(exId);
    const docs     = DriveApp.getRootFolder().getFilesByType(MimeType.GOOGLE_DOCS);
    let   count    = 0;

    while (docs.hasNext()) {
      const f    = docs.next();
      const name = f.getName();
      // Target: files starting with CE: or KOS: that haven't been UID-stamped
      if (name.indexOf('UID_') === -1 &&
          (name.startsWith('CE:') || name.startsWith('KOS:'))) {
        const uid     = '[UID_RAW_' + new Date().getTime() + ']';
        const newName = uid + ' ' + name;
        f.setName(newName);
        f.moveTo(exFolder);
        count++;
      }
    }

    if (count > 0) {
      console.log('[sweepRootForExhaust] Moved ' + count + ' CE:/KOS: doc(s) to RAW_EXHAUST.');
    }

  } catch (e) {
    _reportError('sweepRootForExhaust', e, null);
  } finally {
    lock.releaseLock();
  }
}


// ================================================================
// COUNCIL SIMULATION — HEADLESS WEB APP ENTRY POINT
// ================================================================

/**
 * Web app entry point for council simulation (Diagnostics tab).
 * Now routes to runSequesteredCouncil() for full SMP-002 compliance:
 * one stimulus doc per cog, processed independently by Studio.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .triggerCouncilSimulation()
 *
 * @returns {Object} { success, councilId?, queued?, docUrl?, message }
 */
function triggerCouncilSimulation() {
  // Route to the SMP-002 sequestered council implementation
  return runSequesteredCouncil();
}


// ================================================================
// AUTO COUNCIL — TIME-DRIVEN TRIGGER
// ================================================================

/**
 * Checks whether the auto-council threshold has been reached.
 * Fires every 2 hours (setupAllTriggers). If
 * CFG.COUNCIL_AUTO_TRIGGER_SESSIONS sessions have been processed
 * since the last council run, triggers a sequestered council.
 *
 * Uses SESSION_LOG to count sessions since COUNCIL_LAST_RUN.
 */
function autoCouncilCheck() {
  try {
    const props      = PropertiesService.getScriptProperties();
    const lastRunMs  = parseInt(props.getProperty('COUNCIL_LAST_RUN') || '0', 10);

    if (!lastRunMs) {
      console.log('[AutoCouncil] No prior run found. Waiting for first session batch.');
      return;
    }

    const ss         = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const logSheet   = ss.getSheetByName(CFG.SESSION_LOG_SHEET);
    if (!logSheet || logSheet.getLastRow() <= 1) return;

    const data       = logSheet.getRange(2, 2, logSheet.getLastRow() - 1, 1).getValues();
    const lastRunDate = new Date(lastRunMs);
    const sessionsSince = data.filter(r => r[0] && new Date(r[0]) > lastRunDate).length;

    console.log('[AutoCouncil] Sessions since last council: ' + sessionsSince +
                ' / ' + CFG.COUNCIL_AUTO_TRIGGER_SESSIONS);

    if (sessionsSince >= CFG.COUNCIL_AUTO_TRIGGER_SESSIONS) {
      console.log('[AutoCouncil] Threshold reached — firing sequestered council.');
      const result = runSequesteredCouncil();
      if (!result.success) {
        _reportError('autoCouncilCheck', new Error(result.message || 'Council failed'), null);
      }
    }
  } catch (e) {
    _reportError('autoCouncilCheck', e, null);
  }
}


// ================================================================
// SEQUESTERED COUNCIL — SMP-002 SEVEN BRIDGES PROTOCOL
// ================================================================

/**
 * Implements SMP-002: Seven Bridges Reconciliation Protocol.
 *
 * Instead of one combined stimulus doc (triggerCouncilSimulation),
 * this function creates ONE DOC PER COG so each persona receives
 * the stimulus independently. Studio processes each doc in
 * isolation — no cog sees another's verdict before forming its own.
 *
 * STATUS LIFECYCLE
 *   Each cog doc → STAGING_PIPELINE as Payload_Type: COG_STIMULUS
 *   Turnstile releases one at a time (respects concurrency limit).
 *   Studio sets FLOW_COMPLETE when verdict is ready.
 *   Queue processor routes each back through processIntakePayload.
 *
 * BRIDGE_FIDELITY_001
 *   A verdict produced with knowledge of another cog's verdict is VOID.
 *   Enforced by sequestered delivery and isolated Studio sessions.
 *
 * 3/7 TRIGGER (future reconciliation step)
 *   When all 7 verdicts are collected in COG_REGISTRY for councilId,
 *   runCouncilReconciliation() can check if 3+ are non-APPROVED
 *   and halt execution accordingly.
 *
 * Called by: autoCouncilCheck(), triggerCouncilSimulation() web button,
 *            direct from editor.
 *
 * @returns {Object} { success, councilId, queued[], message? }
 */
function runSequesteredCouncil() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, message: 'System busy.' };
  try {
    _coldEngineGate('runSequesteredCouncil', 'TIER_1');

    const props     = PropertiesService.getScriptProperties();
    const stateId   = props.getProperty('ID_CURRENT_STATE');
    const pivotId   = props.getProperty('ID_PIVOTS_AND_LESSONS');
    const exhaustId = props.getProperty('ID_00_RAW_EXHAUST');
    const cogAlignId = props.getProperty('ID_02_COUNCIL_ALIGNMENTS');

    if (!stateId || !pivotId || !exhaustId) {
      throw new Error('Core pointers missing. Run deployFullSystem().');
    }

    // Stasis guard: block if state hasn't changed since last council
    const stateFile   = DriveApp.getFileById(stateId);
    const lastRunMs   = parseInt(props.getProperty('COUNCIL_LAST_RUN') || '0', 10);
    if (lastRunMs && stateFile.getLastUpdated().getTime() <= lastRunMs) {
      return {
        success: false,
        message: 'No new data in CURRENT_STATE since last council. Update state first.',
      };
    }

    const stateText  = DocumentApp.openById(stateId).getBody().getText();
    const pivotText  = DocumentApp.openById(pivotId).getBody().getText();
    const ts         = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const councilId  = 'COUNCIL_' + new Date().getTime();
    const rawFolder  = DriveApp.getFolderById(exhaustId);
    const ss         = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging    = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const queued     = [];
    const errors     = [];

    CFG.COUNCIL_PERSONAS.forEach((personaName, idx) => {
      try {
        // Load persona doc text for the cog's context
        let personaText = '';
        if (cogAlignId) {
          try {
            const pFolder = DriveApp.getFolderById(cogAlignId);
            const pFiles  = pFolder.getFilesByName(personaName + '_V5');
            if (pFiles.hasNext()) {
              personaText = DocumentApp.openById(pFiles.next().getId())
                              .getBody().getText().substring(0, 2000);
            }
          } catch (_) {}
        }

        const stimulusContent = [
          '=== SEQUESTERED COUNCIL STIMULUS ===',
          'Council ID : ' + councilId,
          'Cog        : ' + personaName + ' (' + (idx + 1) + ' of ' + CFG.COUNCIL_PERSONAS.length + ')',
          'Timestamp  : ' + ts,
          '',
          '⚠ BRIDGE_FIDELITY_001: You are operating in sequestered mode.',
          '  You have NOT seen and MUST NOT reference any other cog\'s verdict.',
          '  Your verdict is void if derived from knowledge of another cog\'s output.',
          '====================================',
          '',
          personaText ? '─── YOUR PERSONA ───────────────────\n' + personaText + '\n' : '',
          '─── CONTEXT (CURRENT STATE) ────────',
          stateText.substring(0, CFG.MAX_CHUNK_SIZE),
          '',
          '─── LAWS (PIVOTS & LESSONS) ────────',
          pivotText.substring(0, Math.floor(CFG.MAX_CHUNK_SIZE / 2)),
          '',
          '─── INSTRUCTION ────────────────────',
          'Evaluate the context against the laws from your ' + personaName + ' perspective.',
          'Return your verdict as KOS inference JSON with cog_name: "' + personaName + '".',
          'Include final_status: APPROVED | FLAG | VETO in your cog_verdicts entry.',
        ].join('\n');

        const docName = '[COG_STIMULUS]_' + councilId + '_' + personaName;
        const doc     = DocumentApp.create(docName);
        const dId     = doc.getId();
        doc.getBody().setText(stimulusContent);
        doc.saveAndClose();
        DriveApp.getFileById(dId).moveTo(rawFolder);

        const uid    = councilId + '_' + personaName.replace('PERSONA_', '');
        const docUrl = DriveApp.getFileById(dId).getUrl();
        _queuePayload(uid, 'COG_STIMULUS', docUrl, dId, staging);
        queued.push(personaName);

      } catch (cogErr) {
        _reportError('runSequesteredCouncil:' + personaName, cogErr, null);
        errors.push(personaName);
      }
    });

    // Record council session metadata
    props.setProperty('COUNCIL_LAST_RUN',           new Date().getTime().toString());
    props.setProperty('COUNCIL_ACTIVE_ID',           councilId);
    props.setProperty('COUNCIL_EXPECTED_VERDICTS',   String(CFG.COUNCIL_PERSONAS.length));
    props.setProperty('COUNCIL_VERDICTS_RECEIVED',   '0');
    SpreadsheetApp.flush();

    console.log('[SequesteredCouncil] ' + queued.length + ' stimuli queued for ' + councilId);
    return { success: true, councilId, queued, errors };

  } catch (e) {
    _reportError('runSequesteredCouncil', e, null);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}


// ================================================================
// END 6_Governance.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 7_WebApp.gs + 8_WebApp_UI.html
// ================================================================
