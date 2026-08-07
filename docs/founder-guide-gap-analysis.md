# Founder Guide — Gap Analysis & Implementation Plan

**Source of truth:** `Xkimm-Xa-Mali-Foundation-Founder-Guide (1).pdf` (repository root, untracked).
**Analysed:** 2026-08-07, against `Dev` @ `671ddb5`.
**Status of this document:** The Founder Guide is the specification. Where the
system and the guide disagree, **the system is wrong and must be changed.** The
guide is going to four co-founders who will sign against it.

---

## 0. How to read this

Every gap below is stated three ways:

1. **What the guide promises** — quoted, so the wording is not paraphrased away.
2. **What the system actually does** — with `file:line` evidence you can re-check.
3. **How to close it** — concretely, including which existing pattern to follow.

Nothing here is speculative. Each gap was confirmed by reading the code, not by
searching for a keyword and assuming.

**Before starting anything, read `ENGINEERING_WORKFLOW.md`.** It carries the
engineering rules, the audit history, and several traps specific to this
repository that will cost you hours otherwise (§4.4 dependency overrides, §4.6
the money-path defect pattern, §4.7 orphaned npm processes, §4.8 template
propagation).

---

## 1. Baseline — what is already true

Do not rebuild any of this. It exists, it matches the guide, and most of it is
tested.

| Guide claim | Implementation |
|---|---|
| Badge scoring 40/35/15/10 | `apps/web/services/badge.service.ts:87` — exact |
| Four badge tiers and their thresholds | `badge.service.ts:108-130` — all three gates exact |
| Budget ceiling Monthly / Yearly / Custom | `schema.prisma:111` `enum BudgetType` |
| Budget Guard logs attempt, ceiling, reason | `services/budget.service.ts:92-102` |
| Goal states Draft/Active/Achieved/Failed | `schema.prisma:70` `enum GoalStatus` |
| Goal pledges | `schema.prisma:535` `model GoalPledge` |
| Community board, ten posts a day | `services/community.service.ts:16` |
| Pin / remove a message | `api/v1/admin/community/messages/[id]/pin` |
| Four channels SMS/email/WhatsApp/in-app | `schema.prisma:77` `enum NotifChannel` |
| Invitation bound to one named person, single-use | `schema.prisma:673` — `codeHash` unique, `acceptedById` unique |
| Revoke an invitation | `admin/lib/services/invitations.ts:24` |
| R100 minimum | `packages/utils/src/constants.ts` `MIN_CONTRIBUTION_ZAR` |
| Collection fee added to the debit | `lib/group-account.ts` `debitAmountWithFee` |
| Signed statements, every past signature kept | `schema.prisma:854,870` + `lib/pdf/statement.tsx:199` |
| Suspension blocks sign-in immediately | `lib/auth.ts:56` + role-version invalidation |
| Bank details / ID reachable only by self or leadership | `services/member.service.ts:38` `assertCanAccess` |
| Permanent log: who, record, where, when | `schema.prisma:652` `model AuditLog` |
| Approve / reject a mandate | `admin/lib/services/mandates.ts:34,54` |
| Reports across the Foundation | `apps/admin/app/(dashboard)/reports` |
| No screen moves money out of the pool | Correctly absent — verified, keep it that way |
| 18 background jobs | `apps/web/inngest/functions/` |

**Current health of `Dev`:** typecheck 0 · lint 0 · test 0 (840) · build 0 (3/3)
· `npm audit` 0 vulnerabilities.

---

## 2. The gaps, in priority order

### GAP-1 — Reversing a mistaken transaction (CRITICAL)

**The guide promises it three times.** In the capability table:

> | Reverse a mistaken transaction | A member: No | Leadership: **Yes** |

And twice as a principle:

> "A mistake is never quietly deleted. It is corrected by adding a visible
> reversing entry, so the full history stays honest and any of us can retrace
> exactly what happened, years later."

> "A payment is recorded wrongly → It is corrected by a visible reversing entry,
> never a deletion. Raise it with any leader and the full trail can be retraced."

**What exists.** Everything except the action itself:

- `TransactionStatus.REVERSED` and `TransactionType.REVERSAL` — `schema.prisma`
- `ledger.service.ts:150,156` already reconciles reversed transactions and
  reversed goal payments into the pool balance
- The member transactions screen renders both — `dashboard/transactions/page.tsx:24,30`

