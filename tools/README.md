# tools/

The repo's own tooling: checks CI runs, generators that write code or data
from the repo's sources, and the clasp bridge the operator deploys with. Each
tool is plain Node (no dependencies); run it from the repo root. Moved here
from the root README on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md, 4.1).

| Tool | What it is |
|---|---|
| [`gas-lint/`](./gas-lint/) | static checks for the GAS systems |
| [`flow-harness-sync/`](./flow-harness-sync/) | cross-project constant sync |
| [`coverage-gaps/`](./coverage-gaps/) | scheduled functions with zero test coverage |
| [`doc-currency/`](./doc-currency/) | checks the docs against the code |
| [`clasp-sync/`](./clasp-sync/) | bridges cas-ccps to clasp |
| [`student-data-scan/`](./student-data-scan/) | finds student data, says where but not what |
| [`release-check/`](./release-check/) | what must not ship: Drive IDs, exports, LICENSE, secrets |
| [`archive/`](./archive/) | the archive's catalog, indexes and search |
| [`setup-guide/`](./setup-guide/) | the CAS setup guide's reference, from the code |
| [`watchdog/`](./watchdog/check.js) | scheduled-job watchdog |
| [`deploy-drift/`](./deploy-drift/) | is what's live actually what git expects? |
| [`leaderhub-build/`](./leaderhub-build/) | assembles `student-leader-hub.html` |
| [`tools/cas-ccps/`](./cas-ccps/), [`tools/kos-personal/`](./kos-personal/), [`tools/leader-hub/`](./leader-hub/) | the lesson, rubric and prompt generators |
| [`notebook-codebase/`](./notebook-codebase/build.js) | the repo as Gemini notebook sources |
| [`notebook-context/`](./notebook-context/build.js) | the "KOS Context" notebook |
| [`html-lint/`](./html-lint/check.js) | inline `<script>` syntax check |

What CI runs, in order, is `.github/workflows/gas-lint.yml`.

## [`tools/gas-lint/`](./gas-lint/) — static checks for the GAS systems

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
[`tools/gas-lint/README.md`](./gas-lint/README.md).

## [`tools/flow-harness-sync/`](./flow-harness-sync/) — cross-project constant sync

The standard remedy, now named and repeatable, for one specific class of
duplication GAS forces on this repo: the same constant or algorithm
hand-copied across two or more of `kos-personal`/`cas-ccps`/`leader-hub`
(no `import`, ever — each is its own execution scope), with nothing
watching the copies for drift. First real instance:
`shared/flow-harness/plausibility-phrases.json` is the one canonical
source for the AI-groundedness/plausibility gate's phrase lists and
thresholds, materialized into all three systems by
`sync-plausibility-phrases.js` and checked for drift by `gas-lint`'s Check
L. See [`tools/flow-harness-sync/README.md`](./flow-harness-sync/README.md)
for the general four-part recipe (canonical source, targeted-replacement
generator, a gas-lint check, a drift-guard test) this is one instance of —
and, as importantly, when this does *not* apply: logic that's merely
similar per system, not genuinely identical, stays separate.

## [`tools/coverage-gaps/`](./coverage-gaps/) — scheduled functions with zero test coverage

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
[`tools/coverage-gaps/README.md`](./coverage-gaps/README.md).

## [`tools/doc-currency/`](./doc-currency/) — checks the docs against the code

The other half of the same idea. `gas-lint` reads the source; this reads the
prose and asks whether it is still true: a doc naming a function that exists
nowhere, a cited test count that has drifted, a key registry listing a key no
code mentions, a `file:line` citation past the end of that file, a Drive file ID or link written into any Markdown doc (Check 6, 2026-11-15; `doc-currency-check.test.js`), and — the
one no other check could see — **a document describing a path that cannot
run on the account this repo deploys to.** Every function in those
instructions existed; the instructions were still impossible to follow,
which is what made `archive/2026-27-Q2/cas-ccps/archived/studio-steps/` (archived 2026-11-17) — blocked on this account, and
superseded by `37_FlowInputBuilder.js` — read as a deployment backlog for
weeks rather than as a wall. The check caught this very paragraph on its
first draft, which is the argument for it. Dated records (`CHANGELOG.md`, `HISTORY.md`)
are skipped wholesale, because naming a removed function is what a changelog
is for. `node tools/doc-currency/check.js`; see
[`tools/doc-currency/README.md`](./doc-currency/README.md).

## [`tools/clasp-sync/`](./clasp-sync/) — bridges cas-ccps to clasp

