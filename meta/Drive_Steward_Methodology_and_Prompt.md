# Drive Steward: Context Harness Methodology & Recurring Prompt

**Note on scope (added during a later review pass):** Part 2.5 (Weekly
Confidence Calibration Loop) and Part 2.6 (The Batch Governor) below are
a fair amount of statistical/process machinery — divergence intervals,
target bands, batch sequencing gates — for what is, at its core, one
person's personal Drive-filing habit. That's a genuine observation, not
a fix applied here: whether this level of rigor is wanted is Fluffy's
own call about his own workflow, not something to unilaterally simplify
on his behalf. Flagged for consideration, left intact. (This file is
intentionally filed in two places — see `meta/README.md` and
`kos-personal/rtp-core-router/protocols/` — since its methodology
applies across systems; that duplication is deliberate, not an
oversight, so both copies should stay identical if this note or
anything else here changes.)

**Two specific gaps named during a further review pass — one now closed,
one narrowed, added during a still-later pass:**

(1) **Closed.** Part 2.5 used to describe computing a "divergence
interval" that widens with smaller sample sizes without ever naming
which interval — no formula, no named method. It now specifies the
exact method (Wilson score interval, with the formula and a worked
example) and the `Calibration_Log` schema carries the interval as two
concrete numeric fields (`wilson_lower`, `wilson_upper`) rather than one
vague `divergence_interval` slot. "Compute the interval" is now an
instruction a Gem or Flow could actually execute — see Part 2.5 below.

(2) **Narrowed, not closed.** The `Calibration_Log` schema itself is now
fully specified — every field has a concrete type/format, not just a
one-line purpose (see the table in Part 2.5) — so a Gem or Flow could
create and populate that Sheet tab exactly as written, with no
remaining ambiguity about what to write into which column. What's
*still* a gap: it remains a specified-but-not-running schema. Nothing
in this document, or anywhere else in this repo, actually persists
per-pattern confidence tiers or weekly divergence numbers across
sessions yet — no `Calibration_Log` Sheet tab exists in Fluffy's Drive
today. Every run of the Part 3 prompt still starts from the same static
text with no memory of prior weeks' calibration, so "cold start, earn
looseness" describes an intended lifecycle this document specifies but
doesn't yet operate. Closing *that* remaining piece means actually
creating the Sheet and wiring a Gem/Flow to read and write it — a real
deployment step, not a specification gap, and one Fluffy hasn't asked
for yet. Flagged, not fixed here, for the same reason as the scope note
above.

**Purpose:** A repeatable workflow that (1) predicts where new files *should* live based on Fluffy's own observed filing logic — not generic best practice — so the context harness can reliably find and pull what it needs, and (2) translates internal technical artifacts into legible output for external audiences (admins, colleagues, district). It never executes changes on its own; it proposes, with rationale, for human approval.

---

## Part 1: The Patterns This Workflow Is Built On

| # | Pattern | Signal it gives the workflow |
|---|---|---|
| 1 | Session-dated dump folders (e.g. `CAS 7.8.26`) | New work in an active build session should land in a dated folder first, not be forced into deep taxonomy immediately |
| 2 | Schema designed ahead of population | Empty folders in a designed taxonomy are *intentional future homes*, not dead weight — don't flag them as clutter |
| 3 | Filenames carry sequence/version/subsystem metadata | Parse filenames (numeric prefix, version suffix, subsystem tag) as the primary classification signal, not just folder context |
| 4 | Persona/vector framework recurs across projects | Files referencing Council personas, vectors, or confidence-threshold logic belong to the *conceptual* lineage (KOS→CAS), regardless of which project folder they're nominally under |
| 5 | Staging zones accumulate instead of clearing | Flag staging folders (`RAW_EXHAUST`, `DROP_ZONE`, `Pending_Tagging`) periodically for a *sorting pass*, since they won't self-clear |
| 6 | No personal/professional boundary at root | Loose root-level files should be triaged into "curriculum/professional" vs. "personal" before anything else |
| 7 | Fast supersession, no deprecation | When a new version of a system appears (new version number or date-named folder), check whether the prior generation should be flagged for archive — don't assume it should stay live |

---

## Part 1.5: File Registry Schema

Every file the workflow touches gets a structured record — this is the unit the context harness actually queries, not the folder tree. One row per file, one flat/queryable table (a Sheet fits naturally alongside your GAS-based tooling).

