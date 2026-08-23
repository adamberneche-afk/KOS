'use strict';
// Regression tests for db.js's three most consequential functions:
// deductCredits (atomic check-then-spend), addCredits (Stripe webhook
// idempotency), and markJobFailed (the retry/backoff decision, whose own
// header comment documents a real production incident: a bare `retry`
// identifier in the SQL meant EVERY call to this function failed with
// "column \"retry\" does not exist", so a failed job never got marked
// failed OR requeued — it just sat stuck in 'processing' forever).
//
// db.js talks to a real `pg` Pool with no dependency-injection seam (no
// {pool} parameter — every function closes over the module-level `pool`
// const). Rather than requiring a real Postgres for what should be pure
// decision-logic tests, this monkey-patches db.js's own exported `pool`
// object's .query()/.connect() methods with the in-memory fake in
// test/fakes/fake-pool.js — `db.pool` and the `pool` every function
// actually closes over are the SAME object, so overwriting its methods
// here reaches every call site without touching db.js's source at all.
// This is why db.js's `pool` needs to stay in module.exports even though
// nothing outside this test file uses it directly.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeFakePool } = require('./fakes/fake-pool');

const db = require(path.join(__dirname, '..', 'src', 'db.js'));

// Swaps db.pool's query/connect for a fresh fake before each test, and
// restores the real ones after — so no test's fake state leaks into the
// next, and nothing here permanently disables the module for anything
// that imports it later in the same process.
function withFakePool(initial, fn) {
  const fake = makeFakePool(initial);
  const realQuery = db.pool.query;
  const realConnect = db.pool.connect;
  db.pool.query = fake.query;
  db.pool.connect = fake.connect;
  return Promise.resolve(fn(fake)).finally(() => {
    db.pool.query = realQuery;
    db.pool.connect = realConnect;
  });
}

// ── deductCredits ──────────────────────────────────────────────────────────

test('deductCredits succeeds and decrements the balance when there is enough credit', async () => {
  await withFakePool({ users: { u1: { credit_balance: 10 } } }, async () => {
    const newBalance = await db.deductCredits('u1', 4);
    assert.equal(newBalance, 6);
  });
});

test('deductCredits throws "Insufficient credits" and leaves the balance untouched when there isn\'t enough', async () => {
  await withFakePool({ users: { u1: { credit_balance: 3 } } }, async (fake) => {
    await assert.rejects(() => db.deductCredits('u1', 4), /Insufficient credits/);
    assert.equal(fake.users.get('u1').credit_balance, 3, 'a rejected deduction must not partially apply');
  });
});

// ── addCredits ─────────────────────────────────────────────────────────────

test('addCredits grants credit and records a billing event for a new Stripe event', async () => {
  await withFakePool({ users: { u1: { credit_balance: 0 } } }, async () => {
    const balance = await db.addCredits('u1', 100, 'credit purchase', 'evt_123');
    assert.equal(balance, 100);
  });
});

test('addCredits is idempotent under Stripe\'s at-least-once webhook redelivery: the SAME stripeEventId never grants credit twice', async () => {
  // Regression guard for exactly the bug db.js's own "FIXED" comment above
  // addCredits describes.
  await withFakePool({ users: { u1: { credit_balance: 0 } } }, async () => {
    const first = await db.addCredits('u1', 100, 'credit purchase', 'evt_dup');
    const redelivered = await db.addCredits('u1', 100, 'credit purchase', 'evt_dup');
    assert.equal(first, 100);
    assert.equal(redelivered, 100, 'a redelivered webhook must return the balance UNCHANGED, not credited again');
  });
});

test('addCredits with no stripeEventId (e.g. an admin adjustment) is never deduped — each call grants credit', async () => {
  await withFakePool({ users: { u1: { credit_balance: 0 } } }, async () => {
    const first = await db.addCredits('u1', 50, 'admin grant');
    const second = await db.addCredits('u1', 50, 'admin grant');
    assert.equal(first, 50);
    assert.equal(second, 100, 'two null-stripeEventId grants must both apply');
  });
});

test('addCredits with two DIFFERENT stripeEventIds both apply, in order', async () => {
  await withFakePool({ users: { u1: { credit_balance: 0 } } }, async () => {
    await db.addCredits('u1', 50, 'purchase A', 'evt_a');
    const balance = await db.addCredits('u1', 30, 'purchase B', 'evt_b');
    assert.equal(balance, 80);
  });
});

// ── markJobFailed ────────────────────────────────────────────────────────

test('markJobFailed with retry=true and retry_count below the max requeues the job with backoff, and clears started_at', async () => {
  await withFakePool({ jobs: { j1: { retry_count: 0, status: 'processing', started_at: new Date() } } }, async () => {
    const job = await db.markJobFailed('j1', 'temporary upstream error', true);
    assert.equal(job.status, 'queued');
    assert.equal(job.retry_count, 1);
    assert.equal(job.error_message, 'temporary upstream error');
    assert.equal(job.started_at, null);
    assert.ok(job.next_retry_at instanceof Date, 'a requeued job must get a backoff timestamp');
  });
});

test('markJobFailed with retry=true but retry_count already AT the max marks the job failed, not queued again', async () => {
  const MAX_JOB_RETRIES = 3;
  await withFakePool({ jobs: { j1: { retry_count: MAX_JOB_RETRIES, status: 'processing', started_at: new Date() } } }, async () => {
    const job = await db.markJobFailed('j1', 'still failing', true);
    assert.equal(job.status, 'failed');
    assert.equal(job.next_retry_at, null);
  });
});

test('markJobFailed with retry=false marks the job failed regardless of retry_count, with no backoff', async () => {
  await withFakePool({ jobs: { j1: { retry_count: 0, status: 'processing', started_at: new Date() } } }, async () => {
    const job = await db.markJobFailed('j1', 'unrecoverable error', false);
    assert.equal(job.status, 'failed');
    assert.equal(job.next_retry_at, null);
  });
});

test('markJobFailed increments retry_count exactly once per call, evaluated against the PRE-update value', async () => {
  await withFakePool({ jobs: { j1: { retry_count: 2, status: 'processing' } } }, async () => {
    // MAX_JOB_RETRIES defaults to 3 (process.env.MAX_JOB_RETRIES unset) - a
    // job entering this call at retry_count=2 must still be allowed to
    // retry once more (2 < 3), landing at retry_count=3, not be judged
    // against its POST-increment count.
    const job = await db.markJobFailed('j1', 'flaky', true);
    assert.equal(job.retry_count, 3);
    assert.equal(job.status, 'queued');
  });
});
