#!/usr/bin/env python3
"""
LeaderHub — App Manifest Updater
=================================
Patches the LESSON_PLANS docId values in student-leader-hub.html
using the manifest JSON produced by LH_DriveDocSplitter.gs.

USAGE:
    python3 LH_AppManifestUpdater.py

REQUIREMENTS:
    - student-leader-hub.html must be in the same directory as this script
    - manifest.json must be in the same directory (copy from the Apps Script log)

HOW TO GET THE MANIFEST:
    1. Run runAll() in LH_DriveDocSplitter.gs (with DRY_RUN=false)
    2. Open the script's Executions → Logs
    3. Find the "MANIFEST JSON" block at the bottom of the log
    4. Copy the JSON object (starting with { and ending with })
    5. Save it as manifest.json in the same directory as this script

WHAT IT DOES:
    - Reads the manifest: { "lp_6115_11": "1AbCd...", "lp_6115_12": "1EfGh...", ... }
    - For each lesson ID, finds the corresponding LESSON_PLANS entry in the HTML
    - Replaces the docId value with the new one from the manifest
    - Writes the patched file as student-leader-hub.html (overwrites in place)
    - Prints a detailed diff of every change made
    - Does NOT change anything except docId fields

SAFETY:
    - Creates a timestamped backup before making any changes
    - Runs a Node.js syntax check on the JS after patching
    - Prints a summary of changed / unchanged / not-found entries
    - Use --dry-run flag to preview changes without writing the file

EXAMPLE:
    python3 LH_AppManifestUpdater.py              # patch in place
    python3 LH_AppManifestUpdater.py --dry-run    # preview only
"""

import re
import json
import sys
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

# ============================================================
# Configuration
# ============================================================

HTML_FILE    = Path('student-leader-hub.html')
MANIFEST_FILE = Path('manifest.json')
DRY_RUN      = '--dry-run' in sys.argv

# ============================================================
# Main
# ============================================================

