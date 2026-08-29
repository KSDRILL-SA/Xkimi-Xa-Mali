# XKIMI XA MALI
## Financial Integration & Production Readiness Test Plan

**Purpose:**  
To verify that Xkimi Xa Mali can safely and reliably handle member contributions, debit orders, payment transactions, financial records, and related system operations before production use.

**Testing principle:**  
No financial operation should be considered production-ready merely because it works in the normal/successful scenario. The system must also be tested against failures, duplicates, reversals, delays, interruptions, unauthorized actions, and inconsistencies between Xkimi Xa Mali and the payment provider.

---

# 1. Duplicate Debit-Order Testing

### Objective
Ensure that one intended contribution cannot accidentally result in multiple debit orders or duplicate collections.

### Test cases
- Attempt to create the same debit order twice.
- Refresh/re-submit a debit-order request.
- Simulate a user clicking “Pay/Submit” multiple times.
- Retry an operation after a timeout.
- Verify that network retries do not create duplicate transactions.
- Attempt to create two mandates for the same contribution where only one should exist.
- Verify duplicate webhook/callback notifications are handled safely.

### Expected result
The system must identify and prevent duplicate operations using appropriate unique references/idempotency controls.

### Sign-off
- [ ] Passed
- [ ] Failed
- [ ] Requires correction

---

# 2. Failed Collection Testing

### Objective
Verify correct behaviour when a scheduled contribution cannot be successfully collected.

### Test cases
- Insufficient funds.
- Invalid/inactive mandate.
- Bank rejection.
- Payment-provider failure.
- Network/API timeout.
- Provider temporarily unavailable.
- Collection returned as failed after initially appearing successful.

### Verify
- Member's contribution is not incorrectly marked as successful.
- Member balance/goal progress is not incorrectly increased.
- Appropriate transaction status is stored.
- Member receives the correct notification.
- Admin receives appropriate visibility of the failure.
- Retry/recovery behaviour follows the defined business rules.

### Expected result
A failed collection must never silently appear as a successful contribution.

---

# 3. Reversal / Return Testing

### Objective
Ensure the system correctly handles money that was initially recorded as collected but is subsequently reversed, returned, or otherwise adjusted.

### Test cases
- Successful contribution followed by reversal.
- Partial/adjusted transaction where applicable.
- Returned debit order.
- Provider-generated reversal notification.
- Reversal received after the member dashboard has already updated.

### Verify
- Original transaction remains traceable.
- Reversal is recorded separately where appropriate.
- Member's financial position is corrected.
- Goal progress is recalculated correctly.
- Statements reflect the reversal.
- Audit trail preserves the original transaction and subsequent correction.

### Expected result
The system must never simply overwrite financial history and lose the original event.

---

# 4. Reconciliation Testing

### Objective
Ensure that Xkimi Xa Mali's internal financial records remain consistent with Netcash/provider records.

### Verify
For every financial transaction:

**Provider transaction → Provider reference → Xkimi Xa Mali transaction → Member → Amount → Date → Status**

### Test cases
- Successful transaction exists on both systems.
- Provider transaction exists but application record is missing.
- Application record exists but provider transaction is missing.
- Amount mismatch.
- Status mismatch.
- Duplicate provider notification.
- Delayed provider notification.
- Transaction received out of order.

### Expected result
The system must provide a reliable reconciliation process capable of identifying discrepancies rather than silently accepting inconsistent records.

---

# 5. Authorization Testing

### Objective
Ensure that only authorized users can perform financial or administrative operations.

### Test cases
- Member attempts to access another member's financial information.
- Member attempts to modify another member's contribution.
- Member attempts to perform an administrator operation.
- Unauthenticated user attempts to access protected endpoints.
- Expired session/token attempts to access protected functionality.
- Direct API requests bypassing the frontend.
- Attempt to manipulate IDs in URLs or requests.

### Expected result
Authorization must be enforced at the backend/API level—not merely hidden in the frontend.

---

# 6. Permission / Role Testing

### Objective
Verify that every system role has exactly the permissions it should have.

