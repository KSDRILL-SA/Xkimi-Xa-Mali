# Audit 3 — Deeper money flow and API integrity

**Received:** 2026-09-04 · **Findings:** 33–44 (12) · **Status:** documented and verified; not yet scheduled

## What this audit is

Round 3 goes after the mandate amendment path, the delay feature, date handling,
and the goal-plan scheduler — then restates the Netcash integration findings with
the vendor documentation cited line by line.

It opens with a stance worth recording, because it is the correct one:

> I'm continuing as the master audit, **not treating the existing comments/tests
> as proof that the implementation is correct.**

That scepticism is vindicated inside this very round. A1-F07 was upgraded to
"worse than reported" precisely because a comment claimed a safety property the
code did not implement, and A3-F43 below inverts an auditor claim for the
opposite reason — the database was doing work the schema comment did not
advertise.

### A numbering collision

This round restarts at 33, but 33 was already used in Round 2 for the webhook
dedupe endorsement. To keep references unambiguous everything is prefixed by
round: **A2-F33** is webhook dedupe; **A3-F33** is the debit-day amendment defect
below.

### Round 3 contains nothing that is live today

Every finding here sits behind either a Netcash gateway or an active DebiCheck
mandate, and a live deployment has neither. **All twelve are dormant.** That is a
scheduling fact, not a dismissal: seven of them are new, and several are the kind
that only surface when real money is moving.

---

## Verification summary

| ID | Finding | Auditor severity | Verdict | New? |
|---|---|---|---|---|
| A3-F33 | Debit-day amendment corrupts the local mandate | P1 | **CONFIRMED, WORSE** | New |
| A3-F34 | `requestDelay()` is impossible on the real adapter | P1 | **CONFIRMED** | New |
| A3-F35 | `getNextDebitDate(31)` yields an impossible date | P1 | **CONFIRMED** | New |
| A3-F36 | Goal plan counts `PENDING` as collected | P1 | **CONFIRMED, NARROWER** | New |
| A3-F37 | File token treated as transaction reference | P0/P1 | **CONFIRMED — duplicate of A1-F02** | No |
| A3-F38 | No production load-report consumer | P0 | **CONFIRMED — duplicate of A1-F04** | No |
| A3-F39 | Account reference not transaction-specific | P0/P1 | **CONFIRMED — duplicate of A1-F03** | No |
| A3-F40 | Batch not modelled as a first-class object | P1 | **CONFIRMED — duplicate of A2-F22** | No |
| A3-F41 | One-row batches complicate failure handling | P1 | **CONFIRMED — duplicate of A2-F21** | No |
| A3-F42 | `suggestPlan()` reads stale `currentAmount` | P2 | **CONFIRMED** | New |
| A3-F43 | Goal-plan unique index does not cover `PAUSED` | P1 | **CONFIRMED, INVERTED** | New |
| A3-F44 | Goal-plan version claim assumes sole ownership | P2 | **CONFIRMED, SHARPENED** | New |

Seven new findings. Five rediscoveries, all already scheduled under audit 1 or 2.

---

## A3-F33 — Debit-day amendment corrupts the local mandate

**Auditor severity:** P1 · **Verdict: CONFIRMED, WORSE** · **Dormant**

### The finding

The service accepts an amount change, a debit-day change, or both. The Netcash
adapter supports amount amendment only — DebiCheck's amendment API documents
collection amount and maximum collection amount as the amendable fields. So a
debit-day change can leave local and bank disagreeing about the day.

### Verification

Both halves confirmed, and the two cases behave very differently.

`apps/web/lib/netcash.ts:225` refuses an amendment with no amount, and says why:

```ts
// Only the amount can be amended without re-authenticating the debtor. A
// changed collection day is a new mandate as far as the bank is concerned, and
// reporting success here would claim something that did not happen.
if (changes.amount === undefined) {
  throw new ExternalServiceError('Netcash', 'Only the collection amount can be amended…')
}
```

