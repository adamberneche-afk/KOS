# Setting up the `sandbox-deploy` CI job

**What this unlocks:** once this is wired up, pushing to `main` automatically
pushes HEAD to *sandbox* copies of the cas-ccps/kos-personal Apps Script
projects — no more running `clasp push` by hand for every test push. This is
the CI half of `DEPLOYMENT_RUNBOOK.md`'s "practice field vs. real stadium"
model; that file's §3.2 and §3.5 are the fuller reference this doc is
distilled from, focused specifically on the two secrets `sandbox-deploy`
(`.github/workflows/gas-lint.yml`) actually needs.

**What it will never do:** touch a real, district-owned production project.
Every credential and Script ID this job ever sees is a sandbox one. Promoting
a change to production stays a manual, human-run step (`DEPLOYMENT_RUNBOOK.md`
§3.6) — that boundary isn't something this setup weakens.

**Needs a real computer** (a laptop/desktop with clasp already logged in) —
none of these steps can be done from a phone alone, since step 2 reads a file
clasp writes to your machine's home directory.

---

## Step 1 — Build at least one sandbox copy

Follow `DEPLOYMENT_RUNBOOK.md` §3.2, but you don't need all 8 projects before
this is useful — start with just one. **`teacher-dashboard` is the
recommended first pick**, since it's what the new cas-ccps↔leader-hub OAuth
work (`getRoster`/`getPacingGuide`/`getCompetencyRegistry`) actually needs
tested.

1. In Drive, find the real spreadsheet/project you want a sandbox of. **File
   → Make a copy.** Rename it unmistakably — e.g. *"Teacher Dashboard —
   SANDBOX, not real students."*
2. Open the copy's **Extensions → Apps Script**. This is a brand-new script
   project, bound only to the copy, completely disconnected from the real
   one.
3. **Project Settings (gear icon) → Script ID.** Copy it — this is the value
   you'll use in Step 3.
4. Inside the sandbox copy's code, find `getConfig_()`'s Script Properties
   (or whatever config tab/constants that project uses) and repoint every ID
   at sandbox-only sheets/folders. **This is the step that actually makes
   testing safe** — don't skip it.

Repeat for any other project you want covered (`central-ledger`,
`unified-manual`, `master-student-template`, `rubric-response-sheet`,
`teacher-matrix-sheet`, `student-dashboard`, `studio-steps`) whenever
you're ready — the CI job handles a partial set fine (see Step 3's note
on this). `studio-steps` is standalone (not bound to a spreadsheet), so
its sandbox copy comes from **File → Make a copy is not applicable
here** — instead, `clasp create --type standalone` a fresh sandbox
project the same way `DEPLOYMENT_RUNBOOK.md` §3.2b describes for a
from-scratch build, using test-only data.

`kos-personal` doesn't need a separate "sandbox" copy the same way —
it only ever runs against your own account already, so its real Script ID
is fine to use directly here (same as `DEPLOYMENT_RUNBOOK.md` §3.5 already
treats it: "no live audience, safe to fold in").

## Step 2 — Get your clasp login for the secret

```
clasp login --status
```

Confirms which account is currently logged in — this can be your regular
personal account (the same one the sandbox copies from Step 1 live under),
same as `DEPLOYMENT_RUNBOOK.md` §3.5 already does for its own illustrative
job. A dedicated, fully separate "sandbox-only" Google account is a fine
extra precaution if you want more isolation, but not required — what
actually matters is that this is never your district/production login.

The file clasp saved from that login:

- **Mac/Linux:** `~/.clasprc.json`
- **Windows:** `%USERPROFILE%\.clasprc.json`

Open it and copy the **entire file contents** — you'll paste the whole
thing as one secret value in Step 3. Treat this exactly like a password:
whoever holds it can push code as this account.

## Step 3 — Add the two GitHub repo secrets

On github.com: **this repo → Settings → Secrets and variables → Actions →
New repository secret.** Add both:

**`CLASP_SANDBOX_CREDENTIALS`**
Paste the entire contents of the `.clasprc.json` file from Step 2.

**`CAS_SANDBOX_SCRIPT_IDS`**
One JSON object, only the projects you've actually built a sandbox for so
far (Step 1) need an entry — anything omitted is skipped, not a failure.
Starting with just `teacher-dashboard`:

```json
{"teacher-dashboard": "PASTE_THE_SCRIPT_ID_FROM_STEP_1_HERE"}
```

As you build more sandbox copies later, edit this secret (same
"New repository secret" screen, but you're overwriting an existing one) to
add more keys. Full key set, once every project has a sandbox copy:

```json
{
  "central-ledger": "...",
  "unified-manual": "...",
  "master-student-template": "...",
  "rubric-response-sheet": "...",
  "teacher-matrix-sheet": "...",
  "teacher-dashboard": "...",
  "student-dashboard": "...",
  "studio-steps": "...",
  "kos-personal": "..."
}
```

Every key here has to be valid JSON (double-quoted keys/values, commas
between entries, no trailing comma after the last one) — a malformed value
will make the whole `sandbox-deploy` job fail at the "Materialize sandbox
.clasp.json files" step, not silently skip.

## Step 4 — Confirm it worked

Push anything to `main` (or merge a PR into it) and check the **Actions**
tab on GitHub:

- **Both secrets set correctly** → `sandbox-deploy` runs. Its
  "Materialize sandbox .clasp.json files" step logs one skip line per
  project you haven't added to the JSON map yet — expected, not an error,
  as long as the project(s) you *do* care about right now went through.
- **Either secret still unset** → `sandbox-deploy-not-configured` runs
  instead, printing a reminder that names both required secrets (it
  doesn't distinguish which one is actually missing — the message is the
  same either way, so check both).
- **A configured project's push actually fails** (not skipped) — usually
  means either the Script ID is wrong, or the sandbox copy's own
  `appsscript.json`/OAuth scopes disagree with the manifest this repo's
  `tools/clasp-sync/sync.js` generates for it. Compare against
  `cas-ccps/clasp/manifests/<project>.appsscript.json`.

Once you can see the sandbox copy's Apps Script editor reflect the new
code (`clasp open` on your own machine, or just open the sandbox project's
script editor in a browser), the loop is proven for that project.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `sandbox-deploy-not-configured` runs every time | One or both secrets aren't set, or `CAS_SANDBOX_SCRIPT_IDS` is set to an empty string rather than not set at all |
| A project silently skipped in the logs | Expected if you haven't added that project's key to `CAS_SANDBOX_SCRIPT_IDS` yet — not a bug |
| `clasp push` step fails with an auth error | The account behind `CLASP_SANDBOX_CREDENTIALS` may have had its clasp session revoked/expired — re-run `clasp login` locally, copy the fresh `.clasprc.json`, update the secret |
| `clasp push` step fails with a "Script ID not found" style error | Double-check the ID pasted into `CAS_SANDBOX_SCRIPT_IDS` against Project Settings → Script ID on the actual sandbox copy — easy to accidentally copy the *real* project's ID instead |
| JSON parse error in the "Materialize" step | `CAS_SANDBOX_SCRIPT_IDS`'s value isn't valid JSON — check quotes/commas; paste it into any JSON validator to confirm before saving the secret |

## See also

- `DEPLOYMENT_RUNBOOK.md` — the fuller deployment picture (sandbox *and*
  production, all three subsystems).
- `.github/workflows/gas-lint.yml` — the actual `sandbox-deploy` job this
  doc is setting up; its own inline comments repeat the secret shapes above.
