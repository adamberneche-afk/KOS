# Knowledge Operating System v8.0
### The Headless Studio Edition

KOS is a personal intelligence infrastructure built on Google Apps Script. It captures your AI working sessions, extracts structured knowledge from them, and routes that knowledge to the right places in a system you own. Everything — your data, your processing logic, your folder hierarchy — lives in your Google account. Nothing is on a vendor server.

The core problem it solves: you spend hours in AI sessions making decisions, building expertise, and generating insight. At the end of each session, almost all of that value disappears. You might copy a few action items. KOS routes everything — vector weights, state updates, action items, pivots, cog verdicts — automatically, so your system gets smarter with every session rather than resetting to zero.

---

## ✅ Code-complete: every file in this README's own file-structure list is now present

`appsscript.json`, all 9 numbered `.gs` files, and `8_WebApp_UI.html` are all in this directory now — the full list this README specifies in "File Structure" below, minus the two files it explicitly says not to add (`KOS_PHASE0_PATCHES.gs`, `KOS_GAPS_AND_FIXES.gs`). That's a milestone, but it doesn't mean the system is deployable yet — see the mismatches below, none of which are resolved by having all the files.

One genuinely clean result: `appsscript.json`'s 6 OAuth scopes (`drive`, `spreadsheets`, `documents`, `script.scriptapp`, `script.send_mail`, `userinfo.email`) match what the code actually calls — checked against every `DriveApp`/`DocumentApp`/`SpreadsheetApp`/`ScriptApp`/`MailApp`/`Session` call across all 9 files, with no `UrlFetchApp`, `CalendarApp`, `GmailApp`, or advanced-service usage anywhere that would need a scope or `dependencies` entry this manifest doesn't already have. `executeAs: "USER_DEPLOYING"` correctly corresponds to the deployment guide's "Execute as: Me" instruction. `runtimeVersion: "V8"` is required and present (the code uses optional chaining and destructuring throughout).

One soft note: `webapp.access` is set to `"MYSELF"`. That matches the deployment guide's stated default ("Only myself... change to Anyone with Google account if you want to share the URL"), but Sensor 2 (the `doPost` webhook for `COG_EXHAUST`, documented in `7_WebApp.gs`'s own header as accepting POSTs from external tools) will likely need broader access to actually receive unauthenticated external POSTs. Worth deciding deliberately at deploy time rather than leaving the restrictive default in place if the webhook is meant to be used.

## ⚠️ The delivered code does not match this file's own documentation

Reading the 9 `.gs` files and the HTML against this README, `STUDIO_INTEGRATION_SPEC.md`, and `SCHEMA_REFERENCE.md` turned up real divergences — not typos, structural ones:

1. **No `STUDIO_ACTIVE` status anywhere in the delivered code.** This README, the deployment guide, and the Studio integration spec all describe a 3-state pipeline — `PENDING_FLOW` → (Turnstile releases one at a time) → `STUDIO_ACTIVE` → (Studio infers) → `FLOW_COMPLETE`. The actual `3_Queue_Processor.gs` and `2_Ingestion_Sensors.gs` only ever use `PENDING_FLOW` and `FLOW_COMPLETE` — Studio is expected to poll `PENDING_FLOW` directly and flip straight to `FLOW_COMPLETE`. There is no concurrency-gating step in the delivered pipeline at all.
2. **No shadow matrix implementation.** Central to this README's "Architecture in Two Paragraphs" section (5 operator values, confidence intervals, 0.75 auto-verify threshold) — absent from all 9 delivered files. Nothing computes, stores, or reads a shadow matrix.
3. **No daily primer generator.** `generateDailyPrimer` (documented here as firing daily at 06:00) doesn't exist in any delivered file, and `setupAllTriggers()` in `1_Config_And_Deploy.gs` never installs it.
4. **No auto-council trigger.** `autoCouncilCheck` (documented as firing every 2 hours once `COUNCIL_AUTO_TRIGGER_SESSIONS` sessions have accumulated) doesn't exist. The delivered council functions (`triggerCouncilSimulation`, `generateCouncilInputPayload`) are manual-only, gated by a "stasis guard" that just checks whether `CURRENT_STATE` changed since the last run — no session counter, no auto-fire.
5. **`CFG` constants don't match.** This README lists `MAX_CHUNK_SIZE = 25000`; the delivered `1_Config_And_Deploy.gs` sets `MAX_CHUNK_SIZE: 8000`. `TURNSTILE_CONCURRENCY`, `TURNSTILE_STALE_MINS`, `SHADOW_VERIFY_THRESHOLD`, and `COUNCIL_AUTO_TRIGGER_SESSIONS` — all documented below — don't exist anywhere in the delivered `CFG` object.
6. **Trigger count mismatch.** The "Installed Triggers" table below lists 10 handlers. `setupAllTriggers()` installs exactly 6 (`sensor1_scanInboundSessions`, `processInferenceQueue`, `sendDailyErrorReport`, `runSemanticSweeper`, `sweepRootForExhaust`, `sensor3_externalTelemetry`). `onGovernanceEdit` exists but is installed by a separate manual call (`installGovernanceTrigger()`) that `setupAllTriggers()` never invokes. `runMatrixTurnstile`, `generateDailyPrimer`, and `autoCouncilCheck` are never installed by anything — two of the three don't even exist as functions.
7. **`10_Turnstile.gs` doesn't fit the rest of the codebase at all** — see the dedicated note below.

