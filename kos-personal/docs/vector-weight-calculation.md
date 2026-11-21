# Vector weight calculation — a second Studio flow, GAS does the math

Split out of `kos-personal/README.md` on 2026-11-17; the README maps where everything is.

Operator decision (CE-SMP Vector Weight Calculation Engine v1.0): the
Inference Flow is a qualitative classifier only, never trusted to
compute a session-level vector weight itself. Concretely:

- A new, independent Studio flow (`Payload_Type = VECTOR_CLASSIFY`) reads
  a session and classifies it at sentence granularity — each sentence
  gets a 0.0–1.0 relevance signal per known vector, plus an
  `unmapped_signals` list for anything outside the known set. Each
  human+AI exchange is also flagged `DECISION` or `EXPLORATORY`. That's
  the entire scope of what the LLM is asked to do here — see
  `STUDIO_INTEGRATION_SPEC.md`'s "Inference Flow — Sentence
  Classification" section for the exact contract.
- `4_Vector_Router.gs`'s `_aggregateSentenceVectors_()` does every
  quantitative step deterministically in GAS: multiply each sentence's
  score by its exchange's multiplier (`DECISION` = 1.5×, `EXPLORATORY` =
  1.0×), sum, and normalize against the total possible score. The same
  session always produces the same weights, regardless of who runs it or
  when — verified against a standalone Node simulation before this
  landed (order-independence, threshold-dropping, zero-division safety).
- The Incubator moved from a simple session-count/average-weight
  threshold to cumulative score + 14-day half-life decay
  (`CFG.INCUBATOR_PROMOTION_THRESHOLD`/`INCUBATOR_HALF_LIFE_DAYS`/
  `INCUBATOR_DECAY_FLOOR`) — an emerging theme that goes quiet for a
  while genuinely loses ground toward promotion rather than accumulating
  forever. `INCUBATOR`'s schema changed accordingly (`Raw_Score_Log`,
  `Cumulative_Score` replace the old rolling average).
- `VECTOR_MATRIX` rows now carry a trailing `CHECKSUM` column (MD5 of
  the session UID + every theme score) — a corruption-detection check,
  not a security control, per Law 5 (Matrix Row Integrity) — one row per
  session, and a mismatch on audit means something wrote to this sheet
  outside the normal path.
- `KNOWN_VECTORS` grew to 7: `DOMAIN_COMPLIANCE` joins the original 6
  (kept alongside `RELATIONAL` rather than replacing it — the SMP's own
  audit example used `DOMAIN_COMPLIANCE`, real live sessions had already
  shipped using `RELATIONAL`, and there was no reason to force a choice
  between two live conventions when tracking both costs nothing).

**Session pairing (2026-09-28):** `2_Ingestion_Sensors.gs` now queues each
session's classification alongside its `SESSION_LOG` chunks, as parts of at
most 8,000 characters (`LOG-xxxxxxxx_VC01of03`) so each fits one Sheets
cell. `20_VectorClassifySessions.gs` aggregates them into one
`VECTOR_MATRIX` row per session under the log UUID, and backfills sessions
ingested earlier, from chunk rows in `STAGING_PIPELINE` or `STAGING_ARCHIVE`.
`installClassifyBackfillTrigger()` runs the 3-session batch every 15 minutes
and removes itself when nothing is left to queue. It is not in
`KOS_TRIGGER_HANDLERS`, so the preflight doesn't expect it. See the spec's
"Session pairing" note. The
Studio-side Classify Flow itself still has to exist and answer for any of
this to produce data.

