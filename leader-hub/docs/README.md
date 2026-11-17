# LeaderHub feature docs

One doc per feature, split out of `leader-hub/README.md` on 2026-11-17. The [README](../README.md) is the map: what LeaderHub is, its layout, where the data lives, and how it deploys. Read only the doc you need.

- [`status.md`](status.md): Status.
- [`oauth-crash-and-diagnostics.md`](oauth-crash-and-diagnostics.md): The OAuth-consent-dialog crash, and diagnosing without DevTools. Sections: Fixed — the OAuth-consent-dialog crash (2026-09-28); Diagnosing a broken page without DevTools.
- [`ai-drafting.md`](ai-drafting.md): AI drafting — bifurcated GAS + Workspace Flow backend.
- [`settings.md`](settings.md): Settings. Sections: Settings → My Profile & School; Settings → School Calendar & Bell Schedule; Settings → Modules; Settings → Clear Sample Data; Settings → Course Catalog (customizable course data).
- [`dsp-framework-content-removed.md`](dsp-framework-content-removed.md): DSP framework content — removed.
- [`organizations.md`](organizations.md): Organizations. Sections: Settings → Organizations (DECA generalized to any club/CTSO); Settings → Organizations — Co-advisor sharing (EE2); FF1 — the long tail of hardcoded "DECA" references, closed out.
- [`pacing-and-calendar-import.md`](pacing-and-calendar-import.md): Pacing guide and county calendar import (GG1, HH1, II1). Sections: GG1 — Weekly Schedule auto-populated from the real pacing guide + a CCPS/VDOE lesson template; HH1 — Import a county calendar document into School Calendar settings; II1 — 6115's pacing-guide import: a filled-in template now actually reaches the calendar.
- [`cas-ccps-integration.md`](cas-ccps-integration.md): cas-ccps↔leader-hub integration (D1 + Addendum 26).
- [`hardcoded-credentials-cleanup.md`](hardcoded-credentials-cleanup.md): Hardcoded-credentials cleanup (external product review, Finding 9).
- [`src-split.md`](src-split.md): `student-leader-hub.html` split into `src/` (external product review, Finding 4).
- [`jj1-server-deployed-web-app.md`](jj1-server-deployed-web-app.md): JJ1 — Server-deployed web app: leader-hub becomes a real Apps Script deployment.
- [`deploy-drift-self-report.md`](deploy-drift-self-report.md): Deploy-drift self-report (process-hardening sprint Phase 3a).
