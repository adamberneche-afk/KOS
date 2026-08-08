# Knowledge Operating System v8.0
### The Headless Studio Edition

KOS is a personal intelligence infrastructure built on Google Apps Script. It captures your AI working sessions, extracts structured knowledge from them, and routes that knowledge to the right places in a system you own. Everything — your data, your processing logic, your folder hierarchy — lives in your Google account. Nothing is on a vendor server.

The core problem it solves: you spend hours in AI sessions making decisions, building expertise, and generating insight. At the end of each session, almost all of that value disappears. You might copy a few action items. KOS routes everything — vector weights, state updates, action items, pivots, cog verdicts — automatically, so your system gets smarter with every session rather than resetting to zero.

---

## Architecture in Two Paragraphs

Sessions flow through a five-stage pipeline. Sensor 1 scans a Drive folder for new session documents every 5 minutes and creates rows in STAGING_PIPELINE with status `PENDING_FLOW`. The Turnstile (running every 5 minutes) releases rows one at a time to `STUDIO_ACTIVE`. Workspace Studio picks up `STUDIO_ACTIVE` rows, runs inference on the session text, writes structured JSON back to the document, and sets status to `FLOW_COMPLETE`. The Queue Processor (running every 10 minutes) finds `FLOW_COMPLETE` rows, parses the JSON, and fans the data out to ten downstream ledgers via the JSON Drip architecture. Each branch — current state, pivots, session log, cog registry, action register, vector routing, shadow matrix — is isolated so a failure in one doesn't stop the others.

The shadow matrix is the system's calibration model. It maintains confidence intervals for five operator values (admin ghost, relational targets, necessary struggle, prime directive, temporal constraints) and updates them passively from each processed session's alignment observations. At 0.75 confidence, a value is marked VERIFIED and auto-populated into the system's operator properties. The daily primer assembles current vector state, shadow matrix status, and the operator's 90-day vision into a session-ready context document every morning at 06:00. The sequestered council (SMP-002) creates one isolated stimulus document per AI persona, queues them through the same pipeline, and collects independent verdicts in the COG_REGISTRY.

---

## File Structure

```
appsscript.json            OAuth scopes, web app config
1_Config_And_Deploy.gs     CFG constants, deploy, triggers, persona scaffolding
2_Ingestion_Sensors.gs     Sensor 1 (Drive), Sensor 2 (webhook), Sensor 3 (telemetry)
3_Queue_Processor.gs       Queue processor, processIntakePayload, JSON drip
4_Vector_Router.gs         Vector routing, incubator, decay, promotion
5_Error_And_Utilities.gs   Error log, daily digest, shadow matrix, daily primer
6_Governance.gs            Turnstile edit handler, mutations, sweepers, council
7_WebApp.gs                doGet (BOOTSTRAP|OPERATIONAL), doPost, server functions
8_WebApp_UI.html           Mobile web app (Ingest / Queue / Diagnostics)
9_UI_Diagnostics.gs        HITL functions, Socratic onboarding, diagnostics menu
10_Turnstile.gs            Matrix turnstile state machine, queue metrics
KOS_PHASE0_PATCHES.gs      v5.4 migration patch (DO NOT add to v8.0 project)
KOS_GAPS_AND_FIXES.gs      Reference document only (DO NOT add to project)
```

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
