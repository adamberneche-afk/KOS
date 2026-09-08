# Flow Doctrine

**What this is:** the rules for building a Flow in this repo, each with the
incident that produced it. Every rule is one paragraph and a pointer — the
reasoning stays with the code, because that is where someone changing the code
will read it.

**What this is not:** a copy of those file headers. This repo has already paid
for that mistake twice. The Studio step values lived in six documents in three
formats until `42_FlowBuildSpec.js` started generating the drift-prone half,
and `05_TeacherIntakePipeline.js`'s `RQ05` constant sat one column out of sync
with the array it described because it was a second copy of a fact. A rule
restated in two places becomes two rules.

**Why it exists.** `FLOW_INVENTORY.md` was created because "the audit that
named this gap found the same pattern independently discovered/half-fixed in
each system... with no single place listing all of them, and no shared
vocabulary for what 'healthy' even means." That is now true one level up: the
*practices* below were each discovered separately in `cas-ccps`,
`kos-personal` and `leader-hub`, and reconstructing them meant reading about
fifteen file headers. `FLOW_INVENTORY.md` answers *which flows exist and are
they healthy*. This answers *how you build one, and why these rules*.

**Enforcement is marked on every rule**, because the difference matters more
than the rule does. A practice that is only prose gets rediscovered; a
practice that is a check gets enforced. Of the rules below, the enforced ones
have survived contact with three systems. The prose-only ones — 8, 10, 11, 13,
14 and 15 — are the ones to distrust first.

That list started at eight. Rules 4, 5, 7, 9 and 12 came off it by becoming
`gas-lint` Checks H through K, and each of those checks found a live defect on
its first run: a flow with no liveness check, a fixture no consumer ever read,
and five test sandboxes narrower than the scope their code runs in. Every one
had survived several passes of reading the same files by hand. That is the
argument for the enforcement column, and the standing invitation to move
another rule out of the prose list.

---

## The shape

Every working flow in this repo now has the same three parts. It arrived
independently in each system before anyone named it, which is the usual sign
that it is the shape of the problem rather than a preference.

```
   Apps Script                    Workspace Flow              Apps Script
   ───────────                    ──────────────              ───────────
   materialize  ──────────────▶   read one flat row      ──▶  harvest
   a flat literal row             make the model call         apply the result
   on a time trigger              write to a return tab       on a time trigger
```

**Apps Script owns every lookup, every write, and all the state. The Flow
makes exactly one model call and nothing else.**

Worked examples, in order of how much they had to solve:
`cas-ccps/scripts/37_FlowInputBuilder.js` (Flow 2 — a whole per-teacher lookup
chain flattened), `cas-ccps/scripts/41_WarmUpFlowBridge.js` (Flows 3/4/5 —
three input tabs, one shared return tab),
`kos-personal/12_StudioReturnHarvest.gs` (the smallest — only the write-back
moved), `leader-hub/EmailBridge.gs` (the queue that was built this way from
the start).

---

## 1. The Flow makes the model call. Nothing else.

`cas-ccps` and `kos-personal` call this the Walled Garden;
`leader-hub/EmailBridge.gs:160` calls it the Bifurcation Boundary and states
the operational half: *"It never calls Gemini itself and never holds an API
key."* Same rule, three names.

This is not a stylistic preference. Every alternative — a custom Studio step,
an API key, Vertex — needs a standard Cloud project, and whether an account
can have one is a Workspace-admin decision nobody here controls.

**Enforced:** yes — `gas-lint` Check G, against
`tools/gas-lint/gcp-map.json`. An undeclared live GCP dependency is an error.

## 2. Declare a GCP dependency; never discover one.

A missing Cloud project does not fail a push. It makes the result do nothing:
the add-on installs, the step never appears in Studio's picker, no OAuth
prompt, no error. That is how all 8 steps in `cas-ccps/studio-steps/` (2,113
lines, written and unit-tested) turned out to be unreachable *after* being
pushed successfully.

**Enforced:** yes, on two sides now. Check G requires the code's dependency
to be declared; `doc-currency`'s Check 5 reads those declarations back and
errors when a declared behavior document names a `live-blocked` surface
without saying it is blocked or naming the fallback. Declaring a wall and
then leaving instructions that walk into it was the actual failure — every
function in those instructions existed. The doctrine, the four honest status
values, and the reasoning are in `gcp-map.json`'s own `_doctrine` block; the
per-surface `doc_tokens` are what Check 5 reads.

