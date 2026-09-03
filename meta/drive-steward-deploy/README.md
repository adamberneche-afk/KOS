# Drive Steward — Deployment Package

## What this is

`../Drive_Steward_Methodology_and_Prompt.md` is the methodology — the
patterns, schemas, and cadence Drive Steward runs on. Until now, running
it meant Fluffy opening a Gem/Claude Project and typing "steward my
drive." This package turns that into something that runs on its own
schedule: a scanner that notices new/changed files, a Studio Flow that
classifies them, and a weekly script that calibrates confidence tiers —
none of it waiting on a chat message to kick it off.

**What's code (ready to paste, like `leader-hub/drive-tools`):**
- `DriveSteward_SheetsSetup.gs` — one-time: creates the 5 Sheet tabs.
- `DriveSteward_Scanner.gs` — daily: finds new/changed files, no AI.
- `DriveSteward_Calibration.gs` — weekly + nightly: Wilson-score
  calibration and digest emails, pure arithmetic, no AI.

**What's manual, Google-UI configuration (can't be pasted as code):**
- The Studio Flow itself — see `STUDIO_FLOW_SETUP.md` for exactly what
  it needs to do, the prompt to use, and the field mapping.
- The two `.gs` scripts' time-driven triggers (Apps Script's Triggers
  panel, a few clicks, not something a script can install on itself
  the first time).

## Why this architecture

Mirrors cas-ccps's own Script → Studio Flow bridge (Script 05 writes to
`RubricQueue` → Flow 1 reads it and calls Gemini natively → writes a
DRAFT row back) — same shape, applied to Drive filing instead of rubric
extraction. The mechanical "did something change" detection is a plain
scheduled script; the actual judgment call (where should this file live,
how confident are we) is a Studio Flow calling Gemini with no API key
for anyone to manage.

## Deployment order

**Step 1 — Create the Drive Steward Sheet**

Make a new Google Sheet (or pick an existing one) to hold all 5 tabs.
This one Sheet is the shared surface every piece below reads and writes.

**Step 2 — Set up the tabs**

Open the Sheet → Extensions → Apps Script → paste `DriveSteward_SheetsSetup.gs`
→ run `setupDriveStewardSheets()` once. Check the log: it creates
`Drive_Steward_Intake`, `File_Registry`, `Calibration_Log`, `Batch_Queue`,
and `Pattern_Tiers`, and seeds `Pattern_Tiers` with one row per Part 1
pattern, each starting at `current_tier = 'low'` (the cold-start rule).

**Step 3 — Add the Scanner**

In the same Apps Script project, paste `DriveSteward_Scanner.gs`.
(Optional) set `WATCH_FOLDER_IDS` to specific folders — leave empty to
scan all of My Drive. Run `runDriveStewardScan()` once manually, confirm
new rows land in `Drive_Steward_Intake`. Then install a daily time-driven
trigger on `runDriveStewardScan`.

**Step 4 — Configure the Studio Flow**

Follow `STUDIO_FLOW_SETUP.md` in full. This is the step that actually
does the classification — nothing gets written to `File_Registry` until
this is wired up and pointed at `Drive_Steward_Intake`.

**Step 5 — Add the Calibration script**

In the same Apps Script project, paste `DriveSteward_Calibration.gs`.
Set `DIGEST_EMAIL` to your own address. Install two time-driven triggers:
`runDriveStewardWeeklyCalibration` (weekly) and `runDriveStewardNightlyDigest`
(daily).

**Step 6 — Let it run, then tune `Pattern_Tiers` by hand**

After a few weeks of `Calibration_Log` data, use the weekly digest
emails to decide — per Part 2.5's own rule, this is always Fluffy's
decision, never automatic — whether to edit a pattern's `current_tier`
or set/adjust its `target_band_low`/`target_band_high` in `Pattern_Tiers`
directly. No script or Flow in this package ever writes to that tab.

## What was verified before this shipped

- `wilsonInterval_()` reproduces the methodology doc's own worked example
  (`n=4, n_corrected=1` → `lower≈0.0456, upper≈0.6994`) exactly, and its
  output is clamped to `[0,1]` after finding that the raw formula can
  return a floating-point value like `-5.5e-17` instead of exactly `0`
  at small `n`.
- The weekly calibration logic was sandbox-tested with fake Sheet data
  covering all three `proposed_action` outcomes (`tighten`, `loosen`,
  `none`) and confirmed each fires only when the Wilson interval sits
  entirely outside the target band, never on a point estimate alone.
- The scanner's dedup logic was sandbox-tested with a fake Drive
  tree confirming: an already-registered file is never re-queued, a
  file outside `WATCH_FOLDER_IDS` is correctly skipped, and a genuinely
  new in-scope file is queued with its resolved folder path.
- **Not yet verified: an actual run against a real Google Drive and
  Sheet.** This session has no live Drive access (a standing limitation
  for this whole conversation, not specific to this package) — Step 1
  onward above is the first real-world test these scripts will get.
