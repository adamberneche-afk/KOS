// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 7 of 8: Web App Server
// ================================================================
//
// This file contains the two GAS entry points for the web app
// deployment (doGet + doPost) and a thin routing layer for the
// HTML client to call. All actual business logic lives in the
// other numbered files — this file only routes and validates.
//
// DEPLOY AS WEB APP
// ─────────────────────────────────────────────────────────────
// Apps Script → Deploy → New Deployment
//   Type       : Web app
//   Execute as : Me (so server functions can access Drive)
//   Who has access: Anyone with Google account  (or Anyone)
// Copy the deployment URL — this is your web app and your
// Sensor 2 (COG_EXHAUST) webhook endpoint.
//
// SENSOR 2 WEBHOOK USAGE
// ─────────────────────────────────────────────────────────────
// POST {webAppUrl}
//   Content-Type: application/json
//   Body: {
//     "cog_name":      "ARCHITECT",
//     "task_id":       "TASK-001",
//     "verdict":       "APPROVED",
//     "artifact_text": "Full verdict text here…"
//   }
// Response: { success, uid?, docUrl?, message }
//
// FUNCTIONS CALLABLE VIA google.script.run
// ─────────────────────────────────────────────────────────────
// These are defined in other files but accessible to the HTML
// client because all GAS project files share one execution scope:
//
//   Ingest tab:
//     submitSessionLog(text)          → 2_Ingestion_Sensors.gs
//     submitExternalData(text, title) → 2_Ingestion_Sensors.gs
//
//   Queue tab:
//     getQueueStatus()                → 3_Queue_Processor.gs
//
//   Diagnostics tab:
//     getVectorState()                → 4_Vector_Router.gs
//     runPromotionCheck()             → 4_Vector_Router.gs
//     sendDailyErrorReport()          → 5_Error_And_Utilities.gs
//     archiveStagingPipeline()        → 5_Error_And_Utilities.gs
//     triggerCouncilSimulation()      → 6_Governance.gs
//     deployFullSystem()              → 1_Config_And_Deploy.gs
// ================================================================


/**
 * Routes GET requests to the correct UI mode based on system state.
 *
 * Three modes, checked in order:
 *   BOOTSTRAP   No BRAIN_TRUST_INDEX exists yet. Show the one-tap
 *               deploy screen. Calling executeBootstrap() advances
 *               this to ONBOARDING.
 *
 *   ONBOARDING  System deployed but engine not yet armed. Show the
 *               4-step Socratic calibration form. Calling
 *               completeOnboarding(answers) arms the engine and
 *               advances to OPERATIONAL.
 *
 *   OPERATIONAL Normal 3-tab app (existing behaviour).
 *
 * Mode is injected as a JS constant into the HTML template via
 * the GAS <?= mode ?> template variable — no client-side API
 * call needed to determine which screen to show.
 *
 * @param  {GoogleAppsScript.Events.DoGet} e
 * @returns {HtmlOutput}
 */
function doGet(e) {
  let mode  = 'BOOTSTRAP';
  let title = 'KOS v8.0 — System Setup';
  try {
    const props   = PropertiesService.getScriptProperties();
    const indexId = props.getProperty('INDEX_ID');
    // Ambient Onboarding: system is operational from first deploy.
    // Shadow matrix calibrates passively — no blocking ONBOARDING gate.
    if (indexId) {
      mode  = 'OPERATIONAL';
      title = 'KOS v8.0 — Active Brain Trust';
    }
  } catch (_) {
    mode = 'BOOTSTRAP'; title = 'KOS v8.0 — System Setup';
  }

  const tmpl  = HtmlService.createTemplateFromFile('8_WebApp_UI');
  tmpl.mode   = mode;
  return tmpl.evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}


/**
 * Runs deployFullSystem() server-side from the Bootstrap screen.
 * Idempotent guard: returns an error if INDEX_ID already exists
 * so a double-tap cannot create a duplicate spreadsheet.
 *
 * On success, doGet() will now detect INDEX_ID and route to
 * ONBOARDING mode on the next page load.
 *
 * Called from the web app Bootstrap screen via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .executeBootstrap()
 *
 * @returns {{ success, log?, errors?, message? }}
 */