def main():
    print('LeaderHub App Manifest Updater')
    print('DRY_RUN:', DRY_RUN)
    print()

    # ── Load files ──────────────────────────────────────────
    if not HTML_FILE.exists():
        print(f'❌  {HTML_FILE} not found.')
        print('   Place student-leader-hub.html in the same directory as this script.')
        sys.exit(1)

    if not MANIFEST_FILE.exists():
        print(f'❌  {MANIFEST_FILE} not found.')
        print('   Copy the manifest JSON from the Apps Script log and save as manifest.json.')
        sys.exit(1)

    content = HTML_FILE.read_text(encoding='utf-8')
    with open(MANIFEST_FILE) as f:
        manifest = json.load(f)

    print(f'HTML file:   {HTML_FILE} ({len(content):,} chars)')
    print(f'Manifest:    {len(manifest)} lesson IDs')
    print()

    # ── Validate manifest (skip DRY_RUN entries) ─────────────
    real_entries = {k: v for k, v in manifest.items() if not v.startswith('DRY_RUN_')}
    dry_entries  = {k: v for k, v in manifest.items() if     v.startswith('DRY_RUN_')}

    if dry_entries:
        print(f'⚠️   {len(dry_entries)} manifest entries are DRY_RUN placeholders — skipping those.')
        print()

    if not real_entries:
        print('❌  All manifest entries are DRY_RUN placeholders.')
        print('   Run LH_DriveDocSplitter.gs with DRY_RUN=false to get real doc IDs.')
        sys.exit(1)

    # ── Extract JS from HTML ──────────────────────────────────
    lines = content.split('\n')
    script_opens  = [i for i, l in enumerate(lines) if l.strip() == '<script>']
    script_closes = [i for i, l in enumerate(lines) if l.strip() == '</script>']

    if len(script_opens) < 2:
        print('❌  Could not find second <script> block in HTML.')
        print('   Make sure this is the correct student-leader-hub.html.')
        sys.exit(1)

    js_start = script_opens[1] + 1
    js_end   = script_closes[1]
    js       = '\n'.join(lines[js_start:js_end])

    print(f'JS extracted: lines {js_start}–{js_end} ({len(js):,} chars)')
    print()

    # ── Patch each lesson ID ──────────────────────────────────
    changed = []
    unchanged = []
    not_found = []

    new_js = js
    for lesson_id, new_doc_id in sorted(real_entries.items()):
        # Pattern: find the LESSON_PLANS entry block for this lesson ID
        # We look for the id field followed (within ~500 chars) by a docId field
        # Pattern:  id:'lp_6115_11'  ...  docId:'OLD_VALUE'
        #       or  id: 'lp_6115_11' ...  docId: 'OLD_VALUE'
        
        # First: find where this lesson_id appears
        id_pattern = re.compile(
            r"(id\s*:\s*['\"]" + re.escape(lesson_id) + r"['\"])"
        )
        id_match = id_pattern.search(new_js)

        if not id_match:
            not_found.append(lesson_id)
            continue

        # From that position, find the docId field within the same object
        # Objects can be hundreds of chars; search up to 2000 chars forward
        search_start = id_match.start()
        search_end   = min(search_start + 2000, len(new_js))
        snippet      = new_js[search_start:search_end]

        doc_id_pattern = re.compile(
            r"(docId\s*:\s*['\"])([^'\"]+)(['\"])"
        )
        doc_match = doc_id_pattern.search(snippet)

        if not doc_match:
            # Try backward search (docId might come before id in the object)
            search_back  = max(0, search_start - 2000)
            back_snippet = new_js[search_back:search_start]
            doc_match_b  = doc_id_pattern.search(back_snippet)
            if not doc_match_b:
                not_found.append(lesson_id)
                continue
            # Use the backward match — it's the nearest docId before the id field
            old_doc_id = doc_match_b.group(2)
            if old_doc_id == new_doc_id:
                unchanged.append((lesson_id, old_doc_id))
                continue
            # Replace this specific occurrence in the backward region
            old_full   = doc_match_b.group(0)
            new_full   = doc_match_b.group(1) + new_doc_id + doc_match_b.group(3)
            replace_at = search_back + doc_match_b.start()
            new_js     = new_js[:replace_at] + new_full + new_js[replace_at + len(old_full):]
            changed.append((lesson_id, old_doc_id, new_doc_id))
            continue

        old_doc_id = doc_match.group(2)

        if old_doc_id == new_doc_id:
            unchanged.append((lesson_id, old_doc_id))
            continue

        # Replace this specific occurrence
        old_full   = doc_match.group(0)
        new_full   = doc_match.group(1) + new_doc_id + doc_match.group(3)
        replace_at = search_start + doc_match.start()
        new_js     = new_js[:replace_at] + new_full + new_js[replace_at + len(old_full):]

        changed.append((lesson_id, old_doc_id, new_doc_id))

    # ── Report ───────────────────────────────────────────────
    print('── Changes ──────────────────────────────────────────────')
    for lesson_id, old_id, new_id in changed:
        print(f'  {lesson_id}')
        print(f'    old: {old_id}')
        print(f'    new: {new_id}')

    if unchanged:
        print()
        print(f'── Already correct ({len(unchanged)}) ────────────────────────────')
        for lesson_id, doc_id in unchanged:
            print(f'  {lesson_id} — {doc_id}')

    if not_found:
        print()
        print(f'── Not found in HTML ({len(not_found)}) ──────────────────────────')
        for lesson_id in not_found:
            print(f'  ⚠️  {lesson_id} — no LESSON_PLANS entry found')
            print(f'     Check that the id field "{lesson_id}" exists in LESSON_PLANS.')

    print()
    print(f'Changed:    {len(changed)}')
    print(f'Unchanged:  {len(unchanged)}')
    print(f'Not found:  {len(not_found)}')
    print()

    if not changed:
        print('No changes to apply.')
        return

    if DRY_RUN:
        print('DRY_RUN — no files written.')
        return

    # ── Syntax check patched JS ───────────────────────────────
    tmp_js = Path('/tmp/lh_patched_check.js')
    tmp_js.write_text(new_js, encoding='utf-8')
    result = subprocess.run(
        ['node', '--check', str(tmp_js)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print('❌  Syntax check FAILED after patching:')
        print(result.stderr[:500])
        print()
        print('No changes written. Fix the issue and try again.')
        sys.exit(1)

    print('✅  Syntax check passed.')
    print()

    # ── Backup original ───────────────────────────────────────
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup    = HTML_FILE.with_name(f'hub-backup-{timestamp}.html')
    shutil.copy2(HTML_FILE, backup)
    print(f'✅  Backup written: {backup}')

    # ── Reassemble and write HTML ─────────────────────────────
    new_lines = lines[:js_start] + new_js.split('\n') + lines[js_end:]
    new_content = '\n'.join(new_lines)

    HTML_FILE.write_text(new_content, encoding='utf-8')
    print(f'✅  Patched HTML written: {HTML_FILE} ({len(new_content):,} chars)')
    print()
    print('Done. Run the Principles Scorecard to verify app integrity.')


if __name__ == '__main__':
    main()
