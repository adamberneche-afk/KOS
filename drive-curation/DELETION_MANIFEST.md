# DELETION MANIFEST — Verified Duplicates and Deprecated Items

Nothing has been deleted. This is a checklist to review and delete directly in Google Drive — click each link, confirm it's what's described, delete.

*(Note: this had to be delivered as a downloadable file rather than a Google Doc inside your Drive — the Drive connector's content-writing feature is currently broken, confirmed by testing: creating empty folders/docs works, but writing text into a doc fails every time. Folder creation for the reorg below succeeded fine.)*

---

## Whole folders — safe to delete entirely

**1. V5.26** (Assignment System codebase duplicate)
https://drive.google.com/drive/folders/13QKivl5EeFtMvJV3_G-qzdd2fAEHgXJX
Verified byte-identical to canonical Codebase (full content diff, 2 files checked, zero differences).

**2. V5.23** (Assignment System codebase duplicate)
https://drive.google.com/drive/folders/1_3u-CLs8MenQn2_woEOUbzJq2asyCK0L
Verified: differs from canonical by exactly one stale comment line. Functionally identical.

**3. Scripts v6.6** (inside Active_Brain_Trust_System — codebase duplicate)
https://drive.google.com/drive/folders/1Y5Afo-JYNxawbk76-hFtw3Y-b2Kjnaep
Verified byte-identical to canonical Codebase.

**4. CAS Module 2 snapshot — 6.28.26**
https://drive.google.com/drive/folders/1h_em5LUeUTpgIp2Q_5X4rpKGgkUx8zPR
Verified byte-identical (MD5 match) to the 6.30.19 snapshot. Keep 6.30.19, delete this one.
**KEEP — do not delete:** https://drive.google.com/drive/folders/1o_zM1DQEn6VESV3UtUTBTVfaOFeWslJ0 (6.30.19)

**5. DESTINATION_FOLDER_ID**
https://drive.google.com/drive/folders/1kfOhTtocUc7LoZ-FgFY8TrKFVNzmTaiL
Confirmed truly empty. Name matches a literal script placeholder variable — looks like a bug artifact.

---

## Loose files within a shared folder — delete these specific files, not the whole folder

**6. Tesseract Distribution Engine — loose files directly in this folder**
https://drive.google.com/drive/folders/1Lr9NnCHAOvSN6_2IzA0Ae1VcKpafD6J7
Delete the loose `.js`/`.html` files sitting directly here (verified earlier/incomplete codebase snapshot). **Do NOT delete the V5.28 subfolder** inside it — that one holds PDF reference exports, not duplicate code.

**7. CAS folder — loose files directly in this folder (NOT its 3 dated subfolders)**
https://drive.google.com/drive/folders/1eCrP0jTuo-S3D_UoHHHkzGMgNsNyfY-I
The numbered scripts (00–21) and HTML files sitting loose at this folder's top level are verified byte-identical duplicates of canonical Codebase. The three dated subfolders inside (6.28.26, 6.30.19, 6.30.26) hold separate Module 2 content — leave those alone except item 4 above.

---

## Root-level loose files — 12 files, earliest prototype generation

Verified via full content diff: a structurally different, discarded early prototype (hardcoded placeholder IDs, different auth model) — not a partial snapshot, a fully superseded design.

- 01_StudentDoc_ContainerScript.js — https://drive.google.com/file/d/1FgYreFXH3zftQjujr33capWH8sWB2EmV/view
- 02_Form1_IntakeAndWorkspaceGenerator.js — https://drive.google.com/file/d/1RZOQXn3ADGMAJ-zLH29n2TgO3Lia_OAB/view
- 03_QueueBridge.js — https://drive.google.com/file/d/1x13ENlbHG3q6dP3u0kbadeKfPp2zn3Lp/view
- 04_Form2_TurnInGate.js — https://drive.google.com/file/d/1aYm4yY-_J-uwspaG46PuAbrqCzinsBDL/view
- 05_TeacherIntakePipeline.js — https://drive.google.com/file/d/1S5jTlrtDhfQqXw-K1rEOo70p-tEvwrO2/view
- 06_StagingPipeline_Turnstile.js — https://drive.google.com/file/d/1g3rXFL8KbBd53ms9zBa_WJRXTKoaBJJV/view
- 07_TeacherDashboard.js — https://drive.google.com/file/d/1SPuo11fv887NwqkxUD6lUggo8HC1g4f1/view
- 08_TeacherConfirmationStep.js — https://drive.google.com/file/d/1pm_fSaJeU4oNZp3WBpbpl2xBQ0JpXPtN/view
- 09_StudentRevisionGuidance.js — https://drive.google.com/file/d/1TRfb90_MTlkE1wqj-1sRdhVCfb07l3yQ/view
- 10_AdminRecoveryPanel.js — https://drive.google.com/file/d/1o-eGkUq7cq5pdSWZpdvhwglLmAzmHRvI/view
- 11_StudentFriendlyRejections.js — https://drive.google.com/file/d/10vUf6RFmet7D7-gjBpB3jV-9UC2d-D_F/view
- 12_TeacherQuickStartGuide.html — https://drive.google.com/file/d/1_YtyzhcxO2maArD9MHGc9nqD1loBhrTq/view

**Review first** (not verified, found alongside the above, ambiguous):
- 10_TURNSTILE.txt — https://drive.google.com/file/d/16kyueLL0OHDwTLpBi857xFGdarJ4AI8a/view *(different date than the set above — open before deleting)*

---

## Other verified-duplicate individual files

**8. Pacing Guide (v1)** — one of two word-for-word identical docs, keep the other
https://docs.google.com/document/d/1gv6T7MDQY4EXmBnVECK_NwG0Qvn_9-eUb132CQWvgZg/edit
Verified identical in full to **Pacing Guide (v2)** — https://docs.google.com/document/d/1jOssIHw_CEyiEAEQsoSv6FHRBRQ1LfpW93esN1rh-tg/edit (**keep** that one, delete v1 above)

**9. Copy of 16_UnifiedManualSetup.js**
https://drive.google.com/file/d/1OAfw4NB1mL1wMvtj2KAGHshckPM4606a/view
Filename itself says "Copy of..." — leftover duplicate.

**10. 16 UnifiedManualSetup.pdf.pdf** (double file extension)
https://drive.google.com/file/d/19Nn0YPqQq7tN5UB1EayYyYMmsECMRByo/view
Stray re-export with a doubled extension — an artifact, not a distinct document.

**11. Copy of Room 107 Door.JPG** (duplicate #1)
https://drive.google.com/file/d/1yKJsw9_IJfwCr6WbEckxEDbSB3DVjUPD/view
Found during this pass — exact same file size (4,321,151 bytes) as the item below, both literally named "Copy of Room 107 Door.JPG," created 23 seconds apart.

**12. Copy of Room 107 Door.JPG** (duplicate #2)
https://drive.google.com/file/d/1D5Nl-EevvewZmkkqxmUeeOjkqz1TQ38x/view
Same as above — keep one, delete the other.

---

## Needs your review before deleting (not fully content-verified)

**13. files 19.zip** (inside the old CAS 6.30.26 folder)
https://drive.google.com/file/d/190BzBJApUzd7y6SW98iwrRJMfIWBclRY/view
Unlabeled zip, contents never opened. Check before deleting.

**14. Saved from Chrome** (folder)
https://drive.google.com/drive/folders/1YBepugyWAaEsWpO3o7NuaU8pYqs-5mX4
Contains one unlabeled scanned PDF. Open and confirm before deleting.

---

## Housekeeping from this session's tool troubleshooting

**15. Empty stray doc** — https://docs.google.com/document/d/1dy9yK_rhf8pwT2vCo7Ry1KLy-gJD_hfgqlsZew4ER4E/edit
Created before a tool outage interrupted the first manifest-writing attempt.

**16. Empty stray folder** — https://drive.google.com/drive/folders/1YtHmJQDxG_lkquRjCcEnASmiKDLGtIFg
Named "tool-check-empty-folder" — a diagnostic test, not real content.

**17. Empty stray doc** — https://docs.google.com/document/d/1n6lYWZ11Yep3Ibjv1JezC9RIg1kmOBqxhGTZS0YfJd0/edit
Named "empty-doc-test" — another diagnostic test while isolating the content-writing failure.

All three are empty and harmless, but genuinely stray — safe to delete along with everything else on this list.

---

## Not included here — handle separately

- **The IEP document and named-student brochure** at Drive root: intentionally left off this list. Please move/secure those yourself given their sensitivity.
- **Renaming** the two "Assignments" folders and "2627_pacingguide": simple renames, faster to do directly in Drive than via this list.
- **The Legacy Class Archive retention policy** (2020–2023 folders): a bigger decision, not a simple delete — see the Recommended Actions sheet in the catalog.

---

## Personal media — originals safe to delete from root (now copied to "Personal Media" folder)

Verified genuinely personal, copied into the new Personal Media folder. Once you confirm the copies look right, these 15 originals can be deleted from root:

- IMG_3954.JPG — https://drive.google.com/file/d/1Ksan3xEOIcyMUZUyKyYzU2eqdGu7aLJ4/view
- IMG_3956.MOV — https://drive.google.com/file/d/15djTyj0xw1Yna-8VkmwuNqcaA5E1Pn59/view
- IMG_3957.JPG — https://drive.google.com/file/d/1HzYNsLuY-ASl630RwFhB1fJP6UOZx8bT/view
- IMG_4069.JPG — https://drive.google.com/file/d/1CDUe9X5Vp_wnwVKVDmso6QRFdhGeYito/view
- IMG_4070.JPG — https://drive.google.com/file/d/10f7Pe21wHM0DxihNkCLrVhqLNuqhFkwA/view
- IMG_4071.JPG — https://drive.google.com/file/d/1srWevUpMs4KY20NZUT0yBApfWW_zc6uC/view
- IMG_4072.JPG — https://drive.google.com/file/d/128k7y9OBJLfpmKENGAr3tp_DAteg3it4/view
- IMG_4073.MOV — https://drive.google.com/file/d/1RyLX09v0xKsWLlgW_v_dl9uNzltBsHFa/view
- IMG_4074.MOV — https://drive.google.com/file/d/1O6lShO2BpQaV32tKPxMqNjQrJ7LHbO_p/view
- IMG_1872.jpeg — https://drive.google.com/file/d/1bg863u0x_hf_Q6JneizGiA5f9qgUkP9t/view
- IMG_4390.JPG — https://drive.google.com/file/d/1Bqzd0hcQkdc9MmamMuiGwTxKV7GLXX75/view
- IMG_4470.MOV — https://drive.google.com/file/d/1M74rb-2Vj_tctaWKRITOSkgrA9MR7tZ8/view
- IMG_5175.JPG — https://drive.google.com/file/d/1PCHumUswD0u-EtExFvfEt8ccOgCwhcoA/view
- IMG_5176.JPG — https://drive.google.com/file/d/1ZtfZQ_5y8_VFi2HndUbU6CYn1y2lXPcJ/view
- IMG_5177.JPG — https://drive.google.com/file/d/1t7m83YQhxyyWhhbztoqyN6w99mqoIjRK/view
- Bean recipe.JPG — https://drive.google.com/file/d/1gL5zNHhPr30yLBZBoUTSwi98qLMohpk3/view
- football-cleats-coloring-page-0.jpg — https://drive.google.com/file/d/1bmveER99xngSb57Td2BUq_EFIpYJJ8r_/view

## Corrections to the original "personal media" catalog — leave these in place, NOT personal

- IMG_1482.JPG, IMG_1483.JPG, IMG_1484.JPG, IMG_1485.JPG — scanned CCPS professional leave request forms
- IMG_0852.JPG, IMG_0853.JPG, IMG_0854.JPG (2025 versions) — DECA Advisor consent/rules forms
- IMG_0852.JPG, IMG_0853.JPG (2019 versions — different files, same filenames as above, a real collision) — a 2019 conference leave form
- "Copy of Room 107 Door.JPG" x2 — classroom door photo, not personal (still a real duplicate pair — see the duplicate-photos section above)
- license (1).JPG — VDOE teaching license verification screenshot
- Personal Brand.JPG — classroom "Personal Brand" whiteboard activity, ties to curriculum
- VAME Conference Issue.JPG — marketing-educators' conference screenshot
- Course Kit (1).JPG — Google Classroom gradebook screenshot. CONTAINS STUDENT NAMES — treat as sensitive-adjacent, not just "not personal"
- Cute Class Announcement Poster.jpg — basketball spirit-week schedule
- Silver Kitchen Restaurant Flyer.jpg — actually a "JOIN DECA!!!" recruitment flyer, misleading filename

## Still unverified — not moved, not confirmed either way

- Copy of IMG_1324-1327.HEIC (x4)
- IMG_0189-0192.HEIC (x4)
- IMG_7710.MOV, IMG_7711.MOV, IMG_7718.MOV, IMG_7725.MOV, IMG_7726.MOV
- Calder Adverb.MOV, IMG_4031.PNG, IMG_1520.jpg, IMG_3479.JPG, IMG_3364.MOV
- At least one more unpulled page of root-level results beyond what's been checked

---

## Second verification round — 9 more resolved

Verified by actually downloading and viewing (HEIC files) or OCR-checking (PNG/JPG). Copied to Personal Media where confirmed personal.

**Confirmed personal, copied — originals safe to delete once you check the copies:**
- Copy of IMG_1324.HEIC — https://drive.google.com/file/d/11bnuOIQ5Cv3BKgApFkqOARNan3kZ1iog/view
- Copy of IMG_1325.HEIC — https://drive.google.com/file/d/1-8BJff_xkau-CcRFRoMHwOKISQl7xHGd/view
- Copy of IMG_1326.HEIC — https://drive.google.com/file/d/1-EDahYc9NgrU88F6aVz02lZ0N7-lcoNL/view
- Copy of IMG_1327.HEIC — https://drive.google.com/file/d/1-H55RSDgMVj9G_NL83rdeHZFcR5_Cnuk/view
- IMG_0189.HEIC — https://drive.google.com/file/d/1AQk9H5VP-4dchsgg8VOmGAAnFjJ8Bh--/view
- IMG_0190.HEIC — https://drive.google.com/file/d/1-Y1saFyxtPTESAYUjhxlykgZyZHkOYMZ/view
- IMG_0191.HEIC — https://drive.google.com/file/d/1Y-lHSbkFyf5FOFsnZPai0BC9mihkRwUV/view
- IMG_0192.HEIC — https://drive.google.com/file/d/1cEd1HMRnCcRflZ8q6xnTTiDMGaNtfEnQ/view
- IMG_1520.jpg — https://drive.google.com/file/d/1M8mFd0dSNuOrNpPJoVedIifrvY0jLwtJ/view

**Confirmed NOT personal — leave in place:**
- IMG_4031.PNG — DECA meeting announcement flyer
- IMG_3479.JPG — 2021 VA DECA conference leave request form

**Genuinely unverifiable (video files, 85-259MB each — too large to download/decode through available tools):**
- IMG_7710.MOV, IMG_7711.MOV, IMG_7718.MOV, IMG_7725.MOV, IMG_7726.MOV (all same day, May 20 2023)
- Calder Adverb.MOV (cryptic name, could be a student project or personal — genuinely unknown)
- IMG_3364.MOV (2018)

This is the end of what's verifiable with available tools. The 7 videos above would need manual review — right-click and preview them directly in Drive.

---

## Professional Development folder created (item #6 complete)

New folder: https://drive.google.com/drive/folders/14jNEVleEz0X5RLVgxgk-QRA1QzG8o_2t
Contains a copy of the CHHS Google LTI PD training submission (originally sat inside the Legacy Class Archive, mixed in with real course-year folders — it's Adam's own PD activity, not student coursework).

**Original, now safe to delete from inside the Legacy Class Archive:**
CHHS Google LTI PD (folder) — https://drive.google.com/drive/folders/1YNBm12QrGsgzz_zHGy5Vsl552w3kUC57c5PWhfBLf4d9lm0lkq1fgeIoWEmdX8banxePAThu

---

## Rename executed via copy-with-new-title (item complete)

"2627_pacingguide" has been copied with a corrected title: **"2026-27 DECA and Operations Calendar"**
https://docs.google.com/document/d/183hWU_n4WwCl_x2cG4XuibHfxJe4K27m3aEX0lMfkhA/edit

**Original, now redundant — safe to delete:**
2627_pacingguide — https://docs.google.com/document/d/1-j75OJBDMfyJ80Ibs3czoKUQYmJqwt64myz51cY03tQ/edit

## Diagnostic test files from this session (safe to delete)

- write-test (inside Marketing Exploration / Unit 1 folder) — attempted before the workaround was found; check if it exists, delete if so
- write-test-plain.txt (inside Marketing Exploration / Unit 1 folder) — confirmed the working method, no longer needed
