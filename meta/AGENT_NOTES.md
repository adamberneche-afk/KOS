# Agent notes from the archived handoffs

Each session handoff ended with notes for the next agent session: the
traps, conventions and "don't re-derive this" findings. The handoffs
themselves are archived by school quarter (`archive/<quarter>/meta/`,
listed in [`archive/INDEX.md`](../archive/INDEX.md)); their notes are gathered here,
word for word and oldest first, so they stay in everyday reach.

**Point-in-time:** each block is as its handoff wrote it. Where a later
note, a live handoff or the code disagrees, the later one wins. Links
inside a block are relative to `meta/` as it was, so a link to a doc
that has since been archived is under `archive/<quarter>/` at the
same path (the index says which quarter). The live
handoffs (`HANDOFF_2026-11-15.md` onward) keep their own notes.

Pruning the notes that no longer hold is a later pass of its own.

## From the 2026-10-05 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-05.md`)

- **Read first:** this file, then the per-system handoff for the system you're working on.
- **Deploy markers:** any change to a GAS project's files needs `node tools/deploy-drift/stamp.js <project>`, committed on its own.
- **Generated files:** they are never hand-edited. Run the generator; the tests fail while a committed copy is stale:
  - `tools/cas-ccps/build-unit-rubrics.js`
  - `tools/cas-ccps/build-canvas-cartridge.js`
  - `tools/cas-ccps/sync-pacing-vocabulary.js`
  - `tools/kos-personal/build-notebook-personas.js`
  - the `generate-*-prompts.js` scripts
- **Checks before a PR:**
  - `npm test`
  - `node tools/gas-lint/check.js`
  - `node tools/doc-currency/check.js`
  - `node tools/coverage-gaps/check.js`
- **FERPA:** student text never goes into the KOS Ledger or the notebook, and rosters stay in the teacher's Drive (`cas-ccps/docs/FERPA_DATA_MAP.md`).
- **The operator runs things live and pastes back logs.** Ask for the log; don't assume a run happened.
- **Housekeeping:**
  - About 35 merged `claude/*` branches can be deleted.
  - gas-lint has 18 warnings, doc-currency 8 and coverage-gaps 5. All are advisory.

## From the 2026-10-06 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-06.md`)

- **Read first:** this file, then the per-system handoff for your system.
- **Deploy markers:** any change to a GAS project's files needs
  `node tools/deploy-drift/stamp.js <project>` (`kos-personal`,
  `leader-hub:app`, `cas-ccps:<name>`), committed on its own.
- **Generated files:** never hand-edit them; run the generator (the root
  README lists them). The codebase-notebook output is not committed at all.
- **Checks before a PR:** `npm test`, `node tools/gas-lint/check.js`,
  `node tools/doc-currency/check.js` (zero errors is the gate), and
  `node tools/coverage-gaps/check.js`. Today the warnings are 18, 8 and 5,
  all advisory.
- **FERPA:** student text never goes into the KOS Ledger or either notebook,
  and rosters stay in the teacher's Drive (`cas-ccps/docs/FERPA_DATA_MAP.md`).
- **The operator runs things live and pastes back logs.** Ask for the log;
  don't assume a run happened.
- **How this repo is worked:**
  - one PR per piece of work, from a `claude/*` branch;
  - CI must be green before asking to merge;
  - the operator says "merge", and the session merges with a merge commit;
  - after the merge, the operator downloads the zip of `main` and pushes
    with `run.ps1`.
- **Gemini behaviour learned on 2026-10-05** (detail in `05_TEST_LOG.md` and
  ADR-010):
  - apps run only from chips the operator types in the message; pasted
    `@Name` text and chips in the Instructions call nothing;
  - mail goes through `@Workspace`;
  - notebook retrieval matches a source's text, not its title, which is why
    each briefing doc carries a `Notebook source: {NAME}.` line.

## From the 2026-10-07 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-07.md`)

- **Read first:** this file, then the per-system handoff for your system.
  For cas-ccps, `cas-ccps/docs/features/lesson-schedule.md` explains the
  current curriculum path.
- **Deploy markers:** any change to a GAS project's files needs
  `node tools/deploy-drift/stamp.js <project>` (`kos-personal`,
  `leader-hub:app`, `cas-ccps:<name>`), committed on its own.
- **Generated files:** never hand-edit them; run the generator (the root
  README lists them). The lesson data is `tools/cas-ccps/build-lesson-assignments.js`;
  the cartridges are `tools/cas-ccps/build-canvas-cartridge.js`.
- **Checks before a PR:** `npm test`, `node tools/gas-lint/check.js`,
  `node tools/doc-currency/check.js` (zero errors is the gate), and
  `node tools/coverage-gaps/check.js`.
- **Sheets turns ID-like text into dates** ("8175-1", "1-8177"). Write such
  cells with number format `@`, and read them back through the existing
  text helpers (`competencyIdText_`, `_lessonPeriodText_`,
  `_normalizeLessonDateCell_`).
- **FERPA:** student data never goes to Claude, the KOS Ledger or either
  notebook. Ask for logs with student names redacted; don't read student
  exports or the Central Ledger through Drive. Teacher-authored lesson docs
  and the Teacher Matrix config are fine.
- **The operator runs things live and pastes back logs.** Ask for the log;
  don't assume a run happened.
- **How this repo is worked:** one PR per piece of work from a `claude/*`
  branch; CI green before asking to merge; the operator says "merge" and the
  session merges with a merge commit; the operator then pushes `main`.

## From the 2026-10-08 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-08.md`)

- **Read first:** this file, then the per-system handoff for your system.
- **Students can't run Apps Script.** Anything a student does goes through
  the Student Dashboard web app (`13`, runs as the admin). Don't build
  student features into the doc's bound script.
- **Canvas is the LMS.** Turn-in and grades happen there. CAS gives
  feedback and keeps the SCR; it never needs a turn-in of its own.
