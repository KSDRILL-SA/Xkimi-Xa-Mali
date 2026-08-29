# ADDENDUM — NOTIFICATION DELIVERY & RECOVERY TESTING

## 21. Notification Delivery & Recovery Testing

### Objective

Verify that Xkimi Xa Mali can reliably deliver member notifications and safely recover from failed deliveries without losing notifications or creating duplicates.

Notifications may include important account, contribution, payment, receipt, OTP, and other system-generated communications.

---

### 21.1 Current Production Incident

An automated operational alert reported:

**200 notifications exhausted all retries and will not be automatically sent.**

Breakdown:

- **101 Email notifications**
- **99 SMS notifications**

The system recorded the failures and exhausted its configured retry attempts.

### Known SMS failure

The reported error was:

`BulkSMS service error: BulkSMS credentials not configured (BULKSMS_USERNAME / BULKSMS_PASSWORD)`

This indicates that the production environment is currently missing the required BulkSMS credentials.

### Potential Email failure causes

The operational alert identified possible causes including:

- Invalid/unverified `RESEND_FROM_EMAIL` domain.
- Revoked or invalid Resend provider/API key.
- Temporary Resend provider outage.

The exact cause must be determined from the `errorMessage` stored against the affected notification records.

---

# 21.2 Notification Lifecycle

The expected notification lifecycle should be clearly defined.

**Created → Queued → Sending → Sent**

If delivery fails:

**Queued/Sending → Failed → Retry → Failed → Retry → ... → Permanently Failed**

Once the maximum retry count is reached:

**Permanently Failed**

The system must retain sufficient information to diagnose and recover the notification.

---

# 21.3 Notification Failure Testing

### Test cases

- SMS provider unavailable.
- Email provider unavailable.
- Invalid SMS credentials.
- Invalid email credentials.
- Unverified email sending domain.
- Invalid recipient address/number.
- Network timeout.
- Provider API timeout.
- Provider returns an error.
- Application crashes while sending.
- Notification is created but provider request fails.
- Provider accepts the request but application fails before recording success.
- Duplicate provider response.
- Duplicate retry attempt.

### Verify

- Notification failure is recorded.
- Correct error message is stored.
- Retry count increments correctly.
- Notification does not disappear from the queue.
- Failed notification remains traceable to its intended recipient.
- Sensitive information is not exposed in error logs.
- System eventually marks exhausted notifications as permanently failed.

---

# 21.4 Retry Testing

### Objective

Verify that the retry mechanism behaves predictably.

### Test cases

- First attempt fails.
- Second attempt succeeds.
- Several attempts fail before succeeding.
- Maximum retry count is reached.
- Application restarts during retry processing.
- Multiple workers/processes attempt the same notification.

### Expected result

The system must:

- Retry according to the configured policy.
- Avoid infinite retries.
- Avoid duplicate notifications.
- Preserve the notification record.
- Correctly increment `retryCount`.
- Stop automatically after the configured maximum.
- Clearly identify permanently failed notifications.

---

# 21.5 Notification Recovery / Requeue Testing

### Objective

Verify that administrators can recover permanently failed notifications after the underlying problem has been fixed.

### Required recovery process

**1. Identify failed notifications**

Review the `notifications` table and inspect:

- Notification ID.
- Member/recipient.
- Channel.
- Notification type.
- Status.
- `retryCount`.
- `errorMessage`.
- Created timestamp.
- Last-attempt timestamp.

**2. Determine root cause**

Examples:

- Missing provider credentials.
- Invalid provider credentials.
- Invalid sending domain.
- Provider outage.
- Application configuration error.

**3. Correct the underlying problem**

For example:

- Configure valid BulkSMS credentials.
- Configure/verify Resend.
- Correct the sending address/domain.
- Restore provider connectivity.

**4. Verify the provider independently**

Send a controlled test notification.

**5. Requeue failed notifications**

