# Deployment Runbook — kos-personal, leader-hub, cas-ccps

**Reconciliation note:** this file merges two independent drafts of the
same runbook produced during an external review pass (folded in —
Addendum 22 R9). Both covered the same ground; this version keeps
whichever draft got a given step more completely or more correctly right,
not just whichever read better.

The picture to hold onto throughout: you have a **practice field** (your
personal Google account) and a **real stadium** (the ccpsnet.net district
account, where students actually are). A robot assistant (GitHub Actions)
is allowed to run rehearsals on the practice field as often as it wants.
Only you, at your own keyboard, already logged into clasp, ever walk
something into the real stadium. No production credential ever lives
anywhere except your own machine. That's "Option 2."

Three projects, three different shapes:

| Project | Script projects involved | Who it's for | Stakes |
|---|---|---|---|
| kos-personal | 1 (single flat folder) | You, personal account | Low — no students touch this |
| leader-hub | 1 (`EmailBridge.gs` only — the HTML app itself has no deploy step at all) | **Belongs to Adam Berneche per its own README, not confirmed as yours** | Depends on ownership — see Part 2 |
| cas-ccps | 7 (`central-ledger`, `unified-manual`, `master-student-template`, `rubric-response-sheet`, `teacher-matrix-sheet`, `teacher-dashboard`, `student-dashboard`) | Students, district account | High — this is the one the whole air-gap policy (SMP-004) exists for |

Do these in order. Parts 0 and 1 you can do today. Part 3 (cas-ccps) takes
real setup time — budget it separately, and start with just the one pilot
project as noted.

---

## Part 0 — One-time: confirm clasp is talking to the right account

```
clasp show-authorized-user
```

Check the email it prints against whichever account should own the
project you're about to touch. Do this again anytime you switch between
your personal account and the district account — it's the one mistake
that's easy to make and annoying to unwind.

> **clasp 3.x renamed several commands from the 2.x conventions this
> runbook was originally written against.** Confirmed against the real
> installed CLI during a live deployment, not assumed: `login --status`
> doesn't exist anymore (`show-authorized-user` replaces it, as above);
> `clasp open` alone doesn't work (`clasp open-script` opens the code
> editor; `clasp open-web-app` — note the hyphens — opens the live
> deployment URL instead). Every command in this runbook already uses the
> current 3.x names.

---

## Part 1 — kos-personal (do this one first)

Single project, single folder, lowest stakes. Good place to prove the
whole loop works before touching anything with students in it.

### 1.1 One-time setup

**Get the real address.** Open the Sheet/Doc kos-personal is bound to, in
your browser, logged into the account clasp is using. Extensions → Apps
Script → gear icon (Project Settings) → copy the Script ID.

**Wire it in:**

```
cd kos-personal
copy .clasp.json.template .clasp.json
```

Edit `.clasp.json`, replace the placeholder with your real Script ID.

**Sanity-check before pushing anything.** The repo is a snapshot — confirm
nothing changed live since it was taken, somewhere outside the repo so you
can't accidentally overwrite anything:

```
cd ..
mkdir kos-personal-live-check
cd kos-personal-live-check
clasp clone <yourScriptId>
```

Compare what downloads against `kos-personal/` in the real repo. Match →
good. Mismatch → reconcile that before you push over it — something was
edited live that never made it back into git. Delete this throwaway
folder once you're done with it.

### 1.2 Everyday loop, from here on

Every time you change something in `kos-personal/`:

```
cd kos-personal
git add .
git commit -m "describe the change"
clasp push
clasp open-script
```

`clasp open-script` pops the script editor open in your browser so you can
eyeball that the change landed. No sandbox needed here — kos-personal
only ever runs against your own account, so there's no live audience to
protect.

---

## Part 2 — leader-hub

**Stop and confirm ownership before doing anything else in this section.**
`leader-hub/README.md` describes this as *"Adam Berneche's personal,
single-file HTML command center"* — not a cas-ccps companion tool, and
not something the rest of this repo's provenance ties to you. Before
running any push against a live script here, confirm you're actually the
one who owns/administers it. If it's a colleague's project sitting in this
repo for reference or shared tooling, treat it the same way you'd treat
pushing code to someone else's GitHub repo without asking — don't.

If you *are* the owner (or this has changed since that README was
written):

### 2.1 The HTML app itself has no deploy step

