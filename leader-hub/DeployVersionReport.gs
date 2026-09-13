/**
 * Phase 3 of the process-hardening sprint (meta/PROCESS_HARDENING_SPRINT.md)
 * — self-reports this project's live version to the KOS repo so drift
 * between "what git expects" and "what's actually live" gets caught
 * without a human having to remember to check.
 *
 * Prototyped first against kos-personal, moved here instead — see
 * meta/PROCESS_HARDENING_SPRINT.md's Phase 3a for why. Identical shape to
 * kos-personal/17_DeployVersionReport.gs; see that file's header for the
 * full "why push instead of poll" reasoning (this project's own
 * webapp.access: DOMAIN sits behind the same Google sign-in wall).
 *
 * ONE-TIME SETUP:
 *   1. Script Properties → add DEPLOY_DRIFT_GITHUB_TOKEN = a fine-grained
 *      GitHub personal access token scoped to ONLY adamberneche-afk/KOS,
 *      minimum permission the "Create a repository dispatch event" API
 *      needs — never a broad classic `repo`-scope token, never Contents/
 *      workflow-editing permission (tools/deploy-drift/README.md's threat
 *      model explains exactly why). Until this is set, reportDeployVersion()
 *      logs and returns false — fails closed to a no-op, not open.
 *   2. Run installDeployVersionReportTrigger() ONCE from the Apps Script
 *      editor's function dropdown (this project has no bulk trigger
 *      installer the way kos-personal's setupAllTriggers() is — a single
 *      dedicated install call is the simplest fit here). Idempotent: safe
 *      to re-run, it removes any existing copy of this trigger first.
 */
function reportDeployVersion() {
  try {
    const token = PropertiesService.getScriptProperties().getProperty('DEPLOY_DRIFT_GITHUB_TOKEN');
    if (!token) {
      console.log('[DeployVersionReport] No DEPLOY_DRIFT_GITHUB_TOKEN configured — skipping (not an error; this project just isn\'t wired into deploy-drift yet).');
      return false;
    }

    const payload = {
      event_type: 'gas-version-report',
      client_payload: {
        // Must exactly match this project's key in tools/gas-lint/project-map.json.
        project: 'leader-hub:app',
        sha: LH_DEPLOY_VERSION_SHA,
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
        'User-Agent': 'leader-hub-deploy-version-report',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = resp.getResponseCode();
    if (code !== 204) {
      console.error('[DeployVersionReport] Unexpected response ' + code + ': ' + resp.getContentText());
      return false;
    }
    console.log('[DeployVersionReport] Reported ' + LH_DEPLOY_VERSION_SHA + ' successfully.');
    return true;
  } catch (e) {
    console.error('[DeployVersionReport] Failed to report: ' + e.message);
    return false;
  }
}

/**
 * One-time (idempotent) installer — this project has no bulk trigger
 * setup function to fold into, unlike kos-personal's setupAllTriggers().
 * Run manually from the Apps Script editor after setting
 * DEPLOY_DRIFT_GITHUB_TOKEN (see this file's header).
 */
function installDeployVersionReportTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'reportDeployVersion') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('reportDeployVersion').timeBased().everyHours(6).create();
  console.log('[DeployVersionReport] Trigger installed: reportDeployVersion, every 6 hours.');
}