| Field | Purpose |
|---|---|
| `file_id` | Google Drive file ID — the stable anchor everything else hangs off of |
| `file_name` | As stored in Drive |
| `current_path` | Folder chain at time of last review |
| `subsystem` | CAS / KOS-legacy / Tesseract-legacy / Curriculum-record / Personal |
| `module_component` | e.g. Module 2 / Warm-up Pipeline / Vector Repository / Council Logs |
| `file_type` | script (.gs/.js) / data (json/csv) / doc (rubric, SOP, log) / template / spreadsheet |
| `sequence_version` | Parsed from filename — script number, version tag (v2, v8.0), or session date |
| `status` | active / superseded / staging-unsorted / empty-placeholder / archive-candidate |
| `supersedes` / `superseded_by` | file_id links, when known |
| `purpose_summary` | 1–2 sentence human-authored abstract of *why this file exists* — the actual thing that should get embedded, since it captures intent better than raw content |
| `parsing_hint` | how to extract meaning from this file type (e.g. "JSON: keys are competency_id → rubric_text pairs"; "gs: extract function signatures + header comment only"; "doc: strip boilerplate, keep body") |
| `depends_on` | file_ids of things this file requires to function (e.g. a script depending on the `lesson_unit_id` bridge) |
| `audience_scope` | internal-only / colleague-facing / admin-facing / student-facing — which translation lens applies if this content ever needs to go external |
| `vector_priority` | high / medium / low / exclude — whether this should be embedded at all (empty placeholders and pure logs are usually low/exclude) |
| `confidence_score` | high / medium / low — the system's own confidence in this row's fields. High confidence auto-confirms and exports without waiting on Fluffy. Low confidence is the only thing that surfaces for review. |
| `last_reviewed` | date this record was last confirmed accurate (auto-set for high-confidence rows; only meaningfully "reviewed" by Fluffy for flagged ones) |

The `purpose_summary` field is the one doing the most work — it's what should actually get vectorized, with the raw file as a linked payload retrieved after the match, not embedded wholesale. That keeps the harness matching on intent rather than incidental phrasing inside scripts/JSON.

**Review by exception, not review by default.** Fluffy doesn't derive value from hand-curating a registry, and the whole point of this system is that automation has made the curation cheap enough to not need his labor for it. So: the system auto-drafts every field including `purpose_summary`, scores its own `confidence_score`, and auto-confirms + exports anything high-confidence without waiting for a human pass. Only `low`-confidence rows (ambiguous filenames, files with no clear precedent, conflicting supersession signals) get surfaced — and even those are surfaced as passive notice, not a queue to clear. This is a meaningful shift from treating the Sheet as an approval gate to treating it as a status dashboard: Fluffy stays informed about what's where without being the mechanism that makes it accurate.

**Cold start: begin tight, earn looseness.** No classification pattern starts trusted. Every filing/tagging rule (e.g. "numeric prefix + CAS tag → Module folder," "session-dated folder → land as-is") begins at `low` confidence regardless of how obvious it looks, and only graduates to auto-confirming once it has demonstrated reliability across a real observation window (see Part 4). This means the early weeks will surface more for Fluffy's attention than later weeks — that's expected and correct, not a sign the system is behind.

This does not extend to actual file operations.** Drafting a registry row, generating a summary, or running an export is metadata work — it never touches a real file. Moving, copying, deleting, or editing an actual file in Drive stays under Fluffy's standing rule: always proposed, never executed without explicit discussion. The autonomy gain lives entirely in the curation layer, not in Drive itself.

---

## Part 2: The Recurring Workflow

**Cadence:** Run at the end of any active build session, or on request ("steward my drive").

**Steps:**

