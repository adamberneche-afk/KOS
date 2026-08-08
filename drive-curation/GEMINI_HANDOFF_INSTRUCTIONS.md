# Instructions for Google Gemini — Complete the Drive Punch List

**Read this entire document before taking any action.** This is a handoff from a prior Claude-assisted audit of Adam Berneche's Google Drive. Every item below has already been investigated and verified — your job is to *execute*, not to re-decide. Where judgment is still required, that's explicitly flagged as "DO NOT ACT — flag for Adam" rather than left ambiguous.

**Prerequisite context:** if you have access to it, read `00_MASTER_INDEX.md` first — it explains the whole project and links every supporting document. This instruction set is self-contained, but that file has the full reasoning behind each decision if you want it.

---

## Phase 0 — Safety setup (do this first, every time)

1. **Never use permanent delete.** Google Drive's standard "Remove" / "Move to trash" action is sufficient and is what every instruction below means by "delete." Do not empty Trash, and do not use any "delete forever" option. Items in Trash are recoverable for 30 days by default (confirm your account's actual retention window before proceeding, since org policies vary) — this is the built-in recovery method for every deletion in this document.
2. **Before deleting anything, confirm you're looking at the exact file ID given below**, not just a matching name. Several files in this Drive share identical or near-identical names by coincidence (see the "why this matters" note in Phase 2) — always check the ID in the URL against the ID listed here before acting.
3. **Take a timestamped screenshot or note of Drive's root-level file list before you start.** This costs nothing and gives you a fast visual reference if anything looks wrong afterward.
4. **Do the renames (Phase 1) before the deletions (Phase 2).** This order matters: Phase 1 touches two folders that Phase 2 also references, and doing renames first avoids any confusion about which folder is which while you're deleting.
5. **Work in the order given.** Each phase is safe to pause between. Do not skip ahead.

---

## Phase 1 — Renames (2 items)

### 1a. Rename the 2020 Legacy Class Archive folder

- **Find this folder:** search Drive for the folder with this exact ID: `0B399AM7ZcaIVfnpIOEN0MTJ4THJVUGFYRVJ1UTF2Z002MjNYc3JXX1lMQW5Bd2dIMW4ybkE`
  (URL: `https://drive.google.com/drive/folders/0B399AM7ZcaIVfnpIOEN0MTJ4THJVUGFYRVJ1UTF2Z002MjNYc3JXX1lMQW5Bd2dIMW4ybkE`)
- **Current name:** "Assignments"
- **Rename to:** "Legacy Class Archive (2020-2026)"
- **Why:** this folder and the one in step 1b are both currently named "Assignments," despite being completely different things — this one is six years of real course/student folders; the other is a software tool's data folder. The identical name is a genuine risk of the wrong one being acted on by mistake.
- **Recovery if this goes wrong:** right-click the folder → Rename → type "Assignments" to restore the exact original name. No data is affected by a rename; this is fully and instantly reversible.

### 1b. Rename the 2026 Assignment System folder

- **Find this folder:** search Drive for the folder with this exact ID: `1s0BFiuPb6_3gLAoKP4QyBnNf0bz7eBiI`
  (URL: `https://drive.google.com/drive/folders/1s0BFiuPb6_3gLAoKP4QyBnNf0bz7eBiI`)
- **Current name:** "Assignments"
- **Rename to:** "Assignment System (Automation Tool Data)"
- **Why:** same reasoning as 1a — this disambiguates the two "Assignments" folders permanently.
- **Recovery if this goes wrong:** right-click the folder → Rename → type "Assignments" to restore the exact original name.

**Checkpoint:** after Phase 1, confirm both folders show their new names and that neither folder's *contents* changed (child file/folder count should be identical to before). Renaming never touches contents, but verify anyway before moving to Phase 2.

---

## Phase 2 — Deletions (soft delete / move to Trash only)

