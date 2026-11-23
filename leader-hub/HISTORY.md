# leader-hub — process history

Bug-fix narration and dated hardening rounds pulled out of `README.md`
(external product review, Finding 10 / "structural" tier — the same split
applied to `cas-ccps/README.md` and already present for
`kos-personal/README.md` via `CHANGELOG.md`). `README.md` documents the
system as it is today; come here when you need to know *why* something is
the way it is — what was wrong, how it was confirmed, and what changed —
for closed items.

Everything that describes a still-live feature or an ongoing design
decision (AI drafting, the Settings panels, the Organizations/EE1/EE2/
FF1/GG1/HH1/II1 feature arc, the cas-ccps↔leader-hub integration, the
credentials cleanup, the `src/` split, clasp) stays in `README.md` or,
since 2026-11-17, the feature doc in `docs/` that it maps,
even where it also narrates a bug found while building it — moving that
here would break its own internal "see X below/above" pointers for no
reason, and a new reader needs it to understand the current app, not just
its history.

---

<!-- archive:pointer (tools/archive/file.js writes this) -->
**Entries before 2026-10-29** are archived word for word by school quarter: [2026-27, 1st quarter](../archive/2026-27-Q1/leader-hub/HISTORY.md).
This file holds the current plan of record's era; `node tools/archive/search.js --entries`
searches the archived ones entry by entry.
<!-- /archive:pointer -->
## The DECA hub's title and registration email name the season's year, 2026-11-23

The hub's subtitle said "25–26 Season", typed into both the page markup and
`_applyProfileToStaticDOM()`, and the members' registration email asked for
registration "for the 25-26 season". Both now read the season's year
(`DECA_SEASON.year`, else `DECA_SEASON_YEAR`), and saving or loading a season
retitles the hub at once.

## A passing error never replaces LeaderHub's own spreadsheets, 2026-11-23

