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

**The Foundation's operational mailbox is `xkimxamali@gmail.com`.** Use it for
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

> [!WARNING]
> **Every "build fails without it" claim in this document depends on `DEPLOY_ENV`
> actually being set to `production`.** `apps/web/lib/env.ts`'s `isLiveDeployment()`
> checks `DEPLOY_ENV` first, `VERCEL_ENV` second, `NODE_ENV` last — and this
> project's real production Vercel deployment currently has **`DEPLOY_ENV=staging`**
> set deliberately, from when infra was still being wired up. That means, as of
> writing, **none** of `NETCASH_WEBHOOK_SECRET`, `NETCASH_API_URL`,
> `NETCASH_DEBICHECK_TEMPLATE_ID`, `BULKSMS_USERNAME`/`_PASSWORD`, `RESEND_API_KEY`,
> or the `RESEND_FROM_EMAIL` verified-domain check are actually enforced on the
> live URL, whatever this document says elsewhere — the app would boot and serve
> traffic with any of them missing.
>
> One of these (the real Netcash gateway getting selected with no
> `NETCASH_SERVICE_KEY` at all) is now closed a different way —
> `integrations/payment/index.ts` checks for that credential directly, independent
> of `DEPLOY_ENV` — because that specific gap could otherwise go unnoticed until an
> actual debit attempt. **The rest are not.** Before flipping `PAYMENT_GATEWAY` away
> from `mock` for real: set `DEPLOY_ENV=production` on `xkimi-xa-mali-web` **first**
> (or in the same change), confirm the build actually succeeds with it set — a
> failure there is exactly this list catching something still missing — and only
> then remove the mock override. Doing it in the other order does not fail loudly;
> it just quietly does nothing.

## 3. Database (Neon, production)

```bash
# from packages/database, with prod DATABASE_URL *and* DIRECT_DATABASE_URL exported
# (migrations run over the unpooled endpoint — see .env.example)
npx prisma migrate deploy   # applies ALL 37 migrations (incl. ledger, inbox, webhook-dedupe, goal engagement, pledges, member distinctions)
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

0. **Set `DEPLOY_ENV=production` on `xkimi-xa-mali-web`, before or together
   with the rest of this section — see the warning under §2.** Everything
   below assumes it's set; without it, several of these checks are silently
   inert rather than enforced.
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
