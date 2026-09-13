# Process Hardening Sprint

**Origin:** a retrospective at the end of the session that reviewed the
external handoff/review documents (`KOS_Monorepo_Product_Review_2026-09-10.md`,
`KOS_Redundancy_Consolidation_Review_2026-09-10.md`, the `kos-personal`
queue-stall incident docs) and fixed what they found — the work now on
`consolidation-review-fixes`. That fix pass (informally "Wave 1/2" in the
session it happened in) closed real, already-shipped bugs. This document is
the follow-up question: what should change about how this repo is *built*,
not just what got fixed this time, so the next occurrence of each bug shape
gets caught by tooling instead of needing another external review to notice.

Status legend: 🔲 not started · 🟡 in progress · ✅ done — same convention
`README.md`'s "Known gaps" section and `HISTORY.md` already use.

---

## The pattern, named

Every item below traces back to one of these already-observed failure
shapes, not a hypothetical one:

1. **Live-vs-source drift with nothing watching it.** `kos-personal`'s
   deployment-drift bug (a live Apps Script project silently missing a
   function its own committed source already had) and the earlier
   `leader-hub` incident (genuine confusion over whether a redeploy had
   actually taken) are the same failure from two directions — nothing in
   this repo ever compares what's *live* against what's *committed*.
2. **A pattern established once, not enforced everywhere it applies.**
   `kos-personal/7_WebApp.gs` shipped with zero caller auth despite the
   identical pattern already existing in `leader-hub` and `cas-ccps`.
   Sensor 1's ingestion loop shipped with no batch cap, no pacing, and no
   escalation path despite Turnstile and `harvestStudioReturns` already
   establishing that exact convention elsewhere in the same repo.
3. **A test harness that lags what production code actually calls.**
   `sensor1_scanInboundSessions` had zero test coverage because
   `MimeType`, `Folder.getFiles()`, `File.getMimeType()`, and
   `DocumentApp.flush()` were all unmocked — discovered by accident, mid-fix,
   not by anything that would have flagged it in advance.
4. **Treating every failure as equally retryable.** The Curator JSON bug
   wasn't really a parsing bug — it was that nothing distinguished "might
   succeed on attempt 2" from "deterministically fails again because it
   re-parses the same stored text." The Turnstile queue has the same
   shape one layer up: a stale-reset row is, by construction, one of the
   *oldest* rows in the queue, so it's released again almost immediately —
   consecutive tries through the same log, exactly the shape a backlog of
   15 good rows got stuck behind.
5. **The same constant/algorithm hand-duplicated across GAS projects with
   nothing watching for drift**, because GAS forbids cross-project calls
   and there was no established remedy for that specific class of
   duplication until this sprint's Wave 2 built one (the plausibility-gate
   canonical spec + `harness-drift` check).
6. **Checks that only ever run after an entire multi-step process
   finishes**, never between its steps — the Curator+Auditor Studio Flow
   runs both inference passes natively with no Apps-Script-visible
   checkpoint in between, so a malformed Curator output still gets fed to
   the Auditor, and nothing sees either output until both are already done.

---

## Phase 0 — Foundations

No pipeline risk; pure tooling and documentation. Do first because Phase 1
and Phase 2 will both write new tests/conventions that should already be
checked against this phase's own gates.

### 0a. Test-harness-completeness check ✅
Built as `tools/coverage-gaps/check.js`, its own tool rather than a 13th
gas-lint check — it has to actually run the test suite under Node's
built-in V8 coverage instrumentation to answer "was this function ever
called," which is a fundamentally different (slower, execution-based) kind
of check than gas-lint's static analysis, the same reason `doc-currency`
and `html-lint` are already separate tools.

