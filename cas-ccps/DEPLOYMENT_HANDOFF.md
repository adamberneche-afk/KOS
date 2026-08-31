# cas-ccps Deployment Handoff

**For:** the session that takes this codebase from "code complete, verified in the
Node sandbox" to "live in a real Google Workspace account."

**Written:** 2026-08-31, at the end of a session that closed the
`27_LessonFrameGenerator` gap, verified and fixed 6 real bugs from a third-party
code review, and fixed a real column-collision bug that work introduced. None of
that work touched deployment — this repo has never been pushed to a real Apps
Script project. That is the entire scope of what's ahead.

## Current repo state

- `main` and `claude/new-session-sph6vw` are in sync at `d2a047e`.
- `npm test`: 422/422 passing. `node tools/gas-lint/check.js`: 0 errors, 4 known
  baseline warnings. `node tools/doc-currency/check.js`: 0 errors, 9 known
  baseline warnings. `node tools/clasp-sync/sync.js`: builds all 8 projects
  cleanly into `cas-ccps/.clasp-build/`.
- **No real Google Apps Script project exists yet for any of the 8 cas-ccps
  projects.** Confirmed: `cas-ccps/clasp/local/` doesn't exist, and every
  `cas-ccps/clasp/templates/*.clasp.json.template` still has
  `"scriptId": "REPLACE_WITH_REAL_SCRIPT_ID"`. Everything below starts from zero.

Don't re-derive the last session's bug-fix history — it's all in
`cas-ccps/HISTORY.md` (most recent two sections) if you need it, but it's not
relevant to deployment mechanics.

## The one document that actually walks through this

**`tools/clasp-sync/DEPLOYMENT_RUNBOOK.md` is the real, step-by-step guide.**
`tools/clasp-sync/README.md` hands off to it explicitly. Read it in full before
doing anything — don't rely on this handoff's summary below for exact commands.
Key parts, since nothing has ever been deployed here:

- **Part 3.2b — building from scratch straight to production** (not 3.2's pilot-
  sandbox path, since there's no existing production project to sandbox-copy
  from): `clasp create --type sheets|docs|standalone --title "CAS - <Project
  Name>" --rootDir .` in a scratch folder outside this repo, per project. This
  creates both the real Drive file and its bound script, and prints two
  different IDs (document ID ~44-45 chars, script ID ~57-58 chars — don't mix
  them up in the `.clasp.json` files).