function executeBootstrap() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('INDEX_ID')) {
    return { success: false, message: 'System already initialized. Reload the page.' };
  }
  try {
    const result = deployFullSystem();
    return { success: result.success, log: result.log, errors: result.errors };
  } catch (e) {
    _reportError('executeBootstrap', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * Completes Socratic Onboarding from the web app form.
 * Equivalent to runSocraticOnboarding() in 9_UI_Diagnostics.gs
 * but runs from web form input rather than ui.prompt dialogs.
 *
 * Sequence:
 *   1. Validates required fields (role, vision, passphrase).
 *   2. Stores all operator properties in PropertiesService.
 *   3. Sets IDENTITY_KEY_SALT to the operator's passphrase.
 *   4. Infers calibration weights from role string.
 *   5. Seeds the CORE_THESIS document with the operator's answers.
 *   6. Derives and stores the Identity Key (NEVER logged).
 *   7. Sets THESIS_VERIFIED = true — engine is now armed.
 *   8. Logs Day 1 to ONBOARDING_TRACKER.
 *
 * On success, the client reloads the page. doGet() detects
 * THESIS_VERIFIED = true and serves OPERATIONAL mode.
 *
 * @param  {Object} answers  Form field values from the web UI:
 *   { deployType, role, audience, vision,
 *     adminGhost, struggle, targets,
 *     passphrase, adminEmail }
 * @returns {{ success, deployType?, message? }}
 */
function completeOnboarding(answers) {
  try {
    if (!answers.role || !answers.vision || !answers.passphrase) {
      return { success: false, message: 'Role, 90-Day Vision, and passphrase are all required.' };
    }

    const props = PropertiesService.getScriptProperties();
    const dt    = ['INDIVIDUAL','EDUCATOR','COMMERCIAL']
      .includes((answers.deployType || '').toUpperCase())
      ? answers.deployType.toUpperCase()
      : 'INDIVIDUAL';

    // ── Operator properties ──────────────────────────────────
    props.setProperty(CFG.PROP.DEPLOYMENT_TYPE,    dt);
    props.setProperty(CFG.PROP.OPERATOR_ROLE,      answers.role       || '');
    props.setProperty(CFG.PROP.OPERATOR_AUDIENCE,  answers.audience   || '');
    props.setProperty(CFG.PROP.ADMIN_GHOST,         answers.adminGhost || '');
    props.setProperty(CFG.PROP.NECESSARY_STRUGGLE,  answers.struggle   || '');
    props.setProperty(CFG.PROP.RELATIONAL_TARGETS,  answers.targets    || '');
    props.setProperty(CFG.PROP.VISION_90_DAY,       answers.vision     || '');

    if (answers.adminEmail && answers.adminEmail.includes('@')) {
      props.setProperty('KOS_ADMIN_EMAIL', answers.adminEmail);
    }

    // ── Identity Key salt (PIVOT 008 — never logged) ─────────
    props.setProperty('IDENTITY_KEY_SALT', answers.passphrase);

    // ── Calibration weights inferred from role ────────────────
    const weights = _inferCalibrationWeights(answers.role);
    Object.entries(weights).forEach(([k, v]) => {
      if (!props.getProperty(k)) props.setProperty(k, String(v));
    });

    // ── Seal the CORE_THESIS document ─────────────────────────
    _seedCoreThesisDoc(answers, dt);

    // ── Derive Identity Key from CORE_THESIS + salt ───────────
    generateIdentityKey();

    // ── Arm the engine ─────────────────────────────────────────
    props.setProperty(CFG.PROP.THESIS_VERIFIED, 'true');
    props.setProperty(CFG.PROP.ONBOARDING_DAY,  '1');
    props.setProperty(CFG.PROP.ONBOARDING_START, new Date().toISOString());

    _logOnboardingDay(1, 'WEB_ONBOARDING_COMPLETE', answers.vision || '');

    return { success: true, deployType: dt };
  } catch (e) {
    _reportError('completeOnboarding', e, null);
    return { success: false, message: e.message };
  }
}


/**
 * Handles webhook POST requests for Sensor 2 (COG_EXHAUST).
 * Validates the JSON body, delegates to handleCogExhaust() in
 * 2_Ingestion_Sensors.gs, and returns a JSON response.
 *
 * Always returns HTTP 200 — success/failure is in the JSON body.
 * GAS ContentService does not support custom status codes.
 *
 * Expected body shape:
 *   { cog_name, task_id, verdict, artifact_text }
 *
 * Optional discriminator: include "type": "COG_EXHAUST" in the
 * body if you need to distinguish this endpoint from future
 * POST types. Current implementation assumes all POSTs are
 * COG_EXHAUST payloads.
 *
 * @param  {GoogleAppsScript.Events.DoPost} e
 * @returns {TextOutput}  JSON response.
 */
function doPost(e) {
  const out = ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.JSON);

  try {
    // Validate that a body exists
    if (!e || !e.postData || !e.postData.contents) {
      out.setContent(JSON.stringify({
        success: false,
        message: 'Empty request body. Expected JSON with cog_name and artifact_text.',
      }));
      return out;
    }

    // Validate Content-Type before attempting JSON.parse
    const ct = (e.postData.type || '').toLowerCase();
    if (!ct.includes('application/json')) {
      out.setContent(JSON.stringify({
        success: false,
        message: 'Expected Content-Type: application/json. Received: ' + (e.postData.type || 'none') +
                 '. Set Content-Type header on your POST request.',
      }));
      return out;
    }

    // Parse JSON body
    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      out.setContent(JSON.stringify({
        success: false,
        message: 'Invalid JSON body: ' + parseErr.message,
      }));
      return out;
    }

    // Basic field validation before delegating
    if (!payload.cog_name || !payload.artifact_text) {
      out.setContent(JSON.stringify({
        success: false,
        message: 'Missing required fields: cog_name and artifact_text are required.',
        received: Object.keys(payload),
      }));
      return out;
    }

    // Delegate to Sensor 2 handler (2_Ingestion_Sensors.gs)
    const result = handleCogExhaust(payload);
    out.setContent(JSON.stringify(result));
    return out;

  } catch (e) {
    _reportError('doPost', e, null);
    out.setContent(JSON.stringify({
      success: false,
      message: 'Server error: ' + e.message,
    }));
    return out;
  }
}


