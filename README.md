# KOS

Three separate systems built on the same platform pattern (Google Apps
Script and native Gemini inference, no external hosting or API keys by
default), plus the governance material that belongs to none of them. They
share this repo and its tooling, not code: `kos-personal/` is the operator's
own knowledge pipeline, `cas-ccps/` the classroom system students use, and
`leader-hub/` a student leadership hub. New files are filed into the matching
subtree, never left at the root. Why the repo exists:
`archive/2026-27-Q1/meta/PSD_Version_Controlled_CAS_Workspace.md`.

## Start here

- **New to the repo:** this page, then the README of the system you're
  working in. Each system's README is its map; its `HISTORY.md` says why
  things are the way they are.
- **The operator:** the newest `meta/HANDOFF_*.md` (where each system stands,
  what is merged but not yet live, the queue in order) and the plan it points
  to, `meta/PLAN_<month>.md`. Deploys: [`tools/clasp-sync/README.md`](./tools/clasp-sync/README.md).
- **An agent (Claude Code):** [`CLAUDE.md`](./CLAUDE.md) first: the repo map,
  the commands, and how build work arrives from the RTP's session logs. Then
  the newest handoff and its plan, and [`meta/AGENT_NOTES.md`](./meta/AGENT_NOTES.md)
  for the traps earlier sessions hit.

## [`kos-personal/`](./kos-personal/) — Knowledge Operating System v8.0

A personal AI-session knowledge pipeline: ingests one operator's AI working
sessions, extracts structured knowledge (decisions, action items, vector
weights, persona council verdicts), and routes it into a `BRAIN_TRUST_INDEX`
spreadsheet. The thinking surface (the 6-persona council, alignment
guardrails, planning) is a Claude Project since 2026-10-06
([`meta/PLAN_2026-10.md`](./meta/PLAN_2026-10.md)). The external orchestration
layer it replaced, the RTP Gem and `RTP_CORE_ROUTER` (RID-weighted routing,
a human-in-the-loop firewall), is frozen at V6.0; Gems retire for education
on 2027-06-01 (ADR-010).

