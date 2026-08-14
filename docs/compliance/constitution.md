# Constitution of Xkimm Xa Mali Foundation

**A savings collective (stokvel) constituted under the laws of the Republic of South Africa.**

| | |
|---|---|
| Document status | **DRAFT — requires attorney review before adoption** |
| Version | 1.0 |
| Adopted on | `[DATE OF ADOPTION]` |
| Registered entity name | `[REGISTERED NAME]` |
| Entity registration number | `[REGISTRATION NUMBER]` |
| Self-regulatory body | `[NASASA MEMBERSHIP NUMBER]` |

> **Read this first.** This is a drafted constitution, not legal advice, and it has
> not been reviewed by a legal practitioner. It states what the system built for
> this collective actually does, in the form a constitution takes — which is the
> hard half, and the half a lawyer would otherwise bill you to extract from
> interviews. Take it to a South African attorney with financial services
> experience for review and adoption. Fields in `[BRACKETS]` need a human answer
> before it can be signed.
>
> Every rule below marked *(enforced)* is enforced by the system in code, not by
> anyone's memory. That is unusual for a stokvel constitution and it is worth
> saying out loud when this document is read by NASASA, a bank, or Netcash.

---

## 1. Name and status

1.1 The collective is called **Xkimm Xa Mali Foundation** (in this document, "the
Foundation").

1.2 The Foundation is a **stokvel**: a voluntary association of persons known to
one another, who contribute money to a common pool for their mutual benefit.

1.3 The Foundation is **not a bank** and does not take deposits from the general
public. Membership is by invitation only, is never advertised or offered
publicly, and is limited to a closed circle of persons known to the existing
members (see clause 3).

1.4 The Foundation is a member of `[SELF-REGULATORY BODY]` and operates under the
exemption from the Banks Act applicable to stokvels.

1.5 The Foundation's registered address is `[ADDRESS]`.

---

## 2. Objects

2.1 The objects of the Foundation are to:

- (a) enable members to save money together, regularly and with discipline;
- (b) hold those savings safely, in an account in the Foundation's name;
- (c) apply the pooled savings only to **Goals** agreed by the circle (clause 6);
- (d) keep a complete and permanent record of every rand contributed and every
  rand paid out, available to every member; and
- (e) do so on terms identical for every member, including those who lead.

2.2 The Foundation does **not** conduct the business of a bank, does not lend
money at interest to the public, does not offer investment returns, and does not
solicit funds from anyone outside its membership.

---

## 3. Membership

### Admission

3.1 Membership is **capped at fifty (50) persons** *(enforced)*. The cap is a
decision about what kind of body this is, not a limit to be escaped. A seat is
occupied by any member who has not been erased — whatever their status — and by
any invitation that has been issued and not yet used or revoked.

3.2 A person may become a member **only by invitation** issued by an existing
member of leadership, and only where an existing member vouches for them.

3.3 An applicant must provide, before activation:

- (a) full name;
- (b) South African identity number;
- (c) a valid email address and mobile number;
- (d) residential address;
- (e) details of a South African bank account **in the applicant's own name**; and
- (f) consent to the processing of their personal information (clause 9).

3.4 An invitation lapses if unused within the period configured by leadership, and
may be revoked before use.

### Status

3.5 A member holds one of the following statuses *(enforced)*:

| Status | Meaning |
|---|---|
| `PENDING` | Registered but not yet activated. Holds a seat. |
| `ACTIVE` | A full member in good standing. |
| `SUSPENDED` | Rights limited under clause 8. Keeps their history and their seat. |

3.6 A suspended member does not forfeit their contributions, their record, or
their place in the circle.

### Founders

3.7 The Foundation has **four (4) founders** *(enforced)*. This number does not
grow. The founder distinction is conferred in recognition of who established the
Foundation; it is not earned, cannot be applied for, and confers no additional
share of the pool and no additional vote.

---

## 4. Contributions

4.1 Each member contributes **monthly**.

4.2 A member sets their own contribution amount, subject to *(enforced)*:

| | Amount |
|---|---|
| Minimum | **R100** per month |
| Maximum | **R10 000** per month |
| Increments of | **R50** |

4.3 Contributions are collected by **debit order** against the member's own bank
account, under a mandate signed by that member (clause 5). The default collection
day is the **1st** of each month; a member may elect a different day.

4.4 A member may change their contribution amount prospectively. A change does not
alter any month already collected or already due.

4.5 A contribution carries one of the following statuses *(enforced)*:

| Status | Meaning |
|---|---|
| `PENDING` | Due, not yet collected. |
| `PARTIAL` | Partly paid. |
| `PAID` | Settled in full. |
| `OVERDUE` | Not collected by the due date. |
| `WAIVED` | Excused by leadership under clause 4.6. |

4.6 **Waiver.** Leadership may waive a member's contribution for a given month
where the member is in genuine difficulty. A waiver:

- (a) must record a reason;
- (b) is recorded against the name of the leader who granted it and the time it
  was granted *(enforced)*;
- (c) does not create a debt, and is not recovered later; and
- (d) does not reduce the member's standing in the Foundation.

4.7 **Failed collections.** A collection that fails for reasons outside the
member's control — an outage, a timeout, or an error at the gateway — is recorded
as an infrastructure failure and **counts neither against the member nor toward
any assessment of them** *(enforced)*. Only a genuine decline reflects on a
member's account.

---

## 5. Mandates

5.1 No money may be collected from a member without an **active mandate** given by
that member.

5.2 A mandate authorises collection of a stated amount, on a stated day, from a
stated bank account in the member's own name.

5.3 A member may have **at most one pending or active mandate at any time**
*(enforced at the database level)*.

5.4 A mandate carries one of the following statuses *(enforced)*: `PENDING`,
`ACTIVE`, `SUSPENDED`, `CANCELLED`.

5.5 A member may cancel their mandate at any time. Cancellation stops future
collections; it does not reverse collections already made, and does not by itself
end membership.

5.6 The full mandate lifecycle, including how authorisation is captured and
evidenced, is described in `mandate-lifecycle.md`.

---

## 6. The pool and Goals

6.1 All contributions are held in a bank account **in the name of the Foundation**
at `[BANK]`, account `[ACCOUNT REFERENCE]`. They are not held in the personal
account of any member or leader.

6.2 Money leaves the pool **only** for a **Goal**.

6.3 A Goal is a stated purpose, with a stated amount, agreed by the circle. A Goal
carries one of the following statuses *(enforced)*: `DRAFT`, `ACTIVE`, `ACHIEVED`,
`FAILED`.

6.4 **No single member of leadership may move money out of the pool.** A payment
against a Goal requires the Goal to have been agreed and to be active, and the
payment is recorded against the name of the person who made it *(enforced)*.

6.5 Members may pledge toward, contribute to, and record progress against a Goal.
The progress of every Goal is visible to every member.

6.6 The outcome of every Goal — achieved or failed — is recorded, together with the
name of the person who documented it. A failed Goal is not deleted.

---

## 7. Leadership

7.1 The Foundation is led by its office bearers:

| Office | Holder |
|---|---|
| `[CHAIRPERSON]` | `[NAME]` |
| `[TREASURER]` | `[NAME]` |
| `[SECRETARY]` | `[NAME]` |
| `[ADDITIONAL]` | `[NAME]` |

7.2 **Leadership is bound by every rule that binds a member.** There is no
exemption from the minimum contribution, from collection, or from the record. A
leader is a member first.

7.3 **Every action taken by leadership in the system is recorded** against that
person's name and the time of the action, in a log that **no one — including
leadership — can alter or delete** *(enforced)*.

7.4 Leadership may:

- (a) issue and revoke invitations;
- (b) activate and suspend members (clause 8);
- (c) waive a contribution (clause 4.6);
- (d) record money received outside the debit order run; and
- (e) administer Goals.

7.5 Leadership may **not**:

- (a) alter or delete a member's contribution history;
- (b) alter or delete the audit record;
- (c) take money from the pool other than for an agreed Goal; or
- (d) grant themselves an exemption from any obligation in this constitution.

7.6 Office bearers are elected by a majority of members at a general meeting, and
serve for `[TERM]`. `[ELECTION AND REMOVAL PROCEDURE TO BE CONFIRMED]`

---

## 8. Default, suspension and expulsion

8.1 A contribution not collected by its due date is recorded as `OVERDUE`.

8.2 Where a member is in arrears, leadership shall first make contact and
establish whether the member is in difficulty. Where they are, clause 4.6
(waiver) is the appropriate response.

8.3 A member may be **suspended** where they are persistently in arrears without
engagement, or for conduct that damages the Foundation or its members.

8.4 A suspended member retains their contribution history, their record, and their
seat.

8.5 A member may be **expelled** only by resolution of `[MAJORITY]` of members at a
general meeting, and only after the member has been given notice and an
opportunity to be heard.

8.6 A member who is expelled is entitled to `[EXIT ENTITLEMENT — TO BE CONFIRMED]`,
calculated in accordance with clause 10.

---

## 9. Personal information

9.1 The Foundation processes members' personal information in accordance with the
**Protection of Personal Information Act, 2013 (POPIA)**.

9.2 Consent to processing is obtained at registration and the time of consent is
recorded *(enforced)*.

9.3 South African identity numbers and bank account numbers are **encrypted**
wherever they are stored *(enforced)*.

9.4 The Foundation's Information Officer is `[NAME]`, registered with the
Information Regulator under `[REFERENCE]`.

9.5 A member's rights of access, correction and deletion, and the procedure for
exercising them, are set out in `popia-compliance.md`.

---

## 10. Resignation and exit

10.1 A member may resign at any time by written notice to leadership. The date of
resignation is recorded *(enforced)*.

10.2 On resignation, the member's mandate is cancelled and no further contributions
are collected.

10.3 A resigning member is entitled to `[EXIT ENTITLEMENT — TO BE CONFIRMED]`.

> **This clause must be settled before adoption.** It is the clause that causes
> more disputes in stokvels than any other. The options are ordinarily: (a) return
> of the member's own net contributions; (b) return of contributions less a share
> of costs; or (c) a proportionate share of the pool. Each has different tax and
> legal consequences. This is a decision for the members, taken on advice, and
> written down **before** anyone needs it.

10.4 A member's record is retained after resignation for the period stated in
`popia-compliance.md`, for the Foundation's legal and accounting obligations.

---

## 11. Meetings

11.1 A **general meeting** of members is held at least `[FREQUENCY]`.

11.2 A quorum is `[QUORUM]` members.

11.3 Each member has **one vote**, regardless of their contribution amount and
regardless of whether they are a founder.

11.4 Notice of a general meeting shall be given at least `[NOTICE PERIOD]` in
advance, through the Foundation's ordinary channels of communication with members.

---

## 12. Records and reporting

12.1 The Foundation keeps:

- (a) a register of members;
- (b) a complete record of every contribution, whether paid, partial, overdue or
  waived;
- (c) a complete record of every payment out of the pool and the Goal it served;
- (d) a double-entry ledger of all movements; and
- (e) an immutable audit log of every administrative action *(enforced)*.

12.2 **Every member may inspect their own complete record at any time, and may
download it** *(enforced)*.

12.3 The financial year of the Foundation ends on `[FINANCIAL YEAR END]`.

12.4 The Foundation's financial statements shall be `[REVIEWED / AUDITED]` annually
by `[ACCOUNTANT]` and presented to members at a general meeting.

---

## 13. Dispute resolution

13.1 A member with a dispute shall first raise it with leadership, which shall
respond within `[PERIOD]`.

13.2 A dispute not resolved under 13.1 shall be referred to a general meeting of
members.

13.3 A dispute not resolved under 13.2 shall be referred to mediation, and failing
mediation, to `[ARBITRATION / THE COURTS]`.

13.4 No member shall approach a court before exhausting 13.1 and 13.2.

---

## 14. Amendment

14.1 This constitution may be amended only by resolution of `[MAJORITY]` of the
members at a general meeting called with notice of the proposed amendment.

14.2 No amendment may:

- (a) remove the requirement that every leadership action be recorded;
- (b) permit money to leave the pool other than for an agreed Goal;
- (c) grant leadership an exemption from an obligation binding on members; or
- (d) raise the membership cap above fifty without a resolution of `[SPECIAL
  MAJORITY]`.

14.3 An amendment takes effect only once recorded in writing and signed by the
office bearers.

---

## 15. Dissolution

15.1 The Foundation may be dissolved by resolution of `[SPECIAL MAJORITY]` of
members at a general meeting called for that purpose.

15.2 On dissolution, the Foundation shall:

- (a) settle all outstanding obligations;
- (b) complete or abandon all active Goals, and account for each; and
- (c) distribute the remaining pool among members in accordance with `[BASIS OF
  DISTRIBUTION — TO BE CONFIRMED]`.

15.3 The records of the Foundation shall be retained for `[PERIOD]` after
dissolution.

---

## Adoption

We, the undersigned members of Xkimm Xa Mali Foundation, adopt this constitution.

| Name | Office | Signature | Date |
|---|---|---|---|
| `[NAME]` | `[OFFICE]` | | |
| `[NAME]` | `[OFFICE]` | | |
| `[NAME]` | `[OFFICE]` | | |
| `[NAME]` | `[OFFICE]` | | |

---

## Open decisions

These must be answered by the members before adoption. They are gathered here so
they can be worked through in one sitting rather than found one at a time.

| # | Clause | Decision needed |
|---|---|---|
| 1 | 1.4 | Self-regulatory body membership (NASASA or other) — confirm and obtain number |
| 2 | 6.1 | Bank and account details for the pool |
| 3 | 7.1 | Office bearers, and their titles |
| 4 | 7.6 | Term of office, election and removal procedure |
| 5 | 8.5 | Majority required to expel |
| 6 | **10.3** | **Exit entitlement on resignation — the single most important open item** |
| 7 | 8.6 | Exit entitlement on expulsion (may differ from 10.3) |
| 8 | 11.1–11.4 | Meeting frequency, quorum, notice period |
| 9 | 12.3–12.4 | Financial year end; reviewed or audited; by whom |
| 10 | 13.3 | Arbitration or the courts |
| 11 | 14.1 | Majority required to amend |
| 12 | 15.1–15.2 | Special majority to dissolve; basis of distribution |
