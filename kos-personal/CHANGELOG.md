# KOS Changelog

Historical record of what was found and fixed during this system's reconciliation and UI/UX hardening passes. Split out of `README.md` so that file can stay current-state-only reference — see it for what's true today; see this file for how it got there.

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
   already documented. (`MAX_CHUNK_SIZE` is `25000`, changed from `8000` in
   the originally delivered file — see the Key Configuration table below,
   which has always had this right; this note previously and incorrectly
   said the opposite.)
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
`CURRENT_STATE_DRAFT*.md` variants (two of the three — v1 and fresh_pass —
were later archived to `rtp-core-router/archived/`; `_v2.md` remains the
live copy), `HEREDITARY_WATCHLIST.md`,
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
  directory's own `README.md` for layout and exactly what is and isn't
  wired up).
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

**Update — this gap is now closed.** `10_Turnstile.gs` now actually
routes to the managed service — see "`10_Turnstile.gs` now actually
routes to the managed service" below for the full writeup. Left the
original wording above (in the four-bugs section) as the historical
record of what was true when those bugs were fixed.

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

### `inference-service`'s four bugs — fixed before it was wired to Turnstile

**Update:** the wiring gap this heading originally referred to is now
closed — see "`10_Turnstile.gs` now actually routes to the managed
service" below. Left here unchanged as the historical record of the 4
bugs found and fixed in this file before that wiring existed.

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

### `10_Turnstile.gs` now actually routes to the managed service

