/**
 * Phase 3 of the process-hardening sprint (meta/PROCESS_HARDENING_SPRINT.md)
 * — self-reports this project's live version to the KOS repo so drift
 * between "what git expects" and "what's actually live" gets caught
 * without a human having to remember to check.
 *
 * WHY THIS PUSHES INSTEAD OF BEING POLLED: this project deploys with
 * webapp.access: MYSELF (appsscript.json) — an unauthenticated external
 * request never reaches doGet()/doPost() at all, it hits Google's own
 * sign-in wall first. Polling would need a production Google credential
 * in CI, which the repo's sandbox-deploy fence deliberately keeps out.
 * This project already runs as a fully trusted context for itself, so it
 * can call OUT with no Google credential at all — just a GitHub token it
 * holds, authorizing exactly one thing (see below).
 *
 * ONE-TIME SETUP (Script Property, never hardcoded):
 *   DEPLOY_DRIFT_GITHUB_TOKEN = a fine-grained GitHub personal access
 *   token scoped to ONLY the adamberneche-afk/KOS repo, with the minimum
 *   permission the "Create a repository dispatch event" API endpoint
 *   requires — never a broad classic `repo`-scope token, and never
 *   Contents/workflow-editing permission (see
 *   tools/deploy-drift/README.md's threat-model section for exactly why:
 *   a leaked broadly-scoped token is a path to this repo's OTHER secrets,
 *   a leaked narrowly-scoped one is just noise). Deliberately the SAME
 *   unprefixed property name leader-hub and all 7 cas-ccps projects use
 *   for this (see CFG.PROP.DEPLOY_DRIFT_GITHUB_TOKEN's own comment in
 *   1_Config_And_Deploy.gs for why this one key breaks kos-personal's own
 *   KOS_-prefix convention on purpose) — one property name to set across
 *   every project, not kos-personal as the one exception. Until this
 *   Script Property is set, reportDeployVersion() logs and returns false
 *   — same fail-closed-to-a-no-op shape _sendChatAlert() already uses for
 *   its own optional webhook, not a fail-open default.
 *
 * Installed as its own low-frequency trigger (setupAllTriggers(),
 * 1_Config_And_Deploy.gs) — independent of any other trigger's cadence or
 * error handling, since a bug here should never affect anything else this
 * project does.
 */
function reportDeployVersion() {
  return _reportDeployVersion_('kos-personal', KOS_DEPLOY_VERSION_SHA);
}

// ===== BEGIN deploy-version report: generated from shared/deploy-report/deploy-version-report.js by tools/flow-harness-sync/sync-deploy-report.js. Edit there, then run it. =====
// The deploy-version report every Apps Script project sends (process-hardening
// sprint Phase 3; structure audit 3.8, 2026-11-21: one copy instead of three).
// THE CANONICAL SOURCE. tools/flow-harness-sync/sync-deploy-report.js copies
// it, between its BEGIN and END lines, into cas-ccps/scripts/00_SharedConfig.js,
// kos-personal/17_DeployVersionReport.gs and leader-hub/DeployVersionReport.gs,
// filling DEPLOY_PROJECT_SCOPES from every project's manifest. Edit this file
// and run the sync; never edit a copy (a test fails when one differs).
//
// Each project's own marker file holds its stamped SHA and calls
// _reportDeployVersion_('<project-map key>', sha) from its public
// reportDeployVersion(); tools/deploy-drift/README.md has the mechanism, why
// it pushes instead of being polled, and the threat model behind the token.
//
// ONE-TIME SETUP per project: Script Properties → DEPLOY_DRIFT_GITHUB_TOKEN (a
// fine-grained GitHub PAT scoped to only adamberneche-afk/KOS, the minimum
// permission "Create a repository dispatch event" needs — never a broad
// classic repo-scope token, never Contents/workflow-editing permission).
// Until it's set, the report logs and returns false: it fails closed to a
// no-op, not open.
//
// Since 2026-11-19 it first checks the project's permissions
// (_deployPermissionGaps_) and, after reporting, throws when one is missing:
// a red run in the editor, and a failure email from the 6-hour trigger. The
// Student Dashboard's Slides scope was in its manifest but never granted, and
// a student's Submit failed; since 2026-11-21 every project checks this, not
// only cas-ccps.
function _reportDeployVersion_(projectName, sha) {
  const missing = _deployPermissionGaps_(projectName);
  const reported = _sendDeployVersionReport_(projectName, sha);
  if (missing.length) {
    throw new Error('[DeployVersionReport] ' + projectName + ' is missing ' +
      (missing.length === 1 ? 'a permission' : missing.length + ' permissions') + ': ' + missing.join(', ') + '. ' +
      'Check the project\'s Overview, "Project OAuth Scopes": if one is not listed, push first (run.js). ' +
      'If they are all listed, remove this project\'s access at myaccount.google.com/connections, ' +
      'then run reportDeployVersion again and approve every permission Google asks for.');
  }
  return reported;
}

