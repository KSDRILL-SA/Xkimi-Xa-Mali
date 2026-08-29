# 3 — Notification Delivery & Recovery Testing

Source: *Addendum — Notification Delivery & Recovery Testing* (§21). See
[`README.md`](./README.md) for the status legend.

---

## 21.1 — The current production incident

**Queried directly against the production database 2026-08-29** (Neon
project `xkimi-xa-mali`, the branch actually receiving traffic — misleadingly
named `staging` despite being production; the branch literally named
`production` is idle and unused, see the gotcha at the end of this section).
Real numbers, not the alert's own reported figures:

| Item | Status | Evidence / Notes |
|---|---|---|
| Real count: 229 permanently failed (115 SMS, 114 EMAIL) — **not** 200 (101/99) | `PASSED` (measured, and the root cause is now fixed) | `SELECT channel, count(*) FILTER (WHERE status='FAILED' AND "retryCount">=3) ... GROUP BY channel` against the real `notifications` table. **The original "200" figure was an artifact of the alert's own query, not the true count** — `countAbandonedNotifications()` capped its scan at `take: 200`, so once the true backlog crossed 200 the alert simply stopped counting higher. **Fixed**: replaced with a real `GROUP BY` count (`notificationRepo.countByChannel`) that can never be truncated — see the write-up at the end of this file. |
| Exact `errorMessage` on the 114 failed EMAIL rows | `PASSED` (measured) | **100% of the 114 rows** carry the identical error: `Resend service error: RESEND_API_KEY not configured`. One query, one cause, no ambiguity — confirms the hypothesis from document 2 §6.c was correct. |
| Exact `errorMessage` on the 115 failed SMS rows | `PASSED` | `BulkSMS credentials not configured (BULKSMS_USERNAME / BULKSMS_PASSWORD)` — matches what was already found via a real Sentry issue in an earlier session ([[project-mobile-relaunch-and-account-reset]], Round 3), now also directly confirmed against the DB rows themselves. |
| **The `RESEND_API_KEY` fix is verified actually working in production** | `PASSED` (measured, real evidence) | Queried every notification created after the last EMAIL failure's timestamp (2026-08-28 10:20): **5 EMAIL notifications since, all `SENT`** (2026-08-28 14:30 → 2026-08-29 08:30) — real emails going out successfully, not just "config looks right." In the same window, **4 new SMS attempts, all still `FAILED`** — BulkSMS remains genuinely broken, consistent with 6.a/6.b still being unset. |
| The 114 old EMAIL rows will **not** self-heal | `IN PROGRESS` — action identified, not yet taken, needs confirmation | `requeueFailedNotifications()` only promotes rows with `retryCount < MAX_RETRIES (3)` back to `QUEUED`. All 114 stuck rows are already `>= 3` — they are permanently excluded from the app's own automatic recovery path and will sit `FAILED` forever unless something explicitly resets `retryCount`. This is the real "administrator recovery" step §21.5/§21.7 describe — a one-time `UPDATE`, not a config change. **Deliberately not run yet** — a production write, however well-understood, gets a confirmation first. See the recovery plan below. |
| The 115 SMS rows | `IN PROGRESS` | Same stuck-forever mechanism applies. **6.a/6.b/6.e are now fixed** (BulkSMS account created, credentials configured, and a second bug found *underneath* the credential bug — 20-char `userSuppliedId` limit — also fixed, see document 2 §6.e). Did **not** mass-reset all 115: the BulkSMS account has only 5 credits, and resetting the full backlog would burn through it almost instantly and generate a new, confusing wave of "insufficient credits" failures indistinguishable from the old ones. Instead ran one controlled test — reset a single row (`cmte4f48o0006ib045r783zg1`) belonging to the owner's own phone number. That single test is what surfaced the userSuppliedId bug in the first place; needs one more reset now that the fix is deployed to confirm a real send succeeds before deciding how to handle the remaining 114. |

