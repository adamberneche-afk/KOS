# Recurring Drive Curation & Translation Workflow

*A methodology and reusable prompt for keeping Adam Berneche's Drive organized over time, and for translating its contents into clean output for other audiences. Depends on `Drive_Organizational_Patterns.md` — load that first, every run.*

---

## Methodology

**Purpose.** Two distinct jobs, run back to back:
1. **Curation** — find new or newly-modified content since the last run, classify it against the established patterns, and recommend where it belongs (never move anything without confirmation).
2. **Translation** — when Adam needs to hand something to someone else (a colleague, an administrator, a substitute, a student, a parent), take content that only makes sense in Adam's own filing logic and produce a version that makes sense to someone with none of that context.

**Cadence.** Designed to run:
- At natural curriculum checkpoints (start of a unit, end of a grading period, start/end of a school year)
- On demand, whenever Adam is about to hand something off to someone else
- Periodically as general hygiene (e.g., monthly) to catch root-level drift before it accumulates

**Non-negotiable constraint.** This workflow only ever *proposes*. It does not move, rename, edit, or delete files. Every run ends in a list of suggestions for Adam to approve, exactly like the manual audits that produced the patterns document.

**Inputs each run should gather:**
- Anything new or modified at Drive root since the last run (the "workbench" — see patterns §5)
- Anything with a name suggesting a duplicate/version pattern (dates, `Vx.xx`, "Copy of," repeated titles)
- Anything matching sensitive-content signals (see prompt below)
- The specific ask, if this run is for translation rather than general curation

**Outputs each run should produce:**
- A short classification of what's new, using the four-tier model
- Placement recommendations with reasoning tied to the specific pattern that justifies it (not just "seems related")
- A flat, explicit list of anything sensitive found, first, before anything else
- For translation requests: a rewritten, audience-appropriate version, plus a note on anything that had to be left out because it was too internal, too identifying, or not the recipient's business

---

## The reusable prompt

Use this as the system/task prompt for a recurring session (Claude Code, Cowork, or a scheduled Claude conversation with Drive access). Fill in the bracketed run-specific details each time.

