# The student's side of an assignment: plan

**Status:** direction decided 2026-10-24 (under "Decided" below); details
open (at the end). Nothing is built. After Oct 30 unless the operator moves
a phase into the week of Oct 26 ([`PLAN_2026-10.md`](./PLAN_2026-10.md)
keeps that week to small changes).

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

## Decided (the operator, 2026-10-24)

1. **Lessons with parts are split into parts**, one return each. Several
   returns inside one doc "muddies the water" and makes the right text
   harder to pull out for inference.
2. **A part unlocks when the previous part's requirements are met**, not by
   date alone.
3. **Canvas keeps one assignment per lesson**, not one per part.
4. **A process reflection on Submit** and **a feedback reflection before a
   resubmission**: what the student was thinking, and what they will
   change based on the feedback.
5. **The questions vary** and are never all asked at once, since a student
   answers them several times in a lesson.
6. **The questions tie to the competencies** the lesson (and the part)
   measures, as the doc lists them.
7. **Costs are judged by who carries them**: the student, the teacher or
   the system. Adding to a student's or the teacher's load is a different
   thing from adding to the system's, though the system's health is also
   the teacher's (and the operator's) in the end.

## The design

### 1. Parts: one doc each, unlocked in order

Each part of a multi-part lesson becomes its own **part**: its own ConfigID
(`CAS-8177-<slug>-P2`), doc, Ledger row, Submit and feedback. One-part
lessons don't change.

Why one doc each: every reader of a response (01, 03, 13, 37 and Flow 2's
Studio step) takes the text between `── YOUR RESPONSE BEGINS HERE ──` and
`[CONFIG_ID:` as one answer to one task. A doc per part keeps that rule, so
a part's evidence, competencies and feedback stay its own.

**Unlocking reuses what the rollout already does.** The nightly rollout (58)
already makes a lesson's docs ahead of time, unshared (Ledger `SCHEDULED`),
and shares them on release night. A lesson's parts are all made when the
lesson is released; Part 1 is shared, the rest stay `SCHEDULED`. When a
part's requirement is met (below), the harvest's own pass (37, then 03)
shares the next part's doc and sets it `ACTIVE`. No doc is made during the
school day, so the daytime cost is one share.

**What unlocks the next part** (to confirm, open decision 1): proposed,
the part was **submitted with its process reflection and its feedback has
come back**, whatever the result. Passing is not required to move on, so a
student isn't stuck behind one weak part, and a part marked Revise stays
open for its resubmission while the next part is worked. The stricter rule
(only on **Passed**) is one setting away, and the teacher can unlock a part
for one student from the Teacher Dashboard either way.

