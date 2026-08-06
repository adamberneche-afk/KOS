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

---

## ⚠️ Unresolved conflict — Script numbers 29 and 30 are double-booked

Two different, independently-uploaded parts of the documentation assign
**the same script numbers to two completely different scripts**. This is
not a naming coincidence — it's a real inconsistency in the source
material that needs to be resolved with whoever authored these before
either is trusted as "the" Script 29 or "the" Script 30:

| # | Claim A (Module 3 & 4 docs, `scripts/29`, `scripts/30`, `scripts/30b`) | Claim B (`00_SharedConfig_M2_ADDENDUM_v2.js`, Module 2 Full build) |
|---|---|---|
| **29** | `StudentContextAggregator` — weekly per-student Doc aggregation (Module 4) | `importPacingGuide()` — one-time PacingGuide.json importer |
| **30** | `SCRSuggestionEngine` — SCR rating suggestion engine (Module 3) | `importCompetencyRubrics()` — one-time CompetencyRubrics.json importer |

Module 4's documentation was re-uploaded as v1.1 in the same batch that
introduced Claim B, and v1.1 *reaffirms* Script 29 = `StudentContextAggregator`
— so Claim A looks like the more recently-confirmed one, but that's an
inference, not a resolution. **Do not assume either side is correct** —
flag this to whoever maintains the CAS source and get an authoritative
answer before writing any code that depends on a specific Script 29 or 30.
Everything in this repo keeps files under their Claim-A names since that's
what arrived as complete, deployable scripts; the Claim-B behaviors
(PacingGuide/CompetencyRubrics importing) exist only as addendum
instructions, not as an actual numbered file, so no file collision was
forced here — but the *next* uploaded script literally named `29_...js` or
`30_...js` under Claim B's meaning will collide with what's already in
`scripts/`.

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
  newer version of that script file exists somewhere and hasn't been
  uploaded yet.
- `_alt` also references a **`LessonPrimarySecondary_Seed.csv`** (a seed
  file for the 7 parallel lesson units, derived from VDOE SOL correlation
  documents) that has never been uploaded.

Both copies are kept — neither was discarded — but treat `_alt` as the
more current one for Module 3 questions, and note that the actual v3/v4
addendum script and the seed CSV it depends on are still missing.

---

## Directory map

| Path | Contents |
|---|---|
| `docs/` | Module documentation (M2–M4) + IT/Admin security guide |
| `scripts/` | Numbered Apps Script files and addenda |
| `data/` | Reference data imported into the Central Ledger at setup time |
| `curriculum/` | Pacing guide (3 formats) + per-stage lesson card decks |
| `forms/` | Setup spec for the Warm-Up Response Google Form |

## Module status

| Module | Purpose | Status |
|---|---|---|
| **M1** — base intake/grading | Ledger, `STAGING_PIPELINE`, `RubricQueue`, `TeacherMatrix`, `DraftUnits`, Flow 1 (rubric extraction) | **Not uploaded.** Everything else assumes this exists and is live. |
| **M2 Lightweight** — Lesson Intelligence | Teacher logs lesson context → `LessonContext` / `AlignmentLog` / `CompetencyRegistry` / `ReportRegistry`; generates term-end alignment reports | **Production ready.** `scripts/07_TeacherDashboard.js` (base+M2) and `scripts/00_SharedConfig_M2_ADDENDUM_v2.js` now in hand; Scripts 22, 22b, 26 and `CompetencyRegistry.csv` still not uploaded. |
| **M2 Full (Warm-Ups)** — personalized AI warm-up generation & grading | Nightly cron builds per-student warm-up docs (Studio Flow 3), grades them for word count/grammar/engagement (Studio Flow 4), tracks a per-student "shadow matrix" of archetype confidence | **Newly revealed this session** — was previously documented as fully dormant. `scripts/25_WarmUpWriter.js` now in hand (complete). Scripts 23 (`StudentProfiles` builder), 24 (`WarmUpQueue` builder), 31 (`ArtifactCompetencyBridge`) still not uploaded. `data/CompetencyRubrics.json` (221 rubrics with skill questions) now in hand; still needs Studio Flows 3 & 4 built. |
| **M3** — SCR Suggestion & Remediation | Converts graded evidence into a suggested Student Competency Record rating (1–5, never auto-suggests 1 or 5), teacher confirms/overrides, plus a retry/remediation path via linked secondary competencies | **Mixed confidence** — see gaps below |
| **M4** — Student Context Aggregator | Weekly per-student living Google Doc (assignments + warm-ups), now formalized as ONE shared cross-teacher/cross-year Warm-Up Form and student identity as the permanent organizing key | **Production ready**, updated to v1.1 (`docs/CAS_Module4_Documentation_v1.1.docx`) — adds the M4b multi-teacher addendum (closes the previously-open multi-teacher roster question), but `29_StudentContextAggregator_M4b_ADDENDUM.js` itself hasn't been uploaded yet. |

