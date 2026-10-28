# Lesson plan sources (8175 / 8177)

Markdown copies of the teacher's lesson-plan Google Docs, first copied 2026-10-07.
`tools/cas-ccps/build-lesson-assignments.js` turns them into assignments, and
`build-canvas-cartridge.js` into the Canvas cartridges. The student side of every lesson,
in both courses, is its **prompt file** (`8175/prompts/L<NN>.md`, `8177/prompts/<slug>.md`):
`## Prompt` (the task, its first line "Assignment: …"), and when it has them `## Background`,
`## Key terms`, `## Example`, `## Warm-up` and `## Vocabulary`. A lesson is built only once its
prompt file says `status: approved`. The 8175 prompt files were moved out of each lesson copy's
CANVAS ASSIGNMENT TEXT and Bell Ringer on 2026-10-28, wording unchanged (only the "Title:"
label went); those sections stay in the copies as the Drive docs have them, but the builder
no longer reads them: edit the prompt file. Edit the Drive doc or these files deliberately; do not reformat, and
keep the two in step: in October 2026 the 8177 files were edited in the repo (competency
lines re-matched to the 2025 task list, lessons expanded) and the Drive docs were updated
to match on 2026-10-12. Two 8177 lessons were written in the repo first:
`the-cloud-behind-the-game.md` (its Drive doc was created from it) and
`game-day-takeover.md` (likewise). The 8175 lessons' competency lines were re-matched to
the 2025 task list on 2026-10-12 in the repo, and the Drive docs were updated to match the
same day.

| Folder | Course | Drive folder ID | Contents |
|---|---|---|---|
| `8175/` | 8175 Sports & Entertainment Marketing | `1BksIMpLiRAt4RdEam3mKIYExT8NZGusa` | `L01.md`–`L36.md`, one per "8175 \| Qn \| … \| Lesson NN: …" doc (teacher instructions + Canvas student-view assignment text), `prompts/L01.md`–`L36.md` (the student side, written in the repo 2026-10-28), and `COMPETENCY_TRACKER.md` (written in the repo; no Drive copy) |
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
(`meta/SPRINT_LESSON_DOCS_2026-11.md`): an 8175 lesson's warm-up (its prompt file's), Hook, task and
Checkout Slip; an 8177 lesson's timed Instructional Sequence steps ("B. The Bias Bootcamp (15
Minutes)", or "- **Step:** (5 mins)"), split by "Day 1" / "Day 2" headings when it has them. Each
block gets a mode (Chromebooks out, listening, discussion, writing) from its words. Write a step's
minutes in its heading for the plan to use them.

`PARTS.json` (2026-10-27) splits a lesson into **parts**, one work file each, unlocked in order
(`meta/STUDENT_WORK_PLAN_2026-10.md`, Phase 3). The generator makes each part an assignment of its
own in 55b's `LESSON_PARTS` ("<lesson>-P2"): its tiers and criteria from the file, its task from the
prompt's opening plus its own "Part n:" paragraphs and vocabulary (Part 1 also carries the
background, key terms and example). It refuses a part with no primary, a tier that isn't one of the
lesson's competencies, or a lesson competency no part covers. First lesson: 8177 Market Research
(Appendix B, approved 2026-10-27).

`PARTS_DRAFTS.json` (2026-10-28) holds the other 34 multi-part lessons' splits, drafted for the
teacher's approval in `PARTS.json`'s shape, each with its status, why and concerns. The builder
never reads it. `node tools/cas-ccps/check-parts-drafts.js` builds every draft as if it were in
`PARTS.json`; `node tools/cas-ccps/render-parts-drafts.js` writes the review copy,
`meta/LESSON_PARTS_DRAFTS_2026-10.md`. Approving a lesson moves its entry, unchanged, into
`PARTS.json`.
