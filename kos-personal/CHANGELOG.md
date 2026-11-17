# KOS Changelog

**Entries before 2026-10-29** (the plan of record before `meta/PLAN_2026-11.md`) are archived word for word in
[`archive/2026-27-Q1/kos-personal/CHANGELOG.md`](../archive/2026-27-Q1/kos-personal/CHANGELOG.md). This file holds the current plan's era; when the plan rolls over, the
older entries move to their school quarter's folder (`archive/INDEX.md`).


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
