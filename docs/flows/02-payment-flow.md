# Payment and Mandate Flow

| | |
|---|---|
| **Purpose** | Complete sequence and state diagrams for mandate creation, the nightly debit pipeline, manual payments, and webhook settlement |
| **Modules** | M04 Payment Mandates · M05 Contribution Engine · M06 Job Engine |
| **Related Docs** | [03-contribution-lifecycle.md](./03-contribution-lifecycle.md) · [04-notification-pipeline.md](./04-notification-pipeline.md) · [../architecture/02-container-architecture.md](../architecture/02-container-architecture.md) |

---

## Diagram 1 — Mandate State Machine

> Every state a `PaymentMandate` can be in and every valid transition.

```mermaid
stateDiagram-v2
    [*] --> PENDING : Member submits mandate form\nNetcash API call initiated

    PENDING --> ACTIVE : Netcash confirms mandate\nWebhook status ACTIVE received

    PENDING --> CANCELLED : Netcash rejects mandate\nWebhook status CANCELLED received

    ACTIVE --> SUSPENDED : Netcash suspends mandate\ne.g. insufficient funds pattern\nWebhook status SUSPENDED received

    ACTIVE --> CANCELLED : Member cancels via dashboard\nDELETE mandate endpoint called\nNetcash cancellation API called

    SUSPENDED --> ACTIVE : Bank lifts suspension\nWebhook status ACTIVE received

    SUSPENDED --> CANCELLED : Member cancels while suspended\nor admin force-cancels

    CANCELLED --> [*] : Terminal state\nNo debit orders will run\nMandate record preserved for audit

    note right of ACTIVE
        Debit orders run when status is ACTIVE
        and debitDay matches today
        and no DELAY flag in Redis
    end note

    note right of PENDING
        debit-run job skips PENDING mandates
        Only ACTIVE mandates are debited
    end note
```

---

## Diagram 2 — Mandate Creation Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as POST /api/v1/mandates
    participant MW as Middleware
    participant REDIS as Upstash Redis
    participant SVC as mandate.service.ts
    participant DB as PostgreSQL
    participant NC as Netcash API
    participant AUDIT as audit.service.ts

    B->>MW: POST with session cookie and mandate data
    MW->>REDIS: Per-user rate limit 10 per hour
    alt Rate limit exceeded
        MW-->>B: 429 SYS_005
    end
    MW->>API: Forward with session context
    API->>API: Zod validation\ndebitDay 1-28\namount min 100\nbankAccountId required
    API->>SVC: createMandate(userId, params)
    SVC->>DB: Check user has no other ACTIVE mandate
    alt Active mandate exists
        SVC-->>API: ConflictError
        API-->>B: 409 MND_002 active mandate exists
    end
    SVC->>DB: Fetch and decrypt bank account details
    SVC->>SVC: Calculate first debit date\nUsing local SAST calendar parts\nNot toISOString — avoids UTC+2 off-by-one
    SVC->>NC: CreateDebiCheckMandate(bankDetails, amount, debitDay)
    alt Netcash API error
        SVC-->>API: GatewayError
        API-->>B: 502 MND_010 gateway error
    end
    SVC->>DB: INSERT payment_mandates\nstatus = whatever Netcash returned\nnetcashMandateId stored
    alt Netcash returned REJECTED but DB write needed
        SVC->>NC: CancelMandate — compensating call\nPrevents orphaned mandate in Netcash
    end
    SVC->>AUDIT: writeLog(userId, CREATE_MANDATE, mandate.id)
    API-->>B: 201 mandate created
```

---

## Diagram 3 — Netcash Webhook Handler

> Netcash sends status updates asynchronously — this is how they are processed.

```mermaid
sequenceDiagram
    participant NC as Netcash
    participant WH as POST /api/v1/webhooks/netcash
    participant SVC as mandate.service.ts
    participant DB as PostgreSQL
    participant AUDIT as audit.service.ts

    NC->>WH: POST mandate status update
    WH->>WH: Verify HMAC-SHA256 signature\nUsing NETCASH_WEBHOOK_SECRET\nConstant-time comparison timingSafeEqual
    alt Invalid signature
        WH-->>NC: 401 Unauthorized
    end
    WH->>WH: Extract netcashMandateId and newStatus
    WH->>SVC: processMandateWebhook(netcashMandateId, newStatus)
    SVC->>DB: SELECT payment_mandates WHERE netcashMandateId = id
    alt Mandate not found
        SVC-->>WH: NotFoundError
        WH-->>NC: 404 — Netcash will not retry
    end
    alt newStatus equals current status
        SVC-->>WH: No-op — idempotent
        WH-->>NC: 200 already processed
    end
    alt newStatus is CANCELLED
        SVC->>DB: UPDATE mandate status = CANCELLED
        SVC->>AUDIT: writeLog MANDATE_CANCELLED_BY_GATEWAY
        WH-->>NC: 200
    end
    SVC->>DB: UPDATE payment_mandates SET status = newStatus
    SVC->>AUDIT: writeLog MANDATE_STATUS_UPDATED, old and new status
    WH-->>NC: 200 processed
    Note over WH,NC: Netcash retries if it receives non-200\nProcessing errors return 500 — Netcash will retry