Reset the appropriate retry/requeue state only after the underlying problem has been corrected.

**6. Verify delivery**

Confirm that the notifications successfully transition to the expected delivered/sent state.

**7. Confirm no duplicates**

Ensure the recovery process does not resend notifications that were already successfully delivered.

---

# 21.6 BulkSMS Recovery Test

### Scenario

Production SMS credentials are missing or invalid.

### Test

1. Configure valid production BulkSMS credentials.
2. Verify credentials securely.
3. Send a controlled test SMS.
4. Confirm successful provider response.
5. Confirm Xkimi Xa Mali records the notification correctly.
6. Requeue an appropriate failed notification.
7. Confirm successful delivery.
8. Confirm the same notification is not sent twice.

### Pass condition

SMS delivery works reliably and previously failed notifications can be recovered without duplication.

---

# 21.7 Resend Recovery Test

### Scenario

Email notifications are failing.

### Test

1. Inspect stored `errorMessage` values.
2. Identify the exact failure cause.
3. Verify the Resend API configuration.
4. Verify the sending domain.
5. Verify `RESEND_FROM_EMAIL`.
6. Send a controlled test email.
7. Confirm successful provider response.
8. Requeue an appropriate failed notification.
9. Confirm delivery.
10. Confirm no duplicate email is generated.

### Pass condition

Email delivery works reliably and failed notifications can be safely recovered.

---

# 21.8 Provider-Succeeds / Application-Fails Notification Test

### Scenario

The external provider successfully accepts the notification, but Xkimi Xa Mali fails before recording the successful result.

### Verify

The recovery process must not blindly resend the notification and create a duplicate.

The system should use appropriate identifiers/idempotency mechanisms to determine whether the notification has already been processed.

---

# 21.9 Application-Succeeds / Provider-Fails Notification Test

### Scenario

Xkimi Xa Mali attempts to send a notification, but the external provider rejects or fails the request.

### Verify

- Notification is not marked as successfully delivered.
- Failure is recorded.
- Retry mechanism activates.
- Correct error is preserved.
- Notification can eventually be recovered.
- No duplicate is created.

---

# 21.10 Notification Data Integrity

Every notification should remain traceable to its intended context.

Where applicable, verify:

**Notification → Member → Event → Transaction → Channel → Provider Reference → Delivery Status**

For example:

**Contribution → Member X → R500 contribution → SMS → Provider reference → Delivered**

The notification record must never become detached from the event that caused it.

---

# 21.11 Notification Security

Verify that:

- One member cannot access another member's notifications.
- Sensitive information is not exposed in URLs.
- Sensitive information is not unnecessarily written to logs.
- Provider credentials are never exposed to clients.
- API keys are stored only in secure server-side configuration.
- Error messages do not reveal secrets.
- Notification content does not expose another member's financial information.

---

# 21.12 Production Incident Acceptance Criteria

The current **200 permanently failed notifications** should not be considered resolved merely because the error disappears.

The incident should be considered resolved only after:

- [ ] SMS configuration corrected.
- [ ] Email configuration/root cause identified.
- [ ] Controlled SMS test successful.
- [ ] Controlled email test successful.
- [ ] Failed notifications reviewed.
- [ ] Appropriate notifications safely requeued.
- [ ] Requeued notifications successfully delivered.
- [ ] Duplicate delivery checked.
- [ ] Retry mechanism verified.
- [ ] Permanent-failure monitoring verified.
- [ ] Operational alert confirmed as resolved.

---

# 21.13 Key Production Principle

> **A notification system is not reliable merely because it can send messages. It must also detect failure, preserve the failed notification, explain why it failed, prevent endless retries, and safely recover once the underlying problem is fixed.**

### Production requirement

**No important member communication should silently disappear.**

Every notification must ultimately reach one of clearly defined states such as:

**Delivered / Failed / Permanently Failed / Requeued / Cancelled**

with an auditable record explaining what happened.