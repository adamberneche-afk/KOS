# Knowledge Operating System v8.0
### The Headless Studio Edition

KOS is a personal intelligence infrastructure built on Google Apps Script. It captures your AI working sessions, extracts structured knowledge from them, and routes that knowledge to the right places in a system you own. Everything — your data, your processing logic, your folder hierarchy — lives in your Google account. **By default**, nothing is on a vendor server — see "Inference modes" below for the one explicit, opt-in exception.

The core problem it solves: you spend hours in AI sessions making decisions, building expertise, and generating insight. At the end of each session, almost all of that value disappears. You might copy a few action items. KOS routes everything — vector weights, state updates, action items, pivots, cog verdicts — automatically, so your system gets smarter with every session rather than resetting to zero.

---

## ✅ Reconciled: code and docs now agree

Every gap this README used to document below has been closed via the
CAS/KOS reconciliation decision log (see the repo root's decision-log
process). `appsscript.json`, all 10 numbered `.gs` files (`10_Turnstile.gs`
was rebuilt, not just kept), and `8_WebApp_UI.html` are all in this
directory, and — as of this pass — the delivered code now implements what
this README, `DEPLOYMENT_GUIDE.md`, `STUDIO_INTEGRATION_SPEC.md`, and
`SCHEMA_REFERENCE.md` describe, rather than diverging from it. All 7
`PERSONA_*` cog docs are also now in `rtp-core-router/` (previously only
`PERSONA_DEVELOPER` was present).

`appsscript.json`'s original 6 OAuth scopes (`drive`, `spreadsheets`,
`documents`, `script.scriptapp`, `script.send_mail`, `userinfo.email`)
matched what the code called with no `UrlFetchApp`/`CalendarApp`/`GmailApp`/advanced-service
usage anywhere — true when this was first written. Round 3 reconciliation
added `UrlFetchApp` (for `_getManagedServiceStatus_()`'s optional
managed-inference lookup) without adding its scope, a real regression
caught by `tools/gas-lint/check.js` and fixed by adding
`script.external_request` — now 7 scopes, still verified against actual
code usage by that same tool going forward instead of by memory.
`executeAs: "USER_DEPLOYING"` and `runtimeVersion: "V8"` are both correct
and required as-is.

**`webapp.access` stays `"MYSELF"`** — deliberately, not as an unresolved
soft note. Sensor 2 (`COG_EXHAUST`) is deployed as a **second, separate**
web app deployment of this same project (see `DEPLOYMENT_GUIDE.md` Phase
5), also restricted to `MYSELF`. No anonymous endpoint is opened anywhere;
whatever originates a `COG_EXHAUST` payload authenticates as the same
Google account that deployed the script.

What follows is a record of what was fixed and why, kept for anyone
picking this project up later who wants to know what changed and when.

### What was fixed

1. **`STUDIO_ACTIVE` gating now exists.** `10_Turnstile.gs` was rebuilt
   from scratch (the original used an incompatible schema — see
   `archived/10_Turnstile_ORIGINAL.gs`) against the real `CFG.STAGING_COLS`
   and status lifecycle. `runMatrixTurnstile()` releases `PENDING_FLOW`
   rows to `STUDIO_ACTIVE` up to `CFG.TURNSTILE_CONCURRENCY`, and resets
   rows stuck `STUDIO_ACTIVE` past `CFG.TURNSTILE_STALE_MINS` back to
   `PENDING_FLOW` (incrementing `Retry_Count`), exactly as
   `STUDIO_INTEGRATION_SPEC.md` describes. Release timestamps live in a
   `PropertiesService` map (`KOS_TURNSTILE_RELEASED`), not a new sheet
   column, to avoid touching every hardcoded 7-column `getRange()` call
   elsewhere in the codebase.
2. **Shadow matrix implemented** in `5_Error_And_Utilities.gs`
   (`_updateShadowMatrix()`, `getShadowMatrixStatus()`) — maintains the 5
   confidence-interval questions from `SCHEMA_REFERENCE.md`'s "Shadow
   Matrix JSON Shape," updated passively from each session's
   `alignment_observations`, classified `UNKNOWN`/`HYPOTHESIZED`/`VERIFIED`
   against `CFG.SHADOW_VERIFY_THRESHOLD`. `admin_ghost`, `relational_targets`,
   and `necessary_struggle` auto-populate their matching operator property
   on first `VERIFIED` (only if not already set manually).
3. **Daily primer implemented** — `generateDailyPrimer()` in
   `6_Governance.gs`, installed on the documented 06:00 daily trigger.
4. **Auto-council trigger implemented** — `autoCouncilCheck()` in
   `6_Governance.gs`, installed on the documented 2-hour trigger, fires
   `triggerCouncilSimulation()` once `CFG.COUNCIL_AUTO_TRIGGER_SESSIONS`
   new sessions have processed since the last council run.
