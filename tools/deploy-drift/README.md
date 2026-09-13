# deploy-drift

Catches the gap between "what git says this GAS project's code should be"
and "what's actually live" — the failure behind Phase 3 of
[`meta/PROCESS_HARDENING_SPRINT.md`](../../meta/PROCESS_HARDENING_SPRINT.md):
a live Apps Script project silently missing a function its own committed
source already had, and separately, genuine uncertainty over whether a
redeploy had actually taken effect.

## Why this pushes instead of polling

The obvious design — something in this repo reads each project's live
state and diffs it against git — only works for one of the 9 GAS projects.
`access: MYSELF`/`DOMAIN` web apps (`kos-personal`, `leader-hub:app`,
`cas-ccps:teacher-dashboard`) sit behind Google's own sign-in wall: an
unauthenticated request never reaches `doGet()` at all, so polling them
would need a production Google credential in CI — deliberately ruled out
(see `tools/clasp-sync/SANDBOX_CI_SETUP.md`'s fence between sandbox and
production credentials; Phase 3 isn't the thing that should erode it). The
6 remaining projects with no web app at all have no inbound surface to
poll regardless. Only `cas-ccps:student-dashboard` (`access: ANYONE`) is
reachable by an anonymous external request.

So the design pushes instead. Apps Script already runs as a fully trusted
execution context for itself — no credential is needed for it to call
*out*. Each project self-reports its own version marker (the commit SHA
git currently expects for that project's files) via `UrlFetchApp` to
GitHub's `repository_dispatch` API, which fires
[`.github/workflows/deploy-drift.yml`](../../.github/workflows/deploy-drift.yml)
immediately. One uniform mechanism for every project, web app or not —
`student-dashboard` doesn't need a special case either, even though it
*could* be polled directly.

## How it works, end to end

1. **`tools/deploy-drift/expected-marker.js`** — pure, no network: given a
   project name, runs `git log` over that project's files (from
   `tools/gas-lint/project-map.json`) and returns the full SHA of the most
   recent commit that touched any of them.
2. **A GAS project reports itself** — a small function
   (`kos-personal/17_DeployVersionReport.gs` is the reference
   implementation) reads its own marker constant and `UrlFetchApp.fetch`es
   `repos/{owner}/{repo}/dispatches` with `{event_type:
   "gas-version-report", client_payload: {project, sha, reportedAt}}`,
   authenticated with a GitHub token it holds in its own Script
   Properties. Runs on its own low-frequency time-based trigger,
   independent of anything else that project does.
3. **`.github/workflows/deploy-drift.yml`** reacts to the
   `repository_dispatch`, passing the payload through `env:` (never
   interpolated into a shell `run:` step — the payload is untrusted the
   moment the reporting token could ever leak) to:
4. **`tools/deploy-drift/check.js`** — validates `project` against the
   real project list and `sha` against a strict 40-hex-char pattern (both
   rejected outright if malformed, never trusted blindly), computes what
   `expected-marker.js` says should be live, and compares. On a match with
   no open tracking issue: no-op. On a match that closes an existing open
   issue: closes it with a resolution comment. On a mismatch: opens or
   updates a pinned `Deploy drift: <project>` issue (label
   `kos-deploy-drift`) naming both the expected and reported SHA.

## The self-reference problem, and why the marker is its own file

A commit can't embed its own SHA — the SHA is a hash of the commit's
content, so "the SHA of the commit that sets this marker" isn't knowable
until after that commit exists. Splitting the marker into its own
dedicated file (`kos-personal/18_DeployVersionMarker.gs`) resolves this:
`expected-marker.js` excludes that one file from its own "what does git
expect" computation (`MARKER_FILE_EXCLUSIONS`), so the value — stamped in
a SEPARATE commit, after a real code change — correctly matches once both
commits have landed. The ritual, every time:

```
1. Commit your real code change(s) normally.
2. node tools/deploy-drift/stamp.js <projectName>
3. Commit ONLY the resulting marker-file change, by itself.
4. clasp push, then clasp deploy -i <id> -V <n> to actually promote it —
   pushing HEAD alone does not update a web app's live /exec deployment
   (tools/clasp-sync/DEPLOYMENT_RUNBOOK.md §3.5-3.6).
```

Skipping step 2/3, or combining them with step 1, both break the match —
by design, this is exactly the kind of slip the whole mechanism exists to
surface, not silently tolerate.

**A deliberate, narrower tradeoff in the `cas-ccps` marker files
specifically:** `kos-personal`/`leader-hub`'s marker files hold *only*
the SHA constant — every line of real reporting logic lives in a
separate, fully-tracked file. `cas-ccps`'s 7 marker+wrapper files (e.g.
`43_DeployVersionMarker_CentralLedger.js`) also carry the thin
`reportDeployVersion()` wrapper and `installDeployVersionReportTrigger()`
— both excluded from `expected-marker.js`'s computation along with the
constant, since they're in the same file. A future edit to either
wouldn't register as a "real" code change for that project's drift
check. Accepted deliberately, not missed: the logic that actually matters
(`_reportDeployVersion_()`'s `UrlFetchApp` call, error handling, payload
shape) lives once in `00_SharedConfig.js`, fully tracked and drift-checked
normally — only a one-time installer and a 3-line wrapper are exempted,
and neither is expected to need a second edit once written.

