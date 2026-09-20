'use strict';
// Executes every SQL-issuing function in db.js against a REAL PostgreSQL
// instance, rather than the in-memory fake pool test/credits.test.js uses.
//
// WHY THIS FILE EXISTS: getNextQueuedJob's RETURNING clause ended
// `RETURNING *, (SELECT * FROM users WHERE id = jobs.user_id) AS user_row`
// — a scalar subquery returning sixteen columns, which Postgres rejects
// outright with "subquery must return only one column". It failed at
// PARSE time, so it threw on every single call, not just when a job
// existed: the worker logged an error every poll interval and never
// processed a single job, with every submitted job stuck in 'queued'
// forever.
//
// Nothing could catch it. credits.test.js's fake pool recognises each
// query by a distinguishing substring and returns canned rows — by
// construction it cannot know whether the SQL it matched is valid, so
// the whole suite stayed green against a query no database would
// accept. The bug survived because the service has never been deployed;
// the first real `npm start` against a real database would have found it
// in fifteen seconds.
//
// So: the fake pool stays (it tests decision logic cheaply and needs no
// database), and this file covers the one thing it structurally cannot —
// that the SQL is real SQL. Every exported function that issues a query
// gets called at least once here. A new query that doesn't parse, or a
// column rename that misses a call site, fails here.
//
// SKIPS ENTIRELY when DATABASE_URL is unset, so `npm test` still works
// with no database. CI sets it (see .github/workflows/gas-lint.yml's
// test-inference-service job, which runs a postgres service container).
// To run locally:
//   createdb kostest
//   DATABASE_URL=postgresql://localhost/kostest \
//   TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32) npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const HAS_DB = !!process.env.DATABASE_URL;
const skip = HAS_DB
  ? false
  : 'DATABASE_URL not set — real-Postgres tests skipped (see this file\'s header)';

// token-crypto needs a key before db.js encrypts anything. Set a
// throwaway one for this process if the environment didn't supply it, so
// the suite doesn't fail for a reason unrelated to what it tests.
if (HAS_DB && !process.env.TOKEN_ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
}

const db = require(path.join(__dirname, '..', 'src', 'db.js'));
const tc = require(path.join(__dirname, '..', 'src', 'token-crypto.js'));

const SCHEMA_PATH = path.join(__dirname, '..', 'sql', 'schema.sql');

let seq = 0;
const uniq = (p) => `${p}-${process.pid}-${++seq}`;

// Applies schema.sql, then clears the tables. schema.sql is written to be
// re-runnable (CREATE TABLE IF NOT EXISTS etc.) except for its trigger,
// which has no IF NOT EXISTS — tolerated here so a repeat local run
// against an already-migrated database still works.
test.before(async () => {
  if (!HAS_DB) return;
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  try {
    await db.pool.query(sql);
  } catch (err) {
    if (!/already exists/i.test(err.message)) throw err;
  }
  await db.pool.query('TRUNCATE billing_events, jobs, users RESTART IDENTITY CASCADE');
});

// Per-test isolation, not just per-file: several tests below insert
// queued jobs and claim only some of them, so a leftover 'queued' row
// would be picked up by the next test's getNextQueuedJob and make it
// pass or fail for reasons that have nothing to do with what it asserts.
test.beforeEach(async () => {
  if (!HAS_DB) return;
  await db.pool.query('TRUNCATE billing_events, jobs, users RESTART IDENTITY CASCADE');
});

test.after(async () => {
  if (HAS_DB) await db.pool.end();
});

async function makeUser(overrides = {}) {
  return db.upsertUser({
    googleUserId: uniq('google'),
    email: `${uniq('user')}@example.com`,
    indexSpreadsheetId: 'sheet-abc',
    accessToken: 'access-plaintext',
    refreshToken: 'refresh-plaintext',
    tokenExpiry: new Date(Date.now() + 3600e3),
    ...overrides,
  });
}

// ── The regression this file was written for ─────────────────────

test('getNextQueuedJob executes at all — the query parses against a real database', { skip }, async () => {
  // This is the assertion that would have failed before the fix. It does
  // not need a job to exist: the old query threw at parse time, so an
  // empty queue was enough to reproduce it.
  const result = await db.getNextQueuedJob();
  assert.equal(result, null, 'an empty queue returns null rather than throwing');
});

test('getNextQueuedJob claims the oldest queued job, marks it processing, and attaches its user', { skip }, async () => {
  const user = await makeUser();
  await db.pool.query(
    `INSERT INTO jobs (user_id, payload_uid, file_id, status, queued_at)
     VALUES ($1, $2, 'file-old', 'queued', NOW() - interval '5 minutes'),
            ($1, $3, 'file-new', 'queued', NOW())`,
    [user.id, uniq('uid-old'), uniq('uid-new')]
  );

  const claimed = await db.getNextQueuedJob();
  assert.ok(claimed, 'a queued job must be claimed');
  assert.equal(claimed.job.file_id, 'file-old', 'oldest queued job goes first');
  assert.equal(claimed.job.status, 'processing');
  assert.ok(claimed.job.started_at, 'started_at is stamped on claim');
  assert.equal(claimed.user.id, user.id, 'the job\'s user is attached');
});

