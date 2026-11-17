# Organizations

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

## Settings → Organizations (DECA generalized to any club/CTSO)

DECA was the last hardcoded "extracurricular" concept in the app — a
dedicated nav button, a fixed 12-title officer list, a hardcoded 3-conference
(DLC/SLC/ICDC) results/qualification structure, and a `students` roster
array that assumed every row was a DECA member. Adam's own DECA chapter is
**completely unchanged** — same officer titles, same 3 conferences, same
Hub content (season pipeline, approval checklist tied to real trips, chapter
reference/contacts/email templates), same data. This round makes the
underlying system generic so another teacher's club, CTSO, or student
organization can be added the same way a Course Catalog course is:

- **`ORGANIZATIONS`** (built-in `deca` + a `CUSTOM_ORGS` overlay, then
  localStorage, now a server config key, same additive pattern as the Course Catalog) holds each
  organization's name/icon, its own **officer position list**, its own
  **competition/achievement levels** (DECA's are `DLC`/`SLC`/`ICDC`; a
  differently-tiered CTSO or a non-competitive club can define its own, or
  none at all), and its own placement vocabulary.
- **Settings → Organizations**: lists every organization (built-in vs.
  imported), an "Import Organization (JSON)" upload with a
  preview-before-add confirmation, a downloadable blank template, and a
  remove control for imported organizations only.
- **The roster is now organization-scoped.** Every `students[]` row gained
  an `org` field (existing rows silently backfilled to `'deca'` — nothing
  to migrate by hand); the Members page grew an organization tab bar
  (mirrors the SCR course tabs) and all its CRUD (add/edit/delete, officer
  grid, stats strip, CSV export) filters by whichever organization tab is
  active. The Add/Edit Member modal repopulates its Position and
  Membership Status dropdowns from the active organization's own config —
  DECA's exact original dropdowns (officer titles + competitive
  categories, all 6 statuses including SLC/ICDC qualifier) are restored
  byte-for-byte when DECA is active; another organization gets its own
  officer titles, a plain "Member" option, and the 5 non-competition
  statuses, with the DECA-specific Competitive Event field hidden.
- **A new, separate, simpler Results Board** (`renderOrgResults()`,
  storing to its own `lh_org_results` key) exists for organizations
  besides DECA — a flat "Results Logged"/"Top Finishes" summary, then
  either one table per configured level or a single flat table for a
  non-competitive club. This is a parallel implementation, not a
  refactor of DECA's own results board (`renderDecaResults()`/
  `lh_deca_results`, still exactly as before) — keeping the two separate
  means nothing about DECA's results/qualification tracking could
  possibly be affected by this change.
- **DECA's own Hub page (season pipeline, approval checklist, chapter
  reference) is unchanged and still DECA-only** — that content is
  hand-authored, CCPS/trip-specific material, not something a generic
  config can stand in for. Any other organization gets a simpler
  auto-generated hub (its officers + its results board), with a pointer
  to the Members page for full roster management.
- **The module toggle is renamed generically**: `MODULES.deca` →
  `MODULES.orgs` (an existing on/off preference is carried over
  automatically, not reset), and the nav button/sidebar accordion header
  now show the one configured organization's own name, or "Organizations"
  once more than one exists.
- **Fixed a real bug found while wiring this up**: the "DECA event
  tomorrow" banner fired unconditionally regardless of the module
  toggle — even with Organizations turned off (nav/sidebar hidden), the
  banner would still appear and its button would navigate to a hidden
  view. Now gated behind `MODULES.orgs`.

