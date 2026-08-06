// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 9 of 9: UI & Diagnostics (HITL Functions)
// ================================================================
//
// ── PURPOSE & SCOPE ──────────────────────────────────────────
// This file preserves every Human-in-the-Loop function from
// KOS_MASTER_v3_1.gs that uses ui.alert/prompt. These functions
// are intentionally NOT headless — they exist for manual
// operator tasks run from the Apps Script editor or from a
// spreadsheet menu when the script is bound to BRAIN_TRUST_INDEX.
//
// THESE FUNCTIONS MUST NEVER BE CALLED FROM:
//   • Time-driven triggers (no UI context)
//   • onChange / onEdit triggers (no ui.prompt/alert)
//   • doGet / doPost handlers
//   • Any other background execution
//
// ── RUNNING IN STANDALONE MODE ───────────────────────────────
// In a pure standalone script (no container), ui.alert and
// ui.prompt require a UI context. The safest approach:
//   1. Open BRAIN_TRUST_INDEX in a browser tab.
//   2. Run these functions from the Apps Script editor.
//      SpreadsheetApp.getUi() will bind to the open sheet.
//   OR
//   1. Bind this script to BRAIN_TRUST_INDEX via
//      Extensions → Apps Script (paste all files there).
//      The onOpen() menu will then appear in the sheet.
//
// ── V8.0 ADAPTATIONS ─────────────────────────────────────────
// onOpen()               Menu points to web app. Drop Zone
//                        "Open Web App" item replaces the
//                        direct-run ingest functions.
//
// buildSessionContext()  ADAPTED: no longer writes to
//                        DocumentApp.getActiveDocument() (no
//                        active doc in standalone context).
//                        Creates a new doc in Drive instead.
//
// generateCouncilInputPayload() HITL version preserved here.
//                        Headless version = triggerCouncilSimulation()
//                        in 6_Governance.gs.
//
// consolidateInferenceChunks() / generateSessionVectorPrimer()
//                        HITL Phase 4 legacy functions. Preserved
//                        for manual use; in headless mode the
//                        queue processor handles intake end-to-end.
//
// dumpAllProperties()    The CONSOLE-ONLY headless version lives in
//                        5_Error_And_Utilities.gs. This version
//                        adds a ui.alert display on top.
// ================================================================


// ── UI HELPER ──────────────────────────────────────────────────
// Attempts SpreadsheetApp → DocumentApp in order. Falls back to
// a console-only mock when neither context is available.
function _getUi() {
  try { return SpreadsheetApp.getUi(); } catch (_) {}
  try { return DocumentApp.getUi(); }   catch (_) {}
  // Headless mock — ensures functions degrade gracefully
  const mock = {
    alert:  (t, m) => { console.log('[UI.ALERT] ' + t + ': ' + m); },
    prompt: (t, m, bs) => ({ getSelectedButton: () => mock.Button.OK, getResponseText: () => '' }),
    Button:    { YES: 'YES', NO: 'NO', OK: 'OK', CANCEL: 'CANCEL' },
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO', OK_CANCEL: 'OK_CANCEL' },
  };
  return mock;
}


// ================================================================
// MENU — onOpen
// ================================================================

/**
 * Creates the KOS menu when BRAIN_TRUST_INDEX is opened.
 * Only fires when this script is BOUND to BRAIN_TRUST_INDEX.
 * In standalone deployment (web app only) this function is a no-op.
 *
 * To bind: open BRAIN_TRUST_INDEX → Extensions → Apps Script
 * and paste all v8.0 files. The onOpen menu will appear.
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('🧠 KOS v8.0')
      .addItem('🌐 Open Web App', 'openWebApp')
      .addSeparator()
      .addSubMenu(ui.createMenu('📥 Ingest & Context')
        .addItem('Build Session Context', 'buildSessionContext')
        .addItem('Generate Council Payload (HITL)', 'generateCouncilInputPayload')
        .addItem('Consolidate Inference Chunks', 'consolidateInferenceChunks'))
      .addSubMenu(ui.createMenu('📊 Diagnostics')
        .addItem('Check Onboarding Progress', 'checkOnboardingProgress')
        .addItem('Audit Calibration Health',  'auditCalibrationHealth')
        .addItem('Verify Fidelity Clause',    'verifyFidelityClause')
        .addItem('Check License Compliance',  'checkLicenseCompliance')
        .addItem('Dump All Properties',       'dumpAllPropertiesUI')
        .addItem('Seven Bridges Review',      'sevenBridgesReview'))
      .addSubMenu(ui.createMenu('⚙ Admin')
        .addItem('🧠 Begin Socratic Onboarding',  'runSocraticOnboarding')
        .addItem('Update Relational Targets',      'updateRelationalTargets')
        .addItem('Generate License Report',        'generateLicenseReport')
        .addItem('Re-run Full Deploy',             'deployFullSystem')
        .addSeparator()
        .addItem('☢ Nuclear Wipe (IRREVERSIBLE)', 'nuclearWipeForRelease'))
      .addToUi();
  } catch (_) {}  // standalone — no container, no menu
}


/** Opens the web app deployment URL in a new window via sidebar. */
function openWebApp() {
  try {
    const url = ScriptApp.getService().getUrl();
    SpreadsheetApp.getUi().showModelessDialog(
      HtmlService.createHtmlOutput(
        '<script>window.open("' + url + '","_blank");google.script.host.close();</script>'
      ).setWidth(1).setHeight(1),
      'Opening KOS…'
    );
  } catch (e) {
    _getUi().alert('Web App URL', ScriptApp.getService().getUrl(), _getUi().ButtonSet.OK);
  }
}


