# LeaderHub — Drive Lesson Plan Work
## Complete Step-by-Step Instructions

**Last updated:** April 20, 2026  
**DSP end:** May 15, 2026 (stale — the main app removed all DSP framework
content; see `../README.md`'s "DSP framework content — removed" section.
This date is left here only because it doesn't affect what these
Drive-doc-renaming scripts actually do — none of them reference DSP.)  
**Files in this package:**
- `LH_DriveDocSplitter.gs` — splits compilation docs + creates 6115 Q1 stubs
- `LH_8177_Rename.gs` — renames 28 existing 8177 individual docs
- `LH_AppManifestUpdater.py` — patches docId values in the app HTML
- This README

---

## Overview: What Needs Doing and Why

The app's `LESSON_PLANS` array has a `docId` field for each lesson. That `docId` is what powers the "Open in Drive" link in the Lessons view. Right now, the docIds for 63 lessons are wrong — they point to compilation docs (multiple lessons in one file) instead of individual files.

**The goal:** Every lesson has its own individual Drive doc, named per naming convention, with the correct docId in the app.

### Current state of each course:

| Course | Status | Action needed |
|--------|--------|---------------|
| 8177 all | ✅ 28 individual docs exist | Rename to naming convention format |
| 8175 all | ❌ 36 lessons in one compilation doc | Split into 36 individual docs |
| 6115 Q2 | ❌ 16 lessons in one compilation doc | Split into 16 individual docs |
| 6115 Q3 | ❌ 15 lessons in one compilation doc | Split into 15 individual docs |
| 6115 Q4 | ❌ 12 lessons in one compilation doc | Split into 12 individual docs |
| 6115 Q1 | ❌ Placeholder doc ID (not real) | Create 10 blank stub docs |

**Totals:** 73 new docs to create/split + 28 existing docs to rename.

---

## Part 1: Split Compilation Docs + Create 6115 Q1 Stubs

### Before you start

1. Decide where your individual lesson plan docs will live in Drive. Create a folder if you don't have one (e.g., "LeaderHub Lesson Plans").
2. Get the folder ID: open the folder in Drive, copy the ID from the URL. The URL looks like `drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt` — the ID is `1AbCdEfGhIjKlMnOpQrSt`.

### Steps

**Step 1 — Open Google Apps Script**

