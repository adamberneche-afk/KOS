# NotebookLM sources

Markdown copies of the four user guides one directory up
(`../12_TeacherQuickStartGuide.html`, `../TEACHER_REFERENCE_GUIDE.html`,
`../STUDENT_QUICK_START.html`, `../USER_EXPERIENCE_REFERENCE.html`), the
upload sources for the "user guide" notebook.

**Why a separate copy.** A notebook accepts the `.html` files, but these
are self-styled pages (embedded styles, a sidebar, step numbers drawn as
badges, expand/collapse FAQs), and that chrome grounds worse than plain
Markdown. Each copy keeps the guide's headings, paragraphs, numbered steps,
callouts (as quotes), tables, glossaries and FAQ answers, and nothing else.
Each opens with "Notebook source: {NAME}." under its title, because
retrieval matches text, not titles.

**Generated, since 2026-10-23.** Don't edit these by hand: edit the HTML
guide, then run

    node tools/cas-ccps/build-guide-notebook-sources.js

and re-upload the changed files to the notebook. `--check` exits 1 when a
copy is out of date, and `tests/tools/guide-notebook-sources.test.js` fails
the build until the copies match. (They were hand conversions before, and
went stale when the guides were rewritten from the code in #254.)

`USER_EXPERIENCE_REFERENCE` is copied as written, including its own "out
of date" banner: the guide, not the copy, is what to fix.

This README is not a notebook source; only the four `.md` files beside it
are.
