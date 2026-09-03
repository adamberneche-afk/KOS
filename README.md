# KOS

This repository is a consolidation point for **three genuinely separate
systems, plus reference/governance material that doesn't belong to any
one of them**. `kos-personal/` and `cas-ccps/` were built independently,
use the same underlying platform pattern (Google Apps Script + native
Gemini inference, no external hosting or API keys by default), and are
kept as **separate concerns** in this repo rather than merged.
`leader-hub/` is a third, unrelated system, confirmed distinct during a
later reconciliation pass — see below.

Files arrive here piecemeal as they're uploaded across sessions — this
README and the per-system READMEs below are the index of what's been
consolidated so far and what's still missing. When new files show up, they
get filed into the matching subtree, not left loose at the root. See
`meta/PSD_Version_Controlled_CAS_Workspace.md` for the actual design
rationale behind moving to this git-based structure in the first place.

## [`kos-personal/`](./kos-personal/) — Knowledge Operating System v8.0

A personal AI-session knowledge pipeline: ingests one operator's AI working
sessions, extracts structured knowledge (decisions, action items, vector
weights, persona council verdicts), and routes it into a `BRAIN_TRUST_INDEX`
spreadsheet. Governed by an external orchestration layer (`RTP_CORE_ROUTER`)
that runs a 6-persona council with RID-weighted routing and a human-in-the-loop
firewall.

