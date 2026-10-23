# Lesson editing and writing from the Teacher Dashboard: plan

**Status:** decided 2026-10-21 (the operator's answers are under "Decided"
below). Phases 1 and 2 are built (2026-10-21, #245 and #246; see "Phases" below):
the Teacher Dashboard's lesson editor (`65_LessonDrafts.js`, pinned by
`tests/cas-ccps/lesson-drafts.test.js`), the import tool
(`tools/cas-ccps/import-lesson-drafts.js`, `tests/tools/import-lesson-drafts.test.js`)
and its procedure (`cas-ccps/docs/LESSON_IMPORT_PROCEDURE.md`). They were
due by **Fri Oct 30**, in [`PLAN_2026-10.md`](./PLAN_2026-10.md)'s week of
Oct 26.

**Asked for (2026-10-21):** from the Teacher Dashboard, (1) see each lesson's
rollout status, (2) edit an existing lesson, (3) write a new one. Item 1
shipped with the lesson schedule panel (#243: the **📅 Lessons** panel's
"Last rollout" column). This plan covers 2 and 3.

## How a lesson becomes what students see today

Six places hold a lesson, and the repo generates most of them:

| Where | What | Made by |
|---|---|---|
| The teacher's Drive lesson doc | The lesson as the teacher wrote it | The teacher |
| `cas-ccps/curriculum/lessons/8175/L<NN>.md`, `8177/<slug>.md` | A copy of that doc, kept in step by hand (its header names the Doc ID) | Copied, then edited deliberately |
| `8177/prompts/<slug>.md` | 8177's student assignment, used only once `status: approved` | Drafted in the repo, approved by the teacher |
| `COMPETENCY_TIERS.json` | Each assignment's primary, secondary and tertiary competencies | Drafted, approved by the teacher (2026-10-20) |
| `cas-ccps/scripts/55b_LessonAssignmentData.js` | The assignment data Apps Script reads: prompt, milestones, definition of done, warm-up anchor, vocabulary, competency IDs, the teaching order | `build-lesson-assignments.js` |
| `canvas-cartridges/8175.imscc`, `8177.imscc` | The Canvas modules | `build-canvas-cartridge.js` |

Then: a push (`run.js`) carries 55b to the Central Ledger;
`refreshAssignments()` brings LIVE assignments up to it; the cartridges are
re-imported by hand; a new lesson needs a `LessonSchedule` row
(`seedLessonSchedule`) and a date.

What protects it: the builders throw when a tier names a competency the
lesson doesn't list or misses one it does; the tests fail while 55b or a
cartridge is out of date; the student-data scan; review in a PR. On
2026-10-20 this caught real gaps (the "tiers turned up" items, #230).

**The constraint that shapes every option:** Apps Script reads lessons from
55b, a file the repo generates. A dashboard can't change what students get
without either going back through the repo (build, checks, PR, push) or
adding a second, live source the repo doesn't see.

## Three ways to do it

### A. Drafts on the dashboard, imported through the repo (recommended)

The dashboard is where the teacher writes; the repo stays the one source.

1. **Edit:** the 📅 Lessons panel gets an **Edit** link per lesson. It opens
   the lesson's fields in a form, filled from 55b (the dashboard project gets
   a copy of 55b, or reads it from a Ledger tab the push fills): student
   prompt, warm-up anchor, vocabulary, objective, and the tiers. Saving
   writes a row to a new `LessonDrafts` tab on the Central Ledger: lesson
   key, field, old text, new text, a note, status `DRAFT`, then `SUBMITTED`.
2. **New:** a **New lesson** form takes the course, a title, the
   competencies (picked from the registry), the objective, the activity and
   a short brief. It is saved the same way, as one draft.