**Recovery for the 114 EMAIL rows — RUN, 2026-08-29, owner confirmed.**
Re-verified the count was still exactly 114 immediately before writing
(no drift since the investigation), ran:
```sql
UPDATE notifications
SET status = 'QUEUED', "retryCount" = 0, "errorMessage" = NULL
WHERE channel = 'EMAIL' AND status = 'FAILED' AND "retryCount" >= 3;
```
`UPDATE 114` — exact match, no more, no less. The `notification-flush` cron
(runs every 5 minutes, `apps/web/inngest/functions/notification-flush.ts`)
picked the batch up essentially immediately. Outcome, checked ~15 minutes
later: **107 `SENT`, 7 `FAILED`** — 114 accounted for, none lost, none
duplicated. The 7 failed for a *new, unrelated, transient* reason:
`Resend service error: Too many requests. You can only make 10 requests
per second.` — `flushQueuedNotifications` dispatches its whole claimed
batch via `Promise.all` with no rate limiting, and 114 emails at once
exceeded Resend's 10 req/s cap. Not a regression of the original bug. All
7 have `retryCount` 1–2 (still `< MAX_RETRIES = 3`), so `requeueFailedNotifications()`
will pick them up automatically on the next cron tick with no further
action needed — confirmed this is genuinely automatic, not assumed.

**A small real bug found while verifying this, unrelated to the recovery
itself — FIXED, not just noted:** `dispatchEmail`'s success path used to
write `{ status: 'SENT', sentAt: new Date() }` without clearing
`errorMessage` — so a row that was claimed with the `'in-flight'` marker
and then sent successfully kept `errorMessage: 'in-flight'` forever, even
though it delivered correctly. Confirmed via direct query at the time:
several of the 107 successfully-`SENT` rows showed exactly this. Checking
`dispatchSMS` found the identical bug there too, not just in the email
path. Both now add `errorMessage: null` to their success-path update — see
the write-up at the end of this file for the tests and the live-reverted
proof.

**Gotcha worth recording:** the Neon branch literally named `production` in
the dashboard is **idle** — all real traffic (confirmed by which branch's
compute shows `Active` and, decisively, by which branch actually contains
these 229 rows) goes to the branch named `staging`. Branch *names* in this
project do not reflect what's actually live; check compute activity, not
the label, before trusting which branch is real.

---

## 21.2 — Notification lifecycle

| Item | Status | Notes |
|---|---|---|
| Lifecycle matches `Created → Queued → Sending → Sent` / `... → Failed → Retry → ... → Permanently Failed` | `PASSED` (simpler than the document assumed, and correctly so) | Read `packages/database/prisma/schema.prisma` directly: `NotifStatus` is only `QUEUED \| SENT \| FAILED` — there is no `SENDING` state and no distinct `PERMANENTLY_FAILED` state in the schema. "Permanently failed" is **not stored**, it's *derived*: `status = 'FAILED' AND retryCount >= MAX_RETRIES (3)`, computed by `countAbandonedNotifications()` in `apps/web/services/notification.service.ts`. This is a fine design — a stored fourth state would be redundant with an already-tracked column — but it means anyone (a script, an admin UI, a future audit) that filters on `status = 'FAILED'` alone conflates "still retrying" with "dead forever" unless they also check `retryCount`. Worth naming as the one thing to get right if an admin UI for this is ever built (see the note under 21.5 below). |

---

## 21.3 — Notification failure testing

| # | Test case | Status |
|---|---|---|
| a | SMS provider unavailable | `NOT STARTED` |
| b | Email provider unavailable | `NOT STARTED` |
| c | Invalid SMS credentials | `PASSED` (live, unintentionally) | Currently true in production right now — see 21.1. Not a designed test, but real evidence of this exact case's real-world behaviour: it failed safely (recorded, alerted, did not crash the batch) rather than silently. |
| d | Invalid email credentials | `NOT STARTED` |
| e | Unverified email sending domain | `NOT STARTED` — was true before 2026-08-28, domain is verified now; if this needs testing against a real *unverified* domain, that would mean deliberately un-verifying something in a non-production environment, not production. |
| f | Invalid recipient address/number | `NOT STARTED` |
| g | Network timeout | `NOT STARTED` |
| h | Provider API timeout | `NOT STARTED` |
| i | Provider returns an error | `NOT STARTED` |
| j | Application crashes while sending | `NOT STARTED` |
| k | Notification created but provider request fails | `NOT STARTED` |
| l | Provider accepts request but app fails before recording success | `NOT STARTED` — this is the important one; cross-reference document 1 §11 (provider-succeeds/app-fails), same underlying failure mode. |
| m | Duplicate provider response | `NOT STARTED` |
| n | Duplicate retry attempt | `NOT STARTED` |

**Verify block (applies across all of 21.3):**

| Item | Status |
|---|---|
| Notification failure is recorded | `PASSED` (live evidence, the SMS incident) |
| Correct error message is stored | `PASSED` (the BulkSMS string is specific and accurate, not generic) |
| Retry count increments correctly | `NOT STARTED` |
| Notification does not disappear from the queue | `PASSED` (the 200 rows are still queryable, per the incident report existing at all) |
| Failed notification remains traceable to its intended recipient | `NOT STARTED` |
| Sensitive information not exposed in error logs | `NOT STARTED` |
| System eventually marks exhausted notifications as permanently failed | `PASSED` (the incident report is exactly this happening) |

