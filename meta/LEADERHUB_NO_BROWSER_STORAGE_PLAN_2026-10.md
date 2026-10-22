# leader-hub without browser storage: plan (2026-10-22)

The operator, 2026-10-22: "I don't want anything stored in the browser."
cas-ccps and kos-personal already comply (`tests/tools/no-browser-storage.test.js`).
leader-hub is the one system still built around `localStorage`, and moving
it off is a migration rather than a fix, so it gets this plan and its own PRs.
Phases 1 and 2 are done (2026-10-22); the rest is decided, not built.

## Where leader-hub is today

- **The browser is the primary store.** `LS.get`/`LS.set`
  (`src/05-data-helpers-dashboard.html`) read and write `localStorage` under
  about 98 `lh_*` keys. `LEADERHUB_README.md`'s "No server, no backend"
  design decision is still the stated rule.
- **Most domains already write through to the server.** The earlier
  server-migration phases (1–8) added:
  - `Code.gs`: `doGet()` serves the app to `OWNER_EMAIL` only.
  - `Config.gs`: 31 map-shaped keys (`LH_CONFIG_KEYS`), stored as Script
    Properties.
  - `Data.gs`: row-shaped domains (`LH_DATA_TABS`: trips, archive, DECA
    results, WBL roster, store inventory/sales/POs, esports, goals, events,
    tasks, deadlines, journal entries, observation history, brag wins) in a
    private "LeaderHub Data" spreadsheet, with compare-and-swap conflicts.
  - `SCR.gs`: SCR scores in their own long-format tab.

  Each write still lands in `localStorage` first. The server copy is a
  write-through, and a failed push leaves the edit only in the browser.
- **About 50 keys are local-only.** Measured from the source on 2026-10-22,
  they fall into four groups:
  1. **Endpoints:** `lh_email_bridge_url`, needed only by the standalone
     file (the served app calls the server directly). The Gemini key,
     `lh_api_key`, is no longer in the code: AI moved to Workspace Flows
     earlier, and `LEADERHUB_README.md` (superseded) is the only place that
     still describes it.
  2. **Logs with no `id`:** `lh_daily_log`, `lh_sub_plan_log`,
     `lh_brag_log`, `lh_wbl_hours_log` and `lh_inventory_transactions`.
     Phase 8 left these local on purpose.
  3. **State and reminders:**
     - Journal: `lh_journal_*` and `lh_cron_*`.
     - Reminders: `lh_*_done_date`, `lh_*_reminder_date` and the
       `lh_*_banner_date` keys.
     - Other state: `lh_snoozed`, `lh_trip_draft`, `lh_next_id`,
       `lh_next_slip_id`, `lh_students`, `lh_scr_session_log`,
       `lh_org_sync`, `lh_sync_pending`, `lh_last_backup`,
       `lh_first_use_date`.
  4. **View state:** `lh_last_view`, `lh_lp_filter`, `lh_unit_expanded`,
     `lh_scr_active_*`, `lh_scr_view_mode`, `lh_brag_last_tab`,
     `lh_active_org`, `lh_notify_enabled`.
- **The standalone file.** `student-leader-hub.html` also runs opened
  straight from disk, with no server. There, `localStorage` is its only
  store.

## Target

The server is the only store. The page keeps an in-memory copy, loaded at
boot from `lhGetAllConfig_()` and the data reads, and every change is
written to the server. `localStorage`, `sessionStorage` and IndexedDB are
not used, and a test enforces that, as it does for the other two projects.

## Phases

### Phase 1: secrets off the browser (done 2026-10-22)

- No code reads or writes a Gemini key; AI runs in Workspace Flows with
  the account's own Gemini access. A browser can still hold `lh_api_key`
  from before that change, so the app now deletes it at every load
  (`LH_RETIRED_SECRET_KEYS`, `src/05`), and a test checks nothing else
  names it.
- `lh_email_bridge_url` is not a secret (a web app URL behind the owner
  check), and only the standalone file uses it. It goes with the
  standalone file in Phase 5.

### Phase 2: the rest of the data onto the server (done 2026-10-22)

