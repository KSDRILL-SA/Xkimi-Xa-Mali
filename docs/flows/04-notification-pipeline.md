# Notification Pipeline

| | |
|---|---|
| **Purpose** | Documents the full notification pipeline — from event trigger to delivery receipt, including template resolution, channel routing, and preference enforcement |
| **Modules** | M07 Notification System · M06 Job Engine (job triggers) |
| **Related Docs** | [02-payment-flow.md](./02-payment-flow.md) · [03-contribution-lifecycle.md](./03-contribution-lifecycle.md) · [../database/01-erd.md](../database/01-erd.md) |

---

## Diagram 1 — Notification Status State Machine

```mermaid
stateDiagram-v2
    [*] --> QUEUED : queueNotification() called\nRecord inserted in notifications table\nstatus = QUEUED

    QUEUED --> SENT : Inngest flush job dispatches\nBulkSMS or Resend API returns 200\nsentAt recorded

    QUEUED --> FAILED : BulkSMS or Resend API returns error\nAfter Inngest retry exhaustion\nstatus = FAILED

    SENT --> [*] : Terminal — delivery confirmed

    FAILED --> QUEUED : Admin manually retriggers\nor flush job is re-run\nstatus reset to QUEUED

    note right of QUEUED
        Notification waits in DB
        until Inngest flush job picks it up
        Preference check happens at dispatch time
    end note
```

---

## Diagram 2 — Full Notification Pipeline

```mermaid
sequenceDiagram
    participant TRIGGER as Event Trigger\nJob or Webhook
    participant SVC as notification.service.ts
    participant DB as PostgreSQL
    participant IC as Inngest Cloud
    participant FLUSH as notification-flush function
    participant PREF as Preference Check
    participant BULK as BulkSMS API
    participant RESEND as Resend API

    Note over TRIGGER,DB: Phase 1 — Queue the notification

    TRIGGER->>SVC: queueNotification(userId, templateSlug, channel, payload)
    SVC->>DB: SELECT notification_templates WHERE slug = templateSlug
    alt Template not found
        SVC->>SVC: Soft fail — log warning and return\nDo not crash the calling job
    end
    SVC->>DB: INSERT notifications\nstatus = QUEUED\npayload = variables JSON

    Note over IC,RESEND: Phase 2 — Flush and deliver

    IC->>FLUSH: Trigger xxm/notifications.flush (scheduled or event)
    FLUSH->>DB: SELECT notifications WHERE status = QUEUED\nLIMIT 50 per batch
    DB-->>FLUSH: Batch of queued notifications

    loop For each notification
        FLUSH->>DB: SELECT notification_preferences WHERE userId = userId
        FLUSH->>PREF: Check preference for this channel
        alt Member has opted out of this channel
            FLUSH->>DB: UPDATE notification status = SENT sentAt = now()\nMarked sent even though not dispatched\nRespects member preference silently
        end

        FLUSH->>DB: SELECT notification_templates WHERE id = templateId
        FLUSH->>FLUSH: Interpolate template body with payload variables\nReplace placeholders with actual values

        alt channel = SMS
            FLUSH->>BULK: POST /bulksms/messages\nbody: { to: phone, text: interpolated }
            BULK-->>FLUSH: 201 message queued
            FLUSH->>DB: UPDATE notification status = SENT sentAt = now()
        end

        alt channel = EMAIL
            FLUSH->>RESEND: POST /emails\nbody: { to: email, subject, html }
            RESEND-->>FLUSH: 200 email queued
            FLUSH->>DB: UPDATE notification status = SENT sentAt = now()
        end

        alt Delivery API error
            FLUSH->>DB: UPDATE notification status = FAILED
            FLUSH->>IC: Mark step failed — Inngest retries with backoff
        end
    end

    FLUSH-->>IC: Batch complete
```

---

## Diagram 3 — Template Resolution and Interpolation

```mermaid
flowchart TD
    subgraph TEMPLATES["Notification Templates — Seeded in DB"]
        T1["morning-warning-sms\nGood morning firstName\nTonight at 20h00 R amount will be debited\nfrom your account ending in last4.\nReply DELAY to postpone."]

        T2["payment-success-sms\nHi firstName your R amount contribution\nfor period has been received.\nThank you for keeping the group strong."]

        T3["payment-success-email\nHTML email with payment receipt\nAmount, date, reference number\nRunning total for the year"]

        T4["payment-failed-sms\nHi firstName your R amount debit\nfor period failed.\nPlease log in to make a manual payment."]

        T5["overdue-reminder-sms\nHi firstName your period contribution\nof R amountDue is overdue.\nR amountPaid received so far.\nPlease pay R outstanding to clear."]

        T6["welcome-email\nHTML welcome email\nLogin link, how-to guide\nGroup constitution link"]

        T7["email-verification\nPlain HTML email\nVerification link with token"]

        T8["password-reset\nPlain HTML email\nReset link with token"]
    end

    subgraph INTERPOLATION["Template Interpolation at Dispatch Time"]
        I1["Template body stored with placeholders\ne.g. Good morning firstName"]
        I2["Payload JSON stored with notification\ne.g. firstName: Sipho, amount: 250.00"]
        I3["Flush job replaces placeholders\nwith actual values at send time\nnot at queue time"]
        I4["Result: Good morning Sipho\nTonight at 20h00 R250.00 will be debited"]
    end

    T1 --> INTERPOLATION
    T2 --> INTERPOLATION
```

