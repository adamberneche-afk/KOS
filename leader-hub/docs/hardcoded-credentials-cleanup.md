# Hardcoded-credentials cleanup (external product review, Finding 9)

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

Three real-PII surfaces in `student-leader-hub.html` got scrubbed to blank
defaults, matching the same "fresh adopter fills in Settings" pattern
`PROFILE_DEFAULTS` already used for `name`/`school`/`title`:

- **`decaChapterInfo`** — deleted outright. Confirmed dead: nothing in the
  app read it (its own comment already said so), and its identity fields
  duplicated `PROFILE` below it.
- **`PROFILE_DEFAULTS`** — `email`/`phone`/`supervisorEmail`/`adminEmail`/
  `attendanceCoordEmail` blanked to `''`. These are genuine reach-this-
  person credentials (not just a display name/title, which are left as
  illustrative defaults) — Settings → My Profile & School already has an
  input for each, unaffected by this change.
- **The Trips → Chapter Reference "Key Contacts" list** — used to be a
  hardcoded array of ~8 real people's names/phones/emails. Now reads from
  `getKeyContacts()`/`saveKeyContacts()` (`lh_keyContacts`, same convention
  as `PROFILE`: then localStorage, now a server config key), shipping
  empty by default. Edit it on the DECA hub (✏️ Edit, one per line: Name |
  Role | Phone | Email; since 2026-11-23). Never committed; saved only to
  your own deployment's Script Properties.

`EmailBridge.gs`'s `CONFIG.defaultBragTo` and `drive-tools/LH_DriveDocSplitter.gs`'s
four `sourceDocId` values got the same treatment — blanked/placeholder'd
with a fill-in-locally comment, matching `TARGET_FOLDER_ID`'s existing
convention in that same file.

Deliberately not touched at the time: real names and phone numbers in the
built-in trip and event records. Those records were removed on 2026-11-07
(see Settings → Clear Sample Data above); they remain in git history.
