# Legacy pre-v8 material

Archived, not deleted, during Round 3 reconciliation — a large reupload
batch turned out to contain several genuinely historical/superseded KOS
generations plus one earlier full RTP prototype. None of this is live or
referenced by the current `kos-personal/` system; it's kept for the
historical record, same convention as every other `archived/` directory
in this repo.

## `kos-master-versions/`

Pre-v8.0 KOS/RTP generations: `KOS_MASTER_v3.0.gs` through `v3.1`,
`KOS_MASTER_CHUNK1-7.gs`, `KOS_MASTER_v6/v7/v7_1/v8_PART_A-D.gs`,
`RTP_MASTER_SYSTEM.gs` (+ `_v1.2`), `RTP_REFINERY_DEPLOYER.gs` (+
`v2.1`-`v2.3`), `Vector_Router.gs`, `KOS_IP_PROTECTION_PART_D.gs`,
`KOS_LICENSE.gs`, `CE_Naming_Convention_SMP001.docx`, and a standalone
`LICENSE`. Confirmed genuinely historical, not just version-number
coincidence — every file, **including the highest-numbered ones**
(`KOS_MASTER_v8_PART_A-D.gs`, `RTP_REFINERY_DEPLOYER_v2.3.gs`), self-
identifies via header text as bound to a single Drop Zone Google Doc, a
fundamentally different, older, monolithic-paste-order architecture than
the real v8.0 system (folder-based sensors, no Drop Zone doc). Verified
by reading headers, not assumed from filenames.

## `persona-drafts-unverified/`

`PERSONA_ARCHITECT_V5.md`, `PERSONA_DEVELOPER_V5.md`,
`PERSONA_CURATOR_V5.md`, `PERSONA_MUSE_V5.md`, `RTP_CORE_ROUTER_V5.5.md`,
`CE-SMP_Vector_Weight_Calculation_Engine_v1.0.md`,
`CURATOR_PROCESSING_PROMPT_V5.1.md` / `_V5.2.md`. The real
`rtp-core-router/` directory only has PDF versions of the four persona
files listed above (plus the Core Router) — these `.md` versions **could
not be byte-diffed** against the PDFs in the environment that investigated
them (no `pandoc` available). Format and structure strongly suggest same
content, but this is inference, not a confirmed match — flagged here as
an **open item for a future pass** (with `pandoc` or equivalent
available) rather than silently promoted to replace the working PDFs.
`PERSONA_ALIGNMENT_V5.md` and `PERSONA_AUDITOR_V5.md` are **not** in this
folder — those two were confirmed byte-content-identical (diff showed
only typography/formatting) to the real repo's already-filed `.md`
versions, so no duplicate copy was kept.

## `RTP_Full_Build/`

An earlier RTP prototype — Python (`create_documents.py`, `setup.py`) +
Apps Script (`Council_Simulator.gs`, `Genesis_Module.gs`,
`Governance_Engine.gs`, `Intake_Pipeline.gs`, `Vector_Router.gs`) +
`RTP_Deployment_Guide.docx`. Confirmed superseded: uses Gemini (not
Claude), Google Form intake (not Drive sensors), and a 3-persona council
(not the real system's 6-cog + RTP roster).

## `KOS_v8_Sprint/` and `KOS_v8_integrated/`

Pre-reconciliation exploratory design drafts (`10_KOS_Extensions.gs`,
`11_Studio_Prompt_Engine.gs`, `PATCH_D_WebApp_UI.html`,
`PATCH_F_PromptHealth_UI.html`, `SPRINT_PATCHES.md`, plus
`KOS_v8_integrated/` also has a full pre-reconciliation 1-11 numbered
file set). `10_KOS_Extensions.gs` proposes a simpler Turnstile that
name-collides with the real, more advanced `10_Turnstile.gs` — would be a
duplicate-function compile error if ever added to the live project — and
a 25-variable "Mirror Matrix" that's a superseded design for the same
slot the real 5-question Shadow Matrix now fills (see
`rtp-core-router/protocols/ZONE_SPECIFICATION_MIRROR_MATRIX_FLOW.md`'s
banner for the naming-collision note). `11_Studio_Prompt_Engine.gs`'s
`[KOS_DATA_DRIP]` schema-quarantine mechanism is also unbuilt/superseded.
The two real, concrete improvements found in this cluster's diffs
(`2_Ingestion_Sensors.gs` cursor-based scan,
`4_Vector_Router.gs` back-fill fix + `NO_HEADERS` guard) were backported
into the live files — see `kos-personal/README.md`'s Round 3 section —
before this cluster was archived wholesale.

## `files_37_38_predraft/`

A separate, later pre-reconciliation draft (confirmed distinct from
`KOS_v8_Sprint`/`KOS_v8_integrated` — has additional docs those don't,
like `SCHEMA_REFERENCE.md`, `STUDIO_INTEGRATION_SPEC.md`,
`USER_GUIDE.md`, `LAUNCH_EXECUTION_GUIDE.md`). Includes a third
Turnstile variant (functionally similar to the real rebuild but different
attribution/comments — independent confirmation of the real rebuild's
design direction, not a competing design). Also includes
`1_Config_And_Deploy_EVEN_EARLIER_v5.4_ERA_DRAFT.gs` — a stray nested
file (`mnt/user-data/outputs/KOS_v8/1_Config_And_Deploy.gs` in the
original upload) that an earlier pass of this investigation assumed was a
meaningless sandbox-export artifact; on inspection it's a genuinely
distinct, even-earlier v5.4-era draft (different header, different
architecture notes, 767 vs. 960 lines) — real historical content, kept
rather than discarded. The service files that were also bundled in this
same upload (`Dockerfile`, `server.js`, etc.) are **not** here — those are
live, filed at `kos-personal/inference-service/` as a real optional
deployment path, not archived history.

## Discarded, not archived

One file from this batch was confirmed to be genuinely meaningless and
was not kept anywhere: a `❌`-named file whose entire content was the
two-byte string `"2"`.