// ================================================================
// SOCRATIC ONBOARDING — HITL WIZARD
// ================================================================

/**
 * 8-step guided onboarding that arms the KOS engine.
 * Collects operator philosophy, seals it in CORE_THESIS,
 * generates the Identity Key, and sets THESIS_VERIFIED = true.
 *
 * Safe to re-run — prompts to confirm restart if already armed.
 * In v8.0, the web app Diagnostics tab will eventually host a
 * form-based version. This HITL version remains for editor use.
 */
function runSocraticOnboarding() {
  const ui    = _getUi();
  const props = PropertiesService.getScriptProperties();

  if (props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true') {
    const restart = ui.alert('Engine Already Armed',
      'Engine is armed. Day ' + (props.getProperty(CFG.PROP.ONBOARDING_DAY) || 1) +
      ' of ' + CFG.ONBOARDING_DAYS + '.\n\nRestart and reset your thesis?',
      ui.ButtonSet.YES_NO);
    if (restart !== ui.Button.YES) return;
    ['IDENTITY_KEY', CFG.PROP.THESIS_VERIFIED, CFG.PROP.ONBOARDING_DAY, CFG.PROP.ONBOARDING_START]
      .forEach(k => props.deleteProperty(k));
  }

  ui.alert('🧠 Welcome to KOS Socratic Onboarding',
    '8 questions. ~10 minutes.\n\nThe system ships with no philosophy pre-installed.\n' +
    'What you define here is yours alone — it cannot be replicated without your\n' +
    'answers and passphrase.\n\nYou can cancel at any time and resume later.',
    ui.ButtonSet.OK);

  const a   = {};
  const ask = (step, title, body) => {
    const r = ui.prompt('Step ' + step + ' of ' + CFG.TOTAL_ONBOARDING_STEPS + ' — ' + title, body, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return null;
    return r.getResponseText().trim() || null;
  };

  a.role = ask(1, 'WHAT IS YOUR ROLE?',
    'Your primary role or domain.\nExamples: Marketing Teacher, Business Coach, Software Developer');
  if (!a.role) return ui.alert('Paused', 'Resume anytime with 🧠 Admin → Begin Socratic Onboarding.', ui.ButtonSet.OK);

  a.audience = ask(2, 'WHO DO YOU SERVE?',
    'The people whose growth your work directly affects.\nExamples: High school students, Small business owners');
  if (!a.audience) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.adminGhost = ask(3, 'NAME YOUR ADMIN GHOST',
    'What does administrative drag steal from you specifically, and how many hours per week?\nExamples: Grading formatting 4hr/wk. Parent email management 3hr/wk.');
  if (!a.adminGhost) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.struggle = ask(4, 'THE NECESSARY STRUGGLE',
    'What cognitive friction do you REFUSE to automate?\nExamples: Students must write their own business plan.');
  if (!a.struggle) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.targets = ask(5, 'RELATIONAL TARGETS',
    'Your top 3–5 Carbon-to-Carbon relationships (comma separated).\nThese are the people this system exists to protect time for.');
  if (!a.targets) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.vision = ask(6, '90-DAY VISION',
    'In one sentence: what does success look like in 90 days if KOS is working perfectly?\nBe specific. Vague visions produce vague results.');
  if (!a.vision) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  a.salt = ask(7, 'IDENTITY KEY PASSPHRASE',
    '⚠ CRITICAL — READ CAREFULLY\n\nCreate a private passphrase (anything memorable).\n' +
    'This combines with your thesis to generate a unique Identity Key.\n\n' +
    'YOU WILL NOT BE ASKED AGAIN. Write it down first.');
  if (!a.salt) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);
  props.setProperty('IDENTITY_KEY_SALT', a.salt);

  a.deployType = ask(8, 'DEPLOYMENT TYPE',
    'License: Polyform Noncommercial 1.0.0 — free for noncommercial use.\n' +
    'Commercial use: honor system with attribution.\n\n' +
    'Type one of: INDIVIDUAL, EDUCATOR, COMMERCIAL');
  if (!a.deployType) return ui.alert('Paused', 'Resume anytime.', ui.ButtonSet.OK);

  const dt = ['INDIVIDUAL','EDUCATOR','COMMERCIAL'].includes((a.deployType||'').toUpperCase())
    ? a.deployType.toUpperCase() : 'INDIVIDUAL';

  props.setProperty(CFG.PROP.DEPLOYMENT_TYPE,    dt);
  props.setProperty(CFG.PROP.OPERATOR_ROLE,      a.role);
  props.setProperty(CFG.PROP.OPERATOR_AUDIENCE,  a.audience);
  props.setProperty(CFG.PROP.ADMIN_GHOST,         a.adminGhost);
  props.setProperty(CFG.PROP.NECESSARY_STRUGGLE,  a.struggle);
  props.setProperty(CFG.PROP.RELATIONAL_TARGETS,  a.targets);
  props.setProperty(CFG.PROP.VISION_90_DAY,       a.vision);

  Object.entries(_inferCalibrationWeights(a.role)).forEach(([k, v]) => {
    if (!props.getProperty(k)) props.setProperty(k, String(v));
  });

  _seedCoreThesisDoc(a, dt);
  generateIdentityKey();
  props.setProperty(CFG.PROP.THESIS_VERIFIED, 'true');
  props.setProperty(CFG.PROP.ONBOARDING_DAY,  '1');
  props.setProperty(CFG.PROP.ONBOARDING_START, new Date().toISOString());
  _logOnboardingDay(1, 'SEALED', a.vision);

  ui.alert('✅ Engine Armed — Onboarding Complete',
    'Deployment: ' + dt + '\n' +
    'Relational Targets: ' + a.targets + '\n\n' +
    'Your 90-Day Vision:\n"' + a.vision + '"\n\n' +
    'NEXT STEPS:\n' +
    '1. Open the KOS web app → Ingest tab\n' +
    '2. Paste your first session log → Queue Payload\n' +
    '3. Let Studio process it → check Queue tab for FLOW_COMPLETE\n\n' +
    'Day 1 of ' + CFG.ONBOARDING_DAYS + '. The system is live.',
    ui.ButtonSet.OK);
}


