# CAS — Classroom Agency System

A district-deployed (`ccpsnet.net` / CCPS), FERPA-scoped, student-facing
Google Apps Script platform for a Sports/Entertainment/Event Marketing
course pair (course codes **8175** and **8177**). Built on the same
no-external-API-keys, Gemini-native pattern used elsewhere in this repo's
`kos-personal/` system, but otherwise an unrelated codebase.

The curriculum's pedagogical spine is a simulated student-run
**"conglomerate"** business spanning 10 stages (Foundation → Industry/Producer
→ Product → Market Conditions → Price → Rules of the Chain →
Place/Distribution → Promotion → Strategy/Synthesis → Consumer→Producer),
with named divisions (Creative Studio, Apparel & Merch Co., School Store,
Wholesale & Sourcing, Media & PR, Events Division, Esports Division) and
management roles students rotate through. See `curriculum/lesson-cards/`.

**Correction (folded in from an external review pass):** `docs/
KOS_Guide_IT__Admin_Security.pdf` — the file this README used to cite here
as having a "FERPA & Data Privacy Compliance" section — was investigated
and confirmed to describe an entirely different, abandoned architecture:
"The Lobed Knowledge Operating System," an April-era, pre-v8 design
(Compaction Engine, Circuit Breaker, Transaction IDs, a "Narrative
Sanitization" regex scrub of a `STUDY_LOG.txt` file) that predates the
current Cog/Council model and Studio Flows entirely and was never carried
forward into the live system (`kos-personal/rtp-core-router/protocols/
HEREDITARY_WATCHLIST.md` independently confirms this lineage). None of its
described mechanisms exist anywhere in the actual codebase. It has been
archived to `docs/archived/KOS_Guide_IT__Admin_Security_PRE_V8_ARCHITECTURE.pdf`
— **do not hand this to district IT as a current security statement.**
The real, current compliance reference is `docs/SYSTEM_ARCHITECTURE.html`'s
Security Model section (no API keys ever touch a student-facing surface,
prompt-injection denylist, three-point turn-in validation, a forensic
version-history check with an *honestly documented* bypass: a student who
selects-all-and-pastes a pre-written fake report in one fast paste can
defeat it — treated as a manual-review signal, not proof) together with
`docs/FERPA_DATA_MAP.md` (the actual field-by-field FERPA inventory, Say/Do
Ledger finding #5) — these two are the canonical pair now, not the archived
PDF.

---

## Process history

Reconciliation-decision write-ups, per-round bug fixes, and UI/UX
hardening narration — "what was wrong, how it was confirmed, what
changed" for closed items — now live in `HISTORY.md`, not here (external
product review, Finding 10 / "structural" tier). Read `HISTORY.md` when
you need to know *why* something is the way it is; this file stays
focused on what the system currently does and how to work with it.

---

## Directory map

**Every `archived/` subdirectory named below was removed from the working
tree** (external product review, Finding 3 / "this month" dead-code
cleanup — 123 files, 76,080 lines repo-wide, all genuinely superseded, none
of it deleted without a trace). Nothing is lost: the full pre-deletion tree
is preserved on the `pre-archive-cleanup` branch, and every commit before
this cleanup still has it in history. A file this README cites as
"reissued from" or "compared against" an archived original can still be
retrieved from that branch by path.

| Path | Contents |
|---|---|
| `docs/` | Base platform docs (architecture, deployment, Studio flow reference, UX reference, teacher/student/admin guides) + Module 2/3/4/5 documentation + IT/Admin security guide + `FERPA_DATA_MAP.md` (field-by-field FERPA inventory) + `LEADERHUB_CONNECTION_SETUP.md` (the D1 leader-hub OAuth integration's setup doc). `docs/archived/` held superseded docs the source itself marked superseded — removed; see the note above. `docs/notebooklm-sources/` holds hand-converted Markdown copies of the four user-guide HTML docs (quick-start ×2, teacher reference, UX reference), purpose-built as clean NotebookLM upload sources — see that folder's own README.md for why and how they're maintained. |
| `scripts/` | Numbered Apps Script files, base + addenda. `scripts/archived/` held files the source itself marked superseded — removed; see the note above. |
| `data/` | Reference data imported into the Central Ledger at setup time. `data/sol-correlations/` holds the VDOE SOL derivation trail. `data/archived/` held superseded versions — removed; see the note above. |
| `curriculum/` | Pacing guide (3 formats) + per-stage lesson card decks. `curriculum/archived/` held the pre-v2 pacing guide JSON — removed; see the note above. |
| `forms/` | Setup spec for the Warm-Up Response Google Form |

## What Module 1 (the base system) actually is

The base system is **8 separate Apps Script projects** working together
(corrected from an earlier "6" here that put Script 20 on the wrong
project — see `tools/gas-lint/project-map.json`'s header comment, which
flagged this exact mismatch: `20_SetupCheckpoint.js`'s own `INCLUDED IN:`
header says the Unified Manual project, not Central Ledger, and the
file's own header wins; an 8th project, `studio-steps`, was added later
for the Studio Steps adoption — see its own row below):

| Project | Bound to | Scripts |
|---|---|---|
| Central Ledger | Central Ledger spreadsheet | `00`, `02` (intake), `03` (queue bridge), `04` (turn-in gate), `06` (turnstile), `10` (admin recovery), `18` (form dispatcher), `22`/`22b`/`23`/`24`/`25`/`26`/`27` (Module 2 Full), `29`/`30`/`30b` (Module 4/5), `31`/`32`/`33` (Module 2 import/bridge utilities), `34` (queue watchdog), `35` (flow preflight/canary), `36` (weekly parent report — see `docs/FERPA_DATA_MAP.md`'s "Disclosure to parents" section) — see `tools/gas-lint/project-map.json` for the authoritative per-file binding list |
| Unified Manual | Assignment System Manual Doc | `00`, `16` (unified admin+teacher setup wizard — `detectRole_()` picks admin vs. teacher automatically) plus its two still-live `16_*_ADDENDUM` files (their own top-level code shares this project's scope, not a stale leftover), `19` (required by `16`'s `writeConfigTab_()`), `20` (setup checkpoint), `21` (optional Apps Script API auto-installer — binds all 7 projects and deploys both web apps in ~3 minutes instead of ~20 minutes of manual binding per project, see `REGISTRY_SHEET_SETUP.md`), `28` (Module 2 setup) |
| Master Student Template | Master Student Template Doc | `00`, `01` (container script — student-facing menu), `09` (M1Base), `17` (doc-only setup notes) |
| Rubric Response Sheet (cloned per teacher) | cloned sheet | `00`, `05` (teacher rubric intake), `19` |
| Teacher Matrix Sheet (cloned per teacher) | cloned sheet | `00`, `08`, `19` |
| Teacher Dashboard | standalone web app | `00`, `07` (includes the Student Context tab, the teacher-identity gate, and — since D1 — a `doPost()` JSON API for leader-hub: `getPacingGuide`/`getCompetencyRegistry`/`getRoster`, OAuth-token-verified, see `docs/LEADERHUB_CONNECTION_SETUP.md` and `docs/FERPA_DATA_MAP.md`), `29` (student context data read by that tab), `22`/`26`/`27` (lesson-context logging + alignment log + synchronous lesson frame generation, called by Script 07's `submitLessonContext()`), `32` (competency rubric lookup, called by Script 27's frame generation — dual-placed here and in Central Ledger since Script 27 runs in both), `23`/`31` (Module 2 warm-up-readiness summary + pacing-guide lookup, called by Script 07's `getDashboardData()`), `36` (weekly parent reports — the dashboard's review-and-send panel; it may only call functions present in both this project and Central Ledger, since Script 30 isn't in this project — see `36_WeeklyParentReport.js`'s own header) |
| Student Dashboard | standalone web app | `13` |
| Studio Steps | standalone (not bound to a spreadsheet/doc) | 9 `.gs` files under `cas-ccps/studio-steps/` — the custom Workspace Studio step code behind Flows 1-5 (rubric extraction, student evaluation, warm-up generation, warm-up scoring, bridging); see [`cas-ccps/studio-steps/README.md`](./studio-steps/README.md) for the full file-to-flow map. Written and tested, not yet pushed to a live Studio deployment. |

Plus: `15`/`15b` (Studio Flow prompt specs, not deployed scripts).

Each of these 8 projects now has a real, committed `appsscript.json` and
is a clasp-adoption target — see [Version control (clasp)](#version-control-clasp)
below.

**Pipeline in one paragraph:** A student's doc is created from the Master
Student Template (Script 02) with four zones and invisible system-ID
stamps. The student clicks "Run Assignment Check" (Script 01's menu),
which appends a row to `ReviewQueue`. Script 03's `bridgeQueue` (1-min
trigger) moves `PENDING` rows to `STAGING_PIPELINE`, deduplicating against
in-flight evaluations. Script 06's turnstile (1-min trigger) releases one
`PENDING_INFERENCE` row **per teacher lane** to `IN_PROCESS` — a
per-teacher-lane design, not the single global lane used elsewhere in this
codebase — and auto-clears rows stuck `IN_PROCESS` for &gt;12 minutes.
Studio's Flow 2 reads the doc, evaluates it against the teacher's
milestones (set up via Script 05 → Flow 1 → Script 08's confirmation step),
and writes the full formatted report directly into the doc (Script 09
M1Base — see HISTORY.md's resolution 1), then flips the staging row to
`COMPLETE`. Script 03's `backPropagateCompletions` (2-min trigger) closes
out the queue/ledger rows and appends the "what to do next" block. When
the student turns in via the Turn-In Form, Script 04 runs a 3-point ledger
match plus a forensic Drive-revision check — a genuine complete attempt
lands in `PENDING_TEACHER_REVIEW` with an AI-suggested score (1-5 scale,
5 reserved for teacher judgment alone) rather than a terminal `COMPLIANT`;
the teacher confirms or overrides it from the Teacher Dashboard's Pending
Review queue, which is what actually makes the status/score final (Say/Do
Ledger cas-ccps finding #1). A partial or not-a-real-attempt submission
never reaches this queue at all — it goes back through the same
revision-feedback path as before, unchanged.

## Version control (clasp)

Scaffolded, not yet connected to a live account — see
[`meta/CLASP_AND_APPS_SCRIPT.md`](../meta/CLASP_AND_APPS_SCRIPT.md) for
the full rationale. The short version: `cas-ccps/scripts/` doesn't fit
clasp's one-folder-one-project model, since it's 7 of the 8 projects above
sharing overlapping files (`00_SharedConfig.js` alone is pasted into 5 of
them) — `studio-steps`, the 8th, lives in its own `cas-ccps/studio-steps/`
folder and shares no files with the other 7.
[`tools/clasp-sync/`](../tools/clasp-sync/README.md) reconciles the
7-projects-in-one-folder problem — a script reads
`tools/gas-lint/project-map.json` and generates a throwaway per-project
push folder for each (`studio-steps` included) under
`cas-ccps/.clasp-build/` (gitignored, regenerated on demand), so
`cas-ccps/scripts/` itself never has to be reorganized or duplicated in
git. `cas-ccps/clasp/manifests/` holds each project's real
`appsscript.json` (new — none of these projects had a committed manifest
before), and `cas-ccps/clasp/templates/` holds `.clasp.json` placeholders
to fill in with a real `scriptId` once you've run `clasp login` +
`clasp clone`/`create` against the live projects. For
`rubric-response-sheet`/`teacher-matrix-sheet` (cloned per teacher),
target the *master template* — there's no single live script ID once
teachers have their own copies.

## Module status

| Module | Purpose | Status |
|---|---|---|
| **M1** — base intake/grading | See above | ~20 files in hand. Both confirmed bugs (Turn-In Form field mismatch, `16`'s `onOpen()` `ReferenceError`) fixed — see HISTORY.md's resolution 2. `CompetencyRegistry.csv` is now in hand (HISTORY.md's resolution 7). |
| **M2 Lightweight** — Lesson Intelligence | Teacher logs lesson context → `LessonContext` / `AlignmentLog` / `CompetencyRegistry` / `ReportRegistry`; generates term-end alignment reports | Production ready. `22`, `22b`, `26` now in hand (HISTORY.md's resolution 9) — all Lightweight scripts present. |
| **M2 Full (Warm-Ups)** — personalized AI warm-up generation & grading | Nightly cron builds per-student warm-up docs (Studio Flow 3), grades them (Studio Flow 4), tracks a per-student "shadow matrix" | `23`, `24`, `25`, `28` in hand (HISTORY.md's resolution 9); `31`/`32`/`33` (pacing/rubric/artifact utilities) in hand (HISTORY.md's resolution 10). `27_LessonFrameGenerator` — the last remaining Full script — is now in hand too, see HISTORY.md's "27_LessonFrameGenerator — the one Full script closed". |
| **M3** — Student Profile | Extension of Script 23, no new scripts | Designed, per `PLATFORM_DOCUMENTATION.html` — unaffected by this reconciliation pass |
| **M4** — Student Context Aggregator | Weekly per-student living Google Doc, Script 29 | **Production ready** — numbering confirmed correct twice now, see HISTORY.md's resolutions 3 and 10 |
| **M5** — SCR Suggestion & Remediation Engine | Scripts 30/30b; reads CompetencyEvidence, suggests SCR ratings, teacher confirm/override, retry-via-secondary-evidence path | Mixed confidence — see `docs/CAS_Module5_Documentation_v1.1.docx`'s file-by-file table. Flow 2's writer code exists as a custom Studio step (`cas-ccps/studio-steps/CommitStudentEvaluationStep.gs`) and is tested, but **that path is dead on this account** — it was pushed and the step never appeared in Studio's picker, because a Workspace Add-on needs a standard Cloud project the district has disabled (see that folder's README banner). Flow 2's writer now runs in Apps Script instead, via `37_FlowInputBuilder.js` reusing `15c`'s pure parse/write functions. |

`scripts/archived/ARCHIVED_11_StudentFriendlyRejections.js` (merged into
Script 04; renamed to match the repo's prefix convention — HISTORY.md's resolution 13)
is itself informative: it emailed rejection notices to the *student*. The
current Script 04 writes rejections into the doc instead — the system
deliberately moved away from student email entirely at some point,
consistent with the Ledger schema never carrying a student email/only a
GoogleID.

## Flow plumbing added after the first deployment (scripts 37-40)

Cross-module infrastructure rather than a module — all four are bound to
`cas-ccps:central-ledger`, all four exist because the first real deployment
found that Workspace Studio can do less than the design assumed. See
`HISTORY.md`'s deployment section for the walls each one works around.

| Script | What it does | Run it via |
|---|---|---|
| `37_FlowInputBuilder.js` | **The Flow 2 redesign.** Resolves Ledger → MatrixRegistry → TeacherMatrix in Apps Script and materializes one flat literal `FlowInput` row, so the Flow reads a single row and needs no custom step and no variable spreadsheet target. `harvestFlowInputResults()` applies Studio's result back. Two time triggers (1-min build, 2-min harvest). | `installFlowInputTriggers()` once; then automatic |
| `38_LedgerSchemaGuard.js` | Detects and safely repairs Ledger column drift — the live Ledger had shifted so `LEDGER.TEACHER_EMAIL` read a person's *name*, silently breaking the MatrixRegistry hop with no error. Backs the tab up before mutating, and refuses when it can't verify the repair is safe. | `checkLedgerSchema()`, then `repairLedgerSchema()` if it reports drift |
| `39_FlowFixtures.js` | Persistent dummy rows at all five flows' trigger conditions, so a flow has something to match instead of reporting a green "Run Completed" over zero rows. Namespaced `VDOE-FIXTURE-*` / `WUQ-FIXTURE-*` / `fixture-*@example.invalid`, deliberately separate from the canaries' namespace. | `installFlowFixtures()`, `checkFlowFixtures()`, `removeFlowFixtures()` |
| `40_FlowPrompts.js` | Every reusable flow prompt as a constant plus a `FlowPrompts` tab, so a prompt change is a `clasp push` and one function run instead of a hand-paste into each Flow. Flow 2 resolves through `15b`'s existing constant rather than carrying a second copy. `substituteFlowPrompt_()` leaves unmatched placeholders standing — `{{STUDENT_TEXT}}` stays unfilled on purpose, since student response text must not enter the central Ledger (FERPA). | `syncFlowPromptsToSheet()`, `checkFlowPrompts()` |

Flow 2's Apps Script half has a self-provisioning canary
(`runFlow2Canary()` in `35_FlowPreflightAndCanary.js`) that stubs Studio out
deliberately — it verifies the code path, not the flow.

## Known gaps (carried forward so a future session doesn't re-derive them)

1. **Flows 2-5 have never been pushed to a live Studio deployment** — both
   `09_StudentRevisionGuidance_M1Base.js` and `03_QueueBridge.js` assume
   Flow 2 exists, and Module 5 cannot go fully live without it.
   **⚠ Updated since first written:** this used to read "never been
   built" — that's no longer accurate. The custom-step code for all five
   flows (rubric extraction, student evaluation, warm-up generation,
   warm-up scoring, bridging) is now written and tested
   (`cas-ccps/studio-steps/`, see its own README). What's still genuinely
   missing is deployment: that project hasn't been pushed to a real
   Google account (`.clasp.json.template`'s scriptId is still a
   placeholder), and no flow has actually been wired together in Studio's
   builder. "Code exists" and "wired and live" are different facts —
   only the second one closes this gap.
2. ~~`TeacherMatrix` missing a `lesson_unit_id` column~~ — **closed**, see
   HISTORY.md's resolution 12.
3. ~~`CompetencyRegistry.csv` not uploaded~~ — **closed**, see HISTORY.md's resolution 7.
4. ~~`LessonPrimarySecondary_Seed.csv` not uploaded~~ — **closed**, see
   HISTORY.md's resolution 7.
5. **A v3/v4 of `16_UnifiedManualSetup_M5_ADDENDUM_v2.js`** exists
   (referenced by the merged Module 5 doc's Repair Note 4, a Rubric Upload
   Form fix) but hasn't been uploaded. Still open — the Round 3 batch did
   not contain it.
6. Retry thresholds in `30b_SCRRetryRemediation.js` (5 total MET evidence
   rows, 2× secondary-to-primary ratio) remain provisional, unvalidated
   defaults.
7. ~~Scripts 22, 22b, 23, 24, 26, 28, 31, 32, 33 not uploaded~~ — **closed**,
   see HISTORY.md's resolutions 9 and 10. ~~`27_LessonFrameGenerator`
   remains open~~ — **closed**, see HISTORY.md's
   "27_LessonFrameGenerator — the one Full script closed".
8. ~~Two archived-file naming conventions coexist~~ — **closed**, see
   HISTORY.md's resolution 13.
9. ~~`31_PacingGuideManager.js` doesn't yet read the v2 pacing guide's 4
   new fields~~ — **closed.** `PG_HEADERS`/`PG_COL_COUNT`/row-mapping
   extended (16 → 20, append-only); `chain_node`, `esports_connection`,
   `vocabulary_with_definitions`, `studio_flow_hooks` are now read,
   written, cached, and exposed on `resolveUnitForDate_`/`getWarmUpAnchor_`/
   `getAllUnits_`/`getUnitById_`. Fixing this also surfaced and fixed a
   real pre-existing bug: the pacing guide cache was already silently
   overflowing PropertiesService's 9216-byte-per-property limit with just
   the original 16 fields (~28KB measured against real data) — see
   HISTORY.md's resolution 8 for the full writeup and the per-unit-cache fix.
10. ~~`curriculum/PacingGuide_CAS_Context.csv` and `.docx` are stale~~ —
    **closed.** Both regenerated from the adopted v2 JSON — see
    HISTORY.md's resolution 8 for how each was rebuilt/verified. Prior versions archived at
    `curriculum/archived/PacingGuide_CAS_Context_v1_SUPERSEDED.csv`/`.docx`.
11. **`data/CompetencyRegistry.csv` and `data/sol-correlations/` are not
    yet imported into any Sheet** — the files exist in the repo (HISTORY.md's resolution
    7), but nothing has run `importCompetencyRegistry()` (Script `22b`)
    against them in a live deployment. This is a deployment-time action,
    not a repo-file gap, listed here so it isn't mistaken for "already live."
12. ~~Confirmed duplicate top-level declarations across files sharing a
    GAS project~~ — **closed.** `gas-lint` found 6 distinct collisions;
    all 6 fixed and re-verified clean (0 errors, `node --check` passes
    repo-wide):
    - `SP_STUDENT_EMAIL`/`SP_TEACHER_EMAIL`/`SP_STUDENT_NAME`/`SP_SHADOW_MATRIX`:
      `25_WarmUpWriter.js`'s redundant "alias for readability" block
      deleted, its call sites now use the file's own already-unique
      `SP25_*` names directly.
    - `03_QueueBridge.js`'s `SP_QUEUE_ROW_REF`/`SP_STUDENT_FILE_ID`/`SP_CONFIG_ID`/`SP_TEACHER_EMAIL`/`SP_STATUS`
      (STAGING_PIPELINE columns) renamed to `STG_*` — these collided with
      `23_StudentProfileManager.js`'s StudentProfiles-column `SP_*`
      constants of the *same names but different values/meanings*
      (`SP_TEACHER_EMAIL` was 4 in one, 3 in the other).
    - `formatDateYMD_` (three identical copies in `23`/`24`/`25`):
      de-duplicated to the one definition in `23`, relied on via the
      shared Central Ledger project scope from `24`/`25`.
    - **`buildStudentRoster_`** (the serious one — two genuinely different
      functions sharing a name, `23_StudentProfileManager.js`'s
      `(ledgerData, teacherEmail, currentTerm)` vs.
      `29_StudentContextAggregator.js`'s `(ledgerSheet)`): `29`'s renamed
      to `buildValidatedStudentRoster_`, its one call site updated.
    - `extractFormEntryIds_` (`16_UnifiedManualSetup.js` vs.
      `16_UnifiedManualSetup_M5_ADDENDUM_v2.js`, which explicitly
      documented itself as replacing the base version but had never
      actually been merged): merged for real, plus the M6 addendum's
      one-line Lesson Unit extension on top. Both addendum files keep
      their now-inert content as commented-out historical record, not
      deleted.
13. **`03_QueueBridge.js`'s `bridgeQueue()` and `backPropagateCompletions()`
    now take a document lock** — closed. Both run on time triggers (1 min /
    2 min) and mutate `STAGING_PIPELINE`/`ReviewQueue`/`Ledger`; neither
    had any protection against Apps Script running two overlapping
    invocations if a run takes longer than its trigger interval (a real
    risk as those sheets grow), unlike their sibling
    `06_StagingPipeline_Turnstile.js`'s `runStagingTurnstile()`, which
    already locks for exactly this reason. Without a lock, two overlapping
    `bridgeQueue()` runs could both stage the same student submission,
    producing a duplicate AI evaluation; `backPropagateCompletions()` had
    a partial mitigation already (it re-reads the queue row's live status
    immediately before acting, rather than trusting its own stale read),
    which narrowed but didn't close the same race. Both now take
    `LockService.getDocumentLock()` with the same 15-second wait and
    congestion-standdown pattern the Turnstile already used, so a busy run
    stands down instead of racing.
14. **`31_PacingGuideManager.js`'s warm-up anchor cache was silently
    truncating text** — closed. `_loadPacingGuide_()` caches the whole
    pacing guide in Script Properties, and — because a single property
    value is capped at ~9KB — trimmed each unit's `warmup_anchor` to 200
    characters before caching, with no way to tell a genuinely-short
    anchor from one that got cut off mid-sentence. Every warm-up prompt
    built from a cache hit (the common case) silently used the truncated
    200-char version forever, even after the cache warmed up and a fuller
    read would have been cheap. Fixed by tagging each cached unit with a
    `warmup_anchor_truncated` flag at write time; `resolveUnitForDate_()`
    now threads that flag through, and `getWarmUpAnchor_()` checks it
    before returning — if set, it calls new helper
    `_getFullPacingField_(unit_id, fieldName)` to re-read that one unit's
    untruncated `warmup_anchor` directly from the `PacingGuide` sheet, so
    only the (rare) truncated case pays the extra read instead of every
    call. (This entry named the helper `_getFullWarmupAnchor_()` until
    `tools/doc-currency/check.js` pointed out that it does not exist —
    the real one is field-generic, not warmup-specific.)
15. **Setup wizard's three cross-project import calls, corrected fix
    (external product review, Finding 5)** — `28_Module2Setup.js` calls
    `importCompetencyRegistry()`/`importPacingGuide()`/
    `importCompetencyRubrics()` (Scripts 22b/31/32), all bound to the
    Central Ledger project, not `unified-manual` — genuinely separate
    Apps Script projects, confirmed via `tools/gas-lint/project-map.json`.
    The external review's own suggested fix ("expose them over the
    Ledger's existing `doPost` API") is factually wrong: `central-ledger`
    has no web-app surface — no `doGet`/`doPost` — at all today; the one
    `doPost` in cas-ccps lives in the separate `teacher-dashboard` project.
    **Real fix: an Apps Script Library**, the platform's own first-class
    mechanism for exactly this "share functions across bound projects"
    problem. `cas-ccps/clasp/manifests/unified-manual.appsscript.json` now
    declares a `dependencies.libraries` entry (`userSymbol: "CentralLedger"`),
    and all three call sites in `28_Module2Setup.js` now call
    `CentralLedger.importCompetencyRegistry()` etc. — resolved via
    `tools/gas-lint/check.js`'s own `checkUndefinedFunctionCalls`
    (the 3 warnings these calls used to produce are gone; `.`-prefixed
    calls are outside that check's scope by design, since it only flags
    bare identifier calls). Each call site keeps its existing
    `typeof ... !== "function"` guard (now checking `CentralLedger` itself)
    so a deployment that hasn't wired up the Library yet still gets the
    same graceful manual-fallback instructions instead of a bare
    ReferenceError. **What's left is entirely credentialed, same class of
    gap as the clasp connection itself (see "Version control (clasp)"
    below):**
    1. Open the live Central Ledger Apps Script project → Deploy → New
       deployment → select type **Library** → Deploy.
    2. Copy that deployment's Script ID and the version number it was
       just published at.
    3. Fill both into `unified-manual.appsscript.json`'s
       `dependencies.libraries[0]` (`libraryId`, `version`) — replacing
       the `REPLACE_WITH_...` placeholders — then `clasp push` the
       `unified-manual` project (or add the Library by hand via the
       Script Editor's Resources → Libraries UI, entering the same Script
       ID/version — either path produces the same result).
    4. Re-publish a new Library version and bump `version` in the manifest
       any time central-ledger's own code changes in a way that should
       reach `unified-manual` — an Apps Script Library is pinned to a
       specific version on purpose, so central-ledger changes never
       silently reach consumers without an explicit version bump.
16. **Scaling fixes (external product review, Finding 6, "this quarter")**
    — the review counted ~90 `getDataRange()` calls across cas-ccps;
    re-counted at 112 (worse, not better — per-file counts the review cited
    were exact, only the total was understated). Three fixes, each scoped
    to real, verified schema knowledge rather than a blanket rewrite:
    - **Bounded Ledger reads.** Added `LEDGER_COL_COUNT` (00_SharedConfig.js,
      one past the highest `LEDGER` index) and converted the 6 call sites
      across `10_AdminRecoveryPanel.js`, `29_StudentContextAggregator.js`,
      and `30_SCRSuggestionEngine.js` that read the *whole* Ledger tab
      (not a header-driven dynamic column set) from `getDataRange()` to
      `getRange(1, 1, lastRow, LEDGER_COL_COUNT)` — reads exactly the
      columns this schema actually defines, and isn't vulnerable to the
      well-known GAS gotcha where one stray far-right value (ever entered,
      even by accident) makes `getDataRange()` report a wider range than
      the real schema forever after. The other ~106 `getDataRange()` calls
      (against StagingPipeline, RubricQueue, SCRSuggestions,
      SCRDecisionLog, CompetencyEvidence, WarmUpResponses,
      StudentDocRegistry, and header-driven reads generally) were not
      individually converted in this pass — most either read a genuinely
      dynamic column set via header lookup (bounding those requires
      already knowing the header row's width, a chicken-and-egg problem)
      or a tab whose exact schema this pass didn't independently verify
      column-by-column; narrowing the scope here on purpose rather than
      risk silently truncating a column some other function actually needs.
    - **CacheService layer for CompetencyRegistry.** New
      `getCompetencyTextMap_()` (00_SharedConfig.js) — a real
      cross-execution cache (Apps Script's `CacheService`, 6-hour TTL),
      not a module-level variable that resets every execution. Replaces
      the identical `getDataRange()` + header-lookup block
      `30_SCRSuggestionEngine.js`'s `getSCRDashboardData_()` and
      `getStudentScrStandingForCompetencies_()` used to each build from
      scratch on every call. `22b_CompetencyRegistryImporter.js` now
      invalidates the cache entry on every successful re-import, so a
      newly-imported competency is visible immediately rather than
      waiting out the TTL. (The pacing guide — the review's other named
      caching target — already has its own, more sophisticated
      PropertiesService-backed per-unit cache; see Known Gaps #9/#14 above.
      Not touched here; a second, competing cache layer over the same
      data would be a regression, not an improvement.)
    - **Ledger retention, extending the `SCR_RETENTION_YEARS` pattern.**
      See `docs/FERPA_DATA_MAP.md`'s Retention section for the full
      writeup — `LEDGER_RETENTION_YEARS` (Script Property, default 5,
      explicitly unconfirmed against any real district retention
      schedule, same "correct the moment you know the real number"
      framing as `SCR_RETENTION_YEARS` itself) drives
      `_archiveExpiredLedgerRows_()` (`10_AdminRecoveryPanel.js`), run on
      the same daily/on-demand triggers as the SCRDecisionLog archival.
      This one needed a direct check against `FERPA_DATA_MAP.md` first —
      that document explicitly states it "does not assert a retention
      period that isn't actually enforced anywhere," which is exactly
      what inventing a Ledger retention policy would have done without
      this same unconfirmed-default framing; confirmed with the user
      before implementing on that basis.
17. **Flow 2 escape hatch (external product review, Finding 3, "this
    quarter")** — at the time this was written, Flow 2 (Student
    Evaluation) had never been built in Studio (see "Known gaps" above,
    now updated by Finding 18 below), and `15_StudioFlowPrompts.js`/
    `15b_StudioFlowPrompts_Flow2_Revised.js` are specs to paste into a
    Studio Gemini step, not runnable code — meaning nothing anywhere
    could actually exercise Flow 2's evaluation logic (prompt
    construction, response parsing, competency-evidence extraction)
    without a live Studio Flow. kos-personal already solved the general
    version of this with `CFG.INFERENCE_MODE` (`1_Config_And_Deploy.gs`)
    gating a fallback to its own separate, billed managed-inference-service
    (`kos-personal/inference-service/`) — cas-ccps gets an analogous
    opt-in escape hatch, scaled to what it actually needs: no separate
    deployment, just a direct Gemini API call.
    - `cfg.evaluationMode` (`00_SharedConfig.js`, default `"STUDIO"` —
      unchanged behavior) can be set to `"DIRECT_GEMINI"` via the
      `EVALUATION_MODE` Script Property, plus a `DIRECT_GEMINI_API_KEY`
      Script Property, to opt in.
    - `15b_StudioFlowPrompts_Flow2_Revised.js` moved into
      `cas-ccps:central-ledger`'s real file list (was previously excluded
      as "not deployed" in `tools/gas-lint/project-map.json`) so
      `FLOW_2_SYSTEM_PROMPT` has exactly one source of truth for both the
      Studio-paste path and the new direct-call path — see that file's
      own updated header comment for why this does NOT mean Flow 2 itself
      is now deployed in Studio (it still isn't).
    - New `15c_Flow2DirectEvaluationService.js`: `_buildFlow2Prompt_()`
      and `_parseFlow2Response_()` (pure logic, no network — reuses
      `04_Form2_TurnInGate.js`'s existing `scanCompliance_()`/
      `extractSuggestedScore_()` rather than duplicating them, and adds
      parsing for the `[MILESTONE_OUTCOMES: {...}]` line nothing else in
      this repo reads today) plus `runFlow2DirectGemini_()` (the thin
      orchestrator that actually calls `UrlFetchApp`) and
      `writeCompetencyEvidenceFromFlow2_()` (the CompetencyEvidence write
      step Flow 2 itself would otherwise perform, with the same
      "skip a milestone with a blank competency ID, never guess" rule
      `15b_StudioFlowPrompts_Flow2_Revised.js`'s own DEPENDENCY note
      specifies).
    - **Deliberately NOT wired into `06_StagingPipeline_Turnstile.js`'s
      automatic release loop.** Automatically rerouting live student
      submissions through an unreviewed new code path is a materially
      bigger decision than "make Flow 2 testable" calls for — see
      `15c_Flow2DirectEvaluationService.js`'s own header comment. Call
      `runFlow2DirectGemini_()` directly (Script Editor, or a manual
      admin action, with a real Gemini API key) to actually use this path.
    - See `tests/cas-ccps/flow2-direct-evaluation.test.js` for full
      coverage of the pure prompt-building/response-parsing/evidence-write
      logic, plus the mode-gating and error-handling of the one function
      that actually touches the network (with `UrlFetchApp` mocked, not a
      real Gemini call).
18. **Studio Steps adoption — the custom-step code Finding 17's escape
    hatch was working around now exists.** An 8th cas-ccps project,
    `cas-ccps/studio-steps/`, implements every custom step Flows 1-5
    genuinely need (native Studio connectors and Ask-Gemini steps cover
    everything else) — see its own README for the full file-to-flow map
    and the fixes applied while landing it. Also landed in the same
    effort: `34_QueueWatchdog.js` (WarmUpQueue/StagingPipeline/ReviewQueue
    monitoring with Chat-space escalation) and
    `35_FlowPreflightAndCanary.js` (a one-shot health check that, among
    other things, caught a real pre-existing gap — `CompetencyEvidence`
    was never created by any setup script, silently stranding Flow 2's
    evidence writes on a fresh deployment; now fixed in
    `createSCRTabs_()`), both added to `cas-ccps:central-ledger`. This
    closes Finding 17's underlying gap in code, but not in deployment —
    see Known Gap #1: the project exists and is tested, not yet pushed
    live. See `cas-ccps/HISTORY.md` for the full adoption record.

## Naming note

Files prefixed `_ADDENDUM` (and `16_..._v2.js`, `15b_...Revised.js`,
`00_..._v2.js`) are patches — instructions for editing a base script, not
standalone deployable files. `scripts/09_StudentRevisionGuidance_M1Base.js`
and `scripts/07_TeacherDashboard.js`/`08_TeacherConfirmationStep.js`'s
pre-M2/M3 counterparts were **not** added under their original filenames
because this repo's existing `07`/`08` are strictly newer, additive
supersets of them — keeping only the newer copies avoids two files
silently claiming the same canonical name with one of them being stale.
`09` was the one exception, kept under both names (one archived), because
the difference there was architectural, not incremental — see
HISTORY.md's resolution 1.
