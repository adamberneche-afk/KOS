# Setting up CAS: one install for one teacher

This guide sets up a new CAS install: one teacher's own Central Ledger,
dashboards and Studio Flows, from this repo's code (shape A in
`meta/PLAN_2026-11.md`, "Packaging CAS for more teachers"). It is written
from the code. Each step ends with **the check that says it worked**: a
function to run or something you can see.

**What each step refers to** (projects, manifests, every Script Property,
every trigger, every flow and its checks) is generated from the code in
[`SETUP_GUIDE_REFERENCE.md`](./SETUP_GUIDE_REFERENCE.md), so it can't go
stale. This page is the order.

**The checklist.** Once the Central Ledger's code is pushed (step 3), run
`showSetupStatus()` in its Apps Script editor at any time. Its last section,
SETUP CHECKLIST, has one line per thing these steps leave in the Ledger:
`OK` or `MISSING`, the step number in brackets, and what to run. It reads
names, counts and set/not set only, never an ID, address or URL. What it
can't see from the Ledger is listed on its "Not checked from this project"
line.

**Known gaps.** This guide was written from the code and from the
operator's install records; nobody other than the operator has set up an
install yet (that is plan step 4). Where a step depends on the operator's
own setup today, it says so under **Gap**. Every gap is collected at the
end for packaging step 3.

---

## Step 1 — Before you start

You need:

- A Google Workspace account in the school's domain that will own the
  install (it runs every nightly job and deploys both dashboards). Student
  data stays in this account's Drive.
- Node 20 or later and clasp 3.x (`npm install -g @google/clasp`), then
  `clasp login` as that account. clasp needs the Apps Script API turned on
  in that account's Apps Script settings (Settings → Google Apps Script
  API).
- A checkout of this repo, and a **registry folder outside it** for the
  install's real script IDs (`tools/clasp-sync/README.md`, "run.js"). IDs
  never go in the repo.
- Workspace Studio available to the account (step 8).

Read first: `cas-ccps/docs/FERPA_DATA_MAP.md` (what student data goes
where) and its "Disclosure to parents" section.

**Check:** `npm test` passes and `node tools/clasp-sync/sync.js` builds
every cas-ccps project into `cas-ccps/.clasp-build/` (each says "no real
scriptId yet" until step 3). `clasp show-authorized-user` names the
install's account.

---

## Step 2 — Push the Unified Manual and run its setup wizard

The Unified Manual is a Google Doc whose project (`unified-manual`) holds
the setup wizard (`16_UnifiedManualSetup.js`). Run in a new account, the
wizard is in admin mode (no `ADMIN_SS_ID` yet, `detectRole_()`): it makes
the Assignments folder tree, the Central Ledger spreadsheet with its five
Module 1 tabs (`Ledger`, `ReviewQueue`, `STAGING_PIPELINE`, `RubricQueue`,
`MatrixRegistry`), the master Rubric Response and Teacher Matrix sheets, the
teacher's forms, and writes the Manual's Script Properties; then it runs
teacher setup for the same account.

1. Create the Doc and its project: in a scratch folder outside the repo,
   `clasp create --type docs --title "CAS - Unified Manual" --rootDir .`.
   Put the **script** ID (the longer one) in the registry as
   `cas-ccps\unified-manual\.clasp.json`.
2. Push it: `node run.js --only unified-manual` (or `sync.js unified-manual`
   then `clasp push` in `cas-ccps/.clasp-build/unified-manual`).
3. Open the Doc. From **⚙️ Assignment System → 🚀 Run Admin + Teacher
   Setup** (`runSetupWizard()`), answer the prompts. Read the summary it
   writes into the Doc: it lists what it made and the manual steps left.

**Gap (library).** `unified-manual`'s manifest depends on the library
`CentralLedger`, pinned to the operator's Central Ledger project and
version (reference §2). The push fails (`Invalid ID`) for anyone else. For
this first push, remove `dependencies.libraries` from your **local** copy of
`cas-ccps/clasp/manifests/unified-manual.appsscript.json` (never commit
it); the Module 2 wizard's three calls into the Ledger fall back to "run
this from the Central Ledger" (`28_Module2Setup.js`). Step 3 puts your own
library back.

**Gap (which Ledger).** The operator's install was made the other way round
(`tools/clasp-sync/DEPLOYMENT_RUNBOOK.md` §3.2b): every project made with
`clasp create`, so the Ledger had no Module 1 tabs and a throwaway function
made them; how the wizard then ran against that Ledger isn't recorded. This
guide's order (wizard first, then bind the projects to the files it made)
follows the wizard's own design and avoids that, but has not been run end
to end.

**Check:** the wizard's completion summary in the Doc; in the Manual's
editor, `showConfigSources()` shows `CENTRAL_LEDGER_SS_ID` and
`ADMIN_SS_ID` from Script Properties. After step 3, `showSetupStatus()` in
the Ledger shows `OK [2]` for the five Module 1 tabs.

---

## Step 3 — Bind and push the other projects

Each remaining project is bound to a file (reference §1). Open the file,
**Extensions → Apps Script**, then **Project Settings → Script ID**, and put
that ID in the registry (`cas-ccps\<project>\.clasp.json`, as from
`clasp clone <scriptId>`):

| Project | File |
|---|---|
| `central-ledger` | the Ledger spreadsheet the wizard made |
| `rubric-response-sheet`, `teacher-matrix-sheet` | the wizard's two MASTER sheets (teachers' copies clone the code with them) |
| `master-student-template` | a new Doc: the wizard's summary, "Master Student Template", says how, and to set `MASTER_STUDENT_TEMPLATE_ID` in the Manual |
| `teacher-dashboard`, `student-dashboard` | none: `clasp create --type standalone` |
| `family-sentinel` (optional) | a new private sheet the teacher owns; `cas-ccps/docs/FAMILY_MAIL_SENTINEL.md` |

