# notebook-context/

Sources for a Gemini notebook ("KOS Context") about why KOS exists: what
each system is for, the thesis under them, the value proposition and how
the systems measure up to it, how they are built, and where the work is
going. Its companion, `meta/notebook-codebase/`, holds the code.

**Generated locally, not committed.** Only this README and `GUIDE.md` are
in the repo; the `KOS_CONTEXT_*.md` files are gitignored. Build them from
the repo root (no git needed, so the unzipped copy of main works):

```
node tools/notebook-context/build.js            # write the sources here
node tools/notebook-context/build.js --check    # list changed sources, change nothing
```

Upload all six. If they go into the same notebook as the codebase sources,
answers may come back twice: the codebase notebook holds the same
documents.

## The sources

| Source | Holds |
|---|---|
| `KOS_CONTEXT_00_GUIDE` | `GUIDE.md`: what KOS is, each system's North Star, the value proposition by audience (with the claims not yet measured marked), where things stand, which sources are dated, and a glossary |
| `KOS_CONTEXT_NORTH_STAR` | The KOS white paper; CAS's platform plan and its Contextual Gates principles; LeaderHub's guiding principles |
| `KOS_CONTEXT_FOUNDATIONS` | The Economics of Depth white paper and its assumptions audit |
| `KOS_CONTEXT_VALUE` | The North Star and value review, the impact dashboard, the research-alignment PRD, the product experience and UX audits |
| `KOS_CONTEXT_SYSTEMS` | The repo README, the three systems' READMEs, CAS's system architecture, the Flow Doctrine |
| `KOS_CONTEXT_DIRECTION` | The October plan, the current handoff, the backlog, CAS's design threads, cognitive exhaust, and the course builder and lesson authoring plans |

The file list is `SOURCES` in `tools/notebook-context/build.js`, chosen by
hand. A missing file stops the build.

## Keeping it current

- **Edit `GUIDE.md` here**, never the generated `KOS_CONTEXT_00_GUIDE.md`.
  Change its "Where the promise and the system stand" section when a
  system's state changes, and its "Which sources are current and which are
  dated" table when a listed doc changes status.
- **When a new handoff replaces `HANDOFF_2026-10-22.md`**, or a plan or
  audit is superseded, change `SOURCES` and the guide together.
  `tests/tools/notebook-context.test.js` fails if the guide doesn't name
  every source, or cites a file that doesn't exist.
- **Rebuild and re-upload** after either, or when a listed doc changes.
