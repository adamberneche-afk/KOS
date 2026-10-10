# PRD: CAS-CCPS Research-Alignment Pivot (revised)

Oct 10, 2026 · revision of the Oct 9 draft, checked against the repo at `cdcc6f3` (1,567 tests passing)

## Overview

This PRD says how to change `cas-ccps/` so it implements the research it cites, not just resembles it. It replaces the Oct 9 draft. Every requirement has been checked against the code. Each one lists its **secondary effects**: what else the change touches one step out (other files and projects, data, people, Studio, and the other requirements). Appendix B lists what changed from the Oct 9 draft and why.

**Audience.** Claude Code working in the KOS monorepo. The teacher-maintainer reviews each PR, and the operator runs everything live.

**Order of work.** `meta/PLAN_2026-10.md` stays the plan of record: CAS live by Oct 30, one feature at a time. This PRD runs **alongside** that plan, not instead of it (Q7). Phase 0 fixes defects that would break the plan's own launch weeks, so it comes first. Phases 1 and later begin only after the first real week of Flow 2.

**How to use it.** Work one requirement per `claude/*` branch and PR, in ID order inside each phase. Each PR cites its requirement ID, updates tests, and passes the four checks below before review.

**Scope rule.** Change only what a requirement names. If the code contradicts this PRD, trust the code, stop, and record the mismatch in the PR description.

**Naming convention.** Functions that exist today are written with parentheses, for example `submitMyWork()`, and `tools/doc-currency` verifies them. Proposed names are written without parentheses, for example `refreshPivotMetrics`, and do not exist until their PR adds them.

## Background and problem

CAS agrees with the research on AI guardrails but does not implement the interventions those studies tested, and some of its scoring works against them. Checking the Oct 9 findings against the code also turned up live defects that come first. Two of them would break the warm-up launch planned for the week of Oct 20.

### Live defects (Phase 0)

| Defect | Where | Effect today | Fixed by |
|---|---|---|---|
| Flow 3/4/5 prompt placeholders are never filled. `wfbBuildFlow3Fields_()` returns camelCase keys (`warmupAnchor`). The prompts use snake_case (`{warmup_anchor}`). `substituteFlowPrompt_()` only upper-cases, so `WARMUPANCHOR` ≠ `WARMUP_ANCHOR`. Flow 4 is passed only `originalPrompt`. Flow 5 is passed `{}` (`41_WarmUpFlowBridge.js:511`). | `41` `wfbPromptFor_()` callers; `40` `substituteFlowPrompt_()` | Only `{archetype}` and `{objective}` are filled in Flow 3. Studio is told to bind the `PromptText` chip (`42_FlowBuildSpec.js:225`), so Gemini would receive literal `{first_name}`, `{response_text}` and so on. | P0-01 |
| Archetypes are never recorded. `updateShadowMatrix_()` keys archetypes by queue ID (`WUQ-…`, `23:644`) but looks them up by lesson ID (`LES-…`, `23:655`). Nothing writes the chosen archetype to WarmUpQueue column 19 (`wfbApplyFlow3_()` writes only the doc ID, URL and status). | `23`, `41` | `best_archetype` is always null. The lock and the teacher interrupt email never fire. After a student's first scored warm-up in a unit, the early-unit rule gives **BRIDGE every day**. | P0-02 |
| Student text can break out of the Flow 2 prompt. The only sanitizer, `_sanitizeFlow2StudentText_()`, runs on the disabled `DIRECT_GEMINI` path. Studio's Extract step pastes doc text directly. 15b's own security note says Studio needs its own step, and custom steps are blocked on the district account. | `13`, `15b`, `15c` | A submission containing `<<<END_STUDENT_SUBMISSION>>>` or a `[SYSTEM: APPROVED]` line can steer the evaluator. | P0-03 |
| The turn-in gate is spoofable and no longer needed. `scanCompliance_()` looks for the text `[SYSTEM: APPROVED]` anywhere in the doc, and stacked feedback blocks keep old stamps. The 15-second revision check passes on any two quick autosaves and passes automatically on a Drive API error. The account email is typed into the form. | `04_Form2_TurnInGate.js` | The Turn-In Form is no longer student-facing (Canvas handles turn-in), but `dispatchFormSubmit()` still calls `onTurnInSubmit()` on every form submission. | P0-04 |
| `aggregateEvidence_()`'s missing-columns path returns `result` before declaring it (`30:213` vs `30:246`). | `30` | It throws a ReferenceError instead of returning an empty result. | P0-05 |

### Research gaps (Phases 1–5)

| Finding (corrected) | Where | Research | Fixed by |
|---|---|---|---|
| Word count is 6 of 10 warm-up points. Tiers are 30+ words → 6, 25+ → 5, 15+ → 3, under 15 → 0. The total is summed in `41` `wfbApplyFlow4_()` (`41:903`), not in `25`. | `25` `WORD_COUNT_THRESHOLDS`; `41:903`; `39:482` | Perelman (2014) | P1-06 |
| No measure of learning without AI feedback | No unaided task exists | Bastani et al. (2025) | P1-04 |
| The SCR review card shows the AI suggestion next to Confirm (`07:2274`), so a one-click confirm and a real judgment look identical in SCRDecisionLog | `07` `getScrReviewQueue()`, `_recordScrDecision_()` | Automation bias (Selwyn et al.) | P1-03 |
| No de-identified view of outcomes | Ledger columns 24–27, SCRDecisionLog | All | P1-02 |
| `competency_gaps` is class-level and **usually empty**. AlignmentLog rows are written when the teacher submits a lesson (`22:206`), before the 3 a.m. profile run, so the lesson's own competencies already count as "addressed". | `23` (`23:994`) | Kalyuga et al. (2003) | P2-01 |
| BRIDGE (one of four archetypes: PROVOCATION, PARADOX, CONCRETE_SCENARIO, BRIDGE) is one sentence of instruction with no worked example and no fading. It appears in **both** Flow 3 modes. Mode A is the anchor-aware prompt and Mode B the generative one. | Flow 3 prompts in the spec HTML | Kirschner, Sweller & Clark (2006); Kalyuga et al. (2003) | P2-02 |
| Warm-ups preview tomorrow's lesson, and Mode B says "not review questions" | `24` `buildWarmUpQueues()` | Bjork (1994) | P2-03 |
| `within_confidence` = samples ÷ 8. `cross_confidence` is one decay-weighted global value copied into every unit. Units sort alphabetically (`23:722`), so S1-U10 sorts before S1-U2. | `23` shadow matrix | Mislabels data volume as readiness | P2-04 |
| The lock is checked before the early-unit rule. With four full prior units, one sample in a new unit gives cross 0.764 ≥ 0.75, which locks. There is no exploration. Archetypes are scored by same-day engagement, and INCOMPLETE counts as 0. This is dormant until P0-02 makes it live. | `41` `wfbSelectArchetype_()` | Bjork (1994) | P0-02, P2-04 |
| No model of prerequisites and no path to intervention | Absent. "Tier 2" already means **Tier 2 Honors** and is sent to the model as ACADEMIC TIER | Bjork (1994) | P3-01 |
| Flow 2 sees rubrics only, not teacher exemplars or misconceptions. There is no guarded block for teacher content, which is substituted unescaped. | `37` `_fiBuildPromptText_()`, `15b` | Bastani et al. (2025) | P3-02 |

## Goals, non-goals, and success metrics

The pivot succeeds when CAS can show, from its own data, whether students learn more with it, and when each research claim it makes names a feature that implements it.

**Goals.**
- Warm-ups and evaluations work as designed before anything is tuned (Phase 0).
- Learning without AI feedback is measured, so a crutch effect would show up.
- Teacher review is measurable, so rubber-stamping would show up.
- Length stops driving warm-up scores.
- Scaffolding matches each student's evidence and fades as they improve.
- Warm-ups include spaced retrieval.
- Archetype selection is honest about how much data it has, and is judged by later outcomes.
- Missing prerequisites are detected and the student is routed to the teacher.

**Non-goals.**
- No change to Canvas turn-in or Canvas grading.
- No new web app deployments, and no change to the Student Dashboard's URL.
- No student data leaves the district Workspace.
- No automatic intervention placement. CAS flags; the teacher decides.
- The curriculum is not replaced.
- No efficacy claims in docs until the metrics have one full unit of real data.

**Success metrics** (computed by P1-02; the targets are review triggers, not grades)

| Metric | Source | Review trigger |
|---|---|---|
| Blind agreement: share of blind-sampled SCR rows where the teacher's rating equals the AI suggestion | SCRDecisionLog, `review_mode = BLIND` | Below 70% over 20+ blind rows: audit how Flow 2 uses the rubric |
| Standard override rate | SCRDecisionLog, `review_mode = STANDARD` | Under 5% while blind agreement is under 80%: rubber-stamp risk |
| Assisted-to-unaided gap: first-pass rate on feedback-checked work minus Met rate on the unit's unaided checkpoint, per competency | Ledger columns 24–27, CheckpointScores | Gap above 25 points: crutch risk |
| Retrieval engagement by spacing distance | WarmUpQueue `warmup_kind = RETRIEVAL` | Falling across two units: revisit spacing |
| Archetype lock share and exploration share | StudentProfiles shadow matrix | Lock share above 60% before unit 5: check thresholds |
| Word-count share: correlation of word count with warm-up total | WarmUpQueue | Above 0.3 after P1-06: weights still favour length |
| Archetype mix (new) | WarmUpQueue column 19 | Any archetype above 70% of a section's warm-ups for a unit: check selection (catches a repeat of the BRIDGE-every-day defect) |