```

---

## Diagram 4 — Nightly Debit Pipeline (Full)

> The automated payment pipeline that runs every night at 20:00 SAST.

```mermaid
sequenceDiagram
    participant IC as Inngest Cloud 20h00 SAST
    participant JOB as debit-run function
    participant REDIS as Upstash Redis
    participant DB as PostgreSQL
    participant NC as Netcash API
    participant NOTIF as notification.service.ts

    IC->>JOB: Trigger xxm/debit.run event (cron 20h00)
    JOB->>DB: SELECT active mandates WHERE debitDay = today\nJOIN users WHERE status = ACTIVE
    DB-->>JOB: List of mandates to process

    loop For each mandate
        JOB->>REDIS: Check delay flag\nkey: delay:userId:mandateId:YYYY-MM-DD
        alt Delay flag present
            JOB->>JOB: Skip this mandate\nlog: debit delayed by member request
        end

        JOB->>JOB: Generate idempotency key\nformat: userId_mandateId_periodMonth_periodYear

        JOB->>DB: SELECT transactions WHERE idempotencyKey = key
        alt Transaction already exists
            JOB->>JOB: Skip — already processed\nInngest retry safety
        end

        JOB->>DB: BEGIN TRANSACTION
        JOB->>DB: UPSERT contributions (PENDING if not exists)
        JOB->>DB: INSERT transactions (status PENDING, idempotencyKey)
        JOB->>DB: COMMIT

        JOB->>NC: SubmitScheduledDebit(netcashMandateId, amount, date)
        alt Netcash error
            JOB->>DB: UPDATE transaction status = FAILED
            JOB->>NOTIF: queueNotification payment-failed-sms
            JOB->>JOB: Inngest marks step failed\nAutomatic retry with backoff
        end

        JOB->>DB: UPDATE transaction SET gatewayRef = ref, status = PROCESSING
        JOB->>REDIS: SET idempotency key TTL 48h
        JOB->>NOTIF: queueNotification payment-queued-sms
    end

    JOB-->>IC: All steps complete — execution recorded
```

---

## Diagram 5 — Morning Warning Job

> Runs at 07:00 SAST daily — warns members that tonight their account will be debited.

```mermaid
sequenceDiagram
    participant IC as Inngest Cloud 07h00 SAST
    participant JOB as debit-morning-warning function
    participant DB as PostgreSQL
    participant NOTIF as notification.service.ts

    IC->>JOB: Trigger xxm/debit.morning-warning
    JOB->>JOB: Get today's day number in SAST\nUsing local calendar parts not toISOString
    JOB->>DB: SELECT payment_mandates WHERE\nstatus = ACTIVE\nAND debitDay = todayNumber\nJOIN users WHERE status = ACTIVE
    DB-->>JOB: Members with debit scheduled tonight

    loop For each mandate
        JOB->>NOTIF: queueNotification(\n  templateSlug: morning-warning-sms\n  payload: { firstName, amount, debitDay }\n)
    end

    JOB-->>IC: Complete
```

---

## Diagram 6 — Manual Payment Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as POST /api/v1/contributions/pay
    participant SVC as contribution.service.ts
    participant DB as PostgreSQL
    participant NC as Netcash API
    participant NOTIF as notification.service.ts

    B->>API: POST { contributionId, amount }
    API->>API: Zod validation\namount min 100
    API->>SVC: recordManualPayment(userId, contributionId, amount)
    SVC->>DB: Fetch contribution — verify userId owns it
    alt Not found or not owned by user
        SVC-->>API: NotFoundError
        API-->>B: 404 CTR_001
    end
    alt Contribution already PAID
        SVC-->>API: ConflictError
        API-->>B: 409 CTR_003 already paid
    end
    SVC->>DB: Fetch user primary BankAccount
    SVC->>SVC: Generate idempotency key
    SVC->>DB: INSERT transaction (PENDING)
    SVC->>NC: SubmitOnceOffDebit(bankAccount, amount, ref)
    alt Netcash error
        SVC->>DB: UPDATE transaction FAILED
        SVC-->>API: GatewayError
        API-->>B: 502 payment gateway error
    end
    SVC->>DB: BEGIN TRANSACTION
    SVC->>DB: UPDATE transaction (gatewayRef, PROCESSING)
    SVC->>DB: UPDATE contribution amountPaid += amount
    SVC->>SVC: Recalculate status\namountPaid >= amountDue means PAID\namountPaid > 0 means PARTIAL
    SVC->>DB: UPDATE contribution status
    SVC->>DB: COMMIT
    SVC->>NOTIF: queueNotification payment-success-sms and email
    API-->>B: 200 payment submitted
```

---

## Diagram 7 — Transaction Settlement via Netcash Webhook

> After a debit runs, Netcash sends a result webhook — this is how the transaction is settled.

```mermaid
sequenceDiagram
    participant NC as Netcash
    participant WH as POST /api/v1/webhooks/netcash
    participant SVC as contribution.service.ts
    participant DB as PostgreSQL
    participant NOTIF as notification.service.ts

    NC->>WH: POST transaction result (SUCCESS or FAILED)
    WH->>WH: Verify HMAC signature
    WH->>SVC: settleTransaction(gatewayRef, result)
    SVC->>DB: SELECT transactions WHERE gatewayRef = ref
    alt Already settled (processedAt not null)
        SVC-->>WH: No-op — idempotent
        WH-->>NC: 200
    end
    SVC->>DB: BEGIN TRANSACTION
    alt result is SUCCESS
        SVC->>DB: UPDATE transaction status = SUCCESS, processedAt = now()
        SVC->>DB: UPDATE contribution amountPaid += amount
        SVC->>SVC: Recalculate contribution status
        SVC->>DB: UPDATE contribution status
        SVC->>NOTIF: queueNotification payment-success-sms and email
    end
    alt result is FAILED or REVERSED
        SVC->>DB: UPDATE transaction status = FAILED or REVERSED
        SVC->>NOTIF: queueNotification payment-failed-sms
    end
    SVC->>DB: COMMIT
    WH-->>NC: 200
```
