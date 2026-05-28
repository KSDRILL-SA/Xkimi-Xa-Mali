# Container Architecture — C4 Level 2

| | |
|---|---|
| **Purpose** | Shows the major technical containers inside XXM and how they communicate |
| **C4 Level** | Level 2 — Containers |
| **Audience** | Engineers, DevOps, technical leads |
| **Related Docs** | [01-system-context.md](./01-system-context.md) · [03-component-architecture.md](./03-component-architecture.md) · [04-infrastructure-deployment.md](./04-infrastructure-deployment.md) |

---

## Container Overview

XXM is a monorepo with two workspaces. All application logic lives in a single Next.js deployment — there is no separate backend service. The database package exists purely to own the Prisma schema and migrations; it has no runtime server.

| Container | Technology | Responsibility |
|---|---|---|
| Web Application | Next.js 15, TypeScript, React 19 | Member portal, admin dashboard, REST API, job webhook receiver |
| Primary Database | Neon PostgreSQL 16 via Prisma 6 | All persistent data — users, mandates, contributions, audit logs |
| Cache and Rate Limiter | Upstash Redis via REST | Idempotency keys, rate limit counters, debit delay state |
| Job Engine | Inngest Cloud | Durable scheduled jobs — debit pipeline, month rollover, notifications |
| File Storage | Vercel Blob | PDF statement storage with signed URL delivery |
| SMS Gateway | BulkSMS REST API | Outbound SMS — warnings, reminders, receipts |
| Email Service | Resend REST API | Transactional emails — verification, reset, receipts, statements |
| Payment Gateway | Netcash DebiCheck API | Mandate registration, debit order submission, status webhooks |

---

## Diagram 1 — Container Architecture (C4 Level 2)

```mermaid
flowchart TB
    subgraph BROWSER["Browser or PWA Client"]
        UI["React 19 UI\nTailwind CSS\nReact Hook Form\nNext.js App Router pages"]
    end

    subgraph VERCEL["Vercel Edge Network"]
        subgraph NEXTJS["Next.js 15 Application — apps/web"]
            MW["Middleware\nRoute protection L0 L1 L2\nJWT validation\nRate limit enforcement"]
            PAGES["App Router Pages\nauth, member dashboard\nadmin dashboard\npublic pages"]
            API["REST API Routes\n/api/v1/*\nAll server-side logic\nZod-validated inputs"]
            INNGEST_FN["Inngest Functions\nDebit pipeline jobs\nNotification flush\nMonth rollover"]
        end
    end

    subgraph DATA["Data Layer"]
        NEON["Neon PostgreSQL\n14 tables\nPrisma 6 ORM\nConnection pooler"]
        REDIS["Upstash Redis\nIdempotency keys 48h TTL\nRate limit sliding windows\nDebit delay flags"]
    end

    subgraph FILES["File Storage"]
        BLOB["Vercel Blob\nPDF statements\nSigned URLs 15 min TTL"]
    end

    subgraph JOBS["Job Orchestration"]
        INNGEST_CLOUD["Inngest Cloud\nCron schedules\nEvent fan-out\nRetry with backoff"]
    end

    subgraph PAYMENTS["Payment Infrastructure"]
        NETCASH["Netcash\nDebiCheck API\nMandate management\nDebit order execution"]
    end

    subgraph COMMS["Communications"]
        BULKSMS["BulkSMS\nSMS REST API\nDelivery receipts"]
        RESEND["Resend\nEmail REST API\nTemplate rendering"]
    end

    UI -->|"HTTPS — all requests"| MW
    MW --> PAGES
    MW --> API
    INNGEST_CLOUD -->|"HMAC-signed POST to /api/v1/webhooks/inngest"| INNGEST_FN

    API -->|"Prisma ORM — TCP TLS"| NEON
    API -->|"Redis REST — HTTPS"| REDIS
    API -->|"Mandate and debit calls — HTTPS"| NETCASH
    NETCASH -->|"Status webhooks — HMAC verified"| API
    API -->|"SMS dispatch — HTTPS"| BULKSMS
    BULKSMS -->|"Delivery callbacks"| API
    API -->|"Email dispatch — HTTPS"| RESEND
    API -->|"PDF upload and fetch — HTTPS"| BLOB
    API -->|"Event publish — HTTPS"| INNGEST_CLOUD

    INNGEST_FN -->|"Prisma ORM"| NEON
    INNGEST_FN -->|"Redis REST"| REDIS
    INNGEST_FN -->|"Debit execution"| NETCASH
    INNGEST_FN -->|"SMS dispatch"| BULKSMS
    INNGEST_FN -->|"Email dispatch"| RESEND
    INNGEST_FN -->|"Event send for chaining"| INNGEST_CLOUD
```