**Status:** reconciled — the code, the docs, and the HTML client now agree.
Every gap the docs previously described (missing server functions,
`STUDIO_ACTIVE` turnstile gating, the shadow matrix, the daily primer, the
auto-council trigger) has been implemented, `10_Turnstile.gs` was rebuilt
against the real schema (original archived), and all `PERSONA_*` cog
docs are now filed under `rtp-core-router/`. A later reupload batch added
two backported fixes, ten governance/protocol docs, and a real optional
managed-inference-service alternative to native Studio (opt-in, gated
behind `CFG.INFERENCE_MODE`, off by default). Since then, nine further
rounds of dedicated UI/UX auditing (see
[`kos-personal/CHANGELOG.md`](./kos-personal/CHANGELOG.md#uiux-hardening--rounds-19))
have fixed real bugs including a race condition, an unguarded status-line
race, and a data-loss bug where Escape could wipe an in-progress wizard.

## [`cas-ccps/`](./cas-ccps/) — Classroom Agency System (CCPS)

A district-deployed (ccpsnet.net), FERPA-scoped, student-facing platform for
a CCPS Sports/Entertainment/Event Marketing course pair (courses 8175 &
8177). Students work inside a simulated student-run "conglomerate" business
across a 10-stage, 20-unit curriculum; the software layer logs lesson intent,
runs AI evaluation of student work, converts evidence into Student
Competency Record (SCR) rating suggestions, and aggregates each student's
activity into a living context document.

**Status:** reconciled — all 7 flagged conflicts resolved, including the
most significant one: confirming Studio (not GAS) writes student feedback
into the doc, with the outlier design archived. Both confirmed bugs (a
Turn-In Form field mismatch, a `ReferenceError` in the setup wizard) are
fixed, along with a wider class of unescaped-string syntax bugs found
while verifying that fix. Module numbering is now internally consistent
across every doc in the set — including a correction, caught mid-implementation,
to the originally-approved renumbering (the Student Context Aggregator was
always correctly "Module 4"; the SCR engine moved to "Module 5," not "Module 4").
A later reupload batch closed most of the remaining Known Gaps (the two
missing data files, the `lesson_unit_id` column, and 6 of 7 missing Module
2 scripts) and resolved a second, genuine numbering collision inside
Module 2 itself. Since then, nine further rounds of dedicated UI/UX
auditing (see
[`cas-ccps/HISTORY.md`](./cas-ccps/HISTORY.md#uiux-hardening--rounds-19))
have fixed real bugs including a CRITICAL silent date-type-coercion bug
that stopped the nightly warm-up queue from ever matching a lesson, and a
double-counting bug in the warm-up readiness dashboard. See
[`cas-ccps/README.md`](./cas-ccps/README.md) (current state) and
[`cas-ccps/HISTORY.md`](./cas-ccps/HISTORY.md) (process history) for the
full record.

## [`leader-hub/`](./leader-hub/) — LeaderHub

A third, unrelated system — confirmed genuinely distinct from both of the
above during Round 3 reconciliation, not a cas-ccps companion despite
covering the same course numbers. A personal command center for one
teacher's full multi-role workload (classroom, DECA, school store,
E-Sports, field trips). Now server-backed: a single Apps Script Web App
(`leader-hub:app` — `Code.gs`, `Config.gs`, `Data.gs`, `SCR.gs`,
`EmailBridge.gs`) serves the HTML front end and holds its data in a
Spreadsheet, no longer client-side-only — see
[`leader-hub/README.md`](./leader-hub/README.md)'s "JJ1 — Server-deployed
web app" section for the migration. It also went through the same nine
rounds of UI/UX auditing as the two systems above —
see
[`leader-hub/HISTORY.md`](./leader-hub/HISTORY.md#uiux-hardening--rounds-19)
for its record, including the most severe bug found in any round: 8
places where raw JavaScript was rendering as visible garbage text because
it sat outside any `<script>` tag, silently disabling a rating widget
since it was first added.

## [`drive-curation/`](./drive-curation/) — filed for reference, not a system

Personal Google Drive housekeeping/audit material, plus curriculum
content for a different, unrelated course ("Marketing Exploration," not
cas-ccps's 8175/8177 pair). Explicitly **not** part of either software
system — filed here at the user's request so nothing uploaded is lost,
clearly labeled to prevent future confusion. See
[`drive-curation/README.md`](./drive-curation/README.md).

## [`meta/`](./meta/) — cross-cutting design docs

Governance/design material that spans systems, including the actual
Product Specification Document proposing this repo's git-based structure
in the first place. See [`meta/README.md`](./meta/README.md).

## [`tools/gas-lint/`](./tools/gas-lint/) — static checks for the GAS systems

Built after a full codebase review kept turning up the same failure
pattern: bugs that only exist because nothing checks for them
automatically. Eleven checks now, each written for a bug that had already
shipped — duplicate top-level declarations across files that share an Apps
Script project (a parse-time crash, or worse, a silent wrong-function-wins
if the duplicates actually differ), undefined config keys,
`google.script.run` calls with no matching server function, OAuth scopes
used but not declared, cross-project calls that can't resolve, undeclared
Google Cloud dependencies (the class that made 2,113 lines of custom Studio
steps permanently unreachable), two files that map the same sheet's columns
and disagree, a flow missing one of the four checks it needs, a fixture no
consumer ever reads, and a test sandbox narrower than the scope its code
runs in. The last four enforce `meta/FLOW_DOCTRINE.md`, and each found a
live defect on its first run. Run `node tools/gas-lint/check.js` before
trusting any change to `kos-personal/` or `cas-ccps/scripts/` is safe to
deploy. See [`tools/gas-lint/README.md`](./tools/gas-lint/README.md).

## [`tools/doc-currency/`](./tools/doc-currency/) — checks the docs against the code

The other half of the same idea. `gas-lint` reads the source; this reads the
prose and asks whether it is still true: a doc naming a function that exists
nowhere, a cited test count that has drifted, a key registry listing a key no
code mentions, a `file:line` citation past the end of that file, and — the
one no other check could see — **a document describing a path that cannot
run on the account this repo deploys to.** Every function in those
instructions existed; the instructions were still impossible to follow,
which is what made `cas-ccps/studio-steps/` — blocked on this account, and
superseded by `37_FlowInputBuilder.js` — read as a deployment backlog for
weeks rather than as a wall. The check caught this very paragraph on its
first draft, which is the argument for it. Dated records (`CHANGELOG.md`, `HISTORY.md`)
are skipped wholesale, because naming a removed function is what a changelog
is for. `node tools/doc-currency/check.js`; see
[`tools/doc-currency/README.md`](./tools/doc-currency/README.md).

## [`tools/clasp-sync/`](./tools/clasp-sync/) — bridges cas-ccps to clasp

`leader-hub/` and the main `kos-personal/` project are each already laid
out the way [clasp](https://github.com/google/clasp) wants — a flat
folder, one script ID; `kos-personal/studio-steps/` (whose two custom steps
are blocked on this account — the write-back moved to
`12_StudioReturnHarvest.gs`) is a second, separate flat-folder project
alongside it (a separate Apps Script project, not a
shared global scope — SMP-004 describes a personal/district *account* split
as well, but that is not what is deployed: both live on the same ccpsnet.net
account, which is why the org-wide GCP block reaches the Studio steps in
both systems). `cas-ccps/scripts/` isn't: it's actually 8 separate Apps Script
projects sharing overlapping files (5 spreadsheet/doc-bound projects, the
standalone Teacher and Student Dashboard web apps, and the standalone
`studio-steps` project holding every custom Workspace Studio step). This tool generates a throwaway per-project push folder for
each of the 8 from `tools/gas-lint/project-map.json`, so `cas-ccps/scripts/`
itself never gets reorganized or duplicated in git. Every real project
across the repo now has a committed `appsscript.json`. `clasp
login` against a real Google account is now working — see
[`meta/CLASP_AND_APPS_SCRIPT.md`](./meta/CLASP_AND_APPS_SCRIPT.md) for
the conceptual workflow, [`tools/clasp-sync/README.md`](./tools/clasp-sync/README.md)
for `sync.js`'s own mechanics, and
[`tools/clasp-sync/DEPLOYMENT_RUNBOOK.md`](./tools/clasp-sync/DEPLOYMENT_RUNBOOK.md)
for the actual command-by-command runbook (all three systems, sandbox-first
for cas-ccps, human-gated production promotion — folded in from an
external review pass, Addendum 22 R9).

## [`tools/watchdog/`](./tools/watchdog/check.js) — scheduled-job watchdog

Catches the failure mode a red X can't: an invalid `.github/workflows/*.yml`
file produces no run at all, so nothing fails loudly. Runs actionlint
against every workflow file and checks that every workflow with an
`on.schedule` trigger (currently `codeql.yml`) had its most recent
scheduled run actually conclude successfully, publishing both to one
pinned "KOS Scheduled-Job Watchdog" issue updated in place rather than a
fresh issue each run. Runs weekly via `.github/workflows/watchdog.yml`
(the day after `codeql.yml`'s own schedule, so that run has landed);
`node tools/watchdog/check.js` runs it locally. `.github/dependabot.yml`
(weekly npm + GitHub Actions updates) and `.github/workflows/codeql.yml`
(CodeQL code scanning) round out the same "is the repo's own machinery
healthy" floor.

## [`tools/leaderhub-build/`](./tools/leaderhub-build/) — assembles `student-leader-hub.html`

`leader-hub/student-leader-hub.html` (~22,000 lines) is generated from 14
ordered fragments under `leader-hub/src/` — edit the fragment, run `node
tools/leaderhub-build/build.js`, never hand-edit the assembled file
directly. `--check` mode builds in memory and diffs against the committed
file for a CI drift gate (external product review, Finding 4 / "this
quarter" maintainability fix). See
[`tools/leaderhub-build/README.md`](./tools/leaderhub-build/README.md).

## [`tests/`](./tests/) — regression coverage for the GAS systems

`node --test tests/leaderhub/*.test.js tests/tools/*.test.js
tests/cas-ccps/*.test.js tests/kos-personal/*.test.js` (`npm test`) runs
real Node-`vm`-sandboxed coverage against the actual `.gs`/`.js` source
via [`tests/harness/gas-sandbox.js`](./tests/harness/gas-sandbox.js) —
`tests/cas-ccps/` covers the SCR suggestion engine's threshold/state
machine, the student-context aggregator, `getCompetencyTextMap_`'s
cache-with-fail-open behavior, Ledger retention, the opt-in Flow 2
direct-evaluation escape hatch, the `cas-ccps/studio-steps/` custom steps
(Flows 1-5, kept covered even though they cannot run on this account), the
queue watchdog, the preflight and canaries, the Flow 2 and Flows 3/4/5
ports and their harvests, the fixtures driven through the code that
consumes them, the binding probes, and the generated build spec;
`tests/leaderhub/` covers escaping/XSS guards and the pacing/calendar
helpers; `tests/kos-personal/` covers the `kos-personal/studio-steps/`
custom steps (Curator and VECTOR_CLASSIFY flows); `tests/tools/` covers
the lint tools and the `leaderhub-build` drift gate.

## Still pending

**Corrected after the first real deployment.** This section used to say
Flows 2-5 needed the custom-step project "pushed to a live Studio
deployment," with its scriptId "still a placeholder." That framing is
wrong, and in the most expensive direction: the project *was* pushed
successfully, and its steps still never appeared in Studio's picker. A
custom Studio step is a Workspace Add-on and needs a standard,
non-default Google Cloud project; GCP is disabled org-wide for the
`ccpsnet.net` account all three systems deploy to. Nothing about pushing
fixes that — it is a Workspace-admin decision nobody here controls.

What is actually pending: **all five cas-ccps flows plus kos-personal's
two have been ported** to native Studio steps with an Apps Script harvest
(`37_FlowInputBuilder.js`, `41_WarmUpFlowBridge.js`,
`kos-personal/12_StudioReturnHarvest.gs`), which is a keyless path that
works on this account. Only Flow 1 is verified live end to end. Each
remaining flow's Studio side has to be built by hand in the Workspace UI —
nothing in this repo can automate it, but `syncFlowBuildSpec()` generates
the sheet to build from, and the preflight, canaries, binding probes and
liveness checks answer the four separate causes of "nothing happened."
`cas-ccps/DEPLOYMENT_HANDOFF.md` is the operator's document; the
`clasp`-side work is a human's, per SMP-004's air-gap.

Clasp adoption is no longer scaffolding: all 8 cas-ccps projects build
from `tools/clasp-sync/sync.js` and CI refuses a build with an unmerged
addendum. The two named-but-not-uploaded files this section used to list
(`27_LessonFrameGenerator` in cas-ccps, the `PERSONA_*` duplicates in
kos-personal) are both in the repo now.
