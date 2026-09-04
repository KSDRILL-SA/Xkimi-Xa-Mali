# Audit 2 — State machines, concurrency, and the security boundary

**Received:** 2026-09-04 · **Findings:** 14–33 (20) · **Status:** documented and verified; not yet scheduled

## What this audit is

Round 2 of the same external review, attacking three areas in turn: goal-payment
and ledger state machines, concurrency claims on the money path, and the security
boundary. It ends by naming the category it thinks the remaining risk lives in,
and that conclusion is the most useful thing in it.

### The auditor corrected their own Finding 4

Unprompted, and to exactly the position our verification reached independently:

> I overstated Finding #4. Your repository *does* implement
> `RequestFileUploadReport` and exposes `fetchBatchReport()`. The actual problem
> is narrower and more important: I cannot find a production workflow that
> actually calls `fetchBatchReport()` and converts the returned load report into
> individual transaction outcomes.

That is A1-F04 as recorded. Two independent readings converging on the same
narrower statement is worth more than either reading alone, and it raises the
confidence rating on this auditor's other Netcash claims.

### The scheduling fact still applies

There is no payment gateway; a live deployment selects `disabledGateway`. Of the
20 findings here, **13 are on the gateway path and dormant**. Four can produce a
wrong outcome this month, and three are endorsements.

---

## Verification summary

| ID | Finding | Auditor severity | Verdict | Live today? |
|---|---|---|---|---|
| A2-F14 | Goal-payment settlement has no compare-and-swap | P0 | **CONFIRMED** | Dormant |
| A2-F15 | `SUCCESS` persisted before the ledger credit | P2 (self-rated) | **CONFIRMED, NARROWER** | **Live** |
| A2-F16 | Pool balance can go negative with no invariant | P1 | **CONFIRMED** | **Live** |
| A2-F17 | Ledger uniqueness does not carry semantics | P1 | **CONFIRMED (design item)** | **Live** |
| A2-F18 | Debit-run idempotency claim is not atomic | P0 | **CONFIRMED** | Dormant |
| A2-F19 | Retry can double-debit an ambiguous first attempt | P0 | **CONFIRMED** | Dormant |
| A2-F20 | `gatewayRef` cannot be the reconciliation identifier | P0 | **CONFIRMED — duplicate of A1-F02** | Dormant |
| A2-F21 | Batch collection is implemented as one-row batches | P0 | **CONFIRMED** | Dormant |
| A2-F22 | Batch-level and member-level failure not modelled apart | P1 | **CONFIRMED (design item)** | Dormant |
| A2-F23 | No durable provider-reference to member mapping | P1 | **CONFIRMED — duplicate of A1-F03** | Dormant |
| A2-F24 | Mandate creation compensation is not durable | P1 | **CONFIRMED** | Dormant |
| A2-F25 | Cancellation tells the member more than the provider confirmed | P0 | **CONFIRMED — sharpens A1-F10** | Dormant |
| A2-F26 | `setMemberStatus` shares the final-admin race | P1/P0 | **CONFIRMED — answers A1 open question 2** | **Live** |
| A2-F27 | Invitation capacity reservation race | P1 | **CONFIRMED — duplicate of A1-F06** | **Live** |
| A2-F28 | The 50-member business rule is well designed | endorsement | **Endorsed** | — |
| A2-F29 | Internal admin channel is replayable within 5 minutes | P1 | **CONFIRMED** | **Live** |
| A2-F30 | `getClientIP` proxy-trust audit requested | audit item | **RESOLVED — the audit exists and passes** | — |
| A2-F31 | Webhook signature implementation is solid | endorsement | **Endorsed, with a caveat that is A1-F01** | — |
| A2-F32 | Hard-coded webhook IP allowlist is a reliability hazard | P1 | **CONFIRMED, NARROWER** | Dormant |
| A2-F33 | Webhook dedupe (claim / process / release) is good | endorsement | **Endorsed** | — |

Seventeen stand as work. Three are endorsements. One requested audit is answered
by code that already exists. Four are duplicates or sharpenings of audit 1 and
must be merged rather than scheduled twice.

---

## A2-F14 — Goal-payment settlement has no compare-and-swap

**Auditor severity:** P0 · **Verdict: CONFIRMED** · **Dormant**

### The finding

