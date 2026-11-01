# clasp-sync

Bridges cas-ccps's 9 separate Apps Script projects to
[clasp](https://github.com/google/clasp), Google's own CLI for pushing
local files to a live, bound Apps Script project. See
[`meta/CLASP_AND_APPS_SCRIPT.md`](../../meta/CLASP_AND_APPS_SCRIPT.md) for
why this needed a separate tool at all before reading further.

## The problem this solves

clasp's model is one local folder ↔ one script ID. `kos-personal/`'s main
project and `leader-hub/` fit that model directly — each is a single Apps
Script project already laid out as a flat folder, so clasp can push
straight from the tracked source (see `.clasp.json.template` and
`.claspignore` in each of those two directories). `kos-personal/archive/studio-steps/`
was a second, separate flat-folder project alongside the main one; it is
archived (2026-09-29) and not deployed. (SMP-004 describes that project as
sitting on a personal Google account rather than the district domain; in
practice it is deployed on the same ccpsnet.net account. The project split is
real, the account split is not — see `tools/gas-lint/gcp-map.json`.)

`cas-ccps/scripts/` doesn't fit that model. It's actually **8 separate
bound/standalone Apps Script projects** sharing overlapping files —
`00_SharedConfig.js` alone is pasted into all 8 of them,
`19_ClonedSheetConfig.js` into 3 — and `tools/gas-lint/project-map.json`
is the existing record of exactly which files belong to which project
(gas-lint's duplicate-declaration check depends on this same mapping
being accurate). There's no single folder to point `clasp push` at
without either sending files to a project that doesn't want them, or
missing files a project needs. A 9th project, `cas-ccps/studio-steps/`,
is standalone and shares no files with the other 8, but is still handled
by this same tool under its `cas-ccps:*` scope (it is not deployed:
custom Studio steps are blocked on this account).

`sync.js` reads that same `project-map.json` and, for each of the 9
`cas-ccps:*` projects, generates a throwaway push folder under
`cas-ccps/.clasp-build/<project-name>/` containing exactly that
project's files (flattened to basenames — Apps Script projects are a
flat namespace) plus its `appsscript.json` and `.clasp.json`.
`cas-ccps/scripts/*.js` stays the single source of truth in git; nothing
under `.clasp-build/` is ever hand-edited or committed (it's
`.gitignore`d, and regenerated fresh — `fs.rmSync` clears the old
contents — every run).

## The 9 projects

