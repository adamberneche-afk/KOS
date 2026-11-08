# release-check

Plan item L1 (approved 2026-11-08). Before any part of this repo is
published it must hold no Drive IDs or Docs links (no allowlist), no
tracked manifests or exports, no student-data patterns, no secrets, and a
LICENSE in every public unit. This check reports all five over the
**tracked** tree (`git ls-files`) and says where, never what: a value is
printed only as its length, `docs.google.com/document/d/…(44)`.

The first run is the full-repo audit,
[`meta/RELEASE_AUDIT_2026-11-08.md`](../../meta/RELEASE_AUDIT_2026-11-08.md).
**The gate is off** until the operator has read it and says to turn it on.

```
node tools/release-check/check.js                  # tracked tree, warn-only (exit 0)
node tools/release-check/check.js --gate           # exit 1 on any failing finding
RELEASE_CHECK_GATE=1 node tools/release-check/check.js   # the same, from the environment
node tools/release-check/check.js --staged         # staged files only (the pre-commit hook)
node tools/release-check/check.js --history        # also count matches in git history (counts only)
node tools/release-check/check.js --report <file>  # also write the counts and file list as Markdown
```

## Buckets

| Bucket | Rule | Matches | Fails the gate |
|---|---|---|---|
| drive | `docs-link` | `docs.google.com/(document\|spreadsheets\|presentation\|forms\|drawings)/d/<id>` (also `/u/N/`, `/d/e/`) with an ID of 20+ characters | yes |
| drive | `drive-link` | `drive.google.com/file/d/<id>`, `/drive/folders/<id>`, `open?id=`, `uc?…id=` | yes |
| drive | `forms-short-link` | `forms.gle/<id>` | yes |
| drive | `drive-id-call` | `getFileById` / `getFolderById` / `openById` with a 25–44 character literal | yes |
| drive | `drive-id-labelled` | a 25–44 character literal assigned to a name ending in `_ID` / `Id` / `ID` (`FOLDER_ID = '…'`, `"docId": "…"`) | yes |
| script | `script-url` | `script.google.com/macros/s/<id>` | yes, unless the operator decides otherwise |
| script | `script-url-domain` | `script.google.com/a/macros/<domain>/s/<id>` (the domain is redacted too) | the same |
| script | `script-project-link` | `script.google.com/home/projects/<id>`, `script.google.com/d/<id>` | the same |
| script | `script-id-labelled` | a 25–100 character literal on a name with `script` or `deploy` in it (`"scriptId"`, `DEPLOYMENT_ID`) | the same |
| export | `export-file` | a tracked `.csv .tsv .xlsx .xlsm .xls .ods .imscc` | yes |
| export | `export-named` | a `.json .csv .txt` named catalog, inventory, export, dump, gradebook, roster or snapshot | yes |
| export | `drive-listing-json` | a `.json` with three or more `"mimeType"` keys (a Drive listing) | yes |
| license | `license-missing` | no `LICENSE`/`LICENCE`/`COPYING` at the root, `cas-ccps/`, `leader-hub/`, `kos-personal/` (Mothership is another repo) | yes |
| secret | `private-key`, `google-api-key`, `google-oauth-secret`, `github-token`, `stripe-live-key`, `aws-access-key`, `slack-token`, `anthropic-key` | high-confidence credential shapes in file contents | yes |
| student-data | `student-email`, `id-shaped-email`, `staff-email` | `tools/student-data-scan`'s own kinds and allowlists, printed as its hash | yes |
| review | `office-document`, `unreadable-container` | a tracked `.docx .pptx .pdf …` (its text is scanned; a person decides whether it ships) | no |
| probably-fine | `apps-script-manifest` | `appsscript.json` and `*.appsscript.json` (source, not an export) | no |

**Look-alikes.** An ID is only a finding in a link or where it is labelled
as one: a bare 44-character token is not. A labelled value with no
lower-case or no upper-case letter (a hex hash, a slug like
`THE-4-PS-…`, a snake_case word) is skipped: a Drive or script ID is random
base64url. A placeholder (`/d/<id>/`, `/s/.../exec`) has no ID-shaped value
and never matches.

**Containers.** `.docx .xlsx .pptx .imscc .zip` and the rest of
student-data-scan's zip types are unpacked in memory with that tool's
reader and their text members scanned; a finding reads
`path!member:line`.

**Secrets.** `scripts/secrets-doctor.mjs` checks that the repo's Actions
secrets are *configured*; nothing else in the repo read file contents for a
credential, so the secret rules here are new and few, high-confidence
shapes only.

**History** (`--history`) reads `git log --all -p` and counts matching
*added* lines per rule and the commits they came in: counts only, no paths,
no values. A history rewrite is the operator's call.

**No allowlist.** The rule says so. Whether the gate should take one (for
example for the deployment URL the student docs need) is a decision for
the operator after the audit.

## Turning the gate on

CI runs this in `.github/workflows/gas-lint.yml`, step "Release check",
with `RELEASE_CHECK_GATE: '0'`. Changing that one line to `'1'` makes any
finding in a failing bucket fail the build. Do it only on the operator's
word, after the findings the operator wants gone are gone.

## Pre-commit hook

A hook only runs where it is installed; the CI gate is the one that holds.
To install it in a clone (not done automatically):

```
cp tools/release-check/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

It runs `check.js --staged` on the staged copies of the files being
committed (no LICENSE check), warn-only too; `RELEASE_CHECK_GATE=1` in the
shell makes it block a commit.

Tests: `tests/tools/release-check.test.js`.