3. **Import (an agent session):** the operator says "import the lesson
   drafts". Claude reads `LessonDrafts` through the Google Sheets connector,
   writes the repo files (the lesson `.md`, an 8177 prompt file with
   `status: approved <date>`, the tiers), runs both builders and the tests,
   updates the Drive lesson doc through the Docs connector (as done for
   #230 on 2026-10-21), and opens a PR. For a new lesson it also drafts what
   the brief leaves out (the prompt, the background, milestones through the
   builder), and the PR says which parts are the teacher's and which are
   drafted.
4. **Merge and push** as today; the panel marks each draft `MERGED`, with its PR.
   A new lesson appears in 📅 Lessons after `seedLessonSchedule` (a step
   the import's PR lists).

- **For:** every check still runs; the Drive doc, the repo, 55b and the
  cartridges stay in step; nothing reaches a student until a merge and a
  push; small to build (a form, a tab, the import procedure written down).
- **Against:** a change is live the next push, not at once; the import needs
  an agent session.
- **Size:** edit form and tab, about one PR of the size of #243; the new
  lesson form, one more; the import procedure, a doc plus a small script
  for the parts that are mechanical (draft rows into repo files).

### B. Edit the Drive doc; import from Drive

The teacher keeps editing in Google Docs, as now. The panel's **Edit**
link opens the lesson's Drive doc; a **Ready to import** button records a
request. Import is the same agent step as A, reading the Drive doc instead
of a tab.

- **For:** no new editor at all; the Drive doc is where the teacher already
  works.
- **Against:** tiers and 8177 prompts have no Drive home today; the import
  has to find what changed in a whole doc, which is less exact than a field;
  a new lesson still needs a form or a blank template doc.
- **Size:** the smallest: a link and a button.

### C. Live overrides read by Apps Script

A `LessonOverrides` tab that 55 reads over 55b, field by field, so a saved
edit reaches the next student at once.

- **For:** immediate.
- **Against:** a second source the repo never sees: no tier check, no
  milestone rebuild (the milestones and definition of done are generated
  from the prompt and tiers), the cartridges and the Drive doc drift, and
  an edit in the middle of a lesson changes the criteria for work already
  submitted. Undoing it means finding the row.
- **Use only** for the one field where speed matters and nothing is built
  from it: a warm-up anchor for tomorrow. Even there, `WarmUpPlan` already
  swaps a day's warm-up.

**Recommendation: A for structured edits and new lessons, with B's Drive
link kept for reading the full lesson.** C only if a real case for an
immediate edit turns up.

## Writing new lessons with AI help

Two places the drafting could run:

- **In the import session (Claude), as in A.3.** The teacher's brief goes in
  the draft; the PR holds the drafted lesson for review, like the 8177
  prompts drafted 2026-10-11 and approved 2026-10-12. Nothing new to run
  on the Google side.
- **On the dashboard (Gemini, through a Studio flow or the `DIRECT_GEMINI`
  path).** A **Draft it for me** button writes a draft back into the form
  for the teacher to edit before saving. Quicker to iterate, but it is one
  more Studio flow to keep running, with the same wiring problems seen on
  2026-10-21 (no Drive sources; the prompt echoed back).

**Recommendation:** start in the import session. Add a dashboard button
later if drafting turns out to be the slow part.

## Decided (the operator, 2026-10-21)

1. **Option A**, with the Drive doc linked for reading the whole lesson.
2. **Editable fields, cross-referenced to the VDOE curriculum.** The form
   edits the student prompt, warm-up anchor, vocabulary, objective,
   competencies and tiers, and shows each competency with its VDOE task
   (`CompetencyRegistry.csv`: the task text and duty area) and what
   demonstrates it (`CompetencyRubrics.json`: the demonstration standard,
   indicators, skill questions and SOL correlations). Picking competencies
   is from that list only. The form and the import both check what the
   builder checks (every tier names a competency the lesson lists, and every
   listed competency has a tier) and show the course's coverage
   (`COMPETENCY_TRACKER.md`'s view: which tasks the course still lacks).
3. **A routine and a manual trigger.** The import runs on a schedule (a
   Routine, an agent session each evening) and on demand (a **Submit for
   import** button that also asks for one now, or the operator saying so).
   **A draft is imported only when every required field is filled**: the
   form checks on Submit, and the import checks again and leaves an
   incomplete draft at `SUBMITTED` with the missing fields named.
4. **Due by next week's deadline, Oct 30.** Phases 1 and 2 go in the week
   of Oct 26, beside the dashboard walk-through and grading; the plan's
   "changes stay small" for that week gives way to this, by the operator's
   call.
5. **Drafted before import; edits proposed during it; accepted by the
   submitter.** The teacher writes the draft on the dashboard. The import
   proposes edits and formatting (the repo's lesson shape, wording against
   the VDOE task, a missing piece drafted from the brief) and writes them
   back as a proposal beside the draft. The teacher who submitted it reviews
   the proposal on the dashboard and **accepts** it or sends it back with a
   note; only an accepted draft goes on to its PR's merge and the push.

### The draft's life, with these decisions

| Status | Set by | Means |
|---|---|---|
| `DRAFT` | The teacher, saving | Work in progress; never imported |
| `SUBMITTED` | **Submit for import**, only with every required field | Waiting for the next import (the evening Routine or a manual one) |
| `PROPOSED` | The import | The repo files are written on a branch and the checks ran; the proposed edits are shown beside the draft, with the PR link; nothing is merged |
| `RETURNED` | The submitter | Sent back with a note; the next import answers it |
| `ACCEPTED` | The submitter | The proposal is the lesson; the PR is ready for the operator's "merge" |
| `MERGED` (the PR in `pr_url`) | The import, after the merge | Live after the next push (and `refreshAssignments()` for a lesson already LIVE; `seedLessonSchedule` and a date for a new one) |

**Required fields.** An edit: the lesson, at least one changed field and a
reason. A new lesson: course, title, objective, activity, the student task
(or a brief for it), the warm-up anchor, vocabulary, the competencies, and a
tier for each. An 8177 lesson's prompt is `status: approved <date>` once
the submitter accepts.

## Phases

| Phase | What | Due |
|---|---|---|
| 0 ✓ | Rollout status per lesson | Shipped, #243 |
| 1 ✓ | Edit existing lessons: the form with the VDOE cross-reference, `LessonDrafts`, Submit with the required-field check, the proposal view with Accept / Return, the import procedure (manual first) | Built 2026-10-21, #245 |
| 2 ✓ | New lessons through the same form and states; the evening Routine for the import ("Lesson draft import", about 6 p.m. Eastern, the operator's time) | Built 2026-10-21, #246 |
| 3 (if wanted) | Draft-it-for-me on the dashboard | After Oct 30 |

Build order inside phase 1: the `LessonDrafts` tab and its server functions
with tests; the form; the VDOE lookup;
the proposal view; then the import, written as a procedure plus a script for
the mechanical part (draft fields into repo files, then the builders). The
VDOE lookup needs no new data: the Central Ledger's `CompetencyRegistry` and
`CompetencyRubrics` tabs hold both files, and 32's `_loadAllRubrics_`
already reads the second from the Teacher Dashboard project.
## What to keep from today's rules

- Teacher-only (`_isAuthorizedTeacher_`); lessons are teacher-level data,
  but a draft's free text could name a student. The import runs the
  student-data scan, and the form says not to.
- A lesson being taught keeps its criteria: the import's PR says when an
  edited lesson is current or has submissions, and `refreshAssignments()`
  is a step the operator chooses.
- 8177 prompts stay `status: approved <date>`: a draft saved from the
  dashboard counts as the teacher's approval of the text they wrote, not of
  text the import drafted.
- The Drive doc stays in step with the repo (the import updates it).