test('getNextQueuedJob skips a job whose next_retry_at has not elapsed', { skip }, async () => {
  const user = await makeUser();
  await db.pool.query(
    `INSERT INTO jobs (user_id, payload_uid, file_id, status, queued_at, next_retry_at)
     VALUES ($1, $2, 'backed-off', 'queued', NOW(), NOW() + interval '1 hour')`,
    [user.id, uniq('uid-backoff')]
  );
  assert.equal(await db.getNextQueuedJob(), null, 'a backed-off job must not be claimed early');
});

// ── Encryption, through a real database round trip ───────────────

test('tokens are stored as ciphertext and come back decrypted', { skip }, async () => {
  const user = await makeUser();
  assert.equal(user.refresh_token, 'refresh-plaintext', 'callers get plaintext back');

  const { rows } = await db.pool.query(
    'SELECT access_token, refresh_token FROM users WHERE id = $1', [user.id]
  );
  assert.ok(tc.isEncrypted(rows[0].refresh_token), 'the column holds the encrypted form');
  assert.ok(!rows[0].refresh_token.includes('refresh-plaintext'),
    'plaintext must not survive anywhere in the stored value');

  const found = await db.findUserByApiKey(user.api_key);
  assert.equal(found.refresh_token, 'refresh-plaintext', 'read path decrypts');
  assert.equal(found.access_token, 'access-plaintext');
});

test('updateUserTokens stores the new access token encrypted', { skip }, async () => {
  const user = await makeUser();
  await db.updateUserTokens(user.id, {
    accessToken: 'rotated-access', tokenExpiry: new Date(Date.now() + 3600e3),
  });

  const { rows } = await db.pool.query('SELECT access_token FROM users WHERE id = $1', [user.id]);
  assert.ok(tc.isEncrypted(rows[0].access_token));
  const reread = await db.findUserByGoogleId(user.google_user_id);
  assert.equal(reread.access_token, 'rotated-access');
});

// ── Every other query in db.js, executed once ────────────────────

test('user lookups and the spreadsheet-id backfill run', { skip }, async () => {
  const user = await makeUser({ indexSpreadsheetId: '' });
  assert.equal((await db.findUserByGoogleId(user.google_user_id)).id, user.id);
  assert.equal(await db.findUserByGoogleId('no-such-google-id'), null);
  assert.equal(await db.findUserByApiKey('no-such-api-key'), null);

  await db.setIndexSpreadsheetIdIfMissing(user.id, 'filled-in');
  assert.equal((await db.findUserByGoogleId(user.google_user_id)).index_spreadsheet_id, 'filled-in');

  await db.setIndexSpreadsheetIdIfMissing(user.id, 'should-not-overwrite');
  assert.equal((await db.findUserByGoogleId(user.google_user_id)).index_spreadsheet_id, 'filled-in',
    'an already-set spreadsheet id is never silently repointed');
});

test('credit deduction and top-up run, and deduction refuses to overdraw', { skip }, async () => {
  const user = await makeUser();
  await db.pool.query('UPDATE users SET credit_balance = 10 WHERE id = $1', [user.id]);

  assert.equal(await db.deductCredits(user.id, 4), 6, 'a spend within balance returns the new balance');
  // Refusal is a throw, not a falsy return — the atomic
  // `WHERE credit_balance >= $1` matches no row and deductCredits turns
  // that into an Error, which is what worker.js's deduct try/catch expects.
  await assert.rejects(() => db.deductCredits(user.id, 999), /Insufficient credits/);

  await db.addCredits(user.id, 25, 'test top-up', uniq('stripe-evt'));
  const { rows } = await db.pool.query('SELECT credit_balance FROM users WHERE id = $1', [user.id]);
  assert.equal(rows[0].credit_balance, 31, '10 - 4 + 25');
});

test('the job lifecycle queries all run: create, find, complete, fail, sweep, list, stats', { skip }, async () => {
  const user = await makeUser();
  const payloadUid = uniq('uid-lifecycle');

  const job = await db.createJob({
    userId: user.id, payloadUid, fileId: 'file-1',
    docUrl: 'https://docs.example/1', payloadType: 'SESSION_LOG',
  });
  assert.ok(job.id);

  const existing = await db.findActiveOrCompletedJob(user.id, payloadUid);
  assert.equal(existing.id, job.id, 'a resubmitted payload_uid finds the existing job');

  await db.markJobCompleted(job.id, { inputTokens: 100, outputTokens: 50, modelUsed: 'test-model' });

  const failing = await db.createJob({
    userId: user.id, payloadUid: uniq('uid-fail'), fileId: 'file-2',
    docUrl: null, payloadType: 'SESSION_LOG',
  });
  await db.markJobFailed(failing.id, 'a test failure', true);
  await db.markJobFailed(failing.id, 'a terminal failure', false);

  assert.ok(Array.isArray(await db.findStuckJobs(10)));
  assert.ok((await db.getJobsByUser(user.id, 20)).length >= 2);

  await db.recordBillingEvent({
    userId: user.id, jobId: job.id, eventType: 'session_processed', creditsCharged: 1,
  });

  const stats = await db.getUserStats(user.id);
  assert.ok(stats, 'getUserStats returns a row');
});
