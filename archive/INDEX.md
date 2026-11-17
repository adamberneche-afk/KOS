# Archive index

Superseded docs, kept word for word at their old paths under `archive/`
(so `meta/HANDOFF_2026-10-22.md` is `archive/meta/HANDOFF_2026-10-22.md`).
Git history follows each file across the move (`git log --follow`).

**Why here:** a search of the live tree shouldn't spend its reading on
them. The repo's root `.ignore` hides `archive/` from ripgrep, which
Claude Code's Grep and Glob use; git, CI, `release-check` and
`student-data-scan` still see every file.

**To read one:** open it by path. **To search them:** give the archive as
the path (`rg <pattern> archive/`, or Grep with `path: archive`), or
`rg --no-ignore <pattern>` for the whole repo.

**What a doc here is:** a record. It was true when written; links inside
it are relative to its old folder, and the code it names may have
changed. Where it disagrees with a live doc or the code, they win. The
agent notes from the archived handoffs are gathered, live, in
[`meta/AGENT_NOTES.md`](../meta/AGENT_NOTES.md).

**Adding to it:** `git mv <path> archive/<path>`, a line below, and the
live links and path mentions repointed in the same PR. Archived
2026-11-17 unless a line says otherwise.

## meta/

- [`meta/HANDOFF_2026-10-05.md`](meta/HANDOFF_2026-10-05.md) — Session handoff, 10-05 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-06.md`](meta/HANDOFF_2026-10-06.md) — Session handoff, 10-06 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-07.md`](meta/HANDOFF_2026-10-07.md) — Session handoff, 10-07 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-08.md`](meta/HANDOFF_2026-10-08.md) — Session handoff, 10-08 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-10.md`](meta/HANDOFF_2026-10-10.md) — Session handoff, 10-10 to 10-12 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-12.md`](meta/HANDOFF_2026-10-12.md) — Session handoff, 10-12 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-17.md`](meta/HANDOFF_2026-10-17.md) — Session handoff, 10-17 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-18.md`](meta/HANDOFF_2026-10-18.md) — Session handoff, 10-18 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-19.md`](meta/HANDOFF_2026-10-19.md) — Session handoff, 10-19 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-20.md`](meta/HANDOFF_2026-10-20.md) — Session handoff, 10-20 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-21.md`](meta/HANDOFF_2026-10-21.md) — Session handoff, 10-21 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-22.md`](meta/HANDOFF_2026-10-22.md) — Session handoff, 10-22: system state and open items then (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-24.md`](meta/HANDOFF_2026-10-24.md) — Session handoff, 10-24 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-27.md`](meta/HANDOFF_2026-10-27.md) — Session handoff, 10-27 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-28.md`](meta/HANDOFF_2026-10-28.md) — Session handoff, 10-28 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-29.md`](meta/HANDOFF_2026-10-29.md) — Session handoff, 10-29 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-10-31.md`](meta/HANDOFF_2026-10-31.md) — Session handoff, 10-31: the two history rewrites (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-11-01.md`](meta/HANDOFF_2026-11-01.md) — Session handoff, 11-01: #352-#373 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/HANDOFF_2026-11-08.md`](meta/HANDOFF_2026-11-08.md) — Session handoff, 11-02 to 11-09: #375-#417 (superseded; agent notes in meta/AGENT_NOTES.md)
- [`meta/CAS_BUG_HANDOFF_2026-10-16.md`](meta/CAS_BUG_HANDOFF_2026-10-16.md) — CAS bug handoff, 10-16: queue, timeout and backprop bugs then (point-in-time)
- [`meta/CAS_COGNITIVE_EXHAUST_2026-10-16.md`](meta/CAS_COGNITIVE_EXHAUST_2026-10-16.md) — Cognitive-exhaust suggestions, decided 10-17 and built
- [`meta/CAS_DESIGN_THREADS_2026-10-16.md`](meta/CAS_DESIGN_THREADS_2026-10-16.md) — CAS design threads, 10-16 (superseded by the plans)
- [`meta/DASHBOARD_WALKTHROUGH_2026-10-26.md`](meta/DASHBOARD_WALKTHROUGH_2026-10-26.md) — Dashboard walk-through checklist and findings, week of 10-26
- [`meta/UX_AUDIT_2026-10-22.md`](meta/UX_AUDIT_2026-10-22.md) — UX audit, 10-22 (point-in-time; still a notebook-context source)
- [`meta/PRODUCT_EXPERIENCE_GAP_AUDIT.md`](meta/PRODUCT_EXPERIENCE_GAP_AUDIT.md) — Product experience gap audit (point-in-time; still a notebook-context source)
- [`meta/AUDIT_DEAD_ENDS_2026-10-29.md`](meta/AUDIT_DEAD_ENDS_2026-10-29.md) — Dead-ends audit, 10-29; its actions went into PLAN_2026-11
- [`meta/SPRINT_DASHBOARD_2026-11.md`](meta/SPRINT_DASHBOARD_2026-11.md) — Teacher Dashboard sprint decided 10-27, built
- [`meta/SPRINT_LESSON_DOCS_2026-11.md`](meta/SPRINT_LESSON_DOCS_2026-11.md) — Lesson doc and agenda deck sprint, built (#309-#311)
- [`meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md`](meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md) — LeaderHub no-browser-storage plan, done 10-22
- [`meta/KOS_INGESTION_HARDENING_PLAN.md`](meta/KOS_INGESTION_HARDENING_PLAN.md) — kos-personal ingestion hardening plan, B/D/E built
- [`meta/LESSON_AUTHORING_PLAN_2026-10.md`](meta/LESSON_AUTHORING_PLAN_2026-10.md) — Lesson authoring plan, phases 1-2 built (#245, #246)
- [`meta/PSD_Version_Controlled_CAS_Workspace.md`](meta/PSD_Version_Controlled_CAS_Workspace.md) — Version-controlled workspace PSD, goals met (noted 11-01)
- [`meta/CODEBASE_REVIEW.md`](meta/CODEBASE_REVIEW.md) — Codebase review, August 2026 (stale; still a notebook-context source)

## kos-personal/

- [`kos-personal/HANDOFF_2026-09-28.md`](kos-personal/HANDOFF_2026-09-28.md) — kos-personal handoff, 09-28 (point-in-time)
- [`kos-personal/ONBOARDING_CLOSEOUT_2026-10-13.md`](kos-personal/ONBOARDING_CLOSEOUT_2026-10-13.md) — 21-day onboarding close-out review, 10-13
- [`kos-personal/STUDIO_REBIND_HANDOFF.md`](kos-personal/STUDIO_REBIND_HANDOFF.md) — Studio rebind handoff, closed 09-29 (never needed)
- [`kos-personal/rtp-core-router/RTP_CORE_ROUTER_V5_8.md`](kos-personal/rtp-core-router/RTP_CORE_ROUTER_V5_8.md) — RTP Core Router V5.8, replaced by V6.0
- [`kos-personal/rtp-core-router/notebook-plan/01_USER_STORIES.md`](kos-personal/rtp-core-router/notebook-plan/01_USER_STORIES.md) — RTP notebook plan: user stories (frozen 10-06)
- [`kos-personal/rtp-core-router/notebook-plan/02_PRD.md`](kos-personal/rtp-core-router/notebook-plan/02_PRD.md) — RTP notebook plan: PRD (frozen 10-06)
- [`kos-personal/rtp-core-router/notebook-plan/03_ADRs.md`](kos-personal/rtp-core-router/notebook-plan/03_ADRs.md) — RTP notebook plan: ADRs (frozen 10-06)
- [`kos-personal/rtp-core-router/notebook-plan/04_MIGRATION_AND_TEST_PLAN.md`](kos-personal/rtp-core-router/notebook-plan/04_MIGRATION_AND_TEST_PLAN.md) — RTP notebook plan: migration and test plan (frozen 10-06)
- [`kos-personal/rtp-core-router/notebook-plan/05_TEST_LOG.md`](kos-personal/rtp-core-router/notebook-plan/05_TEST_LOG.md) — RTP notebook plan: test log (closed 10-06)
- [`kos-personal/rtp-core-router/protocols/COLD_START_ORIENTATION.md`](kos-personal/rtp-core-router/protocols/COLD_START_ORIENTATION.md) — Cold-start orientation (dated snapshot)
- [`kos-personal/rtp-core-router/protocols/CURRENT_STATE_DRAFT_v2.md`](kos-personal/rtp-core-router/protocols/CURRENT_STATE_DRAFT_v2.md) — Current-state draft v2, 07-18 (never promoted)
- [`kos-personal/rtp-core-router/protocols/ZONE_SPECIFICATION_MIRROR_MATRIX_FLOW.md`](kos-personal/rtp-core-router/protocols/ZONE_SPECIFICATION_MIRROR_MATRIX_FLOW.md) — Zone specification (not a spec for anything built)
- [`kos-personal/rtp-core-router/protocols/Drive_Steward_Methodology_and_Prompt.md`](kos-personal/rtp-core-router/protocols/Drive_Steward_Methodology_and_Prompt.md) — Byte-identical copy of meta/Drive_Steward_Methodology_and_Prompt.md (the live one)

## leader-hub/

- [`leader-hub/LEADERHUB_EMAIL_SETUP.md`](leader-hub/LEADERHUB_EMAIL_SETUP.md) — LeaderHub email setup (superseded)
- [`leader-hub/LEADERHUB_HANDOFF.md`](leader-hub/LEADERHUB_HANDOFF.md) — LeaderHub handoff, 04-09 (historical)
- [`leader-hub/LEADERHUB_README.md`](leader-hub/LEADERHUB_README.md) — Old LeaderHub README (superseded by README.md)
- [`leader-hub/LEADERHUB_WIP.md`](leader-hub/LEADERHUB_WIP.md) — LeaderHub WIP tracker, stopped at Session 20 (later work in HISTORY.md)
- [`leader-hub/LH_04_GRADING_STRUCTURE.md`](leader-hub/LH_04_GRADING_STRUCTURE.md) — Grading structure, dated snapshot (LH_05_GRADING_STRUCTURE.md is current)
- [`leader-hub/LH_05_PACING_AND_GRADING.md`](leader-hub/LH_05_PACING_AND_GRADING.md) — Pacing and grading, dated snapshot

## cas-ccps/

- [`cas-ccps/docs/PLATFORM_DEPLOYMENT_GUIDE_OUTDATED.md`](cas-ccps/docs/PLATFORM_DEPLOYMENT_GUIDE_OUTDATED.md) — Old platform deployment guide (outdated; do not follow)
- [`cas-ccps/docs/REGISTRY_SHEET_SETUP.md`](cas-ccps/docs/REGISTRY_SHEET_SETUP.md) — Registry sheet setup, archived 11-17 with the AutoInstaller
- [`cas-ccps/forms/WarmUpResponseForm_setup.md`](cas-ccps/forms/WarmUpResponseForm_setup.md) — Warm-up response form setup, retired (D16, 11-01)

## drive-curation/

- [`drive-curation/Assumptions_Deep_Dive.md`](drive-curation/Assumptions_Deep_Dive.md) — Assumptions deep dive v1 (superseded by _v2)
