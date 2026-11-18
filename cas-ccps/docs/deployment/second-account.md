# Deploying a second account from scratch

Split out of `cas-ccps/DEPLOYMENT_HANDOFF.md` on 2026-11-17; the handoff maps where everything is.

## The one document that actually walks through this

**`tools/clasp-sync/DEPLOYMENT_RUNBOOK.md` is the real, step-by-step guide.**
`tools/clasp-sync/README.md` hands off to it explicitly. Read it in full before
doing anything — don't rely on this handoff's summary below for exact commands.
Key parts (written for a from-scratch deployment; this account is now past
this stage, but a second account would start here):

- **Part 3.2b — building from scratch straight to production** (not 3.2's pilot-
  sandbox path, which had no existing production project to sandbox-copy from
  at the time; there is one now, so 3.2 is available for a second account): `clasp create --type sheets|docs|standalone --title "CAS - <Project
  Name>" --rootDir .` in a scratch folder outside this repo, per project. This
  creates both the real Drive file and its bound script, and prints two
  different IDs (document ID ~44-45 chars, script ID ~57-58 chars — don't mix
  them up in the `.clasp.json` files).
- **Four from-scratch gotchas. The first three were documented here before
  deployment and all three fired exactly as written; the fourth was found
  during it.** Kept in full because they apply again to any second account:
  1. `unified-manual` fails to push (`Invalid ID`) until `central-ledger` exists
     and has a cut Library version — its manifest's library dependency names
     this account's Central Ledger, so a second account replaces the ID and
     version first (`cas-ccps/README.md`, Known Gap #15).
  2. A from-scratch `central-ledger` spreadsheet has none of the 5 Module-1 tabs
     (`Ledger`, `ReviewQueue`, `STAGING_PIPELINE`, `RubricQueue`,
     `MatrixRegistry`) the admin wizard normally creates. Paste
     `createAdminAssets_()`'s tab-creation block
     (`16_UnifiedManualSetup.js:~331-373`) into a throwaway function and run it
     once.
  3. `teacher-dashboard`/`student-dashboard` both need `ADMIN_SS_ID` set (not
     just `CENTRAL_LEDGER_SS_ID`), and `student-dashboard`'s manifest must have
     `executeAs: "USER_DEPLOYING"` and `access: "DOMAIN"` (corrected
     2026-09-28: it used to say `USER_ACCESSING` with `ANYONE`, which meant
     every student needed read access to the whole Central Ledger, and any
     Google account could reach the page. Running as the deploying admin,
     the page filters rows to the signed-in student, who needs no Ledger
     access at all).
  4. **Found during the real deployment, not predicted:** the from-scratch path
     also skipped the **Central Turn-In Form**. No longer needed: the form and
     its handler were retired on 2026-10-10 (students turn in on Canvas), and
     the admin wizard no longer creates one.

  Two manifest bugs also surfaced on first push, both now fixed in the tracked
  manifests (`bcc772c`, `83f6f76`) — neither was detectable by tests or lint,
  only by a real push rejecting the file. If you are deploying from a tree
  older than those commits, expect `studio-steps` to fail on an invalid
  `workflowElements` `state` value and, once pushed, to never appear in
  Studio's picker because of a placeholder `logoUrl`.
- **Part 3.6 — production promotion**: the 5 trigger/menu-driven projects go
  live on `clasp push` alone. The 2 web apps (`teacher-dashboard`,
  `student-dashboard`) need an explicit `clasp version` + `clasp update-deployment
  <id> --versionNumber <n>` after every push, or the live `/exec`
  URL never updates. On this account `run.js` does both for every
  deployment listed in the project's `deployments.txt`.
- **Part 3.7 — studio-steps**: after `clasp push`/`clasp create-deployment`, there's one
  manual, no-clasp-equivalent step in the Apps Script editor: Deploy → Test
  deployments → Install. Skipping this is why "pushed" and "usable in Studio's
  step picker" are different states.
- **SMP-004 / air-gap framing**: only a human at their own already-authenticated
  keyboard runs `clasp push`/`clasp deploy` against a real ccpsnet.net
  production project. If you're doing this from an agent session without that
  human's own Google auth in front of you, you cannot complete the real push —
  you can prepare everything up to that point (builds, manifests, `.clasp.json`
  files with real IDs once the human creates the projects) and hand off the
  actual `clasp push`/`clasp deploy` invocations.

## Order of operations

1. **Module 1 must exist and be live first** — it's the prerequisite for
   everything else (`CENTRAL_LEDGER_SS_ID` has to resolve to something real
   before Module 2's wizard will even run). If Module 1 isn't live yet either,
   this is a from-scratch deployment of the whole system, not just Module 2.
2. **Get all 9 projects connected via clasp** per the runbook above. Expect all
   4 gotchas — the first three are confirmed to fire every time.
3. **Upload the 3 data files to the teacher's Drive folder before running the
   wizard** — the wizard only *searches* for these, it doesn't fetch or
   generate them:
   - `CompetencyRegistry.csv` (also in `cas-ccps/data/`)
   - `PacingGuide_CAS_Context.json` (also in `cas-ccps/curriculum/`)
   - `CompetencyRubrics.json` (also in `cas-ccps/data/`)
4. **Wire the CentralLedger Apps Script Library dependency** — `cas-ccps/README.md`'s
   Known Gap #15 has the exact 4 steps; the committed manifest names this
   account's Library, so a second account replaces its ID and version. Several cross-project calls (competency
   registry import, pacing guide import, rubric import) silently fall back to
   "run this manually from Central Ledger instead" instructions if this isn't
   wired — not a hard blocker, but degrades the wizard experience.
5. **Run Module 2's setup wizard**, `28_Module2Setup.js` — two entry points, not
   one:
   - `runModule2Setup()` — Phase A (Lightweight): creates 4 tabs, imports the
     competency registry, sets `M2_ENABLED=true`, and names the backfill's
     installer: `installAlignmentBackfillTrigger()`, run in the **Central
     Ledger** (`64`).
   - `runModule2WarmUps()` — Phase B (Full/Warm-Ups): creates 6 more tabs,
     imports pacing guide + rubrics, collects the block schedule, **names the
     Central Ledger installers for its triggers** (`installWarmUpTriggers()`,
     `installArtifactSyncTrigger()`, `installLedgerCycle()`), and walks through
     Studio Flow 3/4/5 configuration via `ui.alert()` dialogs with the exact
     settings to enter by hand.
   Since 2026-10-20 the wizard installs no trigger itself: it runs in the
   Unified Manual project and every one of these runs a Central Ledger
   function, so a trigger it made could only fail. In an install where it ran
   before, run `previewMisplacedTriggers()` then `removeMisplacedTriggers()`
   from the Unified Manual project's editor (step 17g).
   Both phases end with an inline (not doc-deferred) list of remaining manual
   steps — read the completion alerts, don't skip past them.
   Then, from Central Ledger, `importCourseData()` and
   `installLessonPlanTrigger()` (a sixth nightly trigger,
   `buildUpcomingLessons` at about 2am), and the rest of Phase 6 above.
6. **Redeploy Script 07 (Teacher Dashboard) as a new web-app version** after
   Phase A — the wizard tells you this in its completion alert; it can't do it
   itself.
7. **Build Studio Flows 2-5 by hand in Google Workspace Studio's UI.** — DONE
   for this account as of 2026-09-04; see the status banner and lessons
   learned at the top of this document. Kept here for a *second* account:
   this was the single biggest real gap between "code is done" and "system is
   live" — see the next section. Nothing in this repo can automate this step,
   but run `syncFlowBuildSpec()` first and build from the `FlowBuildSpec` tab
   it writes: every tab name, column number, header, trigger condition and
   prompt key for all five flows, derived from the constants the code
   actually reads. The wizard's Phase B dialogs and `15_StudioFlowPrompts.js`
   still carry the judgement half — connector names, temperature, token
   limits — which is deliberately not generated, because it needs judgement
   and does not drift. Keep `checkFlowBinding()` open in a second tab while
   wiring each Flow's last step (row 8 of the table above), and confirm with
   the flow's own liveness check afterward — a green "Run Completed" banner
   in Studio does not by itself prove the flow is wired correctly.

## The real gap: Studio Flows 2-5 — and it's worse than "not deployed"

**CLOSED for this account as of 2026-09-04 — all five flows built and
verified live.** Kept below as the reasoning for a *second* account, since
the same wall and the same port apply there identically.

**Corrected after the first real deployment. The original framing below said
the custom-step code was merely "not deployed." It is unreachable on this
account.**

Workspace Studio custom-step add-ons require a standard (non-default) GCP
project linked through Project Settings. `ccpsnet.net` has GCP access disabled
for this account entirely — confirmed directly at `console.cloud.google.com`.
The `studio-steps` project pushes successfully and its steps never appear in
Studio's picker, across repeated uninstall/reinstall cycles, with no OAuth
prompt ever shown. All 8 steps (2,113 lines) are blocked, and so is
`15c_Flow2DirectEvaluationService.js`'s `DIRECT_GEMINI` escape hatch, which
needs an API key, which needs a project.

Resolving that is a district IT / Workspace admin action. Worth requesting —
it would resurrect all 2,113 lines at once — but don't sequence anything
behind it.

**What was done instead — all five flows are now ported.**

`37_FlowInputBuilder.js` took Flow 2 off its custom step: it moves the whole
lookup chain into Apps Script and materializes one flat `FlowInput` row,
shrinking Flow 2's Studio side to four native, fixed-picker-safe steps.
`41_WarmUpFlowBridge.js` does the same for Flows 3, 4 and 5 —
`Flow3Input`/`Flow4Input`/`Flow5Input` in, a shared `WarmUpFlowReturn` tab
out, Studio making only the Gemini call. Verify each half independently of
Studio with `runFlow2Canary()` and `runWarmUpFlowCanary()`
(`35_FlowPreflightAndCanary.js` and `41_WarmUpFlowBridge.js`).

*Correction to what this section used to say:* it claimed Flows 3, 4 and 5
"hit the same fixed-picker wall (Warm-Ups are per-teacher too)." They don't.
`WarmUpQueue` lives in the Central Ledger — one spreadsheet a fixed picker
can target perfectly well. The per-teacher problem was specific to Flow 2's
`TeacherMatrix`. What actually blocked Flows 3/4/5 was the five custom steps
alone, plus the Drive and Docs work (creating a warm-up doc, sharing it,
stamping its zones) that no native step can do. Getting that distinction
wrong made the job look bigger than it was.

**All five flows (Rubric Extraction, Student Evaluation, Warm-Up Generation,
Warm-Up Scoring, Bridging) have now been verified live end to end**, each
confirmed with its own liveness check, not just a Studio "Run Completed"
banner. `cas-ccps/docs/IMPACT_DASHBOARD.html`'s badges read `Flow 1-5 ✅ Live`
and `Custom Studio steps ⛔ Blocked` — the custom-step badge stays as its own
state, deliberately distinct from "live," because "Built, Not Deployed" used
to read as "someone just needs to push it," which is the one thing that will
never resolve it. "Live" in these badges means built, wired, and confirmed
working against seeded fixture data — not yet exercised by a real student
submission; that distinction stays explicit in the dashboard's metrics and
narrative copy.

`archive/2026-27-Q2/cas-ccps/archived/studio-steps/README.md` has the per-step deployment instructions
(mirrors Part 3.7 of the runbook) — still accurate for an account that *has*
GCP access, which is no account this repo deploys to. That aside used to name
kos-personal as such an account; it is on this same `ccpsnet.net` account, so
its own two custom steps are blocked identically and were ported the same way
(`kos-personal/12_StudioReturnHarvest.gs`). The wizard's Phase B dialogs
(`28_Module2Setup.js`) give you the exact Studio Flow settings (trigger
condition, temperature, token limits, input/output field names) to enter once
you're in Studio's builder — don't guess these from the `.gs` files alone. For
anything positional (tab, column, header, trigger condition), prefer the
generated `FlowBuildSpec` tab over any document, this one included: it is
derived from the constants the harvest reads, and `checkFlowBuildSpec()`
reports when a column has moved since the last sync.

## Before going live, read

- `cas-ccps/docs/FERPA_DATA_MAP.md` in full — the compliance reference paired
  with `cas-ccps/docs/SYSTEM_ARCHITECTURE.html`'s Security Model section. Do
  **not** treat the old `KOS_Guide_IT__Admin_Security` PDF (removed from the
  tree; on the `pre-archive-cleanup` branch) as current — it describes an
  abandoned pre-v8 architecture; `README.md` explains why.
- The "Disclosure to parents" section of `FERPA_DATA_MAP.md` specifically —
  the weekly parent report (`36_WeeklyParentReport.js`) is the **only** surface
  in this system that sends student data outside the school's Workspace
  domain. Confirm this is genuinely wanted before enabling it, separately from
  the rest of Module 2.
- `cas-ccps/README.md`'s "Known gaps" section — several are deployment-relevant
  beyond the Studio Flow one above (e.g. Gap #6: `30b_SCRRetryRemediation.js`'s
  thresholds are provisional/unvalidated; Gap #11: on a new account nothing
  has imported the in-repo registry, pacing guide and rubrics until step 5
  above or `importCourseData()` (51) runs; it ran live on this account on
  2026-10-06, and `checkCourseData()` reports what is live).
