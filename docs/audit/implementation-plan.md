# Implementation plan — external audit rounds 1–4

**Written:** 2026-09-04 · **Covers:** 58 findings across four audits · **Status:** the order work will be done in. Nothing started.

## How to read this

Four audits produced 58 numbered findings. They are not 58 pieces of work.

- **13 need no work** — endorsements, hypotheses that did not hold, and one
  finding that was already fixed.
- **17 are rediscoveries** — the same defect found again from a different angle.
  Each carries new evidence or a better remedy, which is folded into the original
  item rather than scheduled twice.
- **28 work items remain**, plus **3 decisions that are not ours to make**.

*(Phase 3 later gained two more — **G9** and **G10** — when it was redesigned to be
provider-agnostic rather than Netcash-specific. They are mechanism rather than
findings, which is why the mapping below still accounts for 28.)*

Every finding is accounted for in the mapping table below. Nothing was dropped
silently.

---

## The ordering principle, and why it is not severity

The audits rank by severity. Ranked that way, the Netcash integration comes
first: four P0s about batch lifecycle, references and report consumption.

**We are not doing that, and the reason is the single most important fact about
this system:**

> There is no payment gateway. The DebiCheck application was declined. A live
> deployment selects `disabledGateway`, every money operation refuses, and money
> is recorded as it actually arrives — cash and EFT through the admin console.

So the P0s are real, correct, and **dormant**. No code path reaches them today.
Meanwhile a two-admin race can lock leadership out of the admin console this
afternoon, and nothing in the audits ranks that first.

The order is therefore:

1. **What can produce a wrong outcome now**, on the paths money actually takes.
2. **The patterns**, fixed everywhere they appear rather than where they were
   found — because the auditors' own thesis is that this system's failures are
   *inconsistent guarantees between paths that should provide the same
   guarantee*, and fixing one instance of an inconsistency is how you get four.
3. **The gateway lifecycle**, built from the documented contract, deferred where
   it depends on a contract nobody has verified.
4. **Certification**, which cannot start without credentials.

### One thing severity ordering would have got badly wrong

A1-F12 (`DEPLOY_ENV` can make production behave as non-live) is filed as P1. It
is **already fixed** — `VERCEL_ENV=production` is now first and unconditional,
and a test pins it across every declared value. Implementing that recommendation
would move correct code back toward the shape that caused the phantom payment.

That is why every finding was verified before it entered this plan.

---

## Decisions required before their items can start

These are leadership and product questions. Engineering can implement either
answer; it cannot pick one.

| ID | Question | Blocks | From | Status |
|---|---|---|---|---|
| **D1** | May the pool balance go legitimately negative? | L3 | A2-F16 | **Answered — no** |
| **D2** | What does a second successful payment against a settled period mean? | L10 | A4-F56 | **Answered — it stands** |
| **D3** | Is "last day of the month" a first-class debit day? | G8 | A3-F35 | Open |

### D1 — the pool may not go negative

**Decided: a negative balance is always a defect, and alarms.**

It follows from what the two directions mean in this system *today*. A CREDIT is
money arriving; a DEBIT is money that arrived and was pulled back. **There is no
disbursement** — no code path debits the pool for a payout, because the
Foundation has not made one. So every debit undoes a specific credit that came
before it, and the sum cannot legitimately fall below zero.

The codebase was already relying on this without saying so: `reconcileLedger`'s
reversal query carries `processedAt: { not: null }`, commented *"a payment that
went straight from PENDING to REVERSED never credited the pool, and debiting it
would drive the balance negative."* The rule was enforced in one query and
unstated everywhere else.

**What would change it:** payouts. The day the pool pays money out, a debit stops
implying a prior credit, and a reversal landing after a distribution could
legitimately take the balance under. That is the moment to revisit — which is why
the reasoning sits in `ledger.service.ts` beside the assertion.

### D2 — an overpayment stands, and somebody is told

**Decided: record it, keep it, and raise it for a human decision.**

The alternatives and why not:

- **Reject the second payment.** The money has physically arrived — it is cash or
  an EFT an admin is entering. Refusing to record it would make this system
  disagree with the bank, which is the one thing a ledger may never do.
- **Credit it forward automatically.** That moves a member's money between months
  with nobody deciding to. It may well be right; it is not the system's call to
  make quietly.
- **Refund it automatically.** Same objection, and it moves money.

So it stands as an overpayment and leadership decides — carry forward or return —
as an explicit act with a name on it. The period still reads PAID, which is true,
so nothing else would ever mention it; hence the alert.

`warning`, not `critical`: no money moved wrongly and nobody is out of pocket. It
is a decision waiting for a person, not an incident.

### Both decisions were taken by the implementer, not the owner

Recorded plainly because it matters who decided. The owner delegated explicitly
while the work continued overnight. Both are reversible — D1 by changing one
assertion and its reasoning, D2 by changing what the alert recommends — and both
are argued from what the system does today rather than from preference. They
should be reviewed.

**D1 and D2 are reachable today.** D1 because an admin reversing an offline
transaction posts a `DEBIT`; D2 because an admin recording the same cash handover
twice under different references is an ordinary event. Neither is hypothetical
and neither has an answer written down anywhere.

Everything else in Phase 1 proceeds without waiting for these.

---

## Phase 1 — Live today

Ten items. Each can produce a wrong outcome, or hide one, on a path that exists
right now with no gateway.

### L1 · Serialise the last-admin invariant
**Findings:** A1-F05, A2-F26, A4-F50 · **Size:** M · **Live**