## Constraints and repo conventions

These come from `meta/HANDOFF_2026-10-08.md` and the tools in `tools/`. A PR that breaks one is not done.

**Read first.** `meta/HANDOFF_2026-10-08.md`, then `cas-ccps/README.md` and `cas-ccps/DEPLOYMENT_HANDOFF.md`.

**Workflow.**
- One PR per requirement, from a `claude/*` branch, titled with its ID (for example, `P0-01: fill warm-up prompt placeholders`).
- CI green before asking to merge. The operator says "merge"; the session merges with a merge commit; the operator pushes `main`.
- An agent session never pushes to production and never runs `clasp push`. The operator runs everything live and pastes back logs. Never assume a run happened.
- Never create a new deployment for either web app. Updates go through `clasp version` and `clasp update-deployment` on the existing ID.

**Checks before every PR** (zero errors is the gate)

```
npm test
node tools/gas-lint/check.js
node tools/doc-currency/check.js
node tools/coverage-gaps/check.js
```

**Project boundaries** (from `tools/gas-lint/project-map.json`). Apps Script cannot call across projects.

| Project | Holds (relevant files) |
|---|---|
| central-ledger | `03`, `04`, `23`, `24`, `25`, `30`, `30b`, `37`, `41`, and all generators' output |
| teacher-dashboard | `07`, `23` (not `30`, not `04`) |
| student-dashboard | `13` only (plus `00`) |

`23` runs in two projects and must not call `30` (`23:953`). Any evidence signal reaches it as an argument passed by `24`. A new file must be added to every project that needs it, or gas-lint fails.

**Code rules.**
- Students cannot run Apps Script. Any student action goes through the Student Dashboard (`13`), which runs as the admin.
- Generated files are never hand-edited.
  - Flow 1 and Flows 3–5 prompts in `40_FlowPrompts.js` come from `cas-ccps/docs/CAS_Flow3_Flow4_Specification.html` and `15_StudioFlowPrompts.js`, via `tools/cas-ccps/generate-flow-prompts.js`. `tests/cas-ccps/flow-prompts.test.js` pins the placeholders.
  - Flow 2's prompt is hand-written in `15b_StudioFlowPrompts_Flow2_Revised.js`.
  - `53b` comes from `build-unit-rubrics.js`, `55b` from `build-lesson-assignments.js`, and the Canvas cartridges from `build-canvas-cartridge.js`. All three generators have `--check`.
- "What to do next" is code, not prompt text: `buildNextStepsText_()` in `03`, placed by `37`. `03`'s post-COMPLETE pass reads the doc body to check for that line (`03:258-276`).
- Deploy markers: any change to a GAS project's files needs `node tools/deploy-drift/stamp.js <project>`, committed on its own. A change to `00_SharedConfig.js` touches all seven projects that include it.
- The Ledger is 27 columns (`LEDGER_COL_COUNT`). Add no Ledger columns.
- **WarmUpQueue** has 21 data columns (0–20), and index 21 is `archive_status`, self-healed by `34_QueueWatchdog.js`. New columns start at **index 22**. The hard-coded width appears in `24` (`WQ24_*`), `25` (`WQ25_COL_COUNT`), `41`, and `34`'s readers, and all of them change together.
- **SCRDecisionLog** has 10 columns (`SCRDL`, `00:779`). It is written by three hard-coded 10-element `appendRow` calls: `07:896`, `30:480`, `30b:455`. Its decision types are CONFIRMED, OVERRIDDEN and RETRY_IMPROVED. It is append-only and legally retained (8VAC20-120-120).
- Sheets turns ID-like text into dates. Write such cells with format `@` and read them through the existing text helpers.
- New top-level test files go in `tests/cas-ccps/` and must be named in `README.md`. Tests that load a whole project read its file list from `tools/gas-lint/project-map.json`.
- `cas-ccps/studio-steps/` is unreachable on the district account. Port no logic there. When shared logic changes in `41`, add a superseded note to the matching step.
- There is no school-day counter. `_cybNoSchoolDays_()` creates and seeds its tab, so it is a write. Classes meet on ODD/EVEN days. For per-student spacing, count the student's own WarmUpQueue lesson dates instead of calendar or school days.

**Feature flags.** Every student-facing change in Phases 1–5 ships behind a flag that defaults to off. Phase 0 fixes ship on, because they repair intended behaviour, except the archetype lock (P0-02). Script Properties are **per project**, so every `PIVOT_*` key is added to `SHARED_CONFIG_KEYS` (`00:228`). That puts them in the Ledger's `_CONFIG` tab, set once and read by every project. Reads go through one helper in `00_SharedConfig.js` (proposed name `pivotFlagFor`, taking a flag and a course code) so tests can toggle them. Values:
- Numeric flags (`PIVOT_BLIND_REVIEW_RATE`, `PIVOT_RETRIEVAL_EVERY`) take a number, paired with a `_SCOPE` key.
- All others take `off`, a course code (`8175` or `8177`), or `all`.

| Flag | Read in project(s) | Requirement |
|---|---|---|
| `PIVOT_ARCHETYPE_LOCK` | central-ledger | P0-02 |
| `PIVOT_BLIND_REVIEW_RATE` + `_SCOPE` | teacher-dashboard | P1-03 |
| `PIVOT_UNAIDED_CHECKPOINTS` | student-dashboard, teacher-dashboard | P1-04 |
| `PIVOT_WORDCOUNT_GATE` | central-ledger | P1-06 |
| `PIVOT_SCAFFOLD_FADING` | central-ledger | P2-02 |
| `PIVOT_RETRIEVAL_EVERY` + `_SCOPE` | central-ledger | P2-03 |
| `PIVOT_ARCHETYPE_V2` | central-ledger, teacher-dashboard | P2-04 |
| `PIVOT_SUPPORT_WATCH` | central-ledger, teacher-dashboard | P3-01 |
| `PIVOT_ANSWER_KEYS` | central-ledger | P3-02 |
| `PIVOT_FLOW2_HISTORY` | central-ledger | P4-05 |
| `PIVOT_DASHBOARD_FEEDBACK` | central-ledger, student-dashboard | P5-01 |
| `PIVOT_SUBMIT_PREVIEW` | student-dashboard | P5-02 |
| `PIVOT_READY_NOTICE` | central-ledger | P5-03 |
| `PIVOT_WARMUP_JOURNAL` | central-ledger | P5-04 |
| `PIVOT_DOC_LAYOUT_V2` | central-ledger, student-dashboard | P5-05 |

To resolve a row's course, use the same lookup existing course-scoped code uses, and name it in the PR.

**FERPA.** Student data never goes to Claude, the KOS Ledger, or either notebook. Ask the operator for logs with names redacted. Every new tab that holds student emails goes into `cas-ccps/docs/FERPA_DATA_MAP.md`. Retention defaults there are still the unconfirmed 5-year placeholder, and FlowInput has no retention pass. Each new tab names its retention rule, even if that rule is "pending district confirmation".

## Phase 0: fix what is broken (before the warm-up launch)

**Timing.**
- P0-01 and P0-02 must be merged and pushed before warm-up triggers go on (plan week of Oct 20).
- P0-03 should ride the first Student Dashboard version update after it merges, ideally before the first real Flow 2 submissions (week of Oct 13).
- P0-04 and P0-05 can merge any time.
- P0-06 must merge before the operator imports the Canvas cartridges (handoff queue item 4).

### P0-01 Fill warm-up prompt placeholders

**Change.**
- In `wfbPromptFor_()`, translate each flow's fields to the prompt's placeholder names through an explicit per-flow map, not automatic case conversion. The names differ beyond case: `competencyTexts` → `competency_texts_formatted`, `originalPrompt` → `original_prompt_text`.
- Flow 4 also passes `response_text` and `word_count_score`.
- Flow 5 passes `flow5_prior_response`, `pacing_prior_connection` and `course_name`, which are already in scope at `41:508`.
- Placeholders whose data is not wired yet get an explicit empty value, so no literal `{name}` reaches Gemini.
- Leave the prompt text and the spec HTML unchanged.

**Secondary effects.**
- **What Gemini sees changes completely.** This is the first time warm-up prompts carry the student's first name, the lesson anchor, competencies, engagement average and the shadow note. Expect different output, and run `runWarmUpFlowCanary()` and one real warm-up before triggers go on.
- **Studio binding.** It matters only if the operator bound the `PromptText` chip as the spec says. If the operator pasted the prompt and bound columns one by one instead, this fix changes nothing live. Ask the operator which.
- **Student prose in a second cell.** Flow 4's `PromptText` will now contain `response_text`, which is already in the same row's `ResponseText` column. Confirm that whatever scrubs or archives Flow4Input covers `PromptText` too. If nothing does, record it in `FERPA_DATA_MAP.md`.
- **Prompt length.** It grows by roughly the size of the lesson context. Sheets cells cap at 50,000 characters, so the test asserts a ceiling.
- **Shadow note.** `shadow_archetype_note` reaches the model, but stays empty until P0-02 fills the matrix.
- **Unblocks** P1-06, P2-02 and P2-03, which all plan to add inputs through `PromptText`.

**Acceptance.**
- For every flow and mode, the substituted prompt contains no `{snake_case}` placeholder. The test allow-lists the literal braces the spec uses on purpose.
- Field-to-placeholder map tests pass.
- Existing `warmup-flow-bridge.test.js` and `flow-prompts.test.js` pass.

