# cas-ccps↔leader-hub integration (D1 + Addendum 26)

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

> **Status (D16, 2026-11-01): parked until `checkCasServerSignIn()` passes.**
> The browser sign-in needs an OAuth client from Cloud Console, which is off
> for ccpsnet.net; the server-to-server route (Apps Script's own OpenID
> token) is untested. Run `checkCasServerSignIn()` once from the editor: if
> CAS accepts the token, finish the server route; if not, this stays parked
> and the frozen local copies stay in use.

leader-hub's SCR grading grid and Pacing Calendar are now optional live
clients of a connected cas-ccps Teacher Dashboard, instead of always
relying on the frozen local copies (`CAS_PACING_UNITS`, the hand-typed
`SCR_COURSES` roster) — a Settings → "Connect to cas-ccps" flow, deliberately
separate from leader-hub's own server connection since cas-ccps requires
a real verified identity per request rather than trusting a bare URL.

- **`CAS_CCPS_BRIDGE`** (`867d6f4`) — Google Identity Services
  ("Sign In With Google") client-side, a short-lived ID token kept in
  memory only (never localStorage), sent to cas-ccps's `doPost()` in a
  `text/plain` POST body (a CORS-preflight-avoidance trick `EMAIL_BRIDGE`
  also used before its `fetch()` path was removed 2026-10-22) rather than an `Authorization` header.
  `refreshCasCcpsPacingGuide()` is a deliberate, button-triggered pull —
  nothing syncs automatically, same convention as Org Sync's push/pull.
- **Student-email link** (`e1221d5`) — the SCR grading grid had no
  student-email field at all before this; a new `syncCasCcpsRoster()`
  pulls cas-ccps's real per-teacher roster (via a new `getRoster` API
  action) and matches it against the existing hand-placed period rosters
  by name (cas-ccps's own `period` field used only as a tiebreaker when a
  name collides across periods — never a hard join key, since the two
  systems use different period vocabularies). `_scrStudentKey(stu)` is
  the one place every `scrScores` read/write now resolves its key from —
  a matched student's scores are non-destructively rekeyed from name to
  email; anyone unmatched stays exactly as name-keyed as before. A
  reconciliation report after each sync shows what matched, what's
  already synced, and what needs manual review — nothing is added,
  removed, or guessed automatically on either side.
- **Scoped out on purpose, not silently dropped:** SCR read/write-back to
  cas-ccps. cas-ccps's own SCR functions still lack per-teacher/ownership
  gating, and this is a read-only, one-directional integration for now.
