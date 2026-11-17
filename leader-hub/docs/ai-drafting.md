# AI drafting — bifurcated GAS + Workspace Flow backend

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

The app's original design called for direct browser→Gemini calls with a
user-supplied API key — never obtainable, so every "AI"-branded feature
(`aiComposeEmail`, `generateAIInsights`, `wblAIInsights`, `lpRunAI`,
`generateBragEmail`) shipped as deterministic local logic instead, with no
model call anywhere (see the "Removed: Gemini AI infrastructure" comment
in `student-leader-hub.html`).

**Real AI drafting is now built for all five** — Brag Board's "✨
Generate" (`BRAG_EMAIL`), the Trip Archive's "✨ Generate Insights from
Archive" narrative (`ARCHIVE_INSIGHTS`), the WBL Program Summary's "✨
Generate AI Summary" (`WBL_INSIGHTS`), the Lesson Plan Helper's
quick-prompt buttons and custom-question box (`LP_ASSIST`), and the
Email Composer's "✨ Generate with AI" button (`EMAIL_COMPOSE`) — using
the same **Bifurcation Boundary** architecture kos-personal/cas-ccps
already use for their own AI integrations: GAS does 100% of the
deterministic work (assembling the payload, queuing a job, polling for
the result, cleaning up old rows), and a separate **Google Workspace
Flow** — a no-code automation built in the Workspace UI, using its own
"Gemini — Generate content" connector — does 100% of the actual
generation. That connector runs on the Workspace account's own built-in
Gemini access, not a developer API key, which is exactly what solves the
original "can't get an API" blocker. The job queue is generic to job
`type`, so none of `ARCHIVE_INSIGHTS`/`WBL_INSIGHTS`/`LP_ASSIST`/
`EMAIL_COMPOSE` needed any change to `EmailBridge.gs` — only a new
client-side payload and another Flow watching the same sheet, each time.

For Archive Insights and WBL Program Summary specifically, the split
follows the Bifurcation Boundary the other direction too: each feature's
stats grid (trip counts/cost/type breakdown; student counts/hours/SBE
progress) is pure arithmetic, computed locally, always — too
correctness-critical to ever hand to a model — and only the qualitative
half (a short narrative surfacing real patterns across free-text content:
trip glows/grows, or WBL attention reasons and SBE checklist notes)
optionally routes through the Flow, additively, below the always-present
stats. Lesson Plan Helper, Brag Board, and Email Composer have no such
arithmetic half — their whole point is a real written answer to a
prompt — so they follow a simpler shape: the Flow's output *is* the
result shown (or the existing deterministic fallback, on any failure).

**What's new:**
- `EmailBridge.gs` gained two actions — `aiDraft` (queues a job into a
  lazily-created "LeaderHub AI Queue" spreadsheet) and `checkAiJob` (polls
  for and returns a completed result, sweeping stale rows on every call so
  an unbuilt or broken Flow can't leak rows forever).
- `student-leader-hub.html`'s `_generateBragEmailInner()`,
  `generateAIInsights()`, `_wblGenerateNarrative()`, `lpRunAI()`, and
  `aiComposeEmail()` all try the AI path first (through `callGAS()`, which
  in the web app always reaches the server; it originally needed an Apps
  Script bridge URL pasted into Settings, a setting removed 2026-10-22),
  polling for up to ~90 seconds via a shared
  `pollAiJob_()` helper, and **always fall back to the existing
  deterministic result** on any failure, timeout, or when the server
  can't be reached — all five are purely additive; each keeps working
  exactly as it always has if its Flow is never built. `lpRunAI()` and
  `aiComposeEmail()` additionally guard against a slower, stale request's
  result overwriting a newer request's (a monotonic request-id check
  each), since both have multiple ways to fire overlapping requests
  (8 quick-prompt buttons plus a custom-question input for the former; a
  re-clickable "Generate with AI" button with no disabled state for the
  latter, before this change).
- `leader-hub/appsscript.json` gained the `spreadsheets` OAuth scope
  (caught by `tools/gas-lint/check.js` before it could become a silent
  runtime authorization failure).
