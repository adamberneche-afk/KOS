# FERPA Data Map

**What this document is:** a complete inventory of every sheet/tab in cas-ccps
that holds student-identifiable information — what fields it holds, why it's
collected, who/what can access it, and (where decided) how long it's kept.

**Why it exists:** cas-ccps's own README states the system is FERPA-scoped,
but until this document, no single place inventoried what student data
actually lives where. This closes that gap (Say/Do Ledger cas-ccps finding
#5). It is a companion to, not a replacement for, the general compliance
statement in `docs/SYSTEM_ARCHITECTURE.html`'s Security Model section —
the two are now the canonical compliance-reference pair. (This document
used to describe itself as a companion to `docs/KOS_Guide_IT__Admin_Security.pdf`
instead — that PDF was later investigated and confirmed to describe an
entirely different, abandoned pre-v8 architecture never carried into the
live system, and has been archived; see `README.md`'s note on this.)

## Retention schedule (adopted 2026-10-13, pending district confirmation)

The operator adopted this schedule on 2026-10-13. **The district records
officer still has to confirm it against the Library of Virginia's General
Schedule GS-21 (public school divisions)**; every period is a Script
Property, so a confirmed period is set without a code change. The schedule
lives in `scripts/57_RetentionSchedule.js`, and `checkRetentionSchedule()`
reports, per record, how many rows are past their period and how many of
those are archived (counts only; it changes nothing; a missing date
column is named). `previewRetentionDisposition()` is the dry run of a
disposition: per record, the rows it would remove (past, and archived
where the tab has an archive marker) and the Docs that go with them, and
the rows it can't decide yet. It deletes nothing. It saves what it found
(per record: the cutoff and the counts, no row content) as the pending
disposition and logs the code that approves it. `applyRetentionDisposition()`
(2026-10-28) is the disposition itself, run only once the operator has
set `RETENTION_DISPOSITION_APPROVE` to that code (below).

Periods are counted in whole school years after the year ends, with the
same August start the dashboards use (`_retentionCutoff_()` in
`00_SharedConfig.js`). On 2026-10-13, a 5-year record from 2020-21 or
earlier is past; a 1-year record from 2024-25 or earlier is past.

| Tier | Period | Records | Script Property |
|---|---|---|---|
| Record: what a grade, a rating decision or a disclosure rests on, and the student's own work | 5 years | `Ledger`, `StudentAssignments`, `StudentDocRegistry`, `EvaluationLog`, `ReflectionLog`, `PartUnlocks` | `LEDGER_RETENTION_YEARS` |
| | 5 years | `CompetencyEvidence` | `COMPETENCY_EVIDENCE_RETENTION_YEARS` |
| | 5 years | `SCRDecisionLog` | `SCR_RETENTION_YEARS` |
| | 5 years | `ParentReportLog` | `PARENT_REPORT_RETENTION_YEARS` |
| Working data: queues, Flow inputs and profiles | 1 year | `WarmUpQueue` | `WARMUP_QUEUE_RETENTION_YEARS` (was 5 years) |
| | 1 year | `StudentProfiles`, `WarmUpRegistry`, `WarmUpTextBox`, `WarmUpResponses`, `SCRSuggestions`, `FlowInput`, `Flow3Input`, `Flow4Input`, `Flow5Input`, `ReviewQueue`, `STAGING_PIPELINE` | `WORKING_DATA_RETENTION_YEARS` |
| Student Docs | with their row | A student's workspace Doc follows its `Ledger` row; a warm-up Doc follows its `WarmUpQueue` row. Feedback posted as comments (`FEEDBACK_AS_COMMENT`) is part of the Doc and goes with it | — |

Kept on their own rules, outside the schedule: `WarmUpFlowReturn` (harvested
rows deleted after 14 days by `41`), the Family Mail Sentinel tabs (below),
the CAS attention signal (overwritten every run), and the Canvas gradebook
exports (deleted after enrolling).

**Disposition.** Past its period, a row in a tab with an archive marker
(`Ledger`, `CompetencyEvidence`, `SCRDecisionLog`, `ParentReportLog`,
`WarmUpQueue`) is archived automatically by the health checks, as below.
Nothing is deleted automatically. Deletion is a separate step the operator
approves after reviewing what is past its period:
1. Run `previewRetentionDisposition()` and read its report.
2. Set the Script Property `RETENTION_DISPOSITION_APPROVE` to the code the
   report gives.
3. Run `applyRetentionDisposition()`. It removes only what the report
   counted, and refuses the whole run if:
   - the code doesn't match;
   - the approval is more than 7 days old;
   - a period changed;
   - any record now has more rows to remove than were approved.

A removed row's Doc (a Ledger row's workspace Doc, a `StudentDocRegistry`
Doc, a warm-up Doc) goes to the Drive trash first, where it is recoverable
for 30 days. A row whose Doc can't be trashed is kept. A run removes at most
1,500 rows: run it again until it says done, which clears the approval. Each
run writes a `DispositionLog` row per record: the time, the approval code,
the record, its cutoff, rows removed, Docs trashed, and rows kept. Counts
only; it holds no student data.

The history below is how each archive pass came to exist; where it says
"default 5 years, unconfirmed", the table above is now the schedule.

**Retention policy — partially defined: `SCRDecisionLog`, `Ledger`,
`CompetencyEvidence`, `ParentReportLog`, and `WarmUpQueue`.** Every other tab in this document still persists
indefinitely, with no deletion/archival mechanism at all. `SCRDecisionLog` — the one tab with an
actual VDOE/Perkins legal retention obligation — was the first exception,
built as Say/Do Ledger cas-ccps Extension 3: a configurable
`SCR_RETENTION_YEARS` Script Property (default 5 years, **still unconfirmed
against a primary source** — direct confirmation with VDOE/central-office
records staff remains outstanding) drives an automated archival routine
(`_archiveExpiredScrDecisions_()` in `30_SCRSuggestionEngine.js`) that flips
a row's `archive_status` column to "ARCHIVED — pending disposition review"
once it's older than the configured window — run automatically every time
`autoHealthAlert()`'s daily trigger fires or an admin runs
`runSystemHealthCheck()` on demand. This never deletes anything — actual
permanent deletion still always requires a human to look at the archived
rows and decide by hand; no script here automates that step. A new
admin-triggered "📤 Export SCRDecisionLog for Audit" menu item
(`exportScrDecisionLogForAudit()`) shares an audit export directly with
specific central-office accounts, restricted to the admin's own school domain.

**`Ledger`** (external product review, Finding 6, "this quarter" scaling
fix) got the same treatment, extended: a configurable
`LEDGER_RETENTION_YEARS` Script Property (default 5 years, **also
unconfirmed against any real district/legal retention schedule for
assignment records specifically** — no primary source has been checked for
this any more than one had been checked for SCR ratings when that default
first shipped) drives `_archiveExpiredLedgerRows_()`
(`10_AdminRecoveryPanel.js`), run on the same daily/on-demand triggers as
the SCRDecisionLog archival above. It reuses the Ledger's own pre-existing
`Status` column value "ARCHIVED" — the same value the manual, admin-triggered
"📦 Archive a Completed School Year" menu item (`archiveCompletedTerm()`) already
writes, and the same value `13_StudentDashboard.js` already excludes from
a student's own dashboard — rather than adding a second, parallel
archive-flag column. Only rows already in a terminal status
(`COMPLIANT`/`ACTIVE`/`COMPLETE`) are eligible; an `ERROR`-prefixed row is
left alone for admin review, same as `archiveCompletedTerm()`'s own rule.
Never deletes anything, same as SCRDecisionLog's archival. A new
`♻️ Reactivate an Archived School Year` menu item (`reactivateArchivedTerm()`) is
the genuinely missing half this extension had lacked until now: it sets a
school year's `ARCHIVED` rows back to `ACTIVE` (both menu items take a
whole school year, like `2627`, never a single marking period) (the original
`COMPLIANT`/`ACTIVE`/`COMPLETE` distinction is not recoverable through the
round trip — every reactivated row becomes `ACTIVE`).