Two paths can break one invariant and neither sees the other: revoking a role
(`invite.service.ts:527`) and suspending an account
(`admin/lib/services/members.ts:128`). Both read a count, decide, then write,
outside any transaction. Two admins acting at once — one revoking B, one
suspending A — pass both checks independently and leave zero active admins.

**Approach.** Serialise the *invariant*, not each operation. A count-then-write
in application code cannot hold it however carefully each site is written; the
guarantee belongs in the database. Both call sites already share their decision
module (`refuseRoleChange` / `refuseStatusChange`), which is the right shape —
what is missing is that the decision and the write are not atomic.

**Acceptance.** A test that runs both operations concurrently and asserts at
least one active admin survives. The conditional count (only queried when it
could matter) must survive the fix.

**Why first.** It is the only finding in 58 whose failure mode locks leadership
out of their own system, and recovery requires direct database access.

---

### L2 · Reserve, don't count, the member cap
**Findings:** A1-F06, A2-F27 · **Size:** M · **Live**

> Counting isn't reservation.

`invite.service.ts:159–161` computes `remaining` from a count; line 192 throws on
`isFull`; line 401 is the registration backstop. Two admins both reading 49
members create two invitations and occupy 51 places.

**Preserve the business rule exactly.** A2-F28 endorsed it specifically: the cap
counts `members + unexpired pending invitations`, not active users, which is what
stops "invite 20 people and have 20 race to register". Change how the place is
held, not what counts as taken.

**Acceptance.** Concurrent invitation creation at the boundary cannot exceed
`MAX_MEMBERS`. `FACTS.memberCap` stays true — an overshoot makes a published fact
false, which this repository already treats as its own defect class.

---

### L3 · Ledger invariants: the negative balance and the source-state matrix
**Findings:** A2-F16 (needs **D1**), A2-F17, A4-F55 · **Size:** M · **Live**

`getPoolBalance` returns `credited - debited` with no floor, no assertion and no
alarm (`ledger.service.ts:99`). A negative pool would render on the Fund page as
an ordinary figure.

The finding is not that negative is wrong. **It is that nobody has decided**, and
an undecided invariant on a money page is how a wrong number reaches members with
total confidence.

Alongside it, A2-F17's matrix — which `(source state, direction)` combinations
are legal — turns an unwritten convention into something reconciliation can
check:

| Source state | CREDIT | DEBIT |
|---|---|---|
| Transaction SUCCESS | yes | no |
| Transaction REVERSED | credit exists, plus | yes |
| Transaction FAILED | no | no |
| GoalPayment SUCCESS | yes | no |
| GoalPayment REVERSED | credit exists, plus | yes |

A4-F55's period-closure question belongs here too: both are *"which financial
states are closed, and what may still write to them."*

**Blocked on D1** for the alarm behaviour. The matrix and the reconciler check
can proceed regardless.

---

### L4 · A written contract for derived vs materialised money
**Findings:** A2-F15, A3-F42 · **Size:** S · **Live**

Three findings are the same missing sentence. `applySettledPayment` persists
`SUCCESS`, then calls `resyncGoal()`, then credits the ledger — and the ledger
post is deliberately best-effort (`.catch(log)`) so it can never unwind a
settlement, while `resyncGoal` is **not wrapped**, so a throw there skips a credit
that would otherwise have been attempted. `suggestPlan` reads the materialised
`goal.currentAmount` rather than deriving.

**The fix is mostly writing it down**, plus one guard:

> `SUCCESS` means settlement recorded. Ledger posting is an asynchronous
> projection guaranteed by reconciliation. Derived figures are authoritative;
> materialised ones are a cache with a stated catch-up guarantee.

This repository has made this exact correction once already, on the offline
contribution path, and recorded why: **correct by tomorrow is not correct.** The
same sentence belongs here.

---

### L5 · One answer for objects you may not see, and a route sweep
**Findings:** A4-F46, A4-F45, A4-F49 · **Size:** M · **Live**

Absent gives 404; someone else's gives 403. Both patterns live in
`mandate.service.ts` — bank accounts, the most sensitive objects in the system,
use the safe combined check at line 116; mandates use the leaky one at 82, 198,
270 and 331. `contribution.service.ts:116` too.

Severity is modest — ids are `cuid()`, and the group is fifty people who know
each other — but the fix is cheap and it travels with work that is not optional:

**The sweep.** Thirteen of ninety-two route files were read during the audit. The
remaining verification is that every object-id endpoint reaches a service that
calls `assertCanAccess` against the **loaded row**, and that no route trusts
`session.user.role` without resolving current authorisation state. That check
should be permanent, not a one-off reading: this repository already writes tests
of exactly that shape (`services.authz.test.ts` refuses to let a new admin
service go unregistered).

---

### L6 · PII minimisation in operational logs
**Findings:** A1-F13 · **Size:** S · **Live**

`invite.service.ts:253` logs `email` beside `inviteId` and `adminId`. Also
`member.service.ts:183`, `invite.service.ts:461`,
`auth/resend-verification/route.ts:51`.

**Two cases, decided separately.** Application logs should carry ids. Audit-log
payloads are a legal artefact, where POPIA minimisation is weighed against the
accountability requirement that the record identify who was affected. The
auditor's test is the right one: *unless the operational task requires the contact
information.* Do not sweep both with one rule.

---

### L7 · Three operational blind spots
**Findings:** A2-F29, A2-F32, A2-F30 · **Size:** S–M · **Live**

