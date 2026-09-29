'use strict';
// Handlers used to answer every failure with the raw err.message, sending
// database and upstream error text to the caller. See src/http-errors.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestError, INSUFFICIENT_CREDITS, describeError, sendError } = require('../src/http-errors');
const billing = require('../src/billing');

function fakeRes() {
  return { code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

test('an internal error is logged with a reference; the caller gets only the reference', () => {
  const logged = [];
  const res = fakeRes();
  sendError({ error: (...a) => logged.push(a) }, res,
    new Error('relation "users" does not exist at character 15'), 'Job creation');
  assert.equal(res.code, 500);
  assert.equal(res.body.error, 'Internal server error');
  assert.match(res.body.ref, /^[0-9a-f]{8}$/);
  assert.doesNotMatch(JSON.stringify(res.body), /relation|users/);
  assert.equal(logged.length, 1);
  assert.match(logged[0][0], new RegExp('ref ' + res.body.ref));
});

test('errors the caller can act on keep their message', () => {
  assert.deepEqual(describeError(new BadRequestError('Unknown credit bundle: 7')).body, { error: 'Unknown credit bundle: 7' });
  assert.equal(describeError(new BadRequestError('x')).status, 400);
  const credits = describeError(new Error(INSUFFICIENT_CREDITS));
  assert.equal(credits.status, 402);
  assert.deepEqual(credits.body, { error: 'Insufficient credits' });
});

test('billing throws the same BadRequestError class the mapper recognizes', () => {
  assert.equal(billing.BadRequestError, BadRequestError);
});

test('billing loads without STRIPE_SECRET_KEY; only a Stripe call needs it', () => {
  const { execFileSync } = require('child_process');
  const path = require('path');
  const env = { ...process.env };
  delete env.STRIPE_SECRET_KEY;
  const out = execFileSync(process.execPath,
    ['-e', "require('" + path.join(__dirname, '..', 'src', 'billing.js').replace(/\\/g, '/') + "'); console.log('ok')"],
    { env, encoding: 'utf8' });
  assert.equal(out.trim(), 'ok');
});