| Project | Bound to | Files |
|---|---|---|
| `central-ledger` | Central Ledger spreadsheet | 46 |
| `unified-manual` | Assignment System Manual Doc (setup wizard) | 9 |
| `master-student-template` | Master Student Template Doc | 5 |
| `rubric-response-sheet` | Rubric Response Sheet — **cloned per teacher** | 4 |
| `teacher-matrix-sheet` | Teacher Matrix Sheet — **cloned per teacher** | 4 |
| `family-sentinel` | Family Mail Sentinel spreadsheet (the teacher's private sheet) | 4 |
| `teacher-dashboard` | Standalone web app | 13 |
| `student-dashboard` | Standalone web app | 4 |
| `studio-steps` | Standalone — not bound to a spreadsheet/doc (blocked, not deployed) | 9 |

File counts (script files, not the manifest) as of 2026-10-23; `tools/gas-lint/project-map.json` is the authoritative list.

**The two "cloned per teacher" projects don't have one live script ID —
they have one per teacher's copy.** clasp can only meaningfully target
the *master template* those get cloned from; pushing a fix there keeps
future clones current, but doesn't retroactively update a teacher's
already-existing copy (that's a distribution problem this repo already
has, independent of clasp — the existing setup-wizard scripts are what
actually stamp code into a freshly cloned sheet).

## Setup (one-time, per project, needs your real Google account)

This part can't be automated from here — it needs `clasp login` against
your actual Google account, which requires a browser and OAuth consent
this tooling has no access to.

```bash
npm install -g @google/clasp   # if you don't have it yet
clasp login

# For a project that's already live, clone it (pulls the actual current
# code as-is — don't skip this and assume the tracked files already match):
clasp clone <scriptId>

# Only if no live project exists yet for one of the spreadsheet/doc-bound
# projects (the two web apps and studio-steps are --type standalone
# instead — see cas-ccps/studio-steps/README.md):
clasp create --type sheets --title "CAS — Central Ledger" --rootDir .
```

Either command drops a real `.clasp.json` with the live `scriptId` in
your current directory. Take that `scriptId` and put it in the matching
template:

```bash
cp cas-ccps/clasp/templates/central-ledger.clasp.json.template \
   cas-ccps/clasp/local/central-ledger.clasp.json
# edit cas-ccps/clasp/local/central-ledger.clasp.json:
#   - remove the "_comment" key
#   - replace "REPLACE_WITH_REAL_SCRIPT_ID" with the real scriptId
```

`cas-ccps/clasp/local/` is `.gitignore`d — real script IDs never get
committed, the same convention this repo already uses for real Sheet/Doc
IDs (they live in Script Properties, not source).

## Usage

```bash
# Rebuild all 9 project folders
node tools/clasp-sync/sync.js

# Rebuild just one
node tools/clasp-sync/sync.js central-ledger

# Then push whichever ones have a real scriptId configured
cd cas-ccps/.clasp-build/central-ledger && clasp push
```

Running `sync.js` with no real script IDs configured yet is still
useful — it's a way to inspect exactly which files and manifest would go
to each of the 9 projects, with zero Google credentials involved.
The script prints `(no real scriptId yet — ready to inspect, not to
push)` for any project still on the placeholder template.

## Manifests

`cas-ccps/clasp/manifests/<project>.appsscript.json` holds each
project's real manifest — `oauthScopes` derived from
`tools/gas-lint/scope-map.json` against the actual GAS service calls in
that project's files, plus `webapp` `executeAs`/`access` taken from each
file's own header comment where one deploys as a web app.
`unified-manual`'s two extra scopes
(`script.projects`, `script.deployments`) come from
`21_AutoInstaller.js`'s own documented requirements — it calls the Apps
Script API directly via `UrlFetchApp`, which `scope-map.json`'s
automatic derivation doesn't cover (it only maps GAS *global service*
calls like `DriveApp.*`, not raw REST calls to another Google API).

These manifests are now wired into `tools/gas-lint/project-map.json`'s
`manifest` field for each project, so `gas-lint`'s existing OAuth scope
check (Check E) validates them the same way it already validated
`kos-personal/appsscript.json` — run `node tools/gas-lint/check.js`
after changing any cas-ccps script's service usage to catch a scope gap
before it fails silently at runtime.

## What this doesn't do

`sync.js` doesn't run `clasp push` for you, and it doesn't know your real
script IDs — those two steps are inherently manual/credentialed and
outside what CI can reach into. [`run.js`](#runjs--the-whole-push-from-cmdexe)
(below) drives them from the operator's own machine instead. It also doesn't solve
propagating an update to a teacher's already-cloned
`rubric-response-sheet`/`teacher-matrix-sheet` copy — see the table note
above.

## Refuses to build an unmerged project

Before writing any files for a project, this script checks every file
in that project's `_ADDENDUM`-named list for live top-level code
(a function/const/let/var declaration outside of comments). A file
that's still 100% paste-instructions in a comment block — the pattern
`tools/gas-lint/check.js`'s `cfg-key-pending-merge` warning already
flags — means that project's base file is still missing whatever keys
or functions the addendum documents. Building (and potentially pushing)
that project folder anyway would ship that exact broken half-state, so
the script refuses instead: it prints which addendum file(s) are still
unmerged and exits non-zero for the whole run, leaving that project's
`.clasp-build/` folder untouched (from a prior run, or absent).

This doesn't fire on a file like
`16_UnifiedManualSetup_M5_ADDENDUM_v2.js`, which legitimately keeps
live functions shared into its project's global scope (multiple files
can share one GAS project by design — see `project-map.json`'s own
header comment) — only on a file that's genuinely still just notes.
Merge the addendum into its base file, then remove the addendum's entry
from `project-map.json`, to clear the refusal.