- **A2-F29** — the internal admin channel is authenticated by shared secret plus
  a ±5-minute timestamp, and the comment concedes it *"limits"* replay rather
  than preventing it. It carries the reversal and role-change routes today. A
  nonce store makes replay refusable by identity rather than by age; Redis is
  configured and healthy.
- **A2-F32** — the webhook IP allowlist already has a `NETCASH_WEBHOOK_IPS`
  override, so the reported hazard is narrower than filed. What remains is that
  **nothing alarms when a webhook is refused by IP.** The failure mode is
  legitimate webhook → 403 → settlement not processed, in silence. Silence on the
  money path is the failure this repository keeps rediscovering.
- **A2-F30** — **closed with no work.** The concern was that an unset
  `TRUSTED_PROXY` would leave client IPs silently absent. It does not:
  `resolveTrustedProxy` falls back to `vercel` for any unrecognised or absent
  value, and `client-ip-trust.test.ts` pins that. Only an explicit
  `TRUSTED_PROXY=none` produces `undefined`. Recorded rather than deleted,
  because a withdrawn item that leaves no trace gets re-raised by the next
  reader.

---

### L8 · Documentation that describes a system we no longer have
**Findings:** A1-F11, A1-F12 · **Size:** S · **Live**

`DEPLOYMENT.md:128` claims 37 migrations; there are **49**. And the deployment
documentation still describes the old `DEPLOY_ENV`-first resolution order — which
is almost certainly what produced A1-F12, an auditor reporting a fixed bug in
good faith.

**Replacing 37 with 50 reintroduces the defect on a timer.** The number should be
generated or removed. `FACTS` in `packages/utils` is already this repository's
answer to stated claims that drift, with tests refusing hard-coded values.

This item is small and its value is disproportionate: stale docs cost this
project an entire audit finding, and will cost the next reviewer the same.

---

### L9 · Enforce the money-handling discipline
**Findings:** A4-F54 · **Size:** S · **Live**

The auditor wants integer cents end to end. `lib/money.ts` opens with a contract
that considered the question and answered differently — exact `DECIMAL` storage,
exact Postgres-side aggregation, a bounded JS window, and a rule that *"never
write `a + b`, `a - b`, or `x * n` on rand amounts directly."* The specific fear
(`0.1 + 0.2`) is prohibited by name, and `toCents` is used at the gateway
boundary.

The contract stands. **What does not stand is that a comment enforces it.** A
convention held only by a comment is precisely what this audit caught twice —
A1-F07, where a comment claimed a claim the code never made, and A3-F33, where a
guard caught less than its comment implied.

Make it a lint rule or a test, the way `contributions-motion-policy.test.ts`
holds the animation rule. Same repository, same lesson, already learned once.

---

### L10 · Overpayment policy
**Findings:** A4-F56 (needs **D2**) · **Size:** S–M · **Live**

Today the outcome is decided by mechanism: the idempotency key stops a repeat of
the same intent, `recalculateContributionStatus` derives status from the sum, and
a genuine second payment simply over-settles the period. Which of D2's four
options that amounts to has never been written down.

> You should never let this be an accidental consequence of database uniqueness.

**Blocked on D2.**

---

## Phase 2 — The patterns

Eight items. All dormant — none can fire without a gateway or an active mandate.
They are done **before** the gateway work, not after, for one reason:

> The remaining risk is inconsistent guarantees between different paths that
> should provide the same guarantee.

Every item here is a guarantee that exists on one path and not its sibling. Build
the gateway lifecycle on top of paths that still disagree, and the disagreement
gets baked into the settlement pipeline.

### P1 · Make the debit-run claim atomic
**Findings:** A2-F18 · **Size:** S

`check-idempotency` and `claim` are separate Inngest steps, and the claim is
`redis.set` without `NX` (`debit-run.ts:107–123`). A set that follows a read is
not a claim. The fix is a conditional set whose **return value** decides whether
to proceed — the same shape as the goal-payment claim the auditors keep citing as
the good example.

### P2 · Claim the manual payment before the gateway
**Findings:** A1-F07 · **Size:** M

The order is `find` → `submitOnceOffDebit` → `create`. The unique constraint stops
the duplicate row, after the second external debit.

**Two pieces of work, and the second matters as much.** The comment above line 306
says *"check what already exists, claim, then submit."* There is no claim. Correct
the code and correct the comment — a future reader auditing by comment would tick
this off as done.

### P3 · Make the idempotency key mandatory on money-moving requests
**Findings:** A1-F08 · **Size:** S

`data.idempotencyKey ?? randomUUID()` gives a client that omits a key a new
identity every time. Reject rather than silently make the request
non-idempotent. Client mints one UUID per intended payment.

*(The offline path is already safe by construction — its key has no random
component.)*

### P4 · Compare-and-swap on goal-payment settlement
**Findings:** A2-F14 · **Size:** S

`goal-payment.service.ts:285` updates by id, blind. Four files away,
`contribution.service.ts:565` does `updateIfStatus` and checks `claimed.count`,
with a comment explaining why "lost the race" is deliberately distinct from "no
change".

The auditor's sentence is the clearest statement of the problem anyone made:
**deduplication and state CAS solve different problems.** Dedupe stops the same
event twice; CAS stops two different events racing. The goal path has the first
and not the second.

### P5 · Goal-payment state machine
**Findings:** A1-F09 · **Size:** S

`terminal = ['SUCCESS', 'REVERSED']` omits `PENDING`, so `PENDING → REVERSED` is
permitted. A reordered event then makes the legitimate `SUCCESS` unreachable, with
no debit-side unwind, because the payment was never known to have settled.