Webhook dedupe on `(source, eventKey)` is excellent, but it only stops the *same*
event twice. Two **different valid events** about the same goal payment can both
read `PENDING`, both map to `SUCCESS`, and both write. The ledger's
`(refType, refId, direction)` uniqueness prevents a double credit — but the
notification can fire twice, and more importantly the state transition is not the
concurrency arbiter. The contribution path already solves this with
`UPDATE … WHERE status = previousStatus` and an affected-row check.

### Verification

Confirmed, and the contrast within one codebase is exact.

**The weak path** — `apps/web/services/goal-payment.service.ts:285`:

```ts
await goalRepo.updatePayment(payment.id, {
  status: newStatus,
  ...(newStatus === 'SUCCESS' && { processedAt: new Date() }),
})
```

A blind update by id. Nothing observes whether the row still held the status that
was read at line 269.

**The strong path** — `apps/web/services/contribution.service.ts:565`:

```ts
const claimed = await transactionRepo.updateIfStatus(transaction.id, transaction.status, {...}, tx)
if (claimed.count === 0) return undefined
```

with a comment explaining why "lost the race" is deliberately distinct from "no
change", and a log at 586 recording the loss.

This is the auditor's thesis in miniature: the right pattern exists, is
understood, is commented, and was not applied to the sibling.

---

## A2-F15 — `SUCCESS` is persisted before the ledger credit

**Auditor severity:** P2, self-rated down · **Verdict: CONFIRMED, NARROWER** · **LIVE TODAY**

### The finding

Status is written, then `applySettledPayment()` runs `resyncGoal()` and only then
credits the ledger. If `resyncGoal()` throws, the payment is `SUCCESS` and the
ledger entry is missing. Reconciliation recovers it, so this is a recoverable
consistency gap rather than corruption — but the invariant should be stated:

> `SUCCESS` means gateway settlement recorded; ledger posting is an asynchronous
> projection guaranteed by reconciliation.

### Verification

`apps/web/services/goal-payment.service.ts:57–76`. The ordering is as described.

**Narrower in a way that matters:** the ledger post is *already* explicitly
best-effort —

```ts
await postPoolCredit({...}).catch((err) => logger.error('Pool credit failed on goal payment', {...}))
```

so a ledger failure cannot abort settlement, which is deliberate and correct. The
exposure is narrower than "the ledger step can fail": it is that **`resyncGoal()`
at line 63 is *not* wrapped**, so a throw there skips a credit that would
otherwise have been attempted. One unguarded call, not a structural ordering
problem.

**Live today**, unlike its siblings: `recordOfflineGoalPayment` reaches
`applySettledPayment` without any gateway, and offline is the only way money
enters this system.

The auditor's recommendation — write the invariant down — is the right fix and is
close to free. This repository already made exactly this correction once, on the
offline contribution path, and recorded the reason: *correct by tomorrow is not
correct*. The same sentence belongs here.

---

## A2-F16 — The pool balance can go negative, with no invariant

**Auditor severity:** P1 · **Verdict: CONFIRMED** · **LIVE TODAY**

### The finding

`CREDIT 1000` + `DEBIT 1500` yields `-500` and nothing objects. Whether that is
legitimate is a business question, and the business answer is not written down
anywhere — so the database accepts either interpretation.

### Verification

`apps/web/services/ledger.service.ts:99–108`:

```ts
return { balance: subtractZAR(credited, debited), credited, debited, entries }
```

No floor, no assertion, no alarm. A negative balance would render on the Fund
page as an ordinary figure.

**This is the sharpest finding in Round 2 for a system with no gateway**, because
the reversal path is reachable today: an admin reversing an offline transaction
posts a `DEBIT`. The auditor is right that the question is not "prevent
negative" — it is that **nobody has decided**, and an undecided invariant on a
money page is how a wrong number gets shown to members with total confidence.

What needs deciding: can the pool legitimately go negative (a reversal after a
disbursement), or is a negative balance always a defect requiring a hard alarm?
That is a leadership decision, not an engineering one — but the engineering must
follow whichever answer is given, and today it follows neither.

---

## A2-F17 — Ledger uniqueness does not carry semantics

**Auditor severity:** P1 · **Verdict: CONFIRMED (design item)** · **LIVE TODAY**

### The finding