// ================================================================
// SESSION CONTEXT BUILDER — HITL (v8.0 Adapted)
// ================================================================

/**
 * Assembles a session context injection block from CORE_THESIS,
 * PIVOTS_AND_LESSONS, the latest VECTOR_MATRIX row, and Relational
 * Targets. Writes the result to a new Google Doc in Drive and
 * shows the URL.
 *
 * v8.0 ADAPTATION: The original wrote to DocumentApp.getActiveDocument()
 * (Drop Zone). In standalone mode there is no active document.
 * This version creates a new doc and surfaces the URL.
 */
function buildSessionContext() {
  const ui    = _getUi();
  const props = PropertiesService.getScriptProperties();
  try {
    _coldEngineGate('buildSessionContext', 'TIER_2');
    const sections = [], loaded = [];

    const readDoc = (id, label, maxChars) => {
      if (!id) return;
      try {
        const text = DocumentApp.openById(id).getBody().getText();
        if (text.length > 50) {
          sections.push('## ' + label + '\n' + text.substring(0, maxChars) +
            (text.length > maxChars ? '\n[...truncated...]' : ''));
          loaded.push(label);
        }
      } catch (_) { console.warn('[buildSessionContext] Could not load ' + label); }
    };

    readDoc(props.getProperty('ID_CORE_THESIS'),       'CORE_THESIS',        1500);
    readDoc(props.getProperty('ID_PIVOTS_AND_LESSONS'),'PIVOTS_AND_LESSONS', 2000);

    const manFiles = DriveApp.getFilesByName('RTP_USER_MANUAL_v1.0');
    if (manFiles.hasNext()) readDoc(manFiles.next().getId(), 'RTP_USER_MANUAL', 1200);

    try {
      const ss     = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
      const matrix = _getOrCreateSheet(ss, CFG.VECTOR_MATRIX_SHEET);
      if (matrix.getLastRow() > 1) {
        const h = matrix.getRange(1, 1, 1, matrix.getLastColumn()).getValues()[0];
        const r = matrix.getRange(matrix.getLastRow(), 1, 1, matrix.getLastColumn()).getValues()[0];
        let primer = '## VECTOR_MATRIX — STARTUP CALIBRATION\n';
        h.slice(2).forEach((t, i) => {
          primer += '  ' + String(t).padEnd(22) + r[i + 2] + '\n';
        });
        sections.push(primer);
        loaded.push('BRAIN_TRUST_INDEX (Vector Primer)');
      }
    } catch (_) {}

    const targets = getRelationalTargets();
    if (targets.length > 0) {
      sections.push('## RELATIONAL TARGETS (Protect These Relationships)\n' +
        targets.map((t, i) => (i + 1) + '. ' + t).join('\n'));
    }

    const block =
      '[🧠 RTP — SESSION CONTEXT INJECTION]\n' +
      'Assembled: ' + new Date().toLocaleString() + '\n' +
      'Active Files: ' + loaded.join(', ') + '\n' +
      'Operator: ' + (props.getProperty(CFG.PROP.OPERATOR_ROLE) || 'Unknown') + '\n' +
      'Onboarding Day: ' + (props.getProperty(CFG.PROP.ONBOARDING_DAY) || '?') +
      ' of ' + CFG.ONBOARDING_DAYS + '\n\n' +
      '═'.repeat(50) + '\n\n' +
      sections.join('\n\n' + '─'.repeat(50) + '\n\n') +
      '\n\n' + '═'.repeat(50) + '\n' +
      '[END CONTEXT INJECTION — Paste this entire block at the top of a new Studio session.]';

    // v8.0: create a doc rather than overwrite getActiveDocument()
    const ts      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
    const docName = 'SESSION_CONTEXT_' + ts;
    const doc     = DocumentApp.create(docName);
    const dId     = doc.getId();
    doc.getBody().setText(block);
    doc.saveAndClose();

    const rawId = props.getProperty('ID_00_RAW_EXHAUST');
    if (rawId) DriveApp.getFileById(dId).moveTo(DriveApp.getFolderById(rawId));

    const docUrl = DriveApp.getFileById(dId).getUrl();

    ui.alert('✅ Session Context Built',
      'Loaded: ' + loaded.join(', ') + '\n\n' +
      'Doc created: ' + docName + '\n' +
      'URL: ' + docUrl + '\n\n' +
      'Open the doc, copy its contents, and paste at the top of a new Studio session.',
      ui.ButtonSet.OK);

  } catch (e) { _reportError('buildSessionContext', e, ui); }
}


