# Canvas roster import (script 52)

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

Warm-ups, profiles and dashboards only see a student with a Ledger row, and
the only way in used to be the intake form. `52_CanvasRosterImport.js`
(Central Ledger) enrolls a whole roster from Canvas gradebook exports:

1. In each Canvas course, Grades → Export → Export Entire Gradebook, and
   upload the CSV to your Drive. The import reads any `.csv` with "Grades" in
   its name from the `TEACHER_FOLDER_ID` folder if Central Ledger has that
   property, otherwise from anywhere in your own Drive (the setup wizard
   writes `TEACHER_*` properties into the Unified Manual project, not this one).
   Before any assignment is LIVE you can run `prepareRosterSections()`: it
   fills the `CanvasSectionMap` tab from the exports and logs each section's
   student count (and, once mapped, its period and course). It needs no
   Config ID and enrolls no one.
2. Set the Script Property `ROSTER_CONFIG_ID` to a LIVE assignment's Config ID
   (the editor's Run button can't pass an argument; an ID passed in wins).
   Then `previewRosterEnrollment()` against that assignment lists
   who would be enrolled and fills the `CanvasSectionMap` tab with every
   Canvas section; put each section's class period next to it. A section
   code ending `-P01]` fills in period 1 for you; check it and correct it
   in the tab if it's wrong.
3. `applyRosterEnrollment()` enrolls each student through
   `intakeStudent_()` (02), the same function the intake form uses: their
   doc for that assignment, shared with them and you, and a Ledger row.

It reads only Student, SIS Login ID and Section, and refuses any login that
isn't a district student account. It enrolls only students whose section
is in the assignment's course (TeacherMatrix CourseName, 8175 or 8177): the
section's own name decides ("...MARKETING... [74-C8175H-P01]"), because both
courses can meet in one period, and a section without one takes its period's
course. Run it once per course with that course's Config ID; the rest are
skipped as `OTHER_COURSE`. It skips students who already have a workspace
for this assignment (an earlier unit's doesn't count), as recorded in the
`StudentAssignments` tab, and reports, never removes, students who left the
course. A workspace made before that tab existed is skipped as
`UNRECORDED_WORKSPACE` until `previewRosterRepair()` / `repairRosterDuplicates()`
records its assignment (from the doc's name and the TeacherMatrix), keeping one
workspace per student and archiving the duplicates that re-runs made. Since
2026-10-31 it opens every duplicate first (KOS Audit Docket III item 18): the
one kept is one with the student's work (a submit or check on its Ledger row,
or writing below the response line), and a duplicate that also has work, or
that can't be opened, is never trashed; it gets a Notes line for the teacher.

A student listed in the `PeriodOverride` tab (`student_account`, `period`)
takes that period whatever their Canvas section, in enrollment, the nightly
rollout and `applyPeriodRelabel()`. It exists for a period whose groups share
one Canvas section (period 3's `3-Odd` and `3-Even`), so the export needs no
hand tagging. `previewPeriodOverrideSeed()` / `seedPeriodOverrides()` fill it
from the Ledger with each student whose period isn't the one their section
code gives; run them while the Ledger's periods are right. A student who
joins such a period later needs a row typed in by hand.
