# The daily agenda deck (script 67)

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

`67_AgendaDeck.js` (Central Ledger and Teacher Dashboard, 2026-10-27; one
slide a day since 2026-11-19) keeps one Google Slides deck per school year,
"Agenda — 2026–27", in an *Agendas* folder, and adds one slide per school
day, newest first: no new file a day, and the deck becomes the record of
what each day took, for later pacing guides. Every course that meets that
day is on the same slide (the operator, 2026-11-19): with two, the date and
schedule run across the top, each course gets a column (its lesson and
day, its plan with each period's minutes, its first two learning targets),
and the bell schedule marks each course's periods ("8175 P1 · 8177 P4").
With one course meeting, the slide is that course's alone, laid out as
follows. Each slide holds everything for the day on one screen: the lesson and the day
("Day 2 of 3", "last day"), the schedule, **Today's plan** (each
itinerary block with its mode and each meeting period's minutes, then
"Before you go" when there is room), the **bell schedule** (the day's block
times in order, the course's blocks marked, the lunch waves when the 3rd
block meets: `BELL_SCHEDULE.times` in 00, Clover Hill's by default),
**Announcements** (what is due, from the same rule as the Student
Dashboard's cards, then the `AgendaAnnouncements` tab's rows: from, to,
course or `all`, text) and the lesson's **learning targets** (up to three "I
can" goals). Text is sized to fit its box and cut with "…" rather than
spilled. The speaker notes hold each block's detail (the teacher's script)
and a **YOUR NOTES** section for how the day went, kept when the slide is
remade. The blocks come from the lesson doc's itinerary table, so the
teacher's edits there carry in, or from the lesson's plan when no doc
exists; a multi-day lesson uses the plan's day for that meeting. Minutes
are the doc's column for the block on Schedule A or B; any other day fits
the A column to the period. Made by the nightly rollout for the next school
day (courses with it on) and by **Today's agenda** in 📅 Lessons, which
opens the deck at that day's slide (either course's button makes the same
day's slide); remaking a day replaces its slide in place. The `AgendaDecks`
tab records each day (`all`, date, deck, slide);
decks made before 2026-11-19, one a day, are left where they are.
`node tools/cas-ccps/render-agenda-slide.js <date> <lesson key>=<periods> [<lesson key>=<periods>]`
draws the slide as a PNG without Google (the same layout data), and lists
any box whose text would spill. Needs the presentations scope in the
Central Ledger and Teacher Dashboard.
