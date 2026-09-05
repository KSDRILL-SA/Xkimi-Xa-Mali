# 2 — Platform & Architecture Audit Report

> [!WARNING]
> **Superseded on the `DEPLOY_ENV` question.** This document describes a
> deployment whose live-ness was decided by a hand-set `DEPLOY_ENV`, with
> `requiredWhenLive` checks inert while it read `staging`. That is no longer how
> it works: `VERCEL_ENV === "production"` is now checked **first and
> unconditionally**, a declaration can tighten but never loosen, and the
> `requiredWhenLive` vars are enforced because the platform says this is
> production. There is nothing to flip. See `DEPLOYMENT.md` §2.
>
> Kept as the dated record it is, rather than rewritten — the findings below
> were true when they were made, and the reasoning is still worth reading.

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
| 3.g | No unexpected redirects | `PASSED` (found and fixed a real one) | `curl -I` against every domain/subdomain found `admin.xkimixamali.co.za` issuing a server-side 307 to the raw `xkimi-xa-mali-admin.vercel.app` login URL, with the `authjs` cookies scoped to that vercel.app host — meaning a user who followed it and logged in there would come back to the custom domain without a working session (cookie set on the wrong host). Root cause: the admin project's `NEXTAUTH_URL` was set to the vercel.app URL from before the custom domain was attached, never updated. Fixed via the Vercel dashboard (value is write-only once saved as Secret, so the wrong value couldn't be read — only overwritten with the objectively correct one, `https://admin.xkimixamali.co.za`), redeployed, and reverified: the redirect is now a same-domain relative path and the callback-url cookie correctly reads `https://admin.xkimixamali.co.za`. `xkimixamali.co.za`, `www.`, and `member.` all had clean redirect behavior already (HTTP→HTTPS only). | 2026-08-29 |
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
| 6.e | `userSuppliedId` within BulkSMS's 20-char limit | `PASSED` — fixed, deployed, and confirmed working live | The controlled test send initially failed with `BulkSMS 400: Validation error: items[0].userSuppliedId size must be between 1 and 20` — this system's Prisma cuid notification ids are 25 characters. Fixed in `apps/web/services/notification.service.ts` with a deterministic SHA-256-hash-based 20-char id (`shortSuppliedId`), not truncation (cuids share a timestamp-ish prefix, so truncating risks more collisions than hashing). Proved via revert, restored, shipped in PR #424. A follow-up regression in the delivery-*receipt* webhook (matching on the wrong value) was found and fixed separately in PR #429. Confirmed live: the controlled test row (`cmte4f48o0006ib045r783zg1`) shows `status=SENT` in production. | 2026-08-29 |
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
| 9.d | Sensitive information not unnecessarily transmitted | `PASSED` | `sendDefaultPii` is never set to `true` anywhere in any of the 6 Sentry init calls (checked via grep across both apps) — on `@sentry/nextjs` v10 (pinned in both `package.json`s), that default (`false`) means IP addresses and sensitive request headers (`Authorization`, `Cookie`) are not attached to events in the first place. `beforeSend` additionally strips `event.request.cookies` explicitly in every config, as defense in depth on top of the SDK default rather than instead of it. |
| 9.e | Production environment correctly identified | `PASSED` (found and fixed a real gap) | Found: all 4 server/edge Sentry configs (`web` and `admin`, server + edge) tagged `environment: process.env.NODE_ENV` — the same class of bug as the `DEPLOY_ENV`/`isLiveDeployment()` gap already central to this session's work, since Next sets `NODE_ENV=production` for every optimised build, preview deploys included. A preview deployment's errors would show up in Sentry labelled "production," indistinguishable from a real incident. Fixed by adding `deploymentEnvironmentName()` to `packages/utils/src/deployment.ts` (same `DEPLOY_ENV ?? VERCEL_ENV ?? NODE_ENV` resolution order as `isLiveDeployment`, but returns the actual string for tagging rather than collapsing to a boolean) and wiring it into all 4 server/edge configs. **Deliberately left unfixed:** the 2 client-side configs (`instrumentation-client.ts`) still tag `NODE_ENV`, because `DEPLOY_ENV`/`VERCEL_ENV` are server-only — the browser bundle never sees them — and fixing that properly needs a new `NEXT_PUBLIC_DEPLOY_ENV` var, which is a real (if small) infra change, not something to add silently as a side effect of this fix. | 2026-08-29 |
| 9.f | Source maps/configuration handled appropriately | `NOT STARTED` | `SENTRY_AUTH_TOKEN` (source-map upload) was deliberately **not** set — creating a Sentry API token wasn't attempted. Monitoring works without it; stack traces just won't be de-minified. Worth deciding deliberately, not by default. |
| 9.g | Alerts configured for critical failures | `NOT STARTED` | Distinct from this app's own operational alerting (`ALERT_FALLBACK_EMAIL`, [[project-operational-alerting]]) — this row is specifically about Sentry's own alert rules. |

