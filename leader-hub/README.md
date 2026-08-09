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
client-side: opens as a local HTML file, all state in `localStorage`, AI
calls go directly from the browser to the Gemini API with a
user-supplied key — no server, no build step, no relation to either other
system's "no API keys on any user-facing surface" architecture (that
constraint is specific to kos-personal/cas-ccps; this tool was never
built to it).

## Layout

| Path | Contents |
|---|---|
| `student-leader-hub.html` | The live app (15,148 lines) — open directly in a browser |
| `student-leader-hub.jsx` | A React/JSX exploration draft, not the deployed artifact |
| `EmailBridge.gs` | Optional companion Apps Script (Gmail → Sheet → app polling) — see `LEADERHUB_EMAIL_SETUP.md` |
| `LEADERHUB_*.md` | Project reference docs (README, principles, handoff notes, WIP, Gem prompt, email setup) |
| `LH_0*.md` | Numbered reference docs — naming conventions, integration guide, Canvas ideas, email audit, and 3 grading/pacing structure iterations (`LH_04_GRADING_STRUCTURE.md`, `LH_05_GRADING_STRUCTURE.md`, `LH_05_PACING_AND_GRADING.md` — successive dated drafts of the same working document, not conflicting versions to reconcile; kept as-is per this tool's own iterative working style) |
| `drive-tools/` | Later, **not-yet-executed** Drive-cleanup tooling (`LH_DriveDocSplitter.gs`, `LH_8177_Rename.gs`, `LH_AppManifestUpdater.py`) for splitting/renaming 8177 lesson docs |
| `archived/studentleaderhub_EARLY_PROTOTYPE.html` | A much earlier prototype (2,155 lines, 8 views, no DECA/WBL/E-Sports/trips modules, no Gemini integration) — genuinely different from the live app, not a duplicate, kept for history |

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
