# Audit: structural debt (2026-11-20)

**Status:** findings; section 1 (1.1-1.3) built 2026-11-20 (#515); section 2's 2.1, 2.2, 2.5, 2.7 and part of 2.6 built 2026-11-20 in the PR after #515 (cas-ccps/HISTORY.md says what stayed and why); 2.3 and 2.4 built 2026-11-20 (#517); 3.1 built 2026-11-21 for the Ledger (#518), WarmUpQueue (#519), TeacherMatrix, RubricQueue and ReviewQueue (#520), LessonContext (#521), PacingGuide (#522); 3.2 (one ensureTab_, #523); 3.3 (TABS, #524, keeping single-owner tab constants beside their code); 3.4 (casConfigId_, parseCasId_, #525); 3.5 (ymd_ and the date helpers, #526); 4.1 (the root README a map, its tool, test and CI-floor sections in tools/README.md, tests/README.md and meta/CI_FLOOR.md; CLAUDE.md's repo map, #527); 4.2 (cas-ccps/README a map of 319 lines, 13 feature files in cas-ccps/docs/features/; Known gaps kept, per HISTORY.md, #528); 4.3 (retired setup docs archived, index.html deleted; DEPLOYMENT_HANDOFF as status-only waits, its step numbers are in use, #529); 4.4 (three handoffs and three finished plans archived, TURN_IN_CODE_PLAN marked built, LESSON_PARTS moved to cas-ccps/curriculum/lessons/, #530); 3.6 answered (the operator reads the email through the RTP: one email, done in #514, its rows and FERPA fixes restored, #531); 4.8 (gas-lint's stale-file-ref summary warning, --stale-refs to list) and 4.10 (doc-currency reports a path found only in archive/; 9 docs repointed, #532); 4.9 (`npm run check`, the tools table with where each runs and its fix, the check/build naming rule) and 4.11 (the kos-personal guides' history banners to CHANGELOG, #533); 4.7 (`cas-ccps/docs/SCRIPT_INDEX.md`, generated from every script's `PURPOSE:` line; new generated files named `*Data.js`; no renumbering, #534); 3.8 (one deploy-version report in `shared/deploy-report/`, synced into all three systems, so kos-personal and LeaderHub check permissions too; marker generation left to the deploy path) #535); 3.7 (the registry already existed, gas-lint's `flowSurfaces`; it gains `flowCheckNames`, one pattern per role that Check I enforces, and `preflights`, each project's preflight; the two names that predate the rule are listed exceptions, not renamed, since the operator runs them from the editor) #536); 4.12 on hold, not archived (the operator, 2026-11-21: automated Drive maintenance will be needed; revisit when CAS and KOS are prepared for a second user's deployment, #537); 3.9 (`tools/lib/`: one zip reader and writer, the stripper out of gas-lint, `repo.js`, `prompt-constants.js`; clasp-sync's `run.js` keeps its own zip reader, since it runs outside the checkout, #538); 3.11 (`tests/harness/cut-declarations.js` on the LeaderHub lexer: tests cut by name, span or statement; `extract-lines.js` and its 15 ranges deleted, the three brace-counting helpers replaced; slices that pull text for wording checks stay, #539); 3.10 (CI's separate student-data scan folded into the release check, whose student-data bucket already ran its rules, with its two warnings kept for review; doc-currency's Check 6 removed, the gated release check's Drive rules over the same docs; `npm run check` 9 steps, #540); 3.12 (a `prompts/` folder in each system: kos-personal's six and LeaderHub's seven `.md` moved in, generators repointed; cas-ccps's holds the Family Mail prompt and a table of where each flow's prompt lives, since the flow prompts are sections of their design docs and Flow 2's is the deployed 15b, #541); 4.8's rest (the stale-ref check reads written archive paths, history lines and wrapped names; 38 references repointed to the archive, 11 fixed by hand, 0 left; 15b's header no longer says Flow 2 was never built; the 591 dated comments stay, #542); 4.5 (the dashboards' pages to `.html` templates, rendered byte for byte as before; the stripper's `return /re/` bug fixed; the shared include not built, since only ~31 lines match and the More menu has drifted, #543); 4.6 (~400 lines only one project uses moved to `00c_`, `00d_`, `00e_*Shared.js`, sorting right after 00; editor-run functions counted as every project's; the column registry kept in 00) in the PR after #543; 5 and 6 open.
Asked by the operator: "Our scripts are becoming disjointed and clumsy. What
can we fold in together? What is redundant without purpose? Is our codebase
navigable and intuitive?" Three read-only reviews (cas-ccps scripts; tools,
tests and CI; kos-personal, LeaderHub and the docs), each given the code and
not each other's conclusions. Their main claims were then checked against the
code: those marked **(checked)** were re-measured. Counts, file names and
line numbers only; no student data.

