'use strict';
// ================================================================
// server.js — Express HTTP server
// ================================================================
// Endpoints:
//   GET  /health                   Health check
//   GET  /auth/connect             Redirect to Google OAuth
//   GET  /auth/callback            OAuth callback — stores tokens
//   POST /api/v1/jobs              New job from KOS Turnstile webhook
//   GET  /api/v1/jobs/:id          Job status
//   GET  /api/v1/account           Account status (credits, tier)
//   POST /api/v1/checkout/subscribe  Start subscription checkout
//   POST /api/v1/checkout/credits    Start credit purchase checkout
//   POST /webhooks/stripe            Stripe event webhook
// ================================================================

require('dotenv').config();

const express = require('express');
const crypto  = require('crypto');
const db      = require('./db');
const google  = require('./google');
const billing = require('./billing');
const logger  = require('./logger');
const { startWorker } = require('./worker');

const app  = express();
const PORT = process.env.PORT || 8080;


// ── Startup guards ───────────────────────────────────────────────
// FIXED: validateWebhookSignature (below) used to silently `return next()`
// whenever WEBHOOK_SECRET wasn't set — a dropped or misconfigured secret in
// a real deployment didn't fail loudly, it just turned off the one check
// that keeps /api/v1/jobs submissions authenticated, with no log line to
// notice by. Refusing to boot without the secret in production is the real
// fix; validateWebhookSignature's own check is defense in depth for any
// path that imports this module without going through app.listen.
if (process.env.NODE_ENV === 'production' && !process.env.WEBHOOK_SECRET) {
  logger.error('[Server] WEBHOOK_SECRET is required in production — refusing to start.');
  process.exit(1);
}


// ── Middleware ────────────────────────────────────────────────────

// Stripe webhooks need the raw body — must be before express.json()
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
// FIXED: validateWebhookSignature (below) used to recompute the HMAC over
// JSON.stringify(req.body) — a re-serialization of the already-parsed
// object, not the bytes the sender actually sent. Any difference between
// the sender's serialization and Node's (key order, number formatting,
// unicode escaping) broke the signature match for a legitimate request.
// The verify callback captures the exact raw bytes alongside the normal
// parsed body, so signature validation can be computed over what was
// actually transmitted.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});


// ── Auth middleware ───────────────────────────────────────────────

/**
 * Validates the KOS_INFERENCE_API_KEY header sent by the KOS Turnstile.
 * Used to authenticate job submissions from user instances.
 */
async function requireApiKey(req, res, next) {
  const key = req.headers['x-kos-api-key'];
  if (!key) return res.status(401).json({ error: 'Missing X-KOS-API-Key header' });

  const user = await db.findUserByApiKey(key).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Invalid API key' });

  req.user = user;
  next();
}

