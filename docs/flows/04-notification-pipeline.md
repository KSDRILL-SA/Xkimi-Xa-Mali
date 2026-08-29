# Notification Pipeline

From event trigger to delivery — template resolution, channel routing, preference enforcement, and the in-app inbox. Related: [02-payment-flow.md](./02-payment-flow.md) · [03-contribution-lifecycle.md](./03-contribution-lifecycle.md).

Two surfaces: **Notifications** (SMS/email, queued and flushed) and the **Inbox** (`InboxMessage`, in-app, read/unread). Most events write both.

---

## Delivery state

```mermaid
stateDiagram-v2
    [*] --> QUEUED : queueNotification() inserts row
    QUEUED --> SENT : flush job dispatches, provider 200
    QUEUED --> FAILED : provider error
    FAILED --> QUEUED : automatic — only while retryCount < 3
    FAILED --> [*] : retryCount reaches 3 — permanently stuck,<br/>needs a manual retryCount reset
    SENT --> [*]
    note right of QUEUED
        Preference check happens at dispatch,
        not at queue time.
    end note
    note right of FAILED
        There is no distinct "permanently failed"
        state in the schema — NotifStatus is only
        QUEUED | SENT | FAILED. "Permanently failed"
        is derived (status=FAILED AND retryCount>=3),
        and once there, nothing in this app's own
        automatic recovery path ever touches the row
        again on its own.
    end note
```

**A real incident matched this exact shape, 2026-08-29**: 229 notifications
(115 SMS, 114 email) crossed the `retryCount >= 3` line and sat
permanently stuck. The email half's root cause was a missing
`RESEND_API_KEY`; the SMS half's was missing BulkSMS credentials. Fixing
the credentials did not, on its own, revive the stuck rows — they needed
an explicit `retryCount` reset, which is a manual operator action, not
something `requeueFailedNotifications()` will ever do by itself.

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
    Note over FL,P: The whole batch dispatches concurrently<br/>(Promise.all, no rate limiting) — a large batch<br/>can outrun a provider's own rate limit (Resend: 10 req/s).<br/>The retryCount mechanism above is what recovers from that,<br/>not a fix to the batch dispatch itself.
    loop each, concurrently
        FL->>DB: load NotificationPreference
        alt opted out of channel (non-mandatory)
            FL->>DB: mark SENT silently (respect preference)
        else
            alt channel = EMAIL
                FL->>FL: interpolateHtml() — HTML-escapes every<br/>interpolated value before it reaches the template
            else channel = SMS
                FL->>FL: interpolate() — plain text, no HTML escaping<br/>(would corrupt an SMS body if it escaped)
            end
            FL->>P: dispatch SMS or email
            alt ok
                FL->>DB: SENT, sentAt, errorMessage cleared
            else error
                FL->>DB: FAILED, retryCount++ → Inngest retries with backoff
            end
        end
    end
```

Templates are seeded rows with `{{variable}}` placeholders interpolated **at send time** (e.g. `morning-warning-sms`, `payment-success-sms/email`, `payment-failed-sms`, `overdue-reminder-sms/email`, `welcome-email`, `email-verification`, `password-reset`). **The HTML-escaping split above is load-bearing, not cosmetic**: every named email template used to interpolate a member's own `firstName` straight into hand-written HTML with zero escaping — a member setting their name to `<img src=x onerror=...>` had it rendered raw in every email sent to them, reachable through ordinary self-registration. Fixed 2026-08-29 by routing every email interpolation through `interpolateHtml()`.

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

Opting out marks the message `SENT` silently — the member simply isn't dispatched to. **BulkSMS delivery receipts** (verified by source IP) update `deliveredAt` / flip to `FAILED` via `POST /webhooks/bulksms`, matched against the notification's `externalRef` column — **not** its `id`. BulkSMS caps the id it echoes back on a receipt at 20 characters; this system's Prisma cuid notification ids are 25, so the send path computes a deterministic 20-char SHA-256-based id (`shortSuppliedId`) and stores it in `externalRef` at send time specifically so the receipt can find its way back to the right row. Matching on `id` instead (an earlier version of the send-side fix did exactly this) fails silently — `updateMany` finds zero rows and throws nothing — so every real delivery receipt would have updated nothing at all.