`student-leader-hub.html` is, per its own README, **100% client-side:
opens as a local HTML file, all state in `localStorage`, no server.**
There's no clasp project, no script ID, nothing to push. "Deploying" a
change to it is just: save the file, and put the updated copy wherever
it's actually opened from (local machine, shared Drive folder, wherever
that currently is). That's it.

### 2.2 EmailBridge.gs — the one real script project here

This is the optional companion script (Gmail → Sheet → app polling).
It's a single flat project, same shape as kos-personal:

```
cd leader-hub
copy .clasp.json.template .clasp.json
```

Get its Script ID the same way (open the bound Sheet, Extensions → Apps
Script → Project Settings), paste it in, do the same live-check-in-a-temp-folder
sanity pass as 1.1, then the same everyday loop as 1.2 (`clasp push`,
`clasp open-script`).

---

## Part 3 — cas-ccps (7 projects, real students, the one that needs care)

This is the one SMP-004 exists for. The shape is different from the other
two because cas-ccps isn't one project — it's seven, several of which
share files (`00_SharedConfig.js` is pasted into six of them).
`tools/clasp-sync/sync.js` exists specifically to solve that: it reads
`tools/gas-lint/project-map.json` and builds a clean, throwaway push
folder per project.

### 3.1 One-time: get the repo itself under real version control

Needed before any CI robot can exist — it needs something to watch.

```
git status
```

If that says it's not a repo yet:

```
git init
git add .
git commit -m "baseline: current live state"
```

On github.com: **New repository → Private** → don't auto-init a README
(you already have one). Then:

```
git remote add origin <the URL it gives you>
git branch -M main
git push -u origin main
```

### 3.2 Pilot: build the one sandbox copy (central-ledger)

Don't build all 7 sandboxes up front — prove the loop on one first, per
your own PSD doc's own recommendation.

In Drive: find the real Central Ledger spreadsheet, **File → Make a
copy**, rename it unmistakably — e.g. *"Central Ledger — SANDBOX, not
real students."* Open its Extensions → Apps Script. This creates a
brand-new script project bound only to the copy, completely disconnected
from the real one. Grab its Script ID (gear icon → Project Settings).

Inside the sandbox copy, find the config values (the `_CONFIG` tab / the
equivalent constants) and repoint every ID in there — spreadsheet IDs,
folder IDs — at sandbox-only sheets and folders. This is the step that
actually makes it safe to test against, and the only thing that keeps
testing from ever touching real data — don't skip it.

Wire it into the repo:

```
copy cas-ccps\clasp\templates\central-ledger.clasp.json.template cas-ccps\clasp\local\central-ledger.clasp.json
```

Paste the **sandbox** Script ID into that file — not the real one. Then
build and push:

```
node tools/clasp-sync/sync.js central-ledger
cd cas-ccps\.clasp-build\central-ledger
clasp push
clasp open-script
```

Confirm in the browser it landed in the *sandbox* project, not the real
one.

### 3.2b — Alternative: building from scratch, straight to production

Section 3.2 above assumes a *live* project already exists somewhere to
copy from before you touch it. When **none of the 7 projects have ever
been deployed** — no sandbox to make a copy *of* — that step doesn't
apply, and there's nothing live to protect while you build directly.
Confirmed working end-to-end during a real from-scratch deployment; the
three gotchas below aren't hypothetical, they're what actually happened.

For each of the 7 projects, in a scratch folder **outside** the repo:

```
clasp create --type sheets --title "CAS - <Project Name>" --rootDir .
```

(`--type docs` for the two Doc-bound projects — `unified-manual`,
`master-student-template`; `--type standalone` for the two web apps —
`teacher-dashboard`, `student-dashboard`.) This creates the real Drive
file *and* its bound script together — there's no separate "attach a
script to an existing sheet" step needed, since nothing existed yet.

clasp prints two different IDs — don't mix them up:
```
Created new document: https://drive.google.com/open?id=<documentId>
Created new script: https://script.google.com/d/<scriptId>/edit
```
The **document ID** is the Sheet/Doc's own Drive file — not what goes in
`.clasp.json`. The **script ID** (from the second line) is what you want.
As a sanity check, real script IDs run noticeably longer (~57-58
characters) than Drive file IDs (~44-45) — if the value you're about to
paste looks short, you grabbed the wrong one.

