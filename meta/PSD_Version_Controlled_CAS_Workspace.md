# PSD: Version-Controlled Development Workspace for CAS
Product Specification Document — v1, DRAFT

---

## 1. Problem Statement

CAS (and its KOS predecessors) has been built and iterated entirely inside
Google Drive, using full-folder copies as the versioning mechanism. This
produced seven near-complete codebase copies, several superseded KOS
generations left in place, and a recurring need for a manual verification
ladder just to determine which copy is authoritative. The underlying habit
— build the full structure before content exists to fill it, and duplicate
rather than edit-in-place — has produced real, accumulating technical debt
that a Drive reorganization alone does not resolve, since it only cleans
up the symptom on a recurring basis rather than removing the mechanism
that produces it.

## 2. Goals

- Establish a single, real version history for CAS's Apps Script code,
  replacing dated/versioned Drive folder copies as the mechanism for
  tracking change over time.
- Make "what changed, when, and why" answerable by reading history,
  not by manually diffing folders or applying the verification ladder.
- Keep the live, bound Apps Script deployment (the thing actually running
  the 3am–6am pipeline) as the deployment target, not replace it.
- Leave a clear boundary between what lives in version control (code) and
  what stays in Drive (data files, docs, the live bound deployment).

## 3. Non-Goals

- This does not reorganize Drive itself — that's the separate, already-
  scoped Cold Boot / SMP-003 effort.
- This does not attempt to fix the cathedral-first habit directly. Tooling
  removes the *cost* of the habit; it doesn't change the instinct. Worth
  tracking separately whether the habit persists even once copying is no
  longer the path of least resistance.
- This does not cover Module 3/4 renumbering or the `lesson_unit_id`
  bridge — those are CAS content work, not workspace infrastructure.

## 4. Scope of This Phase

One Apps Script project (recommend Module 2, since it's the most recently
completed and best-documented) migrated end-to-end as the proof of concept,
before extending the same pattern to Module 1 and any future modules.

## 5. Success Criteria

- The chosen module's code exists as a real local folder, initialized as
  a git repository, with its current state as the first commit.
- At least one real change has been made locally, diffed, committed, and
  pushed back to the live bound script — proving the round trip works,
  not just the clone.
- A remote (GitHub) holds the canonical history, separate from any single
  computer's local copy.

---

## 6. Tech Stack

| Component | Choice | Why |
|---|---|---|
| Version control | **Git** | Industry standard; free; already has a working precedent in your own tooling (`TSO` repo) |
| Apps Script bridge | **clasp** (`@google/clasp`) | Google's own official tool for exactly this gap — no third-party trust required |
| Runtime clasp depends on | **Node.js + npm** | clasp is a Node CLI tool; this is the one new piece of software actually being installed |
| Remote / canonical history | **GitHub** | Precedent already exists on this exact account; free for private repos |
| Local editor | **VS Code** (recommended, not required) | Pairs naturally with git and clasp; has an official Apps Script extension; not mandatory — any editor that can open a folder works |
| Authentication | **clasp login** (Google OAuth) | Ties the local tool to your Google account directly; no separate credential system to manage |

**Nothing here is a new paid service or subscription.** Every piece is free, and git/GitHub/VS Code are all things you already have some familiarity with via the separate `TSO` project.

---

## 7. Risk — flagged, not resolved

`clasp login` requires the Apps Script API to be enabled for the account
the script is bound to (a toggle in that account's Apps Script settings).
This session's own history includes a prior, real finding: Module 1's
deployment required a manual script-binding path specifically because
Google Cloud Console access wasn't available on the relevant account.
CAS's actual code currently lives in the personal Gmail account, which
being a personal (non-Workspace-managed) account, most likely has no
admin-side restriction — but this should be verified directly, first,
before assuming the migration proceeds smoothly. If the same restriction
that blocked Cloud Console access applies here too, that's worth knowing
before Phase 1 starts, not discovering mid-migration.

---

## 8. Phased Rollout

1. **Verify** — confirm `clasp login` succeeds and the Apps Script API
   toggle is available for the account CAS is bound to.
2. **Clone** — `clasp clone` on the Module 2 script project. Confirm
   the local folder matches the live deployment exactly.
3. **Initialize** — `git init`, first commit capturing current state
   as a baseline, no changes yet.
4. **Round-trip test** — make one small, real change locally, diff it,
   commit it, push it via clasp, confirm the live script reflects it.
5. **Remote** — push the repo to GitHub as the canonical history.
6. **Extend** — repeat for Module 1 once the pattern is proven.

---

## 9. Open Questions for Discussion

- Should the BRAIN_TRUST_INDEX Script Registry Record schema change
  (adding `repo_url` / `last_commit_hash`) be filed as its own SMP, or
  folded into this PSD's approval?
- Does Module 2 or Module 1 make a better first candidate — Module 2 is
  more recently built and documented; Module 1 is already production-
  stable and lower-risk to practice on.