5. **`CFG` now has all four previously-missing keys**:
   `TURNSTILE_CONCURRENCY`, `TURNSTILE_STALE_MINS`, `SHADOW_VERIFY_THRESHOLD`,
   `COUNCIL_AUTO_TRIGGER_SESSIONS` — values match the defaults this README
   already documented. (`MAX_CHUNK_SIZE` stays `8000`, not `25000` — that
   mismatch was never part of the reconciliation scope and the delivered
   value is retained; see the constants table below.)
6. **`setupAllTriggers()` now installs all 10 documented triggers** in one
   pass, including `runMatrixTurnstile`, `generateDailyPrimer`,
   `autoCouncilCheck`, and `onGovernanceEdit` (previously only installable
   via a separate manual call).
7. **`8_WebApp_UI.html`'s missing server functions are now implemented**:
   `executeBootstrap()` (alias of `deployFullSystem()`, in
   `1_Config_And_Deploy.gs`), `completeOnboarding(payload)` (the headless
   counterpart to `runSocraticOnboarding()` — the only viable onboarding
   path for the deployed standalone web app, since the HITL wizard needs a
   bound-spreadsheet UI context the web app doesn't have), `getQueueMetrics()`
   (in `3_Queue_Processor.gs`, returning the shape the HTML actually reads —
   `{queued,pending,active,needs_review,needs_curator,processed}`),
   `getShadowMatrixStatus()`, and `getInboundFolderUrl()`.
8. **`doGet()` fixed** to use `createTemplateFromFile().evaluate()` instead
   of `createHtmlOutputFromFile()`, so the `<?= mode ?>` scriptlet actually
   activates the bootstrap/operational split (`mode` is `'BOOTSTRAP'`
   whenever `INDEX_ID` isn't set yet, `'OPERATIONAL'` otherwise).
9. **The "managed_service" credits/subscription panel was removed
   entirely, then later revived gated behind an explicit opt-in** — see
   "Round 3 — the managed inference service" below. At the time of this
   original fix, nothing in the repo supported the panel and it
   contradicted this README's "Nothing is on a vendor server" framing;
   the real backend later turned up in a reupload batch and the framing
   was updated to "by default," not reversed.
10. **The council-simulation UI copy was corrected** to describe what
    `triggerCouncilSimulation()` actually does — one shared review document
    covering ARCHITECT, AUDITOR, and MUSE together — instead of the
    hardcoded, inaccurate "7 isolated cog stimuli" framing. The fuller
    7-persona sequestered "Seven Bridges" design (SMP-002) remains
    unbuilt, pending its own `PENDING USER APPROVAL` governance gate per
    `9_UI_Diagnostics.gs`'s `sevenBridgesReview()` — that scope boundary
    was intentional, not an oversight.

### `10_Turnstile.gs` — rebuilt, original preserved in `archived/`

The original file (byte-for-byte in `archived/10_Turnstile_ORIGINAL.gs`)
used an incompatible schema: `Status`/`Payload` columns via `indexOf()`,
`PENDING_INFERENCE`/`IN_PROCESS` status values, and the `ID_BRAIN_TRUST_INDEX`
property key — none matching the `CFG.STAGING_COLS` map or
`PENDING_FLOW`/`STUDIO_ACTIVE`/`FLOW_COMPLETE` lifecycle every other file
uses. It read as a leftover from an earlier v5.4-era draft. The new
`10_Turnstile.gs` (`runMatrixTurnstile()`) is a clean rebuild against the
real schema — see "What was fixed," item 1, above.

---

## Round 3 — large reupload batch

A later reupload batch (18 zip files, mostly duplicating what's already
reconciled above) contained real, previously-missing material for this
system too: two concrete legacy fixes, ten governance/protocol docs, and
— solving a question this README didn't know it had — the real backend
behind the "managed_service" panel removed in fix 9 above.

### Two backported fixes

Found in an earlier pre-reconciliation draft, absent from the delivered
code, confirmed by direct grep before backporting:

1. **`2_Ingestion_Sensors.gs` — `sensor3_externalTelemetry` now scans by
   cursor.** Previously re-read the entire `EXTERNAL_TELEMETRY` sheet on
   every trigger fire; now tracks a `KOS_SENSOR3_LAST_ROW` Script Property
   high-water mark and only reads rows added since the last run, with a
   reset guard for manual sheet truncation. A real scaling fix — the old
   behavior gets slower every time a new external-data row is added,
   forever.
2. **`4_Vector_Router.gs` — two fixes to `_routeVectorWeightsInternal` /
   `_writeMatrixRow`.** (a) When a theme is promoted from the incubator
   during the same session that triggered the promotion, the triggering
   session's own `VECTOR_MATRIX` row is now back-filled with its real
   score instead of the 0 that `_writeMatrixRow` necessarily wrote before
   the promotion happened (columns are resolved before promotion runs).
   (b) `_writeMatrixRow` now has a defensive `NO_HEADERS` guard — if
   `VECTOR_MATRIX` somehow has no theme columns (manual intervention, a
   sheet that missed initialization), it logs a clear error and skips the
   write instead of silently appending a malformed row.

### Governance/protocol docs filed

Ten files — `COLD_BOOT_PROTOCOL.md`, `COLD_START_ORIENTATION.md`, three
`CURRENT_STATE_DRAFT*.md` variants, `HEREDITARY_WATCHLIST.md`,
`KILL_SWITCH_PROTOCOL.md`, `RULE_CONFLICT_RESOLUTION_PROTOCOL.md`,
`ZONE_SPECIFICATION_MIRROR_MATRIX_FLOW.md`, and
`Drive_Steward_Methodology_and_Prompt.md` — confirmed as real
RTP_CORE_ROUTER governance material (same vocabulary as the live system:
`BRAIN_TRUST_INDEX`, `CURRENT_STATE`, the 6-cog personas, SMP proposals).
Filed under `rtp-core-router/protocols/`. `Drive_Steward_Methodology_and_Prompt.md`
is also cross-referenced from the root-level `meta/` directory (see the
repo root README) since its methodology applies beyond just this system.

**Naming collision, flagged so it's never conflated:** "SMP-002" means two
different things across this repo's material. The **real, live** SMP-002
is the "Seven Bridges" 7-persona sequestered council design referenced in
`9_UI_Diagnostics.gs`'s `sevenBridgesReview()` (see "What was fixed," item
10, above) — still `PENDING USER APPROVAL`, not yet built.
`ZONE_SPECIFICATION_MIRROR_MATRIX_FLOW.md` (filed above) references an
**unrelated, superseded** "Mirror Matrix" zone-folder taxonomy concept
that has zero footprint in the real repo and occupies a conceptual slot
the real 5-question Shadow Matrix now fills — a same-name, different-thing
collision from an earlier design generation, not a contradiction in the
live system. A short banner was added to that file itself for the same
reason.

### The managed inference service — revived as an optional path

The reupload batch's `files_37`/`files_38` clusters (confirmed
byte-identical) turned out to be a complete, separate Node.js/Express
service — `Dockerfile`, `server.js`, `billing.js`, `db.js`, `google.js`,
`inference.js`, `logger.js`, `worker.js`, `schema.sql` — a Postgres- and
Stripe-backed, multi-tenant, credit-metered alternative to native
Workspace Studio inference. Its `GET /api/v1/account` endpoint returns
exactly the `credit_balance` / `subscription_tier` shape the
"managed_service" panel removed in fix 9 (above) expected — this is
confirmed to be that panel's real, previously-unexplained backend, not a
coincidence.