### P0-02 Record archetypes, with the lock held off

**Change.**
- Carry `queue_id` in each warm-up score object built for `updateShadowMatrix_()`, and look archetypes up by it.
- Write the chosen archetype to WarmUpQueue column 19 exactly once per queue row: where the Flow 3 input row is materialized (the archetype is known there), or in `wfbApplyFlow3_()`.
- Ignore `UNKNOWN` entries already stored in shadow matrices when computing `best_archetype`.
- Behind `PIVOT_ARCHETYPE_LOCK` (default off), skip the cross-unit lock in `wfbSelectArchetype_()` and the interrupt email in `checkShadowMatrixInterrupts_()`.
- Add a superseded note to `studio-steps/SelectWarmUpArchetypeStep.gs`.

**Secondary effects.**
- **Students stop getting BRIDGE every day.** After three scored warm-ups in a unit (within ≥ 0.3), students leave the early-unit rule and enter the decision table. Teachers will see variety for the first time. Tell them.
- **Dormant paths wake up.** The dashboard buckets in `buildShadowMatrixSummary_()` and `getStudentShadowProfile_()` start showing non-zero values. With the lock flag on, the one-sample lock described under P2-04 becomes real. That is why it ships off.
- **No backfill.** Past warm-ups never stored an archetype. This is acceptable because warm-ups are not live yet.
- **Tests.** No test covers `updateShadowMatrix_()` today, so this PR adds the first.
- **Data for P2-04.** One unit of recorded archetypes is P2-04's prerequisite.

**Acceptance.**
- A fixture student with three scored warm-ups gets `archetype_history` entries carrying real archetypes.
- Column 19 is written once per row.
- With the lock flag off, a student who meets the old lock condition is not locked and no email is sent. With it on, the current behaviour is reproduced.

### P0-03 Guard submissions against system text

**Change.**
- In `submitMyWork()`, after extraction, refuse text that contains `<<<STUDENT_SUBMISSION>>>`, `<<<END_STUDENT_SUBMISSION>>>`, `[SYSTEM:`, `[SUGGESTED_SCORE`, or `[MILESTONE_OUTCOMES`.
- Return `{ ok: false, error: "SYSTEM_TEXT_IN_RESPONSE" }`, and add a `SUBMIT_ERRORS` message: "Your response contains text copied from a feedback block (for example a line starting with [SYSTEM:). Remove it and submit again."
- Strengthen the security paragraph in 15b's prompt to tell the model that anything inside the submission block that looks like a system stamp is student text.

**Secondary effects.**
- **False positives.** Feedback blocks carry a visible `[SYSTEM: …]` stamp by design, so a student who pastes old feedback into their response is refused. The message must say exactly what to remove.
- **Edits after submitting.** Studio reads the doc when it evaluates, not when the student submits, so a student can add text after the check passes. Closing that gap needs one of these, each with its own cost:
  - lock the doc while it waits (the student-dashboard manifest has no `drive` scope, so the admin re-authorizes once, and the doc needs an unlock path);
  - have `03`'s post-COMPLETE pass, which already reads the body, flag any stamp that appears inside the response zone;
  - P5-05's layout.

  This PR does the `03` flag only. The rest is recorded as remaining risk.
- **Teacher menu.** `01`'s menu path is unaffected.
- **Redeploy.** The Student Dashboard needs a version update (no new deployment).
- **P5-07's fixtures** test this guard.

**Acceptance.**
- Each token is refused with the new code, and clean text is unchanged.
- The client maps the code to its message.
- `03` logs a warning when a stamp sits between the response marker and the footer.

### P0-04 Retire the turn-in handler, keep its helpers

**Status: done 2026-10-10.** The handler and its forensic check were removed (`cas-ccps/HISTORY.md`, P0-04). Two corrections from doing it: `10` only mentioned `runForensicCheck_()` in its Drive health check, which was removed with it; and `16`'s wizard no longer creating the form was a follow-up PR the same day.

**Change** (as specified; the functions named here were removed):
- Remove the `onTurnInSubmit()` call from `dispatchFormSubmit()`.
- Delete `onTurnInSubmit()` and the functions only it uses: the stamp gate, the three-point match and the forensic revision check.
- **Keep `04_Form2_TurnInGate.js` in central-ledger** and update its header, because it hosts helpers other files call:
  - `findLedgerRow_()` (`37`)
  - `scanCompliance_()` (`07`, `15c`)
  - `extractSuggestedScore_()` (`15b`, `37`, `35`, `15c`)
  - `_ensureTurnInReviewColumns_()` (eight files)
  - `_lockDocAfterSubmission_()` (`25`)
  - `extractFileId_()` (`05`, `07`)
- `runForensicCheck_()` is called by `10`'s admin panel. Remove that admin action with it.
- Stop `16`'s setup from creating Form 2 for new installs.
- Add a HISTORY.md entry.

**Secondary effects.**
- **The turn-in lifecycle becomes unreachable.** `PENDING_TEACHER_REVIEW` → `COMPLIANT` is no longer set by anything. This is already true in practice, because students do not see the form.
  - `07`'s turn-in review stays empty, and `TURN_IN_FINAL_SCORE` is never set.
  - `36`'s weekly "This week" section and `29`'s `finalScore` are always empty.
  - `13`'s `ALREADY_TURNED_IN` never fires.

  Note these in the teacher guide, and leave the code paths for a later cleanup.
- **The existing form.** The live Form 2 and its trigger stay in Drive. The operator can delete the form, or leave it, since submissions are ignored.
- **Drive v3 question goes away.** Removing the forensic check removes the only `Drive.Revisions.list()` call, along with the unverified concern about Drive v3 response shapes.
- **Unblocks P5-05.** It removes the last live parser of `[CONFIG_ID:]` in the doc body.

**Acceptance.**
- A dispatcher test proves Form 2 submissions do nothing.
- Every helper listed above still resolves in central-ledger, and gas-lint passes.
- `flow-input-builder`, `flow-fixtures` and `flow2-direct-evaluation` tests pass unchanged.

### P0-05 Small correctness fixes

**Change.**
- Declare `result` before the early return in `aggregateEvidence_()`.
- Make `updateShadowMatrix_()` sort units by numeric semester and unit, not alphabetically.

**Secondary effects.**
- The sort fix changes `cross_confidence` only for students past unit 9, so nothing changes this semester.
- The `aggregateEvidence_()` fix means a CompetencyEvidence tab with missing columns now returns empty rather than throwing. Callers that relied on the throw to alert anyone get silence instead, so log a warning.

**Acceptance.** Tests for both paths.

### P0-06 Student Dashboard link in the Canvas cartridges

**Change.**
- `build-canvas-cartridge.js` adds the Student Dashboard link to each module's first page and every CAS assignment page.
- The URL comes from a committed `cas-ccps/data/deployment-urls.json`, so `--check` stays deterministic. The URL is domain-restricted, not secret.
- Regenerate both cartridges.

**Secondary effects.**
- **Timing.** If the operator has already imported the old cartridges, re-importing duplicates modules. Hold the import until this merges, or delete the imported modules first.
- **The URL can never change.** That was already a rule because every doc carries it. Now it is also built into Canvas and the repo.
- **Students find the dashboard from Canvas**, which supports every later dashboard-centred requirement.

**Acceptance.**
- `--check` passes after regeneration.
- A test asserts the link appears on every assignment page and matches the JSON.

## Phase 1: measure, and cheap wins (after the first real Flow 2 week)

**Gate.** At least one week of real Flow 2 submissions, `checkFlow2Liveness()` and `checkFlow2Binding()` pasted clean, and Phase 0 merged.

### P1-01 Remove system IDs from student docs

**Change.**
- Stop writing the hidden Zone 4b paragraph in `stampDocument_()`. That paragraph holds `[SYS_LEDGER_SS_ID:]`, `[SYS_ADMIN_SS_ID:]` and the optional `[SYS_DASHBOARD_URL:]`. Keep the visible dashboard link line.
- Add the admin function `scrubLegacySystemBlocks` (dry run by default; logs counts only).
- `dashExtractResponse_()` keeps recognizing the legacy marker.

**Secondary effects.**
- **No readers lose anything.** Nothing reads `SYS_ADMIN_SS_ID`, and `SYS_LEDGER_SS_ID` is only an end-of-response boundary (`13:335`, `01:278`). `01`'s dashboard lookup already falls back to the visible "Your assignment dashboard:" line.
- **One fewer boundary.** Removing the hidden paragraph removes a backup end marker. A student who deletes the `[CONFIG_ID:]` footer now has extraction run to the end of the doc, which includes appended feedback, and that counts toward the 25-word minimum. P5-02's warning covers this.
- **Visible admin edits.** Scrubbing 92 docs adds an admin edit to each doc's version history, which students and teachers can see. Run it between lessons.
- **Reach.** New docs are created per lesson, so the change reaches every student within one lesson cycle without the scrub.

**Acceptance.**
- New docs contain no `SYS_` text.
- The dry run changes nothing.
- Extraction gives identical results on legacy and scrubbed fixtures.

### P1-02 De-identified pivot metrics

**Change.**
- Add the new file `56_PivotMetrics.js` (central-ledger only) with the manual entry point `refreshPivotMetrics`.
- It writes a `PivotMetrics` tab of aggregates only:
  - per Config ID: checks, PASSED, NEEDS_REVISION and first-pass rate, from `LEDGER.CHECK_COUNT` through `LEDGER.LAST_SUGGESTED_SCORE` (0-based 23–26);
  - SCR decisions by `review_mode` and decision type (all three types);
  - the archetype mix;
  - each success metric, once its inputs exist.
