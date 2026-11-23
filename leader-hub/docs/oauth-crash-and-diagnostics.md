# The OAuth-consent-dialog crash, and diagnosing without DevTools

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

## Fixed — the OAuth-consent-dialog crash (2026-09-28)

**Read this before touching `tools/leaderhub-build/` or the way the page
is served.** For two weeks the deployed page threw
`Uncaught SyntaxError: Unexpected identifier 'style'` (reported against
Google's `userCodeAppPanel?createOAuthDialog=true:570:25`), with
`LS is not defined` errors after it. On `/dev` at `2a3dd4a` the page now
loads with all 17 blocks run and 0 errors (`?diag=probe`), and settings
sync reaches the server (`?diag=1`). `/exec` was released on 2026-10-05
(v20, every deployment). **Still to confirm:** the same `?diag=probe`
result on `/exec`, and that a non-owner account is refused. The full investigation, including every theory
ruled out along the way, is in `HISTORY.md`.

There were three separate faults, all found with `Diagnostics.gs`'s
`?diag` modes:

1. **HtmlService stripped `//# sourceURL=` comments, taking `</script`
   with them.** Apps Script parses and re-serializes the page it holds.
   It dropped 7 of the 16 `sourceURL` comments the build wrote. Each
   comment sat directly against its closing tag, and `</script` went with
   it, leaving a stray `>` and merging that block into the next. The
   first merge pulled page markup into a script, which caused the
   `'style'` error. **Fix:** the build writes no `sourceURL` comments;
   each block is named by a `data-lh-block` attribute instead. Don't
   bring the comments back.
2. **Splitting changed load order.** In one script, every function and
   var exists before any line runs. Split into tags, each exists only
   once its own tag has run, so load-time code naming something from a
   later tag threw (`_lpHasUnsavedChanges is not defined`). **Fix:**
   `tools/leaderhub-build/order-declarations.js` puts var names, then
   functions, ahead of all other statements before the split.
   `tests/tools/leaderhub-build-load-order.test.js` runs the real built
   tags in sequence to prove it.
3. **Every browser call to the server targeted a private `_` function**,
   which `google.script.run` never exposes. This didn't blank the page,
   but no sync ever ran. See "Server sync goes through public,
   owner-only functions" below.

The 70,000-character per-tag limit stays. The only clean render before
this fix was a throwaway project that got the split build *without*
`sourceURL` comments. Those comments were added 35 minutes after the
split, before any live test, which is the likeliest reason the split
"still crashed" on every real deploy.

**Working constraints** (these still apply):

- The assistant never touches the live Google account. The user runs
  every `clasp`, browser and deploy action and reports back.
- **DevTools is blocked** by district admin policy: no console, no
  Sources panel, no network inspection. All testing is black-box, with
  screenshots and described behavior only. `Diagnostics.gs`'s `?diag`
  modes exist for this reason.
- `.clasp.json` is gitignored. `tools/clasp-sync/run.js` copies each
  project's real one in from the registry outside the checkout.
- The user deploys from a GitHub ZIP of main with
  `node tools/clasp-sync/run.js --latest --only leader-hub`; `git` is not
  available on that machine.

**Current state:** zero Gmail scope in `appsscript.json` (7 scopes, none
Gmail); `createBragDraft_()` sends via `MailApp.sendEmail()`; nothing calls GmailApp
(the Gmail horizon scanner was retired 2026-11-23); the assembled
file carries 17 `<script>` blocks (the small error handler plus 16 parts
of the main script, each under 70,000 characters).

## Diagnosing a broken page without DevTools

DevTools is blocked on district devices, so `Diagnostics.gs` puts the
information on the page itself and in the editor's **Executions** log. Add
one of these to the deployment's URL. They're owner-only, like the app.

| URL suffix | Shows |
|---|---|
| `?diag=1` | A small server-checks page with no app code. It shows who you're signed in as, whether that's the owner, the served page's size and script-block count, and whether JavaScript runs. It also makes two live `google.script.run` calls: a ping, and `lhGetAllConfig()`, the owner-only entry point the app's settings sync uses. |
| `?diag=probe` | The full app, plus a status panel pinned to the bottom of the screen. The panel shows which script blocks ran (and which didn't), every error with its block and line, failed resource loads, and page-load milestones. The same summary is logged by `lhDiagReport` about 3 seconds after the page loads and again at 20 seconds. |
| `?diag=probe&parts=N` | The same, but only the first *N* named script blocks are served. Use this to bisect a block that hangs the page before the panel can paint. |
| `?diag=raw` | The app page exactly as Apps Script holds it (`getContent()`), as plain text. Ctrl+S saves it. Add `&from=N&len=M` for one stretch, using positions from `?diag=1`. |

`?diag=1` also lists every `<script>` element as a browser would find it
in the page Apps Script holds, under **Script elements as served**. Each
app block is named by the `data-lh-block` attribute the build writes, so a
healthy page shows 16 named blocks, none over 70,000 characters, and zero
`sourceURL` comments.

To try a change without touching users, push it to HEAD and use the
`/dev` link that `run.js` prints:

```
node tools/clasp-sync/run.js --latest --head-only --only leader-hub
```

**Server sync goes through public, owner-only functions.** Apps Script
never exposes a function whose name ends in `_` to `google.script.run`.
Until 2026-09-28 the page called eight of them directly: `lhGetAllConfig_`,
`lhSaveConfig_`, `lhPushData_`, `lhPullData_`, `lhGetScrScores_`,
`lhSaveScrScores_`, `lhApiCall_` (the AI/email bridge) and
`lhGetHorizonItems_`. Every one of those calls threw in the browser, so
none of that sync ever reached the server. `?diag=1` confirmed it live.
The page caught the failures as warnings, so this never blanked the
screen.

The page now calls public entry points with the same names minus the `_`
(`lhGetAllConfig`, `lhApiCall`, and so on), declared together in
`Code.gs`. Each one checks `OWNER_EMAIL` first and then calls its `_`
implementation. The check has to live in the function: anything public can
be called by any signed-in domain user from any page this script serves,
including the "not authorized" page. `tests/leaderhub/browser-entry-points.test.js`
pins both halves, and gas-lint now fails any `google.script.run` call to a
`_` name (`private-server-function`). The settings-sync check on
`?diag=1` calls `lhGetAllConfig` and should read OK.
