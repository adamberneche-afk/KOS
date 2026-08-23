'use strict';
// A tiny in-memory fake of the exact three query shapes
// db.js's deductCredits/addCredits/markJobFailed issue against a real `pg`
// Pool/client — NOT a general SQL engine. It recognizes each real query by
// a distinguishing substring lifted directly from db.js's own source, so a
// future edit that changes the SQL text in a way that changes its meaning
// will make this fake fall through to its `unrecognized query` throw
// instead of silently validating the wrong thing.
//
// Modeled state: `users` (id -> { credit_balance }) and `jobs`
// (id -> { retry_count, status, error_message, next_retry_at, started_at }).

function makeFakePool(initial = {}) {
  const users = new Map(Object.entries(initial.users || {}).map(([id, u]) => [id, { ...u }]));
  const jobs = new Map(Object.entries(initial.jobs || {}).map(([id, j]) => [id, { ...j }]));
  const billingEventIds = new Set(); // stripe_event_id values already recorded

  function query(rawText, params = []) {
    // Real query text is multi-line and hand-formatted with irregular
    // indentation (e.g. "retry_count  = retry_count + 1" — two spaces, not
    // one). Matching against whitespace-collapsed text means this fake
    // only cares about which query it is, never how db.js happens to
    // format it.
    const text = rawText.replace(/\s+/g, ' ');

    // deductCredits: UPDATE users SET credit_balance = credit_balance - $1
    // ... WHERE id = $2 AND credit_balance >= $1 RETURNING credit_balance
    if (text.includes('credit_balance = credit_balance - $1') && text.includes('credit_balance >= $1')) {
      const [amount, userId] = params;
      const user = users.get(userId);
      if (!user || user.credit_balance < amount) return Promise.resolve({ rows: [] });
      user.credit_balance -= amount;
      return Promise.resolve({ rows: [{ credit_balance: user.credit_balance }] });
    }

    // addCredits step 1: INSERT INTO billing_events (...) VALUES (...)
    // ON CONFLICT (stripe_event_id) WHERE stripe_event_id IS NOT NULL DO NOTHING RETURNING id
    if (text.includes('ON CONFLICT (stripe_event_id)')) {
      const [, , , stripeEventId] = params;
      if (stripeEventId && billingEventIds.has(stripeEventId)) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (stripeEventId) billingEventIds.add(stripeEventId);
      return Promise.resolve({ rows: [{ id: 'evt-' + Math.random().toString(36).slice(2) }], rowCount: 1 });
    }

    // addCredits step 2a (idempotent replay): SELECT credit_balance FROM users WHERE id = $1
    if (text.includes('SELECT credit_balance FROM users WHERE id = $1')) {
      const [userId] = params;
      const user = users.get(userId);
      return Promise.resolve({ rows: [{ credit_balance: user ? user.credit_balance : null }] });
    }

    // addCredits step 2b: UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING credit_balance
    if (text.includes('credit_balance = credit_balance + $1')) {
      const [amount, userId] = params;
      const user = users.get(userId) || { credit_balance: 0 };
      user.credit_balance += amount;
      users.set(userId, user);
      return Promise.resolve({ rows: [{ credit_balance: user.credit_balance }] });
    }

    // markJobFailed: UPDATE jobs SET retry_count = retry_count + 1, ... status = CASE
    // WHEN $4 AND retry_count < $3 THEN 'queued' ELSE 'failed' END, next_retry_at = CASE ...
    if (text.includes('status = CASE') && text.includes('retry_count = retry_count + 1')) {
      const [jobId, errorMessage, maxRetries, retry] = params;
      const job = jobs.get(jobId);
      if (!job) return Promise.resolve({ rows: [] });
      const retryCountBefore = job.retry_count; // every SET expression sees the PRE-update row, matching real Postgres semantics
      job.retry_count = retryCountBefore + 1;
      job.error_message = errorMessage;
      const willRetry = Boolean(retry) && retryCountBefore < maxRetries;
      job.status = willRetry ? 'queued' : 'failed';
      job.next_retry_at = willRetry ? new Date(Date.now() + 30000 * 2 ** retryCountBefore) : null;
      job.started_at = null;
      return Promise.resolve({ rows: [{ ...job, id: jobId }] });
    }

    if (text.trim() === 'BEGIN' || text.trim() === 'COMMIT' || text.trim() === 'ROLLBACK') {
      return Promise.resolve({ rows: [] });
    }

    throw new Error('fake-pool: unrecognized query — ' + text.slice(0, 80));
  }

  const client = {
    query,
    release() {},
  };

  return {
    users,
    jobs,
    query,
    connect() { return Promise.resolve(client); },
  };
}

module.exports = { makeFakePool };
