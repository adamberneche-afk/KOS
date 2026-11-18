# Audit: the questions students answer (2026-11-17)

**Status:** done; the rewording is in the PR that added this file. Asked by
the operator: the reflection questions read as confusing, and the confusion
came from the wording, not the idea. Code and lesson data only; no student
answer was read. No names, emails or IDs of students appear here.

## What was audited

Every question a student can be shown, generated from the code and the
lesson data (207 lessons and parts in `55b_LessonAssignmentData.js`):

- **The reflection on Submit** (`REFLECTION_FRAMES`, 00): an Evidence
  question on every Submit, an Approach or Choice question on a first
  Submit, a Feedback question on a resubmission after Not yet.
- **The turn-in question** (`turnInQuestion_`, 71): the question about the
  student's feedback that earns a turn-in code: one for Not yet, three for a
  pass (on its own, linked to the next part, linked to another competency).

That makes **2,179 distinct questions**.

## What it found

| | words: median | 90th percentile | longest | over 60 words |
|---|---|---|---|---|
| Evidence (E1–E3) | 40–44 | 44–48 | 69 | |
| Feedback F1 | 45 | 49 | 70 | |
| Turn-in, Not yet | 45 | 49 | 70 | |
| Turn-in, pass | 46 | 50 | 71 | |
| Turn-in, pass + another competency | 71 | 78 | 89 | |
| Turn-in, pass + next part | 77 | 86 | 110 | |
| **All** | **44** | **59** | **110** | **213** (163 in 8177, 50 in 8175) |

The frames without a goal (A1–A3, C1–C3, F2, F3) were already short (9 to
18 words). The rest were long for four reasons:

1. **The goal was quoted inside the question.** Each Evidence, Feedback and
   turn-in question carried the competency's whole "I can" objective, which
   runs a median of 28 words (the longest is 53). The student had to read a
   sentence inside a sentence to find what was asked.
2. **Two goals in one question.** A pass linked to the next part quoted both
   goals, then asked: up to 110 words (the Buyer's Product Pitch, Part 5).
3. **Several asks at once.** "What will you change, where in your document,
   and how will that show it?" is three questions; "Point to the part … and
   say why it does" adds a fourth instruction after the question mark.
4. **Broken punctuation.** A goal that ended in a period was quoted before
   another period: `…sell out.”.` The turn-in question mixed "your feedback
   says" with the goal's own "I can" and "You show" voices.

## What changed

The goal moves to its own line, labelled, and the question becomes one
short ask. Nothing about the goal is lost; it isn't packed into the
sentence.

Before (86 words):

> Your feedback says you showed “You give a retail price and explain the
> strategy behind it: how it covers your cost, leaves a profit and is still
> a price students will pay”. Part 5 asks: “You show each calculation
> correctly: cost per item, profit per item, margin, total batch cost,
> break-even point, expected profit if the batch sells, and how long it
> takes to sell out.”. How will what you did here help you there? Point to
> the part of your work you will build on.

After:

> **You showed:** You give a retail price and explain the strategy behind
> it: how it covers your cost, leaves a profit and is still a price students
> will pay
> **Part 5 asks:** You show each calculation correctly: cost per item, …
>
> What from this part will you use in Part 5?

| Frame | Before | After |
|---|---|---|
| E1 | Where in your work do you show this: “{goal}”? Point to the sentence or part. | Which sentence or part of your work best shows this goal? |
| E2 | Look at this one: “{goal}”. What in your work shows it, and what would make it stronger? | What in your work shows this goal? What would make it stronger? |
| E3 | If your teacher read only one part of your work to check “{goal}”, which part should it be? Why? | Which one part of your work should your teacher check for this goal? Why? |
| F1 | The feedback says your work doesn't show this yet: “{goal}”. What are you changing, and why will that fix it? | (Not shown yet: {goal}) What will you change to show this goal? |
| Turn-in, Not yet | Your feedback says Not yet: “{goal}”. What will you change, where in your document, and how will that show it? | (Not yet: {goal}) What will you change to show this goal, and where in your work? |
| Turn-in, pass | Your feedback says you showed “{goal}”. Point to the part of your work that shows it, and say why it does. | (You showed: {goal}) Which part of your work shows this goal best? Why? |
| Turn-in, pass + next part | (above, 58 to 110 words) | (You showed / Part n asks) What from this part will you use in Part n? |
| Turn-in, pass + another competency | …How does it connect to “{goal 2}”? Point to the part of your work where they meet. | (You showed / Also in this lesson) Where in your work do these two goals meet? |

A1–A3, C1–C3, F2 and F3 lost their "and why" joins: each is now two short
questions ("What did you leave out or cut? Why?").

**After:** 16 distinct questions, **8 to 16 words, median 12**. The goal
line above them is the lesson's own words, unchanged.

Where a question is stored or read without the page's layout
(ReflectionLog's Question, Flow 2's prompt, the reflection comment on the
doc, TurnInChecks and the turn-in check flow), it is written as one line
with its goals first: `Goal: … . Which sentence or part …?`. Flow 2 and the
check flow still see which goal the answer is about.

## Still open

- **The goals themselves are long.** A median of 28 words, and 4 over 35;
  the longest is Part 6 of the Buyer's Product Pitch (two sentences, 49
  words). They now sit on their own line, so they no longer tangle the
  question, but a shorter goal would read better still. They are lesson
  data (`PARTS.json`, `STUDENT_CRITERIA.json`), approved lesson by lesson,
  so a rewrite is a curriculum decision, not a code change. Offered, not
  done.
- **Watch the answers.** The Not yet verdicts in TurnInChecks (by kind,
  on the Teacher Dashboard's turn-in panel) and the reflection answers'
  lengths in ReflectionLog are the measure: if the wording was the friction, fewer
  answers should come back Not yet for "doesn't answer the question".