**Deliberately out of scope for this round** — a genuinely different,
much larger undertaking, discussed with Adam and intentionally deferred:
**sharing an organization between co-advisors.** Everything in LeaderHub
was then single-browser localStorage; making an organization's roster/
results genuinely shared means introducing a real synced datastore (a
Google Sheet via an extended `EmailBridge.gs`, in the direction agreed
on) with actual conflict-handling for simultaneous edits — a separate,
substantial round on its own, not a corner of this one. **Built in the
very next round — see "Settings → Organizations — Co-advisor sharing
(EE2)" below.** Also deferred,
narrower and lower-value: the long tail of hardcoded "DECA" references
outside the Hub/Members/Results core — Brag Board's DECA-specific
audience tone and win-source, the sub-plan absence-reason enum, the
quick-thought keyword classifier, the permission-slip roster-source
label, and the trip-archive name-matching filter all still say "DECA"
specifically rather than reading the active organization's name.

Verified with `node --check` on both `<script>` blocks, `node
tools/gas-lint/check.js` (clean except the 2 pre-existing unrelated
cas-ccps warnings), parsing the new `ORGANIZATIONS` config back out of
the file to confirm it's intact, and a Node harness covering the
organization-import validator (malformed JSON, duplicate id, missing
fields, id sanitization, level-key derivation), roster organization-
scoping (legacy-row backfill, per-org filtering), and the `MODULES.deca`
→ `MODULES.orgs` migration.

## Settings → Organizations — Co-advisor sharing (EE2)

The "deliberately out of scope" item from the round above — sharing an
organization's roster/results between co-advisors — is now built. It
reuses `EmailBridge.gs`, the Apps Script code (now part of the one
`leader-hub:app` web app) that backs the Email Bridge and AI drafting
features, extended with
three new POST actions and a **second, independent Spreadsheet**
("LeaderHub Org Sync" — never the AI Queue one) that acts as the shared
datastore.

**Access model.** Because the Web App is deployed "Execute as Me,"
whichever teacher shares an org owns the backing Spreadsheet — a co-advisor
never needs their own Google Drive sharing permissions on it. Sharing one
organization does not expose the AI Queue's data or vice versa — they're
two separate Spreadsheets behind the same URL.

**How a co-advisor joins (fixed 2026-09-29).** Each advisor runs their own
LeaderHub deployment, and the page's `google.script.run` only ever reaches
the deployment serving it. So a co-advisor's push, pull and join used to
land in their *own*, empty org-sync spreadsheet, and the join list (owner-
only) could never show the other advisor's orgs. Now:
- The sharing advisor clicks **📋 Copy share code** on a shared org. The
  code is `<orgId>@<their bridge /exec URL>`.
- The co-advisor pastes it under **Join a Shared Organization**.
- From then on that org's push/pull go through `lhOrgSyncCall()` on the
  co-advisor's own server, which POSTs to the sharing advisor's bridge with
  the co-advisor's own OAuth token (`lhOrgSyncCall_`, `EmailBridge.gs`). The
  bridge's `doPost()` sees a same-domain user, which push/pull already allow;
  `listOrgSyncs` stays owner-only. Only Apps Script `/exec` URLs are relayed
  to.

**Who may push and pull (2026-11-15).** The domain lock let any account in
the domain pull or overwrite an org whose id it guessed (`deca`, `fbla`),
and student accounts share the domain. The only legitimate callers are the
owner (from their own page, which never goes through `doPost()`) and
co-advisors relaying from their own deployments; no student-facing page
calls push or pull. So `doPost()` now checks an allowlist: the owner plus
the emails in the Script Property **`ORG_SYNC_CO_ADVISORS`** (comma- or
space-separated; `none` for the owner alone). **Setting it is the one step
that turns enforcement on.** Until it is set, a same-domain account that
isn't the owner is still let through, as before, but counted:
`ORG_SYNC_UNLISTED_CALLS` holds `{count, last}` and the log gets a line
(never the account), so the owner can see whether anyone unlisted calls
before switching it on. A co-advisor who isn't listed sees "Not authorized:
ask the advisor who shared this organization to add you as a co-advisor."
Tests: `org-sync-relay.test.js`.