`apps/web/services/mandate.service.ts:209` writes both fields locally first, then
calls the gateway with both:

```ts
const updated = await mandateRepo.update(mandateId, {
  ...(data.debitDay !== undefined && { debitDay: data.debitDay }),
  ...(data.amount !== undefined && { amount: data.amount }),
})
```

**Worse than reported, because the two paths fail differently:**

| Change | Gateway | Result |
|---|---|---|
| Day only | Throws | Caught, `raiseGatewayDesyncAlert` fires. Loud and recoverable |
| **Amount + day** | **Succeeds** | Only the amount is sent. **The day diverges silently** |

The second row is the defect. `debiCheckAmend` receives
`collectionAmountCents` and `maximumCollectionAmountCents` and nothing else — the
day is dropped on the floor — and because the call returns `ok`, no alert is
raised, nothing is logged, and the member is told their change was applied.

The guard at `netcash.ts:225` was written to prevent exactly this claim
("reporting success here would claim something that did not happen") and catches
only the case where the day travels *alone*. The combined change walks straight
past it.

The auditor's remedy is right: the service must distinguish an amount-only
amendment from a debit-day change, and a debit-day change is a **new
authentication**, not an amendment. It must not silently pretend otherwise.

---

## A3-F34 — `requestDelay()` is impossible on the real adapter

**Auditor severity:** P1 · **Verdict: CONFIRMED** · **Dormant**

### The finding

The production adapter deliberately throws from `delayMandate()`, because
DebiCheck has no "move this month's collection" operation. But `requestDelay()`
calls it before writing anything — so `delayedUntil` is never written, the
Inngest event is never scheduled, and the whole local delay mechanism is
unreachable in production.

### Verification

Confirmed exactly, and the two pieces are eleven lines apart in intent and a
whole file apart in code.

`apps/web/lib/netcash.ts:261`:

```ts
export async function delayMandate(_mandateId: string, _newDate: string) {
  // DebiCheck has no "move this month's collection" operation. A delay is
  // expressed by when the collection batch is submitted, not by amending the
  // mandate — so this says so rather than calling something that would change
  // the mandate itself and report a success the bank never gave.
  throw new ExternalServiceError('Netcash', 'DebiCheck mandates cannot be delayed at the gateway…')
}
```

`apps/web/services/mandate.service.ts:343`:

```ts
if (mandate.netcashMandateId) {
  await paymentGateway.delayMandate(mandate.netcashMandateId, data.newDate)
}

// … then, unreachable:
await mandateRepo.update(mandateId, { delayedUntil: newDate })
```

Uncaught. Any mandate with a `netcashMandateId` — which is every real one —
throws before line 358.

**Why this one deserves attention beyond its severity.** The local mechanism it
blocks was built to fix a real incident, and the comment at line 349 records it:
the delay used to live in a Redis key, the cache client is a no-op shim when
Upstash is unconfigured, so *"the member was debited on the original date despite
having asked not to be."* The fix was correct and thorough — `delayedUntil` on
the model, read by the debit run, paired with a scheduled event described as
*"two halves of one promise"*.

And then the first line of the function makes all of it unreachable the moment a
real gateway exists. The architecture in the comments is right; the call order
defeats it. The fix is to stop asking the gateway's permission for a local
scheduling decision.

---

## A3-F35 — `getNextDebitDate(31)` yields an impossible date

**Auditor severity:** P1 · **Verdict: CONFIRMED** · **Dormant**

### The finding

Debit days 1–31 are permitted, and the helper can emit `2026-02-31`. The goal-plan
scheduler already clamps correctly (31 to 28/29 in February, 31 to 30 in April);
the mandate helper does not.

### Verification

`apps/web/lib/netcash.ts:457`:

