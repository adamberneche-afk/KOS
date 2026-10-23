# CAS Student Dashboard and Flow 2: Bug Handoff (2026-10-16)

> **Filed 2026-10-17** from the operator's handoff package. Bugs 1 and 2
> landed as PR #175 (the patch below, applied unchanged); the queue that
> uses this document is [`HANDOFF_2026-10-22.md`](./HANDOFF_2026-10-22.md).
> Point-in-time: where it disagrees with the code, the code wins.

Prepared 2026-10-16 from the first live student submission through Flow 2. Covers what broke, why, what we changed, and what is still open. No student names, emails, file IDs or ConfigIDs appear here by design.

## 1. Status at a glance

| # | Problem | Cause | Status |
|---|---|---|---|
| 1 | Submit for Feedback fails with "The assignment system didn't answer" | Deploying admin account never approved the new `documents` scope | Fixed operationally 2026-10-15; code hardened in #175 |
| 2 | Feedback "never landed" in the student's doc | Harvest appended the evaluation at the end of the doc, not in the feedback zone | Fixed in #175 |
| 3 | Late evaluation leaves ReviewQueue and Ledger at ERROR_TIMEOUT | Backprop only closes rows whose queue status is still `STAGED` | Fixed in the 2026-10-17 bug-3 PR (backprop finishes late rows); the one affected row was repaired by hand on 10-16 |
| 4 | Flow 2 did not trigger on its own | Diagnosed 2026-10-19: Studio's "When a sheet changes" starter never fired on a row the script appended (40 days of history: one Test run, nothing else), and fired at once when ReadyStatus was retyped by hand (four rows, four runs) | Fixed in code: `buildFlowInputRows` (37) appends the row blank, then sets READY as its own edit; a row left blank is set on the next run. **Resolved 2026-10-23:** Flow 2 starts by itself on live submissions |
| 5 | Documents not created after a date was added to the schedule | Process gap (not a code bug) | Explained; steps in section 6 |

The code changes are in one patch, `submit-failures.patch`, made against `KOS-main_21.zip`. Final check on a clean extract: 1,678 tests, 0 failures. `gas-lint` (0 errors, 19 warnings) and `doc-currency` (0 errors, 8 warnings) are unchanged from before the patch.

## 2. Bug 1: Submit for Feedback shows "didn't answer"

**Symptom.** A student pressed Submit for Feedback and got the generic fallback message on every retry. This was the first real student submission through Flow 2.

**Evidence.**
- Every `submitMyWork` execution showed Completed, none Failed. The server did not crash; it returned an error code the page had no wording for.
- Only three codes fall through to the fallback text: `BAD_REQUEST`, `NO_QUEUE` and `DOC_UNREADABLE`.
- `NO_QUEUE` was ruled out: `ADMIN_SS_ID` resolves to the Central Ledger, and its ReviewQueue tab exists with the right headers (and was empty, so nothing had ever been queued).
- `BAD_REQUEST` was unlikely: the card had its file and ConfigID or the button would not show.

**Root cause.** HISTORY #115 added the `documents` scope to the Student Dashboard manifest. That web app runs as the deploying admin (`USER_DEPLOYING`), and a newly added scope has to be approved by that account from the Apps Script editor. Nobody had approved it, so `DocumentApp.openById()` threw a permission error inside `submitMyWork`. The `catch` turned it into `DOC_UNREADABLE`, which the page had no message for. Every student would have failed the same way.

**Confirmation.** A throwaway `authTest` function in the Student Dashboard project (opening the master template doc, not student data) triggered the permission prompt. Approving it fixed the problem. No redeploy was needed.

**Fix.**
- Operational: run any function from the editor and approve every prompt, including Docs. Delete `authTest` afterward.
- Code (in the patch):
  - `DOC_UNREADABLE` and `NO_QUEUE` now have their own student messages ("…Your work is safe. Tell your teacher."). The "try again in a minute" text stays only for a dropped call.
  - Each of those two failures appends a row (timestamp and code only) to a new `SubmitFailures` tab in the Central Ledger, created on the first failure (`dashRecordFailure_()` in 13, tab name in 00). A failure to record never changes what the student is told.
  - The CAS attention signal (34b) shows the last-24-hours count by code in its admin section, so a failure like this reaches the KOS start brief. An unreadable tab says "unavailable" rather than looking like an all-clear.
  - Student-fixable refusals (too short, already queued) are not counted.

**Rule to keep.** After any manifest scope change to a web app that runs as the deploying admin: run a function from the editor and approve, then test one submit, before a class depends on it.

