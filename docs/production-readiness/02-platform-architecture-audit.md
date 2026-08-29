# 2 — Platform & Architecture Audit Report

Source: *Platform & Architecture Audit Report*, dated 28 August 2026, domain
`xkimixamali.co.za`. See [`README.md`](./README.md) for the status legend and
how to use this file.

**Read this first:** the source document hedges several claims with
"reportedly" — that word means *it* was relaying something, not verifying it.
Every row below has been checked against this repository or a live
deployment directly; none are carried over as true just because the document
said so.

---

## 2.1–2.2 — Domain registration & registrar compliance

| # | Item | Status | Evidence / Notes | Date |
|---|---|---|---|---|
| 2.1 | Domain `xkimixamali.co.za` registered | `PASSED` | Registered at domains.co.za, owner paid directly (~R109/yr renewal). Confirmed live: resolves via both `8.8.8.8` and `1.1.1.1`. | 2026-08-28 |
| 2.2 | Registrar physical-address verification, to avoid `clientHold` | `BLOCKED` — **highest-priority open item in this whole tracker** | WHOIS "Company" field still shows **"North West University"**, not KSDRILL SA — an unrelated leftover from the registrar's own default/placeholder, not something set by us. An "Update Pending" badge was seen on the domain record, suggesting the owner may already have started correcting it. **Two independent sessions landed on this same gap from different angles** (this audit document, and [[project-deployment-phase]] noticing the WHOIS field directly) — treat as real. **Action needed:** confirm with the owner whether they've already submitted the correction; if not, do it before this drifts into an actual `clientHold`. | 2026-08-28 (found) / open |

---

## 3 — DNS & network status

