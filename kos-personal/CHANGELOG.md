# KOS Changelog

<!-- archive:pointer (tools/archive/file.js writes this) -->
**Entries before 2026-10-29** are archived word for word by school quarter: [2026-27, 1st quarter](../archive/2026-27-Q1/kos-personal/CHANGELOG.md).
This file holds the current plan of record's era; `node tools/archive/search.js --entries`
searches the archived ones entry by entry.
<!-- /archive:pointer -->

### KOS_GEMINI_BRIEF (2026-11-22)

The operator's Gemini harness (G1 in the November plan) showed significant
truncation somewhere, and its `start` read seven live docs (~43,000
characters) to quote about a dozen lines. `28_GeminiBrief.gs` writes those
lines, copied as written from the primer's blocks and the open decisions,
into one short stable doc with the primer run, under a 4,000-character
budget. Three plain words picked once a day sit at its start, middle and
end, and it ends with an END line: a harness that repeats all three read
the whole of today's brief, which tells a doc read in part from one not
read at all. Started narrow at the operator's word; end lines on the other
live docs and the ingestion alarms wait for the first tests.

### No onboarding line once closed out (2026-11-22)

The primer read "Onboarding Day 21 of 21" for over a month because
`closeOutOnboarding()` was never run (L15, from the operator's 11-16 note
to the RTP). The operator chose to drop the line once onboarding is
closed, not replace it: `_onboardingStatusLine_` (5) is now empty after
the close-out, and the primer and the session context block leave it out.

### The deploy-version report checks its permissions (2026-11-21)

Structure audit 3.8. `17_DeployVersionReport.gs` now holds the one
deploy-version report block that cas-ccps and LeaderHub also carry, copied
from `shared/deploy-report/deploy-version-report.js` by
`tools/flow-harness-sync/sync-deploy-report.js`; `reportDeployVersion()`
calls `_reportDeployVersion_('kos-personal', KOS_DEPLOY_VERSION_SHA)`. What
it sends is unchanged. New here: before reporting it tries each scope the
manifest lists, and after reporting it throws when one isn't granted, so
the 6-hour trigger's failure email names it (cas-ccps has done this since
2026-11-19, when the Student Dashboard's Slides scope was listed but never
granted). Takes effect at the next push.

### The guides' history banners moved here (2026-11-21)

Structure audit 4.11: `DEPLOYMENT_GUIDE.md` started its first section at line
183 and `STUDIO_INTEGRATION_SPEC.md` at 186, behind dated banners. Each keeps
its current-status note (and the guide its pitfall before a `clasp push`); the
history moved here word for word.

**From `DEPLOYMENT_GUIDE.md`:**

#### History: SUPERSEDED IN PART (2026-09-21): both Curator Flow Gemini steps were bound to the wrong prompt

**Closed 2026-09-29 (see the current status above); its diagnosis was
wrong.** The
2026-09-08 banner is accurate about what it claims — both Flows were built,
and they do write back — but "verified end to end" has not held since. A
live export taken 2026-09-20 shows 114 of 233 `STUDIO_RETURN` rows failing
at harvest and 55 `AUDIT_LOG` rejections, all from one cause: the Curator
step and the Auditor step are bound to `rtp-core-router/PERSONA_*_V5_1.md`,
the interactive chat personas, rather than to `CURATOR_PROMPT.md` /
`CURATOR_AUDITOR_PROMPT.md`. The personas require the preamble, the
populated `vector_weights` and the prose report that the contracts forbid,
so the harvest cannot parse the Auditor and the audit gate correctly
rejects the Curator.

Nothing downstream was broken. That handoff has the evidence.

#### History: ✅ STATUS (2026-09-08): BOTH STUDIO FLOWS BUILT AND VERIFIED END TO END — the second attempt succeeded