## 3. Do not assume an account boundary you have not seen.

`kos-personal` was read as safe because SMP-004 describes it as living on a
separate personal Google account, so the district's org-wide GCP block could
not reach it. It is deployed on the same `ccpsnet.net` account. A documented
account separation is a policy someone intends, not a fact about a deployment
— the same error as reading a consent screen as a standard project, one level
up. Nothing in this repo can observe which account a script runs on, so that
is the class of claim to confirm with the operator rather than derive.

**Enforced:** partly — the status is pinned by a test, and Check 5 now
catches the documentation half (a doc still describing the blocked path as
live), which is where this error survives longest after being corrected in
code. The reasoning itself cannot be checked. Recorded in `gcp-map.json`'s
`_doctrine`.

## 4. A green "Run Completed" over zero rows is indistinguishable from success.

A Workspace Flow whose trigger matched nothing reports exactly what a working
one reports. This is the single most expensive lesson in the repo's history —
a long stretch of a `cas-ccps` session went into debugging a flow that was
never matching a row.

So: **give every flow a fixture at its trigger condition, and read the fixture
back.** The read-back is the test, not the Flow's own run log.
`cas-ccps/scripts/39_FlowFixtures.js`, `leader-hub/FlowOps.gs`'s
`installAiFlowFixtures`, `kos-personal/12_StudioReturnHarvest.gs`'s
`installStudioFlowFixture`.

**Enforced:** partly, as of Checks I and J — every declared flow surface must
name a fixture (Check I), and some test outside `tests/tools/` must read that
fixture back (Check J). What the read-back *asserts* is not checkable. Before
those two, this rule was prose in seven documents and twelve code sites with
not one check behind it, which is how five of six fixtures came to be wrong at
once.

## 5. A fixture is only as good as the consumer that reads it.

Five of the six fixtures in this repo were checked against their consumers in
one pass, and **five had gaps** — every one a shape mismatch that produced no
error anywhere:

- `leader-hub`'s six AI payloads were invented (`{to, intent, tone}` for
  `EMAIL_COMPOSE`); not one of those keys exists. Each Flow would have
  triggered, read a payload with no recognized field, and produced confident
  nonsense.
- The warm-up profile carried `evaluation_signals` as plain strings where the
  archetype decision reads objects — so it rendered
  `"- : (strengths: None; gaps: None)"` into the prompt and exercised none of
  the decision table.
- Flow 4's fixture had no `Doc_ID`, so its materializer skipped it and the
  flow had nothing to latch onto while the fixture looked installed.
- `kos-personal` seeded one payload type of two, leaving the classification
  flow unexercised.
- Flow 2's fixture document lacked the `[CONFIG_ID:` footer, so Studio's
  Extract step had no end delimiter.

**Write fixtures from the consumer, not from your model of the producer.**
Where the consumer documents its own shape, derive from that document and test
the parity — `tests/leaderhub/flow-ops.test.js` re-reads all six
`*_FLOW_PROMPT.md` payload examples and demands key-for-key agreement in both
directions.

**Enforced:** partly, as of Check J — the test that reads a fixture back must
also drive one of that flow's own consumers (materialize, harvest, binding or
liveness), so the fixture is read by the code that has to read it in
production rather than only by assertions derived from the writer. The canary
deliberately does not count: it stubs the Flow and seeds its own row, so it
would satisfy the check without touching the fixture. Whether the assertions
are *good* is still judgement, and the leader-hub parity test remains the one
place a fixture's shape is checked against an authored document.

## 6. Never widen a sheet another file indexes by position.

`kos-personal/10_Turnstile.gs`'s header settled this first: an 8th
`STAGING_PIPELINE` column means touching every hardcoded 7-column
`getRange()` call across `2/3/9_*.gs`, so release timestamps live in
`PropertiesService` instead. `cas-ccps` reached the same conclusion
independently for `WarmUpQueue`, whose 21 columns are indexed by hardcoded
constants in Scripts 23, 24 and 25.