Copy the script ID into `cas-ccps/clasp/local/<name>.clasp.json` per the
setup instructions above, then the normal `node tools/clasp-sync/sync.js
<name>` → `cd cas-ccps\.clasp-build\<name>` → `clasp push` loop applies
unchanged for every project.

**Three real gotchas hit going this route, all now understood:**

1. **`unified-manual` fails to push with `Invalid ID`** until
   `central-ledger` exists and has a saved version. Its manifest
   (`cas-ccps/clasp/manifests/unified-manual.appsscript.json`) ships a
   library dependency on `central-ledger` with placeholder `libraryId`/
   `version` values — intentional, since the real ID is per-deployment
   and (same convention as every real script ID in this repo) never
   committed. Once `central-ledger` is live: `cd` into its build folder
   and run `clasp version "..."` to cut version 1, then edit your
   **local, uncommitted** copy of `unified-manual.appsscript.json` with
   the real `central-ledger` scriptId and that version number before
   running `sync.js`/`push` for `unified-manual`. The tracked manifest
   keeps the placeholder — this edit stays local to your machine.

2. **A from-scratch `central-ledger` spreadsheet has none of the tabs the
   rest of the system expects.** The admin setup wizard
   (`unified-manual`'s "🚀 Run Admin + Teacher Setup" menu item) normally
   *creates* `central-ledger` itself, pre-populated with 5 tabs —
   `Ledger`, `ReviewQueue`, `STAGING_PIPELINE`, `RubricQueue`,
   `MatrixRegistry` — see `createAdminAssets_()` in
   `16_UnifiedManualSetup.js`. Building `central-ledger` directly via
   `clasp create` instead skips that entirely, so both dashboards throw
   on a null-sheet lookup (`getDashboardData()`/`getStudentDashboardData()`)
   the first time they load. Fix: paste `createAdminAssets_()`'s tab
   creation block (the `setHeaders_()` calls, roughly lines 331-373 of
   that file) into a throwaway function in `central-ledger`'s own script
   editor, pointed at `SpreadsheetApp.getActiveSpreadsheet()` instead of
   a freshly created one, and run it once via the editor's function
   dropdown. It won't survive the next `clasp push` (Apps Script replaces
   the whole file set on push) — that's expected, it only needs to run
   once.

3. **`teacher-dashboard`/`student-dashboard` both need `ADMIN_SS_ID` set,
   not just `CENTRAL_LEDGER_SS_ID`.** `ADMIN_DEPLOYMENT_WALKTHROUGH.html`'s
   Step 10 was missing this (now fixed there too) —
   `00_SharedConfig.js`'s `getConfig_()` hard-requires both, same value.
   While setting these, also confirm `student-dashboard`'s manifest has
   `executeAs: "USER_ACCESSING"` — a real bug (`"MYSELF"`, not even a
   valid value for that field) shipped there until this same deployment
   caught it; already fixed in the tracked manifest, just noting it here
   in case you're working from an older checkout.

### 3.3 Extending the pattern to the other 6 projects

Once the pilot loop is solid, repeat 3.2's shape for each remaining
project — new Drive copy, new sandbox Script ID, new
`cas-ccps\clasp\local\<name>.clasp.json`, same sync-and-push commands with
that project's name:

| Project | Type | Extra step |
|---|---|---|
| `unified-manual` | trigger/menu-driven | none beyond the standard pattern — **fix the Script 28 cross-project bug (see 3.4) before this one goes live**, since it's the exact pair (`central-ledger` / `unified-manual`) involved. Confirmed already fixed in this repo — see `cas-ccps/scripts/28_Module2Setup.js`'s `typeof`-guarded importer calls, Addendum 22 R1. |
| `master-student-template` | trigger/menu-driven | standard pattern |
| `rubric-response-sheet` | trigger/menu-driven | standard pattern |
| `teacher-matrix-sheet` | trigger/menu-driven | standard pattern |
| `teacher-dashboard` | web app | different safety model — see 3.5/3.6 below, needs a versioned deployment, not just a push |
| `student-dashboard` | web app | same as above |

**Why the two web apps are different, mechanically:** Apps Script gives
every project a **HEAD version** (always the latest saved code, visible
only to editors at a `/dev` URL) and separate **versioned deployments** (a
frozen snapshot — this is what the real `/exec` URL students actually
hit). That means for `teacher-dashboard`/`student-dashboard` specifically,
pushing to HEAD is *always* safe on its own — students never see it until
you explicitly promote a version. The five trigger/menu-driven projects
above have no such buffer: Apps Script runs their installable triggers
against whatever code is currently saved, full stop, so a push there is
live on the very next trigger firing.

