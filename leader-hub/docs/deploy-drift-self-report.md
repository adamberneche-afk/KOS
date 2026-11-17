# Deploy-drift self-report (process-hardening sprint Phase 3a)

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

`DeployVersionReport.gs` + `DeployVersionMarker.gs` self-report this
project's live version to the KOS repo, so drift between "what git
expects" and "what's actually live" gets caught without anyone having to
remember to check — prototyped first against `kos-personal`, moved here
instead once `kos-personal`'s own Script Properties turned out to be
unavailable for this. See `tools/deploy-drift/README.md` for the full
mechanism (why this pushes instead of being polled, the self-reference
problem the two-file split resolves, the threat model behind the GitHub
token it holds).

`appsscript.json` gained two OAuth scopes for this:
`script.external_request` (the outbound call itself) and `script.scriptapp`
(`installDeployVersionReportTrigger()`'s `ScriptApp.newTrigger()` /
`getProjectTriggers()` calls — this project had no existing trigger of any
kind before this, so neither scope was already covered).

**One-time setup**: Script Properties → add `DEPLOY_DRIFT_GITHUB_TOKEN` (a
fine-grained GitHub PAT scoped to only this repo — see
`tools/deploy-drift/README.md`'s walkthrough), then run
`installDeployVersionReportTrigger()` once from the Apps Script editor's
function dropdown (idempotent — safe to re-run). Until the token is set,
`reportDeployVersion()` logs and no-ops rather than erroring.