**Use a new tab.** Three input tabs plus a return tab carry everything Flows
3/4/5 needed without touching a sheet anyone else reads.

And when you must extend one: **append, never insert.** Appending is safe;
inserting shifts every later field silently.

**Enforced:** partly — `_pfCheckTab_` in
`cas-ccps/scripts/35_FlowPreflightAndCanary.js` verifies minimum widths, which
catches a *missing* column but not a shifted one.

## 7. Two column maps for the same sheet will drift. Derive from the writer.

`34_QueueWatchdog.js:166` states the habit that saved a wrong fix: *"derive
from the writer, verify against the constant."* It was written because
`RQ05` in `05_TeacherIntakePipeline.js` had drifted one column out of sync
with the `queueRow` array it describes — anything reading `row[RQ05.STATUS]`
would have compared a spreadsheet ID against `"PENDING_EXTRACTION"` forever
without erroring. It was dead code, so nothing broke; the watchdog derived its
own indices from the real `appendRow()` call instead.

The Central Ledger version of this cost a live session: a column shift made
`LEDGER.TEACHER_EMAIL` return a person's *name*, silently killing every
downstream lookup.

**Enforced:** yes, as of Check H — `gas-lint` compares declared duplicate
column maps for the same sheet and errors on disagreement. Before that, this
rule lived in exactly one comment.

The same failure shows up wherever two independent lists describe one set of
facts, not just sheet columns. `kos-personal/1_Config_And_Deploy.gs`'s
`setupAllTriggers()` and `teardownAllTriggers()` each kept their own copy of
every trigger handler this project manages — and both copies had already
drifted before anyone noticed: `setupAllTriggers()`'s list was missing
`harvestStudioReturns`, and `teardownAllTriggers()`'s separate list was
missing that one *and* `buildStudioInputRows`, so "tear down everything"
would have silently left triggers running after an operator believed the
teardown was complete. Fixed the same way as rule 7 itself: one
`KOS_TRIGGER_HANDLERS` list, both functions read it, nothing left to drift.
Check H only watches declared column maps — this shape of drift outside
that scope is still something a human has to notice, same as before Check H
existed for columns at all.

## 8. Load-bearing strings are referenced, never retyped.

`evaluateWarmUpDoc_` finds a student's response by `indexOf` on
`RESPONSE_ZONE_MARKER`. `41_WarmUpFlowBridge.js`'s document builder stamps
*that same constant*, not an equal string, and a test asserts they are the
same constant rather than two strings that happen to match.

The cost of the alternative is documented at
`15b_StudioFlowPrompts_Flow2_Revised.js:222`: that comment block normalizes
em-dashes to `--`, so an operator copying the marker from the note types
hyphens into Studio's Extract step, which matches nothing and returns empty.
The note now says outright to copy from the code.

**Enforced:** no.

## 9. Separate the four causes of "nothing happened".

"Nothing came back" is one answer covering four causes: the Flow was never
built, its trigger matches no rows, it writes to the wrong columns, or the
model call errored. The third looks exactly like the first.

Each cause needs its own check, and each system now has all four:

| Question | cas-ccps | leader-hub | kos-personal |
|---|---|---|---|
| Is the structure sound? | `runFlowPreflightCheck()` | `runLeaderHubPreflight()` | `runKosPersonalPreflight()` |
| Does the script half work? | `runFlow2Canary()`, `runWarmUpFlowCanary()` | `runAiFlowCanary()` | `runStudioReturnCanary()` |
| Are the columns bound right? | `checkFlowBinding()`, `checkFlow2Binding()` | `checkAiFlowBinding()` | `checkStudioFlowBinding()` |
| Has a Flow ever answered? | `checkWarmUpFlowLiveness()` | `checkAiFlowFixtures()` | `checkStudioFlowLiveness()` |

**Enforced:** partly — Check I verifies each declared flow surface has these
functions, and warns when a role is missing without a declared reason. Whether
they *say anything useful* is not checkable. It found its first gap on its
first run: Flow 2 had a preflight, a canary and a binding probe, but nothing
answering "has a Flow ever answered?" — hence `checkFlow2Liveness()`.