```ts
export function getNextDebitDate(debitDay: number): string {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth()
  if (now.getDate() >= debitDay) {
    month += 1
    if (month > 11) { month = 0; year += 1 }
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(debitDay).padStart(2, '0')}`
}
```

String assembly with no calendar validation. `getNextDebitDate(31)` called on 31
January returns `2026-02-31`. It never constructs a `Date`, so nothing throws —
the impossible date is handed to the gateway as an effective date, and to
`updateMandate` as its `effectiveDate` argument.

The auditor's framing is the useful part: **"last day of month" is a real
business intent and should be represented as such**, rather than approximated by
31 and then clamped by whoever remembers to. Netcash's own model has explicit
last-day semantics, so the concept survives the whole way to the provider.

The inconsistency is the tell: two date helpers in one codebase, one clamping and
one not. Same class as every other finding in this series.

---

## A3-F36 — The goal plan counts `PENDING` as collected

**Auditor severity:** P1 · **Verdict: CONFIRMED, NARROWER** · **Dormant**

### The finding

```
payToGoal(...) -> PENDING -> else -> collected++
```

`PENDING` is not success. The goal-payment service knows this; the goal *plan*
does not, so the two disagree about what a pending gateway response means.

### Verification

`apps/web/services/goal-plan.service.ts:306–316`, confirmed:

```ts
if (res.status === 'FAILED') {
  failed += 1
  await goalPlanRepo.updateByVersion(plan.id, plan.version + 1, { failedRuns: plan.failedRuns + 1 })
} else {
  collected += 1
  if (plan.failedRuns > 0) {
    await goalPlanRepo.updateByVersion(plan.id, plan.version + 1, { failedRuns: 0 })
  }
}
```

Anything not `FAILED` is counted as collected, and — more consequentially — a
`PENDING` submission **resets `failedRuns` to zero**. A plan that submits
pending-and-never-settles forever therefore never accumulates failures and never
trips the pause-and-tell-the-member path.

**Narrower on one point.** The auditor attributes "the plan won't attempt
September again" to the PENDING handling. It is not PENDING-specific:
`lastCollectedPeriod` is stamped *before* the charge, for every outcome, and
deliberately —

> Stamped before the charge, not after. A job that dies mid-collection must not
> leave the plan looking un-collected.

That is correct idempotency design and should not be changed. The defect is the
outcome classification afterwards, not the claim before.

**The real shape of it** is A2-F19 again in a different file: there is no state
for *submitted, outcome unknown*, so the code must choose between calling it a
success and calling it a failure, and the two schedulers chose differently. The
auditor's proposed `SUBMITTED / SUCCESS / FAILED / UNKNOWN` is the same fix that
finding needs, which is an argument for solving it once.

---

## A3-F37 to A3-F41 — the Netcash integration findings, restated

All five are rediscoveries. They are recorded here for traceability and **must
not be scheduled separately**; the new material in each is folded into the
original item.

| ID | Duplicate of | New material to carry |
|---|---|---|
| A3-F37 | A1-F02, A2-F20 | The four-part identity: local idempotency key, batch id, file token, provider reference |
| A3-F38 | A1-F04 | Report rows are reference-and-line-aware; a *successful* batch may contain **no detail rows at all** |
| A3-F39 | A1-F03, A2-F23 | Field 101 is documented as the unique client reference in the Debit Order Masterfile |
| A3-F40 | A2-F22 | A concrete `DebitBatch` shape: period, actionDate, fileToken, reportStatus, reportReceivedAt, totalCount, totalAmount |
| A3-F41 | A2-F21 | Our batch builder **already supports multiple rows** — the one-row call site is the only thing standing between us and one file per period |

The A3-F38 detail is worth pulling out. If a fully successful batch returns no
detail rows, then a report consumer cannot settle transactions by iterating rows:
absence of a failure row *is* the success signal. A consumer written against the
failure case alone would settle nothing on a perfect run.

A3-F41's detail changes the cost estimate. `buildDebiCheckBatchFile` already
takes a `rows` array; `submitDebit` passes one element. Batching is a call-site
and lifecycle change, not a builder rewrite.

**Escalation noted.** The auditor escalated A3-F38 to a standalone verdict:

> P0 — do not treat Netcash batch submission as completed payment.

We already hold that line in code — `submitDebit` returns `PENDING` — which the
auditor confirmed in Round 2. The escalation is about the *other* end: nothing
converts that PENDING into an outcome.

---

## A3-F42 — `suggestPlan()` reads stale `currentAmount`

**Auditor severity:** P2 · **Verdict: CONFIRMED** · **Dormant**

`apps/web/services/goal-plan.service.ts:56`:

```ts
const remaining = Math.max(0, subtractZAR(Number(goal.targetAmount), Number(goal.currentAmount)))
```

reads the materialised column rather than deriving from settled payments. If
`resyncGoal` has not run since a payment or reversal, the suggested monthly
commitment is briefly wrong.

Confirmed and correctly rated. The member chooses the final amount, so a stale
suggestion misleads rather than miscollects. The auditor's generalisation is the
part to keep:

> derived financial state + cached/materialised state needing a clear consistency
> contract

which is A2-F15 and A2-F17 wearing different clothes. One contract, written once,
answers all three: **which figures are derived, which are materialised, and what
guarantees the materialised ones catch up.**

---

## A3-F43 — Goal-plan unique index does not cover `PAUSED`

**Auditor severity:** P1 · **Verdict: CONFIRMED, INVERTED** · **Dormant**

### The finding

The schema comment says *"one live plan per member per goal"*, but the partial
unique index is `WHERE status = 'ACTIVE'`, while the service treats `ACTIVE` and
`PAUSED` alike for cancellation and resumption. So:

```
PAUSED plan exists -> member starts a new plan -> new ACTIVE allowed
                   -> old PAUSED resumed -> two ACTIVE plans
