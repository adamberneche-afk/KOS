# Turn-in code: proof of engagement in Canvas (2026-11-07)

**Status:** design, from the operator's decisions of 2026-11-07. Stage 1 is
built (PR #391), behind a switch that is off; see "Build stages". The decisions below are the operator's; the open questions are
marked. [`PLAN_2026-11.md`](./PLAN_2026-11.md) is the plan of record and
wins where the two disagree. No student names, emails, file IDs or
ConfigIDs appear here, by design.

## The problem

The Canvas turn-in asks only for something a student has before doing any
work, so nothing in Canvas rewards using CAS. Credit has to come from the
feedback cycle: submitting for feedback, then engaging with that feedback.

## Decided (operator, 2026-11-07)

1. **The Canvas assignment becomes a text-entry submission.** The student
   pastes a turn-in code, issued by the Student Dashboard once they have
   submitted for feedback and answered one question about that feedback.
2. **The code earns completion credit, as a formative grade.** Summative
   grades stay outside CAS for now and carry the standards alignment the
   district's grading policy asks for (standards and grades align;
   formative and summative are weighted differently).
3. **The code is issued only for engaging with the feedback.** A check that
   failed or timed out never issues a code. Issuing one would reward a
   broken check and skip the cognitive friction. The student resubmits, or
   the teacher grants a code.
4. **The teacher can grant a code by hand**, with the reason logged. It is
   the only way around the gate.
5. **Work CAS can't read is not assigned through CAS.** There is no separate
   tier for it.
6. **No AI judges the work, and there is no time limit within the current
   term.** After the term closes, only the teacher's grant issues a code.
7. **The response to the feedback question is checked against the question
   or the feedback.** It is driven by Apps Script, with an inference flow
   where Apps Script can't judge (see the check below).
8. **A per-course switch, off by default.** The pilot is one 8177 unit.
9. **The gap between engagement and competency is read per lesson, as a
   design signal, never per student.** A lesson where students earn codes
   but rarely show the milestone probably needs rethinking. It doesn't
   show that those students failed.

## Standing rules (so the grade doesn't poison the measure)

Separating the grade (completion) from the competency measure keeps the
competency ratings honest: no student is trying to raise them for a grade.
The pressure moves to whatever carries the grade, which is the code. So:

- **Code counts are never evidence of learning.** Codes issued and
  reflections passed show engagement only. A learning claim comes from
  evidence no student is aiming at: a later unaided check on the same
  competency (Sprint D's missing non-usage measure; PRD P1-04).
- **The gate stays binary and moving.**
  - It returns "addresses the feedback" or "not yet", with no score and no
    "better" reflection.
  - The question is built from each student's own feedback, so there is no
    single answer template to copy.
  - The teacher reads a sample of reflections now and then. If they
    converge on a formula, the question changes, not the bar.
- **Competency ratings stay low-stakes for students.** If they start feeding
  a grade, comments or placement, the pressure returns to them. The same
  holds for the system's own numbers: they are never the target.

## The student's path

1. Work in the assignment doc, and **Submit for Feedback** (unchanged).
2. Feedback arrives. The card shows **one question built from that
   feedback**:
   - If the primary isn't met yet: "Your feedback says *Not yet:
     \<milestone\>*. What will you change, and where in your document?"
   - If it passed: "Your feedback says you showed *\<primary milestone\>*.
     Point to the part of your work that shows it, and say why it does."
   The milestone comes from `CompetencyEvidence`, the same source as the
   card's "Not yet:" line (#385).
3. The answer is checked (below). "Addresses it" issues the code; "not yet"
   shows a one-line reason, and the student rewrites with no limit within
   the term.
4. **Copy turn-in code** on the card. The student pastes it into the Canvas
   text box. The code can be copied again at any time.

## The check

Apps Script screens first, so obvious misses never spend a Studio run.

- **The Apps Script screen, instant.** It rejects:
  - an empty or very short answer;
  - an answer that is mostly the feedback or the question pasted back
    (word-sequence overlap above a set share).

  The student sees why and rewrites right away.
- **The Studio flow, one Gemini call per answer**, in the FLOW_DOCTRINE
  shape:
  - Apps Script materializes a row with the milestone, the feedback item and
    the student's answer.
  - The flow asks one question: does this answer address this feedback?
  - It returns `ADDRESSES` or `NOT_YET` with one line of reason.
  - Apps Script harvests the verdict and issues the code.

  The flow never sees a grade, never scores the work and never writes to
  Canvas. The teacher can overrule any verdict.

  Apps Script alone can't do this job: a word-overlap test is easy to game
  by copying key words, and it blocks honest answers written in a student's
  own words, English learners' most of all.
- **If the flow fails,** it retries. If it still fails, the answer waits in
  the teacher's review queue, where the teacher can grant the code. Nothing
  is issued automatically.
- **Cost:**
  - a few minutes from answer to code, similar to Flow 2's turnaround;
  - one Studio run per answer that passes the screen, against the daily run
    limit (D8). The screen exists partly to save those runs.

## The code

- **One per student per assignment**, stable across resubmissions.
- **Readable at a glance:** for example `CAS-8177-L05-7Q4K-M2XD`. That is the
  course and lesson, a random part from an unambiguous alphabet, and a check
  character that catches a typo.
- **Bound to one student and one assignment** in a Ledger tab
  (`TurnInCodes`: code, student, assignment, issued at, how (check or
  grant), the grant reason). Nothing in the student's doc is trusted as
  proof; P0-04 retired a turn-in gate that trusted a stamp in the doc.
- **The copy button** reuses the Teacher Dashboard's copy pattern:
  clipboard API, then `execCommand`, then a visible box. Apps Script's frame
  can refuse the clipboard.
- **The server function** that returns a student's code checks that the
  caller owns the assignment, as the submit path does, and returns only that
  student's code. It goes on `webapp-public-allow.json`.

## Checking the codes in Canvas

The teacher downloads the assignment's submissions ZIP from Canvas and drops
it in a Drive folder. A Teacher Dashboard check, behind the owner guard,
reads each text entry and matches the code to its owner.

- **Outcomes:**
  - *valid*;
  - *no code*;
  - *someone else's code*: the code's owner doesn't match the Canvas
    submitter;
  - *unreadable*.
- **Output:** a report, and a grade file for Canvas's gradebook import:
  completion for valid codes, nothing for the rest.
- **Sharing a code fails** because each code belongs to one student.

**To verify in Canvas** (operator, after dinner on 11-07). Describe the
patterns with names replaced; don't paste real file names here.
1. Inside the ZIP: one file per submission? What is the file name pattern
   (name, Canvas user ID, submission ID, attempt)?
2. How does a text-entry submission arrive (an `.html` file?), and what
   wraps the text?
3. Does the roster export (`52_CanvasRosterImport.js` reads the gradebook
   CSV) carry a Canvas user ID or SIS ID? The verifier needs one to match
   submitters without names. 52 ignores that column today.
4. Is the gradebook's CSV import enabled for teachers?
5. Is anonymous grading off on these assignments?

## Open questions

| # | Question | Leaning |
|---|---|---|
| T1 | The check: the Apps Script screen plus the Studio flow? | Yes. The flow judges the answer, never the work, and the teacher overrules it |
| T2 | "Current term": CAS's marking periods (`currentTerm_`, from `MARKING_PERIOD_ENDS`), or Canvas's grading periods? | CAS's marking periods, if they match the district's; one source of dates |
| T3 | The Canvas facts above | Operator, 11-07 |

## The lesson report (the gap, per lesson)

Counts only, one row per lesson. It feeds the lesson flywheel and Phase 0's
zero-shot test.

| Pattern | Likely means | Look at |
|---|---|---|
| Many codes, few primaries MET (even after revision) | Task or rubric unclear, too hard, or misaligned with the milestone | The milestone's wording and what the feedback keeps asking for |
| Primaries MET on the first try, thin reflections | Too easy, or pasteable | Phase 0's zero-shot test on that lesson |
| Few codes, few submissions | Friction or access, not learning | Where students stop in the cycle |

- **Each figure shows how many students it rests on.**
- **A lesson is flagged only when the pattern holds** across sections, or
  across two runs of the lesson.
- **Each lesson's dates are shown beside its numbers**, so a short week or a
  pre-holiday run isn't mistaken for a weak lesson.

**Later:** once summative results are recorded, compare them with CAS's
competency ratings. This needs summative scores in the Ledger, as counts per
competency with no student text. It is not needed now.

## Build stages (one PR each, switch off by default)

1. **The question, the screen and the code.**
   - The question on the card.
   - The Apps Script screen.
   - `TurnInCodes`; the code and the copy button.
   - The per-course switch.
   - For testing only, a stub verdict in place of the flow.

   **Stage 1 built (PR #391)**, `cas-ccps/scripts/71_TurnInCodes.js`,
   `tests/cas-ccps/turn-in-code.test.js`. Details settled in the build
   (the file's header has each in full):
   - *The switch* is `TURN_IN_CODE_COURSES`, read like the other per-course
     flags: blank or `off` is off everywhere and adds nothing to the
     dashboard's data; `8177`, a list, or `all`.
   - *The question's milestone.* Revise: the milestone the card's "Not
     yet:" line names (the latest check's first not MET). Passed: the
     latest check's first row, the primary. No milestone on file, no
     question (the teacher can grant).
   - *The screen.* At least `REFLECTION_MIN_WORDS` (10) words; no system
     text (`findSystemText_`); at most 2,000 characters; and an answer is
     "mostly pasted" when at least half (`TURN_IN_PASTE_MAX_SHARE`, 0.5) of
     its own 4-word runs appear in the question or the milestone. Quoting
     the milestone inside a real answer stays well under it.
   - *Where the answer goes.* `TurnInChecks` (Ledger), not `ReflectionLog`:
     a `ReflectionLog` row counts as a Submit when the next reflection
     questions are chosen, and 37 and 29 read them. This settles "Not
     doing"'s last line: the answer is the student's own words, kept with
     the Ledger record like the reflections. `TurnInCodes` holds no text but
     a grant's reason. Both are 5-year records in the retention schedule.
   - *The term rule.* A row's marking period is its AcademicYear when that
     is one ("2627_MP2"), else the one its Timestamp falls in by
     `MARKING_PERIOD_ENDS`. It must equal `currentTerm_()` today, at the
     answer and again at the verdict. No marking period either way, or none
     current (summer), is outside the term: only the grant then. A row is
     labelled with the period it was made in, so a doc made in one marking
     period and answered in the next needs the grant (rare: the
     rollout makes docs the night before).
   - *The code.* `CAS-<course>-L<lesson>-XXXX-XXXC`: lesson from the
     assignment's ConfigID (`L00` when it has none); seven random
     characters from Crockford's base32 alphabet (no I, L, O, U), from
     `Utilities.getUuid()`; the last character is a Luhn mod 32 check over
     the course digits, lesson digits and random part, which catches every
     single mistyped character and most swapped neighbours. Typed O is read
     as 0, I and L as 1. One code per student per assignment
     (StudentAssignments' assignment ConfigID), unique in the tab.
   - *A verdict past the term* marks the answer `ADDRESSES` and issues
     nothing; the teacher's grant can.
   - *The grant* is in stage 1 as an editor function,
     `grantTurnInCode(studentEmail, configId, reason)`, owner only, reason
     required. Stage 3 adds its dashboard button.
2. **The flow.**
   - The input and return tabs.
   - The prompt, generated like the other flow prompts.
   - The harvest, the retry and the review-queue entry.
   - A FlowBuildSpec row and the operator's Studio build steps.
3. **The teacher's side.**
   - The grant, with its reason.
   - The review queue for flow failures and overrules.
   - The Canvas ZIP check and the grade file.
4. **Canvas.**
   - The cartridge's submission type changes from URL to text
     (`build-canvas-cartridge.js` writes `<format type="url"/>` today).
   - Its instructions say "paste your turn-in code".
   - The operator re-imports the cartridges.
5. **The lesson report.**

Stages 1–2 can be piloted before Canvas changes: students see and copy codes
while Canvas still takes the URL.

## Not doing

- Issuing a code for a failed, timed-out or broken check.
- AI judgment of the work, or any score from the reflection check.
- Using code or reflection counts as a learning measure, or comparing
  students by them.
- A separate path for work CAS can't read.
- Storing more than the code, its owner and how it was issued. The
  reflection text stays where the dashboard's other reflections are kept.
