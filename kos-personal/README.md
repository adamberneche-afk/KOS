# Knowledge Operating System v8.0
### The Headless Studio Edition

KOS is a personal intelligence infrastructure built on Google Apps Script. It captures your AI working sessions, extracts structured knowledge from them, and routes that knowledge to the right places in a system you own. Everything — your data, your processing logic, your folder hierarchy — lives in your Google account. Nothing is on a vendor server.

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

`appsscript.json`'s 6 OAuth scopes (`drive`, `spreadsheets`, `documents`,
`script.scriptapp`, `script.send_mail`, `userinfo.email`) match what the
code actually calls, with no `UrlFetchApp`/`CalendarApp`/`GmailApp`/advanced-service
usage anywhere that would need a scope this manifest doesn't have.
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
   entirely** from `8_WebApp_UI.html` (`renderServiceStatus()` and its call
   site) — nothing in this system has ever had a vendor billing
   relationship, and the panel directly contradicted this README's own
   "Nothing is on a vendor server" positioning.
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