---

## Diagram 2 — HTTP Request Lifecycle

> Traces a typical authenticated member API request from browser to database and back.

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Vercel Edge
    participant MW as Middleware
    participant API as API Route Handler
    participant SVC as Service Layer
    participant DB as Neon PostgreSQL
    participant RD as Upstash Redis

    B->>E: HTTPS request with session cookie
    E->>MW: Forward to middleware
    MW->>RD: Rate limit check (sliding window)
    RD-->>MW: Allow or reject
    MW->>MW: Validate JWT from cookie
    MW->>MW: Check role against route tier
    MW->>API: Forward with session context
    API->>API: Parse and validate body with Zod
    API->>SVC: Call service method with typed params
    SVC->>DB: Prisma query (transaction if write)
    DB-->>SVC: Result rows
    SVC-->>API: Typed service response
    API-->>B: JSON success or error response
```

---

## Diagram 3 — Inngest Job Execution Lifecycle

> Traces how a scheduled debit job travels from Inngest Cloud into the application.

```mermaid
sequenceDiagram
    participant IC as Inngest Cloud Scheduler
    participant WH as Webhook Handler
    participant FN as Inngest Function
    participant DB as Neon PostgreSQL
    participant RD as Upstash Redis
    participant NC as Netcash API
    participant SMS as BulkSMS

    IC->>WH: POST /api/v1/webhooks/inngest (HMAC signed)
    WH->>WH: Verify signing key
    WH->>FN: Dispatch to matching function
    FN->>DB: Query active mandates for today
    DB-->>FN: Mandate list
    FN->>RD: Check idempotency key per mandate
    RD-->>FN: Key absent — safe to proceed
    FN->>DB: Upsert Transaction record (PENDING)
    FN->>NC: Submit debit order to Netcash
    NC-->>FN: Acknowledgement reference
    FN->>DB: Update Transaction (gatewayRef stored)
    FN->>RD: Set idempotency key (48h TTL)
    FN->>SMS: Dispatch payment queued SMS
    FN-->>IC: Step complete — Inngest records result
    IC->>IC: Schedule next step or retry on failure
```

---

## Diagram 4 — Write Path vs Read Path

> Separates commands (writes) from queries (reads) to show consistency guarantees.

```mermaid
flowchart LR
    subgraph WRITES["Write Path — Commands"]
        W1["Register member"]
        W2["Create mandate"]
        W3["Submit payment"]
        W4["Cancel mandate"]
        W5["Update profile"]
        W6["Generate monthly records"]
        W7["Write audit log entry"]
    end

    subgraph READS["Read Path — Queries"]
        R1["Dashboard stats"]
        R2["Contribution ledger"]
        R3["Mandate list"]
        R4["Notification inbox"]
        R5["Member summary"]
        R6["Admin member list"]
        R7["Audit log view"]
    end

    subgraph CONSISTENCY["Consistency Guarantees"]
        DB_W["PostgreSQL\nFull ACID\nPrisma transactions\nfor multi-table writes"]
        DB_R["PostgreSQL\nRead-your-writes\nNo stale reads\nSingle primary node"]
        IDEM["Redis idempotency\nPrevents double-charge\non retried jobs"]
    end

    WRITES --> DB_W
    READS --> DB_R
    W3 --> IDEM
    W6 --> IDEM
```

---

## Container Responsibility Matrix

| Container | Owns | Does NOT Own |
|---|---|---|
| Next.js API Routes | Request parsing, auth, validation, response formatting | Business logic (delegates to services) |
| Service Layer | Business logic, DB orchestration, external API calls | HTTP concerns, request/response shapes |
| Prisma ORM | Query building, connection management, type safety | Business rules, validation |
| Middleware | Route protection, JWT decode, rate limit enforcement | Authentication logic (delegates to NextAuth) |
| Inngest Functions | Job orchestration, retry strategy, step sequencing | Business logic (delegates to services) |
| Redis | Idempotency, rate state, delay flags | Persistent data (only ephemeral state) |
