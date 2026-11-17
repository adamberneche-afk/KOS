# The other two systems

Split out of `cas-ccps/DEPLOYMENT_HANDOFF.md` on 2026-11-17; the handoff maps where everything is.

This file is cas-ccps's. A fresh deployment session covers three, and each
carries its own guide with its own sequence and its own status banner —
**read each system's own guide for its current state; the summaries below
are pointers, not the live record.** All three are on the **same
`ccpsnet.net` account** as cas-ccps — do not read a system boundary as an
account boundary, which is a mistake this repo made twice
(`FLOW_DOCTRINE.md` rule 3).

**leader-hub** — `leader-hub/DEPLOYMENT_GUIDE.md`. **Deployed and live as of
2026-09-05** — pushed, both Web App deployments made, all six AI Flows
(`EMAIL_COMPOSE`, `ARCHIVE_INSIGHTS`, `WBL_INSIGHTS`, `LP_ASSIST`,
`FIN_ANALYSIS`, `BRAG_EMAIL`) built and confirmed live via
`checkAiFlowFixtures()`. Its own `HISTORY.md` has the deployment record.
**Since then (2026-10-03): paused.** After the OAuth-consent-dialog crash
fix it works on `/dev`. `/exec` was released 2026-10-05 (v20) and still
needs its `?diag=probe` check; see `leader-hub/docs/oauth-crash-and-diagnostics.md`'s "Fixed — the
OAuth-consent-dialog crash". **Since 2026-10-22** (merged, not yet pushed as
of 2026-10-23) it keeps nothing in the browser and runs only as its web app;
the standalone file is retired (`archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md`).
Its queue rows are deleted the moment their outcome is read, which is why
liveness there is a durable counter rather than a row scan. Its D1 side —
the browser calling cas-ccps's `doPost()` — is diagnosed from the cas-ccps
end; see the paragraph above.

**kos-personal** — `kos-personal/DEPLOYMENT_GUIDE.md`. **Both Studio flows
were built and verified end to end on 2026-09-08 (the second attempt), but
the pipeline failed in use:** Sept 10-17 about 71% of Curator rows failed
on persona output (the steps called the RTP Gem; fixed in Studio Sept 29),
and the Classify Flow has not yet classified a real session. `archive/2026-27-Q1/kos-personal/HANDOFF_2026-09-28.md` is the current record; the
history below is how the flows got built.
The Curator flow's first Studio build attempt surfaced real problems (a
trigger condition not actually filtering on `Status`, and Gemini
fabricating output after a "Workspace sources is turned off" warning
instead of reading the real source document) and was deliberately paused
rather than patched around — see `kos-personal/CHANGELOG.md`'s Round 17
for that incident. Everything through Round 20 was Apps-Script-side rework
closing the gap it exposed: the live Docs-read step removed from both
flows entirely (`13_StudioInputBuilder.gs` reads the source document
itself, before Studio ever runs), a generated `FlowBuildSpec` tab
supplying every value to build from (`14_StudioFlowBuildSpec.gs`), a
preflight check (`15_Preflight.gs`) verifying structural soundness first,
and prompts moved onto a generated `FlowPrompts` chip tab
(`16_FlowPrompts.gs`) instead of hand-pasted blocks. Round 21 is the
second attempt itself: Socratic Onboarding completed (a real front-end bug
in the Arm Engine wizard fixed first — `8_WebApp_UI.html`'s
`_armCaptureStep()` was silently clobbering earlier steps' answers), both
flows built from `FlowBuildSpec`/`FlowPrompts`, and
`checkStudioFlowBinding()`/`checkStudioFlowLiveness()`/`checkStudioReturns()`
confirmed both genuinely wrote back — a real Auditor `PASSED` sign-off on
the Curator side, real per-sentence scores on the Classification side.
Round 22 is what verifying *past* the harvest — real data actually
reaching `SESSION_LOG`/`VECTOR_MATRIX`, not just `STUDIO_RETURN` — found
and fixed: a phantom-`VECTOR_MATRIX`-row bug (the Vector Router was called
unconditionally for every payload type, including Curator sessions with no
vector data of their own) and a shared-`File_ID` race
(`processInferenceQueue()` used to re-read a row's source doc directly,
which a *different* row sharing that same `File_ID` by design can
silently overwrite between harvest and processing — now reads the row's
own `STUDIO_RETURN` entry instead). Full account, with exact logs and
diagnosis, in `kos-personal/CHANGELOG.md` Rounds 21-22. Its consent-screen
phase configures the *default* project and does **not** create a standard
one — that distinction is what cost 2,113 lines here.