**What is missing.** There is **no admin service function, no API route and no
UI** that performs a reversal. Confirmed by searching the whole tree for
`revers` — every hit is a comment, a type, or a display label.

**How to build it.**

1. `apps/admin/lib/services/contributions.ts` — add
   `reverseTransaction(adminId, adminRoles, transactionId, reason, ip)`.
   - Gate with `assertAdmin` and go through `requireAdmin` at the action layer
     (`admin-action.ts`) so the role-version staleness check runs — this moves
     money, so it must not be reachable by a demoted admin.
   - **Never mutate the original row's amount.** Set the original to `REVERSED`
     and insert a *new* `Transaction` of type `REVERSAL` with the negated amount
     and a `reason`. That is what the guide means by "a visible reversing entry".
   - Wrap both writes in `db.$transaction`.
   - Call `recalculateContributionStatus(contributionId, tx)` inside it.
   - `writeAuditLog({ action: 'TRANSACTION_REVERSED', entity: 'Transaction',
     entityId, payload: { reason, originalAmount }, ipAddress })`.
   - Notify the member. A reversal changes what they were told they paid.
2. Route: `apps/web/app/api/v1/admin/transactions/[id]/reverse/route.ts`,
   Zod-validated, `withApiHandler`.
3. UI: a confirm-guarded action on the admin contributions screen. Use
   `ConfirmSubmitButton` — it exists for exactly this class of action.
4. **Reason is mandatory.** A reversal with no stated reason defeats the point.

**Tests.** Follow the money-path seam pattern (see `ENGINEERING_WORKFLOW.md`
§4.6). At minimum: the original is not edited; a REVERSAL row is created with
the negated amount; the contribution status is recalculated; the ledger balance
returns to its pre-transaction value; a non-admin is refused; a stale admin
session is refused; an already-REVERSED transaction cannot be reversed twice.

---

### GAP-2 — A member cannot propose a Goal (HIGH)

**The guide:**

> "**1 A member proposes it** — With a clear purpose and an amount, for example
> 'R15,000 for equipment for a family catering business.'"
>
> "**2 Leadership reviews it** — For feasibility, for alignment with our values,
> and for genuine benefit to the circle."

**What the system does.** `apps/web/services/goal.service.ts:262-269` —
`createGoal` calls `assertAdmin(roles)`. Only leadership can create a Goal.
Members can pledge and comment, but the six-step flow starts with something
they cannot do.

**How to close it.** The `DRAFT` state already models "proposed but not
approved", and `activateGoal` (`admin/lib/services/goals.ts:87`) already models
leadership approval. The flow is nearly there — what is missing is a member
entry point.

1. Add `proposeGoal(input, userId, roles, ip)` to `goal.service.ts` — any
   authenticated member, creating with `status: 'DRAFT'` and
   `createdById: userId`.
2. Keep `createGoal` (admin) as it is; it is the leadership path.
3. Add `proposedBy` visibility so leadership can see who proposed it. The
   existing `createdById` may be sufficient — check before adding a column.
4. Notify leadership on proposal — `notifyAdmins` from
   `services/inbox.service.ts` is the established helper.
5. Notify the proposer on approval or rejection.
6. Rate-limit proposals. `lib/redis.ts` already exports per-action limiters;
   add one rather than inventing a mechanism.
7. Member UI: a "Propose a Goal" form on `dashboard/goals`.

**Decide before building:** whether a rejected proposal is deleted or kept in a
`REJECTED` state. The guide's transparency principle argues for keeping it —
but that is a fifth `GoalStatus` value and a migration, so raise it with the
founders rather than deciding it in code.

---

### GAP-3 — A Goal's outcome is never documented (HIGH)

**The guide:**

> "**6 The outcome is documented** — The purchase is shown back to the circle.
> Everyone sees what their money actually did."

This is described as the closing act of the whole Goal cycle, and as the moment
the Foundation proves itself:

> "**4 The first Goal — THE REAL PROOF.** One real Goal proposed, funded, paid
> and documented back to the circle."

**What the system does.** Nothing. `model Goal` has no field for an outcome,
proof, receipt or photograph. There is no upload, no display, no admin action.

**How to build it.**

1. Migration — add to `model Goal`: `outcomeNote String?`,
   `outcomeProofUrl String?`, `outcomeRecordedAt DateTime?`,
   `outcomeRecordedById String?`. Additive only, per the repository rule.
