# kos-personal Studio Steps

> ## ⚠️ STATUS: BLOCKED — the flow is not live, and this project cannot make it live
>
> **Both steps here are dead code on the account this is deployed to.**
> Publishing a Workspace Add-on (which is what a custom Studio step is)
> requires a standard, non-default Google Cloud project, and GCP access is
> turned off org-wide for the `ccpsnet.net` account by the district.
>
> This README previously carried a "check the Cloud project before building
> on this" caveat that leaned on kos-personal running on a **separate
> personal Google account**, per SMP-004, where creating a project would be
> self-service. **It doesn't.** The operator has confirmed it is the same
> `ccpsnet.net` account as cas-ccps, and that the Studio flow is not live.
> That was a documented intention read as a deployment fact — see
> `tools/gas-lint/gcp-map.json`'s doctrine, where the general lesson is
> recorded, and `cas-ccps/HISTORY.md` for the two rounds it took to get here.
>
> `cas-ccps/studio-steps/` is the same story one system over: 8 steps, 2,113
> unit-tested lines, pushed successfully, never appeared in Studio's picker,
> no error anywhere. The install completes and the picker stays empty.
>
> **The path forward is the Apps Script port, not a Cloud project.** Three
> things make it a much smaller job here than cas-ccps's Flow 2 redesign was:
>
> - The fixed-picker wall doesn't apply. `STAGING_PIPELINE` is a single
>   spreadsheet, so a native Sheets connector can target it — unlike
>   cas-ccps's per-teacher TeacherMatrix, which no native step could reach.
> - The trigger, the document read, and both Gemini passes are all native
>   already and are unaffected.
> - Only the **doc-body overwrite** genuinely has to come back into script: a
>   native insert-text step isn't documented as able to clear a doc's
>   existing content first, and `overwriteDocBody_()` below relies on
>   `body.clear()` before `setText()`.
>
> One constraint the port must respect: **do not widen `STAGING_PIPELINE`.**
> `10_Turnstile.gs:41` records that an 8th column means touching hardcoded
> 7-column `getRange()` calls across `2/3/9_*.gs` — which is why release
> timestamps already live in `PropertiesService` rather than a column. A
> separate return tab is the shape that fits.
>
> **Everything below stays accurate as design**, and the pure logic in these
> files (fence stripping, the Curator/Auditor merge, the validation rules,
> the touch-nothing-on-failure discipline) is exactly what the port reuses.
> Kept for that reason, not out of sentiment.


> ## ⚠️ BEFORE BUILDING ON THIS: CHECK THE CLOUD PROJECT
>
> Custom Workspace Studio steps are a Workspace Add-on, and publishing one
> requires a standard (non-default) Google Cloud project. **No standard
> project has been provisioned for anything in this repo** — every project
> here uses the default one Apps Script creates on its own, and no doc,
> script or manifest records one ever being created or linked through Project
> Settings.
>
> `cas-ccps/studio-steps/` is what that costs when nobody checks: 8 steps,
> 2,113 written and unit-tested lines, pushed and deployed successfully, and
> permanently unreachable — the install completes and the step picker stays
> empty, with no error anywhere. These two steps were built the same way.
>
> The difference here is *policy, not provisioning*: SMP-004 puts this
> project on the **personal** Google account, so unlike `ccpsnet.net` — where
> GCP is switched off org-wide by the district — creating and linking a
> standard project is self-service. Nobody has confirmed whether one exists.
>
> **So verify by looking, not by inferring.** Open Project Settings on that
> account and read the linked Cloud project. Do not treat OAuth
> consent-screen setup or an enabled Drive API as evidence — `DEPLOYMENT_GUIDE.md`'s
> Phase 1 does both in the *default* project, and reading it as availability
> is a mistake already made once and corrected in
> [`tools/gas-lint/gcp-map.json`](../../tools/gas-lint/gcp-map.json), where
> this project is declared `live-unverified` and enforced by gas-lint's
> Check G.
>
> If a standard project is there, kos-personal needs *finishing*, not
> redesigning. If not, these two steps collapse into one Apps Script harvest
> function on a time trigger — a far smaller port than cas-ccps needed,
> because the payload already lives in a Drive Doc and the output already
> goes back to a Doc body.


