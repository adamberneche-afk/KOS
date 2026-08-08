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

## A note on what this doesn't remove

clasp and git together solve *where the code's history lives*. They don't,
by themselves, stop the instinct that produced seven codebase copies in
the first place — that's a habit, not a tooling gap, and worth watching
for even once the tooling exists to make the old habit unnecessary.
