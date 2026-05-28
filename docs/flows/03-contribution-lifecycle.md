# Contribution Lifecycle

| | |
|---|---|
| **Purpose** | Documents the complete lifecycle of a contribution record — from creation through all status transitions to final settlement or write-off |
| **Modules** | M05 Contribution Engine · M06 Job Engine |
| **Related Docs** | [02-payment-flow.md](./02-payment-flow.md) · [04-notification-pipeline.md](./04-notification-pipeline.md) · [../database/01-erd.md](../database/01-erd.md) |

---

## Diagram 1 — Contribution Status State Machine

> Every state a `Contribution` record can be in, and every event that causes a transition.

```mermaid
stateDiagram-v2
    [*] --> PENDING : Monthly rollover job fires on 1st of month\ncontribution-month-rollover creates record\namountPaid = 0

    PENDING --> PARTIAL : Payment received\nbut amountPaid is less than amountDue\nDebit order or manual payment

    PENDING --> PAID : Full payment in one transaction\namountPaid equals amountDue

    PENDING --> OVERDUE : Due date has passed\nstatus recalculation at end of month\nor overdue detection job

    PARTIAL --> PAID : Top-up payment received\namountPaid reaches or exceeds amountDue

    PARTIAL --> OVERDUE : Due date has passed\nPartial payment received but not enough

    OVERDUE --> PAID : Late full payment received\nAllowed — late is better than never

    OVERDUE --> PARTIAL : Late partial payment received\nAmounts toward full clearance

    OVERDUE --> WAIVED : Admin waives the outstanding amount\nAdmin-only action — irreversible

    PARTIAL --> WAIVED : Admin waives remaining balance

    PAID --> [*] : Terminal state\nRecord preserved for history

    WAIVED --> [*] : Terminal state\nRecord preserved for history

    note right of PENDING
        Created by month rollover job
        amountDue = members active mandate amount
        dueDate = last day of that month
    end note

    note right of OVERDUE
        Triggers daily overdue reminder SMS
        up to 1 per day per member
    end note
```

---

## Diagram 2 — Monthly Rollover Job

> On the 1st of every month, new contribution records are created for all active members.

```mermaid
sequenceDiagram
    participant IC as Inngest Cloud 1st of month
    participant JOB as contribution-month-rollover
    participant DB as PostgreSQL
    participant AUDIT as audit.service.ts

    IC->>JOB: Trigger xxm/contribution.month-rollover (cron 1st of month)
    JOB->>JOB: Determine target period\ncurrentMonth and currentYear in SAST
    JOB->>DB: SELECT users WHERE status = ACTIVE\nJOIN payment_mandates WHERE status = ACTIVE
    DB-->>JOB: Active members with active mandate amounts

    loop For each active member
        JOB->>DB: Check if contribution already exists\nfor userId + periodMonth + periodYear
        alt Record already exists
            JOB->>JOB: Skip — idempotent\nSafe to re-run on retry
        end
        JOB->>DB: INSERT contributions\nstatus = PENDING\namountDue = mandate.amount\ndueDate = last day of month\nperiodMonth and periodYear set
        JOB->>AUDIT: writeLog CONTRIBUTION_CREATED, userId, contribution.id
    end

    JOB-->>IC: All records created — step complete
```

---

## Diagram 3 — Status Recalculation Logic

> How the contribution.service determines the correct status after any payment event.

```mermaid
flowchart TD
    EVENT["Payment event received\nDebit webhook SUCCESS\nor Manual payment submitted"]

    EVENT --> UPDATE["UPDATE contributions\nSET amountPaid = amountPaid + paymentAmount"]

    UPDATE --> CHECK1{"amountPaid\n>= amountDue?"}

    CHECK1 -->|"Yes"| SET_PAID["SET status = PAID\nContribution fully cleared"]

    CHECK1 -->|"No"| CHECK2{"amountPaid\n> 0?"}

    CHECK2 -->|"Yes"| CHECK3{"dueDate\n< today?"}

    CHECK3 -->|"Yes — past due"| SET_OVERDUE_PARTIAL["SET status = OVERDUE\nPartial payment but deadline passed"]

    CHECK3 -->|"No — still within month"| SET_PARTIAL["SET status = PARTIAL\nPayment in progress"]

    CHECK2 -->|"No — nothing paid"| CHECK4{"dueDate\n< today?"}

    CHECK4 -->|"Yes"| SET_OVERDUE["SET status = OVERDUE\nNo payment and deadline passed"]

    CHECK4 -->|"No"| SET_PENDING["SET status = PENDING\nNo action yet"]

    SET_PAID --> NOTIFY_SUCCESS["Queue payment-success-sms\nand payment-success-email"]
    SET_OVERDUE --> NOTIFY_OVERDUE["Queue overdue-reminder-sms\n(max 1 per day)"]
    SET_OVERDUE_PARTIAL --> NOTIFY_OVERDUE
```

