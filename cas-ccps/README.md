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
  originals kept, archived, neither deleted.

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
archived, unchanged. The v3/v4 addendum file and the
`LessonPrimarySecondary_Seed.csv` seed file referenced by the merged doc
remain open known gaps — still not uploaded anywhere.

---

## Directory map

| Path | Contents |
|---|---|
| `docs/` | Base platform docs (architecture, deployment, Studio flow reference, UX reference, teacher/student/admin guides) + Module 2/3/4/5 documentation + IT/Admin security guide. `docs/archived/` holds superseded docs the source itself marks superseded. |
| `scripts/` | Numbered Apps Script files, base + addenda. `scripts/archived/` holds files the source itself marks superseded. |
| `data/` | Reference data imported into the Central Ledger at setup time |
| `curriculum/` | Pacing guide (3 formats) + per-stage lesson card decks |
| `forms/` | Setup spec for the Warm-Up Response Google Form |

## What Module 1 (the base system) actually is

The base system is **6 separate Apps Script projects** working together:

| Project | Bound to | Scripts |
|---|---|---|
| Central Ledger | Central Ledger spreadsheet | `00`, `02` (intake), `03` (queue bridge), `04` (turn-in gate), `06` (turnstile), `10` (admin recovery), `18` (form dispatcher), `20` (checkpoint) |
| Master Student Template | Master Student Template Doc | `00`, `01` (container script — student-facing menu), `09` (M1Base), `17` (doc-only setup notes) |
| Rubric Response Sheet (cloned per teacher) | cloned sheet | `00`, `05` (teacher rubric intake), `19` |
| Teacher Matrix Sheet (cloned per teacher) | cloned sheet | `00`, `08`, `19` |
| Teacher Dashboard | standalone web app | `07` |
| Student Dashboard | standalone web app | `13` |

Plus: `15`/`15b` (Studio Flow prompt specs, not deployed scripts), `16`
(the unified admin+teacher setup wizard — `detectRole_()` picks admin vs.
teacher automatically), `21` (an optional Apps Script API auto-installer
that can bind all six projects and deploy both web apps in ~3 minutes
instead of ~20 minutes of manual binding per project — see
`REGISTRY_SHEET_SETUP.md`).

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

## Module status

| Module | Purpose | Status |
|---|---|---|
| **M1** — base intake/grading | See above | ~20 files in hand. Both confirmed bugs (Turn-In Form field mismatch, `16`'s `onOpen()` `ReferenceError`) fixed — see resolution 2 above. `CompetencyRegistry.csv` (the raw import source) is still not uploaded. |
| **M2 Lightweight** — Lesson Intelligence | Teacher logs lesson context → `LessonContext` / `AlignmentLog` / `CompetencyRegistry` / `ReportRegistry`; generates term-end alignment reports | Production ready. Scripts 22, 22b, 26 still not uploaded as files, though their role is documented. |
| **M2 Full (Warm-Ups)** — personalized AI warm-up generation & grading | Nightly cron builds per-student warm-up docs (Studio Flow 3), grades them (Studio Flow 4), tracks a per-student "shadow matrix" | `25_WarmUpWriter.js` in hand. Scripts 23, 24, 27, 28 named and scoped but not yet uploaded. |
| **M3** — Student Profile | Extension of Script 23, no new scripts | Designed, per `PLATFORM_DOCUMENTATION.html` — unaffected by this reconciliation pass |
| **M4** — Student Context Aggregator | Weekly per-student living Google Doc, Script 29 | **Production ready** — numbering confirmed correct, see resolution 3 above |
| **M5** — SCR Suggestion & Remediation Engine | Scripts 30/30b; reads CompetencyEvidence, suggests SCR ratings, teacher confirm/override, retry-via-secondary-evidence path | Mixed confidence — see `docs/CAS_Module5_Documentation_v1.1.docx`'s file-by-file table. Cannot go fully live until Flow 2 is built in Studio. |

`scripts/11_StudentFriendlyRejections_ARCHIVED.js` (merged into Script 04;
kept in `scripts/archived/`) is itself informative: it emailed rejection
notices to the *student*. The current Script 04 writes rejections into the
doc instead — the system deliberately moved away from student email
entirely at some point, consistent with the Ledger schema never carrying a
student email/only a GoogleID.

## Known gaps (carried forward so a future session doesn't re-derive them)

1. **Flow 2 has never been built in Studio** — both `09_StudentRevisionGuidance_M1Base.js`
   and `03_QueueBridge.js` assume it exists, and Module 5 cannot go fully
   live without it. Flows 3 (warm-up generation) and 4 (warm-up
   grading/grammar) are also unbuilt.
2. **`TeacherMatrix` is confirmed missing a `lesson_unit_id` column** —
   directly verified against Script 16's actual `createAdminAssets_()`
   column list (15 columns, no such field) and Module 2's `LessonContext`
   schema (8 columns, also no such field). Blocks M5's PRIMARY/SECONDARY
   evidence split. Restored as an explicit gap entry in the merged
   `CAS_Module5_Documentation_v1.1.docx` (see resolution 6 above).
3. **`CompetencyRegistry.csv`** (the 221-row import source) is still not
   uploaded — only the Sheet-tab schema it produces is documented, and the
   already-present `data/CompetencyRubrics.json` (skill questions/rubric
   detail) is a different, complementary artifact.
4. **`LessonPrimarySecondary_Seed.csv`** (VDOE-SOL-derived seed data) is
   referenced by `CAS_Module5_Documentation_v1.1.docx`'s deployment
   checklist Step 6 but not uploaded — treat that step as blocked until it is.
5. **A v3/v4 of `16_UnifiedManualSetup_M5_ADDENDUM_v2.js`** exists
   (referenced by the merged Module 5 doc's Repair Note 4, a Rubric Upload
   Form fix) but hasn't been uploaded.
6. Retry thresholds in `30b_SCRRetryRemediation.js` (5 total MET evidence
   rows, 2× secondary-to-primary ratio) remain provisional, unvalidated
   defaults.
7. Scripts `22`, `22b`, `23`, `24`, `26`, `27`, `28` are named and scoped
   by documentation now in this repo, but none have been uploaded as files
   yet. Scripts `31`, `32`, `33` (Module 2's import/bridge utilities,
   renumbered per resolution 4 above) are not implemented anywhere yet either.
8. Two archived-file naming conventions coexist and disagree with each
   other: `11_StudentFriendlyRejections_ARCHIVED.js` (suffix) vs.
   `14_ARCHIVED_TeacherManualSetup.js` (prefix). `ADMIN_DEPLOYMENT_WALKTHROUGH.html`
   documents the convention as prefix-only — a minor inconsistency, noted
   so an automated archival check doesn't miss file 11.

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