**Decision: revive it as a real, documented, opt-in alternative — not
just file the code in inert.** This walks back part of this README's
"nothing is on a vendor server" framing to **"nothing on a vendor server
by default — an explicit opt-in path exists."** Concretely:

- The service itself is filed at `inference-service/` (see that
  directory's own `README.md` for layout, a known gap — `sql/migrate.js`
  was referenced but never uploaded — and exactly what is and isn't
  wired up yet).
- `1_Config_And_Deploy.gs` gained `CFG.INFERENCE_MODE` (`'STUDIO'` default,
  `'MANAGED_SERVICE'` opt-in) and two new `CFG.PROP` keys for the
  service's URL/API key (deployment-specific Script Properties, never
  hardcoded).
- `3_Queue_Processor.gs`'s `getQueueMetrics()` gained a `managed_service`
  field, populated by the new `_getManagedServiceStatus_()` helper — it
  calls the service's `/api/v1/account` endpoint and returns `null`
  (panel stays hidden) unless `CFG.INFERENCE_MODE` is `'MANAGED_SERVICE'`
  **and** both Script Properties are set. In the default `STUDIO` mode
  this is always `null` — the "nothing on a vendor server by default"
  claim is enforced in code, not just prose.
- `8_WebApp_UI.html`'s `renderServiceStatus()` and its call site are
  restored, gated the same way — it was already written to hide itself
  when passed a falsy account, so no new gating logic was needed there,
  only a non-null `managed_service` value to react to.

**What is explicitly NOT wired up**: the service's `POST /api/v1/jobs`
webhook — the actual inference hand-off — has no caller anywhere in this
repo's `.gs` files. `10_Turnstile.gs` still only knows about native
Studio inference. `MANAGED_SERVICE` mode today gets you a working
account-status panel if you deploy the service and paste in credentials;
it does not yet make `STUDIO_ACTIVE` rows actually route to this service
instead of Studio. That integration is real, unbuilt work, tracked here
so it isn't assumed to already exist.

### A duplicate `resetProperties()` gas-lint's first version missed

