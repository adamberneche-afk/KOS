# Feature switches, the overnight check and the nightly lesson rollout

Split out of `cas-ccps/DEPLOYMENT_HANDOFF.md` on 2026-11-17; the handoff maps where everything is.

**Warm-ups in a text box (switch, added 2026-10-17).** With
`WARMUP_TEXT_BOX` on, a warm-up is answered on the Student Dashboard instead
of in a doc: Flow 3 writes it to the Ledger's `WarmUpTextBox` tab, the
student types the answer under it (until the end of the lesson day), the
3:15am run scores it, and the next day the card shows the score (out of
10, with its parts) and the feedback and, for
7 days, an extra-credit reply box (10 words or more). The card shows only
the last warm-up and the current one. To turn it on, add the row
`WARMUP_TEXT_BOX` to the Central Ledger's `_CONFIG` tab: `off`, `8175`,
`8177` or `all`. It must be on before Flow 3 delivers a warm-up: one already
delivered as a doc stays a doc. Set it back to `off` and new warm-ups are
docs again. Run `refreshSharedConfig()` in the Central Ledger and the
Student Dashboard so neither waits 10 minutes.

**The overnight check and flow pacing (added 2026-10-18).** The CAS
signal (`KOS_CAS_SIGNAL`) opens with LAST NIGHT from `34c_OvernightHealth.js`:
Ledger cycle jobs still failing, each 3 a.m. stage, today's and tomorrow's
warm-ups, Studio jobs with no return, failed returns, warm-ups sent as the
teacher's anchor, and (since 2026-10-23, at most every 6 hours) the setup
checks: the Ledger's column order (38), FlowPrompts against the code (40),
Studio returns in the right columns (41) and the retention date columns
(57), each problem naming the function to run; or one all-clear line. The
same lines are emailed to `ADMIN_NOTIFY_EMAIL` (or `TEACHER_EMAIL`) once a
day after 5 a.m. Nothing to install: the queue watchdog runs it. Studio drops runs when many rows change at once, so the
warm-up flows write at most 10 input rows per 5-minute run and append again
a job with no return after 30 minutes (the old row `RETRIED`, at most
twice).

**Assignment doc header (added 2026-10-17).** A doc made after this push
has a small grey page header: the student, class, block, period and
assignment with a "Your dashboard" link, and a "Feedback:" line. The line says
"not submitted yet", then "submitted …, waiting for feedback." on submit,
then the result in color once feedback arrives: green "✅ Passed (…)", amber
"✏️ Revise, then submit again (…)", each saying where the feedback is; a
timeout or a check that couldn't be used says so and that the teacher has
been told (since 2026-10-22). The body holds the assignment title and the
prompt (8 pt), "↓ Go to your response" / "↑ Back to the assignment" links,
the "Your response" heading, the response line, six writing lines (10 pt),
a small `[CONFIG_ID: …]` line and a grey last note that nothing below it is
checked (these from 2026-10-22, new docs only). Docs made earlier keep their
layout, and docs from before 2026-10-17 get no header. **Feedback as comments is on for both courses from 2026-10-17**
(operator's decision; `FEEDBACK_AS_COMMENT` = `all`); to roll back, set it
to `off` and new docs get the feedback zone again.

**Feedback as comments (optional switch, added 2026-10-17).** Flow 2
feedback goes into the doc's feedback zone by default. To post it as a
comment on the doc instead, so the doc holds only the assignment and the
student's work:

1. On a test doc you own, run the `commentTest` probe
   (`archive/2026-27-Q1/meta/CAS_BUG_HANDOFF_2026-10-16.md`, appendix) and check how the
   comment looks on the web and on a tablet, and that a long one fits.
2. On the Teacher Dashboard, **⚙ Settings** (💬 Feedback until
   2026-10-27), turn *Feedback as a comment* on for one course first. (It
   writes the row `FEEDBACK_AS_COMMENT` in the Central Ledger's `_CONFIG`
   tab: `off`, `all`, or the courses it is on for, such as `8175` or
   `8175,8177`; editing the tab by hand does the same.)
   It reaches the Central Ledger and the Student Dashboard within 10
   minutes; `refreshSharedConfig()`, run in a project, makes it immediate there.
3. Submit one test assignment and check: one comment on the doc with the
   result, the report and the next steps; nothing added to the doc; the
   dashboard says to open Comments.

Docs created while it is on have no feedback zone. Docs created before keep
theirs and their earlier feedback; only the "No feedback yet" line is
removed. Set the row to `off` to go back. If a comment can't be posted, that
one evaluation goes into the doc instead and the log says why.

**Nightly lesson rollout (added 2026-10-17).** Student docs follow the
`LessonSchedule` dates without running the seeder and roster import by hand
(`cas-ccps/README.md`, "Nightly lesson rollout (script 58)"):

1. After pushing, run `installLessonRolloutTrigger()` in the Central Ledger
   project (about 9 p.m. nightly). It starts in shadow and changes nothing.
2. Run `previewLessonRollout()` once and read the `RolloutLog` tab. Read it
   again after a few nights: each lesson's would-seed, would-enroll and
   would-release counts, and any PROBLEM rows (also in the CAS signal).
3. Set `ROLLOUT_AUTO_APPLY` to one course first (`8175` or `8177`), then
   `all`: a Central Ledger Script Property, or a row in the Ledger's
   `_CONFIG` tab. `off` (or deleting it) stops it.

Docs for a lesson two days out are made with the Ledger status `SCHEDULED`:
not shared, no Student Dashboard card, shown as SCHEDULED on the Teacher
Dashboard. The run the night before shares them and sets them `ACTIVE`.
A run makes about 25–30 docs before its time budget; one that stops short
schedules `runLessonRolloutCatchUp` a few minutes later until every doc is
made (2026-10-29; at most 12 a day). `runLessonRollout()` from the editor
starts the same chain. A lesson whose `release` cell in `LessonSchedule`
says `HOLD` (📅 Lessons → **Hold**) is left out until it is released.
Keep the Canvas exports fresh: an export older than 7 days is a PROBLEM row.
`removeLessonRolloutTrigger()` takes it out.