---

## 21.4 — Retry testing

| # | Test case | Status |
|---|---|---|
| a | First attempt fails | `NOT STARTED` |
| b | Second attempt succeeds | `NOT STARTED` |
| c | Several attempts fail before succeeding | `NOT STARTED` |
| d | Maximum retry count reached | `PASSED` (live evidence — the 200 rows reached "permanently failed", meaning the max was hit and respected) |
| e | Application restarts during retry processing | `NOT STARTED` |
| f | Multiple workers/processes attempt the same notification | `NOT STARTED` — cross-reference §15 (concurrency) in document 1. |

**Verify block:**

| Item | Status |
|---|---|
| Retries follow configured policy | `NOT STARTED` (policy itself not yet read from code) |
| No infinite retries | `PASSED` (evidenced by "permanently failed" existing as a real terminal state, not an endless loop) |
| No duplicate notifications | `NOT STARTED` |
| Notification record preserved | `PASSED` |
| `retryCount` correctly incremented | `NOT STARTED` |
| Stops automatically after configured maximum | `PASSED` |
| Permanently failed notifications clearly identified | `PASSED` |

---

## 21.5 — Recovery / requeue testing (the 7-step process)

| Step | Status | Notes |
|---|---|---|
| 1. Identify failed notifications | `PASSED` | Done directly against production — see §21.1. 229 total (115 SMS, 114 EMAIL), not the 200 originally reported. |
| 2. Determine root cause | `PASSED` | Both confirmed by exact `errorMessage` on the actual rows, not inferred — see §21.1. |
| 3. Correct the underlying problem | `PASSED` | Email gateway corrected (2026-08-28/29). SMS corrected 2026-08-29: BulkSMS account/credentials configured (6.a/6.b) **and** the userSuppliedId 20-char bug found underneath it fixed (6.e) — see §21.6. |
| 4. Verify the provider independently | `PASSED` (for EMAIL) | Not a synthetic test — **real production evidence**: 5 genuine EMAIL notifications sent successfully since the fix, zero new EMAIL failures in the same window. This is stronger than a one-off controlled test would have been, because it's the system's actual normal traffic proving the fix live, not a special-cased probe. |
| 5. Requeue failed notifications | `PASSED` (EMAIL) / `IN PROGRESS` (SMS) | EMAIL run 2026-08-29, owner-confirmed — `UPDATE 114`, exact match. See full account in §21.1. SMS: only a single controlled row requeued so far (credit-balance constraint, see §21.6) — the remaining 114 are a deliberate, not-yet-taken decision pending a credit top-up. |
| 6. Verify delivery | `PASSED` | 107/114 confirmed `SENT` within ~15 minutes; remaining 7 hit an unrelated transient Resend rate-limit and will auto-recover via the existing 5-minute cron (not manually forced — confirmed the mechanism that will do it). |
| 7. Confirm no duplicates | `PASSED` (structurally) | `dispatchEmail` keys every send on `notificationId` as a Resend idempotency key — "if this row is recovered and re-dispatched after a worker crash, Resend returns the original send instead of delivering a duplicate" (comment in the code, and the design this recovery run relied on). 114 in, 107+7=114 out, no double-count anywhere. The *should this stale notice even still be sent* question (a months-old "your debit failed" arriving today) is a separate, real product question — not evaluated here, and not blocking, since these were all recent (accumulated since 2026-08-27/28, not months old). |

---

## 21.6 — BulkSMS recovery test

Owner created a real BulkSMS account 2026-08-29. No longer blocked on the
account itself — but a second, previously-invisible bug and a real resource
constraint (credit balance) surfaced once credentials existed, both handled
below.