/**
 * Returns the web app's own deployment URL from the current
 * execution context. Useful for displaying the webhook endpoint
 * in the Diagnostics tab.
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .getWebAppUrl()
 *
 * @returns {string}  The deployed web app URL.
 */
function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return 'URL unavailable — deploy as web app first.';
  }
}


/**
 * Returns the URL of the 03.5_INBOUND_SESSIONS Drive folder so
 * the web app can surface a direct link when a payload exceeds
 * the GAS proxy size limit (~250k chars causes HTTP 502).
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .getInboundFolderUrl()
 *
 * @returns {{ url: string, name: string }}
 */
function getInboundFolderUrl() {
  try {
    const id = PropertiesService.getScriptProperties()
                 .getProperty('ID_03_5_INBOUND_SESSIONS');
    if (!id) return { url: null, name: '03.5_INBOUND_SESSIONS' };
    const folder = DriveApp.getFolderById(id);
    return { url: folder.getUrl(), name: folder.getName() };
  } catch (e) {
    return { url: null, name: '03.5_INBOUND_SESSIONS' };
  }
}


/**
 * Returns a system health summary for the Diagnostics tab header.
 * Aggregates key status indicators without hitting Drive or Sheets
 * (properties only — fast, no quota).
 *
 * Called by the web app via:
 *   google.script.run
 *     .withSuccessHandler(fn)
 *     .getSystemHealth()
 *
 * @returns {Object} {
 *   version, engineArmed, onboardingDay, adminEmail,
 *   promotedVectors[], triggersActive
 * }
 */
function getSystemHealth() {
  try {
    const props        = PropertiesService.getScriptProperties();
    const identityKey  = props.getProperty('IDENTITY_KEY');
    const thesisVer    = props.getProperty(CFG.PROP.THESIS_VERIFIED);
    const obDay        = parseInt(props.getProperty(CFG.PROP.ONBOARDING_DAY) || '0');
    const adminEmail   = props.getProperty('KOS_ADMIN_EMAIL') || '';
    const promoted     = JSON.parse(props.getProperty('KOS_PROMOTED_VECTORS') || '[]');
    const engineArmed  = !!identityKey && thesisVer === 'true';

    const triggers     = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

    return {
      success:          true,
      version:          CFG.SYSTEM_VERSION,
      systemName:       CFG.SYSTEM_NAME,
      engineArmed,
      onboardingDay:    obDay,
      onboardingCap:    CFG.ONBOARDING_DAYS,
      adminEmail:       adminEmail ? adminEmail.replace(/(.{3}).*@/, '$1…@') : 'not set',
      promotedVectors:  promoted,
      triggersActive:   triggers.length,
      triggerList:      triggers,
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}


// ================================================================
// END 7_WebApp.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 8_WebApp_UI.html
//
// WEB APP CALLABLE FUNCTIONS (defined in other files, callable here)
//   getShadowMatrixStatus()    → 5_Error_And_Utilities.gs
//   generateDailyPrimer()      → 5_Error_And_Utilities.gs
//   triggerCouncilSimulation() → 6_Governance.gs (now routes to
//                                runSequesteredCouncil for SMP-002)
//   runPromotionCheck()        → 4_Vector_Router.gs
//   getVectorState()           → 4_Vector_Router.gs
//   getQueueStatus()           → 3_Queue_Processor.gs
//   getQueueMetrics()          → 10_Turnstile.gs
// ================================================================
