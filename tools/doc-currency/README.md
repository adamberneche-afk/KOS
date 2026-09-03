# doc-currency

Catches documentation claims that have stopped being true.

```bash
node tools/doc-currency/check.js            # human-readable report
node tools/doc-currency/check.js --json     # machine-readable report
```

Exit code is 1 if any error-level finding exists, 0 otherwise. Warnings
don't fail the run.

## Why this exists

This repo has now run two full documentation-currency sweeps in as many
sessions. The first one fixed a comparable batch of stale claims and still
left behind:

- a deployment guide instructing operators to run `runPhase0Migration()`
  and `runPhase0Verify()`, neither of which exists anywhere in the repo;
- a directory README whose opening paragraph was false in three separate
  clauses;
- a live teacher-facing dialog promising an action couldn't be undone, two
  menu items above the button that undoes it;
- a source-file banner naming a function that the *same commit* renamed.

Nothing in the repo noticed any of it, because nothing was looking. Drift
was only ever found by a person being asked to go and find it.

The existing `docs-check` CI job doesn't close this. It is PR-only, it asks
whether a README was *touched*, and it has a `[skip-docs-check]` escape
hatch. That is a question about diffs, not about truth — **every finding
above passed it.**

## What it checks

| # | Check | Level |
|---|---|---|
| 1 | `documented-function-missing` — a doc names a backticked function that is declared nowhere in the repo's source | error |
| 2 | `stale-test-count` — a doc cites "N passing" and `npm test` reports a different N | error |
| 3 | `documented-key-not-in-code` — a doc claiming to be a complete key registry lists a key no source file mentions | warning |
| 4 | `citation-past-eof` — a doc cites `file:line` beyond the end of that file | warning |
| 5 | `blocked-surface-presented-as-live` — a declared behavior doc names a `live-blocked` GCP surface without acknowledging the status or naming the fallback | error |
| — | `documented-function-unverifiable` — as (1), but in a doc that describes an Apps Script project never committed here | warning |
| — | `blocked-surface-fallback-unnamed` — as (5), but the doc does say it is blocked and never says what replaced it | warning |
| — | `blocked-surface-undeclared-tokens` — a `live-blocked` surface in `gcp-map.json` has no `doc_tokens`, so no doc is checked against it | warning |
| — | `blocked-surface-doc-missing` — `blockedSurfaceDocs` names a file that does not exist | warning |

Check 2 measures by running the repo's own `npm test` and reading the TAP
plan line. If it can't measure — no `node_modules`, a genuinely failing
suite — it reports that it couldn't and reports nothing about the
citations. A checker that guesses a number and then "corrects" the docs to
match it is worse than one that abstains.

### Check 5, and why it is declared on both sides

Checks 1-4 all verify that a documented thing **exists**. Nothing verified
that a documented path can **run**, and on the account this repo deploys to
many cannot: a custom Studio step is a Workspace Add-on and needs a standard,
non-default Cloud project, and GCP is disabled org-wide for `ccpsnet.net`.
Every function those instructions named existed. The instructions were still
impossible to follow. Three documents carried them for weeks —
`kos-personal/STUDIO_INTEGRATION_SPEC.md` telling a Flow builder to write the
document body and set `FLOW_COMPLETE` from Studio (the half that moved into
Apps Script), `IMPACT_DASHBOARD.html`'s "Built, Not Deployed" badges, and
three separate docs describing Flows 2-5 as waiting on a push. All three were
found by reading, not by tooling.

`gas-lint`'s Check G already requires every GCP surface to be **declared**
with a status. This check reads those declarations back and holds the *prose*
to them.

Two declarations, in two places, each for a reason:

- **`gcp-map.json`'s `doc_tokens`** per blocked surface: `mentions` (the
  strings a doc uses when it means this surface) and `fallback` (the strings
  that name what replaced it). Nothing can infer that `37_FlowInputBuilder`
  answers `cas-ccps/studio-steps`, and the tokens belong beside the status
  they describe rather than in this tool's config.