`UNIQUE(refType, refId, direction)` correctly prevents a double credit and
correctly permits `CREDIT` + `DEBIT` on the same ref for a reversal. But the
database does not know that `DEBIT` must mean reversed and `CREDIT` must mean
settled. That invariant lives only in application code. The auditor proposes
formalising a source-state matrix and having reconciliation validate it:

| Source state | CREDIT | DEBIT |
|---|---|---|
| Transaction SUCCESS | yes | no |
| Transaction REVERSED | credit exists, plus | yes |
| Transaction FAILED | no | no |
| GoalPayment SUCCESS | yes | no |
| GoalPayment REVERSED | credit exists, plus | yes |

### Verification

The constraint and the freedom are both as described. This is a genuine design
item rather than a defect: no current code path violates the matrix. Its value is
as a **check the reconciler can run**, which converts an unwritten convention
into something that fails loudly when a future path breaks it.

Worth pairing with A2-F16 — both are "the ledger is correct and its rules are not
written down where they can be enforced."

---

## A2-F18 — The debit-run idempotency claim is not atomic

**Auditor severity:** P0 · **Verdict: CONFIRMED** · **Dormant**

### The finding

```
Worker A                 Worker B
check DB   -> none       check DB   -> none
check Redis-> none       check Redis-> none
set Redis                set Redis
submit debit             submit debit
```

The Redis `SET` follows a read instead of *being* the claim. The transaction's
unique `idempotencyKey` stops the second row — after the second external debit.

### Verification

`apps/web/inngest/functions/debit-run.ts:107–123`, confirmed literally, and the
two operations are even in separate Inngest steps:

```ts
const alreadyRan = await step.run(`check-idempotency-${mandate.id}`, async () => {
  const redisCheck = await redis.get(idempotencyKey)
  if (redisCheck) return true
  const dbCheck = await db.transaction.findUnique({ where: { idempotencyKey }, ... })
  return !!dbCheck
})
if (alreadyRan) { tally.skipped += 1; return }

await step.run(`claim-${mandate.id}`, () =>
  redis.set(idempotencyKey, '1', { ex: 60 * 60 * 72 }),
)
```

`redis.set` without `NX`. The fix is small — a conditional set whose *return
value* decides whether to proceed — and it is the same shape as the goal-payment
claim the auditor keeps citing as the good example.

**Scope note.** Inngest memoises steps within a run, so the realistic trigger is
two overlapping *runs* — a manual trigger crossing the cron, a redelivery, or a
concurrency setting above one — not two workers inside one run. That narrows how
easily it fires without changing that the claim is not a claim.

---

## A2-F19 — A retry can double-debit an ambiguous first attempt

**Auditor severity:** P0 · **Verdict: CONFIRMED** · **Dormant**

### The finding

The classic unknown-outcome problem:

```
submit debit -> Netcash receives it -> our HTTP request times out
```

We record `FAILED`; the gateway may have accepted. The retry key
`retry:${originalKey}:${attempt}` deliberately makes it a *different* external
request — good for distinguishing attempts, and therefore incapable of
guaranteeing only one real debit.

> For money movement, `TIMEOUT != FAILED`. It means `UNKNOWN` /
> `RECONCILIATION_REQUIRED` until the provider confirms what happened.

### Verification

Confirmed on both halves:

- `apps/web/inngest/functions/transaction-retry-failed.ts:95` —
  `idempotencyKey: \`retry:${tx.idempotencyKey}:${tx.retryCount + 1}\``, a new
  external identity per attempt.
- `apps/web/inngest/functions/debit-run.ts:206` — an exhausted retry writes a
  `FAILED` row, with a comment stating the intent plainly: *"A FAILED row is what
  transaction-retry-failed looks for."*

So an infrastructure timeout enters the same recovery pool as a bank decline, and
the recovery pool submits again. The two are not the same event and the system
has no way to say so.

**This is the finding with the largest real-money consequence in Round 2**, and
it cannot be fixed by a better retry key — it needs a status the system does not
currently have. It is also the concrete instance of the auditor's closing thesis:
`SUCCESS`/`FAILED` cannot express what actually happened.

One thing already right and worth keeping: the retry's *reference* is
`XXM-RETRY-${tx.id.slice(-8)}` — per-transaction, not per-period. The retry path
has the unique provider-facing reference that the main debit run lacks (A1-F03).

