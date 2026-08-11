# CAS — Classroom Agency System

A district-deployed (`ccpsnet.net` / CCPS), FERPA-scoped, student-facing
Google Apps Script platform for a Sports/Entertainment/Event Marketing
course pair (course codes **8175** and **8177**). Built on the same
no-external-API-keys, Gemini-native pattern used elsewhere in this repo's
`kos-personal/` system, but otherwise an unrelated codebase.

The curriculum's pedagogical spine is a simulated student-run
**"conglomerate"** business spanning 10 stages (Foundation → Industry/Producer
→ Product → Market Conditions → Price → Rules of the Chain →
Place/Distribution → Promotion → Strategy/Synthesis → Consumer→Producer),
with named divisions (Creative Studio, Apparel & Merch Co., School Store,
Wholesale & Sourcing, Media & PR, Events Division, Esports Division) and
management roles students rotate through. See `curriculum/lesson-cards/`.

No file anywhere in this system uses the word "FERPA" or "COPPA" despite
handling real student names, emails, and submitted work — the closest thing
to a compliance statement is `docs/SYSTEM_ARCHITECTURE.html`'s Security
Model section (no API keys ever touch a student-facing surface,
prompt-injection denylist, three-point turn-in validation, a forensic
version-history check with an *honestly documented* bypass: a student who
selects-all-and-pastes a pre-written fake report in one fast paste can
defeat it — treated as a manual-review signal, not proof).

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
confirmed elsewhere in this repo (Known Gaps below) as still true — that
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
`curriculum/archived/PacingGuide_CAS_Context_v1_SUPERSEDED.json`. **Known
gap, not fixed here:** `scripts/31_PacingGuideManager.js` (see item 9)
still only reads the original 16-field schema — it will silently ignore
the 4 new v2 fields until its `PG_HEADERS`/`PG_COL_COUNT` and row-mapping
are extended to carry them into the `PacingGuide` tab. `curriculum/PacingGuide_CAS_Context.csv`
and `.docx` are now stale relative to the v2 JSON and were not
regenerated — flagged, not silently left looking current.

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

## Directory map

| Path | Contents |
|---|---|
| `docs/` | Base platform docs (architecture, deployment, Studio flow reference, UX reference, teacher/student/admin guides) + Module 2/3/4/5 documentation + IT/Admin security guide. `docs/archived/` holds superseded docs the source itself marks superseded. |
| `scripts/` | Numbered Apps Script files, base + addenda. `scripts/archived/` holds files the source itself marks superseded. |
| `data/` | Reference data imported into the Central Ledger at setup time. `data/sol-correlations/` holds the VDOE SOL derivation trail. `data/archived/` holds superseded versions. |
| `curriculum/` | Pacing guide (3 formats) + per-stage lesson card decks. `curriculum/archived/` holds the pre-v2 pacing guide JSON. |
| `forms/` | Setup spec for the Warm-Up Response Google Form |

## What Module 1 (the base system) actually is