**Practical implication:** treat this README, `DEPLOYMENT_GUIDE.md`, `USER_GUIDE.md`, `STUDIO_INTEGRATION_SPEC.md`, and `SCHEMA_REFERENCE.md` as describing an *aspirational* or *prior-version* design, not the code that's actually in this directory. Before deploying, decide which is the source of truth — likely the code, since it's the more recently uploaded and more concretely specific artifact — and update the docs (or the code) to match. Don't assume the doc-described behavior (shadow matrix, daily primer, Turnstile concurrency gating) exists just because it's written up in detail.

### `10_Turnstile.gs` — kept, but flagged as inconsistent

This file is real (it was uploaded alongside the other 8), but it doesn't belong stylistically or functionally with them:

- Every other file opens with a `// FILE X of 8` header and closes with an `// END <filename>` footer naming the next file in sequence. `10_Turnstile.gs` has neither — it opens with an old-style `CE-CODE: Matrix_Turnstile_Engine v1.5` block instead.
- `9_UI_Diagnostics.gs`'s own closing manifest says `ALL 9 FILES COMPLETE` and lists exactly 9 files (1 through 9) — Turnstile isn't one of them, by the codebase's own count.
- It reads `STAGING_PIPELINE` columns named **`Status`** (col D) and **`Payload`** (col E), and operates on status values **`PENDING_INFERENCE`** / **`IN_PROCESS`**. Every other delivered file uses the `CFG.STAGING_COLS` map — `Payload_Type` (not `Payload`), `Status` at a different index — and the status values `PENDING_FLOW` / `FLOW_COMPLETE` / `NEEDS_CURATOR` / etc. These are incompatible schemas; if `runMatrixTurnstile()` ran against the real `STAGING_PIPELINE` sheet the other 8 files write to, its column lookups would silently return the wrong data.
- It also reads `PropertiesService` key `ID_BRAIN_TRUST_INDEX`, while every other file uses `INDEX_ID` for the same spreadsheet.

Read together with point 1 above, this looks like a leftover from an earlier (v5.4-era, "CE-CODE" style) draft that was never updated for v8.0's actual `STAGING_PIPELINE` schema. **Do not deploy this file as-is alongside the other 8** without first reconciling it — or rewriting it — to match `CFG.STAGING_COLS` and the `PENDING_FLOW`/`FLOW_COMPLETE` lifecycle the rest of the system actually uses.

### `8_WebApp_UI.html` — calls server functions that don't exist

This one is a concrete deploy-blocker, not just a documentation gap. The HTML client calls `google.script.run.<fnName>()` for a number of functions that aren't defined in *any* of the 9 `.gs` files:

