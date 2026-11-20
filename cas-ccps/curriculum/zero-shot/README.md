# Zero-shot answers

One file per lesson in 55b (`<lesson key>.txt`): the answer a general-purpose
chatbot gives when a student pastes the whole assignment and asks it to do
it. Written 2026-11-20 from each lesson's student-facing prompt alone (55b's
`promptText`), never its rubric, milestones or definition of done, so the
answer is cold. Made-up text: no student wrote any of it.

`node tools/cas-ccps/build-zero-shot-answers.js` turns them into
`cas-ccps/scripts/39c_ZeroShotAnswers.js`; `39d_ZeroShotFixture.js` sends them
through Flow 2 (`installZeroShotFixture()`, `checkZeroShotFixture()`), and the
lesson report (69c) shows the result beside each lesson.

When a lesson's prompt changes enough that its answer no longer fits, rewrite
the answer the same way (from the prompt alone), rebuild 39c, and delete the
lesson's `ZeroShotResults` row so the next batch sends it again. A lesson
added to 55b needs an answer here too (`zero-shot-fixture.test.js` checks).