// ================================================================
// COUNCIL PAYLOAD GENERATOR — HITL VERSION
// ================================================================

/**
 * HITL version. For headless/web-app version see
 * triggerCouncilSimulation() in 6_Governance.gs.
 *
 * Generates a council stimulus doc from CURRENT_STATE and
 * PIVOTS_AND_LESSONS. Presents a stasis guard before running —
 * blocks if CURRENT_STATE hasn't been updated since the last run.
 */
function generateCouncilInputPayload() {
  const ui    = _getUi();
  const props = PropertiesService.getScriptProperties();
  try {
    _coldEngineGate('generateCouncilInputPayload', 'TIER_2');

    const stateId   = props.getProperty('ID_CURRENT_STATE');
    const pivotId   = props.getProperty('ID_PIVOTS_AND_LESSONS');
    const exhaustId = props.getProperty('ID_00_RAW_EXHAUST');
    if (!stateId || !pivotId || !exhaustId) throw new Error('Core pointers missing. Run deployFullSystem().');

    // Stasis guard
    const lastMs = parseInt(props.getProperty('COUNCIL_LAST_RUN') || '0', 10);
    if (DriveApp.getFileById(stateId).getLastUpdated().getTime() <= lastMs) {
      ui.alert('⚠ Stasis Guard',
        'CURRENT_STATE has not been updated since the last council run.\n\n' +
        'Update the state doc with recent session data before generating a new payload.',
        ui.ButtonSet.OK);
      return;
    }

    const go = ui.alert('Generate Council Payload?',
      'This creates a structured council stimulus doc from:\n' +
      '  • CURRENT_STATE\n  • PIVOTS_AND_LESSONS\n\n' +
      'The doc will be saved to 03.4_RAW_EXHAUST for Studio pickup.',
      ui.ButtonSet.YES_NO);
    if (go !== ui.Button.YES) return;

    const stateText = DocumentApp.openById(stateId).getBody().getText();
    const pivotText = DocumentApp.openById(pivotId).getBody().getText();
    const ts        = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const docName   = 'CE: COUNCIL_PAYLOAD_' + ts;

    const doc  = DocumentApp.create(docName);
    const dId  = doc.getId();
    const body = doc.getBody();

    body.appendParagraph('[🧠 RTP COUNCIL INITIATION STUB]')
        .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('System State: ' + ts);
    body.appendParagraph('1. THE CONTEXT (Recent Session Summary)')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(stateText.substring(0, 8000));
    body.appendParagraph('2. THE LAWS (Active Constraints & Pivots)')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(pivotText.substring(0, 4000));
    body.appendParagraph('3. INFERENCE INSTRUCTIONS')
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(
      'Act as ARCHITECT, AUDITOR, and MUSE independently. ' +
      'Evaluate Context against Laws. Respond with structured JSON.'
    ).setBold(true);

    doc.saveAndClose();
    DriveApp.getFileById(dId).moveTo(DriveApp.getFolderById(exhaustId));
    props.setProperty('COUNCIL_LAST_RUN', new Date().getTime().toString());

    ui.alert('✅ Council Payload Created',
      docName + '\n\nSaved to 03.4_RAW_EXHAUST.\n' +
      'Studio will pick it up on the next PENDING_FLOW scan.\n\n' +
      'URL: ' + DriveApp.getFileById(dId).getUrl(),
      ui.ButtonSet.OK);

  } catch (e) { _reportError('generateCouncilInputPayload', e, ui); }
}