| Called by the HTML | Exists server-side? | Impact |
|---|---|---|
| `executeBootstrap()` | ❌ No — real function is `deployFullSystem()` | The **first screen a new user sees** ("Build My Studio" bootstrap) calls a function that doesn't exist. First deploy is broken as delivered. |
| `completeOnboarding(payload)` | ❌ No — real onboarding is `runSocraticOnboarding()`, a `ui.prompt()`-based wizard that needs a spreadsheet UI context, not a JSON-payload callable | The entire "Personalize your advisor" 4-step bottom-sheet modal has no backend. Tapping it throws. |
| `getQueueMetrics()` | ❌ No — real function is `getQueueStatus()`, with a **different response shape** (`{pending,ready,needs_curator,processed}` vs. the HTML's expected `{queued,pending,active,needs_review,needs_curator,processed}` plus a `managed_service` block) | Queue tab can't render even if the name were fixed — the shapes don't line up either. |
| `getShadowMatrixStatus()` | ❌ No — no shadow matrix exists at all (see point 2 above) | Diagnostics tab's "Ambient Calibration" section and the header status dot have no data source. |
| `generateDailyPrimer()` | ❌ No (see point 3 above) | "Generate today's session starter" button throws. |
| `getInboundFolderUrl()` | ❌ No | The large-payload folder-drop panel's link never populates. |

**Also a real bug, not a missing function:** `doGet()` in `7_WebApp.gs` calls `HtmlService.createHtmlOutputFromFile('8_WebApp_UI')` — plain file output, not a template. But `8_WebApp_UI.html` expects server-side scriptlet evaluation (`<?= mode ?>` on line ~779) to inject `'BOOTSTRAP'` or `'OPERATIONAL'`. Since the file is never evaluated as a template, that literal text is never substituted, `SERVER_MODE` never equals `'BOOTSTRAP'`, and the app **always** falls through to the `OPERATIONAL` branch on load — meaning the bootstrap screen (broken per above, but still) would never even display; a brand-new deployment would show the operational UI with nothing set up. Fixing this requires switching `doGet()` to `HtmlService.createTemplateFromFile(...).evaluate()` and having it pass a `mode` variable — neither of which the delivered `doGet()` does.

**One more, lower-severity:** `triggerCouncilSimulation()` (real) creates a single doc instructing the model to "Act as ARCHITECT, AUDITOR, and MUSE independently" — not the 7 separate, isolated, per-persona stimulus docs the sequestered-council design (SMP-002, "Seven Bridges") calls for. That's consistent with SMP-002 still being `PENDING USER APPROVAL` per `9_UI_Diagnostics.gs`'s `sevenBridgesReview()` — the real sequestered version was never built. But the HTML's copy ("Queuing 7 isolated cog stimuli…", "7 cogs queued for independent review") is hardcoded to always say 7 regardless of what actually happened (`res.queued` doesn't exist on the real response, so `(res.queued || []).length || 7` always falls through to the literal `7`). Not a crash, but actively misleading about what just ran.

**Also present, and unexplained by anything else in this repo:** the Queue tab's `renderServiceStatus()` renders a "Managed Inference" panel with a subscription tier and credit balance (`account.credit_balance`, `account.subscription_tier`). Nothing in any `.gs` file, or in any other doc in this repo, describes a subscription/credits system — it directly contradicts this README's own "Nothing is on a vendor server" positioning. Whether this is vestigial UI from a different (possibly commercial SaaS) variant of the product, or a forward-looking stub for a feature not built yet, isn't something this repo's contents can answer — worth checking with whoever's maintaining the source.

---

## Architecture in Two Paragraphs

Sessions flow through a five-stage pipeline. Sensor 1 scans a Drive folder for new session documents every 5 minutes and creates rows in STAGING_PIPELINE with status `PENDING_FLOW`. The Turnstile (running every 5 minutes) releases rows one at a time to `STUDIO_ACTIVE`. Workspace Studio picks up `STUDIO_ACTIVE` rows, runs inference on the session text, writes structured JSON back to the document, and sets status to `FLOW_COMPLETE`. The Queue Processor (running every 10 minutes) finds `FLOW_COMPLETE` rows, parses the JSON, and fans the data out to ten downstream ledgers via the JSON Drip architecture. Each branch — current state, pivots, session log, cog registry, action register, vector routing, shadow matrix — is isolated so a failure in one doesn't stop the others.

