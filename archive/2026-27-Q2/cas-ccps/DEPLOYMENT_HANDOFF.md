# `cas-ccps/DEPLOYMENT_HANDOFF.md`: passages moved out on 2026-11-17 (archived)

History moved word for word out of the live `cas-ccps/DEPLOYMENT_HANDOFF.md` on
2026-11-17: the status banner's record of earlier pushes (2026-10-12 to
2026-10-23) and a closed doc-gap note, grouped under the handoff heading each
came from, in their original order. Paths inside read from `cas-ccps/` or the
repo root, as they did in the handoff. The live handoff:
[`cas-ccps/DEPLOYMENT_HANDOFF.md`](../../../cas-ccps/DEPLOYMENT_HANDOFF.md).

## ✅ STATUS banner: earlier pushes (2026-10-12 to 2026-10-23)

_From the handoff's status banner ("✅ STATUS: cas-ccps is live, with real rosters and the teacher's own lessons"): its bullets, the history of earlier pushes. The standing rule on manifest scope changes stayed in the handoff._

- **Pushed 2026-10-12: #167 and #169.** Terms are marking periods
  (`CURRENT_TERM` = `2627_MP1`), and the CAS attention signal
  (`34b`, the counts-only `KOS_CAS_SIGNAL` doc) is live: the operator ran
  `runQueueWatchdog` once to create it, and installed the watchdog's
  10-minute trigger by hand (it had never been installed;
  `installQueueWatchdogTrigger()` does it now, Phase 2 step 6a). The
  Health tab no longer reads DRY RUN.
- **cas-ccps: everything else merged is pushed (2026-10-12).** The operator
  pushed `main` to every project with `run.ps1` on 2026-10-12, so #115–#117,
  #120–#126, #135–#157 and #160–#162 are live. run.ps1's promote step
  versions and updates both web apps' existing deployments; if it was
  skipped, do that by hand. Phase 6 (below) ran through
  step 17a earlier: LIVE assignments `CAS-8175-L06` and
  `CAS-8177-EMPLOYEE-HANDBOOK-OPERATIONS`, every rostered student enrolled
  (71 in 8175, 21 in 8177). The curricula are complete: every state task is
  covered in both courses, and every lesson doc in Drive matches the repo.
- **Done after the push (2026-10-12):** `syncFlowPromptsToSheet()`;
  `seedLessonSchedule()` and the first new start dates (2026-10-14, as
  `YYYY-MM-DD`); `AI_FLOWS_LIVE` = `true` in the **Student Dashboard**
  project. Step 18: both Canvas cartridges imported (`8175.imscc`, 36
  modules; `8177.imscc`, 31) and the next lessons scheduled.
- **2026-10-15/16: the first real student submissions.** Submit failed until the
  deploying account approved the `documents` scope (rule below); feedback then
  landed at the bottom of the doc, and Flow 2 needed a manual start. #175 fixes
  the first two in code; see `archive/2026-27-Q1/meta/CAS_BUG_HANDOFF_2026-10-16.md`.
- **2026-10-17:** #173–#175 pushed with `run.js`, which replaces run.ps1.
  Merged, not yet pushed: #179 (late results finish their rows), #180
  (feedback as comments, off by default; "Feedback as comments" below) and
  #181 (the nightly lesson rollout, shadow first; "Nightly lesson rollout"
  below).
- **2026-10-18/19: everything merged through #206 is pushed**, #179–#181
  included (the lesson rollout is in shadow). Steps 17c–17e ran live on
  2026-10-19: period 3 split into `3-Odd`/`3-Even`, period 1 `DAILY_HALF`,
  and the Ledger cycle installed (`installLedgerCycle()` took over 9
  triggers; `registerDeliveredWarmUps` had never had a Ledger trigger).
- **2026-10-20: pushed** #209 (term rollover), #213–#218 (assignment
  criteria and competency tiers; `refreshAssignments()` run), #214 (bug 4:
  READY written as an edit), #220 and #222 (Flow 4 scoring and its own
  plausibility check), #223 (the artifact sync's assignment hop).
- **2026-10-21: pushed** #228 (`PeriodOverride`, step 17f, seeded), #229
  (the wizard's triggers belong in the Ledger, step 17g), #230 (assignment
  evidence gaps; `refreshAssignments()` run; the Drive lesson docs match;
  the cartridges not yet re-imported), #231 and #235 (the family signal's
  two tiers; a dropped Flow run written again), #233 (the timeout email's
  steps), #234 (the artifact sync finds the matrix through
  `MatrixRegistry`).
