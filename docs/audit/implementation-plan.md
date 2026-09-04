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

| ID | Question | Blocks | From |
|---|---|---|---|
| **D1** | **May the pool balance go legitimately negative?** If a reversal lands after money has been distributed, is that a valid transient state, or is a negative pool always a defect that must alarm? | L3 | A2-F16 |
| **D2** | **What does a second successful payment against an already-settled period mean?** Rejected, credited to a future period, refunded, or standing as an overpayment? | L10 | A4-F56 |
| **D3** | **Is "last day of the month" a first-class debit day?** Or should 29–31 be refused when a mandate is created? | G8 | A3-F35 |

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
- **A2-F30** — no code change. Confirm `TRUSTED_PROXY` is set in production. The
  implementation is correct and fails to *no IP* rather than a forged one — but
  if unset, rate-limit identity and audit IPs are silently absent everywhere.

---

### L8 · Documentation that describes a system we no longer have
**Findings:** A1-F11, A1-F12 · **Size:** S · **Live**

`DEPLOYMENT.md:128` claims 37 migrations; there are **50**. And the deployment
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

## Phase 3 — The gateway lifecycle

Eight items. **None of this is scheduled yet**, because there is no gateway and
enabling one is a future decision. It is planned now so that the decision, when it
comes, is a start date rather than a design exercise.

### The split that de-risks this phase

The audits treat "verify the postback contract" as a blocker for everything. It is
not — and the distinction matters:

- **The load-report path is documented.** `BatchFileUpload` returns a file token;
  `RequestFileUploadReport` returns the outcome; polling remains available even
  when a postback URL is configured. This can be built from the vendor's own
  documentation, which is public and complete.
- **The postback contract is not established.** Netcash's published docs do not
  establish `x-netcash-signature` as the DebiCheck contract, and our endpoint
  would reject a genuine postback at the signature check with 401.

**Recommendation: make polling the primary settlement mechanism and the webhook an
optional accelerant.** That inverts the current design, removes V1 from the
critical path, and means the settlement pipeline rests on the half of the contract
that is documented rather than the half that is guessed.

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

### G7 · A delay is local scheduling, not a mandate operation
**Findings:** A3-F34 · **Size:** S

`requestDelay` calls `delayMandate` before writing anything, and the real adapter
throws unconditionally — so the local delay mechanism becomes unreachable the
moment a real gateway exists. That mechanism was built to fix a real incident
where a Redis-backed delay silently vanished and members were debited on a day
they had said they could not afford. The architecture in its comments is right;
the call order defeats it. Stop asking the gateway's permission for a local
scheduling decision.

### G8 · Calendar-correct debit dates
**Findings:** A3-F35 (needs **D3**) · **Size:** S

`getNextDebitDate` assembles a string with no calendar validation, so day 31 in
January returns `2026-02-31`. It never constructs a `Date`, so nothing throws.
The goal-plan scheduler clamps correctly; this helper does not.

*(`UpdateMandateSchema` caps `debitDay` at 28, which narrows the reach without
closing it — creation and internal callers may not share that bound.)*

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

P6 ─┐
G1 ─┼─> G4        G2 -> G3 -> G4     G5 (decide) -> G3
G3 ─┘

V1 -> V2 ;  Phase 3 -> V2
```

Everything in Phase 1 except L3 and L10 is independent and can run in any order.

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

| Phase | Items | Blocked | Ready |
|---|---|---|---|
| Decisions | 3 | — | awaiting leadership |
| 1 — Live today | 10 | L3 (D1), L10 (D2) | **8 ready now** |
| 2 — Patterns | 8 | — | ready after Phase 1 |
| 3 — Gateway | 8 | no gateway exists | planned, not scheduled |
| 4 — Certification | 2 | no credentials | planned, not scheduled |

**Start with L1.** It is the only finding in 58 whose failure locks leadership out
of their own system.
