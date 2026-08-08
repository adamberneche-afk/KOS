// ============================================================================
// KOS MASTER SCRIPT v8.0 — PART C of 4
// Paste immediately below Part B.
// ============================================================================


// ============================================================================
// SECTION 17: GOVERNANCE ENGINE — HITL CI/CD PIPELINE
// Uses installable trigger (setupGovernanceTrigger) — doc-bound script
// cannot fire simple onEdit on a different spreadsheet.
// ============================================================================

function setupGovernanceTrigger() {
  const ui = DocumentApp.getUi();
  try {
    ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === 'onGovernanceEdit')
      .forEach(t => ScriptApp.deleteTrigger(t));
    const ss = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    ScriptApp.newTrigger('onGovernanceEdit').forSpreadsheet(ss).onEdit().create();
    ui.alert('✅ Governance Trigger Installed',
      'onGovernanceEdit() is now listening to BRAIN_TRUST_INDEX.\n\n' +
      'Check the Deploy_Trigger checkbox (Column L) in the Blackboard sheet to approve a mutation.',
      ui.ButtonSet.OK);
  } catch (e) { _reportError('setupGovernanceTrigger', e, ui); }
}

/**
 * Governance Engine onEdit handler — fires when Column L checkbox is checked
 * in the Blackboard sheet. Reads execution packet, routes by mutation type,
 * writes status to Column K, resets checkbox.
 *
 * Blackboard schema (1-indexed):
 *   A: Target_Doc_ID  B: CE_Tag  C: Doc_Title  D: Version  E: Find_String
 *   F: Replace_Payload  G: Alt_Doc_ID  H: Notes  I: Filed_By  J: Filed_Date
 *   K: Status  L: Deploy_Trigger (checkbox)
 */
function onGovernanceEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.source.getActiveSheet();
  const row   = e.range.getRow();
  const col   = e.range.getColumn();

  const isTarget = (sheet.getName() === CFG.BLACKBOARD_SHEET ||
                    sheet.getName().indexOf('CE-LOG') !== -1);
  if (!isTarget || col !== 12 || e.range.getValue() !== true || row <= 1) return;

  try {
    const data    = sheet.getRange(row, 1, 1, 11).getValues()[0];
    const docId   = data[0] || data[6];
    const findStr = data[4];
    const payload = data[5];

    runHardeningAudit(payload);

    const success = (!findStr || !findStr.toString().trim())
      ? _handleAppendBottom(docId, payload)
      : applyMutation(docId, findStr, payload);

    if (success) {
      sheet.getRange(row, 11).setValue('DEPLOYED: ' + new Date().toLocaleString());
      sheet.getRange(row, 12).setValue(false);
      e.source.toast('Mutation Deployed.', 'Governance Engine', 5);
    }
  } catch (err) {
    sheet.getRange(row, 11).setValue('FAILED: ' + err.message);
    sheet.getRange(row, 12).setValue(false);
    e.source.toast('Mutation Failed. Check Status column.', 'System Alert', 10);
  }
}

function applyMutation(docId, searchTag, payload) {
  if (!docId || !searchTag) throw new Error('Missing Document ID or Search Tag.');
  const body  = DocumentApp.openById(docId).getBody();
  const found = body.findText(searchTag);
  if (!found) throw new Error(`Strict Match Failed: "${searchTag}" not found. Verify before retrying.`);
  found.getElement().asText().replaceText(searchTag, payload);
  return true;
}

function _handleAppendBottom(docId, payload) {
  if (!docId) throw new Error('APPEND_BOTTOM: Missing Document ID.');
  DocumentApp.openById(docId).getBody().appendParagraph(
    `\n[Appended: ${new Date().toLocaleString()}]\n` + payload
  );
  return true;
}


// ============================================================================
// SECTION 18: COUNCIL SIMULATOR — DIFFERENTIAL READ PAYLOAD GENERATOR
// ============================================================================

