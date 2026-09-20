#!/usr/bin/env node
'use strict';
// ================================================================
// sql/migrate.js — applies schema.sql against DATABASE_URL
// ================================================================
// package.json's "migrate" script has pointed at this file since the
// service was first filed into this repo, but the file itself never
// existed — running `npm run migrate` failed immediately with a
// "Cannot find module" error. Both this service's own README and the
// root README documented this as a known gap and told operators to run
// `psql $DATABASE_URL -f schema.sql` by hand instead.
//
// schema.sql is entirely idempotent (CREATE TABLE IF NOT EXISTS
// throughout — see its own header), so no real migration-versioning
// machinery (up/down migrations, a migrations-history table) is needed
// to close this gap — this just wraps the same manual step in
// `npm run migrate`, using the exact same connection config as the rest
// of the service (db.js's pool, so it inherits that file's TLS/CA
// handling rather than reimplementing it).
// ================================================================

const fs   = require('fs');
const path = require('path');

// Checked before requiring db.js, because pg treats an undefined
// connectionString as "use the libpq defaults" and silently dials
// localhost:5432 instead of erroring. On a deployment with no
// DATABASE_URL that surfaced as an opaque connection failure against an
// address the operator never configured — and on Node 26 the failure is
// an AggregateError whose own .message is empty, so the log line read
// exactly "[migrate] Failed: " with nothing after it.
if (!process.env.DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is not set — refusing to run.');
  console.error('[migrate] Set it to the database connection string; see .env.example.');
  process.exit(1);
}

const { pool } = require('../src/db');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log(`[migrate] Applying ${path.relative(process.cwd(), schemaPath)}...`);
  await pool.query(sql);
  console.log('[migrate] Done.');
}

migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    // The whole error, not err.message: an AggregateError (which is what
    // a failed multi-address connect throws) carries its real causes in
    // .errors and has an empty .message, so logging only the message
    // printed a bare "[migrate] Failed:" and threw away the diagnosis.
    console.error('[migrate] Failed:', err);
    pool.end().finally(() => process.exit(1));
  });
