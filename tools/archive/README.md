# tools/archive — the archive's catalog, indexes and search

`archive/` holds superseded docs and the history logs' older entries,
word for word, filed by school quarter (`archive/<quarter>/<old path>`).
This folder keeps it findable as it grows, without anyone reading all of
it. Node built-ins only.

## The data

| File | What it is | Edited by |
|---|---|---|
| `archive/quarters.json` | The school quarters: dates (CCPS calendar), title, PR range, plan of record, a line on what each was | hand |
| `archive/catalog.jsonl` | One JSON record per archived file, or per archived folder | `file.js` (or by hand) |
| `archive/entries.jsonl` | One record per entry of an archived history log: title, date, anchor, line, the `#N` it cites | `build.js` |
| `archive/INDEX.md`, `archive/<quarter>/INDEX.md`, `archive/by-system.md`, `archive/by-pr.md` | The indexes and the two cross-quarter views | `build.js` |

A catalog record:

```json
{"id": "2026-27-Q1/meta/HANDOFF_2026-10-22.md", "original_path": "meta/HANDOFF_2026-10-22.md",
 "quarter": "2026-27-Q1", "kind": "handoff", "system": "meta",
 "date": "2026-10-22", "filed_on": "2026-10-22", "filed_by": "the date in its name",
 "archived": "2026-11-17", "summary": "Session handoff, 10-22 ...",
 "superseded_by": "meta/HANDOFF_2026-10-24.md"}
```

- `id` is `<quarter>/<original_path>`; a closed quarter never changes, so
  ids are stable.
- `kind`: `handoff`, `plan`, `audit`, `replaced` or `history`.
- `date` is when it was written (`YYYY-MM-DD`, or `YYYY-MM` when only the
  month is known, or `null`). `filed_on` is the date the filing used: the
  written date, else the date it was replaced or retired, else `null`.
  `filed_by` says which, in words; for a judgment call it says so.
- An id ending in `/` is a folder record: it covers every file under it.
- A `history` record is the older part of a live log and names it in
  `continues_in`; its entries are indexed one by one in `entries.jsonl`.

The rule `build.js --check` enforces: a full `filed_on` date falls inside
its record's quarter, a month overlaps it, and a `null` one has a note.

## Searching: `search.js`

It filters the catalog and the log entries first, then reads the text of
only what matched. A hit in a log names the entry, its date and its
anchor, with the file's line numbers.

```sh
node tools/archive/search.js --pr 179                     # everything citing #179
node tools/archive/search.js --system cas-ccps --from 2026-10-10 --to 2026-10-20 "timeout"
node tools/archive/search.js --kind handoff --quarter 2026-27-Q1   # list, no pattern
node tools/archive/search.js --entries --from 2026-10 "rollout"    # log entries only
node tools/archive/search.js --json "Studio"                       # one JSON object per hit
```

Filters: `--quarter`, `--kind`, `--system` (each repeatable), `--from` and
`--to` (a day or a month; an undated log entry takes the date of the
nearest dated entry above it), `--pr N`, `--files` or `--entries`,
`--max <lines per record>` (default 3). The search text is plain and
case-insensitive, with `|` between alternatives (`"12-minute|timeout"`);
it is never compiled as a regular expression, so no input can hang the
search. Exit 0 with hits, 1 with none, 2 on a usage error.

Agents: search the archive with this, not by grepping `archive/` whole
(`CLAUDE.md`). The root `.ignore` already keeps it out of ripgrep.

## Building and checking: `build.js`

```sh
node tools/archive/build.js           # rewrite the generated files
node tools/archive/build.js --check   # CI (gas-lint workflow): exit 1 on a problem or a stale file
```

The check fails on a file under `archive/<quarter>/` with no record, a
record with no file, a missing or malformed field, a record in a quarter
its `filed_on` doesn't fall in, or a stale generated file.

## Archiving something: `file.js`

```sh
node tools/archive/file.js meta/HANDOFF_2026-11-15.md --summary "Session handoff, 11-09 to 11-15"
node tools/archive/file.js cas-ccps/old-tool --summary "…" --filed-on 2026-12-01 --filed-by "retired 2026-12-01"
node tools/archive/file.js <path> --summary "…" --dry-run      # print, change nothing
```

It decides the quarter from the date (`--date` when written; without it,
the date in the name, else the earliest date near the top; `--filed-on`
with `--filed-by` for a replaced or retired thing; `--quarter` with
`--filed-by` only when the date can't decide), runs `git mv` to
`archive/<quarter>/<path>`, repoints the live references, adds the
record and rebuilds the indexes. A folder gets one record covering every
file under it (retired code stays together).

**Review what it lists.** It rewrites every live mention of the path:
Markdown links recomputed, full paths in code, config and docs prefixed.
Most are pointers and should change; a sentence about the past ("X was
deleted") should not, so put that line back. A path built from quoted
segments (`path.join('cas-ccps', 'archived')`) is listed as a warning
and repointed by hand. Then run the tests.

**When a plan of record is replaced**, roll the history logs over:

```sh
node tools/archive/file.js --rollover-logs --before 2026-12-01 --dry-run
node tools/archive/file.js --rollover-logs --before 2026-12-01
```

Every entry of `cas-ccps/HISTORY.md`, `kos-personal/CHANGELOG.md` and
`leader-hub/HISTORY.md` dated before the new plan's start moves word for
word to `archive/<its quarter>/<log path>`, in the log's own order. An
undated entry goes by the nearest dated entry above it; at the top of an
oldest-first log, by the first dated one below. A quarter's part gets a
header and a catalog record the first time. The live log's pointer (the
`archive:pointer` block) is rewritten. A date in a quarter whose dates
aren't in `quarters.json` yet stops it: add them first.

Tests: `tests/tools/archive.test.js`, `tests/tools/archive-file.test.js`.
