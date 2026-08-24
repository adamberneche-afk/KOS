# leaderhub-build

Splits `leader-hub/student-leader-hub.html` (external product review,
Finding 4 / "this quarter" maintainability fix) into 14 smaller files under
`leader-hub/src/`, and reassembles them back into the original file — plain
Node, no dependencies, matching the convention `tools/gas-lint/` and
`tools/html-lint/` already use.

## The rule

**`leader-hub/student-leader-hub.html` is generated. Never hand-edit it
directly.** Edit the fragment(s) under `leader-hub/src/` that hold the
section you're changing, then run:

```
node tools/leaderhub-build/build.js
```

to regenerate the assembled file, and commit both the fragment change and
the regenerated output together.

## Why the assembled file stays committed (not gitignored)

`leader-hub/README.md` and `leader-hub/.claspignore` both establish that
this file is opened directly from a checkout — no deploy step, no build
step, that's the whole design of leader-hub as a personal, no-infrastructure
tool. Gitignoring the assembled output would force a mandatory build before
the file even opens, undermining exactly that. `--check` mode (below) is
what actually prevents the fragments and the assembled file from silently
drifting apart, enforced as a gate instead.

## Why a pure textual concatenation is safe here

This isn't an ES module system — it's one (well, two — see
`02-error-handler.html`, a separate small `<script>` block) inline
`<script>` block, same as before the split. Top-level `function`
declarations hoist across the *whole* assembled script regardless of which
fragment they live in, so a function defined in fragment 10 can be called
from fragment 3's markup with no import/export needed. The one real
constraint: fragment order in `manifest.json` must match the *original*
file's order, because top-level `const`/`let` variable *initializers*
(not function declarations) still run in file order. Don't reorder
`manifest.json` casually.

**One region is honestly tangled, not cleanly modular:**
`12-integrations-pacing-subplan-brag.html` (~3,600 lines, banner
"LEADERHUB COMMAND ENGINE v3" continues into it) mixes the AI-job engine,
dashboard widgets, the journal/cron engine, Settings sub-panels, EmailBridge
polling, the cas-ccps bridge, pacing calendar, sub-plan generator, and Brag
Board. A couple of feature pairs (e.g. `generateSubPlan`'s engine call vs.
its UI trigger) end up thousands of lines apart regardless of where a future
finer split cuts. Flagged here plainly rather than pretending a cleaner
story than the source supports.

## Usage

```
node tools/leaderhub-build/build.js          # rebuild the assembled file from the fragments
node tools/leaderhub-build/build.js --check  # verify it's already up to date; exits 1 if not (CI gate)
```

## Files

| File | Contents |
|---|---|
| `manifest.json` | Ordered list of `leader-hub/src/*.html` fragment paths, plus the output path. `build.js`'s only source of truth for fragment order. |
| `build.js` | Reads each fragment in manifest order, `parts.join('')` (no separator — each fragment ends exactly where the next began), writes the result. `--check` builds in memory and diffs against the committed file instead of writing, non-zero exit on drift. |

See `tests/tools/leaderhub-build.test.js` for the automated version of
`--check` that runs in CI alongside the rest of `npm test`.
