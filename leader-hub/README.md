# LeaderHub

A third, genuinely separate system from `kos-personal/` and `cas-ccps/` —
filed here during Round 3 reconciliation after being confirmed distinct
from both. See the repo root `README.md` for how all three relate.

## What it is

Adam Berneche's personal, single-file HTML command center for his own
multi-role teaching workload: classroom instructor (courses 8175, 8177,
and 6115), DECA advisor, school-store/WBL manager, E-Sports coach, and
field-trip coordinator. Despite the name and its coverage of courses
8175/8177, this is **not** a cas-ccps companion tool — it's teacher-facing
only, covers a materially wider scope than cas-ccps's two-course pair
(DECA, E-Sports, trips, a third course), and has no code-level integration
with cas-ccps beyond referencing the same course numbers. It began as a
100% client-side single file — local HTML, all state in `localStorage`, no
server, no build step — and **none of that is true any more** (since
2026-10-22 nothing is stored in the browser at all, and the file no longer
runs opened from disk): the app is
now generated from 14 fragments in `src/` by `tools/leaderhub-build/build.js`
and runs only as an Apps Script Web App (`Code.gs`, `Data.gs`, `SCR.gs`,
`Config.gs`). See "Where the data lives" below, and "JJ1 — Server-deployed
web app" for how it got there. The app's original design called for AI features
calling Gemini directly from the browser with a user-supplied API key —
that key was never obtainable, so every "AI"-branded feature shipped as
deterministic local logic instead (see "AI drafting" below for the one
feature that now has a real backend, added later via the same
GAS+Workspace-Flow bifurcation kos-personal/cas-ccps use, requiring no API
key at all).

## Layout

| Path | Contents |
|---|---|
| `student-leader-hub.html` | The live app (single file, over 20,000 lines and still growing — run `wc -l student-leader-hub.html` for the exact current count rather than trusting a number here, since a prior version of this table went stale mid-project). `clasp` pushes it and `Code.gs`'s `doGet()` serves it; opened from disk it only shows "LeaderHub now runs as a web app" (see "Where the data lives"). **Generated** (external product review, Finding 4 / "this quarter" maintainability fix) from `src/*.html` via `tools/leaderhub-build/build.js` — stays committed at this path so a push needs no build step, but **never hand-edit it directly**; edit the relevant fragment under `src/` and rebuild. See `tools/leaderhub-build/README.md`. |
| `src/` | The 14 fragments `student-leader-hub.html` is generated from, in file order — `00-shell-head.html` through `13-markup-modals-tail.html`. This is where you actually make edits. |
| `EmailBridge.gs` | Apps Script bridge — sub-plan Docs, brag emails (sent via `MailApp`), horizon-item polling (through `google.script.run` only: the `?api=horizon` GET route, which ran before the owner check, was removed 2026-11-15), Organization Sync (owner plus `ORG_SYNC_CO_ADVISORS`), and the AI-drafting job queue (see below). Its Gmail-label horizon scan is currently **disabled**, along with every Gmail scope. They were removed while chasing the consent-dialog crash, which turned out to be unrelated (see the Fixed section below), so restoring them is now a separate decision. `LEADERHUB_AI_FLOW_SETUP.md` covers the queue; `LEADERHUB_EMAIL_SETUP.md` is superseded/historical. |
| `LEADERHUB_*.md` | Project reference docs (README, principles, handoff notes, WIP, Gem prompt, email setup, AI drafting Flow setup) |
| `BRAG_EMAIL_FLOW_PROMPT.md`, `ARCHIVE_INSIGHTS_FLOW_PROMPT.md`, `WBL_INSIGHTS_FLOW_PROMPT.md`, `LP_ASSIST_FLOW_PROMPT.md`, `EMAIL_COMPOSE_FLOW_PROMPT.md` | Exact Gemini system prompts for each AI job type — see `LEADERHUB_AI_FLOW_SETUP.md` |
| `LH_0*.md` | Numbered reference docs — naming conventions, integration guide, Canvas ideas, email audit, and 3 grading/pacing structure iterations (`LH_04_GRADING_STRUCTURE.md`, `LH_05_GRADING_STRUCTURE.md`, `LH_05_PACING_AND_GRADING.md` — successive dated drafts of the same working document, not conflicting versions to reconcile; kept as-is per this tool's own iterative working style) |
| `drive-tools/` | Later, **not-yet-executed** Drive-cleanup tooling (`LH_DriveDocSplitter.gs`, `LH_8177_Rename.gs`, `LH_AppManifestUpdater.py`) for splitting/renaming 8177 lesson docs |
| `docs/` | One doc per feature, split out of this README on 2026-11-17 — see "Features" below and `docs/README.md` |

`archived/` (external product review, Finding 3 / "this month" dead-code
cleanup) was removed from the working tree — nothing here is lost, the
full pre-deletion tree is preserved on the `pre-archive-cleanup` branch.
It held `studentleaderhub_EARLY_PROTOTYPE.html` (a much earlier prototype,
2,155 lines, 8 views — dashboard, lessons, tasks, journal, brag board,
SCR, trips, settings — with a working trips module already present, but
no dedicated DECA/WBL/E-Sports modules and no Gemini integration —
genuinely different from the live app, not a duplicate, kept for history)
and `studentleaderhub_REACT_EXPLORATORY_DRAFT.jsx` (a React/JSX
exploration draft, not the deployed artifact, referenced in HISTORY.md's
"Fixed: two more narrow-blast-radius bugs").

## Where the data lives

Since 2026-10-22 (`archive/2026-27-Q1/meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md`,
all five phases done), the server is the only store:

- **Load.** `doGet()` (`Code.gs`) reads every config key, data domain and
  the SCR scores in one pass (`lhBootData_`, `Data.gs`) and writes them
  into the page as `window.__LH_BOOT__` (`lhInjectBootData_`) before the
  app's scripts run. The app keeps them in page memory (`_lhStore`,
  `src/05`); `LS.get`/`LS.set` kept their names but read and write that
  memory, not the browser.