---

## 9.5 — HTML injection in email templates (not in the source audit — found this pass)

| # | Item | Status | Evidence / Notes |
|---|---|---|---|
| a | Email templates escape user-controlled values | `PASSED` (found and fixed a real vulnerability) | Every named email function in `lib/email.ts` (verification, password reset, welcome, payment success/failed, invite, overdue reminder — 6 functions) interpolated a member's own `firstName` directly into a hand-written HTML template literal with **zero escaping**: `` `<h1>Welcome, ${firstName}!</h1>` ``. `firstName`'s validation schema only enforces `.min(2).max(50)` — no character restriction. A member setting their own first name to `<img src=x onerror=...>` would have that rendered raw in every email sent to them (welcome, payment confirmations, overdue reminders), a stored HTML-injection hole reachable through ordinary self-registration, no admin or compromise required. The same unescaped pattern existed in `admin.service.ts`'s broadcast function (both the recipient's `firstName` *and* the admin-composed message body) and in `notification.service.ts`'s generic-template fallback path (`interpolate(body, payload)` wrapped straight in a `<div>`). A correct `escapeHtml()` already existed, privately, in `alert.service.ts` — written for operational alerts, never applied anywhere a person's own input reaches an email. Fixed: extracted the existing implementation to `packages/utils/src/html.ts` (shared, single source of truth — `alert.service.ts` now imports it too instead of keeping a private copy), applied it to every `firstName` interpolation in `lib/email.ts` (subject lines deliberately left unescaped — plain text, not HTML, escaping there would show literal `&amp;` in a real ampersand name), to `admin.service.ts`'s broadcast, and added `interpolateHtml()` (an HTML-escaping variant of the existing `interpolate()`, kept separate because the same function also serves the SMS path, where escaping would incorrectly mangle plain text) to `notification.service.ts`. 8 new tests in a dedicated `email-html-escaping.test.ts` plus 2 more in the existing admin/notification test files — proved via revert on `lib/email.ts`: reverted `safeName` back to raw `firstName`, watched 7/8 tests fail (the subject-line test correctly still passed), restored, full suite clean (96 files, 1214 tests), typecheck clean across all 3 apps. | 2026-08-29 |

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
| Domain redirects verified | `PASSED` (= 3.g) — found and fixed a real bug: admin login was bouncing to the raw vercel.app URL |

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
| Secrets not committed to Git | `PASSED` | `git log --all -p` scan of every `.env*` file in the repo's full history, plus a targeted scan for real-credential shapes (Resend `re_`, Stripe-style `sk_`, AWS `AKIA`, and `postgres://user:pass@` connection strings) across all history, not just `.env` files. Every hit is a placeholder (`ADMIN_API_SECRET=` with no value, `NETCASH_WEBHOOK_SECRET: 'webhook-secret'`/`'test-webhook-secret-do-not-use-in-prod'`, `DATABASE_URL: postgresql://xxm:xxm_test@...`) or a Zod schema definition (`requiredWhenLive(z.string().min(1))`) — never a real value. |
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
| Failed deployments visible | `PASSED` | Directly observed, not assumed, across every PR merged this session (#424, #425): Vercel's GitHub integration posts a per-project deployment check (`Vercel – xkimi-xa-mali-web/admin/website`) onto the PR itself, distinct from the CI `Type Check, Lint & Test` job, and the project dashboard's deployment list/status is what `mcp__claude_ai_Vercel__get_project` and the deployment detail pages surfaced throughout this session's redeploys — a failed build shows `readyState: ERROR` in exactly that same place. |
| Payment/integration failures observable | `NOT STARTED` — cross-reference document 1 §4 (reconciliation) |
| Logs contain sufficient diagnostic info without exposing sensitive data | `PASSED` | Grepped every `logger.*` call across `apps/web`, `apps/admin`, and `packages` for whole-object dumps, spread patterns, and sensitive field names (password/token/secret/PIN/CVV/card/account). Every hit logs safe metadata only — ids, event names, Zod issue objects, Netcash's own fault code/reason, field *names* changed (`Object.keys(input)`) never their values. The Netcash webhook payload schema itself (`mandateId`/`transactionRef`/`status`/`reason`/`amount`/`processedAt`) carries no raw banking details to begin with, and the SOAP client logs only `method`/`faultCode`/`reason` — never a raw request/response body. |

---

## 12 — Final assessment (the audit's own scorecard, re-scored)

| Category | Audit's original claim (28 Aug) | Current status | Notes |
|---|---|---|---|
| Production infrastructure | ACTIVE | `PASSED` | Unchanged, still true. |
| Domain | REGISTERED | `PASSED` | Unchanged. |
| DNS | PROPAGATING | `PASSED` | Now fully propagated and verified, was mid-propagation when audited. |
| Payment/financial integration | UNDER ONBOARDING/FINALIZATION | `BLOCKED` | **UPDATE 2026-08-29:** the Netcash registration form itself is now submitted (owner completed it after a full section-by-section review caught and fixed 2 real errors — a postal-city typo and the bank dropdown stuck on "Other" instead of "Capitec Business"). Netcash confirmed receipt by email same day. Vetting is now entirely on their side — see [[project-netcash-critical-path]]; NASASA still silent. Not this tracker's job to resolve, only to track. |
| Environment configuration | INCOMPLETE | `NEEDS FIX` | Email + Sentry + SMS all done now. **UPDATE 2026-08-29:** 3 of the 7 `requiredWhenLive` vars are now set on `xkimi-xa-mali-web` (`NEXTAUTH_URL=https://member.xkimixamali.co.za`, `ADMIN_WHATSAPP_NUMBER=27810780859`, `SUPPORT_EMAIL=xkimxamali@gmail.com`) — all had known-correct values already established elsewhere in the project, they just hadn't been set on this specific Vercel project. Redeployed and confirmed live. **Still genuinely unset**: the 4 Netcash-specific vars (`NETCASH_SERVICE_KEY`, `NETCASH_API_URL`, `NETCASH_WEBHOOK_SECRET`, `NETCASH_DEBICHECK_TEMPLATE_ID`) — these only exist once Netcash's onboarding issues them, not something fillable from memory. Real blocker for flipping `DEPLOY_ENV=production` remains, not urgent while staying on `DEPLOY_ENV=staging`. **UPDATE 2026-09-01:** the `SUPPORT_EMAIL` value set above was itself wrong — `xkimxamali@gmail.com` is missing the second `i`; the owner confirmed the real mailbox is `xkimixamali@gmail.com`. It had been live on both `xkimi-xa-mali-web`'s `SUPPORT_EMAIL` and `xkimi-xa-mali-website`'s `NEXT_PUBLIC_SUPPORT_EMAIL`, meaning the public "contact support" mailto: link was pointing at a nonexistent address. Both corrected (re-created as Config type — both had drifted to or been created as Secret, which cannot be edited in place, so `rm`+`add --type config` was required), `.env.example`, `DEPLOYMENT.md` and a test fixture fixed to match, and `xkimi-xa-mali-website` redeployed so the corrected `NEXT_PUBLIC_*` value is actually baked into the build. `docs/session-handoff.md` also carries this same typo in three places; that file is a frozen historical record per its own header and was deliberately left alone rather than edited. |
| Performance branches | UNSTABLE | `MOOT` | Neither branch exists. |
| Security hotfix | PATCHED — REQUIRES VERIFICATION | `PASSED` | Fully verified this session, all 8 sub-items, plus a proven-working regression test added so it can't silently regress. |
| Monitoring | INCOMPLETE | `IN PROGRESS` | Capturing works; alerting rules and the "no sensitive data in logs" check not yet done. |

**Overall: still not fully production-ready**, same conclusion as the
original audit — but the reasons have moved again, and moved further this
close-of-session (2026-08-29 night). The domain/DNS/deployment picture is
solid, BulkSMS is genuinely configured and working (not just "account
created" — proven past credential validation with a real send), the Netcash
registration form is **submitted** (vetting now on their side, nothing left
to do here), and 3 of the 7 go-live env vars are now set and live. A **full
system integration sweep** (all 3 apps' health endpoints, deployment status,
CI, Sentry, login pages, and a role-separation/data-isolation code audit)
found nothing broken and nothing regressed by any of this session's changes
— see the "Final integration sweep, 2026-08-29" note below. What's actually
left: the registrar verification (§2.2, urgent), Netcash's own vetting
(external, out of this tracker's control, [[project-netcash-critical-path]]),
the 4 remaining Netcash-issued env vars (can't be filled until Netcash
approves the account), a BulkSMS credit top-up before the 115-row SMS
backlog can be retried, and a handful of individually-unverified checklist
items that are cheap to close once picked up.

### Final integration sweep, 2026-08-29 — everything healthy

Ran a full cross-app health check after the env var and Netcash-form work
above, specifically to confirm nothing broke before closing out the session:

- **All 3 production domains**: `member.xkimixamali.co.za` (200,
  `/api/v1/health` → `db/redis/jobs: ok`), `admin.xkimixamali.co.za`
  (unauthenticated root correctly redirects same-domain to `/login`, not the
  old stale `vercel.app` URL), `xkimixamali.co.za` + `www` (200). Login
  pages for both member and admin apps visually confirmed rendering
  correctly.
- **All 3 Vercel projects' latest production deployments**: `READY`
  (checked via the Vercel API directly — the deployments-list UI page has a
  known rendering bug in this session, documented in
  [[project-deployment-phase]], don't fight it, use the API).
- **CI on `main`**: green, last 5 runs all `success`. Working tree clean,
  no uncommitted changes.
- **Sentry**: 3 unresolved issues surfaced in the last 24h, all confirmed
  historical rather than ongoing — a Resend rate-limit spike from the
  morning's notification-recovery run (single burst, flat since) and a
  "BulkSMS credentials not configured" error whose last occurrence (13h ago)
  predates the BulkSMS credential fix (10h ago) landing. All 3 resolved in
  Sentry.
- **Role separation & member data isolation** (owner explicitly asked for
  this check before calling the session done): verified directly in code,
  not just re-cited from a prior audit. `apps/admin/lib/auth.ts`'s
  `authorize()` explicitly rejects a correct password on a non-ADMIN account
  before any session is issued — a member cannot sign into the admin
  console. `apps/admin/lib/admin-action.ts`'s `requireAdmin()` re-checks the
  ADMIN role against the live database on every single admin server action,
  independent of the session token, so a revoked admin role takes effect
  immediately. An admin *can* sign into the member app — by design, since
  the founder/admin is also a stokvel member, not a separate account.
  Member-to-member data isolation runs through one centralized
  `assertCanAccess(targetUserId, requesterId, requesterRoles)` in
  `apps/web/lib/authorization.ts`, traced through every member-facing
  service (profile, contributions, bank accounts, statement PDFs, exports)
  — a member requesting another member's `id` gets a 403. Matches and
  reconfirms document 1 §6's existing "20/20 member `:id` routes scope to
  session user" finding, now re-verified against current code rather than
  just cited.
