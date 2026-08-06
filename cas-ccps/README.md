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

## Directory map

| Path | Contents |
|---|---|
| `docs/` | Module documentation (M2–M4) + IT/Admin security guide |
| `scripts/` | Numbered Apps Script files and addenda (Modules 3 & 4) |
| `curriculum/` | Pacing guide (3 formats) + per-stage lesson card decks |
| `forms/` | Setup spec for the Warm-Up Response Google Form |

## Module status

| Module | Purpose | Status |
|---|---|---|
| **M1** — base intake/grading | Ledger, `STAGING_PIPELINE`, `RubricQueue`, `TeacherMatrix`, `DraftUnits`, Flow 1 (rubric extraction) | **Not uploaded.** Everything else assumes this exists and is live. |
| **M2** — Lesson Intelligence | Teacher logs lesson context → `LessonContext` / `AlignmentLog` / `CompetencyRegistry` / `ReportRegistry`; generates term-end alignment reports | Documented as **production ready** (`docs/CAS_Module2_Documentation_v1.1.docx`) |
| **M3** — SCR Suggestion & Remediation | Converts graded evidence into a suggested Student Competency Record rating (1–5, never auto-suggests 1 or 5), teacher confirms/overrides, plus a retry/remediation path via linked secondary competencies | **Mixed confidence** — see gaps below (`docs/CAS_Module3_Documentation_v1.0.docx`) |
| **M4** — Student Context Aggregator | Weekly per-student living Google Doc (assignments + warm-ups); first student-facing surface, identity-scoped via `Session.getActiveUser()` | Documented as **production ready** (`docs/CAS_Module4_Documentation_v1.0.docx`) |

`scripts/09_StudentRevisionGuidance.js` is the feedback-writer called at the
end of Flow 2 (Step 5 in `scripts/15b_StudioFlowPrompts_Flow2_Revised.js`) —
it prepends the evaluation report into the student's Google Doc.

## Known gaps (carried forward so a future session doesn't re-derive them)

1. **Flow 2 (the Gemini evaluation flow) has never been built in Studio.**
   `scripts/15b_StudioFlowPrompts_Flow2_Revised.js` is a spec only. Module 3
   cannot be exercised end-to-end until it exists.
2. **`TeacherMatrix` is missing a `lesson_unit_id` column.** Needed so Flow 2
   can distinguish PRIMARY vs SECONDARY competency evidence for the retry
   mechanism in `scripts/30b_SCRRetryRemediation.js`. Named as the next
   concrete blocking dependency in that file's trailing notes.
3. **Module 1's base files aren't in this repo.** `getConfig_()`, the
   Central Ledger schema, Flow 1, and the original (pre-addendum) versions
   of `00_SharedConfig.js`, `07_TeacherDashboard.js`, `08_TeacherConfirmationStep.js`,
   `16_UnifiedManualSetup.js`, and `19_ClonedSheetConfig.js` are all referenced
   by the addendum files in `scripts/` but not present — the addenda are
   patches to be pasted into files that haven't been uploaded yet.
4. Retry thresholds in `30b_SCRRetryRemediation.js` (5 total MET evidence
   rows, 2× secondary-to-primary ratio) are stated as provisional defaults,
   not validated against real data.
5. The Confirmation Form's "Passing Standard" help text
   (`scripts/16_UnifiedManualSetup_M3_ADDENDUM_v2.js`) is a placeholder
   reconstruction of damaged source text, flagged as not final.
6. Module 2's warm-up subsystem (Studio Flows 3 & 5, Scripts 23–27) is fully
   dormant, pending one concrete classroom example per that module's docs.

## Naming note

Files prefixed `_ADDENDUM` (and `16_..._v2.js`, `15b_...Revised.js`) are
patches — instructions for editing a base script, not standalone deployable
files. They're kept as delivered rather than pre-merged into a synthesized
base file, since the actual base files haven't been provided.
