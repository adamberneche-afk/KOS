# leader-hub/archived/

Throwaway diagnostic scripts from the 2026-09-15 OAuth-consent-dialog
crash investigation — see `leader-hub/HISTORY.md`'s entry of that date
for the full writeup (what was ruled out, what the actual fix was).

These were used to generate one-off throwaway Apps Script test
deployments (bisecting how much of the real page, and which parts,
reproduced the crash) and were run from the repo root at the time, so
their relative paths (`path.join(__dirname, 'leader-hub', ...)`) assume
that location — they'd need adjusting to run again from here. Kept for
historical reference only; not part of any build or test path, and not
maintained going forward.