```

because `resumePlan()` does not check for another active plan. Called *"a real
business invariant gap."*

### Verification — the application half is confirmed, the outcome is not

`apps/web/services/goal-plan.service.ts:344` confirms the missing check.
`resumePlan` validates that the plan is `PAUSED` (355), that an active mandate
exists (361), and that the goal is still open (371) — and then flips status to
`ACTIVE` at 377 without ever asking whether another active plan exists for that
`(userId, goalId)`.

**But two `ACTIVE` plans cannot result.** The index does cover it:

```sql
CREATE UNIQUE INDEX "goal_plans_user_goal_active_key"
    ON "goal_plans"("userId", "goalId")
    WHERE "status" = 'ACTIVE';
```

`(userId, goalId)` unique among `ACTIVE` rows — so the resume violates the
constraint and the write is refused. The invariant is database-safe.

**What actually happens is still a defect, just a different one.** The member
gets a raw unique-constraint failure instead of `GoalConflictError('…')` — an
opaque error where every sibling path returns a clear message. `resumePlan`
already handles its optimistic-lock loss gracefully at 384 (*"This plan was just
changed. Refresh and try again."*), so the polish exists; this case simply was
not anticipated.

**Why this inversion is worth recording.** Every other finding in this series
runs one way: the application holds an invariant the database does not. Here it
is the reverse — the database holds an invariant the application forgot, and the
partial index absorbed a bug nobody had thought about. That is the architecture
the auditor has been recommending throughout (A1-F05, A1-F06, A2-F18, A2-F26),
working exactly as intended, and it is evidence for their recommendation rather
than against it.

The schema comment is also more accurate than it looks: it says *live*, and
`ACTIVE` is what live means. It is the service that treats `PAUSED` as
live-adjacent.

---

## A3-F44 — Goal-plan version claim assumes sole ownership

**Auditor severity:** P2 until proven · **Verdict: CONFIRMED, SHARPENED** · **Dormant**

### The finding

Claiming with `updateByVersion(plan.id, plan.version, …)` is good — much better
than a naked update. But the follow-up writes use `plan.version + 1`, which
assumes the claim was the only version-changing operation in between. Rated P2
until concurrency tests covering collection + resume + cancel + a second
scheduler run prove otherwise.

### Verification

Confirmed, and there is a concrete consequence worth naming rather than leaving
as "deserves tests".

The claim at line 294 checks its result:

```ts
const claimed = await goalPlanRepo.updateByVersion(plan.id, plan.version, { lastCollectedPeriod: period })
if (claimed.count === 0) continue // another run took it, or the member cancelled
```

**The follow-ups do not.** Lines 308, 314 and 324 all issue
`updateByVersion(plan.id, plan.version + 1, …)` and **discard the return value**.
If a concurrent `resumePlan` or `cancelPlan` moved the version between the claim
and the follow-up, the write matches nothing, affects zero rows, and is silently
dropped.

What gets dropped is the failure bookkeeping: `failedRuns + 1` on a failed
collection, and the reset to zero on recovery. `failedRuns` is what pauses a
plan that keeps failing and tells the member — so a plan could fail repeatedly,
lose the increment each time to a race, and never pause.

That is narrow and unlikely, and P2 is the right rating. But it is more specific
than "needs tests": **the claim checks its outcome and the follow-ups do not**,
which is a one-line-per-site fix and a test each.

---

## What the audit endorsed

The vendor documentation validated architecture already built, which is worth as
much as any finding:

> Your use of `BatchFileUpload` -> file token -> load report is aligned with
> Netcash's documented asynchronous design.

And the batch file carries the right fields, each matching Netcash's documented
DebiCheck transaction record:

```
101  Account Reference
162  Amount
232  Tracking Days
249  Mandate Reference
```

This matters because it is independent confirmation from the vendor's own
documentation of work that was done by reading that documentation — the episode
recorded in `ENGINEERING_WORKFLOW.md` §4.12, where four defects (cents, file
token, the two vendor spellings, the wrong default endpoint) were found by
opening a manual nobody had opened. That pass is now externally verified.

The auditor's summary of where this leaves us:

> The foundation isn't wrong. **You built the submission mechanism, but the
> authoritative asynchronous outcome pipeline isn't finished.**

---

## Master audit status as delivered

| Severity | Count | Meaning |
|---|---|---|
| P0 | ~5 | Must resolve before real-money production |
| P1 | ~15+ | Must resolve or explicitly accept before go-live |
| P2 | several | Hardening and operational reliability |
| Good | many | Strong implementation areas |

> The important part is that the **P0s are concentrated**, not spread everywhere.

The critical chain, which must be provably correct before the first genuine
collection:

```
Netcash -> BatchFileUpload -> File Token -> Load Report + Actual Result
        -> Local Transaction -> Ledger / Goal -> Reconciliation