**Scope changed from what's written above, deliberately, before building
it — not silently.** Checking every top-level function in every project
(the original framing) found 400+ zero-coverage functions, almost all
legitimate (setup scripts, UI-dispatch callbacks, small helpers) with the
real findings buried in noise nobody would read through. Rescoped to
functions registered via `ScriptApp.newTrigger(...)` specifically — the one
class of function that fails *silently*, with nobody clicking a button
that would notice, which is exactly Sensor 1's shape and every other
incident behind this whole sprint. That check found 18 pre-existing gaps
(now in `tools/coverage-gaps/allowlist.json`, each with an honest reason,
not fixed as part of introducing the tool — see that file) plus 4 trigger
registrations whose handler name isn't a static literal (reported as
warnings, not errors — a limit on what this tool can verify, not something
a test fixes). Wired into CI (`.github/workflows/gas-lint.yml`). See
`tools/coverage-gaps/README.md` for the full mechanism.

### 0b. FLOW_DOCTRINE.md — new rule: retryable vs. deterministic-given-stored-input ✅
Landed as rule 17. Also added an "Adding a flow" checklist item (10) for it,
and a mention of `tools/coverage-gaps/check.js` under checklist item 4 —
that checklist is where a new flow actually gets built, so both new tools
from this sprint are surfaced exactly where someone would need them.
`meta/README.md`'s own rule count was already stale before this ("fifteen
rules... six... have nothing behind them" — the file already had 16 rules
and Check L's enforcement of rule 15 both predating this edit); fixed
alongside adding rule 17 rather than compounding the drift.

### 0c. `tools/flow-harness-sync/README.md` ✅
Also added a root `README.md` section for the tool itself — it turned out
`tools/flow-harness-sync/` never got one when it was first built in Wave 2
(the PR-only `docs-check` CI job never caught it, since that Wave 2 work
was pushed straight to a branch, no PR opened). Fixed alongside writing
this playbook rather than left as a second gap.

---

## Phase 1 — Turnstile queue fairness + visibility

*(your idea — the one already proven live, not hypothetical: confirmed by
reading `runMatrixTurnstile()` that a stale-reset row is released again
almost immediately, since it's released in sheet order and a repeatedly-
failing row is necessarily one of the oldest.)*

### 1a. Deprioritize-on-stale-reset ✅
Built exactly as sketched: `_markStaleDeprioritized_`/
`_readStaleDeprioritizeSet_`/`_writeStaleDeprioritizeSet_`
(`5_Error_And_Utilities.gs`) mirror the audit-retry priority set, and
`runMatrixTurnstile()`'s `releaseOrder` now has three buckets — priority,
normal, deprioritized — released in that order, with priority winning if a
UID is somehow marked both ways. One-shot and pruned the same way the
priority set already is.

The regression test needed a second try: the first version seeded a
`STUDIO_ACTIVE` row and a `PENDING_FLOW` row in the same
`runMatrixTurnstile()` call and expected the stale-reset row to lose —
it passed, but for the wrong reason. Pass 2 reads the SAME in-memory `data`
snapshot Pass 1 already updated in-sheet, so a row Pass 1 just reset is
never eligible for release again in that same call regardless of this fix
— confirmed by running the test against the pre-fix code, where it also
passed. The real incident spans separate 5-minute Turnstile cycles: a row
stale-reset on run N is a plain `PENDING_FLOW` row by run N+1, and being
one of the oldest rows in the sheet, pure sheet-order release picks it
again ahead of anything newer that's been waiting. The test now calls
`runMatrixTurnstile()` twice with a row added in between, and does fail
against the pre-fix code when checked directly.

### 1b. Visible requeue reason ✅
`_markStaleDeprioritized_` stores `{reason, attempt, at}` per UID, not just
a boolean — `STAGING_PIPELINE` has no spare column for this
(`10_Turnstile.gs`'s own header explains why an 8th column isn't added
lightly), so this Script Property is the durable, inspectable record until
the entry is consumed. This is the smaller, shippable-now slice of the
status-visibility idea; Phase 4 is where it becomes full per-stage
tracking across a split Curator/Auditor flow.

### 1c. Missing outer `LockService` guards ✅
Added to both `harvestStudioReturns()` and `processInferenceQueue()`, the
same `LockService.getScriptLock()`-then-`finally`-release shape
`sensor1_scanInboundSessions()`/`runMatrixTurnstile()` already use.
`processInferenceQueue()` already had a *different* lock inside
`processIntakePayload()` protecting a different span (the duplicate-guard-
through-queue-append race) — the new guard protects the outer row-scan
loop itself, a separate concern.