Filling in kos-personal's own "—" (`runKosPersonalPreflight()`,
`15_Preflight.gs`) surfaced a smaller version of rule 7's lesson, applied to
the preflight check itself: cas-ccps's `runFlowPreflightCheck()` verifies
trigger installation with one hand-written `_pfCheckTrigger_()` call per
trigger, hand-copying the trigger name each time. kos-personal's version
instead loops `KOS_TRIGGER_HANDLERS` — the one list rule 7's addendum above
describes fixing — so adding a fifteenth trigger to that project means
adding it in one place, not two (the trigger installer) plus a third
(the preflight check). cas-ccps's preflight could do the same the day it
has one canonical trigger-handler list to loop instead of four separate
`ScriptApp.newTrigger()` call sites to enumerate by hand; nothing has built
that list yet. leader-hub's preflight has no trigger check at all, correctly
— its Flows read `AI_Queue` via Studio's own trigger, not a time-driven
Apps Script poll, so there is no installed-trigger set to verify.

## 10. A canary stubs what you do not control, and says so.

Every canary here verifies the Apps Script half with the Flow deliberately
stubbed, and states in its own log that a pass says nothing about whether any
Flow exists. That honesty is the point: a canary that quietly implied
end-to-end health would be worse than none, because it would be believed.

**Enforced:** no.

## 11. Do not re-transcribe an authored document into a generated one.

`42_FlowBuildSpec.js` emits every tab, column number, header, trigger
condition and ownership rule — the drift-prone facts, derived from the
constants the code reads. It deliberately omits connector names, temperature
and token limits: those need judgement, they do not drift, and copying them
would make the generated sheet a seventh document to keep in sync.

Where a pointer to an authored document has gone stale, the generated artifact
*says so* — which is the one thing it can do that the document cannot.

**Enforced:** no, but `checkFlowBuildSpec()` reports when the derived half has
drifted from the code.

## 12. Test in the production scope.

`installFlow2Fixture()`'s `PROMPT_TEXT` was arriving empty and the tests were
green, because the test file loaded neither `15b` (which holds
`FLOW_2_SYSTEM_PROMPT`) nor `40` (`substituteFlowPrompt_`), and
`_fiBuildPromptText_` returns `""` rather than throwing when they are out of
scope. The fixture was being exercised in a narrower scope than production.

**A sandbox that loads fewer files than the GAS project does is testing a
different program.** `project-map.json` is the authority on what a project
contains; load that set.

**Enforced:** yes, as of Check K, with one deliberate narrowing. Requiring the
*whole* project set would fail every unit test in the repo, most of which load
two or three files on purpose and correctly. What Check K requires is that the
part you actually drive be closed: a name that code reachable from the
sandbox's own exposed entry points needs, declared in a file the sandbox did
not load, is an error. Without that reachability filter the same analysis
reports every collaborator of every loaded file — nine findings on one fixture
test, none of them exercised — and gets muted within a week.

It found five more of this shape on its first run, one of them worse than the
original: `runLeaderHubConnectionCheck()`'s three data checks were failing on
a `ReferenceError` while the test asserted they fail on empty tabs. The right
verdict from the wrong program, which is the failure mode this rule names.

## 13. Refuse to claim what you cannot know.

`runLeaderHubConnectionCheck()` diagnoses three of the four causes of a broken
D1 connection and states plainly that it cannot check the fourth — nothing in
the script can see what `/exec` URL leader-hub has stored, and a redeploy
issues a new one. A test asserts that no check even *implies* the URL was
verified, because a green report while leader-hub calls a dead URL is the
worst outcome a diagnostic can produce.

Same rule as 10, at the level of the whole report rather than one canary.

**Enforced:** no.

## 14. Verify a compound trigger condition's more restrictive half in isolation, before adding the second.

kos-personal's Curator flow build (`CHANGELOG.md` Round 17) hit a compound
`Status = STUDIO_ACTIVE AND Payload_Type in (...)` trigger where a test run
reported "Found 7 rows matching conditions" against a sheet with only one row
that should have qualified — `Payload_Type` alone was doing all the
filtering, and `Status` either wasn't wired or wasn't taking effect. Nothing
distinguishes a correctly-built compound condition from this one until the
matched-row count is checked, and a wrong count that happens to land on a
plausible small number (not zero, not obviously everything) reads as
success.