```

Every link in it is dormant today. Every link in it is a precondition for a
gateway.

---

## Announced for Round 4

An endpoint-by-endpoint authorisation and state-machine pass, targeting:

```
member A -> member B's object      ·  member -> admin endpoint
suspended member -> money endpoint ·  PENDING -> terminal state
FAILED -> SUCCESS                  ·  REVERSED -> SUCCESS
cancelled mandate -> collection    ·  cancelled plan -> resume
two admins -> same critical action ·  two workers -> same payment
month-end -> duplicate/missed collection
```

Two of those we can answer before it starts: *cancelled plan -> resume* is
A3-F43 (refused by the database, badly reported), and *two admins -> same
critical action* is A1-F05 with A2-F26. The existing endpoint-level work in
`docs/security/` should be offered rather than rediscovered.

---

## Open questions carried forward

1. **A2-F16 still needs a business decision:** may the pool balance go negative?
   Nothing can be implemented until leadership answers.
2. **A2-F30 leaves one configuration check:** confirm `TRUSTED_PROXY` is set in
   production.
3. **New — A3-F35 needs a product decision:** should "last day of the month" be a
   first-class debit day, or should 29–31 be refused at the boundary? Both are
   defensible; clamping silently is not.
4. The auditor still has not run the suite; our measured figure is 2,154 tests
   green across 9 workspaces.
