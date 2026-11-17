# `cas-ccps/README.md`: passages moved out on 2026-11-17 (archived)

History moved word for word out of the live `cas-ccps/README.md` on
2026-11-17: corrections of earlier states, resolved "Known gaps" write-ups and
out-of-date passages, grouped under the README heading each came from, in
their original order. Links inside are relative to `cas-ccps/`. The live
README: [`cas-ccps/README.md`](../../../cas-ccps/README.md).

# cas-ccps/README.md: passages moved out of the live README (2026-11-17)

_Word for word, in original order, grouped under the README heading each came from. File as `archive/2026-27-Q2/cas-ccps/README.md`._

## CAS — Classroom Agency System

_A correction of an earlier state of this README (the superseded security PDF)._

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
described mechanisms exist anywhere in the actual codebase. It was
archived as `docs/archived/KOS_Guide_IT__Admin_Security_PRE_V8_ARCHITECTURE.pdf`,
then removed with the rest of the archived files (it is on the
`pre-archive-cleanup` branch; see the Directory map) — **do not hand it to
district IT as a current security statement.**

## Module status

_History of a removed script; the GoogleID note is also in docs/FERPA_DATA_MAP.md._

History: `scripts/archived/ARCHIVED_11_StudentFriendlyRejections.js`
(merged into Script 04; renamed to match the repo's prefix convention —
HISTORY.md's resolution 13; removed with the other archived files, on the
`pre-archive-cleanup` branch) emailed rejection notices to the *student*.
Script 04 then wrote rejections into the doc instead, until its turn-in gate
was retired on 2026-10-10; the system sends students no email. (The
Ledger's `GoogleID` column holds the student's district email, not a
separate ID; see `docs/FERPA_DATA_MAP.md`.)

## The Form reader at Submit (Phase 4b, 2026-11-08)

_Superseded: the part was marked on 2026-11-09 (see "Marking a part as a form" in the README)._

- **Recommended for 8177 Market Research, Part 2 "Build the Survey"**
  (the lesson's own rules: three questions, a bias-free survey, the form
  must not collect email addresses): `"formChecks": {"minQuestions": 3,
  "collectsEmail": false}`. Not set in the shipped data: the operator marks
  the part (`workType` and `formChecks` together) in a later small PR.

## Turn-in codes (script 71)

_An archived one-shot probe (script 70) and a scope note made stale by the Phase 4b reader._

`70_WorkFileProbe.js` (2026-11-01), Phase 4's one-shot design check
(`probeWorkFileTypes()`: what Apps Script reads back from a form, a deck and
a sheet), ran once on 2026-11-01; its answers are in the student work plan,
§5. **Archived 2026-11-07** to `archive/2026-27-Q2/cas-ccps/archived/` (`archived/README.md`):
no longer in the Central Ledger project, so the next push removes it there.
Its test is `tests/cas-ccps/archived/work-file-probe.test.js`, run by hand.
The Ledger keeps its Forms scope for the Phase 4 Form reader (Nov 9), so
there is no second consent prompt; gas-lint warns it is unused until then.

## Known gaps (carried forward so a future session doesn't re-derive them)

_Closed items 1-4 and their resolution write-ups._

1. ~~Flows 2-5 are not live: each one's Studio side still has to be built
   by hand~~ — **closed**. **⚠ Corrected three times, worth reading in
   full before touching Flow 2-5 code again.** It first read "never been
   built." It then read "the custom-step code is written and tested;
   what's missing is deployment — that project hasn't been pushed to a
   real Google account (`.clasp.json.template`'s scriptId is still a
   placeholder)." Both were wrong, the second wrong in the expensive
   direction: the `studio-steps` project **was** pushed successfully, and
   its steps still never appeared in Studio's picker. A custom step is a
   Workspace Add-on and needs a standard, non-default Cloud project; GCP
   is disabled org-wide for `ccpsnet.net`. All 8 steps (2,113 tested
   lines) are unreachable on this account, and so is `15c`'s
   `DIRECT_GEMINI` escape hatch, which needs an API key, which needs the
   same project. Pushing fixes none of it. All five flows were then
   **ported** to native Studio steps plus an Apps Script harvest
   (`37_FlowInputBuilder.js`, `41_WarmUpFlowBridge.js`) — a keyless path
   that does work here — and, per `DEPLOYMENT_HANDOFF.md`'s current status
   banner, all five have since been built in Studio and confirmed via
   `checkFlow2Liveness()`/`checkWarmUpFlowLiveness()`. "Verified" there
   meant a real Studio run against seeded fixture data. Real use followed:
   every rostered student got a workspace doc on 2026-10-07 (71 in 8175, 21
   in 8177), the first real submissions were evaluated on 2026-10-15/16,
   and students have answered nightly warm-ups since 2026-10-19. Still not
   seen as of 2026-10-22: a real submission whose Flow 2 run started by
   itself (`archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md`). `docs/IMPACT_DASHBOARD.html`
   still shows zero recorded deployments; nothing has been entered in it.
   "Code exists," "reachable," "wired and
   live," and "used by a real student" are four different facts — this
   repo has now been burned by conflating the first three; don't conflate
   the fourth either.
2. ~~`TeacherMatrix` missing a `lesson_unit_id` column~~ — **closed**, see
   HISTORY.md's resolution 12.
3. ~~`CompetencyRegistry.csv` not uploaded~~ — **closed**, see HISTORY.md's resolution 7.
4. ~~`LessonPrimarySecondary_Seed.csv` not uploaded~~ — **closed**, see
   HISTORY.md's resolution 7.

_Closed items 7-10._

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
    `curriculum/archived/PacingGuide_CAS_Context_v1_SUPERSEDED.csv`/`.docx` (since removed; on the `pre-archive-cleanup` branch).

_Closed items 12-14 (the fix write-ups)._

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

_Item 15: how the external review's suggested fix was found wrong._

    The external review's own suggested fix ("expose them over the
    Ledger's existing `doPost` API") is factually wrong: `central-ledger`
    has no web-app surface — no `doGet`/`doPost` — at all today; cas-ccps's
    `doPost`s live in the separate `teacher-dashboard` and
    `student-dashboard` projects.

_Item 16: the review's count and the first two fixes' write-ups._

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
      `30_SCRSuggestionEngine.js`'s `getSCRDashboardData_()` (since
      deleted) and `getStudentScrStandingForCompetencies_()` used to each build from
      scratch on every call. `22b_CompetencyRegistryImporter.js` now
      invalidates the cache entry on every successful re-import, so a
      newly-imported competency is visible immediately rather than
      waiting out the TTL. (The pacing guide — the review's other named
      caching target — already has its own, more sophisticated
      PropertiesService-backed per-unit cache; see Known Gaps #9/#14 above.
      Not touched here; a second, competing cache layer over the same
      data would be a regression, not an improvement.)

_Item 16: how the retention default was checked before it was built._

      This one needed a direct check against `FERPA_DATA_MAP.md` first —
      that document explicitly states it "does not assert a retention
      period that isn't actually enforced anywhere," which is exactly
      what inventing a Ledger retention policy would have done without
      this same unconfirmed-default framing; confirmed with the user
      before implementing on that basis.

_Items 17-18: the Flow 2 escape hatch (external review Finding 3) and the Studio Steps adoption, both closed._

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
    closes Finding 17's underlying gap in code and, since central-ledger's
    pushes (most recently 2026-10-05), in deployment too. See `cas-ccps/HISTORY.md` for the full adoption record.
