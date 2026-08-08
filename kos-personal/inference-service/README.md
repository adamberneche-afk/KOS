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

## Known gap

`package.json`'s `"migrate"` script points at `sql/migrate.js`, which was
**not** part of the uploaded batch — only `sql/schema.sql` (the schema
itself, presumably meant to be applied directly) came with this service.
Nothing else in this repo can reconstruct a migration runner that was
never uploaded. Apply `schema.sql` directly against a fresh Postgres
database until/unless a real `migrate.js` shows up.

## What actually integrates with kos-personal

- `1_Config_And_Deploy.gs`: `CFG.INFERENCE_MODE` gate and the two
  `CFG.PROP` keys for this service's URL/API key.
- `3_Queue_Processor.gs`: `_getManagedServiceStatus_()` — calls this
  service's `GET /api/v1/account` and feeds the result into
  `getQueueMetrics()`'s `managed_service` field, only in
  `MANAGED_SERVICE` mode.
- `8_WebApp_UI.html`: `renderServiceStatus()` — renders the credits panel
  only when `managed_service` is non-null.

Nothing else in `kos-personal/` calls into this service. In particular,
the `POST /api/v1/jobs` webhook this service exposes for KOS Turnstile to
submit work has **no corresponding caller anywhere in the `.gs` files** —
wiring `10_Turnstile.gs` to actually submit jobs here (instead of relying
on native Studio inference) is real, unbuilt integration work, not
something this filing-in pass did. Treat `MANAGED_SERVICE` mode today as
"the account-status panel works if you stand this service up and paste in
its credentials" — the inference hand-off itself is not yet wired.