**A session with no row (2026-10-23):** when the primer's Data Quality block
says "N processed session(s) have no Vector State row yet", run
`explainUnclassifiedSessions()` (read-only). It names each one, why it has
no row (a part that failed or timed out, parts archived out of the
requeue's reach, text that is gone, and so on) and the one call that fixes
it. A copy of content another session has classified is no longer counted.

**One session per row (2026-10-03):** each `VECTOR_MATRIX` row holds only
its session's own scores, 0 for a theme it didn't score. The 0.92 decay is
applied when the matrix is read (`_vmDecayedState_()`, used by
`getVectorState()` and the startup primer), over every session in date
order. `21_VectorMatrixRepair.gs` repairs rows written before that:
`previewDuplicateSessions()`/`applyDuplicateSessions()` keep one session
per content hash and mark the other copies `DUPLICATE`, and
`previewVectorMatrixRederive()`/`applyVectorMatrixRederive()` rebuild
every row from its classify parts (live or archived) in date order. Run
the duplicates pair first, then the rederive. A row the rederive has to
keep (its parts are gone) still holds old values:
`previewUnrebuildableReset()`/`applyUnrebuildableReset()` remove it and
re-queue the session for classification from its CuratorInput text, and
`dropUnrebuildableRowsWithoutSource()` also removes rows whose text is gone.

**Notebook briefing docs (2026-10-03):** the RTP notebook's pipeline-written
sources (`rtp-core-router/notebook-plan/`, Phase 1). `generateDailyPrimer()`
now stamps `KOS_LATEST_PRIMER` with a generated-at line and adds a Data
Quality block, then `22_BriefingDocs.gs` writes `KOS_RECENT_SESSIONS`,
`KOS_OPEN_DECISIONS` and `KOS_CORE_FACTS` (also on demand with
`generateBriefingDocs()`). Each keeps one Drive file ID and is overwritten
in place; a failed run leaves the old doc and its old stamp. Open decisions
come from the new `DECISION_REGISTER` sheet: the intake records each
deferred decision as OPEN, and `resolveDecision()` or a Status edit closes
it. `previewDecisionRegisterBackfill()`/`applyDecisionRegisterBackfill()`
read in the decisions already in CURRENT_STATE.

**Decision echoes (2026-11-08, plan item L2):** a re-sent or back-filled
session used to record its decisions again as new OPEN rows. The intake
(`_recordDeferredDecisions_`, 22) now holds a new deferred decision back
when it repeats a `DECISION_REGISTER` row of any status: its Blocking
cites that row's Decision_ID, or its text, normalized (lowercase,
punctuation and extra spaces gone, so a trailing period doesn't count),
is the same, contains the other (the shorter at least 4 words), or has a
word-set Dice similarity of at least 0.85 with the same numbers in both
(one word changed in ten is 0.90; two is 0.80, recorded). A "#19"-style
number in Blocking is not matched: nothing maps it to a Decision_ID. Held
decisions go to a `DECISION_ECHOES` tab (held at, session, would-be ID,
matched ID, reason, similarity, and the text), and the primer and
`KOS_OPEN_DECISIONS` carry one line counting them. One that wasn't a
repeat: copy it into the register by hand. CURRENT_STATE still gets every
decision, as before.

**Notebook persona editions (2026-10-05):** `rtp-core-router/notebook-sources/`
holds each persona doc as a notebook source (Phase 2 step 1): a cited core
block first and the persona name in every heading. Generated by
`tools/kos-personal/build-notebook-personas.js`.

**RTP Core Router V6.0 (history; frozen since 2026-10-06):**
`rtp-core-router/RTP_CORE_ROUTER_V6_0.md` is the slimmed router that went
into the RTP Gem's instructions (Phase 3), and it stays as the last Gem
version. `@Startup` read `KOS_LATEST_PRIMER` first and took all state from
it. The rules it moved out are in a notebook source,
`rtp-core-router/notebook-sources/TURN_LOOP_REFERENCE.md`, now also Claude
Project knowledge. Test runs are logged in
`archive/2026-27-Q1/kos-personal/rtp-core-router/notebook-plan/05_TEST_LOG.md` (CT-01, CT-05, CT-06 and
CT-08 passed). The KOS Claude Project (`claude-project/`) replaced the Gem
as the thinking surface (`meta/PLAN_2026-10.md`); the commute trial chose
Claude on 2026-10-17.

**Migrating an existing live sheet.** If your `BRAIN_TRUST_INDEX`
spreadsheet already has `VECTOR_MATRIX`/`INCUBATOR` tabs from before this
engine landed, `_getOrCreateSheet()` will NOT upgrade their headers on its
own — it only sets headers when it creates a sheet, never when one already
exists. Run `migrateVectorSchema_v2()` once from the Apps Script editor
before deploying this code against a pre-existing sheet — it adds the
`DOMAIN_COMPLIANCE`/`CHECKSUM` columns to `VECTOR_MATRIX` and migrates
`INCUBATOR` to the `Cumulative_Score`/`Raw_Score_Log` schema in place,
non-destructively (existing scores are approximated forward, never
dropped). Safe to re-run — it checks the current schema first and skips
whatever's already migrated. See its header comment in
`4_Vector_Router.gs` for exactly what it does and doesn't recover.