**Status:** reconciled — the code, the docs, and the HTML client now agree.
Every gap the docs previously described (missing server functions,
`STUDIO_ACTIVE` turnstile gating, the shadow matrix, the daily primer, the
auto-council trigger) has been implemented, `10_Turnstile.gs` was rebuilt
against the real schema (original archived), and all `PERSONA_*` cog
docs are now filed under `rtp-core-router/`. A later reupload batch added
two backported fixes, ten governance/protocol docs, and a real optional
managed-inference-service alternative to native Studio (opt-in, off by
default; archived 2026-11-17, its switch retired 2026-11-22). Since then, nine further
rounds of dedicated UI/UX auditing (see
[`kos-personal/CHANGELOG.md`](./archive/2026-27-Q1/kos-personal/CHANGELOG.md#uiux-hardening--rounds-19))
have fixed real bugs including a race condition, an unguarded status-line
race, and a data-loss bug where Escape could wipe an in-progress wizard.
Since late September: a staging requeue, per-session vector classification,
a `VECTOR_MATRIX` repair, the RTP notebook's briefing docs and the SMP-019
moral debt counter (files `19_` to `23_`; see
[`kos-personal/README.md`](./kos-personal/README.md)).

## [`cas-ccps/`](./cas-ccps/) — Classroom Agency System (CCPS)

A district-deployed (ccpsnet.net), FERPA-scoped, student-facing platform for
a CCPS Sports/Entertainment/Event Marketing course pair (courses 8175 &
8177). Students work inside a simulated student-run "conglomerate" business
across a 10-stage, 20-unit curriculum; the software layer logs lesson intent,
runs AI evaluation of student work, converts evidence into Student
Competency Record (SCR) rating suggestions, and aggregates each student's
activity into a living context document.

**Status:** reconciled — all 7 flagged conflicts resolved, including the
most significant one: confirming Studio (not GAS) writes student feedback
into the doc, with the outlier design archived. Both confirmed bugs (a
Turn-In Form field mismatch, a `ReferenceError` in the setup wizard) are
fixed, along with a wider class of unescaped-string syntax bugs found
while verifying that fix. Module numbering is now internally consistent
across every doc in the set — including a correction, caught mid-implementation,
to the originally-approved renumbering (the Student Context Aggregator was
always correctly "Module 4"; the SCR engine moved to "Module 5," not "Module 4").
A later reupload batch closed most of the remaining Known Gaps (the two
missing data files, the `lesson_unit_id` column, and 6 of 7 missing Module
2 scripts) and resolved a second, genuine numbering collision inside
Module 2 itself. Since then, nine further rounds of dedicated UI/UX
auditing (see
[`cas-ccps/HISTORY.md`](./archive/2026-27-Q1/cas-ccps/HISTORY.md#uiux-hardening--rounds-19))
have fixed real bugs including a CRITICAL silent date-type-coercion bug
that stopped the nightly warm-up queue from ever matching a lesson, and a
double-counting bug in the warm-up readiness dashboard. See
[`cas-ccps/README.md`](./cas-ccps/README.md) (current state) and
[`cas-ccps/HISTORY.md`](./cas-ccps/HISTORY.md) (process history) for the
full record.

## [`leader-hub/`](./leader-hub/) — LeaderHub

A third, unrelated system — confirmed genuinely distinct from both of the
above during Round 3 reconciliation, not a cas-ccps companion despite
covering the same course numbers. A personal command center for one
teacher's full multi-role workload (classroom, DECA, school store,
E-Sports, field trips). Now server-backed: a single Apps Script Web App
(`leader-hub:app` — `Code.gs`, `Config.gs`, `Data.gs`, `SCR.gs`,
`EmailBridge.gs` and five smaller `.gs` files) serves the HTML front end and
holds its data in a Spreadsheet and Script Properties. Since 2026-10-22 the
server is the only copy: nothing is stored in the browser, and the page no
longer runs opened from disk (the standalone file is retired;
[`archive/2026-27-Q1/meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md`](archive/2026-27-Q1/meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md)).
See [`leader-hub/docs/jj1-server-deployed-web-app.md`](./leader-hub/docs/jj1-server-deployed-web-app.md)'s "JJ1 — Server-deployed
web app" section for the migration. It also went through the same nine
rounds of UI/UX auditing as the two systems above —
see
[`leader-hub/HISTORY.md`](./archive/2026-27-Q1/leader-hub/HISTORY.md#uiux-hardening--rounds-19)
for its record, including the most severe bug found in any round: 8
places where raw JavaScript was rendering as visible garbage text because
it sat outside any `<script>` tag, silently disabling a rating widget
since it was first added.

**The long-running OAuth-consent-dialog crash is fixed** (2026-09-28;
confirmed on `/dev`; `/exec` was released 2026-10-05 (v20) and still needs its
`?diag=probe` check). The
`Uncaught SyntaxError: Unexpected identifier 'style'` came from Apps
Script stripping the build's `//# sourceURL=` comments along with their
closing tags. A second fault followed: the split script's load order. Separately,
the page's server sync had never worked, because every browser call
targeted a private `_` function. Read
[`leader-hub/docs/oauth-crash-and-diagnostics.md`](./leader-hub/docs/oauth-crash-and-diagnostics.md#fixed--the-oauth-consent-dialog-crash-2026-09-28)'s "Fixed — the
OAuth-consent-dialog crash" section **before** touching
`tools/leaderhub-build/` or how the page is served; the full
investigation is in `leader-hub/HISTORY.md`.

## [`drive-curation/`](./drive-curation/) — filed for reference, not a system

Personal Google Drive housekeeping/audit material, plus curriculum
content for a different, unrelated course ("Marketing Exploration," not
cas-ccps's 8175/8177 pair). Explicitly **not** part of either software
system — filed here at the user's request so nothing uploaded is lost,
clearly labeled to prevent future confusion. See
[`drive-curation/README.md`](./drive-curation/README.md).

## [`meta/`](./meta/) — cross-cutting design docs

Governance/design material that spans systems, including the actual
Product Specification Document proposing this repo's git-based structure
in the first place. See [`meta/README.md`](./meta/README.md).

## [`archive/`](./archive/INDEX.md) — superseded docs, kept as records

Old handoffs, finished plans, sprints and audits, replaced versions, and
the history logs' older entries, filed by school quarter (2025-26, summer
2026, then 2026-27's marking periods) and kept word for word at their old
paths inside each quarter: `archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md` is
`archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md`.
[`archive/INDEX.md`](./archive/INDEX.md) has one row per quarter (dates,
PRs, plans, what it was about) and links each quarter's own index. The
root `.ignore` keeps the archive out of everyday searches (ripgrep, and so
Claude Code's Grep); find things with `node tools/archive/search.js`
(below), or open a file by path. Git, CI and the release and
student-data scans still read them.

## [`tools/`](./tools/README.md) — checks, generators, the clasp bridge

One line each; [`tools/README.md`](./tools/README.md) has the detail.

- `tools/gas-lint/`: static checks for the GAS systems
- `tools/flow-harness-sync/`: cross-project sync, from the one copy in [`shared/`](./shared/) (the plausibility phrases; the deploy-version report every Apps Script project sends)
- `tools/coverage-gaps/`: scheduled functions with zero test coverage
- `tools/doc-currency/`: checks the docs against the code
- `tools/clasp-sync/`: bridges cas-ccps to clasp
- `tools/student-data-scan/`: finds student data, says where but not what
- `tools/release-check/`: what must not ship: Drive IDs, exports, LICENSE, secrets
- `tools/archive/`: the archive's catalog, indexes and search
- `tools/setup-guide/`: the CAS setup guide's reference, from the code
- `tools/watchdog/`: scheduled-job watchdog
- `tools/deploy-drift/`: is what's live actually what git expects?
- `tools/leaderhub-build/`: assembles `student-leader-hub.html`
- `tools/cas-ccps/`, `tools/kos-personal/`, `tools/leader-hub/`: generators
- `tools/notebook-codebase/`: the repo as Gemini notebook sources
- `tools/notebook-context/`: the "KOS Context" notebook
- `tools/html-lint/`: inline `<script>` syntax check

## [`tests/`](./tests/README.md) — regression coverage

`npm test` runs every suite (`node --test` over `tests/leaderhub`, `tests/tools`,
`tests/cas-ccps`, `tests/kos-personal`) against a sandbox of the Apps Script
services ([`tests/harness/gas-sandbox.js`](./tests/harness/gas-sandbox.js)).
What each file covers: [`tests/README.md`](./tests/README.md).

## CI

`.github/workflows/gas-lint.yml` runs the tests and every check above on each
pull request; `npm run check` runs the same steps locally (`npm run check:fast`
without the tests). The checks copied from the Mothership hub's CI floor
(doc-link-check, doc-placeholder-check, secrets-doctor) and how the hub reads
this repo: [`meta/CI_FLOOR.md`](./meta/CI_FLOOR.md).