| # | Item | Status | Evidence / Notes | Date |
|---|---|---|---|---|
| 3.a | Domain resolves consistently | `PASSED` | `nslookup xkimixamali.co.za` against both `8.8.8.8` and `1.1.1.1` resolves correctly. | 2026-08-29 |
| 3.b | HTTPS certificate valid | `PASSED` | `curl -o /dev/null -w "%{http_code}"` returned `200` over `https://` for both apex and `www`. | 2026-08-28 |
| 3.c | `www`/root-domain behaviour correct | `PASSED` | Vercel's "Add Existing" flow auto-created the apex + `www` pair with an apex→www redirect; both serve the public website (`<title>` matches HeroSection copy, confirmed by curling both directly). | 2026-08-28 |
| 3.d | Vercel deployment responds consistently | `PASSED` | Confirmed same session, both apex and `www`. | 2026-08-28 |
| 3.e | DNS records match intended production config | `PASSED` | Apex/`www` → website, `member.` → member app, `admin.` → admin app — all three added and verified resolving via `nslookup` against `8.8.8.8`. | 2026-08-29 |
| 3.f | Mobile and desktop networks can both access the platform | `IN PROGRESS` | Owner reported "works on PC, not on phone." Diagnosed as DNS-resolver propagation lag (different networks' resolvers — especially mobile-carrier DNS on cellular data vs. wifi/ISP DNS — catch up to a brand-new `.co.za` registration at different speeds), not a real config defect; both `8.8.8.8` and `1.1.1.1` already resolve correctly. **Not yet reconfirmed working from the owner's actual phone** — ask for a follow-up check. | 2026-08-29 |
| 3.g | No unexpected redirects | `NOT STARTED` | | |
| — | *Note on the audit's own IP claim* | `MOOT` | The audit cites "Observed Vercel IPv4: `76.76.21.21`" as the expected target. Current DNS actually resolves to `216.198.79.1` / `64.29.17.65` etc., under Vercel's newer `*.vercel-dns-017.com` scheme — Vercel's own UI states "We're expanding our IP range" and that the legacy `76.76.21.21` record still works too. Not a discrepancy to chase; both are valid, the audit's IP is just the older one. | 2026-08-29 |

---

## 4 — GitHub repository & build analysis (the two named branches)

| # | Item | Status | Evidence / Notes | Date |
|---|---|---|---|---|
| 4.a | `perf/website-performance` — investigate startup crash | `MOOT` | This was PR **#114**, merged to `main` 2026-06-09 (`perf(website): replace nextjs-toploader, stream stats, add fetch timeout`) — three months before this audit's date. Branch deleted after merge, per this repo's normal branch-per-task cleanup (confirmed via `git branch -r` — does not exist). `main` has been building green under working CI since 2026-08-15 ([[project-ci-never-runs]]). Nothing here to fix now. | 2026-08-29 |
| 4.b | `feat/phase-10-performance` — investigate startup crash | `MOOT` | **No trace anywhere** — checked `git branch -r` (not present, local or remote), `gh pr list --search "phase-10"` (zero results), `git log --all --grep="phase-10" -i` (zero results). Either this branch never reached this repository, was a local-only experiment on someone's machine, or the audit's claim was inaccurate to begin with. Recorded so nobody re-raises it from the document alone — there is nothing in this repo to investigate. | 2026-08-29 |

---

## 5 — Security hotfix verification (password exposure during rendering)

| # | Item | Status | Evidence / Notes | Date |
|---|---|---|---|---|
| 5.a | Passwords never appear in URLs | `PASSED` | Root cause: a bare `<form>` with no `method` defaults to GET on a native submit that races React hydration — submitting the instant the page painted, before `onSubmit` could intercept, put the password straight into the URL/history/logs. Fixed in **PR #411**: added `method="post"` (pure fallback) to every password-collecting form in both apps — login (web + admin), register, invite-register, reset-password, change-password. | 2026-08-28 |
| 5.b | Passwords never appear in query parameters | `PASSED` | Same fix as 5.a — the GET fallback was the only mechanism that could have put them there. | 2026-08-28 |
| 5.c | Passwords not exposed through client-side routing | `PASSED` | Read every `onSubmit` in `LoginForm.tsx` directly: `router.push(callbackUrl as Route<string>)` — only the redirect target ever reaches `router.push`, the password variable never does. Same pattern (only `signIn()`'s internal fetch or a controlled `fetch(...)` POST body ever sees the password) confirmed across all 6 password-collecting components. | 2026-08-29 |
| 5.d | Password values not accidentally rendered into HTML | `PASSED` | All 6 components are `'use client'` with the password held only in local `useState`/`react-hook-form` state, submitted via `signIn('credentials', ...)` (NextAuth's own client-side POST) or a direct `fetch` — never returned from a Server Component, never serialized into RSC payload. Also checked: no `sendDefaultPii`/request-body-logging config anywhere in the repo that could pull it into an error report. | 2026-08-29 |
| 5.e | Password values not written to browser history | `PASSED` | Same fix as 5.a — a GET submit is what writes the URL (with the password in it) to history; the POST fallback prevents the GET entirely. | 2026-08-28 |
| 5.f | Sensitive credentials not included in logs | `PASSED` | Read `authorizeCredentials` in both `apps/web/lib/auth.ts` and `apps/admin/lib/auth.ts` line by line: every `logger.*` call passes `{ userId, attempts, locked, minutesLeft }` — metadata only. `parsed.data.password` is passed to `bcrypt.compare` and nowhere else. No generic error handler in the repo logs a raw request body. | 2026-08-29 |
| 5.g | Patch remains present in the production branch | `PASSED` | PR #411 is squash-merged to `main`, which is the only branch and the one every Vercel project deploys from. | 2026-08-28 |
| 5.h | Regression testing prevents the vulnerability from returning | `PASSED` | Added `apps/web/__tests__/password-form-post-fallback.test.ts` and `apps/admin/__tests__/password-form-post-fallback.test.ts` — scans every component for a password `autoComplete` attribute and asserts its `<form>` carries `method="post"`, mirroring this repo's existing `member-session-guards.test.ts` pattern. **Proved it's a real guard, not a tautology**: an initial version string-matched raw source and kept passing after `method="post"` was deliberately stripped from a real `<form>`, because the file's own explanatory *comment* about the fix still contained the literal text `method="post"`. Fixed to strip comments and require the attribute inside an actual `<form>` tag; re-tested the deliberate break and confirmed it now fails, then confirmed it passes again on the restored file. 8/8 passing. | 2026-08-29 |

**A note on how 5.h was verified, since it's the one row where "I wrote a
test" isn't automatically evidence of anything:** the first version of this
test was itself wrong — it would have shipped as a green regression guard
that could never actually turn red. Catching that before recording this row
`PASSED` is the whole point of this tracker's evidence discipline; a test
that has never been watched to fail is not proven to catch anything.

---

## 6 — Production environment variables

| # | Item | Status | Evidence / Notes | Date |
|---|---|---|---|---|
| 6.a | `BULKSMS_USERNAME` configured | `PASSED` | Owner created a real BulkSMS account and its API Token (Token Id = username). Set in `xkimi-xa-mali-web` Production (not Preview — acceptable, SMS is never exercised in preview). Confirmed live: a controlled single-row send against the owner's own number returned a real BulkSMS validation error rather than the old "not configured" error, proving the credentials themselves are accepted. | 2026-08-29 |
| 6.b | `BULKSMS_PASSWORD` configured | `PASSED` | Set alongside 6.a (Token Secret). Same evidence. | 2026-08-29 |
| 6.e | `userSuppliedId` within BulkSMS's 20-char limit | `IN PROGRESS` — fixed in code, **not yet deployed** | Newly discovered *after* 6.a/6.b were fixed: the controlled test send failed with `BulkSMS 400: Validation error: items[0].userSuppliedId size must be between 1 and 20` — this system's Prisma cuid notification ids are 25 characters. Fixed in `apps/web/services/notification.service.ts` with a deterministic SHA-256-hash-based 20-char id (`shortSuppliedId`), not truncation (cuids share a timestamp-ish prefix, so truncating risks more collisions than hashing). Proved via revert: reverting to the raw id makes the new length assertion fail with `expected 25 to be less than or equal to 20`; restored, full 21-test file passes clean. **Still sitting uncommitted on `main` along with every other fix from this session** — nothing here is live in production until committed, pushed, and deployed. | 2026-08-29 |
| 6.c | `RESEND_API_KEY` configured | `PASSED` | Set in `xkimi-xa-mali-web` production. Domain `xkimixamali.co.za` shows **Verified** in Resend's own dashboard, not just DNS propagation. | 2026-08-28/29 |
| 6.d | Sentry integration keys configured | `PASSED` | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` set for both `web` and `admin` projects, both redeployed. Confirmed capturing real errors (the BulkSMS error above was found *through* this). | 2026-08-27 |

---

## 7 — SMS gateway

| # | Test case | Status | Evidence / Notes |
|---|---|---|---|
| 7.a | OTP generation | `NOT STARTED` | Credentials + userSuppliedId bug (6.a/6.b/6.e) are now fixed — no longer blocked, just not yet exercised for OTP specifically. |
| 7.b | OTP dispatch | `NOT STARTED` | Same. General SMS dispatch is now proven reachable (the controlled test row got past BulkSMS validation and into real send territory); OTP-specific dispatch is still untested. |
| 7.c | OTP verification | `NOT STARTED` | |
| 7.d | Invalid OTP handling | `NOT STARTED` | |
| 7.e | Expired OTP handling | `NOT STARTED` | |
| 7.f | SMS failure handling | `PASSED` | Proven twice now: first via the credential-missing failure (correctly caught, logged, surfaced via Sentry), then via the userSuppliedId validation failure after credentials were fixed (same clean failure path, different real cause). **New constraint found 2026-08-29, not a bug:** the BulkSMS account currently has only 5 credits. Deliberately did NOT mass-reset the 115 stuck SMS notifications' `retryCount` — that would burn the balance almost instantly and bury the real backlog under a new wave of "insufficient credits" failures indistinguishable from the old ones. Recommend the owner top up credits before any bulk retry. |
| 7.g | No sensitive info unnecessarily in SMS content | `NOT STARTED` | |
| 7.h | Duplicate SMS prevention | `NOT STARTED` | Cross-reference document 1 §1 and §13 (idempotency, webhook reliability) — likely the same underlying mechanism, don't test twice independently. |

---

## 8 — Email gateway

| # | Test case | Status | Evidence / Notes |
|---|---|---|---|
| 8.a | Account email | `NOT STARTED` | Gateway is now configured (6.c) — this can actually be tested now, unlike the SMS section. |
| 8.b | Transaction notification | `NOT STARTED` | |
| 8.c | Receipt delivery | `NOT STARTED` | |
| 8.d | Invalid recipient handling | `NOT STARTED` | |
| 8.e | Provider/API failure handling | `NOT STARTED` | |
| 8.f | Duplicate email prevention | `NOT STARTED` | |
| 8.g | Email content accuracy | `NOT STARTED` | |
| 8.h | Sensitive information handling | `NOT STARTED` | |

---

## 9 — Error tracking (Sentry)

| # | Test case | Status | Evidence / Notes |
|---|---|---|---|
| 9.a | Runtime exceptions appear in Sentry | `PASSED` | Directly observed — the BulkSMS credential error and a separate `notification-flush` `TypeError` (fixed in PR #416) were both found by reading real captured Sentry issues. |
| 9.b | Server-side failures captured | `PASSED` | Same evidence as 9.a. |
| 9.c | Client-side failures captured where intended | `PASSED` | `window.__SENTRY__` confirmed `true` on the live page after moving both apps' client init from the dead `sentry.client.config.ts` (pre-v8 convention, never loaded) to `instrumentation-client.ts` (what current Next.js actually auto-loads). Found and fixed as a bonus while debugging an unrelated signature-save CSP bug. |
| 9.d | Sensitive information not unnecessarily transmitted | `NOT STARTED` | |
| 9.e | Production environment correctly identified | `NOT STARTED` | |
| 9.f | Source maps/configuration handled appropriately | `NOT STARTED` | `SENTRY_AUTH_TOKEN` (source-map upload) was deliberately **not** set — creating a Sentry API token wasn't attempted. Monitoring works without it; stack traces just won't be de-minified. Worth deciding deliberately, not by default. |
| 9.g | Alerts configured for critical failures | `NOT STARTED` | Distinct from this app's own operational alerting (`ALERT_FALLBACK_EMAIL`, [[project-operational-alerting]]) — this row is specifically about Sentry's own alert rules. |

---

## 10 — Required action plan (the audit's own 4 priorities)

| # | Priority | Status | Notes |
|---|---|---|---|
| 10.1 | Protect domain availability (registrar verification) | `BLOCKED` | = row 2.2 above. Still the single most urgent item in this tracker. |
| 10.2 | Configure production secrets (SMS/email/Sentry) | `PASSED` | Email + Sentry done (6.c, 6.d). SMS now done too (6.a, 6.b, 6.e) — credentials configured and the userSuppliedId length bug that was blocking real sends is fixed. Full backlog delivery still gated on the owner topping up BulkSMS credits (currently 5), tracked separately in document 3 §21.6, not a config gap. |
| 10.3 | Investigate performance-branch crashes | `MOOT` | = rows 4.a/4.b above. Neither branch exists to investigate. |
| 10.4 | Verify security hotfix (password exposure) | `PASSED` | = section 5 above, all 8 sub-items now individually verified with a regression test guarding it going forward. |

---

## 11 — The audit's own production readiness checklist

Reproduced verbatim as rows rather than re-summarized, so every original box
gets its own status rather than being folded into the sections above.

### Domain & DNS
| Item | Status |
|---|---|
| Registrar verification completed | `BLOCKED` (= 2.2) |
| No pending `clientHold` risk | `BLOCKED` (= 2.2) |
| DNS propagation complete | `PASSED` (= 3.a–3.e) |
| Root domain resolves correctly | `PASSED` |
| Required subdomains resolve correctly | `PASSED` (`member.`, `admin.` added 2026-08-29) |
| HTTPS works correctly | `PASSED` |
| Domain redirects verified | `NOT STARTED` (= 3.g) |

### Deployment
| Item | Status |
|---|---|
| Production branch builds successfully | `PASSED` — CI green on `main` since 2026-08-15 ([[project-ci-never-runs]]) |
| Production deployment starts successfully | `PASSED` — all 3 Vercel projects live, health checks `ok` |
| No startup crashes | `PASSED` (current `main`) — the two branches with reported crashes no longer exist (§4) |
| Serverless functions initialize correctly | `NOT STARTED` — not explicitly re-verified beyond health-check `ok` |
| Runtime environment correctly configured | `NEEDS FIX` — BulkSMS now done (6.a/6.b/6.e), but flipping `DEPLOY_ENV=production` today would break the build: 7 `requiredWhenLive` vars confirmed **entirely absent** via a live search of every var on the `xkimi-xa-mali-web` Vercel project (2026-08-29): `NETCASH_SERVICE_KEY`, `NETCASH_API_URL`, `NETCASH_WEBHOOK_SECRET`, `NETCASH_DEBICHECK_TEMPLATE_ID`, `NEXTAUTH_URL`, `ADMIN_WHATSAPP_NUMBER`, `SUPPORT_EMAIL`. Currently safe only because `DEPLOY_ENV=staging` keeps `isLiveDeployment()` false, so `env.ts` doesn't enforce them yet — see the go-live section in document 1 §14 and `DEPLOYMENT.md`'s warning box. |

### Environment
| Item | Status |
|---|---|
| SMS credentials configured | `PASSED` (= 6.a/6.b/6.e) |
| Email credentials configured | `PASSED` (= 6.c) |
| Sentry configured | `PASSED` (= 6.d) |
| Go-live (`requiredWhenLive`) credentials configured | `NEEDS FIX` — see the `Runtime environment correctly configured` row above. None of the 7 vars exist yet in any environment on Vercel, not just Production. |
| Secrets not committed to Git | `NOT STARTED` — worth an explicit `git log -p` / secret-scan pass rather than assuming |
| Production and development variables separated appropriately | `PASSED` — Vercel Production/Preview/Development scoping used throughout ([[project-deployment-phase]]) |

### Security
| Item | Status |
|---|---|
| Credential-exposure hotfix verified | `PASSED` (= section 5, all 8 sub-items) |
| Passwords never appear in URLs | `PASSED` (= 5.a) |
| Sensitive data excluded from logs | `PASSED` (= 5.f) |
| Authentication flows tested | `NOT STARTED` — cross-reference document 1 §5, don't duplicate |
| Authorization flows tested | `NOT STARTED` — cross-reference document 1 §5/§6 |
| Production secrets protected | `PASSED` — Vercel "Secret" type used for non-public credentials |

### Monitoring
| Item | Status |
|---|---|
| Runtime errors captured | `PASSED` (= 9.a) |
| Critical alerts configured | `NOT STARTED` (= 9.g, and cross-reference [[project-operational-alerting]] for this app's own alert routing, which is separate from Sentry's) |
| Failed deployments visible | `NOT STARTED` |
| Payment/integration failures observable | `NOT STARTED` — cross-reference document 1 §4 (reconciliation) |
| Logs contain sufficient diagnostic info without exposing sensitive data | `NOT STARTED` |

---

## 12 — Final assessment (the audit's own scorecard, re-scored)

| Category | Audit's original claim (28 Aug) | Current status | Notes |
|---|---|---|---|
| Production infrastructure | ACTIVE | `PASSED` | Unchanged, still true. |
| Domain | REGISTERED | `PASSED` | Unchanged. |
| DNS | PROPAGATING | `PASSED` | Now fully propagated and verified, was mid-propagation when audited. |
| Payment/financial integration | UNDER ONBOARDING/FINALIZATION | `BLOCKED` | Unchanged — see [[project-netcash-critical-path]]; Netcash is actively vetting, NASASA still silent. Not this tracker's job to resolve, only to track. |
| Environment configuration | INCOMPLETE | `NEEDS FIX` | Email + Sentry + SMS all done now. What's left is go-live-only: 7 `requiredWhenLive` vars (Netcash × 4, `NEXTAUTH_URL`, `ADMIN_WHATSAPP_NUMBER`, `SUPPORT_EMAIL`) are completely unset — real blocker for flipping `DEPLOY_ENV=production`, not urgent while staying on `DEPLOY_ENV=staging`. |
| Performance branches | UNSTABLE | `MOOT` | Neither branch exists. |
| Security hotfix | PATCHED — REQUIRES VERIFICATION | `PASSED` | Fully verified this session, all 8 sub-items, plus a proven-working regression test added so it can't silently regress. |
| Monitoring | INCOMPLETE | `IN PROGRESS` | Capturing works; alerting rules and the "no sensitive data in logs" check not yet done. |

**Overall: still not fully production-ready**, same conclusion as the
original audit — but the reasons have moved again. The domain/DNS/deployment
picture is solid, and BulkSMS is now genuinely configured and working (not
just "account created" — proven past credential validation with a real
send). What's actually left: the registrar verification (§2.2, urgent),
Netcash's own vetting (external, out of this tracker's control,
[[project-netcash-critical-path]]), the 7 missing go-live env vars above
(needed before `DEPLOY_ENV=production` can be flipped), a BulkSMS credit
top-up before the 115-row SMS backlog can be retried, and a handful of
individually-unverified checklist items that are cheap to close once picked
up.