- No emails, names or Drive IDs. Cells with fewer than 5 students show `<5`.

**Secondary effects.**
- **Little to show at first.** With 21 students in 8177, most early per-assignment cells will show `<5`. "Per teacher" is the whole course while there is one teacher, so report per course and do not promise per-section numbers.
- **Repo bookkeeping.** Register the file in `project-map.json`, stamp central-ledger's deploy marker, and name the new test in `README.md`.
- **Later requirements** (P1-03, P1-04, P2-03, P4-02) each add a section here, so design the tab as named blocks, not fixed cell positions.

**Acceptance.**
- Exact aggregates from fixture Ledger and SCRDecisionLog data.
- No `@` sign or Drive-ID pattern appears in any written cell.
- Small-cell suppression is tested.

### P1-03 Blind SCR review sampling

**Change.**
- In `getScrReviewQueue()`, mark a row blind when a stable hash of `suggestion_id` falls under `PIVOT_BLIND_REVIEW_RATE`. Use the suggestion's own ID, or student + competency + ISO week if there is none. Default 0.2 when on.
  - Hashing on student + competency alone would make the same pair blind forever.
- Blind rows return `suggestedRating: null` from the server.
- The blind card asks for the teacher's rating first. On submit it records CONFIRMED if the rating equals the suggestion and OVERRIDDEN otherwise, with `review_mode = BLIND`, then reveals the suggestion.
- Append `review_mode` and `teacher_rating_before_reveal` to SCRDecisionLog:
  - extend `SCRDL` and `createSCRTabs_()`;
  - add a header self-heal in the style of `_ensureScrDecisionLogArchiveColumn_()`;
  - write all 12 columns only from `07`'s `_recordScrDecision_()`;
  - leave the `30` and `30b` writers at 10. Readers treat a missing `review_mode` as `STANDARD`.

**Secondary effects.**
- **Card rebuild.** The suggestion and Confirm render together today (`07:2274-2278`), so the blind card is a new card, not a hidden field.
- **Export.** `exportToWorkbookGrid_()` does not filter by decision type, so blind decisions export as ordinary decisions. That is intended. Nothing else changes in the export.
- **Width assertion.** `teacher-dashboard-scr-review.test.js:202` asserts a 10-column row. Update that assertion and nothing else in the test.
- **Other readers.** `36` reads only up to `SCRDL.ARCHIVE_STATUS`, so it is unaffected. The archive and count readers use `getDataRange()` and tolerate the width.
- **Teacher workload.** About one extra click on every fifth decision. Count blind decisions per week in PivotMetrics. Update the Teacher Reference Guide.
- **Redeploy.** Teacher Dashboard version update. The flag is read through `_CONFIG` because teacher-dashboard has its own Script Properties.

**Acceptance.**
- Sampling is deterministic and within ±3 points of the configured rate over 1,000 synthetic suggestions.
- Blind rows never carry a suggestion in the server payload.
- Both decision types record correctly.
- 10-column legacy rows read as STANDARD.

### P1-04 Unaided checkpoints

**Change.**
- New `UnaidedCheckpoints` tab (Config ID `@`, unit ID, competency IDs, created by). The teacher adds rows from the Teacher Dashboard.
- When `PIVOT_UNAIDED_CHECKPOINTS` is on and the Config ID is listed, `submitMyWork()` returns `{ ok: false, error: "UNAIDED_CHECKPOINT" }` and the dashboard shows "This one is practice on your own: no feedback check. Turn it in on Canvas."
- The Teacher Dashboard gets a "Checkpoint scores" panel (2–4 scale), stored in a new `CheckpointScores` tab.
- P1-02 reports the gap per competency.

**Secondary effects.**
- **Teacher Dashboard status.** A checkpoint workspace never gets a Flow 2 check, so Ledger columns 24–27 stay empty and the Teacher Dashboard shows every student as ⚪ "not checked yet". That is misleading. Add a fifth state, "practice: teacher scores", or exclude checkpoint Config IDs from the four-state view.
- **SCR evidence policy.** Checkpoint scores do not enter CompetencyEvidence, so SCR ignores the most independent evidence CAS would have. Whether they should count is a grading-policy decision (Q11).
- **Not a controlled comparison.** The checkpoint is a different task from the assisted work, so the gap mixes task difficulty with reliance on feedback. Pre-registration says so.
- **Data and people.** Two new tabs (FERPA map). One scoring pass per student per unit is new teacher work (Q2: dashboard entry or Canvas gradebook import).
- **Redeploys.** Both dashboards need version updates.

**Acceptance.**
- A listed Config ID is refused; an unlisted one is unchanged; flag off changes nothing.
- Scores write and read back with `@`-formatted IDs.
- The gap is computed from fixtures.
- Checkpoint rows get the fifth state.

### P1-05 Accommodations

**Change.**
- New `Accommodations` tab: student email, `min_words`, `wordcount_gate`, `extended_window_days`, set by, set at. Edited from the Teacher Dashboard.
- `submitMyWork()` and the warm-up scoring in `41` read the student's row before applying defaults.
- Store only the adjustment, never a diagnosis or plan type.

**Secondary effects.**
- **The minimum is written in three places.** `01:16-17`, `13:275-276`, and the client text at `13:775`, and a test holds the first two in step.
  - The accommodation applies on the student path (`13`) only, because `01`'s menu is teacher-run.
  - The client message must show the student's own minimum, not a hard-coded 25.
- **Ordering.** Must merge before P1-06 is turned on, or the gate repeats the barrier.
- **Data.** A sensitive-adjacent tab goes into the FERPA map with the tightest retention.
- **No flag.** An empty tab changes nothing.

**Acceptance.**
- Override and default paths are tested.
- No field name or value records a disability category.
- The client message uses the per-student minimum.

### P1-06 Word count becomes a gate

