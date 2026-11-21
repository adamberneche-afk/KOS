# Where settings come from

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

`getConfig_()` (`00_SharedConfig.js`) checks three places in order:
1. The project's own Script Properties.
2. For the Central Ledger ID only, the spreadsheet the project is attached to.
3. The Central Ledger's `_CONFIG` tab, for district-wide values: the admin
   folder and email, the Student Dashboard URL, the email domain, the
   leader-hub OAuth client ID, the master template IDs, and the switches
   and calendar every project shares: `PIVOT_ARCHETYPE_LOCK`,
   `MARKING_PERIOD_ENDS`, `FEEDBACK_AS_COMMENT`, `WARMUP_TEXT_BOX`,
   `ROLLOUT_AUTO_APPLY`, `REFLECTION_ON_SUBMIT`, `TURN_IN_CODE_COURSES`,
   `STUDIO_DAILY_RUN_LIMIT` and `FLOW2_PARALLEL_LANES`
   (`SHARED_CONFIG_KEYS` in `00`).

A project that is attached to the Ledger, or to a teacher's cloned sheet,
therefore needs no properties for these at all. The dashboards need only
`CENTRAL_LEDGER_SS_ID`. Per-teacher values and secrets are never read from
the shared tab. `seedLedgerConfigTab()` builds the tab from existing
properties; `showConfigSources()` shows where each value came from. See
[`docs/deployment/script-properties.md`](../deployment/script-properties.md#script-properties-reference)
for which properties are safe to delete afterwards.

**The school, from configuration (packaging step 1, 2026-11-01).** What used
to be written into the code is now read through `schoolProfile_()` (`00`,
"THE SCHOOL"). Each value is a shared key, so it can be set as a Script
Property or in the Ledger's `_CONFIG` tab, and today's school is the default
when a value is unset:
- `SCHOOL_COURSES` (`8175=marketing,8177=management`): the courses and a word
  that names each. It drives `schoolCourseOf_()`, the one course-from-name
  rule that 00, 24 and 51 share, and every "for each course" loop (53, 55, 65).
- `STUDENT_EMAIL_DOMAIN` (`ccpsnet.net`) and `STUDENT_ID_PATTERN` (`\d{7}`):
  what a student account looks like (29's `_studentIdPattern_()`,
  `studentIdRegex_()`).
- `STUDENT_MAIL_DOMAIN` and `STAFF_MAIL_DOMAIN`: the Family Mail Sentinel's
  student and staff mail.
- `EARLY_RELEASE_DAYS`, `SCHOOL_DAYS_OFF` and `BELL_SCHEDULE` (JSON: class
  minutes per schedule, labels, and a rotation by weekday): the calendar.
  They feed `bellScheduleFor_()`, the lesson doc and agenda deck, the
  ⚙ Settings day choices, and `isSchoolDay_()`, which the held-part count
  (68) uses. The days off are the Ledger's `NoSchoolDays` tab (the
  district calendar; add a snow day there) plus any extra in
  `SCHOOL_DAYS_OFF`, read the first time a day is checked. A date typed
  into `_CONFIG` is read as the `yyyy-MM-dd` it was typed as.

A value that doesn't parse falls back to its default and logs `[SCHOOL]`.
Some things stay course-specific on purpose:
- the lesson and unit data (53b, 55b);
- the pacing guide's `objective_8175` / `_8177` columns (31, 23, 28);
- 51's expected registry counts.

The Unified Manual's library ID is in the manifests and comes with the
install registry (step 3). `tests/cas-ccps/school-profile.test.js` pins the
defaults and checks each override.