Phases 1-3 and 5-10 of this guide were done as of 2026-09-05: the project
already existed (a real `scriptId` in `.clasp.json` from an earlier
partial attempt, same pattern leader-hub turned out to have — check
there before assuming Phase 1's browser-based project creation is
actually needed), 13 files pushed via `clasp push`, two fresh Web App
deployments created, `KOS_ADMIN_EMAIL` set, all 14 triggers confirmed
installed and several already firing cleanly, and a real Phase 10 Ingest
test correctly advanced through `PENDING_FLOW` → `STUDIO_ACTIVE`. If a
fresh session is picking this up, re-run this phase's checks rather than
trusting this paragraph — it's a snapshot, not a live status.

**What actually happened next: the Curator flow's first-ever Studio
build surfaced a real incident (Round 17, `CHANGELOG.md`) — wrong
trigger scope, and Studio proceeding with a "Workspace sources is turned
off" warning instead of reading the source document, so Gemini returned
fabricated output that looked plausible but wasn't grounded in
anything.** That output was deleted before `harvestStudioReturns()`
could overwrite the real document body with it, and the build was
paused rather than patched around. **This is the one and only Studio
build attempt this project has ever had.** Since then, the Flow was
never rebuilt in Studio — every session since has been rework on the
Apps Script side, described below, in preparation for a second attempt.
A fresh session opening this guide today is looking at a system that is
structurally ready but has **zero hours of real Studio runtime**.

**What changed since Round 17, closing the actual gap the incident
exposed rather than just adding a smoke test on top of it:**
`13_StudioInputBuilder.gs` now reads the source document itself, in
Apps Script, *before* Studio ever runs — the live "Get document" step
that failed silently in Round 17 no longer exists in either Flow at
all. `14_StudioFlowBuildSpec.gs` generates the exact tab names, column
numbers, headers and trigger conditions to build from
(`syncStudioFlowBuildSpec()`), derived from the same constants the code
reads, so there is nothing left to hand-transcribe from prose.
`15_Preflight.gs` (`runKosPersonalPreflight()`) checks tab widths,
trigger completeness and required script properties in one pass — run
it first, before touching Studio at all. The groundedness gate
(`_srCheckGroundedness_`, `harvestStudioReturns()`) is still there, but
is now genuinely defense-in-depth rather than the only thing standing
between a silent failure and a corrupted document — see
`STUDIO_INTEGRATION_SPEC.md`'s banner for the full current build
shape and why rule 14 (`meta/FLOW_DOCTRINE.md`) no longer applies to
this Flow's trigger.

**Second-attempt build order, in full:**
1. `runKosPersonalPreflight()` — confirm the structure is sound before
   touching Studio at all.
2. `syncStudioFlowBuildSpec()` — writes the `FlowBuildSpec` tab; build
   both Flows from that tab, not from this document or
   `STUDIO_INTEGRATION_SPEC.md`'s prose (generated beats hand-copied —
   `meta/FLOW_DOCTRINE.md` rule 11).
   Read `STUDIO_INTEGRATION_SPEC.md`'s banner in full first — the
   trigger is now a **single condition** (`Status = READY` on
   `CuratorInput`/`VectorClassifyInput`), there is nothing to combine it
   with, and the whole "verify the more restrictive half in isolation"
   caution from Round 17 no longer applies to this design.