---

## Diagram 4 — Notification Trigger Map

> Every place in the system that triggers a notification, and which template it uses.

```mermaid
flowchart LR
    subgraph AUTH_TRIGGERS["Auth Events"]
        AT1["User registered\nwelcome-email via EMAIL"]
        AT2["Email verification requested\nemail-verification via EMAIL"]
        AT3["Password reset requested\npassword-reset via EMAIL"]
    end

    subgraph PAYMENT_TRIGGERS["Payment Events"]
        PT1["Morning warning job 07h00\nmorning-warning-sms via SMS"]
        PT2["Debit order submitted\npayment-queued-sms via SMS"]
        PT3["Transaction SUCCESS webhook\npayment-success-sms via SMS\npayment-success-email via EMAIL"]
        PT4["Transaction FAILED webhook\npayment-failed-sms via SMS"]
        PT5["Manual payment submitted\npayment-success-sms via SMS\npayment-success-email via EMAIL"]
    end

    subgraph OVERDUE_TRIGGERS["Overdue Events"]
        OT1["Overdue reminder job daily\noverdue-reminder-sms via SMS\noverdue-reminder-email via EMAIL"]
    end

    subgraph INVITE_TRIGGERS["Invite Events — M11a"]
        IT1["Admin creates invite\ninvite-created — internal alert via EMAIL"]
    end

    AUTH_TRIGGERS --> SVC["notification.service.ts\nqueueNotification()"]
    PAYMENT_TRIGGERS --> SVC
    OVERDUE_TRIGGERS --> SVC
    INVITE_TRIGGERS --> SVC
```

---

## Diagram 5 — BulkSMS Delivery Receipt Flow

```mermaid
sequenceDiagram
    participant BULK as BulkSMS
    participant WH as POST /api/v1/webhooks/bulksms
    participant DB as PostgreSQL

    BULK->>WH: POST delivery receipt\n{ messageId, status: DELIVERED or FAILED }
    WH->>WH: Verify request from BulkSMS IP range
    WH->>DB: SELECT notifications WHERE bulkSmsMessageId = messageId
    alt Notification not found
        WH-->>BULK: 200 acknowledged\nLog warning — mismatched receipt
    end
    alt status = DELIVERED
        WH->>DB: UPDATE notifications SET deliveredAt = now()
    end
    alt status = FAILED
        WH->>DB: UPDATE notifications SET status = FAILED
    end
    WH-->>BULK: 200
```

---

## Diagram 6 — Preference Enforcement

> Members can opt out of non-critical channels — this shows which notifications are mandatory.

```mermaid
flowchart TD
    subgraph MANDATORY["Mandatory — Cannot Be Opted Out"]
        M1["email-verification\nRequired to activate account"]
        M2["password-reset\nSecurity-critical flow"]
        M3["payment-failed-sms\nMember must know debit failed"]
    end

    subgraph OPTIONAL_SMS["Optional — SMS Channel"]
        OS1["morning-warning-sms\nOptional — member can disable SMS"]
        OS2["payment-success-sms\nOptional — receipt SMS"]
        OS3["overdue-reminder-sms\nOptional — SMS reminder"]
    end

    subgraph OPTIONAL_EMAIL["Optional — Email Channel"]
        OE1["payment-success-email\nOptional — receipt email"]
        OE2["overdue-reminder-email\nOptional — email reminder"]
    end

    subgraph PREFERENCE_CHECK["Preference Check in Flush Job"]
        PC1["Load NotificationPreference for userId"]
        PC2["If preference.sms = false\nskip SMS channel notifications\nmark as SENT silently"]
        PC3["If preference.email = false\nskip EMAIL channel notifications\nmark as SENT silently"]
        PC4["Mandatory notifications\nbypass preference check entirely"]
    end

    MANDATORY --> PC4
    OPTIONAL_SMS --> PC2
    OPTIONAL_EMAIL --> PC3
```