**Build the more restrictive half alone first, confirm its matched-row count
against how many rows should genuinely qualify, then add the second
condition on top.** This is not a kos-personal-specific risk: leader-hub's
six Flows (`LEADERHUB_AI_FLOW_SETUP.md`) use the identical shape (`Status =
PENDING AND Type = <job type>`) with no such caution anywhere in that
document. It is a hazard of the AND-compound-condition shape itself,
wherever it gets built — cas-ccps's own flows happen not to carry it only
because their post-redesign triggers are single-condition by construction
(materialization pre-filters everything before the row ever reaches
STAGING_PIPELINE/WarmUpQueue), not because anyone applied this discipline
there.

**Enforced:** no. Nothing in this repo can observe how an operator builds a
condition inside Studio's own UI; this is process discipline, written down
once so it generalizes rather than being rediscovered per system, per the
standing invitation in this document's own intro.

## 15. A green harvest can still be a fabrication. Check groundedness, not just structure.

Rule 9's four checks can all pass on the single most dangerous case: the
trigger matched, the columns are bound right, the Flow answered, and the
answer is still wrong — because the model never actually engaged the
content it was supposed to read. That is exactly what Round 17's incident
was (kos-personal, `CHANGELOG.md`): Studio's own "Get document" step
silently failed, and Gemini returned confident, well-formed JSON anyway.
Every structural check available at the time would have called that a
success, because structurally it was one.

**Check whether the model's own output shares content that could only come
from having actually read the input — not just that its shape parses.** The
pattern that generalized across every flow surface in this repo: extract a
handful of "distinguishing words" from the real source content (long enough
and rare enough that they would not appear by chance — ≥6 characters,
stopword-filtered, longest first), and confirm at least one of them shows up
in the model's output; separately, scan the output itself for a small static
list of "I could not access…"-shaped phrases a model uses to self-report
this exact failure. Either miss is a fabrication signal, and neither is a
structural one — a flow can fail this check while passing every check rule 9
names.

Discovered once and then independently required by every flow surface in
this repo, each adapted to its own FERPA/architecture constraints rather
than copied verbatim:

- `kos-personal/12_StudioReturnHarvest.gs`'s `_srCheckGroundedness_` — no
  FERPA boundary on this content, so it checks directly against the source
  document's own text.
- `cas-ccps/scripts/37_FlowInputBuilder.js`'s `_fiCheckPlausibility_` —
  Flow 2's FERPA boundary means the student's own submitted text must never
  reach Apps Script (`{{STUDENT_TEXT}}` stays unsubstituted), so this checks
  against rubric/config metadata instead.
- `cas-ccps/scripts/41_WarmUpFlowBridge.js`'s `_wfbCheckPlausible_` — Flows
  3/4/5's response text is already a documented, retained field with no such
  boundary, so this checks directly against it; reuses Flow 2's own
  word-extraction helper and non-access phrase list directly rather than
  redeclaring them, since both files share one GAS project (rule 8's
  reasoning, applied to a helper function instead of a string constant).
- `leader-hub/EmailBridge.gs`'s `_checkAiResultPlausible_` — no boundary at
  all, since Apps Script wrote the whole payload itself before ever queuing
  the job, so this checks against the full payload.

**Enforced:** no. Each implementation has its own unit and integration
tests, but nothing checks that a flow surface *has* this role the way Check
I requires materialize/harvest/canary/binding/liveness to exist —
`flow-map.json`'s `flowSurfaces` schema has no field for it yet. A declared
surface with no groundedness check today reads identically to one that was
never designed to need one.

---

## 16. A Flow's prompt has exactly one canonical source. The deployed constant is generated, never hand-edited.