---

## A2-F20 — `gatewayRef` cannot be the reconciliation identifier

**Verdict: CONFIRMED — duplicate of A1-F02** · **Dormant**

Restates A1-F02 with the code confirmed rather than inferred, and adds a concrete
remedy: stop making one `gatewayRef` column carry several meanings, and model
`netcashBatchToken`, `netcashTransactionReference` and `netcashAccountReference`
separately.

**Merge into A1-F02/A1-F04.** The field split is the useful new content and
should be carried into that work item; do not schedule it twice.

---

## A2-F21 — Batch collection is implemented as one-row batches

**Auditor severity:** P0 · **Verdict: CONFIRMED** · **Dormant**

### The finding

The code observes that DebiCheck is a batch upload even for one transaction, and
then sends one row per member. At 50 members that is 50 uploads, 50 file tokens,
50 load reports, 50 asynchronous states — more retry ambiguity, more rate-limit
exposure, more partial-failure surface. At four members it does not matter; at 50
it does.

### Verification

`apps/web/lib/netcash.ts:305–319` — `buildDebiCheckBatchFile` is called with
`rows: [ { one row } ]`, from `submitDebit`, which is per-mandate. Confirmed.

`processMandateBatch()` batches *our* processing, not the provider's file. The
naming makes the gap easy to miss — a reader sees "batch" at both ends and
assumes they are the same batch.

**Why this ranks above its severity for planning:** it is the finding most
expensive to fix *later*. A per-member submission model and a per-file submission
model produce different tables, and A2-F22's `BatchSubmission` is the shape the
provider actually implies. Deciding it before building the report consumer
(A1-F04) costs a design conversation; deciding it after costs a migration of
financial records.

---

## A2-F22 — Batch-level and member-level failure are not modelled apart

**Auditor severity:** P1 · **Verdict: CONFIRMED (design item)** · **Dormant**

### The finding

Netcash load reports are `SUCCESSFUL`, `SUCCESSFUL WITH ERRORS` or
`UNSUCCESSFUL`, and error records identify the supplied unique reference and line
number. Our model has only `Transaction = SUCCESS | PENDING | FAILED`. Proposed:

```
BatchSubmission { batchId, netcashFileToken, submittedAt, actionDate,
                  totalCount, totalAmount, reportStatus, reportReceivedAt }
   |- Transaction A
   |- Transaction B
```

### Verification

No such model exists; confirmed by absence. `SUCCESSFUL WITH ERRORS` is the state
that makes the point — it is simultaneously a batch success and a member failure,
and there is nowhere to put it.

This is the missing half of A1-F04: that finding says nothing *reads* the report,
this one says there is nowhere to *put* what it reads. They are one piece of
work.

---

## A2-F23 — No durable provider-reference to member mapping

**Verdict: CONFIRMED — duplicate of A1-F03** · **Dormant**

Same defect, argued from the reconciliation side rather than the validation side:
`XXM-2026-09` is a *period* reference, so the chain
`provider reference -> transaction -> member -> period` cannot be walked. Proposes
`XXM-D-<transaction-id>` or similar.

**Merge into A1-F03.** The proposed format is useful; the finding is not
separate. Note the retry path (A2-F19) already does this correctly.

---

## A2-F24 — Mandate creation compensation is not durable

**Auditor severity:** P1 · **Verdict: CONFIRMED** · **Dormant**

### The finding

Creation is handled reasonably: check existing, create at Netcash, create
locally, and cancel the gateway mandate if the local write fails. Two concurrent
requests are caught by the partial unique index and the loser compensates. The
residual case is the compensation itself failing:

```
create Netcash mandate -> local create fails -> cancel Netcash -> cancel times out
```

leaving an orphan gateway mandate, recorded only in a log.

> Never rely on `.catch(() => {})` for an external financial side effect.

Proposes a durable `GatewayCompensationTask`.

### Verification

The compensating cancel exists and the failure path logs. No durable queue,
retry, or operator surface exists for a failed compensation. Confirmed.

The auditor's closing sentence generalises past this finding: the codebase uses
`.catch(() => {})` and `.catch(log)` in several places on the money path, each
deliberately, so that a secondary failure cannot unwind a primary success. That
is right. What is missing is the other half — a place where the swallowed
failure goes to be retried. A2-F24, A1-F10 and A2-F25 are all instances of it.

