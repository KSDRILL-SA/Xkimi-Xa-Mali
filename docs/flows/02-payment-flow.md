# Payment & Mandate Flow

Mandate lifecycle, the nightly debit pipeline, manual payments, and webhook settlement into the ledger. Related: [03-contribution-lifecycle.md](./03-contribution-lifecycle.md) · [04-notification-pipeline.md](./04-notification-pipeline.md).

---

## Mandate state machine

```mermaid
stateDiagram-v2
    [*] --> PENDING : member submits → Netcash call
    PENDING --> ACTIVE : webhook ACTIVE
    PENDING --> CANCELLED : webhook rejected
    ACTIVE --> SUSPENDED : webhook SUSPENDED
    ACTIVE --> CANCELLED : member cancels (Netcash cancel call)
    SUSPENDED --> ACTIVE : webhook ACTIVE
    SUSPENDED --> CANCELLED : member / admin cancels
    CANCELLED --> [*] : terminal — record kept for audit
    note right of ACTIVE
        Debited only when ACTIVE,
        debitDay = today, no Redis delay flag.
    end note
```

## Mandate creation

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as POST /mandates
    participant SVC as mandate.service
    participant DB as PostgreSQL
    participant NC as Netcash

    B->>API: mandate data (rate limit 10/h/user)
    API->>API: Zod — debitDay 1-28, amount ≥ 100
    API->>SVC: createMandate(userId, params)
    SVC->>DB: reject if an ACTIVE mandate exists
    SVC->>DB: decrypt bank account
    SVC->>SVC: first debit date from SAST calendar parts (no UTC off-by-one)
    SVC->>NC: CreateDebiCheckMandate
    alt Netcash rejects after a DB write was needed
        SVC->>NC: compensating cancel (no orphan mandate)
    end
    SVC->>DB: INSERT mandate (status from Netcash) + audit
    API-->>B: 201
```

---

## Nightly debit pipeline (20:00 SAST)

```mermaid
sequenceDiagram
    participant IC as Inngest 20:00
    participant JOB as debit-run
    participant RD as Redis
    participant DB as PostgreSQL
    participant NC as Netcash

    IC->>JOB: cron
    JOB->>DB: ACTIVE mandates with debitDay = today, ACTIVE users
    loop each mandate
        JOB->>RD: delay flag set? → skip
        JOB->>JOB: idempotency key = userId_mandateId_month_year
        JOB->>DB: transaction with that key already exists? → skip
        JOB->>DB: tx — upsert Contribution (PENDING) + INSERT Transaction PENDING
        JOB->>NC: SubmitScheduledDebit
        alt error
            JOB->>DB: Transaction FAILED → Inngest retries with backoff
        else ok
            JOB->>DB: store gatewayRef, status PROCESSING
            JOB->>RD: set idempotency key (48h)
        end
    end
```

> A morning-warning SMS goes out at 07:00 to everyone whose `debitDay` is today (day number computed from SAST calendar parts, not `toISOString`).

---

## Settlement → ledger (Netcash result webhook)

```mermaid
sequenceDiagram
    participant NC as Netcash
    participant WH as POST /webhooks/netcash
    participant DD as webhook-dedupe
    participant SVC as contribution.service
    participant DB as PostgreSQL
    participant LED as ledger.service
    participant N as notifications

    NC->>WH: result (SUCCESS / FAILED / REVERSED)
    WH->>WH: verify HMAC (timingSafeEqual)
    WH->>DD: claim eventKey = sha256(body)
    alt duplicate
        DD-->>WH: already processed → 200, no-op
    end
    WH->>SVC: settle(gatewayRef, result)
    SVC->>DB: tx begin
    alt SUCCESS
        SVC->>DB: Transaction SUCCESS, Contribution amountPaid += amount, recompute status
        SVC->>LED: post pool CREDIT (idempotent on refType,refId,direction)
        SVC->>N: payment-success SMS + email + inbox
    else FAILED
        SVC->>DB: Transaction FAILED
        SVC->>N: payment-failed SMS
    else REVERSED
        SVC->>DB: Transaction REVERSED
        SVC->>LED: post pool DEBIT (idempotent)
    end
    SVC->>DB: tx commit
    WH->>DD: release eventKey on failure (so a retry can re-run)
    WH-->>NC: 200
```

Pool balance = Σ CREDIT − Σ DEBIT, rebuilt nightly by `reconcileLedger`. A manual payment (`POST /contributions/pay`) follows the same settle path via its own once-off Netcash debit.