// ================================================================
// PHASE 4 — HITL CHUNK CONSOLIDATION (Legacy Path)
// ================================================================

/**
 * Merges all INTAKE_PROCESSED / PROCESSED chunk docs for the
 * most recent session into a single consolidated document saved
 * to 03.3_PROCESSED_EXHAUST. Updates STAGING_PIPELINE rows to
 * CONSOLIDATED.
 *
 * In the v8.0 headless path, processIntakePayload handles each
 * chunk individually and the Vector Router does live routing.
 * This function is the HITL fallback for manual consolidation.
 */
function consolidateInferenceChunks() {
  const ui = _getUi();
  try {
    const ss      = _getSystemAsset(CFG.INDEX_NAME, 'INDEX_ID', false);
    const staging = _getOrCreateSheet(ss, CFG.STAGING_SHEET);
    const SC      = CFG.STAGING_COLS;
    const data    = staging.getLastRow() > 1
      ? staging.getRange(2, 1, staging.getLastRow() - 1, 7).getValues()
      : [];

    const done = data.filter(r =>
      String(r[SC.STATUS]) === 'INTAKE_PROCESSED' ||
      String(r[SC.STATUS]) === 'PROCESSED'
    );

    if (done.length === 0) {
      ui.alert('No Processed Chunks',
        'No INTAKE_PROCESSED or PROCESSED rows found.\nRun ③ Process Inference Queue first.',
        ui.ButtonSet.OK);
      return;
    }

    const props     = PropertiesService.getScriptProperties();
    const procId    = props.getProperty('ID_03_3_PROCESSED');
    const procFolder= procId ? DriveApp.getFolderById(procId) : null;
    if (!procFolder) throw new Error('03.3_PROCESSED_EXHAUST folder not found. Run setupRoutingProperties().');

    const ts         = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const sessionUID = _generateLogUUID(ts);
    const docName    = '[CONSOLIDATED]_' + sessionUID;
    const outDoc     = DocumentApp.create(docName);
    const outId      = outDoc.getId();
    const outBody    = outDoc.getBody();

    outBody.appendParagraph('CONSOLIDATED SESSION: ' + sessionUID)
           .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    outBody.appendParagraph('Assembled: ' + ts);

    let written = 0;
    done.forEach((row, i) => {
      const fileId = String(row[SC.FILE_ID]);
      try {
        const chunkText = DocumentApp.openById(fileId).getBody().getText();
        outBody.appendParagraph('\n── CHUNK ' + (i + 1) + ' ──')
               .setHeading(DocumentApp.ParagraphHeading.HEADING3);
        outBody.appendParagraph(chunkText);
        written++;
      } catch (_) {}
    });

    outDoc.saveAndClose();
    DriveApp.getFileById(outId).moveTo(procFolder);

    // Mark staging rows as CONSOLIDATED
    for (let i = 0; i < data.length; i++) {
      const s = String(data[i][SC.STATUS]);
      if (s === 'INTAKE_PROCESSED' || s === 'PROCESSED') {
        staging.getRange(i + 2, SC.STATUS + 1).setValue('CONSOLIDATED');
      }
    }
    SpreadsheetApp.flush();

    ui.alert('✅ Consolidation Complete',
      written + ' chunk(s) merged into:\n' + docName + '\n\n' +
      'Saved to 03.3_PROCESSED_EXHAUST.\n' +
      'URL: ' + DriveApp.getFileById(outId).getUrl(),
      ui.ButtonSet.OK);

  } catch (e) { _reportError('consolidateInferenceChunks', e, ui); }
}


