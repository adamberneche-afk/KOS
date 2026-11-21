# The CI floor in this repo

Moved here from the root README on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.1): the checks copied from the Mothership hub's CI floor, and how the hub
reads this repo.

## Floor checks 7 and 8 — doc-link-check and doc-placeholder-check

`.github/workflows/doc-link-check.yml` and `.github/workflows/doc-placeholder-check.yml` are **byte-identical copies** of the canonical files in the Mothership hub (see that repo's `CICD_FLOOR.md`) and must not be edited here — a change belongs upstream. Everything that differs about this repo lives in `.github/floor.json`.

| check | catches | configured by |
|---|---|---|
| doc-link-check | a relative link in a Markdown doc that points at a file that no longer exists (offline: external URLs are never fetched, so it cannot flake) | `docExcludePaths` |
| doc-placeholder-check | unedited template text left in a shipped doc: an unfilled company-name field, filler Latin, an unreplaced URL placeholder. Not ordinary TODOs | `placeholderPatterns`, `docExcludePaths` |

Both run on pull requests that touch Markdown or `.github/floor.json`. `archive` is excluded because archived docs are kept as written: one, `archive/2026-27-Q1/kos-personal/archive/studio-steps/README.md`, links to a gas-lint map that has since moved. A line that must quote placeholder text on purpose can carry `floor-allow-placeholder`.

## Floor check 10 — secrets-doctor

`scripts/secrets-doctor.mjs` confirms every secret this repo's workflows reference is actually configured and non-empty. It is a **byte-identical copy** of the canonical file in the Mothership hub (see that repo's `CICD_FLOOR.md`) and must not be edited here — a change belongs upstream.

The expected list is **derived from the workflow files**, never hand-written. That is the whole design: the two doctors that predate it, in Mothership and TSO, name their secrets in source, and TSO's has already drifted — it checks three while its workflows reference five. A list someone has to remember to extend is the same shape as the bug.

| command | does |
|---|---|
| `node scripts/secrets-doctor.mjs --sync` | regenerates the env block in `.github/workflows/secrets-doctor.yml` |
| `node scripts/secrets-doctor.mjs --check` | fails if that block has fallen behind, in either direction |

The workflow splits by what each half needs to see. Its `drift` job runs on **every pull request** with no access to the secrets context at all, so a workflow that starts needing a new secret turns a PR red until the block is regenerated. Its `probe` job runs on dispatch only and receives one boolean per secret — `${{ secrets.NAME != '' }}`, compared inside the expression — so a job is shipped only the secret it names and no value ever reaches the environment.

Two secrets are in scope here (four until 2026-11-01, when `call-hub.yml` and its `APPS_SCRIPT_URL` and `TENANT_CALLER_KEY` were retired: see [the hub pulls](#the-hub-pulls--call-hubyml-is-retired) below). `CAS_SANDBOX_SCRIPT_IDS` and `CLASP_SANDBOX_CREDENTIALS` are declared optional in `.github/floor.json`, because `gas-lint.yml`'s `check-sandbox-secrets` job turns them into a `configured` output that every downstream job gates on — absent simply means the sandbox push lane is off, which is a supported state.

Worth noting for anyone extending the scanner: `gas-lint.yml` explains itself with the phrase *"a bare `secrets.X` reference inside an `if:` conditional"*, and `needs.check-sandbox-secrets.outputs.configured` contains the substring `secrets.outputs`. A naive scan reports two credentials named `X` and `outputs` that nobody needs. Both were found against this repo while the extractor was being written, and both are pinned by tests upstream — comments are stripped and a left boundary is required.

### The hub pulls — `call-hub.yml` is retired

Since 2026-10-31 the Mothership hub reviews KOS **on its own timer** instead of waiting for KOS to call it. A time-driven trigger inside the hub polls every active spoke (debug every 6 hours, hunt Wednesdays at noon, refactor Sundays at midnight), reads KOS's latest commit with the hub's own GitHub credential, and reviews it through the same path a heartbeat request used to take. Nothing in KOS calls in, so KOS holds no hub secrets. Details are in Mothership's README, [The Pull Model](https://github.com/adamberneche-afk/Mothership#the-pull-model-gasspoke_pollerjs), and its `SESSION_HANDOFF.md` item 28.

**Retired 2026-11-01 (D13).** The owner deployed the hub with `run.js` and installed its triggers, and the hub's first poll (`pollSpokesDebug`, then `showSpokePollStatus`) read KOS as `settled` at the pushed commit. So `call-hub.yml` was deleted: it never worked (its two secrets were never set to matching values, and all 233 runs from 2026-09-19 to 2026-10-31 failed). `secrets-doctor.yml` no longer lists `APPS_SCRIPT_URL` or `TENANT_CALLER_KEY`; the owner deletes those two repository secrets.

**Deploying the hub** (from the folder that holds `run.js`; [`tools/clasp-sync/README.md`](../tools/clasp-sync/README.md), "--hub"):

```
node run.js --latest --hub latest                    # KOS and the hub
node run.js --hub latest --only mothership-hub       # the hub alone
```

`--hub` needs `--latest`, `--zip` or `--only` beside it. The one-time registry folder `clasp-registry\mothership-hub\` holds `.clasp.json` (from `clasp clone <scriptId>`), `deployments.txt` (the live deployment ID alone on its line, without the ` @n` that `clasp list-deployments` prints after it) and `admin-token.txt` (the hub's `ADMIN_SETTINGS_TOKEN`; without it the triggers aren't installed). Check with `showSpokePollStatus` in the hub's editor.

Not adopted here: floor checks 6 and 9. KOS's own `tools/doc-currency` and `tools/coverage-gaps` predate the floor and are the versions Mothership's were built **from**, so they keep their own configuration and are not driven from `.github/floor.json`.
