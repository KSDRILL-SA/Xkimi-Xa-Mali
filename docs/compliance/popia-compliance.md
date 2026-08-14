# POPIA Compliance Pack

**Protection of Personal Information Act, 4 of 2013**

| | |
|---|---|
| Responsible party | Xkimm Xa Mali Foundation |
| Registration number | `[REGISTRATION NUMBER]` |
| Information Officer | `[NAME]` — **registration with the Information Regulator outstanding** |
| Deputy Information Officer | `[NAME or "none appointed"]` |
| Document status | Drafted from the system as built; needs owner input where bracketed |
| Last verified against the code | 2026-08-14 |

> **What this document is.** A processing register and compliance statement built
> by reading the actual database schema and service layer, not from a template.
> Every field listed below is a field the system really stores. Where the system
> already does the right thing, this says so; where there is a gap, it is marked
> **GAP** and it is real.

---

## 1. The Information Officer

Under POPIA, the head of a private body **is** the Information Officer by
operation of law — the role exists whether or not anyone is appointed to it. Two
things are nonetheless required:

1. **Registration with the Information Regulator.** This is done through the
   Regulator's online portal and is free. **Outstanding.**
2. **A designated person who knows they hold the role**, with their duties written
   down.

### Duties of the Information Officer

- Encourage and ensure the Foundation's compliance with POPIA.
- Deal with requests made to the Foundation under POPIA and PAIA.
- Work with the Regulator on investigations.
- Ensure a **PAIA manual** is available (see `paia-manual.md`).
- Ensure a personal information impact assessment is done.
- Ensure members are made aware of their rights.
- Handle data breaches under section 22 (clause 8 below).

**Action for the owner:** appoint in writing, then register. See
`registrations.md`, item 3.

---

## 2. What personal information is processed

Taken directly from `packages/database/prisma/schema.prisma` and the service
layer.

### 2.1 Member identity and contact

| Field | Model | Sensitivity | At rest |
|---|---|---|---|
| `firstName`, `lastName` | `User` | Ordinary | Plain |
| `email` | `User` | Ordinary | Plain (unique) |
| `phone` | `User` | Ordinary | Plain (unique) |
| `idNumber` | `User` | **Special — SA ID** | **Encrypted** ✅ |
| `address` | `User` | Ordinary | Plain (JSON) |
| `image` | `User` | Ordinary | URL reference |
| `password` | `User` | Credential | **Hashed** ✅ |
| `popiaConsentAt` | `User` | — | Timestamp of consent ✅ |

### 2.2 Financial

| Field | Model | Sensitivity | At rest |
|---|---|---|---|
| `accountNumber` | `BankAccount` | **High** | **Encrypted** ✅ |
| `bankName`, `branchCode`, `accountType` | `BankAccount` | Moderate | Plain |
| `amount`, `debitDay` | `PaymentMandate` | Moderate | Plain |
| `netcashMandateId` | `PaymentMandate` | Moderate | Plain |
| Contribution and transaction history | `Contribution`, `Transaction`, `LedgerEntry` | Moderate | Plain |

### 2.3 Prospective members (pre-registration)

| Field | Model | Sensitivity | At rest |
|---|---|---|---|
| `firstName`, `lastName`, `email`, `phone` | `Invitation` | Ordinary | Plain |
| `idNumber` | `Invitation` | **Special — SA ID** | **Encrypted** ✅ |
| `vouchedFor` | `Invitation` | Ordinary | Plain |

> Note: personal information of a person who has been invited but has **not**
> joined is still personal information under POPIA, and the Foundation is
> responsible for it. Retention of unused invitations is covered in clause 6.

### 2.4 Security and audit

| Field | Model | Purpose |
|---|---|---|
| `ipAddress` | `LoginHistory` | Detecting unauthorised access |
| `ipAddress` | `AuditLog` | Accountability for administrative action |
| `loginAttempts`, `lockedUntil` | `User` | Brute-force protection |
| Session records | `Session`, `Account` | Authentication |

### 2.5 Communications

