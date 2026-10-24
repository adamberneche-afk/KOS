# The student's side of an assignment: plan

**Status:** proposed 2026-10-24, from the operator's direction (under
"Asked for" below). Nothing is built. Open decisions are listed at the end.
After Oct 30 unless the operator moves a phase into the week of Oct 26
([`PLAN_2026-10.md`](./PLAN_2026-10.md) keeps that week to small changes).

## Why

The goal: the student's doc and the Submit step should give us what we
need to understand a student's **perspective, knowledge, process and
applied judgement**, not just a finished paragraph.

On 2026-10-24 two new student docs were rendered from `stampDocument_` (02)
with a made-up student and the real lesson text (8175 L06, 8177 Venue
Market Research & Survey Design; `FEEDBACK_AS_COMMENT=all`). Read against
the lesson data (`55b_LessonAssignmentData.js`, 67 lessons):

- **One response box for every part.** 35 of 67 lessons have numbered parts
  (8177: 30 of 31; 8175: 5). Every part's answer lands in the same six
  lines, so nothing ties an answer to its part or its competency.
- **Only the product is captured.** Nothing asks how the student worked,
  what they weighed or how sure they are. Process shows only in the doc's
  revision history, which nothing reads (the `revisionProbe` in
  [`CAS_BUG_HANDOFF_2026-10-16.md`](./CAS_BUG_HANDOFF_2026-10-16.md)'s
  appendix was never built).
- **Evidence outside the doc.** 17 lessons send the student to Forms,
  Slides, Sheets, Canva and similar, often ending "paste the link". Flow 2
  is handed the doc (FlowInput carries the doc, not the work), so a pasted
  link is only a URL to it.
- **Missing material.** All 8 lessons that mention videos have no link in
  the task (8175 L06: "Watch the provided videos").
- **The criteria are hard to find.** "What your work needs to show" is
  plain 8 pt text like the rest, and its items are VDOE competency titles
  ("Demonstrate professionalism"), not checks a student can apply.

## Asked for (the operator, 2026-10-24)

1. **Chunk multi-part lessons**, maybe into individual days. Several
   returns inside one doc "muddies the water" and makes the right text
   harder to pull out for inference.
2. **A process requirement on Submit.** Before a submission goes in, the
   student answers a couple of questions about their process: what they
   were thinking, how they went about it.
3. **A revision statement after feedback.** Before resubmitting after
   feedback, the student says what they will change and why, based on the
   feedback.
4. **Gate the feedback on the process.** Feedback should take the process
   into account, not just the product.

## Proposal

### 1. One doc per part (a "step")

Each part of a multi-part lesson becomes its own step: its own ConfigID
(`CAS-8177-<slug>-P2`), doc, Ledger row, Submit and feedback, released on
its own day.

Why not several returns in one doc: every reader of a response (01, 03, 13,
37 and Flow 2's Studio step) takes the text between `── YOUR RESPONSE BEGINS
HERE ──` and `[CONFIG_ID:` as one answer to one task. One doc per step keeps
that rule, so a step's evidence, competencies and feedback stay its own.

What it costs:
- **More docs.** 67 docs per student a year becomes 171 (one-part lessons
  stay one doc; the rest split 2–6 ways). Rollout, sharing and the Ledger
  grow with it.
- **The lesson data splits.** `build-lesson-assignments.js` splits a task
  on its "Part n:" headings into steps, each with its own milestones and
  competency tiers (`COMPETENCY_TIERS.json` is per lesson today). The
  shared lead-in (background, key terms, example) goes into Part 1's doc and
  is linked from the rest.
- **Parts depend on each other.** 8177 Part 3 explains Part 2's questions;
  Part 4 assumes Part 2's form. A later step's doc links the earlier step's
  doc, and Flow 2 is told it may read that doc for context.
- **Schedule and dashboards.** `LessonSchedule` and the rollout (55, 58) gain
  a step date; both dashboards group a lesson's steps under it ("Part 2 of
  5"). The Canvas cartridges keep one module per lesson with one item per
  step.

### 2. "How I worked" on Submit

Submit on the Student Dashboard opens a short form before anything is
queued. Two or three questions, each needing a short real answer (say 10
words, as the warm-up extra-credit reply already counts them, 25):

- What did you do first, and why?
- What was the hardest choice you made here, and what did you pick?
- Which part of "What your work needs to show" is weakest in your work,
  and what would make it stronger?

The answers are written into the student's own doc in a zone of their own,
dated, below the response zone (`── HOW I WORKED ──` … `── END HOW I WORKED
──`), above the system block. The doc stays the one record of the student's
writing (13's rule: a submit never stores the writing in a sheet), and the
teacher sees it in context.

### 3. "What I'm changing" before a resubmission

When the last result was **Revise** (the Ledger's LastResult is
`NEEDS_REVISION`), Submit first
asks for a revision statement: what you're changing, and why, naming what
in the feedback led to it. Same minimum. It is added to the same zone,
dated, so each round's plan stays next to the work it led to.

### 4. Flow 2 reads the process

Flow 2 is handed the "How I worked" zone as its own input, apart from the
response. Its prompt (40) adds:
- the process answers as evidence of approach and judgement, scored
  against the same competencies, never in place of the work;
- on a resubmission, whether the work carries out the revision statement
  (applied judgement: did the student act on what they said they'd change?);
- one line of feedback on the process itself.

"Gating" here means a submission can't go in without the process answers,
and a resubmission can't go in without the revision statement. Flow 2
doesn't withhold feedback over them.

## Phases

| Phase | What | Size |
|---|---|---|
| 0 | Content fixes, any time: the 8 missing video links; "What your work needs to show" as a heading, with criteria a student can check | Curriculum files and the generator; re-import the cartridges |
| 1 | "How I worked" on Submit (2) and its zone in the doc; Flow 2 reads it (4, first half) | 13, 02, 37/40, Studio's Flow 2 input step (operator), tests |
| 2 | The revision statement (3); Flow 2 checks it was carried out | 13, 40, tests |
| 3 | One doc per step (1) | Generator, 55b, 53, 55, 58, both dashboards, cartridges, Flow 2's context link: the largest |

Phases 1 and 2 don't depend on 3: they work on today's one-doc lessons and
carry over to steps unchanged.

## Open decisions

1. **Steps: one doc per part, as proposed?** Or keep 8175's few multi-part
   lessons as one doc and split only 8177?
2. **Releasing steps.** One a day by the schedule, or the next step opening
   when the previous one is submitted (or passed)?
3. **Where the process answers live.** In the doc's own zone (proposed), or
   also in a sheet for reading across students (student writing in the
   Central Ledger; `docs/FERPA_DATA_MAP.md` would list it, as it lists
   WarmUpQueue's `response_text`)?
4. **The questions' wording**, and whether they differ by course or lesson
   (a lesson field, so the course builder plan's "no course in the code"
   holds).
5. **Work outside the doc** (Forms, Slides): ask for a short description
   alongside the link, export the artifact into the doc, or have the
   teacher judge those parts?
6. **Timing.** All after Oct 30, or Phase 0 (content only) in the week of
   Oct 26?
