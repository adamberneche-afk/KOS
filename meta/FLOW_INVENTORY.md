# Flow Inventory & Health

**What this is:** a single reference listing every "Flow" dependency across
all three systems in this repo — a place where GAS code hands off to an
external AI step (a Google Workspace Studio/Flow, or a Gemini Gem
conversation) that this repo's own code cannot see or control — plus where
to check whether each one is actually built and working. Say/Do Ledger
cross-portfolio finding (Addendum 7's "Flow Health & Inventory extension",
Addendum 8 Phase D2): the audit that named this gap found the same pattern
independently discovered/half-fixed in each system (kos-personal's Turnstile/
Registrar retry counters, leader-hub's AI_Queue) with no single place
listing all of them, and no shared vocabulary for what "healthy" even means
across three different underlying signals.

**Why this exists:** none of the three systems' own code can detect "is a
human-built Flow actually connected yet" directly — a Flow is built by hand
in the Google Workspace UI, not deployed with the rest of the code. Every
system below can only *infer* whether one exists, from whether jobs it
hands off ever come back. This doc is the map of where that inference
happens today, so a missing/broken Flow surfaces as a real signal in the
right place instead of as silent, indefinite retrying.

---

## Shared signal semantics (read this before reading any one system's rows below)

Each system's own "is this Flow alive" signal is built from a genuinely
different underlying mechanism (a row's own retry counter; an admin-facing
lifetime counter; a stale-row age check) — there was never one shared
implementation to extract, and forcing one wouldn't fit all three honestly.
What *is* shared, and should stay shared for any future addition to this
list, is the three-state **meaning** every panel below renders to:

| State | Meaning | Precedent |
|---|---|---|
| **No jobs submitted yet** | Nothing has ever been queued through this Flow's pipeline. Hidden or clearly neutral — not a warning, since there's nothing to warn about. | kos-personal's Registrar panel hides entirely when `total === 0` (`8_WebApp_UI.html`'s `loadRegistrarStatus()`). |
| **Never completed a job** | At least one job has been queued, but none has ever reached a terminal outcome (success *or* failure both count as "terminal" — even an error proves the Flow is connected and responding). Rendered as a hedge, not an alarm: this is the normal, expected state for a Flow that simply hasn't been built yet. | kos-personal's `everCompleted = g.routed > 0 || g.failed > 0` — reaching `CRITICAL_FAILURE` counts as proof of life, same as `COMPLETELY_ROUTED`. |
| **Healthy** | At least one job has reached a terminal outcome. Self-updating — the moment a Flow is actually built and processes its first real job, every panel below reflects it automatically, with no doc edit or manual "mark as done" step required anywhere. | Same signal as above, just the positive case. |

A system whose underlying mechanism can't retain history long enough to
compute this (leader-hub's AI_Queue rows are deleted the moment their
outcome is read, or after a 2-hour sweep) needs its own small durable
counter to have anything to report — see leader-hub's row below for how
that was built. The three-state *meaning* stays the same either way.

---

## cas-ccps — Flow 2 (Turn-In evaluation)