function generateCouncilInputPayload() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    ui.alert('System Busy', 'Could not acquire lock. Try again.', ui.ButtonSet.OK); return;
  }
  try {
    const props          = PropertiesService.getScriptProperties();
    const stateId        = props.getProperty('ID_CURRENT_STATE');
    const pivotId        = props.getProperty('ID_PIVOTS_AND_LESSONS');
    const exhaustFolderId = props.getProperty('ID_00_RAW_EXHAUST');

    if (!stateId || !pivotId || !exhaustFolderId) {
      throw new Error('Core pointers missing. Run Deploy or Setup Routing Properties.');
    }

    const stateFile   = DriveApp.getFileById(stateId);
    const lastRunTime = parseInt(props.getProperty('COUNCIL_LAST_RUN') || '0', 10);
    if (stateFile.getLastUpdated().getTime() <= lastRunTime) {
      ui.alert('System Stasis', 'No new exhaust. CURRENT_STATE unchanged. Council sleeping.', ui.ButtonSet.OK);
      return;
    }

    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const docName   = 'CE: COUNCIL_PAYLOAD_' + timestamp;

    const payloadDoc = DocumentApp.create(docName);
    const body       = payloadDoc.getBody();
    body.appendParagraph('[🧠 RTP COUNCIL INITIATION STUB]').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`System State: ${timestamp}\n`);
    body.appendParagraph('1. THE CONTEXT').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(stateText + '\n');
    body.appendParagraph('2. THE LAWS').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(pivotText + '\n');
    body.appendParagraph('3. INFERENCE INSTRUCTIONS FOR WORKSPACE STUDIO').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(
      'Using the attached Persona files, act as the Architect, Auditor, and Muse. ' +
      'Output using: [🏗 ARCHITECT FLAG], [⚖️ AUDITOR FLAG], [✨ MUSE FLAG].'
    ).setBold(true);
    payloadDoc.saveAndClose();
    DriveApp.getFileById(payloadDoc.getId()).moveTo(DriveApp.getFolderById(exhaustFolderId));
    props.setProperty('COUNCIL_LAST_RUN', new Date().getTime().toString());

    ui.alert('✅ Council Payload Generated', `Doc: ${docName}\nRouted to 03.4_RAW_EXHAUST.`, ui.ButtonSet.OK);
  } catch (e) { _reportError('generateCouncilInputPayload', e, ui); }
  finally      { lock.releaseLock(); }
}


// ============================================================================
// SECTION 19: SWEEPERS
// ============================================================================

function runSemanticSweeper() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    ui.alert('Sweeper Busy', 'Already running. Try again.', ui.ButtonSet.OK); return;
  }
  try {
    const props  = PropertiesService.getScriptProperties();
    const files  = DriveApp.getRootFolder().searchFiles(CFG.SWEEPER_QUERY);
    const ss     = _getBrainTrustIndex();
    const ledger = _getOrCreateSheet(ss, CFG.EXECUTION_LEDGER_SHEET);
    let   processed = 0, skipped = 0, nullPtr = 0;

    while (files.hasNext()) {
      const file = files.next(), fileName = file.getName();
      let matchedTag = null, propKey = null;
      for (const [tag, key] of Object.entries(CFG.TAG_TO_PROP_KEY)) {
        if (fileName.startsWith(tag + ':') || fileName.startsWith(tag + ' ')) {
          matchedTag = tag; propKey = key; break;
        }
      }
      if (!matchedTag) { skipped++; continue; }
      const folderId = props.getProperty(propKey);
      if (!folderId) { nullPtr++; console.warn(`[Sweeper] Null pointer for "${matchedTag}"`); continue; }
      const uid     = '[UID_DOC_' + new Date().getTime() + ']';
      const newName = `${uid} ${fileName}`;
      file.setName(newName);
      file.moveTo(DriveApp.getFolderById(folderId));
      const fileUrl = _getSafeFileUrl(file, file.getId());
      ledger.appendRow([uid, new Date(), matchedTag, '', 'ROUTED']);
      _writeSmartChip(ledger, ledger.getLastRow(), 4, newName, fileUrl);
      processed++;
      SpreadsheetApp.flush();
    }
    ui.alert('✅ Semantic Sweep Complete',
      `Routed: ${processed}\nNo CE-tag: ${skipped}\nNull pointer: ${nullPtr}`,
      ui.ButtonSet.OK);
  } catch (e) { _reportError('runSemanticSweeper', e, ui); }
  finally      { lock.releaseLock(); }
}