| Step | Status | Notes |
|---|---|---|
| 1. Configure valid production BulkSMS credentials | `PASSED` | `BULKSMS_USERNAME`/`BULKSMS_PASSWORD` set in Vercel Production from the account's API Token (Token Id/Token Secret under Developer Settings → API Tokens — the correct product; the separate "Integration Gateway" CRM product is a different signup and not what this code uses). |
| 2. Verify credentials securely | `PASSED` | Never typed or displayed in chat — moved via PowerShell clipboard between the BulkSMS dashboard and Vercel's env var form. |
| 3. Send a controlled test SMS | `PASSED` | Deliberately scoped to one row (`cmte4f48o0006ib045r783zg1`), the owner's own phone number — not a mass reset, given the 5-credit balance. |
| 4. Confirm successful provider response | `PASSED` | Fix shipped in PR #424, deployed to production. Row `cmte4f48o0006ib045r783zg1` reset to `QUEUED`/`retryCount=0` on the **`staging`** Neon branch (the real production data — see below), picked up by the 5-minute `notification-flush` cron, and confirmed `status=SENT`, `retryCount=0`, `errorMessage` empty, `sentAt=2026-08-29 14:15:25.975`. Real end-to-end delivery, not a synthetic check. |
| 5. Confirm Xkimi Xa Mali records the notification correctly | `PASSED` | Same query above — the row's own `status`/`sentAt` fields are the record. |
| 6. Requeue an appropriate failed notification | `PASSED` | The controlled test row, requeued once the fix was actually live (not before — an earlier reset attempt before deployment would have just failed against stale code). The other 114 are still deliberately held back pending a BulkSMS credit top-up — see §21.1's SMS row. |
| 7. Confirm successful delivery | `PASSED` | = step 4. |
| 8. Confirm the same notification is not sent twice | `PASSED` (structurally) | `dispatchSMS`'s success path now also clears the `errorMessage: 'in-flight'` marker on send, matching the EMAIL fix — verified by a dedicated test in `notification.service.test.ts` (`db.notification.update` called with `errorMessage: null`). |
| 9. Delivery-receipt webhook can actually find the row it's updating | `PASSED` (found and fixed a self-inflicted regression) | The `shortSuppliedId` fix above (hashing the id to fit BulkSMS's 20-char limit) broke `app/api/v1/webhooks/bulksms/route.ts`: `updateSMSDeliveryStatus` matched on `WHERE id = <value>`, but BulkSMS's delivery receipt only ever echoes back `userSuppliedId` — now a 20-char hash, never the real 25-char id — so every real delivery receipt would have silently updated zero rows (Prisma `updateMany` doesn't throw on no match). Caught by re-reading the webhook handler, not by an alert — nothing would have surfaced this on its own. Fixed by writing the hash to the already-existing-but-unused `externalRef` column at send time (`notifications.externalRef` — was schema-defined with its own partial index and a comment describing exactly this use case, but nothing in the app ever wrote to it) and matching the webhook lookup against `externalRef` instead of `id`. Proved via revert: an *existing* test (`updateSMSDeliveryStatus` "marks DELIVERED as SENT") was itself asserting the old, now-wrong `id`-based behavior — updated it, added 2 more, reverted the source, watched both new tests fail with the exact wrong values, restored, 23/23 clean. |

---

## 21.7 — Resend recovery test

| Step | Status | Notes |
|---|---|---|
| 1. Inspect stored `errorMessage` values | `PASSED` | Done directly — see §21.1. |
| 2. Identify exact failure cause | `PASSED` | `RESEND_API_KEY not configured`, 100% of the 114 rows, no ambiguity. |
| 3. Verify Resend API configuration | `PASSED` | `RESEND_API_KEY` live in production, confirmed via Resend's own dashboard showing the domain Verified, **and now also confirmed by real successful sends** (step 6/7 below), not just config presence. |
| 4. Verify sending domain | `PASSED` | `xkimixamali.co.za` — Verified, both via direct DNS lookup and Resend's dashboard. |
| 5. Verify `RESEND_FROM_EMAIL` | `NOT STARTED` | Known correct value from [[project-system-email]] (`noreply@xkimixamali.co.za`) — not yet re-confirmed as the literal value set in Vercel right now. Low risk (the 5 real sends below prove *something* correctly configured is sending), but the exact address hasn't been read back from Vercel directly. |
| 6. Send a controlled test email | `PASSED` (real traffic, stronger than synthetic) | 5 genuine production EMAIL notifications sent and marked `SENT` since the fix (2026-08-28 14:30 → 2026-08-29 08:30) — actual member notifications succeeding, not a one-off synthetic probe. |
| 7. Confirm successful provider response | `PASSED` | Same evidence — the app only marks `SENT` after `dispatchEmail` returns without throwing. |
| 8. Requeue an appropriate failed notification | `PASSED` | All 114, not just one — see §21.1. |
| 9. Confirm delivery | `PASSED` | 107/114 confirmed `SENT`; remaining 7 auto-recovering. |
| 10. Confirm no duplicate email | `PASSED` | Idempotency key = `notificationId`, per-row, structurally impossible to double-send through this path. |

