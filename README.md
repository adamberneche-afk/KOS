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

**Picking this up?** The order of work is [`meta/PLAN_2026-10.md`](./meta/PLAN_2026-10.md). Then read [`meta/HANDOFF_2026-10-27.md`](./meta/HANDOFF_2026-10-27.md):
where each system stands, what is merged but not yet live, and the
operator's queue in order.

## [`kos-personal/`](./kos-personal/) — Knowledge Operating System v8.0

A personal AI-session knowledge pipeline: ingests one operator's AI working
sessions, extracts structured knowledge (decisions, action items, vector
weights, persona council verdicts), and routes it into a `BRAIN_TRUST_INDEX`
spreadsheet. The thinking surface (the 6-persona council, alignment
guardrails, planning) is a Claude Project since 2026-10-06
([`meta/PLAN_2026-10.md`](./meta/PLAN_2026-10.md)). The external orchestration
layer it replaced, the RTP Gem and `RTP_CORE_ROUTER` (RID-weighted routing,
a human-in-the-loop firewall), is frozen at V6.0; Gems retire for education
on 2027-06-01 (ADR-010).

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
Since late September: a staging requeue, per-session vector classification,
a `VECTOR_MATRIX` repair, the RTP notebook's briefing docs and the SMP-019
moral debt counter (files `19_` to `23_`; see
[`kos-personal/README.md`](./kos-personal/README.md)).

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
`EmailBridge.gs` and five smaller `.gs` files) serves the HTML front end and
holds its data in a Spreadsheet and Script Properties. Since 2026-10-22 the
server is the only copy: nothing is stored in the browser, and the page no
longer runs opened from disk (the standalone file is retired;
[`meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md`](./meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md)).
See [`leader-hub/README.md`](./leader-hub/README.md)'s "JJ1 — Server-deployed
web app" section for the migration. It also went through the same nine
rounds of UI/UX auditing as the two systems above —
see
[`leader-hub/HISTORY.md`](./leader-hub/HISTORY.md#uiux-hardening--rounds-19)
for its record, including the most severe bug found in any round: 8
places where raw JavaScript was rendering as visible garbage text because
it sat outside any `<script>` tag, silently disabling a rating widget
since it was first added.

**The long-running OAuth-consent-dialog crash is fixed** (2026-09-28;
confirmed on `/dev`; `/exec` was released 2026-10-05 (v20) and still needs its
`?diag=probe` check). The
`Uncaught SyntaxError: Unexpected identifier 'style'` came from Apps
Script stripping the build's `//# sourceURL=` comments along with their
closing tags. A second fault followed: the split script's load order. Separately,
the page's server sync had never worked, because every browser call
targeted a private `_` function. Read
[`leader-hub/README.md`](./leader-hub/README.md)'s "Fixed — the
OAuth-consent-dialog crash" section **before** touching
`tools/leaderhub-build/` or how the page is served; the full
investigation is in `leader-hub/HISTORY.md`.

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
automatically. Fourteen checks now, each written for a bug that had already
shipped — duplicate top-level declarations across files that share an Apps
Script project (a parse-time crash, or worse, a silent wrong-function-wins
if the duplicates actually differ), undefined config keys,
`google.script.run` calls with no matching server function, OAuth scopes
used but not declared, cross-project calls that can't resolve, undeclared
Google Cloud dependencies (the class that made 2,113 lines of custom Studio
steps permanently unreachable), two files that map the same sheet's columns
and disagree, a flow missing one of the four checks it needs, a fixture no
consumer ever reads, a test sandbox narrower than the scope its code runs
in, three independent AI-plausibility-gate implementations silently
drifting apart, a web app with no auth check, and (warning-level) an
unbounded Drive-iterator loop. Five of the fourteen (Checks H–L) enforce
`meta/FLOW_DOCTRINE.md`,
and each found a live defect on its first run. Run
`node tools/gas-lint/check.js` before trusting any change to
`kos-personal/` or `cas-ccps/scripts/` is safe to deploy. See
[`tools/gas-lint/README.md`](./tools/gas-lint/README.md).

## [`tools/flow-harness-sync/`](./tools/flow-harness-sync/) — cross-project constant sync

The standard remedy, now named and repeatable, for one specific class of
duplication GAS forces on this repo: the same constant or algorithm
hand-copied across two or more of `kos-personal`/`cas-ccps`/`leader-hub`
(no `import`, ever — each is its own execution scope), with nothing
watching the copies for drift. First real instance:
`shared/flow-harness/plausibility-phrases.json` is the one canonical
source for the AI-groundedness/plausibility gate's phrase lists and
thresholds, materialized into all three systems by
`sync-plausibility-phrases.js` and checked for drift by `gas-lint`'s Check
L. See [`tools/flow-harness-sync/README.md`](./tools/flow-harness-sync/README.md)
for the general four-part recipe (canonical source, targeted-replacement
generator, a gas-lint check, a drift-guard test) this is one instance of —
and, as importantly, when this does *not* apply: logic that's merely
similar per system, not genuinely identical, stays separate.

## [`tools/coverage-gaps/`](./tools/coverage-gaps/) — scheduled functions with zero test coverage

Process-hardening sprint, Phase 0a. `gas-lint` above is pure static
analysis; this one actually re-runs the test suite under Node's built-in V8
coverage instrumentation to answer a question static analysis can't:
"does any test in this repo ever call this function at all." Scoped to
`ScriptApp.newTrigger()`-registered handlers specifically, not every
function — an unattended scheduled job is the one kind of function that
fails silently, with nobody clicking a button that would notice, which is
exactly what happened to `sensor1_scanInboundSessions()` (zero coverage for
most of this repo's life, found by accident mid-incident-fix rather than by
anything that would have flagged it in advance). Run
`node tools/coverage-gaps/check.js`; see
[`tools/coverage-gaps/README.md`](./tools/coverage-gaps/README.md).

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
folder, one script ID; `kos-personal/archive/studio-steps/` (whose two custom steps
are blocked on this account — the write-back moved to
`12_StudioReturnHarvest.gs`; archived 2026-09-29, not deployed) was a second, separate flat-folder project
alongside it (a separate Apps Script project, not a
shared global scope — SMP-004 describes a personal/district *account* split
as well, but that is not what is deployed: both live on the same ccpsnet.net
account, which is why the org-wide GCP block reaches the Studio steps in
both systems). `cas-ccps/scripts/` isn't: it's actually 9 separate Apps Script
projects sharing overlapping files (5 spreadsheet/doc-bound projects, the
standalone Teacher and Student Dashboard web apps, the standalone
`studio-steps` project holding every custom Workspace Studio step, and
`family-sentinel`, bound to the teacher's private Family Mail Sentinel sheet). This tool generates a throwaway per-project push folder for
each of the 9 from `tools/gas-lint/project-map.json`, so `cas-ccps/scripts/`
itself never gets reorganized or duplicated in git. Every real project
across the repo now has a committed `appsscript.json`. `clasp
login` against a real Google account is now working — see
[`meta/CLASP_AND_APPS_SCRIPT.md`](./meta/CLASP_AND_APPS_SCRIPT.md) for
the conceptual workflow, [`tools/clasp-sync/README.md`](./tools/clasp-sync/README.md)
for `sync.js`'s own mechanics, and
[`tools/clasp-sync/DEPLOYMENT_RUNBOOK.md`](./tools/clasp-sync/DEPLOYMENT_RUNBOOK.md)
for the actual command-by-command runbook (all three systems, sandbox-first
for cas-ccps, human-gated production promotion — folded in from an
external review pass, Addendum 22 R9). [`tools/clasp-sync/run.js`](./tools/clasp-sync/run.js)
(Node, from `cmd.exe`; it replaced `run.ps1` on 2026-10-17)
automates that runbook's clasp steps from the operator's Windows machine.
It reads a registry of real `.clasp.json` files and deployment IDs, and it
promotes web apps in place with `clasp update-deployment`, so `/exec` URLs
never change. See the
[clasp-sync README](./tools/clasp-sync/README.md#runjs--the-same-push-from-cmdexe).

## [`tools/student-data-scan/`](./tools/student-data-scan/) — finds student data, says where but not what

Reports student-shaped data (student-domain addresses, ID-shaped
addresses, and with `--roster` the names in a Canvas export kept on the
operator's machine) by path, line, kind and a hash, never the text, so its
output is safe in a CI log or an agent session. `--history` scans every
blob in git history. Matches confirmed not to be student data are
allowlisted by hash in `allow.json`. It also warns (without failing) on a
`Logger.log` / `console.*` call in `cas-ccps/scripts/` that prints a
student identifier. Added 2026-10-19 so the repo can stay
public after a scrub; a CI gate in `gas-lint.yml` (the working tree, without
`--roster`) since the tree and history were cleared on 2026-10-20. See
[`tools/student-data-scan/README.md`](./tools/student-data-scan/README.md).

## [`tools/watchdog/`](./tools/watchdog/check.js) — scheduled-job watchdog

Catches the failure mode a red X can't: an invalid `.github/workflows/*.yml`
file produces no run at all, so nothing fails loudly. Runs actionlint
against every workflow file and checks that every workflow with an
`on.schedule` trigger (currently `call-hub.yml`, `codeql.yml` and
`watchdog.yml` itself - there's no self-exclusion, so it watches its own run
history too) had its most recent scheduled run actually conclude
successfully, and lists open pull requests older than 14 days (reported,
never a failure), publishing all three to one
pinned "KOS Scheduled-Job Watchdog" issue updated in place rather than a
fresh issue each run. Runs weekly via `.github/workflows/watchdog.yml`
(the day after `codeql.yml`'s own schedule, so that run has landed);
`node tools/watchdog/check.js` runs it locally. A failed actionlint run
that names no file counts as a finding on every file, never as clean.
actionlint is pinned to one version (1.7.7) in both `watchdog.yml` and
`gas-lint.yml`, and every workflow defaults to read-only `permissions:`.
`.github/dependabot.yml`
(weekly npm + GitHub Actions updates) and `.github/workflows/codeql.yml`
(CodeQL code scanning) round out the same "is the repo's own machinery
healthy" floor.

## [`tools/deploy-drift/`](./tools/deploy-drift/) — is what's live actually what git expects?

Catches the gap behind two real incidents: a live GAS project silently
missing a function its own committed source already had, and separately,
genuine uncertainty over whether a redeploy had actually taken effect.
Most of the 10 deployed GAS projects (11 in `tools/gas-lint/project-map.json`; `cas-ccps:studio-steps` is blocked) sit behind Google's own sign-in wall or have no
web app at all, so this repo can't poll them — instead, each project
self-reports its own version marker outward via a `repository_dispatch`
call, which `.github/workflows/deploy-drift.yml` compares against what
`git log` says should be live, opening a tracking issue on mismatch. See
that tool's own README for the full mechanism, the credential threat
model, and why the marker has to live in its own file.

## [`tools/leaderhub-build/`](./tools/leaderhub-build/) — assembles `student-leader-hub.html`

`leader-hub/student-leader-hub.html` (~20,000 lines) is generated from 14
ordered fragments under `leader-hub/src/` — edit the fragment, run `node
tools/leaderhub-build/build.js`, never hand-edit the assembled file
directly. `--check` mode builds in memory and diffs against the committed
file for a CI drift gate (external product review, Finding 4 / "this
quarter" maintainability fix); `--stats` prints a per-block size report.

Beyond concatenation it now strips comments/dead whitespace, rewrites
top-level `let`/`const` to `var`, and splits the giant script into
several `<script>` tags at tokenizer-verified statement boundaries (each
`node --check`ed, each named with a `data-lh-block` attribute), after
moving top-level functions and var names ahead of other statements so the
split can't change load order — all added chasing the OAuth-dialog crash
above, all hand-rolled with zero npm
dependencies on a small tokenizer with its own invariant checker and unit
tests. See
[`tools/leaderhub-build/README.md`](./tools/leaderhub-build/README.md).

## Generators: [`tools/cas-ccps/`](./tools/cas-ccps/), [`tools/kos-personal/`](./tools/kos-personal/), [`tools/leader-hub/`](./tools/leader-hub/)

Each writes committed files that are generated, never hand-edited; a test
fails when a committed copy drifts from its generator. Zero npm
dependencies, like the rest of `tools/`.

- **cas-ccps:**
  - `build-unit-rubrics.js` writes `cas-ccps/curriculum/unit-rubrics/` (a Flow 1 rubric and prompt per unit and course).
  - `build-lesson-assignments.js` turns the teacher's lesson docs (`cas-ccps/curriculum/lessons/`) into `55b_LessonAssignmentData.js` and `lessons/COMPETENCY_REVIEW.md`.
  - `import-lesson-drafts.js` is the mechanical half of importing a Teacher Dashboard lesson draft: it re-checks drafts with 65's rules, writes the fields that have one home in the repo, rebuilds, and reports field by field what still differs (`cas-ccps/docs/LESSON_IMPORT_PROCEDURE.md` has the session's steps).
  - `build-canvas-cartridge.js` writes the 8175/8177 Canvas cartridges (from the teacher's lessons) in `cas-ccps/curriculum/canvas-cartridges/`, using `lesson-cards.js` (a `.docx` lesson-card reader) and `zip.js` (a zlib-only zip reader and writer).
  - `sync-pacing-vocabulary.js` sets the pacing guide's vocabulary fields from the lesson cards.
  - `build-guide-notebook-sources.js` writes the Markdown copies of the four user guides (`cas-ccps/docs/notebooklm-sources/`) from the guides' HTML, for the user-guide notebook.
  - `generate-family-mail-prompt.js` regenerates `61_FamilyMailPrompt.js` from `cas-ccps/docs/FAMILY_MAIL_TRIAGE_PROMPT.md`.
  - `generate-flow-prompts.js` regenerates `40_FlowPrompts.js`.
  - Every builder above takes `--check`, as does `generate-family-mail-prompt.js`; `generate-flow-prompts.js` doesn't, and `import-lesson-drafts.js` takes `check`, `apply` or `verify` and a drafts file instead.
- **kos-personal:**
  - `build-notebook-personas.js` writes the notebook persona editions in `kos-personal/rtp-core-router/notebook-sources/` (`--check`).
  - `generate-flow-prompts.js` regenerates `16_FlowPrompts.gs`.
- **leader-hub:** `generate-ai-prompts.js` regenerates `AiPrompts.gs`.

## [`tools/notebook-codebase/`](./tools/notebook-codebase/build.js) — the repo as Gemini notebook sources

Writes `meta/notebook-codebase/`: the whole repo (code, docs, tools, tests)
as 14 Markdown sources plus an index, for a "KOS Codebase" notebook. Every
section heading names its source and file, and every source carries its
`Notebook source:` line. Unlike the generators above, its output is not
committed (it is gitignored): run it in the unzipped copy of `main`, which
needs no git, and upload what it writes. `--check` reports which sources
changed since the last build. See `meta/notebook-codebase/README.md`.

## [`tools/notebook-context/`](./tools/notebook-context/build.js) — the "KOS Context" notebook

Writes `meta/notebook-context/`: six sources for a notebook about why KOS
exists rather than how its code works. A guide written for it
(`meta/notebook-context/GUIDE.md`: the three systems, their North Stars,
the value proposition by audience, and which sources are dated), then
copies of the North Star documents, the Economics of Depth paper and its
assumptions audit, the value review and audits, the system READMEs and
architecture, and the plan and handoff. The file list is chosen by hand in
the generator, and a missing file stops the build. Output gitignored, as
above; `--check` reports what changed. See `meta/notebook-context/README.md`.

## [`tools/html-lint/`](./tools/html-lint/check.js) — inline `<script>` syntax check

Runs `node --check` on every inline `<script>` block of
`leader-hub/student-leader-hub.html`, in `gas-lint.yml`.

## [`tests/`](./tests/) — regression coverage for the GAS systems

`node --test tests/leaderhub/*.test.js tests/tools/*.test.js
tests/cas-ccps/*.test.js tests/kos-personal/*.test.js` (`npm test`) runs
real Node-`vm`-sandboxed coverage against the actual `.gs`/`.js` source
via [`tests/harness/gas-sandbox.js`](./tests/harness/gas-sandbox.js) —
`tests/cas-ccps/` covers the course year builder (course data check, the CCPS calendar copy, course-aware pacing units, the rolling lesson drafts: `course-year-builder.test.js`), the Canvas roster import (`canvas-roster-import.test.js`), the Central Ledger's frequent jobs run by one every-minute cycle: install and rollback, cadence, most overdue first, errors contained and counted, the trigger failing after ten in a row, the time budget (`ledger-cycle.test.js`), the admin panel's Clear Staging Pipeline: a preview by status, unfinished submissions put back in line (`clear-staging-pipeline.test.js`), one period split into groups that meet on alternate days: text period labels, the relabel of enrolled students, off-day warm-ups set NOT_MEETING (`period-split.test.js`), the teacher's lessons on LessonSchedule dates (`lesson-schedule.test.js`), the nightly lesson rollout: docs made two days ahead, shared the night before, shadow until switched on, counts-only log (`lesson-rollout.test.js`), terms as school year plus marking period (`term-marking-periods.test.js`), the term rolling over by marking-period date, with MP1 students still enrolled in MP2 (`term-rollover.test.js`), the CAS attention signal and the STAGING_PIPELINE no-timestamp and unknown-status gaps (`cas-attention-signal.test.js`), the signal's LAST NIGHT section and its daily email: 3 a.m. stage stamps, warm-up counts, Studio jobs with no return, the all-clear line, and the setup checks it runs at most every 6 hours (the Ledger's column order, FlowPrompts against the code, Studio returns in the right columns: `overnight-health.test.js`), the warm-up flows' pacing: at most ten input rows per run, and a job Studio dropped written again, at most twice (`warmup-flow-pacing.test.js`), Flow 3's shape gate: output that is the prompt, a description of it or a list is replaced by the teacher's anchor, the repair for rows already delivered, and 33's stamp when it stops early (`warmup-shape-gate.test.js`), the retention schedule, its school-year cutoff and its read-only check (`retention-schedule.test.js`), LIVE assignments seeded from the repo's unit rubrics (`assignment-seeder.test.js`), live assignments brought up to the repo's criteria, with a milestone's result counted for each competency it lists (`assignment-refresh.test.js`), the SCR suggestion engine's threshold/state
machine, the student-context aggregator, `getCompetencyTextMap_`'s
cache-with-fail-open behavior, Ledger retention, the opt-in Flow 2
direct-evaluation escape hatch, the `cas-ccps/studio-steps/` custom steps
(Flows 1-5, kept covered even though they cannot run on this account), the
queue watchdog, the preflight and canaries, the Flow 2 and Flows 3/4/5
ports and their harvests, the fixtures driven through the code that
consumes them, the binding probes, the generated build spec, and the
Teacher Dashboard's own SCR confirm/override review queue (a from-scratch
reimplementation of the suggestion engine's confirm/override logic,
native to that separate Apps Script project — see
`cas-ccps/HISTORY.md`'s "SCR confirm/override is wired into the Teacher
Dashboard for real"), the turn-in score review's teacher-ownership check
(`teacher-dashboard-turn-in-review.test.js`), the central-ledger SCR
writers' ownership check (`scr-retry-ownership.test.js`), SCR evidence counted one
piece per assignment at its best outcome, for suggestions and retries alike
(`scr-suggestion-engine.test.js`, `scr-retry-evidence-pieces.test.js`), the Central Ledger's setup status: each expected trigger on, in the Ledger cycle or missing with its installer, the switches, and secrets only as set or not set (`setup-status.test.js`), what an
evaluation leaves behind: the Ledger moved to COMPLETE and next steps pointing at
the dashboard and Canvas (`evaluation-next-steps.test.js`), each evaluation's result on
the Ledger, and its EvaluationLog row (times, attempt, minutes waited; never text: `evaluation-result-record.test.js`), feedback posted as a comment on the doc
instead of into it, behind `FEEDBACK_AS_COMMENT` (`feedback-as-comment.test.js`), each assignment's learning objectives as "I can" statements, one per tiered competency, first person, no system words (`student-criteria.test.js`), the process reflection on Submit behind `REFLECTION_ON_SUBMIT`: the questions chosen from fixed frames, answers checked and kept in `ReflectionLog`, the doc menu sent to the dashboard, and that submission's answers in Flow 2's prompt and back to the student as a comment (`process-reflection.test.js`), the Student Dashboard's Warm-ups card: the last warm-up's feedback with its extra-credit reply, the current warm-up and its answer box, saving only the student's own open warm-up (`student-dashboard-warmups.test.js`), warm-ups answered in a text box behind `WARMUP_TEXT_BOX`: delivered without a doc, scored from the saved answer, extra credit from the saved reply, and each warm-up's `delivered_at` and `answered_at` (`warmup-text-box.test.js`), a lesson's video links: a link in a new doc's task, and the refresh that adds it under "Watch" in docs already made, once, never in the student's writing (`video-links.test.js`), the Teacher Dashboard's four states
(not checked, not passing yet, passed, passed before) and its lesson grouping
(`teacher-dashboard-eval-states.test.js`), both dashboards' contrast and plain words (no failing text colour, no text under 12px, term codes, SCR ratings and suggested scores in words, the old jargon gone, a Terms panel on each: `dashboard-plain-words.test.js`), the Teacher Dashboard's lesson schedule panel: start dates by course with the last rollout run, a stale or impossible date refused, a change the rollout acts on soon confirmed first, a date saved on Enter or blur only once it is whole, the lesson editor keeping its form on a failed save and asking before discarding edits, Escape closing the top panel, and every modal opened with the class the CSS uses (`teacher-dashboard-lesson-schedule.test.js`), one student's page on the Teacher Dashboard: that student's parent report for this week and their Student Context doc by week, newest first, only for the teacher's own students (`teacher-dashboard-student-page.test.js`), the Student Dashboard's record tabs: every competency in the student's courses with the teacher's confirmed rating (never the AI's suggestion) and each piece of evidence marked whether it counts, every past warm-up read-only, the Student Context doc by week, only the signed-in student's own (`student-dashboard-record.test.js`), the lesson editor's drafts: the lesson's current fields and tiers read from the generated data, the VDOE tasks and coverage, one open draft per lesson, Submit only with every required field and tiers the builder accepts, a proposal reviewed only by its submitter, new lessons keyed and checked (`lesson-drafts.test.js`), and the import tool on a copy of the curriculum: drafts re-checked, the warm-up, competency lines, tiers, 8177 vocabulary and objective written and rebuilt, the student task left for the session and named, a re-run changing nothing, a new lesson's files made in the builder's shape and built (`tests/tools/import-lesson-drafts.test.js`), and the student-data access
policy: intake sharing, locking at submission, school-year scoping, the
repair tool, and the student doc's menu calling the dashboard web app
instead of the Ledger (`student-doc-service.test.js`,
`student-data-access-intake.test.js`,
`lock-doc-after-submission.test.js`, `school-year-scope.test.js`,
`student-data-access-repair.test.js`, and no student writing in ReviewQueue:
`review-queue-text-scrub.test.js`);
`tests/leaderhub/` covers escaping/XSS guards (including the School
Store Sales Log's own renderer — Open Items #10, `leader-hub/HISTORY.md`),
the pacing/calendar helpers (with the published CCPS 2026-27 calendar as an import fixture, `fixtures/ccps-2026-27-calendar.txt`, and the built-in calendar's own consistency, `school-calendar-defaults.test.js`), the page's sync code never overwriting an
edit the server hasn't accepted (`sync-pending.test.js`), the `?diag` modes (`diagnostics.test.js`,
run against the real built page), the server-side sign-in check for the CAS connection (owner-only, the token never logged: `cas-server-signin.test.js`), the owner-only functions the page
calls through `google.script.run` (`browser-entry-points.test.js`), and the page's contrast and plain words (text colours at 4.5:1 or more, no on-screen text under 12px, the jargon the 2026-10-22 UX audit found replaced on screen, and a Terms panel entry for each renamed term: `plain-words.test.js`), and the rest of its 2026-10-22 audit fixes (email templates from the season, real Bcc recipients and a blanks check before sending, reminder banners in normal flow, the phone header, edit-modal guards, Brag Board's explicit send, honest pulse rings: `ux-audit-fixes.test.js`), and its move off browser storage (drafts and view state in page memory, ids on log entries, a key the server never had pushed once, the id counters merged by the larger value, every `lh_*` key accounted for, and served: the server's data read from the page, nothing written to the browser, the one-time move, the "not saved yet" bar, conflicts merged, no save when the data couldn't load, an import added to the server's copy, never replacing it, and the retired standalone file stopping with an export: `no-browser-storage.test.js`); `tests/kos-personal/` covers the archived `kos-personal/archive/studio-steps/`
custom steps (Curator and VECTOR_CLASSIFY flows) and the name-based Drive
lookups (`asset-lookup-hardening.test.js`: trashed items skipped,
duplicates refused rather than guessed, working IDs never replaced), the
batched requeue of terminal staging rows (`staging-requeue.test.js`), the nightly finished-rows-only staging archive (`staging-archive.test.js`), the 21-day onboarding close-out and the primer's onboarding line (`onboarding-closeout.test.js`), the SMP-019 moral debt counter (PROCEED counted from a log's closeout, halving every 7 days, the primer's line and MUSE threshold: `moral-debt.test.js`), the audit gate rejecting a hollow `PASSED` with an empty `trace_log` (`audit-gate.test.js`), and
per-session vector classification and its backfill
(`vector-classify-sessions.test.js`), why a session has no Vector State row and the call that fixes it (`unclassified-sessions.test.js`), the matrix repair (one session per row, decay at read time, duplicate sessions, rederive: `vector-matrix-repair.test.js`), the notebook briefing docs and `DECISION_REGISTER` (stable doc IDs, stamps that never advance on a failed run, the primer's Data Quality block: `briefing-docs.test.js`), the notebook persona editions (core block first, the persona named in every heading, the canonical text otherwise unchanged: `notebook-personas.test.js`), the V6.0 router (under the 10,000-character instructions cap, every must-fire rule present, the V5.8 Morning Cache and BRAIN_TRUST_INDEX query gone, the Turn Loop Reference sections it points to: `rtp-router-v6.test.js`), incubator decay (`incubator-decay.test.js`), the web app's contrast and plain words (every text token at 4.5:1 or more on every surface, no text under 12px, zoom allowed, no system jargon on screen, a Terms entry for every renamed term: `web-app-legibility.test.js`), the web app's operator chores (archive keeps failed rows and confirms with a count, the failed-items list and its Retry, the advisor review panel and lookup, the Needs you strip and tab badges: `web-app-operator-chores.test.js`),
the size-capped error digest (`error-digest.test.js`),
the Registrar's stage validators (`registrar-validators.test.js`), its anonymous intervention triage (a role and a link; emails, IDs and percentages scrubbed: `registrar-anonymous-triage.test.js`), and Deploy_Trigger deploying only an APPROVED Blackboard row (`governance-deploy-guard.test.js`);
`tests/tools/` covers
the deploy script `tools/clasp-sync/run.js` against a fake clasp (promote, head-only, rollback, the `--zip` extractor, the stale-copy check, and its manifest matching `run.ps1` and `project-map.json`: `clasp-run.test.js`), the harness's own fakes behaving like Apps Script (`gas-sandbox-range.test.js`: ranges, cleared rows, duplicate tab names, doc bodies, time zones, per-file loading), the lint tools (including the project-map coverage check, `gas-lint-project-map.test.js`, and check 15's no-`typeof`-guard-inside-one-project rule with the undefined-call check's parameter and guard skips, `gas-lint-typeof-guard.test.js`), each flat project's `.claspignore` letting in every file it declares (`claspignore-coverage.test.js`), the student-data scan reporting locations and hashes only, and its log-call warning (`student-data-scan.test.js`), no cas-ccps or kos-personal page using browser storage (`no-browser-storage.test.js`), the generated cas-ccps unit rubrics, lesson assignments, Canvas cartridges and pacing guide vocabulary matching their generators (`unit-rubrics.test.js`, `lesson-assignments.test.js`, `canvas-cartridge.test.js`), LeaderHub's retired spring-2026 default deadlines (`retired-default-deadlines.test.js`), the notebook-codebase generator (every source names itself, stays under the notebook cap and attributes every section: `notebook-codebase.test.js`), the notebook-context generator (its listed files exist, the guide names every source and every file its table cites: `notebook-context.test.js`), the Markdown copies of the four cas-ccps user guides matching their generator, with no page markup (`guide-notebook-sources.test.js`), the `leaderhub-build` drift gate, and the split script's
load order (`leaderhub-build-load-order.test.js`, which runs the real
built tags one after another).

`npm test` also runs in an unzipped copy of `main`, which has no `.git`:
the seven tests that read git history (deploy-drift's expected marker and
stamp, the notebook-codebase walk check) skip there with a reason, via
[`tests/harness/git.js`](./tests/harness/git.js). CI always has the
history, so they always run there.

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
works on this account, and all of them are built in Studio. The five
cas-ccps flows are verified live with their own liveness checks
(`checkFlow2Liveness()`, `checkWarmUpFlowLiveness()`; see
`cas-ccps/DEPLOYMENT_HANDOFF.md`). kos-personal's Curator flow was fixed in
Studio on 2026-09-29 and its classify flow is returning real parts
(`kos-personal/HANDOFF_2026-09-28.md`). What is left is operator work, not
builds: pushes of current `main` (`node run.js --latest`, `tools/clasp-sync/run.js`) and the
setup functions each new script needs, listed in
`cas-ccps/DEPLOYMENT_HANDOFF.md` and `kos-personal/HANDOFF_2026-09-28.md`.
The `clasp`-side work is a human's, per SMP-004's air-gap.

Clasp adoption is no longer scaffolding: all 9 cas-ccps projects build
from `tools/clasp-sync/sync.js` and CI refuses a build with an unmerged
addendum. The two named-but-not-uploaded files this section used to list
(`27_LessonFrameGenerator` in cas-ccps, the `PERSONA_*` duplicates in
kos-personal) are both in the repo now.

## Floor check 10 — secrets-doctor

`scripts/secrets-doctor.mjs` confirms every secret this repo's workflows reference is actually configured and non-empty. It is a **byte-identical copy** of the canonical file in the Mothership hub (see that repo's `CICD_FLOOR.md`) and must not be edited here — a change belongs upstream.

The expected list is **derived from the workflow files**, never hand-written. That is the whole design: the two doctors that predate it, in Mothership and TSO, name their secrets in source, and TSO's has already drifted — it checks three while its workflows reference five. A list someone has to remember to extend is the same shape as the bug.

| command | does |
|---|---|
| `node scripts/secrets-doctor.mjs --sync` | regenerates the env block in `.github/workflows/secrets-doctor.yml` |
| `node scripts/secrets-doctor.mjs --check` | fails if that block has fallen behind, in either direction |

The workflow splits by what each half needs to see. Its `drift` job runs on **every pull request** with no access to the secrets context at all, so a workflow that starts needing a new secret turns a PR red until the block is regenerated. Its `probe` job runs on dispatch only and receives one boolean per secret — `${{ secrets.NAME != '' }}`, compared inside the expression — so a job is shipped only the secret it names and no value ever reaches the environment.

Four secrets are in scope here. `APPS_SCRIPT_URL` and `TENANT_CALLER_KEY` (`call-hub.yml`) are required. `CAS_SANDBOX_SCRIPT_IDS` and `CLASP_SANDBOX_CREDENTIALS` are declared optional in `.github/floor.json`, because `gas-lint.yml`'s `check-sandbox-secrets` job turns them into a `configured` output that every downstream job gates on — absent simply means the sandbox push lane is off, which is a supported state.

Worth noting for anyone extending the scanner: `gas-lint.yml` explains itself with the phrase *"a bare `secrets.X` reference inside an `if:` conditional"*, and `needs.check-sandbox-secrets.outputs.configured` contains the substring `secrets.outputs`. A naive scan reports two credentials named `X` and `outputs` that nobody needs. Both were found against this repo while the extractor was being written, and both are pinned by tests upstream — comments are stripped and a left boundary is required.

Not adopted here: floor checks 6 and 9. KOS's own `tools/doc-currency` and `tools/coverage-gaps` predate the floor and are the versions Mothership's were built **from**, so they keep their own configuration and are not driven from `.github/floor.json`.
