# Contribution Lifecycle

A contribution record from monthly creation through settlement or write-off. Related: [02-payment-flow.md](./02-payment-flow.md) · [04-notification-pipeline.md](./04-notification-pipeline.md).

---

## Status state machine

```mermaid
stateDiagram-v2
    [*] --> PENDING : month-rollover (1st), amountPaid = 0
    PENDING --> PARTIAL : payment < amountDue
    PENDING --> PAID : payment = amountDue
    PENDING --> OVERDUE : dueDate passed, nothing paid
    PARTIAL --> PAID : top-up reaches amountDue
    PARTIAL --> OVERDUE : dueDate passed, still short
    OVERDUE --> PAID : late full payment
    OVERDUE --> PARTIAL : late partial payment
    OVERDUE --> WAIVED : admin waives (irreversible)
    PARTIAL --> WAIVED : admin waives balance
    PAID --> [*]
    WAIVED --> [*]
    note right of OVERDUE
        Triggers the daily overdue reminder
        (max 1 / day / member).
    end note
```

## Status recalculation (after any payment)

```mermaid
flowchart TD
    EV["payment event<br/>amountPaid += amount"] --> C1{"amountPaid ≥ amountDue?"}
    C1 -->|yes| PAID["PAID → success notification"]
    C1 -->|no| C2{"amountPaid > 0?"}
    C2 -->|yes| C3{"dueDate < today?"}
    C3 -->|yes| OP["OVERDUE (partial)"]
    C3 -->|no| PARTIAL["PARTIAL"]
    C2 -->|no| C4{"dueDate < today?"}
    C4 -->|yes| OVER["OVERDUE → reminder"]
    C4 -->|no| PEND["PENDING"]
```

`status` is stored (not derived live) so overdue sweeps are a simple `WHERE status = 'OVERDUE'`; the service keeps it in sync. `amountDue` is snapshotted from the mandate amount at creation — future mandate changes never rewrite history.

---

## Monthly rollover (1st of month)

```mermaid
sequenceDiagram
    participant IC as Inngest (1st)
    participant JOB as month-rollover
    participant DB as PostgreSQL

    IC->>JOB: cron
    JOB->>DB: ACTIVE users with an ACTIVE mandate
    loop each member
        JOB->>DB: exists for (userId, month, year)? → skip (idempotent)
        JOB->>DB: INSERT Contribution PENDING<br/>amountDue = mandate.amount, dueDate = month end + audit
    end
```

## Overdue reminder (daily)

```mermaid
sequenceDiagram
    participant IC as Inngest (daily)
    participant JOB as overdue-reminder
    participant DB as PostgreSQL
    participant RD as Redis
    participant N as notifications

    IC->>JOB: cron
    JOB->>DB: OVERDUE contributions for ACTIVE users
    loop each
        JOB->>RD: reminded today? (key TTL 24h) → skip
        JOB->>N: overdue-reminder SMS
        JOB->>RD: set flag (24h)
    end
```

---

## One contribution, many transactions

A contribution can be settled by several transactions (e.g. a R150 debit order + a R50 manual top-up = R200 against R200 due → PAID). Each transaction carries its own idempotency key; each SUCCESS posts a ledger CREDIT.

**Admin overrides** — all L2-gated, confirmation-modal'd, and audited: **waive** an outstanding amount, **generate** monthly records manually (idempotent fallback if the rollover job missed), **force-debit** an immediate once-off charge.