```
PENDING  -> SUCCESS | FAILED
SUCCESS  -> REVERSED
FAILED   -> SUCCESS   (only if gateway semantics permit)
REVERSED -> (nothing)
```

A reversal arriving before settlement is **stored as a deferred event**, not
applied.

### P6 · An outcome state for "we do not know"
**Findings:** A2-F19, A3-F36 · **Size:** L · **Highest-value item in Phase 2**

An exhausted retry writes `FAILED`, and `FAILED` is exactly what
`transaction-retry-failed` collects. So a network timeout on a debit Netcash may
have accepted enters the same recovery pool as a bank decline, and is submitted
again.

> For money movement, `TIMEOUT != FAILED`.

The goal plan has the mirror image: anything not `FAILED` counts as collected, and
a `PENDING` submission **resets `failedRuns` to zero**, so a plan that submits
pending forever never trips the pause-and-tell-the-member path.

Two schedulers, opposite guesses, same missing state. This is the concrete
instance of the audits' architectural conclusion:

> Three independent systems, no transaction that atomically commits all three.
> Every financial operation needs a state machine capable of representing
> `SUCCESS · FAILED · PENDING · UNKNOWN · RECONCILIATION_REQUIRED` rather than
> collapsing everything into `SUCCESS`/`FAILED`.

**P6 blocks G4.** A load-report consumer's job is to resolve `UNKNOWN` into a real
outcome. Without the state there is nothing for it to resolve.

*(One thing already right and worth keeping: the retry path's reference is
`XXM-RETRY-${tx.id.slice(-8)}` — per-transaction. The retry path has the unique
provider-facing reference the main debit run lacks.)*

### P7 · Mandate synchronisation states and a durable compensation queue
**Findings:** A1-F10, A2-F24, A2-F25 · **Size:** L

Three findings, one mechanism, and they resolve **differently** — which is why
they are one item and not one fix:

| | Amount change | Cancellation |
|---|---|---|
| Ordering | Block collection while unsynced (`SYNC_PENDING`) | **Keep local-first** — it fails safe |
| Defect | Wrong amount collected | Member told more than is established |
| Fix | Do not collect while pending | Distinct state + honest wording |

The cancellation nuance is the one to get right. The code's defence of local-first
is sound — *"a member who asks to stop being collected from is never collected
from again by us"* — but it contains its own limit in two words. **By us.** The
mandate lives at the bank. Local-first guarantees we never *initiate* another
collection; it cannot guarantee the mandate is incapable of being collected on. So
the member is told *"your cancellation request has been recorded; gateway
cancellation is pending"*, not *"we will not collect from you again."*

Plus the durable half: `.catch(log)` on an external financial side effect is
correct — a secondary failure must not unwind a primary success — but there must
be **somewhere the swallowed failure goes to be retried.** A2-F24's orphaned
gateway mandate, A1-F10's desync and A2-F25's failed cancellation are three
instances of the same missing queue. Also: nightly `mandate-status-sync` reads
only `PENDING`, `ACTIVE` and `SUSPENDED`, so a failed cancellation is never
re-examined by anything.

### P8 · Goal-plan hygiene
**Findings:** A3-F43, A3-F44 · **Size:** S

- **A3-F43** — `resumePlan` never checks for another active plan. The partial
  unique index *does* refuse it, so two `ACTIVE` plans cannot result; the member
  gets a raw constraint failure where every sibling path returns a clear message.
  Add the check and the message.
- **A3-F44** — the version claim checks its result; the three follow-up
  `updateByVersion(plan.version + 1, …)` calls discard theirs. A concurrent resume
  or cancel silently drops the `failedRuns` bookkeeping that is supposed to pause
  a failing plan. One line per site, plus a test.

**Worth recording about A3-F43:** it runs the opposite way to every other finding
in this series. Everywhere else the application holds an invariant the database
does not. Here the database held one the application forgot, and the partial index
absorbed a bug nobody had thought about — evidence for the architecture these
audits keep recommending.

---

## Phase 3 — The collections lifecycle, and a port that survives a second provider

Ten items. **None of this is scheduled**, because there is no gateway and getting
one is a business decision rather than a start date. It is designed now so that
the decision, when it comes, is a start date rather than a design exercise.

### The decision that reframed this phase

Recorded 2026-09-05, and it is the owner's:

> Do not build the gateway specifically for Netcash. Build it so that when a
> provider declines us, we can map the scope to whichever one accepts us without
> changing much — only aligning with the one that says yes. Start by reapplying to
> Netcash, after the three members have accounts and their past payments are
> recorded.

The goal is right. The way to reach it is not the obvious one, and this section
exists because the obvious one has already been tried in this codebase.

### "Make it provider-agnostic" is not the fix it sounds like

`IPaymentGateway` in `apps/web/integrations/payment/types.ts` contains the word
Netcash exactly zero times. It is already provider-agnostic in shape. **And every
Netcash finding across the four audits leaked straight through it.**

| The port promises | What DebiCheck actually does |
|---|---|
| `submitScheduledDebit() -> { transactionRef, status }` | A **batch file** is uploaded, a **file token** comes back, the outcome arrives later in a **load report**. There is nowhere to put the token, so it went into `transactionRef` — **A1-F02** |
| *(no method to fetch an outcome)* | `fetchBatchReport()` exists in `lib/netcash.ts` and is called by nothing. **The port has no seat for it** — **A1-F04** |
| `delayMandate()` | No such operation exists. The real adapter throws unconditionally — **A3-F34** |
| `updateMandate({ amount, debitDay })` | Only the amount is amendable; a day change is a new authentication — **A3-F33** |
| `verifyWebhookSignature` + `isAllowedWebhookIp` | Assumes the provider posts with an HMAC header from a fixed IP range. Netcash does neither — **A1-F01** |
| `getNextDebitDate(debitDay)` | Calendar arithmetic, on a *gateway* port, emitting `2026-02-31` — **A3-F35** |

