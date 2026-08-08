// ================================================================
// KOS v8.0 — THE HEADLESS STUDIO EDITION
// FILE 7 of 11: Web App Server
// ================================================================
//
// SPRINT CHANGES (integrated)
// ─────────────────────────────────────────────────────────────
// • Callable functions comment block updated with all new
//   functions from Files 10 and 11.
// ================================================================
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
//     getMirrorMatrixStatus()         → 10_KOS_Extensions.gs
//     verifyMirrorVariable(key, val)  → 10_KOS_Extensions.gs
//     initializeKOSFromUI()           → 10_KOS_Extensions.gs
//     getZoneHealth()                 → 10_KOS_Extensions.gs
//     buildSystemPrompt()             → 11_Studio_Prompt_Engine.gs
//     buildSiloPrompt()               → 11_Studio_Prompt_Engine.gs
//     getPromptHealth()               → 11_Studio_Prompt_Engine.gs
// ================================================================


/**
 * Serves the web app HTML to GET requests.
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
 *
 * Always returns HTTP 200 — success/failure is in the JSON body.
 * GAS ContentService does not support custom status codes.
 *
 * Expected body shape:
 *   { cog_name, task_id, verdict, artifact_text }
 */
function doPost(e) {
  const out = ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.JSON);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      out.setContent(JSON.stringify({
        success: false,
        message: 'Empty request body. Expected JSON with cog_name and artifact_text.',
      }));
      return out;
    }

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

    if (!payload.cog_name || !payload.artifact_text) {
      out.setContent(JSON.stringify({
        success: false,
        message: 'Missing required fields: cog_name and artifact_text are required.',
        received: Object.keys(payload),
      }));
      return out;
    }

    const result = handleCogExhaust(payload);
    out.setContent(JSON.stringify(result));
    return out;

  } catch (err) {
    _reportError('doPost', err, null);
    out.setContent(JSON.stringify({
      success: false,
      message: 'Server error: ' + err.message,
    }));
    return out;
  }
}


/**
 * Returns the web app's own deployment URL.
 * Useful for displaying the webhook endpoint in the Diagnostics tab.
 *
 * @returns {string}
 */
function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (err) {
    return 'URL unavailable — deploy as web app first.';
  }
}


/**
 * Returns a system health summary for the Diagnostics tab header.
 * Reads from PropertiesService only — fast, no Drive quota.
 *
 * @returns {Object} {
 *   version, engineArmed, onboardingDay, adminEmail,
 *   promotedVectors[], triggersActive, triggerList[]
 * }
 */
function getSystemHealth() {
  try {
    const props       = PropertiesService.getScriptProperties();
    const identityKey = props.getProperty('IDENTITY_KEY');
    const thesisVer   = props.getProperty(CFG.PROP.THESIS_VERIFIED);
    const obDay       = parseInt(props.getProperty(CFG.PROP.ONBOARDING_DAY) || '0');
    const adminEmail  = props.getProperty('KOS_ADMIN_EMAIL') || '';
    const promoted    = JSON.parse(props.getProperty('KOS_PROMOTED_VECTORS') || '[]');
    const engineArmed = !!identityKey && thesisVer === 'true';
    const triggers    = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

    return {
      success:         true,
      version:         CFG.SYSTEM_VERSION,
      systemName:      CFG.SYSTEM_NAME,
      engineArmed,
      onboardingDay:   obDay,
      onboardingCap:   CFG.ONBOARDING_DAYS,
      adminEmail:      adminEmail ? adminEmail.replace(/(.{3}).*@/, '$1…@') : 'not set',
      promotedVectors: promoted,
      triggersActive:  triggers.length,
      triggerList:     triggers,
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}


/**
 * Returns the URL of the DRIP_QUARANTINE sheet tab for the web app
 * quarantine badge link. Constructs the deep-link URL from the
 * spreadsheet ID and the sheet GID.
 *
 * Called by the web app via:
 *   google.script.run.withSuccessHandler(fn).getQuarantineSheetUrl()
 *
 * @returns {{ success, url? }}
 */
function getQuarantineSheetUrl() {
  try {
    const props   = PropertiesService.getScriptProperties();
    const indexId = props.getProperty('INDEX_ID');
    if (!indexId) return { success: false, message: 'INDEX_ID not set.' };
    const ss      = SpreadsheetApp.openById(indexId);
    const sheet   = ss.getSheetByName('DRIP_QUARANTINE');
    if (!sheet) return { success: false, message: 'DRIP_QUARANTINE sheet not found.' };
    const url = 'https://docs.google.com/spreadsheets/d/' + indexId +
                '/edit#gid=' + sheet.getSheetId();
    return { success: true, url };
  } catch (err) {
    return { success: false, message: err.message };
  }
}


// ================================================================
// END 7_WebApp.gs
// KOS v8.0 — The Headless Studio Edition
// Next file: 8_WebApp_UI.html
// ================================================================