**Layout on the Sheet side.** A `_org_meta` tab (one row per shared org:
`OrgId, OrgName, ConfigJSON, UpdatedAt, UpdatedBy`) plus per-org
`roster_<orgId>` / `results_<orgId>` tabs, written as **real spreadsheet
rows**, not a JSON blob in one cell — a 60–100+ member roster as a single
JSON cell risks Sheets' ~50,000-character cell limit, and real rows let a
co-advisor open the Sheet directly and read (or, in a pinch, hand-edit)
data without LeaderHub at all. The client sends its own header row
alongside the data on every push, so `EmailBridge.gs` never needs to know
student/result field shapes — a future schema change on the client side
never requires touching the `.gs` file.

**Conflict model: optimistic concurrency (compare-and-swap) on
`UpdatedAt`, not field-level merging.** Every push carries
`expectedUpdatedAt` — the pusher's last-known remote state for that org.
If the Sheet's actual current `UpdatedAt` doesn't match, someone else
pushed in between: the server rejects the push with `{conflict:true,
remoteUpdatedAt, remoteUpdatedBy}` and writes nothing, and LeaderHub shows
a conflict dialog with two explicit choices — **Pull Latest First**
(recommended) or **Push Anyway** (overwrite the other advisor's change).
There is no silent auto-merge in either direction. This is
last-full-snapshot-wins-with-a-warning — sufficient for the low-
concurrency, two-or-three-advisor case this is built for, not a
substitute for real-time collaboration. Two advisors editing the *same*
org at the literal same instant can still race past the check (the
window between "read the current UpdatedAt" and "write the new one" is
small but nonzero) — the compare-and-swap catches the much more common
"someone pushed since your last pull" case, not every theoretically
possible interleaving.

**Client-side additions:**
- `lh_org_sync` (then localStorage, now a server config key) — per org, `{enabled, lastKnownRemoteUpdatedAt,
  lastSyncedAt, lastSyncedBy, bridgeUrl, ownBridgeUrl}`. `bridgeUrl` is the
  sharing advisor's `/exec` URL ('' = this deployment's own);
  `ownBridgeUrl` is this deployment's URL, which goes into the share code.
- Settings → Organizations gained, per org: a **Share with a co-advisor**
  button (first push) when not yet shared, or **Pull** / **Push** /
  **Stop sharing** controls once it is — deliberately separate Pull and
  Push actions rather than one merged "Sync," so a teacher always knows
  which direction data is about to move before it moves.
- **Join a Shared Organization** — takes a share code (above). For the
  bridge's own owner it also lists every org shared on that bridge
  (`listOrgSyncs`), with a Join or Pull Latest button per row.
- A conflict dialog (`_showOrgSyncConflictModal`) for the rejected-push
  case described above.
- Pulling a **non-DECA** org also adopts its shared config (officer
  positions, levels, placement options) as local — that's the point of
  sharing a custom org. **DECA's own hardcoded config is never touched**
  by a pull, matching the guarantee the rest of this app makes about
  Adam's built-in DECA experience; only DECA's roster/results sync.
- Local roster/result IDs are never trusted back in from a pull — they're
  per-browser bookkeeping, not a cross-device key, so a pulled roster row
  gets a fresh local id from the existing `nextId.st` counter instead.

**Not covered, by design:** true real-time collaboration (this is
pull/push, not a live multiplayer document), and automatic background
sync (nothing pushes or pulls without a teacher clicking a button —
avoids a surprise overwrite from a stale tab left open in the
background).

Verified with `node --check` on `EmailBridge.gs` and both `<script>`
blocks of the HTML file, `node tools/gas-lint/check.js` (clean except the
2 pre-existing unrelated cas-ccps warnings), and a Node harness
(`verify_ee2.js`) that loads the real `EmailBridge.gs` source into a
sandboxed VM context with an in-memory Spreadsheet/PropertiesService mock
and exercises the actual shipped `pushOrgSync_`/`pullOrgSync_`/
`listOrgSyncs_` functions — first push, list, pull, in-sync push, stale-
push rejection (conflict:true, and confirming the rejected push wrote
nothing), pull-then-push recovery, two independent orgs not colliding on
each other's tabs, ragged/mismatched row widths normalizing instead of
throwing, and repeated pushes updating one meta row instead of appending
duplicates (21 checks, all passing).