After fixing the errors gas-lint's first release found (see
`tools/gas-lint/README.md`), a manual double-check of an earlier code
review's findings turned up a real duplicate `resetProperties()` — one
copy in `1_Config_And_Deploy.gs`, one in `5_Error_And_Utilities.gs` — that
gas-lint itself had reported zero errors for. Root cause: its
comment/string stripper didn't recognize regex literals as a token type,
so a `{`/`}`-containing regex somewhere earlier in
`5_Error_And_Utilities.gs` threw off the brace-depth counter for the rest
of the file, hiding every top-level declaration after that point from the
duplicate-declaration check. Fixed in the tool (regex-literal detection
added to `stripCommentsAndStrings`), which then correctly caught this
exact case on re-run. The two `resetProperties()` copies weren't just
redundant — `1_Config_And_Deploy.gs`'s version was missing
`'KOS_ADMIN_EMAIL'` from its preserved-key list, so if GAS's load order
had resolved to that definition, calling `resetProperties()` would have
silently wiped the daily-digest admin email until someone noticed. Kept
the more complete version in `5_Error_And_Utilities.gs`, removed the
other.

### The dedup checks never actually deduplicated

`_generateLogUUID(text)` used to return `'LOG-{currentTimestamp}-{8-char
MD5 hash}'`. Every duplicate-detection check that uses this ID
(`sensor1_scanInboundSessions`, `submitSessionLog`) compares it against
previously-stored IDs via `startsWith()` to answer "has this content
already been queued?" — but two calls on identical text produced
different timestamps, so the strings never shared a prefix and the check
could never fire. The same session log submitted twice (double-click,
retry after a timeout) was silently chunked, queued, and processed twice,
duplicating `CURRENT_STATE` entries, pivots, action items, and vector
scores. Fixed by dropping the timestamp entirely — the ID is now purely
content-derived (`'LOG-{hash}'`), so identical content always produces
the identical ID. Verified no other caller (`9_UI_Diagnostics.gs`'s
council-session ID, `sensor3_externalTelemetry`'s per-row telemetry ID)
depended on the embedded timestamp for its own uniqueness — both already
supply time-varying input text of their own.

While in there, also fixed `submitExternalData()`'s separate, unrelated
dead-code duplicate-detection path: it relied on `_queuePayload`'s
`fileId` check, which compares a brand-new Drive file ID (always unique,
freshly created every call) against existing `FILE_ID` values, so its
"Duplicate: this content has already been queued" branch could never
fire. Added a real `PAYLOAD_UID`-based check (same pattern as the
session-log paths, now that the UID is deterministic), checked before
creating the Doc rather than after.

### Dashboard "Pending" tile was double-counting active rows

`renderQueue()` in `8_WebApp_UI.html` set the "Pending" tile (subtitle
"waiting for AI engine") to `pending + active`, while the "Processing"
tile right next to it (subtitle "AI running now") showed `active` alone —
e.g. 2 `PENDING_FLOW` + 3 `STUDIO_ACTIVE` rows displayed as "Pending: 5,
Processing: 3," so summing the two tiles double-counted the 3 rows
already processing. Wrong numbers on the one surface an operator actually
looks at day to day. Fixed to show each tile's own bucket only.

### Stuck `ERROR:` rows now retry or archive instead of accumulating forever

`processInferenceQueue()` had two paths that wrote a bare `'ERROR: ...'`
status onto a `STAGING_PIPELINE` row: a missing-`File_ID` case, and a
catch-all around reading/parsing the payload doc. Neither path had any
retry logic, and `archiveStagingPipeline()`'s terminal-status list (in
`5_Error_And_Utilities.gs`) only recognizes specific named prefixes —
`FAILED_PARSE`, `PHASE_2_ERROR`, `INTAKE_ERROR`, etc. — none of which a
plain `'ERROR:'` string matches via `startsWith()`. So these rows were
both unretryable and un-archivable: permanently stuck in
`STAGING_PIPELINE`, accumulating forever. Fixed with two named,
purpose-built statuses:
- **`MISSING_FILE_ID`** — genuinely non-retryable (there's nothing to
  read regardless of retry count), set immediately, added to the
  terminal list so it archives on the next sweep.
- **`PROCESSING_ERROR`** — the catch-all case now retries like the
  existing JSON-parse-failure path: the row's status is left as
  `FLOW_COMPLETE` (already true going into the failed attempt) with its
  retry count bumped, so the next queue run picks it back up
  automatically; only after `CFG.MAX_RETRIES` does it escalate to the
  named terminal `PROCESSING_ERROR` status, which is also now recognized
  by `archiveStagingPipeline()`.

### `_semanticChunker` now actually honors its own size limit

`_semanticChunker()` is documented to return chunks each `≤
CFG.MAX_CHUNK_SIZE` characters, but a single `CFG.DELIMITER`-bounded
block bigger than the limit on its own (or the whole text, if no
delimiter is present at all) was returned as one over-limit chunk
unchanged — the guarantee was aspirational, not enforced. `STUDIO_INTEGRATION_SPEC.md`
explicitly assumes chunks are already under the limit when diagnosing
truncated Studio output, so an oversized chunk produced truncated/failed
inference that got misdiagnosed as a Studio-side problem rather than an
unsplit chunk. Fixed with a new `_splitOversizedBlock_()` helper: greedily
accumulates by paragraph (`\n\n`) first to preserve natural breaks, and
falls back to raw fixed-length slicing only if a single paragraph is
itself still oversized (a pathological, one-unbroken-wall-of-text case).
Verified against several synthetic cases (normal chunking, an oversized
delimiter-bounded block with internal paragraphs, a no-delimiter
oversized blob, and an empty-string edge case) standalone before landing —
every returned chunk honors the limit and no content is lost.

