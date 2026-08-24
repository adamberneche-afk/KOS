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
//
// SEVEN BRIDGES — the real sequestered council review (SMP-002)
// ─────────────────────────────────────────────────────────────
//  triggerSevenBridgesReview()  Assembles ONE shared stimulus document
//                        (reusing triggerCouncilSimulation()'s own
//                        doc-assembly logic) and hands it to the
//                        operator to paste into each of CFG.PERSONAS'
//                        separate Gemini Gem conversations — real
//                        sequestration comes from that product
//                        boundary, not from anything built here.
//  compileCouncilVerdict_()  Reads every COG_REGISTRY row sharing a
//                        council ID (written by submitCogVerdict() in
//                        2_Ingestion_Sensors.gs) and enforces the
//                        halt-execution rule (CFG.COG_HALT_THRESHOLD,
//                        1_Config_And_Deploy.gs — 3+ non-APPROVED
//                        verdicts halts). Called from the menu wrapper
//                        sevenBridgesReview() (9_UI_Diagnostics.gs),
//                        which SUPERSEDED that same function's old
//                        static "PENDING USER APPROVAL" stub.
//  triggerCouncilSimulation()  Explicitly SUPERSEDED by the above —
//                        one shared-context prompt asking the model
//                        to role-play all personas together, exactly
//                        the cross-contamination BRIDGE_FIDELITY_001
//                        forbids. Kept only for reference.
// ================================================================


// ================================================================
// TRIGGER INSTALLATION
// ================================================================

/**
 * Installs the onEdit installable trigger for onGovernanceEdit
 * on BRAIN_TRUST_INDEX. Safe to call multiple times — removes
 * the existing trigger before re-creating.
 *
 * NOTE: setupAllTriggers() in 1_Config_And_Deploy.gs now installs this
 * same trigger directly as part of its normal 10-trigger pass (see
 * reconciliation decision 1 — the trigger-count mismatch this function's
 * old docstring described is resolved). This standalone function is kept
 * for manual re-install from the Apps Script editor if the trigger is
 * ever orphaned without wanting to re-run all of setupAllTriggers().
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
// FIXED: DocumentApp's findText()/replaceText() both treat their string
// arguments as regular expressions — searchTag containing regex
// metacharacters (`.`, `(`, `)`, `$`, `\`, `+`, etc., all realistic in
// operator-typed Blackboard-sheet values) either failed to match text
// visibly present in the doc (surfacing as a confusing "Strict Match
// Failed" error), or a payload containing `$1`/`$&`-style sequences
// silently substituted the wrong text on replacement. Escapes the
// search side and, for the replacement side, avoids replaceText's
// regex-replacement-string path entirely — once findText locates the
// match, the substitution is done via deleteText/insertText on the
// exact matched range, making payload a true literal with no
// regex-replacement interpretation possible.
function _escapeRegexForFindText_(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyMutation(docId, searchTag, payload) {
  if (!docId || !searchTag) {
    throw new Error('applyMutation: Missing docId or searchTag.');
  }
  const body = DocumentApp.openById(docId).getBody();
  const el   = body.findText(_escapeRegexForFindText_(searchTag));
  if (!el) {
    throw new Error(
      'Strict Match Failed: "' + searchTag + '" not found in doc ' + docId + '.'
    );
  }
  const textEl = el.getElement().asText();
  const start  = el.getStartOffset();
  const end    = el.getEndOffsetInclusive();
  textEl.deleteText(start, end);
  textEl.insertText(start, payload);
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
 * Headless version of generateCouncilInputPayload for the web app
 * Diagnostics tab. Generates a council stimulus doc from CURRENT_STATE
 * and PIVOTS_AND_LESSONS, routes it to RAW_EXHAUST for Studio pickup,
 * and returns a result object.
 *
 * The HITL version (with ui.alert confirmations and prompts) is in
 * 9_UI_Diagnostics.gs as generateCouncilInputPayload().
 *
 * SUPERSEDED (Say/Do Ledger kos-personal finding #1): this is the
 * shared-context shortcut the CHANGELOG already named as a known gap
 * against the real SMP-002 "Seven Bridges" design — it asks one Studio
 * flow to role-play as ARCHITECT/AUDITOR/MUSE together in a single pass,
 * which is exactly the cross-contamination BRIDGE_FIDELITY_001 forbids.
 * Left in place, unremoved, as a low-risk choice (no confirmed absence of
 * a second caller) rather than deleted outright — but the "Run full
 * council review" button in 8_WebApp_UI.html now calls
 * triggerSevenBridgesReview() (below) instead of this function. Use that
 * one for any new integration; this one is kept only for whatever else
 * may still call it directly.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .triggerCouncilSimulation()
 *
 * @returns {Object} { success, docName, docUrl, message }
 */
