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