The base system is **7 separate Apps Script projects** working together
(corrected from an earlier "6" here that put Script 20 on the wrong
project — see `tools/gas-lint/project-map.json`'s header comment, which
flagged this exact mismatch: `20_SetupCheckpoint.js`'s own `INCLUDED IN:`
header says the Unified Manual project, not Central Ledger, and the
file's own header wins):

| Project | Bound to | Scripts |
|---|---|---|
| Central Ledger | Central Ledger spreadsheet | `00` (+ its M2/M4 addenda), `02` (intake), `03` (queue bridge), `04` (turn-in gate), `06` (turnstile), `10` (admin recovery), `18` (form dispatcher), `22`/`22b`/`23`/`24`/`25`/`26` (Module 2 Full), `29`/`30`/`30b` (Module 4/5), `31`/`32`/`33` (Module 2 import/bridge utilities) — see `tools/gas-lint/project-map.json` for the authoritative per-file binding list |
| Unified Manual | Assignment System Manual Doc | `16` (unified admin+teacher setup wizard — `detectRole_()` picks admin vs. teacher automatically), `20` (setup checkpoint), `21` (optional Apps Script API auto-installer — binds all 7 projects and deploys both web apps in ~3 minutes instead of ~20 minutes of manual binding per project, see `REGISTRY_SHEET_SETUP.md`), `28` (Module 2 setup) |
| Master Student Template | Master Student Template Doc | `00`, `01` (container script — student-facing menu), `09` (M1Base), `17` (doc-only setup notes) |
| Rubric Response Sheet (cloned per teacher) | cloned sheet | `00`, `05` (teacher rubric intake), `19` |
| Teacher Matrix Sheet (cloned per teacher) | cloned sheet | `00`, `08`, `19` |
| Teacher Dashboard | standalone web app | `07` (+ `07_TeacherDashboard_M4_ADDENDUM.js`, adding a Student Context tab) |
| Student Dashboard | standalone web app | `13` |

Plus: `15`/`15b` (Studio Flow prompt specs, not deployed scripts).

Each of these 7 projects now has a real, committed `appsscript.json` and
is a clasp-adoption target — see [Version control (clasp)](#version-control-clasp)
below.

**Pipeline in one paragraph:** A student's doc is created from the Master
Student Template (Script 02) with four zones and invisible system-ID
stamps. The student clicks "Run Assignment Check" (Script 01's menu),
which appends a row to `ReviewQueue`. Script 03's `bridgeQueue` (1-min
trigger) moves `PENDING` rows to `STAGING_PIPELINE`, deduplicating against
in-flight evaluations. Script 06's turnstile (1-min trigger) releases one
`PENDING_INFERENCE` row **per teacher lane** to `IN_PROCESS` — a
per-teacher-lane design, not the single global lane used elsewhere in this
codebase — and auto-clears rows stuck `IN_PROCESS` for &gt;12 minutes.
Studio's Flow 2 reads the doc, evaluates it against the teacher's
milestones (set up via Script 05 → Flow 1 → Script 08's confirmation step),
and writes the full formatted report directly into the doc (Script 09
M1Base — see resolution 1 above), then flips the staging row to
`COMPLETE`. Script 03's `backPropagateCompletions` (2-min trigger) closes
out the queue/ledger rows and appends the "what to do next" block. When
the student turns in via the Turn-In Form, Script 04 runs a 3-point ledger
match plus a forensic Drive-revision check before marking the row
`COMPLIANT`.

## Version control (clasp)

Scaffolded, not yet connected to a live account — see
[`meta/CLASP_AND_APPS_SCRIPT.md`](../meta/CLASP_AND_APPS_SCRIPT.md) for
the full rationale. The short version: `cas-ccps/scripts/` doesn't fit
clasp's one-folder-one-project model, since it's the 7 projects above
sharing overlapping files (`00_SharedConfig.js` alone is pasted into 5 of
them). [`tools/clasp-sync/`](../tools/clasp-sync/README.md) reconciles
that — a script reads `tools/gas-lint/project-map.json` and generates a
throwaway per-project push folder for each of the 7 under
`cas-ccps/.clasp-build/` (gitignored, regenerated on demand), so
`cas-ccps/scripts/` itself never has to be reorganized or duplicated in
git. `cas-ccps/clasp/manifests/` holds each project's real
`appsscript.json` (new — none of these 7 had a committed manifest
before), and `cas-ccps/clasp/templates/` holds `.clasp.json` placeholders
to fill in with a real `scriptId` once you've run `clasp login` +
`clasp clone`/`create` against the live projects. For
`rubric-response-sheet`/`teacher-matrix-sheet` (cloned per teacher),
target the *master template* — there's no single live script ID once
teachers have their own copies.

## Module status

| Module | Purpose | Status |
|---|---|---|
| **M1** — base intake/grading | See above | ~20 files in hand. Both confirmed bugs (Turn-In Form field mismatch, `16`'s `onOpen()` `ReferenceError`) fixed — see resolution 2 above. `CompetencyRegistry.csv` is now in hand (resolution 7). |
| **M2 Lightweight** — Lesson Intelligence | Teacher logs lesson context → `LessonContext` / `AlignmentLog` / `CompetencyRegistry` / `ReportRegistry`; generates term-end alignment reports | Production ready. `22`, `22b`, `26` now in hand (resolution 9) — all Lightweight scripts present. |
| **M2 Full (Warm-Ups)** — personalized AI warm-up generation & grading | Nightly cron builds per-student warm-up docs (Studio Flow 3), grades them (Studio Flow 4), tracks a per-student "shadow matrix" | `23`, `24`, `25`, `28` in hand (resolution 9); `31`/`32`/`33` (pacing/rubric/artifact utilities) in hand (resolution 10). **`27_LessonFrameGenerator` is the one Full script still not uploaded.** |
| **M3** — Student Profile | Extension of Script 23, no new scripts | Designed, per `PLATFORM_DOCUMENTATION.html` — unaffected by this reconciliation pass |
| **M4** — Student Context Aggregator | Weekly per-student living Google Doc, Script 29 | **Production ready** — numbering confirmed correct twice now (resolutions 3 and 10), see both above |
| **M5** — SCR Suggestion & Remediation Engine | Scripts 30/30b; reads CompetencyEvidence, suggests SCR ratings, teacher confirm/override, retry-via-secondary-evidence path | Mixed confidence — see `docs/CAS_Module5_Documentation_v1.1.docx`'s file-by-file table. Cannot go fully live until Flow 2 is built in Studio. |

`scripts/archived/ARCHIVED_11_StudentFriendlyRejections.js` (merged into
Script 04; renamed to match the repo's prefix convention — resolution 13)
is itself informative: it emailed rejection notices to the *student*. The
current Script 04 writes rejections into the doc instead — the system
deliberately moved away from student email entirely at some point,
consistent with the Ledger schema never carrying a student email/only a
GoogleID.

## Known gaps (carried forward so a future session doesn't re-derive them)

1. **Flow 2 has never been built in Studio** — both `09_StudentRevisionGuidance_M1Base.js`
   and `03_QueueBridge.js` assume it exists, and Module 5 cannot go fully
   live without it. Flows 3 (warm-up generation) and 4 (warm-up
   grading/grammar) are also unbuilt.
2. ~~`TeacherMatrix` missing a `lesson_unit_id` column~~ — **closed**, see
   resolution 12 above.
3. ~~`CompetencyRegistry.csv` not uploaded~~ — **closed**, see resolution 7 above.
4. ~~`LessonPrimarySecondary_Seed.csv` not uploaded~~ — **closed**, see
   resolution 7 above.
5. **A v3/v4 of `16_UnifiedManualSetup_M5_ADDENDUM_v2.js`** exists
   (referenced by the merged Module 5 doc's Repair Note 4, a Rubric Upload
   Form fix) but hasn't been uploaded. Still open — the Round 3 batch did
   not contain it.
6. Retry thresholds in `30b_SCRRetryRemediation.js` (5 total MET evidence
   rows, 2× secondary-to-primary ratio) remain provisional, unvalidated
   defaults.
7. ~~Scripts 22, 22b, 23, 24, 26, 28, 31, 32, 33 not uploaded~~ — **closed**,
   see resolutions 9 and 10 above. **`27_LessonFrameGenerator` remains
   open** — it was not in the Round 3 batch either; do not assume it
   shipped because its Module 2 Full siblings did.
8. ~~Two archived-file naming conventions coexist~~ — **closed**, see
   resolution 13 above.
9. **`31_PacingGuideManager.js` doesn't yet read the v2 pacing guide's 4
   new fields** (`chain_node`, `esports_connection`,
   `vocabulary_with_definitions`, `studio_flow_hooks`) — see resolution 8
   above. It will import and run against `PacingGuide_CAS_Context.json`
   (the file holding the adopted v2 content — there is no file literally
   named `_v2.json`) without erroring, just silently drop the new fields,
   until its
   `PG_HEADERS`/`PG_COL_COUNT`/row-mapping are extended.
10. **`curriculum/PacingGuide_CAS_Context.csv` and `.docx`** are now stale
    relative to the adopted `PacingGuide_CAS_Context.json` (v2 content) — not
    regenerated as part of this pass.
11. **`data/CompetencyRegistry.csv` and `data/sol-correlations/` are not
    yet imported into any Sheet** — the files exist in the repo (resolution
    7), but nothing has run `importCompetencyRegistry()` (Script `22b`)
    against them in a live deployment. This is a deployment-time action,
    not a repo-file gap, listed here so it isn't mistaken for "already live."
12. ~~Confirmed duplicate top-level declarations across files sharing a
    GAS project~~ — **closed.** `gas-lint` found 6 distinct collisions;
    all 6 fixed and re-verified clean (0 errors, `node --check` passes
    repo-wide):
    - `SP_STUDENT_EMAIL`/`SP_TEACHER_EMAIL`/`SP_STUDENT_NAME`/`SP_SHADOW_MATRIX`:
      `25_WarmUpWriter.js`'s redundant "alias for readability" block
      deleted, its call sites now use the file's own already-unique
      `SP25_*` names directly.
    - `03_QueueBridge.js`'s `SP_QUEUE_ROW_REF`/`SP_STUDENT_FILE_ID`/`SP_CONFIG_ID`/`SP_TEACHER_EMAIL`/`SP_STATUS`
      (STAGING_PIPELINE columns) renamed to `STG_*` — these collided with
      `23_StudentProfileManager.js`'s StudentProfiles-column `SP_*`
      constants of the *same names but different values/meanings*
      (`SP_TEACHER_EMAIL` was 4 in one, 3 in the other).
    - `formatDateYMD_` (three identical copies in `23`/`24`/`25`):
      de-duplicated to the one definition in `23`, relied on via the
      shared Central Ledger project scope from `24`/`25`.
    - **`buildStudentRoster_`** (the serious one — two genuinely different
      functions sharing a name, `23_StudentProfileManager.js`'s
      `(ledgerData, teacherEmail, currentTerm)` vs.
      `29_StudentContextAggregator.js`'s `(ledgerSheet)`): `29`'s renamed
      to `buildValidatedStudentRoster_`, its one call site updated.
    - `extractFormEntryIds_` (`16_UnifiedManualSetup.js` vs.
      `16_UnifiedManualSetup_M5_ADDENDUM_v2.js`, which explicitly
      documented itself as replacing the base version but had never
      actually been merged): merged for real, plus the M6 addendum's
      one-line Lesson Unit extension on top. Both addendum files keep
      their now-inert content as commented-out historical record, not
      deleted.
13. **`03_QueueBridge.js`'s `bridgeQueue()` and `backPropagateCompletions()`
    now take a document lock** — closed. Both run on time triggers (1 min /
    2 min) and mutate `STAGING_PIPELINE`/`ReviewQueue`/`Ledger`; neither
    had any protection against Apps Script running two overlapping
    invocations if a run takes longer than its trigger interval (a real
    risk as those sheets grow), unlike their sibling
    `06_StagingPipeline_Turnstile.js`'s `runStagingTurnstile()`, which
    already locks for exactly this reason. Without a lock, two overlapping
    `bridgeQueue()` runs could both stage the same student submission,
    producing a duplicate AI evaluation; `backPropagateCompletions()` had
    a partial mitigation already (it re-reads the queue row's live status
    immediately before acting, rather than trusting its own stale read),
    which narrowed but didn't close the same race. Both now take
    `LockService.getDocumentLock()` with the same 15-second wait and
    congestion-standdown pattern the Turnstile already used, so a busy run
    stands down instead of racing.
14. **`31_PacingGuideManager.js`'s warm-up anchor cache was silently
    truncating text** — closed. `_loadPacingGuide_()` caches the whole
    pacing guide in Script Properties, and — because a single property
    value is capped at ~9KB — trimmed each unit's `warmup_anchor` to 200
    characters before caching, with no way to tell a genuinely-short
    anchor from one that got cut off mid-sentence. Every warm-up prompt
    built from a cache hit (the common case) silently used the truncated
    200-char version forever, even after the cache warmed up and a fuller
    read would have been cheap. Fixed by tagging each cached unit with a
    `warmup_anchor_truncated` flag at write time; `resolveUnitForDate_()`
    now threads that flag through, and `getWarmUpAnchor_()` checks it
    before returning — if set, it calls new helper
    `_getFullWarmupAnchor_()` to re-read that one unit's untruncated
    `warmup_anchor` directly from the `PacingGuide` sheet, so only the
    (rare) truncated case pays the extra read instead of every call.

## Naming note

Files prefixed `_ADDENDUM` (and `16_..._v2.js`, `15b_...Revised.js`,
`00_..._v2.js`) are patches — instructions for editing a base script, not
standalone deployable files. `scripts/09_StudentRevisionGuidance_M1Base.js`
and `scripts/07_TeacherDashboard.js`/`08_TeacherConfirmationStep.js`'s
pre-M2/M3 counterparts were **not** added under their original filenames
because this repo's existing `07`/`08` are strictly newer, additive
supersets of them — keeping only the newer copies avoids two files
silently claiming the same canonical name with one of them being stale.
`09` was the one exception, kept under both names (one archived), because
the difference there was architectural, not incremental — see resolution
1 above.