`studio-steps` is not pushed: custom Studio steps need a Cloud project,
which the operator's district blocks (`cas-ccps/studio-steps/README.md`);
the flows were rebuilt without them. `21_AutoInstaller.js` is not this
path either: it needs the Apps Script API through a Cloud project, and its
file lists predate most of the code.

Then push everything: `node run.js` from the folder holding your copy of
`run.js` (`--only <names>` to limit it). `run.js` skips a web app until
step 5 gives it a `deployments.txt` (it says so); push the two dashboards
once by hand for now: `node tools/clasp-sync/sync.js teacher-dashboard`,
then `clasp push` in `cas-ccps/.clasp-build/teacher-dashboard`, and the same
for `student-dashboard`.

Then publish the library and put it back:

1. In the `central-ledger` editor, **Deploy → New deployment → Library**.
2. In your local `unified-manual.appsscript.json`, restore
   `dependencies.libraries[0]` with that project's script ID and the
   version just published (`cas-ccps/README.md`, Known gap 15).
3. `node run.js --only unified-manual`.

**Gap (library, again).** The tracked manifest names the operator's
library, so every push from a fresh checkout needs the local edit. Step 3
of the packaging plan (a registry per install) is where the library ID
should move.

**Check:** `node run.js` ends with no FAILED project. In the Ledger's
editor, `showSetupStatus()` runs at all (the push landed) and
`reportDeployVersion()` in each project logs the commit `run.js` printed.

---

## Step 4 — Script Properties and the `_CONFIG` tab

Settings resolve in each project in this order: its own Script Property,
then (for the Ledger ID) the sheet it is bound to, then the Central
Ledger's `_CONFIG` tab for the keys a row may supply (reference §3.0).

1. In the Unified Manual's editor run `seedLedgerConfigTab()`. It makes the
   Ledger's `_CONFIG` tab, marks it `SYSTEM_ROLE = CENTRAL_LEDGER`, and
   copies in the district-wide values the wizard wrote. It never overwrites
   a row.
2. On `_CONFIG`, add what the wizard doesn't write: `ADMIN_NOTIFY_EMAIL`
   (the overnight email), `MARKING_PERIOD_ENDS` (`2627_MP1=2026-10-30,...`),
   and, for a school other than the operator's, the school profile:
   `SCHOOL_COURSES`, `STUDENT_EMAIL_DOMAIN`, `STUDENT_ID_PATTERN`,
   `STUDENT_MAIL_DOMAIN`, `STAFF_MAIL_DOMAIN`, `EARLY_RELEASE_DAYS`,
   `SCHOOL_DAYS_OFF`, `BELL_SCHEDULE` (their defaults are one school's;
   reference §3.0 lists them).
