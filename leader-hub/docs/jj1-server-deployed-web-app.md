# JJ1 — Server-deployed web app: leader-hub becomes a real Apps Script deployment

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

Closes the gap a "handoff doc" one session assumed was already true —
`EmailBridge.gs` being deployed was mistaken for the whole app being
deployed, when in fact `student-leader-hub.html` had no server behind it
at all and `EmailBridge.gs` had zero `HtmlService` code, so its `/exec`
URL could never have shown the hub UI regardless of configuration. This
round makes leader-hub genuinely operate the way `cas-ccps/teacher-
dashboard` does: a real Apps Script Web App reachable at a `/exec` URL,
sign-in-gated to one owner, with most data domains synced to a private
Spreadsheet — while `student-leader-hub.html` kept working as a fully
local, no-network file. (That was the plan when this round shipped; the
local file was retired 2026-10-22, and the web app is now the only way
LeaderHub runs. See "Where the data lives" above.)

**New files, one merged Apps Script project** (not two): `Code.gs`
(`doGet()` serves the hub UI via `HtmlService.createHtmlOutputFromFile()`
— zero changes needed to `student-leader-hub.html` or
`tools/leaderhub-build/build.js` to make that work, since the build
already produces one complete, valid, standalone document), `Config.gs`
(singleton settings-object domains → Script Properties), `Data.gs`
(growing record-list domains with a real `id` field → a private
"LeaderHub Data" Spreadsheet, one tab per domain), `SCR.gs` (grading
scores — a different shape from everything else, see below).
`EmailBridge.gs` is unchanged in behavior; its `doPost()` JSON API still
answers external callers directly, and its action dispatch
(`_lhDispatchAction_()`) is now shared with the same-origin
`google.script.run` path the deployed app's own client uses instead of
`fetch()`.

**Auth**: a single owner, fail-closed, matching
`_isAuthorizedTeacher_()`'s shape in `cas-ccps/scripts/00_SharedConfig.js` — a new
`OWNER_EMAIL` Script Property compared against
`Session.getActiveUser().getEmail()`. leader-hub has no second legitimate
viewer role the way teacher-dashboard has a student "My Context" view, so
there's nothing to branch `doGet()` toward besides "the owner" or "not
authorized." A colleague forking this repo deploys their own copy with
their own `OWNER_EMAIL` — no multi-tenant logic needed, matching how
Organization Sync already treats a co-advisor as a second, wholly
separate deployment.

**Two sync mechanisms, chosen per domain's actual shape** (not per the
original plan's guess — several domains turned out map-shaped rather than
row-shaped once actually read, and were placed accordingly):

- **`Config.gs`** — a JSON-stringified Script Property per key, namespaced
  `LH_CONFIG__<key>`. For small, singleton, or map-shaped domains: Profile,
  Modules, Schedule Config, Key Contacts, Custom Organizations/Courses,
  AI Privacy student-ID map, cas-ccps bridge config, Sub Plan
  settings/period assignments, SBE checklist, DECA Season/Approvals, Field
  Trip Permission overrides, Conference Leave, E-Sports checklists,
  Observation Prep, Synergy tracker, Sub-plan student notes, Permission
  Slips (`slipRosters`, keyed by tripId), DECA/generic Org Results (keyed
  by orgId), Course Catalog pacing imports/delivery notes, SCR
  student-email link, Receiving Status (keyed by PO id), the Horizon
  system's own `{short,mid,long}` buckets, and Lesson Plan content edits.
- **`Data.gs`** — one private Spreadsheet ("LeaderHub Data"), one real tab
  per domain, each record pushed/pulled as a `[Id, RecordJSON]` row rather
  than a fixed column-per-field schema (deliberate — this domain list
  spans records as different as a ~50-field trip with a nested `ap`
  approvals object and a 6-field DECA result; schema-agnostic rows mean a
  field added to a record's own object literal never needs a matching
  server change). Covers Trips, Trip Archive, DECA Results, WBL roster,
  Store inventory/sales/purchase-orders, E-Sports roster/matches, Goals,
  Events, Tasks, Deadlines, Journal History, Observation History, and Brag
  Board manual wins. Conflict model: optimistic concurrency
  (compare-and-swap on an `UpdatedAt` meta row per domain), same shape
  Organization Sync already proved out — a stale push is rejected with
  `{conflict:true}` and writes nothing.

**Not migrated, on purpose** (updated 2026-10-22, no browser storage
Phase 2, `archive/2026-27-Q1/meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md`):
- **Organization Sync stays opt-in.** The "Share with a co-advisor"
  spreadsheet is reachable by whoever holds its share code, so nothing is
  published there automatically. The member roster (`lh_students`) now
  syncs like every other student-data domain, to the private,
  `OWNER_EMAIL`-gated "LeaderHub Data" spreadsheet (`members` tab), not to
  Organization Sync.
- **Drafts and view state live in page memory**, never in the browser
  (`LH_PAGE_MEMORY_KEYS`, `src/05`): the trip and journal drafts, the last
  view, filters, open tabs and the cached CAS pacing units. A reload opens
  on the dashboard and loses an unsaved draft.
