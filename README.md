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
that runs a 7-persona council with RID-weighted routing and a human-in-the-loop
firewall.

**Status:** reconciled — the code, the docs, and the HTML client now agree.
Every gap the docs previously described (missing server functions,
`STUDIO_ACTIVE` turnstile gating, the shadow matrix, the daily primer, the
auto-council trigger) has been implemented, `10_Turnstile.gs` was rebuilt
against the real schema (original archived), and all 7 `PERSONA_*` cog
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
covering the same course numbers. A personal, single-file HTML command
center for one teacher's full multi-role workload (classroom, DECA,
school store, E-Sports, field trips). Client-side only — no server, no
shared data model with `kos-personal/` or `cas-ccps/`. It also went
through the same nine rounds of UI/UX auditing as the two systems above —
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
automatically. Catches duplicate top-level declarations across files that
share an Apps Script project (a parse-time crash, or worse, a silent
wrong-function-wins if the duplicates actually differ), undefined config
keys, `google.script.run` calls with no matching server function, and
OAuth scopes used but not declared. Run `node tools/gas-lint/check.js`
before trusting any change to `kos-personal/` or `cas-ccps/scripts/` is
safe to deploy. See [`tools/gas-lint/README.md`](./tools/gas-lint/README.md).

## [`tools/clasp-sync/`](./tools/clasp-sync/) — bridges cas-ccps to clasp

`kos-personal/` and `leader-hub/` are each already laid out the way
[clasp](https://github.com/google/clasp) wants — a flat folder, one
script ID. `cas-ccps/scripts/` isn't: it's actually 7 separate Apps
Script projects sharing overlapping files. This tool generates a
throwaway per-project push folder for each of the 7 from
`tools/gas-lint/project-map.json`, so `cas-ccps/scripts/` itself never
gets reorganized or duplicated in git. All 9 real projects across the
repo now have a committed `appsscript.json` for the first time. `clasp
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
tests/cas-ccps/*.test.js` (`npm test`) runs real Node-`vm`-sandboxed
coverage against the actual `.gs`/`.js` source via
[`tests/harness/gas-sandbox.js`](./tests/harness/gas-sandbox.js) —
`tests/cas-ccps/` covers the SCR suggestion engine's threshold/state
machine, the student-context aggregator, `getCompetencyTextMap_`'s
cache-with-fail-open behavior, Ledger retention, and the opt-in Flow 2
direct-evaluation escape hatch; `tests/leaderhub/` covers escaping/XSS
guards and the pacing/calendar helpers; `tests/tools/` covers the lint
tools and the `leaderhub-build` drift gate. `kos-personal/`'s one existing
test file (`inference-service/test/credits.test.js`) is not yet wired
into this script — see that system's own README.

## Still pending

Module 1 (`cas-ccps`) still needs Flow 2 built in Studio before it can run
end-to-end, and a handful of named-but-not-yet-uploaded files remain across
systems (`27_LessonFrameGenerator` in cas-ccps; two `PERSONA_*` version
duplicates and `sql/migrate.js` in kos-personal's optional inference
service) — see each system's README for the specific list. Reconciliation
work (resolving contradictions between what's here) is done twice over now
(original pass + Round 3); filling remaining gaps (uploading what's still
missing) is the open work. Clasp adoption is scaffolded (manifests,
ignore-lists, the cas-ccps multi-project sync tool) but not yet connected
to a live Google account — see `tools/clasp-sync/`.