## Wiring up a new project (one-time, per project — needs you, not this session)

Nothing past step 1 below can be done from an agent session: SMP-004
means `clasp push`/`clasp deploy` is always a human's action, and
generating a credential is inherently something only you can do.

1. **Create a fine-grained GitHub personal access token**: scoped to
   *only* `adamberneche-afk/KOS`, with **Contents: Read and write**
   (GitHub's mobile UI labels this "Read and write access to code") —
   confirmed live against `leader-hub`'s first real report, which 403'd
   with `Resource not accessible by personal access token` until this
   permission was added. **Never** a broad classic `repo`-scope token,
   and **never** workflow-editing permission — see the threat model below
   for exactly why that distinction matters.
2. **kos-personal / leader-hub shape** (one project, one dedicated file
   pair): add a `MARKER_FILES` entry in `tools/deploy-drift/stamp.js`, a
   marker file matching `kos-personal/18_DeployVersionMarker.gs`'s shape,
   a reporting function matching `kos-personal/17_DeployVersionReport.gs`'s
   shape wired to its own low-frequency trigger, and a
   `MARKER_FILE_EXCLUSIONS` entry in `expected-marker.js`.
   **cas-ccps shape** (many projects sharing `00_SharedConfig.js`): the
   actual `UrlFetchApp`/token logic lives ONCE, in
   `00_SharedConfig.js`'s `_reportDeployVersion_(projectName, sha)` — a
   new project just needs its own tiny marker+wrapper file (see
   `cas-ccps/scripts/43_DeployVersionMarker_CentralLedger.js` for the
   reference shape) calling into that shared function, plus the same
   `MARKER_FILES`/`MARKER_FILE_EXCLUSIONS` entries as above.
3. **Paste the token into that project's Script Properties** as
   `DEPLOY_DRIFT_GITHUB_TOKEN` (Project Settings → Script Properties) —
   never committed, never handled by this session, same convention as
   every other secret this repo already uses (`KOS_WEBHOOK_SHARED_SECRET`,
   `KOS_OWNER_EMAIL`). The same token value can be reused across every
   project that needs one — it's scoped to the repo, not to any one GAS
   project, so one token generated once covers all of them.
4. If the project doesn't already carry `script.external_request` (the
   outbound call) and `script.scriptapp` (installing the trigger) OAuth
   scopes, add them to that project's manifest and re-consent on next
   deploy.