function sweepRootForExhaust() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const folderId = PropertiesService.getScriptProperties().getProperty('ID_00_RAW_EXHAUST');
    if (!folderId) throw new Error('ID_00_RAW_EXHAUST missing. Run Setup Routing Properties.');
    const folder = DriveApp.getFolderById(folderId);
    const docs   = DriveApp.getRootFolder().getFilesByType(MimeType.GOOGLE_DOCS);
    let   count  = 0;
    while (docs.hasNext()) {
      const f = docs.next(), name = f.getName();
      if (name.indexOf('UID_') === -1 && name.indexOf('CE:') !== -1) {
        f.setName(`[UID_RAW_${new Date().getTime()}] ${name}`);
        f.moveTo(folder);
        count++;
        SpreadsheetApp.flush();
      }
    }
    ui.alert('✅ Exhaust Sweep', count > 0 ? `Swept ${count} CE: doc(s).` : 'No CE: docs found.', ui.ButtonSet.OK);
  } catch (e) { _reportError('sweepRootForExhaust', e, ui); }
  finally      { lock.releaseLock(); }
}

function setupRoutingProperties() {
  const ui    = DocumentApp.getUi();
  const props = PropertiesService.getScriptProperties();

  function fetchId(name, isFolder) {
    const iter = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
    if (iter.hasNext()) return iter.next().getId();
    console.error(`⚠️ NOT FOUND: [${name}]`); return null;
  }

  const map = {
    'ID_01_1_SCRIPTS'          : fetchId('01.1_SCRIPTS',             true),
    'ID_01_2_SOP_AND_FLOWS'    : fetchId('01.2_SOP_AND_FLOWS',       true),
    'ID_01_3_SMP_PROPOSALS'    : fetchId('01.3_SMP_PROPOSALS',       true),
    'ID_02_COUNCIL_ALIGNMENTS' : fetchId('02_Council_Alignments',    true),
    'ID_03_DYNAMIC_STATE'      : fetchId('03_Dynamic_State',         true),
    'ID_00_RAW_EXHAUST'        : fetchId('03.4_RAW_EXHAUST',         true),
    'ID_03_3_PROCESSED'        : fetchId('03.3_PROCESSED_EXHAUST',   true),
    'ID_04_COUNCIL_LOGS'       : fetchId('04_Council_Logs',          true),
    'ID_04_1_ARCHITECT'        : fetchId('04.1_ARCHITECT_SILO',      true),
    'ID_04_2_AUDITOR'          : fetchId('04.2_AUDITOR_SILO',        true),
    'ID_04_3_MUSE'             : fetchId('04.3_MUSE_SILO',           true),
    'ID_04_4_DEVELOPER'        : fetchId('04.4_DEVELOPER_SILO',      true),
    'ID_04_5_ALIGNER'          : fetchId('04.5_ALIGNER_SILO',        true),
    'ID_04_6_CURATOR'          : fetchId('04.6_CURATOR_SILO',        true),
    'ID_04_7_RTP'              : fetchId('04.7_RTP_SILO',            true),
    'ID_04_8_GRAVEYARD'        : fetchId('04.8_COG_GRAVEYARD',       true),
    'ID_05_VECTOR_REPOSITORY'  : fetchId('05_Vector_Repository',     true),
    'ID_06_1_LESSON_PLANS'     : fetchId('06.1_LESSON_PLANS',        true),
    'ID_06_2_STUDENT_FACING'   : fetchId('06.2_STUDENT_FACING',      true),
    'ID_06_3_ASSESSMENTS'      : fetchId('06.3_ASSESSMENTS',         true),
    'ID_06_4_COMMUNICATIONS'   : fetchId('06.4_COMMUNICATIONS',      true),
    'ID_07_MEMORY_VAULT'       : fetchId('07_Memory_Vault',          true),
    'ID_08_PROJECT_AUTOPSIES'  : fetchId('08_Project_Autopsies',     true),
    'ID_CCPS_MASTER_TEMPLATES' : fetchId('CCPS_MASTER_TEMPLATES',    true),
    'FOLDER_ID'                : fetchId('03.4_RAW_EXHAUST',         true),
    'INDEX_ID'                 : fetchId('BRAIN_TRUST_INDEX',        false),
    'ID_CURRENT_STATE'         : fetchId('CURRENT_STATE',            false),
    'ID_PIVOTS_AND_LESSONS'    : fetchId('PIVOTS_AND_LESSONS_V1.0',  false),
    'ID_CORE_THESIS'           : fetchId('CORE_THESIS',              false),
    'ID_SYSTEM_TELEMETRY'      : fetchId('SYSTEM_TELEMETRY',         false),
  };

  let ok = 0, missing = 0;
  Object.entries(map).forEach(([key, id]) => {
    if (id) { props.setProperty(key, id); ok++; } else { missing++; }
  });
  const indexId = props.getProperty('INDEX_ID');
  if (indexId) props.setProperty('ID_BRAIN_TRUST_INDEX', indexId);

  ui.alert('Setup Routing Properties',
    missing === 0
      ? `✅ All ${ok} routing properties registered.`
      : `⚠ ${ok} registered, ${missing} not found — check execution log.`,
    ui.ButtonSet.OK);
}


