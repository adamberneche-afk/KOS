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

This isn't an ES module system — the fragments assemble back into the same
logical `<script>` blocks as before the split (originally one, well, two —
see `02-error-handler.html`, a separate small `<script>` block). Top-level
`function` declarations hoist across the *whole* assembled script
regardless of which fragment they live in, so a function defined in
fragment 10 can be called from fragment 3's markup with no import/export
needed. The one real constraint: fragment order in `manifest.json` must
match the *original* file's order, because top-level `const`/`let`
variable *initializers* (not function declarations) still run in file
order. Don't reorder `manifest.json` casually.

## Minification + splitting (why the output has more than 2 `<script>` tags)

After concatenating fragments, `build.js` runs each real `<script>` block's
content through a small hand-rolled toolchain — see
`leader-hub/HISTORY.md`'s two OAuth-consent-dialog-crash entries for the
full story of why this exists:

1. **`strip-comments.js`** removes comments and collapses dead whitespace
   (a pure size reduction — string/template/regex literal content and
   real newline placement are never touched).
2. **`hoist-declarations.js`** converts every TOP-LEVEL `let`/`const` to
   `var` — required before a block can be split into multiple `<script>`
   tags, since each classic `<script>` tag gets its own top-level lexical
   scope for `let`/`const`/`class` (only `var`/function declarations
   become shared properties of the page's global object, visible across
   tags in document order).
3. **`split-script.js`** splits a block over `MAX_SCRIPT_CHUNK_SIZE`
   (currently 70,000 characters — comfortably under the ~100K–107K
   per-tag threshold live bisection measured as the actual crash trigger)
   into several consecutive `<script>...</script>` tags, cut only at real
   statement boundaries found by tokenizing (`js-lexer.js`), never at a
   bare bracket-depth-0 gap that could sit mid-expression. Every resulting
   chunk is verified with `node --check` before the split is trusted.

Only a block that actually exceeds the size threshold gets hoisted+split;
the small error-handler script is minified but left as one tag. This is
why the real assembled file currently has 16 `<script>` blocks (the small
error-handler one, plus 15 chunks of the giant one), not 2 — that count
will drift as the giant script grows or shrinks, so don't treat "16" as a
fact to keep in sync here; `node tools/html-lint/check.js
leader-hub/student-leader-hub.html` always reports the real current count.

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
| `build.js` | Reads each fragment in manifest order, `parts.join('')` (no separator — each fragment ends exactly where the next began), then runs each real `<script>` block's content through minify → (hoist + split, if over size) before writing the result. `--check` builds in memory and diffs against the committed file instead of writing, non-zero exit on drift. |
| `js-lexer.js` | Small recursive-descent JS tokenizer (comments/strings/templates/regex/idents/numbers/punctuation/whitespace) — not a full parser, just enough to walk the source without corrupting arbitrarily-nested template literals. Everything else in this directory is built on it. |
| `strip-comments.js` | Removes comment tokens and collapses dead whitespace/blank lines, leaving string/template/regex literal content and real newline placement untouched. |
| `hoist-declarations.js` | Converts top-level (bracket-depth-0) `let`/`const` to `var`, leaving anything nested inside a function/block/for-head/object-key/method-name alone. |
| `split-script.js` | Splits a source string into chunks no larger than a target size, cutting only at real statement boundaries (never mid-expression), and verifies each chunk independently with `node --check`. |
| `verify-strip.js` | CLI: tokenizes an original and a stripped file, asserts every non-comment/non-whitespace token matches. `node tools/leaderhub-build/verify-strip.js <original.js> <stripped.js>` |
| `verify-hoist.js` | CLI: same idea as `verify-strip.js`, but allows `let`/`const` ↔ `var` at matching positions. `node tools/leaderhub-build/verify-hoist.js <original.js> <hoisted.js>` |

See `tests/tools/leaderhub-build.test.js` for the automated version of
`--check` that runs in CI alongside the rest of `npm test`, and
`tests/tools/leaderhub-build-lexer.test.js` for direct unit coverage of
the tokenizer/minifier/hoister/splitter.
