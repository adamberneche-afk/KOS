# CAS — Process History

This is the reconciliation/build-session narration split out of
`README.md` (external product review, Finding 10 / "structural" tier —
the review correctly flagged this style of process narration as decaying
fastest and mattering least to a new reader; the review's own high praise
for this repo's code comments is unaffected — those are untouched, still
living in the source files they've always been in). If you're trying to
understand what this system currently does or how to set it up, you want
`README.md`, not this file. Come here when you need to know *why* something
is the way it is, or what a past session already checked and fixed so a
future one doesn't re-derive it from scratch.

`README.md`'s own "Known gaps" section stays in `README.md`, not here,
even though it also contains resolution write-ups for closed items — that
section is a live, cross-referenced reference list explicitly kept "so a
future session doesn't re-derive them," not decaying narration; moving it
here would break its own internal "see resolution N above" pointers for no
real benefit.

---

## ✅ Reconciled: all 7 flagged conflicts resolved

Every conflict this README previously documented has been resolved via the
CAS/KOS reconciliation decision log. What follows is a record of each
resolution, kept for anyone picking this project up later.

### 1. The Script 09 architecture fork — Studio writes the report

**Confirmed: Studio writes the evaluation report directly; GAS does not.**
Four independent, mutually corroborating sources agreed
(`09_StudentRevisionGuidance_M1Base.js`, `15_StudioFlowPrompts.js` +
`15b_StudioFlowPrompts_Flow2_Revised.js`, the real `03_QueueBridge.js`
backup-only `processCompletedEvaluation_()`, `docs/STUDIO_FLOW_REFERENCE.html`,
and the salvaged `docs/USER_EXPERIENCE_REFERENCE.html` Document Anatomy
section) against one outlier — `scripts/09_StudentRevisionGuidance.js`, the
very first file uploaded to this project, which assumed GAS writes the
report via `prependFeedbackToHeader()`. That file is now archived at
`scripts/archived/09_StudentRevisionGuidance_ORIGINAL_GAS_WRITES.js`
(confirmed before archiving: nothing else in this repo calls
`prependFeedbackToHeader()`). `09_StudentRevisionGuidance_M1Base.js` is the
live design. This unblocks Flow 2 (still not built in Studio — see Known
Gaps) with an unambiguous spec.

### 2. Two confirmed bugs — both fixed

1. **Turn-In Form field mismatch.** `04_Form2_TurnInGate.js` assumed
   `setCollectEmail(true)` and read the auto-collected `"Email Address"`
   field. `16_UnifiedManualSetup.js` (the actual form-builder) sets
   `setCollectEmail(false)` and adds a manual text item titled **"Your
   Google Account"** — confirmed directly in code — and
   `18_FormSubmitDispatcher.js`'s own comment already agreed. As shipped,
   every real Form 2 submission would have had `r["Email Address"]`
   undefined, so `onTurnInSubmit` treated every real turn-in as "not a
   Form 2 submission" and silently no-opped. Fixed `04` to match `16`/`18`
   (`r["Your Google Account"]`); `16` and `18` were already correct and
   are unchanged.
2. **`16_UnifiedManualSetup.js`'s `onOpen()` `ReferenceError`.** Confirmed
   directly in code: `onOpen()` referenced `props.getProperty(...)`
   without ever declaring `props`, throwing on every doc open once setup
   completed — likely breaking the operational menu for good after
   first-time setup. Fixed: `props` declared once at the top of `onOpen()`,
   reused for both property reads, matching every other function in the file.

**A third, larger bug found while verifying the fix above:** several
script files contained literal, unescaped newline characters inside
double-quoted string literals — invalid JavaScript that would fail to save
in the Apps Script editor at all, confirmed via `node --check` across the
whole `scripts/` tree. Fixed in `16_UnifiedManualSetup.js`,
`02_Form1_IntakeAndWorkspaceGenerator.js`, `03_QueueBridge.js`,
`10_AdminRecoveryPanel.js`, and `25_WarmUpWriter.js` (the latter four were
outside the original decision queue — found only because this pass
actually ran a syntax check on every file, which nothing before it had
done). `10_AdminRecoveryPanel.js` also had a related but distinct bug: two
literal, unescaped quote characters meant to wrap a term name in a
confirmation dialog (`"Archive "" + termToArchive + ""?"`), fixed by
escaping them. Every `.js` file in `scripts/` (including `archived/`) now
passes `node --check`.

### 3. Module numbering — corrected during implementation, not just relabeled

The originally-approved reconciliation decision called for renumbering the
mislabeled "Module 3" (SCR Suggestion & Remediation Engine) to "Module 4,"
and the existing "Module 4" (Student Context Aggregator) to "Module 5."
**That specific mapping was wrong, caught while implementing it**, once
`docs/CAS_Module4_Documentation_v1.0.docx` and `_v1.1.docx` — files not in
view when the original decision was made — were read in full. Both
versions of that document extensively, explicitly self-identify as
**"Module 4"** ("PRODUCTION READY," title page, footer) and both
independently state that future student-competency-coverage work (exactly
what the SCR engine does) is **"Module 5 territory"** — v1.0: *"If a
future Module 5 builds a genuine student-competency junction, it would
likely sit alongside — not inside — Script 29."* `30_SCRSuggestionEngine.js`'s
own header comment independently corroborates this: it already called
itself *"The Module 3 threshold script"* while calling Script 29
*"Module 4's Script 29"* three separate times.

**Corrected, final numbering:**

| Module | What it is | Status |
|---|---|---|
| **1** | Base intake/grading pipeline | Production, ~20 files (see below) |
| **2** | Lesson Intelligence (Lightweight + Full/Warm-Ups) | Production ready |
| **3** | Student Profile — extension of Script 23, no new scripts | Designed, per `PLATFORM_DOCUMENTATION.html` |
| **4** | Student Context Aggregator — Script 29 | **Unchanged, production ready** — this module's own numbering was always correct |
| **5** | SCR Suggestion & Remediation Engine — Scripts 30, 30b | Renumbered from mislabeled "Module 3" |

**What actually changed on disk:**
- `30_SCRSuggestionEngine.js` and `30b_SCRRetryRemediation.js`: "Module 3"
  self-references corrected to "Module 5" (their own file numbers, 30 and
  30b, are unaffected — only the module *label* moved).
- `08_TeacherConfirmationStep.js`, `15b_StudioFlowPrompts_Flow2_Revised.js`:
  same "Module 3" → "Module 5" label correction (their genuine "Module 2"
  and "Module 4" references — e.g. `07_TeacherDashboard.js`'s "Module 3
  student profiles," which correctly refers to the real Student Profile
  module — were left untouched).
- `scripts/19_ClonedSheetConfig_M3_ADDENDUM.js` → renamed
  `19_ClonedSheetConfig_M5_ADDENDUM.js`.
- `scripts/16_UnifiedManualSetup_M3_ADDENDUM_v2.js` → renamed
  `16_UnifiedManualSetup_M5_ADDENDUM_v2.js`.
- `docs/CAS_Module3_Documentation_v1.0.docx` and `_v1.0_alt.docx` → merged
  into `docs/CAS_Module5_Documentation_v1.1.docx` (see item 5 below); both
  originals kept in `docs/`, neither deleted (not moved into
  `docs/archived/` — see item 6 below).

`docs/PLATFORM_DOCUMENTATION.html`'s Module 3 (Student Profile) was never
part of this collision and is untouched.

### 4. Script 29/30/31 numbering — also corrected against real code, not just docs

The original decision assumed no code existed yet for scripts 29–31 and
called it "a pure documentation fix." **That assumption was wrong** — real,
substantial, already-implemented files exist: `29_StudentContextAggregator.js`
(Module 4, "PRODUCTION READY") and `30_SCRSuggestionEngine.js` +
`30b_SCRRetryRemediation.js` (Module 5). `00_SharedConfig_M2_ADDENDUM_v2.js`'s
claim that Scripts 29/30/31 should be Module 2's `importPacingGuide()`,
`importCompetencyRubrics()`, and `ArtifactCompetencyBridge` was itself
unbuilt (confirmed: those three functions don't exist anywhere in this
repo, only referenced by name in that addendum's setup checklist) — it
collided with real code and lost. **Corrected: Module 2's import/bridge
utilities move to 31/32/33** (not 29–31); 29, 30, and 30b keep their real,
already-implemented numbers. `docs/PLATFORM_DOCUMENTATION.html`'s Module 2
script-map table (previously stopping at 28) now lists 31–33 explicitly,
each flagged not-yet-built.

### 5. Platform-level docs — `DEPLOYMENT_AND_UX_GUIDE.html` split, not kept whole

Its four reference sections (Admin/Teacher/Student UX walkthroughs,
Document Anatomy, Folder Structure, Full Pipeline) were confirmed unique —
absent from all four previously-endorsed docs — and consistent with the
rest of the repo. Extracted into `docs/USER_EXPERIENCE_REFERENCE.html`,
now a fifth endorsed document (see `docs/PLATFORM_DEPLOYMENT_GUIDE_OUTDATED.md`'s
updated list). The remainder of the original file — its Steps 1–9
deployment walkthrough — is archived at
`docs/archived/DEPLOYMENT_AND_UX_GUIDE_SUPERSEDED.html` with a banner
explaining why: it self-contradicted on which script is the live setup
wizard (Script 16 vs. the already-archived Script 14), branded the system
"Decoupled AI Wrapper Engine v3.0" (a name used nowhere else in this
repo), and repeated a stale "14 Script files" stat.

### 6. `CAS_Module3_Documentation` v1.0 vs. `_alt` — merged, not picked

Diffing the actual document text (not just the already-known version/seed
notes) turned up real content in both directions. `_alt` had a Rubric
Upload Form repair (fixing "a pre-existing defect that would throw a
syntax error on the first teacher setup run") and a seed-CSV-assisted
`LessonPrimarySecondary` workflow that `v1.0` lacked. `v1.0` had a "TeacherMatrix
needs a `lesson_unit_id` column" gap entry — independently, directly
confirmed elsewhere in this repo (Known Gaps, in README.md) as still true — that
`_alt` silently dropped. Resolution: `docs/CAS_Module5_Documentation_v1.1.docx`
merges both, using `_alt` as the base (its guidance is strictly newer)
with `v1.0`'s dropped gap entry restored. Both source `.docx` files stay
in `docs/` unchanged (not physically moved into `docs/archived/`, unlike
the other superseded docs this pass touched). The v3/v4 addendum file and the
`LessonPrimarySecondary_Seed.csv` seed file referenced by the merged doc
remain open known gaps — still not uploaded anywhere.

---

## Round 3 — large reupload batch closes most remaining gaps

The user reuploaded 18 zip files "to ensure nothing was left out." Most
duplicated what was already reconciled above, but the batch contained
real, previously-missing material: the two data files Known Gaps #3/#4
were blocked on, a materially larger pacing guide, the six actually-missing
Module 2 Full scripts (as real code, not the doc-only spec Round 2
declined to author from scratch), a genuine renumbering collision inside
Module 2 itself, and a corrected Module 2 documentation set. Full findings
are on record in this session's plan file; what follows is what landed.

### 7. Data files — Known Gaps #3/#4 closed

`data/CompetencyRegistry.csv` (222 lines, 221 competencies — header
`competency_id,competency_text,subject,grade_band,strand,teacher_email,active`)
and `data/LessonPrimarySecondary_Seed.csv` (14 rows — 7 stage/node pairs ×
2 courses) are now in the repo, matching the schemas these gaps already
documented. `data/CompetencyRubrics.json` was also refreshed to a version
carrying the same 221 rubrics plus new `sol_correlations` metadata (same
generation date, strict superset — the old version is kept at
`data/archived/CompetencyRubrics_v1_SUPERSEDED.json`). Five VDOE SOL
correlation support files (`8177_Printable_Version_with_Standards_Correlations.docx`,
`8177_SOL_Official.csv`, `8177_SOL_Transitive_Mapping.csv`/`.docx`,
`8177_SOL_Transitive_Summary.csv`) were filed under
`data/sol-correlations/` as the documented derivation trail for that
metadata.

### 8. Pacing guide — adopted v2 as canonical

`curriculum/PacingGuide_CAS_Context.json` was replaced with a documented
superset rebuild (same 20 units, 16 fields → 20 fields — adds `chain_node`,
`esports_connection`, `vocabulary_with_definitions`, `studio_flow_hooks`;
warm-up anchors are now full teacher-authored prompts instead of
compressed summaries). The prior version is kept at
`curriculum/archived/PacingGuide_CAS_Context_v1_SUPERSEDED.json`.

**Update — gap closed:** `scripts/31_PacingGuideManager.js` now reads,
writes, and caches all 20 v2 fields. `PG_HEADERS`/`PG_COL_COUNT` were
extended (16 → 20, append-only) to carry `chain_node`, `esports_connection`,
`vocabulary_with_definitions`, and `studio_flow_hooks` into the
`PacingGuide` tab (the two structured fields are stored as a JSON string
per cell and parsed back out on read, with a defensive fallback to `[]`/`{}`
on a hand-edited cell). `resolveUnitForDate_`/`getWarmUpAnchor_`/
`getAllUnits_`/`getUnitById_` all expose the 4 new fields now — no
downstream consumer (Scripts 23/24) reads them yet, but they're no longer
silently dropped at the point of import.

Fixing this surfaced a real, pre-existing bug independent of the 4 new
fields: the pacing guide cache (`_loadPacingGuide_`) wrote all 20 units as
one JSON blob into a single Script Property, and PropertiesService caps a
single property at 9216 bytes. Measured against the real 2026-27 data,
that blob was already ~28KB with only the *original* 16 fields (the file's
own comment claimed "~10KB — at the limit," which undersold it by ~3x) —
meaning `setProperty()` was likely already failing silently into the
existing non-fatal catch block in production, before this fix touched
anything. Adding the 4 new fields in full would have pushed it to ~69KB.

**Fix:** the cache is now split one Script Property per unit
(`M2_PACING_UNIT_<lesson_unit_id>`) plus a small index property listing
which unit IDs are cached (`M2_PACING_GUIDE_INDEX`, replacing the old
`M2_PACING_GUIDE_CACHE` single-blob key). Every real unit's own row, even
with all 20 fields, comes in well under the 9216-byte cap (largest
observed unit: ~5.2KB) — no field needs blanket truncation for real data.
A defensive safety valve still exists for a hypothetical future unit whose
own content alone exceeds the cap: `warmup_anchor` (the one field this
file already established as safe to cut) gets truncated for that unit only,
flagged, and transparently recovered in full on demand by
`_getFullPacingField_` (generalized from the old warmup_anchor-only
`_getFullWarmupAnchor_`) — same mechanism, now reusable for any column.
Verified with a Node harness against the real 20-unit JSON (all units
cache without truncation) plus a simulated oversized-unit case (safety
valve fires correctly, full text still recoverable).

**Update — gap closed:** `curriculum/PacingGuide_CAS_Context.csv` and
`.docx` have been regenerated from the v2 JSON. The CSV was rebuilt
mechanically (20 columns, matching `PG_HEADERS` exactly — the two
structured fields are JSON-encoded per cell, same convention as the
`PacingGuide` sheet). The `.docx` was updated with a surgical text-only
edit of its `word/document.xml` (every style/formatting tag left
untouched, cloned from the real `division_context` schema-reference row
for the 4 new rows) rather than regenerated from scratch, since no
docx-authoring tool was available in this environment — verified via
zip-integrity check, XML well-formedness, open/close tag balance, and a
byte-for-byte diff confirming every non-`document.xml` part of the
archive is unchanged. It now correctly describes 20 columns (not 16),
lists the 4 new v2 fields in its schema-reference table, and its version
footer is bumped to v1.1. The prior versions are kept at
`curriculum/archived/PacingGuide_CAS_Context_v1_SUPERSEDED.csv`/`.docx`.

### 9. Six missing Module 2 Full scripts filed in as real code

`22_LessonContextHandler.js`, `22b_CompetencyRegistryImporter.js`,
`23_StudentProfileManager.js`, `24_WarmUpBridge.js`,
`26_CompetencyAlignmentLog.js`, and `28_Module2Setup.js` are now in
`scripts/` — real, substantial, already-implemented files, not the
doc-only spec Round 2 explicitly declined to author from scratch (that
decision was about *this project* writing untested code from a
specification; these are real uploaded files, a different situation).
`28_Module2Setup.js` had the same unescaped-newline-in-string-literal bug
class documented in resolution 2 above (four broken alert-dialog strings,
confirmed via `node --check`) — fixed the same way. **Script
`27_LessonFrameGenerator` was not in this batch and remains a genuine
open gap** — do not assume it shipped because its siblings did.

### 10. Module 2's own numbering collision — resolved by keeping the repo's existing direction

The batch's three Module 2 utility scripts — `PacingGuideManager`,
`CompetencyRubricImporter`, `ArtifactCompetencyBridge` — were built and
numbered **29, 30, 31** by whoever wrote them, unaware that this repo had
already resolved a *different* 29/30/31 collision (resolution 4 above) by
keeping those numbers for Module 4/5's `StudentContextAggregator` /
`SCRSuggestionEngine` / `SCRRetryRemediation`. The newly-uploaded
`CAS_Module2_Documentation.html` (v2.0) explicitly argues the *opposite*
resolution — renumber Module 4/5 to 32/33/33b instead. **Decision: keep
the repo's existing direction.** Module 4/5 keep 29/30/30b unchanged (two
already-verified reconciliation passes and more cross-references than the
newly-arrived alternative). Module 2's three utilities are filed in as:

| Old (as authored) | Filed as | Log tag |
|---|---|---|
| `29_PacingGuideManager.js` | `scripts/31_PacingGuideManager.js` | `[S31]` |
| `30_CompetencyRubricImporter.js` | `scripts/32_CompetencyRubricImporter.js` | `[S32]` |
| `31_ArtifactCompetencyBridge.js` | `scripts/33_ArtifactCompetencyBridge.js` | `[S33]` |

Every internal self-reference (log prefixes, header comments, the CRON
sequence comment, and cross-references from `22b`/`23`/`24`/`28`) was
updated to the new numbers — verified by grep, not assumed.
`00_SharedConfig_M2_ADDENDUM_v2.js` already documented this exact 31/32/33
target numbering before this batch arrived, so no change was needed
there. `files_42/00_SharedConfig_M2_ADDENDUM.js` (no `_v2`) is confirmed
stale — the version already in this repo supersedes it — and was **not**
reintroduced. `docs/PLATFORM_DOCUMENTATION.html`'s Module 2 script-map
table, previously flagging 31–33 "not yet built," now reflects that they
are.

### 11. Module 2 documentation — v2.0 adopted, with a numbering disclaimer

`CAS_Module2_Documentation.html` (v2.0) is a materially larger successor
to the archived `docs/CAS_Module2_Documentation_v1.1.docx` (now at
`docs/archived/CAS_Module2_Documentation_v1.1_SUPERSEDED.docx`) — it
documents the Full/Warm-Up build the old docx doesn't. Adopted as
`docs/CAS_Module2_Documentation_v2.0.html`, **with a banner added at the
top** disclosing that its own "Numbering Collision" section argues for
the resolution this repo did *not* take (see item 10) — every "Script 29
/ 30 / 31" in that document means this module's own pre-renumbering
scheme and should be read as 31/32/33. Five companion docs — 
`CAS_ContextualGates_DesignPrinciples.html`, `CAS_Flow3_Flow4_Specification.html`,
`CAS_M2_DeploymentGuide.html`, `CAS_M2_Schema.html`,
`CAS_M2_WarmUp_Schema.html` — were filed in alongside it; the three that
reference script numbers also carry a short version of the same
disclaimer banner.

### 12. Known Gaps #2 closed — `lesson_unit_id` added

Round 2's planned fix, executed here: one new column, following the exact
append-only pattern the M5 competency-ID addendum already established.
`08_TeacherConfirmationStep.js` gained `TM08.LESSON_UNIT_ID` (19) and
`DU08.LESSON_UNIT_ID` (18), a new "M6" documentation block, a new
`onTeacherConfirmSubmit()` read/write path, and a new blank pre-fill entry
in `buildPrefilledUrl_()` — directly merged into the file, matching how
its M5 columns were already merged rather than left as an unmerged
addendum. `scripts/16_UnifiedManualSetup_M6_ADDENDUM.js` and
`scripts/19_ClonedSheetConfig_M6_ADDENDUM.js` are new, unmerged patch
files (same convention as the M5 addenda they sit on top of) adding the
Confirmation Form's new "Lesson Unit" dropdown (sourced from Script 31's
`PacingGuide` tab) and its config plumbing. "M6" is a file-naming label
only — there is no `CAS_Module6_Documentation` and none is planned.
**Known gap carried forward, not introduced by this change:** neither the
M5 nor the M6 addenda extend the base `TeacherMatrix`/`DraftUnits`
`setHeaders_()` calls in `16_UnifiedManualSetup.js` with the new columns'
header labels — those columns are fully functional (read/written by
position) but have no header text. Cosmetic, pre-existing, flagged here
rather than silently fixed as a drive-by change.

### 13. Archived-file naming convention — Known Gaps #8 closed

`scripts/archived/11_StudentFriendlyRejections_ARCHIVED.js` renamed to
`scripts/archived/ARCHIVED_11_StudentFriendlyRejections.js`, matching the
prefix convention `ADMIN_DEPLOYMENT_WALKTHROUGH.html` documents (a `git
mv`, no content change).

---

## UI/UX Hardening — Rounds 1–9

After the reconciliation work above landed, this codebase went through nine
further rounds of dedicated UI/UX auditing — each round re-examined the
whole UI against everything already fixed, then split its findings into a
bugs commit and a separate polish commit. What follows is cas-ccps's share
of that record; see kos-personal's and leader-hub's own READMEs for
theirs. Commit hashes are given so any item's full diff/rationale can be
looked up directly.

**Round 1** (`d37f3c4`, `1a51e22`, `a6b74d5`) — the initial pass. Fixed
`resolveStudentStatus_`/`resolveStudentClass_` falling through to showing
a raw Ledger status string to a student on blank/unexpected data; ISSUE-
status cards sorting last instead of first (the one status telling a
student to contact their teacher was buried below finished work); and
both dashboards' failure paths showing raw exception text with no
recovery path. Also: a mobile-responsive header, a lesson-log discard
warning with a real focus trap, and — found while fixing the discard
guard — **an escaping bug where unescaped backticks in a new empty-state
message broke the outer client-HTML template literal.** The lesson-log
form gained a 500ms-debounced autosave draft and last-used-period memory;
dashboards gained a per-term client cache (background-revalidating, never
clobbering good cached data with a revalidation-failure screen) and
scroll-position preservation across re-renders; and teacher/student
wording was aligned so both dashboards describe the same pipeline stage
the same way.

**Round 2** (`c329ccf`, `3a8ebf7`) — **fixed `CURRENT_TERM`'s smart
default being dead code**: the term dropdown always sent the literal
string `"ALL"` on first load, which is truthy, so the server's fallback
chain never actually consulted the admin-configured term — every
teacher/student always opened on the unfiltered, all-terms view no
matter what was configured. Also fixed lesson-log draft restore silently
backdating today's log with a stale date from an abandoned prior-day
draft; unified status colors so the same pipeline stage renders
identically on both dashboards; gave the student dashboard the same
staging-pipeline lookup the teacher side already had (so "evaluating
now" became visible instead of a static "queued" the whole time); added
real ARIA tablist/tab/tabpanel semantics + keyboard nav to the course
tabs; and split "no results for this term filter" empty-state copy from
"genuinely no roster yet" (previously showed identical setup-
troubleshooting copy for both, which was actively misleading).

**Round 3** (`f63bcae`, `4bb4491`) — fixed the teacher dashboard's
summary numbers not reconciling: both the unit-header tally and the top
summary cards excluded `EVALUATED` and `NOT STARTED` students from every
bucket, so the displayed counts never summed to the real total. Also
gated "+ New Lesson" behind `M2_ENABLED` (previously always rendered, so
a teacher without Module 2 could fill out the whole form before hitting
an internal error at submit); replaced a native `confirm()` with an
in-app dialog; fixed `buildShadowMatrixSummary_()` returning a truthy
zeroed-out object instead of `null` when there's no profile data yet,
which rendered a fake "0 of 0 students" panel instead of hiding it; and
fixed the student dashboard staying stuck on "Loading…" with no retry on
an application-level error (only the network-failure path had one).

**Round 4** (`641633c`, `ce39d09`) — **the most severe bug found in any
round: `LessonContext`'s `lesson_date` column was silently getting
type-coerced by Sheets from a `"YYYY-MM-DD"` string into a real `Date`
object**, which broke every string-comparison-based duplicate/lookup
check downstream and silently stopped the nightly warm-up queue from
ever matching a lesson — while the teacher dashboard still showed a
success toast, giving no indication anything had gone wrong. Fixed by
forcing the column to text format on every writing tab and normalizing
every read-side comparison to be resilient regardless of the cell's
underlying type. Same commit also closed the same
truthy-zeroed-object bug class for the zero-profiled-students case, fixed
a draft-staleness hint omitting the `period` field, and fixed the
discard-confirm dialog's focus trap always targeting the first `.modal`
in DOM order instead of whichever one was actually open on top.

**Round 5** (`40229bd`) — added `LockService.getDocumentLock()` to
`26_CompetencyAlignmentLog.js` and `08_TeacherConfirmationStep.js`,
matching `03_QueueBridge.js`'s existing precedent, closing a duplicate-
AlignmentLog-row / duplicate-confirmation-email race on overlapping
trigger runs; normalized the last unfixed raw `String()` cast on a
`lesson_date` cell; unified `M2_ENABLED` guard polarity to strict opt-in
across 6 files (the prior opt-out check let Module 2 backend jobs run on
an installation that never explicitly set the property); and fixed a
dashboard per-term cache-key mismatch that made a manual Refresh
immediately after page load miss the cache it should have hit.

**Round 6** (`8273ed4`, `803ba1f`) — fixed `.course-tabs` clipping extra
tabs with no way for mouse/touch users to reach them (no
`overflow-x:auto`, sitting inside a parent with `overflow:hidden`); fixed
two pluralization/grammar bugs; restored the `FLAGGED` status's ⚠ icon on
the student dashboard (present on the teacher side, lost on the
student's); and unified status-badge/pill geometry and loading-spinner
diameter between the two dashboards.

**Round 7** (`5f1c4d2`, `12730fb`) — fixed the discard-confirm "Keep
editing" action dropping keyboard focus to `<body>` instead of restoring
it; fixed `m2Enabled` (a global admin setting) being read off whichever
per-term cached dashboard blob happened to be rendered, which could
flicker the "+ New Lesson" button based on a stale snapshot; mirrored a
dangling `"Period ·"` fix from the teacher dashboard onto the student
side; and added roving tabindex to the course tab bar, completing the
ARIA tabs pattern started two rounds earlier.

**Round 8** (`3fd08da`, `cef3700`) — fixed `#warmup-readiness-panel`
carrying two conflicting `display` declarations in one style attribute
(`display:none` then `display:flex` later in the same string — the later
one wins per CSS cascade rules, so the panel was visible from page load
contrary to its own apparent intent); fixed the teacher dashboard's
empty-roster early-return path never reaching the term-dropdown
population logic, mirroring a fix the student dashboard already had; and
moved the competency-loading `aria-live` region onto a persistent
container, since the registry-error/zero-competencies/network-failure
paths were all replacing (and thereby destroying) the element that
originally carried it, right when there was something worth announcing.

**Round 9** (`0d433eb`, `513424f`) — fixed `buildShadowMatrixSummary_()`'s
two confidence buckets not being mutually exclusive: every "locked"
student (≥0.75 confidence) was also being counted in "building
confidence" (>0.5), so the dashboard's two stat lines double-counted the
same students. Fixed `saveLessonDraft()` never persisting checked
competency checkboxes — even though submission requires at least one
checked competency — so a crash/tab-close mid-entry restored every typed
field but silently dropped every competency selection, forcing a full
re-check with no indication that was expected. Also added proper
`role="group"`/`aria-required` semantics to the competency checkbox
group (missed by Round 8's otherwise-complete `aria-required` sweep of
the lesson form), and removed a `\n`-to-`<br>` conversion from the
student dashboard's `esc()` that the teacher dashboard's identically-named
`esc()` never had — since `esc()` is the general-purpose escaper for
every field on the page, a Sheet cell with an embedded newline was
rendering a line break on one dashboard but not the other for identical
data.

---

## Studio Steps adoption — Flows 1–5's custom-step code lands

Adopted from a reviewed external drop of ~2,200 lines of custom Workspace
Studio step code, staged across six sequential steps rather than one
commit, each landed on its own branch and verified before merging.

**Landed an 8th cas-ccps project, `cas-ccps/studio-steps/`** — 9 `.gs`
files covering every step behind Flows 1–5 that a native Studio connector
genuinely can't do cleanly (native Sheets/Docs connectors and Ask-Gemini
steps still handle everything else): `StepsShared.gs` (shared helpers),
`CommitRubricDraftStep.gs` (Flow 1), `ReadInstructorConfigStep.gs` +
`CommitStudentEvaluationStep.gs` (Flow 2), `SelectWarmUpArchetypeStep.gs`
+ `CreateWarmUpDocStep.gs` (Flow 3), `ExtractWarmUpPromptTextStep.gs` +
`FinalizeWarmUpScoreStep.gs` (Flow 4 — closing a confirmed-dead
`callFlow4_()` placeholder that made warm-up scoring inoperable), and
`ExtractBridgeInputsStep.gs` (Flow 5). See `cas-ccps/studio-steps/README.md`
for the full file-to-flow map and every fix applied while landing it —
summarized here: a shared `inStr_()` safe-input reader plus a whole-body
try/catch in every step (a raw `inputs["x"].stringValues[0]` read throws
before any status can be returned, stranding the trigger row), fence-
stripping before `JSON.parse` (Gemini routinely wraps output in a
markdown fence), a U+2500 box-drawing marker bug in
`CommitStudentEvaluationStep.gs` that would have silently broken two live
consumers' "insert next-steps text after the evaluation" logic on every
Flow 2 run, `CompetencyEvidence` tab auto-creation, and a PII-logging
reduction across all nine files.

**Reconciled `CompetencyEvidence`'s schema across its two writers.**
`15c_Flow2DirectEvaluationService.js`'s `writeCompetencyEvidenceFromFlow2_()`
(the manual/dev-testing bridge) and `CommitStudentEvaluationStep.gs`
(Flow 2's real Studio writer) both write to the same tab; widened 15c to
the same 8-column schema the Studio step used at the time (since widened
again to 9 columns by the `archive_status` retention column) so
`30_SCRSuggestionEngine.js`'s header-driven `aggregateEvidence_()` reads
correctly regardless of which writer seeds the tab first — confirmed
with a dedicated cross-project schema-compatibility test
(`tests/cas-ccps/competency-evidence-schema-compat.test.js`).

**Landed `35_FlowPreflightAndCanary.js`** — a one-shot health check. Its
`CompetencyEvidence` check "failing on every deployment" turned out to be
a true positive: no existing setup script (`16_UnifiedManualSetup.js`,
`28_Module2Setup.js`) ever created that tab, silently stranding Flow 2's
evidence writes. Fixed by adding `cfg.tabs.competencyEvidence` to
`00_SharedConfig.js` and extending the existing `createSCRTabs_()` to
create it alongside `SCRSuggestions`/`SCRDecisionLog`. Also fixed: the
canary write now uses `appendRow` + a document lock instead of a
row-shifting `deleteRow` (which would have broken the watchdog's
row-number-keyed state), and a dead `ADMIN_SS_ID` check was dropped.

**Landed `34_QueueWatchdog.js`** — WarmUpQueue/StagingPipeline/ReviewQueue
monitoring with Chat-space escalation, the one genuinely new coverage
area (`10_AdminRecoveryPanel.js` and `06_StagingPipeline_Turnstile.js`
already covered the other two queues). Fixed four blocking defects found
during review before landing: unbounded `PropertiesService` growth (no
pruning on the healthy path — the exact bug class
`kos-personal/10_Turnstile.gs` already had to fix once), a `STUDIO_TIMEOUT`
escalation that orphaned student submissions instead of reusing the
existing `ERROR_TIMEOUT` path, `getScriptLock()` where every other writer
to these cells uses `getDocumentLock()`, and one release-map key shared
across three status passes causing early escalation. Ships in dry-run
mode by default.

**Fixed Flow 5's ordering bug in `24_WarmUpBridge.js`.** `buildWarmUpQueues()`
now writes a two-status split
(`row[WQ24_STATUS] = priorResponse ? "PENDING_BRIDGE" : "PENDING"`)
instead of a single `PENDING` status, so a row with a real prior warm-up
response goes through Flow 5 (the bridging flow) before Flow 3, instead
of racing it. Landed as a bundle with every artifact this change strands
if left alone: the Module 2 setup wizard's on-screen instructions
(`28_Module2Setup.js`, two places), the status enum in
`CAS_M2_WarmUp_Schema.html`, the trigger/output rows in
`CAS_Flow3_Flow4_Specification.html` and `CAS_M2_DeploymentGuide.html`
(including a manual test-walkthrough step that was actually wrong after
this change), and `ExtractBridgeInputsStep.gs`'s own stale header.

**What this closes, and what it doesn't.** Every custom step Flows 1-5
need now exists in code, is registered in `tools/gas-lint/project-map.json`,
and is covered by tests (286 passing repo-wide as of this adoption). What
remains is deployment, not code: `cas-ccps/studio-steps/` hasn't been
pushed to a live Google account yet (`.clasp.json.template`'s scriptId is
still a placeholder), and no flow has actually been wired together in
Studio's builder. See `cas-ccps/README.md`'s Known Gap #1 and Finding 18
for the current-state summary this entry feeds.


---

## Sprint 1 — docs entry point, weekly parent report, export doc links

Three components from a sprint plan, two of which landed close to as
proposed and one of which needed a different design. Verifying the plan
against the code first turned up several claims that would have caused
rework mid-build, so those are recorded here alongside what was built.

### What the sprint plan got wrong

- **"Couldn't locate a manifest for the cas-ccps script project."** Eight
  committed manifests live in `clasp/manifests/`; the copies under
  `.clasp-build/` are generated and gitignored, which is almost certainly
  what was searched. This inverted the plan's own delivery recommendation:
  `central-ledger.appsscript.json` already declares `script.send_mail`, so
  `MailApp` is free, while `GmailApp` would need `https://mail.google.com/`
  — full read/modify/delete on the teacher's entire mailbox — for no gain
  over sending directly.
- **`RubricQueue` as a per-student assignment record.** It has no student
  column at all (`Timestamp | TeacherEmail | TeacherName | Subject |
  CourseName | Tier | RubricText | PromptTemplateID | TeacherMatrixSsId |
  Status`); it is Studio Flow 1's rubric-drafting funnel. The `Ledger`
  carries the per-student weekly data, including `TurnInSuggestedScore` and
  `TurnInFinalScore` as adjacent columns.
- **`exportScrDecisionLogForAudit()` "exports the decision log."** It is a UI
  wrapper around `exportToWorkbookGrid_()`, which produces a pivoted grid —
  one tab per class, one row per student, one column per competency. Seven
  of SCRDecisionLog's ten columns never appear in it, `evidence_snapshot`
  included. The plan's "each row links to the submitted work, not just the
  evidence-snapshot text already included" was wrong twice over.
- **Most of the assembly already existed.** `getWeeklyAssignments_()`
  (Script 29) already did the per-student weekly window; it needed four more
  columns, not a new join.
- **No assignment title exists anywhere**, so a parent report can only label
  work by course and date. Printing a ConfigID (`VDOE-XK4M2P-2025`) at a
  parent tells them nothing.
- **`everyDays(7)` is a rolling interval anchored to install time**, not a
  weekday. Copying the two existing weekly triggers would have produced a
  parent report arriving on a drifting day.

### The design change that mattered

The plan proposed `GmailApp.createDraft()`, landing a draft in the teacher's
own Gmail for them to address and send. Delivery moved into the Teacher
Dashboard instead. Three reasons, in increasing order of weight:

1. No new OAuth scope. See the manifest point above.
2. Reuses the `_isAuthorizedTeacher_()` + `google.script.run` +
   Pending Review modal pattern already in `07_TeacherDashboard.js`.
3. **The app sends, so the app knows the recipient.** A hand-addressed draft
   leaves no record of where a child's scores went. The most likely FERPA
   incident this feature can produce is one child's report reaching another
   child's parent, and `ParentReportLog.recipient_address` is the only thing
   that makes that detectable afterwards. The plan's own field list had
   "sent status if knowable" — this design makes it knowable.

### The disclosure boundary, written down

This is the first thing in cas-ccps that sends student data off-domain.
Everything else is walled — `exportScrDecisionLogForAudit()` rejects
off-domain recipients in those words, `exportToWorkbookGrid_()` applies
`DriveApp.Access.DOMAIN`, health check (c) audits it. The sprint plan
didn't mention this at all.

FERPA permits disclosure to a parent, so the exception is legitimate; it is
now recorded as a decision in `docs/FERPA_DATA_MAP.md` rather than left as
an emergent property of a mail API choice. Four constraints keep it narrow,
each in code: only a teacher can send (the weekly trigger prepares and sends
nothing), only teacher-confirmed values leave, one student at a time (no
"send all"), and every send is logged with its recipient.

The second constraint follows a decision this system had already made.
`01_StudentDoc_ContainerScript.js`'s `PENDING_TEACHER_REVIEW` state shows
the *student* no number, because "nothing is final until the teacher
confirms or overrides it." A parent is further from the work than the
student, so a confirmed score prints a number and everything else prints
"with your teacher for review" and is counted. The report reads
`TURN_IN_FINAL_SCORE` and `SCRDecisionLog`, never `TURN_IN_SUGGESTED_SCORE`
or `SCRSuggestions` — and `SCRS`, that tab's column map, was deliberately
left in Script 30 rather than moved to `00_SharedConfig.js` alongside
`SCRDL`, so a dashboard-project file that tried to read suggestions fails
at load instead of quietly rendering one.

### What landed

- **`docs/index.html`** — the first index over `docs/`, which had 15 HTML
  files and zero cross-links between any two of them. Four role-based
  routes plus a reference list.
- **`36_WeeklyParentReport.js`** — assembly, two-section rendering,
  `MailApp` send, `ParentReportLog` write-back with dedup, the five-part
  retention pattern, and a `onWeekDay(FRIDAY)` prep trigger. Listed under
  both `central-ledger` and `teacher-dashboard` in `project-map.json`, so
  it may only call functions present in both — noted in its own header,
  since Script 30's helpers are not.
- **Teacher Dashboard panel** — review-and-send, one student at a time,
  with each report's full text behind a "Read what will be sent" toggle.
- **`ParentReportLog`** — the disclosure log, using SCRDecisionLog's
  legal-hold archive vocabulary rather than the reversible one, and a 7th
  `_ferpaHealthChecks_()` check pairing its counter with its archiver.
- **`Student Doc` column in the SCR export** — joined from
  `StudentDocRegistry`, whose one-row-per-student grain matches the grid's.
  No sharing change: those docs are already shared with their own student,
  and the workbook is already domain-restricted at creation.

### Two things found while building

- **`_turnInScoreOrNull_`.** `cell || null` turns a genuine score of 0 into
  "awaiting review". Cosmetic in an aggregator; in a parent report it is the
  difference between "your child scored 0" and "not yet marked".
- **The dashboard's 72KB of inline client JS had nothing checking it.**
  leader-hub's single-file app has had that coverage since `html-lint`
  landed, but `07_TeacherDashboard.js`'s markup is a JS template literal, so
  a stray bracket in the client script was invisible to every check in the
  repo — and would fail silently in the teacher's browser, not in the server
  function that emits it. `tests/cas-ccps/teacher-dashboard-inline-js.test.js`
  now renders the real HTML through the sandbox and parses each block.

Also added: `MailApp`, `ScriptApp`, `getActiveSheet()` and
`setFrozenColumns()` to `tests/harness/gas-sandbox.js`; `GmailApp` stays
deliberately unmocked, with the reason recorded there.

`npm test` 374 passing (up 28), gas-lint 0 errors / 4 warnings,
doc-currency 0 errors. Each safety test was checked by reverting the fix it
covers and confirming it fails.

### Fixture data for every flow's trigger (`39_FlowFixtures.js`)

The single biggest time sink of the deployment wasn't any of the three walls —
it was building flows against empty sheets. Flow 1's first build failed
repeatedly with "Can't match any row," and diagnosing *that* cost more than
fixing it. A flow can't be Test Run without a row matching its trigger
condition, and a chip bound to a missing value looks identical to a chip
bound wrongly.

`installFlowFixtures()` seeds persistent dummy data at all five trigger
conditions: a `RubricQueue` row at `PENDING_EXTRACTION` (Flow 1, with a real
scratch prompt-template Doc and TeacherMatrix so the happy path works, unlike
the canary's deliberate not-found case), a fully-populated `FlowInput` row at
`READY` (Flow 2 — every column filled, so no chip is ambiguous while wiring
Ask Gemini), and three `WarmUpQueue` rows parked at `PENDING_BRIDGE`,
`PENDING` and `PENDING_EVAL` so Flows 5, 3 and 4 all have something to build
against at the same time. `checkFlowFixtures()` reports readiness;
`removeFlowFixtures()` clears everything and trashes the scratch files.

**This is not the canaries, and the file says so at length.** Canaries seed,
verify and clean up inside one execution — they answer "is the code right?"
Fixtures sit there for as long as you're clicking a flow together. Separate
marker namespaces (`VDOE-FIXTURE-*` / `WUQ-FIXTURE-*` /
`fixture-*@example.invalid` versus the canaries' `VDOE-CANARY-*` /
`canary-test+*@example.invalid`) so neither one's cleanup can eat the other's
rows — asserted by a test.

Two interactions documented rather than engineered around: a live flow
**consumes** its fixture by advancing the row's status, which is exactly what
proves the flow fires (re-run the installer, it's idempotent); and
`34_QueueWatchdog.js` will report a long-lived fixture as a stuck row, which
is the watchdog working, not misfiring. It defaults to dry-run, so it alerts
rather than escalating.

Building this also settled a real documentation discrepancy: **Flow 4 triggers
on `PENDING_EVAL`, not `DELIVERED`.** `28_Module2Setup.js`'s Phase B dialog
says `PENDING_EVAL` and `34_QueueWatchdog.js` watches that status; the
`DELIVERED → PENDING_EVAL` hop belongs to `25_WarmUpWriter.js`'s
`runWarmUpEvaluation()`, not to any flow. `35_FlowPreflightAndCanary.js`'s own
closing notes had said Flow 4 needed "a real WarmUpQueue row already at
DELIVERED," which would have been the wrong status to seed.

### Prompts get a deployable home (`40_FlowPrompts.js`)

Five of the six system prompts had no deployable home at all, which nobody
had noticed:

| Flow | Prompt lived in | Deployed? |
|---|---|---|
| 1 | `15_StudioFlowPrompts.js` | **No** — `project-map.json` lists it under `_excluded_not_deployed_scripts` |
| 2 | `15b_...js` | Yes — the one exception |
| 3 A/B | `docs/CAS_Flow3_Flow4_Specification.html` | **No** |
| 4 | the same HTML | **No** |
| 5 | the same HTML | **No** |

A prompt living only in a rendered HTML spec means every change is a
copy-paste out of a browser into Studio's UI — with the doc's own
`<span class="kw">` markup interleaved through the text, so the paste isn't
even clean — and no version history of what the live prompt actually says.

`40_FlowPrompts.js` is now the one deployable home. The Flow 3/4/5 text was
extracted **mechanically** from the spec's own `prompt-body` and `<pre>`
blocks (strip highlight spans, strip tags, unescape, trim) and Flow 1's was
copied from file 15 — nothing retyped or paraphrased. Two tests re-run that
same extraction and fail if either source has drifted, which turns the
duplication into a detectable condition rather than silent rot. Flow 2 stays
resolved through 15b's own constant rather than copied, since a second
declaration in the same GAS project would collide at parse time.

`substituteFlowPrompt_()` handles both placeholder styles — Flows 1-2 use
`{{DOUBLE_BRACE}}`, Flows 3-5 use `{single_brace}`, an artefact of the two
sources that isn't worth rewriting five prompts to unify. Its important
behaviour is that an unmatched placeholder is **left in place**, not blanked:
blanking produces a prompt that looks complete while asking Gemini to
evaluate against nothing.

Two ways a flow can now read its prompt instead of carrying a pasted copy:

- `syncFlowPromptsToSheet()` writes one row per prompt to a `FlowPrompts` tab.
  Because that tab is on the one spreadsheet every native step can already
  reach through its fixed picker, a flow can read its own prompt with a "Get
  sheet contents" step and bind the `prompt_text` chip into Ask Gemini.
  `checkFlowPrompts()` reports drift between sheet and code — the question
  that actually matters after someone edits a prompt and pushes.
- For Flow 2 there's a shorter path needing no extra step: `FlowInput` gained
  a `PromptText` column (appended at the END — appending is safe where
  inserting is what cost us the Ledger incident), holding the prompt with
  every rubric value already substituted. Studio binds
  `@trigger.PromptText`.

`{{STUDENT_TEXT}}` is deliberately the one placeholder left standing in that
column. Its value comes from Studio's Extract step reading the student's Doc,
after the row exists — and pre-substituting it would mean this code reading
the Doc and writing the student's writing into the central Ledger, the exact
FERPA regression the pointer-based design exists to prevent. So Studio maps
one variable rather than carrying one prompt.

### Still open

`PARENT_REPORT_RETENTION_YEARS` defaults to 5 years, inherited from the
three existing retention windows and, like them, **not confirmed against any
district or state schedule.** That gap matters more here than elsewhere:
this is the tab that exists to answer "what did we tell whom", which is the
question a records request asks.

---

## `27_LessonFrameGenerator` — the one Full script closed

The last remaining gap named repeatedly since resolution 9 above
(`cas-ccps/README.md`'s module table, `meta/CODEBASE_REVIEW.md`,
`PLATFORM_DOCUMENTATION.html`'s script inventory) is built. Not an
unassigned slot — a specific, named script two other files were already
wired for: `22_LessonContextHandler.js`'s `onLessonContextSubmit_()` has
returned `frameDocUrl: null` since it was written, with the comment
*"frameDocUrl is null until Script 27 is built"*, and
`07_TeacherDashboard.js`'s client already does
`if (firstFrameDocUrl) window.open(...)` — dormant, waiting for that field
to ever be non-null. Neither file needed a change beyond Script 27 existing
and being called; `PLATFORM_DOCUMENTATION.html`'s own note (*"No frontend
change required"*) held.

**Resolved a real architectural disagreement between docs before building
anything.** `CAS_Module2_Documentation_v2.0.html` and `CAS_M2_Schema.html`
describe the hook as synchronous — a URL ready in the same request/response
cycle as the lesson submission. `PLATFORM_DOCUMENTATION.html` instead frames
it as **"Studio Flow 5,"** matching the async, nightly-cron shape of Flows
3/4. The two are incompatible: an async flow means no URL exists by the time
submission returns, and the already-built `window.open()` hook would simply
never fire. Built synchronous — every piece of content it needs (objective,
activity, prior-lesson connection, competency text) is already-collected
data, none of it requiring an LLM call, exactly like
`26_CompetencyAlignmentLog.js`'s `generateAlignmentReport()`, whose
Doc-building idiom this reuses directly (`DocumentApp.create()` → `moveTo`
teacher folder → headings/paragraphs → `saveAndClose()` →
`registerReport_()`).

**No real "suggested warm-up question" is possible at generation time, so
the doc says so rather than fabricating one.** `LessonContext` and
`WarmUpQueue` are unrelated subsystems — `24_WarmUpBridge.js`'s
`findLesson_()` reads `LessonContext` only to *feed* Flow 3's future nightly
generation, never the reverse. At the moment a frame is compiled
(synchronously, at submission), no warm-up exists yet for that lesson in the
ordinary case. The frame's "Suggested Warm-Up" section carries a labeled
placeholder instead of a lookup that would almost always come up empty.

**Closed a real gap between documented and implemented status lifecycle.**
`CAS_M2_Schema.html` has always described `RECEIVED → ALIGNMENT_LOGGED →
FRAME_GENERATED`; the code only ever implemented the first two. Added
`LC_STATUS_FRAME_GENERATED` and three new self-healing `LessonContext`
columns (`frame_doc_id`, `frame_doc_url`, `frame_generated_at`) — same
self-healing convention as `_ensureTurnInReviewColumns_()`
(`07_TeacherDashboard.js`), so a deployment created before this feature
existed gets the columns on first use. The doc's `PUBLISHED` status has no
described mechanism anywhere in this repo and stays undocumented rather
than invented here.

**Widened `registerReport_()` instead of duplicating it.**
Script 27 needed the identical ReportRegistry-write mechanic under a new
`report_type` (`LESSON_FRAME`). `registerReport_()` gained an 8th, optional
`reportType` parameter defaulting to `"ALIGNMENT_TERM"`, so
`generateAlignmentReport()`'s one pre-existing call site is unaffected. This
works because Script 27 sits in exactly the two projects
`26_CompetencyAlignmentLog.js` already does
(`cas-ccps:central-ledger` + `cas-ccps:teacher-dashboard`) — calling the
shared function directly instead of copying it, matching this codebase's
established preference (see `36_WeeklyParentReport.js`'s own header).

**gas-lint caught a real cross-project bug before it shipped.** Script 27
calls `getRubricsForLesson_()` (`32_CompetencyRubricImporter.js`) for the
competency-alignment section — but that file was only ever in
`cas-ccps:central-ledger`. Script 27 runs synchronously inside the Teacher
Dashboard project (called from `onLessonContextSubmit_()`, which runs
there), so the call would have thrown `ReferenceError` in a live Teacher
Dashboard deployment. `node tools/gas-lint/check.js` flagged it as a
possibly-undefined-in-project warning the moment the project-map entry was
added; fixed by adding `32_CompetencyRubricImporter.js` to
`cas-ccps:teacher-dashboard` too (it only depends on `getConfig_()`, present
in every project, so this is safe).

**A competency ID missing from `CompetencyRubrics` is noted, not silently
dropped.** `getRubricsForLesson_()` itself only logs a warning and omits a
missing ID from its result — exactly what would have made a Lesson Frame
quietly show fewer competencies than the teacher actually selected. Script
27 diffs the requested IDs against what came back and lists any gap
explicitly.

Also added to `tests/harness/gas-sandbox.js`: the `MMM d, yyyy h:mm a` date
format, and `appendHorizontalRule()`/`setIndentStart()`/`setItalic()` as
paragraph-level no-ops — all three already used by
`generateAlignmentReport()`, which had never been called by any test before
this one needed to exercise `registerReport_()`'s widening through a real
call.

`npm test` 393 passing (up 14), gas-lint 0 errors / 4 warnings. Verified
non-vacuous on four points: the `frameDocUrl` hook (revert to hardcoded
`null`), the blank-prior-connection omission, the missing-competency note,
and the `registerReport_()` widening — each mutation caught by exactly the
test meant to cover it.

## Script 27 follow-up — a real column collision, found and fixed

A third-party product review of this codebase (see below for the full
verification of its other 16 claims) surfaced one true fact along the way
that led to a genuine, self-inflicted bug: while checking whether a
`warm_up_generated` column really exists, `LC24_WARM_UP_GENERATED = 14` /
`LC25_WARM_UP_GENERATED = 14` (`24_WarmUpBridge.js`/`25_WarmUpWriter.js`)
turned up — a real, pre-existing `LessonContext` column this earlier
Script 27 work never checked for. `LC_FRAME_DOC_ID` had also been assigned
`14`. Same index, two unrelated features, one shared sheet, both scripts
in the same `cas-ccps:central-ledger` GAS project.

The earlier documentation pass this session had it backwards: it corrected
`CAS_M2_Schema.html` to say `warm_up_generated` "does not exist in the
built schema and never has." It does — as a plain String status column
(`""`/`"QUEUED"`/`"DELIVERED"`), not the Boolean an even earlier draft of
that doc briefly described. Both the "it's fictional" claim and the column
collision are corrected together here.

**Real-world consequence, either order:** on a deployment where
`createLessonContextWarmUpColumn_()` had already added `warm_up_generated`
at column 15 (1-based), `_ensureFrameColumns_()` would find "warm_up_generated"
where it expected "frame_doc_id", overwrite the header, and
`generateLessonFrame_()` would then overwrite that row's warm-up delivery
status with a Drive file ID — silently breaking warm-up tracking. In the
other order (Script 27 exercised first on a fresh install), the pre-existing
`createLessonContextWarmUpColumn_()` used to append at
`sheet.getLastColumn() + 1`, landing past Script 27's columns — not at the
fixed index `LC24_WARM_UP_GENERATED`/`LC25_WARM_UP_GENERATED` both scripts
hardcode for every read and write — silently breaking it in the other
direction instead.

**Fix:** `LC_WARM_UP_GENERATED = 14` is now an explicit, reserved constant
in `22_LessonContextHandler.js` — documented, never written by that file.
The Lesson Frame columns moved to 15-17. `createModule2Tabs_()`'s header
array now includes `warm_up_generated` directly, so a fresh install never
needs the manual migration at all. `createLessonContextWarmUpColumn_()`
itself was changed from a dynamic `getLastColumn() + 1` append to writing
at the fixed `LC24_WARM_UP_GENERATED + 1` position — the same idempotent-
header-at-a-fixed-position pattern every self-healing column in this
codebase already uses — so order between the two scripts' migrations no
longer matters.

New regression test (`lesson-frame-generator.test.js`): builds a fixture
row with `warm_up_generated` already set to `"DELIVERED"` at its real
column, runs `generateLessonFrame_()`, and asserts that value survives
untouched. Verified non-vacuous — reverted the constant change back to 14
and confirmed this test (and 6 others depending on the corrected column
positions) failed, then restored it.

## Third-party review verification — 10 stale claims, 6 real fixes

A detailed third-party review claimed 16 defects across P0/P1/P2 severity.
Every claim was forensically re-verified against the live tree before
acting on any of it — this session has already been burned once by a
confidently-stated but wrong claim (see the Script 27 identity correction
above `27_LessonFrameGenerator`'s own section). Verdict: **10 of 16 claims
were false or already fixed**, consistent with the review having run
against a pre-renumbering snapshot (this module's own scripts 29/30/31 are
now 31/32/33): two claimed parse errors don't reproduce under
`node --check`; a claimed duplicate-`const` bug was already fixed and is
documented as such in this file; the `callFlow4_()` "always returns null"
finding is real as a code fact but describes a deliberately-retained dead
stub — the actual live scoring path is `studio-steps/FinalizeWarmUpScoreStep.gs`,
built and tested independently; "trigger handlers with trailing underscores
won't fire" mischaracterizes how Apps Script trigger installation actually
works (the real, narrower issue — manual Script-Editor entry points hidden
from the Run dropdown — was already understood and documented elsewhere in
this codebase); a pacing-guide filename mismatch, an `M2_ENABLED`
fail-open/fail-closed inconsistency, a triplicated `formatDateYMD_`, and a
"no `LockService` anywhere" claim were all already fixed, several
documented as fixed in this same file.

**6 claims were genuinely real, current bugs, fixed here:**

1. **Extra credit was structurally unreachable.** `runWarmUpEvaluation()`'s
   row selector only ever examines a `WarmUpRegistry` row once — the one
   night `lesson_date === yesterday` — and by the time the async Studio Flow
   finishes writing feedback into the doc (later that same night or the
   next), the row has aged out of the selector forever. `extra_credit`
   could never become 1. Added a second sweep,
   `_recheckExtraCredit_()`, over already-finalized rows within a bounded
   window, with a new self-healing `extra_credit_checked` termination
   column.
2. **4-hex-character IDs could collide.** `generateQueueId_()` and
   `generateLessonId_()` both used `Math.random() * 0xffff` (65,536
   values/day) with no uniqueness check, and `25_WarmUpWriter.js` uses the
   generated ID as a lookup-map key — a collision would silently
   misattribute one student's scores to another. Switched both to the
   `Utilities.getUuid()`-derived pattern `15c_Flow2DirectEvaluationService.js`'s
   `_generateEvidenceId_()` already established.
3. **`esc()` didn't escape quotes; `docUrl` wasn't escaped at all.**
   `00_SharedConfig.js`'s shared `esc()` only handled `&`/`<`/`>`, used in
   HTML-attribute and inline-JS contexts across `07_TeacherDashboard.js`
   and `13_StudentDashboard.js`, with `docUrl` interpolated into `href=`
   with no escaping or scheme check anywhere. Extended `esc()` and added a
   shared `safeDocUrl()` allowlist validator.
4. **Script 33's headline feature was dead; its trigger wasn't installed.**
   `getStudentCompetenciesFromArtifacts_()`'s own header claimed it was
   "called by Script 23's `getStudentProfileSnapshot_()`" — it wasn't; the
   real mechanism was an undocumented cron-ordering accident, with no
   health check if it ever broke, and `syncArtifactCompetencies` was never
   in Script 28's installed-trigger list. Fixed the comment, added a
   cron-health stamp/check, added the missing trigger install.
5. **`WarmUpQueue` had no retention.** The one major operational tab with
   zero archival, unlike `Ledger`/`SCRDecisionLog`/`CompetencyEvidence`/
   `ParentReportLog`. Extended `34_QueueWatchdog.js` (already the
   acknowledged owner — its own header calls this out) with the same
   `*_RETENTION_YEARS`/self-healing-column/never-delete pattern as the
   other four.
6. **`CAS_M2_Schema.html` column counts had drifted.** Badges said 13/5/8;
   real counts are 18/7/9 (the review said 14/5/8 — even that undercounted
   `LessonContext`, missing the collision above). Corrected, and added the
   missing `term` and `warm_up_generated` rows.

See each fix's own commit/code comments for full detail. `npm test`
422 passing (up 29), gas-lint 0 errors / 4 warnings, doc-currency 0
errors.

## First real deployment — 8 projects live, three confirmed Studio walls, Flow 2 redesigned

The session `DEPLOYMENT_HANDOFF.md` was written for. It took this codebase
from "code complete, never pushed anywhere" to eight real Apps Script
projects running in a live `ccpsnet.net` Google Workspace account, with
Module 1 and Module 2 (Phase A + B) genuinely set up and Flow 1 verified
against real teacher data.

**It did not get a working Flow 2 Studio run, and that outcome is the most
valuable thing in this section.** Three walls were confirmed by direct
test — not inferred, not assumed — and two of them are permanent for this
account. The response was an architectural change (`37_FlowInputBuilder.js`)
that dissolves all three rather than continuing to fight them. Anyone
picking this up should read the walls before touching Studio again.

### What actually went live

All eight projects created via `clasp create` and pushed. The two web apps
(`teacher-dashboard`, `student-dashboard`) additionally versioned and
deployed, since `clasp push` alone never moves an `/exec` URL. Module 1's
admin + teacher setup wizard run to completion; Module 2 Phase A and Phase B
both completed, including a real block schedule for eight periods across two
courses meeting simultaneously. Flow 1 (Rubric Extraction) built natively in
Studio and verified end to end against a real rubric submitted through the
live upload form — real ConfigIDs generated, every extracted field correct,
`RubricQueue` row reaching `COMPLETE`.

That Flow 1 run doubled as proof `05_TeacherIntakePipeline.js` works: the
first several attempts failed on its own validation chain (a Doc URL that
wasn't a Doc URL, an unshared template, a Sheet where a Doc was required),
each rejected with the correct, specific error. The validation nobody had
ever exercised against a real submission turned out to be right.

### All three predicted from-scratch gotchas hit, plus a fourth

`DEPLOYMENT_HANDOFF.md` listed three documented-but-never-hit gotchas. All
three fired exactly as written: `unified-manual` refused to push until
`central-ledger` had a cut version, a from-scratch `central-ledger`
spreadsheet had none of the five Module-1 tabs, and both dashboards needed
`ADMIN_SS_ID` set rather than just `CENTRAL_LEDGER_SS_ID`. The handoff
earned its keep.

A fourth wasn't predicted: **the from-scratch path also skips the Central
Turn-In Form.** The admin wizard normally creates it; a
`clasp create`-then-`clasp push` deployment never runs that path. Created by
hand via a throwaway function, same remedy as the missing-tabs gotcha.

### Two real manifest bugs, findable only by pushing

Both had been in the tree since `studio-steps` landed. Neither was
detectable by `npm test`, `gas-lint`, or reading the file — only by a real
`clasp push` rejecting it.

1. **`bcc772c` — `"state": "PUBLISHED"` is not a valid `workflowElements`
   value.** All 8 entries carried it. The real enum is `"ACTIVE"`. The push
   failed outright until every one was corrected.
2. **`83f6f76` — `addOns.common.logoUrl` was still the literal
   placeholder `"REPLACE_WITH_A_HOSTED_LOGO_URL"`.** Google's own docs name
   this as a cause of an add-on's steps never appearing in the Studio
   picker. Replaced with a real hosted icon URL.

Also fixed live: `ca43738` (a block-schedule `Ui.prompt()` losing newlines,
so multi-line `PERIOD:DAYTYPE:COURSE` entries arrived space-joined — now
accepts `;` as a delimiter too) and `a53e155` (teacher setup crashing when
`CompetencyRegistry`/`PacingGuide` were empty, which on a fresh deployment
they always are).

### Wall 1 — GCP access is disabled for this district account

Confirmed directly at `console.cloud.google.com`: *"you do not have access
to Google Cloud Platform… your account is managed by an organization that
has this service turned off."* A Workspace Studio custom-step add-on
requires a standard (non-default) GCP project linked through Project
Settings. This account cannot have one.

Consequences, both wider than they first look:

- **All 8 custom steps in `cas-ccps/studio-steps/` (2,113 lines) are
  unreachable on this account.** Not broken — unreachable. They were pushed
  successfully and never appeared in Studio's step picker, across multiple
  uninstall/reinstall cycles, with no OAuth prompt ever shown.
- **`15c_Flow2DirectEvaluationService.js`'s `DIRECT_GEMINI` escape hatch is
  blocked by the same wall.** It needs a `DIRECT_GEMINI_API_KEY`, and an API
  key needs a project. The hatch built specifically for "make Flow 2
  runnable without Studio" cannot run either.

This is a district IT / Workspace admin action, not something this repo or
this account can resolve. Worth filing regardless — it would resurrect all
2,113 lines at once — but nothing should be sequenced behind it.

### Wall 2 — native Studio cannot express this data model

With custom steps unavailable, only native steps remain. They can't do it,
for reasons confirmed by direct test in the live editor:

- **"Get sheet contents" targets a spreadsheet through a FIXED PICKER only.**
  No variable binding, confirmed by trying: *"no variables option appears,
  still shows a fixed picker."* Flow 2's TeacherMatrix hop is inherently
  per-teacher — a different spreadsheet per teacher — which native Studio
  structurally cannot address. This is the wall that matters, because
  multi-teacher is the product.
- **The two capabilities Flow 2 needs are split across two steps that
  won't compose.** "Extract" is schema-driven and can read a Doc from a URL
  but has no row-filtering; "Get sheet contents" has real keyed Find
  conditions but can't read a Doc or return a schema. Neither does both.
- **"Ask Gemini" emits Text or List only** — no arbitrary JSON schema.

### Wall 3 — Studio has no engineering affordances

The most expensive wall in practice, and the least obvious going in. This
repo has 453 tests, a lint pass, clasp manifests, a FERPA data map,
retention policies, a queue watchdog, a preflight check and a canary. The
Studio flow configs are the **only** layer with no version control, no
diff, no test, no rollback and no code review — and that layer is where the
entire session went. Specific failure modes met:

- **"Run Completed" renders green when a lookup step matched zero rows.**
  No fail-fast; wrong-but-empty data propagates silently downstream. This is
  the same class of invisible failure `34_QueueWatchdog.js`'s own header
  describes from a prior incident.
- **Literal text that looks like a bound chip.** A `Ledger` row was found
  containing the strings `@trigger.ConfigID` and `@trigger.StudentFileID`
  as cell *values*. A Find condition holding that same unresolved text
  then "matched" that row — two wrongs matching each other, reported as
  success. Chips must be inserted through the variable picker; typing the
  name does nothing and looks identical.
- **Text + chip concatenation in a field is unreliable.** URL construction
  had to be pushed back into the sheet as a formula column rather than
  built inside a Studio field.
- **Formula-derived columns can be empty in the trigger's row snapshot.**
  An `ARRAYFORMULA` column populated a moment after the row edit that fired
  the trigger, so the flow read a blank — Step 3 reported "source content
  was empty" while the sheet visibly showed a correct value.
- **Every debug cycle is a screenshot round-trip through a human.** That,
  not any single bug, is what consumed the session.

### The `=AI()` investigation — closed, not viable

Google Sheets' `=AI()` / `=Gemini()` function (Education Plus / Teaching &
Learning, 18+, since 2026-02-24) was investigated as a way to get inference
without GCP. It is genuinely available on this account and genuinely cannot
serve this pipeline:

- **It cannot read other files.** Context must be in the current
  spreadsheet, passed via the range argument. Flow 2's whole job starts with
  reading a student's Doc. Disqualifying on its own.
- **It is not an automation primitive.** Output is a static value that does
  not recalculate when inputs change; a human clicks "Generate and Insert"
  or "Refresh and Insert," and the edit is attributed to that person in
  version history. Apps Script cannot trigger or refresh it — there is an
  open Google issue tracker request (429140217) for exactly that.
- ~200 cells per formula, ~200–350 per batch, short- and long-term
  generation caps, and no useful `ARRAYFORMULA` expansion.
- Making it work would require copying student response text into the
  central Ledger spreadsheet — a direct regression against
  `docs/FERPA_DATA_MAP.md`'s pointer-based design, for no functional gain.

Where it *is* useful is teacher-facing and human-in-the-loop: drafting
rubric milestones before a config goes live (static output is a feature
there — a rubric that silently rewrites itself would be a bug), ad-hoc
analysis over already-extracted evidence, one-time backfills, report
narrative drafts a teacher reviews. Not the pipeline.

### The response: `37_FlowInputBuilder.js` (`03bcbe9`)

Flow 2 was ~8 steps, of which 6 were data plumbing and 2 were inference.
Every wall above hit the plumbing. Studio's one irreplaceable capability is
keyless Gemini; everything else it does badly and Apps Script does well.

So the plumbing moved into code. `buildFlowInputRows()` resolves the full
`Ledger → MatrixRegistry → TeacherMatrix` chain — the same 3-hop lookup
`studio-steps/ReadInstructorConfigStep.gs` already implements and tests,
reimplemented because GAS has no cross-project calls — and materializes one
flat, literal row on a single fixed spreadsheet. `harvestFlowInputResults()`
then applies Studio's result: splits it, writes the feedback into the
student's doc, writes `CompetencyEvidence`, and flips the originating
`STAGING_PIPELINE` row to `COMPLETE` so the already-deployed
`backPropagateCompletions()` closes the rest of the loop. It reuses
`_parseFlow2Response_()` and `writeCompetencyEvidenceFromFlow2_()` from
`15c` directly rather than duplicating them.

Studio Flow 2 shrinks to four steps, all fixed-picker-safe: trigger on a
`FlowInput` row at `READY`, Extract the response text from
`@trigger.StudentDocURL`, Ask Gemini from literal columns, write the raw
output back and set `EVALUATED`. No lookups, no chip concatenation, no
dynamic spreadsheet target, no formula-timing race — Walls 2 and 3
dissolve, and Wall 1 stops mattering because only the keyless Gemini call
still lives in Studio.

The doc read deliberately stays in Studio. Having Apps Script read the doc
and pass text through a sheet cell would cut Studio to three steps and put
raw student writing at rest in the central Ledger — the same FERPA
regression `=AI()` would have required. Four steps is the floor.

### Three real bugs the redesign surfaced

1. **A `Ledger` column insertion had silently shifted 14 fields.** A helper
   `FileURL` column at index 4 moved `TeacherEmail` from 8 to 9, so every
   reader using `LEDGER.TEACHER_EMAIL` — the dashboards, `03_QueueBridge.js`,
   the aggregator, the SCR engine — was reading a person's *name*. The new
   builder's MatrixRegistry hop then searched for a teacher whose email
   equalled that name, matched nothing, and skipped every row forever behind
   one log line. Exactly the failure `00_SharedConfig.js`'s own `LEDGER`
   comment warns about. The inserted column was also redundant: index 16,
   `AdminFileURL`, already holds the doc URL.
   `38_LedgerSchemaGuard.js` (`0e4bd42`) now detects and repairs this — and
   deliberately refuses when it can't verify the repair is safe, because two
   cases are indistinguishable from the header row alone (a column inserted
   *before* any `registerLedger_` write, versus rows appended positionally
   *after* it, where the column holds real data).
2. **`writeCompetencyEvidenceFromFlow2_()` doesn't self-create its tab.** It
   logs and returns zero if `CompetencyEvidence` is missing — correct for
   `15c`'s dev-only bridge, wrong once it's the sole real writer.
   `harvestFlowInputResults()` self-heals the tab before calling it.
3. **Two canary bugs, both caught by tests rather than by a live run.**
   `_fiFindMatrixSsId_()` returns the *first* MatrixRegistry match for a
   teacher email, so two canary runs collided on a shared fake address; and
   a bare millisecond timestamp let two same-millisecond runs share a
   ConfigID. Fixed with per-run plus-addressing and a random token.

### Flow 2's canary became possible (`d7c36a4`)

`35_FlowPreflightAndCanary.js`'s header used to explain why Flow 2 couldn't
have one: it "read[s] and write[s] real student submission docs," needing a
test-student fixture only the operator could provide. Moving the lookup
chain into code removed that — `runFlow2Canary()` provisions its own scratch
doc and scratch TeacherMatrix and trashes both afterwards.

It is a **different kind of canary** than `runFlow1Canary()`, and the header
says so at length. Flow 1's waits on the live Studio flow and therefore
proves Studio works. Flow 2's deliberately stubs Studio out — a PASS means
every line of code cas-ccps owns in Flow 2 is correct and says nothing about
whether the Studio flow is built or wired right. That split is the point:
with the code half proven separately, a full-chain failure is unambiguously
Studio's.

Safety worth preserving: the synthetic staging row's `QueueRowRef` is the
literal string `'CANARY'`. Both branches of `backPropagateCompletions()`
gate on `parseInt(queueRowRef)`, including the `!isNaN` guard around
`notifyTimeoutToTeacher_`, so a non-numeric ref makes that function skip the
row on every path. Do not "tidy" it into a number.

### kos-personal is NOT subject to Wall 1 — don't import this lesson

A plan was reviewed late in the session proposing to rebuild kos-personal's
ingestion/classification pipeline around the same "keep Studio away from
everything" posture this session arrived at for cas-ccps.

**That plan was right, and this section spent two rounds arguing otherwise.**
The conclusion is recorded here with both wrong readings intact, because the
reasoning is more reusable than the answer and both errors are the kind that
look like diligence at the time.

**Round 1 — "GCP is available there."** This section cited
`kos-personal/DEPLOYMENT_GUIDE.md:36` ("every future deploy uses the same GCP
project") plus line 255's Drive-API walkthrough as evidence. Neither is
evidence. That line closes a Phase 1 whose step 2 is *"select your existing
Apps Script project"* and whose only work is the OAuth consent screen; both
that and enabling an API happen quite happily in the default project Apps
Script creates on its own. Every GCP project across this repo was built that
same way, and nothing here records a standard project ever being created or
linked through Project Settings for any of the 11 Apps Script projects. So
Wall 1 is really the *second* block on cas-ccps's custom steps — there was no
standard project to lose in the first place.

**Round 2 — "different account, so the org policy can't reach it."** What
survived the first correction was the account argument: SMP-004 bifurcates
kos-personal onto a personal Google account, off `ccpsnet.net`, so the
district's org-wide GCP block wouldn't apply and the steps were merely
*un-provisioned* rather than blocked. The operator has since confirmed
otherwise: **kos-personal is deployed on the same `ccpsnet.net` account, and
its Studio flow is not live.** A documented account separation turned out to
be a policy someone intended, not a fact about a deployment — which is the
Round 1 mistake one level up, reading an intention as a state of the world.
Nothing in this repo can observe which account a script runs on, so that is
the class of claim to confirm with the operator rather than derive.

So the posture *does* transfer, and `kos-personal/studio-steps/` is blocked
by the same wall for the same reason. It needs the Apps Script port, not
finishing. Two things make it a smaller job than cas-ccps's was, and one
makes it different:

- **The fixed-picker wall doesn't apply.** What forced cas-ccps's Flow 2
  redesign was that a native "Get sheet contents" step targets a spreadsheet
  through a fixed picker and never a variable, which is fatal when the target
  is a per-teacher TeacherMatrix. `STAGING_PIPELINE` is one spreadsheet, so a
  native Sheets connector can reach it.
- **Only the doc write genuinely needs Apps Script.** The trigger, the
  document read, and the Gemini calls are all native and unaffected. The two
  custom steps merge Curator + Auditor JSON, overwrite the source doc's body,
  and flip a row to `FLOW_COMPLETE`; a native insert-text step is not
  documented as able to clear a doc's existing content first, which is the
  one capability that has to come back into script.
- **The port must not widen `STAGING_PIPELINE`.** `10_Turnstile.gs:41`
  records why: an 8th column would mean touching hardcoded 7-column
  `getRange()` calls across `2/3/9_*.gs`, which is exactly why release
  timestamps already live in `PropertiesService` instead of a column. A
  separate return tab is the shape that fits, not extra columns.

The gap `STUDIO_INTEGRATION_SPEC.md` names itself at line 455 still stands
either way: `_chunkAndQueue()` doesn't queue a paired `VECTOR_CLASSIFY` row
alongside each `SESSION_LOG` row, so the two flows can't correlate to one
session.

The reviewed plan also diverged from the real constants and structures:
`MAX_CHUNK_SIZE` is 25,000 not 8,000; `DECAY_FACTOR` is 0.92 not 0.85; and
it merged three deliberately separate mechanisms — informational
`VECTOR_MATRIX` scoring, the two-stage `INCUBATOR` promotion
(`INCUBATOR_PROMOTION_THRESHOLD` 3.0, `INCUBATOR_HALF_LIFE_DAYS` 14), and
the human-gated `Blackboard` mutation queue (`Deploy_Trigger = TRUE` →
`applyMutation()`) — into one score-crosses-threshold path.

### Where things actually stand

**Verified live:** all 8 projects pushed; both web apps deployed; Module 1
complete; Module 2 Phase A + B complete; Flow 1 working end to end against
real data; `05_TeacherIntakePipeline.js`'s validation chain proven.

**Written and tested, not yet run against the live account:**
`37_FlowInputBuilder.js`, `38_LedgerSchemaGuard.js`, `runFlow2Canary()`.
These need a `clasp push` and three Run-dropdown invocations
(`checkLedgerSchema()`, `installFlowInputTriggers()`, `runFlow2Canary()`).

**Not built:** Flow 2's four-step Studio flow. Flows 3, 4, 5 — untouched,
and they hit the same fixed-picker wall since Warm-Ups are per-teacher too,
so the FlowInput pattern should port to them.

**Permanently blocked on this account:** the 8 custom steps, and `15c`'s
`DIRECT_GEMINI` hatch.

### Still open

- The live `Ledger` column drift is unrepaired until `checkLedgerSchema()` /
  `repairLedgerSchema()` are actually run. Flow 2 cannot work before that —
  the MatrixRegistry hop resolves a name as an email and silently skips.
- `FlowInput` has no retention pass and no `34_QueueWatchdog.js` staleness
  coverage. Deliberate: it's new and low-volume. Add when usage justifies
  it, same as every other tab got retention after the fact.
- Whether the district will enable GCP. Not sequenced behind.
- `IMPACT_DASHBOARD.html`'s Flow status badges still read `Flows 2-5 ⬜
  Built, Not Deployed`, which is now only half right — Flow 2's code half is
  built and tested, its Studio half isn't, and Flows 3-5's custom-step code
  is built but unreachable. Worth a more honest three-state badge.

---

## 2026-09-03 — Flows 3, 4 and 5 ported off their custom steps

Flow 2 was redesigned around the GCP wall in the first deployment session.
Flows 3, 4 and 5 were left as the remaining exposure, and
`tools/gas-lint/gcp-map.json` named them as such. `41_WarmUpFlowBridge.js`
closes that: same two-phase shape as `37_FlowInputBuilder.js` — Apps Script
materializes a flat literal input row, Studio makes only the keyless Gemini
call, Apps Script harvests the output.

**The job was smaller than the five-step count suggested**, because three of
the five steps were duplicating Apps Script that already existed in this same
project, and each said so in its own header:

- `ExtractWarmUpPromptTextStep` re-implemented what `evaluateWarmUpDoc_()`
  (`25_WarmUpWriter.js`) already does — read the doc, pull the exact text
  between the Zone 1 delimiters.
- `FinalizeWarmUpScoreStep`'s three write-backs each state they "mirror
  `writeFinalScores_()` / `writeFeedbackToDoc_()` / `writeRegistryScores_()`
  exactly". Those live in Script 25, in this project, so the harvest calls
  them. A second copy is what drift is made of.
- `ExtractBridgeInputsStep` is three field reads off one parsed JSON blob.

That left `SelectWarmUpArchetypeStep`'s decision logic and
`CreateWarmUpDocStep`'s document construction as the only substantial ports.
Both are reproduced with their interpretive choices intact, because each one
changes what a student receives:

- The archetype **evaluation order** is PROVOCATION → PARADOX → CONCRETE
  SCENARIO → BRIDGE, which is *not* the order the spec's decision table lists
  them in. The spec states the evaluation order separately, in prose, and that
  is the one that governs. Preserved rather than tidied.
- "No persistent gaps" means no single gap tag recurs across 2+ of the
  evaluation_signals entries.
- The zone marker strings are load-bearing, not formatting.
  `evaluateWarmUpDoc_()` finds the prompt and the response by `indexOf` on
  them, so a changed string silently makes Flow 4 read an empty response. The
  port stamps `RESPONSE_ZONE_MARKER` — the same constant, not an equal
  string — and a test asserts that.

**Two corrections to what this repo believed.**

*The fixed-picker wall never applied to these three.* `DEPLOYMENT_HANDOFF.md`
said Flows 3, 4 and 5 "hit the same fixed-picker wall (Warm-Ups are
per-teacher too)." They don't: `WarmUpQueue` lives in the Central Ledger, one
spreadsheet a fixed picker targets perfectly well. The per-teacher problem was
specific to Flow 2's `TeacherMatrix`. What actually blocked these three was
the five custom steps, plus the Drive/Docs work no native step can do. The
wrong diagnosis made the job look bigger than it was.

*`pollForFlow4Result_()` is dead and must stay dead.* It blocks on
`Utilities.sleep(15000)` twelve times — three minutes of wall clock **per
row**, inside a trigger — so ten students would need thirty minutes of
sleeping and blow every Apps Script execution limit. Flow 4 could never have
scaled past a handful of rows even with its custom step working. Nothing ever
called it (`35_FlowPreflightAndCanary.js` had already noted it as unused), so
nothing had to be unwired; it now carries a note saying why not to wire it up.
A harvest on its own trigger needs no polling at all.

Also fixed while in there: `runWarmUpEvaluation()` calls `callFlow4_()`, a
stub that always returns null, and its null branch counted that as an error —
so every nightly run logged a failure for every row even though
`writePreEvalScores_` had correctly parked each one at `PENDING_EVAL`, which
is exactly the state the new bridge collects. That branch now says so instead
of crying wolf. A genuine `flow4Result.error` still counts as an error.

**Nothing else needed to change.** The `WarmUpQueue` status machine is
untouched — `PENDING_BRIDGE` → `PENDING` → `DELIVERED` → `PENDING_EVAL` →
`SCORED` still means what it meant; the bridge only moves *who* performs each
transition, keyed off the statuses that already existed. So Scripts 23, 24 and
25 needed no edits, and no new column was added to a 21-column sheet whose
indices those three hardcode (the same trade kos-personal's `10_Turnstile.gs`
refused, for the same reason). Three input tabs plus one shared return tab
carry everything instead.

`tests/cas-ccps/warmup-flow-bridge.test.js` — 27 tests, weighted toward the
decision table (the override threshold as a floor not a ceiling, the
evaluation order, the persistence reading, the fallback tail) and the schema
invariants that keep a native "add row to sheet" step writing into the right
cells.

### Follow-up — the warm-up fixtures now actually reach the bridge

Seeding a `WarmUpQueue` row at the right status turned out not to be enough
for Flows 3, 4 and 5 to have something to latch onto. The bridge also has to
be able to *materialize* an input row from that seed, and each flow needs
something different present before it can. Three gaps, one of them silent:

- **Flow 4 had nothing at all.** `wfbBuildFlow4Row_` refuses a row with no
  `Doc_ID`, because it pulls the *original* prompt out of the document via
  `evaluateWarmUpDoc_()` rather than reconstructing an approximation from the
  lesson snapshot. The status-only fixture therefore logged "no Doc_ID —
  skipped" and wrote nothing, while looking installed. The fixture now creates
  a real scratch document carrying the same zone structure a Flow 3 run
  produces, plus a written response — and takes its marker strings from the
  reader (`RESPONSE_ZONE_MARKER` by reference, not retyped) so it stays honest
  if that constant changes.
- **`evaluation_signals` was the wrong shape**: an array of plain strings,
  where the archetype decision reads `signals[i].indicators.strengths/.gaps`
  and formats `.date`/`.note`. Nothing errored — it produced
  `"- : (strengths: None; gaps: None)"` in the prompt and fell through to a
  gaps-based BRIDGE, so the fixture exercised none of the decision table. Now
  the object shape, with values chosen to land on CONCRETE_SCENARIO through a
  real branch (application strong, analysis a gap, engagement 2).
- **No `Word_Count_Score`.** The harvest reads that cell rather than
  recomputing it, so a plausible response would have scored as if blank —
  which reads as a scoring bug rather than a fixture gap.

`removeFlowFixtures()` now also clears the four bridge tabs. Left behind,
those input rows point at queue rows that no longer exist and every later
harvest pass reports them as failures forever.

One accommodation in the bridge itself, made deliberately: `wfbApplyFlow3_`
skips `addEditor` for an address ending in `.invalid`. That is the reserved
TLD, so it can never be a real student, and `addEditor` throws on an address
that cannot exist — which would park a working fixture in `NEEDS_ATTENTION`
and make it look like a bug. Everything worth proving (the folder chain, the
document, the zones) has already happened by that point; sharing to a
nonexistent account is not a capability under test.

`checkFlowFixtures()` now says outright that a parked fixture is only half the
story — nothing reaches a Flow until an input row is materialized, and nothing
proves a Flow ran until something appears in the return tab.

### Follow-up — the Flow 2 fixture's document was missing a delimiter

The row itself was sound: every `FI` column populated, the prompt
pre-substituted through the real `_fiBuildPromptText_`, `StagingRowRef` the
literal `FIXTURE` so the harvest can never complete an unrelated real row. The
gap was in the *document* it points at.

Flow 2's Extract step reads the student response as the text **between**
`── YOUR RESPONSE BEGINS HERE ──` and `[CONFIG_ID:` —
`15b_StudioFlowPrompts_Flow2_Revised.js`'s own Step 1 note says so. The
fixture doc carried the first marker and not the second, so that step had no
end delimiter, and the failure would read as "the doc was empty" rather than
as a missing footer. Both zones are now reproduced from
`02_Form1_IntakeAndWorkspaceGenerator.js`'s ZONE 3 and ZONE 4, footer
included, and a test asserts the footer follows the response marker and that
the ConfigID inside it satisfies the `/\[CONFIG_ID:\s*([A-Z0-9\-]+)\]/`
pattern Script 01's fallback parses with.

**Two findings that came out of writing the checks rather than the fix.**

`15b`'s Step 1 note renders both markers in that comment block's
em-dash-normalized style — `"-- YOUR RESPONSE BEGINS HERE --"`. It is not
claiming the markers use hyphens; the whole block writes `--` for `—`. But an
operator building the Extract step reads that note and types what it shows,
and Studio matches literally, so the step would return empty. The note now
says outright to copy the strings from `RESPONSE_MARKER` /
`CONFIG_ID_MARKER` in `01_StudentDoc_ContainerScript.js` rather than from the
comment.

`PROMPT_TEXT` was arriving **empty in the test sandbox**, and the tests had
been green anyway because they never asserted on it. `_fiBuildPromptText_`
returns `""` rather than throwing when `FLOW_2_SYSTEM_PROMPT` (15b) or
`substituteFlowPrompt_` (40) is out of scope, and this test file was loading
neither — so the fixture was being exercised in a scope narrower than
production. Fixed on both sides: the test now loads the real
`cas-ccps:central-ledger` file set, and `installFlow2Fixture()` warns loudly
when the prompt comes back empty, since an operator wiring
`@trigger.PromptText` against a blank cell would read that as a Studio
problem.

Pattern across all four fixture checks this session, worth stating once: every
gap was a *shape* mismatch that produced no error anywhere — invented payload
keys in leader-hub, string-vs-object signals in the warm-up profile, a missing
`Doc_ID` for Flow 4, one payload type instead of two in kos-personal, and a
missing document delimiter here. None would have appeared in a Flow's run log.
The only thing that found any of them was reading the consumer instead of
trusting the fixture.

### Follow-up — Flow 1's fixture was clean; a constant next to it was not

Flow 1's fixture came out of the shape check intact, which is worth recording
as plainly as the failures. Its RubricQueue row matches
`16_UnifiedManualSetup.js`'s header order and `05_TeacherIntakePipeline.js`'s
`queueRow` array field for field; `PENDING_EXTRACTION` is the status both the
real writer and `10_AdminRecoveryPanel.js`'s stuck-row watchdog use; the
prompt-template doc Flow 1's Step 1 reads is real and substantive; the rubric
text carries all four milestones and a completion condition, so Flow 1 has
something to extract rather than testing the prompt's tolerance for vagueness.

The scratch TeacherMatrix was the part most worth checking, because it is
indexed **by position** by two separate readers with two separate constants —
`TM08` in `08_TeacherConfirmationStep.js` (which that step's own header calls
the authoritative source) and `FI_TM_COLUMNS_` in `37_FlowInputBuilder.js`.
Its 20 headers match both exactly. Rather than compare header lists, the test
hands `_fiFindTeacherMatrixRow_` the real fixture and asserts every field
comes back populated: a one-column shift would return blanks while the headers
still looked plausible.

One incidental find, and it matters that it was already known.
`05_TeacherIntakePipeline.js`'s `RQ05` constant ended at `STATUS: 8` with no
`TeacherMatrixSsId` entry, one column short of the 10-field row it describes.
Anything reading `row[RQ05.STATUS]` would have compared a spreadsheet ID
against `"PENDING_EXTRACTION"` forever without erroring — the same drift class
as the Central Ledger bug. **A previous session had already found it**, grepped
the project to confirm `RQ05` is declared once and read nowhere, and
deliberately derived `34_QueueWatchdog.js`'s own `WD_RUBRIC_QUEUE_COLUMNS` from
the real `appendRow()` call instead. That note is what made this safe to
correct rather than merely safe to leave, so `RQ05` is now fixed and 34's note
updated to say so — while keeping its actual advice, which outlives the fix:
derive from the writer, verify against the constant.

Also worth writing down: `installFlow1Fixture()` does **not** register its
scratch TeacherMatrix in `MatrixRegistry`. That is correct for Flow 1 in
isolation, and it is why the Flow 2 fixture seeds a `FlowInput` row directly
instead of relying on the registry hop. But it does mean the two fixtures do
not chain — Flow 1's output matrix is not discoverable by teacher email, so a
confirmed DRAFT row there would never reach Flow 2. Left alone deliberately:
`_fiFindMatrixSsId_` returns the *first* registry match, and a fixture entry
competing with a real teacher's is how two canary runs collided earlier in
this session.

### Follow-up — closing the configuration-side gap

Everything built this session verified the Apps Script side and left the
Studio side unverifiable, while the ports kept making that side *larger*:
Flows 3/4/5 went from five custom steps to three input tabs plus a return tab
whose columns an operator binds one at a time in a picker. Two additions close
that.

**The preflight now covers what it structurally could and didn't.** It checked
nine tabs and one optional Script Property. It now also checks the four bridge
tabs (as self-healing — absent is a note, present-and-too-narrow is a failure,
because a step bound to a column that doesn't exist writes nowhere and still
reports success), the four flow triggers, and the two required properties.
That last set matters most: every install function checked its own trigger and
nothing surveyed the set, so a deployment where `installWarmUpFlowTriggers()`
was never run looked structurally perfect and materialized nothing. A
*duplicate* trigger is also a failure — two copies run the handler twice per
interval.

`ADMIN_ROOT_FOLDER_ID` was documented in this file's own reference table and
checked nowhere. Flow 3's harvest resolves the student's warm-up folder from
it, so unset means every warm-up doc has nowhere to go — discovered when a doc
fails to appear, not at deploy time.

The preflight tests used to pin the total check count, so adding a check meant
editing four tests. They now assert structurally — every expected label
present, none duplicated, report rows derived from the result — which keeps
the real guarantee ("no check was silently dropped") without making the
brittleness a disincentive to adding checks.

**`checkFlowBinding()` is the new thing.** Before it, "nothing has ever come
back" was one answer covering four causes: the Flow was never built, its
trigger matches no rows, it writes to the wrong columns, or Gemini is erroring.
The third looks exactly like the first and is the easiest to create. The probe
reads where values actually *landed*: it finds which column holds a flow
number, which holds a known Queue_ID, and which holds the longest blob, then
compares against the expected indices and reports the offset. A one-column
shift is reported as a shift with its offset rather than as "Flow is blank".
It also distinguishes an unbound column from a plausible-but-wrong value
(someone binding "Flow 5" instead of `5`), and a Queue_ID that matches nothing
from an empty one — different fixes.

It logs the expected binding too, derived from `WFB_RETURN_HEADERS` rather
than transcribed, so it doubles as the thing to copy from while wiring the
step. `checkFlow2Binding()` does the equivalent for Flow 2, whose Studio step
writes *into* the trigger row rather than appending — a different mis-binding
shape, and the check is explicitly heuristic about it.

One bug in the probe, caught by its own test: with `RawOutput` empty, the
longest-cell heuristic picked **Timestamp**, because a Date stringifies to
about fifty characters. It reported "your output landed in Timestamp" — a
confident wrong answer where "nothing is arriving" is the useful one. The
timestamp column is now excluded, and the exclusion is documented as
load-bearing along with what it trades away.

### Follow-up — the generated build spec, and D1's own diagnostic

Two remaining friction items from the deployment review, both about
configuration rather than code.

**`42_FlowBuildSpec.js` generates the sheet an operator builds a Flow from.**
The values to type into Studio were spread across six files in three formats —
JS comment blocks, a GAS wizard dialog, markdown — about 3,350 lines from
which the operator reconstructs a step list. That scatter has already produced
one confirmed hazard: `15b`'s Step 1 note renders the student-doc markers in
that comment block's em-dash-normalized style, so copying from it puts plain
hyphens into Studio's Extract step, which matches nothing and returns empty.

The split is deliberate and is the whole design. `syncFlowBuildSpec()` emits
the **derived** half — every tab, column number, header, trigger condition,
prompt key and ownership rule, computed from the same constants the code reads.
Those are the drift-prone facts and generating them is the only way to keep
them true. It does **not** re-transcribe connector names, temperature, token
limits or the reasoning behind a step: copying those would create a seventh
document to keep in sync, which is the problem rather than the fix. Each flow
points at where that narrative lives — and, where the pointer has gone stale,
says so. That last part is the one thing a generated sheet can do that the
narrative cannot: `15_StudioFlowPrompts.js`'s Step 3 and the Flow 3/4
specification's connector tables both call for custom steps that are blocked
on this account, and the spec now flags both at the point an operator would
otherwise follow them.

`checkFlowBuildSpec()` compares the tab against what the code would generate
now, on `flow|surface|tab|column|header` only. Diffing the notes too would
flag every wording change as drift and train the reader to ignore the report —
a test pins that a reworded note is *not* stale while a moved column is.

**D1 got a diagnostic rather than a fixture, because it has no queue.**
leader-hub's browser POSTs an OAuth ID token to `07_TeacherDashboard.js`'s
`doPost()` and gets JSON back synchronously; there is nothing to seed. What
there is, is four causes that all surface in leader-hub as the same opaque
error: the OAuth client ID unset, `TEACHER_EMAIL` unset, the token gate fine
but the source tabs empty, or a stale `/exec` URL stored on leader-hub's side.

`runLeaderHubConnectionCheck()` calls the three action handlers directly with
this deployment's own teacher email, deliberately bypassing
`_verifyLeaderHubToken_` — that is the point: if real data comes back, the
data side is sound and the failure is the token, the consent or the URL. The
empty-but-successful case is treated as a **failure**, because leader-hub
cannot tell an empty payload from a rejection, and a naive "did it throw?"
check would call an empty deployment healthy and send someone to debug OAuth.

It refuses to claim what it cannot know. Nothing in the script can see what
URL leader-hub has stored, and a redeploy issues a new one, so there is no
check for it — only a closing note. A test asserts that no check *implies* the
URL was verified, because a green report while leader-hub calls a dead URL
would be the worst possible outcome for a diagnostic.

FERPA: `getRoster` is the first of the three actions to return student name,
email and period, and this runs from a Run dropdown into an execution log. The
roster check reports a **count only**, and a test seeds a roster that would
leak if the detail string ever carried rows instead.

### Follow-up — the doctrine, and the checkable part of it

Enough of this process has now been rediscovered the hard way to be worth
writing down once. `meta/FLOW_DOCTRINE.md` collects the thirteen rules that
this deployment produced, each with the incident that produced it, a pointer
to where the reasoning already lives, and — the part that matters — an
explicit statement of whether anything **enforces** it.

That last column is the point of the document. Eight of the thirteen rules
are enforced by nothing, and the reason is visible in the repo's own history:
a practice that exists only as prose gets rediscovered, while a practice that
exists as a check gets held. Rule 4 (a fixture must match the shape its
consumer reads) was stated in five places as prose and was violated in five of
six fixtures anyway. So the document deliberately does not re-transcribe the
file headers it points at — *a rule restated in two places becomes two rules*
— and instead names what is checked and what is not, so the unenforced ones
are visible as a to-do list rather than as settled practice.

Two of them were then promoted into `gas-lint`.

**Check H — column-map agreement.** `tools/gas-lint/flow-map.json` declares
the groups of files that each map the same sheet; the check parses every
declared map and compares each pair on the keys they **share**. The motivating
case is in this repo: `RQ05` in `05_TeacherIntakePipeline.js` had drifted a
column out of sync with the `queueRow` array it describes, so
`row[RQ05.STATUS]` would have compared a spreadsheet ID against
`"PENDING_EXTRACTION"` forever without erroring. That one was dead code; the
Central Ledger version of the same drift cost a live session. Keys present in
only one map are deliberately not a finding — a reader may legitimately name
fewer columns than the writer, and requiring parity would report a false
conflict on every run, which is how a check gets muted. Groups are declared
rather than inferred from names, because `cas-ccps` and `kos-personal` both
have a `STAGING_PIPELINE` with different column counts.

**Check I — flow surface completeness.** Rule 9 says the four causes of
"nothing happened" each need their own check. The check reads the declared
role for each flow (`materialize`, `harvest`, `canary`, `binding`, `liveness`,
`fixture`) and errors when a named function does not exist — a stale name is
worse than a missing role, because it claims a check exists when it does not.
A missing role is a warning naming the question that can no longer be
answered; a role that genuinely does not apply is declared away in a `_note`,
which the check honours because its own warning text tells the reader to use
it.

It earned itself on its first run: Flow 2 had a preflight, a canary and a
binding probe, and nothing answering "has this flow ever answered?" — so
`checkFlow2Liveness()` in `37_FlowInputBuilder.js` was written to close it.
That is the argument for the whole exercise in one finding. The gap had been
there through several passes of reading these files, and the check found it
immediately.

All three failure paths were verified by temporary injection and revert: a
one-column drift in `WD_RUBRIC_QUEUE_COLUMNS` produces the
`column-map-disagreement` error naming `STATUS is 9 vs 8`; a renamed map
produces the `column-map-not-found` warning rather than silently un-checking
the group; and a flow-map entry naming a function that does not exist
produces `flow-surface-missing-function`.

### Follow-up — the other two rules that turned out to be checkable

Two more of `FLOW_DOCTRINE.md`'s prose-only rules are now `gas-lint` checks.
Both are about the **tests** rather than the GAS source, and both found live
defects on their first run.

**Check J — a fixture must be read back, and read back by its consumer.**
Rule 4 says the read-back is the test, because a Flow's own "Run Completed"
over zero rows looks exactly like success. Rule 5 says a fixture is only as
good as the consumer that reads it. Together they are checkable: for each
`fixture` declared in `flow-map.json`, some test outside `tests/tools/` must
reference it, and that same file must drive one of the flow's own consumers —
`materialize`, `harvest`, `binding` or `liveness`. The canary deliberately
does not count: it stubs the Flow and seeds its own row, so naming it would
satisfy the check without touching the fixture.

The gap it found: Flow 2's fixture was checked column by column, doc delimiter
by doc delimiter, and never handed to `harvestFlowInputResults()`. Five tests
now do that — status reaches `HARVESTED` rather than `ERROR_HARVEST_FAILED`,
competency evidence lands keyed to the fixture's own IDs, feedback reaches the
doc the row points at with the machine-readable line stripped, an empty answer
parks as `ERROR_EMPTY_OUTPUT`, and a real `IN_PROCESS` staging row survives
untouched.

That last one is the case worth keeping. The `StagingRowRef = 'FIXTURE'`
safety property was already asserted literally ("`parseInt` cannot turn it
into a row number"), but `_fiMarkStagingComplete_` has a content-scan fallback
that a literal assertion about the ref cannot rule out. Driving it through the
consumer is what actually proves the fixture cannot complete a student's
submission.

The value of the whole exercise showed up in the negative-path check: pointing
the fixture at a document that does not exist passes **every** column-level
assertion in that file and fails only the three harvest tests.

**Check K — a test sandbox must load the scope its code runs in.** Rule 12.
GAS concatenates every file bound to a project into one global scope, so a
function's collaborators are in scope in production whether or not a test
loaded them, and the failure is silent whenever the code degrades instead of
throwing. `installFlow2Fixture()` seeded an empty `PromptText` for weeks for
exactly this reason.

Requiring the whole project file set would fail nearly every test here, most
of which load two or three files on purpose and correctly. So the check
requires the part the test actually drives to be closed: it walks out from the
names each `loadGasFiles(files, expose)` call exposes and errors on a name
that reachable code needs, declared in a file the sandbox did not load.
Reachability is the entire difference between a check and a nuisance — without
it the same analysis reports nine unexercised collaborators on one fixture
test and gets muted within a week. It matches identifiers rather than call
sites because half of the motivating incident was a missing *constant*.

Five gaps on the first run, all fixed by loading the named file:

- `flow2-canary.test.js` was still missing `40_FlowPrompts.js` — the same
  omission as the original incident, in the next test file over.
- `warmup-flow-bridge.test.js` drove `checkFlow2Binding()` without `FI`.
- `lesson-frame-generator.test.js` and `scr-export-grid.test.js` each reached
  one collaborator they had not loaded.
- `leaderhub-connection-check.test.js` was the bad one: with
  `31_PacingGuideManager.js` out of scope, `_apiGetPacingGuide_` died on a
  `ReferenceError`, so all three data checks failed — and the test asserting
  they fail on empty tabs passed. The right verdict from the wrong program.
  That test now pins the failure *message* as well, so the narrower scope
  cannot come back unnoticed.

While wiring the harvest tests, `03_QueueBridge.js`'s `STG_*` constants turned
out to be a second column map of `STAGING_PIPELINE` alongside
`34_QueueWatchdog.js`'s object map — so that Check H group is no longer a
single-map placeholder. They agree, and the writer (`03`) is now recorded as
authoritative.

Both new checks were negative-path verified by injection and revert: removing
the consumer drive reproduces `fixture-not-driven-through-consumer`, dropping
`40_FlowPrompts.js` from the canary sandbox reproduces `sandbox-scope-gap`
naming the file to add, and allowlisting that same name silences it.

### Follow-up — the check for a doc that describes a path that cannot run

Every check in `doc-currency` verified that a documented thing **exists**.
Nothing verified that a documented path can **run**, and that gap is where
this deployment's most expensive misunderstanding lived: a custom Studio step
is a Workspace Add-on and needs a standard, non-default Cloud project, GCP is
disabled org-wide for `ccpsnet.net`, and every function named in the
instructions for those steps existed. The instructions were still impossible
to follow. Three documents carried them for weeks, and all three were found by
reading, not by tooling.

**Check 5 — `blocked-surface-presented-as-live`.** `gas-lint`'s Check G
already requires every GCP surface to be declared with a status; this reads
those declarations back and holds the prose to them. A declared behavior
document that names a `live-blocked` surface must either acknowledge the
status in the enclosing paragraph or name the fallback. Unacknowledged is an
error; acknowledged everywhere but with the fallback named nowhere in the
document is a warning — the reader learns the path is dead and still not what
to do instead.

Declared on both sides, each for a reason. `gcp-map.json` carries per-surface
`doc_tokens` (`mentions`, `fallback`) because nothing can infer that
`37_FlowInputBuilder` answers `cas-ccps/studio-steps`, and because those
tokens belong beside the status they describe. `config.json` carries
`blockedSurfaceDocs` because the repo-wide version was **measured first**: 12
findings, 8 of them layout inventories ("kos-personal has 2 clasp projects", a
table of step files) that are true whatever the surface's status. That is the
signal ratio at which a check gets muted, and a muted check is worse than an
absent one — so the doc list follows the `keyRegistryDocs` idiom this tool
already uses for the same problem.

Eight errors and three warnings on the first run, across seven documents:

- `cas-ccps/docs/FERPA_DATA_MAP.md` named the blocked custom step as the live
  writer of `CompetencyEvidence` ("the real Studio Flow 2 write step, once
  deployed"). In a FERPA data map, "who writes this tab" being wrong is the
  kind of error the document exists to prevent. The live writer is
  `harvestFlowInputResults()`, calling the same
  `writeCompetencyEvidenceFromFlow2_()` from Apps Script; the schema is
  unchanged. Its trust-surfaces section also described the pre/post-processing
  as living in the blocked steps — it now runs inside this repo's own
  Script-Property and trigger boundary rather than Studio's, which is a
  boundary change worth stating in that document specifically.
- `meta/CODEBASE_REVIEW.md`'s header still said the custom-step code was "not
  yet pushed to a live Studio deployment."
- Two documents said the port "has to" come back into Apps Script, in the
  future tense, after it was done: `meta/FLOW_INVENTORY.md`'s kos-personal
  banner and `kos-personal/studio-steps/README.md`'s own "path forward"
  paragraph. A doc that describes a finished port as pending is the same
  failure as one that describes a blocked path as live.
- Four more were project-layout mentions inside declared behavior docs
  (`README.md`, `cas-ccps/README.md`, `kos-personal/README.md`,
  `meta/CLASP_AND_APPS_SCRIPT.md`), each fixed with one clause. These are the
  cases the doc list makes worth reporting: in a layout table a status word is
  useful, and in `tools/clasp-sync/README.md`'s equivalent table it would be
  noise.

One design bug, caught by its own test suite rather than by the repo: the
banner region was being treated as acknowledgment for every mention in a
document, so any document shorter than `bannerScanLines` was entirely
"banner" and one marker word anywhere in it laundered every mention. The
banner now covers only mentions below it. The test that caught it is a
three-line document where "disabled by default" belongs to a scheduled sweep
and not to the surface named two lines later — the same class of bug this tool
already paid for once with a ±6-line marker window.

Also pinned: a declared `fallback` token must name something that exists in
the source. A fallback pointer to a renamed function is worse than none, since
it reads as an answer and leads nowhere.