`leader-hub/` and the main `kos-personal/` project are each already laid
out the way [clasp](https://github.com/google/clasp) wants — a flat
folder, one script ID; `archive/2026-27-Q1/kos-personal/archive/studio-steps/` (whose two custom steps
are blocked on this account — the write-back moved to
`12_StudioReturnHarvest.gs`; archived 2026-09-29, not deployed) was a second, separate flat-folder project
alongside it (a separate Apps Script project, not a
shared global scope — SMP-004 describes a personal/district *account* split
as well, but that is not what is deployed: both live on the same ccpsnet.net
account, which is why the org-wide GCP block reaches the Studio steps in
both systems). `cas-ccps/scripts/` isn't: it's actually 8 separate Apps Script
projects sharing overlapping files (5 spreadsheet/doc-bound projects, the
standalone Teacher and Student Dashboard web apps, and
`family-sentinel`, bound to the teacher's private Family Mail Sentinel sheet;
a 9th, `studio-steps`, was archived 2026-11-17). This tool generates a throwaway per-project push folder for
each of the 8 from `tools/gas-lint/project-map.json`, so `cas-ccps/scripts/`
itself never gets reorganized or duplicated in git. Every real project
across the repo now has a committed `appsscript.json`. `clasp
login` against a real Google account is now working — see
[`meta/CLASP_AND_APPS_SCRIPT.md`](../meta/CLASP_AND_APPS_SCRIPT.md) for
the conceptual workflow, [`tools/clasp-sync/README.md`](./clasp-sync/README.md)
for `sync.js`'s own mechanics, and
[`tools/clasp-sync/DEPLOYMENT_RUNBOOK.md`](./clasp-sync/DEPLOYMENT_RUNBOOK.md)
for the actual command-by-command runbook (all three systems, sandbox-first
for cas-ccps, human-gated production promotion — folded in from an
external review pass, Addendum 22 R9). [`tools/clasp-sync/run.js`](./clasp-sync/run.js)
(Node, from `cmd.exe`; it replaced `run.ps1` on 2026-10-17, removed 2026-10-29)
automates that runbook's clasp steps from the operator's Windows machine.
It reads a registry of real `.clasp.json` files and deployment IDs, and it
promotes web apps in place with `clasp update-deployment`, so `/exec` URLs
never change. See the
[clasp-sync README](./clasp-sync/README.md#runjs--the-whole-push-from-cmdexe).

## [`tools/student-data-scan/`](./student-data-scan/) — finds student data, says where but not what

Reports student-shaped data (student-domain addresses, ID-shaped
addresses, and with `--roster` the names in a Canvas export kept on the
operator's machine) by path, line, kind and a hash, never the text, so its
output is safe in a CI log or an agent session. `--history` scans every
blob in git history. Office and zip files (`.xlsx`, `.docx`, `.pptx`,
`.imscc`, ...) are unpacked in memory and their text scanned; one that
can't be opened fails the run, and a closing `not read:` line counts the
other files it didn't open. Matches confirmed not to be student data are
allowlisted by hash in `allow.json`. It also warns (without failing) on a
`Logger.log` / `console.*` call in `cas-ccps/scripts/` that prints a
student identifier. Since 2026-11-07 it also fails on a name-shaped
district staff address (`staff-email`) unless `staff-allow.json` lists it
(the operator's own address and synthetic test ones); tested in
`tests/tools/student-data-scan-staff.test.js`. Added 2026-10-19 so the repo can stay
public after a scrub; a CI gate in `gas-lint.yml` (the working tree, without
`--roster`) since the tree and history were cleared on 2026-10-20. See
[`tools/student-data-scan/README.md`](./student-data-scan/README.md).

## [`tools/release-check/`](./release-check/) — what must not ship: Drive IDs, exports, LICENSE, secrets

Plan item L1 (approved 2026-11-08). Reports, over the tracked tree, Drive
IDs and Docs/Drive links (in links, or labelled as IDs), Apps Script
web-app URLs and script IDs (a separate bucket for the operator to decide),
tracked exports (spreadsheets, CSVs, Canvas cartridges, Drive listings;
`appsscript.json` manifests are listed as probably fine), a missing LICENSE
in the root, `cas-ccps/`, `leader-hub/` or `kos-personal/`, secret shapes,
and student-data-scan's kinds; a value is printed only as its length.
`--history` counts matches in git history. **The gate is on** in CI
(`gas-lint.yml`, `RELEASE_CHECK_GATE: '1'`, the operator, 2026-11-20): any
failing finding fails the build. What it lets through (the Student
Dashboard's web-app URL by hash, the curriculum CSVs and Canvas cartridges
by path) is named with why in `tools/release-check/allow.json`; Drive IDs
never. The first audit is [`meta/RELEASE_AUDIT_2026-11-08.md`](../meta/RELEASE_AUDIT_2026-11-08.md);
a pre-commit hook (`tools/release-check/pre-commit`, installed by hand)
checks staged files. Tested in `tests/tools/release-check.test.js`. See
[`tools/release-check/README.md`](./release-check/README.md).

## [`tools/archive/`](./archive/) — the archive's catalog, indexes and search

`archive/catalog.jsonl` (one record per archived file) and
`archive/quarters.json` are the source; `build.js` generates the
indexes, a view by system and one by `#N`, and `archive/entries.jsonl`
(one record per history-log entry), and its `--check` runs in CI.
`search.js` filters by quarter, kind, system, dates and `#N`, then
searches the text of only what matched. `file.js` files a doc or a
folder into its quarter in one step, and rolls the history logs over
when a plan of record is replaced. See
[`tools/archive/README.md`](./archive/README.md).

## [`tools/setup-guide/`](./setup-guide/) — the CAS setup guide's reference, from the code

Packaging step 2. `node tools/setup-guide/build.js` writes
`cas-ccps/docs/SETUP_GUIDE_REFERENCE.md`: each cas-ccps project, its
manifest, the Script Properties it reads, the triggers it installs and the
Studio Flows with their checks, extracted from the code, with what it can't
resolve listed as such. CI runs `--check` and fails when it is stale. The
steps in order are `cas-ccps/docs/SETUP_GUIDE.md`. Tested in
`tests/tools/setup-guide.test.js`; see
[`tools/setup-guide/README.md`](./setup-guide/README.md).

## [`tools/watchdog/`](./watchdog/check.js) — scheduled-job watchdog

Catches the failure mode a red X can't: an invalid `.github/workflows/*.yml`
file produces no run at all, so nothing fails loudly. Runs actionlint
against every workflow file and checks that every workflow with an
`on.schedule` trigger (currently `codeql.yml` and
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
healthy" floor. `.github/workflows/run-js-windows.yml` runs `run.js`'s
tests on Windows, where the operator pushes from, whenever `run.js` or its
test changes.

## [`tools/deploy-drift/`](./deploy-drift/) — is what's live actually what git expects?

Catches the gap behind two real incidents: a live GAS project silently
missing a function its own committed source already had, and separately,
genuine uncertainty over whether a redeploy had actually taken effect.
Most of the 10 deployed GAS projects (all 10 in `tools/gas-lint/project-map.json`; `cas-ccps:studio-steps` was archived 2026-11-17) sit behind Google's own sign-in wall or have no
web app at all, so this repo can't poll them — instead, each project
self-reports its own version marker outward via a `repository_dispatch`
call, which `.github/workflows/deploy-drift.yml` compares against what
`git log` says should be live, opening a tracking issue on mismatch. See
that tool's own README for the full mechanism, the credential threat
model, and why the marker has to live in its own file.

## [`tools/leaderhub-build/`](./leaderhub-build/) — assembles `student-leader-hub.html`

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
[`tools/leaderhub-build/README.md`](./leaderhub-build/README.md).

## Generators: [`tools/cas-ccps/`](./cas-ccps/), [`tools/kos-personal/`](./kos-personal/), [`tools/leader-hub/`](./leader-hub/)

Each writes committed files that are generated, never hand-edited; a test
fails when a committed copy drifts from its generator. Zero npm
dependencies, like the rest of `tools/`.

- **cas-ccps:**
  - `build-unit-rubrics.js` writes `cas-ccps/curriculum/unit-rubrics/` (a Flow 1 rubric and prompt per unit and course).
  - `build-lesson-assignments.js` turns the teacher's lesson docs (`cas-ccps/curriculum/lessons/`) into `55b_LessonAssignmentData.js` and `lessons/COMPETENCY_REVIEW.md`.
  - `check-parts-drafts.js` builds each lesson split (`lessons/PARTS.json`, or a draft in `lessons/PARTS_DRAFTS.json` before the teacher approves it) with the lesson builder and checks it, and `render-parts-drafts.js` writes the teacher's copy of every lesson in parts, `meta/LESSON_PARTS_2026-10.md`.
  - `build-zero-shot-answers.js` writes `cas-ccps/scripts/39c_ZeroShotAnswers.js` from `cas-ccps/curriculum/zero-shot/<lesson key>.txt` (each lesson's cold answer, what a chatbot writes from the student-facing prompt alone); `--check` fails if 39c is stale.
  - `render-agenda-slide.js` draws the daily agenda slide (67's `agendaSlideSpec_`) as a PNG through the pre-installed Playwright, without Google, and lists any text box that would spill: `node tools/cas-ccps/render-agenda-slide.js 2026-11-23 8175-L11=1,3-Odd 8177-product-pitch-financial-analysis=4 out.png --announce "…"` (one lesson, or both courses on one slide).
  - `import-lesson-drafts.js` is the mechanical half of importing a Teacher Dashboard lesson draft: it re-checks drafts with 65's rules, writes the fields that have one home in the repo, rebuilds, and reports field by field what still differs (`cas-ccps/docs/LESSON_IMPORT_PROCEDURE.md` has the session's steps).
  - `build-canvas-cartridge.js` writes the 8175/8177 Canvas cartridges (from the teacher's lessons) in `cas-ccps/curriculum/canvas-cartridges/`, using `lesson-cards.js` (a `.docx` lesson-card reader) and `zip.js` (a zlib-only zip reader and writer).
  - `sync-pacing-vocabulary.js` sets the pacing guide's vocabulary fields from the lesson cards.
  - `build-guide-notebook-sources.js` writes the Markdown copies of the four user guides (`cas-ccps/docs/notebooklm-sources/`) from the guides' HTML, for the user-guide notebook.
  - `generate-family-mail-prompt.js` regenerates `61_FamilyMailPrompt.js` from `cas-ccps/docs/FAMILY_MAIL_TRIAGE_PROMPT.md`.
  - `build-dashboard-demo-lessons.js` copies the first five lessons of each course (and the competencies they name) from `55b` and `data/CompetencyRegistry.csv` into `13b_StudentDashboardDemoLessons.js`, for the Student Dashboard's demo mode; `--check` exits 1 when it is out of date.
  - `build-dashboard-lessons.js` writes `13c_StudentDashboardLessons.js` from `55b` and `curriculum/lessons/STUDENT_CRITERIA.json`: each course's teaching order and, per lesson, its number, short title, every competency it names in the student's "I can" words (the measured milestones first) and its parts' one-line tasks, for the Student Dashboard's cards and Competencies tab (about 90 KB; the 2 MB `55b` stays out of that project); `--check` exits 1 when it is out of date.
  - `build-dashboard-review.js` writes `13d_StudentDashboardReview.js` for the Student Dashboard's Competencies tab Review panel: each lesson's one-line recap per competency (from its plan's competency alignment list), key terms (`55b`'s vocabulary) and linked videos (`VIDEO_LINKS.json`); `--check` exits 1 when it is out of date.
  - `generate-flow-prompts.js` regenerates `40_FlowPrompts.js`.
  - Every builder above takes `--check`, as does `generate-family-mail-prompt.js`; `generate-flow-prompts.js` doesn't, and `import-lesson-drafts.js` takes `check`, `apply` or `verify` and a drafts file instead.
- **kos-personal:**
  - `build-notebook-personas.js` writes the notebook persona editions in `kos-personal/rtp-core-router/notebook-sources/` (`--check`).
  - `generate-flow-prompts.js` regenerates `16_FlowPrompts.gs`.
- **leader-hub:** `generate-ai-prompts.js` regenerates `AiPrompts.gs`.

## [`tools/notebook-codebase/`](./notebook-codebase/build.js) — the repo as Gemini notebook sources

Writes `meta/notebook-codebase/`: the whole repo (code, docs, tools, tests)
as 14 Markdown sources plus an index, for a "KOS Codebase" notebook. Every
section heading names its source and file, and every source carries its
`Notebook source:` line. Unlike the generators above, its output is not
committed (it is gitignored): run it in the unzipped copy of `main`, which
needs no git, and upload what it writes. `--check` reports which sources
changed since the last build. See `meta/notebook-codebase/README.md`.

## [`tools/notebook-context/`](./notebook-context/build.js) — the "KOS Context" notebook

Writes `meta/notebook-context/`: six sources for a notebook about why KOS
exists rather than how its code works. A guide written for it
(`meta/notebook-context/GUIDE.md`: the three systems, their North Stars,
the value proposition by audience, and which sources are dated), then
copies of the North Star documents, the Economics of Depth paper and its
assumptions audit, the value review and audits, the system READMEs and
architecture, and the plan and handoff. The file list is chosen by hand in
the generator, and a missing file stops the build. Output gitignored, as
above; `--check` reports what changed. See `meta/notebook-context/README.md`.

## [`tools/html-lint/`](./html-lint/check.js) — inline `<script>` syntax check

Runs `node --check` on every inline `<script>` block of
`leader-hub/student-leader-hub.html`, in `gas-lint.yml`.
