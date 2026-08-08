'use strict';
// ================================================================
// billing.js — Stripe integration for subscriptions and credits
// ================================================================

const Stripe = require('stripe');
const db     = require('./db');
const logger = require('./logger');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Credit amounts per subscription tier
const TIER_CREDITS = {
  starter:      500,   // ~100 sessions/month
  professional: 2000,  // ~400 sessions/month (unlimited feel)
  creator:      2000,  // same as professional + TPT features
};

// Price ID → tier name map (set these in .env)
const PRICE_TO_TIER = {
  [process.env.STRIPE_PRICE_STARTER]:      'starter',
  [process.env.STRIPE_PRICE_PROFESSIONAL]: 'professional',
  [process.env.STRIPE_PRICE_CREATOR]:      'creator',
};


// ── Customer management ───────────────────────────────────────────

/**
 * Creates or retrieves a Stripe customer for the given user.
 * Stores the customer ID in the database.
 *
 * @param  {Object} user  User row from the database.
 * @returns {string} Stripe customer ID.
 */
async function getOrCreateStripeCustomer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe.customers.create({
    email:    user.email,
    metadata: { kos_user_id: user.id, google_user_id: user.google_user_id },
  });

  await db.pool.query(
    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
    [customer.id, user.id]
  );

  return customer.id;
}


// ── Checkout sessions ─────────────────────────────────────────────

/**
 * Creates a Stripe Checkout session for a subscription upgrade.
 *
 * @param  {Object} user      User row.
 * @param  {string} priceId   Stripe Price ID.
 * @param  {string} returnUrl URL to return to after checkout.
 * @returns {string} Checkout session URL.
 */
async function createSubscriptionCheckout(user, priceId, returnUrl) {
  const customerId = await getOrCreateStripeCustomer(user);

  const session = await stripe.checkout.sessions.create({
    customer:   customerId,
    mode:       'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url:  `${returnUrl}?status=cancelled`,
    metadata:    { kos_user_id: user.id },
    subscription_data: {
      metadata: { kos_user_id: user.id },
    },
  });

  return session.url;
}

/**
 * Creates a Stripe Checkout session for a one-time credit purchase.
 *
 * @param  {Object} user       User row.
 * @param  {number} credits    Number of credits to purchase.
 * @param  {number} priceInCents  Price in cents (e.g. 1000 = $10.00).
 * @param  {string} returnUrl  URL to return to after checkout.
 * @returns {string} Checkout session URL.
 */
async function createCreditPurchaseCheckout(user, credits, priceInCents, returnUrl) {
  const customerId = await getOrCreateStripeCustomer(user);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode:     'payment',
    line_items: [{
      price_data: {
        currency:     'usd',
        unit_amount:  priceInCents,
        product_data: {
          name:        `KOS Inference Credits — ${credits} credits`,
          description: `Processes approximately ${Math.floor(credits / 5)} sessions`,
        },
      },
      quantity: 1,
    }],
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url:  `${returnUrl}?status=cancelled`,
    metadata: {
      kos_user_id: user.id,
      credit_amount: String(credits),
      event_type: 'credits_purchased',
    },
  });

  return session.url;
}


// ── Webhook handler ───────────────────────────────────────────────

/**
 * Handles incoming Stripe webhook events.
 * Must be called with the raw request body (Buffer) for signature verification.
 *
 * @param  {Buffer} rawBody   Raw request body from Express.
 * @param  {string} signature Stripe-Signature header value.
 */
