'use strict';
// ================================================================
// worker.js — Job processor
// ================================================================
// Runs on an interval, fetches the next queued job, runs inference,
// writes results back to the user's Drive, and records billing.
//
// In production this runs as a separate Cloud Run Job triggered
// by Cloud Scheduler every 2 minutes, or as a background thread
// in the same process as server.js.
// ================================================================

require('dotenv').config();

const db        = require('./db');
const google    = require('./google');
const inference = require('./inference');
const logger    = require('./logger');


// ── Worker loop ───────────────────────────────────────────────────

const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_MS || '15000'); // 15s

async function processNextJob() {
  let jobRecord = null;
  // Hoisted so the outer catch-all (unexpected errors anywhere below) can
  // still attempt a best-effort refund — see that catch block.
  let creditCost = 0;
  let creditsDeducted = false;

  try {
    // Atomically claim the next queued job
    jobRecord = await db.getNextQueuedJob();
    if (!jobRecord) return; // Queue empty

    const { job, user } = jobRecord;
    logger.info(`[Worker] Processing job ${job.id} | ${job.payload_type} | user ${user.email}`);

    creditCost = inference.getCreditCost(job.payload_type);
    const isUnlimited = user.subscription_status === 'unlimited';

    // ── Charge credits BEFORE doing any expensive work ────────────
    // FIXED (part 2 of the billing-race fix — see part 1's commit for
    // the fall-through fix this builds on): deduction used to happen
    // after inference, the Drive write, and the FLOW_COMPLETE signal —
    // by the time a failed deduction was caught, the expensive work was
    // already done and delivered, so a failed charge could only be
    // reacted to after the fact. Moved here instead, using
    // deductCredits()'s atomic `WHERE credit_balance >= $1` guard as the
    // real gate — replacing the old non-atomic `user.credit_balance <
    // creditCost` pre-check, which read a stale snapshot from job-claim
    // time and couldn't stop two workers racing on the same low-balance
    // user. If any downstream step now fails, the deducted credits are
    // refunded via refundAndFail() before marking the job failed.
    if (!isUnlimited) {
      try {
        await db.deductCredits(user.id, creditCost);
        creditsDeducted = true;
      } catch (deductErr) {
        await db.markJobFailed(job.id, 'Insufficient credits. User needs to purchase more.', false);
        logger.warn(`[Worker] Job ${job.id} failed: insufficient credits (${deductErr.message})`);
        return;
      }
    }

    // Refunds the just-deducted credits (no-op for unlimited-tier users,
    // who were never charged) before marking the job failed — every
    // downstream failure path below routes through this so a job that
    // doesn't actually complete never leaves the user permanently
    // charged for it.
    const refundAndFail = async (msg, retry) => {
      if (creditsDeducted) {
        try {
          await db.addCredits(user.id, creditCost, `Refund — job ${job.id} did not complete: ${msg}`);
        } catch (refundErr) {
          logger.error(`[Worker] Job ${job.id}: CREDIT REFUND FAILED (needs manual reconciliation): ${refundErr.message}`);
        }
      }
      await db.markJobFailed(job.id, msg, retry);
    };

    // ── Read session document from user's Drive ───────────────────
    let sessionText;
    try {
      sessionText = await google.readDocumentText(user, job.file_id);
    } catch (driveErr) {
      const msg = `Could not read Drive document: ${driveErr.message}`;
      await refundAndFail(msg, true);
      logger.error(`[Worker] Job ${job.id} drive error: ${msg}`);
      return;
    }

    if (!sessionText || sessionText.trim().length < 20) {
      await refundAndFail('Document is empty or too short to process.', false);
      return;
    }

    // ── Read operator context from their spreadsheet ──────────────
    let driveContext = { recentVectors: [], sessionCount: 0, sessionSummaries: [] };
    try {
      driveContext = await google.readOperatorContext(user, user.index_spreadsheet_id);
    } catch (ctxErr) {
      logger.warn(`[Worker] Job ${job.id}: could not read context (non-fatal): ${ctxErr.message}`);
    }

    // ── Assemble operator metadata ────────────────────────────────
    // In v1, operator metadata is stored as JSON in the user record.
    // In a future version, it can be read directly from the user's
    // CORE_THESIS document for richer context.
    const operatorMeta = {
      email:             user.email,
      operatorRole:      user.operator_role      || '',
      deploymentType:    user.deployment_type    || 'INDIVIDUAL',
      vision90Day:       user.vision_90_day      || '',
      adminGhost:        user.admin_ghost        || '',
      necessaryStruggle: user.necessary_struggle || '',
      relationalTargets: user.relational_targets || '',
      socraticThreshold: parseFloat(user.socratic_threshold  || '0.75'),
      themeArchitecture: parseFloat(user.theme_architecture  || '0.75'),
      themePedagogy:     parseFloat(user.theme_pedagogy      || '0.75'),
      themeFamilyAlign:  parseFloat(user.theme_family_align  || '0.75'),
      shadowMatrix:      user.shadow_matrix ? JSON.parse(user.shadow_matrix) : {},
    };

    // ── Run inference ─────────────────────────────────────────────
    let result;
    try {
      result = await inference.runInference({
        sessionText,
        payloadUid:   job.payload_uid,
        payloadType:  job.payload_type,
        operatorMeta,
        driveContext,
      });
    } catch (inferErr) {
      const msg = `Inference failed: ${inferErr.message}`;
      // Retry if it looks like a transient API error
      const isTransient = /rate limit|timeout|overloaded|503|529/i.test(inferErr.message);
      await refundAndFail(msg, isTransient);
      logger.error(`[Worker] Job ${job.id} inference error (retry=${isTransient}): ${msg}`);
      return;
    }

    // ── Write JSON back to the chunk document ─────────────────────
    try {
      await google.writeDocumentContent(user, job.file_id, result.outputString);
    } catch (writeErr) {
      const msg = `Could not write to Drive document: ${writeErr.message}`;
      await refundAndFail(msg, true);
      logger.error(`[Worker] Job ${job.id} write error: ${msg}`);
      return;
    }

    // ── Signal FLOW_COMPLETE in STAGING_PIPELINE ──────────────────
    try {
      await google.setFlowComplete(user, user.index_spreadsheet_id, job.payload_uid);
    } catch (sheetErr) {
      // Non-fatal but serious — the doc is written, the user can manually advance
      logger.error(`[Worker] Job ${job.id}: STAGING_PIPELINE update failed: ${sheetErr.message}`);
      // Still mark the job complete in our system — the inference succeeded
    }

    // ── Record billing ────────────────────────────────────────────
    // Credits were already deducted up front, before any expensive work
    // ran (see the "Charge credits" block above) — this is just the
    // audit-log write, so a failure here stays non-fatal, same as the
    // FLOW_COMPLETE signal above.
    try {
      await db.recordBillingEvent({
        userId:         user.id,
        jobId:          job.id,
        eventType:      `${job.payload_type.toLowerCase()}_processed`,
        creditsCharged: creditCost,
      });
    } catch (billingEventErr) {
      logger.error(`[Worker] Job ${job.id}: recordBillingEvent failed (non-fatal, credits already settled): ${billingEventErr.message}`);
    }

    // ── Mark job complete ─────────────────────────────────────────
    await db.markJobCompleted(job.id, {
      inputTokens:  result.inputTokens,
      outputTokens: result.outputTokens,
      modelUsed:    result.model,
    });

    logger.info(
      `[Worker] Job ${job.id} complete | ` +
      `${result.inputTokens}in + ${result.outputTokens}out tokens | ` +
      `${creditCost} credits charged`
    );

  } catch (unexpectedErr) {
    // Catch-all for anything not handled above
    logger.error(`[Worker] Unexpected error processing job:`, unexpectedErr);
    if (jobRecord?.job?.id) {
      // Best-effort refund: an unexpected error thrown after credits were
      // deducted (creditsDeducted is set right after that call succeeds)
      // but before this catch-all's own try/catch machinery could route
      // through refundAndFail() means the user would otherwise be
      // charged for a job that never completed.
      if (creditsDeducted) {
        await db.addCredits(
          jobRecord.user.id, creditCost,
          `Refund — job ${jobRecord.job.id} hit an unexpected error: ${unexpectedErr.message}`
        ).catch((refundErr) => {
          logger.error(`[Worker] Job ${jobRecord.job.id}: CREDIT REFUND FAILED (needs manual reconciliation): ${refundErr.message}`);
        });
      }
      await db.markJobFailed(jobRecord.job.id, `Unexpected error: ${unexpectedErr.message}`, true)
        .catch(() => {});
    }
  }
}


// ── Entry point ───────────────────────────────────────────────────

async function startWorker() {
  logger.info('[Worker] Starting job processor...');

  // Process immediately on start, then on interval
  await processNextJob();

  setInterval(async () => {
    try {
      await processNextJob();
    } catch (e) {
      logger.error('[Worker] Poll error:', e);
    }
  }, POLL_INTERVAL_MS);
}

// Run as standalone process or export for server.js integration
if (require.main === module) {
  startWorker().catch(err => {
    logger.error('[Worker] Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = { startWorker, processNextJob };
