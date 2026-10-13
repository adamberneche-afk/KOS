# kos-personal: 21-day onboarding close-out (2026-10-13)

> **Status:** drafted 2026-10-13 from the repo and the handoffs. The
> close-out itself happens live: the operator runs
> `previewOnboardingCloseOut()`, then `closeOutOnboarding()`. Lines marked
> **[live]** come from Script Properties or the sheets, which this repo
> can't read; the operator fills them in or confirms them.

## What onboarding was

Arming the engine (the Socratic onboarding wizard, or the web app's
`completeOnboarding()`) seals the core thesis, sets the 90-day vision and
starts the counter at Day 1. The counter is `KOS_ONBOARDING_DAY`, capped
at 21 (`CFG.ONBOARDING_DAYS`).

**What a "day" counted.** `_advanceOnboardingDay()` adds one each time a
processing run takes in at least one session (`processInferenceQueue()`
in `3_Queue_Processor.gs`), not once per calendar day. So "Day 21 of 21"
means 21 processing runs that took in a session. The primer read Day 21 of
21 by 2026-10-05 (`rtp-core-router/notebook-plan/05_TEST_LOG.md`) and has
read it ever since. Nothing recorded that onboarding had finished,
because the counter had no end state; `closeOutOnboarding()` adds one.

- Armed / started: **[live]** `KOS_ONBOARDING_START`.
- The 90-day vision: **[live]** quoted from the primer. Its 90 days run
  from the start date above.

## What the period produced

- **The pipeline works end to end.** The Sept 10–28 failure (the Curator
  Flow calling the RTP Gem, the primer failing every morning since
  Sept 18, no session ever queued for classification) was fixed by
  2026-09-29 (`HANDOFF_2026-09-28.md`, causes 1–4).
- **`VECTOR_MATRIX` repaired** (2026-10-03 to 10-05): one row per
  session, duplicates removed, every row rebuilt from classify parts,
  and the decision register backfilled.
- **Briefing docs** read by fixed link, not notebook search: the primer
  with its Data Quality block, open decisions, recent sessions and core
  facts, and since 2026-10-12 the SMP register.
- **The thinking surface moved** from the RTP Gem to a Claude Project
  (2026-10-06, `meta/PLAN_2026-10.md`). The Gem and the V6.0 router are
  frozen.
- **Governance:** one SMP register, numbered (`meta/SMP_PROCESS.md`).
  SMP-018 limits the Project to writes the operator directs, and it never
  writes to CAS or LeaderHub.
- **Signals into the Project, with no student data in them:** the family
  mail signal (2026-10-12) and the CAS attention signal (2026-10-12),
  both counts or name-free lines.

## What it showed

- **What works is deterministic.** A script writing a fixed doc on a
  schedule, with tests behind it, held up. AI retrieval of the system's
  own state (Gem notebook retrieval, Gemini app chips) did not
  (`meta/PLAN_2026-10.md`, "Why we regrouped").
- **Plumbing took most of the time:** the staging pipeline, the single
  Studio slot, duplicate repair, and Sheets turning IDs into dates.
- **Systems work crowds out the work they serve.** The 2026-10-12
  sessions closed ALIGNMENT YELLOW: the whole day went to systems, and
  the failing-student calls (due Oct 30) weren't worked.

## Carried forward

These stay open after the close-out; none of them blocks it.

- **Ingestion hardening** (`meta/KOS_INGESTION_HARDENING_PLAN.md`):
  diagnosis §4 first, then the tests in §3, then the watchdog (C),
  backpressure (A), and D–F.
- **Unclassified sessions** still drain through the backfill trigger.
  The primer's Data Quality block shows how many are left: **[live]**
  status at close.
- **The commute trial** runs through 2026-10-18: which assistant was
  consistent.
- **Open decisions:** **[live]** count from `KOS_OPEN_DECISIONS` at
  close.
- **Students first:** the failing-student family calls, by Oct 30.
- **Not closed by this:** the Gem-era "Genesis Protocol" graduation
  (`rtp-core-router/notebook-sources/TURN_LOOP_REFERENCE.md`) belongs to
  the frozen Gem and is left as it is.

## Closing it, at the keyboard

1. Push kos-personal (`run.ps1`).
2. Run `previewOnboardingCloseOut()` in the kos-personal editor. It
   should say "PREVIEW: onboarding would be closed today". If it refuses
   (engine not armed, or below day 21), paste the message back.
3. Run `closeOutOnboarding()`. It sets `KOS_ONBOARDING_CLOSED` to today's
   date and adds an `ONBOARDING_CLOSED` row to `ONBOARDING_TRACKER`.
4. Run `generateDailyPrimer()`. The primer's first line now reads
   `Onboarding: complete (closed 2026-10-13)`, and so does the KOS
   Project's `start`.
5. Re-paste the Project's instructions (`claude-project/PROJECT_INSTRUCTIONS.md`
   now names the closed line).

Running the onboarding wizard again re-arms the engine and starts a new
onboarding at Day 1, which clears the close-out.
