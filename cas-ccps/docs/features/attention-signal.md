# CAS attention signal (script 34b)

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

The KOS Claude Project may not read CAS sheets (SMP-018), so
`34b_CasAttentionSignal.js` gives it counts instead. At the end of every
queue-watchdog run (every 10 minutes) it rewrites `KOS_CAS_SIGNAL`:
students and families first (submissions waiting on feedback or failed, SCR
suggestions awaiting the teacher's confirm, students newly retry-eligible,
students rated below satisfactory on the SCR, a 4 or 5, with the change
since yesterday), then admin
(Ledger cycle jobs failing now or today, by function name, `64`; watchdog
dry run or failure, timed-out and unknown-status queue rows, rows in flight
with no timestamp, Submit for Feedback failures on the system side, the
nightly rollout's problems that remain after the day's runs, an unfinished
day and a stale Canvas export once, when LAST NIGHT doesn't already say them,
and courses still in shadow; failing FERPA checks are named under LAST NIGHT). A line shows only above
zero; a count that can't be read says "unavailable". No names, IDs, grades or
student text. The first run creates the doc and stores its ID in
`CAS_SIGNAL_DOC_ID` (optional `CAS_SIGNAL_FOLDER_ID` picks its folder); paste
its link into the Project's instructions. Data boundary:
`docs/FERPA_DATA_MAP.md`, "CAS attention signal".

