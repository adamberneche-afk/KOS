# Audit: dead ends and half-built work (2026-11-17)

**Status:** the second repo-wide audit, at the sprint boundary the first
one asked for (`archive/2026-27-Q1/meta/AUDIT_DEAD_ENDS_2026-10-29.md`).
Point-in-time: tick items off as they close. Code and docs only; no Google
file was opened. No student names, emails, file IDs or ConfigIDs appear
here.

**Partial, said plainly:** the function-level sweep (trigger handlers that
point at missing functions, Script Properties read but documented nowhere)
was started and not finished: the run stopped on a usage limit. Its raw
inputs were kept; the next audit picks them up (last section).

## The 10-29 audit: all of it closed

Every numbered item closed between 10-31 and 11-02, per that audit's own
progress notes: #1 by #349 (the hub pulls; `call-hub.yml` deleted 11-01),
#2 by D14 (the Registrar's two Studio flows built, then verified 11-02),
#3 by D15 (the SCR retry on the student's page), #4 and #9 by clean-up PR 1,
#5 and #6 (held parts flagged; parts in the cartridges), #7
(`reportEvaluationHealth()`), #8 and #10 (the next-push fixes). The "built
and parked" rows were decided under D16, the dead weight and stale comments
removed, and "the docs that say the wrong thing" fixed in one docs PR.

## Running and failing, or running for nothing

1. **What is live is behind `main`.** The projects report commit `34a8d4c`
   (the 11-16 push, through #459). Merged since: #460–#470. #461 archives
   the custom Studio steps and the AutoInstaller (its push takes the
   installer's menu item and two scopes out of the Unified Manual); #464,
   #467, #469 and #470 changed deployed files in comments only. The
   deploy-drift report (`gas-version-report`) failed four times on 11-17
   and reopened issue #38. That is the check working: it clears at the next
   push. **Action (operator):** `node run.js --latest`, then
   `reportDeployVersion` in each editor.
2. **One function makes three tools slow.**
   `tools/leaderhub-build/strip-comments.js`'s `stripCommentsAndWhitespace`
   reads `out[out.length - 1]` from a string built by `+=`, which flattens
   the whole string at every whitespace token: quadratic in file size. It
   takes 17 s on `cas-ccps/scripts/55b_LessonAssignmentData.js` (2 MB); the
   same loop with the last character kept in a variable and the pieces
   joined once takes 0.2 s, **with byte-identical output** (checked on that
   file and on the LeaderHub page's largest script). It is why
   `leaderhub-build --check` ran for minutes. **Corrected:** it is not why
   `tools/coverage-gaps/check.js` takes over a minute: that tool runs the
   whole test suite under V8 coverage by design, so its time is the
   suite's; this function was 30 s of it only because tests call it.
   **Fixed (2026-11-17, the PR after this audit):** `leaderhub-build
   --check` now takes about 1 s and coverage-gaps 64 s (was 74); a test
   checks the output against the old loop byte for byte on the repo's own
   scripts, and that the 2 MB file strips in under 3 s.

## Half-built: finish

3. **coverage-gaps can't see 12 trigger registrations.** They name their
   handler through a constant or a loop variable, so the tool can't tell
   which function they install and doesn't check its tests: the Ledger
   cycle's jobs (64: `LC_TRIGGER_FN`, `j.fn`, `fn`), the watchdog (34),
   Flow 2's drift probe (39b), the rollout and its catch-up (58), the
   course year builder (51), the warm-up bridge (41), the form dispatcher
   (18) and the student profile manager (23, both projects). It says so in
   its warnings, so the gap is visible, not hidden. **Action:** resolve a
   `const X_FN = '<name>'` and a literal array of `{ fn: '<name>' }` in the
   tool, which covers all twelve by shape; then see which handlers lack a
   test.
   **Done (2026-11-17, the PR after #482):** the tool resolves both shapes;
   0 unresolved, 61 handlers checked. It then found three nightly jobs no
   test calls (`updateAllStudentProfiles`, `buildWarmUpQueues`,
   `buildUpcomingLessons`), allowlisted as known gaps with the reason, and a
   real bug: `installWarmUpTriggers` was in 23, which is also in the Teacher
   Dashboard project, where two of the three handlers it installs don't
   exist (run from that editor, they'd fail every night). It is in 24 now,
   which is in the Central Ledger only.
4. **Three editor functions are documented only in their own file:**
   `installStudioReturnTrigger` (12), `runKosPersonalPreflightNow` (15) and
   `resetMoralDebt` (23). No doc or test names them. `resetMoralDebt`
   zeroes SMP-019's counter, so an operator should be able to find it.
   **Action:** add them to `kos-personal/docs/runtime-reference.md`'s
   "Editor-only functions"; a test for `resetMoralDebt`.
   **Done (2026-11-17, same PR):** all three in the table, with
   `previewMoralDebt`; a test for `resetMoralDebt` and `previewMoralDebt`.

## Decide

5. **doc-currency checks function names, not file paths.** A rough scan of
   the live docs found 221 path mentions that don't resolve as written:
   107 to files no longer in the tree, 68 to docs now archived, 44 to paths
   that moved. Many are deliberate (an example of an archived path, a
   gitignored `.clasp.json`, a bare name in prose), so the number is an
   upper bound, not a list of errors. **Decide:** extend doc-currency with
   a path check (warn-only first, like release-check), or leave paths to
   the link check, which only sees Markdown links.
   **Measured again 2026-11-17** (backticked repo paths in live Markdown,
   outside code blocks): 1,021 resolve, 162 don't. Most of the 162 are
   relative to their system's folder, Drive folder names, gitignored
   folders, or history entries naming where a file used to be; the real
   breaks are mostly files that moved into `archive/`. Still the
   operator's decision.

## Already queued (not dead ends)

- Pruning `meta/AGENT_NOTES.md`, and the eight docs left live in #464 for
  the operator to rule on (the 11-17 clean-up list, items 4 and 5).
- 367 merged remote branches: a script to delete them is with the operator
  (the session can't push to other branches).

## On hold (decided, waiting; not dead ends)

Q26 (the 13 competencies no lesson measures); Flow 3 warm-up set-asides;
The Back Room sheet; the zero-shot target; L1's gate; packaging (paused
11-09); LeaderHub tightening except #442; turn-in stage 5 (after a few
weeks of data). Source: `meta/HANDOFF_2026-11-17.md`.

## Unchanged warnings

gas-lint: 0 errors, 29 warnings (the bounded-loop convention, applied as
files are touched). doc-currency: 0 errors, 9 warnings (functions in
LeaderHub's uncommitted Apps Script, unverifiable by design).

## For the next audit

Finish the function-level sweep: trigger handlers and menu items against
the functions that exist; Script Properties read in code (about 150 names)
against `SETUP_GUIDE_REFERENCE.md` and the docs; tests for code that's
gone; TODO and FIXME older than 10-29. Repeat at the next sprint boundary.