**`CompetencyEvidence`** (KOS/CAS roadmap synthesis 2.2, "explicit
archive/hibernate state") got the same retention treatment as the two tabs
above, closing the one gap this document used to flag as having no
mechanism at all: a configurable `COMPETENCY_EVIDENCE_RETENTION_YEARS`
Script Property (default 5 years, **also unconfirmed against any real
district/legal retention schedule** — same open question as the two
defaults above) drives `_archiveExpiredCompetencyEvidence_()`
(`30_SCRSuggestionEngine.js`), run on the same daily/on-demand triggers as
the other two. It adds a new `archive_status` column (self-healing on a
tab created before this extension existed) rather than reusing `Ledger`'s
`Status`-column pattern, since CompetencyEvidence has no existing status
lifecycle of its own to overload — same reasoning `SCRDecisionLog`'s own
dedicated `archive_status` column already established. `aggregateEvidence_()`
excludes archived rows from SCR suggestion computation, the same way
archived Ledger/SCRDecisionLog rows are already excluded from their own
live reads. Never deletes anything.

Deliberately plain `"ARCHIVED"`, not SCRDecisionLog's `"ARCHIVED — pending
disposition review"` — that wording is a legal-hold state for the actual
retained SCR decision record, intentionally not meant to be casually
reversed. CompetencyEvidence is upstream working evidence, not the
retained decision itself, so it gets a real way back: a new
`♻️ Reactivate Competency Evidence` menu item
(`reactivateCompetencyEvidence()`) clears `archive_status` back to blank
for a given student's rows, for a reopened case (an appeal, a corrected
record). SCRDecisionLog deliberately has no equivalent reactivate action —
its archived state is a disposition hold, not a hibernate state.

For the working-data tabs with no archive marker, the schedule above sets
the period and `checkRetentionSchedule()` reports what is past it; nothing
marks or removes those rows yet.

---

## Student-identifiable tabs

### Ledger
*Central spreadsheet, all teachers*