| Field | Model | Purpose |
|---|---|---|
| Notification content and delivery status | `Notification` | Member communication |
| Channel preferences | `NotificationPreference` | Respecting member choice |
| Message content | `InboxMessage`, `CommunityMessage` | In-system messaging |

---

## 3. Lawful basis for processing (section 11)

| Purpose | Basis |
|---|---|
| Administering membership | **Contract** — performance of the constitution the member agreed to |
| Collecting contributions by debit order | **Contract**, plus the member's signed mandate |
| Holding the SA ID number | **Consent**, and obligation — required to verify identity and to submit a DebiCheck mandate |
| Keeping contribution and payout records | **Legal obligation** and legitimate interest in accurate accounting |
| Security logging (IP, login history) | **Legitimate interest** — protecting members' money and data |
| Notifications about a member's own account | **Contract** |
| Community messaging | **Consent**, withdrawable via notification preferences |

**Consent is captured at registration and the timestamp recorded** in
`User.popiaConsentAt`. This satisfies the requirement to be able to *demonstrate*
consent, not merely assert it.

---

## 4. Special personal information (section 26)

The Foundation processes **South African identity numbers**, which are treated as
requiring elevated protection.

Controls in place:

- Encrypted at rest using envelope encryption with a rotatable key ring
  (`packages/utils/src/keyring.ts`).
- Decrypted only at the point of use — submitting a mandate to Netcash, and
  verifying an invitee's identity at registration.
- Never written to logs.
- Not included in ordinary member-facing views.

---

## 5. Security safeguards (section 19)

These are real, and each is verifiable in the repository.

| Control | Implementation |
|---|---|
| Encryption of identifiers at rest | Envelope encryption, ID numbers and bank account numbers |
| Key rotation | Documented 3-step runbook; envelope format supports rotation without downtime |
| Password storage | Hashed; 12-character minimum policy on registration |
| Access control | Role-based, with a `roleVersion` counter that invalidates sessions on role change |
| Account lockout | Failed-attempt counter with time-based lock |
| Rate limiting | On authentication routes and invitation validation |
| Audit trail | Every administrative action recorded with actor and timestamp; **append-only** |
| Login history | Retained with IP address |
| Idempotency | On financial operations, to prevent duplicate collection |
| Dependency vulnerabilities | Remediated to zero; monitored |
| Independent review | Adversarial security audit conducted 2026-07-27; findings closed |

---

## 6. Retention (section 14)

POPIA requires that records not be kept longer than necessary, **unless** retention
is required by law.

| Record | Proposed retention | Basis |
|---|---|---|
| Member identity and contact | Duration of membership + `[5 YEARS]` | Accounting and legal claims |
| Contribution and payment records | `[5 YEARS]` after the financial year | Tax and accounting obligations |
| Mandate records | `[5 YEARS]` after cancellation | Proof of authorisation in a dispute |
| Audit log | **Permanent** | Integrity of the record; the constitution forbids deletion |
| Login history / IP | `[12 MONTHS]` | Security purpose expires |
| Unused or revoked invitations | `[6 MONTHS]` | No longer needed once lapsed |
| Notification delivery records | `[24 MONTHS]` | Proof of communication |

**GAP — decision required.** The retention periods above are proposals, not
settled policy. They must be confirmed by the owner, ideally on the advice of the
Foundation's accountant, since the accounting retention obligations drive most of
them.

**GAP — implementation.** The system records `deletedAt` and `resignedAt` but
there is **no automated retention enforcement job**. Retention is currently a
policy without a mechanism. Options, in increasing order of effort: a documented
manual annual review; a scheduled job that reports what is due for deletion; a
scheduled job that deletes. Recommend the middle option first — a job that
*reports* — because an automatic deleter that is wrong is worse than none.

---

## 7. Data subject rights and how to exercise them

A member (or an invited person who never joined) may:

| Right | Section | How the Foundation responds |
|---|---|---|
| Know what is held about them | 23 | The member portal shows their complete record; a full export is available for download |
| Correct or delete inaccurate information | 24 | Via the member's profile, or by request to the Information Officer |
| Object to processing | 11(3) | To the Information Officer |
| Withdraw consent | 11(2) | Notification preferences for messaging; withdrawal of consent to core processing ends membership, since the Foundation cannot administer a member it may not process |
| Complain to the Regulator | 74 | Contact details in `paia-manual.md` |

