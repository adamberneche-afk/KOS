# The teacher's lessons and the LessonSchedule tab

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

Since 2026-10-07 the courses run on the teacher's own lessons, not the
generated pacing-guide units. `curriculum/lessons/` holds verbatim copies of
the two Drive lesson folders (8175: Lessons 01–36; 8177: the lesson plans and
the 8177 pacing guide). One 8177 lesson, `the-cloud-behind-the-game.md`
(data centers and AI; competencies 44, 48, 55, 57, 64, 65), was written in
the repo first; its Drive copy was created from it. `game-day-takeover.md`
(running a Cavalier Shop pop-up and thanking the team; competencies 99, 100)
was also written in the repo first, and its Drive copy was created from it. `tools/cas-ccps/build-lesson-assignments.js` turns
them into `scripts/55b_LessonAssignmentData.js`:

- **Both courses** keep the student side in a prompt file, used only once
  the teacher approved it (`status: approved`): `lessons/8175/prompts/L<NN>.md`
  or `lessons/8177/prompts/<lesson>.md`, with the task (`## Prompt`), the
  warm-up seed (`## Warm-up`) and the vocabulary (`## Vocabulary`). The 8175
  files were moved out of each lesson's "Canvas assignment text" and bell
  ringer on 2026-10-28, wording unchanged; the rubric is still the lesson's
  competencies plus its grading tip.
- **8177:** the plans have no student assignment, so the prompt files were
  drafted in the repo. A prompt file (either course) can also carry `## Background`, `## Key terms` and
  `## Example`: the background a student needs, in plain classroom language.
  They come first in the student's doc and in Canvas, under those headings,
  with the task after them under "Your Task". A file marked `status: draft`
  is not used; the teacher reviews drafts in batches, in pacing-guide order.
- **Competency numbers:** the lesson docs number competencies their own way,
  and many name a different competency in the state list. A number counts
  only when the state wording matches the doc's (or `COMPETENCY_MAP.json`
  maps it); the rest stay as rubric criteria in the doc's words with no ID,
  listed in `lessons/COMPETENCY_REVIEW.md` for the teacher to map. The 8177
  lessons were re-matched to the 2025 state task list (12163-II) in October
  2026 and cite its numbers and wording; `lessons/8177/COMPETENCY_TRACKER.md`
  shows which tasks the lessons cover. The 8175 lessons were re-matched the
  same way on 2026-10-12 (the repo's 113 tasks match the state's 2025
  Student Competency Record); `lessons/8175/COMPETENCY_TRACKER.md` shows
  their coverage: all 113 tasks (106 in lessons, 7 through DECA and
  work-based learning).

Dates come from the **LessonSchedule** tab in the Central Ledger, which the
teacher edits: one row per lesson, a start date, and a lesson runs until the
next one starts. `resolveUnitForCourseDate_()` (31) uses it before the pacing
guide, so the lesson builder, warm-ups and assignment seeder follow it.

The Teacher Dashboard's **📅 Lessons** panel (07, since 2026-10-21) shows the
tab by course: each lesson's status (current, upcoming, taught, no date),
warnings (a date that can't be read, a lesson starting before one listed
above it, two lessons on one date), and what the last nightly rollout (58)
did for it, from `RolloutLog` (problems in red; a step the time budget
stopped, `CONTINUES`, in grey: the next run picks it up). A start date changes there one at a time, is
saved only as a whole date (on Enter or leaving the box; each row says
"Saved ✓" or why not), and is written to the tab as text. A change the rollout acts on soon (within
its 2-day lead, in the past, or on the current lesson) asks to be
confirmed first, and a date changed in the sheet since the panel loaded is
never overwritten. Typing in the tab still works.

Each lesson there also has an **Edit** button (65, since 2026-10-21; phase 1
of `archive/2026-27-Q1/meta/LESSON_AUTHORING_PLAN_2026-10.md`). The editor starts from the
lesson as students get it (55b, now also in the Teacher Dashboard project):
the student task, warm-up anchor, objective, vocabulary, competencies and
their tiers, each competency shown with its VDOE task, standard, indicators
and skill questions (the CompetencyRubrics tab), and the course's tasks that
no lesson lists. A change is a draft in the Central Ledger's `LessonDrafts`
tab, never the lesson itself. **Submit for import** works only with every
required field filled (the student task, warm-up anchor, objective, a reason,
a change) and tiers that pass the builder's rules. An import (an agent
session) writes the repo files on a branch and a proposal back; the teacher
who submitted the draft accepts it or returns it with a note, and only an
accepted draft is merged and pushed. A **+ New lesson** button by each
course's heading opens the same editor empty (title, objective, activity,
the student task or a brief for it, warm-up anchor, vocabulary,
competencies and tiers); the import makes the lesson files, and after the
push `seedLessonSchedule()` adds its schedule row. The import's steps are in
`docs/LESSON_IMPORT_PROCEDURE.md`; its mechanical half is
`tools/cas-ccps/import-lesson-drafts.js`.

| Function | What it does |
|---|---|
| `seedLessonSchedule()` (55) | Adds a row per lesson not yet in the tab, in teaching order, with its Config ID (`CAS-8175-L06`). Never changes a date you typed. |
| `seedWarmUpPlan()` (55) | Adds the `WarmUpPlan` tab's planned rows (date, course, lesson_key): a lesson whose warm-up seed is used that day instead of the current lesson's. The repo plans the week of 2026-10-19 as a first-quarter review (8175 L01–L05; 8177's five Quarter 1 lessons). Never changes a row you edited; delete a row to fall back to the current lesson. Only the warm-up changes, not the day's lesson or assignment. |
| `previewAssignmentSeed()` / `seedAssignments()` (53) | With no `SEED_UNITS`, seeds today's assignment and any lesson starting in the next 7 days. `SEED_UNITS` also takes lesson keys (`8175-L06`). **A set `SEED_UNITS` wins over the schedule:** left at `S1-U1` it seeds nothing new (seen live 2026-10-07), so delete it once its assignments are LIVE. |
| `previewArchiveAssignment()` / `archiveAssignment()` (54) | Retires the assignment in the Script Property `ARCHIVE_CONFIG_ID`: its student workspaces are archived in the Ledger and their docs trashed (restorable from Drive's trash for 30 days), and its TeacherMatrix row is set ARCHIVED. **One Config ID per run:** a comma-separated list matches nothing and reports 0. |