One standalone Apps Script project holding the custom Workspace Studio
steps kos-personal's two Studio flows use. Registered in
`tools/gas-lint/project-map.json` as `kos-personal:studio-steps` — a
**separate** Apps Script project from the main flat-folder
`kos-personal` project (SMP-004 bifurcates kos-personal onto the
personal Google account; the two projects share a design pattern, not
a runtime, and can't share a global scope either way since GAS
concatenates only within one project).

## What's in it

| File | Flow | Implements |
|---|---|---|
| `StepsShared.gs` | — | shared helpers only (no step of its own) |
| `WriteCuratorOutputStep.gs` | Curator Flow | Steps 2b + 3 + 4 |
| `WriteClassificationOutputStep.gs` | VECTOR_CLASSIFY Flow | Steps 3 + 4 |
| `appsscript.json` | — | manifest (OAuth scopes: spreadsheets, documents) |

Both flows' Trigger, Docs-read, and Gemini steps stay native — Gemini
is called only from Studio's own native step in both flows, never from
this project's code (the same Walled Garden principle cas-ccps's own
steps establish; see `cas-ccps/scripts/15c_Flow2DirectEvaluationService.js`'s
header).

**`WriteCuratorOutputStep.gs`** merges Step 2's Curator JSON with
Step 2a's optional Auditor sign-off (when that field is mapped in the
flow at all — an un-mapped `auditorJsonOutput` field is treated as "no
Auditor pass," not an error), overwrites the source doc's body with the
merged JSON, then marks the `STAGING_PIPELINE` row `FLOW_COMPLETE` —
but only once both writes succeed.

**`WriteClassificationOutputStep.gs`** validates that Gemini's output
parses as a JSON array (`STUDIO_INTEGRATION_SPEC.md`'s schema for this
flow is explicit that the top level is an array, not an object), then
writes Gemini's original text through **unchanged** — never
re-serialized — before marking the same `STAGING_PIPELINE` row
complete.

### The failure philosophy: touch nothing on failure

This is the one place kos-personal's two steps genuinely differ from
cas-ccps's design, not just in scope but in kind. cas-ccps's Flow 2
step always marks its trigger row complete, success or failure, because
failure there is tracked through a separate downstream mechanism.
`STUDIO_INTEGRATION_SPEC.md`'s own Error Handling section wants the
opposite here: on any failure, write nothing at all — leave
`STAGING_PIPELINE`'s Status at `STUDIO_ACTIVE` so the existing
staleness guard (`TURNSTILE_STALE_MINS`, default 30 min) resets the row
for a retry on its own. Every failure path in both files returns early
having written neither the doc nor the `STAGING_PIPELINE` row.

One status code exists specifically for the case that philosophy can't
cleanly cover: `STAGING_ROW_NOT_FOUND_AFTER_DOC_WRITE`. If the doc
write succeeds but the row lookup then fails, the source text is
already gone — replaced with the parsed output — so this isn't a clean
"touched nothing" failure and a silent retry would just re-run
inference against a doc that's no longer the original session text.
That status exists so a human notices instead.

## Fixes applied while landing this project

Same two bug classes cas-ccps's studio-steps project needed, applied
here for the same reasons — see that project's README for the full
byte-level reasoning behind each; summarized here as current-state
facts:

- **`inStr_()` safe-input reader + a whole-body try/catch, every
  execute function.** Reading a Studio input as
  `inputs["x"].stringValues[0]` throws a raw `TypeError` the moment a
  field is unmapped or non-STRING, before any status could be
  returned. `StepsShared.gs`'s `inStr_()` degrades to a default
  instead; both `onXExecute` functions read every input through it and
  wrap their whole bodies in try/catch.
