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
    console.error('[migrate] Failed:', err.message);
    pool.end().finally(() => process.exit(1));
  });
