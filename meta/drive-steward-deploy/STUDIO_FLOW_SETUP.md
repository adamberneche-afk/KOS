# Drive Steward — Studio Flow Setup

This is the one piece of this deployment that has to be configured by
hand in Google's own UI, not pasted as code. Everything else in this
folder (the three `.gs` files) is ready to paste into an Apps Script
project as-is. This document specs out what the Flow needs to do and
gives you the exact prompt/field-mapping to use — the surrounding
click-path may differ slightly from what's described here depending on
the current state of Workspace Studio's UI, so treat the *behavior*
below as the contract and the UI steps as the best current approximation
of how to get there.

**Why a Studio Flow and not another Apps Script + a Gemini API key:**
this mirrors a pattern already running elsewhere in this repo — cas-ccps's
Script 05 writes a row to `RubricQueue`, and its Studio Flow 1 reads that
row and calls Gemini *natively*, with no API key for anyone to manage,
rotate, or secure. Drive Steward's classification step reuses that exact
shape: `DriveSteward_Scanner.gs` (mechanical, no AI) writes bare rows to
`Drive_Steward_Intake`; a Studio Flow reads them and does the actual
judgment call.

---

## What triggers the Flow

**Trigger:** a new row appearing in the `Drive_Steward_Intake` tab with
`status = 'new'`. Workspace Studio Flows can be configured to watch a
specific Sheet/tab for new rows — point this Flow at `Drive_Steward_Intake`
in the Drive Steward Sheet you created with `DriveSteward_SheetsSetup.gs`.

## What the Flow does per row

1. **Read** the intake row's `file_id`, `file_name`, `current_path`,
   `mime_type`.
