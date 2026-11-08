# setup-guide

Generates the reference half of the CAS setup guide from the code, so it
can't go stale (packaging step 2, `meta/PLAN_2026-11.md`).

```bash
node tools/setup-guide/build.js            # rewrite cas-ccps/docs/SETUP_GUIDE_REFERENCE.md
node tools/setup-guide/build.js --check    # exit 1 if the committed file is stale (CI)
node tools/setup-guide/build.js --out <p>  # write, or --check, another path
```

The guide itself, the steps in order with the check for each, is
hand-written: [`cas-ccps/docs/SETUP_GUIDE.md`](../../cas-ccps/docs/SETUP_GUIDE.md).
In the Central Ledger, `showSetupStatus()` ends with a checklist that
follows its step numbers.

## What it reads

| Section | From |
|---|---|
| 1. Projects | `tools/gas-lint/project-map.json` (files per project, what each is bound to), `tools/clasp-sync/run.js`'s `MANIFEST` (push or promote), `cas-ccps/clasp/templates/` |
| 2. Manifests | `cas-ccps/clasp/manifests/*.appsscript.json`: scopes, advanced services, libraries (never the ID), web app settings, add-on steps |
| 3. Script Properties | every `getProperty(...)` in each project's files: a literal key, a string constant, a list a loop walks, or a helper that passes its parameter to `getProperty` (its call sites count); the default written beside the read; whether code writes the key; and the keys `00_SharedConfig.js` resolves (`getConfig_()`, `SCHOOL_DEFAULTS`, `.values.X`, `pivotFlagFor_`, `SHARED_CONFIG_KEYS`) |
| 4. Triggers | every `ScriptApp.newTrigger(...)`: handler (literal, constant, or a list's entries), the enclosing installer and the public function that calls a hidden one, the schedule from the builder chain; the Ledger cycle's `LC_JOBS` |
| 5. Studio Flows | `tools/gas-lint/flow-map.json`'s `flowSurfaces` (fixture, canary, binding, liveness, each checked to exist in its project), `sync*BuildSpec`/`check*BuildSpec` and `run*Preflight*` functions, the flows `syncFlowBuildSpec()` writes, and the docs in `cas-ccps/docs/` that name each flow's functions |

Comments are stripped first (gas-lint's `stripCommentsAndStrings`), so a
commented-out read doesn't count. Anything it can't resolve (a key built at
run time, a handler passed in as a parameter, a computed interval) is listed
under "Not resolved" or shown as `computed`, never guessed. Output is sorted
and carries no dates or line numbers, so it changes only when the code does.

Tested in `tests/tools/setup-guide.test.js` (the committed file matches, the
`--check` exit codes, each extractor on fixtures, no ID the release check
would flag). Node built-ins only.