### 3.4 Fix the Script 28 cross-project bug before any real promotion

`central-ledger` and `unified-manual` are exactly the pair involved in a
real bug: `28_Module2Setup.js` (bound to `unified-manual`) used to call
three importer functions that only exist in `central-ledger`'s scope, so
they threw `ReferenceError` at runtime. **Already fixed in this repo**
(Addendum 22 R1) — a `typeof`-guard at each call site now detects this and
directs the operator to run the import from Central Ledger directly
instead. Confirm this fix is present in whichever sandbox copy of
`unified-manual` you're testing against before promoting either of this
pair to production.

### 3.5 The automated test layer (the robot's part)

**Update: this job now actually exists** — `.github/workflows/gas-lint.yml`'s
`sandbox-deploy` job, added after this runbook was written. It differs from
the illustrative sketch originally drafted here in one real way: rather than
one `CLASP_SANDBOX_CREDENTIALS`-style secret per project, it reads a single
`CAS_SANDBOX_SCRIPT_IDS` secret (one JSON object mapping project name →
sandbox Script ID) and materializes each project's `.clasp.json` from it at
runtime — this runbook's own draft never addressed where those (gitignored)
files would come from inside a fresh CI checkout. **See
`tools/clasp-sync/SANDBOX_CI_SETUP.md` for the actual, current setup
steps** — the walkthrough below is kept for the conceptual picture (why a
sandbox-only credential, why it's safe to automate) but isn't the literal
job in the repo anymore.

Once you have sandbox Script IDs for all 7, this is safe to fully
automate — the CI credential only ever has keys to the sandbox copies,
never to the real district-owned projects.

**Give the robot a personal-account key.** Open `%USERPROFILE%\.clasprc.json`
on your machine (this is where clasp saved the login from your very first
`clasp login`). Copy its entire contents. In your GitHub repo: **Settings
→ Secrets and variables → Actions → New repository secret** — name it
`CLASP_SANDBOX_CREDENTIALS`, paste the file's contents as the value. This
file *is* a working login — treat it exactly like a password. Rotate it
(re-run `clasp login`, copy the new file, update the secret) periodically,
and never let it anywhere near a district-account login.

The illustrative job sketch below predates the real implementation (kept
for the conceptual shape only — `tools/clasp-sync/SANDBOX_CI_SETUP.md` has
the actual, current steps):

```yaml
sandbox-deploy:
  runs-on: ubuntu-latest
  needs: [lint]  # only runs after gas-lint passes — see gas-lint.yml's own job name
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "20"
    - run: npm install -g @google/clasp
    - name: Restore sandbox-account clasp credentials
      run: echo "$CLASP_SANDBOX_CREDENTIALS" > $HOME/.clasprc.json
      env:
        CLASP_SANDBOX_CREDENTIALS: ${{ secrets.CLASP_SANDBOX_CREDENTIALS }}
    - name: Rebuild and push HEAD-safe web apps
      run: |
        node tools/clasp-sync/sync.js teacher-dashboard
        (cd cas-ccps/.clasp-build/teacher-dashboard && clasp push --force)
        node tools/clasp-sync/sync.js student-dashboard
        (cd cas-ccps/.clasp-build/student-dashboard && clasp push --force)
    - name: Rebuild and push sandbox copies of the five trigger-driven projects
      run: |
        for p in central-ledger unified-manual master-student-template rubric-response-sheet teacher-matrix-sheet; do
          node tools/clasp-sync/sync.js "$p"
          (cd "cas-ccps/.clasp-build/$p" && clasp push --force)
        done
    - name: kos-personal (no live audience — safe to fold in here too)
      run: cd kos-personal && clasp push
```

Notice what this job *can't* do: every `.clasp.json` it's pushing against
points at a HEAD deployment or a sandbox copy — none of them are the real
ccpsnet.net-owned production projects. That's the whole reason this is
safe to automate. leader-hub is deliberately left out of this job — its
ownership isn't confirmed (see Part 2), so it doesn't get folded into
shared CI automation the way kos-personal safely can.

### 3.6 Production promotion (the human part — you, every time)

Once a change is on `main` and the sandbox-deploy job is green, this is
what you actually run yourself, from your own already-logged-in terminal,
to move something into the real stadium. Nothing here is automated on
purpose.

**For the 5 trigger/menu-driven projects** (`central-ledger`,
`unified-manual`, `master-student-template`, `rubric-response-sheet`,
`teacher-matrix-sheet`) — these have no version buffer, so this is the
actual moment of consequence:

```
git pull
node tools/clasp-sync/sync.js central-ledger
copy cas-ccps\clasp\templates\central-ledger.clasp.json.template cas-ccps\clasp\local\central-ledger.PRODUCTION.clasp.json
```

(paste the *real* production Script ID into that file this time, not the
sandbox one — or keep a permanent second file, e.g.
`central-ledger.prod.clasp.json`, and copy it over when you're ready;
either works, just be deliberate about which one is active)

```
cd cas-ccps\.clasp-build\central-ledger
clasp push
```

Repeat per project. Before each one, run through the same three-question
check your own Auditor persona already uses: *what's changing, have you
actually looked at the diff, are you explicitly saying go.* There's no
test URL cushioning this step — this is exactly the moment to pause and
actually look.

**For the 2 web apps** (`teacher-dashboard`, `student-dashboard`) — these
*do* have a safety buffer, and getting the command sequence right here
matters: `clasp push` alone only updates HEAD, testable at the `/dev` URL
— the live `/exec` URL students use doesn't move until a version is
created and explicitly deployed. Create the version first (this is what
actually assigns it a version number — you can't invent one), then deploy
that exact version to the existing production deployment:

```
cd cas-ccps\.clasp-build\teacher-dashboard
clasp push
clasp version "describe what changed here"
```

`clasp version` prints the version number it just created — use that
number, not a guessed one, in the next command:

```
clasp list-deployments
clasp deploy --deploymentId <the existing production deployment ID> --versionNumber <the number clasp version just printed>
```

`clasp list-deployments` shows you the current production deployment ID
if you don't have it handy. That last `clasp deploy` command is the
actual "open the stadium doors" moment for the two web apps — everything
before it, including the `clasp push`, was still just rehearsal.

---

## Quick-reference cheat sheet

| Situation | Command sequence |
|---|---|
| kos-personal, any change | `clasp push` → `clasp open-script` |
| cas-ccps, no live projects exist yet | `clasp create --type <sheets\|docs\|standalone>` per project (see 3.2b) |
| leader-hub HTML, any change | save file, replace it wherever it's opened from |
| leader-hub EmailBridge, any change | same as kos-personal, once ownership is confirmed |
| cas-ccps, testing a change | push to `main`, let sandbox-deploy CI job run |
| cas-ccps trigger-driven project, promoting to production | `node tools/clasp-sync/sync.js <name>` → fill in production `.clasp.json` → `clasp push` |
| cas-ccps web app, promoting to production | `clasp push` → `clasp version "..."` → `clasp list-deployments` → `clasp deploy -i <id> -V <the number just printed>` |

## Recommended order

Don't build all 7 sandboxes, then promote all 7 to production, in one
pass. Do the whole loop — sandbox build (3.2), robot push (3.5), manual
promotion (3.6) — on **`central-ledger` alone** first, including
confirming the Script 28 fix (3.4) is actually present and working.
Confirm it end to end before extending the same pattern to the other four
trigger-driven cas-ccps projects and the two web apps.

## Before this goes fully live

- `28_Module2Setup.js`'s cross-project call bug (3.4) — already fixed in
  this repo (Addendum 22 R1); just confirm the fix is present in whatever
  sandbox/production copy you're pushing.
- **SMP-004 wording — reconciled in-repo, one external step still
  outstanding.** `KILL_SWITCH_PROTOCOL.md`'s "no clasp, no CLI" phrasing
  predated this runbook's Option 2 and, read literally, forbade the exact
  production-promotion path Part 3.6 above describes. That doc now
  explicitly carves out the human-at-keyboard `clasp push` exception —
  no stored production credential, nothing automatable, a person
  physically deciding in the moment — as compliant with the automation
  air-gap's actual intent, not a workaround of it. That's the two
  *in-repo* documents brought into agreement; it does not itself amend
  SMP-004's own filed, adopted text (tracked outside this repo, in
  `01.3_SMP_PROPOSALS`). If that filed wording still reads as an absolute
  prohibition, re-ratifying it to match is a separate action for whoever
  owns that adoption process — this repo can describe the intended
  exception, but can't re-file the proposal itself.