3. `syncFlowPrompts()` (`16_FlowPrompts.gs`) — writes the `FlowPrompts`
   tab: `CURATOR_SYSTEM_PROMPT`/`VECTOR_CLASSIFY_SYSTEM_PROMPT`/
   `CURATOR_AUDITOR_SYSTEM_PROMPT`, generated from `CURATOR_PROMPT.md`/
   `VECTOR_CLASSIFY_PROMPT.md`/`CURATOR_AUDITOR_PROMPT.md` by
   `tools/kos-personal/generate-flow-prompts.js` — not required, but
   lets each Flow's Gemini step pull its system prompt in via a chip
   (a Sheets lookup step filtered on `PromptName`, then that step's
   output chip immediately followed by `@trigger.SourceText`, nothing
   typed in between for the Curator/Classify prompts; the Auditor prompt
   needs one typed label between two chips instead, since it has two
   variables — see `STUDIO_INTEGRATION_SPEC.md`'s banner) instead of a
   hand-pasted block. Never hand-edit this tab or `16_FlowPrompts.gs`'s
   constants directly — edit the `.md` file, re-run the generator, push,
   re-run `syncFlowPrompts()`. `tests/kos-personal/flow-prompts.test.js`
   fails `npm test` the moment
   a `.md` file and the generated constant disagree.
4. Verify the materialize half: `runStudioInputCanary()`,
   `checkStudioInputBuilder()`.
5. Wire the Flow's last step with `checkStudioFlowBinding()` open in a
   second tab, then verify the harvest half:
   `runStudioReturnCanary()`, `checkStudioFlowLiveness()`.
6. Watch `checkStudioReturns()`'s `suspectFabrication` count once the
   Flow is live — a non-zero count now means look at the Flow's own
   output quality, not the harvest logic, since the live-read failure
   mode Round 17 hit is structurally closed.

Nothing here can do the actual Studio build — SMP-004: only the
operator's own authenticated Studio session can. This paragraph is the
map; the checks above are the ground truth once you're in Studio.

**A pre-existing project is not automatically a live-in-use one — verify
before trusting the label.** `clasp deployments` showed an old deployment
literally named "V5.4 Core Router Initial Deployment" here, which reads
like a live-migration red flag per this guide's own "Migrating from
v5.4" section. Opening the actual web app resolved it in under a
minute: it showed v8.0's own already-bootstrapped UI (not the "Build My
Studio" screen), with a "Not started" status and an empty session log —
meaning a prior session got through Bootstrap under v8.0 itself and
never used it, and the "V5.4" label was older, unrelated history. Don't
skip this check on a system with any ambiguous deployment history, but
also don't let it block progress once actually checked.

**The second attempt happened, and it worked (2026-09-08).** Both Flows
were built in Studio from `FlowBuildSpec`/`FlowPrompts` per the build
order above. Socratic Onboarding was completed via the Web App's "Arm
Engine" modal (`completeOnboarding()`, 5_Error_And_Utilities.gs — the
legacy `runSocraticOnboarding()` wizard does not work on this standalone
project; use the modal), clearing `COLD_ENGINE_TIER_2` and unblocking
`processInferenceQueue()`. `installStudioFlowFixture()` +
`checkStudioFlowBinding()`/`checkStudioFlowLiveness()`/
`checkStudioReturns()` confirmed both Flows genuinely wrote back
(`HARVESTED`, real Auditor `PASSED` sign-off on the Curator side, real
per-sentence scores on the Classification side) — and, past that, real
data landed in both final destination sheets: a genuine `SESSION_LOG`
row with the Curator's actual summary, and a `VECTOR_MATRIX` row whose
hand-checked aggregation matched `dumpVectorState()` exactly.

