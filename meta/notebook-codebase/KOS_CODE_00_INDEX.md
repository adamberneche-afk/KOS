# KOS_CODE_00_INDEX — the KOS repo as notebook sources

Notebook source: KOS_CODE_00_INDEX.

This notebook holds the KOS repository (github.com/adamberneche-afk/KOS): three Google Apps Script systems on one school account, kos-personal (the Knowledge Operating System), cas-ccps (the CAS course system) and leader-hub (LeaderHub), plus the tools and tests that check them. Each source below is one slice of the repo. Every section heading names its source and the file path, so a cited passage says which file it came from. The repo on GitHub is the source of truth: these are generated copies, and the fingerprints below show whether a notebook copy matches the repo.

## KOS_CODE_00_INDEX · Sources

| Source | Covers | Files | Words | Fingerprint |
|---|---|---|---|---|
| `KOS_CODE_HISTORY` | Change history (may describe superseded behavior) | 3 | 51,513 | `45565a95c159` |
| `KOS_CODE_KOS_PERSONAL_SOURCE` | kos-personal: Apps Script source and the inference service | 44 | 128,696 | `fd93a97ee843` |
| `KOS_CODE_KOS_PERSONAL_DOCS` | kos-personal: docs, prompts, the RTP router and notebook plan | 34 | 75,486 | `4d01c31c8b35` |
| `KOS_CODE_CAS_CCPS_SOURCE_A` | cas-ccps: Apps Script source, scripts 00 to 29 | 32 | 109,821 | `4b10a74d5ae5` |
| `KOS_CODE_CAS_CCPS_SOURCE_B` | cas-ccps: Apps Script source, scripts 30 and up, Studio steps, forms and templates | 33 | 79,098 | `5f9980f86006` |
| `KOS_CODE_CAS_CCPS_CURRICULUM` | cas-ccps: unit rubrics and lesson cards | 36 | 28,466 | `e8e4ccbe3345` |
| `KOS_CODE_CAS_CCPS_DOCS` | cas-ccps: docs and guides | 25 | 66,085 | `8fd888be6799` |
| `KOS_CODE_LEADER_HUB_SOURCE` | leader-hub: Apps Script and page source | 27 | 162,514 | `24c454cbac7b` |
| `KOS_CODE_LEADER_HUB_DOCS` | leader-hub: docs | 23 | 62,369 | `a74a7f85b21a` |
| `KOS_CODE_TOOLS` | Repo tools, CI workflows and scripts | 49 | 73,562 | `acaed227bd9a` |
| `KOS_CODE_TESTS` | Tests and the GAS sandbox harness | 129 | 144,328 | `b5afc71dc0b6` |
| `KOS_CODE_META` | Repo-wide docs: handoffs, process, Drive curation | 37 | 63,907 | `d4c7eaf21c5a` |

## KOS_CODE_00_INDEX · Left out

- Archived and superseded files (`archive/`, `archived/`).
- Generated builds: `leader-hub/student-leader-hub.html` (built from `leader-hub/src/`), `cas-ccps/.clasp-build/`.
- Data and binary files: JSON, CSV, Office documents, Canvas cartridges, lockfiles.
- The persona docs (`PERSONA_*_V5_1.md` and their notebook editions), which are sources in the RTP notebook.
- No student data: the repo holds none by design (`cas-ccps/docs/FERPA_DATA_MAP.md`).

## KOS_CODE_00_INDEX · KOS_CODE_HISTORY

- `cas-ccps/HISTORY.md`
- `kos-personal/CHANGELOG.md`
- `leader-hub/HISTORY.md`

## KOS_CODE_00_INDEX · KOS_CODE_KOS_PERSONAL_SOURCE

