# Audit 1 — Master audit, first pass

**Received:** 2026-09-04 · **Findings:** 13 · **Status:** documented and verified; not yet scheduled

## What this audit is

An independent review asking *"where can this system produce an incorrect
outcome when everything goes wrong at once?"* rather than *"does it look
good?"*. Its own summary of the result is worth keeping, because it sets the
register for everything below:

> The engineering quality is genuinely high. The remaining problems are mostly
> not beginner mistakes — they are distributed-systems, concurrency,
> integration-contract, and operational-consistency problems.

### Scope the auditor declared

- Static code review, plus reading the test suite, plus the **external Netcash
  contract** taken from Netcash's own published documentation.
- The auditor could **not execute the test suite** (dependency install did not
  complete in their sandbox). Nothing here is a claim that assertions were run.
- Counted 145 test files / ~1,635 assertions. Our own last measured figure is
  **2,154 tests across 9 workspaces** (2026-09-04 sweep) — the auditor was
  counting files and assertions, not cases, so these are not in conflict.

### The single most important scheduling fact

**This Foundation has no payment gateway.** The DebiCheck application was
declined; a live deployment selects `disabledGateway`, every money operation
refuses, and money is recorded as it is actually received — cash and EFT through
the admin console (`apps/web/integrations/payment/index.ts`).

Findings 1, 2, 3, 4, 9 and 10 are all on the gateway path. They are **real and
dormant**: no code path reaches them today, and every one of them must be closed
before a gateway is ever switched on. Findings 5, 6, 11 and 13 can produce a
wrong outcome **this month**.

---

## Verification summary

| ID | Finding | Auditor severity | Verdict | Live today? |
|---|---|---|---|---|
| A1-F01 | Netcash postback contract does not match the webhook endpoint | P0 | **CONFIRMED** | Dormant |
| A1-F02 | File token used as a transaction reference | P0 | **CONFIRMED, NARROWER** | Dormant |
| A1-F03 | Every member in a batch gets the same client reference | P0/P1 | **CONFIRMED** | Dormant |
| A1-F04 | No `RequestFileUploadReport` consumer | P0 | **CONFIRMED** | Dormant |
| A1-F05 | Two-admin race can remove the last admin | P0 | **CONFIRMED** | **Live** |
| A1-F06 | 50-member cap is not concurrency-safe | P1 | **CONFIRMED** | **Live** |
| A1-F07 | Manual payment idempotency race | P1 | **CONFIRMED, WORSE** | Dormant |
| A1-F08 | Idempotency key optional on money-moving requests | P1 | **CONFIRMED** | Dormant |
| A1-F09 | `PENDING` to `REVERSED` permitted on goal payments | P1 | **CONFIRMED** | Dormant |
| A1-F10 | Mandate update desynchronisation window | P1 | **CONFIRMED, NARROWER** | Dormant |
| A1-F11 | Migration documentation is stale | P1 | **CONFIRMED, WORSE** | **Live** |
| A1-F12 | `DEPLOY_ENV` can make production behave as non-live | P1 | **STALE — do not implement** | n/a |
| A1-F13 | PII entering operational logs | P2 | **CONFIRMED** | **Live** |

Twelve of thirteen stand. One is already fixed.

---

## A1-F01 — Netcash postback contract does not match the webhook endpoint

**Auditor severity:** P0 · **Verdict: CONFIRMED** · **Dormant**

### The finding

The webhook endpoint expects a JSON body with `transactionRef`, `status`,
`mandateId`, authenticated by our own HMAC in `x-netcash-signature`.

Netcash's published DebiCheck contract posts different fields —
`AccountReference`, `ContractReference`, `Process`, `Status`, `RMS`,
`Timestamp`, `type=DEBICHECKRESULT` — and asynchronous batch outcomes arrive
through the **load report**, tab-delimited, retrieved with the file token
returned by `BatchFileUpload`.

The conceptual gap the auditor names is the important part:

> Your system has a gap between *"Netcash accepted my batch upload"* and
> *"this specific member's debit actually succeeded"*.

### Verification

`apps/web/app/api/v1/webhooks/netcash/route.ts` — confirmed exactly as
described:

- `WebhookPayloadSchema` (line 23) requires `mandateId` or `transactionRef` plus
  a `status` drawn from our own enum.
- Line 38: a missing or non-matching `x-netcash-signature` returns **401**
  before the body is interpreted.
- Line 56: the body is `JSON.parse`d; a form-encoded post returns **400**.

A genuine Netcash DebiCheck postback would be rejected at the signature check and
never reach a handler. Nothing in the endpoint can consume
`type=DEBICHECKRESULT`.

### Sources

- [DebiCheck Authentication](https://api.netcash.co.za/inbound-payments/debitcheck-auth-no-netcash-mandate/)
- [Netcash Programmers Guide v2](https://api.netcash.co.za/netcash-programmers-guide-v2/)

---

## A1-F02 — The file token is used as a transaction reference

**Auditor severity:** P0 · **Verdict: CONFIRMED, NARROWER** · **Dormant**

### The finding

`submitScheduledDebit()` uploads a batch, receives a `fileToken`, and the
application stores that value as the transaction's `gatewayRef`. Netcash
documents the file token as *a GUID identifying the report to be retrieved* —
not an individual debit reference.

### Verification

Confirmed literally: `apps/web/lib/netcash.ts:332` returns
`transactionRef: result.fileToken ?? undefined`, and `debit-run.ts` writes that
into `gatewayRef`.

**Where the auditor's description does not hold.** The finding implies the token
is recorded as a settlement. It is not — line 331 returns `status: 'PENDING'`,
and the function's own docstring says why:

> A DebiCheck collection is a batch upload even for one transaction … The
> response is a **file token**, not a settlement … PENDING is the only honest
> status here.

`ENGINEERING_WORKFLOW.md` §4.12 records this as a defect already found and fixed:
*"Recording a token as SUCCESS credits money that has not moved."*

**What remains, and it is the whole finding.** Storing the batch handle in
`gatewayRef` is defensible — it is the only handle the upload returns. The defect
is that **nothing ever exchanges that handle for a per-row outcome**, so the
batch handle is where the trail ends. That is A1-F04, and A1-F02 collapses into
it: the two are one piece of work, not two.

---

## A1-F03 — Every member in the monthly batch gets the same client reference

**Auditor severity:** P0/P1 · **Verdict: CONFIRMED** · **Dormant**

### The finding

The monthly reference is `XXM-2026-09` for every row. Netcash's load report
identifies a failing row by *the unique reference supplied in the transaction
record*, and its response codes include **301 — DuplicateMerchantReference**.

### Verification

`apps/web/inngest/functions/debit-run.ts:202`:

```ts
reference: `XXM-${yearStr}-${monthStr}`,
```

That value becomes the batch row's `accountReference`
(`apps/web/lib/netcash.ts:313` then `batch-file.ts:142`, truncated to 22
characters). Every member in a run therefore carries an identical row reference.

**Why this is worse than a validation risk.** Even if Netcash accepts the batch,
the load report comes back keyed on a reference that is the same for all four
members. *There is no way to attribute an outcome to a member.* A1-F03 and
A1-F04 are the same wound: one is the missing identifier, the other the missing
reader.

**The identifier already exists elsewhere.** `mandate.service.ts:135` builds a
per-member `XXM-${userId.slice(-8).toUpperCase()}`, and goal payments use
`XXM-GOAL-${goalId.slice(-8)}`. The debit run is the path that dropped it.

---

## A1-F04 — No `RequestFileUploadReport` consumer

**Auditor severity:** P0 · **Verdict: CONFIRMED** · **Dormant**

### The finding

The SOAP method is implemented, but nothing consumes the file token and turns a
load report into local state. Submission acknowledgement and financial outcome
are different events and cannot be collapsed into one.

### Verification

Precisely right, and the auditor was careful to distinguish the two halves:

- **Implemented:** `apps/web/lib/netcash/methods.ts:219`
  (`requestFileUploadReport`), wrapped as `fetchBatchReport` at
  `apps/web/lib/netcash.ts:373`. Tested in `netcash-soap.test.ts:288`, including
  the `FILE NOT READY` case.
- **Never called:** a repository-wide search for `fetchBatchReport` returns the
  definition and nothing else. No Inngest function, service or route consumes it.

So the system can ask Netcash for the outcome and never does. A collection would
sit at `PENDING` — correctly, honestly, and forever.

### What the completed chain has to be

```
Mandate created -> authenticated -> collection submitted -> load report received
-> individual debit outcome identified -> local transaction updated
-> contribution recalculated -> ledger updated -> member notified
-> statement correct -> reversal handled -> reconciliation agrees
```

The auditor's stated next step is to exercise that chain against success,
decline, timeout, duplicate callback, delayed callback, **reordered** callback,
partial batch failure, provider outage, database failure and retry.

---

## A1-F05 — Two-admin concurrency can remove the last admin

**Auditor severity:** P0 · **Verdict: CONFIRMED** · **LIVE TODAY**

### The finding

The single-admin case is protected (`SELF_ADMIN_REVOKE`, `LAST_ADMIN`), but the
check is a read followed by a write with no serialisation:

```
Admin A: remove B          Admin B: remove A
  reads adminCount = 2       reads adminCount = 2
  passes  count > 1          passes  count > 1
  deletes B                  deletes A
                -> ADMIN COUNT = 0
```

> Application-level validation is not a concurrency-safe invariant.

### Verification

`apps/web/services/invite.service.ts:527` reads the count via
`userRepo.countUserRoles(...)`, passes it to the pure `refuseRoleChange(...)`
decision at line 540, and the delete happens at line 557
(`userRepo.deleteUserRoles`) — **outside any transaction**, with no row lock and
no re-check. `apps/admin/lib/services/invitations.ts:106` shares the same
decision module and the same shape.

Sharing one rule between the two apps is good work and is not the issue. The
issue is that a correct rule evaluated against a stale read is not an invariant.

**Live today.** This needs no gateway. It needs two admins pressing at once, and
the Foundation is about to add members.

**Related:** admin suspension carries the same shape and needs its own check.

---

## A1-F06 — The 50-member cap is not concurrency-safe

**Auditor severity:** P1 · **Verdict: CONFIRMED** · **LIVE TODAY**

### The finding

> Counting isn't reservation.

Two admins reading `members = 49, pending = 0` both see one place remaining and
both create an invitation — 51 places occupied. The same applies to two pending
invitations accepted concurrently at the boundary.

### Verification

`apps/web/services/invite.service.ts`:

- Lines 159–161 compute `cap` / `remaining` / `isFull` from a count.
- Line 192 throws `MemberCapReachedError` on `places.isFull` — a read, then a
  create, with nothing between them.
- Line 401 is the registration backstop: `if (members >= MAX_MEMBERS) throw` —
  the same shape.

`MAX_MEMBERS = 50` (`packages/utils/src/constants.ts:20`) is surfaced through
`FACTS.memberCap`, so an overshoot also makes a **published fact false**, which
this repository already treats as its own class of defect.

---

## A1-F07 — Manual payments still have an idempotency race

**Auditor severity:** P1 · **Verdict: CONFIRMED, WORSE** · **Dormant**

### The finding

Goal payments claim the intent in the database *before* calling the gateway.
Manual contributions check, then call the gateway, then insert:

```
Request A            Request B
find -> nothing      find -> nothing
   Netcash              Netcash        <- two debits
   create row           create row     <- unique index stops the second row
```

The unique constraint stops the duplicate **record**. It cannot undo a gateway
call that already happened.

### Verification

`apps/web/services/contribution.service.ts` — the order is exactly as reported:
`findByIdempotencyKey` (306), then `submitOnceOffDebit` (321), then
`runTransaction(create)` (344).

**Worse than reported, in a way worth recording.** The comment immediately above
line 306 says:

> The old order called the gateway first and wrote second … This mirrors the
> debit run: check what already exists, **claim**, then submit.

There is no claim. Nothing is written before the gateway call. The comment
describes the intended fix; the code implements only the reordering. A future
reader auditing by comment would tick this off as done.

That makes it two pieces of work — implement the claim, and correct the comment —
and a reminder that **a comment asserting a safety property is not evidence of
one**.

---

## A1-F08 — Idempotency keys should be mandatory on money-moving requests

**Auditor severity:** P1 · **Verdict: CONFIRMED** · **Dormant**

### The finding

`token ?? randomUUID()` means a client that omits a key gets a new identity every
time, so two presses become two payments. Logging it is good; rejecting it is
better. The client should mint one UUID per intended payment.

### Verification

`apps/web/services/contribution.service.ts:289`:

```ts
const clientToken = data.idempotencyKey ?? randomUUID()
```

with the composed key at 290 and the warning log at 292. The history is in the
comment at 275: the key used to be `...:${randomUUID()}` **unconditionally**, so
the column named `idempotencyKey` provided no idempotency at all. The fallback is
what survives of that.

Note the offline path is already safe by construction —
`offline:${userId}:${period}:${reference}` (line 921) has no random component.

---

## A1-F09 — The goal-payment state machine permits an invalid reversal ordering

**Auditor severity:** P1 · **Verdict: CONFIRMED** · **Dormant**

### The finding

`SUCCESS -> REVERSED` is correct. But because the guard is *"terminal and not a
valid reversal"* and `PENDING` is not terminal, `PENDING -> REVERSED` is
permitted. A reordered event can then produce `PENDING -> REVERSED`, after which
the legitimate `SUCCESS` is refused because `REVERSED` is terminal — and the
debit-side unwind never happened, because the payment was never known to have
settled.

### Verification

`apps/web/services/goal-payment.service.ts:276–278`:

```ts
const isReversalOfSettled = payment.status === 'SUCCESS' && newStatus === 'REVERSED'
const terminal = ['SUCCESS', 'REVERSED']
if (terminal.includes(payment.status) && !isReversalOfSettled) return
```

`PENDING` is absent from `terminal`, so the guard does not fire and the update
proceeds. Confirmed.

### The auditor's proposed machine

```
PENDING  -> SUCCESS | FAILED
SUCCESS  -> REVERSED
FAILED   -> SUCCESS   (only if gateway semantics permit)
REVERSED -> (nothing)
```

with a reversal arriving before settlement **stored as a deferred event**, not
applied.

---

## A1-F10 — Mandate updates create a deliberate desynchronisation window

**Auditor severity:** P1 · **Verdict: CONFIRMED, NARROWER** · **Dormant**

### The finding

The local write precedes the Netcash write. If Netcash fails, local says R700
while the mandate authorises R500, and the debit engine reads the local amount.
An alert is raised — better than silence — but the next collection still attempts
the wrong amount and fails.

Proposed: `ACTIVE -> SYNC_PENDING -> ACTIVE`, and **do not collect** while
`SYNC_PENDING`.

### Verification

`apps/web/services/mandate.service.ts:190` (`updateMandate`) writes locally and
then calls `paymentGateway.updateMandate` at line 217. The divergence alert
exists and is documented at line 528.

**Where it needs narrowing — and this matters for implementation.** The same
local-first ordering is shared with `cancelMandate`, where it is a deliberate
safety property, stated at line 530:

> Both `updateMandate` and `cancelMandate` write locally first and tell Netcash
> second — deliberately, so a member who asks to stop being collected from is
> never collected from again by us, whatever the gateway does.

A blanket `SYNC_PENDING` that blocks collection is correct for an **amount
change** and would be *wrong* for a **cancellation**: there, local-first already
fails in the safe direction, and the desired behaviour is exactly "we stop
collecting immediately". The fix has to distinguish the two.

The existing note records a second gap worth carrying: the nightly
`mandate-status-sync` reads only `PENDING`, `ACTIVE` and `SUSPENDED`, so a
cancellation that failed at the gateway is never re-examined by anything.

---

## A1-F11 — Migration documentation is stale

**Auditor severity:** P1 · **Verdict: CONFIRMED, WORSE** · **LIVE TODAY**

### The finding

45 migration directories; documentation still says "applies ALL 37 migrations".
Not a runtime bug — documentation drift, which a financial system should not
carry around its deployment state.

### Verification

Confirmed, and the drift is larger than reported: there are **50** migration
directories in `packages/database/prisma/migrations`, against `DEPLOYMENT.md:128`
claiming 37.

The auditor's read of the runner is right, and is better than the documentation
describing it:

```
Vercel -> production check -> DIRECT_DATABASE_URL -> prisma migrate deploy
       -> build fails if migration fails
```

**Implementation note:** replacing 37 with 50 reintroduces the same defect on a
timer. The number should be generated or removed. This repository already has the
pattern — `FACTS` in `packages/utils` is the single source for stated claims,
with tests that refuse hard-coded values.

---

## A1-F12 — `DEPLOY_ENV` can make production behave as non-live

**Auditor severity:** P1 · **Verdict: STALE — DO NOT IMPLEMENT**

### The finding

Live configuration resolved `DEPLOY_ENV` then `VERCEL_ENV` then `NODE_ENV`, first
defined value winning, so `VERCEL_ENV=production` with `DEPLOY_ENV=staging`
yielded `LIVE = false`. Production could be deployed while the application did
not consider itself production.

### Why it is stale

**The incident was real.** It is the phantom-payment incident: the guard refusing
the mock gateway on a live deployment depended on the app knowing it was live,
production had `DEPLOY_ENV` set to a non-live value, the mock was selected in
production and answered `SUCCESS` to every debit. A member paid R100, a settled
transaction was written, the pool was credited, the contribution was marked paid,
and **no bank was ever contacted**.

**It is fixed at the root.** `packages/utils/src/deployment.ts`:

```ts
export function isLiveDeployment(env = process.env): boolean {
  // First, and unconditional. Nothing a person can set may contradict it.
  if (env.VERCEL_ENV === 'production') return true

  const deployEnv = env.DEPLOY_ENV
  if (deployEnv) return deployEnv === 'production'
  // ...
}
```

A declaration may now *tighten* what the platform says and can never loosen it —
which is the auditor's own recommendation, already implemented. The exact
scenario in the finding now returns `true`.

**It is pinned.** `packages/utils/__tests__/deployment.test.ts:32` asserts
`DEPLOY_ENV=production, VERCEL_ENV=preview` is live, and lines 39–57 iterate
every declared value asserting *"DEPLOY_ENV=&lt;x&gt; must not hide a production
deployment"*.

**And it is defended twice.** `integrations/payment/index.ts` no longer relies on
that boolean alone: a live deployment with no real gateway selects
`disabledGateway` rather than throwing at module load, so the failure mode is a
refusal on the money path rather than a whole app that will not start.

The auditor most likely read the deployment documentation, which still described
the old order. **That documentation is the residual defect** — the same class as
A1-F11, and the only work this finding generates.

---

## A1-F13 — PII is entering operational logs

**Auditor severity:** P2 · **Verdict: CONFIRMED** · **LIVE TODAY**

### The finding

Invitation creation logs `email` alongside `adminId`; audit payloads carry contact
information. Not an exploit — data minimisation and observability hygiene, for a
system holding ID numbers, banking details, phone numbers and financial history.
Prefer `inviteId` / `userId` over `email` / `phone` unless the operational task
genuinely needs the contact detail.

### Verification

`apps/web/services/invite.service.ts:253` — the auditor's example, verbatim:

```ts
logger.info('Invite created', { inviteId: invite.id, email, adminId })
```

`setMemberRole` writes `payload: { role: roleName, email: member.email }` into the
audit log (`invite.service.ts:568`). Others to review:
`member.service.ts:183`, `invite.service.ts:461`,
`app/api/v1/auth/resend-verification/route.ts:51`.

**Scope note for implementation.** Audit-log payloads are not the same case as
application logs: an audit record is a legal artefact, and POPIA's minimisation
principle has to be weighed against the accountability requirement that the record
identify who was affected. The two need deciding separately, not with one sweep.
The auditor's own framing — *"unless the actual operational task requires the
contact information"* — is the right test.

---

## What the audit checked and endorsed

Recorded because a later reader should not "fix" these, and because knowing what
was examined and passed is half of what an audit is for.

**Authentication** — bcrypt cost 12; decoy hash for nonexistent users; account
lockout; atomic failed-attempt increment; password reset token hashing; atomic
token consumption; role-version invalidation; short admin sessions; separate admin
authentication; generic reset responses; verification recovery. Described as
*"serious authentication engineering"*.

**Authorization** — `assertCanAccess()` and `assertAdmin()` used throughout the
service layer rather than relying on frontend route protection.

**Database** — unique contribution per member/period; unique transaction
idempotency keys; indexes on financial state; immutable-style ledger entries;
reversal relationships; optimistic versions; partial unique indexes; goal-plan
uniqueness; webhook deduplication. *"One of the strongest parts of the project."*

**Ledger** — append-only `CREDIT`/`DEBIT` with `(refType, refId, direction)` for
idempotency, and reconciliation built around it:

> Don't silently rewrite history to make the number look right. Correct history
> by adding a new event.

**Concurrency (goal payments)** — `goal-payment-race.test.ts` models
`Request A || Request B` and asserts the gateway was called once. The auditor's
note that its sibling path is still weaker (A1-F07) *is* the argument for
independent review.

---

## The auditor's thesis

Worth stating separately, because it is more useful than any single finding:

> The biggest remaining risk isn't "there's no security". The remaining risk is
> **inconsistent guarantees between different paths that should provide the same
> guarantee.**

| Guarantee | Strong path | Weak path |
|---|---|---|
| Idempotency before gateway | goal payment — claim first | manual payment — check first (A1-F07) |
| Webhook state transition | contribution — compare-and-set | goal payment — blind update (A1-F09) |
| Last-admin invariant | single-admin case protected | multi-admin not serialised (A1-F05) |
| Member cap | carefully checked | not atomically reserved (A1-F06) |
| Netcash | adapter exists | async result lifecycle unconnected (A1-F01–F04) |

This matches a lesson already recorded in `ENGINEERING_WORKFLOW.md` §4.6, where
the same defect was found in four separate places because each was fixed where it
was found rather than where it lived.

---

## Launch verdict as delivered

| Area | Verdict |
|---|---|
| Application architecture | Strong |
| Authentication | Strong |
| Authorization | Strong, concurrency corrections required |
| Database design | Strong |
| Ledger | Strong architecture |
| Internal payment state machine | Needs further hardening |
| Netcash integration | **Not yet production certifiable** |
| Real-money collection | **Do not enable yet** |

Consistent with our own position: there is no gateway, and enabling one is a
future decision rather than a pending one. The auditor's proposal that the
eventual Netcash approval/test phase be treated as an **integration certification
phase** rather than "does the API return 200?" is adopted.

---

## Open questions for the next pass

1. The auditor could not run the suite. Our 2026-09-04 sweep measured 2,154 tests
   green across 9 workspaces — offer that rather than leave the gap.
2. A1-F05's suspension sibling is asserted but was not shown; it needs its own
   verification before it is scheduled.
3. "Audit payloads contain contact information" (A1-F13) is broader than the one
   call site confirmed. A full inventory is part of the work, not a precondition
   for starting it.
