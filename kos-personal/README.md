# Knowledge Operating System v8.0
### The Headless Studio Edition

KOS is a personal intelligence infrastructure built on Google Apps Script. It captures your AI working sessions, extracts structured knowledge from them, and routes that knowledge to the right places in a system you own. Everything — your data, your processing logic, your folder hierarchy — lives in your Google account. **By default**, nothing is on a vendor server — see `CFG.INFERENCE_MODE` in the Key Configuration table below for the one explicit, opt-in exception.

The core problem it solves: you spend hours in AI sessions making decisions, building expertise, and generating insight. At the end of each session, almost all of that value disappears. You might copy a few action items. KOS routes everything — vector weights, state updates, action items, pivots, cog verdicts — automatically, so your system gets smarter with every session rather than resetting to zero.

---

## Status quo, and how it got here

This README documents the system as it is today. The full history of what was found and fixed — the original reconciliation pass, the Round 3 reupload batch, and nine rounds of dedicated UI/UX hardening — is in [`CHANGELOG.md`](./CHANGELOG.md), split out from here so this file stays a current-state reference instead of a changelog with documentation mixed in.

> **Status (2026-10-22).** The place to plan and decide is the KOS Claude
> Project ([`claude-project/`](./claude-project/README.md),
> `meta/PLAN_2026-10.md`); the RTP Gem and `RTP_CORE_ROUTER_V6_0.md` are
> frozen. Both Studio Flows (Curator and VECTOR_CLASSIFY) are built by hand
> in Studio: their Ask Gemini steps read the `FlowPrompts` tab, and their
> last step is a native add-row into `STUDIO_RETURN`, which
> `harvestStudioReturns()` writes back. The 2026-10-22 web app changes
> (plain words and a ❓ Terms panel, the "Needs you" strip, failed items
> with Retry, the advisor panel review, an archive that keeps failed rows,
> nothing stored in the browser) are merged and live. Ingestion D and E
> (#336: Sensor 2's duplicate guard, at most 20 rows a queue run,
> `logQueueMetrics()`) were pushed 10-29; `archive/2026-27-Q1/meta/HANDOFF_2026-10-29.md`
> is the current handoff. Still the operator's: the data
> repairs in [`HANDOFF_2026-09-28.md`](../archive/2026-27-Q1/kos-personal/HANDOFF_2026-09-28.md) (requeue
> the terminal backlog with `19_StagingRequeue.gs` or Queue → Failed items
> → Retry, and the `VECTOR_MATRIX` repair in `21_VectorMatrixRepair.gs`);
> the primer's Data Quality block shows what is left.
>
> History: on 2026-09-29 the Curator Flow's Ask-a-Gem steps became Ask
> Gemini steps reading `FlowPrompts`, which fixed its persona-shaped output
> (the 2026-09-20 export's 114 harvest failures), so the rebind
> [`STUDIO_REBIND_HANDOFF.md`](../archive/2026-27-Q1/kos-personal/STUDIO_REBIND_HANDOFF.md) describes was
> never needed (that file is closed).

---

## File Structure

`archived/` and `archived/legacy-pre-v8/` (external product review,
Finding 3 / "this month" dead-code cleanup) were removed from the working
tree. Nothing is lost — the full pre-deletion tree is preserved on the
`pre-archive-cleanup` branch, and every commit before this cleanup still
has it in history.

```
appsscript.json            OAuth scopes, web app config                    ✅ in repo — scopes verified against actual code usage, clean
1_Config_And_Deploy.gs     CFG constants, deploy, triggers                 ✅ in repo — all documented CFG keys present, 17-trigger install
2_Ingestion_Sensors.gs     Sensor 1 (Drive), Sensor 2 (webhook), Sensor 3   ✅ in repo
3_Queue_Processor.gs       Queue processor, processIntakePayload           ✅ in repo — getQueueMetrics() + shadow matrix hook added
4_Vector_Router.gs         Vector routing, incubator, decay, promotion     ✅ in repo
5_Error_And_Utilities.gs   Error log, daily digest, utilities              ✅ in repo — shadow matrix, completeOnboarding(), onboarding close-out, staging archive
6_Governance.gs            Mutations, sweepers, Seven Bridges council      ✅ in repo — daily primer, auto-council check, getCouncilReviewForWebApp()
7_WebApp.gs                doGet, doPost, server functions                 ✅ in repo — doGet() template-evaluates mode; getInboundFolderUrl() added
8_WebApp_UI.html           Mobile web app (Add / Queue / System tabs)      ✅ in repo — plain words + ❓ Terms panel (GLOSSARY), "Needs you" strip and tab badges, failed items with Retry, advisor panel review; nothing stored in the browser (drafts in page memory); managed_service panel gated behind CFG.INFERENCE_MODE
9_UI_Diagnostics.gs        HITL functions, Socratic onboarding, menu       ✅ in repo
10_Turnstile.gs            Matrix turnstile state machine                 ✅ in repo — rebuilt against the real schema (original was in archived/, removed — see the dead-code cleanup note below)
11_Registrar_CogRelay.gs   Curriculum-drafts auditing pipeline (Registrar) ✅ in repo — see "Registrar / Cog Relay" below
12_StudioReturnHarvest.gs  STUDIO_RETURN harvest, groundedness gate        ✅ in repo
13_StudioInputBuilder.gs   CuratorInput / VectorClassifyInput rows         ✅ in repo
14_StudioFlowBuildSpec.gs  FlowBuildSpec tab                               ✅ in repo
15_Preflight.gs            runKosPersonalPreflight()                       ✅ in repo
16_FlowPrompts.gs          FlowPrompts tab (generated from the prompt .md files) ✅ in repo
17_DeployVersionReport.gs  reportDeployVersion() (deploy-drift)            ✅ in repo
18_DeployVersionMarker.gs  Deploy SHA marker (stamped, never hand-edited)  ✅ in repo
19_StagingRequeue.gs       previewStagingRequeue() / requeueStagingBatch(); getFailedQueueRows() / retryFailedRow() for the web app ✅ in repo
20_VectorClassifySessions.gs  Per-session classify parts and backfill      ✅ in repo
21_VectorMatrixRepair.gs   Duplicates, rederive, unrebuildable-row reset   ✅ in repo
22_BriefingDocs.gs         Notebook briefing docs, DECISION_REGISTER       ✅ in repo
23_MoralDebt.gs            SMP-019 moral debt counter (primer line)        ✅ in repo
24_RegistrarFlows.gs       The Registrar's two Studio flows, Apps Script half ✅ in repo — see "Registrar / Cog Relay" below
25_VectorDocs.gs           Vector Item Labeler flow (Apps Script half) + VECTOR_* docs compiled from its labels (Stage 2's standard) ✅ in repo — see "Registrar / Cog Relay" below
26_WeeklyReview.gs         Mails the Sunday build review on Monday (or says it is missing) ✅ in repo
27_FidelitySample.gs       Randomized closeout-fidelity draw (10%), FIDELITY_AUDIT, the primer's Fidelity line ✅ in repo
archive/inference-service/ Optional Node.js managed-inference backend — ARCHIVED 2026-11-17 (dormant since D16; needs Google Cloud, off for the district)
rtp-core-router/protocols/ governance/protocol docs                       ✅ filed in — see CHANGELOG.md. SMPs aren't kept here: `SMP_REGISTER` + `01.3_SMP_PROPOSALS` (meta/SMP_PROCESS.md)
claude-project/            Claude Project instructions, session-log format, flows briefing ✅ in repo — replaces the RTP Gem (meta/PLAN_2026-10.md); FLOWS_BRIEFING.md (2026-11-15) tells the RTP what each pipeline behind its signals is for
docs/                      One doc per feature, split out of this README on 2026-11-17 — see "Features" below and docs/README.md
archive/studio-steps/      Archived custom Studio steps — SEPARATE Apps Script project, unpublishable without GCP; see its own README
```

All 6 persona cog docs, plus the Core Router doc itself (7 files total —
6 personas, not 7, correcting an earlier miscount here), are now in
`rtp-core-router/` (`ARCHITECT`, `AUDITOR`, `MUSE`, `DEVELOPER`, `CURATOR`,
`ALIGNMENT`, plus the Core Router). `CFG.PERSONAS` (`1_Config_And_Deploy.gs`)
is the real, current source of truth for this — 6 entries, matching this
list exactly; "Seven Bridges" (the sequestered-council feature's own name,
see Architecture above) is aspirational branding, not a literal persona count.
Two of them carried duplicate versions — **now reconciled**: extracting the
PDF text and cross-checking each version's schema against what
`3_Queue_Processor.gs` actually reads at runtime confirmed
`PERSONA_DEVELOPER_V5_3.md` and `PERSONA_CURATOR_V5.pdf` (not `v5.3.pdf`,
despite the higher-looking version number) are canonical; the other file
in each pair is a superseded draft. The Curator PDF's exact content has
since been confirmed against a clean-source copy and re-saved as
`PERSONA_CURATOR_V5.md` (PDF retired), matching the Developer file's
already-Markdown format. **Update (folded in from an external review
pass — Addendum 22 R6):** all six persona docs, including both of these,
were later reissued together as `PERSONA_*_V5_1.md` — Developer's version
number runs backwards on purpose there (V5.1 replacing V5.3 with more
correct content); see `rtp-core-router/README.md`'s own note on this
before assuming canonicality from either file's number. See that file for
the full
evidence. `PIVOTS_AND_LESSONS.gdoc` and
`CORE_THESIS` are still not pre-seeded — these are Drive documents the
deployed system creates on first run (`deployFullSystem()` /
`completeOnboarding()`), not code files, so this is expected, not a gap.

---

## Before deploying a change — run gas-lint

`node tools/gas-lint/check.js` at the repo root checks for the exact bug
class that's hit this system before: duplicate top-level declarations,
undefined `CFG`/`CFG.PROP` keys, `google.script.run` calls with no
matching server function, and OAuth scopes used but not declared in
`appsscript.json` (this is how the Round 3 `UrlFetchApp` regression —
added without adding `script.external_request` — was caught). See
[`tools/gas-lint/README.md`](../tools/gas-lint/README.md).

## Version control (clasp) — pushed with `run.js`

This directory's main flat folder is laid out the way
[clasp](https://github.com/google/clasp) wants — a single flat folder,
one Apps Script project, `appsscript.json` present. `.claspignore`
allowlists only the real `.gs`/`.html`/`appsscript.json` files (everything
else here, including `archive/` (the archived Node.js inference service
among it), is excluded), and `.clasp.json.template` shows the
shape of the real `.clasp.json`. The real `.clasp.json` and the list of
live web app deployments are never committed: they live in the operator's
`clasp-registry` folder outside the checkout. The operator pushes with
`node run.js --latest` ([`tools/clasp-sync/README.md`](../tools/clasp-sync/README.md)),
which runs `clasp push`, cuts one version and promotes each listed web app
deployment onto it, so the `/exec` URL never changes. See
[`meta/CLASP_AND_APPS_SCRIPT.md`](../meta/CLASP_AND_APPS_SCRIPT.md) for
the rationale and cas-ccps's harder version of this problem.

**Archived: a second project that could never be published on this account.**
[`archive/2026-27-Q1/kos-personal/archive/studio-steps/`](../archive/2026-27-Q1/kos-personal/archive/studio-steps/README.md) — the custom
Workspace Studio steps behind the Curator and VECTOR_CLASSIFY flows
(`WriteCuratorOutputStep.gs`, `WriteClassificationOutputStep.gs`, plus
shared helpers). A custom step is a Workspace Add-on and needs a standard,
non-default Cloud project; GCP is disabled org-wide for `ccpsnet.net`, so
these install without error and never appear in Studio's picker. The
write-back half they implemented now lives in `12_StudioReturnHarvest.gs`
(`harvestStudioReturns()`), with the Flow's last step a native add-row into
`STUDIO_RETURN`. The project is kept because a district admin enabling GCP
would make it reachable again with no code change. It's a standalone project, not sheet/doc-bound, and it's
deliberately a *different* Apps Script project from the main one above —
not a shared global scope — even though it deploys the same flat-folder
way. See its own README for its file list, deployment steps, and the two
still-open design questions it carries forward.

---

## Where to Start

- **First deploy:** See `DEPLOYMENT_GUIDE.md`
- **Using the web app:** See `USER_GUIDE.md`
- **The 21-day onboarding and its close-out:** See `ONBOARDING_CLOSEOUT_2026-10-13.md` (`previewOnboardingCloseOut()`, then `closeOutOnboarding()`)
- **Building the Studio integration:** See `STUDIO_INTEGRATION_SPEC.md` — and read its top banner first: the write-back half is no longer a custom step. `archive/studio-steps/`'s two steps cannot be published on this account (GCP is disabled org-wide for `ccpsnet.net`), so the Flow's last step is a native "add row to sheet" into `STUDIO_RETURN` and `12_StudioReturnHarvest.gs`'s `harvestStudioReturns()` writes the document and sets `FLOW_COMPLETE`. [`archive/studio-steps/README.md`](../archive/2026-27-Q1/kos-personal/archive/studio-steps/README.md) carries the same status banner and stays accurate for an account that has GCP access.
- **Understanding the data model:** See `SCHEMA_REFERENCE.md`
- **Debugging a specific issue:** Check ERROR_LOG sheet in BRAIN_TRUST_INDEX
- **Licensing:** See `LICENSE` (Polyform Noncommercial 1.0.0 + Fidelity Clause)
- **Positioning / "why this exists":** See `KOS_WHITE_PAPER.md`
- **External ideas parked for later (two now landed, see its own status
  note):** See `EXTERNAL_REFERENCE_Digital_Homesteading_TAIS.md`
- **Curriculum-drafts auditing pipeline:** See
  `11_Registrar_CogRelay.gs` and its two Studio prompt files
  (`REGISTRAR_STAGE1_AUDITOR_PROMPT.md`, `REGISTRAR_STAGE2_CURATOR_PROMPT.md`)

---

## What KOS Is Not

KOS is not a note-taking tool. It does not replace Notion, Obsidian, or any document-based knowledge tool. It is a processing pipeline that sits between your AI sessions and your structured knowledge stores. You still think in sessions with an AI — KOS is what happens to those sessions after they end.

KOS is not a SaaS product. It is infrastructure you deploy and maintain. When something breaks, you fix it. The code is readable and the error log is descriptive, but there is no support team.

KOS is not finished. Both Studio Flows run, but they are built by hand in Studio's UI (`FlowBuildSpec` and `FlowPrompts` tabs), and some repairs (the terminal backlog, the `VECTOR_MATRIX` repair) are run by the operator from the editor. `devSetFlowComplete()` is only for testing without Studio.

---

## Features

Each feature's detail is in its own doc under `docs/` ([index](docs/README.md)).

- **[Architecture in Two Paragraphs](docs/architecture.md)**: "Sessions flow through a five-stage pipeline." "The shadow matrix is the system's calibration model." Then "**What sequestration does and does not guarantee.**"
- **[Status lifecycle, configuration, triggers and editor-only functions](docs/runtime-reference.md)**
  - [Status Lifecycle](docs/runtime-reference.md#status-lifecycle): every `STAGING_PIPELINE` status, from "Sensor creates chunk `PENDING_FLOW`" to the terminal `STUDIO_TIMEOUT`, `AUDIT_REJECTED` and `FAILED_PARSE`.
  - [Key Configuration](docs/runtime-reference.md#key-configuration-cfg-in-1_config_and_deploygs): the `CFG` constants with their defaults, `INFERENCE_MODE` among them.
  - [Installed Triggers](docs/runtime-reference.md#installed-triggers): "All 17 are installed by `setupAllTriggers()` (`KOS_TRIGGER_HANDLERS` in `1_Config_And_Deploy.gs`)."
  - [Editor-only functions](docs/runtime-reference.md#editor-only-functions): "The `onOpen()` menu (`9_UI_Diagnostics.gs`) never shows: this deployment is a standalone project, not bound to BRAIN_TRUST_INDEX (D16, 2026-11-01)."
- **[Vector weight calculation — a second Studio flow, GAS does the math](docs/vector-weight-calculation.md)**: "Operator decision (CE-SMP Vector Weight Calculation Engine v1.0): the Inference Flow is a qualitative classifier only, never trusted to compute a session-level vector weight itself." Also in it: Session pairing, A session with no row, One session per row (the `VECTOR_MATRIX` repair), Notebook briefing docs (`DECISION_REGISTER`), Decision echoes, Notebook persona editions, RTP Core Router V6.0 (history), Migrating an existing live sheet.
- **[Registrar / Cog Relay — curriculum-drafts auditing pipeline](docs/registrar-cog-relay.md)**: "A second, independent pipeline (`11_Registrar_CogRelay.gs`), built from 4 uploaded design docs, unrelated to the session-log pipeline above." Also in it: the Apollo Kill-Switch, the two Studio flows (D14) with the `VECTOR_*` docs and the Vector Item Labeler, the web app's "Curriculum checks" panel, and the Aligner vs. Alignment naming note.
- **[License](docs/license.md)**: "Free for personal, educational, and research use." The "**Fidelity Clause**" a commercial license must preserve.