- `kos-personal/10_Turnstile.gs`
- `kos-personal/11_Registrar_CogRelay.gs`
- `kos-personal/12_StudioReturnHarvest.gs`
- `kos-personal/13_StudioInputBuilder.gs`
- `kos-personal/14_StudioFlowBuildSpec.gs`
- `kos-personal/15_Preflight.gs`
- `kos-personal/16_FlowPrompts.gs`
- `kos-personal/17_DeployVersionReport.gs`
- `kos-personal/18_DeployVersionMarker.gs`
- `kos-personal/19_StagingRequeue.gs`
- `kos-personal/1_Config_And_Deploy.gs`
- `kos-personal/20_VectorClassifySessions.gs`
- `kos-personal/21_VectorMatrixRepair.gs`
- `kos-personal/22_BriefingDocs.gs`
- `kos-personal/2_Ingestion_Sensors.gs`
- `kos-personal/3_Queue_Processor.gs`
- `kos-personal/4_Vector_Router.gs`
- `kos-personal/5_Error_And_Utilities.gs`
- `kos-personal/6_Governance.gs`
- `kos-personal/7_WebApp.gs`
- `kos-personal/8_WebApp_UI.html`
- `kos-personal/9_UI_Diagnostics.gs`
- `kos-personal/inference-service/sql/migrate.js`
- `kos-personal/inference-service/sql/schema.sql`
- `kos-personal/inference-service/src/billing.js`
- `kos-personal/inference-service/src/db.js`
- `kos-personal/inference-service/src/flow-prompts.js`
- `kos-personal/inference-service/src/google.js`
- `kos-personal/inference-service/src/http-errors.js`
- `kos-personal/inference-service/src/inference.js`
- `kos-personal/inference-service/src/logger.js`
- `kos-personal/inference-service/src/server.js`
- `kos-personal/inference-service/src/token-crypto.js`
- `kos-personal/inference-service/src/worker.js`
- `kos-personal/inference-service/test/billing-pricing.test.js`
- `kos-personal/inference-service/test/credits.test.js`
- `kos-personal/inference-service/test/db-sql.test.js`
- `kos-personal/inference-service/test/fakes/fake-pool.js`
- `kos-personal/inference-service/test/google.test.js`
- `kos-personal/inference-service/test/http-errors.test.js`
- `kos-personal/inference-service/test/inference-classify.test.js`
- `kos-personal/inference-service/test/inference-content-blocks.test.js`
- `kos-personal/inference-service/test/token-crypto.test.js`
- `kos-personal/inference-service/test/worker-refund.test.js`

## KOS_CODE_00_INDEX · KOS_CODE_KOS_PERSONAL_DOCS

- `kos-personal/CURATOR_AUDITOR_PROMPT.md`
- `kos-personal/CURATOR_PROMPT.md`
- `kos-personal/DEPLOYMENT_GUIDE.md`
- `kos-personal/EXTERNAL_REFERENCE_Digital_Homesteading_TAIS.md`
- `kos-personal/HANDOFF_2026-09-28.md`
- `kos-personal/KOS_WHITE_PAPER.md`
- `kos-personal/README.md`
- `kos-personal/REGISTRAR_STAGE1_AUDITOR_PROMPT.md`
- `kos-personal/REGISTRAR_STAGE2_CURATOR_PROMPT.md`
- `kos-personal/SCHEMA_REFERENCE.md`
- `kos-personal/STUDIO_INTEGRATION_SPEC.md`
- `kos-personal/STUDIO_REBIND_HANDOFF.md`
- `kos-personal/USER_GUIDE.md`
- `kos-personal/VECTOR_CLASSIFY_PROMPT.md`
- `kos-personal/inference-service/INFERENCE_SERVICE_DEPLOYMENT.md`
- `kos-personal/inference-service/README.md`
- `kos-personal/rtp-core-router/README.md`
- `kos-personal/rtp-core-router/RTP_CORE_ROUTER_V5_8.md`
- `kos-personal/rtp-core-router/RTP_CORE_ROUTER_V6_0.md`
- `kos-personal/rtp-core-router/notebook-plan/01_USER_STORIES.md`
- `kos-personal/rtp-core-router/notebook-plan/02_PRD.md`
- `kos-personal/rtp-core-router/notebook-plan/03_ADRs.md`
- `kos-personal/rtp-core-router/notebook-plan/04_MIGRATION_AND_TEST_PLAN.md`
- `kos-personal/rtp-core-router/notebook-plan/05_TEST_LOG.md`
- `kos-personal/rtp-core-router/notebook-sources/README.md`
- `kos-personal/rtp-core-router/notebook-sources/TURN_LOOP_REFERENCE.md`
- `kos-personal/rtp-core-router/protocols/COLD_BOOT_PROTOCOL.md`
- `kos-personal/rtp-core-router/protocols/COLD_START_ORIENTATION.md`
- `kos-personal/rtp-core-router/protocols/CURRENT_STATE_DRAFT_v2.md`
- `kos-personal/rtp-core-router/protocols/Drive_Steward_Methodology_and_Prompt.md`
- `kos-personal/rtp-core-router/protocols/HEREDITARY_WATCHLIST.md`
- `kos-personal/rtp-core-router/protocols/KILL_SWITCH_PROTOCOL.md`
- `kos-personal/rtp-core-router/protocols/RULE_CONFLICT_RESOLUTION_PROTOCOL.md`
- `kos-personal/rtp-core-router/protocols/ZONE_SPECIFICATION_MIRROR_MATRIX_FLOW.md`

