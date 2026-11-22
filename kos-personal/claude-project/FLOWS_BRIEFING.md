# FLOWS_BRIEFING

What each pipeline behind your signals is for, what starts it, what it
writes that you can read, and what a stuck one looks like there. Upload
this file to the Claude Project's knowledge. Written by Claude Code from
the code in the KOS repo (2026-11-15); the paths below are files in that
repo, which you can't open. A repo test fails when a file or function
named here is renamed or removed, so the names stay true.

**How to use it.**
- It describes the code, not what is live. The operator pushes code to
  Google by hand, and the push can lag the repo; the signal docs are the
  state, this file is the design.
- A claim about how a pipeline behaves that this file doesn't state is
  `[UNCONFIRMED — repo]`, however well the counts fit. Two counts moving
  together don't confirm a rule.
- Where a pipeline writes nothing you can read, say so, and name the
  function the operator can run to check it.

## kos-personal (the KOS pipeline)

**Session-log ingestion.** Turns a pasted chat and its log into the
record: decisions, next steps, Vector State, and the next morning's docs.
- *Starts:* `sensor1_scanInboundSessions()` every 5 minutes, on Google
  Docs in `03.5_INBOUND_SESSIONS` (under 50 characters skipped; the same
  text twice skipped, by a hash of the text). It keeps the whole paste
  untouched as `[RAW]_<session id>` in `03.4_RAW_EXHAUST`, splits it into
  chunks at every `[🧠 RTP` marker, queues each chunk, and moves the doc
  to `_PROCESSED` (to `_QUARANTINE` after 3 failures). For each new log,
  `_afterSessionLogQueued_()` adds its PROCEEDs to the moral debt counter
  and makes the fidelity draw.
- *Then:* `runMatrixTurnstile()` releases one chunk at a time to the
  Studio flows; `buildStudioInputRows()` writes its text to the flow's
  input tab; **the Curator** flow (decisions, next steps, alignment, SMP
  proposals) and the classify flow (Vector State) answer;
  `harvestStudioReturns()` files an answer only if it is grounded in the
  chunk; `processInferenceQueue()` writes it to the record: deferred
  decisions to `DECISION_REGISTER` as OPEN (a repeat of an existing one is
  held back in `DECISION_ECHOES`), proposed SMPs to `Blackboard` as
  `SMP-NEW`, unnumbered.
- *You read:* nothing the same day. The next morning's primer and
  decisions doc carry the result.
- *Stuck:* a session's decisions missing from the next morning's
  decisions doc; the primer's Data Quality naming sessions with no Vector
  State row; its "held back as repeats" line. A paste never picked up
  shows nowhere you read: ask whether the doc moved to `_PROCESSED`.
- *Code:* `kos-personal/2_Ingestion_Sensors.gs`,
  `kos-personal/10_Turnstile.gs`, `kos-personal/13_StudioInputBuilder.gs`,
  `kos-personal/12_StudioReturnHarvest.gs`,
  `kos-personal/3_Queue_Processor.gs`.

**Fidelity sample.** Checks that your closeouts match the chat behind
them. When a log is ingested, Apps Script draws it with a 10% chance
(after you wrote it); a drawn log becomes a `FIDELITY_AUDIT` row, and
Claude Code compares it with the raw copy. It never judges a log itself.
- *You read:* the primer's `Fidelity sample:` line: drawn, compared,
  what waits on the operator or on Claude Code, and anything OVERDUE
  (over 7 days).
- *Stuck:* an OVERDUE count, or "Waiting on you" (a log was pasted
  without its chat).
- *Code:* `kos-personal/27_FidelitySample.gs`.

**Moral debt counter (SMP-019).** Counts PROCEED answers at mandatory
pauses: +1 each, halving every 7 days. It reads only the literal word
PROCEED in a log's CLOSEOUT Alignment block, once per new log
(`recordMoralDebt_()`).
- *You read:* the primer's `Moral debt:` line.
- *Stuck:* it doesn't rise after a logged PROCEED: the log wasn't
  ingested, or the word wasn't under "Thresholds crossed".
- *Code:* `kos-personal/23_MoralDebt.gs`.

**Briefing docs.** `generateDailyPrimer()` at 6 a.m. writes the daily
primer (onboarding, moral debt, fidelity, echoes, vision, Vector State
with Data Quality, Shadow Matrix), then `generateBriefingDocs_()` writes
the open decisions, core facts and SMP register docs, each rewritten in
place with a `Generated at:` stamp under its title.
- *You read:* all four, by link.
- *Stuck:* a stamp that isn't today's. A failed run leaves the old doc
  and its old stamp, so stale means the morning run failed; it never
  means "nothing changed".
- *Code:* `kos-personal/6_Governance.gs`, `kos-personal/22_BriefingDocs.gs`.

