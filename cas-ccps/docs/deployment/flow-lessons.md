# Lessons learned closing out Flows 2-5 — read before building a flow anywhere else in this repo

Split out of `cas-ccps/DEPLOYMENT_HANDOFF.md` on 2026-11-17; the handoff maps where everything is.

These came out of actually building Flows 2-5 in Studio this session, not
from reading the code. Full detail, with the exact logs and diagnosis, is in
`cas-ccps/HISTORY.md`'s deployment record.

1. **A green "Run Completed" banner proves nothing.** It doesn't distinguish
   "the Flow is not built," "its trigger matches nothing," "it wrote to the
   wrong column," or "it's erroring" — all four look identical from Studio's
   side. The only things that actually prove a flow is live are its own
   liveness/binding checks (`checkFlow2Binding()`/`checkFlow2Liveness()`,
   `checkFlowBinding()`/`checkWarmUpFlowLiveness()`). Run them after every
   build, not just when something looks wrong.
2. **`everyMinutes(n)` only accepts 1, 5, 10, 15, or 30.** Two install
   functions (`installFlowInputTriggers()` in `37_FlowInputBuilder.js`,
   `registerTriggersIfNeeded_()` in `08_TeacherConfirmationStep.js`) called
   `everyMinutes(2)`, which throws immediately — confirmed directly against
   a real account, not assumed. The second one runs from `onOpen()`, whose
   exceptions are swallowed rather than surfaced, so it had likely been
   failing silently on every Teacher Matrix sheet open since deployment.
   Both fixed to `everyMinutes(5)`. If you ever see this exact error message
   installing a trigger anywhere in this repo, this is the whole story —
   don't re-diagnose it from scratch.
3. **A Flow's own write-back step is not automatically the one thing
   `harvestFlowInputResults()` is waiting for.** Flow 2's build spec and its
   binding check both said the Flow should write *only* `GeminiFullOutput`.
   Built exactly as instructed, the Flow ran successfully in Studio and
   produced a correct evaluation — and was never harvested, because
   `harvestFlowInputResults()` only processes rows already at
   `ReadyStatus = EVALUATED`, a transition nothing else in the codebase
   makes. `checkFlow2Binding()` used to call a row like that fully healthy.
   Both the build spec (`42_FlowBuildSpec.js`) and the check
   (`41_WarmUpFlowBridge.js`) are now fixed — the check flags this exact
   case as "stuck at READY" — but the underlying lesson generalizes: when a
   harvest function checks for a specific status value, confirm *what writes
   that value* before assuming a "write the output column" instruction is
   complete.