## KOS_CODE_00_INDEX · KOS_CODE_CAS_CCPS_SOURCE_A

- `cas-ccps/scripts/00_SharedConfig.js`
- `cas-ccps/scripts/01_StudentDoc_ContainerScript.js`
- `cas-ccps/scripts/02_Form1_IntakeAndWorkspaceGenerator.js`
- `cas-ccps/scripts/03_QueueBridge.js`
- `cas-ccps/scripts/04_Form2_TurnInGate.js`
- `cas-ccps/scripts/05_TeacherIntakePipeline.js`
- `cas-ccps/scripts/06_StagingPipeline_Turnstile.js`
- `cas-ccps/scripts/07_TeacherDashboard.js`
- `cas-ccps/scripts/08_TeacherConfirmationStep.js`
- `cas-ccps/scripts/09_StudentRevisionGuidance_M1Base.js`
- `cas-ccps/scripts/10_AdminRecoveryPanel.js`
- `cas-ccps/scripts/13_StudentDashboard.js`
- `cas-ccps/scripts/15_StudioFlowPrompts.js`
- `cas-ccps/scripts/15b_StudioFlowPrompts_Flow2_Revised.js`
- `cas-ccps/scripts/15c_Flow2DirectEvaluationService.js`
- `cas-ccps/scripts/16_UnifiedManualSetup.js`
- `cas-ccps/scripts/16_UnifiedManualSetup_M5_ADDENDUM_v2.js`
- `cas-ccps/scripts/16_UnifiedManualSetup_M6_ADDENDUM.js`
- `cas-ccps/scripts/17_MasterStudentTemplate.js`
- `cas-ccps/scripts/18_FormSubmitDispatcher.js`
- `cas-ccps/scripts/19_ClonedSheetConfig.js`
- `cas-ccps/scripts/20_SetupCheckpoint.js`
- `cas-ccps/scripts/21_AutoInstaller.js`
- `cas-ccps/scripts/22_LessonContextHandler.js`
- `cas-ccps/scripts/22b_CompetencyRegistryImporter.js`
- `cas-ccps/scripts/23_StudentProfileManager.js`
- `cas-ccps/scripts/24_WarmUpBridge.js`
- `cas-ccps/scripts/25_WarmUpWriter.js`
- `cas-ccps/scripts/26_CompetencyAlignmentLog.js`
- `cas-ccps/scripts/27_LessonFrameGenerator.js`
- `cas-ccps/scripts/28_Module2Setup.js`
- `cas-ccps/scripts/29_StudentContextAggregator.js`

## KOS_CODE_00_INDEX · KOS_CODE_CAS_CCPS_SOURCE_B