- **The id-less logs now sync** (`lh_daily_log`, `lh_sub_plan_log`,
  `lh_brag_log`, `lh_wbl_hours_log`, `lh_scr_session_log`): each entry gets
  a random id as it is saved (`_lhWithLogIds_`), so two entries made in the
  same millisecond stay two. The reminder dates, journal state, id counters
  (merged by the larger value), Organization Sync bookkeeping and snoozed
  cards are config keys.
- **Served, nothing is in the browser** (Phase 3, 2026-10-22): `doGet()`
  writes the server's data into the page (`lhBootData_`), the app keeps it
  in page memory (`_lhStore`) and saves every change to the server. A save
  that fails shows a red "not saved yet" bar that retries; leaving the page
  asks first; a conflict is merged by id at once. What an earlier version
  left in the browser moves to the server on the first load, then is
  deleted there (`lhMigrateFromBrowser_`).
- **The standalone file is retired** (Phase 5, 2026-10-22). LeaderHub runs
  only as the web app. Opened from disk, the page stops and says so
  (src/00's guard), with an **Export everything** of whatever an earlier
  version left in that browser and **Clear this browser's copy** after it;
  Settings → Your Data → **⬆️ Import Backup** in the web app adds that export to the server's
  copy rather than replacing it. The Email Bridge URL setting, `callGAS()`'s
  and Organization Sync's browser `fetch()` paths and the boot catch-up
  calls are gone; the web app's own URL comes from the server
  (`lhBootData_`'s `appUrl`). `lh_inventory_transactions` is read in one
  place and never written.
- `tests/leaderhub/no-browser-storage.test.js` fails if a new `lh_*` key is
  not on the server, in page memory or a named exception.

**SCR grading scores get a third, dedicated shape** (`SCR.gs`), because
`scrScores` is a sparse course × period × student × competency matrix
that can span thousands of cells and is edited one cell at a time, very
fast, during a live grading pass — orders of magnitude past a Script
Property's ~9KB limit if pushed whole, and a wholesale-tab-rewrite per
click would both be slow and rewrite the entire gradebook for a one-cell
change. Instead: one real row per `(Course, Period, StudentKey,
CompetencyNum)` cell, upserted by that composite key, with the client
debouncing and batching changes (2s pause, or the batch's final value if
the same cell changes again before flushing) into one call instead of one
round trip per click. Conflict model is per-cell last-write-wins — the
same granularity editing one Sheet cell from two tabs would already give
— deliberately simpler than `Data.gs`'s whole-domain compare-and-swap.
`lhGetScrScores_()`'s `found:false` (this deployment has never had a
score pushed) vs. `found:true` with an empty result (synced, then
cleared) is what protected a fresh deployment's first pull from wiping out
a teacher's real, already-graded local scores. (Today the scores arrive
with the boot data, and any left in an earlier version's browser storage
are pushed once by `lhMigrateFromBrowser_`.)

**ID generation stays client-side.** Every record already carries its own
`id` (`Date.now()`, an incrementing counter, or a seed value) from
existing, untouched client code. `Data.gs` never mints or rewrites one —
a same-id collision from two browser tabs surfaces as a rejected
compare-and-swap push (safe, caught) rather than silent corruption, so
server-side id generation would add real complexity to close a gap that's
already closed by the conflict model.

**One-time-setup for a fresh deployment**: `clasp push`, then Deploy →
New deployment → Web App (Execute as: Me, Access: Anyone in your domain —
same access `EmailBridge.gs` already needed), then Project Settings →
Script Properties → add `OWNER_EMAIL` (the deploying Google account).
Until that property is set, `doGet()` fails closed for everyone,
including the person who deployed it, by design.

Verified with `node --check` on every `.gs` file, `node
tools/gas-lint/check.js` (0 errors — Check D now also verifies every
`google.script.run.*` call from the assembled HTML resolves to a real
server function, and Check E confirms OAuth scope coverage across all
five `.gs` files that existed at that round — the project has grown since;
`tools/gas-lint/project-map.json` has the current list. A live run today
also reports 5 warnings, none in leader-hub's own files — 1
dynamic-dispatch heuristic gap in kos-personal and 3 possibly-undefined
false positives in cas-ccps, all pre-existing and already named in each
project's own docs; see the "clean except N pre-existing warnings" note
on earlier entries above, which this repo's own KOS Audit Docket II
flagged as having drifted out of sync with a live run — corrected here
rather than left to keep drifting), `node tools/leaderhub-build/build.js --check`, and a
Node-VM-sandboxed test per new server file (`tests/leaderhub/config-sync
.test.js`, `data-sync.test.js`, `scr-sync.test.js`, extending
`tests/harness/gas-sandbox.js` with a `LockService` mock for `SCR.gs`) —
round-trips, conflict rejection writing nothing, ragged-row/malformed
handling, unknown-key/domain rejection, and (config/data) a guardrail
test that fails if the client's and server's whitelists of synced keys
ever drift apart. All existing tests continue passing unchanged.