4. **A `PromptText` chip (`FlowInput`/`Flow3Input`/`Flow4Input`, and `Flow5Input` until Flow 5 was retired on 2026-11-01,
   always the last read-only column before the Flow's own writes) is already
   fully substituted** — including, for Flow 3, already resolved between its
   Mode A/B templates. Bind Gemini's system prompt directly to that chip.
   Don't reconstruct the prompt by hand from
   `15b_StudioFlowPrompts_Flow2_Revised.js` or its archived predecessor 15 (those describe the *pre-37/41*
   design, now superseded — the lookup, split, and evidence-write steps they
   describe all moved into Apps Script) and don't branch on `Mode` in
   Studio. The `FlowPrompts`-tab prompt-key row in `FlowBuildSpec` is
   explicitly the *alternative*, not the default.
5. **Model-setting guidance (temperature, token limits) is not prompt
   text.** It's easy to paste a sentence about settings directly into the
   prompt field by mistake — Gemini will receive it as literal instruction
   text, which reads as confusing rather than throwing an error. If Studio's
   "Ask Gemini" action doesn't expose a settings control, that's fine; leave
   it at default rather than fighting the UI for it.
6. **A `checkWarmUpFlowLiveness()` reading of `returnsSeen: 1,
   everReturned: true, consumed: 0` right after a harvest is very likely a
   benign timing gap, not a bug** — the harvest marks the return row
   `HARVESTED` and then separately consumes the matching input row; a check
   that lands between those two writes sees the first without the second.
   It resolved on its own within a couple of minutes both times it was seen
   this session. Confirmed by directly inspecting the `WarmUpFlowReturn`
   row's `HarvestStatus`/`Error` columns before concluding otherwise — do
   that first if it doesn't resolve on a re-check.
7. **A zip/archive transfer to an air-gapped machine can nest a folder.**
   "Download ZIP"-style exports commonly wrap the repo in a top-level folder
   named after the branch (e.g. `KOS-main`), so `C:\...\KOS\` and
   `C:\...\KOS\KOS-main\` both exist and only the second is the real repo
   root. Every path-not-found error this session traced back to standing one
   level too high. Confirm with a plain directory listing before assuming
   gitignored files (like `cas-ccps/clasp/local/*.clasp.json`, the real
   script IDs) failed to survive the transfer.
8. **A green "Run Completed" AND a schema-valid `GeminiFullOutput` still
   prove nothing about whether Gemini read the document it was given.**
   Found while porting kos-personal's own fix for this to cas-ccps: nothing
   in `harvestFlowInputResults()` checked the *content* of Flow 2's output
   before writing it into the student's own doc and generating
   `CompetencyEvidence` rows — only that it was non-empty. Closed by
   `_fiCheckPlausibility_` (`37_FlowInputBuilder.js`), which — because this
   system must never let Apps Script read the student's own text (see
   `docs/FERPA_DATA_MAP.md`'s `FlowInput` section) — checks the output for
   a self-reported non-access phrase and for engagement with the row's own
   rubric content instead of comparing against the student's Doc directly.
   A hit sets `ReadyStatus` to a new terminal `ERROR_SUSPECT_FABRICATION`
   before anything is written. Full writeup in `HISTORY.md`.
   **Follow-up:** Flows 3/4/5 (`41_WarmUpFlowBridge.js`) had the identical
   gap and now reuse this same check directly (`_wfbCheckPlausible_`,
   same GAS project — no FERPA workaround needed there, since
   `WQ25_RESPONSE_TEXT` is already a documented, retained field). See
   `HISTORY.md`'s own entry for that follow-up.

## What changed to get here

1. **Every flow is ported off the custom Studio steps.** A custom step is a
   Workspace Add-on and needs a standard, non-default Cloud project; GCP is
   disabled org-wide for this account, so all 8 cas-ccps steps and both
   kos-personal steps install without error and never appear in Studio's
   picker. The shape now is: Apps Script materializes one flat literal row →
   the Flow makes **one model call** with native steps → Apps Script
   harvests on a time trigger. `37_FlowInputBuilder.js` (Flow 2),
   `41_WarmUpFlowBridge.js` (Flows 3/4/5),
   `kos-personal/12_StudioReturnHarvest.gs` (both KOS flows).
2. **There is now a check for each of the four causes of "nothing
   happened"** — never built, trigger matches nothing, wrong columns, model
   call errored. Previously all four looked identical. The table in the
   section below is ordered so each one gets answered before the next
   question can confuse it.
3. **The Studio values to type are generated, not transcribed.**
   `syncFlowBuildSpec()` writes a `FlowBuildSpec` tab from the same
   constants the harvest reads. Build each Flow from that tab, not from a
   comment block — the comment blocks normalize em-dashes, which is how a
   marker copied from a note silently matched nothing.
4. **`meta/FLOW_DOCTRINE.md` exists**: seventeen rules (fifteen when this
   was written) with the incident behind each and an explicit note on
   whether anything enforces it. Read it before changing how a flow is
   built. Nine of the first fifteen are enforced by `gas-lint` Checks G-K
   and `doc-currency` Check 5; rule 16 partially, by drift tests, and rule
   17 not at all. Rule 15 is item 8 above,
   generalized: check groundedness at harvest, not just that the output
   parses.
5. **The docs were corrected** where they still described the blocked path
   as live or as merely unpushed. `doc-currency` Check 5 now errors on that
   class, so a document cannot regress to it quietly.
6. **Flows 2-5 were built in Studio and verified live**, closing the gap
   items 1-5 above only got partway to. Two real bugs surfaced doing it (the
   `everyMinutes(2)` trigger bug and Flow 2's missing `ReadyStatus` write),
   both fixed at the root cause rather than worked around — see "Lessons
   learned" above.
