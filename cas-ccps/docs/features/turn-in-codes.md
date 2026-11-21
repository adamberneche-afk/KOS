# Turn-in codes (script 71)

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

`71_TurnInCodes.js` (Student Dashboard, Central Ledger and, since stage 3,
the Teacher Dashboard; 2026-11-07; the student side, `getMyTurnInState`,
`submitTurnInAnswer`, the card and its client half, moved unchanged to
`71b_TurnInStudent.js` on 2026-11-08, so the Teacher Dashboard loads 71
without serving student functions; stage 1 of [`meta/TURN_IN_CODE_PLAN_2026-11.md`](../../../meta/TURN_IN_CODE_PLAN_2026-11.md), D17).
Behind `TURN_IN_CODE_COURSES` (blank or `off` by default: off everywhere,
and the dashboard is exactly as before; `all`; or a list of course codes and
lessons, comma- or space-separated, in the syntax of the cartridge builder's
`--turn-in`: `8175, CAS-8177-THE-HYPE-MACHINE`, case-insensitive, `CAS-`
optional, a lesson covering its parts. Since 2026-11-08 it takes lessons, so
the pilot turns on only the lessons whose Canvas assignment takes a code: the
same list as `build-canvas-cartridge.js --turn-in <list> --print`. An entry
that is neither is logged and ignored. `turnInSwitchCovers_()` in `71` is
the one reading of it, for the card, the student functions, Flow 6's
materializer and the panel's banner). Once a
card's feedback has arrived (Revise or Passed), it asks one question built
from the student's own feedback in `CompetencyEvidence`: the milestone not
met yet (the card's "Not yet:" line), or the primary milestone shown. Since
2026-11-16 (the operator) a Revise asks what will change, where, and how
that shows it; a pass asks how what was shown connects to another goal: the
next part's one-line task when the assignment is a part (`turnInNextPartGoal_`,
from 13c or 55b), else another competency the same check measured. Once the
code shows, the card says it turns in this round, not a pass: on a Revise,
the next part opens when this part meets its goal, and the student can
submit for feedback as many times as they need; on a pass of a part, that
the next part is open. The code card names its Canvas assignment. The
answer is screened at once, with no AI: at least `REFLECTION_MIN_WORDS`
words, no system text, and less than half of its 4-word runs found in the
question or the milestone (`TURN_IN_PASTE_MAX_SHARE`). One that passes is
kept in the `TurnInChecks` tab as `PENDING_CHECK`; the screen never issues a
code. `applyTurnInVerdict_()` applies the check's verdict: `ADDRESSES`
issues the student's code for the assignment while it is in the current
marking period, `NOT_YET` keeps the one-line reason the card shows over the
form again, and a failed or unknown verdict changes nothing. Flow 6's
harvest (stage 2, `72`, below) calls it. The code
(`CAS-8177-L05-7Q4K-M2XF`: course, the lesson's number, seven random
characters from Crockford's base32 alphabet and a Luhn mod 32 check
character over all three) is one per
student per assignment, unique, and kept in the `TurnInCodes` tab with its
owner and how it was issued; the card shows it with **Copy turn-in code**
(the clipboard, then `execCommand`, then the code selected for Ctrl+C).
`grantTurnInCode(studentEmail, configId, reason)`, from the editor (owner
only), issues one with its reason, also after the term. The student
functions `getMyTurnInState` and `submitTurnInAnswer` act only on the
caller's own Ledger row. Past the marking period, the teacher can open one
assignment for every student on it (`openTurnInForAssignment("CAS-8177-L05",
reason, until)`, closed with `closeTurnInForAssignment`, owner only, kept in
`TurnInOverrides`); the check still decides each code. The term rule, the
override, the screen and the code are documented in the file's header.
The lesson's number is the `L<n>` of a numbered ConfigID, else the
lesson's place in its course's `LESSON_ORDER` (`55b`), so an 8177 slug
lesson reads its real number (2026-11-08; it read `L00` before) and a part
its lesson's; `L00` only when neither gives one, and that is logged. The
Central Ledger and the Teacher Dashboard, the projects that issue codes,
both load `55b`. Codes are checked by looking them up in `TurnInCodes`, so
codes issued earlier stay valid and nothing is migrated.

**Flow 6, the turn-in check** (`72_TurnInCheckFlow.js`, Central Ledger,
2026-11-08; stage 2, T1 decided by the operator: the Apps Script screen plus
a Studio flow). `runTurnInCheckFlow()`, a Ledger cycle job every minute (every 2 before 2026-11-14)
(`installTurnInCheckFlow()`; its own trigger without the cycle), harvests,
retries and materializes in one pass, and does nothing while
`TURN_IN_CODE_COURSES` is blank. Each `PENDING_CHECK` answer becomes one
`TurnInCheckInput` row whose `PromptText` is `FLOW_6_PROMPT` (generated from
[`docs/TURN_IN_CHECK_FLOW.md`](../TURN_IN_CHECK_FLOW.md)) with the
milestone, what the feedback said, the question and the answer between
`<<<STUDENT_ANSWER>>>` delimiters (neutralized, no braces, no `<<<`/`>>>`).
The flow makes one Gemini call and adds `VERDICT:` and `REASON:` lines to
`TurnInCheckReturn`. The harvest sets aside an unknown or garbled return,
ignores one for an answer since replaced or already decided, and otherwise
calls `applyTurnInVerdict_()`. No return after `TIC_RETRY_AFTER_MS` (10
minutes): sent again, at most `TIC_MAX_RETRIES` (2) times, then
`CHECK_FAILED`: no code, the card says "We couldn't check your answer. Your
teacher can see it." and takes the answer again, and the count is in the CAS
attention signal and the overnight email. The Studio steps, the fixture
(`installTurnInCheckFixture()`), the canary (`runTurnInCheckFlowCanary()`),
the binding and liveness checks are in that doc; the `FlowBuildSpec` tab
has its "Flow 6" rows. Input rows lose their `PromptText` once the check is
done, and both tabs drop finished rows after 14 days.

**The teacher's side** (stage 3, 2026-11-08; `73_TurnInTeacherPanel.js` and
`74_TurnInCanvasCheck.js`, Teacher Dashboard). T2 is decided (codes follow
CAS's marking periods, extended per assignment by the override) and
anonymous grading is off on these assignments, so D17 has no open
question. The header's **🎟 Turn-in codes** panel, teacher only
(`_isAuthorizedTeacher_()`; nothing added to `webapp-public-allow.json`),
works whether or not `TURN_IN_CODE_COURSES` is on (its banner says which
courses and lessons students see codes on, and names any entry the setting
ignored):
- **Review answers**: each student's latest answer whose check failed
  (`CHECK_FAILED`) and, on request, those it called `NOT_YET`, with no code
  yet: the student, the assignment, the milestone, the answer and the
  check's reason. **Issue code** grants it with a required reason (`How =
  GRANT`); that is the teacher's overrule. **Leave it** changes nothing. No
  bulk issue.
- **Give a code**: one student, one assignment, a required reason
  (`_turnInGrant_`, the same internals as `grantTurnInCode()`).
- **Open an assignment**: the open overrides; open or close one with a
  reason (`openTurnInForAssignment`'s internals).
- **Check Canvas**: the newest submissions ZIP and gradebook export in the
  folder 52 reads (`TEACHER_FOLDER_ID`, else the teacher's Drive); the
  teacher picks the CAS assignment (an 8177 slug ID too, since
  2026-11-08) and the gradebook column (best title match preselected). Each `<sortable name>_[LATE_]<SIS ID>_text.html` is
  matched by its SIS ID only (`SIS User ID`, then Canvas's `ID`; the row's
  `SIS Login ID` is the account, `canvasLoginAccount_()` in `00`, as 52
  enrols), never by the name in the file name, which is never logged,
  shown or stored. The code is read from the text box (spacing, case and
  O/I/L tolerated; check character checked). Outcomes: `VALID`,
  `NO_CODE`, `OTHER_STUDENTS_CODE`, `WRONG_ASSIGNMENT`, `INVALID_CODE`,
  `NOT_ON_ROSTER`, `NOT_TEXT_ENTRY`, `UNREADABLE`. Out: a report (a Google
  Sheet, students as the dashboard shows them) and an upload CSV for
  Canvas's gradebook Import: the export's identity columns verbatim, its
  Points Possible row, and the chosen column with full points for `VALID`
  rows and a **blank** cell for every other (Canvas leaves a blank cell's
  grade alone, so the file only adds completion). Both go in the folder;
  the Ledger's `TurnInCanvasRuns` tab gets one counts-only row per run. At
  most 400 files and 4 minutes a run. From the editor:
  `runTurnInCanvasCheck()` with `TURN_IN_CANVAS_ASSIGNMENT` (and optionally
  `TURN_IN_CANVAS_COLUMN`, `TURN_IN_CANVAS_POINTS`) as Script Properties.

The weekly routine: in Canvas, Download Submissions and Export the
gradebook; drop both in the folder; Check Canvas; read the report; upload
the CSV on the gradebook's Import page; delete the ZIP (it holds students'
work and names).

On the dashboards (Phase 3c, 2026-10-28) a lesson in parts is one lesson.
The Teacher Dashboard shows one row per student on their furthest open
part ("Part 2 of 5"), with links to the parts before it and **Open Part 3
now**. The Student Dashboard shows the open parts together under the
lesson's name, and a line for each locked part saying what opens it. The
lesson doc's Class status counts each part on its own row.

Flow 2 reads a later part with the student's earlier parts beside it
(2026-10-28): 37 puts the student's own work on the parts before it, read
from their docs, in the prompt's EARLIER PARTS block, to read for context
only (every milestone is judged on the part itself). It leaves the
FlowInput row once the check is done. After pushing, run
`syncFlowPromptsToSheet()`: Flow 2's prompt changed.