**Verifying that last step surfaced two real bugs, both fixed and
tested (CHANGELOG.md Round 22):** `processIntakePayload()` used to call
the Vector Router unconditionally, writing a phantom `VECTOR_MATRIX` row
(and, on a matrix with real history, silently decaying it) for every
Curator-only session — now gated on `vector_weights` actually being an
object. And `processInferenceQueue()` used to re-read a row's source doc
directly, which a *different* row sharing that same `File_ID` (by
design — see `installStudioFlowFixture()`'s header) can silently
overwrite between harvest and processing; it now reads the row's own
`STUDIO_RETURN` entry instead, which no other row's harvest can touch.

**From `STUDIO_INTEGRATION_SPEC.md`:**

**✅ STATUS (2026-09-08): both Flows built from this spec and verified
end to end** — real Studio returns, real `SESSION_LOG`/`VECTOR_MATRIX`
data, both confirmed against the same fixture. See `DEPLOYMENT_GUIDE.md`'s
status banner and `CHANGELOG.md` Rounds 21-22 for the full account,
including two real bugs the verification itself surfaced and fixed.

**Why this changed.** CHANGELOG.md's Round 17 incident was Studio's own
Docs-read step silently failing ("Workspace sources is turned off...
sent without file references from variables") while Gemini still
returned well-formed, schema-valid output — nothing before that
incident could tell the difference from a real answer. The groundedness
gate (below) was built to catch that after the fact. This closes the
same gap a level earlier: with no live Docs-read step left in Studio at
all, for either flow, that specific failure mode cannot occur
structurally — the same reason it already can't for cas-ccps's Flows
3/4/5 or any of leader-hub's six flows (none of them have a live
in-Studio document read either).


**What this means for Round 17's other two open questions.** Its
"verify `Status` alone before adding `Payload_Type`" lesson is now
structural, not a build-order caution to remember — there is nothing to
combine. Its "try an Ask a Gem step" hypothesis, to sidestep the
Workspace-sources issue, is now optional rather than the working
hypothesis for closing a still-open risk: a plain "Ask Gemini" step has
nothing left to lose live document access to, since `SourceText` is
already a plain string on the trigger row. Still worth trying if this
account's Studio offers it and quality improves, just not load-bearing
for correctness the way it looked in Round 17.


### The managed inference service archived (2026-11-17)

Clean-up C3, approved by the operator 2026-11-17. `inference-service/`
moved to `archive/inference-service/`: dormant since D16 (2026-11-01), its
Cloud Run deploy needs Google Cloud, off for the district, and
`INFERENCE_MODE` stays `STUDIO`. Its CI job and Dependabot entry are gone,
`tools/kos-personal/generate-flow-prompts.js` no longer writes its copy of
the VECTOR_CLASSIFY prompt, and gas-lint's GCP map no longer declares it.
No `.gs` file changed: the `MANAGED_SERVICE` switch is still there and now
has nothing to call.

### The RTP's harness notes, in its instructions (2026-11-15)

The "RTP harness notes" in `meta/PLAN_2026-11.md`, turned into changes to
`claude-project/` (approved by the operator 2026-11-15). The instructions
now say that directed writes (SMP-018) are `DECISION_REGISTER` and
`SMP_REGISTER` rows made with the Google Sheets connector, that the Drive
connector is read-only, and that a failed write is reported as its
connector and error; that an SMP number is read from the register doc
each time, never recalled (`[UNCONFIRMED — KOS_SMP_REGISTER]` when it
can't be opened); and that a claim about how code or a pipeline behaves
is `[UNCONFIRMED — repo]` unless a doc states it. New knowledge file
`claude-project/FLOWS_BRIEFING.md`: what each pipeline behind the RTP's
signals is for, hand-written from the code, with
`tests/kos-personal/flows-briefing.test.js` failing when a file or
function it names goes away. The operator re-pastes the instructions and
uploads the file.

### Web-app logs count toward moral debt (2026-11-08)

A session log pasted into the web app's Ingest tab (`submitSessionLog`)
was queued and drawn for the fidelity sample, but never reached
`recordMoralDebt_`, so its PROCEED answers went uncounted (SMP-019), and
it skipped the hardening audit. Both entry points now call one function
after the duplicate guard, `_afterSessionLogQueued_` (2): the hardening
audit, the moral debt counter and the fidelity draw. Logs already
submitted through the web app are not recounted.

### Decision echoes held back; Deploy_Trigger one row at a time (2026-11-08)

Plan items L2 and L8 (`meta/PLAN_2026-11.md`). A re-sent or back-filled
session used to record its deferred decisions again as new OPEN rows,
often reworded or with a trailing period. `_recordDeferredDecisions_` (22)
now holds back a decision that repeats a `DECISION_REGISTER` row of any
status (its Blocking cites that row's ID, or its normalized text is the
same, contains the other, or has word-set Dice ≥ 0.85 with the same
numbers) and writes it to `DECISION_ECHOES`; the primer and
`KOS_OPEN_DECISIONS` count those rows. And `onGovernanceEdit` (6) no
longer acts on the top row of a paste over several Deploy_Trigger boxes:
a multi-cell edit deploys nothing and unticks them, with a toast.

### Closeout fidelity, randomized (2026-11-07)

A session log is the RTP's own summary, and the raw copy ingestion keeps is
the same text, so nothing checked a log against what was actually said. The
operator decided two checks: Claude Code checks every closeout against its
own exchanges (CLAUDE.md), and Apps Script draws a random 10% of logs at
ingestion (`27_FidelitySample.gs`), after the RTP wrote them, and asks the
operator for those sessions' full chats, which Claude Code compares. Apps
Script keeps the audit (`FIDELITY_AUDIT`) and a daily primer line: drawn,
compared, waiting on whom, overdue, and the observed rate against the
configured one (`FIDELITY_SAMPLE_RATE`).

Found while building it, not changed: a log submitted through the web app
(`submitSessionLog`) never adds its PROCEED answers to the moral debt
counter; only folder-scanned logs do.

### Where the record holds named people: listPersonalItems (2026-11-02)

`listPersonalItems()` (25) lists every item the Vector Item Labeler marked
PERSONAL, with where it lives: `ACTION_REGISTER` or `DECISION_REGISTER` and
its row, or the lessons doc's session heading. It is the list the 10-19
decision ("existing student data in KOS to be scrubbed") needs, made by the
labeler rather than a name pattern (which matched 179 of 453 items). It
reads only; the operator decides what to remove.

### A named person never becomes a standard (2026-11-02)

The live record the Vector Item Labeler reads holds student names, one with
a note about a student's anxiety, and items about the operator's home and
family. Nothing said what the labeler should do with them, so a lesson
naming a student could have been labelled PRINCIPLE and copied into a
`VECTOR_*` doc that goes to Gemini with every curriculum draft. The
operator turned the flow off before it labelled anything.

- **PERSONAL**, a new kind and the labeler's first rule: an item that names
  a person, or is about private life, is PERSONAL even when it also states
  a principle. PERSONAL is never a standard.
- **A review list, not a filter.** A name pattern run over the live record
  matched 179 of 453 items, nearly all tools and protocols ("Apps Script",
  "Seven Bridges"), so it can't decide alone. `checkVectorDocs` lists the
  compiled items with a possible name, for the operator to read once; one
  that names a person gets Kind PERSONAL in `VECTOR_ITEM_LABELS` by hand.

### The Registrar's flows built and verified; a fixture the grounding check reads (2026-11-02)

The operator built both Registrar flows in Studio on 11-02 and ran the
fixture through them: answered at each stage, both returns `HARVESTED`,
the ledger row `COMPLETELY_ROUTED`, `checkRegistrarFlowBinding` ok. An
earlier fixture, planted on 11-01 before the flows existed, was released
four times and stopped at `CRITICAL_FAILURE`, so the stale reset and the
retry limit are verified too.

The run left one gap. Stage 1 answered with the schema's empty defaults,
nothing from the draft, and the fixture's draft was shorter than
`SR_GROUNDEDNESS_MIN_CHARS`, so the groundedness check was skipped and an
answer that never saw the draft could not be told from one that read it.
The fixture's draft (`RG_FIXTURE_DRAFT`) is longer now and carries what the
Stage 1 schema should pick up (a lesson code, the Workspace tools, three
timed parts), so the check runs on it: the 11-02 answer would bounce as
`NOT_GROUNDED`, and an answer that read the draft passes. A test holds both.

Found on the same run: Stage 2 said "no vector documents exist yet". The
four `VECTOR_*` docs in `05_Vector_Repository` exist, but they are the
templates setup made on 2026-05-18, never filled in, and nothing writes to
them since the classify flow replaced the inference path that did
(`_routeToVectorDocs` is only called from `_routeVectorWeightsInternal`).
Stage 2 scores every draft 0.0 until they say something.

**The fix, `25_VectorDocs.gs`, in two halves.** A first version gave each
session's items to every theme `VECTOR_MATRIX` scored the session for; run
against the live record it put a classroom layout under ARCHITECTURE and a
food-drive flyer under UI, listed open questions as decisions, and lost
whole sections to truncation. So:

- **KOS - Vector Item Labeler**, a third Studio flow, labels every recorded
  item (settled decisions with the operator's note, session decisions,
  lessons, open decisions) with one theme and one kind (PRINCIPLE,
  CONSTRAINT, OPEN_QUESTION, HOUSEKEEPING, STALE, OTHER), by item ID only:
  it writes no text. `runVectorItemLabeler` (hourly) batches unlabelled
  items, 40 to a row; the harvest accepts only IDs from the row's own batch
  with a known theme and kind; an item sent three times with no label is
  marked UNLABELED for the operator. A label row is never rewritten, so a
  hand correction in `VECTOR_ITEM_LABELS` stays.
- **The compiler** (no model call) lists in each theme doc, word for word
  with date and session, the items labelled to it as PRINCIPLE or
  CONSTRAINT, most authoritative first, then its open decisions marked as
  no standard. A session decision matching an open or dropped register row
  is set aside, one a settled decision covers is left to it, and the same
  text from several sessions is listed once. Every section heading carries
  its count, even when room runs out. Fixture sessions and empty pinned
  facts are left out (the latter reported). `VECTOR_GOVERNANCE` holds the
  approved SMPs. The operator's text above each doc's marker is never
  touched.
- **The primer** (24) gives each doc the room it needs, passing what a
  short doc doesn't use to the long ones, and cuts at a line. Its room went
  from 15,000 to 30,000 characters (still within the cell).
- **Stage 2's prompt** reads the docs by authority, scores only conflict
  with applicable items, names the item a score rests on, and says when no
  standard applied rather than reporting 0.0 as on-standard.

Against the live record (11-02): 240 items, labelled in 6 batches on the
first hourly run.

### The Registrar's two Studio flows, Apps Script half (D14, 2026-11-01)

The Registrar's triggers ran, but the two Studio flows they fed were never
built (dead-ends audit #2), so every drafted file failed three times. D14
(the operator, 2026-11-01): build them. `24_RegistrarFlows.gs` gives them
the shape `meta/FLOW_DOCTRINE.md` requires instead of the original design's
live Drive read and direct ledger writes: release writes a flat input row
with the draft's text (Stage 2's adds Stage 1's JSON and a `VECTOR_*`
digest); each flow adds a row to `REGISTRAR_RETURN`; the processor harvests
it by `Release_ID`, sets stale answers aside and checks Stage 1 is grounded
in the draft. A file that isn't a Google Doc fails at once. The two prompts
now describe this input and are generated into `16_FlowPrompts.gs`;
FlowBuildSpec lists every binding. The flows themselves are built in
Studio by hand after the push.

### Registrar alerts name no file (2026-10-31)

From KOS Audit Docket IV (#350; pushed 2026-11-01, v68): the Registrar's Chat
alerts (`11_Registrar_CogRelay.gs`, the kill-switch and CRITICAL_FAILURE
alerts) gave the session file's name, which can include a student's name,
though the triage itself is anonymized. They now give the Drive link, and
its log lines the row number. Git history was rewritten on 2026-10-31
(student records and phone numbers removed): cite PR numbers, not commit IDs.

### Ingestion hardening D and E, and logQueueMetrics (2026-10-29)

From `archive/2026-27-Q1/meta/KOS_INGESTION_HARDENING_PLAN.md` (#336, live 2026-10-29):

- **D. Sensor 2's duplicate guard.** `handleCogExhaust()` (2) gives a
  COG_EXHAUST payload the UID `COG-<content hash>-<task>` (the cog name,
  task, verdict and artifact, hashed as `_generateLogUUID` does) and checks
  it against live and archived rows before it makes the doc. The UID was a
  timestamp, so a webhook delivered twice was queued twice.
- **E. A cap on each queue run.** `processInferenceQueue()` (3) handles at
  most `QUEUE_MAX_ROWS_PER_RUN` (20) `FLOW_COMPLETE` rows within
  `QUEUE_TIME_BUDGET_MS` (4 minutes, both in 1); the rest wait for the
  next run, and its log line counts them as deferred. A long run held the
  script lock every sensor and the Turnstile need.
- **`logQueueMetrics()` (3), from the editor.** The Queue tab's counts,
  plus STAGING_PIPELINE's row count, its terminal rows and the oldest
  PENDING_FLOW row's age. `getQueueMetrics()` returns to the web app and
  logs nothing. Its first run (10-29): queue empty, 23 rows in no count,
  most likely DUPLICATE rows, which it doesn't count yet (BACKLOG).
