# gas-lint

A static checker for the GAS-based systems in this repo (`kos-personal`,
`cas-ccps`, `leader-hub`). Built after a full manual code review turned up the same
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

## CI

`.github/workflows/gas-lint.yml`'s `gas-lint` job runs this check (plus
`tools/clasp-sync/sync.js`, which now also refuses to build a project
with an unmerged addendum — see that tool's README, and an `actionlint`
self-check on the workflow file itself — GitHub Actions' schema has real
rules a generic YAML parser can't catch, e.g. `secrets.*` isn't allowed
inside an `if:` conditional; this caught exactly that bug once) on every
push and pull request. That same workflow file has grown a second,
unrelated job pair (`sandbox-deploy`/`sandbox-deploy-not-configured`,
gated on `main` only — see `tools/clasp-sync/SANDBOX_CI_SETUP.md`) that
pushes HEAD to sandbox Apps Script copies once configured; unrelated to
what this tool checks, mentioned here only so "what runs in CI" is
findable from either doc. Previously gas-lint itself was purely a "run
before trusting any change" README instruction with nothing enforcing
it — that gap is closed now.

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

4. **`google.script.run` ↔ server function cross-reference**
   (`findGoogleScriptRunCalls`). Every client call needs a matching
   top-level function in the *same* project, across every file in
   `project-map.json` — not just HTML. Client code lives in three different
   shapes here: a separate `.html` file (kos-personal), an `.html` file that
   is also the whole app (leader-hub), and template literals inside `.js`
   (both cas-ccps dashboards).

   **This check used to verify nothing, and the way it failed is worth
   knowing before touching it.** It scanned raw source with a per-*line*
   regex, and every real call in this repo defeats one half or the other:
   leader-hub and both cas-ccps dashboards write multi-line chains
   (`google.script.run` / `.withSuccessHandler(…)` / `.fn(…)`), which a
   per-line pattern cannot see — 19 real call sites, invisible; meanwhile
   eight kos-personal `.gs` files carry
   `*   google.script.run.withSuccessHandler(fn).executeBootstrap()` in doc
   comments, and those eight were the only names it ever found. The check
   was cross-referencing its own documentation and passing.

   So it now walks the chain from each `google.script.run`, skipping
   balanced parens through the `with*Handler(…)` links, over source stripped
   with `keepStrings: true`. Both halves of that mode are load-bearing, in
   opposite directions: **comments must be blanked** or doc examples
   masquerade as call sites, and **strings must be kept** or the cas-ccps
   dashboards lose every call. `tests/tools/gas-lint-scriptrun.test.js`
   pins both, and asserts a repo-wide floor on the number of resolvable
   calls — because the failure mode here is passing for lack of findings.

   A `google.script.run` the walker can't resolve to a name is reported as
   a `dynamic-server-dispatch` **warning**, once per file, and only when
   *nothing* in that file resolved. kos-personal's web app is the real case:
   it aliases the bridge (`const gsr = … ? google.script.run : null`) and
   dispatches with `runner[fn].apply(runner, args)` fed by
   `callServer('executeBootstrap', …)`, so the name only exists at runtime.
   No static pass can check that, and saying so is better than counting the
   file as covered. The per-file, nothing-resolved condition is what keeps
   leader-hub's many truthiness guards (`if (google.script.run)`) from
   drowning the signal — it has 8 chains that do resolve.

5. **OAuth scope coverage**, for any project with a checked-in manifest
   that declares an explicit `oauthScopes` list. Once a manifest lists
   scopes explicitly, GAS stops auto-detecting what's needed and grants
   exactly what's listed — a used-but-undeclared scope fails
   authorization at the call site, often silently if it's wrapped in a
   `try/catch` (which is exactly how the `UrlFetchApp` regression from
   Round 3 reconciliation hid — this tool exists partly because of that
   specific incident). See `scope-map.json` for the service→scope table.