- `cas-ccps/scripts/30_SCRSuggestionEngine.js`
- `cas-ccps/scripts/30b_SCRRetryRemediation.js`
- `cas-ccps/scripts/31_PacingGuideManager.js`
- `cas-ccps/scripts/32_CompetencyRubricImporter.js`
- `cas-ccps/scripts/33_ArtifactCompetencyBridge.js`
- `cas-ccps/scripts/34_QueueWatchdog.js`
- `cas-ccps/scripts/35_FlowPreflightAndCanary.js`
- `cas-ccps/scripts/36_WeeklyParentReport.js`
- `cas-ccps/scripts/37_FlowInputBuilder.js`
- `cas-ccps/scripts/38_LedgerSchemaGuard.js`
- `cas-ccps/scripts/39_FlowFixtures.js`
- `cas-ccps/scripts/40_FlowPrompts.js`
- `cas-ccps/scripts/41_WarmUpFlowBridge.js`
- `cas-ccps/scripts/42_FlowBuildSpec.js`
- `cas-ccps/scripts/43_DeployVersionMarker_CentralLedger.js`
- `cas-ccps/scripts/44_DeployVersionMarker_UnifiedManual.js`
- `cas-ccps/scripts/45_DeployVersionMarker_MasterStudentTemplate.js`
- `cas-ccps/scripts/46_DeployVersionMarker_RubricResponseSheet.js`
- `cas-ccps/scripts/47_DeployVersionMarker_TeacherMatrixSheet.js`
- `cas-ccps/scripts/48_DeployVersionMarker_TeacherDashboard.js`
- `cas-ccps/scripts/49_DeployVersionMarker_StudentDashboard.js`
- `cas-ccps/scripts/50_StudentDataAccess.js`
- `cas-ccps/scripts/51_CourseYearBuilder.js`
- `cas-ccps/scripts/52_CanvasRosterImport.js`
- `cas-ccps/studio-steps/CommitRubricDraftStep.gs`
- `cas-ccps/studio-steps/CommitStudentEvaluationStep.gs`
- `cas-ccps/studio-steps/CreateWarmUpDocStep.gs`
- `cas-ccps/studio-steps/ExtractBridgeInputsStep.gs`
- `cas-ccps/studio-steps/ExtractWarmUpPromptTextStep.gs`
- `cas-ccps/studio-steps/FinalizeWarmUpScoreStep.gs`
- `cas-ccps/studio-steps/ReadInstructorConfigStep.gs`
- `cas-ccps/studio-steps/SelectWarmUpArchetypeStep.gs`
- `cas-ccps/studio-steps/StepsShared.gs`

## KOS_CODE_00_INDEX · KOS_CODE_CAS_CCPS_CURRICULUM

- `cas-ccps/curriculum/unit-rubrics/S0-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S0-U1_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S0-U2_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S0-U2_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S0-U3_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S0-U3_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S1-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S1-U1_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S1-U2_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S1-U2_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S1-U3_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S2-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S2-U1_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S2-U2_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S3-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S3-U1_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S3-U2_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S3-U2_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S4-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S4-U1_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S5-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S5-U1_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S5-U2_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S5-U2_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S6-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S6-U1_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S6-U2_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S6-U2_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S7-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S7-U2_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S7-U2_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S8-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S8-U1_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S8-U2_8177.md`
- `cas-ccps/curriculum/unit-rubrics/S9-U1_8175.md`
- `cas-ccps/curriculum/unit-rubrics/S9-U1_8177.md`

## KOS_CODE_00_INDEX · KOS_CODE_CAS_CCPS_DOCS

- `cas-ccps/DEPLOYMENT_HANDOFF.md`
- `cas-ccps/README.md`
- `cas-ccps/docs/ADMIN_DEPLOYMENT_WALKTHROUGH.html`
- `cas-ccps/docs/CAS_ContextualGates_DesignPrinciples.html`
- `cas-ccps/docs/CAS_Flow3_Flow4_Specification.html`
- `cas-ccps/docs/CAS_M2_DeploymentGuide.html`
- `cas-ccps/docs/CAS_M2_Schema.html`
- `cas-ccps/docs/CAS_M2_WarmUp_Schema.html`
- `cas-ccps/docs/CAS_Module2_Documentation_v2.0.html`
- `cas-ccps/docs/FERPA_DATA_MAP.md`
- `cas-ccps/docs/IMPACT_DASHBOARD.html`
- `cas-ccps/docs/LEADERHUB_CONNECTION_SETUP.md`
- `cas-ccps/docs/PLATFORM_DEPLOYMENT_GUIDE_OUTDATED.md`
- `cas-ccps/docs/PLATFORM_DOCUMENTATION.html`
- `cas-ccps/docs/REGISTRY_SHEET_SETUP.md`
- `cas-ccps/docs/STUDIO_FLOW_REFERENCE.html`
- `cas-ccps/docs/SYSTEM_ARCHITECTURE.html`
- `cas-ccps/docs/index.html`
- `cas-ccps/docs/notebooklm-sources/12_TeacherQuickStartGuide.md`
- `cas-ccps/docs/notebooklm-sources/README.md`
- `cas-ccps/docs/notebooklm-sources/STUDENT_QUICK_START.md`
- `cas-ccps/docs/notebooklm-sources/TEACHER_REFERENCE_GUIDE.md`
- `cas-ccps/docs/notebooklm-sources/USER_EXPERIENCE_REFERENCE.md`
- `cas-ccps/forms/WarmUpResponseForm_setup.md`
- `cas-ccps/studio-steps/README.md`

