# Deployment & Launch Runbook — Xkimi Xa Mali Foundation

A practical go-live guide for the three apps. What's left is **config, infra, and
external integrations** — work through this in order.

> [!NOTE]
> **Build status, 2026-08-07: green.** `npm run build` exits 0 for all three
> apps; `typecheck`, `lint` and `test` (800) also pass. The admin app had been failing
> since the move to Next 16 — an `@import` placed after the `@tailwind`
> directives, which Turbopack rejects — and this page's older claim of
> "production-build verified (web 75/75, admin 19/19, website 8/8)" had been
> false for that whole period. Per-app page counts are deliberately not restored
> here: they go stale silently, and a number nobody re-checks is what caused the
> problem the first time.
>
> **Two things are still not clear before deploying:**
> - `npm ls` exits 1 and one high-severity advisory (`js-yaml`) is open. The
>   cause is not a version mismatch — the `overrides` block is inert. Fix recipe
>   in [`ENGINEERING_WORKFLOW.md`](./ENGINEERING_WORKFLOW.md) §4.4.
> - CI is not executing at all (§8 below — Actions minutes exhausted), so nothing
>   is verifying any of this except a local run.

> **Coming back to this project?** Start with
> [`docs/completion-guide.md`](./docs/completion-guide.md) — where the system
> stands, everything still outstanding, and where deployment begins and ends.
>
> **Setting up the environments for the first time?** Then
> [`docs/environment-setup-plan.md`](./docs/environment-setup-plan.md) — which
> accounts to open, in what order, what has lead time, and which secrets must
> match each other. Come back here once they exist.

---

## 0. Launch posture

This is a **real-money** platform (Netcash DebiCheck). Do **not** point it at
the live Netcash gateway until you have completed a full dry-run in Netcash
**test mode** (section 6). The safe sequence is:

> staging on test gateway → dry-run the full money flow → switch to live keys → soft launch with the 4 founders → monitor → open to members.

---

## 1. Vercel projects (3)

Create one Vercel project per app, all from this monorepo:

| App | Root directory | Port (dev) | Domain |
|-----|----------------|------------|--------|
| Member portal | `apps/web` | 3000 | `app.<your-domain>` |
| Admin | `apps/admin` | 3002 | `admin.<your-domain>` |
| Marketing | `apps/website` | 3001 | `<your-domain>` |

- Framework preset: **Next.js**. Build command: default (`next build`).
- Install command: `npm ci` at the repo root (monorepo).
- Each project needs its **own** env vars (below).

## 2. Environment variables (production)

Source of truth: [`.env.example`](.env.example). Set these per Vercel project.
**Critical / easy-to-get-wrong:**