- **Three documented from-scratch gotchas, all still open, none yet hit:**
  1. `unified-manual` fails to push (`Invalid ID`) until `central-ledger` exists
     and has a cut version — its manifest ships a placeholder library dependency.
  2. A from-scratch `central-ledger` spreadsheet has none of the 5 Module-1 tabs
     (`Ledger`, `ReviewQueue`, `STAGING_PIPELINE`, `RubricQueue`,
     `MatrixRegistry`) the admin wizard normally creates. Paste
     `createAdminAssets_()`'s tab-creation block
     (`16_UnifiedManualSetup.js:~331-373`) into a throwaway function and run it
     once.
  3. `teacher-dashboard`/`student-dashboard` both need `ADMIN_SS_ID` set (not
     just `CENTRAL_LEDGER_SS_ID`), and `student-dashboard`'s manifest must have
     `executeAs: "USER_ACCESSING"` (already correct in the tracked manifest —
     just don't overwrite it).
- **Part 3.6 — production promotion**: the 5 trigger/menu-driven projects go
  live on `clasp push` alone. The 2 web apps (`teacher-dashboard`,
  `student-dashboard`) need an explicit `clasp version` + `clasp deploy
  --deploymentId <id> --versionNumber <n>` after every push, or the live `/exec`
  URL never updates.
- **Part 3.7 — studio-steps**: after `clasp push`/`clasp deploy`, there's one
  manual, no-clasp-equivalent step in the Apps Script editor: Deploy → Test
  deployments → Install. Skipping this is why "pushed" and "usable in Studio's
  step picker" are different states.
- **SMP-004 / air-gap framing**: only a human at their own already-authenticated
  keyboard runs `clasp push`/`clasp deploy` against a real ccpsnet.net
  production project. If you're doing this from an agent session without that
  human's own Google auth in front of you, you cannot complete the real push —
  you can prepare everything up to that point (builds, manifests, `.clasp.json`
  files with real IDs once the human creates the projects) and hand off the
  actual `clasp push`/`clasp deploy` invocations.

## Order of operations

1. **Module 1 must exist and be live first** — it's the prerequisite for
   everything else (`CENTRAL_LEDGER_SS_ID` has to resolve to something real
   before Module 2's wizard will even run). If Module 1 isn't live yet either,
   this is a from-scratch deployment of the whole system, not just Module 2.
2. **Get all 8 projects connected via clasp** per the runbook above. Expect the
   3 gotchas.
3. **Upload the 3 data files to the teacher's Drive folder before running the
   wizard** — the wizard only *searches* for these, it doesn't fetch or
   generate them:
   - `CompetencyRegistry.csv` (also in `cas-ccps/data/`)
   - `PacingGuide_CAS_Context.json` (also in `cas-ccps/curriculum/`)
   - `CompetencyRubrics.json` (also in `cas-ccps/data/`)
4. **Wire the CentralLedger Apps Script Library dependency** — `cas-ccps/README.md`'s
   Known Gap #15 has the exact 4 steps. Several cross-project calls (competency
   registry import, pacing guide import, rubric import) silently fall back to
   "run this manually from Central Ledger instead" instructions if this isn't
   wired — not a hard blocker, but degrades the wizard experience.
5. **Run Module 2's setup wizard**, `28_Module2Setup.js` — two entry points, not
   one:
   - `runModule2Setup()` — Phase A (Lightweight): creates 4 tabs, imports the
     competency registry, installs the 5-minute alignment-log backfill trigger,
     sets `M2_ENABLED=true`.
   - `runModule2WarmUps()` — Phase B (Full/Warm-Ups): creates 6 more tabs,
     imports pacing guide + rubrics, collects the block schedule, **installs 5
     nightly/periodic triggers** (this is where last session's fix matters —
     see below), and walks through Studio Flow 3/4/5 configuration via `ui.alert()`
     dialogs with the exact settings to enter by hand.
   Both phases end with an inline (not doc-deferred) list of remaining manual
   steps — read the completion alerts, don't skip past them.
6. **Redeploy Script 07 (Teacher Dashboard) as a new web-app version** after
   Phase A — the wizard tells you this in its completion alert; it can't do it
   itself.
7. **Build Studio Flows 2-5 by hand in Google Workspace Studio's UI.** This is
   the single biggest real gap between "code is done" and "system is live" —
   see the next section. Nothing in this repo can automate this step; the
   wizard only shows you the settings to enter.

## The real gap: Studio Flows 2-5 are code-complete, not deployed

Only **Flow 1** (Rubric Extraction) is actually live in any real Studio
deployment anywhere. Flows 2 (Student Evaluation), 3 (Warm-Up Generation), 4
(Warm-Up Evaluation), and 5 (Bridging) all have their custom-step code written
and tested in `cas-ccps/studio-steps/*.gs` — but that project has never been
pushed to a real account, and none of the four flows has actually been wired
together in Studio's builder. This blocks both **Module 2 Full (Warm-Ups)**
and **Module 5 (SCR Suggestion)** from being genuinely live, independent of
code readiness. `cas-ccps/docs/IMPACT_DASHBOARD.html` renders this exact state
as status badges (`Flow 1 ✅ Live`, `Flows 2-5 ⬜ Built, Not Deployed`) if you
want a visual gut-check after deployment — update those badges once each flow
is actually wired.

`cas-ccps/studio-steps/README.md` has the per-step deployment instructions
(mirrors Part 3.7 of the runbook). The wizard's Phase B dialogs
(`28_Module2Setup.js`) give you the exact Studio Flow settings (trigger
condition, temperature, token limits, input/output field names) to enter once
you're in Studio's builder — don't guess these from the `.gs` files alone.

## Script Properties reference

**Hard-required** (fresh deployment throws without these — `00_SharedConfig.js`):
`ADMIN_SS_ID`, `CENTRAL_LEDGER_SS_ID` — the second is also required by
`teacher-dashboard`/`student-dashboard` directly, not just central-ledger.

**Written automatically, don't set by hand:**
- Script 16 (teacher setup wizard) writes `TEACHER_*`, `*_RESPONSE_SS_ID`,
  `*_FORM_URL`, `CONFIRM_ENTRY_*`, `MASTER_*` — all default to `""` (degraded,
  not broken) if somehow missed.
- `28_Module2Setup.js` writes `M2_ENABLED`, `M2_COURSES`,
  `M2_SETUP_PHASE_A_COMPLETE`, `M2_REGISTRY_IMPORTED`,
  `M2_PACING_GUIDE_IMPORTED`, `M2_RUBRICS_IMPORTED`, `M2_SETUP_COMPLETE`,
  `M2_SETUP_PHASE_B`.

**Set manually before running the wizards:**
- `CURRENT_TERM` — no code default; falls back to `""`/`"All Terms"`/`"ALL"`
  per call site if unset (degraded, not fatal, but set it).
- `ADMIN_ROOT_FOLDER_ID`, `ADMIN_NOTIFY_EMAIL` — admin-tier, no wizard sets these.

**Optional, all default-safe, worth setting eventually:** the 5 retention
properties (`SCR_RETENTION_YEARS`, `LEDGER_RETENTION_YEARS`,
`COMPETENCY_EVIDENCE_RETENTION_YEARS`, `PARENT_REPORT_RETENTION_YEARS`,
`WARMUP_QUEUE_RETENTION_YEARS` — the last one is new this session), all
default to 5 years, all documented as **unconfirmed against any real district
retention schedule** (`cas-ccps/docs/FERPA_DATA_MAP.md`). Treat these as
placeholders, not a policy decision already made — flag for the district's
records staff, don't silently accept the default as correct.

**Must never be set:** `GEMINI_API_KEY`. `25_WarmUpWriter.js`'s `callFlow4_()`
has a dead direct-Gemini-API code path (a documented, deliberately-retained
placeholder) that would go live — bypassing the "Walled Garden" Studio-Flow-only
boundary entirely — the moment this property exists.
`10_AdminRecoveryPanel.js`'s daily health check alerts loudly if it's ever set;
don't set it during deployment troubleshooting even temporarily. Same caution
for `FERPA_FLOW3_FULL_NAME_OVERRIDE` — must stay unset/false.

## Before going live, read

- `cas-ccps/docs/FERPA_DATA_MAP.md` in full — the compliance reference paired
  with `cas-ccps/docs/SYSTEM_ARCHITECTURE.html`'s Security Model section. Do
  **not** treat `cas-ccps/docs/archived/KOS_Guide_IT__Admin_Security_PRE_V8_ARCHITECTURE.pdf`
  as current — it describes an abandoned pre-v8 architecture; `README.md`
  explains why it's archived.
- The "Disclosure to parents" section of `FERPA_DATA_MAP.md` specifically —
  the weekly parent report (`36_WeeklyParentReport.js`) is the **only** surface
  in this system that sends student data outside the school's Workspace
  domain. Confirm this is genuinely wanted before enabling it, separately from
  the rest of Module 2.
- `cas-ccps/README.md`'s "Known gaps" section — several are deployment-relevant
  beyond the Studio Flow one above (e.g. Gap #6: `30b_SCRRetryRemediation.js`'s
  thresholds are provisional/unvalidated; Gap #11: nothing has actually run
  `importCompetencyRegistry()` against the in-repo CSV in a live deployment
  yet — that's what step 5 above does).

## Verification, before and after

Before touching any real Google account, confirm the local build is still
clean (nothing should have drifted since this handoff was written):

```bash
cd /home/user/KOS
npm test                          # expect 422/422
node tools/gas-lint/check.js      # expect 0 errors, 4 warnings
node tools/doc-currency/check.js  # expect 0 errors, 9 warnings
node tools/clasp-sync/sync.js     # expect all 8 projects to build cleanly
```

After each project goes live, the runbook's own verification steps (spot-check
a menu item, run a smoke test) matter more than anything in this repo — a
clean local build says nothing about whether a real Apps Script project
actually authorized correctly, has the right OAuth scopes accepted, or has its
triggers actually firing on Google's clock, not just installed.

## One small, low-priority doc gap noticed along the way

`cas-ccps/docs/FERPA_DATA_MAP.md`'s Health Checks section says
`_ferpaHealthChecks_()` "now checks **seven** things" — the live code
(`10_AdminRecoveryPanel.js`) has **eight** checks, (a) through (h), since last
session added the WarmUpQueue retention check. Not deployment-blocking; fix
opportunistically if you're already in that file.