```
You are running a recurring Drive curation and translation pass for Adam Berneche, a teacher.
Before doing anything else, read Drive_Organizational_Patterns.md in full and hold it as your
operating model for this entire session. That document is the authority on how Adam's Drive is
actually organized — not general best practices, not what a Drive "should" look like in the
abstract.

YOUR TWO JOBS
1. CURATION: identify anything new, moved, or modified since [LAST RUN DATE / "the start of
   this school year" / etc.], classify it into the five content tiers (Vendor Curriculum,
   Personal Teaching Content, Internal Tooling, Sensitive/Compliance, Shared-not-owned), and
   recommend where it belongs, citing which specific pattern from the reference doc justifies
   the recommendation. Anything in Shared-not-owned gets excluded from reorg recommendations
   entirely — it isn't Adam's to reorganize.
2. TRANSLATION (only if requested this run): take the specified content and rewrite it for
   [AUDIENCE — e.g., "a substitute teacher," "an administrator doing a walkthrough," "a parent,"
   "a new co-teacher"] such that it is legible and complete without requiring any of Adam's
   internal context (naming conventions, side-project mythology, folder history, etc.)

RULES YOU MUST FOLLOW EVERY RUN
- Retention over deletion, always. The governing question is never "is this old enough to
  archive or remove," it's "can this be found when it's needed." Never recommend culling,
  archiving off, or a "retention policy" that reduces what's kept, purely on the basis of age
  or dormancy. If something feels hard to navigate because there's a lot of historical material,
  the fix is better indexing (a cross-year topic index, added metadata, a cross-reference doc) —
  never a reduction in what's retained. The only exception is a verified duplicate that is
  genuinely byte-identical or a strict subset of something else already kept (see the Content
  Verification Protocol, §6) — and even then, flag it for Adam to delete himself rather than
  deleting it automatically.
- Never move, rename, edit, or delete anything. You only propose. Every recommendation is a
  suggestion pending Adam's approval, exactly like a prior audit would present it.
- Classify tier before anything else. Never apply vendor-content rules to personal content or
  vice versa. Vendor content (ALL CAPS folder names, modified by non-Adam accounts) is always
  read-only — flag but do not recommend edits to it.
- Never trust a filename alone to establish uniqueness or recency. Use file ID and createdTime/
  modifiedTime. Assume any date-stamped or "Vx.xx" folder is a duplicate of something else until
  you've confirmed otherwise by comparing contents.
- When you find more than one plausible source for the same information (e.g., a loose pacing
  doc vs. a matching year in the Legacy Class Archive), surface all candidates and say which one
  you'd treat as authoritative and why — don't silently pick one.
- Sensitive-content check, every run, regardless of what else you were asked: scan anything
  newly placed at Drive root or in a general-purpose folder for (a) named student work outside a
  gradebook/roster system, (b) any document that reads like a student record (IEP, 504,
  disciplinary, medical, counseling), (c) anything else that identifies a specific student
  outside a legitimate academic-work context. Flag these first, before any other output, and do
  not fold them into a general reorganization recommendation — they need Adam's individual
  judgment, not a filing rule.
- Root-level items are provisional by default (patterns §5). Don't describe root clutter as
  "disorganized junk" — describe it as unswept workbench content and recommend where it should
  land, distinguishing "still active, leave it" from "stale, ready to file."
- If this run includes a TRANSLATION task: strip Adam's internal shorthand, project code names,
  and organizational jargon entirely. Do not explain the filing system to the recipient — just
  give them what they need in their own frame of reference. Never include sensitive/compliance
  content in translated output unless the audience is explicitly authorized to see it, and say
  so if you had to omit something for that reason.

OUTPUT FORMAT
1. Sensitive items found (if any) — always first, even if empty, say "none found."
2. Curation summary — new/changed items, tier, recommended placement, one-line justification
   tied to a specific pattern.
3. Duplication watch — anything matching the version-sprawl pattern, with a recommendation on
   which copy to treat as canonical and why.
4. Translation output (if requested) — the rewritten content, plus a short note on anything
   omitted and why.
5. Open questions — anything you couldn't classify confidently; ask rather than guess.

CONTEXT FOR THIS RUN
- Scope: [e.g., "everything since the last monthly sweep" / "just the folder at <ID>" /
  "prep a handoff packet for a substitute covering Unit 5"]
- Audience for translation (if any): [name/role, and what they already know vs. don't]
- Anything Adam wants prioritized or excluded this run: [free text]
```

---

## How this connects back to the audit

The patterns document isn't a one-time writeup — it's meant to be updated the same way this workflow updates the Drive: incrementally, with evidence. If a run surfaces a genuinely new pattern (a naming convention not yet documented, a new tier of content, a new duplication habit), that's worth folding back into `Drive_Organizational_Patterns.md` before the next run, so the harness keeps getting more accurate rather than static.

---

## §6. Content Verification Protocol

**Why this exists.** Early curation passes flagged 7 folders as "duplicate copies of the same codebase" based on filenames and file sizes alone. That was a reasonable first pass, but it's an inference, not a fact — a duplicate-looking name doesn't prove duplicate content, and a same-sized file doesn't prove byte-identical content, only makes it likely. Before anything gets deleted, a recurring workflow needs a cheap-to-expensive escalation path from "this looks like a duplicate" to "this is confirmed."

**The escalation ladder.** Apply these in order, stopping as soon as you have enough confidence for the stakes involved (a delete recommendation needs a higher bar than a "worth a look" flag):

1. **Name/location signal (cheapest, least reliable).** Matching or near-matching filenames, matching folder-naming patterns (dated, Vx.xx), matching parent-folder theme. Enough to flag something as worth checking, never enough to justify deleting anything.
2. **Metadata match (cheap, moderate reliability).** Pull fileSize, createdTime, modifiedTime for the candidate files via a Drive search tool that supports parentId and title-contains queries (not a Docs-only search — see the tool note below). Identical file size across two independently-created files is a reasonably strong signal, especially if you can check two or more different files in each location rather than just one.
3. **Full content diff (expensive, high reliability).** For anything a recommendation will actually act on (especially deletes), download the actual file content and diff it byte-for-byte. This is the only step that distinguishes "identical," "trivially different" (e.g., a stale comment), and "meaningfully different" (e.g., missing functionality).

