# cas-ccps Studio Steps

> ## ⚠️ STATUS: UNREACHABLE ON THE PRODUCTION ACCOUNT
>
> **All 8 steps in this project are dead code on `ccpsnet.net` today. Nothing
> below is wrong about the design — it is wrong about the outcome.** This
> project was pushed and deployed successfully against the real account and
> the steps **never appeared in Studio's step picker**, across repeated
> uninstall/reinstall cycles, with no OAuth prompt ever shown. There was no
> error to read.
>
> Root cause, confirmed directly at `console.cloud.google.com`: a Workspace
> Add-on exposing custom Studio steps requires a standard (non-default)
> Google Cloud project, and GCP access is turned off org-wide for this
> account by the district. Two things follow, and the second is the one
> people miss:
> - No amount of pushing, redeploying, or reinstalling changes this. The
>   ceremony described below completes fine and produces nothing.
> - **No standard project was ever provisioned for any project in this repo**
>   — every one uses the default project Apps Script creates on its own. So
>   the district policy is the *second* block here, not the first. An admin
>   enabling GCP is necessary but not sufficient; someone would still have to
>   create and link the project.
>
> **What to build instead:** push the work into Apps Script and let the Flow
> make only the keyless Gemini call.
> `cas-ccps/scripts/37_FlowInputBuilder.js` is the worked example — it moves
> Flow 2's entire per-teacher lookup chain into a time trigger so the Flow
> reads one flat literal row and needs no custom step, and
> `cas-ccps/scripts/41_WarmUpFlowBridge.js` does the same for Flows 3, 4 and
> 5 — the exposure this banner used to name is closed. **All five flows now
> have a keyless path, so nothing in this folder gates anything.**
>
> Worth knowing before porting anything else this way: three of the five
> steps 41 replaced were duplicating Apps Script that already existed in the
> same project, and each said so in its own header (`ExtractWarmUpPromptTextStep`
> re-implemented `evaluateWarmUpDoc_`; `FinalizeWarmUpScoreStep`'s three
> write-backs each state they "mirror" `writeFinalScores_` /
> `writeFeedbackToDoc_` / `writeRegistryScores_` "exactly"). The port reuses
> them. Only `SelectWarmUpArchetypeStep`'s decision logic and
> `CreateWarmUpDocStep`'s document construction were substantial ports.
>
> Declared in [`tools/gas-lint/gcp-map.json`](../../tools/gas-lint/gcp-map.json)
> as `live-blocked`, enforced by gas-lint's Check G. The full account
> narrative is in `cas-ccps/HISTORY.md` ("Wall 1 — GCP access is disabled for
> this district account").
>
> **Everything below remains accurate as design, and would be correct again
> unchanged if a standard project were ever linked.** Kept for exactly that
> reason — it is 2,113 written and unit-tested lines, not a mistake.


One standalone Apps Script project holding every custom Workspace
Studio step cas-ccps uses, across all five flows. This is an 8th
cas-ccps deployment target — the other 7 in `cas-ccps/clasp/manifests/`
are each bound to a specific spreadsheet or doc; this one is standalone
so it's installable across flows rather than tied to one document.
Registered in `tools/gas-lint/project-map.json` as `cas-ccps:studio-steps`
and in `tools/clasp-sync/sync.js` the same way as every other cas-ccps
project — both tools run clean against it.

## Why one project instead of one per step

Creating a project, pushing, deploying, and test-installing is real
ceremony — consolidating every step into one project's manifest
(`workflowElements[]` holds any number of entries) means that ceremony
happens once, ever, no matter how many steps get added later:

```bash
node tools/clasp-sync/sync.js studio-steps
cd cas-ccps/.clasp-build/studio-steps
clasp push
clasp deploy --description "v1"
```

Then, once: **Apps Script editor → Deploy → Test deployments → Install
→ Done.** Every step registered in the manifest becomes available in
Studio's step picker from that point on — adding a new step later means
adding a file and a manifest entry, not repeating any of the above.

*(That last sentence is the design intent, and it is what did not happen on
`ccpsnet.net` — see the status banner at the top of this file. The install
completes; the picker stays empty, because the add-on needs a standard Cloud
project this account doesn't have.)*

## What's in it

All 9 files are landed and registered — every step behind Flows 1-5 that
this repo's own review found genuinely needed custom code (see each
step's own file header for the full design reasoning; this file gives
the current, factual picture, not a change-by-change narrative):

| File | Flow | Replaces |
|---|---|---|
| `StepsShared.gs` | — | shared helpers only (no step of its own) |
| `CommitRubricDraftStep.gs` | 1 — Rubric Extraction | Step 3 |
| `ReadInstructorConfigStep.gs` | 2 — Student Evaluation | Step 2 (widened) |
| `CommitStudentEvaluationStep.gs` | 2 — Student Evaluation | Steps 3b + 5b |
| `SelectWarmUpArchetypeStep.gs` | 3 — Warm-Up Generation | pre-processing (archetype/mode selection) |
| `CreateWarmUpDocStep.gs` | 3 — Warm-Up Generation | post-processing (doc creation) |
| `ExtractWarmUpPromptTextStep.gs` | 4 — Warm-Up Scoring | input prep |
| `FinalizeWarmUpScoreStep.gs` | 4 — Warm-Up Scoring | output step |
| `ExtractBridgeInputsStep.gs` | 5 — Bridging Flow | input prep |

Steps 1/2/4 of Flow 1, native Ask-Gemini steps everywhere, and Studio's
own Sheets/Docs connectors all stay native — only the pieces a native
Studio connector genuinely can't do cleanly are custom code here.
Neither step calls Gemini directly (the Walled Garden principle
`15c_Flow2DirectEvaluationService.js`'s own header establishes — Studio's
native Gemini access needs no API key for anyone to manage).

Test coverage lives in `tests/cas-ccps/` — one file per step plus
`studio-steps-shared.test.js` for `StepsShared.gs` itself and
`competency-evidence-schema-compat.test.js`, which loads both of this
project's `CompetencyEvidence` writers (this project's
`CommitStudentEvaluationStep.gs` and `15c_Flow2DirectEvaluationService.js`'s
dev-testing bridge, in `cas-ccps:central-ledger`) against the real
reader (`30_SCRSuggestionEngine.js`'s `aggregateEvidence_()`) to confirm
their schemas stay reconciled.

## Fixes applied while landing this project

An earlier drop of this code (reviewed, not adopted verbatim) had two
confirmed bugs and one repo-wide cross-cutting gap, all fixed before any
of these files were committed:

- **`inStr_()` safe-input reader + a whole-body try/catch, every
  execute function.** Reading a Studio input as
  `inputs["x"].stringValues[0]` throws a raw `TypeError` the moment a
  field is unmapped or non-STRING — before any status could be
  returned, silently stranding the trigger row. `StepsShared.gs`'s
  `inStr_()` degrades to a default instead; every `onXExecute` reads
  through it and wraps its whole body in try/catch, which is what
  actually makes each step's "fails closed" claim true.
- **Fence-stripping before `JSON.parse`.** Gemini routinely wraps JSON
  output in a ```` ```json ```` fence even when asked for raw JSON.
  `CommitRubricDraftStep.gs` and `FinalizeWarmUpScoreStep.gs` strip it
  first (`StepsShared.gs`'s shared `stripJsonFence_()`), matching
  `25_WarmUpWriter.js:740`'s own convention — otherwise a perfectly
  valid Gemini response fails validation for a formatting reason
  unrelated to its content.
- **The U+2500 marker bug (`CommitStudentEvaluationStep.gs`).** An
  earlier version emitted ASCII `-- EVALUATION --` / `-- END EVALUATION --`
  markers. `03_QueueBridge.js` and `09_StudentRevisionGuidance_M1Base.js`
  both search for the real U+2500 box-drawing form
  (`── END EVALUATION ──`) — an ASCII version would have silently
  broken both files' "insert next-steps text after the evaluation"
  logic on every Flow 2 run. Fixed to the real character, confirmed by
  byte inspection against both consumers.
- **`CompetencyEvidence` tab creation.** `CommitStudentEvaluationStep.gs`
  is this repo's real Flow 2 writer for that tab — it now creates the
  tab if missing (matching the same self-healing pattern
  `15c_Flow2DirectEvaluationService.js`'s dev-testing bridge already
  used) rather than throwing into a swallowed catch and silently never
  writing evidence.
- **`CreateWarmUpDocStep.gs`'s folder path.** Its top-level folder
  variable was actually populated from `lesson_context_snapshot.course_name`
  while being called "subject" — genuinely misleading, since
  `02_Form1_IntakeAndWorkspaceGenerator.js`'s real student-workspace
  tree has Subject and Course Name as two *distinct* folder levels.
  Renamed to `courseName` to say what it actually holds; a true
  Subject-level folder isn't reachable from this step's inputs today
  (that field isn't in the snapshot at all) — flagged in the file's own
  header as a real, known gap rather than silently "fixed."
- **Hardcoded `"America/New_York"`.** Every `Utilities.formatDate()`
  call in this project now uses `Session.getScriptTimeZone()` instead,
  matching the rest of the repo's convention.
- **PII logging.** Every execute function used to
  `Logger.log(JSON.stringify(event))` — full student names, emails,
  evaluation text, straight into Stackdriver. Reduced to a plain "step
  ran" line everywhere.

## What's still manual, on purpose

Two things, neither reducible with what's currently public:

1. **Test-install, once per account.** No API exists for this — it's
   an Apps Script editor action. Doing it once, for one project holding
   9 steps, instead of once per step, is the real friction reduction
   available here.
2. **Wiring each flow.** Starter → step → step, mapping variables via
   Studio's picker. A few minutes per flow, done once when that flow is
   built, not a recurring deployment cost.

This project is a district-domain (ccpsnet.net) deployment target, so
SMP-004's automation air-gap applies to it the same way it applies to
every other cas-ccps project: pushing/deploying here is a human, at
their own keyboard, in their own already-authenticated session — never
a stored credential, never CI. See
`kos-personal/rtp-core-router/protocols/KILL_SWITCH_PROTOCOL.md`'s
reconciled note and `tools/clasp-sync/DEPLOYMENT_RUNBOOK.md`'s "Option
2" for the full reasoning; this project follows the same model as the
other 7 cas-ccps projects, not a separate one.

## Adding the next step

1. New file in `cas-ccps/studio-steps/`. Use `StepsShared.gs`'s
   `variableTextInput_`, `inStr_`, `stringVar_`, `intVar_`,
   `buildOutputRenderAction_`, `randomToken_`, `stripJsonFence_` —
   don't redeclare them. GAS concatenates every file in a project into
   one global scope, so a second declaration crashes the whole project
   at parse time — exactly what `gas-lint`'s collision check exists to
   catch. Read every Studio input through `inStr_()` and wrap the whole
   execute function body in try/catch, matching every step in this
   project.
2. Add its `workflowElements` entry to
   `cas-ccps/clasp/manifests/studio-steps.appsscript.json`. If it needs
   a Google service none of the existing steps use yet, add the
   matching OAuth scope to the same manifest — `gas-lint` catches a
   missing one, but only if you run it.
3. Add its filename to `tools/gas-lint/project-map.json`'s
   `cas-ccps:studio-steps.files` array.
4. Add a test file under `tests/cas-ccps/` for it, following the
   existing files' pattern (load via `tests/harness/gas-sandbox.js`'s
   `loadGasFiles`/`makeStudioEvent`).
5. `node tools/gas-lint/check.js && node tools/clasp-sync/sync.js studio-steps && npm test`
   — all three should pass clean before pushing.