function triggerCouncilSimulation() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    // FIXED: was success:false, so the client's handleCouncil() rendered
    // ordinary lock contention as a red error — inconsistent with the
    // busy:true-on-success:true convention established for
    // archiveStagingPipeline()/runPromotionCheck() specifically so this
    // kind of routine, expected "try again in a moment" case doesn't look
    // like a failure.
    return { success: true, busy: true, message: 'System busy — try again in a moment.' };
  }
  try {
    _coldEngineGate('triggerCouncilSimulation', 'TIER_2');

    const props     = PropertiesService.getScriptProperties();
    const stateId   = props.getProperty('ID_CURRENT_STATE');
    const pivotId   = props.getProperty('ID_PIVOTS_AND_LESSONS');
    const exhaustId = props.getProperty('ID_00_RAW_EXHAUST');

    if (!stateId || !pivotId || !exhaustId) {
      throw new Error('Core pointers missing (CURRENT_STATE, PIVOTS, RAW_EXHAUST). Run deployFullSystem().');
    }

    // Guard: only generate if CURRENT_STATE has been updated since last run
    const stateFile   = DriveApp.getFileById(stateId);
    const lastRunMs   = parseInt(props.getProperty('COUNCIL_LAST_RUN') || '0', 10);
    if (stateFile.getLastUpdated().getTime() <= lastRunMs) {
      // FIXED: was success:false — "nothing has changed since last time" is
      // a routine no-op, not a failure, but the client had no way to tell
      // it apart from a real error and painted it red. noop:true lets the
      // client render this neutrally, same reasoning as busy:true above.
      return {
        success: true,
        noop: true,
        message: 'No new data in CURRENT_STATE since last council run. Update the state doc first.',
      };
    }

    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();
    const ts        = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    const docName = 'CE: COUNCIL_PAYLOAD_' + ts;
    const doc     = DocumentApp.create(docName);
    const dId     = doc.getId();
    const body    = doc.getBody();

    body.appendParagraph('[🧠 RTP COUNCIL INITIATION STUB]')
        .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('System State: ' + ts);
    body.appendParagraph('1. THE CONTEXT (Recent Session Summary)')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(_truncateWithMarker_(stateText, 8000));
    body.appendParagraph('2. THE LAWS (Active Constraints & Pivots)')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(_truncateWithMarker_(pivotText, 4000));
    body.appendParagraph('3. INFERENCE INSTRUCTIONS')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(
      'Act as ARCHITECT, AUDITOR, and MUSE independently. Evaluate Context against Laws. ' +
      'Respond with: [🏗 ARCHITECT FLAG], [⚖️ AUDITOR FLAG], [✨ MUSE FLAG]. ' +
      'Format output as KOS inference JSON.'
    ).setBold(true);

    doc.saveAndClose();
    DriveApp.getFileById(dId).moveTo(DriveApp.getFolderById(exhaustId));

    const docUrl = DriveApp.getFileById(dId).getUrl();
    props.setProperty('COUNCIL_LAST_RUN', new Date().getTime().toString());

    console.log('[triggerCouncilSimulation] Council payload created: ' + docName);
    return {
      success: true,
      docName,
      docUrl,
      message: 'Council payload routed to RAW_EXHAUST for Studio pickup.',
    };

  } catch (e) {
    _reportError('triggerCouncilSimulation', e, null);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}


// ================================================================
// SEVEN BRIDGES — REAL SEQUESTERED-REVIEW EXECUTION LAYER
// (SMP-002 — Say/Do Ledger kos-personal finding #1)
// ================================================================