// ================================================================
// DIAGNOSTICS — READ-ONLY STATUS FUNCTIONS
// ================================================================

function checkOnboardingProgress() {
  const ui    = _getUi();
  const props = PropertiesService.getScriptProperties();
  const day   = parseInt(props.getProperty(CFG.PROP.ONBOARDING_DAY)  || '0');
  const armed = props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true';

  if (!armed) {
    ui.alert('🔒 Engine COLD',
      'Thesis not verified.\n\nRun 🧠 Admin → Begin Socratic Onboarding.',
      ui.ButtonSet.OK);
    return;
  }

  const phase = day <= 7  ? '1: Foundation (Days 1–7)' :
                day <= 14 ? '2: Calibration (Days 8–14)' :
                            '3: Activation (Days 15–21)';
  const bar   = '█'.repeat(Math.min(day, 21)) + '░'.repeat(Math.max(0, 21 - day));

  ui.alert('Onboarding Progress — Day ' + day + ' of ' + CFG.ONBOARDING_DAYS,
    '[' + bar + '] ' + Math.round(day / 21 * 100) + '%\n' +
    'Phase: ' + phase + '\n\n' +
    'Role       : ' + (props.getProperty(CFG.PROP.OPERATOR_ROLE)       || 'Not set') + '\n' +
    'Deployment : ' + (props.getProperty(CFG.PROP.DEPLOYMENT_TYPE)     || 'Not set') + '\n\n' +
    '90-Day Vision:\n"' + (props.getProperty(CFG.PROP.VISION_90_DAY)   || 'Not defined') + '"\n\n' +
    'Relational Targets:\n' + (props.getProperty(CFG.PROP.RELATIONAL_TARGETS) || 'Not defined') + '\n\n' +
    '── 3-HORIZON ROI MAP ──\n' +
    'Horizon 1 (90 sec)  Deploy infrastructure          ✔ COMPLETE\n' +
    'Horizon 2 (10 min)  First session ingestion        ' + (day >= 1 ? '✔ COMPLETE' : '○ PENDING') + '\n' +
    'Horizon 3 (21 day)  Full cognitive alignment       ' + (day >= 21 ? '✔ COMPLETE' : day + '/21'),
    ui.ButtonSet.OK);
}


function auditCalibrationHealth() {
  const ui     = _getUi();
  const status = _getCalibrationStatus();
  const props  = PropertiesService.getScriptProperties();

  if (!status.armed) {
    ui.alert('⚠ Engine COLD',
      'No calibration data found.\n\nExpected keys:\n' +
      CFG.CALIBRATION_KEYS.map(k => '  • ' + k).join('\n') +
      '\n\nRun setupCalibration() or complete Socratic Onboarding.',
      ui.ButtonSet.OK);
    return;
  }

  const missing = CFG.CALIBRATION_KEYS.filter(k => !props.getProperty(k));
  ui.alert('Calibration Health',
    missing.length === 0
      ? '✅ Engine ARMED — ' + status.count + ' key(s) verified.\n\nIdentity Key: ' +
        (props.getProperty('IDENTITY_KEY') ? '✔ SET' : '⚠ NOT SET')
      : '⚠ PARTIAL — Missing:\n' + missing.map(k => '  • ' + k).join('\n'),
    ui.ButtonSet.OK);
}


