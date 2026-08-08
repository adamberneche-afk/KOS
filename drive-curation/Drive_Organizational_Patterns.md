# Drive Organizational Patterns — Context Harness Reference

*Derived from a three-sweep audit of Adam Berneche's Google Drive, July 2026. This document captures recurring, evidence-based patterns in how content actually gets created, named, and filed — not how it "should" be organized in the abstract. It's meant to be the thing a context harness reads before deciding where something belongs or where to look for something.*

**Companion document:** `Watch_List.md` holds early-stage observations that don't warrant a rule here yet — a pattern with only one confirming data point, a possible-but-unconfirmed trend. Check it alongside this document. If something on the watch list gets a second confirming instance, it graduates into a real §-numbered rule here.

---

## 0. Governing principle: retention over deletion

Before any other rule in this document — the operating philosophy for this Drive is **keep everything, organize for findability.** The question a curation pass asks is never "is this old / is this still needed," it's "can this be found when it's needed." Deletion is reserved for genuine zero-value duplication (see §5a), never for age, dormancy, or a folder simply predating the current course structure.

This has a specific, practical consequence for the Legacy Class Archive: nothing from 2020 onward gets archived off, zipped, or culled by year. Instead, the fix for "six years of folders is a lot to navigate" is a cross-year **topic index** — a document that surfaces every year's version of a recurring activity (e.g., every "Pricing Strategy Scavenger Hunt" from 2021 through 2026 in one place), so history is an asset to browse, not a pile to eventually thin out.

**Harness rule:** when a curation pass is tempted to recommend archiving, culling, or "retention policies" that reduce what's kept, redirect that energy into better indexing instead — a cross-reference document, a topic-based view layered on top of the year-based folders, additional metadata — never a reduction in what's retained. The one exception is §5a-style verified duplication, where a copy adds no unique information at all; even then, prefer flagging for Adam's own deletion over doing it automatically.

---

## 1. The five content tiers

Everything in the Drive sorts into one of five tiers, and the tier determines the rules that apply to it.

