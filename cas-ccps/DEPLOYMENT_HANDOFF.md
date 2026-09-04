# cas-ccps Deployment Handoff

> ## ⚠️ STATUS: cas-ccps IS FULLY LIVE. START HERE, THEN GO TO leader-hub.
>
> **All five cas-ccps flows are live and verified end to end.** All 8 cas-ccps
> projects are live in a real `ccpsnet.net` Workspace account, Module 1 and
> Module 2 (Phase A + B) are set up, and Flow 1 through Flow 5 have each been
> built in Studio and confirmed with their own liveness check
> (`checkFlow2Liveness()`, `checkWarmUpFlowLiveness()`) — not just a green
> "Run Completed" banner. "Verified" means a real Studio run against seeded
> fixture data, not yet a real student submission; `cas-ccps/docs/IMPACT_DASHBOARD.html`
> keeps that distinction explicit in its own badges and metrics.
>
> **If you are a fresh session picking up deployment work, cas-ccps itself
> needs nothing further right now — move to leader-hub, then kos-personal**
> (["The other two systems"](#the-other-two-systems) below), both still
> from-scratch deployments that have never been pushed. The rest of this
> document — the already-live section, the Script Properties reference, the
> from-scratch order of operations — is kept as reference for those two
> systems and for standing up a *second* cas-ccps account, not as an active
> checklist for this one.
>
> ### Lessons learned closing out Flows 2-5 — read before building a flow
> anywhere else in this repo
>
> These came out of actually building Flows 2-5 in Studio this session, not
> from reading the code. Full detail, with the exact logs and diagnosis, is in
> `cas-ccps/HISTORY.md`'s deployment record.
>
> 1. **A green "Run Completed" banner proves nothing.** It doesn't distinguish
>    "the Flow is not built," "its trigger matches nothing," "it wrote to the
>    wrong column," or "it's erroring" — all four look identical from Studio's
>    side. The only things that actually prove a flow is live are its own
>    liveness/binding checks (`checkFlow2Binding()`/`checkFlow2Liveness()`,
>    `checkFlowBinding()`/`checkWarmUpFlowLiveness()`). Run them after every
>    build, not just when something looks wrong.
> 2. **`everyMinutes(n)` only accepts 1, 5, 10, 15, or 30.** Two install
>    functions (`installFlowInputTriggers()` in `37_FlowInputBuilder.js`,
>    `registerTriggersIfNeeded_()` in `08_TeacherConfirmationStep.js`) called
>    `everyMinutes(2)`, which throws immediately — confirmed directly against
>    a real account, not assumed. The second one runs from `onOpen()`, whose
>    exceptions are swallowed rather than surfaced, so it had likely been
>    failing silently on every Teacher Matrix sheet open since deployment.
>    Both fixed to `everyMinutes(5)`. If you ever see this exact error message
>    installing a trigger anywhere in this repo, this is the whole story —
>    don't re-diagnose it from scratch.
> 3. **A Flow's own write-back step is not automatically the one thing
>    `harvestFlowInputResults()` is waiting for.** Flow 2's build spec and its
>    binding check both said the Flow should write *only* `GeminiFullOutput`.
>    Built exactly as instructed, the Flow ran successfully in Studio and
>    produced a correct evaluation — and was never harvested, because
>    `harvestFlowInputResults()` only processes rows already at
>    `ReadyStatus = EVALUATED`, a transition nothing else in the codebase
>    makes. `checkFlow2Binding()` used to call a row like that fully healthy.
>    Both the build spec (`42_FlowBuildSpec.js`) and the check
>    (`41_WarmUpFlowBridge.js`) are now fixed — the check flags this exact
>    case as "stuck at READY" — but the underlying lesson generalizes: when a
>    harvest function checks for a specific status value, confirm *what writes
>    that value* before assuming a "write the output column" instruction is
>    complete.
> 4. **A `PromptText` chip (`FlowInput`/`Flow3Input`/`Flow4Input`/`Flow5Input`,
>    always the last read-only column before the Flow's own writes) is already
>    fully substituted** — including, for Flow 3, already resolved between its
>    Mode A/B templates. Bind Gemini's system prompt directly to that chip.
>    Don't reconstruct the prompt by hand from `15_StudioFlowPrompts.js` /
>    `15b_StudioFlowPrompts_Flow2_Revised.js` (those describe the *pre-37/41*
>    design, now superseded — the lookup, split, and evidence-write steps they
>    describe all moved into Apps Script) and don't branch on `Mode` in
>    Studio. The `FlowPrompts`-tab prompt-key row in `FlowBuildSpec` is
>    explicitly the *alternative*, not the default.
> 5. **Model-setting guidance (temperature, token limits) is not prompt
>    text.** It's easy to paste a sentence about settings directly into the
>    prompt field by mistake — Gemini will receive it as literal instruction
>    text, which reads as confusing rather than throwing an error. If Studio's
>    "Ask Gemini" action doesn't expose a settings control, that's fine; leave
>    it at default rather than fighting the UI for it.
> 6. **A `checkWarmUpFlowLiveness()` reading of `returnsSeen: 1,
>    everReturned: true, consumed: 0` right after a harvest is very likely a
>    benign timing gap, not a bug** — the harvest marks the return row
>    `HARVESTED` and then separately consumes the matching input row; a check
>    that lands between those two writes sees the first without the second.
>    It resolved on its own within a couple of minutes both times it was seen
>    this session. Confirmed by directly inspecting the `WarmUpFlowReturn`
>    row's `HarvestStatus`/`Error` columns before concluding otherwise — do
>    that first if it doesn't resolve on a re-check.
> 7. **A zip/archive transfer to an air-gapped machine can nest a folder.**
>    "Download ZIP"-style exports commonly wrap the repo in a top-level folder
>    named after the branch (e.g. `KOS-main`), so `C:\...\KOS\` and
>    `C:\...\KOS\KOS-main\` both exist and only the second is the real repo
>    root. Every path-not-found error this session traced back to standing one
>    level too high. Confirm with a plain directory listing before assuming
>    gitignored files (like `cas-ccps/clasp/local/*.clasp.json`, the real
>    script IDs) failed to survive the transfer.
>
> ### What changed to get here
>
> 1. **Every flow is ported off the custom Studio steps.** A custom step is a
>    Workspace Add-on and needs a standard, non-default Cloud project; GCP is
>    disabled org-wide for this account, so all 8 cas-ccps steps and both
>    kos-personal steps install without error and never appear in Studio's
>    picker. The shape now is: Apps Script materializes one flat literal row →
>    the Flow makes **one model call** with native steps → Apps Script
>    harvests on a time trigger. `37_FlowInputBuilder.js` (Flow 2),
>    `41_WarmUpFlowBridge.js` (Flows 3/4/5),
>    `kos-personal/12_StudioReturnHarvest.gs` (both KOS flows).
> 2. **There is now a check for each of the four causes of "nothing
>    happened"** — never built, trigger matches nothing, wrong columns, model
>    call errored. Previously all four looked identical. The table in the
>    section below is ordered so each one gets answered before the next
>    question can confuse it.
> 3. **The Studio values to type are generated, not transcribed.**
>    `syncFlowBuildSpec()` writes a `FlowBuildSpec` tab from the same
>    constants the harvest reads. Build each Flow from that tab, not from a
>    comment block — the comment blocks normalize em-dashes, which is how a
>    marker copied from a note silently matched nothing.
> 4. **`meta/FLOW_DOCTRINE.md` exists**: thirteen rules with the incident
>    behind each and an explicit note on whether anything enforces it. Read it
>    before changing how a flow is built. Nine of the thirteen are enforced by
>    `gas-lint` Checks G-K and `doc-currency` Check 5.
> 5. **The docs were corrected** where they still described the blocked path
>    as live or as merely unpushed. `doc-currency` Check 5 now errors on that
>    class, so a document cannot regress to it quietly.
> 6. **Flows 2-5 were built in Studio and verified live**, closing the gap
>    items 1-5 above only got partway to. Two real bugs surfaced doing it (the
>    `everyMinutes(2)` trigger bug and Flow 2's missing `ReadyStatus` write),
>    both fixed at the root cause rather than worked around — see "Lessons
>    learned" above.
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
> Don't spend time on either — see `cas-ccps/studio-steps/README.md`'s status
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
> Script Properties reference, the runbook pointers, and the
> order-of-operations further down are for anyone deploying to a *second*
> account. Three things in the lower half are corrected inline where they
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
"Lessons learned" above.

## Current repo state

- Deployment work continues on `claude/new-session-l8yvnj`, merged to `main`.
- **Zero errors is the gate. The warning counts are not** — both tools warn
  about accepted, documented things, and both numbers move whenever a check is
  added or a warning is legitimately resolved (gas-lint has gone 4 → 5,
  doc-currency 9 → 8). Read the findings, not the count:
  `npm test`, `node tools/gas-lint/check.js` (11 checks), `node
  tools/doc-currency/check.js` (5 checks), `node tools/clasp-sync/sync.js`
  (all 8 projects build into `cas-ccps/.clasp-build/`).
- **All 8 projects now exist in a real Google account.** Their real script IDs
  live in `cas-ccps/clasp/local/*.clasp.json`, which is gitignored — so it is
  present on the deploying machine and absent everywhere else. A fresh clone
  must recreate those files from
  `cas-ccps/clasp/templates/*.clasp.json.template` (still carrying
  `"scriptId": "REPLACE_WITH_REAL_SCRIPT_ID"`) before `sync.js` can build.

Don't re-derive the bug-fix history — it's in `cas-ccps/HISTORY.md` if you
need it. The deployment record and the follow-up sections after it are the
relevant ones; everything before them is pre-deployment reconciliation work.

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
     and has a cut version — its manifest ships a placeholder library dependency.
  2. A from-scratch `central-ledger` spreadsheet has none of the 5 Module-1 tabs
     (`Ledger`, `ReviewQueue`, `STAGING_PIPELINE`, `RubricQueue`,
     `MatrixRegistry`) the admin wizard normally creates. Paste
     `createAdminAssets_()`'s tab-creation block
     (`16_UnifiedManualSetup.js:~331-373`) into a throwaway function and run it
     once.
  3. `teacher-dashboard`/`student-dashboard` both need `ADMIN_SS_ID` set (not
     just `CENTRAL_LEDGER_SS_ID`), and `student-dashboard`'s manifest must have
     `executeAs: "USER_ACCESSING"` (already correct in the tracked manifest —
     just don't overwrite it).
  4. **Found during the real deployment, not predicted:** the from-scratch path
     also skips the **Central Turn-In Form**. The admin wizard creates it
     normally; a `clasp create` + `clasp push` deployment never runs that path.
     Same remedy as #2 — call the wizard's form-creation step from a throwaway
     function once.

  Two manifest bugs also surfaced on first push, both now fixed in the tracked
  manifests (`bcc772c`, `83f6f76`) — neither was detectable by tests or lint,
  only by a real push rejecting the file. If you are deploying from a tree
  older than those commits, expect `studio-steps` to fail on an invalid
  `workflowElements` `state` value and, once pushed, to never appear in
  Studio's picker because of a placeholder `logoUrl`.
- **Part 3.6 — production promotion**: the 5 trigger/menu-driven projects go
  live on `clasp push` alone. The 2 web apps (`teacher-dashboard`,
  `student-dashboard`) need an explicit `clasp version` + `clasp deploy
  --deploymentId <id> --versionNumber <n>` after every push, or the live `/exec`
  URL never updates.
- **Part 3.7 — studio-steps**: after `clasp push`/`clasp deploy`, there's one
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

## Bringing an already-live account up to current HEAD

**This is the operation that actually applies now**, and it is not the
from-scratch sequence below. The 8 projects exist, Module 1 and Module 2
(Phase A + B) are set up, and Flow 1 works against real data — but HEAD has
moved a long way since that push. Scripts `35`, `37`, `39`, `40`, `41` and
`42` plus the Ledger schema guard (`38`) all landed afterwards, and **none of
them do anything until they are pushed and their setup functions are run
once.** That is what this section is.

Everything here runs at **the operator's own keyboard** (SMP-004: an agent
session must never `clasp push` to production). From the repo:

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
| 2 | `runFlowPreflightCheck()` | Structure: every tab present and wide enough, all four flow triggers installed **exactly once** (a duplicate is reported as a failure, not a pass — two copies of a harvest race each other), the required Script Properties set, the self-healing tabs healthy. Each finding says which of the four questions it answers. Run this before the canaries; a canary failing for a missing tab wastes the canary. |

### Phase 2 — give the flows something to read and something to run on

| # | Function | Why, and what to expect |
|---|---|---|
| 3 | `syncFlowPromptsToSheet()` | Writes the `FlowPrompts` tab, so a Flow reads its system prompt from a chip instead of carrying a pasted copy. A future prompt change is then a `clasp push` plus one re-run, not a hand-paste per Flow. |
| 4 | `installFlowFixtures()` | Seeds dummy rows at all five flows' trigger conditions, so a Flow has something to match. Without them a Flow reports a green "Run Completed" over zero rows, which is indistinguishable from success and is where a lot of last session went. `checkFlowFixtures()` reports what is present; `removeFlowFixtures()` takes them out. Fixture data uses `.invalid` addresses and `*-FIXTURE-*` IDs — the Flow-2 fixture's `StagingRowRef` is the literal `FIXTURE` precisely so the harvest cannot complete a real student's submission. |
| 5 | `installFlowInputTriggers()` | Flow 2's two time triggers (1-minute build, 2-minute harvest). This is what makes `FlowInput` populate at all. |
| 6 | `installWarmUpFlowTriggers()` | Flows 3/4/5's two triggers (materialize + harvest, both 5-minute). Nothing in `41_WarmUpFlowBridge.js` runs until this is done. |

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
| Is the structure sound? | `runFlowPreflightCheck()` | `runLeaderHubPreflight()` | — |
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
`cas-ccps/studio-steps/README.md`'s status banner and
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
Read cas-ccps/DEPLOYMENT_HANDOFF.md's status banner, then
leader-hub/DEPLOYMENT_GUIDE.md. I'm continuing the live deployment on
the ccpsnet.net account: 8 cas-ccps projects exist, Module 1 and
Module 2 (A+B) are set up, and all five cas-ccps flows are live and
verified. leader-hub and kos-personal have never been deployed — that's
what's next. I run every clasp/browser/Studio action myself (SMP-004)
and paste logs back. Start by telling me the exact commands for step 1.
```

## The other two systems

This file is cas-ccps's. A fresh deployment session covers three, and each
carries its own guide with its own sequence. Both are on the **same
`ccpsnet.net` account** as cas-ccps — do not read a system boundary as an
account boundary, which is a mistake this repo made twice
(`FLOW_DOCTRINE.md` rule 3).

**leader-hub** — `leader-hub/DEPLOYMENT_GUIDE.md`. Never pushed, so it is a
from-scratch deployment: create the project, push, deploy as a web app, then
`syncAiPromptsToSheet()` → `runLeaderHubPreflight()` → `checkAiQueueSchema()`
→ `runAiFlowCanary()` → `installAiFlowFixtures()`, then build the six Flows
and confirm with `checkAiFlowFixtures()`. Its queue rows are deleted the
moment their outcome is read, which is why liveness there is a durable
counter rather than a row scan. Its D1 side — the browser calling cas-ccps's
`doPost()` — is diagnosed from the cas-ccps end; see the paragraph above.

**kos-personal** — `kos-personal/DEPLOYMENT_GUIDE.md`. Push, deploy the web
app, then `setupAllTriggers()` (14 triggers, `harvestStudioReturns` among
them), and build the two Flows with a native "add row to sheet" into
`STUDIO_RETURN` as the last step. `installStudioFlowFixture()` plants a
scratch doc plus a `PENDING_FLOW` staging row; verify with
`runStudioReturnCanary()`, `checkStudioFlowBinding()` while wiring that last
step, then `checkStudioFlowLiveness()`. Its consent-screen phase configures
the *default* project and does **not** create a standard one — that
distinction is what cost 2,113 lines here.

## Order of operations

1. **Module 1 must exist and be live first** — it's the prerequisite for
   everything else (`CENTRAL_LEDGER_SS_ID` has to resolve to something real
   before Module 2's wizard will even run). If Module 1 isn't live yet either,
   this is a from-scratch deployment of the whole system, not just Module 2.
2. **Get all 8 projects connected via clasp** per the runbook above. Expect all
   4 gotchas — the first three are confirmed to fire every time.
3. **Upload the 3 data files to the teacher's Drive folder before running the
   wizard** — the wizard only *searches* for these, it doesn't fetch or
   generate them:
   - `CompetencyRegistry.csv` (also in `cas-ccps/data/`)
   - `PacingGuide_CAS_Context.json` (also in `cas-ccps/curriculum/`)
   - `CompetencyRubrics.json` (also in `cas-ccps/data/`)
4. **Wire the CentralLedger Apps Script Library dependency** — `cas-ccps/README.md`'s
   Known Gap #15 has the exact 4 steps. Several cross-project calls (competency
   registry import, pacing guide import, rubric import) silently fall back to
   "run this manually from Central Ledger instead" instructions if this isn't
   wired — not a hard blocker, but degrades the wizard experience.
5. **Run Module 2's setup wizard**, `28_Module2Setup.js` — two entry points, not
   one:
   - `runModule2Setup()` — Phase A (Lightweight): creates 4 tabs, imports the
     competency registry, installs the 5-minute alignment-log backfill trigger,
     sets `M2_ENABLED=true`.
   - `runModule2WarmUps()` — Phase B (Full/Warm-Ups): creates 6 more tabs,
     imports pacing guide + rubrics, collects the block schedule, **installs 5
     nightly/periodic triggers** (this is where last session's fix matters —
     see below), and walks through Studio Flow 3/4/5 configuration via `ui.alert()`
     dialogs with the exact settings to enter by hand.
   Both phases end with an inline (not doc-deferred) list of remaining manual
   steps — read the completion alerts, don't skip past them.
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

`cas-ccps/studio-steps/README.md` has the per-step deployment instructions
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

## Script Properties reference

**Hard-required** (fresh deployment throws without these — `00_SharedConfig.js`):
`ADMIN_SS_ID`, `CENTRAL_LEDGER_SS_ID` — the second is also required by
`teacher-dashboard`/`student-dashboard` directly, not just central-ledger.

**Written automatically, don't set by hand:**
- Script 16 (teacher setup wizard) writes `TEACHER_*`, `*_RESPONSE_SS_ID`,
  `*_FORM_URL`, `CONFIRM_ENTRY_*`, `MASTER_*` — all default to `""` (degraded,
  not broken) if somehow missed.
- `28_Module2Setup.js` writes `M2_ENABLED`, `M2_COURSES`,
  `M2_SETUP_PHASE_A_COMPLETE`, `M2_REGISTRY_IMPORTED`,
  `M2_PACING_GUIDE_IMPORTED`, `M2_RUBRICS_IMPORTED`, `M2_SETUP_COMPLETE`,
  `M2_SETUP_PHASE_B`.

**Set manually before running the wizards:**
- `CURRENT_TERM` — no code default; falls back to `""`/`"All Terms"`/`"ALL"`
  per call site if unset (degraded, not fatal, but set it).
- `ADMIN_ROOT_FOLDER_ID`, `ADMIN_NOTIFY_EMAIL` — admin-tier, no wizard sets these.

**Optional, all default-safe, worth setting eventually:** the 5 retention
properties (`SCR_RETENTION_YEARS`, `LEDGER_RETENTION_YEARS`,
`COMPETENCY_EVIDENCE_RETENTION_YEARS`, `PARENT_REPORT_RETENTION_YEARS`,
`WARMUP_QUEUE_RETENTION_YEARS` — the last one is new this session), all
default to 5 years, all documented as **unconfirmed against any real district
retention schedule** (`cas-ccps/docs/FERPA_DATA_MAP.md`). Treat these as
placeholders, not a policy decision already made — flag for the district's
records staff, don't silently accept the default as correct.

**Must never be set:** `GEMINI_API_KEY`. `25_WarmUpWriter.js`'s `callFlow4_()`
has a dead direct-Gemini-API code path (a documented, deliberately-retained
placeholder) that would go live — bypassing the "Walled Garden" Studio-Flow-only
boundary entirely — the moment this property exists.
`10_AdminRecoveryPanel.js`'s daily health check alerts loudly if it's ever set;
don't set it during deployment troubleshooting even temporarily. Same caution
for `FERPA_FLOW3_FULL_NAME_OVERRIDE` — must stay unset/false.

## Before going live, read

- `cas-ccps/docs/FERPA_DATA_MAP.md` in full — the compliance reference paired
  with `cas-ccps/docs/SYSTEM_ARCHITECTURE.html`'s Security Model section. Do
  **not** treat `cas-ccps/docs/archived/KOS_Guide_IT__Admin_Security_PRE_V8_ARCHITECTURE.pdf`
  as current — it describes an abandoned pre-v8 architecture; `README.md`
  explains why it's archived.
- The "Disclosure to parents" section of `FERPA_DATA_MAP.md` specifically —
  the weekly parent report (`36_WeeklyParentReport.js`) is the **only** surface
  in this system that sends student data outside the school's Workspace
  domain. Confirm this is genuinely wanted before enabling it, separately from
  the rest of Module 2.
- `cas-ccps/README.md`'s "Known gaps" section — several are deployment-relevant
  beyond the Studio Flow one above (e.g. Gap #6: `30b_SCRRetryRemediation.js`'s
  thresholds are provisional/unvalidated; Gap #11: nothing has actually run
  `importCompetencyRegistry()` against the in-repo CSV in a live deployment
  yet — that's what step 5 above does).

## Verification, before and after

Before touching any real Google account, confirm the local build is still
clean (nothing should have drifted since this handoff was written):

```bash
cd /home/user/KOS
npm test                          # all passing (count grows; don't assert a number)
node tools/gas-lint/check.js      # expect 0 errors (5 warnings as of this writing)
node tools/doc-currency/check.js  # expect 0 errors (8 warnings as of this writing)
node tools/clasp-sync/sync.js     # expect all 8 projects to build cleanly
```

**Zero errors is the gate; the warning counts are not.** Both tools warn about
things that are accepted and documented (an unmerged addendum, a dynamic
`google.script.run` dispatch, function names living in an Apps Script project
that was never committed here), and both numbers move whenever a check is
added or a warning is legitimately resolved — gas-lint has gone 4 → 5 and
doc-currency 9 → 8 since this section was written. Read the findings, not the
count.

After each project goes live, the runbook's own verification steps (spot-check
a menu item, run a smoke test) matter more than anything in this repo — a
clean local build says nothing about whether a real Apps Script project
actually authorized correctly, has the right OAuth scopes accepted, or has its
triggers actually firing on Google's clock, not just installed.

## One small, low-priority doc gap noticed along the way — CLOSED

`cas-ccps/docs/FERPA_DATA_MAP.md`'s Health Checks section said
`_ferpaHealthChecks_()` "now checks **seven** things" where the live code
(`10_AdminRecoveryPanel.js`) has **eight**. Fixed in `37aa157` at the start of
the deployment session, along with the "four retention checks" count in the
same file (also five). Nothing to do here.

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