// ── OAuth CSRF state ──────────────────────────────────────────────
// Google's own authorization redirect only ever carries `code` (and
// whatever `state` we asked it to echo back) — nothing about it proves
// the callback landed on the same browser that started the flow. Without
// a state check, an attacker can start their OWN OAuth flow, capture the
// resulting `/auth/callback?code=...` URL (never following it themselves),
// and get a victim to open it instead. The victim's browser would then
// exchange the attacker's code, upsert a user row tied to the ATTACKER's
// Google identity, and show the victim an API key for that account — if
// the victim pastes it into their own KOS instance thinking they just
// connected their own account, their session data gets processed under
// (and inference output written into a spreadsheet controlled by) the
// attacker's account instead. The state cookie below is httpOnly and set
// only by this same origin, so an attacker cannot read or forge it —
// only a callback that arrives on the exact browser that visited
// /auth/connect can ever present a matching value.
//
// No session/cookie-parsing middleware exists in this app, and a single
// short-lived random token round-tripped through the browser doesn't
// need one — a tiny manual Cookie-header parse is all this needs.
const OAUTH_STATE_COOKIE = 'kos_oauth_state';

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function setOAuthStateCookie(res, value, maxAgeSeconds) {
  const parts = [
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/auth',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearOAuthStateCookie(res) {
  setOAuthStateCookie(res, '', 0);
}

/**
 * Validates the webhook signature from KOS Turnstile.
 * Prevents unauthorized job submissions.
 */
function validateWebhookSignature(req, res, next) {
  const signature = req.headers['x-kos-signature'];
  const secret    = process.env.WEBHOOK_SECRET;

  // FIXED: this used to skip auth entirely whenever WEBHOOK_SECRET wasn't
  // set. The startup guard above already refuses to boot in production
  // without it; this branch only exists for dev/test runs that import the
  // app directly. Fail closed instead of open if that guard is ever bypassed.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[Server] WEBHOOK_SECRET missing in production — rejecting webhook request.');
      return res.status(500).json({ error: 'Webhook auth not configured' });
    }
    logger.warn('[Server] WEBHOOK_SECRET not set — skipping webhook signature check (dev only).');
    return next();
  }

  if (!signature) {
    return res.status(401).json({ error: 'Missing X-KOS-Signature header' });
  }

  // Sign the actual raw request bytes (captured by express.json()'s
  // verify callback above), not a re-serialization of the parsed body —
  // see the FIXED note above for why that broke real signatures.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody || Buffer.alloc(0))
    .digest('hex');
  const expectedHeader = `sha256=${expected}`;

  // FIXED: was a plain `!==` comparison — not constant-time, unlike the
  // OAuth state check above which already uses timingSafeEqual for exactly
  // this reason. A length- or content-dependent comparison here leaks how
  // many leading bytes of a guessed signature are correct, letting an
  // attacker recover a valid signature byte-by-byte across many requests.
  const sigOk = signature.length === expectedHeader.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHeader));
  if (!sigOk) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  next();
}


// ── Health check ─────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  try {
    await db.pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'error', message: e.message });
  }
});


// ── OAuth flow ────────────────────────────────────────────────────

/**
 * Step 1: Redirect user to Google OAuth consent screen.
 * KOS Bootstrap screen shows a "Connect Inference Service" button
 * that opens this URL.
 */
app.get('/auth/connect', (req, res) => {
  const state = crypto.randomBytes(24).toString('hex');
  setOAuthStateCookie(res, state, 600); // 10 minutes — plenty for a consent-screen round trip
  const url = google.getAuthUrl(state);
  res.redirect(url);
});

/**
 * Step 2: Google redirects back here after the user authorizes.
 * Exchange the code for tokens, upsert the user, return the API key.
 * The API key is displayed to the user to paste into KOS Properties.
 */
