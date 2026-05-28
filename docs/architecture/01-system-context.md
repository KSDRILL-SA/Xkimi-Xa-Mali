# System Context — C4 Level 1

| | |
|---|---|
| **Purpose** | Defines the system boundary, its actors, and every external system it integrates with |
| **C4 Level** | Level 1 — System Context |
| **Audience** | All stakeholders — technical and non-technical |
| **Related Docs** | [02-container-architecture.md](./02-container-architecture.md) · [../database/01-erd.md](../database/01-erd.md) · [../flows/02-payment-flow.md](../flows/02-payment-flow.md) |

---

## What Is Xkimm Xa Mali?

Xkimm Xa Mali (XXM) is a private financial contribution management platform built for a family savings group. It automates monthly debit orders, tracks every rand contributed, manages member banking mandates, and gives every member a live view of their financial standing within the group — all without requiring manual collection or spreadsheet tracking.

| Attribute | Value |
|---|---|
| **Scale target** | 4 to 50 members |
| **Minimum contribution** | R100 per month per member |
| **Payment mechanism** | Automated DebiCheck debit orders via Netcash |
| **Data classification** | Financial PII — highest sensitivity tier |
| **Compliance** | POPIA (Protection of Personal Information Act, SA) |
| **Platform** | Web-first, PWA-capable, mobile-optimised |

---

## Diagram 1 — System Context (C4 Level 1)

> Every actor and external system the platform touches, and why.

```mermaid
flowchart TB
    subgraph ACTORS["People"]
        MEMBER["Member\n────────────────\nFamily contributor\n4 to 50 people\nViews dashboard, manages\nmandates, tracks contributions"]
        ADMIN["Admin\n────────────────\nFounder slash Administrator\nDual ADMIN and MEMBER role\nOversees all members, goals,\nreports, and audit logs"]
    end

    subgraph XXM["Xkimm Xa Mali — Web Platform"]
        APP["Next.js 15 Web Application\n────────────────\nMember portal and admin dashboard\nREST API layer\nScheduled payment pipeline\nHosted on Vercel"]
    end

    subgraph PAYMENT_INFRA["Payment Infrastructure"]
        NETCASH["Netcash\n────────────────\nSA payment gateway\nDebiCheck authenticated mandates\nRecurring debit order execution\nWebhook status callbacks"]
    end

    subgraph COMMUNICATIONS["Communications"]
        BULKSMS["BulkSMS\n────────────────\nLeading SA SMS provider\nPayment warnings at 07h00\nOverdue reminders\nDelivery receipt webhooks"]
        RESEND["Resend\n────────────────\nTransactional email delivery\nVerification and reset emails\nPayment receipts\nStatement delivery"]
    end

    subgraph CLOUD["Cloud Infrastructure"]
        NEON["Neon — PostgreSQL 16\n────────────────\nPrimary relational data store\nDB branching for staging\nAutomatic backups\nServerless scale-to-zero"]
        UPSTASH["Upstash — Redis\n────────────────\nIdempotency key store\nRate limit counters\nDebit delay state\nSession cache"]
        INNGEST["Inngest Cloud\n────────────────\nDurable job orchestration\nScheduled debit pipeline\nRetry and backoff logic\nFull execution history"]
        BLOB["Vercel Blob\n────────────────\nPDF statement storage\n15-minute signed URLs\nCDN-delivered downloads"]
    end

    MEMBER -->|"HTTPS — browser session"| APP
    ADMIN -->|"HTTPS — browser session"| APP

    APP -->|"DebiCheck mandate API"| NETCASH
    NETCASH -->|"HMAC-signed webhook callbacks"| APP

    APP -->|"SMS via REST API"| BULKSMS
    BULKSMS -->|"Delivery receipt callbacks"| APP

    APP -->|"Transactional email via REST API"| RESEND

    APP -->|"Prisma ORM via connection pooler"| NEON
    APP -->|"Redis REST API"| UPSTASH
    APP -->|"Event publish and job trigger"| INNGEST
    INNGEST -->|"Signed webhook — job execution"| APP
    APP -->|"PDF upload and signed URL fetch"| BLOB
```

