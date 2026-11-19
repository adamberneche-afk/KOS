# Audit: the teacher's lesson doc (2026-11-19)

**Status:** done; the fixes marked *Built* are in the PR that added this
file. Asked by the operator: audit the teacher lesson guide as it is made
now, and make sure it supports the teacher in the ways they can best
support their students. Code and lesson data only (`66_LessonDoc.js`, 55b's
`LESSON_ASSIGNMENTS` and `LESSON_PARTS`, the lesson files); no student
work was read. No names, emails or IDs of students appear here.

## What the doc held

One Google Doc per lesson ("Lesson Plan — 8177 The Venue Buyer's Product
Pitch"), made once by the nightly rollout or **Make lesson doc**:

- **The plan:** when it starts and the next lesson starts, the objective,
  every "I can" goal (headed "Today's goals"), the competencies by tier,
  vocabulary, the whole student task.
- **Itinerary:** a table per day, minutes per block on A and B, which the
  agenda reads.
- **Look-fors:** each competency's "I can" goal and the state's indicators.
- **Each day it runs:** a heading per class meeting with "Notes:".
- **Class status:** per period, docs made, shared, submitted, waiting,
  passed.

## Findings

What a teacher needs to support students, against what the doc gave:

| # | Gap | Why it matters | Now |
|---|---|---|---|
| 1 | **No due date.** The doc said when the next lesson starts, not when this one is due. | The teacher reminds students of the deadline the Student Dashboard and Canvas use. | *Built:* "Due Fri Nov 20, 11:59 p.m." from 00's `lessonDueDay_`, the same rule as the cards, the agenda and the cartridge |
| 2 | **A lesson in parts was invisible.** Six parts, their tasks, which are Slides or Forms, and what opens each: none in the doc. | The teacher can't say what Part 3 asks, or why a student's Part 4 is locked. | *Built:* **Parts**: each part's task, its work type, what opens it (the part before's main goal, or the teacher's unlock) and what else it needs to show |
| 3 | **Submit's checks were invisible.** A Slides part checks 3–5 slides, the Rule of Six, notes on every slide, contrast; a Form part its question count and types. | Students hit these before any feedback; the teacher should teach to them, not discover them from a stuck student. | *Built:* "Submit checks first: …" under each part, in words |
| 4 | **What the feedback grades against was invisible.** The definition of done (the "needs to show" list, the passing rule) is what Flow 2 reads. | The teacher should be able to predict the feedback a student will get. | *Built:* **What the feedback checks**: the needs-to-show and can-also-show lists (a whole lesson), the passing rule in plain words |
| 5 | **The teacher's grading notes were lost to them.** 8175's "Quick Grading Tip" goes into the definition of done for Flow 2, and nowhere a teacher reads. | Their own guidance on what to look at. | *Built:* **Your grading notes** under What the feedback checks |
| 6 | **Class status said how many, not who needs what.** No "not started", no "to revise", nothing about which goal the class is missing. | Where to reteach or confer is the most useful thing a status section can say. | *Built:* Not started and To revise columns; **Not shown yet**: each goal with how many checked files haven't shown it (best check so far), most first. Counts only; the Teacher Dashboard says who |
| 7 | **No links.** The Teacher Dashboard and the agenda had to be found. | One click to who needs what. | *Built:* "Open: Teacher Dashboard · the agenda deck" |
| 8 | **"Today's goals"** headed every goal of a multi-day lesson. | Misleading on day 2. | *Built:* "The goals ("I can")" |
| 9 | **Supports and extensions:** no scaffolds, sentence starters or extensions for students who are stuck or ready for more. | The core of supporting different students. | *Not built:* the lesson files hold none; it is curriculum to write (the course builder's lesson editor is where it would go), not something the code can derive |
| 10 | **Two places for daily notes:** the doc's "Notes:" per day and, since 2026-11-19, the agenda slide's YOUR NOTES. | Notes split across two files. | *Not changed:* the agenda's notes are the pacing record (what each day took); the doc's are teaching notes. Say so if one should go |
| 11 | **Look-fors for a tertiary competency** show only its ID when the CompetencyRubrics tab has no row for it. | A heading with no words. | *Not changed:* a rubrics-tab gap, not the doc's |
| 12 | **The doc is a snapshot.** Made once; a lesson edited after (55b) doesn't reach it, and Class status is as of the last refresh. | Stale sections. | *Partly:* a doc made before today gets Parts and What the feedback checks on its next refresh; the rest stays as made, by design (the teacher's edits stay) |

## Where it is

`cas-ccps/scripts/66_LessonDoc.js` (`_ldocWriteParts_`, `_ldocWriteChecks_`,
`_ldocChecksWords_`, `_ldocDodParts_`, `_ldocNotShownYet_`,
`_ldocAddGuideSections_`); tests in `tests/cas-ccps/lesson-doc.test.js`.