async function handleWebhook(rawBody, signature) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }

  logger.info(`[Billing] Webhook received: ${event.type}`);

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId  = session.metadata?.kos_user_id;
      if (!userId) break;

      if (session.mode === 'subscription') {
        // Subscription activated — grant monthly credits
        const tier    = PRICE_TO_TIER[session.subscription?.plan?.id] || 'starter';
        const credits = TIER_CREDITS[tier] || 500;
        await db.pool.query(
          `UPDATE users SET subscription_status = 'active', subscription_tier = $1 WHERE id = $2`,
          [tier, userId]
        );
        await db.addCredits(userId, credits, `Subscription activated: ${tier}`, event.id);
        logger.info(`[Billing] User ${userId} subscribed to ${tier}, ${credits} credits granted`);

      } else if (session.mode === 'payment') {
        // One-time credit purchase
        const credits = parseInt(session.metadata?.credit_amount || '0');
        if (credits > 0) {
          await db.addCredits(userId, credits, `Credits purchased: ${credits}`, event.id);
          logger.info(`[Billing] User ${userId} purchased ${credits} credits`);
        }
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      // Monthly subscription renewal — top up credits
      const invoice    = event.data.object;
      const customerId = invoice.customer;
      if (!customerId) break;

      const { rows } = await db.pool.query(
        'SELECT * FROM users WHERE stripe_customer_id = $1',
        [customerId]
      );
      if (rows.length === 0) break;

      const user    = rows[0];
      const tier    = user.subscription_tier || 'starter';
      const credits = TIER_CREDITS[tier] || 500;

      // Reset credits to tier amount (not additive — prevents hoarding)
      await db.pool.query(
        'UPDATE users SET credit_balance = $1 WHERE id = $2',
        [credits, user.id]
      );
      await db.pool.query(
        `INSERT INTO billing_events (user_id, event_type, credits_added, description, stripe_event_id)
         VALUES ($1, 'subscription_renewal', $2, $3, $4)`,
        [user.id, credits, `Monthly renewal: ${tier}`, event.id]
      );
      logger.info(`[Billing] User ${user.id} renewal: ${credits} credits reset`);
      break;
    }

    case 'customer.subscription.deleted': {
      // Subscription cancelled
      const subscription = event.data.object;
      const customerId   = subscription.customer;
      await db.pool.query(
        `UPDATE users SET subscription_status = 'cancelled', subscription_tier = 'free'
         WHERE stripe_customer_id = $1`,
        [customerId]
      );
      logger.info(`[Billing] Subscription cancelled for customer ${customerId}`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice    = event.data.object;
      const customerId = invoice.customer;
      await db.pool.query(
        `UPDATE users SET subscription_status = 'past_due' WHERE stripe_customer_id = $1`,
        [customerId]
      );
      logger.warn(`[Billing] Payment failed for customer ${customerId}`);
      break;
    }

    default:
      logger.info(`[Billing] Unhandled webhook type: ${event.type}`);
  }
}


// ── Credit bundle options ─────────────────────────────────────────

const CREDIT_BUNDLES = [
  { credits: 100,  priceInCents: 1000, label: '100 credits (~20 sessions) — $10' },
  { credits: 300,  priceInCents: 2500, label: '300 credits (~60 sessions) — $25' },
  { credits: 1000, priceInCents: 7000, label: '1,000 credits (~200 sessions) — $70' },
];

const SUBSCRIPTION_TIERS = [
  {
    id:          'starter',
    priceId:     process.env.STRIPE_PRICE_STARTER,
    name:        'Starter',
    priceMonth:  15,
    credits:     500,
    description: '~100 sessions/month',
  },
  {
    id:          'professional',
    priceId:     process.env.STRIPE_PRICE_PROFESSIONAL,
    name:        'Professional',
    priceMonth:  29,
    credits:     2000,
    description: '~400 sessions/month + priority processing',
  },
  {
    id:          'creator',
    priceId:     process.env.STRIPE_PRICE_CREATOR,
    name:        'Creator',
    priceMonth:  49,
    credits:     2000,
    description: '~400 sessions/month + TPT configuration + custom domains',
  },
];


module.exports = {
  getOrCreateStripeCustomer,
  createSubscriptionCheckout,
  createCreditPurchaseCheckout,
  handleWebhook,
  CREDIT_BUNDLES,
  SUBSCRIPTION_TIERS,
};
