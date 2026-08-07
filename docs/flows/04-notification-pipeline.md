# Notification Pipeline

From event trigger to delivery — template resolution, channel routing, preference enforcement, and the in-app inbox. Related: [02-payment-flow.md](./02-payment-flow.md) · [03-contribution-lifecycle.md](./03-contribution-lifecycle.md).

Two surfaces: **Notifications** (SMS/email, queued and flushed) and the **Inbox** (`InboxMessage`, in-app, read/unread). Most events write both.

---

## Delivery state

```mermaid
stateDiagram-v2
    [*] --> QUEUED : queueNotification() inserts row
    QUEUED --> SENT : flush job dispatches, provider 200
    QUEUED --> FAILED : provider error after retries
    FAILED --> QUEUED : admin re-triggers / flush re-runs
    SENT --> [*]
    note right of QUEUED
        Preference check happens at dispatch,
        not at queue time.
    end note
```

## Queue → flush → deliver

```mermaid
sequenceDiagram
    participant T as Trigger (job / webhook)
    participant SVC as notification.service
    participant DB as PostgreSQL
    participant FL as notification-flush (Inngest)
    participant P as BulkSMS / Resend

    T->>SVC: queueNotification(userId, slug, channel, payload)
    SVC->>DB: template by slug (missing → soft-fail, never crash caller)
    SVC->>DB: INSERT notification QUEUED (payload JSON)

    FL->>DB: SELECT QUEUED LIMIT 50
    loop each
        FL->>DB: load NotificationPreference
        alt opted out of channel (non-mandatory)
            FL->>DB: mark SENT silently (respect preference)
        else
            FL->>FL: interpolate template body with payload
            FL->>P: dispatch SMS or email
            alt ok
                FL->>DB: SENT, sentAt
            else error
                FL->>DB: FAILED → Inngest retries with backoff
            end
        end
    end
```

Templates are seeded rows with `{{variable}}` placeholders interpolated **at send time** (e.g. `morning-warning-sms`, `payment-success-sms/email`, `payment-failed-sms`, `overdue-reminder-sms/email`, `welcome-email`, `email-verification`, `password-reset`).

---

## Triggers & preference rules

```mermaid
flowchart LR
    subgraph TRIG["Triggers"]
        A["Auth: welcome · verification · reset"]
        P["Payments: morning warning · queued · success · failed"]
        O["Overdue: daily reminder"]
        AD["Admin: broadcast · anomaly alert (inbox)"]
    end
    TRIG --> Q["notification.service.queueNotification()"]
```

| Channel | Mandatory (bypass prefs) | Optional (member may opt out) |
|---|---|---|
| Reasoning | account/security/critical | receipts & reminders |
| Examples | `email-verification`, `password-reset`, `payment-failed-sms` | `morning-warning-sms`, `payment-success-*`, `overdue-reminder-*` |

Opting out marks the message `SENT` silently — the member simply isn't dispatched to. **BulkSMS delivery receipts** (verified by source IP) update `deliveredAt` / flip to `FAILED` via `POST /webhooks/bulksms`.
