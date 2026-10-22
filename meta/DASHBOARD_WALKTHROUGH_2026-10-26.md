# Dashboard walk-through, week of Oct 26

Read from `origin/main` at `dcc57f9` (#240). Files: `cas-ccps/scripts/13_StudentDashboard.js` (Student Dashboard project: 00, 13, 49, 63), `07_TeacherDashboard.js` plus `23_StudentProfileManager.js`'s `buildShadowMatrixSummary_` and `29`'s roster (Teacher Dashboard project: 00, 07, 22, 23, 26, 27, 29, 31, 32, 36, 48). I also read the code that writes what these screens show: 02, 03, 24, 25, 37, 41, 58. No student names, emails or file IDs appear here.

Dates assume the walk is on **Mon Oct 26**. Odd and even days go by calendar date (24's `getDayType_`), so Oct 26 is an **EVEN** day:
- 3-Even meets today.
- 3-Odd meets Tue Oct 27.
- Period 1 (`DAILY_HALF`, no `WarmUpPlan` row) has its rest day today, because a pair starts on an odd date. Its last warm-up was Fri Oct 23, and its next is Tue Oct 27.

---

## Checklist

### 0. Before you start

1. **Redeploy the Teacher Dashboard**: in the Teacher Dashboard project, Deploy → Manage deployments → edit → New version. A push changes the code but not the deployed version, and 07 and 23 have both changed since the last version (10-19). The Student Dashboard's version was recorded done on 10-20. If a 3-Odd student sees a warm-up dated an even day (check 3), the Student Dashboard is running a version from before the period split. Give it a new version too.
2. **Get the right accounts.** Each dashboard works out who you are from the signed-in Google account. You need a test student account in the district domain with Ledger rows, or you can look over real students' shoulders. Have one of each:
   - **A**: a student with a scored text-box warm-up (WarmUpQueue `SCORED`), ideally one still inside its extra-credit window.
   - **B**: a student with no warm-ups at all.
   - **C**: a 3-Odd student and **C′**: a 3-Even student.
   - **D**: a period 1 (`DAILY_HALF`) student.
   - **E**: a student who has pressed Submit for Feedback and whose Flow 2 hasn't come back yet (ReviewQueue `PENDING`, or STAGING_PIPELINE `PENDING_INFERENCE`).
   - **F**: a student whose latest check passed (Ledger LastResult `PASSED`).
3. Write notes as "student A / C / …", never by name.

### 1. Student Dashboard: header and banners (any student)

- [ ] The header reads "📚 My Assignments", with the account label on the right, a term dropdown, **ℹ️ My Info** and **↻ Refresh**.
- [ ] The term dropdown starts on "All Terms" and lists this year's terms (2627_MP1). Picking a term with nothing in it gives "No assignments for …, Try All Terms". It must not say "No assignments found for <account>".
- [ ] **"🎉 You were just registered…" banner.** Note how many lines it has and whether this student really registered in the last 3 days. Expect a line for each assignment row made in the last 3 days (finding 11).
- [ ] **ℹ️ My Info** opens "My Info — What Is On File". Check that name, class, **period (3-Odd / 3-Even for period 3)** and teacher are right. Count the cards: expect one per assignment, not one per class (finding 12).

### 2. Student Dashboard: Warm-ups card (top of the page)

The card sits under a "WARM-UPS" heading above the assignments. It has at most two parts: **Last warm-up · <date>** and **Today's warm-up** or **Next warm-up · <date>**.

**Student A (scored, text box):**
- [ ] "Last warm-up · <day, date>", the course name in grey, and the pill "Checked — feedback is below" (green).
- [ ] The score line reads **N/10** in bold, then "Length x · Grammar y · Engagement z".
  - x is 0, 3, 5 or 6. That is the word-count score, not the number of words: 30+ words gives 6, 25–29 gives 5, 15–24 gives 3. y is 0–1 and z is 0–3, and N = x + y + z.
  - Compare it with the WarmUpQueue row: columns M+N+O (12–14 zero-based) should add up to Q (16), minus 1 if P (15) is 1.
  - The parts have no "/6, /1, /3" after them. Note whether a student would understand them (finding 13).
- [ ] The feedback shows in a grey box with its line breaks. If it stops mid-sentence, that is the 500-character cap (finding 14).
- [ ] The question the student answered and their answer are **not** shown under Last warm-up. Note whether the feedback makes sense without them (finding 10).
- [ ] **Extra credit**, while it is open and not yet earned: a purple line reads "Extra credit: reply to this feedback in at least 10 words by <date>", with a reply box.
  - The date shown is lesson date + 7 days. 25 actually stops checking at 3:15 a.m. on that day (finding 4).
  - Save a reply of 10 words or more. "Saved <time>. It's checked overnight." appears, and after Refresh the box keeps the text with "Your reply is saved and checked overnight."
- [ ] Once credited (the morning after a reply of 10+ words): "✓ Extra credit earned", the score still shows **N/10**, and a green "+1 extra credit" appears next to it.
- [ ] If the student's last warm-up is newer than one with an open window, the older one's reply box is gone (finding 5). Try this with C: by Oct 26 their last warm-up is Oct 23, and the Oct 21 window is no longer reachable.

**Today's / Next warm-up (text box):**
- [ ] The bridge paragraph, if there is one, is in grey italics above the question (Flow 5's 2–3 sentences). Read a few (BACKLOG item, D6). Most students have none.
- [ ] The question shows, with an answer box and **Save answer**. After saving: "Saved <time>. You can change it until the end of the day." The button reads **Update answer** after Refresh.
- [ ] Students C′ (3-Even) and A on a day their period meets: "Today's warm-up · Mon, Oct 26", pill "Ready — answer today" (purple).

**Student C (3-Odd) on Oct 26:**
- [ ] No warm-up dated Oct 26 or any other even day. If one appears, the NOT_MEETING filter isn't deployed (see 0.1).
- [ ] Once tomorrow's is delivered (after the 3:30 a.m. build and Flow 3): "Next warm-up · Tue, Oct 27", but the pill says **"Ready — answer today"** and the note says "until the end of the day" (finding 9). It *can* be answered today (decided 10-17). Note whether a student reads it as due today.

**Student D (period 1, rest day Oct 26):**
- [ ] "Last warm-up · Fri, Oct 23": its score, its feedback, and the extra-credit reply box. That is what the rest day is for (DEPLOYMENT_HANDOFF 17d).
- [ ] If the Oct 23 warm-up shows "Being checked — your work is saved" and no score, Flow 4 hasn't returned. Note the time.
- [ ] Also check for a "Next warm-up · Tue, Oct 27" with an answer box open, which would compete with the reply box (finding 9).

**Student B (no warm-ups):**
- [ ] No "Warm-ups" heading and no card at all. The assignment cards start at the top.

**Doc warm-ups (only if a course still has `WARMUP_TEXT_BOX` off):**
- [ ] "Open warm-up ↗" appears, and the extra-credit line says to reply under the feedback in the doc.

**Other statuses you may see:**
- "Waiting to be checked": a past day, not yet scored. It shows even when the student wrote nothing, until 3:15 a.m.
- "Being checked — your work is saved": PENDING_EVAL or EVAL_ERROR.
- "No response was written": INCOMPLETE.

### 3. Student Dashboard: assignment cards

Cards are grouped under "BLOCK <block> - <class> - <teacher>".

- [ ] Each card shows the assignment name, a status pill, "Period 3-Odd · Subject" (or "No class info on file"), "Last evaluation: <date>" or "No evaluations yet", **Open My Document ↗**, and **Submit for Feedback** where allowed.
- [ ] **A never-submitted assignment**: pill "Not started yet" (grey), with a Submit button.
- [ ] **Student E (submitted, waiting for Flow 2):**
  - Right after pressing Submit: "✅ Submitted. In a few minutes your feedback will be a comment on your document: open it and click Comments (top right)." (`FEEDBACK_AS_COMMENT` = all).
  - Press Refresh. **Expect the pill still to say "Not started yet"**, not "Queued for evaluation…", with the Submit button still showing, until Flow 2 starts. The teacher sees QUEUED for the same student (finding 2).
  - Once Flow 2 starts: "Evaluating now…" (orange).
  - Pressing Submit again while waiting should say "This is already waiting for feedback…" (only while the ReviewQueue row is still PENDING).
- [ ] **SubmissionTS**: look for any "Submitted <time>" line on E's card. **Expect none.** It only shows on a COMPLIANT card, which nothing creates any more (finding 3).
- [ ] **Student F (passed):** pill "Evaluated — feedback ready: open your document and click Comments" (purple, sorted as needing action), with Submit still showing. Nothing on the card says the work passed. The doc header says it (finding 8).
- [ ] **Feedback-as-comment link**: press "Open My Document ↗" on F's card. The doc opens, the feedback is a comment (Comments, top right), and the doc header's "Feedback:" line is color-coded.
- [ ] **A flagged / timed-out row** (Ledger `ERROR_…`): red "Flagged ⚠ — see your teacher", with an "✉ Email <teacher>" link.
- [ ] **No assignments at all**: the Warm-ups card (if any), then "No assignments found for <account>…" with three bullets. The footer is blank in this case (finding 17).
- [ ] Footer: "Last refreshed: <time> · <account>".
- [ ] **Privacy check:** across A–F, every card, warm-up, answer and reply shown belongs to the signed-in student. I found no code path that shows another student's rows (see "Checked and fine" below).

### 4. Teacher Dashboard: header and summary (after redeploying)

- [ ] The header reads "📊 Assignment Dashboard", with: **+ New Lesson** (only when M2 is on), **My Context**, **✉ Parent Reports**, **🎓 SCR Reviews**, **💬 Feedback**, **↻ Refresh** and the term dropdown.
- [ ] **Warm-up readiness strip** under the header (M2 on): "📅 <unit id — unit name>" or "No active unit", "x of N students have evaluation history", "y with warm-up responses", and the profile lines.
  - Compare y with the number of students who actually **answered** a warm-up. Expect it to be higher, because blank (INCOMPLETE) warm-ups count (finding 6).
  - **Click each number.** Expect the roster to narrow to those students, with a blue "Showing n …" bar and **Clear filter** (finding 7, fixed 10-22).
  - N counts StudentProfiles rows, not the roster in view.
- [ ] **Lesson picker** "Showing": it defaults to "Current lesson: <name>" (LessonSchedule's latest start_date on or before today, per course), and "All assignments" is at the bottom.
- [ ] **Summary cards** for the lessons in view:
  - Students, ✅ Passed, ↩️ Passed before (now revising), ✏️ Checked (not passing yet), ⚪ Not checked yet, Needs attention, and Pending Review (only if more than 0).
  - Passed + passed before + not passing + not checked = Students.
  - Click a card: the list filters, and a grey "Showing n: …" bar with **Clear filter** appears.
  - In "All assignments", "Students" counts assignment rows, so one student with 5 assignments counts 5 (finding 16).

### 5. Teacher Dashboard: roster rows

- [ ] Each lesson section has a header: "<lesson> 12 students · 3 passed · … not checked". Students are ordered by period (1, 3-Even, 3-Odd, 4…), then name.
- [ ] Each row shows the name, "Block x · Period 3-Odd · Subject", "N checks · last <date>" or "No checks yet", "First passed <date>", "Suggested score (latest check): n/5", **Open document ↗**, and on the right the state badge, plus a pipeline badge when the work is QUEUED, EVALUATING NOW, FLAGGED or PENDING REVIEW.
- [ ] Student E's row shows the **QUEUED** badge while the student's own card says "Not started yet" (finding 2).
- [ ] Student F's row shows "✅ Passed" with a first-passed date.
- [ ] Period 3 students show **3-Odd / 3-Even**, never plain "3" (`PeriodOverride` / relabel).
- [ ] There is **no submitted time on any row**, although the server sends it (finding 3b).

### 6. Teacher Dashboard: 💬 Feedback

- [ ] Open it. Expect "Where feedback goes", a **Now:** line with the live setting (all), and one row each for **8175** and **8177** (finding 1, fixed 10-22). A course missing from the list means its Ledger rows name no course in ClassName, Subject or CourseName: write down which.

### 7. Teacher Dashboard: My Context

- [ ] **My Context** replaces the roster with "Student Context — Full Roster", "Generated <time> · Updates weekly", and one row per student with an Active / No recent activity badge, the account, "last updated", and **Open doc ↗**.
- [ ] There is no back button: **↻ Refresh** returns to the roster (finding 18).
- [ ] As a student, open the Teacher Dashboard URL. You get only the student's own small My Context page ("No context recorded yet…" or their own doc link), never the roster.

---

## Findings (ranked)

Severity: **wrong result** (the screen shows or does something false, or a documented feature doesn't happen), **confusing** (true but misleading to a student or teacher), **cosmetic**. Line numbers are on `origin/main` `dcc57f9`. Each finding was traced through its callers and the columns it reads unless it is marked *unverified*.

### Wrong result

**1. 💬 Feedback panel lists no courses and can't show or change the live setting.** *Fixed 2026-10-22 (cas-ccps/HISTORY.md): the course comes from the row's names, in the panel and in `feedbackAsCommentChecker_`; the panel shows the setting.*
- **Where:** `07_TeacherDashboard.js:1046-1064` (`_tdFeedbackPlacement_`), `07:2206-2207`, `00_SharedConfig.js:309-326`.
- **What:** Courses are taken from Ledger ConfigIDs matching `^CAS-(\d{4})-`. But a Ledger row's ConfigID is the student's workspace ID, `VDOE-XXXXXX-YYYY` (`02:187,502-506`; 33's comment at `33:207`; 10-21 handoff). So `courses` is empty, and `data.value` is never rendered.
- **Also:** the same mismatch means a one-course value ("8175") can never take effect. 13 (`:60,102`), 37 (`:685`), 03 (`:267`) and 02 (`:368`) all test the VDOE workspace ID, so only "all" and "off" work.
- **Scenario:** the teacher opens 💬 Feedback during the walk and sees "No courses with assignments yet". If someone sets the `_CONFIG` row to `8175` by hand, every student's feedback quietly goes back into the doc, while the panel still shows nothing.
- **Fix:**
  1. Work out the course from the row's class or course name with `warmUpCourseCode_` (00, the same rule `WARMUP_TEXT_BOX` uses), both in `_tdFeedbackPlacement_` and in a `feedbackAsCommentChecker_` that takes the row rather than the ConfigID.
  2. Show `data.value` at the top of the panel.

**2. A submitted assignment reads "Not started yet" on the student's card while the teacher sees QUEUED.**
- **Where:** `13_StudentDashboard.js:619-670` (`resolveStudentStatus_` / `resolveStudentClass_`), compared with `07:1386-1389`.
- **What:** 13 only knows a staging status of `IN_PROCESS`. Its `PENDING`/`STAGED` cases are dead, because no code ever writes those to the **Ledger**: 03 writes them to ReviewQueue only, and the Ledger goes ACTIVE → COMPLETE in `03:483-490`. 07 also maps staging `PENDING_INFERENCE` to QUEUED; 13 doesn't.
- **Scenario:** student E presses Submit, refreshes, and sees "Not started yet" with the Submit button still there. Pressing Submit again after the bridge has moved the row to STAGED passes the `ALREADY_QUEUED` check (`13:554-556` only looks for PENDING) and stamps a new SubmissionTS. On a resubmission of evaluated work, the card keeps saying "Evaluated — feedback ready" until Flow 2 starts.
- **Fix:**
  1. In 13, treat staging `PENDING_INFERENCE`, or an open ReviewQueue `PENDING` row for the fileId, as "Queued for evaluation…" (IN_PROGRESS).
  2. Set `canSubmit` false while queued.
  3. Drop the dead Ledger cases.

**3. SubmissionTS is never shown on either dashboard.**
- **Where:** `13:1021-1024`; `07:559` compared with the row markup at `07:2797-2814`.
- **What:**
  - The student card shows "Submitted <time>" only when `statusClass === "DONE"`, which is COMPLIANT. Nothing reaches COMPLIANT now: 04's turn-in gate is retired (P0-04), and the only writer, `07:678`, needs PENDING_TEACHER_REVIEW, which nothing writes.
  - The Teacher Dashboard computes `submittedAt` and never renders it (3b).
  - HISTORY's #186 entry says both dashboards show it.
- **Scenario:** during the walk, student E and student F both have a SubmissionTS on the Ledger, and neither dashboard shows it anywhere.
- **Fix:**
  1. Show "Last submitted <time>" on any student card with `submittedAt`.
  2. Add "submitted <time>" to the teacher's `.last-eval` line.

**4. The extra-credit window on the card runs one day past when 25 stops counting.**
- **Where:** `13:275-276,305` (`ecOpen`, `byLabel`), compared with `25_WarmUpWriter.js:548-551,569-611`.
- **What:**
  - The card keeps the reply box open, and says "by <lesson+7>", through all of day L+7.
  - 25's nightly check works with `new Date("YYYY-MM-DD")`, which is UTC midnight, the evening before in New York, against `now − 7 days`. At 3:15 a.m. on L+7 it does a last check, then stamps the row expired.
  - So a reply saved during L+7 is stored and never credited.
- **Scenario:** a student with an Oct 20 warm-up saves a 15-word reply on Oct 27 at 2 p.m. The card said "by Tue, Oct 27" and accepted it. The Oct 28 run skips the row (already stamped), and no +1 ever appears.
- **Fix:** close the window on the card a day earlier (open while `lessonDate > ecFrom`, label "by <lesson+6>"). Or change 25 to compare `yyyy-MM-dd` strings so the last check is the 3:15 run on L+8.

**5. Only the most recent past warm-up is offered for extra credit, so the 7-day window closes after about 2 days for alternate-day groups.**
- **Where:** `13:257-262` (`prev = past[past.length-1]`), compared with `25:548-611`.
- **What:** 25 still accepts replies for 7 days, but a text-box reply can only be typed on the dashboard, and the reply box exists only on "Last warm-up". As soon as a newer lesson date passes, the older warm-up disappears from the card.
- **Scenario:**
  - A 3-Odd student is told on Oct 22 "reply by Wed, Oct 28" for Oct 21. From Oct 24 the card shows the Oct 23 warm-up instead, and Oct 21's reply can no longer be written.
  - A student who skipped yesterday (INCOMPLETE) loses the box for the warm-up before it at once.
- **Fix:** make "Last warm-up" the most recent **SCORED** one, or list every SCORED warm-up whose window is still open (usually one or two), each with its own reply box.

**6. Warm-up readiness "with warm-up responses" counts students who wrote nothing.**
- **Where:** `23_StudentProfileManager.js:554` (`buildWarmupData_` keeps INCOMPLETE) and `23:820-824`; shown at `07:1899-1900`.
- **What:** INCOMPLETE is 25's stamp for a blank answer, but it adds an entry to `SP_WARMUP_SCORES`, and any entry counts as a "response".
- **Scenario:** on 10-19, about 50 of about 53 warm-ups were INCOMPLETE, yet the strip would count almost every delivered student as "with warm-up responses".
- **Fix:** in `buildShadowMatrixSummary_`, count a student only if some score has `word_count_score > 0`. Or record the status in the score object and skip INCOMPLETE there. Keep the INCOMPLETE rows for the shadow matrix as they are.

**7. The readiness strip's numbers are meant to be filters but can't be clicked.** *Fixed 2026-10-22: the spans are buttons.*
- **Where:** `07:1634-1637` (`<span id="wr-…">`), compared with `07:1879-1888`.
- **What:** `wrButton` wires `onclick` only when `el.tagName === "BUTTON"`, and the markup uses spans. `applyWrFilter`, the "View Profile →" buttons (`07:2754-2775`) and `getStudentShadowProfile` can't be reached from the UI.
- **Scenario:** the teacher clicks "3 ready for fully personalized feedback" and nothing happens.
- **Fix:** change the four spans to `<button type="button">`, styled as links.

### Confusing

**8. A passed assignment looks the same as one that needs revision, and is flagged as needing action.**
- **Where:** `13:634-636,665`; the Ledger's LastResult is written at `37:762-769` and never read by 13.
- **What:** COMPLETE always maps to "Evaluated — feedback ready…" (purple NEEDS_ACTION, sorted second) with Submit showing. The teacher sees ✅ Passed for the same row.
- **Scenario:** student F sees a purple "needs action" card for work that passed and may resubmit it.
- **Fix:** read `LEDGER.LAST_RESULT`:
  - PASSED: "Passed ✓ — feedback is in Comments", class DONE.
  - NEEDS_REVISION: "Feedback ready — revise and submit again", class NEEDS_ACTION.

**9. A warm-up for a later day says "Ready — answer today".**
- **Where:** `13:327-329` (`resolveWarmUpStatus_`), `13:1104,1111`.
- **What:** Every DELIVERED warm-up with `lessonDate >= today` gets "Ready — answer today", and the saved note says "until the end of the day". "Next warm-up" is used only when the date is in the future.
- **Scenario:** on Oct 26, a 3-Odd student, or a period 1 student on their rest day, sees "Next warm-up · Tue, Oct 27 — Ready — answer today" next to the reply box. They may answer it today thinking it's due.
- **Fix:** when `lessonDate > today`, use the pill "Open — for <EEE, MMM d>" and the note "You can change it until the end of <EEE>".

**10. "Last warm-up" shows feedback without the question or the student's answer.**
- **Where:** `13:1080-1101` (`_wuPrevious`). `w.warmup` and `w.answer` are already in the view (`13:287-288`) but aren't rendered.
- **Scenario:** a student reads "Your second sentence could use a specific example…" without seeing what they wrote 2 days ago, and has to write an extra-credit reply to it.
- **Fix:** add the question and the student's answer above the score, both collapsed by default.

**11. The "🎉 You were just registered" banner fires for every new assignment.**
- **Where:** `13:96-99,1221-1229`; rows come from 58's rollout (`58:11-20`, made up to 2 days ahead).
- **What:** `isNewRegistration` is set per Ledger row, and each lesson's doc is a new Ledger row with a fresh Timestamp. The banner prints one line per such row, with no dedupe.
- **Scenario:** when a new lesson is rolled out, a student who registered in September sees "You were just registered for <class> with <teacher>". After `refreshAssignments()` they may see several identical lines.
- **Fix:** take the **earliest** Timestamp per class and teacher. Show the banner only if that earliest one is within 3 days, and show one line per class.

**12. My Info shows one identical card per assignment.**
- **Where:** `13:1244-1273` (`renderMyInfo` maps every assignment row).
- **Scenario:** a student with 8 lessons sees 8 copies of the same name, class, period and teacher.
- **Fix:** dedupe on class + period + teacher.

**13. The score parts have no maximums.**
- **Where:** `13:1083-1086`.
- **What:** "Length 3 · Grammar 1 · Engagement 2". A student can't tell that Length is a word-count score (0/3/5/6 from `25:135-140`, not a word count) or that grammar is out of 1.
- **Fix:** "Length 3/6 · Grammar 1/1 · Engagement 2/3". Optionally add "(30+ words for full length)".

**14. Text-box students see feedback cut at 500 characters, without an ellipsis.**
- **Where:** `25:142,897` (`writeFinalScores_` caps WarmUpQueue's flow4_feedback), read at `13:291`.
- **What:** Doc warm-ups get the full text (`41:1438` passes the untruncated `feedback` to the doc), but the dashboard only has the WarmUpQueue copy.
- **Scenario:** a long Flow 4 reply ends mid-word on the card.
- **Fix:** raise the cap (the cell holds 50k characters), or add "…" when the text is cut.

**15. A past warm-up with no answer reads "Waiting to be checked".**
- **Where:** `13:327-329`, compared with `25:381-398`.
- **What:** A DELIVERED row whose date has passed shows "Waiting to be checked" even when the answer is blank. 25 scores only `lesson_date === yesterday`, so if a 3:15 run is missed (M2 off, an error), that warm-up is never scored and stays "Waiting to be checked" for good.
- **Fix:** if the WarmUpTextBox answer is blank, show "Not answered". The missed-night gap is in 25 (scoring only yesterday). Note it for later rather than for this week.

### Cosmetic

**16. "Students" counts assignment rows.** `07:2668` (`inView.length`). In "All assignments" one student counts once per assignment. Label it "Assignments" in the ALL view, or count distinct `googleId`.

**17. The footer stays blank when a student has no assignments.** `13:964-972` returns before the footer is set at `13:1037`. Set the footer in that branch too.

**18. "My Context" opens "Student Context — Full Roster", with no way back except Refresh.** `07:1612,2866-2891`. Rename the button "Student Context" and add a "← Back to dashboard" link that calls the page's `loadData` (client-side).

**19. A stale comment says the card shows "the last two weeks".** `13:157-158`. The card shows only the last warm-up and the current one (`13:251-264`). Fix the comment.

### Unverified

**20. *Unverified:* saves may hit "busy" when a whole class saves at once.** `13:361-362`. Every answer or reply save takes the script lock for up to 10 s, and while holding it reads the whole WarmUpQueue and WarmUpTextBox. At the start of class, 25+ students saving within seconds could get "The system is busy". This depends on how long the reads take on the live sheets, which I can't measure. To check: watch Executions for `submitWarmUpAnswer` durations during a class. If they run above about 0.5 s, read only the student's rows, or lock only the write.

**21. *Unverified:* one warm-up card across courses.** `13:256-262`. A student with warm-ups in two courses would see only the earliest "current" one. 24's shared-period note says no student is in both courses, so this is probably moot.

### Checked and fine

- **Column constants:**
  - `DASH_WQ_*` (13:210-222) match `WQ24_*` (24:54-77) and `WQ25_*` (25:70-90): google_id 4, lesson_date 5, snapshot 6, status 8, doc_id 9, scores 12–16, feedback 17.
  - `WTB` (00:350-353) matches what 41 writes (`41:1378-1384`) and 13's two-cell writes (response + submitted_at, reply + replied_at).
  - `LEDGER` (00:960-1009) matches 03's `L_*`.
- **Scoring:** `points = total − extra credit` matches `41:1418` (total = word-count score + grammar + engagement + extra credit) and the extra-credit sweep's +1 (`25:602-605`). The range check is integers only, grammar 0–1 and engagement 0–3 (`41:1406-1410,1515`), and the maximum is 10.
- **NOT_MEETING:** filtered on the card (`13:242`), skipped by 25 (`25:363-366`), never set on an answered row (`24:946`).
- **Period split:** both dashboards show the Ledger's Period as is (3-Odd / 3-Even). 24 queues by ClassSchedule period, and the teacher sort is numeric-aware.
- **Dates:**
  - Neither dashboard reads a timestamp that a Studio flow writes as text. LastEval is a Date from 03, SubmissionTS a Date from 13, FirstPassedAt a Date from 37, and submitted_at / replied_at Dates from 13. So `sheetTimestampMs_` isn't needed here.
  - Lesson dates go through `dashIsoDate_` (a Date, or `YYYY-MM-DD` text). Both projects run in America/New_York.
- **Escaping:** model and student text (bridge, warm-up, answer, feedback, reply, names, errors) all goes through `esc()` (00:906), and doc links through the page's `safeDocUrl` (client-side). Attribute and JS contexts in 07 use `jsAttr`.
- **One student's data shown to another:** I found no path.
  - The assignments, warm-ups, `submitWarmUpAnswer`/`submitWarmUpReply`, `submitMyWork` and `doPost` all match the Ledger or WarmUpQueue on `Session.getActiveUser()`, and the text-box row is reached only through the student's own queue_id.
  - The cache is per browser.
  - The Teacher Dashboard's data functions call `_isAuthorizedTeacher_`. A student opening it gets only `getMyStudentContext` for their own account.