3. Central Ledger Script Properties: `TEACHER_EMAIL` (exactly the address
   the ClassSchedule will carry) and `TEACHER_NAME`. The wizard writes these
   only in the Unified Manual; the nightly warm-ups match no period without
   them. `CURRENT_TERM` from **⚙️ Admin Controls → 📅 Set Current Term**.
4. The two dashboards are bound to nothing, so each needs
   `CENTRAL_LEDGER_SS_ID` and `ADMIN_SS_ID` (both the Ledger's ID) as Script
   Properties. Both need `TEACHER_EMAIL` as a Script Property too: it is the
   Teacher Dashboard's access gate, and the Student Dashboard's demo page
   (`?demo=1`) opens only for it. Neither reads it from `_CONFIG`, on
   purpose.
5. The master student template's copies run as the student and can't open
   the Ledger, so it keeps its own: `STUDENT_DASHBOARD_URL` (after step 5),
   `STUDENT_EMAIL_DOMAIN`, and `AI_FLOWS_LIVE` = `true` once Flow 2 answers
   (step 8). The Student Dashboard reads `AI_FLOWS_LIVE` too: set it there
   as well. Until it is `true`, neither promises students feedback within
   minutes (`00_SharedConfig.js`, `aiFlowsLive`).
6. Leave unset: `GEMINI_API_KEY` and `FERPA_FLOW3_FULL_NAME_OVERRIDE`
   (`10_AdminRecoveryPanel.js`'s health check alerts on them), and
   `DIRECT_GEMINI_API_KEY` (parked).

Edits to `_CONFIG` reach every project within 10 minutes;
`refreshSharedConfig()` in a project makes it immediate there.

**Check:** `showConfigSources()` in each project says where every value
came from. `showSetupStatus()`: the `[4]` lines are OK.

---

## Step 5 — Deploy the two web apps

`run.js` promotes web apps but never creates a deployment, so the first one
is by hand, once per dashboard:

1. In the editor, **Deploy → New deployment → Web app**, with the
   manifest's settings: execute as **me** (the deploying account), access
   **anyone in the domain** (reference §2). Students need no access to the
   Ledger: the Student Dashboard runs as you and shows a student only their
   own rows.
2. Put the deployment ID in the registry's `deployments.txt` for that
   project. From now on `node run.js` moves it to each new version and the
   `/exec` URL never changes.
3. Set `TEACHER_DASHBOARD_URL` (Central Ledger and Unified Manual Script
   Properties) and `STUDENT_DASHBOARD_URL` (`_CONFIG`, and the master
   student template) to the `/exec` URLs.
4. Optional: the leader-hub connection, `LEADER_HUB_OAUTH_CLIENT_ID`
   (`cas-ccps/docs/LEADERHUB_CONNECTION_SETUP.md`;
   `runLeaderHubConnectionCheck()` in the Teacher Dashboard).

**Gap (Canvas cartridges).** The Canvas course packages are built with the
operator's Student Dashboard URL from `cas-ccps/data/deployment-urls.json`.
Another install rebuilds them with its own URL
(`tools/cas-ccps/build-canvas-cartridge.js`), and that file holds one URL.

**Check:** open the Teacher Dashboard's `/exec` URL signed in as the
teacher: it loads (any other account is refused). `node run.js --verify`
says each web app's live deployment is on the last push.
`showSetupStatus()`: the `[5]` lines are OK.

---

## Step 6 — Module 2 and the course data

1. Upload to the teacher's Drive the three files the importers find by
   name: `CompetencyRegistry.csv` and `CompetencyRubrics.json`
   (`cas-ccps/data/`), `PacingGuide_CAS_Context.json`
   (`cas-ccps/curriculum/`).
2. In the Unified Manual's editor: `runModule2Setup()` (Phase A: lesson
   context, competency registry, alignment log), then `runModule2WarmUps()`
   (Phase B: profiles, warm-up tabs, the block schedule into
   `ClassSchedule`). Read each completion alert: it lists the steps left.
   Since 2026-10-20 the wizard installs no trigger; step 7 does.
3. In the Central Ledger: `importCourseData()`, which runs the three
   importers and `checkCourseData()`, and makes the `NoSchoolDays` tab.
4. Set `M2_ENABLED` = `true` in the **Central Ledger's** Script Properties
   (the wizard sets it only in the Unified Manual; seven Ledger files read
   it directly).
5. Redeploy the Teacher Dashboard (`node run.js --only teacher-dashboard`).

**Gap (courses).** The course data, lessons and Canvas cartridges in this
repo are the operator's two courses. A teacher of other courses needs their
own registry, pacing guide, rubrics and lessons; nothing generates those
yet. `NoSchoolDays` is seeded from the operator's district calendar
(`51_CourseYearBuilder.js`); edit it for another calendar.

**Check:** `checkCourseData()` reports the competency, rubric and unit
counts and readable dates. `showSetupStatus()`: the `[6]` lines are OK.

---

## Step 7 — Install the triggers, then the preflight

All in the Central Ledger's editor (reference §4 lists every trigger and
the function that installs it):