It also refuses a project whose `project-map.json` entry lists a file
that isn't on disk. That used to be a warning and a skip, which pushed
the project without the file. `tools/gas-lint` catches the same thing
(`missing-file`) and the reverse, a script file no project lists
(`unmapped-file`), in CI.

This check — plus a plain `node tools/clasp-sync/sync.js` run — is part
of `.github/workflows/gas-lint.yml`'s CI job, alongside gas-lint itself.

## Actually pushing to a live project

This file covers what `sync.js` builds and why. For the actual
command-by-command sequence — `clasp login`, wiring `.clasp.json` files,
building sandbox copies before touching real cas-ccps projects, the CI
job that automates sandbox pushes, and the human-run production-promotion
steps for all three systems in this repo — see
[`DEPLOYMENT_RUNBOOK.md`](./DEPLOYMENT_RUNBOOK.md) (same folder).

## run.js — the whole push from cmd.exe

`run.js` drives the clasp side of a full push across every in-scope
project (kos-personal, leader-hub and the cas-ccps projects; the two
studio-steps projects are out while the GCP block holds). It runs on the
operator's machine, never in CI, from plain `cmd.exe`: it needs only Node
(20 or later) and clasp on `PATH`, and uses Node's built-ins only. It
replaced the PowerShell `run.ps1` on 2026-10-17; `run.ps1` was removed
on 2026-10-29, after `run.js` had pushed live.

It automates the process and leaves two decisions to a human, recorded
once in a **registry** folder that lives *outside* the checkout. The
script reads the registry (it writes only `last-build.json`, below) and
never falls back to `clasp create`:

```
clasp-registry\
  kos-personal\.clasp.json                 which real project (from clasp clone)
  kos-personal\deployments.txt             which deployments stay live
  leader-hub\.clasp.json + deployments.txt
  cas-ccps\teacher-dashboard\.clasp.json + deployments.txt
  cas-ccps\unified-manual\.clasp.json      (push-only: no deployments.txt)
  ...
```

A project missing its `.clasp.json` is skipped, and so is a web app
missing its `deployments.txt`. In that case the script prints the live
deployments so you can fill the file in.

**Web apps are promoted, never redeployed.** For kos-personal, leader-hub,
teacher-dashboard and student-dashboard it runs `clasp push`, then one
`clasp version`, then `clasp update-deployment <id> --versionNumber N` for
each ID in `deployments.txt`. The deployment IDs never change, and so
every `/exec` URL, bookmark, Script Property and leader-hub setting that
holds one stays valid. To roll back, point the deployment at the previous
version number. Live deployments that aren't listed are reported and left
alone, and no version is cut when clasp says the script is already up to
date. The other projects are push-only.

**`--zip`** takes a fresh GitHub "Download ZIP" of main and replaces the
checkout with it before anything runs. A stale folder therefore can't be
pushed, and a file deleted upstream can't linger locally and get pushed
back (`clasp push` mirrors the whole folder). It refuses to delete a folder
that isn't a KOS checkout, a folder your shell is standing in, or one
holding a real `.clasp.json` the registry doesn't have a copy of. It reads
the zip itself, checking every file's CRC and refusing entries that would
land outside the checkout.