app.get('/auth/callback', async (req, res) => {
  const { code, error, state } = req.query;
  const cookies = parseCookies(req);
  const expectedState = cookies[OAUTH_STATE_COOKIE];
  clearOAuthStateCookie(res); // single-use regardless of outcome below

  // Reject before ever exchanging a code if this callback didn't arrive on
  // the same browser that started the flow — see the CSRF note above.
  const stateOk = !!expectedState && !!state &&
    expectedState.length === state.length &&
    crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(state));
  if (!stateOk) {
    logger.error('[Auth] Callback rejected — missing or mismatched state param.');
    return res.status(400).send('This authorization link has expired or is invalid. Please start over from KOS.');
  }

  if (error) {
    return res.status(400).send(`Authorization failed: ${error}`);
  }
  if (!code) {
    return res.status(400).send('No authorization code received.');
  }

  try {
    const { tokens, userInfo } = await google.exchangeCodeForTokens(code);

    // We need the BRAIN_TRUST_INDEX spreadsheet ID.
    // In the first version, we ask the user to provide it after authorization.
    // A future version can scan their Drive for a file named BRAIN_TRUST_INDEX.
    const user = await db.upsertUser({
      googleUserId:        userInfo.id,
      email:               userInfo.email,
      indexSpreadsheetId:  req.query.spreadsheet_id || '',
      accessToken:         tokens.access_token,
      refreshToken:        tokens.refresh_token,
      tokenExpiry:         tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
    });

    // Return a simple confirmation page with the API key
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KOS Inference — Connected</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 480px; margin: 40px auto; padding: 20px; background: #111; color: #eee; }
          .card { background: #1c1c1c; border: 1px solid #2e2e2e; border-radius: 8px; padding: 24px; }
          h2 { color: #4ade80; margin-top: 0; }
          .key { font-family: monospace; background: #252525; padding: 10px 12px; border-radius: 4px; word-break: break-all; font-size: 13px; border: 1px solid #3a3a3a; }
          p { color: #888; font-size: 13px; line-height: 1.6; }
          .step { margin-top: 16px; }
          .step-num { color: #BA7517; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>✅ Connected to KOS Inference</h2>
          <p>Your Google account <strong>${userInfo.email}</strong> is now linked. Copy your API key below and add it to your KOS instance.</p>
          <div class="key">${user.api_key}</div>
          <div class="step">
            <p><span class="step-num">1.</span> In the Apps Script editor, go to <strong>Project Settings → Script Properties</strong></p>
            <p><span class="step-num">2.</span> Add property: <code>KOS_INFERENCE_API_KEY</code> = the key above</p>
            <p><span class="step-num">3.</span> Add property: <code>KOS_INFERENCE_SERVICE_URL</code> = <code>${req.protocol}://${req.get('host')}</code></p>
            <p><span class="step-num">4.</span> Re-run <code>setupAllTriggers()</code> in the editor</p>
          </div>
          <p style="margin-top:20px">You have <strong>${user.credit_balance} credits</strong> to start. Each session costs 5 credits.</p>
        </div>
      </body>
      </html>
    `);

  } catch (err) {
    logger.error('[Auth] Callback error:', err);
    res.status(500).send(`Connection failed: ${err.message}`);
  }
});


// ── Job submission (called by KOS Turnstile) ──────────────────────

/**
 * POST /api/v1/jobs
 * Called by the KOS Turnstile immediately after setting a row
 * to STUDIO_ACTIVE. Creates a job in the queue.
 *
 * Body: {
 *   payload_uid:          string,
 *   file_id:              string,
 *   doc_url:              string,
 *   payload_type:         'SESSION_LOG' | 'COG_STIMULUS' | 'EXTERNAL_DATA',
 *   index_spreadsheet_id: string  (this GAS instance's own Index spreadsheet
 *                                  ID — see setIndexSpreadsheetIdIfMissing)
 * }
 */
app.post('/api/v1/jobs', requireApiKey, validateWebhookSignature, async (req, res) => {
  const { payload_uid, file_id, doc_url, payload_type, index_spreadsheet_id } = req.body;

  if (!payload_uid || !file_id) {
    return res.status(400).json({ error: 'payload_uid and file_id are required' });
  }

  try {
    // FIXED: previously nothing ever populated users.index_spreadsheet_id
    // for MANAGED_SERVICE users, so setFlowComplete() below always failed
    // and every job resubmitted as a "new" one on the next Turnstile
    // staleness reset — silently re-charging credits and re-running
    // inference on a document the previous run had already overwritten.
    // Backfilling here (only when currently empty) closes that gap.
    if (index_spreadsheet_id) {
      await db.setIndexSpreadsheetIdIfMissing(req.user.id, index_spreadsheet_id);
    }

    // Idempotency guard: if GAS is resubmitting a payload_uid we've
    // already accepted, don't create a duplicate, billable job.
    const existing = await db.findActiveOrCompletedJob(req.user.id, payload_uid);
    if (existing) {
      if (existing.status === 'completed') {
        // The job actually finished on our side — GAS just never saw
        // FLOW_COMPLETE (this exact index_spreadsheet_id bug, or a
        // transient Sheets API error). Re-attempt only the completion
        // signal; do not re-run inference or re-charge credits.
        const spreadsheetId = index_spreadsheet_id || req.user.index_spreadsheet_id;
        if (spreadsheetId) {
          google.setFlowComplete(req.user, spreadsheetId, payload_uid).catch(e => {
            logger.error(`[Server] Re-signal FLOW_COMPLETE failed for ${payload_uid}: ${e.message}`);
          });
        }
        logger.info(`[Server] Job ${existing.id} already completed for ${payload_uid} — re-signaling only.`);
        return res.status(200).json({ job_id: existing.id, status: 'completed' });
      }
      // queued or processing — already in flight, don't duplicate.
      logger.info(`[Server] Job ${existing.id} already ${existing.status} for ${payload_uid} — not duplicating.`);
      return res.status(200).json({ job_id: existing.id, status: existing.status });
    }

    const job = await db.createJob({
      userId:      req.user.id,
      payloadUid:  payload_uid,
      fileId:      file_id,
      docUrl:      doc_url || '',
      payloadType: payload_type || 'SESSION_LOG',
    });

    logger.info(`[Server] Job created: ${job.id} for user ${req.user.email}`);
    res.status(201).json({ job_id: job.id, status: 'queued' });

  } catch (err) {
    logger.error('[Server] Job creation error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ── Job status ────────────────────────────────────────────────────

app.get('/api/v1/jobs/:id', requireApiKey, async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const j = rows[0];
    res.json({
      id:          j.id,
      status:      j.status,
      payload_type: j.payload_type,
      retry_count: j.retry_count,
      created_at:  j.created_at,
      completed_at: j.completed_at,
      error:       j.error_message || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Account ───────────────────────────────────────────────────────

app.get('/api/v1/account', requireApiKey, async (req, res) => {
  try {
    const stats = await db.getUserStats(req.user.id);
    res.json({
      email:               req.user.email,
      credit_balance:      req.user.credit_balance,
      subscription_status: req.user.subscription_status,
      subscription_tier:   req.user.subscription_tier,
      stats: {
        completed: parseInt(stats.completed || 0),
        failed:    parseInt(stats.failed    || 0),
        pending:   parseInt(stats.pending   || 0),
      },
      credits_per_session: {
        SESSION_LOG:   parseInt(process.env.CREDITS_SESSION_LOG   || '5'),
        EXTERNAL_DATA: parseInt(process.env.CREDITS_EXTERNAL_DATA || '2'),
        COG_STIMULUS:  parseInt(process.env.CREDITS_COG_STIMULUS  || '5'),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Checkout ──────────────────────────────────────────────────────

app.post('/api/v1/checkout/subscribe', requireApiKey, async (req, res) => {
  const { price_id, return_url } = req.body;
  if (!price_id || !return_url) {
    return res.status(400).json({ error: 'price_id and return_url required' });
  }
  try {
    const url = await billing.createSubscriptionCheckout(req.user, price_id, return_url);
    res.json({ checkout_url: url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/checkout/credits', requireApiKey, async (req, res) => {
  const { credits, price_in_cents, return_url } = req.body;
  if (!credits || !price_in_cents || !return_url) {
    return res.status(400).json({ error: 'credits, price_in_cents, and return_url required' });
  }
  try {
    const url = await billing.createCreditPurchaseCheckout(req.user, credits, price_in_cents, return_url);
    res.json({ checkout_url: url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pricing info (no auth required — used by the web app to show upgrade options)
app.get('/api/v1/pricing', (req, res) => {
  res.json({
    subscriptions: billing.SUBSCRIPTION_TIERS,
    credit_bundles: billing.CREDIT_BUNDLES,
  });
});


// ── Stripe webhook ────────────────────────────────────────────────

app.post('/webhooks/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  try {
    await billing.handleWebhook(req.body, signature);
    res.json({ received: true });
  } catch (err) {
    logger.error('[Stripe] Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});


// ── Error handler ─────────────────────────────────────────────────

app.use((err, req, res, next) => {
  logger.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});


// ── Start ─────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`[Server] KOS Inference Service running on port ${PORT}`);
  logger.info(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start the worker in the same process (single-instance deployment)
  // For scale, run worker.js as a separate Cloud Run Job
  if (process.env.RUN_WORKER_IN_PROCESS !== 'false') {
    startWorker().catch(err => logger.error('[Worker] Failed to start:', err));
  }
});

module.exports = app;