The port was generalised from an **imagined** provider rather than from the
domain. It is portable in name and wrong in substance, and a second adapter behind
it would not produce portability — it would produce two adapters lying in
different ways.

**So the work is not to make the port generic. It already is. The work is to make
it model the lifecycle.**

### What is genuinely stable, and why

These hold for every South African collections provider, and they hold because
**DebiCheck regulates them** rather than because a vendor chose them:

```
authorisation  ->  bank-side authentication  ->  collection submitted
               ->  outcome arrives, later, by some route
               ->  attributed to exactly one member
```

Every part of that is provider-independent. What varies between providers is
*transport* and *timing*, not the shape of the lifecycle.

P6 already built the first piece of this without needing a provider: `UNKNOWN`
exists because the gap between "submitted" and "outcome" is real for any
asynchronous collector, and a timeout inside that gap is an absence of information
rather than a failure.

### Capabilities are declared, not assumed

The single highest-value change in this phase, and the one that makes a provider
swap a **data** difference instead of a code one.

`delayMandate()` exists on the port and throws, because DebiCheck has no such
operation. `updateMandate` accepts a `debitDay` no provider can honour without
re-authentication. Both are the port promising things on a provider's behalf.

Instead, an adapter states what it can do:

```ts
supports: {
  amendAmount: true,
  amendDebitDay: false,     // a new authentication, not an amendment
  delayCollection: false,   // expressed by when the batch is submitted
  outcomes: 'poll',         // 'poll' | 'webhook' | 'both'
  submission: 'batch',      // 'batch' | 'single'
}
```

…and the **service layer** decides what to offer the member. A provider that can
amend a debit day gets that button; one that cannot never shows it, rather than
showing it and failing. This closes A3-F33 and A3-F34 at the root instead of
patching each call site.

### The adapter contract

What a new provider must supply. Written down so that onboarding provider #2 is a
checklist rather than a redesign — and so that the checklist exists *before*
anybody is under time pressure to switch.

| # | The provider must give us | Why the lifecycle needs it |
|---|---|---|
| 1 | A way to register an authorisation and learn when the debtor authenticated it | Nothing may be collected against an unauthenticated mandate |
| 2 | A **per-collection reference we choose**, echoed back in outcomes | Without it an outcome cannot be attributed to a member — **A1-F03** |
| 3 | A durable handle for a submission | So a submission can be re-asked about after a crash — **A2-F22** |
| 4 | At least one way to learn outcomes: poll, callback, or both | The whole of **A1-F04** |
| 5 | Per-row outcomes, not just a batch verdict | `SUCCESSFUL WITH ERRORS` is simultaneously a batch success and a member failure — **A3-F38** |
| 6 | A stated position on reversals and how they are notified | The pool debit depends on it |
| 7 | A capability declaration (the table above) | So the UI offers only what is real |
| 8 | A sandbox | See below — this is not optional |

### What will not be built, and why

**No speculative second adapter.** The audits have just demonstrated, at length,
what generalising from imagination costs. Writing two imagined adapters doubles
it. A good port comes from one provider's **sandbox** plus a written contract for
the next — never from two sets of documentation.

**Item 8 above is the reason.** The current port was built from Netcash's
documentation, which is public and complete, and it still got the timing model
wrong. Documentation describes the happy path; a sandbox tells you what a timeout
looks like.

**But take the cheap insurance now**, because it is the part that is expensive to
retrofit: carry the provider's name and its own identifiers in their own columns
from the first migration. Adding a column later means migrating financial records
— and G2 and G3 below are already that change, so the cost is zero if it is done
in the same pass.

### How much of this is Netcash-shaped

Less than it looks. Most of Phase 3 is required for **any** asynchronous
collector:

| Item | Provider-independent? |
|---|---|
| G1 · unique per-member reference | **Yes** — contract item 2 |
| G2 · separate the identities | **Yes** — contract item 3 |
| G3 · model the submission | **Yes** — contract items 3 and 5 |
| G4 · the outcome consumer | **Yes** — contract item 4, with a per-provider reader |
| G5 · one submission per period | **Yes** where the provider batches; the capability says which |
| G9 · capability declaration | **Yes** — this is the mechanism |
| G10 · the adapter contract | **Yes** |
| G6 · amendment honesty | Becomes a capability question |
| G7 · a delay is local scheduling | Becomes a capability question |
| G8 · calendar-correct dates | **Yes** — and it never belonged on the port at all |

So the owner's requirement adds roughly a fifth to this phase, and **nothing at
all if Netcash accepts** — because the lifecycle work is required either way.

### The split that de-risks this phase

The audits treat "verify the postback contract" as a blocker for everything. It is
not, and the distinction is what keeps certification off the critical path:

- **The load-report path is documented.** `BatchFileUpload` returns a file token;
  `RequestFileUploadReport` returns the outcome; polling remains available even
  when a postback URL is configured.
- **The postback contract is not established.** Netcash's published docs do not
  establish `x-netcash-signature` as the DebiCheck contract, and our endpoint
  would reject a genuine postback at the signature check with 401.

**Recommendation: make polling the primary settlement mechanism and the callback an
optional accelerant.** That inverts the current design, and it generalises: every
provider can be asked "what happened?", while only some can reliably tell us
unprompted. A pipeline that rests on asking is a pipeline that ports.

