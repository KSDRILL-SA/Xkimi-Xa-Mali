# System Context — C4 Level 1

The system boundary: who uses XXM and every external system it depends on. Audience: everyone. Next: [02-container-architecture.md](./02-container-architecture.md).

| | |
|---|---|
| Scale | 4–50 members · R100 min/month |
| Payments | Netcash DebiCheck debit orders |
| Data | Financial PII — highest tier (POPIA) |
| Platform | Web-first, PWA-capable |

---

## Context

```mermaid
flowchart TB
    MEMBER["Member<br/>views dashboard, manages<br/>mandate, tracks contributions"]
    ADMIN["Admin (dual role)<br/>oversees members, goals,<br/>reports, ledger, audit"]

    subgraph XXM["Xkimm Xa Mali Foundation — Vercel"]
        APP["Next.js 15 platform<br/>member portal · admin · API<br/>scheduled payment pipeline"]
    end

    NETCASH["Netcash<br/>DebiCheck mandates<br/>recurring debits · webhooks"]
    BULKSMS["BulkSMS<br/>warnings · reminders · receipts"]
    RESEND["Resend<br/>verification · receipts · statements"]
    NEON[("Neon PostgreSQL 16<br/>primary store · branching · backups")]
    UPSTASH["Upstash Redis<br/>idempotency · rate limit · cache"]
    INNGEST["Inngest<br/>durable jobs · retries · history"]
    BLOB["Vercel Blob<br/>signed-URL PDF statements"]

    MEMBER & ADMIN -->|HTTPS session| APP
    APP -->|mandate + debit API| NETCASH
    NETCASH -->|HMAC webhooks| APP
    APP -->|REST| BULKSMS & RESEND
    BULKSMS -->|delivery receipts| APP
    APP -->|Prisma / pooler| NEON
    APP -->|REST| UPSTASH
    APP -->|publish + trigger| INNGEST
    INNGEST -->|signed webhook| APP
    APP -->|upload + fetch| BLOB
```

---

## Actors

| Member (self-service) | Admin (oversight) | Automated (no human) |
|---|---|---|
| View contribution ledger & history | View all member contributions | 07:00 debit warning SMS |
| Make manual one-off payment | Suspend / reactivate members | 20:00 execute debit orders |
| Create & manage mandate | Create & lock group goals | Daily overdue reminders |
| Update profile & bank account | Generate monthly records | 1st-of-month record creation |
| Set notification preferences | Approve / reject mandates | Process delay requests |
| Download PDF statement | View audit log & ledger | Nightly ledger reconciliation |
| View goals & insights | Create / revoke invites; export CSV | Daily financial-anomaly watch |

---

## Dependency criticality

```mermaid
flowchart TD
    CORE["XXM core"] --> T1 & T2 & T3
    subgraph T1["Tier 1 — business critical (system degraded)"]
        T1A["Netcash — no mandates or debits"]
        T1B["Neon — total outage"]
    end
    subgraph T2["Tier 2 — feature degraded (core stays up)"]
        T2A["Inngest — scheduled jobs pause"]
        T2B["Upstash — rate limit + idempotency fall back"]
    end
    subgraph T3["Tier 3 — notification degraded (payments unaffected)"]
        T3A["BulkSMS — no SMS"]
        T3B["Resend — no email"]
        T3C["Vercel Blob — no PDF download"]
    end
```

| System | Protocol | Auth | Failure impact |
|---|---|---|---|
| Netcash (debit + webhook) | SOAP/REST + webhook | Service key · HMAC-SHA256 | No debit operations / status sync |
| BulkSMS | REST + webhook | Basic auth · IP allowlist | No SMS / no receipts |
| Resend | REST | API key | No email |
| Neon | TCP via pgbouncer | TLS string | Full outage |
| Upstash | REST | Bearer | Rate limit + idempotency disabled |
| Inngest | Webhook | Signing key (HMAC) | Jobs paused |
| Vercel Blob | REST | Bearer | PDFs unavailable |
