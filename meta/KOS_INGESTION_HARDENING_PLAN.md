# kos-personal ingestion: test, diagnose, harden

**Status:** plan, not started. Written 2026-10-06 from an outside review,
corrected against the code on `main` the same day.

**Symptom:** payloads queue faster than they clear. On 2026-10-05 a
73-part session batch drained at about 10 parts an hour, and the classify
backfill (`20_VectorClassifySessions.gs`, 3 sessions per run on a
15-minute trigger) shares the same single Studio slot, so each slows the
other.

**Scope:** `kos-personal/2_Ingestion_Sensors.gs`, `3_Queue_Processor.gs`,
`10_Turnstile.gs`, `5_Error_And_Utilities.gs` (`archiveStagingPipeline`),
the shared script lock, and the triggers `setupAllTriggers()` installs.

## 1. What is already fixed

`PROCESS_HARDENING_SPRINT.md` Phase 1 fixed queue fairness: the Turnstile
releases `PENDING_FLOW` rows in priority / normal / deprioritized order,
records each requeue reason, and `harvestStudioReturns()` and
`processInferenceQueue()` take the script lock. Since then:

- `handleCogExhaust()` takes the script lock too, but its duplicate check
  is still `_queuePayload()`'s fileId match, which can't fire: every call
  makes a new Drive doc first (its own comment says so).
- The archive is no longer invisible to the pipeline's readers: the
  vector-matrix rederive and the classify backfill read `STAGING_ARCHIVE`
  as well as `STAGING_PIPELINE` (PRs #81, #85).

## 2. Likely cause: one Studio slot for everything

```js
TURNSTILE_CONCURRENCY: 1,   // 1_Config_And_Deploy.gs:89
SENSOR1_MAX_FILES_PER_RUN: 8,      // :111
```

Every payload type (`SESSION_LOG`, `COG_EXHAUST`, `EXTERNAL_DATA`,
`VECTOR_CLASSIFY`, `COG_VERDICT`) goes through `STAGING_PIPELINE` and the
Turnstile, and only one row is `STUDIO_ACTIVE` at a time. Sensor 1 alone
can stage 8 docs every 5 minutes, each split into chunks. If a Studio run
takes several minutes, intake outruns release and `PENDING_FLOW` grows.
Nothing on the intake side slows down when the backlog is deep.

Why a backlog gets worse instead of clearing:

1. **`archiveStagingPipeline()` is not scheduled.** It isn't in
   `setupAllTriggers()`; it runs only from the web app. Terminal rows stay
   in `STAGING_PIPELINE`.
2. **`processInferenceQueue()` reads the whole sheet every run**
   (`3_Queue_Processor.gs:102`), with no cursor or cap, so its cost grows
   with item 1.
3. **One script lock for every trigger.** The sensors, the Turnstile, the
   processor, the backfill and the web-app entry points share
   `LockService.getScriptLock()`. A run that can't get it logs
   "Could not acquire lock — another run is active. Skipping." and does
   nothing. Slower runs (item 2) hold the lock longer. kos-personal has no
   watchdog (cas-ccps has `34_QueueWatchdog.js`), so skipped runs go
   unseen.

## 3. Tests: make the failure visible first

The sandbox lock mock (`tests/harness/gas-sandbox.js:417`) now tracks
`held`, but `tryLock()` still always succeeds, so no test exercises
contention.

- [ ] **Contended lock.** Let the mock share one lock object across
  calls, and have `tryLock()` return `false` while it's held. *Accept:* a
  test holds the lock and shows `sensor1_scanInboundSessions`,
  `runMatrixTurnstile` and `processInferenceQueue` each skip without
  writing, and each runs normally once it's released.
- [ ] **Scan cost.** Seed `STAGING_PIPELINE` with a few thousand rows.
  *Accept:* a test pins how many rows `processInferenceQueue()` reads
  (call counts; the sandbox has no real timings), so a cap or cursor (E)
  shows up as a change in the number.
- [ ] **Sensor 2 duplicates.** *Accept:* a test calls `handleCogExhaust()`
  twice with the same payload and asserts what happens. Today both queue;
  after D, the second is refused.

## 4. Diagnose: cheapest first (operator runs these)

1. `getQueueStatus()`: count and oldest timestamp per status. Many
   `PENDING_FLOW` rows while `STUDIO_ACTIVE` sits at 0–1 means the single
   slot is the limit.
2. Executions log: count "Could not acquire lock" lines per function per
   day. This shows whether contention happens in practice.
3. `STAGING_PIPELINE` row count against how many are terminal (would be
   archived). This shows how much item 1 inflates every scan.
4. `STUDIO_ACTIVE` dwell time against `TURNSTILE_STALE_MINS` (30). Rows
   that routinely reset at 30 minutes mean Studio itself is the slow link.

## 5. Harden, in order

- **B. Schedule `archiveStagingPipeline()`** (hourly) in
  `setupAllTriggers()`. This is safe now because the rederive and the
  backfill read the archive (§1). *Accept:* the trigger-list test includes
  it, and a test shows terminal rows move to `STAGING_ARCHIVE` and
  `PENDING_FLOW` / `STUDIO_ACTIVE` rows stay.
- **C. A kos-personal watchdog**, modeled on cas-ccps's
  `34_QueueWatchdog.js`: backlog depth, oldest `PENDING_FLOW` age, and
  lock-skip count, with an alert past a threshold. *Accept:* tests for
  each threshold, and the trigger is registered.
- **A. Backpressure on intake.** Sensor 1 stages fewer files (or skips its
  run) once `PENDING_FLOW` passes a threshold, and the classify backfill
  pauses while session chunks are waiting. *Accept:* tests at, below and
  above the threshold.
  - **Concurrency, with care.** Find out whether
    `TURNSTILE_CONCURRENCY: 1` is a Studio limit or a cautious default.
    Don't raise it until C is running: in September, 145 rows ended
    `STUDIO_TIMEOUT` (`HANDOFF_2026-09-28.md`), and more parallel Studio
    runs could bring that back. Raise it by one, and watch the timeout
    rate for a week.
- **D. Sensor 2 duplicate guard.** Give `handleCogExhaust()` the same
  content-hash check `submitSessionLog()` / `submitExternalData()` use,
  before it creates the Drive doc. *Accept:* the §3 duplicate test flips.
- **E. Cap or cursor `processInferenceQueue()`'s scan**, like Sensor 1's
  `SENSOR1_MAX_FILES_PER_RUN`. *Accept:* the §3 scan-cost number drops and
  is pinned.
- **F. The bounded-loop warnings.** gas-lint reports **11**
  `bounded-loop-convention` warnings, 7 of them in kos-personal (none in
  the queue path itself). Close them when the function is next touched.

**Start with §4.** Two log checks and one sheet count say whether this is
mainly the single slot (A, with C first) or the unpruned backlog (B, then
E). Then B, which is small and safe.
