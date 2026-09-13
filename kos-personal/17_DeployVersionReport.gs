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
 * ONE-TIME SETUP (Script Properties, same convention as
 * KOS_WEBHOOK_SHARED_SECRET/KOS_OWNER_EMAIL — never hardcoded):
 *   KOS_DEPLOY_DRIFT_GITHUB_TOKEN = a fine-grained GitHub personal access
 *   token scoped to ONLY the adamberneche-afk/KOS repo, with the minimum
 *   permission the "Create a repository dispatch event" API endpoint
 *   requires — never a broad classic `repo`-scope token, and never
 *   Contents/workflow-editing permission (see
 *   tools/deploy-drift/README.md's threat-model section for exactly why:
 *   a leaked broadly-scoped token is a path to this repo's OTHER secrets,
 *   a leaked narrowly-scoped one is just noise). Until this Script
 *   Property is set, reportDeployVersion() logs and returns false — same
 *   fail-closed-to-a-no-op shape _sendChatAlert() already uses for its
 *   own optional webhook, not a fail-open default.
 *
 * Installed as its own low-frequency trigger (setupAllTriggers(),
 * 1_Config_And_Deploy.gs) — independent of any other trigger's cadence or
 * error handling, since a bug here should never affect anything else this
 * project does.
 */
function reportDeployVersion() {
  try {
    const token = PropertiesService.getScriptProperties()
      .getProperty(CFG.PROP.DEPLOY_DRIFT_GITHUB_TOKEN);
    if (!token) {
      console.log('[DeployVersionReport] No KOS_DEPLOY_DRIFT_GITHUB_TOKEN configured — skipping (not an error; this project just isn\'t wired into deploy-drift yet).');
      return false;
    }

    const payload = {
      event_type: 'gas-version-report',
      client_payload: {
        project: 'kos-personal',
        sha: KOS_DEPLOY_VERSION_SHA,
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
        // GitHub's API rejects requests with no User-Agent at all —
        // any identifying string satisfies it, this one just says what
        // sent it.
        'User-Agent': 'kos-personal-deploy-version-report',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = resp.getResponseCode();
    if (code !== 204) {
      console.error('[DeployVersionReport] Unexpected response ' + code + ': ' + resp.getContentText());
      return false;
    }
    console.log('[DeployVersionReport] Reported ' + KOS_DEPLOY_VERSION_SHA + ' successfully.');
    return true;
  } catch (e) {
    console.error('[DeployVersionReport] Failed to report: ' + e.message);
    return false;
  }
}
