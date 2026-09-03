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
have survived contact with three systems. The prose-only ones — 8, 10, 11 and
13 — are the ones to distrust first.

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

**Enforced:** yes — Check G. The doctrine, the four honest status values, and
the reasoning are in `gcp-map.json`'s own `_doctrine` block.

## 3. Do not assume an account boundary you have not seen.

`kos-personal` was read as safe because SMP-004 describes it as living on a
separate personal Google account, so the district's org-wide GCP block could
not reach it. It is deployed on the same `ccpsnet.net` account. A documented
account separation is a policy someone intends, not a fact about a deployment
— the same error as reading a consent screen as a standard project, one level
up. Nothing in this repo can observe which account a script runs on, so that
is the class of claim to confirm with the operator rather than derive.

**Enforced:** partly — the status is pinned by a test, but the reasoning
cannot be checked. Recorded in `gcp-map.json`'s `_doctrine`.

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
| Is the structure sound? | `runFlowPreflightCheck()` | `runLeaderHubPreflight()` | — |
| Does the script half work? | `runFlow2Canary()`, `runWarmUpFlowCanary()` | `runAiFlowCanary()` | `runStudioReturnCanary()` |
| Are the columns bound right? | `checkFlowBinding()`, `checkFlow2Binding()` | `checkAiFlowBinding()` | `checkStudioFlowBinding()` |
| Has a Flow ever answered? | `checkWarmUpFlowLiveness()` | `checkAiFlowFixtures()` | `checkStudioFlowLiveness()` |

**Enforced:** partly — Check I verifies each declared flow surface has these
functions, and warns when a role is missing without a declared reason. Whether
they *say anything useful* is not checkable. It found its first gap on its
first run: Flow 2 had a preflight, a canary and a binding probe, but nothing
answering "has a Flow ever answered?" — hence `checkFlow2Liveness()`.

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