| Var | Notes |
|-----|-------|
| `DATABASE_URL` | Neon **production** branch, pooled connection string. |
| `AUTH_SECRET` | 32+ chars, unique per environment. Set on **web + admin**. |
| `ENCRYPTION_KEY` | **64 hex chars. Never edit this value on its own** — it decrypts stored bank/ID numbers, and replacing it alone makes all of them unreadable. To change it, follow [Rotating the encryption key](docs/runbook.md#rotating-the-encryption-key): add the new key alongside the old, re-encrypt, then retire the old. |
| `ENCRYPTION_KEY_ID` / `ENCRYPTION_PREVIOUS_KEYS` | Only set while rotating. Unset behaves as it always has (key id `1`, no previous keys). |
| `ADMIN_API_SECRET` | 32+ chars. Must be **identical** on web + admin (admin→web internal calls). |
| `ALERT_FALLBACK_EMAIL` | Standing address for critical alerts, independent of any account. **Set this** — with a single admin, every other alert channel depends on one person's account being active and one worker being alive. See [the runbook](docs/runbook.md#what-reaches-you-without-you-looking). |
| `SUPPORT_EMAIL` · `NEXT_PUBLIC_SUPPORT_EMAIL` | The Foundation's contact address, shown to members on the support page and in the marketing site footer. **The two must match.** The public one is inlined at build time, so setting it after a deploy does nothing. |
| `WEB_INTERNAL_URL` | (admin) the web app's prod URL, e.g. `https://app.<your-domain>`. |
| `NEXTAUTH_URL` | each app's own prod URL. |
| `NETCASH_SERVICE_KEY` | **production** service key. Real-gateway selection now refuses to start without it, independent of `DEPLOY_ENV` (see the warning below) — no silent start. |
| `NETCASH_WEBHOOK_SECRET` | production webhook signing secret. Without it every callback fails its signature check, so debits collect and nothing records them. **This one is still gated on `DEPLOY_ENV=production`** — see below. |
| `NETCASH_API_URL` | The **production** Netcash URL. It no longer defaults to the test gateway. **Also gated on `DEPLOY_ENV=production`.** |
| `BULKSMS_USERNAME` / `_PASSWORD` | live SMS sending. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | verified sending domain. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | prod Redis (rate-limit + cache). |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (PDF statements / signatures). |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | prod Inngest app. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | error monitoring. |
| `WHATSAPP_GROUP_LINK` / `NEXT_PUBLIC_WHATSAPP_GROUP_LINK` | the group invite link. |
| `TRUSTED_PROXY` | `vercel` unless a CDN/WAF is genuinely in front. Decides which forwarded-IP header is believed — get it wrong and per-IP rate limiting can be bypassed by sending the header yourself. |
| `NEXT_PUBLIC_GROUP_ACCOUNT_NAME` · `_BANK_NAME` · `_BANK_ACCOUNT` · `_BANK_BRANCH` | **The account members are told to pay into.** See below — these are banking details, not settings. |

**The Foundation's operational mailbox is `xkimixamali@gmail.com`.** Use it for
`SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_EMAIL` and `ALERT_FALLBACK_EMAIL` — all
three are addresses that *receive*.

> [!WARNING]
> **It cannot be `RESEND_FROM_EMAIL`.** Resend only sends from a domain you have
> verified, and nobody can verify `gmail.com`. That one must be
> `noreply@<your-domain>` once the domain is registered.
>
> **A live build now refuses to start on one**, naming the reason — so this is
> caught at deploy rather than on the first send. It previously failed at neither:
> Resend rejected each send at run time and every notification stopped while the
> app reported itself perfectly healthy.

> [!IMPORTANT]
> **What decides whether this deployment is "live".** `isLiveDeployment()` in
> `@xxm/utils` asks, in order:
>
> 1. `VERCEL_ENV === "production"` — **first, and unconditional.** Vercel sets
>    it itself, and only for the deployment serving the production domain.
> 2. `DEPLOY_ENV`, declared by hand. It can make a deployment *stricter* (claim
>    live on a preview, to rehearse production rules) and can no longer make one
>    looser.
> 3. `VERCEL_ENV` for anything else, then `NODE_ENV` off Vercel.
>
> A declaration may tighten what the platform says. It must never loosen it, and
> `packages/utils/__tests__/deployment.test.ts` pins that across every value.
>
> **This paragraph used to say the opposite**, and the earlier order was not
> hypothetical. `DEPLOY_ENV` was read first and short-circuited, production had
> it set to a non-live value, so `isLiveDeployment()` returned false, so the
> guard refusing the mock gateway on a live deployment never fired. The mock was
> selected in production and answered SUCCESS to every debit: a member paid R100,
> a settled transaction was written, the pool was credited and the contribution
> marked paid, and no bank was ever contacted.
>
> So there is **nothing to set before going live**, and no list of checks that
> are silently unenforced. The env vars marked `requiredWhenLive` are enforced
> because the platform says this is production, whatever anybody declares.

> [!NOTE]
> **There is no payment gateway.** The DebiCheck application was declined. A
> live deployment with no real gateway selects `disabledGateway`
> (`apps/web/integrations/payment/index.ts`): every money operation refuses, the
> member-facing payment paths switch themselves off, and the rest of the app —
> statements, invitations, the community board, the console — runs normally.
>
> Refusing the operation rather than refusing to boot is deliberate. A live
> deployment holding `PAYMENT_GATEWAY=mock` and no Netcash credentials would
> otherwise fail to start, taking down everything for the sake of a feature
> deliberately not in use.
>
> Money is recorded the way it is actually received: cash and EFT, entered by an
> admin in the console.

### The group collection account

Because there is no gateway, **members pay by transfer into an account whose
details the app shows them**. Those details come from four variables:

| Var | Default in code |
|-----|-----------------|
| `NEXT_PUBLIC_GROUP_ACCOUNT_NAME` | `Xkimi Xa Mali Foundation` |
| `NEXT_PUBLIC_GROUP_BANK_NAME` | `ABSA Bank` |
| `NEXT_PUBLIC_GROUP_BANK_ACCOUNT` | `9385143164` |
| `NEXT_PUBLIC_GROUP_BANK_BRANCH` | `632005` |

> [!IMPORTANT]
> **None of the four is set in Vercel today.** The app therefore serves the code
> defaults above, which is why nobody noticed they were undocumented — it works.
> Two consequences follow, and both matter:
>
> 1. **Changing the account currently means changing code and deploying**, not
>    editing configuration. Setting the variables is what buys the ability to
>    change banking details without a release.
> 2. **They are inlined at build time**, like every `NEXT_PUBLIC_*` value. Set
>    them and then *redeploy* — setting them alone changes nothing that a member
>    sees.
>
> Change all four together. A holder name from one bank next to an account
> number from another is worse than either alone, and this is the one screen
> where a member acts on what it says by sending money.
>
> **Constitution clause 6.1 names the account that holds contributions.** As
> signed on 2026-08-24 it names the Capitec account of KSDRILL SA (Pty) Ltd, not
> the ABSA account above. The amendment reconciling the two is drafted in
> [`docs/compliance/resolution-2026-09-banking.md`](docs/compliance/resolution-2026-09-banking.md)
> and needs signatures. Until it is signed, the app and the constitution
> disagree — knowingly, and recorded in both places.

`NEXT_PUBLIC_NETCASH_FEE_BUFFER` (default `10`) is the amount added on top of a
contribution to cover a collections provider's fee. It is dormant with no
gateway, but it is quoted in the Founder Guide and registered as part of the
mandate instalment, so it is not a value to zero out casually.

## 3. Database (Neon, production)

```bash
# from packages/database, with prod DATABASE_URL *and* DIRECT_DATABASE_URL exported
# (migrations run over the unpooled endpoint — see .env.example)
npx prisma migrate deploy   # applies every migration in packages/database/prisma/migrations
npm run db:seed             # roles + founder accounts
```

- After seeding, confirm the **founder admins** exist as `ACTIVE` with the
  `ADMIN` role and known passwords (members log in to admin only if `ADMIN`).
- The Prisma client is generated normally during the Vercel build — **never use
  `--no-engine`** (it builds an Accelerate-only client and every query 500s).

## 4. Inngest (durable jobs)

- Register the prod app's serve endpoint with Inngest cloud:
  `https://app.<your-domain>/api/v1/webhooks/inngest`
- Set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`. Without this, the cron jobs
  **do not fire**: debit runs, ledger + contribution reconciliation, badge
  recalc, **financial anomaly watch**, **monthly statement notice**, invite
  expiry, etc.

## 5. Netcash DebiCheck (the money gate)

0. **Nothing to set first.** This step used to say to set
   `DEPLOY_ENV=production` before anything here, because the checks below were
   silently inert without it. They no longer are — the platform decides, see the
   note under §2. Left in place rather than deleted, because an operator working
   from an older copy of this file will look for it.
1. Obtain **production** service key + webhook secret from Netcash.
2. Register the webhook URL: `https://app.<your-domain>/api/v1/webhooks/netcash`.
3. Confirm Netcash's source IPs match the app's IP allowlist (the webhook
   verifies signature **and** IP) — set `NETCASH_WEBHOOK_IPS` if Netcash's
   real range differs from the built-in default in `lib/netcash.ts`; this has
   **not been confirmed with Netcash yet** as of this writing.
4. Set `NETCASH_API_URL` to the **production** endpoint.
5. The webhook is **idempotent** (dedupe table) — safe against redelivery.
6. Remove or change `PAYMENT_GATEWAY=mock` **last**, only once 0–5 are done.
   The app refuses to start if the real gateway is selected with no
   `NETCASH_SERVICE_KEY`, but nothing currently stops you from doing this
   step out of order and getting a build that succeeds without actually
   being ready — the checks above are what make it ready, not this switch.

## 6. Pre-launch dry run (test mode)

Run the full flow on a staging deploy pointed at Netcash **test** mode:

- [ ] Admin logs in; member registers via invite code.
- [ ] Member adds a bank account; creates a mandate; admin approves it.
- [ ] Generate the month's contributions; submit a test debit.
- [ ] Netcash webhook flips the transaction → contribution status updates →
      **ledger CREDIT** posted → pool balance correct (`GET /api/v1/admin/ledger`).
- [ ] SMS + email deliver; the member's **inbox** shows the right messages.
- [ ] PDF statement downloads (admin Reports + member Statements).
- [ ] Reverse a transaction → ledger DEBIT posts → balance reconciles.

## 7. Post-deploy smoke test (production)

- [ ] All 3 domains serve (200 / expected redirects).
- [ ] `GET /api/v1/health` → 200; `GET /api/v1/stats/public` → 200 with data.
- [ ] Admin login works; member login works.
- [ ] Sentry receives a test error; logs are flowing.

## 8. Known limitations (today)

- **CI is not running**: GitHub Actions minutes are exhausted on the private
  repo (free tier). The workflow itself is fixed and ready; it'll go green once
  minutes are restored (GitHub Pro raises the cap and also unlocks branch
  protection). Until then, rely on the local `typecheck`/`lint`/`test`/`build`
  before deploying.
- **Branch protection** is paywalled for private repos (needs GitHub Pro). Once
  on Pro, enable "require status checks" so nothing merges without green CI.

## 9. Rollback

Vercel keeps immutable deployments — **promote the previous deployment** to roll
back instantly. DB migrations are additive (new tables/columns), so a code
rollback is safe without a schema rollback.