The shadow matrix is the system's calibration model. It maintains confidence intervals for five operator values (admin ghost, relational targets, necessary struggle, prime directive, temporal constraints) and updates them passively from each processed session's alignment observations. At 0.75 confidence, a value is marked VERIFIED and auto-populated into the system's operator properties. The daily primer assembles current vector state, shadow matrix status, and the operator's 90-day vision into a session-ready context document every morning at 06:00. The sequestered council (SMP-002) creates one isolated stimulus document per AI persona, queues them through the same pipeline, and collects independent verdicts in the COG_REGISTRY.

---

## File Structure

```
appsscript.json            OAuth scopes, web app config                    ✅ in repo — scopes verified against actual code usage, clean
1_Config_And_Deploy.gs     CFG constants, deploy, triggers                 ✅ in repo (see note below re: doc mismatch)
2_Ingestion_Sensors.gs     Sensor 1 (Drive), Sensor 2 (webhook), Sensor 3   ✅ in repo
3_Queue_Processor.gs       Queue processor, processIntakePayload           ✅ in repo
4_Vector_Router.gs         Vector routing, incubator, decay, promotion     ✅ in repo
5_Error_And_Utilities.gs   Error log, daily digest, utilities              ✅ in repo (no shadow matrix / daily primer — see note)
6_Governance.gs            Mutations, sweepers, council simulation         ✅ in repo (no Turnstile handler — see note)
7_WebApp.gs                doGet, doPost, server functions                 ✅ in repo
8_WebApp_UI.html           Mobile web app (Ingest / Queue / Diagnostics)   ✅ in repo (calls several missing server fns — see note above)
9_UI_Diagnostics.gs        HITL functions, Socratic onboarding, menu       ✅ in repo
10_Turnstile.gs            Matrix turnstile state machine                 ⚠️ in repo but schema-inconsistent — see note above
KOS_PHASE0_PATCHES.gs      v5.4 migration patch (DO NOT add to v8.0 project) — not needed
KOS_GAPS_AND_FIXES.gs      Reference document only (DO NOT add to project)   — not needed
```

Also still missing: 6 of 7 persona cog docs (only `PERSONA_DEVELOPER` is in `rtp-core-router/`), `PIVOTS_AND_LESSONS.gdoc`, and `CORE_THESIS` — these are Drive documents the deployed system expects to find/create, not code files, so they're a first-run/onboarding concern rather than a missing-upload concern.

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
| `MAX_CHUNK_SIZE` | 25000 | Max characters per chunk doc |
| `TURNSTILE_CONCURRENCY` | 1 | Max concurrent STUDIO_ACTIVE rows |
| `TURNSTILE_STALE_MINS` | 30 | Minutes before stuck STUDIO_ACTIVE resets |
| `SHADOW_VERIFY_THRESHOLD` | 0.75 | Confidence to mark a shadow question VERIFIED |
| `COUNCIL_AUTO_TRIGGER_SESSIONS` | 5 | Sessions between auto-council checks |

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

---

## Where to Start

- **First deploy:** See `DEPLOYMENT_GUIDE.md`
- **Using the web app:** See `USER_GUIDE.md`
- **Building the Studio integration:** See `STUDIO_INTEGRATION_SPEC.md`
- **Understanding the data model:** See `SCHEMA_REFERENCE.md`
- **Debugging a specific issue:** Check ERROR_LOG sheet in BRAIN_TRUST_INDEX

---

## What KOS Is Not

KOS is not a note-taking tool. It does not replace Notion, Obsidian, or any document-based knowledge tool. It is a processing pipeline that sits between your AI sessions and your structured knowledge stores. You still think in sessions with an AI — KOS is what happens to those sessions after they end.

KOS is not a SaaS product. It is infrastructure you deploy and maintain. When something breaks, you fix it. The code is readable and the error log is descriptive, but there is no support team.

KOS is not finished. The Studio integration that closes the loop between STAGING_PIPELINE and structured inference is the critical unbuilt piece. Until it is complete, the queue requires a manual `devSetFlowComplete()` step to advance rows. Everything else is operational.

---

## License

Polyform Noncommercial 1.0.0. Free for personal, educational, and research use.  
Commercial use: honor system with attribution — "Built on KOS."  
Fidelity clause: preserve PERSONA_ALIGNMENT and the HITL Firewall in any adaptation.