**What it does:** a student's Turn-In Gate submission (`04_Form2_
TurnInGate.js`) is queued to `ReviewQueue`, bridged into `STAGING_PIPELINE`
(`03_QueueBridge.js`), and picked up by a human-built Studio Flow that
evaluates the submission against its rubric and writes the result back —
the one Flow this entire system depends on to ever turn a submission
COMPLETE.

**Status lifecycle:** `PENDING_INFERENCE` (queued, waiting for a free
per-teacher lane) → `IN_PROCESS` (Flow 2 is expected to be actively
evaluating it) → `COMPLETE` / `ERROR_TIMEOUT`. `06_StagingPipeline_
Turnstile.js`'s 1-minute trigger both promotes queued rows into a lane and
auto-times-out a row that's sat `IN_PROCESS` too long.

**Where to check:** ⚙️ Admin Controls → 📊 Run System Health Check (or the
daily `autoHealthAlert()` email), in `10_AdminRecoveryPanel.js`. Two
checks, both fed by the shared `_stagingPipelineHealthChecks_()` scan:
- **Stuck `IN_PROCESS` rows** (past 15 min) — an evaluation that started
  but never finished. *Never completed a job*-equivalent for one specific
  submission, not the whole Flow.
- **Stuck `PENDING_INFERENCE` rows** (past 20 min, never promoted) — a
  submission that's been queued long enough that either the Turnstile
  trigger isn't running, or every lane for that teacher has been busy the
  entire time. Added by this Flow Health pass — previously these rows were
  only ever counted, never aged, so this specific failure mode was
  invisible.

Rows that DO reach `COMPLETE` retain that status indefinitely (nothing
deletes them) — so "has this ever completed a submission" is directly
checkable from `STAGING_PIPELINE` itself, unlike leader-hub's AI_Queue below.

---

## kos-personal — Studio ingestion/inference Flow

**What it does:** `2_Ingestion_Sensors.gs` queues session logs, external
data, and (as of the Seven Bridges pipeline) cog verdicts into
`STAGING_PIPELINE`; a human-built Studio Flow reads a queued doc, runs
inference, and writes structured JSON back. Two independent sub-pipelines
depend on their own separate Flow being built: the main ingestion queue
(Turnstile) and the Registrar curriculum-drafts auditor (a completely
separate state machine, `11_Registrar_CogRelay.gs`).

**Where to check:** the web app's Queue tab (Turnstile) and Diagnostics tab
(Registrar), `8_WebApp_UI.html`.
- **Turnstile / main queue** — `getQueueMetrics()`'s `cycling` count
  (`3_Queue_Processor.gs`): a `PENDING_FLOW`/`STUDIO_ACTIVE` row whose
  `Retry_Count` has crossed `CFG.TURNSTILE_STUCK_THRESHOLD` (3) is flagged
  as cycling — Turnstile itself has no ceiling (unlike Registrar below), so
  a row with no Flow ever completing it retries every 5 minutes forever;
  this is a UI-only "call it stuck" signal layered on top, not a new
  pipeline state. Say/Do Ledger kos-personal finding #2.
- **Registrar** — `getRegistrarStatus()`'s `groups` (`11_Registrar_
  CogRelay.gs`): `groups.routed`/`groups.failed` both count as reaching a
  terminal outcome (an attempt-tracker-driven `CRITICAL_FAILURE` proves the
  Flow is connected and responding, same as a successful route) — the panel
  hides entirely at `total === 0`, and hedges only when `in_progress > 0`
  with neither `routed` nor `failed` ever reached. Say/Do Ledger
  kos-personal finding #9.

---

## leader-hub — 6 AI-drafting Flow types

**What it does:** every AI-drafting feature (Brag Board email, Email
Composer, Archive/WBL insights narratives, Lesson Plan assist, Financial
analysis) submits a job to `EmailBridge.gs`'s `AI_Queue` sheet via
`callGAS('aiDraft', {type, ...})`; a human-built Google Workspace Flow
(one per type, or a shared one branching on `type` — see
`LEADERHUB_AI_FLOW_SETUP.md`) picks it up and writes the drafted text back.
Every feature already degrades gracefully to a template/local draft when no
Flow is connected — this panel is about visibility, not a hard dependency.

**Six real types**, not the five `LEADERHUB_AI_FLOW_SETUP.md` documents —
`FIN_ANALYSIS` (`finAnalysis()`) is real, shipping traffic today but was
never added to that doc alongside `EMAIL_COMPOSE`, `ARCHIVE_INSIGHTS`,
`WBL_INSIGHTS`, `LP_ASSIST`, and `BRAG_EMAIL`. Fixing that doc gap is
tracked separately from this extension; this inventory and the new health
panel both already list all six.

**Why this system needed new code, not just a new panel:** `AI_Queue` rows
are always eventually deleted — either the instant their outcome (COMPLETE/
ERROR) is read back once, or unconditionally once older than 2 hours,
regardless of status (`checkAiJob_()`). There is no durable row history to
compute "has this type ever completed a job" from at read time, unlike
cas-ccps's `STAGING_PIPELINE` above. `EmailBridge.gs` now keeps a small
lifetime counter per type (`submitted`/`completed`/`errored`/
`sweptUnclaimed`), incremented at the only two moments a job's fate is ever
known before its row disappears: `queueAiJob_()` (submitted) and
`checkAiJob_()` (completed/errored on hand-back, sweptUnclaimed if it aged
out still `PENDING`).

**Where to check:** Settings → AI Flow Health, `student-leader-hub.html`
(`renderAiFlowHealthSettings()`, calling the new `flowHealth` action on
whatever Email Bridge URL is configured). One row per type, using the same
three-state semantics as the table above — "completed or errored ever" both
count as healthy, matching the other two systems' own "a terminal outcome
of either kind proves the Flow is alive" convention.

---

## meta / personal Drive — Drive Steward classification Flow

**What it does:** `drive-steward-deploy/DriveSteward_Scanner.gs` (time-
triggered, mechanical, no AI) finds new/changed files in Fluffy's Drive
and appends bare rows to `Drive_Steward_Intake`; a human-built Studio
Flow (`drive-steward-deploy/STUDIO_FLOW_SETUP.md`) reads those rows,
classifies each file against `Drive_Steward_Methodology_and_Prompt.md`'s
Part 1 patterns, and writes the result to `File_Registry` — the one Flow
this whole deployment depends on to ever turn a bare intake row into a
usable registry entry. Not one of this repo's three main systems, but
the same "GAS hands off to a human-built Flow it can't see or control"
shape, so it belongs in this inventory on the same terms.

**Status lifecycle:** a file starts as a `Drive_Steward_Intake` row with
`status='new'` → the Flow classifies it, writes a `File_Registry` row,
and flips the intake row to `status='classified'`. Low-confidence
classifications also get a `Batch_Queue` row (`status='pending'` →
`'confirmed'`/`'corrected'` once Fluffy resolves it).

**Where to check:** `DriveSteward_Calibration.gs`'s
`getDriveStewardFlowHealth_()`, surfaced in the nightly digest email
(`runDriveStewardNightlyDigest()`) and loggable directly. Uses this
doc's shared three-state semantics:
- **No jobs submitted yet** → `Drive_Steward_Intake` has never had a row
  (the Scanner hasn't run yet, or nothing's changed in Drive).
- **Never completed a job** → at least one intake row exists but
  `File_Registry` is still empty — the Flow hasn't classified anything
  yet. Rendered as a hedge in the digest ("check it's wired up per
  STUDIO_FLOW_SETUP.md"), not an alarm, since this is also just what a
  freshly-deployed instance looks like.
- **Healthy** → `File_Registry` has at least one row — the Flow has
  classified something at least once.

Not yet deployed against a real Drive/Sheet as of this writing (see
`drive-steward-deploy/README.md`'s final section) — this is the first
Flow in this inventory documented before its first real run rather than
after.

---

## Adding a new Flow to this list

1. Add a row to whichever system section above (or a new section, if it's
   a fourth system's Flow).
2. Make sure whatever "is it alive" signal you build renders the same
   three states as the table at the top — hidden/neutral when nothing's
   ever been submitted, a hedge (not an alarm) when submitted-but-never-
   terminal, healthy once anything terminal has ever happened.
3. Link the actual UI location (menu item, tab, settings panel) where an
   admin/teacher/operator can see it — this doc is a map, not a substitute
   for the real panel.
