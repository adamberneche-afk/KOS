# Knowledge Operating System v8.0
### The Headless Studio Edition

KOS is a personal intelligence infrastructure built on Google Apps Script. It captures your AI working sessions, extracts structured knowledge from them, and routes that knowledge to the right places in a system you own. Everything — your data, your processing logic, your folder hierarchy — lives in your Google account. **By default**, nothing is on a vendor server — see `CFG.INFERENCE_MODE` in the Key Configuration table below for the one explicit, opt-in exception.

The core problem it solves: you spend hours in AI sessions making decisions, building expertise, and generating insight. At the end of each session, almost all of that value disappears. You might copy a few action items. KOS routes everything — vector weights, state updates, action items, pivots, cog verdicts — automatically, so your system gets smarter with every session rather than resetting to zero.

---

## Status quo, and how it got here

This README documents the system as it is today. The full history of what was found and fixed — the original reconciliation pass, the Round 3 reupload batch, and nine rounds of dedicated UI/UX hardening — is in [`CHANGELOG.md`](./CHANGELOG.md), split out from here so this file stays a current-state reference instead of a changelog with documentation mixed in.

---

## Architecture in Two Paragraphs

Sessions flow through a five-stage pipeline. Sensor 1 scans a Drive folder for new session documents every 5 minutes and creates rows in STAGING_PIPELINE with status `PENDING_FLOW`. The Turnstile (running every 5 minutes) releases rows one at a time to `STUDIO_ACTIVE`. Workspace Studio picks up `STUDIO_ACTIVE` rows, runs inference on the session text, writes structured JSON back to the document, and sets status to `FLOW_COMPLETE`. The Queue Processor (running every 10 minutes) finds `FLOW_COMPLETE` rows, parses the JSON, and fans the data out to ten downstream ledgers via the JSON Drip architecture. Each branch — current state, pivots, session log, cog registry, action register, vector routing, shadow matrix — is isolated so a failure in one doesn't stop the others.

