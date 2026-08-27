# POPIA Compliance Pack

**Protection of Personal Information Act, 4 of 2013**

| | |
|---|---|
| Responsible party | Xkimi Xa Mali Foundation |
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

**CLOSED — implementation.** A monthly **retention survey** now runs on the 1st
of each month (`apps/web/inngest/functions/retention-survey.ts`) and reports what
is past its period as a `warning` alert. It **deletes nothing**, deliberately: the
periods above are still proposals, and an automatic deleter whose periods are
wrong destroys members' financial records irreversibly. Deletion can be added
once the periods are settled and a few months of reports have been read and
agreed. The audit log is excluded from the survey — the constitution forbids its
deletion and it is retained permanently by design.

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

1. A request is made through the **data request form at `/privacy/request`**, or
   to the Information Officer at `[EMAIL]`.
2. The request is recorded, with the date received. A request made through the
   form records itself, at the moment it is submitted.
3. The Information Officer verifies the requester's identity **before disclosing
   or deleting anything**. Identity is deliberately not checked at intake — see
   below.
4. A response is given **within 30 days**. Where an extension is needed, the
   requester is told before the 30 days expire.
5. Where a request is refused, in whole or in part, reasons are given, together
   with the requester's right to complain to the Regulator.

**CLOSED.** Requests are logged in the admin console at **Data Requests**, which
records the requester, what was asked, when it arrived, the 30-day due date, who
handled it and what was done. Open requests are shown with a countdown and
overdue ones are flagged.

**Why the form does not verify identity.** Recording that somebody asked is not
the same act as answering them. Putting an identity check in front of the form
would place a barrier in front of a statutory right and would give the Foundation
a reason not to record awkward requests. So anyone may submit, verification
happens before anything is disclosed or deleted, and what was verified is
recorded in the outcome. A fraudulent request that is recorded and then refused
is a compliant outcome; a genuine request that was never recorded is not.

**The clock starts without anyone remembering.** Before the form existed, the
thirty days began when an administrator transcribed a support email — so a
request nobody transcribed had no clock at all, which is the exact failure this
log was built to end. Requests submitted through the form write their own row and
their own due date. A request that genuinely arrives by email is still logged by
hand, and backdated to when it was sent rather than when it was noticed.

**The deadline comes and finds a person.** A weekly job
(`apps/web/inngest/functions/dsr-deadline-check.ts`) alerts on any open request
within nine days of its deadline, and raises a `critical` alert for any already
past it. Before this, `dueAt` was visible only to someone who opened the Data
Requests page — a screen looked at by people already thinking about data
requests, which is not the moment the reminder is needed.

### Answering a deletion request

Deletion requests are the ones where the honest answer is usually *partly no*,
and section 23 entitles the requester to be told exactly what is held and why it
is kept. **What we hold** in the admin console (on any open deletion request from
an identified member) produces that inventory: every category of information held
about the person, whether it may be deleted now, and the basis for keeping the
rest, written to be given to the requester as it stands.

Where a category has no remaining basis, it can be deleted from the same screen.
That deletion touches **only** the categories the inventory has cleared — never a
financial record, a mandate, or an audit entry — runs in one transaction, and is
recorded in the audit log against the request that prompted it, alongside what
was kept and why.

This does not contradict the retention survey's refusal to delete (§6). That
survey runs unattended against provisional periods, where a wrong period destroys
records irreversibly and at scale. This runs when a named person has exercised a
statutory right and an administrator has verified who they are. A person
exercising that right is the one trigger that ought to cause deletion; a cron at
05:00 is not.

**Still done by hand:** erasing a member's identity outright once the identity
period has run. Anonymising the user row would detach every financial record from
the person it belongs to while those records must still be attributable, so a
member who is genuinely past every period is a whole-account removal — a separate
decision, deliberately not buried inside a request handler.

Two properties worth noting for an inspection: the log records **whether each
answer fell inside the statutory period** at the moment of closing, rather than
leaving it to be recomputed later; and a request cannot be closed — answered or
refused — without recording the outcome, because refusing without recorded
reasons is itself a contravention. Every action writes to the same append-only
audit log as every other administrative act, which a spreadsheet cannot offer.

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
| 1 | Information Officer not registered with the Regulator | **High** — statutory | **Owner — outstanding** |
| 2 | ~~Cross-border transfer not disclosed~~ | — | ✅ Live on the privacy page |
| 3 | Operator contracts / DPAs not confirmed | Medium | **Owner — outstanding** |
| 4 | Retention periods not decided | Medium | **Owner + accountant — outstanding** |
| 5 | ~~No retention enforcement mechanism~~ | — | ✅ Monthly survey, report-only |
| 6 | ~~No data-subject-request log~~ | — | ✅ Admin console → Data Requests |
| 7 | ~~No written breach response runbook~~ | — | ✅ `breach-response.md` |
| 8 | ~~No PAIA manual published~~ | — | ✅ Published at `/paia`, linked in the footer |

**Five of eight are closed.** The three that remain are all owner actions — a
registration, a set of contracts, and a decision — and none can be closed from
the codebase. They are tracked in `registrations.md`.

Note on item 4: the retention survey (item 5) runs against *provisional* periods.
It reports rather than deletes precisely because item 4 is still open, so the two
are safe to leave in this state — but the survey's counts should not be acted on
until the accountant has confirmed the periods.

The same caveat applies to the erasure inventory in §7. Every date it shows is
computed from the provisional periods above, and it says so on the screen. What
it deletes is limited to sign-in records and message-delivery records past their
period — neither of which is a financial record, and neither of which item 4 is
likely to change materially. Settling item 4 is still what turns the rest of that
inventory from a defensible position into a settled one.

### Watching the jobs that enforce all of this

Both of these were open questions and both are now closed.

**A compliance job that stops running says so.** The retention survey runs twelve
times a year and is the only mechanism enforcing section 14; the deadline check
is the only thing counting the thirty days. Either could have stopped and nothing
anywhere would have said so — for up to a year, in the survey's case.

They are watched by `COMPLIANCE_JOBS` in `apps/web/lib/job-heartbeat.ts`, kept
deliberately **separate** from `WATCHED_JOBS`. That list's admission rule is that
silence costs money, and its value is that everything on it is worth an SMS at
03:00; widening it to admit compliance work would dilute the one list somebody is
guaranteed to act on. The compliance registry is reported by the same checker
under its own code, `COMPLIANCE_JOB_SILENT`, at `warning` — an inbox and an
email, no SMS — and throttled on its own action so a silent debit run cannot
suppress it.

**A backup that stops being scheduled says so.** The backup workflow alerts when
a run fails and cannot alert when no run happens, because the alert is a job in
the same workflow. GitHub disables scheduled workflows after roughly 60 days of
repository inactivity, so a finished, stable system is precisely the case where
backups stop silently. `apps/web/inngest/functions/backup-watch.ts` now asks
GitHub daily when `backup.yml` last succeeded, from inside the app, which keeps
running whatever GitHub does. It needs a read-only token — see
`docs/backup-and-restore.md` §3b-ii — and without one it reports that it *cannot
see*, which is deliberately neither silence nor a false all-clear.