- **Logs with no `id`** (`lh_daily_log`, `lh_sub_plan_log`, `lh_brag_log`,
  `lh_wbl_hours_log`, `lh_scr_session_log`) are data domains now. Each entry
  gets an id as it is saved (`_lhWithLogIds_` in `LS.set`): random, not a
  server counter, because a counter would need a round trip before every
  save, and random ids already avoid Phase 8's worry (two entries in the
  same millisecond stay two). Existing entries get theirs on their next
  save or the first load's push.
- **The member roster** (`lh_students`) is the `members` data domain. Its
  records already had ids. It goes to the private, owner-only "LeaderHub
  Data" spreadsheet, like the WBL roster, not to Organization Sync.
- **Small state is config keys:** the reminder dates, the journal's last
  entry and cron state, `lh_org_sync`, `lh_org_welcome_seen`, `lh_snoozed`,
  `lh_notify_enabled`, `lh_first_use_date`, `lh_last_backup` and the id
  counters. `lh_next_id` and `lh_next_slip_id` merge at load by the larger
  value per counter, and a browser that was ahead pushes its value back.
- **Drafts, view state and the cached CAS pacing units are page memory**
  (`LH_PAGE_MEMORY_KEYS`). `LS` never writes them to the browser, and
  copies left from before are removed at load.
- **Seeding.** A key or domain the server has never had is pushed once from
  this browser at load, so data kept only in the served app's browser moves
  to the server on the first load after the push. Data in the standalone
  file's storage still needs Phase 4's import.
- **Enforced** by `tests/leaderhub/no-browser-storage.test.js`: every `lh_*`
  key in `src/` is on the server, in page memory or a named exception
  (sync bookkeeping, Phase 3; the Email Bridge URL, Phase 5; the retired
  key; two keys that are read but never written).
- **What is still in the browser:** the served app still keeps its copy in
  `localStorage` and writes through to the server; Phase 3 makes the server
  the only copy.

### Phase 3: one load, server first

- At boot, read everything from the server into memory before the first
  render, with a loading state. No `localStorage` read.
- `LS.get` and `LS.set` keep their names, so the roughly 300 call sites
  don't change. `get` reads memory; `set` updates memory and pushes.
- **A failed push** keeps the change in memory and shows a "Not saved yet —
  retrying" bar with Retry. Leaving the page warns while anything is unsaved.
  A conflict (compare-and-swap) shows what changed elsewhere and asks which
  copy to keep. It never overwrites silently.
- View state (group 4) is page memory: the app opens on the dashboard with
  default filters after a reload (decided 2026-10-22).

### Phase 4: move existing data, then remove browser storage

- **A one-time import.** On first load after Phase 3, any `lh_*` key still
  in this browser's `localStorage` that the server doesn't have is offered
  as an import ("Found data saved in this browser: N items. Move it to your
  account?"). After a successful import, those keys are deleted from
  `localStorage`. Ids clash the same way two tabs would, so it uses the
  same compare-and-swap path.
- **Backups.** The "Export a backup" button writes a file download, not
  browser storage, and stays as the offline copy.
- **Enforcement.** `tests/tools/no-browser-storage.test.js` gains
  `leader-hub/`, and `LEADERHUB_README.md`'s storage section and design
  decisions are rewritten.

### Phase 5: retire the standalone file (decided 2026-10-22)

With no browser storage, a file opened from disk can't keep anything
between sessions, so the served app (`doGet()`) becomes the only way in.
This waits for Phase 4: a file opened from disk keeps its data in that
file's own browser storage, which the served app can't read. Retiring it
first would strand that data. So, in order:

1. The file shows "Export everything" and points to the web app link.
2. The served app imports that export through Phase 4's import.
3. The file then opens to a short page that points to the web app.
4. `lh_email_bridge_url`, `setEmailBridgeUrl()` and `callGAS()`'s `fetch()`
   path are removed.

## Decisions (2026-10-22)

1. **Standalone file:** retired, after its data can be imported (Phase 5).
2. **View state:** resets on reload (page memory).
3. **Order:** Phase 1 now (done); Phases 2–5 in order as their own PRs.

## Risks

- **Every load needs the server.** A slow Apps Script response slows the
  first render; Phase 3's loading state has to say so honestly.
- **Concurrency.** Two tabs open at once already hit compare-and-swap
  conflicts; once the server is the only copy, they will hit them more
  often. That path needs tests before Phase 3 ships.
- **Losing data in the import.** Phase 4 must import, then verify the
  server copy, and only then delete from the browser.
