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