// ============================================================================
// SECTION 20: CALIBRATION (PIVOT 008)
// ============================================================================

function setupCalibration() {
  const props = PropertiesService.getScriptProperties();
  // ── FILL IN YOUR VALUES BELOW ─────────────────────────────────────────────
  // ⚠️  Note: Socratic Onboarding (Step 7) sets IDENTITY_KEY_SALT automatically.
  //     You only need to run this function to override inferred weights.
  const calibrationMap = {
    'THEME_ARCHITECTURE'     : 'YOUR_WEIGHT_HERE',      // e.g. '0.85'
    'THEME_PEDAGOGY'         : 'YOUR_WEIGHT_HERE',      // e.g. '0.90'
    'THEME_FAMILY_ALIGNMENT' : 'YOUR_WEIGHT_HERE',      // e.g. '1.00'
    'SOCRATIC_THRESHOLD'     : 'YOUR_WEIGHT_HERE',      // e.g. '0.75'
    'ALIGNMENT_TOLERANCE'    : 'YOUR_WEIGHT_HERE',      // e.g. '0.80'
    'IDENTITY_KEY_SALT'      : 'YOUR_PRIVATE_STRING_HERE',
  };
  // ── CLEAR VALUES AFTER RUNNING ────────────────────────────────────────────
  props.setProperties(calibrationMap);
  console.log('[HARDENING_COMPLETE] Calibration sequestered. Clear this function body now.');
}

function auditCalibrationHealth() {
  const ui      = DocumentApp.getUi();
  const missing = CFG.CALIBRATION_KEYS.filter(
    k => !PropertiesService.getScriptProperties().getProperty(k)
  );
  const status  = _getCalibrationStatus();
  if (!status.armed) {
    ui.alert('⚠ Engine COLD',
      `No calibration data.\n\nExpected:\n${CFG.CALIBRATION_KEYS.map(k => '  • ' + k).join('\n')}\n\n` +
      'Run 🧠 Council → Begin Socratic Onboarding to arm.',
      ui.ButtonSet.OK);
  } else {
    ui.alert('Calibration Health',
      missing.length === 0
        ? `✅ Engine ARMED — ${status.count} key(s) verified.`
        : `⚠ PARTIAL — Missing:\n${missing.map(k => '  • ' + k).join('\n')}`,
      ui.ButtonSet.OK);
  }
}

