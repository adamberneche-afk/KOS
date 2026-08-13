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
with cas-ccps beyond referencing the same course numbers. 100%
client-side: opens as a local HTML file, all state in `localStorage`, no
server, no build step. The app's original design called for AI features
calling Gemini directly from the browser with a user-supplied API key —
that key was never obtainable, so every "AI"-branded feature shipped as
deterministic local logic instead (see "AI drafting" below for the one
feature that now has a real backend, added later via the same
GAS+Workspace-Flow bifurcation kos-personal/cas-ccps use, requiring no API
key at all).

## Layout

| Path | Contents |
|---|---|
| `student-leader-hub.html` | The live app (16,682 lines as of the UI/UX hardening rounds below — grew from 15,173 lines through 9 rounds of fixes/comments) — open directly in a browser |
| `student-leader-hub.jsx` | A React/JSX exploration draft, not the deployed artifact |
| `EmailBridge.gs` | Optional companion Apps Script (Gmail → Sheet → app polling, sub-plan/brag-email creation, and — see below — the AI-drafting job queue) — see `LEADERHUB_EMAIL_SETUP.md` and `LEADERHUB_AI_FLOW_SETUP.md` |
| `LEADERHUB_*.md` | Project reference docs (README, principles, handoff notes, WIP, Gem prompt, email setup, AI drafting Flow setup) |
| `BRAG_EMAIL_FLOW_PROMPT.md`, `ARCHIVE_INSIGHTS_FLOW_PROMPT.md`, `WBL_INSIGHTS_FLOW_PROMPT.md`, `LP_ASSIST_FLOW_PROMPT.md`, `EMAIL_COMPOSE_FLOW_PROMPT.md` | Exact Gemini system prompts for each AI job type — see `LEADERHUB_AI_FLOW_SETUP.md` |
| `LH_0*.md` | Numbered reference docs — naming conventions, integration guide, Canvas ideas, email audit, and 3 grading/pacing structure iterations (`LH_04_GRADING_STRUCTURE.md`, `LH_05_GRADING_STRUCTURE.md`, `LH_05_PACING_AND_GRADING.md` — successive dated drafts of the same working document, not conflicting versions to reconcile; kept as-is per this tool's own iterative working style) |
| `drive-tools/` | Later, **not-yet-executed** Drive-cleanup tooling (`LH_DriveDocSplitter.gs`, `LH_8177_Rename.gs`, `LH_AppManifestUpdater.py`) for splitting/renaming 8177 lesson docs |
| `archived/studentleaderhub_EARLY_PROTOTYPE.html` | A much earlier prototype (2,155 lines, 8 views — dashboard, lessons, tasks, journal, brag board, SCR, trips, settings — with a working trips module already present, but no dedicated DECA/WBL/E-Sports modules and no Gemini integration) — genuinely different from the live app, not a duplicate, kept for history |

## Status

Actively developed (~20 sessions per its own `LEADERHUB_WIP.md`). The
`drive-tools/` scripts are flagged in their own filenames' origin as
**not yet run against real data** — treat them as drafts pending a
deliberate execution decision, not as already-applied changes.

## Fixed: the Apps Script bridge was completely non-functional

A full codebase review found the `EmailBridge.gs` integration — sub-plan
Doc creation, brag-email Gmail drafts, and mark-consumed for horizon
items — silently failed 100% of the time, for two independent reasons,
both now fixed:

1. **CORS preflight.** Every `fetch()` call to the bridge (`callGAS()`,
   used by sub-plan/brag-email, and the separate mark-consumed call in
   `EMAIL_BRIDGE.poll()`) set `Content-Type: application/json`, which
   makes it a non-simple CORS request — the browser sends an OPTIONS
   preflight first, and Apps Script Web Apps don't answer preflights.
   Every call failed before it ever reached the server, always falling
   into the UI's "saved locally" fallback with no indication the
   automation wasn't actually running. Fixed by switching to
   `text/plain;charset=utf-8` (a CORS-"simple" content type — no
   preflight) — `EmailBridge.gs`'s `doPost()` already reads the raw body
   via `JSON.parse(e.postData.contents)` regardless of the declared
   Content-Type, so this required no server-side change.
2. **Payload shape mismatch.** Independent of the CORS bug,
   `EMAIL_BRIDGE.poll()`'s mark-consumed call sent `{consumed: [...]}`
   with no `action` field; `EmailBridge.gs`'s `doPost()` requires
   `{action: 'markConsumed', ids: [...]}`. Even with CORS fixed, this
   call always hit the server's `"Unknown action: "` fallback and never
   persisted anything — a horizon item marked done or deleted client-side
   would reappear on the next 10-minute poll, forever. Fixed to send the
   shape the server actually expects.
3. **Bonus, found while fixing #2**: `markConsumed_`'s stored ID list was
   capped at 500 entries via `slice(-500)`, but 500 JSON-encoded Gmail
   message IDs (~19 bytes each) already exceeds PropertiesService's
   9216-byte per-value limit (~9.5KB) — `setProperty()` would have started
   throwing well before reaching the cap, breaking mark-consumed
   permanently from that point on. Lowered to 300 (~5.7KB), with real
   margin.

## Fixed: two more narrow-blast-radius bugs

1. **`student-leader-hub.jsx`'s leaderboard mutated React state directly.**
   The top-3 leaderboard render called
   `data.leaders.sort((a, b) => b.hours - a.hours).slice(0, 3).map(...)`
   directly on `data.leaders` — `Array.prototype.sort()` sorts in place,
   so this silently reordered the component's own state array as a render
   side effect instead of just computing a sorted view of it. Harmless by
   luck as long as nothing else depended on `data.leaders`'s original
   order, but a real landmine for the next feature that does. Fixed to
   sort a shallow copy — `[...data.leaders].sort(...)`. Note: this file is
   an explicitly-labeled React/JSX exploration draft, not the deployed
   artifact (see Status above), so this was verified by careful manual
   review rather than `node --check`, which can't parse JSX.
2. **`drive-tools/LH_DriveDocSplitter.gs`'s `copyTextRunFormatting` could
   lose or misapply character formatting.** It walked the source and
   destination paragraph's child `Text` elements in parallel by index,
   copying attributes range-by-range from `srcElem.getChild(i)` to
   `destElem.getChild(i)`. Google Docs splits a paragraph's text into
   multiple `Text` children whenever formatting changes mid-paragraph
   (e.g. one bolded word), so source and destination can end up with a
   different number of children, or children of different lengths, even
   when their combined text is identical — `Text.setAttributes()` also
   takes child-local offsets, not whole-paragraph offsets, so index-paired
   copying could apply the wrong attributes to the wrong text, or throw
   entirely once the two elements' child counts diverged. Rewritten to
   walk the source paragraph by absolute character offset (accumulating a
   running `globalOffset` across all of its `Text` children) and use a new
   helper, `_setDestAttributesAtOffset_()`, to translate each global
   offset into the correct destination child + local offset before calling
   `setAttributes()` — correct regardless of how either side's runs are
   split.

## AI drafting — bifurcated GAS + Workspace Flow backend

The app's original design called for direct browser→Gemini calls with a
user-supplied API key — never obtainable, so every "AI"-branded feature
(`aiComposeEmail`, `generateAIInsights`, `wblAIInsights`, `lpRunAI`,
`generateBragEmail`) shipped as deterministic local logic instead, with no
model call anywhere (see the "Removed: Gemini AI infrastructure" comment
in `student-leader-hub.html`).

**Real AI drafting is now built for all five** — Brag Board's "✨
Generate" (`BRAG_EMAIL`), the Trip Archive's "✨ Generate Insights from
Archive" narrative (`ARCHIVE_INSIGHTS`), the WBL Program Summary's "✨
Generate AI Summary" (`WBL_INSIGHTS`), the Lesson Plan Helper's
quick-prompt buttons and custom-question box (`LP_ASSIST`), and the
Email Composer's "✨ Generate with AI" button (`EMAIL_COMPOSE`) — using
the same **Bifurcation Boundary** architecture kos-personal/cas-ccps
already use for their own AI integrations: GAS does 100% of the
deterministic work (assembling the payload, queuing a job, polling for
the result, cleaning up old rows), and a separate **Google Workspace
Flow** — a no-code automation built in the Workspace UI, using its own
"Gemini — Generate content" connector — does 100% of the actual
generation. That connector runs on the Workspace account's own built-in
Gemini access, not a developer API key, which is exactly what solves the
original "can't get an API" blocker. The job queue is generic to job
`type`, so none of `ARCHIVE_INSIGHTS`/`WBL_INSIGHTS`/`LP_ASSIST`/
`EMAIL_COMPOSE` needed any change to `EmailBridge.gs` — only a new
client-side payload and another Flow watching the same sheet, each time.

For Archive Insights and WBL Program Summary specifically, the split
follows the Bifurcation Boundary the other direction too: each feature's
stats grid (trip counts/cost/type breakdown; student counts/hours/SBE
progress) is pure arithmetic, computed locally, always — too
correctness-critical to ever hand to a model — and only the qualitative
half (a short narrative surfacing real patterns across free-text content:
trip glows/grows, or WBL attention reasons and SBE checklist notes)
optionally routes through the Flow, additively, below the always-present
stats. Lesson Plan Helper, Brag Board, and Email Composer have no such
arithmetic half — their whole point is a real written answer to a
prompt — so they follow a simpler shape: the Flow's output *is* the
result shown (or the existing deterministic fallback, on any failure).

**What's new:**
- `EmailBridge.gs` gained two actions — `aiDraft` (queues a job into a
  lazily-created "LeaderHub AI Queue" spreadsheet) and `checkAiJob` (polls
  for and returns a completed result, sweeping stale rows on every call so
  an unbuilt or broken Flow can't leak rows forever).
- `student-leader-hub.html`'s `_generateBragEmailInner()`,
  `generateAIInsights()`, `_wblGenerateNarrative()`, `lpRunAI()`, and
  `aiComposeEmail()` all try the AI path first (when an Apps Script
  bridge URL is configured), polling for up to ~90 seconds via a shared
  `pollAiJob_()` helper, and **always fall back to the existing
  deterministic result** on any failure, timeout, or when no bridge is
  configured at all — all five are purely additive; each keeps working
  exactly as it always has if its Flow is never built. `lpRunAI()` and
  `aiComposeEmail()` additionally guard against a slower, stale request's
  result overwriting a newer request's (a monotonic request-id check
  each), since both have multiple ways to fire overlapping requests
  (8 quick-prompt buttons plus a custom-question input for the former; a
  re-clickable "Generate with AI" button with no disabled state for the
  latter, before this change).
- `leader-hub/appsscript.json` gained the `spreadsheets` OAuth scope
  (caught by `tools/gas-lint/check.js` before it could become a silent
  runtime authorization failure).
- Six docs: `LEADERHUB_AI_FLOW_SETUP.md` (the full handshake spec — sheet
  schema, one-Flow-per-job-type trigger/connector configuration, all five
  payload shapes — same convention as
  `kos-personal/STUDIO_INTEGRATION_SPEC.md`), `BRAG_EMAIL_FLOW_PROMPT.md`,
  `ARCHIVE_INSIGHTS_FLOW_PROMPT.md`, `WBL_INSIGHTS_FLOW_PROMPT.md`,
  `LP_ASSIST_FLOW_PROMPT.md`, and `EMAIL_COMPOSE_FLOW_PROMPT.md` (the
  exact system prompts to paste into each Flow's Gemini step).
- **Found and fixed while wiring up `WBL_INSIGHTS`:** `wblAIInsights()`'s
  stat tile and per-student badge checked
  `wblStudentStatus(s)==='at-risk'`, a status string that function never
  actually returns (it returns `'not-started'`, `'needs-attention'`, or
  `'on-track'`) — so the "At Risk" tile always read 0 and every
  non-on-track student showed a ❌ regardless of which real status
  applied. Fixed to match the real status values and to build a specific
  reason per flagged student (`_wblAttentionReason()`: missing agreement,
  hours short of the 30 required, no reflections logged) instead of just
  a pass/fail badge.
- **Found and fixed while wiring up `EMAIL_COMPOSE`:** `aiComposeEmail()`
  wrote its result to `document.getElementById('email-output')`, an
  element that doesn't exist anywhere in this file — the real compose
  textarea is `#email-body`. `out` was therefore always `null` and the
  function returned immediately, every time — clicking "✨ Generate with
  AI" (and `generateRegEmail()`'s programmatic call into the same
  function) silently did nothing at all, since before this feature
  existed. Fixed the id, so the deterministic fallback template is now
  actually reachable regardless of whether AI drafting is ever
  configured.

**What this doesn't include yet:** none of the five Workspace Flows are
built — building a no-code Flow happens in the live Google Workspace UI,
not a file this repo can contain, same limitation kos-personal/cas-ccps's
own unbuilt Studio flows already live with. `LEADERHUB_AI_FLOW_SETUP.md`
is the complete spec to build all five against. No "AI"-branded feature
remains deterministic-only now.

**Names by default, with an opt-in substitution path:** unlike
kos-personal/cas-ccps (which anonymize before any AI call, per their
FERPA-scoped design), all five features send free-text content to Gemini
as-is by default, which may include real student names (e.g. a DECA
placement, a student named in a trip reflection, a student named in a WBL
attention item, a student named in a typed Lesson Plan Helper question,
or a student named in an Email Composer instruction) — Brag Board's whole
point is naming real achievements, and this is Adam's personal
professional-communications tool, not a student-education-record system.
Settings → "Student ID Lookup — AI Privacy" adds an optional layer on
top: upload a roster CSV (Name + CCPS ID/login) and **all five** features
substitute each matched student's name for `{7-digit ID}@{your email
domain}` before the request leaves the browser, then restore the real name
once the result comes back — a client-side, two-way text substitution, not
a schema change. Names not on the uploaded roster still go through as-is
(fail-open, disclosed in the UI, not a silent gap). See
`LEADERHUB_AI_FLOW_SETUP.md`'s "What data this sends through Gemini"
section for the full rationale.

## Settings → My Profile & School

Per `LEADERHUB_PRINCIPLES.md`, this was never designed to scale to other
teachers — but every outbound string in it (email-template signatures,
sub-plan headers, Brag Board recipients, the AI-privacy email domain) used
to be a name/phone/email/school literal baked into the source, meaning a
colleague who wanted to fork this for themselves had to hand-edit dozens of
strings across a 17,000-line file before a single email went out under
their own name instead of Adam's.

Settings now has a "My Profile & School" panel — name, title(s), school,
phone, email, email domain, and the DECA-specific Brag Board recipients
(supervisor/admin/attendance-coordinator) — backed by a `PROFILE` object
(`lh_profile` in localStorage) that every one of those templates reads from
instead. Fields save as you leave them and take effect immediately, no
reload required. This closes the identity/signature gap specifically.

The seed data in `SCR_COURSES` also had a real-looking student roster (121
names in "Last, First" format) hardcoded into its per-period arrays, with
no UI to clear it — confirmed as dummy/placeholder data and removed; the
period-slot structure and full Virginia CTE competency framework are
untouched.

## Settings → School Calendar & Bell Schedule

The bell-schedule times, the day-of-week → schedule-type rotation, the
school-year quarters, and the no-school/early-release calendars were all
Clover Hill's actual 2025-26 values hardcoded into four consts
(`BELL_SCHEDULES`, `CCPS_SCHEDULE_OVERRIDES`, `CCPS_NO_SCHOOL`,
`LP_QUARTERS`) with no settings path — every one of them expires at the
end of a school year.

Settings now has a "School Calendar & Bell Schedule" panel backed by
`lh_schedule_config` in localStorage:
- **Day-of-Week Default Schedule** — 7 dropdowns (Sun–Sat), each picking a
  configured bell-schedule type or "No School".
- **Quarter Dates** — 4 start/end date pairs (Q1–Q4).
- **No-School Dates** and **Early-Release Dates** — one date per line,
  parsed and validated against `YYYY-MM-DD` before saving.
- **Advanced: Bell Schedule Times (JSON)** — the actual period start/end
  times, exposed as a raw JSON textarea rather than a bespoke visual
  builder (a full drag-and-drop period editor is a bigger project than
  this round covers; this still means no source edits are required, just
  editing JSON instead of a form).

All four consts are now `let` bindings populated by `_applyScheduleConfig()`
(and `_applyQuartersConfig()` for quarters, kept separate to avoid a
temporal-dead-zone crash — quarters are declared ~4,000 lines after the
bell-schedule section) from `_DEFAULT` fallbacks, so nothing changes for
Adam unless a field is edited. `getTodayScheduleType()`'s hardcoded
"Wed/Thu/Fri → B" weekday logic is now a lookup against the same
`DAY_SCHEDULE_MAP` the Settings panel edits.

Not yet covered by any settings layer: per-module (DECA/WBL/E-Sports)
visibility toggles and the Virginia-CTE-specific `SCR_COURSES` course
catalog (course codes/competency lists) — both still hardcoded.

## UI/UX Hardening — Rounds 1–9

After the reconciliation work that filed this system into the repo, it
went through nine further rounds of dedicated UI/UX auditing alongside
`kos-personal/` and `cas-ccps/` — each round re-examined the whole app
against everything already fixed, then split its findings into a bugs
commit and a separate polish commit. What follows is this system's share
of that record (by far the largest of the three, since this is the
biggest single file in the repo); see the other two systems' READMEs for
theirs. Commit hashes are given so any item's full diff/rationale can be
looked up directly.

**Round 1** (`d37f3c4`, `1a51e22`, `a6b74d5`) — the initial pass. Made
`refreshNextAction()`/`buildActionQueue()` defensive against malformed
records (one bad record used to silently abort every dashboard render
after it); turned the Approval Chain into a real tri-state
(approved/rejected/pending) with a note and timestamp per step, replacing
a boolean that couldn't distinguish "not yet approved" from "actively
rejected"; **unified the two most dangerous duplicate approval trackers**
— the DECA Hub checklist's approval steps now read directly from the
matching trip's real Approval Chain instead of keeping an independently-
toggleable copy that could silently drift from it; fixed the SCR rating
scale rendering backwards from the actual VA CTE rubric (Insights table
colored 4 as best, 1 as worst — the grading grid and the rubric both say
1 is best); converted the DECA season pipeline from a hardcoded array
that went stale every year to editable app data; made SCR grading cells
and the Horizon checkbox keyboard-operable; and added a shared
Escape-to-close + Tab-trap to the app's `openModal()`/`closeModal()`,
covering all 17 modals built on it at the time.

**Round 2** (`c329ccf`, `3a8ebf7`) — **fixed three real data-loss bugs in
one pass**: editing a trip through the wizard silently wiped its entire
approval chain (the edit draft never carried the existing sign-offs
forward); approval-chain approve/reject clicks were never persisted to
storage, so a page refresh silently reverted every decision; and DECA
roster edits never saved at all (`updateStudent()` mutated the in-memory
object but never called `persistStudents()`, unlike its sibling
`saveStudent()`). Also fixed E-Sports match ties rendering as "LOSS" and
excluded from both win/loss tallies; the Trip Archive "Overnight" filter
checking for values the wizard had never actually written (the filter
always returned an empty list); DECA placement text garbling into
strings like "1stth place"; and Total Inventory Value being computed at
retail price instead of cost. Toasts gained proper bottom-up stacking;
13 legacy "raw" modals got real focus management; and a `beforeunload`
guard was added to catch an accidental tab close, not just an in-app
close action.

**Round 3** (`f63bcae`, `4bb4491`) — fixed `leadDays()`/`apSteps` trip-type
comparisons checking against dead pre-refactor strings instead of the
wizard's real taxonomy, producing wrong deadline lead times and missing
required approval steps for every real trip; fixed the Dashboard Quick
Log's SBE checkbox mutating state directly instead of calling
`sbeToggle()`, so checks never actually persisted; and fixed the Journal
History modal's Escape/Tab-trap acting on the wrong modal when opened on
top of Journal. Added wizard required-field validation for 4 fields that
were marked required in markup but never actually validated, and keyboard
access to the wizard step-bar and E-Sports checklists.

**Round 4** (`641633c`, `ce39d09`) — fixed the Trip Archive's `.archived`
flag being set but never read anywhere (no indicator on the trip
card/detail) and silently dropped on every edit; the DECA Hub's "Season
Timeline" card reading from its own hardcoded stages array instead of the
data the season editor actually updates; the WBL Tracker's inline
"+ Hours" popover being silently destroyed, with unsaved input, by the
search/filter re-render; a debounce race where a fast checkbox click
could discard an unsaved SBE note on a *different* row within the commit
window; and the default SCR Grid view being entirely keyboard-
inaccessible (an earlier round's keyboard support had only landed on the
secondary List view).

**Round 5** (`c8a0169`, `a5dd7fd`) — fixed the 2am priority-adjustment
cron job's catch-up logic: it only ever fired inside an exact 10-minute
window keyed to the current clock hour, so a run missed while the app was
closed at 2am sat stale for a full extra day before it could match again;
fixed opening Print Auth Forms from Trip Detail printing a **blank trip
name** (the trip selector's options were never populated on that entry
path); and fixed editing any DECA member detail silently resetting their
Assigned Trip/Event field to "— None —". Replaced the last native
`confirm()` calls in 3 discard guards with the app's own styled dialog.

**Round 6** (`8273ed4`, `803ba1f`) — **unified a real cross-screen
inconsistency**: the Dashboard alert banner and Trip Detail header used a
7-day urgency cutoff while the Trips Hub deadline filter and readiness
card used 14 days, so the identical trip could read "urgent" on one
screen and calm on another — standardized on 14 days across all 4 call
sites (see Round 7 below for a 5th spot this missed). Also fixed
missing-singular day-count bugs ("1 days OVERDUE"), 7 previously-
unbounded undo-toast interpolations, and 4 inconsistent date-format call
sites — including the printed Field Trip Permission Request form, which
was showing two different date formats side by side on the same page.

**Round 7** (`5f1c4d2`, `12730fb`) — **found two of Round 6's own fixes
had gaps**: the `_showDiscardConfirm()` dialog it introduced was never
registered in `RAW_MODAL_CLOSERS`, so Escape re-invoked the *underlying*
modal's close function instead of dismissing the dialog itself; and the
trip-readiness step tiles (Phase 1/Phase 4) were still using the old
7-day cutoff after Round 6 unified the card's own header banner to 14
days — the exact contradiction that fix was meant to prevent, one level
deeper in the same card. Replaced the app's last 8 native `confirm()`
dialogs with a generalized `_showConfirm()`, and added `aria-label` to 17
previously-unlabeled icon-only buttons.

**Round 8** (`3fd08da`, `cef3700`) — **found that Round 7's own
`RAW_MODAL_CLOSERS` registration for the discard-confirm dialog only did
`el.remove()`, skipping `opts.onCancel`** — Escape on the trip-draft
resume prompt left no wizard open and never cleared the stale draft,
where clicking Cancel did both correctly. Fixed by stashing the dialog's
real close handler on the element itself. Extended the navy-background
focus ring to 12 more modal close buttons + DECA's Edit Season button via
a new `.btn-on-navy` class, and fixed the trip-draft-resume message's
`\n\n` rendering as literal characters instead of a line break.

**Round 9** (`0d433eb`) — **found the single most severe bug of any
round, pre-dating this series entirely**: 8 raw
`${...}.map().join('')` template-literal expressions were sitting
directly in static page HTML, *outside any `<script>` tag*, dating back
to the original Round 3 reconciliation filing — the browser had no way to
evaluate them, so it rendered the literal JS source as visible garbage
text (E-Sports rules/stages, DECA registration-info field chips), and
**the Archive Trip star-rating widget's buttons never existed as real DOM
elements at all**, making that entire rating control silently unclickable
since the day it was added. Fixed by moving all 8 into a proper render
function called once at boot. Also fixed `.mbox` — the CSS class backing
8 modals (Register DECA Member, Archive Trip, Email Composer, Brag Board,
and others) — having *zero* matching CSS rules anywhere in the file, so
those modal bodies rendered fully transparent over the blurred backdrop
with invisible white-on-white header text; and gave the Trip Wizard close
button (the single most-used modal in the app) the `aria-label`/focus-ring
treatment two prior rounds had both missed.

---

## Version control (clasp) — scaffolded, not yet connected

`EmailBridge.gs` is a single Apps Script project, laid out exactly the
way [clasp](https://github.com/google/clasp) wants — a flat folder. It
now has its first-ever committed `appsscript.json` (derived from actual
service usage: `GmailApp`, `DriveApp`, `DocumentApp`, plus the `webapp`
`executeAs`/`access` its own header comment already specifies — "Execute
as: Me · Access: Anyone in CCPS domain"), a `.claspignore` that
allowlists only `EmailBridge.gs` + `appsscript.json` (everything else
here — the `LEADERHUB_*`/`LH_0*` docs, `student-leader-hub.html/.jsx`,
`archived/`, and `drive-tools/`'s one-off paste-and-run utilities — is
excluded), and a `.clasp.json.template` to fill in with a real
`scriptId` once you've run `clasp login` + `clasp clone`/`create` against
the live project. See
[`meta/CLASP_AND_APPS_SCRIPT.md`](../meta/CLASP_AND_APPS_SCRIPT.md) for
the full workflow.