## FF1 — the long tail of hardcoded "DECA" references, closed out

EE1's own "deliberately out of scope" list named five narrower,
lower-value spots outside the Hub/Members/Results core that still said
"DECA" literally instead of reading it from `ORGANIZATIONS`. All five are
now fixed — plus one real bug found while fixing them:

- **Brag Board win-source.** `gatherBragData()` only ever read
  `lh_deca_results` — any results logged for a non-DECA organization
  (via `ORG_RESULTS`, EE1's generic results board) never showed up in a
  weekly wins email at all. Now gathers an additional `orgResults` section
  from every non-DECA organization, additive to (never replacing) DECA's
  own "DECA results:" section.
- **Sub-plan absence-reason enum.** The "Reason for Absence" dropdown had
  a literal `🏆 DECA Trip` option and mailto subject line. Both now read
  `ORGANIZATIONS.deca.name`/`.icon` — unchanged text for Adam today, but a
  fork that renames its own org config has this follow automatically
  instead of needing to be hunted down by hand.
- **Quick-thought keyword classifier.** `organizeThought()`'s rule-based
  role classifier had a `deca` keyword list hardcoded to DECA-specific
  terms (`ICDC`/`SLC`/`DLC`/`chapter`/`membership`/...) — a teacher whose
  only organization is FBLA typing "FBLA fundraiser" never classified into
  that bucket. The internal role key stays `deca` (it's a stable
  identifier shared with `DEADLINES`/`HORIZON` role tagging and
  `EmailBridge.gs`'s `#role:` hashtag convention — renaming it would be a
  real migration, not a hardcoding cleanup), but the keyword *list* now
  folds in every configured organization's own name and achievement-level
  labels, additive to the original DECA terms.
- **Permission-slip roster-source label — plus a real latent bug.** The
  "Add Student to Slip Tracker" panel's "🏆 DECA Members" button is now
  driven by `ORGANIZATIONS.deca`. While fixing the label, found that
  `renderDecaPicklist()` never actually scoped to `s.org === 'deca'` —
  once EE1 gave every organization its own roster, adding a second club
  silently mixed its members into a picker still labeled "DECA Members,"
  offered against DECA-only status filters (SLC/ICDC Qualifier) that don't
  even apply to them. Fixed by scoping the picklist to DECA specifically
  (this panel's filter vocabulary is DECA-only by design, unlike the
  fully generic `ORG_RESULTS` system).
- **Trip-archive name-matching filter.** The Archive view's "🏆 DECA"
  quick filter matched the literal substring `'deca'` against a trip's
  name — fragile even for Adam (a trip named "SLC Weekend" wouldn't have
  matched) and completely dead for any other org. Now matches against
  `ORGANIZATIONS.deca.name` (case-insensitive), with the filter button's
  own label following the same config.

All five fixes read `ORGANIZATIONS.deca` rather than hardcoding a second
"generic org" system for this narrow tail — DECA's own filter vocabulary
(SLC/ICDC statuses, its season pipeline) stays DECA-specific by design,
same as the Hub/Members/Results core EE1 already locked in. None of this
changes what a custom imported organization can do; it only stops a
handful of DECA-only conveniences from silently breaking (or leaking
data) once a second organization exists.

Verified with `node --check` on both `<script>` blocks, `node
tools/gas-lint/check.js` (clean except the 2 pre-existing unrelated
cas-ccps warnings), and a Node harness (`verify_ff1.js`, 18 checks) that
re-exercises each fix's logic directly — the Brag Board org-results
gather (in-range filtering, DECA never double-counted), the label-lookup
fallback to `ORGANIZATIONS.deca`, the archive filter's config-driven
match against both the real DECA config and a simulated renamed fork, the
classifier's keyword generalization, and the slip-tracker picklist's
org-scoping (confirming a non-DECA member no longer leaks into the "DECA
Members" list).