5. **For a project whose `.claspignore` is allowlist-style** (`**/**`
   then explicit `!filename`, like `kos-personal`'s and `leader-hub`'s):
   add the new file(s) there too. Missed once already — the mechanism was
   wired into `project-map.json`, `stamp.js`, and each project's own
   trigger setup, but not `.claspignore`, so `clasp push` silently
   excluded both new files the first time. `cas-ccps` doesn't carry this
   risk: `tools/clasp-sync/sync.js` builds each project's push folder
   directly from `project-map.json`, so there's no second file list to
   remember.
6. `clasp push` + `clasp deploy` as normal — for `cas-ccps`, run
   `node tools/clasp-sync/sync.js <project>` first, then push from
   `cas-ccps/.clasp-build/<project>/`.
7. **Merge to `main` before expecting anything to react.**
   `repository_dispatch` only looks at workflow files on the repo's
   *default* branch — `deploy-drift.yml` sitting on a feature branch is
   invisible to GitHub no matter how correct a project's report is. Learned
   live: `leader-hub`'s first report got a clean `204` from GitHub with
   nothing on the repo side to show for it, because the branch carrying
   `deploy-drift.yml` had never been merged.
8. Run `installDeployVersionReportTrigger()` once from the Apps Script
   editor's function dropdown, then run `reportDeployVersion` directly to
   confirm — a clean execution log (or, once logging was added, a
   "Reported ... successfully" line) means it worked.

## Threat model — what a leaked or misused token could actually do

Two very different worst cases, depending entirely on scope:

- **Minimally scoped** (what this is designed for): noise, not damage. A
  leak or a bug lets someone fire dispatch events at will — spurious
  workflow runs, false or suppressed drift reports. Cannot touch a single
  line of code, a file, a branch, or any other secret in the repo.
- **Broadly scoped** (a classic `repo`-scope PAT, or `Contents: write`/
  workflow-editing permission): genuinely serious. That level of access
  could push commits, delete files, and — the sharp edge — rewrite
  `.github/workflows/*.yml`, which runs automatically with access to this
  repo's *other* secrets (the sandbox clasp credential from
  `tools/clasp-sync/SANDBOX_CI_SETUP.md`). One leak becomes a path to two.

One more fact independent of scope: Apps Script Script Properties are
**not** a write-only secret store the way a GitHub Actions secret is —
they're visible in plaintext to anyone with edit access to that script
project, via Project Settings. The practical exposure is "everyone who can
currently open that project's editor," not "could this token leak in the
abstract." Same property `KOS_WEBHOOK_SHARED_SECRET` already has today —
not a new category of risk, but worth having in view.

This repo is public, which doesn't change any of the above (GitHub Actions
secrets stay protected regardless of visibility) but does mean the
"wasted CI minutes" piece of the minimal-scope worst case costs nothing
(public repos get free Actions minutes), and that the reacting workflow
must never print anything beyond the version-marker payload into its
(public) logs.

## What this deliberately does NOT do

No path exists, anywhere in this design, for the repo, CI, or an agent
session to read a project's *actual* live state or push/deploy into any
project — only for a GAS project to report a version string outward.
SMP-004's air-gap is completely intact: drift, once found, still gets
fixed by a human running a real `clasp push` + `clasp deploy`.

## Testing

- `tests/tools/deploy-drift-expected-marker.test.js` — the git-log
  wrapper, including the marker-file exclusion.
- `tests/tools/deploy-drift-stamp.test.js` — the stamping tool.
- `tests/tools/deploy-drift-check.test.js` — evaluate/publish logic, with
  an injectable `fetchImpl` (same convention `tools/watchdog/check.js`
  already uses) so no test makes a real GitHub API call.
- `tests/kos-personal/deploy-version-report.test.js` /
  `tests/leaderhub/deploy-version-report.test.js` — each project's
  reporting function, with a mocked `UrlFetchApp`.
- `tests/cas-ccps/deploy-version-report.test.js` — the shared
  `_reportDeployVersion_()` in `00_SharedConfig.js` once, then every one
  of the 7 per-project marker+wrapper files, confirming each reports its
  own real `project-map.json` key and its own `DEPLOY_VERSION_SHA` — the
  one thing easy to typo across 7 near-identical files.