2. Admin action `recordGoalOutcome(adminId, roles, goalId, note, proofUrl, ip)`
   — permitted only on an `ACHIEVED` goal. Audit-logged.
3. Proof upload: reuse the existing Vercel Blob adapter
   (`integrations/storage/vercel-blob.adapter.ts`) — the signature-storage path
   in the admin app is the pattern to copy.
4. Display the outcome on the member Goal detail page. This is the part the
   members actually see, and it is the point of the feature.
5. Notify the circle when an outcome is recorded.

---

### GAP-4 — Nobody is told when a Goal fails (MEDIUM)

**The guide:**

> "You are told when … **A Goal you care about has news**"
>
> "A Goal fails to reach target → It is marked Failed and no funds are released."

**What the system does.** `inngest/functions/goal-deadline-checker.ts` calls
`markExpiredGoalsFailed()` and returns a count. **It sends nothing.** A Goal the
circle pledged toward is silently marked Failed overnight.

By contrast `goal-achieved.ts` does notify, via
`celebrateGoalAchieved()` → inbox.

**How to close it.** In `goal-deadline-checker`, for each expired goal, notify
the members who pledged to it (and optionally the whole circle). Seed a
`goal-failed` template alongside the existing goal templates. **Read §4.8 of
`ENGINEERING_WORKFLOW.md` first** — a new template reaches an existing database
only because it is new; a *changed* body would not.

---

### GAP-5 — "A statement is ready" reaches only the in-app inbox (MEDIUM)

**The guide** lists statement-ready among the things you are told, and offers
four channels for all of them:

> "Four ways to hear from us — SMS, email, WhatsApp and in-app messages. You
> choose which channels you want."

**What the system does.**
`inngest/functions/monthly-statement-notice.ts:17` calls
`db.inboxMessage.createMany` directly. It never calls `queueNotification`, so a
member who chose SMS or email is not told their statement is ready.

**How to close it.** Replace the direct inbox write with `queueNotification` per
member, respecting their channel preferences. A `monthly-statement` template
exists in the seed — confirm the slug before wiring it.

---

### GAP-6 — The fifty-member cap is not enforced (MEDIUM) — ✅ CLOSED 2026-08-07

Built as described below. Three details worth recording, because each was a
decision the plan did not settle:

- **What occupies a place.** Any member who has not been erased — `deletedAt` is
  the only thing that frees one. Status does not: a suspended member keeps their
  history and their place, and someone registered but not yet activated already
  holds one. Plus every *unexpired* pending invitation; a lapsed invite is not
  holding a seat.
- **The backstop counts members, not invitations.** At the moment someone
  accepts, they are themselves holding a pending invitation. Applying the
  invite-time rule there would have refused the fiftieth member on the strength
  of the very invite that brought them. The registration check asks only whether
  fifty places are already filled by people, and runs inside the transaction
  that creates the user.
- **Fifty means fifty.** A test holds the fiftieth invitation open, not just the
  fifty-first closed — an off-by-one in the strict direction breaks the promise
  in the same way.

`MAX_MEMBERS` lives in `packages/utils/src/constants.ts`; the console shows
"43 of 50" with the headroom before leadership invites rather than after being
refused. The two apps have separate database clients, so each counts for itself
and the rule is documented in both places.

<details>
<summary>Original GAP-6 text</summary>


**The guide** is emphatic that this is deliberate, not aspirational:

> "Capped at fifty on purpose … The cap is a design decision, not a limit we are
> waiting to escape."
>
> "**50** MEMBERS, MAXIMUM"

**What the system does.** Nothing stops the 51st member. There is no constant,
no check, no configuration.

**How to close it.**

1. `MAX_MEMBERS = 50` in `packages/utils/src/constants.ts`, beside
   `MIN_CONTRIBUTION_ZAR`.
2. Enforce at **invitation issue** — refuse when
   `activeMembers + pendingInvitations >= MAX_MEMBERS`. Refusing at
   registration instead would let leadership hand out a link that then fails in
   the member's hands, which is worse.
3. Also check at registration as a backstop; two invitations could be accepted
   concurrently.
4. Surface the count in the admin console — "43 of 50" — so leadership can see
   the headroom before inviting.

</details>

---

### GAP-7 — No "Invitations" tile on the member dashboard (LOW)

**The guide** lists twelve tiles for the member dashboard, including:

> "**Invitations** — The private link that brought you in — yours alone, never
> shared."

**What the system has.** Eleven of the twelve. `apps/web/app/(member)/dashboard/`
has no `invitations` directory. The invite *system* is complete
(`services/invite.service.ts`, admin issue/revoke) — only the member-facing view
is missing.

**How to close it.** A read-only page showing the invitation that brought this
member in: who invited them, when they accepted, and the reminder that the link
is theirs alone. If the founders also want members to *issue* invitations,
that is a different feature and a decision for them — the guide says invitations
come from leadership, so build the read-only view unless told otherwise.

---

### GAP-8 — No way for a member to leave (LOW, but it is a stated right)

**The guide**, under Your Rights:

> "Leave the Foundation at any time, with your history intact"

And in the FAQ:

> "Q. Can I leave the Foundation? Yes, at any time. Your history stays on record
> but future contributions stop."

**What the system does.** There is no self-service route. Searching
`apps/web/services` and `apps/web/app/api/v1` for resignation, leaving or
self-deactivation returns nothing.

**How to close it.** A member-initiated request that: cancels the DebiCheck
mandate at the gateway, sets the member's status so no future debit run picks
them up, **retains all contribution and ledger history**, notifies leadership,
and is audit-logged. Do not delete anything — the guide is explicit that history
stays and contributions already made are not refunded.

Decide with the founders whether leaving is immediate or requires leadership
acknowledgement. The guide says "at any time", which reads as immediate.

---

### GAP-9 — Netcash: the money path cannot run (BLOCKER, pre-existing)

**The guide's central mechanism:**

> "**The Journey of One Rand** — Your bank account → Your DebiCheck mandate →
> Netcash → The Foundation account"

**What the system does.** `apps/web/lib/netcash.ts` is written against a
JSON/REST API. Netcash's documented DebiCheck service is **SOAP**, at
`ws.netcash.co.za/NIWS/niws_nif.svc`, with a batch-file model
(`BatchFileUpload`, then `RequestFileUploadReport`) and the service key as a
method parameter rather than a header.

This is documented in full at `docs/completion-guide.md` §2.5. It is a **build**
task, not a configuration task, and it is blocked on Netcash sandbox
credentials that do not yet exist.

Everything behind the `IPaymentGateway` interface — mandates, contributions,
the ledger, reconciliation, retries — is unaffected and has been exercised
against the stand-in gateway. The interface is the seam and it is the right one.

**Do not start this without sandbox credentials and the account's real
specification.** Confirm with Netcash which API the account is provisioned for
before writing anything.

---

## 3. Suggested order

1. **GAP-1 reversal** — the only gap that contradicts a capability the guide
   puts in a table with a "Yes" against leadership, and the guide leans on the
   reversing-entry principle three separate times.
2. **GAP-6 fifty cap** — an afternoon, and it is a promise about the character
   of the circle rather than a feature.
3. **GAP-4 and GAP-5 notifications** — small, and both are cases where the
   system already does the work and simply does not say so.
4. **GAP-2 and GAP-3 goal lifecycle** — together, since they are the two ends of
   the same six-step flow.
5. **GAP-7, GAP-8** — smaller surface, and GAP-8 needs a founder decision first.
6. **GAP-9 Netcash** — when credentials exist. Not schedulable before that.

---

## 4. Rules that apply to all of this

- **Read `ENGINEERING_WORKFLOW.md` before the first edit.** Particularly §2
  (principles, ordered), §6 (prohibitions), and §4.6-4.8 (traps that have
  already cost time in this repository).
- **Anything touching money gets a test seam.** Five money-path jobs were given
  one; every single one turned out to contain a defect no existing test could
  reach. Extract `execute*(step)`, drive it with a stub, and **assert against the
  defect before fixing it**.
- **One issue, one branch, one PR, targeting `Dev`.** Squash merge. Direct
  pushes to `Dev` and `main` are blocked.
- **Never name any assistant, model or vendor** in a commit message, branch
  name, PR title, PR body or filename. This is absolute.
- **Migrations are additive.** No destructive schema changes.
- **`AuditLog` for every state-changing operation.** The guide promises members
  that every leadership action is permanently logged; that promise is only as
  good as the coverage.
- Verify with `npm run typecheck && npm run lint && npm run test && npm run build`
  before opening a PR. All four are green on `Dev` today — keep them there.