- **Fence-stripping before `JSON.parse`.** Gemini routinely wraps JSON
  output in a ```` ```json ```` fence even when asked for raw JSON.
  Both files strip it before parsing — `WriteCuratorOutputStep.gs`'s
  own `stripJsonFence_()` for the Curator and (when present) Auditor
  JSON, `WriteClassificationOutputStep.gs`'s own
  `stripJsonFenceForValidation_()` for the array-shape check only (the
  original, unstripped text is still what gets written to the doc —
  see "why the raw text is written through unchanged" in that file's
  own header). Matches `cas-ccps/scripts/25_WarmUpWriter.js:740`'s own
  convention.
- **PII logging.** Both execute functions used to
  `Logger.log(JSON.stringify(event))` — full session/document text
  straight into Stackdriver. Reduced to a plain "step ran" line in
  both.

## Deploying

kos-personal's own convention applies here too — a flat-folder,
standalone Apps Script project, not bound to a spreadsheet:

```bash
node tools/clasp-sync/sync.js  # kos-personal isn't cas-ccps-prefixed, so this builds it directly
cd kos-personal/studio-steps
clasp create --type standalone --title "kos-personal Studio Steps"
clasp push
clasp deploy --description "v1"
```

Then, once: **Apps Script editor → Deploy → Test deployments → Install
→ Done.** Both steps become available in Studio's step picker from
that point on.

This is a personal-account deployment target, so SMP-004's
personal/district bifurcation applies here rather than its
production-automation air-gap — see
`kos-personal/rtp-core-router/protocols/KILL_SWITCH_PROTOCOL.md` for
the full policy this project sits on the personal side of.

## What's still manual, on purpose

1. **Test-install, once.** No API exists for this — it's an Apps
   Script editor action, done once for this whole project.
2. **Wiring each flow.** Trigger → Docs → Gemini → this project's step,
   mapping variables via Studio's picker, done once per flow.

## Open questions from the original design, not yet resolved

Two items the original design carried as explicitly-not-built,
confirmed still true today — neither is addressed by anything in this
project:

- **`COG_STIMULUS` special handling.** `STUDIO_INTEGRATION_SPEC.md`
  names `COG_STIMULUS` as one of the Curator Flow's payload types
  alongside `SESSION_LOG`/`EXTERNAL_DATA`, but doesn't specify whether
  it needs different handling than the other two.
  `WriteCuratorOutputStep.gs` treats all three identically today — if
  `COG_STIMULUS` turns out to need different treatment, that's unbuilt.
- **The `session_uid` pairing question.** Whether/how a Curator-Flow
  session and a VECTOR_CLASSIFY-Flow session for the same underlying
  conversation should be linked (a shared `session_uid`, or some other
  correlation) is an open design question the spec doesn't answer and
  this project doesn't attempt to close.

## Adding the next step

1. New file in `kos-personal/studio-steps/`. Use `StepsShared.gs`'s
   `variableTextInput_`, `inStr_`, `stringVar_`, `buildOutputRenderAction_`,
   `markStagingPipelineComplete_`, `overwriteDocBody_` — don't
   redeclare them (GAS concatenates every file in a project into one
   global scope; a second declaration crashes the whole project at
   parse time). Read every Studio input through `inStr_()` and wrap the
   whole execute function body in try/catch.
2. Add its `workflowElements` entry to
   `kos-personal/studio-steps/appsscript.json`. Add the matching OAuth
   scope if it needs a Google service none of the existing steps use.
3. Add its filename to `tools/gas-lint/project-map.json`'s
   `kos-personal:studio-steps.files` array.
4. Add a test file under `tests/kos-personal/` for it.
5. `node tools/gas-lint/check.js && node tools/clasp-sync/sync.js && npm test`
   — all three should pass clean before pushing.
