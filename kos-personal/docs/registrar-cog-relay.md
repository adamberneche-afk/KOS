# Registrar / Cog Relay — curriculum-drafts auditing pipeline

Split out of `kos-personal/README.md` on 2026-11-17; the README maps where everything is.

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

**The two Studio flows (D14, 2026-11-01).** `24_RegistrarFlows.gs` is
their Apps Script half, in the shape `meta/FLOW_DOCTRINE.md` requires (the
original design had each flow read Drive and write the ledger itself):

- **Materialize.** When `runRegistrarMicrobatch` releases a row it first
  writes a flat input row: `RegistrarStage1Input` (the draft's text, its
  first 25,000 characters) or `RegistrarStage2Input` (one labelled cell: the
  draft, Stage 1's JSON, and a digest of the `VECTOR_*` docs in
  `05_Vector_Repository` as the "Master Vector Primer", within a cell's
  50,000 characters). No flow reads Drive.
- **The `VECTOR_*` docs** (`25_VectorDocs.gs`, 2026-11-02) are built from
  the operator's own record: settled decisions with their note, session
  decisions, lessons, open decisions. A third flow, **KOS - Vector Item
  Labeler**, labels each item by ID with a theme and a kind (PERSONAL,
  PRINCIPLE, CONSTRAINT, OPEN_QUESTION, HOUSEKEEPING, STALE, OTHER; an
  item naming a person is PERSONAL whatever else it says) and writes no
  text; `runVectorItemLabeler` (hourly) batches unlabelled items into
  `VectorItemInput`, harvests `VECTOR_ITEM_RETURN` into
  `VECTOR_ITEM_LABELS` (only IDs from the batch; a label row is never
  rewritten, so the operator's corrections there stay), and recompiles.
  Each theme doc lists, word for word with date and session, its items
  labelled PRINCIPLE or CONSTRAINT, most authoritative first (pinned core
  facts, settled, session decisions, lessons), then its open decisions
  marked as no standard. A session decision matching an open or dropped
  one is set aside; repeats are listed once. `VECTOR_GOVERNANCE` holds the
  approved SMPs. The operator's own principles go above each doc's marker
  and are never touched. `checkVectorDocs()` reports the docs, items
  awaiting a label, empty pinned facts, and compiled items that may name a
  person (a list to read once, not a filter). `listPersonalItems()` says
  where the record holds the items labelled PERSONAL (tab and row), for
  scrubbing student data from KOS; it changes nothing. A file that isn't a Google Doc
  fails at once with what to do; a Doc that won't open this minute waits.
- **The flow.** Trigger on its own tab's `Status = READY`; one Ask Gemini
  step whose System Prompt is the `REGISTRAR_STAGE1_SYSTEM_PROMPT` /
  `REGISTRAR_STAGE2_SYSTEM_PROMPT` PromptText chip (FlowPrompts) followed by
  `@trigger.SourceText`; a last step adding `Returned_At`, `Release_ID`
  (from the trigger row) and `Output_JSON` to `REGISTRAR_RETURN`.
- **Harvest.** `runRegistrarProcessor` runs `harvestRegistrarReturns()`
  before its sweep: a return for the row's current release becomes
  `Cog_N_JSON_Output` and `PENDING_VALIDATION_N`; an old release's answer is
  set aside (`STALE`); a Stage 1 answer not grounded in the draft bounces
  the row (`NOT_GROUNDED`). The validators then run as before.
- **Checks.** `checkRegistrarFlowBinding()`, `checkRegistrarFlowLiveness()`,
  `installRegistrarFlowFixture()` / `removeRegistrarFlowFixtures()` (a
  scratch draft that routes nothing) and `runRegistrarFlowCanary()` (the
  flow stubbed, and it says so).

**To build them:** push; let `runRegistrarProcessor` run once (it makes the
three tabs); run `syncFlowPrompts()` and `syncStudioFlowBuildSpec()`; build
each flow in Studio from the FlowBuildSpec tab's `Registrar 1` / `Registrar 2`
/ `Registrar 1+2` rows; then `installRegistrarFlowFixture()` and, after the
next two processor passes, `checkRegistrarFlowLiveness()`.

**Update — `getRegistrarStatus()` is now wired into the web app UI.**
`8_WebApp_UI.html`'s System tab has a "Curriculum checks" panel
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
