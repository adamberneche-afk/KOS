# Nightly lesson rollout (script 58)

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

`58_LessonRollout.js` (Central Ledger) ties student docs to the
`LessonSchedule` dates, so a typed start date is enough. Each night at about
9 p.m. (`installLessonRolloutTrigger()`), per course:

1. **Release.** Docs made ahead for the current lesson or one starting
   tomorrow (Ledger status `SCHEDULED`) are shared with their students and
   set `ACTIVE`, so the card appears on the Student Dashboard the night
   before the lesson.
2. **Seed.** Lessons starting within 2 days, and the current one, go into the
   TeacherMatrix as LIVE (`seedAssignments_`, script 53).
3. **Enroll.** Each of those lessons is enrolled from the Canvas exports
   (`enrollCanvasRoster_`, script 52). A lesson whose release night hasn't
   come gets unshared `SCHEDULED` docs; the current lesson and tomorrow's
   get shared ones, so late joiners can start at once.
4. **Lesson doc.** Each of those lessons gets the teacher's lesson doc once
   (script 66, below); later nights refresh its Class status.
5. **Agenda.** The next school day's slide in the course's agenda deck
   (script 67, below).
6. **Covered So Far.** Each course's Covered So Far doc (script 76, below),
   rewritten when it changed; every run but a preview, in shadow too.

It runs in **shadow** until `ROLLOUT_AUTO_APPLY` is set (Script Property or
the Ledger's `_CONFIG` tab: `8175`, `8177` or `all`; `off` stops it again):
in shadow it only writes what it would do. Every run writes counts and
reason codes to the `RolloutLog` tab, never student details, all stamped
with the run's start time, with a `PROBLEM` row for anything that needs you
(failed enrollments or shares, a missing template, unmapped Canvas sections,
a Canvas export more than 7 days old, checked by the nightly run only). A
step the time budget stopped is a `CONTINUES` row, its Count what is left;
it is not a problem, because the next run picks it up.

**What the signal counts (2026-11-08, plan L3).** It used to count every
PROBLEM row of the last day, so a night of catch-ups read as "57 problems".
Now `rolloutDayStatus_` (58) counts what remains: rows are grouped into runs
and keyed by course, lesson and step; a problem counts only if it is in the
latest run that touched its step (a later run that did the step clears it;
the same problem in every run counts once; a run-wide failure counts only if
the day's latest run repeated it). A `CONTINUES` row still standing after the
day's runs means the day didn't finish, with its docs left; a dry run's never
does. The stale-export note is said once. Rows logged before `CONTINUES`
("...the next run continues", "...not reached") are read as continuations.
The lines read: `Lesson rollout: 4 problems need you (see the RolloutLog
tab)`, `Lesson rollout didn't finish: 12 docs left; the next run continues`,
`Lesson rollout: the newest Canvas export is 9 days old; export a fresh
one`, and, in the overnight all-clear, `Lesson rollout: finished (3 runs)`.
The CAS signal also says while a course is still in shadow. `previewLessonRollout()` runs it once as
a dry run from the editor. The steps below still work by hand.

**Not on Canvas (2026-11-19).** Lessons were opening before their Canvas
assignment was posted. Each nightly run (not a catch-up) looks for every
lesson that is open or opens within `ROLLOUT_LEAD_DAYS` among the assignment
columns of its course's newest gradebook export (the course from the file's
name, else from its students' sections). A title holding at least 60% of the
lesson name's words is the lesson's (`canvasAssignmentFor_`, 00), so a
shortened or prefixed title still counts; a lesson in parts is one Canvas
assignment, named by the lesson. A lesson with none is a PROBLEM row, `not
on Canvas: …`, and a line in the CAS signal and the overnight email: `Not on
Canvas: The Bottom Line opens Thu Nov 20 and has no assignment in the 8177
Canvas export from Nov 18; post it in Canvas (or import the week's
cartridge), then export again`. A warning only: the lesson still opens. A
later run that finds it logs `CANVAS` ("on Canvas: <title>") and clears it.
The export is the only view of Canvas there is (no Canvas API: the
operator, 11-19), so the check is as fresh as the last export, and whether
an unpublished assignment shows in an export is not yet confirmed.

**Catching up (2026-10-29).** A run makes about 20 student docs before its
time budget. A run that stops short schedules `runLessonRolloutCatchUp` a
few minutes later, which does the same, until a run finishes (at most
`ROLLOUT_CATCHUP_MAX`, 12, a day). Enrollment goes to tonight's releases
first with the courses taking turns, each lesson getting an equal share of
the time left, and keeps a minute for the lesson docs and agendas. Running
`runLessonRollout()` from the editor starts the same chain. The overnight
email carries the same rollout lines as the signal.

**Hold a lesson.** `LessonSchedule`'s `release` column (2026-10-28): `HOLD`
keeps the rollout from seeding, enrolling or releasing that lesson, current
or upcoming, whatever its date; blank (or `AUTO`) is normal. The lesson is
still the one taught on its dates, and still gets its lesson doc and
agenda. Each run logs a `HOLD` row for it. The 📅 Lessons panel's
**Hold**/**Release** button sets it (`setLessonHold`, script 07);
`seedLessonSchedule()` adds the header to an older tab. Docs already shared
stay shared.
