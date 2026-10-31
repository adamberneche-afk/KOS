# student-data-scan

Finds student-shaped data in the repo and says **where, never what**: each
finding is a path, a line, a kind and a 12-character hash of the match. The
output can go in a CI log or an agent session without carrying the data.

Decided 2026-10-19 (KOS decision register #3 and the repo note): the repo
stays public, after a scrub of the tree and its git history, and this check.

| Kind | Matches |
|---|---|
| `student-email` | any address at `student.ccpsnet.net` |
| `id-shaped-email` | six or more digits before an `@`, any domain |
| `roster-name` | with `--roster`, a full name from a Canvas export |

```
node tools/student-data-scan/check.js                     # working tree
node tools/student-data-scan/check.js --history           # every blob in git history (needs a full clone)
node tools/student-data-scan/check.js --roster <csv>      # also roster names
```

`--roster` takes a Canvas gradebook export kept **outside the repo**, on the
operator's machine. Names are read into memory, matched as "First Last"
(the export's "Last, First" is reversed), and never printed or written.
Agents never run it: a session must not receive a roster.

**Allowlist.** `allow.json` holds the hashes of matches that are not student
data: a person has looked at the line, or the hash equals a known synthetic
string (a run of digits at `ccpsnet.net`, say). Never put the matched text
in it. Exit status is 1 while any finding is left.

**CI gate (since 2026-10-20).** The `gas-lint` workflow runs the working-tree
scan on every push and pull request, so a new student-shaped address fails
the build. On 2026-10-20 the operator confirmed every remaining email
finding, in the tree and in history, as a placeholder (allowlisted), and
`--roster` found one real student name (`leader-hub/LH_04_EMAIL_AUDIT.md`),
removed from the tree by the operator. The same day, at the operator's
decision, `git filter-repo` replaced it in every past version (29 file
versions) and all branches and tags were force-pushed; a fresh clone scans
clean. GitHub Support then purged the read-only pull-request refs and
cached views, and the repo went public again. CI can't check names: run
`--roster` locally for each section after any change that adds example
text.

**What this scan does not read (2026-10-31).** It reads text files only
(`TEXT_EXT` in `check.js`), so binary files are never opened: no `.xlsx`,
`.docx`, `.pptx` or `.imscc`. That is how five Drive catalog workbooks
(`drive-curation/Drive_Curriculum_Catalog_v2.xlsx` to `_v6.xlsx`), each
with a "Sensitive Items" sheet naming student records, passed the
2026-10-20 scrub (KOS Audit Docket IV, Critical). At the operator's
decision on 2026-10-31 they were removed with `git filter-repo
--invert-paths` from every commit, and all branches and tags were
force-pushed. Every Office and zip file in history was then unpacked and
searched (student addresses, ID-shaped addresses, IEP, 504, "Sensitive
Items"); only those five matched. A clean result from this scan says
nothing about binary files until it unpacks them, which is planned.

**Log calls (warnings, since 2026-10-22).** The working-tree run also reads
every `Logger.log` / `console.*` call in `cas-ccps/scripts/` and warns when
one passes a student identifier, because the operator pastes Apps Script
logs into sessions. It matches only unambiguous names (`studentEmail`, `studentGoogleId`,
`studentName`, `googleId`, `sisLogin`, `student.email`, `student.name`,
and the same as properties), after blanking string literals. A plain
`email` is not matched: it is as often a teacher's address. Read the call
for those. Warnings print `path:line log-identifier (warning)` and don't
change the exit status. Log a row number, a count or a file ID instead.