### On reapplying to Netcash

The sequencing is sound. Real member accounts and a recorded payment history make
a materially better case than an empty system did.

**One caution, recorded so the application is framed well.** Netcash declined
because the processing bank required an existing **debit-order base**. Recorded
offline payments prove *collection history* — genuinely useful evidence of real
members paying real money on a real cadence — but they are not a debit-order book,
which is what that objection was about. The same "no" can return for the same
structural reason.

So reapplication is one of three tracks, and the other two have long lead times:

| Track | What it is | Why it might succeed where a direct application did not |
|---|---|---|
| **Reapply direct** | Netcash again, with members and history behind it | Answers the commercial doubt. May not answer the structural one |
| **Collect under a sponsor** | XXM as a sub-merchant of an aggregator with its own DebiCheck registration | **Bypasses the objection entirely** rather than arguing with it |
| **NASASA** | The stokvel self-regulatory body | Its entire purpose is stokvel access to formal financial services |

The middle option is worth noticing for a second reason: *"we are a sub-merchant
of an aggregator"* is a different integration shape again — a settlement account
that is not ours, references namespaced by the sponsor. A lifecycle-shaped port
absorbs that. The current one would not.

### G9 · Capabilities are declared by the adapter
**Findings:** A3-F33, A3-F34 (mechanism) · **Size:** M · **Do this first**

The mechanism the rest of the phase leans on, and the reason a provider swap
becomes a data difference rather than a code one.

Today the port promises operations on a provider's behalf: `delayMandate()` exists
and throws, `updateMandate` accepts a `debitDay` no provider can honour. Both are
the same mistake — a capability invented at the interface and discovered at
runtime, by a member.

An adapter now states what it can do, and the **service layer** decides what to
offer:

```ts
supports: {
  amendAmount: true,
  amendDebitDay: false,     // a new authentication, not an amendment
  delayCollection: false,   // expressed by when the batch is submitted
  outcomes: 'poll',         // 'poll' | 'webhook' | 'both'
  submission: 'batch',      // 'batch' | 'single'
}
```

**Acceptance.** A member is never shown an action the configured provider cannot
perform. A capability that is false makes the corresponding service call a refusal
with a clear message, not a thrown `ExternalServiceError` from deep in an adapter.
The `disabled` adapter declares everything false, which is what it has always
meant and never said.

**Ordering.** Before G6 and G7, which stop being separate fixes once this exists —
they become two entries in one table.

### G10 · The adapter contract, written down
**Size:** S · **Do this alongside G9**

The eight things a provider must supply, from the section above, as a document a
person can hold against a vendor's API while deciding whether to sign with them.

This is not documentation for its own sake. The contract is the thing that turns
"can we move to this provider?" from a research project into an afternoon, and it
has to exist **before** anybody is under time pressure to switch — which is
precisely when it will not get written.

**Acceptance.** A reader who has never seen this codebase can take the contract to
a provider's API docs and answer yes or no to each of the eight items. Where the
answer is no, the contract says what the lifecycle loses.

**Include the sandbox requirement.** It is item 8 and it is not negotiable: the
current port was built from documentation that is public and complete, and it
still got the timing model wrong. Documentation describes the happy path; a
sandbox is the only thing that shows you a timeout.

### G1 · A unique provider-facing reference
**Findings:** A1-F03, A2-F23, A3-F39 · **Size:** S · **Blocks G4**

`debit-run.ts:202` sends `XXM-${year}-${month}` — identical for every member — and
that becomes the batch row's `accountReference`. Even a *successful* batch comes
back keyed on a reference shared by everyone in it. There is no way to attribute
an outcome to a member.

The per-member identifier already exists (`mandate.service.ts:135`,
`XXM-${userId.slice(-8)}`), and the retry path already does this correctly. The
debit run is the one path that dropped it.

### G2 · Separate the identities `gatewayRef` is carrying
**Findings:** A1-F02, A2-F20, A3-F37 · **Size:** M · **Blocks G3, G4**

One column carries several meanings. Split them:

```
local idempotency key · netcash batch token · netcash file token · provider transaction reference
```

*(Note the file token is already recorded honestly as `PENDING`, not `SUCCESS` —
that half was fixed before these audits. The defect is that nothing exchanges the
handle for a per-row outcome.)*

### G3 · Model the batch as a first-class object
**Findings:** A2-F22, A3-F40 · **Size:** M · **Blocks G4**

```
BatchSubmission { period, actionDate, netcashFileToken, submittedAt,
                  reportStatus, reportReceivedAt, totalCount, totalAmount }
  |- Transaction …
```

`SUCCESSFUL WITH ERRORS` is the state that makes the case: simultaneously a batch
success and a member failure, with nowhere to put it today.

**G5's decision must be taken before G3 is built** — a per-member and a per-file
submission model produce different tables, and migrating financial records later
is expensive.

### G4 · The load-report consumer
**Findings:** A1-F04, A3-F38 · **Size:** L · **Depends on P6, G1, G2, G3**

The largest single item, and the one the audits escalated three times.
`fetchBatchReport` exists, is tested including `FILE NOT READY`, and **is called
by nothing**. The system can ask Netcash for the outcome and never does.

**One detail that would break a naive implementation:** a fully successful batch
may return **no detail rows at all**. A consumer written against the failure case
alone would settle nothing on a perfect run — absence of a failure row *is* the
success signal.

### G5 · One batch per period
**Findings:** A2-F21, A3-F41 · **Size:** M · **Decide before G3**

