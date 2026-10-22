# leader-hub without browser storage: plan (2026-10-22)

The operator, 2026-10-22: "I don't want anything stored in the browser."
cas-ccps and kos-personal already comply (`tests/tools/no-browser-storage.test.js`).
leader-hub is the one system still built around `localStorage`, and moving
it off is a migration rather than a fix, so it gets this plan and its own PRs.
All five phases are done (2026-10-22).

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

### Phase 3: one load, server first (done 2026-10-22)

- **The page arrives with the server's data.** `doGet()` (Code.gs) reads
  every config key, data domain and the SCR scores in one pass
  (`lhBootData_`, Data.gs) and writes them into the page before the app's
  scripts run (`window.__LH_BOOT__`, `lhInjectBootData_`). The app keeps
  them in page memory (`_lhStore`). This replaces the planned loading state:
  every `let x = LS.get(...)` already starts from the server's copy, with
  no wait after the page appears and no browser storage read.
- `LS.get` and `LS.set` kept their names, so the roughly 300 call sites
  didn't change. `get` reads page memory; `set` updates it and pushes.
- **A failed save** stays in page memory and shows a red "N changes not
  saved yet — retrying" bar with **Retry now**, retried every 30 seconds.
  Leaving the page asks first while anything is unsaved. A failed SCR
  batch is queued again rather than dropped.
- **A conflict is merged at once,** not left for the next load (nothing on
  the device would survive a reload): the server's records plus this
  page's, by id, this page's edit winning, pushed against the server's
  version, with a "Merged with changes from another device" note. This
  replaces "ask which copy to keep": `_lhMergeById_` already never drops an
  edit, and a dialog on every background save would be noise.
- **If the server's data can't be read,** the page says so in the red bar
  and refuses every save, so it can't start empty and overwrite the server.
- View state is page memory (Phase 2).
- **Opened as a file from disk** there is no server, so `_lhStore` is still
  `localStorage` there until Phase 5.

### Phase 4: move existing data, then remove browser storage (done 2026-10-22)

- **The served app: done with Phase 3** (`lhMigrateFromBrowser_`, src/05).
  On load, each `lh_*` key an earlier version left in that browser is
  handled without asking: one the server lacks, or that wasn't finished
  saving (its `lh_sync_pending`), goes into page memory and is pushed, and
  is deleted from the browser once the server accepts it. One the server
  already has is deleted at once. The id counters take the larger value.
  Nothing is deleted before the server holds it.
- **The standalone file: done (2026-10-22).** Opened from disk with data in
  it, the file shows a banner: **Export everything**, then **Settings →
  Import** in the web app (with an **Open the web app** link when the
  Email Bridge URL, this same project's web app, is set). Served, an import
  adds to the server's copy (`lhImportIntoServer_`): records merge by id,
  the imported copy winning; counters take the larger value; SCR cells are
  queued one by one; drafts and bookkeeping are skipped. It never replaces
  what the web app has. After the export, **Clear this browser's copy**
  (with a confirm) deletes the file's data and marks the move
  (`lh_moved_to_web_app`), so the banner doesn't return.
- **Backups.** The "Export a backup" button writes a file download, not
  browser storage; served, it exports the server's copy.
- **Enforcement.** `tests/leaderhub/no-browser-storage.test.js` checks the
  served mode: nothing written to the browser, the move, the bar, the
  merge, and no save when the data couldn't load.

### Phase 5: retire the standalone file (done 2026-10-22)

- **The app runs only as the web app.** The first script in `<head>`
  (src/00) checks for `window.__LH_BOOT__`; without it (the file opened from
  disk) it calls `window.stop()` and shows a short page: "LeaderHub now runs
  as a web app", **Open the web app** (from the old Email Bridge URL, when a
  safe `script.google.com` one is left), and, if that browser still holds
  data, **Export everything** and then **Clear this browser's copy**. The
  export is the same format **Settings → Import** reads. `?diag=probe`
  gets the boot data too, so it still runs the app.
- **Removed:** the local-storage branch of `_lhStore`, the boot catch-up
  functions (`lhRefreshConfigFromServer_` and the data and SCR ones), the
  Email Bridge URL field and `setEmailBridgeUrl()`/`clearEmailBridgeUrl()`,
  `callGAS()`'s and Organization Sync's browser `fetch()` paths, Phase 4's
  in-app move banner (now the retired page), and the unused public
  `lhGetScrScores` entry point (the boot data carries the scores).
- The web app's own URL, which Organization Sync's share codes carry, comes
  from the server (`lhBootData_`'s `appUrl`).
- **What still touches browser storage:** only `lhMigrateFromBrowser_` in
  the web app (an earlier version's leftovers, moved then deleted) and the
  retired page (reading and clearing the file's leftovers).

## Decisions (2026-10-22)

1. **Standalone file:** retired (Phase 5, done).
2. **View state:** resets on reload (page memory).
3. **Order:** Phases 1–5 in order, each its own PR (all done 2026-10-22).

## Risks

- **Every load needs the server.** A slow Apps Script response slows the
  first render; Phase 3's loading state has to say so honestly.
- **Concurrency.** Two tabs open at once already hit compare-and-swap
  conflicts; once the server is the only copy, they will hit them more
  often. That path needs tests before Phase 3 ships.
- **Losing data in the import.** Phase 4 must import, then verify the
  server copy, and only then delete from the browser.
