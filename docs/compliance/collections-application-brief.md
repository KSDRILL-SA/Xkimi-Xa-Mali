# Collections application — the applicant, and the risk argument

**Written:** 2026-09-05 · For a reapplication to Netcash, and reusable for any
sponsoring bank or aggregator.

## Read this before anything else: who is applying

**The applicant is KSDRILL SA (Pty) Ltd, registration number 2026/614917/07.**

Not the Foundation. This is how the first application was made and it is how the
next one must be made, because the Foundation is a voluntary association that
holds no CIPC registration of its own — it is *operated through* KSDRILL SA under
clause 1.4A of its constitution, and KSDRILL SA holds the collection account **in
custody for the Foundation's members**.

This matters more than it looks. An earlier draft of this document argued the
case as though a new stokvel were applying, which threw away the applicant's
single strongest asset: **KSDRILL SA is not new.** It is an existing registered
company with its own CIPC registration, its own financial year end, its own bank
relationship and its own trading history. The catch-22 below is real, but it is
narrower than it first appears, and it is narrower precisely because of who is
signing the form.

| | |
|---|---|
| **Legal applicant** | KSDRILL SA (Pty) Ltd |
| **Registration** | 2026/614917/07 (CIPC) |
| **Bank relationship** | Capitec Business — an existing account, not opened for this |
| **Collection account** | The same account, held in custody for the Foundation's members |
| **Trading name on the payer's statement** | "Xkimi Xa Mali" — permitted; see below |
| **The payers** | Members of Xkimi Xa Mali Foundation, a closed savings circle |
| **Governing document** | Constitution of Xkimi Xa Mali Foundation, signed 2026-08-24 |

### The trading name is allowed, and it should be used

C3 §3.1 requires the mandate to carry the creditor's name and an **Abbreviated
Short Name**; it does not require the Abbreviated Short Name to be the
registered name. So the payer's bank statement can read **Xkimi Xa Mali** rather
than KSDRILL SA.

Use it. A member who sees an unfamiliar company name on their statement disputes
it, and under §10.6 a dispute is exactly what must not happen. Getting this right
is worth more than it costs, which is nothing.

### The custody arrangement must be disclosed, not buried

The account holds money that belongs to the Foundation's members and not to
KSDRILL SA. Say so in the application. A risk team that discovers a custody
arrangement after onboarding treats it as something concealed; one that is told
up front, with the constitutional clause that creates it (1.4A, and 6.1 as
amended — see `resolution-2026-09-banking.md`), treats it as governance.

---

## Why this document exists

The DebiCheck application was declined because the processing bank required an
existing **debit-order base** — a book of collections already running, with a
track record. Neither KSDRILL SA nor the Foundation has one, and a savings
circle collecting from its own members cannot manufacture one, which makes it a
catch-22 rather than a gap that effort closes.

Reading the contract shows why the objection can be argued with.

## There is no book requirement in the contract