- **Save.** Every `LS.set` goes to the server: settings-shaped keys
  (`LH_CONFIG_KEYS`, `Config.gs`) as Script Properties named
  `LH_CONFIG__<key>`; record lists (`LH_DATA_TABS`, `Data.gs`) as tabs in
  the private "LeaderHub Data" spreadsheet; SCR scores cell by cell
  in its `scr_scores` tab (`SCR.gs`). Drafts and view state (`LH_PAGE_MEMORY_KEYS`) stay in page
  memory only, so a reload opens on the dashboard.
- **When a save fails** a red "N changes not saved yet — retrying" bar
  appears with **Retry now**; leaving the page asks first. If the server's
  data can't be read at load, the page says so and refuses to save.
- **Browser storage** is touched only to move an earlier version's
  leftovers (`lhMigrateFromBrowser_`: pushed, then deleted) and by the
  retired-file page below. `tests/leaderhub/no-browser-storage.test.js`
  enforces it.
- **The standalone file is retired.** Opened from disk, `src/00`'s guard
  stops the page and shows "LeaderHub now runs as a web app", with
  **Export everything** and then **Clear this browser's copy**. In the web
  app, Settings → Your Data → **⬆️ Import Backup** merges that export into
  the server copy (`lhImportIntoServer_`) and replaces nothing.
- **Gone:** the Email Bridge URL setting, the Gemini API key, and every
  browser `fetch()` to this project (`callGAS()` is `google.script.run`
  only). The one remaining `fetch()` is the separate cas-ccps connection
  (`CAS_CCPS_BRIDGE`).

The dated sections below say "in localStorage" or "localStorage-backed"
where that was true when each was written. Every one of those keys is now
on the server or in page memory, as above.


## Process history

Bug-fix narration for closed items — the Apps Script bridge's two
independent silent-failure bugs, and the "found two more narrow-blast-
radius bugs" pass, plus the nine-round UI/UX hardening log — now lives in
`HISTORY.md`, not here (external product review, Finding 10 /
"structural" tier). Read `HISTORY.md` when you need to know *why*
something is the way it is; this file stays focused on what the system
currently does and how to work with it. The OAuth-consent-dialog
crash's full investigation is there too; the section near the top of
this file keeps only what a maintainer needs to know about its fix.

---

## Version control (clasp) — connected and deployed

> **Deploying it?** [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) is the
> step-by-step runbook — clasp connection, the `.claspignore` allowlist
> gotcha that fails silently, the Web App deploy, and the `FlowOps.gs`
> verification sequence. This section describes the *layout*; that document
> is the sequence.


