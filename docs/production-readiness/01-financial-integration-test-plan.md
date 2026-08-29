# 1 — Financial Integration & Production Readiness Test Plan

Source: *Financial Integration & Production Readiness Test Plan*. See
[`README.md`](./README.md) for the status legend.

## Read this before working any row in this file

**Production is currently running `PAYMENT_GATEWAY=mock`** — confirmed in
`xkimi-xa-mali-web`'s Vercel environment variables
([[project-deployment-phase]]). Netcash has not finished vetting the
merchant application yet ([[project-netcash-critical-path]]): a registration
token was sent and the owner is completing it, but no live account exists,
and the adapter has **never spoken to a real Netcash account** — only to its
own contract tests against the published WSDL/XSD.

This means a large fraction of this document's test cases are structurally
**`BLOCKED`**, not `NOT STARTED` — no amount of engineering effort in this
codebase can pass them until Netcash goes live and `PAYMENT_GATEWAY` is
switched from `mock` to the real gateway in production. Marking those
`NOT STARTED` would wrongly imply "pick this up any time" when the real
next action is external (Netcash's vetting), same as document 3's SMS half.

Where a row's **underlying mechanism** has been built and verified against
the mock gateway or via direct, driven testing of the app's own logic, it's
marked `PASSED` with a note that live-gateway confirmation is still
outstanding — that distinction matters and is kept explicit everywhere it
applies, never collapsed into a single status.

## The go-live switch itself — audited 2026-08-29, one real gap found and closed

Being unable to test *against* Netcash yet doesn't mean the *cutover
mechanism* can't be tested now — and it's the one piece that, if wrong,
turns "Netcash approved us" into a real incident on day one regardless of
how correct everything else in this document is.

**Found:** `apps/web/lib/env.ts` only requires `NETCASH_SERVICE_KEY` /
`NETCASH_WEBHOOK_SECRET` when `isLiveDeployment()` is true (`DEPLOY_ENV` /
`VERCEL_ENV` / `NODE_ENV`, in that priority order). But
`apps/web/integrations/payment/index.ts`'s `selectGateway()` chooses the
**real** Netcash gateway whenever `PAYMENT_GATEWAY !== 'mock'` — a check
that doesn't consult `isLiveDeployment()` at all. This project's actual
production deployment currently runs with **`DEPLOY_ENV=staging`**
(deliberately, for unrelated reasons — [[project-deployment-phase]]),
which makes `isLiveDeployment()` **false** even though it serves real
traffic on the real domain. Put together: the moment anyone changes
`PAYMENT_GATEWAY` away from `mock` on the current production deployment —
without also remembering to flip `DEPLOY_ENV` to `production` first —
the app would boot clean, select the real gateway, and have **no
requirement that any Netcash credential actually exists**. The first
failure would be a throw deep inside `lib/netcash.ts` on an actual debit
submission attempt, i.e. on debit night — precisely the failure mode this
file's own comments say it exists to prevent, and it wasn't preventing
this specific path.

**Fixed:** `selectGateway()` now checks `NETCASH_SERVICE_KEY` itself,
independent of `isLiveDeployment()`, before ever returning the real
gateway — refusing to start with a clear message naming exactly what's
missing and how to fix it, whether or not the deployment happens to be
flagged "live." Verified live, not assumed: reverted the fix, re-ran the
test suite, and watched the exact scenario — `PAYMENT_GATEWAY` unset,
`DEPLOY_ENV=staging`, no credentials — boot clean with the real gateway
silently selected. Restored the fix, confirmed it now refuses correctly.
4 new tests in `apps/web/__tests__/gateway-selection.test.ts`
(11/11 total, plus the 2 other test files that import this module
unmocked — 40/40 across all three), typecheck clean.

**Does not change today's actual production behavior at all** — the live
deployment currently sets `PAYMENT_GATEWAY=mock` explicitly, which this
check doesn't touch. It only closes the gap for the future moment this
project has been building toward: the day someone removes that override.

**The one operational step this doesn't automate, and shouldn't try to:**
when Netcash approves the account, the correct go-live order is still
**`DEPLOY_ENV=production` first (or together with), then `PAYMENT_GATEWAY`
away from `mock`, then the real Netcash credentials** — in that Vercel
project's environment variables. This fix makes getting that order wrong
*fail loud at deploy time* instead of *fail silent until debit night*; it
doesn't remove the need to actually do it correctly.

**Documentation was actively wrong here too, not just missing — fixed the
same pass, since a doc lying about what's enforced is worse than no doc.**
`DEPLOYMENT.md` §2 stated flatly "the build fails without it" for
`NETCASH_SERVICE_KEY`/`NETCASH_WEBHOOK_SECRET`/`NETCASH_API_URL`, with no
mention of the `DEPLOY_ENV` dependency — false for this project's actual
production deployment as it stands today. Corrected the table, added an
explicit warning naming exactly which checks are currently dormant and why,
and added the `DEPLOY_ENV=production` step as step 0 of §5's Netcash
checklist, with a final step making explicit that removing the mock
override should be the *last* action, not the first.

**Also found and fixed while in this area:** `docs/runbook.md`'s manual-SQL
recovery paths (debit-run failure §, reconciliation §) referenced
`"Transaction"`, `"Contribution"`, `"User"`, `"LedgerEntry"`, `"AuditLog"` —
none of which are the real table names (`transactions`, `contributions`,
`users`, `ledger_entries`, `audit_logs`, per every model's `@@map` in
`schema.prisma`). Quoted PascalCase in Postgres is case-sensitive and would
have failed with `relation "Transaction" does not exist` — the exact moment
someone reaches for this runbook is a live incident with money stuck; that
is the worst possible time to discover the runbook itself doesn't run.
**Verified the corrected SQL for real** — ran every statement as an
`EXPLAIN` inside a rolled-back transaction against the actual local schema
(not just eyeballed): all four planned cleanly, including the
`ON CONFLICT ("refType", "refId", direction)` clause matching the real
`ledger_entries` unique constraint.

---

## 1 — Duplicate debit-order testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|---|
| a | Create the same debit order twice | `NOT STARTED` | |
| b | Refresh/re-submit a debit-order request | `NOT STARTED` | |
| c | Simulate multiple Pay/Submit clicks | `PASSED` (mechanism, goal payments only) | PR #339 — fired two *real* concurrent goal payments against the running app; before the fix, `payToGoal` read the idempotency key before the gateway call and both requests passed that check (`statuses [500, 201]`, goal moved once — a real double-charge). Fixed by claiming the row PENDING before touching the gateway, so the DB's unique index arbitrates: re-tested `[201, 201]`, one charge. **Not separately confirmed for the manual/debit-order contribution path** — same class of fix (PR #309) but not driven the same adversarial way. |
| d | Retry after timeout | `NOT STARTED` | |
| e | Network retries don't create duplicates | `PASSED` (mechanism) | Client-supplied idempotency tokens, checked before the gateway call, on both the manual contribution path (#309) and goal payments (#317/#339) — replacing an earlier `randomUUID()`-inside-the-key pattern that made the unique index decorative. |
| f | Two mandates where only one should exist | `PASSED` | The "one active-or-pending mandate" rule is enforced in `mandate.service.ts`; confirmed both by direct code read and by the autonomous member-sweep (#343) hitting it live — a probe to create a second mandate was refused by this rule before the ownership check even ran. |
| g | Duplicate webhook/callback handled safely | `BLOCKED` | No webhook has ever been received from a live Netcash account — nothing to verify yet beyond the contract tests. |

---

## 2 — Failed collection testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|---|
| a | Insufficient funds | `BLOCKED` | Needs a live gateway response to actually observe. |
| b | Invalid/inactive mandate | `PASSED` (mechanism) | PR #280 — "a status we cannot read no longer stops a member's collections"; an unknown mandate status is explicitly not treated as a status change. |
| c | Bank rejection | `BLOCKED` | |
| d | Payment-provider failure | `BLOCKED` | |
| e | Network/API timeout | `NOT STARTED` | |
| f | Provider temporarily unavailable | `NOT STARTED` | |
| g | Collection returned as failed after initially appearing successful | `PASSED` (mechanism) | This is the exact shape of PR #331, the worst bug found in this codebase's history: `recalculateContributionStatus` sent an event synchronously inside a 5s Prisma transaction; a slow send expired the transaction *after* the member had already been charged, rolling back the write but not the charge. Fixed by moving the event send outside the transaction. Verified via real driven API calls (`POST /api/v1/contributions/pay` → PARTIAL → PAID). |

**Verify block:**

| Item | Status | Notes |
|---|---|---|
| Contribution not incorrectly marked successful | `PASSED` (mechanism) | = 2.g |
| Balance/goal progress not incorrectly increased | `PASSED` (mechanism) | Same fix; also #339's claim-before-gateway pattern protects this generally. |
| Appropriate transaction status stored | `PASSED` (mechanism) | `toTransactionStatus` unification — the gateway's answers used to collapse onto two states in three different places (§4.6/§2a in `docs/session-handoff.md`); now single source of truth. |
| Member receives correct notification | `NOT STARTED` | Cross-reference document 3. |
| Admin has appropriate visibility | `NOT STARTED` | |
| Retry/recovery follows business rules | `PASSED` (mechanism) | PR #275 — "a declined retry stays retryable instead of vanishing from the recovery pool." |

---

## 3 — Reversal / return testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|
| a | Successful contribution followed by reversal | `PASSED` | Directly verified against the running app: a R50 goal payment succeeded, and an older **REVERSED** R500 transaction stayed excluded from the derived goal total — confirmed "reversal-safe" (references PR #237). |
| b | Partial/adjusted transaction | `NOT STARTED` | |
| c | Returned debit order | `BLOCKED` | Needs a live gateway to generate a real return. |
| d | Provider-generated reversal notification | `BLOCKED` | |
| e | Reversal received after dashboard already updated | `NOT STARTED` | |

**Verify block:**

| Item | Status | Notes |
|---|---|---|
| Original transaction remains traceable | `PASSED` | Financial records treated as immutable — audit log is append-only (enforced, see §14/8 below), and reversals are additional rows, not edits. |
| Reversal recorded separately | `PASSED` | Same. |
| Member's financial position corrected | `PASSED` (mechanism, from 3.a) | |
| Goal progress recalculated correctly | `PASSED` (from 3.a) | |
| Statements reflect the reversal | `NOT STARTED` | Statement rendering was audited extensively (§10 below) but not specifically re-checked against a reversed-transaction month. |
| Audit trail preserves original + correction | `PASSED` | Append-only trigger blocks any UPDATE to `audit_logs`, confirmed the hard way — even a legitimate test-data cleanup couldn't work around it (see [[project-mobile-relaunch-and-account-reset]]). |

---

## 4 — Reconciliation testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|
| a | Successful transaction exists on both systems | `BLOCKED` | Needs live Netcash data to compare against. |
| b | Provider transaction exists, app record missing | `BLOCKED` | |
| c | App record exists, provider transaction missing | `BLOCKED` | |
| d | Amount mismatch | `BLOCKED` | |
| e | Status mismatch | `BLOCKED` | |
| f | Duplicate provider notification | `BLOCKED` | |
| g | Delayed provider notification | `BLOCKED` | |
| h | Transaction received out of order | `BLOCKED` | |

**What exists today:** the nightly reconciliation job itself is built and
was hardened twice — PR #277 ("reports what it actually corrected", it used
to silently report nothing found even when it fixed things) and PR #253
(rewritten set-based so it stops doing work that grows forever). Both are
mechanism-level fixes verified against the mock gateway / test data, not
against a real Netcash statement. **Every row above stays `BLOCKED` until
there is a real provider record to reconcile against.**

---

## 5 — Authorization testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|
| a | Member accesses another member's financial info | `PASSED` | Autonomous member sweep (#343): another member's profile/summary/POPIA export → 403; bank account/goal plan/inbox message → 404. |
| b | Member modifies another member's contribution | `PASSED` | Same sweep — validation and ownership checks held across contributions, goals, comments, community messages, budgets, mandates, bank accounts, plans. |
| c | Member performs an admin operation | `PASSED` | Every admin route probed as a member → 403 (#343). |
| d | Unauthenticated user accesses protected endpoints | `NOT STARTED` | Not explicitly re-listed in the sweep's own summary — likely covered by middleware but worth a direct check rather than assuming. |
| e | Expired session/token accesses protected functionality | `NOT STARTED` | |
| f | Direct API requests bypassing the frontend | `PASSED` | The entire #343 sweep *was* direct API calls, not frontend clicks. |
| g | Manipulate IDs in URLs/requests | `PASSED` | `PATCH /members/:me` carrying `roles: ['ADMIN']` → 200 but silently stripped, confirmed via a DB check that the role column never changed — no mass-assignment IDOR. |

---

## 6 — Permission / role testing

| Role × operation | Status | Evidence / Notes |
|---|---|---|
| Member: view own profile/contributions | `PASSED` | Base case, exercised constantly across every audit session. |
| Member: view another member's data | `PASSED` (denied correctly) | = §5 above. |
| Member: manage members | `PASSED` (denied correctly) | = §5.c. |
| Admin: manage financial records | `PASSED` | Checked the admin console's own server actions directly (not just the web API), since `docs/session-handoff.md` §8 flagged this as unaudited. `apps/admin/lib/admin-action.ts`'s `requireAdmin()` gates every admin server action — confirms session, confirms ADMIN role, rejects a *stale* session role via `isSessionRoleStale` (closes the gap where a demoted admin's still-valid JWT would otherwise keep working), throttles by admin identity, and resolves client IP through a spoofing-resistant trust model rather than trusting `cf-connecting-ip` blindly. Spot-checked on the data-subject-erasure action (POPIA right-to-erasure, about as high-stakes as this app gets): page-level role redirect *and* a named-permission `requireAdmin('dsr.erase')` check inside the server action itself, so the check can never be reached by crafting a request directly against a form that was never rendered to the caller. |
| Self-revocation of the sole admin | `PASSED` (blocked correctly) | PR #306 — the exact bug this closed: `setMemberRole` existed twice, the console called the unguarded copy, and the sole admin could remove his own admin role and leave the system with none. Fixed via a shared `refuseRoleChange` both apps import; a test asserts neither app restates the rule locally. |
| `MEMBER` role revocation | `PASSED` (correctly refused) | `MEMBER` isn't a permission — nothing checks for it, so there's nothing to revoke; every member-facing service gates on `assertCanAccess` instead. Suspension, not role removal, is what actually ends access. |
| Generate statements (Member: own / Admin: authorized) | `PASSED` | Double-gated in `app/api/v1/transactions/statement/route.ts`: a non-admin caller can never even set `targetUserId` to anything but their own (the `?userId=` override is only honoured `roles.includes('ADMIN') && ...`), and `generateMemberStatementPdf` independently calls `assertCanAccess(userId, requesterId, roles)` regardless — Member A cannot fetch Member B's statement by id even if the route-level guard were somehow bypassed. The route's own code comments document a *previously real* worse version of this exact class of bug (unauthenticated, permanent, guessable blob URLs) that was already fixed before this pass. |
| Configure system (Member: ✗ / Admin: restricted) | `NOT STARTED` | Source table's own row. `docs/session-handoff.md` §8 lists "the admin console's own surfaces beyond roles" as unaudited generally — this is that gap, named specifically for system configuration. |
| System/service account permissions | `NOT STARTED` | Not defined in this codebase as a distinct row yet — worth deciding whether this applies here at all (e.g. Inngest job identity, webhook signature checks) before marking it done or skipping it. |

---

## 7 — Transaction-state testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|
| a | Transaction remains pending | `NOT STARTED` | |
| b | Transaction eventually succeeds | `PASSED` (mechanism) | Driven directly: `POST /api/v1/contributions/pay` → 201, contribution PARTIAL 250/400 → PAID 400/400. |
| c | Transaction fails | `PASSED` (mechanism) | = §2 above. |
| d | Transaction is reversed | `PASSED` (mechanism) | = §3 above. |
| e | Provider sends same status multiple times | `BLOCKED` | Needs a live gateway. |
| f | Provider sends statuses out of order | `BLOCKED` | |
| g | Application temporarily goes offline | `NOT STARTED` | Cross-reference §19 (disaster recovery) — same underlying question, don't test twice. |

**The state-collapsing defect this section would have caught, already
found and fixed:** the gateway's three real answers (success/decline/error)
were being collapsed onto only two states in three separate places in the
codebase before this was caught — `submitManualPayment` (#308) and
`payToGoal` (#317), on top of an original instance. Everything imports
`toTransactionStatus` now, one source of truth.

---

## 8 — Audit-log testing

| # | Audit event | Status | Evidence / Notes |
|---|---|---|
| a | Member creation | `PASSED` | This platform is invite-only — "member creation" is invitation acceptance. `invite.service.ts` writes `INVITE_ACCEPTED` inside the same DB transaction that creates the `User` row. |
| b | Member update | `PASSED` | `member.service.ts` writes an audit entry on every mutating path (7 separate `writeAuditLog` call sites: profile update, status change, role change, bank account update/removal, id-number correction, unlock). |
| c | Mandate creation/change | `PASSED` | `mandate.service.ts` — 6 call sites covering creation, update, cancel, approve, reject, delay. |
| d | Contribution creation | `PASSED` | `contribution.service.ts` — 4 call sites, including the manual-payment and bulk-generation paths. |
| e | Transaction-status change | `PASSED` | `mandate-status-sync.ts` and `transaction-retry-failed.ts` (both Inngest functions) write an audit entry when a transaction's status actually changes, not just on the happy path. |
| f | Administrative adjustment | `PASSED` | = `TRANSACTION_REVERSED` in `contribution.service.ts` — this codebase has no separate "manual ledger adjustment" feature; `ledger.service.ts` only exposes reads and the automated reconciliation job. Reversal is the actual administrative-adjustment mechanism. |
| g | Reversal | `PASSED` (mechanism) | = §3's "audit trail preserves original + correction" row. |
| h | Permission/role change | `PASSED` | PR #306 unified the audit action name (`ADMIN_ROLE_REVOKED`) — previously the console wrote a *different* action name (`ADMIN_ROLE_REMOVED`) than the API, so any query filtered on one name silently missed the other's revocations. Now both write the same action. |
| i | Statement generation | `PASSED` (found and fixed a real gap) | Found: `services/report.service.ts`'s two **admin bulk-export** functions (`exportAdminReportCSV`, `generateContributionReportPdf` — every member's name/email/phone/financial standing in one file) had **zero** audit trail, and `generateContributionReportPdf` didn't even resolve which admin was acting on the trusted-internal-console path (the exact gap `resolveInternalAdmin` exists to close elsewhere, just never applied here). Fixed: both now write `ADMIN_REPORT_EXPORTED_CSV`/`ADMIN_REPORT_EXPORTED_PDF` with the resolved actor id and client IP; both routes now call `resolveInternalAdmin` on the trusted path instead of leaving the actor unresolved. Proved with 4 new tests (actor recorded, still recorded with no actor, PDF path matches, forbidden before ever logging) — 17/17 passing. **Not covered by this fix, deliberately:** a member's own self-service statement view (`generateMemberStatementPdf`) — self-access to one's own data isn't the same exfiltration/insider-threat surface as an admin bulk export, so it was left out of scope rather than padding the fix. | 2026-08-29 |
| j | Important configuration changes | `NOT STARTED` | No genuine runtime "configuration" surface found to audit — the app's tunables (`ENABLE_GOAL_LOCKING`, `REQUIRE_PASSWORD_POLICY_RESET`, etc.) are deploy-time env vars, not something an admin changes at runtime through the app. Leaving open rather than inventing a row to close; revisit if a real admin-configurable setting is added later. |

**Structural guarantee (applies to all rows):** `audit_logs` is enforced
**append-only at the database trigger level** — confirmed the hard way when
even a legitimate, owner-authorized test-data cleanup could not `UPDATE` or
work around it (had to use the supported SUSPEND path instead). This was
*not* true before the 2026-08-15 restore drill (#383) found it — worth
remembering that "append-only" here is a specific, dated fix, not something
this system always had.

**Each event should capture (the document's own 6-field checklist, not yet
verified field-by-field against the actual `AuditLog` schema/writes):**

| # | Field | Status | Notes |
|---|---|---|---|
| 1 | Who performed the action | `NOT STARTED` | |
| 2 | What happened | `NOT STARTED` | |
| 3 | When it happened | `NOT STARTED` | |
| 4 | Which record was affected | `NOT STARTED` | |
| 5 | Relevant transaction/reference ID | `NOT STARTED` | |
| 6 | Previous/new state where appropriate | `NOT STARTED` | PR #306's fix (unifying `ADMIN_ROLE_REVOKED`) is evidence the *action name* is captured correctly for that one event type — it is not evidence that every event captures all 6 fields. Don't over-extend that citation here. |

---

## 9 — Notification testing

**Overlaps document 3, but is not identical to it — both need their own
rows.** Document 3 tracks notification *delivery mechanics* (SMS/email
provider failure, retry, recovery). This section is about notification
*correctness per triggering event* — a different axis, not yet covered
anywhere else. Work delivery-mechanics rows in document 3; work the rows
below here.

| # | Test case (which event triggers a notification) | Status | Notes |
|---|---|---|---|
| a | Successful contribution | `NOT STARTED` | |
| b | Failed contribution | `NOT STARTED` | |
| c | Reversal/return | `NOT STARTED` | |
| d | Mandate-related event | `NOT STARTED` | |
| e | Important account event | `NOT STARTED` | |
| f | System-generated statement/notification | `NOT STARTED` | |

**Verify block:**

| Item | Status |
|---|---|
| Correct recipient | `NOT STARTED` |
| Correct member | `NOT STARTED` |
| Correct amount | `NOT STARTED` |
| Correct transaction status | `NOT STARTED` |
| Correct date/reference | `NOT STARTED` |
| No duplicate notifications | `NOT STARTED` |
| No notification containing another member's information | `NOT STARTED` |

---

## 10 — Statement accuracy testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|
| a | One successful contribution | `NOT STARTED` | The seeded statement test (`npm run seed:statement`) writes a realistic mixed month, not an isolated single-contribution case. |
| b | Multiple contributions | `PASSED` | Seeded month exercises a successful debit order, a declined collection with a reason, a manual payment, and a partial balance together — rendered and read via `pdftotext -layout`/`pdftoppm`, not just asserted in a test runner. |
| c | Failed contribution | `PASSED` | Included in the same seeded month. |
| d | Reversed contribution | `NOT STARTED` | The seed script's mixed month does not include a reversal case specifically. |
| e | Multiple transactions same date | `NOT STARTED` | |
| f | Historical transactions | `NOT STARTED` | |
| g | Different transaction statuses | `PASSED` | = 10.b, five defects found and fixed by actually rendering it (PR #328): masthead collision, `OUTSTANDINGSTATUS`/`AMOUNTSTATUS` header collision, a date column mislabelled `Due`/`Done`, a notice block splitting across the page break, a decorative glyph rendering as a fallback box. |

**Also verified:** the empty-period case, which was actively **lying** —
`outstanding <= 0` reads true both when a member paid what they owed and
when nothing was ever billed, and the statement used to say "ACCOUNT
SETTLED... fully settled" for a month with zero activity. Now reads "NO
ACTIVITY THIS PERIOD." Page-two bloat (an almost-empty second page for a
normal month) fixed in PR #332.

**Formula check** (`Opening + contributions − adjustments = closing`) —
`NOT STARTED` as an explicit arithmetic assertion; the totals have been
visually verified correct against seeded data, not algebraically checked
against the formula in this document's own words.

---

## 11 — Provider-succeeds / application-fails testing

This is, almost word for word, `docs/session-handoff.md`'s own standing
description of "the one real engineering gap" — the Netcash adapter has
never spoken to a live account, so this exact failure mode (provider
processes it, the app doesn't find out in time) cannot be produced or
observed yet. **This is the single most important section in the entire
three-document tracker to revisit the day Netcash goes live** — a first
small transaction should be deliberately run through with the app briefly
paused/killed mid-flight, not assumed safe by extrapolation from the mock
gateway.

| Item | Status | Notes |
|---|---|---|
| Simulate: provider processes transaction, app becomes unavailable, response delayed, app returns | `BLOCKED` | Cannot be produced without a live provider. |
| Transaction can be recovered | `BLOCKED` | |
| No duplicate collection is created | `BLOCKED` | |
| Transaction is not permanently lost | `BLOCKED` | |
| Reconciliation can identify the transaction | `BLOCKED` | Depends on §4 (reconciliation), also entirely `BLOCKED`. |
| Final state eventually becomes correct | `BLOCKED` | |

---

## 12 — Application-succeeds / provider-fails testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|
| a–c (initiate → provider rejects → no normal success response) | `PASSED` (mechanism, mock gateway) | This is exactly what `toTransactionStatus` and the claim-before-gateway pattern (#339) are for — driven and confirmed against the mock gateway. **Not yet confirmed against a real Netcash rejection**, which may have response shapes the mock doesn't produce. |

**Verify block:**

| Item | Status |
|---|---|
| App doesn't mark transaction successful | `PASSED` (mock gateway) |
| Balance/goal doesn't incorrectly increase | `PASSED` (mock gateway) |
| Correct failure state recorded | `PASSED` (mock gateway) |
| Retry doesn't cause duplication | `PASSED` (mock gateway) |
| Member receives appropriate feedback | `NOT STARTED` |

---

## 13 — Webhook / callback reliability testing

No webhook has ever been received from a live Netcash account — most rows
below are `BLOCKED` for that one shared reason. **One row didn't need to
wait** — see 13.f, now `PASSED` with a real test against the actual
verification code. **One specific, actionable sub-item still worth fixing
before go-live, not discovered on it:** `NETCASH_WEBHOOK_IPS` currently
falls back to four built-in default IPs ([[project-deployment-phase]]) and
**the real IP list has not been confirmed with Netcash yet** — wrong IPs
would reject every real callback while debits still silently collect.

| # | Test case | Status |
|---|---|---|
| a | Webhook received once | `BLOCKED` |
| b | Same webhook received twice | `BLOCKED` |
| c | Webhook received late | `BLOCKED` |
| d | Webhook received out of order | `BLOCKED` |
| e | Invalid webhook | `BLOCKED` |
| f | Unauthorized webhook request | `PASSED` | **Real test, 2026-08-29** — not against the mock-gateway deployment (its `verifyWebhookSignature`/`isAllowedWebhookIp` deliberately always return `false`, by explicit design, specifically so a broken real verifier could never hide behind it — see `mock.adapter.ts:119-132`; testing through it would prove nothing). Instead wrote `apps/web/__tests__/netcash-webhook-security.test.ts`, calling the **real** `verifyWebhookSignature`/`isAllowedNetcashIp` from `apps/web/lib/netcash.ts` directly with real computed HMAC-SHA256 signatures. **No test existed for this before** — genuinely untested, security-critical code (the only gate protecting money-moving webhook events once Netcash is live) until now. 10/10 passing: a correctly-signed body is accepted (both hex and base64 encodings); a signature forged with a guessed/wrong secret is rejected; a *valid* signature replayed against a *different, tampered* body is rejected (proves the signature actually covers content, not just presence); a garbage string, an empty string, and a truncated-but-hex-shaped string are all rejected; a real Netcash IP from the documented default range is allowed, an arbitrary IP is refused. |
| g | Application unavailable when webhook arrives | `BLOCKED` |
| h | Provider retries webhook delivery | `BLOCKED` |

---

## 14 — Database integrity testing

| # | Item | Status | Evidence / Notes |
|---|---|---|
| a | Foreign-key relationships | `PASSED` | Standard Prisma-enforced FKs; specifically stress-tested by the append-only audit trigger refusing to let a user deletion null out an `AuditLog.userId` FK. |
| b | Unique transaction references | `PASSED` | Idempotency keys are real unique-indexed columns now, not decorative `randomUUID()` values (#309/#317). |
| c | Unique member identifiers | `PASSED` | |
| d | Referential integrity | `PASSED` | |
| e | Correct transaction/member relationships | `NOT STARTED` | |
| f | No orphaned financial records | `PASSED` (structurally) | The append-only trigger's whole point is preventing exactly this class of problem. |
| g | Correct decimal/monetary representation | `PASSED` (one real violation found and fixed) | This codebase has real, deliberate money-handling infrastructure (`apps/web/lib/money.ts`, "BACKEND-B12"): a documented contract that chained JS arithmetic on rand amounts must go through `sumZAR`/`subtractZAR`/`splitZAR`/`splitByWeightsZAR`, never raw `+`/`-`/`*`, specifically to avoid accumulating binary-float dust. Grepped the whole `apps/web/services`/`repositories`/`lib`/`inngest` tree for violations of that rule. Found one, real: `ledger-reconciliation.ts` computed `drift`/`netDrift` — values written into an audit log and a critical drift-alert SMS — with raw `item.actual - item.recorded` and a raw reduce, bypassing the helpers entirely. **Fixed**: both now go through `subtractZAR`/`sumZAR`. Added a test proving it mattered — `10.20 - 10.10` in raw JS is `0.09999999999999964`, not `0.1` — reverted the fix, watched that exact value appear in a real audit-log assertion, confirmed the fix removes it, restored. 9/9 tests passing, typecheck clean. (A second candidate, `badge.service.ts`'s average-contribution calculation, was checked and judged low-risk and out of scope — a single division for a display-only badge metric, never itself chained further or written back as a financial record.) |
| h | Appropriate transaction timestamps | `PASSED` | The known trap (PR #416): a `Date` crossing an Inngest `step.run()` boundary comes back as a JSON-serialized *string*, not a `Date` — calling a Date-only method on it throws or silently misbehaves. Read every job that actually moves or reconciles money for the same pattern, not just the one already found: `debit-run.ts` (the actual debit) already defensively wraps `new Date(mandate.delayedUntil)` before comparing; `mandate-delay-handler.ts`'s `debitDate` is computed fresh from the event payload before any step (recomputed identically on every Inngest replay, never serialized); `contribution-due-reminder.ts` does all its `Date` arithmetic *inside* one step, by explicit design, and says so in its own comment; `job-heartbeat-check.ts` takes `now` as a plain function parameter created before any step, with its own comment citing the exact precedent (`ledger-reconciliation`'s past counter-placement incident) as the reason; `transaction-retry-failed.ts`'s only two `Date` sites are a fresh filter value and a fresh write, neither reads a step-crossed value. `goal-plan-collection.ts` and `mandate-status-sync.ts` have no `Date`-crossing pattern at all. No other instance of the PR #416 bug found. |
| i | No accidental deletion of financial history | `PASSED` | = the append-only guarantee, tested the hard way. |

---

## 15 — Concurrency testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|
| a | Two requests update the same contribution simultaneously | `NOT STARTED` | |
| b | Two admins perform an operation simultaneously | `NOT STARTED` | |
| c | Duplicate submissions nearly simultaneously | `PASSED` | PR #339 — this is literally the test that was run: two real concurrent goal-payment requests fired together. |
| d | Multiple provider notifications arrive concurrently | `BLOCKED` | Needs a live gateway to generate real concurrent notifications. |
| e | Two processes update the same transaction | `NOT STARTED` | |

---

## 16 — API failure & recovery testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|
| a | Timeout | `NOT STARTED` | |
| b | HTTP error | `NOT STARTED` | |
| c | Provider unavailable | `BLOCKED` | Real provider unavailability needs a live provider. |
| d | Slow response | `NOT STARTED` | |
| e | Malformed response | `NOT STARTED` | |
| f | Temporary network failure | `NOT STARTED` | |
| g | Authentication failure | `NOT STARTED` | |
| h | Rate limiting | `PASSED` | Reconfirmed against the real production deployment, not just env-var presence: `curl https://member.xkimixamali.co.za/api/v1/health` → `"redis":"ok"`. The health route's own code makes this a strong signal, not a weak one — it deliberately distinguishes `not_configured` (Redis unset) from `error` (configured but unreachable) from `ok` (configured **and** a real `redis.ping()` against Upstash succeeded), specifically so a misconfigured production deploy can't read as healthy. `makeRatelimit()` returns a no-op only when `REDIS_CONFIGURED` is false; since it's true and reachable, every limiter in `lib/redis.ts` is backed by the real thing in production right now. |

---

## 17 — Security testing

| # | Item | Status | Evidence / Notes |
|---|---|---|
| a | Authentication | `PASSED` | PRs #301–#305: throttling (per-source, not per-account, deliberately — an account-keyed limit would let anyone lock the sole admin out of his own console), nothing disclosed before password check, lockout doesn't extend on a wrong guess against an already-locked account, password reset clears lockout. |
| b | Authorization | `PASSED` | = document-1 §5 above. |
| c | Session/token handling | `NOT STARTED` | |
| d | Input validation | `PASSED` | #343 sweep: "validation solid across contributions, goals, comments, community messages, budgets, mandates, bank accounts and plans." |
| e | API access controls | `PASSED` | Same sweep. |
| f | Sensitive-data protection | `PASSED` (mostly) | The RSC-serialization class of bug — raw Netcash SOAP XML, idempotency keys, gateway refs shipped to the browser — found and fixed on `mandates` and `contributions` specifically; a repo-wide test now asserts the contributions page's serialization stays narrow (`contributions-page-exposure.test.ts`). Not confirmed swept across *every* page. |
| g | Secure configuration/secrets | `PASSED` | Vercel "Secret" type used throughout for real credentials. |
| h | Error messages don't expose sensitive info | `PASSED` | Login error ordering fixed specifically so a guess against a locked/suspended/pending account discloses nothing before the password is verified (#303). |
| i | Members can't manipulate financial amounts via frontend | `PASSED` | **Real adversarial test, 2026-08-29** — hit `/api/v1/contributions/pay` directly via raw `fetch()` in a browser JS console (no app UI involved), logged in as a real seeded member with a real R100/month mandate. Tried: below-schema-minimum (R99 → rejected, `VAL_001`), negative (−R500 → rejected), at-schema-max-but-over-actual-remaining (R10,000 against a R60 remaining balance → rejected with the *server's own* computed figure, `CTR_004 "Amount exceeds remaining balance of R60.00"` — proving the server derives the cap from its own DB row, never trusts a client-supplied "how much is owed"), string-typed amount (`"100"` → rejected, `VAL_001 "Expected number, received string"`), and a missing amount field (→ rejected). A legitimate R100 payment on a fresh period was then run as a control and succeeded (201, real mock-gateway transaction, receipt issued) — confirming the endpoint isn't just rejecting everything. **No tampering vector succeeded.** |

**A real, separate bug found while running this test, not what it was
looking for — found, root-caused, and FIXED, 2026-08-29.**
`ManualContributionSchema`'s `amount.min(100)` was an *absolute* floor with
no awareness of the contribution's actual remaining balance — so a
legitimate **partial** payment under R100 was structurally impossible, even
though the codebase's own design explicitly intends partial payments to be
supported (`schemas.ts`'s own comment on the field: "A member may
legitimately pay twice in the same period — a partial now and the balance
later"). Confirmed cleanly on a brand-new period with no prior payment
history: a first R50 payment (half of a R100 mandate) was rejected with
`VAL_001 "Minimum contribution is R100"` — not because anything was wrong
with the request, but because R50 itself was below the hard floor. Since
**R100 is also this system's stated minimum monthly contribution**
(`FACTS.minMonthlyPlus`, [[project-derived-facts]]), this meant a member on
the smallest, most common membership tier could **never** finish paying off
a partial period.

**The fix, four places, not one — the same pattern this codebase has hit
before ("a protection applied to one of two paths to the same endpoint"):**
1. `packages/utils/src/schemas.ts` — `ManualContributionSchema.amount`
   loosened from `.min(100)` to `.positive()`. The schema now only rejects
   a non-positive amount; it has no way to know what's actually still owed,
   so it shouldn't be the one enforcing a business minimum that depends on
   it.
2. `apps/web/services/contribution.service.ts` — `submitManualPayment` now
   computes `minimumPayment = Math.min(MIN_CONTRIBUTION_ZAR, remaining)`
   right where `remaining` is already known, and rejects (`CTR_006`,
   new code) anything below it. R100 for a fresh period; capped down to
   match whatever's actually left once a partial payment has brought that
   under R100.
3. `apps/web/components/contribution/PaymentModal.tsx` — the native
   `<input min={...}>` and the budget-guard's amount-adjustment handler
   both hardcoded the flat `MIN_CONTRIBUTION_ZAR`, which would have kept
   forcing the UI toward R100 even after the backend fix, defeating it at
   the one place a member actually types a number. Both now use a derived
   `minPayable = Math.min(MIN_CONTRIBUTION_ZAR, remaining)`.
4. `apps/web/app/(member)/dashboard/contribute/page.tsx` — same
   `<input min={...}>` bug, independently duplicated on this page's own
   separate path to the same endpoint. Fixed the same way.

**Verified, not assumed:** added 3 real tests to
`apps/web/__tests__/manual-payment-outcome.test.ts` — a R60 payment
against a R60 remaining balance now succeeds; a R50 payment against a
*fresh* R450-remaining period is still correctly refused (the normal case
is unchanged); a R30 payment against that same R60 remaining balance is
still refused (the floor tracks the remaining balance, it isn't just
disabled). **Proved these aren't tautologies**: reverted the service-layer
fix, re-ran, watched exactly the two rejection-tests fail and the
acceptance-test still pass (control), restored the fix, re-ran clean —
15/15. Full contribution/payment test suite (92 tests, 6 files) and a full
`apps/web` typecheck both clean after the change.
| j | Members can't modify transaction statuses | `PASSED` | No member-facing mutation path touches `Transaction.status` directly — it's derived from gateway responses only, confirmed by the same serialization-narrowing work above. |
| k | Administrative endpoints protected | `PASSED` | = §5.c. |

---

## 18 — End-to-end financial test

| Item | Status | Notes |
|---|---|---|
| Full chain: registration → auth → mandate → contribution → provider → response → DB → goal → notification → statement → reconciliation | `IN PROGRESS` (mock gateway only) | Every individual link has been driven and verified against the mock gateway and real DB state at some point in this codebase's history (see the rows cited throughout this file). **The chain has never been run end-to-end through a real Netcash account** — production itself is still on `PAYMENT_GATEWAY=mock`. This is the one test in the entire document that most directly matches `docs/session-handoff.md`'s own recommended first action once Netcash is live: run **one member, one full debit cycle, in test mode**, before switching anyone else over. |

---

## 19 — Disaster / recovery testing

| # | Test case | Status | Evidence / Notes |
|---|---|---|
| a | Application restart during transaction processing | `NOT STARTED` | |
| b | Database restart | `NOT STARTED` | |
| c | Temporary provider outage | `BLOCKED` | |
| d | Server/network interruption | `NOT STARTED` | |
| e | Failed background process | `PASSED` (a real, unplanned instance) | `notification-flush` genuinely crashed every 5 minutes for 8+ hours in production before being caught and fixed (PR #416) — real-world evidence of both a failure mode and the alerting that caught it (`job_heartbeats` / `SCHEDULED_JOB_SILENT`, PR #300). |
| f | Delayed webhook | `BLOCKED` | |
| g | Application deployment during normal operations | `NOT STARTED` | |

**Verify block (the system can recover without):**

| Item | Status | Notes |
|---|---|---|
| Losing financial transactions | `PASSED` (structurally) | The append-only audit guarantee plus idempotent claim-before-gateway pattern together mean no code path in this system currently *can* drop a transaction record — but this is inferred from the mechanisms, not from actually running any of the 19.a–g scenarios above and checking. |
| Creating duplicates | `PASSED` (mechanism, from #339) | |
| Corrupting balances | `NOT STARTED` | |
| Producing incorrect statuses | `PASSED` (mechanism, from `toTransactionStatus`) | |

**Restore drilling specifically:** a **development** restore drill was run
2026-08-15 (#383) — found the audit log was *not* actually append-only at
the time (now fixed) and that one of its four checks could never pass by
design. **A production restore drill has not been run** — blocked on
`BACKUP_AGE_PUBLIC_KEY` + `PRODUCTION_DIRECT_DATABASE_URL`, per
`docs/session-handoff.md` action items #11/#12.

---

## 20 — Production go-live checklist

Reproduced as its own tracked set, cross-referencing the detailed rows
above rather than re-deciding status independently.

### Financial integration
| Item | Status |
|---|---|
| Debit-order integration tested | `BLOCKED` (needs live Netcash) |
| Payment gateway tested | `IN PROGRESS` (mock gateway only) |
| Provider callbacks/webhooks tested | `BLOCKED` |
| Transaction references verified | `PASSED` |
| Failure scenarios tested | `IN PROGRESS` (mechanism-level only) |
| Reversals tested | `PASSED` (mechanism) |
| Reconciliation tested | `BLOCKED` |

### Application
| Item | Status |
|---|---|
| Authentication tested | `PASSED` |
| Authorization tested | `PASSED` |
| Roles/permissions tested | `PASSED` |
| Database integrity verified | `PASSED` |
| Audit logs verified | `PASSED` |
| Notifications verified | → see document 3 |
| Statements verified | `PASSED` (mostly) |

### Reliability
| Item | Status |
|---|---|
| Duplicate-request protection tested | `PASSED` (mechanism) |
| Concurrency tested | `PASSED` (the one case actually driven — #339) |
| Provider outage tested | `BLOCKED` |
| Application outage tested | `NOT STARTED` |
| Recovery procedures tested | `IN PROGRESS` (dev drill done, production drill blocked) |

### Governance / operations
| Item | Status |
|---|---|
| Required organizational documentation completed | `PASSED` — see [[project-compliance-pack]] |
| Required compliance documentation completed | `PASSED` — POPIA 5/8 closed, per the same |
| Payment-provider onboarding completed | `BLOCKED` — see [[project-netcash-critical-path]] |
| Production credentials/configuration verified | `IN PROGRESS` — most infra done, BulkSMS still missing (document 2 §6) |
| Backup/recovery procedures established | `IN PROGRESS` — dev drilled, production blocked on the two vars above |
| Responsible persons for financial reconciliation identified | `NOT STARTED` — an owner/governance decision, not an engineering task |

**Final sign-off block** (Technical / Financial-Operations / Authorized
Founder / Date) — left blank in the source document and left blank here.
This is not a row this tracker can fill in on its own; it's the owner's
signature once the rows above are actually green.
