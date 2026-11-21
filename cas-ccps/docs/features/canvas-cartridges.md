# Canvas course cartridges

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

`curriculum/canvas-cartridges/8175.imscc` and `8177.imscc` are Common
Cartridge 1.3 packages, one per course. Import one into its Canvas course
with Settings → Import Course Content → Common Cartridge 1.x Package. Each
holds a module per lesson the course has (above), in teaching order, with the
lesson's assignment: its student prompt without the Canvas title and
"Submission" lines, and directions to work in the student's CAS document for
the lesson, a link to the student's assignment dashboard to Submit for
Feedback, and directions to submit the document's link (Website URL, 100
points). The dashboard link is the Student Dashboard's one deployment URL,
from `data/deployment-urls.json`; it never changes, because the web app is
only ever versioned on that deployment. The lesson docs'
teacher sections (bell ringer, hook, grading tip) are not included, and dates
are not printed: they live in LessonSchedule. 8177's cartridge holds the 8177
lessons with an approved prompt.

There are no Canvas rubrics or outcomes; CAS evaluates the work. Rebuild
with `node tools/cas-ccps/build-canvas-cartridge.js` after changing a lesson
or an approved prompt; the tests fail while a committed cartridge is out of
date. (The pacing-guide unit builder, `buildCourse`, is kept and tested.)

**Turn-in codes (stage 4 of [`meta/TURN_IN_CODE_PLAN_2026-11.md`](../../../meta/TURN_IN_CODE_PLAN_2026-11.md), D17).**
`--turn-in <selector>` makes the selected lessons' assignments a text entry
(`<format type="text"/>`, which Canvas imports as Text Entry) whose
description opens with the turn-in instruction ("To turn this in: open your
assignment dashboard, answer the question about your feedback, then copy
your turn-in code and paste it here.") and whose **How to submit** asks for
the code. The selector is course codes and lesson ConfigIDs, comma-separated
(`8177`, or `CAS-8177-THE-HYPE-MACHINE,CAS-8175-L05`); there is no unit
selector, because the lesson data has no unit field, and a part is refused
(Canvas has one assignment per lesson). The build goes to
`canvas-cartridges/turn-in/` (git-ignored); without `--turn-in` the
committed cartridges don't change. Points stay 100; the cartridge sets no
assignment group, so move turn-in assignments to the formative group.

**Re-importing into a course that has the cartridge:** the earlier import's
modules are duplicated unless deleted first (2026-10-12), and a module with
submissions has to stay. So an assignment already in Canvas is switched **by
hand**, not by a re-import: `node tools/cas-ccps/build-canvas-cartridge.js
--turn-in <selector> --print` lists the assignments and the text to paste,
and for each one: Edit, the instruction at the top and the new How to submit
paragraph, Submission Type Online with only **Text Entry** checked, the
formative group, Save. Then put the same list in `TURN_IN_CODE_COURSES`
(it takes lessons since 2026-11-08), so only those assignments' cards offer
a code. The `--turn-in` cartridge is for a fresh import (a
new course shell, the next term, a new teacher's install). A later re-import
into a course whose assignments were switched must be built with the same
`--turn-in`, or it puts them back to Website URL.

**The week's cartridge, with due dates (2026-11-19).** Lessons were
opening before their Canvas assignment was posted, and there is no Canvas
API to post them. `buildWeeklyCanvasCartridge()` (79, Central Ledger;
`installWeeklyCanvasCartridge()` runs it Fridays about 2 p.m.,
`previewWeeklyCanvasCartridge()` writes nothing) makes one cartridge per
course, `Canvas <course> week of <date>.imscc` in the teacher folder, with
each lesson starting in the next 7 days (LessonSchedule, not held). Import
it as above. Each assignment is the full cartridge's, generated into
`79b_CanvasCartridgeData.js` by the same builder (`--check` covers it), as
a text entry when `TURN_IN_CODE_COURSES` covers the lesson, else Website
URL, plus Canvas's own settings block inside it (`<extensions><assignment>`,
which Canvas's Common Cartridge importer reads; from Canvas's source,
2026-11-19): **published**, 100 points, the submission type and the **due
date**, 11:59 p.m. on the school day before the course's next lesson starts
(none for the last dated lesson), in UTC. A lesson already in its course's
newest gradebook export is left out, since a re-import duplicates, and the
log lists it with the due date to set by hand. Not yet tried: an import
into a real Canvas course (do the first one in a sandbox course). The
nightly rollout's "Not on Canvas" warning (above) names a lesson the
cartridge would add.

Flow 2's Apps Script half has a self-provisioning canary
(`runFlow2Canary()` in `35_FlowPreflightAndCanary.js`) that stubs Studio out
deliberately — it verifies the code path, not the flow.
