# The Covered So Far docs (script 76)

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

`76_CoveredSoFar.js` (Central Ledger, 2026-11-08, plan L6) keeps one Google
Doc per course, "Covered So Far — <course>", as a source for the teacher's
course notebooks (Gemini, NotebookLM), so a notebook goes only as deep as
what has been taught. It lists each lesson taught so far, oldest first (a
`LessonSchedule` start date on or before today; a held lesson is still
taught): its date, number in teaching order and title, objective, "I can"
goals, the competencies it assesses and those it also touches, key concepts
(vocabulary) and parts, all from the lesson files (55b); the lesson being
taught now is marked; then **Next up**, the next dated lesson or the next
undated one in teaching order. Earlier lessons with no start date are
counted, not listed. The pacing is `LessonSchedule` (the generated pacing
guide, 31, was replaced by the teacher's lessons on 2026-10-07); the
`RolloutLog` isn't used, since it records docs made, not lessons taught.
Nothing about students. The nightly rollout (58, step 6) rewrites a doc only
when its text changed and logs a `COVERED_SO_FAR` row when it does (a
failure is a `PROBLEM` row; the rollout goes on). The doc is made on the
first run in the teacher folder (`TEACHER_FOLDER_ID`) and rewritten in place
after that: its ID is the Script Property `COVERED_SO_FAR_DOC_ID_<course>`,
and a trashed doc is made again (one that can't be opened is a `PROBLEM`,
never replaced behind the notebook's back; delete the property to start
over). `refreshCoveredSoFar()` from the editor
rewrites both now.