**Change** (behind `PIVOT_WORDCOUNT_GATE`, applied from a unit boundary):
- At or above 25 words (or the student's `wordcount_gate`), word count adds no points.
- Below the gate, behaviour is as Q1 decides:
  - **(a)** today's tiers continue to apply below the gate, or
  - **(b)** score 0 and mark the warm-up incomplete.

  Today, only a 0-word response is special-cased, by `writeIncomplete_()`.
- Proposed weights, pending Q1:

| Component | Today | Proposed |
|---|---|---|
| Word count | 6 | 0 at or above the gate |
| Engagement (Flow 4, 0–3) | 3 | 9 (×3) |
| Grammar (Flow 4, 0–1) | 1 | 1 |

- Change the sum in `wfbApplyFlow4_()` (`41:903`), the fixture formula (`39:482`), and the `word_count_score` wording in the Flow 4 prompt (spec HTML, then regenerate).
- Add a superseded note to `FinalizeWarmUpScoreStep.gs`.
- The Oct 9 draft's `uses_feedback` component is deferred to a later requirement. It needs the student's previous warm-up feedback (`WQ25_FLOW4_FEEDBACK`, AI text, capped at 500 characters) looked up from another queue row and sent as a new Flow 4 input. Make that its own PR after this one has a unit of data.

**Secondary effects.**
- **Gemini's variance is amplified.** One point of engagement now moves the total by 3, and the model is not pinned (P4-01).
- **Grading policy changes mid-semester.** Warm-up grades feed the teacher's "Warm-Up Grade Report" (`25:989`). Start at a unit boundary and tell students and parents.
- **Report cap unchanged.** The 10-point cap in `25:969-976` stays valid because the total is still 10.
- **Depends on** P0-01 (Flow 4 otherwise never sees `word_count_score`) and P1-05.
- **Metric.** P1-02's word-count metric becomes meaningful.

**Acceptance.**
- With equal Flow 4 output, scores at 25 and 200 words match.
- 24 words follows the Q1 rule.
- Flag off reproduces today's totals exactly.
- `flow-prompts.test.js` passes after regeneration.

## Phase 2: implement the pedagogy

**Gate.** One unit of real data in PivotMetrics, and one unit of recorded archetypes (P0-02). P2-01 comes first.

### P2-01 Per-student competency standing

**Change.**
- Add `getStudentEvidenceStanding_` beside `getStudentScrStandingForCompetencies_()` in `30`, cached per execution the same way.
- It reads CompetencyEvidence and returns, per competency, the best outcome per assignment (reuse `keepBestOutcome_()` and `evidenceAssignmentKey_()`) and the count of MET pieces.
- `24` passes the result into `getStudentProfileSnapshot_()`, which adds `student_competency_status`:
  - `NONE`: 0 pieces;
  - `EMERGING`: 1+ pieces, but fewer than 2 MET;
  - `SECURE`: 2+ MET.
- Keep `competency_gaps` unchanged for existing readers.
- Preload StudentProfiles once per run instead of once per student.

**Secondary effects.**
- **Runtime.** `getStudentProfileSnapshot_()` reads the whole StudentProfiles tab once per student today (about 180 full reads a night). Preloading cuts the 6-minute timeout risk that new reads would add.
- **Cell size.** The snapshot is stored in WarmUpQueue's `student_profile_snap` cell, which caps at 50,000 characters. Assert a size ceiling.
- **Evidence key fallback.** `evidenceAssignmentKey_()` falls back from `config_id` to file ID. Evidence rows without `config_id` count per file, which can double-count a student's copies.
- **`competency_gaps` stays broken.** Fixing its timing (exclude the current lesson's own AlignmentLog rows) would activate the decision table's "gaps → BRIDGE" branch and change the archetype mix. That is a separate, optional change (Q12).

**Acceptance.**
- The three states from fixture evidence.
- Multiple drafts of one assignment count once.
- One CompetencyEvidence read per execution across a 30-student roster.

### P2-02 Worked examples in BRIDGE, faded per student

**Change.**
- Behind `PIVOT_SCAFFOLD_FADING`, `41` computes `scaffold_level` from P2-01:
  - any lesson competency at `NONE` → `FULL`;
  - any at `EMERGING` → `PARTIAL`;
  - all `SECURE` → `NONE`.
- The BRIDGE instruction in **both** Flow 3 prompts (spec HTML, then regenerate) takes `{scaffold_level}`:
  - `FULL` opens with a short annotated worked example from a sports or event business;
  - `PARTIAL` gives the first steps and asks the student to finish;
  - `NONE` gives no example.
- A student at `NONE` scaffolding for every lesson competency is not sent to BRIDGE by the early-unit rule.
- Pass `scaffold_level` through `PromptText` (P0-01), and store it on the WarmUpQueue row at index 22 or later.

**Secondary effects.**
- **Longer warm-ups.** The extra reading time comes out of class time. Ask the teacher for a length cap.
- **Example quality is unchecked.** The worked examples come from an unpinned model. The teacher spot-checks a week of them before it widens.
- **Flow 4 scoring.** `PARTIAL` prompts invite shorter, completion-style answers. Engagement scoring and the P1-06 gate may need a prompt note so these are not under-scored.
- **Archetype mix shifts** toward BRIDGE for novices and away from it for secure students, so P2-04's outcome scoring should compare like with like.
- **Schema.** WarmUpQueue widening touches every width constant (see Constraints).
- **Studio steps.** Add a superseded note to `studio-steps/SelectWarmUpArchetypeStep.gs`.

**Acceptance.**
- The level mapping.
- Prompt regeneration.
- Flag off leaves Flow3Input and `PromptText` byte-identical.
- Widened rows round-trip through `34`'s watchdog.

### P2-03 Spaced retrieval warm-ups

**Change.**
- In `buildWarmUpQueues()`, when `PIVOT_RETRIEVAL_EVERY` is N (proposed 3, Q4), every Nth warm-up per student is a retrieval warm-up on one competency from an earlier unit.
- How the competency is chosen:
  - prefer the student's `EMERGING` competencies;
  - then the oldest unit first;
  - never one retrieved in the student's last 10 class meetings, counted from their own WarmUpQueue lesson dates. No school-day helper is needed, and ODD/EVEN schedules are handled.
- Add WarmUpQueue columns `warmup_kind` (`LESSON` or `RETRIEVAL`) and `retrieval_competency_id`.
- Flow 3 gets a retrieval instruction: recall and apply without the definition being restated. This also changes Mode B's "not review questions" line for retrieval rows only.
- Off automatically in unit 1.

**Secondary effects.**
- **Lesson anchor skipped.** On retrieval days the teacher's `warmup_anchor` for tomorrow's lesson is not used. The teacher should see which days are retrieval days, on the Teacher Dashboard.
- **Flow 5.** It bridges from the prior warm-up response, so on the day after a retrieval warm-up it bridges from off-lesson content. Skip Flow 5, or label the bridge.
- **Shadow matrix.** Retrieval is harder, so engagement drops. Exclude retrieval rows from archetype scoring, or P2-04 will learn to avoid whatever archetype happened to land on retrieval days.
- **Fading.** P2-02 uses the retrieved competency's status on retrieval days.
- **Schema.** WarmUpQueue widening (see Constraints).

**Acceptance.**
- The every-Nth cadence per student.
- The selection order.
- The 10-meeting exclusion from fixture queue history.
- Unit 1 is unchanged.
- Flag off leaves the queue unchanged.

### P2-04 Archetype engine v2

**Change** (behind `PIVOT_ARCHETYPE_V2`, in `23` and `41`):
1. Rename `within_confidence` → `within_coverage` and `cross_confidence` → `cross_coverage`. Readers accept both names, and writers write only the new ones.
2. Selection order: early-unit rule first (subject to P2-02), then the lock, then the decision table.
3. The lock requires at least 3 scored samples of `best_archetype` in the current unit. Make `cross_coverage` per unit rather than one global value.
4. Exploration: 1 in 5 locked warm-ups (stable hash of student + lesson) uses the second-best archetype.
5. Outcome scoring: an archetype's score is the share of the student's CompetencyEvidence outcomes on the warm-up's competencies that are MET within the next 14 days. Fall back to engagement when there are none, and record the basis used (`score_basis`).
6. Exclude INCOMPLETE rows and P2-03 retrieval rows from scoring.
7. Add a superseded note to `studio-steps/SelectWarmUpArchetypeStep.gs`.

**Secondary effects.**
- **Seven places read the confidence fields:**
  - `23:810` (dashboard buckets at 0.75 and 0.5)
  - `23:888`
  - `23:1005` (shadow note)
  - `25:639` (interrupt email)
  - `41:203-210`
  - the studio step
  - tests in `warmup-flow-bridge.test.js` and `select-warmup-archetype-step.test.js`

  The spec HTML and `CAS_M2_WarmUp_Schema.html` describe the fields too, so update them with the code.
- **The lock and interrupt email change together.** `PIVOT_ARCHETYPE_LOCK` from P0-02 is retired by this PR: with v2 on, the lock follows v2's rules.
- **Outcome data is sparse.** With rosters of 71 and 21, most early scores fall back to engagement. Report the share by basis in PivotMetrics.
- **Exploration is visible to teachers.** Some students deliberately get their second-best archetype. Explain it in the teacher guide.

**Acceptance.**
- The current one-sample lock after four full units is reproduced, and v2 refuses it.
- Key migration.
- The exploration rate over 1,000 synthetic warm-ups.
- Outcome scoring with and without later checks.
- Flag off is unchanged.

## Phase 3: close the scaffolding gap

**Gate.** The teacher has approved prerequisite entries for at least one unit. Claude Code builds the machinery and drafts content. Nothing goes live until the teacher approves it.

### P3-01 Prerequisite map and support watch

**Change.**
1. New `cas-ccps/data/CompetencyPrerequisites.json` mapping competency IDs (`8175-1` form) to prerequisite IDs, each entry marked `approved: true|false`. Claude Code drafts entries from `CompetencyRubrics.json` and the pacing guide, always `approved: false`.
2. A test validates every ID against `CompetencyRegistry.csv` (221 rows) and rejects cycles. First reconcile `CompetencyRubrics.json`'s metadata: `8177_count` says 108 while its note says 109.
3. Behind `PIVOT_SUPPORT_WATCH`, `runWeeklySCRSuggestionUpdate_()` also builds a `SupportWatch` tab. A student is flagged for a competency when they have 2+ NOT_MET pieces on it and an approved prerequisite is `NONE` or has a NOT_MET best outcome.
4. The Teacher Dashboard gets a "Support watch" panel (student, competency, missing prerequisite, evidence count). The teacher marks each flag Seen, Supporting or Not needed.
5. While a student has an open flag on a lesson competency, `41` uses BRIDGE (with P2-02 fading) for it, not PARADOX or PROVOCATION.

**Secondary effects.**
- **Name.** "Tier 2" already means Tier 2 Honors and reaches the Flow 2 prompt as ACADEMIC TIER. Never use it for this feature in code, tabs or text.
- **Authoring load.** 221 competencies is real teacher work (Q6). Start with one unit.
- **Exploration must respect the gate.** P2-04's exploration must not pick a gated archetype.
- **Runtime.** The weekly SCR run gets longer.
- **Data and reports.** One new tab with student emails (FERPA map). `36`'s parent report never includes these flags (P4-03 tests that).

**Acceptance.**
- The validator works and rejects cycles.
- Flag logic is correct on fixtures, including an unapproved prerequisite being ignored.
- The dashboard payload.
- Archetype gating, including that exploration respects it.

### P3-02 Teacher answer keys for Flow 2

**Change.**
1. New `cas-ccps/curriculum/answer-keys/`, one Markdown file per unit and course (for example `S1-U1_8175.md`). Each has an exemplar response, common misconceptions, and what a partial answer usually misses, with `approved: true|false` in the front matter.
2. `build-unit-rubrics.js` merges approved keys into `53b` as `answerKey`, skips unapproved files and lists them in its output, and covers the field in `--check`.
3. `_fiBuildPromptText_()` adds the key when `PIVOT_ANSWER_KEYS` is on. **No guarded block for teacher content exists today**, so this requirement creates one:
   - a `<<<TEACHER_KEY>>>` delimiter pair;
   - delimiter strings stripped from the key text;
   - rubric fields moved inside the same block.
4. The `15b` prompt: use the exemplar to judge completeness, name a matching misconception when one applies, and never show or quote the exemplar.
5. Claude Code may draft key files, always marked `approved: false`.

**Secondary effects.**
- **Size limits.**
  - `53b` grows, so watch the Apps Script project size.
  - `PromptText` grows, against the 50,000-character cell cap. Assert a ceiling per key.
- **Exemplar leakage.** The model may paraphrase the exemplar, and students' work may converge on it. Sample feedback for paraphrase in the first week.
- **The rubric moves too.** Moving rubric fields inside the new block changes Flow 2's prompt for every assignment, not just those with keys. Ship that part with the flag as well.
- **Authoring load.** The most teacher-authoring work in this PRD (Q6).

**Acceptance.**
- The generator merges and skips correctly.
- `--check` detects drift.
- Flow2Input with and without a key.
- Delimiter stripping.
- A prompt test asserts the "never show the exemplar" rule.
- Flag off gives a byte-identical `PromptText`.

## Phase 4: safeguards and resilience

### P4-01 Model drift watch (rescoped)

**Why.** Studio's Ask Gemini step is unpinned (`DEPLOYMENT_HANDOFF.md:91-96`). The existing canaries **simulate** Gemini's output (`35`, `runWarmUpFlowCanary()`), so they test plumbing and never the model.

**Change.**
- A weekly trigger places synthetic rows through the **real** Studio Flows: Flow 2 via the existing `39` fixture install, and Flow 4 via an equivalent warm-up fixture. It reads the scores back into a `DriftWatch` tab and emails the teacher when the mean or pass rate leaves a set band.
- Stamp each evaluation's FlowInput row with a hash of the prompt text used.

**Secondary effects.**
- **Studio usage.** Real runs consume Studio executions.
- **Fixtures must stay out of real records.** `VDOE-FIXTURE-*` IDs must never reach the Ledger, CompetencyEvidence or SCR. Add a test that the harvest skips them.
- **A new weekly email.** Fold it into P4-04's daily health line if that ships first.
- **P5-07's injection fixtures** reuse this path.

**Acceptance.**
- Band detection on synthetic series.
- The fixture contains no real names or emails.
- The harvest skips fixture IDs.

### P4-02 Non-use and uptake signals

**Change.**
- Add to PivotMetrics and the Teacher Dashboard:
  - students with no checks in N class meetings on an open assignment (default 5, counted from LessonSchedule);
  - an uptake rate: the share of re-checks where a competency NOT_MET on the previous check becomes MET, from CompetencyEvidence ordered by `evaluated_at` per `config_id`.
- Limit "What to do next" to one concrete action in `buildNextStepsText_()` (`03`), not in `15b`.

**Secondary effects.**
- **Feedback blocks change.** The one-action change alters every feedback block. The teacher guides quote that text, so update them.
- **New dashboard panel.** It names students, which is fine on the Teacher Dashboard. The metrics tab stays aggregated.
- **Meeting counting.** It needs LessonSchedule start dates typed in (handoff queue item 6).

**Acceptance.**
- Non-use counting from fixture schedules.
- Uptake from fixture evidence sequences.
- Exactly one action in the next-steps text.

### P4-03 Safeguards for the pivot itself

**Change.**
- Student-facing text never says "BRIDGE", "scaffold", "support watch" or "Tier".
- Unaided checkpoints are labelled practice.
- Every `PIVOT_*` flag gets a removal date in `00_SharedConfig.js`. Once a feature has been on for both courses for a full unit, a PR deletes the flag and its off-path.
- Add a test that `36`'s parent report reads no competency status, archetype or support-watch data. It already does not; the test keeps it that way.

**Secondary effects.**
- **Flag-removal PRs** are real work later. Budget one per feature.
- **Changing `00_SharedConfig.js`** touches all seven projects' deploy markers.

**Acceptance.**
- A string test over student-facing HTML and messages.
- The parent-report test.

### P4-04 Degraded mode

**Change.**
- A central-ledger trigger writes a health cell (Flow 2 and warm-up liveness, from `checkFlow2Liveness()` and `checkWarmUpFlowLiveness()`) to a `Health` tab.
- `13` reads that cell and shows "Feedback is delayed today; your work is saved" when Flow 2 is outside its liveness window.
- The teacher gets one daily health line instead of per-error mail.

**Secondary effects.**
- **A shared cell, not a call.** student-dashboard cannot call central-ledger's liveness functions, so the cell is the interface between them. Stale-cell handling: no update in 2 hours means "unknown", not "healthy".
- **Error-mail senders change.** Per-error mail is sent from several places (`34`'s watchdog among them). Find every sender before consolidating.
- **Redeploy.** Student Dashboard version update.

**Acceptance.**
- The banner logic covers healthy, delayed and stale.
- The digest replaces per-error mail in tests.

### P4-05 Flow 2 workspace history

**Change.**
- Behind `PIVOT_FLOW2_HISTORY`, `buildFlowInputRows()` adds `CheckCount` and `PrevResult` from Ledger columns 24–27, substituted into `PromptText` with labels.
- The `15b` prompt asks the model to say which issues named last time were addressed.
- The Oct 9 draft's `PrevFeedback` is **dropped for now**. Feedback text exists only in the student doc, and copying it into FlowInput goes against `37`'s FERPA pointer design (`37:410-418`). It becomes possible from P5-01's `StudentFeedback` tab, as a later amendment.

**Secondary effects.**
- **Anchoring.** Telling the model the last result was NEEDS_REVISION may bias it either way. Measure the change in pass rate with the flag on for one course first (8177).
- **Flow 2 prompt changes.** It is hand-written, so the prompt tests must be updated.
- **Liveness.** `checkFlow2Binding()` and liveness must still pass after the change. The operator runs them.

**Acceptance.**
- A first check carries no history.
- Second-check values come from the Ledger.
- Flag off leaves rows byte-identical.

### Deferred from the Oct 9 draft (not scheduled)

- **Student calibration prompt (Oct 9 P4-04).** It adds a step before every check, and the research link is weak.
- **"Needs me today" panel (Oct 9 P4-05).** It depends on P1-04, P3-01 and P4-02 existing first.
- **Generating `IMPACT_DASHBOARD.html` (Oct 9 P4-06 item 2).** The page stores deployment records in each viewer's browser. Low value.
- **GCP project request draft (Oct 9 P4-06 item 3).** A separate operator decision.
- **Read receipt (Oct 9 P4-08 items 2–4).** The first five words of a response are often generic ("In this assignment I will"), and legitimate edits between submitting and harvest would fail it. Prototype it against real responses before scheduling.

## Phase 5: student experience and a smaller attack surface

The student doc currently does four jobs: the student's writing, system control data, a host for a script students cannot run, and the feedback inbox. Phase 5 moves the last three off the doc.

### P5-01 Feedback on the dashboard

**Change.**
- Behind `PIVOT_DASHBOARD_FEEDBACK`, the `37` harvest also writes the latest feedback and its one next action to a `StudentFeedback` tab keyed by file ID.
- The card shows:
  - the result in student words, mirroring the teacher's four states;
  - the next action;
  - a "Show feedback" toggle with history.
- Today the card shows a status pill and the date, not the result.
- The doc keeps receiving feedback during the transition (Q8).

**Secondary effects.**
- **AI text quoting student prose.** Flow 2's output can quote the student's words, so this tab holds AI text that may contain student prose. FlowInput's `GeminiFullOutput` is a precedent, but FlowInput has no retention pass. Give `StudentFeedback` an explicit retention rule in the FERPA map.
- **Enables** P4-05's `PrevFeedback` amendment and P5-05.
- **Redeploys.** Both the harvest (central-ledger) and the card (student-dashboard).

**Acceptance.**
- The harvest writes one row per check.
- The card renders all four states.
- Flag off: no tab writes.

### P5-02 "Here's what we'll check" preview

**Change.**
- Behind `PIVOT_SUBMIT_PREVIEW`, `submitMyWork()` first returns a preview:
  - the word count it read;
  - the first eight words;
  - a warning when 10+ words sit below the footer or below a feedback block.
- When the response marker is missing on a legacy doc, offer "Check everything above the footer". This restores the marker, as the admin, above the student's text, then queues.

**Secondary effects.**
- **An extra step.** Every submission gains a round trip and a click.
- **A visible admin edit.** Restoring the marker shows in the doc's version history. Studio's Extract step needs the marker back, which is why it is restored rather than skipped.
- **Turns a dead end into a fix.** It replaces the `NO_RESPONSE_SECTION` dead end ("Ask your teacher"), which reduces teacher interruptions.
- **New-layout docs** (P5-05) have no markers, so the preview simplifies there.

**Acceptance.**
- Preview contents.
- The below-footer warning.
- The marker-restore path on a legacy fixture.

### P5-03 Feedback-ready notice

**Change.**
- The card shows the student's queue position while waiting.
- Behind `PIVOT_READY_NOTICE`, with teacher opt-in per course, an in-domain email says only "Your feedback is ready" plus the dashboard link.

**Secondary effects.**
- **Mail quota and volume.** Up to one email per check. MailApp quota is ample at this roster size, but this is noise if the teacher opts in for both courses.
- **Queue position** needs a ReviewQueue count read on each dashboard load.

**Acceptance.**
- The email body contains no feedback text.
- Opt-in per course.

### P5-04 One warm-up journal per unit

**Change.**
- Behind `PIVOT_WARMUP_JOURNAL`, `41` adds each day's warm-up as a dated section at the top of one journal doc per student per unit. Today `41:969` creates a new "Warm-Up <date> — <first name>" doc each day.
- Flow 4's evaluator reads only the dated section.

**Secondary effects.**
- **`_lockDocAfterSubmission_()` locks the whole doc** after a warm-up is submitted (`25`). With one journal per unit, that lock would block the next day's section. Locking has to become per-section (not possible in Docs) or be dropped for journals. This is the deciding design question, and the reason this requirement ships last.
- **Prompt extraction.** `evaluateWarmUpDoc_()`'s prompt extraction (`OriginalPromptText`) must read the dated section.
- **Sharing.** Fewer sharing operations and fewer docs (about 40 per student per semester today).

**Acceptance.**
- Section append.
- Section-scoped extraction.
- A decided and tested lock behaviour.

### P5-05 The doc is the boundary (operator decision Q9)

**Change.**
- New workspace docs come from a template with no bound script and no stamped zones, so the body holds only student work.
- The prompt lives on the dashboard card and in Canvas.
- Feedback goes to the dashboard (P5-01) and optionally as a Drive comment.
- Flow 2 reads the whole body. The operator updates the Studio read step, and `42_FlowBuildSpec.js` and `15b` drop the marker instructions.
- The legacy parser stays, chosen per doc by whether the response marker is present.

**Secondary effects.**
- **Requires P0-04.** `04` was the last live parser of the body `[CONFIG_ID:]`.
- **Requires P5-01.** Feedback must have somewhere to go.
- **Teacher loses the doc menu.** No bound script means no menu for the teacher either. This also ends the pile of per-student script projects (handoff "Later").
- **Two layouts at once.** `13`'s extractor, `03`'s post-COMPLETE body check, and the harvest all branch per doc.
- **Studio Flow 2 build status is unconfirmed in the repo.** `15c:6-11` says it was never built, while the 10-08 handoff says it was prepared. The operator confirms before scheduling.
- **Template provisioning.** The template has no stamped zones, so `stampDocument_()` changes for new docs only.

**Acceptance.**
- Whole-body extraction on new-layout fixtures.
- Legacy parsing unchanged.
- A typed fake marker in a new-layout doc is treated as student text.
- The harvest never writes to a new-layout body.

### P5-06 Workspace ID outside the body

**Change.**
- Attach the ID (from `generateConfigId_()`, `VDOE-XXXXXX-2026`) in three places:
  - a Docs page footer;
  - public Drive file `properties` (`casConfigId`, `casSchoolYear`), written by central-ledger, which already has the Drive v3 advanced service and the `drive` scope, so no new consent screen;
  - a file-name suffix.
- Add the manual function `reconcileWorkspaceIds` (dry run by default; reports only).
- **Trust rule.** A doc-borne ID is used only to reconcile, never to authorize or as a scoring input.

**Secondary effects.**
- **Students can edit the properties.** Public `properties` are editable by any editor, so the trust rule is load-bearing. `appProperties` cannot be used, because each Apps Script project has its own Cloud project and student-dashboard could not read them.
- **Renaming is visible.** Students, Canvas submission lists and download names all see it.
- **Footer text.** Studio's whole-body read must exclude footer text. The operator confirms with a canary.
- **Copies.** Whether properties survive a student's "Make a copy" is unconfirmed. The footer and name carry the ID either way.

**Acceptance.**
- Footer, property and name stamping.
- Extraction excludes the footer.
- Reconciliation reports each mismatch type.
- No code path reads the doc-borne ID to authorize an action.

### P5-07 Prompt-injection fixtures

**Change.** Add adversarial synthetic responses to P4-01's real-model drift set: text instructing the evaluator to approve, a fake `[SYSTEM: APPROVED]` stamp, and delimiter strings. Alert if any is approved.

**Secondary effects.**
- **Depends on P4-01.** It needs real model runs, and simulated canaries cannot test this.
- **Fixtures must reach the model.** P0-03's submit guard rejects these strings at the dashboard, so the fixtures enter through FlowInput directly. The point is to test the model on its own.

**Acceptance.** Fixtures run weekly. An approval of any adversarial fixture emails the teacher and operator.

## Data and schema changes

No Ledger columns are added. Each new tab gets a creator that is safe to re-run (same pattern as `createSCRTabs_()`). Each new column is appended and read tolerantly.

| Where | Change | Requirement |
|---|---|---|
| WarmUpQueue column 19 | Archetype now written (column already exists) | P0-02 |
| `cas-ccps/data/deployment-urls.json` | New; Student Dashboard URL | P0-06 |
| `PivotMetrics` tab | New; aggregates only | P1-02 |
| SCRDecisionLog | Append `review_mode`, `teacher_rating_before_reveal` (only `07` writes them; legacy and `30`/`30b` rows read as STANDARD) | P1-03 |
| `UnaidedCheckpoints`, `CheckpointScores` tabs | New | P1-04 |
| `Accommodations` tab | New; adjustments only | P1-05 |
| WarmUpQueue index 22+ | `scaffold_level`, `warmup_kind`, `retrieval_competency_id`, appended after `archive_status` (21) | P2-02, P2-03 |
| Profile snapshot | `student_competency_status` | P2-01 |
| StudentProfiles `shadow_matrix` JSON | `*_confidence` → `*_coverage`, per-unit `cross_coverage`, `archetype_samples`, `score_basis` | P2-04 |
| `SupportWatch` tab | New | P3-01 |
| `CompetencyPrerequisites.json`, `curriculum/answer-keys/` | New repo data | P3-01, P3-02 |
| `DriftWatch`, `Health` tabs | New; synthetic data and status only | P4-01, P4-04 |
| FlowInput `PromptText` | Gains history (P4-05) and the teacher-key block (P3-02); no new columns | P3-02, P4-05 |
| `StudentFeedback` tab | New; AI feedback per file ID | P5-01 |
| `_CONFIG` tab | All `PIVOT_*` keys, via `SHARED_CONFIG_KEYS` | All |

**FERPA mapping.** Add every new tab that holds student emails to `cas-ccps/docs/FERPA_DATA_MAP.md`, with a named retention rule: `CheckpointScores`, `Accommodations`, `SupportWatch`, `StudentFeedback`.

## Testing, rollout, and definition of done

**Testing.**
- Tests run in the Node `vm` harness (`tests/harness/gas-sandbox.js`).
- Each flagged requirement adds flag-off (byte-identical) and flag-on tests. Flags are toggled through the `_CONFIG` read path, not by setting one project's Script Properties.
- Prompt changes are tested through the generator.
- Studio behaviour is verified only by the operator, live: `checkFlow2Liveness()`, `checkWarmUpFlowLiveness()`, the canaries, and, from P4-01, real-model fixtures.

**Rollout per requirement.**
1. Merge with the flag off. The operator pushes, updates deployments where needed, and stamps deploy markers.
2. The operator sets the flag to `8177` (the smaller roster) unless the teacher prefers otherwise, and runs the matching canary.
3. After one week, review `refreshPivotMetrics` output against the triggers.
4. Widen to `all`, or roll back by setting `off`. Rollback never needs a code change.

**Phase gates.**
- Phase 0 is done when its PRs are merged and pushed, and one real warm-up has run with a filled prompt.
- Phase 1 starts after the first real Flow 2 week.
- Phase 2 starts with one unit of PivotMetrics data and recorded archetypes.
- Phase 3 starts when one unit of prerequisites is approved.

**Definition of done (each PR)**

- [ ] Requirement ID in the branch name, PR title, and HISTORY.md entry
- [ ] `npm test`, `gas-lint`, `doc-currency`, and `coverage-gaps` pass with zero errors
- [ ] New tests named in `README.md`; new files registered in `tools/gas-lint/project-map.json` for every project that needs them
- [ ] Generated files regenerated, not hand-edited; `--check` passes
- [ ] Deploy marker stamped in its own commit for every touched project
- [ ] Flag defaults to off, is read through `_CONFIG`, and flag-off behaviour is proven identical by test
- [ ] Any new tab with student data added to `FERPA_DATA_MAP.md` with a retention rule
- [ ] Every hard-coded width constant updated when WarmUpQueue or SCRDecisionLog grows
- [ ] `cas-ccps/README.md` and the teacher guides updated for anything a teacher or student will see
- [ ] PR description lists what the operator must run live, in order, including which web apps need a version update

## Pre-registration

The success and failure rules are fixed before real data arrives. Claude Code commits them as `meta/PREREGISTRATION_CAS_PIVOT.md`, dated, before P1-04 goes live. Later changes are dated amendments that never delete the original text. All thresholds are proposals for the teacher to confirm (Q10).

**Question.** Do students who use CAS feedback perform as well on their own as they do with feedback, and does the system's advice match the teacher's judgment?

**Primary outcome.** Unaided checkpoint Met rate per competency (P1-04).

**Comparisons.**
- Within each competency, first-pass Met rate on feedback-checked work versus the unaided Met rate.
- Across units, the trend in that gap.
- The 8177-first rollout is descriptive only; it is not a control group.
- The checkpoint is a different task from the assisted work, so the gap measures task difficulty plus reliance, not reliance alone.

| Rule | Proposed threshold | Action |
|---|---|---|
| Success | Unaided Met rate within 15 points of assisted by the end of the second unit with features on, and blind agreement ≥ 70% | Keep features on; write it up as a local result, not proof |
| Crutch signal | Assisted rate rising while unaided falls across two units | Pause AI-suggested scores; review Flow 2 feedback for answer-giving |
| Advice failure | Blind agreement below 60% over 20+ rows | Turn off SCR suggestions until Flow 2 is revised |
| Rubber-stamp signal | Standard override rate under 5% while blind agreement is under 80% | Raise the blind sample rate; discuss with the teacher |
| Equity signal | Non-use or uptake differs by more than 20 points for students with accommodations | Review P1-05 settings before any other feature expands |

**Will not be claimed.**
- That CAS causes learning gains.
- That results generalize beyond these two courses.
- Anything from fewer than 20 students per comparison. With 21 students in 8177 and partial participation, most 8177 per-competency comparisons will fall under this floor. Pool by unit, or report 8177 descriptively only.

## Open questions

Claude Code must not resolve these on its own. Each blocks the requirement shown until the teacher or operator answers.

- [ ] Q1 (P1-06): Approve the weights, and pick the behaviour below the gate: (a) today's tiers or (b) score 0 and mark incomplete. This changes grading policy.
- [ ] Q2 (P1-04): Enter checkpoint scores in the Teacher Dashboard, or import them from a Canvas gradebook export?
- [ ] Q3 (P1-03): Is 20% the right blind sample rate?
- [ ] Q4 (P2-03): One retrieval warm-up in three, or another cadence?
- [x] Q5 (P0-04): Confirm retiring the turn-in handler. The Oct 9 draft offered hardening instead, but nothing student-facing uses the form. **Answered 2026-10-10: retire** (done, P0-04).
- [ ] Q6 (P3-01, P3-02): Who authors prerequisites and answer keys, and on what schedule?
- [ ] Q7 (all): This PRD runs alongside `PLAN_2026-10.md`, with Phase 0 ahead of the warm-up week. Confirm.
- [ ] Q8 (P5-01): Once feedback is on the dashboard, should legacy docs keep full feedback blocks or switch to a one-line pointer?
- [ ] Q9 (P5-05): Approve the student-work-only layout, and choose where the prompt shows while writing.
- [ ] Q10 (Pre-registration): Confirm or change the thresholds before P1-04 goes live.
- [ ] Q11 (P1-04): Should unaided checkpoint scores count as SCR evidence?
- [ ] Q12 (P2-01): Fix `competency_gaps`' timing? This would activate the decision table's gaps → BRIDGE branch and change the archetype mix.
- [x] Q13 (P0-01): Did the operator bind the `PromptText` chip in the warm-up Flows, or columns one by one? **Answered 2026-10-10: the `PromptText` chip**, so P0-01 changes what Gemini receives live.
- [x] Q14 (P5-05): Is Studio Flow 2 built and running, or still to be built? **Answered 2026-10-10: built.** `15c`'s header was corrected.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| P0-01 changes every warm-up prompt days before launch | Warm-up output differs from anything tested | Canary plus one real warm-up before triggers go on; operator pastes the output |
| P0-02 wakes dormant archetype paths | Sudden locks and teacher emails | The lock and email stay behind `PIVOT_ARCHETYPE_LOCK` until P2-04 |
| Nightly `buildWarmUpQueues()` runtime | Timeout (6-minute limit) as reads are added | Preload StudentProfiles (P2-01); cache per execution; tests count reads |
| Widening WarmUpQueue | A missed width constant corrupts rows | Constraints list every site; watchdog round-trip test |
| SCRDecisionLog is legally retained | A schema slip corrupts the audit trail | Append-only, one writer for the new columns, tolerant readers, legacy-row tests |
| Unpinned Gemini | Scores shift with no repo change | P4-01 real-model drift watch; P1-06 amplifies this, so P4-01 should not lag far behind it |
| Small rosters (71 and 21) | Noisy metrics; small cells could identify students | Suppress cells under 5; judge trends over a full unit |
| Teacher workload: blind review, checkpoint scoring, prerequisites, keys | The pivot adds the burden it is meant to reduce | Flags per course; count teacher decisions per week; Claude Code drafts, the teacher approves |
| Per-project Script Properties | A flag set in one project is invisible to another | All `PIVOT_*` keys go through `SHARED_CONFIG_KEYS` |

## Appendix A: research basis

These attributions are carried over from the Oct 9 draft, whose author checked them against the published sources on Oct 9, 2026. This revision did not re-check them. Use them in code comments and docs, and claim no more than the "Supports" column says.

| Source | Finding used here | Supports | Requirements |
|---|---|---|---|
| [Bastani et al., PNAS 122(26), 2025](https://www.pnas.org/doi/10.1073/pnas.2422633122) | About 1,000 Turkish high school math students. Unrestricted GPT-4 raised practice scores 48% and cut unaided exam scores 17%. A tutor with teacher-written hints and solutions raised practice 127% and removed the exam harm, with no exam gain. | Guarded AI avoids harm; it does not show learning gains | P1-04, P3-02 |
| [Kirschner, Sweller & Clark, Educational Psychologist 41(2), 2006](https://www.tandfonline.com/doi/abs/10.1207/s15326985ep4102_1) | Minimal guidance is less effective for novices; the advantage fades with prior knowledge. | Worked examples for novices | P2-02 |
| [Kalyuga, Ayres, Chandler & Sweller, Educational Psychologist 38(1), 2003](https://www.tandfonline.com/doi/abs/10.1207/S15326985EP3801_4) | Expertise reversal: support that helps novices can hinder more knowledgeable learners. | Per-student fading | P2-01, P2-02 |
| [Bjork, in Metcalfe & Shimamura (Eds.), Metacognition, MIT Press, 1994](https://gwern.net/doc/psychology/spaced-repetition/1994-bjork.pdf) | Desirable difficulties (spacing, retrieval, variation) slow training performance but improve retention; training performance misleads. Robert Bjork alone. | Spaced retrieval; judging archetypes by later outcomes | P2-03, P2-04, P3-01 |
| [Perelman, Assessing Writing 21, 2014](https://lesperelman.com/wp-content/uploads/2015/09/Perelman-State-of-the-Art-is-Counting-Words.pdf) | In pre-LLM automated essay scoring, word count explained much of the score variance. | Not scoring length | P1-06 |
| [Steiss et al., Learning and Instruction 91, 2024](https://asu.elsevierpure.com/en/publications/comparing-the-quality-of-human-and-chatgpt-feedback-of-students-w/) | Trained humans gave better feedback than ChatGPT on most criteria; AI feedback may help on early drafts. | Formative AI feedback with teacher oversight | P1-03 |
| [Selwyn, Hillman, Bergviken Rensfeldt & Perrotta, Postdigital Science and Education 5, 2023 (online 2021)](https://link.springer.com/article/10.1007/s42438-021-00263-3) | A commentary on concerns about automated decision-making in schools. Do not quote an "approval clerk" phrase. | Measuring teacher review | P1-03 |
| [Acemoglu & Restrepo, Econometrica 90(5), 2022](https://onlinelibrary.wiley.com/doi/full/10.3982/ECTA19815) | 50–70% of U.S. wage-structure change, 1980–2016, traced to automation of routine tasks. | Curriculum rationale only | None |

## Appendix B: changes from the Oct 9 draft

| Oct 9 | Now | Why |
|---|---|---|
| (none) | P0-01 to P0-03, P0-05 | Live defects found while checking the draft: unfilled warm-up placeholders, unrecorded archetypes, prompt-delimiter breakout, an `aggregateEvidence_()` throw |
| P3-03 | P0-04 | Retirement is low-risk and unblocks P5-05. **Correction:** `04` cannot move to the excluded list, because it hosts helpers called from `07`, `10`, `15b`, `15c`, `25`, `35` and `37`. `18` has no Form 2 branch; it calls both handlers on every submission |
| P5-05 | P0-06 | Must land before the cartridge import |
| P5-01 | P1-01 | Cheap and safe |
| P1-01 | P1-02 | Renumbered |
| P1-02 | P1-04 | Adds the Teacher Dashboard fifth state and the SCR-evidence question (Q11) |
| P4-01 | P1-05 | Must precede the word gate |
| P1-04 | P1-06 | The total is summed in `41`, not `25`. Minimal-response handling exists only for 0 words. `uses_feedback` is deferred because Flow 4 has no access to prior feedback. Reweighted within existing components |
| P1-03 | P1-03 | Three writers append exactly 10 columns, and there are three decision types. The hash rotates per suggestion. The existing test's width assertion changes |
| P2-02 | P2-02 | BRIDGE is an archetype in both Flow 3 modes, not "Mode A". Four archetypes, including CONCRETE_SCENARIO |
| P2-03 | P2-03 | Spacing counted from each student's class meetings (ODD/EVEN). The "units 1 and then 3 or more back" rule clarified |
| P2-04 | P2-04 | The engine is dormant until P0-02. `cross_confidence` is one global value. Alphabetical unit sort. INCOMPLETE and retrieval rows are excluded from scoring |
| P3-01 | P3-01 | Renamed "support watch": "Tier 2" already means Tier 2 Honors |
| P3-02 | P3-02 | There is no guarded block for teacher content; this requirement creates one |
| P4-02 | P4-01 | Canaries simulate Gemini, so drift needs real Studio runs |
| P4-03 | P4-02 | "What to do next" is `03` code, not `15b` |
| P4-07 | P4-03 | The parent-report item is already true and becomes a test |
| P4-06 item 1 | P4-04 | Needs a `Health` tab, because student-dashboard cannot call central-ledger |
| P4-08 item 1 | P4-05 | `PrevFeedback` dropped: feedback lives only in the doc, under the FERPA pointer design |
| P4-04, P4-05, P4-06 items 2–3, P4-08 items 2–4 | Deferred | See Phase 4 |
| P5-02 to P5-04, P5-06 to P5-09 | P5-01 to P5-07 | Renumbered. P5-04 (journal) gains the whole-doc lock problem. P5-05 depends on P0-04 and P5-01 |
| Flags in each project's Script Properties | Flags in `_CONFIG` via `SHARED_CONFIG_KEYS` | Script Properties are per project |
| Doc-currency banner "do not exist yet" | Naming convention (parentheses only on real functions) | The checker matches "does not exist yet", so the old banner would have failed CI. A whole-file banner would also stop the checker verifying the real names |
| 1,560 tests | 1,567 | Count at `cdcc6f3` |
