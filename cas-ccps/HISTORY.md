# CAS — Process History

This is the reconciliation/build-session narration split out of
`README.md` (external product review, Finding 10 / "structural" tier —
the review correctly flagged this style of process narration as decaying
fastest and mattering least to a new reader; the review's own high praise
for this repo's code comments is unaffected — those are untouched, still
living in the source files they've always been in). If you're trying to
understand what this system currently does or how to set it up, you want
`README.md`, not this file. Come here when you need to know *why* something
is the way it is, or what a past session already checked and fixed so a
future one doesn't re-derive it from scratch.

`README.md`'s own "Known gaps" section stays in `README.md`, not here,
even though it also contains resolution write-ups for closed items — that
section is a live, cross-referenced reference list explicitly kept "so a
future session doesn't re-derive them," not decaying narration; moving it
here would break its own internal "see resolution N above" pointers for no
real benefit.

---

<!-- archive:pointer (tools/archive/file.js writes this) -->
**Entries before 2026-10-29** are archived word for word by school quarter: [2026-27, 1st quarter](../archive/2026-27-Q1/cas-ccps/HISTORY.md).
This file holds the current plan of record's era; `node tools/archive/search.js --entries`
searches the archived ones entry by entry.
<!-- /archive:pointer -->
## The nightly rollout catches up, 2026-10-29

The first live nights (10-27, 10-28) showed the rollout's limit: a run made
15 to 21 docs before its time budget. One 8175 lesson (71 students) used
every run, so 8177's current lesson, The Front Lines, got no docs, and no
lesson doc or agenda was made. The email didn't say so: RolloutLog's
PROBLEM rows reached only the signal doc. Now (58):
- **Catch-up runs.** A run that stops short (a "time budget" or "not
  reached" PROBLEM in APPLY) schedules `runLessonRolloutCatchUp` in about
  3 minutes, a one-off trigger it deletes when it fires, until a run
  finishes or 12 have run that day (`ROLLOUT_CATCHUP`). A run that
  finishes clears the count. `ROLLOUT_BUSY_UNTIL` keeps runs from
  overlapping; one that finds another going only schedules a catch-up. A
  preview never schedules one.
- **Shared time.** `_lrEnrollOrder_`: tonight's releases first (the
  current lesson, tomorrow's, Part 1 of a split lesson), then the rest,
  the courses taking turns. Each lesson's enrollment stops at an equal
  share of the time left, so leftover time passes on to the next.
- **A reserve** of a minute for the lesson docs (3b) and agendas (3c)
  when a course's rollout is on.
- **The overnight email (34c)** reports the last day's rollout problems
  and whether the latest run stopped short.

## Faster student docs: intake's lookups once a run, 2026-10-29

A rollout run made 15 to 21 docs before its time budget, about 7 to 11
seconds each. `intakeStudent_` (02) looked up, for every student, what is
the same for the whole lesson: the assignment (opening the Ledger,
MatrixRegistry and the whole Teacher Matrix), the teacher's prompt doc,
four of the five admin folder levels, and the Ledger twice more for the
student's rows. These are now kept for the run (`_intakeMemo_`); a failed
lookup is not kept, so the next student retries it. Copying, stamping and
sharing each doc are still per student.
`student-data-access-intake.test.js` runs three students through intake
and counts the lookups.

## Retention disposition approves rows by fingerprint, 2026-10-31

KOS Audit Docket IV (Medium): `applyRetentionDisposition` (57) checked an
approval as a count per record, a run removes at most 1,500 rows, and the
approval lasted until a run finished, so rows that became removable between
runs could be deleted (and their Docs trashed) under an approval that never
named them; it also took no lock while deleting by row numbers read
earlier. Now `previewRetentionDisposition` writes a SHA-256 fingerprint of
each removable row to the Ledger's `DispositionPending` tab and the approval
code covers that list; a run holds the script lock, refuses the whole run
if the list was edited, removes only rows whose fingerprint is on it, and
leaves (and counts) any other. Done clears the list. Nothing is past its
cutoff this school year, so no disposition has run yet.

## The duplicate repair opens each duplicate first, 2026-10-31

KOS Audit Docket III item 18 (re-filed in Docket IV): `repairRosterDuplicates`
(52) kept each student's earliest workspace per assignment and trashed the
later docs without opening them, so a student who had worked in a later copy
lost that work. A tested fix written on 2026-10-21 never landed. Now every
duplicate is checked first: its Ledger row (a submit or a check) and the doc
itself (writing below the response line, or any text in a doc without it;
a doc that can't be opened counts as work). The kept workspace is one with
work, then the recorded one, then the earliest; only empty duplicates are
archived and trashed, and any other one with work gets a Notes line for the
teacher. The 21 docs trashed on 2026-10-07 were already restored (#227).

## Flow 2 restarts an unanswered row, 2026-11-14

- **Found (11-13):** Studio's Flow 2 stopped answering for a day. Each
  submission's FlowInput row sat `READY` with no output and held its key,
  so the lane timed submissions out one after another, and an Admin
  Recovery Panel re-queue built nothing new and timed out again. Clearing
  `ReadyStatus` by hand restarted a row (the builder sets a blank row
  `READY`).
- **Now:** the builder (37) does that itself: a `READY` row unanswered 12
  minutes after it was last set `READY` is cleared, and set `READY` on the
  next run, at most twice; then it is `ERROR_NO_ANSWER`, which blocks only
  its own submission. A re-queue or resubmission whose row still waits
  restarts it at once. New columns `ReArms` and `ArmedAt`, appended. A late
  answer completes its staging row even after `ERROR_TIMEOUT`; a restarted
  row answered twice is applied once. The teacher's timeout email no longer
  asks for a hand edit of the FlowInput tab.
- **Tests:** `flow-input-builder.test.js` ("re-arm"),
  `evaluation-next-steps.test.js`.

## Parallel lanes in the staging turnstile, 2026-11-14

- **Found (11-13):** with Studio's Flow 2 not answering, the turnstile (06)
  held one row per teacher in flight, so 14 submissions timed out one after
  another, about 12.5 minutes apart; on a normal day a class submitting
  together also waits in single file.
- **Now:** up to `FLOW2_PARALLEL_LANES` rows per teacher are `IN_PROCESS`
  at once (a shared setting: Script Property or the Ledger's `_CONFIG`;
  default 3, at most 10 because Studio drops runs when many rows change at
  once; 1 is the old behavior). Oldest first; each row still times out on
  its own after 12 minutes; the single-lane fallback for a tab without
  `TeacherEmail` is unchanged. No reader assumed one row per teacher: the
  builder (37) works per row, and 07, 10, 13, 34, 34b and 34c count or show
  rows per doc.
- **Tests:** `staging-turnstile.test.js`.

## An email when Flow 2 stops answering, 2026-11-14

- **Found (11-13):** Studio's Flow 2 stopped answering for a day; the only
  sign was one timeout email per submission, to teachers.
- **Now:** each lane timeout backprop (03) closes adds one to a streak, and
  any Flow 2 answer the harvest (37) sees (fixture and canary aside) sets
  it back to 0. At two in a row `ADMIN_NOTIFY_EMAIL` gets one email, "Flow
  2 isn't answering — Studio may be down" (counts and times only, what to
  check); a latch in the Script Property `FLOW2_ALERT_STATE` holds further
  mail until Flow 2 answers again. The CAS attention signal (34b) shows the
  streak under ADMIN.
- **Tests:** `flow2-not-answering.test.js`, `cas-attention-signal.test.js`.

## Student Dashboard: this marking period, in assigned order, 2026-11-14

- **Found:** the page covered the whole school year (a term selector,
  "Whole school year" by default) and sorted every class by status, so done
  work and parts piled up across the year and lessons that build on each
  other were out of order.
- **Now (F16, approved 2026-11-14):** only the current marking period
  (`currentTerm_()`); a row with no marking period, or a closed-term
  assignment the teacher reopened (`TurnInOverrides`) or whose code the
  teacher granted, still shows. Within each class, the order the lessons
  were assigned: teaching order from `13c` (generated from `55b` and
  `STUDENT_CRITERIA.json`, so the 2 MB `55b` stays out of the project),
  then a teacher's own tasks by Timestamp. Do next is unchanged in purpose.
  A closed-term card leaves the page where it used to show "Ask your
  teacher" (`TERM_CLOSED`); the turn-in rule itself is unchanged.
- **Tests:** `student-dashboard-navigation.test.js`; `turn-in-code.test.js`
  and `term-marking-periods.test.js` updated for the closed-term cards.

## Student Dashboard: names on every card, a header menu, 2026-11-14

- **Found:** a part's card and Do next line said "Part 2 of 3: Step 2"
  without the class; 8175's names were all capitals; each card repeated the
  block's period and subject; the competency strip and the header's five
  controls came before the work.
- **Now (F16 items 6 and 7):** every card has the name in sentence case
  (display only), a lesson number chip, the part under it and one line on
  the task; Do next names the assignment, part and class. My Info and the
  terms panel are in a More ▾ menu; the competency counts follow the cards.
- **Tests:** `student-dashboard-navigation.test.js`; the Do next and part
  card assertions in `dashboard-plain-words.test.js` and
  `lesson-parts-dashboards.test.js`.

## Student Dashboard: one card per lesson, with its milestones, 2026-11-14

- **Found:** a lesson in parts showed every open part as its own card plus
  a line per locked part, and no card said what the lesson measures or how
  far the student had got.
- **Now (F16 items 4 and 5):** one card per lesson on the part to work on
  now, a part stepper, the next locked part's line, and the other parts on
  an "All parts" button. Each card lists up to three measured milestones in
  the student's "I can" words with Shown, Partly shown, Not shown yet or Not
  checked yet, from `CompetencyEvidence` (read once per load). Focus and
  scroll position survive a re-render.
- **Tests:** `student-dashboard-navigation.test.js`; the parts assertions
  in `lesson-parts-dashboards.test.js` and `student-dashboard-demo.test.js`.

## Student Dashboard: sort and filters, 2026-11-14

- **Now (F16 item 3):** a Sort menu (Assigned order by default, Needs
  attention first, Recently checked, Not yet shown first) and filter chips
  (Needs action, In progress, Not started, Done) above the classes; Do next
  is unchanged.
- **Not as proposed:** the choice is kept in page memory, not the
  browser's session storage, because of the 2026-10-22 rule that no
  cas-ccps page stores anything in the browser. A reload starts at
  Assigned order. The operator decides whether to make an exception.
- **Tests:** `student-dashboard-navigation.test.js`.

## Student Dashboard: the Competencies tab at a glance, 2026-11-14

- **Found:** the tab listed every competency and its evidence, but not what
  it means in the student's words, where it is practiced, or progress.
- **Now (F17, approved 2026-11-14):** the rating as number and words, the
  latest evidence beside it, the student's "I can" words per lesson, where
  it is practiced (a jump to this term's card), sorts by area, rating or
  recent evidence, per-area "shown this marking period / this year", and
  Recently shown and Next to practice lists. `13c` now holds every
  competency a lesson names (about 90 KB). Q26 (the 13 competencies no
  lesson measures) is on hold: shown like any other unrated one.
- **Tests:** `student-dashboard-competencies.test.js`.

## Student Dashboard: a Review panel per competency, 2026-11-14

- **Now (F17, SDV-N8):** a Review button on each competency shows, for each
  lesson that practices it, the plan's own one-line recap of it there, the
  key terms and any linked video, from a small generated file (`13d`, with
  `--check`); and the course's Covered So Far doc when the operator sets its
  ID on the Student Dashboard project too. No practice question.
- **Tests:** `student-dashboard-competencies.test.js`.

## Every minute on the way to feedback, 2026-11-14

- **Found:** the Ledger cycle ran every minute, but the harvest and part
  unlocks ran every 5 and the backprop and Flow 6 every 2, so the schedule
  alone could add about 9 minutes to a check Studio answered in one; and
  nothing recorded how long each job took, so whether Studio or the
  schedule held feedback up couldn't be told.
- **Now (the operator's "Build 1-4", item 1):** those four run every
  minute. Each job's run time (last, usual, today's runs and total, times
  put off by the budget) and the cycle's own (today's trigger time against
  the 6 hours Google allows a Workspace account a day) are kept in
  `LEDGER_CYCLE_TIMING` and shown by `showSetupStatus()` and
  `reportEvaluationHealth()`, with the schedule's share of the wait.
  `LEDGER_CYCLE_EVERY` slows a job again without a push.
- **Tests:** `ledger-cycle.test.js`, `setup-status.test.js`,
  `evaluation-health.test.js`.

## Student Dashboard: news while the page is open, 2026-11-14

- **Found:** the page had no way to learn that feedback had arrived; the
  student pressed Refresh, or the turn-in card said to.
- **Now (the operator's "Build 1-4", item 2):** while a card waits, the
  page polls a light `getMyWaitingStatus` (the caller's own cards only;
  the Ledger plus a shared, 15-second cached queue snapshot), 20 to 40
  seconds apart, only while visible, backing off on errors, capped at 60 a
  visit, stopping when nothing waits. A finished card is loaded and
  re-rendered alone, with a polite banner, a title change until the page is
  used, and a scroll unless the student is typing. The turn-in code is
  large with Copy. No Canvas link: none is configured.
- **Tests:** `student-dashboard-news.test.js`, `student-dashboard-demo.test.js`,
  `turn-in-code.test.js`.

## Student Dashboard: where the work is, and Try again, 2026-11-14

- **Found:** a waiting card said only "Waiting for feedback"; a timed-out
  one said "Taking longer than usual… your teacher knows", with nothing for
  the student to do but wait for the teacher's re-queue.
- **Now (the operator's "Build 1-4", item 3):** a stage line from the times
  the Ledger and staging rows already hold, "usually about N min" only from
  FlowMeasures' measured median, Check again (a status check) after 8
  minutes, and on a timeout "Check stopped ⚠" with Try again: the admin's
  re-queue for the student's own row, once per 10 minutes, server-enforced,
  no new queue or staging row.
- **Tests:** `student-dashboard-stages.test.js`, `dashboard-plain-words.test.js`.

## Teacher Dashboard: who is waiting, and is the checker answering, 2026-11-14

- **Found:** on 11-13 Flow 2 stopped answering for a day; the teacher saw
  timeout emails one by one, and nothing on the dashboard said students
  were waiting or that the checker had gone quiet.
- **Now (the operator's "Build 1-4", item 4):** a strip with "n students
  waiting over 10 minutes" (listed, with Give a code into the existing
  grant) and a light per checker, Flow 2 and Flow 6, red when it has work
  but no verdict for 10 minutes. Read from the sheets the Ledger's own
  alerts use; owner-guarded; once a minute while the page is in view.
- **Tests:** `teacher-dashboard-waiting-strip.test.js`.

## Student Dashboard: a Canvas button, 2026-11-15

- **Asked:** a button on the Student Dashboard that opens Canvas in a new
  tab, so a student can paste the turn-in code without hunting for the tab.
- **Now:** "Canvas ↗" beside Refresh in the header, and "Open Canvas ↗"
  beside Copy on a ready turn-in code. Both open the district's Canvas in a
  new tab; `CANVAS_URL` (a Script Property on the Student Dashboard project)
  changes it without a push, and anything but a plain https URL falls back.
- **Tests:** `student-dashboard-canvas-button.test.js`.

## Student guide: the turn-in code, 2026-11-15

- **Asked:** the student guide and the UX reference still taught the old
  turn-in ("turn in on Canvas" with the document's link, "the link to your
  last part") after the turn-in code went live for every lesson on
  2026-11-09 (D17).
- **Now:** `docs/STUDENT_QUICK_START.html` section 06 is the five-step path
  (open, write, submit, answer the one question, paste the code), what the
  code means (engagement, not quality; earnable on a Revise card; one per
  student and assignment, stable; revising after it is for learning and the
  final grade; the Canvas instructions say code or link), what a good answer
  does (names the part, says where, says why), and the stage line, Check
  again, Try again, the page's own check for news and the Canvas buttons.
  `USER_EXPERIENCE_REFERENCE.html`'s summary and Turning In pipeline name
  the code. Notebook copies regenerated.
- **Still says the old way:** the passed-check comment (37's
  `_fiCommentNextSteps_`) and 03's backup next-steps block tell the student
  to paste the document's link as a Website URL. The guide points to the
  Canvas instructions instead; changing the comment is a code change of its
  own.
- **Tests:** `student-guide-turn-in.test.js`.

## The lesson's name, not the course's, 2026-11-15

- **Asked:** note on `LEDGER.COURSE_NAME` that roster-import rows hold the
  Canvas course name there, and check what else prints that column as the
  lesson's name to a student or family.
- **Found:** the parent report (36) already names an item by its lesson
  (StudentAssignments, then the lesson data's title) and falls back to the
  column; now pinned by a test. Three student-facing places still read the
  column as the lesson: a locked part's line on the Student Dashboard (blank
  title), the Competencies tab's evidence (every piece read as the course),
  and the snapshot doc `refreshFormSnapshots()` makes for a form, deck or
  sheet copy (named after the course).
- **Now:** all three take the lesson's name from the TeacherMatrix through
  StudentAssignments (13's `_dashUnitNames_`, 02's `fetchAssignment_`), with
  the column as the fallback. The column itself is unchanged: 60 and 29
  read it as the course. A comment on `LEDGER.COURSE_NAME` says all this.
- **Left:** two teacher-facing reads (03's timeout and failure emails name
  the "lesson" from the column) and the doc menu's status line (01, through
  13's `handleStudentDocRequest_`; the menu doesn't run for student accounts).
- **Tests:** `lesson-parts-dashboards.test.js`, `student-dashboard-record.test.js`,
  `student-data-access-intake.test.js`, `weekly-parent-report.test.js`.

## Drive links out of the docs, 2026-11-15

- **Asked:** `archive/summer-2026/drive-curation/DELETION_MANIFEST.md` held 62 Drive and Docs
  links, against the rule that the repo keeps no Drive file IDs or links.
- **Now:** every Markdown doc is clean. The manifest, the Gemini handoff list
  and the unit cross-reference list keep their names, reasons and
  decisions; the lesson files' first line names the source doc by the title
  under it instead of its ID (69 files; `curriculum/lessons/README.md` and
  `docs/LESSON_IMPORT_PROCEDURE.md` say so, and the procedure no longer
  asks for the ID); LeaderHub's setup docs show placeholders. Code and data
  that use an ID or link (`data/deployment-urls.json` and the cartridges
  built from it, LeaderHub's lesson-plan table and blackout-dates link, two
  `.xlsx` catalogs, one test fixture) are unchanged and listed in the PR
  for the operator's L1 decision. Git history still holds the old links.
- **Check:** doc-currency Check 6 (`drive-id-in-doc`) fails on a Drive link
  or ID, or a web app link, in any Markdown doc.
- **Tests:** `doc-currency-check.test.js`.

## Feedback next steps: the turn-in code, 2026-11-15

- **Found (#439):** a passed check's next steps, in the feedback comment
  and the doc block, still said to copy the document's link into Canvas as
  a Website URL. Since 11-09 every Canvas assignment takes a turn-in code.
- **Now (the operator's "update this for clarity of the next steps"):** the
  next steps follow `TURN_IN_CODE_COURSES`. `all`: 1. answer the one
  question on the card to get the code; 2. copy it into the Canvas
  assignment (the Canvas button opens Canvas); improving is optional and
  the code stays the same. A Revise result adds that the code can be earned
  now, before passing. Off: the old link steps. A list of courses or
  lessons: follow the Canvas assignment's instructions (code or link). 03
  reads the switch from the shared config itself (`nextStepsTurnInMode_`),
  so neither 03 nor 37 needs 71 loaded. The student guide's example
  comment matches.
- **Tests:** `evaluation-next-steps.test.js`, `flow-input-builder.test.js`.

## The Canvas button's address, 2026-11-15

- **Found:** the operator gave the district's Canvas address after the
  push; #438's default named a different host.
- **Now:** the Student Dashboard's Canvas button and Open Canvas link
  default to the district's Canvas (`DASH_CANVAS_URL_DEFAULT`); LeaderHub's
  sub-plan Canvas field shows the same host as its placeholder.
  `CANVAS_URL` still overrides it without a push.
- **Tests:** `student-dashboard-canvas-button.test.js`.
- **Also:** `student-dashboard-stages.test.js` failed in the first minutes
  after midnight New York (a fixture stamped "6 minutes ago" fell on
  yesterday, so the stage line showed a date). Every clock in it is now
  pinned to a weekday noon, as `flow-measures` was in #422. No code change.

## Student Dashboard: three fixes from the demo check, 2026-11-15

- **Found (the operator's demo check after the push):** a lesson in parts
  read "Not started" beside milestones marked Shown (the marks are the
  lesson's best results across its parts; the label was the current
  part's); every mark said "Being checked" while a check ran, repeating the
  card's label; an area header on the Competencies tab wrapped its count
  onto a line of its own.
- **Now:** a lesson card's label names its part ("Part 3: Not started") and
  its marks carry a caption ("What this lesson checks, across its parts so
  far"); while a check runs the marks show one caption, "Checking these
  now", and no tag on the lines not found yet; each count in an area header
  stays on one line.
- **Tests:** `student-dashboard-navigation.test.js`, `student-dashboard-competencies.test.js`.

## The Ledger cycle: checks before work, 2026-11-15

- **Found (the operator's `showSetupStatus()` just after the 11-15 push):**
  an idle cycle (midnight, nothing waiting) took about 14.5 s. Usual times
  per job: `bridgeQueue` 1.4 s, `runStagingTurnstile` 1.3,
  `buildFlowInputRows` 1.9, `harvestFlowInputResults` 1.3,
  `backPropagateCompletions` 2.3 (slowest 20.5), `unlockReadyParts` 2.2,
  `runTurnInCheckFlow` 2.9; the 5-minute warm-up jobs about 13 in all;
  `runQueueWatchdog` about 22 every 10 minutes. Since #434 every job on the
  way to feedback ran every minute, so 1,440 cycles × 14.5 s came to about
  5.8 h a day against the 6 h daily trigger run time Google gives a
  Workspace account, which the nightly rollout and every other trigger in
  the project share. The cost was mostly fixed: each job opened the
  spreadsheet and read whole tabs (FlowInput with its prompts) with nothing
  to do.
- **Now (approved by the operator 11-15):**
  - each of those seven jobs has a check beside it (`03`, `06`, `37`, `68`,
    `72`) that reads one or two columns through one open of the
    spreadsheet per cycle, and the job runs only when the check finds work.
    A check skips only when sure; one that can't read runs the job. The
    part unlock remembers a run that unlocked nothing until the Ledger's
    Status column or the evidence or assignment row counts change;
  - a job that ran makes the cycle check the steps after it at once:
    bridge → turnstile → FlowInput row, harvest → backprop → part unlock,
    each in one cycle instead of up to three;
  - quiet hours (default 10 p.m.–6 a.m., weekends, days off) hold the jobs
    without a check; the checks still run, so a submission at night is
    processed;
  - every 15 minutes the cycle runs every due job without checks (the
    backstop);
  - `showSetupStatus()` and `reportEvaluationHealth()` project the day's
    trigger time at this rate, WARN over 50% of the quota, ALERT over 80%;
  - `installLedgerChangeProbe()` logs whether Studio's writes fire an
    onChange trigger, for a later change to move the harvest onto it.
- **Settings:** `LEDGER_CYCLE_GATES` (`off`: as before), `LEDGER_CYCLE_QUIET`,
  `LEDGER_CYCLE_BACKSTOP`.
- **Tests:** `ledger-cycle-gates.test.js`; `ledger-cycle.test.js` now pins
  its clock to a school-day morning.

## Flow 2: malformed results, duplicate writes, the fixture row, cycle settings, 2026-11-15

- **Found (the operator's live FlowInput rows, 11-15; described, not copied):**
  - one answer in two rows of the same doc, a submission and its
    resubmission about an hour apart, and it answered the later one's
    process reflection: Studio Flow 2's Update rows step matched on a
    column that isn't unique to a submission;
  - on 11-13 one answer evaluated another lesson's work, asked for that
    lesson's revisions, and carried an outcome the prompt never allows
    (`PARTI_MET`). The student got it. Flow 2's Ask Gemini step had the
    Central Ledger as a Drive source, so the model saw every row on it;
  - a Flow 2 fixture row still in FlowInput after `cleanUpFlow2Canary()`,
    which clears canary rows only (`VDOE-CANARY-`); the fixture's came
    from `installFlow2Fixture()` (39), `StagingRowRef` `FIXTURE`;
  - `LEDGER_CYCLE_EVERY` typed on the Ledger's `_CONFIG` tab did nothing:
    64 read its four settings from Script Properties only.
- **Now (approved by the operator 11-15):**
  - the harvest (37) checks each result before anything reaches the
    student (`_fiCheckResultShape_`): a parseable outcomes line (the last
    one), only `MET` / `PARTIALLY_MET` / `NOT_MET`, the row's milestones
    (four keys always accepted), one compliance stamp, and a stamp the
    passing rule agrees with (a tiered rule both ways; untiered, `APPROVED`
    needs every milestone `MET`). Before, the stamp decided, except a
    tiered `APPROVED` the outcomes didn't support, which was delivered as
    revise; now neither wins. A malformed result is never delivered: it is
    re-armed once on #425's counters (`ReArms` set to the budget,
    `ArmedAt` now, output cleared), then `ERROR_MALFORMED_OUTPUT`, which
    closes like the other errors ("Couldn't be checked" on the card) and
    has its own column in the Measures tab (69); FlowMeasures counts it
    as set aside (69b);
  - an answer found in an earlier row of the same doc (SHA-256 of the
    output, never the text) is a duplicate write: a dates-only row in the
    new `Flow2Duplicates` tab; the newer row is delivered, an unharvested
    older copy re-armed. For 7 days `showSetupStatus()` has a WARN naming
    the fix (match on `StagingRowRef`), the overnight check (34c) a line
    (so the CAS signal's LAST NIGHT too), and the Teacher Dashboard's
    Flow 2 light says so (07 reads the tab's tail);
  - `checkFlow2Binding()` (41) counts rows holding a copied answer and
    names the Studio setting; it and the build spec (42: Flow 2 `match`
    and `gemini` rows), the setup guide and the Studio reference now say:
    Update rows matches on `StagingRowRef`; Ask Gemini has no Drive file
    sources, evaluates one row per run, and its prompt holds only the two
    variables;
  - `removeFlow2Fixture()` (39) clears Flow 2's fixture alone (any marker:
    `FIXTURE`, a `VDOE-FIXTURE-` ConfigID, a fixture address);
    `removeFlowFixtures()` uses the same match; `cleanUpFlow2Canary()`
    and `showSetupStatus()` say when a fixture row is left;
  - `LEDGER_CYCLE_EVERY`, `_GATES`, `_QUIET` and `_BACKSTOP` are read like
    the other shared settings (`lcSetting_`: the Script Property, else the
    `_CONFIG` tab through 00's 10-minute cache, kept for the cycle), and
    are `SHARED_CONFIG_KEYS`; `showSetupStatus()` says where each came
    from. A cycle opens no more spreadsheets than before.
- **Not fixed here:** `StagingRowRef` is unique per submission until an
  admin's `clearStagingPipeline()` renumbers the staging tab; an old
  harvested row can then share a number with a new one. The duplicate
  check would flag a copy that came of it.
- **Tests:** `flow2-malformed-results.test.js` (new); `flow-input-builder`,
  `flow-fixtures`, `flow2-canary` (the canned answers agree with their
  stamps now), `ledger-cycle-gates`, `setup-status`, `evaluation-health`,
  `overnight-health`, `teacher-dashboard-waiting-strip`.

## Flow 2 fixture: two rows at once, 2026-11-15

- **Why:** Flow 2 now loops over the rows a Studio run groups together
  (Repeat for each). Without a test student account, nothing could make two
  rows change together to test that.
- **Now:** `installFlow2Fixture(2)` seeds two fixture rows READY in one
  write: the campaign pitch and a second, different assignment (a stadium
  concessions plan), each with its own StagingRowRef ("FIXTURE",
  "FIXTURE-2"), scratch doc and prompt. `checkFlow2Fixture()` says whether
  each got its own feedback (not empty, not the other assignment's, not a
  copy). `removeFlow2Fixture()` clears both. `installFlow2Fixture()` with no
  argument is unchanged.
- **Tests:** `flow-fixtures.test.js`.

## Undoing a burst of feedback comments, 2026-11-15

A Studio Test run of Flow 2, with its starter's condition set to "any",
looped over every FlowInput row, not only READY ones, and wrote a new
evaluation into each. The harvest delivers any EVALUATED row, so the new
feedback went onto students' docs as comments, and onto the Ledger. The
Ledger comes back from version history; the comments don't, so
`removeFeedbackCommentsPosted(from, to, doDelete)` (37) removes them. It
checks each doc FlowInput names once (the snapshot doc for a form part;
fixture rows skipped), takes only comments this account posted inside the
window whose text starts "Feedback, " (only `_fiFormatFeedbackComment_`
writes that), and is a dry run unless the third argument is true. The window
must be under a day. It logs row numbers and counts, never a file ID, stops
at 4.5 minutes and can be run again. Feedback that went into a doc's body
(when a comment failed to post) isn't found; doc version history covers
that. Tests: `tests/cas-ccps/feedback-comment-cleanup.test.js`.

## Grading consistency from the re-grade, 2026-11-15

The operator chose to keep the Ledger as the Test run left it rather than
restore it: about 90 submissions now have two gradings of unchanged work,
a sample of Flow 2's consistency no one would set up on purpose.
EvaluationLog keeps only pass or revise, and can't tell a student's
submissions of one lesson apart, so `reportRegradeConsistency` (69) reads
FlowInput instead: the original gradings from a copy of the Ledger's
version before the re-grade, the re-grades from the live tab, paired on
StudentFileID + ConfigID + StagingRowRef. Each side goes through
`_fiCheckResultShape_`, so an original that answered for another lesson
(before the Studio fixes) is counted as malformed where it shows, and
`cleanFrom` sets apart the originals built after a fix. Counts and unit
names only; it writes nothing. Tests: `tests/cas-ccps/regrade-consistency.test.js`.

## Feedback the cleanup took away, and copied originals, 2026-11-15

Comparing FlowInput before and after the re-grade raised two problems with
what was done that afternoon. First, 11 rows show no answer in the copy of
the earlier version. The operator remembers them going through before the
test; if they didn't, the re-grade was their first feedback and the cleanup
deleted it (3 had a newer row with 11-14 feedback, leaving up to 8 docs with
none). The function below tells the two apart by the comments on each doc. `repostMissingFeedback(doPost, skipRefs)` (37) takes
each doc's newest row. When that row is HARVESTED and has no "Feedback, "
comment from this account since it was built, it lists the row, and with
`doPost` true posts the row's result as the harvest would. Superseded rows,
skipped refs, malformed results, unharvested rows, fixtures and assignments
that keep feedback in the doc are never posted. A posted row has its
comment, so a second run posts nothing. Second, about 8 original gradings
were a newer submission's answer (the duplicate-write bug), so their pairs
compared different drafts. `regradeConsistency_` (69) now counts an original
that holds the same text as a newer row of the same doc apart, not compared.
Tests: `tests/cas-ccps/feedback-repost.test.js`,
`tests/cas-ccps/regrade-consistency.test.js`.
The operator reports a new Gemini model around the same days, which likely
affected inference; if Studio's step changed model between the originals and
the re-grade, the consistency numbers compare two models.

## Flow 2's gradings by version, 2026-11-16

Flow 2 changed several times under live use: the grader (tiers and the
passing rule, objectives, the reflection, earlier parts, guards), students'
behavior (parts, the turn-in code) and the platform (Studio's hydrogen 4.1
release on 11-13, a new Gemini model that afternoon, the restart on 11-14,
the rebuild on 11-15). `meta/FLOW2_VERSIONS_2026-11.md` lays them out.
`reportGradingByVersion` (69) reads a grading's prompt version from the
row's own PromptText, never its date, and its platform from when it was
graded. It takes the originals from a copy of the Ledger from before the
re-grade, since the re-grade overwrote them in FlowInput, and groups the
re-grade of the same rows by their prompt version. It counts copied
originals apart and writes nothing. Tests:
`tests/cas-ccps/grading-by-version.test.js`.

## What made each result: the run line and provenance, 2026-11-16

Flow 2 changed under live use: the grader, students' behavior, and Studio
and its model (a new model on 11-13 with no change of ours). Its results
didn't say which version made them, so the versions had to be rebuilt from
handoffs. Now each result records them. The operator's idea: put the
model's identification in the prompt and the output. A model knows its
name from its training, not from what runs it, so its own report is kept
as a hint (`ModelReported`). The same line carries two values the model
only copies, which are reliable. A random **run key** per FlowInput row
catches an answer in the wrong row (the duplicate write, another lesson's
answer). The **prompt version**, `f2-` plus 8 hex of the template's
SHA-256, catches a prompt Studio didn't take from the row.

- **15b:** section 5c asks for `[RUN_INFO: {"run":…,"prompt":…,"model":…}]`
  after the stamp lines and before the outcomes line, which stays last.
  The security note names it as system text; 00's `SYSTEM_TEXT_PATTERNS`
  refuses it at Submit.
- **37:** `_fiBuildPromptText_` fills `{{RUN_KEY}}` and
  `{{PROMPT_VERSION}}`. `_fiProvenance_` compares the answer's line with
  what the row's own PromptText sent. `EvaluationLog` gains CodeVersion
  (43's deploy marker), PromptVersion, PromptHash, RunCheck and
  ModelReported, and an older tab gets the headers on its next write. The
  line is stripped with the outcomes line. A failed check is recorded and
  logged, never held back, until a week of data says whether a
  `RUN_KEY_MISMATCH` should be.
- **35:** the canary's simulated answer has a run line, and the canary
  fails if it reaches the student.
- Studio needs no change: its Ask Gemini step reads each row's PromptText.
- Tests: `tests/cas-ccps/flow2-run-info.test.js`.

## The turn-in question, and the assignments loop's clarity, 2026-11-16

From a quick UI/UX audit of the loop (dashboard, doc, Submit, wait,
feedback, turn-in code, revise or next part), and the operator's direction
on the turn-in question:

- **The question (71, the operator).** On a Revise, what will change, where
  in the document, and how that will show the milestone. On a pass, how what
  was shown connects to another goal. That goal is the next part's one-line
  task when the assignment is a part (`turnInNextPartGoal_`, from 13c's
  `DASH_LESSON_INFO` in the Student Dashboard or 55b's `LESSON_PARTS`
  elsewhere), else another competency the same check measured; with
  neither, the old question stays. The screen also counts that goal's text
  as text not to copy. Flow 6 is told what a good answer does: on a pass,
  it names a real link and points to the work; on a Revise, it says what,
  where and how.
- **What the code means (71b, 03, the student guide).** The code card names
  its Canvas assignment (with the part), and says the code turns in this
  round. On a Revise, Part n+1 opens when Part n meets its goal (its task
  line), and the student can submit for feedback as many times as they
  need. On a pass of a part, the card says the next part is open. The
  feedback's "you don't have to pass first" is now "get your code for this
  round, then revise and submit as many times as you need". The `READY`
  view carries the feedback's kind for this.
- **The comment (37, audit item 1).** No `[SYSTEM: …]` or
  `[SUGGESTED_SCORE: …]` line (the result line says Passed or Revise, the
  Ledger keeps both, and the prompt says a student is never told a score),
  no machine-section headings, no section numbers. Doc-mode feedback is
  unchanged: 04 reads the score line there.
- **The card (13, audit items 3 and 5).** A Revise card's filled button is
  Open My Document, with Submit beside it outlined: the first step is
  reading the feedback. The locked-part line names the goal: "Part 2 opens
  when Part 1 meets its goal: '<its task line>', or when your teacher
  opens it."
- Tests: `turn-in-code.test.js`, `turn-in-check-flow.test.js`,
  `evaluation-next-steps.test.js`, `flow2-run-info.test.js`,
  `dashboard-plain-words.test.js`, `lesson-parts-dashboards.test.js`,
  `student-dashboard-navigation.test.js`.

## Part 2 locked after a turn-in code on Part 1; the stepper's dots, 2026-11-16

The operator saw a student earn a turn-in code on Part 1 while Part 2
stayed locked. The two rules were each built as designed, but they read as
one. A turn-in code is earned on any feedback, Revise included (71: the
question asks what the student will change). A part opens only when the
latest check of the part before it found that part's primary MET (68). So a
code on Part 1 doesn't open Part 2. There was a second likely cause: the
11-15 re-grade wrote new CompetencyEvidence for every row, and it was the
harsher one (`NOT_MET` 50 → 74). The rule reads the latest check, so a
primary that was MET can now read PARTIALLY_MET.

- **68: `explainLockedParts()`** gives, for each student's next locked part,
  one of `READY`, `PRIMARY_NOT_MET`, `PRIMARY_NOT_IN_EVIDENCE`,
  `PREVIOUS_CHECK_FAILED` or `PREVIOUS_NOT_CHECKED`. It also says whether an
  earlier check found the primary MET, whether the latest check is the
  re-grade's, and whether the student holds a turn-in code for the part
  before. It reads only, and logs row numbers and IDs, never a name or file.
  The teacher opens a part by hand from the Teacher Dashboard.
- **13: the stepper's dots are buttons.** They were a text label
  (`role="img"`), so the only way to another part was **All n parts**. An
  open part's dot now shows that part in the card: it is underlined and
  carries `aria-current`, and focus returns to it after the redraw. A locked
  part's dot is dimmed and opens **All n parts** at its line. Each dot's
  label names the part and its state. The choice is page memory.
- Tests: `lesson-parts-unlock.test.js`, `lesson-parts-dashboards.test.js`,
  `student-dashboard-navigation.test.js`.

## What runs Flow 2: StudioConfig and the daily drift probe, 2026-11-16

The two pieces of provenance Apps Script can't read from Studio
(`39b_Flow2Provenance.js`):

- **StudioConfig, the operator's record.** It has one row per Studio change
  (From, Flow, Step, Model, Settings, Note, RecordedAt), and rows are only
  added. `installStudioConfig()` seeds the 11-13 to 11-15 history without
  model names, since none were recorded at the time.
  `recordStudioChange({...})` records a change, and `confirmStudioConfig()`
  records a check that found none. The harvest (37) stamps the model in
  effect for Flow 2's Ask Gemini step on each `EvaluationLog` row
  (`ModelConfigured`). `showSetupStatus()` warns when the record is
  missing, names no model, or is over 14 days old. The readers live in 37,
  beside the harvest.
- **The daily drift probe.** The 11-13 model change came with no change of
  ours, so a record alone would have missed it. Once a day Flow 2 grades the
  first fixture's text, as a FlowInput row with StagingRowRef `PROBE`. The
  harvest leaves that row alone, and the fixture tools and reports treat it
  as a fixture without counting it as a leftover. The next run records the
  answer in `Flow2Drift`: the stamp, the outcomes, the shape (section
  headings with their numbers, the milestone label style, the machine
  lines), the length in steps of 250 characters, the run check, the
  reported model, and our code and prompt versions. It then reseeds the
  probe. A model, shape or large length change with the same code and prompt
  is `PLATFORM`, and the overnight email and `showSetupStatus()` say so for
  3 days. An unanswered probe is said at once. Changes in the stamp and
  outcomes are noted but not flagged, since the same work can grade
  differently from run to run.
- Tests: `tests/cas-ccps/flow2-provenance.test.js`; ModelConfigured in
  `tests/cas-ccps/flow2-run-info.test.js`.

## Clean-up C1 and C2: the custom Studio steps and the AutoInstaller archived, 2026-11-17

Approved by the operator on 2026-11-17, after the 10-29 dead-ends audit
found `cas-ccps/studio-steps/` was never archived, and the 11-08 handoff
listed C1–C3 as needing a decision. The repo's pattern for this is
`archive/2026-27-Q2/cas-ccps/archived/` (as with `70_WorkFileProbe.js`): out of every project,
push, test run and lint, and kept for reference.

- **C1, the custom Studio steps** → `archive/2026-27-Q2/cas-ccps/archived/studio-steps/`, with
  their manifest and clasp template under `clasp/`. They were never
  reachable: the district's GCP block keeps a custom step out of Studio's
  picker, and 37 and 41 replaced every one. Changes: the
  `cas-ccps:studio-steps` project is gone from `project-map.json`, as are
  its GCP-map surface, its sandbox push in CI, gas-lint's deployable-folder
  entry and doc-currency's surface-doc entry. Its nine tests moved to
  `archive/2026-27-Q2/tests/cas-ccps/archived/` (they pass by hand, 72);
  `competency-evidence-schema-compat.test.js` still reads
  `CommitStudentEvaluationStep.gs` from the archive. deploy-drift's two
  tests that used it as the one project with no marker now use projects
  with a marker and leave it out.
- **C2, `21_AutoInstaller.js`** → `archive/2026-27-Q2/cas-ccps/archived/`: the Apps Script
  API installer, which needs a Cloud project. `run.js` installs every
  project. It's out of the Unified Manual, along with its menu item
  ("Install Scripts Automatically") and that project's `script.projects`
  and `script.deployments` scopes. Dropping scopes asks for no new consent.
  `docs/REGISTRY_SHEET_SETUP.md` is marked archived.
- **C3** (kos-personal's inference service) is in `kos-personal/CHANGELOG.md`.

## A lesson's missing later parts: the catch-up, 2026-11-17

A student met Part 5 of the Buyer's Product Pitch and Part 6 never
appeared. Part 6 (the Slides part) was added to `PARTS.json` on 11-09
(#417), after the lesson went out; the nightly rollout makes a lesson's
parts only while the lesson is current or within its lead days, so no
student had a Part 6 Ledger row, and `unlockReadyParts()` skips a part with
no row without a word. (From the code; the Central Ledger confirms it.)

- `previewLessonPartsCatchUp(lessonKey)` / `applyLessonPartsCatchUp(lessonKey)`
  (58): Parts 2 and up of one lesson, seeded if missing, then enrolled with
  `deferShare` (locked, unshared) under one time budget, then
  `unlockReadyParts()`. Refuses a lesson not in parts and one students have
  whole. Part 1 is never made (an old lesson's Part 1 would stay locked).
- `explainLockedParts()` (68) reports `NO_ROW` for a student whose last open
  part has a next part with no row, naming the catch-up to run.
- Tests: `tests/cas-ccps/lesson-rollout.test.js`,
  `tests/cas-ccps/lesson-parts-unlock.test.js`.

## Competency IDs stored as dates, 2026-11-17

`explainLockedParts()`, run after the Part 6 catch-up, found locked parts
whose primary was "not in evidence" with the evidence's ID read as
"Tue Jul 01 8177": Sheets reads "8177-7" in a plain cell as July 8177. Every
competency ID ending in 1 to 12 that Flow 2 wrote to `CompetencyEvidence`
was stored as the first of that month, so every reader comparing IDs missed
it: the part unlock (a part whose primary is one of them never opened on a
MET), and the dashboards' and the SCR engine's counts for those
competencies.

- `competencyIdText_` (32), written 10-06 when the same thing happened to
  the registry and rubric imports, reads such a cell back as its ID; it
  hadn't reached the evidence readers.
- Flow 2's evidence writer (15c) formats the competency_id cells as text
  before writing.
- `repairCompetencyIdDates()` / `repairCompetencyIdDates(true)` (15c)
  rewrites the stored dates as their IDs, in text format: a dry run first,
  counts and IDs only.
- The part unlock and `explainLockedParts` (68) read IDs through
  `competencyIdText_`, so they're right before the repair too.
- Tests: `tests/cas-ccps/competency-id-dates.test.js`, and an unlock test in
  `lesson-parts-unlock.test.js`.


## The students' questions in plain words, 2026-11-17

The operator: the reflection questions read as confusing, from the wording,
not the idea. The audit (`meta/AUDIT_STUDENT_QUESTIONS_2026-11-17.md`)
measured all 2,179 questions a student can be shown: a median of 44 words
and up to 110, because each quoted the competency's whole "I can" goal, and
some quoted two and asked three things.

- `REFLECTION_FRAMES` (00) and `turnInQuestion_` (71): one short ask each,
  8 to 16 words. The goal is a separate field (`goal`, `goalLabel`; 71's
  `turnInGoals_`), shown on its own line above the question on the
  dashboard (13) and the turn-in form (71b).
- Stored and sent as one line with the goals first
  (`reflectionQuestionText_`, `turnInQuestionText_`): ReflectionLog,
  Flow 2's prompt, the reflection comment, TurnInChecks and the check flow
  (72) still see which goal an answer is about.
- Tests: `process-reflection`, `turn-in-code` and `turn-in-check-flow`.
## View feedback opens the comment, 2026-11-17

The operator: students have trouble getting to their feedback; it's closed
when the doc opens and they have to find the button. Feedback posted as a
comment (`FEEDBACK_AS_COMMENT`) isn't attached to any text, so Google Docs
keeps it behind the Comments button.

- 37 keeps the comment's ID when it posts the feedback, and the doc
  header's feedback line (63) links its words "the comment on this doc" to
  `…/edit?disco=<ID>`, the link Google's own comment emails use, which opens
  the doc with that comment open.
- The dashboard's View feedback (13) opens a tab on the click, asks
  `getMyFeedbackLink` (the student's own Ledger row only) for that link and
  goes there; with no link, a failure or pop-ups blocked it opens the doc
  as before. No sheet keeps the ID: a resubmit resets the line and the link.
- Tests: `feedback-as-comment`, `flow-input-builder`, `turn-in-code`.
- **To verify live once:** that a `?disco=` link opens an unanchored
  comment for a student (it does for anchored ones in Google's emails).

## Show me around, 2026-11-17

The operator: students don't find the feedback or the document's outline on
the left; they love them once they do, but neither is part of their normal
work. "We need to train the students or make it more obvious."

- A walkthrough on the Student Dashboard (13): the dimmed page with each
  part lit in turn and a card with Back and Next; a drawn Google Doc for
  Comments and the outline; More ▾ → Show me around any time.
- It starts by itself on a student's first visit. Whether they've seen it is
  a Script Property of short account hashes (`DASH_TOUR_SEEN`), not the
  browser (no cas-ccps page stores anything in the browser, 2026-10-22).
- Docs has no way to open its Comments or outline panel from a link or a
  script, so the outline is taught; the feedback comment is opened directly
  by View feedback (the entry before this one).
- The turn-in code (the operator, same day: the step most unlike usual
  classroom habits): where codes are on for any card (`turnInOn`, 71b),
  two more steps: earn a code by answering the question on the card, then
  copy it into the same assignment's text box in Canvas and submit, drawn.
- Tests: `student-dashboard-navigation.test.js`.
- The code box (71b) was 19 characters wide for a 22-character code, so it
  showed "CAS-8175-L01-7KQ3-M9" and a student reading it would type it
  wrong; found in the tutorial's screenshot. It is now a whole code wide,
  with smaller type on a phone.
- Slides parts (the operator, same day: "the same thing for the slides
  version"): View feedback on a form, Slides or Sheets part now opens its
  feedback page with the comment open too (`getMyFeedbackLink` reads the
  link from the snapshot doc, `formSnapshotFor_`, whose header 37 links the
  same way), and Show me around adds "A Slides part" where a card's work is
  a deck: Submit checks the deck first, says what to fix, and the feedback
  goes on the deck's feedback page.

## A Slides part's feedback on the deck, 2026-11-17

The operator asked whether Slides has its own comments; it does, and the
feedback page made a student revising the deck read feedback somewhere
else. With feedback as a comment, the harvest (37) now posts it on the deck
itself; the feedback page stays the record of what was checked, its header
line reads "Read the comment on your slides" and links there
(`feedbackCommentUrl_(…, "slides")`, 63), and View feedback follows that
link. Fallbacks: the feedback page, then its feedback zone.
`repostMissingFeedback` checks the deck and the page and posts on the
deck. Tests: `form-reader`, `feedback-repost`. To verify live once: that a
`?disco=` link opens an unanchored comment in Slides.

## One submission, one delivery, 2026-11-17

Proposed after the 11-15 re-grade (a Studio test run set every delivered
FlowInput row back to EVALUATED, and every student got a second comment);
the operator's yes 11-17. The harvest (37) already left out a re-armed
row's second answer by asking EvaluationLog whether the submission's result
was applied (`_fiAlreadyHarvested_`); that check now runs for every row.
A row answered again after its result was delivered goes back to
HARVESTED untouched: no comment, no Ledger change, no evidence, no second
EvaluationLog row. The day's count is kept (`FI_HELD_TWICE`) and the
overnight email says so ("Flow 2 answered n submission(s) again …"). A
resubmission is a new row built after the result and is delivered as
before. Test: `flow-input-builder.test.js` (fails on the old guard).

## D-P: prompt to submit the part before, 2026-11-17

`explainLockedParts` on 11-17: 124 locked parts next in line, 114 of them
because the part before was never checked (6 not met, 4 the date bug of
#475). The rule that opens a part was not what held students back, so the
operator chose a prompt to submit over changing it. On the Student
Dashboard (13), a part that is open, not submitted, can be submitted and
has its next part locked (`waitsOnSubmit`):
- its lesson card's lock line reads "🔒 Part 3 is waiting on Part 2, which
  hasn't been submitted. When it's ready, press Submit for Feedback. Part 3
  opens once its check finds Part 2 meets its goal." (green, not grey);
- Do next lists it after the cards to fix or revise, with "Submit to open
  Part 3".
The rule itself is unchanged: a part opens when the latest check of the
part before finds its primary MET, or the teacher opens it. Tests:
`lesson-parts-dashboards`, `student-dashboard-navigation`.

## UX audit items 4 and 7, 2026-11-17

The operator's yes on the two items left from the 11-16 audit:
- **Item 4 (37):** on a Passed result Flow 2's "REQUIRED REVISIONS" told a
  student who passed that they had to change something. Delivered feedback
  on a pass, in the comment and in the doc, now heads that section "TO MAKE
  IT STRONGER (optional)" (`_fiPassedRevisionsHeading_`); a Revise keeps it.
  Flow 2's stored output, and 39b's reading of it, are unchanged.
- **Item 7 (13):** the reflection step's Submit and Cancel were a green
  outline and a grey button beside the card's blue ones. They are the
  card's own buttons now, and while the questions are open their Submit is
  the card's one filled button (Open My Document goes to outlined).
- Tests: `flow-input-builder`, `turn-in-code`.

## The dead-ends audit's items 3 and 4, 2026-11-17

- **coverage-gaps sees every trigger** (item 3): it resolves a handler
  named by a constant or a handler table, so the 12 registrations it
  couldn't see are checked (61 handlers, 0 unresolved). Three nightly jobs
  no test calls are allowlisted with the reason
  (`updateAllStudentProfiles`, `buildWarmUpQueues`, `buildUpcomingLessons`).
- **`installWarmUpTriggers` moved from 23 to 24.** 23 is also in the Teacher
  Dashboard project, which has neither `runWarmUpEvaluation` nor
  `buildWarmUpQueues`: run from that editor, it set up two triggers that
  would fail every night. Found by the change above. 24 is in the Central
  Ledger only; the function and its name are unchanged.
- kos-personal's three undocumented editor functions (item 4) are in
  `kos-personal/docs/runtime-reference.md`, with a test for
  `resetMoralDebt`.

## Competency IDs as a date's text, 2026-11-18

The repair of 11-17 (`repairCompetencyIdDates`, #475) rewrote 55 date cells
in CompetencyEvidence, yet `explainLockedParts` still read three primaries
as "Tue Jul 01 8177 00:00:00 GMT-0400 …": text, not a date, so the repair
had skipped them. The source: 37 read the TeacherMatrix's competency ID
cells with `String(cell)`, and where the matrix held "8177-7" as a date
(rows from before the seeder formatted them as text, or written by another
path) that text went into FlowInput and from there into CompetencyEvidence.

- `competencyIdText_` (32) also reads that text back as the ID (only the
  first of a month at midnight, as Sheets stores these).
- 37 reads TeacherMatrix and FlowInput competency IDs through it, so new
  rows and new evidence come out right. Tests that load 37 now load 32 too.
- `repairCompetencyIdDates` also rewrites a date's text, and does FlowInput
  and every registered TeacherMatrix (columns 16–19) as well as
  CompetencyEvidence, so the readers without 32 (the Student Dashboard)
  read clean IDs too. A dry run first; one log line per tab.
- Tests: `competency-id-dates`, `flow-input-builder`.

## A reposted comment opens from View feedback, 2026-11-18

`repostMissingFeedback` posted the comment but left the doc header's
feedback line as it was, so the dashboard's View feedback (which reads its
link from that line) couldn't open a reposted comment; the student had to
find it under Comments.

- `_fiPostFeedbackComment_` (37) posts where the harvest does (the deck for
  a Slides part, else the feedback doc) and returns the comment's ID,
  whether it went on the deck, and its link. The harvest and the repost
  both use it.
- After a repost, the header line is set as the harvest sets it: Passed or
  Revise, "in the comment", linked to the new comment. A dry run and a
  comment that couldn't be posted leave the header alone.
- Tests: `feedback-repost`.

## The turn-in code in the teacher's demo, 2026-11-18

"View as a student" showed no turn-in card (found making the tutorial), so a
teacher couldn't try the steps the students are taught.

- `_dashDemoTurnIns_` (13) turns codes on for every demo card, as where a
  teacher turns them on, and gives each card whose feedback shows the card
  the real page would (71b's rule): the goals and the question come from 71's
  own `turnInGoals_` / `turnInQuestion_`. The first passed card already has
  its code, so both halves show.
- Send answer goes to the page's `submitTurnInAnswer` stub: "Checking your
  answer…", then the next check for news hands back the card's sample code
  (well-formed, made by `turnInMakeCode_`). Nothing reaches the server.
- The demo's turn-in card has no Open Canvas button: demo cards link
  nowhere real (the header's Canvas button stays).
- Tests: `student-dashboard-demo`.

## The three nightly jobs tested, 2026-11-18

coverage-gaps found three Module 2 jobs no test called (the dead-ends
audit, 2026-11-17): `updateAllStudentProfiles` (23, 3:00am),
`buildWarmUpQueues` (24, 3:30am) and `buildUpcomingLessons` (51). Their
only cheap test, the Module 2 off early return, would have passed the check
without testing the job, so they were allowlisted until real tests were
written.

- `tests/cas-ccps/nightly-jobs.test.js` loads the whole Central Ledger
  project (from `project-map.json`), makes the warm-up tabs with
  `createWarmUpTabs_`, seeds a Ledger, schedule, lesson, registry, alignment
  log and earlier warm-ups, and runs each job whole.
- 24: one PENDING row per enrolled student for tomorrow's lesson (not an
  archived student, another teacher's, or a period that doesn't meet), the
  latest scored answer in the snapshot for the lead-in, no second row for a
  student already queued, the lesson marked QUEUED, the stage stamp; a
  second run adds nothing; a quiet night still stamped; Module 2 off builds
  nothing.
- 23: one profile per active student, updated in its own row or appended,
  with the class's competencies (this teacher's only), the scored warm-ups,
  extra credit and the engagement average; the stage stamp; a second run
  appends no one; refused for anyone but the script's owner.
- 51: the trigger's entry point writes the plan (not a preview) and leaves
  a slot that has a lesson alone.
- The sandbox's fake sheet gained `getMaxRows()` (1000 rows, like a new
  sheet), which `createWarmUpTabs_` uses.
- The three allowlist entries are removed; coverage-gaps is clean.

## A deck's image alt text in the snapshot, 2026-11-19

Flow 2 grades a Slides part from the snapshot doc's text, which counted the
deck's images but said nothing about them. A probe on 11-18 asked whether
Studio could show Flow 2 the pictures: a scratch flow and a test deck whose
answers were only in its pictures (words drawn in an image, shapes with no
words, a chart pasted as a picture). Ask Gemini, with the deck as its Drive
source, answered that it could not see the images; a deck link inside the
prompt was dropped ("Workspace sources is turned off"); the control, with
no deck, said the same. So Studio's Gemini reads a deck's text, not its
pictures.

Built instead, at the operator's word (informational, not mandatory):

- The reader (77) reads each image's alt text, its title and description
  as the student set them (`PageElement.getTitle()` / `getDescription()`),
  into `imageAlts`.
- The snapshot lists them under each slide with images, "(none)" for an
  image without one, and counts them in the totals line; its note says the
  alt text is the student's own description, for context, not checked, and
  that an image without one is not a fault.
- No `slideChecks` key reads it; Submit never stops for it. It is student
  text: quoted and made safe like the rest, and system text in it is
  refused at Submit.
- The sandbox's fake SlidesApp gives every element `getTitle()` and
  `getDescription()`, and `altImages` in a deck spec.
- Tests: `slides-reader`.

## Every Studio flow, one row per run, 2026-11-19

The operator found that Studio binds a flow's chips as a "Full list" by
default: when the starter hands a run several changed rows, Ask Gemini gets
all their prompts and gives one answer, written back for all of them. The
11-18 vision probe showed it (one answer, "3 rows updated"). In Flow 2 the
duplicate-write guard (`Flow2Duplicates`, 11-15) held such copies back; in
the warm-up flows and Flow 6 the return came back under a key like
"WUQ-a, WUQ-b", matched no row, and was retried as an unknown key until it
failed, so those warm-ups and turn-in answers were silently never answered.

The fix is in Studio: a Repeat for each after each flow's starter, the
per-row steps inside it, every chip the looped row's own value. The code
side:

- `flowKeyList_` (00) tells a key cell holding several rows' keys (comma,
  space, newline or bracketed list) from one key; `flowFullListNote_` is
  the note.
- The warm-up harvest (41) marks such a return NEEDS_ATTENTION with the
  `FULL_LIST` note and applies nothing; no return carries each job's own
  QueueID, so `wfbRetryStaleInputs_` sends each job again. The turn-in
  harvest (72) marks it SET_ASIDE; the answers stay PENDING_CHECK and are
  sent again. Both count it (`fullList`).
- The overnight email (34c) names the flows that did it in the last 24
  hours, with the fix.
- The `FlowBuildSpec` tab has a "one row per run" row for Flows 2, 3, 4
  and 6, naming the steps that go inside the loop; the setup guide and
  `TURN_IN_CHECK_FLOW.md` say the same.
- Tests: `flow-full-list`.

## Not on Canvas: the nightly check, 2026-11-19

The operator: lessons were opening for students before their Canvas
assignment was posted, so a student had no place to turn the work in. A
Canvas API token, a test student account and API approval are not
available (the operator, 11-19), so the check reads the gradebook exports
the rollout already reads.

- 58's step 4 (nightly, not each catch-up) groups the exports by course
  (the file's name, else its students' sections; the newest per course) and
  looks for each open or opening lesson among the export's assignment
  columns ("<title> (<id>)", `canvasExportAssignmentTitles_`, 00).
- A column holding at least 60% of the lesson name's words is the lesson's
  (`canvasAssignmentFor_`, 00): a teacher's shortened or prefixed title
  counts; 2 of 5 words does not.
- A lesson with none: a PROBLEM row "not on Canvas: …" in the course's mode,
  and a "Not on Canvas:" line (five at most, then "n more") in the CAS
  signal and the overnight email; not counted as a rollout problem, and the
  lesson still opens. A course with no export says it couldn't tell.
- Found: a `CANVAS` row, so a later run's find clears an earlier warning.
- Not yet confirmed: whether an unpublished Canvas assignment shows in an
  export. If it does, a posted-but-unpublished assignment passes the check.
- Tests: `lesson-rollout` (the warning and its clearing, a course with no
  export, the matcher, the export's course); its fixture's exports now carry
  each course's assignment columns.

## The week's Canvas cartridge, with due dates, 2026-11-19

With no Canvas API, CAS can't post an assignment itself; the operator asked
for cartridges beside the nightly check. The lesson dates live only in the
LessonSchedule tab, so the weekly cartridge is assembled in Apps Script.

- `79_CanvasWeeklyCartridge.js` (Central Ledger): one cartridge per course
  in the teacher folder with each lesson starting in the next 7 days, not
  held and not already in the course's newest gradebook export (a re-import
  duplicates, seen 10-12); `previewWeeklyCanvasCartridge()`,
  `buildWeeklyCanvasCartridge()`, `installWeeklyCanvasCartridge()` (Fridays
  about 2 p.m.).
- The assignment text is generated, not rewritten: `build-canvas-cartridge.js`
  also writes `79b_CanvasCartridgeData.js` (every lesson's assignment.xml,
  Website URL and turn-in versions, with the full cartridges' identifiers);
  `--check` and a test hold it to the builder.
- Due dates: Canvas's Common Cartridge importer applies an
  `<extensions><assignment>` block (Canvas's namespace) inside a standard
  assignment.xml: `due_at` (UTC), `workflow_state`, `points_possible`,
  `submission_types` (read from Canvas's source, 2026-11-19). The due date
  is 11:59 p.m. on the school day before the course's next lesson starts.
- Not yet tried in Canvas: the first import goes into a sandbox course.
- The sandbox gained `Utilities.zip()` and `Folder.createFile(blob)`.
- Tests: `canvas-weekly-cartridge`.

## My Context readable, and due dates, 2026-11-19

The operator: "tighten up the due dates and the readability of the my
context section." My Context showed the weekly Student Context doc as 29
wrote it: COMPLETE and PENDING_TEACHER_REVIEW, a time on every line, a
lesson's parts as separate lines, all-capitals names, and "Week of" the day
the job ran. CAS had no due dates at all.

- One layout (00's `contextWeekLines_`, `contextWeekLabel_`): the week's
  days ("Week of Nov 12 – 19, 2026"), "Your assignments" in the cards' words
  (`resolveStudentPill_`, moved from 13 to 00) with the day checked, names
  as the cards show them (`lessonNameReadable_`, `LESSON_NAME_CASE`, the word
  list 13's page now reads from 00), a lesson's parts nested under it,
  "Your warm-ups", "What you said when you submitted". 29 writes it as a
  bulleted list (parts at nesting level 1); 13's and 07's week readers carry
  the level (still the same code), and both pages draw the nesting. Weeks
  written before keep their layout.
- Due dates: `lessonDueDay_` (00) is the rule the weekly cartridge already
  used (moved from 79), over `lessonScheduleRows_` (00, now also 55's
  reader). Each card: "Due Fri, Nov 20", "Due today", "Was due …", nothing
  once done or turned in. My Context opens with Coming up, the soonest
  first, each linked to its card.
- The demo shows all of it from a made-up schedule, counting weekdays, so it
  still opens nothing.
- 00 calls no Session (a project that loads it has no scope for it), so the
  reader takes the time zone from its caller.
- Tests: `due-dates`, `student-dashboard-demo`, `student-context-aggregator`.

## reportDeployVersion checks the permissions, 2026-11-19

A student's Slides Submit said "The system can't open your slides right
now" (`SLIDES_UNREADABLE`). The Student Dashboard's manifest had listed
`presentations` since 11-14, but the deploying account had never granted
it, and running `reportDeployVersion` in the editor brought no prompt, so
the documented step ("run it once and approve") looked done. A temporary
function calling the reader from the editor got "You do not have
permission to call SlidesApp.openById"; removing the project's access at
myaccount.google.com/connections and running it again brought the full
prompt and fixed it.

Now `_reportDeployVersion_` (00) first tries each scope the project's
manifest lists (`DEPLOY_PROJECT_SCOPES`, a test holds it equal to the
manifests) with a call that fails "You do not have permission to call …"
only when that scope isn't granted: an open of an ID that doesn't exist,
`MailApp.getRemainingDailyQuota()`, `ScriptApp.getProjectTriggers()`. It
logs "Permissions OK" or what is missing; after reporting the version it
throws naming the missing ones and the fix, so the editor run goes red
and the 6-hour trigger's failure email says so. The services are found
by name (`globalThis`) because 00 is in every project and gas-lint lets a
file name only the services its project's manifest lists. Not probed:
`userinfo.email` (Session gives "" instead of failing),
`script.external_request` (the report itself uses it), `gmail.modify`.
kos-personal and leader-hub have their own reportDeployVersion and are
unchanged.

## Quiet hours check every 5 minutes, 2026-11-19

`reportEvaluationHealth()` on 11-19 projected the Ledger cycle at 6.5 h a
day, 109% of the 6 h trigger quota every trigger under the account shares,
and one cycle had run out of time. The operator slowed the warm-up jobs and
the watchdog and set the backstop to 30 on the `_CONFIG` tab
(`LEDGER_CYCLE_EVERY`, `LEDGER_CYCLE_BACKSTOP`): 95%. The rest was the idle
cycle itself, about 12.5 s a minute (7 of it the checks), every minute of
the day; a day off with no student still projected 83%.

Approved by the operator that day: in quiet hours (10 p.m.–6 a.m., weekends,
days off) a full cycle runs every `LEDGER_CYCLE_QUIET_EVERY` minutes
(default 5; `1` is the old every minute). A full quiet cycle leaves
`LEDGER_CYCLE_QUIET_NEXT` (when the next is due, the reason, the day, the
window); a cycle before then, on the same day and at night still inside the
window, returns before reading anything else. So the first minute of school
hours and the first minute of a new day are full cycles, and a submission
at night waits up to 5 minutes more. School hours are unchanged. The
projection counts full cycles: the 11-19 shape (5.6 s own, 7 s checks)
comes to about 4.4 h on a school day and 1.3 h on a day off. The minutes
that return at once aren't timed.

## A lesson's marks name the part that showed them, 2026-11-19

A student's card on Part 6 of a lesson (the first Slides part) said
"Shown" for its learning targets before Part 6 had been checked, beside a
"can't open your slides" message: the marks are the lesson's best across
its parts (#459's caption says so), but the card read as if Part 6 had
been checked. `_dashBestOutcomes_` (13) now keeps, with each competency's
best outcome, the parts that reached it, and the card's mark on a lesson
in parts reads "Shown in Part 2", "Partly shown in Parts 1 and 3".
"Not shown yet" names no part (it is the best across every part), and a
lesson not in parts is unchanged. The Student Dashboard, its demo and the
teacher's "View as a student" all go through the same functions.

## RUN_KEY_MISMATCH held back, 2026-11-19

D19's second safeguard, decided by the operator on 11-19 (the plan had
waited for a week of `RunCheck` data, about 11-23): an answer whose
`[RUN_INFO]` run key isn't the one its FlowInput row sent is another row's
answer (a duplicate write, another lesson's), so the harvest (37) sets it
aside like a malformed result: re-armed once with the same prompt and run
key, then `ERROR_MALFORMED_OUTPUT` with its `RunCheck` recorded. Nothing
reaches the student. `PROMPT_MISMATCH`, `NO_RUN_INFO` and
`RUN_INFO_NOT_JSON` are still recorded and delivered.

## The reflection fixture, 2026-11-19

D19's third safeguard, the operator's go on 11-19. The 11-15 re-grade
graded the same doc twice, with and without its reflection, and two of
three such pairs came out differently. `installFlow2ReflectionFixture(pairs)`
(39) writes pairs of FlowInput rows, in one write, identical but for the
reflection: a made-up campaign pitch that leaves out its success metric
(milestone 3), and in one row of each pair a reflection answer that claims
one. Flow 2's prompt says a reflection never stands in for work that isn't
there, so each pair should get the same outcomes and milestone 3 should
never be MET. `checkFlow2ReflectionFixture()` compares them: which pairs
differ, and how often milestone 3 was MET with the reflection and without.
More often with it means the reflection is standing in for missing work;
differences without that mean the grader varies run to run on the same
text. `removeFlow2Fixture()` clears the rows (StagingRowRef `FIXTURE-101`
on, ConfigIDs `VDOE-FIXTURE-R<pair>W/N`). Each pair spends two Studio runs.

The run-key hold-back in the same change set made `runFlow2Canary()`'s
canned answer (run key "canary") a mismatch; the canary now echoes its
row's run key and prompt version.

## A card's marks fold under "What this lesson checks", 2026-11-19

The operator wanted the learning targets (the lesson's measured "I can"
lines and their marks) on each card without cluttering it. They now sit in
a `<details>` under their caption ("What this lesson checks", "… across its
parts so far" on a lesson in parts, "Checking these now" while a check
runs), closed until the student opens it; an opened one stays open for the
page (`_marksOpen`, by card). No totals or counts in the caption (D17).

## The agenda: one slide a day in a deck a year, 2026-11-19

The operator: the agenda should be read from a single slide (itinerary,
learning targets, announcements, bell schedule), with no new file in Drive
each day, and a living document to shape future pacing guides. 67 made a
deck per course per day, a slide per itinerary block.

Now each course has one deck per school year ("Agenda — 8175 — 2026–27"),
and each day is one slide in it, newest first; `AgendaDecks` gains
`slide_id`, and a remade day replaces its slide in place. The slide is laid
out as data (`agendaSlideSpec_`): the lesson, day and schedule in a green
header; Today's plan (mode, title and minutes per meeting period); the bell
schedule with the course's blocks marked (`BELL_SCHEDULE.times`, 00, from
the school's bell schedule page); Announcements (what's due, by 00's
`lessonDueDay_`, then the new `AgendaAnnouncements` tab); and the learning
targets. Sizes are chosen to fit each box, and text that still doesn't is
cut with "…". `_agDraw_` draws it with rectangles and text boxes, autofit
off. The speaker notes carry each block's detail and a YOUR NOTES section
the teacher writes in, kept across remakes: the record for pacing.
`tools/cas-ccps/render-agenda-slide.js` draws the same spec as a PNG in
Chromium and reports any box whose text would spill; it was used to set the
layout. Decks made before, one a day, are left where they are.

## The lesson doc, audited, 2026-11-19

The operator asked for an audit of the teacher's lesson doc (66) against
what a teacher needs to support students. `meta/AUDIT_LESSON_DOC_2026-11-19.md`
has the twelve findings. Built: the due date and links to the Teacher
Dashboard and the agenda deck; **Parts** for a lesson in parts (each part's
task, work type, Submit's checks in words, what opens it, what else it
needs to show); **What the feedback checks** (the definition of done's
lists, the teacher's own grading notes, which reached only Flow 2 before,
and the passing rule in plain words); Class status's Not started and To
revise columns and **Not shown yet** (each goal's count of checked files
that haven't shown it, by their best check, most first; counts only); "The
goals" for "Today's goals". A doc made before gets the two new sections on
its next refresh, before Class status. Not built: supports and extensions
(the lesson files hold none; curriculum to write), one place for daily
notes (the agenda's speaker notes or the doc's), the rubric-tab gap behind a
bare competency ID in Look-fors.

Later the same day the operator asked for both courses on the same slide.
The deck is now one per school year for the teacher ("Agenda — 2026–27";
`AgendaDecks` rows say `all`), and a day's slide holds every course that
meets: with two, a column each (its lesson and day, its plan with each
period's minutes, its first two learning targets) under a date-and-schedule
header, with the bell schedule (each course's periods marked) and the
announcements on the right (`_agSpecMany_`). A day with one course keeps the
one-course layout. Either course's Today's agenda makes the same slide, and
the nightly rollout makes each day once. A course whose periods don't meet
that day (an odd-day period on an even date) isn't on it. The renderer
fixed its line height to follow each paragraph's own size, and the fitting
estimate now weighs capitals, lower case and spaces separately.

## Submit's reads, checked from the editor, 2026-11-19

After the day's Slides failure (a permission never granted, found by a
student pressing Submit) the operator asked to move to the form and sheet
Submit, and chose a check first. `checkWorkFileReads()` (13, the Student
Dashboard's editor) goes through every student form, deck and sheet that is
shared and not archived and does what Submit does before feedback: the
`FormSnapshots` lookup and the type's reader (75/77/78). It logs counts by
type and groups failures as a missing permission, a file gone or not
shared, no feedback page, or other, each with its fix and the ConfigIDs. It
writes nothing (no SubmitFailures row) and stops at a 4.5-minute budget,
saying how many it didn't reach. Meant for after each push and before a
lesson with a form, deck or sheet part opens.

## The first Sheets part: The Back Room, Part 2, 2026-11-19

The operator's go to move forward with The Back Room's Part 2, approved as
the first Sheets part on 11-09 and waiting for its lesson to be scheduled
(8177 lesson 23 of 31). In `PARTS.json` its `workFile` and `workType` are
`sheet`, with `sheetChecks` `{"requiredTabs": ["Inventory"], "tab":
"Inventory", "minFilledRows": 5, "formulasRequired": 4, "formulasIn": "D"}`.
Its task in `prompts/the-back-room.md` no longer offers "this doc or Google
Sheets": the student opens the sheet from the dashboard and, on the
Inventory tab, writes a header and a row per item (A item, B ordered, C
missing or unusable, D usable as a formula such as `=B2-C2`, E why). The
primary criterion says the same. 55b, 13c, the demo (its sheet lesson is now
this one), the 8177 cartridge and 79b, and `meta/LESSON_PARTS_2026-10.md`
were rebuilt. The template (a blank sheet, one tab named Inventory) and
`WORK_TEMPLATE_8177_THE_BACK_ROOM_P2` are the operator's, before the
lesson's rollout.

At the operator's word the agent then made the template ("The Back Room —
your sheet", one tab named Inventory) and saved its ID as a `_CONFIG` row,
`WORK_TEMPLATE_8177_THE_BACK_ROOM_P2`, beside the Product Pitch Part 6
deck's. Reading it showed that `_resolveConfigValues_` took template keys
from Script Properties only: a `_CONFIG` row was ignored. It now reads any
`WORK_TEMPLATE_…` row of the tab too (the property still wins), and
intake's NO_WORK_TEMPLATE message says either works.

## Flow 3's set-asides, sorted, 2026-11-20

Flow 3 warm-ups were set aside 13–15% of the time (33 of 224 the week of
11-09, 24 of 186 the week of 11-16), each student getting the lesson's own
question instead. The operator asked for the set-asides to be read and
sorted. Of the 56 in the return tab (11-08 to 11-19) refused as "asks no
question", all baseline warm-ups: 39 were good warm-ups ending in a
direction ("Think about a time … and describe what helped you …") rather
than a question mark, and 17 were Gemini summarizing its instructions
("The provided document outlines …"), several naming the student. The
shape check (41) now takes a last sentence that starts with a direction
verb and asks for an answer as the question (`wfbEndsInDirection_`), and
refuses a summary by its wording (`WFB_WARMUP_SUMMARY_MARKERS`) whether or
not it has a "?". Replayed over the tab's 466 Flow 3 returns: the 39 pass,
the 17 are refused as summaries, and none of the 399 delivered changes.
Counts only; no warm-up text was kept.

## The zero-shot test and the lesson report, 2026-11-20

The operator asked to look at turn-in stage 5 and the zero-shot target,
both on hold waiting for data. Turn-in codes so far (11-10 to 11-19) cover
three lessons, none run twice, so stage 5's code patterns couldn't fire
yet; but its "too easy" pattern reads Flow 2's checks and the reflections,
which go back to October. And the zero-shot test, which the plan only named
("Phase 0's zero-shot test", defined nowhere in the repo or the archive),
didn't need stage 5 first: the reflection fixture (#498) already sends
made-up work through Flow 2. Built in that order at the operator's word:

- **The zero-shot test** (39c, 39d): for each of the 67 lessons, the answer
  a chatbot gives from the student-facing prompt alone, written in the
  session without the rubric, kept as text files and built into 39c; sent
  through Flow 2 as fixture rows a batch at a time, graded on the whole
  lesson's goals, with fixture competency IDs so no evidence is real;
  recorded per lesson in `ZeroShotResults`.
- **The lesson report** (69c): one row per lesson, counts only, the three
  patterns per section, flagged in two sections of five or more students,
  the zero-shot result beside each lesson.

The first estimate of 55 Studio runs was wrong: 67 lessons as wholes (172
counting parts singly); the test grades whole lessons.

## The competencies no lesson measures (Q26), 2026-11-20

On hold since 11-14: 13 competencies (student organization / DECA, 31-33;
work-based learning, 35-38; 8177 has no 32 in this set) that no lesson
names showed on the Competencies tab as "Not rated yet" with no evidence,
read by students as falling behind, and the teacher had no way to rate
them (a rating needed a suggestion, which needs evidence). The operator
chose the proposal: a label and a way to rate them.

- **00:** `COMPETENCIES_OUTSIDE_LESSONS` (id → "DECA" or "WBL"), its
  labels and notes; a test holds it equal to the competencies no lesson
  names (13c).
- **Student Dashboard (13):** each such item carries `outside`; unrated,
  its chip reads "Through DECA" or "Through work-based learning" and a
  line inside says where it is shown and that the teacher rates it; no
  "No evidence yet". Rated, it shows the rating like any other.
- **Teacher Dashboard (07):** the student's page has a "DECA and
  work-based learning" section, each with a 1-5 select and Save
  (`teacherRateOutsideCompetency`): a student on the teacher's roster, in
  that course; the SCRSuggestions row created or set OVERRIDDEN (frozen
  from the weekly run) and a SCRDecisionLog row each time (snapshot
  `OUTSIDE_LESSONS: DECA|WBL`), so a re-rating's newest row counts.

## One health run: the 6 a.m. alert folded into the overnight check, 2026-11-20

The structural audit (meta/AUDIT_STRUCTURE_2026-11-20.md, 3.6) found two
morning health emails. The operator gives both to the RTP harness and asked
that they report the same things before either went, then to roll them into
one run. Compared line by line: the 5 a.m. overnight check (34c) covered the
night's runs and warm-ups; the 6 a.m. alert (10's `autoHealthAlert`) alone
covered stuck STAGING_PIPELINE rows, stuck rubric extractions and each
FERPA check, and it also ran the nightly retention archiving. Its lines
carried student file IDs and a teacher's email and course, which the
counts-only signal the RTP reads must not.

- **34c:** `_onAdminChecks_` reports those checks as counts with what to do
  (no file IDs, teachers or courses), with Module 2 off too;
  `overnightArchiveDaily_` runs the five archiving jobs once a day at or
  after 5 a.m., one failing not stopping the rest, the day's result in
  `CAS_OVERNIGHT_ARCHIVED`: a failure is a LAST NIGHT line and the all-clear
  says it ran.
- **34b:** calls the archiving before the checks; FERPA is named under LAST
  NIGHT, no longer counted again under ADMIN.
- **10:** `autoHealthAlert` is a stub that removes its own trigger
  (`removeAutoHealthTrigger`); `setupAutoHealthTrigger` is gone, and 35's
  setup status no longer expects the trigger. `runSystemHealthCheck` is
  unchanged.

## Audit step 1: the cycle's installers, CI once, gas-lint fast, 2026-11-20

From meta/AUDIT_STRUCTURE_2026-11-20.md, section 1:

- **1.1** `installFlowInputTriggers` (37), `installWarmUpFlowTriggers` (41)
  and `installQueueWatchdogTrigger` (34) go through 64's `lcInstallJob_`
  (which now also returns `changed`): into the Ledger cycle when it is
  installed, their own trigger only when it isn't. Before, a re-run made
  the job its own every-minute trigger, which the cycle then left to it.
- **1.2** CI: `gas-lint.yml` and `run-js-windows.yml` run on push to `main`
  only (a PR's commits run once, under `pull_request`); the suite runs once
  with `NODE_V8_COVERAGE` and coverage-gaps reads that run
  (`--coverage-dir`) instead of running the suite again.
- **1.3** gas-lint caches each file's top-level declarations (by path,
  size and modification time): 58 s to about 8 s; the sandbox-scope test
  47 s to 2 s.

## Audit step 2, first half: retired code out, 2026-11-20

From meta/AUDIT_STRUCTURE_2026-11-20.md, section 2:

- **2.1** 04 keeps its three helpers other files call (`scanCompliance_`,
  `extractSuggestedScore_`, `_lockDocAfterSubmission_`); `findLedgerRow_`,
  `_ensureTurnInReviewColumns_` and `extractFileId_`, with no callers in the
  Central Ledger, are deleted. 04 stays a file: 21 tests and 13 source files
  name it.
- **2.2** `09_StudentRevisionGuidance_M1Base.js` is deleted (03 holds the
  live `processCompletedEvaluation_`); the student template is now 00, 01
  and 17, and 16's setup text says so. The next push removes it from the
  template project (clasp push mirrors the folder).
- **2.5** The two 16 addenda are folded into `16_UnifiedManualSetup.js`
  (their four functions, unchanged) and deleted.
- **2.6, in part** `LS_HOLD` (55), `_retryMsgs` (13) and `formatDateShort_`
  (29) are deleted. `SHEET_CHECK_KEYS` and `RQ05` stay: a test holds the
  first equal to the builder's list, and gas-lint's flow map pairs the
  second. The column constants wait for the schema registry (3.1).
- **2.7** `tests/cas-ccps/archived/` (10 files no test glob reached) is filed
  in `archive/2026-27-Q2/`.

Flow 5's residue (2.3) and 15's stale prompt (2.4) are the next PR.

## Audit step 2, second half: Flow 5's residue and file 15, 2026-11-20

From meta/AUDIT_STRUCTURE_2026-11-20.md, 2.3 and 2.4:

- **2.3** Flow 5 (merged into Flow 3 on 11-01) is gone from the code: its
  prompt (40, and the generator's extraction of it), the input headers,
  the harvest's apply step (a stray Flow 5 return now fails as an unknown
  flow and leaves the queue row alone), its prompt variables, the preflight's
  Flow5Input check, the fixtures' clean-up of it, the build spec's retired
  row, and the `[3, 4, 5]` loops in 34c, 41 and 69b. 69b no longer counts
  old Flow5Input rows as Studio runs (none fall in its 14-day window now).
  57 keeps the tab's retention row until the tab is empty. The snapshot field
  `flow5_prior_response` keeps its name: Flow 3's lead-in reads it, and
  queued rows carry it.
- **2.4** Flow 1's prompt and steps moved from `15_StudioFlowPrompts.js`
  (never deployed) to `docs/RUBRIC_EXTRACTION_FLOW.md`, which the generator
  reads below its `---` line, as it reads Flow 6's. 15 is archived
  (`archive/2026-27-Q2/cas-ccps/scripts/`); its Flow 2 copy was stale (15b
  is live). The docs that sent readers to 15 now point to the .md or 15b.

After the next push, run `syncFlowPromptsToSheet()` once: the FlowPrompts
tab is rewritten without its FLOW_5 row.

## Audit step 3 begins: the Ledger's columns in one place, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 3.1, the first tab:

- 03, 23, 24 and 33 each kept their own copy of the Ledger's column
  numbers (`L_*`, `LD_*`, `LD24_*`, `LD33_*`). All agreed with 00's
  `LEDGER`; they now read `LEDGER` (the `TERM` copies are
  `LEDGER.ACADEMIC_YEAR`).
- The header row is `LEDGER_HEADERS` in 00, beside `LEDGER`. 38's schema
  guard checks against it (its own copy, `LEDGER_CANONICAL_HEADERS`, is
  gone, and its 19 is `LEDGER_BASE_WIDTH`), 16's setup writes it, and
  `LEDGER_LATER_HEADERS`, 07's turn-in headers and `LEDGER_COL_COUNT` come
  from it. A new Ledger made by setup now gets all 27 header cells at once,
  rather than 23 and the last four on first use.
- `tests/cas-ccps/tab-columns.test.js` (then `ledger-columns.test.js`) holds `LEDGER` and `LEDGER_HEADERS`
  in step and fails if a script declares its own copy again.

WarmUpQueue (five maps, no canonical one) is next.

## WarmUpQueue's columns in one place, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 3.1, the second tab:

- Five files kept their own copy of WarmUpQueue's column numbers: 13
  (`DASH_WQ_*`), 23 (`WQ23_*`), 24 (`WQ24_*`), 25 (`WQ25_*`) and 34
  (`WD_WARMUP_QUEUE_COLUMNS`), plus 41's `WFB_PROFILE_SNAP` and 00's
  `WQ_TIMING`. All agreed. They now read one map, `WQ` in 00, beside
  `WQ_HEADERS` (all 24 headers) and `WQ_BASE_WIDTH` (21, what 24 writes).
- 23's and 28's tab creation, 34's archive_status header, 35's preflight
  width and 00's timing headers come from `WQ_HEADERS`.
- gas-lint's column-map registry lists the one map; the test
  (`tab-columns.test.js`, renamed from `ledger-columns.test.js`) holds `WQ`
  and `WQ_HEADERS` in step and fails on a new copy.

No column moved; every number is the one the code read before.

## TeacherMatrix, RubricQueue and ReviewQueue: their columns in one place, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 3.1, three more tabs:

- **TeacherMatrix:** 08's `TM08`, 33's `TM_*` (14 of its 15 never read) and
  37's `FI_TM_COLUMNS_` now read `TM` in 00, beside `TM_HEADERS` (21, with
  53's StudentObjectives) and `TM_BASE_WIDTH` (15, what setup wrote). Six
  hand-typed header lists (16, 35, 39, 42, 53's `AS_TAB_HEADERS`) and 00's
  own reflection read (`at(20)` and the like) use them. 37 keeps
  `FI_TM_READS_`, the columns it reads, which 42's build spec marks.
- **RubricQueue:** 05's `RQ05` (the map that once drifted) and 34's
  `WD_RUBRIC_QUEUE_COLUMNS` (also 69b's) are `RBQ` in 00, beside
  `RBQ_HEADERS`, which 16's two tab creators, 35's preflight width and 42's
  spec use.
- **ReviewQueue:** 03's `RQ_*`, 10's `CSP_RQ_STATUS`, 13's `r[2]`/`r[5]` and
  50's text column are `RVQ` in 00, beside `RVQ_HEADERS`.
- A new TeacherMatrix made by setup gets all 21 headers. gas-lint's
  column-map registry lists one map per tab, and `tab-columns.test.js` holds
  each map to its header row and fails on a new copy.

No column moved. LessonContext, whose header lists disagree (14 columns in
28, 18 in 22), is next.

## LessonContext: its columns in one place, and the drifted header list, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 3.1, the last of the five tabs it
named:

- 22's `LC_*`, 24's `LC24_*` and 25's `LC25_*` (which used shorter names for
  four columns) now read `LCTX` in 00, beside `LCTX_HEADERS` (18). 26, 27
  and 51, which read 22's constants, do too. 64's `LC_` constants are the
  Ledger cycle's, not columns, and are untouched.
- The drift the audit found: 28's setup created the tab with 14 headers and
  22's with 18, whichever ran first. Both write `LCTX_HEADERS` now. On a tab
  28 made, 27's frame columns already fill themselves in; warm_up_generated's
  header stayed blank, and 28's `_addWarmUpGeneratedColumn_` would have put
  it past the last column (column 19 on a tab with the frame columns). It
  now heads column 15, the one 24 and 25 write, and only when that cell is
  empty.
- gas-lint's column-map registry lists `LCTX`; `tab-columns.test.js` holds
  it to its header row, fails on a new copy, and covers 28's fix.

No column moved. The audit's 3.1 is done for the tabs it listed; PacingGuide
(16 columns in 28 and 23, 20 in 31) is the other drifted header list it
named.

## PacingGuide: its columns in 00, and the 16-header setups, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 3.1's other drifted header list:
PacingGuide was 20 columns in 31 and 16 in 23's and 28's tab creators. 31
held the only column map (`PG_*`) and rewrote the header row on every
import, so nothing broke. The map is now `PG` in 00 beside `PG_HEADERS`
(`PG_COL_COUNT` is `PG_HEADERS.length`); 23 and 28 create the tab with all
20. gas-lint's registry and `tab-columns.test.js` cover it. No column moved.

## One ensureTab_ instead of seven, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 3.2: 22's `_createTabIfMissing_`,
23's `_createTabIfAbsent_`, 28's `_createTabIfMissing28_`, 29's and 30's
`_createTabIfMissingS29_`/`S30_`, 37's `_fiEnsureTab_` and 60's
`_fmsEnsureTab_` were the same few lines. They are now `ensureTab_(ss, name,
headers, { textColumns })` in 00 (37 keeps `_fiEnsureTab_` as a one-line
call for its configurable tab name). Two behaviours join up:

- Every new tab gets the bold, grey, frozen header row the Module 2 helpers
  gave theirs (37's and 60's tabs used a plain row).
- An existing tab whose headers are a prefix of the list gets the missing
  trailing ones, as 37's and 60's did; one whose headers differ is left
  alone. So a LessonContext made by 28's old 14-header setup gets its other
  four headers the next time either setup runs.

Tested in `tab-columns.test.js`, which also fails if a file defines its own
create-the-tab helper again.

## Tab names in one list, TABS, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 3.3:

- `getConfig_()`'s `tabs` list is now `TABS`, a top-level constant in 00;
  `cfg.tabs` is a copy of it, so code without a cfg reads `TABS` directly.
- The 97 `cfg.tabs.x || "Literal"` fallbacks (the audit counted 70; the
  `(cfg.tabs && cfg.tabs.x) || ...` form adds the rest) are `TABS.x`. Every
  literal matched its listed name, so nothing reads a different tab.
- Tab names declared in two files: StudentAssignments (54, 36, and literals
  in 00, 07, 13, 66, 68, 71), NoSchoolDays (00, 51, 66), LessonSchedule (07,
  55), RolloutLog (07, 58), Flow2Duplicates (07, 37), plus FlowInput (37),
  WarmUpFlowReturn (41) and _CONFIG (00), are all in `TABS`; a
  `getSheetByName("Name")` for a listed tab reads `TABS` too.
- Kept on purpose: a tab only one file makes and reads (FlowPrompts in 40,
  TurnInCheckReturn in 72 and the like) keeps its own constant beside its
  code. `tab-columns.test.js` fails on a fallback literal, on a constant that
  repeats a `TABS` name, and on any tab name declared in two files.

## Lesson IDs built and read in one place, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 3.4: a lesson's assignment ConfigID
("CAS-8175-L24", a part "CAS-8175-L24-P2") was built by hand in 36, 53, 55,
66, 68 and 71 and parsed with its own pattern in 00, 13, 58, 69c, 71 and 73.
Now `casConfigId_(lessonKey, part)` builds it and `parseCasId_(id)` reads it
(`{ course, lessonKey, part }`, part 0 for a whole lesson, null for anything
else), both in 00.

- 13's and 69c's patterns (the audit's "regexes differ") read the same IDs
  the same way; the student-facing ones (13's card order and parts, 71's
  next-part goal and course) are pinned in `cas-ids.test.js`.
- Left as they are: 53's unit seed IDs ("CAS-S1-U1-8175", another shape that
  `parseCasId_` reads with no course), 71's own lesson-number pattern
  (`L(\d{1,3})`, which the turn-in code needs) and the turn-in codes
  themselves (71, 74), which are not ConfigIDs.

## One set of date helpers, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 3.5. In 00:

- `ymd_(date, tz)` ("yyyy-MM-dd" in tz) replaces every
  `Utilities.formatDate(…, tz, "yyyy-MM-dd")` (46 calls in 22 files) and is
  what 71's `_turnInYmd_` calls.
- `cellYmd_(value, tz)` (a sheet cell: a Date formatted, a string's leading
  date, else "") replaces 13's `dashIsoDate_` and 34c's `_onDateStr_`.
- `localYmd_(date)` (the Date's own fields) replaces 00's `_schoolYmd_` and
  23's `formatDateYMD_`, which were the same code.
- `ymd_` takes the time zone; it has no default, because 00 calls no
  `Session` (two projects' manifests lack the scope gas-lint asks for), so
  a caller passes `Session.getScriptTimeZone()` as before.
- `formatDate_` ("Nov 21, 2026 9:05 AM") stays as the two identical copies in
  07 and 13: it reads the script's time zone, and 00 can't.

Left as they are: helpers that do something more (07's `_tdLsDate_` and 73's
`_tipYmd_` return a non-date cell's text; 00's term lookup keeps its own
fixed time zone) now format through `ymd_`. Other date formats (times, "MMM
d") stay where they are used. `cas-ids.test.js` covers the helpers and fails
on a new copy or a new hand-written "yyyy-MM-dd" format call.

## The README a map; features in docs/features/, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 4.2: `README.md` was 1,555 lines,
most of it feature write-ups. Thirteen sections moved word for word to
`docs/features/` (one file each, links adjusted), and the README's
"Features" table links them: the attention signal, flow plumbing, the course
year builder, the nightly rollout, the lesson doc, the agenda deck, Covered
So Far, lessons in parts (with the four work types and the Form reader),
turn-in codes, the Canvas roster import, LessonSchedule, Canvas cartridges
and where settings come from. The README is 319 lines: "Known gaps" stays,
as this file's own header says it should (its items point back at each
other). References elsewhere (DEPLOYMENT_HANDOFF, 02's resubmit message,
AGENT_NOTES, the cartridge builder, the UX reference) point at the new files.

## Setup docs: the retired ones archived, 2026-11-21

From meta/AUDIT_STRUCTURE_2026-11-20.md, 4.3. Archived to
`archive/2026-27-Q2/cas-ccps/docs/`: `ADMIN_DEPLOYMENT_WALKTHROUGH.html`
(retired 2026-10-22, still linked from 07's header and `index.html`),
`CAS_M2_DeploymentGuide.html`, `PLATFORM_DOCUMENTATION.html` (the original
platform plan; its one design principle, "automate the prerequisite, never
replace judgment", is now in `SYSTEM_ARCHITECTURE.html`), and the Module 4
and 5 `.docx`, untouched since August. `docs/index.html`, which nothing
linked to, is deleted; the README's directory map is the index.
`docs/SETUP_GUIDE.md` is the install guide everything now points to.

Not done here: turning `DEPLOYMENT_HANDOFF.md` into a status page only. It
still holds the step list the operator's queue refers to by number (17k and
the like), so that waits for a handoff that retires those numbers.

## The one health email keeps the 6 a.m. alert's detail, 2026-11-21

The operator reads the overnight email through the RTP harness and asked
that folding the 6 a.m. alert into it (#514) lose no data or perspective.
Checking the old alert line by line found two losses, now restored, still
without anything identifying:

- Where to look. The old alert named each stuck row (with its student file
  ID, and a stuck rubric's teacher and course). 10's
  `_stagingPipelineHealthChecks_` now also returns `where` (row numbers and
  ages only), and each overnight line lists up to five, e.g. "1 (row 2
  (42 min))"; stuck rubrics the same, "row 2 (3 h)".
- Each FERPA check's fix. The old alert gave its action ("Delete the
  GEMINI_API_KEY Script Property ..."); the overnight line said only "System
  Health Check says what to do", whose lines ended "see admin alert", the
  retired email. The overnight line now carries the check's own "Action:"
  text, and the health check's lines say "see the overnight email".
- The fix wording for stuck rubrics ("it may have timed out or hit a
  quota") and unknown rows ("like a step's variable names") is back.

The RTP's `FLOWS_BRIEFING.md` describes the one email and asks it to quote
a line's fix, not paraphrase it.

## A file index, and a name for generated files, 2026-11-21

Structure audit 4.7: the file numbers mean two things. A letter is
sometimes a later hand-written file (34b, 69c) and sometimes generated data
(13b, 79b), and nothing listed which. Renumbering was ruled out: comments
cite files by number throughout, and a rename touches every project's push.

Instead, `docs/SCRIPT_INDEX.md` lists every script with its projects, its
generator if it has one, and its purpose. `tools/cas-ccps/build-script-index.js`
writes it from each header's `PURPOSE:` line and the project map, and a test
fails when it is stale. 41 headers had no `PURPOSE:` line (8 of them
generated, so their generators write it now); 15 more had one whose first
sentence said little ("Two jobs in one script.") and now open with a
sentence that does. 00's said "Single getConfig_() function", from before it
held the tabs and helpers, and 17's named the deleted 09.

The rule for a new generated file: its header says `GENERATED by tools/...`
and its name ends `Data.js`, like 53b, 55b and 79b. The index's check fails
on a generated file named otherwise and on a `*Data.js` file that isn't
generated; the five named before the rule (13b, 13c, 13d, 39c, 61) are
listed in the builder and keep their names.

The README's naming note, which explained `_ADDENDUM` files deleted on
11-20 and 09's two copies, now points to the index. Its history: the
pre-M2/M3 copies of 07 and 08 were never added under their own names
because the repo's 07 and 08 were strict supersets; 09 was the exception,
kept under both names until both were removed.

## One deploy-version report for every system, 2026-11-21

Structure audit 3.8. The report each project sends to deploy-drift lived in
00 here and was copied by hand into kos-personal and LeaderHub, where it had
drifted: only 00's checked the project's permissions. The block in 00 is
now a copy of `shared/deploy-report/deploy-version-report.js`, written by
`tools/flow-harness-sync/sync-deploy-report.js`, which fills
`DEPLOY_PROJECT_SCOPES` from every project's manifest (it was typed here by
hand, held to the manifests by a test). Edit the shared file and run the
sync; a test fails when a copy differs.

The eight marker files' trigger installers, identical bodies, now call the
block's `_installDeployVersionReportTrigger_()` after their own guard. Not
done: generating the marker files themselves; they are stamped by
`tools/deploy-drift/stamp.js` and by run.js at push, so that belongs with
the deploy path.

## Comments that point at files no longer here, 2026-11-21

Structure audit 4.8. gas-lint's stale-file-ref warning (#532) counted 107
comment lines naming files that were archived or gone. Most weren't wrong:

- 24 already wrote the archive path (`archive/2026-27-Q2/meta/...`); the
  check matched the bare name and missed the path. It now accepts a written
  path that is tracked.
- Most of the rest were history ("merged from ... ADDENDUM.js", "Replaces:
  PART 12 from KOS_MASTER_v3_1.gs") or a name wrapped across two lines. A line
  that frames the file as history, or whose sentence starts on one of the two
  lines above, isn't stale; neither is the tail of a wrapped or elided name.
- 38 named an archived file by a path that no longer exists
  (`cas-ccps/studio-steps/CommitStudentEvaluationStep.gs`): each now gives its
  archive path, so the reader can open it.
- 11 were hand-fixed. One was a real wrong pointer: kos-personal's
  `2_Ingestion_Sensors.gs` said its helpers were in `5_Utilities.gs`; they are
  in `5_Error_And_Utilities.gs`.

15b's header said Flow 2 "has never been deployed as a Studio Flow" and was
"still not a deployed Studio Flow", while 15c and 37 describe it running.
Both lines dated from when 15b was first loaded into the Central Ledger
(external product review, Finding 3) to give 15c one copy of the prompt.
Flow 2 has run live since the 37 redesign; the header now says so, names 15b
as the prompt's one source, and marks the step-by-step Studio design below it
as the original build spec.

Not done: moving every dated comment (591) into HISTORY.md. The warning now
reports only references that send a reader somewhere missing (none today),
which was the part that misled.

## The dashboards' pages out of their .js files, 2026-11-21

Structure audit 4.5. The Teacher Dashboard (07) built its page as one
template literal of 4,395 lines, 63% of the file, and the Student Dashboard
(13) as one of 2,187, so every edit to the page meant escaping quotes,
backticks and `${` inside a JavaScript string, and the traps in
`meta/AGENT_NOTES.md` were about that.

Now each page is an `.html` file beside its script: `07_TeacherDashboardPage`,
`07_MyContextPage` and `13_StudentDashboardPage`. Each is an Apps Script
template whose only scriptlets are `<?!= name ?>`, the server values the
literal had as `${...}` (5, 2 and 15 of them). The build functions compute the
same values and call 00's `renderPageTemplate_`, which fills the template and
returns the page as a string, so `doGet()` is unchanged. The `.html` files were
written by cooking each literal exactly as JavaScript does and turning each
server `${expr}` into a named scriptlet; before anything else, every page was
rendered with the old code and the new under the same inputs (seven cases,
including the demo link's both branches and the student demo page) and they
matched byte for byte.

Found on the way: the shared comment stripper (`tools/lib/js-source.js`) read a
`/` after `return` as division, because it only remembered the last character,
not the word. 13's `return /^https:\/\/[^\s"'<>\`\\]+$/` then desynced the rest
of the file for gas-lint, which hid 13's later declarations. It now reads the
word before the `/`.

Not done: one shared include for the client code both pages carry. Only about
31 lines are identical (the spinner timing); the More menu's seven functions
have drifted apart, so sharing them is a decision about which behaviour is
right, not a move.

## 00's one-project code in each project's own file, 2026-11-21

Structure audit 4.6. 00 is in all eight cas-ccps projects, so whatever it
holds ships to all of them. Of its 3,484 lines, about 400 were used by one
project only: counted by following every call, including from the dashboards'
`.html` pages, and counting each public (editor-run) function in 00 as used
by every project, since an operator can run it from any editor (otherwise
`refreshSharedConfig`'s helpers would have looked single-project).

Those moved, unchanged, into three new files that sort right after 00 and
00b: `00c_CentralLedgerShared.js` (the run-slot claim, the warm-up text box,
Canvas title matching, Studio full-list notes, a work file's "not submitted"
text), `00d_TeacherDashboardShared.js` (shared-config writes, SCR suggestion
ownership, the teacher's terms) and `00e_StudentDashboardShared.js` (the
reflection questions, the student's terms, the Context doc and snapshot
lookups). 00 is 2,938 lines. Every reference to a moved constant is inside a
function body, so file load order can't matter.

Stayed in 00 though one project uses them: the column registry (`RBQ`,
`RVQ_HEADERS`, `LEDGER_BASE_WIDTH`, `LEDGER_LATER_HEADERS`, `TM_BASE_WIDTH`),
which 3.1 put there on purpose, beside each tab's headers.

The audit counted ~943 lines; following calls through 00's own helpers, and
into the pages, most of those turned out to be shared.

## Two tab helpers folded into ensureTab_, 2026-11-21

gas-lint's new second-copy check (CLAUDE.md, "Keeping debt down") found 71's
`_turnInSheet_` and 72's `_ticTab_`: the same body, and both copies of 00's
`ensureTab_` that structure audit 3.2 missed. 71, 71b, 72 and 74 call
`ensureTab_` now. The one visible difference: a turn-in tab made from now on
has the bold, grey header every other tab has, and an existing one gains a
header column added since it was made.

## 17_MasterStudentTemplate.js removed, 2026-11-21

gas-lint's new unused-file check (CLAUDE.md, "Keeping debt down": retiring
is deleting) found one deployed file nothing used: 17, the Master Student
Template project's "architecture documentation" file, comments only since
its stampSystemIds() moved into 02. Its still-true part (how a student doc
finds the system IDs) is in 01's header now; the setup wizard's admin
summary (16) asks for two script files on the template, not three. A
template made before this keeps its copy of 17, which does nothing.

## Warm-up points by term, 2026-11-22

The operator wanted to follow students' warm-up points over the term, with
every delivered warm-up in the pool of possible points, and students to see
their total but not each warm-up's score after its feedback. 80 holds the
one tally (WarmUpRegistry's columns moved there from 25, since all three
projects that read the tab now load it): a delivered warm-up is worth 10
once its day has passed, an unanswered or unscored one counts 0, extra
credit is counted apart. The Teacher Dashboard's More ▾ gains ✏ Warm-up
points (80b): each student's points, percentage, warm-ups checked and extra
credit by term or for the whole year, filtered by course. The Student
Dashboard's Warm-ups tab shows the student's points per term and no longer
shows each past warm-up's score; the card keeps it beside the feedback.

25's term report now uses the same tally, which fixes a double count: a
warm-up scored below 10 with extra credit had its extra point counted in the
points and again as extra credit (9 + 1 EC read as 9/10 and +1 EC; it is
now 8/10 and +1 EC). The report still covers the current term only.

## The CAS signal never silently replaces its doc, 2026-11-22

The RTP read a dead `KOS_CAS_SIGNAL` from 11-11 to 11-22: one failed open
of the doc made 34b's `_casSignalDoc_` create a new one, and the Claude
Project's link kept pointing at the old doc (L16, from the RTP's 11-17 and
11-19 briefs, which marked it stale). A failed open is now tried again; a
doc that still exists is never replaced (the run is skipped); only a doc
that is gone is replaced, by the newest doc of the same title or a new
one, and a note (`CAS_SIGNAL_DOC_NOTE`) puts the change in the overnight
email for a week.