**Parts depend on each other** (8177 Part 4 uses Part 2's survey). Part 1's
doc carries the shared lead-in (background, key terms, example); each later
part's doc links it and the earlier parts' docs, and Flow 2 is told it may
read them for context.

**Canvas:** one assignment per lesson, as now. Its description lists the
parts; the grade is the lesson's.

### 2. The reflections: two or fewer questions, varied, tied to competencies

Submit on the Student Dashboard opens a short form before anything is
queued. **Each Submit asks one or two questions, never the whole set.**
Each needs a short real answer (10 words, the bar the warm-up extra-credit
reply uses: `EXTRA_CREDIT_MIN_WORDS`, 25).

**Process reflection** (on a part's first Submit). Drawn from a bank of
templates by kind; at least one question each time names a competency the
part measures, taken from the doc's "What your work needs to show":

- *Approach:* "What did you do first, and why?" / "What did you leave out,
  and why?"
- *Competency evidence:* "Where in your work do you show *{competency}*?
  Point to it." / "Which of these is weakest in your work: *{competency A}*
  or *{competency B}*? Why?"
- *Choice:* "What was the hardest choice in this part, and what did you
  pick?" / "What would someone who disagrees with you say?"

**Feedback reflection** (on a resubmission after Revise). The harvest
already records an outcome per competency (`CompetencyEvidence`, 15c), so
the question names one the work fell short on:

- "The feedback on *{competency}* asked for more. What are you changing,
  and why?" / "What part of the feedback do you disagree with, if any, and
  what are you doing about the rest?"

**How variance works.** A question is chosen in Apps Script, not by a
model: by kind (each Submit gets a competency question plus at most one
other), skipping any template that student has already answered in this
lesson, and rotating which competency is named. Same inputs, same choice,
so the teacher can see why a student got a question and a test can pin it.

**Where the answers go:** into the student's own doc, dated, in a zone of
their own below the response zone (`── HOW I WORKED ──` … `── END HOW I
WORKED ──`), each answer under its question. The doc stays the one record
of the student's writing (13's rule: a submit never stores the writing in
a sheet), and the teacher reads it in context.

### 3. Flow 2 reads the reflections

Flow 2 gets the "How I worked" zone as its own input, apart from the
response. Its prompt (40) adds:
- the reflections as evidence for the competencies they name, never in
  place of the work;
- on a resubmission, whether the work carries out the feedback reflection
  (applied judgement: did the student act on what they said they'd change?);
- one line of feedback on the process itself.

A Submit can't go in without its reflection; feedback is never withheld
over it.

## Where the costs land

| Change | Student | Teacher | System |
|---|---|---|---|
| Parts (about 2.5× as many returns: 67 docs per student a year → 171) | More Submits, each one smaller. More docs in their Drive. | More rows to watch; more feedback comments; more timeout emails when a run fails | More docs made and shared, Ledger rows, Flow 2 runs, harvests, overnight-check counts. The rollout already splits a long night across runs (`ROLLOUT_TIME_BUDGET_MS`, 58) |
| Unlocking in order | Waits for feedback before the next part (minutes, or longer on a slow night) | Unlocks by hand for a stuck student | One share per unlock, during the harvest |
| Reflections on Submit | One or two short questions per Submit | Reads them in the doc if they choose | Question choice in Apps Script; a slightly longer Flow 2 input |
| Canvas: one assignment per lesson | Nothing new | One grade per lesson, as now | Cartridge lists the parts |

**Kept off the student and the teacher by design:**
- **Student Dashboard:** a lesson is one card ("Part 2 of 5"); only the
  open part has a Submit. Locked parts show what unlocks them.
- **Teacher Dashboard:** the roster rolls parts up to the lesson ("on Part 3
  of 5") and flags only the part that needs attention.
- **Reflections:** never more than two questions on a Submit.
- **Canvas:** grading doesn't multiply.

**What reaches the teacher anyway** is the system's health: about 2.5 times the
returns means more runs that can fail. The overnight check and the
watchdog already count failures by stage; this plan adds nothing a teacher
must check daily, and Phase 3 is not started until Flow 2's live failure
rate is known (EvaluationLog, 37, has kept one row per result since #265).
Studio's run limits per day are not measured yet: check before Phase 3.

## Phases

| Phase | What | Size |
|---|---|---|
| 0 | Content fixes, any time: the 8 missing video links; "What your work needs to show" as a heading, with criteria a student can check | Curriculum files and the generator; re-import the cartridges |
| 1 | The process reflection on Submit, its question bank and selection, its zone in the doc; Flow 2 reads it | 13, 02, 37/40, Studio's Flow 2 input step (operator), tests |
| 2 | The feedback reflection, from `CompetencyEvidence`; Flow 2 checks it was carried out | 13, 15c, 40, tests |
| 3 | Parts: the generator splits tasks, ConfigIDs per part, made with the lesson and unlocked in order, both dashboards group them, cartridges list them | Generator, 55b, 53, 55, 58, 37/03, 07, 13, cartridges: the largest |

Phases 1 and 2 don't depend on 3: they work on today's one-doc lessons
(a whole lesson is "one part") and carry over unchanged.

## Open decisions

1. **The unlock rule:** feedback back, any result (proposed), or Passed
   only?
2. **Where the reflections live:** in the doc only (proposed), or also in a
   sheet for reading across students (student writing in the Central
   Ledger; `docs/FERPA_DATA_MAP.md` would list it, as it lists
   WarmUpQueue's `response_text`)?
3. **The question bank's wording:** the templates above are a first draft
   to rewrite.
4. **8175's five multi-part lessons:** split like 8177's, or kept whole?
5. **Work outside the doc** (Forms, Slides): ask for a short description
   alongside the link, export the artifact into the doc, or have the
   teacher judge those parts?
6. **Timing:** all after Oct 30, or Phase 0 (content only) in the week of
   Oct 26?
