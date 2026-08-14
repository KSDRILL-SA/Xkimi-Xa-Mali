# Mandate Lifecycle

**How the Foundation obtains, evidences, and honours authority to debit a member's account.**

| | |
|---|---|
| Audience | Netcash onboarding; the sponsoring bank; the Foundation's auditor |
| Collection method | **DebiCheck** — authenticated debit order |
| Payment processor | Netcash (South Africa) |
| Document status | Accurate to the system as built, 2026-08-14 |
| Live status | **Not yet run against production.** See clause 8. |

> **Why this document exists.** The question that decides a debit order
> application is not "is your software good" — it is "can you prove the payer
> authorised this, and what happens when they say they didn't." This document
> answers both, and states plainly what has and has not yet been exercised
> against live infrastructure.

---

## 1. Authority is never assumed

**No collection occurs without an active mandate.** This is not a policy that
relies on an operator remembering it; it is a structural property of the system:

- A collection run reads from mandates. There is no code path that debits a
  member without one.
- A member may hold **at most one PENDING or ACTIVE mandate at a time**, enforced
  by a partial unique database index (`payment_mandates_one_active_per_user`), not
  by application logic alone. A race between two simultaneous requests cannot
  produce two live mandates.
- The mandate references a bank account **in the member's own name**. The
  Foundation does not hold mandates against third-party accounts.

---

## 2. What a mandate records

| Field | Purpose |
|---|---|
| Member | Who authorised |
| Bank account | Which account, held in that member's name |
| Amount | What was authorised — R100 to R10 000, in R50 steps |
| Debit day | Which day of the month |
| Currency | ZAR |
| Status | `PENDING` → `ACTIVE` → `SUSPENDED` / `CANCELLED` |
| Netcash mandate ID | The authenticated mandate reference at the gateway |
| Approved at / approved by | Who at the Foundation approved it, and when |
| Failure reason | Why it failed, where it did |
| Delayed until | Where the member has requested a deferral |

The SA ID number and bank account number required to register the mandate are
**encrypted at rest** and decrypted only at the moment of submission to Netcash.

---

## 3. Lifecycle

### 3.1 Creation

1. The member supplies bank account details in the member portal.
2. The member sets their contribution amount and debit day.
3. The system creates a mandate in `PENDING`.
4. The mandate is submitted to Netcash for **DebiCheck authentication**, using the
   configured DebiCheck template.
5. The member authenticates the mandate **with their own bank** — through their
   banking app, USSD, or at a branch, depending on their bank.

The authority therefore comes from the member, through their own bank, not from
the Foundation's assertion that they agreed.

### 3.2 Activation

6. Netcash notifies the system by webhook of the authentication outcome.
7. On success, the mandate moves to `ACTIVE` and the Netcash mandate ID is stored.
8. Only then is the member included in a collection run.

**Webhook integrity:** webhook signatures are verified against a shared secret,
and the source IP may be restricted to Netcash's published ranges. Each webhook
event is recorded in `ProcessedWebhookEvent` so that a duplicate delivery cannot
be processed twice.

### 3.3 Collection

9. On the member's debit day, a collection is submitted.
10. The result is recorded as a `Transaction` and reflected against that month's
    `Contribution`.
11. Financial operations are **idempotent**, keyed with a 72-hour TTL, so a retry
    or a duplicate submission cannot collect twice.
12. A collection may be retried at most **three** times.

### 3.4 Failure

A failure is classified, and the classification matters:

| Kind | Treatment |
|---|---|
| **Decline** — insufficient funds, account closed, mandate not honoured | Counts against the member's contribution record; the member is notified |
| **Infrastructure** — gateway unreachable, timeout, error | Recorded with an `INFRASTRUCTURE:` prefix; **does not count against the member and does not notify them** |

This distinction exists because a gateway outage says nothing about a member's
account, and treating it as a decline would misrepresent that member in their own
record and in any assessment of them.

### 3.5 Suspension, delay and cancellation