### `inference-service`'s four bugs — fixed even though it's still not wired to Turnstile

Found during the same review that found everything else above, fixed
opportunistically since they were cheap and self-contained:
- **`db.js`'s `markJobFailed`** referenced the JS parameter `retry`
  as a bare SQL identifier inside a `CASE` expression instead of binding
  it — Postgres parsed it as a reference to a nonexistent `retry` column,
  so the query failed with "column \"retry\" does not exist" on every
  single call (every failure path in `worker.js`), leaving failed jobs
  stuck in `'processing'` forever with no error recorded. Bound as a
  query parameter instead.
- **`inference.js`** validated every job's output — including
  `COG_STIMULUS` jobs — against one `OUTPUT_SCHEMA` requiring
  `session_summary`/`dynamic_state`/`vector_weights`/`alignment_report`,
  but `buildCouncilSystemPrompt` explicitly instructs `COG_STIMULUS` jobs
  to return only `{session_uid, cog_registry}`. The model followed
  instructions correctly and validation failed anyway — no
  `COG_STIMULUS` job could ever succeed. Added a dedicated
  `COG_STIMULUS_OUTPUT_SCHEMA` matching what's actually requested.
- **`billing.js`**'s Stripe webhook handler read
  `session.subscription?.plan?.id` to determine which tier a customer
  just subscribed to, but `session.subscription` in a Checkout Session
  webhook payload is a plain string ID, not an expanded object — `.plan`
  on a string is always `undefined`. Every subscription (including paid
  "professional"/"creator" tiers) silently fell back to `'starter'` and
  500 credits, and every monthly renewal after that reset credits to the
  same wrong amount. Fixed by retrieving the real subscription object via
  a separate Stripe API call and reading its actual price ID.
- **`server.js`**'s webhook signature check recomputed the HMAC over
  `JSON.stringify(req.body)` — a re-serialization of the already-parsed
  body, not the bytes actually sent — so any difference in serialization
  between the sender and Node broke a legitimate signature. Fixed using
  Express's standard `verify` callback to capture the real raw bytes
  alongside the parsed body, and signing those instead.

---

## Architecture in Two Paragraphs

Sessions flow through a five-stage pipeline. Sensor 1 scans a Drive folder for new session documents every 5 minutes and creates rows in STAGING_PIPELINE with status `PENDING_FLOW`. The Turnstile (running every 5 minutes) releases rows one at a time to `STUDIO_ACTIVE`. Workspace Studio picks up `STUDIO_ACTIVE` rows, runs inference on the session text, writes structured JSON back to the document, and sets status to `FLOW_COMPLETE`. The Queue Processor (running every 10 minutes) finds `FLOW_COMPLETE` rows, parses the JSON, and fans the data out to ten downstream ledgers via the JSON Drip architecture. Each branch — current state, pivots, session log, cog registry, action register, vector routing, shadow matrix — is isolated so a failure in one doesn't stop the others.

The shadow matrix is the system's calibration model. It maintains confidence intervals for five operator values (admin ghost, relational targets, necessary struggle, prime directive, temporal constraints) and updates them passively from each processed session's alignment observations. At 0.75 confidence, a value is marked VERIFIED and auto-populated into the system's operator properties. The daily primer assembles current vector state, shadow matrix status, and the operator's 90-day vision into a session-ready context document every morning at 06:00. The sequestered council (SMP-002) creates one isolated stimulus document per AI persona, queues them through the same pipeline, and collects independent verdicts in the COG_REGISTRY.

---

## File Structure

```
appsscript.json            OAuth scopes, web app config                    ✅ in repo — scopes verified against actual code usage, clean
1_Config_And_Deploy.gs     CFG constants, deploy, triggers                 ✅ in repo — all documented CFG keys present, 10-trigger install
2_Ingestion_Sensors.gs     Sensor 1 (Drive), Sensor 2 (webhook), Sensor 3   ✅ in repo
3_Queue_Processor.gs       Queue processor, processIntakePayload           ✅ in repo — getQueueMetrics() + shadow matrix hook added
4_Vector_Router.gs         Vector routing, incubator, decay, promotion     ✅ in repo
5_Error_And_Utilities.gs   Error log, daily digest, utilities              ✅ in repo — shadow matrix + completeOnboarding() added
6_Governance.gs            Mutations, sweepers, council simulation         ✅ in repo — daily primer + auto-council check added
7_WebApp.gs                doGet, doPost, server functions                 ✅ in repo — doGet() template-evaluates mode; getInboundFolderUrl() added
8_WebApp_UI.html           Mobile web app (Ingest / Queue / Diagnostics)   ✅ in repo — all server calls now backed; managed_service panel removed
9_UI_Diagnostics.gs        HITL functions, Socratic onboarding, menu       ✅ in repo
10_Turnstile.gs            Matrix turnstile state machine                 ✅ in repo — rebuilt against the real schema (original in archived/)
KOS_PHASE0_PATCHES.gs      v5.4 migration patch (DO NOT add to v8.0 project) — not needed
KOS_GAPS_AND_FIXES.gs      Reference document only (DO NOT add to project)   — not needed
inference-service/         Optional Node.js managed-inference backend     ✅ filed in — see Round 3 above + its own README
rtp-core-router/protocols/ 10 governance/protocol docs                    ✅ filed in — see Round 3 above
```