## KOS_CODE_00_INDEX · KOS_CODE_LEADER_HUB_SOURCE

- `leader-hub/AiPrompts.gs`
- `leader-hub/Code.gs`
- `leader-hub/Config.gs`
- `leader-hub/Data.gs`
- `leader-hub/DeployVersionMarker.gs`
- `leader-hub/DeployVersionReport.gs`
- `leader-hub/Diagnostics.gs`
- `leader-hub/EmailBridge.gs`
- `leader-hub/FlowOps.gs`
- `leader-hub/SCR.gs`
- `leader-hub/drive-tools/LH_8177_Rename.gs`
- `leader-hub/drive-tools/LH_AppManifestUpdater.py`
- `leader-hub/drive-tools/LH_DriveDocSplitter.gs`
- `leader-hub/src/00-shell-head.html`
- `leader-hub/src/01-styles.html`
- `leader-hub/src/02-error-handler.html`
- `leader-hub/src/03-markup-nav-dashboard-trips.html`
- `leader-hub/src/04-markup-modals-and-feature-views.html`
- `leader-hub/src/05-data-helpers-dashboard.html`
- `leader-hub/src/06-tasks-trips-and-modals-core.html`
- `leader-hub/src/07-events-email-members-goals.html`
- `leader-hub/src/08-permission-forms-archive-competency.html`
- `leader-hub/src/09-wbl-lessonplans-procurement-finance-esports.html`
- `leader-hub/src/10-command-engine-ai-and-widgets.html`
- `leader-hub/src/11-journal-cron-settings-and-sync.html`
- `leader-hub/src/12-integrations-pacing-subplan-brag.html`
- `leader-hub/src/13-markup-modals-tail.html`

## KOS_CODE_00_INDEX · KOS_CODE_LEADER_HUB_DOCS

- `leader-hub/ARCHIVE_INSIGHTS_FLOW_PROMPT.md`
- `leader-hub/BRAG_EMAIL_FLOW_PROMPT.md`
- `leader-hub/DEPLOYMENT_GUIDE.md`
- `leader-hub/EMAIL_COMPOSE_FLOW_PROMPT.md`
- `leader-hub/FIN_ANALYSIS_FLOW_PROMPT.md`
- `leader-hub/LEADERHUB_AI_FLOW_SETUP.md`
- `leader-hub/LEADERHUB_EMAIL_SETUP.md`
- `leader-hub/LEADERHUB_GEM_PROMPT.md`
- `leader-hub/LEADERHUB_HANDOFF.md`
- `leader-hub/LEADERHUB_PRINCIPLES.md`
- `leader-hub/LEADERHUB_README.md`
- `leader-hub/LEADERHUB_WIP.md`
- `leader-hub/LH_01_NAMING_CONVENTIONS.md`
- `leader-hub/LH_02_INTEGRATION_GUIDE.md`
- `leader-hub/LH_03_CANVAS_INTEGRATION_IDEAS.md`
- `leader-hub/LH_04_EMAIL_AUDIT.md`
- `leader-hub/LH_04_GRADING_STRUCTURE.md`
- `leader-hub/LH_05_GRADING_STRUCTURE.md`
- `leader-hub/LH_05_PACING_AND_GRADING.md`
- `leader-hub/LP_ASSIST_FLOW_PROMPT.md`
- `leader-hub/README.md`
- `leader-hub/WBL_INSIGHTS_FLOW_PROMPT.md`
- `leader-hub/drive-tools/LH_Drive_README.md`

## KOS_CODE_00_INDEX · KOS_CODE_TOOLS

