# DELETION MANIFEST — Verified Duplicates and Deprecated Items

Nothing has been deleted. This is a checklist to review and delete directly in Google Drive — find each item by its name (Drive search, or the folder named with it), confirm it's what's described, delete.

*(2026-11-15: the Drive links this list carried were removed, because the repo keeps no Drive file IDs or links. Names, reasons and decisions are unchanged. Git history still holds the old links until the operator decides on a history rewrite.)*

*(Note: this had to be delivered as a downloadable file rather than a Google Doc inside your Drive — the Drive connector's content-writing feature is currently broken, confirmed by testing: creating empty folders/docs works, but writing text into a doc fails every time. Folder creation for the reorg below succeeded fine.)*

---

## Whole folders — safe to delete entirely

**1. V5.26** (Assignment System codebase duplicate)
Verified byte-identical to canonical Codebase (full content diff, 2 files checked, zero differences).

**2. V5.23** (Assignment System codebase duplicate)
Verified: differs from canonical by exactly one stale comment line. Functionally identical.

**3. Scripts v6.6** (inside Active_Brain_Trust_System — codebase duplicate)
Verified byte-identical to canonical Codebase.

**4. CAS Module 2 snapshot — 6.28.26**
Verified byte-identical (MD5 match) to the 6.30.19 snapshot. Keep 6.30.19, delete this one.
**KEEP — do not delete:** the 6.30.19 snapshot folder

**5. DESTINATION_FOLDER_ID**
Confirmed truly empty. Name matches a literal script placeholder variable — looks like a bug artifact.

---

## Loose files within a shared folder — delete these specific files, not the whole folder

**6. Tesseract Distribution Engine — loose files directly in this folder**
Delete the loose `.js`/`.html` files sitting directly here (verified earlier/incomplete codebase snapshot). **Do NOT delete the V5.28 subfolder** inside it — that one holds PDF reference exports, not duplicate code.

**7. CAS folder — loose files directly in this folder (NOT its 3 dated subfolders)**
The numbered scripts (00–21) and HTML files sitting loose at this folder's top level are verified byte-identical duplicates of canonical Codebase. The three dated subfolders inside (6.28.26, 6.30.19, 6.30.26) hold separate Module 2 content — leave those alone except item 4 above.

---

## Root-level loose files — 12 files, earliest prototype generation

Verified via full content diff: a structurally different, discarded early prototype (hardcoded placeholder IDs, different auth model) — not a partial snapshot, a fully superseded design.

- 01_StudentDoc_ContainerScript.js
- 02_Form1_IntakeAndWorkspaceGenerator.js
- 03_QueueBridge.js
- 04_Form2_TurnInGate.js
- 05_TeacherIntakePipeline.js
- 06_StagingPipeline_Turnstile.js
- 07_TeacherDashboard.js
- 08_TeacherConfirmationStep.js
- 09_StudentRevisionGuidance.js
- 10_AdminRecoveryPanel.js
- 11_StudentFriendlyRejections.js
- 12_TeacherQuickStartGuide.html

**Review first** (not verified, found alongside the above, ambiguous):
- 10_TURNSTILE.txt *(different date than the set above — open before deleting)*

---

## Other verified-duplicate individual files

**8. Pacing Guide (v1)** — one of two word-for-word identical docs, keep the other
Verified identical in full to **Pacing Guide (v2)** (**keep** that one, delete v1 above)

**9. Copy of 16_UnifiedManualSetup.js**
Filename itself says "Copy of..." — leftover duplicate.

**10. 16 UnifiedManualSetup.pdf.pdf** (double file extension)
Stray re-export with a doubled extension — an artifact, not a distinct document.

**11. Copy of Room 107 Door.JPG** (duplicate #1)
Found during this pass — exact same file size (4,321,151 bytes) as the item below, both literally named "Copy of Room 107 Door.JPG," created 23 seconds apart.

**12. Copy of Room 107 Door.JPG** (duplicate #2)
Same as above — keep one, delete the other.

---

## Needs your review before deleting (not fully content-verified)

**13. files 19.zip** (inside the old CAS 6.30.26 folder)
Unlabeled zip, contents never opened. Check before deleting.

**14. Saved from Chrome** (folder)
Contains one unlabeled scanned PDF. Open and confirm before deleting.

---

## Housekeeping from this session's tool troubleshooting

**15. Empty stray doc**
Created before a tool outage interrupted the first manifest-writing attempt.

**16. Empty stray folder**
Named "tool-check-empty-folder" — a diagnostic test, not real content.

**17. Empty stray doc**
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

- IMG_3954.JPG
- IMG_3956.MOV
- IMG_3957.JPG
- IMG_4069.JPG
- IMG_4070.JPG
- IMG_4071.JPG
- IMG_4072.JPG
- IMG_4073.MOV
- IMG_4074.MOV
- IMG_1872.jpeg
- IMG_4390.JPG
- IMG_4470.MOV
- IMG_5175.JPG
- IMG_5176.JPG
- IMG_5177.JPG
- Bean recipe.JPG
- football-cleats-coloring-page-0.jpg

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
- one .MOV titled with a first name (withheld), IMG_4031.PNG, IMG_1520.jpg, IMG_3479.JPG, IMG_3364.MOV
- At least one more unpulled page of root-level results beyond what's been checked

---

## Second verification round — 9 more resolved

Verified by actually downloading and viewing (HEIC files) or OCR-checking (PNG/JPG). Copied to Personal Media where confirmed personal.

**Confirmed personal, copied — originals safe to delete once you check the copies:**
- Copy of IMG_1324.HEIC
- Copy of IMG_1325.HEIC
- Copy of IMG_1326.HEIC
- Copy of IMG_1327.HEIC
- IMG_0189.HEIC
- IMG_0190.HEIC
- IMG_0191.HEIC
- IMG_0192.HEIC
- IMG_1520.jpg

**Confirmed NOT personal — leave in place:**
- IMG_4031.PNG — DECA meeting announcement flyer
- IMG_3479.JPG — 2021 VA DECA conference leave request form

**Genuinely unverifiable (video files, 85-259MB each — too large to download/decode through available tools):**
- IMG_7710.MOV, IMG_7711.MOV, IMG_7718.MOV, IMG_7725.MOV, IMG_7726.MOV (all same day, May 20 2023)
- one .MOV titled with a first name, withheld here (cryptic name, could be a student project or personal — genuinely unknown)
- IMG_3364.MOV (2018)

This is the end of what's verifiable with available tools. The 7 videos above would need manual review — right-click and preview them directly in Drive.

---

## Professional Development folder created (item #6 complete)

New folder: "Professional Development"
Contains a copy of the CHHS Google LTI PD training submission (originally sat inside the Legacy Class Archive, mixed in with real course-year folders — it's Adam's own PD activity, not student coursework).

**Original, now safe to delete from inside the Legacy Class Archive:**
CHHS Google LTI PD (folder)

---

## Rename executed via copy-with-new-title (item complete)

"2627_pacingguide" has been copied with a corrected title: **"2026-27 DECA and Operations Calendar"**

**Original, now redundant — safe to delete:**
2627_pacingguide

## Diagnostic test files from this session (safe to delete)

- write-test (inside Marketing Exploration / Unit 1 folder) — attempted before the workaround was found; check if it exists, delete if so
- write-test-plain.txt (inside Marketing Exploration / Unit 1 folder) — confirmed the working method, no longer needed