All 7 persona cog docs are now in `rtp-core-router/` (`ARCHITECT`, `AUDITOR`,
`MUSE`, `DEVELOPER`, `CURATOR`, `ALIGNMENT`, plus the Core Router itself).
Two of them carry unreconciled duplicate versions kept side by side rather
than picked between (`PERSONA_DEVELOPER_V5_3.md` vs `PERSONA_DEVELOPER_V5.pdf`;
`PERSONA_CURATOR_v5.3.pdf` vs `PERSONA_CURATOR_V5.pdf`) — low-stakes,
revisit if it ever matters which is live. `PIVOTS_AND_LESSONS.gdoc` and
`CORE_THESIS` are still not pre-seeded — these are Drive documents the
deployed system creates on first run (`deployFullSystem()` /
`completeOnboarding()`), not code files, so this is expected, not a gap.

---

## Status Lifecycle

```
Sensor creates chunk       PENDING_FLOW
Turnstile releases         PENDING_FLOW  →  STUDIO_ACTIVE
Studio processes           STUDIO_ACTIVE →  FLOW_COMPLETE
Queue processor            FLOW_COMPLETE →  PROCESSED
JSON parse failure         FLOW_COMPLETE →  NEEDS_CURATOR (retry 1-2)
Retry cap hit              NEEDS_CURATOR →  FAILED_PARSE
Council cog stimulus       COG_STIMULUS  (separate payload type)
```

---

## Key Configuration (CFG in 1_Config_And_Deploy.gs)

| Constant | Default | Effect |
|---|---|---|
| `MAX_CHUNK_SIZE` | 25000 | Max characters per chunk doc (was 8000 in the originally delivered file — fixed) |
| `TURNSTILE_CONCURRENCY` | 1 | Max concurrent STUDIO_ACTIVE rows |
| `TURNSTILE_STALE_MINS` | 30 | Minutes before stuck STUDIO_ACTIVE resets |
| `SHADOW_VERIFY_THRESHOLD` | 0.75 | Confidence to mark a shadow question VERIFIED |
| `COUNCIL_AUTO_TRIGGER_SESSIONS` | 5 | Sessions between auto-council checks |
| `INFERENCE_MODE` | `'STUDIO'` | `'STUDIO'` (default, no vendor server) or `'MANAGED_SERVICE'` (opt-in — see Round 3 above) |
| `DECISION_MULTIPLIER` / `EXPLORATORY_MULTIPLIER` | 1.5 / 1.0 | Exchange-type weight in sentence-level vector aggregation |
| `INCUBATOR_PROMOTION_THRESHOLD` | 3.0 | Cumulative score needed to promote a theme out of the Incubator |
| `INCUBATOR_HALF_LIFE_DAYS` | 14 | Days for an untouched Incubator theme's score to halve |
| `INCUBATOR_DECAY_FLOOR` | 0.10 | Cumulative score below which a theme is marked DECAYED |
| `REGISTRAR_MICROBATCH_SIZE` | 3 | Registrar/Cog Relay files released per 15-min gate pass |
| `REGISTRAR_RETRY_LIMIT` | 3 | Consecutive bounce-backs before CRITICAL_FAILURE |

---

## Installed Triggers

| Handler | Schedule | Purpose |
|---|---|---|
| `sensor1_scanInboundSessions` | Every 5 min | Scans 03.5_INBOUND_SESSIONS for new docs |
| `runMatrixTurnstile` | Every 5 min | Releases PENDING_FLOW → STUDIO_ACTIVE |
| `processInferenceQueue` | Every 10 min | Processes FLOW_COMPLETE rows |
| `runSemanticSweeper` | Hourly | Routes CE-tagged files to correct folders |
| `sweepRootForExhaust` | Hourly | Catches CE: / KOS: docs in Drive root |
| `sendDailyErrorReport` | Daily 08:00 | Emails ERROR_LOG digest to admin |
| `generateDailyPrimer` | Daily 06:00 | Creates session starter doc |
| `autoCouncilCheck` | Every 2 hours | Fires council when session threshold met |
| `sensor3_externalTelemetry` | onChange | Watches BRAIN_TRUST_INDEX for external data |
| `onGovernanceEdit` | onEdit | Watches Blackboard Deploy_Trigger checkbox |
| `runRegistrarIntake` | Daily 01:00 | Scans 09_Unclassified_Curriculum_Drafts for new files |
| `runRegistrarMicrobatch` | Every 15 min | Registrar concurrency gate + stale-row reset |
| `runRegistrarProcessor` | Every 10 min | Registrar validation, translation, and routing |