- **`config.json`'s `blockedSurfaceDocs`**: which documents make behavioral
  claims. This follows `keyRegistryDocs` (Check 3's idiom) for a measured
  reason — run repo-wide, this check reports 12 findings and 8 are layout
  inventories ("kos-personal has 2 clasp projects", a table of step files)
  that are true whatever the surface's status. A check at that signal ratio
  gets muted, and a muted check is worse than an absent one.

A mention passes if its **enclosing paragraph** either acknowledges the block
(`blockedMarkers`) or names the fallback. A file-level banner covers mentions
*below* it — the guard matters: without it a document shorter than
`bannerScanLines` is entirely "banner," so one marker word anywhere in it
launders every mention. Paragraph scope rather than a line window is the same
lesson this tool already paid for once (see Exclusions below).

Its first run reported 8 errors and 3 warnings across 7 documents, including
the FERPA data map naming a blocked custom step as the live writer of
`CompetencyEvidence`, and two docs that said a port "has to" happen after it
was done.

## What it does NOT check

**Prose accuracy still needs a human.** A paragraph that is fluent,
well-cited, internally consistent and completely wrong will pass every
check here. Of the five highest-consequence findings in the sweep that
motivated this tool, only two — the two phantom functions — are of a shape
this tool can see. The false `leader-hub/README.md` opening paragraph, the
teacher-facing dialog, and the FERPA check-count all needed someone to read
the prose against the code.

It also doesn't check: whether a documented behaviour matches what the code
does; whether a screenshot, menu label or emoji is current; whether a count
of anything other than tests is right; whether a doc omits something it
should cover. Completeness is the failure mode this tool is worst at — it
can tell you a documented thing is gone, never that an undocumented thing
exists.

## Exclusions, and why each one is load-bearing

Every exclusion in `config.json` exists because without it the tool's first
act is to report documentation that is doing its job correctly.

- **Dated records are skipped wholesale** (`CHANGELOG.md`, `HISTORY.md`,
  `LEADERHUB_WIP.md`). Naming a deleted function is exactly what a
  changelog is for; Round 14's entry exists *in order to* record that
  `triggerCouncilSimulation()` was removed. Flagging it would be flagging
  the record for being a record.
- **Historical framing near a mention is respected**, scoped to the
  enclosing paragraph. All eleven surviving mentions of
  `triggerCouncilSimulation()` in this repo are either in a dated record or
  adjacent to "deleted"/"removed"/"superseded" language, and every one of
  them is correct prose.
- **A file-level `⚠ SUPERSEDED` / `⚠ OUTDATED` banner covers the whole
  document.** `LEADERHUB_README.md`'s third line already says `callAI()`
  "neither exists in the code anymore"; without this the tool reports that
  finding back at the document that states it, twenty times over.
- **Registry rows marked `Aspirational` or `Legacy` are treated as
  acknowledged.** Prototyped against the live repo: of 70 ALL-CAPS keys in
  `SCHEMA_REFERENCE.md` exactly 3 were dead, and all 3 were already
  labelled. Without this exclusion the tool's entire output is a complaint
  about the three rows that are documented correctly.
- **Docs describing out-of-repo Apps Script report as unverifiable, not
  missing.** `processInbox()`, `auditInbox()` and `syncCalendar()` live in
  the operator's Script editor and were never committed here. Saying "this
  function does not exist" would be asserting something the tool doesn't
  know. Committing those scripts would let those docs graduate off
  `externalSurfaceDocs` in `config.json`.

## Relationship to gas-lint

`doc-currency` requires `tools/gas-lint/check.js` for
`stripCommentsAndStrings()`, `lineAt()` and its platform-globals
`ALLOWLIST`, rather than reimplementing them. That reuse is not incidental
tidiness — the first version of this tool hand-rolled its own stripper, and
because that copy had no regex-literal handling, the first
`/IDENTITY_KEY\s*[:=]\s*['"].+['"]/` it met desynced the parse for the rest
of the file and the tool reported **82 missing functions, nearly all of
which exist.** One implementation, tested once, is the point.

The two tools stay separate: gas-lint is about Apps Script correctness and
should keep failing loudly on that alone.

## Tests

`tests/tools/doc-currency-check.test.js`, run by `npm test`. It pins the
pure functions rather than the checks themselves — the checks read the whole
repo, so testing them directly would mean a suite that fails whenever a doc
legitimately changes. Three bugs this tool has shipped with live in those
pure functions, each verified by reverting its fix and confirming the test
fails: the stripper desync; a historical-marker window loose enough that
"only creates what doesn't exist" suppressed a real finding three lines
away; and a test-count regex that couldn't cross a markdown blockquote
line-wrap — `meta/CODEBASE_REVIEW.md` once carried a stale count split
across a `>` continuation ("...gas-sandbox.js\` — 346\n> passing tests..."),
which `\s+` could not bridge. `normalizeBlockquotes()` fixes this by
replacing a leading `>` with a same-length blank before matching, so the
paragraph reads as the one logical line it renders as.