## The short answer

- **Folding:** the scripts rarely copy code (only 396 lines sit in repeated
  blocks), but they re-solve the same job under a new prefix in each file:
  - each tab's columns declared again in every file that reads it;
  - five near-identical "create the tab if missing" helpers;
  - eight date helpers;
  - fifteen places that build or parse a lesson's `CAS-…` ID.
- **Redundant:**
  - retired code still deployed (the Form 2 gate's dead helpers, 09, Flow 5's threads, an undeployed prompt copy);
  - three trigger installers that quietly undo the Ledger cycle;
  - two morning health emails;
  - a CI job and the test suite each running twice per PR commit.
- **Navigable:** not yet:
  - the two big READMEs are design logs (575 and 1,547 lines);
  - three docs give three different reading orders;
  - nine docs cover CAS setup;
  - 8 of 19 tool folders have no README;
  - the two dashboards are mostly HTML inside JavaScript strings.

## 1. Fix first: small, and something real is wrong

| # | What | Evidence | Proposal | Effort, risk |
|---|---|---|---|---|
| 1.1 | **Three installers undo the Ledger cycle** **(checked)** | `installFlowInputTriggers` (37:2039), `installWarmUpFlowTriggers` (41:1967), `installQueueWatchdogTrigger` (34:787) each create their own every-minute trigger. 64 leaves a job with its own trigger to it (64:229), so a re-run takes the job out of the cycle: no gates, no quiet hours, its own share of the 6 h/day trigger quota (#496) | Route all three through `lcInstallJob_` as the other installers do (64:961-971), or delete them | S, low |
| 1.2 | **CI does everything twice** **(checked)** | `gas-lint.yml` runs on `push: branches: ['**']` *and* `pull_request`, so every PR commit runs the 12-step job twice (`run-js-windows.yml` the same). Within it, `npm test` runs, then coverage-gaps runs `npm test` again under coverage: 4 suite runs per commit | `push` on `main` only (the sandbox-deploy jobs need it); one test run, with coverage, read by coverage-gaps | S, low |
| 1.3 | **gas-lint re-parses the same 129 files ~20-30k times** **(checked: 58 s)** | `findScopeGaps` (gas-lint check.js:1491) re-runs `findTopLevelDecls`/`declRefs` per sandbox load (289 loads); the same scan runs again in `gas-lint-test-scope.test.js` (46.8 s, the suite's critical path) and inside coverage-gaps | Cache both per file path; the test calls the cached check or goes (CI runs gas-lint itself) | S, low; gas-lint to a few seconds, `npm test` from ~70 s to ~25 s |

## 2. Delete: retired code still deployed

| # | What | Evidence | Proposal | Effort, risk |
|---|---|---|---|---|
| 2.1 | **04_Form2_TurnInGate** (Form 2, retired 10-10) | `findLedgerRow_`, `_ensureTurnInReviewColumns_`, `extractFileId_` have no callers in the Central Ledger; the header claims 37 and 07 call them, they don't. `scanCompliance_`, `extractSuggestedScore_`, `_lockDocAfterSubmission_` are live | Move the three live helpers into 37; delete 04. 07's own `_ensureTurnInReviewColumns_` (07:847) becomes 00's `_ensureEvaluationResultColumns_` | S, low |
| 2.2 | **09_StudentRevisionGuidance** (146 lines, the student template) | `processCompletedEvaluation` is never called; its "WHAT TO DO NEXT" text has drifted from 03's live text | Delete; it only leaves future copies of the template | S, low |
| 2.3 | **Flow 5** (merged into Flow 3, 11-01) still threaded through 9 files | `wfbApplyFlow5_` (41:1239), `WFB_FLOW5_HEADERS` (unread), `FLOW_5_PROMPT` still synced (40), preflight checks Flow5Input (35:130), `[3, 4, 5]` loops in 34c, 41, 69b | Remove all but 57's retention row (until that tab is empty) | S-M, low |
| 2.4 | **15_StudioFlowPrompts** (not deployed) | Its `FLOW_2_SYSTEM_PROMPT` (15:78) is a stale copy of 15b's; its Flow 1 prompt is the generator's source | Flow 1's prompt to a `.md` (as Flow 6's is); delete 15 | S, low |
| 2.5 | **The 16 addenda** (M5_ADDENDUM_v2, M6_ADDENDUM) | 415 lines, ~90 of them code (4 functions); the rest is patch narrative | Fold the functions into 16 | S, low |
| 2.6 | **Unread constants** | 43, 33 of them column constants (e.g. `TM_` 14 of 15 unread, `RQ05` never read, `SHEET_CHECK_KEYS`, `LS_HOLD`) | Delete with 3.1 | S, low |
| 2.7 | **Tests nothing runs** | `archive/2026-27-Q2/tests/cas-ccps/archived/` (10 files) is reached by no `npm test` glob; the code they test moved to `archive/` on 11-17 | `node tools/archive/file.js` them beside that code | S, none |

Not dead: 15c's `runFlow2DirectGemini_` is unreferenced but parked under D16.

## 3. Fold together

| # | What | Evidence | Proposal | Effort, risk |
|---|---|---|---|---|
| 3.1 | **One tab's columns, declared again and again** | **Ledger:** `LEDGER` (00) plus 4 subset copies (`L_*` 03, `LD_*` 23, `LD24_*` 24, `LD33_*` 33). **WarmUpQueue:** 5 maps, no canonical one (`WQ23_` 11 cols, `WQ24_` 22, `WQ25_` 21, `DASH_WQ_` 13, 34's) **(checked)**. **Others:** RubricQueue 3, TeacherMatrix 4, LessonContext 3. **Drifted headers:** LessonContext is 14 columns in 28, 18 in 22; PacingGuide is 16 in 28/23, 20 in 31 | A schema registry in 00 (the one file in every project): `{tab: {name, headers}}`, column indexes derived from headers, one ensureTab_ (proposed). Ledger and WarmUpQueue first | M per tab; medium risk (24 and 25 build and score warm-ups nightly) |
| 3.2 | **Seven "create the tab" helpers** **(checked)** | `_createTabIfMissing_` (22), `_createTabIfAbsent_` (23), `_createTabIfMissing28_`, `…S29_`, `…S30_`, `_fiEnsureTab_`, `_fmsEnsureTab_` | One ensureTab_ (with 3.1) | S with 3.1 |
| 3.3 | **Tab names in two places** | 48 `X_TAB` constants outside `cfg.tabs`; 70 `cfg.tabs.x \|\| "literal"` fallbacks; NoSchoolDays and StudentAssignments each declared twice in one project | Every tab name in `cfg.tabs` (00), no literal fallbacks | M, low |
| 3.4 | **The lesson ID, built and parsed 15 ways** | Built by hand (53, 55, 68 twice); parsed at 00, 13, 58, 69c, 71 (4 places), 74; 13's and 69c's regexes differ | a proposed casConfigId_ and parseCasId_ (→ course, lessonKey, part) in 00 | S-M, medium (13 and 71 are student-facing) |
| 3.5 | **Dates** | 119 `Utilities.formatDate` calls, 55 `"yyyy-MM-dd"` literals, 8+ YMD helpers; `formatDate_` identical in 07 and 13 | One proposed ymd_ and parseYmd_ in 00 | S-M, low |
| 3.6 | **Two morning health emails** | `autoHealthAlert` (10:455, 6 a.m.) and 34c's overnight email (5 a.m.), plus the watchdog every 10 min, all watching stuck rows | Fold `autoHealthAlert` into 34c: one morning email. **Operator:** which do you read? | M, low (admin only) |
| 3.7 | **Per-flow checks under 4 naming schemes** | 84 check/report/preview functions; each flow has its own liveness (4), binding (4) and canary (5) checks; preflight is `runFlowPreflightCheck` / `runKosPersonalPreflight` / `runLeaderHubPreflight` / `runFamilySentinelPreflight` | One registry of flow checks in 35; one naming scheme, enforced by gas-lint's flow map | M, low |
| 3.8 | **The deploy report: 3 copies, already drifted** **(checked)** | `reportDeployVersion` in cas-ccps 00, `leader-hub/DeployVersionReport.gs`, `kos-personal/17_…`; only cas-ccps checks permissions (#495), a gap any project can have. The installer is copied 9 times; 10 marker files (31-52 lines) differ only in name and SHA | One canonical report synced into each system (flow-harness-sync's recipe); markers generated at sync time | S-M, low (deploy-drift covers markers) |
| 3.9 | **Tool helpers** | Zip reading 3 times (each its own crc32); `git ls-files` wrappers 4, directory walkers 3; 29 of 50 tool files define `ROOT`; 8 tools read `gas-lint/project-map.json` directly and 3 `require` the whole gas-lint checker; `replaceConstant` copied between two prompt generators | `tools/lib/{zip, git-files, repo, project-map, prompt-constants}.js` | M, low |
| 3.10 | **The same text scanned three times in CI** | student-data-scan over the tree; release-check re-runs its `scanText` over every file; doc-currency re-applies release-check's Drive rules to every `.md` | CI runs release-check (it has the student-data bucket); student-data-scan stays a library plus its `--roster` command | S, medium (the "where, never what" output must carry over) |
| 3.11 | **Test source cut three ways** | `extract-lines.js`: 15 fixed line ranges in 5 files (it broke twice this week on unrelated edits); 16 files cut by `indexOf`; 3 private declaration helpers. `tools/leaderhub-build/js-lexer.js` already parses declarations | One new harness module (cut-declarations) on that lexer; delete extract-lines | M, low |
| 3.12 | **Prompts kept three ways** | kos-personal 6 `.md` at its root; leader-hub 6 `.md` + the Gem prompt at its root; cas-ccps a non-deployed `.js` (15) and one `.md` | A `prompts/` folder per system, `.md` the source, generators pointed there | S-M, low |

Keep separate, on purpose: the two Turnstiles (kos-personal 10, cas-ccps 06:
different schemas; flow-harness-sync's README says not to force them
together); doc-link-check and doc-placeholder-check (copied across the
operator's repos by `.github/floor.json`); doc-currency vs docs-check
(different questions).

## 4. Navigability

| # | What | Evidence | Proposal | Effort, risk |
|---|---|---|---|---|
| 4.1 | **No "start here"** **(checked)** | Root README 575 lines (10.5k words), 9% about the three systems, a test inventory in single lines of up to 9,415 characters. It, CLAUDE.md and meta/README give three different reading orders. CLAUDE.md (190 lines) is all RTP process: no repo map, no commands. `meta/AGENT_NOTES.md` (885 lines) is linked from neither. An agent's start-up read is ~14.9k words | Root README to ~150 lines: a paragraph per system, a "start here" for newcomer / operator / agent, one line per tool, "the newest `meta/HANDOFF_*`" not a date. Test inventories to a new tests README. A 10-line "Repo map and commands" in CLAUDE.md, linking AGENT_NOTES | M, low (link-check catches breaks) |
| 4.2 | **cas-ccps/README is a design log** **(checked)** | 1,547 lines, 22k words, 152 dates; "Lessons in parts" alone 500 lines. HISTORY.md exists for that | Split as leader-hub and kos-personal were on 11-17: a README map under 250 lines and a new cas-ccps/docs/features folder, one file per feature | M, low |
| 4.3 | **Nine docs for CAS setup** | DEPLOYMENT_HANDOFF (a status log), `docs/deployment/` (5), SETUP_GUIDE, SETUP_GUIDE_REFERENCE, CAS_M2_DeploymentGuide.html, clasp-sync's runbook; clasp explained in 10 sections of 8 docs. ADMIN_DEPLOYMENT_WALKTHROUGH.html is "retired" (10-22) yet linked from index.html and 07 **(checked)**; index.html has no inbound links; two `.docx` (Modules 4, 5) untouched since August | SETUP_GUIDE the one install guide, DEPLOYMENT_HANDOFF status only; archive the walkthrough, the M2 guide, PLATFORM_DOCUMENTATION (its one principle into SYSTEM_ARCHITECTURE) and the docx; link or delete index.html | M, low (fix 07's link) |
| 4.4 | **meta/ past its plan** **(checked: 4 handoffs live)** | HANDOFF 11-15/17/18 still live; COURSE_BUILDER_PLAN_2026-10 and STUDENT_WORK_PLAN_2026-10 decided; VERSION_CONTROL_CONCEPTS (one commit, August); TURN_IN_CODE_PLAN "design" though stages 1-5 are built; LESSON_PARTS_2026-10.md is generated data (1,261 lines), not a plan | Archive the three handoffs and three finished plans with `tools/archive/file.js`; mark TURN_IN_CODE_PLAN built; move LESSON_PARTS to `cas-ccps/curriculum/lessons/` | S-M, low (review rewritten references) |
| 4.5 | **The dashboards are HTML in strings** | 07: 7,023 lines, 4,458 (63%) one template literal; 79 server functions mixing the LeaderHub API, ratings, settings, the schedule and parent reports. 13: 45% literals. Their shared client code has drifted (the More menu's 7 functions, `_afterMinSpinnerDelay` identical in both) | `.html` files plus one shared include (clasp-sync supports html) | L, **high** (live with students; a new deployment each change). Last |
| 4.6 | **00 carries one project's code to all eight** | 3,220 lines; ~943 (29%) used by one project only (Central Ledger 466, Student Dashboard 258, Teacher Dashboard 206) | Move each project's share into its own file | M, low |
| 4.7 | **Numbering means two things** | 19 lettered files: 7 are generated data, 5 hand-written code (34b, 34c, 39b, 69b, 69c); three files share `16_`. Numbers leak into names (`_createTabIfMissing28_`, `WQ25_`) and 748 "(37)"-style comments | Don't renumber; add a file index to the cas-ccps README and a `*_Data.js` rule for generated files | S, none |
| 4.8 | **Comments carry history** | 16,692 comment lines (22%); 591 dated, 791 decision IDs; 7 references to files that no longer exist, 19 to the removed cas-ccps studio-steps folder (archived 11-17); contradictory headers (15b says Flow 2 was never built, 15c that it is) | Headers to purpose, triggers and data boundary; history to HISTORY.md. A gas-lint warning for a reference to a missing file | M, none |
| 4.9 | **Tools without a map** | 8 of 19 tool folders have no README; `package.json` has only `test`; entry names `check.js`/`build.js`/`sync.js`/`run.js` and builder prefixes build-/generate-/render-/sync-/import-/check- in one folder; three spellings of LeaderHub (`tools/leader-hub`, `tools/leaderhub-build`, `tests/leaderhub`) | a new tools README (tool, what it does, where it runs, its fix command); `npm run check` (every CI step) and `npm run test:fast`; rule: `check.js` never writes, `build.js` writes and takes `--check` | S-M, none |
| 4.10 | **Index tables point at archived files** | 296 backticked file names in live docs: 70 resolve only in `archive/`, 17 nowhere; doc-currency reports 0 (e.g. kos-personal's "Where to Start", 4 of drive-curation's 8 rows) | doc-currency warns on a path that exists only in `archive/` | S, none |
| 4.11 | **Banners bury two guides** | kos-personal's DEPLOYMENT_GUIDE starts its first section at line 183; STUDIO_INTEGRATION_SPEC at 186 | Banners to CHANGELOG; one current-status paragraph | S, none |
| 4.12 | **Drive housekeeping outside any system** | drive-curation/ (no change since August but link clean-ups); `meta/Drive_Steward_Methodology_and_Prompt.md` and `meta/drive-steward-deploy/` (in no plan); `leader-hub/drive-tools/` ("not yet executed", August) | Archive, or move to Drive as the workbooks were (#510). **On hold (the operator, 2026-11-21): kept; automated Drive maintenance will be needed, so this waits for the second-user deployment prep** | S, low |

## Suggested order

1. **This week, small and safe:** 1.1, 1.2, 1.3 (CI speed), 2.1-2.7 (retired code), 4.4 (meta/), 4.10. One PR each, or two or three grouped by area.
2. **The schema registry** (3.1-3.3) one tab at a time, Ledger and WarmUpQueue first, with the ID and date helpers (3.4, 3.5).
3. **Docs:** the root README and CLAUDE.md (4.1), then cas-ccps/README's split (4.2) and the setup docs (4.3), with a tools README (4.9).
4. **Cross-system:** the deploy report (3.8), the flow-check names (3.7), tools/lib (3.9), the test cutter (3.11).
5. **Last:** the dashboard HTML split (4.5) and 00's per-project code (4.6), after the push and over a break, since both touch what students use.

Questions for the operator: which morning email you read (3.6); whether
`drive-curation/` and the Drive Steward files can leave the repo (4.12).
