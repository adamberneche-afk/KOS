# The student's side of an assignment: plan

**Status:** direction decided 2026-10-24 (under "Decided" below); details
open (at the end). **Phase 1 (the process reflection on Submit) is built**
(2026-10-24, behind `REFLECTION_ON_SUBMIT`, off; `cas-ccps/HISTORY.md`, "The
process reflection on Submit"), using the Appendix A frames as drafted until
they are approved. The feedback reflection (Phase 2) waits until Phase 1
runs reliably (the operator, 10-24). Starts in the week of Oct 26 as part
of the dashboard review and runs into the week of Nov 2
([`PLAN_2026-10.md`](./PLAN_2026-10.md), both weeks); how far it gets
depends on the build credits available.

## Why

The goal: the student's work and the Submit step should give us what we
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
- **Work outside the doc.** Lessons send the student to Forms (5), Slides
  (11), Sheets (3), Canva (10) and Drawings (1), often ending "paste the
  link" (counted by matching the task text, so approximate). Flow 2 is
  handed the doc, so a pasted link is only a URL to the work.
- **Missing material.** All 8 lessons that mention videos have no link in
  the task (8175 L06: "Watch the provided videos").
- **The criteria are hard to find.** "What your work needs to show" is
  plain 8 pt text like the rest, and its items are VDOE competency titles
  ("Demonstrate professionalism"), not checks a student can apply.

## Decided (the operator, 2026-10-24)

1. **Lessons with parts are split into parts, in both courses** (8175 and
   8177 alike: students work through both, so they work the same way), one
   return each. Several returns inside one doc "muddies the water" and makes
   the right text harder to pull out for inference.
2. **A part unlocks when its primary competency is met.** The secondary
   and tertiary competencies, and any further evidence, need not be met or
   even attempted.
3. **Canvas keeps one assignment per lesson**, not one per part.
4. **A process reflection on Submit** and **a feedback reflection before a
   resubmission**: what the student was thinking, and what they will
   change based on the feedback.
5. **The questions vary** and are never all asked at once, since a student
   answers them several times in a lesson.
6. **The questions tie to the competencies** the part measures, as its doc
   lists them.
7. **The reflections are kept in a sheet**, so they can be read together
   to build each student's context (the least costly place for the student
   and the teacher too; see "Where the reflections live").
8. **Work in Forms, Slides and Sheets is submitted as that file**, checked
   and evaluated like a doc, rather than pasted in as a link.
9. **Costs are judged by who carries them**: the student, the teacher or
   the system. Adding to a student's or the teacher's load is a different
   thing from adding to the system's, though the system's health is also
   the teacher's (and the operator's) in the end.
10. **Timing:** start in the week of Oct 26 as part of the dashboard
    review; finish in the week of Nov 2 if needed. The dashboard
    walk-throughs stay that week's first job, and how far this plan gets
    depends on the build budget.
11. **Drafts by the agent, approval by the operator** (10-24): the question
    frames and each part's tiers and criteria are drafted here; the
    operator approves them or gives revision directions. First drafts are
    in the appendix.
12. **Canva lessons move to Slides.**
13. **The reflection also comes back as a comment** on the student's work
    file, for the student to look at while they work. It is reference only,
    never part of the work; the sheet keeps the raw answers.

## The design

### 1. Parts: one doc each, unlocked in order

Each part of a multi-part lesson becomes its own **part**: its own ConfigID
(`CAS-8177-<slug>-P2`), work file, Ledger row, Submit and feedback. One-part
lessons don't change.

Why one file each: every reader of a response (01, 03, 13, 37 and Flow 2's
Studio step) takes the text between `── YOUR RESPONSE BEGINS HERE ──` and
`[CONFIG_ID:` as one answer to one task. A file per part keeps that rule, so
a part's evidence, competencies and feedback stay its own.

**Each part has its own primary competency.** Today the tiers are per
lesson (`COMPETENCY_TIERS.json`), and milestone 1 is the lesson's primary
competency in all 67 lessons (checked 2026-10-24). A part may not evidence
its lesson's primary (8177's Part 1, choosing a target market, is not yet a
market research project), so each part gets its own primary, secondary and
tertiary, drafted from its task and approved by the teacher, as the lesson
tiers were on 10-20. The builder then checks every part has a primary and
every lesson competency is covered by some part.