**Ruled out.** The Chrome policy export from the deployment domain has no bearing here. The failing step ran on Google's servers and appeared in Executions, so nothing in the browser could cause it.

## 3. Bug 2: Feedback landed at the bottom of the doc

**Symptom.** After the permission fix, a real submission went through every stage (ReviewQueue `COMPLETE`, FlowInput `HARVESTED`, staging `COMPLETE`), yet the student's FEEDBACK section looked empty.

**Root cause.** `harvestFlowInputResults()` wrote the evaluation with `body.appendParagraph()` (37_FlowInputBuilder.js), which puts it at the very end of the document: below the assignment, the student's response and the hidden system block, inheriting that block's 1-point font. Meanwhile 03's `removePlaceholder_` had already removed the "[No feedback yet" placeholder from the feedback zone near the top, leaving only the dashboard link there. A screenshot of the bottom of the doc confirmed the evaluation block was present.

**Related hazard found while fixing it.** The revision "WHAT TO DO NEXT" text (`buildNextStepsText_` in 03) quoted the response marker line verbatim, dashes included. At the end of the doc that was harmless. Above the real marker, it would become the first match for every extractor (01's `extractStudentResponse_`, 13's `dashExtractResponse_`, 03's `responseZoneBounds_`), pulling the assignment and old evaluations into the "response" and corrupting the next check.

**Fix (in the patch).**
- `_fiInsertEvaluation_()` inserts the block just before the zone's `── END FEEDBACK ──` line, copying that line's formatting. Later evaluations stack below earlier ones, oldest first, as before. A doc with no end line falls back to appending.
- The revision next-steps text now says `"YOUR RESPONSE BEGINS HERE" line` without the dashes.
- Tests cover placement, formatting, stacking, the fallback, that the marker line appears exactly once, and that the extracted response equals the student's words after both an approved and a revision evaluation. Restoring the old wording makes the extraction test fail, as intended.

**Rule to keep.** Never put the full response marker line (`── YOUR RESPONSE BEGINS HERE ──`) in any text that can appear above the real response zone.

**Existing docs.** Evaluation blocks already written stay at the bottom of their docs with the old wording and are unaffected. For the affected student, the teacher can cut the `── EVALUATION … END EVALUATION ──` block and paste it above `── END FEEDBACK ──`, deleting the quoted marker line from the revision text if present.

## 4. Bug 3 (open): late evaluation leaves rows at ERROR_TIMEOUT

**Symptom.** A test submission stalled on the ReviewQueue tab with `ERROR_TIMEOUT`, yet the FlowInput row showed `HARVESTED` and STAGING_PIPELINE showed `COMPLETE`.

**Cause (inferred from the code and the symptom, not observed directly).**
1. The turnstile (06) marks a staging row `ERROR_TIMEOUT` after 12 minutes `IN_PROCESS`.
2. `backPropagateCompletions()` (03) then sets the queue row and Ledger row to `ERROR_TIMEOUT` and emails the teacher.
3. The evaluation arrived afterward (a Studio run started by hand). `harvestFlowInputResults()` appended the feedback, wrote competency evidence, and `_fiMarkStagingComplete_` overwrote the staging status with `COMPLETE`.
4. Backprop's `COMPLETE` branch only acts when the queue row is still `STAGED`. It is `ERROR_TIMEOUT`, so the row is skipped permanently. The next-steps and placeholder cleanup never run for it, and the Ledger stays at `ERROR_TIMEOUT`.

Note that `markLedgerEvaluated_` already accepts `ERROR_TIMEOUT` as a state it can move to `COMPLETE`, so late results were anticipated, but the case is only half handled.

**Workaround for an affected row.** Confirm the feedback is in the doc, then change that one ReviewQueue row's status from `ERROR_TIMEOUT` back to `STAGED`. On its next run backprop marks the queue and Ledger rows `COMPLETE` and runs the post-processing (which checks whether it was already done). Do not use the Admin Recovery Panel reset for this case: it re-queues the submission and the harvest would append a second feedback block.

**Fix (2026-10-17, after this handoff).** Backprop's `COMPLETE` branch now also finishes a row whose queue status is `ERROR_TIMEOUT`, with tests (`cas-ccps/HISTORY.md`, "Late evaluations finish their rows"). Once it is pushed, the workaround above is no longer needed.

## 5. Open question: Flow 2 did not trigger on its own

The pipeline after the turnstile releases a row: `buildFlowInputRows()` (1-minute trigger) writes a `FlowInput` row with `ReadyStatus = READY`; Studio Flow 2 runs, writes `GeminiFullOutput` and `EVALUATED`; `harvestFlowInputResults()` (5-minute trigger) harvests it; `backPropagateCompletions()` closes the queue row.

- The extraction step working in Studio's manual test only shows that stage works. It does not show that a new `READY` row starts a run by itself.
- The handoff notes list the first end-to-end Flow 2 run as not yet reported done, so this may have been the first real trigger.
- It is not known whether Studio's sheet trigger reacts to rows written by a script rather than by a person.

**To diagnose.** Check Flow 2's run history in Studio for any run before the manual one. Run `checkFlow2Liveness()` and `checkFlow2Binding()` in the Central Ledger project. Confirm `buildFlowInputRows` and `harvestFlowInputResults` appear in Triggers (`installFlowInputTriggers()` installs them). Look at the `FlowInput` row: no row means the builder did not run; `READY` with an empty output means the flow never wrote back; `EVALUATED` with output means the harvest or timing is at fault.

**Timing.** A good run needs the 1-minute build, the Studio run, then up to 5 minutes until the next harvest, against a 12-minute limit. A slow Studio run can use the whole window. Look at the trigger before changing the limit.

## 6. Scheduling a lesson (process, not a bug)

A date typed into `LessonSchedule` does not create student docs by itself. It only says which lesson is current. Student docs are made by a later enrollment step. In the Central Ledger project:

1. In `LessonSchedule`, put the start date (YYYY-MM-DD) in the `start_date` column. If the lesson has no row, run `seedLessonSchedule()` first (adds missing rows, never changes dates).
2. Make sure the start date is within 7 days; the seeder ignores anything further out.
3. Delete the `SEED_UNITS` script property if it exists. While set, it overrides the schedule.
4. Run `previewAssignmentSeed()` and read the log for the new lesson and any skip reasons.
5. Run `seedAssignments()` to write the lesson as a LIVE row in the TeacherMatrix.
6. Set the `ROSTER_CONFIG_ID` script property to the lesson's Config ID (for example `CAS-8175-L07`). One ID per run.
7. Run `previewRosterEnrollment()`. A count of 0 or `SECTION_NOT_MAPPED` means a Canvas section has no period in `CanvasSectionMap`.
8. Run `applyRosterEnrollment()`. This creates each student's doc from the master template, shares it and adds the Ledger row. Students already enrolled in that lesson are skipped, so re-running is safe.
9. Repeat steps 6 to 8 for the other course (8175 and 8177 run separately).

**Common reasons a date alone does nothing.** No LIVE assignment yet; date more than 7 days out; `SEED_UNITS` still set; an 8177 lesson with no teacher-approved prompt file; a stale Canvas export missing newly added students.

Do not confuse this with the 2 a.m. `buildUpcomingLessons()` trigger, which builds class-level lesson frame docs, not student docs.

**Since 2026-10-17** the nightly lesson rollout (`58_LessonRollout.js`) does steps 3 to 9 by itself once `ROLLOUT_AUTO_APPLY` is set: it seeds and enrolls lessons starting within 2 days and shares their docs the night before (see `cas-ccps/README.md`, "Nightly lesson rollout"). Steps 1 and 2 (a dated `LessonSchedule` row) are still yours.

## 7. The patch and deployment

**File:** `submit-failures.patch` (apply with `patch -p1` from the repo root, against `KOS-main_21.zip`).

**Files changed.**
- `00_SharedConfig.js`: new `submitFailures` tab name.
- `13_StudentDashboard.js`: new student messages, `dashRecordFailure_()`, failure logging for `DOC_UNREADABLE` and `NO_QUEUE`.
- `34b_CasAttentionSignal.js`: 24-hour failure count in the admin section.
- `37_FlowInputBuilder.js`: `_fiInsertEvaluation_()` and its use in the harvest.
- `03_QueueBridge.js`: next-steps wording no longer quotes the marker line.
- Tests: `student-doc-service`, `cas-attention-signal`, `flow-input-builder`, plus fake-document attribute support in `tests/harness/gas-sandbox.js`.
- `HISTORY.md`: two new entries recording the causes and rules above.

**Deploy.** `clasp push` for the affected projects, then the usual `clasp version` and `clasp update-deployment` for the two web apps. After pushing, run `clasp deployments` to confirm the Student Dashboard moved off v12 (executions showed v12; the zip has no git history, so whether v12 matches the repo is unconfirmed). If the manifest changes again, repeat the scope-approval step from section 2.

**First-run behavior.** The `SubmitFailures` tab does not exist until the first failure. The signal treats a missing tab as zero. It was not added to the retention schedule because it holds no student data; add it if every tab should be listed.

## 8. Checklist for the next live submission

1. Student presses Submit for Feedback; a `PENDING` row appears in ReviewQueue.
2. The row moves to `STAGED`, then staging shows `IN_PROCESS`; a `FlowInput` row appears as `READY` within about a minute.
3. Flow 2 runs without a manual start (issue 4, resolved 2026-10-23). If it does not, check Studio's run history.
4. `FlowInput` reaches `EVALUATED` then `HARVESTED`; staging `COMPLETE`; ReviewQueue `COMPLETE`; Ledger `COMPLETE`.
5. In the student's doc, the evaluation block sits inside the feedback zone, above the assignment, in normal-sized text, with its next steps. **With `FEEDBACK_AS_COMMENT` on (from 2026-10-18):** instead, the evaluation is a Drive comment on the doc, nothing is written into the body, and a doc with the new header shows the result on its `Feedback:` line.
6. The Teacher Dashboard status changes (queue item 4 check).
7. Open the Teacher Dashboard and CAS signal; the SubmitFailures count should be absent or zero.

## 9. Not verified

- How real Google Docs formats the inserted paragraph after the attribute copy. Tests use a fake document, so inspect the first live result.
- Whether Studio's sheet trigger fires on script-written rows (open issue 4). **Answered 2026-10-19: not on an appended row; yes on an edit of an existing cell.**
- Backprop's actual trigger interval (the code comment mentions 2 minutes; the effective cadence was not checked).
- Whether the live web app matches the repo (v12 versus later pushes). **Answered 2026-10-20: the Student Dashboard is well past v12.**
- Two odd rows at the top of the Ledger tab (rows 2 and 3: `IN_PROCESS`, no timestamp, placeholder-style ConfigIDs). They look like leftover test rows from a canary or fixture run. Check before deleting.

## 10. Reference

- Submit path: `13_StudentDashboard.js` (`submitMyWork`, `queueSubmission_`, `SUBMIT_ERRORS`).
- Queue and timeout: `03_QueueBridge.js` (`bridgeQueue`, `backPropagateCompletions`, `markLedgerEvaluated_`, `processCompletedEvaluation_`, `buildNextStepsText_`); `06_StagingPipeline_Turnstile.js` (12-minute timeout); `34_QueueWatchdog.js`.
- Flow 2 hand-off: `37_FlowInputBuilder.js` (`buildFlowInputRows`, `harvestFlowInputResults`, `checkFlow2Liveness`, `installFlowInputTriggers`).
- Doc creation: `02_Form1_IntakeAndWorkspaceGenerator.js`; enrollment: `52_CanvasRosterImport.js`, `53_AssignmentSeeder.js`; schedule: `55_LessonSchedule.js`.
- Signal: `34b_CasAttentionSignal.js`.

## Appendix: the one-off probes

Paste into the project named, run once from the editor, then delete. None
of them logs student writing. They are not in the repo's scripts on
purpose, so the names below have no parentheses.

- **authTest** (Student Dashboard project): confirms the deploying account
  has approved the documents scope. Opens the master student *template*
  doc, never a student's: `DocumentApp.openById("<MASTER_TEMPLATE_ID>").getName()`.
- **commentTest** (Central Ledger project, Drive advanced service v3): on a
  test doc you own, `Drive.Comments.create({ content: "Automated feedback
  test.\n\nSecond paragraph." }, "<TEST_DOC_ID>", { fields: "id,author,content" })`.
  Decides feedback-as-comments: how it shows on web and iOS, whose name it
  carries, whether it emails, whether an editor can delete it.
- **revisionProbe** (Central Ledger project): on a doc with real editing
  history, `Drive.Revisions.list(fileId, { fields:
  "revisions(id,modifiedTime,lastModifyingUser(emailAddress),exportLinks)", pageSize: 200 })`,
  then for the last 30 revisions log only the modified time and the
  *length* of the `text/plain` export. Logs a count of distinct editors,
  never their addresses or any text. Decides how far the authenticity
  metrics can go.

**Diagnostics ruled out on 2026-10-15:** the deployment domain's Chrome
policy export. The failing step ran on Google's servers and appeared in
Executions, so no browser setting could cause it (the one odd policy,
`DefaultCookiesSetting` = 4, session-only cookies at machine level, is
unrelated). **If an approval prompt never appears or can't be approved,**
the district's Admin console API controls may be blocking the new scope
for the account: an admin-side setting, not a code bug.