`scripts/09_StudentRevisionGuidance.js` is the feedback-writer called at the
end of Flow 2 (Step 5 in `scripts/15b_StudioFlowPrompts_Flow2_Revised.js`) —
it prepends the evaluation report into the student's Google Doc.

## Known gaps (carried forward so a future session doesn't re-derive them)

1. **Flow 2 (the Gemini evaluation flow) has never been built in Studio,** nor have Studio Flows 3 (warm-up generation) or 4 (warm-up grammar/engagement grading). All exist only as specs/prompt text embedded in scripts.
2. **`TeacherMatrix` is missing a `lesson_unit_id` column** (blocks M3's PRIMARY/SECONDARY evidence split) — and separately, Script 31 (`ArtifactCompetencyBridge`, not yet uploaded) is supposed to add a *different* `competency_ids` column to `TeacherMatrix`. These are related but distinct gaps — don't conflate them.
3. **Module 1's base files aren't in this repo.** `getConfig_()`, the Central Ledger schema, Flow 1, and the original (pre-addendum) versions of `00_SharedConfig.js`, `16_UnifiedManualSetup.js`, and `19_ClonedSheetConfig.js` are all referenced by the addendum files in `scripts/` but not present.
4. Retry thresholds in `30b_SCRRetryRemediation.js` (5 total MET evidence rows, 2× secondary-to-primary ratio) are stated as provisional defaults, not validated against real data.
5. `LessonPrimarySecondary_Seed.csv` (VDOE-SOL-derived seed data for the 7 parallel lesson units) is referenced in the newer Module 3 doc revision but not uploaded.
6. A "Rubric Upload Form" repair (Repair Note 4, a 4th fix on top of `16_UnifiedManualSetup_M3_ADDENDUM_v2.js`) is referenced but the file containing it hasn't been uploaded — meaning a v3/v4 of that addendum exists somewhere.
7. `CompetencyRegistry.csv` (the 221-row competency reference data — distinct from `data/CompetencyRubrics.json`, which is per-competency skill questions/rubric detail, not the registry itself) is still not uploaded.
8. `STUDIO_FLOW_REFERENCE.pdf` and the original `15_StudioFlowPrompts.js` (base file for Flow 1 + the original Flow 2 design) are referenced but not uploaded.
9. Scripts 22, 22b, 23, 24, 26, 31 and `29_StudentContextAggregator_M4b_ADDENDUM.js` are all confirmed to exist (named, with specific function signatures documented) but have not been uploaded.

## Naming note

Files prefixed `_ADDENDUM` (and `16_..._v2.js`, `15b_...Revised.js`,
`00_..._v2.js`) are patches — instructions for editing a base script, not
standalone deployable files. They're kept as delivered rather than
pre-merged into a synthesized base file, since not all of the actual base
files have been provided (`07_TeacherDashboard.js` and `08_TeacherConfirmationStep.js`
are now complete base files; `00_SharedConfig.js`, `16_UnifiedManualSetup.js`,
and `19_ClonedSheetConfig.js` are not).
