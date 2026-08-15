'use strict';
// ================================================================
// db.js — PostgreSQL connection and query helpers
// ================================================================

const { Pool } = require('pg');
const crypto   = require('crypto');

// FIXED: this used to be `{ rejectUnauthorized: false }` unconditionally in
// production — Dockerfile sets NODE_ENV=production in every deployed
// container, so that wasn't a dev-only fallback, it was the deployed
// default. rejectUnauthorized: false means the connection is encrypted but
// not authenticated (no certificate-chain or hostname check) — MITM-able.
// Most managed Postgres providers (Cloud SQL, RDS, etc.) present a
// certificate chain the system CA store already trusts, so the common case
// needs nothing beyond `rejectUnauthorized: true`. If the target provider
// uses a private/self-signed CA instead, set DATABASE_CA_CERT to that CA's
// PEM contents (the cert text itself, not a file path — simplest to hold
// as a Cloud Run env var with no volume mount needed) and it's used to
// validate the chain instead of the system trust store.
function buildSslConfig() {
  if (process.env.NODE_ENV !== 'production') return false;
  return process.env.DATABASE_CA_CERT
    ? { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT }
    : { rejectUnauthorized: true };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});


// ── Users ────────────────────────────────────────────────────────

async function findUserByGoogleId(googleUserId) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE google_user_id = $1',
    [googleUserId]
  );
  return rows[0] || null;
}

async function findUserByApiKey(apiKey) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE api_key = $1',
    [apiKey]
  );
  return rows[0] || null;
}

async function upsertUser({ googleUserId, email, indexSpreadsheetId, accessToken, refreshToken, tokenExpiry }) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO users
       (google_user_id, email, index_spreadsheet_id, access_token,
        refresh_token, token_expiry, api_key, credit_balance)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (google_user_id) DO UPDATE SET
       email                = EXCLUDED.email,
       index_spreadsheet_id = EXCLUDED.index_spreadsheet_id,
       access_token         = EXCLUDED.access_token,
       refresh_token        = EXCLUDED.refresh_token,
       token_expiry         = EXCLUDED.token_expiry,
       last_active_at       = NOW()
     RETURNING *`,
    [
      googleUserId,
      email,
      indexSpreadsheetId,
      accessToken,
      refreshToken,
      tokenExpiry,
      apiKey,
      parseInt(process.env.FREE_CREDITS_ON_SIGNUP || '50'),
    ]
  );
  return rows[0];
}

async function updateUserTokens(userId, { accessToken, tokenExpiry }) {
  await pool.query(
    'UPDATE users SET access_token = $1, token_expiry = $2, last_active_at = NOW() WHERE id = $3',
    [accessToken, tokenExpiry, userId]
  );
}

// FIXED: nothing ever populated index_spreadsheet_id for MANAGED_SERVICE
// users (the OAuth callback's req.query.spreadsheet_id read was dead code
// — Google never echoes back arbitrary query params from /auth/connect).
// Backfilled instead from the job-submission payload, which does carry it
// now (see POST /api/v1/jobs). Only ever fills an empty value — never
// overwrites an already-set one, so a stale or misbehaving caller can't
// silently repoint a connected user's target spreadsheet.
async function setIndexSpreadsheetIdIfMissing(userId, spreadsheetId) {
  if (!spreadsheetId) return;
  await pool.query(
    `UPDATE users SET index_spreadsheet_id = $1
     WHERE id = $2 AND (index_spreadsheet_id IS NULL OR index_spreadsheet_id = '')`,
    [spreadsheetId, userId]
  );
}

async function deductCredits(userId, amount) {
  const { rows } = await pool.query(
    `UPDATE users
     SET credit_balance = credit_balance - $1, last_active_at = NOW()
     WHERE id = $2 AND credit_balance >= $1
     RETURNING credit_balance`,
    [amount, userId]
  );
  if (rows.length === 0) throw new Error('Insufficient credits');
  return rows[0].credit_balance;
}

async function addCredits(userId, amount, description, stripeEventId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FIXED: Stripe redelivers webhooks at-least-once; nothing here used
    // to check whether stripeEventId had already been processed, so a
    // redelivered checkout.session.completed event double-granted
    // credits. Insert first: the partial unique index on
    // billing_events.stripe_event_id (see schema.sql) makes this a
    // no-op INSERT if the event was already recorded, and the balance
    // update below is skipped entirely in that case rather than
    // crediting twice. stripeEventId is null for non-Stripe grants
    // (e.g. an admin adjustment), which the partial index deliberately
    // doesn't cover -- ON CONFLICT only ever applies when it's set.
    const inserted = await client.query(
      `INSERT INTO billing_events (user_id, event_type, credits_added, description, stripe_event_id)
       VALUES ($1, 'credits_added', $2, $3, $4)
       ON CONFLICT (stripe_event_id) WHERE stripe_event_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [userId, amount, description, stripeEventId]
    );

    if (stripeEventId && inserted.rowCount === 0) {
      const { rows: existing } = await client.query(
        'SELECT credit_balance FROM users WHERE id = $1', [userId]
      );
      await client.query('COMMIT');
      return existing[0].credit_balance;
    }

    const { rows } = await client.query(
      'UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING credit_balance',
      [amount, userId]
    );
    await client.query('COMMIT');
    return rows[0].credit_balance;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}


