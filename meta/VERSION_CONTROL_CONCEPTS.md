# Version Control, Explained Through Your Own Patterns

## The problem this actually solves

Every technical term below maps to something you're already doing — just
without the tool that was built for it. Start here, not with vocabulary:

**What you do now:** finish a working version of something, then make a
full copy into a new folder named with a date or a version number, before
changing anything further. `KOS MASTER v7.1`, `CAS 7.8.26`, seven near-
complete codebase copies.

**What that copy is actually for:** a safety net. If the new changes break
something, the old folder still exists. If you need to remember what
changed between versions, you can open both and compare by eye.

**What it costs:** every copy is a full duplicate, forever, unless someone
manually decides to delete it. "Which one is real" becomes a genuine
question requiring investigation — the exact problem the verification
ladder in your own curation workflow exists to answer. You're solving,
by hand, a problem a tool exists specifically to make unnecessary.

## The core idea: history as a first-class thing

A **repository** (repo) is a folder that tracks its own history — not just
its current contents. Every time you save a meaningful checkpoint, you're
not making a copy of the folder. You're adding an entry to a timeline that
lives *inside* the same folder.

**A commit** is that checkpoint. It's not a copy of every file — it's a
recorded snapshot: what changed, plus a short message you write describing
why. Where you'd currently create `CAS 7.8.26`, you'd instead run one
command and write something like `"Module 2 warm-up pipeline complete,
scripts 22-31"`. Same information you were already encoding in a folder
name — just structured, searchable, and attached to the actual diff instead
of implied by a date.

**History** is the full sequence of commits. Instead of opening two folders
and reading code side by side to figure out what changed, you ask the
repo directly: `git log` shows every commit in order; `git diff` shows
exactly what changed between any two points, line by line. This is the
verification ladder's "full content diff" step — except it's instant and
built in, not a manual escalation you run when you suspect a duplicate.

## Branches: what a dated folder actually was

**A branch** is a parallel line of history — a place to try something
without touching the version that's already working. This is, structurally,
exactly what `KOS MASTER v7.1 PART A/B/C` was: an attempt made alongside
the existing version, kept separate until it was either good enough to
become the real thing or abandoned. The only difference is that a branch
doesn't require copying every file to exist — it's a pointer, not a
duplicate. Two branches can share 99% of their history and only diverge
where they actually differ.

**Merging** is bringing a branch's changes back into the main line, once
you've decided it's good. This replaces the moment where you'd currently
decide "this new version replaces the old one" — except the old version's
full history is preserved underneath, not just its final folder-shaped
snapshot.

## Remote: where the canonical copy actually lives

A **remote** is a copy of the repository's full history stored somewhere
else — commonly GitHub, which you already have an account and a working
pattern for (the `TSO` repo referenced in your own tooling notes). **Push**
sends your local commits there; **pull** brings down anything that's
changed remotely. This is what makes a repo different from a folder on
one computer: the canonical version lives in a place built to be the
source of truth, not "whichever folder someone opened most recently" —
directly answering the same question Drive's duplicate-folder problem
keeps raising.

## What this does not do

Worth being honest about the limits, since a tool this useful is easy to
over-trust: version control doesn't stop you from writing something
broken, doesn't replace testing, and doesn't organize your thinking for
you. It only solves the specific problem of "what changed, when, and can
I get back to any prior state" — which happens to be most of what the
cathedral-first, copy-to-version habit has been standing in for. It won't,
on its own, change the underlying instinct to build the whole structure
before filling it in — that's a separate thing worth watching for
regardless of what tooling is in place.

## The vocabulary, collected

| Term | Plain meaning | What it replaces in your current habit |
|---|---|---|
| Repository (repo) | A folder that tracks its own history | The project folder itself |
| Commit | A saved checkpoint with a description | A new dated/versioned copy |
| History / log | The full sequence of commits | Opening old folders to remember what changed |
| Diff | Exact line-by-line changes between two points | Manually comparing two folders |
| Branch | A parallel line of work, cheap to create | A `Vx.xx` or PART A/B/C folder |
| Merge | Folding a branch's changes back into the main line | Deciding "this version replaces that one" |
| Remote | Where the canonical history is stored (e.g. GitHub) | "Whichever Drive folder is most recent" |
| Push / Pull | Sending/receiving changes to and from the remote | Manually copying a folder somewhere else |

The next document covers the specific tool that connects this to Google
Apps Script, since Apps Script projects don't normally live as ordinary
folders on your computer at all.
