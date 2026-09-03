# leader-hub — process history

Bug-fix narration and dated hardening rounds pulled out of `README.md`
(external product review, Finding 10 / "structural" tier — the same split
applied to `cas-ccps/README.md` and already present for
`kos-personal/README.md` via `CHANGELOG.md`). `README.md` documents the
system as it is today; come here when you need to know *why* something is
the way it is — what was wrong, how it was confirmed, and what changed —
for closed items.

Everything that describes a still-live feature or an ongoing design
decision (AI drafting, the Settings panels, the Organizations/EE1/EE2/
FF1/GG1/HH1/II1 feature arc, the cas-ccps↔leader-hub integration, the
credentials cleanup, the `src/` split, clasp) stays in `README.md`,
even where it also narrates a bug found while building it — moving that
here would break its own internal "see X below/above" pointers for no
reason, and a new reader needs it to understand the current app, not just
its history.

---

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

1. **`archived/studentleaderhub_REACT_EXPLORATORY_DRAFT.jsx`'s leaderboard mutated React state directly.**
   The top-3 leaderboard render called
   `data.leaders.sort((a, b) => b.hours - a.hours).slice(0, 3).map(...)`
   directly on `data.leaders` — `Array.prototype.sort()` sorts in place,
   so this silently reordered the component's own state array as a render
   side effect instead of just computing a sorted view of it. Harmless by
   luck as long as nothing else depended on `data.leaders`'s original
   order, but a real landmine for the next feature that does. Fixed to
   sort a shallow copy — `[...data.leaders].sort(...)`. Note: this file is
   an explicitly-labeled React/JSX exploration draft, not the deployed
   artifact (see README.md's Status section), so this was verified by careful manual
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


---

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

**Round 10** (`40e4055`, `722fd65`, `c124dd3`, `307fc27`) — a
whole-repo audit pass, not triggered by a bug report. `40e4055` escaped
`renderHorizons()`'s email-sourced text with the existing `escH()`
helper (it was already used three lines above for the same value's
`aria-label`, just not for the visible text). `722fd65` bundled six
independent small fixes: `LS.get()` now mirrors `LS.set()`'s
toast-on-failure convention (its own sentinel, since a read failure —
corrupted JSON — is a different cause than a write failure); the
co-advisor-synced `orgId` gets the same slug-sanitizer already used for
locally-created orgs before it's interpolated into the Join button's
`onclick`; `lhPullOrgSync()` now warns and keeps the existing roster
instead of wiping it when a sync returns zero roster rows; `lh_obs_history`
is capped at 200 entries, matching the `lh_wbl_hours_log` precedent;
8 icon-only buttons that relied on `title` alone (the Alumni edit button
had neither) got matching `aria-label`s; and the printed trip name in
`buildAuthFormHTML()`/`printAuthForm()` is now `escH()`'d, since unlike
the Auth Form's other static-title callers this one is genuinely
user-entered text. `c124dd3` fixed a UTC-vs-local date bug present at 6
call sites — `date.toISOString().slice(0,10)` converts to UTC first,
which silently rolls the calendar date forward in the evening for
US Eastern — by adding one shared `_localDateStr_()` helper (mirroring
`getTodayScheduleType()`'s already-correct inline pattern) and
collapsing all 6 sites onto it, including the SCR daily-session dedup
key, the E-Sports next-match filter, and the school-day/holiday check.

`307fc27` closed an inline-handler JS-injection gap in the SCR grading
grid: `renderScrTable()`/`renderStudentCard()` interpolated a raw
student name straight into `onclick`/`onkeydown` handlers with no
escaping at all, so a name containing a stray `'` could break out of
the JS string argument. `escH()` alone doesn't close this — it only
guards the HTML-attribute boundary, not the JS-string-literal boundary
a bare `'` or `\` breaks out of inside `onclick="fn('${x}')"` — so this
added a second helper, `escJsAttr()`, that escapes for the JS string
first and then runs the result through `escH()` so the surrounding
attribute stays safe too. The audit that flagged this also assumed
fixing it required switching the grading grid from name-keyed to
id-keyed scores, since the SCR roster schema has no id field for
students. It doesn't need one — escaping alone fully closes the
injection — and rekeying onto each student's array position instead
would trade name-collision fragility for a live one (scores silently
misattributed the moment the hand-edited roster array is reordered),
for a data structure with no UI path that adds/renames/imports students
and currently holds none. Left name-keyed at the time, with a comment on
`initScrScores()` explaining the trade-off for whoever adds a real
roster-editing UI later. **Update (Round 11, see below):** that "later"
arrived sooner than expected, via cas-ccps's `getRoster` API rather than
a hand-built roster-editing UI — `_scrStudentKey()` now resolves to a
student's linked email once one exists, name otherwise, and only
students actually matched against that real, external roster get
rekeyed; everyone else stays exactly as name-keyed as before.

**Round 11** (`4c9b087`, `512aaff`, `34d6fa3`, `61e4500`, `647120e`,
`c1f86a9`, `4a2e890`, `b928564`, `ab8da50`, `1c15b62`, `e509f60`,
`4fe081c`, `d97aa9e`, `867d6f4`, `e1221d5`) — all 15 remaining Say/Do
Ledger leader-hub findings, plus the cas-ccps↔leader-hub integration
work. In finding order: `4c9b087` fixed the WBL "at risk" threshold
(30→90 hours, matching the real HQWBL requirement, not a per-semester
pacing figure the code never actually tracked). `512aaff` reframed Match
Log as a personal results log with a direct link to the authoritative
external PlayVS/VHSL bracket, instead of building a redundant internal
one. `34d6fa3` made Brag Board journal entries opt-in per entry (default
flipped from auto-include to requiring an explicit "✓ Include" mark).
`61e4500` fixed `sbeNotes` bypassing the AI-privacy name substitution its
sibling fields already went through, and consolidated every `aiDraft`
payload builder onto one shared `_privacySafeAiPayload()` helper so a
future call site can't independently forget a field. `647120e` re-scoped
the Trip Process Map checklist from one global, refresh-losing state to
per-trip and persisted (`t.procSteps`), retiring a disconnected static
approval-status diagram in the same pass. `c1f86a9` made the Back Room
Receiving Checklist per-PO (was one shared global state — checking boxes
for one PO checked them for every PO), added a per-PO "Reset checklist"
action and a completion timestamp/note. `4a2e890` links a PO to an
Inventory SKU at creation and auto-increments inventory the moment a PO's
receiving checklist completes — checklist completion is now the real
event that connects procurement to inventory. `b928564` gave `finAnalysis()`
real, distinct `roi`/`decisions` report builders (previously all 4 report
buttons aliased the same `profitloss` output) routed through the same
`aiDraft`/Workspace-Flow mechanism every other AI feature already uses.
`ab8da50` reworked the SCR Grid view to compute column width against real
viewport width instead of a hardcoded 700px assumption, added a real
horizontal-scroll affordance, defaults to Cards view below a mobile
breakpoint, and fixed the sticky "Req" column overlapping the Competency
column (both had been sharing one `position:sticky;left:0` from a
duplicate-`style`-attribute bug). `1c15b62` closed 3 real co-advisor
sync-safety holes: Pull had no confirmation (unlike Join's identical
action), no check for unpushed local edits before overwriting, and the
server-side push guard could be bypassed by simply omitting
`expectedUpdatedAt`. `e509f60` added a one-time "Welcome, co-advisor"
disclosure plus a persistent "About this tool" Settings section,
describing this app's real reliability model and the sync-safety
behavior `1c15b62` just shipped. `4fe081c` made a trip's `stuAtt` count
derive from its actual permission-slip roster once one exists, instead of
staying frozen at the Wizard's originally-typed number — with a real
answer to what happens if the headcount changes after a trip's already
been submitted (a warning toast, not a silent change). `d97aa9e` added a
per-flow-type lifetime counter to `EmailBridge.gs`'s job queue (previously
swept with no record kept) and a new Settings → "AI Flow Health" panel —
the leader-hub half of a cross-portfolio Flow Health & Inventory
extension covering all three systems. `867d6f4` and `e1221d5` are D1's
leader-hub side and its student-email follow-up — see "cas-ccps↔leader-hub
integration" in README.md for the fuller writeup, since that work is large
enough to warrant its own section rather than folding into this list.


---

## 2026-09-03 — brought in line with the repo's current build practices

leader-hub was one of the first builds here, and the operational scaffolding
the later systems grew never got back-fitted to it. An audit against what
cas-ccps and kos-personal now carry found the gap was narrow but real, and —
usefully — that most of the *architectural* worry did not apply.

**What turned out to be fine, so nobody re-litigates it.** leader-hub has no
GCP exposure at all: no custom Workspace Studio steps, no API key, nothing
for an operator to provision. Its Flows call Gemini with the Workspace
account's own built-in access, which is the Bifurcation Boundary
`EmailBridge.gs` describes at its line 160. That makes it the cleanest
example of the pattern in this repo, and it is why it has no entry in
`tools/gas-lint/gcp-map.json` and should never acquire one — the wall that
killed 2,113 lines of `cas-ccps/studio-steps/` cannot reach this system. The
10 open items in `LEADERHUB_WIP.md` are UI and data-freshness polish, not
blockers. Test coverage was already reasonable (7 files before this).

**What was missing: the whole reliability layer.** cas-ccps has a schema
guard, a preflight, fixtures and a canary; kos-personal has a turnstile and
a queue watchdog; leader-hub had none of the four, while having the exact
failure modes they exist to catch. Added as `FlowOps.gs`:

- **Schema guard** (`checkAiQueueSchema` / `repairAiQueueSchema`). `AIQ_COL`
  indexes `AI_Queue` by column *position*, and the Workspace Flow writes
  `Status`/`Result` back by position too — so drift breaks reading *and*
  writing with no error on either side, and a Flow would write its result
  into the wrong cell while GAS read `PENDING` forever.
  `_getAiQueueSheet_()` writes headers only when it creates the tab, so
  nothing had ever verified them again. This is not a hypothetical risk: the
  same class of drift on cas-ccps's Central Ledger made
  `LEDGER.TEACHER_EMAIL` return a person's *name*, silently killing every
  downstream lookup, and it took a live session to find. The repair
  deliberately **refuses** while data rows exist — rewriting headers over
  rows written under the old layout relabels their columns without moving
  their values, which hides the mismatch instead of fixing it. Queue rows
  are transient (swept after two hours), so waiting is a real option here in
  a way it was not for the Ledger, which is why this refuses rather than
  backing up and rebuilding the way `38_LedgerSchemaGuard.js` does.
- **Fixtures** (`installAiFlowFixtures` / `checkAiFlowFixtures` /
  `removeAiFlowFixtures`). A Workspace Flow that matched zero rows reports a
  green "Run Completed", indistinguishable from working — the single biggest
  time sink on the cas-ccps side. Six Flows here had never had a row to match
  unless someone drove the UI by hand. One `PENDING` row per type makes the
  read-back the actual test: a `Status` that moved off `PENDING` is proof
  that *that* Flow is live.
- **Canary** (`runAiFlowCanary`). Exercises the Apps Script half end to end —
  queue, poll, hand back once, delete, bump stats — with the Flow stubbed on
  purpose, so a pass localises any remaining failure to the Flow. Same
  discipline as `runFlow2Canary()`, including being explicit in both the code
  and the log that a pass says nothing about whether any Flow exists.
- **Preflight** (`runLeaderHubPreflight`). One read-only report: queue
  spreadsheet reachable, both header rows matching the code, prompts synced,
  every job type carrying a prompt. Makes no writes, so it is safe against a
  live deployment at any time.

Two safety properties were verified before the fixtures were written, and
both are pinned by tests. A fixture row **cannot send anything**: a queue row
makes a Flow generate text and write it back, it does not make GAS act, and
the only outbound side effect in the project (`createBragDraft_()`'s
`GmailApp.createDraft()`) is reachable solely from an explicit `bragEmail`
client action. And fixtures **do not appear as usage** — they are written
straight to the sheet rather than through `queueAiJob_()`, so they never
touch the per-type counters behind Settings → AI Flow Health. The canary
takes the opposite route on purpose and therefore uses the job type `CANARY`,
deliberately absent from `AI_FLOW_TYPES`, so its traffic is recorded but
invisible in that panel.

**Documentation drift found in the same pass.**
`meta/FLOW_INVENTORY.md` was tracking a doc gap that no longer existed — it
said `LEADERHUB_AI_FLOW_SETUP.md` documented only five of the six job types,
omitting `FIN_ANALYSIS`, when that doc now covers all six including a payload
section for it. Corrected in place rather than deleted, because a tracking
note outliving the thing it tracked sends a reader looking for finished work.
Separately, the `leader-hub:app` file list was spelled out in prose in six
places across five documents and had to be corrected twice in one session as
files were added; five of those now point at
`tools/gas-lint/project-map.json`, which is what the tooling actually reads,
and `README.md` keeps the one human-readable copy.

`FlowOps.gs` is registered in `project-map.json` **and** in
`leader-hub/.claspignore`. That second one matters and is easy to miss: the
`.claspignore` here is an allowlist (`**/**` followed by explicit
un-ignores), so a new file that isn't listed is silently skipped by
`clasp push` — it would appear to deploy and simply not exist.