- A member may **request a delay**, deferring collection to a later date.
- A mandate may be **suspended**, halting collection while preserving the mandate.
- A member may **cancel** at any time. Cancellation stops future collections. It
  does not reverse past collections and does not by itself end membership.
- A member who **leaves the Foundation** has their mandate cancelled as part of
  that process.

### 3.6 Desync detection

Where the Foundation's record of a mandate and Netcash's record diverge — for
example the mandate is live at the gateway but the local write failed — the
system **raises a gateway desync alert** rather than silently proceeding on a
stale local view. This is an explicitly handled case, not an assumed-impossible
one.

---

## 4. Evidence in a dispute

Where a member disputes a debit, the Foundation can produce:

| Evidence | Source |
|---|---|
| That the member authenticated the mandate with their own bank | DebiCheck mandate reference held at Netcash |
| What was authorised — amount, day, account | The mandate record |
| Who approved it at the Foundation, and when | `approvedAt`, `approvedById` |
| Every collection attempted and its outcome | Transaction and contribution records |
| Every administrative action touching the mandate | The immutable audit log |
| The member's own view of all of this | The member portal, which shows the member the same record |

The last row is the one that most reduces disputes: a member can see their own
mandate and every collection against it at any time, and download it. Disputes
arise most often from members who cannot see what happened.

---

## 5. Controls relevant to collection risk

| Control | Effect on disputed-debit ratio |
|---|---|
| DebiCheck authentication | The member authenticated at their own bank; the strongest available authority |
| Closed membership of 50 known, vouched-for people | No anonymous or acquired customer base |
| Member sets and can change their own amount | Removes the most common cause of dispute — an unexpected amount |
| Member-visible record and downloadable statement | Questions are answered before they become disputes |
| Waiver mechanism for members in difficulty | A member in hardship is excused rather than repeatedly debited into declines |
| Infrastructure failures excluded from member records | Prevents unjustified escalation against a member |
| One active mandate per member, enforced in the database | Structurally prevents double collection |
| Idempotent financial operations | Prevents duplicate debits on retry |

---

## 6. Segregation of funds

Contributions are collected into a bank account **in the name of the Foundation**,
not the personal account of any member or leader. Money leaves that account only
against a **Goal** agreed by the members. No single member of leadership can move
funds out. Every movement is recorded in a double-entry ledger and in the
immutable audit log.

See `due-diligence-pack.md` for the full custody and controls picture.

---

## 7. Verification

| Assurance | Status |
|---|---|
| Automated test coverage across the platform | 1 542 tests passing |
| Mandate service test suite | Present, including gateway-desync scenarios |
| Independent adversarial security audit | Conducted 2026-07-27; findings remediated |
| Dependency vulnerabilities | Zero |
| Netcash SOAP contract implemented against the real specification | Yes |

---

## 8. What has **not** yet happened

Stated plainly, because it will be asked and the answer must not be discovered
later:

- **No live transaction has been processed.** The system has never collected a
  real rand.
- **The Netcash live dry run is outstanding.** The integration is implemented
  against the real SOAP contract and exercised against tests, but has not been run
  end to end against Netcash's live environment.
- **The platform is not yet deployed to production.**

The Foundation's request is to conduct a **supervised first collection run** — a
small number of mandates, observed — rather than to be treated as an established
merchant.

---

## 9. Netcash onboarding checklist

| # | Item | Status |
|---|---|---|
| 1 | Registered legal entity and registration documents | Owner — see `registrations.md` |
| 2 | FICA documentation for the entity and its office bearers | Owner |
| 3 | Bank account in the entity's name | Owner |
| 4 | Signed Netcash service agreement | Owner |
| 5 | ISV agreement | **Not required** — confirmed |
| 6 | DebiCheck template configured | ✅ In the system |
| 7 | Service key and webhook secret provisioned | Owner — production values |
| 8 | Webhook endpoint reachable and signature-verified | ✅ Implemented |
| 9 | Live dry run | **Outstanding — the thing to ask for** |