- **Evidence and states.** SCR counts one piece per assignment at its best
  (`30`'s `aggregateEvidence_`); the Teacher Dashboard's four states come
  from Ledger columns 24–27 (`37`'s `recordEvaluationResult_`). The Ledger
  is 27 columns wide (`LEDGER_COL_COUNT`).
- **Feedback is appended at the end of the doc** (`37`'s harvest). Text
  that tells students where to look must say so.
- **Deploy markers:** any change to a GAS project's files needs
  `node tools/deploy-drift/stamp.js <project>`, committed on its own. A
  change to `00_SharedConfig.js` touches all seven cas-ccps projects that
  include it.
- **Generated files:** never hand-edit them; run the generator (the root
  README lists them).
- **Checks before a PR:** `npm test`, `node tools/gas-lint/check.js`,
  `node tools/doc-currency/check.js` (zero errors is the gate),
  `node tools/coverage-gaps/check.js`. New top-level test files must be
  named in `README.md` (CI's docs-check). Tests that call into a whole
  project should load its file list from `tools/gas-lint/project-map.json`.
- **Sheets turns ID-like text into dates**; write such cells with format
  `@` and read them back through the existing text helpers.
- **FERPA:** student data never goes to Claude, the KOS Ledger or either
  notebook. Ask for logs with student names redacted.
- **The operator runs things live and pastes back logs.** Don't assume a
  run happened.
- **How this repo is worked:** one PR per piece of work from a `claude/*`
  branch; CI green before asking to merge; the operator says "merge" and the
  session merges with a merge commit; the operator then pushes `main`.

## From the 2026-10-10 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-10.md`)

- **Read first:** this file, then the PRD if the work is cas-ccps, then
  the per-system handoff.
- **Students can't run Apps Script.** Anything a student does goes through
  the Student Dashboard (`13`, runs as the admin).
- **Canvas is the LMS.** Turn-in and grades happen there. The Turn-In Form
  is retired; `04` survives only for its shared helpers.
- **Feature flags** for PRD work are `PIVOT_*` keys in `SHARED_CONFIG_KEYS`,
  read with `pivotFlagFor_()` (blank/`off`, `all`, or a course code). Set
  in the Ledger's `_CONFIG` tab so every project sees them.
- **System text in responses** is matched by `findSystemText_()` in `00`;
  use it rather than a new pattern list.
- **Warm-up prompts** are filled through `WFB_PROMPT_VARS` in `41`. A new
  placeholder in the spec needs a row there, or the test fails.
- **WarmUpQueue** is 21 columns plus `archive_status` at index 21; new
  columns start at 22. **SCRDecisionLog** has three writers hard-coding 10
  columns.
- **Deploy markers:** any change to a GAS project's files needs
  `node tools/deploy-drift/stamp.js <project>`, committed on its own. A
  change to `00_SharedConfig.js` touches all seven cas-ccps projects.
- **Checks before a PR:** `npm test`, `node tools/gas-lint/check.js`,
  `node tools/doc-currency/check.js` (zero errors), `node
  tools/coverage-gaps/check.js`. A new file under a system directory needs
  that directory's README touched (CI's docs-check). Tests that call into a
  whole project load its file list from `tools/gas-lint/project-map.json`
  (gas-lint's sandbox-scope check enforces this).
- **8177 lessons:** a lesson is used only once
  `lessons/8177/prompts/<slug>.md` says `status: approved`. Competency lines
  in a lesson plan cite the 2025 task number with the state's wording
  (`CompetencyRubrics.json`); a mismatch lands in
  `lessons/COMPETENCY_REVIEW.md` with no ID. After changing a lesson or an
  approved prompt, run `node tools/cas-ccps/build-lesson-assignments.js`
  and `node tools/cas-ccps/build-canvas-cartridge.js`, and stamp
  central-ledger. `COMPETENCY_TRACKER.md` and the pacing guide's
  competency lines are kept by hand from the lessons' alignment sections.
  The lesson files mirror Drive docs: a change in one should reach the
  other.
- **Docs:** write a function with parentheses only if it exists;
  doc-currency verifies those. Proposed names go without parentheses.
- **FERPA:** student data never goes to Claude, the KOS Ledger or either
  notebook. Ask for logs with names redacted.
- **The operator runs things live and pastes back logs.** Don't assume a run
  happened.
- **How this repo is worked:** one PR per piece of work from a `claude/*`
  branch; CI green before asking to merge; the operator says "merge" and the
  session merges with a merge commit; the operator then pushes.

## From the 2026-10-12 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-12.md`)

- **Read first:** this file, then the PRD if the work is cas-ccps, then
  the per-system handoff.
- **Students can't run Apps Script.** Anything a student does goes through
  the Student Dashboard (`13`, runs as the admin). **Canvas is the LMS**;
  the Turn-In Form is retired and `04` keeps only shared helpers.
- **Feature flags** for PRD work are `PIVOT_*` keys in `SHARED_CONFIG_KEYS`,
  read with `pivotFlagFor_()`, set in the Ledger's `_CONFIG` tab.
- **System text in responses** is matched by `findSystemText_()` in `00`.
- **Warm-up prompts** are filled through `WFB_PROMPT_VARS` in `41`; a new
  placeholder needs a row there or the test fails.
- **WarmUpQueue** is 21 columns plus `archive_status` at index 21; new
  columns start at 22. **SCRDecisionLog** has three writers hard-coding 10
  columns.
- **Deploy markers:** any change to a GAS project's files needs
  `node tools/deploy-drift/stamp.js cas-ccps:<project>` (note the
  `cas-ccps:` prefix), committed on its own. A change to
  `00_SharedConfig.js` touches all eight cas-ccps projects that include it
  (every one but `studio-steps`), so stamp each. After merging
  `main` into a branch, re-stamp: the marker follows the latest commit.
- **Checks before a PR:** `npm test`, `node tools/gas-lint/check.js`,
  `node tools/doc-currency/check.js` (zero errors), `node
  tools/coverage-gaps/check.js`. A new file under a system directory
  needs that directory's README touched (CI's docs-check).
- **Lessons, both courses:** competency lines cite the 2025 task number
  with the state's wording from `cas-ccps/data/CompetencyRubrics.json`,
  plus what the lesson does in parentheses; a mismatch lands in
  `cas-ccps/curriculum/lessons/COMPETENCY_REVIEW.md` with no ID (keep it
  empty). 8175 lines are
  `**0NN:** wording (note).` and each lesson's Duty Areas line names the
  2025 duty areas of the tasks it cites. After changing a lesson, run
  `node tools/cas-ccps/build-lesson-assignments.js` and `node
  tools/cas-ccps/build-canvas-cartridge.js`, and stamp central-ledger.
  Both `COMPETENCY_TRACKER.md` files are rebuilt from the lessons'
  alignment sections. **8175's prompt is the lesson's own Canvas text**,
  so editing it changes what students see; there is no approval gate.
  **8177** lessons are used only with an approved
  `cas-ccps/curriculum/lessons/8177/prompts/<slug>.md`. L06 (8175) is a
  live assignment: leave it alone.
- **Lesson files mirror Drive docs** (header `source: Google Doc <id>`).
  A change in one should reach the other. Edit Drive docs in place with
  the Google Docs connector: check the doc against the repo's previous
  text first, change only the edited lines, and verify afterwards. Insert
  new text before deleting old so it keeps the doc's font (Google Sans
  Text), and anchor new list items on a list paragraph so they join the
  list.
- **Docs:** write a function with parentheses only if it exists;
  doc-currency verifies those.
- **FERPA:** student data never goes to Claude, the KOS Ledger or either
  notebook. Ask for logs with names redacted. The Family Mail Sentinel is
  how student and parent mail reaches the KOS Project: as the name-free
  `KOS_FAMILY_SIGNAL` doc, never the mail. Don't widen what that doc
  carries without the teacher's say.
- **Family Mail Sentinel:** `60_FamilyMailSentinel.js`'s header is the
  design; `cas-ccps/docs/FAMILY_MAIL_SENTINEL.md` the setup and data
  boundary. The Gemini prompt's one source is
  `cas-ccps/prompts/FAMILY_MAIL_TRIAGE_PROMPT.md`; regenerate `61` with
  `node tools/cas-ccps/generate-family-mail-prompt.js`. `run.ps1` reads
  script IDs from the operator's `clasp-registry\` folder, not the repo.
- **central-ledger is also a library.** `unified-manual` pins it at
  version 3 (`cas-ccps/clasp/manifests/unified-manual.appsscript.json`,
  last changed in #112), so a push to central-ledger doesn't reach the
  setup wizard. That's harmless today: the wizard calls only
  `importCompetencyRegistry()` (`22b`), `importPacingGuide()` (`31`) and
  `importCompetencyRubrics()` (`32`), none of which changed after #112.
  If one of those three files changes, the operator cuts a new library
  version and the PR bumps the pin.
- **CAS attention signal** (`34b_CasAttentionSignal.js`): written at the
  end of every `runQueueWatchdog()`; counts only, students first. Its data
  boundary is in `cas-ccps/docs/FERPA_DATA_MAP.md` ("CAS attention
  signal"). Adding anything but counts is the teacher's call. SCR scale: 1
  is the highest, 1–3 satisfactory.
- **Terms:** `CURRENT_TERM` is the school year plus the marking period,
  `2627_MP1` (MP 1–4), set at each marking period. The marking period only
  labels rows; visibility and archiving go by school year
  (`_schoolYearOfTerm_()` in `00`). Older terms like `2025-26 S1` still
  read.
- **SMPs** live in `SMP_REGISTER` (BRAIN_TRUST_INDEX) and
  `01.3_SMP_PROPOSALS`, never in the repo or Project knowledge
  (`SMP_PROCESS.md`). Cite them by register number; a session never
  numbers one.
- **SMP-018:** the KOS Project writes only what the operator directs in
  the session, through a show-then-confirm gate, and never CAS or
  LeaderHub, deletes, triggers, script properties, sharing, mail or
  calendar. It never reads CAS sheets. A change to that list needs its own
  SMP.
- **The operator runs things live and pastes back logs.** Don't assume a
  run happened.
- **How this repo is worked:** one PR per piece of work from a `claude/*`
  branch; CI green before merging; the operator says "merge" and the
  session merges with a merge commit; the operator then pushes.

## From the 2026-10-17 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-17.md`)

The 10-12 handoff's "For an agent session" section still holds. Added since:

- **After any manifest scope change** to a web app that runs as the deploying admin, the admin runs a function from the editor and approves, then tests one submit, before a class depends on it. A blocked prompt points to the district's Admin console API controls.
- **Never put the full response marker line** (`── YOUR RESPONSE BEGINS HERE ──`) in text that can appear above the response zone. Every extractor takes the first match.
- **Evaluations go in the feedback zone** (`_fiInsertEvaluation_()`, 37). 03 finds "WHAT TO DO NEXT" anywhere in the body, so older bottom-of-doc blocks stay valid.
- **`SubmitFailures`** holds a timestamp and a code only, so it is outside the FERPA map and retention schedule by design.
- **Retention periods** are Script Properties; `_retentionCutoff_()` (00) counts whole school years with an August start.
- **Watchdog trigger:** `installQueueWatchdogTrigger()` (Phase 2 step 6a). Without it the watchdog and CAS signal never run.
- **Ideas for later sprints go in [`BACKLOG.md`](./BACKLOG.md)**, one line each, not in the operator's queue above.
- **Student data stays out of Claude.** A pasted Ledger or StudentAssignments row is acknowledged without repeating its identifiers; student docs are never opened.

## From the 2026-10-18 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-18.md`)

The 10-17 handoff's "For an agent session" section still holds. Added since:

- **Deploy with `node run.js`** (`tools/clasp-sync/`); `run.ps1` is retired but stays until run.js has run live a few times (the manifest-agreement test checks both).
- **Ledger status `SCHEDULED`** means a doc made ahead by the rollout and not yet shared: no Student Dashboard card, submit refused (`NOT_OPEN_YET`), archived like ACTIVE. Only `58_LessonRollout.js` sets it ACTIVE.
- **`RolloutLog`** holds counts and reason codes only, like `SubmitFailures`; never write a student account, file ID or student ConfigID there.
- **Shared switches** (`FEEDBACK_AS_COMMENT`, `ROLLOUT_AUTO_APPLY`, `WARMUP_TEXT_BOX`) take `off`, one course code, or `all`. A Script Property in a project overrides the Ledger's `_CONFIG` tab there; other projects see a `_CONFIG` change within 10 minutes (`refreshSharedConfig()` clears one project's cache).
- **Feedback location depends on the switch:** with it on, the evaluation is a Drive comment and nothing is written into the doc; code that needs the result reads the Ledger (`recordEvaluationResult_`), never the doc text.
- **Warm-ups in a text box:** a warm-up delivered with `WARMUP_TEXT_BOX` on has a `WarmUpTextBox` row (00's `WTB`) and no doc; WarmUpQueue stays 21 columns. Student writing there is FERPA data like `response_text`; never read it in a session.
- **`WarmUpPlan`** (`55`) picks a day's warm-up seed; `getWarmUpAnchor_` (`31`) takes it before the current lesson.
- **`63_DocHeader.js`** is in the Central Ledger and Student Dashboard projects only (it calls DocumentApp). A test that reaches `stampDocument_`, `queueSubmission_` or `harvestFlowInputResults` must load it (gas-lint's sandbox-scope check enforces this). The doc markers' text is unchanged; never reword them.
- **SubmissionTS** is the latest queued submit; rows submitted before #186 stay blank.
- **Name the project and file for every function** you ask the operator to run (for example: `buildWarmUpQueues()`, Central Ledger, `24_WarmUpBridge.js`). Several files are in more than one project; say which copy.
- **`TEACHER_EMAIL` must be a Script Property in the Central Ledger** for the warm-up queue builder (`24`), which matches ClassSchedule rows on it.
- **The Run dropdown hides functions ending in `_`.** An operator entry point needs a public name (as `installWarmUpTriggers()`, `installArtifactSyncTrigger()`).
- **Studio drops runs when many rows change at once** ("Couldn't access the spreadsheet"). Write Studio input rows paced (`WFB_INPUTS_PER_RUN`, `41`); an appended row starts Studio, a hand retype of the same value was not tried. Input rows: `READY`, `RETRIED` (superseded by a newer copy), `CONSUMED`; only `READY` counts as waiting.
- **`34c_OvernightHealth.js`** writes LAST NIGHT in the CAS signal every watchdog run and emails it once a day (`CAS_OVERNIGHT_MAILED`). Counts only. The 3 a.m. stages stamp `M2_STAGE{1,1B,2,3}_LAST_RUN` and `_STATUS`, quiet nights included; `ERRORS_n` and `NO_TAGS` are reported.
- **`TEACHER_NAME`** belongs in the Central Ledger's Script Properties too: it goes into every warm-up snapshot (docs need it; the text box no longer does).
- **The deploy marker (`43`) is stale** (`965b94d`) until restamped, so `reportDeployVersion` can't confirm a push. A fix is in [`BACKLOG.md`](./BACKLOG.md) ("Repo and tooling"), after this week.
- **The Project's doc links live in the registry**, in `clasp-registry\kos-project-links.txt` (`NAME=https://...`), never in the repo. `PROJECT_INSTRUCTIONS.md` keeps its `<link to NAME>` placeholders; `node run.js --instructions` fills them. A new placeholder needs a new line in that file (the run names it), so tell the operator when you add one.
- **Flow 3 output passes a shape gate** (`wfbWarmUpShapeProblem_`, `41`): never deliver model text that carries the prompt's wording, a competency code or a list; the teacher's `warmup_anchor` is the fallback. Check LAST NIGHT's fallback count before trusting a Studio prompt change.
- **The Ledger's frequent jobs run from `runLedgerCycle` (64)** once `installLedgerCycle()` has run: don't add a 1-, 5- or 10-minute trigger for a Ledger job; add the job to `LC_JOBS` and run `installLedgerCycle()`. Its log line `[LC] Errors:` is where a job's failure shows.
- **`ClassSchedule` day types:** `DAILY` (a warm-up every day), `DAILY_HALF` (meets daily, half-length; a new warm-up on the first day of each pair), `ODD`, `EVEN` (the date's parity). A `WarmUpPlan` row covers its date and the next weekday.
- **A period label is text** (`3-Odd`, `3-Even`): never parse it as a number. A group that meets on alternate days has its own period, `ODD` or `EVEN` in `ClassSchedule`; `NOT_MEETING` in WarmUpQueue is a warm-up queued for a day its period didn't meet (never scored or shown).
- **The Canvas export's period-3 sections are tagged by hand** (` ODD`/` EVEN` appended to the Section column) until `PeriodOverride` exists; an untagged export puts new period-3 students in `3`, which has no `ClassSchedule` row.
- **Keep the two-week window current.** Each handoff moves `PLAN_2026-10.md`'s "The next two weeks" forward: the current week and the next, their checks, and the dated decisions.
- **Ideas go in [`BACKLOG.md`](./BACKLOG.md)**, not the queue above.
- **Student data stays out of Claude.** A sheet may be read for status and timestamp columns only; a pasted row or screenshot is acknowledged without repeating its identifiers; student docs are never opened.

## From the 2026-10-19 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-19.md`)

The 10-17 handoff's "For an agent session" section still holds. Added since (10-18 and 10-19):

- **Deploy with `node run.js`** (`tools/clasp-sync/`); `run.ps1` is retired but stays until run.js has run live a few times (the manifest-agreement test checks both).
- **Ledger status `SCHEDULED`** means a doc made ahead by the rollout and not yet shared: no Student Dashboard card, submit refused (`NOT_OPEN_YET`), archived like ACTIVE. Only `58_LessonRollout.js` sets it ACTIVE.
- **`RolloutLog`** holds counts and reason codes only, like `SubmitFailures`; never write a student account, file ID or student ConfigID there.
- **Shared switches** (`FEEDBACK_AS_COMMENT`, `ROLLOUT_AUTO_APPLY`, `WARMUP_TEXT_BOX`) take `off`, one course code, or `all`. A Script Property in a project overrides the Ledger's `_CONFIG` tab there; other projects see a `_CONFIG` change within 10 minutes (`refreshSharedConfig()` clears one project's cache).
- **Feedback location depends on the switch:** with it on, the evaluation is a Drive comment and nothing is written into the doc; code that needs the result reads the Ledger (`recordEvaluationResult_`), never the doc text.
- **Warm-ups in a text box:** a warm-up delivered with `WARMUP_TEXT_BOX` on has a `WarmUpTextBox` row (00's `WTB`) and no doc; WarmUpQueue stays 21 columns. Student writing there is FERPA data like `response_text`; never read it in a session.
- **`WarmUpPlan`** (`55`) picks a day's warm-up seed; `getWarmUpAnchor_` (`31`) takes it before the current lesson.
- **`63_DocHeader.js`** is in the Central Ledger and Student Dashboard projects only (it calls DocumentApp). A test that reaches `stampDocument_`, `queueSubmission_` or `harvestFlowInputResults` must load it (gas-lint's sandbox-scope check enforces this). The doc markers' text is unchanged; never reword them.
- **SubmissionTS** is the latest queued submit; rows submitted before #186 stay blank.
- **Name the project and file for every function** you ask the operator to run (for example: `buildWarmUpQueues()`, Central Ledger, `24_WarmUpBridge.js`). Several files are in more than one project; say which copy.
- **`TEACHER_EMAIL` must be a Script Property in the Central Ledger** for the warm-up queue builder (`24`), which matches ClassSchedule rows on it.
- **The Run dropdown hides functions ending in `_`.** An operator entry point needs a public name (as `installWarmUpTriggers()`, `installArtifactSyncTrigger()`).
- **Studio drops runs when many rows change at once** ("Couldn't access the spreadsheet"). Write Studio input rows paced (`WFB_INPUTS_PER_RUN`, `41`); an appended row starts Studio, a hand retype of the same value was not tried. Input rows: `READY`, `RETRIED` (superseded by a newer copy), `CONSUMED`; only `READY` counts as waiting.
- **`34c_OvernightHealth.js`** writes LAST NIGHT in the CAS signal every watchdog run and emails it once a day (`CAS_OVERNIGHT_MAILED`). Counts only. The 3 a.m. stages stamp `M2_STAGE{1,1B,2,3}_LAST_RUN` and `_STATUS`, quiet nights included; `ERRORS_n` and `NO_TAGS` are reported.
- **`TEACHER_NAME`** belongs in the Central Ledger's Script Properties too: it goes into every warm-up snapshot (docs need it; the text box no longer does).
- **The deploy marker (`43`) is stale** (`965b94d`) until restamped, so `reportDeployVersion` can't confirm a push. A fix is in [`BACKLOG.md`](./BACKLOG.md) ("Repo and tooling"), after this week.
- **The Project's doc links live in the registry**, in `clasp-registry\kos-project-links.txt` (`NAME=https://...`), never in the repo. `PROJECT_INSTRUCTIONS.md` keeps its `<link to NAME>` placeholders; `node run.js --instructions` fills them. A new placeholder needs a new line in that file (the run names it), so tell the operator when you add one.
- **Flow 3 output passes a shape gate** (`wfbWarmUpShapeProblem_`, `41`): never deliver model text that carries the prompt's wording, a competency code or a list; the teacher's `warmup_anchor` is the fallback. Check LAST NIGHT's fallback count before trusting a Studio prompt change.
- **The Ledger's frequent jobs run from `runLedgerCycle` (64)**, live since 2026-10-19: don't add a 1-, 5- or 10-minute trigger for a Ledger job; add the job to `LC_JOBS` and run `installLedgerCycle()`. Its log line `[LC] Errors:` is where a job's failure shows.
- **`ClassSchedule` day types:** `DAILY` (a warm-up every day), `DAILY_HALF` (meets daily, half-length; a new warm-up on the first day of each pair), `ODD`, `EVEN` (the date's parity). A `WarmUpPlan` row covers its date and the next weekday.
- **A period label is text** (`3-Odd`, `3-Even`): never parse it as a number. A group that meets on alternate days has its own period, `ODD` or `EVEN` in `ClassSchedule`; `NOT_MEETING` in WarmUpQueue is a warm-up queued for a day its period didn't meet (never scored or shown).
- **The Canvas export's period-3 sections are tagged by hand** (` ODD`/` EVEN` appended to the Section column) until `PeriodOverride` exists; an untagged export puts new period-3 students in `3`, which has no `ClassSchedule` row.
- **Keep the two-week window current.** Each handoff moves `PLAN_2026-10.md`'s "The next two weeks" forward: the current week and the next, their checks, and the dated decisions.
- **Flow 2's Studio starter fires on an edit, not on an appended row** (bug 4, #214). Any code that hands Studio a row must append it without the trigger value and set that value as its own edit (`buildFlowInputRows`, 37). Flow 3's inputs (41) do start on appended rows; don't assume the same for a new flow.
- **Assignment criteria come from the generators**, never hand edits: `tools/cas-ccps/build-lesson-assignments.js` (55b, with `curriculum/lessons/COMPETENCY_TIERS.json`), `build-unit-rubrics.js` (53b), `build-canvas-cartridge.js`. Then the operator pushes and runs `refreshAssignments()` (53); a TeacherMatrix row is never rewritten by the seeder.
- **Competency tiers:** a tier must use the lesson's own competency IDs, one per tier, all of them (the generator stops otherwise). The Definition of Done carries THE TASK, the tiers and a PASSING RULE line; the harvest reads the rule and the TERTIARY section from the FlowInput row's Definition of Done and the `[ALSO_SHOWN: [...]]` line from Flow 2's output. Canvas drops a task's closing "Submission:" part, so anything students must see goes before it.
- **Terms:** `currentTerm_()` (00) is the term; never read `CURRENT_TERM` directly. Enrollment checks compare the school year (`sameSchoolYearTerm_`), never the exact term: a marking period only labels a row.
- **`tools/student-data-scan/`** prints file, line, kind and hash, never the matched text. An agent never runs `--roster`. A hash may be allowlisted only when a person looked at the line or it equals a known synthetic string.
- **Ideas go in [`BACKLOG.md`](./BACKLOG.md)**, not the queue above.
- **Student data stays out of Claude.** A sheet may be read for status and timestamp columns only; a pasted row or screenshot is acknowledged without repeating its identifiers; student docs are never opened.
- **Installers in the wrong project.** The setup wizard (`28`, Unified Manual) installs `registerDeliveredWarmUps` (25) and `runAlignmentLogBackfill_` (22) in its own project, where they don't exist. A Ledger job's trigger belongs in the Central Ledger, folded into the cycle (`BACKLOG.md`).
- **A typed `FALSE` in an active column is inactive** (`ClassSchedule`, `CanvasSectionMap`): read the cell as a boolean or as text, both.
- **Warm-up seeds:** with no `WarmUpPlan` row for the day (or the day before, for a pair), the seed is a random lesson whose `LessonSchedule` start_date is on or before the day, the same for both days of a pair (`reviewWarmUpKey_`, `55`, an FNV hash of the pair's first date and the course). A lesson with no start_date never joins the pool.

## From the 2026-10-20 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-20.md`)

The 10-19 handoff's notes still hold. Added today:
- **`setCurrentTerm()` is in the Central Ledger** and needs the sheet's menu
  (it calls `getUi()`). Functions that open a prompt fail from the editor;
  say "from the menu" when you name one.
- **Text-box warm-ups have no `Doc_ID`.** Any code reading a warm-up's
  prompt or answer must handle both: the doc (`evaluateWarmUpDoc_`) and the
  `WarmUpTextBox` row (`evaluateWarmUpText_`, 25). Grep for `WQ25_DOC_ID`
  guards before trusting a warm-up path.
- **Studio's Timestamp in `WarmUpFlowReturn` is a string**, not a date; the
  harvest's own rows hold a Date. Don't filter return rows by time without
  parsing both.
- **The queue's lesson dates are `YYYY-MM-DD` text**: `new Date("2026-10-21")`
  is midnight UTC, the evening before in New York. Use
  `wfbNormalizeDateIso_` or compare the strings.
- **34c's "last 24 hours" counts by when a return was harvested**, not the
  lesson day; a late fallback for an old day lands in today's count. Group
  by the queue row's lesson date before drawing conclusions.
- **`syncArtifactCompetencies` (33) needs `TEACHER_MATRIX_SS_ID`** as a
  Central Ledger Script Property (now set); 53 uses `MatrixRegistry`.
  A fallback in 33 is in `BACKLOG.md`.
- **A pasted sheet may carry student writing** (today's `Flow4Input` paste
  included answers). Acknowledge it without repeating, and ask for the
  status columns next time.

## From the 2026-10-21 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-21.md`)

The 10-19 and 10-20 notes still hold. Added today:
- **Flow 4 has its own plausibility check** (`wfbFlow4Plausible_`, 41).
  Flows 2 and 3 keep theirs. A Flow 4 failure reason names a count, never
  the student's words; keep it that way.
- **A Ledger row's ConfigID is the student's workspace ID**, not the
  assignment's. Anything that reads TeacherMatrix for a student goes
  through `readStudentAssignments_` (54) first, as 37 and 33 now do. A test
  that reaches such code must load 54 (gas-lint's sandbox-scope check).
- **TeacherMatrix's competency IDs are the four
  `Milestone{1-4}CompetencyId` columns** (15–18), comma-separated. Find
  them by header, not index (`s33CompetencyColumns_`, 33).
- **Studio prompts come from the `FlowPrompts` tab** (16), filtered on
  `PromptName`, for the Curator, Vector Classify and Curator Auditor flows.
  Check that a flow exists before asking the operator to paste a prompt
  into it.
- **Student data in the repo:** the scan in CI covers emails only. Before
  adding example text that could name a student, check it; the operator
  runs `--roster` locally, never an agent.
- **A student's period can come from `PeriodOverride`** (52) before
  `CanvasSectionMap`: enrollment, the rollout and relabel read it. It holds
  accounts, so it is in the FERPA data map; no date column, so it is out of
  the retention schedule and cleared at year end.
- **The Unified Manual installs no Central Ledger trigger.** A trigger
  belongs in the project that defines its function (`tools/gas-lint/project-map.json`
  says which). The Ledger's frequent jobs run in the cycle (64); add one with
  its installer there, not a trigger of its own.
- **`COMPETENCY_TIERS.json` must cover exactly the lesson's competency
  lines:** a tier can only name a competency in the lesson file, and every
  one needs a tier (the builder throws). The 8177 task list has no branding
  competency.
- **The family signal has two tiers**; `_fmsNeedsReply_` (60) decides, and
  only an explicit false from a classified message makes a thread "for your
  eyes". System senders (`FMS_SYSTEM_SENDERS`) never reach the log, so
  their words never trip the safety check.
- **Test fixtures and the student-data scan:** a made-up address at the
  student domain fails CI. Use another domain when the address is only a
  key; an allowlist entry needs a person to look at the line.
- **After a Flow 2 timeout**, the doc's FlowInput row decides the fix
  (#233): READY means retype READY (a resubmission builds no new row while
  it is open); blank, `ERROR_` or missing means resubmit.
- **33 and 53 find the TeacherMatrix the same way** (`MatrixRegistry`,
  then `TEACHER_MATRIX_SS_ID`); a test reaching 33 loads 53.
- **Ask for a count or a status column, with a formula that returns only
  that.** Today's checks used `QUERY`/`FILTER` formulas that return counts
  or the text before an Error's first colon (the rest can quote student
  writing). A `FILTER` with no matches returns an error, which an `IFERROR`
  turns into one misleading row.

## From the 2026-10-22 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md`)

The 10-19, 10-20 and 10-21 notes still hold. Added today:
- **A Studio flow writes its own timestamps as text.** Read any timestamp
  a flow wrote with `sheetTimestampMs_` (00), never `new Date(...)`; a
  formula comparing such a column with `NOW()` matches every row (text
  sorts above numbers), and `COUNTIFS` with a date criterion matches none.
- **Flow 3 has its own plausibility check** (`wfbFlow3Plausible_`, 41),
  against the lesson fields in `WFB_FLOW3_SOURCE_FIELDS`, not the whole
  snapshot. Flow 5 still uses `_wfbCheckPlausible_`.
- **The shape gate takes the anchor** (`wfbWarmUpShapeProblem_(text,
  anchor)`): with it, no question is a failure unless the anchor is kept
  whole. 5 of the 67 lesson anchors have no "?"; `repairWarmUpTextBox`
  calls it without one.
- **Studio's Ask Gemini steps read the PromptText chip** (seen 10-21 for
  Flow 3), so a prompt change in 40 goes live with the push. They must
  list no Drive sources.
- **Diagnose flow output with counts.** Lengths, line breaks, `?` counts
  and `REGEXMATCH` flags over `RawOutput` told the echoed prompt from the
  model's commentary without reading a word of it. A reason's text after
  its first parenthesis can quote lesson words; cut it.
- **Lesson-seeded warm-ups have no prior connection** (`_lessonUnit_`, 55,
  sets none), which Flow 5 and Flow 3's Mode A both read.
- **Offline checks against the real lessons:** `55b_LessonAssignmentData.js`
  and `cas-ccps/data/CompetencyRubrics.json` load in the test sandbox; the
  new tests run every anchor through both gates.
- **Check CI on the PR's head before merging**, every time (#242 went in
  with docs-check red). The docs-check wants a new file's folder README
  touched (`meta/README.md`, `cas-ccps/README.md`), and a new test file
  listed in the root `README.md`.
- **The Teacher Dashboard's modals open with the class `open`**, not `show`
  (a test pins it). Its client code sits inside a template literal: a `\'`
  in client code must be written `\\'` in the file, so new client code uses
  `data-*` attributes and one delegated listener instead of inline
  handlers with quoted arguments (the lesson editor's `data-ld`).
- **Render the dashboard to check a UI change:** build its HTML through the
  GAS sandbox (`buildDashboardHtml_`), stub `google.script.run` with the
  real server functions' output, and screenshot with Playwright
  (`/opt/pw-browsers`). It found the Feedback panel bug.
- **Lesson drafts:** `LessonDrafts` statuses are exact strings (`MERGED`,
  not `MERGED #<PR>`; the PR goes in `pr_url`). The import tool runs 65's
  own `_ldCheck_`/`_ldCheckNew_` in a vm, so the dashboard and the import
  can't disagree. The builder writes a tier checklist into the student task
  ("What your work needs to show"); 65 shows and compares the task without
  it (`_ldTaskText_`). An 8175 objective is the first paragraph of the
  task's Description and 8175 has no vocabulary field; an 8177 objective is
  the plan's first numbered line, shown without its number.
- **55b is in two projects now** (Central Ledger and Teacher Dashboard): a
  lesson change goes live on the dashboard with the Teacher Dashboard push.

Added by the late session (#248 to #250):
- **A Ledger row's ConfigID names no course.** It is the student's
  workspace ID (`VDOE-…`); lesson ConfigIDs (`CAS-8175-L06`) live in the
  TeacherMatrix. Get a row's course with `ledgerRowCourseCode_` (00), from
  its class, subject or course name.
- **Drive the dashboard's client code in tests.** `teacher-dashboard-inline-js.test.js`
  runs the served `<script>` in a vm (`firstContextWith`); replace
  `context.document` with a plain object (a proxy ignores assignment) and
  call `render()`, the readiness renderer (`renderWarmUpReadiness`) or a panel's renderer with
  fixture data. Roster fixtures need `assignmentName`.
- **Deleting a Routine was refused** by the session's permission check (a
  `send_later` check-in on a merged PR). It fires once and finds nothing;
  the operator can delete it in claude.ai's Routines page.
- **The course plan's rule:** no course number, name or lesson format in
  new code; read the course from data. The four existing rules (00's
  `warmUpCourseCode_`, 24's `courseCodeFromName_`, 51's `_cybCourseCode_`)
  are Phase A's to replace.

Added on 2026-10-22 (#253, #254, #259):
- **Nothing is stored in the browser** in cas-ccps or kos-personal
  (`tests/tools/no-browser-storage.test.js`); drafts and conveniences live
  in page memory. Don't add `localStorage` or `sessionStorage`; leader-hub
  follows its plan.
- **Words come from one place.** 00 holds the dashboards' terms
  (`CAS_*_TERMS`), `CLIENT_WORDS_JS` (`termLabel`, `scrLabel`, `scoreLabel`)
  and the server's `termLabel_`. 13's `resolveStudentStatus_` and 07's
  `BADGE_WORDS` and `_tdFlagReason_` name each stage; a new surface reuses
  them rather than writing its own.
- **`ERROR_EVALUATION`** is a staging, queue and Ledger status: 37 sets it
  on a result it can't use, 03 closes and reports it, 34's watchdog counts
  it as a terminal failure, and a resubmission builds a fresh FlowInput row.
- **doc-currency reads an `.html` file as JavaScript**, so an apostrophe in
  visible text ("doesn't") can open a "string" that hides a later
  declaration and fail the docs check. Write "does not" in page text. Run
  the check with `.claude/worktrees/` moved aside to see only the real
  errors (helper agents' worktrees add noise).
- **Helper agents with `isolation: worktree`** leave branches named
  `worktree-agent-…`; cherry-pick their commit onto the session branch and
  run `npm test` there too.
- **Logs name no student.** A Teacher Dashboard denial log says "a student
  account" (`_tdWhoForLog_`); log row numbers and counts, never a
  student's address, name or text.

Added late on 2026-10-22 and 10-23 (#261 to #266):
- **LeaderHub runs only served.** Its data comes in `window.__LH_BOOT__`
  (`lhBootData_`, Data.gs) and lives in `_lhStore`; saves go through
  `google.script.run` only. A new `lh_*` key needs a server home (Config.gs
  `LH_CONFIG_KEYS`, Data.gs `LH_DATA_TABS`) or a place in
  `LH_PAGE_MEMORY_KEYS`; `tests/leaderhub/no-browser-storage.test.js`
  fails otherwise. Edit `leader-hub/src/` and rebuild
  (`node tools/leaderhub-build/build.js`); tests that read fixed line
  ranges of the built file must have their ranges moved, not loosened.
- **Rule 12 in practice.** A sandbox must load every file the code it
  drives reaches (`gas-lint-test-scope`); no `typeof fn === "function"`
  guard for a function every project holding the file declares (gas-lint
  check 15 errors on one; `meta/FLOW_DOCTRINE.md` rule 12). Four tests that
  reach 34c now load 19 files for that reason.
- **A Drive sweep over a whole folder** stops at `SWEEP_TIME_BUDGET_MS`
  (kos-personal, 6) and must skip what it already handled, so the next run
  finishes it.
- **WarmUpQueue past its 21 columns** (0-based indexes): `archive_status`
  (21, set by 34), `delivered_at` (22) and `answered_at` (23, 00's
  `WQ_TIMING`). Index
  constants and 21-wide writes stop at 20, so nothing else changes; a new
  column goes after these.
- **A guide's notebook copy is generated.** Edit the HTML guide, then run
  `node tools/cas-ccps/build-guide-notebook-sources.js`;
  `guide-notebook-sources.test.js` fails until the copies match. A new
  guide layout class (a callout, a label-and-description row) may need a
  rule in its `block()`; read the output before committing.
- **CodeQL reviews each PR** and posts a high alert for escaping that
  handles a character but not the backslash before it: escape `\` first.

Added later on 2026-10-23 (the documentation scan):
- **doc-currency checks Markdown only.** It reads `.html` for function
  declarations, not for facts, so an HTML doc or guide is checked by hand
  against the code. It also skips a whole file when a "superseded"-style
  word sits in its first lines (`bannerScanLines`), which hid a stale
  mention in this handoff until the intro grew.
- **A session with no Vector State row:** run kos-personal's
  `explainUnclassifiedSessions()` first; it names the state and the call.
  Nothing requeues from STAGING_ARCHIVE; `resetUnrebuildableRows` with a
  session's full UID re-queues it from CuratorInput text.
- **leader-hub's ID token for CAS:** the browser route needs a Cloud OAuth
  client (blocked on this account); `checkCasServerSignIn()` tests the
  server route. Never log an ID token; log its `aud` and email.

## From the 2026-10-24 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-24.md`)

The 10-19 to 10-22 notes still hold. Added today:
- **The response zone still ends at `[CONFIG_ID:`.** In new docs it is
  hidden: white 1pt text at the start of the system line, with the code a
  person reads in the page footer. Don't move or rename it: 01, 03, 13 and
  Studio's Flow 2 extract step (42) stop there.
- **The assignment in a doc is a table** (02's `_docAssignmentTable_`):
  body `getText()` includes its text, so readers that search the full text
  still work; code that walks body children must allow a `TABLE`. The test
  sandbox's fake Docs has tables, footers and `GlyphType` now.
- **The objectives have one home**, `curriculum/lessons/STUDENT_CRITERIA.json`
  ("I can …", first person, 30 words, `student-criteria.test.js`). The
  generator puts them in the task; 53 writes them to the TeacherMatrix's
  `StudentObjectives` (column 21); 00's reflection reads that column. A new
  lesson or a changed tier needs its objectives (the import procedure says
  so).
- **`refreshAssignments()` now rewrites a LIVE row's prompt doc** when its
  text differs from 55b's: intake (02) copies that doc into new student
  docs. Docs already made keep their text.
- **Reflection questions come from code** (00's `REFLECTION_FRAMES`,
  `chooseReflectionQuestions_`), never a model: same inputs, same
  questions. Submit chooses them again and checks the answers against
  them. `ReflectionLog` holds the student's own words: a record kept with
  the Ledger and portfolio material, never an evaluative record.
- **The warm-up window has one rule** (#281): only the current warm-up (on
  its day) and the last one (until the end of the next class day, capped
  at day + 6) are open. 13's `_dashWarmUpPair_` decides it for the card and
  for saving; "late" is read from the WarmUpTextBox save time, so it needs
  no column. 25's `_answeredLate_` re-parks an INCOMPLETE row once the text
  box has an answer.
- **The Student Dashboard's page script runs in tests** (#282's `page()` in
  `student-dashboard-warmups.test.js`), so a rendering fix can be tested.
  Link text uses `#1557b0`; `dashboard-plain-words.test.js` rejects
  `#1a73e8` as a text colour.
- **Baseline warm-ups (D6, #287)** are decided in 41:
  `wfbBaselineState_` / `wfbBaselineChoice_` (five answered or on their
  way, in `WFB_BASELINE_ORDER`), Mode C's fields from
  `WFB_BASELINE_SKILLS` (kept equal to `data/CompetencyRubrics.json` by a
  test), the archetype cell `BASELINE 8175-14` as the record of which skill
  was asked. 23's shadow matrix skips those rows; 29 names the skill from
  that cell. The canary's `.invalid` fixture student keeps lesson warm-ups.
- **Flow prompts start in the spec.** A Flow 3/4/5 prompt is edited in
  `cas-ccps/docs/CAS_Flow3_Flow4_Specification.html`, then
  `node tools/cas-ccps/generate-flow-prompts.js` writes 40; a new key also
  goes in 40's `FLOW_PROMPT_KEYS` and needs `syncFlowPromptsToSheet()`
  after the push. 41's `wfbDropBlankLines_` drops a Flow 3 line whose
  fields are all blank.
- **What the nightly run scores** is one function, 25's
  `_selectWarmUpsToScore_`: yesterday's, a missed night's (up to
  `WARMUP_CATCHUP_DAYS` back, still DELIVERED), and late answers;
  `previewMissedWarmUpScoring()` runs the same selection read-only.
- **Video links have one home**, `curriculum/lessons/VIDEO_LINKS.json`; the
  generator adds them inside `build()`, so the freshness test sees them.
  Don't edit the lesson `.md` files for links: they are copies of the
  teacher's Drive docs.
- **Two test traps met today.** 13's page is a template literal, so a
  regex in its client code needs `\\s` in the source to reach the browser
  as `\s`. The test harness hands tests a copy of a constant, so to change
  one (say, `LESSON_ASSIGNMENTS`) load a small script after it, as
  `video-links.test.js` does.
- **docs-check wants a README touched** when a PR adds a file: under
  `cas-ccps/`, `cas-ccps/README.md`; a new test, the root `README.md`.
- **Helper agents drafted the 350 objectives in four parallel batches**
  to one written brief, and every line was then read by the session.
  Brief and inputs were scratch files; the result is the JSON file.

## From the 2026-10-27 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-27.md`)

The 10-19 to 10-24 notes still hold. Added:
- **Settings live in one place.** 00's `DASHBOARD_SETTING_KEYS`; 07's
  `TD_SETTINGS` (label, on, off) and `getSettings` /
  `setSettingForCourse` / `setMarkingPeriodEnds`, which write the
  Ledger's `_CONFIG` row and a `SettingsLog` row. A new switch: add it to
  both, and to `SHARED_CONFIG_KEYS`; read it with `pivotFlagFor_`.
- **A switch value can be a list** ("8175,8177"); `_pivotValueOn_` reads
  it. Every known course on is written "all", which course-wide actions
  (`pivotFlagFor_(key, null)`) need.
- **Competencies done** is 00's `readLatestScrRatings_` (moved from 36),
  `competencyCourseTotals_` and `competencyCompletionFor_`
  (`SCR_COMPLETED_MAX_RATING` = 3).
- **The student's page** is `getStudentDetail` (07): the report via
  `generateWeeklyParentReports(now, onlyEmail)`, the doc's weeks via
  `_tdContextWeeks_` (each "Week of" Heading 2 from 29). Page state
  (`_studentFilter`, `_studentDetail`, `_ctxWeek`) is page memory only.
- **Quotes in 07's page.** Its client code is inside a template literal:
  a `'` inside a single-quoted client string is `\\'` in the file. Writing
  the file from Python, that is `\\\\'` in a normal string or `\\'` in a
  raw one; the inline-script syntax test catches a miss.
- **A doc that names a function not yet written fails doc-currency**
  (`documented-function-missing`), plans included: describe it in words
  until it exists.
- **The student's record (#301)** is 13's `getMyCompetencies`,
  `getMyWarmUpHistory` and `getMyContext`: identity from the session only,
  never a parameter. `SCRSuggestions` never reaches a student. The doc's
  week reader is twinned (07's `_tdContextWeeks_`, 13's
  `_dashContextWeeks_`) because 00 can't call `DocumentApp`: every project
  loads 00, and gas-lint wants the Docs scope wherever it appears. A test
  keeps the twins identical. `SDR_*` and `studentContextDocFor_` are in 00.
- **Dates across vm contexts.** A Date made in a test fails `instanceof
  Date` inside the GAS sandbox; use `Object.prototype.toString.call(v) ===
  "[object Date]"` in code a test feeds dates to.
- **The bell schedule's one source is the school's page** (the PDF the
  operator sent 10-27; its figures are in the lesson-doc sprint doc).
  LeaderHub's `getScheduleTypeFor(date)` (src/10) is the lookup there;
  CAS gets the same data in the lesson-doc sprint. LeaderHub tests that
  read fixed line ranges move with the source: re-locate, never loosen.
- **Render to check a page change.** Build 07's HTML through the sandbox,
  stub `google.script.run` with fixture data, screenshot with Playwright;
  done for the filters, the student's page and Settings.

## From the 2026-10-28 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-28.md`)

The earlier notes still hold. Added:
- **The student side of a lesson is its prompt file, in both courses:**
  `lessons/<course>/prompts/<lesson>.md`, used only when
  `status: approved`. 8175 plans (`L<NN>.md`) still carry their Canvas
  text as the Drive docs have it, but the builder doesn't read it. A
  prompt's first line is "Assignment:", or for some 8175 lessons
  "Project:", "Discussion:" or "Extra Credit:" (`TITLE_LINE`). 02's
  `_docStudentTask_` and the cartridge drop that line.
- **Lessons in parts:**
  - `PARTS.json` is live. `PARTS_DRAFTS.json` is where a new split waits
    for approval, and the builder never reads it.
  - `node tools/cas-ccps/check-parts-drafts.js [file]` builds and checks
    a split, including `PARTS.json` itself.
  - `render-parts-drafts.js` regenerates `cas-ccps/curriculum/lessons/LESSON_PARTS.md`
    (a test keeps it current).
  - A part's paragraph must **start** with "Part n:", with a blank line
    before it.
- **68 is in the Central Ledger and the Teacher Dashboard, not the
  Student Dashboard.** 13 reads a part from StudentAssignments (the "-P<n>"
  ConfigID) and the part's title from the Ledger row's name.
- **A test that loads 37 must load 68 and 03** (and 55b when it exercises
  parts): the sandbox-scope test enforces it. Check O forbids `typeof`
  guards for functions always in the project, so load the file instead.
- **docs-check:** a new file under `cas-ccps/` needs a `cas-ccps/README.md`
  change in the same PR, one under `meta/` needs `meta/README.md`, and a
  new top-level test or tool needs the root `README.md`.
- **A day's bell schedule** is 00's `bellScheduleFor_(ymd, overrides)`.
  Left without `overrides`, it reads ⚙ Settings' `SCHEDULE_DAYS` once per
  run (`bellSavedDays_`, cached). Pass `{}` in a test that must not read
  config. A new schedule needs a `BELL_CLASS_MINUTES` row and a place in
  07's `TD_SCHEDULE_DAY_CHOICES`.
- **Stacked PRs merged by squash:** rebuild the next branch with
  `git checkout -B <branch> origin/main` and cherry-pick its own commits,
  then `--force-with-lease` (own branches only). Check the result builds
  before pushing: a conflict resolution once dropped a closing brace in 07.

## From the 2026-10-29 handoff

(`archive/2026-27-Q1/meta/HANDOFF_2026-10-29.md`)

The earlier notes still hold. Added:
- **The push is `run.js`.** From a GitHub zip it stamps each build's marker
  with the zip's commit (`.kos-build-commit` in the checkout), or keeps the
  last push's commit for a project whose code (all but its marker file and
  `.clasp.json`) is unchanged (`<registry>/<project>/last-build.json`).
  Editing only a marker file's comments still pushes it, and a web app
  then cuts a version. `node run.js --verify` checks the live deployments.
  `tools/deploy-drift/README.md`, "run.js stamps the push".
- **The rollout (58) is live in APPLY for both courses.** A run that stops
  short schedules a one-off `runLessonRolloutCatchUp` trigger;
  `ROLLOUT_CATCHUP` and `ROLLOUT_BUSY_UNTIL` are its Script Properties.
  `_lrEnrollOrder_` decides who goes first; a test pins it.
- **A function called per row must not call `getConfig_()`**, which reads
  every Script Property: memoize per execution (29's `_studentIdPattern_`,
  02's `_intakeMemo_`).
- **Tests that need git history** must build their own repo: CI's checkout
  is shallow (`tests/tools/deploy-drift-check.test.js`'s
  `commitContains` test).
- **Logs the operator pastes** carry counts and positions only. The
  rollout and intake logs show ConfigIDs (`VDOE-…`), which stay out of the
  repo's docs.

## From the 2026-10-31 handoff

(`archive/2026-27-Q2/meta/HANDOFF_2026-10-31.md`)

The earlier notes still hold. Added:
- **History was rewritten (above).** Pre-10-31 commit IDs are gone; cite PRs.
- **A public function in a shared web app needs a caller check.** In the
  Teacher Dashboard, Student Dashboard and leader-hub projects, any
  top-level function without a trailing `_` can be called by any visitor
  and runs as the owner. Call `_isAuthorizedTeacher_`, `requireScriptOwner_`
  (00b, which lets triggers through) or `_lhRequireOwner_` first, or list it
  with a reason in `tools/gas-lint/webapp-public-allow.json`. gas-lint fails
  it otherwise. Don't add a trailing `_` to an editor-run function to hide
  it: that also hides it from the editor's Run menu.
- **Student words that reach a prompt** go through `findSystemText_` (refuse,
  at the student's save) or `neutralizeSystemText_` (00, at prompt build).
  A new machine marker goes on `SYSTEM_TEXT_PATTERNS` in the same commit.
- **A run-overlap guard** is `claimRunSlot_(key, ms)` (00), never a plain
  check-then-set on a Script Property. A read-modify-write of `_CONFIG`
  reads `freshConfigValues_()` under the script lock.
- **The student-data scan reads Office and zip files.** Never commit a
  generated file or catalog that embeds Drive or roster data; a catalog that
  lists student files is student data.
- **Never print a phone number or a student identifier** while checking for
  one: count, hash or mask it. The 10-31 checks did.

## From the 2026-11-01 handoff

(`archive/2026-27-Q2/meta/HANDOFF_2026-11-01.md`)

The earlier notes still hold. Added on 11-01:
- **`run.js --latest` pushes without asking.** It extracts the newest
  `KOS-main*.zip` and pushes every project; it prints no change list and
  waits for no "yes" (a planned feature, never built). It does stop when
  its own copy differs from the checkout's, and prints the `copy /Y` line.
- **The hub's registry folder** (`clasp-registry\mothership-hub\`):
  `deployments.txt` holds the deployment ID alone. Pasting the
  `clasp list-deployments` line brings its ` @n` along, and `run.js` then
  reports the live deployment as "not in deployments.txt" and moves
  nothing. In `cmd`, `echo ...@2>file` also reads `2>` as a redirect.
- **A check that reads fixture rows needs them planted first**
  (leader-hub's `installAiFlowFixtures` before `checkAiFlowFixtures`).
  Give the operator both steps.
- **Sandbox scope (gas-lint Check K).** A test's `loadGasFiles` list has to
  include every file the exposed functions reach. Adding a call to
  another file usually means adding that file to several sandboxes. The
  lint names each one, and the "every sandbox is closed" meta-test fails
  too. Example: `partOfConfigId_` needs `55b_LessonAssignmentData.js`.
- **Client JS inside `07`'s template literal.** An apostrophe in a
  single-quoted string is written `\\'` in the source.
- **Flow prompts are generated** (rule 16). Edit
  `CAS_Flow3_Flow4_Specification.html`, then run
  `tools/cas-ccps/generate-flow-prompts.js`. Never edit `40_FlowPrompts.js`
  by hand. After a push, run `syncFlowPromptsToSheet()`.
- **The guides' Markdown copies are generated.** Edit the HTML in
  `cas-ccps/docs/`, then run
  `node tools/cas-ccps/build-guide-notebook-sources.js` (`--check` in CI).
- **Canvas cartridges are generated.** Run
  `tools/cas-ccps/build-canvas-cartridge.js` after a change to lessons or
  parts (`--check` in CI), and tell the operator to re-import.
- **A new test file is named in `tests/README.md`** (the root README until
  2026-11-21), and a new tool in `tools/README.md`, or docs-check fails.

## From the 2026-11-08 handoff

(`archive/2026-27-Q2/meta/HANDOFF_2026-11-08.md`)

The earlier notes still hold. Added 11-02 to 11-08:
- **Session logs** are read from `[RAW]_LOG-<hash>` in `03.4_RAW_EXHAUST`
  (CLAUDE.md). None arrived after 11-03 as of 11-08. `KOS_CODE_REPLY` is
  in the operator's Drive; find it by name.
- **CodeQL fails a PR on test lines that look like URL or HTML
  sanitizing:** a substring check on a host (`a.includes('evil.com')`) or a
  one-pass tag strip (`.replace(/<[^>]*>/, '')`). In tests, use
  `assert.doesNotMatch` or `split(/<[^>]+>/).join('')`.
- **Student Dashboard client calls go through the page's `scriptRun` helper** (in 13's page script), never
  `google.script.run` directly, so demo mode answers from its stubs.
- **The turn-in switch** `TURN_IN_CODE_COURSES` takes course codes and
  lesson IDs (the cartridge builder's `--turn-in` syntax); one function,
  `turnInSwitchCovers_` (71), reads it.
- **Parallel agents** work in `git worktree`s off `origin/main`; PRs that
  touch 13, 07 or the READMEs usually need a rebase after the first
  merges. Main also gets the hub's `chore: log … decision` commits.
- **The decision register** (`DECISION_REGISTER`) repeats a decision when a
  later log echoes it. Resolve the original and mark repeats
  `DROPPED`, "Duplicate of <id>". After the push, L2 holds new echoes in
  `DECISION_ECHOES` instead.
- **The setup guide's reference is generated:** a change to a cas-ccps
  file list, Script Property, trigger or flow needs
  `node tools/setup-guide/build.js` and the result committed, or CI's
  `--check` fails. Two PRs can each pass and still leave main stale (it
  happened with #406 and #408): regenerate after the second merges.
- **CAS mail goes through `casMail_` (00)** for the `[CAS] ` prefix and the
  sender name; **a share with the teacher goes through `shareWithoutEmail_`
  (02)** so it doesn't email. New mail or teacher shares should use them.
- **`tools/release-check`** runs warn-only in CI. Don't add Drive IDs,
  Docs links or web-app URLs, fixtures included: assemble a made-up one at
  run time (as `ledger-schema-guard.test.js` does).
- **The test harness's trigger builder** now has `forSpreadsheet`,
  `onFormSubmit`, `onEdit`, `onChange` and `ScriptApp.EventType`.
- **Work files by type** (Phase 4): a part's `workType` (`doc`, `form`,
  `slides`, `sheet`) must match its planned `workFile`, and its checks
  (`formChecks`, `slideChecks`, `sheetChecks`; 00's normalizers list the
  keys) are exact. One tab, `FormSnapshots`, holds every non-doc copy's
  snapshot doc and checks, whatever the type (its column names say "Form"
  for history). Marking a part: make a blank template in the operator's
  Drive (an agent can, through the Drive connector), set
  `WORK_TEMPLATE_<PART KEY>`, edit `PARTS.json` and drop "this document"
  from the part's task, then run the three generators and
  `render-parts-drafts.js`; the tests pin which parts are marked. Canvas
  text is changed by hand, never by re-import. Templates' file IDs never
  go in the repo.
- **Stacked PRs and squash merges:** after the lower PR merges, rebase the
  upper one with `git rebase --onto origin/main <lower branch>` and retarget
  its base to main; CodeQL runs only on a PR whose base is main.

## The dashboards' pages are .html files (2026-11-21, structure audit 4.5)

- **The template-literal traps above no longer apply.** The Teacher
  Dashboard's page and My Context page, and the Student Dashboard's page,
  are `cas-ccps/scripts/07_TeacherDashboardPage.html`, `07_MyContextPage.html`
  and `13_StudentDashboardPage.html`: plain HTML and JavaScript, so no `\'`,
  `` \` `` or `\${` escaping. The notes above about quotes in 07's and 13's
  template literal describe the old files.
- **Server values are `<?!= name ?>`**, set by the build function
  (`buildDashboardHtml_`, `buildMyContextHtml_`, `buildStudentDashboardHtml_`)
  in its `renderPageTemplate_("<page>", { name: ... })` call (00). A new value
  needs both; `tests/cas-ccps/dashboard-pages.test.js` fails on a name set in
  one and not the other, because Apps Script throws on an unset one and the
  page would not load.
- **A test that reads the page's text** reads the `.html` (and the `.js` for
  server code). The sandbox's `HtmlService` renders the templates.
- **00 is split three more ways (structure audit 4.6).** What only one
  project uses is in `00c_CentralLedgerShared.js`, `00d_TeacherDashboardShared.js`
  or `00e_StudentDashboardShared.js`. A test sandbox that loads
  `00_SharedConfig.js` loads all three after it (as 00 used to hold them);
  one that takes a project's files from `project-map.json` gets its own
  already, so don't add it twice (a duplicate `const` throws).
