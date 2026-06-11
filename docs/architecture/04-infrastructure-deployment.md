# Infrastructure & Deployment

Deployment topology, CI/CD, and how the cloud services wire together at runtime. Ordered go-live steps: [../../DEPLOYMENT.md](../../DEPLOYMENT.md).

## Environment tiers

Three fully isolated tiers — no tier shares data or credentials with another.

| Tier | Trigger | Database | Redis | Netcash |
|---|---|---|---|---|
| **Local** | Dev machine | Neon dev branch *(Docker optional via `docker-compose.yml`)* | Upstash dev | Test gateway |
| **Preview** | PR / push to `Dev` | Neon PR branch (auto) | Upstash dev | Test gateway |
| **Production** | Promote to `main` | Neon production (pooled) | Upstash production | **Live** |

---

## CI/CD pipeline

```mermaid
flowchart TD
    DEV["feature branch<br/>conventional commits"] --> PR["PR → Dev"]
    PR --> CI

    subgraph CI["GitHub Actions"]
        direction LR
        INSTALL["npm ci"] --> GEN["prisma generate"] --> MIG["migrate deploy<br/>(test DB)"] --> SEED["db:seed"]
        SEED --> TC["typecheck"] --> LINT["lint"] --> TEST["test"] --> BUILD["build"] --> VAL["prisma validate"]
    end

    CI -->|green| REVIEW["review"] --> MERGE["squash merge"]
    MERGE -->|push Dev| PREV["Vercel preview<br/>Neon PR branch · test gateway"]
    MERGE -->|promote main| PROD["Vercel production<br/>migrate deploy → build → deploy<br/>Neon prod · live gateway"]
```

> CI is currently paused (Actions minutes exhausted on the private repo); the workflow is correct and goes green once minutes return. Until then the local `typecheck · lint · test · build` is the gate. See [../../DEPLOYMENT.md](../../DEPLOYMENT.md#8-known-limitations-today).

---

## Production topology

```mermaid
flowchart TB
    MB["Member"] & AD["Admin"] --> CDN["Vercel CDN<br/>edge · auto HTTPS"]

    subgraph APP["Next.js app"]
        SSR["RSC / SSR"]
        API["API /api/v1/*"]
        WH["Webhook receivers<br/>inngest · netcash · bulksms"]
    end
    CDN --> SSR & API

    subgraph NEON["Neon production"]
        POOL["PgBouncer pooler"] --> PRIMARY["primary node"]
        PRIMARY --> BACKUP["WAL backups · PITR"]
    end
    REDIS["Upstash Redis"]
    subgraph INNGEST["Inngest Cloud"]
        CRON["cron schedules"]
        HIST["execution history"]
    end
    NC["Netcash (live)"]
    BULK["BulkSMS"]
    RESEND["Resend"]
    BLOB["Vercel Blob"]

    API --> POOL & REDIS & NC & BULK & RESEND & BLOB & INNGEST
    INNGEST --> WH --> POOL & REDIS & NC & BULK & RESEND
    NC -->|mandate webhooks| WH
    BULK -->|receipts| WH
```

**Scheduled jobs (Inngest cron):** 07:00 morning warning · 20:00 debit run · daily overdue reminder · 1st-of-month rollover · nightly ledger + contribution reconciliation · daily financial-anomaly watch · monthly statement notice · badge recalculation · invite expiry.

---

## Environment isolation

```mermaid
flowchart LR
    subgraph L["Local"]
        LA["next dev :3000"] --- LDB["Neon dev branch"]
        LA --- LIN["Inngest dev :8288"]
    end
    subgraph P["Preview — Dev"]
        PA["*.vercel.app"] --- PDB["Neon PR branch"]
    end
    subgraph PR["Production — main"]
        PRA["xkimmxamali.co.za"] --- PRDB["Neon prod — real data"]
        PRA --- PRNC["Netcash live — real debits"]
    end
    L -.->|no shared data or creds| P -.->|no shared data or creds| PR
```

---

## Monorepo & env reference

```
apps/web        Next.js — pages · api/v1 · services · lib · inngest · middleware.ts
apps/admin      Admin dashboard          apps/website   Marketing site
packages/database   schema.prisma (34 models · 17 enums) · 16 migrations · seed.ts
packages/ui|utils|types|config   shared libraries
docs/           architecture · flows · database · security · adr · constitutions
                api-contract.yaml (OpenAPI 3.1)
```

Every tier needs the same core secrets (full list + descriptions in [`.env.example`](../../.env.example) and [DEPLOYMENT.md](../../DEPLOYMENT.md#2-environment-variables-production)). The ones that bite if wrong:

| Variable | Note |
|---|---|
| `ENCRYPTION_KEY` | 64 hex chars — **set once, never change** (decrypts stored bank/ID numbers) |
| `ADMIN_API_SECRET` | Must match on web + admin (admin→web internal calls) |
| `NETCASH_API_URL` | Defaults to the **test** gateway — override for production |
| `INNGEST_EVENT_KEY` / `_SIGNING_KEY` | Or no scheduled job fires |

### Service failure behaviour

| Service | Used by | On failure | Retry |
|---|---|---|---|
| Neon | All routes + jobs | Hard 500 | Prisma reconnect |
| Upstash | Middleware, mandate, jobs | Soft — limit/idempotency fall back | Client retry |
| Netcash | mandate, contribution, debit-run | Hard — payment unchanged | Inngest step retry |
| BulkSMS / Resend | notification | Soft — marked FAILED | Inngest step retry |
| Inngest | Payment pipeline | Deferred until recovered | Built-in backoff |
| Vercel Blob | Statement export | Soft — guarded by `withRetry` + circuit breaker | Auto + manual |
