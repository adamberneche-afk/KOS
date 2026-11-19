# cas-ccps Deployment Handoff

> ## ✅ STATUS: cas-ccps is live, with real rosters and the teacher's own lessons (updated 2026-11-01)
>
> **2026-11-01: everything through #370 is pushed** (`run.js --latest`,
> commit `9090981`: every project; the web apps on new versions, Teacher
> Dashboard v36, Student Dashboard v26). Merged since, not yet pushed:
> #373 (69 counts warm-ups under their course). The after-push steps and
> what each run showed are in
> [`archive/2026-27-Q2/meta/HANDOFF_2026-11-01.md`](../archive/2026-27-Q2/meta/HANDOFF_2026-11-01.md).
>
> **What #338 to #370 brought, since 10-31:** the SCR
> retry (D15), Flow 2's health numbers (`69`, a `Measures` tab), Flow 5
> merged into Flow 3 (turn Flow 5 off in Studio and run
> `syncFlowPromptsToSheet()` after the push), a part held by a failed check
> flagged, and the Canvas cartridges listing parts (re-import both). The
> after-push checks are in
> [`archive/2026-27-Q2/meta/HANDOFF_2026-11-01.md`](../archive/2026-27-Q2/meta/HANDOFF_2026-11-01.md).
>
> **2026-10-31: #338 to #351 were merged.** They fix every code
> finding of KOS Audit Docket IV: a caller check on every public function
> of both dashboards (new file `00b_ScriptOwnerGuard.js`), injection guards,
> retention approved by row, the duplicate repair opening each duplicate,
> the Family Sentinel's label, scan and scope (no Drive: run any function
> once after the push to approve). Git history was rewritten on 10-31:
> re-clone or download a fresh ZIP before pushing. The checks after the
> push are in [`archive/2026-27-Q2/meta/HANDOFF_2026-10-31.md`](../archive/2026-27-Q2/meta/HANDOFF_2026-10-31.md).
>
> **2026-10-29: everything merged through #337 is pushed** to every
> project with `run.js` and checked with `node run.js --verify` (every web
> app on its last push). The nightly rollout runs in APPLY for both
> courses and catches itself up (#333). The history of earlier pushes is in
> [`archive/2026-27-Q2/cas-ccps/DEPLOYMENT_HANDOFF.md`](../archive/2026-27-Q2/cas-ccps/DEPLOYMENT_HANDOFF.md); what is live now, and the operator's queue, are in
> [`archive/2026-27-Q1/meta/HANDOFF_2026-10-29.md`](../archive/2026-27-Q1/meta/HANDOFF_2026-10-29.md).
>
> **The repo-wide handoff is [`meta/HANDOFF_2026-11-19.md`](../meta/HANDOFF_2026-11-19.md)**:
> every system's state and the operator's queue in order. The other two
> systems' state is there and in their own handoffs.
>
> - **After any manifest scope change** to a web app that runs as the deploying
>   admin (both dashboards): run any function from that project's editor and
>   approve every prompt, then test one submit, before a class depends on it.
>   A prompt that never appears or can't be approved points to the district's
>   Admin console API controls.
>
> **All five cas-ccps flows are live and verified end to end.** All 9 cas-ccps
> projects (the original eight plus the Family Mail Sentinel) are live in a
> real `ccpsnet.net` Workspace account, Module 1 and Module 2 (Phase A + B) are set up, and Flow 1 through Flow 5 have each been
> built in Studio and confirmed with their own liveness check
> (`checkFlow2Liveness()`, `checkWarmUpFlowLiveness()`) — not just a green
> "Run Completed" banner. "Verified" there meant a real Studio run against
> seeded fixture data; real student submissions have run through Flow 2
> since 2026-10-15. `cas-ccps/docs/IMPACT_DASHBOARD.html` keeps the
> distinction in its own badges and metrics, and has no deployment entered yet.
>
> **kos-personal's two Studio flows were built and verified on 2026-09-08**
> (`kos-personal/CHANGELOG.md` Rounds 21-22), but failed in use from
> Sept 10 until a Sept 29 fix (`archive/2026-27-Q1/kos-personal/HANDOFF_2026-09-28.md`). **Nothing needs deploying
> from scratch**; the repo-wide handoff lists what is still pending. The
> rest of this document — the already-live section, the
> [Script Properties reference](docs/deployment/script-properties.md), the [from-scratch order of operations](docs/deployment/second-account.md#order-of-operations) — is
> kept as reference for standing up a *second* cas-ccps account, for
> extending any of the three systems, or for onboarding a session that
> needs the full history rather than just the current state.
>
> ### The two rules that govern this work
>
> - **SMP-004 air-gap.** Every `clasp push`, `clasp deploy`, browser action
>   and Studio edit happens at the operator's own already-authenticated
>   keyboard. An agent session prepares code and hands over exact commands; it
>   does not touch production. Paste logs back rather than granting access.
> - **FERPA.** Student response text stays in the student's own Doc as the
>   record of origin and is never copied into the central Ledger. That is why
>   `{{STUDENT_TEXT}}` is deliberately left unsubstituted in the materialized
>   prompt and why the Extract step that reads the doc stays in Studio.
>
> ### Read these, in this order, before touching anything
>
> 1. This section.
> 2. `tools/clasp-sync/DEPLOYMENT_RUNBOOK.md` — the real step-by-step for
>    clasp mechanics.
> 3. `meta/FLOW_DOCTRINE.md` — how a flow is built here and why.
> 4. `cas-ccps/HISTORY.md`'s deployment sections — what was tried, what the
>    three confirmed Studio walls are, and the bugs only a live push found.
>    Skim the follow-up sections; they are the reasoning behind every check
>    named below.
>
> ### What will not work, whatever you run
>
> Don't spend time on either — see `archive/2026-27-Q2/cas-ccps/archived/studio-steps/README.md`'s status
> banner and `tools/gas-lint/gcp-map.json`:
>
> - **Any custom Studio step.** All 8 cas-ccps and both kos-personal steps are
>   unreachable on this account. Pushing does not fix it; a district Workspace
>   admin enabling GCP would, with no code change.
> - **The `DIRECT_GEMINI` evaluation mode in `15c`.** It needs an API key, a
>   key needs a Cloud project, same wall.
>
> ### Still-useful leftovers below
>
> The already-live-account section below is kept for its exact commands and
> phase ordering — leader-hub's own guide follows the same shape, and a
> *second* cas-ccps account would run this exact sequence from Phase 1. The
> [Script Properties reference](docs/deployment/script-properties.md), the [runbook pointers](docs/deployment/second-account.md#the-one-document-that-actually-walks-through-this), and the
> [order-of-operations](docs/deployment/second-account.md#order-of-operations) are for anyone deploying to a *second*
> account. Three things in [`docs/deployment/second-account.md`](docs/deployment/second-account.md) are corrected inline where they
> appear: the from-scratch gotchas (all three were hit and a fourth was
> found), the "code-complete, not deployed" framing of Flows 2-5 (now stale —
> see the status banner above), and the `clasp create` mechanics (this
> account's projects already exist; `cas-ccps/clasp/local/` holds their real
> script IDs and is gitignored, so a new machine recreates it from the
> templates).

**Originally for:** the session that takes this codebase from "code complete,
verified in the Node sandbox" to "live in a real Google Workspace account."

**Written:** 2026-08-31, at the end of a session that closed the
`27_LessonFrameGenerator` gap, verified and fixed 6 real bugs from a third-party
code review, and fixed a real column-collision bug that work introduced.

**Updated:** 2026-09-04, at the end of the session that built Flows 2-5 in
Studio and verified all five live end to end — see the status banner and
"Lessons learned" ([`docs/deployment/flow-lessons.md`](docs/deployment/flow-lessons.md)).

## Topics

Split out of this handoff on 2026-11-17, one doc per topic under
[`docs/deployment/`](docs/deployment/README.md); the banner's history of earlier
pushes is in
[`archive/2026-27-Q2/cas-ccps/DEPLOYMENT_HANDOFF.md`](../archive/2026-27-Q2/cas-ccps/DEPLOYMENT_HANDOFF.md).

- **[Lessons learned closing out Flows 2-5](docs/deployment/flow-lessons.md)**: "These came out of actually building Flows 2-5 in Studio this session, not from reading the code." Also [What changed to get here](docs/deployment/flow-lessons.md#what-changed-to-get-here): "**Every flow is ported off the custom Studio steps.**"
- **[Feature switches, the overnight check and the nightly lesson rollout](docs/deployment/feature-switches.md)**: "With `WARMUP_TEXT_BOX` on, a warm-up is answered on the Student Dashboard instead of in a doc". Also the assignment doc header, feedback as comments (`FEEDBACK_AS_COMMENT`) and the nightly lesson rollout (`ROLLOUT_AUTO_APPLY`).
- **[Deploying a second account from scratch](docs/deployment/second-account.md)**
  - [The one document that actually walks through this](docs/deployment/second-account.md#the-one-document-that-actually-walks-through-this): "**`tools/clasp-sync/DEPLOYMENT_RUNBOOK.md` is the real, step-by-step guide.**"
  - [Order of operations](docs/deployment/second-account.md#order-of-operations): "**Module 1 must exist and be live first** — it's the prerequisite for everything else"
  - [The real gap: Studio Flows 2-5](docs/deployment/second-account.md#the-real-gap-studio-flows-2-5--and-its-worse-than-not-deployed): "**CLOSED for this account as of 2026-09-04 — all five flows built and verified live.**"
  - [Before going live, read](docs/deployment/second-account.md#before-going-live-read): "`cas-ccps/docs/FERPA_DATA_MAP.md` in full — the compliance reference paired with `cas-ccps/docs/SYSTEM_ARCHITECTURE.html`'s Security Model section."
- **[Script Properties reference](docs/deployment/script-properties.md)**: "**Where `getConfig_()` looks, in order** (`00_SharedConfig.js`): 1. The project's own Script Properties. These always win, so anything set today keeps working unchanged."
- **[The other two systems](docs/deployment/other-systems.md)**: "A fresh deployment session covers three, and each carries its own guide with its own sequence and its own status banner — **read each system's own guide for its current state; the summaries below are pointers, not the live record.**"

## Current repo state

- Work lands on `main` through PRs from `claude/*` branches; the operator pushes `main` with `node run.js --latest` (`tools/clasp-sync/run.js`, which replaced `run.ps1` on 2026-10-17).
- **Zero errors is the gate. The warning counts are not** — both tools warn
  about accepted, documented things, and both numbers move whenever a check is
  added or a warning is legitimately resolved (gas-lint has gone 4 → 5 → 19
  as checks were added, doc-currency 9 → 8). Read the findings, not the count:
  `npm test`, `node tools/gas-lint/check.js` (Checks A–L), `node
  tools/doc-currency/check.js` (5 checks), `node tools/clasp-sync/sync.js`
  (all 9 cas-ccps projects build into `cas-ccps/.clasp-build/`).
- **All 9 projects exist in a real Google account.** Their real script IDs
  live in `cas-ccps/clasp/local/*.clasp.json`, which is gitignored — so it is
  present on the deploying machine and absent everywhere else. A fresh clone
  must recreate those files from
  `cas-ccps/clasp/templates/*.clasp.json.template` (still carrying
  `"scriptId": "REPLACE_WITH_REAL_SCRIPT_ID"`) before `sync.js` can build.

Don't re-derive the bug-fix history — it's in `cas-ccps/HISTORY.md` if you
need it. The deployment record and the follow-up sections after it are the
relevant ones; everything before them is pre-deployment reconciliation work.

## Bringing an already-live account up to current HEAD

**This is the operation that actually applies now**, and it is not the
from-scratch sequence in [`docs/deployment/second-account.md`](docs/deployment/second-account.md#order-of-operations). The 9 projects exist, Module 1 and Module 2
(Phase A + B) are set up, and Flow 1 works against real data — but HEAD has
moved a long way since that push. Scripts `35`, `37`, `39`–`42`, the Ledger
schema guard (`38`), the student-data access repair (`50`), the course year
builder (`51`) and the Canvas roster import (`52`) all landed afterwards, and
**none of them do anything until they are pushed and their setup functions
are run once.** That is what this section is.

Everything here runs at **the operator's own keyboard** (SMP-004: an agent
session must never `clasp push` to production). The usual push is
`node run.js --latest` (`tools/clasp-sync/run.js`; `--only <projects>` to
limit it). By hand, from the repo:

```bash
git pull
node tools/clasp-sync/sync.js central-ledger
cd cas-ccps/.clasp-build/central-ledger && clasp push
```

Then, in the Apps Script editor's **Run** dropdown. The order matters: each
phase answers a question that would otherwise make the next phase's failure
unreadable.

### Phase 1 — is the ground true? (before anything else)

| # | Function | Why, and what to expect |
|---|---|---|
| 1 | `checkLedgerSchema()` | **First, and read the log before running anything else.** The live Ledger's columns had shifted, which made `LEDGER.TEACHER_EMAIL` return a person's *name* and silently broke every MatrixRegistry lookup with no error anywhere. If it reports drift, run `repairLedgerSchema()` — it backs the tab up to `Ledger_BACKUP_<timestamp>` first and refuses outright if it cannot verify the repair is safe from the headers alone. Nothing downstream is trustworthy until this is clean. |
| 1b | `showSetupStatus()` | What is on, in one list: each expected trigger (on, in the Ledger cycle, or OFF with the function that installs it), the rollout's catch-up if one is pending, any trigger it doesn't know, each switch and setting as this project reads them, and the weekly tabs' row counts. Ends with a "TO TURN ON" line naming every installer to run. Names, values of non-secret switches and counts only. |
| 2 | `runFlowPreflightCheck()` | Structure: every tab present and wide enough, all four flow triggers installed **exactly once** (a duplicate is reported as a failure, not a pass — two copies of a harvest race each other), the required Script Properties set, the self-healing tabs healthy. Each finding says which of the four questions it answers. Run this before the canaries; a canary failing for a missing tab wastes the canary. |

### Phase 2 — give the flows something to read and something to run on

| # | Function | Why, and what to expect |
|---|---|---|
| 3 | `syncFlowPromptsToSheet()` | Writes the `FlowPrompts` tab, so a Flow reads its system prompt from a chip instead of carrying a pasted copy. A future prompt change is then a `clasp push` plus one re-run, not a hand-paste per Flow. |
| 4 | `installFlowFixtures()` | Seeds dummy rows at all five flows' trigger conditions, so a Flow has something to match. Without them a Flow reports a green "Run Completed" over zero rows, which is indistinguishable from success and is where a lot of last session went. `checkFlowFixtures()` reports what is present; `removeFlowFixtures()` takes them out. Fixture data uses `.invalid` addresses and `*-FIXTURE-*` IDs — the Flow-2 fixture's `StagingRowRef` is the literal `FIXTURE` precisely so the harvest cannot complete a real student's submission. |
| 5 | `installFlowInputTriggers()` | Flow 2's two time triggers (1-minute build, 5-minute harvest; `everyMinutes` can't take 2). This is what makes `FlowInput` populate at all. Since step 17e the Ledger cycle runs both instead. |
| 6 | `installWarmUpFlowTriggers()` | Flows 3/4/5's two triggers (materialize + harvest, both 5-minute). Nothing in `41_WarmUpFlowBridge.js` runs until this is done (or until the Ledger cycle, step 17e, runs them). |
| 6a | `installQueueWatchdogTrigger()` | The queue watchdog (`34`), every 10 minutes (run by the Ledger cycle since step 17e): it escalates stuck rows, rewrites the `Health` tab, and writes the `KOS_CAS_SIGNAL` doc. Nothing else installs it (the live Ledger ran without it until 2026-10-12). Safe to re-run; `removeQueueWatchdogTrigger()` undoes it. It runs in dry run until the Script Property `CAS_WATCHDOG_DRY_RUN` is exactly `false`. |

### Phase 3 — does the Apps Script half work, with Studio stubbed?

| # | Function | Why, and what to expect |
|---|---|---|
| 7 | `runFlow2Canary()` | Flow 2's Apps Script half end to end: it self-provisions a scratch student doc and TeacherMatrix, stubs Studio out **deliberately**, and cleans up. Paste the log. A pass means the lookup chain and the harvest are sound and any remaining failure is in the Flow itself. A pass says nothing about whether a Flow exists — by design, and it says so in its own log. |
| 8 | `runWarmUpFlowCanary()` | The same for Flows 3, 4 and 5: the archetype decision table, the materialization and the harvest against scratch rows. Flows 3 and 4 are covered as pure logic only — both need Drive and a real student doc, which a canary must not fabricate. |

### Phase 4 — build the Studio side (the part nothing here can automate)

| # | Function | Why, and what to expect |
|---|---|---|
| 9 | `syncFlowBuildSpec()` | Writes the `FlowBuildSpec` tab: every tab name, column number, header, trigger condition, prompt key and ownership rule for all five flows, **derived from the constants the code reads**. **Build each Flow from that tab.** The judgement half — connector names, temperature, token limits — is deliberately not generated and lives in the Module 2 Phase B wizard dialogs and `15_StudioFlowPrompts.js`. `checkFlowBuildSpec()` reports when a column has moved since the last sync. |
| 10 | `checkFlowBinding()` | **Keep this open in a second tab while wiring each Flow's last step, not after.** It logs the exact binding to copy — column number, header, which columns the harvest owns — from the same constants the harvest reads, so it cannot drift the way a setup document does. Once rows arrive it diagnoses them: a one-column shift is reported *as a shift, with its offset*, not as "the Flow is blank". `checkFlow2Binding()` is the equivalent for Flow 2's write-into-the-row shape. |

Each Flow's Studio side is: a Sheets trigger on the input tab → **one** Gemini
call → a native "add row"/"update row" writing back. Nothing else belongs in
the Flow (`FLOW_DOCTRINE.md` rule 1).

### Phase 5 — has a Flow ever actually answered?

| # | Function | Why, and what to expect |
|---|---|---|
| 11 | `checkFlow2Liveness()` | Whether anything has ever been written into `FI.GEMINI_FULL_OUTPUT`, and whether rows have sat READY with nothing coming back. |
| 12 | `checkWarmUpFlowLiveness()` | Per flow: how many jobs are waiting, and has that flow **ever** written to `WarmUpFlowReturn`. |

### Phase 6 — course content and rosters (after Module 2 Phase A + B)

In this order: each step needs the one before it. From Central Ledger unless
noted.

| # | Function / action | Why, and what to expect |
|---|---|---|
| 13 | `importCourseData()` | Runs the competency registry, pacing guide and rubric importers (they find `CompetencyRegistry.csv`, `PacingGuide_CAS_Context.json` and `CompetencyRubrics.json` in Drive by name, so upload the current repo copies first), then `checkCourseData()`: 113/108 competencies and rubrics, 20 units, readable dates. It also creates the `NoSchoolDays` tab from the CCPS 2026-27 calendar; edit it for snow days. Safe to re-run. |
| 14 | Set `M2_ENABLED` = `true` in **Central Ledger's** Script Properties (the Module 2 wizard sets it only in the Unified Manual project), then `previewUpcomingLessons()`, then `buildUpcomingLessons()` | Without it these log "Module 2 is not enabled" and build nothing. Drafts a LessonContext row (and its Lesson Frame doc) for each ClassSchedule period on each school day in the next 7 days, from the pacing guide. Needs Phase B's ClassSchedule. Never overwrites a slot that already has a lesson. |
| 15 | `installLessonPlanTrigger()` | Runs `buildUpcomingLessons` daily at about 2am, before the 3:30am warm-up queue build. `removeLessonPlanTrigger()` undoes it. |
| 15a | **The nightly warm-ups** (added 2026-10-18). Set the Central Ledger's Script Properties `TEACHER_EMAIL` (exactly the ClassSchedule `teacher_email`) and `TEACHER_NAME`; then `installWarmUpTriggers()` (23: 3:00 profiles, 3:15 scoring, 3:30 queue build) and `installArtifactSyncTrigger()` (33: 3:05 artifact sync); then step 6's `installWarmUpFlowTriggers()` if not done | Without `TEACHER_EMAIL` the 3:30 build matches no period ("Teacher: " blank in its log); without `TEACHER_NAME` every warm-up snapshot has a blank teacher name (docs fail; the text box no longer minds). The Unified Manual's Module 2 wizard installs the 3:05 trigger only in its own project. Each morning the CAS signal's LAST NIGHT section, and its 5 a.m. email, report the runs. |
| 16 | Set the Script Property `SEED_UNITS` (e.g. `S1-U1`), then `previewAssignmentSeed()`, then `seedAssignments()` (53) | Writes each unit's LIVE TeacherMatrix row for both courses from the repo's unit rubrics, with Config IDs `CAS-S1-U1-8175` / `CAS-S1-U1-8177`: what step 17 needs. Replaces the Rubric Upload Form → Studio Flow 1 → confirmation path, which never produced an assignment (2026-10-06). Delete `SEED_UNITS` afterwards: while set, it overrides the LessonSchedule (step 17a). |
| 17 | Upload each Canvas course's gradebook export (Grades → Export → Export Entire Gradebook) to Drive; `prepareRosterSections()` and put each section's period in `CanvasSectionMap` (this can be done before step 16); then **once per course**: set the Script Property `ROSTER_CONFIG_ID` to that course's LIVE assignment Config ID; `previewRosterEnrollment()`; put each section's period in `CanvasSectionMap`; preview again; `applyRosterEnrollment()` | Enrolls the roster through `intakeStudent_()` (02), exactly as the intake form would. Only students whose period is in the assignment's course (its TeacherMatrix CourseName) are enrolled; the others are skipped as `OTHER_COURSE`. Needs a LIVE assignment and ClassSchedule. |
| 16a | After a change to assignment criteria in the repo: push, then `previewAssignmentRefresh()` and `refreshAssignments()` (Central Ledger, `53_AssignmentSeeder.js`) | Rewrites the milestones, Definition of Done and milestone competency IDs of the LIVE rows the repo generated; FlowInput rows already written keep their text. First run 2026-10-19 (L07: no peer-reply grading, real criteria for 8175-6 and 8175-49) |
| 17a | **Switch to the teacher's lessons. Done live 2026-10-07** (`HISTORY.md`). In order: `seedLessonSchedule()`, then type start dates in the `LessonSchedule` tab (a lesson runs until the next starts); set `SEED_UNITS` to the lesson keys (`8175-L06,8177-employee-handbook-operations`) or delete it, then `previewAssignmentSeed()` / `seedAssignments()` and delete `SEED_UNITS`; set `ARCHIVE_CONFIG_ID` to **one** retired assignment at a time (`CAS-S1-U1-8175`, then `CAS-S1-U1-8177`) and run `previewArchiveAssignment()` / `archiveAssignment()` for each; `previewRemoveDraftedLessons()` / `removeDraftedLessons()` (after the last class of the day: it trashes today's frame docs too) then `buildUpcomingLessons()`, twice if it stops early; then step 17 with the new Config IDs (`CAS-8175-L06`, …) | The lesson builder, warm-ups and assignments then follow LessonSchedule; see the cas-ccps README, "The teacher's lessons and the LessonSchedule tab". A `SEED_UNITS` left at `S1-U1` makes the seeder plan nothing new, and a comma-separated `ARCHIVE_CONFIG_ID` archives nothing (both seen live). |
| 17b | **Roll out the next lesson** (every new lesson, both courses; done by hand while the nightly lesson rollout, "Nightly lesson rollout" in [`docs/deployment/feature-switches.md`](docs/deployment/feature-switches.md), is still in shadow for a course; `archive/2026-27-Q1/meta/CAS_DESIGN_THREADS_2026-10-16.md` Thread C). A date in `LessonSchedule` makes no student docs by itself. In order: the lesson's `start_date` as `YYYY-MM-DD` (run `seedLessonSchedule()` first if it has no row); the date within 7 days; delete `SEED_UNITS`; `previewAssignmentSeed()` then `seedAssignments()` (the LIVE TeacherMatrix row); set `ROSTER_CONFIG_ID` to the lesson's Config ID (e.g. `CAS-8175-L07`, one per run); `previewRosterEnrollment()` then `applyRosterEnrollment()` (creates and shares each student's doc and Ledger row; students already enrolled are skipped, so a re-run after a timeout is safe); repeat for the other course | Usual reasons a date does nothing: no LIVE assignment yet, the date more than 7 days out, `SEED_UNITS` still set, an 8177 lesson with no approved prompt file, or a stale Canvas export missing new students. `SECTION_NOT_MAPPED` in the preview means a section has no period in `CanvasSectionMap`. The 2 a.m. `buildUpcomingLessons()` makes class-level lesson frames, not student docs. |
| 17c | **Split a period whose groups meet on alternate days** (added 2026-10-19: period 3's odd-day and even-day groups are separate, cross-listed Canvas sections). In `CanvasSectionMap`, give each section its own period (`3-Odd`, `3-Even`); in `ClassSchedule`, replace the period's rows with one row per new period and course (`3-Odd` `ODD`, `3-Even` `EVEN`); `previewPeriodRelabel()` then `applyPeriodRelabel()` (`52`: moves students already enrolled to their section's period, counts only); `previewOffDayWarmUps()` then `retireOffDayWarmUps()` (`24`: warm-ups already queued for a day the student's period doesn't meet become `NOT_MEETING`, never scored or shown) | Day type is the calendar date's parity (odd date, odd day); A/B is the bell schedule and doesn't matter here. A period label is text, so `3-Odd` works everywhere a period appears; new docs go in a `3-Odd` folder, older ones stay. The 2 a.m. `buildUpcomingLessons()` makes lesson rows for the new periods from then on. |
| 17d | **A period that meets daily for half the time** (added 2026-10-19: period 1, same pace as the ODD/EVEN periods). Push first, then set its `ClassSchedule` rows' day_type to `DAILY_HALF` (code from before this change treats `DAILY_HALF` as not meeting). Give every lesson already taught a `start_date` in `LessonSchedule` (the warm-ups review from those, below). `WarmUpPlan` is optional: one row per pair of class days, on the day the pair starts, for a specific seed | A `WarmUpPlan` row covers its date and the next weekday: the ODD and EVEN classes get the same warm-up, and a `DAILY_HALF` period gets it on the first day only; on the second the Student Dashboard shows the first day's feedback and extra-credit reply box. A day no row covers takes a random seed (fixed for the pair) from the lessons with a `LessonSchedule` start_date on or before it (since 2026-10-19), and a `DAILY_HALF` period then starts a pair on odd dates. A lesson with no start date is never picked. `DAILY` is unchanged (a new warm-up every day). |
| 17e | **One trigger for the Ledger's frequent jobs** (added 2026-10-19). After the push, in the Central Ledger: `previewLedgerCycle()`, then `installLedgerCycle()` (`64`): it deletes the frequent jobs' own triggers (`bridgeQueue`, `runStagingTurnstile`, `backPropagateCompletions`, `buildFlowInputRows`, `harvestFlowInputResults`, `buildWarmUpFlowInputs`, `harvestWarmUpFlowReturns`, `registerDeliveredWarmUps`, `runAlignmentLogBackfill_`, `runQueueWatchdog`, whichever exist) and installs `runLedgerCycle` every minute, which runs those same jobs in turn at their cadence. Rollback: `restoreLedgerTriggers()` | Why: ~45 Google-side failures in a week from ten triggers racing one spreadsheet. The 3 a.m. jobs and the nightly ones keep their own triggers. A job whose installer is re-run gets its own trigger back and the cycle leaves it alone (preflight flags the double); run `installLedgerCycle()` again to fold it in. Errors show in the cycle's log as `[LC] Errors: <job>: <message>`; since 2026-10-22 each job's failures are also counted (`LEDGER_CYCLE_ERRORS`), named in the CAS signal and the overnight email, and a job failing 10 cycles in a row makes the trigger fail so Google's failure email arrives. |
| 17f | **Stop tagging the Canvas export by hand** (added 2026-10-20). After the push, in the Central Ledger, while the Ledger's periods are right: `previewPeriodOverrideSeed()` then `seedPeriodOverrides()` (`52`). They add a `PeriodOverride` row (`student_account`, `period`) for each student whose period isn't the one their section code gives: today, period 3's `3-Odd` and `3-Even`. Then a plain export is enough; `previewPeriodRelabel()` should report 0 to relabel | Enrollment, the nightly rollout and relabel read `PeriodOverride` before `CanvasSectionMap`. The seed never changes a row already there and logs counts per period only. A student who joins a split period later needs a row typed in by hand; until then the export can still be tagged as before. |
| 17g | **Triggers the setup wizard put in the wrong project** (added 2026-10-20). After the push: in the **Unified Manual** project, `previewMisplacedTriggers()` then `removeMisplacedTriggers()` (`28`). In the **Central Ledger**, `installRegistrationTrigger()` (`64`; already in the cycle since 17e, so it should say so), and `installAlignmentBackfillTrigger()` if the backfill should run | The wizard (28) runs in the Unified Manual project but installed triggers for Central Ledger functions, each failing on every run. Removal touches only triggers whose function that project doesn't have. `installLedgerCycle()` now always includes `registerDeliveredWarmUps`. The backfill retries alignment logging for a lesson whose direct log failed (22); both installers add their job to the Ledger cycle, or give it its own trigger when the cycle isn't installed. |
| 17h | **The Covered So Far docs for the course notebooks** (added 2026-11-08, plan L6). After the push, in the Central Ledger: `refreshCoveredSoFar()` once (`76`). It makes "Covered So Far — <course>" for each course in the teacher folder (`TEACHER_FOLDER_ID`) and logs what it wrote; the nightly rollout keeps them current after that. Then add each course's doc as a source in that course's notebook. | The lessons taught so far with their goals, competencies and key concepts, and the next one, from `LessonSchedule` and the lesson files; nothing about students. The rollout rewrites a doc in place (same file) only when it changed; check whether the notebook shows a sync prompt for a rewritten source, since a notebook may not re-read it by itself. |
| 17i | **Installers for the last hand-added triggers** (added 2026-11-08). After the push, in the Central Ledger: `installIntakeTriggers()` (`64`); with the Ledger cycle installed it says `bridgeQueue`, `runStagingTurnstile` and `backPropagateCompletions` already run in the cycle (nothing changes). `installFormSubmitTrigger()` (`18`) only if students use the intake form; it says so if the trigger already exists. | Before 11-08 these four were added by hand in the Triggers panel (setup guide gap 3). Both installers are safe to run again. |
| 17j | **Share notices and CAS mail** (added 2026-11-08, plan L7). After the push, run any Central Ledger function once and approve if Google asks (the Drive advanced service's first use; no scope was added). After the next rollout, check the inbox: no "shared with you" notice per student doc. Add a Gmail filter on `subject:"[CAS]"`. | The teacher's commenter and editor shares go through the Drive API with the email off (`shareWithoutEmail_`, `02`), falling back to DriveApp (which emails) if that fails; the execution log says `[S02] Share without email failed (…)` then. Students' shares still email. Every CAS mail is sent as "CAS" with a `[CAS] ` subject prefix (`casMail_`, `00`). |
| 17k | **Forms (Phase 4a/4b)** (added 2026-11-08). After the push, open the Student Dashboard's Apps Script project and run `reportDeployVersion` (`49`) once, then allow the Forms permission Google asks for (`75_FormReader.js`). The web app runs as its owner, so opening the dashboard itself never prompts. For a Form part: make one blank Google Form as its template and set `WORK_TEMPLATE_<PART KEY>` (README, "Work types: a part as a Google Form") before the part is marked `workType: "form"`. The first is 8177 Market Research, Part 2. | The rollout copies the template per student and shares it; at Submit the reader checks the form's structure against the part's `formChecks` (never its responses) and writes the snapshot doc Flow 2 reads. A Form part with no template set is a `NO_WORK_TEMPLATE` PROBLEM row. |
| 17l | **Slides (Phase 4c)** (added 2026-11-09). After the push, open the Student Dashboard's Apps Script project and run `reportDeployVersion` (`49`) once, then allow the new Google Slides permission (`presentations`, for `77_SlidesReader.js`; it reads only). Opening the dashboard itself never prompts: it runs as its owner. For a Slides part: make one blank Google Slides deck (one empty title slide) as its template and set `WORK_TEMPLATE_<PART KEY>` (README, "Work types: a part as a Google Slides deck") before the part is marked `workType: "slides"` and before the rollout that makes it. Nothing is marked yet. | The rollout copies the deck per student (the teacher a commenter) and shares it; at Submit the reader checks the slides against the part's `slideChecks` and writes the snapshot doc Flow 2 reads. Until approved, a deck's Submit is `SLIDES_UNREADABLE` in `SubmitFailures`. |
| 17m | **Sheets (Phase 4d)** (added 2026-11-09). No new permission: the Student Dashboard already has the Sheets scope. For a Sheets part: make one blank Google Sheet (one empty tab, or the tab its checks name) as its template and set `WORK_TEMPLATE_<PART KEY>` (README, "Work types: a part as a Google Sheet") before the part is marked `workType: "sheet"` and before the rollout that makes it. Nothing is marked yet. | The rollout copies the sheet per student (the teacher a commenter); at Submit the reader checks the student's own copy against the part's `sheetChecks` and writes the snapshot doc Flow 2 reads. |
| 17n | **Every minute on the way to feedback** (added 2026-11-14). Nothing to run: after the push the Ledger cycle runs `harvestFlowInputResults`, `backPropagateCompletions`, `unlockReadyParts` and `runTurnInCheckFlow` every minute (they were every 5, 2, 5 and 2). A job with its own trigger instead (no cycle) keeps its old interval until its trigger is deleted and its installer run again. A day later, `showSetupStatus()` shows each job's run time and the cycle's share of the daily trigger run time; `reportEvaluationHealth()` logs the same | If a job costs more than it saves, set the Script Property `LEDGER_CYCLE_EVERY` to e.g. `{"harvestFlowInputResults": 5}` to slow it without a push. The cycle's own 4-minute budget still puts off any job that would start late. |
| 17o | **Checks before work, quiet hours and the backstop** (added 2026-11-15). Nothing to run for the checks: after the push each job on the way to feedback runs only when its check finds work, chains to the next step in the same run, and every 15 minutes the cycle runs everything without checks. If `LEDGER_CYCLE_EVERY` was set to slow jobs before the push, remove it (or keep it: a slowed job still runs at once when the step before it hands it work). Optional: `installLedgerChangeProbe()`, submit one test assignment, then `reportLedgerChangeProbe()` and `showSetupStatus()` | `showSetupStatus()` prints "At this rate: about N h a day (P% of the 6 h)" with WARN over half and ALERT over 80%. Script Properties: `LEDGER_CYCLE_QUIET` (`off`, or JSON `{"from":22,"to":6,"weekends":true,"daysOff":true}`), `LEDGER_CYCLE_BACKSTOP` (minutes, 1–60, default 15), `LEDGER_CYCLE_GATES` = `off` (every job on its cadence, as before). `removeLedgerChangeProbe()` removes the probe; its `_ChangeProbe` tab stays (times, change types, tab names and row counts only). |
| 18 | Import `curriculum/canvas-cartridges/8175.imscc` / `8177.imscc` into each Canvas course (Settings → Import Course Content → Common Cartridge 1.x Package); a sandbox course first | Its assignments ask students to submit their CAS document's link, so do it once students have their docs (step 17). |

These two are the only things that can tell you a Flow is live. A Flow that
matched zero rows also reports a green "Run Completed".

**The D1 leader-hub connection** is separate from the flows and has its own
diagnostic now: `runLeaderHubConnectionCheck()`, run from the **Teacher
Dashboard** deployment (not central-ledger — it lives in
`07_TeacherDashboard.js` beside the API it tests). It separates the causes
that all surface in leader-hub as one opaque error: the OAuth client ID
unset, `TEACHER_EMAIL` unset, or the token gate fine while the source tabs are
empty — which leader-hub cannot tell apart from a rejection. It says outright
that it *cannot* check the one remaining cause, a stale `/exec` URL stored on
leader-hub's side, because nothing in the script can see that.

**Which check answers which question**, across all three systems. "Nothing
came back" is one answer covering four causes, and the third looks exactly
like the first:

| Question | cas-ccps | leader-hub | kos-personal |
|---|---|---|---|
| Is the structure sound? | `runFlowPreflightCheck()` | `runLeaderHubPreflight()` | `runKosPersonalPreflight()` |
| Does the script half work? | `runFlow2Canary()`, `runWarmUpFlowCanary()` | `runAiFlowCanary()` | `runStudioReturnCanary()` |
| Are the columns bound right? | `checkFlowBinding()`, `checkFlow2Binding()` | `checkAiFlowBinding()` | `checkStudioFlowBinding()` |
| Has a Flow ever answered? | `checkFlow2Liveness()`, `checkWarmUpFlowLiveness()` | `checkAiFlowFixtures()` | `checkStudioFlowLiveness()` |

`gas-lint`'s Check I holds every declared flow to having all four, so if you
add a flow and skip one, the linter says which question you can no longer
answer.

Only after Phases 1-3 are clean is there any point configuring Flow 2 in
Studio, because before that there is no `FlowInput` row for it to read.

Two things that are **blocked** on this account, not merely unpushed, so
don't spend time on either no matter what you run — see
`archive/2026-27-Q2/cas-ccps/archived/studio-steps/README.md`'s status banner and
`tools/gas-lint/gcp-map.json`:

- Any custom Studio step. All 8 are unreachable on this account.
- The `DIRECT_GEMINI` evaluation mode in `15c`. It needs an API key, a key
  needs a Cloud project, same wall.

### How to work with an agent session on this

The agent cannot see your account, and you should not give it access. What
makes the loop fast is pasting back the **whole** log of whatever you ran,
including the boring lines — every check here is written to be read that way,
and the useful signal is usually in a line that looks like noise (a duplicate
trigger, a status that reads `ERROR_EMPTY_OUTPUT` rather than
`ERROR_HARVEST_FAILED`, a column offset).

Worth pasting without being asked:

- The full execution log of any check above, pass or fail.
- The Studio run panel for a Flow that "completed" but changed nothing — a
  green **Run Completed** over zero rows is the single most common false
  positive here, and the step list plus row counts is what distinguishes it.
- The first two rows of any tab a check complains about, headers included.
  Positional drift is invisible in prose and obvious in two rows.

If a check's own output contradicts this document, the check is right: it is
derived from the constants the code reads, and this file is prose.

### A first message for a fresh session

```
Read the newest meta/HANDOFF_*.md (the repo-wide handoff: every
system's state and my queue, in order), then cas-ccps/DEPLOYMENT_HANDOFF.md's
status banner. All three systems are on the same ccpsnet.net account.
cas-ccps: 9 projects live, all five flows live, real students submitting
and answering warm-ups; merged work waits on a `node run.js --latest`
push. kos-personal and leader-hub: as the handoff says. Nothing needs
deploying from scratch. I run every clasp/browser/Studio action myself
(SMP-004) and paste logs back.
[Describe what you actually need: one of the open items above,
extending one of the three systems, investigating something that
looks wrong, or standing up a second account from this same codebase.]
```

## Verification, before and after

Before touching any real Google account, confirm the local build is still
clean (nothing should have drifted since this handoff was written):

```bash
cd /home/user/KOS
npm test                          # all passing (count grows; don't assert a number)
node tools/gas-lint/check.js      # expect 0 errors (19 warnings on 2026-10-23)
node tools/doc-currency/check.js  # expect 0 errors (8 warnings on 2026-10-23)
node tools/clasp-sync/sync.js     # expect all 9 cas-ccps projects to build cleanly
```

**Zero errors is the gate; the warning counts are not.** Both tools warn about
things that are accepted and documented (an unmerged addendum, a dynamic
`google.script.run` dispatch, function names living in an Apps Script project
that was never committed here), and both numbers move whenever a check is
added or a warning is legitimately resolved — gas-lint has gone 4 → 5 → 19
and doc-currency 9 → 8 since this section was written. Read the findings, not the
count.

After each project goes live, the runbook's own verification steps (spot-check
a menu item, run a smoke test) matter more than anything in this repo — a
clean local build says nothing about whether a real Apps Script project
actually authorized correctly, has the right OAuth scopes accepted, or has its
triggers actually firing on Google's clock, not just installed.

## What to read next

`cas-ccps/HISTORY.md`'s final sections — the deployment record. They cover the
three Studio walls confirmed by direct test, the manifest and schema bugs only
a live push could surface, the `=AI()` investigation and why it's closed, the
`FlowInput` redesign that replaced Flow 2's plumbing, the ports of Flows 3/4/5
and of kos-personal's write-back, and the four `gas-lint` checks (H-K) that now
enforce the parts of `meta/FLOW_DOCTRINE.md` a machine can hold.

*Correction:* this paragraph used to end by warning against carrying this
project's Studio constraints over to kos-personal, "which runs on a different
account with GCP access intact." That was wrong, twice over — the operator
confirmed kos-personal is deployed on this same `ccpsnet.net` account, so the
org-wide GCP block reaches it and its two custom steps are blocked
identically. They were ported the same way
(`kos-personal/12_StudioReturnHarvest.gs`). Do not read an account boundary
into a system boundary; check the target account's Project Settings and
declare what you find in `tools/gas-lint/gcp-map.json`.