**The unlock rule.** Flow 2 already returns an outcome per milestone
(`MILESTONE_OUTCOMES`: `MET`, `PARTIALLY_MET` or `NOT_MET`; 15c), and the
harvest records it in `CompetencyEvidence`. When milestone 1 (the part's
primary) comes back `MET`, the next part unlocks. `PARTIALLY_MET` and
`NOT_MET` keep it locked; the student revises and resubmits. The teacher can
unlock a part for one student from the Teacher Dashboard (a student stuck
on a hard part, or a result the teacher disagrees with).

**Unlocking reuses what the rollout already does.** The nightly rollout
(58) already makes a lesson's files ahead of time, unshared (Ledger
`SCHEDULED`), and shares them on release night. A lesson's parts are all
made when the lesson is released; Part 1 is shared, the rest stay
`SCHEDULED`. When a part's primary is met, the harvest's own pass (37,
then 03) shares the next part's file and sets it `ACTIVE`. No file is made
during the school day, so the daytime cost is one share.

**Parts depend on each other** (8177 Part 4 uses Part 2's survey). Part 1
carries the shared lead-in (background, key terms, example); each later
part links it and the earlier parts' files, and Flow 2 is told it may read
them for context.

**Canvas:** one assignment per lesson, as now. Its description lists the
parts; the grade is the lesson's.

### 2. The reflections: one or two questions, varied, tied to competencies

Submit on the Student Dashboard opens a short form before anything is
queued. **Each Submit asks one or two questions, never the whole set.**
Each needs a short real answer (10 words, the bar the warm-up extra-credit
reply uses: `EXTRA_CREDIT_MIN_WORDS`, 25).

**What a question is made of.** Each question is a fixed sentence frame
(written once, approved by the teacher) with a slot filled from the part's
data:

| Kind | When | Example frames | Slot filled from |
|---|---|---|---|
| Approach | First Submit of a part | "What did you do first, and why?" / "What did you leave out, and why?" | Nothing |
| Evidence | Every Submit (always one of the two) | "Where in your work do you show {criterion}? Point to it." / "Which is weaker in your work, {criterion A} or {criterion B}? Why?" | The part's criteria |
| Choice | First Submit | "What was the hardest choice in this part, and what did you pick?" / "What would someone who disagrees with you say?" | Nothing |
| Feedback | A resubmission after the primary wasn't met | "The feedback on {criterion} asked for more. What are you changing, and why?" / "What part of the feedback do you disagree with, if any, and what are you doing about the rest?" | The competency the feedback found short (`CompetencyEvidence`) |

**The slot is the hard part.** A competency's title doesn't read as a
question: "Where in your work do you show *Demonstrate professionalism*?"
The rubric data has two other wordings for every one of the 221
competencies (`cas-ccps/data/CompetencyRubrics.json`), and neither is
right on its own:
- **Demonstration indicators** ("practicing punctuality and attendance",
  "exhibiting professional self-representation…") are the VDOE's, about the
  competency in general, not this task: L06 asks for a plan, not a
  handshake. Some competencies have only their own title as an indicator
  (8177-83, "Develop a market research project").
- **Skill questions** ("What is professionalism? How is it
  demonstrated?") test knowledge of the competency, not how this work shows
  it.

So the slot takes **each part's own learning objectives, owned by the
student** (the operator, 2026-10-24): one "I can …" line per competency,
naming the skill and how this task shows it ("I can analyze a team or
company's position by naming 2 internal strengths, 2 weaknesses, 2 outside
opportunities and 2 threats it faces"). That is Phase 0's "criteria a
student can check", and it does double duty: the doc shows it under "What
your work needs to show", and the questions name it. Drafted from the task
and the indicators, approved by the teacher with the part tiers.

**How variance works.** A question is chosen in Apps Script, not by a
model: an Evidence question every time, plus at most one other kind;
skipping any frame that student has already answered in this lesson;
rotating which criterion is named, primary first. Same inputs, same choice,
so the teacher can see why a student got a question and a test can pin it.

### 3. Where the reflections live

**In a `ReflectionLog` tab in the Central Ledger**, one row per answer:
time, the student's Google ID, the part's ConfigID, the kind and frame, the
competency named, the question as asked, the answer. Flow 2 gets that
Submit's answers through FlowInput (new columns appended at the end, as the
schema requires). The student context the nightly stages build (23, 33)
reads the tab, so a student's reflections across lessons and courses build
up their context.

This is a change to a rule: today a submit never stores the student's
writing in a sheet (13), and Flow 2 reads the work from the doc. The work
still stays in the student's file; the reflections are a new record of
their own. `docs/FERPA_DATA_MAP.md` lists the tab (as it lists
WarmUpQueue's `response_text`), and the retention schedule (57) gets a
record for it.

**Why not read them from comments on the doc.** It can be done: feedback
is posted as a Drive comment (37), and the Drive API lists a comment's
replies. But a reply can be edited or deleted, it can land on any comment
(including the teacher's), nothing makes the student write one before
resubmitting, and pairing a reply with a question means guessing. Cost to
each:
- **Student:** the same either way, a few sentences; the Submit form asks
  them where they already are, with the question in front of them.
- **Teacher:** nothing either way; with the sheet, the Teacher Dashboard's
  Student Context shows them, sorted and complete.
- **System:** the sheet is a read; comments are a crawl of every doc's
  threads and a guess at each reply's meaning.

**The student sees their reflection as a comment** (decided 10-24). After
a Submit, the system posts the answers as a Drive comment on the part's
work file, the way feedback is posted today (37): "Your reflection
(Oct 27): …", each question with its answer. It is reference for the
student while they revise, not part of the work: comments sit outside the
document body, so no reader of the response ever sees it. The student can
resolve it. `ReflectionLog` keeps the raw answers; the comment is a copy
and nothing reads it back. A Form has no comment pane in its editor (as far
as is known; check when built), so for a Form part the reflection shows on
the dashboard card instead.

### 4. Flow 2 reads the reflections

Flow 2 gets the reflections as their own input, apart from the work. Its
prompt (40) adds:
- the reflections as evidence for the criteria they name, never in place
  of the work;
- on a resubmission, whether the work carries out the feedback reflection
  (applied judgement: did the student act on what they said they'd change?);
- one line of feedback on the process itself.

A Submit can't go in without its reflection; feedback is never withheld
over it.

### 5. Work in Forms, Slides and Sheets

**The idea: a part's work file has a type.** Today it is always a Doc.
A part can instead be a Google Form, a Slides deck or a Sheet, made by the
rollout from a template, exactly as the doc is (copied, owned by the
system, shared with the student as editor, `SCHEDULED` until unlocked).
The Student Dashboard shows "Open your form" or "Open your slides", and
Submit works the same.

**Why the system makes the file, not the student.** The dashboard runs as
the admin account; a student account can't run Apps Script. A form the
student makes in their own Drive can't be read unless they share it, and
nothing makes them. A file CAS makes is always readable, always the right
one, and can't be swapped for another link.

**A reader per type, at Submit.** Each type has a reader in Apps Script
that does what 13 does for a doc today (the 150-character, 25-word
minimum), in that format's terms, then writes a **snapshot**: a plain-text
account of the file as submitted (below), saved as a Doc owned by the
system and linked from the Ledger row. Flow 2 reads the snapshot the way it
reads a doc now, so Studio's flow changes only in where it reads.

| Type | What the reader can check (Apps Script) | What the snapshot holds |
|---|---|---|
| **Form** (`FormApp`) | Number of questions, each one's type (checkboxes, scale, short answer), its choices, the scale's ends and labels, whether email collection is off (the form's `collectsEmail` setting), the description | Every question with its type and choices, the settings that matter |
| **Slides** (`SlidesApp`) | Number of slides, text on each, speaker notes, images and charts present, the title slide | Each slide's title, text and notes in order; "image" or "chart" where there is one |
| **Sheet** (`SpreadsheetApp`) | Named tabs present, cells filled, formulas (not typed numbers) where the task needs a calculation, a chart present | Each tab's filled range as a table, its formulas, its charts' titles and ranges |

**What it buys.**
- **Some checks become exact.** 8177's survey task (Part 2) says
  checkboxes "select up to two", a 1–5 scale and a short answer, email
  collection off. The reader checks the type, choices and email setting
  for certain and gives a precise "not yet" before Flow 2 runs, a
  cheaper and more reliable check than a model's reading. (Whether
  "select up to two" can be read back depends on what `FormApp` returns for
  a checkbox item's validation, to confirm when built.)
- **The snapshot freezes what was evaluated.** The teacher sees exactly
  what Flow 2 judged, even if the student changes the file afterwards; a
  doc submission could get one too.
- **Process signal.** The Drive API lists revisions for Docs, Sheets and
  Slides, so the authenticity collector (D4 in `PLAN_2026-10.md`) works
  the same across them; Forms, as far as is known, keep no revision
  history the Drive API returns (to confirm).

**Care needed.**
- A form's **responses** (8177's survey deployment and results lessons)
  are answers from other people, often other students: the reader reads the
  form's questions and settings, never its responses, unless a lesson
  needs the counts, in which case only counts.
- **Canva** (10 lessons) has no way in from Apps Script (no Google Cloud
  project on this account, `tools/gas-lint/gcp-map.json`). **Decided
  10-24: those parts become Slides parts**, their task text rewritten for
  Slides as the parts are drafted.
- **Drawings** (1 lesson): read like an image only; treat as Slides.
- Images aren't described in the snapshot; a design judged on how it looks
  stays with the teacher unless Flow 2 can take images (not checked).

**Order inside the phase:** Forms first (5 lessons, the clearest checks),
then Slides (11), then Sheets (3); Canva lessons move to Slides as their
parts are written.

## Where the costs land

| Change | Student | Teacher | System |
|---|---|---|---|
| Parts (about 2.5× as many returns: 67 per student a year → 171) | More Submits, each one smaller. More files in their Drive | More rows to watch; more feedback comments; more timeout emails when a run fails | More files made and shared, Ledger rows, Flow 2 runs, harvests, overnight-check counts. The rollout already splits a long night across runs (`ROLLOUT_TIME_BUDGET_MS`, 58) |
| Unlocking on the primary | Waits for feedback before the next part (minutes, or longer on a slow night); revises until the primary is met | Unlocks by hand for a stuck student; approves part tiers and criteria once | One share per unlock, during the harvest |
| Reflections on Submit | One or two short questions per Submit | Nothing required; reads them in Student Context if they choose | Question choice in Apps Script; `ReflectionLog` rows; a longer Flow 2 input |
| Reflections in a sheet | Nothing | Nothing | A new tab, its FERPA and retention entries |
| Forms, Slides, Sheets as work files | Works in the real tool; no link to paste | Sees the real artifact and the snapshot of what was judged | A reader and a template per type; snapshot docs; more ways a Submit can fail |
| Canvas: one assignment per lesson | Nothing new | One grade per lesson, as now | The cartridge lists the parts |

**Kept off the student and the teacher by design:**
- **Student Dashboard:** a lesson is one card ("Part 2 of 5"); only the
  open part has a Submit. Locked parts say what unlocks them ("Opens when
  your survey shows a market research plan").
- **Teacher Dashboard:** the roster rolls parts up to the lesson ("on Part 3
  of 5") and flags only the part that needs attention.
- **Reflections:** never more than two questions on a Submit.
- **Canvas:** grading doesn't multiply.

**What reaches the teacher anyway** is the system's health: about 2.5 times
the returns means more runs that can fail, and an unlock that waits on
Flow 2 makes a failed run a blocked student. The overnight check and the
watchdog already count failures by stage; a part held more than a school
day by a failed run is flagged, and the teacher can unlock it. Splitting
lessons (Phase 3) does not start until Flow 2's live failure rate is known
(`EvaluationLog`, 37, has kept one row per result since #265; the week of
Nov 2's measurement) and Studio's limit on runs per day is checked.

## Phases

| Phase | What | When |
|---|---|---|
| 0 | Content: the 8 missing video links; each lesson's "I can" learning objectives, shown as a heading; part tiers and part criteria drafted for the teacher's approval | Week of Oct 26 |
| 1 | The process reflection on Submit: the question frames, the selection, `ReflectionLog`, Flow 2 reads it, Student Context shows it. Behind a setting, off until grades are in (Oct 30) | Week of Oct 26, on after Oct 30 |
| 2 | The feedback reflection, from `CompetencyEvidence`; Flow 2 checks it was carried out | Week of Nov 2 |
| 3 | Parts in both courses: the builder splits tasks, a ConfigID and file per part, made with the lesson, unlocked on the primary, both dashboards group them, the teacher's unlock, cartridges list them | Week of Nov 2, after the measurement; likely runs past it |
| 4 | Work files by type: Forms, then Slides, then Sheets; Canva parts to Slides | After Phase 3 |

Phases 1 and 2 don't depend on 3: they work on today's one-doc lessons (a
whole lesson is one part) and carry over unchanged. Phase 4 needs Phase 3's
part files.

## Turning Phase 1 on

1. Push the Central Ledger and the Student Dashboard (`run.js`). Then, from
   the Central Ledger's editor, `syncFlowPromptsToSheet()`: Flow 2's prompt
   changed, so the overnight check's "Flow prompts" line shows until it
   runs. Studio needs no change (Flow 2 reads the PromptText chip).
2. Set `REFLECTION_ON_SUBMIT` to one course code (or `all`) in the Ledger's
   `_CONFIG`, after grades are in (Oct 30) unless decided otherwise.
3. Submit one piece of work as a test student. Check: the card asks two
   questions; a short answer is refused; after Submit, `ReflectionLog` has
   two rows; a minute later the FlowInput row's `PromptText` holds them in
   its PROCESS REFLECTION block; the doc has a "Your reflection" comment;
   the feedback has a YOUR PROCESS part.

## Open decisions

1. ~~**The question frames** (Appendix A)~~: **approved 2026-10-24**, in the
   wording built in `00_SharedConfig.js` (`REFLECTION_FRAMES`).
2. ~~**The learning objectives**~~: **approved 2026-10-24** as written
   (draft 2, "I can …" statements the student owns,
   `cas-ccps/curriculum/lessons/STUDENT_CRITERIA.json`), with the 11
   tertiaries the task gives little room to show kept. **Wired in
   2026-10-24:** new docs show them under "What your work needs to show",
   and the reflection questions quote them (from the TeacherMatrix's
   `StudentObjectives`, after `refreshAssignments()`).
3. **The first lesson's parts** (Appendix B): approve or give revision
   directions; the other 34 multi-part lessons follow its pattern.
4. **Phase 1 on before Oct 30?** Proposed off until grades are in.
5. ~~**`ReflectionLog`'s retention**~~: **decided 2026-10-24**: the student's
   work is kept by the record rules for student artifacts and the
   portfolio. `ReflectionLog` is a record kept as long as the Ledger
   (`LEDGER_RETENTION_YEARS`, as the student's Doc), and it is portfolio
   material: the student's own corpus of work to take at graduation for
   their own AI use (`CAS_DESIGN_THREADS_2026-10-16.md`, Thread B).

## Appendix A: the question frames (approved 2026-10-24)

As built for today's one-doc lessons, "this part" reads "this assignment"
and E1 ends "the sentence or part"; with parts (Phase 3) the wording
returns to "this part". The Feedback frames are Phase 2, not built.

Rules: one **Evidence** question on every Submit, plus at most one other.
A first Submit adds an Approach or Choice question (alternating by part); a
resubmission after the primary wasn't met adds a Feedback question instead.
Never a frame the student has already answered in this lesson. `{criterion}`
is one of the part's criteria (Appendix B's student wording), primary first,
then rotating. Each answer needs 10 words.

**Evidence** (every Submit)
- E1. "Where in your work do you show this: *{criterion}*? Point to the
  sentence or slide."
- E2. "Look at this one: *{criterion}*. What in your work shows it, and what
  would make it stronger?"
- E3. "If your teacher read only one part of your work to check *{criterion}*,
  which part should it be? Why?"

**Approach** (a first Submit)
- A1. "What did you do first in this part, and why start there?"
- A2. "What did you leave out or cut, and why?"
- A3. "What did you look back at in the lesson while you worked, and what
  did it help with?"

**Choice** (a first Submit)
- C1. "What was the hardest choice in this part, and what did you pick?"
- C2. "What would someone who disagrees with your work say? What would you
  tell them?"
- C3. "What other way could you have done this part? Why didn't you?"

**Feedback** (a resubmission after the primary wasn't met; `{criterion}` is
the one the feedback found short)
- F1. "The feedback says your work doesn't show this yet: *{criterion}*.
  What are you changing, and why will that fix it?" (reworded 2026-10-24 so
  an "I can" objective reads inside it)
- F2. "What part of the feedback do you agree with most, and what are you
  doing about it?"
- F3. "Is there anything in the feedback you disagree with? Say what, and
  what you're doing about the rest."

## Appendix B: the first lesson's parts (draft 1, 2026-10-24)

**8177 Venue Market Research & Survey Design** (`8177-market-research-survey-design`).
Lesson tiers today: primary 8177-83, secondary 8177-2 and 8177-79, tertiary
8177-18, 8177-81 and 8177-93. Split into the task's five parts; the
lead-in (background, where data comes from, the two kinds of data, bias,
key terms, the example) goes with Part 1 and is linked from the rest. Each
part's primary unlocks the next. Every lesson competency is covered: 83
(Parts 2, 3), 2 (Parts 4, 5), 79 (Part 5), 18 (Part 2), 81 (Part 1), 93
(Part 1).

| Part | Work file | Primary (unlocks the next part) | Secondary | Tertiary |
|---|---|---|---|---|
| 1. The Target Market | Doc | 8177-81 Develop a market segmentation analysis | 8177-2 Critical thinking | 8177-93 What motivates consumers |
| 2. Build the Survey | **Form** | 8177-83 Develop a market research project | 8177-18 Technologies and tools | — |
| 3. Why These Questions Work | Doc | 8177-83 Develop a market research project | — | — |
| 4. Spot the Bias | Doc | 8177-2 Critical thinking | — | — |
| 5. Beyond the Survey | Doc | 8177-79 Sources of market research data | 8177-2 Critical thinking | — |

Why: Part 1 is a segmentation choice (which group, and why it matters
most), so 81 is its primary there though it is tertiary for the lesson.
Parts 2 and 3 are the research project itself (the instrument, then what it
measures). Part 4 is critical thinking alone. Part 5 is sources of data,
with the "what it tells the store that the survey can't" comparison as
critical thinking. Only Part 2 tests a tool, so 18 sits there.

**Criteria in a student's words** (shown under "What your work needs to
show", and named by the Evidence questions):

- **Part 1**
  - *(required)* You pick one group (students, parents or staff) and say
    what makes them different from the other two as customers.
  - You give a reason the store should care about that group most: what
    they buy, how often, or how easy they are to reach.
  - *(not required)* You say what makes that group want to buy from the
    store or show up to school events.
- **Part 2** (a Form; the reader checks the first two for certain)
  - *(required)* Your form has all three questions set up as shown:
    checkboxes for Question 1 (choose up to two), a 1–5 scale with its two
    labels for Question 2, a short answer for Question 3.
  - Email collection is turned off in the form's settings.
- **Part 3**
  - *(required)* For each of the three questions, you say whether it
    collects quantitative or qualitative data and one thing the store would
    learn from the answers.
- **Part 4**
  - *(required)* For each biased question, you name what pushes people (a
    leading word, a leading question or a loaded choice) and rewrite it so
    someone with the opposite opinion could answer just as easily.
- **Part 5**
  - *(required)* You name one more primary source and one secondary source
    the Cavalier Shop could really use.
  - For each source, you say one thing it would tell the store that the
    survey can't.

**Changed in the task text:** Part 2 loses "Paste your form's link into
this document" (the form is the work file). The vocabulary line ("Use these
terms accurately…") is split by part, each part listing the terms it uses.