1. `installIntakeTriggers()`: the three intake jobs (`bridgeQueue`,
   `runStagingTurnstile`, `backPropagateCompletions`). If students will use
   the intake form, also `installFormSubmitTrigger()` (`dispatchFormSubmit`
   on form submit). Both are safe to run again.
2. `installFlowInputTriggers()`, `installWarmUpFlowTriggers()`,
   `installQueueWatchdogTrigger()`, `installRegistrationTrigger()`.
3. `previewLedgerCycle()`, then `installLedgerCycle()`: one
   `runLedgerCycle` trigger every minute takes over the jobs above (only
   those that have a trigger when it runs, so do 1 and 2 first).
4. The nightly and weekly jobs: `installWarmUpTriggers()`,
   `installArtifactSyncTrigger()`, `installLessonPlanTrigger()`,
   `setupStudentContextDocs()`, `setupCompetencySuggestions()`,
   `installDeployVersionReportTrigger()`, `setupAutoHealthTrigger()`. Step 9
   adds `installLessonRolloutTrigger()`.
5. In each other project, `installDeployVersionReportTrigger()`; in the
   family sentinel, `installFamilySentinelTrigger()`.
6. `checkLedgerSchema()`, then `runFlowPreflightCheck()`.

The queue watchdog starts in dry run (`CAS_WATCHDOG_DRY_RUN`, reference
§3.1); set it to `false` when you want it to release stuck rows.

**Check:** `showSetupStatus()`: TRIGGERS ends "Every expected trigger is
installed", and the `[7]` lines are OK, including "Preflight passed" (the
`Preflight` tab has no FAIL line).

---

## Step 8 — Build the Studio Flows

Each Flow is built by hand in Workspace Studio: a Sheets trigger on its
input tab, one Gemini call, a native step writing back
(`meta/FLOW_DOCTRINE.md`). Reference §5 lists every flow with its fixture,
canary, binding and liveness checks.

1. `syncFlowPromptsToSheet()` (the `FlowPrompts` tab: each Flow reads its
   prompt from there) and `syncFlowBuildSpec()` (the `FlowBuildSpec` tab:
   every tab, column, header and trigger condition, from the code).
2. `installFlowFixtures()`: a fixture row at each flow's trigger condition,
   so a Flow has something to match.
3. `runFlow2Canary()` and `runWarmUpFlowCanary()`: the Apps Script half
   works with Studio stubbed.
4. Build Flow 2, then Flows 3 and 4 (Flow 5 is merged into Flow 3), from
   the `FlowBuildSpec` tab. The judgement half (connector names,
   temperature, token limits) is in the Module 2 wizard's dialogs and
   `15_StudioFlowPrompts.js`. Keep `checkFlow2Binding()` /
   `checkFlowBinding()` open while wiring each Flow's last step.
5. Flow 6 (the turn-in check) only if turn-in codes will be on:
   `cas-ccps/docs/TURN_IN_CHECK_FLOW.md`, `installTurnInCheckFlow()`.
   Flow 1 (rubric extraction) is optional: assignments now come from the
   repo (`seedAssignments()`), not from rubric uploads.
