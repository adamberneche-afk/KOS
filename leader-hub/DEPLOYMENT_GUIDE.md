# leader-hub Deployment Guide

First deploy of `leader-hub:app` — from this repo to a live Apps Script Web
App. leader-hub has never been pushed, so this is a from-scratch deployment,
not a catch-up.

Peer documents: `cas-ccps/DEPLOYMENT_HANDOFF.md` and
`kos-personal/DEPLOYMENT_GUIDE.md`. This one existed only as a description
inside `README.md`'s clasp section plus a Flow-building doc that assumes the
script is already deployed, which meant the actual sequence lived nowhere and
got dictated from memory each time. That is the gap this closes.

**Who runs this.** Every command here runs at the operator's own keyboard,
against their own already-authenticated Google account. Per SMP-004 an agent
session must never `clasp push` or `clasp deploy` to production — it can
prepare the code and hand over the exact commands, which is all this document
is.

---

## What you do NOT need: a Cloud project

Unlike `kos-personal/DEPLOYMENT_GUIDE.md`, there is **no Phase 1 here**.
leader-hub needs no Google Cloud project, no API key, and no add-on
publication. Its AI work crosses the Bifurcation Boundary
(`EmailBridge.gs`, line 160): Apps Script writes a job row, a hand-built
Workspace Flow generates the text with the Workspace account's own built-in
Gemini access, and writes the result back. Nothing in this system calls a
model or holds a key.

That is worth stating rather than leaving implicit, because the repo has been
bitten from both directions:

- **cas-ccps** built 8 custom Workspace Studio steps (2,113 lines) that need
  a standard Cloud project, and the district has GCP switched off. They
  pushed successfully and never appeared in Studio's step picker. leader-hub
  has no custom steps, so that wall cannot reach it.
- **The opposite mistake**, also already made here: reading a deployment
  doc's "every future deploy uses the same GCP project" as evidence a
  *standard* project exists. It isn't — configuring an OAuth consent screen
  and enabling an API both happen in the default project Apps Script creates
  on its own, and no project in this repo has ever had a standard one linked.

If you ever find yourself wanting a key for leader-hub, that is a signal the
design has drifted. See `tools/gas-lint/gcp-map.json`, which leader-hub is
deliberately absent from, and gas-lint's Check G, which will error if a live
GCP dependency appears here undeclared.

---

## Phase 1 — Connect clasp

```bash
cd leader-hub
clasp login                      # once per machine, against the real account
clasp create --type webapp --title "LeaderHub"   # no live project exists yet
# — or, if one already exists —
clasp clone <scriptId>
```

Then copy the template and fill in the real ID:

```bash
cp .clasp.json.template .clasp.json    # drop the _comment key
# set "scriptId" to the real value; leave "rootDir": "."
```

`.clasp.json` is gitignored on purpose — real script IDs are never committed,
the same convention this repo uses for Sheet and Doc IDs living in Script
Properties rather than source.

## Phase 2 — Regenerate the front end, then push

`student-leader-hub.html` is **generated**. Never hand-edit it; edit the
fragments under `src/` and reassemble:

```bash
node tools/leaderhub-build/build.js          # from the repo root
node tools/leaderhub-build/build.js --check  # verifies it is in sync
```

Then, from `leader-hub/`:

```bash
clasp push
```

> **The one gotcha that fails silently.** `.claspignore` here is an
> **allowlist** — `**/**` followed by explicit `!` un-ignores. A file that
> isn't listed is skipped by `clasp push` with no warning: it appears to
> deploy and simply does not exist in the project. If you add a `.gs` file,
> add it to `.claspignore` *and* to `leader-hub:app` in
> `tools/gas-lint/project-map.json`. The project-map entry is the
> authoritative file list; prose lists elsewhere point at it rather than
> re-enumerating, because that duplication has drifted twice already.

Verify the push landed by opening the editor (`clasp open`) and confirming
every file in the project-map entry is present.

## Phase 3 — Deploy as a Web App and authorize

The manifest already carries the deployment settings, so don't set these by
hand in the UI — `appsscript.json` declares `"executeAs": "USER_DEPLOYING"`
and `"access": "DOMAIN"` ("Execute as: Me · Access: Anyone in your domain").
Execute-as-Me is load-bearing for the Organizations feature: whoever deploys
owns the backing spreadsheets, so a co-advisor never needs Drive sharing of
their own — they point their own LeaderHub Settings at this same `/exec` URL.

```bash
clasp deploy --description "v1"
```

Then in the editor: **Deploy → Test deployments** (or Run any function once)
and complete the OAuth consent prompt. The manifest declares five scopes
explicitly — Gmail, Drive, Docs, Sheets, and userinfo.email — and once a
manifest lists `oauthScopes` explicitly, GAS stops auto-detecting: a scope
that isn't listed fails at the call site, often silently inside a
`try/catch`. gas-lint's Check E validates that list against actual service
usage, so run `node tools/gas-lint/check.js` before pushing if you added any
service call.