Rule 11 already says a generated artifact must not be re-transcribed by
hand. This is the same rule applied to prompt text specifically, because a
prompt has a failure mode the other generated artifacts in this repo don't:
it's tempting, and structurally easy, to hotfix it directly in the deployed
constant — no schema to violate, no test obviously in the way, just a string
that reads better after the edit. That edit never went through the same
gate every other code change does: nothing ran it past the tests, nothing
confirms it didn't quietly break a downstream expectation (a placeholder
token, a JSON-only instruction, a rule a later section of the same prompt
depends on). `cas-ccps/scripts/40_FlowPrompts.js`'s own header used to
invite exactly this ("change it HERE and let the test tell you the spec doc
now disagrees") before this rule existed — read today, that sentence
describes the failure mode, not a sanctioned shortcut. A hotfix's fidelity
can't be verified after the fact the way a normal change can; the fix for a
real improvement found via hotfix is to port it into the canonical source
and let it flow through the normal path, not to leave the hotfix standing.

**The canonical source is the authored document a human reads and edits;
the deployed constant is a generated mirror of it, produced by a script, not
by hand:**

- `kos-personal/CURATOR_PROMPT.md` / `VECTOR_CLASSIFY_PROMPT.md` →
  `tools/kos-personal/generate-flow-prompts.js` → `16_FlowPrompts.gs`'s
  `CURATOR_SYSTEM_PROMPT` / `VECTOR_CLASSIFY_SYSTEM_PROMPT`.
- `cas-ccps/docs/CAS_Flow3_Flow4_Specification.html` +
  `cas-ccps/scripts/15_StudioFlowPrompts.js` →
  `tools/cas-ccps/generate-flow-prompts.js` → `40_FlowPrompts.js`'s five
  `FLOW_*_PROMPT` constants (Flow 2's `FLOW_2_SYSTEM_PROMPT` is a
  standing exception — `15b_StudioFlowPrompts_Flow2_Revised.js` is itself
  the deployed file, one level removed from the html/`15_` split the other
  four went through).
- `leader-hub/*_FLOW_PROMPT.md` → `tools/leader-hub/generate-ai-prompts.js`
  → `AiPrompts.gs`'s six `AI_PROMPT_*` constants.

Each generator does a targeted in-place replacement of only the prompt
constant(s) — never a full-file rewrite — so the surrounding sync/check/
substitution logic in `16_FlowPrompts.gs`/`40_FlowPrompts.js`/`AiPrompts.gs`
is untouched by construction, not by care taken while editing.

**Enforced: partially.** Each system's own drift test
(`tests/kos-personal/flow-prompts.test.js`,
`tests/cas-ccps/flow-prompts.test.js`, `tests/leaderhub/ai-prompts.test.js`)
re-derives the constant from its canonical source at test time and fails on
any mismatch — so a canonical source edited without regenerating the
constant (or vice versa) is caught by `npm test`. What isn't enforced: a
disciplined hand-edit of *both* the source and the constant, together, in
the same commit, would still pass every test while having skipped the
generator entirely — the tests confirm the two agree, not that a generator
produced the agreement.

---

## Adding a flow

1. Decide what the Flow may do: make one model call. Anything else moves into
   Apps Script (rule 1).
2. If it appears to need a key or a custom step, stop and check the target
   account's Project Settings, then declare it in `gcp-map.json` (rules 2, 3).
3. Materialize its inputs into a flat literal row on a new tab — never new
   columns on an existing one (rule 6).
4. Give it a harvest on its own time trigger. No polling: `pollForFlow4Result_`
   in `25_WarmUpWriter.js` is kept as dead code with a note explaining that
   twelve 15-second sleeps is three minutes of wall clock per row.
5. Write a fixture from the consumer's shape, and a test that drives the
   fixture *through* the consumer (rules 4, 5) — Check J requires exactly
   that, and Check K requires the test's sandbox to load the scope the code
   runs in (rule 12).
6. Add the four checks (rule 9), and register the surface in
   `tools/gas-lint/flow-map.json` so Check I holds you to it. Register its
   column map there too, if a second file declares one for the same sheet, so
   Check H holds you to that (rule 7).
7. Re-run `syncFlowBuildSpec()` and build the Studio side from that tab, with
   the binding probe open (rule 11).
8. Building the trigger itself: if the condition is a compound AND, wire and
   test the more restrictive half alone first — confirm its matched-row
   count before adding the second condition on top (rule 14).
9. At harvest, check groundedness — not just that the output parses, but
   that it shares distinguishing content with what the model was actually
   given, adapted to whatever FERPA/architecture boundary this flow's own
   input carries (rule 15).