---

## Diagram 4 — Overdue Detection and Reminder Job

```mermaid
sequenceDiagram
    participant IC as Inngest Cloud daily
    participant JOB as debit-overdue-reminder
    participant DB as PostgreSQL
    participant REDIS as Upstash Redis
    participant NOTIF as notification.service.ts

    IC->>JOB: Trigger xxm/debit.overdue-reminder (daily cron)
    JOB->>DB: SELECT contributions WHERE status = OVERDUE\nAND userId IN (SELECT userId FROM users WHERE status = ACTIVE)
    DB-->>JOB: Overdue contributions list

    loop For each overdue contribution
        JOB->>REDIS: Check reminder-sent flag\nkey: overdue-reminded:userId:periodMonth:periodYear\nTTL 24 hours
        alt Reminder already sent today
            JOB->>JOB: Skip — max 1 reminder per day per contribution
        end
        JOB->>NOTIF: queueNotification(\n  templateSlug: overdue-reminder-sms\n  payload: { firstName, amountDue, amountPaid, period }\n)
        JOB->>REDIS: SET reminder-sent flag TTL 24h
    end

    JOB-->>IC: Complete
```

---

## Diagram 5 — Contribution and Transaction Relationship

> Shows how multiple transactions can settle a single contribution.

```mermaid
flowchart TD
    subgraph CONTRIB["Contribution Record — Jan 2025"]
        CF1["id: ctr_01"]
        CF2["userId: usr_01"]
        CF3["periodMonth: 1, periodYear: 2025"]
        CF4["amountDue: R200.00"]
        CF5["amountPaid: R200.00"]
        CF6["status: PAID"]
    end

    subgraph TXN1["Transaction 1 — Debit order 20 Jan"]
        T1_1["id: txn_01"]
        T1_2["type: DEBIT_ORDER"]
        T1_3["amount: R150.00"]
        T1_4["status: SUCCESS"]
        T1_5["idempotencyKey: usr01_mnd01_1_2025"]
    end

    subgraph TXN2["Transaction 2 — Manual top-up 25 Jan"]
        T2_1["id: txn_02"]
        T2_2["type: MANUAL"]
        T2_3["amount: R50.00"]
        T2_4["status: SUCCESS"]
        T2_5["idempotencyKey: usr01_manual_jan2025_topup"]
    end

    TXN1 -->|"settles"| CONTRIB
    TXN2 -->|"settles"| CONTRIB

    NOTE["amountPaid = R150 + R50 = R200\nR200 >= R200 amountDue\nstatus recalculated to PAID"]
```

---

## Diagram 6 — Admin Override Actions

```mermaid
flowchart LR
    subgraph ADMIN_OVERRIDES["Admin-Only Override Actions"]
        WAIVE["Waive contribution\nPOST /api/v1/admin/contributions/id/waive\nSets status = WAIVED\nRecords reason in audit log\nIrreversible action"]

        GENERATE["Generate monthly records manually\nPOST /api/v1/contributions/generate\nCreates PENDING records for all active members\nIdempotent — skips if record exists\nUsed if month rollover job fails"]

        FORCE_DEBIT["Force manual debit\nPOST /api/v1/admin/members/id/force-debit\nAdmin triggers immediate once-off debit\nRequires confirmation modal\nAudit logged with admin userId"]
    end

    subgraph SAFEGUARDS["Safeguards on Every Override"]
        S1["ADMIN role check in middleware\nL2 route protection"]
        S2["Confirmation required in UI\nConfirmModal component"]
        S3["Full audit log entry\naction, entity, entityId, admin userId, ipAddress"]
        S4["Idempotency on generate\nSafe to call multiple times"]
    end

    WAIVE --> SAFEGUARDS
    GENERATE --> SAFEGUARDS
    FORCE_DEBIT --> SAFEGUARDS
```