- `.github/dependabot.yml`
- `.github/workflows/call-hub.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/deploy-drift.yml`
- `.github/workflows/gas-lint.yml`
- `.github/workflows/secrets-doctor.yml`
- `.github/workflows/watchdog.yml`
- `real-page-bisect-v2.js`
- `scripts/secrets-doctor.mjs`
- `tools/cas-ccps/build-canvas-cartridge.js`
- `tools/cas-ccps/build-unit-rubrics.js`
- `tools/cas-ccps/generate-flow-prompts.js`
- `tools/cas-ccps/lesson-cards.js`
- `tools/cas-ccps/sync-pacing-vocabulary.js`
- `tools/cas-ccps/zip.js`
- `tools/clasp-sync/DEPLOYMENT_RUNBOOK.md`
- `tools/clasp-sync/README.md`
- `tools/clasp-sync/SANDBOX_CI_SETUP.md`
- `tools/clasp-sync/run.ps1`
- `tools/clasp-sync/sync.js`
- `tools/coverage-gaps/README.md`
- `tools/coverage-gaps/check.js`
- `tools/deploy-drift/README.md`
- `tools/deploy-drift/check.js`
- `tools/deploy-drift/expected-marker.js`
- `tools/deploy-drift/stamp.js`
- `tools/doc-currency/README.md`
- `tools/doc-currency/check.js`
- `tools/flow-harness-sync/README.md`
- `tools/flow-harness-sync/sync-plausibility-phrases.js`
- `tools/gas-lint/README.md`
- `tools/gas-lint/check.js`
- `tools/html-lint/check.js`
- `tools/kos-personal/build-notebook-personas.js`
- `tools/kos-personal/generate-flow-prompts.js`
- `tools/leader-hub/generate-ai-prompts.js`
- `tools/leaderhub-build/README.md`
- `tools/leaderhub-build/build.js`
- `tools/leaderhub-build/hoist-declarations.js`
- `tools/leaderhub-build/js-lexer.js`
- `tools/leaderhub-build/lexer-invariants.js`
- `tools/leaderhub-build/order-declarations.js`
- `tools/leaderhub-build/split-script.js`
- `tools/leaderhub-build/strip-comments.js`
- `tools/leaderhub-build/verify-hoist.js`
- `tools/leaderhub-build/verify-strip.js`
- `tools/lib/escape-template-literal.js`
- `tools/notebook-codebase/build.js`
- `tools/watchdog/check.js`

## KOS_CODE_00_INDEX · KOS_CODE_TESTS