| Tier | Description | Owner/Modifier | Rule |
|---|---|---|---|
| **Vendor Curriculum** | Purchased "Business of Sports and Entertainment" library — units, bonus content, capstones, LMS packages | Modified by vendor accounts ("laura", "chris"), never Adam | Read-only. Never reorganize, rename, or edit. Treat as a template to imitate, not content to fix. |
| **Personal Teaching Content** | Everything Adam actually writes/assigns — the Legacy Class Archive, Marketing Exploration docs, class projects | Adam, continuously | Active and evolving. This is what a reorg should target. Note: "Marketing Exploration" is Adam's working label for what the Legacy Class Archive itself calls "Principles of Business & Marketing" — confirmed via a 7-point activity-name match in the 2025-26 cross-year index. The two labels refer to the same real course; don't treat them as separate subjects when searching. |
| **Internal Tooling** | The custom Assignment System (Apps Script) and its version-sprawl side-folders (Tesseract, CAS's loose script copies), plus genuinely unrelated hobby projects (Argoloth Sandbox). | Adam, as engineering side-work | Infrastructure, not curriculum. Should live in its own space, cleaned up on its own schedule. **Exception: Knowledge Operating System (KOS) / Active_Brain_Trust_System does not fully belong in this tier — see the dedicated note below.** |
| **Sensitive/Compliance** | Student PII, named student work outside a gradebook system, and — confirmed as a systemic pattern, not isolated files — every Google Form "(Responses)" spreadsheet, which by construction contains real student names and CCPS student emails alongside whatever the form collected | Adam, but requires special handling | Never treated like ordinary content. Flag, don't casually reorganize or expose in outputs to third parties. Treat any "(Responses)" spreadsheet or any filename containing what looks like a real first-and-last name as sensitive by default — this isn't a filing mistake to fix, it's structurally how Google Forms works, and it recurs every time a new form is created. |
| **Shared-not-owned** | Files/folders other CCPS staff have shared with Adam (district Canvas training material, colleagues' templates, etc.) | Other people, not Adam | Not part of Adam's Drive to reorganize at all. A search across "everything visible to Adam" will surface these — check the owner/sharing field before including anything in a reorg recommendation, or a curation pass will end up trying to refile someone else's files. |

**Harness rule:** before deciding where something belongs or how to present it, first classify which tier it's in. Rules for one tier should never be silently applied to another (e.g., never treat vendor content as editable, never treat student PII as reference material, never treat a colleague's shared file as something to fold into Adam's own structure).

**Correction — Knowledge Operating System is not a disconnected hobby project.** Earlier audit passes classified KOS/Active_Brain_Trust_System purely as Internal Tooling — engineering side-work, unrelated to teaching, safe to deprioritize. A retrieval test surfaced a saved Gemini conversation ("Labor and wage divergence," a philosophical exercise on post-labor economies and "Economies of Depth") that shows this was incomplete. KOS's own design documents describe named pedagogical safeguards — Wait-Time Protocol, Friction Injection, Agency Safeguards, an "Apollo Syndrome" test — built specifically to preserve student agency while teaching this exact material, and they cite real content from the actual Quarter 1 Pacing Guide (Week 1 SWOT Analysis, Week 2 "Me in a Bag"). The `06_CLASSROOM_ASSETS` scaffold noted in §5b as an empty aspiration is part of this same system — its emptiness now reads less like an abandoned idea and more like unfinished, still-intended work. **Treat KOS as a hybrid: engineering infrastructure in form, but carrying real pedagogical intent in substance.** Don't route it into generic "side project, low priority" handling without flagging that pedagogical content may be at stake. This is also a live instance of the retention principle in §0 — this is exactly the kind of thing that would have been wrongly deprioritized if "keep everything, organize for findability" hadn't already been the default.


---

## 2. Naming conventions actually in use

These aren't proposed conventions — they're patterns already present, inconsistently but recognizably, across the Drive:

- **Class sections:** `[COURSE NAME]-Berneche [DistrictCode-Pxx]`, e.g. `PRINCIPLES OF BUSINESS & MARKETING-Berneche [74-C6115O-P04]`. The bracketed code is the real unique identifier — course name alone is *not* unique (the same name recurs across years).
- **Snapshot/version folders:** date-stamped as `M.DD.YY` (e.g., `6.30.26`) or `Vx.xx` (e.g., `V5.28`). These mark full-copy iterations of a working project, not incremental commits. Every dated folder of this type should be assumed to be a **duplicate of something else**, not a unique asset, until proven otherwise.
- **Canonical/master assets:** prefixed `MASTER_` or `_System` (e.g., `_System Templates`, `MASTER Student Assignment Template`). Underscore-prefixed folders signal "infrastructure, treat as singular source of truth."
- **Code files:** numbered prefixes (`00_SharedConfig.js`, `01_...`, `22_LessonContextHandler.js`...) indicating load/dependency order within a project. The number is meaningful; two files with the same number in different folders are the same file at different points in time.
- **Vendor content:** ALL CAPS folder names (`UNIT 1 - INTRODUCTION TO MARKETING`, `BONUS CONTENT`). This is a reliable tier signal on its own — Adam's own folders are typically Title Case or lowercase.
- **"CE-" prefixed docs:** appear to be Adam's own meta/framework documents (naming conventions, PRDs) — a signal of intentional systems-thinking artifacts, not day-to-day content. Caveat, confirmed at least once: the official-sounding title doesn't guarantee official-sounding content. A doc titled "CE-PRD: VDOE Course 8175 Curriculum Integration & Scaffolding Matrix" turned out, on actually opening it, to be a design document for a class-run mug-printing business simulation, written in state-standards-alignment language throughout. Treat "CE-" as a signal of "Adam's own systems-thinking artifact," not as a guarantee that the title accurately describes the content — open it before citing it as a compliance or standards reference.
- **Thematic/mythological naming for side projects:** *Tesseract*, *Argoloth*, *Sovereign*, *Council*, *Genesis*, *Brain Trust*, *Persona_*. These all belong to the same connected universe of personal AI-tooling projects and should be recognized as such — not mistaken for teaching content just because a folder inside one is literally named `CLASSROOM_ASSETS`.

**Harness rule:** disambiguate by Google file/folder ID and `createdTime`, never by name alone. Duplicate names are the norm, not the exception (see §4).

---

## 3. How real curriculum is actually structured

The working system of record for "what was taught, when" is:

```
Course Name-Berneche [District Code-Period]   (one folder per section, per year)
  └── Assignment/Topic Name                    (one folder per assignment)
        └── Checkpoint N / student submissions / templates
```

This pattern is consistent from 2020 through the current year, and the same topics recur and evolve year over year (e.g., "Business Plan," "Job Skills," "Media Plan," "Product Design" reappear with refinements each cycle). This is a stronger signal of Adam's real teaching sequence than the loose root-level docs, which read more like **current-year quick references or drafts** pulled out of this deeper structure.

**Caveat: this pattern's reliability varies by course/track, not just by year.** Principles of Business & Marketing is richly documented every sampled year (15-20+ topic folders). The Sports Entertainment Marketing/Management "regular" sections (P01/P02) are comparatively thin (as few as 4 topic folders for a full year), while their Honors counterpart (P03) is as rich as Principles. This could mean the regular-track content genuinely is lighter, or that it's simply filed less completely — unconfirmed either way. Don't assume archive thinness for a given course/section means the course itself is thin; check before concluding a topic isn't taught.

**Harness rule:** when asked "what does Adam usually teach for X," search the year-over-year archive for recurring topic names before relying on a single loose doc — the loose doc may be a partial or outdated excerpt.

---

## 4. Duplication is structural, not accidental

Every category of duplication found across three sweeps traces back to the same underlying habit: **Adam iterates by making a full new copy, rather than editing in place or using version control.** This shows up as:

- 4 differently-named "pacing guide" docs for one course
- 2 folders both literally named "Assignments" (a 2020 legacy archive and a 2026 tool folder)
- 7 near-complete copies of the same Apps Script codebase, each in a different dated or thematically-named folder
- 3 near-identical snapshots of a "Module 2" extension
- At least one same-course-same-period folder created twice, two months apart

**Harness rule:** never assume the most recently modified copy is authoritative by default — check content, not just recency, since some "duplicates" are actually reference exports (e.g., a PDF snapshot) rather than working copies. When surfacing content to Adam or to others, always surface the *set* of duplicates found, not a silent pick, unless he's already indicated which is canonical.

---

## 5. Root level is a workbench, not a filing cabinet

New ideas, new code projects, and new one-off documents consistently appear first as loose files at Drive root, before (sometimes) being moved into a folder. Root-level clutter is not "randomly scattered old stuff" — it's better modeled as **an active staging area** that periodically needs to be swept into permanent homes. This includes:
- Early-stage/prototype code for whatever tooling project is currently active
- Draft docs (open questions, meeting notes, half-formed ideas)
- Personal media (unrelated to any of the above, just landed there because it's the default upload destination)
- Occasionally, sensitive content that should never have landed in an unfiled, unsecured spot

**Harness rule:** treat root-level items as provisional. Don't assume permanence or correct filing. Do flag anything sensitive found there immediately, regardless of how "temporary" the location looks.

---

## 5a. Inference vs. verification — and why the gap matters here

Sizeable parts of the earlier audits (which of the 7 codebase copies were "true duplicates") were originally established by filename and file-size inference, not by actually reading file content. A follow-up verification pass (see `Recurring_Drive_Curation_Workflow.md` §6) opened and diffed the actual files and found the inference was *mostly* right but not entirely — one "duplicate" turned out to differ by a single stale comment, one turned out to be a genuinely earlier, less-complete version (though harmlessly superseded, not conflicting), and one (the oldest root-loose set) turned out to be more surprising still: a structurally different early prototype — hardcoded placeholder IDs, a different authentication model entirely — not a partial snapshot of the current design but a discarded earlier architecture. Verification doesn't just confirm degrees of sameness; it can reveal that two "duplicates" were never really the same thing at all.

A second verification pass went further and found an actual **false positive**: two same-named, same-period course folders created two months apart were flagged as a likely accidental duplicate. Opening both showed zero topic overlap and interleaved date ranges across the same school year — they were two genuinely different class sections that happened to share a course code, not a duplicate at all. The original flag was corrected, not just confirmed.

A third pass (on 4 "duplicate" pacing guide docs) found the same failure mode again: only 1 of the 4 was actually a duplicate once opened. The other 2 shared a topic and a rough date label but were structurally different documents — one a distinct alternate pacing design, one not even a pacing guide at all (a DECA/operations calendar that got bucketed in by name association). Two independent instances of the same failure mode is enough to call it a real pattern, not a one-off.

**Harness rule:** treat filename/size-based duplicate claims as provisional until content-verified, and label them as such explicitly (e.g., "inferred duplicate, unverified" vs. "verified duplicate, byte-identical"). Never let an inferred label silently upgrade to a verified one just because it's been repeated across multiple audit passes — repetition isn't verification. And don't assume "flagged as a possible duplicate" converges toward "confirmed duplicate" by default — verification can go either way. Adam's naming habit of reusing a topic word or course label across genuinely different documents (two sections sharing a course code, two different pacing philosophies both called "pacing guide") is itself a recurring pattern, and it's one that specifically produces duplicate false positives — weigh a name match much less heavily than content match when deciding what's actually redundant.

---

## 5b. Aspirational scaffolding — organizational intent without content

A recurring, now-confirmed habit: Adam creates folders that name an intention before populating it, and the folder often stays empty. Confirmed instances: `06_CLASSROOM_ASSETS` inside Active_Brain_Trust_System (four sub-folders — Lesson Plans, Student-Facing, Assessments, Communications — all empty), and **"Templates - DO NOT EDIT"** folders inside at least two different 2024-25 course sections (Sports Entertainment Marketing P01, Sports Entertainment Management P02), both empty despite the folder existing and being named with clear intent.

**Harness rule:** an empty folder with a purposeful, specific name is not necessarily clutter or a sign of data loss — it may be intentional scaffolding Adam built ahead of populating it. Contrast this with a placeholder-variable name like `DESTINATION_FOLDER_ID` (a literal leftover from a script's config key, confirmed truly empty, genuinely a bug artifact — see the Cleanup Candidates in the audit catalog): a purposeful name earns the benefit of the doubt, a placeholder-variable name doesn't. Don't flag purposefully-named empty folders for deletion the way genuinely orphaned ones get flagged; instead, note them as "scaffolded but not yet filled" and treat them as a real gap to ask about, not a mistake to clean up.

---

## 6. What this means for retrieval

When the harness is asked to find or reconstruct something:
1. Identify the tier first (§1).
2. If it's curriculum, check both the loose root docs *and* the year-over-year archive (§3) — they may disagree, and the archive is usually more authoritative for historical accuracy.
3. If it's tooling, expect multiple copies (§4) and confirm which is canonical before using it as a source.
4. If it's unclear, prefer the item with the most complete/plain-language name and the tier-appropriate owner, and say so explicitly rather than guessing silently.