**Last night (script 34c).** The doc opens with a LAST NIGHT section from
`34c_OvernightHealth.js`: Ledger cycle jobs still failing, each 3 a.m. stage's run stamp (23, 33, 25, 24; a
quiet night stamps too, and a run ending in `ERRORS_n` or `NO_TAGS` is
reported), today's and tomorrow's warm-ups (delivered, not yet delivered,
ERROR), earlier warm-ups stuck at PENDING_EVAL, Studio jobs with no return
(Flow 2 after 15 minutes, Flows 3–5 after 30), failed warm-up returns in
the last day, and warm-ups delivered as the teacher's anchor. At most every
6 hours it also runs the setup checks that used to be editor-only (since
2026-10-23): the Ledger's column order (`38`), the FlowPrompts tab against
the code (`40`), the last day's Studio returns in the right columns (`41`)
and each retention record's date column (`57`); each problem is one line
naming the function to run. Since 2026-11-20 it is the one health run: it
also reports what the retired 6 a.m. alert (`10`'s `autoHealthAlert`) did,
as counts with what to do (submissions stuck evaluating or never started,
STAGING_PIPELINE rows with an unknown status, rubric extractions stuck two
hours or more, each failing FERPA check by name), with Module 2 off too, and
runs the retention archiving once a day at or after 5 a.m.
(`overnightArchiveDaily_`, before the checks; a failure is a line, the
all-clear says it ran). A deployment that still has the 6 a.m. trigger
removes it on its next firing. With nothing wrong it prints one all-clear line. The same
lines are emailed to `ADMIN_NOTIFY_EMAIL` (or `TEACHER_EMAIL`) once a day on
the first watchdog run after 5 a.m., with the deployment's version marker
and teacher account in the body; `CAS_OVERNIGHT_MAILED` holds the last date
sent. Counts only.

Each of the 9 projects has a real, committed `appsscript.json` and is
pushed with clasp — see [Version control (clasp)](#version-control-clasp)
below.

**Pipeline in one paragraph:** A student's doc is created from the Master
Student Template (Script 02) with four zones and invisible system-ID
stamps. The student clicks **Submit for Feedback** on their dashboard
(Script 13; Script 01's doc menu, **📊 Feedback → Submit for Feedback**,
does the same where student accounts may run Apps Script), which appends a
row to `ReviewQueue`. The Ledger's frequent jobs run from one every-minute
trigger, `runLedgerCycle` (`64`), each at its own cadence; every job between
Submit and feedback runs every minute (since 2026-11-14), and each job's run
time, the cycle's trigger time today against the daily quota, and the
schedule's share of the wait are in `showSetupStatus()` and
`reportEvaluationHealth()` (`LEDGER_CYCLE_TIMING`; `LEDGER_CYCLE_EVERY`
slows a job without a push). Since 2026-11-15 each of those jobs has a
cheap check beside it (`64`'s `LC_GATES`: one or two columns read through
one open of the spreadsheet per cycle) and runs only when the check finds
work; a job that ran makes the cycle check the steps after it at once
(bridge → turnstile → FlowInput row; harvest → backprop → part unlock), so
each stretch takes one cycle. In quiet hours (`LEDGER_CYCLE_QUIET`,
default 10 p.m.–6 a.m. New York time, weekends and days off) the jobs
without a check wait, and since 2026-11-19 the cycle checks only every
`LEDGER_CYCLE_QUIET_EVERY` minutes (default 5; `1` is every minute; the
minutes between return at once), so a submission at night waits up to that
much longer; every `LEDGER_CYCLE_BACKSTOP` minutes (default 15)
the cycle runs every due job without checks; `LEDGER_CYCLE_GATES` = `off`
goes back to every job on its cadence. Those five settings work as a
Script Property in the Central Ledger or a row of its `_CONFIG` tab (the
property first; since 2026-11-15, read through the shared-config cache, no
extra spreadsheet open), and `showSetupStatus()` says where each came from.
`showSetupStatus()` projects the
day's trigger time at this rate (WARN over half the 6 h quota, ALERT over
80%). `installLedgerChangeProbe()` logs whether Studio's writes fire an
onChange trigger (`reportLedgerChangeProbe()`; it acts on nothing). Script 03's
`bridgeQueue` (every minute) moves `PENDING` rows to `STAGING_PIPELINE`,
deduplicating against in-flight evaluations. Script 06's turnstile (every
minute) releases `PENDING_INFERENCE` rows to `IN_PROCESS` **per teacher**,
oldest first, up to `FLOW2_PARALLEL_LANES` at once (default 3, at most 10;
1 is the old one at a time; 2026-11-14) — per-teacher lanes, not the single
global lane used elsewhere in this codebase — and times out each row stuck
`IN_PROCESS` for &gt;12 minutes. Script 37 resolves the teacher's milestones (seeded from the
repo by `53`, or set up via Script 05 → Flow 1 → Script 08's confirmation
step) into one `FlowInput` row; Studio's Flow 2 reads the doc and makes the
Gemini call; 37's harvest (every minute since 2026-11-14; every 5 before) checks the output, writes the
feedback (a comment on the doc with `FEEDBACK_AS_COMMENT` on, otherwise the
doc's feedback zone; since 2026-11-17 the doc header's "the comment on this doc" links to the comment with Docs' `?disco=` link, and the dashboard's View feedback follows that link, `getMyFeedbackLink`, so the doc opens with the comment open instead of behind the Comments button), records the result on the Ledger row and in
`EvaluationLog`, and flips the staging row to `COMPLETE`, or to
`ERROR_EVALUATION` when the result can't be used; a row Studio leaves
unanswered for 12 minutes is restarted, at most twice. Script 03's
`backPropagateCompletions` (every minute since 2026-11-14; every 2 before) closes out the queue/ledger
rows, appends the "what to do next" block, and for a timeout or an
`ERROR_EVALUATION` emails the teacher and sets the doc header. Two
timeouts in a row with no Flow 2 answer between them email
`ADMIN_NOTIFY_EMAIL` once ("Flow 2 isn't answering"), and the CAS
attention signal shows the streak; the next answer the harvest sees clears
it (`FLOW2_ALERT_STATE`, 2026-11-14).
With `REFLECTION_ON_SUBMIT` on (off by default; `all` or one course code),
Submit first asks one or two questions about how the student worked
(fixed frames chosen in `00`, at least 10 words each), writes the answers
to the `ReflectionLog` tab and only then queues the work; 37 puts that
submission's answers into Flow 2's `PromptText` and posts them back to the
student as a comment on the doc
(`archive/2026-27-Q2/meta/STUDENT_WORK_PLAN_2026-10.md`, Phase 1).
Students turn in on Canvas, where the teacher grades. The Turn-In Form and
its handler (Script 04's 3-point match, stamp check and forensic
Drive-revision check) were retired on 2026-10-10 (HISTORY.md, P0-04): no
student was given the form, and the stamp it trusted could be typed. The
Teacher Dashboard's Pending Review queue (`PENDING_TEACHER_REVIEW` →
`COMPLIANT`) was fed only by that handler, so it stays empty.
