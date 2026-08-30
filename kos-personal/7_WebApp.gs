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
//   Bootstrap screen:
//     executeBootstrap()              → 1_Config_And_Deploy.gs (alias of deployFullSystem)
//
//   Ingest tab:
//     submitSessionLog(text)          → 2_Ingestion_Sensors.gs
//     submitExternalData(text, title) → 2_Ingestion_Sensors.gs
//     submitCogVerdict(councilId, cogName, status, summary)
//                                      → 2_Ingestion_Sensors.gs
//     getInboundFolderUrl()           → this file
//
//   Queue tab:
//     getQueueMetrics()                → 3_Queue_Processor.gs
//     getQueueStatus()                 → 3_Queue_Processor.gs (legacy shape, still available)
//
//   Diagnostics tab:
//     getVectorState()                → 4_Vector_Router.gs
//     runPromotionCheck()              → 4_Vector_Router.gs
//     getShadowMatrixStatus()         → 5_Error_And_Utilities.gs
//     completeOnboarding(payload)     → 5_Error_And_Utilities.gs
//     sendDailyErrorReport()          → 5_Error_And_Utilities.gs
//     archiveStagingPipeline()        → 5_Error_And_Utilities.gs
//     triggerSevenBridgesReview()     → 6_Governance.gs
//     generateDailyPrimer()           → 6_Governance.gs
//     deployFullSystem()              → 1_Config_And_Deploy.gs
// ================================================================


/**
 * Serves the web app HTML to GET requests.
 * The HTML file must be named "8_WebApp_UI" in the GAS project
 * (the .html extension is implicit in GAS file naming).
 *
 * FIX (reconciliation decision 3): previously used
 * createHtmlOutputFromFile(), which never evaluates the
 * 8_WebApp_UI.html `<?= mode ?>` scriptlet — SERVER_MODE was always
 * the literal string '<?= mode ?>', which doesn't equal 'BOOTSTRAP',
 * so the app always fell through to the OPERATIONAL branch even on a
 * brand-new, undeployed instance. createTemplateFromFile().evaluate()
 * actually substitutes the `mode` variable set below.
 *
 * mode is BOOTSTRAP whenever INDEX_ID isn't set yet — i.e. deployFullSystem()
 * (via executeBootstrap()) has never successfully run. This is the same
 * signal DEPLOYMENT_GUIDE.md's Troubleshooting section already uses
 * ("Web app shows BOOTSTRAP after already deploying" ⇒ INDEX_ID missing).
 *
 * @param  {GoogleAppsScript.Events.DoGet} e
 * @returns {HtmlOutput}
 */
function doGet(e) {
  const indexId  = PropertiesService.getScriptProperties().getProperty('INDEX_ID');
  const template = HtmlService.createTemplateFromFile('8_WebApp_UI');
  template.mode  = indexId ? 'OPERATIONAL' : 'BOOTSTRAP';
  // Cog Verdict form's cog-name datalist (Say/Do Ledger kos-personal
  // finding #1) — sourced from CFG.PERSONAS, not duplicated as a separate
  // hardcoded client-side list, so it can't drift the way the "seven"
  // persona count already has once (see CFG.PERSONAS's own naming note).
  template.personas = CFG.PERSONAS;

  return template.evaluate()
    .setTitle('KOS v8.0 — Active Brain Trust')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
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
  // FIXED: this used to return a bare string in both branches — including
  // the failure branch, whose fallback text ("URL unavailable — deploy as
  // web app first.") is not a URL at all. Since GAS never threw here,
  // 8_WebApp_UI.html's onErr handler could never fire for this failure, so
  // the client treated that fallback string as a real URL: it rendered in
  // the tap-to-copy box, and tapping it produced a "✓ Copied" confirmation
  // for having copied that literal sentence, with no way to recover short
  // of a full reload. Shaped like every other server call the UI consumes.
  try {
    const url = ScriptApp.getService().getUrl();
    return { success: true, url: url };
  } catch (e) {
    return { success: false, message: 'URL unavailable — deploy as web app first.' };
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
      // Empty string (falsy) when unset, not the literal 'not set' — the
      // client's own `res.adminEmail ? ... : ...` branch already renders a
      // "not set" warning icon, but a truthy placeholder string here made
      // that branch unreachable.
      adminEmail:       adminEmail ? _maskEmailLocal_(adminEmail) : '',
      promotedVectors:  promoted,
      triggersActive:   triggers.length,
      triggerList:      triggers,
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Masks an email's local part for display, e.g. "adam@x.com" -> "ada…@x.com".
 * The previous regex (`/(.{3}).*@/`) required a *second* "@" to appear
 * after the first 3 characters, so it silently failed to match — and
 * `.replace()` returned the address completely unmasked — whenever the
 * local part was under 3 characters (e.g. "ab@example.com"). Splitting on
 * the actual "@" handles local parts of any length.
 */
function _maskEmailLocal_(email) {
  const at = email.indexOf('@');
  if (at === -1) return email;
  const local  = email.slice(0, at);
  const domain = email.slice(at);
  return local.slice(0, Math.min(3, local.length)) + '…' + domain;
}


/**
 * Returns the Drive URL of 03.5_INBOUND_SESSIONS — the folder-drop
 * target for large payloads that exceed the web app's direct-paste
 * threshold. Populates the Ingest tab's drop-panel link
 * (reconciliation decision 3).
 *
 * Called by the web app via:
 *   google.script.run.withSuccessHandler(fn).getInboundFolderUrl()
 *
 * @returns {Object} { success, url?, message? }
 */
function getInboundFolderUrl() {
  try {
    const folder = _getSystemAsset(
      CFG.INBOUND_SESSIONS_FOLDER, 'ID_03_5_INBOUND_SESSIONS', true);
    return { success: true, url: folder.getUrl() };
  } catch (e) {
    return { success: false, message: e.message };
  }
}


// ================================================================
// END 7_WebApp.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 8_WebApp_UI.html
// ================================================================