### 1d. Tests ✅
Done alongside 1a-1c rather than as a separate pass: the two-run queue-
fairness test (see 1a above) plus one-shot/pruning/priority-wins-ties
coverage in `tests/kos-personal/turnstile.test.js`, and a
"does nothing when it cannot acquire the script lock" test for each newly-
locked function (`tests/kos-personal/studio-return-harvest.test.js`,
`tests/kos-personal/queue-processor.test.js`), same pattern
`runMatrixTurnstile()`'s own lock test already used.

---

## Phase 2 — gas-lint hardening

No pipeline risk — pure static analysis, same style as existing Checks A-L.

### 2a. Check M — every `doGet`/`doPost` needs a visible caller check ✅
Built as `checkWebAppAuthChecks()`. The heuristic sketched above ("reference
`Session.getActiveUser()` or a shared-secret comparison anywhere in its
body") turned out to be too coarse the moment all five real `doGet`/`doPost`
files in the repo were actually read side by side — they use four
*different*, all-legitimate shapes, not one:

- `kos-personal/7_WebApp.gs`, `cas-ccps/07_TeacherDashboard.js`: a
  dedicated checker called directly in each handler's own body.
- `cas-ccps/13_StudentDashboard.js`: `doGet()` serves a static shell with
  **no check of its own** — the real gate is on the data call
  (`getStudentDashboardData()`'s `Session.getActiveUser()`), reached later
  via `google.script.run`. Documented, intentional, and would have been a
  false positive under the original "check the handler's own body" framing.
- `leader-hub/EmailBridge.gs`: `doPost()` has no check of its own, and the
  project's only checker (`_isAuthorizedOwner_`, in `Code.gs`) isn't called
  from it. Genuinely ambiguous — the manifest's `access: "DOMAIN"`
  restriction may be the intended gate, or this may be a real gap. Not
  confidently either.

So the shipped rule is asymmetric: `doGet()` is silent if a recognized
check (`Session.getActiveUser()`, an `*Auth*`/`*Verify*`/`*Token*`/
`*Secret*`-named call, or `e.parameter.secret`) exists **anywhere in the
project**, error only if nothing exists anywhere (the "gate the data, not
the shell" pattern is legitimate and common enough that flagging it would
just be noise to silence). `doPost()` is silent only if the check is in its
**own body** — a POST typically performs the action directly, so "gated
downstream" doesn't apply the same way — warn if a check exists elsewhere
in the project but isn't called from `doPost()` itself, error if nothing
exists anywhere. Running it against the real repo produced exactly one
finding: a warning on `leader-hub/EmailBridge.gs`'s `doPost()`, the
genuinely ambiguous case above — surfaced for a human decision, not
silently resolved either way. 9 unit tests in
`tests/tools/gas-lint-webapp-auth.test.js` pin all four real shapes plus
the comment-stripping edge case. See `tools/gas-lint/README.md` item 13 for
the full writeup.

### 2b. Check N — bounded-loop convention (warning-level) ✅
Built as `checkBoundedLoopConvention()`, exactly as scoped: a
`while (x.hasNext())` loop over a Drive/Docs/Sheets iterator should
reference a cap (a `break`, or a `MAX`/`LIMIT`/`CAP`-named identifier) and a
pacing call (`Utilities.sleep(...)`, a `*pacing*`/`*throttle*`/`*sleep*`-
named call, or an elapsed-time budget check against `Date.now()`/
`new Date()`). A grep across the repo before building it found seven real
`while (...hasNext())` loops with neither today
(`kos-personal/1_Config_And_Deploy.gs`, `5_Error_And_Utilities.gs`,
`6_Governance.gs` ×3, `11_Registrar_CogRelay.gs`,
`cas-ccps/10_AdminRecoveryPanel.js`) — confirming this is a genuinely new
convention, not a retrofit, and why it's warning-level: erroring on all
seven at once on introduction would make the check something to silence
rather than act on. Those seven are now-visible, pre-existing findings,
not a regression this change introduced — fixing them is follow-up work,
not part of landing the check itself.

One real bug caught while building this, before it ever ran on real code:
the first cut of both regexes (`[A-Za-z_$][\w$]*(?:MAX|LIMIT|CAP)[\w$]*\b`
and the pacing equivalent) could never match an identifier where
MAX/LIMIT/CAP/sleep/pacing/throttle is the very *first* thing in the name
(e.g. `MAX_FILES_PER_RUN`) — the mandatory single leading character
consumed the identifier's own first letter, so the literal it was looking
for was no longer there to find in what was left. Caught by a unit test
asserting a `MAX_FILES_PER_RUN` reference should count as a cap, which
failed against the first version; fixed by dropping the mandatory leading
character in favor of a `\b` word boundary. 9 unit tests in
`tests/tools/gas-lint-bounded-loop.test.js`. See `tools/gas-lint/README.md`
item 14 for the full writeup.

---

## Phase 3 — Live-deployment drift detection

Biggest design lift of the tooling items — needs a decision before
building, and touches all 9 GAS projects' actual deployments, not just this
repo's source.

**Decision reached (discussed before building, not assumed):**

The obvious-looking design — an external poller reads each project's live
state and diffs it against git — turns out to only work for one of the 9
projects. `access: MYSELF`/`DOMAIN` web apps (`kos-personal`,
`leader-hub:app`, `cas-ccps:teacher-dashboard`) sit behind Google's own
sign-in wall: an unauthenticated request never reaches `doGet()` at all, so
polling them means either a production Google credential in CI (ruled out —
the sandbox-deploy fence exists on purpose and Phase 3 isn't the thing that
should erode it) or nothing. The 6 remaining projects with no web app at all
(`central-ledger`, `unified-manual`, `master-student-template`,
`rubric-response-sheet`, `teacher-matrix-sheet`, both `studio-steps`
projects) have no inbound surface to poll regardless. Only
`cas-ccps:student-dashboard` (`access: ANYONE`) is reachable by an anonymous
external request.

**So the design pushes instead of polls.** GAS already runs as a fully
trusted execution context for itself — no credential is needed for it to
call *out*. Each project self-reports its own version marker (git short-SHA
of the last commit touching that project's files, stamped at push-prep
time) via `UrlFetchApp` to GitHub's `repository_dispatch` API, which fires
a workflow immediately: read the payload, compute what git currently
expects for that project, compare, alert on mismatch. This is one uniform
mechanism for all 9 projects — the `student-dashboard` special case
dissolves; it can use the same self-report path as everything else instead
of needing separate poll-based handling.

The one new kind of secret this needs: a GitHub token living in each
project's Script Properties, authenticating that outbound call. Decided:
a **fine-grained personal access token, scoped to this one repo only, the
narrowest permission the `repository_dispatch` endpoint actually requires**
— never a broad classic `repo`-scope token, and never `Contents: write` or
workflow-editing permission, which would turn a leak into a path to
rewriting `.github/workflows/*.yml` and exfiltrating this repo's *other*
secrets (the sandbox clasp credential). Under a minimally-scoped token, the
worst case a leak or a bug enables is noise — spurious workflow runs, false
or suppressed drift reports — never code, file, or secret damage. Repo
visibility is public, which doesn't change that threat model (secrets stay
protected regardless of visibility) but does mean the "wasted CI minutes"
piece of that worst case costs nothing (public repos get free Actions
minutes) and that the reacting workflow must never print anything beyond
the version-marker payload into its (public) logs — not that it would ever
need to.

This keeps SMP-004's air-gap completely intact: the token only lets GAS
write *to* the repo (trigger a workflow, nothing more); nothing in this
design gives the repo, CI, or this agent session any new way to read live
GAS state or push/deploy into any project. Drift, once found, still gets
fixed by a human running a real `clasp push` + `clasp deploy`.

### 3a. Design + prototype against one project ✅
First built the mechanism itself, then prototyped it against
`kos-personal` (the actual incident site, and it already carried the
`script.external_request` OAuth scope this needs), then moved the live
target to `leader-hub:app` once `kos-personal`'s own Script Properties
turned out to be unavailable to add to — not a design problem, just which
real project gets wired up first; `kos-personal`'s files stay in place
as the reference implementation (harmless until wired up — Phase 3b picks
it up regardless of which project went live first).

Built and tested, project-agnostic:

- `tools/deploy-drift/expected-marker.js` — pure git-log wrapper, "what
  commit does git expect for project X's files."
- `tools/deploy-drift/stamp.js` — writes current HEAD into a project's
  marker file, as its own commit. `MARKER_FILES` now has both
  `kos-personal` and `leader-hub:app` entries.
- `tools/deploy-drift/check.js` + `.github/workflows/deploy-drift.yml` —
  reacts to a `repository_dispatch` report, compares, opens/updates/closes
  a pinned per-project tracking issue. Untrusted payload handled via `env:`
  (never interpolated into `run:`) and re-validated inside check.js itself.

Two GAS-side implementations of the same shape, both real, both tested:

- `kos-personal/17_DeployVersionReport.gs` + `18_DeployVersionMarker.gs` —
  wired to its own new low-frequency trigger via the project's existing
  bulk installer (`reportDeployVersion` added to `KOS_TRIGGER_HANDLERS` —
  16 triggers now, `DEPLOYMENT_GUIDE.md` updated).
- `leader-hub/DeployVersionReport.gs` + `DeployVersionMarker.gs` — this
  project had no bulk trigger installer to fold into (no triggers at all,
  before this), so it gets its own one-time, idempotent
  `installDeployVersionReportTrigger()` instead. Manifest gained TWO new
  scopes, not one — `script.external_request` for the outbound call and
  `script.scriptapp` for installing the trigger itself, caught by
  `gas-lint` (Check E) before it shipped as a silent runtime failure.

Both fail closed to a no-op until their token Script Property is set, same
convention as `_sendChatAlert()`'s optional webhook. 39 new tests total
across `tests/tools/deploy-drift-*.test.js`,
`tests/kos-personal/deploy-version-report.test.js`, and
`tests/leaderhub/deploy-version-report.test.js`.

**A real design problem found and resolved while building, not assumed
up front:** a commit can't embed its own SHA — the SHA is a hash of the
commit's content. Resolved by giving the marker its own dedicated file
per project, which `expected-marker.js` deliberately excludes from its
own "what does git expect" computation (`MARKER_FILE_EXCLUSIONS`) — the
marker is stamped in a SEPARATE commit, after the real code change, so it
correctly matches once both land. See `tools/deploy-drift/README.md`'s
"self-reference problem" section.

**Live and confirmed working, end to end.** Three real problems surfaced
during actual rollout, each a genuine gap, not a design flaw, and each
fixed as it appeared:

1. **`consolidation-review-fixes` had never reached `main`.** `repository_dispatch`
   only looks at workflow files on the repo's default branch — `deploy-drift.yml`
   was invisible to GitHub until the whole branch was merged. Also explained why
   a `clasp push` from a `main`-tracked local checkout couldn't find
   `installDeployVersionReportTrigger` at all: the new files genuinely
   weren't on `main` yet to push.
2. **Both `kos-personal/.claspignore` and `leader-hub/.claspignore` are
   allowlist-style** (`**/**` then explicit `!filename`) — a list of
   project files nothing had touched when the new files were added
   everywhere else (`project-map.json`, `stamp.js`,
   `expected-marker.js`, each project's own trigger wiring). `clasp push`
   silently excluded both new files as a result — caught live (the user's
   first real push only sent the original 9 leader-hub files) and fixed
   in both projects, not just the one that actually broke.
3. **The fine-grained GitHub PAT was created with zero repository access
   and zero permissions** — not over-broad, empty. `reportDeployVersion()`'s
   403 (`Resource not accessible by personal access token`) correctly
   surfaced this; fixed by scoping it to `adamberneche-afk/KOS` with
   Contents: Read and write (GitHub's mobile UI labels this permission
   "Read and write access to code").

With all three fixed: `reportDeployVersion()` ran clean, and GitHub's own
Actions history confirms the rest — `deploy-drift.yml`'s first-ever run
(triggered by the `gas-version-report` dispatch, `main` @ `3e10895`)
completed successfully, its comparison step passed, and no tracking issue
was opened — the correct outcome for a clean match. Also caught in the
process: `reportDeployVersion()` never logged anything on success, only
on the "no token" and error paths, which is why the first clean run's
execution log looked empty rather than confirming anything. Fixed in
both `kos-personal` and `leader-hub`'s copies.

`kos-personal`'s copy of the same mechanism is still unwired (no live
token) — Phase 3b's job, not blocking this being ✅ for `leader-hub`.

### 3b. Roll out to the remaining 8 projects (real redeploys required) 🔲
Same mechanism, no new design — but several projects (`leader-hub`
confirmed, possibly some `cas-ccps` non-web-app ones) don't carry
`script.external_request` yet, so this is a manifest scope addition *and*
you re-consenting to the new scope on next deploy, per project that needs
it. `student-dashboard` folds in here too now (same mechanism as
everything else, no longer a special automated-poll case).

### 3c. A way to surface drift when found (chat alert? dashboard? both already exist per-system) 🟡
Built as part of 3a — `check.js` opens/updates a pinned `Deploy drift:
<project>` issue on mismatch, closes it with a resolution comment once a
report comes back clean, and never creates one for a project that's never
drifted. `leader-hub`'s first live report confirmed the CLEAN-match path
(no issue opened, correctly) — the mismatch/issue-opening path is still
only unit-tested, not yet seen fire for a real drift. Not marked ✅ until
that half has also been observed live; worth revisiting then whether a
tracking issue is enough signal or something should also ping
`leader-hub`'s existing chat alert / `cas-ccps`'s admin health-check
surface.

---

## Phase 4 — Curator/Auditor Studio Flow split

*(your other idea — the biggest item in this sprint, and the only one that
isn't just a PR.)*

Today: Curator and Auditor both run natively inside one Studio Flow, with
no Apps-Script-visible checkpoint between them — a malformed Curator output
still reaches the Auditor, and nothing sees either output until the Flow's
last step writes both to `STUDIO_RETURN`. A literal mid-Flow Apps Script
step is blocked by the same GCP-disabled-org-wide wall that already forced
`kos-personal/studio-steps/`'s custom steps to be dead code — so this has
to be a genuine flow split, not a step insertion.

### 4a. Apps Script side — buildable and testable ahead of the Studio work 🔲
- A validation-gate function reusing `_srPrepareDocText_`'s Curator-JSON
  logic and `SR_NON_ACCESS_PHRASES`, callable against a Curator-only
  intermediate row.
- A new intermediate sheet/tab schema (Curator output → gate → Auditor
  input queue), materialized the same way `STAGING_PIPELINE`/`STUDIO_RETURN`
  already are.
- Finer-grained stage-status constants (`CURATOR_DONE`, `GATE_PASSED`,
  `AUDITOR_DONE`, …) — the full realization of Phase 1b's visibility idea,
  now with real per-stage checkpoints to attach it to.

### 4b. Studio Flow rebuild — your hands-on work, not a PR 🔲
Split the one Flow into two (Curator-only, Auditor-only), wired through the
new intermediate sheet the same way every other Sheets-triggered handoff in
this repo already works. 4a should be fully built, tested, and merged
*before* this half starts, so the Apps Script side is ready and waiting
rather than being built against a half-finished Studio Flow.

### 4c. Cutover + verification 🔲
Confirm the split flow behaves identically to the current one-Flow design
for a real payload before decommissioning the old Flow.

---

## Sequencing note

Phases 0-2 are independent of each other and can happen in any order
without touching a live pipeline. Phase 3 is independent but has real
rollout weight (9 redeploys). Phase 4 is the only phase gated on someone
other than an agent session — its Apps Script half (4a) should still be
built early, so it's ready whenever the Studio rebuild (4b) happens.