function checkLicenseCompliance() {
  const ui    = _getUi();
  const props = PropertiesService.getScriptProperties();
  ui.alert('KOS License Information',
    'License : ' + CFG.LICENSE_TYPE + '\n' +
    'Author  : ' + CFG.AUTHOR + '\n' +
    'Version : KOS v' + CFG.SYSTEM_VERSION + '\n\n' +
    'Free for noncommercial use.\n' +
    'Commercial use: honor system with attribution.\n\n' +
    'THE FIDELITY CLAUSE (commercial deployments):\n' +
    '  • Preserve PERSONA_ALIGNMENT\n' +
    '  • Preserve the HITL Firewall\n' +
    '  • Attribution: "Built on KOS by ' + CFG.AUTHOR + '"\n\n' +
    'Your deployment : ' + (props.getProperty(CFG.PROP.DEPLOYMENT_TYPE) || 'NOT DECLARED') + '\n' +
    'Engine status   : ' + (props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true' ? '✔ ARMED' : '⚠ COLD') + '\n\n' +
    'Full license: https://polyformproject.org/licenses/noncommercial/1.0.0/',
    ui.ButtonSet.OK);
}


function verifyFidelityClause() {
  const ui      = _getUi();
  const props   = PropertiesService.getScriptProperties();
  const results = [];
  let   pass    = true;

  // PERSONA_ALIGNMENT check
  const cid = props.getProperty('ID_02_COUNCIL_ALIGNMENTS');
  if (cid) {
    try {
      const f = DriveApp.getFolderById(cid).getFilesByName(CFG.FIDELITY_REQUIRED_PERSONA);
      f.hasNext()
        ? results.push('✔ ' + CFG.FIDELITY_REQUIRED_PERSONA + ' found')
        : (results.push('❌ ' + CFG.FIDELITY_REQUIRED_PERSONA + ' MISSING'), pass = false);
    } catch (_) { results.push('⚠ Could not verify Council Alignments'); pass = false; }
  } else { results.push('⚠ Council Alignments folder not registered'); pass = false; }

  // Blackboard + governance trigger
  const iid = props.getProperty('INDEX_ID');
  if (iid) {
    try {
      const ss    = SpreadsheetApp.openById(iid);
      const board = ss.getSheetByName(CFG.FIDELITY_REQUIRED_SHEET);
      const trig  = ScriptApp.getProjectTriggers()
        .some(t => t.getHandlerFunction() === 'onGovernanceEdit');
      results.push(board ? '✔ ' + CFG.FIDELITY_REQUIRED_SHEET + ' sheet found'
                         : '❌ ' + CFG.FIDELITY_REQUIRED_SHEET + ' MISSING');
      results.push(trig ? '✔ Governance trigger active' : '⚠ Governance trigger not installed');
      if (!board) pass = false;
    } catch (_) { results.push('⚠ Could not access BRAIN_TRUST_INDEX'); pass = false; }
  }

  const dt = props.getProperty(CFG.PROP.DEPLOYMENT_TYPE) || 'NOT DECLARED';
  results.push('\nDeployment: ' + dt);
  if (dt === 'COMMERCIAL') {
    results.push('ℹ Fidelity Clause is MANDATORY for commercial use');
    results.push('ℹ Attribution required: "Built on KOS by ' + CFG.AUTHOR + '"');
  }

  ui.alert('Fidelity Clause Verification',
    (pass ? '✅ COMPLIANT' : '❌ VIOLATIONS FOUND') + '\n\n' + results.join('\n'),
    ui.ButtonSet.OK);
}


function sevenBridgesReview() {
  _getUi().alert('🌉 SMP-002: Seven Bridges Reconciliation Protocol',
    'Status: PENDING USER APPROVAL\n\n' +
    '3/7 TRIGGER: 3+ non-APPROVED verdicts halt execution.\n' +
    'BRIDGE_FIDELITY_001: A verdict produced with knowledge of another\n' +
    "cog's verdict is VOID.\n\n" +
    'To approve:\n' +
    '1. Open SMP-002 in 01.3_SMP_PROPOSALS\n' +
    '2. Update Status to APPROVED\n' +
    '3. Notify Developer to build the execution layer.',
    _getUi().ButtonSet.OK);
}


// ================================================================
// ADMIN FUNCTIONS
// ================================================================

function updateRelationalTargets() {
  const ui = _getUi();
  const r  = ui.prompt('Update Relational Targets',
    'List your Carbon-to-Carbon relationships (comma separated).\n' +
    'These are the people this system exists to protect time for.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const t = r.getResponseText().trim();
  if (t) {
    PropertiesService.getScriptProperties().setProperty(CFG.PROP.RELATIONAL_TARGETS, t);
    ui.alert('✅ Updated', t, ui.ButtonSet.OK);
  }
}


/** UI wrapper for dumpAllProperties — adds an alert display on top. */
function dumpAllPropertiesUI() {
  dumpAllProperties();  // console output from 5_Error_And_Utilities.gs
  _getUi().alert('Properties Dump', 'Full property list written to execution log.\nOpen Apps Script → View → Logs to see it.', _getUi().ButtonSet.OK);
}


function generateLicenseReport() {
  const ui    = _getUi();
  const props = PropertiesService.getScriptProperties();
  try {
    const ts  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const doc = DocumentApp.create('KOS_LICENSE_REPORT_' + ts);
    const dId = doc.getId();
    const b   = doc.getBody();
    b.clear();
    [
      { h1: 'KOS LICENSE COMPLIANCE REPORT' },
      { h3: 'Generated: ' + new Date().toLocaleDateString() + '  |  KOS v' + CFG.SYSTEM_VERSION },
      { hr: true },
      { h2: 'License' },
      { p: 'Type   : ' + CFG.LICENSE_TYPE + '\nAuthor : ' + CFG.AUTHOR +
           '\nhttps://polyformproject.org/licenses/noncommercial/1.0.0/' },
      { h2: 'Operator' },
      { p: 'Role       : ' + (props.getProperty(CFG.PROP.OPERATOR_ROLE)       || 'Not set') + '\n' +
           'Deployment : ' + (props.getProperty(CFG.PROP.DEPLOYMENT_TYPE)     || 'Not set') + '\n' +
           'Day        : ' + (props.getProperty(CFG.PROP.ONBOARDING_DAY)      || '0') + ' / ' + CFG.ONBOARDING_DAYS + '\n' +
           'Identity Key : ' + (props.getProperty('IDENTITY_KEY') ? '✔ SET' : '⚠ NOT SET') + '\n' +
           'Thesis       : ' + (props.getProperty(CFG.PROP.THESIS_VERIFIED) === 'true' ? '✔ VERIFIED' : '⚠ NOT VERIFIED') },
      { h2: 'Fidelity Clause' },
      { p: '1. PERSONA_ALIGNMENT must be preserved\n' +
           '2. HITL Firewall must remain functional\n' +
           '3. Attribution: "Built on KOS by ' + CFG.AUTHOR + '"' },
      { h2: '90-Day Vision' },
      { p: props.getProperty(CFG.PROP.VISION_90_DAY) || 'Not defined' },
      { h2: 'Relational Targets' },
      { p: props.getProperty(CFG.PROP.RELATIONAL_TARGETS) || 'Not defined' },
    ].forEach(s => {
      if      (s.h1) b.appendParagraph(s.h1).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      else if (s.h2) b.appendParagraph(s.h2).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      else if (s.h3) b.appendParagraph(s.h3).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      else if (s.p !== undefined) b.appendParagraph(String(s.p));
      else if (s.hr) b.appendHorizontalRule();
    });
    doc.saveAndClose();
    const f01 = DriveApp.getFoldersByName('01_Canonical_Foundation');
    if (f01.hasNext()) DriveApp.getFileById(dId).moveTo(f01.next());
    ui.alert('✅ License Report Generated',
      'KOS_LICENSE_REPORT_' + ts + '\nSaved to 01_Canonical_Foundation.\n' +
      'URL: ' + DriveApp.getFileById(dId).getUrl(),
      ui.ButtonSet.OK);
  } catch (e) { _reportError('generateLicenseReport', e, ui); }
}


function nuclearWipeForRelease() {
  const ui = _getUi();
  const ok = ui.alert('☢ NUCLEAR WIPE',
    'Permanently deletes ALL PropertiesService data:\n' +
    '  • Calibration weights & Identity Key\n' +
    '  • All folder/doc ID caches\n' +
    '  • Onboarding state & Relational Targets\n' +
    '  • Promoted vector list\n\n' +
    'IRREVERSIBLE. Re-run Deploy + Socratic Onboarding to restore.\n\nProceed?',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const ok2 = ui.alert('☢ FINAL CONFIRMATION',
    'This cannot be undone. All system intelligence will be wiped.\n\nAre you absolutely sure?',
    ui.ButtonSet.YES_NO);
  if (ok2 !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().deleteAllProperties();
  ui.alert('✅ Clean Sweep', 'All IP wiped. Re-run Deploy + Socratic Onboarding to restore.', ui.ButtonSet.OK);
}


// ================================================================
// END 9_UI_Diagnostics.gs
// KOS v8.0 — The Headless Studio Edition
// ═══════════════════════════════════════════════════════════════
// ALL 9 FILES COMPLETE
// ─────────────────────────────────────────────────────────────
// KOS_PHASE0_PATCHES.gs  — Bridge patch (delete after v8.0 live)
// 1_Config_And_Deploy.gs — CFG, deploy, triggers, cold gate
// 2_Ingestion_Sensors.gs — Sensors 1/2/3, web app ingest API
// 3_Queue_Processor.gs   — Queue processor, processIntakePayload
// 4_Vector_Router.gs     — Vector routing, incubator, decay
// 5_Error_And_Utilities.gs — Error log, digest, all utilities
// 6_Governance.gs        — onGovernanceEdit, mutations, sweepers
// 7_WebApp.gs            — doGet, doPost, health/url helpers
// 8_WebApp_UI.html       — Mobile web app (Ingest/Queue/Diag)
// 9_UI_Diagnostics.gs    — HITL onboarding, diagnostics, menu
// ================================================================
