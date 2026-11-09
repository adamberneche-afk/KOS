# Turn-in code: proof of engagement in Canvas (2026-11-07)

**Status:** design, from the operator's decisions of 2026-11-07 and
2026-11-08. Stages 1 (PR #391), 2 (Flow 6, the turn-in check, PR #392),
3 (the teacher's side, PR #393) and 4 (the Canvas side, PR #394) are built,
behind a switch that is off; see "Build stages". The switch takes lessons
and codes carry the lesson's number since 2026-11-08 ("The pilot").
**Live 2026-11-09:** Flow 6 built in Studio and running, and the operator
turned the code on for **every lesson in both courses**
(`TURN_IN_CODE_COURSES` = `all`) instead of a few-lesson pilot; the Canvas
assignments are switched by hand as each lesson comes up. The decisions below are the operator's. **No question is open.** [`PLAN_2026-11.md`](./PLAN_2026-11.md) is the plan of record and
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
   Since 2026-11-08 (operator-approved follow-up) the same switch also takes
   lessons, so the pilot turns on only the lessons whose Canvas assignment
   takes a code (see "The pilot" below).
9. **The gap between engagement and competency is read per lesson, as a
   design signal, never per student.** A lesson where students earn codes
   but rarely show the milestone probably needs rethinking. It doesn't
   show that those students failed.
10. **The teacher can open one assignment past its marking period**
    (operator, 2026-11-08), for every student on it, with a reason and an
    optional end date, and close it again. The term rule then passes for
    that assignment; the check still decides every code. The per-student
    grant (decision 4) stays.
11. **Codes follow CAS's marking periods** (operator, 2026-11-08; T2):
    `currentTerm_()` from `MARKING_PERIOD_ENDS`, extended for one
    assignment by the teacher's override (decision 10). Canvas's grading
    periods are not read.
12. **Anonymous grading is off on these assignments** (operator,
    2026-11-08), so the submissions ZIP's file names carry the SIS ID the
    Canvas check matches on.

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
  course and the lesson's number in its course, a random part from an
  unambiguous alphabet, and a check character that catches a typo.
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

- **Outcomes** (stage 3 has the full list):
  - *valid*;
  - *no code*;
  - *someone else's code*: the code's owner doesn't match the Canvas
    submitter;
  - *unreadable*.
- **Output:** a report, and a grade file for Canvas's gradebook import:
  completion for valid codes, nothing for the rest.
- **Sharing a code fails** because each code belongs to one student.

**What Canvas gives** (verified by the operator, 2026-11-08; T3). Patterns
only, with no real names or IDs:
1. **The submissions ZIP** holds one HTML file per submission, named
   `<sortable name>_[LATE_]<SIS ID>_text.html`: the student's sortable
   name, `LATE_` when it was late, their SIS ID, then `_text.html`.
2. **Each file** holds a heading with the assignment title and the
   student's name, and the typed text in a box. The code is read from the
   box.
3. **The gradebook export CSV** (the one `52_CanvasRosterImport.js` reads)
   has `SIS User ID` and `SIS Login ID` columns.
4. **Gradebook CSV upload is enabled** for teachers.
5. **Anonymous grading is off** on these assignments (operator,
   2026-11-08; decision 12), so the file names carry the SIS ID.

**Matching** (stage 3): a file's SIS ID is looked up in the export's
`SIS User ID` column, and that row's `SIS Login ID` is the account the code
must belong to (`TurnInCodes`' GoogleID). The file's ID is checked against
Canvas's ID column too; a file that matches no row, or matches
inconsistently, is reported as a non-match, never guessed. **The grade
file** copies the export's identity columns as they are, plus one column
for the assignment.

## Open questions

| # | Question | Leaning |
|---|---|---|
| T1 | The check: the Apps Script screen plus the Studio flow? | **Decided (operator, 2026-11-08): the Apps Script screen plus a Studio flow.** Built in stage 2 (Flow 6) |
| T2 | "Current term": CAS's marking periods (`currentTerm_`, from `MARKING_PERIOD_ENDS`), or Canvas's grading periods? | **Decided (operator, 2026-11-08): CAS's marking periods**, extended per assignment by the teacher's override (decisions 10 and 11) |
| T3 | The Canvas facts above | **Resolved (operator, 2026-11-08):** see "What Canvas gives" |

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
   - *The switch* is `TURN_IN_CODE_COURSES`: blank or `off` is off
     everywhere and adds nothing to the dashboard's data; `8177`, a list, or
     `all`. Since 2026-11-08 it takes lessons too (see "The pilot" below).
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
     period and answered in the next fails it; the teacher's override
     (below) opens that assignment, or the grant covers one student.
   - *The per-assignment override* (decision 10):
     `openTurnInForAssignment(assignmentKey, reason, until)` and
     `closeTurnInForAssignment(assignmentKey, reason)`, editor only, owner
     guard, reason required, each a `TurnInOverrides` row. The key is the
     assignment's ConfigID as StudentAssignments records it
     (`CAS-8177-L05`), the same in every section, so one call covers every
     student's row; a lesson's key also covers its parts
     (`CAS-8177-L05-P2`). `until` is a date, open through that day; blank
     is open until closed. The term rule passes when the row's marking
     period is current or an open, unexpired override covers its
     assignment, at the answer and at the verdict.
   - *The code.* `CAS-<course>-L<lesson>-XXXX-XXXC`: lesson from the
     assignment's ConfigID (`L00` when it has none; since 2026-11-08 the
     lesson's number in its course, below); seven random
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
     required. Stage 3 added its dashboard button (the Turn-in codes panel).
2. **The flow.**
   - The input and return tabs.
   - The prompt, generated like the other flow prompts.
   - The harvest, the retry and the review-queue entry.
   - A FlowBuildSpec row and the operator's Studio build steps.

   **Stage 2 built (PR #392):** Flow 6, the turn-in check,
   `cas-ccps/scripts/72_TurnInCheckFlow.js`, the prompt and Studio steps in
   `cas-ccps/docs/TURN_IN_CHECK_FLOW.md`, `tests/cas-ccps/turn-in-check-flow.test.js`.
   Details settled in the build (the file's header has each in full):
   - *The tabs.* `TurnInCheckInput` (Timestamp, CheckID, Status, Try,
     PromptText; the flow starts on Status = `READY`) and
     `TurnInCheckReturn` (the flow writes ReturnedAt, CheckID, RawOutput).
   - *The feedback context.* CAS keeps no feedback text but the milestone,
     so the prompt has the milestone, what the feedback said about it (not
     met yet, or shown) and the question. The answer goes between
     `<<<STUDENT_ANSWER>>>` delimiters, neutralized, with braces and
     `<<<`/`>>>` removed; the delimiters are system text the screen turns
     down.
   - *The verdict.* Two lines, `VERDICT: ADDRESSES` or `VERDICT: NOT_YET`,
     and `REASON:` one sentence to the student, at most 300 characters. A
     return that is garbled, says it couldn't read the answer, carries
     system text or grade words, or names an unknown check is set aside and
     never applied; one for an answer since replaced, or already decided, is
     ignored.
   - *Retry and failure.* No return after `TIC_RETRY_AFTER_MS` (10 minutes):
     sent again, at most `TIC_MAX_RETRIES` (2) times; then `CHECK_FAILED`
     (about 30 minutes after the first send). No code; the card says "We
     couldn't check your answer. Your teacher can see it." and the student
     can send it again; the CAS attention signal and the overnight email
     count the failed checks still waiting, and an answer waiting over an
     hour. The rows wait in stage 3's review queue (the Turn-in codes
     panel), where the teacher can grant the code.
   - *Run budget (D8).* Only `PENDING_CHECK` answers are sent; at most
     `TIC_INPUTS_PER_RUN` (10) rows a run, retries included.
   - *The job.* `runTurnInCheckFlow`, a Ledger cycle job every 2 minutes
     (`installTurnInCheckFlow()`); nothing is read or written while the
     switch is off.
3. **The teacher's side.**
   - The grant, with its reason.
   - The review queue for flow failures and overrules.
   - The Canvas ZIP check and the grade file.

   **Stage 3 built (PR #393):** the Teacher Dashboard's **🎟 Turn-in codes**
   panel, `cas-ccps/scripts/73_TurnInTeacherPanel.js` (its server half; the
   markup and client are in `07`) and `74_TurnInCanvasCheck.js` (the Canvas
   check), `tests/cas-ccps/turn-in-teacher.test.js`. Details settled in the
   build (each file's header has them in full):
   - *Who can use it.* Every panel function checks `_isAuthorizedTeacher_()`
     and none is on `webapp-public-allow.json`; a grant also checks the
     student is the teacher's own this school year. The panel works with
     `TURN_IN_CODE_COURSES` off (the grant is the escape hatch) and says
     when students don't see codes yet. To keep the Teacher Dashboard's
     public functions teacher-only, 71's student side (the card's view,
     `getMyTurnInState`, `submitTurnInAnswer`, the client half) moved
     unchanged to `71b_TurnInStudent.js`, which the Teacher Dashboard does
     not load.
   - *Review answers.* Each student's latest answer whose check failed
     (`CHECK_FAILED`) and, on request, those the check called `NOT_YET`,
     when they have no code for the assignment: the student as the
     dashboard shows them, the assignment, the milestone, the question, the
     answer and the check's reason. **Issue code** is the grant, with a
     required reason (`How = GRANT`, the reason in `TurnInCodes`); that is
     how the teacher overrules a verdict. **Leave it** changes nothing.
     There is no "issue all".
   - *Give a code.* One student, one of their assignments, a required
     reason; the same internals as `grantTurnInCode()` (`_turnInGrant_`).
   - *Open an assignment.* The open overrides; open one of the teacher's
     assignments (reason required, optional end date) or close one (reason
     required), through `openTurnInForAssignment`'s internals.
   - *Check Canvas.* The ZIP and the export are picked from the folder 52
     reads exports from (`TEACHER_FOLDER_ID`, else the teacher's Drive),
     newest first. The teacher picks the CAS assignment and the gradebook
     column (`<Title> (<number>)`, the best title match preselected). Each
     file's SIS ID (from `<sortable name>_[LATE_]<SIS ID>_text.html`; the
     `LATE_` marker is ignored) is looked up in `SIS User ID`, then
     Canvas's `ID`; the row's `SIS Login ID` is the account, built as 52
     builds it. **The name in a file name is never read, matched, logged,
     shown or stored.** The code is read from the box (the heading is only
     compared with the column's title, a warning when it differs), tolerant
     of spacing, case and O/I/L, and its check character is checked.
     Outcomes: `VALID` (this student's code, for this assignment or a part
     of it), `NO_CODE`, `OTHER_STUDENTS_CODE`, `WRONG_ASSIGNMENT` (their
     code, another assignment), `INVALID_CODE` (bad check character, or no
     such code issued), `NOT_ON_ROSTER` (no row, or rows that disagree:
     never a guess), `NOT_TEXT_ENTRY`, `UNREADABLE`. More than one code in
     an entry: the first valid one, noted.
   - *The upload file* (the grade file). The export's identity columns
     exactly as the export has them (Student, ID, SIS User ID, SIS Login
     ID, Section), its Points Possible row, and one column, the chosen
     gradebook column's header verbatim: full points for a `VALID` row and
     a **blank** cell for every other row. Canvas leaves a grade unchanged
     for a blank cell, so the file only adds completion for valid codes.
     Full points come from the Points Possible row, or the teacher's number
     when it has none.
   - *What is kept.* The report (a Google Sheet: counts, then each
     submission's student from the Ledger) and the upload file go in the
     teacher's folder; the Ledger's `TurnInCanvasRuns` tab gets one row per
     run (who, when, assignment, column, counts), a 5-year record with no
     student data. Nothing from the ZIP is stored. The panel asks the
     teacher to delete the ZIP when done.
   - *Limits.* At most 400 files and 4 minutes a run; past either it stops
     and says so.
   - *The weekly routine* (teacher): in Canvas, Download Submissions (the
     ZIP) and Export the gradebook (fresh, so it has today's roster); drop
     both in the folder; 🎟 Turn-in codes → Check Canvas → Find files, pick
     the assignment and the column, Run the check; read the report; upload
     the CSV on Canvas's gradebook Import page; delete the ZIP. The first
     time, do a dry run on one assignment and read the report and the CSV
     before uploading anything.
4. **Canvas.**
   - The cartridge's submission type changes from URL to text
     (`build-canvas-cartridge.js` wrote `<format type="url"/>` for every
     assignment).
   - Its instructions say "paste your turn-in code".
   - ~~The operator re-imports the cartridges.~~ For the pilot, the
     assignments are switched by hand in Canvas instead (below).

   **Stage 4 built (this PR):** `tools/cas-ccps/build-canvas-cartridge.js
   --turn-in <selector>`, `tests/tools/canvas-cartridge-turn-in.test.js`.
   Details settled in the build:
   - *The selector.* Course codes and lesson ConfigIDs, comma-separated:
     `--turn-in 8177` (every 8177 lesson) or `--turn-in
     CAS-8177-THE-HYPE-MACHINE,CAS-8175-L05` (the `CAS-` prefix and case are
     optional). The lesson data has no unit field (8177's pacing guide
     groups lessons by quarter in prose only), so **there is no unit
     selector**: the pilot unit is named as its lessons. A part
     (`…-P2`) is refused, since Canvas keeps one assignment per lesson; so
     are a unit (`8177:U3`) and an unknown name, each with a message.
     8177's ConfigIDs are slugs (`CAS-8177-THE-HYPE-MACHINE`), not `L<nn>`.
     (So every 8177 code read `CAS-8177-L00-…`: stage 1 took the lesson
     digits from an `L<n>` the ConfigID doesn't have. Fixed 2026-11-08:
     codes carry the lesson's number; see "The pilot" below.)
   - *Default: nothing changes.* Without `--turn-in` the committed
     cartridges are byte for byte what they were (tested). A `--turn-in`
     build goes to `canvas-cartridges/turn-in/<course>.imscc`, which is
     git-ignored; `--check` refuses `--turn-in`.
   - *The XML.* A selected assignment's `<format type="url"/>` becomes
     `<format type="text"/>`, which Canvas's Common Cartridge importer turns
     into `online_text_entry` (it reads `text` and `html` as text entry,
     `url` as Website URL). Nothing else in the XML changes.
   - *The page.* The description opens with "**To turn this in:** open your
     assignment dashboard, answer the question about your feedback, then
     copy your turn-in code and paste it here.", the dashboard words linked
     to the URL the page's Get feedback section already links (no link when
     there is none). The existing instructions follow unchanged, except
     **How to submit**, which asks for the code by **Start Assignment** →
     **Text Entry** instead of the document's link.
   - *Points and group.* Points stay 100: completion credit comes from the
     teacher's upload file (stage 3). The cartridge sets no assignment
     group, so the teacher puts each turn-in assignment in the **formative
     group** by hand (decision 2).
   - *The hand switch.* `--turn-in <selector> --print` writes nothing; it
     prints the selected assignments (course, ConfigID, Canvas title) and
     the Canvas steps with the text to paste.

   **Re-import: don't, for the pilot.** What the repo records: a re-import
   into a course that already has the cartridge **duplicates its modules**
   unless the earlier modules are deleted first (operator, 2026-10-12), and
   a module that already has submissions has to stay (2026-10-22). Canvas's
   importer does carry each cartridge identifier into the item, so a
   re-import may instead update an assignment in place; either way it
   touches every lesson in the course, and deleting an assignment that has
   submissions loses them. So:
   - **The pilot (recommended): switch the pilot assignments by hand, no
     re-import.** Run `node tools/cas-ccps/build-canvas-cartridge.js
     --turn-in <the pilot's lessons> --print`. In Canvas, for each listed
     assignment: **Assignments** → the assignment → **Edit**; paste the
     instruction (A) at the top of the description and replace the
     Website URL paragraph under **How to submit** with (B), or (C) for a
     lesson in parts; **Submission Type**: Online, **Text Entry** checked,
     **Website URL** unchecked; **Assignment Group**: the formative group;
     points unchanged; anonymous grading off; **Save**. Then put the
     **same lesson list** in `TURN_IN_CODE_COURSES` in the Ledger's
     `_CONFIG` tab (since 2026-11-08 the switch takes lessons, so only the
     switched assignments' cards offer a code; see "The pilot" below).
   - **Later (the cartridge option):** a fresh import only: a new course
     shell, the next term, or a new teacher's install. Build with
     `--turn-in` and import `turn-in/<course>.imscc` instead of the
     committed one; move the turn-in assignments to the formative group.
   - **Any later re-import into the pilot course** (the carried "re-import
     both cartridges" included) must be built with the same `--turn-in`
     selection; a default build would put the pilot assignments back to
     Website URL, or add Website URL copies beside them. Delete the earlier
     modules first, keeping any with submissions.
5. **The lesson report.**

Stages 1–3 can be piloted before Canvas changes: students see and copy codes
while Canvas still takes the URL (the Canvas check needs stage 4's text
entries, which the hand switch gives the pilot assignments).

## The pilot: lessons, not courses (2026-11-08)

Found in stage 4: switching on `8177` showed the feedback question on every
8177 card, while only the pilot's assignments in Canvas take a code; and
8177's ConfigIDs are slugs, so its codes read `L00`. The operator approved
the fix before the pilot:

- **The switch takes lessons.** `TURN_IN_CODE_COURSES` keeps its name (one
  switch, one `_CONFIG` row; a second key would leave two values to
  reconcile) and now takes course codes and lesson IDs mixed, comma- or
  space-separated, in the cartridge builder's `--turn-in` syntax: the
  assignment ID StudentAssignments records (`CAS-8177-THE-HYPE-MACHINE`,
  `CAS-8175-L05`), case-insensitive, `CAS-` optional; a lesson covers its
  parts (`-P2`). Blank or `off` is off everywhere and `all` alone is every
  course, as before. An entry that is neither (a typo, a unit, `all` inside
  a list) is logged and ignored; a lesson the lesson data doesn't have is
  logged and matches nothing. An unknown entry never turns codes on more
  widely. 71's `turnInSwitchCovers_()` is the one reading of it: the card's
  question, `getMyTurnInState` and `submitTurnInAnswer`, Flow 6's
  materializer (an answer the switch doesn't cover waits) and the panel's
  banner (which names the courses and lessons on, and any entry ignored).
- **Codes carry the lesson's number.** The `L<n>` of a numbered ConfigID,
  else the lesson's place in its course's `LESSON_ORDER` (`55b`, the
  teaching order `LessonSchedule` is seeded in), so an 8177 slug lesson
  reads its number, and a part its lesson's. `L00` only when neither gives
  one (a unit assignment), and that is logged. The check character covers
  the lesson digits as before. The projects that issue codes, the Central
  Ledger (the verdict) and the Teacher Dashboard (the grant), both load
  `55b`; the Student Dashboard issues none (a test pins both). A code is
  checked by looking it up in `TurnInCodes`, never by matching its number
  to the ConfigID, so codes already issued stay valid and nothing is
  migrated (none are in production: the switch is off). If the teaching
  order changes, new codes for a moved lesson carry its new number; old ones
  stay valid. The Canvas check reads the lesson digits and decides by the
  code's assignment; it now also takes an 8177 slug assignment ID, which it
  turned down before.

**The pilot steps** (operator, then the teacher):
1. Pick the pilot's lessons.
2. `node tools/cas-ccps/build-canvas-cartridge.js --turn-in <lessons> --print`
   and switch those assignments in Canvas by hand, as it prints.
3. Put the **same list** in `TURN_IN_CODE_COURSES` (the `_CONFIG` tab, or a
   Script Property), e.g. `CAS-8177-THE-HYPE-MACHINE`.
4. Open the 🎟 Turn-in codes panel: its banner names the lessons on and any
   entry ignored.

## Not doing

- Issuing a code for a failed, timed-out or broken check.
- AI judgment of the work, or any score from the reflection check.
- Using code or reflection counts as a learning measure, or comparing
  students by them.
- A separate path for work CAS can't read.
- Storing more than the code, its owner and how it was issued. The
  reflection text stays where the dashboard's other reflections are kept.