---

## A2-F25 — Cancellation tells the member more than the provider confirmed

**Auditor severity:** P0 · **Verdict: CONFIRMED — sharpens A1-F10** · **Dormant**

### The finding

Local write precedes the provider call. If the provider call fails, local is
`CANCELLED` and Netcash is `ACTIVE`. An alert fires. But the system tells the
member *"we will not collect from you again"* — locally true, externally not yet
established. Proposed: separate local cancellation from provider-confirmed
cancellation, e.g. `CANCEL_REQUESTED -> CANCELLED | CANCEL_FAILED`, so the member
is told:

> Your cancellation request has been recorded; gateway cancellation is pending.

### Verification

Confirmed, and this is the finding that **corrects our narrowing of A1-F10**.

Recording A1-F10 we noted that local-first ordering on `cancelMandate` is a
deliberate safety property — the code says so at `mandate.service.ts:530`:

> so a member who asks to stop being collected from is never collected from
> again by us, whatever the gateway does

That reasoning is sound and this audit does not overturn it. **But it contains
its own limit, in two words: *by us*.** The mandate lives at the bank. Local-first
guarantees we never *initiate* another collection; it cannot guarantee the
mandate is incapable of being collected on. The defect is not the ordering — it
is that a guarantee about our own behaviour is communicated to the member as a
guarantee about their bank account.

So A1-F10 and A2-F25 resolve differently and both are right:

| | Amount change | Cancellation |
|---|---|---|
| Ordering | Should block collection while unsynced (A1-F10) | Keep local-first — it fails safe |
| Defect | Wrong amount collected | Member told more than is established |
| Fix | `SYNC_PENDING`, do not collect | Distinct state + honest wording |

The existing note records a third gap to carry: nightly `mandate-status-sync`
reads only `PENDING`, `ACTIVE` and `SUSPENDED`, so a cancellation that failed at
the gateway is never re-examined by anything.

---

## A2-F26 — `setMemberStatus` shares the final-admin race

**Auditor severity:** P1/P0 · **Verdict: CONFIRMED** · **LIVE TODAY**

This **answers open question 2 from audit 1**, where we recorded the suspension
sibling as asserted but unverified. It is now verified.

`apps/admin/lib/services/members.ts:128`:

```ts
const activeAdminCount = targetIsAdmin && newStatus === 'SUSPENDED'
  ? await db.user.count({ where: { status: 'ACTIVE', deletedAt: null,
      roles: { some: { role: { name: 'ADMIN' } } } } })
  : 0
```

then `refuseStatusChange({ ..., activeAdminCount })` at 138, then the update.
Read, decide, write — the same TOCTOU as A1-F05, against the same invariant.

`apps/web/services/admin.service.ts:163` is the sibling entry point.

**Two paths, one invariant.** *"At least one active admin always exists"* can be
broken by revoking roles (A1-F05) **or** by suspending accounts (A2-F26), and the
two do not see each other: one admin revoking B's role while another suspends A
would pass both checks independently. Any fix has to serialise the invariant, not
each operation — which is an argument for solving it once, in the database,
rather than twice in application code.

The conditional count (only when it could matter) is a nice touch and should
survive whatever fix is applied.

---

## A2-F27 — Invitation capacity reservation race

**Verdict: CONFIRMED — duplicate of A1-F06** · **LIVE TODAY**

Same finding, same verification (`invite.service.ts:159–161`, `192`, `401`).
**Merge into A1-F06.** Independent rediscovery raises confidence; it does not add
work.

---

## A2-F28 — The 50-member business rule itself is well designed

**Endorsement.** Recorded so a later reader does not "simplify" it.

The cap counts `members + unexpired pending invitations`, not merely active
users, which prevents *"invite 20 people and have 20 people racing to register."*
The auditor's distinction is the one to keep:

> The business invariant is correct. The weakness is purely concurrency.

A fix for A1-F06 must preserve the counting rule and change only how the place is
held.

---

## A2-F29 — The internal admin channel is replayable within five minutes

**Auditor severity:** P1 · **Verdict: CONFIRMED** · **LIVE TODAY**

### The finding

