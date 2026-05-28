# Infrastructure and Deployment

| | |
|---|---|
| **Purpose** | Documents the deployment topology, CI/CD pipeline, environment tiers, and cloud service wiring |
| **Audience** | Engineers, DevOps, anyone deploying or debugging the system |
| **Related Docs** | [01-system-context.md](./01-system-context.md) · [02-container-architecture.md](./02-container-architecture.md) · [../database/01-erd.md](../database/01-erd.md) |

---

## Environment Tiers

XXM runs across three fully isolated environment tiers. Each tier has its own database, Redis instance, and external service credentials. No tier shares data with another.

| Tier | Trigger | Database | Redis | Netcash | Purpose |
|---|---|---|---|---|---|
| **Local** | Developer machine | Docker PostgreSQL 16 | Docker Redis 7 | Sandbox | Active development |
| **Preview** | Push to `Dev` branch | Neon Dev branch | Upstash Dev | Sandbox | Integration testing |
| **Production** | Push to `main` branch | Neon Production branch | Upstash Production | Live | Live system |

---

## Diagram 1 — CI/CD Pipeline

> From code push to live deployment, every step in order.

```mermaid
flowchart TD
    subgraph DEV["Developer"]
        CODE["Write code on\nfeature branch"]
        COMMIT["git commit\nconventional commits"]
        PR["Open PR to Dev\nwith labels and milestone"]
    end

    subgraph CI["GitHub Actions — CI Pipeline"]
        CHECKOUT["actions/checkout@v4"]
        NODE["Setup Node.js 20\ncache npm"]
        INSTALL["npm ci\ninstall all workspaces"]
        GENERATE["prisma generate\ngenerate Prisma client"]
        MIGRATE["prisma migrate deploy\nrun against test DB"]
        TYPECHECK["npm run typecheck\ntsc --noEmit"]
        LINT["npm run lint\nESLint across workspaces"]
        TEST["npm run test\nVitest test suite"]
        VALIDATE["prisma validate\nschema integrity check"]
    end

    subgraph VERCEL_PREVIEW["Vercel — Preview Deployment"]
        VP_BUILD["Next.js build\nnpm run build"]
        VP_DEPLOY["Deploy to preview URL\n*.vercel.app subdomain"]
        VP_ENV["Neon Dev DB branch\nUpstash Dev\nNetcash Sandbox"]
    end

    subgraph MERGE["Merge to Dev"]
        REVIEW["PR review\ndiagrams, test plan checked"]
        MERGE_BTN["Merge PR\ndelete feature branch"]
    end

    subgraph PROD["Vercel — Production Deployment"]
        PROD_MIGRATE["prisma migrate deploy\nagainst Neon production"]
        PROD_BUILD["Next.js production build\nbundle optimisation"]
        PROD_DEPLOY["Deploy to production\nVercel CDN edge network"]
        PROD_ENV["Neon Production DB\nUpstash Production\nNetcash Live"]
    end

    CODE --> COMMIT --> PR
    PR --> CHECKOUT --> NODE --> INSTALL --> GENERATE
    GENERATE --> MIGRATE --> TYPECHECK --> LINT --> TEST --> VALIDATE
    VALIDATE -->|"CI green"| REVIEW
    REVIEW --> MERGE_BTN

    MERGE_BTN -->|"push to Dev"| VP_BUILD
    VP_BUILD --> VP_DEPLOY --> VP_ENV

    MERGE_BTN -->|"PR to main, then merge"| PROD_MIGRATE
    PROD_MIGRATE --> PROD_BUILD --> PROD_DEPLOY --> PROD_ENV
```

---

## Diagram 2 — Production Topology

> How every cloud service connects at runtime in production.

