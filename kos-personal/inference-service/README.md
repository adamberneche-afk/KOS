# kos-personal inference service (optional)

A standalone Node.js/Express service that replaces native Workspace
Studio inference with a hosted, multi-tenant, credit-metered alternative
— Postgres for account/job state, Stripe for subscriptions and credit
purchases, the Anthropic SDK for actual inference.

**This is opt-in, not the default.** The default `kos-personal` deployment
(`CFG.INFERENCE_MODE = 'STUDIO'` in `1_Config_And_Deploy.gs`) uses native
Workspace Studio + Gemini inference — no external server, no API keys on
any student- or operator-facing surface, no vendor billing relationship.
That commitment, made in the root `kos-personal/README.md`, still holds
for the default path. This service exists as a documented *option* for
someone who wants to run KOS for multiple tenants or without a Workspace
Studio subscription — set `CFG.INFERENCE_MODE = 'MANAGED_SERVICE'` and
configure `MANAGED_SERVICE_BASE_URL` / `MANAGED_SERVICE_API_KEY` as
Script Properties to use it.

## Webhook authentication — required in production, both sides

`POST /api/v1/jobs` is authenticated by an HMAC-SHA256 signature over the raw
request body. **Both halves must be configured or every job submission fails:**

| Where | Name | Notes |
|---|---|---|
| This service (env var) | `WEBHOOK_SECRET` | Without it, the service **refuses to start** when `NODE_ENV=production` (`src/server.js`) |
| KOS (Script Property) | `KOS_MANAGED_SERVICE_WEBHOOK_SECRET` | Must be the same value. Read by `_submitManagedServiceJob_()` in `3_Queue_Processor.gs` |

Set both to the same random secret. If the service has one and KOS doesn't, every
submission gets a 401; if neither is set in production, the service exits at boot.

This was previously documented across the repo as *optional* — "if unset, job
submission still runs, unsigned." That described the earlier fail-**open**
behaviour: `validateWebhookSignature()` skipped the check entirely when no secret
was configured, which silently downgraded the one authenticated endpoint on the
component handling billing and auth. It now fails closed, and the comparison is
constant-time (`crypto.timingSafeEqual`). The dev-only skip survives, logged as a
warning, for `NODE_ENV !== 'production'`.

## Why this exists in the repo

This service was recovered from a reupload batch as the real, previously
unexplained origin of a "Managed Inference" credits/subscription UI panel
that an earlier reconciliation pass found wired into `8_WebApp_UI.html`
with zero backend behind it anywhere in the repo, and stripped as
vestigial. It wasn't vestigial — it was the client half of this service,
which had simply never been uploaded until now. See
`kos-personal/README.md` for the full reconciliation record.

## Layout

```
inference-service/
├── Dockerfile                        Cloud Run–style multi-stage build
├── package.json                      main: src/server.js
├── INFERENCE_SERVICE_DEPLOYMENT.md   deployment instructions
├── src/
│   ├── server.js      Express app — /api/v1/jobs, /account, /checkout/*
│   ├── worker.js       Background job processor (Turnstile → Claude API)
│   ├── billing.js      Stripe subscription/credit-purchase logic
│   ├── db.js            Postgres access layer
│   ├── google.js        Google OAuth (account linking)
│   ├── inference.js     Anthropic SDK wrapper
│   └── logger.js        Winston logger setup
└── sql/
    └── schema.sql        Postgres schema (users, jobs, credit ledger)
```

## Migrations

`npm run migrate` (`sql/migrate.js`) applies `schema.sql` against
`DATABASE_URL`, reusing `src/db.js`'s connection pool (so it inherits
that file's TLS/CA handling). `schema.sql` is entirely idempotent
(`CREATE TABLE IF NOT EXISTS` throughout), so this is a thin wrapper
around what running `psql $DATABASE_URL -f schema.sql` by hand already
did — no real migration-versioning machinery is needed at this schema's
current size. This file previously didn't exist despite `package.json`
referencing it (a documented, longstanding gap) — it's filed in now.

## What actually integrates with kos-personal

- `1_Config_And_Deploy.gs`: `CFG.INFERENCE_MODE` gate and the two
  `CFG.PROP` keys for this service's URL/API key.
- `3_Queue_Processor.gs`: `_getManagedServiceStatus_()` — calls this
  service's `GET /api/v1/account` and feeds the result into
  `getQueueMetrics()`'s `managed_service` field, only in
  `MANAGED_SERVICE` mode. Also `_submitManagedServiceJob_()` — `POST`s to
  `/api/v1/jobs` (this file's job-submission webhook), called from
  `10_Turnstile.gs`.
- `8_WebApp_UI.html`: `renderServiceStatus()` — renders the credits panel
  only when `managed_service` is non-null.
- `10_Turnstile.gs`: when `CFG.INFERENCE_MODE === 'MANAGED_SERVICE'`,
  calls `_submitManagedServiceJob_()` immediately before releasing a row,
  handing the job to this service instead of relying on native Studio
  inference. In the default `'STUDIO'` mode this is skipped entirely.

This section previously said the `/api/v1/jobs` webhook had no caller
anywhere in the `.gs` files and that wiring `10_Turnstile.gs` to submit
jobs here was still unbuilt — that's now stale; the wiring above is live.
Treat `MANAGED_SERVICE` mode today as fully wired end to end, gated
behind `CFG.INFERENCE_MODE`, off by default.

**The Auditor accountability gate applies here too.** `processInferenceQueue()`'s
check of a payload's `auditor_sign_off` (see `CURATOR_PROMPT.md` Rule 8)
happens entirely on the `.gs` side, after this service's job comes back
— it doesn't know or care which engine produced the JSON. If this
service's own Claude-based prompt (`src/inference.js`) is ever extended
with a similar self-verification pass, the same contract applies: merge
the Auditor's output into the one JSON object this service writes, never
append it as a second one.
