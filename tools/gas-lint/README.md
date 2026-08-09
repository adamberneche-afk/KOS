# gas-lint

A static checker for the GAS-based systems in this repo (`kos-personal`,
`cas-ccps`). Built after a full manual code review turned up the same
failure pattern repeatedly — bugs that only exist because nothing checks
them automatically, so they ship silently and surface months later. See
the reasoning in the conversation that produced this tool; the short
version: every serious bug found in that review was a thing this kind of
script can catch in seconds.

## Run it

```
node tools/gas-lint/check.js            # human-readable
node tools/gas-lint/check.js --json     # machine-readable
```

Exit code is `1` if any error-level finding exists, `0` otherwise
(warnings don't fail the run). No dependencies — plain Node.

## What it checks

1. **Duplicate top-level declarations within a shared Apps Script
   project.** GAS concatenates every file bound to one project into a
   single global scope — two files declaring the same top-level
   `function`/`const`/`let`/`var` either crash the whole project at parse
   time, or silently let one definition shadow the other (worse, if the
   two implementations actually differ — see `buildStudentRoster_` in
   `cas-ccps:central-ledger`, caught on this tool's first run). Project
   membership comes from `project-map.json`, itself built from each
   file's own `BOUND TO:` / `INCLUDE IN:` header comment — not assumed
   from filename, and not always the same as summary tables elsewhere in
   this repo (see `20_SetupCheckpoint.js` vs. `cas-ccps/README.md`'s
   Module 1 table, which disagree — the file's own header wins here).

2. **`kos-personal` CFG key usage vs. definition.** Parses the literal
   `const CFG = { ... }` object in `1_Config_And_Deploy.gs` for its
   top-level and `PROP.*` keys, then flags any `CFG.X` / `CFG.PROP.X`
   used anywhere else that isn't defined there.

3. **`cas-ccps` config key usage, three-tier.** Same idea, but this
   codebase's `_ADDENDUM` files are patch notes, not mergeable source —
   a key can be genuinely defined, defined-only-in-an-unmerged-addendum
   (this repo's own accepted, documented pattern — flagged as a
   **warning**, not an error, since it's a real accepted deployment step,
   not a bug), or missing entirely (an **error**).

4. **`google.script.run` ↔ server function cross-reference** for
   `kos-personal/8_WebApp_UI.html` (the only HTML in this repo that calls
   `google.script.run`) — every client call needs a matching top-level
   `.gs` function.

5. **OAuth scope coverage**, for any project with a checked-in manifest
   that declares an explicit `oauthScopes` list. Once a manifest lists
   scopes explicitly, GAS stops auto-detecting what's needed and grants
   exactly what's listed — a used-but-undeclared scope fails
   authorization at the call site, often silently if it's wrapped in a
   `try/catch` (which is exactly how the `UrlFetchApp` regression from
   Round 3 reconciliation hid — this tool exists partly because of that
   specific incident). See `scope-map.json` for the service→scope table.

## What this is NOT

Not a JS parser. Comments and string literals are stripped with a small
state machine, and top-level declarations are found via brace-depth
tracking on what's left — reliable for this codebase's consistent,
unminified, hand-written style, not a guarantee against unusual
formatting. The config-key checks are regex-heuristic by nature, because
the addendum files don't parse as normal JS at all (their useful content
is deliberately inside `/* */` blocks). Treat findings as "worth a
human look," not certified fact — though every finding on the first real
run was spot-checked against the actual source and confirmed real, zero
false positives.

## Extending it

- New Apps Script project, or a file moves between projects → update
  `project-map.json`. The tool warns (doesn't crash) if a listed file no
  longer exists, so a stale map is visible, not silent.
- New GAS advanced service gets used somewhere → add it to
  `scope-map.json`'s `services` table.
- A system other than `kos-personal`/`cas-ccps` grows a config-object
  pattern worth checking → add a new `check*()` function following the
  same shape as `checkKosPersonalCfgKeys`/`checkCasCcpsConfigKeys`.

## Known limitations worth fixing later, not blocking

- The OAuth scope check flags any `Session.*` call conservatively, even
  `Session.getScriptTimeZone()` which needs no scope at all — see
  `scope-map.json`'s `_notes.Session`.
- No check yet for the *reverse* direction of #4 (a server function that
  looks like it should be callable from the client but never is) — that's
  dead-code detection, a different and much noisier kind of check, left
  out deliberately to keep signal-to-noise high.