- **Merged 2026-10-21, not yet pushed (Central Ledger):** #237 (Studio's
  text timestamps read: the overnight email's 24 hours, the return tab's
  prune), #238 (Flow 3's own plausibility check, the echoed prompt named,
  a question required, the prompt's constraint 10), #241 (the retention
  dry run, `previewRetentionDisposition()`). Flow 3's Ask Gemini step no
  longer lists the Central Ledger as a source (removed by hand,
  2026-10-21). Both Canvas cartridges re-imported 2026-10-21.
- **Merged 2026-10-21, not yet pushed (Teacher Dashboard):** #243 (📅
  Lessons: the schedule panel; the Feedback and Parent Reports panels now
  open), #245 and #246 (lesson editing and writing: the `LessonDrafts`
  tab, made on the first save; 55b is now also in this project). After the
  push, `run.js` promotes the web app (a hand-made version only if it warns a deployment isn't in `deployments.txt`). The import runs
  by hand or on the "Lesson draft import" Routine
  (`docs/LESSON_IMPORT_PROCEDURE.md`), which needs its connectors added in
  claude.ai.
- **Merged 2026-10-22, not yet pushed:** #248 (00, 02, 07, 13: the 💬
  Feedback panel finds its courses from the Ledger rows' names and shows
  the live setting; a one-course `FEEDBACK_AS_COMMENT` value now reaches
  that course's students; the readiness numbers filter the roster) and
  #249 (07, 23: submitted times on roster rows, the warm-up count without
  blank answers, the "Assignments" card, Student Context's back link).
  #251 and #252 (02, 13) ride the same push.
- **Merged 2026-10-22/23, not yet pushed:** #253 and #254 (plain words and
  WCAG contrast on both dashboards, ❓ Terms panels; the doc menu is
  **📊 Feedback → Submit for Feedback**; feedback comment, doc header,
  emails and setup alerts in plain words; both Canvas cartridges rebuilt,
  so re-import them), #259 (the UX audit's fix-first items: the card
  updates after Submit, the doc ends on a visible line with six writing
  lines, a failed check marks `ERROR_EVALUATION` and tells the teacher,
  Ledger cycle failures counted and shown, `ROLLOUT_AUTO_APPLY` read from
  `_CONFIG`, Clear Staging Pipeline puts unfinished work back in line, the
  admin walkthrough retired, student identifiers out of the logs, 📅
  Lessons and lesson-editor fixes, nothing stored in the browser) and
  #265 (the overnight check runs the setup checks; `EvaluationLog`;
  WarmUpQueue `delivered_at` / `answered_at`) and #267 (cas-ccps comment
  and doc fixes from the documentation scan).
- **2026-10-23: the Central Ledger was pushed** and runs at least #265
  (the overnight setup checks show in `KOS_CAS_SIGNAL`); which commit, and
  whether the other cas-ccps projects went with it, is for `run.js`'s
  output to confirm.
- **The next push** carries #268 (parent reports written by KOS and sent
  by the teacher, D1; bug 4's overnight line; rule 12's `typeof` guards
  removed; the Teacher Dashboard's manifest drops `script.send_mail`) and
  #271 (the watchdog knows `NOT_MEETING`), and #237 to #267 to any
  project the 10-23 push missed: `node run.js --latest --only
  central-ledger,teacher-dashboard,student-dashboard,master-student-template`
  (plus the other systems' projects), which promotes both web apps. The
  checks after it, and the rest of the operator's queue, are in
  `archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md`.
- **Bug 4 resolved (2026-10-23):** Flow 2 starts by itself on a submission.
- **Retired 2026-10-12:** both Turn-In Form files are in Drive's trash.
  The Ledger's `dispatchFormSubmit` trigger stays; it serves the intake
  form.
- **Live 2026-10-12: the Family Mail Sentinel**
  (`cas-ccps:family-sentinel`, scripts 60-62). A ninth project, on a
  private sheet: it labels student and parent mail, has a Gemini flow
  triage it with names redacted, and writes the name-free
  `KOS_FAMILY_SIGNAL` doc the KOS Claude Project reads; a safety message
  pushes to the teacher's phone (ntfy). Pushed with `run.ps1`
  (`clasp-registry\cas-ccps\family-sentinel`), the Flow built, the
  trigger installed, and the safety alert tested end to end by the
  teacher. Setup and checks: `docs/FAMILY_MAIL_SENTINEL.md`.
- Done since: real students' submissions evaluated by Flow 2 (first on
  2026-10-15/16) and nightly warm-ups answered and scored (since
  2026-10-19).

## One small, low-priority doc gap noticed along the way — CLOSED

`cas-ccps/docs/FERPA_DATA_MAP.md`'s Health Checks section said
`_ferpaHealthChecks_()` "now checks **seven** things" where the live code
(`10_AdminRecoveryPanel.js`) has **eight**. Fixed in `37aa157` at the start of
the deployment session, along with the "four retention checks" count in the
same file (also five). Nothing to do here.
