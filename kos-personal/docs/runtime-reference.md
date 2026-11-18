# Status lifecycle, configuration, triggers and editor-only functions

Split out of `kos-personal/README.md` on 2026-11-17; the README maps where everything is.

## Status Lifecycle

```
Sensor creates chunk       PENDING_FLOW
Turnstile releases         PENDING_FLOW  →  STUDIO_ACTIVE
Studio stalls too long     STUDIO_ACTIVE →  PENDING_FLOW (stale reset, stale count++)
Stale resets exceed cap    STUDIO_ACTIVE →  STUDIO_TIMEOUT (terminal — no Flow ever completed it)
Studio processes           STUDIO_ACTIVE →  FLOW_COMPLETE
Queue processor            FLOW_COMPLETE →  PROCESSED
Audit fails, under cap     FLOW_COMPLETE →  PENDING_FLOW (priority retry — see AUDIT_LOG)
Audit fails past cap       FLOW_COMPLETE →  AUDIT_REJECTED (terminal — human review required)
JSON parse failure         FLOW_COMPLETE →  NEEDS_CURATOR (retry 1-2)
Retry cap hit              NEEDS_CURATOR →  FAILED_PARSE
Council cog verdict        COG_VERDICT  (submitCogVerdict(), skips PENDING_FLOW/STUDIO_ACTIVE entirely)
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
| `INFERENCE_MODE` | `'STUDIO'` | `'STUDIO'` (default, no vendor server) or `'MANAGED_SERVICE'` (opt-in — see CHANGELOG.md for how this was added, and `archive/inference-service/README.md` for the service, archived 2026-11-17: `MANAGED_SERVICE` has nothing to call) |
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
| `generateDailyPrimer` | Daily 06:00 | Creates the session starter doc; rewrites `KOS_LATEST_PRIMER` and the three briefing docs |
| `autoCouncilCheck` | Every 2 hours | Generates a Seven Bridges stimulus when the session threshold is met — the operator still fans it out |
| `sensor3_externalTelemetry` | onChange | Watches BRAIN_TRUST_INDEX for external data |
| `onGovernanceEdit` | onEdit | Watches Blackboard Deploy_Trigger checkbox; deploys only a row whose Status is APPROVED, one tick at a time (a paste over several boxes deploys nothing, unticks them and toasts "Tick one row at a time; nothing was deployed") |
| `runRegistrarIntake` | Daily 01:00 | Scans 09_Unclassified_Curriculum_Drafts for new files |
| `runRegistrarMicrobatch` | Every 15 min | Registrar concurrency gate + stale-row reset |
| `runRegistrarProcessor` | Every 10 min | Registrar validation, translation, and routing |
| `buildStudioInputRows` | Every 1 min | Writes CuratorInput / VectorClassifyInput rows for STUDIO_ACTIVE payloads |
| `harvestStudioReturns` | Every 5 min | Harvests STUDIO_RETURN rows into the payload docs and sets FLOW_COMPLETE |
| `reportDeployVersion` | Every 6 hours | Reports the deploy marker (no-op without `DEPLOY_DRIFT_GITHUB_TOKEN`) |
| `archiveFinishedStagingRows` | Daily 02:00 | Moves finished STAGING_PIPELINE rows to STAGING_ARCHIVE; failed rows stay |

All 17 are installed by `setupAllTriggers()` (`KOS_TRIGGER_HANDLERS` in `1_Config_And_Deploy.gs`).

## Editor-only functions

The `onOpen()` menu (`9_UI_Diagnostics.gs`) never shows: this deployment is a
standalone project, not bound to BRAIN_TRUST_INDEX (D16, 2026-11-01). Run its
items from the Apps Script editor's **Run** menu instead:

| Function | What it does |
|---|---|
| `openWebApp` | Logs the web app's URL |
| `buildSessionContext` | Builds the session-context paste for a new chat |
| `generateSevenBridgesStimulus` / `sevenBridgesReview` | The Seven Bridges stimulus, and its status and verdict |
| `consolidateInferenceChunks` | Consolidates a session's inference chunks |
| `checkOnboardingProgress`, `auditCalibrationHealth`, `verifyFidelityClause`, `checkLicenseCompliance` | Read-only checks |
| `dumpAllPropertiesUI` | Lists the Script Properties |
| `runSocraticOnboarding`, `updateRelationalTargets` | Advisor personalization |
| `generateLicenseReport` | The license report |
| `deployFullSystem` | Re-runs the full deploy |
| `nuclearWipeForRelease` | Irreversible wipe; read it before running |
| `installStudioReturnTrigger` | Installs `harvestStudioReturns` every 5 minutes on an instance deployed before `12_StudioReturnHarvest.gs` existed (`setupAllTriggers` installs it on a fresh deploy); safe to run again. Not on the menu |
| `runKosPersonalPreflightNow` | Runs `runKosPersonalPreflight()` and shows (or, standalone, logs) how many checks passed; the Preflight tab has the detail. Not on the menu |
| `previewMoralDebt` / `resetMoralDebt` | SMP-019's moral debt counter (`23_MoralDebt.gs`): the primer's line, changing nothing; or set the counter to 0 from now. Not on the menu |
| `getKOSCalibration` | Reads one calibration weight (a Script Property) by key; logs `[CALIBRATION_MISSING]` if it isn't set. Not on the menu, and nothing calls it: a check by hand after `setupCalibration` |

Any of these that shows a dialog (`getUi()`) can't do so from a standalone
project; read the function before relying on it from the editor.