### Example roles
- Member
- Administrator
- Founder/authorized management role
- System/service account where applicable

### Verify
For each role:

| Operation | Member | Admin | Other |
|---|---:|---:|---:|
| View own profile | ✓ | ✓ | Defined |
| View own contributions | ✓ | ✓ | Defined |
| View another member's data | ✗ | ✓ | Defined |
| Manage members | ✗ | ✓ | Defined |
| Manage financial records | Restricted | ✓ | Defined |
| Generate statements | Own | Authorized | Defined |
| Configure system | ✗ | Restricted | Defined |

Every permission should be explicitly defined rather than assumed.

---

# 7. Transaction-State Testing

### Objective
Ensure the system correctly represents the complete lifecycle of a financial transaction.

### Example state lifecycle

**Created → Pending → Submitted → Processing → Successful**

or

**Created → Pending → Failed**

or

**Successful → Reversed/Returned**

### Test cases
- Transaction remains pending.
- Transaction eventually succeeds.
- Transaction fails.
- Transaction is reversed.
- Provider sends the same status multiple times.
- Provider sends statuses in an unexpected order.
- Application temporarily goes offline.

### Expected result
The database must always represent the correct transaction state and preserve the transaction history.

---

# 8. Audit-Log Testing

### Objective
Ensure that important financial and administrative actions are traceable.

### Audit events to consider
- Member creation.
- Member update.
- Mandate creation/change.
- Contribution creation.
- Transaction-status change.
- Administrative adjustment.
- Reversal.
- Permission/role change.
- Statement generation where relevant.
- Important configuration changes.

### Each important event should capture appropriate information such as:
- Who performed the action.
- What happened.
- When it happened.
- Which record was affected.
- Relevant transaction/reference ID.
- Previous/new state where appropriate.

### Expected result
Financially significant actions must be reconstructable after the fact.

---

# 9. Notification Testing

### Objective
Ensure members and administrators receive accurate notifications.

### Test cases
- Successful contribution.
- Failed contribution.
- Reversal/return.
- Mandate-related event.
- Important account event.
- System-generated statement/notification.

### Verify
- Correct recipient.
- Correct member.
- Correct amount.
- Correct transaction status.
- Correct date/reference.
- No duplicate notifications.
- No notification containing another member's information.

---

# 10. Statement Accuracy Testing

### Objective
Ensure generated statements accurately represent the member's financial activity.

### Verify
Statement totals against the database and provider records.

Check:

**Opening balance + contributions − applicable deductions/adjustments = closing balance**

where applicable to the product's defined financial model.

### Test cases
- One successful contribution.
- Multiple contributions.
- Failed contribution.
- Reversed contribution.
- Multiple transactions on the same date.
- Historical transactions.
- Different transaction statuses.

### Expected result
The statement must be an accurate representation of the underlying financial records.

---

# 11. Provider-Succeeds / Application-Fails Testing

### Objective
Test the most important integration failure scenario:

**Netcash successfully processes an operation, but Xkimi Xa Mali temporarily fails to process the corresponding response.**

### Simulate
1. Provider processes transaction.
2. Application becomes unavailable/timeouts.
3. Provider response/webhook is delayed or not immediately processed.
4. Application becomes available again.

### Verify
- Transaction can be recovered.
- No duplicate collection is created.
- Transaction is not permanently lost.
- Reconciliation can identify the transaction.
- Final state eventually becomes correct.

---

# 12. Application-Succeeds / Provider-Fails Testing

### Objective
Ensure the opposite failure scenario is handled correctly.

### Simulate
1. Xkimi Xa Mali initiates an operation.
2. Provider rejects/fails the operation.
3. Application does not receive a normal success response.

### Verify
- Application does not mark the transaction as successful.
- Member balance/goal does not incorrectly increase.
- Correct failure state is recorded.
- Retry behaviour does not cause duplication.
- Member receives appropriate feedback.

---

# 13. Webhook / Callback Reliability Testing

### Objective
Ensure provider notifications are processed safely.