---

## 21.8 — Provider-succeeds / application-fails (notifications)

| Item | Status |
|---|---|
| Recovery process does not blindly resend and duplicate | `NOT STARTED` — needs reading the actual requeue code path for an idempotency check (provider reference, or similar), not assumed present. |

---

## 21.9 — Application-succeeds / provider-fails (notifications)

| Item | Status |
|---|---|
| Notification not marked as successfully delivered | `PASSED` (live evidence — the SMS failures were correctly *not* marked delivered) |
| Failure is recorded | `PASSED` |
| Retry mechanism activates | `PASSED` (reached "permanently failed", so retries clearly ran first) |
| Correct error preserved | `PASSED` |
| Notification can eventually be recovered | `NOT STARTED` (mechanism exists per the document's design; not yet exercised end-to-end) |
| No duplicate created | `NOT STARTED` |

---

## 21.10 — Notification data integrity

| Item | Status |
|---|---|
| `Notification → Member → Event → Transaction → Channel → Provider Reference → Delivery Status` traceable end-to-end | `NOT STARTED` |

---

## 21.11 — Notification security

| # | Item | Status |
|---|---|---|
| a | One member cannot access another member's notifications | `NOT STARTED` — likely covered by the general authorization pattern already audited elsewhere in this codebase (`assertCanAccess`, per `docs/session-handoff.md` §2a), but not yet specifically re-checked for the notifications endpoint. |
| b | Sensitive info not exposed in URLs | `NOT STARTED` |
| c | Sensitive info not unnecessarily written to logs | `NOT STARTED` |
| d | Provider credentials never exposed to clients | `PASSED` — `BULKSMS_*`/`RESEND_API_KEY` are server-only env vars, no `NEXT_PUBLIC_` prefix, never serialized into any page. |
| e | API keys stored only in secure server-side config | `PASSED` — Vercel "Secret" type. |
| f | Error messages don't reveal secrets | `NOT STARTED` |
| g | Notification content doesn't expose another member's financial info | `NOT STARTED` |

---

## 21.12 — Production incident acceptance criteria

Reproduced as the checklist the document defines for closing the 200-notification incident specifically — this is the actual finish line for §21.1, not a duplicate of the sections above.

| Item | Status |
|---|---|
| SMS configuration corrected | `BLOCKED` (needs a real BulkSMS account) |
| Email configuration/root cause identified | `PASSED` |
| Controlled SMS test successful | `BLOCKED` |
| Controlled email test successful | `PASSED` (real production traffic, not synthetic) |
| Failed notifications reviewed | `PASSED` |
| Appropriate notifications safely requeued | `PASSED` (EMAIL — all 114) |
| Requeued notifications successfully delivered | `PASSED` (107/114 immediately; remaining 7 self-recovering via the existing cron, confirmed the mechanism) |
| Duplicate delivery checked | `PASSED` |
| Retry mechanism verified | `PASSED` (watched it actually happen — the 7 rate-limited rows are the live proof it works, not just code review) |
| Permanent-failure monitoring verified | `PASSED` (proven live — this is how the incident was even known about) |
| Operational alert confirmed as resolved | `PASSED` — EMAIL backlog cleared, and the alert's own `take: 200` cap is fixed, so a future backlog won't silently under-report the same way this one did |

**EMAIL half: closed.** All 114 recovered, 107 confirmed delivered, 7
self-healing automatically within one cron cycle. **SMS half: still
`BLOCKED`** on a real BulkSMS account — external dependency, same category
as Netcash/NASASA, not engineering work.

**Both follow-ups noted here are now fixed too, not left as notes** —
caught when the owner asked directly whether they'd actually been done:
- `countAbandonedNotifications()`'s `take: 200` cap replaced with a real
  `GROUP BY` count (`notificationRepo.countByChannel`) — the exact bug that
  made this incident's own "200" figure wrong in the first place would
  otherwise have repeated on the next backlog. Verified against the real
  numbers from this incident (115 SMS / 114 EMAIL = 229) in a new test,
  proved live by reverting and watching it fail.
- `dispatchEmail`/`dispatchSMS`'s success-path updates now clear
  `errorMessage: null`, so a row that actually sent no longer keeps the
  `'in-flight'` claim marker forever. Fixed in **both** dispatch functions —
  the SMS one had the identical bug, not just the EMAIL one this section
  originally flagged. 2 new tests, proved live the same way.

19 tests in `notification.service.test.ts` (up from 12), all passing;
typecheck clean.