Each project prints its deploy-marker SHA before it pushes, and a summary
at the end lists them. `run.js` stamps that marker itself (2026-10-28):
with `--zip` or `--latest`, each build carries the commit its zip was cut
from, or the last push's commit when its code hasn't changed (the
registry's `<project>\last-build.json`; `tools/deploy-drift/README.md`,
"run.js stamps the push"). After the run, reload each editor tab and run
`reportDeployVersion`; it should report the same SHA. `clasp run` can't do
that step for you, because it needs a GCP project.

```
cd C:\Users\<you>\kos
node run.js --latest
node run.js --zip %USERPROFILE%\Downloads\KOS-main.zip --repo-root kos-main
node run.js --repo-root kos-main --only teacher-dashboard,student-dashboard
node run.js --help
```

Keep your working copy of the script next to the registry, not inside
the checkout, because `--zip` deletes the checkout. That also means a new
zip never updates your copy. So before pushing anything, `run.js`
compares itself with the checkout's `tools\clasp-sync\run.js`. If they
differ, it stops and prints the `copy /Y` command that updates it; run
that, then run your command again. `--skip-script-check` runs your copy
anyway, for testing a local edit.

**Flags:** `--zip`, `--latest`, `--head-only`, `--rollback-to`,
`--repo-root`, `--registry`, `--skip-script-check`, `--only`,
`--instructions`. The old PowerShell spellings (`-Zip`, `-Latest`,
`-HeadOnly`, `-RollbackTo`, `-RepoRoot`, `-Registry`, `-SkipScriptCheck`,
`-Only`) work too, in any case, so a command copied from an older note
still runs. `--only a,b`, `--only a --only b` and `--only a b` are the
same. `--rollback-to` takes a version of 1 or more. The exit code is 1 if
any project failed or the stale-copy check stopped the run, otherwise 0.

| Option | What it does |
|---|---|
| `--latest` | Uses the newest `KOS-main*.zip` in the current folder or `~\Downloads` as `--zip`, and prints which one it picked and when it was saved. |
| `--head-only` | Pushes without cutting a version or moving a deployment. Live users keep the current version; test the new code at the printed `/dev` link. Push-only projects have no such buffer and are pushed as normal. |
| `--skip-script-check` | Runs this copy of `run.js` even though it differs from the checkout's. |
| `--rollback-to <n>` | Points every deployment in `deployments.txt` back to version *n*, pushing nothing. Takes exactly one web app in `--only`. A promote run prints the version it replaced. |

A release run after a `--head-only` test still releases. clasp reports the
code as "already up to date", but the script checks each deployment's
description (it writes `<marker> v<n>` on every promote) and cuts a
version from HEAD if any deployment isn't on the current marker yet.

The summary ends with each project's editor link and its `/exec` or
`/dev` links.

```
node run.js --latest --head-only --only leader-hub   # try a fix without touching users
node run.js --latest --only leader-hub               # release it
node run.js --rollback-to 6 --only leader-hub        # undo the release
```

**Tested on Windows in CI** (2026-11-01): `.github/workflows/run-js-windows.yml`
runs `tests/tools/clasp-run.test.js` on `windows-latest` whenever `run.js`,
its test or `project-map.json` changes, so the `.cmd` launcher and the
Windows paths are exercised, not only the Linux ones.

Also: it checks that clasp runs once, up front. On Windows it prints
clasp's box-drawing file list as ASCII, because cmd.exe's default code
page can't draw it; set `KOS_RUN_UNICODE=1` (after `chcp 65001`) to keep
the original characters. `KOS_RUN_CLASP` overrides the clasp command (the
tests use it to substitute a fake).

### --verify — is every web app on the last push?

