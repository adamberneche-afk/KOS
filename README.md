# KOS

This repository is a consolidation point for **two unrelated systems that
happen to share the "KOS" name**. They were built independently, use the
same underlying platform pattern (Google Apps Script + native Gemini
inference, no external hosting or API keys), and are kept as **separate
concerns** in this repo rather than merged.

Files arrive here piecemeal as they're uploaded across sessions — this
README and the per-system READMEs below are the index of what's been
consolidated so far and what's still missing. When new files show up, they
get filed into the matching subtree, not left loose at the root.

## [`kos-personal/`](./kos-personal/) — Knowledge Operating System v8.0

A personal AI-session knowledge pipeline: ingests one operator's AI working
sessions, extracts structured knowledge (decisions, action items, vector
weights, persona council verdicts), and routes it into a `BRAIN_TRUST_INDEX`
spreadsheet. Governed by an external orchestration layer (`RTP_CORE_ROUTER`)
that runs a 7-persona council with RID-weighted routing and a human-in-the-loop
firewall.

**Status:** documentation is complete; the actual `.gs`/`.html` project
files (`1_Config_And_Deploy.gs` through `10_Turnstile.gs`, `appsscript.json`,
`8_WebApp_UI.html`) have not been uploaded yet. The Studio integration that
closes the STAGING_PIPELINE loop is explicitly called out as unbuilt.

## [`cas-ccps/`](./cas-ccps/) — Classroom Agency System (CCPS)

A district-deployed (ccpsnet.net), FERPA-scoped, student-facing platform for
a CCPS Sports/Entertainment/Event Marketing course pair (courses 8175 &
8177). Students work inside a simulated student-run "conglomerate" business
across a 10-stage, 20-unit curriculum; the software layer logs lesson intent,
runs AI evaluation of student work, converts evidence into Student
Competency Record (SCR) rating suggestions, and aggregates each student's
activity into a living context document.

**Status:** Modules 2 and 4 are documented as production-ready. Module 3 is
mixed-confidence and gated on a Studio flow (Flow 2) that has never been
built, plus a missing `lesson_unit_id` column on `TeacherMatrix`. Module 1
(the base intake/grading pipeline everything else assumes) hasn't been
uploaded yet — see [`cas-ccps/README.md`](./cas-ccps/README.md) for the
full gap list.

## Still pending

More files are expected. Until they arrive, treat both systems above as
partially documented — neither has its complete source in this repo yet.
