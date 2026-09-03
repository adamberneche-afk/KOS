# Bridging Apps Script to Version Control: clasp

## Why this needs a separate tool at all

An Apps Script project isn't an ordinary folder of files — it's bound to
a Google resource (a Sheet, a Doc, or standalone) and lives inside Google's
own infrastructure. You edit it in a browser-based editor at
script.google.com. There's no file on your computer to point git at,
because there's no local file to begin with. That's the actual gap:
version control needs local files; Apps Script doesn't normally produce any.

**clasp** (Command Line Apps Script Projects) is Google's own tool for
closing that gap. It downloads an Apps Script project's actual files —
the same code currently living in `22_LessonContextHandler.js`,
`29_PacingGuideManager.js`, and the rest — into a real folder on your
computer, and can send changes back up to the live, bound script whenever
you're ready.

## The core workflow

**Clone**: pulls down an *existing* live script project into a local
folder, as-is — not a copy made by hand, the actual current bound version.
This matters directly for CAS: nothing gets recreated from scratch or
guessed at; the local folder starts as a byte-for-byte match of what's
really deployed right now.

**Edit locally**: once cloned, the files are ordinary `.js` files in an
ordinary folder — this is where a real code editor (VS Code or similar)
becomes useful in a way the browser-based Apps Script editor isn't: real
find-and-replace across files, real syntax help, and — the actual point —
a folder git can track.

**Push**: sends local changes back up to the live, bound Apps Script
project. This is the step that makes local edits real — until you push,
you're only changing your local copy; the live script (the one actually
running your 3am–6am pipeline) is untouched.

**Pull**: the reverse — brings down anything changed directly in the
browser editor, so local and live never silently drift apart.

## What this looks like for one real CAS script

Take `29_PacingGuideManager.js` as a concrete, non-hypothetical example of
the shape this takes (nothing here is being run — this is the *shape* of
the workflow, for understanding):

1. `clasp clone <scriptId>` — pulls the actual live Module 2 project down
   to a local folder. All 10 scripts (22 through 31) arrive as real files.
2. That folder is initialized as a git repo. The current state becomes
   the first commit — effectively "here's where we actually are," not
   a reconstruction.
3. A change to `29_PacingGuideManager.js` — say, wiring in the
   `lesson_unit_id` bridge Module 3 is still waiting on — gets made
   locally, in a real editor.
4. `git diff` shows exactly what changed in that one file before anything
   is sent anywhere. `git commit -m "wire lesson_unit_id bridge for
   Module 3 handoff"` saves the checkpoint with its own reasoning attached.
5. `clasp push` sends that change up to the live script. The 3am pipeline
   now runs the updated version.
6. If it breaks something, `git log` shows every prior state, and `git
   checkout` can return to any of them — a rollback that doesn't require
   remembering which dated folder was the last good one.

## What changes structurally — and what doesn't

**Stays in Drive:** data files (`CompetencyRubrics.json`,
`CompetencyRegistry.csv`, `PacingGuide_CAS_Context_v2.json`), the bound
Sheet or Doc the script is attached to, documentation, and the live
deployment itself — Apps Script still runs bound to Drive; that never
changes.

**Moves out of Drive as the source of truth:** the *code itself*. A `.gs`
file in a dated Drive folder stops being "the" version — the git repo's
history is. Drive keeps a live, working copy because Apps Script requires
it to run; the repo keeps the actual record of what changed and why.

**One real schema implication, flagged earlier by Architect:** the
`Script Registry Record` in BRAIN_TRUST_INDEX currently only tracks a
Drive-based asset. Once code lives in git, that record needs a place to
point to the repo and the specific commit a given deployment corresponds
to — otherwise the INDEX would be pointing at half the truth.

## The one thing clasp can't hand you: a Cloud project

`clasp` needs an authenticated Google account and nothing more. Some Apps
Script *capabilities* need a standard (non-default) Google Cloud project
behind the script, and that is a Workspace-admin decision, not something a
push can arrange. The two that matter here are publishing a Workspace
Add-on (which is what a custom Workspace Studio step is) and calling the
Gemini API or Vertex directly with a key.

And no project in this repo has one. Every GCP project across all three
systems was built the same way — the default project Apps Script creates on
its own. The only console work any deployment doc here describes is
configuring that project's OAuth consent screen and enabling an API inside
it; neither of those makes a project *standard*, and nothing in this repo
records one ever being created or linked through Project Settings for any of
the 11 Apps Script projects. Worth stating plainly, because a deploy doc
saying "every future deploy uses the same GCP project" reads like
reassurance and isn't (see `kos-personal/DEPLOYMENT_GUIDE.md`'s Phase 1,
which now says so itself).

This is not hypothetical. On the `ccpsnet.net` account, GCP access is
turned off org-wide — confirmed directly in the Cloud console, which is the
*second* block on those custom steps rather than the first. All 8
custom Studio steps in `cas-ccps/studio-steps/` (2,113 lines, written and
unit-tested) pushed *successfully* and then never appeared in Studio's
step picker, across repeated uninstall/reinstall cycles, with no OAuth
prompt ever shown. There was no error to read. A missing Cloud project
doesn't fail a push; it just makes the result do nothing.

