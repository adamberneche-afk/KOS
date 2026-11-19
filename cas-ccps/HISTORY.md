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
  `tests/cas-ccps/archived/` (they pass by hand, 72);
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
