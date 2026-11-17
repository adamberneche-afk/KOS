# Archive index

Superseded docs and the history logs' older entries, kept word for word
and filed by **school quarter**: the 2025-26 year, summer 2026, then
2026-27's marking periods (CCPS calendar: Q1 ends 2026-10-30, Q2
2027-01-22, Q4 2027-06-04 with the last day; Q3's end to be added). Inside
a quarter a file keeps its old path: `meta/HANDOFF_2026-10-22.md` is
`archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md`. Git history follows each
file across the moves (`git log --follow`).

**Which quarter:** a document goes by the date it was written; one with no
date goes by the date it was replaced or retired, and its index line says
so. A history log's entries go by their heading date, an undated entry by
where it stood. The live logs hold the current plan of record's era; when
the plan rolls over, the older entries move here.

**Out of everyday search:** the root `.ignore` hides `archive/` from
ripgrep (Claude Code's Grep). Open a file by path; search one quarter with
`rg <pattern> archive/2026-27-Q1/` (Grep: `path: archive/2026-27-Q1`), or
everything with `rg --no-ignore`. Git, CI, `release-check` and
`student-data-scan` still read every file.

**A record, not a guide:** each file was true when written. Links inside
it are relative to its old folder; the code it names may have changed;
where it disagrees with a live doc or the code, they win. The agent notes
from the archived handoffs are live in
[`meta/AGENT_NOTES.md`](../meta/AGENT_NOTES.md).

| Quarter | Dates | PRs | Plan of record | What it was |
|---|---|---|---|---|
| [2025-26 school year](2025-26/INDEX.md) | through 2026-05-29 | before this repo | — | LeaderHub as a single HTML file (its handoff, WIP log, README and two grading snapshots), and the RTP's cold-start orientation. |
| [Summer 2026](summer-2026/INDEX.md) | 2026-05-30 to 2026-08-23 | — | — | Planning before the school year: the RTP's current-state draft and zone spec, the Drive audit's first assumptions deep dive, and the August codebase review. |
| [2026-27, 1st quarter](2026-27-Q1/INDEX.md) | 2026-08-24 to 2026-10-30 | through about #345 | `meta/PLAN_2026-10.md` (live) | The build and launch: kos-personal's pipeline repaired and the RTP moved to a Claude Project (10-06); CAS live with students (first submissions 10-16); the dashboards, lesson parts, the nightly rollout and the turn-in plan; LeaderHub to an Apps Script web app. Most of the archive is here. |
| [2026-27, 2nd quarter (open)](2026-27-Q2/INDEX.md) | 2026-10-31 to 2027-01-22 | from about #346 | `meta/PLAN_2026-11.md` (live) | In progress. So far the handoffs of 10-31, 11-01 and 11-08; the history logs' entries from 10-29 are still live. |

**Adding to it:** `git mv <path> archive/<quarter>/<path>`, a line in that
quarter's index under its kind, and the live links and path mentions
repointed in the same PR. A new quarter gets a row here when its first
file lands.