`_getLhDataSpreadsheet_` (Data.gs), the AI queue's and Org Sync's sheets
(EmailBridge.gs) took any failure to open their sheet as "deleted", made a
new empty one and repointed the Script Property: one passing Google error
would leave every synced record (or the shared organizations) behind and the
page empty. `_lhOpenOwnSheet_` now returns null only when Drive says the sheet
is gone or in the trash; anything else throws ("Nothing was replaced; try
again"). From the count of silent catches (cas-ccps HISTORY, same date).

## DECA conferences come from the season, one set per school year, 2026-11-23

The operator: "Each school year should have a new batch of DECA
conferences." The Competitive Results board and the Admin Approval
Checklist had fixed lists of the 25–26 conferences (`DECA_RESULT_EVENTS`,
`DECA_APPROVAL_EVENTS`), and the checklist found its trip by sample-data
trip numbers. Now both read `decaSeasonConferences_()`: the `DECA_SEASON`
stages with a `conference` name (the built-in 26–27 season tags Power
Trip, DLC, SLC and ICDC; DLC, SLC and ICDC are `competitive`, so on the
results board), keyed `<year>:<name>` from the season's new `year`. Results
and ticks are saved under that key, so loading next year's season starts a
new set; results under other keys (last season's `dlc25`, `slc26`,
`icdc26`) stay, under "Earlier seasons", and the Brag Board still reads
them. A conference's trip is the one departing from two days before it
through its last day. A saved season with no year or tags shows how to fix
it (Edit Season, the built-in season) instead of empty cards.

## Key contacts editable, the Gmail horizon source retired, last season's data gone, 2026-11-23

The operator's decisions on the 11-22 dead-ends audit (2.11, 2.12, 2.14).

- **Key contacts and the chapter reference** are edited on the DECA hub
  (✏️ Edit: one line each, fields split on `|`) and saved to the server's
  copy like every setting (`lh_keyContacts`, new `lh_chapter_reference`).
  Key contacts could only be filled from the browser console before.
- **The Gmail horizon source is retired.** `scanHorizonLabel_()` had
  returned `[]` since September, behind a "temporarily off" banner,
  though the crash it was switched off for was traced elsewhere on 09-28.
  Turning it on would have meant a Gmail read permission for a web app;
  manual horizon entries and Org Sync cover the need. Gone: the scanner,
  `lhGetHorizonItems`, the `markConsumed` action and its stored list, the
  page's 10-minute poll and its toast, and the Email Bridge modal's banner
  and Poll Now button.
- **Last season's typed-in data is gone** from the DECA hub: the 25–26
  trip cards ("RESULTS PENDING" for a conference long over), the fee and
  deadline lists, and an ICDC 2026 alert whose dates had passed. The
  timeline card is titled from `DECA_SEASON`, which the season editor
  already keeps current. The results board and the approval checklist
  followed the same day (the entry above).

## The deploy-version report checks its permissions, 2026-11-21

- **Now:** `DeployVersionReport.gs` holds the one deploy-version report
  block kos-personal and cas-ccps also carry, copied from
  `shared/deploy-report/deploy-version-report.js` by
  `tools/flow-harness-sync/sync-deploy-report.js` (structure audit 3.8).
  `reportDeployVersion()` keeps its owner guard and calls
  `_reportDeployVersion_('leader-hub:app', LH_DEPLOY_VERSION_SHA)`; the
  installer keeps `_lhRequireOwner_` and calls the block's
  `_installDeployVersionReportTrigger_`.
- **New:** before reporting it tries each scope the manifest lists, and
  after reporting it throws when one isn't granted, so the trigger's
  failure email names it. Before this only cas-ccps checked.
- **Why:** three hand copies had drifted; one block means a fix lands in
  every system. Takes effect at the next push.

## Drive IDs out of the code: the release gate, 2026-11-20

- **Now:** the lesson-plan table (`LESSON_PLANS`, src/09) holds no doc ID.
  Each plan's Google Doc comes from the LeaderHub Data spreadsheet's new
  `doc_ids` tab (key, docId), which `lhBootData_` (Data.gs, `lhDocIds_`)
  sends with the page; the page fills `lp.docId` from it at load, so
  `LP_EDITS` (keyed by doc ID) keeps every saved edit. A plan with no row
  gets a key of its own (`missing_<id>`). The blackout-dates link (src/06)
  is `lhDocLink('blackout_dates', …)` (src/05), the label alone without a
  row. The 119 IDs and the blackout doc were written to the tab before the
  code changed. A LICENSE (the cas-ccps license) is new here.
- **Why:** the release gate (L1) went on at the operator's word; Drive IDs
  are never allowed in the repo.
- **Tests:** `finance-sales-log-escaping.test.js`'s line numbers moved with
  src/09.

## Drive IDs out of the LeaderHub docs, 2026-11-15

- **Now:** `LEADERHUB_EMAIL_SETUP.md`, `LEADERHUB_GEM_PROMPT.md`,
  `LEADERHUB_README.md`, `LEADERHUB_WIP.md`, `LEADERHUB_HANDOFF.md`,
  `LH_02_INTEGRATION_GUIDE.md`, `LH_04_EMAIL_AUDIT.md` and
  `drive-tools/LH_Drive_README.md` show `<sheet ID>`, `<deployment ID>`,
  `<folder ID>` or "(ID removed)" where a real Sheet, doc or web app ID
  was. The app's own lesson-plan table (`LESSON_PLANS` docIds, src/09) and
  the blackout-dates link (src/06) are code and stay, for the operator's
  release decision. doc-currency Check 6 now fails on a Drive ID in a doc.

## Two security items: the horizon GET route and Organization Sync, 2026-11-15

- **`?api=horizon`.** `doGet()` answered it before the owner check, so any
  account in the domain got JSON (from `scanHorizonLabel_()`, a stub
  returning `[]`). Nothing called it: the page uses `lhGetHorizonItems()`,
  owner-gated. The route and `emailBridgeGetHorizonItems_()` are removed;
  the request now meets the owner check.
- **Organization Sync.** Push and pull checked only the caller's domain, the
  org id is a guessable slug, and students share the domain: a student
  could read a roster (members' and parents' contact details) or overwrite
  it. Callers traced: the owner's own page (local, never through
  `doPost()`) and co-advisors relaying from their own deployments
  (`lhOrgSyncCall_`); no student-facing page. Fix: an allowlist, the owner
  plus `ORG_SYNC_CO_ADVISORS`. It is warn-and-count until the operator sets
  that property, because enforcing at once would lock out a co-advisor
  already syncing. A per-org secret was the alternative; it would have
  needed every co-advisor to re-join with a new share code.
- **Escaping.** Traced every place org-sync or mail-derived values reach
  the page. Most were already escaped or written as text. Four were not, and
  now are: a horizon item's id (attribute and three handlers) and its
  aria-label, a deadline's role in `onclick` (a mail item sets the role),
  a deadline's id in an `id`, and an org id in the org tabs and the
  Add-result button.
- **Tests:** `org-sync-relay.test.js` (warn-only and enforced, the owner
  always allowed, a student refused with nothing read or written, `none`),
  `horizon-route-and-sync-escaping.test.js`; `plain-words.test.js`'s
  pattern follows the escaped call.

## The "5 Ideas per Work Area" modal retired, 2026-11-22

Settings' Quick Links opened 25 feature ideas as cards that nothing
tracked, some since built (sub plans, the DECA season timeline), with an
unused `surveyAnswers` beside them (11-22 dead-ends audit, item 2.13).
Retired; the backlog in `meta/BACKLOG.md` is where ideas live.