---

## Diagram 2 — Actor Responsibilities

> What each actor does inside the platform.

```mermaid
flowchart LR
    subgraph MEMBER_ACTIONS["Member — self-service"]
        MA1["View contribution\nledger and history"]
        MA2["Make manual\none-off payment"]
        MA3["Create and manage\nDebiCheck mandate"]
        MA4["Update profile\nand bank account"]
        MA5["Set notification\npreferences"]
        MA6["Download PDF\nstatement"]
        MA7["View group\nfinancial goals"]
        MA8["Request debit\ndelay"]
    end

    subgraph ADMIN_ACTIONS["Admin — oversight and control"]
        AA1["View all member\ncontributions"]
        AA2["Suspend or reactivate\na member account"]
        AA3["Create and lock\ngroup financial goals"]
        AA4["Generate monthly\ncontribution records"]
        AA5["View full audit\nlog trail"]
        AA6["Create and revoke\nmember invitations"]
        AA7["Export admin\nCSV reports"]
        AA8["Trigger emergency\nmanual debit"]
    end

    subgraph SYSTEM_ACTIONS["Automated — no human trigger"]
        SA1["07h00 daily\nDebit warning SMS"]
        SA2["20h00 daily\nExecute debit orders"]
        SA3["Daily\nOverdue reminders"]
        SA4["1st of month\nCreate PENDING records"]
        SA5["Event-driven\nProcess delay requests"]
    end
```

---

## Diagram 3 — External System Integration Map

> Classifies each external dependency by criticality and failure behaviour.

```mermaid
flowchart TD
    subgraph TIER1["Tier 1 — Business Critical\nSystem is degraded without these"]
        T1A["Netcash\nNo mandates or debits possible\nif unavailable"]
        T1B["Neon PostgreSQL\nComplete outage if unavailable\nAll reads and writes fail"]
    end

    subgraph TIER2["Tier 2 — Feature Degraded\nCore platform remains up"]
        T2A["Inngest\nScheduled jobs do not run\nManual debit trigger still works"]
        T2B["Upstash Redis\nRate limiting and idempotency disabled\nApp remains functional with fallback"]
    end

    subgraph TIER3["Tier 3 — Notification Degraded\nPayments and data unaffected"]
        T3A["BulkSMS\nSMS alerts not delivered\nPayment pipeline continues"]
        T3B["Resend\nEmails not delivered\nAll other features unaffected"]
        T3C["Vercel Blob\nPDF downloads unavailable\nAll other features unaffected"]
    end

    XXM_CORE["Xkimm Xa Mali\nCore Platform"] --> TIER1
    XXM_CORE --> TIER2
    XXM_CORE --> TIER3
```

---

## External Integration Summary

| System | Provider | Protocol | Auth Method | Failure Impact |
|---|---|---|---|---|
| Debit order gateway | Netcash | SOAP/REST over HTTPS | Service key header | No mandate or debit operations |
| Netcash callbacks | Netcash | HTTP POST webhook | HMAC-SHA256 signature | Mandate status not synced |
| SMS delivery | BulkSMS | REST over HTTPS | Basic Auth | SMS alerts not sent |
| SMS callbacks | BulkSMS | HTTP POST webhook | IP allowlist | Delivery status not tracked |
| Email delivery | Resend | REST over HTTPS | API key bearer | Emails not delivered |
| Primary database | Neon PostgreSQL | TCP via pgbouncer | TLS connection string | Full service outage |
| Cache and rate limiting | Upstash Redis | HTTPS REST | Bearer token | Rate limiting and idempotency disabled |
| Job orchestration | Inngest Cloud | HTTPS webhook | Signing key (HMAC) | Scheduled jobs do not run |
| File storage | Vercel Blob | HTTPS REST | Bearer token | PDF statements unavailable |