The shadow matrix is the system's calibration model. It maintains confidence intervals for five operator values (admin ghost, relational targets, necessary struggle, prime directive, temporal constraints) and updates them passively from each processed session's alignment observations. At 0.75 confidence, a value is marked VERIFIED and auto-populated into the system's operator properties. The daily primer assembles current vector state, shadow matrix status, and the operator's 90-day vision into a session-ready context document every morning at 06:00. The sequestered council ("Seven Bridges," SMP-002 — now actually built, see `triggerSevenBridgesReview()`/`compileCouncilVerdict_()` in `6_Governance.gs`) assembles **one shared stimulus document**, not one per persona — real sequestration comes from sending that single document to each of the `CFG.PERSONAS` (6 real personas, not 7 — see that file's own naming-collision note) as a **separate Gemini Gem conversation**, entirely outside this pipeline. Each Gem's verdict is submitted back via `submitCogVerdict()` (`2_Ingestion_Sensors.gs`) as a `COG_VERDICT` payload, which deliberately skips the normal `PENDING_FLOW`/`STUDIO_ACTIVE` queue and writes straight to a `FLOW_COMPLETE`-equivalent state — collected in `COG_REGISTRY`, with a halt-execution rule (`CFG.COG_HALT_THRESHOLD`, `1_Config_And_Deploy.gs`) tripping once enough verdicts come back non-APPROVED. The older `triggerCouncilSimulation()` (one shared-context prompt asking the model to role-play all personas at once) is explicitly superseded by this and kept only for reference.

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
8_WebApp_UI.html           Mobile web app (Ingest / Queue / Diagnostics)   ✅ in repo — all server calls now backed; managed_service panel restored, gated behind CFG.INFERENCE_MODE (see CHANGELOG.md)
9_UI_Diagnostics.gs        HITL functions, Socratic onboarding, menu       ✅ in repo
10_Turnstile.gs            Matrix turnstile state machine                 ✅ in repo — rebuilt against the real schema (original in archived/)
11_Registrar_CogRelay.gs   Curriculum-drafts auditing pipeline (Registrar) ✅ in repo — see "Registrar / Cog Relay" below
KOS_PHASE0_PATCHES.gs      v5.4 migration patch (DO NOT add to v8.0 project) — not needed
KOS_GAPS_AND_FIXES.gs      Reference document only (DO NOT add to project)   — not needed
inference-service/         Optional Node.js managed-inference backend     ✅ filed in — see CHANGELOG.md + its own README
rtp-core-router/protocols/ 10 governance/protocol docs                    ✅ filed in — see CHANGELOG.md
```

All 6 persona cog docs, plus the Core Router doc itself (7 files total —
6 personas, not 7, correcting an earlier miscount here), are now in
`rtp-core-router/` (`ARCHITECT`, `AUDITOR`, `MUSE`, `DEVELOPER`, `CURATOR`,
`ALIGNMENT`, plus the Core Router). `CFG.PERSONAS` (`1_Config_And_Deploy.gs`)
is the real, current source of truth for this — 6 entries, matching this
list exactly; "Seven Bridges" (the sequestered-council feature's own name,
see line 20 above) is aspirational branding, not a literal persona count.
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

## Status Lifecycle

```
Sensor creates chunk       PENDING_FLOW
Turnstile releases         PENDING_FLOW  →  STUDIO_ACTIVE
Studio processes           STUDIO_ACTIVE →  FLOW_COMPLETE
Queue processor            FLOW_COMPLETE →  PROCESSED
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
| `INFERENCE_MODE` | `'STUDIO'` | `'STUDIO'` (default, no vendor server) or `'MANAGED_SERVICE'` (opt-in — see CHANGELOG.md for how this was added, and `inference-service/README.md` for the service itself) |
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
convention as `VECTOR_CLASSIFY_PROMPT.md`. Building them is a Workspace
Studio UI action (pasting the prompt into a Studio flow there), not a
repo-file task — nothing in this codebase can do that step for you.

**Update — `getRegistrarStatus()` is now wired into the web app UI.**
`8_WebApp_UI.html`'s Diagnostics tab has a "Curriculum auditing" panel
(hidden entirely until a deployment's `REGISTRAR_LEDGER` has any rows, so
it's not diagnostics-tab noise for the majority of installs that never
touch this second pipeline) showing a friendly `in_progress`/`needs_review`/
`routed`/`failed` breakdown — `getRegistrarStatus()` itself was extended
to compute that `groups` breakdown server-side alongside its existing raw
per-state `counts`, same dual-shape convention `getQueueMetrics()` already
uses. This is read-only: no trigger-now/retry button was added, since the
one write action this pipeline exposes (`clearInterventionTriage(fileId)`)
still requires calling it from the Apps Script editor by File_ID, same as
before this fix — a real UI for that is future work, not assumed done
here. (This item briefly also appeared mislabeled as a **cas-ccps** gap in
an earlier planning pass — cas-ccps has no Registrar/Cog Relay concept
anywhere in it; this was always a kos-personal-only gap.)

**Naming note (Aligner vs. Alignment).** The Calibration Silo folder is
named `04.5_ALIGNER_SILO` / tagged `CE-ALIGN`, but every persona doc in
this repo (`PERSONA_ALIGNMENT_V5_1.md`, the `LICENSE`'s Fidelity Clause,
`CFG.FIDELITY_REQUIRED_PERSONA`) calls this cog ALIGNMENT. Same class of
issue as the Seven Bridges persona-count naming mismatch noted above (the
"7" in the feature's own name vs. `CFG.PERSONAS`'s real 6 entries) —
cosmetic, not two different cogs. `CFG.PERSONAS` used to list `PERSONA_ALIGNER` as if it
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
   below 0.10 RID (Relevance-Impact-Depth — the score that determines how
   much a cog's output contributes to a prompt; see
   `rtp-core-router/PERSONA_AUDITOR_V5_1.md`), or removed.
2. **The HITL (Human-In-The-Loop) Firewall** — no autonomous writes to
   canonical documents, no external communications, no mutations to
   persistent state without explicit human verification.
3. **The Cold Engine Protocol** — the system stays inert until the user has
   articulated their own `CORE_THESIS`; no pre-loaded generic or
   vendor-defined thesis.