/**
 * Headless web app entry point for the real Seven Bridges design.
 * Generates ONE shared stimulus document from CURRENT_STATE and
 * PIVOTS_AND_LESSONS — the same document every cog reviews — and routes
 * it to RAW_EXHAUST. Reuses triggerCouncilSimulation()'s doc-assembly
 * shape (same two source docs, same guard against re-generating when
 * nothing has changed) but with its own "last run" property, so this
 * flow and the older shared-context one (still callable directly, see
 * that function's doc comment) don't stomp on each other's guard state.
 *
 * Sequestration itself is NOT this function's job — it comes entirely
 * from the operator sending this one document to N separate Gemini Gem
 * conversations (one cog per conversation, per BRIDGE_FIDELITY_001: "a
 * verdict produced with knowledge of another cog's verdict is VOID").
 * This function's whole contribution is generating a fresh, shared
 * council ID and handing back clear next-step instructions; each verdict
 * gets recorded afterward via submitCogVerdict() (2_Ingestion_Sensors.gs).
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .triggerSevenBridgesReview()
 *
 * @returns {Object} { success, docName, docUrl, councilId, message }
 */
function triggerSevenBridgesReview() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: true, busy: true, message: 'System busy — try again in a moment.' };
  }
  try {
    _coldEngineGate('triggerSevenBridgesReview', 'TIER_2');

    const props     = PropertiesService.getScriptProperties();
    const stateId   = props.getProperty('ID_CURRENT_STATE');
    const pivotId   = props.getProperty('ID_PIVOTS_AND_LESSONS');
    const exhaustId = props.getProperty('ID_00_RAW_EXHAUST');

    if (!stateId || !pivotId || !exhaustId) {
      throw new Error('Core pointers missing (CURRENT_STATE, PIVOTS, RAW_EXHAUST). Run deployFullSystem().');
    }

    // Own guard property — SEVEN_BRIDGES_LAST_RUN, distinct from
    // triggerCouncilSimulation()'s COUNCIL_LAST_RUN — so running one flow
    // doesn't block the other from noticing the same CURRENT_STATE update.
    const stateFile = DriveApp.getFileById(stateId);
    const lastRunMs = parseInt(props.getProperty('SEVEN_BRIDGES_LAST_RUN') || '0', 10);
    if (stateFile.getLastUpdated().getTime() <= lastRunMs) {
      return {
        success: true,
        noop: true,
        message: 'No new data in CURRENT_STATE since the last Seven Bridges review. Update the state doc first.',
      };
    }

    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();
    const ts        = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const councilId = 'SB_' + new Date().getTime();

    const docName = 'CE: SEVEN_BRIDGES_STIMULUS_' + councilId;
    const doc     = DocumentApp.create(docName);
    const dId     = doc.getId();
    const body    = doc.getBody();

    body.appendParagraph('[🌉 SMP-002: SEVEN BRIDGES STIMULUS]')
        .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Council ID: ' + councilId);
    body.appendParagraph('Generated: ' + ts);
    body.appendParagraph('1. THE CONTEXT (Recent Session Summary)')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(_truncateWithMarker_(stateText, 8000));
    body.appendParagraph('2. THE LAWS (Active Constraints & Pivots)')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(_truncateWithMarker_(pivotText, 4000));
    body.appendParagraph('3. REVIEW INSTRUCTIONS — READ BEFORE SENDING')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(
      'BRIDGE_FIDELITY_001: A verdict produced with knowledge of another ' +
      "cog's verdict is VOID. Send this exact document to EACH cog " +
      'independently — a fresh, separate Gemini Gem conversation per cog, ' +
      'with no shared context between them. Do not paste more than one ' +
      "cog's response into the same conversation, and do not summarize " +
      'one verdict into another cog\'s prompt.'
    ).setBold(true);
    body.appendParagraph(
      'For each cog, ask it to review the Context against the Laws above ' +
      'and respond with a verdict: APPROVED, FLAG, or VETO, plus a short ' +
      'rationale. Then record that verdict via the web app\'s Ingest tab → ' +
      'Cog Verdict, using Council ID ' + councilId + ' for every submission ' +
      'from this review. 3 or more non-APPROVED verdicts halts execution.'
    );

    doc.saveAndClose();
    DriveApp.getFileById(dId).moveTo(DriveApp.getFolderById(exhaustId));

    const docUrl = DriveApp.getFileById(dId).getUrl();
    props.setProperty('SEVEN_BRIDGES_LAST_RUN', new Date().getTime().toString());

    console.log('[triggerSevenBridgesReview] Stimulus created: ' + docName + ' (council ' + councilId + ')');
    return {
      success: true,
      docName,
      docUrl,
      councilId,
      message: 'Stimulus document ready. Send it to each cog independently, then log each verdict under Council ID ' + councilId + '.',
    };

  } catch (e) {
    _reportError('triggerSevenBridgesReview', e, null);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Groups COG_REGISTRY rows by council ID and evaluates the 3/7 halt rule:
 * 3 or more non-APPROVED verdicts (FLAG or VETO — any status string other
 * than APPROVED, matching the real documented Final_Status vocabulary)
 * halts execution. Deliberately NOT hardcoded to exactly 7 verdicts —
 * CFG.PERSONAS has 6 real entries today (see its own naming note), and a
 * partial council (fewer verdicts submitted so far) should still compile
 * to an honest in-progress read, not assume 7 are coming.
 *
 * Called from the menu wrapper below (9_UI_Diagnostics.gs's
 * sevenBridgesReview()) and available for any future caller that needs
 * a programmatic compiled result — e.g. a future auto-halt trigger.
 *
 * @param  {string} councilId  The shared council ID to compile.
 * @returns {Object} {
 *   success, councilId, verdicts: [{cog, status, summary, ts}],
 *   total, nonApprovedCount, halted, message
 * }
 */
function compileCouncilVerdict_(councilId) {
  try {
    const idStr = String(councilId || '').trim();
    if (!idStr) {
      return { success: false, message: 'Council ID is required.' };
    }

    const props   = PropertiesService.getScriptProperties();
    const indexId = props.getProperty('INDEX_ID');
    if (!indexId) {
      return { success: false, message: 'Core pointers missing. Run deployFullSystem().' };
    }

    const ss = SpreadsheetApp.openById(indexId);
    const cs = ss.getSheetByName(CFG.COG_REGISTRY_SHEET);
    const verdicts = [];

    if (cs && cs.getLastRow() > 1) {
      const rows = cs.getRange(2, 1, cs.getLastRow() - 1, 5).getValues();
      rows.forEach(r => {
        if (String(r[0]) === idStr) {
          verdicts.push({ cog: String(r[2] || ''), status: String(r[3] || ''), summary: String(r[4] || ''), ts: r[1] });
        }
      });
    }

    const nonApprovedCount = verdicts.filter(v => v.status !== 'APPROVED').length;
    const halted = nonApprovedCount >= CFG.COG_HALT_THRESHOLD;

    return {
      success: true,
      councilId: idStr,
      verdicts,
      total: verdicts.length,
      nonApprovedCount,
      halted,
      message: verdicts.length === 0
        ? 'No verdicts recorded yet for council ' + idStr + '.'
        : (halted
            ? 'HALTED: ' + nonApprovedCount + ' of ' + verdicts.length + ' verdicts are non-APPROVED (threshold ' + CFG.COG_HALT_THRESHOLD + ').'
            : verdicts.length + ' verdict(s) recorded, ' + nonApprovedCount + ' non-APPROVED — below the halt threshold.'),
    };

  } catch (e) {
    _reportError('compileCouncilVerdict_', e, null);
    return { success: false, message: e.message };
  }
}


// ================================================================
// DAILY PRIMER — TIME-DRIVEN + WEB APP ENTRY POINT
// ================================================================

/**
 * Assembles the current vector state, shadow matrix status, and the
 * operator's 90-day vision into a session-ready context document,
 * per README.md's "Architecture in Two Paragraphs" — "The daily primer
 * assembles current vector state, shadow matrix status, and the
 * operator's 90-day vision into a session-ready context document every
 * morning at 06:00." Documented in SCHEMA_REFERENCE.md's Key Drive
 * Documents table as `DAILY_PRIMER_YYYY-MM-DD` in 03.1_Current_State.
 *
 * Idempotent per day — re-running the same day overwrites that day's
 * primer rather than creating duplicates.
 *
 * Also maintains KOS_LATEST_PRIMER (_writeLatestPrimer_(), same folder) —
 * one fixed-name doc overwritten in place every run, alongside the dated
 * copy above. The dated copy is an audit trail (one snapshot per day,
 * kept forever); KOS_LATEST_PRIMER is the integration point for anything
 * external that watches a single Drive file for edits rather than a
 * folder for new files (e.g. a NotebookLM source, which only auto-syncs
 * an existing Drive-native file — a fresh dated file every morning would
 * never benefit from that).
 *
 * Called by the web app via:
 *   google.script.run.withSuccessHandler(fn).generateDailyPrimer()
 *
 * Fires: daily at 06:00 via time-driven trigger (setupAllTriggers).
 *
 * @returns {Object} { success, docName, docUrl, message }
 */
function generateDailyPrimer() {
  try {
    _coldEngineGate('generateDailyPrimer', 'TIER_1');

    const props     = PropertiesService.getScriptProperties();
    const folderId  = props.getProperty('ID_03_1_CURRENT_STATE');
    if (!folderId) {
      throw new Error('ID_03_1_CURRENT_STATE not set. Run deployFullSystem().');
    }
    const folder = DriveApp.getFolderById(folderId);

    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const docName = 'DAILY_PRIMER_' + dateStr;

    // Idempotent: remove today's primer if this already ran once today.
    const existing = folder.getFilesByName(docName);
    while (existing.hasNext()) existing.next().setTrashed(true);

    const vectorState = getVectorState();
    const shadowState = getShadowMatrixStatus();
    const vision       = props.getProperty(CFG.PROP.VISION_90_DAY) || 'Not defined';
    const onboardingDay = props.getProperty(CFG.PROP.ONBOARDING_DAY) || '0';

    const doc  = DocumentApp.create(docName);
    const dId  = doc.getId();
    _writePrimerBody_(doc.getBody(), dateStr, onboardingDay, vision, vectorState, shadowState);
    doc.saveAndClose();
    DriveApp.getFileById(dId).moveTo(folder);
    const docUrl = DriveApp.getFileById(dId).getUrl();

    _writeLatestPrimer_(folder, dateStr, onboardingDay, vision, vectorState, shadowState);

    console.log('[generateDailyPrimer] Created: ' + docName);
    return { success: true, docName, docUrl, message: 'Daily primer saved to 03.1_CURRENT_STATE.' };

  } catch (e) {
    _reportError('generateDailyPrimer', e, null);
    return { success: false, message: e.message };
  }
}

/**
 * Writes the primer's actual content into `body` — the one shared source
 * for both the dated archival doc and KOS_LATEST_PRIMER, so the two can
 * never drift out of sync with each other (the exact bug class a prior
 * audit found and fixed elsewhere in this repo — see
 * meta/CODEBASE_REVIEW.md — when the same content was hand-duplicated
 * instead of shared).
 */
function _writePrimerBody_(body, dateStr, onboardingDay, vision, vectorState, shadowState) {
  body.appendParagraph('DAILY PRIMER — ' + dateStr)
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Onboarding Day ' + onboardingDay + ' of ' + CFG.ONBOARDING_DAYS);

  body.appendParagraph('90-Day Vision').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(vision);

  body.appendParagraph('Vector State').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (vectorState.success && vectorState.vectors.length > 0) {
    vectorState.vectors.forEach(v =>
      body.appendListItem(v.name + ': ' + v.score.toFixed(2))
    );
  } else {
    body.appendParagraph('No sessions processed yet.');
  }

  body.appendParagraph('Shadow Matrix — Calibration Status')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (shadowState.success) {
    body.appendParagraph('Engine mode: ' + shadowState.engine_mode);
    shadowState.questions.forEach(q =>
      body.appendListItem(
        q.label + ': ' + q.status + ' (' + Math.round(q.confidence * 100) + '%)' +
        (q.inferred ? ' — ' + q.inferred : '')
      )
    );
  } else {
    body.appendParagraph('Shadow matrix unavailable.');
  }
}

/**
 * Maintains KOS_LATEST_PRIMER: one fixed-name doc in `folder`, overwritten
 * in place every run via CFG.PROP.LATEST_PRIMER_DOC_ID rather than found
 * by name — read-before-asking, same Contextual Gates philosophy cas-ccps
 * already uses elsewhere in this repo. Falls back to creating it fresh if
 * the stored ID is missing, stale, or points at a trashed file, so a
 * manually-deleted doc self-heals on the next run instead of silently
 * going stale.
 */
function _writeLatestPrimer_(folder, dateStr, onboardingDay, vision, vectorState, shadowState) {
  const props    = PropertiesService.getScriptProperties();
  const storedId = props.getProperty(CFG.PROP.LATEST_PRIMER_DOC_ID);
  let doc = null;

  if (storedId) {
    try {
      if (!DriveApp.getFileById(storedId).isTrashed()) {
        doc = DocumentApp.openById(storedId);
      }
    } catch (e) {
      doc = null; // stored ID stale/deleted — fall through to recreate
    }
  }

  const isNew = !doc;
  if (isNew) {
    doc = DocumentApp.create('KOS_LATEST_PRIMER');
  } else {
    doc.getBody().clear();
  }

  _writePrimerBody_(doc.getBody(), dateStr, onboardingDay, vision, vectorState, shadowState);
  doc.saveAndClose();

  if (isNew) {
    const newId = doc.getId();
    DriveApp.getFileById(newId).moveTo(folder);
    props.setProperty(CFG.PROP.LATEST_PRIMER_DOC_ID, newId);
  }
}


// ================================================================
// AUTO-COUNCIL CHECK — TIME-DRIVEN ENTRY POINT
// ================================================================

/**
 * Fires the sequestered/simulated council automatically once
 * CFG.COUNCIL_AUTO_TRIGGER_SESSIONS sessions have been processed since
 * the last council run, per README.md's documented auto-council trigger
 * (previously unbuilt — see reconciliation decision 1).
 *
 * Counts SESSION_LOG rows with a Timestamp after COUNCIL_LAST_RUN rather
 * than maintaining a separate counter, so it stays correct even if
 * COUNCIL_LAST_RUN was also just updated by a manual triggerCouncilSimulation()
 * run in the same window.
 *
 * Delegates to triggerCouncilSimulation() — that function's own stasis
 * guard (CURRENT_STATE must have changed since the last run) still
 * applies, so this can safely fire on every 2-hour tick without risking
 * a duplicate council run when there is nothing new to review.
 *
 * Fires: every 2 hours via time-driven trigger (setupAllTriggers).
 */
function autoCouncilCheck() {
  try {
    _coldEngineGate('autoCouncilCheck', 'TIER_1');

    const props      = PropertiesService.getScriptProperties();
    const lastRunMs  = parseInt(props.getProperty('COUNCIL_LAST_RUN') || '0', 10);
    const ss         = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const sessionLog = ss.getSheetByName(CFG.SESSION_LOG_SHEET);

    if (!sessionLog || sessionLog.getLastRow() <= 1) return;

    const timestamps = sessionLog
      .getRange(2, 2, sessionLog.getLastRow() - 1, 1)  // col B = Timestamp
      .getValues()
      .flat();

    const newSessions = timestamps.filter(ts => {
      const ms = new Date(ts).getTime();
      return !isNaN(ms) && ms > lastRunMs;
    }).length;

    if (newSessions < CFG.COUNCIL_AUTO_TRIGGER_SESSIONS) {
      console.log('[autoCouncilCheck] ' + newSessions + '/' + CFG.COUNCIL_AUTO_TRIGGER_SESSIONS + ' sessions — not yet due.');
      return;
    }

    console.log('[autoCouncilCheck] ' + newSessions + ' sessions since last run — firing council.');
    const result = triggerCouncilSimulation();
    if (!result.success) {
      console.log('[autoCouncilCheck] triggerCouncilSimulation declined: ' + result.message);
    }

  } catch (e) {
    _reportError('autoCouncilCheck', e, null);
  }
}


// ================================================================
// END 6_Governance.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 7_WebApp.gs + 8_WebApp_UI.html
// ================================================================
