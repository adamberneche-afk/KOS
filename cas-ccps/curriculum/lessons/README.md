# Lesson plan sources (8175 / 8177)

Markdown copies of the teacher's lesson-plan Google Docs, first copied 2026-10-07.
`tools/cas-ccps/build-lesson-assignments.js` turns them into assignments (8177 lessons
only with an approved `8177/prompts/<slug>.md`), and `build-canvas-cartridge.js` into the
Canvas cartridges. Edit the Drive doc or these files deliberately; do not reformat, and
keep the two in step: in October 2026 the 8177 files were edited in the repo (competency
lines re-matched to the 2025 task list, lessons expanded) and the Drive docs were updated
to match on 2026-10-12. Two 8177 lessons were written in the repo first:
`the-cloud-behind-the-game.md` (its Drive doc was created from it) and
`game-day-takeover.md` (likewise). The 8175 lessons' competency lines were re-matched to
the 2025 task list on 2026-10-12 in the repo, and the Drive docs were updated to match the
same day.

| Folder | Course | Drive folder ID | Contents |
|---|---|---|---|
| `8175/` | 8175 Sports & Entertainment Marketing | `1BksIMpLiRAt4RdEam3mKIYExT8NZGusa` | `L01.md`–`L36.md`, one per "8175 \| Qn \| … \| Lesson NN: …" doc (teacher instructions + Canvas student-view assignment text), and `COMPETENCY_TRACKER.md` (written in the repo; no Drive copy) |
| `8177/` | 8177 Sports, Entertainment, and Event Management | `1O5T04ktNN5GWi3fDnpKTbNWjW0Abn73U` | `PACING_GUIDE.md`, `COMPETENCY_TRACKER.md`, and one `<slug>.md` per "Lesson Plan: <Name>" doc |

Each file starts with an HTML-comment header giving the source Google Doc ID, the exact
doc title, and the copy date (a lesson written in the repo says so instead). The body below the header is the Drive export text as
returned (escape characters such as `\!`, `\#`, `\[` kept as-is).

Not copied: the "WINTER OLYMPICS 2026" slide deck and "LEADERHUB_MANIFEST_IDS" doc in the
8175 folder. The 8177 folder has two identical "Lesson Plan: Employee Handbook & Operations"
docs; only one copy is kept (`8177/employee-handbook-operations.md`).

`VIDEO_LINKS.json` holds the videos a lesson's student task tells students to watch (8175 L06 and
L34 today), keyed by lesson (`8175-L06`), each `{ "title": …, "url": "https://…" }`. The generator
adds a `- Video: <title> (<url>)` line under the task's "Watch" line; new student docs and the Canvas
cartridge make it a link. Docs already made get it from `previewVideoLinkRefresh()` /
`applyVideoLinkRefresh()` (Central Ledger, 53). An empty list is a lesson still waiting on its link,
and a lesson whose task says to watch a video must be listed (`lesson-assignments.test.js`).

Each lesson's **class plan** (`plan` in `55b_LessonAssignmentData.js`, 2026-10-27) is drafted by the
generator from the lesson's own sections, for the teacher's lesson doc and the daily agenda
(`meta/SPRINT_LESSON_DOCS_2026-11.md`): an 8175 lesson's Bell Ringer (the warm-up), Hook, task and
Checkout Slip; an 8177 lesson's timed Instructional Sequence steps ("B. The Bias Bootcamp (15
Minutes)", or "- **Step:** (5 mins)"), split by "Day 1" / "Day 2" headings when it has them. Each
block gets a mode (Chromebooks out, listening, discussion, writing) from its words. Write a step's
minutes in its heading for the plan to use them.
