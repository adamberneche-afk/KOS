# New courses from the VDOE framework: plan

**Status:** draft, 2026-10-22. Nothing built. Starts after Oct 30
([`PLAN_2026-10.md`](./PLAN_2026-10.md): CAS live by Oct 30, one feature
at a time), except Phase A if the operator wants it sooner.

**Asked for (2026-10-22):** a new course built from the VDOE SOL and
competency requirements; a teacher can **submit the course they want
built**; and it is **built so that teachers who adopt the platform later
can adapt it to their class**.

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

## Built for adoption

The operator's direction (2026-10-22): a course built today must serve
teachers who adopt the platform later, each adapting it to their own class.
So a course is two layers, kept apart:

| Layer | What it holds | Owned by | Where it lives |
|---|---|---|---|
| **The course library** | One entry per VDOE course, by its code: the tasks and duty areas, indicators, skill questions and SOL correlations, quoted as VDOE wrote them, with anything rebuilt marked | Shared: the same for every teacher of that course | The platform's data files, shipped in every release (public VDOE content: no staff or student data) |
| **A teacher's class** | Their adaptation: which competencies they teach and stress (tiers), the order and pacing, their lessons, prompts and warm-up anchors, how their Canvas names the course, their sections, periods and day pattern, settings such as feedback placement | The teacher | Their own Central Ledger, edited on their dashboard |

The rules that follow:
- **No course in the code.** No course numbers, course names, Canvas name
  patterns or lesson formats in a script. Today's 8175 and 8177 become the
  first two library entries plus the operator's class data.
- **A class never edits the library.** Two teachers adapting the same
  course don't affect each other; a library fix (a VDOE revision, a
  corrected indicator) reaches every class without overwriting what a
  teacher adapted.
- **A course is imported once.** A request for a course already in the
  library skips the import: the teacher just sets up a class from it.
- **One lesson format for every course.** 8175's lesson files and 8177's
  plan-plus-prompt converge on the format the lesson editor already writes.
- **Per-adopter settings are data**, as the backlog's adoption notes ask
  (`BACKLOG.md`, "Second teachers and adoption": the domain patterns and
  course numbers are hardcoded today).

## The plan

### Phase A: the library and the class list (no visible change)

- The library: `cas-ccps/data/courses/<code>/` (competencies, registry
  rows, SOL correlations), split from today's two-course files; the
  importers (22b, 32) and `importCourseData()` read it.
- The class list: a `Classes` tab (course code, the teacher's Canvas course
  name, name patterns, lesson format), read by one helper in 00 in place of
  the four hardcoded rules.
- The pacing guide's per-course columns become rows.
- Tests pin today's 8175/8177 behavior exactly.

### Phase B: the course request

Any teacher submits:
- the **course code and title** (the four-digit VDOE CTE course code);
- the **framework**: a link to the course's page on the CTE Resource Center
  (cteresource.org), or the framework `.docx` / Canvas cartridge as a Drive
  file;
- the term they want it for, the periods it meets, and a note.

Until other teachers have dashboards, a district-domain form writes the
request; once a teacher has adopted the platform, it is a panel on their
own dashboard. It lands as a row in a `CourseRequests` tab, with statuses
like `LessonDrafts`: `SUBMITTED`, `PROPOSED`, `RETURNED`, `ACCEPTED`,
`BUILT`, `LIVE`, `WITHDRAWN`. Teacher-level data only; the form says not to
put student information in the note. A course already in the library goes
straight to Phase D.

### Phase C: the library import (an agent session, as for lesson drafts)

"Import the course requests", by hand or on a Routine like "Lesson draft
import":
1. Read the request; fetch the framework (Drive connector for a file; the
   CTE Resource Center page if the session's network allows it, otherwise
   ask for the `.docx`).
2. Parse it into a library entry: every task, its indicators, skill
   questions and SOL correlations; anything rebuilt rather than read is
   listed, as the current `metadata` does.
3. Run the checks, open a draft PR, and write a proposal back to the
   request: the task count by duty area, the flagged tasks, a suggested
   lesson outline from the duty areas.
4. The library maintainer (C6) checks it against VDOE's text; the teacher
   accepts or returns the proposal. Only then is it merged and released.

### Phase D: adapt it to the class

On the teacher's dashboard, a class set up from a library course:
- the competencies they teach, with primary/secondary/tertiary emphasis;
- the order and pacing (the lesson schedule they already use);
- lessons through the lesson editor, starting from the outline if they
  want it, with the VDOE cross-reference it already shows;
- their Canvas course name, sections, periods and day pattern.

All of it is class data in their Ledger; none of it changes the library.

### Phase E: go-live

`LessonSchedule` dates, the Canvas section map, enrollment and warm-ups, as
for 8175 and 8177 today.

## Open decisions

| # | Decision | Leaning |
|---|---|---|
| C1 | **Who can submit.** *Decided 2026-10-22: any teacher, and built for teachers who adopt the platform later.* | A district-domain form until other teachers have dashboards; then a panel on each teacher's own |
| C2 | **What a teacher provides.** The CTE Resource Center link, the `.docx`, a cartridge, or any of them | Any; the `.docx` with standards correlations is the most complete source, as for 8175 |
| C3 | **When.** Phase A now, or everything after Oct 30 | All after Oct 30; Phase A is the safe first PR then |
| C4 | **Lesson outline.** Draft one from the duty areas for the teacher to approve, or leave lessons entirely to the teacher | Draft one; it is a proposal, approved like 8177's prompts |
| C5 | **Where an adopter's lessons live.** The operator's lessons are repo files built into 55b; an adopter has no repo | Class data in the teacher's Ledger, read by Apps Script; the operator's lessons move there too, with the repo keeping them as the example class. A change to how the lesson editor's import works (#245), so its own plan step |
| C6 | **Who maintains the library.** VDOE revises frameworks; adopters get library updates | The operator reviews library PRs for fidelity to VDOE's text; releases carry library updates and never touch class data |

## What to keep from today's rules

- The library is changed only through a reviewed PR; a request changes
  nothing students see until it is accepted, merged and released.
- Competency text is VDOE's, quoted as written; anything rebuilt is marked.
- Student data never enters a request, the library or the import (the
  student-data scan runs on the PR).
- Check CI on the PR's head before merging.