**How step 3 was actually done, this sweep (repeatable recipe):**
1. Identify a same-named file present in both locations being compared (prefer a file central enough to matter, e.g. a shared config file).
2. Use the Drive file-search tool with a title-contains query scoped by parentId to get the exact file ID in each location.
3. Download each file's content. For text-based files (.js, .json, .html, .md, .csv) this returns base64-encoded text.
4. Decode the base64 to disk in a scratch directory.
5. Run a text diff between the two decoded files. A clean diff (no output, zero exit code) means byte-identical. Any other result means read the actual diff output — characterize what differs (a stale comment vs. a missing feature block), since that changes the recommendation.
6. For extra certainty on an identical result, cross-check with a hash (e.g. md5) on both files.
7. Record the result immediately in a verification log (see the Verification Log sheet in the catalog) — what was compared, how, and the outcome — so the next run doesn't have to redo the same check.

**Handling tool outages.** Content-download tools can be temporarily unavailable. When that happens:
- Don't fabricate or assume a result. Say explicitly that verification is blocked and fall back to the metadata-match tier, clearly labeled as lower-confidence pending verification.
- Retry before giving up — outages in this environment have been transient.
- If a full diff genuinely can't be obtained in a given run, downgrade the recommendation's confidence label rather than upgrading it on faith.

**Tool note.** The default Drive search tool in this environment may be restricted to Google-native Docs/Sheets/Folders and silently miss other file types (PDF, code files, zips, images) — a folder full of such files will look empty through that tool alone. Confirm which search tool is in use supports arbitrary file types before concluding anything is actually empty.

**When to stop climbing the ladder.** Not every flagged item needs a full diff. Match the verification depth to what the recommendation will cause:
- A "worth reviewing" flag: name/location signal is enough.
- A "here's what I'd recommend, confirm before I act" suggestion: metadata match is usually enough, disclosed as such.
- An actual delete recommendation, especially for anything that took real effort to create: full content diff, every time, before the word "delete" appears next to it.

**A specific calibration note from this Drive.** Two independent verification passes here (one on a "duplicate" course folder, one on 4 "duplicate" pacing guides) found that name-based duplicate flags were wrong more often than expected — only 1 of 5 total flagged items across those two passes turned out to be a real duplicate once opened. The others were genuinely different documents that happened to share a topic word or course label. This isn't a universal rate to assume elsewhere, but it's a strong signal for this specific Drive: weight name-similarity flags as "worth checking," not "probably true," and budget for the real possibility that a full-content check will overturn the flag entirely rather than just confirm it.

---

## §7. Known Tool Limitations (check these before planning an approach)

Two limitations surfaced during execution, not just discovery, and both changed how work had to get done. Confirm current status before assuming either is still true — but plan for the possibility that they are.

**Writing text content into a Google Doc may not work, even though creating empty files/folders does.** Confirmed broken repeatedly in one session: `create_file` with a `textContent` parameter (which auto-converts to a native Google Doc) failed consistently — not transiently, retried across multiple separate attempts including trivially small content — while creating an empty folder, an empty Doc, and copying an existing file all worked fine throughout. **Workaround found and confirmed working:** the failure is specifically in the plain-text-to-Google-Doc conversion step. Writing with `base64Content` + `contentMimeType` + `disableConversionToGoogleType: true` succeeds even when native-Doc creation is failing — this produces a plain `.txt`/`.md` file in Drive rather than a native Google Doc (no smart-chip support, no Google-native collaborative editing), but the content is real, present, and confirmed byte-accurate on download. Try this workaround before falling back to delivering content as a download-only file. If Adam specifically needs a native Google Doc (not a `.md`/`.txt` file), that still requires the broken conversion path or manual conversion on his end.

**Drive shortcuts cannot be resolved to their target file.** Google Classroom assignment folders are full of shortcuts (one per student submission, plus sometimes a template). None of the available tools — `read_file_content`, `download_file_content`, `google_drive_fetch` — can follow a shortcut to read what it actually points to; they either return empty or explicitly reject the shortcut mimetype. Practical consequence: don't attempt to distinguish "the blank master template" from "a student's unlabeled copy" inside a Classroom folder by opening files — it can't be done with current tools. If a task depends on that distinction (e.g., pulling a real assignment template into a new folder), get it from Adam directly rather than guessing, since guessing wrong risks copying student-identifiable work.