1. **Scan** — Pull recently created/modified files (last session or specified window) plus any known staging folders.
2. **Classify by filename convention first, folder second** — apply the sequence/version/subsystem parsing from Pattern 3.
3. **Match to precedent, not generic taxonomy** — for each file, find the closest structural precedent already in the Drive (e.g., "this looks like a Module script, like `22_LessonContextHandler.js`" or "this looks like a raw log, like the ones in `03.4_RAW_EXHAUST`") and propose that location.
4. **Surface supersession candidates** — if a file appears to replace an earlier system/version, name the older artifact(s) it may obsolete and ask whether to archive them.
5. **Auto-confirm and export high-confidence rows** — for filing proposals and registry rows the system scores as high-confidence, proceed straight to registry export without waiting on approval. Low-confidence rows (ambiguous naming, no clear precedent, conflicting supersession signals) get flagged and held for Fluffy's input — everything else moves without him.
5a. **Never auto-execute actual file operations** — regardless of confidence, any real move/copy/delete/edit to a file in Drive is proposed and held for explicit discussion, per Fluffy's standing rule. Confidence-based autonomy applies only to registry metadata, never to the files themselves.
5b. **Surface a passive digest, not a queue** — at end of session (or nightly), produce a short status digest: what got auto-filed/registered, what's flagged and why, and any files that appear superseded. This is for awareness, not action — Fluffy reads it to stay oriented, not to clear a backlog.
6. **Translate for external audiences (on request)** — when asked to prepare something for other people (admin, colleagues, district), take the technical artifact and reframe it using the appropriate lens:
   - **Administrators/district:** outcome and impact framing — what changed for students/teachers, time saved, competency coverage — not implementation detail.
   - **Colleagues:** replication framing — what it does, how to adopt it, what it requires from them.
   - **Broad/public-facing:** plain-language framing, no internal jargon (no "vector," "silo," "shadow matrix" — translate to plain descriptions of what the tool does).

---

## Part 2.5: Weekly Confidence Calibration Loop

Confidence tiers aren't set once — they're earned per pattern, tracked weekly, and adjusted only when the data clears a real bar, not on a single week's noise. This is the mechanism that lets the system start tight and loosen responsibly.

**What gets tracked (a `Calibration_Log` tab alongside Registry and Export_Log).** Every field below has a concrete type/format — this is the actual Sheet schema, not a description of one:

| Field | Type / format | Purpose |
|---|---|---|
| `pattern_id` | string, stable slug (e.g. `P3-numeric-prefix-cas-tag`, `P1-session-dated-folder`, `P4-vector-language-lineage` — one slug per row of the Part 1 pattern table) | The specific classification rule this row scores |
| `week_of` | date, ISO, week-start Monday (e.g. `2026-08-24`) | The week this row summarizes |
| `n_applied` | integer, ≥ 0 | How many times this pattern fired this week |
| `n_flagged` | integer, 0 ≤ `n_flagged` ≤ `n_applied` | How many of those were held as low-confidence |
| `n_corrected` | integer, 0 ≤ `n_corrected` ≤ `n_applied` | How many auto-confirmed rows Fluffy ended up correcting (caught via spot-check or later reference) |
| `observed_divergence` | float, [0, 1], = `n_corrected` ÷ `n_applied`; blank if `n_applied` = 0 | The raw error rate for the week |
| `z_used` | float, fixed at `1.96` (95% confidence) unless explicitly changed and noted | The z-score the Wilson calculation below uses — logged per row so a later reader can see exactly what was computed, not just trust it |
| `wilson_lower` / `wilson_upper` | float, [0, 1] each, `wilson_lower` ≤ `wilson_upper`; both blank if `n_applied` = 0 | The two ends of the Wilson score interval (formula below) — replaces the old single vague `divergence_interval` slot with the two numbers a tighten/loosen decision actually compares against |
| `current_tier` | enum: `low` \| `auto-confirm` | The pattern's active confidence tier going into this week |
| `target_band_low` / `target_band_high` | float, [0, 1] each, or both blank | The acceptable error-rate range for the current tier — blank for every pattern until the "on setting target_band" bar below is cleared |
| `proposed_action` | enum: `none` \| `tighten` \| `loosen` | Computed, not hand-set: `tighten` if `wilson_lower` sits entirely above `target_band_high`; `loosen` if `wilson_upper` sits entirely below `target_band_low` for a sustained window (Part 2.5's cadence step 3); `none` otherwise, or whenever the target band is still blank |

**On setting `target_band_low` / `target_band_high`:** this isn't fixed in advance. For the first several weeks, every pattern simply logs `observed_divergence`, `wilson_lower`, and `wilson_upper` with both target-band fields left blank — the calibration loop's early job is purely descriptive, showing Fluffy what error rates patterns actually produce. Once there's enough weekly data to see where real patterns naturally cluster (which ones run near-zero error, which ones run higher), propose target bands *from* that observed distribution, discuss them with Fluffy, and only then start populating those two fields and using `proposed_action` to drive tighten/loosen proposals. Setting the bar before there's data to set it from would just encode a guess as if it were a measurement.

**Why an interval, not a single number:** a pattern that fired 4 times this week and was corrected once looks like a 25% error rate — but with n=4, that's statistical noise, not signal. Computing an interval around the observed rate (widening automatically as sample size shrinks) keeps a single bad week from triggering a threshold change, and keeps a single lucky week from prematurely loosening one. A change only gets proposed when the interval for a pattern sits clearly outside its target band — not when the point estimate briefly crosses it.

**The exact method: Wilson score interval.** With `n = n_applied`, observed proportion `p̂ = observed_divergence`, and `z = z_used` (1.96 for a 95% interval):

```
center = ( p̂ + z²/(2n) ) / ( 1 + z²/n )

margin  = ( z / (1 + z²/n) ) × sqrt( p̂(1 − p̂)/n + z²/(4n²) )

wilson_lower = center − margin
wilson_upper = center + margin
```

This is the standard choice for a small-sample binomial-proportion
interval (over a plain normal-approximation interval) for two concrete
reasons that matter here: it never produces bounds outside `[0, 1]`
even at very small `n` or extreme `p̂` (a normal approximation can — a
pattern with `n_applied = 3, n_corrected = 0` would otherwise report a
nonsensical negative lower bound), and it's centered on a
shrunk-toward-0.5 point rather than the raw `p̂`, which is exactly the
"small weeks get wide, cautious intervals" behavior this loop needs. No
external library or script is required — a Gem or Flow computes this
directly from the four inputs (`n`, `p̂` via `n_corrected`/`n_applied`,
and the fixed `z`) with ordinary arithmetic.

**Worked example** (matches the "fired 4 times, corrected once" case
above): `n = 4`, `n_corrected = 1`, so `p̂ = 0.25`, `z = 1.96`.

```
z²/n     = 3.8416 / 4      = 0.9604
z²/(2n)  = 3.8416 / 8      = 0.4802
z²/(4n²) = 3.8416 / 64     = 0.0600

center = (0.25 + 0.4802) / (1 + 0.9604) = 0.7302 / 1.9604 ≈ 0.3724

margin = (1.96 / 1.9604) × sqrt( 0.25×0.75/4 + 0.0600 )
       ≈ 0.9998 × sqrt( 0.046875 + 0.0600 )
       ≈ 0.9998 × sqrt(0.106875)
       ≈ 0.9998 × 0.3269
       ≈ 0.3268

wilson_lower ≈ 0.3724 − 0.3268 ≈ 0.046
wilson_upper ≈ 0.3724 + 0.3268 ≈ 0.699
```

So a week with a raw 25% error rate on n=4 actually carries a 95%
interval of roughly **[4.6%, 69.9%]** — wide enough that this single
week cannot responsibly move that pattern's tier either direction. That
width is the mechanism working as intended, not a flaw in it: it takes
several weeks of consistently low (or consistently high) `n_corrected`
before the interval narrows enough to sit clearly outside any
reasonable target band.

**Weekly cadence:**

1. At the end of each week, compute `wilson_lower`/`wilson_upper` (the
   Wilson score interval, formula above) for every active pattern with
   `n_applied > 0`, and write the full `Calibration_Log` row.
2. For any pattern whose `wilson_lower` sits entirely above its
   `target_band_high` (worse than acceptable) — propose tightening: hold
   that pattern at low-confidence a while longer, or roll it back from
   auto-confirm to flagged. Set `proposed_action = tighten`.
3. For any pattern whose `wilson_upper` sits entirely below its
   `target_band_low` (better than the bar it needs to clear) for a
   sustained window — propose loosening: promote it toward auto-confirm.
   Set `proposed_action = loosen`.
4. Bring Fluffy exactly one artifact: a short table (pattern, this week's
   numbers, the Wilson interval, current vs. proposed tier) plus one
   paragraph per proposed change on what it would actually do downstream
   — e.g. "loosening this pattern would auto-confirm an estimated 8–12
   more files/week; based on the observed interval, the plausible added
   error is low, but the pattern covers files that feed the admin-facing
   translation layer, so a mistake here is more visible than most."
5. **No threshold changes take effect until Fluffy responds.** This is a discussion, not an autonomous adjustment — the calibration loop earns its own trust the same way individual patterns do.

---

## Part 2.6: The Batch Governor

Auto-confirm keeps Fluffy off the majority of the work, but the flagged/low-confidence items still need his eyes — and without a limiter, "review by exception" can quietly turn into "here are 80 things" on a bad week. The governor exists to bound that, and to turn review into a tight feedback loop rather than a once-a-week dump.

**What a batch is:** a bounded set of *flagged* items only — high-confidence files never enter a batch; they auto-confirm and export regardless. A batch is Fluffy's actual unit of deliberate attention.

**Sizing:** start small and let this be tuned the same way as everything else in this system — with data, not a guess. Propose an initial batch cap of roughly 8–10 flagged items (or a rough time-box, whichever Fluffy finds easier to think in — e.g. "about 15 minutes"), then after the first several real batches, look at how long they actually took and adjust the default. If 8 items reliably takes 40 minutes, the cap comes down; if it takes 5, it can go up.

**The sequencing gate:** Batch N+1 is not compiled or surfaced until every item in Batch N has been resolved — confirmed as-is or corrected. New files keep getting scanned and auto-confirmed in the background regardless (that layer never waits on anyone), but the *next round of things needing Fluffy's attention* doesn't appear until the current round is closed. This is the actual governor: it caps how much review-demanding material can be in flight at once, which caps how much of a day this can consume.

**The recursive loop:** every confirmation or correction inside a batch updates that pattern's live tally (`n_applied`, `n_corrected`) immediately — not just at the weekly rollup. So batch N+1's classifications already reflect what was learned in batch N, and batch N+2 reflects both N and N+1. This is where the context genuinely compounds: each closed batch makes the next one slightly better-informed, independent of the weekly cadence.

**Division of labor between batch and week:** batches are where data accumulates and where throughput gets governed; the weekly calibration review (Part 2.5) remains the only point where tier or target-band decisions actually get made. A single batch's outcome — even a striking one — doesn't retrigger a tier change by itself; it just adds to the interval that gets evaluated at the weekly checkpoint. This keeps a rough batch from causing whiplash in either direction.

---

## Part 3: The Reusable Prompt

Copy this into a Gem, Claude Project, or Workspace Studio Flow to run the recurring workflow:

```
You are Drive Steward, a filing-logic assistant for Fluffy's Google Workspace ecosystem
(CAS — Classroom Agency System, and its predecessor KOS). Your job is to predict where
new or existing files should be filed based on Fluffy's own established conventions —
not generic organizational best practice — so that the context harness can reliably
locate and retrieve what it needs.

Known conventions to apply:
- Numeric filename prefixes indicate build sequence within a module (e.g. 22_, 29_).
- Version suffixes (v2, v3.4, v8.0) indicate iteration; a new version may mean the
  prior one is a supersession candidate for archiving — flag it, don't assume it stays.
- Subsystem tags in filenames (CAS_M2_, KOS_MASTER_) indicate which module/project a
  file belongs to, even if it's sitting in an unrelated folder.
- Session-dated folders (e.g. "CAS 7.8.26") are legitimate first-landing spots for a
  day's output — don't force immediate deep filing.
- Staging folders (RAW_EXHAUST, DROP_ZONE, Pending_Tagging) are intentional but need
  periodic sorting passes — they will not self-clear.
- Files referencing personas, vectors, or confidence-threshold logic belong to the
  KOS→CAS conceptual lineage regardless of nominal folder.
- Loose files at Drive root should be triaged as professional/curriculum vs. personal
  before any other classification.

Fluffy does not derive value from hand-curating file metadata and should be kept out of that
loop as much as feasible — while still staying informed about what's where in his Drive.
Apply this principle: auto-confirm and export anything you're genuinely confident about;
only surface what's actually ambiguous.

Cold start: no classification pattern begins trusted. Every pattern starts at low
confidence and only graduates to auto-confirm once it has demonstrated reliability
over the weekly calibration process below. Expect more items flagged in early weeks;
that's correct, not a backlog.

When asked to review recent activity or "steward the drive":
1. List each new/changed file with its proposed destination folder (use the real
   folder name and, where known, its Google Drive file/folder ID).
2. Give a one-line rationale per file tied to a specific precedent already in the
   Drive or to the conventions above — not a generic reason.
3. Name any files that appear superseded by this new work and note them as
   archive-candidates.
4. For each file, draft a File Registry row with these fields: file_id, file_name,
   current_path, subsystem, module_component, file_type, sequence_version, status,
   supersedes/superseded_by, purpose_summary (1-2 sentences on WHY this file exists,
   not what it contains), parsing_hint, depends_on, audience_scope, vector_priority
   (high/medium/low/exclude), confidence_score (high/medium/low), last_reviewed.
5. Auto-confirm and export high-confidence rows immediately — do not wait for
   Fluffy's approval on registry metadata. Only hold low-confidence rows (ambiguous
   naming, no clear precedent, conflicting supersession signals) for his input.
5a. Group low-confidence rows into batches capped at roughly 8-10 items (or a
   time-boxed equivalent). Do not compile or surface the next batch until every
   item in the current batch has been resolved — confirmed as-is or corrected —
   by Fluffy. High-confidence auto-exports never wait on this gate.
5b. The moment an item in a batch is resolved, update that pattern's n_applied and
   n_corrected tally immediately, so the next batch reflects the freshest signal
   rather than waiting for the weekly rollup.
6. Never move, copy, edit, or delete an actual file in Drive without explicit
   discussion and approval first — this rule is absolute regardless of confidence
   score and applies only to real file operations, not registry metadata.
7. Produce a short end-of-session digest: what was auto-filed/registered, what's
   flagged and why, what looks superseded. This is a status update for Fluffy to
   stay oriented, not a task list for him to work through.

Weekly, run the calibration process:
1. For every active classification pattern, log n_applied, n_flagged, n_corrected,
   and observed_divergence (= n_corrected / n_applied) for the week in a
   Calibration_Log record. Leave observed_divergence blank if n_applied = 0.
2. Compute the interval estimate using the Wilson score method — NOT a plain
   normal approximation, and NOT the point estimate alone. With n = n_applied,
   p_hat = observed_divergence, and z = 1.96 (95% confidence, log this as
   z_used):
     center = (p_hat + z^2/(2n)) / (1 + z^2/n)
     margin = (z / (1 + z^2/n)) * sqrt( p_hat*(1-p_hat)/n + z^2/(4*n^2) )
     wilson_lower = center - margin
     wilson_upper = center + margin
   Write both bounds into the Calibration_Log record as wilson_lower and
   wilson_upper. This interval widens automatically for low-sample-size weeks
   (e.g. n=4 with 1 correction spans roughly [0.05, 0.70], not a bare 25%) so a
   single week's noise can't trigger a threshold change, and unlike a normal
   approximation it never produces an out-of-range bound at small n.
3. For the first several weeks, target_band_low/target_band_high stay blank —
   just log observed_divergence, wilson_lower, and wilson_upper per pattern with
   no comparison. Once enough weekly data exists to see where patterns naturally
   cluster, propose target bands derived from that observed distribution for
   Fluffy's discussion before populating those two fields or using them to drive
   any tighten/loosen decisions.
4. Once bands exist: compare each pattern's wilson_lower/wilson_upper to its
   target band. Set proposed_action = tighten only if wilson_lower sits entirely
   above target_band_high; proposed_action = loosen only if wilson_upper sits
   entirely below target_band_low for a sustained window; proposed_action = none
   otherwise. Never trigger either off a single point estimate crossing the band.
5. Bring Fluffy one weekly artifact: a short table of patterns with their numbers,
   Wilson intervals, and current tier, plus a proposed change and a plain
   discussion of what that change would actually do downstream (how many
   more/fewer files get auto-confirmed, and what's at stake if the pattern is
   wrong).
6. Do not change any threshold until Fluffy responds. This is a proposal for
   discussion, same as any other change to how the system behaves.

When asked to prepare something for other people, reframe the technical artifact
using the audience lens requested:
- Administrators/district: lead with outcomes and impact, omit implementation detail.
- Colleagues: lead with what it does and how they'd adopt it.
- General/public-facing: plain language, no internal system jargon (avoid "vector,"
  "silo," "shadow matrix," etc. — describe function instead).
Always ask which audience if it isn't specified.
```

---

**Next step:** tell me if you'd like this saved into your Drive itself (e.g. into `Active_Brain_Trust_System/01_Canonical_Foundation` or a new home), and I'll propose the exact location for your approval before doing anything.
