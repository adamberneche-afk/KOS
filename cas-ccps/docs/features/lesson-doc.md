# The teacher's lesson doc (script 66)

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

`66_LessonDoc.js` (Central Ledger and Teacher Dashboard, 2026-10-27) makes
one teacher doc per lesson, "Lesson Plan — 8175 L06 …", in a *Lesson Plans*
folder, in place of the per-period Lesson Frames (27) the lesson builder
(51) made for every class meeting: the builder's rows now make none, and a
lesson logged by hand still gets one. The doc holds the plan (when it
runs and when it is due, by 00's `lessonDueDay_`; links to the Teacher
Dashboard and the agenda deck; objective, "I can" goals, competencies by
tier, vocabulary, the student task); an
**itinerary** per day of the lesson, drafted from the lesson's own sections
(55b's `plan`), with minutes for each of the course's blocks on Schedule A
and B (00's bell schedule and `itineraryFor_`), which the teacher edits and
the daily agenda will read; look-fors (each competency's "I can" goal and
the state's indicators); for a lesson in parts, **Parts** (each part's task,
work type, the checks Submit makes on it in words, what opens it, what else
it needs to show); **What the feedback checks** (the definition of done's
needs-to-show lists, the teacher's grading notes, the passing rule in
plain words); a heading per class meeting with room for notes; and **Class
status** per period (docs made, shared, not started, submitted, waiting for
feedback, to revise, passed), then **Not shown yet**: each goal with how
many checked student files haven't shown it, by their best check, most
first (counts only; 2026-11-19, `meta/AUDIT_LESSON_DOC_2026-11-19.md`). It is made once: the nightly rollout (for
courses with it on) or **Make lesson doc** in 📅 Lessons; after that, both
only refresh Class status, so the teacher's edits stay (a doc made before
2026-11-19 gets Parts and What the feedback checks on its next refresh,
before Class status). The `LessonDocs`
tab records each doc by lesson. From the editor: `previewLessonDocs()`,
`makeLessonDocsNow()`.
