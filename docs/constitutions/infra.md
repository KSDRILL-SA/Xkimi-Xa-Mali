# Infrastructure Constitution — Xkimm Xa Mali

## Rules

```
[INFRA-I01]  Every service exposes GET /api/health.
             Returns { status, db, redis, ts } with appropriate HTTP status.
             This endpoint is public (L0) and never requires auth.

[INFRA-I02]  All environment config validated at startup with t3-env.
             Missing required env vars crash the app at boot, not at runtime.

[INFRA-I03]  No environment-specific code branches.
             Use environment variables to toggle behaviour.
             if (process.env.NODE_ENV === 'production') is a code smell.

[INFRA-I04]  Docker Compose for local development.
             Every developer runs the full stack locally without cloud services.
             Local PostgreSQL + Redis mirrors production schema exactly.

[INFRA-I05]  Staging uses real external services in sandbox/test mode.
             No mocks in staging. Mocks only in unit tests.

[INFRA-I06]  Database migrations run as part of deployment, not manually.
             prisma migrate deploy is part of the CI/CD pipeline.
             No ad-hoc schema changes in production.

[INFRA-I07]  All secrets in environment variables.
             Vercel project env vars for production.
             .env.local for local development.
             .env.example committed with all required keys (no values).

[INFRA-I08]  Vercel preview deployments on every PR.
             Preview environments use Neon branch databases.
             Preview environments are ephemeral — cleaned up on PR close.

[INFRA-I09]  Sentry configured for error tracking on all environments.
             Source maps uploaded on production deploys.
             Release tracking enabled.

[INFRA-I10]  Better Stack uptime monitor on /api/health.
             Alert channel: email to admin. SLA target: 99.9%.
```

## Environment Variables Reference

```bash
# .env.example

# Database
DATABASE_URL=postgresql://...

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Encryption
ENCRYPTION_KEY=   # 32-byte hex string

# Netcash
NETCASH_SERVICE_KEY=
NETCASH_WEBHOOK_SECRET=
NETCASH_API_URL=  # sandbox vs production

# BulkSMS
BULKSMS_USERNAME=
BULKSMS_PASSWORD=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Storage
BLOB_READ_WRITE_TOKEN=

# Monitoring
SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# Feature flags
ENABLE_MANUAL_PAYMENTS=true
ENABLE_GOAL_LOCKING=true
WHATSAPP_GROUP_LINK=https://chat.whatsapp.com/...
```

## Deployment Pipeline

```yaml
# On Pull Request:
- typecheck      (tsc --noEmit)
- lint           (eslint)
- test           (vitest)
- prisma-check   (prisma validate)
- preview-deploy (Vercel)

# On merge to main:
- All PR checks
- prisma migrate deploy (Neon production)
- Vercel production deploy
- Sentry release

# Rollback:
- Vercel instant rollback via dashboard (previous deployment)
- Database: rollback migration script in /packages/database/prisma/rollbacks/
```
