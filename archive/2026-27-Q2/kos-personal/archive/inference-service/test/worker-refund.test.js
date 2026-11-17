'use strict';
// processNextJob() (src/worker.js) charges credits up front and refunds them
// if the job can't finish. refundAndFail() refunded, then marked the job
// failed; if that mark threw, the outer catch-all still saw creditsDeducted
// and refunded a second time, crediting the user twice.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const src = (f) => path.join(__dirname, '..', 'src', f);
const db = require(src('db.js'));
const google = require(src('google.js'));
const logger = require(src('logger.js'));
const { processNextJob } = require(src('worker.js'));

function patch(obj, fns) {
  const orig = {};
  for (const k of Object.keys(fns)) { orig[k] = obj[k]; obj[k] = fns[k]; }
  return () => Object.assign(obj, orig);
}

async function runWith({ markJobFailed }) {
  const refunds = [];
  const restore = [
    patch(db, {
      getNextQueuedJob: async () => ({
        job: { id: 'j1', payload_type: 'SESSION_LOG', file_id: 'f1' },
        user: { id: 'u1', email: 'a@b.c', subscription_status: 'active' },
      }),
      deductCredits: async () => 10,
      addCredits: async (userId, amount, desc) => { refunds.push({ userId, amount, desc }); },
      markJobFailed,
    }),
    patch(google, { readDocumentText: async () => { throw new Error('Drive down'); } }),
    patch(logger, { info() {}, warn() {}, error() {} }),
  ];
  try { await processNextJob(); } finally { restore.forEach((r) => r()); }
  return refunds;
}

test('a job that fails after the charge is refunded once', async () => {
  const refunds = await runWith({ markJobFailed: async () => {} });
  assert.equal(refunds.length, 1);
});

test('if marking the job failed throws after the refund, the user is still refunded only once', async () => {
  const refunds = await runWith({ markJobFailed: async () => { throw new Error('db connection lost'); } });
  assert.equal(refunds.length, 1, 'refunded ' + refunds.length + ' times');
});
