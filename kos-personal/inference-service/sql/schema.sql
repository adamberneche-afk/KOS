-- ================================================================
-- KOS Inference Service — PostgreSQL Schema
-- Run once against a fresh database: psql $DATABASE_URL -f schema.sql
-- ================================================================

-- Users registered with the inference service
CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_user_id       VARCHAR(255) UNIQUE NOT NULL,
  email                VARCHAR(255) NOT NULL,
  -- The user's BRAIN_TRUST_INDEX spreadsheet ID
  index_spreadsheet_id VARCHAR(255) NOT NULL,
  -- OAuth tokens for accessing the user's Drive on their behalf
  access_token         TEXT,
  refresh_token        TEXT NOT NULL,
  token_expiry         TIMESTAMPTZ,
  -- API key sent by KOS Turnstile when posting jobs
  api_key              VARCHAR(64) UNIQUE NOT NULL,
  -- Billing
  stripe_customer_id   VARCHAR(255),
  subscription_status  VARCHAR(50)  DEFAULT 'free',
  subscription_tier    VARCHAR(50)  DEFAULT 'free',
  credit_balance       INTEGER      DEFAULT 0,
  -- Metadata
  created_at           TIMESTAMPTZ  DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  DEFAULT NOW(),
  last_active_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- Inference jobs (one per STAGING_PIPELINE row processed)
CREATE TABLE IF NOT EXISTS jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Mirrors STAGING_PIPELINE columns
  payload_uid      VARCHAR(255) NOT NULL,
  file_id          VARCHAR(255) NOT NULL,
  doc_url          VARCHAR(512),
  payload_type     VARCHAR(50)  DEFAULT 'SESSION_LOG',
  -- Job lifecycle
  status           VARCHAR(50)  DEFAULT 'queued',
  -- queued → processing → completed | failed | retrying
  retry_count      INTEGER      DEFAULT 0,
  error_message    TEXT,
  -- Inference metadata
  input_tokens     INTEGER,
  output_tokens    INTEGER,
  model_used       VARCHAR(100),
  -- Timestamps
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  queued_at        TIMESTAMPTZ  DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ
);

-- Billing events (one per processed job)
CREATE TABLE IF NOT EXISTS billing_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id          UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  event_type      VARCHAR(50) NOT NULL,
  -- event_type: session_processed | council_processed | external_processed
  --             subscription_created | credits_purchased | credits_granted
  credits_charged INTEGER     NOT NULL DEFAULT 0,
  credits_added   INTEGER     NOT NULL DEFAULT 0,
  stripe_event_id VARCHAR(255),
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_jobs_user_status   ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_status_queued ON jobs(status, queued_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_billing_user       ON billing_events(user_id, created_at DESC);

-- FIXED: Stripe's webhook delivery is explicitly at-least-once -- nothing
-- stopped a redelivered checkout.session.completed or invoice.payment_succeeded
-- event from double-granting/double-resetting credits. Partial (not a
-- blanket UNIQUE) since stripe_event_id is legitimately NULL for
-- non-Stripe billing_events rows (e.g. db.js's recordBillingEvent(),
-- which logs a per-job credit charge with no Stripe event behind it).
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_events_stripe_event_id
  ON billing_events(stripe_event_id) WHERE stripe_event_id IS NOT NULL;

-- FIXED: idx_jobs_payload_uid used to be a plain (non-unique) index, so
-- nothing stopped a resubmitted payload_uid from creating a duplicate,
-- billable job row (see the index_spreadsheet_id fix in server.js's
-- POST /api/v1/jobs and db.js's findActiveOrCompletedJob for the full
-- failure this closes). Superseded by the partial unique index below;
-- dropped here so re-running this file (schema.sql is applied
-- idempotently via sql/migrate.js) cleans it up on an already-deployed
-- database instead of leaving it orphaned.
DROP INDEX IF EXISTS idx_jobs_payload_uid;

-- Partial, not a blanket UNIQUE(user_id, payload_uid): a payload_uid
-- whose only prior rows are 'failed' must still be allowed to create a
-- new row for a legitimate retry-as-new-job.
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_user_payload_uid_active
  ON jobs(user_id, payload_uid)
  WHERE status IN ('queued', 'processing', 'completed');

-- Auto-update updated_at on users
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