```mermaid
flowchart TB
    subgraph USERS["End Users"]
        MB["Member\nbrowser or PWA"]
        AD["Admin\nbrowser"]
    end

    subgraph VERCEL_PROD["Vercel Production"]
        CDN["Vercel CDN\nEdge Network\nGlobal PoPs\nAutomatic HTTPS"]
        subgraph APP["Next.js Application"]
            SSR["Server-side rendering\nApp Router RSC"]
            APIROUTES["API Routes\n/api/v1/*"]
            JOBS_RECV["Inngest webhook receiver\n/api/v1/webhooks/inngest"]
            NC_RECV["Netcash webhook receiver\n/api/v1/webhooks/netcash"]
            SMS_RECV["BulkSMS receipt receiver\n/api/v1/webhooks/bulksms"]
        end
    end

    subgraph NEON["Neon — PostgreSQL Production"]
        POOLER["PgBouncer\nConnection Pooler"]
        PRIMARY["Primary DB node\nWrite and read queries"]
        REPLICA["Read replica\nOptional future read offload"]
        BACKUP["Continuous WAL backups\nPoint-in-time recovery"]
    end

    subgraph UPSTASH_PROD["Upstash — Redis Production"]
        REDIS_PROD["Redis cluster\nAuto-replicated\nREST API only\nNo persistent WebSocket"]
    end

    subgraph INNGEST_PROD["Inngest Cloud Production"]
        CRON["Cron schedules\n07h00 and 20h00 SAST\n1st of month\nDaily overdue"]
        EVENTS["Event fan-out\nDelay handler\nNotification flush"]
        HISTORY["Full execution history\n30-day retention\nStep-level replay"]
    end

    subgraph EXTERNAL_PROD["External Services — Production Credentials"]
        NC_PROD["Netcash\nLive DebiCheck API\nProduction service key"]
        BULK_PROD["BulkSMS\nLive SA SMS delivery"]
        RESEND_PROD["Resend\nLive email delivery\nCustom domain sender"]
        BLOB_PROD["Vercel Blob\nProduction bucket\nSigned URL delivery"]
    end

    MB --> CDN
    AD --> CDN
    CDN --> SSR
    CDN --> APIROUTES

    APIROUTES --> POOLER --> PRIMARY
    APIROUTES --> REDIS_PROD
    APIROUTES --> NC_PROD
    APIROUTES --> BULK_PROD
    APIROUTES --> RESEND_PROD
    APIROUTES --> BLOB_PROD
    APIROUTES --> INNGEST_PROD

    INNGEST_PROD --> JOBS_RECV
    JOBS_RECV --> POOLER
    JOBS_RECV --> REDIS_PROD
    JOBS_RECV --> NC_PROD
    JOBS_RECV --> BULK_PROD
    JOBS_RECV --> RESEND_PROD

    NC_PROD -->|"mandate status webhooks"| NC_RECV
    BULK_PROD -->|"delivery receipt webhooks"| SMS_RECV
    NC_RECV --> APIROUTES
    SMS_RECV --> APIROUTES
```

---

## Diagram 3 — Environment Isolation

> How local, preview, and production environments are kept completely separate.

```mermaid
flowchart LR
    subgraph LOCAL["Local Development"]
        L_APP["Next.js dev server\nlocalhost:3000"]
        L_DB["Docker PostgreSQL 16\nlocalhost:5432"]
        L_REDIS["Docker Redis 7\nlocalhost:6379"]
        L_INNGEST["Inngest Dev Server\nlocalhost:8288"]
        L_NC["Netcash Sandbox\nTest ASMX endpoint"]
    end

    subgraph PREVIEW["Preview — Dev branch"]
        P_APP["Vercel preview deployment\n*.vercel.app"]
        P_DB["Neon Dev DB branch\nisolated from production"]
        P_REDIS["Upstash Dev database"]
        P_NC["Netcash Sandbox"]
    end

    subgraph PRODUCTION["Production — main branch"]
        PR_APP["Vercel production\nxkimmxamali.co.za"]
        PR_DB["Neon Production branch\nreal member data"]
        PR_REDIS["Upstash Production database"]
        PR_NC["Netcash Live\nreal debit orders"]
    end

    L_APP --- L_DB
    L_APP --- L_REDIS
    L_APP --- L_INNGEST
    L_APP --- L_NC

    P_APP --- P_DB
    P_APP --- P_REDIS
    P_APP --- P_NC

    PR_APP --- PR_DB
    PR_APP --- PR_REDIS
    PR_APP --- PR_NC

    LOCAL -.->|"no data sharing\nno credential sharing"| PREVIEW
    PREVIEW -.->|"no data sharing\nno credential sharing"| PRODUCTION
```

---

## Diagram 4 — Monorepo Workspace Structure

