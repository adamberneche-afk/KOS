'use strict';
// Regression tests for billing.js's pricing guards. /checkout/credits used
// to take both the credit count and the price from the request body, so
// {credits: 1000000, price_in_cents: 50} bought a million credits for 50
// cents. The price now always comes from CREDIT_BUNDLES. Subscriptions
// likewise grant credits only for a price this service is configured to
// sell; an unknown price used to fall back to the starter tier.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
process.env.STRIPE_PRICE_STARTER = 'price_starter_test';
process.env.STRIPE_PRICE_PROFESSIONAL = 'price_pro_test';
delete process.env.STRIPE_PRICE_CREATOR;

const billing = require(path.join(__dirname, '..', 'src', 'billing.js'));

test('resolveCreditBundle: only an exact bundle size resolves, with its own price', () => {
  const b = billing.resolveCreditBundle(300);
  assert.equal(b.credits, 300);
  assert.equal(b.priceInCents, 2500);
  assert.equal(billing.resolveCreditBundle('300').credits, 300);
  assert.equal(billing.resolveCreditBundle(1000000), null);
  assert.equal(billing.resolveCreditBundle(299), null);
  assert.equal(billing.resolveCreditBundle(undefined), null);
});

test('createCreditPurchaseCheckout: an unknown bundle is refused before Stripe is called', async () => {
  await assert.rejects(
    billing.createCreditPurchaseCheckout({ id: 'u1', email: 'a@b.c' }, 1000000, 'https://x'),
    billing.BadRequestError
  );
});

test('tierForPrice: configured prices map to their tier; anything else is null', () => {
  assert.equal(billing.tierForPrice('price_starter_test'), 'starter');
  assert.equal(billing.tierForPrice('price_pro_test'), 'professional');
  assert.equal(billing.tierForPrice('price_something_cheap'), null);
  // An unset env var used to become the literal key "undefined".
  assert.equal(billing.tierForPrice('undefined'), null);
  assert.equal(billing.tierForPrice(undefined), null);
  assert.equal(billing.tierForPrice('toString'), null);
});
