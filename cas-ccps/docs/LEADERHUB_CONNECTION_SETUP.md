# Connecting leader-hub to a cas-ccps Teacher Dashboard

**What this is:** a one-time setup, done once per teacher deployment, that
lets leader-hub become a live client of that teacher's cas-ccps pacing
guide and competency registry instead of leader-hub keeping its own frozen
local copy (Say/Do Ledger D1, Addendum 24, "Option D" from the plan's own
merge-feasibility analysis).

**Why this needs its own deployment, separate from the existing Teacher
Dashboard URL:** the human-facing dashboard is deployed `access: DOMAIN` —
Google's own edge-level sign-in check enforces that before any of this
project's code runs, and that edge check is built around interactive
browser navigation, not a background `fetch()` call from a different page.
leader-hub's request instead carries its own proof of identity — a Google
ID token, verified inside this project's `doPost()` (see
`07_TeacherDashboard.js`'s "LEADER-HUB JSON API" section) — so this second
deployment needs Google's edge check *out of the way* entirely, not
replaced by a laxer one. That means: same project, same code, a **second**
web-app deployment with `access: ANYONE_ANONYMOUS` — the same access level
leader-hub's own `EmailBridge.gs` already uses successfully for exactly
this reason.

This does **not** weaken the human-facing dashboard's own security model —
that deployment (and its `access: DOMAIN` setting) is untouched. The new
deployment is a second, independent front door onto the same code, and
`doPost()`'s own token check is the only thing that decides whether a
request through it gets anything back.

## One-time: register the OAuth Client ID (do this once, not per teacher)

leader-hub is one app — every teacher's Teacher Dashboard checks incoming
requests against the *same* registered Client ID, the same way every
teacher's dashboard already checks incoming requests against their own
`TEACHER_EMAIL`.

1. In [Google Cloud Console](https://console.cloud.google.com), create or
   select a project.
2. **APIs & Services → OAuth consent screen** → User Type: **Internal**
   (this app is only ever used by accounts in this Workspace domain —
   Internal apps skip Google's external-app verification review entirely).
3. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   → Application type: **Web application**.
4. **Authorized JavaScript origins**: add wherever `student-leader-hub.html`
   is actually opened from (see leader-hub's own README for how it's
   hosted/opened today).
5. Save. Copy the generated Client ID — this is a public value, safe to
   paste into leader-hub's Settings (see below) and safe to set as a
   Script Property; it is not a secret.

## Per teacher: two Script Properties + one extra deployment

For each teacher's Teacher Dashboard project:

1. **Script Properties** (Project Settings → Script Properties, same place
   `TEACHER_EMAIL` already lives):
   - `LEADER_HUB_OAUTH_CLIENT_ID` — the Client ID from the step above (same
     value for every teacher).
2. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** — Apps Script's UI usually labels this
     "Anyone" without further qualification; confirm it does *not* require
     the caller to be signed in (this is the `ANYONE_ANONYMOUS` API value —
     the point is no sign-in challenge at all, matching `EmailBridge.gs`'s
     own deployment).
   - This creates a **second** `/exec` URL, distinct from the existing
     Teacher Dashboard URL used for the human-facing UI. Copy it.
3. Paste that second URL into leader-hub → Settings → "Connect to
   cas-ccps" → cas-ccps API URL, along with the same OAuth Client ID from
   the registration step above.

## What this actually exposes

`doPost()`'s only two actions today are `getPacingGuide` (every pacing
unit — dates, objectives, competency IDs, vocabulary) and
`getCompetencyRegistry` (this teacher's visible competency rows) — both
read-only, both require a verified ID token whose email matches this
deployment's own `TEACHER_EMAIL` before anything is returned. SCR read/write
is deliberately not implemented yet — see `07_TeacherDashboard.js`'s own
comment on why, and the plan file's Addendum 24 for the tracked follow-up.

## Re-consent note

Adding `https://www.googleapis.com/auth/script.external_request` to this
project's OAuth scopes (needed for `UrlFetchApp` to reach
`oauth2.googleapis.com`) means an existing deployment will prompt for
re-authorization the next time it's redeployed — expected, not a bug.
