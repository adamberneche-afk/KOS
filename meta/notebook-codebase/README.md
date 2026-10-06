# notebook-codebase/

The KOS repo as sources for a Gemini notebook ("KOS Codebase"): every
Apps Script file, page source, tool, test and doc, cut into 12 sources plus
an index, so the code can be asked about in plain language ("where does the
backfill read archived chunks?", "what writes CURRENT_STATE?").

**Generated locally, not committed.** Only this README is in the repo; the
`KOS_CODE_*.md` files are gitignored (8+ MB that went stale with every code
change). Build them with Node from the repo root (your `KOS-main` folder
after unzipping; no git needed):

```
node tools/notebook-codebase/build.js            # write the sources here
node tools/notebook-codebase/build.js --check    # list changed sources, change nothing
```

Never edit the generated files; rebuild them.

## How the sources are cut

| Source | Covers |
|---|---|
| `KOS_CODE_00_INDEX` | What the notebook holds, every source's file list, word count and fingerprint, and what is left out |
| `KOS_CODE_KOS_PERSONAL_SOURCE` / `_DOCS` | kos-personal code; its docs, prompts, the RTP router and the notebook plan |
| `KOS_CODE_CAS_CCPS_SOURCE_A` / `_B` | cas-ccps scripts 00–29; scripts 30 and up, Studio steps, forms, templates |
| `KOS_CODE_CAS_CCPS_DOCS` / `_CURRICULUM` | cas-ccps docs (HTML guides converted to text); unit rubrics and lesson cards |
| `KOS_CODE_LEADER_HUB_SOURCE` / `_DOCS` | leader-hub `.gs` files and `src/` page parts; its docs |
| `KOS_CODE_TOOLS`, `KOS_CODE_TESTS`, `KOS_CODE_META` | repo tools and CI; tests and the GAS sandbox; repo-wide docs and Drive curation |
| `KOS_CODE_HISTORY` | the three change logs, marked as possibly superseded |

- **Attributable sections.** Every file is its own section whose heading
  names the source and the path, so a cited passage says which file it is.
- **The source line.** Each source carries `Notebook source: {NAME}.`, since
  notebook retrieval matches text, not titles.
- **Size.** Every source stays well under the 500,000-word per-source cap;
  the build warns above 200,000.
- **Left out:**
  - archives;
  - the built `leader-hub/student-leader-hub.html`;
  - JSON, CSV and Office files;
  - lockfiles;
  - the persona docs, which belong to the RTP notebook.

  The repo holds no student data (`cas-ccps/docs/FERPA_DATA_MAP.md`).

## Loading them

1. Create a **separate** notebook named "KOS Codebase" on notebook.google.com
   with the school account. Don't add these to the RTP notebook: answers get
   vaguer as sources pile up, and the RTP Gem's sources should stay the 17
   briefing, persona and protocol docs.
2. Build, then upload the 13 `KOS_CODE_*.md` files in this folder.
3. Optionally paste these instructions into the notebook's settings:

   ```
   You answer questions about the KOS repository from these sources only.
   Cite the file path for every claim (each section heading gives it).
   Source code is the authority; where a doc or KOS_CODE_HISTORY disagrees
   with the code, say so and follow the code. If the sources don't answer
   the question, say that; don't guess at code you can't see.
   Never write or change anything; this notebook is read-only reference.
   ```

## Keeping it current

Each source carries a content fingerprint, listed in `KOS_CODE_00_INDEX`.

To refresh after downloading a newer zip of `main`:
1. Copy your last build's `KOS_CODE_*.md` files into the new folder, or
   compare fingerprints with the INDEX in the notebook.
2. Run `--check` to see which sources changed, then build.
3. In the notebook, replace only the sources whose fingerprints changed.