## Phase 4 — Nothing to configure by hand

There is no properties-setup phase. All three backing spreadsheets
self-provision on first use — `_getAiQueueSheet_()` ("LeaderHub AI Queue"),
`_getLhDataSpreadsheet_()` ("LeaderHub Data") and `_getOrgSyncSpreadsheet_()`
("LeaderHub Org Sync") each create their file and record its ID in a Script
Property if the property is unset.

One consequence worth knowing, because it is a silent failure: if one of
those spreadsheets is later **deleted or moved somewhere the script cannot
read**, the getter creates a *new* file and stores the new ID — while every
Workspace Flow trigger stays pointed at the old one. `runLeaderHubPreflight()`
checks exactly this.

Serving the front end from this deployment also means no Email Bridge URL
needs configuring: the page is same-origin with the script, so `callGAS()`
goes over `google.script.run`. The Settings bridge-URL field stays for the
local-file mode, where `google.script.run` doesn't exist.

## Phase 5 — Verify, from the Run dropdown

In order. Full detail in `LEADERHUB_AI_FLOW_SETUP.md`'s "Fastest path"
section.

| # | Function | What a pass means |
|---|---|---|
| 1 | `syncAiPromptsToSheet()` | Writes the `AI_Prompts` tab, so a Flow can read its system prompt from a chip instead of carrying a pasted copy. First because the preflight below checks for it — re-run it after any prompt edit, and `checkAiPrompts()` reports drift. |
| 2 | `runLeaderHubPreflight()` | Queue spreadsheet reachable, both tab header rows matching the code, prompts synced, every job type carrying a prompt. Read-only — safe to run any time, against anything. |
| 3 | `checkAiQueueSchema()` | The header rows match the constants the code indexes **by position**. Worth running on its own whenever something behaves oddly: the Flow writes `Status`/`Result` back by position too, so drift breaks both directions with no error on either side. `repairAiQueueSchema()` fixes it, and refuses while data rows are present. |
| 4 | `runAiFlowCanary()` | The whole Apps Script half works — queue, poll, hand back once, delete, count. The Flow is **stubbed deliberately**, so this says nothing about whether any Flow exists. Its value is localisation: after a pass, a remaining failure is in the Flow. |
| 5 | `installAiFlowFixtures()` | Plants one `PENDING` row per job type, so all six Flows have something to match. |
| 6 | `checkAiFlowFixtures()` | **The real test, and the only honest one.** Run it after the Flows have had a chance to fire. A fixture whose `Status` moved off `PENDING` proves that Flow is live. One still `PENDING` means nothing has ever touched that type — regardless of what the Flow UI says, because a Flow that matched zero rows reports a green "Run Completed" too. |

Steps 1-4 are worth running before the Flows exist: they establish that
everything on this side of the boundary is sound, so anything that fails
afterwards is the Flow. Steps 5-6 only mean something once Phase 6 is done.

## Phase 6 — Build the six Flows

`LEADERHUB_AI_FLOW_SETUP.md`, Step 2 onward. One Flow per job type (or one
branching on `Type`). Point each at the `AI_Prompts` tab for its prompt text
rather than pasting it, so a prompt change is a `clasp push` plus
`syncAiPromptsToSheet()` instead of six hand-edits in the Workspace UI.

Every AI feature degrades gracefully to a local/template draft when no Flow
is connected, so the app is usable before this phase — the Flows add the
drafting, they are not a hard dependency.

---

## Troubleshooting: the failure modes that don't announce themselves

**A Flow reports "Run Completed" and nothing happened.** It matched zero
rows. That is reported identically to success. `checkAiFlowFixtures()` is the
distinguishing test — never the Flow's own run log.

**A file you added isn't in the deployed project.** `.claspignore` is an
allowlist; see Phase 2.

**A Flow writes results into the wrong cell, or jobs sit `PENDING` forever.**
Header drift on `AI_Queue`. `checkAiQueueSchema()`.

**Everything works, then stops after a Drive cleanup.** A backing spreadsheet
was deleted or moved; the getter silently made a new one and the Flow
triggers still point at the old. Phase 4, and `runLeaderHubPreflight()`.

**An `UrlFetchApp`/service call fails inside a `try/catch` with no message.**
A missing OAuth scope. The manifest lists them explicitly, so nothing is
auto-detected. `node tools/gas-lint/check.js`.

**Fixture rows you forgot to remove.** They leak nothing —
`checkAiJob_`'s sweep clears anything older than two hours, whatever its
status — but `removeAiFlowFixtures()` takes them out immediately.