Go to [script.google.com](https://script.google.com) → click **New project** → name it "LeaderHub Drive Splitter".

**Step 2 — Paste the script**

Delete any existing code in the editor, then paste the entire contents of `LH_DriveDocSplitter.gs`.

**Step 3 — Set TARGET_FOLDER_ID**

Near the top of the script, change:
```javascript
const TARGET_FOLDER_ID = 'YOUR_FOLDER_ID_HERE';
```
to your actual folder ID:
```javascript
const TARGET_FOLDER_ID = '1AbCdEfGhIjKlMnOpQrSt'; // ← your folder ID
```

Keep `DRY_RUN = true` for now.

**Step 4 — Check doc access**

In the function dropdown (top of editor), select `checkDocAccess` → click **Run**. This verifies you can open all 4 compilation docs. Authorize when prompted. The log should show 4 green checkmarks.

If any doc shows an error, you may not have access to that specific Google Doc. Open it directly in Drive to confirm you can view it.

**Step 5 — Preview**

Select `previewAllSplits` → click **Run**. Read the log carefully:
- For each compilation doc, it should show the number of lesson boundaries detected
- It should match the expected count: 6115_Q2=16, 6115_Q3=15, 6115_Q4=12, 8175_ALL=36
- If any lessons show as MISSING, the heading in that doc doesn't exactly match the expected title. See [Troubleshooting](#troubleshooting) below.

**Step 6 — Run for real**

Once the preview looks correct:
1. Change `const DRY_RUN = true` to `const DRY_RUN = false`
2. Select `runAll` → click **Run**
3. This creates up to 73 new files and logs a manifest JSON

> ⚠️ This can take several minutes. Don't close the browser tab while it runs.

**Step 7 — Copy the manifest JSON**

In the Executions panel → click on the completed run → scroll to the bottom of the log. You'll see a block that starts with `{` and ends with `}`. Copy that entire block.

**Step 8 — Save as manifest.json**

Create a file called `manifest.json` in the same folder as `student-leader-hub.html`. Paste the JSON block you copied. It should look like:
```json
{
  "lp_6115_11": "1AbCdEfGhIj...",
  "lp_6115_12": "1KlMnOpQrSt...",
  ...
}
```

---

## Part 2: Rename 8177 Individual Docs

Do this after Part 1, or separately — it's independent.

**Step 1 — Open a new Apps Script project**

Go to [script.google.com](https://script.google.com) → **New project** → name it "LeaderHub 8177 Rename".

**Step 2 — Paste the script**

Paste the entire contents of `LH_8177_Rename.gs`.

**Step 3 (Optional) — Set SEARCH_FOLDER_ID**

If your 8177 docs are in a specific folder, set `SEARCH_FOLDER_ID` to that folder's ID. This makes the search faster and avoids false matches. Leave as `''` to search all of My Drive.

**Step 4 — Run listDocsInFolder**

Select `listDocsInFolder` → click **Run**. This shows all Google Docs in your search scope. Verify your 8177 docs appear in the list.

**Step 5 — Preview renames**

Select `previewRenames` → click **Run** with `DRY_RUN = true`. The log shows:
- `✅ RENAME: "old name" → "new name"` — will be renamed
- `✓  ALREADY CORRECT` — already in naming convention format, no action needed
- `❌ NOT FOUND` — no doc found with that lesson title in its name
- `⚠️  AMBIGUOUS` — multiple docs match; you need to resolve duplicates first

**Step 6 — Resolve any issues**

- **NOT FOUND:** The doc might have a slightly different name. Use `listDocsInFolder()` to find it, then manually rename it to match the lesson title exactly, then re-run preview.
- **AMBIGUOUS:** Delete or move duplicate docs before proceeding.

**Step 7 — Execute**

Once preview is clean:
1. Change `DRY_RUN = false`
2. Select `executeRenames` → click **Run**

> **Note:** Renaming docs does NOT change their file IDs. The docId values in the app remain valid — you do NOT need to run LH_AppManifestUpdater.py after renames. Only the display name changes.

---

## Part 3: Patch the App with New Doc IDs

Do this after Part 1 is complete and you have `manifest.json`.

**Prerequisites:**
- Python 3 installed (check: `python3 --version`)
- Node.js installed (check: `node --version`) — needed for syntax check
- `student-leader-hub.html` in the same directory as `LH_AppManifestUpdater.py`
- `manifest.json` in the same directory

**Step 1 — Dry run first**

```bash
python3 LH_AppManifestUpdater.py --dry-run
```

This shows every docId that would be changed without modifying the file. Verify the changes look correct.

**Step 2 — Apply changes**

```bash
python3 LH_AppManifestUpdater.py
```

The script:
1. Creates a timestamped backup (`hub-backup-YYYYMMDD_HHMMSS.html`)
2. Patches all docId values from the manifest
3. Runs Node.js syntax check on the modified JS
4. If syntax check passes, writes the updated HTML
5. Prints a summary of all changes

**Step 3 — Run the Principles Scorecard**

After patching, open the updated `student-leader-hub.html` in a browser and verify the app loads correctly. Then run the Principles Scorecard from `LEADERHUB_HANDOFF.md` to confirm all 22+ checks pass.

---

## Troubleshooting

### "MISSING: X lessons not found in doc"

The heading text in the compilation doc doesn't exactly match the expected title. Steps:
1. Open the compilation doc directly in Google Drive
2. Find the section you expect (it'll have a heading paragraph)
3. Compare the exact text to the title in the `COMPILATION_DOCS` manifest in the script
4. Update the `title` field in the script to match the doc exactly, OR edit the doc heading to match the expected title
5. Re-run `previewAllSplits()`

### "Cannot open doc: Exception..."

You don't have access to that compilation doc. Open it directly via the doc ID:
```
https://docs.google.com/document/d/[DOC_ID]/edit
```
If it prompts for access, request it from whoever owns it (likely yourself — check if you're logged into the right Google account in Apps Script).

### "Target folder (...): Exception..."

The folder ID is wrong or you don't have write access. Verify:
1. Open the folder in Drive
2. Copy the ID from the URL exactly
3. Make sure you're logged into the same Google account in both Drive and Apps Script

### Manifest JSON has DRY_RUN_ values

You ran `runAll()` while `DRY_RUN = true`. Set `DRY_RUN = false` and re-run.

### The Python updater says "Not found in HTML"

The lesson ID in the manifest doesn't match the `id` field in `LESSON_PLANS`. Possible causes:
- The lesson IDs in the manifest (`lp_6115_11`, etc.) were guessed from a pattern — they may not exactly match the app's actual IDs
- Open `student-leader-hub.html` in a text editor, search for `lp_6115_11` (or whatever ID is missing), and verify it exists
- If the IDs don't match, manually update the manifest JSON to use the correct IDs from the app

---

## Type Reference

All lesson plan docs use these TYPE codes in their names:

| TYPE | Used when |
|------|-----------|
| `TEACH` | Instruction-only day; no student submission |
| `DUE` | Lesson has a student product to submit |
| `ASSESS` | Lesson is a quiz, test, or scored evaluation |
| `PRESENT` | Lesson involves a live oral presentation |

The TYPE in the Drive doc name reflects the primary Canvas assignment type for that lesson. Pure instruction days with no Canvas submission use `TEACH`.

---

## Lesson ID Assumptions

The lesson IDs in the script (`lp_6115_11`, `lp_8175_01`, etc.) follow an inferred pattern based on the known Q4 IDs from the app (`lp_6115_42`–`lp_6115_53`, `lp_8177_26`–`lp_8177_29`). **Verify these against the actual `LESSON_PLANS` array in `student-leader-hub.html` before applying the manifest patch.** If any IDs don't match, update the manifest JSON by hand before running `LH_AppManifestUpdater.py`.

To find all lesson IDs in the app:
```bash
grep -o "id:'lp_[^']*'" student-leader-hub.html | sort
```

---

*LeaderHub Drive Work — April 2026*
