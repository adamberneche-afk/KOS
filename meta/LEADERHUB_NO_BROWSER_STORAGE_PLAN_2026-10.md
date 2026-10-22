# leader-hub without browser storage: plan (2026-10-22)

The operator, 2026-10-22: "I don't want anything stored in the browser."
cas-ccps and kos-personal already comply (`tests/tools/no-browser-storage.test.js`).
leader-hub is the one system still built around `localStorage`, and moving
it off is a migration rather than a fix, so it gets this plan and its own PRs.
Nothing is built yet.

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
  1. **Secrets and endpoints:** `lh_api_key` (the Gemini key) and
     `lh_email_bridge_url`.
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

### Phase 1: secrets off the browser (small, first)

- `lh_api_key` moves to a Script Property (`GEMINI_API_KEY`). AI calls go
  through the server (`lhApiCall_`), so the key never reaches the page.
- `lh_email_bridge_url` stops being needed when the app is served by
  `doGet()`: calls are same-origin (`google.script.run`). The standalone
  file's email setting goes with Phase 5.
- Settings shows "Key saved on the server" with Replace and Remove buttons,
  never the key itself.

### Phase 2: the rest of the data onto the server

- Logs with no `id`: give each entry one when it's written (a counter
  kept on the server), then add them to `LH_DATA_TABS`. Existing entries get
  ids once, at import. Phase 8 rejected timestamp-derived ids; server-issued
  ones avoid that problem.
- State and reminders: add to `LH_CONFIG_KEYS` (map-shaped, small).
  `lh_next_id` and `lh_next_slip_id` move to server counters.
- `lh_students` and `lh_scr_session_log`: decide between a data tab and a
  config key from their shape, in the PR.
- `lh_trip_draft` and the journal draft: page memory only, like cas-ccps's
  drafts, so a reload loses an unsaved draft (the same trade the operator
  accepted for kos-personal).

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
  default filters after a reload.

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

### Phase 5: the standalone file

With no browser storage, a file opened from disk can't keep anything between
sessions. Options:

- **Retire it (recommended).** The served app (`doGet()`) is the only way
  in.
- **Keep it for read-only demos.** It loads sample data into memory, and
  nothing persists.

## Decisions needed

1. **Standalone file:** retire it (recommended), or keep it as a demo.
2. **View state:** page memory, so it resets on reload (recommended); or a
   per-user config key on the server.
3. **Order:** Phase 1 alone first (secrets, small, worth doing now), or
   Phases 1–4 together once the order of work allows.

## Risks

- **Every load needs the server.** A slow Apps Script response slows the
  first render; Phase 3's loading state has to say so honestly.
- **Concurrency.** Two tabs open at once already hit compare-and-swap
  conflicts; once the server is the only copy, they will hit them more
  often. That path needs tests before Phase 3 ships.
- **Losing data in the import.** Phase 4 must import, then verify the
  server copy, and only then delete from the browser.