```mermaid
flowchart TD
    subgraph ROOT["Root Workspace — Turborepo"]
        direction LR
        PKG["package.json\nworkspaces config\nturbo.json pipeline"]
        GH[".github/workflows/ci.yml\nGitHub Actions pipeline"]
        DC["docker-compose.yml\nPostgreSQL + Redis\nlocal dev services"]
        ENV[".env.example\nall required env vars\nwith descriptions"]
    end

    subgraph APPS["apps/"]
        subgraph WEB["apps/web — Next.js Application"]
            APP_DIR["app/\nApp Router pages\nAPI routes\nLayouts"]
            COMP["components/\nReact components\nui, auth, member\ncontribution, mandate"]
            SVC["services/\nBusiness logic\none file per domain"]
            LIB["lib/\nInfrastructure clients\nvalidation schemas\nutility functions"]
            INNGEST_DIR["inngest/\nJob functions\nInngest client config"]
            MW_FILE["middleware.ts\nRoute protection"]
        end
    end

    subgraph PACKAGES["packages/"]
        subgraph DB_PKG["packages/database — Prisma Package"]
            SCHEMA["prisma/schema.prisma\n382 lines\n14 tables 13 enums"]
            MIGRATIONS["prisma/migrations/\n20241201000000_initial_schema\nAll future migrations"]
            SEED["prisma/seed.ts\nRoles, founder, templates"]
        end
    end

    subgraph DOCS_DIR["docs/"]
        ARCH["architecture/\nC4 diagrams"]
        DB_DOCS["database/\nERD, normalization"]
        FLOWS["flows/\nSequence diagrams"]
        SEC["security/\nSecurity architecture"]
        CONST["constitutions/\nCoding standards"]
        BUILD["build-order.md\nModule build plan"]
        API_SPEC["api-contract.yaml\nOpenAPI 3.0 spec"]
    end

    ROOT --> APPS
    ROOT --> PACKAGES
    ROOT --> DOCS_DIR
```

---

## Environment Variable Reference

| Variable | Required In | Purpose |
|---|---|---|
| `DATABASE_URL` | All tiers | Neon PostgreSQL connection string |
| `NEXTAUTH_SECRET` | All tiers | JWT signing secret (min 32 chars) |
| `NEXTAUTH_URL` | All tiers | Base URL for NextAuth callbacks |
| `ENCRYPTION_KEY` | All tiers | AES-256 key for ID and bank account encryption (64 hex chars) |
| `NETCASH_SERVICE_KEY` | All tiers | Netcash API authentication key |
| `NETCASH_WEBHOOK_SECRET` | All tiers | HMAC secret for webhook verification |
| `NETCASH_API_URL` | All tiers | Sandbox or live Netcash endpoint |
| `BULKSMS_USERNAME` | All tiers | BulkSMS account username |
| `BULKSMS_PASSWORD` | All tiers | BulkSMS account password |
| `RESEND_API_KEY` | All tiers | Resend API key |
| `RESEND_FROM_EMAIL` | All tiers | Verified sender email address |
| `INNGEST_EVENT_KEY` | All tiers | Inngest event publish key |
| `INNGEST_SIGNING_KEY` | All tiers | Inngest webhook signature key |
| `UPSTASH_REDIS_REST_URL` | All tiers | Upstash Redis endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | All tiers | Upstash Redis auth token |
| `BLOB_READ_WRITE_TOKEN` | All tiers | Vercel Blob read/write token |
| `FOUNDER_EMAIL` | Seed script | Founder admin account email |
| `FOUNDER_PHONE` | Seed script | Founder admin account phone |
| `FOUNDER_PASSWORD` | Seed script | Founder admin account password |
| `WHATSAPP_GROUP_LINK` | Runtime | WhatsApp group deep link |

## Service Dependency Matrix

| Service | Used By | Failure Behaviour | Retry? |
|---|---|---|---|
| Neon PostgreSQL | All API routes, all Inngest jobs | Hard failure — request returns 500 | Yes — Prisma connection retry |
| Upstash Redis | Middleware, mandate service, Inngest jobs | Soft failure — rate limit skipped, idempotency bypassed | Yes — Upstash client retry |
| Netcash API | mandate.service, contribution.service, debit-run job | Hard failure — payment not processed, status unchanged | Yes — Inngest step retry |
| BulkSMS | notification.service, morning warning job | Soft failure — SMS not sent, notification marked FAILED | Yes — Inngest step retry |
| Resend | auth.service, notification.service | Soft failure — email not sent, can be resent | Yes — Inngest step retry |
| Inngest Cloud | Scheduled payment pipeline | Deferred — jobs do not run until recovered | Built-in — automatic backoff |
| Vercel Blob | contribution.service PDF export | Soft failure — statement not generated, can be retried | Manual retry via endpoint |