6. `checkFlow2Liveness()` and `checkWarmUpFlowLiveness()`: a green "Run
   Completed" in Studio proves nothing; these say whether a Flow has ever
   written back. Then `removeFlowFixtures()`, and set `AI_FLOWS_LIVE` =
   `true` (step 4.5).

**Check:** `showSetupStatus()`: the `[8]` lines are OK (Flow 2 has
answered; Flows 3 and 4 have returns; Flow 6's if turn-in codes are on).

---

## Step 9 — Lessons, rosters and the student-doc rollout

The courses run on the teacher's lessons and the `LessonSchedule` dates
(`cas-ccps/README.md`, "The teacher's lessons and the LessonSchedule tab").

1. `seedLessonSchedule()`, then type each lesson's `start_date`
   (`YYYY-MM-DD`) in `LessonSchedule`.
2. Upload each Canvas course's gradebook export to Drive;
   `prepareRosterSections()`, then put each section's period in
   `CanvasSectionMap`.
3. `installLessonRolloutTrigger()` (about 9 p.m.). It starts in shadow:
   `previewLessonRollout()` and read the `RolloutLog` tab, then set
   `ROLLOUT_AUTO_APPLY` to one course, then `all`. Docs are made two days
   ahead and shared the night before.
4. Or by hand, per lesson: `previewAssignmentSeed()` / `seedAssignments()`,
   then set `ROSTER_CONFIG_ID` to the lesson's Config ID and run
   `previewRosterEnrollment()` / `applyRosterEnrollment()`
   (`cas-ccps/DEPLOYMENT_HANDOFF.md`, Phase 6, step 17b).
5. Import the Canvas cartridges once students have docs (step 18 there;
   see the gap in step 5).

**Check:** the `RolloutLog` tab's would-seed and would-enroll counts, with
no PROBLEM rows. `showSetupStatus()`: the `[9]` lines are OK.

---

## Step 10 — The first test student

Use a test student account in the student domain (from district IT), never
a real student, and never Canvas's own "Test Student" (the roster import
skips it).

1. Put the account in a Canvas section's export (or submit the intake form
   as it), and enroll it as in step 9.
2. Signed in as the test student: open the Student Dashboard, open the
   assignment's doc, write an answer, **Submit for feedback**.
3. Within a few minutes the doc's header line changes from "submitted …,
   waiting for feedback" to the result, and the feedback appears (in the
   doc, or as a comment when `FEEDBACK_AS_COMMENT` is on).

**Gap (test account).** The operator is still waiting on a test student
account from district IT; a sandbox install (plan step 4) needs one too.

**Check:** the doc shows the feedback; `checkFlow2Liveness()` counts an
answered row; `showSetupStatus()`: the `[10]` lines are OK.

---

## After setup

- Every morning the CAS signal (`KOS_CAS_SIGNAL`) and its 5 a.m. email
  report last night's jobs and the setup checks (`34c_OvernightHealth.js`).
- Each push: `node run.js --latest`, then the checks the handoff lists.
- `showSetupStatus()` stays the one list of what is on.

## The gaps, for packaging step 3

1. **The library pin.** `unified-manual` depends on `CentralLedger` pinned
   to the operator's project; every other install edits a local manifest
   (steps 2 and 3).
2. **The order of the first install.** Wizard first (this guide) versus
   `clasp create` everything first (the runbook, what the operator did):
   only the second has been run, and its Ledger-tab workaround was a
   throwaway function.
3. ~~**Three intake jobs without an installer**~~ **Closed 2026-11-08:**
   `installIntakeTriggers()` and `installFormSubmitTrigger()` (step 7).
4. **The Canvas cartridges** carry the operator's Student Dashboard URL
   (`cas-ccps/data/deployment-urls.json`, step 5).
5. **The courses** (registry, pacing guide, rubrics, lessons, cartridges)
   and the no-school calendar are the operator's (step 6).
6. **A test student account** (step 10).
7. **`21_AutoInstaller.js`** describes an install path that needs a Cloud
   project and lists files from before most of the code (step 3).
