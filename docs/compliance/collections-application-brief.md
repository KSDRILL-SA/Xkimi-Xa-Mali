# Collections application — the risk argument

**Written:** 2026-09-05 · For a reapplication to Netcash, and reusable for any
sponsoring bank or aggregator.

## Why this document exists

The DebiCheck application was declined because the processing bank required an
existing **debit-order base** — a book of collections already running, with a
track record. A new stokvel cannot have one, which makes it a catch-22 rather than
a gap that effort closes.

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
| **Every payment already has proof** | Proof of payment is required on every offline payment recorded today, or a witness note for cash. That habit predates any gateway |

### Legal risk — the mandate and the paperwork

Vetting under §1.3 is specifically a mandate sample. Ours can meet C3 §3 in full
before the conversation starts: full creditor name, Abbreviated Short Name,
Contract Reference, first collection date, collection day, frequency, date
adjustment rule, and the payer's identity, bank, account number, explicit
authority and the date consent was granted.

Supporting position:

- A registered NPO with a written constitution and elected office bearers
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

1. **Start capped.** Volunteer a monthly collection ceiling well under what we
   need, and step it up on clean ratios. Turns an unbounded unknown into a bounded
   one, which is the bank's actual concern.
2. **Security or a rolling reserve.** Cash cover against disputes in place of
   history. Costs working capital; it is a real answer to a real exposure.
3. **Collect under a sponsor.** As a sub-merchant of an aggregator holding its own
   DebiCheck registration. **This is the only route that removes the objection
   rather than arguing with it**, and it should be priced before the reapplication,
   not after it.
4. **NASASA.** The stokvel self-regulatory body, whose purpose is exactly this
   gap. Membership may also carry weight in the §1.1 conversation.
5. **Offer the ratios back.** We will be measured on 10% unpaid and 0.5% dispute
   (§16.1). Volunteering to report against them monthly, before being asked, is
   cheap and says something about how the operation is run.

## What must be fixed before collecting, whoever accepts us

Not negotiable, and cheaper to fix now than to be found in breach of:

| | |
|---|---|
| **The fee buffer** | Every collection currently submits R10 more than the mandate registers as the Instalment Amount, which makes each one qualify as a dispute under §10.6.3. Against a 0.5% threshold this is the single most dangerous thing in the codebase. See **A5-F59** |
| **The per-payer reference** | §3.3 and §18.9 require a unique Contract Reference per payer, on their statement, unchangeable once presented. We send one per period. It has to be chosen correctly the first time. See **A5-F62** |
| **The retry policy** | Four presentments against a limit of two, and a representment automatically qualifies a dispute under §10.6.5. See **A5-F60** |

## Sequencing

The owner's plan — get the three members onto real accounts, record their payment
history, then reapply — is sound, and it produces the strongest evidence available
for §1.1: real members, real money, a real monthly cadence, all documented.

**Run tracks 3 and 4 in parallel.** Both have long lead times, and if the direct
reapplication is declined again for the same structural reason, starting those
conversations afterwards costs another quarter.

---

**Source:** [Appendix A to Debit Order and DebiCheck Service Terms V.01072025](https://netcash.co.za/wp-content/uploads/2026/03/Appendix-A-to-Debit-Order-and-DebiCheck-Service-Terms-V.01072025.pdf)