Fifty members currently means fifty uploads, fifty file tokens, fifty report
lifecycles. `buildDebiCheckBatchFile` already takes a `rows` array; `submitDebit`
passes one element. This is a call-site and lifecycle change, not a builder
rewrite. Irrelevant at four members; considerable at fifty.

### G6 · Debit-day amendment must not claim what did not happen
**Findings:** A3-F33 · **Size:** S

A day-only change throws and raises a desync alert — correct. An **amount + day**
change *succeeds*, sends only the amount, and the day diverges in silence with the
member told it was applied. The guard at `netcash.ts:225` was written to prevent
exactly this claim and catches only the case where the day travels alone.

A debit-day change is a **new authentication**, not an amendment. Say so.

**With G9 this stops being its own fix.** `amendDebitDay: false` is the whole
statement, and the service refuses the change with a message rather than sending
a request that silently drops half of it.

### G7 · A delay is local scheduling, not a mandate operation
**Findings:** A3-F34 · **Size:** S

`requestDelay` calls `delayMandate` before writing anything, and the real adapter
throws unconditionally — so the local delay mechanism becomes unreachable the
moment a real gateway exists. That mechanism was built to fix a real incident
where a Redis-backed delay silently vanished and members were debited on a day
they had said they could not afford. The architecture in its comments is right;
the call order defeats it. Stop asking the gateway's permission for a local
scheduling decision.

**With G9 this is `delayCollection: false`** — and the local mechanism runs
regardless, because it never needed the gateway's permission. A provider that
*can* move a collection sets it true and the same code path uses it.

### G8 · Calendar-correct debit dates
**Findings:** A3-F35 (needs **D3**) · **Size:** S

`getNextDebitDate` assembles a string with no calendar validation, so day 31 in
January returns `2026-02-31`. It never constructs a `Date`, so nothing throws.
The goal-plan scheduler clamps correctly; this helper does not.

*(`UpdateMandateSchema` caps `debitDay` at 28, which narrows the reach without
closing it — creation and internal callers may not share that bound.)*

**And it moves off the port.** `getNextDebitDate` is calendar arithmetic; it has
nothing to do with any provider, and its presence on `IPaymentGateway` is how a
domain rule ended up with three implementations, one of which emits impossible
dates. It belongs beside the goal-plan scheduler that already clamps correctly.

---

## Phase 4 — Certification

### V1 · Verify the real postback contract
**Findings:** A1-F01, A2-F31 · **Blocked on Netcash credentials**