`x-admin-secret` + `x-admin-timestamp` + `x-admin-user-id`, with a ±5 minute
window. Decent, but the timestamp is not single-use, so a captured request can be
replayed inside the window. For consequential actions — reverse transaction,
change role, suspend member, approve mandate — the auditor prefers
`HMAC(method + path + timestamp + nonce + body)` with a durable nonce store, so
replay is refused by identity rather than merely by age.

### Verification

`apps/web/lib/internal-request.ts:22` — the header set and the ±5 minute window
are as described, and the comment concedes the exact point:

> a timestamp (`x-admin-timestamp`) within ±5 minutes **to limit replay**

Limit, not prevent. No nonce store exists.

**Live today**, and it is the only Round 2 security finding that is: the internal
channel is how the admin console reaches the member app, and it carries the
reversal and role-change routes right now. Its exposure is bounded by the secret
not leaking — which is the assumption the finding is asking us not to rely on
alone.

Note the durable nonce store this needs is Redis, which is configured and healthy
(`redis ok` in the last sweep), so the mechanism is available.

---

## A2-F30 — `getClientIP` proxy-trust audit

**Verdict: RESOLVED — the audit exists and passes** · no work

The auditor was careful to file this as *"an audit item, not yet a confirmed
finding"*, asking whether the implementation distinguishes a trusted
proxy-supplied IP from a client-supplied header. It does.

`packages/utils/src/client-ip.ts:41`:

```ts
export function clientIpFromHeaders(
  headers: HeaderReader,
  proxy: TrustedProxy = resolveTrustedProxy(process.env.TRUSTED_PROXY),
): string | undefined {
  if (proxy === 'cloudflare') {
    // Set by Cloudflare from the real connection; an inbound copy is replaced.
    return headers.get('cf-connecting-ip')?.trim() || undefined
  }
  if (proxy === 'vercel') {
    // Vercel sets both from the real connection and does not honour an inbound value.
    return firstHop(headers.get('x-vercel-forwarded-for')) ?? firstHop(headers.get('x-forwarded-for'))
  }
  // Nothing declared in front, so nothing is normalising these headers and
  // there is no trustworthy client IP. Say so rather than believe the caller.
  return undefined
}
```

Trust is **declared** (`TRUSTED_PROXY`), not inferred; each mode reads the header
that platform sets from the real connection; and the undeclared case returns
`undefined` rather than believing an attacker-supplied `x-forwarded-for`. That
last line is the answer to the question asked — the failure mode is *no IP*, not
*a forged IP*, so rate-limit identity and audit records degrade to absent rather
than to attacker-chosen.

**One operational check follows from it, and is the only thing to carry:**
confirm `TRUSTED_PROXY` is actually set in production. If it is unset, this
function is behaving correctly and returning `undefined` everywhere — which would
silently weaken rate-limit identity and leave audit rows without an IP. That is a
configuration verification, not a code change.

---

## A2-F31 — Webhook signature implementation is solid

**Endorsement, with a caveat that is A1-F01.**

The auditor endorses the cryptography: raw-body HMAC-SHA256, hex/base64 decode,
`timingSafeEqual`, length rejection, missing-secret rejection. Confirmed at
`apps/web/lib/netcash.ts:410–427`.

The caveat is the whole of A1-F01 restated from the other side:

> The problem isn't the implementation. The problem is whether Netcash actually
> supplies this HMAC signature contract on the production endpoint.

Netcash's published documentation does not establish `x-netcash-signature` as the
DebiCheck contract. **A correct implementation of a contract the provider does
not offer authenticates nothing** — it rejects every genuine postback with 401.
Carry as confirmation work in Netcash sandbox certification, under A1-F01.

---

## A2-F32 — The hard-coded webhook IP allowlist is a reliability hazard

**Auditor severity:** P1 · **Verdict: CONFIRMED, NARROWER** · **Dormant**

### The finding

Four hard-coded Netcash IPs are good defence in depth, but if the provider
changes infrastructure, a legitimate webhook gets a 403 and settlement is not
processed. A security control without an update mechanism becomes a reliability
hazard.

### Verification

The IPs are at `apps/web/lib/netcash.ts:429–434`. **Narrower than reported:** an
override already exists —

```ts
const envIps = process.env.NETCASH_WEBHOOK_IPS
const ips = envIps ? envIps.split(',').map((ip) => ip.trim()).filter(Boolean) : DEFAULT_WEBHOOK_IPS
```