2. **Read the file itself** (Drive-native read, same as the file-content
   access cas-ccps's own Flows already use) to inform classification —
   at minimum the file's own content/structure where that's cheap to
   read (a `.gs`/`.js` file's header comment and function signatures,
   a `.doc`'s heading structure); Part 1.5's `parsing_hint` field exists
   precisely because different file types warrant different extraction
   depth.
3. **Also read** `Pattern_Tiers` (for the pattern catalog and each
   pattern's `current_tier`) and a recent slice of `File_Registry`
   (for precedent — Part 2 step 3: "match to precedent, not generic
   taxonomy").
4. **Classify** using the prompt below, and **write** a new row to
   `File_Registry` with every field populated.
5. **If `confidence_score = 'low'`**, also append a row to `Batch_Queue`
   (see the Batch Governor section below) — this is what actually
   surfaces the item for Fluffy's attention, not `File_Registry` itself.
6. **Update the source intake row's `status`** from `'new'` to
   `'classified'` so it's never reprocessed.
7. **Never write to `Pattern_Tiers`.** The Flow only ever reads that
   tab. This is the same "no threshold changes without Fluffy" boundary
   `DriveSteward_Calibration.gs` enforces structurally on the script
   side — enforce it here too, by simply never giving the Flow a write
   step against that tab.

## The prompt

Adapt Part 3 of `../Drive_Steward_Methodology_and_Prompt.md` — the block
below is that same prompt, narrowed to the single-file classification
task this Flow actually performs (the full Part 3 prompt also covers
weekly calibration and audience translation, which live in
`DriveSteward_Calibration.gs` and a separate on-request Gem/Claude
Project respectively, not in this Flow):

```
You are Drive Steward, classifying one file for Fluffy's Google Workspace
ecosystem (CAS — Classroom Agency System, and its predecessor KOS).

File to classify:
  file_id: {{file_id}}
  file_name: {{file_name}}
  current_path: {{current_path}}
  mime_type: {{mime_type}}
  [file content / structure as read above]

Known conventions to apply (Part 1 of the methodology doc):
- Numeric filename prefixes indicate build sequence within a module.
- Version suffixes (v2, v3.4, v8.0) indicate iteration; a new version may
  mean the prior one is a supersession candidate for archiving.
- Subsystem tags in filenames (CAS_M2_, KOS_MASTER_) indicate module/project,
  even if the file sits in an unrelated folder.
- Session-dated folders (e.g. "CAS 7.8.26") are legitimate first-landing
  spots — don't force immediate deep filing.
- Staging folders (RAW_EXHAUST, DROP_ZONE, Pending_Tagging) need periodic
  sorting passes.
- Files referencing personas, vectors, or confidence-threshold logic belong
  to the KOS→CAS conceptual lineage regardless of nominal folder.
- Loose files at Drive root get triaged professional/curriculum vs. personal
  before anything else.

Pattern catalog (match this file to the closest fitting pattern_id; if
none fit well, use the pattern whose folder precedent is closest and note
the mismatch in purpose_summary):
  P1-session-dated-folder, P2-designed-empty-folder, P3-filename-metadata,
  P4-vector-language-lineage, P5-staging-zone-sort-pass, P6-root-triage,
  P7-supersession-check

For the matched pattern_id, its current_tier (from Pattern_Tiers) tells you
the ceiling on your own confidence_score: a pattern at current_tier="low"
must never be scored confidence_score="high" here, regardless of how
obvious the classification looks — it hasn't earned that yet (cold start,
Part 1.5/2.5). A pattern at current_tier="auto-confirm" may be scored high
if this specific file is a clean match.

Produce a File_Registry row with every field populated:
  file_id, file_name, current_path, subsystem, module_component, file_type,
  sequence_version, status, supersedes, superseded_by, purpose_summary
  (1-2 sentences on WHY this file exists, not what it contains),
  parsing_hint, depends_on, audience_scope, vector_priority
  (high/medium/low/exclude), confidence_score (high/medium/low — capped by
  current_tier as above), last_reviewed (today's date), pattern_id (the
  matched slug), created_date (now), human_corrected (always false — this
  field is Fluffy's, never yours to set).

If a file appears to replace an earlier system/version, name the specific
older file_id(s) in supersedes/superseded_by and set status appropriately.

Never propose an actual Drive file operation (move/copy/delete/rename) —
you are drafting a File_Registry row only. Moving the file itself is a
separate, human-approved step that happens outside this Flow entirely.
```

## Field mapping — Flow output → `File_Registry` columns

The Flow's structured output should map 1:1 onto `File_Registry`'s 20
columns (see `DriveSteward_SheetsSetup.gs`'s `SHEET_SCHEMAS.File_Registry`
for the exact column order). The three columns beyond the original Part
1.5 schema — `pattern_id`, `created_date`, `human_corrected` — exist
specifically so `DriveSteward_Calibration.gs` can group rows by pattern
and compute the weekly Wilson interval; the Flow must populate all three
on every row (`human_corrected` always starts `false`/unchecked — only
Fluffy, editing the Sheet directly later, ever flips it to `true`).

## The Batch Governor (Part 2.6)

For any row the Flow scores `confidence_score = 'low'`, also append a row
to `Batch_Queue`: `batch_id`, `file_id`, `pattern_id`, `reason_flagged`
(short — why it didn't clear high-confidence), `proposed_path`, `status`
(`'pending'`), `created_date`, `resolved_date` (blank).

**The sequencing gate** (Part 2.6) has to be enforced by the Flow's own
batching logic, since nothing else in this deployment does it: before
assigning a new item to `batch_id = N+1`, check whether every row in the
most recent `batch_id` still has any `status = 'pending'` rows. If so,
assign the new item to that same batch instead of opening a new one —
new items keep accumulating into the current open batch until Fluffy
resolves what's already in it (flips each `Batch_Queue` row's `status`
to `'confirmed'` or `'corrected'` and fills in `resolved_date`), at which
point the next flagged item opens a fresh `batch_id`. Cap each batch at
roughly 8-10 items per Part 2.6's sizing guidance — if the current batch
is already at that cap, also start the next one rather than letting a
single batch grow unbounded.

## What to verify once this is wired up

- Drop a test file into a watched folder, run `runDriveStewardScan()`
  manually, confirm it lands in `Drive_Steward_Intake` with `status='new'`.
- Confirm the Flow picks it up, writes a `File_Registry` row with all 20
  columns populated, and flips the intake row to `status='classified'`.
- Confirm a deliberately ambiguous test file (no clear precedent) gets
  `confidence_score='low'` and a corresponding `Batch_Queue` row, and that
  a second ambiguous file added before the first is resolved lands in the
  *same* `batch_id`, not a new one.
- Confirm the Flow never writes to `Pattern_Tiers` — spot check the tab
  after a few runs to make sure only your own edits appear there.
