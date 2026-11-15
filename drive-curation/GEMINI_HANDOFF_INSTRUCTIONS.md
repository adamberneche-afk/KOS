# Instructions for Google Gemini — Complete the Drive Punch List

**Read this entire document before taking any action.** This is a handoff from a prior Claude-assisted audit of Adam Berneche's Google Drive. Every item below has already been investigated and verified — your job is to *execute*, not to re-decide. Where judgment is still required, that's explicitly flagged as "DO NOT ACT — flag for Adam" rather than left ambiguous.

**Prerequisite context:** if you have access to it, read `00_MASTER_INDEX.md` first — it explains the whole project and links every supporting document. This instruction set is self-contained, but that file has the full reasoning behind each decision if you want it.

---

## Phase 0 — Safety setup (do this first, every time)

1. **Never use permanent delete.** Google Drive's standard "Remove" / "Move to trash" action is sufficient and is what every instruction below means by "delete." Do not empty Trash, and do not use any "delete forever" option. Items in Trash are recoverable for 30 days by default (confirm your account's actual retention window before proceeding, since org policies vary) — this is the built-in recovery method for every deletion in this document.
2. **Before deleting anything, confirm you're looking at the exact item described below**: its name, the folder it sits in, its type, and the reason given. Several files in this Drive share identical or near-identical names by coincidence (see the "why this matters" note in Phase 2). *(2026-11-15: the file IDs this list carried were removed, because the repo keeps no Drive file IDs or links; git history still holds them until the operator decides on a history rewrite. Where a name alone could match two items and the description doesn't tell them apart, don't act: flag it for Adam.)*
3. **Take a timestamped screenshot or note of Drive's root-level file list before you start.** This costs nothing and gives you a fast visual reference if anything looks wrong afterward.
4. **Do the renames (Phase 1) before the deletions (Phase 2).** This order matters: Phase 1 touches two folders that Phase 2 also references, and doing renames first avoids any confusion about which folder is which while you're deleting.
5. **Work in the order given.** Each phase is safe to pause between. Do not skip ahead.

---

## Phase 1 — Renames (2 items)

### 1a. Rename the 2020 Legacy Class Archive folder

- **Find this folder:** the "Assignments" folder that holds six years of course and student folders (2020 onward), not the one holding the Assignment System's data
- **Current name:** "Assignments"
- **Rename to:** "Legacy Class Archive (2020-2026)"
- **Why:** this folder and the one in step 1b are both currently named "Assignments," despite being completely different things — this one is six years of real course/student folders; the other is a software tool's data folder. The identical name is a genuine risk of the wrong one being acted on by mistake.
- **Recovery if this goes wrong:** right-click the folder → Rename → type "Assignments" to restore the exact original name. No data is affected by a rename; this is fully and instantly reversible.

### 1b. Rename the 2026 Assignment System folder

- **Find this folder:** the "Assignments" folder that holds the Assignment System's (automation tool's) data, not the one with six years of course folders
- **Current name:** "Assignments"
- **Rename to:** "Assignment System (Automation Tool Data)"
- **Why:** same reasoning as 1a — this disambiguates the two "Assignments" folders permanently.
- **Recovery if this goes wrong:** right-click the folder → Rename → type "Assignments" to restore the exact original name.

**Checkpoint:** after Phase 1, confirm both folders show their new names and that neither folder's *contents* changed (child file/folder count should be identical to before). Renaming never touches contents, but verify anyway before moving to Phase 2.

---

## Phase 2 — Deletions (soft delete / move to Trash only)

**Why this matters:** every item below was verified by actually opening and comparing file content (not just filenames) in the prior audit. Do not extend this list by pattern-matching to other similarly-named files you might notice — if it's not explicitly listed here, it hasn't been verified, and deleting it is out of scope for this handoff.

### 2a. Verified byte-identical duplicates — delete with full confidence

Move each of these to Trash:

| Item | Type |
|---| --- |
| V5.26 folder | Folder |
| V5.23 folder | Folder |
| Scripts v6.6 folder | Folder |
| CAS Module 2 snapshot "6.28.26" | Folder |
| DESTINATION_FOLDER_ID | Folder |
| Pacing Guide (v1) | Doc |
| Copy of 16_UnifiedManualSetup.js | File |
| 16 UnifiedManualSetup.pdf.pdf | File |
| Copy of Room 107 Door.JPG (dup #1) | File |
| 2627_pacingguide (original, now superseded) | Doc |

**⚠️ DO NOT delete these — explicitly kept, do not touch:**
- CAS Module 2 snapshot "6.30.19" (kept in favor of 6.28.26 above)
- Pacing Guide (v2) (kept in favor of v1 above)
- Copy of Room 107 Door.JPG dup #2 (kept as the one surviving copy)
- "2026-27 DECA and Operations Calendar" (this is the renamed replacement for the original 2627_pacingguide being deleted above)

### 2b. Loose files inside shared folders — delete only the specific files listed, not the whole folder

**Inside "Tesseract Distribution Engine" folder**:
Delete the loose `.js` and `.html` files sitting directly in this folder. **Do NOT delete the "V5.28" subfolder inside it** — that one contains PDF reference exports, not duplicate code, and was never flagged for deletion.

**Inside "CAS" folder**:
Delete the numbered script files (00 through 21) and HTML files sitting loose at this folder's top level. **Do NOT delete the three dated subfolders inside it** (named `6.28.26`, `6.30.19`, `6.30.26`) — those hold separate Module 2 content, already handled correctly in 2a above.

### 2c. Root-level loose files — 12 files, a discarded early prototype

All 12 of these are individual files sitting directly at Drive root (no folder). Delete each:

| File |
|---|
| 01_StudentDoc_ContainerScript.js |
| 02_Form1_IntakeAndWorkspaceGenerator.js |
| 03_QueueBridge.js |
| 04_Form2_TurnInGate.js |
| 05_TeacherIntakePipeline.js |
| 06_StagingPipeline_Turnstile.js |
| 07_TeacherDashboard.js |
| 08_TeacherConfirmationStep.js |
| 09_StudentRevisionGuidance.js |
| 10_AdminRecoveryPanel.js |
| 11_StudentFriendlyRejections.js |
| 12_TeacherQuickStartGuide.html |

**⚠️ Needs a quick look before deleting, not a blind delete:**
- `10_TURNSTILE.txt` — sits alongside the set above but has a different creation date and was never content-verified. Open it; if it's clearly related to the same discarded prototype, delete it too. If its content looks unrelated or unclear, leave it and flag it for Adam instead.

### 2d. Personal media originals — delete only after visual confirmation

A "Personal Media" folder already exists in this Drive with confirmed-personal copies of the 25 files below. **Before deleting each original, open the corresponding copy in the Personal Media folder and visually confirm it matches** — this is the one category in this whole list worth a human (or your own) sanity check before deleting, since these are irreplaceable personal photos/videos, not regenerable documents.

| Original file (delete after confirming copy) |
|---|
| IMG_3954.JPG |
| IMG_3956.MOV |
| IMG_3957.JPG |
| IMG_4069.JPG |
| IMG_4070.JPG |
| IMG_4071.JPG |
| IMG_4072.JPG |
| IMG_4073.MOV |
| IMG_4074.MOV |
| IMG_1872.jpeg |
| IMG_4390.JPG |
| IMG_4470.MOV |
| IMG_5175.JPG |
| IMG_5176.JPG |
| IMG_5177.JPG |
| Bean recipe.JPG |
| football-cleats-coloring-page-0.jpg |
| Copy of IMG_1324.HEIC |
| Copy of IMG_1325.HEIC |
| Copy of IMG_1326.HEIC |
| Copy of IMG_1327.HEIC |
| IMG_0189.HEIC |
| IMG_0190.HEIC |
| IMG_0191.HEIC |
| IMG_0192.HEIC |

### 2e. Session housekeeping — safe to delete without review

These were created by mistake during the prior audit session (tool troubleshooting artifacts, not real content):

| Item |
|---|
| Empty stray doc |
| Empty stray folder ("tool-check-empty-folder") |
| Empty stray doc ("empty-doc-test") |
| write-test-plain.txt (inside Marketing Exploration / Unit 1 folder) |

### 2f. Needs your own review before deleting — do not delete blind

These were flagged but never content-verified. Open each and use your judgment; if genuinely unneeded, delete, but this is not a pre-approved delete like the sections above:

- `files 19.zip` (inside the old CAS "6.30.26" folder)
- "Saved from Chrome" folder (contains one unlabeled scanned PDF)

---

## Phase 3 — Items requiring Adam's judgment, not your action

**Do not act on these. Do not delete, rename, move, or otherwise modify anything related to the items below.** They require Adam's own decision. Your job here is only to present them clearly if asked, not to resolve them:

1. **The IEP document and named-student brochure at Drive root** — sensitive student content. Never touched throughout this entire project. Leave exactly as-is unless Adam gives explicit, specific instructions for these particular files.
1a. **All Google Form "(Responses)" spreadsheets, and any individually-named student document** — confirmed during a later audit pass to contain real student names, CCPS student email addresses, and personal disclosures (e.g., "AI Usage Disclosure (Responses)," "Mission Associates - Agency Contract Portal (Responses)," and an AI Usage disclosure doc titled with one student's full name). This is a systemic pattern across this Drive, not isolated files — treat any file with "(Responses)" in its name, or any file whose name includes what looks like a real first-and-last name, as sensitive by default unless Adam confirms otherwise. Do not open, move, rename, or reference these in any output shown to a third party.
2. **Units 2, 3, and 4 of the Marketing Exploration plan have zero confirmed matches** in the Legacy Archive — this needs Adam to confirm whether these are actually taught as written.
3. **The 7 large video files** (85-259MB each, listed in the master index) were never able to be reviewed by the prior tooling due to file-size limits. If your tools can preview video content, you may review these and report back what you find — but do not delete or move any of them without Adam's explicit go-ahead based on your findings.
4. **The other side projects** (Knowledge Operating System, Argoloth Sandbox, Active_Brain_Trust_System) — no decision has been made about these. Leave them alone.
5. **Whether the Sports Entertainment Marketing/Management "regular" sections are genuinely thin or just under-filed** — an open question, not a task.

---

## Recovery procedures — how to walk anything back

**If a rename (Phase 1) needs to be undone:** right-click the folder → Rename → retype the original name exactly as documented in Phase 1 above ("Assignments" for both). This is instant and has zero side effects, since renaming never touches a folder's contents.

**If a deletion (Phase 2) needs to be undone:**
1. Open Google Drive → Trash (left sidebar).
2. Find the item by name or by searching the file ID in the Trash search bar.
3. Right-click → "Restore." This returns the file to its exact original location with its original name and ID intact.
4. If multiple items need restoring, they can be restored individually — restoring one does not affect the others.
5. **Time-sensitive:** items are only recoverable this way while still in Trash (default 30 days, but confirm your actual account policy). If something is deleted and you don't discover the need to restore it within that window, it cannot be recovered by you — factor this into how quickly you double-check your own work after Phase 2.

**If something looks wrong and you're not sure what happened:** stop immediately, do not attempt further changes, and report back exactly what you did (which phase, which items) so it can be diagnosed. Do not try to "fix" an uncertain situation with more actions — every additional undocumented action makes recovery harder, not easier.

---

## When you're done

Report back with a simple completion checklist:
- [ ] Phase 1: both folders renamed, contents unchanged
- [ ] Phase 2a: 10 items deleted, 4 "do not delete" items confirmed untouched
- [ ] Phase 2b: loose files deleted from Tesseract and CAS folders, both subfolders (V5.28, and the 3 dated CAS folders) confirmed untouched
- [ ] Phase 2c: 12 files deleted, 10_TURNSTILE.txt reviewed and handled appropriately
- [ ] Phase 2d: all 25 personal media originals visually confirmed against their copies before deletion
- [ ] Phase 2e: 4 housekeeping items deleted
- [ ] Phase 2f: your findings on the 2 items needing manual review (deleted, kept, or still undecided)
- [ ] Phase 3: confirmed nothing in this section was touched

Note anything that didn't go as expected, anything you chose not to act on and why, and anything you had to restore from Trash.