function _getCalibrationStatus() {
  const props = PropertiesService.getScriptProperties();
  const found = CFG.CALIBRATION_KEYS.filter(k => props.getProperty(k) !== null);
  return { armed: found.length > 0, count: found.length };
}

function getKOSCalibration(key) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) console.error(`[CALIBRATION_ERROR] Missing key: "${key}". Engine COLD.`);
  return val || null;
}

function runHardeningAudit(payload) {
  if (!payload || typeof payload !== 'string') return true;
  const patterns = [
    { re: /weight\s*[:=]\s*0\.\d+/i,          label: 'Hardcoded weight value'     },
    { re: /threshold\s*[:=]\s*0\.\d+/i,       label: 'Hardcoded threshold value'  },
    { re: /IDENTITY_KEY\s*[:=]\s*['"].+['"]/,  label: 'Exposed identity key'       },
    { re: /SALT\s*[:=]\s*['"].+['"]/i,         label: 'Exposed salt string'        },
  ];
  patterns.forEach(({ re, label }) => {
    if (re.test(payload)) {
      throw new Error(
        `[VULNERABILITY_DETECTED] ${label} in payload. Aborted per PIVOT 008. ` +
        'Move this value to PropertiesService via setupCalibration().'
      );
    }
  });
  return true;
}


// ============================================================================
// SECTION 21: CONTEXT COMPILER (SMP-001 Phase B)
// Queries VECTOR_MATRIX with three-band thresholds. GAS builds the structure.
// Math-Before-Muse Mandate.
// ============================================================================

function compileVectorPrimers() {
  const ui   = DocumentApp.getUi();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) { ui.alert('Busy', 'Try again.', ui.ButtonSet.OK); return; }
  try {
    const vectorFolderId = PropertiesService.getScriptProperties().getProperty('ID_05_VECTOR_REPOSITORY');
    if (!vectorFolderId) throw new Error('ID_05_VECTOR_REPOSITORY missing. Run Setup Routing Properties.');
    const ss     = _getBrainTrustIndex();
    const matrix = ss.getSheetByName(CFG.VECTOR_MATRIX_SHEET);
    if (!matrix) {
      ui.alert('VECTOR_MATRIX Not Found',
        'Run ① Process Session Log + ③ Process Intake Payloads at least once to populate the matrix.',
        ui.ButtonSet.OK); return;
    }
    const rows        = matrix.getDataRange().getValues();
    const headers     = rows.shift();
    const vectorCols  = headers.slice(2);
    const vectorFolder = DriveApp.getFolderById(vectorFolderId);
    let   compiled    = 0;

    vectorCols.forEach((vectorName, offset) => {
      const colIdx = offset + 2;
      const core = [], context = [], ghost = [];
      rows.forEach(row => {
        const w = parseFloat(row[colIdx]);
        if (isNaN(w) || w < 0.1) return;
        const entry = { uid: row[0], ts: row[1], weight: w };
        if      (w >= 0.8) core.push(entry);
        else if (w >= 0.5) context.push(entry);
        else               ghost.push(entry);
      });
      if (!core.length && !context.length && !ghost.length) return;
      const desc = (a, b) => b.weight - a.weight;
      core.sort(desc); context.sort(desc); ghost.sort(desc);
      let md = `# VECTOR PRIMER: ${vectorName}\nGenerated: ${new Date().toLocaleString()}\n\n`;
      if (core.length) {
        md += `## CORE (≥ 0.8) — ${core.length} session(s)\n`;
        core.forEach(e => { md += `### ${e.uid} | Weight: ${e.weight}\n*${e.ts}*\n[See VECTOR_${vectorName}.gdoc]\n\n`; });
      }
      if (context.length) {
        md += `## CONTEXT (0.5–0.79) — ${context.length} session(s)\n`;
        context.forEach(e => { md += `- ${e.uid} (${e.weight}) | ${e.ts}\n`; });
        md += '\n';
      }
      if (ghost.length) {
        md += `## GHOST VECTORS (0.1–0.49) — ${ghost.length} session(s)\n`;
        ghost.forEach(e => { md += `- [${e.uid}] Weight: ${e.weight}\n`; });
        md += '\n';
      }
      const primerDoc = _getOrCreateDoc(`${vectorName}_PRIMER`, vectorFolder);
      primerDoc.getBody().clear();
      primerDoc.getBody().setText(md);
      console.log(`[ContextCompiler] ${vectorName}_PRIMER compiled.`);
      compiled++;
    });
    ui.alert('✅ Context Compiler Complete', `Compiled ${compiled} Vector Primer(s).`, ui.ButtonSet.OK);
  } catch (e) { _reportError('compileVectorPrimers', e, ui); }
  finally      { lock.releaseLock(); }
}


// ============================================================================
// SECTION 22: STARTUP PRIMER
// ============================================================================

function getStartupPrimer() {
  const ui = DocumentApp.getUi();
  const block = getStartupPrimerBlock();
  if (!block) {
    ui.alert('No Primer Found',
      'Run ④ Consolidate Inference (Phase 3) after processing chunks.',
      ui.ButtonSet.OK);
    return '';
  }
  ui.alert('SESSION_VECTOR_PRIMER', block, ui.ButtonSet.OK);
  return block;
}

function getStartupPrimerBlock() {
  const raw = PropertiesService.getScriptProperties().getProperty('SESSION_VECTOR_PRIMER');
  if (!raw) return null;
  try {
    const primer = JSON.parse(raw);
    const lines  = Object.entries(primer.vector_weights || {})
                         .map(([k, v]) => `  ${k.padEnd(25)} ${v}`);
    return (
      `[🧠 RTP — STARTUP PRIMER]\n` +
      `Consolidated: ${primer.consolidated_at}\n` +
      `Chunks: ${primer.chunk_count}\n\n` +
      `VECTOR_WEIGHTS:\n${lines.join('\n')}\n\n` +
      `[END PRIMER — Inject at top of next Gem session]`
    );
  } catch (e) { console.error('[Primer] JSON parse failed.'); return null; }
}


// ============================================================================
// SECTION 23: SEVEN BRIDGES REVIEW (SMP-002 STUB)
// ============================================================================

function sevenBridgesReview() {
  DocumentApp.getUi().alert(
    '🌉 SMP-002: Seven Bridges Reconciliation Protocol',
    'Status: PENDING USER APPROVAL\n\n' +
    '3/7 TRIGGER: 3+ non-APPROVED verdicts halt execution.\n' +
    "BRIDGE_FIDELITY_001: A verdict produced with knowledge of another cog's verdict is VOID.\n\n" +
    'To approve:\n1. Open SMP-002 in 01.3_SMP_PROPOSALS\n2. Update Status to APPROVED\n3. Notify Developer to build execution layer.',
    DocumentApp.getUi().ButtonSet.OK
  );
}


// ============================================================================
// SECTION 24: ADMIN
// ============================================================================

function resetProperties() {
  const props = PropertiesService.getScriptProperties();
  // Gap 5 fix: correct spread — Object.values(CFG.PROP) must be spread,
  // not wrapped in an array before .flat()
  const keysToPreserve = [...CFG.CALIBRATION_KEYS, ...Object.values(CFG.PROP), 'KOS_KNOWN_VECTORS'];
  const saved = {};
  keysToPreserve.forEach(k => {
    const v = props.getProperty(k);
    if (v) saved[k] = v;
  });
  props.deleteAllProperties();
  if (Object.keys(saved).length > 0) props.setProperties(saved);
  try {
    DocumentApp.getUi().toast(
      `Routing pointers cleared. ${Object.keys(saved).length} calibration/onboarding key(s) preserved.`,
      'Reset', 5
    );
  } catch (_) { console.log('[resetProperties] Complete. ' + Object.keys(saved).length + ' key(s) preserved.'); }
}

function nuclearWipeForRelease() {
  const ui      = DocumentApp.getUi();
  const confirm = ui.alert('☢ NUCLEAR WIPE',
    'Permanently deletes ALL PropertiesService data including calibration and onboarding.\nIrreversible.\n\nProceed?',
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteAllProperties();
  ui.alert('✅ Clean Sweep', 'All data wiped. Re-run Deploy + Socratic Onboarding to restore.', ui.ButtonSet.OK);
}

function initializeTriggers() {
  const existing = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  function wire(fn, min) {
    if (existing.includes(fn)) { console.log(`[Triggers] Already exists: ${fn}`); return; }
    ScriptApp.newTrigger(fn).timeBased().everyMinutes(min).create();
    console.log(`[Triggers] Wired: ${fn} — every ${min} min`);
  }
  wire('runSemanticSweeper', 15);
  wire('sweepRootForExhaust', 15);
  console.log('[Triggers] Sweeper triggers initialized.');
}

function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log('[Triggers] All project triggers removed.');
}

function deprecateFile(fileId, reason) {
  const graveFolderId = PropertiesService.getScriptProperties().getProperty('ID_04_8_GRAVEYARD');
  if (!graveFolderId) throw new Error('ID_04_8_GRAVEYARD missing. Run Setup Routing Properties.');
  const file         = DriveApp.getFileById(fileId);
  const originalName = file.getName();
  const date         = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  file.setName(`CE-GRAVE: ${originalName} [DEPRECATED ${date}]`);
  file.moveTo(DriveApp.getFolderById(graveFolderId));
  try {
    const ss     = _getBrainTrustIndex();
    const ledger = _getOrCreateSheet(ss, CFG.EXECUTION_LEDGER_SHEET);
    ledger.appendRow(['[DEPRECATED]', new Date(), 'CE-GRAVE:', file.getUrl(), `DEPRECATED: ${reason}`, '']);
  } catch (e) { console.warn('[deprecateFile] Could not log: ' + e.message); }
  console.log(`[deprecateFile] ${originalName} → CE-GRAVE`);
  return true;
}


// ============================================================================
// SECTION 25: CORE UTILITIES
// All _getOrCreate helpers, pointer accessors, Smart Chip writers, sheet initializers.
// ============================================================================

function _generateLogUUID(text) {
  const ts   = new Date().getTime();
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
    .map(v => (v < 0 ? v + 256 : v).toString(16).padStart(2, '0'))
    .join('').substring(0, 8);
  return `LOG-${ts}-${hash}`;
}

function _getOrCreateDoc(docName, folder) {
  const ex = folder.getFilesByName(docName);
  if (ex.hasNext()) return DocumentApp.openById(ex.next().getId());
  const doc = DocumentApp.create(docName);
  DriveApp.getFileById(doc.getId()).moveTo(folder);
  return doc;
}

function _getOrCreateFolder(name, parent) {
  const p  = parent || DriveApp.getRootFolder();
  const ex = p.getFoldersByName(name);
  return ex.hasNext() ? ex.next() : p.createFolder(name);
}

function _getOrCreateSpreadsheet(name, parentFolder) {
  const files = parentFolder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId());
  }
  const ss = SpreadsheetApp.create(name);
  SpreadsheetApp.flush();
  DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
  return ss;
}

function _getSystemAsset(name, propKey, isFolder) {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty(propKey);
  if (id) {
    try { return isFolder ? DriveApp.getFolderById(id) : SpreadsheetApp.openById(id); }
    catch (_) { console.warn(`[_getSystemAsset] Stale pointer for ${propKey} — falling back.`); }
  }
  const iter = isFolder ? DriveApp.getFoldersByName(name) : DriveApp.getFilesByName(name);
  if (!iter.hasNext()) throw new Error(`Asset Not Found: "${name}"\n\nRun 🚀 Deploy first.`);
  const found = iter.next();
  props.setProperty(propKey, found.getId());
  return isFolder ? found : SpreadsheetApp.openById(found.getId());
}

function _getBrainTrustIndex() {
  const props = PropertiesService.getScriptProperties();
  const id    = props.getProperty('INDEX_ID') || props.getProperty('ID_BRAIN_TRUST_INDEX');
  if (!id) throw new Error('INDEX_ID missing. Run 🚀 Deploy.');
  return SpreadsheetApp.openById(id);
}

function _getSafeFileUrl(file, fileId) {
  try { const u = file.getUrl(); if (u) return u; } catch (_) {}
  return `https://docs.google.com/document/d/${fileId}/edit`;
}

function _writeSmartChip(sheet, row, col, linkText, url) {
  sheet.getRange(row, col).setRichTextValue(
    SpreadsheetApp.newRichTextValue().setText(linkText).setLinkUrl(url).build()
  );
}

function _findFolder(name, parent) {
  if (!parent) return null;
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function _getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headerMap = {
      [CFG.STAGING_SHEET]         : ['Timestamp', 'Chunk_ID', 'Doc_Link', 'File_ID', 'Status'],
      [CFG.EXECUTION_LEDGER_SHEET]: ['UID', 'TIMESTAMP', 'SEMANTIC_TAG', 'FILE_URL', 'STATUS', 'ATTEMPT_TRACKER'],
      [CFG.MATRIX_LEDGER_SHEET]   : ['Session_UID', 'Timestamp', 'ARCHITECTURE', 'UI', 'SECURITY', 'PEDAGOGY', 'TOTAL'],
      [CFG.VECTOR_MATRIX_SHEET]   : ['SESSION_UID', 'TIMESTAMP', ...CFG.KNOWN_VECTORS],
      [CFG.INCUBATOR_SHEET]       : ['THEME', 'SESSION_COUNT', 'CUMULATIVE_SCORE', 'AVG_SCORE', 'LAST_SESSION', 'STATUS'],
      [CFG.BLACKBOARD_SHEET]      : ['Target_Doc_ID','CE_Tag','Doc_Title','Version','Find_String','Replace_Payload','Alt_Doc_ID','Notes','Filed_By','Filed_Date','Status','Deploy_Trigger'],
      [CFG.SESSION_LOG_SHEET]     : ['Session_UID', 'Timestamp', 'Session_Type', 'Cold_Start', 'Summary', 'Apex_Lead'],
      [CFG.COG_REGISTRY_SHEET]    : ['Session_UID', 'Timestamp', 'Cog', 'Final_Status', 'Summary'],
      [CFG.ACTION_REGISTER_SHEET] : ['Session_UID', 'Timestamp', 'Type', 'Item', 'Owner', 'Protected_Time_Risk'],
      [CFG.ONBOARDING_SHEET]      : ['Day', 'Date', 'Event', 'Note', 'Vision_90_Day'],
    };
    const headers = headerMap[sheetName] || ['Timestamp', 'Data'];
    sheet.appendRow(headers);
    const hRange = sheet.getRange(1, 1, 1, headers.length);
    hRange.setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    if (sheetName === CFG.BLACKBOARD_SHEET) sheet.getRange('L2:L1000').insertCheckboxes();
    if (sheetName === CFG.VECTOR_MATRIX_SHEET) {
      sheet.getRange(1, 3, 1, CFG.KNOWN_VECTORS.length).setBackground('#1e3a5f');
    }
  }
  return sheet;
}

// ============================================================================
// END OF PART C
// Paste Part D immediately below this line.
// ============================================================================