### Procedure

1. A request is made to the Information Officer at `[EMAIL]`.
2. The Information Officer verifies the requester's identity.
3. The request is logged, with the date received.
4. A response is given **within 30 days**. Where an extension is needed, the
   requester is told before the 30 days expire.
5. Where a request is refused, reasons are given, together with the requester's
   right to complain to the Regulator.

**GAP.** There is no dedicated data-subject-request inbox or log. For a
fifty-member closed collective this is proportionate to handle manually, but the
log must exist — a spreadsheet is sufficient, and the absence of one is the thing
that fails an inspection.

---

## 8. Data breaches (section 22)

Where there are reasonable grounds to believe personal information has been
accessed or acquired by an unauthorised person, the Foundation **must** notify:

- the **Information Regulator**; and
- **each affected member**,

as soon as reasonably possible after discovery.

Notification to members must describe the possible consequences, the measures the
Foundation intends to take, what the member can do to mitigate harm, and — if
known — the identity of the unauthorised person.

**In place:** operational alerting with severity routing is deployed, so a
security-relevant event reaches a human. **GAP:** there is no written breach
response runbook naming who decides, who notifies, and within what time. This
should be a one-page document; see `registrations.md`, item 9.

---

## 9. Operators and third parties (section 20–21)

An "operator" processes personal information **on behalf of** the Foundation. POPIA
requires a **written contract** with each, obliging them to maintain
confidentiality and security.

| Operator | What it processes | Location | Written contract |
|---|---|---|---|
| **Netcash** | Name, ID number, bank account, mandate, collection amounts | South Africa 🇿🇦 | Service agreement — `[TO BE SIGNED]` |
| **Resend** | Email address, message content | United States | Standard terms — `[VERIFY DPA]` |
| **Upstash** (Redis) | IP addresses, rate-limit counters | `[REGION]` | `[VERIFY DPA]` |
| **Vercel** (hosting + Blob) | All application data in transit; uploaded files | United States | `[VERIFY DPA]` |
| **Sentry** | Error diagnostics, may incidentally include identifiers | United States | `[VERIFY DPA]` |
| **`[DATABASE HOST]`** | All member data at rest | `[REGION]` | `[VERIFY DPA]` |

### Cross-border transfer (section 72) — **GAP, and the most substantive one**

Most of the operators above are **outside South Africa**. POPIA section 72
permits transfer abroad only where one of several conditions is met — most
practically, that the recipient is subject to a law or binding agreement
providing an adequate level of protection, or that the member has consented.

**What is needed:**

1. Confirm each operator's data processing terms and where data physically sits.
2. Ensure the privacy notice given to members **discloses** that information is
   processed outside South Africa, and obtain consent on that basis.
3. Prefer EU/South African regions where the provider offers a choice — Upstash
   and the database host both do.

The current privacy policy at `apps/web/app/privacy/page.tsx` correctly cites
POPIA and members' rights, but **does not mention cross-border processing**. That
is a specific, fixable omission.

---

## 10. Summary of gaps

| # | Gap | Severity | Owner |
|---|---|---|---|
| 1 | Information Officer not registered with the Regulator | **High** — statutory | Owner |
| 2 | Cross-border transfer not disclosed in the privacy notice | **High** | Fixable in code |
| 3 | Operator contracts / DPAs not confirmed | Medium | Owner |
| 4 | Retention periods not decided | Medium | Owner + accountant |
| 5 | No retention enforcement mechanism | Medium | Engineering |
| 6 | No data-subject-request log | Low | Owner — a spreadsheet suffices |
| 7 | No written breach response runbook | Medium | Joint |
| 8 | No PAIA manual published | **High** — statutory | See `paia-manual.md` ✅ drafted |

Items 2 and 8 can be closed immediately. Item 8 is drafted; item 2 is a change to
the privacy page and is recommended next.
