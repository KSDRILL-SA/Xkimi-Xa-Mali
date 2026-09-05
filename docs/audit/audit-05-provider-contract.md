# Audit 5 — The provider's own contract, read against our code

**Read:** 2026-09-05 · **Findings:** 59–63 (5) · **Status:** **all four defects fixed** (PR #506); F63 is a standing constraint

> **Fixed 2026-09-05.** A5-F59, F60, F61 and F62 are closed. **D4 was answered
> by implementation** — the mandate registers the fee-inclusive amount, so the
> member authenticates the real figure, the Foundation still nets the full
> contribution, and there is no dispute exposure. Absorbing the fee also removes
> the exposure but costs R10 per member per month; the change is one function if
> leadership prefers that. A5-F63 is not a defect and stays as a design
> constraint on everything in Phase 3.

## What this audit is

Not an external reviewer. This is **Netcash's own service contract**, read line by
line against what the code actually submits.

That makes it a different class of evidence from audits 1–4. Those were an
auditor's reading of our code, which we then verified. This is the document we
would be **contractually bound by**, and the findings are things we would be in
breach of on day one — or, in one case, things that would make every collection
we ever send disputable against a threshold of half a percent.

**Source:** [Appendix A — Minimum Requirements to Use the Debit Order and DebiCheck
Services, V.01072025](https://netcash.co.za/wp-content/uploads/2026/03/Appendix-A-to-Debit-Order-and-DebiCheck-Service-Terms-V.01072025.pdf).
Clause numbers below are from that document. Section A governs EFT debit orders,
section B DebiCheck; where they differ it is noted, because we would be using
DebiCheck.

### Why it was read at all

The owner asked what "debit order book" the sponsoring bank wanted. The contract
turns out not to mention one — which is itself the most useful finding, and is
recorded in the reapplication brief rather than here.

Reading it for that answer surfaced five things about our own code.

---

## Verification summary

| ID | Finding | Severity | Verdict |
|---|---|---|---|
| A5-F59 | The fee buffer makes **every** collection disputable | **P0** | **CONFIRMED** |
| A5-F60 | The retry policy exceeds the presentment limit | P1 | **CONFIRMED** |
| A5-F61 | A mandate auto-suspended by the bank tells nobody | P1 | **CONFIRMED** |
| A5-F62 | A1-F03 is a contractual breach, not only a reconciliation gap | — | **ESCALATION** |
| A5-F63 | The ratio thresholds are a design constraint at our volume | — | **CONSTRAINT** |

All five are **dormant** — there is no gateway. All five must close before one is
switched on, and A5-F59 changes a design decision rather than fixing a bug.

---

## A5-F59 — The fee buffer makes every collection disputable

**Severity: P0** · **Verdict: CONFIRMED** · Dormant

### What the contract says

> **§10.6** A Dispute Request will qualify as a Dispute Action if: … **§10.6.3**
> the amount collected in accordance with the Payment Instruction is greater than
> the Instalment Amount in the Mandate Register

And on what the mandate may register (**C3 §3.10**):

> **Maximum Amount:** can be up to 1.5 times greater than the Instalment Amount.

### What the code does

`apps/web/lib/group-account.ts:26`:

```ts
export function debitAmountWithFee(contributionAmount: number): number {
  return sumZAR(contributionAmount, NETCASH_FEE_BUFFER)   // + R10
}
```

Every collection path submits the fee-inclusive figure — `debit-run.ts:202`,
`contribution.service.ts`, `transaction-retry-failed.ts:94`.

And `apps/web/lib/netcash.ts:248`, where the mandate is registered:

```ts
collectionAmountCents: cents,
maximumCollectionAmountCents: cents,
```

**Both are set to the same value.**

### Why this is the worst finding in five audits

A R450 contribution registers an Instalment Amount of R450 and a Maximum of R450,
and then collects **R460**.

By §10.6.3 that is greater than the registered Instalment Amount, so **every
single collection qualifies as a Dispute Action** — not "may be disputed", but
qualifies automatically if the payer raises it. Against the 0.5% threshold in
§16.1, one member noticing is a fourfold breach (see A5-F63).

And the mechanism that would make it legitimate was thrown away in the same line.
The contract explicitly permits a Maximum of up to **1.5×** the Instalment
precisely so that a variable or fee-inclusive collection has headroom. Setting
`maximum = collection` discards it.

### What this changes

Not a bug fix — a decision. Three options, and the choice belongs to leadership:

1. **Register the fee-inclusive amount as the Instalment Amount.** The member's
   mandate says R460, and R460 is collected. Honest, and the member authenticates
   the real figure at their bank.
2. **Register R450 with a Maximum of, say, R500.** Permitted, and it is what the
   Maximum field is for — but the member authenticates a ceiling rather than a
   figure.
3. **Stop passing the fee on.** The Foundation absorbs it; contribution and
   collection are the same number and the whole class of dispute disappears.

Option 3 is the only one with no dispute exposure at all, and at R10 per member
per month the arithmetic is worth doing before assuming otherwise.

---

## A5-F60 — The retry policy exceeds the presentment limit

**Severity: P1** · **Verdict: CONFIRMED** · Dormant

### What the contract says

> **§16.1 (DebiCheck)** Only 2 (two) presentments are allowed for the same Action
> Date…
>
> **§13.2.2 (EFT)** The Client must not … present more than 2 (two) Payment
> Instructions in any particular Payment Cycle.

And, sharply:

> **§10.6.5** A Dispute Request will qualify as a Dispute Action if … the Payment
> Instruction is a representment.

### What the code does

`packages/utils/src/constants.ts:35` — `MAX_TRANSACTION_RETRY = 3`, and
`transaction-retry-failed.ts` runs daily (`cron: '0 10 * * *'`) for seven days
against `retryCount < 3`.

So the original submission plus three retries is **four presentments** against one
action date. The limit is two.

§10.6.5 compounds it: a representment that the payer disputes qualifies
automatically. So the retries that breach the limit are also the collections most
likely to be upheld as disputes.

### The fix is a number, and a question

`MAX_TRANSACTION_RETRY = 1` satisfies both clauses. What it costs is recovery: a
member whose salary lands two days late currently gets three chances and would
get one.

Worth pairing with the contract's own alternative — **Credit Tracking**
(§9, DebiCheck), which tracks an account for up to 10 calendar days waiting for
funds rather than re-presenting and failing. That is the mechanism designed for
exactly this case, and we do not use it.

---

## A5-F61 — A mandate suspended by the bank tells nobody

**Severity: P1** · **Verdict: CONFIRMED** · Dormant

### What the contract says

> **§15.2** Mandate Information will also automatically be suspended: **§15.2.1**
> after the 7th (seventh) consecutive unsuccessful Payment Instruction…
>
> **§15.11** The User has 13 (thirteen) months to reinstate or cancel the Mandate
> from the Mandate Register, failing which the Mandate Information will be
> removed…

### What the code does

`mandate-status-sync.ts` picks the change up correctly and writes it. Then:

```ts
if (newStatus === 'CANCELLED') {
  await queueNotification({ ..., templateSlug: 'mandate-cancelled', ... })
}
```

**`CANCELLED` tells the member. `SUSPENDED` does not.**

The debit run collects only from `ACTIVE` mandates, so a suspended one stops being
collected — correctly. But the member is told nothing, and neither is leadership.
Their contributions simply stop, and the first sign is a gap in a statement.

The comment two lines above the notification says exactly why this matters, about
the cancelled case:

> Without this the member's contributions simply stop and the first they hear of
> it is a gap in their statement.

The same sentence is true of suspension, and suspension is the one the *bank*
triggers without anybody choosing it.

**Note the interaction with A5-F60.** Seven consecutive failures is the trigger,
and our retry policy generates up to four presentments per month. Two bad months
reach it.

---

## A5-F62 — A1-F03 is a contractual breach, not only a reconciliation gap

**Verdict: ESCALATION of an existing finding** · Dormant

A1-F03 recorded that `debit-run.ts:202` sends `XXM-${year}-${month}` as the
reference for every member, so a load report cannot be attributed to anyone. That
stands, and the contract makes it stricter than a reconciliation problem:

> **§3.3** The Payment Instruction is identifiable by a unique Abbreviated Short
> Name and unique **Contract/Agreement Reference** between the Client and its
> Customer.
>
> **§10.3 / C3 §3.3** The Contract Reference … must reflect on the Customer
> statement.
>
> **§18.9** Once a Payment Instruction has been presented against the Payer's Bank
> Account, a Contract Reference **cannot be changed for the duration of the
> Contract**.

So the reference must be **per payer**, must appear on their bank statement, must
be in the registered mandate, and can never change afterwards.

`XXM-2026-09` fails all four: it is per period, identical across members, and by
construction changes every month.

**This raises the priority of A1-F03 and constrains its fix.** Whatever scheme
replaces it must be stable for the life of the member's mandate — so it cannot
encode the period, and it must be chosen before the first collection, because
§18.9 makes it permanent.

`mandate.service.ts:135` already builds `XXM-${userId.slice(-8).toUpperCase()}`,
which has exactly the right shape.

---

## A5-F63 — The ratio thresholds are a design constraint, not a target

**Verdict: CONSTRAINT** · Governs the design rather than naming a defect

> **§16.1** The Client is obligated to adhere to certain thresholds in relation to
> the total monthly Payment Instructions processed per Abbreviated Short Name as
> follows: **10%** for the Unpaid Ratio; and **0.5%** for the Dispute Ratio.

At fifty members collecting once a month, fifty is the denominator:

| | Threshold | What it means for us |
|---|---|---|
| Unpaid | 10% | **5 bounces** in a month |
| Dispute | 0.5% | **0.25 — so one dispute is a fourfold breach** |

A single member disputing a single collection puts the Foundation into
investigation. And §16.5 removes the obvious escape:

> During the investigation and remediation period, the Client will not be allowed
> to change to another Third Party Payment Provider.

**This is why A5-F59 is filed P0 rather than P2.** A defect that makes every
collection disputable is ordinarily a slow leak; against a 0.5% threshold at a
denominator of fifty, it is one annoyed member away from a suspended facility we
cannot leave.

**What protects us**, and it is worth stating because it is the argument for
DebiCheck over EFT: a DebiCheck dispute only qualifies on narrow grounds
(§10.4) — the amount differs from what was authorised, or the date was not
authorised. A payer cannot simply assert they never agreed, because they
authenticated the mandate at their own bank.

Which is precisely why A5-F59 matters so much. Collecting more than the registered
Instalment Amount walks straight into the one door DebiCheck leaves open.

*(By contrast, under EFT debit orders §9.5.4 says voice-recorded and electronic
mandates "will not be considered in the event of a dispute" and the client's
account is simply debited. Having the mandate on file is no defence there. That is
a further argument for DebiCheck, and against ever falling back to EFT collections
as a workaround.)*

---

## What this changes in the plan

| Finding | Where it goes |
|---|---|
| A5-F59 | **A decision before an item.** Leadership picks one of the three options; the code follows |
| A5-F60 | Folds into the retry work; pair with Credit Tracking (§9) as the designed alternative |
| A5-F61 | Small, and independent of everything else |
| A5-F62 | Raises A1-F03's priority and constrains its fix — the reference must be permanent |
| A5-F63 | Governs G-phase design; not an item |

None of it is scheduled, for the same reason as the rest of Phase 3: there is no
gateway, and getting one is a business decision.

**One thing worth carrying forward regardless of provider.** Every finding here
came from reading the contract we would sign, against the code we would sign it
for. Nothing in audits 1–4 found A5-F59, and it is the most serious of the sixty-
three. That is now item 8 of the adapter contract in the plan — *a sandbox* — with
a companion: **read the service terms before writing the adapter, not after.**
