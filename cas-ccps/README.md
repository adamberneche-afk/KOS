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

## ⚠️ Architecture fork — two incompatible designs for how student feedback gets written

This is the most consequential finding in the repo. The very first file
uploaded to this project (`scripts/09_StudentRevisionGuidance.js`) and the
base system uploaded later (`scripts/09_StudentRevisionGuidance_M1Base.js`,
part of a self-consistent 20+ file bundle) implement **two different,
mutually incompatible answers to "who writes the evaluation report into the
student's doc — Studio or GAS?"**

| | `09_StudentRevisionGuidance.js` (first upload) | `09_StudentRevisionGuidance_M1Base.js` + the rest of this batch |
|---|---|---|
| Who writes the formatted evaluation block into the doc | **GAS** — `prependFeedbackToHeader(fileId, evaluationReport, configId, complianceResult)` takes the report text as a parameter and formats/inserts it itself | **Studio** — via a native "Google Docs → Insert text" connector step, writing the full `── EVALUATION … ── END EVALUATION ──` block directly |
| GAS's role | Primary writer, "called by the admin evaluation engine (Script 03) after inference" | Backup only — `03_QueueBridge.js`'s `processCompletedEvaluation_(fileId, configId)` takes **no report-text parameter at all**, and only does placeholder cleanup (idempotent, in case Studio's step failed) plus the separately-designed "what to do next" append |

Three independently-uploaded, mutually-corroborating sources agree with each
other and disagree with the first upload: `scripts/15_StudioFlowPrompts.js`
(base Flow spec), `scripts/15b_StudioFlowPrompts_Flow2_Revised.js` (the M3
revision of that same spec), and the real `scripts/03_QueueBridge.js` — all
three describe Studio writing the report directly, with GAS explicitly
*not* needing to. `docs/STUDIO_FLOW_REFERENCE.html` (the human-readable
version of the same spec) states outright: *"Script 03's
backPropagateCompletions() will append the 'What to do next' block
automatically… Studio does NOT need to write that section."*

**This is strong, triangulated evidence that `09_StudentRevisionGuidance.js`
(the very first file uploaded) describes a different, likely earlier or
experimental design** — not a version bump, an incompatible one. Both files
are kept, under distinct names, with nothing silently overwritten. Confirm
which one is actually live before building anything else on top of either.

## ⚠️ Two confirmed bugs (found by direct code reading, not inference)

1. **The Turn-In Form's actual field configuration doesn't match what reads it.** `16_UnifiedManualSetup.js`'s `createAdminAssets_()` builds the Turn-In Form with `setCollectEmail(false)` and a manual text item titled `"Your Google Account"`. But `04_Form2_TurnInGate.js`'s own header comment and its actual field read both assume `setCollectEmail(true)` and read Google's auto-collected `"Email Address"` field — and `18_FormSubmitDispatcher.js`'s comment independently describes the field as `"Your Google Account"`, agreeing with 16 and disagreeing with 04. All three files were uploaded together as one coherent bundle, yet disagree on one form's actual shape. As literally written, the form Script 16 generates would never populate `r["Email Address"]`, so `onTurnInSubmit` would silently no-op on every real student turn-in.
2. **`16_UnifiedManualSetup.js`'s `onOpen()` references `props` without ever defining it** (`props.getProperty("INSTALLER_COMPLETE")`, expected to be `PropertiesService.getScriptProperties()`). Reads as a `ReferenceError` waiting to fire the first time a bound sheet is opened.

## ⚠️ A third numbering scheme for Scripts 29+ — and disagreement over whether they should exist at all

Previously flagged: Module 3/4 docs assign `29 = StudentContextAggregator`,
`30 = SCRSuggestionEngine`; `00_SharedConfig_M2_ADDENDUM_v2.js` assigns
`29 = importPacingGuide()`, `30 = importCompetencyRubrics()`,
`31 = ArtifactCompetencyBridge`. This batch adds a **third** position:
`docs/PLATFORM_DOCUMENTATION.html` gives Module 2 a complete, clean script
map — **22 LessonContextHandler · 23 StudentProfileManager · 24
WarmUpBridge · 25 WarmUpWriter · 26 CompetencyAlignmentLog · 27
LessonFrameGenerator · 28 Module2Setup** — that stops at 28 and explicitly
states Module 3 ("Student Profile") needs **no new numbered scripts at
all**, just an extension of Script 23. Three sources, three different
answers for what (if anything) 29 and 30 are. Not resolved here — flagged
for whoever maintains the source.

**Related, and possibly the explanation:** `docs/PLATFORM_DOCUMENTATION.html`
describes only **three** modules — 1 (Evaluation Engine, production ready),
2 (Lesson Intelligence, specification), 3 (Student Profile, designed) — and
never mentions a "Module 4" at all. Its "Module 3" (Student Profile, no new
scripts) is not the same thing as this repo's `CAS_Module3_Documentation`
("SCR Suggestion & Remediation Engine," scripts 08/16-addendum/19-addendum/
30/30b — a much larger, unrelated-in-content module). This looks like two
divergent documentation lineages that reused the same module numbers for
different features, rather than one evolving roadmap — treat "Module 3" and
"Module 4" as ambiguous terms in this codebase until reconciled with
whoever's maintaining it.

## ⚠️ Documentation lineage: some docs disagree about which docs are current

`docs/PLATFORM_DEPLOYMENT_GUIDE_OUTDATED.md` (originally just
`DEPLOYMENT_GUIDE.md`, renamed here to avoid confusion with the CAS module
docs) **explicitly says not to follow it** and names exactly four documents
as current: `ADMIN_DEPLOYMENT_WALKTHROUGH.html`, `SYSTEM_ARCHITECTURE.html`,
`STUDIO_FLOW_REFERENCE.html`, `REGISTRY_SHEET_SETUP.md`. Notably absent from
that endorsed list: `docs/DEPLOYMENT_AND_UX_GUIDE.html` — a full, seemingly
current-looking "v3.0" guide that was uploaded in the same batch. It also
carries a stray "14 Script files" stat card when every other doc in this
batch counts 21 — a second signal that it's a leftover from an earlier,
un-reconciled doc lineage rather than the current source of truth.

## ⚠️ Documentation version drift — two different files both called "v1.0"

`docs/CAS_Module3_Documentation_v1.0.docx` and
`docs/CAS_Module3_Documentation_v1.0_alt.docx` are **not the same
document** despite an identical version label in both the filename and the
title page — they were uploaded in different batches and differ in real
content:

- `_alt` documents a **v3/v4** of `16_UnifiedManualSetup_M3_ADDENDUM_v2.js`
  with a fourth repair note (a "Rubric Upload Form" block with two
  truncated field titles) that **does not appear** in the actual
  `16_UnifiedManualSetup_M3_ADDENDUM_v2.js` file in `scripts/` — meaning a
  newer version of that addendum exists somewhere and hasn't been uploaded.
- `_alt` also references a **`LessonPrimarySecondary_Seed.csv`** (a seed
  file for the 7 parallel lesson units, derived from VDOE SOL correlation
  documents) that has never been uploaded.

Both copies are kept — neither was discarded — but treat `_alt` as the
more current one for Module 3 questions.

---

## Directory map

| Path | Contents |
|---|---|
| `docs/` | Base platform docs (architecture, deployment, Studio flow reference, teacher/student/admin guides) + Module 2–4 documentation + IT/Admin security guide |
| `scripts/` | Numbered Apps Script files, base + addenda. `scripts/archived/` holds files the source itself marks superseded. |
| `data/` | Reference data imported into the Central Ledger at setup time |
| `curriculum/` | Pacing guide (3 formats) + per-stage lesson card decks |
| `forms/` | Setup spec for the Warm-Up Response Google Form |

## What Module 1 (the base system) actually is — now mostly in hand

Previously entirely missing; now ~20 of its files are present. The base
system is **6 separate Apps Script projects** working together:

| Project | Bound to | Scripts |
|---|---|---|
| Central Ledger | Central Ledger spreadsheet | `00`, `02` (intake), `03` (queue bridge), `04` (turn-in gate), `06` (turnstile), `10` (admin recovery), `18` (form dispatcher), `20` (checkpoint) |
| Master Student Template | Master Student Template Doc | `00`, `01` (container script — student-facing menu), `09`, `17` (doc-only setup notes) |
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
and writes the full formatted report directly into the doc (see the
architecture-fork note above), then flips the staging row to `COMPLETE`.
Script 03's `backPropagateCompletions` (2-min trigger) closes out the
queue/ledger rows and appends the "what to do next" block. When the student
turns in via the Turn-In Form, Script 04 runs a 3-point ledger match plus a
forensic Drive-revision check before marking the row `COMPLIANT`.

## Module status

| Module | Purpose | Status |
|---|---|---|
| **M1** — base intake/grading | See above | **Now ~20 files in hand.** Two confirmed bugs (Turn-In Form field mismatch, `16`'s `onOpen()` ReferenceError) block a clean deploy. `CompetencyRegistry.csv` (the raw import source — distinct from the `CompetencyRegistry` *Sheet tab* it produces, which `PLATFORM_DOCUMENTATION.html` confirms has columns `competency_id, competency_text, subject, grade_band, strand`) is still not uploaded. |
| **M2 Lightweight** — Lesson Intelligence | Teacher logs lesson context → `LessonContext` / `AlignmentLog` / `CompetencyRegistry` / `ReportRegistry`; generates term-end alignment reports | **Production ready.** Scripts 22 (`LessonContextHandler`), 22b, 26 (`CompetencyAlignmentLog`) still not uploaded as files, though their role is now clearly documented. |
| **M2 Full (Warm-Ups)** — personalized AI warm-up generation & grading | Nightly cron builds per-student warm-up docs (Studio Flow 3), grades them for word count/grammar/engagement (Studio Flow 4), tracks a per-student "shadow matrix" of archetype confidence | `scripts/25_WarmUpWriter.js` in hand. Scripts 23 (`StudentProfileManager`), 24 (`WarmUpBridge`), 27 (`LessonFrameGenerator`), 28 (`Module2Setup`) named and scoped by `PLATFORM_DOCUMENTATION.html` but not yet uploaded as files. |
| **M3** — ambiguous, see numbering note above | Either "SCR Suggestion & Remediation" (per `CAS_Module3_Documentation`) or "Student Profile, no new scripts" (per `PLATFORM_DOCUMENTATION.html`) — **these do not appear to be the same feature** despite sharing a module number | Mixed confidence regardless of which "Module 3" is meant — see gaps below |
| **M4** — Student Context Aggregator | Weekly per-student living Google Doc; not mentioned anywhere in `PLATFORM_DOCUMENTATION.html`'s 3-module roadmap | **Production ready** per its own docs (v1.1), but its place in the overall module numbering is unclear — see numbering note above |

`scripts/11_StudentFriendlyRejections_ARCHIVED.js` (merged into Script 04;
kept in `scripts/archived/`) is itself informative: it emailed rejection
notices to the *student*. The current Script 04 writes rejections into the
doc instead — the system deliberately moved away from student email
entirely at some point, consistent with the Ledger schema never carrying a
student email/only a GoogleID.

## Known gaps (carried forward so a future session doesn't re-derive them)

1. **The Script 09 architecture fork** (see top of file) — resolve which design is live before writing more code against either.
2. **Flow 2 has never been built in Studio** (confirmed again — both `09` designs and `03_QueueBridge.js` assume it exists), nor have Flows 3 (warm-up generation) or 4 (warm-up grading/grammar).
3. **`TeacherMatrix` is confirmed (not just inferred) to be missing a `lesson_unit_id` column** — directly verified against Script 16's actual `createAdminAssets_()` column list (15 columns, no such field) and Module 2's `LessonContext` schema (8 columns, also no such field, and no `ConfigID` link either). Blocks M3's PRIMARY/SECONDARY evidence split regardless of which "Module 3" is meant.
4. **`CompetencyRegistry.csv`** (the 221-row import source) is still not uploaded — only the Sheet-tab schema it produces is documented, and the already-present `data/CompetencyRubrics.json` (skill questions/rubric detail) is a different, complementary artifact.
5. **`LessonPrimarySecondary_Seed.csv`** (VDOE-SOL-derived seed data) is referenced in the `_alt` Module 3 doc but not uploaded.
6. **A v3/v4 of `16_UnifiedManualSetup_M3_ADDENDUM_v2.js`** exists (referenced by `_alt`'s "Repair Note 4," a Rubric Upload Form fix) but hasn't been uploaded.
7. Retry thresholds in `30b_SCRRetryRemediation.js` (5 total MET evidence rows, 2× secondary-to-primary ratio) remain provisional, unvalidated defaults.
8. Scripts `22`, `22b`, `23`, `24`, `26`, `27`, `28`, `31`, and `29_StudentContextAggregator_M4b_ADDENDUM.js` are all named and scoped by documentation now in this repo, but none have been uploaded as files yet.
9. Two archived-file naming conventions coexist and disagree with each other: `11_StudentFriendlyRejections_ARCHIVED.js` (suffix) vs. `14_ARCHIVED_TeacherManualSetup.js` (prefix). `ADMIN_DEPLOYMENT_WALKTHROUGH.html` documents the convention as prefix-only ("files prefixed `ARCHIVED_`… ignore them"), which technically doesn't cover file 11's suffix form — a minor inconsistency, noted so an automated archival check doesn't miss file 11.

## Naming note

Files prefixed `_ADDENDUM` (and `16_..._v2.js`, `15b_...Revised.js`,
`00_..._v2.js`) are patches — instructions for editing a base script, not
standalone deployable files. `scripts/09_StudentRevisionGuidance_M1Base.js`
and `scripts/07_TeacherDashboard.js`/`08_TeacherConfirmationStep.js`'s
pre-M2/M3 counterparts (uploaded in this same batch, byte-diffed against
what's already here) were **not** added under their original filenames
because this repo's existing `07`/`08` are strictly newer, additive
supersets of them (M2/M3 features layered on, nothing removed or changed
underneath) — keeping only the newer copies avoids two files silently
claiming the same canonical name with one of them being stale. `09` is the
one exception, kept under both names, because the difference there is
architectural, not incremental — see the fork note at the top of this file.
