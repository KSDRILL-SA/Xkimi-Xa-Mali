# Container Architecture — C4 Level 2

The technical containers inside XXM and how they talk. All application logic lives in one Next.js deployment — there is no separate backend service; `packages/database` only owns the Prisma schema. Prev: [01-system-context.md](./01-system-context.md) · Next: [03-component-architecture.md](./03-component-architecture.md).

| Container | Tech | Responsibility |
|---|---|---|
| Web application | Next.js 15 · React 19 · TS | Portal, admin API, REST API, job webhook receiver |
| Database | Neon PostgreSQL 16 · Prisma 6 | All persistent data (34 models) |
| Cache / limiter | Upstash Redis | Idempotency keys, rate-limit counters, delay flags |
| Job engine | Inngest Cloud | Durable scheduled jobs — debits, rollover, reconciliation, notifications |
| File storage | Vercel Blob | Signed-URL PDF statements |
| Gateways | Netcash · BulkSMS · Resend | Debits, SMS, email |

---

## Containers

```mermaid
flowchart TB
    UI["Browser / PWA<br/>React 19 · Tailwind · App Router"]

    subgraph VERCEL["Vercel — apps/web"]
        MW["Middleware<br/>route tiers · JWT · rate limit"]
        PAGES["App Router pages"]
        API["REST API /api/v1/*<br/>Zod-validated"]
        FN["Inngest functions"]
    end

    NEON[("Neon PostgreSQL")]
    REDIS["Upstash Redis"]
    BLOB["Vercel Blob"]
    INNGEST["Inngest Cloud<br/>cron · fan-out · retry"]
    NETCASH["Netcash"]
    BULKSMS["BulkSMS"]
    RESEND["Resend"]

    UI -->|HTTPS| MW --> PAGES & API
    INNGEST -->|HMAC POST /webhooks/inngest| FN
    API --> NEON & REDIS & BLOB
    API --> NETCASH & BULKSMS & RESEND
    NETCASH -->|HMAC webhooks| API
    BULKSMS -->|receipts| API
    API -->|publish| INNGEST
    FN --> NEON & REDIS & NETCASH & BULKSMS & RESEND
```

---

## Request lifecycle (authenticated read)

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Middleware
    participant API as Route handler
    participant SVC as Service
    participant DB as PostgreSQL
    participant RD as Redis

    B->>MW: request + session cookie
    MW->>RD: rate-limit check (sliding window)
    MW->>MW: validate JWT · check role vs route tier
    MW->>API: forward with session context
    API->>API: Zod-parse input
    API->>SVC: typed call
    SVC->>DB: Prisma query (tx if write)
    DB-->>SVC: rows
    SVC-->>API: typed result
    API-->>B: { data, meta: { traceId } }
```

## Job lifecycle (debit run)

```mermaid
sequenceDiagram
    participant IC as Inngest Cloud
    participant WH as Webhook handler
    participant FN as Function
    participant DB as PostgreSQL
    participant RD as Redis
    participant NC as Netcash

    IC->>WH: POST /webhooks/inngest (HMAC)
    WH->>WH: verify signing key
    WH->>FN: dispatch
    FN->>DB: active mandates due today
    FN->>RD: idempotency key absent?
    FN->>DB: upsert Transaction PENDING
    FN->>NC: submit debit
    NC-->>FN: gateway ref
    FN->>DB: store ref
    FN->>RD: set idempotency key (48h)
    FN-->>IC: step complete (Inngest records / retries)
```

> Settlement (webhook → Transaction SUCCESS/FAILED/REVERSED → Contribution status → **ledger CREDIT/DEBIT** → notifications) is covered in [../flows/02-payment-flow.md](../flows/02-payment-flow.md).

---

## Consistency & responsibilities

- **Writes** → PostgreSQL with full ACID; multi-table writes run in Prisma transactions. Money-moving writes (`debit.run`, month rollover) are guarded by Redis idempotency keys + DB `UNIQUE` constraints.
- **Reads** → single primary node, read-your-writes, no stale reads.

| Container | Owns | Does **not** own |
|---|---|---|
| API routes | Parsing, auth, validation, response shape | Business logic (delegates to services) |
| Service layer | Business logic, DB orchestration, external calls | HTTP concerns |
| Prisma | Query building, connection, type safety | Business rules |
| Middleware | Route protection, JWT decode, rate limit | Auth logic (NextAuth) |
| Inngest functions | Orchestration, retry, step sequencing | Business logic (delegates to services) |
| Redis | Idempotency, rate state, delay flags | Persistent data |