**The Registrar.** Audits curriculum drafts dropped in
`09_Unclassified_Curriculum_Drafts`. Never student work.
- *Starts:* `runRegistrarIntake()` nightly at 1 a.m. queues new files in
  `REGISTRAR_LEDGER`; `runRegistrarMicrobatch()` (every 15 minutes)
  releases up to 3; `runRegistrarProcessor()` (every 10 minutes) harvests
  and validates. **Stage 1** (Auditor flow) extracts a structured schema
  from the draft. **Stage 2** (Curator flow) checks that schema against
  the draft and scores drift (`Dissonance_Delta_Score`) against the
  `VECTOR_*` docs. Then the draft is routed (to `06_CLASSROOM_ASSETS`,
  with a briefing in a Calibration Silo folder) or held for review
  (`AWAITING_CARBON`, with an anonymous triage) until the operator clears
  it.
- *Stage 2's standard:* the `VECTOR_*` docs were setup templates until
  2026-11-02, so Stage 2 scored every draft against nothing. Since then
  they are compiled each morning from the Labeler's labels (below); a
  theme with no labelled items still gives Stage 2 nothing to score
  against.
- *You read:* nothing. No signal doc carries the Registrar.
- *Check:* `getRegistrarStatus()` (the web app's Diagnostics tab) and
  `checkRegistrarFlowLiveness()`. A draft that keeps failing a stage
  (past 3 attempts) becomes `CRITICAL_FAILURE`.
- *Code:* `kos-personal/11_Registrar_CogRelay.gs`,
  `kos-personal/24_RegistrarFlows.gs`.

**The Labeler (Vector Item Labeler).** Fills the `VECTOR_*` docs. Every
item in the operator's record (pinned core facts, settled and open
decisions, session decisions, lessons) gets a theme and a kind from a
Studio flow, which labels by item ID and writes no text.
`runVectorItemLabeler()` runs hourly. Each theme's doc is compiled from
its PRINCIPLE and CONSTRAINT items, word for word, after a run that
harvested labels and every morning.
- *You read:* nothing directly.
- *Check:* `checkVectorItemLiveness()`.
- *Code:* `kos-personal/25_VectorDocs.gs`.

## The family mail signal (cas-ccps's Family Mail Sentinel)

**The Family Mail Sentinel.** Says how urgent student and parent mail is
without names or wording.
- *Starts:* `runFamilySentinel()` every 15 minutes: finds family mail
  in the inbox and labels it `KOS/Family`, has a Gemini flow classify a
  redacted copy, then `writeFamilySignal()` rewrites `KOS_FAMILY_SIGNAL`.
- *The rule, as the code has it.* Only family mail from the last 7 days
  counts. A thread is listed only while family mail in it came after the
  teacher's last reply, **and** some message of it is still in the inbox.
  **Archived = handled, in neither list**, whichever list it was in
  (NEEDS YOU NOW too); the doc's `FILED WITHOUT A REPLY` line counts
  those. Both tiers go through the same check. Of the listed threads:
  NEEDS YOU NOW is any with a safety flag; WAITING ON YOU is any that
  needs a reply (forced for a sensitive category, urgency 4 or more, a
  due date, a family's second contact this week, or mail not yet
  classified); FOR YOUR EYES is the rest. Line numbers are reassigned
  every run.