- Six docs: `LEADERHUB_AI_FLOW_SETUP.md` (the full handshake spec — sheet
  schema, one-Flow-per-job-type trigger/connector configuration, all five
  payload shapes — same convention as
  `kos-personal/STUDIO_INTEGRATION_SPEC.md`), `BRAG_EMAIL_FLOW_PROMPT.md`,
  `ARCHIVE_INSIGHTS_FLOW_PROMPT.md`, `WBL_INSIGHTS_FLOW_PROMPT.md`,
  `LP_ASSIST_FLOW_PROMPT.md`, and `EMAIL_COMPOSE_FLOW_PROMPT.md` (the
  exact system prompts to paste into each Flow's Gemini step).
- **Found and fixed while wiring up `WBL_INSIGHTS`:** `wblAIInsights()`'s
  stat tile and per-student badge checked
  `wblStudentStatus(s)==='at-risk'`, a status string that function never
  actually returns (it returns `'not-started'`, `'needs-attention'`, or
  `'on-track'`) — so the "At Risk" tile always read 0 and every
  non-on-track student showed a ❌ regardless of which real status
  applied. Fixed to match the real status values and to build a specific
  reason per flagged student (`_wblAttentionReason()`: missing agreement,
  hours short of the 30 required, no reflections logged) instead of just
  a pass/fail badge.
- **Found and fixed while wiring up `EMAIL_COMPOSE`:** `aiComposeEmail()`
  wrote its result to `document.getElementById('email-output')`, an
  element that doesn't exist anywhere in this file — the real compose
  textarea is `#email-body`. `out` was therefore always `null` and the
  function returned immediately, every time — clicking "✨ Generate with
  AI" (and `generateRegEmail()`'s programmatic call into the same
  function) silently did nothing at all, since before this feature
  existed. Fixed the id, so the deterministic fallback template is now
  actually reachable regardless of whether AI drafting is ever
  configured.

> **Status (D16, 2026-11-01): unverified since 2026-09-05.** The six AI
> drafting Flows were built and verified live that day (`HISTORY.md`), but
> nothing since shows one completing, and the app falls back to its
> templates without saying so. Run `installAiFlowFixtures()` first (it
> plants the six test rows; `checkAiFlowFixtures()` alone finds none, as
> it did on 2026-11-01), wait a few minutes, then `checkAiFlowFixtures()`:
> if the fixtures move off `PENDING`, they're live; if not, mark them
> parked here. `removeAiFlowFixtures()` clears them.

**What this didn't include at the time** (since done: all six Flows went
live 2026-09-05, see `DEPLOYMENT_GUIDE.md`): none of the five Workspace Flows were
built — building a no-code Flow happens in the live Google Workspace UI,
not a file this repo can contain, same limitation kos-personal/cas-ccps's
own unbuilt Studio flows already live with. `LEADERHUB_AI_FLOW_SETUP.md`
is the complete spec to build all five against. No "AI"-branded feature
remains deterministic-only now.

**Names by default, with an opt-in substitution path:** unlike
kos-personal/cas-ccps (which anonymize before any AI call, per their
FERPA-scoped design), all five features send free-text content to Gemini
as-is by default, which may include real student names (e.g. a DECA
placement, a student named in a trip reflection, a student named in a WBL
attention item, a student named in a typed Lesson Plan Helper question,
or a student named in an Email Composer instruction) — Brag Board's whole
point is naming real achievements, and this is Adam's personal
professional-communications tool, not a student-education-record system.
Settings → "Student ID Lookup — AI Privacy" adds an optional layer on
top: upload a roster CSV (Name + CCPS ID/login) and **all five** features
substitute each matched student's name for `{7-digit ID}@{your email
domain}` before the request leaves the browser, then restore the real name
once the result comes back — a client-side, two-way text substitution, not
a schema change. Names not on the uploaded roster still go through as-is
(fail-open, disclosed in the UI, not a silent gap). See
`LEADERHUB_AI_FLOW_SETUP.md`'s "What data this sends through Gemini"
section for the full rationale.
