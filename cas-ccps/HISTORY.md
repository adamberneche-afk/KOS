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