[Appendix A](https://netcash.co.za/wp-content/uploads/2026/03/Appendix-A-to-Debit-Order-and-DebiCheck-Service-Terms-V.01072025.pdf)
§1 states the qualifying criteria in full:

> **1.1** The Client must not introduce any risk into the National Payment System.
> This risk includes but is not limited to, reputational, legal and/or financial
> risk.
> **1.2** The Client must submit Payment Instructions as per the specifications
> provided to them by Netcash.
> **1.3** The Client must comply with Netcash's pre-onboarding vetting which
> includes (without limitation) producing a sample of their Mandate…

**No trading history. No minimum volume. No book.**

A book is *evidence* toward the §1.1 judgement, not a criterion in its own right.
That matters, because it means the application does not have to produce a thing
that cannot exist — it has to address §1.1 directly, on other evidence.

> **Caveat, so nobody over-reads this.** Appendix A is the service contract, not
> the application form. What the risk team asks for during onboarding is not
> published. The absence of a book requirement here proves it is not contractual;
> it does not prove they will not ask. The argument below is for the conversation
> that follows when they do.

## The three risks in §1.1, answered

### Financial risk — the money the bank could lose

The bank's exposure on a collector is disputes and unpaids it has to fund and then
recover. Ours is unusually small and unusually knowable:

| | |
|---|---|
| **Ceiling on exposure** | Fifty members, capped in the software and in the constitution. Contributions R100–R10,000. Maximum monthly collection is bounded and small |
| **Who the payers are** | A closed savings circle. Members are collecting from *themselves* — the money goes into a fund they own a share of. There is no customer/supplier relationship to sour |
| **Nobody is sold anything** | Most dispute risk comes from people who forgot they subscribed, or feel mis-sold. Neither exists here |
| **The applicant is not a shell** | KSDRILL SA is an existing operating company with its own registration, its own year end and an existing banking relationship at the same institution |
| **Every payment already has proof** | Proof of payment is required on every payment recorded today, or a witness note for cash. That habit predates any gateway and is the direct answer to "how would you evidence a disputed collection?" |

### Legal risk — the mandate and the paperwork

Vetting under §1.3 is specifically a mandate sample. Ours can meet C3 §3 in full
before the conversation starts: full creditor name, Abbreviated Short Name,
Contract Reference, first collection date, collection day, frequency, date
adjustment rule, and the payer's identity, bank, account number, explicit
authority and the date consent was granted.

Supporting position:

- A CIPC-registered company as applicant, with a signed constitution governing the
  fund it collects for and elected office bearers accountable under it
- POPIA compliance work completed and documented (`docs/compliance/`)
- Member ID numbers and bank details encrypted at rest, with a documented key
  rotation runbook
- Every administrative action written to an append-only audit log
- Backups encrypted, off-site, and **restore-proven** — 40 tables, 623 rows, drill
  documented and re-run monthly

That last one is worth saying out loud. Most applicants of this size cannot
demonstrate a tested restore.

### Reputational risk — what a complaint would look like

The realistic complaint is a member saying *"the Foundation took the wrong amount"*
— which is a bookkeeping failure, not a conduct one, and is exactly what
DebiCheck's authentication and the audit trail are designed to make impossible and
provable respectively.

There is no acquisition channel, no advertising, no cold outreach, no third-party
sales. Members join by invitation from an existing member, and the software
enforces that.

## The argument worth making plainly

**DebiCheck is the product that removes the risk being gatekept for.**

Under DebiCheck a dispute qualifies on narrow grounds only (§10.4): the amount
differs from what was authorised, or it was presented on a date that was not. The
payer authenticated the mandate at their own bank — they cannot simply assert they
never agreed.

Compare EFT debit orders, where §9.5.4 states that voice-recorded and electronic
mandates "will not be considered in the event of a dispute" and the client's
account is debited regardless.

So the historical dispute experience that makes sponsors cautious about new
collectors is largely an artefact of the **pre-DebiCheck** rails. Applying that
caution to a DebiCheck-only applicant asks us to prove a risk the product has
already removed.

This is an argument against a policy, not a defect in one. Policies do not always
yield to being correct — which is why it is one of three tracks, not the plan.

## What we can offer instead of a book

Listed so the conversation has somewhere to go when "you have no history" is
raised:

1. **The record we are building now.** Every contribution since the decline is
   paid by transfer or in cash, recorded against a named member and a named
   month, with proof of payment attached and an audit entry naming whoever
   recorded it. It is not a debit-order book, and it should not be presented as
   one. It *is* a documented monthly collection cadence with evidence behind
   every line — which is the underlying thing a book is asked for as a proxy for.
2. **Start capped.** Volunteer a monthly collection ceiling well under what we
   need, and step it up on clean ratios. Turns an unbounded unknown into a bounded
   one, which is the bank's actual concern.
3. **Security or a rolling reserve.** Cash cover against disputes in place of
   history. Costs working capital; it is a real answer to a real exposure.
4. **Collect under a sponsor.** As a sub-merchant of an aggregator holding its own
   DebiCheck registration. **This is the only route that removes the objection
   rather than arguing with it**, and it should be priced before the reapplication,
   not after it.
5. **NASASA.** The stokvel self-regulatory body, whose purpose is exactly this
   gap. Membership may also carry weight in the §1.1 conversation.
6. **Offer the ratios back.** We will be measured on 10% unpaid and 0.5% dispute
   (§16.1). Volunteering to report against them monthly, before being asked, is
   cheap and says something about how the operation is run.

## What must be fixed before collecting — all now fixed

These were live breaches when this document was first written. They were fixed on
2026-09-05 and each is held by a test, so they cannot come back silently. Kept
here because the application conversation may reach them, and because the answer
"we found it ourselves, before collecting a rand" is a better one than a clean
sheet with nothing behind it.

| | |
|---|---|
| **The fee buffer** | Every collection submitted R10 more than the mandate registered as the Instalment Amount, which made each one qualify as a dispute under §10.6.3. **Fixed:** the mandate now registers the fee-inclusive amount as the Instalment, with a Maximum above it — inside the 1.5× ceiling C3 §3.10 allows. See **A5-F59** |
| **The per-payer reference** | §3.3 and §18.9 require a unique Contract Reference per payer, on their statement, unchangeable once presented. Four different references existed, three of them per-period. **Fixed:** one reference, derived from the member's own identity, used by all five collection paths. See **A5-F62** |
| **The retry policy** | Four presentments against a limit of two, and a representment automatically qualifies a dispute under §10.6.5. **Fixed:** one retry, two presentments total. See **A5-F60** |
| **A bank-suspended mandate told nobody** | §15.2.1. **Fixed:** a mandate the bank and we disagree about is held in a state the debit run skips, and the member is notified. See **A5-F61** |

The lesson is recorded in `docs/audit/implementation-plan.md` and worth repeating
here: **read the service terms before writing the adapter.** Four independent
code audits found none of these. Reading the contract found all four.

## Sequencing

The owner's plan — get the three members onto real accounts, record their payment
history, then reapply — is sound, and it produces the strongest evidence available
for §1.1: real members, real money, a real monthly cadence, all documented.

Two things to settle before the form is submitted:

- **The constitution must say what is true about banking.** Clause 6.1 as signed
  names only the Capitec account. The amendment is drafted in
  `resolution-2026-09-banking.md` and needs a meeting and signatures. Submitting
  an application with a governing document that misdescribes the applicant's own
  accounts is an avoidable own goal.
- **Run tracks 4 and 5 in parallel.** Both have long lead times, and if the direct
  reapplication is declined again for the same structural reason, starting those
  conversations afterwards costs another quarter.

---

**Source:** [Appendix A to Debit Order and DebiCheck Service Terms V.01072025](https://netcash.co.za/wp-content/uploads/2026/03/Appendix-A-to-Debit-Order-and-DebiCheck-Service-Terms-V.01072025.pdf)