// Each project's oauthScopes, from its manifest (tools/gas-lint/project-map.json's
// "manifest"), without the "https://www.googleapis.com/auth/" prefix. Written
// by the sync from the manifests: edit a manifest and run it.
const DEPLOY_PROJECT_SCOPES = {
  'kos-personal': ['drive', 'spreadsheets', 'documents', 'script.scriptapp', 'script.send_mail', 'userinfo.email', 'script.external_request'],
  'cas-ccps:central-ledger': ['spreadsheets', 'drive', 'documents', 'presentations', 'script.send_mail', 'userinfo.email', 'script.scriptapp', 'script.external_request'],
  'cas-ccps:unified-manual': ['drive', 'spreadsheets', 'documents', 'forms', 'userinfo.email', 'script.external_request', 'script.scriptapp'],
  'cas-ccps:master-student-template': ['spreadsheets', 'documents', 'userinfo.email', 'script.external_request', 'script.scriptapp', 'drive.readonly'],
  'cas-ccps:rubric-response-sheet': ['spreadsheets', 'drive', 'documents', 'script.send_mail', 'script.external_request', 'script.scriptapp'],
  'cas-ccps:teacher-matrix-sheet': ['spreadsheets', 'script.send_mail', 'script.scriptapp', 'script.external_request'],
  'cas-ccps:teacher-dashboard': ['spreadsheets', 'drive', 'documents', 'presentations', 'script.scriptapp', 'userinfo.email', 'script.external_request'],
  'cas-ccps:student-dashboard': ['spreadsheets', 'documents', 'forms', 'presentations', 'userinfo.email', 'script.external_request', 'script.scriptapp'],
  'cas-ccps:family-sentinel': ['gmail.modify', 'spreadsheets', 'documents', 'userinfo.email', 'script.scriptapp', 'script.external_request'],
  'leader-hub:app': ['script.send_mail', 'drive', 'documents', 'spreadsheets', 'userinfo.email', 'openid', 'script.external_request', 'script.scriptapp'],
};

// One call per scope that throws "You do not have permission to call …"
// when the account running it hasn't granted that scope, and does nothing
// else: an open of an ID that doesn't exist fails "not found" once the scope
// is granted. Found by name (globalThis), because this block is in every project and
// a project may only name the services its manifest lists (gas-lint); a
// probe runs only for a scope the project lists. Not probed: userinfo.email
// (Session gives "" rather than failing), script.external_request (the
// report itself uses it), gmail.modify (no read-only call to make).
// 2026-11-19: the Student Dashboard's Slides scope was in its manifest but
// not granted, Google never asked, and a student's Submit failed
// SLIDES_UNREADABLE.
const DEPLOY_SCOPE_PROBES = {
  'spreadsheets': ['SpreadsheetApp', 'openById', true],
  'documents': ['DocumentApp', 'openById', true],
  'forms': ['FormApp', 'openById', true],
  'presentations': ['SlidesApp', 'openById', true],
  'drive': ['DriveApp', 'getFileById', true],
  'drive.readonly': ['DriveApp', 'getFileById', true],
  'script.send_mail': ['MailApp', 'getRemainingDailyQuota', false],
  'script.scriptapp': ['ScriptApp', 'getProjectTriggers', false],
};
const DEPLOY_PROBE_FILE_ID = 'kos-permission-probe-no-such-file';
const DEPLOY_PERMISSION_DENIED = /You do not have permission to call |Required permissions: https:\/\//;

// The scopes the project lists that the running account can't use, as
// "presentations (SlidesApp)"; logs one line either way.
function _deployPermissionGaps_(projectName) {
  const scopes = DEPLOY_PROJECT_SCOPES[projectName] || [];
  const missing = [], checked = [];
  scopes.forEach(function (scope) {
    const probe = DEPLOY_SCOPE_PROBES[scope];
    if (!probe) return;
    const service = globalThis[probe[0]];
    if (!service || typeof service[probe[1]] !== 'function') return;
    checked.push(scope);
    try {
      if (probe[2]) service[probe[1]](DEPLOY_PROBE_FILE_ID);
      else service[probe[1]]();
    } catch (e) {
      if (DEPLOY_PERMISSION_DENIED.test(String(e && e.message))) missing.push(scope + ' (' + probe[0] + ')');
    }
  });
  if (missing.length) console.error('[DeployVersionReport] Permissions MISSING for ' + projectName + ': ' + missing.join(', '));
  else console.log('[DeployVersionReport] Permissions OK for ' + projectName + ': ' + checked.join(', '));
  return missing;
}

function _sendDeployVersionReport_(projectName, sha) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty('DEPLOY_DRIFT_GITHUB_TOKEN');
    if (!token) {
      console.log('[DeployVersionReport] No DEPLOY_DRIFT_GITHUB_TOKEN configured for ' + projectName + ' — skipping (not an error; this project just isn\'t wired into deploy-drift yet).');
      return false;
    }

    const payload = {
      event_type: 'gas-version-report',
      client_payload: {
        // Must exactly match this project's key in tools/gas-lint/project-map.json.
        project: projectName,
        sha: sha,
        reportedAt: new Date().toISOString(),
      },
    };

    const resp = UrlFetchApp.fetch('https://api.github.com/repos/adamberneche-afk/KOS/dispatches', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': projectName + '-deploy-version-report',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = resp.getResponseCode();
    if (code !== 204) {
      console.error('[DeployVersionReport] Unexpected response ' + code + ' for ' + projectName + ': ' + resp.getContentText());
      return false;
    }
    console.log('[DeployVersionReport] Reported ' + projectName + ' @ ' + sha + ' successfully.');
    return true;
  } catch (e) {
    console.error('[DeployVersionReport] Failed to report ' + projectName + ': ' + e.message);
    return false;
  }
}

// The 6-hourly trigger for reportDeployVersion, installed idempotently. Each
// project's public installDeployVersionReportTrigger() guards its caller as
// that project does (a web app's, with requireScriptOwner_), then calls this;
// kos-personal installs it in setupAllTriggers() instead.
function _installDeployVersionReportTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'reportDeployVersion') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('reportDeployVersion').timeBased().everyHours(6).create();
  console.log('[DeployVersionReport] Trigger installed: reportDeployVersion, every 6 hours.');
}
// ===== END deploy-version report =====
