# clasp-sync

Bridges cas-ccps's 7 separate Apps Script projects to
[clasp](https://github.com/google/clasp), Google's own CLI for pushing
local files to a live, bound Apps Script project. See
[`meta/CLASP_AND_APPS_SCRIPT.md`](../../meta/CLASP_AND_APPS_SCRIPT.md) for
why this needed a separate tool at all before reading further.

## The problem this solves

clasp's model is one local folder ↔ one script ID. `kos-personal/` and
`leader-hub/` fit that model directly — each is a single Apps Script
project already laid out as a flat folder, so clasp can push straight
from the tracked source (see `.clasp.json.template` and `.claspignore` in
each of those two directories).

`cas-ccps/scripts/` doesn't fit that model. It's actually **7 separate
bound/standalone Apps Script projects** sharing overlapping files —
`00_SharedConfig.js` alone is pasted into 5 of them,
`19_ClonedSheetConfig.js` into 2 — and `tools/gas-lint/project-map.json`
is the existing record of exactly which files belong to which project
(gas-lint's duplicate-declaration check depends on this same mapping
being accurate). There's no single folder to point `clasp push` at
without either sending files to a project that doesn't want them, or
missing files a project needs.

`sync.js` reads that same `project-map.json` and, for each of the 7
`cas-ccps:*` projects, generates a throwaway push folder under
`cas-ccps/.clasp-build/<project-name>/` containing exactly that
project's files (flattened to basenames — Apps Script projects are a
flat namespace) plus its `appsscript.json` and `.clasp.json`.
`cas-ccps/scripts/*.js` stays the single source of truth in git; nothing
under `.clasp-build/` is ever hand-edited or committed (it's
`.gitignore`d, and regenerated fresh — `fs.rmSync` clears the old
contents — every run).

## The 7 projects

| Project | Bound to | Files |
|---|---|---|
| `central-ledger` | Central Ledger spreadsheet | 21 |
| `unified-manual` | Assignment System Manual Doc (setup wizard) | 6 |
| `master-student-template` | Master Student Template Doc | 4 |
| `rubric-response-sheet` | Rubric Response Sheet — **cloned per teacher** | 5 |
| `teacher-matrix-sheet` | Teacher Matrix Sheet — **cloned per teacher** | 5 |
| `teacher-dashboard` | Standalone web app | 3 |
| `student-dashboard` | Standalone web app | 2 |

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

# Only if no live project exists yet for one of the 7:
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
# Rebuild all 7 project folders
node tools/clasp-sync/sync.js

# Rebuild just one
node tools/clasp-sync/sync.js central-ledger

# Then push whichever ones have a real scriptId configured
cd cas-ccps/.clasp-build/central-ledger && clasp push
```

Running `sync.js` with no real script IDs configured yet is still
useful — it's a way to inspect exactly which files and manifest would go
to each of the 7 live projects, with zero Google credentials involved.
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

It doesn't run `clasp push` for you, and it doesn't know your real
script IDs — those two steps are inherently manual/credentialed and
outside what this repo's tooling can reach into. It also doesn't solve
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

This check — plus a plain `node tools/clasp-sync/sync.js` run — is part
of `.github/workflows/gas-lint.yml`'s CI job, alongside gas-lint itself.

## Actually pushing to a live project

This file covers what `sync.js` builds and why. For the actual
command-by-command sequence — `clasp login`, wiring `.clasp.json` files,
building sandbox copies before touching real cas-ccps projects, the CI
job that automates sandbox pushes, and the human-run production-promotion
steps for all three systems in this repo — see
[`DEPLOYMENT_RUNBOOK.md`](./DEPLOYMENT_RUNBOOK.md) (same folder).
