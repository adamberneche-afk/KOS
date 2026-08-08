# Drive Overhaul — Master Index

*The single entry point for this entire project. Everything below reflects the state as of this consolidation. Read this first; it tells you what each other document is for and what's actually happened in the live Drive vs. what's still a proposal.*

---

## 1. What's actually changed in the live Drive

Everything below is real — created via Drive tools, confirmed in responses. **Nothing has been deleted.** Every action was additive (new folders, copies) or purely informational (searching, reading).

| Created | Contents |
|---|---|
| **Marketing Exploration** (root folder) | 9 Unit subfolders (empty of files — see §3 for why), 3 copied core docs (Student's Guide, Rebrand Focus Group Tools, VDOE 8175 doc) |
| **Class Projects** (root folder) | Magazine Project (3 sections copied in), DECA and Contract Launchpad (brochure template + Mission Associates portal copied in) |
| **Personal Media** (root folder) | 24 confirmed-personal files copied in (photos, videos, HEIC files, the recipe photo, the coloring page) |
| **Professional Development** (root folder) | 1 file copied in (CHHS Google LTI PD training submission, pulled out of the Legacy Archive) |
| **TO DELETE - Review and Remove** (root folder) | 2 stray empty test files from mid-session tool troubleshooting (harmless, listed in the manifest) |

**Nothing was renamed. Nothing was moved (only copied) or deleted.** The "Assignments" naming collision, the pacing guide duplicates, "2627_pacingguide," and everything in the deletion manifest are all still sitting exactly where they were — every one of those needs your hand, not mine, per your original instruction that all changes be discussed first.

---

## 2. The documents — what each one is for

| Document | Purpose | Status |
|---|---|---|
| **Drive_Curriculum_Catalog_v6.xlsx** | The full audit catalog — every folder/file category, verification status, recommended actions. Start here for "what's in my Drive and what should happen to it." | Current, final version. v1-v5 in the outputs folder are superseded drafts — safe to ignore/discard, kept only as a record of how the audit evolved. |
| **Drive_Organizational_Patterns.md** | The context-harness reference — governing principles (retention over deletion, tier model, naming conventions, verified-vs-inferred duplication, aspirational scaffolding) that should shape any future decision about this Drive. | Current, consistency-checked end-to-end (fixed one broken cross-reference, added a 5th tier for shared-not-owned content, folded in 4 findings that had only ever lived in chat) |
| **Watch_List.md** | Low-confidence, single-instance observations not yet worth a rule. Currently 1 entry (Canvas Assignment docs). | Current |
| **Recurring_Drive_Curation_Workflow.md** | The reusable methodology + ready-to-paste system prompt for running future curation/translation passes on this Drive. | Current |
| **GEMINI_HANDOFF_INSTRUCTIONS.md** | Explicit, step-by-step execution instructions for a different AI assistant (Gemini) to complete the remaining punch list — the actions I can't execute myself (delete, in-place rename). Includes phased ordering, exact file IDs, "do not touch" guardrails, and full recovery/rollback procedures via Drive Trash. | Current, ready to hand off |
| **DELETION_MANIFEST.md** | The click-through checklist for everything verified as duplicate/deprecated/personal — direct links, organized by confidence level. Superseded as an execution tool by GEMINI_HANDOFF_INSTRUCTIONS.md (same content, but phased with recovery steps); kept as the underlying source reference. | Current |
| **Unit_Cross_Reference_Links.md** | Smart-chip-ready links from 4 of the 9 Marketing Exploration units to their real, matching activity folders in the Legacy Archive (2025-26 only). | Current |
| **Curriculum_Cross_Year_Index.xlsx** | The deeper version of the above — 33 recurring activities traced across 2021-2026, plus pacing guide cross-references and a gap analysis. | Current |
| **unit_lesson_plans/** (9 files) | The actual split content for each of the 9 Marketing Exploration units — objectives, competencies, activities, assessment. Ready to paste into the matching Drive folder. | Current, not yet placed in Drive (content-writing tool is broken — see §4) |

---

## 3. Update: content-writing limitation resolved (partially)

The original limitation (see below) is now worked around. **The failure was specifically in converting plain text to a native Google Doc** — writing a plain `.txt`/`.md` file (via `disableConversionToGoogleType: true`) works fine and was confirmed by testing. As a result, this session was able to execute directly rather than only deliver downloads:

- All 9 unit lesson plans are now live as `.md` files inside their actual Marketing Exploration Unit folders (not just downloads)
- The Unit Cross-Reference Links doc is now live inside the Marketing Exploration folder
- The full Deletion Manifest is now live inside the TO DELETE folder
- "2627_pacingguide" has been effectively renamed via copy-with-new-title to "2026-27 DECA and Operations Calendar" (the original is now flagged in the manifest as redundant)

**Still not possible:** native Google Docs (the kind that support smart chips, real-time collaborative editing, etc.) can't be created with content directly — only plain text/markdown files. If Adam wants the lesson plans and manifest as true Google Docs rather than `.md` files sitting in Drive, they'd need to be manually converted (open the `.md` file, copy content into a new Doc) or wait for the native conversion path to recover.

**Still can't be done at all:** delete, rename-in-place, and move (only copy). The rename workaround (copy with new title) works for single files but not for folders with contents — folder renames still need to happen directly in the Drive UI.

---

## 3a. Original limitation notes (for reference)

Confirmed broken, repeatedly, throughout this project: the tool that writes text content into a new or existing Google Doc. Folder creation and file **copying** both work fine — that's how the folders in §1 got built and populated. But nothing that required originating new text (the deletion manifest, the 9 unit lesson plans, the cross-reference links) could be written directly into a Drive Doc. All of it was delivered as downloadable files instead.

**Practical consequence, updated:** the 9 Unit folders now contain both real copied materials (where archive matches existed) and the actual lesson-plan text (now live as `.md` files — see §3 above). This item is closed.

---

## 4. What's still open — the real punch list

Consolidated from every prior round, updated to reflect what got executed this session (marked ✅).

1. **Sensitive items** — the IEP document and named-student brochure at root. Still yours to handle directly; intentionally never touched.
2. **Work through DELETION_MANIFEST.md** (now live in the TO DELETE folder, not just a download) — click-through, confirm, delete. Covers 6 verified-duplicate codebase copies, 1 duplicate pacing guide, the now-redundant "2627_pacingguide" original, several stray files, and all 24 personal media originals.
3. ✅ **"2627_pacingguide" renamed** (via copy-with-new-title to "2026-27 DECA and Operations Calendar"). **Still open:** the two "Assignments" folders (2020 Legacy Archive vs. 2026 Assignment System) — folder renames can't be done via the copy workaround, still need a direct manual rename.
4. ✅ **9 unit lesson plans and the cross-reference links are now live in Drive**, not just downloads.
5. **Units 2, 3, 4 have zero confirmed matches** in the archive — worth confirming these are actually taught as written, or finding out why no matching folders turned up.
6. **7 unverified video files** (85-259MB, too large for available tools to check) — a manual preview would close this out.
7. **Decide what to do with the other side projects** (Knowledge Operating System, Argoloth Sandbox, Active_Brain_Trust_System minus the codebase copy already in the manifest) — never addressed, still sitting at root.
8. **The Sports Entertainment Marketing/Management "regular" sections are thinly documented** compared to their Honors counterparts — worth a look to see if that's real or a filing gap.

---

## 5. If you want to resume this later

Point a future session at this file first. It links everything else. The recurring workflow prompt in `Recurring_Drive_Curation_Workflow.md` is written to be dropped into a new session directly — it already knows to read `Drive_Organizational_Patterns.md` and `Watch_List.md` before doing anything.
