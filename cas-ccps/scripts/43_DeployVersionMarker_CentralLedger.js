/**
 * cas-ccps:central-ledger's deploy-version marker + trigger (process-hardening sprint
 * Phase 3b — meta/PROCESS_HARDENING_SPRINT.md). See
 * 00_SharedConfig.js's _reportDeployVersion_() for the shared reporting
 * logic every cas-ccps project in this rollout calls into, and
 * kos-personal/18_DeployVersionMarker.gs for why the marker lives in its
 * own dedicated, never-shared file — a commit can't embed its own SHA
 * (the SHA is a hash of the commit's content), so it's stamped in a
 * SEPARATE commit, after the fact, by
 * `node tools/deploy-drift/stamp.js cas-ccps:central-ledger`.
 *
 * NEVER hand-edit DEPLOY_VERSION_SHA. Always:
 *   1. Commit your real central-ledger code change(s) normally.
 *   2. node tools/deploy-drift/stamp.js cas-ccps:central-ledger
 *   3. Commit ONLY the resulting change to this file, by itself.
 *   4. node tools/clasp-sync/sync.js central-ledger, then clasp push + clasp
 *      deploy from cas-ccps/.clasp-build/central-ledger/ to actually promote it
 *      (tools/clasp-sync/DEPLOYMENT_RUNBOOK.md §3.5-3.6) — pushing HEAD
 *      alone does not update a live web app's /exec deployment.
 *
 * ONE-TIME SETUP: Script Properties → DEPLOY_DRIFT_GITHUB_TOKEN (a
 * fine-grained GitHub PAT scoped to only adamberneche-afk/KOS — see
 * tools/deploy-drift/README.md), then run
 * installDeployVersionReportTrigger() once from the Apps Script editor.
 */
const DEPLOY_VERSION_SHA = 'c4f793149fa6672cd2cd7ed8f0be9a2eba178beb'; // stamped by tools/deploy-drift/stamp.js — never hand-edit

function reportDeployVersion() {
  return _reportDeployVersion_('cas-ccps:central-ledger', DEPLOY_VERSION_SHA);
}

/**
 * One-time (idempotent) installer — this project has no bulk trigger
 * setup function to fold into. Run manually from the Apps Script
 * editor's function dropdown after setting DEPLOY_DRIFT_GITHUB_TOKEN (see
 * this file's header).
 */
function installDeployVersionReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'reportDeployVersion') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('reportDeployVersion').timeBased().everyHours(6).create();
  console.log('[DeployVersionReport] Trigger installed: reportDeployVersion, every 6 hours.');
}
