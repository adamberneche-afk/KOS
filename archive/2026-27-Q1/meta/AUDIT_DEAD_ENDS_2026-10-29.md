# Audit: dead ends and half-built work (2026-10-29)

**Progress (2026-10-31):** #1 settled by #349 (the hub pulls; `call-hub.yml`
is retired, deleted after `run.js --hub`; **deleted 2026-11-01**, once the
hub's first poll read KOS as `settled`). #2's Chat alerts no longer name
files (#350); its triggers wait on D14. KOS Audit Docket IV's fixes
(#342–#351) closed several neighbours of this audit's rows; the rest stand.

**Progress (2026-11-01):** clean-up PR 1 closes #4 (Student Context shows
the process reflections) and #9 (`CENTRAL_LEDGER_SS_URL` written at setup).
D14 and D15 were decided the other way from the leanings: **build** the
Registrar's two Studio flows (#2) and the SCR retry on the student's page
(#3), each in its own PR.

**Progress (2026-11-01, D15):** #3 built. The retry could never fire: its
LessonPrimarySecondary tab and evidence_role column were never made, so the
signal's count was always 0. Primary and secondary now come from each
assignment's milestones; the teacher re-rates on the student's page (SCR
Review lists the ready ones) and the student's Competencies tab says what
unlocks one.

**Progress (2026-11-01, D14):** #2's Apps Script half built
(`24_RegistrarFlows.gs`): input tabs, a return tab and harvest, prompts in
FlowPrompts, FlowBuildSpec rows, binding/liveness checks, a fixture and a
canary. Open until the operator builds the two flows in Studio and
`checkRegistrarFlowLiveness()` shows an answer.

**Progress (2026-11-01, the next-push fixes):** #8 closed
(`showSetupStatus()` names the rollout catch-up, and
`cas-ccps/DEPLOYMENT_HANDOFF.md` lists it) and #10 closed
(`logQueueMetrics()` counts every status; DUPLICATE rows are archived).

**Progress (2026-11-01):** #7 closed: `reportEvaluationHealth()`
(`69_EvaluationHealth.js`) reads `EvaluationLog` into the `Measures` tab and
the overnight email.

**Progress (2026-11-01, the stale comments):** the comments the
"Dead weight" section lists are fixed, with no change to code:
- kos-personal's pointers to the deleted `KOS_PHASE0_PATCHES.gs` (3, 4, 5,
  9) and to `archived/10_Turnstile_ORIGINAL.gs` (10);
- 30's "not yet built" reopen note (30b is that path);
- 51's header on Lesson Frames (builder rows make none);
- the leaderhub-build note on opening the page from a checkout;
- the router README's V5.8 "Canonical".

The four editor entry points with no docs are now documented:
- `runFlowPreflightCheckNow` and `runFlow2CanaryNow` (cas-ccps README, 35);
- `removeFamilySentinelTrigger` (the Sentinel's setup guide);
- `getKOSCalibration` (kos-personal README, editor-only functions).

They are thin wrappers: a dialog around a tested function, a trigger
removal, and a property read. They have no tests of their own;
`runFlowPreflightCheckNow` is exercised by the preflight test.

**Progress (2026-11-01, the docs PR):** "The docs that say the wrong
thing" are fixed:
- the student work plan's header, revisionProbe, unlock and Appendix B
  lines;
- the backlog (reviewed, with "Dropped" filled in);
- `PLAN_2026-10.md`'s D2;
- status lines on the gap audit and the PSD;
- the codebase review's studio-steps line;
- the UX audit's item 6;
- the loop-warning count (8);
- the old handoff pointers.

**Progress (2026-11-01):** #5 and #6 closed: a part held a school day or
more by a failed check is flagged on the Teacher Dashboard and counted in
the overnight email (68, 07, 34c); the Canvas cartridges list each lesson's
parts (one assignment and grade per lesson, as planned).

**Status:** the first repo-wide audit of its kind, done 2026-10-29 at the
operator's request ("make sure we aren't leaving too many dead ends and
half built functionalities"). Its actions are scheduled in
[`PLAN_2026-11.md`](./PLAN_2026-11.md) (the clean-up rows and D13 to
D16). Point-in-time: tick items off here as they close, and repeat the
audit at each sprint boundary. No student names, emails, file IDs or
ConfigIDs appear here, by design.

## How it was done

- **A mechanical scan** of every top-level function in cas-ccps,
  kos-personal and leader-hub for one that no code, HTML or manifest
  calls. **Result: no uncalled internal helper anywhere.** The 34
  uncalled functions are all editor-run entry points (previews, repairs,
  trigger removers), by design. Four of them have neither docs nor
  tests: cas-ccps `runFlow2CanaryNow`, `runFlowPreflightCheckNow`,
  `removeFamilySentinelTrigger`; kos-personal `getKOSCalibration`.
- **Three read-only reviews**, one per area: cas-ccps features (switches,
  tabs, producers and consumers, markers, stopped features); the plans
  and audits in `meta/` against the code; kos-personal, leader-hub,
  `tools/` and CI. The load-bearing findings below were re-checked
  against the code by hand; one claim did not hold and is corrected
  (Student Context does read text-box warm-ups, #288).

What the existing checks already cover, so this audit didn't repeat it:
`doc-currency` (docs naming functions that don't exist), `gas-lint`
(project wiring, unused OAuth scopes), the 10-22 UX audit (experience),
the August codebase review (North Star).

## Running and failing, or running for nothing (fix first)

| # | Where | What | Action |
|---|---|---|---|
| 1 | `.github/workflows/call-hub.yml` | "Ping CTO Hub" runs every 30 minutes and **every recent run fails** (the Hub's secrets are missing or wrong); the Hub's `ai_decision_log.json` stops on 2026-09-03; `watchdog.yml` has failed its last 5 weekly runs, likely from the same cause | **D13:** fix the two secrets, or turn the schedule off (keep the manual run). Leaning: off until the Hub is in use again |
| 2 | kos-personal `11_Registrar_CogRelay.gs:88`; triggers in `1_Config_And_Deploy.gs:607-609` | Three Registrar triggers (daily, every 15 min, every 10 min) run, but **the two Studio flows they feed were never built**; a file dropped in its intake folder fails three times and raises a chat alert, and the triggers compete for the script lock | **D14:** build the flows, or remove the triggers until they exist. Leaning: remove them |
| 3 | cas-ccps `34b_CasAttentionSignal.js:366-370`; `30b_SCRRetryRemediation.js` | The attention signal counts students eligible for an SCR retry, but **no screen lets the teacher act on it**: 30b's retry functions are complete and tested and nothing calls them | **D15:** build the retry on the student's page, or drop the count. Leaning: drop the count now; the retry joins the backlog |
| 4 | cas-ccps 29, 23, 33 | **Student Context doesn't show the process reflections**, though the student work plan says it does, and November's plan has the operator reading them there from Nov 2 | Build it (small), in the week of Nov 2, before the reflections are read |

## Half-built: finish (scheduled in November)

| # | What is missing | Where it was promised |
|---|---|---|
| 5 | Nothing flags **a part held more than a school day** by a failed run | `STUDENT_WORK_PLAN_2026-10.md`, "Where the costs land" |
| 6 | **The Canvas cartridges don't list parts** | Same plan, Phase 3 |
| 7 | Nothing reads **`EvaluationLog`** | November's `reportEvaluationHealth` |
| 8 | `showSetupStatus()` doesn't know `runLessonRolloutCatchUp`; `showSetupStatus` itself isn't in `cas-ccps/DEPLOYMENT_HANDOFF.md` | 10-29 handoff |
| 9 | `CENTRAL_LEDGER_SS_URL` is read by the Unified Manual's "Open Admin Health Check" item but never written, so the link is empty | `16_UnifiedManualSetup.js:1464` (one line in `persistAdminProperties_`) |
| 10 | kos-personal: `logQueueMetrics()` misses `DUPLICATE`/`PARTITIONED`/`CONSOLIDATED`; the archive keeps `DUPLICATE` rows | Backlog |
| 11 | The UX audit's plain-words pass for the cartridges, the doc menu, the feedback comment, the teacher emails and the guides; leader-hub jargon in 5 `src/` files | `UX_AUDIT_2026-10-22.md:91-95` |
| 12 | kos-personal hardening: the contended-lock test (the sandbox's `tryLock` always succeeds) | `KOS_INGESTION_HARDENING_PLAN.md` §3 |

## Built and parked: decide, then mark it (D16)

**Decided 2026-11-01 (D16, the operator took every leaning) and marked in
clean-up PR 2:** #13 `EVALUATION_MODE` no longer shown as a switch, 15c
marked a parked fallback (the opt-in guard stays; its tests use it). #14
inference service DORMANT, its Dependabot bumps off (closing #291–#294 is a
separate step). #15 drive steward PARKED. #16 leader-hub's AI flows marked
**unverified since 2026-09-05**, not parked: `leader-hub/HISTORY.md` records
all six verified live that day, so this row overstated it; run
`checkAiFlowFixtures()` and park them if they fail. #17 the CAS link parked
until `checkCasServerSignIn()` passes. #18 frames kept for hand-logged
lessons, their placeholder warm-up section removed. #19 the student doc menu
marked unreachable for students. #20 the WarmUpResponses form RETIRED (the
operator turns off "Accepting responses"); 29 still reads its old rows. #21
kos-personal's menu marked editor-only, its items listed in the README. #22
the four tabs kept as audit logs. #23 Flow 5: decided 2026-11-01, merged into Flow 3 (Flow 3 writes the lead-in; Flow 5 retired). #24
unchanged. #25 the PRD's status line (P1-02's checks block is
`reportEvaluationHealth`; the rest parked). #26 dropped. #27 fine as is.

Each of these is built, or half built, and nothing uses it today. Each
needs one line of decision, then a "parked" or "dropped" marker where it
lives, so it stops reading as live work.

| # | What | Leaning |
|---|---|---|
| 13 | `EVALUATION_MODE=DIRECT_GEMINI` (15c): setting it does nothing; `runFlow2DirectGemini_` has no caller | Drop the setting; keep 15c marked as a fallback that needs wiring |
| 14 | `kos-personal/inference-service/`: tested in CI and bumped by Dependabot, but `INFERENCE_MODE` is hard-coded to Studio and its Cloud Run deploy needs Google Cloud, which is off for the district | Mark it **dormant**; stop the Dependabot bumps (and close #291–#294) unless it will be deployed |
| 15 | `meta/drive-steward-deploy/`: never run against a real Drive; not linted | Mark parked |
| 16 | leader-hub's six AI-drafting Studio flows: nothing shows one ever completed (the app falls back to templates) | Run `checkAiFlowFixtures` once; park if they fail |
| 17 | leader-hub's link to CAS (D1): the client side is built; blocked on an OAuth client | Run `checkCasServerSignIn()`; park if it fails |
| 18 | The Lesson Frame doc (27) beside the new lesson doc (66): hand-logged lessons still get a frame, with a "suggested warm-up" placeholder | Retire frames, or keep them for hand-logged lessons only |
| 19 | The student doc menu (01): students can't run Apps Script in the district | Mark it unreachable for students |
| 20 | The WarmUpResponses tab and its Google Form: superseded by the text box (Student Context reads text-box warm-ups since #288) | Retire the form; 29 keeps reading the tab only for old rows |
| 21 | kos-personal's `onOpen()` menu (about 15 items): the project is standalone, so the menu never shows | Move what's needed to the web app's Diagnostics tab; mark the rest editor-only |
| 22 | kos-personal tabs written and never read: `MATRIX_LEDGER`, `ACTION_REGISTER`, `ONBOARDING_TRACKER`, `EXECUTION_LEDGER` | Keep as audit logs (say so in the code) or stop writing |
| 23 | Flow 5 (the bridge paragraph): keep, enrich, merge into Flow 3, or drop; overdue since 10-26 | Decide at the Nov 2 planning |
| 24 | The authenticity collector (D4) | Unchanged: build only if read |
| 25 | `PRD_CAS_RESEARCH_PIVOT.md` past Phase 0: no status line; Phase 1's gate passed weeks ago; no plan cites it | Add a status: Phase 0 done; P1-02 (metrics) is `reportEvaluationHealth`; the rest parked |
| 26 | `PROCESS_HARDENING` Phase 4 (the Curator/Auditor split) | Mark dropped or move to the backlog |
| 27 | The sandbox deploy job (CI): skipped on every push, its secrets unset (declared optional) | Fine as is, or set it up with packaging step 4 |

## Dead weight: remove (one clean-up PR, no behaviour change)

**Done 2026-11-01 (clean-up PR 2), except the stale comments, which were
done in a later PR the same day (see the progress lines above),** with two
departures: the shadow
matrix's two values are constants in 00 rather than config reads (23 uses
them per student, and `getConfig_()` reads every Script Property); and
`ParentReportLog`'s `recipient_address` column and the Sentinel's fallback
that reads it stay, because rows from before 2026-10-23 can hold a real
parent address (00's comment on the tab now says so). `Inference_Buffer` is
no longer created; an existing tab can be deleted by hand.

- cas-ccps config fields never read: `shadowMatrixConfidenceThreshold`,
  `shadowMatrixDecayFactor` (23 and 25 hard-code the same values; read
  them from config instead), `rubricResponseSsId`, `confirmResponseSsId`.
- Script Properties written and never read: `TEACHER_MATRIX_SS_URL`,
  `RUBRIC_RESPONSE_SS_URL`, `RUBRIC_FORM_ID`, `INTAKE_FORM_ID`,
  `RUBRIC_RESPONSE_SS_ID` (16).
- `ParentReportLog`'s `recipient_address` (always blank since D1) and the
  FamilyContacts fallback that reads it (60); the tab's comment in 00.
- `16_UnifiedManualSetup_M5_ADDENDUM_v2.js:80-121`, a commented-out block
  applied long ago.
- `runStudentAggregationNow_` (29): a "manual test helper" the editor
  can't run.
- kos-personal's `Inference_Buffer` tab (created, never used).
- `codeql.yml`'s unreachable manual build step; `gas-lint.yml:121`'s
  comment about a `workflow_dispatch` it doesn't have.
- `leader-hub/drive-tools/`: two April one-off scripts and a Python
  updater aimed at a file that is now generated. Archive the folder.
- Stale comments: kos-personal's pointers to the deleted
  `KOS_PHASE0_PATCHES.gs` (3, 4, 5, 9) and to
  `archived/10_Turnstile_ORIGINAL.gs`; cas-ccps 30's "reopen path not yet
  built" (30b built it), 51's header on lesson frames;
  `tools/leaderhub-build/build.js:100-103` on opening the app from a
  checkout; `rtp-core-router/README.md` still calls V5.8 "Canonical".
- Doc and test the four undocumented editor entry points above, or
  remove them.

## The docs that say the wrong thing (one docs PR)

- **`STUDENT_WORK_PLAN_2026-10.md`:** the header still says Phase 2 waits
  for Phase 1 and Phase 3 waits for Flow 2's numbers (both built since);
  "Student Context shows it" and "cartridges list them" aren't true yet
  (items 4 and 6); the design says the harvest shares the next part (a
  5-minute cycle job does); the revisionProbe "was never built" (it ran
  on 10-18); Appendix B is "draft 1" though approved; open decision 4 is
  moot.
- **The revisionProbe** is described three ways (`CAS_COGNITIVE_EXHAUST`
  :5 against :8, the student work plan, `BACKLOG.md:135`).
- **`BACKLOG.md`:** strike retention disposition and Flow 3 quality
  (done); remove the duplicate "Marker-level verify"; put Thread C's
  persistent docs in "Dropped".
- **`PLAN_2026-10.md`:** D2 still reads open (decided 10-27).
- **`PRODUCT_EXPERIENCE_GAP_AUDIT.md`** and
  **`PSD_Version_Controlled_CAS_Workspace.md`:** no date or status line;
  two of the gap audit's findings are out of date.
- **`CODEBASE_REVIEW.md`:** "what remains is deployment" for the studio
  steps that 37 and 41 replaced; `cas-ccps/studio-steps/` never archived.
- **`UX_AUDIT_2026-10-22.md`:** item 6 still lists Parent Reports
  remembering addresses (dropped).
- **Loop-warning count:** 8 (ingestion plan) against 11 (process
  hardening); gas-lint says 8.
- **Pointers to old handoffs:** `CAS_DESIGN_THREADS` (10-24),
  `CAS_COGNITIVE_EXHAUST` and `BACKLOG.md` (10-22).

## Operator items that fell off the queue

The 10-27 handoff carried seven items; the 10-29 handoff and November's
plan dropped five of them without saying so:

- **One parent report read in full before the first is sent** (D1's own
  precondition).
- The lesson editor's first real draft, end to end (with the Routine's
  connectors, still carried).
- Flows 4 and 5's Drive sources.
- Flow 2 checked against the task.
- Lesson ownership.

They return to November's queue. Also never recorded: whether the two odd
Ledger rows (`previewOddLedgerRows()`, CAS bug handoff §9) were resolved,
and whether `PARENT_REPORT_PREP` is on.