6. **Cross-project undefined function calls** (`checkUndefinedFunctionCalls`).
   For each project in `project-map.json`, flags any identifier called as
   a function (`foo(...)`, not `x.foo(...)` — method calls are excluded)
   that isn't declared anywhere in that project's own file set and isn't
   on a built-in-globals allowlist. This is exactly the bug class that
   motivated adding it: a function defined in one GAS project silently
   fails at runtime if called from a file bound to a different project,
   since GAS's per-project global scope means there's nothing to catch it
   at "compile" time otherwise. Reported as `possibly-undefined-in-project`
   **warnings**, not errors — heuristic by nature (a real allowlist gap or
   a function passed in as a parameter, e.g. `fn`/`createFn`/`validateFn`,
   both look identical to a real cross-project bug from this check's
   point of view), so every warning is worth reading once, not
   auto-fixing.

7. **Undeclared GCP dependencies** (`checkGcpSurfaces`). Nothing in this
   repo's default architecture needs a Google Cloud project: every system
   reaches Gemini through a hand-built Workspace Flow using the account's
   own built-in access (`cas-ccps` and `kos-personal` call that the Walled
   Garden, `leader-hub` the Bifurcation Boundary — same rule, three
   names). That default isn't a style preference. Whether an account can
   have a standard Cloud project is a Workspace-admin decision nobody
   here controls, and on the `ccpsnet.net` account it is switched off —
   which is how all 2,113 lines of `cas-ccps/studio-steps/` ended up
   permanently unreachable *after* being written, unit-tested, and pushed
   successfully. That's the failure mode this check exists for: a custom
   step needing a project doesn't error, it just never appears in
   Studio's step picker, and an API call 401s inside a `try/catch`.

   So the check scans every file in `project-map.json` for the surfaces
   that actually require a project — a `workflowElements` key in a
   manifest, `generativelanguage.googleapis.com`, `aiplatform.googleapis.com`
   — and requires each one to have an entry in `gcp-map.json` recording
   its status, what breaks without it, and the fallback. An **undeclared
   live** surface is an **error**; an undeclared **latent** one (present
   but commented out) is a **warning**; so is a declaration whose
   dependency has since been removed. A declaration is not approval — it
   just means someone decided this on purpose and wrote it down.

   Live vs. latent is decided positionally, not guessed: the surface is
   live if it survives comment-stripping at the same offset in the
   source. That's what `stripCommentsAndStrings`'s `keepStrings` option
   is for — an endpoint in live code sits inside a string literal, one
   left in a commented-out reference implementation does not, and the
   default (blank both) can't tell them apart. `25_WarmUpWriter.js` is
   the real case: `callFlow4_` deliberately keeps a commented-out
   direct-Gemini block so check #5 above stays able to see the
   `script.external_request` requirement it would need. The
   `workflowElements` pattern is scoped to `.json` manifests for the same
   reason — several `.gs` headers discuss the wall at length, and prose
   about a dependency is not a dependency.

   `findGcpSurfaces(relPath, src)` is exported as the pure unit;
   `tests/tools/gas-lint-gcp.test.js` covers it plus `gcp-map.json`'s own
   integrity.

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
- Something starts needing a Cloud project → add a `surfaces` entry to
  `gcp-map.json` **before** writing the code, not after. Check the target
  account's Project Settings first; if GCP isn't there, look for a native
  Flow step instead (`cas-ccps/scripts/37_FlowInputBuilder.js` is the
  worked example of pushing everything except the model call into Apps
  Script). A new *kind* of GCP surface → add a pattern to
  `GCP_PATTERNS` and describe it in `gcp-map.json`'s `_patterns`.
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
- #4's dynamic-dispatch warning fires only for a file where *no* call
  resolved, so a file with resolvable chains **and** a genuine dynamic
  dispatch stays silent about the latter. Deliberate: the alternative
  flags every truthiness guard in leader-hub's HTML. Resolving a
  dispatcher's string arguments (`callServer('name', …)`) would give
  kos-personal real coverage and is the obvious next step if that surface
  ever grows past one helper.