| | |
|---|---|
| **Fields** | Timestamp, GoogleID (student's district **email**, not a Google account ID — see note below), ConfigID, FileID, StudentName, Block, ClassName, TeacherName, TeacherEmail, Subject, CourseName, Period, Status, SubmissionTS, Notes, LastEval, AdminFileURL, StudentFileURL, AcademicYear; then the turn-in score columns (suggested score, final score, decided by, decided at) and the latest evaluation's CheckCount, LastResult, FirstPassedAt and LastSuggestedScore (`LEDGER` in `00`) |
| **Why collected** | The system-of-record for every assignment: who submitted what, when, to which teacher, with what evaluation outcome. Every other tab in cas-ccps traces back to a Ledger row. |
| **Written by** | Scripts 02 (intake, from the form or from 52's Canvas roster import, both through `intakeStudent_()`; `SCHEDULED` for a doc made ahead), 03 (status as evaluations close), 13 (SubmissionTS on Submit), 37 (the evaluation result columns), 07 (a teacher's turn-in score decision), 52 (Period, when a period is relabeled), 58 (`SCHEDULED` to `ACTIVE` at release), 10 (manual `archiveCompletedTerm()` and automatic `_archiveExpiredLedgerRows_()` — both only ever set `Status` to `ARCHIVED`, never any other field). The turn-in gate (04) that also wrote it was retired on 2026-10-10. |
| **Read by** | Scripts 03, 07 (Teacher Dashboard), 10 (Admin Recovery Panel), 13 (Student Dashboard), 23, 24, 29, 30, 33, 36, 37, 52, 58 |
| **Visible to** | The student's own teacher (Teacher Dashboard, gated by `_isAuthorizedTeacher_()`); the student themselves (Student Dashboard, own row only); admin (Admin Recovery Panel) |
| **Retention** | `LEDGER_RETENTION_YEARS` (Script Property, default 5, unconfirmed — see above) via `_archiveExpiredLedgerRows_()`, run automatically on every daily health check and every on-demand admin health check. A `COMPLIANT`/`ACTIVE`/`COMPLETE` row past the window gets `Status` set to `ARCHIVED`; `ERROR`-prefixed rows are left for admin review. Actual deletion is never automatic. |

> **Naming note:** the column labeled `GoogleID` throughout this codebase (here and in every tab below) is populated with the student's district **email address**, not a separate Google account identifier. There is no non-PII stable student ID anywhere in cas-ccps today — a fact that matters for the Bonus-2 fix below.

### StudentAssignments
*Central Ledger tab*

| | |
|---|---|
| **Fields** | StudentConfigID (the student's workspace ID, the Ledger's ConfigID), GoogleID (district email), AssignmentConfigID (the TeacherMatrix assignment, e.g. `CAS-S1-U1-8175`), RecordedAt. No names. |
| **Why collected** | The Ledger's ConfigID is the student's own workspace ID, so nothing recorded which assignment a workspace belongs to. Without it the roster import re-enrolled students on every re-run and Flow 2's input builder could not find a real student's rubric. |
| **Written by** | `intakeStudent_()` (02), one row per workspace; `repairRosterDuplicates()` (52) for workspaces made before the tab existed. |
| **Read by** | 37 (`buildFlowInputRows`, the TeacherMatrix lookup) and 52 (who is already enrolled). |
| **Visible to** | Whoever can open the Central Ledger: the same people as the Ledger. |
| **Retention** | Kept with the Ledger. A row whose Ledger row is archived is harmless and isn't read for anything else. |

### EvaluationLog
*Central Ledger tab (2026-10-23)*

| | |
|---|---|
| **Fields** | EvaluatedAt, ConfigID (the student's workspace ID), StudentFileID (their workspace Doc), Attempt, Result (`PASSED`, `NEEDS_REVISION`, or an `ERROR_` harvest failure), SubmittedAt, WaitMinutes, SuggestedScore. No names, no emails, no student writing, no feedback text. |
| **Why collected** | The Ledger keeps only the latest result and a count, so each check's wait and a student's sequence of attempts were lost. Waiting on feedback is friction that teaches nothing; this is how it's measured. |
| **Written by** | `harvestFlowInputResults()` (37), one row per Flow 2 result, appended only. |
| **Read by** | Nothing yet. |
| **Visible to** | Whoever can open the Central Ledger: the same people as the Ledger. |
| **Retention** | `LEDGER_RETENTION_YEARS`, with the Ledger (counted in `checkRetentionSchedule()`). No archive marker; deletion is the operator-approved disposition, as for every record. |

### ReflectionLog
*Central Ledger tab (2026-10-24)*

| | |
|---|---|
| **Fields** | SubmittedAt, GoogleID (district email), ConfigID (the student's workspace ID), StudentFileID (their workspace Doc), Kind, FrameID and CompetencyID (which question), Question (as asked), **Answer: the student's own words**, one row per answer. No names. |
| **Why collected** | The process reflection on Submit (`REFLECTION_ON_SUBMIT`, `meta/STUDENT_WORK_PLAN_2026-10.md`): how a student worked and what they weighed, kept together so it can build their context across assignments (operator's decision, 2026-10-24). This is the first student writing kept in the Ledger outside WarmUpQueue: the work itself still stays only in the student's Doc. |
| **Written by** | `submitMyWork()` (13), before the work is queued, written as plain text (never a formula). |
| **Read by** | 13 (which questions the student has already answered) and 37 (`buildFlowInputRows`: the submission's answers go into that FlowInput row's `PromptText` for Flow 2, and back to the student as a comment on their Doc). |
| **Visible to** | Whoever can open the Central Ledger: the same people as the Ledger. Studio's Flow 2 sees one submission's answers in its prompt. The student sees their own answers as a comment on their Doc; the teacher, who can comment on the Doc, sees that comment too. |
| **Retention** | With the student's work (the operator, 2026-10-24): `LEDGER_RETENTION_YEARS`, as their workspace Doc follows its Ledger row (counted in `checkRetentionSchedule()`). The comment on the Doc goes with the Doc. |
| **Portfolio** | The student's own writing, so it belongs to the portfolio they take at graduation (`meta/CAS_DESIGN_THREADS_2026-10-16.md`, Thread B): a copy given to the student through an export they choose, not removed from the school's records. The question each answer responds to goes with it, so the export reads on its own. Not an evaluative record: no score or flag is kept with it. |

### Canvas gradebook exports and CanvasSectionMap (S52)
*Teacher's own Drive folder; Central Ledger tab*

| | |
|---|---|
| **Fields** | The exports are Canvas's own gradebook CSVs and hold names, logins and grades. `52_CanvasRosterImport.js` reads only Student, SIS Login ID and Section, ignores every grade column, and writes nothing from them but the Ledger row `intakeStudent_()` writes for any enrolled student. `CanvasSectionMap` holds Canvas section names and class periods: no student data. |
| **Why collected** | Enrolling a class roster without each student submitting the intake form. |
| **Written by** | The teacher uploads the exports; S52 adds section names to `CanvasSectionMap`. |
| **Visible to** | The exports: the teacher, in their own Drive. They are read by `52_CanvasRosterImport.js` in the Central Ledger project, which runs as the teacher (from the `TEACHER_FOLDER_ID` folder if set, otherwise any matching CSV the teacher owns). Since 2026-10-22 the execution log counts invalid accounts and failures by section and prints no SIS login or name. |
| **Retention** | The exports are the teacher's files; delete them after enrolling. Nothing else is kept. |

### PeriodOverride (S52)
*Central Ledger tab*

| | |
|---|---|
| **Fields** | student_account (district email), period (a class period label, e.g. `3-Odd`). No names, no grades. |
| **Why collected** | A period whose groups share one Canvas section (period 3's odd-day and even-day groups) can't be read from the export; this tab says which group a student is in, so enrollment, the nightly rollout and relabel put them in the right period. |
| **Written by** | `seedPeriodOverrides()` (52), from the Ledger's own Period column; the teacher, for a student who joins later. |
| **Read by** | 52 (`enrollCanvasRoster_`, which the rollout in 58 also runs, and `applyPeriodRelabel()`). |
| **Visible to** | Whoever can open the Central Ledger: the same people as the Ledger. The execution log shows counts per period, never accounts. |
| **Retention** | No date column, so not in the retention schedule (57). It holds the same fact as the Ledger's Period column and is good for one school year: clear it when the year ends. |

### StudentProfiles
*Teacher-scoped, one row per student per teacher*

| | |
|---|---|
| **Fields** | Student email, student name, "GoogleID" (= email), teacher email, period, competencies addressed, competency gaps, evaluation signals (extracted strengths/gaps + a plain-language note), warm-up scores, extra-credit count, average engagement score, last-updated, shadow matrix (per-unit confidence/archetype model), current unit |
| **Why collected** | Powers warm-up personalization (Flow 3) and the Teacher Dashboard's warm-up-readiness panel — the system's one real "gets smarter about this student over time" mechanism. |
| **Written by** | `updateAllStudentProfiles()` (Script 23), nightly 3am |
| **Read by** | `getStudentProfileSnapshot_()` and `buildShadowMatrixSummary_()` (Script 23), Script 25, Script 33 |
| **Visible to** | The student's own teacher (Teacher Dashboard warm-up-readiness panel and per-student shadow-profile view); Studio Flow 3 (via a redacted snapshot — see Bonus 2 below) |
| **Retention** | Working data, 1 school year after the year ends (`WORKING_DATA_RETENTION_YEARS`; see the retention schedule above), dated by last-updated. Reported by `checkRetentionSchedule()`; no archive marker. |

### LessonContext / AlignmentLog
*Teacher-authored, or drafted from the pacing guide by `buildUpcomingLessons()` (51); class-level — no student PII*

Lesson plans and competency-coverage logs. Included here only to confirm they
were checked and contain no student-identifiable fields — teacher email is
the only person-identifying column in either tab.

### Lesson Frame Document (S27)
*Teacher-authored, class-level — no student PII, but a new Drive artifact*

The `LessonContext`/`AlignmentLog` entry above only vouches for the two
spreadsheet tabs — Script 27 (`27_LessonFrameGenerator.js`) creates a
separate artifact from the same data: a Google Doc compiled synchronously
during `onLessonContextSubmit_()`, containing the lesson's learning
objective, activity description, prior-lesson connection (when provided),
and competency-alignment text (pulled from `CompetencyRubrics`). Same
person-identifying surface as its source rows — teacher email only, in the
title and `ReportRegistry` row, no student data anywhere in the doc's
content.

| | |
|---|---|
| **Fields** | The Doc's body text (objective/activity/prior-connection/competency-alignment prose, plus a fixed warm-up placeholder — never real student content); `ReportRegistry` gains a row (`docId`, `docUrl`, `teacherEmail`, `generatedAt`, `reportType: "LESSON_FRAME"`) via the same `registerReport_()` used by Script 26's alignment reports |
| **Written by** | Script 27, called from Script 22 immediately after successful alignment logging (including the lessons Script 51 drafts, which go through the same `onLessonContextSubmit_()`) |
| **Read by** | The teacher, via the Teacher Dashboard's `window.open()` hook (`07_TeacherDashboard.js`) once `frameDocUrl` is non-null |
| **Visible to** | The doc lives in `cfg.teacherFolderId` (or Drive root if unset) — same Drive-sharing surface as every other generated report doc in this repo (25/26/29/36); no broader sharing is set by Script 27 itself |
| **Retention** | Indefinite — not yet defined (same as every other Drive-doc artifact in this map) |

### WarmUpQueue
*Per-lesson, per-student — the primary Studio Flow exposure surface*

| | |
|---|---|
| **Fields** | Queue ID, lesson ID, student email, student name, "GoogleID" (= email), lesson date, **lesson-context snapshot** and **student-profile snapshot** (both full JSON payloads sent to Studio Flows 3/5), status, generated doc ID/URL, word count, grammar/engagement/total scores, extra credit, Flow 4 feedback, response text, archetype, bridge output; after them `archive_status`, `delivered_at` and `answered_at` (2026-10-23: when it was delivered, and when the student last answered: the text box's save time or the doc's last edit) |
| **Why collected** | The working table for warm-up generation, scoring, and feedback. Studio Flows 3, 4 and 5 no longer touch it: `41_WarmUpFlowBridge.js` copies what each needs into `Flow3Input`/`Flow4Input`/`Flow5Input`, and applies their answers from `WarmUpFlowReturn` back here. |
| **Written by** | Script 24 (build), Script 25 (scoring, `answered_at`), Script 41 (the harvest of Flows 3/4/5: doc creation or the text-box warm-up, archetype, bridge output, scores, `delivered_at`), Script 34 (`archive_status`) |
| **Read by** | Script 23 (nightly), Script 25, Script 41, Script 34c (counts only) |
| **Visible to** | Apps Script in the Central Ledger project (24, 25, 41, 34). Studio Flows 3/4/5 see only the input row 41 writes for them, which carries the lesson and profile snapshots (first name only, see "Flow 3 name exposure"). The custom steps that once did this pre/post-processing (`cas-ccps/studio-steps/`) are **blocked on this account and superseded** by 41. The student sees their own warm-up, in its doc or on the Student Dashboard. |
| **Retention** | `WARMUP_QUEUE_RETENTION_YEARS` (Script Property, default 1 school year since 2026-10-13 — see the retention schedule above) via `_archiveExpiredWarmUpQueueRows_()` (`34_QueueWatchdog.js`, which already owns this tab's health monitoring), run automatically on every daily health check and every on-demand admin health check, anchored on `lesson_date`. A row past the window gets `archive_status` set to `"ARCHIVED"`; actual deletion is never automatic. Reversible via the `♻️ Reactivate WarmUpQueue Rows` menu item (`reactivateWarmUpQueueArchival()`), same operational-data treatment as CompetencyEvidence above — this was the one major operational tab with no retention mechanism at all until a third-party review found the gap. |

> This is the tab the Bonus-2 fix below actually touches — see "Flow 3 name exposure" section.

### WarmUpRegistry
Per-warm-up record (student email/name, teacher, doc ID/URL, generated-at,
scores, term). Read by Script 23 only; not surfaced to any teacher/student
UI directly.

### WarmUpTextBox
One row per warm-up answered on the Student Dashboard (`WARMUP_TEXT_BOX`),
keyed by WarmUpQueue's queue_id: the generated warm-up text, the student's
answer and their extra-credit reply, with when each was saved. No name or
email (the queue row holds those). Written by Flow 3's harvest (41, the
warm-up) and the Student Dashboard (13, the answer and reply, only for the
signed-in student's own row); read by the nightly scoring (25), which copies
the answer into WarmUpQueue's `response_text` as it does for a doc warm-up.
The Student Dashboard shows a student only their own last and current
warm-up, and (since 2026-10-27, its ✏️ Warm-ups tab) their own past ones,
read-only. Retention: working data, 1 year, on `lesson_date`.

### WarmUpResponses
Raw student-written warm-up response text, keyed by student email + lesson
unit. Read/written entirely within Script 29; not currently surfaced outside
that script.

### StudentDocRegistry
Student email/name + their Student Context doc's (Script 29, the weekly
per-student doc) ID/URL/creation and update timestamps. Not the assignment
workspace docs, which the Ledger records. The doc itself is shared with the
student via `addViewer(email)` — standard per-student Drive sharing, not a
broad-access grant. Since 2026-10-27 the Student Dashboard's 🗂️ My Context
tab (13's `getMyContext`) and the Teacher Dashboard's student page read the
doc's text by week; the student sees only their own, from the session's
identity.

### CompetencyEvidence
Evidence ID, student email, competency ID, milestone text, MET/NOT MET/PARTIAL
outcome, ConfigID, evaluated-at timestamp, student file ID, archive status
(added by roadmap 2.2 — see the retention note above). Written by two
code paths that share this exact 9-column schema (confirmed the reader below
resolves columns by header name, not position, so both writers must keep
matching headers in matching order): `cas-ccps/studio-steps/CommitStudentEvaluationStep.gs`
and `15c_Flow2DirectEvaluationService.js`'s
`writeCompetencyEvidenceFromFlow2_()` — neither of which is reachable on this
account, and the live writer is `harvestFlowInputResults()`; see immediately
below.

**Corrected — who actually writes this tab.** Neither of those runs on this
account. The first is a custom Studio step, which needs a standard Cloud
project; the second is the opt-in `DIRECT_GEMINI` path, which needs an API
key, which needs the same project. The live writer is
`37_FlowInputBuilder.js`'s `harvestFlowInputResults()`, which calls that same
`writeCompetencyEvidenceFromFlow2_()` from Apps Script on a time trigger — so
the schema and header seeding described below are unchanged, and the tab is
created by the harvest if missing rather than by the Studio step. Read by Script 30's evidence aggregation and Script 30b, and (since 2026-10-27) by the Student Dashboard's 🎓 Competencies tab (13's `getMyCompetencies`): the signed-in student's own non-archived rows only, as the assignment name, date, milestone text and outcome.
**Retention:** `COMPETENCY_EVIDENCE_RETENTION_YEARS` (Script Property,
default 5 — see the retention note above) via
`_archiveExpiredCompetencyEvidence_()`, run automatically on every daily
health check and every on-demand admin health check. A row past the window
gets `archive_status` set to `"ARCHIVED"`, excluded from SCR suggestion
aggregation; actual deletion is never automatic. Reversible via the
`♻️ Reactivate Competency Evidence` menu item
(`reactivateCompetencyEvidence()`), unlike SCRDecisionLog's archival below.

### ReviewQueue
On the Admin spreadsheet. One row per Submit for Feedback (the Student
Dashboard's button, or the doc menu's item): timestamp,
**student email**, student file ID, ConfigID, status, result ref. The fifth
column (`StudentText`) is always empty. Until 2026-10-03 the Student
Dashboard (`13_StudentDashboard.js`) copied the student's whole response
into it, up to 100,000 characters, though nothing ever read it; it now
receives only that there is writing to evaluate, and a doc made before the
fix that still sends its text has it checked for being non-empty and
dropped. Docs older than the `01` change append to ReviewQueue directly
from their own menu, text included, so `bridgeQueue()` (`03`) empties the
column on every run. `previewReviewQueueTextScrub()` / `applyReviewQueueTextScrub()`
(`50_StudentDataAccess.js`) empty the column in older rows, and the health
check flags any row that still holds text (check (i) in
`_ferpaHealthChecks_()`).

### FlowInput
Added by `37_FlowInputBuilder.js` as part of Flow 2's native-Studio
redesign (Google Workspace Studio custom steps are blocked entirely for
this district — no standard GCP project available on this account — and
native Studio's "Get sheet contents" step cannot target a per-teacher
spreadsheet dynamically, only through a fixed picker). One row per
in-flight student evaluation: StagingRowRef, student file ID, ConfigID,
teacher email, **student email**, student doc URL, and the full rubric
(unit name, tier, persona, four milestones + competency IDs, definition
of done) resolved from Ledger → MatrixRegistry → TeacherMatrix ahead of
time — the same 3-hop lookup `cas-ccps/studio-steps/ReadInstructorConfigStep.gs`
already implements, reimplemented here in Apps Script since Studio can't
run it natively for a dynamic-spreadsheet target. Studio Flow 2 reads
this tab (fixed picker — safe, since FlowInput itself always lives on
this one Central Ledger spreadsheet), writes the raw Gemini evaluation
text back into `GeminiFullOutput`, and `harvestFlowInputResults()` takes
it from there — same PII class as Ledger (student email, no raw response
text; the response text itself is read from and stays in the student's
own Doc, never copied in here). Since 2026-10-24 a row's `PromptText`
also carries that submission's process reflection, when one was asked
(the answers, already kept in `ReflectionLog`). Since 2026-10-28, for a
later part of a lesson in parts, it also carries the student's own work on
the earlier parts (read from their Docs, at most 6,000 characters a part,
the same reader the student text already goes to); that block is replaced
with "(removed after the check)" as soon as the row is harvested or fails,
so the work is held here only while its check runs (a row Flow 2 never
answers keeps it until the retention below). Retention: working data, 1 school year
after the year ends (`WORKING_DATA_RETENTION_YEARS`; see the retention
schedule above), reported by `checkRetentionSchedule()`.

`harvestFlowInputResults()`'s `_fiCheckPlausibility_` gate (a backstop
against a model returning well-formed output without ever reading the
student's document — see `HISTORY.md`'s entry) respects this same
boundary: it checks `GeminiFullOutput` against the row's own rubric
fields (persona, unit name, tier, milestone text) and against a fixed
list of self-reported non-access phrases, never against the student's
Doc. It does not, and structurally cannot, open that Doc — doing so, even
transiently for a comparison that persists nothing, would be the exact
regression this tab's own design (`{{STUDENT_TEXT}}` left unsubstituted,
above) exists to avoid.

### SCRSuggestions
Student email, competency ID, AI-suggested rating (1–5), MET/NOT MET/PARTIAL
counts, status, confirmed rating, confirmed-at, confirmed-by (the teacher who
accepted/overrode the suggestion). The working table — superseded by
SCRDecisionLog once a teacher actually confirms a rating.

### SCRDecisionLog
| | |
|---|---|
| **Fields** | Decision ID, student email, competency ID, suggested rating, final rating, decision type, decided-at, decided-by, evidence snapshot, archive status |
| **Why collected** | **The actual legally-retained record** — this is the one tab in cas-ccps whose retention obligation is named in a code comment already (the Library of Virginia's General Schedule GS-21 for public school divisions / 8VAC20-120-120; earlier versions of this map called GS-21 VDOE's), append-only — rows are never deleted by any code path, though a row can now be marked archived (see Retention below). |
| **Read by** | `exportToWorkbookGrid_()` (Script 30), via the admin-facing `exportScrDecisionLogForAudit()` menu item. The export is a pivoted grid — one tab per class, one row per student, one column per competency holding that student's latest final rating — **not** a dump of this tab's own columns; `decision_type`, `decided_by`, `suggested_rating` and `evidence_snapshot` do not appear in it. It now also carries a **Student Doc** column joined from `StudentDocRegistry`, so an auditor reading a rating can reach the work behind it. That link implies no new sharing: the doc is already shared with its own student via `addViewer()`, and the workbook is already domain-restricted at creation. |
| **Visible to** | Admin (via export, now shared directly with specific central-office accounts on the same domain — see Extension 3 note above). Since 2026-10-27, the student's own latest final rating per competency (not the suggested rating, decision type or evidence snapshot) on the Student Dashboard's 🎓 Competencies tab and counter, and the teacher's own students' counts on the Teacher Dashboard (`readLatestScrRatings_`, 00) |
| **Retention** | `SCR_RETENTION_YEARS` (Script Property, default 5 — see the Extension 3 note above) via `_archiveExpiredScrDecisions_()`, run automatically on every daily health check and every on-demand admin health check. A row past the window gets `archive_status` set to "ARCHIVED — pending disposition review"; actual deletion is never automatic. Deliberately has no reactivate action, unlike Ledger and CompetencyEvidence below — this status is a disposition hold on the legally-retained record itself, not a hibernate state meant to be casually reversed. |

### ParentReportLog
| | |
|---|---|
| **Fields** | Report ID, student email, student name, week start, week end, recipient address (blank since 2026-10-23; kept for older rows), generated-at, copied-at, copied-by (teacher email), confirmed item count, pending item count, archive status |
| **Why collected** | **The record of which reports a teacher took out of KOS.** Since D1 (2026-10-23) KOS writes the reports and never sends one: the teacher copies a report and emails it from their own school account. Written by `36_WeeklyParentReport.js`: `runWeeklyParentReportPrep()` creates a row with no copied-at; `recordParentReportCopied()` fills in copied-at and copied-by when the teacher presses Copy report. Who it went to, and whether it went at all, is in the teacher's Sent mail, not here. |
| **Read by** | `36_WeeklyParentReport.js` and the Teacher Dashboard's Parent Reports panel ("Copied" next to a report). `60_FamilyMailSentinel.js` reads the recipient addresses on rows from before 2026-10-23 |
| **Visible to** | The authorized teacher only, via `_isAuthorizedTeacher_()` — the same gate as every other Teacher Dashboard surface |
| **Retention** | `PARENT_REPORT_RETENTION_YEARS` (Script Property, default 5 — the same unconfirmed default as the three tabs above, and see the note below on why it matters more here) via `_archiveExpiredParentReports_()`, run on every daily and on-demand health check. Uses SCRDecisionLog's `"ARCHIVED — pending disposition review"` marker rather than the reversible `"ARCHIVED"`, and has no reactivate action: a record of what was disclosed to whom is closer to the legally-retained record than to a hibernate state. |

**Why there is no recipient address.** Until 2026-10-23 the app sent the
report and stored the address it went to, so a report reaching the wrong
family would leave a record. Since D1 the teacher sends it from their own
account: the address lives in their Sent mail, which already records where
each report went, and cas-ccps holds no parent contact details for it. The
column stays so older rows keep their meaning.

**The retention default is more pressing here than elsewhere.** The five-year
default is inherited from the three tabs above and is equally unconfirmed
against a district or state schedule. But this is the tab that exists
specifically to answer "what did we tell whom," which is the question a
records request asks — so the gap between a placeholder default and a real
retention decision matters more for this tab than for any other.

### Family Mail Sentinel tabs (FamilyMailInput, FamilyMailReturn, FamilyMailLog, FamilyContacts)
| | |
|---|---|
| **Where** | The teacher's private *Family Mail Sentinel* spreadsheet, not the Central Ledger (`cas-ccps:family-sentinel`, `60_FamilyMailSentinel.js`) |
| **Fields** | `FamilyMailLog` also records `Alerted_At`, when a safety push went out for that message. `FamilyMailInput`: the Gemini prompt with one student or parent email, names, addresses, phone numbers and long numbers redacted. `FamilyMailReturn`: Gemini's JSON answer. `FamilyMailLog`: Gmail message and thread IDs, received time, source (student/parent/staff/canvas/external), a hashed family key, course, period, status, category, urgency, safety and sensitive flags, a one-line ask checked to name nobody, a due date, whether it needs a reply (`Needs_Reply`, 2026-10-20). `FamilyContacts`: parent address → student email, entered by the teacher. |
| **Why collected** | So the KOS Claude Project can say how urgent student and parent mail is without reading it: the log feeds the name-free `KOS_FAMILY_SIGNAL` doc. |
| **Read by** | `60_FamilyMailSentinel.js` and the Workspace Flow (which reads `FamilyMailInput` and writes `FamilyMailReturn`). The roster comes from the Central Ledger's `Ledger` tab and parent addresses from `ParentReportLog`, both read-only. |
| **Visible to** | The teacher who owns the sheet. |
| **Retention** | `FamilyMailInput` and `FamilyMailReturn` rows are deleted once harvested, and any input row after 48 hours unanswered. `FamilyMailLog` rows after 30 days (fixture rows kept). The mail itself stays in Gmail as before. |

**What leaves the sheet.** Only the `KOS_FAMILY_SIGNAL` doc, which the KOS
Claude Project reads: course, period, source, category, the ask, hours
waiting and a repeat-contact count. Sensitive categories (accommodation,
health, discipline, family situation, safety) show only "sensitive" and the
wait. No name, address or message text. The Project's own mail search
excludes the `KOS/Family` label, `student.ccpsnet.net` and Canvas, so Claude
does not open these messages; mail that arrives between two 15-minute scans
is the remaining gap (`docs/FAMILY_MAIL_SENTINEL.md`).

**The one send outside the domain.** For a safety message, the sentinel
pushes a notification to the teacher's own phone through ntfy.sh, a public
notification service, on a private random topic
(`FAMILY_ALERT_NTFY_TOPIC`). The push is fixed wording and a count, "A
family message needs you now. Open Gmail, label KOS/Family/Now.", with no
student, sender, course or message detail, so no education record leaves.

### CAS attention signal (KOS_CAS_SIGNAL doc)
| | |
|---|---|
| **Where** | A Google Doc in the teacher's Drive, rewritten in place by `34b_CasAttentionSignal.js` (Central Ledger project) at the end of every queue-watchdog run. Its ID is in `CAS_SIGNAL_DOC_ID`. |
| **Fields** | Counts only: submissions waiting on feedback, submissions that failed or timed out, SCR suggestions awaiting confirm (and how many students), students newly retry-eligible, students rated below satisfactory on the SCR, a 4 or 5 (and the change since yesterday), plus admin counts (Ledger cycle jobs failing, by function name; watchdog mode, timed-out and unknown-status queue rows, rows with no timestamp, Submit for Feedback failures per error code, the nightly rollout's PROBLEM rows and courses in shadow, failing FERPA checks). No name, email, file ID, config ID, competency, rating per student or student text. |
| **Why collected** | So the KOS Claude Project can tell the teacher what in CAS needs attention without reading any CAS sheet (SMP-018: RTP never reads CAS sheets). |
| **Read by** | The teacher, and the KOS Claude Project through its Google Drive connector. |
| **Retention** | Overwritten every run; it holds only the latest counts. To tell "since yesterday" apart, the Central Ledger's `CAS_SIGNAL_STATE` Script Property keeps yesterday's count and 12-character SHA-256 prefixes of the retry-eligible student and competency pairs, never the emails. |

A count is a fact about a group, and a small one (1 student) can point at a
person the teacher already knows; that is the point of the signal, and it
goes only to the teacher's own Claude Project. Adding any field beyond counts
is the teacher's decision.

**The overnight email (34c).** `34c_OvernightHealth.js` writes the doc's
LAST NIGHT section (Ledger cycle jobs still failing, stage run stamps,
warm-up counts for today and tomorrow, Studio jobs with no return, failed
warm-up returns, anchor fallbacks, and, at most every 6 hours since
2026-10-23, the setup checks of 38, 40, 41 and 57, which report counts and
header names only) and emails the same
lines once a day to `ADMIN_NOTIFY_EMAIL`, or `TEACHER_EMAIL` if that is
unset. The email carries the same counts plus the deployment (project,
version marker, teacher account, time zone); no student name, email, queue
ID, file ID or student text. With more than one deployment, each one's admin
address decides who sees its counts.

### RubricQueue
Teacher-authored rubric text only — no student PII. Included for completeness
since it's a central, shared tab.

### NoSchoolDays
District calendar dates only (seeded from the CCPS 2026-27 calendar by
`checkCourseData()`, 51; edited by hand). No student PII. Included for
completeness since it's a central tab.

### LessonDrafts (S65)
Lesson edits the teacher drafts on the Teacher Dashboard (2026-10-21):
lesson fields, a reason, the import's proposal and the review note, plus the
submitting account (the teacher's own). Teacher-level; a field holding an
email address is refused when saved, and the import runs the student-data
scan before anything reaches the repo. Out of the retention schedule, like
the other teacher-level tabs.

### LessonDocs (S66) and the lesson docs
One row per lesson's teacher doc (2026-10-27): lesson key, doc ID and URL,
when made and when its status was refreshed. The doc, in the teacher's
*Lesson Plans* folder and shared with no one, holds curriculum and, under
Class status, counts per period (docs made, shared, submitted, waiting,
passed): no student name, account or file. Teacher-level; out of the
retention schedule, like the other teacher-level tabs.

### AgendaDecks (S67) and the agenda decks
One row per course per day: course, date, deck ID and URL, when made. The
deck, in the teacher's *Agendas* folder and shared with no one until the
teacher projects or shares it, holds curriculum only (the lesson, its
goals, the itinerary, the periods meeting): no student data.

### PartUnlocks (S68)
One row per part opened for a student (2026-10-27): when, the student's
workspace ConfigID (as StudentAssignments holds it), the part's ConfigID,
and whether their check opened it or the teacher did. No name, email or
file. A record in the retention schedule (57, 2026-10-28): kept as long as
the Ledger (`LEDGER_RETENTION_YEARS`), like StudentAssignments, read by its
`UnlockedAt` date. It has no archive marker, so past its period it is
counted for the operator's disposition review, never archived or deleted
automatically.

### Unit rubrics and Canvas course cartridges
`curriculum/unit-rubrics/*.md` and `curriculum/canvas-cartridges/*.imscc` are
generated in the repo from the pacing guide, the lesson cards and
CompetencyRubrics.json: curriculum only, no student or teacher data (checked:
neither cartridge holds an email address or a name). Once a cartridge is
imported, Canvas holds whatever students submit to its assignments (a link to
their CAS document), under Canvas's own controls, outside cas-ccps.

---

## Trust surfaces and access boundaries

- **Teacher Dashboard** — gated by `_isAuthorizedTeacher_(cfg)`; a teacher only ever sees their own students' rows (Ledger's `TeacherEmail` column, StudentProfiles' `SP_TEACHER_EMAIL`).
- **Student Dashboard** — a student only ever sees their own row. Its record tabs (2026-10-27: Competencies, Warm-ups, My Context) read the student's own CompetencyEvidence, SCRDecisionLog final ratings, WarmUpQueue and WarmUpTextBox rows and Student Context doc, by the session's identity, never a parameter. SCRSuggestions (the AI's suggested ratings) stay teacher-only.
- **Admin Recovery Panel** — full read access to Ledger, StudentProfiles, and (via export) SCRDecisionLog. This is the one surface with the broadest reach into student data, and the one place a health-check gap (see below) mattered most.
- **Studio Flows 1–5** — the native Sheets/Docs/Ask-Gemini connector steps in every flow are still outside this repo's own access-control code; the pre/post-processing around them is this repo's own code and carries no additional access gating beyond what each step's own input mapping already scopes it to. That code used to be the custom steps in `cas-ccps/studio-steps/` (one per flow — see the table above); those are blocked on this account and it now runs in Apps Script (`37_FlowInputBuilder.js`, `41_WarmUpFlowBridge.js`), which moves it inside this repo's own Script-Property and trigger boundary rather than Studio's. The data it touches is unchanged. Flows 1, 2, 4, 5 never receive a real student name (opaque IDs/content only, already true before this document). **Flow 3 is the one exception** — see below.
- **leader-hub JSON API** (`07_TeacherDashboard.js`'s `doPost()`, D1/Addendum 24) — a separate, machine-to-machine trust surface, not a browser session: gated by a Google ID token verified server-side against `oauth2.googleapis.com/tokeninfo`, checked against this deployment's own `TEACHER_EMAIL` (same identity boundary as `_isAuthorizedTeacher_()`, re-implemented for an HTTP caller instead of `Session.getActiveUser()`). Two of its three actions (`getPacingGuide`, `getCompetencyRegistry`) carry no student PII. The third, **`getRoster`** (Addendum 26), does — name, email, and a free-text period field, per-teacher-scoped the same way as everything else in this table. Once returned, this data is out of cas-ccps's control; leader-hub's own handling of it is documented in `leader-hub/README.md`, not here.

- **Weekly parent report** (`36_WeeklyParentReport.js`, reached from the Teacher Dashboard's Parent Reports panel) — **the only surface in cas-ccps whose output is meant to leave the school's Workspace domain.** KOS writes the report and never sends it: the teacher copies it and emails the family from their own account (D1, 2026-10-23). Gated by `_isAuthorizedTeacher_()` like every other dashboard surface, and by the rules in the section below. Each copy is recorded in `ParentReportLog` (time and teacher, no recipient).

## Disclosure to parents — a deliberate exception to the Walled Garden

Everything else in this document describes a system whose data does not leave
the organization's domain. That posture is enforced in code, not just
described: `exportScrDecisionLogForAudit()` rejects any recipient not on the
caller's own domain and says so to the user in those terms,
`exportToWorkbookGrid_()` applies `DriveApp.Access.DOMAIN` at creation, and
health check (c) audits the result.

The weekly parent report is an exception to that, and it is the first one.
It is written down here because a boundary this system enforces everywhere
else should not be crossed as a side effect of an implementation choice.

**Why it is permitted.** FERPA gives a parent a right of access to their own
child's education record. A disclosure to the parent of that student is not
a third-party disclosure; withholding it is the harder position to defend.

**What keeps the exception narrow.** Four constraints, the first three
enforced in code:

1. **KOS never sends.** There is no mail call in `36`. The weekly trigger
   (`runWeeklyParentReportPrep()`) prepares rows; the panel shows the text
   to copy. The teacher sends it, from their own account, to the
   guardians the school has on file: choosing them (one or both, a student
   18 or older, a family that opted out) is the teacher's job, since KOS
   has no guardian list.
2. **Only teacher-decided values leave.** A confirmed score prints a number;
   anything still awaiting review prints no number and is counted instead.
   The report reads Ledger `TURN_IN_FINAL_SCORE` and `SCRDecisionLog`, and
   never `TURN_IN_SUGGESTED_SCORE` or `SCRSuggestions`. This follows the
   decision the system already made for students in
   `01_StudentDoc_ContainerScript.js`'s `PENDING_TEACHER_REVIEW` state, which
   shows no score because "nothing is final until the teacher confirms or
   overrides it" — a parent is further from the work than the student, so the
   rule applies with more force, not less.
3. **One student at a time.** There is no "copy all" action. Each report is
   one child's record, and a bulk control would make the most consequential
   action the easiest one to take by accident.
4. **Every copy is logged.** See `ParentReportLog` above: when, and by which
   teacher. The recipient is in the teacher's Sent mail.

**What this does NOT extend to.** Nothing else in this document becomes
sendable off-domain. The SCR audit export's domain check stays; so does
`DriveApp.Access.DOMAIN` on generated workbooks. This exception covers one
report, sent by the teacher to that student's family, containing only values a teacher decided.

**Known limitation, surfaced rather than hidden.** Report assembly reuses
`getWeeklyAssignments_()`, which filters on `_studentIdPattern_()`
(`^\d{7}@ccpsnet\.net$`) and skips anything else. In the aggregator that is
a skipped row; here it is a family that would never hear from the school. The
dashboard panel therefore displays the count of excluded students rather than
inheriting the silent drop, but the underlying accounts still need fixing —
the system cannot do that for itself.

## Flow 3 name exposure (Bonus 2 — fixed)

`getStudentProfileSnapshot_()` (`scripts/23_StudentProfileManager.js`) is the
only place in cas-ccps that ever wrote a real student name into a Studio Flow
payload. Investigated options:

- **A full stable-ID substitution** (send an opaque ID instead of a name,
  restore the real name server-side after Gemini responds) — the originally
  proposed design. **Doesn't fit these mechanics**: Flow 3 needs the
  student's name *during* generation, to address them by name inside the
  warm-up question text it writes — that happens entirely inside the
  external Studio Flow, so there is no "after Gemini" step this repo's own
  code could intercept to restore anything.
- **First-name-only redaction** (what's actually built): Flow 3's own prompt
  templates only ever use `{first_name}` for personalization — the full last
  name was never actually needed by the feature. `getStudentProfileSnapshot_()`
  now sends only the first word of the student's name by default, closing
  almost all of the real exposure (no last name ever leaves the `WarmUpQueue`
  cell) while preserving what the personalization feature is for.
- **`FERPA_FLOW3_FULL_NAME_OVERRIDE`** — a Script Property, unset/off by
  default, that reverts to sending the full name if explicitly set to
  `"true"`. An intentional, auditable escape hatch, not a silent gap — the
  admin health check (below) alerts if it's ever turned on.

## Health checks (Bonus 1 — added; items 4-9 added later)

`10_AdminRecoveryPanel.js`'s `_ferpaHealthChecks_()` (shared by both
`autoHealthAlert()`'s daily email and `runSystemHealthCheck()`'s on-demand
dialog) now checks nine things (its checks (a) to (i)) — one per retention
policy above, the three original safety-property checks, and ReviewQueue's
empty text column:

1. **`GEMINI_API_KEY` is not set** — it was read only by a commented-out
   direct-Gemini call in `25_WarmUpWriter.js` (removed 2026-09-29) that would
   have bypassed the Studio Flow boundary. Nothing reads it now.
2. **`FERPA_FLOW3_FULL_NAME_OVERRIDE` is not set to `"true"`** — see above.
3. **No file matching `exportToWorkbookGrid_()`'s "SCR Export — " naming
   pattern is shared broader than the organization's domain** — a spot-check
   against ordinary Drive sharing being changed by hand after export.
4. **No `SCRDecisionLog` rows are past the `SCR_RETENTION_YEARS` window
   without being archived** — both callers already run
   `_archiveExpiredScrDecisions_()` immediately before this check, so a
   nonzero result here means automated archival itself failed to run, not
   just that it hasn't happened yet (Say/Do Ledger cas-ccps Extension 3).
5. **No `Ledger` rows are past the `LEDGER_RETENTION_YEARS` window without
   being marked `ARCHIVED`** — same shape as check 4, via
   `_countLedgerRowsPastRetentionUnarchived_()`, with
   `_archiveExpiredLedgerRows_()` run immediately before it (external
   product review, Finding 6).
6. **No `CompetencyEvidence` rows are past the
   `COMPETENCY_EVIDENCE_RETENTION_YEARS` window without being marked
   `ARCHIVED`** — same shape again, via
   `_countCompetencyEvidencePastRetentionUnarchived_()`, with
   `_archiveExpiredCompetencyEvidence_()` run immediately before it
   (roadmap 2.2). This closed the last FERPA-scoped tab with no retention
   mechanism at all — until `ParentReportLog` was added, which is why item 7
   exists.
7. **No `ParentReportLog` rows are past the `PARENT_REPORT_RETENTION_YEARS`
   window without being archived** — same counter-after-archiver shape as
   4-6, via `_countParentReportsPastRetentionUnarchived_()`, with
   `_archiveExpiredParentReports_()` run immediately before it. This is the
   disclosure log (see "Disclosure to parents" above), so of the five
   retention checks it is the one whose window a records request is most
   likely to ask about.
8. **No `WarmUpQueue` rows are past the `WARMUP_QUEUE_RETENTION_YEARS`
   window without being archived** — same counter-after-archiver shape as
   4-7, via `_countWarmUpQueueRowsPastRetentionUnarchived_()`, with
   `_archiveExpiredWarmUpQueueRows_()` (`34_QueueWatchdog.js`) run
   immediately before it (third-party review).
9. **No `ReviewQueue` row holds a copy of a student's response** — via
   `_countReviewQueueRowsWithText_()`; the fix is
   `applyReviewQueueTextScrub()` (see the ReviewQueue section above).

## Newly-discovered gap (fixed alongside this document)

`exportToWorkbookGrid_()` (`scripts/30_SCRSuggestionEngine.js`) creates a
standalone spreadsheet of student names + competency ratings on every export
and, until this fix, applied no sharing restriction at creation — the one
real "could leave the org via ordinary Drive sharing" vector found anywhere
in cas-ccps. Now restricted to the file owner's own Workspace domain
(`DriveApp.Access.DOMAIN`) at the moment it's created.
