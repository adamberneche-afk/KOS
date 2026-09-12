# flow-harness-sync

The standard remedy for one specific class of duplication in this repo:
**the same constant or algorithm, hand-duplicated across two or more GAS
projects, with nothing watching for the copies drifting apart.** Written
up here as a named, repeatable playbook (process-hardening sprint, Phase
0c — see `meta/PROCESS_HARDENING_SPRINT.md`) after building the first real
instance of it, so the *next* occurrence is a known move instead of a
bespoke design exercise.

## When this applies

GAS gives each deployed project (`kos-personal`, `cas-ccps`'s 8
sub-projects, `leader-hub`) its own execution scope — there is no
`import`/cross-project function call, ever. When the *exact same* logic or
data genuinely needs to exist in two or more of them, someone writes it
twice, and nothing ever compares the copies again. That's exactly how the
AI-groundedness/plausibility gate's phrase lists drifted: `cas-ccps` caught
"could not open" and `leader-hub` didn't; `leader-hub` caught "insufficient
context" and `cas-ccps` didn't; neither realized until an external
redundancy review diffed all three by hand.

**This does NOT apply** to logic that's merely *similar* across systems —
input construction, output routing, and anything that depends on a
system's own architecture or FERPA boundary stays genuinely separate, per
`drive-curation/Flow_Harness_Extraction_Proposal_2026-09-10.md`'s own scope
line (not committed to this repo — an external proposal doc, referenced
here because its reasoning is directly relevant). Forcing a shared
abstraction over logic that's legitimately different per system produces a
config object flexible enough to be its own programming language — worse
than the duplication it replaces. This playbook is for the case where the
duplicated piece really is (or should be) byte-identical data or algorithm,
not merely shaped the same.

## The recipe

1. **A canonical source**, one file, under `shared/flow-harness/` — plain
   JSON for data (phrase lists, thresholds, stopwords), since every
   consuming file is either `.gs` or `.js` and can parse JSON's shape
   directly into whatever literal syntax it needs. Comment the file's own
   `$comment` key with why it exists and which systems read from it — the
   file itself is the reference, not a separate doc that can drift from it.

2. **A generator**, `tools/flow-harness-sync/sync-<name>.js`, that does a
   **targeted, in-place replacement** of specific named `const` blocks in
   each consuming file — never a full-file rewrite. Same shape
   `tools/cas-ccps/generate-flow-prompts.js` already established for prompt
   constants: read the canonical source, render each target's constant in
   that file's own literal syntax (an array, an object, a bare number —
   whatever it already is), regex-replace the existing `const NAME = ...;`
   block, and diff before writing so an unchanged file is a true no-op.
   Support a `--check` mode that reports drift without writing, and export
   the diffing logic (`computeUpdates()` or equivalent) so a gas-lint check
   can call it directly instead of shelling out.

   **The one-time manual step**: a target constant has to already exist in
   the consuming file before the generator can find-and-replace it. If a
   system doesn't have the constant yet (this happened for `kos-personal`,
   which had no phrase-list check at all before the plausibility-gate
   consolidation), introduce it by hand first — with a real initial value,
   since the generator's first run will immediately overwrite it and prove
   the round-trip is correct. The generator's job is keeping something in
   sync going forward, not originating it.

3. **A gas-lint check** that calls the generator's `--check`-equivalent
   logic and reports drift the same way every other `gas-lint` finding is
   reported — so `node tools/gas-lint/check.js` stays the one command that
   catches this class of problem alongside everything else, rather than
   being one more tool someone has to remember to run separately.

4. **Tests** for the generator's pure rendering/diffing functions (not
   `main()` itself, which writes real files) plus a "drift guard" test that
   asserts the real, currently-committed consumer files still match what
   the generator would produce right now — the same role
   `tests/cas-ccps/flow-prompts.test.js`/`tests/kos-personal/flow-prompts.test.js`
   already play for prompt-constant drift.

## Worked example: the plausibility-gate phrase lists

- Canonical source: `shared/flow-harness/plausibility-phrases.json`
  (`nonAccessPhrases`, `stopwords`, `distinguishingWordRegex`,
  `maxCandidates`).
- Generator: `sync-plausibility-phrases.js`, managing three named constants
  per consumer (`FI_NON_ACCESS_PHRASES`/`FI_PLAUSIBILITY_STOPWORDS`/
  `FI_PLAUSIBILITY_MAX_CANDIDATES` in `cas-ccps`,
  `AI_NON_ENGAGEMENT_PHRASES`/`AI_PLAUSIBILITY_STOPWORDS`/
  `AI_PLAUSIBILITY_MAX_CANDIDATES` in `leader-hub`,
  `SR_NON_ACCESS_PHRASES`/`SR_GROUNDEDNESS_STOPWORDS`/
  `SR_GROUNDEDNESS_MAX_CANDIDATES` in `kos-personal` — three different
  naming conventions, because each system named its own constants
  independently before this existed; the generator's `TARGETS` array is
  where that per-system naming is declared, once, rather than assumed).
- gas-lint check: Check L, `checkPlausibilityGateDrift`
  (`tools/gas-lint/check.js`).
- Tests: `tests/tools/flow-harness-sync.test.js` (the drift guard plus unit
  tests for the rendering/diffing functions).

## Adding a new managed constant to an existing sync script

Add the value to the canonical JSON, add a render call for it in the
generator (reusing `renderPhraseArray`/`renderStopwordObject`/
`renderMaxCandidates`-style helpers where the shape already matches, or a
new one if it doesn't), and add the constant's name to each consumer's
entry in `TARGETS`. Run the generator once, confirm the diff looks right,
commit the result.

## Building a new sync script for a different duplication

Don't try to generalize `sync-plausibility-phrases.js` itself into a
framework for arbitrary duplications — write a new, separate
`sync-<name>.js` following the same four-part recipe above. Two instances
of a pattern is not yet a rule about how the third must look; premature
abstraction here would cost more than the small amount of boilerplate a
second script repeats.