- `tests/cas-ccps/alignment-backfill.test.js`
- `tests/cas-ccps/artifact-sync-cron-health.test.js`
- `tests/cas-ccps/canvas-roster-import.test.js`
- `tests/cas-ccps/commit-rubric-draft-step.test.js`
- `tests/cas-ccps/commit-student-evaluation-step.test.js`
- `tests/cas-ccps/competency-evidence-retention.test.js`
- `tests/cas-ccps/competency-evidence-schema-compat.test.js`
- `tests/cas-ccps/course-year-builder.test.js`
- `tests/cas-ccps/create-warmup-doc-step.test.js`
- `tests/cas-ccps/deploy-version-report.test.js`
- `tests/cas-ccps/extract-bridge-inputs-step.test.js`
- `tests/cas-ccps/extract-warmup-prompt-text-step.test.js`
- `tests/cas-ccps/finalize-warmup-score-step.test.js`
- `tests/cas-ccps/flow-build-spec.test.js`
- `tests/cas-ccps/flow-fixtures.test.js`
- `tests/cas-ccps/flow-input-builder.test.js`
- `tests/cas-ccps/flow-preflight-and-canary.test.js`
- `tests/cas-ccps/flow-prompts.test.js`
- `tests/cas-ccps/flow2-canary.test.js`
- `tests/cas-ccps/flow2-direct-evaluation.test.js`
- `tests/cas-ccps/form1-intake-id-validation.test.js`
- `tests/cas-ccps/id-generation-collision.test.js`
- `tests/cas-ccps/leaderhub-connection-check.test.js`
- `tests/cas-ccps/ledger-retention.test.js`
- `tests/cas-ccps/ledger-schema-guard.test.js`
- `tests/cas-ccps/lesson-frame-generator.test.js`
- `tests/cas-ccps/lock-doc-after-submission.test.js`
- `tests/cas-ccps/normalize-lesson-date.test.js`
- `tests/cas-ccps/queue-watchdog.test.js`
- `tests/cas-ccps/reactivate-archived-term.test.js`
- `tests/cas-ccps/read-instructor-config-step.test.js`
- `tests/cas-ccps/review-queue-text-scrub.test.js`
- `tests/cas-ccps/school-year-scope.test.js`
- `tests/cas-ccps/scr-export-grid.test.js`
- `tests/cas-ccps/scr-retry-ownership.test.js`
- `tests/cas-ccps/scr-suggestion-engine.test.js`
- `tests/cas-ccps/select-warmup-archetype-step.test.js`
- `tests/cas-ccps/shared-config.test.js`
- `tests/cas-ccps/student-context-aggregator.test.js`
- `tests/cas-ccps/student-data-access-intake.test.js`
- `tests/cas-ccps/student-data-access-repair.test.js`
- `tests/cas-ccps/student-doc-service.test.js`
- `tests/cas-ccps/studio-steps-shared.test.js`
- `tests/cas-ccps/teacher-dashboard-inline-js.test.js`
- `tests/cas-ccps/teacher-dashboard-scr-review.test.js`
- `tests/cas-ccps/teacher-dashboard-turn-in-review.test.js`
- `tests/cas-ccps/warmup-bridge.test.js`
- `tests/cas-ccps/warmup-extra-credit-recheck.test.js`
- `tests/cas-ccps/warmup-flow-bridge.test.js`
- `tests/cas-ccps/warmup-queue-retention.test.js`
- `tests/cas-ccps/weekly-parent-report.test.js`
- `tests/harness/extract-lines.js`
- `tests/harness/gas-sandbox.js`
- `tests/harness/vm-run.js`
- `tests/kos-personal/asset-lookup-hardening.test.js`
- `tests/kos-personal/audit-gate.test.js`
- `tests/kos-personal/auto-council-check.test.js`
- `tests/kos-personal/briefing-docs.test.js`
- `tests/kos-personal/build-session-context.test.js`
- `tests/kos-personal/council-review-status.test.js`
- `tests/kos-personal/deploy-version-report.test.js`
- `tests/kos-personal/error-digest.test.js`
- `tests/kos-personal/error-log-once.test.js`
- `tests/kos-personal/error-log-volume.test.js`
- `tests/kos-personal/flow-prompts.test.js`
- `tests/kos-personal/governance-apply-mutation-ownership.test.js`
- `tests/kos-personal/governance-primer.test.js`
- `tests/kos-personal/incubator-decay.test.js`
- `tests/kos-personal/notebook-personas.test.js`
- `tests/kos-personal/pin-theme-to-core.test.js`
- `tests/kos-personal/preflight.test.js`
- `tests/kos-personal/queue-processor.test.js`
- `tests/kos-personal/registrar-validators.test.js`
- `tests/kos-personal/rtp-router-v6.test.js`
- `tests/kos-personal/sensor1-ingestion.test.js`
- `tests/kos-personal/staging-requeue.test.js`
- `tests/kos-personal/studio-flow-build-spec.test.js`
- `tests/kos-personal/studio-input-builder.test.js`
- `tests/kos-personal/studio-return-harvest.test.js`
- `tests/kos-personal/trigger-management.test.js`
- `tests/kos-personal/turnstile.test.js`
- `tests/kos-personal/vector-classify-sessions.test.js`
- `tests/kos-personal/vector-matrix-repair.test.js`
- `tests/kos-personal/vector-promotion-backfill.test.js`
- `tests/kos-personal/web-app-auth.test.js`
- `tests/kos-personal/write-classification-output-step.test.js`
- `tests/kos-personal/write-curator-output-step.test.js`
- `tests/leaderhub/ai-prompts.test.js`
- `tests/leaderhub/browser-entry-points.test.js`
- `tests/leaderhub/config-sync.test.js`
- `tests/leaderhub/data-sync.test.js`
- `tests/leaderhub/deploy-version-report.test.js`
- `tests/leaderhub/diagnostics.test.js`
- `tests/leaderhub/emailbridge-orgsync.test.js`
- `tests/leaderhub/escaping.test.js`
- `tests/leaderhub/finance-sales-log-escaping.test.js`
- `tests/leaderhub/flow-ops.test.js`
- `tests/leaderhub/org-share-code.test.js`
- `tests/leaderhub/org-sync-relay.test.js`
- `tests/leaderhub/pacing-and-calendar.test.js`
- `tests/leaderhub/school-calendar-defaults.test.js`
- `tests/leaderhub/scr-sync.test.js`
- `tests/leaderhub/sync-pending.test.js`
- `tests/leaderhub/webapp-auth.test.js`
- `tests/tools/canvas-cartridge.test.js`
- `tests/tools/claspignore-coverage.test.js`
- `tests/tools/coverage-gaps.test.js`
- `tests/tools/deploy-drift-check.test.js`
- `tests/tools/deploy-drift-expected-marker.test.js`
- `tests/tools/deploy-drift-stamp.test.js`
- `tests/tools/doc-currency-blocked-surfaces.test.js`
- `tests/tools/doc-currency-check.test.js`
- `tests/tools/flow-harness-sync.test.js`
- `tests/tools/gas-lint-bounded-loop.test.js`
- `tests/tools/gas-lint-flow-map.test.js`
- `tests/tools/gas-lint-gcp.test.js`
- `tests/tools/gas-lint-oauth-scope.test.js`
- `tests/tools/gas-lint-project-map.test.js`
- `tests/tools/gas-lint-scriptrun.test.js`
- `tests/tools/gas-lint-test-scope.test.js`
- `tests/tools/gas-lint-webapp-auth.test.js`
- `tests/tools/gas-sandbox-range.test.js`
- `tests/tools/html-lint-check.test.js`
- `tests/tools/leaderhub-build-lexer.test.js`
- `tests/tools/leaderhub-build-load-order.test.js`
- `tests/tools/leaderhub-build.test.js`
- `tests/tools/notebook-codebase.test.js`
- `tests/tools/unit-rubrics.test.js`
- `tests/tools/watchdog-check.test.js`