The Apps Script project (now `EmailBridge.gs` + `Code.gs` + `Config.gs` +
`Data.gs` + `SCR.gs` + `AiPrompts.gs` + `FlowOps.gs` + `DeployVersionReport.gs`
+ `DeployVersionMarker.gs` + `Diagnostics.gs` — see "Server-deployed
web app" below; this is the one place this list is spelled out in prose, and
`tools/gas-lint/project-map.json` is what the tooling actually reads) is laid out
exactly the way [clasp](https://github.com/google/clasp) wants — a flat
folder. It has a committed `appsscript.json` (derived from actual service
usage: `MailApp`, `DriveApp`, `DocumentApp`, `SpreadsheetApp`, plus the
`webapp` `executeAs`/`access` block — "Execute as: Me · Access: Anyone in
your domain"). `GmailApp` is currently unused. Gmail scope was walked back
entirely while chasing the OAuth-consent-dialog crash, which turned out to
have other causes (see the Fixed section near the top of this file, and
`leader-hub/HISTORY.md`). A `.claspignore` that allowlists
exactly those `.gs`
files plus `appsscript.json` and `student-leader-hub.html` (everything
else here — the `LEADERHUB_*`/`LH_0*` docs,
`archived/`, and `drive-tools/`'s one-off paste-and-run utilities — is
excluded), and a `.clasp.json.template` to fill in with a real
`scriptId` once you've run `clasp login` + `clasp clone`/`create` against
the live project. See
[`meta/CLASP_AND_APPS_SCRIPT.md`](../meta/CLASP_AND_APPS_SCRIPT.md) for
the full workflow.

---

## Features

Each feature's detail is in its own doc under `docs/` ([index](docs/README.md)).

- **[Status](docs/status.md)**: "Actively developed (~20 sessions per its own `LEADERHUB_WIP.md`)." Dated: "the built-in school calendar is CCPS 2026-27", "last spring's sample deadlines are retired", the DECA season, and "the Settings school-calendar importer misread real calendars".
- **[The OAuth-consent-dialog crash, and diagnosing without DevTools](docs/oauth-crash-and-diagnostics.md)**
  - [Fixed (2026-09-28)](docs/oauth-crash-and-diagnostics.md#fixed--the-oauth-consent-dialog-crash-2026-09-28): "**Read this before touching `tools/leaderhub-build/` or the way the page is served.**"
  - [Diagnosing without DevTools](docs/oauth-crash-and-diagnostics.md#diagnosing-a-broken-page-without-devtools): "DevTools is blocked on district devices, so `Diagnostics.gs` puts the information on the page itself and in the editor's **Executions** log."
- **[AI drafting — bifurcated GAS + Workspace Flow backend](docs/ai-drafting.md)**: "…direct browser→Gemini calls with a user-supplied API key — never obtainable, so every "AI"-branded feature … shipped as deterministic local logic instead."
- **[Settings](docs/settings.md)**
  - [My Profile & School](docs/settings.md#settings--my-profile--school): "Per `LEADERHUB_PRINCIPLES.md`, this was never designed to scale to other teachers — but every outbound string in it … used to be a name/phone/email/school literal baked into the source."
  - [School Calendar & Bell Schedule](docs/settings.md#settings--school-calendar--bell-schedule): "The bell-schedule times, the day-of-week → schedule-type rotation, the school-year quarters, and the no-school/early-release calendars were all Clover Hill's actual 2025-26 values hardcoded … with no settings path."
  - [Modules](docs/settings.md#settings--modules): "The nav (7 buttons) and sidebar (7 accordion sections) showed every module unconditionally."
  - [Clear Sample Data](docs/settings.md#settings--clear-sample-data): "Six collections used to ship with real seed content baked into the file."
  - [Course Catalog](docs/settings.md#settings--course-catalog-customizable-course-data): "The Student Competency Records (SCR) tracker's course catalog was the last hardcoded piece of the portability story."
- **[DSP framework content — removed](docs/dsp-framework-content-removed.md)**: "Earlier versions of this app cited Adam's personal CCPS teacher-evaluation cycle ("Directed Support Plan," or "DSP") throughout."
- **[Organizations](docs/organizations.md)**
  - [Organizations (DECA generalized)](docs/organizations.md#settings--organizations-deca-generalized-to-any-clubctso): "This round makes the underlying system generic so another teacher's club, CTSO, or student organization can be added the same way a Course Catalog course is."
  - [Co-advisor sharing (EE2)](docs/organizations.md#settings--organizations--co-advisor-sharing-ee2): "The "deliberately out of scope" item from the round above — sharing an organization's roster/results between co-advisors — is now built."
  - [FF1](docs/organizations.md#ff1--the-long-tail-of-hardcoded-deca-references-closed-out): "EE1's own "deliberately out of scope" list named five narrower, lower-value spots … that still said "DECA" literally."
- **[Pacing guide and county calendar import (GG1, HH1, II1)](docs/pacing-and-calendar-import.md)**
  - [GG1 — Weekly Schedule from the pacing guide](docs/pacing-and-calendar-import.md#gg1--weekly-schedule-auto-populated-from-the-real-pacing-guide--a-ccpsvdoe-lesson-template): "Two long-standing gaps closed together, since fixing one exposed the other."
  - [HH1 — county calendar import](docs/pacing-and-calendar-import.md#hh1--import-a-county-calendar-document-into-school-calendar-settings): "This adds an import path."
  - [II1 — 6115's pacing-guide import](docs/pacing-and-calendar-import.md#ii1--6115s-pacing-guide-import-a-filled-in-template-now-actually-reaches-the-calendar): "Closes the gap GG1's own "Deliberately not done" note left open."
- **[cas-ccps↔leader-hub integration (D1 + Addendum 26)](docs/cas-ccps-integration.md)**: "**Status (D16, 2026-11-01): parked until `checkCasServerSignIn()` passes.**"
- **[Hardcoded-credentials cleanup](docs/hardcoded-credentials-cleanup.md)**: "Three real-PII surfaces in `student-leader-hub.html` got scrubbed to blank defaults."
- **[`student-leader-hub.html` split into `src/`](docs/src-split.md)**: "The single ~22,000-line file is now generated from 14 fragments under `src/` via `tools/leaderhub-build/build.js`."
- **[JJ1 — Server-deployed web app](docs/jj1-server-deployed-web-app.md)**: makes leader-hub run the way the CAS Teacher Dashboard does: a real Apps Script Web App reachable at a `/exec` URL, sign-in-gated to one owner.
- **[Deploy-drift self-report (process-hardening sprint Phase 3a)](docs/deploy-drift-self-report.md)**: "`DeployVersionReport.gs` + `DeployVersionMarker.gs` self-report this project's live version to the KOS repo."
