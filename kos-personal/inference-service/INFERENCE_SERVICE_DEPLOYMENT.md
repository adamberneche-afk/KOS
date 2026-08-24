# KOS Inference Service — Deployment Guide

This guide takes the inference service from source code to a running Cloud Run instance connected to a KOS deployment. Estimated time: 45–60 minutes for first deploy.

**Current integration status:** the wiring this guide describes is live. `10_Turnstile.gs` calls this service's `POST /api/v1/jobs` webhook (via `_submitManagedServiceJob_()` in `3_Queue_Processor.gs`) immediately before releasing a `STUDIO_ACTIVE` row, whenever `CFG.INFERENCE_MODE === 'MANAGED_SERVICE'` — see this directory's `README.md` "What actually integrates with kos-personal" section. In the default `'STUDIO'` mode this hand-off is skipped and native Studio inference handles the row instead. Deploying this service and setting `CFG.INFERENCE_MODE = 'MANAGED_SERVICE'` (with credentials configured) gets you both the account-status panel in the KOS web app (`getQueueMetrics()`'s `managed_service` field) and actual end-to-end job routing. Phase 7c below is a reproducible test of that real hand-off, not target/future behavior.

---

## What You're Building

A Node.js service that:
- Receives job webhooks from KOS Turnstile when sessions are ready for processing
- Reads session documents from users' Google Drive via OAuth
- Calls the Claude API with an operator-calibrated prompt
- Writes structured JSON back to the document
- Sets FLOW_COMPLETE in the user's STAGING_PIPELINE
- Charges credits via Stripe

The service runs on Google Cloud Run — serverless, scales to zero when idle, costs nothing when not processing.

**The `.gs` side's Auditor accountability gate (`processInferenceQueue()`
checking a payload's `auditor_sign_off` — see `CURATOR_PROMPT.md` Rule 8)
applies to jobs from this service exactly the same as native Studio
jobs** — it inspects the JSON this service writes, regardless of which
engine produced it. Nothing in this service needs to change for that
gate to work; it only matters if this service's own prompt is ever
extended to run a similar self-verification pass, in which case the same
rule applies: merge that output into the one JSON object this service
writes, never append it as a second one.

---

## Prerequisites

- Google Cloud account with billing enabled
- A domain or Cloud Run URL (generated automatically)
- Anthropic API key (console.anthropic.com)
- Stripe account (stripe.com)
- PostgreSQL database (Supabase recommended for quickest setup)
- Node.js 20+ installed locally for testing

---

## Phase 1 — Database Setup (Supabase)

Supabase is the fastest PostgreSQL option with a generous free tier.

1. Go to [supabase.com](https://supabase.com) → New project
2. Name it `kos-inference`
3. Set a strong database password and save it
4. Wait for provisioning (~2 minutes)
5. Go to **Settings → Database → Connection string → URI** — copy it
6. In the Supabase **SQL Editor**, paste and run the contents of `sql/schema.sql`
7. Verify four tables were created: `users`, `jobs`, `billing_events`, and the trigger

Your `DATABASE_URL` is the URI from step 5.

---

## Phase 2 — Google Cloud Setup

### 2a. Create the Cloud Run project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project: **KOS Inference Service**
3. Note the project ID (e.g. `kos-inference-abc123`)
4. Enable required APIs:
   ```
   gcloud services enable run.googleapis.com \
     cloudbuild.googleapis.com \
     drive.googleapis.com \
     docs.googleapis.com \
     sheets.googleapis.com
   ```

### 2b. Configure OAuth credentials

This is the same GCP project used for the KOS Apps Script OAuth screen — or a separate one if you prefer.

1. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Name: `KOS Inference Service`
4. Authorized redirect URIs: Add your Cloud Run URL + `/auth/callback`
   - You won't know the URL until after first deploy — use a placeholder first,
     then update it after deployment: `https://kos-inference-HASH-uc.a.run.app/auth/callback`
5. Save — note the **Client ID** and **Client Secret**

### 2c. Configure OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. User type: **External**
3. App name: `KOS Inference Service`
4. Scopes: Add Drive, Docs, Sheets, and userinfo scopes
5. Test users: Add your email address
6. Submit for verification when ready for production (not required for testing)

---

## Phase 3 — Stripe Setup

### 3a. Create products

In the Stripe dashboard (or CLI):

**Subscriptions:**
```
Starter        $15/month   → note the Price ID
Professional   $29/month   → note the Price ID
Creator        $49/month   → note the Price ID
```

**The Price IDs look like:** `price_1OqAbc...`

### 3b. Configure webhook

1. **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://your-service-url.run.app/webhooks/stripe`
3. Events to listen for:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
4. Note the **Signing secret** (`whsec_...`)

---

## Phase 4 — Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

Required values:
```
GOOGLE_CLIENT_ID          from Phase 2b
GOOGLE_CLIENT_SECRET      from Phase 2b
GOOGLE_REDIRECT_URI       https://YOUR-URL.run.app/auth/callback
ANTHROPIC_API_KEY         from console.anthropic.com
ANTHROPIC_MODEL           claude-sonnet-4-5
DATABASE_URL              from Phase 1
STRIPE_SECRET_KEY         sk_live_... from Stripe dashboard
STRIPE_WEBHOOK_SECRET     whsec_... from Phase 3b
STRIPE_PRICE_STARTER      price_... from Phase 3a
STRIPE_PRICE_PROFESSIONAL price_... from Phase 3a
STRIPE_PRICE_CREATOR      price_... from Phase 3a
WEBHOOK_SECRET            any long random string (openssl rand -hex 32)
PORT                      8080
NODE_ENV                  production
```

---

## Phase 5 — Deploy to Cloud Run

### 5a. Build and push the container

```bash
# Set your project ID
export PROJECT_ID=kos-inference-abc123
export REGION=us-central1
export SERVICE_NAME=kos-inference

# Build and push
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

# Deploy
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 10 \
  --min-instances 0 \
  --max-instances 5 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "GOOGLE_CLIENT_ID=kos-google-client-id:latest,\
GOOGLE_CLIENT_SECRET=kos-google-client-secret:latest,\
ANTHROPIC_API_KEY=kos-anthropic-key:latest,\
DATABASE_URL=kos-database-url:latest,\
STRIPE_SECRET_KEY=kos-stripe-secret:latest,\
STRIPE_WEBHOOK_SECRET=kos-stripe-webhook-secret:latest,\
WEBHOOK_SECRET=kos-webhook-secret:latest"
```

**Using Secret Manager (recommended for production):**
```bash
# Store each secret
echo -n "your-value" | gcloud secrets create kos-google-client-id --data-file=-
echo -n "your-value" | gcloud secrets create kos-google-client-secret --data-file=-
echo -n "your-value" | gcloud secrets create kos-anthropic-key --data-file=-
echo -n "your-value" | gcloud secrets create kos-database-url --data-file=-
echo -n "your-value" | gcloud secrets create kos-stripe-secret --data-file=-
echo -n "your-value" | gcloud secrets create kos-stripe-webhook-secret --data-file=-
echo -n "your-value" | gcloud secrets create kos-webhook-secret --data-file=-
```

### 5b. Get your service URL

```bash
gcloud run services describe $SERVICE_NAME \
  --region $REGION \
  --format 'value(status.url)'
```

This returns something like: `https://kos-inference-abc123-uc.a.run.app`

### 5c. Update the OAuth redirect URI

Go back to **GCP → APIs & Services → Credentials** → your OAuth client and update the redirect URI to: `https://YOUR-ACTUAL-URL.run.app/auth/callback`

### 5d. Update the Stripe webhook URL

Go to **Stripe → Webhooks** and update the endpoint URL to: `https://YOUR-ACTUAL-URL.run.app/webhooks/stripe`

---

## Phase 6 — Verify the Deployment

```bash
# Health check
curl https://YOUR-URL.run.app/health

# Expected response:
# {"status":"ok","timestamp":"2025-05-15T09:00:00.000Z"}
```

Check the Cloud Run logs:
```bash
gcloud run logs read $SERVICE_NAME --region $REGION --limit 50
```

You should see:
```
[Server] KOS Inference Service running on port 8080
[Server] Environment: production
[Worker] Starting job processor...
```

---

## Phase 7 — Connect a KOS Instance

### 7a. User authorization flow

Each KOS operator connects their instance through the OAuth flow:

1. The user visits: `https://YOUR-URL.run.app/auth/connect`
2. They authorize the requested Google permissions
3. They land on a confirmation page showing their API key
4. They add two properties to their KOS Apps Script project (these are `CFG.PROP.MANAGED_SERVICE_BASE_URL` / `CFG.PROP.MANAGED_SERVICE_API_KEY` in `1_Config_And_Deploy.gs` — the names actually read by `_getManagedServiceStatus_()` in `3_Queue_Processor.gs`):
   - `KOS_MANAGED_SERVICE_BASE_URL` = `https://YOUR-URL.run.app`
   - `KOS_MANAGED_SERVICE_API_KEY` = the key shown on the confirmation page
5. Set `CFG.INFERENCE_MODE = 'MANAGED_SERVICE'` in `1_Config_And_Deploy.gs` and re-run `setupAllTriggers()` in the Apps Script editor

### 7b. Verify the connection

In the KOS Apps Script editor:
```javascript
// Run this to verify the connection
function testInferenceConnection() {
  const props = PropertiesService.getScriptProperties();
  const url   = props.getProperty('KOS_MANAGED_SERVICE_BASE_URL');
  const key   = props.getProperty('KOS_MANAGED_SERVICE_API_KEY');

  if (!url || !key) {
    Logger.log('Not configured. Add KOS_MANAGED_SERVICE_BASE_URL and KOS_MANAGED_SERVICE_API_KEY.');
    return;
  }

  const resp = UrlFetchApp.fetch(url + '/api/v1/account', {
    headers: { 'X-KOS-API-Key': key },
    muteHttpExceptions: true,
  });

  Logger.log('Status: ' + resp.getResponseCode());
  Logger.log('Account: ' + resp.getContentText());
}
```

Expected output:
```
Status: 200
Account: {"email":"user@example.com","credit_balance":50,"subscription_status":"free",...}
```

### 7c. Test a full job

**Wired up and testable — see the integration-status note at the top of this guide.** `10_Turnstile.gs` calls this service's `POST /api/v1/jobs` webhook whenever `CFG.INFERENCE_MODE === 'MANAGED_SERVICE'`, so a `STUDIO_ACTIVE` row will be picked up by this service once it's deployed and that mode is set. The steps below are a real, reproducible test of that hand-off.

1. Submit a short session via the KOS web app Ingest tab
2. Wait up to 5 minutes for the Turnstile to release it (or run `runMatrixTurnstile()` manually)
3. Check Cloud Run logs — you should see:
   ```
   [Worker] Processing job abc123 | SESSION_LOG | user user@example.com
   [Worker] Job abc123 complete | 8432in + 1204out tokens | 5 credits charged
   ```
4. Check STAGING_PIPELINE — the row should now be FLOW_COMPLETE
5. Run `processInferenceQueue()` manually to complete the routing
6. Check SESSION_LOG and MATRIX_LEDGER for the new rows

---

## Phase 8 — Production Checklist

Before accepting real users:

- [ ] OAuth consent screen submitted for verification (or app restricted to known testers)
- [ ] Stripe webhook verified (check dashboard → Webhooks → your endpoint → Recent deliveries)
- [ ] Database has indexes (run `\d jobs` in Supabase SQL editor to verify)
- [ ] Cloud Run min-instances set to 0 (scale to zero when idle)
- [ ] Secret Manager used for all credentials (not environment variables)
- [ ] Cloud Run logs monitored (set up log-based alerts for `[Worker] Unexpected error`)
- [ ] Health check passing from an external monitor (UptimeRobot or similar)
- [ ] Stripe test mode used during development, live keys only in production

---

## Ongoing Operations

### Checking job queue health
```bash
# Count jobs by status
gcloud sql connect ... # or query Supabase dashboard
# SELECT status, count(*) FROM jobs GROUP BY status;
```

### Manually retrying failed jobs
```sql
-- In Supabase SQL editor
UPDATE jobs SET status = 'queued', retry_count = 0, started_at = NULL
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours';
```

### Monitoring costs
- Cloud Run charges only for actual request processing time
- At 1,000 sessions/month: approximately $0.10-0.50 in Cloud Run compute
- Anthropic API: approximately $4-18 at current rates for 1,000 sessions
- Supabase free tier handles ~500MB database (sufficient for ~100,000 jobs)

### Scaling for more users
The service is stateless — Cloud Run handles concurrency automatically.
For high volume (10,000+ sessions/month):
- Set `--min-instances 1` to eliminate cold start latency
- Run the worker as a separate Cloud Run Job triggered by Cloud Scheduler
  rather than in the same process as the HTTP server
- Consider read replicas for the database

---

## Troubleshooting

**Jobs are created but never processed**
Check that `RUN_WORKER_IN_PROCESS` is not set to `false`. Check Cloud Run logs for worker startup messages. Verify database connectivity with the health check endpoint.

**"Could not read Drive document" errors**
The user's OAuth token may have expired or been revoked. They need to re-authorize at `/auth/connect`. Check the `token_expiry` column in the users table.

**Stripe webhooks failing**
Verify the webhook signing secret matches `STRIPE_WEBHOOK_SECRET`. Check that the Stripe webhook URL matches your deployed service URL exactly (including https).

**High NEEDS_CURATOR rate**
The model is producing malformed JSON. Check Cloud Run logs for "Model produced invalid JSON" entries. Common causes: model hitting token limits (increase `max_tokens`), unusual session content triggering code fences in the output. Review the `inference.js` cleaning logic.

**"Insufficient credits" stopping jobs**
The user's free credits are exhausted. Either add credits manually via Supabase or direct them to the billing upgrade flow at `/api/v1/checkout/subscribe`.
