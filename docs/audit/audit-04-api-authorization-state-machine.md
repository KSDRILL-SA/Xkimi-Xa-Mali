# Audit 4 — API, authorisation, and state-machine attack

**Received:** 2026-09-04 · **Findings:** 45–57 (13) · **Status:** documented and answered; not yet scheduled

## What this audit is

The *"assume the user is malicious"* pass. It differs in kind from rounds 1–3:
most of these are **not reported defects**. They are attack hypotheses the
auditor states and explicitly declines to confirm —

> **Status: Audit continues — not yet calling this a confirmed vulnerability.**

That is the honest way to file an unfinished hunt, and it changes our job. Where
earlier rounds needed a defect verified, this round needs a **question answered**
from code the auditor could not fully read. Most of them can be.

### Result

**Eleven of thirteen hypotheses do not hold.** The mechanisms the auditor hoped
to find are present, and in several cases stronger than asked for.

**One is a real defect** (A4-F46, existence leakage — and inconsistently, which
is this codebase's signature failure).

**One needs a policy decision** (A4-F56) and one is a rediscovery (A4-F50).

One answer is a **deliberate disagreement** rather than a pass or a fail
(A4-F54), and it is recorded as such.

### Limits of this verification

This is a spot check against the highest-value paths — money routes, the
reversal route, mandate and goal-plan services, the shared schemas — **not an
exhaustive sweep of all 92 route files**. Where a finding is marked "holds", it
holds on the paths named. A full per-route sweep is real work and belongs in the
implementation plan, not in a claim made here.

---

## Verification summary

| ID | Hypothesis | Verdict |
|---|---|---|
| A4-F45 | IDOR / BOLA on object-id endpoints | **Holds — no leak found on paths checked** |
| A4-F46 | Authorisation leaks object existence | **DEFECT — confirmed and inconsistent** |
| A4-F47 | Admin authz checked at page, not mutation | **Holds — checked at the mutation** |
| A4-F48 | Suspension is not a complete financial kill switch | **Holds — it is** |
| A4-F49 | Revoked admin retains authorisation via JWT | **Holds — role version invalidates** |
| A4-F50 | Role/status changes need concurrency protection | **CONFIRMED — duplicate of A1-F05 / A2-F26** |
| A4-F51 | Client-controlled ownership fields accepted | **Holds — identity comes from the session** |
| A4-F52 | Amount tampering | **Holds — bounded server-side** |
| A4-F53 | Negative / zero / NaN / huge amounts | **Holds — bounded server-side** |
| A4-F54 | Float arithmetic in the financial core | **Divergence — documented contract, deliberate** |
| A4-F55 | Contribution period manipulation | **Partly holds — bounded, but no closed-period concept** |
| A4-F56 | Duplicate contribution vs duplicate payment | **OPEN — needs a policy decision** |
| A4-F57 | Reversal authorisation | **Holds — strongly** |

---

## A4-F45 — IDOR / BOLA

**Verdict: holds on the paths checked**

### The hypothesis

For any endpoint taking `memberId`, `goalId`, `transactionId`, `mandateId`,
`planId`, `contributionId` or `notificationId`, does the server prove
entitlement, or merely authenticate? The dangerous pattern:

```ts
const goal = await goalRepo.findById(goalId)
if (!goal) …          // and nothing proves goal.userId === session.user.id
```

The auditor explicitly refuses to pass the system merely because
`assertCanAccess()` exists.

### What was checked

`apps/web/lib/authorization.ts:24`:

```ts
export function assertCanAccess(targetUserId: string, requesterId: string, requesterRoles: string[]): void {
  if (targetUserId !== requesterId && !isAdmin(requesterRoles)) {
    throw new ForbiddenError('Access denied')
  }
}
```

Called in nine services — `mandate` (8 sites), `member` (7), `budget` (6),
`contribution` (6), `goal-plan` (6), `report` (3), `badge` (2), `insights` (2),
`goal-payment` (2) — and in every case **after** the object is loaded and
**against the loaded object's own `userId`**, not against a value from the
request.

Routes pass the session as both subject and requester rather than reading
identity from the body — `apps/web/app/api/v1/goals/[id]/pay/route.ts:37`:

```ts
const result = await payToGoal(id, session.user.id, session.user.id, session.user.roles ?? [], …)
```

No instance of the dangerous pattern was found on the paths examined.

**Not a clean bill of health.** Thirteen of ninety-two route files were read. The
finding to carry is not a defect but a task: **a per-route sweep asserting that
every object-id endpoint reaches a service that calls `assertCanAccess` against
the loaded row.** That is exactly the sort of thing a test can hold permanently,
and this repository already writes tests of that shape (`services.authz.test.ts`
refuses to let a new admin service go unregistered).

---

## A4-F46 — Authorisation leaks object existence

**Verdict: DEFECT — confirmed, and inconsistent** · **LIVE TODAY**

### The finding

```
404 -> doesn't exist
403 -> exists but forbidden
```

A member can enumerate ids and tell the difference. For financial objects the
safe default is that an unauthorised object is indistinguishable from a
nonexistent one.

### Verification — confirmed, and the codebase does it both ways

**Leaks** — load, 404 if absent, *then* authorise:

| File | Line |
|---|---|
| `mandate.service.ts` | 82, 198, 270, 331 |
| `contribution.service.ts` | 116 |

```ts
if (!mandate) throw new MandateNotFoundError()
assertCanAccess(mandate.userId, requesterId, requesterRoles)
```

Absent gives 404; someone else's gives 403. Distinguishable.

**Does not leak** — one combined check, one answer:

| File | Line |
|---|---|
| `goal-plan.service.ts` | 179, 354 |
| `mandate.service.ts` | 116 (bank accounts) |

```ts
if (!plan || plan.userId !== userId) throw new GoalNotFoundError()
```

**The sharpest detail: both patterns live in `mandate.service.ts`.** Bank
accounts — the most sensitive objects in the system — use the safe form at line
116. Mandates, four times in the same file, use the leaky one.

So this is not an oversight about a principle nobody knew. The safe pattern was
written, in that file, by someone who understood it. It simply was not applied
uniformly — the exact failure mode the auditor named in Round 1 and this
codebase keeps rediscovering.

### Severity, stated honestly

Real but modest. Ids are `cuid()`, so enumeration is not practical; what leaks is
confirmation for an id already obtained, and the group is fifty people who know
each other. It is a **P2 that is cheap to fix and belongs in the same pass as the
A4-F45 sweep** — both are "make every object-id path agree", and doing them
together costs barely more than doing either.

---

## A4-F47 — Admin authorisation at the mutation, not the page

**Verdict: holds**

### The hypothesis

A UI that hides "Suspend member" proves nothing; the attacker calls the endpoint.
The invariant must be: request → authentication → **current DB role/status** →
authorisation → business invariant → mutation.

### Verification

Holds on the most consequential mutation in the system.
`apps/web/app/api/v1/admin/transactions/[id]/reverse/route.ts` does not trust the
console's own check, and says why:

> The console has already run `requireAdmin`, but this route's promise is that
> the history can be retraced years later — and an actor nobody checked is not
> that. It also closes the window where an admin is demoted between the console's
> check and this one.

`resolveInternalAdmin(req)` confirms the acting admin **against the database**,
and a caller that names nobody is refused with 400 rather than recorded as
"system". The route also requires a reason of at least ten characters, because
*"oops retraces nothing"*.

Authorisation is at the mutation, and it is re-derived rather than inherited.

---

## A4-F48 — Suspension as a complete financial kill switch

**Verdict: holds**

### The hypothesis

The dangerous scenario: an admin believes suspension means "stop everything",
while the scheduler keeps collecting.

### Verification — the scheduler was the thing to check, and it checks

`apps/web/inngest/functions/debit-run.ts:88`:

```ts
const processableMandates = mandates.filter(
  (mandate) => mandate.user.status === 'ACTIVE' && !!mandate.netcashMandateId,
)
```

A suspended member is not collected from. The same filter appears at
`contribution.service.ts:841` and `:1182`, and
`debit-overdue-reminder.ts:17` — so a suspended member is not chased for money
either, which matters as much and is easier to forget.

Login is refused at `apps/web/lib/auth.ts:159`
(`throw new Error('ACCOUNT_SUSPENDED')`), and existing sessions do not survive:
changing status bumps `roleVersion`, and a stale role version invalidates the
session (line 193).

The auditor's table is answered:

| Operation | Suspended member | Enforced at |
|---|---|---|
| Login | refused | `auth.ts:159` |
| Existing session | invalidated | `roleVersion` bump |
| Scheduled existing debit | **not collected** | `debit-run.ts:88` |
| Overdue chasing | not sent | `debit-overdue-reminder.ts:17` |
| View historical records | via session, which is gone | — |

What is **not** written down is the policy itself. The behaviour is correct and
distributed across four files; there is no single statement a future change can
be checked against. That is a documentation item, not a defect — and it is what
turned A2-F16 from "correct today" into an open question.

---

## A4-F49 — Revoked admin loses authorisation immediately

**Verdict: holds**

`roleVersion` is seeded into the session (`auth.ts:183`) and a stale value
invalidates it. The reversal route independently re-resolves the acting admin
from the database, which closes the demotion window even for the trusted
server-to-server path.

The auditor's condition is the right one and is worth keeping as a test rather
than a belief:

> If even **one** route trusts `session.user.role` without resolving current
> authorisation state, you've got a privilege-retention hole.

Same shape as A4-F45: the mechanism is right, and what is missing is a pin that
refuses a new route which skips it. Fold into the same sweep.

---

## A4-F50 — Role and status changes need concurrency protection

**Verdict: CONFIRMED — duplicate of A1-F05 and A2-F26**

The auditor connects the two paths they found separately and lands exactly where
our A2-F26 entry did:

> This isn't an API authentication problem. It's a **database invariant
> problem.** So the final fix belongs below the HTTP layer.

Agreed and already recorded. **Do not schedule separately.** The one thing this
adds is the framing for the fix: authorisation **plus** a serialisable
transaction or lock **plus** a database invariant — three layers, not a better
check in one of them.

---

## A4-F51 — Client-controlled ownership fields

**Verdict: holds**

### The hypothesis

```json
{ "userId": "someone-else", "amount": 100, "goalId": "…" }
```

The server must derive identity from the session, never from the body.

### Verification

A search of every route schema for a body-supplied `userId`, `memberId` or
`ownerId` returns **two occurrences, both in
`apps/web/app/api/v1/admin/distinctions/route.ts`** — an admin conferring a
distinction on a named member, which is the auditor's own stated exception
("unless that operation is explicitly an authorized admin action").

Every money route derives identity from `session.user.id`. The goal payment route
passes it twice, as both subject and requester, so the service's
`assertCanAccess` compares the session against itself and the body cannot reach
it.

---

## A4-F52 and A4-F53 — Amount tampering, and negative-value attacks

**Verdict: holds — bounded server-side, in shared schemas**

The auditor's list — `0`, negative, decimal precision, `NaN`, `Infinity`, huge
integer, huge decimal, scientific notation, string number, `null`, missing — is
answered by `packages/utils/src/schemas.ts`, which every money route parses
through before the service is reached:

| Path | Bound |
|---|---|
| Mandate creation | `min(100)` `max(10_000)` |
| Mandate update | `min(100)` `max(10_000)`, `debitDay int 1–28` |
| Manual contribution | `positive()` `max(10_000)` |
| Offline contribution | `positive()` `max(MAX_CONTRIBUTION_ZAR)` |
| Goal payment | `min(MIN_GOAL_PAYMENT = 50)`, capped |
| Goal progress | `min(1)` `max(10_000_000)` |

`z.number()` rejects strings, `null` and `NaN` outright; `.positive()` /
`.min()` reject zero and negatives; `.max()` rejects `Infinity` and any huge
value. The bounds are **shared constants** (`MIN_CONTRIBUTION_ZAR`,
`MAX_CONTRIBUTION_ZAR`, `MIN_GOAL_PAYMENT`) rather than literals repeated per
route, so the ceiling cannot drift between paths.

The auditor's principle — *validate the monetary domain before entering the
transaction service* — is the architecture in place.

One incidental observation: `UpdateMandateSchema` caps `debitDay` at **28**,
while `getNextDebitDate` accepts 1–31 (A3-F35). The schema is the stricter of the
two and is what a member's request passes through — which narrows A3-F35's reach
without closing it, since mandate *creation* and internal callers may not share
that bound.

---

## A4-F54 — Decimal arithmetic in the financial core

**Verdict: a documented, deliberate divergence — not a defect, and not a pass**

### The recommendation

> Monetary calculations should remain decimal/integer-cent based all the way
> through: request → validation → database → gateway → ledger → reconciliation.
> The UI can format values however it likes. The financial core shouldn't.

### What the code actually does

`apps/web/lib/money.ts` opens with an explicit contract that considered this
question and answered it differently:

> Source of truth for money is the database: `DECIMAL(12,2)`/`(10,2)` columns and
> Postgres-side aggregation (`_sum`), both of which are exact. Money crosses into
> JavaScript as a `number` only at the service boundary … The one real hazard is
> *chained* JS arithmetic accumulating float dust. To make that impossible, every
> money arithmetic operation in JS MUST go through these helpers, which round each
> result back to 2 decimal places deterministically.
>
> Rule of thumb: never write `a + b`, `a - b`, or `x * n` on rand amounts
> directly — use `sumZAR` / `subtractZAR` / `roundZAR`. Aggregation of many rows
> still belongs in the database (`_sum`), not a JS reduce.

So the auditor's specific fear — `0.1 + 0.2` in the financial path — is
prohibited by name. Storage is exact decimal, aggregation is exact and
server-side, and the JS window is bounded and forced through rounding helpers.
The gateway boundary converts to integer cents (`toCents`), which is where the
auditor most wants integers and where they are used.

**Where it genuinely diverges:** the contract accepts IEEE-754 doubles for the
in-service window on the reasoning that every 2-decimal rand value in range is
exactly representable, rather than carrying `Prisma.Decimal` or integer cents end
to end. That is a real difference from the recommendation, and it rests on a
discipline (*always use the helpers*) rather than on a type that makes the
mistake impossible.

**Recorded as a disagreement, with one piece of work either way:** the discipline
is currently held by a comment. If the contract stands — and the reasoning is
sound — it should be held by a lint rule or test that refuses raw `+`/`-` on
money-typed values, the way `contributions-motion-policy.test.ts` holds the
animation rule. A convention that only a comment enforces is the thing this audit
has caught twice already (A1-F07, A3-F33).

---

## A4-F55 — Contribution period manipulation

**Verdict: partly holds — bounded, but there is no closed-period concept**

`packages/utils/src/schemas.ts:167`:

```ts
periodMonth: z.number().int().min(1).max(12),
periodYear:  z.number().int().min(2024).max(new Date().getFullYear() + 1,
               'Cannot pay for periods too far in the future'),
```

So `2027-04` is refused today, and a garbage month is refused. Duplicate
settlement of a period is prevented separately by the unique contribution per
`(userId, periodMonth, periodYear)` and by the idempotency key.

**What is not modelled is the auditor's actual question.** They ask the server to
establish whether a requested period is *current, an allowed late period, already
settled, closed, or future*. Today the answer is a range check: anything from
2024 to next year is equally acceptable. Paying ahead is plausibly legitimate for
a stokvel and paying late certainly is — but nothing distinguishes them, and
nothing can close a period after the group has reconciled it.

Modest, and it becomes less modest the moment statements or payouts depend on a
period being final. Carry as a design item with A2-F17's ledger matrix — both are
"which financial states are closed, and what may still write to them".

---

## A4-F56 — Duplicate contribution is not duplicate payment

**Verdict: OPEN — needs a policy decision** · **LIVE TODAY**

### The finding

One contribution for September can have two `SUCCESS` payments against it. The
system must define which of these it means:

1. the second payment is rejected,
2. it becomes credit toward a future period,
3. it is refunded,
4. it stands as an overpayment.

> You should never let this be an accidental consequence of database uniqueness.

### Why this is open rather than answered

Today it is decided by mechanism rather than by policy: the idempotency key
prevents an accidental *repeat* of the same intent, and
`recalculateContributionStatus` derives status from the sum — so a genuine second
payment is accepted and the contribution is simply over-settled. Which of the
four options that amounts to has never been written down.

**Live today and reachable today**, because offline recording is how all money
enters: an admin banking a member's cash twice, or two admins recording the same
handover, produces exactly this. The offline idempotency key is
`offline:${userId}:${period}:${reference}` — so two recordings with *different*
references both succeed, by design, since two genuine payments in a month must be
recordable.

This is a leadership question, not an engineering one, and it joins A2-F16 (may
the pool go negative?) on the list of decisions that must precede their
implementations.

---

## A4-F57 — Reversal authorisation

**Verdict: holds — strongly**

The required chain is enforced: only a `SUCCESS` transaction may be reversed, the
reversal is admin-only, the acting admin is confirmed against the database rather
than believed (A4-F47), a reason of at least ten characters is required, and the
ledger's `(refType, refId, direction)` uniqueness makes a repeated reversal a
no-op rather than a second debit.

The auditor's *"any authenticated member POSTs /reverse"* is refused at the
route; *"already REVERSED, reverse again"* is refused by both the state check and
the ledger constraint.

---

## The endorsement, restated

Webhook deduplication (`ProcessedWebhookEvent`, `UNIQUE(source, eventKey)`, with
claim/release) is endorsed again — already recorded as A2-F33 — together with the
distinction that matters:

> **deduplication and state CAS solve different problems.**

That single sentence is the clearest statement of A2-F14 anyone has made. Dedupe
stops the same event twice; CAS stops two different events racing. The
goal-payment path has the first and not the second.

---

## The auditor's verdict on Round 4

> The architecture is holding up surprisingly well. The dangerous findings aren't
> "everything is insecure." They're mostly: **the system has the right security
> mechanisms, but some paths don't enforce the same invariants consistently.**

Our verification is more favourable still — eleven of thirteen hypotheses did not
hold, and the one real defect (A4-F46) is that same inconsistency in miniature,
with the safe and unsafe patterns four lines apart in one file.

### Their launch rule, mapped

The auditor would not approve a first real collection until twelve items close.
Every one is already recorded:

| # | Item | Recorded as |
|---|---|---|
| 1 | Load-report → transaction mapping | A1-F04, A2-F22, A3-F38 |
| 2 | Unique provider reference | A1-F03, A2-F23, A3-F39 |
| 3 | File token vs transaction reference | A1-F02, A2-F20, A3-F37 |
| 4 | Verify the real postback contract | A1-F01, A2-F31 |
| 5 | `PENDING` / `UNKNOWN` handling | A2-F19, A3-F36 |
| 6 | Debit scheduler race | A2-F18 |
| 7 | Manual-payment race | A1-F07 |
| 8 | Goal-payment CAS | A2-F14 |
| 9 | Last-admin invariant | A1-F05, A2-F26, A4-F50 |
| 10 | Member-cap concurrency | A1-F06, A2-F27 |
| 11 | Mandate update/cancel synchronisation | A1-F10, A2-F24, A2-F25 |
| 12 | Debit-day / delay correctness | A3-F33, A3-F34, A3-F35 |

**Ten of the twelve require a gateway that does not exist.** Items 9 and 10 do
not, and both are live today.

---

## Announced for Round 5

> Reconciliation + notifications + privacy/data deletion + month-end/date
> boundaries + failure injection + deployment/build/test verification.

Specifically: provider succeeds but the app dies; app succeeds but the provider
times out; a duplicate webhook during a reversal; a scheduler crash mid-batch;
February against a 31st debit day; a commit at exactly the wrong moment.

Three of those already have entries — the timeout case is A2-F19, the February
case is A3-F35, and mid-batch crash recovery is what A2-F22's `BatchSubmission`
exists to make possible. The privacy and deletion work should be offered from
`docs/compliance/` rather than rediscovered.

---

## Open questions carried forward

| # | Question | Owner | From |
|---|---|---|---|
| 1 | May the pool balance go negative? | leadership | A2-F16 |
| 2 | What does a second payment against a settled period mean? | leadership | **A4-F56 (new)** |
| 3 | Is "last day of month" a first-class debit day? | product | A3-F35 |
| 4 | Is `TRUSTED_PROXY` set in production? | ops | A2-F30 |
| 5 | The auditor has still not run the suite (ours: 2,154 green) | — | A1 |