### Test cases
- Webhook received once.
- Same webhook received twice.
- Webhook received late.
- Webhook received out of order.
- Invalid webhook.
- Unauthorized webhook request.
- Application unavailable when webhook arrives.
- Provider retries webhook delivery.

### Expected result
Webhook processing must be **idempotent** and must not create duplicate financial records.

---

# 14. Database Integrity Testing

### Verify

- Foreign-key relationships.
- Unique transaction references.
- Unique member identifiers.
- Referential integrity.
- Correct transaction/member relationships.
- No orphaned financial records.
- Correct decimal/monetary representation.
- Appropriate transaction timestamps.
- No accidental deletion of financial history.

### Critical principle

**Financial records should be treated as immutable historical events wherever possible.**

Corrections should normally be represented through additional records/events rather than silently rewriting history.

---

# 15. Concurrency Testing

### Objective
Ensure simultaneous operations do not corrupt financial data.

### Test cases
- Two requests update the same contribution simultaneously.
- Two administrators perform an operation at the same time.
- Duplicate submissions occur nearly simultaneously.
- Multiple provider notifications arrive concurrently.
- Two processes attempt to update the same transaction.

### Expected result
The final database state must remain consistent.

---

# 16. API Failure & Recovery Testing

### Simulate
- Timeout.
- HTTP error.
- Provider unavailable.
- Slow response.
- Malformed response.
- Temporary network failure.
- Authentication failure.
- Rate limiting where applicable.

### Verify
The system fails safely and does not incorrectly record financial success.

---

# 17. Security Testing

### Verify

- Authentication.
- Authorization.
- Session/token handling.
- Input validation.
- API access controls.
- Sensitive-data protection.
- Secure configuration/secrets.
- Error messages do not expose sensitive information.
- Members cannot manipulate financial amounts through frontend requests.
- Members cannot modify transaction statuses.
- Administrative endpoints are protected.

---

# 18. End-to-End Financial Test

Perform a complete controlled test:

**Member registration → authorization → mandate setup → contribution initiation → provider processing → provider response → database update → goal update → notification → statement generation → reconciliation**

Verify the same transaction throughout the entire lifecycle.

The transaction must remain traceable from beginning to end using consistent references.

---

# 19. Disaster / Recovery Testing

### Test scenarios
- Application restart during transaction processing.
- Database restart.
- Temporary provider outage.
- Server/network interruption.
- Failed background process.
- Delayed webhook.
- Application deployment during normal operations.

### Verify
The system can recover without:
- Losing financial transactions.
- Creating duplicates.
- Corrupting balances.
- Producing incorrect statuses.

---

# 20. Production Go-Live Checklist

Before accepting real member activity:

### Financial Integration
- [ ] Debit-order integration tested.
- [ ] Payment gateway tested.
- [ ] Provider callbacks/webhooks tested.
- [ ] Transaction references verified.
- [ ] Failure scenarios tested.
- [ ] Reversals tested.
- [ ] Reconciliation tested.

### Application
- [ ] Authentication tested.
- [ ] Authorization tested.
- [ ] Roles/permissions tested.
- [ ] Database integrity verified.
- [ ] Audit logs verified.
- [ ] Notifications verified.
- [ ] Statements verified.

### Reliability
- [ ] Duplicate-request protection tested.
- [ ] Concurrency tested.
- [ ] Provider outage tested.
- [ ] Application outage tested.
- [ ] Recovery procedures tested.

### Governance / Operations
- [ ] Required organizational documentation completed.
- [ ] Required compliance documentation completed.
- [ ] Payment-provider onboarding completed.
- [ ] Production credentials/configuration verified.
- [ ] Backup/recovery procedures established.
- [ ] Responsible persons for financial reconciliation identified.

### Final sign-off

**Technical:** ____________________

**Financial/Operations:** ____________________

**Authorized Founder:** ____________________

**Date:** ____________________

---

# Production Readiness Rule

Xkimi Xa Mali should not be considered production-ready simply because the **happy path works**.

The system should demonstrate that:

> **Every financial transaction can be initiated, processed, tracked, reconciled, corrected, audited, and recovered safely—even when something goes wrong.**

That is the standard to aim for before real member funds are involved.