so the list is changeable without a code change. Two things remain:

1. The set is memoised in `_webhookIpSet`, so a change still needs a
   redeploy or restart to take effect. Worth knowing during an incident.
2. **Nothing raises an alarm when a webhook is refused by IP.** The route logs
   `Webhook from disallowed IP` at warn and returns 403. The auditor's failure
   mode — *legitimate webhook, 403, settlement not processed* — is silent, and
   silence on the money path is the failure this repository keeps rediscovering.

Item 2 is the real finding, and it is small: an operational alert on repeated
IP-refused webhooks.

---

## A2-F33 — Webhook dedupe is genuinely good

**Endorsement.** `ProcessedWebhookEvent` with `UNIQUE(source, eventKey)`, and
specifically the **claim / process / release-on-failure** shape rather than
marking a failed event permanently processed.

> That's solid distributed-event handling.

Recorded so that a later change does not "simplify" the release path away. The
release is what prevents a transient failure from permanently swallowing a
settlement event.

---

## The auditor's architectural conclusion

The most valuable paragraph in Round 2, and it should govern how the work is
sequenced:

> Your system is not failing because you don't understand security. The dangerous
> remaining category is **distributed transaction semantics**.

Three independent systems, no transaction that atomically commits all three:

```
                    PostgreSQL
                        |
                  Xkimi Xa Mali
                    /        \
              Netcash      Notifications
```

Therefore every financial operation needs a state machine that can represent:

```
SUCCESS · FAILED · PENDING · UNKNOWN · RECONCILIATION_REQUIRED
```

rather than collapsing everything into `SUCCESS`/`FAILED`.

> And your code is already very close to this architecture. You just haven't
> fully generalized it.

That matches audit 1's thesis (*inconsistent guarantees between paths that should
provide the same guarantee*) and gives it a cause: the missing states are what
force each path to guess, and each path guesses differently. **A2-F19 is the
clearest single instance** — a timeout has no state to be recorded as, so it is
recorded as a decline, and the recovery machinery does the rest.

---

## The auditor's own priority list

Reproduced as given. It is their ranking, not our schedule — the implementation
plan will reorder it against the fact that there is no gateway.

| | Item | Maps to |
|---|---|---|
| 1 | Model the Netcash batch lifecycle properly | A2-F21, A2-F22, A1-F04 |
| 2 | Stop treating the file token as a transaction reference | A1-F02, A2-F20 |
| 3 | Make every provider-facing reference unique | A1-F03, A2-F23 |
| 4 | Fix scheduled-debit claim atomicity | A2-F18 |
| 5 | Fix goal-payment webhook CAS | A2-F14 |
| 6 | Treat timeout as `UNKNOWN`, not automatic failure | A2-F19 |
| 7 | Serialise the last-admin invariant | A1-F05, A2-F26 |
| 8 | Serialise the 50-member reservation invariant | A1-F06, A2-F27 |
| 9 | Turn gateway desynchronisation into durable work, not logs | A1-F10, A2-F24, A2-F25 |
| 10 | Confirm the real Netcash postback contract in sandbox | A1-F01, A2-F31 |

And their framing of the whole exercise, which is worth keeping:

> None of these findings mean "throw the system away." They are mostly surgical
> architectural corrections.

**Items 1, 2, 3, 4, 6 and 10 all require a gateway that does not exist.** Items 5,
7, 8 and part of 9 do not. That inversion is the single most important input to
the implementation plan.

---

## Announced for Round 3

> Every API endpoint one by one, looking specifically for IDOR, privilege
> escalation, missing status checks, malformed input, cross-member access, race
> conditions, stale sessions, sensitive response leakage, and business-rule
> bypasses.

Expect overlap with the endpoint-level work already recorded in
`docs/security/`; that should be offered rather than rediscovered.

---

## Open questions carried forward

1. **A2-F16 needs a business decision, not an engineering one:** may the pool go
   negative? Nothing can be implemented until leadership answers.
2. **A2-F30 leaves one configuration check:** confirm `TRUSTED_PROXY` is set in
   production, or client IPs are silently absent everywhere.
3. Audit 1's open question 1 stands — the auditor still has not run the suite;
   our measured figure is 2,154 tests green across 9 workspaces.