`node run.js --verify` pushes and moves nothing. For each web app it lists
every deployment in `deployments.txt` with its version and the marker in
its description (a promote writes `<marker> v<n>`), and says **OK** when
that marker is the commit last pushed (the registry's `last-build.json`)
or **BEHIND** when it isn't. A push-only project has no deployment, so it
shows the last push only. The exit code is 1 when any deployment is behind
or missing. Combine it with `--only`; it refuses the flags that push.

### --hub — the Mothership hub, released in the same run

The Mothership hub (the `gas/` folder of
[Mothership](https://github.com/adamberneche-afk/Mothership)) is an Apps
Script web app too, and it reviews KOS on its own timer. `--hub` releases
it from this machine, where clasp is already signed in, so no Google
credential has to be stored in GitHub. Mothership's code stays in
Mothership; this only pushes it.

```
node run.js --latest --hub latest                       # KOS and the hub
node run.js --hub %USERPROFILE%\Downloads\Mothership-main.zip --only mothership-hub
node run.js --hub C:\code\Mothership --only mothership-hub   # a folder works too
```

`latest` is the newest `Mothership-main*.zip` here or in `~\Downloads`. A
zip is extracted to `Mothership-main` beside the KOS checkout; a folder is
used as it is. The hub runs last, after the KOS projects, and is a web app
like the others: push, cut one version, move its registered deployment, so
its `/exec` URL never changes. Then the run asks the hub to install its own
triggers (spoke poller, review queue, deploy-version report). `clasp run`
can't do that, because it needs a GCP project; the hub's install-triggers
endpoint can, because the web app runs as you. Each trigger is installed
only once, however often this runs.

One-time registry folder, `clasp-registry\mothership-hub\`:

| File | What goes in it |
|---|---|
| `.clasp.json` | from `clasp clone <the hub's scriptId>` |
| `deployments.txt` | the hub's live deployment ID alone on one line: not the ` @n` that `clasp list-deployments` prints after it (with it, `run.js` doesn't recognise the deployment and moves nothing) |
| `admin-token.txt` | the hub's `ADMIN_SETTINGS_TOKEN` Script Property. Without it the deploy still runs and the summary says the triggers were skipped |

Differences from a KOS web app: the hub's deploy marker is read as
Mothership committed it, never re-stamped, because Mothership's own
deploy-drift check expects exactly that commit. `--hub` refuses
`--head-only`, `--rollback-to`, `--verify` and `--instructions`; above all
`--head-only`, because the hub's triggers run whatever is pushed, so a test
push would be a production push. A failed trigger install fails the run
even though the deploy landed, and says so.

### --instructions — the KOS Project instructions, links filled in

`kos-personal/claude-project/PROJECT_INSTRUCTIONS.md` names its Google
Docs as `<link to KOS_CAS_SIGNAL>` and so on, because the real URLs are
private and the repo isn't. Keep the URLs once, in the registry, in
`kos-project-links.txt`:

```
# kos-project-links.txt: one NAME=https://... per line
KOS_CORE_FACTS=https://docs.google.com/document/d/.../edit
KOS_LATEST_PRIMER=https://docs.google.com/document/d/.../edit
KOS_OPEN_DECISIONS=https://docs.google.com/document/d/.../edit
KOS_SMP_REGISTER=https://docs.google.com/document/d/.../edit
KOS_FAMILY_SIGNAL=https://docs.google.com/document/d/.../edit
KOS_CAS_SIGNAL=https://docs.google.com/document/d/.../edit
```

Then:

```
node run.js --latest --instructions
```

fetches the latest checkout, fills every placeholder, keeps only the text
below the file's first `---` line (the part the Project uses), copies it
to the clipboard (`clip` on Windows, `pbcopy` on macOS; set
`KOS_RUN_NO_CLIPBOARD=1` to skip) and saves it as
`<registry>\PROJECT_INSTRUCTIONS.filled.md`. Paste it into the Project's
Instructions. It pushes nothing, so it refuses `--only`, `--head-only` and
`--rollback-to`. A placeholder with no line in the links file stops the
run and names the line to add; a link that isn't `https://` is refused; a
link nothing uses is reported but harmless.

After an ordinary push, if the filled instructions would now differ from
the saved copy, `run.js` ends with a reminder to run `--instructions`.