---

## Before deploying a change — run gas-lint

`node tools/gas-lint/check.js` at the repo root checks for the exact bug
class that's hit this system before: duplicate top-level declarations,
undefined `CFG`/`CFG.PROP` keys, `google.script.run` calls with no
matching server function, and OAuth scopes used but not declared in
`appsscript.json` (this is how the Round 3 `UrlFetchApp` regression —
added without adding `script.external_request` — was caught). See
[`tools/gas-lint/README.md`](../tools/gas-lint/README.md).

## Vector weight calculation — a second Studio flow, GAS does the math

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

**What this doesn't include yet:** the Studio-side Inference Flow itself
isn't built — the spec above is what to build it against. Once it
exists, wiring `2_Ingestion_Sensors.gs` to queue a paired
`VECTOR_CLASSIFY` row alongside each `SESSION_LOG` chunk (sharing the
same `Payload_UID` so the two flows' outputs correlate to one session)
is flagged as an open integration question in the spec doc — it depends
on how session consolidation actually works against the real, multi-chunk
Studio setup, which isn't visible from this repo.

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

## Registrar / Cog Relay — curriculum-drafts auditing pipeline

A second, independent pipeline (`11_Registrar_CogRelay.gs`), built from 4
uploaded design docs, unrelated to the session-log pipeline above —
different intake ([UNC], not a Studio paste-in), a different ledger
(`REGISTRAR_LEDGER`, not `STAGING_PIPELINE`), and a different purpose:
auditing curriculum drafts for structural completeness and pedagogical
dissonance, not distilling session logs.

**What this plugs into that already existed.** The 7 "Calibration Silo"
folders this pipeline deposits into (`04.1_ARCHITECT_SILO` …
`04.7_RTP_SILO`) were already live — built by `_buildFolderTree()` and
already wired into `6_Governance.gs`'s CE-tag router. What's new is the
pipeline that actually produces per-persona JSON and deposits it there
automatically, rather than relying on a file already being CE-tagged.

**The pipeline, in one line per stage:** `runRegistrarIntake` (nightly,
scans `09_Unclassified_Curriculum_Drafts`) → `runRegistrarMicrobatch`
(every 15 min, turnstile-style concurrency gate — 2-3 files at a time, per
the source docs) → a Studio flow (Stage 1, "Auditor") extracts a Master
Schema → `runRegistrarProcessor` structurally validates it (JSON.parse +
key presence — the "Quant Gate") → a second Studio flow (Stage 2,
"Curator") verifies Stage 1's output against the source text and computes
a `dissonance_delta_score` against `05_Vector_Repository` → GAS validates
again, then builds a Markdown briefing, deposits each Cog's data block
into its Calibration Silo, and routes the file. A malformed or judged-
invalid output at any point bounces back to an earlier stage (the
"Bounce-Back Mechanism"); 3 consecutive bounces on the same file escalates
to `CRITICAL_FAILURE` and fires a Chat alert (Fail Loud Protocol) instead
of retrying forever.

**The Apollo Kill-Switch.** If Stage 1 sets
`intervention_triage.human_intervention_required: true`, the pipeline
halts that file at `AWAITING_CARBON`, moves it to `09.1_HOLD_FOR_REVIEW`,
and fires an immediate Chat alert — no further automation touches that
file until a teacher calls `clearInterventionTriage(fileId)` from the
Apps Script editor.

**Two synthesis decisions made building this, not specified by the source
docs:**
1. **Stage naming.** The two source docs disagreed on which cog does
   which stage — `Master_Operations_Guide.pdf` calls Stage 1 "Formatter"
   and Stage 2 "Auditor"; `Cog_data_flow.txt` calls them "Auditor" and
   "Curator" respectively. This repo adopted `Cog_data_flow.txt`'s
   naming (Stage 1 = Auditor, Stage 2 = Curator) since it matches this
   repo's own persona definitions elsewhere. See
   `REGISTRAR_STAGE1_AUDITOR_PROMPT.md`'s header if this needs revisiting
   — it's a naming-only change, not structural.
2. **Master Vector Primer.** The Ops Guide names a comparison corpus for
   dissonance scoring without saying what it is; this repo pointed Stage
   2 at the existing `05_Vector_Repository` docs rather than creating a
   new, separate primer doc.

Also undecided by the source docs, defaulted rather than guessed at:
"target UID folders" for a successfully-routed file are never specified
beyond "[HLD] for review" as the failure path — every successfully-routed
file currently lands in `06_CLASSROOM_ASSETS` itself (not a subfolder)
via `CFG.REGISTRAR_ROUTED_FOLDER`, pending a real per-type routing rule.

**What this doesn't include yet:** the two Studio flows themselves aren't
built — `REGISTRAR_STAGE1_AUDITOR_PROMPT.md` and
`REGISTRAR_STAGE2_CURATOR_PROMPT.md` are what to build them against, same
convention as `VECTOR_CLASSIFY_PROMPT.md`. Not wired into the web app UI
yet — `getRegistrarStatus()` is the read surface a future Diagnostics tab
would call.

**Naming note (Aligner vs. Alignment).** The Calibration Silo folder is
named `04.5_ALIGNER_SILO` / tagged `CE-ALIGN`, but every persona doc in
this repo (`PERSONA_ALIGNMENT_V5.md`, the `LICENSE`'s Fidelity Clause,
`CFG.FIDELITY_REQUIRED_PERSONA`) calls this cog ALIGNMENT. Same class of
issue as the SMP-002 naming collision noted above — cosmetic, not two
different cogs. `CFG.PERSONAS` used to list `PERSONA_ALIGNER` as if it
were an 8th, separate persona to copy from Drive on deploy; no such file
has ever existed, so `deployFullSystem()` silently logged "Not found in
Drive — skipped" for it on every real run. Removed; see
`1_Config_And_Deploy.gs`'s `PERSONAS` array for the fix note. The
`ALIGNER` folder/property names themselves are left alone — renaming live
Drive folders and PropertiesService keys is a bigger, riskier change than
fixing this one list.

## Version control (clasp) — scaffolded, not yet connected

This directory is already laid out exactly the way
[clasp](https://github.com/google/clasp) wants — a single flat folder,
one Apps Script project, `appsscript.json` already present. A
`.clasp.json.template` and `.claspignore` (allowlisting only the real
`.gs`/`.html`/`appsscript.json` files — everything else here, including
`archived/` and the separate Node.js `inference-service/`, is excluded)
are now in place. What's left is entirely credentialed and can't be done
from a repo session: run `clasp login` against the real Google account,
then `clasp clone <scriptId>` (pulls the actual live project down,
byte-for-byte) or `clasp create` if starting fresh, and drop the real
`scriptId` into a `.clasp.json` copied from the template — never
committed, same convention as real Sheet/Doc IDs living in Script
Properties, not source. See
[`meta/CLASP_AND_APPS_SCRIPT.md`](../meta/CLASP_AND_APPS_SCRIPT.md) for
the full rationale and cas-ccps's harder version of this problem (7
overlapping Apps Script projects, not 1).

---

## Where to Start

- **First deploy:** See `DEPLOYMENT_GUIDE.md`
- **Using the web app:** See `USER_GUIDE.md`
- **Building the Studio integration:** See `STUDIO_INTEGRATION_SPEC.md`
- **Understanding the data model:** See `SCHEMA_REFERENCE.md`
- **Debugging a specific issue:** Check ERROR_LOG sheet in BRAIN_TRUST_INDEX
- **Licensing:** See `LICENSE` (Polyform Noncommercial 1.0.0 + Fidelity Clause)
- **Positioning / "why this exists":** See `KOS_WHITE_PAPER.md`
- **Ideas parked for later, not in progress:** See
  `EXTERNAL_REFERENCE_Digital_Homesteading_TAIS.md`
- **Curriculum-drafts auditing pipeline:** See
  `11_Registrar_CogRelay.gs` and its two Studio prompt files
  (`REGISTRAR_STAGE1_AUDITOR_PROMPT.md`, `REGISTRAR_STAGE2_CURATOR_PROMPT.md`)

---

## What KOS Is Not

KOS is not a note-taking tool. It does not replace Notion, Obsidian, or any document-based knowledge tool. It is a processing pipeline that sits between your AI sessions and your structured knowledge stores. You still think in sessions with an AI — KOS is what happens to those sessions after they end.

KOS is not a SaaS product. It is infrastructure you deploy and maintain. When something breaks, you fix it. The code is readable and the error log is descriptive, but there is no support team.

KOS is not finished. The Studio integration that closes the loop between STAGING_PIPELINE and structured inference is the critical unbuilt piece. Until it is complete, the queue requires a manual `devSetFlowComplete()` step to advance rows. Everything else is operational.

---

## License

[Polyform Noncommercial 1.0.0](LICENSE). Free for personal, educational, and
research use. Commercial entities must negotiate a separate commercial
license — see `LICENSE` for the full text and contact terms.

**Fidelity Clause** — any commercial license requires preserving three
architectural elements in the derivative deployment, unmodified:

1. **The Alignment Cog** — the ALIGNMENT persona (or functional equivalent)
   stays active, retains authority to pause a session sequence when human
   relational bandwidth is threatened, and cannot be suppressed, weighted
   below 0.10 RID, or removed.
2. **The HITL Firewall** — no autonomous writes to canonical documents, no
   external communications, no mutations to persistent state without
   explicit human verification.
3. **The Cold Engine Protocol** — the system stays inert until the user has
   articulated their own `CORE_THESIS`; no pre-loaded generic or
   vendor-defined thesis.
