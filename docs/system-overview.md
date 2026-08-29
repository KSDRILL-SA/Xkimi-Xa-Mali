# System Overview

> *"It is more blessed to give than to receive."* — Acts 20:35

The whole system on one page. Deeper detail lives in [requirements](./requirements.md) · [architecture/](./architecture/) · [flows/](./flows/) · [database/01-erd.md](./database/01-erd.md) · [security/01-security-architecture.md](./security/01-security-architecture.md).

---

## What it is

| | |
|---|---|
| **System** | Xkimi Xa Mali Foundation (XXM) — family savings group |
| **Does** | Contribution tracking, automated DebiCheck debits, append-only financial ledger |
| **Users** | Admin (founder, dual-role) · Members |
| **Scale** | 4–50 members, <1,000 req/day (v1) |
| **Sensitivity** | Financial + PII — highest tier (POPIA) |
| **Platform** | Web, PWA-capable, mobile-first |

### Stack at a glance

*(full detail, every package and version, in
[architecture/02-container-architecture.md](./architecture/02-container-architecture.md)
and [architecture/03-component-architecture.md](./architecture/03-component-architecture.md);
this table is the one-line summary)*

| Layer | Tech | Why |
|---|---|---|
| Apps | 3 × Next.js 16, App Router (`web`, `admin`, `website`) | One deployment per audience — a member session can never reach admin code, and the public site ships with zero database/auth/payment dependencies at all |
| Shared code | `@xxm/database`, `@xxm/utils`, `@xxm/ui`, `@xxm/observability`, `@xxm/types`, `@xxm/config` — npm workspace packages, consumed as TS source (no build step) | One Prisma schema, one set of money/date/validation helpers, one component library — not re-implemented per app |
| Database | PostgreSQL / Neon · Prisma 6 | ACID — non-negotiable for money |
| Auth | NextAuth v5 (beta) · JWT cookies, `@auth/prisma-adapter` | No `localStorage` token exposure |
| Validation | Zod, same schema on client (React Hook Form) and server | A malformed request is rejected at the edge, never reaches a service |
| Payments | Netcash DebiCheck — a hand-written SOAP 1.1 client against Netcash's own WSDL, not REST | SA-native recurring debit ([ADR-001](./adr/001-netcash-over-payfast.md)) |
| Jobs | Inngest, 22 functions | Durable + retryable ([ADR-002](./adr/002-inngest-job-engine.md)) |
| Cache / limits | Upstash Redis | Serverless sliding windows |
| SMS · Email · Files | BulkSMS (REST/JSON) · Resend · Vercel Blob (private access) | |
| PDF generation | `@react-pdf/renderer`, `apps/web` only | Statements, contribution reports, the founder guide |
| Testing | Vitest everywhere; `apps/website` also has React Testing Library + `happy-dom` for component tests | The only app with DOM-level component tests — the other two test services/routes, not rendered output |
| Error tracking | Sentry — `web` and `admin` each have their own project; `website` has none | |
| Uptime monitoring | **Planned, not built.** No such dependency exists in the repo yet — do not assume it's live from an older doc mentioning it | |

---

## Bounded contexts

No context reads another context's tables directly — all cross-context data flows through service interfaces.

```mermaid
flowchart TD
    subgraph IDENTITY["Identity"]
        ID["Users · Roles · Sessions · Invitations"]
    end
    subgraph MEMBERSHIP["Membership"]
        MEM["Profiles · Bank accounts · Mandates"]
    end
    subgraph CONTRIB["Contributions"]
        CON["Monthly records · Payment cycles"]
    end
    subgraph PAYMENTS["Payments"]
        PAY["Transactions · Gateway · Webhooks (deduped)"]
    end
    subgraph LEDGER["Ledger"]
        LED["Append-only pool ledger · Reconciliation"]
    end
    subgraph ENGAGE["Engagement"]
        ENG["Goals (cheers · comments · pledges)<br/>Badges · Community · Budgets"]
    end
    subgraph INSIGHT["Insights"]
        INS["Forecast · On-time rate · At-risk nudges"]
    end
    subgraph NOTIFY["Notifications"]
        NOT["Templates · SMS / Email · Inbox"]
    end
    subgraph REPORT["Reporting"]
        REP["Signed PDF statements · CSV"]
    end
    subgraph ADMIN["Admin"]
        ADM["Dashboard · Audit · Anomaly watch"]
    end

    IDENTITY --> MEMBERSHIP --> CONTRIB --> PAYMENTS --> LEDGER
    PAYMENTS -->|events| NOTIFY
    ENGAGE -->|events| NOTIFY
    CONTRIB --> INSIGHT
    CONTRIB --> REPORT
    LEDGER --> REPORT
    ADMIN --> IDENTITY & MEMBERSHIP & CONTRIB & PAYMENTS & LEDGER & ENGAGE & REPORT
```

### Data classification

| Entity | Class | Protection |
|---|---|---|
| Email, phone | PII | Indexed, not encrypted |
| SA ID number, bank account number | Sensitive / Financial PII | AES-256-GCM at rest |
| Transaction amounts, ledger | Financial | Access-controlled, `Decimal(10,2)` |
| Passwords | Credentials | bcrypt cost 12 |
| Reset / verify / invite tokens | Credentials | SHA-256 hash only |
| Session | Credentials | HTTP-only + Secure cookie, SameSite=Lax |