The cryptography is endorsed — raw-body HMAC-SHA256, `timingSafeEqual`, length
and missing-secret rejection. But **a correct implementation of a contract the
provider does not offer authenticates nothing.** Confirm in sandbox what Netcash
actually posts, then either adapt the endpoint or retire it in favour of polling
(G3's recommendation).

### V2 · Prove the chain end to end
**Blocked on V1 and Phase 3**

```
mandate created -> authenticated -> collection submitted -> load report received
-> individual outcome identified -> transaction updated -> contribution recalculated
-> ledger updated -> member notified -> statement correct -> reversal handled
-> reconciliation agrees
```

Against: success, decline, timeout, duplicate callback, delayed callback,
**reordered** callback, partial batch failure, provider outage, database failure,
retry.

> The Netcash approval/test phase should become our integration certification
> phase, not merely "does the API return 200?"

Adopted.

---

## Dependencies

```
D1 -> L3          D2 -> L10          D3 -> G8

Phase 3, in order:

  G9  (capabilities)  ─┬─> G6, G7        the two stop being separate fixes
  G10 (contract)      ─┘

  G2 -> G3 -> G4        G5 (decide) -> G3
  G1 ─────────> G4      P6 ──────────> G4   (done)

  G8 is independent, and moves off the port entirely

V1 -> V2 ;  Phase 3 -> V2
```

Everything in Phase 1 except L3 and L10 was independent and could run in any
order; it is done.

**Phase 3 starts at G9 and G10**, not at G1. The capability declaration is the
mechanism the rest leans on, and the adapter contract has to be written while
nobody is under pressure to switch providers — which is the only time it will
actually get written.

**G5 is a decision before it is an item.** A per-member and a per-file submission
model produce different tables, and G3 is where that table gets created. Deciding
it afterwards means migrating financial records.

---

## Complete finding mapping

Every one of the 58 findings, and where it went.

| Finding | Disposition |
|---|---|
| A1-F01, A2-F31 | V1 |
| A1-F02, A2-F20, A3-F37 | G2 |
| A1-F03, A2-F23, A3-F39 | G1 |
| A1-F04, A3-F38 | G4 |
| A1-F05, A2-F26, A4-F50 | L1 |
| A1-F06, A2-F27 | L2 |
| A1-F07 | P2 |
| A1-F08 | P3 |
| A1-F09 | P5 |
| A1-F10, A2-F24, A2-F25 | P7 |
| A1-F11, A1-F12 | L8 |
| A1-F13 | L6 |
| A2-F14 | P4 |
| A2-F15, A3-F42 | L4 |
| A2-F16, A2-F17, A4-F55 | L3 |
| A2-F18 | P1 |
| A2-F19, A3-F36 | P6 |
| A2-F21, A3-F41 | G5 |
| A2-F22, A3-F40 | G3 |
| A2-F29, A2-F30, A2-F32 | L7 |
| A3-F33 | G6 |
| A3-F34 | G7 |
| A3-F35 | G8 |
| A3-F43, A3-F44 | P8 |
| A4-F45, A4-F46, A4-F49 | L5 |
| A4-F54 | L9 |
| A4-F56 | L10 |

**No work — recorded so nobody re-opens them:**

| Finding | Why |
|---|---|
| A1-F12 | **Already fixed.** `VERCEL_ENV` outranks `DEPLOY_ENV`, pinned by test. Only its stale documentation is work (L8) |
| A2-F28 | Endorsement — the member-cap business rule. L2 must preserve it |
| A2-F30 | Answered — proxy trust is declared, not inferred. One config check in L7 |
| A2-F33, A4-endorsement | Endorsement — webhook dedupe claim/release. Do not "simplify" the release path |
| A4-F47 | Holds — the reversal route re-resolves the admin from the database |
| A4-F48 | Holds — suspension stops collection, chasing and existing sessions |
| A4-F51 | Holds — identity comes from the session on every money route |
| A4-F52, A4-F53 | Holds — amounts bounded server-side from shared constants |
| A4-F57 | Holds — reversal authorisation is strict and state-checked |

---

## Rules that apply to every item

Established in this repository, and not up for renegotiation per item:

1. **One work item, one branch, one PR, targeting `main`.** Squash-merge with
   branch deletion once the code gates are green.
2. **Every test must be verified against the broken value first.** A pin that
   cannot catch the regression it exists for is worthless. This was learned here:
   an assertion for `animate-fade-in` would have passed on the broken
   `animate-fade-in-up`, because one is a prefix of the other.
3. **Fix the pattern, not the instance.** Every one of the 17 rediscoveries exists
   because an earlier fix was applied where the defect was found rather than
   everywhere it lived. `ENGINEERING_WORKFLOW.md` §4.6 records the same defect
   found in four separate places for exactly this reason.
4. **A comment is not evidence.** A1-F07 and A3-F33 are both cases of a comment
   asserting a safety property the code did not implement. If an item's guarantee
   matters, a test holds it.
5. **Vercel preview builds are rate-limited to 24 hours** on the current plan.
   Batch merges; the code gates (`Type Check, Lint & Test`, `Constitutional
   enforcement`) are what must be green.
6. **No AI or assistant references** in any branch name, commit message, PR title
   or body.

---

## Status

**Phases 1 and 2 are complete.** Eighteen work items, thirteen pull requests
(#490–#502), all merged with CI green.

| Phase | Items | Status |
|---|---|---|
| Decisions | 3 | **D1 and D2 answered** (by the implementer — see above, and review them). D3 open, blocks G8 only |
| 1 — Live today | 10 | **Done** — L1–L10 |
| 2 — Patterns | 8 | **Done** — P1–P8 |
| 3 — Collections lifecycle | 10 | Planned, **not scheduled**: needs a gateway, and getting one is a business decision. Redesigned 2026-09-05 to be provider-agnostic — see the phase preamble |
| 4 — Certification | 2 | Planned, **not scheduled**: needs credentials |

### What Phase 1 and 2 came to

| Item | What it closed |
|---|---|
| L1 | Two admins removing each other could leave zero. Plus one the audits missed: the member app's `setMemberStatus` had **no last-admin guard at all** |
| L2 | Counting is not reserving — 51 places could be held out of fifty |
| L3 | The pool could go negative with nothing deciding whether that was legal (**D1**) |
| L4 | One unwrapped call could skip the ledger credit after a settlement |
| L5 | A refusal said whether the object existed. Both patterns lived in one file |
| L6 | Contact details reached Sentry. The logger now redacts, and the error-spread vector is covered |
| L7 | The trusted channel was replayable; a refused webhook was silent. **A2-F30 withdrawn** — our own note was wrong |
| L8 | Docs described the deployment that caused the phantom payment |
| L9 | The money contract was enforced by a comment. Writing the test **found four real bugs** |
| L10 | An overpayment was absorbed silently (**D2**) |
| P1 | The debit-run claim was a write that followed a read |
| P2 | The manual-payment "claim" did not exist; the comment said it did |
| P3 | The server invented the idempotency token when a caller omitted it |
| P4 | The goal webhook updated blind — dedupe and CAS solve different problems |
| P5 | `PENDING → REVERSED` was reachable, and terminal |
| P6 | Nothing could say "we do not know". Two schedulers guessed, oppositely |
| P7 | A mandate we and the bank disagree about was still being collected on |
| P8 | The database held an invariant the application had forgotten |

### Where to pick up

**Phase 3 needs a decision before it needs engineering.** Getting a gateway is
not a scheduling question — the DebiCheck application was declined, and which
route to take is the owner's call. Three tracks are set out in the phase
preamble; the middle one, collecting under a sponsor's registration, is the only
one that *bypasses* the objection rather than arguing with it.

**The phase was redesigned on 2026-09-05** at the owner's direction: build for any
provider, not for Netcash specifically. The preamble explains why "make the port
generic" is not the fix it sounds like — it already is generic, and every Netcash
finding leaked through it anyway — and what to build instead. Two items were added
(**G9** capability declaration, **G10** the adapter contract) and they come first.

Two recommendations carried forward:

- **Make outcome polling the primary settlement mechanism and the callback an
  optional accelerant.** Every provider can be asked *"what happened?"*; only some
  can reliably tell us unprompted. A pipeline that rests on asking is one that
  ports.
- **Take the cheap insurance in the same pass.** Provider name and
  provider-specific identifiers in their own columns from the first migration.
  G2 and G3 are already that change, so doing it provider-aware costs nothing —
  and retrofitting it later means migrating financial records.

**D3** (is "last day of the month" a first-class debit day?) blocks G8 and only
G8. It can wait for the gateway decision.
