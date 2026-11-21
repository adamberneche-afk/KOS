# `student-leader-hub.html` split into `src/` (external product review, Finding 4)

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

The single ~22,000-line file is now generated from 14 fragments under
`src/` (`00-shell-head.html` through `13-markup-modals-tail.html`) via
`tools/leaderhub-build/build.js` — see that tool's own README.md for the
full design rationale (why a pure textual concatenation is safe here
despite 189+ scattered top-level declarations and no central config
object) and one region flagged honestly as tangled, not cleanly modular
(`12-integrations-pacing-subplan-brag.html`, ~3,600 lines mixing several
genuinely unrelated features).

**The build does more than concatenate now.** Chasing the
OAuth-consent-dialog crash (see the Fixed section near the top of this
file) added four passes after the fragment join, all documented in
`tools/leaderhub-build/README.md`: comments and dead whitespace are
stripped, every top-level `let`/`const` is rewritten to `var`, top-level
functions and var names are moved ahead of other statements (so the split
can't make load-time code name something a later tag declares), and the
giant script is split into several `<script>` tags at real, tokenizer-
verified statement boundaries — 16 of them today, each under 70,000
characters, each independently `node --check`ed. Each emitted tag also
carries a `data-lh-block` name. (It used to be a `//# sourceURL=`
comment; see the Fixed section for why that had to go.) `build.js --stats` prints a
per-block size report; `build.js --check` is the drift gate. All of it
is hand-rolled with zero npm dependencies, on a small tokenizer
(`js-lexer.js`) that has its own invariant checker, verification scripts
and unit tests — the tokenizer has had three real bugs found in it, so
do not assume it is beyond suspicion.

**The assembled file stays committed at its current path — never
gitignored, never hand-edited directly.** Edit the fragment under `src/`
that holds the section you're changing, then run
`node tools/leaderhub-build/build.js` and commit both. `npm test`
(`tests/tools/leaderhub-build.test.js`) fails if the assembled file and
its fragments ever drift apart, same enforced-not-manual pattern
`tools/html-lint/check.js` and `tools/gas-lint/check.js` already use.

`tests/leaderhub/escaping.test.js` and `pacing-and-calendar.test.js`
(which then used `extractLines()`, since removed, against specific line ranges; since
2026-11-21 they cut by name with `tests/harness/cut-declarations.js`) now point at
the relevant fragment file instead of the monolith, with fresh,
much-smaller re-grepped line numbers local to that fragment — a real
robustness win: only an edit inside that one fragment can shift these
ranges now, not an edit anywhere in the full file.
`emailbridge-orgsync.test.js` targets `EmailBridge.gs` directly and
needed no changes.
