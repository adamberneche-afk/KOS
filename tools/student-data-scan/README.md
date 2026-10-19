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
in it. Exit status is 1 while any finding is left, so CI can gate on it once
the tree is clean.