- *You read:* `KOS_FAMILY_SIGNAL`.
- *Stuck:* a stamp over 30 minutes old (the sentinel isn't running);
  lines saying "not yet classified" or "couldn't classify" (the flow
  isn't answering, so those threads sit in WAITING by default).
- *Code:* `cas-ccps/scripts/60_FamilyMailSentinel.js`.

## CAS, as you see it through KOS_CAS_SIGNAL

You never open a CAS sheet; `KOS_CAS_SIGNAL` is the whole view. Counts
only, and a line appears only when its count is above zero; a count that
can't be read says "unavailable", never all clear.

**The watchdog and the signal.** `runQueueWatchdog()` runs every 10
minutes, times out rows stuck far past their normal recovery, flags
unknown statuses, and then `writeCasSignal_()` rewrites the doc: LAST
NIGHT, then 1. STUDENTS & FAMILIES, then 2. ADMIN.
- *Stuck:* a stamp over 30 minutes old (the watchdog, or the Ledger
  cycle that runs it, has stopped); "Queue watchdog: the last run failed";
  "DRY RUN" (it reports stuck rows but doesn't fix them). The doc is never
  replaced while it exists; if it is gone, the overnight email says the
  watchdog re-linked or made a new one, and the link here must change.
- *Code:* `cas-ccps/scripts/34_QueueWatchdog.js`,
  `cas-ccps/scripts/34b_CasAttentionSignal.js`.

**The overnight health line (LAST NIGHT).** `overnightHealth_()` checks
the 3 a.m. runs (3:00 student profiles, 3:05 artifact sync, 3:15 warm-up
scoring, 3:30 warm-up queue build), warm-up delivery, Studio jobs with no
return, the lesson rollout and the turn-in checks, and, since 2026-11-20,
what the retired 6 a.m. alert email checked: submissions stuck evaluating
or never started, STAGING rows with an unknown status, rubric extractions
stuck 2+ hours, each FERPA check, and the day's retention archiving. It
emails the same lines once a day after 5 a.m.: the one health email.
- *You read:* LAST NIGHT: each problem line, or one line starting "All
  clear" that says what ran (ending "Retention archiving ran."). No
  all-clear line means something is wrong or unreadable. A problem line
  gives the count, where to look (sheet row numbers and how long, never a
  file ID, a teacher or a course) and the fix in its own words; a FERPA
  line carries the check's action ("Delete the GEMINI_API_KEY Script
  Property ..."). Quote the line; don't paraphrase the fix.
- *Code:* `cas-ccps/scripts/34c_OvernightHealth.js`.

**The Ledger cycle.** One trigger, every minute, that runs the Central
Ledger's frequent jobs one after another (the submission path, the
warm-up flows, the watchdog, part unlocks, Flow 6), each on its own
cadence and in its own try/catch, so one failing job doesn't stop the rest.
- *You read:* ADMIN's "Ledger job <function>: failing, n runs in a row,
  n failures today" (or "recovered").
- *Code:* `cas-ccps/scripts/64_LedgerCycle.js`.

**Flow 2: feedback on a submission.** A student presses Submit for
Feedback; `bridgeQueue()` queues it, `runStagingTurnstile()` releases it,
`buildFlowInputRows()` writes one flat row with everything Gemini needs,
Flow 2 answers, and `harvestFlowInputResults()` posts the feedback as a
comment on the student's doc and records the result;
`backPropagateCompletions()` closes the loop.
- *You read:* "Submissions waiting on feedback: n"; "Submissions whose
  evaluation failed or timed out: n"; "Flow 2 isn't answering: n
  submission checks timed out in a row since …"; "Student submissions
  that failed on the system side in the last 24 hours".
- *Stuck:* the "isn't answering" line, or a waiting count that stays up
  across several signals. A row left unanswered 12 minutes is restarted,
  at most twice.
- *Code:* `cas-ccps/scripts/03_QueueBridge.js`,
  `cas-ccps/scripts/06_StagingPipeline_Turnstile.js`,
  `cas-ccps/scripts/37_FlowInputBuilder.js`.

**Flows 3 and 4: warm-ups.** At 3:30 a.m. `buildWarmUpQueues()` queues a
warm-up for each student in classes meeting tomorrow.
`buildWarmUpFlowInputs()` writes the flow rows; Flow 3 writes each
student's warm-up question, Flow 4 scores the student's answer, and
`harvestWarmUpFlowReturns()` files both. If Flow 3 never answers, the
teacher's own question goes out instead.
- *You read (LAST NIGHT):* warm-ups not delivered or in ERROR, today's
  and tomorrow's; "Warm-ups from earlier days still waiting on scoring
  (Flow 4)"; "Studio Flow n: n job(s) with no return after …"; "Warm-ups
  that went out as the teacher's own question".
- *Code:* `cas-ccps/scripts/24_WarmUpBridge.js`,
  `cas-ccps/scripts/41_WarmUpFlowBridge.js`,
  `cas-ccps/scripts/25_WarmUpWriter.js`.

**The turn-in code and Flow 6 (the turn-in check).** Once feedback is
back, the student's card asks one question built from that feedback. An
answer that passes Apps Script's screen waits for Flow 6's verdict:
ADDRESSES issues the student's turn-in code for that assignment (the
student pastes it into Canvas); NOT_YET shows a one-line reason. A check
Flow 6 never answers, after retries, is CHECK_FAILED: no code, and it
waits for the teacher, who can grant one (`grantTurnInCode()` or the
Teacher Dashboard). Only while `TURN_IN_CODE_COURSES` is on.
- *You read:* "Turn-in answers the check couldn't decide, waiting for
  you: n" (section 1 and LAST NIGHT); LAST NIGHT's "Turn-in answers
  waiting on the check for over an hour: n" (Flow 6 is stalled).
- *Code:* `cas-ccps/scripts/71_TurnInCodes.js`,
  `cas-ccps/scripts/72_TurnInCheckFlow.js`.

**The nightly lesson rollout.** `runLessonRollout()` at about 9 p.m.
makes the next lessons' student docs; in SHADOW it only logs.
- *You read:* "Lesson rollout: SHADOW for …"; "n problems need you";
  "didn't finish: n docs left" (the next run continues; not a problem
  in itself); "finished (n runs)" in the all-clear.
- *Code:* `cas-ccps/scripts/58_LessonRollout.js`.
