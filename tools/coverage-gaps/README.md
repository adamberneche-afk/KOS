# coverage-gaps

Finds a scheduled/triggered GAS function that no test in this repo ever
actually *calls* — process-hardening sprint Phase 0a (see
`meta/PROCESS_HARDENING_SPRINT.md`). Not a `gas-lint` check: every one of
`gas-lint`'s twelve checks is pure static source analysis, deliberately
never executing anything. This one has to actually run the real test suite
under Node's built-in V8 coverage instrumentation to answer "was this
function's body ever entered" — a different, slower, execution-based kind
of check, the same reason `doc-currency` and `html-lint` are their own
tools instead of folded into `gas-lint`.

## Why this exists

`sensor1_scanInboundSessions()` (`kos-personal/2_Ingestion_Sensors.gs`) had
zero test coverage of any kind for most of this repo's life — not "an
undertested edge case," literally never once called by any test — because
the mocks it needed (`MimeType`, `Folder.getFiles()`, `File.getMimeType()`,
`DocumentApp.flush()`) didn't exist in `tests/harness/gas-sandbox.js` yet.
Nothing flagged that. It was found by accident, mid-incident-fix, while
adding real regression coverage for an unrelated bug in the same function.
This tool answers the specific question that would have surfaced it in
advance: which of this repo's scheduled jobs does the test suite never
actually call, regardless of *why* (a missing mock, or just never written).

## Why scoped to `ScriptApp.newTrigger()` handlers, not every function

An earlier version of this tool checked every top-level function in every
project and found 400+ with zero coverage — almost all legitimate (one-off
setup scripts, UI-dispatch callbacks, small formatting helpers) and a
handful of real findings buried in noise nobody would ever read through.
That's not the actual risk: sensor 1 wasn't "an undertested helper," it was
a function running unattended on a 5-minute trigger, silently, with nobody
watching. A manual-only or UI-triggered function fails in front of someone;
a scheduled one fails silently, for as long as nobody happens to look —
which is the exact shape of every incident that motivated this whole sprint
(deployment drift, sensor 1's ingestion sensor, the Curator JSON parse
failures — all scheduled jobs nobody was watching). That's this tool's
scope, deliberately: not a coverage-percentage gate, a "does this
unattended job have any safety net at all" check.

## Run it

```
node tools/coverage-gaps/check.js            # human-readable
node tools/coverage-gaps/check.js --json     # machine-readable
```

Exit code `1` if any non-allowlisted trigger handler has zero hits across
the whole suite, or if a `ScriptApp.newTrigger()` call names its handler
with a variable rather than a literal string (reported as a warning, not an
error — see below). Takes a few seconds longer than `gas-lint` since it has
to actually run `npm test` under coverage instrumentation first.

## What it checks

1. Finds every `ScriptApp.newTrigger(...)` call across `kos-personal`,
   `cas-ccps`, and `leader-hub` production source (via
   `tools/gas-lint/project-map.json`, the same file `gas-lint` itself
   reads).
2. For each one with a literal string handler name, finds which file in
   that project actually *defines* a function by that name — not
   necessarily the same file that registers the trigger. `cas-ccps` mostly
   registers and defines in the same file; `kos-personal` centralizes every
   `ScriptApp.newTrigger()` call into `1_Config_And_Deploy.gs`'s
   `setupAllTriggers()`, separate from where each handler is actually
   implemented. The allowlist below is keyed on the *defining* file.
3. Runs `npm test` once under `NODE_V8_COVERAGE`, and merges per-function
   hit counts across every `coverage-*.json` file it produces (`node --test`
   spawns one worker process per test file, so there are several). A
   function is "covered" if *any* recorded instance, in *any* file, shows a
   hit count above zero — a deliberately low bar. This tool exists to catch
   the "literally never" case, not to be a line/branch coverage gate.
4. A trigger name that isn't a literal string (a variable, e.g. `cas-ccps`'s
   own trigger-table-driven setup files doing `ScriptApp.newTrigger(h.fn)`)
   can't be resolved by regex — reported as a `[unresolved-trigger-name]`
   **warning**, never an error, and never something to allowlist away: it's
   a limit on what this tool *can* verify, not something adding a test
   fixes. Same status `gas-lint`'s own dynamic-server-dispatch finding
   already has.

## How it sees inside the `vm` sandbox

`tests/harness/gas-sandbox.js` loads each `.gs`/`.js` file's source into a
`vm` context via `vm.runInContext(source, context, { filename: absPath })`.
Node's V8 coverage instrumentation still records per-function hit counts
for that code, keyed by the real absolute file path passed as `filename` —
confirmed empirically before this tool was built, not assumed. That's what
lets a plain `NODE_V8_COVERAGE=<dir> npm test` produce real, per-function
coverage data for `.gs` files that were never `require()`'d as ordinary
Node modules.

## The allowlist (`allowlist.json`)

Same idea as `gas-lint`'s own `ALLOWLIST` — a known, understood gap gets
recorded with a reason, not silently accepted or forced to a false clean
run. Introducing this tool immediately found 18 pre-existing scheduled
handlers with zero coverage; none of that day's 18 was fixed as part of
building the tool itself (that would have meant writing 18 new test cases
sight-unseen, a much bigger undertaking than "add a lint check," and is
tracked as its own follow-up in `meta/PROCESS_HARDENING_SPRINT.md` instead).
Each entry:

```json
{ "file": "kos-personal/6_Governance.gs", "function": "runSemanticSweeper", "reason": "..." }
```

A **new** scheduled function shipping with zero coverage is not
pre-allowlisted, and fails the build — that's the actual point of this
tool: not retroactively fixing today's gaps, but making sure the *next*
sensor-1-shaped one doesn't ship unnoticed.