// ── Jobs ─────────────────────────────────────────────────────────

async function createJob({ userId, payloadUid, fileId, docUrl, payloadType }) {
  const { rows } = await pool.query(
    `INSERT INTO jobs (user_id, payload_uid, file_id, doc_url, payload_type, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')
     RETURNING *`,
    [userId, payloadUid, fileId, docUrl, payloadType || 'SESSION_LOG']
  );
  return rows[0];
}

// FIXED: closes the resubmit-as-new-job loop caused by index_spreadsheet_id
// always being empty (see setIndexSpreadsheetIdIfMissing above) — without
// this, a GAS instance whose FLOW_COMPLETE signal never landed would have
// its Turnstile staleness reset resubmit the same payload_uid as a brand
// new job every run, re-charging credits and re-running inference on a
// document already overwritten by the previous run. Checked before every
// insert in POST /api/v1/jobs; matches the partial unique index in
// schema.sql as defense-in-depth against the check-then-insert race.
async function findActiveOrCompletedJob(userId, payloadUid) {
  const { rows } = await pool.query(
    `SELECT * FROM jobs
     WHERE user_id = $1 AND payload_uid = $2 AND status IN ('queued', 'processing', 'completed')
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, payloadUid]
  );
  return rows[0] || null;
}

async function getNextQueuedJob() {
  // Atomic fetch-and-lock: grab the oldest queued job and mark it processing
  const { rows } = await pool.query(
    `UPDATE jobs
     SET status = 'processing', started_at = NOW()
     WHERE id = (
       SELECT id FROM jobs
       WHERE status = 'queued'
       ORDER BY queued_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *, (SELECT * FROM users WHERE id = jobs.user_id) AS user_row`
  );
  if (rows.length === 0) return null;
  // Fetch user separately for clarity
  const job = rows[0];
  const { rows: userRows } = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [job.user_id]
  );
  return { job, user: userRows[0] };
}

async function markJobCompleted(jobId, { inputTokens, outputTokens, modelUsed }) {
  await pool.query(
    `UPDATE jobs
     SET status = 'completed', completed_at = NOW(),
         input_tokens = $2, output_tokens = $3, model_used = $4
     WHERE id = $1`,
    [jobId, inputTokens, outputTokens, modelUsed]
  );
}

async function markJobFailed(jobId, errorMessage, retry = false) {
  const maxRetries = parseInt(process.env.MAX_JOB_RETRIES || '3');
  // FIXED: `retry` in the CASE expression was a bare, unbound SQL
  // identifier — Postgres parsed it as a reference to a column named
  // "retry", which doesn't exist on `jobs` (only `retry_count` does).
  // This failed with "column \"retry\" does not exist" on every single
  // call to markJobFailed (the CASE is parsed/planned regardless of the
  // JS boolean's value), which is every failure path in worker.js —
  // the UPDATE never ran, so a failed job's status was never set to
  // 'failed' or 'queued' and started_at was never cleared, leaving it
  // stuck in 'processing' forever with no error_message recorded. Bound
  // the JS `retry` parameter as $4 instead of interpolating it as SQL.
  const { rows } = await pool.query(
    `UPDATE jobs
     SET retry_count  = retry_count + 1,
         error_message = $2,
         status = CASE
           WHEN $4 AND retry_count < $3 THEN 'queued'
           ELSE 'failed'
         END,
         started_at = NULL
     WHERE id = $1
     RETURNING *`,
    [jobId, errorMessage, maxRetries, retry]
  );
  return rows[0];
}

async function getJobsByUser(userId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT * FROM jobs WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function recordBillingEvent({ userId, jobId, eventType, creditsCharged }) {
  await pool.query(
    `INSERT INTO billing_events (user_id, job_id, event_type, credits_charged)
     VALUES ($1, $2, $3, $4)`,
    [userId, jobId, eventType, creditsCharged]
  );
}


// ── Stats ────────────────────────────────────────────────────────

async function getUserStats(userId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'completed')  AS completed,
       COUNT(*) FILTER (WHERE status = 'failed')     AS failed,
       COUNT(*) FILTER (WHERE status IN ('queued','processing')) AS pending,
       SUM(input_tokens + output_tokens)             AS total_tokens
     FROM jobs WHERE user_id = $1`,
    [userId]
  );
  return rows[0];
}


module.exports = {
  pool,
  findUserByGoogleId,
  findUserByApiKey,
  upsertUser,
  updateUserTokens,
  setIndexSpreadsheetIdIfMissing,
  deductCredits,
  addCredits,
  createJob,
  findActiveOrCompletedJob,
  getNextQueuedJob,
  markJobCompleted,
  markJobFailed,
  getJobsByUser,
  recordBillingEvent,
  getUserStats,
};