Which is why every system in this repo defaults to reaching Gemini
through a hand-built Flow using the account's own built-in access
(`cas-ccps`/`kos-personal` call it the Walled Garden, `leader-hub` the
Bifurcation Boundary) — Apps Script orchestrates state and never calls a
model itself. `cas-ccps/scripts/37_FlowInputBuilder.js` is the worked
example of the port: it moves an entire per-teacher lookup chain into
Apps Script so the Flow needs no capability beyond keyless Gemini.

**Before writing anything that needs a key or a custom step**: check
Project Settings on the *target* account first, and declare the
dependency in [`tools/gas-lint/gcp-map.json`](../tools/gas-lint/gcp-map.json).
gas-lint's Check G scans every file in `project-map.json` for those
surfaces and errors on any live one with no entry — so a GCP dependency
is something someone decided on purpose and wrote down, rather than
something discovered when a step never shows up in a picker.

## A note on what this doesn't remove

clasp and git together solve *where the code's history lives*. They don't,
by themselves, stop the instinct that produced seven codebase copies in
the first place — that's a habit, not a tooling gap, and worth watching
for even once the tooling exists to make the old habit unnecessary.

## Status: cas-ccps is live; kos-personal and leader-hub are not

Everything above was written while this was still a proposal, and the
heading here used to say "scaffolded, not yet connected to a live account."
That stopped being true. **All 8 `cas-ccps` projects now exist in a real
`ccpsnet.net` Workspace account and have been pushed with this tooling** —
`cas-ccps/clasp/local/` holds their real script IDs and is gitignored, so a
new session or machine recreates it from the templates rather than finding
it in the repo. `cas-ccps/HISTORY.md`'s deployment section records what that
first push found, including three Studio walls that only a live account
could reveal.

`kos-personal`'s two projects and `leader-hub`'s one are still at the
one-credentialed-step-away stage described below.

The layout each system needs, which hasn't changed:

- **`kos-personal/`'s main project** and **`leader-hub/`** are each a
  single Apps Script project already laid out exactly the way clasp
  wants — a flat folder. Both now carry a `.clasp.json.template` (copy to
  `.clasp.json` with a real `scriptId` once you've run `clasp login` +
  `clasp clone`/`create`) and a `.claspignore` that allowlists only the
  real script files, so the legacy/archived material and (for
  kos-personal) the separate Node.js `inference-service/` never get swept
  into a push. `kos-personal/studio-steps/` (blocked on this account — its
  write-back moved to `12_StudioReturnHarvest.gs`) is a second, separate
  flat-folder project alongside the main one (a separate Apps Script
  project, not a shared global scope — note this is a PROJECT split, not
  the personal/district ACCOUNT split SMP-004 describes; in practice both
  are deployed on the same ccpsnet.net account) — see its own README.
  `leader-hub/` is now server-backed (`leader-hub:app` — every `.gs` file in
  that folder, one Web App deployment; the authoritative list is that
  project's entry in [`tools/gas-lint/project-map.json`](../tools/gas-lint/project-map.json),
  not a count repeated in prose) rather than the client-side-only single HTML file
  it started as, but it's still exactly one Apps Script project either
  way, so the flat-folder model still applies unchanged.
- **`cas-ccps/scripts/`** doesn't fit the one-folder-one-project model —
  it's actually 7 separate bound/standalone projects sharing overlapping
  files (`00_SharedConfig.js` alone is pasted into 5 of them). See
  [`tools/clasp-sync/README.md`](../tools/clasp-sync/README.md) for how
  that's reconciled: a small script generates a throwaway per-project
  push folder for each, from the same `project-map.json` gas-lint already
  uses, so `cas-ccps/scripts/` itself never gets reorganized or
  duplicated in git. An 8th project, `cas-ccps/studio-steps/` — blocked on
  this account, kept because enabling GCP would make it reachable again —
  was added
  later for the Studio Steps adoption — standalone, sharing no files with
  the other 7, but handled by the same tool and the same `cas-ccps:*`
  scope.
- Every one of the 11 real projects (kos-personal's 2 + cas-ccps's 8 +
  leader-hub's 1) now has a committed `appsscript.json` —`cas-ccps` and
  `leader-hub` had none before this reconciliation; `oauthScopes` were
  derived from actual code usage against `tools/gas-lint/scope-map.json`,
  and `gas-lint`'s existing OAuth-scope check now validates all 11 of
  them, not just `kos-personal`'s main project.
- **What's left is entirely credentialed and can't be done from a repo
  session** — and for `cas-ccps` it is already done. For the remaining 3
  projects (`kos-personal`'s 2, `leader-hub`'s 1): run `clasp login`
  against the real Google account, then `clasp clone` (or `clasp create`,
  for the two "cloned per teacher" projects — target the *master* template,
  not any individual teacher's copy), and drop the resulting `scriptId`
  into the matching template. SMP-004 is why an agent session can't do
  this step for you: pushing to production happens at the operator's own
  already-authenticated keyboard, never from here. Real script IDs are deliberately never
  committed (`.gitignore`d) — same convention this repo already uses for
  real Sheet/Doc IDs living in Script Properties, not source.
