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
//     runPromotionCheck()              → 4_Vector_Router.gs
//     sendDailyErrorReport()          → 5_Error_And_Utilities.gs
//     archiveStagingPipeline()        → 5_Error_And_Utilities.gs
//     triggerCouncilSimulation()      → 6_Governance.gs
//     deployFullSystem()              → 1_Config_And_Deploy.gs
// ================================================================


/**
 * Serves the web app HTML to GET requests.
 * The HTML file must be named "8_WebApp_UI" in the GAS project
 * (the .html extension is implicit in GAS file naming).
 *
 * @param  {GoogleAppsScript.Events.DoGet} e
 * @returns {HtmlOutput}
 */
function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile('8_WebApp_UI')
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
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return 'URL unavailable — deploy as web app first.';
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
// ================================================================