**Why this matters:** every item below was verified by actually opening and comparing file content (not just filenames) in the prior audit. Do not extend this list by pattern-matching to other similarly-named files you might notice — if it's not explicitly listed here with an ID, it hasn't been verified, and deleting it is out of scope for this handoff.

### 2a. Verified byte-identical duplicates — delete with full confidence

Move each of these to Trash:

| Item | ID | Type |
|---|---|---|
| V5.26 folder | `13QKivl5EeFtMvJV3_G-qzdd2fAEHgXJX` | Folder |
| V5.23 folder | `1_3u-CLs8MenQn2_woEOUbzJq2asyCK0L` | Folder |
| Scripts v6.6 folder | `1Y5Afo-JYNxawbk76-hFtw3Y-b2Kjnaep` | Folder |
| CAS Module 2 snapshot "6.28.26" | `1h_em5LUeUTpgIp2Q_5X4rpKGgkUx8zPR` | Folder |
| DESTINATION_FOLDER_ID | `1kfOhTtocUc7LoZ-FgFY8TrKFVNzmTaiL` | Folder |
| Pacing Guide (v1) | `1gv6T7MDQY4EXmBnVECK_NwG0Qvn_9-eUb132CQWvgZg` | Doc |
| Copy of 16_UnifiedManualSetup.js | `1OAfw4NB1mL1wMvtj2KAGHshckPM4606a` | File |
| 16 UnifiedManualSetup.pdf.pdf | `19Nn0YPqQq7tN5UB1EayYyYMmsECMRByo` | File |
| Copy of Room 107 Door.JPG (dup #1) | `1yKJsw9_IJfwCr6WbEckxEDbSB3DVjUPD` | File |
| 2627_pacingguide (original, now superseded) | `1-j75OJBDMfyJ80Ibs3czoKUQYmJqwt64myz51cY03tQ` | Doc |

**⚠️ DO NOT delete these — explicitly kept, do not touch:**
- CAS Module 2 snapshot "6.30.19" — `1o_zM1DQEn6VESV3UtUTBTVfaOFeWslJ0` (kept in favor of 6.28.26 above)
- Pacing Guide (v2) — `1jOssIHw_CEyiEAEQsoSv6FHRBRQ1LfpW93esN1rh-tg` (kept in favor of v1 above)
- Copy of Room 107 Door.JPG dup #2 — `1D5Nl-EevvewZmkkqxmUeeOjkqz1TQ38x` (kept as the one surviving copy)
- "2026-27 DECA and Operations Calendar" — `183hWU_n4WwCl_x2cG4XuibHfxJe4K27m3aEX0lMfkhA` (this is the renamed replacement for the original 2627_pacingguide being deleted above)

### 2b. Loose files inside shared folders — delete only the specific files listed, not the whole folder

**Inside "Tesseract Distribution Engine" folder** (`1Lr9NnCHAOvSN6_2IzA0Ae1VcKpafD6J7`):
Delete the loose `.js` and `.html` files sitting directly in this folder. **Do NOT delete the "V5.28" subfolder inside it** — that one contains PDF reference exports, not duplicate code, and was never flagged for deletion.

**Inside "CAS" folder** (`1eCrP0jTuo-S3D_UoHHHkzGMgNsNyfY-I`):
Delete the numbered script files (00 through 21) and HTML files sitting loose at this folder's top level. **Do NOT delete the three dated subfolders inside it** (named `6.28.26`, `6.30.19`, `6.30.26`) — those hold separate Module 2 content, already handled correctly in 2a above.

### 2c. Root-level loose files — 12 files, a discarded early prototype

All 12 of these are individual files sitting directly at Drive root (no folder). Delete each:

| File | ID |
|---|---|
| 01_StudentDoc_ContainerScript.js | `1FgYreFXH3zftQjujr33capWH8sWB2EmV` |
| 02_Form1_IntakeAndWorkspaceGenerator.js | `1RZOQXn3ADGMAJ-zLH29n2TgO3Lia_OAB` |
| 03_QueueBridge.js | `1x13ENlbHG3q6dP3u0kbadeKfPp2zn3Lp` |
| 04_Form2_TurnInGate.js | `1aYm4yY-_J-uwspaG46PuAbrqCzinsBDL` |
| 05_TeacherIntakePipeline.js | `1S5jTlrtDhfQqXw-K1rEOo70p-tEvwrO2` |
| 06_StagingPipeline_Turnstile.js | `1g3rXFL8KbBd53ms9zBa_WJRXTKoaBJJV` |
| 07_TeacherDashboard.js | `1SPuo11fv887NwqkxUD6lUggo8HC1g4f1` |
| 08_TeacherConfirmationStep.js | `1pm_fSaJeU4oNZp3WBpbpl2xBQ0JpXPtN` |
| 09_StudentRevisionGuidance.js | `1TRfb90_MTlkE1wqj-1sRdhVCfb07l3yQ` |
| 10_AdminRecoveryPanel.js | `1o-eGkUq7cq5pdSWZpdvhwglLmAzmHRvI` |
| 11_StudentFriendlyRejections.js | `10vUf6RFmet7D7-gjBpB3jV-9UC2d-D_F` |
| 12_TeacherQuickStartGuide.html | `1_YtyzhcxO2maArD9MHGc9nqD1loBhrTq` |

**⚠️ Needs a quick look before deleting, not a blind delete:**
- `10_TURNSTILE.txt` (ID `16kyueLL0OHDwTLpBi857xFGdarJ4AI8a`) — sits alongside the set above but has a different creation date and was never content-verified. Open it; if it's clearly related to the same discarded prototype, delete it too. If its content looks unrelated or unclear, leave it and flag it for Adam instead.

### 2d. Personal media originals — delete only after visual confirmation

A "Personal Media" folder already exists in this Drive with confirmed-personal copies of the 24 files below. **Before deleting each original, open the corresponding copy in the Personal Media folder and visually confirm it matches** — this is the one category in this whole list worth a human (or your own) sanity check before deleting, since these are irreplaceable personal photos/videos, not regenerable documents.

| Original file (delete after confirming copy) | ID |
|---|---|
| IMG_3954.JPG | `1Ksan3xEOIcyMUZUyKyYzU2eqdGu7aLJ4` |
| IMG_3956.MOV | `15djTyj0xw1Yna-8VkmwuNqcaA5E1Pn59` |
| IMG_3957.JPG | `1HzYNsLuY-ASl630RwFhB1fJP6UOZx8bT` |
| IMG_4069.JPG | `1CDUe9X5Vp_wnwVKVDmso6QRFdhGeYito` |
| IMG_4070.JPG | `10f7Pe21wHM0DxihNkCLrVhqLNuqhFkwA` |
| IMG_4071.JPG | `1srWevUpMs4KY20NZUT0yBApfWW_zc6uC` |
| IMG_4072.JPG | `128k7y9OBJLfpmKENGAr3tp_DAteg3it4` |
| IMG_4073.MOV | `1RyLX09v0xKsWLlgW_v_dl9uNzltBsHFa` |
| IMG_4074.MOV | `1O6lShO2BpQaV32tKPxMqNjQrJ7LHbO_p` |
| IMG_1872.jpeg | `1bg863u0x_hf_Q6JneizGiA5f9qgUkP9t` |
| IMG_4390.JPG | `1Bqzd0hcQkdc9MmamMuiGwTxKV7GLXX75` |
| IMG_4470.MOV | `1M74rb-2Vj_tctaWKRITOSkgrA9MR7tZ8` |
| IMG_5175.JPG | `1PCHumUswD0u-EtExFvfEt8ccOgCwhcoA` |
| IMG_5176.JPG | `1ZtfZQ_5y8_VFi2HndUbU6CYn1y2lXPcJ` |
| IMG_5177.JPG | `1t7m83YQhxyyWhhbztoqyN6w99mqoIjRK` |
| Bean recipe.JPG | `1gL5zNHhPr30yLBZBoUTSwi98qLMohpk3` |
| football-cleats-coloring-page-0.jpg | `1bmveER99xngSb57Td2BUq_EFIpYJJ8r_` |
| Copy of IMG_1324.HEIC | `11bnuOIQ5Cv3BKgApFkqOARNan3kZ1iog` |
| Copy of IMG_1325.HEIC | `1-8BJff_xkau-CcRFRoMHwOKISQl7xHGd` |
| Copy of IMG_1326.HEIC | `1-EDahYc9NgrU88F6aVz02lZ0N7-lcoNL` |
| Copy of IMG_1327.HEIC | `1-H55RSDgMVj9G_NL83rdeHZFcR5_Cnuk` |
| IMG_0189.HEIC | `1AQk9H5VP-4dchsgg8VOmGAAnFjJ8Bh--` |
| IMG_0190.HEIC | `1-Y1saFyxtPTESAYUjhxlykgZyZHkOYMZ` |
| IMG_0191.HEIC | `1Y-lHSbkFyf5FOFsnZPai0BC9mihkRwUV` |
| IMG_0192.HEIC | `1cEd1HMRnCcRflZ8q6xnTTiDMGaNtfEnQ` |

### 2e. Session housekeeping — safe to delete without review

These were created by mistake during the prior audit session (tool troubleshooting artifacts, not real content):

| Item | ID |
|---|---|
| Empty stray doc | `1dy9yK_rhf8pwT2vCo7Ry1KLy-gJD_hfgqlsZew4ER4E` |
| Empty stray folder ("tool-check-empty-folder") | `1YtHmJQDxG_lkquRjCcEnASmiKDLGtIFg` |
| Empty stray doc ("empty-doc-test") | `1n6lYWZ11Yep3Ibjv1JezC9RIg1kmOBqxhGTZS0YfJd0` |
| write-test-plain.txt (inside Marketing Exploration / Unit 1 folder) | Search by name inside `1WKhiG0w9pAwIfODY3htRwR7nUitnYhAi` |

### 2f. Needs your own review before deleting — do not delete blind

These were flagged but never content-verified. Open each and use your judgment; if genuinely unneeded, delete, but this is not a pre-approved delete like the sections above:

- `files 19.zip` (inside the old CAS "6.30.26" folder) — ID `190BzBJApUzd7y6SW98iwrRJMfIWBclRY`
- "Saved from Chrome" folder — ID `1YBepugyWAaEsWpO3o7NuaU8pYqs-5mX4` (contains one unlabeled scanned PDF)

---

## Phase 3 — Items requiring Adam's judgment, not your action

**Do not act on these. Do not delete, rename, move, or otherwise modify anything related to the items below.** They require Adam's own decision. Your job here is only to present them clearly if asked, not to resolve them:

1. **The IEP document and named-student brochure at Drive root** — sensitive student content. Never touched throughout this entire project. Leave exactly as-is unless Adam gives explicit, specific instructions for these particular files.
1a. **All Google Form "(Responses)" spreadsheets, and any individually-named student document** — confirmed during a later audit pass to contain real student names, CCPS student email addresses, and personal disclosures (e.g., "AI Usage Disclosure (Responses)," "Mission Associates - Agency Contract Portal (Responses)," "AI Usage disclosure - Jassen Marquez"). This is a systemic pattern across this Drive, not isolated files — treat any file with "(Responses)" in its name, or any file whose name includes what looks like a real first-and-last name, as sensitive by default unless Adam confirms otherwise. Do not open, move, rename, or reference these in any output shown to a third party.
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
- [ ] Phase 2d: all 24 personal media originals visually confirmed against their copies before deletion
- [ ] Phase 2e: 4 housekeeping items deleted
- [ ] Phase 2f: your findings on the 2 items needing manual review (deleted, kept, or still undecided)
- [ ] Phase 3: confirmed nothing in this section was touched

Note anything that didn't go as expected, anything you chose not to act on and why, and anything you had to restore from Trash.