Closes the gap the section above and "The managed inference service —
revived as an optional path" both flagged: `CFG.INFERENCE_MODE ===
'MANAGED_SERVICE'` got you a working account-status panel, but nothing
anywhere ever called the service's `POST /api/v1/jobs` webhook — a row
released to `STUDIO_ACTIVE` in that mode just sat there forever, since
there's no Studio watching it and nothing else ever submitted the job.
(This item briefly also appeared mislabeled as a **cas-ccps** gap in an
earlier planning pass — cas-ccps has no `inference-service`,
`INFERENCE_MODE`, or `MANAGED_SERVICE` concept anywhere in it; this was
always a kos-personal-only gap, and is fixed here once, not twice.)

- New `_submitManagedServiceJob_(payloadUid, fileId, docUrl, payloadType)`
  in `3_Queue_Processor.gs`, next to the existing `_getManagedServiceStatus_()`.
  POSTs to the real `/api/v1/jobs` endpoint with the exact body shape
  `server.js` expects (`payload_uid`/`file_id`/`doc_url`/`payload_type`),
  sends `X-KOS-API-Key`, and — when the new `CFG.PROP.MANAGED_SERVICE_WEBHOOK_SECRET`
  Script Property is configured — signs the raw JSON body with HMAC-SHA256
  and sends `X-KOS-Signature: sha256=<hex>`, matching `server.js`'s
  `validateWebhookSignature` byte-for-byte (verified with a Node harness
  that computes the same signature both ways and confirms they match
  exactly). The secret is optional, same as the service's own "skip in
  dev if not configured" behavior — job submission still runs unsigned if
  it's unset.
- `10_Turnstile.gs`'s `runMatrixTurnstile()` calls this immediately before
  releasing a `PENDING_FLOW` row, but only when `CFG.INFERENCE_MODE ===
  'MANAGED_SERVICE'` — in the default `'STUDIO'` mode this whole path is
  skipped and the release loop is byte-for-byte unchanged from before this
  fix. A row only advances to `STUDIO_ACTIVE` if the submission succeeds;
  a failed submission (network error, unconfigured credentials, non-201
  response) leaves the row in `PENDING_FLOW` to retry on the next 5-minute
  run, rather than releasing it to a status nothing will ever pick up out
  of. The existing staleness reset (`CFG.TURNSTILE_STALE_MINS`) remains
  the safety net for a job the service accepted but never finished — no
  new polling logic needed, since the service's own `worker.js` already
  writes results back to Drive and sets `FLOW_COMPLETE` directly using
  its stored OAuth connection, without GAS needing to ask.
- Verified with a Node harness that loads the real `10_Turnstile.gs` +
  `_submitManagedServiceJob_` code into a VM sandbox with mocked
  `UrlFetchApp`/`PropertiesService`: confirms `STUDIO` mode makes zero
  managed-service calls and releases exactly as before; `MANAGED_SERVICE`
  mode submits the real row data and only releases on success; a failed
  submission leaves the row `PENDING_FLOW` without burning a concurrency
  slot; an unconfigured deployment makes no network call at all; and the
  signature header is present only when a secret is configured, with the
  exact `sha256=<64-hex>` format the service expects.

---

## UI/UX Hardening — Rounds 1–9

After the reconciliation work above landed, this codebase went through nine
further rounds of dedicated UI/UX auditing — each round re-examined the
whole UI against everything already fixed, then split its findings into a
bugs commit and a separate polish commit. What follows is kos-personal's
share of that record; see cas-ccps's and leader-hub's own READMEs for
theirs. Commit hashes are given so any item's full diff/rationale can be
looked up directly.

**Round 1** (`d37f3c4`, `1a51e22`, `a6b74d5`) — the initial pass. Notable
bugs: `handlePrimer()` reported success unconditionally on any resolved
RPC, regardless of `res.success`; the Arm button's visibility gated on
`all_verified`, which could reach true before onboarding ever ran, hiding
the only path into it (fixed via a new `engine_armed` field); three
Diagnostics loaders (`loadShadowMatrix`/`loadVectorState`/`loadWebhookUrl`)
had no error handler and stuck on "Loading…" forever on failure; and
**`submitArmEngine()` read wizard answers via `getElementById` after
`renderArmStep()` had already replaced the DOM, silently submitting every
answer from steps 1–3 empty** — now captured into a persistent object
across step transitions. Also: Research/Context ingestion gained the
oversized-payload guard Session Log already had; a vector-score display
clamp bug (label could exceed 100% while its bar capped at 100%) was
fixed; and a broad polish sweep covered bootstrap time-estimate copy,
plain-language engine-mode labels, WCAG-AA contrast, keyboard-operable
webhook-copy, an ingest-draft localStorage autosave, and motion polish
(spinner, vector bars, bootstrap stagger) with `prefers-reduced-motion`
overrides throughout.

**Round 2** (`3a8ebf7`) — every Diagnostics panel's failure state gained
an inline Retry button; `archiveStagingPipeline()` started returning a
success/failure breakdown instead of a bare count (previously silently
swept up intake-failed rows with no indication); webhook-copy gained an
`execCommand` fallback; the Arm modal gained real focus management,
Escape-to-close, and a confirm-passphrase field (a single-entry passphrase
field meant one typo silently produced a different Identity Key); research
title got `maxlength="100"` matching the server's existing silent
truncation; and several small consistency/feedback gaps (timestamp
format, stale hints, duplicate-submission styling) were closed.

**Round 3** (`f63bcae`, `4bb4491`) — fixed the admin-email health check
returning the truthy literal `'not set'` (dead client warning branch); an
email-masking regex that left short local-parts (under 3 chars) fully
unmasked; an ingest character counter measuring untrimmed length while
the server validated trimmed length; and whitespace-only research titles
bypassing the "Untitled" fallback. Also added: real dialog semantics
(`role="dialog"`, Tab-trap) to the Arm modal; aria-live regions to 5
previously-silent status elements; and, notably, **fixed a race where all
7 Diagnostics action buttons shared one unguarded status line, so a
slower call's response could overwrite a faster, more-recently-started
action's result** — closed with a generation-token guard
(`beginDiagAction()`/`showDiagStatus(...,token)`) that every later round's
new status-line code was required to follow (see Rounds 7–9 below for two
places that convention was violated by mistake and then caught).

**Round 4** (`641633c`, `ce39d09`) — **fixed failed-queue-row invisibility**:
`getQueueMetrics()`/`getQueueStatus()` excluded every terminal-failure
status from all counts, so a stuck row — even a new user's very first
submission — was invisible everywhere and could make the whole queue
read as empty; added a shared `TERMINAL_FAILED_STATUSES` list and a
visible "Failed" tile. Also fixed 3 Diagnostics actions that caught their
own exceptions and returned the same shape a benign no-op did, rendering
real failures with neutral styling; added real `<label for>` associations
across the Ingest tab and Arm modal; fixed a calibration-weight guard bug
in `completeOnboarding()` that could keep stale weights forever after a
failed-then-retried onboarding attempt; and fixed `switchType()`
unconditionally hiding the large-paste guard panel on tab-switch.

**Round 5** (`40229bd`, `a5dd7fd`) — **added `LockService.getScriptLock()`
to `archiveStagingPipeline()`**, the only `STAGING_PIPELINE` row-deleting
writer with no lock; a concurrent trigger run could hold a stale row
number across a delete-induced row shift and write a status onto the
wrong row. Also locked `submitSessionLog`/`submitExternalData`/
`handleCogExhaust`'s check-then-append sequences against a
duplicate-submission race, and converted `.tip-icon` from hover-only
native tooltips to a tap/click-to-toggle popover with real ARIA wiring
(no touch equivalent existed before).

**Round 6** (`8273ed4`, `803ba1f`) — fixed `getWebAppUrl()` returning a
bare fallback *string* on failure that the client then treated as a real,
copyable webhook URL; fixed `triggerCouncilSimulation()` rendering lock
contention and "nothing changed since last run" as red errors instead of
neutral, routine outcomes; standardized Personalize/Personalized spelling
(mixed US/UK across 4 sites in one flow); fixed 4+ instances of lazy
`"(s)"` pluralization; and added pending-state (icon/label swap) to the 6
Diagnostics action buttons that hadn't gotten it yet.

**Round 7** (`5f1c4d2`, `12730fb`) — **found that Round 5's own tip-icon
fix hadn't reached the Arm modal's Step-3 tip-icons** (Admin Ghost /
Necessary Struggle) — they're injected via `renderArmStep()`'s innerHTML
swap after `_tipInit()`'s one-time boot pass already ran; made `_tipInit()`
idempotent and re-invoked per step. Also fixed 2 more `"(s)"`
pluralization instances, tip-popover position going stale on scroll/resize,
and — a real regression this round caught in itself —
**`.btn:disabled`'s blanket opacity was dimming the very "Sending…/
Saving…" pending-state labels it was supposed to make legible.**

**Round 8** (`3fd08da`, `cef3700`) — **found that the prior round's own
aria-live countdown announcement bypassed the Round-3 generation-token
guard** (passed no token, never called `beginDiagAction()`); fixed. Also
fixed `deployFullSystem()`'s `success` flag being tied to whether *any*
sub-step failed, fatal or not, even though each sub-step is deliberately
non-fatal by design — this made the client's dedicated "N non-fatal
issues" neutral-message branch permanently unreachable, so any partial
failure always rendered the harsher red "finished with errors" message.
Renamed the jargon "Queue Payload" submit button to "Submit."

**Round 9** (`0d433eb`, `513424f`) — **fixed a real data-loss bug**: the
tip-popover's Escape handler and the Arm-modal's Escape handler both
lived on `document` with no `stopImmediatePropagation`, so pressing
Escape while a Step-3 tip popover was open closed the tip *and*
immediately closed the whole Arm wizard in the same keystroke —
`closeArmModal()` unconditionally resets `armStep`/`armAnswers`, silently
wiping every answer entered across all 4 steps. Also fixed
`handleBootstrap()` never clearing stale `active`/`done`/`err` classes
before a retry, so a step that failed once and then succeeded on retry
could render with a success checkmark in error-red text.