Data model: **34 models, 17 enums** — full ERD in [database/01-erd.md](./database/01-erd.md).

---

## Runtime architecture

```mermaid
flowchart TD
    subgraph EDGE["Vercel Edge"]
        MW["middleware.ts<br/>route tiers L0–L3 · JWT · rate limit"]
    end
    subgraph APPS["Next.js apps"]
        WEB["apps/web :3000<br/>portal + API"]
        ADMIN["apps/admin :3002"]
        SITE["apps/website :3001"]
    end
    subgraph DATA["Data"]
        NEON[("Neon PostgreSQL")]
        REDIS["Upstash Redis"]
        BLOB["Vercel Blob"]
    end
    subgraph JOBS["Inngest jobs"]
        J["debit run · morning warning · overdue<br/>month rollover · ledger + contribution reconcile<br/>anomaly watch · statement notice · badges · invites"]
    end
    subgraph EXT["External"]
        NETCASH["Netcash"]
        BULKSMS["BulkSMS"]
        RESEND["Resend"]
    end

    MW --> APPS
    WEB --> NEON & REDIS & BLOB
    WEB --> JOBS
    ADMIN -->|internal API| WEB
    JOBS --> NEON & NETCASH & BULKSMS & RESEND
    NETCASH -->|signed webhook| WEB
```

### Monthly debit run + ledger

```mermaid
sequenceDiagram
    participant CRON as Inngest Cron
    participant RUN as debit.run
    participant DB as PostgreSQL
    participant NC as Netcash
    participant WH as /webhooks/netcash
    participant LED as Ledger
    participant N as SMS + Email + Inbox

    CRON->>RUN: 20:00 SAST daily
    RUN->>DB: mandates due today, not delayed
    loop each mandate
        RUN->>DB: INSERT Transaction PENDING + idempotency key
        RUN->>NC: submit DebiCheck debit
    end
    NC-->>WH: webhook (claim eventKey — dedupe)
    alt SUCCESS
        WH->>DB: Transaction SUCCESS, Contribution PAID
        WH->>LED: post pool CREDIT (idempotent)
        WH->>N: confirmation
    else FAILED
        WH->>DB: Transaction FAILED, Contribution OVERDUE
        Note over WH: daily overdue reminder follows
    else REVERSED
        WH->>LED: post pool DEBIT (idempotent)
    end
```

**Integration surface:** Netcash (debit submit + webhook), BulkSMS (SMS + receipts), Resend (email), Inngest (jobs), Vercel Blob (PDFs), WhatsApp (deep link only).

---

## API & route tiers

Base path `/api/v1/`. Full spec: [api-contract.yaml](./api-contract.yaml).

```mermaid
flowchart LR
    L0["L0 Public<br/>/ · /whatsapp · /auth/*<br/>health · stats/public"]
    L1["L1 Member<br/>own data: members · mandates<br/>contributions · transactions<br/>goals(read) · insights · inbox"]
    L2["L2 Admin<br/>/admin/* · goals(write)<br/>ledger · invitations · signatures"]
    L3["L3 System<br/>webhooks/* — HMAC only<br/>sessions rejected"]
```

**Response envelope:** success `{ data, meta: { traceId, pagination? } }` · error `{ error: { code, message, traceId } }`.

---

## Security model

| Tier | Who | Scope |
|---|---|---|
| L0 | Public | Homepage, auth, health, public stats |
| L1 | Member | Own data only |
| L2 | Admin | All member data, financials, ledger, audit |
| L3 | System | Webhooks — HMAC only, no session |

**L4 hard blocks** (service-layer, can't be bypassed by middleware misconfig): members can't read another member's bank/ID number; members can't write `Transaction`/`Contribution`/`LedgerEntry` directly; admins can't delete transactions — only post a `REVERSED` (which writes a ledger DEBIT); webhook endpoints reject any request carrying a session cookie. Full model: [security/01-security-architecture.md](./security/01-security-architecture.md).

---

## Integrity & operations

**Key constraints:** `UNIQUE(userId, periodMonth, periodYear)` on Contribution (no double-billing) · `UNIQUE(idempotencyKey)` on Transaction (no double-charge) · `UNIQUE(refType, refId, direction)` on LedgerEntry (idempotent posting) · `UNIQUE(source, eventKey)` on ProcessedWebhookEvent (dedupe) · `Decimal(10,2)` on all money.

**Environments:** Local (Neon dev branch, no Docker) → Preview (Neon PR branch, auto per PR) → Production (Neon `staging` branch — the real one, see [architecture/04-infrastructure-deployment.md](./architecture/04-infrastructure-deployment.md) for the naming trap). **Monitoring:** Sentry (errors, `web`+`admin`), Vercel Analytics (Web Vitals), Inngest dashboard (jobs). Uptime monitoring on `/health` is planned, not yet built — an earlier version of this line named Better Stack for it; nothing has actually been wired up.

**Build status:** all 13 modules (M01–M12 + M11a) and Phase-2 hardening complete; Phase-3 backend (ledger, webhook dedupe, anomaly watch, insights, resilience) shipped. See [build-order.md](./build-order.md). Go-live steps: [../DEPLOYMENT.md](../DEPLOYMENT.md).