## KOS_CODE_00_INDEX · KOS_CODE_META

- `README.md`
- `drive-curation/00_MASTER_INDEX.md`
- `drive-curation/Assumptions_Deep_Dive.md`
- `drive-curation/Assumptions_Deep_Dive_v2.md`
- `drive-curation/DELETION_MANIFEST.md`
- `drive-curation/Drive_Organizational_Patterns.md`
- `drive-curation/Economics_of_Depth_White_Paper.md`
- `drive-curation/GEMINI_HANDOFF_INSTRUCTIONS.md`
- `drive-curation/README.md`
- `drive-curation/Recurring_Drive_Curation_Workflow.md`
- `drive-curation/Watch_List.md`
- `drive-curation/curriculum/Unit_1_Foundations_and_Professional_Development.md`
- `drive-curation/curriculum/Unit_2_Marketing_Environment_and_Business_Fundamentals.md`
- `drive-curation/curriculum/Unit_3_Economics_in_Marketing.md`
- `drive-curation/curriculum/Unit_4_Core_Functions_of_Marketing_and_Customer_Motivation.md`
- `drive-curation/curriculum/Unit_5_Marketing_Mix_Product_and_Price.md`
- `drive-curation/curriculum/Unit_6_Marketing_Mix_Place_and_Promotion.md`
- `drive-curation/curriculum/Unit_7_Customer_Service_and_Sales_Certification_Boot_Camp.md`
- `drive-curation/curriculum/Unit_8_Marketing_Research_and_Projects.md`
- `drive-curation/curriculum/Unit_9_Career_Readiness_Boot_Camp_and_Capstone.md`
- `drive-curation/curriculum/Unit_Cross_Reference_Links.md`
- `meta/CLASP_AND_APPS_SCRIPT.md`
- `meta/CODEBASE_REVIEW.md`
- `meta/Drive_Steward_Methodology_and_Prompt.md`
- `meta/FLOW_DOCTRINE.md`
- `meta/FLOW_INVENTORY.md`
- `meta/HANDOFF_2026-10-05.md`
- `meta/PROCESS_HARDENING_SPRINT.md`
- `meta/PRODUCT_EXPERIENCE_GAP_AUDIT.md`
- `meta/PSD_Version_Controlled_CAS_Workspace.md`
- `meta/README.md`
- `meta/VERSION_CONTROL_CONCEPTS.md`
- `meta/drive-steward-deploy/DriveSteward_Calibration.gs`
- `meta/drive-steward-deploy/DriveSteward_Scanner.gs`
- `meta/drive-steward-deploy/DriveSteward_SheetsSetup.gs`
- `meta/drive-steward-deploy/README.md`
- `meta/drive-steward-deploy/STUDIO_FLOW_SETUP.md`
