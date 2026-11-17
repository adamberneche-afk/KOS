# ⚠️ This file is outdated

This deployment guide predates the current architecture and contains
incorrect instructions. Do not follow it.

**Use these documents instead:**

| Document | Purpose |
|---|---|
| `tools/clasp-sync/run.js` and `cas-ccps/DEPLOYMENT_HANDOFF.md` | The current deployment path. (`ADMIN_DEPLOYMENT_WALKTHROUGH.html` is retired; it now holds only the correct web-app settings and these pointers.) |
| `SYSTEM_ARCHITECTURE.html` | How all components connect |
| `STUDIO_FLOW_REFERENCE.html` | Studio Flow configuration |
| `REGISTRY_SHEET_SETUP.md` | Script Registry Sheet setup |
| `USER_EXPERIENCE_REFERENCE.html` | Role-by-role UX walkthroughs, document anatomy, folder structure, full pipeline (added — reconciliation decision 5; salvaged from the now-archived `DEPLOYMENT_AND_UX_GUIDE.html`) |

The current deployment pushes every project with clasp through
`tools/clasp-sync/run.js` (see `DEPLOYMENT_HANDOFF.md`). The AutoInstaller
(Script 21) is optional and its file lists are out of date
(`REGISTRY_SHEET_SETUP.md`).
