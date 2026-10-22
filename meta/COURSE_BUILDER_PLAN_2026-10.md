# New courses from the VDOE framework: plan

**Status:** draft, 2026-10-22. Nothing built. Starts after Oct 30
([`PLAN_2026-10.md`](./PLAN_2026-10.md): CAS live by Oct 30, one feature
at a time), except Phase A if the operator wants it sooner.

**Asked for (2026-10-22):** a new course built from the VDOE SOL and
competency requirements, and a teacher can **submit the course they want
built**.

## How 8175 and 8177 were built

| What | Where | Made from |
|---|---|---|
| Competencies: task, duty area, indicators, skill questions, SOL correlations | `cas-ccps/data/CompetencyRubrics.json` | The Canvas cartridges and VDOE's "Printable Version with Standards Correlations" `.docx` (`data/sol-correlations/`), with gaps rebuilt from the VDOE framework and flagged in its `metadata` |
| The registry the Ledger reads | `cas-ccps/data/CompetencyRegistry.csv` | The same |
| Units and objectives | `curriculum/PacingGuide_CAS_Context.json` | The pacing guide, one column per course |
| Lessons and assignments | `curriculum/lessons/<course>/`, `55b_LessonAssignmentData.js` | The teacher's lesson docs, through `build-lesson-assignments.js` |
| Canvas modules | `canvas-cartridges/<course>.imscc` | `build-canvas-cartridge.js` |

The competency import is what a new course needs first, and its format
already exists. Lessons after that go through the lesson editor (#245,
#246): a new course's lessons are written there like any other.

## What assumes two courses

1. **Course detection, four copies of one rule:** `warmUpCourseCode_` (00,
   also behind `ledgerRowCourseCode_`), `courseCodeFromName_` (24) and
   `_cybCourseCode_` (51) each match "8175 or marketing" and "8177 or
   management". A third course is invisible to warm-ups, enrollment, the
   Feedback panel and the period rules.
2. **The pacing guide's columns** (31): `objective_8175`,
   `competency_ids_8177`, and so on.
3. **The builders and lesson data** (`build-unit-rubrics.js`'s `COURSES`,
   `build-lesson-assignments.js`, 53b, 55b): two lesson formats, one per
   course.
4. **Smaller:** `COMPETENCY_TIERS.json`'s course keys, the cartridge
   builder, the Flow prompts' course wording, `COURSE_DATA_EXPECTED` (51).

## The plan

### Phase A: a course list (no visible change)

One `COURSES` table in 00 (code, title, name patterns, lesson format), and
the four helpers read it. The pacing guide's per-course columns become
rows. Tests pin today's 8175/8177 behavior. After this, adding a course is
data, not code.

### Phase B: the course request (what a teacher submits)

A teacher submits:
- the **course code and title** (the four-digit VDOE CTE course code);
- the **framework**: a link to the course's page on the CTE Resource Center
  (cteresource.org), or the framework `.docx` / Canvas cartridge as a Drive
  file;
- the term they want it for, the periods it meets, and a note.

It lands as a row in a new `CourseRequests` tab on the Central Ledger, with
statuses like `LessonDrafts`: `SUBMITTED`, `PROPOSED`, `RETURNED`,
`ACCEPTED`, `BUILT`, `LIVE`, `WITHDRAWN`. Teacher-level data only; the form
says not to put student information in the note.

### Phase C: the import (an agent session, as for lesson drafts)

"Import the course requests", by hand or on a Routine like "Lesson draft
import":
1. Read the request; fetch the framework (Drive connector for a file; the
   CTE Resource Center page if the session's network allows it, otherwise
   ask for the `.docx`).
2. Parse it into `CompetencyRubrics.json` / `CompetencyRegistry.csv` rows
   for the new course: every task, its indicators, skill questions and SOL
   correlations. Anything rebuilt rather than read is listed, as the
   current `metadata` does.
3. Add the course to Phase A's list, run the builders and tests, open a
   draft PR, and write a proposal back to the request: the task count by
   duty area, the flagged tasks, a suggested lesson outline from the duty
   areas.
4. The teacher reviews on the dashboard and Accepts or Returns. Only an
   accepted course is merged and pushed; `importCourseData()` then loads it
   into the Ledger.

### Phase D: lessons and go-live

The lesson editor's **+ New lesson** for the new course (with the VDOE
cross-reference it already shows), then `LessonSchedule` rows, the Canvas
section map, enrollment and warm-ups, as for 8175 and 8177.

## Open decisions

| # | Decision | Leaning |
|---|---|---|
| C1 | **Who can submit.** The Teacher Dashboard lets in one teacher (`TEACHER_EMAIL`, `_isAuthorizedTeacher_`); other teachers have no dashboard until the second-teacher work (`BACKLOG.md`, "Second teachers and adoption"; D5) | A request form any teacher in the district domain can submit (a Google Form or a small web app writing to `CourseRequests`), and the operator's dashboard to review and accept. A request for another teacher's course is built, but taught by them only after the second-teacher work |
| C2 | **What a teacher provides.** The CTE Resource Center link, the `.docx`, a cartridge, or any of them | Any; the `.docx` with standards correlations is the most complete source, as for 8175 |
| C3 | **When.** Phase A now, or everything after Oct 30 | All after Oct 30; Phase A is the safe first PR then |
| C4 | **Lesson outline.** Draft one from the duty areas for the teacher to approve, or leave lessons entirely to the teacher | Draft one; it is a proposal, approved like 8177's prompts |

## What to keep from today's rules

- The repo stays the one source: a request changes nothing students see
  until a PR is accepted, merged and pushed.
- Competency text is VDOE's, quoted as written; anything rebuilt is marked.
- Student data never enters a request or the import (the student-data scan
  runs on the PR).
- Check CI on the PR's head before merging.
